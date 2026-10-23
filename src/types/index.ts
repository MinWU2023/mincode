/** 与 agent/ 服务端对齐的 Agent 配置（精简） */
export interface AgentServerConfig {
  /** agent 站点根 URL，如 https://example.com/agent */
  baseUrl: string;
  agentId: number;
  /** 站点访问密码（若 agent 开启了 auth） */
  accessPassword?: string;
  /** 会话 Cookie（登录后由 App 保存） */
  sessionCookie?: string;
  csrf?: string;
  model?: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  toolsEnabled?: boolean;
}

/** FTP 连接配置 */
export interface FtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  /** 远程站点根目录（FTP 上的项目路径） */
  remoteRoot: string;
  passive: boolean;
  /** 是否使用 FTPS */
  secure: boolean;
}

/** 本地工作区项目 */
export interface WorkProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Capacitor Directory URI 或 SAF document tree URI */
  localRootUri: string;
  localRootLabel: string;
  agent: AgentServerConfig;
  ftp: FtpConfig;
  /** 远程路径 ↔ 本地相对路径 映射前缀（可选） */
  pathPrefix?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
  createdAt: string;
}

export interface ToolLogEntry {
  name: string;
  label: string;
  ok: boolean;
  path?: string;
}

export interface HarnessDigest {
  modified_files: string[];
  read_files: string[];
  grep_keys: string[];
}

export interface AgentTurnResult {
  content: string;
  reasoning?: string;
  model?: string;
  toolLog: ToolLogEntry[];
  modifiedFiles: string[];
  harnessDigest?: HarnessDigest;
}

export interface FtpEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modified?: string;
}
