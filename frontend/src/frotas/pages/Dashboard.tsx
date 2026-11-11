import { useMemo, useState } from 'react'
import { Truck, Route, Clock, Wrench, Ban, ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatCard, MiniStat } from '../components/StatCard'
import { Card, CardHeader } from '../components/Card'
import { SegmentedControl } from '../components/Filters'
import { TripsBarChart, FuelCostLineChart, FrotaComparativoChart } from '../components/Charts'
import { LoadingCards, ErrorState } from '../components/States'
import { useAsync } from '../lib/hooks'
import { listVeiculos, listViagens, listCustosViagem, getConfiguracaoCombustivel } from '../lib/supabaseClient'
import {
  contarPorStatus,
  viagensPorPeriodo,
  custoCombustivelViagensMensal,
  frotaPropriaVsTransportadora,
  kpisSecundarios,
  pertenceAoMes,
  type PeriodoViagens,
} from '../lib/stats'

const CARDS = [
  { status: 'disponivel' as const, label: 'Disponíveis', icon: Truck, color: 'available' as const },
  { status: 'em_viagem' as const, label: 'Em viagem', icon: Route, color: 'trip' as const },
  { status: 'reservado' as const, label: 'Reservados', icon: Clock, color: 'reserved' as const },
  { status: 'manutencao' as const, label: 'Manutenção', icon: Wrench, color: 'maintenance' as const },
  { status: 'bloqueado' as const, label: 'Bloqueados', icon: Ban, color: 'blocked' as const },
]

export function Dashboard() {
  const [periodo, setPeriodo] = useState<PeriodoViagens>('semanal')
  const [mesRef, setMesRef] = useState(() => new Date())

  const veiculosState = useAsync(() => listVeiculos(), [])
  const viagensState = useAsync(() => listViagens(), [])
  const custosState = useAsync(() => listCustosViagem(), [])
  const configState = useAsync(() => getConfiguracaoCombustivel(), [])

  const carregando = veiculosState.loading || viagensState.loading || custosState.loading || configState.loading
  const erro = veiculosState.error ?? viagensState.error ?? custosState.error ?? configState.error

  const veiculos = useMemo(() => veiculosState.data ?? [], [veiculosState.data])
  const viagens = useMemo(() => viagensState.data ?? [], [viagensState.data])
  const custos = useMemo(() => custosState.data ?? [], [custosState.data])
  const precoDieselLitro = configState.data?.precoDieselLitro ?? 0

  const totalFrota = veiculos.length

  // Viagens só do mês escolhido no seletor — usadas nos KPIs e no
  // comparativo de frota.
  const viagensDoMes = useMemo(() => viagens.filter((v) => pertenceAoMes(v.data, mesRef)), [viagens, mesRef])

  // O gráfico "Viagens por período" também é ancorado no mês escolhido no
  // seletor (mesRef), não em "hoje" — senão mostra dados de outro mês
  // enquanto o usuário navega para um mês diferente.
  const dadosViagens = useMemo(() => viagensPorPeriodo(viagens, periodo, mesRef), [viagens, periodo, mesRef])
  const dadosCombustivel = useMemo(() => custoCombustivelViagensMensal(viagens, custos), [viagens, custos])
  const dadosComparativo = useMemo(() => frotaPropriaVsTransportadora(viagensDoMes, custos), [viagensDoMes, custos])
  const kpis = useMemo(
    () => kpisSecundarios(viagensDoMes, custos, precoDieselLitro, dadosComparativo.saving),
    [viagensDoMes, custos, precoDieselLitro, dadosComparativo.saving],
  )

  function navegarMes(direcao: 1 | -1) {
    setMesRef((d) => {
      const nd = new Date(d)
      nd.setMonth(nd.getMonth() + direcao)
      return nd
    })
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral da sua frota em tempo real"
        action={
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-navy-800 px-1.5 py-1 shadow-sm">
            <button
              onClick={() => navegarMes(-1)}
              className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Mês anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-[130px] text-center text-sm font-medium capitalize text-slate-700 dark:text-slate-200">
              {mesRef.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
            <button
              onClick={() => navegarMes(1)}
              className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Próximo mês"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        }
      />

      {erro ? (
        <ErrorState description={erro} />
      ) : carregando ? (
        <>
          <LoadingCards count={5} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
            {CARDS.map((c) => (
              <StatCard
                key={c.status}
                icon={c.icon}
                value={contarPorStatus(veiculos, c.status)}
                label={c.label}
                color={c.color}
                suffix={`de ${totalFrota}`}
              />
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
            {kpis.map((k) => (
              <MiniStat key={k.label} label={k.label} value={k.valor} />
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader
                title="Viagens por período"
                action={
                  <SegmentedControl
                    value={periodo}
                    onChange={(v) => setPeriodo(v as PeriodoViagens)}
                    options={[
                      { value: 'diario', label: 'Diário' },
                      { value: 'semanal', label: 'Semanal' },
                      { value: 'mensal', label: 'Mensal' },
                    ]}
                  />
                }
              />
              <TripsBarChart data={dadosViagens} />
            </Card>

            <Card>
              <CardHeader title="Custo de combustível" subtitle="Últimos meses" />
              <FuelCostLineChart data={dadosCombustivel} />
            </Card>

            <Card>
              <CardHeader title="Frota própria x Transportadoras" subtitle="Custo real x cotação de transportadora" />
              <FrotaComparativoChart
                frotaPropria={dadosComparativo.frotaPropria}
                transportadora={dadosComparativo.transportadora}
                economiaPercentual={dadosComparativo.economiaPercentual}
              />
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
