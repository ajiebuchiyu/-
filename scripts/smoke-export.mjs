// 冒烟测试：exportHtml 导出的单文件游戏包含共享运行库核心 + 条件分支过滤
// 用法: npx esbuild src/main/export/exportHtml.ts --bundle --format=esm --outfile=.tmp-export.mjs && node scripts/smoke-export.mjs
import { exportHtml } from '../.tmp-export.mjs'

const project = {
  title: '冒烟测试',
  characters: [],
  backgrounds: [],
  audioTracks: [],
  videos: [],
  variables: [{ id: 'v1', name: '好感度', type: 'number', initial: 0 }],
  scenes: [[
    { id: 'c1', type: 'dialogue', text: '你好', variableOps: [{ varId: 'v1', op: 'add', value: 10 }] },
    { id: 'c2', type: 'choice', text: '去哪？', choices: [
      { label: '高分支', goto: 'c3', condition: { varId: 'v1', op: '>', value: 5 } },
      { label: '低分支', goto: 'c4', condition: { varId: 'v1', op: '<', value: 5 } },
      { label: '普通分支', goto: 'c3' }
    ] },
    { id: 'c3', type: 'dialogue', text: '结局A' },
    { id: 'c4', type: 'dialogue', text: '结局B' }
  ]]
}

const html = exportHtml(project)
let pass = 0, fail = 0
function has(needle, name) {
  if (html.includes(needle)) pass++
  else { fail++; console.error(`  ✗ 缺少: ${name}`) }
}

has('applyVarOpsCore', '注入 applyVarOpsCore')
has('evalConditionCore', '注入 evalConditionCore')
has('visibleChoicesCore', '注入 visibleChoicesCore')
has('visibleChoices(card.choices)', '选项渲染走条件过滤')
has('choice-empty', '空分支占位样式')
has('冒烟测试', '标题写入')
if (!/function applyVarOps\(card\)\{ applyVarOpsCore/.test(html)) { fail++; console.error('  ✗ applyVarOps 未委托核心') } else pass++
console.log(`\nsmoke-export: ${pass} passed, ${fail} failed（HTML ${Math.round(html.length / 1024)} KB）`)
process.exit(fail ? 1 : 0)
