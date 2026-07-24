import type { Project, ScriptCard } from '@shared/types'
import { findBrokenLinks, type BrokenLink } from './projectAudit'

// ============================================================
// 剧情图逻辑分析：断链 / 不可达 / 断头节点 / 死循环
// 纯函数，编辑器节点配色与 DebugBar 汇总共用
// ============================================================

export interface NodeIssue {
  broken: boolean // 存在指向不存在卡片的出口（断链）
  unreachable: boolean // 从起点无法到达
  deadend: boolean // 没有任何出口（断头）
  loop: boolean // 处于无法结束的死循环
  kinds: Array<'broken' | 'unreachable' | 'deadend' | 'loop'>
}

export interface StoryReport {
  issues: Map<string, NodeIssue>
  brokenLinks: BrokenLink[]
  brokenSet: Set<string>
  unreachableSet: Set<string>
  deadendSet: Set<string>
  loopSet: Set<string>
  /** 失效的出口边 id（用于红色虚线高亮），格式 e_<src>_<tgt> 或 e_<src>_<tgt>_<idx> */
  brokenEdgeIds: Set<string>
  summary: { broken: number; unreachable: number; deadend: number; loop: number; total: number }
}

/** 收集一张卡片所有「有效」的出口目标 id（指向真实存在的卡片） */
function outgoing(cards: ScriptCard[], idSet: Set<string>): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const c of cards) {
    const outs: string[] = []
    if (c.goto && idSet.has(c.goto)) outs.push(c.goto)
    for (const ch of c.choices || []) if (ch.goto && idSet.has(ch.goto)) outs.push(ch.goto)
    map.set(c.id, outs)
  }
  return map
}

/** 反向邻接表（用于「能否到达终点」的反向 BFS） */
function reverseAdj(cards: ScriptCard[], adj: Map<string, string[]>): Map<string, string[]> {
  const rev = new Map<string, string[]>()
  for (const c of cards) rev.set(c.id, [])
  for (const [from, tos] of adj) for (const to of tos) rev.get(to)?.push(from)
  return rev
}

/** Tarjan 风格 SCC 判定「是否处于循环中」 */
function cycleMembers(cards: ScriptCard[], adj: Map<string, string[]>): Set<string> {
  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<string, number>()
  const inCycle = new Set<string>()
  for (const c of cards) color.set(c.id, WHITE)

  const dfs = (id: string, stack: string[]): void => {
    color.set(id, GRAY)
    stack.push(id)
    for (const to of adj.get(id) || []) {
      const c = color.get(to)
      if (c === WHITE) dfs(to, stack)
      else if (c === GRAY) {
        // 找到回边：从栈中 to 到栈顶全部在环上
        const idx = stack.indexOf(to)
        if (idx >= 0) for (let i = idx; i < stack.length; i++) inCycle.add(stack[i])
      }
    }
    stack.pop()
    color.set(id, BLACK)
  }

  for (const c of cards) if (color.get(c.id) === WHITE) dfs(c.id, [])
  return inCycle
}

export function analyzeStory(project: Project): StoryReport {
  const cards = project.scenes.flat()
  const idSet = new Set(cards.map((c) => c.id))
  const empty: StoryReport = {
    issues: new Map(),
    brokenLinks: [],
    brokenSet: new Set(),
    unreachableSet: new Set(),
    deadendSet: new Set(),
    loopSet: new Set(),
    brokenEdgeIds: new Set(),
    summary: { broken: 0, unreachable: 0, deadend: 0, loop: 0, total: 0 }
  }
  if (cards.length === 0) return empty

  const adj = outgoing(cards, idSet)
  const brokenLinks = findBrokenLinks(project)
  const brokenSet = new Set(brokenLinks.map((b) => b.cardId))
  const brokenEdgeIds = new Set<string>()
  for (const b of brokenLinks) {
    // 找到该卡片这一条出口对应的边 id
    const src = b.cardId
    const card = cards.find((c) => c.id === src)
    if (card?.goto === b.target) brokenEdgeIds.add(`e_${src}_${b.target}`)
    else {
      const ci = (card?.choices || []).findIndex((ch) => ch.goto === b.target)
      if (ci >= 0) brokenEdgeIds.add(`e_${src}_${b.target}_${ci}`)
    }
  }

  // 起点：第一个场景的第一张卡片
  const startId = project.scenes[0]?.[0]?.id ?? cards[0].id

  // 可达性（从起点 BFS）
  const reachable = new Set<string>()
  const queue = [startId]
  while (queue.length) {
    const cur = queue.shift()!
    if (reachable.has(cur)) continue
    reachable.add(cur)
    for (const to of adj.get(cur) || []) if (!reachable.has(to)) queue.push(to)
  }
  const unreachableSet = new Set<string>()
  for (const c of cards) if (!reachable.has(c.id)) unreachableSet.add(c.id)

  // 终点：没有任何有效出口的卡片；最后一个扁平卡片视为「正常结局」，不报断头
  const lastId = cards[cards.length - 1].id
  const deadendSet = new Set<string>()
  for (const c of cards) {
    const outs = adj.get(c.id) || []
    if (outs.length === 0 && c.id !== lastId) deadendSet.add(c.id)
  }

  // 能否到达某终点（反向 BFS，从所有终点出发）
  const rev = reverseAdj(cards, adj)
  const exitable = new Set<string>()
  const rq = [...deadendSet, lastId]
  while (rq.length) {
    const cur = rq.shift()!
    if (exitable.has(cur)) continue
    exitable.add(cur)
    for (const from of rev.get(cur) || []) if (!exitable.has(from)) rq.push(from)
  }

  // 死循环：处于环中且无法到达任何终点
  const inCycle = cycleMembers(cards, adj)
  const loopSet = new Set<string>()
  for (const id of inCycle) if (!exitable.has(id)) loopSet.add(id)

  // 汇总
  const issues = new Map<string, NodeIssue>()
  let b = 0
  let u = 0
  let d = 0
  let l = 0
  for (const c of cards) {
    const broken = brokenSet.has(c.id)
    const unreachable = unreachableSet.has(c.id)
    const deadend = deadendSet.has(c.id)
    const loop = loopSet.has(c.id)
    const kinds: Array<'broken' | 'unreachable' | 'deadend' | 'loop'> = []
    if (broken) kinds.push('broken')
    if (unreachable && !broken) kinds.push('unreachable')
    if (deadend && !loop && !unreachable) kinds.push('deadend')
    if (loop) kinds.push('loop')
    issues.set(c.id, { broken, unreachable, deadend, loop, kinds })
    if (broken) b++
    if (unreachable && !broken) u++
    if (deadend && !loop && !unreachable) d++
    if (loop) l++
  }

  return {
    issues,
    brokenLinks,
    brokenSet,
    unreachableSet,
    deadendSet,
    loopSet,
    brokenEdgeIds,
    summary: { broken: b, unreachable: u, deadend: d, loop: l, total: cards.length }
  }
}
