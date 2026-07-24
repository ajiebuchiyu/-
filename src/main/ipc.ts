import { BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { extname, basename } from 'path'
import { IPC } from '../shared/types'
import type { Project, AIChatRequest, AssetImportResult, ExportOptions } from '../shared/types'
import { llmChatHttp } from '../shared/llmHttp'
import { exportHtml } from './export/exportHtml'
import { exportExe } from './export/exportExe'
import {
  listProjects,
  createProject,
  loadProject,
  saveProjectToFolder,
  deleteProject,
  openExistingFolder
} from './projectFs'
import type { ProjectFolderInfo, NewProjectInput, ProjectSaveInput } from '../shared/types'

interface IpcDeps {
  openPreviewWindow: () => BrowserWindow
  getMainWindow: () => BrowserWindow | null
}

let previewWin: BrowserWindow | null = null
export function setPreviewWindow(win: BrowserWindow | null): void {
  previewWin = win
}

export function registerIpc(deps: IpcDeps): void {
  // ---- 导入 .txt / .docx，返回纯文本，解析在渲染进程完成 ----
  ipcMain.handle(IPC.IMPORT_DOC, async () => {
    const win = deps.getMainWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: '导入剧本文件',
      filters: [{ name: '剧本文件', extensions: ['txt', 'docx'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const filePath = result.filePaths[0]
    const ext = extname(filePath).toLowerCase()

    if (ext === '.txt') {
      const buf = await readFile(filePath)
      // 尝试 utf-8
      return { fileName: filePath, ext, text: buf.toString('utf-8') }
    }
    if (ext === '.docx') {
      // mammoth 在主进程处理 docx buffer。
      // 用 convertToHtml 保留 run 样式（加粗 → <strong>），据此识别说话人；
      // 失败或无样式时回退 extractRawText，保证向后兼容。
      const mammoth = await import('mammoth')
      const buf = await readFile(filePath)
      try {
        const { value: html } = await mammoth.convertToHtml({ buffer: buf })
        const text = docxHtmlToScriptText(html)
        if (text.trim()) return { fileName: filePath, ext, text }
      } catch {
        /* 回退 */
      }
      const { value } = await mammoth.extractRawText({ buffer: buf })
      return { fileName: filePath, ext, text: value }
    }
    return null
  })

  // ---- 导入本地资源文件（图片 / 音频 / 视频），读为 DataURL 便于嵌入 IndexedDB 与导出 HTML ----
  ipcMain.handle(IPC.IMPORT_ASSET, async (_e, kind: 'image' | 'audio' | 'video'): Promise<AssetImportResult | null> => {
    const win = deps.getMainWindow()
    const filters =
      kind === 'image'
        ? [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'] }]
        : kind === 'audio'
          ? [{ name: '音频', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'] }]
          : [{ name: '视频', extensions: ['mp4', 'webm', 'mov', 'm4v', 'ogg'] }]
    const result = await dialog.showOpenDialog(win!, {
      title: kind === 'image' ? '导入立绘 / 背景图' : kind === 'audio' ? '导入音乐 / 音效' : '导入视频 / 动态CG',
      filters,
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const filePath = result.filePaths[0]
    const ext = extname(filePath).toLowerCase().replace(/^\./, '')
    const buf = await readFile(filePath)
    const mime = MIME_BY_EXT[ext] || (kind === 'image' ? 'application/octet-stream' : kind === 'audio' ? 'audio/mpeg' : 'video/mp4')
    const dataUrl = `data:${mime};base64,${buf.toString('base64')}`
    return { fileName: basename(filePath), dataUrl }
  })

  // ---- 多选导入本地资源（一次选多个文件，返回数组）----
  ipcMain.handle(IPC.IMPORT_ASSETS_MULTI, async (_e, kind: 'image' | 'audio' | 'video'): Promise<AssetImportResult[]> => {
    const win = deps.getMainWindow()
    const filters =
      kind === 'image'
        ? [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'] }]
        : kind === 'audio'
          ? [{ name: '音频', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'] }]
          : [{ name: '视频', extensions: ['mp4', 'webm', 'mov', 'm4v', 'ogg'] }]
    const result = await dialog.showOpenDialog(win!, {
      title: kind === 'audio' ? '批量导入音乐 / 音效（可多选）' : `批量导入${kind === 'image' ? '图片' : '视频'}（可多选）`,
      filters,
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled || result.filePaths.length === 0) return []

    const results: AssetImportResult[] = []
    for (const filePath of result.filePaths) {
      const ext = extname(filePath).toLowerCase().replace(/^\./, '')
      const buf = await readFile(filePath)
      const mime = MIME_BY_EXT[ext] || (kind === 'image' ? 'application/octet-stream' : kind === 'audio' ? 'audio/mpeg' : 'video/mp4')
      const dataUrl = `data:${mime};base64,${buf.toString('base64')}`
      results.push({ fileName: basename(filePath), dataUrl })
    }
    return results
  })

  // ---- 打开独立预览窗口 ----
  ipcMain.handle(IPC.OPEN_PREVIEW, async (_e, project: Project, cursor: { scene: number; card: number }) => {
    const win = deps.openPreviewWindow()
    const send = (): void => {
      // reset=true 表示用户主动要求从此处开始预览，预览窗口应重置起点
      win.webContents.send(IPC.PREVIEW_UPDATE, { project, cursor, reset: true })
    }
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', send)
    } else {
      send()
    }
    return true
  })

  // ---- 编辑器热更新 -> 转发给预览窗口 ----
  ipcMain.on(IPC.PREVIEW_UPDATE, (_e, payload) => {
    if (previewWin && !previewWin.isDestroyed()) {
      previewWin.webContents.send(IPC.PREVIEW_UPDATE, payload)
    }
  })

  // ---- 导出 HTML5 单文件 ----
  ipcMain.handle(IPC.EXPORT_HTML, async (_e, project: Project, options?: ExportOptions) => {
    const win = deps.getMainWindow()
    const result = await dialog.showSaveDialog(win!, {
      title: '导出 HTML5 单文件',
      defaultPath: `${project.title || 'story'}.html`,
      filters: [{ name: 'HTML', extensions: ['html'] }]
    })
    if (result.canceled || !result.filePath) return { ok: false }
    const html = exportHtml(project, options)
    await writeFile(result.filePath, html, 'utf-8')
    return { ok: true, path: result.filePath, size: Buffer.byteLength(html, 'utf-8') }
  })

  // ---- 导出 Windows exe（electron-builder） ----
  ipcMain.handle(IPC.EXPORT_EXE, async (_e, project: Project) => {
    return exportExe(project)
  })

  // ---- AI 对话（主进程代理请求，规避 CORS，隐藏 apiKey） ----
  ipcMain.handle(IPC.AI_CHAT, async (_e, req: AIChatRequest) => {
    return llmChatHttp(req)
  })

  // ---- 项目书架：选择本地文件夹 ----
  ipcMain.handle(IPC.PROJECT_PICK_FOLDER, async (): Promise<string | null> => {
    const win = deps.getMainWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: '选择项目储存位置',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })

  // ---- 项目书架：选择封面图（返回 DataURL） ----
  ipcMain.handle(IPC.PROJECT_PICK_COVER, async (): Promise<string | null> => {
    const win = deps.getMainWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: '选择封面图',
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'] }],
      properties: ['openFile']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const buf = await readFile(res.filePaths[0])
    const ext = extname(res.filePaths[0]).toLowerCase().replace(/^\./, '')
    const mime = MIME_BY_EXT[ext] || 'image/png'
    return `data:${mime};base64,${buf.toString('base64')}`
  })

  // ---- 项目书架：列出项目 ----
  ipcMain.handle(IPC.PROJECT_LIST, async (): Promise<ProjectFolderInfo[]> => {
    return listProjects()
  })

  // ---- 项目书架：新建项目 ----
  ipcMain.handle(IPC.PROJECT_CREATE, async (_e, input: NewProjectInput) => {
    return createProject(input)
  })

  // ---- 项目书架：从文件夹加载 ----
  ipcMain.handle(IPC.PROJECT_LOAD, async (_e, folderPath: string): Promise<Project | null> => {
    return loadProject(folderPath)
  })

  // ---- 项目书架：保存到文件夹 ----
  ipcMain.handle(IPC.PROJECT_SAVE, async (_e, input: ProjectSaveInput): Promise<void> => {
    return saveProjectToFolder(input)
  })

  // ---- 项目书架：删除项目 ----
  ipcMain.handle(IPC.PROJECT_DELETE, async (_e, folderPath: string): Promise<void> => {
    return deleteProject(folderPath)
  })

  // ---- 项目书架：打开已有的项目文件夹 ----
  ipcMain.handle(IPC.PROJECT_OPEN_FOLDER, async (): Promise<{ project: Project; info: ProjectFolderInfo } | null> => {
    const win = deps.getMainWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: '打开已有的项目文件夹',
      properties: ['openDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return openExistingFolder(res.filePaths[0])
  })
}

/** 去除 HTML 标签并解码常见实体，得到纯文本 */
function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

/** 一段短加粗文本是否像“说话人名字”（短、且不以句末标点结尾） */
function looksLikeName(s: string): boolean {
  return s.length > 0 && s.length <= 12 && !/[。！？!?…]$/.test(s)
}

/**
 * 把 mammoth 生成的 HTML 转成剧本文本，利用加粗 run 识别说话人：
 *  - 段首加粗且为短名字 + 后续正文 → 归一化为「名字：正文」
 *  - 整段仅一个短加粗名字（下一段是台词）→ 该名字作为下一句说话人
 *  - 其余情况 → 纯文本按行保留
 * 产出的文本沿用「名字：台词」约定，规则解析器与 AI 解析器都能直接消费。
 */
function docxHtmlToScriptText(html: string): string {
  const paras = html.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || []
  const lines: string[] = []
  let pendingSpeaker: string | null = null

  const cleanLead = (s: string): string => s.replace(/^[：:，,、.。\-—\s"'“”‘’]+/, '').trim()

  for (const p of paras) {
    const inner = p.replace(/^<p[^>]*>/i, '').replace(/<\/p>$/i, '')
    const m = inner.match(/^\s*<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>\s*([\s\S]*)$/i)
    let text = ''

    if (m) {
      const name = stripTags(m[1])
      const rest = cleanLead(stripTags(m[2]))
      if (looksLikeName(name)) {
        if (rest) {
          text = `${name}：${rest}`
        } else {
          // 独立的加粗名字：作为下一句说话人
          pendingSpeaker = name
          continue
        }
      } else {
        text = stripTags(inner)
      }
    } else {
      text = stripTags(inner)
    }

    if (!text) continue
    if (pendingSpeaker) {
      // 若该行本身未带说话人冒号，则挂上待定说话人
      if (!/^[^：:]{1,12}[：:]/.test(text)) text = `${pendingSpeaker}：${text}`
      pendingSpeaker = null
    }
    lines.push(text)
  }

  // 若整篇没有段落标签（极少数情况），回退为整块纯文本
  if (lines.length === 0) return stripTags(html)
  return lines.join('\n')
}

/** 扩展名 → MIME（用于把本地文件读成正确的 DataURL） */
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  avif: 'image/avif',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  aac: 'audio/aac',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  m4v: 'video/mp4',
  ogv: 'video/ogg'
}
