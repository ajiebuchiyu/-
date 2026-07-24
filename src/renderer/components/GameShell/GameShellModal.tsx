import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { ShellMenuAction } from '@shared/types'
import { useProjectStore } from '../../store/projectStore'
import { pickLocalAsset } from '../../lib/assetImport'

const ACTION_LABELS: Record<ShellMenuAction, string> = {
  start: '开始游戏',
  continue: '继续游戏',
  settings: '打开设置',
  credits: '制作名单'
}

/** 游戏外壳编辑器：开始界面 / 菜单 / 游戏内设置，全部可编辑。 */
export default function GameShellModal({ onClose }: { onClose: () => void }): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const updateShell = useProjectStore((s) => s.updateShell)
  const updateShellStart = useProjectStore((s) => s.updateShellStart)
  const updateShellSettings = useProjectStore((s) => s.updateShellSettings)
  const addShellMenuItem = useProjectStore((s) => s.addShellMenuItem)
  const updateShellMenuItem = useProjectStore((s) => s.updateShellMenuItem)
  const removeShellMenuItem = useProjectStore((s) => s.removeShellMenuItem)
  const addBackground = useProjectStore((s) => s.addBackground)
  const toast = useProjectStore((s) => s.toast)

  const shell = project.shell
  const [importing, setImporting] = useState(false)

  // 合并式更新外观（保留其他字段）
  const updateAppearance = (patch: Partial<NonNullable<typeof shell.start.appearance>>): void => {
    updateShellStart({ appearance: { ...(shell.start.appearance || {}), ...patch } })
  }

  const importStartBg = async (): Promise<void> => {
    setImporting(true)
    try {
      const r = await pickLocalAsset('image')
      if (!r) return
      const id = addBackground(`开始背景_${r.fileName}`, r.dataUrl)
      updateShellStart({ backgroundId: id })
      toast('已导入开始界面背景', 'success')
    } finally {
      setImporting(false)
    }
  }

  const startBg = project.backgrounds.find((b) => b.id === shell.start.backgroundId)

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center" onClick={onClose}>
      <div
        className="w-[660px] max-h-[86vh] overflow-y-auto bg-panel3 border border-edge rounded-xl shadow-2xl sf-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-edge sticky top-0 bg-panel3 z-10">
          <span className="text-xl">🎮</span>
          <div className="flex-1">
            <div className="font-bold">游戏界面 / 开始界面</div>
            <div className="text-[11px] text-inkdim">每个导出的游戏都会带上这个界面，这里全部可编辑</div>
          </div>
          <button onClick={onClose} className="text-inkdim hover:text-ink text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* 启用开关 */}
          <Row label="启用开始界面" hint="关闭后，导出的游戏将直接进入剧情">
            <Toggle checked={shell.enabled} onChange={(v) => updateShell({ enabled: v })} />
          </Row>

          {shell.enabled && (
            <>
              {/* 开始界面基础信息 */}
              <Section title="开始界面" icon="🚪">
                <Field label="大标题">
                  <input
                    value={shell.start.title}
                    onChange={(e) => updateShellStart({ title: e.target.value })}
                    className="w-full bg-panel2 border border-edge rounded px-2 py-1.5 text-sm outline-none focus:border-accent"
                    placeholder="默认沿用作品标题"
                  />
                </Field>
                <div className="flex gap-2 items-center mt-1">
                  <button
                    onClick={() => updateShellStart({ title: project.title })}
                    className="text-[11px] px-2 py-0.5 rounded bg-panel2 hover:bg-accent/25 text-inkdim"
                  >
                    回填为作品标题「{project.title}」
                  </button>
                </div>

                <Field label="副标题">
                  <input
                    value={shell.start.subtitle}
                    onChange={(e) => updateShellStart({ subtitle: e.target.value })}
                    className="w-full bg-panel2 border border-edge rounded px-2 py-1.5 text-sm outline-none focus:border-accent"
                  />
                </Field>

                <Field label="背景图">
                  <div className="flex gap-2 items-center">
                    <select
                      value={shell.start.backgroundId || ''}
                      onChange={(e) => updateShellStart({ backgroundId: e.target.value || null })}
                      className="flex-1 bg-panel2 border border-edge rounded px-2 py-1.5 text-sm outline-none focus:border-accent"
                    >
                      <option value="">（无图 · 使用渐变）</option>
                      {project.backgrounds.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={importStartBg}
                      disabled={importing}
                      className="shrink-0 text-xs px-2 py-1.5 rounded bg-accent/20 text-accent hover:bg-accent/30"
                    >
                      📁 导入新背景
                    </button>
                  </div>
                  {startBg?.image && (
                    <img src={startBg.image} alt="" className="mt-2 w-full h-24 object-cover rounded border border-edge" />
                  )}
                </Field>

                <Row label="显示「继续游戏」" hint="基于浏览器本地存档定位进度">
                  <Toggle checked={shell.start.showContinue} onChange={(v) => updateShellStart({ showContinue: v })} />
                </Row>
              </Section>

              {/* 开始界面外观自定义 */}
              <Section title="开始界面外观" icon="🎨">
                <Field label="标题颜色">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={shell.start.appearance?.titleColor || '#ffffff'}
                      onChange={(e) => updateAppearance({ titleColor: e.target.value })}
                      className="w-9 h-8 rounded border border-edge bg-panel2 cursor-pointer"
                    />
                    <input
                      value={shell.start.appearance?.titleColor || ''}
                      onChange={(e) => updateAppearance({ titleColor: e.target.value })}
                      placeholder="留空使用主题色"
                      className="flex-1 bg-panel2 border border-edge rounded px-2 py-1.5 text-sm outline-none focus:border-accent"
                    />
                    {shell.start.appearance?.titleColor && (
                      <button
                        onClick={() => updateAppearance({ titleColor: undefined })}
                        className="text-[11px] px-2 py-1.5 rounded bg-panel2 hover:bg-accent/25 text-inkdim shrink-0"
                      >
                        重置
                      </button>
                    )}
                  </div>
                </Field>

                <Slider
                  label="标题字号"
                  value={shell.start.appearance?.titleSize ?? 56}
                  min={28}
                  max={96}
                  onChange={(v) => updateAppearance({ titleSize: v })}
                  display={`${shell.start.appearance?.titleSize ?? 56} px`}
                />

                <Field label="标题 / 菜单布局">
                  <div className="flex gap-1">
                    {(['center', 'bottom', 'left'] as const).map((lay) => (
                      <button
                        key={lay}
                        onClick={() => updateAppearance({ layout: lay })}
                        className={`flex-1 py-1.5 rounded text-xs ${
                          (shell.start.appearance?.layout || 'center') === lay
                            ? 'bg-accent text-white'
                            : 'bg-panel2 text-inkdim'
                        }`}
                      >
                        {lay === 'center' ? '居中' : lay === 'bottom' ? '底部' : '左栏(RenPy式)'}
                      </button>
                    ))}
                  </div>
                </Field>

                <Row label="背景模糊" hint="给背景图加一层柔焦，让标题更清晰">
                  <Toggle
                    checked={!!shell.start.appearance?.bgBlur}
                    onChange={(v) => updateAppearance({ bgBlur: v })}
                  />
                </Row>
              </Section>

              {/* 菜单项 */}
              <Section title="菜单项" icon="📋" action={<MiniAdd onClick={addShellMenuItem} label="＋ 添加菜单项" />}>
                <div className="space-y-2">
                  {shell.start.menu.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 bg-panel2 border border-edge rounded px-2 py-1.5">
                      <input
                        value={m.label}
                        onChange={(e) => updateShellMenuItem(m.id, { label: e.target.value })}
                        className="flex-1 bg-transparent outline-none text-sm"
                        placeholder="菜单文字"
                      />
                      <select
                        value={m.action}
                        onChange={(e) => updateShellMenuItem(m.id, { action: e.target.value as ShellMenuAction })}
                        className="bg-panel3 border border-edge rounded px-1.5 py-1 text-xs"
                      >
                        {(Object.keys(ACTION_LABELS) as ShellMenuAction[]).map((a) => (
                          <option key={a} value={a}>
                            {ACTION_LABELS[a]}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => removeShellMenuItem(m.id)}
                        className="text-inkdim hover:text-red-400 text-xs px-1"
                        title="删除"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {shell.start.menu.length === 0 && (
                    <div className="text-xs text-inkdim text-center py-2">暂无菜单项，点上方「＋ 添加菜单项」</div>
                  )}
                </div>
              </Section>

              {/* 游戏内设置 */}
              <Section title="游戏内设置（默认值）" icon="⚙️">
                <Slider
                  label="文字速度"
                  value={shell.settings.textSpeed}
                  min={1}
                  max={10}
                  onChange={(v) => updateShellSettings({ textSpeed: v })}
                  display={`${shell.settings.textSpeed} / 10`}
                />
                <Slider
                  label="BGM 音量"
                  value={shell.settings.bgmVolume}
                  min={0}
                  max={100}
                  onChange={(v) => updateShellSettings({ bgmVolume: v })}
                  display={`${shell.settings.bgmVolume}%`}
                />
                <Slider
                  label="音效 / 语音 音量"
                  value={shell.settings.sfxVolume}
                  min={0}
                  max={100}
                  onChange={(v) => updateShellSettings({ sfxVolume: v })}
                  display={`${shell.settings.sfxVolume}%`}
                />
                <Row label="BGM 自动循环" hint="关闭则背景音乐只播放一次">
                  <Toggle checked={shell.settings.autoBgm} onChange={(v) => updateShellSettings({ autoBgm: v })} />
                </Row>

                {/* —— 常用项补齐 —— */}
                <Row label="自动阅读" hint="播完一句自动进入下一句">
                  <Toggle
                    checked={!!shell.settings.autoPlay}
                    onChange={(v) => updateShellSettings({ autoPlay: v })}
                  />
                </Row>
                <Slider
                  label="自动阅读间隔"
                  value={shell.settings.autoSpeed ?? 1600}
                  min={400}
                  max={4000}
                  onChange={(v) => updateShellSettings({ autoSpeed: v })}
                  display={`${((shell.settings.autoSpeed ?? 1600) / 1000).toFixed(1)} s`}
                />
                <Row label="显示立绘" hint="关闭后仅显示对话框（省资源 / 纯文字风）">
                  <Toggle
                    checked={shell.settings.showPortraits !== false}
                    onChange={(v) => updateShellSettings({ showPortraits: v })}
                  />
                </Row>
                <Row label="字幕底纹" hint="给对话框加半透明底色，提升可读性">
                  <Toggle
                    checked={shell.settings.subtitleBg !== false}
                    onChange={(v) => updateShellSettings({ subtitleBg: v })}
                  />
                </Row>
                <p className="text-[11px] text-inkdim mt-1">
                  玩家在游戏内打开「设置」时可实时调整以上选项，调整仅作用于本次游玩。
                </p>
              </Section>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-edge flex justify-end sticky bottom-0 bg-panel3">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md bg-accent/20 text-accent hover:bg-accent/30 text-sm"
          >
            完成
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ---------- 小组件 ----------

function Section({
  title,
  icon,
  children,
  action
}: {
  title: string
  icon: string
  children: React.ReactNode
  action?: React.ReactNode
}): JSX.Element {
  return (
    <div className="rounded-lg border border-edge/70 bg-panel p-3">
      <div className="flex items-center gap-2 mb-2">
        <span>{icon}</span>
        <span className="text-sm font-semibold">{title}</span>
        {action && <span className="ml-auto">{action}</span>}
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-[11px] text-inkdim">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <div className="text-xs text-inkdim mb-1">{label}</div>
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
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`}
      />
    </button>
  )
}

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
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
    </div>
  )
}

function MiniAdd({ onClick, label }: { onClick: () => void; label: string }): JSX.Element {
  return (
    <button onClick={onClick} className="text-[11px] px-2 py-0.5 rounded bg-panel2 hover:bg-accent/25 text-inkdim">
      {label}
    </button>
  )
}
