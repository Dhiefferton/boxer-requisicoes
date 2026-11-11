import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'

const COLOR_MAP: Record<string, { bg: string; text: string; ring: string }> = {
  available: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-100' },
  trip: { bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-100' },
  reserved: { bg: 'bg-violet-50 dark:bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', ring: 'ring-violet-100' },
  maintenance: { bg: 'bg-orange-50 dark:bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', ring: 'ring-orange-100' },
  blocked: { bg: 'bg-red-50 dark:bg-red-500/10', text: 'text-red-600 dark:text-red-400', ring: 'ring-red-100' },
  neutral: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300', ring: 'ring-slate-200' },
}

export function StatCard({
  icon: Icon,
  value,
  label,
  color = 'neutral',
  suffix,
}: {
  icon: LucideIcon
  value: string | number
  label: string
  color?: keyof typeof COLOR_MAP
  suffix?: string
}) {
  const c = COLOR_MAP[color]
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-navy-800 p-4 shadow-card sm:p-5">
      <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-4', c.bg, c.text, c.ring)}>
        <Icon size={20} strokeWidth={2.25} />
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline gap-1">
          <p className="text-2xl font-bold text-slate-900 dark:text-white leading-none">{value}</p>
          {suffix && <span className="text-xs text-slate-400 dark:text-slate-500">{suffix}</span>}
        </div>
        <p className="truncate text-sm text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  )
}

export function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-navy-800 p-4 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className="mt-1.5 text-xl font-bold text-slate-900 dark:text-white">{value}</p>
      {hint && <p className="mt-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">{hint}</p>}
    </div>
  )
}
