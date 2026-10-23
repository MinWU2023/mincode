#!/usr/bin/env node
/** 用法：node scripts/release-tag.mjs 1.0.2 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runGit(args) {
  const res = spawnSync('git', args, { cwd: root, stdio: 'inherit' });
  if (res.error) {
    console.error(res.error.message);
    process.exit(1);
  }
  if (res.status !== 0) process.exit(res.status || 1);
}

const raw = process.argv[2];
if (!raw) {
  console.error('用法: node scripts/release-tag.mjs <版本号>\n示例: node scripts/release-tag.mjs 1.0.2');
  process.exit(1);
}

const tag = raw.startsWith('v') ? raw : `v${raw}`;
const ver = tag.replace(/^v/, '');
const pkgPath = path.join(root, 'package.json');

if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (pkg.version !== ver) {
    pkg.version = ver;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`已更新 package.json version → ${ver}`);
    runGit(['add', 'package.json']);
    runGit(['commit', '-m', `chore: release ${tag}`]);
  }
}

const list = spawnSync('git', ['tag', '-l', tag], { cwd: root, encoding: 'utf8' });
if ((list.stdout || '').trim() === tag) {
  console.log(`标签 ${tag} 已存在`);
} else {
  runGit(['tag', '-a', tag, '-m', `mincode ${tag}`]);
  console.log(`已创建标签 ${tag}`);
}

const remote = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' });
if (remote.status !== 0) {
  console.log('\n⚠ 请先配置远程：');
  console.log('  git remote add origin https://github.com/<用户>/<仓库>.git');
}
console.log('\n推送：');
console.log('  git push -u origin main');
console.log(`  git push origin ${tag}`);
