<script setup lang="ts">
import { ref } from 'vue';

const version = ref('0.1.0');
</script>

<template>
  <header class="app-header">
    <h1>设置</h1>
    <div class="sub">v{{ version }}</div>
  </header>
  <main class="app-main">
    <div class="card">
      <span class="card-title">接口对齐</span>
      <p class="hint-text" style="margin:0">
        本 App 与 <code class="inline">agent/</code> 共用同一套中转与工具约定，详见
        <code class="inline">agent/docs/relay-api.md</code>。模型请求经 Agent 站点的
        <code class="inline">api/relay.php</code> 转发；文件读写在本机沙盒执行，不经过 PHP tools.php。
      </p>
    </div>
    <div class="card">
      <span class="card-title">构建 APK</span>
      <p class="hint-text" style="margin:0">
        推送代码后 GitHub Actions 自动打包，或本地执行
        <code class="inline">npm run android:debug</code>。
      </p>
    </div>
  </main>
</template>
