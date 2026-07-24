import type { AIChatRequest, AIChatResponse } from './types'

/**
 * OpenAI 兼容 Chat Completions 请求（纯 fetch，主进程与浏览器兼容层共用）。
 * 主进程调用无 CORS 限制且可隐藏 key；浏览器直接调用可能受目标厂商 CORS 限制。
 */
export async function llmChatHttp(req: AIChatRequest): Promise<AIChatResponse> {
  try {
    const url = req.baseURL.replace(/\/$/, '') + '/chat/completions'
    const body: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 2048
    }
    if (req.jsonMode) body.response_format = { type: 'json_object' }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${req.apiKey}`
      },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      // 脱敏：不在 UI 中回显原始 apiKey
      const safeMsg = errText
        .replace(/sk-[a-zA-Z0-9]{10,}/g, 'sk-***')
        .replace(/apiKey["\s:]+["\']?[^"\'\s,}]*/gi, 'apiKey("***")')
        .slice(0, 300)
      const hint = res.status === 401
        ? 'API Key 无效或已过期，请到厂商平台确认后重新粘贴'
        : res.status === 429
        ? '请求过于频繁，请稍后再试'
        : res.status >= 500
        ? '服务器暂时不可用，请稍后重试'
        : ''
      return { ok: false, error: `HTTP ${res.status} ${res.statusText}${safeMsg ? ' · ' + safeMsg : ''}${hint ? '\n' + hint : ''}` }
    }
    const data = await res.json()
    const content: string | undefined = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      return { ok: false, error: '响应缺少 choices[0].message.content：' + JSON.stringify(data).slice(0, 300) }
    }
    return { ok: true, content: content.trim() }
  } catch (e) {
    return { ok: false, error: (e as Error).message || String(e) }
  }
}
