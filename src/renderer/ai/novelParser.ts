import type { Character, Project, ScriptCard } from '@shared/types'
import { uid } from '../lib/id'
import { chat } from './llmClient'
import { parseDocToProject } from '../import/parseDoc'
import { looksLikeCharacterName } from '../lib/characterName'

// ============================================================
// 小说 → 剧本：AI 智能解析（流式 / 后台 / 可暂停）
// 由大模型识别「对白 / 旁白 / 说话人 / 情绪」，转成 ScriptCard[]，
// 自动创建角色占位符，并用 goto 串成线性流。
//
// 与旧版的区别：新版「边识别边展示」。每解析完一段就通过 onChunk
// 把这一段的新增卡片 / 角色回调出去，由调用方实时并入工程（剧情页
// 立即出现内容）；识别过程不再阻塞界面，用户可随时暂停 / 继续 / 停止。
// 长文自动分块调用；任一块失败自动降级到规则解析，保证不中断。
// ============================================================

/** LLM 单条输出元素 */
interface AIElement {
  type: 'dialogue' | 'narration'
  speaker?: string
  text: string
  emotion?: string
}

const EMOTIONS = ['normal', 'happy', 'sad', 'angry', 'shy', 'surprised']

/** 小说常见元数据、章节标题、平台信息黑名单 */
const METADATA_PATTERNS = [
  /^作者[\s:：]/,
  /^简介[\s:：]/,
  /^编号[\s:：]/,
  /^原名[\s:：]/,
  /^别名[\s:：]/,
  /^状态[\s:：]/,
  /^接口[\s:：]/,
  /^更新[时间\s:：]/,
  /^来源[\s:：]/,
  /^标签[\s:：]/,
  /^分类[\s:：]/,
  /^字数[\s:：]/,
  /^最新[章节\s:：]/,
  /^目录[\s:：]?/,
  /^第[一二三四五六七八九十零\d]+章/,
  /^第\d+章/,
  /^第\d+节/,
  /^正文[\s:：]?/,
  /^序章[\s:：]?/,
  /^番外[\s:：]?/,
  /^（来源|转码|整理|搬运|采集|爬虫|接口|网络|网文）/,
  /^https?:\/\//,
  /^www\./
]

const SYSTEM_PROMPT = `你是专业的视觉小说（GalGame/AVG）剧本改编师。任务：把用户提供的小说片段改编为适合逐条演出的游戏剧本，而不是原封不动地复制原文。

改编原则：
1. 保留核心剧情、对话、动作和情绪节奏，但要做“游戏化”处理：
   - 把过长的叙述拆成可逐条点击演出的短句；
   - 把心理描写/环境描写转为旁白 narration；
   - 把角色说的话转为 dialogue，并标出说话人；
   - 同一角色的台词适当合并，避免一句话一张卡。
2. 严格过滤以下内容，不要输出：
   - 作者、简介、编号、原名、别名、状态、接口、更新时间、来源、标签、分类、字数等元数据；
   - 章节标题（如“第一章”“第X章”）；
   - 网址、API 接口、平台信息；
   - 与剧情无关的说明性/评论性文字。
3. 角色名用最简洁的称呼（如「林晚」而非「林晚同学」），同一人保持一致；不要编造原文中没有的角色。
   以下绝对不是角色名，遇到它们作为旁白或属性说明处理：姓名、性别、年龄、身高、修为、境界、根骨、资质、天赋、神通、功法、法宝、丹道、剑道、阵道、修炼、攻击、防御、生命、法力、经验、等级、善恶值、声望、贡献、积分、金币、灵石等属性/数值/系统术语。
4. 如果原文出现多个说话人但没有明确提示，请根据上下文合理推断；实在无法推断则归为 narration。
5. emotion 只能从 [normal, happy, sad, angry, shy, surprised] 中选择；拿不准填 normal。
6. 台词中的中文引号「」“”和英文引号要去掉，仅保留话语本身。

输出格式：只输出一个 JSON 对象，不要 markdown 代码块，不要解释文字。
{"cards":[{"type":"dialogue","speaker":"角色名","text":"台词","emotion":"normal"}, {"type":"narration","text":"旁白描写"}, ...]}`

/** 进度阶段（兼容旧回调） */
export interface ParseProgress {
  phase: 'chunking' | 'calling' | 'merging' | 'done' | 'fallback'
  current?: number
  total?: number
  message?: string
}

const palette = ['#ff8fab', '#5cc8ff', '#ffd166', '#9b5de5', '#06d6a0', '#f4845f', '#ef476f', '#118ab2']

