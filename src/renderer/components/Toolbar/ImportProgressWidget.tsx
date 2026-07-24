import { useEffect, useState } from 'react'
import type { NovelImportController } from '../../ai/novelParser'

/**
 * 角落进度浮窗：在导入/识别进行中常驻右下角（不阻塞界面）。
 * - 显示 当前段/总段、已识别卡片数、进度条；
 * - 进行中可「暂停 / 停止」，暂停后变「继续」；
 * - 完成后 2.6s 自动收起；暂停/停止/出错需手动关闭。
 * 数据全部来自传入的 NovelImportController（订阅式刷新）。
 */
export default function ImportProgressWidget({
  controller,
  onClose
}: {
  controller: NovelImportController
  onClose: () => void
}): JSX.Element {
  const [, force] = useState(0)
  useEffect(() => controller.subscribe(() => force((n) => n + 1)), [controller])

  const pct = controller.total ? Math.min(100, Math.round((controller.current / controller.total) * 100)) : 0
  const status = controller.status
  const isActive = status === 'running' || status === 'paused'

  // 完成后自动收起
  useEffect(() => {
    if (status === 'done') {
      const t = setTimeout(onClose, 2600)
      return () => clearTimeout(t)
    }
  }, [status, onClose])

  const icon = status === 'paused' ? '⏸' : status === 'done' ? '✅' : status === 'stopped' ? '⏹' : status === 'error' ? '⚠' : '🔄'
  const title =
    status === 'done'
      ? '识别完成'
      : status === 'stopped'
        ? '已停止'
        : status === 'error'
          ? '识别出错'
          : status === 'paused'
            ? '已暂停'
            : '导入小说中'

  return (
    <div className="fixed bottom-5 right-5 z-[60] w-72 bg-panel3 border border-edge rounded-xl shadow-2xl sf-modal-in select-none">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-edge">
        <span className={`text-base leading-none ${status === 'running' ? 'inline-block sf-spin' : ''}`}>{icon}</span>
        <span className="text-sm font-medium flex-1">{title}</span>
        {!isActive && (
          <button
            onClick={onClose}
            className="text-inkdim hover:text-ink text-lg leading-none px-1"
            title="关闭"
          >
            ×
          </button>
        )}
      </div>

      <div className="px-3 py-2.5">
        <div className="text-xs text-inkdim mb-2 line-clamp-2 min-h-[16px]">
          {controller.message || '准备中…'}
        </div>

        <div className="h-1.5 rounded-full bg-panel2 overflow-hidden mb-2">
          <div
            className={`h-full transition-all duration-500 ease-out ${status === 'error' ? 'bg-red-500' : 'bg-accent-grad'}`}
            style={{ width: pct + '%' }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-inkdim">
          <span>
            {controller.current}/{controller.total} 段 · {controller.cardsAdded} 张卡片
          </span>
          <div className="flex gap-1.5">
            {status === 'running' && (
              <>
                <button
                  onClick={() => controller.pause()}
                  className="px-2 py-0.5 rounded bg-panel2 hover:bg-accent/20 text-ink"
                >
                  暂停
                </button>
                <button
                  onClick={() => controller.stop()}
                  className="px-2 py-0.5 rounded bg-panel2 hover:bg-red-500/20 text-red-500"
                >
                  停止
                </button>
              </>
            )}
            {status === 'paused' && (
              <button
                onClick={() => controller.resume()}
                className="px-2 py-0.5 rounded bg-accent/20 text-accent"
              >
                继续
              </button>
            )}
          </div>
        </div>

        <div className="mt-1.5 text-[11px] text-inkdim/70">
          {controller.usedAI ? 'AI 智能识别中 · 已识别内容实时显示在剧情页' : controller.fallback ? '未配置 AI · 规则解析中' : '识别中 · 已识别内容实时显示在剧情页'}
        </div>
      </div>
    </div>
  )
}
