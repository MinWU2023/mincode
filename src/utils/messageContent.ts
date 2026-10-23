export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; alt: string }
  | { type: 'link'; url: string };

/** 将助手消息拆成可渲染片段（Markdown 图片 + 裸 URL） */
export function parseMessageParts(content: string): MessagePart[] {
  if (!content) return [];

  const parts: MessagePart[] = [];
  const re = /!\[([^\]]*)\]\(([^)]+)\)|(https?:\/\/[^\s<]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(content)) !== null) {
    if (m.index > last) {
      parts.push({ type: 'text', text: content.slice(last, m.index) });
    }
    if (m[0].startsWith('![')) {
      parts.push({ type: 'image', alt: m[1] || '图片', url: m[2] });
    } else {
      parts.push({ type: 'link', url: m[3] });
    }
    last = m.index + m[0].length;
  }

  if (last < content.length) {
    parts.push({ type: 'text', text: content.slice(last) });
  }

  return parts.length ? parts : [{ type: 'text', text: content }];
}
