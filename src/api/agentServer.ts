import type { AgentServerConfig } from '@/types';
import type { AgentModelRow } from '@/stores/agentSettings';

export interface ApiEnvelope<T = unknown> {
  ok?: boolean;
  message?: string;
  data?: T;
  code?: number;
  msg?: string;
}

export function normalizeBaseUrl(base: string): string {
  let b = String(base || '').trim();
  if (!b) return '';
  if (!/^https?:\/\//i.test(b)) {
    b = `https://${b}`;
  }
  return b.replace(/\/+$/, '');
}

export function joinUrl(base: string, path: string): string {
  const b = normalizeBaseUrl(base);
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

function fetchErrorHint(url: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    const isHttp = /^http:\/\//i.test(url);
    return (
      `网络请求失败（Failed to fetch）。\n` +
      `· 检查 Agent 站点 URL 是否正确、手机能否访问该域名\n` +
      (isHttp ? `· 当前为 http 地址，请确认已允许明文流量（App 已开启）\n` : '') +
      `· 若为自签 HTTPS，Android 可能拦截证书\n` +
      `· 可先浏览器打开：${url}`
    );
  }
  return msg;
}

async function agentFetch(
  cfg: AgentServerConfig,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = joinUrl(cfg.baseUrl, path);
  try {
    const res = await fetch(url, {
      ...init,
      headers: headers(cfg, (init.headers as Record<string, string>) || {}),
      credentials: 'include',
    });
    return res;
  } catch (e) {
    throw new Error(fetchErrorHint(url, e));
  }
}

async function parseJson<T>(res: Response): Promise<ApiEnvelope<T>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as ApiEnvelope<T>;
  } catch {
    throw new Error(`服务器返回非 JSON（HTTP ${res.status}）`);
  }
}

