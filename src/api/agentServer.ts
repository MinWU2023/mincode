import type { AgentServerConfig } from '@/types';

export interface ApiEnvelope<T = unknown> {
  ok?: boolean;
  message?: string;
  data?: T;
  code?: number;
  msg?: string;
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.replace(/^\/+/, '');
  return `${b}/${p}`;
}

function headers(cfg: AgentServerConfig, extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/json',
    ...extra,
  };
  if (cfg.csrf) {
    h['X-CSRF-Token'] = cfg.csrf;
  }
  if (cfg.sessionCookie) {
    h.Cookie = cfg.sessionCookie;
  }
  return h;
}

/** 登录 agent 站点（若配置了访问密码） */
export async function agentLogin(
  cfg: AgentServerConfig,
  password: string,
): Promise<AgentServerConfig> {
  const res = await fetch(joinUrl(cfg.baseUrl, 'api/auth.php'), {
    method: 'POST',
    headers: headers(cfg, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ password, _csrf: cfg.csrf || '' }),
    credentials: 'include',
  });
  const json = (await res.json()) as ApiEnvelope<{ csrf?: string }>;
  if (!json.ok) {
    throw new Error(json.message || '登录失败');
  }
  return { ...cfg, accessPassword: password, csrf: json.data?.csrf || cfg.csrf };
}

/** 拉取 Agent / 模型配置（对齐 agent index.php BOOT） */
export async function fetchAgentBoot(cfg: AgentServerConfig): Promise<Record<string, unknown>> {
  const res = await fetch(joinUrl(cfg.baseUrl, 'index.php'), {
    headers: headers(cfg),
    credentials: 'include',
  });
  const html = await res.text();
  const m = html.match(/window\.__BOOT__\s*=\s*(\{[\s\S]*?\});/);
  if (!m) {
    throw new Error('无法解析 Agent 配置，请检查 baseUrl');
  }
  return JSON.parse(m[1]) as Record<string, unknown>;
}

/** 探测 agent 站点是否可达 */
export async function testAgentConnection(cfg: AgentServerConfig): Promise<string> {
  const res = await fetch(joinUrl(cfg.baseUrl, 'api/chat.php?ping=1'), {
    headers: headers(cfg),
    credentials: 'include',
  });
  const json = (await res.json()) as ApiEnvelope;
  if (!json.ok) {
    throw new Error(json.message || '连接失败');
  }
  return json.message || 'ok';
}

/** 经 agent relay 转发模型请求（对齐 relay.php） */
export async function relayRequest(
  cfg: AgentServerConfig,
  path: string,
  method: 'GET' | 'POST',
  payload: Record<string, unknown> = {},
  idempotency = '',
): Promise<unknown> {
  const pipeNames = ['api/x.php', 'api/p.php', 'api/relay.php'];
  let lastErr = '转发失败';

  for (const pipe of pipeNames) {
    try {
      const res = await fetch(joinUrl(cfg.baseUrl, pipe), {
        method: 'POST',
        headers: headers(cfg, { 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({
          path: path.replace(/^\/+/, ''),
          method,
          payload,
          idempotency,
          _csrf: cfg.csrf || '',
        }),
      });
      const json = (await res.json()) as ApiEnvelope<{ status: number; data: unknown }>;
      if (!json.ok) {
        lastErr = json.message || lastErr;
        continue;
      }
      const pd = json.data;
      if (pd && typeof pd === 'object' && 'status' in pd && (pd as { status: number }).status >= 400) {
        throw new Error(`上游 HTTP ${(pd as { status: number }).status}`);
      }
      if (pd && typeof pd === 'object' && 'data' in pd) {
        return (pd as { data: unknown }).data;
      }
      return pd;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(lastErr);
}

/** 解析 relay SSE 流式响应 */
async function parseRelaySse(
  resp: Response,
  onDelta: (content: string, reasoning: string) => void,
): Promise<{
  content: string;
  reasoning: string;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  model?: string;
}> {
  const reader = resp.body?.getReader();
  if (!reader) {
    throw new Error('无法读取流式响应');
  }
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let reasoning = '';
  const callMap: Record<number, { id: string; name: string; arguments: string }> = {};

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload) as {
            choices?: Array<{
              delta?: {
                content?: string;
                reasoning_content?: string;
                tool_calls?: Array<{
                  index?: number;
                  id?: string;
                  function?: { name?: string; arguments?: string };
                }>;
              };
            }>;
            model?: string;
          };
          const delta = json.choices?.[0]?.delta;
          if (delta?.content) {
            content += delta.content;
            onDelta(content, reasoning);
          }
          if (delta?.reasoning_content) {
            reasoning += delta.reasoning_content;
            onDelta(content, reasoning);
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!callMap[idx]) callMap[idx] = { id: '', name: '', arguments: '' };
              if (tc.id) callMap[idx].id = tc.id;
              if (tc.function?.name) callMap[idx].name += tc.function.name;
              if (tc.function?.arguments) callMap[idx].arguments += tc.function.arguments;
            }
          }
        } catch {
          /* skip bad chunk */
        }
      }
    }
  }

  const tool_calls = Object.keys(callMap)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => ({
      id: callMap[Number(k)].id || `call_${k}`,
      function: { name: callMap[Number(k)].name, arguments: callMap[Number(k)].arguments || '{}' },
    }))
    .filter((tc) => tc.function.name);

  return {
    content,
    reasoning,
    tool_calls: tool_calls.length ? tool_calls : undefined,
  };
}

