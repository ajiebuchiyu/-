import { useEffect, useRef, useState } from 'react'
import { CARD_TYPE_ICONS, CARD_TYPE_LABELS } from '@shared/types'
import type { CardType, Character, Background, AudioTrack, Variable, VideoClip } from '@shared/types'
import { useProjectStore } from '../../store/projectStore'
import { getAIProvider } from '../../ai/providers'
import { pickLocalAsset, pickLocalAssetsMulti } from '../../lib/assetImport'
import GameShellModal from '../GameShell/GameShellModal'
import VirtualList from '../common/VirtualList'
import { setAssetDrag } from '../../lib/assetDrop'

const STORY_ELEMENTS: CardType[] = ['dialogue', 'choice', 'bgSwitch', 'portraitSwitch', 'music', 'video', 'transition', 'variableOp']

const WEATHER_OPTS: { v: NonNullable<Background['weather']>; label: string }[] = [
  { v: 'none', label: '无' },
  { v: 'rain', label: '🌧 雨' },
  { v: 'snow', label: '❄ 雪' },
  { v: 'sakura', label: '🌸 樱花' },
  { v: 'star', label: '✨ 星空' }
]
const TIME_OPTS: { v: NonNullable<Background['timeOfDay']>; label: string }[] = [
  { v: 'day', label: '☀ 白天' },
  { v: 'dusk', label: '🌆 黄昏' },
  { v: 'night', label: '🌙 夜晚' }
]

