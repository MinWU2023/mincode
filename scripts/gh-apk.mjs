#!/usr/bin/env node
/**
 * 用 GitHub CLI 触发 / 下载 agent-app Android 打包产物。
 *
 * 前置：已安装并登录 gh（gh auth login）
 *
 * 用法：
 *   node scripts/gh-apk.mjs trigger [debug|release]   # 触发 workflow_dispatch
 *   node scripts/gh-apk.mjs watch                     # 等待最近一次 run 完成
 *   node scripts/gh-apk.mjs download [run-id]         # 下载 APK 到 ./dist-apk/
 *   node scripts/gh-apk.mjs latest                    # 下载最近一次成功 run 的产物
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKFLOW = 'android-apk.yml';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist-apk');

function gh(args, opts = {}) {
  const res = spawnSync('gh', args, {
    encoding: 'utf8',
    cwd: opts.cwd || REPO_ROOT,
    shell: process.platform === 'win32',
  });
  if (res.error) {
    if (res.error.code === 'ENOENT') {
      console.error('未找到 gh 命令。请先安装 GitHub CLI：https://cli.github.com/');
      process.exit(1);
    }
    throw res.error;
  }
  if (res.status !== 0) {
    console.error(res.stderr || res.stdout);
    process.exit(res.status || 1);
  }
  return (res.stdout || '').trim();
}

function usage() {
  console.log(`
用法：
  node scripts/gh-apk.mjs trigger [debug|release]   触发远程打包
  node scripts/gh-apk.mjs watch [run-id]            等待 run 结束
  node scripts/gh-apk.mjs download [run-id]         下载产物到 dist-apk/
  node scripts/gh-apk.mjs latest                    下载最近一次成功产物
  node scripts/gh-apk.mjs runs                      列出最近 workflow runs

Workflow: ${WORKFLOW}
`);
}

function trigger(variant = 'debug') {
  const v = variant === 'release' ? 'release' : 'debug';
  const url = gh(['workflow', 'run', WORKFLOW, '-f', `variant=${v}`]);
  console.log(`已触发 ${v} 打包：${url || '(查看 gh run list)'}`);
  console.log('等待完成：node scripts/gh-apk.mjs watch');
}

function watch(runId) {
  const id = runId || gh(['run', 'list', '--workflow', WORKFLOW, '--limit', '1', '--json', 'databaseId', '-q', '.[0].databaseId']);
  console.log(`等待 run #${id} …`);
  gh(['run', 'watch', id]);
  const status = gh(['run', 'view', id, '--json', 'conclusion,url', '-q', '.conclusion + " " + .url']);
  console.log(status);
  if (!status.startsWith('success')) process.exit(1);
}

function download(runId) {
  const id = runId || gh(['run', 'list', '--workflow', WORKFLOW, '--limit', '1', '--json', 'databaseId', '-q', '.[0].databaseId']);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  gh(['run', 'download', id, '-D', OUT_DIR]);
  const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.apk'));
  console.log(`已下载到 ${OUT_DIR}`);
  for (const f of files) console.log(`  - ${f}`);
}

function latest() {
  const id = gh([
    'run', 'list', '--workflow', WORKFLOW,
    '--status', 'success', '--limit', '1',
    '--json', 'databaseId', '-q', '.[0].databaseId',
  ]);
  if (!id) {
    console.error('没有成功的 workflow run');
    process.exit(1);
  }
  download(id);
}

function runs() {
  console.log(gh(['run', 'list', '--workflow', WORKFLOW, '--limit', '10']));
}

const [cmd, arg] = process.argv.slice(2);
switch (cmd) {
  case 'trigger':
    trigger(arg);
    break;
  case 'watch':
    watch(arg);
    break;
  case 'download':
    download(arg);
    break;
  case 'latest':
    latest();
    break;
  case 'runs':
    runs();
    break;
  default:
    usage();
    process.exit(cmd ? 1 : 0);
}
