import { useEffect, useRef, useState } from 'react'
import * as PIXI from 'pixi.js'
import type { Project, ScriptCard, ShellMenuAction } from '@shared/types'
import { ParticleLayer, type Weather } from './effects/particles'
import { useProjectStore } from '../store/projectStore'
import { visibleChoices } from '../lib/conditions'
import { applyVarOpsCore } from '@shared/runtimeCore'

interface Props {
  project: Project
  startCardId?: string | null
  interactive?: boolean // 预览窗口可点击推进；编辑器内联仅展示当前卡片
  currentCardId?: string | null // 受控展示（编辑器用）
}

/** PixiJS 运行时：预览窗口与最终导出运行时共用同一套渲染语义。 */
export default function GameRuntime({ project, startCardId, interactive = true, currentCardId }: Props): JSX.Element {
  const selectCard = useProjectStore((s) => s.selectCard)
  const toast = useProjectStore((s) => s.toast)
  const hostRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<PIXI.Application | null>(null)
  const bgLayerRef = useRef<PIXI.Container | null>(null)
  const portraitLayerRef = useRef<PIXI.Container | null>(null)
  const particleRef = useRef<ParticleLayer | null>(null)
  const bgmRef = useRef<HTMLAudioElement | null>(null)
  const sfxRef = useRef<HTMLAudioElement | null>(null)
  const voiceRef = useRef<HTMLAudioElement | null>(null)
  const lastBgm = useRef<string>('')
  const lastSfx = useRef<string>('')
  const historyRef = useRef<{ speaker?: string; text: string }[]>([])

  const flat = project.scenes.flat()
  const byId = new Map(flat.map((c) => [c.id, c]))

  const [cardId, setCardId] = useState<string | null>(startCardId ?? flat[0]?.id ?? null)
  const activeId = interactive ? cardId : currentCardId ?? cardId
  const card = (activeId && byId.get(activeId)) || flat[0]

  // 缺失资源检测：被引用的背景 / 音乐在工程中已找不到时，给出非技术友好提示
  const missingAssets: { kind: string; name: string }[] = []
  if (card?.background && !project.backgrounds.find((b) => b.id === card.background)) {
    missingAssets.push({ kind: '背景图', name: card.background })
  }
  if (card?.music && !project.audioTracks.find((a) => a.id === card.music)) {
    missingAssets.push({ kind: '背景音乐', name: card.music })
  }
  if (project.globalBgmId && !project.audioTracks.find((a) => a.id === project.globalBgmId)) {
    missingAssets.push({ kind: '全局背景音乐', name: project.globalBgmId })
  }
  const videoClip = card?.video ? project.videos.find((v) => v.id === card.video) : undefined

  // 游戏外壳状态
  const shell = project.shell

  // 用 ref 保存最新状态，供 resize / Pixi ticker 等异步回调读取，避免闭包过期
  const stateRef = useRef({ card, project, shell, showPortraits: shell.settings.showPortraits !== false })
  stateRef.current = { card, project, shell, showPortraits: shell.settings.showPortraits !== false }
  const [started, setStarted] = useState(!interactive) // 非交互（编辑器内联）直接视为已开始
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [creditsOpen, setCreditsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [skipMode, setSkipMode] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [muted, setMuted] = useState(false)
  const [affectionToast, setAffectionToast] = useState<string | null>(null)

  const showStart = interactive && shell.enabled && !started

  // 当明确传入 startCardId（用户点「从此处预览」或 Ctrl+P 从指定位置打开）时，
  // 自动跳过标题画面，直接从该卡片开始播放
  useEffect(() => {
    if (interactive && startCardId && !started) {
      setCardId(startCardId)
      setStarted(true)
    }
    // 仅在 startCardId 首次到来时触发；started 变化后不再重复
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startCardId])

  // 变量运行态
  const varsRef = useRef<Record<string, number | boolean | string>>({})

  // 打字机
  const [typed, setTyped] = useState('')
  const [typingDone, setTypingDone] = useState(true)
  const typingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 初始化 Pixi
  useEffect(() => {
    if (!hostRef.current) return
    const host = hostRef.current
    const app = new PIXI.Application({
      width: host.clientWidth || 960,
      height: host.clientHeight || 600,
      backgroundColor: 0x0a0a12,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      resizeTo: host
    })
    host.appendChild(app.view as HTMLCanvasElement)
    appRef.current = app

    const bg = new PIXI.Container()
    const portrait = new PIXI.Container()
    const particles = new ParticleLayer()
    particles.resize(app.screen.width, app.screen.height)
    app.stage.addChild(bg, portrait, particles.container)
    bgLayerRef.current = bg
    portraitLayerRef.current = portrait
    particleRef.current = particles

    app.ticker.add((delta) => particles.update(delta))

    const renderScene = (): void => {
      const s = stateRef.current
      const c = s.card
      if (!c) return
      const bgData = s.project.backgrounds.find((b) => b.id === c.background)
      if (c.type === 'video') {
        bgLayerRef.current!.removeChildren()
        portraitLayerRef.current!.removeChildren()
        particleRef.current?.setWeather('none')
      } else {
        drawBackground(app, bgLayerRef.current!, bgData?.image, c.cardTimeOfDay ?? bgData?.timeOfDay)
        particleRef.current?.resize(app.screen.width, app.screen.height)
        particleRef.current?.setWeather((c.cardWeather ?? (bgData?.weather as Weather | undefined)) || 'none')
        if (s.showPortraits === false) portraitLayerRef.current!.removeChildren()
        else if (c.portraitOverride) drawOverridePortrait(portraitLayerRef.current!, app, c, c.portraitOverride)
        else drawPortrait(portraitLayerRef.current!, app, c, s.project)
      }
    }

    app.renderer.on('resize', renderScene)
    // 首次渲染由卡片 effect 触发，这里先画一帧避免初始化闪烁
    renderScene()

    return () => {
      app.renderer.off('resize', renderScene)
      app.destroy(true, { children: true })
      appRef.current = null
    }
  }, [])

  // 绘制当前卡片画面
  useEffect(() => {
    const app = appRef.current
    if (!app || !card) return

    // 应用变量操作（共享运行库核心，与导出游戏行为一致）
    applyVarOpsCore(varsRef.current, card.variableOps)

    // 视频卡片：无需背景/立绘，由 HTML <video> 覆盖层呈现
    if (card.type === 'video') {
      bgLayerRef.current!.removeChildren()
      portraitLayerRef.current!.removeChildren()
      particleRef.current?.setWeather('none')
    } else {
      const bg = project.backgrounds.find((b) => b.id === card.background)
      drawBackground(app, bgLayerRef.current!, bg?.image, card.cardTimeOfDay ?? bg?.timeOfDay)
      particleRef.current?.resize(app.screen.width, app.screen.height)
      particleRef.current?.setWeather((card.cardWeather ?? (bg?.weather as Weather | undefined)) || 'none')
      if (shell.settings.showPortraits === false) portraitLayerRef.current!.removeChildren()
      else if (card.portraitOverride) drawOverridePortrait(portraitLayerRef.current!, app, card, card.portraitOverride)
      else drawPortrait(portraitLayerRef.current!, app, card, project)
    }

    if (showStart) {
      // 开始界面期间静音
      bgmRef.current?.pause()
      sfxRef.current?.pause()
      voiceRef.current?.pause()
      lastBgm.current = ''
      lastSfx.current = ''
    } else if (interactive && !muted) {
      // 正式预览 / 运行：按卡片播放（编辑器内联预览不会自动响）
      playCardAudio(project, card, bgmRef.current, sfxRef.current, lastBgm, lastSfx, shell.settings)
      playCardVoice(project, card, voiceRef.current, shell.settings)
    } else {
      // 编辑器内联预览 / 用户手动静音：仅展示画面，不自动播放音频（否则导入音乐后会莫名响且无法停止）
      bgmRef.current?.pause()
      sfxRef.current?.pause()
      voiceRef.current?.pause()
      lastBgm.current = ''
      lastSfx.current = ''
    }

    // 历史记录（仅交互模式、已开始、对话/带文字卡片）
    if (interactive && started && !showStart && card.text && card.type !== 'choice') {
      const h = historyRef.current
      const lastEntry = h[h.length - 1]
      if (!lastEntry || lastEntry.text !== card.text || lastEntry.speaker !== card.speaker) {
        h.push({ speaker: card.speaker, text: card.text })
        if (h.length > 200) h.shift()
      }
    }
  }, [card, project, showStart, started, interactive, muted])

  // 打字机（仅对话/旁白，且已进入游戏）
  useEffect(() => {
    if (!card || card.type === 'choice' || !(card.type === 'dialogue' || card.text)) {
      setTyped('')
      setTypingDone(true)
      return
    }
    if (!started) {
      setTyped('')
      setTypingDone(true)
      return
    }
    const full = card.text || ''
    // 快进 / 编辑器内联预览直接显示完整文本，避免只闪现一个字就切走
    if (skipMode || !interactive) {
      setTyped(full)
      setTypingDone(true)
      return
    }
    const speed = shell.settings.textSpeed
    if (speed >= 10) {
      setTyped(full)
      setTypingDone(true)
      return
    }
    const delay = Math.max(8, (11 - speed) * 16)
    setTyped('')
    setTypingDone(false)
    let i = 0
    const timer = setInterval(() => {
      i++
      setTyped(full.slice(0, i))
      if (i >= full.length) {
        clearInterval(timer)
        typingTimerRef.current = null
        setTypingDone(true)
      }
    }, delay)
    typingTimerRef.current = timer
    return () => { clearInterval(timer); typingTimerRef.current = null }
  }, [card, started, shell.settings.textSpeed, skipMode, interactive])

  const isBlocked = (): boolean => menuOpen || settingsOpen || creditsOpen || historyOpen || showStart

  const advance = (): void => {
    if (!interactive || !card) return
    if (isBlocked()) return
    if (card.type === 'choice') return
    // 打字未完则先补全文字
    if (!typingDone && (card.type === 'dialogue' || card.text)) {
      if (typingTimerRef.current) { clearInterval(typingTimerRef.current); typingTimerRef.current = null }
      setTyped(card.text || '')
      setTypingDone(true)
      return
    }
    const next = card.goto && byId.has(card.goto) ? card.goto : flat[flat.indexOf(card) + 1]?.id
    if (next) setCardId(next)
    else setSkipMode(false) // 到结尾自动退出快进
  }

  // 快进模式：快速自动推进（遇选项 / 面板打开自动暂停）
  useEffect(() => {
    if (!interactive || !skipMode || !started) return
    if (isBlocked() || !card || card.type === 'choice') return
    const timer = setInterval(() => {
      const c = stateRef.current.card
      if (!c || c.type === 'choice') {
        setSkipMode(false)
        return
      }
      setTyped(c.text || '')
      setTypingDone(true)
      const next = c.goto && byId.has(c.goto) ? c.goto : flat[flat.indexOf(c) + 1]?.id
      if (next) setCardId(next)
      else setSkipMode(false)
    }, 140)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipMode, card, started, menuOpen, settingsOpen, creditsOpen, historyOpen, showStart, interactive])

  // 自动阅读：打字完成后等待间隔自动下一张
  useEffect(() => {
    if (!interactive || !started || skipMode) return
    if (!shell.settings.autoPlay || !typingDone) return
    if (isBlocked() || !card || card.type === 'choice') return
    const wait = Math.max(400, shell.settings.autoSpeed ?? 1600)
    const timer = setTimeout(() => {
      const c = stateRef.current.card
      if (!c || c.type === 'choice') return
      const next = c.goto && byId.has(c.goto) ? c.goto : flat[flat.indexOf(c) + 1]?.id
      if (next) setCardId(next)
    }, wait)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typingDone, card, skipMode, started, shell.settings.autoPlay, shell.settings.autoSpeed, menuOpen, settingsOpen, creditsOpen, historyOpen, showStart, interactive])

  // 全屏切换（对预览容器）
  const toggleFullscreen = (): void => {
    const el = hostRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      el.requestFullscreen().catch(() => {})
    }
  }
  useEffect(() => {
    const onFs = (): void => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  // 键盘推进（空格 / 回车）
  useEffect(() => {
    if (!interactive) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        advance()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, interactive, menuOpen, settingsOpen, creditsOpen, started, typingDone, showStart])

  const startGame = (mode: 'start' | 'continue'): void => {
    const target = mode === 'start' ? flat[0]?.id ?? null : startCardId ?? flat[0]?.id ?? null
    setCardId(target)
    setStarted(true)
    setMenuOpen(false)
    setSettingsOpen(false)
    setCreditsOpen(false)
  }

  const handleMenuAction = (action: ShellMenuAction): void => {
    switch (action) {
      case 'start':
        startGame('start')
        break
      case 'continue':
        startGame('continue')
        break
      case 'settings':
        setSettingsOpen(true)
        break
      case 'credits':
        setCreditsOpen(true)
        break
    }
  }

  // 音轨查找（供音频播放）
  const audioTracksById = new Map(project.audioTracks.map((a) => [a.id, a]))

  const chooseGoto = (goto: string, affections?: { characterId: string; delta: number }[]): void => {
    // 应用好感度变化到变量系统（变量存储各角色好感度值）
    if (affections && affections.length > 0) {
      const hints: string[] = []
      for (const af of affections) {
        const ch = project.characters.find((c) => c.id === af.characterId)
        if (!ch) continue
        const key = `affection_${af.characterId}`
        const prev = (varsRef.current[key] as number) ?? 0
        varsRef.current[key] = Math.max(0, prev + af.delta)
        // 构建提示文本：❤️陈娇娇+5  💔王瑾强-3
        if (af.delta > 0) hints.push(`❤️${ch.name}+${af.delta}`)
        else if (af.delta < 0) hints.push(`💔${ch.name}${af.delta}`)
      }
      // 弹出好感度变化提示，2 秒后自动消失
      if (hints.length > 0) {
        setAffectionToast(hints.join('  '))
        setTimeout(() => setAffectionToast(null), 2000)
      }
    }
    if (goto && byId.has(goto)) setCardId(goto)
    else advance()
  }

  const speakerColor = project.characters.find((c) => c.name === card?.speaker)?.color || '#5cc8ff'
  const startBg = project.backgrounds.find((b) => b.id === shell.start.backgroundId)
  const appearance = shell.start.appearance || {}
  const startStyle: React.CSSProperties = startBg?.image
    ? {
        backgroundImage: `url(${startBg.image})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: appearance.bgBlur ? 'blur(6px)' : undefined,
        transform: appearance.bgBlur ? 'scale(1.05)' : undefined // 遮盖模糊边缘
      }
    : { background: 'linear-gradient(135deg,#1a1130,#0d1a30 60%,#2a1a40)' }
  const startLayout = appearance.layout || 'center'

  // 开始界面 / 菜单 / 设置 叠层（interactive 时）
  if (showStart || (interactive && (menuOpen || settingsOpen || creditsOpen))) {
    return (
      <div ref={hostRef} className="relative w-full h-full flex items-center justify-center overflow-hidden">
        <audio ref={bgmRef} className="hidden" />
        <audio ref={sfxRef} className="hidden" />
        <audio ref={voiceRef} className="hidden" />
        {showStart && (
          <div className="absolute inset-0 z-0" style={startStyle} />
        )}
        {showStart && startLayout === 'left' && (
          <div className="absolute inset-0 z-10 flex">
            {/* 左侧菜单栏（RenPy 式） */}
            <div
              className="h-full w-[280px] flex flex-col justify-center gap-1 pl-10 pr-8"
              style={{ background: 'linear-gradient(90deg, rgba(8,9,16,.85) 0%, rgba(8,9,16,.6) 70%, transparent 100%)' }}
            >
              {shell.start.menu
                .filter((m) => (m.action === 'continue' && !shell.start.showContinue ? false : true))
                .map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handleMenuAction(m.action)}
                    className="text-left px-3 py-2.5 text-[17px] text-white/75 hover:text-white rounded-md transition-all hover:pl-5 hover:bg-white/5"
                    style={{ textShadow: '0 1px 4px rgba(0,0,0,.8)' }}
                  >
                    {m.label}
                  </button>
                ))}
            </div>
            {/* 右下标题区 */}
            <div className="flex-1 relative">
              <div className="absolute right-10 bottom-10 text-right">
                <div
                  className={`font-extrabold text-white drop-shadow-[0_2px_16px_rgba(0,0,0,.85)] ${
                    appearance.titleSize ? '' : 'text-4xl md:text-5xl'
                  }`}
                  style={{
                    color: appearance.titleColor || undefined,
                    fontSize: appearance.titleSize ? `${appearance.titleSize}px` : undefined,
                    lineHeight: 1.15
                  }}
                >
                  {shell.start.title || project.title}
                </div>
                {shell.start.subtitle && (
                  <div className="text-sm text-white/70 drop-shadow mt-2">{shell.start.subtitle}</div>
                )}
                <div className="text-xs text-white/40 mt-3">Powered by StoryForge</div>
              </div>
            </div>
          </div>
        )}
        {showStart && startLayout !== 'left' && (
          <div
            className={`absolute inset-0 z-10 bg-black/45 flex flex-col items-center gap-5 px-6 text-center ${
              startLayout === 'bottom' ? 'justify-end pb-16' : 'justify-center'
            }`}
          >
            <div
              className={`font-extrabold text-white drop-shadow-[0_2px_12px_rgba(0,0,0,.7)] ${
                appearance.titleSize ? '' : 'text-4xl md:text-5xl'
              }`}
              style={{
                color: appearance.titleColor || undefined,
                fontSize: appearance.titleSize ? `${appearance.titleSize}px` : undefined,
                lineHeight: 1.1
              }}
            >
              {shell.start.title || project.title}
            </div>
            {shell.start.subtitle && (
              <div className="text-base text-white/80 drop-shadow">{shell.start.subtitle}</div>
            )}
            <div className="flex flex-col gap-3 mt-2">
              {shell.start.menu
                .filter((m) => (m.action === 'continue' && !shell.start.showContinue ? false : true))
                .map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handleMenuAction(m.action)}
                    className="min-w-[260px] px-6 py-3 rounded-xl text-[#eef] text-base transition hover:scale-105"
                    style={{ background: 'rgba(30,31,46,.78)', border: '1px solid rgba(124,92,255,.55)' }}
                  >
                    {m.label}
                  </button>
                ))}
            </div>
          </div>
        )}
        {settingsOpen && <ShellSettingsPanel onClose={() => setSettingsOpen(false)} bgmRef={bgmRef} sfxRef={sfxRef} />}
        {creditsOpen && <ShellCreditsPanel onClose={() => setCreditsOpen(false)} project={project} />}
        {!showStart && menuOpen && (
          <div className="absolute inset-0 z-20 bg-black/60 flex items-center justify-center">
            <div className="w-[300px] bg-panel3 border border-edge rounded-xl p-4 flex flex-col gap-2 sf-pop">
              <div className="text-center font-bold mb-1">菜单</div>
              <button className="px-4 py-2 rounded-md bg-panel2 hover:bg-accent/25 text-sm" onClick={() => setMenuOpen(false)}>继续游戏</button>
              <button className="px-4 py-2 rounded-md bg-panel2 hover:bg-accent/25 text-sm" onClick={() => { setMenuOpen(false); setSettingsOpen(true) }}>设置</button>
              <button className="px-4 py-2 rounded-md bg-panel2 hover:bg-accent/25 text-sm" onClick={() => { setMenuOpen(false); setCreditsOpen(true) }}>制作名单</button>
              <button className="px-4 py-2 rounded-md bg-panel2 hover:bg-red-400/20 text-sm" onClick={() => { setStarted(false); setMenuOpen(false); setSettingsOpen(false); setCreditsOpen(false) }}>返回开始界面</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // 正常游戏画面
  return (
    <div ref={hostRef} className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
      <audio ref={bgmRef} className="hidden" />
      <audio ref={sfxRef} className="hidden" />
      <audio ref={voiceRef} className="hidden" />
      {/* 预览快捷静音 / 取消静音（解决「播放后停不掉」） */}
      {interactive && (
        <button
          onClick={() => setMuted((v) => !v)}
          className="absolute top-2 right-2 z-40 px-2.5 py-1 rounded-md bg-black/45 hover:bg-black/65 text-white text-xs backdrop-blur transition"
          title={muted ? '取消静音' : '静音 / 停止声音'}
        >
          {muted ? '🔇 已静音' : '🔊 声音'}
        </button>
      )}
      {/* 好感度变化提示（选择分支后弹出，2 秒自动消失） */}
      {affectionToast && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[45] px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500/90 to-purple-600/90 text-white text-sm font-medium shadow-lg backdrop-blur-sm sf-pop animate-[sf-pop_0.3s_ease-out]">
          {affectionToast}
        </div>
      )}
      {/* 底部渐变遮罩：让立绘与对话框自然融合（RenPy 视觉） */}
      {card && card.type !== 'video' && (
        <div
          className={`absolute left-0 right-0 bottom-0 z-[4] pointer-events-none ${interactive ? 'h-[38%]' : 'h-[22%]'}`}
          style={{ background: 'linear-gradient(to top, rgba(6,7,12,.72) 0%, rgba(6,7,12,.28) 55%, transparent 100%)' }}
        />
      )}
      {/* 缺失资源友好提示（非技术语境，替代 404） */}
      {card && missingAssets.length > 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 max-w-[92%] flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/95 text-white text-xs shadow-lg sf-pop">
          <span>⚠️</span>
          <span className="leading-snug">
            {missingAssets.map((m, i) => (
              <span key={i}>
                {i > 0 && '；'}
                找不到那{m.kind}「{m.name.slice(0, 12)}」了
              </span>
            ))}
            ，点此重新选择
          </span>
          <button
            onClick={() => {
              selectCard(card.id)
              toast('已选中该卡片，请在右侧检查器重新指定资源', 'info')
            }}
            className="ml-1 shrink-0 px-2 py-0.5 rounded bg-white/25 hover:bg-white/40 text-white text-xs"
          >
            重新选择
          </button>
        </div>
      )}
      {/* 视频 / 动态 CG 覆盖层（全屏自动播放） */}
      {videoClip && (
        <video
          key={card.id}
          src={videoClip.src}
          autoPlay
          loop={videoClip.loop !== false}
          muted
          playsInline
          onClick={interactive ? advance : undefined}
          className="absolute inset-0 w-full h-full object-cover z-[1]"
        />
      )}
      {/* 对话 UI 叠层（与 Pixi 画面同框，导出运行时保持一致语义） */}
      {card && (card.type === 'dialogue' || card.text) && card.type !== 'choice' && (
        <div
          onClick={advance}
          className={`absolute left-[5%] right-[5%] z-10 cursor-pointer ${
            interactive
              ? 'bottom-[4.5%] min-h-[128px] rounded-2xl px-7 py-5'
              : 'bottom-[2%] rounded-xl px-4 py-2'
          }`}
          style={
            shell.settings.subtitleBg === false
              ? { textShadow: '0 2px 6px rgba(0,0,0,.9)' }
              : {
                  background: 'linear-gradient(180deg, rgba(16,18,30,.72) 0%, rgba(10,12,20,.88) 100%)',
                  border: '1px solid rgba(124,92,255,.42)',
                  backdropFilter: 'blur(14px) saturate(1.25)',
                  boxShadow: '0 10px 36px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.07)'
                }
          }
        >
          {card.speaker && (
            <div
              className={`absolute rounded-lg font-bold ${
                interactive ? '-top-4 left-6 px-4 py-1 text-base' : '-top-3 left-4 px-2.5 py-0.5 text-xs'
              }`}
              style={{
                color: '#fff',
                background: `linear-gradient(135deg, ${speakerColor}e6, ${speakerColor}99)`,
                border: '1px solid rgba(255,255,255,.22)',
                boxShadow: '0 4px 14px rgba(0,0,0,.45)',
                textShadow: '0 1px 3px rgba(0,0,0,.6)',
                backdropFilter: 'blur(6px)'
              }}
            >
              {card.speaker}
            </div>
          )}
          <div
            className={`text-[#f0f0f4] whitespace-pre-wrap ${
              interactive ? 'text-[17px] leading-relaxed' : 'text-xs leading-snug'
            } ${card.speaker ? 'mt-2' : ''}`}
          >
            {typed}
          </div>
        </div>
      )}

      {card && card.type === 'choice' && (() => {
        const shown = visibleChoices(card.choices, varsRef.current)
        return (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/30">
            {card.text && <div className="text-white/80 mb-2">{card.text}</div>}
            {shown.length === 0 && (
              <div className="text-white/50 text-sm">（当前条件没有可用分支）</div>
            )}
            {shown.map((ch, i) => (
                <button
                  key={i}
                  onClick={() => chooseGoto(ch.goto, ch.affectionChanges)}
                  className="min-w-[320px] px-6 py-3 rounded-xl text-[#e6e6ea] text-base transition hover:scale-105"
                  style={{ background: 'rgba(30,31,38,.92)', border: '1px solid rgba(124,92,255,.5)' }}
                >
                  {ch.label}
                </button>
            ))}
          </div>
        )
      })()}

      {interactive && (
        <>
          <div className="absolute left-4 top-3 z-20 flex gap-1.5">
            <button
              onClick={() => setMenuOpen(true)}
              className="text-white/70 hover:text-white text-xl w-9 h-9 rounded-md bg-black/30 hover:bg-black/50 backdrop-blur-sm"
              title="菜单"
            >
              ≡
            </button>
            <button
              onClick={() => setHistoryOpen(true)}
              className="text-white/70 hover:text-white text-sm w-9 h-9 rounded-md bg-black/30 hover:bg-black/50 backdrop-blur-sm"
              title="历史记录"
            >
              📜
            </button>
            <button
              onClick={() => setSkipMode((v) => !v)}
              className={`text-sm w-9 h-9 rounded-md backdrop-blur-sm ${
                skipMode ? 'bg-accent/60 text-white' : 'bg-black/30 hover:bg-black/50 text-white/70 hover:text-white'
              }`}
              title={skipMode ? '停止快进' : '快进'}
            >
              ⏩
            </button>
            <button
              onClick={toggleFullscreen}
              className="text-white/70 hover:text-white text-sm w-9 h-9 rounded-md bg-black/30 hover:bg-black/50 backdrop-blur-sm"
              title={isFullscreen ? '退出全屏' : '全屏'}
            >
              {isFullscreen ? '🗗' : '⛶'}
            </button>
          </div>
          <div className="absolute right-6 bottom-3 text-white/40 text-xs z-10">
            {skipMode ? '快进中 ⏩ 点击按钮停止' : !typingDone ? '点击跳过 ▶' : '点击 / 空格继续 ▶'}
          </div>
        </>
      )}

      {/* 历史记录面板 */}
      {interactive && historyOpen && (
        <div className="absolute inset-0 z-30 bg-black/75 flex items-center justify-center" onClick={() => setHistoryOpen(false)}>
          <div
            className="w-[min(680px,90%)] h-[80%] bg-panel3 border border-edge rounded-xl p-5 flex flex-col gap-3 sf-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="font-bold">历史记录</div>
              <button className="text-inkdim hover:text-ink text-sm px-2" onClick={() => setHistoryOpen(false)}>✕ 关闭</button>
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
              {historyRef.current.length === 0 && <div className="text-inkdim text-sm text-center mt-8">暂无对话记录</div>}
              {historyRef.current.map((h, i) => (
                <div key={i} className="px-3 py-2 rounded-lg bg-panel2/70">
                  {h.speaker && <div className="text-xs font-bold text-accent2 mb-0.5">{h.speaker}</div>}
                  <div className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{h.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- 设置面板（局部状态，可保存为工程默认值） ----------

function ShellSettingsPanel({
  onClose,
  bgmRef,
  sfxRef
}: {
  onClose: () => void
  bgmRef: React.MutableRefObject<HTMLAudioElement | null>
  sfxRef: React.MutableRefObject<HTMLAudioElement | null>
}): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const updateShellSettings = useProjectStore((s) => s.updateShellSettings)
  const toast = useProjectStore((s) => s.toast)
  const selectCard = useProjectStore((s) => s.selectCard)
  const s = project.shell.settings
  const [textSpeed, setTextSpeed] = useState(s.textSpeed)
  const [bgmVolume, setBgmVolume] = useState(s.bgmVolume)
  const [sfxVolume, setSfxVolume] = useState(s.sfxVolume)
  const [voiceVolume, setVoiceVolume] = useState(s.voiceVolume ?? 80)
  const [autoBgm, setAutoBgm] = useState(s.autoBgm)
  const [showPortraits, setShowPortraits] = useState(s.showPortraits !== false)
  const [subtitleBg, setSubtitleBg] = useState(s.subtitleBg !== false)
  const [autoPlay, setAutoPlay] = useState(!!s.autoPlay)

  const apply = (): void => {
    bgmRef.current && (bgmRef.current.volume = bgmVolume / 100)
    sfxRef.current && (sfxRef.current.volume = sfxVolume / 100)
    bgmRef.current && (bgmRef.current.loop = autoBgm)
  }

  return (
    <div className="absolute inset-0 z-30 bg-black/70 flex items-center justify-center">
      <div className="w-[340px] bg-panel3 border border-edge rounded-xl p-5 flex flex-col gap-4 sf-pop">
        <div className="text-center font-bold">设置</div>
        <Slider label="文字速度" value={textSpeed} min={1} max={10} onChange={setTextSpeed} display={`${textSpeed} / 10`} />
        <Slider label="BGM 音量" value={bgmVolume} min={0} max={100} onChange={(v) => { setBgmVolume(v); bgmRef.current && (bgmRef.current.volume = v / 100) }} display={`${bgmVolume}%`} />
        <Slider label="音效音量" value={sfxVolume} min={0} max={100} onChange={(v) => { setSfxVolume(v); sfxRef.current && (sfxRef.current.volume = v / 100) }} display={`${sfxVolume}%`} />
        <Slider label="语音音量" value={voiceVolume} min={0} max={100} onChange={setVoiceVolume} display={`${voiceVolume}%`} />
        <Row label="BGM 自动循环">
          <Toggle checked={autoBgm} onChange={setAutoBgm} />
        </Row>
        <Row label="自动阅读">
          <Toggle checked={autoPlay} onChange={setAutoPlay} />
        </Row>
        <Row label="显示立绘">
          <Toggle checked={showPortraits} onChange={setShowPortraits} />
        </Row>
        <Row label="字幕底纹">
          <Toggle checked={subtitleBg} onChange={setSubtitleBg} />
        </Row>
        <div className="flex gap-2 mt-1">
          <button
            className="flex-1 px-3 py-2 rounded-md bg-panel2 hover:bg-accent/25 text-sm"
            onClick={onClose}
          >
            返回
          </button>
          <button
            className="flex-1 px-3 py-2 rounded-md bg-accent/20 text-accent hover:bg-accent/30 text-sm"
            onClick={() => {
              updateShellSettings({ textSpeed, bgmVolume, sfxVolume, voiceVolume, autoBgm, showPortraits, subtitleBg, autoPlay })
              toast('已保存为游戏默认设置', 'success')
            }}
          >
            保存为默认
          </button>
        </div>
      </div>
    </div>
  )
}

function ShellCreditsPanel({ onClose, project }: { onClose: () => void; project: Project }): JSX.Element {
  return (
    <div className="absolute inset-0 z-30 bg-black/80 flex items-center justify-center">
      <div className="w-[360px] bg-panel3 border border-edge rounded-xl p-6 flex flex-col items-center gap-4 sf-pop text-center">
        <div className="text-2xl font-extrabold">{project.title}</div>
        <div className="text-sm text-inkdim">制作名单</div>
        <div className="text-sm leading-relaxed text-ink">
          编剧 / 导演：{project.title} 的作者
          <br />
          使用 <span className="text-accent">StoryForge</span> 创作并导出
        </div>
        <div className="text-xs text-inkdim">角色 {project.characters.length} · 场景 {project.backgrounds.length} · 音轨 {project.audioTracks.length}</div>
        <button className="px-5 py-2 rounded-md bg-panel2 hover:bg-accent/25 text-sm" onClick={onClose}>
          返回
        </button>
      </div>
    </div>
  )
}

// ---------- 渲染辅助 ----------

function Slider({
  label,
  value,
  min,
  max,
  onChange,
  display
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  display: string
}): JSX.Element {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span className="text-accent2">{display}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-accent" />
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 text-sm">{label}</div>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-panel2 border border-edge'}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

const gradientCache = new Map<string, PIXI.Texture>()

function makeGradient(top: string, bottom: string, height: number): PIXI.Texture {
  const key = `${top}|${bottom}|${height}`
  if (gradientCache.has(key)) return gradientCache.get(key)!
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext('2d')!
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height)
  grad.addColorStop(0, top)
  grad.addColorStop(1, bottom)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const tex = PIXI.Texture.from(canvas)
  gradientCache.set(key, tex)
  return tex
}

function drawBackground(
  app: PIXI.Application,
  layer: PIXI.Container,
  image?: string,
  timeOfDay?: string
): void {
  layer.removeChildren()
  const W = app.screen.width
  const H = app.screen.height
  if (image) {
    try {
      const sprite = PIXI.Sprite.from(image)
      sprite.width = W
      sprite.height = H
      sprite.x = 0
      sprite.y = 0
      layer.addChild(sprite)
      return
    } catch {
      /* 加载失败则退回渐变 */
    }
  }
  const [top, bottom] =
    timeOfDay === 'night'
      ? ['#0d1030', '#1a1f4a']
      : timeOfDay === 'dusk'
        ? ['#3a2b5a', '#c56b8a']
        : ['#8fc7ff', '#dff0ff']
  const g = new PIXI.Sprite(makeGradient(top, bottom, H))
  g.width = W
  g.height = H
  g.x = 0
  g.y = 0
  layer.addChild(g)
}

/** 立绘淡入动画（250ms） */
function fadeIn(obj: PIXI.DisplayObject, duration = 250): void {
  obj.alpha = 0
  const start = performance.now()
  const step = (): void => {
    const t = Math.min(1, (performance.now() - start) / duration)
    obj.alpha = t
    if (t < 1 && !obj.destroyed) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

/** 立绘脚下椭圆投影：让立绘与背景视觉融合 */
function drawShadow(layer: PIXI.Container, x: number, y: number, width: number): void {
  const shadow = new PIXI.Graphics()
  shadow.beginFill(0x000000, 0.32)
  shadow.drawEllipse(x, y - 6, width * 0.42, 14)
  shadow.endFill()
  const blur = new PIXI.BlurFilter(8)
  shadow.filters = [blur]
  layer.addChild(shadow)
}

function drawPortrait(layer: PIXI.Container, app: PIXI.Application, card: ScriptCard, project: Project): void {
  layer.removeChildren()
  if (!card.speaker) return
  const ch = project.characters.find((c) => c.name === card.speaker)
  if (!ch) return
  const W = app.screen.width
  const H = app.screen.height
  const posX = card.position === 'left' ? W * 0.21 : card.position === 'right' ? W * 0.79 : W * 0.5
  const src = ch.portraits[card.expression || 'normal'] || Object.values(ch.portraits).find(Boolean)

  if (src) {
    try {
      const sp = PIXI.Sprite.from(src)
      // PIXI v7 异步加载：纹理就绪前 sprite 尺寸为 0，必须检测有效尺寸再使用
      const tex = sp.texture
      const isValid = tex.valid && (sp.width > 0 && sp.height > 0)
      if (isValid) {
        sp.anchor.set(0.5, 1)
        sp.x = posX
        sp.y = H
        const scale = (H * 0.8) / sp.height
        sp.scale.set(scale)
        drawShadow(layer, posX, H, sp.width)
        layer.addChild(sp)
        fadeIn(sp)
        return
      }
      // 纹理未就绪（dataURL 过大/跨域/格式不支持）→ 监听 loaded 回调重绘
      const baseTex = tex.baseTexture
      if (!baseTex.valid) {
        const onLoaded = (): void => {
          baseTex.off('loaded', onLoaded)
          baseTex.off('error', onError)
          if (tex.valid && sp.width > 0 && sp.height > 0) {
            sp.anchor.set(0.5, 1)
            sp.x = posX
            sp.y = H
            const sc = (H * 0.8) / sp.height
            sp.scale.set(sc)
            drawShadow(layer, posX, H, sp.width)
            layer.addChild(sp)
            fadeIn(sp)
          } else {
            // 加载完成但仍无效 → 降级为色块
            layer.removeChildren()
            drawPlaceholder(layer, ch, posX, H, W)
          }
        }
        const onError = (): void => {
          baseTex.off('loaded', onLoaded)
          baseTex.off('error', onError)
          layer.removeChildren()
          drawPlaceholder(layer, ch, posX, H, W)
        }
        baseTex.on('loaded', onLoaded)
        baseTex.on('error', onError)
        return // 等待异步加载，先不画占位
      }
    } catch {
      /* fallthrough */
    }
  }
  // 降级：色块占位立绘（图片缺失/加载失败时保证角色可见）
  drawPlaceholder(layer, ch, posX, H, W)
}

/** 绘制色块占位立绘 */
function drawPlaceholder(
  layer: PIXI.Container,
  ch: { name: string; color?: string },
  posX: number,
  H: number,
  W: number
): void {
  const color = parseInt((ch.color || '#7c5cff').slice(1), 16)
  const g = new PIXI.Graphics()
  const ph = H * 0.7
  const pw = Math.min(180, W * 0.2)
  g.beginFill(color, 0.9)
  g.drawRoundedRect(posX - pw / 2, H - ph, pw, ph, 20)
  g.endFill()
  const label = new PIXI.Text(ch.name, { fill: 0xffffff, fontSize: 22, fontWeight: 'bold' })
  label.anchor.set(0.5)
  label.x = posX
  label.y = H - ph + 40
  layer.addChild(g, label)
}

/** 单页专属立绘：直接用给定的 DataURL 绘制，覆盖角色默认表情 */
function drawOverridePortrait(layer: PIXI.Container, app: PIXI.Application, card: ScriptCard, src: string): void {
  layer.removeChildren()
  if (!src) return
  const W = app.screen.width
  const H = app.screen.height
  const posX = card.position === 'left' ? W * 0.21 : card.position === 'right' ? W * 0.79 : W * 0.5
  try {
    const sp = PIXI.Sprite.from(src)
    const tex = sp.texture
    if (tex.valid && sp.width > 0 && sp.height > 0) {
      sp.anchor.set(0.5, 1)
      sp.x = posX
      sp.y = H
      const scale = (H * 0.8) / sp.height
      sp.scale.set(scale)
      drawShadow(layer, posX, H, sp.width)
      layer.addChild(sp)
      fadeIn(sp)
      return
    }
    // 异步加载：纹理未就绪时监听事件
    const baseTex = tex.baseTexture
    if (!baseTex.valid) {
      const onLoaded = (): void => {
        baseTex.off('loaded', onLoaded)
        baseTex.off('error', onError)
        if (tex.valid && sp.width > 0 && sp.height > 0) {
          sp.anchor.set(0.5, 1)
          sp.x = posX
          sp.y = H
          const sc = (H * 0.8) / sp.height
          sp.scale.set(sc)
          drawShadow(layer, posX, H, sp.width)
          layer.addChild(sp)
          fadeIn(sp)
        }
      }
      const onError = (): void => { baseTex.off('loaded', onLoaded); baseTex.off('error', onError) }
      baseTex.on('loaded', onLoaded)
      baseTex.on('error', onError)
    }
  } catch {
    /* 忽略绘制失败 */
  }
}

/** 播放本句台词语音（card.voice 支持 DataURL / http / AudioTrack id 三种形式） */
function playCardVoice(
  project: Project,
  card: ScriptCard,
  voice: HTMLAudioElement | null,
  settings: { voiceVolume?: number; sfxVolume: number }
): void {
  if (!voice) return
  if (!card.voice) {
    voice.pause()
    return
  }
  let src = card.voice
  if (!src.startsWith('data:') && !/^https?:\/\//.test(src)) {
    const track = project.audioTracks.find((a) => a.id === src)
    if (!track?.src) {
      voice.pause()
      return
    }
    src = track.src
  }
  voice.volume = ((settings.voiceVolume ?? settings.sfxVolume ?? 80) / 100) || 0
  voice.loop = false
  voice.src = src
  voice.play().catch(() => {})
}

/** 播放当前卡片关联的音轨（本地导入的音频直接以 DataURL 播放；BGM / 音效分轨并应用独立音量）
 *
 * 优先级：
 *   1. card.music 有值 → 播放该音轨（单页覆盖）
 *   2. card.music 为空但 project.globalBgmId 有值 → 播放全局BGM（贯穿项目）
 *   3. 都没有 → 停止BGM
 */
function playCardAudio(
  project: Project,
  card: ScriptCard,
  bgm: HTMLAudioElement | null,
  sfx: HTMLAudioElement | null,
  lastBgm: { current: string },
  lastSfx: { current: string },
  settings: { bgmVolume: number; sfxVolume: number; autoBgm: boolean }
): void {
  // 确定有效音轨：先看卡片指定，再看全局BGM回退
  const cardTrack = card.music ? project.audioTracks.find((a) => a.id === card.music) : null
  const effectiveTrack = cardTrack || (project.globalBgmId ? project.audioTracks.find((a) => a.id === project.globalBgmId) : null)

  if (!effectiveTrack?.src) {
    // 无有效音轨：停止播放
    bgm?.pause()
    sfx?.pause()
    lastBgm.current = ''
    lastSfx.current = ''
    return
  }

  const isBgm = effectiveTrack.type === 'bgm'
  const el = isBgm ? bgm : sfx
  const last = isBgm ? lastBgm : lastSfx
  if (!el) return
  el.volume = ((isBgm ? settings.bgmVolume : settings.sfxVolume) / 100) || 0
  el.loop = isBgm ? settings.autoBgm : false
  if (last.current !== effectiveTrack.src) {
    last.current = effectiveTrack.src
    el.src = effectiveTrack.src
  }
  // 浏览器自动播放策略：若无用户手势可能被拦截，忽略即可
  el.play().catch(() => {})
}
