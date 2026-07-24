/// <reference types="vite/client" />

import type { StoryForgeApi } from '../preload/index'

interface ImportMetaEnv {
  readonly VITE_AI_MODE?: 'mock' | 'real'
  readonly VITE_OPENAI_API_KEY?: string
  readonly VITE_SD_API_URL?: string
  readonly VITE_SUNO_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare global {
  interface Window {
    storyforge: StoryForgeApi
  }
}

export {}
