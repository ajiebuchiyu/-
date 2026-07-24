import { useEffect, useState } from 'react'
import { useProjectStore } from './store/projectStore'
import Toolbar from './components/Toolbar/Toolbar'
import ResourceTree from './components/ResourceTree/ResourceTree'
import ScriptEditor from './components/ScriptEditor/ScriptEditor'
import Inspector from './components/Inspector/Inspector'
import DebugBar from './components/DebugBar/DebugBar'
import ToastHost from './components/ToastHost'
import Onboarding from './components/Onboarding'
import ShortcutPanel from './components/ShortcutPanel'
import HomeShelf from './components/HomeShelf'
import NewProjectModal from './components/NewProjectModal'
import { loadShortcuts, matchShortcut, type ShortcutId } from './shortcuts'

export default function App(): JSX.Element {
  const init = useProjectStore((s) => s.init)
  const ready = useProjectStore((s) => s.ready)
  const theme = useProjectStore((s) => s.theme)
  const view = useProjectStore((s) => s.view)
  const [shortcutOpen, setShortcutOpen] = useState(false)

  useEffect(() => {
    init()
  }, [init])

  // 同步深浅主题到 <html> 根节点
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // 全局快捷键：由 shortcuts.ts 的配置驱动（撤销 / 重做 / 新建 / 保存 / 预览 / 打开面板）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useProjectStore.getState()
      const api = (window as unknown as { storyforge?: { openPreview: (p: unknown, c: unknown) => void } }).storyforge
      const target = e.target as HTMLElement | null
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

      // Esc 关闭快捷键面板（固定行为，不可重绑）
      if (e.key === 'Escape' && shortcutOpen) {
        e.preventDefault()
        setShortcutOpen(false)
        return
      }

      const id: ShortcutId | null = matchShortcut(loadShortcuts(), e)
      if (!id) return
      // 在输入框中打字时不触发应用级快捷键，避免劫持文本编辑
      if (typing) return

      switch (id) {
        case 'openShortcuts':
          e.preventDefault()
          setShortcutOpen(true)
          break
        case 'undo':
          e.preventDefault()
          s.undo()
          break
        case 'redo':
          e.preventDefault()
          s.redo()
          break
        case 'newProject':
          e.preventDefault()
          s.openNewProjectModal()
          break
        case 'save':
          e.preventDefault()
          s.saveNow()
          break
        case 'preview':
          e.preventDefault()
          if (api) api.openPreview(s.project, s.cursor)
          else s.toast('预览需在桌面应用中运行', 'warn')
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcutOpen])

  if (!ready) {
    return (
      <div className="w-full h-full flex items-center justify-center text-inkdim">
        <div className="text-center sf-fade-in">
          <div className="text-4xl mb-3 sf-breathe">📖</div>
          <div>正在唤醒 StoryForge……</div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col text-ink">
      {view === 'shelf' ? (
        <HomeShelf />
      ) : (
        <>
          <div className="sf-fade-down">
            <Toolbar />
          </div>
          <div className="flex-1 flex min-h-0">
            {/* 左侧资源树 */}
            <aside className="w-64 shrink-0 border-r border-edge bg-panel2 overflow-y-auto sf-slide-left">
              <ResourceTree />
            </aside>
            {/* 中间编辑区 */}
            <main className="flex-1 min-w-0 flex flex-col sf-fade-in">
              <ScriptEditor />
            </main>
            {/* 右侧检查器 */}
            <aside className="w-80 shrink-0 border-l border-edge bg-panel2 overflow-y-auto sf-slide-right">
              <Inspector />
            </aside>
          </div>
          {/* 底部调试栏 */}
          <DebugBar />
          <Onboarding />
        </>
      )}
      <ToastHost />
      <NewProjectModal />
      {shortcutOpen && <ShortcutPanel onClose={() => setShortcutOpen(false)} />}
    </div>
  )
}
