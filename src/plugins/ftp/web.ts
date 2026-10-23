import { WebPlugin } from '@capacitor/core';
import type { AgentFtpPlugin, FtpListOptions, FtpUploadOptions } from './definitions';

/**
 * Web 预览用桩：真机 FTP 需安装 android 原生插件 AgentFtpPlugin。
 * 见 android-native/FtpPlugin.kt 与 README。
 */
export class AgentFtpWeb extends WebPlugin implements AgentFtpPlugin {
  async list(_options: FtpListOptions): Promise<{ entries: never[] }> {
    console.warn('[AgentFtp] Web 环境不支持 FTP，请使用 Android 真机或模拟器');
    return { entries: [] };
  }

  async upload(_options: FtpUploadOptions): Promise<{ ok: boolean }> {
    throw new Error('Web 预览不支持 FTP 上传，请打包 APK 在真机使用');
  }

  async download(_options: FtpUploadOptions): Promise<{ ok: boolean }> {
    throw new Error('Web 预览不支持 FTP 下载');
  }

  async delete(): Promise<{ ok: boolean }> {
    throw new Error('Web 预览不支持 FTP 删除');
  }

  async mkdir(): Promise<{ ok: boolean }> {
    throw new Error('Web 预览不支持 FTP 建目录');
  }
}
