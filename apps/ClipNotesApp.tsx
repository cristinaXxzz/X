import React, { useMemo, useState } from 'react';
import { Archive, ArrowLeft, ChatCircleText, Eye, NotePencil, Plus, PushPinSimple, Trash, X } from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import { ClipNote, ClipNoteReplyVisibility, ClipNoteStore, ClipNoteType, CLIP_NOTE_TYPE_LABELS } from '../utils/clipNotes';

type FilterId = 'all' | ClipNoteType | 'archived';

const filters: Array<{ id: FilterId; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'uncertain', label: '不确定' },
  { id: 'unfinished', label: '没说完' },
  { id: 'for_you', label: '留给你' },
  { id: 'archived', label: '已归档' },
];

const statusLabel: Record<ClipNote['status'], string> = {
  pending: '悬着',
  seen: '已看见',
  archived: '已归档',
};

const typeTone: Record<ClipNoteType, string> = {
  uncertain: 'bg-amber-50 text-amber-700 border-amber-100',
  unfinished: 'bg-sky-50 text-sky-700 border-sky-100',
  for_you: 'bg-rose-50 text-rose-700 border-rose-100',
};

const ClipNotesApp: React.FC = () => {
  const { closeApp, characters, activeCharacterId, addToast, userProfile } = useOS();
  const activeCharacter = characters.find((char) => char.id === activeCharacterId) || characters[0];
  const [notes, setNotes] = useState<ClipNote[]>(() => ClipNoteStore.list());
  const [filter, setFilter] = useState<FilterId>('all');
  const [showComposer, setShowComposer] = useState(false);
  const [characterName, setCharacterName] = useState(activeCharacter?.name || '');
  const [type, setType] = useState<ClipNoteType>('uncertain');
  const [relatedTopic, setRelatedTopic] = useState('');
  const [content, setContent] = useState('');
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyVisibility, setReplyVisibility] = useState<ClipNoteReplyVisibility>('private');

  const refresh = () => setNotes(ClipNoteStore.list());

  const visibleNotes = useMemo(() => {
    return notes.filter((note) => {
      if (filter === 'all') return note.status !== 'archived';
      if (filter === 'archived') return note.status === 'archived';
      return note.type === filter && note.status !== 'archived';
    });
  }, [filter, notes]);

  const counts = useMemo(() => ({
    all: notes.filter((note) => note.status !== 'archived').length,
    uncertain: notes.filter((note) => note.type === 'uncertain' && note.status !== 'archived').length,
    unfinished: notes.filter((note) => note.type === 'unfinished' && note.status !== 'archived').length,
    for_you: notes.filter((note) => note.type === 'for_you' && note.status !== 'archived').length,
    archived: notes.filter((note) => note.status === 'archived').length,
  } as Record<FilterId, number>), [notes]);

  const createNote = () => {
    const note = ClipNoteStore.create({ characterName, type, relatedTopic, content });
    if (!note) {
      addToast('这张纸条太像占位内容了，先不保存', 'error');
      return;
    }
    setContent('');
    setRelatedTopic('');
    setShowComposer(false);
    refresh();
    addToast('已夹进未归档', 'success');
  };

  const updateStatus = (id: string, nextStatus: ClipNote['status']) => {
    ClipNoteStore.updateStatus(id, nextStatus);
    refresh();
  };

  const deleteNote = (id: string) => {
    ClipNoteStore.delete(id);
    refresh();
  };

  const addReply = (noteId: string) => {
    const reply = ClipNoteStore.addReply(noteId, {
      from: userProfile.name || 'user',
      content: replyContent,
      visibility: replyVisibility,
    });
    if (!reply) {
      addToast('回复内容太短或像占位，先不保存', 'error');
      return;
    }
    setReplyContent('');
    setReplyVisibility('private');
    setReplyingToId(null);
    refresh();
    addToast('已回复夹页', 'success');
  };

  const deleteReply = (noteId: string, replyId: string) => {
    ClipNoteStore.deleteReply(noteId, replyId);
    refresh();
  };

  return (
    <div className="h-full w-full bg-[#f7f4ec] text-stone-900 flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-3 border-b border-stone-200/80 bg-[#f7f4ec]/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <button onClick={closeApp} className="h-11 w-11 rounded-full bg-white border border-stone-200 flex items-center justify-center shadow-sm active:scale-95">
            <ArrowLeft size={22} weight="bold" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-stone-400">loose pages</div>
            <h1 className="text-2xl font-black tracking-tight">夹页</h1>
          </div>
          <button
            onClick={() => setShowComposer(true)}
            className="h-11 px-4 rounded-full bg-stone-900 text-white flex items-center gap-2 text-sm font-bold shadow-sm active:scale-95"
          >
            <Plus size={18} weight="bold" />
            新纸条
          </button>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {filters.map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id)}
              className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-bold transition ${
                filter === item.id
                  ? 'border-stone-900 bg-stone-900 text-white'
                  : 'border-stone-200 bg-white/80 text-stone-500'
              }`}
            >
              {item.label}
              <span className="ml-1 opacity-60">{counts[item.id]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {visibleNotes.length === 0 ? (
          <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center text-stone-400">
            <NotePencil size={42} weight="duotone" />
            <div className="mt-4 text-lg font-black text-stone-600">这里暂时没有纸条</div>
            <p className="mt-2 max-w-xs text-sm leading-6">
              不确定、没说完、还没归类的话，都可以先夹在这里。
            </p>
          </div>
        ) : visibleNotes.map((note) => (
          <article key={note.id} className="rounded-2xl border border-stone-200 bg-white/90 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-2xl bg-stone-100 flex items-center justify-center text-lg font-black text-stone-500">
                {note.characterName.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-black text-stone-900">{note.characterName}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${typeTone[note.type]}`}>
                    {CLIP_NOTE_TYPE_LABELS[note.type]}
                  </span>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-bold text-stone-500">
                    {statusLabel[note.status]}
                  </span>
                </div>
                {note.relatedTopic && (
                  <div className="mt-1 text-xs font-bold text-stone-400">关于：{note.relatedTopic}</div>
                )}
              </div>
            </div>

            <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-stone-700">{note.content}</p>
            <div className="mt-3 text-xs text-stone-400">
              {new Date(note.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </div>

            {note.replies.length > 0 && (
              <div className="mt-4 space-y-2 rounded-2xl border border-stone-100 bg-stone-50/80 p-3">
                {note.replies.map((reply) => (
                  <div key={reply.id} className="rounded-xl bg-white p-3 text-sm text-stone-700 shadow-sm">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-stone-500">
                        {reply.from} · {reply.visibility === 'private' ? '只给本角色' : '可进群聊上下文'}
                      </span>
                      <button onClick={() => deleteReply(note.id, reply.id)} className="h-7 w-7 rounded-full text-stone-300 hover:bg-rose-50 hover:text-rose-500">
                        <X size={14} weight="bold" />
                      </button>
                    </div>
                    <div className="whitespace-pre-wrap leading-6">{reply.content}</div>
                    <div className="mt-1 text-[10px] text-stone-300">
                      {new Date(reply.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {replyingToId === note.id && (
              <div className="mt-4 rounded-2xl border border-stone-200 bg-[#fffaf0] p-3">
                <textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  className="min-h-20 w-full resize-none rounded-xl border border-stone-200 bg-white p-3 text-sm leading-6 outline-none focus:border-stone-400"
                  placeholder={`回复给 ${note.characterName}`}
                />
                <div className="mt-2 flex items-center gap-2">
                  {(['private', 'group'] as ClipNoteReplyVisibility[]).map((visibility) => (
                    <button
                      key={visibility}
                      type="button"
                      onClick={() => setReplyVisibility(visibility)}
                      className={`h-9 rounded-full px-3 text-xs font-black ${
                        replyVisibility === visibility ? 'bg-stone-900 text-white' : 'bg-white text-stone-500 border border-stone-200'
                      }`}
                    >
                      {visibility === 'private' ? '只给本角色' : '可公开'}
                    </button>
                  ))}
                  <div className="flex-1" />
                  <button onClick={() => setReplyingToId(null)} className="h-9 rounded-full px-3 text-xs font-bold text-stone-400">
                    取消
                  </button>
                  <button onClick={() => addReply(note.id)} className="h-9 rounded-full bg-stone-900 px-4 text-xs font-black text-white">
                    保存回复
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 grid grid-cols-4 gap-2">
              <button onClick={() => updateStatus(note.id, 'seen')} className="h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center gap-1 text-xs font-bold active:scale-95">
                <Eye size={16} weight="bold" /> 看见
              </button>
              <button onClick={() => updateStatus(note.id, 'pending')} className="h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center gap-1 text-xs font-bold active:scale-95">
                <PushPinSimple size={16} weight="bold" /> 悬着
              </button>
              <button onClick={() => updateStatus(note.id, 'archived')} className="h-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center gap-1 text-xs font-bold active:scale-95">
                <Archive size={16} weight="bold" /> 归档
              </button>
              <button onClick={() => deleteNote(note.id)} className="h-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center gap-1 text-xs font-bold active:scale-95">
                <Trash size={16} weight="bold" /> 删除
              </button>
            </div>
            <button
              onClick={() => {
                setReplyingToId(note.id);
                setReplyContent('');
                setReplyVisibility('private');
              }}
              className="mt-2 h-10 w-full rounded-xl bg-stone-900 text-white flex items-center justify-center gap-2 text-xs font-black active:scale-95"
            >
              <ChatCircleText size={16} weight="bold" /> 回复
            </button>
          </article>
        ))}
      </div>

      {showComposer && (
        <div className="absolute inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-[#fffaf0] border border-stone-200 shadow-2xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.24em] text-stone-400">new loose page</div>
                <h2 className="text-xl font-black">新纸条</h2>
              </div>
              <button onClick={() => setShowComposer(false)} className="h-10 w-10 rounded-full bg-white border border-stone-200 flex items-center justify-center">
                <X size={18} weight="bold" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-bold text-stone-500">角色</span>
                <select value={characterName} onChange={(e) => setCharacterName(e.target.value)} className="mt-1 h-11 w-full rounded-2xl border border-stone-200 bg-white px-3 text-sm font-bold outline-none">
                  {characters.map((char) => <option key={char.id} value={char.name}>{char.name}</option>)}
                  {!characters.length && <option value="未知角色">未知角色</option>}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-bold text-stone-500">类型</span>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {(Object.keys(CLIP_NOTE_TYPE_LABELS) as ClipNoteType[]).map((item) => (
                    <button
                      key={item}
                      onClick={() => setType(item)}
                      className={`h-11 rounded-2xl border text-sm font-bold ${
                        type === item ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-500'
                      }`}
                    >
                      {CLIP_NOTE_TYPE_LABELS[item]}
                    </button>
                  ))}
                </div>
              </label>

              <label className="block">
                <span className="text-xs font-bold text-stone-500">相关话题，可选</span>
                <input value={relatedTopic} onChange={(e) => setRelatedTopic(e.target.value)} className="mt-1 h-11 w-full rounded-2xl border border-stone-200 bg-white px-3 text-sm outline-none" placeholder="比如：刚才那件事" />
              </label>

              <label className="block">
                <span className="text-xs font-bold text-stone-500">内容</span>
                <textarea value={content} onChange={(e) => setContent(e.target.value)} className="mt-1 min-h-32 w-full rounded-2xl border border-stone-200 bg-white p-3 text-sm leading-6 outline-none" placeholder="先放在这里，不急着归类。" />
              </label>
            </div>

            <button onClick={createNote} className="mt-4 h-12 w-full rounded-2xl bg-stone-900 text-white text-sm font-black active:scale-[0.99]">
              夹进去
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClipNotesApp;
