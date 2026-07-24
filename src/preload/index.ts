import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'
import type {
  Project,
  AIChatRequest,
  AIChatResponse,
  AssetImportResult,
  AssetImportResults,
  ExportOptions,
  ProjectFolderInfo,
  NewProjectInput,
  ProjectSaveInput
} from '../shared/types'

export type PreviewPayload = {
  project: Project
  cursor: { scene: number; card: number }
  reset?: boolean
}

export interface StoryForgeApi {
  importDoc: () => Promise<{ fileName: string; ext: string; text: string } | null>
  importAsset: (kind: 'image' | 'audio' | 'video') => Promise<AssetImportResult | null>
  /** 多选导入（一次选择多个文件） */
  importAssetsMulti: (kind: 'image' | 'audio' | 'video') => Promise<AssetImportResults>
  openPreview: (project: Project, cursor: { scene: number; card: number }) => Promise<boolean>
  pushPreviewUpdate: (payload: PreviewPayload) => void
  onPreviewUpdate: (cb: (payload: PreviewPayload) => void) => () => void
  exportHtml: (
    project: Project,
    options?: ExportOptions
  ) => Promise<{ ok: boolean; path?: string; size?: number }>
  exportExe: (project: Project) => Promise<{ ok: boolean; message?: string }>
  aiChat: (req: AIChatRequest) => Promise<AIChatResponse>
  // ---- 项目书架 ----
  pickFolder: () => Promise<string | null>
  pickCover: () => Promise<string | null>
  listProjects: () => Promise<ProjectFolderInfo[]>
  createProject: (input: NewProjectInput) => Promise<{ project: Project; info: ProjectFolderInfo }>
  openProject: (folderPath: string) => Promise<Project | null>
  saveProjectToFolder: (input: ProjectSaveInput) => Promise<void>
  deleteProjectAt: (folderPath: string) => Promise<void>
  openFolder: () => Promise<{ project: Project; info: ProjectFolderInfo } | null>
}

const api: StoryForgeApi = {
  importDoc: () => ipcRenderer.invoke(IPC.IMPORT_DOC),
  importAsset: (kind) => ipcRenderer.invoke(IPC.IMPORT_ASSET, kind),
  importAssetsMulti: (kind) => ipcRenderer.invoke(IPC.IMPORT_ASSETS_MULTI, kind),
  openPreview: (project, cursor) => ipcRenderer.invoke(IPC.OPEN_PREVIEW, project, cursor),
  pushPreviewUpdate: (payload) => ipcRenderer.send(IPC.PREVIEW_UPDATE, payload),
  onPreviewUpdate: (cb) => {
    const listener = (_e: unknown, payload: any): void => cb(payload)
    ipcRenderer.on(IPC.PREVIEW_UPDATE, listener)
    return () => ipcRenderer.removeListener(IPC.PREVIEW_UPDATE, listener)
  },
  exportHtml: (project, options) => ipcRenderer.invoke(IPC.EXPORT_HTML, project, options),
  exportExe: (project) => ipcRenderer.invoke(IPC.EXPORT_EXE, project),
  aiChat: (req) => ipcRenderer.invoke(IPC.AI_CHAT, req),
  // ---- 项目书架 ----
  pickFolder: () => ipcRenderer.invoke(IPC.PROJECT_PICK_FOLDER),
  pickCover: () => ipcRenderer.invoke(IPC.PROJECT_PICK_COVER),
  listProjects: () => ipcRenderer.invoke(IPC.PROJECT_LIST),
  createProject: (input) => ipcRenderer.invoke(IPC.PROJECT_CREATE, input),
  openProject: (folderPath) => ipcRenderer.invoke(IPC.PROJECT_LOAD, folderPath),
  saveProjectToFolder: (input) => ipcRenderer.invoke(IPC.PROJECT_SAVE, input),
  deleteProjectAt: (folderPath) => ipcRenderer.invoke(IPC.PROJECT_DELETE, folderPath),
  openFolder: () => ipcRenderer.invoke(IPC.PROJECT_OPEN_FOLDER)
}

contextBridge.exposeInMainWorld('storyforge', api)
