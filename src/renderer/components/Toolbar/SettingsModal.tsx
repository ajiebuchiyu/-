import { useState, useEffect } from 'react'
import { useProjectStore } from '../../store/projectStore'
import {
  LLM_PRESETS,
  loadLLMSettings,
  saveLLMSettings,
  resolveProviderConfig,
  getPreset,
  type LLMSettings
} from '../../ai/llmConfig'
import { chatWith } from '../../ai/llmClient'
import { getSDEndpoint, setSDEndpoint } from '../../ai/providers'
import {
  SHORTCUT_DEFS,
  loadShortcuts,
  saveShortcuts,
  resetShortcuts,
  eventToCombo,
  comboSig,
  comboLabel,
  type ShortcutId,
  type ShortcutMap
} from '../../shortcuts'

export default function SettingsModal({ onClose }: { onClose: () => void }): JSX.Element {
  const project = useProjectStore((s) => s.project)
  const updateMeta = useProjectStore((s) => s.updateMeta)

  // ---- LLM 多厂商配置（localStorage 持久化）----
  const [settings, setSettings] = useState<LLMSettings>(() => loadLLMSettings())
  const preset = getPreset(settings.activeProvider)
  const config = resolveProviderConfig(settings, settings.activeProvider)

  const [testState, setTestState] = useState<'idle' | 'ing' | 'ok' | 'fail'>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [sdEndpoint, setSdEndpointState] = useState(getSDEndpoint())

  const onSdChange = (v: string): void => {
    setSdEndpointState(v)
    setSDEndpoint(v)
  }

  // ---- 快捷键：查看作用 + 重新绑定 ----
  const [bindings, setBindings] = useState<ShortcutMap>(() => loadShortcuts())
  const [editingId, setEditingId] = useState<ShortcutId | null>(null)
  const [conflictMsg, setConflictMsg] = useState('')

  // 进入编辑态后，捕获下一次按键作为新组合
  useEffect(() => {
    if (!editingId) return
    const onCapture = (e: KeyboardEvent): void => {
      // 捕获阶段优先于全局快捷键监听，避免重绑时触发原动作
      e.preventDefault()
      e.stopPropagation()
      const c = eventToCombo(e)
      if (!c) return // 单独的修饰键忽略，等待真正按键
      // 冲突检测：与其它动作比对
      const sig = comboSig(c)
      const clash = SHORTCUT_DEFS.find((d) => d.id !== editingId && comboSig(bindings[d.id]) === sig)
      if (clash) {
        const def = SHORTCUT_DEFS.find((d) => d.id === clash.id)!
        setConflictMsg(`该组合已被「${def.desc}」占用，请换一个`)
        return // 保持编辑态，让用户继续尝试
      }
      const next = { ...bindings, [editingId]: c }
      setBindings(next)
      saveShortcuts(next)
      setEditingId(null)
      setConflictMsg('')
    }
    window.addEventListener('keydown', onCapture, { capture: true })
    return () => window.removeEventListener('keydown', onCapture, { capture: true })
  }, [editingId, bindings])

  const startEdit = (id: ShortcutId): void => {
    setConflictMsg('')
    setEditingId(id)
  }
  const cancelEdit = (): void => {
    setEditingId(null)
    setConflictMsg('')
  }
  const resetOne = (id: ShortcutId): void => {
    const def = SHORTCUT_DEFS.find((d) => d.id === id)!
    const next = { ...bindings, [id]: { ...def.default } }
    setBindings(next)
    saveShortcuts(next)
  }
  const resetAll = (): void => {
    const def = resetShortcuts()
    setBindings(def)
    setConflictMsg('')
  }
  const isChanged = (id: ShortcutId): boolean => {
    const def = SHORTCUT_DEFS.find((d) => d.id === id)!
    return comboSig(bindings[id]) !== comboSig(def.default)
  }

  const keyOk = !!config.apiKey && !!config.baseURL && !!config.model

  const persist = (next: LLMSettings): void => {
    setSettings(next)
    saveLLMSettings(next)
  }

  const selectProvider = (id: string): void => {
    const existing = settings.providers[id]
    const p = getPreset(id)
    const nextProviders = { ...settings.providers }
    // 已有该厂商配置则保留；首次选择用 preset 默认值预填 model / baseURL
    if (!existing) nextProviders[id] = { apiKey: '', model: p.defaultModel, baseURL: p.baseURL }
    persist({ activeProvider: id, providers: nextProviders })
  }

  const updateField = (field: 'apiKey' | 'model' | 'baseURL', value: string): void => {
    const id = settings.activeProvider
    const cur = settings.providers[id] || { apiKey: '', model: '', baseURL: '' }
    persist({ ...settings, providers: { ...settings.providers, [id]: { ...cur, [field]: value } } })
  }

  const testConnection = async (): Promise<void> => {
    if (!keyOk) {
      setTestState('fail')
      setTestMsg('请先填写 API Key 与模型')
      return
    }
    setTestState('ing')
    setTestMsg('')
    const res = await chatWith(
      preset,
      config,
      [
        { role: 'system', content: '你是连接测试助手。' },
        { role: 'user', content: '请只回复 OK 两个字。' }
      ],
      { temperature: 0.2, maxTokens: 16 }
    )
    if (res.ok) {
      setTestState('ok')
      setTestMsg('连接成功：' + (res.content || '').slice(0, 40))
    } else {
      setTestState('fail')
      setTestMsg(res.error || '连接失败')
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-6 pt-[6vh] sf-overlay-in" onClick={onClose}>
      <div
        className="w-[540px] max-h-[85vh] flex flex-col bg-panel3 border border-edge rounded-xl sf-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 px-5 pt-5 pb-1 shrink-0">
          <h2 className="text-lg font-bold">⚙ 设置</h2>
          <button onClick={onClose} className="text-inkdim hover:text-ink text-xl leading-none">
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-5 min-h-0">

        {/* 故事标题 */}
        <label className="block text-sm text-inkdim mb-1">故事标题</label>
        <input
          value={project.title}
          onChange={(e) => updateMeta({ title: e.target.value })}
          className="w-full mb-4 bg-panel2 border border-edge rounded-md px-3 py-2 text-sm outline-none focus:border-accent"
        />

        {/* AI 模型配置 */}
        <div className="border-t border-edge pt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">🤖 AI 模型</h3>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${keyOk ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
            >
              {keyOk ? '已启用' : '未配置（AI 功能回退演示）'}
            </span>
          </div>
          <p className="text-xs text-inkdim mb-3 leading-relaxed">
            导入小说后由 AI 自动识别剧情与说话人并填入剧本。主流大模型均兼容 OpenAI 协议，
            <span className="text-ink">只需选择厂商并填入 API Key</span> 即可切换。
          </p>

          {/* 厂商选择 */}
          <label className="block text-xs text-inkdim mb-1">厂商</label>
          <select
            value={settings.activeProvider}
            onChange={(e) => selectProvider(e.target.value)}
            className="w-full mb-3 bg-panel2 border border-edge rounded-md px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {LLM_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* API Key */}
          <label className="block text-xs text-inkdim mb-1">API Key</label>
          <input
            type="password"
            value={config.apiKey}
            placeholder="粘贴你的 API Key"
            onChange={(e) => updateField('apiKey', e.target.value)}
            className="w-full mb-1 bg-panel2 border border-edge rounded-md px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {preset.id !== 'custom' && (
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault()
                window.open('https://' + preset.keyHint.split(' ')[0], '_blank')
              }}
              className="inline-block text-xs text-accent2 hover:underline mb-3"
            >
              如何获取 Key：{preset.keyHint}
            </a>
          )}
          {preset.id === 'custom' && (
            <p className="text-xs text-inkdim mb-3">填入任意兼容 OpenAI /chat/completions 的 Base URL 与模型名即可。</p>
          )}

          {/* 模型（可编辑厂商显示）*/}
          {preset.modelEditable && (
            <>
              <label className="block text-xs text-inkdim mb-1">模型名 / 接入点</label>
              {preset.models && preset.models.length > 0 ? (
                <>
                  <select
                    value={preset.models.includes(config.model) ? config.model : '__custom__'}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') updateField('model', '')
                      else updateField('model', e.target.value)
                    }}
                    className="w-full mb-2 bg-panel2 border border-edge rounded-md px-3 py-2 text-sm outline-none focus:border-accent"
                  >
                    {preset.models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                    <option value="__custom__">自定义…</option>
                  </select>
                  {!preset.models.includes(config.model) && (
                    <input
                      value={config.model}
                      placeholder="填入自定义模型名 / 接入点 ID"
                      onChange={(e) => updateField('model', e.target.value)}
                      className="w-full mb-3 bg-panel2 border border-edge rounded-md px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                  )}
                </>
              ) : (
                <input
                  value={config.model}
                  placeholder={preset.defaultModel}
                  onChange={(e) => updateField('model', e.target.value)}
                  className="w-full mb-3 bg-panel2 border border-edge rounded-md px-3 py-2 text-sm outline-none focus:border-accent"
                />
              )}
            </>
          )}

          {/* baseURL（自定义厂商显示）*/}
          {preset.id === 'custom' && (
            <>
              <label className="block text-xs text-inkdim mb-1">Base URL（不含 /chat/completions）</label>
              <input
                value={config.baseURL}
                placeholder="https://your-endpoint/v1"
                onChange={(e) => updateField('baseURL', e.target.value)}
                className="w-full mb-3 bg-panel2 border border-edge rounded-md px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </>
          )}

          {/* Stable Diffusion 接口（可选）*/}
          <div className="mt-3 pt-3 border-t border-edge/60">
            <label className="block text-xs text-inkdim mb-1">🎨 Stable Diffusion 地址（可选，留空则用渐变占位）</label>
            <input
              value={sdEndpoint}
              placeholder="http://127.0.0.1:7860"
              onChange={(e) => onSdChange(e.target.value)}
              className="w-full mb-1 bg-panel2 border border-edge rounded-md px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <p className="text-xs text-inkdim">
              填写本地/远程 SD 的 WebUI 地址（Automatic1111 的 /sdapi/v1/txt2img），即可让「AI 生成占位背景/立绘」产出真实图片；未填写时回退为渐变占位，保证零配置可用。
            </p>
          </div>

          {/* 测试连接 */}
          <button
            onClick={testConnection}
            disabled={testState === 'ing'}
            className="w-full h-9 rounded-md bg-accent/15 text-accent hover:bg-accent/25 text-sm font-medium disabled:opacity-50 transition"
          >
            {testState === 'ing' ? '连接测试中…' : '测试连接'}
          </button>
          {testMsg && (
            <p
              className={`text-xs mt-2 leading-relaxed whitespace-pre-line ${testState === 'ok' ? 'text-emerald-600' : 'text-rose-500'}`}
            >
              {testMsg}
            </p>
          )}
        </div>

        {/* 快捷键：查看作用 + 重新绑定 */}
        <div className="border-t border-edge pt-4 mt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">⌨ 快捷键</h3>
            <button
              onClick={resetAll}
              className="text-xs text-inkdim hover:text-ink px-2 py-0.5 rounded border border-edge hover:border-accent transition"
            >
              全部重置
            </button>
          </div>
          <p className="text-xs text-inkdim mb-3 leading-relaxed">
            点击「编辑」后按下新组合即可修改；与现有快捷键冲突时会提示。修改即时生效并自动保存。
          </p>

          <div className="space-y-1.5">
            {SHORTCUT_DEFS.map((d) => {
              const editing = editingId === d.id
              const chips = comboLabel(bindings[d.id])
              return (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-md hover:bg-panel2/60"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-ink truncate">{d.desc}</div>
                    <div className="text-[10px] text-inkdim">{d.group}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {editing ? (
                      <span className="px-2 py-1 rounded bg-accent/15 text-accent text-xs animate-pulse">
                        按下新按键…
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        {chips.map((k) => (
                          <kbd
                            key={k}
                            className="px-1.5 py-0.5 rounded bg-panel2 border border-edge text-[11px] text-inkdim shadow-sm"
                          >
                            {k}
                          </kbd>
                        ))}
                      </span>
                    )}
                    {editing ? (
                      <button
                        onClick={cancelEdit}
                        className="text-xs text-inkdim hover:text-ink px-2 py-1 rounded border border-edge"
                      >
                        取消
                      </button>
                    ) : (
                      <button
                        onClick={() => startEdit(d.id)}
                        className="text-xs text-accent2 hover:underline px-1"
                      >
                        编辑
                      </button>
                    )}
                    {!editing && isChanged(d.id) && (
                      <button
                        onClick={() => resetOne(d.id)}
                        className="text-xs text-inkdim hover:text-ink px-1"
                        title="恢复默认"
                      >
                        重置
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {conflictMsg && (
            <p className="text-xs mt-2 text-rose-500">{conflictMsg}</p>
          )}
        </div>

        {/* 其它信息 */}
        <div className="text-sm text-inkdim mt-4 space-y-2 border-t border-edge pt-3">
          <div className="flex justify-between">
            <span>数据持久化</span>
            <span>IndexedDB（Dexie）· 自动保存</span>
          </div>
          <div className="flex justify-between">
            <span>撤销栈</span>
            <span>≥ 100 步（Ctrl+Z / Ctrl+Y）</span>
          </div>
        </div>
        </div>
        </div>
    </div>
  )
}
