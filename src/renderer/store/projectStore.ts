import { create } from 'zustand'
import type {
  AudioTrack,
  Background,
  CardType,
  Character,
  GameShell,
  GameShellSettings,
  GameShellStart,
  Project,
  ProjectFolderInfo,
  ScriptCard,
  ShellMenuItem,
  Variable,
  VideoClip,
  NewProjectInput
} from '@shared/types'
import { defaultGameShell, withDefaultShell } from '@shared/types'
import { uid } from '../lib/id'
import { looksLikeCharacterName } from '../lib/characterName'
import { listProjects as listDbProjects, saveProject } from './db'
import { createDemoProject } from '../data/demoProject'

export type ViewMode = 'timeline' | 'nodegraph'

interface Cursor {
  scene: number
  card: number // index within scene
}

interface Toast {
  id: string
  text: string
  kind: 'info' | 'success' | 'warn' | 'error'
}

export type SaveStatus = 'idle' | 'saving' | 'saved'

interface ProjectState {
  project: Project
  cursor: Cursor
  selectedCardId: string | null
  viewMode: ViewMode
  theme: 'light' | 'dark'
  ready: boolean
  toasts: Toast[]

  // 书架 / 编辑器视图切换
  view: 'shelf' | 'editor'
  shelf: ProjectFolderInfo[]
  currentFolder: string | null
  newProjectModalOpen: boolean

  // 全局背景音乐（贯穿整个项目，单页 music 可覆盖）
  globalBgmId: string | null

  // 保存状态指示灯：idle 空闲 / saving 保存中 / saved 已保存
  saveStatus: SaveStatus

  // 导入时自增，用于剧情页自动滚动到最新识别内容
  importTick: number

  // undo / redo
  past: Project[]
  future: Project[]

  // ---- lifecycle ----
  init: () => Promise<void>
  newProject: () => void
  replaceProject: (p: Project) => void

  // ---- 书架 / 项目文件夹 ----
  goHome: () => void
  refreshShelf: () => Promise<void>
  createProject: (input: NewProjectInput) => Promise<void>
  openProject: (folderPath: string) => Promise<void>
  peekProject: (folderPath: string) => Promise<import('@shared/types').Project | null>
  openFolder: () => Promise<void>
  saveToFolder: () => Promise<void>
  deleteProjectAt: (folderPath: string) => Promise<void>
  deleteCurrentProject: () => void
  openNewProjectModal: () => void
  closeNewProjectModal: () => void

  // ---- selection & view ----
  selectCard: (id: string | null) => void
  setCursor: (c: Cursor) => void
  setViewMode: (m: ViewMode) => void
  toggleTheme: () => void

  // ---- card ops ----
  insertCardAt: (sceneIdx: number, afterIdx: number, type: CardType) => string
  updateCard: (id: string, patch: Partial<ScriptCard>) => void
  deleteCard: (id: string) => void
  deleteCards: (ids: string[]) => void
  moveCard: (sceneIdx: number, from: number, to: number) => void
  /** 流式导入：把一段识别出的卡片实时并入主场景，并串好 goto */
  appendCards: (cards: ScriptCard[], characters: Character[]) => void
  /** 导入开始时清空主场景（避免残留的起始空卡片） */
  clearMainScene: () => void

  // ---- resource ops ----
  addCharacter: (name?: string, portrait?: string) => string
  updateCharacter: (id: string, patch: Partial<Character>) => void
  removeCharacter: (id: string) => void
  addBackground: (name?: string, image?: string) => string
  updateBackground: (id: string, patch: Partial<Background>) => void
  removeBackground: (id: string) => void
  addAudioTrack: (type: AudioTrack['type'], name?: string, src?: string) => string
  /** 批量导入音轨（多选文件），自动按名称排序后插入 */
  addAudioTracks: (type: AudioTrack['type'], files: { fileName: string; dataUrl: string }[]) => string[]
  updateAudioTrack: (id: string, patch: Partial<AudioTrack>) => void
  removeAudioTrack: (id: string) => void
  /** 设置 / 清除全局背景音乐 */
  setGlobalBgmId: (id: string | null) => void
  addVariable: () => void
  updateVariable: (id: string, patch: Partial<Variable>) => void
  removeVariable: (id: string) => void

