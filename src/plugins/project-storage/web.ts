import { WebPlugin } from '@capacitor/core';
import type {
  AgentProjectStoragePlugin,
  ExportFilesOptions,
  ExportFilesResult,
  SyncTreeOptions,
  SyncTreeResult,
} from './definitions';

export class AgentProjectStorageWeb extends WebPlugin implements AgentProjectStoragePlugin {
  async syncTree(_options: SyncTreeOptions): Promise<SyncTreeResult> {
    return {
      copied: 0,
      skipped: 0,
      bytes: 0,
      errors: ['Web 预览不支持目录同步，请使用 Android 真机'],
    };
  }

  async listSandbox(): Promise<{ files: string[] }> {
    return { files: [] };
  }

  async exportFiles(_options: ExportFilesOptions): Promise<ExportFilesResult> {
    return { exported: 0, errors: ['Web 预览不支持写回手机目录'] };
  }
}
