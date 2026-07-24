import { app, shell } from 'electron'
import { mkdir, writeFile, readFile, rm, access, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import type { Project, ProjectFolderInfo, NewProjectInput, ProjectSaveInput } from '../shared/types'
import { defaultGameShell, withDefaultShell } from '../shared/types'

function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

const REGISTRY_FILE = join(app.getPath('userData'), 'storyforge-registry.json')
const PROJECT_FILE = 'project.json'
const COVER_FILE = 'cover.png'

async function readRegistry(): Promise<ProjectFolderInfo[]> {
  try {
    const raw = await readFile(REGISTRY_FILE, 'utf-8')
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

async function writeRegistry(list: ProjectFolderInfo[]): Promise<void> {
  await writeFile(REGISTRY_FILE, JSON.stringify(list, null, 2), 'utf-8')
}

/** 列出书架上的项目（过滤掉文件夹已不存在的条目） */
export async function listProjects(): Promise<ProjectFolderInfo[]> {
  const all = await readRegistry()
  const valid: ProjectFolderInfo[] = []
  for (const info of all) {
    if (existsSync(info.folderPath)) valid.push(info)
    else {
      // 文件夹丢失，从注册表移除
    }
  }
  // 同步清理失效条目
  if (valid.length !== all.length) await writeRegistry(valid)
  return valid.sort((a, b) => b.updatedAt - a.updatedAt)
}

/** 把 DataURL 解码为 Buffer（用于保存封面图文件） */
function dataUrlToBuffer(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(',')
  const base64 = dataUrl.slice(comma + 1)
  return Buffer.from(base64, 'base64')
}

function safeName(name: string): string {
  const s = (name.trim() || '未命名故事').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)
  return s || '未命名故事'
}

/** 在所选文件夹内新建项目，并登记到书架。
 *  若所选文件夹非空且不是 StoryForge 项目，则在其中新建同名子文件夹，避免覆盖既有文件。 */
export async function createProject(input: NewProjectInput): Promise<{ project: Project; info: ProjectFolderInfo }> {
  let folderPath = input.folderPath
  if (existsSync(folderPath) && !(await isFolderEmptyOrProject(folderPath))) {
    folderPath = join(folderPath, safeName(input.name))
  }
  await mkdir(folderPath, { recursive: true })

  const project: Project = {
    id: uid('proj'),
    title: input.name.trim() || '未命名故事',
    createdAt: Date.now(),
    scenes: [
      [
        {
          id: uid('card'),
          type: 'dialogue',
          speaker: '',
          text: '在这里写下你的第一句台词……',
          goto: ''
        }
      ]
    ],
    characters: [],
    backgrounds: [],
    audioTracks: [],
    videos: [],
    variables: [],
    shell: defaultGameShell(input.name.trim() || '未命名故事')
  }

  await writeFile(join(folderPath, PROJECT_FILE), JSON.stringify(project, null, 2), 'utf-8')
  if (input.coverDataUrl) {
    await writeFile(join(folderPath, COVER_FILE), dataUrlToBuffer(input.coverDataUrl))
  }

  const info: ProjectFolderInfo = {
    id: project.id,
    name: project.title,
    folderPath,
    cover: input.coverDataUrl,
    updatedAt: project.createdAt
  }
  const reg = await readRegistry()
  reg.push(info)
  await writeRegistry(reg)

  return { project, info }
}

/** 从文件夹加载完整项目 */
export async function loadProject(folderPath: string): Promise<Project | null> {
  try {
    const raw = await readFile(join(folderPath, PROJECT_FILE), 'utf-8')
    const p = JSON.parse(raw) as Project
    return withDefaultShell(p)
  } catch {
    return null
  }
}

/** 把当前项目保存到其文件夹（仅覆盖 project.json；封面由创建/更新时单独维护） */
export async function saveProjectToFolder(input: ProjectSaveInput): Promise<void> {
  await mkdir(input.folderPath, { recursive: true })
  await writeFile(join(input.folderPath, PROJECT_FILE), JSON.stringify(input.project, null, 2), 'utf-8')
  // 同步更新注册表中的名称与更新时间
  const reg = await readRegistry()
  const idx = reg.findIndex((x) => x.folderPath === input.folderPath)
  if (idx >= 0) {
    reg[idx] = {
      ...reg[idx],
      name: input.project.title,
      updatedAt: Date.now()
    }
    await writeRegistry(reg)
  }
}

/** 删除项目文件夹并移出书架（移入回收站，可恢复） */
export async function deleteProject(folderPath: string): Promise<void> {
  try {
    if (existsSync(folderPath)) {
      // moveItemToTrash 在不同 electron 类型版本下签名略有差异，这里做兼容调用
      const s = shell as unknown as { moveItemToTrash?: (p: string) => boolean; moveToTrash?: (p: string) => boolean }
      const ok = s.moveItemToTrash?.(folderPath) ?? s.moveToTrash?.(folderPath)
      if (!ok) throw new Error('trash failed')
    }
  } catch {
    // 回收站失败则直接删除
    await rm(folderPath, { recursive: true, force: true })
  }
  const reg = await readRegistry()
  await writeRegistry(reg.filter((x) => x.folderPath !== folderPath))
}

/** 打开一个已有的项目文件夹（需含 project.json），并登记到书架 */
export async function openExistingFolder(
  folderPath: string
): Promise<{ project: Project; info: ProjectFolderInfo } | null> {
  const projPath = join(folderPath, PROJECT_FILE)
  if (!existsSync(projPath)) return null
  const project = await loadProject(folderPath)
  if (!project) return null
  // 读取封面（若存在）
  let cover: string | null = null
  const coverPath = join(folderPath, COVER_FILE)
  if (existsSync(coverPath)) {
    try {
      const buf = await readFile(coverPath)
      cover = 'data:image/png;base64,' + buf.toString('base64')
    } catch {
      cover = null
    }
  }
  const info: ProjectFolderInfo = {
    id: project.id,
    name: project.title,
    folderPath,
    cover,
    updatedAt: Date.now()
  }
  const reg = await readRegistry()
  const idx = reg.findIndex((x) => x.folderPath === folderPath)
  if (idx >= 0) reg[idx] = info
  else reg.push(info)
  await writeRegistry(reg)
  return { project, info }
}

/** 校验文件夹是否为空（用于新建时提示） */
export async function isFolderEmptyOrProject(folderPath: string): Promise<boolean> {
  try {
    await access(folderPath)
    const entries = await readdir(folderPath)
    // 允许：空目录，或仅含 project.json / cover.png
    return entries.every((e) => e === PROJECT_FILE || e === COVER_FILE)
  } catch {
    // 不存在 → 视为可创建
    return true
  }
}