export interface ChatTurnResult {
  content: string;
  reasoning?: string;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  model?: string;
}

/** 流式单轮对话（经 relay.php stream 直通） */
export async function chatTurnStream(
  cfg: AgentServerConfig,
  messages: unknown[],
  tools: unknown[],
  opts: { model: string; max_tokens?: number; temperature?: number; tool_choice?: string },
  onDelta: (content: string, reasoning: string) => void,
): Promise<ChatTurnResult> {
  const payload = {
    model: opts.model,
    messages,
    tools: tools.length ? tools : undefined,
    tool_choice: opts.tool_choice,
    stream: true,
    max_tokens: opts.max_tokens ?? 8192,
    temperature: opts.temperature ?? 0.7,
  };

  const pipeNames = ['api/x.php', 'api/p.php', 'api/relay.php'];
  for (const pipe of pipeNames) {
    try {
      const res = await fetch(joinUrl(cfg.baseUrl, pipe), {
        method: 'POST',
        headers: headers(cfg, { 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({
          stream: true,
          path: 'chat/completions',
          method: 'POST',
          payload,
          _csrf: cfg.csrf || '',
        }),
      });
      const ct = (res.headers.get('Content-Type') || '').toLowerCase();
      if (ct.includes('text/event-stream') && res.ok) {
        return parseRelaySse(res, onDelta);
      }
    } catch {
      /* try next pipe */
    }
  }
  return chatTurn(cfg, messages, tools, opts);
}

/** 单轮对话 + 工具定义（移动端本地执行工具，只调模型） */
export async function chatTurn(
  cfg: AgentServerConfig,
  messages: unknown[],
  tools: unknown[],
  opts: { model: string; max_tokens?: number; temperature?: number; tool_choice?: string },
): Promise<ChatTurnResult> {
  const payload = {
    model: opts.model,
    messages,
    tools: tools.length ? tools : undefined,
    tool_choice: opts.tool_choice,
    stream: false,
    max_tokens: opts.max_tokens ?? 8192,
    temperature: opts.temperature ?? 0.7,
  };

  const data = (await relayRequest(cfg, 'chat/completions', 'POST', payload)) as {
    choices?: Array<{
      message?: {
        content?: string;
        reasoning_content?: string;
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
      };
    }>;
    model?: string;
  };

  const msg = data?.choices?.[0]?.message;
  return {
    content: msg?.content || '',
    reasoning: (msg as { reasoning_content?: string })?.reasoning_content,
    tool_calls: msg?.tool_calls,
    model: data?.model,
  };
}

/** OpenAI 兼容工具定义（与 agent lib/tools.php 一致） */
export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取项目内文本文件',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: '相对项目根的路径' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '写入或覆盖整个文件',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_replace',
      description: '局部替换文件内容',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old_string: { type: 'string' },
          new_string: { type: 'string' },
          replace_all: { type: 'boolean' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: '列出目录',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: '在项目中搜索文本',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          path: { type: 'string' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'glob',
      description: '按 glob 匹配文件',
      parameters: {
        type: 'object',
        properties: { glob_pattern: { type: 'string' } },
        required: ['glob_pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: '删除文件',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
];
