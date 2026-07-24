import type { AIChatMessage, AIChatRequest, AIChatResponse } from '@shared/types'
import { getActiveLLM, type LLMPreset, type ProviderConfig } from './llmConfig'

/**
 * 统一 LLM 调用入口。
 * - 桌面版：走 window.storyforge.aiChat（主进程 fetch，无 CORS、隐藏 key）
 * - 浏览器演示版：webShim 提供 aiChat（直接 fetch，可能受目标厂商 CORS 限制）
 */
export async function chat(
  messages: AIChatMessage[],
  opts?: { temperature?: number; maxTokens?: number; jsonMode?: boolean }
): Promise<AIChatResponse> {
  const { preset, config } = getActiveLLM()
  if (!config.apiKey || !config.baseURL || !config.model) {
    return { ok: false, error: 'NO_KEY' }
  }
  return chatWith(preset, config, messages, opts)
}

/** 指定厂商配置调用（用于设置页「测试连接」） */
export async function chatWith(
  preset: LLMPreset,
  config: ProviderConfig,
  messages: AIChatMessage[],
  opts?: { temperature?: number; maxTokens?: number; jsonMode?: boolean }
): Promise<AIChatResponse> {
  const req: AIChatRequest = {
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    model: config.model,
    messages,
    temperature: opts?.temperature,
    maxTokens: opts?.maxTokens,
    jsonMode: opts?.jsonMode && preset.supportsJsonMode
  }
  const api = (window as any).storyforge
  if (api?.aiChat) return api.aiChat(req)
  return { ok: false, error: '桥接不可用（请在桌面版或已注入兼容层的环境运行）' }
}
