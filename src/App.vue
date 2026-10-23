<script setup lang="ts">
import { onMounted } from 'vue';
import { useProjectsStore } from '@/stores/projects';
import { useAgentSettingsStore } from '@/stores/agentSettings';

const projects = useProjectsStore();
const agentSettings = useAgentSettingsStore();

onMounted(async () => {
  await agentSettings.load();
  await projects.load();
});
</script>

<template>
  <div class="app-shell">
    <router-view />
    <nav class="tab-bar">
      <router-link to="/">
        <span class="tab-icon">⌂</span>
        <span>首页</span>
      </router-link>
      <router-link to="/chat">
        <span class="tab-icon">◉</span>
        <span>对话</span>
      </router-link>
      <router-link to="/projects">
        <span class="tab-icon">▤</span>
        <span>项目</span>
      </router-link>
      <router-link to="/ftp">
        <span class="tab-icon">⇪</span>
        <span>文件</span>
      </router-link>
      <router-link to="/settings">
        <span class="tab-icon">⚙</span>
        <span>设置</span>
      </router-link>
    </nav>
  </div>
</template>
