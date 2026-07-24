import type { Project } from '@shared/types'
import { defaultGameShell } from '@shared/types'

/**
 * 内置演示项目「校园初遇」。
 * 无需任何 API Key 即可运行。所有立绘用彩色占位色块，背景用 CSS 渐变占位。
 */
export function createDemoProject(): Project {
  return {
    id: 'demo-school',
    title: '校园初遇',
    createdAt: Date.now(),
    shell: defaultGameShell('校园初遇'),
    characters: [
      { id: 'c_shizuku', name: '雫', portraits: { normal: '', smile: '', shy: '' }, color: '#ff8fab' },
      { id: 'c_hero', name: '我', portraits: { normal: '' }, color: '#5cc8ff' }
    ],
    backgrounds: [
      { id: 'bg_gate', name: 'school-gate.jpg', image: '', weather: 'sakura', timeOfDay: 'day' },
      { id: 'bg_class', name: 'classroom.jpg', image: '', weather: 'none', timeOfDay: 'day' },
      { id: 'bg_roof', name: 'rooftop.jpg', image: '', weather: 'star', timeOfDay: 'dusk' }
    ],
    audioTracks: [
      { id: 'bgm_spring', name: '春日序曲', type: 'bgm', src: '' },
      { id: 'sfx_bell', name: '上课铃', type: 'sfx', src: '' }
    ],
    videos: [],
    variables: [{ id: 'v_favor', name: '好感度', type: 'number', initial: 0 }],
    scenes: [
      [
        {
          id: 'k1',
          type: 'bgSwitch',
          background: 'bg_gate',
          text: '春天的校门口，樱花纷纷扬扬地落下。',
          goto: 'k2'
        },
        {
          id: 'k2',
          type: 'dialogue',
          speaker: '我',
          expression: 'normal',
          position: 'left',
          background: 'bg_gate',
          text: '新学期的第一天……希望能有个好的开始。',
          goto: 'k3'
        },
        {
          id: 'k3',
          type: 'dialogue',
          speaker: '雫',
          expression: 'smile',
          position: 'right',
          background: 'bg_gate',
          text: '啊，不好意思！可以借过一下吗？我快迟到了！',
          goto: 'k4'
        },
        {
          id: 'k4',
          type: 'dialogue',
          speaker: '我',
          expression: 'normal',
          position: 'left',
          background: 'bg_gate',
          text: '（是个从没见过的女孩……）当然，请。',
          goto: 'k5'
        },
        {
          id: 'k5',
          type: 'choice',
          background: 'bg_gate',
          text: '要不要叫住她？',
          choices: [
            { label: '「等一下，你的书掉了！」', goto: 'k6a' },
            { label: '默默目送她离开', goto: 'k6b' }
          ]
        },
        {
          id: 'k6a',
          type: 'dialogue',
          speaker: '雫',
          expression: 'shy',
          position: 'right',
          background: 'bg_gate',
          text: '诶？啊……谢谢你！你人真好，我叫雫，请多指教！',
          variableOps: [{ varId: 'v_favor', op: 'add', value: 10 }],
          goto: 'k7'
        },
        {
          id: 'k6b',
          type: 'dialogue',
          speaker: '我',
          expression: 'normal',
          position: 'left',
          background: 'bg_gate',
          text: '（还是别打扰她了……）算了，快点去教室吧。',
          goto: 'k7'
        },
        {
          id: 'k7',
          type: 'transition',
          transition: { kind: 'fade', duration: 600 },
          background: 'bg_class',
          text: '——教室——',
          goto: 'k8'
        },
        {
          id: 'k8',
          type: 'dialogue',
          speaker: '雫',
          expression: 'smile',
          position: 'center',
          background: 'bg_class',
          text: '没想到我们居然是同班同学！这一定是命运的安排吧？',
          goto: 'k9'
        },
        {
          id: 'k9',
          type: 'dialogue',
          speaker: '我',
          expression: 'normal',
          position: 'center',
          background: 'bg_class',
          text: '看来，这将是个不平凡的春天。',
          goto: ''
        }
      ]
    ]
  }
}
