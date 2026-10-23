<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useAgentSettingsStore } from '@/stores/agentSettings';
import {
  testAgentConnection,
  listStoredModels,
  fetchModelsFromUpstream,
  normalizeBaseUrl,
} from '@/api/agentServer';

const agentSettings = useAgentSettingsStore();
const version = '1.0.2';

const form = reactive({
  baseUrl: '',
  agentId: 1,
  model: '',
  accessPassword: '',
  maxTokens: 8192,
  temperature: 0.7,
  systemPrompt: '',
});

const testMsg = ref('');
const testSteps = ref<string[]>([]);
const testBusy = ref(false);
const modelsBusy = ref(false);
const fetchBusy = ref(false);
const saveMsg = ref('');

function syncFormFromStore() {
  const c = agentSettings.config;
  form.baseUrl = c.baseUrl || '';
  form.agentId = c.agentId || 1;
  form.model = c.model || '';
  form.accessPassword = c.accessPassword || '';
  form.maxTokens = c.maxTokens ?? 8192;
  form.temperature = c.temperature ?? 0.7;
  form.systemPrompt = c.systemPrompt || '';
}

onMounted(async () => {
  if (!agentSettings.loaded) await agentSettings.load();
  syncFormFromStore();
});

async function save() {
  saveMsg.value = '';
  await agentSettings.update({
    baseUrl: normalizeBaseUrl(form.baseUrl),
    agentId: Number(form.agentId) || 1,
    model: form.model.trim(),
    accessPassword: form.accessPassword,
    maxTokens: Number(form.maxTokens) || 8192,
    temperature: Number(form.temperature) || 0.7,
    systemPrompt: form.systemPrompt.trim(),
  });
  saveMsg.value = '已保存';
}

async function runTest() {
  testBusy.value = true;
  testMsg.value = '';
  testSteps.value = [];
  try {
    await save();
    const result = await testAgentConnection(agentSettings.agentConfig);
    testSteps.value = result.steps;
    testMsg.value = result.message;
  } catch (e) {
    testMsg.value = e instanceof Error ? e.message : String(e);
  } finally {
    testBusy.value = false;
  }
}

async function loadModels() {
  modelsBusy.value = true;
  saveMsg.value = '';
  try {
    await save();
    const models = await listStoredModels(agentSettings.agentConfig);
    await agentSettings.setModels(models);
    saveMsg.value = `已加载 ${models.length} 个模型`;
  } catch (e) {
    saveMsg.value = e instanceof Error ? e.message : String(e);
  } finally {
    modelsBusy.value = false;
  }
}

async function pullModels() {
  fetchBusy.value = true;
  saveMsg.value = '';
  try {
    await save();
    const result = await fetchModelsFromUpstream(agentSettings.agentConfig);
    await agentSettings.setModels(result.models);
    if (result.defaultModel && !form.model) {
      form.model = result.defaultModel;
      await agentSettings.update({ model: result.defaultModel });
    }
    saveMsg.value = result.message;
  } catch (e) {
    saveMsg.value = e instanceof Error ? e.message : String(e);
  } finally {
    fetchBusy.value = false;
  }
}

function pickModel(key: string) {
  form.model = key;
}
</script>

<template>
  <header class="app-header">
    <h1>AI 设置</h1>
    <div class="sub">全局共用 · 所有项目使用同一套 Agent 配置</div>
  </header>
  <main class="app-main">
    <div class="card">
      <span class="card-title">Agent 站点</span>
      <div class="field">
        <label>站点 URL</label>
        <input v-model="form.baseUrl" placeholder="https://你的域名/agent" />
      </div>
      <div class="field">
        <label>Agent ID</label>
        <input v-model.number="form.agentId" type="number" min="1" />
      </div>
      <div class="field">
        <label>访问密码（若站点开启了密码保护）</label>
        <input v-model="form.accessPassword" type="password" autocomplete="off" />
      </div>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn btn-primary" :disabled="testBusy" @click="runTest">
          {{ testBusy ? '测试中…' : '测试连接' }}
        </button>
        <button class="btn btn-ghost" @click="save">保存</button>
      </div>
      <p v-if="saveMsg" class="hint-text ok" style="margin-top:10px">{{ saveMsg }}</p>
      <p v-if="testMsg" class="hint-text" :class="testSteps.length ? 'ok' : 'err'" style="margin-top:10px;white-space:pre-wrap">{{ testMsg }}</p>
      <ul v-if="testSteps.length" class="test-steps">
        <li v-for="(s, i) in testSteps" :key="i">{{ s }}</li>
      </ul>
    </div>

    <div class="card">
      <span class="card-title">模型</span>
      <div class="field">
        <label>默认模型</label>
        <input v-model="form.model" placeholder="从下方列表选择或手动填写" />
      </div>
      <div class="btn-row">
        <button class="btn btn-ghost" :disabled="fetchBusy" @click="pullModels">
          {{ fetchBusy ? '拉取中…' : '从上游拉取模型' }}
        </button>
        <button class="btn btn-ghost" :disabled="modelsBusy" @click="loadModels">
          {{ modelsBusy ? '加载中…' : '刷新已存模型' }}
        </button>
      </div>
      <div v-if="agentSettings.models.length" class="model-chips">
        <button
          v-for="m in agentSettings.models"
          :key="m.id"
          type="button"
          class="chip"
          :class="{ active: form.model === m.model_key, disabled: m.is_enabled === 0 }"
          @click="pickModel(m.model_key)"
        >
          {{ m.model_key }}
        </button>
      </div>
      <p v-else class="hint-text" style="margin:10px 0 0">保存配置后点「从上游拉取模型」或「刷新已存模型」</p>
    </div>

    <div class="card">
      <span class="card-title">高级</span>
      <div class="field">
        <label>Max Tokens</label>
        <input v-model.number="form.maxTokens" type="number" />
      </div>
      <div class="field">
        <label>Temperature</label>
        <input v-model.number="form.temperature" type="number" step="0.1" min="0" max="2" />
      </div>
      <div class="field">
        <label>系统补充说明（可选）</label>
        <textarea v-model="form.systemPrompt" rows="3" placeholder="追加到每次对话的 system prompt" />
      </div>
    </div>

    <div class="card">
      <span class="card-title">关于</span>
      <p class="hint-text" style="margin:0">mincode v{{ version }} · 文件工具在本地执行，模型经 Agent relay 转发</p>
    </div>
  </main>
</template>

<style scoped>
.test-steps {
  margin: 10px 0 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--muted);
}
.model-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.chip.disabled {
  opacity: 0.45;
}
</style>
