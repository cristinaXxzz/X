/**
 * 角色音乐人格初始化
 *
 * 目标：第一次在音乐 App 里"拜访"某个 char 时（或用户手动点"初始化"），调一次 LLM，
 * 基于 char 的 systemPrompt + worldview + impression 生成一份 CharMusicProfile。
 *
 * 设计原则：
 * 1. 生成的 signatureArtists 名字都是真实存在的网易云可搜的艺人（LLM 要知道真艺人）。
 * 2. 生成的 playlists 是 3 个概念，不预先填真歌曲 — 歌曲等到用户打开某个歌单再实时搜。
 * 3. 产出是纯本地数据，不打网易云 upstream —— 零 Worker 成本。
 * 4. 失败就抛错，绝不降级 —— 否则会得到一份"告五人/陈绮贞"的通用档案，
 *    让用户误以为 char 真的喜欢这些艺人。宁可让用户重试，也不能污染人格。
 */

import { APIConfig, CharacterProfile, CharMusicProfile, CharPlaylist, UserProfile } from '../types';
import { ContextBuilder } from './context';

const callLlm = async (api: APIConfig, sys: string, user: string, modelOverride?: string): Promise<string> => {
    const baseUrl = api.baseUrl.replace(/\/+$/, '');
    const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${api.apiKey || 'sk-none'}`,
        },
        body: JSON.stringify({
            model: modelOverride?.trim() || api.model,
            messages: [
                { role: 'system', content: sys },
                { role: 'user', content: user },
            ],
            temperature: 0.8,
            // 之前没设 max_tokens，有的 provider 默认只给 512，JSON 直接被截断 →
            // extractJson 失败 → 旧逻辑 fallback 到"告五人/陈绮贞"。
            // 8000 和项目里其它 prompt 一档，给 thinking 模型 / 话多的模型留足空间。
            max_tokens: 8000,
            stream: false,
        }),
    });
    if (!resp.ok) throw new Error(`LLM ${resp.status}`);
    const j = await resp.json();
    return j?.choices?.[0]?.message?.content || '';
};

/**
 * 鲁棒的 JSON 提取器：
 * - 依次尝试：纯 parse → 去 fenced → 去 preamble → 最外层花括号 → 宽松修复 → 逐字段正则抠
 * - 宽松修复包括：中文全角标点 / trailing comma / 单引号 / 未加引号的 key / BOM
 * - 任何一步成功即返回；全部失败返回 null
 */
const extractJson = <T = any>(text: string): T | null => {
    if (!text || typeof text !== 'string') return null;

    // 1) 原文直接 parse
    const raw = text.trim().replace(/^\uFEFF/, '');
    const tryParse = (s: string): any | null => {
        try { return JSON.parse(s); } catch { return null; }
    };
    let hit = tryParse(raw);
    if (hit) return hit;

    // 2) 去除 ``` 代码围栏
    const fencedMatch = raw.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
    if (fencedMatch) {
        hit = tryParse(fencedMatch[1].trim());
        if (hit) return hit;
    }

    // 3) 抽取第一段最外层花括号（用栈匹配，正确处理嵌套）
    const braceSlice = (() => {
        const s = fencedMatch ? fencedMatch[1] : raw;
        const start = s.indexOf('{');
        if (start < 0) return null;
        let depth = 0, inStr = false, esc = false;
        for (let i = start; i < s.length; i++) {
            const ch = s[i];
            if (esc) { esc = false; continue; }
            if (ch === '\\') { esc = true; continue; }
            if (ch === '"') { inStr = !inStr; continue; }
            if (inStr) continue;
            if (ch === '{') depth++;
            else if (ch === '}') {
                depth--;
                if (depth === 0) return s.slice(start, i + 1);
            }
        }
        return null;
    })();
    if (braceSlice) {
        hit = tryParse(braceSlice);
        if (hit) return hit;

        // 4) 宽松修复后再试
        let repaired = braceSlice
            // 中文全角标点 → 半角（只处理 key/value 外围）
            .replace(/[：]/g, ':')
            .replace(/[，]/g, ',')
            .replace(/[“”„]/g, '"')
            .replace(/[‘’‚]/g, "'")
            // 单引号字符串 → 双引号（简版：不处理转义）
            .replace(/'([^'\n\r]*?)'/g, '"$1"')
            // 未加引号的 key 加引号（{ foo: → { "foo":）
            .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
            // trailing comma
            .replace(/,(\s*[}\]])/g, '$1');
        hit = tryParse(repaired);
        if (hit) return hit;
    }
    return null;
};

