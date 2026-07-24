import type { Project, AIChatRequest, AssetImportResult, AssetImportResults, ExportOptions, ProjectFolderInfo, NewProjectInput, ProjectSaveInput } from '@shared/types'
import { exportHtml } from '../main/export/exportHtml'
import { llmChatHttp } from '../shared/llmHttp'
import { saveProject as dbSave, loadProject as dbLoad, listProjects as dbList, deleteProject as dbDelete } from './store/db'
import { withDefaultShell, defaultGameShell } from '@shared/types'
import { uid as rid } from './lib/id'

/**
 * 浏览器兼容层（Web 演示用）。
 *
 * 引擎的正式运行环境是 Electron 桌面应用，桥接 API 由 preload 注入到 window.storyforge。
 * 但界面层（React）本身与桌面无强耦合，只有「导入 / 预览 / 导出」三处会调用桥接 API。
 * 当检测到不在 Electron 中（window.storyforge 不存在）时，注入本 shim，
 * 用浏览器原生能力实现等价功能，让完整引擎界面可在浏览器中直接操作演示：
 *   - 导入：<input type=file> 读取 .txt（.docx 提示用桌面版）
 *   - 预览：window.open 新标签 + BroadcastChannel 实时热更新（所见即所得）
 *   - 导出：内存生成单文件 HTML → Blob 触发浏览器下载
 */

const CHANNEL = 'storyforge-preview'

// Web 演示版：用 localStorage 暂存封面（IndexedDB 项目表不含封面字段）
const COVER_KEY = 'storyforge-web-covers'
function readCovers(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(COVER_KEY) || '{}')
  } catch {
    return {}
  }
}
function writeCover(id: string, dataUrl: string): void {
  const m = readCovers()
  m[id] = dataUrl
  localStorage.setItem(COVER_KEY, JSON.stringify(m))
}
function removeCover(id: string): void {
  const m = readCovers()
  delete m[id]
  localStorage.setItem(COVER_KEY, JSON.stringify(m))
}

type PreviewPayload = {
  project: Project
  cursor: { scene: number; card: number }
  reset?: boolean
}

