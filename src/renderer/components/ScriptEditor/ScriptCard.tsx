import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CARD_TYPE_ICONS, CARD_TYPE_LABELS } from '@shared/types'
import type { Project, ScriptCard as Card } from '@shared/types'
import { useProjectStore } from '../../store/projectStore'
import MagicWand from './MagicWand'
import { applyAssetDropToCard, isAssetDrag } from '../../lib/assetDrop'

interface Props {
  card: Card
  index: number
  sceneIdx: number
  /** 多选模式 */
  batchMode?: boolean
  /** 当前卡片是否被批量选中 */
  batchSelected?: boolean
  onBatchToggle?: (id: string) => void
}

export default function ScriptCard({ card, index, sceneIdx, batchMode, batchSelected, onBatchToggle }: Props): JSX.Element {
  const selectedCardId = useProjectStore((s) => s.selectedCardId)
  const selectCard = useProjectStore((s) => s.selectCard)
  const setCursor = useProjectStore((s) => s.setCursor)
  const updateCard = useProjectStore((s) => s.updateCard)
  const deleteCard = useProjectStore((s) => s.deleteCard)
  const project = useProjectStore((s) => s.project)
  const toast = useProjectStore((s) => s.toast)
  const [confirmDel, setConfirmDel] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [dropHover, setDropHover] = useState(false)
  const api = (window as unknown as { storyforge?: { openPreview: (p: Project, c: { scene: number; card: number }) => Promise<boolean> } }).storyforge

  useEffect(() => {
    if (!contextMenu) return
    const close = (): void => setContextMenu(null)
    document.addEventListener('click', close)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('scroll', close, true)
    }
  }, [contextMenu])

  const selected = selectedCardId === card.id
  const speaker = card.speaker || (card.type === 'dialogue' ? '旁白' : '')
  const chColor =
    project.characters.find((c) => c.name === card.speaker)?.color || '#7c5cff'

  const onSelect = (): void => {
    selectCard(card.id)
    setCursor({ scene: sceneIdx, card: index })
  }

  return (
    <div
      onClick={() => {
        // 多选模式下，点击卡片本身即切换选中（无需精确点到复选框）
        if (batchMode) {
          onBatchToggle?.(card.id)
          return
        }
        onSelect()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        selectCard(card.id)
        setCursor({ scene: sceneIdx, card: index })
        setContextMenu({ x: e.clientX, y: e.clientY })
      }}
      onDragOver={(e) => {
        if (!isAssetDrag(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDropHover(true)
      }}
      onDragLeave={() => setDropHover(false)}
      onDrop={(e) => {
        if (!isAssetDrag(e)) return
        e.preventDefault()
        e.stopPropagation()
        setDropHover(false)
        void applyAssetDropToCard(card.id, e).then((msg) => {
          if (msg) toast(msg, 'success')
        })
      }}
      className={`group relative rounded-xl border px-3 py-2.5 cursor-pointer sf-hoverable ${
        dropHover
          ? 'border-accent2 bg-accent2/10 ring-2 ring-accent2/50'
          : selected
          ? 'border-accent bg-accent/10 shadow-glow sf-flash'
          : 'border-edge bg-panel2 hover:border-accent/50 hover:shadow-card'
      }`}
    >
      {/* 头部 */}
      <div className="flex items-center gap-2 mb-1.5">
        {batchMode && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onBatchToggle?.(card.id)
            }}
            className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[10px] transition-colors ${
              batchSelected
                ? 'bg-accent border-accent text-white'
                : 'border-edge hover:border-accent bg-panel3'
            }`}
          >
            {batchSelected && '✓'}
          </button>
        )}
        <span className="w-6 h-6 rounded-md flex items-center justify-center text-xs bg-panel3 shrink-0">
          {CARD_TYPE_ICONS[card.type]}
        </span>
        <span className="text-xs text-inkdim shrink-0">{CARD_TYPE_LABELS[card.type]}</span>
        {(card.type === 'dialogue' || card.type === 'portraitSwitch') && (
          <span
            className="text-xs font-semibold px-1.5 rounded"
            style={{ color: chColor, background: `${chColor}22` }}
          >
            {speaker}
          </span>
        )}
        <span className="ml-auto text-[10px] text-inkdim">#{index + 1}</span>

        <button
          onClick={(e) => {
            e.stopPropagation()
            selectCard(card.id)
            setCursor({ scene: sceneIdx, card: index })
            if (api) {
              api.openPreview(project, { scene: sceneIdx, card: index })
              toast('已从此处打开预览 ▶', 'success')
            } else {
              toast('独立预览需在桌面应用中运行', 'warn')
            }
          }}
          className="opacity-0 group-hover:opacity-100 text-xs w-5 h-5 rounded flex items-center justify-center hover:bg-accent/30 text-accent transition"
          title="从此处预览"
        >
          ▶
        </button>

        <MagicWand card={card} />

        <button
          onClick={(e) => {
            e.stopPropagation()
            if (confirmDel) {
              deleteCard(card.id)
            } else {
              setConfirmDel(true)
              setTimeout(() => setConfirmDel(false), 2000)
            }
          }}
          className={`opacity-0 group-hover:opacity-100 text-xs w-5 h-5 rounded flex items-center justify-center transition ${
            confirmDel ? 'bg-red-500/30 text-red-300 opacity-100' : 'hover:bg-panel3 text-inkdim'
          }`}
          title={confirmDel ? '再次点击确认删除' : '删除'}
        >
          {confirmDel ? '✓' : '🗑'}
        </button>
      </div>

      {/* 正文：对话/旁白可直接内联编辑（键盘即画笔） */}
      {(card.type === 'dialogue' || card.text !== undefined) && card.type !== 'choice' && (
        <textarea
          value={card.text || ''}
          onChange={(e) => updateCard(card.id, { text: e.target.value })}
          onClick={(e) => {
            // 多选模式：点击正文也切换选中（让事件冒泡到卡片）
            if (batchMode) return
            e.stopPropagation()
          }}
          onFocus={onSelect}
          rows={Math.min(4, Math.max(1, Math.ceil((card.text?.length || 1) / 34)))}
          placeholder="在此输入台词……"
          className="w-full bg-transparent text-sm text-ink resize-none outline-none leading-relaxed placeholder:text-inkdim/50"
        />
      )}

      {/* 选项分支 */}
      {card.type === 'choice' && (
        <div className="space-y-1 mt-1">
          <div className="text-sm text-ink">{card.text}</div>
          {(card.choices || []).map((ch, i) => (
            <div key={i} className="text-xs text-accent2 pl-3 border-l-2 border-accent/40">
              ▸ {ch.label} {ch.goto && <span className="text-inkdim">→ {ch.goto}</span>}
            </div>
          ))}
        </div>
      )}

      {/* 元信息摘要 */}
      <div className="flex gap-2 flex-wrap mt-1">
        {card.background && <Chip>🖼 {project.backgrounds.find((b) => b.id === card.background)?.name || card.background}</Chip>}
        {card.cardWeather && card.cardWeather !== 'none' && <Chip>{(card.cardWeather === 'rain' ? '🌧雨' : card.cardWeather === 'snow' ? '❄雪' : card.cardWeather === 'sakura' ? '🌸樱' : card.cardWeather === 'star' ? '✨星' : card.cardWeather)}</Chip>}
        {card.music && <Chip>🎵 {project.audioTracks.find((a) => a.id === card.music)?.name || card.music}</Chip>}
        {card.transition && <Chip>✨ {card.transition.kind} {card.transition.duration}ms</Chip>}
        {card.variableOps && card.variableOps.length > 0 && (
          <Chip>
            🔢{' '}
            {card.variableOps
              .map((v) => `${project.variables.find((x) => x.id === v.varId)?.name || '?'}${v.op === 'add' ? '+' : v.op === 'sub' ? '-' : '='}${v.value}`)
              .join(', ')}
          </Chip>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu &&
        createPortal(
          <div
            className="fixed z-[100] w-36 bg-panel3 border border-edge rounded-lg shadow-xl py-1 sf-pop"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-panel2 flex items-center gap-2"
              onClick={() => {
                setContextMenu(null)
                if (api) {
                  api.openPreview(project, { scene: sceneIdx, card: index })
                  toast('已从此处打开预览 ▶', 'success')
                } else {
                  toast('独立预览需在桌面应用中运行', 'warn')
                }
              }}
            >
              <span>▶</span>
              <span>从此处预览</span>
            </button>
          </div>,
          document.body
        )}
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }): JSX.Element {
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-panel3 text-inkdim">{children}</span>
}
