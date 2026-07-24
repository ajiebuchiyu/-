// ============================================================
// 多厂商 LLM 配置层
// 主流大模型大多兼容 OpenAI Chat Completions 协议（POST {baseURL}/chat/completions，
// Header: Authorization: Bearer <apiKey>），因此用统一结构管理，只需填 API Key 即可切换。
// ============================================================

export interface LLMPreset {
  id: string
  name: string
  baseURL: string // OpenAI 兼容根地址（末尾不带 /chat/completions）
  defaultModel: string
  models?: string[] // 常用模型列表（用于下拉选择；空则仅手填）
  keyHint: string // 去哪拿 key
  supportsJsonMode: boolean // 是否支持 response_format: json_object
  modelEditable: boolean // model 是否需用户填写（如火山方舟用接入点 ID）
}

/** 内置主流厂商（全部 OpenAI 兼容） */
export const LLM_PRESETS: LLMPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek 深度求索',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4-flash',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    keyHint: 'platform.deepseek.com → API Keys',
    supportsJsonMode: true,
    modelEditable: true
  },
  {
    id: 'volcengine',
    name: '火山方舟（豆包 Doubao）',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-pro-32k',
    models: ['doubao-pro-32k', 'doubao-pro-128k', 'doubao-lite-32k'],
    keyHint: 'console.volcengine.com/ark → API Key；model 处填「接入点 ID」或模型名',
    supportsJsonMode: true,
    modelEditable: true
  },
  {
    id: 'moonshot',
    name: '月之暗面 Kimi（Moonshot）',
    baseURL: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    keyHint: 'platform.moonshot.cn → API Keys',
    supportsJsonMode: true,
    modelEditable: true
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    models: ['glm-4-flash', 'glm-4-air', 'glm-4-plus', 'glm-4'],
    keyHint: 'open.bigmodel.cn → API Keys',
    supportsJsonMode: true,
    modelEditable: true
  },
  {
    id: 'dashscope',
    name: '通义千问（阿里 DashScope）',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen-long'],
    keyHint: 'dashscope.console.aliyun.com → API-KEY',
    supportsJsonMode: true,
    modelEditable: true
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    keyHint: 'platform.openai.com → API keys',
    supportsJsonMode: true,
    modelEditable: true
  },
  {
    id: 'custom',
    name: '自定义（任意 OpenAI 兼容端点）',
    baseURL: '',
    defaultModel: '',
    keyHint: '填入任意兼容 OpenAI /chat/completions 的 baseURL 与 model',
    supportsJsonMode: false,
    modelEditable: true
  }
]

export interface ProviderConfig {
  apiKey: string
  model: string
  baseURL: string // 允许覆盖 preset 默认
}

export interface LLMSettings {
  activeProvider: string // preset id
  providers: Record<string, ProviderConfig>
}

const STORAGE_KEY = 'storyforge_llm_settings'

export function getPreset(id: string): LLMPreset {
  return LLM_PRESETS.find((p) => p.id === id) || LLM_PRESETS[0]
}

export function loadLLMSettings(): LLMSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const s = JSON.parse(raw) as LLMSettings
      // 迁移：DeepSeek 旧模型名 → 新模型名
      const ds = s.providers['deepseek']
      if (ds && (ds.model === 'deepseek-chat' || ds.model === 'deepseek-coder')) {
        ds.model = 'deepseek-v4-flash'
        // 静默保存迁移后的配置
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
      }
      return s
    }
  } catch {
    /* ignore */
  }
  return { activeProvider: 'deepseek', providers: {} }
}

export function saveLLMSettings(s: LLMSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

/** 取得某厂商的有效配置（合并 preset 默认值） */
export function resolveProviderConfig(s: LLMSettings, id: string): ProviderConfig {
  const preset = getPreset(id)
  const saved = s.providers[id] || { apiKey: '', model: '', baseURL: '' }
  return {
    apiKey: saved.apiKey || '',
    model: saved.model || preset.defaultModel,
    baseURL: saved.baseURL || preset.baseURL
  }
}

/** 当前激活厂商的有效配置；未配置 apiKey 时 apiKey 为空（调用方据此降级 mock） */
export function getActiveLLM(): { id: string; preset: LLMPreset; config: ProviderConfig } {
  const s = loadLLMSettings()
  const id = s.activeProvider
  return { id, preset: getPreset(id), config: resolveProviderConfig(s, id) }
}

export function hasActiveKey(): boolean {
  const { config } = getActiveLLM()
  return !!config.apiKey && !!config.baseURL && !!config.model
}