// ============================================================
// 导入控制器：管理 运行 / 暂停 / 停止 状态，并作为 UI 的唯一数据源
// ============================================================

export type ImportStatus = 'running' | 'paused' | 'done' | 'stopped' | 'error'

export class NovelImportController {
  status: ImportStatus = 'running'
  phase: ParseProgress['phase'] = 'chunking'
  current = 0
  total = 0
  cardsAdded = 0
  message = ''
  usedAI = false
  fallback = false
  startedAt = Date.now()

  private _paused = false
  private _stopped = false
  private _resolvers: Array<() => void> = []
  private _listeners = new Set<() => void>()

  /** UI 主动刷新（订阅式，避免轮询） */
  subscribe(fn: () => void): () => void {
    this._listeners.add(fn)
    return () => {
      this._listeners.delete(fn)
    }
  }
  private _emit(): void {
    this._listeners.forEach((l) => l())
  }

  /** 解析器用来汇报状态 */
  patch(p: Partial<Pick<NovelImportController, 'phase' | 'current' | 'total' | 'cardsAdded' | 'message' | 'usedAI' | 'fallback'>>): void {
    Object.assign(this, p)
    this._emit()
  }
  setStatus(s: ImportStatus): void {
    this.status = s
    this._emit()
  }

  pause(): void {
    if (this.status === 'running') {
      this._paused = true
      this.setStatus('paused')
    }
  }
  resume(): void {
    if (this.status !== 'paused') return
    this._paused = false
    this.setStatus('running')
    const rs = this._resolvers
    this._resolvers = []
    rs.forEach((r) => r())
  }
  /** 停止：立即结束（已识别内容保留） */
  stop(): void {
    if (this.status === 'running' || this.status === 'paused') {
      this._stopped = true
      this.setStatus('stopped')
      const rs = this._resolvers
      this._resolvers = []
      rs.forEach((r) => r())
    }
  }

  isPaused(): boolean {
    return this._paused
  }
  isStopped(): boolean {
    return this._stopped
  }
  /** 若处于暂停，则挂起直到 resume() 被调用 */
  waitIfPaused(): Promise<void> {
    if (!this._paused) return Promise.resolve()
    return new Promise<void>((resolve) => this._resolvers.push(resolve))
  }
}

// ============================================================
// 流式解析
// ============================================================

/** 单段识别完成后回调的内容 */
export interface RecognizedChunk {
  /** 本段新增的剧本卡片（已串好段内 goto） */
  cards: ScriptCard[]
  /** 本段新识别出的角色（已去重，可直接并入工程） */
  characters: Character[]
  /** 本段是否走了规则兜底（非 AI） */
  isFallback: boolean
  /** 本段是否使用了 AI */
  usedAI: boolean
}

export interface StreamParseResult {
  project: Project
  usedAI: boolean
  note?: string
  /** 是否因「停止」而提前结束（内容已部分并入） */
  stoppedEarly: boolean
  /** 已识别并回调的卡片总数 */
  totalCards: number
}

export interface StreamParseOptions {
  controller?: NovelImportController
  /** 每识别完一段回调一次（用于实时并入工程 / 滚动到新内容） */
  onChunk?: (chunk: RecognizedChunk, totalAdded: number) => void
}

/**
 * 流式识别：边解析边通过 onChunk 回传，支持暂停 / 停止。
 * 已并入工程的内容在「停止」后仍保留。
 */
