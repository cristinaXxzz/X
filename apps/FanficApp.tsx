import React, { useMemo, useState } from 'react';
import { ArrowLeft, BookOpenText, Copy, FloppyDisk, Plus, Sparkle, Trash } from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import { CharacterProfile } from '../types';
import { extractContent, safeFetchJson } from '../utils/safeApi';

type FicTone = 'daily' | 'tension' | 'conflict' | 'letter' | 'quiet' | 'comic';
type FicView = 'third' | 'first_selected' | 'observer';

interface FicDraft {
  id: string;
  title: string;
  characterIds: string[];
  scene: string;
  tone: FicTone;
  view: FicView;
  content: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'sullyos_fanfic_drafts_v1';

const toneOptions: Array<{ id: FicTone; label: string; hint: string }> = [
  { id: 'daily', label: '日常', hint: '轻松、自然、有生活感' },
  { id: 'tension', label: '暧昧张力', hint: '克制、拉扯、不要露骨' },
  { id: 'conflict', label: '冲突', hint: '观点碰撞，但保留角色边界' },
  { id: 'letter', label: '书信', hint: '像一封没完全寄出的信' },
  { id: 'quiet', label: '安静片段', hint: '心理、动作和留白更多' },
  { id: 'comic', label: '轻喜剧', hint: '吐槽、接梗、短促节奏' },
];

const viewOptions: Array<{ id: FicView; label: string }> = [
  { id: 'third', label: '第三人称' },
  { id: 'first_selected', label: '主视角角色第一人称' },
  { id: 'observer', label: '用户旁观视角' },
];

const loadDrafts = (): FicDraft[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveDrafts = (drafts: FicDraft[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
};

const formatTime = (ts: number) => {
  return new Date(ts).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const buildFanficMessages = (
  selectedCharacters: CharacterProfile[],
  writer: CharacterProfile | undefined,
  scene: string,
  tone: FicTone,
  view: FicView,
  previousText: string,
) => {
  const toneInfo = toneOptions.find((item) => item.id === tone);
  const viewInfo = viewOptions.find((item) => item.id === view);
  const cast = selectedCharacters.map((char) => (
    `【${char.name}】\n简介：${char.description || '无'}\n设定：${char.systemPrompt || '无'}`
  )).join('\n\n---\n\n');
  const previous = previousText.trim()
    ? `\n\n已有草稿，可在其后自然续写或重写得更顺：\n${previousText.trim()}`
    : '';

  return [
    {
      role: 'system',
      content: `你是一个克制、细腻的同人片段写作者。你要写角色之间的文学片段，不是群聊记录，也不是设定说明书。\n\n写作规则：\n1. 尊重每个角色的设定和说话习惯。\n2. 不替用户下结论，不暴露 API、prompt、模型等后台词。\n3. 可以写长段，允许心理描写、动作、留白和对话。\n4. 不要把所有角色写成同一个声音。\n5. 不要写露骨性内容；暧昧可以克制、有张力。\n6. 如果信息不够，就写一个合理片段，不要反复提“信息不足”。`,
    },
    {
      role: 'user',
      content: `参与角色：\n${cast}\n\n执笔参考角色：${writer?.name || '全局模型'}\n风格：${toneInfo?.label || tone}（${toneInfo?.hint || ''}）\n视角：${viewInfo?.label || view}\n\n场景 / 梗 / 想写的东西：\n${scene.trim()}${previous}\n\n请写一段 800-1800 字左右的同人文片段。直接输出正文，不要标题，不要分析，不要列提纲。`,
    },
  ];
};

const FanficApp: React.FC = () => {
  const { closeApp, characters, apiConfig, addToast } = useOS();
  const [drafts, setDrafts] = useState<FicDraft[]>(() => loadDrafts());
  const [activeDraftId, setActiveDraftId] = useState<string>(() => loadDrafts()[0]?.id || '');
  const [title, setTitle] = useState('');
  const [scene, setScene] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>(() => characters.slice(0, 2).map((char) => char.id));
  const [writerId, setWriterId] = useState<string>(() => characters[0]?.id || '');
  const [tone, setTone] = useState<FicTone>('daily');
  const [view, setView] = useState<FicView>('third');
  const [content, setContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const activeDraft = useMemo(
    () => drafts.find((draft) => draft.id === activeDraftId) || drafts[0] || null,
    [drafts, activeDraftId],
  );
  const effectiveWriterId = writerId || selectedIds[0] || characters[0]?.id || '';
  const selectedCharacters = characters.filter((char) => selectedIds.includes(char.id));

  const persist = (next: FicDraft[], nextActiveId = activeDraftId) => {
    setDrafts(next);
    saveDrafts(next);
    setActiveDraftId(nextActiveId);
  };

  const toggleCharacter = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      return [...prev, id];
    });
  };

  const loadDraft = (draft: FicDraft) => {
    setActiveDraftId(draft.id);
    setTitle(draft.title);
    setScene(draft.scene);
    setSelectedIds(draft.characterIds);
    setTone(draft.tone);
    setView(draft.view);
    setContent(draft.content);
    setWriterId(draft.characterIds[0] || characters[0]?.id || '');
  };

  const clearComposer = () => {
    setActiveDraftId('');
    setTitle('');
    setScene('');
    setContent('');
    setSelectedIds(characters.slice(0, 2).map((char) => char.id));
    setWriterId(characters[0]?.id || '');
    setTone('daily');
    setView('third');
  };

  const saveDraft = () => {
    const cleanContent = content.trim();
    const cleanScene = scene.trim();
    if (!cleanContent && !cleanScene) {
      addToast('先写一点场景或正文', 'error');
      return;
    }
    const now = Date.now();
    const draftTitle = title.trim() || cleanScene.slice(0, 28) || '未命名片段';
    if (activeDraftId && drafts.some((draft) => draft.id === activeDraftId)) {
      const next = drafts.map((draft) => draft.id === activeDraftId
        ? {
          ...draft,
          title: draftTitle,
          scene: cleanScene,
          characterIds: selectedIds,
          tone,
          view,
          content: cleanContent,
          updatedAt: now,
        }
        : draft);
      persist(next, activeDraftId);
    } else {
      const draft: FicDraft = {
        id: `fic-${now}-${Math.random().toString(16).slice(2)}`,
        title: draftTitle,
        scene: cleanScene,
        characterIds: selectedIds,
        tone,
        view,
        content: cleanContent,
        createdAt: now,
        updatedAt: now,
      };
      persist([draft, ...drafts], draft.id);
    }
    addToast('片段已保存', 'success');
  };

  const deleteDraft = (id: string) => {
    const next = drafts.filter((draft) => draft.id !== id);
    persist(next, next[0]?.id || '');
    if (activeDraftId === id) clearComposer();
  };

  const generate = async (mode: 'new' | 'continue') => {
    const cleanScene = scene.trim();
    if (selectedIds.length < 2) {
      addToast('至少选两个角色才好写关系', 'error');
      return;
    }
    if (!cleanScene) {
      addToast('先写一个场景或梗', 'error');
      return;
    }
    if (!apiConfig.apiKey || !apiConfig.baseUrl) {
      addToast('请先配置 API', 'error');
      return;
    }

    const writer = characters.find((char) => char.id === effectiveWriterId);
    setIsGenerating(true);
    try {
      const data = await safeFetchJson(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: writer?.apiModel?.trim() || apiConfig.model,
          messages: buildFanficMessages(selectedCharacters, writer, cleanScene, tone, view, mode === 'continue' ? content : ''),
          temperature: 0.9,
          max_tokens: 3600,
          stream: false,
        }),
      }, 1, 60000);
      const text = extractContent(data);
      if (!text) throw new Error('模型没有返回正文');
      setContent((prev) => mode === 'continue' && prev.trim() ? `${prev.trim()}\n\n${text.trim()}` : text.trim());
    } catch (err: any) {
      addToast(err?.message || '生成失败', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyContent = async () => {
    if (!content.trim()) return;
    await navigator.clipboard?.writeText(content).catch(() => {});
    addToast('已复制正文', 'success');
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#fbf7f1] text-stone-900 md:flex-row">
      <aside className="flex max-h-[46%] w-full shrink-0 flex-col border-b border-stone-200 bg-[#fffaf2] md:max-h-none md:w-[330px] md:border-b-0 md:border-r">
        <div className="border-b border-stone-200 p-4">
          <button
            onClick={closeApp}
            className="mb-3 flex min-h-11 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-bold text-stone-600 shadow-sm active:scale-95 md:hidden"
          >
            <ArrowLeft size={18} weight="bold" />
            返回桌面
          </button>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-stone-900 p-2.5 text-white">
              <BookOpenText size={22} weight="bold" />
            </div>
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.28em] text-stone-400">fic studio</div>
              <h1 className="text-2xl font-black">片场</h1>
            </div>
            <button
              onClick={clearComposer}
              className="ml-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-stone-500 shadow-sm active:scale-95"
              title="新片段"
            >
              <Plus size={20} weight="bold" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {drafts.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-stone-200 p-5 text-center text-sm text-stone-400">
              还没有保存的片段。
            </div>
          ) : drafts.map((draft) => (
            <button
              key={draft.id}
              onClick={() => loadDraft(draft)}
              className={`mb-2 w-full rounded-3xl border p-3 text-left transition ${
                activeDraft?.id === draft.id
                  ? 'border-stone-900 bg-stone-900 text-white'
                  : 'border-stone-200 bg-white/80 hover:bg-white'
              }`}
            >
              <div className="line-clamp-2 text-sm font-black">{draft.title}</div>
              <div className={`mt-2 text-xs ${activeDraft?.id === draft.id ? 'text-stone-300' : 'text-stone-400'}`}>
                {draft.characterIds.length} 人 · {formatTime(draft.updatedAt)}
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-4 md:p-6">
          <header className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.24em] text-stone-400">scene draft</div>
              <h2 className="text-2xl font-black tracking-tight md:text-3xl">写一段他们之间的事</h2>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              <button onClick={saveDraft} className="flex min-h-11 items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm font-bold text-white">
                <FloppyDisk size={18} weight="bold" />
                保存
              </button>
              {activeDraftId && (
                <button onClick={() => deleteDraft(activeDraftId)} className="flex min-h-11 items-center justify-center rounded-full border border-red-100 bg-red-50 px-3 text-red-500">
                  <Trash size={18} />
                </button>
              )}
            </div>
          </header>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="rounded-3xl border border-stone-200 bg-white p-4">
                <label className="text-xs font-black uppercase text-stone-400">标题</label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="可以不写，保存时自动取场景开头"
                  className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none focus:border-stone-400"
                />
              </div>

              <div className="rounded-3xl border border-stone-200 bg-white p-4">
                <div className="mb-3 text-xs font-black uppercase text-stone-400">参与角色</div>
                <div className="grid grid-cols-2 gap-2">
                  {characters.map((char) => {
                    const active = selectedIds.includes(char.id);
                    return (
                      <button
                        key={char.id}
                        onClick={() => toggleCharacter(char.id)}
                        className={`flex min-h-12 items-center gap-2 rounded-2xl border px-3 py-2 text-left text-sm font-bold transition ${
                          active ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-stone-50 text-stone-600'
                        }`}
                      >
                        <img src={char.avatar} className="h-7 w-7 shrink-0 rounded-full object-cover" />
                        <span className="truncate">{char.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-3xl border border-stone-200 bg-white p-4">
                <label className="text-xs font-black uppercase text-stone-400">执笔模型</label>
                <select
                  value={effectiveWriterId}
                  onChange={(event) => setWriterId(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none"
                >
                  {characters.map((char) => (
                    <option key={char.id} value={char.id}>{char.name}{char.apiModel ? ` · ${char.apiModel}` : ''}</option>
                  ))}
                </select>
              </div>

              <div className="rounded-3xl border border-stone-200 bg-white p-4">
                <div className="mb-3 text-xs font-black uppercase text-stone-400">风格</div>
                <div className="grid grid-cols-2 gap-2">
                  {toneOptions.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setTone(item.id)}
                      className={`rounded-2xl border px-3 py-2 text-left text-sm font-bold ${
                        tone === item.id ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-stone-200 bg-stone-50 text-stone-600'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-stone-200 bg-white p-4">
                <div className="mb-3 text-xs font-black uppercase text-stone-400">视角</div>
                <div className="space-y-2">
                  {viewOptions.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setView(item.id)}
                      className={`w-full rounded-2xl border px-3 py-2 text-left text-sm font-bold ${
                        view === item.id ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-stone-50 text-stone-600'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <textarea
                value={scene}
                onChange={(event) => setScene(event.target.value)}
                placeholder="写场景、梗、关系张力、想要的对白。比如：他们在休息室里因为一句玩笑突然安静下来。"
                className="min-h-[130px] w-full resize-y rounded-3xl border border-stone-200 bg-white p-5 text-sm leading-7 outline-none focus:border-stone-400"
              />

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => generate('new')}
                  disabled={isGenerating}
                  className="flex min-h-11 items-center gap-2 rounded-full bg-rose-600 px-5 py-2 text-sm font-black text-white disabled:opacity-40"
                >
                  <Sparkle size={18} weight="fill" />
                  {isGenerating ? '生成中...' : '生成片段'}
                </button>
                <button
                  onClick={() => generate('continue')}
                  disabled={isGenerating || !content.trim()}
                  className="min-h-11 rounded-full border border-stone-200 bg-white px-5 py-2 text-sm font-bold text-stone-700 disabled:opacity-40"
                >
                  续写
                </button>
                <button
                  onClick={saveDraft}
                  className="flex min-h-11 items-center gap-2 rounded-full border border-stone-200 bg-white px-5 py-2 text-sm font-bold text-stone-700 md:hidden"
                >
                  <FloppyDisk size={18} weight="bold" />
                  保存
                </button>
                <button
                  onClick={copyContent}
                  disabled={!content.trim()}
                  className="flex min-h-11 items-center gap-2 rounded-full border border-stone-200 bg-white px-5 py-2 text-sm font-bold text-stone-700 disabled:opacity-40"
                >
                  <Copy size={18} weight="bold" />
                  复制
                </button>
              </div>

              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="生成或手写的正文会在这里。你可以直接改，再保存。"
                className="min-h-[420px] w-full resize-y rounded-3xl border border-stone-200 bg-white p-6 text-[15px] leading-8 text-stone-800 outline-none focus:border-stone-400"
              />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default FanficApp;
