import { useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import type { ProjectFolderInfo } from '@shared/types'
import logoUrl from '../assets/logo.png'
import ProjectDetailModal from './HomeShelf/ProjectDetailModal'

export default function HomeShelf(): JSX.Element {
  const shelf = useProjectStore((s) => s.shelf)
  const openProject = useProjectStore((s) => s.openProject)
  const openFolder = useProjectStore((s) => s.openFolder)
  const deleteProjectAt = useProjectStore((s) => s.deleteProjectAt)
  const openNewProjectModal = useProjectStore((s) => s.openNewProjectModal)

  // 当前选中的项目（用于显示详情弹窗）
  const [detailInfo, setDetailInfo] = useState<ProjectFolderInfo | null>(null)

  return (
    <div className="w-full h-full overflow-y-auto bg-app-bg text-ink">
      {/* 顶栏 */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-panel3/80 border-b border-edge">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center gap-3">
          <img src={logoUrl} alt="logo" className="w-9 h-9 rounded-lg" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
          <div className="flex-1">
            <div className="text-lg font-bold">StoryForge</div>
            <div className="text-[11px] text-inkdim">我的作品书架</div>
          </div>
          <button
            onClick={() => openFolder()}
            className="text-xs px-3 py-1.5 rounded-md bg-panel2 hover:bg-accent/20 text-ink border border-edge transition"
            title="打开电脑上已有的项目文件夹"
          >
            📂 打开本地项目
          </button>
        </div>
      </header>

      {/* 网格 */}
      <main className="max-w-6xl mx-auto px-8 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5 sf-stagger">
          {/* 新建卡片 */}
          <button
            onClick={() => openNewProjectModal()}
            className="group aspect-[3/4] rounded-2xl border-2 border-dashed border-edge hover:border-accent hover:bg-accent/5 flex flex-col items-center justify-center gap-2 text-inkdim hover:text-accent transition sf-hoverable"
          >
            <span className="text-4xl leading-none">＋</span>
            <span className="text-sm">创建新项目</span>
          </button>

          {shelf.map((info) => (
            <ProjectCard
              key={info.id}
              info={info}
              onClick={() => setDetailInfo(info)}
            />
          ))}
        </div>

        {shelf.length === 0 && (
          <div className="text-center text-inkdim text-sm mt-10">
            书架还是空的 —— 点击左上角「＋ 创建新项目」，选择电脑上的文件夹开始创作吧。
          </div>
        )}
      </main>

      {/* 项目详情弹窗 */}
      {detailInfo && (
        <ProjectDetailModal
          info={detailInfo}
          onClose={() => setDetailInfo(null)}
          onEdit={() => {
            setDetailInfo(null)
            openProject(detailInfo.folderPath)
          }}
          onDelete={() => {
            setDetailInfo(null)
            deleteProjectAt(detailInfo.folderPath)
          }}
        />
      )}
    </div>
  )
}

function ProjectCard({
  info,
  onClick,
}: {
  info: ProjectFolderInfo
  onClick: () => void
}): JSX.Element {
  return (
    <div
      className="group relative aspect-[3/4] rounded-2xl overflow-hidden border border-edge bg-panel2 shadow-card hover:shadow-pop sf-hoverable sf-fade-up cursor-pointer"
      onClick={onClick}
      title={`查看「${info.name}」详情`}
    >
      {/* 封面 */}
      <div className="absolute inset-0 w-full h-full">
        {info.cover ? (
          <img src={info.cover} alt={info.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-accent-grad text-white text-5xl font-bold">
            {info.name.slice(0, 1) || '·'}
          </div>
        )}
      </div>

      {/* 名称条 */}
      <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-gradient-to-t from-black/70 to-transparent pointer-events-none">
        <div className="text-white text-sm font-medium truncate">{info.name}</div>
      </div>

      {/* 查看提示（hover） */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition flex items-center justify-center pointer-events-none">
        <span className="opacity-0 group-hover:opacity-100 transition text-white text-xs bg-black/50 px-3 py-1 rounded-full">
          点击查看详情
        </span>
      </div>
    </div>
  )
}