  // ---- 角色多表情立绘 ----
  addPortrait: (charId: string, key: string, dataUrl?: string) => void
  removePortrait: (charId: string, key: string) => void
  renamePortrait: (charId: string, oldKey: string, newKey: string) => void
  setPortrait: (charId: string, key: string, dataUrl: string) => void

  // ---- 视频 / 动态 CG ----
  addVideo: (name?: string, src?: string) => string
  updateVideo: (id: string, patch: Partial<VideoClip>) => void
  removeVideo: (id: string) => void

  // ---- 批量引用 / 智能配图 ----
  applyBackgroundToCards: (bgId: string, scope: 'all' | 'empty' | number) => void
  applyPortraitToCharacter: (charId: string, expression: string) => void
  ensureCharactersFromSpeakers: () => number
  autoAssignBackgrounds: () => number

  updateMeta: (patch: Partial<Pick<Project, 'title'>>) => void

  // ---- 游戏外壳（开始界面 / 菜单 / 设置） ----
  updateShell: (patch: Partial<GameShell>) => void
  updateShellStart: (patch: Partial<GameShellStart>) => void
  updateShellSettings: (patch: Partial<GameShellSettings>) => void
  addShellMenuItem: () => void
  updateShellMenuItem: (id: string, patch: Partial<ShellMenuItem>) => void
  removeShellMenuItem: (id: string) => void

  // ---- undo ----
  undo: () => void
  redo: () => void

  // ---- 手动保存（Ctrl+S） ----
  saveNow: () => void

  // ---- toast ----
  toast: (text: string, kind?: Toast['kind']) => void
  dismissToast: (id: string) => void
}

const clone = (p: Project): Project => JSON.parse(JSON.stringify(p))
const UNDO_LIMIT = 200

// 访问主进程桥接（Electron 由 preload 注入；Web 由 webShim 注入）。不存在时为 undefined。
const sfApi = (): any => (window as unknown as { storyforge?: any }).storyforge

// Web 演示版书架：用 IndexedDB 中的项目列表充当书架（无本地文件夹概念）
async function listProjectsDb(): Promise<ProjectFolderInfo[]> {
  try {
    const all = await listDbProjects()
    return all.map((p) => ({
      id: p.id,
      name: p.title,
      folderPath: p.id, // 合成伪路径
      cover: null,
      updatedAt: p.createdAt
    }))
  } catch {
    return []
  }
}

// 文件夹同步节流计时器（与 IndexedDB 自动保存解耦，避免大文件频繁落盘）
let folderSaveTimer: ReturnType<typeof setTimeout> | null = null

let saveTimer: ReturnType<typeof setTimeout> | null = null
type SetState = (partial: Partial<ProjectState>) => void

function scheduleSave(project: Project, set: SetState): void {
  set({ saveStatus: 'saving' })
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveProject(clone(project))
      .then(() => set({ saveStatus: 'saved' }))
      .catch((e) => {
        console.error('autosave failed', e)
        set({ saveStatus: 'idle' })
      })
  }, 400)

  // 若当前项目已绑定本地文件夹，节流地将最新进度同步到文件夹（防丢稿）
  const folder = useProjectStore.getState().currentFolder
  if (folder) {
    if (folderSaveTimer) clearTimeout(folderSaveTimer)
    folderSaveTimer = setTimeout(() => {
      const s = useProjectStore.getState()
      if (!s.currentFolder) return
      sfApi()
        ?.saveProjectToFolder?.({ folderPath: s.currentFolder, project: clone(s.project) })
        .catch(() => {})
    }, 1500)
  }
}

