import { useProjectStore } from '../../store/projectStore'
import TimelineView from './TimelineView/TimelineView'
import NodeGraphView from './NodeGraphView/NodeGraphView'

export default function ScriptEditor(): JSX.Element {
  const viewMode = useProjectStore((s) => s.viewMode)
  const setViewMode = useProjectStore((s) => s.setViewMode)
  const project = useProjectStore((s) => s.project)
  const cardCount = project.scenes.reduce((n, s) => n + s.length, 0)

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 视图切换栏 */}
      <div className="h-10 shrink-0 flex items-center gap-2 px-3 border-b border-edge bg-panel">
        <div className="flex bg-panel2 rounded-lg p-0.5">
          <Tab active={viewMode === 'timeline'} onClick={() => setViewMode('timeline')}>
            🎞 时间轴
          </Tab>
          <Tab active={viewMode === 'nodegraph'} onClick={() => setViewMode('nodegraph')}>
            🔀 节点图
          </Tab>
        </div>
        <div className="flex-1" />
        <span className="text-xs text-inkdim">
          共 {cardCount} 张卡片 · 按 <kbd className="px-1 bg-panel3 rounded border border-edge">Tab</kbd> 插入下一元素
        </span>
      </div>

      <div className="flex-1 min-h-0">
        <div key={viewMode} className="h-full sf-tab-in">
          {viewMode === 'timeline' ? <TimelineView /> : <NodeGraphView />}
        </div>
      </div>
    </div>
  )
}

function Tab({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-md text-sm transition-all sf-tap ${
        active ? 'bg-accent-grad text-white shadow-card' : 'text-inkdim hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}
