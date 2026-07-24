// 冒烟测试：shared/runtimeCore 语义 + 导出 HTML 注入片段可独立运行
// 用法: npx esbuild src/shared/runtimeCore.ts --bundle --format=esm --outfile=.tmp-core.mjs && node scripts/smoke-runtime-core.mjs
import { applyVarOpsCore, evalConditionCore, buildRuntimeCoreJS } from '../.tmp-core.mjs'

let pass = 0
let fail = 0
function eq(actual, expected, name) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++
  } else {
    fail++
    console.error(`  ✗ ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// ---- applyVarOpsCore ----
{
  const vars = { fav: 5 }
  applyVarOpsCore(vars, [{ varId: 'fav', op: 'add', value: 3 }])
  eq(vars.fav, 8, 'add')
  applyVarOpsCore(vars, [{ varId: 'fav', op: 'sub', value: 10 }])
  eq(vars.fav, -2, 'sub')
  applyVarOpsCore(vars, [{ varId: 'gold', op: 'set', value: 100 }])
  eq(vars.gold, 100, 'set new var')
  applyVarOpsCore(vars, [{ varId: 'x', op: 'add', value: 1 }])
  eq(vars.x, 1, 'add on undefined -> 1')
  applyVarOpsCore(vars, undefined)
  eq(vars.fav, -2, 'undefined ops no-op')
}

// ---- evalConditionCore ----
{
  const vars = { fav: 10, flag: true, name: 'a' }
  eq(evalConditionCore(undefined, vars), true, 'no cond -> true')
  eq(evalConditionCore({ varId: 'fav', op: '>', value: 5 }, vars), true, '10 > 5')
  eq(evalConditionCore({ varId: 'fav', op: '<', value: 5 }, vars), false, '10 < 5')
  eq(evalConditionCore({ varId: 'fav', op: '>=', value: 10 }, vars), true, '10 >= 10')
  eq(evalConditionCore({ varId: 'fav', op: '==', value: 10 }, vars), true, '10 == 10')
  eq(evalConditionCore({ varId: 'fav', op: '!=', value: 3 }, vars), true, '10 != 3')
  eq(evalConditionCore({ varId: 'flag', op: '==', value: true }, vars), true, 'bool ==')
  eq(evalConditionCore({ varId: 'flag', op: '!=', value: false }, vars), true, 'bool !=')
  eq(evalConditionCore({ varId: 'ghost', op: '>', value: 0 }, vars), false, 'missing var -> 0 > 0 false')
}

// ---- 注入片段独立求值（模拟导出 HTML 环境） ----
{
  const js = buildRuntimeCoreJS()
  const sandbox = new Function(`${js};
    var vars = { fav: 0 };
    applyVarOpsCore(vars, [{varId:'fav',op:'add',value:7}]);
    var choices = [
      { label:'A', condition:{ varId:'fav', op:'>', value:5 } },
      { label:'B', condition:{ varId:'fav', op:'<', value:5 } },
      { label:'C' }
    ];
    return { fav: vars.fav, visible: visibleChoicesCore(choices, vars).map(function(c){return c.label;}) };
  `)
  const r = sandbox()
  eq(r.fav, 7, 'injected applyVarOpsCore')
  eq(r.visible, ['A', 'C'], 'injected visibleChoicesCore filters')
}

console.log(`\nsmoke-runtime-core: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