export function installWebShim(): void {
  if ((window as any).storyforge) return

  const bc = new BroadcastChannel(CHANNEL)
  // 记录最近一次项目快照，供新打开的预览窗口首帧使用
  let latest: PreviewPayload | null = null

  bc.onmessage = (e) => {
    if (e.data?.type === 'ready' && latest) {
      bc.postMessage({ type: 'update', payload: latest })
    }
  }

  ;(window as any).storyforge = {
    // ---- 导入 ----
    importDoc(): Promise<{ text: string; fileName: string } | null> {
      return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.txt,.docx,text/plain'
        input.onchange = () => {
          const file = input.files?.[0]
          if (!file) return resolve(null)
          if (/\.docx$/i.test(file.name)) {
            alert('浏览器演示版暂只支持 .txt 导入；.docx 请使用桌面版（主进程走 mammoth 解析）。')
            return resolve(null)
          }
          const reader = new FileReader()
          reader.onload = () => resolve({ text: String(reader.result || ''), fileName: file.name })
          reader.onerror = () => resolve(null)
          reader.readAsText(file, 'utf-8')
        }
        input.click()
      })
    },

    // ---- 导入本地资源（图片 / 音频 / 视频）→ DataURL ----
    importAsset(kind: 'image' | 'audio' | 'video'): Promise<AssetImportResult | null> {
      return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept =
          kind === 'image' ? 'image/*' : kind === 'audio' ? 'audio/*' : 'video/*'
        input.onchange = () => {
          const file = input.files?.[0]
          if (!file) return resolve(null)
          const reader = new FileReader()
          reader.onload = () => resolve({ fileName: file.name, dataUrl: String(reader.result || '') })
          reader.onerror = () => resolve(null)
          reader.readAsDataURL(file)
        }
        input.click()
      })
    },

    // ---- 多选导入本地资源（一次选多个文件）→ DataURL[] ----
    importAssetsMulti(kind: 'image' | 'audio' | 'video'): Promise<AssetImportResults> {
      return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.multiple = true
        input.accept =
          kind === 'image' ? 'image/*' : kind === 'audio' ? 'audio/*' : 'video/*'
        input.onchange = () => {
          const files = Array.from(input.files || [])
          if (files.length === 0) return resolve([])
          const readers = files.map(
            (file) =>
              new Promise<AssetImportResult>((res) => {
                const reader = new FileReader()
                reader.onload = () => res({ fileName: file.name, dataUrl: String(reader.result || '') })
                reader.onerror = () => res({ fileName: file.name, dataUrl: '' })
                reader.readAsDataURL(file)
              })
          )
          Promise.all(readers).then(resolve)
        }
        input.click()
      })
    },

    // ---- 预览（独立窗口 + 实时热更新）----
    async openPreview(project: Project, cursor: { scene: number; card: number }): Promise<void> {
      latest = { project, cursor, reset: true }
      const url = window.location.pathname + '?mode=preview'
      window.open(url, 'storyforge-preview', 'width=960,height=600')
      // 新窗口就绪后会广播 ready，这里也主动补推一次，双保险
      setTimeout(() => bc.postMessage({ type: 'update', payload: latest }), 400)
    },

    pushPreviewUpdate(payload: PreviewPayload): void {
      latest = payload
      bc.postMessage({ type: 'update', payload })
    },

    onPreviewUpdate(cb: (payload: PreviewPayload) => void): () => void {
      const listener = (e: MessageEvent): void => {
        if (e.data?.type === 'update') cb(e.data.payload)
      }
      bc.addEventListener('message', listener)
      // 通知主窗口：预览已就绪，请把当前项目推给我
      bc.postMessage({ type: 'ready' })
      return () => bc.removeEventListener('message', listener)
    },

    // ---- 导出 ----
    async exportHtml(
      project: Project,
      options?: ExportOptions
    ): Promise<{ ok: boolean; size?: number }> {
      const html = exportHtml(project, options)
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${(project.title || 'storyforge').replace(/[\\/:*?"<>|]/g, '_')}.html`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(a.href)
      return { ok: true, size: blob.size }
    },

    async exportExe(): Promise<{ ok: boolean; message: string }> {
      return { ok: false, message: 'exe 打包需在桌面版运行（electron-builder）。浏览器演示版请使用「导出 HTML5 单文件」。' }
    },

    // ---- AI 对话（浏览器直接 fetch；可能受目标厂商 CORS 限制，桌面版走主进程无此限制）----
    async aiChat(req: AIChatRequest) {
      const r = await llmChatHttp(req)
      if (!r.ok && /Failed to fetch|NetworkError|CORS/i.test(r.error || '')) {
        return {
          ok: false,
          error:
            '浏览器演示版直连该厂商被 CORS 拦截，属正常现象。请在桌面版运行（AI 请求走主进程，无 CORS 限制），或改用支持跨域的端点。原始错误：' +
            (r.error || '')
        }
      }
      return r
    },

    // ---- 项目书架（Web 演示版：IndexedDB 兜底，无真实文件夹）----
    async pickFolder(): Promise<string | null> {
      return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        ;(input as unknown as { webkitdirectory: boolean }).webkitdirectory = true
        let settled = false
        const done = (val: string | null) => {
          if (settled) return
          settled = true
          input.remove()
          resolve(val)
        }
        input.onchange = () => {
          // 即使空文件夹也生成一个路径（web 环境下文件夹名仅作标识）
          const file = input.files?.[0]
          let dir = 'web-project'
          if (file) {
            const rel = (file as unknown as { webkitRelativePath: string }).webkitRelativePath
            dir = rel ? rel.split('/')[0] : 'web-project'
          }
          done('web://' + dir)
        }
        // 用户取消时 onchange 不触发，通过聚焦窗口检测关闭
        window.addEventListener('focus', function onCancel() {
          setTimeout(() => done(null), 100)
          window.removeEventListener('focus', onCancel)
        }, { once: true })
        input.click()
      })
    },

    pickCover(): Promise<string | null> {
      return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.onchange = () => {
          const file = input.files?.[0]
          if (!file) return resolve(null)
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result || ''))
          reader.onerror = () => resolve(null)
          reader.readAsDataURL(file)
        }
        input.click()
      })
    },

    async listProjects(): Promise<ProjectFolderInfo[]> {
      const all = await dbList()
      const covers = readCovers()
      return all.map((p) => ({
        id: p.id,
        name: p.title,
        folderPath: p.id,
        cover: covers[p.id] || null,
        updatedAt: p.createdAt
      }))
    },

    async createProject(input: NewProjectInput): Promise<{ project: Project; info: ProjectFolderInfo }> {
      const project: Project = {
        id: rid('proj'),
        title: input.name.trim() || '未命名故事',
        createdAt: Date.now(),
        scenes: [[{ id: rid('card'), type: 'dialogue', speaker: '', text: '在这里写下你的第一句台词……', goto: '' }]],
        characters: [],
        backgrounds: [],
        audioTracks: [],
        videos: [],
        variables: [],
        shell: defaultGameShell(input.name.trim() || '未命名故事')
      }
      await dbSave(project)
      if (input.coverDataUrl) writeCover(project.id, input.coverDataUrl)
      const info: ProjectFolderInfo = {
        id: project.id,
        name: project.title,
        folderPath: project.id,
        cover: input.coverDataUrl,
        updatedAt: project.createdAt
      }
      return { project, info }
    },

    async openProject(folderPath: string): Promise<Project | null> {
      const p = await dbLoad(folderPath)
      return p ? withDefaultShell(p) : null
    },

    async saveProjectToFolder(input: ProjectSaveInput): Promise<void> {
      await dbSave(input.project)
    },

    async deleteProjectAt(folderPath: string): Promise<void> {
      await dbDelete(folderPath)
      removeCover(folderPath)
    },

    async openFolder(): Promise<{ project: Project; info: ProjectFolderInfo } | null> {
      // Web 演示版无法浏览本地文件夹，返回 null（由渲染层提示用桌面版）
      return null
    }
  }

  // eslint-disable-next-line no-console
  console.info('[StoryForge] Web 兼容层已启用（非 Electron 环境）')
}
