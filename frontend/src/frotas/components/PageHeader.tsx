import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function PrimaryButton({
  children,
  onClick,
  icon: Icon,
  className,
}: {
  children: ReactNode
  onClick?: () => void
  icon?: React.ComponentType<{ size?: number }>
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 active:bg-brand-800 ${className ?? ''}`}
    >
      {Icon && <Icon size={17} />}
      {children}
    </button>
  )
}

export function SecondaryButton({
  children,
  onClick,
  icon: Icon,
  className,
}: {
  children: ReactNode
  onClick?: () => void
  icon?: React.ComponentType<{ size?: number }>
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-navy-800 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm transition hover:bg-slate-50 dark:hover:bg-navy-950 ${className ?? ''}`}
    >
      {Icon && <Icon size={17} />}
      {children}
    </button>
  )
}
