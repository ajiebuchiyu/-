import { mockProvider } from './mock'
import { chat } from './llmClient'
import { hasActiveKey } from './llmConfig'

/** 统一 AI 适配器接口（产品规范 §10） */
export interface AIProvider {
  continueScript(ctx: { history: string[]; speaker?: string }): Promise<string>
  generatePortrait(prompt: string): Promise<string> // 返回图片 DataURL / 路径
  generateBackground(prompt: string): Promise<string> // 返回图片 DataURL / 路径
  generateVoice(text: string, voiceId?: string): Promise<string> // 返回音频路径
  generateBGM(prompt: string): Promise<string> // 返回音频路径
}

// ---------- Stable Diffusion 接口（可选，留空则回退 mock 占位） ----------
const SD_KEY = 'storyforge_sd_endpoint'
export function getSDEndpoint(): string {
  return (typeof localStorage !== 'undefined' && localStorage.getItem(SD_KEY)) || ''
}
export function setSDEndpoint(url: string): void {
  if (typeof localStorage === 'undefined') return
  if (url) localStorage.setItem(SD_KEY, url.trim())
  else localStorage.removeItem(SD_KEY)
}

/** 调用本地/远程 Stable Diffusion（Automatic1111 风格 /sdapi/v1/txt2img），失败返回 null 回退 mock */
async function callStableDiffusion(prompt: string, portrait: boolean): Promise<string | null> {
  const endpoint = getSDEndpoint()
  if (!endpoint) return null
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, '')}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `${prompt}, ${portrait ? 'character portrait, full body' : 'scene background, environment'}, anime visual novel style, soft lighting`,
        negative_prompt: 'low quality, blurry, deformed, watermark',
        width: portrait ? 512 : 1024,
        height: portrait ? 768 : 576,
        steps: 20,
        cfg_scale: 7,
        sampler_index: 'Euler a'
      })
    })
    if (!res.ok) return null
    const data = await res.json()
    const b64 = data?.images?.[0]
    if (!b64) return null
    return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`
  } catch {
    return null
  }
}

const CONTINUE_SYSTEM = `你是专业的 GalGame / AVG 剧本作家。根据已有剧情，续写下一句自然、有代入感、贴合人设的台词或旁白。只输出这一句内容本身，不要解释、不要加引号、不要分段。`

/**
 * 真实 API 适配器。
 * 文本类能力（续写）统一走多厂商 LLM 配置层（DeepSeek / 火山方舟 / 月之暗面 …），
 * 只需在「设置 → AI 模型」里填 API Key 即可启用；未配置时自动回退 mock，保证首次启动零配置可用。
 * 图像 / 语音 / 音乐类能力接入的是各自的垂直服务（SD / TTS / Suno），当前统一回退 mock 占位。
 */
export const realProvider: AIProvider = {
  async continueScript(ctx) {
    if (!hasActiveKey()) return mockProvider.continueScript(ctx)
    const history = ctx.history.slice(-12).join('\n')
    const user = ctx.speaker
      ? `已有剧情：\n${history}\n\n请续写下一句，说话人「${ctx.speaker}」的台词。`
      : `已有剧情：\n${history}\n\n请续写下一句旁白或台词。`
    const res = await chat(
      [
        { role: 'system', content: CONTINUE_SYSTEM },
        { role: 'user', content: user }
      ],
      { temperature: 0.9, maxTokens: 200 }
    )
    if (!res.ok || !res.content) return mockProvider.continueScript(ctx)
    return res.content
  },

  generatePortrait: async (prompt) => (await callStableDiffusion(prompt, true)) || mockProvider.generatePortrait(prompt),
  generateBackground: async (prompt) => (await callStableDiffusion(prompt, false)) || mockProvider.generateBackground(prompt),
  generateVoice: (text, voiceId) => mockProvider.generateVoice(text, voiceId),
  generateBGM: (prompt) => mockProvider.generateBGM(prompt)
}

/**
 * 根据是否配置了有效的 AI Key 自动选择适配器：
 * 有 Key → 走真实多厂商 LLM；否则走 mock。无需任何环境变量切换。
 */
export function getAIProvider(): AIProvider {
  return hasActiveKey() ? realProvider : mockProvider
}
