import { useEffect, useState } from 'react'

const KEY = 'storyforge_onboarded'

export default function Onboarding(): JSX.Element | null {
  const [step, setStep] = useState(0)
  const [show, setShow] = useState(false)
  // 交互式新手村：用户在引导里亲手配置第一个对话节点
  const [speaker, setSpeaker] = useState('')
  const [line, setLine] = useState('')
  const [choices, setChoices] = useState<string[]>([])
  const [choiceInput, setChoiceInput] = useState('')

  useEffect(() => {
    if (!localStorage.getItem(KEY)) setShow(true)
  }, [])

  if (!show) return null

  const finish = (): void => {
    localStorage.setItem(KEY, '1')
    setShow(false)
  }

  const canNext =
    step === 0 ||
    (step === 1 && line.trim().length > 0) ||
    (step === 2 && choices.length > 0) ||
    step === 3

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 sf-overlay-in">
      <div className="w-[520px] max-w-full bg-panel3 border border-edge rounded-2xl p-6 sf-modal-in shadow-2xl">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl sf-breathe">🎮</span>
          <span className="text-sm font-semibold">新手村 · 5 分钟做出你的第一个节点</span>
          <button onClick={finish} className="ml-auto text-xs text-inkdim hover:text-ink">
            跳过
          </button>
        </div>

        {/* 步骤 0：欢迎 */}
        {step === 0 && (
          <div key="s0" className="text-center py-2 sf-tab-in">
            <div className="text-5xl mb-3 sf-breathe">👋</div>
            <h2 className="text-xl font-bold mb-2">欢迎来到 StoryForge</h2>
            <p className="text-sm text-inkdim leading-relaxed">
              写作就是创作 —— 你敲下的每个字都会即刻出现在玩家屏幕上。下面我们用一个小互动，带你走完「写一句台词 → 加一个分支」的完整流程。
            </p>
          </div>
        )}

        {/* 步骤 1：写台词 + 实时预览 */}
        {step === 1 && (
          <div key="s1" className="sf-tab-in">
            <h2 className="text-lg font-bold mb-1">① 写一句台词</h2>
            <p className="text-sm text-inkdim mb-3">在真正的编辑器里，这就是一张「对话卡片」。先给它起个说话人，再写内容：</p>
            <input
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
              placeholder="说话人（如：小樱）"
              className="w-full mb-2 bg-panel2 border border-edge rounded-md px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <textarea
              value={line}
              onChange={(e) => setLine(e.target.value)}
              placeholder="写下这一句台词……"
              rows={2}
              className="w-full bg-panel2 border border-edge rounded-md px-3 py-2 text-sm outline-none focus:border-accent resize-none"
            />
            {/* 实时预览：模拟玩家看到的画面 */}
            <div className="mt-3 rounded-xl overflow-hidden border border-edge">
              <div className="h-28 bg-gradient-to-b from-[#8fc7ff] to-[#dff0ff] relative flex items-end p-3">
                <div className="w-full rounded-xl bg-black/70 text-white px-4 py-2 text-sm">
                  {speaker && <div className="font-bold text-xs mb-0.5 text-amber-200">{speaker}</div>}
                  <div className="whitespace-pre-wrap">{line || '（你的台词会显示在这里）'}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 步骤 2：加分支 */}
        {step === 2 && (
          <div key="s2" className="sf-tab-in">
            <h2 className="text-lg font-bold mb-1">② 给剧情加一个分支</h2>
            <p className="text-sm text-inkdim mb-3">视觉小说离不开选择。添加 1~3 个选项，它们会像游戏里一样成为可点击的按钮：</p>
            <div className="flex gap-2 mb-2">
              <input
                value={choiceInput}
                onChange={(e) => setChoiceInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && choiceInput.trim()) {
                    setChoices((c) => [...c, choiceInput.trim()])
                    setChoiceInput('')
                  }
                }}
                placeholder="输入一个选项，回车添加"
                className="flex-1 bg-panel2 border border-edge rounded-md px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button
                onClick={() => {
                  if (choiceInput.trim()) {
                    setChoices((c) => [...c, choiceInput.trim()])
                    setChoiceInput('')
                  }
                }}
                className="px-3 py-2 rounded-md sf-btn-primary text-sm"
              >
                添加
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {choices.length === 0 && <div className="text-xs text-inkdim">还没有选项，添加一个试试～</div>}
              {choices.map((c, i) => (
                <div
                  key={i}
                  className="px-4 py-2.5 rounded-xl text-sm text-white"
                  style={{ background: 'rgba(30,31,38,.92)', border: '1px solid rgba(124,92,255,.5)' }}
                >
                  {c}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 步骤 3：总结 */}
        {step === 3 && (
          <div key="s3" className="text-center py-2 sf-tab-in">
            <div className="text-5xl mb-3 sf-scale-in">🎉</div>
            <h2 className="text-xl font-bold mb-2">你已学会制作第一个节点！</h2>
            <p className="text-sm text-inkdim leading-relaxed mb-3">
              你刚刚配置的：
            </p>
            <div className="text-left text-sm bg-panel2 border border-edge rounded-lg p-3 mb-3 space-y-1">
              <div>💬 台词：{line ? `「${line}」` : '（未填写）'} {speaker && <span className="text-inkdim">— {speaker}</span>}</div>
              <div>🔀 分支：{choices.length > 0 ? choices.map((c) => `「${c}」`).join('、') : '（无）'}</div>
            </div>
            <p className="text-xs text-inkdim">
              在真正的编辑器里，这些都会变成可拖拽、可连线的卡片与剧情树。现在，去创作吧！
            </p>
          </div>
        )}

        {/* 步骤指示 */}
        <div className="flex justify-center gap-1.5 my-4">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`h-2 rounded-full transition-all duration-300 ${i === step ? 'bg-accent w-5' : 'bg-edge w-2'}`} />
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => setStep((v) => Math.max(0, v - 1))}
            disabled={step === 0}
            className="text-xs text-inkdim hover:text-ink disabled:opacity-30"
          >
            ← 上一步
          </button>
          <button
            onClick={() => (step === 3 ? finish() : setStep((v) => v + 1))}
            disabled={!canNext}
            className="px-5 py-2 rounded-lg sf-btn-primary text-sm disabled:opacity-40"
          >
            {step === 3 ? '开始创作 ✨' : '下一步 →'}
          </button>
        </div>
      </div>
    </div>
  )
}