export const useProjectStore = create<ProjectState>((set, get) => {
  /** 通用可撤销变更：先快照，再修改，再自动保存 + 推预览 */
  const mutate = (mutator: (draft: Project) => void): void => {
    const { project, past } = get()
    const snapshot = clone(project)
    const draft = clone(project)
    mutator(draft)
    const newPast = [...past, snapshot]
    if (newPast.length > UNDO_LIMIT) newPast.shift()
    set({ project: draft, past: newPast, future: [] })
    scheduleSave(draft, set)
    pushPreview(draft, get().cursor)
  }

  return {
    project: createDemoProject(),
    cursor: { scene: 0, card: 0 },
    selectedCardId: null,
    viewMode: 'timeline',
    theme:
      (typeof localStorage !== 'undefined' && (localStorage.getItem('storyforge_theme') as 'light' | 'dark')) ||
      'light',
    ready: false,
    toasts: [],
    view: 'shelf',
    shelf: [],
    currentFolder: null,
    newProjectModalOpen: false,
    globalBgmId: null,
    saveStatus: 'idle',
    importTick: 0,
    past: [],
    future: [],

    init: async () => {
      // 进入书架：列出本地项目，不直接打开编辑器
      const a = sfApi()
      if (a?.listProjects) {
        try {
          const list = await a.listProjects()
          set({ shelf: list, ready: true, view: 'shelf' })
          return
        } catch {
          /* 回落到 IndexedDB 书架 */
        }
      }
      // Web 演示版 / 桥接不可用时：用 IndexedDB 中的项目列表作为书架
      try {
        const list = await listProjectsDb()
        set({ shelf: list, ready: true, view: 'shelf' })
      } catch {
        set({ shelf: [], ready: true, view: 'shelf' })
      }
    },

    newProject: () => {
      const p: Project = {
        id: uid('proj'),
        title: '未命名故事',
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
        shell: defaultGameShell('未命名故事')
      }
      set({ project: p, past: [], future: [], cursor: { scene: 0, card: 0 }, selectedCardId: p.scenes[0][0].id })
      scheduleSave(p, set)
      get().toast('已新建故事', 'success')
    },

    // ---- 书架 / 项目文件夹 ----
    goHome: () => {
      // 离开编辑器前，把当前进度同步到项目文件夹
      const { currentFolder, project } = get()
      if (currentFolder) {
        const a = sfApi()
        a?.saveProjectToFolder?.({ folderPath: currentFolder, project: clone(project) }).catch(() => {})
      }
      get().refreshShelf()
      set({ view: 'shelf' })
    },

    refreshShelf: async () => {
      const a = sfApi()
      if (a?.listProjects) {
        try {
          const list = await a.listProjects()
          set({ shelf: list })
          return
        } catch {
          /* ignore */
        }
      }
      try {
        const list = await listProjectsDb()
        set({ shelf: list })
      } catch {
        /* ignore */
      }
    },

    createProject: async (input) => {
      const a = sfApi()
      if (!a?.createProject) {
        get().toast('创建项目需在桌面应用中运行', 'warn')
        return
      }
      try {
        const { project: p, info } = await a.createProject(input)
        set({
          project: p,
          currentFolder: info.folderPath,
          view: 'editor',
          past: [],
          future: [],
          cursor: { scene: 0, card: 0 },
          selectedCardId: p.scenes[0]?.[0]?.id ?? null,
          newProjectModalOpen: false,
          globalBgmId: p.globalBgmId ?? null
        })
        get().toast(`已创建「${p.title}」`, 'success')
      } catch (e) {
        get().toast('创建失败：' + (e instanceof Error ? e.message : String(e)), 'error')
      }
    },

    openProject: async (folderPath) => {
      const a = sfApi()
      if (!a?.openProject) {
        get().toast('打开项目需在桌面应用中运行', 'warn')
        return
      }
      const p = await a.openProject(folderPath)
      if (!p) {
        get().toast('无法读取该项目', 'error')
        return
      }
      set({
        project: p,
        currentFolder: folderPath,
        view: 'editor',
        past: [],
        future: [],
        cursor: { scene: 0, card: 0 },
        selectedCardId: p.scenes[0]?.[0]?.id ?? null,
        globalBgmId: p.globalBgmId ?? null
      })
    },

    /** 仅加载项目数据用于预览（不切换到编辑器视图） */
    peekProject: async (folderPath) => {
      const a = sfApi()
      if (!a?.openProject) {
        // Web 环境：从 IndexedDB 读取
        const { loadProject } = await import('./db')
        const p = await loadProject(folderPath)
        return p ? { ...p } : null
      }
      return a.openProject(folderPath)
    },

    openFolder: async () => {
      const a = sfApi()
      if (!a?.openFolder) {
        get().toast('打开文件夹需在桌面应用中运行', 'warn')
        return
      }
      const res = await a.openFolder()
      if (!res) {
        get().toast('所选文件夹不是有效的项目', 'warn')
        return
      }
      set({
        project: res.project,
        currentFolder: res.info.folderPath,
        view: 'editor',
        past: [],
        future: [],
        cursor: { scene: 0, card: 0 },
        selectedCardId: res.project.scenes[0]?.[0]?.id ?? null,
        globalBgmId: res.project.globalBgmId ?? null
      })
    },

    saveToFolder: async () => {
      const { currentFolder, project } = get()
      if (!currentFolder) return
      const a = sfApi()
      if (!a?.saveProjectToFolder) return
      try {
        await a.saveProjectToFolder({ folderPath: currentFolder, project: clone(project) })
      } catch (e) {
        get().toast('保存到文件夹失败：' + (e instanceof Error ? e.message : String(e)), 'error')
      }
    },

    deleteProjectAt: async (folderPath) => {
      const a = sfApi()
      if (!a?.deleteProjectAt) {
        get().toast('删除项目需在桌面应用中运行', 'warn')
        return
      }
      await a.deleteProjectAt(folderPath)
      if (get().currentFolder === folderPath) {
        set({ currentFolder: null })
      }
      await get().refreshShelf()
    },

    deleteCurrentProject: () => {
      const { currentFolder } = get()
      if (currentFolder) {
        get().deleteProjectAt(currentFolder)
        set({ currentFolder: null, view: 'shelf' })
      } else {
        // 无文件夹的临时工程：回退为空白
        const p: Project = {
          id: uid('proj'),
          title: '未命名故事',
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
          shell: defaultGameShell('未命名故事')
        }
        set({ project: p, past: [], future: [], cursor: { scene: 0, card: 0 }, selectedCardId: p.scenes[0][0].id })
      }
      get().toast('已删除当前故事', 'success')
    },

    openNewProjectModal: () => set({ newProjectModalOpen: true }),
    closeNewProjectModal: () => set({ newProjectModalOpen: false }),

    replaceProject: (p) => {
      const safe = withDefaultShell(p)
      set({ project: safe, past: [], future: [], cursor: { scene: 0, card: 0 }, selectedCardId: safe.scenes[0]?.[0]?.id ?? null, globalBgmId: safe.globalBgmId ?? null })
      scheduleSave(safe, set)
    },

    selectCard: (id) => set({ selectedCardId: id }),
    setCursor: (c) => set({ cursor: c }),
    setViewMode: (m) => set({ viewMode: m }),
    toggleTheme: () => {
      const next = get().theme === 'dark' ? 'light' : 'dark'
      if (typeof localStorage !== 'undefined') localStorage.setItem('storyforge_theme', next)
      document.documentElement.classList.toggle('dark', next === 'dark')
      set({ theme: next })
    },

    insertCardAt: (sceneIdx, afterIdx, type) => {
      const newId = uid('card')
      mutate((d) => {
        const scene = d.scenes[sceneIdx] || (d.scenes[sceneIdx] = [])
        const card: ScriptCard = defaultCard(newId, type)
        const anchor = scene[afterIdx]
        // 新卡片接管锚点原本的下一跳，保留既有分支流
        card.goto = anchor ? anchor.goto || '' : scene[afterIdx + 1]?.id ?? ''
        if (anchor && anchor.type !== 'choice') anchor.goto = newId
        scene.splice(afterIdx + 1, 0, card)
      })
      set({ selectedCardId: newId, cursor: { scene: sceneIdx, card: afterIdx + 1 } })
      return newId
    },

    updateCard: (id, patch) =>
      mutate((d) => {
        for (const scene of d.scenes) {
          const c = scene.find((x) => x.id === id)
          if (c) {
            Object.assign(c, patch)
            return
          }
        }
      }),

    deleteCard: (id) =>
      mutate((d) => {
        for (const scene of d.scenes) {
          const i = scene.findIndex((x) => x.id === id)
          if (i >= 0) {
            const bypass = scene[i].goto || ''
            scene.splice(i, 1)
            // 把所有指向被删卡片的跳转改为其后继，保持流程连续
            for (const c of scene) {
              if (c.goto === id) c.goto = bypass
              if (c.choices) c.choices = c.choices.map((ch) => (ch.goto === id ? { ...ch, goto: bypass } : ch))
            }
            return
          }
        }
      }),

    deleteCards: (ids) =>
      mutate((d) => {
        const idSet = new Set(ids)
        for (const scene of d.scenes) {
          // 从后往前删除避免索引偏移
          for (let i = scene.length - 1; i >= 0; i--) {
            if (idSet.has(scene[i].id)) {
              scene.splice(i, 1)
            }
          }
          // 修复所有指向被删卡片的 goto/choices → 指向下一个存活卡片
          const aliveIds = new Set(scene.map((c) => c.id))
          for (let ci = 0; ci < scene.length; ci++) {
            const c = scene[ci]
            if (c.goto && !aliveIds.has(c.goto)) {
              c.goto = scene[ci + 1]?.id || ''
            }
            if (c.choices) {
              c.choices = c.choices.map((ch) =>
                ch.goto && !aliveIds.has(ch.goto)
                  ? { ...ch, goto: scene[ci + 1]?.id || '' }
                  : ch
              )
            }
          }
        }
      }),

    moveCard: (sceneIdx, from, to) =>
      mutate((d) => {
        const scene = d.scenes[sceneIdx]
        if (!scene) return
        // 仅调整展示顺序；流程由 goto 决定，不改动跳转关系
        const [item] = scene.splice(from, 1)
        scene.splice(to, 0, item)
      }),

    appendCards: (cards, characters) => {
      mutate((d) => {
        const scene = d.scenes[0] || (d.scenes[0] = [])
        const tail = scene[scene.length - 1]
        // 上一段（或既有内容）末尾 → 本段第一张
        if (tail && cards.length) tail.goto = cards[0].id
        // 段内顺序串联
        for (let i = 0; i < cards.length; i++) {
          cards[i].goto = cards[i + 1]?.id ?? ''
        }
        scene.push(...cards)
        // 合并角色：按 id / name 去重
        const ids = new Set(d.characters.map((c) => c.id))
        const names = new Set(d.characters.map((c) => c.name))
        for (const c of characters) {
          if (!ids.has(c.id) && !names.has(c.name)) d.characters.push(c)
        }
      })
      set((s) => ({ importTick: s.importTick + 1 }))
    },

    clearMainScene: () =>
      mutate((d) => {
        d.scenes[0] = []
      }),

    addCharacter: (name, portrait) => {
      const id = uid('char')
      mutate((d) => {
        d.characters.push({
          id,
          name: name || `角色${d.characters.length + 1}`,
          portraits: { normal: portrait || '' },
          color: pickColor(d.characters.length)
        })
      })
      return id
    },
    updateCharacter: (id, patch) =>
      mutate((d) => {
        const c = d.characters.find((x) => x.id === id)
        if (c) Object.assign(c, patch)
      }),
    removeCharacter: (id) =>
      mutate((d) => {
        d.characters = d.characters.filter((x) => x.id !== id)
      }),

    // ---- 角色多表情立绘 ----
    addPortrait: (charId, key, dataUrl) =>
      mutate((d) => {
        const c = d.characters.find((x) => x.id === charId)
        if (!c) return
        // 避免覆盖已有表情：重名自动追加序号
        let k = key.trim() || `表情${Object.keys(c.portraits).length + 1}`
        let n = 2
        while (c.portraits[k] !== undefined) k = `${key}_${n++}`
        c.portraits[k] = dataUrl || ''
      }),
    setPortrait: (charId, key, dataUrl) =>
      mutate((d) => {
        const c = d.characters.find((x) => x.id === charId)
        if (c) c.portraits[key] = dataUrl
      }),
    removePortrait: (charId, key) =>
      mutate((d) => {
        const c = d.characters.find((x) => x.id === charId)
        if (!c) return
        // 至少保留一个表情，避免角色无立绘键
        if (Object.keys(c.portraits).length <= 1) return
        delete c.portraits[key]
      }),
    renamePortrait: (charId, oldKey, newKey) =>
      mutate((d) => {
        const c = d.characters.find((x) => x.id === charId)
        if (!c) return
        const nk = newKey.trim()
        if (!nk || nk === oldKey || c.portraits[nk] !== undefined) return
        const rebuilt: Record<string, string> = {}
        for (const [k, v] of Object.entries(c.portraits)) rebuilt[k === oldKey ? nk : k] = v
        c.portraits = rebuilt
      }),

    // ---- 视频 / 动态 CG ----
    addVideo: (name, src) => {
      const id = uid('vid')
      mutate((d) => {
        d.videos.push({ id, name: name || `视频${d.videos.length + 1}`, src: src || '', loop: true, volume: 80 })
      })
      return id
    },
    updateVideo: (id, patch) =>
      mutate((d) => {
        const v = d.videos.find((x) => x.id === id)
        if (v) Object.assign(v, patch)
      }),
    removeVideo: (id) =>
      mutate((d) => {
        d.videos = d.videos.filter((x) => x.id !== id)
        for (const scene of d.scenes) for (const c of scene) if (c.video === id) c.video = ''
      }),

    // ---- 批量引用 / 智能配图 ----
    applyBackgroundToCards: (bgId, scope) =>
      mutate((d) => {
        d.scenes.forEach((scene, si) => {
          if (typeof scope === 'number' && si !== scope) return
          for (const c of scene) {
            if (scope === 'empty' && c.background) continue
            c.background = bgId
          }
        })
      }),
    applyPortraitToCharacter: (charId, expression) =>
      mutate((d) => {
        const ch = d.characters.find((x) => x.id === charId)
        if (!ch) return
        const expr = expression || 'normal'
        for (const scene of d.scenes)
          for (const c of scene) if (c.speaker === ch.name) c.expression = expr
      }),
    ensureCharactersFromSpeakers: () => {
      const existing = new Set<string>()
      let created = 0
      mutate((d) => {
        d.characters.forEach((c) => existing.add(c.name))
        const palette = ['#ff8fab', '#5cc8ff', '#ffd166', '#9b5de5', '#06d6a0', '#f4845f', '#4ea8de', '#e07a5f']
        const speakers = new Set<string>()
        d.scenes.forEach((scene) => scene.forEach((c) => c.speaker && speakers.add(c.speaker)))
        speakers.forEach((name) => {
          if (!existing.has(name) && looksLikeCharacterName(name)) {
            d.characters.push({ id: uid('char'), name, portraits: { normal: '' }, color: palette[d.characters.length % palette.length] })
            existing.add(name)
            created++
          }
        })
      })
      return created
    },
    autoAssignBackgrounds: () => {
      let assigned = 0
      mutate((d) => {
        // 为每张背景计算可搜索标签（名称 + 昼夜 + 天气）
        const tagged = d.backgrounds.map((b) => ({ id: b.id, tags: bgTags(b) }))
        if (!tagged.length) return
        d.scenes.forEach((scene) => {
          scene.forEach((c) => {
            if (c.background) return // 仅填充未设置背景的卡片，避免覆盖人工选择
            const text = (c.text || '').toLowerCase()
            if (!text) return
            const hit = tagged.find((t) => t.tags.some((tag) => text.includes(tag)))
            if (hit) {
              c.background = hit.id
              assigned++
            }
          })
        })
      })
      return assigned
    },

    addBackground: (name, image) => {
      const id = uid('bg')
      mutate((d) => {
        d.backgrounds.push({
          id,
          name: name || `背景${d.backgrounds.length + 1}`,
          image: image || '',
          weather: 'none',
          timeOfDay: 'day'
        })
      })
      return id
    },
    updateBackground: (id, patch) =>
      mutate((d) => {
        const b = d.backgrounds.find((x) => x.id === id)
        if (b) Object.assign(b, patch)
      }),
    removeBackground: (id) =>
      mutate((d) => {
        d.backgrounds = d.backgrounds.filter((x) => x.id !== id)
        // 清理引用
        for (const scene of d.scenes) for (const c of scene) if (c.background === id) c.background = ''
        if (d.shell.start.backgroundId === id) d.shell.start.backgroundId = null
      }),

    addAudioTrack: (type, name, src) => {
      const id = uid('au')
      mutate((d) => {
        d.audioTracks.push({ id, name: name || `${type}-${d.audioTracks.length + 1}`, type, src: src || '' })
      })
      return id
    },
    updateAudioTrack: (id, patch) =>
      mutate((d) => {
        const a = d.audioTracks.find((x) => x.id === id)
        if (a) Object.assign(a, patch)
      }),
    removeAudioTrack: (id) =>
      mutate((d) => {
        d.audioTracks = d.audioTracks.filter((x) => x.id !== id)
        for (const scene of d.scenes) for (const c of scene) if (c.music === id) c.music = ''
        // 若删除的是全局BGM，同步清除
        if (d.globalBgmId === id) d.globalBgmId = null
      }),

    addAudioTracks: (type, files) => {
      const ids: string[] = []
      mutate((d) => {
        const startIdx = d.audioTracks.length
        for (const f of files) {
          const id = uid('au')
          d.audioTracks.push({ id, name: f.fileName, type, src: f.dataUrl })
          ids.push(id)
        }
        // 仅对同类型内部按名称排序（保持类型分组语义）
        const sameType = d.audioTracks.filter((a) => a.type === type)
        const otherTypes = d.audioTracks.filter((a) => a.type !== type)
        sameType.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
        d.audioTracks = [...otherTypes, ...sameType]
      })
      return ids
    },

    setGlobalBgmId: (id) =>
      mutate((d) => {
        d.globalBgmId = id
      }),

    addVariable: () =>
      mutate((d) => {
        d.variables.push({ id: uid('var'), name: `变量${d.variables.length + 1}`, type: 'number', initial: 0 })
      }),
    updateVariable: (id, patch) =>
      mutate((d) => {
        const v = d.variables.find((x) => x.id === id)
        if (v) Object.assign(v, patch)
      }),
    removeVariable: (id) =>
      mutate((d) => {
        d.variables = d.variables.filter((x) => x.id !== id)
        // 清理卡片中引用该变量的操作
        for (const scene of d.scenes)
          for (const c of scene)
            if (c.variableOps) c.variableOps = c.variableOps.filter((op) => op.varId !== id)
      }),

    updateMeta: (patch) => mutate((d) => Object.assign(d, patch)),

    updateShell: (patch) =>
      mutate((d) => {
        d.shell = { ...d.shell, ...patch }
      }),
    updateShellStart: (patch) =>
      mutate((d) => {
        d.shell.start = { ...d.shell.start, ...patch }
      }),
    updateShellSettings: (patch) =>
      mutate((d) => {
        d.shell.settings = { ...d.shell.settings, ...patch }
      }),
    addShellMenuItem: () =>
      mutate((d) => {
        d.shell.start.menu.push({ id: uid('m'), label: '新菜单项', action: 'start' })
      }),
    updateShellMenuItem: (id, patch) =>
      mutate((d) => {
        const m = d.shell.start.menu.find((x) => x.id === id)
        if (m) Object.assign(m, patch)
      }),
    removeShellMenuItem: (id) =>
      mutate((d) => {
        d.shell.start.menu = d.shell.start.menu.filter((x) => x.id !== id)
      }),

    undo: () => {
      const { past, project, future } = get()
      if (past.length === 0) {
        get().toast('没有可撤销的操作', 'info')
        return
      }
      const previous = past[past.length - 1]
      const newPast = past.slice(0, -1)
      set({ project: previous, past: newPast, future: [clone(project), ...future].slice(0, UNDO_LIMIT) })
      scheduleSave(previous, set)
      pushPreview(previous, get().cursor)
    },
    redo: () => {
      const { future, project, past } = get()
      if (future.length === 0) return
      const next = future[0]
      set({ project: next, future: future.slice(1), past: [...past, clone(project)].slice(-UNDO_LIMIT) })
      scheduleSave(next, set)
      pushPreview(next, get().cursor)
    },

    saveNow: () => {
      const { project, currentFolder } = get()
      saveProject(clone(project))
        .then(() => set({ saveStatus: 'saved' }))
        .catch(() => set({ saveStatus: 'idle' }))
      // 同步到本地文件夹（若有绑定）
      if (currentFolder) {
        const a = sfApi()
        if (a?.saveProjectToFolder) {
          a.saveProjectToFolder({ folderPath: currentFolder, project: clone(project) })
            .then(() => get().toast('已保存到项目文件夹 ✓', 'success'))
            .catch(() => get().toast('保存到文件夹失败', 'error'))
        } else {
          get().toast('已保存（文件夹同步需在桌面应用中运行）', 'success')
        }
      } else {
        get().toast('已保存 ✓', 'success')
      }
    },

    toast: (text, kind = 'info') => {
      const id = uid('toast')
      set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }))
      setTimeout(() => get().dismissToast(id), 2600)
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  }
})