export async function parseNovelStreaming(
  rawText: string,
  base: Project,
  opts: StreamParseOptions = {}
): Promise<StreamParseResult> {
  const text = rawText.replace(/\r\n?/g, '\n').trim()
  const controller = opts.controller
  if (!text) {
    controller?.setStatus('done')
    return { project: base, usedAI: false, note: '空文本', stoppedEarly: false, totalCards: 0 }
  }

  controller?.patch({ phase: 'chunking', message: '正在分块…' })
  const chunks = splitIntoChunks(text, 1600)
  controller?.patch({ total: chunks.length, current: 0 })

  const charactersAcc = new Map<string, Character>()
  base.characters.forEach((c) => charactersAcc.set(c.name, c))

  const collectedCards: ScriptCard[] = []
  let mode: 'ai' | 'rule' = 'ai'
  let aiFailures = 0
  let totalAdded = 0
  let stoppedEarly = false

  for (let i = 0; i < chunks.length; i++) {
    // 停止检查：循环前先看是否已经叫停
    if (controller?.isStopped()) {
      stoppedEarly = true
      break
    }
    // 暂停闸门：暂停时挂起，resume 后继续
    await controller?.waitIfPaused()
    if (controller?.isStopped()) {
      stoppedEarly = true
      break
    }

    controller?.patch({
      phase: 'calling',
      current: i + 1,
      message: mode === 'rule' ? '规则解析中…' : `AI 识别第 ${i + 1}/${chunks.length} 段`
    })

    const els: AIElement[] = []
    let usedAIThis = false

    if (mode === 'ai') {
      const res = await chat(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `小说片段：\n"""\n${chunks[i]}\n"""` }
        ],
        { temperature: 0.3, maxTokens: 4096, jsonMode: true }
      )
      if (!res.ok || !res.content) {
        if (res.error === 'NO_KEY') {
          // 没配置 Key：整体退化为规则解析
          mode = 'rule'
          controller?.patch({ fallback: true })
        } else {
          aiFailures++
        }
        els.push(...ruleFallbackElements(chunks[i]))
      } else {
        const ex = extractElements(res.content)
        if (ex.length === 0) {
          aiFailures++
          els.push(...ruleFallbackElements(chunks[i]))
        } else {
          els.push(...ex)
          usedAIThis = true
        }
      }
    } else {
      els.push(...ruleFallbackElements(chunks[i]))
    }

    const { cards, newChars } = elementsToCards(els, charactersAcc)
    collectedCards.push(...cards)
    totalAdded += cards.length
    controller?.patch({ cardsAdded: totalAdded })
    opts.onChunk?.({ cards, characters: newChars, isFallback: !usedAIThis, usedAI: usedAIThis }, totalAdded)

    // 规则模式下给一点节奏，避免瞬间跑完（也让暂停/停止有机会响应）
    if (mode === 'rule') await delay(8)
  }

  const project: Project = {
    ...base,
    characters: Array.from(charactersAcc.values()),
    scenes: collectedCards.length ? [collectedCards] : base.scenes
  }

  // 停止后保留已处理的实际进度（不要回填为 total，否则显示为「5/5」但实际只识别了一部分）
  if (!stoppedEarly) controller?.patch({ current: controller.total })
  controller?.patch({
    phase: stoppedEarly ? 'fallback' : 'done',
    usedAI: mode === 'ai' && aiFailures < chunks.length
  })
  controller?.setStatus(stoppedEarly ? 'stopped' : 'done')

  const note =
    aiFailures > 0
      ? `完成，其中 ${aiFailures}/${chunks.length} 段因模型返回异常改用规则解析兜底。`
      : mode === 'rule'
        ? '未配置 AI 模型，已用「规则解析」完成（识别冒号格式的说话人）。到设置里填入 API Key 后可启用 AI 智能识别。'
        : undefined

  return { project, usedAI: mode === 'ai' && aiFailures < chunks.length, note, stoppedEarly, totalCards: totalAdded }
}

/** 旧版单调用入口（一次性拿到完整工程），保留以便复用 */
export async function parseNovelWithAI(
  rawText: string,
  base: Project,
  onProgress?: (p: ParseProgress) => void
): Promise<{ project: Project; usedAI: boolean; note?: string }> {
  const controller = new NovelImportController()
  if (onProgress) {
    controller.subscribe(() =>
      onProgress({ phase: controller.phase, current: controller.current, total: controller.total, message: controller.message })
    )
  }
  const r = await parseNovelStreaming(rawText, base, { controller })
  return { project: r.project, usedAI: r.usedAI, note: r.note }
}

/** 按段落边界 + 目标字数切块，避免截断句子 */
function splitIntoChunks(text: string, target: number): string[] {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const chunks: string[] = []
  let buf = ''
  for (const p of paras) {
    if (buf && buf.length + p.length > target) {
      chunks.push(buf)
      buf = p
    } else {
      buf = buf ? buf + '\n\n' + p : p
    }
  }
  if (buf) chunks.push(buf)
  // 若整体没有空行分段，退化为按字数硬切
  if (chunks.length === 1 && chunks[0].length > target * 1.5) {
    const s = chunks[0]
    const out: string[] = []
    for (let i = 0; i < s.length; i += target) out.push(s.slice(i, i + target))
    return out
  }
  return chunks.length ? chunks : [text]
}

