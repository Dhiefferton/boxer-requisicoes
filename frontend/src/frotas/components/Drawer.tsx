import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export function Drawer({
  open,
  onClose,
  title,
  children,
  side = 'right',}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  side?: 'left' | 'right'
}) {
  return (
    <div
      className={`fixed inset-0 z-50 transition ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-slate-900/40 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        className={`absolute top-0 h-full w-80 max-w-[85vw] bg-white dark:bg-navy-800 shadow-popover transition-transform duration-200 ${
          side === 'right' ? 'right-0' : 'left-0'
        } ${open ? 'translate-x-0' : side === 'right' ? 'translate-x-full' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300">
            <X size={18} />
          </button>
        </div>
        <div className="h-[calc(100%-57px)] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}