// ---------- helpers ----------

function pushPreview(project: Project, cursor: Cursor): void {
  const w = (window as unknown as { storyforge?: { pushPreviewUpdate: (p: unknown) => void } }).storyforge
  w?.pushPreviewUpdate({ project, cursor })
}

function defaultCard(id: string, type: CardType): ScriptCard {
  const base: ScriptCard = { id, type, goto: '' }
  switch (type) {
    case 'dialogue':
      return { ...base, speaker: '', text: '新的台词……', position: 'center', expression: 'normal' }
    case 'choice':
      return { ...base, text: '做出选择：', choices: [{ label: '选项一', goto: '' }, { label: '选项二', goto: '' }] }
    case 'bgSwitch':
      return { ...base, background: '', text: '切换背景' }
    case 'portraitSwitch':
      return { ...base, speaker: '', expression: 'normal', position: 'center', text: '立绘切换' }
    case 'music':
      return { ...base, music: '', text: '播放音乐' }
    case 'video':
      return { ...base, video: '', text: '视频字幕（可选）' }
    case 'transition':
      return { ...base, transition: { kind: 'fade', duration: 500 }, text: '转场' }
    case 'variableOp':
      return { ...base, variableOps: [{ varId: '', op: 'add', value: 1 }], text: '变量赋值' }
    default:
      return base
  }
}

