import React, { useMemo, useState } from 'react';
import { ArrowLeft, ChatCircleText, Plus, Trash, Sparkle, PencilSimple, UserCircle } from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import { CharacterProfile } from '../types';
import { safeFetchJson, extractContent } from '../utils/safeApi';

type DiscussionAuthorType = 'user' | 'character';
type DiscussionEntrySource = 'manual' | 'ai';

interface DiscussionEntry {
  id: string;
  authorType: DiscussionAuthorType;
  authorName: string;
  characterId?: string;
  content: string;
  source: DiscussionEntrySource;
  createdAt: number;
}

interface DiscussionTopic {
  id: string;
  title: string;
  brief: string;
  createdAt: number;
  updatedAt: number;
  entries: DiscussionEntry[];
}

const STORAGE_KEY = 'sullyos_discussion_topics_v1';

const loadTopics = (): DiscussionTopic[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveTopics = (topics: DiscussionTopic[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(topics));
};

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const buildDiscussionPrompt = (
  topic: DiscussionTopic,
  char: CharacterProfile,
  userName: string,
) => {
  const existing = topic.entries.length
    ? topic.entries.map(e => `【${e.authorName}】\n${e.content}`).join('\n\n---\n\n')
    : '暂无已有观点。';

  return [
    {
      role: 'system',
      content: `你是「${char.name}」。以下是你的角色设定，请按它说话，但不要把自己写成聊天机器人。\n\n${char.systemPrompt || char.description || ''}\n\n你正在一个轻量讨论板里写自己的想法，不是即时聊天。你可以写长段，可以犹豫、保留、分层表达，也可以不同意别人。不要替其他角色说话，不要总结所有人，不要为了讨好${userName}而改口。`,
    },
    {
      role: 'user',
      content: `讨论议题：${topic.title}\n\n补充说明：${topic.brief || '无'}\n\n已有想法：\n${existing}\n\n请以「${char.name}」自己的口吻写一段观点。允许 2-6 段长输出。重点是写你自己的判断、感受、疑问或保留意见，不要写成会议纪要，也不要替别人下结论。`,
    },
  ];
};

const DiscussionApp: React.FC = () => {
  const { closeApp, characters, userProfile, apiConfig, addToast } = useOS();
  const [topics, setTopics] = useState<DiscussionTopic[]>(() => loadTopics());
  const [activeTopicId, setActiveTopicId] = useState<string>(() => loadTopics()[0]?.id || '');
  const [newTitle, setNewTitle] = useState('');
  const [newBrief, setNewBrief] = useState('');
  const [userDraft, setUserDraft] = useState('');
  const [selectedCharId, setSelectedCharId] = useState(characters[0]?.id || '');
  const [isGenerating, setIsGenerating] = useState(false);

  const activeTopic = useMemo(
    () => topics.find(t => t.id === activeTopicId) || topics[0] || null,
    [topics, activeTopicId],
  );
  const effectiveSelectedCharId = selectedCharId || characters[0]?.id || '';

  const persist = (next: DiscussionTopic[], nextActiveId = activeTopicId) => {
    setTopics(next);
    saveTopics(next);
    setActiveTopicId(nextActiveId);
  };

  const createTopic = () => {
    const title = newTitle.trim();
    if (!title) return;
    const now = Date.now();
    const topic: DiscussionTopic = {
      id: `topic-${now}`,
      title,
      brief: newBrief.trim(),
      createdAt: now,
      updatedAt: now,
      entries: [],
    };
    persist([topic, ...topics], topic.id);
    setNewTitle('');
    setNewBrief('');
  };

  const deleteTopic = (id: string) => {
    const next = topics.filter(t => t.id !== id);
    persist(next, next[0]?.id || '');
  };

  const addEntry = (entry: Omit<DiscussionEntry, 'id' | 'createdAt'>) => {
    if (!activeTopic || !entry.content.trim()) return;
    const now = Date.now();
    const next = topics.map(t => {
      if (t.id !== activeTopic.id) return t;
      return {
        ...t,
        updatedAt: now,
        entries: [
          ...t.entries,
          {
            ...entry,
            id: `entry-${now}-${Math.random().toString(16).slice(2)}`,
            content: entry.content.trim(),
            createdAt: now,
          },
        ],
      };
    });
    persist(next);
  };

  const addUserEntry = () => {
    const content = userDraft.trim();
    if (!content) return;
    addEntry({
      authorType: 'user',
      authorName: userProfile.name || '我',
      content,
      source: 'manual',
    });
    setUserDraft('');
  };

  const generateCharacterEntry = async () => {
    if (!activeTopic) return;
    const char = characters.find(c => c.id === effectiveSelectedCharId);
    if (!char) {
      addToast('请选择角色', 'error');
      return;
    }
    if (!apiConfig.apiKey || !apiConfig.baseUrl) {
      addToast('请先配置 API', 'error');
      return;
    }

    setIsGenerating(true);
    try {
      const data = await safeFetchJson(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: char.apiModel?.trim() || apiConfig.model,
          messages: buildDiscussionPrompt(activeTopic, char, userProfile.name || '用户'),
          temperature: 0.85,
          max_tokens: 3000,
          stream: false,
        }),
      });
      const content = extractContent(data).trim();
      if (!content) throw new Error('模型没有返回内容');
      addEntry({
        authorType: 'character',
        authorName: char.name,
        characterId: char.id,
        content,
        source: 'ai',
      });
    } catch (err: any) {
      addToast(err?.message || '生成失败', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteEntry = (entryId: string) => {
    if (!activeTopic) return;
    const now = Date.now();
    const next = topics.map(t => t.id === activeTopic.id
      ? { ...t, updatedAt: now, entries: t.entries.filter(e => e.id !== entryId) }
      : t);
    persist(next);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f7f7f4] text-slate-900 md:flex-row">
      <aside className="flex max-h-[44%] w-full shrink-0 flex-col border-b border-slate-200 bg-white md:max-h-none md:w-[310px] md:border-b-0 md:border-r">
        <div className="border-b border-slate-100 p-4">
          <button
            onClick={closeApp}
            className="mb-3 flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm active:scale-95 md:hidden"
          >
            <ArrowLeft size={18} weight="bold" />
            返回桌面
          </button>

          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-slate-900 p-2 text-white">
              <ChatCircleText className="h-5 w-5" weight="bold" />
            </div>
            <div>
              <h1 className="text-base font-black">讨论</h1>
              <p className="text-xs text-slate-400">议题 / 长段观点 / 手动调用</p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="输入一个议题"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
            <textarea
              value={newBrief}
              onChange={e => setNewBrief(e.target.value)}
              placeholder="补充说明，可不写"
              className="h-20 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
            <button
              onClick={createTopic}
              disabled={!newTitle.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              <Plus className="h-4 w-4" weight="bold" />
              新建议题
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {topics.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-400">
              还没有议题。
            </div>
          ) : topics.map(topic => (
            <button
              key={topic.id}
              onClick={() => setActiveTopicId(topic.id)}
              className={`mb-2 w-full rounded-2xl border p-3 text-left transition ${
                activeTopic?.id === topic.id
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-100 bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className="line-clamp-2 text-sm font-black">{topic.title}</div>
              <div className={`mt-2 text-xs ${activeTopic?.id === topic.id ? 'text-slate-300' : 'text-slate-400'}`}>
                {topic.entries.length} 条观点 · {formatTime(topic.updatedAt)}
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {!activeTopic ? (
          <div className="flex h-full items-center justify-center p-8 text-center text-slate-400">
            建一个议题，然后让大家慢慢写。
          </div>
        ) : (
          <div className="mx-auto max-w-5xl p-4 md:p-6">
            <header className="border-b border-slate-200 pb-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-2xl font-black tracking-tight md:text-3xl">{activeTopic.title}</h2>
                  {activeTopic.brief && (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-500">{activeTopic.brief}</p>
                  )}
                </div>
                <button
                  onClick={() => deleteTopic(activeTopic.id)}
                  className="rounded-xl border border-red-100 bg-red-50 p-2 text-red-500 hover:bg-red-100"
                  title="删除议题"
                >
                  <Trash className="h-4 w-4" />
                </button>
              </div>
            </header>

            <section className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-3">
                <textarea
                  value={userDraft}
                  onChange={e => setUserDraft(e.target.value)}
                  placeholder="写下你的想法。这里可以写长段，不用像聊天一样短。"
                  className="min-h-[150px] w-full resize-y rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 outline-none focus:border-slate-400"
                />
                <button
                  onClick={addUserEntry}
                  disabled={!userDraft.trim()}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                >
                  保存我的想法
                </button>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-black uppercase text-slate-400">角色观点</div>
                <select
                  value={effectiveSelectedCharId}
                  onChange={e => setSelectedCharId(e.target.value)}
                  className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none"
                >
                  {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button
                  onClick={generateCharacterEntry}
                  disabled={isGenerating || !effectiveSelectedCharId}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                >
                  <Sparkle className="h-4 w-4" weight="fill" />
                  {isGenerating ? '生成中...' : '让这个角色写'}
                </button>
                <p className="mt-3 text-xs leading-5 text-slate-400">
                  不会自动轮询。每次只调用你选中的角色，使用该角色自己的模型设置。
                </p>
              </div>
            </section>

            <section className="mt-6 space-y-4">
              {activeTopic.entries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center text-sm text-slate-400">
                  这里还没有观点。
                </div>
              ) : activeTopic.entries.map(entry => {
                const char = entry.characterId ? characters.find(c => c.id === entry.characterId) : null;
                return (
                  <article key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        {char?.avatar ? (
                          <img src={char.avatar} className="h-10 w-10 rounded-xl object-cover" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                            {entry.authorType === 'user' ? <UserCircle className="h-6 w-6" /> : <PencilSimple className="h-5 w-5" />}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black">{entry.authorName}</div>
                          <div className="text-xs text-slate-400">
                            {formatTime(entry.createdAt)} · {entry.source === 'ai' ? '角色生成' : '手写'}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => deleteEntry(entry.id)}
                        className="rounded-lg p-2 text-slate-300 hover:bg-red-50 hover:text-red-500"
                        title="删除观点"
                      >
                        <Trash className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="whitespace-pre-wrap text-[15px] leading-8 text-slate-700">
                      {entry.content}
                    </div>
                  </article>
                );
              })}
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default DiscussionApp;
