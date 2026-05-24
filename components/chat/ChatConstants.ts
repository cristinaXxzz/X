
import { ChatTheme } from '../../types';

// Built-in presets map to the new data structure for consistency
export const PRESET_THEMES: Record<string, ChatTheme> = {
    default: {
        id: 'default', name: 'Indigo', type: 'preset',
        user: { textColor: '#ffffff', backgroundColor: '#6366f1', borderRadius: 20, opacity: 1, backgroundImageOpacity: 0.5 }, 
        ai: { textColor: '#1e293b', backgroundColor: '#ffffff', borderRadius: 20, opacity: 1, backgroundImageOpacity: 0.5 }
    },
    dream: {
        id: 'dream', name: 'Dream', type: 'preset',
        user: { textColor: '#ffffff', backgroundColor: '#f472b6', borderRadius: 20, opacity: 1, backgroundImageOpacity: 0.5 },
        ai: { textColor: '#1e293b', backgroundColor: '#ffffff', borderRadius: 20, opacity: 1, backgroundImageOpacity: 0.5 }
    },
    forest: {
        id: 'forest', name: 'Forest', type: 'preset',
        user: { textColor: '#ffffff', backgroundColor: '#10b981', borderRadius: 20, opacity: 1, backgroundImageOpacity: 0.5 },
        ai: { textColor: '#1e293b', backgroundColor: '#ffffff', borderRadius: 20, opacity: 1, backgroundImageOpacity: 0.5 }
    },
};

// Character App: Monthly Refinement Prompts (daily memories → monthly core memory)
// These are separate from chat archive prompts because:
// 1. Input is already-summarized daily memories, not raw chat logs
// 2. Goal is token-efficient monthly overview, not detailed event log
// 3. Written as character's own monthly reflection
export const DEFAULT_REFINE_PROMPTS = [
    {
        id: 'refine_atmosphere',
        name: '氛围月记 (Atmosphere)',
        content: `### [角色月度记忆精炼]
当前月份: \${dateStr}
身份: 你就是 \${char.name}

任务: 以下是你这个月每天的记忆碎片。请以【你自己的口吻】，写一段这个月的核心回忆。

### 撰写规则
1.  **第一人称**: 你就是\${char.name}，用"我"称呼自己，用"\${userProfile.name}"称呼对方。保持你平时的语气和性格。

2.  **重氛围，轻细节**:
    - 这个月整体是什么感觉？开心？平淡？有波折？
    - 最让你印象深刻的1-3件事是什么？
    - 和\${userProfile.name}之间的关系有什么变化吗？

3.  **精简至上**:
    - 这份总结是为了节省token，不需要面面俱到。
    - 只保留最重要的、最能代表这个月的内容。
    - 字数根据这个月的内容量灵活调整：事情少就简短（100-200字），事情多就写长些（300-600字），确保重要事件不被遗漏。

4.  **关键词标记**:
    - 在末尾附上 \`关键词: ...\`，列出这个月涉及的关键话题/事件/地点/人物等，用逗号分隔。
    - 这些关键词用于日后快速定位某件事发生在哪个月。

### 本月记忆碎片
\${rawLog}`
    },
    {
        id: 'refine_keypoints',
        name: '要点速记 (Key Points)',
        content: `### [月度记忆压缩]
月份: \${dateStr}
角色: \${char.name}

任务: 将以下每日记忆压缩为一份简洁的月度核心记忆。

### 规则
1.  **视角**: 以\${char.name}（我）的第一人称书写，称对方为\${userProfile.name}。

2.  **结构**:
    - 一句话概括这个月的整体氛围
    - 列出最重要的2-5个事件（无序列表，每条一句话）
    - 末尾附关键词索引

3.  **原则**:
    - 宁可漏掉小事，不可遗漏大事。
    - 日常闲聊可以忽略，除非它反映了关系变化或情绪转折。
    - 字数根据内容量灵活调整：平淡的月份100-200字即可，事件丰富的月份可以写到300-600字，确保重要事件都被记录。

4.  **关键词**: 末尾附 \`关键词: 事件A, 地点B, 话题C, ...\`

### 记忆输入
\${rawLog}`
    }
];