/** 从模型输出中鲁棒提取元素数组（容忍代码块、前后缀文字） */
function extractElements(content: string): AIElement[] {
  const tryParse = (s: string): AIElement[] | null => {
    try {
      const obj = JSON.parse(s)
      const arr = Array.isArray(obj) ? obj : obj.cards || obj.elements || obj.list
      if (Array.isArray(arr)) return arr as AIElement[]
    } catch {
      /* ignore */
    }
    return null
  }
  // 1. 直接解析
  let r = tryParse(content)
  if (r) return normalize(r)
  // 2. 去除 markdown 代码块围栏
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) {
    r = tryParse(fenced[1].trim())
    if (r) return normalize(r)
  }
  // 3. 截取第一个 { 到最后一个 }
  const objStart = content.indexOf('{')
  const objEnd = content.lastIndexOf('}')
  if (objStart >= 0 && objEnd > objStart) {
    r = tryParse(content.slice(objStart, objEnd + 1))
    if (r) return normalize(r)
  }
  // 4. 截取第一个 [ 到最后一个 ]
  const arrStart = content.indexOf('[')
  const arrEnd = content.lastIndexOf(']')
  if (arrStart >= 0 && arrEnd > arrStart) {
    r = tryParse(content.slice(arrStart, arrEnd + 1))
    if (r) return normalize(r)
  }
  return []
}

function isGarbageLine(text: string): boolean {
  const t = text.trim()
  if (!t || t.length < 2) return true
  if (METADATA_PATTERNS.some((re) => re.test(t))) return true
  // 过滤纯数字、纯符号、URL
  if (/^\d+$/.test(t)) return true
  if (/^https?:\/\//i.test(t) || /^www\./i.test(t)) return true
  if (/^[\s\-\—_*#【】\[\]()（）]+$/.test(t)) return true
  return false
}

function normalize(arr: AIElement[]): AIElement[] {
  return arr
    .filter((e) => e && typeof e.text === 'string' && e.text.trim() && !isGarbageLine(e.text))
    .map((e) => ({
      type: e.type === 'dialogue' ? 'dialogue' : 'narration',
      speaker: e.type === 'dialogue' ? (e.speaker || '').trim() : '',
      text: e.text.trim().replace(/^["「『“]|["」』”]$/g, ''),
      emotion: EMOTIONS.includes(e.emotion || '') ? e.emotion : 'normal'
    }))
}

/** 规则兜底：把一块文本按行/冒号/引号粗略拆成元素，同时过滤元数据 */
function ruleFallbackElements(chunk: string): AIElement[] {
  const out: AIElement[] = []
  const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean)
  const COLON = /[:：]/
  for (const line of lines) {
    if (isGarbageLine(line)) continue
    const idx = line.search(COLON)
    if (idx > 0 && idx <= 8) {
      const name = line.slice(0, idx).trim()
      const rest = line.slice(idx + 1).trim()
      // 过滤：名字太短/含标点/像属性名 → 当旁白处理
      if (name && rest && !/[，。！？,.!?；;\s]/.test(name) && looksLikeCharacterName(name)) {
        out.push({ type: 'dialogue', speaker: name, text: rest.replace(/^["「『“]|["」』”]$/g, ''), emotion: 'normal' })
        continue
      }
    }
    out.push({ type: 'narration', text: line, emotion: 'normal' })
  }
  return out
}

/**
 * 元素序列 → 卡片 + 新角色（就地维护 characterMap 去重）。
 * 段内 goto 已串好；跨段由调用方（store.appendCards）负责。
 * 角色名合法性校验见 ../lib/characterName.ts （looksLikeCharacterName）
 */

function elementsToCards(
  elements: AIElement[],
  charMap: Map<string, Character>
): { cards: ScriptCard[]; newChars: Character[] } {
  const cards: ScriptCard[] = []
  const newChars: Character[] = []
  for (const el of elements) {
    let speaker = ''
    if (el.type === 'dialogue' && el.speaker) {
      speaker = el.speaker
      if (!charMap.has(speaker) && looksLikeCharacterName(speaker)) {
        const c: Character = {
          id: uid('char'),
          name: speaker,
          portraits: { normal: '' },
          color: palette[charMap.size % palette.length]
        }
        charMap.set(speaker, c)
        newChars.push(c)
      }
      cards.push({
        id: uid('card'),
        type: 'dialogue',
        speaker,
        expression: el.emotion || 'normal',
        position: 'center',
        text: el.text,
        goto: ''
      })
    } else {
      // 旁白（或无法确定说话人）→ 仍作为对白卡片，speaker 留空
      cards.push({ id: uid('card'), type: 'dialogue', speaker: '', text: el.text, goto: '' })
    }
  }
  for (let i = 0; i < cards.length - 1; i++) cards[i].goto = cards[i + 1].id
  return { cards, newChars }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
