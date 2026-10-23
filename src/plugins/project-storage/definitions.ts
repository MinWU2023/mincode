export interface SyncTreeOptions {
  /** SAF document-tree URI（pickDirectory 返回的 path） */
  treeUri: string;
  /** 沙盒内项目 ID */
  projectId: string;
  /** 最大复制文件数，防止超大项目卡死 */
  maxFiles?: number;
  /** 单文件最大字节 */
  maxFileBytes?: number;
}

export interface SyncTreeResult {
  copied: number;
  skipped: number;
  bytes: number;
  errors: string[];
}

export interface ExportFilesOptions {
  treeUri: string;
  projectId: string;
  /** 沙盒内相对路径列表 */
  paths: string[];
}

export interface ExportFilesResult {
  exported: number;
  errors: string[];
}

export interface AgentProjectStoragePlugin {
  syncTree(options: SyncTreeOptions): Promise<SyncTreeResult>;
  /** 列出沙盒内项目相对路径（递归） */
  listSandbox(options: { projectId: string }): Promise<{ files: string[] }>;
  /** 将沙盒文件写回 SAF 目录 */
  exportFiles(options: ExportFilesOptions): Promise<ExportFilesResult>;
}
