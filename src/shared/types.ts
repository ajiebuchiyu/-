// ============================================================
// StoryForge 数据模型（主进程 / 渲染进程共用）
// 严格对应产品规范 §4
// ============================================================

/** 角色（面向对象，结构化资源） */
export interface Character {
  id: string
  name: string
  portraits: Record<string, string> // expression -> 图片路径 / DataURL
  voiceId?: string // 声线
  color?: string // 无立绘时的默认色块头像颜色
}

/** 背景 / 场景 */
export interface Background {
  id: string
  name: string
  image: string
  weather?: 'none' | 'rain' | 'snow' | 'sakura' | 'star'
  timeOfDay?: 'day' | 'night' | 'dusk'
}

/** 音轨 */
export interface AudioTrack {
  id: string
  name: string
  type: 'bgm' | 'sfx' | 'voice'
  src: string
}

/** 视频片段 / 动态 CG（本地 DataURL 或外链 URL） */
export interface VideoClip {
  id: string
  name: string
  src: string // data:<mime>;base64,... 或 https://... 外链
  loop?: boolean // 是否循环播放
  volume?: number // 音量 0 ~ 100
}

/** 变量 */
export interface Variable {
  id: string
  name: string // 如 "好感度"
  type: 'number' | 'boolean' | 'string'
  initial: number | boolean | string
}

// ---------- 剧本元素（卡片） ----------

export type CardType =
  | 'dialogue'
  | 'choice'
  | 'bgSwitch'
  | 'portraitSwitch'
  | 'music'
  | 'transition'
  | 'variableOp'
  | 'video'

export interface ChoiceOption {
  label: string
  goto: string // 目标卡片 id
  /** 条件触发：仅当条件成立时该选项才出现（留空=始终出现） */
  condition?: Condition
  /** 好感度变化：选择此选项后各角色好感度的增减（正数增加、负数减少） */
  affectionChanges?: AffectionChange[]
}

/** 单个角色的好感度变化量 */
export interface AffectionChange {
  characterId: string
  delta: number // 正=好感上升，负=好感下降
}

export type ConditionOp = '>' | '>=' | '<' | '<=' | '==' | '!='

/** 自然语言式分支条件：如果 [变量] [大于] [数值] */
export interface Condition {
  varId: string
  op: ConditionOp
  value: number | boolean | string
}

export interface TransitionSpec {
  kind: string // fade / slide / dissolve ...
  duration: number // ms
}

export interface VariableOp {
  varId: string
  op: 'set' | 'add' | 'sub'
  value: number | boolean | string
}

export interface ScriptCard {
  id: string
  type: CardType
  speaker?: string // 角色名
  expression?: string // 表情 key
  text?: string // 台词 / 旁白 / 视频字幕
  choices?: ChoiceOption[] // 选项 -> 目标卡片 id
  background?: string // Background id
  music?: string // AudioTrack id
  transition?: TransitionSpec // 转场类型 / 时长(ms)
  variableOps?: VariableOp[]
  position?: 'left' | 'center' | 'right' // 立绘位置
  goto?: string // 顺序下一卡片 id（线性流）
  // —— 新增强化项 ——
  video?: string // VideoClip id（动态 CG / 过场视频，全屏播放）
  portraitOverride?: string // 单页专属立绘（DataURL），优先于角色表情；玩家可单独更换某一页立绘
  voice?: string // 角色配音（DataURL / AudioTrack id，随本句台词播放）
  // —— 每页独立的天气/时段（覆盖 Background 对象的默认值） ——
  cardWeather?: 'none' | 'rain' | 'snow' | 'sakura' | 'star'
  cardTimeOfDay?: 'day' | 'night' | 'dusk'
}

export interface Project {
  id: string
  title: string
  scenes: ScriptCard[][] // 按场景分组的剧本流
  characters: Character[]
  backgrounds: Background[]
  audioTracks: AudioTrack[]
  videos: VideoClip[] // 视频片段 / 动态 CG 库
  variables: Variable[]
  createdAt: number
  shell: GameShell // 游戏外壳：开始界面 / 菜单 / 设置（玩家可编辑、随导出生效）
  globalBgmId?: string | null // 全局背景音乐（AudioTrack.id）；设则贯穿整个项目，单页 music 可覆盖
}

// ---------- 游戏外壳（开始界面 / 菜单 / 设置） ----------

/** 开始界面菜单项的可执行动作 */
export type ShellMenuAction = 'start' | 'continue' | 'settings' | 'credits'

export interface ShellMenuItem {
  id: string
  label: string
  action: ShellMenuAction
}

/** 游戏内可调节的设置项 */
export interface GameShellSettings {
  textSpeed: number // 文字打字速度 1(慢) ~ 10(快)，越大越快
  bgmVolume: number // BGM 音量 0 ~ 100
  sfxVolume: number // 音效 / 语音音量 0 ~ 100
  autoBgm: boolean // BGM 是否循环播放
  // —— 常用项补全 ——
  autoPlay?: boolean // 自动阅读（播完一张自动下一张）
  autoSpeed?: number // 自动阅读间隔 ms
  showPortraits?: boolean // 是否显示立绘
  subtitleBg?: boolean // 字幕是否有底纹
  voiceVolume?: number // 语音音量 0 ~ 100
  fullscreen?: boolean // 是否默认全屏
}

