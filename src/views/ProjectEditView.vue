<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useProjectsStore } from '@/stores/projects';
import {
  syncProjectFiles,
  countSandboxFiles,
  getModifiedFiles,
  exportModifiedToPhone,
} from '@/services/localFs';

const route = useRoute();
const router = useRouter();
const store = useProjectsStore();

const project = computed(() => store.projects.find((p) => p.id === route.params.id));

const syncMsg = ref('');
const syncBusy = ref(false);
const fileCount = ref<number | null>(null);
const exportMsg = ref('');
const exportBusy = ref(false);
const modifiedCount = ref(0);

const form = reactive({
  name: '',
  ftpHost: '',
  ftpPort: 21,
  ftpUser: '',
  ftpPass: '',
  ftpRoot: '/',
  pathPrefix: '',
});

if (project.value) {
  form.name = project.value.name;
  form.ftpHost = project.value.ftp.host;
  form.ftpPort = project.value.ftp.port;
  form.ftpUser = project.value.ftp.username;
  form.ftpPass = project.value.ftp.password;
  form.ftpRoot = project.value.ftp.remoteRoot;
  form.pathPrefix = project.value.pathPrefix || '';
}

onMounted(async () => {
  if (project.value) {
    try {
      fileCount.value = await countSandboxFiles(project.value.id);
      modifiedCount.value = (await getModifiedFiles(project.value.id)).length;
    } catch {
      fileCount.value = null;
    }
  }
});

async function exportAllModified() {
  if (!project.value) return;
  exportBusy.value = true;
  exportMsg.value = '';
  try {
    const files = await getModifiedFiles(project.value.id);
    if (!files.length) {
      exportMsg.value = '没有待写回的修改记录';
      return;
    }
    const result = await exportModifiedToPhone(project.value, files);
    const errHint = result.errors?.length ? `（${result.errors.length} 个失败）` : '';
    exportMsg.value = `已写回 ${result.exported}/${files.length} 个文件${errHint}`;
    modifiedCount.value = (await getModifiedFiles(project.value.id)).length;
  } catch (e) {
    exportMsg.value = e instanceof Error ? e.message : String(e);
  } finally {
    exportBusy.value = false;
  }
}

async function syncToSandbox() {
  if (!project.value) return;
  syncBusy.value = true;
  syncMsg.value = '';
  try {
    const result = await syncProjectFiles(project.value);
    fileCount.value = await countSandboxFiles(project.value.id);
    const errs = result.errors?.length ? `（${result.errors.length} 个跳过/错误）` : '';
    syncMsg.value = `已同步 ${result.copied} 个文件，${result.skipped} 个跳过${errs}`;
  } catch (e) {
    syncMsg.value = e instanceof Error ? e.message : String(e);
  } finally {
    syncBusy.value = false;
  }
}

async function save() {
  if (!project.value) return;
  await store.updateProject(project.value.id, {
    name: form.name,
    pathPrefix: form.pathPrefix,
    ftp: {
      ...project.value.ftp,
      host: form.ftpHost,
      port: Number(form.ftpPort),
      username: form.ftpUser,
      password: form.ftpPass,
      remoteRoot: form.ftpRoot,
    },
  });
  await store.setActive(project.value.id);
  router.push('/');
}

async function remove() {
  if (!project.value) return;
  if (!confirm('确定删除该项目配置？不会删除手机上的原文件夹。')) return;
  await store.removeProject(project.value.id);
  router.push('/projects');
}
</script>

<template>
  <header class="app-header">
    <h1>编辑项目</h1>
    <div class="sub" v-if="project">📁 {{ project.localRootLabel }}</div>
  </header>
  <main class="app-main" v-if="project">
    <div class="card">
      <span class="card-title">项目信息</span>
      <div class="field"><label>名称</label><input v-model="form.name" /></div>
      <p class="hint-text" style="margin:0">
        AI 模型与 Agent 地址在
        <router-link to="/settings">全局设置</router-link>
        中配置，所有项目共用。
      </p>
    </div>

    <div class="card">
      <span class="card-title">本地目录</span>
      <p class="card-meta">
        📁 {{ project.localRootLabel }}
        <span v-if="fileCount !== null"> · 沙盒内 {{ fileCount }} 个文件</span>
      </p>
      <button class="btn btn-ghost btn-block" :disabled="syncBusy" @click="syncToSandbox">
        {{ syncBusy ? '同步中…' : '↻ 同步到 App 沙盒' }}
      </button>
      <button class="btn btn-ghost btn-block" :disabled="exportBusy" @click="exportAllModified">
        {{ exportBusy ? '写回中…' : `📱 写回修改到手机（${modifiedCount}）` }}
      </button>
      <p v-if="syncMsg" class="hint-text" style="margin-top:8px">{{ syncMsg }}</p>
      <p v-if="exportMsg" class="hint-text" style="margin-top:8px">{{ exportMsg }}</p>
    </div>

    <div class="card">
      <span class="card-title">FTP</span>
      <div class="field"><label>主机</label><input v-model="form.ftpHost" /></div>
      <div class="field"><label>端口</label><input v-model.number="form.ftpPort" type="number" /></div>
      <div class="field"><label>用户名</label><input v-model="form.ftpUser" /></div>
      <div class="field"><label>密码</label><input v-model="form.ftpPass" type="password" /></div>
      <div class="field"><label>远程根目录</label><input v-model="form.ftpRoot" placeholder="/public_html" /></div>
      <div class="field"><label>路径前缀</label><input v-model="form.pathPrefix" placeholder="本地路径映射到 FTP 的子目录" /></div>
    </div>

    <button class="btn btn-primary btn-block" @click="save">保存并设为当前</button>
    <button class="btn btn-danger btn-block" @click="remove">删除项目</button>
  </main>
</template>
