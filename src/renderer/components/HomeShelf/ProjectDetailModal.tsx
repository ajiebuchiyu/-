import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useProjectStore } from '../../store/projectStore'
import type { Project, ProjectFolderInfo } from '@shared/types'

/** 从项目数据计算统计信息 */
function projectStats(p: Project) {
  const cards = p.scenes.flat()
  const wordCount = cards.reduce((sum: number, c) => sum + (c.text || '').length, 0)
  const dialogueCount = cards.filter((c) => c.type === 'dialogue').length
  const choiceCount = cards.filter((c) => c.type === 'choice').length
  return {
    cardCount: cards.length,
    characterCount: p.characters.length,
    backgroundCount: p.backgrounds.length,
    audioCount: p.audioTracks.length,
    videoCount: p.videos?.length || 0,
    variableCount: p.variables?.length || 0,
    wordCount,
    dialogueCount,
    choiceCount,
  }
}

/** 格式化文件大小 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

/** 格式化时间 */
function formatTime(ts: number): string {
  if (!ts) return '未知'
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface Props {
  info: ProjectFolderInfo
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}

export default function ProjectDetailModal({ info, onClose, onEdit, onDelete }: Props): JSX.Element {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const peekProject: (folderPath: string) => Promise<Project | null> = useProjectStore((s: any) => s.peekProject)
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    let cancelled = false
    peekProject(info.folderPath).then((p) => {
      if (!cancelled) {
        setProject(p)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [info.folderPath, peekProject])

  const stats = project ? projectStats(project) : null

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-6 sf-overlay-in" onClick={onClose}>
      <div
        className="w-[520px] max-h-[85vh] overflow-y-auto bg-panel3 border border-edge rounded-2xl shadow-pop sf-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部：封面 + 名称 */}
        <div className="relative">
          {/* 封面区域 */}
          <div className="h-44 rounded-t-2xl overflow-hidden bg-panel2 flex items-center justify-center">
            {info.cover ? (
              <img src={info.cover} alt={info.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-accent-grad flex items-center justify-center text-white text-6xl font-bold">
                {info.name.slice(0, 1) || '·'}
              </div>
            )}
          </div>

          {/* 关闭按钮 */}
          <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 text-white/90 hover:bg-black/60 transition flex items-center justify-center text-sm">
            ✕
          </button>
        </div>

        <div className="px-6 pb-6 space-y-5 -mt-4 relative">
          {/* 项目名称卡片 */}
          <div className="bg-panel2 rounded-xl p-4 shadow-sm -mt-6 border border-edge">
            <h2 className="text-lg font-bold truncate">{info.name}</h2>
            <p className="text-xs text-inkdim mt-1 truncate" title={info.folderPath}>📂 {info.folderPath}</p>
          </div>

          {/* 加载中 */}
          {loading && (
            <div className="flex items-center justify-center py-8 text-inkdim text-sm gap-2">
              <span className="animate-spin inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full"></span>
              正在读取项目信息…
            </div>
          )}

          {/* 统计信息 */}
          {!loading && stats && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: '卡片数', value: stats.cardCount, icon: '📄' },
                { label: '角色数', value: stats.characterCount, icon: '👤' },
                { label: '背景数', value: stats.backgroundCount, icon: '🖼' },
                { label: '音频数', value: stats.audioCount, icon: '🎵' },
                { label: '字数', value: stats.wordCount.toLocaleString(), icon: '✍️' },
                { label: '变量数', value: stats.variableCount, icon: '📊' },
              ].map((item) => (
                <div key={item.label} className="bg-panel2 rounded-lg p-3 text-center border border-edge">
                  <div className="text-lg mb-0.5">{item.icon}</div>
                  <div className="text-base font-bold">{item.value}</div>
                  <div className="text-[11px] text-inkdim">{item.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* 详细信息 */}
          {!loading && stats && (
            <div className="bg-panel2 rounded-lg p-4 border border-edge space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-inkdim">对话卡</span>
                <span>{stats.dialogueCount} 张</span>
              </div>
              <div className="flex justify-between">
                <span className="text-inkdim">分支选项</span>
                <span>{stats.choiceCount} 张</span>
              </div>
              <div className="flex justify-between">
                <span className="text-inkdim">视频素材</span>
                <span>{stats.videoCount} 个</span>
              </div>
              <div className="flex justify-between">
                <span className="text-inkdim">上次编辑</span>
                <span>{formatTime(info.updatedAt)}</span>
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => setShowConfirm(true)}
              className="flex-1 h-10 rounded-md text-sm font-medium bg-panel2 hover:bg-red-500/10 text-red-400 border border-edge transition"
            >
              🗑 删除项目
            </button>
            <button
              onClick={onEdit}
              className="flex-1 h-10 rounded-md text-sm font-medium bg-accent-grad text-white hover:brightness-105 transition"
            >
              ✏️ 开始编辑
            </button>
          </div>

          {/* 删除确认 */}
          {showConfirm && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center space-y-3">
              <p className="text-sm text-red-300">确认删除「{info.name}」？此操作不可撤销。</p>
              <div className="flex gap-2 justify-center">
                <button onClick={() => setShowConfirm(false)} className="px-4 py-1.5 rounded-md bg-panel2 text-xs border border-edge">
                  取消
                </button>
                <button onClick={() => { onDelete(); setShowConfirm(false); }} className="px-4 py-1.5 rounded-md bg-red-500/80 text-white text-xs">
                  确认删除
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