export default function ResourceTree(): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const addCharacter = useProjectStore((s) => s.addCharacter)
  const removeCharacter = useProjectStore((s) => s.removeCharacter)
  const addBackground = useProjectStore((s) => s.addBackground)
  const removeBackground = useProjectStore((s) => s.removeBackground)
  const addAudioTrack = useProjectStore((s) => s.addAudioTrack)
  const addAudioTracks = useProjectStore((s) => s.addAudioTracks)
  const removeAudioTrack = useProjectStore((s) => s.removeAudioTrack)
  const addVideo = useProjectStore((s) => s.addVideo)
  const removeVideo = useProjectStore((s) => s.removeVideo)
  const applyBackgroundToCards = useProjectStore((s) => s.applyBackgroundToCards)
  const applyPortraitToCharacter = useProjectStore((s) => s.applyPortraitToCharacter)
  const insertCardAt = useProjectStore((s) => s.insertCardAt)
  const addVariable = useProjectStore((s) => s.addVariable)
  const removeVariable = useProjectStore((s) => s.removeVariable)
  const cursor = useProjectStore((s) => s.cursor)
  const toast = useProjectStore((s) => s.toast)
  const globalBgmId = useProjectStore((s) => s.globalBgmId)
  const setGlobalBgmId = useProjectStore((s) => s.setGlobalBgmId)
  const [shellOpen, setShellOpen] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)

  const genAIBackground = async (): Promise<void> => {
    setAiBusy(true)
    try {
      const url = await getAIProvider().generateBackground('校园黄昏操场，樱花飘落，柔和光线')
      const id = addBackground('AI占位背景', url)
      toast('🤖 已生成 AI 占位背景（可在设置中填写 Stable Diffusion 地址以生成真实图片）', 'success')
      void id
    } catch {
      toast('AI 生成背景失败', 'error')
    } finally {
      setAiBusy(false)
    }
  }

  const insert = (t: CardType): void => {
    insertCardAt(cursor.scene, cursor.card, t)
    toast(`已插入「${CARD_TYPE_LABELS[t]}」`, 'info')
  }

  // ---- 批量导入音频（按分类）----
  const batchImportAudio = async (type: 'bgm' | 'sfx'): Promise<void> => {
    const results = await pickLocalAssetsMulti('audio')
    if (results.length === 0) return
    const ids = addAudioTracks(type, results)
    toast(`已导入 ${results.length} 个${type === 'bgm' ? 'BGM' : '音效'}文件`, 'success')
    void ids
  }

  // ---- 单个导入音频（兼容原有入口）----
  const singleImportAudio = async (type: 'bgm' | 'sfx' | 'voice'): Promise<void> => {
    const r = await pickLocalAsset('audio')
    if (!r) return
    addAudioTrack(type, r.fileName, r.dataUrl)
    toast('已导入音频', 'success')
  }

  return (
    <div className="p-2 text-sm">
      {/* 游戏界面：开始界面 / 菜单 / 设置（可编辑，随导出生效） */}
      <Group title="游戏界面" icon="🎮" defaultOpen>
        <div className="px-1 pb-1">
          <button
            onClick={() => setShellOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-2 py-2 rounded-md bg-panel3 hover:bg-accent/25 text-xs transition mb-1.5"
          >
            <span>✏️</span>
            <span>编辑开始界面 / 菜单 / 设置</span>
          </button>
          <div className="flex items-center justify-between text-[10px] text-inkdim px-1">
            <span>{project.shell.enabled ? '已启用开始界面' : '已关闭（直接进入剧情）'}</span>
            <span className="truncate max-w-[120px]">{project.shell.start.title}</span>
          </div>
        </div>
      </Group>

      {/* 剧情元素（可拖入 / 点击插入） */}
      <Group title="剧情元素" icon="🧩" defaultOpen>
        <div className="grid grid-cols-2 gap-1.5 px-1 pb-1">
          {STORY_ELEMENTS.map((t) => (
            <button
              key={t}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('sf/card-type', t)}
              onClick={() => insert(t)}
              className="flex items-center gap-1 px-2 py-1.5 rounded-md bg-panel3 hover:bg-accent/25 text-xs transition"
              title="点击插入到光标处（或拖拽）"
            >
              <span>{CARD_TYPE_ICONS[t]}</span>
              <span className="truncate">{CARD_TYPE_LABELS[t]}</span>
            </button>
          ))}
        </div>
      </Group>

      {/* 角色：立绘 / 多表情 / 声线 */}
      <Group title="角色" icon="🧍" count={project.characters.length} defaultOpen onAdd={() => addCharacter()}>
        <VirtualList
          items={project.characters}
          itemKey={(c) => c.id}
          estimateSize={56}
          renderItem={(c) => (
            <CharacterBlock
              char={c}
              onRemove={() => removeCharacter(c.id)}
              onApplyPortrait={(expr) => applyPortraitToCharacter(c.id, expr)}
            />
          )}
        />
      </Group>

      {/* 场景：背景图 / 天气 / 昼夜 */}
      <Group title="场景" icon="🖼️" count={project.backgrounds.length} defaultOpen onAdd={() => addBackground()}>
        <div className="px-1 pb-1">
          <button
            onClick={genAIBackground}
            disabled={aiBusy}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-gradient-to-r from-accent to-accent2 text-white text-[11px] hover:opacity-90 disabled:opacity-50"
          >
            {aiBusy ? '⏳ 生成中…' : '🤖 AI 生成占位背景'}
          </button>
        </div>
        <VirtualList
          items={project.backgrounds}
          itemKey={(b) => b.id}
          estimateSize={70}
          renderItem={(b) => (
            <BackgroundBlock
              bg={b}
              onRemove={() => removeBackground(b.id)}
              onApply={(scope) => {
                applyBackgroundToCards(b.id, scope)
                toast('已引用该背景到其他页面', 'success')
              }}
            />
          )}
        />
      </Group>

      {/* 音轨：全局BGM + BGM / 音效 / 语音（分类导入、自动排序） */}
      <Group title="音轨" icon="🎵" count={project.audioTracks.length}>
        {/* ===== 全局背景音乐（贯穿整个项目）===== */}
        <div className="px-1 pb-2 border-b border-edge/50">
          <div className="text-[10px] text-inkdim mb-1 font-medium">🎼 全局背景音乐</div>
          <div className="text-[9px] text-inkdim/70 mb-1.5">设置后贯穿整个项目播放，单页可覆盖</div>
          <div className="flex items-center gap-1">
            <select
              className="ff-select flex-1 text-[11px]"
              value={globalBgmId || ''}
              onChange={(e) => setGlobalBgmId(e.target.value || null)}
            >
              <option value="">（不使用全局BGM）</option>
              {project.audioTracks
                .filter((a) => a.type === 'bgm')
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
            {globalBgmId && (
              <button
                onClick={() => setGlobalBgmId(null)}
                className="text-[10px] text-red-400 hover:text-red-300 px-1"
                title="清除全局BGM"
              >
                ✕
              </button>
            )}
          </div>
          {!globalBgmId && project.audioTracks.filter((a) => a.type === 'bgm').length === 0 && (
            <div className="text-[9px] text-inkdim/50 mt-1">先在下方 BGM 分组中导入音乐，再回来设置</div>
          )}
        </div>

        {/* ===== BGM 子组 ===== */}
        <AudioSubGroup
          label="🎵 背景音乐 (BGM)"
          type="bgm"
          tracks={project.audioTracks.filter((a) => a.type === 'bgm')}
          onBatchImport={() => batchImportAudio('bgm')}
          onSingleAdd={() => addAudioTrack('bgm')}
          onRemove={(id) => removeAudioTrack(id)}
        />

        {/* ===== 音效(SFX) 子组 ===== */}
        <AudioSubGroup
          label="🔊 音效 (SFX)"
          type="sfx"
          tracks={project.audioTracks.filter((a) => a.type === 'sfx')}
          onBatchImport={() => batchImportAudio('sfx')}
          onSingleAdd={() => addAudioTrack('sfx')}
          onRemove={(id) => removeAudioTrack(id)}
        />

        {/* ===== 语音 子组（保持简单，无批量导入按钮）===== */}
        <AudioSubGroup
          label="🎙️ 语音"
          type="voice"
          tracks={project.audioTracks.filter((a) => a.type === 'voice')}
          onBatchImport={undefined}
          onSingleAdd={() => addAudioTrack('voice')}
          onRemove={(id) => removeAudioTrack(id)}
        />
      </Group>

      {/* 视频 / 动态 CG */}
      <Group title="视频 / 动态CG" icon="🎬" count={project.videos.length} onAdd={() => addVideo()}>
        {project.videos.map((v) => (
          <VideoRow key={v.id} clip={v} onRemove={() => removeVideo(v.id)} onInsert={() => insertCardAt(cursor.scene, cursor.card, 'video')} />
        ))}
        <div className="flex gap-1 px-1 pt-1">
          <MiniAdd onClick={() => addVideo()} label="+空白" />
          <MiniAdd
            onClick={async () => {
              const r = await pickLocalAsset('video')
              if (r) {
                const clipId = addVideo(r.fileName, r.dataUrl)
                const cardId = insertCardAt(cursor.scene, cursor.card, 'video')
                useProjectStore.getState().updateCard(cardId, { video: clipId })
                toast('已导入视频并插入到当前页', 'success')
              }
            }}
            label="+导入本地"
          />
        </div>
      </Group>

      {/* 变量：Excel 式表格，类型/初值可编辑，可删除 */}
      <Group title="变量" icon="🔢" count={project.variables.length} onAdd={() => addVariable()}>
        <div className="px-2 pb-1.5 pt-0.5">
          {project.variables.length === 0 ? (
            <div className="text-[10px] text-inkdim py-1.5 px-1 leading-relaxed">
              还没有变量。点右上角 <span className="text-accent">＋</span> 新增「好感度」「金钱」等，无需理解 let/var 或作用域。
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_56px_66px_18px] gap-1 px-1 py-1 text-[10px] text-inkdim border-b border-edge/70">
                <span>名称</span>
                <span>类型</span>
                <span>初始值</span>
                <span />
              </div>
              <VirtualList
                items={project.variables}
                itemKey={(v) => v.id}
                estimateSize={34}
                threshold={40}
                renderItem={(v) => <VariableRow variable={v} onRemove={() => removeVariable(v.id)} />}
              />
            </>
          )}
        </div>
      </Group>

      {shellOpen && <GameShellModal onClose={() => setShellOpen(false)} />}
    </div>
  )
}

