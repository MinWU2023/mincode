import { defineStore } from 'pinia';
import { Preferences } from '@capacitor/preferences';
import type { ChatMessage, AgentTurnResult, HarnessDigest, ToolLogEntry } from '@/types';
import { emptyDigest, loadHarnessDigest, saveHarnessDigest } from '@/services/harness';

const MAX_MESSAGES = 100;

function storageKey(projectId: string): string {
  return `abs_chat_${projectId}`;
}

function workRootKey(projectId: string): string {
  return `abs_chat_work_root_${projectId}`;
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    projectId: '' as string,
    workRoot: '' as string,
    messages: [] as ChatMessage[],
    streaming: false,
    toolLog: [] as ToolLogEntry[],
    lastModified: [] as string[],
    harnessDigest: emptyDigest() as HarnessDigest,
    error: '' as string,
  }),

  actions: {
    async loadForProject(projectId: string) {
      if (!projectId) return;
      if (this.projectId !== projectId) {
        this.projectId = projectId;
        this.toolLog = [];
        this.error = '';
        this.harnessDigest = loadHarnessDigest(projectId);
        const wr = await Preferences.get({ key: workRootKey(projectId) });
        this.workRoot = wr.value || '';
        const raw = await Preferences.get({ key: storageKey(projectId) });
        if (raw.value) {
          try {
            const data = JSON.parse(raw.value) as {
              messages?: ChatMessage[];
              lastModified?: string[];
            };
            this.messages = data.messages || [];
            this.lastModified = data.lastModified || [];
          } catch {
            this.messages = [];
            this.lastModified = [];
          }
        } else {
          this.messages = [];
          this.lastModified = [];
        }
      }
    },

    async setWorkRoot(root: string) {
      this.workRoot = root.replace(/^\/+|\/+$/g, '');
      if (this.projectId) {
        await Preferences.set({ key: workRootKey(this.projectId), value: this.workRoot });
      }
    },

    async persist() {
      if (!this.projectId) return;
      await Preferences.set({
        key: storageKey(this.projectId),
        value: JSON.stringify({
          messages: this.messages.slice(-MAX_MESSAGES),
          lastModified: this.lastModified,
        }),
      });
    },

    async clear() {
      this.messages = [];
      this.toolLog = [];
      this.lastModified = [];
      this.harnessDigest = emptyDigest();
      if (this.projectId) saveHarnessDigest(this.projectId, this.harnessDigest);
      this.error = '';
      await this.persist();
    },

    clearHarnessMemory() {
      this.harnessDigest = emptyDigest();
      if (this.projectId) saveHarnessDigest(this.projectId, this.harnessDigest);
    },

    clearTurn() {
      this.toolLog = [];
      this.error = '';
    },

    pushUser(text: string) {
      this.messages.push({
        id: `m_${Date.now()}`,
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      });
    },

    beginAssistant(): string {
      const id = `m_${Date.now()}_a`;
      this.messages.push({
        id,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
      });
      return id;
    },

    updateAssistant(id: string, content: string, reasoning?: string) {
      const m = this.messages.find((x) => x.id === id);
      if (m) {
        m.content = content;
        if (reasoning) m.reasoning = reasoning;
      }
    },

    pushAssistant(text: string, reasoning?: string) {
      this.messages.push({
        id: `m_${Date.now()}`,
        role: 'assistant',
        content: text,
        reasoning,
        createdAt: new Date().toISOString(),
      });
    },

    applyResult(result: AgentTurnResult, assistantId?: string) {
      this.toolLog = result.toolLog;
      this.lastModified = result.modifiedFiles;
      if (result.harnessDigest) {
        this.harnessDigest = result.harnessDigest;
        if (this.projectId) saveHarnessDigest(this.projectId, this.harnessDigest);
      }
      if (assistantId) {
        this.updateAssistant(assistantId, result.content, result.reasoning);
      } else {
        this.pushAssistant(result.content, result.reasoning);
      }
    },

    setStreaming(v: boolean) {
      this.streaming = v;
    },

    setError(msg: string) {
      this.error = msg;
    },
  },
});
