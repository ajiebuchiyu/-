import type { ScriptCard, VariableOp, Condition, ConditionOp, AffectionChange } from '@shared/types'
import { useProjectStore } from '../../store/projectStore'
import { pickLocalAsset } from '../../lib/assetImport'
import { OP_LIST, OP_LABELS } from '../../lib/conditions'

const WEATHER_OPTS: { v: NonNullable<ScriptCard['cardWeather']>; label: string }[] = [
  { v: 'none', label: '无' },
  { v: 'rain', label: '🌧 雨' },
  { v: 'snow', label: '❄ 雪' },
  { v: 'sakura', label: '🌸 樱花' },
  { v: 'star', label: '✨ 星空' }
]
const TIME_OPTS: { v: NonNullable<ScriptCard['cardTimeOfDay']>; label: string }[] = [
  { v: 'day', label: '☀ 白天' },
  { v: 'dusk', label: '🌆 黄昏' },
  { v: 'night', label: '🌙 夜晚' }
]

const POSITIONS = [
  { v: 'left', l: '左' },
  { v: 'center', l: '中' },
  { v: 'right', l: '右' }
]
const TRANSITIONS = ['fade', 'dissolve', 'slideLeft', 'slideRight', 'zoom', 'blinds']

export default function CardForm({ card }: { card: ScriptCard }): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const updateCard = useProjectStore((s) => s.updateCard)
  const set = (patch: Partial<ScriptCard>): void => updateCard(card.id, patch)
  const addBackground = useProjectStore((s) => s.addBackground)
  const addAudioTrack = useProjectStore((s) => s.addAudioTrack)
  const updateBackground = useProjectStore((s) => s.updateBackground)
  const updateAudioTrack = useProjectStore((s) => s.updateAudioTrack)
  const toast = useProjectStore((s) => s.toast)

  const speakerChar = project.characters.find((c) => c.name === card.speaker)
  const allCards = project.scenes.flat()
  const addVideo = useProjectStore((s) => s.addVideo)
  const updateVideo = useProjectStore((s) => s.updateVideo)

  // 导入本地文件并新建资源，再选中到当前卡片
  const importAndUseBackground = async (): Promise<void> => {
    const r = await pickLocalAsset('image')
    if (!r) return
    const id = addBackground(r.fileName, r.dataUrl)
    set({ background: id })
    toast('已导入并选用背景', 'success')
  }
  const importAndUseAudio = async (): Promise<void> => {
    const r = await pickLocalAsset('audio')
    if (!r) return
    const id = addAudioTrack('bgm', r.fileName, r.dataUrl)
    set({ music: id })
    toast('已导入并选用音乐', 'success')
  }
  // 单页专属立绘（覆盖角色表情）
  const setPortraitOverride = async (): Promise<void> => {
    const r = await pickLocalAsset('image')
    if (!r) return
    set({ portraitOverride: r.dataUrl })
    toast('已设置本页专属立绘', 'success')
  }
  const importAndUseVideo = async (): Promise<void> => {
    const r = await pickLocalAsset('video')
    if (!r) return
    const id = addVideo(r.fileName, r.dataUrl)
    set({ video: id })
    toast('已导入并选用视频', 'success')
  }
  // 本句语音配音（DataURL，随台词播放）
  const importVoice = async (): Promise<void> => {
    const r = await pickLocalAsset('audio')
    if (!r) return
    set({ voice: r.dataUrl })
    toast('已设置本句语音', 'success')
  }
  // 仅为已有背景/音轨补文件（不改选择）
  const fillBackgroundFile = async (id: string): Promise<void> => {
    const r = await pickLocalAsset('image')
    if (!r) return
    updateBackground(id, { image: r.dataUrl })
    toast('已导入背景图', 'success')
  }
  const fillAudioFile = async (id: string): Promise<void> => {
    const r = await pickLocalAsset('audio')
    if (!r) return
    updateAudioTrack(id, { src: r.dataUrl, name: r.fileName })
    toast('已导入音频', 'success')
  }

  return (
    <div className="space-y-3">
      {(card.type === 'dialogue' || card.type === 'portraitSwitch') && (
        <>
          <Field label="说话人">
            <select className="ff-select" value={card.speaker || ''} onChange={(e) => set({ speaker: e.target.value })}>
              <option value="">（旁白）</option>
              {project.characters.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="表情">
            <select
              className="ff-select"
              value={card.expression || 'normal'}
              onChange={(e) => set({ expression: e.target.value })}
            >
              {(speakerChar ? Object.keys(speakerChar.portraits) : ['normal']).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Field>
          <Field label="立绘位置">
            <div className="flex gap-1">
              {POSITIONS.map((p) => (
                <button
                  key={p.v}
                  onClick={() => set({ position: p.v as ScriptCard['position'] })}
                  className={`flex-1 py-1 rounded text-xs ${
                    (card.position || 'center') === p.v ? 'bg-accent text-white' : 'bg-panel3 text-inkdim'
                  }`}
                >
                  {p.l}
                </button>
              ))}
            </div>
          </Field>
          {/* 单页专属立绘：覆盖角色默认表情，用于单独更换某一页立绘 */}
          <Field label="本页专属立绘（可选）">
            <div className="flex items-center gap-1.5">
              <button
                onClick={setPortraitOverride}
                title="单独设置这一页的立绘"
                className="relative w-10 h-10 rounded overflow-hidden border border-edge shrink-0 hover:ring-2 hover:ring-accent/50"
              >
                {card.portraitOverride ? (
                  <img src={card.portraitOverride} alt="本页立绘" className="w-full h-full object-cover" />
                ) : (
                  <span className="block w-full h-full grid place-items-center text-[10px] text-inkdim">＋立绘</span>
                )}
              </button>
              {card.portraitOverride ? (
                <button
                  onClick={() => set({ portraitOverride: '' })}
                  className="text-[11px] text-red-400 hover:underline"
                >
                  移除本页立绘
                </button>
              ) : (
                <span className="text-[10px] text-inkdim">留空则使用角色当前表情</span>
              )}
            </div>
          </Field>
        </>
      )}

      {(card.type === 'dialogue' || card.type === 'choice' || card.text !== undefined) && (
        <Field label={card.type === 'choice' ? '提示文字' : '台词 / 旁白'}>
          <textarea
            className="ff-input min-h-[64px] resize-y"
            value={card.text || ''}
            onChange={(e) => set({ text: e.target.value })}
          />
        </Field>
      )}

      {/* 背景（大多数卡片可设置） */}
      <Field label="背景">
        <div className="flex gap-1">
          <select className="ff-select flex-1" value={card.background || ''} onChange={(e) => set({ background: e.target.value })}>
            <option value="">（不变）</option>
            {project.backgrounds.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => importAndUseBackground()}
            title="导入本地图片并新建背景"
            className="px-2 rounded bg-panel3 hover:bg-accent/20 text-inkdim hover:text-accent text-xs shrink-0"
          >
            📁 导入
          </button>
        </div>
        {card.background && project.backgrounds.find((b) => b.id === card.background && !b.image) && (
          <button
            onClick={() => card.background && fillBackgroundFile(card.background)}
            className="mt-1 text-[10px] text-accent2 hover:underline"
          >
            + 为该背景补充本地图片
          </button>
        )}
        {/* 每页独立的天气/时段（覆盖背景默认值） */}
        <div className="flex gap-1.5 mt-1">
          <select
            className="text-[11px] px-1.5 py-0.5 rounded bg-panel3 border border-edge outline-none"
            value={card.cardWeather ?? 'none'}
            onChange={(e) => set({ cardWeather: e.target.value as ScriptCard['cardWeather'] })}
            title="页面天气效果（独立于背景图设置）"
          >
            {WEATHER_OPTS.map((o) => (
              <option key={o.v} value={o.v}>{o.label}</option>
            ))}
          </select>
          <select
            className="text-[11px] px-1.5 py-0.5 rounded bg-panel3 border border-edge outline-none"
            value={card.cardTimeOfDay ?? 'day'}
            onChange={(e) => set({ cardTimeOfDay: e.target.value as ScriptCard['cardTimeOfDay'] })}
            title="页面时段（独立于背景图设置）"
          >
            {TIME_OPTS.map((o) => (
              <option key={o.v} value={o.v}>{o.label}</option>
            ))}
          </select>
        </div>
      </Field>

      {/* 视频 / 动态 CG */}
      {card.type === 'video' && (
        <>
          <Field label="视频片段">
            <div className="flex gap-1">
              <select className="ff-select flex-1" value={card.video || ''} onChange={(e) => set({ video: e.target.value })}>
                <option value="">（未选择）</option>
                {project.videos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <button
                onClick={importAndUseVideo}
                title="导入本地视频并新建片段"
                className="px-2 rounded bg-panel3 hover:bg-accent/20 text-inkdim hover:text-accent text-xs shrink-0"
              >
                📁 导入
              </button>
            </div>
          </Field>
          {(() => {
            const clip = project.videos.find((v) => v.id === card.video)
            if (!clip) return null
            return (
              <>
                <Field label="循环播放">
                  <button
                    onClick={() => updateVideo(clip.id, { loop: !clip.loop })}
                    className={`relative w-11 h-6 rounded-full transition-colors ${clip.loop ? 'bg-accent' : 'bg-panel2 border border-edge'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${clip.loop ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </Field>
                <Field label={`音量：${clip.volume ?? 80}`}>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={clip.volume ?? 80}
                    onChange={(e) => updateVideo(clip.id, { volume: Number(e.target.value) })}
                    className="w-full accent-[#7c5cff]"
                  />
                </Field>
                <Field label="字幕（可选）">
                  <textarea className="ff-input min-h-[48px] resize-y" value={card.text || ''} onChange={(e) => set({ text: e.target.value })} />
                </Field>
              </>
            )
          })()}
        </>
      )}

      {/* 音乐 */}
      {(card.type === 'music' || card.type === 'dialogue') && (
        <Field label="音乐 / 音效">
          <div className="flex gap-1">
            <select className="ff-select flex-1" value={card.music || ''} onChange={(e) => set({ music: e.target.value })}>
              <option value="">（不变）</option>
              {project.globalBgmId && (
                <option value={project.globalBgmId}>🌐 全局BGM: {project.audioTracks.find((a) => a.id === project.globalBgmId)?.name || '—'}</option>
              )}
              {project.audioTracks.map((a) => (
                <option key={a.id} value={a.id}>
                  [{a.type}] {a.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => importAndUseAudio()}
              title="导入本地音频并新建音轨"
              className="px-2 rounded bg-panel3 hover:bg-accent/20 text-inkdim hover:text-accent text-xs shrink-0"
            >
              📁 导入
            </button>
          </div>
          {card.music && project.audioTracks.find((a) => a.id === card.music && !a.src) && (
            <button
              onClick={() => card.music && fillAudioFile(card.music)}
              className="mt-1 text-[10px] text-accent2 hover:underline"
            >
              + 为该音轨补充本地音频
            </button>
          )}
        </Field>
      )}

      {/* 语音配音（对话卡专属） */}
      {card.type === 'dialogue' && (
        <Field label="语音配音（可选）">
          <div className="flex items-center gap-1.5">
            <button
              onClick={importVoice}
              title="导入本句台词的配音音频"
              className="px-3 py-1.5 rounded bg-panel3 hover:bg-accent/20 text-inkdim hover:text-accent text-xs"
            >
              🎙️ {card.voice ? '更换语音' : '导入语音'}
            </button>
            {card.voice && (
              <>
                <button
                  onClick={() => { const a = new Audio(card.voice); a.play().catch(() => {}) }}
                  className="px-2 py-1.5 rounded bg-panel3 hover:bg-accent/20 text-xs"
                  title="试听"
                >
                  ▶
                </button>
                <button onClick={() => set({ voice: '' })} className="text-[11px] text-red-400 hover:underline">
                  移除
                </button>
              </>
            )}
            {!card.voice && <span className="text-[10px] text-inkdim">随本句台词自动播放</span>}
          </div>
        </Field>
      )}

      {/* 本句转场（对话卡可选） */}
      {card.type === 'dialogue' && (
        <Field label="进入转场（可选）">
          <div className="flex gap-1">
            <select
              className="ff-select flex-1"
              value={card.transition?.kind || ''}
              onChange={(e) =>
                e.target.value
                  ? set({ transition: { kind: e.target.value, duration: card.transition?.duration ?? 500 } })
                  : set({ transition: undefined })
              }
            >
              <option value="">（无转场）</option>
              {TRANSITIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {card.transition && (
              <select
                className="ff-select w-24"
                value={card.transition.duration}
                onChange={(e) => set({ transition: { kind: card.transition!.kind, duration: Number(e.target.value) } })}
              >
                {[300, 500, 800, 1200, 2000].map((d) => (
                  <option key={d} value={d}>
                    {d}ms
                  </option>
                ))}
              </select>
            )}
          </div>
        </Field>
      )}

      {/* 转场 */}
      {card.type === 'transition' && (
        <>
          <Field label="转场类型">
            <select
              className="ff-select"
              value={card.transition?.kind || 'fade'}
              onChange={(e) => set({ transition: { kind: e.target.value, duration: card.transition?.duration ?? 500 } })}
            >
              {TRANSITIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`时长：${card.transition?.duration ?? 500} ms`}>
            <input
              type="range"
              min={100}
              max={3000}
              step={100}
              value={card.transition?.duration ?? 500}
              onChange={(e) =>
                set({ transition: { kind: card.transition?.kind || 'fade', duration: Number(e.target.value) } })
              }
              className="w-full accent-[#7c5cff]"
            />
          </Field>
        </>
      )}

      {/* 选项分支 */}
      {card.type === 'choice' && (
        <Field label="选项分支">
          <div className="space-y-2">
            {(card.choices || []).map((ch, i) => (
              <div key={i} className="p-2 rounded-lg bg-panel3 space-y-1">
                <input
                  className="ff-input"
                  value={ch.label}
                  placeholder="选项文字"
                  onChange={(e) => {
                    const choices = [...(card.choices || [])]
                    choices[i] = { ...choices[i], label: e.target.value }
                    set({ choices })
                  }}
                />
                <select
                  className="ff-select"
                  value={ch.goto}
                  onChange={(e) => {
                    const choices = [...(card.choices || [])]
                    choices[i] = { ...choices[i], goto: e.target.value }
                    set({ choices })
                  }}
                >
                  <option value="">跳转到…（默认下一张）</option>
                  {allCards
                    .filter((c) => c.id !== card.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.text?.slice(0, 16) || c.type} ({c.id.slice(-4)})
                      </option>
                    ))}
                </select>
                {/* 条件触发器：如果 [变量] [大于] [数值] 才显示该选项 */}
                <div className="pt-1 border-t border-edge/60">
                  <label className="flex items-center gap-1.5 text-[10px] text-inkdim cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!ch.condition}
                      onChange={(e) => {
                        const choices = [...(card.choices || [])]
                        choices[i] = e.target.checked
                          ? { ...choices[i], condition: { varId: project.variables[0]?.id || '', op: '>', value: 0 } }
                          : { ...choices[i], condition: undefined }
                        set({ choices })
                      }}
                    />
                    仅当条件成立时显示（分支逻辑）
                  </label>
                  {ch.condition && (
                    <div className="flex items-center gap-1 mt-1 text-[11px]">
                      <span className="text-inkdim shrink-0">如果</span>
                      <select
                        className="ff-select py-0.5"
                        value={ch.condition.varId}
                        onChange={(e) => {
                          const choices = [...(card.choices || [])]
                          choices[i] = { ...choices[i], condition: { ...ch.condition!, varId: e.target.value } as Condition }
                          set({ choices })
                        }}
                      >
                        {project.variables.length === 0 && <option value="">（无变量）</option>}
                        {project.variables.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                      <select
                        className="ff-select py-0.5 w-16"
                        value={ch.condition.op}
                        onChange={(e) => {
                          const choices = [...(card.choices || [])]
                          choices[i] = { ...choices[i], condition: { ...ch.condition!, op: e.target.value as ConditionOp } }
                          set({ choices })
                        }}
                      >
                        {OP_LIST.map((op) => (
                          <option key={op} value={op}>
                            {OP_LABELS[op]}
                          </option>
                        ))}
                      </select>
                      <input
                        className="ff-input py-0.5 w-14"
                        value={String(ch.condition.value)}
                        onChange={(e) => {
                          const raw = e.target.value
                          const val = project.variables.find((v) => v.id === ch.condition!.varId)?.type === 'number' ? Number(raw) || 0 : raw
                          const choices = [...(card.choices || [])]
                          choices[i] = { ...choices[i], condition: { ...ch.condition!, value: val } }
                          set({ choices })
                        }}
                      />
                    </div>
                  )}
                </div>
                {/* 好感度变化：选择此选项后各角色好感度的增减 */}
                <div className="pt-1 border-t border-edge/60">
                  <label className="flex items-center gap-1.5 text-[10px] text-inkdim cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!ch.affectionChanges && ch.affectionChanges.length > 0}
                      onChange={(e) => {
                        const choices = [...(card.choices || [])]
                        choices[i] = { ...choices[i], affectionChanges: e.target.checked ? [{ characterId: project.characters[0]?.id || '', delta: 0 }] : undefined }
                        set({ choices })
                      }}
                    />
                    设置好感度变化（❤️ 增加 / 💔 减少）
                  </label>
                  {ch.affectionChanges && ch.affectionChanges.length > 0 && (
                    <div className="space-y-1 mt-1">
                      {ch.affectionChanges.map((ac, ai) => (
                        <div key={ai} className="flex items-center gap-1 text-[11px]">
                          <select
                            className="ff-select py-0.5 flex-1 min-w-0"
                            value={ac.characterId}
                            onChange={(e) => {
                              const choices = [...(card.choices || [])]
                              const affs = [...(choices[i].affectionChanges || [])]
                              affs[ai] = { ...affs[ai], characterId: e.target.value }
                              choices[i] = { ...choices[i], affectionChanges: affs }
                              set({ choices })
                            }}
                          >
                            {project.characters.length === 0 && <option value="">（无角色）</option>}
                            {project.characters.map((ch2) => (
                              <option key={ch2.id} value={ch2.id}>
                                {ch2.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              const choices = [...(card.choices || [])]
                              const affs = [...(choices[i].affectionChanges || [])]
                              affs[ai] = { ...affs[ai], delta: (affs[ai].delta || 0) - 1 }
                              choices[i] = { ...choices[i], affectionChanges: affs }
                              set({ choices })
                            }}
                            className="w-6 h-6 rounded bg-red-500/15 text-red-400 hover:bg-red-500/25 text-xs font-bold shrink-0"
                            title="-1"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            className="ff-input py-0.5 w-14 text-center"
                            value={ac.delta ?? 0}
                            min={-99}
                            max={99}
                            onChange={(e) => {
                              const choices = [...(card.choices || [])]
                              const affs = [...(choices[i].affectionChanges || [])]
                              affs[ai] = { ...affs[ai], delta: Math.max(-99, Math.min(99, Number(e.target.value) || 0)) }
                              choices[i] = { ...choices[i], affectionChanges: affs }
                              set({ choices })
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const choices = [...(card.choices || [])]
                              const affs = [...(choices[i].affectionChanges || [])]
                              affs[ai] = { ...affs[ai], delta: (affs[ai].delta || 0) + 1 }
                              choices[i] = { ...choices[i], affectionChanges: affs }
                              set({ choices })
                            }}
                            className="w-6 h-6 rounded bg-pink-500/15 text-pink-400 hover:bg-pink-500/25 text-xs font-bold shrink-0"
                            title="+1"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const choices = [...(card.choices || [])]
                              const affs = [...(choices[i].affectionChanges || [])]
                              affs.splice(ai, 1)
                              choices[i] = { ...choices[i], affectionChanges: affs.length > 0 ? affs : undefined }
                              set({ choices })
                            }}
                            className="w-5 h-5 rounded text-[10px] text-inkdim hover:text-red-400 shrink-0"
                            title="移除"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      {/* 添加更多角色的好感度条目 */}
                      {project.characters.length > (ch.affectionChanges?.length || 0) && (
                        <button
                          type="button"
                          onClick={() => {
                            const choices = [...(card.choices || [])]
                            const usedIds = new Set((choices[i].affectionChanges || []).map((a) => a.characterId))
                            const nextChar = project.characters.find((c) => !usedIds.has(c.id))
                            if (!nextChar) return
                            const affs = [...(choices[i].affectionChanges || []), { characterId: nextChar.id, delta: 0 }]
                            choices[i] = { ...choices[i], affectionChanges: affs }
                            set({ choices })
                          }}
                          className="text-[10px] text-accent hover:underline w-full text-left pt-0.5"
                        >
                          ＋ 添加角色好感度
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => set({ choices: (card.choices || []).filter((_, j) => j !== i) })}
                  className="text-[10px] text-red-400 hover:underline"
                >
                  删除此选项
                </button>
              </div>
            ))}
            <button
              onClick={() => set({ choices: [...(card.choices || []), { label: '新选项', goto: '' }] })}
              className="w-full py-1.5 rounded-lg bg-panel3 hover:bg-accent/20 text-xs"
            >
              ＋ 添加选项
            </button>
          </div>
        </Field>
      )}

      {/* 变量操作 */}
      {(card.type === 'variableOp' || (card.variableOps && card.variableOps.length > 0)) && (
        <Field label="变量赋值">
          <div className="space-y-2">
            {(card.variableOps || []).map((op, i) => (
              <div key={i} className="flex gap-1 items-center">
                <select
                  className="ff-select flex-1"
                  value={op.varId}
                  onChange={(e) => updateOp(card, set, i, { varId: e.target.value })}
                >
                  <option value="">选择变量</option>
                  {project.variables.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <select
                  className="ff-select w-16"
                  value={op.op}
                  onChange={(e) => updateOp(card, set, i, { op: e.target.value as VariableOp['op'] })}
                >
                  <option value="set">=</option>
                  <option value="add">+</option>
                  <option value="sub">-</option>
                </select>
                <input
                  className="ff-input w-16"
                  value={String(op.value)}
                  onChange={(e) => updateOp(card, set, i, { value: Number(e.target.value) || e.target.value })}
                />
              </div>
            ))}
            <button
              onClick={() => set({ variableOps: [...(card.variableOps || []), { varId: '', op: 'add', value: 1 }] })}
              className="w-full py-1.5 rounded-lg bg-panel3 hover:bg-accent/20 text-xs"
            >
              ＋ 添加变量操作
            </button>
          </div>
        </Field>
      )}
    </div>
  )
}

function updateOp(
  card: ScriptCard,
  set: (patch: Partial<ScriptCard>) => void,
  i: number,
  patch: Partial<VariableOp>
): void {
  const ops = [...(card.variableOps || [])]
  ops[i] = { ...ops[i], ...patch }
  set({ variableOps: ops })
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <label className="block text-xs text-inkdim mb-1">{label}</label>
      {children}
    </div>
  )
}
