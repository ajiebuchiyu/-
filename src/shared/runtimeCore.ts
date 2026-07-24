import type { Condition, VariableOp } from './types'

// ============================================================
// 共享 Web 运行库核心（导出去重）
// - 编辑器预览（GameRuntime）直接 import 调用
// - HTML5 导出（exportHtml）通过 Function.prototype.toString()
//   将同一份实现注入到导出的单文件运行时中
// 约束：以下函数必须【完全自包含】（不引用外部符号、无 TS 编译助手），
//       否则 toString() 注入后在导出的游戏里会报未定义。
// ============================================================

export type VarBag = Record<string, number | boolean | string | undefined>

/** 应用一组变量操作（set / add / sub），原地修改 vars 并返回它 */
export function applyVarOpsCore(vars: VarBag, ops: VariableOp[] | undefined): VarBag {
  if (!ops) return vars
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    const cur = Number(vars[op.varId] === undefined ? 0 : vars[op.varId])
    if (op.op === 'set') vars[op.varId] = op.value
    else if (op.op === 'add') vars[op.varId] = (isNaN(cur) ? 0 : cur) + Number(op.value)
    else if (op.op === 'sub') vars[op.varId] = (isNaN(cur) ? 0 : cur) - Number(op.value)
  }
  return vars
}

/** 求值单个条件；条件为空视为成立（自包含：数值/布尔转换逻辑全部内联） */
export function evalConditionCore(cond: Condition | undefined, vars: VarBag): boolean {
  if (!cond || !cond.varId) return true
  const left = vars[cond.varId]
  const right = cond.value

  function toNum(v: unknown): number {
    if (typeof v === 'number') return v
    if (typeof v === 'boolean') return v ? 1 : 0
    const n = Number(v)
    return isNaN(n) ? 0 : n
  }
  function toBool(v: unknown): boolean {
    if (typeof v === 'boolean') return v
    if (typeof v === 'number') return v !== 0
    return v === 'true' || v === '1' || v === '是'
  }

  // 布尔比较：仅当任一侧确实是布尔值时
  if (typeof left === 'boolean' || typeof right === 'boolean') {
    if (cond.op === '==') return toBool(left) === toBool(right)
    if (cond.op === '!=') return toBool(left) !== toBool(right)
  }
  // 文本比较：==/!= 且任一侧是非数值字符串时按文本比较
  if (cond.op === '==' || cond.op === '!=') {
    const ls = typeof left === 'string' && left !== '' && isNaN(Number(left))
    const rs = typeof right === 'string' && right !== '' && isNaN(Number(right))
    if (ls || rs) {
      return cond.op === '==' ? String(left) === String(right) : String(left) !== String(right)
    }
  }
  const lv = toNum(left)
  const rv = toNum(right)
  if (cond.op === '>') return lv > rv
  if (cond.op === '>=') return lv >= rv
  if (cond.op === '<') return lv < rv
  if (cond.op === '<=') return lv <= rv
  if (cond.op === '==') return lv === rv
  if (cond.op === '!=') return lv !== rv
  return true
}

/**
 * 生成注入导出 HTML 的运行库 JS 片段。
 * 导出的游戏与编辑器预览由此保证行为 100% 一致。
 */
export function buildRuntimeCoreJS(): string {
  return [
    'var applyVarOpsCore = ' + applyVarOpsCore.toString() + ';',
    'var evalConditionCore = ' + evalConditionCore.toString() + ';',
    'function visibleChoicesCore(choices, vars){ return (choices||[]).filter(function(c){ return evalConditionCore(c.condition, vars); }); }'
  ].join('\n')
}
