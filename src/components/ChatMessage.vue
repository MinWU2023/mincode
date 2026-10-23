<script setup lang="ts">
import { computed } from 'vue';
import type { ChatMessage } from '@/types';
import { parseMessageParts } from '@/utils/messageContent';

const props = defineProps<{
  message: ChatMessage;
  streaming?: boolean;
}>();

const parts = computed(() =>
  props.message.role === 'assistant' ? parseMessageParts(props.message.content) : [],
);
</script>

<template>
  <div v-if="message.role === 'user'" class="msg-user">{{ message.content }}</div>
  <div v-else class="msg-assistant">
    <details v-if="message.reasoning" class="reasoning-block">
      <summary>思考过程</summary>
      <pre>{{ message.reasoning }}</pre>
    </details>

    <template v-if="message.content">
      <template v-for="(p, i) in parts" :key="i">
        <span v-if="p.type === 'text'" class="msg-text">{{ p.text }}</span>
        <figure v-else-if="p.type === 'image'" class="msg-figure">
          <img :src="p.url" :alt="p.alt" loading="lazy" />
          <figcaption v-if="p.alt">{{ p.alt }}</figcaption>
        </figure>
        <a v-else :href="p.url" target="_blank" rel="noopener" class="msg-link">{{ p.url }}</a>
      </template>
    </template>
    <span v-else-if="streaming" class="msg-placeholder">…</span>
  </div>
</template>
