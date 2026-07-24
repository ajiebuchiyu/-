import type { Project } from '@shared/types'

// ============================================================
// 工程体检工具：断链检测 + 资源体积统计
// 纯函数，无副作用，编辑器 / 导出前均可复用
// ============================================================

export interface BrokenLink {
  cardId: string
  sceneIdx: number
  cardIndex: number
  kind: 'goto' | 'choice'
  target: string // 失效的目标 id
  label: string // 便于展示的描述（选项文字 / 卡片摘要）
}

/**
 * 扫描所有卡片的 goto / choices[].goto，找出指向不存在卡片的断链。
 * 空字符串（表示"顺序下一张"或"默认"）不算断链。
 */
export function findBrokenLinks(project: Project): BrokenLink[] {
  const ids = new Set<string>()
  for (const scene of project.scenes) for (const c of scene) ids.add(c.id)

  const out: BrokenLink[] = []
  project.scenes.forEach((scene, sceneIdx) => {
    scene.forEach((card, cardIndex) => {
      const summary = (card.text || card.type).slice(0, 12)
      if (card.goto && !ids.has(card.goto)) {
        out.push({ cardId: card.id, sceneIdx, cardIndex, kind: 'goto', target: card.goto, label: summary })
      }
      ;(card.choices || []).forEach((ch) => {
        if (ch.goto && !ids.has(ch.goto)) {
          out.push({
            cardId: card.id,
            sceneIdx,
            cardIndex,
            kind: 'choice',
            target: ch.goto,
            label: `${summary} · 选项「${ch.label}」`
          })
        }
      })
    })
  })
  return out
}

// ---------- 资源体积统计 ----------

export interface AssetSizeEntry {
  id: string
  name: string
  kind: 'portrait' | 'background' | 'audio'
  bytes: number
}

export interface ProjectSize {
  totalBytes: number
  jsonBytes: number // 序列化后的整体体积（近似导出 HTML 体积）
  entries: AssetSizeEntry[]
  overLimit: boolean // 是否超过 5MB
  limitBytes: number
}

export const SIZE_LIMIT = 5 * 1024 * 1024 // 5MB

/** 估算一个 DataURL 的字节数（base64 每 4 字符 ≈ 3 字节） */
export function dataUrlBytes(dataUrl?: string): number {
  if (!dataUrl) return 0
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return dataUrl.length
  const b64 = dataUrl.slice(comma + 1)
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - padding
}

/** 统计整个工程的资源体积（用于导出前的体积预警） */
export function estimateProjectSize(project: Project): ProjectSize {
  const entries: AssetSizeEntry[] = []

  for (const c of project.characters) {
    for (const [key, url] of Object.entries(c.portraits || {})) {
      const bytes = dataUrlBytes(url)
      if (bytes > 0) entries.push({ id: `${c.id}:${key}`, name: `${c.name} · ${key}`, kind: 'portrait', bytes })
    }
  }
  for (const b of project.backgrounds) {
    const bytes = dataUrlBytes(b.image)
    if (bytes > 0) entries.push({ id: b.id, name: b.name, kind: 'background', bytes })
  }
  for (const a of project.audioTracks) {
    const bytes = dataUrlBytes(a.src)
    if (bytes > 0) entries.push({ id: a.id, name: a.name, kind: 'audio', bytes })
  }

  entries.sort((x, y) => y.bytes - x.bytes)
  const totalBytes = entries.reduce((s, e) => s + e.bytes, 0)
  const jsonBytes = totalBytes + 60 * 1024 // 加上播放器 + 结构近似开销
  return { totalBytes, jsonBytes, entries, overLimit: jsonBytes > SIZE_LIMIT, limitBytes: SIZE_LIMIT }
}

/** 人类可读体积 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
