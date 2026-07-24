import { useProjectStore } from '../store/projectStore'

/**
 * 素材拖拽进节点：统一的拖放协议。
 * - 内部资源面板拖出：dataTransfer 带 'sf/asset' = JSON {kind:'background'|'audio', id}
 * - 外部文件夹拖入：dataTransfer.files 带图片/音频文件，自动导入资源库后再应用到卡片
 */
export interface AssetDragPayload {
  kind: 'background' | 'audio'
  id: string
}

export const ASSET_MIME = 'sf/asset'

export function setAssetDrag(e: React.DragEvent, payload: AssetDragPayload): void {
  e.dataTransfer.setData(ASSET_MIME, JSON.stringify(payload))
  e.dataTransfer.effectAllowed = 'copy'
}

/** 是否是可接收的素材拖拽（内部素材或外部图片/音频文件） */
export function isAssetDrag(e: React.DragEvent): boolean {
  const types = Array.from(e.dataTransfer.types || [])
  return types.includes(ASSET_MIME) || types.includes('Files')
}

function readFileAsDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(f)
  })
}

/**
 * 把拖入的素材应用到指定卡片：
 * 图片 → card.background；音频 → card.music。
 * 返回应用结果描述（用于 toast），未识别返回 null。
 */
export async function applyAssetDropToCard(cardId: string, e: React.DragEvent): Promise<string | null> {
  const store = useProjectStore.getState()

  // 1) 内部资源面板拖入
  const raw = e.dataTransfer.getData(ASSET_MIME)
  if (raw) {
    try {
      const p = JSON.parse(raw) as AssetDragPayload
      if (p.kind === 'background') {
        store.updateCard(cardId, { background: p.id })
        const name = store.project.backgrounds.find((b) => b.id === p.id)?.name || '背景'
        return `已设置背景「${name}」`
      }
      if (p.kind === 'audio') {
        store.updateCard(cardId, { music: p.id })
        const name = store.project.audioTracks.find((a) => a.id === p.id)?.name || '音轨'
        return `已设置音乐「${name}」`
      }
    } catch {
      return null
    }
  }

  // 2) 外部文件拖入（图片 / 音频），自动导入资源库
  const files = Array.from(e.dataTransfer.files || [])
  const img = files.find((f) => f.type.startsWith('image/'))
  const aud = files.find((f) => f.type.startsWith('audio/'))
  if (img) {
    const url = await readFileAsDataUrl(img)
    const bgId = store.addBackground(img.name.replace(/\.[^.]+$/, ''), url)
    store.updateCard(cardId, { background: bgId })
    return `已导入并设置背景「${img.name}」`
  }
  if (aud) {
    const url = await readFileAsDataUrl(aud)
    const audioId = store.addAudioTrack('bgm', aud.name.replace(/\.[^.]+$/, ''), url)
    store.updateCard(cardId, { music: audioId })
    return `已导入并设置音乐「${aud.name}」`
  }
  return null
}
