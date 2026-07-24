import { useMemo, useState } from 'react'
import type { ScriptCard } from '@shared/types'
import { useProjectStore } from '../../store/projectStore'
import { analyzeStory } from '../../lib/graphAnalysis'
import VirtualList from '../common/VirtualList'

export default function DebugBar(): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const selectCard = useProjectStore((s) => s.selectCard)
  const setCursor = useProjectStore((s) => s.setCursor)
  const updateVariable = useProjectStore((s) => s.updateVariable)
  const [pos, setPos] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [snapshots, setSnapshots] = useState<{ label: string; pos: number }[]>([])
  const [logicOpen, setLogicOpen] = useState(false)

  const cards = project.scenes[0] || []
  const flat = useMemo(() => project.scenes.flat(), [project])
  const idMap = useMemo(() => {
    const m = new Map<string, { scene: number; card: number; card_: ScriptCard }>()
    project.scenes.forEach((scene, si) =>
      scene.forEach((c, ci) => m.set(c.id, { scene: si, card: ci, card_: c }))
    )
    return m
  }, [project])

  // 全局逻辑体检：断链 / 不可达 / 断头 / 死循环
  const report = useMemo(() => analyzeStory(project), [project])
  const issueCards = useMemo(() => {
    const out: { id: string; label: string; kinds: string[]; icon: string; color: string }[] = []
    for (const [id, issue] of report.issues) {
      if (issue.kinds.length === 0) continue
      const c = idMap.get(id)?.card_
      const icon = issue.loop ? '∞' : issue.broken ? '⚠' : issue.unreachable ? '⚠' : '✂'
      const color = issue.loop || issue.broken ? '#ef4444' : '#f59e0b'
      out.push({
        id,
        label: (c?.text || c?.choices?.[0]?.label || c?.type || '').slice(0, 16) || '(空卡片)',
        kinds: issue.kinds,
        icon,
        color
      })
    }
    return out
  }, [report, idMap])
  const issueTotal = issueCards.length

  // 模拟到 pos 位置时的变量值
  const varsAtPos = useMemo(() => {
    const state: Record<string, number | boolean | string> = {}
    project.variables.forEach((v) => (state[v.id] = v.initial))
    for (let i = 0; i <= pos && i < cards.length; i++) {
      const c: ScriptCard = cards[i]
      c.variableOps?.forEach((op) => {
        const cur = Number(state[op.varId] ?? 0)
        if (op.op === 'set') state[op.varId] = op.value
        else if (op.op === 'add') state[op.varId] = cur + Number(op.value)
        else if (op.op === 'sub') state[op.varId] = cur - Number(op.value)
      })
    }
    return state
  }, [project.variables, cards, pos])

  const jump = (i: number): void => {
    setPos(i)
    const card = cards[i]
    if (card) {
      selectCard(card.id)
      setCursor({ scene: 0, card: i })
    }
  }

  const locate = (id: string): void => {
    const loc = idMap.get(id)
    if (!loc) return
    selectCard(id)
    setCursor({ scene: loc.scene, card: loc.card })
    if (loc.scene === 0) setPos(loc.card)
    setLogicOpen(false)
  }

  if (collapsed) {
    return (
      <div className="h-7 shrink-0 border-t border-edge bg-panel3 flex items-center gap-3 px-3 text-xs text-inkdim">
        <button onClick={() => setCollapsed(false)} className="hover:text-ink">
          ▴ 展开时间轴调试栏
        </button>
        {issueTotal > 0 && (
          <button
            onClick={() => setCollapsed(false)}
            className="text-red-500 hover:text-red-600 font-medium"
            title="存在逻辑问题，展开查看"
          >
            ⚠ {issueTotal} 处逻辑问题
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="h-28 shrink-0 border-t border-edge bg-panel3 flex flex-col">
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-edge/60">
        <span className="text-xs font-medium">🐞 时间轴调试</span>
        <span className="text-[10px] text-inkdim">
          位置 {cards.length ? pos + 1 : 0}/{cards.length}
        </span>
        <button
          onClick={() => setSnapshots((s) => [...s, { label: `快照@${pos + 1}`, pos }])}
          className="text-[10px] px-2 py-0.5 rounded bg-panel2 hover:bg-accent/25"
        >
          📸 设快照
        </button>
        {snapshots.map((s, i) => (
          <button
            key={i}
            onClick={() => jump(s.pos)}
            className="text-[10px] px-1.5 py-0.5 rounded bg-panel2 hover:bg-accent/25 text-accent2"
          >
            {s.label}
          </button>
        ))}
        <div className="flex-1" />

        {/* 逻辑体检 */}
        <div className="relative">
          {issueTotal === 0 ? (
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600" title="没有断链 / 不可达 / 死循环">
              ✓ 逻辑完整
            </span>
          ) : (
            <button
              onClick={() => setLogicOpen((v) => !v)}
              className="text-[10px] px-2 py-0.5 rounded bg-red-500/15 text-red-500 hover:bg-red-500/25 font-medium"
              title="点击查看逻辑问题明细"
            >
              ⚠ {issueTotal} 处逻辑问题
            </button>
          )}
          {logicOpen && issueTotal > 0 && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setLogicOpen(false)} />
              <div className="absolute bottom-7 right-0 w-80 max-h-64 overflow-y-auto bg-panel3 border border-edge rounded-lg shadow-2xl z-40 py-1 sf-fade-up">
                <div className="px-3 py-1.5 text-[11px] text-inkdim border-b border-edge flex items-center justify-between">
                  <span>逻辑体检：点击定位问题卡片</span>
                </div>
                <VirtualList
                  items={issueCards}
                  itemKey={(it) => it.id}
                  estimateSize={44}
                  threshold={20}
                  maxHeight={200}
                  renderItem={(it) => (
                    <button
                      onClick={() => locate(it.id)}
                      className="w-full text-left px-3 py-1.5 hover:bg-panel2 flex items-start gap-2"
                    >
                      <span className="text-xs mt-0.5 w-4 text-center" style={{ color: it.color }}>
                        {it.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <div className="text-xs truncate">{it.label}</div>
                        <div className="text-[10px] text-inkdim">
                          {it.kinds.map((k) => ({ broken: '断链', unreachable: '不可达', deadend: '断头', loop: '死循环' }[k])).join(' · ')}
                        </div>
                      </span>
                    </button>
                  )}
                />
              </div>
            </>
          )}
        </div>

        <button onClick={() => setCollapsed(true)} className="text-xs text-inkdim hover:text-ink">
          ▾ 收起
        </button>
      </div>

      <div className="flex-1 flex items-center gap-4 px-4">
        {/* 拖动定位 */}
        <input
          type="range"
          min={0}
          max={Math.max(0, cards.length - 1)}
          value={pos}
          onChange={(e) => jump(Number(e.target.value))}
          className="flex-1 accent-[#7c5cff]"
        />
        {/* 变量监视器：实时显示当前位置变量值，可改初始值测试分支 */}
        <div className="flex items-center gap-2 min-w-[200px]">
          <span className="text-[10px] text-inkdim shrink-0" title="调试时修改初始值以测试剧情分支">
            🔍 变量监视
          </span>
          {project.variables.length === 0 && <span className="text-[10px] text-inkdim">无变量</span>}
          {project.variables.map((v) => (
            <div key={v.id} className="text-center">
              <div className="text-[10px] text-inkdim max-w-[64px] truncate">
                {v.name}
                <span className="text-accent2 ml-0.5" title="当前位置的模拟值">={String(varsAtPos[v.id] ?? v.initial)}</span>
              </div>
              <input
                type={v.type === 'number' ? 'number' : 'text'}
                value={String(v.initial)}
                onChange={(e) =>
                  updateVariable(v.id, {
                    initial: v.type === 'number' ? Number(e.target.value) || 0 : e.target.value
                  })
                }
                className="w-14 text-center text-xs font-bold text-accent2 bg-panel3 border border-edge rounded px-1 outline-none focus:border-accent"
                title="调试时修改初始值（用于测试分支逻辑）"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