/** 开始界面外观自定义 */
export interface GameShellAppearance {
  titleColor?: string // 标题颜色（CSS 颜色，留空用主题色）
  layout?: 'center' | 'bottom' | 'left' // 标题 / 菜单布局（left = RenPy 式左侧竖排菜单）
  bgBlur?: boolean // 背景模糊
  titleSize?: number // 标题字号 px
}

/** 开始界面配置 */
export interface GameShellStart {
  title: string // 大标题（默认沿用 project.title）
  subtitle: string // 副标题
  backgroundId: string | null // 引用 backgrounds 的背景图（为空则用渐变）
  showContinue: boolean // 是否在菜单中显示「继续游戏」
  menu: ShellMenuItem[] // 开始界面菜单项（可自由增删、排序、改动作）
  appearance?: GameShellAppearance // 外观自定义
}

export interface GameShell {
  enabled: boolean // 是否启用开始界面（关闭则直接进入剧情）
  start: GameShellStart
  settings: GameShellSettings
}

/** 生成一份默认游戏外壳配置 */
export function defaultGameShell(title: string): GameShell {
  return {
    enabled: true,
    start: {
      title: title || '未命名故事',
      subtitle: '一款由 StoryForge 创作的视觉小说',
      backgroundId: null,
      showContinue: true,
      menu: [
        { id: 'm_start', label: '开始游戏', action: 'start' },
        { id: 'm_continue', label: '继续游戏', action: 'continue' },
        { id: 'm_settings', label: '设置', action: 'settings' },
        { id: 'm_credits', label: '制作名单', action: 'credits' }
      ]
    },
    settings: {
      textSpeed: 6,
      bgmVolume: 70,
      sfxVolume: 80,
      autoBgm: true,
      voiceVolume: 80
    }
  }
}

/** 为旧工程补全 shell 字段（向后兼容：已保存的 Project 可能没有 shell） */
export function withDefaultShell(p: Project): Project {
  if (p.shell) return p
  return { ...p, shell: defaultGameShell(p.title) }
}

// ---------- 工具类型 ----------

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  dialogue: '对话',
  choice: '选项分支',
  bgSwitch: '背景切换',
  portraitSwitch: '立绘切换',
  music: '音乐播放',
  transition: '转场',
  variableOp: '变量赋值',
  video: '视频 / 动态CG'
}

export const CARD_TYPE_ICONS: Record<CardType, string> = {
  dialogue: '💬',
  choice: '🔀',
  bgSwitch: '🖼️',
  portraitSwitch: '🧍',
  music: '🎵',
  transition: '✨',
  variableOp: '🔢',
  video: '🎬'
}

/** IPC 通道名 */
export const IPC = {
  IMPORT_DOC: 'import:doc',
  IMPORT_ASSET: 'import:asset',
  IMPORT_ASSETS_MULTI: 'import:assets-multi',
  EXPORT_HTML: 'export:html',
  EXPORT_EXE: 'export:exe',
  OPEN_PREVIEW: 'preview:open',
  PREVIEW_UPDATE: 'preview:update',
  PREVIEW_READY: 'preview:ready',
  AI_CHAT: 'ai:chat',
  // ---- 项目书架（本地文件夹存储）----
  PROJECT_PICK_FOLDER: 'project:pickFolder',
  PROJECT_PICK_COVER: 'project:pickCover',
  PROJECT_LIST: 'project:list',
  PROJECT_CREATE: 'project:create',
  PROJECT_LOAD: 'project:load',
  PROJECT_SAVE: 'project:save',
  PROJECT_DELETE: 'project:delete',
  PROJECT_OPEN_FOLDER: 'project:openFolder'
} as const

// ---------- 项目书架（本地文件夹存储）----------

/** 书架中一个项目的元信息（不含完整剧本） */
export interface ProjectFolderInfo {
  id: string
  name: string
  /** 项目所在的本地文件夹绝对路径（Web 演示版为合成的伪路径） */
  folderPath: string
  /** 封面图（DataURL）；为空时书架用渐变占位 */
  cover: string | null
  updatedAt: number
}

/** 新建项目的输入 */
export interface NewProjectInput {
  name: string
  /** 封面图 DataURL，可空 */
  coverDataUrl: string | null
  /** 用户选择的本地文件夹路径 */
  folderPath: string
}

/** 保存项目到文件夹的输入 */
export interface ProjectSaveInput {
  folderPath: string
  project: Project
}

// ---------- AI 请求/响应（统一 OpenAI 兼容协议） ----------

export interface AIChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIChatRequest {
  baseURL: string // OpenAI 兼容根地址（不含 /chat/completions）
  apiKey: string
  model: string
  messages: AIChatMessage[]
  temperature?: number
  maxTokens?: number
  jsonMode?: boolean // 是否请求 response_format: json_object
}

export interface AIChatResponse {
  ok: boolean
  content?: string
  error?: string
}

/** 本地资源导入结果（图片 / 音频），统一返回 DataURL 以便嵌入 IndexedDB 与导出的 HTML */
export interface AssetImportResult {
  fileName: string
  dataUrl: string // data:<mime>;base64,...
}

/** 多选导入结果（一次选择多个文件） */
export type AssetImportResults = AssetImportResult[]

/** 导出选项（发布面板可配置） */
export interface ExportOptions {
  includeShell?: boolean // 是否包含开始界面 / 菜单外壳（关闭则直接进入剧情）
  saveSlots?: number // 存档槽数量（0 表示仅单一「继续」进度）
  showBranding?: boolean // 是否在制作名单显示 StoryForge 署名
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  includeShell: true,
  saveSlots: 3,
  showBranding: true
}
