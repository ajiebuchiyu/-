import type { AssetImportResult, AssetImportResults } from '@shared/types'

export type AssetKind = 'image' | 'audio' | 'video'

/**
 * 打开本地文件选择器，返回资源的 DataURL。
 * - 桌面版（Electron）：走 window.storyforge.importAsset（主进程读文件）
 * - 浏览器演示版：webShim 用 FileReader 读为 DataURL
 * 两者返回结构一致，UI 层无需区分运行环境。
 */
export async function pickLocalAsset(kind: AssetKind): Promise<AssetImportResult | null> {
  const api = (window as unknown as { storyforge?: { importAsset?: (k: AssetKind) => Promise<AssetImportResult | null> } }).storyforge
  if (!api?.importAsset) {
    return null
  }
  try {
    return await api.importAsset(kind)
  } catch {
    return null
  }
}

/**
 * 多选导入本地资源（一次选择多个文件）。
 * - 桌面版：走 window.storyforge.importAssetsMulti（主进程 multiSelections 对话框）
 * - 浏览器版：webShim 用 <input multiple> + FileReader 并行读取
 * 返回结果数组（按文件选择顺序），已取消则返回空数组。
 */
export async function pickLocalAssetsMulti(kind: AssetKind): Promise<AssetImportResults> {
  const api = (window as unknown as { storyforge?: { importAssetsMulti?: (k: AssetKind) => Promise<AssetImportResults> } }).storyforge
  if (!api?.importAssetsMulti) {
    return []
  }
  try {
    return await api.importAssetsMulti(kind)
  } catch {
    return []
  }
}
