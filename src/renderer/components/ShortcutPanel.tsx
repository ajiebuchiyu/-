import { SHORTCUT_DEFS, loadShortcuts, comboLabel } from '../shortcuts'

interface ShortcutGroup {
  title: string
  items: { desc: string; keys: string[]; fixed?: boolean }[]
}

function buildGroups(): ShortcutGroup[] {
  const map = loadShortcuts()
  const rebindable = (id: string): string[] => {
    const def = SHORTCUT_DEFS.find((d) => d.id === id)!
    return comboLabel(map[def.id])
  }
  return [
    {
      title: '编辑',
      items: [
        { desc: '撤销', keys: rebindable('undo') },
        { desc: '重做', keys: rebindable('redo') },
        { desc: '重做（备用）', keys: ['Ctrl', 'Y'], fixed: true }
      ]
    },
    {
      title: '创作 / 导出',
      items: [
        { desc: '新建故事', keys: rebindable('newProject') },
        { desc: '保存项目', keys: rebindable('save') },
        { desc: '打开预览', keys: rebindable('preview') }
      ]
    },
    {
      title: '预览播放',
      items: [
        { desc: '继续 / 跳过打字', keys: ['空格'], fixed: true },
        { desc: '继续 / 跳过打字', keys: ['Enter'], fixed: true }
      ]
    },
    {
      title: '通用',
      items: [
        { desc: '打开本快捷键面板', keys: rebindable('openShortcuts') },
        { desc: '关闭弹层 / 面板', keys: ['Esc'], fixed: true }
      ]
    }
  ]
}

export default function ShortcutPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const groups = buildGroups()
  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center" onClick={onClose}>
      <div
        className="w-[560px] max-h-[82vh] overflow-y-auto bg-panel3 border border-edge rounded-xl shadow-2xl sf-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 py-3 border-b border-edge sticky top-0 bg-panel3">
          <span className="text-xl">⌨️</span>
          <div className="flex-1">
            <div className="font-bold">键盘快捷键</div>
            <div className="text-[11px] text-inkdim">按 ? 可随时打开此面板 · 可在「设置 → 快捷键」中修改</div>
          </div>
          <button onClick={onClose} className="text-inkdim hover:text-ink text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="p-5 grid grid-cols-2 gap-5">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="text-xs font-semibold text-accent mb-2">{g.title}</div>
              <div className="space-y-1.5">
                {g.items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-ink">
                      {it.desc}
                      {it.fixed && <span className="ml-1 text-[10px] text-inkdim">（固定）</span>}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      {it.keys.map((k) => (
                        <kbd
                          key={k}
                          className="px-1.5 py-0.5 rounded bg-panel2 border border-edge text-[11px] text-inkdim shadow-sm"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
