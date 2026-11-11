import type { LucideIcon } from 'lucide-react'
import { Inbox, AlertOctagon } from 'lucide-react'

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-navy-900/60 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
        <Icon size={22} />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {description && <p className="mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ description }: { description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-red-100 bg-red-50/60 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-500 dark:text-red-400">
        <AlertOctagon size={22} />
      </div>
      <p className="mt-3 text-sm font-semibold text-red-700 dark:text-red-400">Não foi possível carregar os dados</p>
      {description && <p className="mt-1 max-w-xs text-sm text-red-500 dark:text-red-400">{description}</p>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-skeleton rounded-lg bg-slate-200 dark:bg-slate-700 ${className ?? 'h-4 w-full'}`} />
}

export function LoadingCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-navy-800 p-4 shadow-card">
          <Skeleton className="h-11 w-11 rounded-xl" />
          <Skeleton className="mt-3 h-6 w-12" />
          <Skeleton className="mt-2 h-3 w-20" />
        </div>
      ))}
    </div>
  )
}

export function LoadingTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-xl" />
      ))}
    </div>
  )
}
