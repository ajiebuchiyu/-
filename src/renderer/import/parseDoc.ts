import type { Character, Project, ScriptCard } from '@shared/types'
import { uid } from '../lib/id'
import { looksLikeCharacterName } from '../lib/characterName'

/**
 * 将纯文本（.txt / .docx 转出的文本）解析为剧本卡片，合并进入现有 Project。
 * 规则（产品规范 §7）：
 *  - 按空行分段，每段 → 一组连续卡片。
 *  - 行内含中文/英文冒号且冒号前为简短名词(≤8字) → dialogue（说话人=冒号前，台词=冒号后），
 *    并自动创建 Character 占位符（默认色块头像）。
 *  - 否则 → 旁白（speaker 留空，text=整行）。
 *  - 连续对话按顺序用 goto 串成线性流。
 */
export function parseDocToProject(rawText: string, base: Project): Project {
  const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)

  const cards: ScriptCard[] = []
  const characterMap = new Map<string, Character>()
  base.characters.forEach((c) => characterMap.set(c.name, c))

  const palette = ['#ff8fab', '#5cc8ff', '#ffd166', '#9b5de5', '#06d6a0', '#f4845f']

  for (const para of paragraphs) {
    const lines = para.split('\n').map((l) => l.trim()).filter(Boolean)
    for (const line of lines) {
      const parsed = parseLine(line)
      if (parsed.speaker) {
        // 自动创建角色占位符
        if (!characterMap.has(parsed.speaker)) {
          const ch: Character = {
            id: uid('char'),
            name: parsed.speaker,
            portraits: { normal: '' },
            color: palette[characterMap.size % palette.length]
          }
          characterMap.set(parsed.speaker, ch)
        }
        cards.push({
          id: uid('card'),
          type: 'dialogue',
          speaker: parsed.speaker,
          expression: 'normal',
          position: 'center',
          text: parsed.text,
          goto: ''
        })
      } else {
        cards.push({
          id: uid('card'),
          type: 'dialogue',
          speaker: '',
          text: parsed.text,
          goto: ''
        })
      }
    }
  }

  // 用 goto 串成线性流
  for (let i = 0; i < cards.length; i++) {
    cards[i].goto = cards[i + 1]?.id ?? ''
  }

  const merged: Project = {
    ...base,
    id: base.id,
    title: base.title,
    characters: Array.from(characterMap.values()),
    scenes: cards.length ? [cards] : base.scenes,
    createdAt: base.createdAt
  }
  return merged
}

const NAME_MAX = 8
const COLON = /[:：]/

/** 解析单行，判断是否为「说话人：台词」 */
export function parseLine(line: string): { speaker?: string; text: string } {
  const m = line.search(COLON)
  if (m > 0 && m <= NAME_MAX) {
    const name = line.slice(0, m).trim()
    const rest = line.slice(m + 1).trim()
    // 名字应为简短名词（不含标点、空格），且台词非空，且像真实角色名
    if (name && rest && !/[，。！？,.!?；;]/.test(name) && !/\s/.test(name) && looksLikeCharacterName(name)) {
      return { speaker: name, text: rest }
    }
  }
  return { text: line }
}
