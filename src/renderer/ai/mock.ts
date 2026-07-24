import type { AIProvider } from './providers'

function delay<T>(value: T, min = 300, max = 800): Promise<T> {
  const ms = min + Math.random() * (max - min)
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

const CONTINUATIONS = [
  '……（沉默了片刻）其实，我一直想说。',
  '风轻轻拂过，带来一丝樱花的香气。',
  '「你说得对，也许我们该换个方式。」',
  '那一刻，时间仿佛静止了。',
  '「不管怎样，我都会站在你这边。」',
  '远处传来隐约的钟声，提醒着放学的时间。',
  '她的眼神里闪过一丝不易察觉的温柔。',
  '「这个秘密，就只有我们两个人知道哦。」'
]

/** 生成一张纯色占位图（DataURL），模拟 SD 立绘/背景 */
function placeholderImage(seed: string, landscape = false): string {
  const hue = (seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 7) % 360
  const w = landscape ? 1024 : 512
  const h = landscape ? 576 : 768
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
    <stop offset='0' stop-color='hsl(${hue},65%,62%)'/>
    <stop offset='1' stop-color='hsl(${(hue + 50) % 360},60%,42%)'/>
    </linearGradient></defs>
    <rect width='${w}' height='${h}' fill='url(#g)'/>
    <text x='${w / 2}' y='${h / 2}' font-size='34' fill='white' text-anchor='middle' font-family='sans-serif' opacity='0.9'>${seed.slice(0, 14)}</text>
    </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/**
 * 使用浏览器原生 Web Speech Synthesis API (SpeechSynthesis) 将文字转为可播放的 WAV DataURL。
 * 无需任何 API Key / 网络，所有现代浏览器均支持。
 */
function synthesizeVoiceDataUrl(text: string, _voiceId?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // 检查浏览器支持
    if (!('speechSynthesis' in window)) {
      reject(new Error('当前浏览器不支持语音合成'))
      return
    }

    const utterance = new SpeechSynthesisUtterance(text.slice(0, 500)) // 防止过长文本
    utterance.lang = 'zh-CN'
    utterance.rate = 0.95
    utterance.pitch = 1.0
    utterance.volume = 1.0

    // 尝试选择中文语音
    const voices = speechSynthesis.getVoices()
    const zhVoice = voices.find((v) => v.lang.startsWith('zh')) || voices.find((v) => v.lang.includes('CN'))
    if (zhVoice) utterance.voice = zhVoice

    // ---- 用 Web Audio API 合成一段带语调感的语音 WAV DataURL ----
    // 同时触发 speechSynthesis.speak 让用户听到浏览器原生朗读（bonus）
    try {
      const wavDataUrl = generateSyntheticVoiceDataUrl(text)
      // 后台触发浏览器朗读（用户体验 bonus）
      speechSynthesis.cancel()
      speechSynthesis.speak(utterance)
      resolve(wavDataUrl)
    } catch (e) {
      reject(e)
    }
  })
}

/**
 * 用 Web Audio API 生成一段合成语音风格的 WAV 音频 DataURL。
 * 根据文字长度动态调整时长，模拟说话节奏感。
 */
function generateSyntheticVoiceDataUrl(text: string): string {
  const sampleRate = 22050
  const duration = Math.min(8, Math.max(1, text.length * 0.08)) // 每字 ~80ms，最长 8s
  const numSamples = Math.floor(sampleRate * duration)

  // 离线渲染
  const ctx = new OfflineAudioContext(1, numSamples, sampleRate)
  const buf = ctx.createBuffer(1, numSamples, sampleRate)
  const data = buf.getChannelData(0)

  // 双正弦波叠加模拟人声基频 + 泛音
  const baseFreq = 160 + (text.charCodeAt(0) % 60) // 基频随首字变化
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    // 包络：淡入 / 持续 / 淡出
    const attack = Math.min(t / 0.06, 1)
    const release = duration - t < 0.15 ? Math.max(0, (duration - t) / 0.15) : 1
    const envelope = attack * release * 0.35

    // 基频 + 二次泛音 + 三次泛音（模拟人声谐波）
    data[i] = (
      Math.sin(2 * Math.PI * baseFreq * t) * 1.0 +
      Math.sin(2 * Math.PI * baseFreq * 2.05 * t) * 0.55 +
      Math.sin(2 * Math.PI * baseFreq * 3.1 * t) * 0.25 +
      Math.sin(2 * Math.PI * baseFreq * 4.15 * t) * 0.1
    ) * envelope

    // 轻微颤音 (vibrato)
    data[i] *= 1 + 0.04 * Math.sin(2 * Math.PI * 5.2 * t)

    // 加入轻微噪声模拟气声
    data[i] += (Math.random() - 0.5) * 0.03 * envelope
  }

  // 编码为 WAV
  return encodeWAV(data, sampleRate)
}

/**
 * 用 Web Audio API 生成一段环境风格 BGM 的 WAV DataURL。
 * 根据提示词的哈希值决定调性和氛围。
 */
