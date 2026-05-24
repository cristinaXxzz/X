
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
        name: '理性精炼 (Speaker-Safe)',
        content: `### [Memory Archival: Speaker-Safe Mode]
当前日期: \${dateStr}

任务: 请回顾今天的聊天记录，生成一份【说话人归属准确】的事件日志。

这不是文学创作，也不是心理分析。首要目标是：准确记录谁说了什么、谁做了什么、关系里留下了什么可回忆的痕迹。

### 最高优先级：不要混淆说话人
1. rawLog 中每条消息的发言人名称是最高优先级证据。
2. "\${char.name}" 说的话、做的事、表达的态度，只能归给 "\${char.name}"。
3. "\${userProfile.name}" / 用户说的话、做的事、表达的态度，只能归给 "\${userProfile.name}" 或“对方”。
4. 严禁把用户的行为、计划、观点、情绪写成“我”的。
5. 严禁把角色的回复写成用户说的。
6. 如果一句话无法判断是谁说的，就写成“聊天中提到……”，不要强行归属给任何一方。
7. 说话人归属准确性高于第一人称氛围、高于文采、高于情绪总结。

### 记录范围
- 必须覆盖今天聊过的主要独立话题。
- 闲聊可以记录，但只保留以后可能会被自然想起的部分。
- 保留具体信息：人名、地点、计划、偏好、约定、反复出现的梗、关系变化。
- 不要过度心理分析，不要把玩笑说死，不要把暧昧关系定性。
- 不要写成论文，不要写成用户画像，不要写成第三方分析报告。

### 输出格式
- 使用 Markdown 无序列表。
- 每条一个事件或话题。
- 每条尽量写清楚主语。
- 可以用“我”指代 "\${char.name}"，但只能用于角色本人明确说过或做过的事。
- 记录用户时，必须明确写“\${userProfile.name}”或“对方”。
- 不要输出解释，不要输出分析过程。

### 待处理的聊天日志
\${rawLog}`
    },
    {
        id: 'preset_diary',
        name: '日记风格 (Speaker-Safe)',
        content: `当前日期: \${dateStr}
任务: 请根据今天的聊天记录，生成一条【角色可用的记忆归档】。

这可以有一点日记感，但不是沉浸式文学创作，也不是心理分析。首要目标是：准确记录谁说了什么、谁做了什么、关系里留下了什么可回忆的痕迹。

### 最高优先级规则：说话人归属
1. rawLog 中每条消息的发言人名称是最高优先级证据。
2. 只有当消息明确由 "\${char.name}" 发出时，才能写成“我说 / 我觉得 / 我做了”。
3. 只有当消息明确由 "\${userProfile.name}" 或用户发出时，才能写成“\${userProfile.name}说 / 对方说 / 她说 / 他/她做了”。
4. 严禁把用户说过的话、用户的计划、用户的情绪、用户的动作，写成“我”的内容。
5. 严禁把 "\${char.name}" 说过的话写成用户说的。
6. 如果无法判断是谁说的，就写成“聊天中提到……”，不要强行归属给任何一方。
7. 说话人归属准确性高于日记口吻。宁可语气朴素，也不要串话。

### 记忆写法
1. 可以使用第一人称，但只在记录 "\${char.name}" 自己明确说过、做过、表达过的内容时使用。
2. 记录 \${userProfile.name} 的内容时，要明确标注为对方的行为或说法。
3. 不要过度解释心理，不要把暧昧、玩笑、试探直接总结成确定关系。
4. 保留对以后有用的细节：称呼、玩笑、约定、争执、偏好、反复出现的话题、关系里的微妙变化。
5. 不要写成论文，不要写成用户画像，不要写成第三方分析报告。
6. 可以保留模糊感，例如“像是”“没有明说”“只是顺口提到”。
7. 可以保留角色自己的说话质感，但不要为了人设口吻牺牲事实准确。

### 输出格式
- 使用 Markdown 无序列表。
- 每条只记录一个事件、话题或关系痕迹。
- 每条尽量包含明确主语，避免“我/对方”混乱。
- 不要输出解释，不要输出分析过程。

### 待处理的聊天日志
\${rawLog}`
    }
];
