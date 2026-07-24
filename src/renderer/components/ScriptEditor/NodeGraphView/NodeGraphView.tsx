import { useMemo, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MarkerType,
  Panel,
  Position,
  type Edge,
  type Node,
  type NodeProps
} from 'reactflow'
import 'reactflow/dist/style.css'
import { CARD_TYPE_ICONS, type CardType } from '@shared/types'
import { useProjectStore } from '../../../store/projectStore'
import { analyzeStory, type NodeIssue } from '../../../lib/graphAnalysis'
import { applyAssetDropToCard, isAssetDrag } from '../../../lib/assetDrop'

/** 各卡片类型对应的强调色（左色条 + 图例） */
const TYPE_COLOR: Record<CardType, string> = {
  dialogue: '#6c5ce7',
  choice: '#4c8bf5',
  bgSwitch: '#10b981',
  portraitSwitch: '#f59e0b',
  music: '#ec4899',
  transition: '#8b5cf6',
  variableOp: '#14b8a6',
  video: '#ef4444'
}

interface CardNodeData {
  type: CardType
  speaker: string
  text: string
  choiceLabel?: string
  issue: NodeIssue | undefined
  selected: boolean
}

function CardNode({ id, data }: NodeProps<CardNodeData>): JSX.Element {
  const toast = useProjectStore((s) => s.toast)
  const [dropHover, setDropHover] = useState(false)
  const color = TYPE_COLOR[data.type] || '#6c5ce7'
  const issue = data.issue
  const ring = dropHover
    ? '0 0 0 2px rgb(var(--c-accent2))'
    : issue?.loop || issue?.broken
    ? '0 0 0 2px #ef4444'
    : issue?.unreachable
    ? '0 0 0 2px #f59e0b'
    : issue?.deadend
    ? '0 0 0 2px #f59e0b'
    : data.selected
    ? '0 0 0 2px rgb(var(--c-accent))'
    : '0 0 0 1px rgb(var(--c-edge))'

  const badge = issue?.loop
    ? '∞'
    : issue?.broken
    ? '⚠'
    : issue?.unreachable
    ? '⚠'
    : issue?.deadend
    ? '✂'
    : null
  const badgeColor = issue?.loop || issue?.broken ? '#ef4444' : '#f59e0b'

  return (
    <div
      className="relative rounded-xl"
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
        void applyAssetDropToCard(id, e).then((msg) => {
          if (msg) toast(msg, 'success')
        })
      }}
      style={{
        width: 210,
        background: 'rgb(var(--c-panel3))',
        color: 'rgb(var(--c-ink))',
        boxShadow: ring,
        borderLeft: `4px solid ${color}`
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: '#94a3b8', width: 6, height: 6 }} />
      <div className="px-2.5 py-2">
        <div className="flex items-center gap-1.5 text-[10px]" style={{ color }}>
          <span>{CARD_TYPE_ICONS[data.type]}</span>
          <span className="opacity-80">{data.speaker || '旁白'}</span>
        </div>
        <div className="text-xs mt-0.5 leading-snug line-clamp-2">
          {data.text || data.choiceLabel || data.type}
        </div>
      </div>
      {badge && (
        <div
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center text-[11px] text-white shadow"
          style={{ background: badgeColor }}
          title={issue?.loop ? '死循环：无法到达任何结局' : issue?.broken ? '存在断链' : issue?.unreachable ? '不可达' : '断头节点：无出口'}
        >
          {badge}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ background: '#94a3b8', width: 6, height: 6 }} />
    </div>
  )
}

const nodeTypes = { card: CardNode }

export default function NodeGraphView(): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const selectCard = useProjectStore((s) => s.selectCard)
  const selectedCardId = useProjectStore((s) => s.selectedCardId)

  const { nodes, edges, report } = useMemo(() => {
    const cards = project.scenes.flat()
    const idIndex = new Map(cards.map((c, i) => [c.id, i]))
    const rep = analyzeStory(project)
    const nodes: Node[] = []
    const edges: Edge[] = []

    // 按场景分列布局：每场景一列，卡片纵向堆叠
    project.scenes.forEach((scene, si) => {
      scene.forEach((c, ci) => {
        nodes.push({
          id: c.id,
          type: 'card',
          position: { x: si * 380, y: ci * 120 },
          data: {
            type: c.type,
            speaker: c.speaker || '',
            text: c.text || '',
            choiceLabel: c.choices?.[0]?.label,
            issue: rep.issues.get(c.id),
            selected: selectedCardId === c.id
          } as CardNodeData
        })
      })
    })

    const pushLine = (src: string, tgt: string, isChoice: boolean, label?: string, idx?: number): void => {
      if (!tgt || !idIndex.has(tgt)) return
      const edgeId = idx !== undefined ? `e_${src}_${tgt}_${idx}` : `e_${src}_${tgt}`
      const broken = rep.brokenEdgeIds.has(edgeId)
      edges.push({
        id: edgeId,
        source: src,
        target: tgt,
        label,
        labelStyle: { fill: isChoice ? '#4c8bf5' : 'rgb(var(--c-inkdim))', fontSize: 10 },
        markerEnd: { type: MarkerType.ArrowClosed, color: broken ? '#ef4444' : isChoice ? '#4c8bf5' : '#94a3b8' },
        style: {
          stroke: broken ? '#ef4444' : isChoice ? '#4c8bf5' : '#94a3b8',
          strokeDasharray: broken ? '5 4' : undefined,
          strokeWidth: broken ? 2 : 1.5
        },
        animated: isChoice && !broken
      })
    }

    cards.forEach((c) => {
      if (c.goto) pushLine(c.id, c.goto, false)
      ;(c.choices || []).forEach((ch, ci) => pushLine(c.id, ch.goto, true, ch.label, ci))
    })

    return { nodes, edges, report: rep }
  }, [project, selectedCardId])

  const s = report.summary

  return (
    <div className="w-full h-full reactflow-wrap">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
        onNodeClick={(_e, node) => selectCard(node.id)}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="rgb(var(--c-edge))" gap={22} />
        <Controls />
        <Panel position="bottom-left" className="!bg-transparent">
          <div
            className="text-[11px] rounded-lg px-3 py-2 sf-surface"
            style={{ color: 'rgb(var(--c-inkdim))' }}
          >
            <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
              <span>问题：</span>
              <span className={s.broken ? 'text-red-500 font-medium' : 'opacity-50'}>⚠ 断链 {s.broken}</span>
              <span className={s.unreachable ? 'text-amber-500 font-medium' : 'opacity-50'}>⚠ 不可达 {s.unreachable}</span>
              <span className={s.deadend ? 'text-amber-500 font-medium' : 'opacity-50'}>✂ 断头 {s.deadend}</span>
              <span className={s.loop ? 'text-red-500 font-medium' : 'opacity-50'}>∞ 死循环 {s.loop}</span>
              <span className="opacity-50 ml-1">| 共 {s.total} 节点</span>
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  )
}