/** 登录 agent 站点（JSON API，供移动端） */
export async function agentLogin(
  cfg: AgentServerConfig,
  password: string,
): Promise<AgentServerConfig> {
  const res = await agentFetch(cfg, 'api/auth.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const json = await parseJson<{ csrf?: string; auth_enabled?: boolean }>(res);
  if (!json.ok) {
    throw new Error(json.message || '登录失败');
  }
  return { ...cfg, accessPassword: password, csrf: json.data?.csrf || cfg.csrf };
}

/** 刷新 CSRF / 登录状态 */
export async function agentSessionStatus(cfg: AgentServerConfig): Promise<{
  authed: boolean;
  auth_enabled: boolean;
  csrf: string;
}> {
  const res = await agentFetch(cfg, 'api/auth.php?action=status');
  const json = await parseJson<{ authed: boolean; auth_enabled: boolean; csrf: string }>(res);
  if (!json.ok) {
    throw new Error(json.message || '无法获取登录状态');
  }
  const data = json.data || { authed: false, auth_enabled: false, csrf: '' };
  return {
    authed: Boolean(data.authed),
    auth_enabled: Boolean(data.auth_enabled),
    csrf: String(data.csrf || ''),
  };
}

/** 有密码时自动登录并写回 csrf */
export async function ensureAgentSession(cfg: AgentServerConfig): Promise<AgentServerConfig> {
  const base = normalizeBaseUrl(cfg.baseUrl);
  if (!base) {
    throw new Error('请先填写 Agent 站点 URL');
  }
  let next = { ...cfg, baseUrl: base };

  const status = await agentSessionStatus(next);
  if (status.auth_enabled && !status.authed) {
    if (!cfg.accessPassword?.trim()) {
      throw new Error('站点需要访问密码，请在设置中填写');
    }
    next = await agentLogin(next, cfg.accessPassword.trim());
  } else if (status.csrf) {
    next.csrf = status.csrf;
  }
  return next;
}

/** 拉取 Agent / 模型配置（对齐 agent index.php BOOT） */
export async function fetchAgentBoot(cfg: AgentServerConfig): Promise<Record<string, unknown>> {
  const res = await agentFetch(cfg, 'index.php');
  const html = await res.text();
  const m = html.match(/window\.__BOOT__\s*=\s*(\{[\s\S]*?\});/);
  if (!m) {
    throw new Error('无法解析 Agent 配置，请检查 baseUrl');
  }
  return JSON.parse(m[1]) as Record<string, unknown>;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  steps: string[];
}

/** 分层探测：ping → chat → 登录 → 模型列表 */
export async function testAgentConnection(cfg: AgentServerConfig): Promise<ConnectionTestResult> {
  const steps: string[] = [];
  const base = normalizeBaseUrl(cfg.baseUrl);
  if (!base) {
    throw new Error('请填写 Agent 站点 URL');
  }
  let session = { ...cfg, baseUrl: base };

  const pingRes = await agentFetch(session, 'ping.php');
  const pingJson = await parseJson(pingRes);
  if (!pingJson.ok) {
    throw new Error(pingJson.message || 'ping.php 失败');
  }
  steps.push(`✓ ping.php：${pingJson.message || 'ok'}`);

  const chatRes = await agentFetch(session, 'api/chat.php?ping=1');
  const chatJson = await parseJson(chatRes);
  if (!chatJson.ok) {
    throw new Error(chatJson.message || 'api/chat.php 不可达');
  }
  steps.push(`✓ chat.php：${chatJson.message || 'ok'}`);

  session = await ensureAgentSession(session);
  if (session.csrf) {
    steps.push('✓ 登录/会话有效');
  }

  const modelsRes = await agentFetch(session, `api/models.php?agent_id=${session.agentId || 0}`);
  const modelsJson = await parseJson<{ models: AgentModelRow[] }>(modelsRes);
  if (!modelsJson.ok) {
    throw new Error(modelsJson.message || '无法读取模型库');
  }
  const count = modelsJson.data?.models?.length ?? 0;
  steps.push(`✓ 模型库：${count} 个已存模型`);

  let upstreamNote = '';
  try {
    const upRes = await agentFetch(session, 'api/chat.php?ping=1&upstream=1');
    const upJson = await parseJson<{ message?: string }>(upRes);
    if (upJson.ok) {
      upstreamNote = upJson.message || '上游可达';
      steps.push(`✓ 上游模型：${upstreamNote}`);
    } else {
      steps.push(`⚠ 上游模型：${upJson.message || '不可达'}`);
    }
  } catch (e) {
    steps.push(`⚠ 上游模型：${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    ok: true,
    message: '连接正常，可以开始对话',
    steps,
  };
}

/** 读取已存模型 */
export async function listStoredModels(cfg: AgentServerConfig): Promise<AgentModelRow[]> {
  const session = await ensureAgentSession(cfg);
  const res = await agentFetch(session, `api/models.php?agent_id=${session.agentId || 0}`);
  const json = await parseJson<{ models: AgentModelRow[] }>(res);
  if (!json.ok) {
    throw new Error(json.message || '读取模型失败');
  }
  return json.data?.models || [];
}

/** 从上游拉取模型并落库 */
export async function fetchModelsFromUpstream(cfg: AgentServerConfig): Promise<{
  models: AgentModelRow[];
  count: number;
  message: string;
  defaultModel?: string;
}> {
  const session = await ensureAgentSession(cfg);
  const res = await agentFetch(session, 'api/models.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'fetch',
      agent_id: session.agentId || 0,
      _csrf: session.csrf || '',
    }),
  });
  const json = await parseJson<{ models: AgentModelRow[]; count: number }>(res);
  if (!json.ok) {
    throw new Error(json.message || '拉取模型失败');
  }
  const models = json.data?.models || [];
  const first = models.find((m) => (m.is_enabled ?? 1) === 1) || models[0];
  const modelKey = first?.model_key || '';
  return {
    models,
    count: json.data?.count ?? models.length,
    message: json.message || `已拉取 ${models.length} 个模型`,
    defaultModel: modelKey || undefined,
  };
}

/** 经 agent relay 转发模型请求（对齐 relay.php） */
export async function relayRequest(
  cfg: AgentServerConfig,
  path: string,
  method: 'GET' | 'POST',
  payload: Record<string, unknown> = {},
  idempotency = '',
): Promise<unknown> {
  const session = await ensureAgentSession(cfg);
  const pipeNames = ['api/x.php', 'api/p.php', 'api/relay.php'];
  let lastErr = '转发失败';

  for (const pipe of pipeNames) {
    try {
      const res = await agentFetch(session, pipe, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: path.replace(/^\/+/, ''),
          method,
          payload,
          idempotency,
          _csrf: session.csrf || '',
        }),
      });
      const json = await parseJson<{ status: number; data: unknown }>(res);
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
  const session = await ensureAgentSession(cfg);
  const payload = {
    model: opts.model,
    messages,
    tools: tools.length ? tools : undefined,
    tool_choice: opts.tool_choice,
    stream: true,
    max_tokens: opts.max_tokens ?? session.maxTokens ?? 8192,
    temperature: opts.temperature ?? session.temperature ?? 0.7,
  };

  const pipeNames = ['api/x.php', 'api/p.php', 'api/relay.php'];
  for (const pipe of pipeNames) {
    try {
      const res = await agentFetch(session, pipe, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stream: true,
          path: 'chat/completions',
          method: 'POST',
          payload,
          _csrf: session.csrf || '',
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
  return chatTurn(session, messages, tools, opts);
}

/** 单轮对话 + 工具定义（移动端本地执行工具，只调模型） */
export async function chatTurn(
  cfg: AgentServerConfig,
  messages: unknown[],
  tools: unknown[],
  opts: { model: string; max_tokens?: number; temperature?: number; tool_choice?: string },
): Promise<ChatTurnResult> {
  const session = await ensureAgentSession(cfg);
  const payload = {
    model: opts.model,
    messages,
    tools: tools.length ? tools : undefined,
    tool_choice: opts.tool_choice,
    stream: false,
    max_tokens: opts.max_tokens ?? session.maxTokens ?? 8192,
    temperature: opts.temperature ?? session.temperature ?? 0.7,
  };

  const data = (await relayRequest(session, 'chat/completions', 'POST', payload)) as {
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
