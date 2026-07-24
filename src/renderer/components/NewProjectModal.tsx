import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useProjectStore } from '../store/projectStore'

// 用离屏 canvas 生成渐变封面预设（返回 DataURL，便于书架直接渲染）
function gradientCover(c1: string, c2: string, label: string): string {
  const c = document.createElement('canvas')
  c.width = 300
  c.height = 400
  const ctx = c.getContext('2d')
  if (!ctx) return ''
  const g = ctx.createLinearGradient(0, 0, 0, 400)
  g.addColorStop(0, c1)
  g.addColorStop(1, c2)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 300, 400)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.font = 'bold 30px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(label, 150, 210)
  return c.toDataURL('image/png')
}

const PRESETS: { key: string; label: string; c1: string; c2: string }[] = [
  { key: 'sunset', label: '黄昏', c1: '#ff9a6c', c2: '#a64bf4' },
  { key: 'night', label: '星空', c1: '#1f2a5a', c2: '#6c5ce7' },
  { key: 'sakura', label: '樱花', c1: '#ffd1e3', c2: '#ff8fab' },
  { key: 'ocean', label: '海洋', c1: '#4fc3f7', c2: '#1565c0' },
  { key: 'forest', label: '森林', c1: '#a8e063', c2: '#2e7d32' },
  { key: 'ink', label: '墨色', c1: '#2c3e50', c2: '#4b6584' }
]

export default function NewProjectModal(): JSX.Element | null {
  const open = useProjectStore((s) => s.newProjectModalOpen)
  const close = useProjectStore((s) => s.closeNewProjectModal)
  const createProject = useProjectStore((s) => s.createProject)
  const toast = useProjectStore((s) => s.toast)

  const [name, setName] = useState('')
  const [cover, setCover] = useState<string | null>(null)
  const [folder, setFolder] = useState<string | null>(null)

  const presets = useMemo(() => PRESETS.map((p) => ({ ...p, url: gradientCover(p.c1, p.c2, p.label) })), [])

  if (!open) return null

  const api = (window as unknown as { storyforge?: any }).storyforge

  const pickCover = async (): Promise<void> => {
    const url = await api?.pickCover?.()
    if (url) setCover(url)
  }
  const pickFolder = async (): Promise<void> => {
    const path = await api?.pickFolder?.()
    if (path) setFolder(path)
  }

  const canCreate = !!folder
  const doCreate = (): void => {
    if (!folder) {
      toast('请先选择项目的储存位置', 'warn')
      return
    }
    createProject({ name: name.trim() || '未命名故事', coverDataUrl: cover, folderPath: folder })
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-6 sf-overlay-in" onClick={close}>
      <div
        className="w-[580px] max-h-[88vh] overflow-y-auto bg-panel3 border border-edge rounded-2xl shadow-pop sf-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-xl font-bold">📚 创建新项目</h2>
          <button onClick={close} className="text-inkdim hover:text-ink text-xl leading-none">
            ✕
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* 名称 */}
          <div>
            <label className="block text-sm text-inkdim mb-1.5">作品名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="给你的故事起个名字…"
              className="w-full bg-panel2 border border-edge rounded-md px-3 py-2.5 text-[15px] outline-none focus:border-accent"
            />
          </div>

          {/* 封面 */}
          <div>
            <label className="block text-sm text-inkdim mb-1.5">封面</label>
            <div className="flex gap-3">
              <div className="w-20 h-24 rounded-lg overflow-hidden border border-edge bg-panel2 flex items-center justify-center shrink-0">
                {cover ? (
                  <img src={cover} alt="cover" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-inkdim text-[10px] text-center px-1">无封面</span>
                )}
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <button
                  onClick={pickCover}
                  className="text-sm px-3 py-2 rounded-md bg-panel2 hover:bg-accent/20 border border-edge transition w-fit"
                >
                  🖼 选择图片
                </button>
                <button
                  onClick={() => setCover(null)}
                  className="text-sm px-3 py-2 rounded-md bg-panel2 hover:bg-accent/20 border border-edge transition w-fit text-inkdim"
                >
                  清除封面
                </button>
              </div>
            </div>
            {/* 预设渐变封面 */}
            <div className="flex flex-wrap gap-2 mt-2">
              {presets.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setCover(p.url)}
                  className={`w-12 h-14 rounded-md overflow-hidden border-2 transition ${
                    cover === p.url ? 'border-accent' : 'border-transparent hover:border-accent/50'
                  }`}
                  title={p.label}
                >
                  <img src={p.url} alt={p.label} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          {/* 储存位置 */}
          <div>
            <label className="block text-sm text-inkdim mb-1.5">储存位置（本机文件夹）</label>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <div
                  className={`text-sm px-3 py-2.5 rounded-md border bg-panel2 truncate ${
                    folder ? 'border-edge text-ink' : 'border-dashed border-accent/50 text-inkdim'
                  }`}
                  title={folder || ''}
                >
                  {folder || '未选择 —— 项目文件将只存在于此文件夹内'}
                </div>
              </div>
              <button
                onClick={pickFolder}
                className="text-sm px-3 py-2.5 rounded-md bg-accent/15 text-accent hover:bg-accent/25 transition shrink-0"
              >
                选择文件夹
              </button>
            </div>
            <p className="text-xs text-inkdim mt-1.5">
              选择电脑上的一个文件夹作为本项目的家；之后所有相关文件（剧本、封面等）都只存放在这里。
            </p>
          </div>

          {/* 创建 */}
          <button
            onClick={doCreate}
            disabled={!canCreate}
            className={`w-full h-11 rounded-md text-[15px] font-medium transition ${
              canCreate
                ? 'bg-accent-grad text-white hover:brightness-105'
                : 'bg-panel2 text-inkdim cursor-not-allowed'
            }`}
          >
            {canCreate ? '创建并进入编辑器' : '请先选择储存位置'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
