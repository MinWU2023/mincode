/**
 * 从 resources/icon-source.jpg 生成 icon.png，并写入 Android / Web 图标。
 * 需在 npx cap add android 之后运行（或由 patch-android.mjs 调用）。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resourcesDir = path.join(root, 'resources');
const source = path.join(resourcesDir, 'icon-source.jpg');
const iconPng = path.join(resourcesDir, 'icon.png');
const publicDir = path.join(root, 'public');
const androidDir = path.join(root, 'android');

async function ensureIconPng() {
  if (!fs.existsSync(source)) {
    console.error(`缺少图标源文件：${source}`);
    process.exit(1);
  }
  await sharp(source)
    .resize(1024, 1024, { fit: 'cover', position: 'centre' })
    .png()
    .toFile(iconPng);
  console.log('已生成 resources/icon.png (1024×1024)');
}

async function writeWebIcons() {
  fs.mkdirSync(publicDir, { recursive: true });
  const sizes = [
    ['favicon-32.png', 32],
    ['favicon-192.png', 192],
    ['apple-touch-icon.png', 180],
  ];
  for (const [name, size] of sizes) {
    await sharp(iconPng).resize(size, size).png().toFile(path.join(publicDir, name));
    console.log(`已生成 public/${name}`);
  }
  await sharp(iconPng).resize(32, 32).png().toFile(path.join(publicDir, 'favicon.ico'));
  console.log('已生成 public/favicon.ico');
}

function runCapacitorAssets() {
  if (!fs.existsSync(androidDir)) {
    console.log('跳过 Android 图标：尚未 cap add android');
    return;
  }
  // 颜色在 capacitor.assets.json 配置；勿用 shell:true，否则 Linux 上 # 会被当成注释
  const res = spawnSync(
    'npx',
    ['@capacitor/assets', 'generate', '--android'],
    { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if (res.status !== 0) process.exit(res.status || 1);
  console.log('已生成 Android 启动图标与 splash');
}

await ensureIconPng();
await writeWebIcons();
runCapacitorAssets();