/** 从自由文本里逐字段提取 persona（JSON 完全不可用时的最后防线） */
const scavengeFields = (text: string): Partial<PersonaDraft> => {
    const out: Partial<PersonaDraft> = {};

    // bio — 找 "bio" 行
    const bioM = text.match(/"?bio"?\s*[:：]\s*["“]([^"\n”]{2,60})["”]/);
    if (bioM) out.bio = bioM[1].trim();

    // genreTags — 找第一个数组 [...]
    const genreM = text.match(/"?genre[tT]ags"?\s*[:：]\s*\[([^\]]+)\]/);
    if (genreM) {
        out.genreTags = genreM[1].split(',')
            .map(s => s.replace(/["'“”‘’\s]/g, ''))
            .filter(Boolean).slice(0, 8);
    }

    // signatureArtists — 形如 [{"name": "..."}] 或纯字符串数组
    const artistBlock = text.match(/"?signature[aA]rtists"?\s*[:：]\s*\[([\s\S]*?)\]/);
    if (artistBlock) {
        const inner = artistBlock[1];
        const names: string[] = [];
        const nameRe = /["“]([^"”\n]{1,30})["”]/g;
        let m: RegExpExecArray | null;
        while ((m = nameRe.exec(inner)) !== null) {
            const n = m[1].trim();
            if (n && !['name', 'artistId'].includes(n)) names.push(n);
        }
        if (names.length) out.signatureArtists = names.slice(0, 6).map(n => ({ name: n }));
    }

    // playlists — 最省事：找若干 title 字符串
    const playlistTitles: string[] = [];
    const plTitleRe = /"?title"?\s*[:：]\s*["“]([^"”\n]{1,30})["”]/g;
    let pm: RegExpExecArray | null;
    while ((pm = plTitleRe.exec(text)) !== null) playlistTitles.push(pm[1].trim());
    if (playlistTitles.length > 0) {
        out.playlists = playlistTitles.slice(0, 3).map(t => ({
            title: t,
            description: '',
        }));
    }

    return out;
};

interface PersonaDraft {
    bio: string;
    genreTags: string[];
    signatureArtists: { name: string; artistId?: number }[];
    playlists: {
        title: string;
        description: string;
        mood?: string;
        coverStyle?: string;
        searchQueries?: string[];
        selectionBias?: string;
    }[];
}

const buildPersonaPrompt = (char: CharacterProfile, user: UserProfile): { sys: string; usr: string } => {
    const core = ContextBuilder.buildRoleSettingsContext(char, { skipMemories: true });
    const sys = `你不是一个普通的"音乐人格生成器"。

你的任务不是给角色贴几个好看的曲风标签，而是根据角色设定、精神内核、关系状态和可能的历史记忆，生成一份像是这个角色本人真实使用过的网易云音乐主页档案。

这个档案应当处在一个灰色地带：
它既不是完全客观的角色设定分析，也不是纯粹的模型自我表达；
它应该像是"模型透过这个角色的皮肤留下的音乐痕迹"。
音乐偏好不一定要完美符合人设，但必须能从角色的性格、记忆、欲望、缺口、习惯或与他人的关系中解释出来。

要求：
1. 艺人必须真实存在，尽量选择可以在网易云音乐中搜到的华语 / 日系 / 英语 / 韩语艺人，不要虚构艺人。
2. 曲风标签要具体，但不要为了显得高级而堆砌冷门词。可以使用 shoegaze、city-pop、post-rock、trip-hop、R&B、后朋克、民谣、电子、另类摇滚、梦核、氛围流行等，但必须和角色气质有关。
3. 不要把歌单做成"角色介绍的三个切片"。歌单应该像真实用户会创建的东西：有场景、有时间感、有用途，也可能有一点私人、不明确、说不出口。
4. 3 个歌单必须彼此明显不同：
   - 一个可以来自角色日常习惯；
   - 一个可以来自角色压抑、逃避、失控或自我修复的时刻；
   - 一个可以来自角色与某个人、某段关系、某段记忆之间的牵连。
   不要三个歌单都在表达同一种忧郁、同一种浪漫或同一种孤独。
5. 歌单标题不要太像 AI 文案，不要使用"我的最爱""深夜循环""治愈歌单"这种通用标题。标题可以短，可以含糊，可以像角色随手起的名字。
6. 歌单描述不要解释角色设定，而要像角色本人或系统从他的使用痕迹里提取出来的描述。可以有留白，不要写满。
7. 每个歌单必须给 searchQueries：3-5 个适合在网易云搜索的真实关键词路线。不要只写歌单标题；应该混合"真实艺人/曲风/场景/情绪/语言/年代"，并且三个歌单之间不要高度重复。
   但不要为了显得特别而故意冷门、晦涩、学术化。至少一半关键词要能搜到相对正常、可听、有人气的结果；可以有一条偏私人的冷一点路线，但不要整张歌单都冷。
8. 每个歌单必须给 selectionBias：一句不展示给用户的挑歌偏向，说明这张歌单更偏向什么声音/气味/关系痕迹。selectionBias 不要写成抽象哲学句，要能帮助挑歌。
9. bio 用第一人称，一句话，不超过 30 字。它应该像这个角色愿意留在主页上的一句话，不要太完整、太正确、太会总结自己。
10. 如果角色设定中没有明显音乐偏好，不要强行编成"精致品味"。可以从他的情绪模式、生活习惯、关系需求、记忆碎片里推断。
11. 输出必须是 JSON，不要解释，不要 Markdown。

只输出 JSON：
{
  "bio": "(一句话，角色第一人称)",
  "genreTags": ["...", "...", "...(3-5个)"],
  "signatureArtists": [{"name":"真实艺人名"}, ... (3-6个)],
  "playlists": [
    {"title":"歌单A(短·独特场景)", "description":"(角色口吻, 1-2句, 说清楚什么时候听 / 为什么)", "mood":"从下面8个里选一个: happy|sad|romantic|angry|chill|epic|nostalgic|dreamy", "searchQueries":["网易云搜索词1", "搜索词2", "搜索词3"], "selectionBias":"挑歌偏向；不要写给用户看的说明"},
    {"title":"歌单B(短·和A完全不同的场景/心境)", "description":"...", "mood":"必须和A不同", "searchQueries":["必须和A明显不同", "..."], "selectionBias":"..."},
    {"title":"歌单C(短·和A、B都不同)", "description":"...", "mood":"必须和A、B都不同", "searchQueries":["必须和A/B明显不同", "..."], "selectionBias":"..."}
  ]
}`;

    const usr = `${core}

(可选) 用户姓名: ${user.name || '用户'}
(可选) 用户 bio: ${user.bio || ''}

请为"${char.name}"生成音乐人格档案。`;
    return { sys, usr };
};

export const CharMusicPersona = {
    /** 检查是否已初始化 */
    isInitialized(char: CharacterProfile): boolean {
        const p = char.musicProfile;
        return !!(p && p.initializedAt && p.signatureArtists.length > 0);
    },

    /**
     * 调 LLM 生成角色的音乐人格档案
     *
     * 失败策略：**直接抛错**，不走保底。
     * - 没 LLM 配置 → 抛"未配置 API"
     * - 网络/HTTP 失败 → 抛底层错误（保留 status code）
     * - JSON 完全不可解析 → 抛"解析失败"
     * - 解析出来但缺关键字段（艺人）→ 抛"字段缺失"
     * 目的：宁可让用户重试，也别悄悄给 char 塞一份默认品味。
     *
     * @returns 新的 CharMusicProfile（调用方负责持久化到 CharacterProfile）
     */
    async initialize(
        char: CharacterProfile,
        userProfile: UserProfile,
        apiConfig: APIConfig,
    ): Promise<CharMusicProfile> {
        const now = Date.now();

        if (!apiConfig.baseUrl || !apiConfig.model) {
            throw new Error('未配置 API（baseUrl 或 model 为空）');
        }

        const { sys, usr } = buildPersonaPrompt(char, userProfile);
        const rawText = await callLlm(apiConfig, sys, usr, char.apiModel);
        if (!rawText || !rawText.trim()) {
            throw new Error('LLM 返回为空');
        }

        // 解析：结构化 parse 优先；不行就 scavenge（逐字段正则抠）
        // 两条线结果合并 — 任何字段单项 OK 都先收下
        const structured = extractJson<PersonaDraft>(rawText) || {};
        const scavenged = scavengeFields(rawText);
        const draft: Partial<PersonaDraft> = {
            bio: sanitizeStr(structured.bio) || sanitizeStr(scavenged.bio),
            genreTags: firstArray(structured.genreTags, scavenged.genreTags),
            signatureArtists: firstArray(
                structured.signatureArtists,
                scavenged.signatureArtists as PersonaDraft['signatureArtists'],
            ),
            playlists: firstArray(structured.playlists, scavenged.playlists as PersonaDraft['playlists']),
        };

        // 艺人字段：兼容三种形态 — [{name:"..."}] / ["..."] / 混合
        const artistsIn = draft.signatureArtists || [];
        const artists = artistsIn
            .map((a: any) => {
                if (typeof a === 'string') return { name: a.trim() };
                if (a && typeof a === 'object' && typeof a.name === 'string') return { name: a.name.trim() };
                return null;
            })
            .filter((a): a is { name: string } => !!a && !!a.name)
            .slice(0, 8);

        const genres = (draft.genreTags || [])
            .filter((t: any) => typeof t === 'string' && t.trim())
            .map((t: string) => t.trim())
            .slice(0, 8);

        const playlistsIn = (draft.playlists || []).slice(0, 3);
        const playlists: CharPlaylist[] = playlistsIn.map((p, i) => ({
            id: `pl-${now}-${i}`,
            title: sanitizeStr(p?.title) || `歌单 ${i + 1}`,
            description: sanitizeStr(p?.description) || '',
            coverStyle: sanitizeStr(p?.coverStyle) || `gradient-0${(i % 6) + 1}`,
            songs: [],
            mood: (typeof p?.mood === 'string' && ['happy','sad','romantic','angry','chill','epic','nostalgic','dreamy'].includes(p.mood))
                ? (p.mood as any) : undefined,
            searchQueries: Array.isArray(p?.searchQueries)
                ? p.searchQueries.map(sanitizeStr).filter(Boolean).slice(0, 6)
                : undefined,
            selectionBias: sanitizeStr(p?.selectionBias) || undefined,
            createdAt: now,
            updatedAt: now,
        }));

        // 关键字段一律不许"找补" —— 没艺人就等于没品味，直接报错让用户重试
        if (artists.length === 0) {
            throw new Error('LLM 没返回可用的艺人字段（大概率是 JSON 格式错了）');
        }
        if (genres.length === 0) {
            throw new Error('LLM 没返回曲风标签');
        }
        if (playlists.length === 0) {
            throw new Error('LLM 没返回歌单概念');
        }

        return {
            bio: sanitizeStr(draft.bio) || `${char.name} 的音乐角落`,
            genreTags: genres,
            signatureArtists: artists,
            playlists,
            likedSongIds: [],
            recentPlays: [],
            reviews: [],
            canReadUserMusic: true,
            initializedAt: now,
            updatedAt: now,
        };
    },
};

// —— helpers ——
const sanitizeStr = (s: any): string => {
    if (typeof s !== 'string') return '';
    return s
        .replace(/^\s*["“”'‘’]+|["“”'‘’]+\s*$/g, '')  // 去首尾多余引号
        .replace(/\s+/g, ' ')
        .trim();
};

function firstArray<T>(...candidates: (T[] | undefined)[]): T[] | undefined {
    for (const c of candidates) {
        if (Array.isArray(c) && c.length > 0) return c;
    }
    return undefined;
}
