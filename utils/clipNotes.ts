export type ClipNoteType = 'uncertain' | 'unfinished' | 'for_you';
export type ClipNoteStatus = 'pending' | 'seen' | 'archived';
export type ClipNoteReplyVisibility = 'private' | 'group';

export interface ClipNoteReply {
  id: string;
  from: string;
  content: string;
  createdAt: number;
  visibility: ClipNoteReplyVisibility;
}

export interface ClipNote {
  id: string;
  characterName: string;
  type: ClipNoteType;
  content: string;
  relatedTopic?: string;
  createdAt: number;
  status: ClipNoteStatus;
  replies: ClipNoteReply[];
}

const STORAGE_KEY = 'sullyos_clip_notes_v1';
const PLACEHOLDER_WORDS = new Set([
  'content',
  'note',
  'test',
  'todo',
  'placeholder',
  '内容',
  '纸条',
  '测试',
  '占位',
  '随便',
  '无',
  '空',
]);

const normalizeType = (raw: string): ClipNoteType => {
  const value = raw.trim().toLowerCase();
  if (['没说完', '未说完', 'unfinished', 'not_finished'].includes(value)) return 'unfinished';
  if (['留给你', '给你', 'for_you', 'foryou'].includes(value)) return 'for_you';
  return 'uncertain';
};

const normalizeVisibility = (raw: string): ClipNoteReplyVisibility => {
  return raw === 'group' ? 'group' : 'private';
};

export const CLIP_NOTE_TYPE_LABELS: Record<ClipNoteType, string> = {
  uncertain: '不确定',
  unfinished: '没说完',
  for_you: '留给你',
};

export const isValidClipNoteContent = (content: string): boolean => {
  const trimmed = content.trim();
  if (!trimmed) return false;
  const compact = trimmed
    .replace(/[\s　\r\n\t"'“”‘’.,，。！？；：、/\\()[\]{}<>《》【】-]/g, '')
    .toLowerCase();
  if (compact.length < 3) return false;
  if (PLACEHOLDER_WORDS.has(compact)) return false;
  if (/^(.)\1+$/.test(compact)) return false;
  return true;
};

const readRawNotes = (): ClipNote[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((note): note is ClipNote => !!note && typeof note === 'object' && typeof note.id === 'string')
      .map((note) => ({
        id: note.id,
        characterName: String(note.characterName || '未知角色'),
        type: normalizeType(String(note.type || '不确定')),
        content: String(note.content || ''),
        relatedTopic: note.relatedTopic ? String(note.relatedTopic) : undefined,
        createdAt: Number(note.createdAt || Date.now()),
        status: ['pending', 'seen', 'archived'].includes(String(note.status)) ? note.status : 'pending',
        replies: Array.isArray(note.replies)
          ? note.replies
              .filter((reply: any) => reply && typeof reply === 'object' && String(reply.content || '').trim())
              .map((reply: any) => ({
                id: String(reply.id || `reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
                from: String(reply.from || 'user'),
                content: String(reply.content || '').trim(),
                createdAt: Number(reply.createdAt || Date.now()),
                visibility: normalizeVisibility(String(reply.visibility || 'private')),
              }))
          : [],
      }))
      .filter((note) => isValidClipNoteContent(note.content));
  } catch {
    return [];
  }
};

const writeRawNotes = (notes: ClipNote[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
};

export const ClipNoteStore = {
  list(): ClipNote[] {
    return readRawNotes().sort((a, b) => b.createdAt - a.createdAt);
  },

  listForCharacter(characterName: string): ClipNote[] {
    const name = characterName.trim();
    if (!name) return [];
    return this.list().filter((note) => note.characterName === name);
  },

  getPrivateReplyContextForCharacter(characterName: string): string {
    const notes = this.listForCharacter(characterName)
      .map((note) => {
        const privateReplies = note.replies.filter((reply) => reply.visibility === 'private');
        if (privateReplies.length === 0) return '';
        const topic = note.relatedTopic ? ` / ${note.relatedTopic}` : '';
        const lines = privateReplies.slice(-5).map((reply, index) => {
          const time = new Date(reply.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
          return `  ${index + 1}. [${time}] ${reply.content}`;
        }).join('\n');
        return `- ${CLIP_NOTE_TYPE_LABELS[note.type]}${topic}: ${note.content}\n${lines}`;
      })
      .filter(Boolean);
    if (notes.length === 0) return '';
    return `\n### 夹页回复（只给 ${characterName} 可见）\n这些是用户写在你自己夹页纸条下的回复，只注入给你，不会给其他角色看：\n${notes.join('\n')}\n`;
  },

  create(input: {
    characterName: string;
    type: string;
    content: string;
    relatedTopic?: string;
  }): ClipNote | null {
    const content = input.content.trim();
    if (!isValidClipNoteContent(content)) return null;
    const note: ClipNote = {
      id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      characterName: input.characterName.trim() || '未知角色',
      type: normalizeType(input.type),
      content,
      relatedTopic: input.relatedTopic?.trim() || undefined,
      createdAt: Date.now(),
      status: 'pending',
      replies: [],
    };
    writeRawNotes([note, ...readRawNotes()]);
    return note;
  },

  addReply(id: string, input: { from: string; content: string; visibility?: ClipNoteReplyVisibility }): ClipNoteReply | null {
    const content = input.content.trim();
    if (!isValidClipNoteContent(content)) return null;
    const reply: ClipNoteReply = {
      id: `reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from: input.from.trim() || 'user',
      content,
      createdAt: Date.now(),
      visibility: input.visibility || 'private',
    };
    writeRawNotes(readRawNotes().map((note) => (
      note.id === id ? { ...note, replies: [...(note.replies || []), reply] } : note
    )));
    return reply;
  },

  deleteReply(noteId: string, replyId: string): void {
    writeRawNotes(readRawNotes().map((note) => (
      note.id === noteId ? { ...note, replies: (note.replies || []).filter((reply) => reply.id !== replyId) } : note
    )));
  },

  updateStatus(id: string, status: ClipNoteStatus): void {
    writeRawNotes(readRawNotes().map((note) => note.id === id ? { ...note, status } : note));
  },

  delete(id: string): void {
    writeRawNotes(readRawNotes().filter((note) => note.id !== id));
  },
};

export const parseClipNoteParts = (raw: string): { type: ClipNoteType; relatedTopic?: string; content: string } | null => {
  const parts = raw.split('|').map((part) => part.trim());
  if (parts.length >= 3) {
    return {
      type: normalizeType(parts[0]),
      relatedTopic: parts[1] || undefined,
      content: parts.slice(2).join(' | ').trim(),
    };
  }
  if (parts.length === 2) {
    return {
      type: normalizeType(parts[0]),
      content: parts[1].trim(),
    };
  }
  return null;
};
