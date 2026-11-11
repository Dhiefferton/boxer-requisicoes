import { useMemo, useState } from 'react'
import { Fuel } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { FilterBar, SearchInput, SelectFilter } from '../components/Filters'
import { Table, type Column } from '../components/Table'
import { Card, CardHeader } from '../components/Card'
import { MiniStat } from '../components/StatCard'
import { FuelCostLineChart } from '../components/Charts'
import { EmptyState, ErrorState, LoadingCards } from '../components/States'
import { useAsync } from '../lib/hooks'
import { listViagens, listVeiculos, listMotoristas, listCustosViagem, getConfiguracaoCombustivel } from '../lib/supabaseClient'
import { custoCombustivelViagensMensal, formatarData, formatarMoeda } from '../lib/stats'
import type { Viagem } from '../types'

/** Uma linha da tela: a viagem + o combustível calculado pra ela (0 quando
 *  ainda não existe uma linha em custos_viagem, ex.: viagem recém-criada). */
interface Linha {
  id: string
  viagem: Viagem
  combustivel: number
}

export function Combustivel() {
  const [busca, setBusca] = useState('')
  const [veiculoFiltro, setVeiculoFiltro] = useState('todos')

  const viagensState = useAsync(() => listViagens(), [])
  const veiculosState = useAsync(() => listVeiculos(), [])
  const motoristasState = useAsync(() => listMotoristas(), [])
  const custosState = useAsync(() => listCustosViagem(), [])
  const configState = useAsync(() => getConfiguracaoCombustivel(), [])

  const carregando = viagensState.loading || veiculosState.loading || motoristasState.loading || custosState.loading || configState.loading
  const erro = viagensState.error ?? veiculosState.error ?? motoristasState.error ?? custosState.error ?? configState.error

  const veiculos = veiculosState.data ?? []
  const motoristas = motoristasState.data ?? []
  const veiculosPorId = useMemo(() => new Map(veiculos.map((v) => [v.id, v])), [veiculos])
  const motoristasPorId = useMemo(() => new Map(motoristas.map((m) => [m.id, m])), [motoristas])
  const custosPorViagem = useMemo(() => new Map((custosState.data ?? []).map((c) => [c.viagemId, c])), [custosState.data])

  // Só entram na tela viagens que já saíram (mesmo filtro da tela Custo de
  // Viagem) — uma viagem "programada" ainda não tem combustível calculado.
  const linhas: Linha[] = useMemo(() => {
    return (viagensState.data ?? [])
      .filter((v) => v.status === 'em_viagem' || v.status === 'concluida')
      .map((viagem) => ({ id: viagem.id, viagem, combustivel: custosPorViagem.get(viagem.id)?.combustivel ?? 0 }))
  }, [viagensState.data, custosPorViagem])

  const filtradas = useMemo(() => {
    return linhas.filter(({ viagem }) => {
      const motorista = motoristasPorId.get(viagem.motoristaId)
      const bateBusca =
        !busca ||
        viagem.numero.toLowerCase().includes(busca.toLowerCase()) ||
        viagem.destino.toLowerCase().includes(busca.toLowerCase()) ||
        motorista?.nome.toLowerCase().includes(busca.toLowerCase())
      const bateVeiculo = veiculoFiltro === 'todos' || viagem.veiculoId === veiculoFiltro
      return bateBusca && bateVeiculo
    })
  }, [linhas, busca, veiculoFiltro, motoristasPorId])

  const precoDieselLitro = configState.data?.precoDieselLitro ?? 0
  const dadosCombustivel = useMemo(
    () => custoCombustivelViagensMensal(viagensState.data ?? [], custosState.data ?? []),
    [viagensState.data, custosState.data],
  )

  const totalCombustivel = filtradas.reduce((s, l) => s + l.combustivel, 0)
  const totalLitros = precoDieselLitro > 0 ? totalCombustivel / precoDieselLitro : 0

  const columns: Column<Linha>[] = [
    { header: 'Nº', accessor: ({ viagem }) => <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{viagem.numero}</span> },
    { header: 'Data', accessor: ({ viagem }) => formatarData(viagem.data) },
    { header: 'Veículo', accessor: ({ viagem }) => veiculosPorId.get(viagem.veiculoId)?.placa ?? '—' },
    { header: 'Motorista', accessor: ({ viagem }) => motoristasPorId.get(viagem.motoristaId)?.nome ?? '—' },
    { header: 'KM', accessor: ({ viagem }) => (viagem.km ? viagem.km.toLocaleString('pt-BR') : '—') },
    {
      header: 'Litros (estimado)',
      accessor: ({ combustivel }) => (precoDieselLitro > 0 ? `${(combustivel / precoDieselLitro).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L` : '—'),
    },
    { header: 'Combustível', accessor: ({ combustivel }) => formatarMoeda(combustivel) },
  ]

  return (
    <div>
      <PageHeader
        title="Combustível"
        subtitle="Combustível calculado automaticamente por viagem: KM rodado ÷ consumo médio × preço do diesel"
      />

      <FilterBar>
        <SearchInput value={busca} onChange={setBusca} placeholder="Buscar por número, destino ou motorista…" className="w-full sm:w-80" />
        <SelectFilter
          value={veiculoFiltro}
          onChange={setVeiculoFiltro}
          options={[{ value: 'todos', label: 'Todos os veículos' }, ...veiculos.map((v) => ({ value: v.id, label: v.placa }))]}
        />
      </FilterBar>

      <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
        Consumo médio e preço do diesel são configurados na tela Custo de Viagem, no card "Custos automáticos".
      </p>

      {erro ? (
        <ErrorState description={erro} />
      ) : carregando ? (
        <LoadingCards count={4} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <MiniStat label="Litros" value={`${totalLitros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L`} />
            <MiniStat label="Custo total" value={formatarMoeda(totalCombustivel)} />
            <MiniStat label="Preço do diesel" value={`${formatarMoeda(precoDieselLitro)}/L`} />
            <MiniStat label="Viagens" value={String(filtradas.length)} />
          </div>

          <Card className="mt-4">
            <CardHeader title="Custo de combustível" subtitle="Evolução mensal" />
            <FuelCostLineChart data={dadosCombustivel} />
          </Card>

          <div className="mt-4">
            {filtradas.length === 0 ? (
              <EmptyState icon={Fuel} title="Nenhuma viagem encontrada" description="Viagens em andamento ou concluídas aparecem aqui." />
            ) : (
              <Table
                columns={columns}
                rows={filtradas}
                renderMobileCard={(linha) => (
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-900 dark:text-white">{veiculosPorId.get(linha.viagem.veiculoId)?.placa}</p>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{formatarMoeda(linha.combustivel)}</p>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>{formatarData(linha.viagem.data)}</span>
                      <span>{linha.viagem.km ? `${linha.viagem.km.toLocaleString('pt-BR')} km` : '—'}</span>
                    </div>
                  </Card>
                )}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