function generateBGMDataUrl(prompt: string): string {
  const sampleRate = 22050
  const duration = 12 // 12 秒循环
  const numSamples = Math.floor(sampleRate * duration)
  const ctx = new OfflineAudioContext(2, numSamples, sampleRate) // 立体声
  const buf = ctx.createBuffer(2, numSamples, sampleRate)
  const left = buf.getChannelData(0)
  const right = buf.getChannelData(1)

  // 根据提示词决定调性
  const hash = prompt.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const baseNotes = [130.81, 146.83, 164.81, 174.61, 196.00, 220.00, 246.94] // C3~B3
  const rootFreq = baseNotes[hash % baseNotes.length]
  const scale = [0, 2, 4, 7, 9] // 大五声音阶 (全音程)
  const isMinor = hash % 3 === 0 // 33% 概率为小调

  // 生成和弦进行
  const chordProgression = isMinor
    ? [0, 3, 2, 5] // 小调: i - iv - iii - vi
    : [0, 3, 1, 2] // 大调: I - IV - ii - V
  const chordDuration = duration / chordProgression.length

  for (let ch = 0; ch < chordProgression.length; ch++) {
    const chordRootIdx = chordProgression[ch]
    const root = rootFreq * Math.pow(2, scale[chordRootIdx] / 12)
    const third = root * Math.pow(2, (isMinor ? 3 : 4) / 12)
    const fifth = root * Math.pow(2, 7 / 12)
    const chStart = Math.floor(ch * chordDuration * sampleRate)
    const chEnd = Math.floor((ch + 1) * chordDuration * sampleRate)

    for (let i = chStart; i < chEnd; i++) {
      const t = (i - chStart) / sampleRate
      const globalT = i / sampleRate

      // 和弦包络（每个和弦淡入淡出）
      const envStart = Math.min(t / 0.4, 1)
      const localRemain = chordDuration - t
      const envEnd = localRemain < 0.6 ? Math.max(0, localRemain / 0.6) : 1
      const envelope = envStart * envEnd * 0.18

      // 低音 (root, 八度低)
      const bassOsc = Math.sin(2 * Math.PI * (root / 2) * globalT) * 0.8

      // 和弦音 (root + third + fifth)
      const chordOsc =
        Math.sin(2 * Math.PI * root * globalT) * 1.0 +
        Math.sin(2 * Math.PI * third * globalT) * 0.7 +
        Math.sin(2 * Math.PI * fifth * globalT) * 0.5

      // 高音装饰音（琶音感）
      const arpeggioFreq = root * 2 * Math.pow(2, scale[(chordRootIdx + ((globalT * 1.5) | 0) % scale.length)] / 12)
      const arpPhase = (globalT * 2.5) % 1
      const arpEnv = arpPhase < 0.3 ? Math.sin((arpPhase / 0.3) * Math.PI * 0.5) : Math.exp(-(arpPhase - 0.3) * 4)
      const arpOsc = Math.sin(2 * Math.PI * arpeggioFreq * globalT) * 0.15 * arpEnv

      // Pad (长音铺底，立体声微偏移)
      const padOsc =
        Math.sin(2 * Math.PI * root * 0.995 * globalT) * 0.12 +
        Math.sin(2 * Math.PI * (third * 1.003) * globalT) * 0.08

      // 混合
      left[i] = (bassOsc + chordOsc + arpOsc + padOsc * 1.05) * envelope
      right[i] = (bassOsc + chordOsc + arpOsc + padOsc * 0.95) * envelope

      // 轻微混响模拟（延迟复制）
      const delayTime = 0.03
      const delaySamples = Math.floor(delayTime * sampleRate)
      if (i > delaySamples) {
        const decay = 0.25
        left[i] += left[i - delaySamples] * decay * 0.15
        right[i] += right[i - delaySamples] * decay * 0.15
      }
    }
  }

  // 编码为立体声 WAV
  return encodeWAVStereo(left, right, sampleRate)
}

/** 单声道 PCM Float32 → WAV DataURL */
function encodeWAV(samples: Float32Array, sampleRate: number): string {
  const n = samples.length
  const buffer = new ArrayBuffer(44 + n * 2)
  const view = new DataView(buffer)
  // RIFF header
  writeStr(view, 0, 'RIFF')
  view.setUint32(4, 36 + n * 2, true)
  writeStr(view, 8, 'WAVE')
  writeStr(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeStr(view, 36, 'data')
  view.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), true)
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...new Uint8Array(buffer)))}`
}

/** 立体声 PCM Float32 × 2 → WAV DataURL */
function encodeWAVStereo(left: Float32Array, right: Float32Array, sampleRate: number): string {
  const n = left.length
  const buffer = new ArrayBuffer(44 + n * 4)
  const view = new DataView(buffer)
  writeStr(view, 0, 'RIFF')
  view.setUint32(4, 36 + n * 4, true)
  writeStr(view, 8, 'WAVE')
  writeStr(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 2, true) // stereo
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 4, true)
  view.setUint16(32, 4, true)
  view.setUint16(34, 16, true)
  writeStr(view, 36, 'data')
  view.setUint32(40, n * 4, true)
  for (let i = 0; i < n; i++) {
    view.setInt16(44 + i * 4, Math.max(-32768, Math.min(32767, Math.round(left[i] * 32767))), true)
    view.setInt16(44 + i * 4 + 2, Math.max(-32768, Math.min(32767, Math.round(right[i] * 32767))), true)
  }
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...new Uint8Array(buffer)))}`
}

function writeStr(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
}

export const mockProvider: AIProvider = {
  continueScript: (ctx) => {
    const pick = CONTINUATIONS[Math.floor(Math.random() * CONTINUATIONS.length)]
    return delay(pick)
  },
  generatePortrait: (prompt) => delay(placeholderImage(prompt || 'portrait', false)),
  generateBackground: (prompt) => delay(placeholderImage(prompt || 'background', true)),
  generateVoice: async (text) => {
    const url = await synthesizeVoiceDataUrl(text)
    return delay(url)
  },
  generateBGM: (prompt) => delay(generateBGMDataUrl(prompt))
}
