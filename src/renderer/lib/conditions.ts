import type { Condition, ConditionOp } from '@shared/types'
import { evalConditionCore } from '@shared/runtimeCore'

// ============================================================
// 条件分支求值（自然语言式：「如果 [变量] [大于] [数值]」）
// 编辑器预览与导出运行时共用同一套语义，避免两处行为漂移
// ============================================================

/** 操作符 → 中文标签（用于下拉菜单，告别 if-else） */
export const OP_LABELS: Record<ConditionOp, string> = {
  '>': '大于',
  '>=': '不小于',
  '<': '小于',
  '<=': '不大于',
  '==': '等于',
  '!=': '不等于'
}

export const OP_LIST: ConditionOp[] = ['>', '>=', '<', '<=', '==', '!=']

/** 求值单个条件；条件为空视为成立（委托共享运行库核心，编辑器与导出行为一致） */
export function evalCondition(
  cond: Condition | undefined,
  vars: Record<string, number | boolean | string | undefined>
): boolean {
  return evalConditionCore(cond, vars)
}

/**
 * 过滤出当前条件下「可见」的选项。
 * 无条件的选项始终可见；有条件且不成立的选项被隐藏。
 */
export function visibleChoices<T extends { condition?: Condition }>(
  choices: T[] | undefined,
  vars: Record<string, number | boolean | string | undefined>
): T[] {
  if (!choices) return []
  return choices.filter((c) => evalCondition(c.condition, vars))
}
