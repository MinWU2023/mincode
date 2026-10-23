import type { PluginListenerHandle } from '@capacitor/core';

export interface FtpListOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  remotePath: string;
  passive?: boolean;
  secure?: boolean;
}

export interface FtpTransferOptions extends FtpListOptions {
  localPath?: string;
  remotePath: string;
  targetPath?: string;
}

export interface FtpUploadOptions extends FtpTransferOptions {
  localPath: string;
}

export interface FtpEntryNative {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
}

export interface AgentFtpPlugin {
  list(options: FtpListOptions): Promise<{ entries: FtpEntryNative[] }>;
  upload(options: FtpUploadOptions): Promise<{ ok: boolean }>;
  download(options: FtpUploadOptions): Promise<{ ok: boolean }>;
  delete(options: FtpTransferOptions): Promise<{ ok: boolean }>;
  mkdir(options: FtpTransferOptions): Promise<{ ok: boolean }>;
  addListener(
    eventName: 'ftpProgress',
    listener: (info: { file: string; percent: number }) => void,
  ): Promise<PluginListenerHandle>;
}
