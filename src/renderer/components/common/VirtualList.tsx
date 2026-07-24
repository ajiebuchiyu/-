import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

/**
 * 通用虚拟化列表：
 * - 数量小于 threshold 时直接普通渲染（零开销，不限制高度）
 * - 数量超过 threshold 时启用 @tanstack/react-virtual 窗口化渲染，
 *   支持动态行高（measureElement），容器高度受 maxHeight 限制并出现滚动条。
 * 适用于资源面板（角色/背景/音轨/变量）、调试问题列表等可能上千条的场景。
 */
export default function VirtualList<T>({
  items,
  renderItem,
  itemKey,
  estimateSize = 44,
  threshold = 30,
  maxHeight = 320,
  overscan = 8
}: {
  items: T[]
  renderItem: (item: T, index: number) => React.ReactNode
  itemKey: (item: T, index: number) => string | number
  estimateSize?: number
  threshold?: number
  maxHeight?: number
  overscan?: number
}): JSX.Element {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const virtual = items.length > threshold

  const virtualizer = useVirtualizer({
    count: virtual ? items.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan
  })

  if (!virtual) {
    return (
      <>
        {items.map((it, i) => (
          <div key={itemKey(it, i)}>{renderItem(it, i)}</div>
        ))}
      </>
    )
  }

  return (
    <div ref={parentRef} style={{ maxHeight, overflowY: 'auto' }} className="sf-scroll">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {virtualizer.getVirtualItems().map((vi) => (
          <div
            key={itemKey(items[vi.index], vi.index)}
            ref={virtualizer.measureElement}
            data-index={vi.index}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)` }}
          >
            {renderItem(items[vi.index], vi.index)}
          </div>
        ))}
      </div>
    </div>
  )
}
