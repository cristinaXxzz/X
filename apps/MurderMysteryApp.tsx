import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Cards,
  Detective,
  FileText,
  FloppyDisk,
  Plus,
  Sparkle,
  Trash,
  UploadSimple,
  UserCircle,
} from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import { CharacterProfile } from '../types';
import { extractContent, safeFetchJson } from '../utils/safeApi';

type MysteryPhase = 'setup' | 'opening' | 'intro' | 'discussion' | 'search' | 'vote' | 'reveal';
type PlayerKind = 'user' | 'character';
type NoteVisibility = 'public' | 'private';

interface MysteryPlayer {
  id: string;
  kind: PlayerKind;
  name: string;
  characterId?: string;
  scriptRoleName: string;
  privateScript: string;
}

interface MysteryNote {
  id: string;
  visibility: NoteVisibility;
  speaker: string;
  content: string;
  targetPlayerId?: string;
  createdAt: number;
}

interface MysteryClue {
  id: string;
  title: string;
  content: string;
  visibility: NoteVisibility;
  targetPlayerId?: string;
  revealed: boolean;
  createdAt: number;
}

interface MysteryCase {
  id: string;
  title: string;
  premise: string;
  dmGuide: string;
  phase: MysteryPhase;
  players: MysteryPlayer[];
  notes: MysteryNote[];
  clues: MysteryClue[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'sullyos_murder_mystery_cases_v1';

const phaseOptions: Array<{ id: MysteryPhase; label: string }> = [
  { id: 'setup', label: '准备' },
  { id: 'opening', label: '开场' },
  { id: 'intro', label: '自我介绍' },
  { id: 'discussion', label: '自由讨论' },
  { id: 'search', label: '搜证' },
  { id: 'vote', label: '投票' },
  { id: 'reveal', label: '复盘' },
];

const loadCases = (): MysteryCase[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveCases = (cases: MysteryCase[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
};

const nowId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const formatTime = (ts: number) => (
  new Date(ts).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
);

const safeJsonObject = (text: string): any | null => {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
};

const buildDmMessages = (game: MysteryCase) => {
  const players = game.players.map((p) => (
    `- playerId=${p.id}; 玩家=${p.name}; 剧本角色=${p.scriptRoleName || '未命名'}; 类型=${p.kind}`
  )).join('\n');
  const publicClues = game.clues
    .filter((c) => c.revealed && c.visibility === 'public')
    .map((c) => `【${c.title}】\n${c.content}`)
    .join('\n\n');
  const publicNotes = game.notes
    .filter((n) => n.visibility === 'public')
    .map((n) => `【${n.speaker}】\n${n.content}`)
    .join('\n\n---\n\n');

  return [
    {
      role: 'system',
      content: `你是剧本杀 DM。你能看完整剧本，但必须严格做信息隔离。

最高优先级：
- DM 可以知道完整真相，但玩家只能知道公开信息和自己私本。
- 不要替玩家发言，不要替玩家推理结论。
- 不要提前剧透凶手、核心谜底或未公开线索。
- 如果要给私密信息，必须标明 targetPlayerId。
- 输出必须是 JSON，不要 markdown，不要额外解释。

JSON 格式：
{
  "phase": "opening/intro/discussion/search/vote/reveal",
  "dmNarration": "公开给所有玩家看的主持词",
  "publicClues": [{"title":"线索名","content":"公开线索内容"}],
  "privateNotes": [{"targetPlayerId":"玩家id","content":"只给该玩家的提示"}]
}`,
    },
    {
      role: 'user',
      content: `案件标题：${game.title}
当前阶段：${game.phase}

【公开导入】
${game.premise || '无'}

【DM 总资料 / 完整剧本】
${game.dmGuide || '无'}

【玩家列表】
${players || '暂无玩家'}

【已公开线索】
${publicClues || '暂无'}

【公开讨论记录】
${publicNotes || '暂无'}

请作为 DM 推进下一小步。不要一次性推完整局，只给当前阶段自然需要的一小段主持词、必要公开线索、必要私密提示。`,
    },
  ];
};

const buildPlayerMessages = (
  game: MysteryCase,
  player: MysteryPlayer,
  char: CharacterProfile | undefined,
) => {
  const publicClues = game.clues
    .filter((c) => c.revealed && c.visibility === 'public')
    .map((c) => `【${c.title}】\n${c.content}`)
    .join('\n\n');
  const privateClues = game.clues
    .filter((c) => c.revealed && c.visibility === 'private' && c.targetPlayerId === player.id)
    .map((c) => `【${c.title}】\n${c.content}`)
    .join('\n\n');
  const privateNotes = game.notes
    .filter((n) => n.visibility === 'private' && n.targetPlayerId === player.id)
    .map((n) => `【DM 私密提示】\n${n.content}`)
    .join('\n\n');
  const publicNotes = game.notes
    .filter((n) => n.visibility === 'public')
    .slice(-30)
    .map((n) => `【${n.speaker}】\n${n.content}`)
    .join('\n\n---\n\n');

  return [
    {
      role: 'system',
      content: `你正在玩剧本杀。你不是 DM，你是玩家“${player.name}”，扮演剧本角色“${player.scriptRoleName || player.name}”。

角色设定参考：
${char?.systemPrompt || char?.description || '无'}

信息隔离规则：
- 你只能根据自己角色本、公开线索、公开讨论、DM 给你的私密提示发言。
- 不要假装知道自己没看到的信息。
- 不要读取或引用其他玩家私本。
- 不要替其他玩家说话。
- 可以隐瞒、试探、转移话题、提出疑问，但不要越权剧透。
- 输出玩家公开发言即可，不要写旁白标签，不要 JSON。`,
    },
    {
      role: 'user',
      content: `案件：${game.title}
当前阶段：${game.phase}

【公开导入】
${game.premise || '无'}

【你的私有角色本】
${player.privateScript || '暂无私本'}

【你可见的私密线索】
${privateClues || '暂无'}

【DM 给你的私密提示】
${privateNotes || '暂无'}

【已公开线索】
${publicClues || '暂无'}

【公开讨论记录】
${publicNotes || '暂无'}

请以“${player.scriptRoleName || player.name}”的身份公开发言一段。`,
    },
  ];
};

const MurderMysteryApp: React.FC = () => {
  const { closeApp, characters, userProfile, apiConfig, addToast } = useOS();
  const [cases, setCases] = useState<MysteryCase[]>(() => loadCases());
  const [activeCaseId, setActiveCaseId] = useState<string>(() => loadCases()[0]?.id || '');
  const [newTitle, setNewTitle] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [manualMessage, setManualMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const activeCase = useMemo(
    () => cases.find((item) => item.id === activeCaseId) || cases[0] || null,
    [cases, activeCaseId],
  );
  const selectedPlayer = activeCase?.players.find((p) => p.id === selectedPlayerId) || activeCase?.players[0] || null;

  const persist = (next: MysteryCase[], nextActiveId = activeCaseId) => {
    setCases(next);
    saveCases(next);
    setActiveCaseId(nextActiveId);
  };

  const updateCase = (updates: Partial<MysteryCase>) => {
    if (!activeCase) return;
    const now = Date.now();
    persist(cases.map((item) => item.id === activeCase.id ? { ...item, ...updates, updatedAt: now } : item), activeCase.id);
  };

  const createCase = () => {
    const title = newTitle.trim() || '未命名案件';
    const now = Date.now();
    const nextCase: MysteryCase = {
      id: nowId('case'),
      title,
      premise: '',
      dmGuide: '',
      phase: 'setup',
      players: [],
      notes: [],
      clues: [],
      createdAt: now,
      updatedAt: now,
    };
    persist([nextCase, ...cases], nextCase.id);
    setNewTitle('');
  };

  const deleteCase = (id: string) => {
    const next = cases.filter((item) => item.id !== id);
    persist(next, next[0]?.id || '');
  };

  const readTextFile = async (file: File) => {
    const text = await file.text();
    return `\n\n---\n【导入文件：${file.name}】\n${text.trim()}`;
  };

  const handleFileUpload = async (files: FileList | null, target: 'premise' | 'dmGuide' | 'playerScript') => {
    if (!activeCase || !files?.length) return;
    const chunks = await Promise.all(Array.from(files).map(readTextFile));
    const merged = chunks.join('\n');
    if (target === 'premise') updateCase({ premise: `${activeCase.premise || ''}${merged}`.trim() });
    if (target === 'dmGuide') updateCase({ dmGuide: `${activeCase.dmGuide || ''}${merged}`.trim() });
    if (target === 'playerScript' && selectedPlayer) {
      updateCase({
        players: activeCase.players.map((p) => p.id === selectedPlayer.id
          ? { ...p, privateScript: `${p.privateScript || ''}${merged}`.trim() }
          : p),
      });
    }
    addToast('文件已导入', 'success');
  };

  const addPlayer = (kind: PlayerKind, char?: CharacterProfile) => {
    if (!activeCase) return;
    const player: MysteryPlayer = {
      id: nowId('player'),
      kind,
      name: kind === 'user' ? (userProfile.name || '用户') : (char?.name || '角色'),
      characterId: char?.id,
      scriptRoleName: kind === 'user' ? (userProfile.name || '用户') : (char?.name || '角色'),
      privateScript: '',
    };
    updateCase({ players: [...activeCase.players, player] });
    setSelectedPlayerId(player.id);
  };

  const updatePlayer = (id: string, updates: Partial<MysteryPlayer>) => {
    if (!activeCase) return;
    updateCase({ players: activeCase.players.map((p) => p.id === id ? { ...p, ...updates } : p) });
  };

  const removePlayer = (id: string) => {
    if (!activeCase) return;
    updateCase({
      players: activeCase.players.filter((p) => p.id !== id),
      clues: activeCase.clues.filter((c) => c.targetPlayerId !== id),
      notes: activeCase.notes.filter((n) => n.targetPlayerId !== id),
    });
  };

  const addNote = (note: Omit<MysteryNote, 'id' | 'createdAt'>) => {
    if (!activeCase || !note.content.trim()) return;
    updateCase({
      notes: [...activeCase.notes, { ...note, id: nowId('note'), content: note.content.trim(), createdAt: Date.now() }],
    });
  };

  const addClue = (clue: Omit<MysteryClue, 'id' | 'createdAt'>) => {
    if (!activeCase || !clue.content.trim()) return;
    updateCase({
      clues: [...activeCase.clues, { ...clue, id: nowId('clue'), createdAt: Date.now() }],
    });
  };

  const runDm = async () => {
    if (!activeCase || busy) return;
    if (!apiConfig.apiKey || !apiConfig.baseUrl) {
      addToast('请先配置 API', 'error');
      return;
    }
    setBusy(true);
    try {
      const data = await safeFetchJson(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiConfig.apiKey}` },
        body: JSON.stringify({
          model: apiConfig.model,
          messages: buildDmMessages(activeCase),
          temperature: 0.55,
          max_tokens: 2800,
          stream: false,
        }),
      }, 1, 60000);
      const text = extractContent(data);
      const parsed = safeJsonObject(text);
      const nextPhase = phaseOptions.some((p) => p.id === parsed?.phase) ? parsed.phase as MysteryPhase : activeCase.phase;
      const publicClues = Array.isArray(parsed?.publicClues) ? parsed.publicClues : [];
      const privateNotes = Array.isArray(parsed?.privateNotes) ? parsed.privateNotes : [];
      const nextNotes = [...activeCase.notes];
      const nextClues = [...activeCase.clues];
      if (parsed?.dmNarration || !parsed) {
        nextNotes.push({
          id: nowId('note'),
          visibility: 'public',
          speaker: 'DM',
          content: parsed?.dmNarration || text,
          createdAt: Date.now(),
        });
      }
      publicClues.forEach((item: any) => {
        nextClues.push({
          id: nowId('clue'),
          title: String(item.title || '公开线索'),
          content: String(item.content || ''),
          visibility: 'public',
          revealed: true,
          createdAt: Date.now(),
        });
      });
      privateNotes.forEach((item: any) => {
        const targetPlayerId = String(item.targetPlayerId || '');
        if (!activeCase.players.some((p) => p.id === targetPlayerId)) return;
        nextNotes.push({
          id: nowId('note'),
          visibility: 'private',
          speaker: 'DM',
          targetPlayerId,
          content: String(item.content || ''),
          createdAt: Date.now(),
        });
      });
      updateCase({ phase: nextPhase, notes: nextNotes, clues: nextClues });
    } catch (err: any) {
      addToast(err?.message || 'DM 生成失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const runPlayer = async () => {
    if (!activeCase || !selectedPlayer || busy) return;
    if (selectedPlayer.kind === 'user') {
      addToast('用户玩家请手动发言', 'info');
      return;
    }
    if (!apiConfig.apiKey || !apiConfig.baseUrl) {
      addToast('请先配置 API', 'error');
      return;
    }
    const char = characters.find((item) => item.id === selectedPlayer.characterId);
    setBusy(true);
    try {
      const data = await safeFetchJson(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiConfig.apiKey}` },
        body: JSON.stringify({
          model: char?.apiModel?.trim() || apiConfig.model,
          messages: buildPlayerMessages(activeCase, selectedPlayer, char),
          temperature: char?.apiTemperature ?? 0.85,
          max_tokens: char?.apiMaxTokens ?? 2200,
          stream: false,
        }),
      }, 1, 60000);
      const content = extractContent(data).trim();
      if (!content) throw new Error('角色没有返回发言');
      addNote({ visibility: 'public', speaker: selectedPlayer.name, content });
    } catch (err: any) {
      addToast(err?.message || '玩家发言失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const addManualMessage = () => {
    if (!selectedPlayer || !manualMessage.trim()) return;
    addNote({ visibility: 'public', speaker: selectedPlayer.name, content: manualMessage });
    setManualMessage('');
  };

  const publicNotes = activeCase?.notes.filter((n) => n.visibility === 'public') || [];
  const privateNotes = selectedPlayer
    ? activeCase?.notes.filter((n) => n.visibility === 'private' && n.targetPlayerId === selectedPlayer.id) || []
    : [];
  const visibleClues = activeCase?.clues.filter((c) => c.revealed && (c.visibility === 'public' || c.targetPlayerId === selectedPlayer?.id)) || [];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f5f2ea] text-slate-900 md:flex-row">
      <aside className="flex max-h-[42%] w-full shrink-0 flex-col border-b border-stone-200 bg-[#fffaf0] md:max-h-none md:w-[330px] md:border-b-0 md:border-r">
        <div className="border-b border-stone-200 p-4">
          <button
            onClick={closeApp}
            className="mb-3 flex min-h-11 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-bold text-stone-600 shadow-sm active:scale-95 md:hidden"
          >
            <ArrowLeft size={18} weight="bold" />
            返回桌面
          </button>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-stone-950 p-2.5 text-amber-100">
              <Detective size={23} weight="duotone" />
            </div>
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.26em] text-stone-400">mystery room</div>
              <h1 className="text-2xl font-black">剧本杀</h1>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <input
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="新案件名"
              className="min-w-0 flex-1 rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-stone-400"
            />
            <button onClick={createCase} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-900 text-white">
              <Plus size={20} weight="bold" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {cases.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-stone-300 p-5 text-center text-sm text-stone-400">
              先创建一个案件。
            </div>
          ) : cases.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveCaseId(item.id)}
              className={`mb-2 w-full rounded-3xl border p-3 text-left transition ${
                activeCase?.id === item.id
                  ? 'border-stone-900 bg-stone-900 text-white'
                  : 'border-stone-200 bg-white/80 hover:bg-white'
              }`}
            >
              <div className="line-clamp-2 text-sm font-black">{item.title}</div>
              <div className={`mt-2 text-xs ${activeCase?.id === item.id ? 'text-stone-300' : 'text-stone-400'}`}>
                {phaseOptions.find((p) => p.id === item.phase)?.label || item.phase} · {item.players.length} 玩家 · {formatTime(item.updatedAt)}
              </div>
            </button>
          ))}
        </div>
      </aside>

      {!activeCase ? (
        <main className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-stone-400">
          创建案件后开始配置剧本。
        </main>
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.24em] text-stone-400">dm table</div>
                <input
                  value={activeCase.title}
                  onChange={(event) => updateCase({ title: event.target.value })}
                  className="mt-1 w-full bg-transparent text-3xl font-black tracking-tight outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={activeCase.phase}
                  onChange={(event) => updateCase({ phase: event.target.value as MysteryPhase })}
                  className="min-h-11 rounded-full border border-stone-200 bg-white px-4 text-sm font-bold outline-none"
                >
                  {phaseOptions.map((phase) => <option key={phase.id} value={phase.id}>{phase.label}</option>)}
                </select>
                <button
                  onClick={runDm}
                  disabled={busy}
                  className="flex min-h-11 items-center gap-2 rounded-full bg-stone-950 px-5 py-2 text-sm font-black text-white disabled:opacity-40"
                >
                  <Sparkle size={18} weight="fill" />
                  {busy ? '处理中...' : '让 DM 推进'}
                </button>
                <button
                  onClick={() => deleteCase(activeCase.id)}
                  className="flex min-h-11 items-center justify-center rounded-full border border-red-100 bg-red-50 px-3 text-red-500"
                >
                  <Trash size={18} />
                </button>
              </div>
            </header>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[390px_minmax(0,1fr)_330px]">
              <div className="space-y-4">
                <div className="rounded-3xl border border-stone-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-black text-stone-700">剧本资料</h2>
                    <FileText size={18} className="text-stone-400" />
                  </div>
                  <textarea
                    value={activeCase.premise}
                    onChange={(event) => updateCase({ premise: event.target.value })}
                    placeholder="公开导入：案发背景、规则、所有玩家都能知道的信息。"
                    className="h-28 w-full resize-y rounded-2xl border border-stone-200 bg-stone-50 p-3 text-sm leading-6 outline-none focus:border-stone-400"
                  />
                  <textarea
                    value={activeCase.dmGuide}
                    onChange={(event) => updateCase({ dmGuide: event.target.value })}
                    placeholder="DM 总资料：完整剧本、真相、流程、答案。只有主 API / DM 能看。"
                    className="mt-2 h-36 w-full resize-y rounded-2xl border border-stone-200 bg-stone-50 p-3 text-sm leading-6 outline-none focus:border-stone-400"
                  />
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white text-xs font-bold text-stone-600">
                      <UploadSimple size={16} />
                      导入公开
                      <input type="file" multiple accept=".txt,.md,.json" className="hidden" onChange={(e) => void handleFileUpload(e.target.files, 'premise')} />
                    </label>
                    <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white text-xs font-bold text-stone-600">
                      <UploadSimple size={16} />
                      导入 DM
                      <input type="file" multiple accept=".txt,.md,.json" className="hidden" onChange={(e) => void handleFileUpload(e.target.files, 'dmGuide')} />
                    </label>
                  </div>
                </div>

                <div className="rounded-3xl border border-stone-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-black text-stone-700">玩家与私本</h2>
                    <Cards size={18} className="text-stone-400" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => addPlayer('user')}
                      className="min-h-10 rounded-full bg-stone-900 px-3 text-xs font-bold text-white"
                    >
                      加入用户
                    </button>
                    {characters.map((char) => (
                      <button
                        key={char.id}
                        onClick={() => addPlayer('character', char)}
                        className="min-h-10 rounded-full border border-stone-200 bg-stone-50 px-3 text-xs font-bold text-stone-600"
                      >
                        + {char.name}
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 space-y-2">
                    {activeCase.players.map((player) => (
                      <button
                        key={player.id}
                        onClick={() => setSelectedPlayerId(player.id)}
                        className={`flex w-full items-center gap-2 rounded-2xl border p-2 text-left ${
                          selectedPlayer?.id === player.id
                            ? 'border-amber-400 bg-amber-50'
                            : 'border-stone-200 bg-stone-50'
                        }`}
                      >
                        <UserCircle size={24} weight="duotone" className="shrink-0 text-stone-500" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-black">{player.name}</div>
                          <div className="truncate text-xs text-stone-400">{player.scriptRoleName || '未分配剧本角色'}</div>
                        </div>
                        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-stone-400">
                          {player.kind === 'user' ? '你' : 'AI'}
                        </span>
                      </button>
                    ))}
                  </div>

                  {selectedPlayer && (
                    <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-3">
                      <input
                        value={selectedPlayer.scriptRoleName}
                        onChange={(event) => updatePlayer(selectedPlayer.id, { scriptRoleName: event.target.value })}
                        placeholder="剧本角色名"
                        className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-bold outline-none"
                      />
                      <textarea
                        value={selectedPlayer.privateScript}
                        onChange={(event) => updatePlayer(selectedPlayer.id, { privateScript: event.target.value })}
                        placeholder="这个玩家能看到的个人剧本/秘密/任务。其他玩家不会注入。"
                        className="mt-2 h-36 w-full resize-y rounded-xl border border-stone-200 bg-white p-3 text-sm leading-6 outline-none"
                      />
                      <div className="mt-2 flex gap-2">
                        <label className="flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white text-xs font-bold text-stone-600">
                          <UploadSimple size={15} />
                          导入私本
                          <input type="file" multiple accept=".txt,.md,.json" className="hidden" onChange={(e) => void handleFileUpload(e.target.files, 'playerScript')} />
                        </label>
                        <button
                          onClick={() => removePlayer(selectedPlayer.id)}
                          className="min-h-10 rounded-xl border border-red-100 bg-red-50 px-3 text-xs font-bold text-red-500"
                        >
                          移除
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-stone-200 bg-white p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-black text-stone-700">公开桌面</h2>
                    <div className="flex gap-2">
                      <select
                        value={selectedPlayer?.id || ''}
                        onChange={(event) => setSelectedPlayerId(event.target.value)}
                        className="min-h-10 rounded-full border border-stone-200 bg-stone-50 px-3 text-xs font-bold outline-none"
                      >
                        {activeCase.players.map((player) => (
                          <option key={player.id} value={player.id}>{player.name} / {player.scriptRoleName}</option>
                        ))}
                      </select>
                      <button
                        onClick={runPlayer}
                        disabled={busy || !selectedPlayer || selectedPlayer.kind === 'user'}
                        className="min-h-10 rounded-full bg-amber-600 px-4 text-xs font-black text-white disabled:opacity-40"
                      >
                        让玩家发言
                      </button>
                    </div>
                  </div>

                  <div className="max-h-[520px] space-y-3 overflow-y-auto rounded-2xl bg-[#f8f4ec] p-3">
                    {publicNotes.length === 0 ? (
                      <div className="py-10 text-center text-sm text-stone-400">公开讨论还没有开始。</div>
                    ) : publicNotes.map((note) => (
                      <article key={note.id} className="rounded-2xl bg-white p-4 shadow-sm">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-sm font-black text-stone-800">{note.speaker}</span>
                          <span className="text-[10px] text-stone-400">{formatTime(note.createdAt)}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-7 text-stone-700">{note.content}</p>
                      </article>
                    ))}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <textarea
                      value={manualMessage}
                      onChange={(event) => setManualMessage(event.target.value)}
                      placeholder={selectedPlayer ? `${selectedPlayer.name} 手动发言...` : '先选择玩家'}
                      className="min-h-20 flex-1 resize-none rounded-2xl border border-stone-200 bg-stone-50 p-3 text-sm outline-none"
                    />
                    <button
                      onClick={addManualMessage}
                      disabled={!manualMessage.trim() || !selectedPlayer}
                      className="w-20 rounded-2xl bg-stone-900 text-sm font-black text-white disabled:opacity-40"
                    >
                      发送
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-stone-200 bg-white p-4">
                  <h2 className="text-sm font-black text-stone-700">当前可见线索</h2>
                  <div className="mt-3 space-y-2">
                    {visibleClues.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-stone-200 p-4 text-center text-xs text-stone-400">
                        暂无线索。
                      </div>
                    ) : visibleClues.map((clue) => (
                      <article key={clue.id} className="rounded-2xl border border-stone-100 bg-stone-50 p-3">
                        <div className="text-sm font-black">{clue.title}</div>
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-6 text-stone-600">{clue.content}</p>
                      </article>
                    ))}
                  </div>
                  <button
                    onClick={() => addClue({ title: '手动线索', content: '在这里编辑线索内容', visibility: 'public', revealed: true })}
                    className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white text-xs font-bold text-stone-600"
                  >
                    <Plus size={15} />
                    添加公开线索
                  </button>
                </div>

                <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
                  <h2 className="text-sm font-black text-amber-900">私密提示</h2>
                  <div className="mt-3 space-y-2">
                    {!selectedPlayer ? (
                      <div className="text-xs text-amber-700">选择一个玩家查看其可见私密信息。</div>
                    ) : privateNotes.length === 0 ? (
                      <div className="text-xs text-amber-700">这个玩家暂无 DM 私密提示。</div>
                    ) : privateNotes.map((note) => (
                      <article key={note.id} className="rounded-2xl bg-white/80 p-3">
                        <div className="text-[10px] font-bold text-amber-700">{formatTime(note.createdAt)}</div>
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-6 text-stone-700">{note.content}</p>
                      </article>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => addToast('剧本杀已自动保存到本地', 'success')}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-bold text-stone-700 shadow-sm"
                >
                  <FloppyDisk size={18} />
                  本地自动保存中
                </button>
              </div>
            </section>
          </div>
        </main>
      )}
    </div>
  );
};

export default MurderMysteryApp;
