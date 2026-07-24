import type { Project } from '@shared/types'
import { dataUrlBytes } from './projectAudit'

// ============================================================
// 图片压缩（renderer/canvas 实现，主进程无 canvas）
// 用于导出前自动压缩过大的立绘 / 背景图，控制单文件体积
// ============================================================

export interface CompressOptions {
  maxDim?: number // 最长边像素上限
  quality?: number // JPEG/WebP 质量 0~1
  /** 仅当原图字节数超过该阈值才压缩，避免小图反而变大 */
  minBytes?: number
}

const DEFAULTS: Required<CompressOptions> = {
  maxDim: 1600,
  quality: 0.82,
  minBytes: 200 * 1024 // 200KB
}

/** 压缩单个图片 DataURL；失败或非 data:image 时原样返回 */
export function compressImageDataUrl(dataUrl: string, opts: CompressOptions = {}): Promise<string> {
  const o = { ...DEFAULTS, ...opts }
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith('data:image')) return resolve(dataUrl)
    if (dataUrl.startsWith('data:image/gif')) return resolve(dataUrl) // 保留动图
    if (dataUrlBytes(dataUrl) < o.minBytes) return resolve(dataUrl)

    const img = new Image()
    img.onload = () => {
      try {
        const scale = Math.min(1, o.maxDim / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(dataUrl)
        ctx.drawImage(img, 0, 0, w, h)
        // 透明 PNG 保留 png；不透明用 jpeg 压得更小
        const hasAlpha = /data:image\/(png|webp|avif)/.test(dataUrl)
        const out = hasAlpha
          ? canvas.toDataURL('image/webp', o.quality)
          : canvas.toDataURL('image/jpeg', o.quality)
        // 若压缩后反而更大，则保留原图
        resolve(dataUrlBytes(out) < dataUrlBytes(dataUrl) ? out : dataUrl)
      } catch {
        resolve(dataUrl)
      }
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

/**
 * 压缩整个工程的图片资源（立绘 + 背景），返回新工程副本。
 * 音频不做压缩（浏览器无法可靠转码音频）。
 */
export async function compressProjectImages(
  project: Project,
  opts?: CompressOptions
): Promise<{ project: Project; savedBytes: number }> {
  const p: Project = JSON.parse(JSON.stringify(project))
  let before = 0
  let after = 0

  for (const c of p.characters) {
    for (const key of Object.keys(c.portraits || {})) {
      const src = c.portraits[key]
      if (!src) continue
      before += dataUrlBytes(src)
      const out = await compressImageDataUrl(src, opts)
      after += dataUrlBytes(out)
      c.portraits[key] = out
    }
  }
  for (const b of p.backgrounds) {
    if (!b.image) continue
    before += dataUrlBytes(b.image)
    const out = await compressImageDataUrl(b.image, opts)
    after += dataUrlBytes(out)
    b.image = out
  }

  return { project: p, savedBytes: Math.max(0, before - after) }
}