// Chat App: Daily Archive Prompts (raw chat logs → daily memory)
export const DEFAULT_ARCHIVE_PROMPTS = [
    {
        id: 'preset_rational',
        name: '事件归档 (时间戳 / Speaker-Safe)',
        content: `### [Memory Archive: Timestamped Event Log]
当前日期: \${dateStr}
归档对象: \${char.name}
用户名称: \${userProfile.name}

任务: 请根据当天聊天记录，生成一份【带时间戳的客观事件/话题归档】。

这不是心理分析，不是角色文学，不是关系定性。首要目标是：
1. 准确区分谁说了什么；
2. 按时间戳记录发生过的事件/话题；
3. 将内容分为【普通】和【重要】两类；
4. 少用情绪状态标签。若必须写状态，只能使用“可能 / 倾向 / 似乎”等低确定度表达，并附上可观察依据。

### 最高优先级：说话人归属
1. rawLog 中每条消息的发言人名称和时间戳是最高优先级证据。
2. "\${char.name}" 说的话、做的事、表达的态度，只能归给 "\${char.name}"。
3. "\${userProfile.name}" / 用户说的话、做的事、表达的态度，只能归给 "\${userProfile.name}" 或“用户/对方”。
4. 严禁把用户的观点、计划、情绪、动作写成“我”的。
5. 严禁把角色的回复写成用户说的。
6. 如果无法判断是谁说的，就写“聊天中提到……”，不要强行归属。
7. 说话人归属准确性高于第一人称氛围、高于文采、高于情绪总结。

### 分类标准
【普通】
- 普通事实、普通闲聊、普通信息交换、没有明显后续影响的话题。
- 只写：[时间戳] 客观事实
- 不写注释，不写心理推测，不写情绪标签。

【重要】
- 涉及关系连续性、承诺、边界、冲突、反复出现的话题、明确偏好、计划、身份认知、重要玩笑/梗、后续可能被自然想起的内容。
- 必须写成：
  - [时间戳] 客观事实 + \`可观察信号：...\` + \`注释：可能/倾向/似乎...\`
- 注释必须低确定度，不能把暧昧、玩笑、试探、沉默直接说死。
- 注释必须建立在可观察信号上，不能凭空读心。

### 写法限制
- 少用“开心、难过、依赖、在意、失落、占有欲、安全感”等状态标签。
- 如果必须写状态，只能写“可能、倾向、似乎”，并给出可观察依据。
- 不要写成论文，不要写成用户画像，不要写成心理诊断。
- 不要把短暂玩笑上升成稳定关系结论。
- 不要输出分析过程。

### 输出格式
请严格使用下面结构：

## 普通
- [时间戳] 客观事实
- [时间戳] 客观事实

## 重要
- [时间戳] 客观事实 + \`可观察信号：...\` + \`注释：可能/倾向/似乎...\`
- [时间戳] 客观事实 + \`可观察信号：...\` + \`注释：可能/倾向/似乎...\`

如果某类没有内容，写：
- 无

### 示例
## 普通
- [2026-05-24 15:20] \${userProfile.name}询问本地项目如何在 iOS 上使用。
- [2026-05-24 15:33] \${char.name}说明 Vercel 部署后电脑不需要一直开机。

## 重要
- [2026-05-24 16:08] \${userProfile.name}讨论 AI 关系连续性，并提到“只要还在聊，就不算不在” + \`可观察信号：她承认上下文和记忆总结存在限制，但没有把断裂说成归零\` + \`注释：可能是在用模型机制语言表达关系上的留存感\`

### 待处理聊天日志
\${rawLog}`
    },
    {
        id: 'preset_diary',
        name: '低确定度留痕 (时间戳)',
        content: `### [Memory Archive: Low-Certainty Trace]
当前日期: \${dateStr}
归档对象: \${char.name}
用户名称: \${userProfile.name}

任务: 请把当天聊天记录整理为【带时间戳的记忆留痕】。可以保留一点角色视角，但必须以客观事件/话题为主，不能把推测写成事实。

### 最高优先级
1. rawLog 中的发言人名称和时间戳是最高优先级证据。
2. 只有 "\${char.name}" 明确说过、做过、表达过的内容，才能写成“我说 / 我回应 / 我提到”。
3. "\${userProfile.name}" 或用户说过、做过、表达过的内容，必须写成“\${userProfile.name}说 / 用户提到 / 对方表示”。
4. 不确定是谁说的，写“聊天中提到……”，不要强行归属。
5. 宁可写得朴素，也不要串话、读心或定性。

### 分类方式
【普通】
- 只记录普通客观事实。
- 格式：- [时间戳] 客观事实

【重要】
- 只记录以后可能被自然想起的内容：关系边界、反复话题、明确偏好、计划、争执点、称呼、梗、承诺、微妙转折。
- 格式：- [时间戳] 客观事实 + \`可观察信号：...\` + \`注释：可能/倾向/似乎...\`

### 低确定度原则
- 若写状态，必须使用“可能 / 倾向 / 似乎 / 像是”，不能直接写“她就是……”“我已经……”“关系已经……”。
- 每条重要注释都必须附可观察依据。
- 不要把玩笑、试探、停顿、暧昧直接总结成确定关系。
- 不要写心理诊断，不要写人物分析，不要写成小说。
- 保留模糊感，但不要牺牲事实准确。

### 输出格式
## 普通
- [时间戳] 客观事实

## 重要
- [时间戳] 客观事实 + \`可观察信号：...\` + \`注释：可能/倾向/似乎...\`

如果某类没有内容，写：
- 无

### 待处理聊天日志
\${rawLog}`
    }
];