const PALETTE = ['#ff8fab', '#5cc8ff', '#ffd166', '#9b5de5', '#06d6a0', '#f4845f', '#4ea8de', '#e07a5f']
function pickColor(i: number): string {
  return PALETTE[i % PALETTE.length]
}

// 背景可搜索标签：名称（去扩展名 + 中文别名）+ 昼夜 + 天气
const BG_NAME_ALIAS: Record<string, string[]> = {
  gate: ['校门', '门口', '校门口'],
  class: ['教室', '课堂', '上课'],
  roof: ['天台', '屋顶', '楼顶'],
  room: ['房间', '卧室', '室内'],
  sea: ['海', '海边', '沙滩'],
  beach: ['海', '海边', '沙滩'],
  forest: ['森林', '林', '树林'],
  street: ['街', '街道', '城市', '都市'],
  city: ['街', '街道', '城市', '都市'],
  cafe: ['咖啡', '咖啡厅'],
  home: ['家', '家里'],
  park: ['公园', '操场']
}
const BG_TIME_TAGS: Record<string, string[]> = {
  day: ['白天', '日', '晨', '清晨', '上午', '中午'],
  dusk: ['黄昏', '傍晚', '夕阳', '日落'],
  night: ['夜', '夜晚', '夜里', '深夜', '星空']
}
const BG_WEATHER_TAGS: Record<string, string[]> = {
  rain: ['雨', '雨天', '下雨'],
  snow: ['雪', '雪天'],
  sakura: ['樱花', '樱'],
  star: ['星', '星空']
}
function bgTags(b: Background): string[] {
  const tags: string[] = []
  const base = (b.name || '').toLowerCase().replace(/\.[a-z0-9]+$/i, '')
  if (base) {
    tags.push(base)
    ;(BG_NAME_ALIAS[base] || []).forEach((t) => tags.push(t))
  }
  if (b.timeOfDay && BG_TIME_TAGS[b.timeOfDay]) tags.push(...BG_TIME_TAGS[b.timeOfDay])
  if (b.weather && BG_WEATHER_TAGS[b.weather]) tags.push(...BG_WEATHER_TAGS[b.weather])
  return tags
}
