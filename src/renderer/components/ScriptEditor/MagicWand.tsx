import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ScriptCard } from '@shared/types'
import { useProjectStore } from '../../store/projectStore'
import { getAIProvider } from '../../ai/providers'

export default function MagicWand({ card }: { card: ScriptCard }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const insertCardAt = useProjectStore((s) => s.insertCardAt)
  const updateCard = useProjectStore((s) => s.updateCard)
  const setPortrait = useProjectStore((s) => s.setPortrait)
  const addAudioTrack = useProjectStore((s) => s.addAudioTrack)
  const cursor = useProjectStore((s) => s.cursor)
  const project = useProjectStore((s) => s.project)
  const toast = useProjectStore((s) => s.toast)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const rect = btnRef.current?.getBoundingClientRect()
    if (!rect) return
    // 菜单右对齐按钮右边缘，宽度 w-40 = 160px
    const left = Math.max(8, rect.right - 160)
    const top = rect.bottom + 6
    setPos({ top, left })

    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node
      // 生成中不允许外部点击关闭，避免误关进度提示
      if (loading) return
      if (!btnRef.current?.contains(target)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !loading) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, loading])

  const run = async (kind: string): Promise<void> => {
    // 延迟取适配器，确保始终反映最新配置（用户刚填完 Key 即生效）
    const ai = getAIProvider()
    setLoading(kind)
    const labelMap: Record<string, string> = {
      continue: 'AI 续写',
      portrait: 'AI 配图',
      voice: 'AI 配音',
      bgm: 'AI 生成背景乐'
    }
    toast(`🔄 ${labelMap[kind] || 'AI'} 生成中…（请稍候）`, 'info')
    try {
      if (kind === 'continue') {
        const history = project.scenes.flat().map((c) => `${c.speaker || ''}${c.text || ''}`)
        const text = await ai.continueScript({ history, speaker: card.speaker })
        const newId = insertCardAt(cursor.scene, cursor.card, 'dialogue')
        updateCard(newId, { text, speaker: card.speaker || '', expression: 'normal', position: 'center' })
        toast('✨ AI 已续写一句', 'success')
      } else if (kind === 'portrait') {
        const url = await ai.generatePortrait(`${card.speaker || '角色'} ${card.expression || ''}`)
        // 有角色 → 写入角色表情立绘；无角色（旁白等）→ 写入当前卡片的专属立绘覆盖
        if (card.speaker) {
          const ch = project.characters.find((c) => c.name === card.speaker)
          if (ch) {
            setPortrait(ch.id, card.expression || 'normal', url)
            toast(`✨ 已为「${card.speaker}」生成立绘`, 'success')
          } else {
            updateCard(card.id, { portraitOverride: url })
            toast(`✨ 已为此卡生成立绘`, 'success')
          }
        } else {
          updateCard(card.id, { portraitOverride: url })
          toast(`✨ 已为此卡生成立绘`, 'success')
        }
      } else if (kind === 'voice') {
        const voiceUrl = await ai.generateVoice(card.text || '', card.speaker)
        // 将生成的配音写入当前卡片的 voice 字段，预览时可播放
        updateCard(card.id, { voice: voiceUrl })
        toast('✨ 已生成配音并写入卡片', 'success')
      } else if (kind === 'bgm') {
        const bgmUrl = await ai.generateBGM(card.text || '场景配乐')
        // 创建 BGM 音轨并关联到当前卡片
        const trackId = addAudioTrack('bgm', `AI-BGM-${Date.now().toString(36).slice(-4)}`, bgmUrl)
        updateCard(card.id, { music: trackId })
        toast('✨ 已生成背景音乐并关联到当前卡片', 'success')
      }
    } catch {
      toast('AI 调用失败', 'error')
    } finally {
      setLoading(null)
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="opacity-0 group-hover:opacity-100 text-xs w-5 h-5 rounded flex items-center justify-center hover:bg-accent/30 text-accent transition"
        title="AI 魔法棒"
      >
        ✨
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            className="fixed w-40 bg-panel3 border border-edge rounded-lg shadow-xl py-1 z-[100] sf-pop"
            style={{ top: pos.top, left: pos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <WandItem loading={loading === 'continue'} onClick={() => run('continue')} icon="✍️" label="AI 续写" />
            <WandItem loading={loading === 'portrait'} onClick={() => run('portrait')} icon="🎨" label="AI 配图" />
            <WandItem loading={loading === 'voice'} onClick={() => run('voice')} icon="🎤" label="AI 配音" />
            <WandItem loading={loading === 'bgm'} onClick={() => run('bgm')} icon="🎼" label="AI 生成背景乐" />
          </div>,
          document.body
        )}

      {/* 常驻加载提示：屏幕底部居中，不依赖菜单是否打开 */}
      {loading &&
        createPortal(
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-panel3 border border-accent/40 shadow-2xl sf-pop">
            <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            <span className="text-sm text-ink">
              {loading === 'continue' && 'AI 续写生成中…'}
              {loading === 'portrait' && 'AI 配图生成中…'}
              {loading === 'voice' && 'AI 配音生成中…（合成语音）'}
              {loading === 'bgm' && 'AI 背景乐生成中…（合成音乐）'}
            </span>
          </div>,
          document.body
        )}
    </div>
  )
}

function WandItem({
  onClick,
  icon,
  label,
  loading
}: {
  onClick: () => void
  icon: string
  label: string
  loading: boolean
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full text-left px-3 py-1.5 text-sm hover:bg-panel2 flex items-center gap-2 disabled:opacity-50"
    >
      <span>{loading ? '⏳' : icon}</span>
      <span>{loading ? '生成中…' : label}</span>
    </button>
  )
}
