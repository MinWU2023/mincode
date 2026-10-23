import type { FtpConfig, WorkProject } from '@/types';

/** 远程绝对路径 → 沙盒相对路径 */
export function sandboxRelFromRemote(
  remoteFilePath: string,
  ftp: FtpConfig,
  pathPrefix = '',
): string {
  let p = remoteFilePath.replace(/\\/g, '/');
  const root = ftp.remoteRoot.replace(/\/+$/, '');
  if (root && p.startsWith(root)) {
    p = p.slice(root.length);
  }
  p = p.replace(/^\/+/, '');
  const prefix = pathPrefix.replace(/^\/+|\/+$/g, '');
  if (prefix) {
    if (p === prefix) return '';
    if (p.startsWith(prefix + '/')) {
      p = p.slice(prefix.length + 1);
    }
  }
  return p;
}

/** 在当前远程目录下上传本地文件的完整远程路径 */
export function remoteDestInDir(remoteDir: string, fileName: string): string {
  const dir = remoteDir.replace(/\/+$/, '') || '/';
  if (dir === '/') return `/${fileName}`;
  return `${dir}/${fileName}`;
}

export function localChildPath(parent: string, name: string): string {
  const base = parent.replace(/\/+$/, '');
  return base ? `${base}/${name}` : name;
}

export function parentPath(rel: string): string {
  const p = rel.replace(/\/+$/, '');
  const i = p.lastIndexOf('/');
  return i <= 0 ? '' : p.slice(0, i);
}

/** 本地沙盒相对路径 → 远程完整路径（按项目 FTP 根 + pathPrefix） */
export function remotePathForLocalRel(project: WorkProject, sandboxRel: string): string {
  const root = project.ftp.remoteRoot.replace(/\/+$/, '') || '';
  const prefix = (project.pathPrefix || '').replace(/^\/+|\/+$/g, '');
  const rel = sandboxRel.replace(/^\/+/, '');
  if (prefix) return `${root}/${prefix}/${rel}`;
  return `${root}/${rel}`;
}
