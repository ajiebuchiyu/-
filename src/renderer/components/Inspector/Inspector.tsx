import { useState } from 'react'
import type { ScriptCard } from '@shared/types'
import { CARD_TYPE_LABELS } from '@shared/types'
import { useProjectStore } from '../../store/projectStore'
import GameRuntime from '../../preview/GameRuntime'
import CardForm from './CardForm'
import previewBg from '../../assets/preview-bg.png'

export default function Inspector(): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const selectedCardId = useProjectStore((s) => s.selectedCardId)
  const deleteCurrentProject = useProjectStore((s) => s.deleteCurrentProject)
  const card: ScriptCard | undefined = project.scenes.flat().find((c) => c.id === selectedCardId)
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <div className="flex flex-col h-full">
      {/* 内联实时预览：编辑器所见 = 玩家所见 */}
      <div className="shrink-0 border-b border-edge bg-panel2">
        <div className="px-3 py-1.5 text-xs text-inkdim flex items-center justify-between bg-panel3/60">
          <span>👁 实时预览</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px]">所见即所得</span>
            <button
              onClick={() => setConfirmOpen(true)}
              className="hover:text-red-400 text-inkdim transition"
              title="删除当前故事"
            >
              🗑
            </button>
          </div>
        </div>
        <div
          className="h-56 relative overflow-hidden shadow-inner"
          style={{ backgroundImage: `url(${previewBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        >
          {card ? (
            <GameRuntime project={project} interactive={false} currentCardId={card.id} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/90 text-xs bg-black/30 backdrop-blur-[1px]">
              选择卡片以预览
            </div>
          )}
        </div>
      </div>

      {/* 属性表单 */}
      <div className="flex-1 overflow-y-auto p-3">
        {card ? (
          <div key={card.id} className="sf-tab-in">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs px-2 py-0.5 rounded bg-accent/20 text-accent">{CARD_TYPE_LABELS[card.type]}</span>
              <span className="text-[10px] text-inkdim">{card.id}</span>
            </div>
            <CardForm card={card} />
          </div>
        ) : (
        <div className="text-inkdim text-sm text-center pt-8 sf-fade-in">
          在中间选择一张卡片
          <br />
          即可在此调整参数（无需代码）
        </div>
        )}
      </div>

      {/* 删除当前故事二次确认 */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center sf-overlay-in">
          <div className="w-[300px] bg-panel3 border border-edge rounded-xl p-4 flex flex-col gap-3 sf-modal-in">
            <div className="font-bold text-center">确认删除当前故事？</div>
            <div className="text-sm text-inkdim text-center">
              项目文件夹将被移入回收站（桌面端可在回收站恢复）。
            </div>
            <div className="flex gap-2 mt-1">
              <button
                className="flex-1 px-3 py-2 rounded-md bg-panel2 hover:bg-accent/25 text-sm"
                onClick={() => setConfirmOpen(false)}
              >
                取消
              </button>
              <button
                className="flex-1 px-3 py-2 rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm"
                onClick={() => {
                  setConfirmOpen(false)
                  deleteCurrentProject()
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
