import { useEffect, useRef, useState, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { CARD_TYPE_ICONS, CARD_TYPE_LABELS } from '@shared/types'
import type { CardType } from '@shared/types'
import { useProjectStore } from '../../../store/projectStore'
import ScriptCard from '../ScriptCard'

const CARD_TYPES: CardType[] = ['dialogue', 'choice', 'bgSwitch', 'portraitSwitch', 'music', 'transition', 'variableOp']

export default function TimelineView(): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const cursor = useProjectStore((s) => s.cursor)
  const insertCardAt = useProjectStore((s) => s.insertCardAt)
  const toast = useProjectStore((s) => s.toast)
  const importTick = useProjectStore((s) => s.importTick)
  const parentRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [picker, setPicker] = useState(false)
  // 拖拽落点：gap = 插入位置（0=最前，cards.length=最后），y = 指示线像素位置
  const [drop, setDrop] = useState<{ gap: number; y: number } | null>(null)

  // ---- 批量选择 ----
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const deleteCards = useProjectStore((s) => s.deleteCards)

  // 目前主流程渲染第 0 场景（数据层支持多场景）
  const sceneIdx = 0
  const cards = project.scenes[sceneIdx] || []

  const toggleBatchId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAllBatch = useCallback(() => {
    setSelectedIds(new Set(cards.map((c) => c.id)))
  }, [cards])

  const clearBatchSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const exitBatchMode = useCallback(() => {
    setBatchMode(false)
    setSelectedIds(new Set())
  }, [])

  const doBatchDelete = useCallback(() => {
    if (selectedIds.size === 0) return
    const count = selectedIds.size
    deleteCards(Array.from(selectedIds))
    toast(`已删除 ${count} 张卡片`, 'success')
    exitBatchMode()
  }, [selectedIds, deleteCards, toast, exitBatchMode])

  const virtualizer = useVirtualizer({
    count: cards.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 116,
    overscan: 8
  })

  // 导入流式识别时，自动滚动到最新识别出的卡片（剧情页实时展示）
  useEffect(() => {
    if (importTick > 0 && cards.length > 0) {
      virtualizer.scrollToIndex(cards.length - 1, { align: 'end' })
    }
  }, [importTick, cards.length, virtualizer])

  // Tab 键：在光标处插入下一个对话卡片（键盘即画笔）
  // Esc：退出多选模式；Ctrl+A：多选模式下全选
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && batchMode) {
        e.preventDefault()
        exitBatchMode()
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        const at = cursor.scene === sceneIdx ? cursor.card : cards.length - 1
        insertCardAt(sceneIdx, at, 'dialogue')
        toast('已插入对话卡片', 'info')
        requestAnimationFrame(() => virtualizer.scrollToIndex(at + 1, { align: 'center' }))
      }
      if (batchMode && e.ctrlKey && e.key === 'a') {
        e.preventDefault()
        selectAllBatch()
      }
    }
    const node = parentRef.current
    node?.addEventListener('keydown', onKey)
    return () => node?.removeEventListener('keydown', onKey)
  }, [cursor, cards.length, insertCardAt, toast, virtualizer, batchMode, exitBatchMode, selectAllBatch])

  const insertType = (type: CardType): void => {
    const at = cursor.scene === sceneIdx ? cursor.card : cards.length - 1
    insertCardAt(sceneIdx, at, type)
    setPicker(false)
    toast(`已插入「${CARD_TYPE_LABELS[type]}」`, 'info')
  }

  // ---- 拖拽落点计算（从资源树拖入剧情元素） ----
  const isCardTypeDrag = (e: React.DragEvent): boolean => e.dataTransfer.types.includes('sf/card-type')

  const computeDrop = (e: React.DragEvent): { gap: number; y: number } => {
    const items = virtualizer.getVirtualItems()
    const total = virtualizer.getTotalSize()
    if (items.length === 0) return { gap: 0, y: 0 }
    const innerTop = innerRef.current?.getBoundingClientRect().top ?? 0
    const y = e.clientY - innerTop
    for (const vi of items) {
      const mid = vi.start + vi.size / 2
      if (y < mid) return { gap: vi.index, y: vi.start }
    }
    return { gap: cards.length, y: total }
  }

  const onDragOver = (e: React.DragEvent): void => {
    if (!isCardTypeDrag(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDrop(computeDrop(e))
  }

  const onDrop = (e: React.DragEvent): void => {
    if (!isCardTypeDrag(e)) return
    e.preventDefault()
    const type = e.dataTransfer.getData('sf/card-type') as CardType
    const target = drop ?? computeDrop(e)
    // insertCardAt 是「在 afterIdx 之后插入」，gap g 对应 afterIdx = g - 1
    insertCardAt(sceneIdx, target.gap - 1, type)
    setDrop(null)
    toast(`已在第 ${target.gap + 1} 位插入「${CARD_TYPE_LABELS[type]}」`, 'success')
  }

  return (
    <div className="relative h-full flex flex-col bg-panel">
      {/* 批量操作工具栏 */}
      {batchMode && (
        <div className="flex items-center gap-2 px-4 py-2 bg-accent/10 border-b border-accent/30 shrink-0">
          <button
            onClick={exitBatchMode}
            className="text-xs text-inkdim hover:text-ink px-1"
            title="退出多选模式"
          >
            ✕ 取消
          </button>
          <span className="text-xs text-accent font-medium">已选 {selectedIds.size} / {cards.length}</span>
          {cards.length > 0 && (
            <>
              {selectedIds.size === cards.length ? (
                <button onClick={clearBatchSelection} className="text-xs text-inkdim hover:text-ink px-1">取消全选</button>
              ) : (
                <button onClick={selectAllBatch} className="text-xs text-inkdim hover:text-ink px-1">全选</button>
              )}
            </>
          )}
          <div className="flex-1" />
          <button
            onClick={doBatchDelete}
            disabled={selectedIds.size === 0}
            className={`text-xs px-3 py-1 rounded-md transition ${
              selectedIds.size > 0
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-panel2 text-inkdim cursor-not-allowed'
            }`}
          >
            🗑 删除选中（{selectedIds.size}）
          </button>
        </div>
      )}

      {/* 多选模式切换按钮 */}
      {!batchMode && cards.length > 0 && (
        <div className="absolute top-2 left-4 z-10">
          <button
            onClick={() => setBatchMode(true)}
            className="text-[11px] px-2 py-0.5 rounded bg-panel3/90 border border-edge hover:border-accent text-inkdim hover:text-accent transition backdrop-blur-sm"
            title="进入多选模式，可批量删除卡片"
          >
            ☐ 多选
          </button>
        </div>
      )}
      <div
        ref={parentRef}
        tabIndex={0}
        className="flex-1 overflow-y-auto px-4 py-3 outline-none"
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragLeave={(e) => {
          // 离开滚动区域才清除（避免子元素间抖动）
          if (!parentRef.current?.contains(e.relatedTarget as Node)) setDrop(null)
        }}
      >
        {cards.length === 0 ? (
          <div
            className={`h-full flex items-center justify-center text-sm rounded-lg border-2 border-dashed transition-colors ${
              drop ? 'border-accent text-accent bg-accent/5' : 'border-transparent text-inkdim'
            }`}
          >
            {drop ? '松开即可放置剧情元素 ▾' : '空空如也 —— 点击右下角 ✚ 或按 Tab 开始写剧本，也可从左侧拖入元素'}
          </div>
        ) : (
          <div ref={innerRef} style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {/* 拖拽落点指示线 */}
            {drop && (
              <div
                className="absolute left-0 right-0 z-10 pointer-events-none flex items-center gap-1"
                style={{ top: drop.y - 1 }}
              >
                <span className="w-2 h-2 rounded-full bg-accent -ml-0.5" />
                <span className="flex-1 h-0.5 bg-accent rounded-full shadow-[0_0_6px_rgba(109,75,255,0.6)]" />
                <span className="text-[10px] text-accent bg-panel3 px-1 rounded">落在第 {drop.gap + 1} 位</span>
              </div>
            )}
            {virtualizer.getVirtualItems().map((vi) => {
              const card = cards[vi.index]
              return (
                <div
                  key={card.id}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)` }}
                  className="pb-2"
                >
                  {/* 时间轴连接线 */}
                  <div className="flex gap-2">
                    <div className="flex flex-col items-center pt-3 w-4 shrink-0">
                      <div className="w-2 h-2 rounded-full bg-accent" />
                      {vi.index < cards.length - 1 && <div className="flex-1 w-px bg-edge mt-1" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <ScriptCard
                        card={card}
                        index={vi.index}
                        sceneIdx={sceneIdx}
                        batchMode={batchMode}
                        batchSelected={selectedIds.has(card.id)}
                        onBatchToggle={toggleBatchId}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 悬浮插入按钮 + 类型选择器 */}
      <div className="absolute bottom-5 right-6 z-20">
        {picker && (
          <div className="absolute bottom-14 right-0 w-44 bg-panel3 border border-edge rounded-xl shadow-xl py-1 sf-pop">
            {CARD_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => insertType(t)}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-panel2 flex items-center gap-2"
              >
                <span>{CARD_TYPE_ICONS[t]}</span>
                <span>{CARD_TYPE_LABELS[t]}</span>
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setPicker((v) => !v)}
          className="w-12 h-12 rounded-full bg-accent-grad hover:brightness-105 text-white text-2xl shadow-pop flex items-center justify-center transition-transform hover:scale-105"
          title="插入剧情元素"
        >
          {picker ? '×' : '✚'}
        </button>
      </div>
    </div>
  )
}
