import React, { useMemo, useState } from 'react';
import { ArrowLeft, Copy, FloppyDisk, MoonStars, Plus, Sparkle, Trash } from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import { CharacterProfile } from '../types';
import { extractContent, safeFetchJson } from '../utils/safeApi';

type HeatLevel = 'low' | 'medium' | 'high';
type PointOfView = 'third' | 'close_one' | 'alternating';
type ConsentFrame = 'lovers' | 'negotiated' | 'reunion' | 'teasing';

interface AdultDraft {
  id: string;
  title: string;
  characterIds: string[];
  writerId: string;
  heat: HeatLevel;
  pov: PointOfView;
  frame: ConsentFrame;
  tags: string[];
  scene: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'sullyos_adult_fic_drafts_v1';

const heatOptions: Array<{ id: HeatLevel; label: string; hint: string }> = [
  { id: 'low', label: '低', hint: '暧昧、触碰、亲吻、心理张力。' },
  { id: 'medium', label: '中', hint: '明确身体亲密；可包含隔衣摩擦、手部亲密、素股和克制反应。' },
  { id: 'high', label: '高', hint: '成人内容更直接，但仍保留同意、回应与可停止机制。' },
];

const povOptions: Array<{ id: PointOfView; label: string }> = [
  { id: 'third', label: '第三人称' },
  { id: 'close_one', label: '贴近一人视角' },
  { id: 'alternating', label: '双人交替感' },
];

const frameOptions: Array<{ id: ConsentFrame; label: string; hint: string }> = [
  { id: 'lovers', label: '恋人亲密', hint: '默认有信任基础，写熟悉和默契。' },
  { id: 'negotiated', label: '约定玩法', hint: '事先说清规则，保留安全词或可停止机制。' },
  { id: 'reunion', label: '久别重逢', hint: '克制很久后的靠近、确认和失控边缘。' },
  { id: 'teasing', label: '暧昧拉扯', hint: '试探、嘴硬、故意逗，但不默认升级。' },
];

const playTags = [
  '暧昧拉扯',
  '恋人亲密',
  '支配/服从',
  '困倦/半梦半醒',
  '占有欲',
  '事后照顾',
  '吵架和好',
  '禁忌感',
  '素股',
  '手部亲密',
  '隔衣摩擦',
  '低声确认',
];

const loadDrafts = (): AdultDraft[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveDrafts = (drafts: AdultDraft[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
};

const formatTime = (ts: number) => new Date(ts).toLocaleString([], {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const buildMessages = (
  selectedCharacters: CharacterProfile[],
  writer: CharacterProfile | undefined,
  scene: string,
  content: string,
  heat: HeatLevel,
  pov: PointOfView,
  frame: ConsentFrame,
  tags: string[],
  userName: string,
  mode: 'new' | 'continue',
) => {
  const castNames = selectedCharacters.map((char) => char.name).join('、');
  const cast = selectedCharacters.map((char) => (
    `【${char.name}】\n简介：${char.description || '无'}\n设定：${char.systemPrompt || '无'}`
  )).join('\n\n---\n\n');
  const heatInfo = heatOptions.find((item) => item.id === heat);
  const povInfo = povOptions.find((item) => item.id === pov);
  const frameInfo = frameOptions.find((item) => item.id === frame);
  const previous = mode === 'continue' && content.trim()
    ? `\n\n已有正文，请在其后自然续写，不要重复开头：\n${content.trim()}`
    : '';

  return [
    {
      role: 'system',
      content: `你是成人向文学片段写作者，任务是写“成年虚构角色与成年虚构角色之间”的关系张力和亲密片段。

硬性边界：
- 所有参与者必须是成年人。若输入暗示未成年，拒绝写成人内容。
- 只写双方自愿、可回应、可停止的亲密关系。不要写强迫、性暴力、威胁、勒索、真实无法同意状态下的性行为。
- 不写血亲乱伦，不色情化真实人物，不把用户、读者、{{user}} 或委托人写进正文。
- 困倦、半梦半醒、假装睡着、支配/服从等玩法，必须写成成年人之间事先约定或过程中仍能确认意愿的情境。
- 如果包含边界玩法，正文里用自然方式体现确认、默契、安全词、停顿、询问、回应或事后照顾，不要写成规则说明。

写作方向：
- 重点写欲望、犹豫、关系权力、身体反应、情绪连续性和角色独有的说话方式。
- 可以写直接的成人内容，但必须有审美和人物关系，不要像说明书。
- 不暴露 API、prompt、模型等后台词，不做道德说教，不列提纲。
- 正文只围绕本次选择的角色展开：${castNames || '所选角色'}。`,
    },
    {
      role: 'user',
      content: `参与角色（正文主角只能从这里选）：\n${cast}

用户/导演名字：${userName || '用户'}（只用于理解委托来源，不得进入正文）
执笔参考角色：${writer?.name || '全局模型'}
尺度：${heatInfo?.label || heat} - ${heatInfo?.hint || ''}
关系框架：${frameInfo?.label || frame} - ${frameInfo?.hint || ''}
视角：${povInfo?.label || pov}
玩法标签：${tags.length ? tags.join('、') : '无'}

场景 / 梗 / 想写的东西：
${scene.trim()}${previous}

请写一段 900-2000 字左右的成人向文学片段。直接输出正文，不要标题，不要解释，不要列安全规则。`,
    },
  ];
};

const AdultFicApp: React.FC = () => {
  const { closeApp, characters, apiConfig, addToast, userProfile } = useOS();
  const [drafts, setDrafts] = useState<AdultDraft[]>(() => loadDrafts());
  const [activeDraftId, setActiveDraftId] = useState(() => loadDrafts()[0]?.id || '');
  const [title, setTitle] = useState('');
  const [scene, setScene] = useState('');
  const [content, setContent] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>(() => characters.slice(0, 2).map((char) => char.id));
  const [writerId, setWriterId] = useState(() => characters[0]?.id || '');
  const [heat, setHeat] = useState<HeatLevel>('medium');
  const [pov, setPov] = useState<PointOfView>('third');
  const [frame, setFrame] = useState<ConsentFrame>('lovers');
  const [tags, setTags] = useState<string[]>(['暧昧拉扯', '低声确认']);
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const activeDraft = useMemo(
    () => drafts.find((draft) => draft.id === activeDraftId) || drafts[0] || null,
    [drafts, activeDraftId],
  );
  const selectedCharacters = characters.filter((char) => selectedIds.includes(char.id));
  const effectiveWriterId = writerId || selectedIds[0] || characters[0]?.id || '';

  const persist = (next: AdultDraft[], nextActiveId = activeDraftId) => {
    setDrafts(next);
    saveDrafts(next);
    setActiveDraftId(nextActiveId);
  };

  const toggleCharacter = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  };

  const toggleTag = (tag: string) => {
    setTags((prev) => prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]);
  };

  const clearComposer = () => {
    setActiveDraftId('');
    setTitle('');
    setScene('');
    setContent('');
    setSelectedIds(characters.slice(0, 2).map((char) => char.id));
    setWriterId(characters[0]?.id || '');
    setHeat('medium');
    setPov('third');
    setFrame('lovers');
    setTags(['暧昧拉扯', '低声确认']);
    setAdultConfirmed(false);
  };

  const loadDraft = (draft: AdultDraft) => {
    setActiveDraftId(draft.id);
    setTitle(draft.title);
    setScene(draft.scene);
    setContent(draft.content);
    setSelectedIds(draft.characterIds);
    setWriterId(draft.writerId || draft.characterIds[0] || characters[0]?.id || '');
    setHeat(draft.heat);
    setPov(draft.pov);
    setFrame(draft.frame);
    setTags(draft.tags || []);
    setAdultConfirmed(true);
  };

  const saveDraft = () => {
    const cleanScene = scene.trim();
    const cleanContent = content.trim();
    if (!cleanScene && !cleanContent) {
      addToast('先写一点场景或正文', 'error');
      return;
    }
    const now = Date.now();
    const draftTitle = title.trim() || cleanScene.slice(0, 28) || '未命名暗页';
    const base: Omit<AdultDraft, 'id' | 'createdAt'> = {
      title: draftTitle,
      characterIds: selectedIds,
      writerId: effectiveWriterId,
      heat,
      pov,
      frame,
      tags,
      scene: cleanScene,
      content: cleanContent,
      updatedAt: now,
    };

    if (activeDraftId && drafts.some((draft) => draft.id === activeDraftId)) {
      persist(drafts.map((draft) => draft.id === activeDraftId ? { ...draft, ...base } : draft), activeDraftId);
    } else {
      const draft: AdultDraft = {
        ...base,
        id: `adult-${now}-${Math.random().toString(16).slice(2)}`,
        createdAt: now,
      };
      persist([draft, ...drafts], draft.id);
    }
    addToast('暗页已保存', 'success');
  };

  const deleteDraft = (id: string) => {
    const next = drafts.filter((draft) => draft.id !== id);
    persist(next, next[0]?.id || '');
    if (activeDraftId === id) clearComposer();
  };

  const generate = async (mode: 'new' | 'continue') => {
    if (!adultConfirmed) {
      addToast('请先确认参与角色均为成年人，且场景基于自愿', 'error');
      return;
    }
    if (selectedIds.length < 2) {
      addToast('至少选择两个角色', 'error');
      return;
    }
    if (!scene.trim()) {
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
          messages: buildMessages(selectedCharacters, writer, scene, content, heat, pov, frame, tags, userProfile.name, mode),
          temperature: 0.92,
          max_tokens: 4200,
          stream: false,
        }),
      }, 1, 90000);
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
    <div className="flex h-full min-h-0 flex-col bg-[#170f17] text-rose-50 md:flex-row">
      <aside className="flex max-h-[38%] w-full shrink-0 flex-col border-b border-rose-200/10 bg-[#211522] md:max-h-none md:w-[340px] md:border-b-0 md:border-r">
        <div className="border-b border-rose-200/10 p-4">
          <button
            onClick={closeApp}
            className="mb-3 flex min-h-11 items-center gap-2 rounded-full border border-rose-100/10 bg-white/5 px-4 py-2 text-sm font-bold text-rose-100 active:scale-95 md:hidden"
          >
            <ArrowLeft size={18} weight="bold" />
            返回桌面
          </button>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-rose-200 p-2.5 text-[#211522]">
              <MoonStars size={22} weight="fill" />
            </div>
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.28em] text-rose-200/50">adult fic room</div>
              <h1 className="text-2xl font-black">暗页</h1>
            </div>
            <button
              onClick={clearComposer}
              className="ml-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/8 text-rose-100 active:scale-95"
              title="新暗页"
            >
              <Plus size={20} weight="bold" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {drafts.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-rose-100/15 p-5 text-center text-sm text-rose-100/45">
              还没有保存的暗页。
            </div>
          ) : drafts.map((draft) => (
            <button
              key={draft.id}
              onClick={() => loadDraft(draft)}
              className={`mb-2 w-full rounded-3xl border p-3 text-left transition ${
                activeDraft?.id === draft.id
                  ? 'border-rose-200 bg-rose-200 text-[#211522]'
                  : 'border-rose-100/10 bg-white/5 text-rose-50 hover:bg-white/10'
              }`}
            >
              <div className="line-clamp-2 text-sm font-black">{draft.title}</div>
              <div className={`mt-2 text-xs ${activeDraft?.id === draft.id ? 'text-[#65405b]' : 'text-rose-100/45'}`}>
                {draft.characterIds.length} 人 / {draft.heat} / {formatTime(draft.updatedAt)}
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-4 md:p-6">
          <header className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.24em] text-rose-200/45">private draft</div>
              <h2 className="text-2xl font-black tracking-tight md:text-3xl">成年角色之间的亲密片段</h2>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              <button onClick={saveDraft} className="flex min-h-11 items-center gap-2 rounded-full bg-rose-200 px-4 py-2 text-sm font-bold text-[#211522]">
                <FloppyDisk size={18} weight="bold" />
                保存
              </button>
              {activeDraftId && (
                <button onClick={() => deleteDraft(activeDraftId)} className="flex min-h-11 items-center justify-center rounded-full border border-red-300/20 bg-red-500/10 px-3 text-red-200">
                  <Trash size={18} />
                </button>
              )}
            </div>
          </header>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[370px_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="rounded-3xl border border-rose-100/10 bg-white/[0.06] p-4">
                <label className="text-xs font-black uppercase text-rose-200/50">标题</label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="可不写，保存时自动取场景开头"
                  className="mt-2 w-full rounded-2xl border border-rose-100/10 bg-black/20 px-4 py-3 text-sm text-rose-50 outline-none placeholder:text-rose-100/25 focus:border-rose-200/50"
                />
              </div>

              <div className="rounded-3xl border border-rose-100/10 bg-white/[0.06] p-4">
                <div className="mb-3 text-xs font-black uppercase text-rose-200/50">参与角色</div>
                <div className="grid grid-cols-2 gap-2">
                  {characters.map((char) => {
                    const active = selectedIds.includes(char.id);
                    return (
                      <button
                        key={char.id}
                        onClick={() => toggleCharacter(char.id)}
                        className={`flex min-h-12 items-center gap-2 rounded-2xl border px-3 py-2 text-left text-sm font-bold transition ${
                          active ? 'border-rose-200 bg-rose-200 text-[#211522]' : 'border-rose-100/10 bg-black/20 text-rose-50'
                        }`}
                      >
                        <img src={char.avatar} className="h-7 w-7 shrink-0 rounded-full object-cover" alt="" />
                        <span className="truncate">{char.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-3xl border border-rose-100/10 bg-white/[0.06] p-4">
                <label className="text-xs font-black uppercase text-rose-200/50">执笔模型</label>
                <select
                  value={effectiveWriterId}
                  onChange={(event) => setWriterId(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-rose-100/10 bg-[#211522] px-4 py-3 text-sm text-rose-50 outline-none"
                >
                  {characters.map((char) => (
                    <option key={char.id} value={char.id}>{char.name}{char.apiModel ? ` / ${char.apiModel}` : ''}</option>
                  ))}
                </select>
              </div>

              <div className="rounded-3xl border border-rose-100/10 bg-white/[0.06] p-4">
                <div className="mb-3 text-xs font-black uppercase text-rose-200/50">尺度</div>
                <div className="space-y-2">
                  {heatOptions.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setHeat(item.id)}
                      className={`w-full rounded-2xl border px-3 py-2 text-left transition ${
                        heat === item.id ? 'border-rose-200 bg-rose-200 text-[#211522]' : 'border-rose-100/10 bg-black/20 text-rose-50'
                      }`}
                    >
                      <div className="text-sm font-black">{item.label}</div>
                      <div className={`mt-1 text-xs ${heat === item.id ? 'text-[#6b475c]' : 'text-rose-100/45'}`}>{item.hint}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-rose-100/10 bg-white/[0.06] p-4">
                <div className="mb-3 text-xs font-black uppercase text-rose-200/50">关系框架</div>
                <div className="grid grid-cols-2 gap-2">
                  {frameOptions.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setFrame(item.id)}
                      className={`rounded-2xl border px-3 py-2 text-left text-sm font-bold ${
                        frame === item.id ? 'border-rose-200 bg-rose-200 text-[#211522]' : 'border-rose-100/10 bg-black/20 text-rose-50'
                      }`}
                      title={item.hint}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-rose-100/10 bg-white/[0.06] p-4">
                <div className="mb-3 text-xs font-black uppercase text-rose-200/50">玩法标签</div>
                <div className="flex flex-wrap gap-2">
                  {playTags.map((tag) => {
                    const active = tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`min-h-10 rounded-full border px-3 text-xs font-bold ${
                          active ? 'border-rose-200 bg-rose-200 text-[#211522]' : 'border-rose-100/10 bg-black/20 text-rose-100/75'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-3xl border border-rose-100/10 bg-white/[0.06] p-4">
                <div className="mb-3 text-xs font-black uppercase text-rose-200/50">视角</div>
                <div className="grid grid-cols-1 gap-2">
                  {povOptions.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setPov(item.id)}
                      className={`rounded-2xl border px-3 py-2 text-left text-sm font-bold ${
                        pov === item.id ? 'border-rose-200 bg-rose-200 text-[#211522]' : 'border-rose-100/10 bg-black/20 text-rose-50'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex cursor-pointer gap-3 rounded-3xl border border-rose-100/10 bg-white/[0.06] p-4 text-sm leading-6 text-rose-50">
                <input
                  type="checkbox"
                  checked={adultConfirmed}
                  onChange={(event) => setAdultConfirmed(event.target.checked)}
                  className="mt-1 h-5 w-5 accent-rose-200"
                />
                <span>我确认参与角色均为成年人，且场景基于自愿、可回应、可停止的亲密互动。</span>
              </label>
            </div>

            <div className="space-y-4">
              <textarea
                value={scene}
                onChange={(event) => setScene(event.target.value)}
                placeholder="写场景、梗、关系张力、想要的玩法或对白。比如：他们明明刚吵完，却在门口停得太近；其中一方先低声确认还能不能继续。"
                className="min-h-[135px] w-full resize-y rounded-3xl border border-rose-100/10 bg-white/[0.08] p-5 text-sm leading-7 text-rose-50 outline-none placeholder:text-rose-100/25 focus:border-rose-200/50"
              />

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => generate('new')}
                  disabled={isGenerating}
                  className="flex min-h-11 items-center gap-2 rounded-full bg-rose-200 px-5 py-2 text-sm font-black text-[#211522] disabled:opacity-40"
                >
                  <Sparkle size={18} weight="fill" />
                  {isGenerating ? '生成中...' : '生成暗页'}
                </button>
                <button
                  onClick={() => generate('continue')}
                  disabled={isGenerating || !content.trim()}
                  className="min-h-11 rounded-full border border-rose-100/10 bg-white/8 px-5 py-2 text-sm font-bold text-rose-50 disabled:opacity-40"
                >
                  续写
                </button>
                <button
                  onClick={saveDraft}
                  className="flex min-h-11 items-center gap-2 rounded-full border border-rose-100/10 bg-white/8 px-5 py-2 text-sm font-bold text-rose-50 md:hidden"
                >
                  <FloppyDisk size={18} weight="bold" />
                  保存
                </button>
                <button
                  onClick={copyContent}
                  disabled={!content.trim()}
                  className="flex min-h-11 items-center gap-2 rounded-full border border-rose-100/10 bg-white/8 px-5 py-2 text-sm font-bold text-rose-50 disabled:opacity-40"
                >
                  <Copy size={18} weight="bold" />
                  复制
                </button>
              </div>

              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="生成或手写的正文会在这里。你可以直接改，再保存。"
                className="min-h-[500px] w-full resize-y rounded-3xl border border-rose-100/10 bg-[#fff7f1] p-6 text-[15px] leading-8 text-[#2a1724] outline-none focus:border-rose-300"
              />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default AdultFicApp;
