import { useMemo, useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useProjectStore } from '../../store/projectStore'
import { parseDocToProject } from '../../import/parseDoc'
import { parseNovelStreaming, NovelImportController } from '../../ai/novelParser'
import SettingsModal from './SettingsModal'
import ImportProgressWidget from './ImportProgressWidget'
import { DEFAULT_EXPORT_OPTIONS, type ExportOptions } from '@shared/types'
import { estimateProjectSize, formatBytes, SIZE_LIMIT } from '../../lib/projectAudit'
import { compressProjectImages } from '../../lib/imageCompress'
import logoUrl from '../../assets/logo.png'

export default function Toolbar(): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const cursor = useProjectStore((s) => s.cursor)
  const replaceProject = useProjectStore((s) => s.replaceProject)
  const goHome = useProjectStore((s) => s.goHome)
  const openNewProjectModal = useProjectStore((s) => s.openNewProjectModal)
  const appendCards = useProjectStore((s) => s.appendCards)
  const clearMainScene = useProjectStore((s) => s.clearMainScene)
  const toast = useProjectStore((s) => s.toast)
  const undo = useProjectStore((s) => s.undo)
  const redo = useProjectStore((s) => s.redo)
  const canUndo = useProjectStore((s) => s.past.length > 0)
  const canRedo = useProjectStore((s) => s.future.length > 0)
  const saveStatus = useProjectStore((s) => s.saveStatus)
  const theme = useProjectStore((s) => s.theme)
  const toggleTheme = useProjectStore((s) => s.toggleTheme)
  const ensureCharactersFromSpeakers = useProjectStore((s) => s.ensureCharactersFromSpeakers)
  const autoAssignBackgrounds = useProjectStore((s) => s.autoAssignBackgrounds)
  const [publishOpen, setPublishOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [exportOpts, setExportOpts] = useState<ExportOptions>({ ...DEFAULT_EXPORT_OPTIONS })
  const publishBtnRef = useRef<HTMLButtonElement>(null)
  const [publishPos, setPublishPos] = useState<{ top: number; left: number } | null>(null)
  // 后台导入任务（控制器即 UI 数据源）；非空时显示角落进度条
  const [job, setJob] = useState<NovelImportController | null>(null)

  const api = (window as any).storyforge

  // 体积统计（打开发布面板时按需计算即可，这里始终跟随 project 计算）
  const size = useMemo(() => estimateProjectSize(project), [project])
  const overLimit = size.totalBytes > SIZE_LIMIT

  // 发布面板位置：用 Portal 挂到 body，避免被工具栏容器裁剪
  useEffect(() => {
    if (!publishOpen) { setPublishPos(null); return }
    const rect = publishBtnRef.current?.getBoundingClientRect()
    if (!rect) return
    setPublishPos({ top: rect.bottom + 6, left: Math.max(8, rect.right - 320) })
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setPublishOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [publishOpen])

  const handlePreview = async (): Promise<void> => {
    if (!api) {
      toast('预览需在桌面应用中运行', 'warn')
      return
    }
    await api.openPreview(project, cursor)
    toast('已打开预览窗口 ▶', 'success')
  }

  // 智能配图：补全自动识别出的角色，并按文案关键词自动匹配背景
  const handleSmartArt = (): void => {
    const newChars = ensureCharactersFromSpeakers()
    const bgCount = autoAssignBackgrounds()
    toast(
      `智能配图完成：新建角色 ${newChars} 个，自动匹配背景 ${bgCount} 页` + (newChars || bgCount ? '' : '（暂无需要补充的内容）'),
      'success'
    )
  }

  const handleImport = async (): Promise<void> => {
    if (!api) {
      toast('导入需在桌面应用中运行', 'warn')
      return
    }
    if (job) return // 已有导入在后台进行
    const res = await api.importDoc()
    if (!res) return

    // 启动后台识别：先清空主场景，再流式并入（停止时已识别内容保留）
    const controller = new NovelImportController()
    controller.patch({
      total: Math.max(1, Math.ceil(res.text.length / 1600)),
      phase: 'chunking',
      message: '正在分块…'
    })
    setJob(controller)
    clearMainScene()

    try {
      const result = await parseNovelStreaming(res.text, project, {
        controller,
        onChunk: (chunk) => appendCards(chunk.cards, chunk.characters)
      })
      if (result.stoppedEarly) {
        toast(`已停止导入，保留已识别的 ${result.totalCards} 张卡片`, 'info')
      } else if (result.usedAI) {
        toast(
          `AI 已识别剧情并填入 ${result.totalCards} 张卡片` + (result.note ? `（${result.note}）` : ''),
          'success'
        )
      } else {
        toast(`已导入（规则解析）：${result.note || res.fileName.split(/[\\/]/).pop()}`, 'warn')
      }
    } catch {
      // 极端异常：整体回退规则解析，保证内容不丢
      controller.setStatus('error')
      const merged = parseDocToProject(res.text, project)
      replaceProject(merged)
      toast('AI 解析异常，已回退规则解析', 'error')
    }
  }

  const handleCompress = async (): Promise<void> => {
    setBusy(true)
    try {
      const { project: compressed, savedBytes } = await compressProjectImages(project)
      if (savedBytes > 0) {
        replaceProject(compressed)
        toast(`已压缩图片，节省 ${formatBytes(savedBytes)}`, 'success')
      } else {
        toast('图片已足够精简，无需压缩', 'info')
      }
    } catch {
      toast('压缩失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleExportHtml = async (): Promise<void> => {
    setPublishOpen(false)
    if (!api) {
      toast('导出需在桌面应用中运行', 'warn')
      return
    }
    setBusy(true)
    const r = await api.exportHtml(project, exportOpts)
    setBusy(false)
    if (r.ok) toast(`已导出 HTML（${Math.round((r.size || 0) / 1024)} KB）`, 'success')
    else toast('已取消导出', 'info')
  }

  const handleExportExe = async (): Promise<void> => {
    setPublishOpen(false)
    if (!api) return
    toast('开始打包 exe，请稍候（首次较慢）……', 'info')
    setBusy(true)
    const r = await api.exportExe(project)
    setBusy(false)
    toast(r.message || (r.ok ? '打包完成' : '打包失败'), r.ok ? 'success' : 'error')
  }

  return (
    <header className="sf-header h-12 shrink-0 flex items-center gap-1 px-3 relative z-30">
      <div className="flex items-center gap-2 pr-3 mr-1 border-r border-edge">
        <TIconBtn onClick={goHome} icon="🏠" title="返回书架" />
        <img src={logoUrl} alt="StoryForge" className="w-7 h-7 rounded-md shadow-sm" />
        <span className="font-bold tracking-wide">
          Story<span className="text-accent">Forge</span>
        </span>
      </div>

      <TBtn onClick={openNewProjectModal} icon="🆕" label="新建故事" />
      <TBtn onClick={handleImport} icon="📥" label="导入 txt/docx" disabled={!!job} />

      {/* 撤销 / 重做（可见按钮） */}
      <div className="flex items-center gap-0.5 pl-2 ml-1 border-l border-edge">
        <TIconBtn onClick={undo} icon="↶" title="撤销 (Ctrl+Z)" disabled={!canUndo} />
        <TIconBtn onClick={redo} icon="↷" title="重做 (Ctrl+Shift+Z)" disabled={!canRedo} />
      </div>

      <TBtn onClick={handlePreview} icon="▶" label="预览" primary />
      <TBtn onClick={handleSmartArt} icon="🎨" label="智能配图" />
      <TBtn onClick={() => { useProjectStore.getState().saveNow(); toast('已保存', 'success') }} icon="💾" label="保存" accent />
      <TBtn onClick={goHome} icon="🏠" label="返回主页" />

      <span ref={publishBtnRef as React.RefObject<HTMLSpanElement>}><TBtn onClick={() => setPublishOpen((v) => !v)} icon="📦" label="发布" disabled={busy} /></span>

      {/* 发布面板：Portal 挂到 body，避免被工具栏容器裁剪 */}
      {publishOpen && publishPos && createPortal(
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setPublishOpen(false)} />
          <div
            className="fixed w-80 bg-panel3 border border-edge rounded-xl shadow-2xl z-[80] sf-pop overflow-hidden"
            style={{ top: publishPos.top, left: publishPos.left }}
          >
              {/* 体积统计 */}
              <div className="px-4 pt-3 pb-2 border-b border-edge">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-inkdim">项目体积</span>
                  <span className={overLimit ? 'text-red-500 font-semibold' : 'text-ink font-semibold'}>
                    {formatBytes(size.totalBytes)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-panel2 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${overLimit ? 'bg-red-500' : 'bg-accent'}`}
                    style={{ width: `${Math.min(100, (size.totalBytes / SIZE_LIMIT) * 100)}%` }}
                  />
                </div>
                {overLimit ? (
                  <div className="mt-2 text-xs text-red-500 flex items-start gap-1.5">
                    <span>⚠️</span>
                    <span>
                      超过 {formatBytes(SIZE_LIMIT)} 建议上限，网页/单文件加载会变慢。可一键压缩图片：
                    </span>
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-inkdim">
                    含 {size.entries.length} 项资源，未超 {formatBytes(SIZE_LIMIT)} 上限 ✓
                  </div>
                )}
                {size.entries.length > 0 && (
                  <button
                    onClick={handleCompress}
                    disabled={busy}
                    className="mt-2 w-full h-7 rounded-md text-xs bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-40 transition-colors"
                  >
                    {busy ? '处理中…' : '🗜 自动压缩图片资源'}
                  </button>
                )}
              </div>

              {/* 导出选项 */}
              <div className="px-4 py-2.5 border-b border-edge space-y-2">
                <div className="text-xs text-inkdim mb-1">导出选项</div>
                <OptToggle
                  label="包含开始界面 / 菜单外壳"
                  checked={exportOpts.includeShell !== false}
                  onChange={(v) => setExportOpts((o) => ({ ...o, includeShell: v }))}
                />
                <OptToggle
                  label="显示 StoryForge 署名"
                  checked={exportOpts.showBranding !== false}
                  onChange={(v) => setExportOpts((o) => ({ ...o, showBranding: v }))}
                />
                <div className="flex items-center justify-between">
                  <span className="text-sm">存档槽数量</span>
                  <select
                    value={exportOpts.saveSlots ?? 3}
                    onChange={(e) => setExportOpts((o) => ({ ...o, saveSlots: Number(e.target.value) }))}
                    className="h-7 px-2 rounded-md bg-panel2 border border-edge text-sm"
                  >
                    <option value={0}>仅继续进度</option>
                    <option value={1}>1 槽</option>
                    <option value={3}>3 槽</option>
                    <option value={6}>6 槽</option>
                    <option value={9}>9 槽</option>
                  </select>
                </div>
              </div>

              {/* 导出动作 */}
              <MenuItem onClick={handleExportHtml} icon="🌐" title="导出 HTML5 单文件" desc="离线双击可开，含以上选项" />
              <MenuItem onClick={handleExportExe} icon="🪟" title="导出 Windows exe" desc="electron-builder 打包" />
            </div>
          </>,
          document.body
        )}

      <div className="flex-1" />

      {/* 保存状态指示灯 */}
      <SaveIndicator status={saveStatus} />

      <span className="text-xs text-inkdim mx-3">{project.title}</span>
      <TBtn onClick={toggleTheme} icon={theme === 'dark' ? '☀' : '🌙'} label={theme === 'dark' ? '浅色' : '深色'} />
      <TBtn onClick={() => setSettingsOpen(true)} icon="⚙" label="设置" />

      {settingsOpen && createPortal(<SettingsModal onClose={() => setSettingsOpen(false)} />, document.body)}
      {job && createPortal(<ImportProgressWidget controller={job} onClose={() => setJob(null)} />, document.body)}
    </header>
  )
}

function SaveIndicator({ status }: { status: 'idle' | 'saving' | 'saved' }): JSX.Element {
  const map = {
    saving: { color: 'bg-amber-400', text: '保存中…', pulse: true },
    saved: { color: 'bg-emerald-500', text: '已保存', pulse: false },
    idle: { color: 'bg-inkdim/40', text: '就绪', pulse: false }
  } as const
  const s = map[status]
  return (
    <div
      className="flex items-center gap-1.5 text-xs text-inkdim select-none"
      title={`自动保存：${s.text}`}
    >
      <span className={`inline-block w-2 h-2 rounded-full ${s.color} ${s.pulse ? 'animate-pulse' : ''}`} />
      <span>{s.text}</span>
    </div>
  )
}

function OptToggle({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full relative transition-colors ${checked ? 'bg-accent' : 'bg-panel2 border border-edge'}`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'left-4' : 'left-0.5'}`}
        />
      </button>
    </label>
  )
}

function TBtn({
  onClick,
  icon,
  label,
  accent,
  primary,
  disabled
}: {
  onClick: () => void
  icon: string
  label: string
  accent?: boolean
  primary?: boolean
  disabled?: boolean
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`h-8 px-3 rounded-md text-sm flex items-center gap-1.5 transition-all disabled:opacity-40 sf-tap ${
        primary
          ? 'sf-btn-primary'
          : accent
            ? 'bg-accent/15 text-accent hover:bg-accent/25'
            : 'hover:bg-panel2 text-ink'
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function TIconBtn({
  onClick,
  icon,
  title,
  disabled
}: {
  onClick: () => void
  icon: string
  title: string
  disabled?: boolean
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="h-8 w-8 rounded-md text-base flex items-center justify-center transition-colors disabled:opacity-30 hover:bg-panel2 text-ink sf-tap"
    >
      {icon}
    </button>
  )
}

function MenuItem({
  onClick,
  icon,
  title,
  desc
}: {
  onClick: () => void
  icon: string
  title: string
  desc: string
}): JSX.Element {
  return (
    <button onClick={onClick} className="w-full text-left px-4 py-2.5 hover:bg-panel2 flex items-start gap-2">
      <span className="text-lg">{icon}</span>
      <span>
        <div className="text-sm">{title}</div>
        <div className="text-xs text-inkdim">{desc}</div>
      </span>
    </button>
  )
}
