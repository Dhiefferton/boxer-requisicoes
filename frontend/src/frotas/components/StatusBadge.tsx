import { cn } from '../lib/cn'
import type { VeiculoStatus, ViagemStatus, ManutencaoStatus, DocumentoTipo } from '../types'

type AnyStatus = VeiculoStatus | ViagemStatus | ManutencaoStatus | string

const CONFIG: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  disponivel: { label: 'Disponível', dot: 'bg-status-available', bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400' },
  em_viagem: { label: 'Em viagem', dot: 'bg-status-trip', bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-700 dark:text-blue-400' },
  reservado: { label: 'Reservado', dot: 'bg-status-reserved', bg: 'bg-violet-50 dark:bg-violet-500/10', text: 'text-violet-700 dark:text-violet-400' },
  manutencao: { label: 'Manutenção', dot: 'bg-status-maintenance', bg: 'bg-orange-50 dark:bg-orange-500/10', text: 'text-orange-700 dark:text-orange-400' },
  bloqueado: { label: 'Bloqueado', dot: 'bg-status-blocked', bg: 'bg-red-50 dark:bg-red-500/10', text: 'text-red-700 dark:text-red-400' },
  retornando: { label: 'Retornando', dot: 'bg-status-idle', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' },
  programada: { label: 'Programada', dot: 'bg-status-idle', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' },
  concluida: { label: 'Concluída', dot: 'bg-status-available', bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400' },
  cancelada: { label: 'Cancelada', dot: 'bg-status-blocked', bg: 'bg-red-50 dark:bg-red-500/10', text: 'text-red-700 dark:text-red-400' },
  agendada: { label: 'Agendada', dot: 'bg-status-idle', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' },
  em_andamento: { label: 'Em andamento', dot: 'bg-status-maintenance', bg: 'bg-orange-50 dark:bg-orange-500/10', text: 'text-orange-700 dark:text-orange-400' },
  ok: { label: 'Em dia', dot: 'bg-status-available', bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400' },
  vencendo: { label: 'Vencendo', dot: 'bg-status-maintenance', bg: 'bg-orange-50 dark:bg-orange-500/10', text: 'text-orange-700 dark:text-orange-400' },
  vencido: { label: 'Vencido', dot: 'bg-status-blocked', bg: 'bg-red-50 dark:bg-red-500/10', text: 'text-red-700 dark:text-red-400' },
  folga: { label: 'Folga', dot: 'bg-status-idle', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' },
  ferias: { label: 'Férias', dot: 'bg-status-idle', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' },
}

export function StatusBadge({ status, className }: { status: AnyStatus; className?: string }) {
  const cfg = CONFIG[status] ?? { label: status, dot: 'bg-slate-400', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap',
        cfg.bg,
        cfg.text,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  )
}

export function statusDotColor(status: AnyStatus) {
  return CONFIG[status]?.dot ?? 'bg-slate-400'
}

export function statusLabel(status: AnyStatus) {
  return CONFIG[status]?.label ?? status
}

export function documentoTipoLabel(tipo: DocumentoTipo) {
  return tipo
}