/* ---------------- 角色块：多表情编辑 ---------------- */
function CharacterBlock({
  char,
  onRemove,
  onApplyPortrait
}: {
  char: Character
  onRemove: () => void
  onApplyPortrait: (expr: string) => void
}): JSX.Element {
  const updateCharacter = useProjectStore((s) => s.updateCharacter)
  const addPortrait = useProjectStore((s) => s.addPortrait)
  const removePortrait = useProjectStore((s) => s.removePortrait)
  const renamePortrait = useProjectStore((s) => s.renamePortrait)
  const setPortrait = useProjectStore((s) => s.setPortrait)
  const toast = useProjectStore((s) => s.toast)
  const [expanded, setExpanded] = useState(false)
  const [applyExpr, setApplyExpr] = useState('normal')

  const keys = Object.keys(char.portraits || {})
  const cover = char.portraits.normal || (keys[0] ? char.portraits[keys[0]] : '')

  const pickFor = async (key: string): Promise<void> => {
    const r = await pickLocalAsset('image')
    if (!r) return
    setPortrait(char.id, key, r.dataUrl)
    toast(`已更新表情「${key}」`, 'success')
  }
  const addNew = async (): Promise<void> => {
    // 生成唯一 key
    let base = '表情'
    let n = 1
    let key = `${base}${n}`
    while (char.portraits[key]) key = `${base}${++n}`
    addPortrait(char.id, key)
    const r = await pickLocalAsset('image')
    if (r) setPortrait(char.id, key, r.dataUrl)
  }

  return (
    <div className="px-1 py-1 group">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          title="展开表情列表"
          className="relative w-7 h-7 rounded overflow-hidden border border-edge shrink-0 hover:ring-2 hover:ring-accent/50"
        >
          {cover ? (
            <img src={cover} alt={char.name} className="w-full h-full object-cover" />
          ) : (
            <span className="block w-full h-full" style={{ background: char.color || '#7c5cff' }} />
          )}
        </button>
        <input
          value={char.name}
          onChange={(e) => updateCharacter(char.id, { name: e.target.value })}
          className="flex-1 bg-transparent outline-none text-xs focus:text-accent2"
        />
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] text-inkdim hover:text-accent"
          title="表情"
        >
          {expanded ? '▾' : `😀×${keys.length}`}
        </button>
        <button
          onClick={onRemove}
          className="text-inkdim hover:text-red-400 text-xs"
          title="删除"
        >
          ✕
        </button>
      </div>

      {expanded && (
        <div className="pl-9 pr-1 pt-1 space-y-1">
          {keys.map((k) => (
            <div key={k} className="flex items-center gap-1.5">
              <button
                onClick={() => pickFor(k)}
                title="更换此表情图片"
                className="relative w-8 h-8 rounded overflow-hidden border border-edge shrink-0 hover:ring-2 hover:ring-accent/50"
              >
                {char.portraits[k] ? (
                  <img src={char.portraits[k]} alt={k} className="w-full h-full object-cover" />
                ) : (
                  <span className="block w-full h-full grid place-items-center text-[9px] text-inkdim">空</span>
                )}
                <span className="absolute inset-0 grid place-items-center text-[9px] text-white bg-black/40 opacity-0 hover:opacity-100">
                  📁
                </span>
              </button>
              <input
                value={k}
                onChange={(e) => {
                  const nv = e.target.value.trim()
                  if (nv && nv !== k) renamePortrait(char.id, k, nv)
                }}
                className="flex-1 bg-panel3 rounded px-1.5 py-0.5 outline-none text-[11px] focus:text-accent2"
              />
              {keys.length > 1 && (
                <button
                  onClick={() => removePortrait(char.id, k)}
                  className="text-inkdim hover:text-red-400 text-[11px]"
                  title="删除表情"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addNew}
            className="w-full text-[11px] py-1 rounded bg-panel3 hover:bg-accent/20 text-inkdim hover:text-accent"
          >
            ＋ 新增表情立绘
          </button>
          {/* 批量引用：把某表情应用到该角色的全部台词（页面立绘自动随角色变化） */}
          <div className="flex items-center gap-1 pt-0.5">
            <select
              value={applyExpr}
              onChange={(e) => setApplyExpr(e.target.value)}
              className="flex-1 text-[10px] px-1 py-0.5 rounded bg-panel3 border border-edge outline-none"
              title="选择要应用的表情"
            >
              {keys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                onApplyPortrait(applyExpr)
                toast(`已将「${applyExpr}」应用到 ${char.name} 的全部台词`, 'success')
              }}
              className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent hover:bg-accent/25 shrink-0"
              title="引用到该角色所有台词页"
            >
              应用到全部台词
            </button>
          </div>
        </div>
      )}
      {!expanded && (
        <div className="pl-9 text-[10px] text-inkdim">表情：{keys.join(' / ') || '—'}</div>
      )}
    </div>
  )
}

/* ---------------- 背景块：天气 / 昼夜 ---------------- */
function BackgroundBlock({
  bg,
  onRemove,
  onApply
}: {
  bg: Background
  onRemove: () => void
  onApply: (scope: 'all' | 'empty' | number) => void
}): JSX.Element {
  const updateBackground = useProjectStore((s) => s.updateBackground)
  const toast = useProjectStore((s) => s.toast)
  const sceneCount = useProjectStore((s) => s.project.scenes.length)
  const [applyOpen, setApplyOpen] = useState(false)
  const [sceneIdx, setSceneIdx] = useState(0)

  const importBgImage = async (): Promise<void> => {
    const r = await pickLocalAsset('image')
    if (!r) return
    updateBackground(bg.id, { image: r.dataUrl })
    toast('已导入背景图', 'success')
  }

  return (
    <div
      className="px-1 py-1 group cursor-grab active:cursor-grabbing"
      draggable
      onDragStart={(e) => setAssetDrag(e, { kind: 'background', id: bg.id })}
      title="拖拽到剧情卡片或节点上即可设置背景"
    >
      <div className="flex items-center gap-2">
        <button
          onClick={importBgImage}
          title="点击导入背景图（本地图片）"
          className="relative w-9 h-7 rounded overflow-hidden border border-edge shrink-0 hover:ring-2 hover:ring-accent/50"
        >
          {bg.image ? (
            <img src={bg.image} alt={bg.name} className="w-full h-full object-cover" />
          ) : (
            <span className="block w-full h-full grid place-items-center text-[10px] text-inkdim">图</span>
          )}
          <span className="absolute inset-0 grid place-items-center text-[10px] text-white bg-black/40 opacity-0 hover:opacity-100">
            📁
          </span>
        </button>
        <input
          value={bg.name}
          onChange={(e) => updateBackground(bg.id, { name: e.target.value })}
          className="flex-1 bg-transparent outline-none text-xs focus:text-accent2"
        />
        <button
          onClick={() => setApplyOpen((v) => !v)}
          className="text-[10px] text-inkdim hover:text-accent shrink-0"
          title="一键引用到其他页面"
        >
          引用…
        </button>
        <button
          onClick={onRemove}
          className="text-inkdim hover:text-red-400 text-xs"
          title="删除"
        >
          ✕
        </button>
      </div>
      {applyOpen && (
        <div className="mt-1 ml-11 p-1.5 rounded-md bg-panel2 border border-edge space-y-1">
          <div className="text-[10px] text-inkdim">把此背景引用到：</div>
          <button
            onClick={() => {
              onApply('all')
              setApplyOpen(false)
            }}
            className="block w-full text-left text-[11px] px-1.5 py-1 rounded hover:bg-accent/15"
          >
            全部页面
          </button>
          <button
            onClick={() => {
              onApply('empty')
              setApplyOpen(false)
            }}
            className="block w-full text-left text-[11px] px-1.5 py-1 rounded hover:bg-accent/15"
          >
            仅未设置背景的页面
          </button>
          {sceneCount > 1 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-inkdim">场景</span>
              <select
                value={sceneIdx}
                onChange={(e) => setSceneIdx(Number(e.target.value))}
                className="flex-1 text-[10px] px-1 py-0.5 rounded bg-panel3 border border-edge outline-none"
              >
                {Array.from({ length: sceneCount }).map((_, i) => (
                  <option key={i} value={i}>
                    第 {i + 1} 幕
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  onApply(sceneIdx)
                  setApplyOpen(false)
                }}
                className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent hover:bg-accent/25"
              >
                应用
              </button>
            </div>
          )}
        </div>
      )}
      <div className="flex gap-1.5 mt-1 pl-11">
        <select
          value={bg.weather ?? 'none'}
          onChange={(e) => updateBackground(bg.id, { weather: e.target.value as Background['weather'] })}
          className="text-[10px] px-1 py-0.5 rounded bg-panel3 border border-edge outline-none"
          title="默认天气（新卡片引用此背景时自动继承；单页可在右侧 Inspector 覆盖）"
        >
          {WEATHER_OPTS.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={bg.timeOfDay ?? 'day'}
          onChange={(e) => updateBackground(bg.id, { timeOfDay: e.target.value as Background['timeOfDay'] })}
          className="text-[10px] px-1 py-0.5 rounded bg-panel3 border border-edge outline-none"
          title="默认时段（新卡片引用此背景时自动继承；单页可在右侧 Inspector 覆盖）"
        >
          {TIME_OPTS.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

/* ---------------- 音轨行：时长 + 波形预览 ---------------- */
function AudioTrackRow({ track, onRemove }: { track: AudioTrack; onRemove: () => void }): JSX.Element {
  const updateAudioTrack = useProjectStore((s) => s.updateAudioTrack)
  const toast = useProjectStore((s) => s.toast)
  const [duration, setDuration] = useState<number | null>(null)
  const [peaks, setPeaks] = useState<number[] | null>(null)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // 解析时长 + 波形（AudioContext 解码后降采样为 ~32 根柱）
  useEffect(() => {
    let cancelled = false
    setDuration(null)
    setPeaks(null)
    if (!track.src) return
    // 时长（轻量：metadata）
    const el = new Audio()
    el.preload = 'metadata'
    el.src = track.src
    el.onloadedmetadata = () => {
      if (!cancelled && isFinite(el.duration)) setDuration(el.duration)
    }
    // 波形（可能较重，失败静默）
    ;(async () => {
      try {
        const resp = await fetch(track.src)
        const buf = await resp.arrayBuffer()
        const AC = window.AudioContext || (window as any).webkitAudioContext
        const ctx = new AC()
        const audioBuf = await ctx.decodeAudioData(buf)
        const data = audioBuf.getChannelData(0)
        const bars = 32
        const block = Math.floor(data.length / bars) || 1
        const out: number[] = []
        for (let i = 0; i < bars; i++) {
          let sum = 0
          for (let j = 0; j < block; j++) sum += Math.abs(data[i * block + j] || 0)
          out.push(sum / block)
        }
        const max = Math.max(...out, 0.0001)
        if (!cancelled) setPeaks(out.map((x) => x / max))
        ctx.close()
      } catch {
        /* 解码失败：仅显示时长 */
      }
    })()
    return () => {
      cancelled = true
      el.src = ''
    }
  }, [track.src])

  const importAudio = async (): Promise<void> => {
    const r = await pickLocalAsset('audio')
    if (!r) return
    updateAudioTrack(track.id, { src: r.dataUrl, name: r.fileName })
    toast('已导入音频', 'success')
  }

  const togglePlay = (): void => {
    if (!track.src) return
    if (!audioRef.current) audioRef.current = new Audio(track.src)
    const a = audioRef.current
    if (playing) {
      a.pause()
      setPlaying(false)
    } else {
      a.currentTime = 0
      a.play().catch(() => undefined)
      setPlaying(true)
      a.onended = () => setPlaying(false)
    }
  }

  const fmt = (s: number): string => {
    const m = Math.floor(s / 60)
    const sec = Math.round(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div
      className="px-1 py-1 group cursor-grab active:cursor-grabbing"
      draggable
      onDragStart={(e) => setAssetDrag(e, { kind: 'audio', id: track.id })}
      title="拖拽到剧情卡片或节点上即可设置音乐"
    >
      <div className="flex items-center gap-1.5">
        <button
          onClick={importAudio}
          title="点击导入音频文件（本地）"
          className="shrink-0 w-5 h-5 rounded grid place-items-center bg-panel3 hover:bg-accent/20 text-inkdim hover:text-accent text-[10px]"
        >
          📁
        </button>
        <span className="text-[10px] px-1 rounded bg-panel3 text-inkdim uppercase">{track.type}</span>
        <input
          value={track.name}
          onChange={(e) => updateAudioTrack(track.id, { name: e.target.value })}
          className="text-xs truncate flex-1 bg-transparent outline-none focus:text-accent2"
        />
        {track.src && (
          <button
            onClick={togglePlay}
            className="text-[11px] text-inkdim hover:text-accent"
            title={playing ? '停止' : '试听'}
          >
            {playing ? '⏸' : '▶'}
          </button>
        )}
        <button
          onClick={onRemove}
          className="text-inkdim hover:text-red-400 text-[11px]"
          title="删除"
        >
          ✕
        </button>
      </div>
      {track.src && (
        <div className="flex items-center gap-2 pl-6 mt-1">
          <div className="flex-1 h-6 flex items-center gap-[1px]">
            {peaks ? (
              peaks.map((p, i) => (
                <span
                  key={i}
                  className="flex-1 bg-accent/50 rounded-sm"
                  style={{ height: `${Math.max(8, p * 100)}%` }}
                />
              ))
            ) : (
              <span className="text-[10px] text-inkdim">▁▂▃ 波形分析中…</span>
            )}
          </div>
          <span className="text-[10px] text-inkdim tabular-nums w-8 text-right">
            {duration != null ? fmt(duration) : '—:—'}
          </span>
        </div>
      )}
    </div>
  )
}

/* ---------------- 音频子组：BGM / SFX / 语音（含批量导入按钮） ---------------- */
function AudioSubGroup({
  label,
  type,
  tracks,
  onBatchImport,
  onSingleAdd,
  onRemove
}: {
  label: string
  type: 'bgm' | 'sfx' | 'voice'
  tracks: AudioTrack[]
  onBatchImport?: () => void
  onSingleAdd: () => void
  onRemove: (id: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <div className="border-b border-edge/40 last:border-0 pb-1.5 mb-1.5 last:mb-0 last:pb-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 w-full px-1 py-1 text-[11px] font-medium hover:bg-panel3/50 rounded transition"
      >
        <span className="text-inkdim transition-transform duration-200 inline-block" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
        <span>{label}</span>
        <span className="text-[9px] text-inkdim">({tracks.length})</span>
      </button>
      {open && (
        <div className="px-1">
          {/* 批量导入 + 单个新增 */}
          <div className="flex gap-1 mb-1">
            {onBatchImport && (
              <button
                onClick={onBatchImport}
                className="flex-1 text-[10px] px-1.5 py-1 rounded bg-accent/15 text-accent hover:bg-accent/25 transition"
                title={`批量导入${type === 'bgm' ? 'BGM' : '音效'}文件（可多选）`}
              >
                📂 批量导入{type === 'bgm' ? 'BGM' : '音效'}
              </button>
            )}
            <MiniAdd onClick={onSingleAdd} label={`+${type === 'bgm' ? 'BGM' : type === 'sfx' ? '音效' : '语音'}`} />
          </div>
          {/* 音轨列表 */}
          {tracks.length === 0 ? (
            <div className="text-[9px] text-inkdim/50 py-2 text-center">暂无{type === 'bgm' ? '背景音乐' : type === 'sfx' ? '音效' : '语音'}，点击上方按钮导入</div>
          ) : (
            tracks.map((t) => <AudioTrackRow key={t.id} track={t} onRemove={() => onRemove(t.id)} />)
          )}
        </div>
      )}
    </div>
  )
}

/* ---------------- 视频行：动态 CG（本地 / 外链） ---------------- */
function VideoRow({ clip, onRemove, onInsert }: { clip: VideoClip; onRemove: () => void; onInsert: () => void }): JSX.Element {
  const updateVideo = useProjectStore((s) => s.updateVideo)
  const toast = useProjectStore((s) => s.toast)
  const [playing, setPlaying] = useState(false)
  const [urlOpen, setUrlOpen] = useState(false)
  const [url, setUrl] = useState('')

  const importVideo = async (): Promise<void> => {
    const r = await pickLocalAsset('video')
    if (!r) return
    updateVideo(clip.id, { src: r.dataUrl, name: r.fileName })
    toast('已导入视频', 'success')
  }
  const applyUrl = (): void => {
    if (!url.trim()) return
    updateVideo(clip.id, { src: url.trim() })
    setUrlOpen(false)
    setUrl('')
    toast('已设置外链视频', 'success')
  }
  const togglePlay = (): void => {
    const v = document.createElement('video')
    v.src = clip.src
    if (playing) {
      v.pause()
      setPlaying(false)
    } else {
      v.play().catch(() => undefined)
      setPlaying(true)
      v.onended = () => setPlaying(false)
    }
  }
  const isUrl = /^https?:\/\//i.test(clip.src || '')

  return (
    <div className="px-1 py-1 group">
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 w-5 h-5 rounded grid place-items-center bg-panel3 text-inkdim text-[10px]">🎬</span>
        <span className="text-[10px] px-1 rounded bg-panel3 text-inkdim uppercase">{isUrl ? '外链' : '本地'}</span>
        <input
          value={clip.name}
          onChange={(e) => updateVideo(clip.id, { name: e.target.value })}
          className="text-xs truncate flex-1 bg-transparent outline-none focus:text-accent2"
        />
        {clip.src && (
          <button onClick={togglePlay} className="text-[11px] text-inkdim hover:text-accent" title={playing ? '停止' : '试看'}>
            {playing ? '⏸' : '▶'}
          </button>
        )}
        <button onClick={onInsert} className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent hover:bg-accent/25" title="插入到当前页">
          插入
        </button>
        <button onClick={onRemove} className="text-inkdim hover:text-red-400 text-[11px]" title="删除">
          ✕
        </button>
      </div>
      <div className="flex items-center gap-1.5 pl-6 mt-1">
        <button onClick={importVideo} className="text-[10px] px-1.5 py-0.5 rounded bg-panel3 hover:bg-accent/20 text-inkdim hover:text-accent">
          📁 导入/更换
        </button>
        <button onClick={() => setUrlOpen((v) => !v)} className="text-[10px] px-1.5 py-0.5 rounded bg-panel3 hover:bg-accent/20 text-inkdim hover:text-accent">
          🔗 粘贴外链
        </button>
        {urlOpen && (
          <span className="flex-1 flex items-center gap-1">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://...mp4"
              className="flex-1 text-[10px] px-1 py-0.5 rounded bg-panel3 border border-edge outline-none"
            />
            <button onClick={applyUrl} className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent">
              确定
            </button>
          </span>
        )}
      </div>
      {clip.src && (
        <div className="pl-6 mt-1 text-[10px] text-inkdim truncate">
          {isUrl ? clip.src : `本地视频（${Math.round((clip.src.length * 0.75) / 1024)} KB）`}
        </div>
      )}
    </div>
  )
}

/* ---------------- 变量行：类型 / 初值 / 删除 ---------------- */
function VariableRow({ variable, onRemove }: { variable: Variable; onRemove: () => void }): JSX.Element {
  const updateVariable = useProjectStore((s) => s.updateVariable)

  const changeType = (t: Variable['type']): void => {
    // 切换类型时给出合理默认初值
    const initial = t === 'number' ? 0 : t === 'boolean' ? false : ''
    updateVariable(variable.id, { type: t, initial })
  }

  return (
    <div className="grid grid-cols-[1fr_56px_66px_18px] gap-1 items-center px-1 py-1 border-b border-edge/40 group last:border-0">
      <input
        value={variable.name}
        onChange={(e) => updateVariable(variable.id, { name: e.target.value })}
        className="min-w-0 bg-transparent outline-none text-xs focus:text-accent2"
        placeholder="变量名"
      />
      <select
        value={variable.type}
        onChange={(e) => changeType(e.target.value as Variable['type'])}
        className="text-[10px] px-1 py-0.5 rounded bg-panel3 border border-edge outline-none"
        title="变量类型"
      >
        <option value="number">数值</option>
        <option value="boolean">开关</option>
        <option value="string">文本</option>
      </select>
      {/* 初值编辑，随类型切换控件 */}
      {variable.type === 'boolean' ? (
        <button
          onClick={() => updateVariable(variable.id, { initial: !variable.initial })}
          className={`text-[10px] px-1.5 py-0.5 rounded ${variable.initial ? 'bg-accent/25 text-accent' : 'bg-panel3 text-inkdim'}`}
          title="初始值"
        >
          {variable.initial ? '真' : '假'}
        </button>
      ) : (
        <input
          type={variable.type === 'number' ? 'number' : 'text'}
          value={String(variable.initial)}
          onChange={(e) =>
            updateVariable(variable.id, {
              initial: variable.type === 'number' ? Number(e.target.value) || 0 : e.target.value
            })
          }
          className="w-full text-[10px] px-1 py-0.5 rounded bg-panel3 border border-edge outline-none text-accent2"
          title="初始值"
        />
      )}
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 text-inkdim hover:text-red-400 text-[11px] justify-self-center"
        title="删除变量"
      >
        ✕
      </button>
    </div>
  )
}

function Group({
  title,
  icon,
  count,
  children,
  defaultOpen,
  onAdd
}: {
  title: string
  icon: string
  count?: number
  children: React.ReactNode
  defaultOpen?: boolean
  onAdd?: () => void
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen ?? false)
  return (
    <div className="mb-1.5 border border-edge/70 rounded-xl overflow-hidden bg-panel2/50 shadow-sm sf-hoverable hover:shadow-card">
      <div className="flex items-center gap-1.5 px-2.5 py-2 sf-group-head">
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 flex-1 text-left">
          <span className="text-xs text-inkdim inline-block transition-transform duration-200" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
          <span>{icon}</span>
          <span className="text-xs font-medium">{title}</span>
          {count !== undefined && <span className="text-[10px] text-inkdim">({count})</span>}
        </button>
        {onAdd && (
          <button onClick={onAdd} className="text-inkdim hover:text-accent text-sm leading-none sf-tap" title="新增">
            ＋
          </button>
        )}
      </div>
      {open && <div className="py-1 sf-tab-in">{children}</div>}
    </div>
  )
}

function MiniAdd({ onClick, label }: { onClick: () => void; label: string }): JSX.Element {
  return (
    <button onClick={onClick} className="text-[10px] px-1.5 py-0.5 rounded bg-panel3 hover:bg-accent/25 text-inkdim">
      {label}
    </button>
  )
}
