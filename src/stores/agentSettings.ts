import { defineStore } from 'pinia';
import { Preferences } from '@capacitor/preferences';
import type { AgentServerConfig } from '@/types';
import { ensureAgentSession } from '@/api/agentServer';

const STORAGE_KEY = 'mincode_agent_settings';

export interface AgentModelRow {
  id: number;
  model_key: string;
  name?: string;
  is_enabled?: number;
  agent_id?: number;
}

function defaultConfig(): AgentServerConfig {
  return {
    baseUrl: '',
    agentId: 1,
    model: '',
    accessPassword: '',
    maxTokens: 8192,
    temperature: 0.7,
    toolsEnabled: true,
  };
}

export const useAgentSettingsStore = defineStore('agentSettings', {
  state: () => ({
    config: defaultConfig() as AgentServerConfig,
    models: [] as AgentModelRow[],
    loaded: false,
  }),

  getters: {
    isConfigured(state): boolean {
      return Boolean(state.config.baseUrl?.trim());
    },
    agentConfig(state): AgentServerConfig {
      return { ...state.config };
    },
  },

  actions: {
    async load() {
      const raw = await Preferences.get({ key: STORAGE_KEY });
      if (raw.value) {
        try {
          const data = JSON.parse(raw.value) as Partial<AgentServerConfig> & { models?: AgentModelRow[] };
          this.config = { ...defaultConfig(), ...data };
          if (Array.isArray(data.models)) {
            this.models = data.models;
          }
        } catch {
          this.config = defaultConfig();
        }
      }
      this.loaded = true;
    },

    async persist() {
      await Preferences.set({
        key: STORAGE_KEY,
        value: JSON.stringify({
          ...this.config,
          models: this.models,
        }),
      });
    },

    async update(patch: Partial<AgentServerConfig>) {
      this.config = { ...this.config, ...patch };
      await this.persist();
    },

    async setModels(models: AgentModelRow[]) {
      this.models = models;
      await this.persist();
    },

    /** 从旧版「每项目 agent 配置」迁移一次 */
    /** 登录并刷新 CSRF，供对话/拉模型前调用 */
    async refreshSession(): Promise<AgentServerConfig> {
      const next = await ensureAgentSession(this.config);
      if (next.csrf !== this.config.csrf || next.baseUrl !== this.config.baseUrl) {
        this.config = { ...this.config, ...next };
        await this.persist();
      }
      return this.config;
    },

    async migrateFromProjectAgent(agent?: AgentServerConfig) {
      if (!agent?.baseUrl?.trim()) return;
      if (this.config.baseUrl?.trim()) return;
      this.config = {
        ...this.config,
        baseUrl: agent.baseUrl,
        agentId: agent.agentId || 1,
        model: agent.model || '',
        accessPassword: agent.accessPassword || '',
        maxTokens: agent.maxTokens ?? 8192,
        temperature: agent.temperature ?? 0.7,
        systemPrompt: agent.systemPrompt,
        toolsEnabled: agent.toolsEnabled ?? true,
        csrf: agent.csrf,
        sessionCookie: agent.sessionCookie,
      };
      await this.persist();
    },
  },
});
