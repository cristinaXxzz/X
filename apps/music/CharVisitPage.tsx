/**
 * Char 拜访页 — 访问某个角色的网易云风格"小号主页"
 *
 * 思路：完全仿网易云个人主页排版，但数据全来自本地 CharMusicProfile。
 * 用户体验上就像 "去别人主页逛一圈"，不是 "切换账号"。
 *
 * 交互：
 * - 未初始化 → 显示"敲敲门"按钮，点一下调 LLM 生成 musicProfile。
 * - 已初始化 → 展示 bio / 曲风徽章 / 偏爱艺人 / 歌单 / 最近在听 / 评论。
 * - 点歌单进详情（若歌单空，可以一键让 char 搜歌填充）。
 * - 点任一首歌 → 用全局 MusicContext 播放 (沿用 user 的 cookie / 配额)。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOS } from '../../context/OSContext';
import { useMusic, musicApi, toHttps, Song } from '../../context/MusicContext';
import { CharacterProfile, CharPlaylist, CharPlaylistSong } from '../../types';
import { CharMusicPersona } from '../../utils/charMusicPersona';
import { computeCurrentListening } from '../../utils/charMusicSchedule';
import { DB } from '../../utils/db';
import { C, Sparkle, MizuHeader, BokehBg, MiniPlayer } from './MusicUI';
import { ArrowLeft, MusicNote, Heart, Plus, MagnifyingGlass } from '@phosphor-icons/react';

interface Props {
  charId: string;
  onBack: () => void;
  onOpenPlayer: () => void;
}

const gradientMap: Record<string, string> = {
  'gradient-01': `linear-gradient(135deg, ${C.primary}, ${C.accent})`,
  'gradient-02': `linear-gradient(135deg, ${C.sakura}, ${C.lavender})`,
  'gradient-03': `linear-gradient(135deg, ${C.accent}, ${C.glow})`,
  'gradient-04': `linear-gradient(135deg, ${C.lavender}, ${C.primary})`,
  'gradient-05': `linear-gradient(135deg, ${C.vip}, ${C.sakura})`,
  'gradient-06': `linear-gradient(135deg, ${C.glow}, ${C.lavender})`,
};
const gradientFor = (key?: string) => gradientMap[key || 'gradient-01'] || gradientMap['gradient-01'];

const songFromSearch = (s: any): Song => ({
  id: s.id,
  name: s.name,
  artists: (s.ar || s.artists || []).map((a: any) => a.name).join(' / '),
  album: s.al?.name || s.album?.name || '',
  albumPic: toHttps(s.al?.picUrl || s.album?.picUrl || ''),
  duration: (s.dt || s.duration || 0) / 1000,
  fee: s.fee ?? 0,
});

const toPlaylistSong = (s: Song): CharPlaylistSong => ({
  id: s.id, name: s.name, artists: s.artists, album: s.album,
  albumPic: s.albumPic, duration: s.duration, fee: s.fee,
});

type MusicPickSource = 'user' | 'discovered';

interface MusicPickHistoryEntry {
  charId: string;
  playlistId: string;
  songId: number;
  name: string;
  primaryArtist: string;
  album: string;
  source: MusicPickSource;
  pickedAt: number;
}

const MUSIC_PICK_HISTORY_KEY = 'sully_char_music_pick_history_v2';
const MUSIC_PICK_HISTORY_LIMIT = 220;
const MUSIC_PICK_HISTORY_WINDOW_MS = 1000 * 60 * 60 * 24 * 21;

const primaryArtistOf = (artists?: string): string => (
  (artists || '').split('/')[0]?.trim() || artists || 'unknown'
);

const loadMusicPickHistory = (): MusicPickHistoryEntry[] => {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MUSIC_PICK_HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(x => x && typeof x.songId === 'number') : [];
  } catch {
    return [];
  }
};

const saveMusicPickHistory = (entries: MusicPickHistoryEntry[]) => {
  if (typeof window === 'undefined') return;
  const cutoff = Date.now() - MUSIC_PICK_HISTORY_WINDOW_MS;
  const trimmed = entries
    .filter(x => x.pickedAt >= cutoff)
    .sort((a, b) => b.pickedAt - a.pickedAt)
    .slice(0, MUSIC_PICK_HISTORY_LIMIT);
  try { window.localStorage.setItem(MUSIC_PICK_HISTORY_KEY, JSON.stringify(trimmed)); } catch {}
};

const recordMusicPicks = (
  charId: string,
  playlistId: string,
  songs: CharPlaylistSong[],
) => {
  const now = Date.now();
  const next = [
    ...songs.map((s): MusicPickHistoryEntry => ({
      charId,
      playlistId,
      songId: s.id,
      name: s.name,
      primaryArtist: primaryArtistOf(s.artists),
      album: s.album || 'unknown',
      source: (s.source || 'discovered') as MusicPickSource,
      pickedAt: now,
    })),
    ...loadMusicPickHistory(),
  ];
  saveMusicPickHistory(next);
};

const stableHash = (input: string): number => {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const stableJitter = (seed: string): number => (stableHash(seed) % 1000) / 1000;

const CharVisitPage: React.FC<Props> = ({ charId, onBack, onOpenPlayer }) => {
  const { characters, updateCharacter, userProfile, apiConfig, addToast } = useOS();
  const {
    cfg, profile: neteaseProfile, playSong,
    current, playing, togglePlay, nextSong, prevSong,
  } = useMusic();
  const char = useMemo(() => characters.find(c => c.id === charId), [characters, charId]);

  const [initializing, setInitializing] = useState(false);
  const [expandedPl, setExpandedPl] = useState<string | null>(null);
  const [fillingPl, setFillingPl] = useState<string | null>(null);

  const profile = char?.musicProfile;
  const initialized = !!(char && CharMusicPersona.isInitialized(char));

  // 拜访时刷新 char 此刻在听的歌（纯本地计算，零网络）
  // 只在 char.id / initialized 变化时刷新一次，避免每秒 tick
  useEffect(() => {
    if (!char || !initialized || !char.musicProfile) return;
    let cancelled = false;
    (async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const schedule = await DB.getDailySchedule(char.id, today);
        if (cancelled) return;
        const cur = computeCurrentListening(char, schedule);
        const prev = char.musicProfile!.currentListening;
        const differ = (prev?.songId !== cur?.songId) || (prev?.startedAt !== cur?.startedAt);
        if (differ) {
          updateCharacter(char.id, {
            musicProfile: {
              ...char.musicProfile!,
              currentListening: cur || undefined,
              updatedAt: Date.now(),
            },
          });
        }
      } catch (e) {
        console.warn('[CharVisitPage] refresh currentListening failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [char?.id, initialized]); // eslint-disable-line react-hooks/exhaustive-deps

  const doInitialize = useCallback(async () => {
    if (!char || initializing) return;
    setInitializing(true);
    try {
      const newProfile = await CharMusicPersona.initialize(char, userProfile, apiConfig);
      updateCharacter(char.id, { musicProfile: newProfile });
      addToast(`${char.name} 的音乐角落已开启`, 'success');
    } catch (e: any) {
      addToast(`初始化失败：${e.message || '未知错误'}`, 'error');
    } finally {
      setInitializing(false);
    }
  }, [char, initializing, userProfile, apiConfig, updateCharacter, addToast]);

  /** 清掉旧档案重新走一次 LLM —— 给旧版保底生成的"告五人"账号用。 */
  const doRegenerate = useCallback(async () => {
    if (!char || initializing) return;
    const ok = typeof window !== 'undefined'
      ? window.confirm(`清空 ${char.name} 现有的音乐人格，重新让 LLM 生成？\n（歌单里已填的歌也会丢）`)
      : true;
    if (!ok) return;
    setInitializing(true);
    try {
      const newProfile = await CharMusicPersona.initialize(char, userProfile, apiConfig);
      updateCharacter(char.id, { musicProfile: newProfile });
      addToast(`${char.name} 的音乐人格已重新生成`, 'success');
    } catch (e: any) {
      addToast(`重新生成失败：${e.message || '未知错误'}`, 'error');
    } finally {
      setInitializing(false);
    }
  }, [char, initializing, userProfile, apiConfig, updateCharacter, addToast]);

  const togglePlaylist = (plId: string) => {
    setExpandedPl(prev => (prev === plId ? null : plId));
  };

  /** 让 char 沿着自己的隐藏搜索路线填歌单。
   *  LLM 只生成 searchQueries / selectionBias，不直接编歌名；网易云负责现实校验。
   *  这里先攒候选池，再按跨歌单去重、艺人/专辑多样性和搜索来源打分挑歌，
   *  避免三张歌单都吃到同一批热门结果。
   */
  const fillPlaylistFromTaste = useCallback(async (pl: CharPlaylist) => {
    if (!char || !profile || fillingPl) return;
    setFillingPl(pl.id);
    try {
      const moodKeywordMap: Record<string, string> = {
        happy: '快乐', sad: '悲伤', romantic: '浪漫', angry: '发泄',
        chill: '放松', epic: '史诗', nostalgic: '怀旧', dreamy: '氛围',
      };

      const plIndex = Math.max(0, profile.playlists.findIndex(p => p.id === pl.id));
      const allArtists = profile.signatureArtists.map(a => a.name).filter(Boolean);
      const allGenres = profile.genreTags.filter(Boolean);

      // 按歌单序号轮换艺人/曲风，让 A/B/C 三个歌单永远拿到不同切片
      const rotate = (arr: string[], offset: number, take: number): string[] => {
        if (arr.length === 0) return [];
        const out: string[] = [];
        for (let i = 0; i < take && i < arr.length; i++) {
          out.push(arr[(offset + i) % arr.length]);
        }
        return out;
      };

      const keywords: string[] = [];
      // 1) 新版音乐人格给的隐藏搜索路线优先
      if (Array.isArray(pl.searchQueries)) keywords.push(...pl.searchQueries);
      // 2) 歌单自己的 title 作为补充
      const cleanTitle = (pl.title || '').trim();
      if (cleanTitle && !/^歌单\s*\d*$/.test(cleanTitle)) keywords.push(cleanTitle);
      // 3) mood → 中文搜索词
      if (pl.mood && moodKeywordMap[pl.mood]) keywords.push(moodKeywordMap[pl.mood]);
      // 4) 旋转后的艺人：作为人气锚点，避免整张歌单被抽象 query 带得太冷
      const anchorArtists = rotate(allArtists, plIndex * 2, 3);
      keywords.push(...anchorArtists);
      if (pl.mood && moodKeywordMap[pl.mood]) {
        keywords.push(...anchorArtists.slice(0, 2).map(a => `${a} ${moodKeywordMap[pl.mood!]}`));
      }
      // 5) 没艺人就用旋转后的曲风兜底
      if (allArtists.length === 0) keywords.push(...rotate(allGenres, plIndex, 2));

      // 去重 + 去空
      const uniqKeywords = Array.from(new Set(keywords.map(k => k.trim()).filter(Boolean)));
      if (uniqKeywords.length === 0) {
        addToast('还没有足够的品味数据，先初始化一下吧', 'info');
        return;
      }

      // 跨歌单去重：本角色其它歌单已经有的歌不要再塞进来
      const usedInOthers = new Set<number>();
      const artistsInOtherPlaylists = new Map<string, number>();
      for (const other of profile.playlists) {
        if (other.id === pl.id) continue;
        for (const s of other.songs) {
          usedInOthers.add(s.id);
          const artist = primaryArtistOf(s.artists);
          artistsInOtherPlaylists.set(artist, (artistsInOtherPlaylists.get(artist) || 0) + 1);
        }
      }

      const recentHistory = loadMusicPickHistory()
        .filter(x => x.charId === char.id && Date.now() - x.pickedAt < MUSIC_PICK_HISTORY_WINDOW_MS);
      const recentSongIds = new Set(recentHistory.map(x => x.songId));
      const recentArtistUse = new Map<string, number>();
      const recentAlbumUse = new Map<string, number>();
      for (const item of recentHistory) {
        recentArtistUse.set(item.primaryArtist, (recentArtistUse.get(item.primaryArtist) || 0) + 1);
        recentAlbumUse.set(item.album, (recentAlbumUse.get(item.album) || 0) + 1);
      }

      type Candidate = Song & {
        score: number;
        firstQueryIdx: number;
        hitCount: number;
        sourceBucket: string;
        playlistSourceId?: number;
      };
      const candidates = new Map<number, Candidate>();
      const userCandidates = new Map<number, Candidate>();
      const currentIds = new Set(pl.songs.map(s => s.id));
      const pickRunSeed = `${Date.now()}:${char.id}:${pl.id}`;
      const scoreSong = (
        s: Song,
        qi: number,
        rank: number,
        sourceBonus = 0,
        sourceBucket = `query:${qi}`,
        playlistSourceId?: number,
      ): Candidate => {
        const baseScore = 100 - qi * 3 - rank * 3;
        const artistNames = (s.artists || '').split('/').map(a => a.trim()).filter(Boolean);
        const primaryArtist = primaryArtistOf(s.artists);
        const album = s.album || 'unknown';
        const signatureHit = artistNames.some(a => allArtists.some(sa => sa === a));
        const genreHit = allGenres.some(g => `${s.name} ${s.album} ${s.artists}`.includes(g));
        const anchorHit = artistNames.some(a => anchorArtists.includes(a));
        const songPenalty = recentSongIds.has(s.id) ? 90 : 0;
        const recentArtistPenalty = (recentArtistUse.get(primaryArtist) || 0) * 18;
        const recentAlbumPenalty = (recentAlbumUse.get(album) || 0) * 14;
        const profileArtistPenalty = (artistsInOtherPlaylists.get(primaryArtist) || 0) * 10;
        const jitter = stableJitter(`${pickRunSeed}:${s.id}:${sourceBucket}`) * 12;
        return {
          ...s,
          score: baseScore + sourceBonus + (anchorHit ? 24 : 0) + (signatureHit ? 12 : 0) + (genreHit ? 5 : 0)
            + jitter - songPenalty - recentArtistPenalty - recentAlbumPenalty - profileArtistPenalty,
          firstQueryIdx: qi,
          hitCount: 1,
          sourceBucket,
          playlistSourceId,
        };
      };

      for (let qi = 0; qi < uniqKeywords.length; qi++) {
        const kw = uniqKeywords[qi];
        try {
          const r = await musicApi.search(cfg, kw);
          const songs: Song[] = (r?.result?.songs || []).slice(0, 10).map(songFromSearch);
          for (let rank = 0; rank < songs.length; rank++) {
            const s = songs[rank];
            if (!s?.id || currentIds.has(s.id) || usedInOthers.has(s.id)) continue;
            const existed = candidates.get(s.id);
            if (existed) {
              existed.score += 12;
              existed.hitCount += 1;
              existed.firstQueryIdx = Math.min(existed.firstQueryIdx, qi);
            } else {
              candidates.set(s.id, scoreSong(s, qi, rank, 0, `query:${kw}`));
            }
          }
        } catch { /* 单个关键词失败不阻塞 */ }
      }

      if ((profile.canReadUserMusic ?? true) && cfg.cookie && neteaseProfile?.userId) {
        try {
          const plRes = await musicApi.userPlaylist(cfg, neteaseProfile.userId);
          const userPlaylists = (plRes?.playlist || [])
            .filter((p: any) => p?.id && (p.trackCount || 0) > 0)
            .slice(0, 12);
          const queryText = `${pl.title} ${pl.description} ${pl.mood || ''} ${uniqKeywords.join(' ')} ${allArtists.join(' ')} ${allGenres.join(' ')}`;
          const scoredPlaylists = userPlaylists
            .map((p: any, i: number) => {
              const name = String(p.name || '');
              let score = 30 - i;
              for (const kw of uniqKeywords) if (kw && name.includes(kw)) score += 16;
              for (const g of allGenres) if (g && name.includes(g)) score += 10;
              if (pl.mood && moodKeywordMap[pl.mood] && name.includes(moodKeywordMap[pl.mood])) score += 8;
              if (queryText.includes(name)) score += 4;
              return { id: p.id, name, score };
            })
            .sort((a: any, b: any) => b.score - a.score)
            .slice(0, 4);

          for (let pi = 0; pi < scoredPlaylists.length; pi++) {
            const up = scoredPlaylists[pi];
            const r = await musicApi.playlistTrackAll(cfg, up.id, 40, 0);
            const songs: Song[] = (r?.songs || []).map(songFromSearch);
            for (let rank = 0; rank < songs.length; rank++) {
              const s = songs[rank];
              if (!s?.id || currentIds.has(s.id) || usedInOthers.has(s.id)) continue;
              const hay = `${s.name} ${s.album} ${s.artists}`;
              const artistHit = allArtists.some(a => hay.includes(a));
              const genreHit = allGenres.some(g => hay.includes(g));
              const titleHit = cleanTitle && hay.includes(cleanTitle);
              if (!artistHit && !genreHit && !titleHit && rank > 12) continue;
              const existed = userCandidates.get(s.id);
              if (existed) {
                existed.score += 14;
                existed.hitCount += 1;
              } else {
                userCandidates.set(
                  s.id,
                  scoreSong(
                    s,
                    pi,
                    rank,
                    32 + (artistHit ? 18 : 0) + (genreHit ? 8 : 0),
                    `user:${up.id}`,
                    up.id,
                  ),
                );
              }
            }
          }
        } catch { /* 用户歌单读取失败就只用公开搜索结果 */ }
      }

      const artistUse = new Map<string, number>();
      const albumUse = new Map<string, number>();
      const sourceBucketUse = new Map<string, number>();
      const userPlaylistUse = new Map<number, number>();
      const picked: CharPlaylistSong[] = [];
      const pickedIds = new Set<number>();
      const canTake = (c: Candidate, relaxed = false) => {
        if (pickedIds.has(c.id)) return false;
        if (!relaxed && recentSongIds.has(c.id)) return false;
        const primaryArtist = primaryArtistOf(c.artists);
        const album = c.album || 'unknown';
        if ((artistUse.get(primaryArtist) || 0) >= (relaxed ? 3 : 2)) return false;
        if (!relaxed && (albumUse.get(album) || 0) >= 1) return false;
        if (!relaxed && (sourceBucketUse.get(c.sourceBucket) || 0) >= 2) return false;
        if (!relaxed && c.playlistSourceId && (userPlaylistUse.get(c.playlistSourceId) || 0) >= 1) return false;
        return true;
      };
      const take = (c: Candidate, source: MusicPickSource) => {
        const primaryArtist = primaryArtistOf(c.artists);
        const album = c.album || 'unknown';
        picked.push({
          ...toPlaylistSong(c),
          source,
          addedAt: Date.now(),
        });
        pickedIds.add(c.id);
        artistUse.set(primaryArtist, (artistUse.get(primaryArtist) || 0) + 1);
        albumUse.set(album, (albumUse.get(album) || 0) + 1);
        sourceBucketUse.set(c.sourceBucket, (sourceBucketUse.get(c.sourceBucket) || 0) + 1);
        if (c.playlistSourceId) userPlaylistUse.set(c.playlistSourceId, (userPlaylistUse.get(c.playlistSourceId) || 0) + 1);
      };
      const byScore = (arr: Candidate[]) => arr.sort((a, b) => b.score - a.score);
      const userPool = byScore(Array.from(userCandidates.values()));
      for (const c of userPool) {
        if (picked.length >= 2) break;
        if (!canTake(c)) continue;
        take(c, 'user');
      }
      // If the user's library fits the character, keep it as 1-2 anchor songs.
      // It should not collapse the whole character playlist into the same user taste cluster.
      if (picked.length === 0) {
        for (const c of userPool) {
          if (!canTake(c, true)) continue;
          take(c, 'user');
          break;
        }
      }
      const pool = byScore(Array.from(candidates.values()));

      for (const c of pool) {
        if (picked.length >= 8) break;
        if (!canTake(c)) continue;
        take(c, 'discovered');
      }

      // 如果去重太严格导致数量不足，放宽专辑限制补齐，但仍不拿跨歌单重复歌。
      if (picked.length < 4) {
        for (const c of pool) {
          if (picked.length >= 8) break;
          if (!canTake(c, true)) continue;
          take(c, 'discovered');
        }
      }

      if (picked.length === 0) {
        addToast('没搜到合适的歌', 'error');
        return;
      }
      const updatedPl: CharPlaylist = {
        ...pl,
        songs: picked,
        coverStyle: pl.coverStyle,
        updatedAt: Date.now(),
      };
      const updatedProfile = {
        ...profile,
        playlists: profile.playlists.map(p => p.id === pl.id ? updatedPl : p),
        updatedAt: Date.now(),
      };
      updateCharacter(char.id, { musicProfile: updatedProfile });
      recordMusicPicks(char.id, pl.id, picked);
      addToast(`已为《${pl.title}》填入 ${picked.length} 首歌`, 'success');
    } catch (e: any) {
      addToast(`填充失败：${e.message}`, 'error');
    } finally {
      setFillingPl(null);
    }
  }, [char, profile, cfg, neteaseProfile, fillingPl, updateCharacter, addToast]);

  const playPlaylistSong = (pl: CharPlaylist, song: CharPlaylistSong) => {
    // 用 char 歌单作为队列，点击的歌作为起点
    const queue: Song[] = pl.songs.map(s => ({ ...s }));
    const startIdx = queue.findIndex(s => s.id === song.id);
    playSong(queue[startIdx], { replaceQueue: queue, startIdx });
    onOpenPlayer();
  };

  if (!char) {
    return (
      <div className="flex flex-col h-full relative" style={{ background: C.bg }}>
        <MizuHeader title="拜访" onBack={onBack} />
        <div className="flex-1 flex items-center justify-center text-sm" style={{ color: C.muted }}>
          找不到这个角色。
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative"
      style={{ background: `linear-gradient(180deg, #ffffff 0%, ${C.bg} 50%, ${C.bgDeep} 100%)` }}>
      <BokehBg />
      <MizuHeader
        title={`拜访 · ${char.name}`}
        onBack={onBack}
      />

      <div className="flex-1 overflow-y-auto relative z-10 shizuku-scrollbar pb-20">
        {/* Banner + 拜访徽标 */}
        <div className="relative h-32 overflow-hidden">
          <div className="absolute inset-0"
            style={{ background: `linear-gradient(135deg, ${C.lavender}50, ${C.sakura}40, ${C.accent}40)` }} />
          <div className="absolute top-3 left-4 text-[10px] tracking-[0.35em] uppercase font-semibold"
            style={{ color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
            Visiting Another Soul
          </div>
          <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 0%, ${C.bg}CC 100%)` }} />
        </div>

        {/* 角色卡 */}
        <div className="-mt-12 mx-4 rounded-3xl p-4 shizuku-glass-strong relative z-10"
          style={{ boxShadow: `0 10px 40px ${C.glow}15` }}>
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              {char.avatar && char.avatar.startsWith('data:') || char.avatar?.startsWith('http') ? (
                <img src={char.avatar} alt="" className="w-16 h-16 rounded-2xl object-cover"
                  style={{ border: `2px solid ${C.glow}60`, boxShadow: `0 4px 20px ${C.glow}30` }} />
              ) : (
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl"
                  style={{ background: gradientFor('gradient-04'), color: 'white' }}>
                  {char.avatar || char.name.slice(0, 1)}
                </div>
              )}
              <div className="absolute -bottom-1 -right-1">
                <Sparkle size={10} color={C.sakura} delay={0.3} />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-base font-semibold truncate"
                style={{ color: C.text, fontFamily: `'Noto Serif', serif` }}>
                {char.name}
              </div>
              <div className="text-[10px] mt-0.5 truncate" style={{ color: C.muted }}>
                {profile?.bio || '还没写音乐简介'}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                {(profile?.genreTags || []).slice(0, 4).map(tag => (
                  <span key={tag} className="text-[9px] px-2 py-0.5 rounded-full"
                    style={{ background: `${C.accent}22`, color: C.primary, border: `1px solid ${C.accent}30` }}>
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 统计行 */}
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <StatCell label="歌单" value={profile?.playlists.length || 0} />
            <StatCell label="喜欢" value={profile?.likedSongIds.length || 0} />
            <StatCell label="最近听" value={profile?.recentPlays.length || 0} />
          </div>
        </div>

        {/* 未初始化 CTA */}
        {!initialized && (
          <div className="mx-4 mt-4 rounded-2xl p-4 shizuku-glass text-center">
            <div className="text-xs mb-2" style={{ color: C.muted, fontFamily: `'Noto Serif', serif` }}>
              {char.name} 的音乐角落还是一片空白
            </div>
            <div className="text-[10px] mb-3 italic" style={{ color: C.faint }}>
              点开后会生成 ta 的曲风偏好、偏爱艺人和 3 个概念歌单（仅一次 LLM 调用）
            </div>
            <button
              onClick={doInitialize}
              disabled={initializing}
              className="w-full py-2.5 rounded-xl text-xs text-white tracking-wider transition-all disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, boxShadow: `0 3px 18px ${C.glow}30` }}
            >
              {initializing ? '敲门中…' : '敲敲门 · 生成音乐人格'}
            </button>
          </div>
        )}

        {/* 正在听 */}
        {initialized && profile?.currentListening && (
          <div className="mx-4 mt-4 rounded-2xl p-4 shizuku-glass"
            style={{ boxShadow: `0 4px 20px ${C.glow}15` }}>
            <div className="flex items-center gap-2 mb-2">
              <Sparkle size={8} color={C.sakura} delay={0} />
              <span className="text-[10px] tracking-[0.25em] uppercase" style={{ color: C.muted }}>此刻在听</span>
            </div>
            <div className="flex items-center gap-3">
              {profile.currentListening.albumPic ? (
                <img src={profile.currentListening.albumPic} className="w-12 h-12 rounded-xl object-cover" alt="" />
              ) : (
                <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: gradientFor('gradient-03'), color: 'white' }}>
                  <MusicNote size={20} weight="bold" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: C.text }}>
                  {profile.currentListening.songName}
                </div>
                <div className="text-[10px] truncate" style={{ color: C.muted }}>
                  {profile.currentListening.artists}
                </div>
              </div>
            </div>
            {profile.currentListening.vibe && (
              <div className="text-[10px] mt-2 italic" style={{ color: C.faint }}>
                {profile.currentListening.vibe}
              </div>
            )}
          </div>
        )}

        {/* 偏爱艺人 */}
        {initialized && (profile?.signatureArtists?.length || 0) > 0 && (
          <div className="mx-4 mt-4">
            <SectionTitle>钟爱的人</SectionTitle>
            <div className="flex items-center gap-2 overflow-x-auto pb-2 shizuku-scrollbar">
              {profile!.signatureArtists.map((a, i) => (
                <div key={i} className="shrink-0 text-center">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center text-white mx-auto"
                    style={{ background: gradientFor(`gradient-0${(i % 6) + 1}`) }}>
                    <span className="text-lg font-semibold" style={{ fontFamily: `'Noto Serif', serif` }}>
                      {a.name.slice(0, 1)}
                    </span>
                  </div>
                  <div className="text-[10px] mt-1 max-w-[60px] truncate" style={{ color: C.muted }}>{a.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 歌单 */}
        {initialized && (profile?.playlists?.length || 0) > 0 && (
          <div className="mx-4 mt-4">
            <SectionTitle>歌单 · {profile!.playlists.length}</SectionTitle>
            <div className="space-y-2">
              {profile!.playlists.map(pl => {
                const isExpanded = expandedPl === pl.id;
                const isFilling = fillingPl === pl.id;
                return (
                  <div key={pl.id} className="rounded-2xl shizuku-glass overflow-hidden">
                    <button
                      onClick={() => togglePlaylist(pl.id)}
                      className="w-full flex items-center gap-3 p-3 text-left"
                    >
                      <div className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center overflow-hidden"
                        style={{ background: gradientFor(pl.coverStyle) }}>
                        {pl.songs[0]?.albumPic ? (
                          <img src={pl.songs[0].albumPic} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <MusicNote size={20} weight="bold" color="white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: C.text }}>{pl.title}</div>
                        <div className="text-[10px] truncate mt-0.5" style={{ color: C.muted }}>
                          {pl.description || '—'}
                        </div>
                        <div className="text-[9px] mt-0.5" style={{ color: C.faint }}>
                          {pl.songs.length > 0 ? `${pl.songs.length} 首` : '（空歌单）'}
                          {pl.mood && ` · ${pl.mood}`}
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-3 pb-3 border-t" style={{ borderColor: `${C.faint}30` }}>
                        {pl.songs.length === 0 ? (
                          <div className="text-center py-3">
                            <div className="text-[10px] italic mb-2" style={{ color: C.faint }}>
                              还空着。让 {char.name} 根据品味挑几首？
                            </div>
                            <button
                              onClick={() => fillPlaylistFromTaste(pl)}
                              disabled={isFilling}
                              className="text-[10px] px-3 py-1.5 rounded-full shizuku-glass disabled:opacity-60"
                              style={{ color: C.primary, border: `1px solid ${C.primary}30` }}
                            >
                              <MagnifyingGlass size={10} weight="bold" className="inline mr-1" />
                              {isFilling ? '正在挑…' : '让 ta 挑几首'}
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-1 pt-2">
                            {pl.songs.map((s, i) => (
                              <button
                                key={s.id}
                                onClick={() => playPlaylistSong(pl, s)}
                                className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/40 transition-colors text-left"
                              >
                                <span className="text-[10px] w-4 shrink-0" style={{ color: C.faint }}>{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs truncate" style={{ color: C.text }}>{s.name}</div>
                                  <div className="text-[9px] truncate" style={{ color: C.muted }}>{s.artists}</div>
                                </div>
                                {s.fee === 1 && (
                                  <span className="text-[8px] px-1 rounded" style={{ color: C.vip, border: `1px solid ${C.vip}50` }}>VIP</span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 最近在听 */}
        {initialized && (profile?.recentPlays?.length || 0) > 0 && (
          <div className="mx-4 mt-4">
            <SectionTitle>最近常听</SectionTitle>
            <div className="space-y-1">
              {profile!.recentPlays.slice(0, 10).map((r, i) => (
                <div key={`${r.song.id}-${r.at}-${i}`} className="flex items-center gap-2 p-2 rounded-lg">
                  {r.song.albumPic ? (
                    <img src={r.song.albumPic} alt="" className="w-9 h-9 rounded-md object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-md flex items-center justify-center"
                      style={{ background: gradientFor('gradient-02') }}>
                      <MusicNote size={14} weight="bold" color="white" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs truncate" style={{ color: C.text }}>{r.song.name}</div>
                    <div className="text-[9px] truncate" style={{ color: C.muted }}>
                      {r.song.artists} · {new Date(r.at).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  {r.context && (
                    <div className="text-[9px] italic max-w-[40%] truncate" style={{ color: C.faint }}>
                      "{r.context}"
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 评论 */}
        {initialized && (profile?.reviews?.length || 0) > 0 && (
          <div className="mx-4 mt-4">
            <SectionTitle>写过的话</SectionTitle>
            <div className="space-y-2">
              {profile!.reviews!.slice(0, 10).map(rv => (
                <div key={rv.id} className="rounded-xl shizuku-glass p-3">
                  <div className="text-[10px] mb-1" style={{ color: C.muted }}>
                    对 <span className="font-medium" style={{ color: C.primary }}>{rv.targetTitle}</span>
                  </div>
                  <div className="text-xs leading-relaxed" style={{ color: C.text, fontFamily: `'Noto Serif', serif` }}>
                    {rv.content}
                  </div>
                  <div className="text-[9px] mt-1" style={{ color: C.faint }}>
                    {new Date(rv.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 隐私开关 + 重新生成 */}
        {initialized && (
          <div className="mx-4 mt-6 mb-2 text-[10px] text-center space-y-2" style={{ color: C.faint }}>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={profile?.canReadUserMusic ?? true}
                onChange={e => {
                  if (!profile) return;
                  updateCharacter(char.id, {
                    musicProfile: { ...profile, canReadUserMusic: e.target.checked, updatedAt: Date.now() },
                  });
                }}
                className="w-3 h-3"
              />
              允许 {char.name} 翻阅你的网易云数据（最近在听 / 歌单）
            </label>
            <div>
              <button
                onClick={doRegenerate}
                disabled={initializing}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full transition-all disabled:opacity-50"
                style={{
                  color: C.primary,
                  background: `${C.sakura}14`,
                  border: `1px solid ${C.sakura}35`,
                }}
                title="清空现有音乐人格并重新让 LLM 生成"
              >
                {initializing ? '重新敲门中…' : '重新生成音乐人格'}
              </button>
            </div>
          </div>
        )}
      </div>

      {current && (
        <MiniPlayer
          name={current.name}
          artists={current.artists}
          albumPic={current.albumPic}
          playing={playing}
          onTap={onOpenPlayer}
          onPrev={prevSong}
          onToggle={togglePlay}
          onNext={nextSong}
        />
      )}
    </div>
  );
};

const StatCell: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <div className="flex flex-col items-center py-1">
    <div className="text-sm font-semibold" style={{ color: C.primary, fontFamily: `'Noto Serif', serif` }}>{value}</div>
    <div className="text-[9px] mt-0.5" style={{ color: C.muted }}>{label}</div>
  </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center gap-2 mb-2 px-1">
    <div className="w-1 h-3 rounded-full" style={{ background: `linear-gradient(180deg, ${C.primary}, ${C.accent})` }} />
    <span className="text-[11px] tracking-wider font-medium"
      style={{ color: C.text, fontFamily: `'Noto Serif', serif` }}>
      {children}
    </span>
  </div>
);

export default CharVisitPage;
