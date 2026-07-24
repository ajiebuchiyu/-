import { useEffect, useRef, useState } from 'react'
import type { Project } from '@shared/types'
import GameRuntime from './GameRuntime'

export default function PreviewApp(): JSX.Element {
  const [project, setProject] = useState<Project | null>(null)
  const [startId, setStartId] = useState<string | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    const api = (window as any).storyforge
    if (!api) return
    const off = api.onPreviewUpdate((payload: { project: Project; cursor: { scene: number; card: number }; reset?: boolean }) => {
      // 项目热更新：直接替换，GameRuntime 会在下一帧重绘当前卡片（< 200ms）
      setProject(payload.project)
      // reset=true 表示用户主动要求从此处开始预览（重新选择卡片 / 再次点击预览）
      if (payload.reset) {
        startedRef.current = false
      }
      if (!startedRef.current) {
        const scene = payload.project.scenes[payload.cursor.scene] || payload.project.scenes[0] || []
        setStartId(scene[payload.cursor.card]?.id ?? scene[0]?.id ?? null)
        startedRef.current = true
      }
    })
    return off
  }, [])

  if (!project) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-inkdim">
        <div className="text-center">
          <div className="text-3xl mb-2">🎬</div>
          <div>等待编辑器推送剧情……</div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-black">
      <GameRuntime project={project} startCardId={startId} interactive />
    </div>
  )
}
