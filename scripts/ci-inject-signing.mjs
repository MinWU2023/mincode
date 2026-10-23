/**
 * CI：为 Capacitor 生成的 android/app/build.gradle 注入 release 签名配置。
 * 依赖 android/keystore.properties（由 GitHub Actions 写入）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');
const propsPath = path.join(root, 'android', 'keystore.properties');

if (!fs.existsSync(gradlePath)) {
  console.error('未找到 android/app/build.gradle');
  process.exit(1);
}
if (!fs.existsSync(propsPath)) {
  console.error('未找到 android/keystore.properties');
  process.exit(1);
}

let gradle = fs.readFileSync(gradlePath, 'utf8');

if (gradle.includes('keystorePropertiesFile')) {
  console.log('build.gradle 已包含签名配置，跳过');
  process.exit(0);
}

const keystoreBlock = `
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
`;

const signingBlock = `
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
`;

gradle = gradle.replace(/(android\s*\{)/, `${keystoreBlock}\n$1`);

if (!gradle.includes('signingConfigs')) {
  gradle = gradle.replace(/(android\s*\{)/, `$1\n${signingBlock}`);
}

if (!gradle.includes('signingConfig signingConfigs.release')) {
  gradle = gradle.replace(
    /(buildTypes\s*\{[\s\S]*?release\s*\{)/,
    '$1\n            signingConfig signingConfigs.release',
  );
}

fs.writeFileSync(gradlePath, gradle);
console.log('已注入 release 签名配置');
