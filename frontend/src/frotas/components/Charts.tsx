import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { cn } from '../lib/cn'

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  boxShadow: '0 10px 30px -5px rgba(15,23,42,0.15)',
  fontSize: 13,
}

export function TripsBarChart({ data }: { data: { periodo: string; viagens: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#eef2f7" />
        <XAxis dataKey="periodo" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={30} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f1f5f9' }} />
        <Bar dataKey="viagens" fill="#3470f2" radius={[6, 6, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function FuelCostLineChart({ data }: { data: { mes: string; custo: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#eef2f7" />
        <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={40} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        />
        <Line type="monotone" dataKey="custo" stroke="#ea580c" strokeWidth={2.5} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function FrotaComparativoChart({
  frotaPropria,
  transportadora,
  economiaPercentual,
}: {
  frotaPropria: number
  transportadora: number
  economiaPercentual: number
}) {
  const max = Math.max(frotaPropria, transportadora)
  return (
    <div className="flex h-[220px] flex-col justify-center gap-5">
      <div>
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-600 dark:text-slate-300">Frota própria</span>
          <span className="font-semibold text-slate-900 dark:text-white">
            {frotaPropria.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${(frotaPropria / max) * 100}%` }} />
        </div>
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-600 dark:text-slate-300">Transportadoras</span>
          <span className="font-semibold text-slate-900 dark:text-white">
            {transportadora.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full rounded-full bg-slate-400" style={{ width: `${(transportadora / max) * 100}%` }} />
        </div>
      </div>
      <div
        className={cn(
          'flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm',
          economiaPercentual >= 0 ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-red-50 dark:bg-red-500/10',
        )}
      >
        <span className={cn('font-semibold', economiaPercentual >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')}>
          Economia gerada
        </span>
        <span className={cn('ml-auto font-bold', economiaPercentual >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')}>
          {economiaPercentual}%
        </span>
      </div>
    </div>
  )
}
