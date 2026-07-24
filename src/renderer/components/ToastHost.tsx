import { useProjectStore } from '../store/projectStore'

const COLORS: Record<string, string> = {
  info: 'border-accent2 text-accent2',
  success: 'border-[#0a9d78] text-[#0a9d78]',
  warn: 'border-[#c47f00] text-[#c47f00]',
  error: 'border-[#e5484d] text-[#e5484d]'
}

export default function ToastHost(): JSX.Element {
  const toasts = useProjectStore((s) => s.toasts)
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`sf-toast px-4 py-2 rounded-lg bg-panel3 border ${COLORS[t.kind] || COLORS.info} shadow-lg text-sm`}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}
