// 全局快捷键：动作定义、默认绑定、持久化与匹配逻辑
// 用户可在「设置 → 快捷键」中查看每个快捷键的作用并重新绑定。

export type ShortcutId =
  | 'undo'
  | 'redo'
  | 'newProject'
  | 'save'
  | 'preview'
  | 'openShortcuts'

export interface Combo {
  mod: boolean // Ctrl 或 Cmd（Meta）
  shift: boolean
  alt: boolean
  // 单字符按键小写（如 'z'、'?'）；命名键：'enter' 'tab' 'escape' 'space' 'arrowup' 'arrowdown' 'arrowleft' 'arrowright'
  key: string
}

export interface ShortcutDef {
  id: ShortcutId
  group: string
  desc: string
  default: Combo
}

export const SHORTCUT_DEFS: ShortcutDef[] = [
  { id: 'undo', group: '编辑', desc: '撤销', default: { mod: true, shift: false, alt: false, key: 'z' } },
  { id: 'redo', group: '编辑', desc: '重做', default: { mod: true, shift: true, alt: false, key: 'z' } },
  { id: 'newProject', group: '创作 / 导出', desc: '新建故事', default: { mod: true, shift: false, alt: false, key: 'n' } },
  { id: 'save', group: '创作 / 导出', desc: '保存项目', default: { mod: true, shift: false, alt: false, key: 's' } },
  { id: 'preview', group: '创作 / 导出', desc: '打开预览', default: { mod: true, shift: false, alt: false, key: 'p' } },
  { id: 'openShortcuts', group: '通用', desc: '打开快捷键面板', default: { mod: false, shift: true, alt: false, key: '?' } }
]

export type ShortcutMap = Record<ShortcutId, Combo>

const STORAGE_KEY = 'storyforge.shortcuts.v1'

function defaults(): ShortcutMap {
  const map = {} as ShortcutMap
  for (const d of SHORTCUT_DEFS) map[d.id] = { ...d.default }
  return map
}

export function loadShortcuts(): ShortcutMap {
  const map = defaults()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<ShortcutMap>
      for (const d of SHORTCUT_DEFS) {
        const c = saved[d.id]
        if (c && typeof c.key === 'string') map[d.id] = { mod: !!c.mod, shift: !!c.shift, alt: !!c.alt, key: c.key }
      }
    }
  } catch {
    /* 忽略损坏的存储，回退默认 */
  }
  return map
}

export function saveShortcuts(map: ShortcutMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* 存储不可用时静默 */
  }
}

export function resetShortcuts(): ShortcutMap {
  const map = defaults()
  saveShortcuts(map)
  return map
}

export function eventToCombo(e: KeyboardEvent): Combo | null {
  const k = e.key
  // 单独的修饰键不算组合，忽略
  if (k === 'Control' || k === 'Shift' || k === 'Alt' || k === 'Meta') return null
  let key: string
  if (k === ' ') key = 'space'
  else key = k.length === 1 ? k.toLowerCase() : k.toLowerCase()
  return { mod: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey, key }
}

export function comboSig(c: Combo): string {
  return `${c.mod ? 1 : 0}-${c.shift ? 1 : 0}-${c.alt ? 1 : 0}-${c.key}`
}

export function matchShortcut(map: ShortcutMap, e: KeyboardEvent): ShortcutId | null {
  const c = eventToCombo(e)
  if (!c) return null
  const sig = comboSig(c)
  for (const d of SHORTCUT_DEFS) {
    if (comboSig(map[d.id]) === sig) return d.id
  }
  return null
}

const KEY_LABELS: Record<string, string> = {
  space: '空格',
  enter: 'Enter',
  tab: 'Tab',
  escape: 'Esc',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→'
}

export function keyLabel(key: string): string {
  return KEY_LABELS[key] ?? key.toUpperCase()
}

export function comboLabel(c: Combo): string[] {
  const out: string[] = []
  if (c.mod) out.push('Ctrl')
  if (c.alt) out.push('Alt')
  if (c.shift) out.push('Shift')
  out.push(keyLabel(c.key))
  return out
}
