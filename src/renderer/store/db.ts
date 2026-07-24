import Dexie, { type Table } from 'dexie'
import type { Project } from '@shared/types'

/** IndexedDB via Dexie —— 项目持久化 */
export class StoryForgeDB extends Dexie {
  projects!: Table<Project, string>

  constructor() {
    super('storyforge')
    this.version(1).stores({
      projects: 'id, title, createdAt'
    })
  }
}

export const db = new StoryForgeDB()

export async function saveProject(project: Project): Promise<void> {
  await db.projects.put(project)
}

export async function loadProject(id: string): Promise<Project | undefined> {
  return db.projects.get(id)
}

export async function listProjects(): Promise<Project[]> {
  return db.projects.toArray()
}

export async function deleteProject(id: string): Promise<void> {
  await db.projects.delete(id)
}
