import { useState } from 'react'
import { Route, Fuel, DollarSign, BarChart3, Wrench, FileText, Truck } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/Card'
import { SelectFilter } from '../components/Filters'
import { useToast } from '../components/Toast'
import { useAsync } from '../lib/hooks'
import {
  listVeiculos,
  listMotoristas,
  listViagens,
  listManutencoes,
  listDocumentos,
  listCustosViagem,
  getConfiguracaoCombustivel,
} from '../lib/supabaseClient'
import { calcularCotacaoTransportadora, calcularCustoReal, calcularSaving } from '../lib/custoViagem'
import { formatarHora } from '../lib/stats'
import { baixarCSV } from '../lib/csv'
import type { Viagem } from '../types'

const RELATORIOS = [
  { id: 'viagens', titulo: 'Viagens', icon: Route, cor: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10' },
  { id: 'combustivel', titulo: 'Combustível', icon: Fuel, cor: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10' },
  { id: 'custos', titulo: 'Custos', icon: DollarSign, cor: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' },
  { id: 'comparativo', titulo: 'Comparativo', icon: BarChart3, cor: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10' },
  {
    id: 'lotacao',
    titulo: 'Custo de Lotação',
    icon: Truck,
    cor: 'text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10',
  },
  { id: 'manutencao', titulo: 'Manutenção', icon: Wrench, cor: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10' },
  { id: 'documentos', titulo: 'Documentos', icon: FileText, cor: 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800' },
] as const

type Periodo = 'semana' | 'mes' | 'trimestre'

interface Filtro {
  periodo: Periodo
  veiculoId: string
  motoristaId: string
}

const FILTRO_PADRAO: Filtro = { periodo: 'mes', veiculoId: 'todos', motoristaId: 'todos' }

function cutoffPara(periodo: Periodo): Date {
  const dias = periodo === 'semana' ? 7 : periodo === 'trimestre' ? 90 : 30
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d
}

export function Relatorios() {
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [filtros, setFiltros] = useState<Record<string, Filtro>>({})
  const [gerando, setGerando] = useState<string | null>(null)
  const { show } = useToast()

  const { data: veiculos } = useAsync(() => listVeiculos(), [])
  const { data: motoristas } = useAsync(() => listMotoristas(), [])
  const { data: viagens } = useAsync(() => listViagens(), [])
  const { data: manutencoes } = useAsync(() => listManutencoes(), [])
  const { data: documentos } = useAsync(() => listDocumentos(), [])
  const { data: custos } = useAsync(() => listCustosViagem(), [])
  const { data: config } = useAsync(() => getConfiguracaoCombustivel(), [])

  const precoDieselLitro = config?.precoDieselLitro ?? 0
  const custosPorViagem = new Map((custos ?? []).map((c) => [c.viagemId, c]))
  // Combustível de cada viagem já rodada (em_viagem/concluída) — mesma fonte
  // usada no Dashboard e na tela Combustível, calculada automaticamente por
  // km rodado. Viagens agendadas ainda não têm combustível calculado.
  function combustivelDaViagem(v: Viagem) {
    return custosPorViagem.get(v.id)?.combustivel ?? 0
  }
  function viagemRodada(v: Viagem) {
    return v.status === 'em_viagem' || v.status === 'concluida'
  }

  function getFiltro(id: string): Filtro {
    return filtros[id] ?? FILTRO_PADRAO
  }

  function atualizarFiltro(id: string, mudanca: Partial<Filtro>) {
    setFiltros((f) => ({ ...f, [id]: { ...getFiltro(id), ...mudanca } }))
  }

  function nomeVeiculo(id: string) {
    return veiculos?.find((v) => v.id === id)?.placa ?? id
  }
  function nomeMotorista(id: string) {
    return motoristas?.find((m) => m.id === id)?.nome ?? id
  }

  async function gerarRelatorio(reportId: string) {
    const f = getFiltro(reportId)
    const cutoff = cutoffPara(f.periodo)
    const titulo = RELATORIOS.find((r) => r.id === reportId)?.titulo ?? reportId
    setGerando(reportId)

    try {
      let linhas: (string | number)[][] = []
      let arquivo = ''

      switch (reportId) {
        case 'viagens': {
          const dados = (viagens ?? []).filter((v) => {
            if (new Date(v.data) < cutoff) return false
            if (f.veiculoId !== 'todos' && v.veiculoId !== f.veiculoId) return false
            if (f.motoristaId !== 'todos' && v.motoristaId !== f.motoristaId) return false
            return true
          })
          linhas = [
            ['Número', 'Data', 'Veículo', 'Motorista', 'Origem', 'Destino', 'Status', 'KM'],
            ...dados.map((v) => [v.numero, v.data, nomeVeiculo(v.veiculoId), nomeMotorista(v.motoristaId), v.origem, v.destino, v.status, v.km ?? '']),
          ]
          arquivo = 'relatorio-viagens'
          break
        }
        case 'combustivel': {
          const dados = (viagens ?? []).filter((v) => {
            if (!viagemRodada(v)) return false
            if (new Date(v.data) < cutoff) return false
            if (f.veiculoId !== 'todos' && v.veiculoId !== f.veiculoId) return false
            return true
          })
          linhas = [
            ['Nº', 'Data', 'Veículo', 'KM', 'Litros (estimado)', 'Combustível (R$)'],
            ...dados.map((v) => {
              const combustivel = combustivelDaViagem(v)
              const litros = precoDieselLitro > 0 ? combustivel / precoDieselLitro : 0
              return [v.numero, v.data, nomeVeiculo(v.veiculoId), v.km ?? '', litros.toFixed(1), combustivel.toFixed(2)]
            }),
          ]
          arquivo = 'relatorio-combustivel'
          break
        }
        case 'custos': {
          const comb = (viagens ?? [])
            .filter((v) => viagemRodada(v) && new Date(v.data) >= cutoff && (f.veiculoId === 'todos' || v.veiculoId === f.veiculoId))
            .map((v) => ['Combustível', v.data, nomeVeiculo(v.veiculoId), v.numero, combustivelDaViagem(v)])
          const manut = (manutencoes ?? [])
            .filter((m) => new Date(m.dataInicio) >= cutoff && (f.veiculoId === 'todos' || m.veiculoId === f.veiculoId))
            .map((m) => ['Manutenção', m.dataInicio, nomeVeiculo(m.veiculoId), m.descricao, m.custo ?? 0])
          const linhasCusto = [...comb, ...manut] as (string | number)[][]
          const total = linhasCusto.reduce((s, l) => s + Number(l[4]), 0)
          linhas = [
            ['Tipo', 'Data', 'Veículo', 'Descrição', 'Valor (R$)'],
            ...linhasCusto.map((l) => [l[0], l[1], l[2], l[3], Number(l[4]).toFixed(2)]),
            ['Total', '', '', '', total.toFixed(2)],
          ]
          arquivo = 'relatorio-custos'
          break
        }
        case 'comparativo': {
          const lista = f.veiculoId === 'todos' ? veiculos ?? [] : (veiculos ?? []).filter((v) => v.id === f.veiculoId)
          linhas = [
            ['Veículo', 'Viagens', 'KM rodado', 'Combustível (R$)', 'Manutenção (R$)'],
            ...lista.map((v) => {
              const viagensV = (viagens ?? []).filter((vg) => vg.veiculoId === v.id && new Date(vg.data) >= cutoff)
              const kmRodado = viagensV.reduce((s, vg) => s + (vg.km ?? 0), 0)
              const custoComb = viagensV.reduce((s, vg) => s + combustivelDaViagem(vg), 0)
              const custoManut = (manutencoes ?? [])
                .filter((m) => m.veiculoId === v.id && new Date(m.dataInicio) >= cutoff)
                .reduce((s, m) => s + (m.custo ?? 0), 0)
              return [v.placa, viagensV.length, kmRodado, custoComb.toFixed(2), custoManut.toFixed(2)]
            }),
          ]
          arquivo = 'relatorio-comparativo'
          break
        }
        case 'lotacao': {
          // Mesmas colunas, na mesma ordem, da aba "DADOS" da planilha
          // "Levantamento Custo Lotação" (SharePoint) — só viagens concluídas.
          // COTAÇÃO RODOCARGO / CUSTO DA VIAGEM REAL / SAVING usam o mesmo
          // cálculo já usado no comparativo "Frota própria x Transportadoras"
          // do Dashboard.
          const custosPorViagem = new Map((custos ?? []).map((c) => [c.viagemId, c]))
          const dados = (viagens ?? []).filter((v) => {
            if (v.status !== 'concluida') return false
            if (new Date(v.data) < cutoff) return false
            if (f.veiculoId !== 'todos' && v.veiculoId !== f.veiculoId) return false
            if (f.motoristaId !== 'todos' && v.motoristaId !== f.motoristaId) return false
            return true
          })
          linhas = [
            [
              'DATA',
              'MÊS',
              'NOTA',
              'VALOR DA NF',
              'PESO DA NF',
              'DESTINO',
              'CIDADE',
              'HORÁRIO DE SAÍDA',
              'HORÁRIO DE RETORNO',
              'KM INICIAL',
              'KM FINAL',
              'TOTAL KM RODADO',
              'SEG 0,45% CARGA',
              'COMBUSTÍVEL',
              'PEDÁGIO',
              'COTAÇÃO RODOCARGO',
              'CUSTO DA VIAGEM REAL',
              'SAVING',
            ],
            ...dados.map((v) => {
              const custo = custosPorViagem.get(v.id)
              const custoReal = calcularCustoReal({
                kmRodado: v.km,
                combustivel: custo?.combustivel ?? 0,
                seguroCarga: custo?.seguroCarga ?? 0,
                pedagio: custo?.pedagio ?? 0,
              })
              const cotacao = calcularCotacaoTransportadora(v.km)
              // "yyyy-mm-dd" — extrai o mês direto da string, sem passar por
              // Date (evita o problema de fuso já documentado em stats.ts).
              const mes = /^\d{4}-(\d{2})/.exec(v.data)?.[1]
              return [
                v.data,
                mes ? String(Number(mes)) : '',
                custo?.notas ?? '',
                (custo?.valorNota ?? 0).toFixed(2),
                custo?.peso ?? '',
                custo?.destinoNota || v.destino,
                '', // CIDADE — não existe campo equivalente no sistema hoje
                v.saidaReal ? formatarHora(v.saidaReal) : '',
                v.chegadaReal ? formatarHora(v.chegadaReal) : '',
                v.kmSaida ?? '',
                v.kmChegada ?? '',
                v.km ?? '',
                (custo?.seguroCarga ?? 0).toFixed(2),
                (custo?.combustivel ?? 0).toFixed(2),
                (custo?.pedagio ?? 0).toFixed(2),
                cotacao.toFixed(2),
                custoReal.toFixed(2),
                calcularSaving(cotacao, custoReal).toFixed(2),
              ]
            }),
          ]
          arquivo = 'relatorio-custo-lotacao'
          break
        }
        case 'manutencao': {
          const dados = (manutencoes ?? []).filter((m) => {
            if (new Date(m.dataInicio) < cutoff) return false
            if (f.veiculoId !== 'todos' && m.veiculoId !== f.veiculoId) return false
            return true
          })
          linhas = [
            ['Veículo', 'Tipo', 'Descrição', 'Status', 'Início', 'Fim', 'Custo (R$)', 'Oficina'],
            ...dados.map((m) => [
              nomeVeiculo(m.veiculoId),
              m.tipo,
              m.descricao,
              m.status,
              m.dataInicio,
              m.dataFim ?? '',
              (m.custo ?? 0).toFixed(2),
              m.oficina ?? '',
            ]),
          ]
          arquivo = 'relatorio-manutencao'
          break
        }
        case 'documentos': {
          const dados = (documentos ?? []).filter((d) => f.veiculoId === 'todos' || d.entidadeId === f.veiculoId)
          linhas = [
            ['Entidade', 'Tipo', 'Número', 'Validade', 'Status'],
            ...dados.map((d) => [d.entidade, d.tipo, d.numero ?? '', d.validade ?? '', d.status]),
          ]
          arquivo = 'relatorio-documentos'
          break
        }
      }

      if (linhas.length <= 1) {
        show('Nenhum dado encontrado para os filtros selecionados.', 'warning')
        return
      }

      baixarCSV(`${arquivo}-${new Date().toISOString().slice(0, 10)}.csv`, linhas)
      show(`Relatório de ${titulo.toLowerCase()} gerado com sucesso.`)
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erro ao gerar relatório.', 'error')
    } finally {
      setGerando(null)
    }
  }

  return (
    <div>
      <PageHeader title="Relatórios" subtitle="Gere relatórios detalhados sobre a operação da frota" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {RELATORIOS.map((r) => {
          const aberto = selecionado === r.id
          const f = getFiltro(r.id)
          return (
            <Card key={r.id} className="flex flex-col">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${r.cor}`}>
                  <r.icon size={19} />
                </div>
                <p className="font-semibold text-slate-900 dark:text-white">{r.titulo}</p>
              </div>

              <button
                onClick={() => setSelecionado(aberto ? null : r.id)}
                className="mt-4 text-left text-sm font-medium text-brand-600 hover:underline"
              >
                {aberto ? 'Ocultar filtros' : 'Configurar filtros'}
              </button>

              {aberto && (
                <div className="mt-3 space-y-2.5 border-t border-slate-100 dark:border-slate-800 pt-3">
                  <SelectFilter
                    label="Período"
                    value={f.periodo}
                    onChange={(v) => atualizarFiltro(r.id, { periodo: v as Periodo })}
                    options={[
                      { value: 'semana', label: 'Última semana' },
                      { value: 'mes', label: 'Último mês' },
                      { value: 'trimestre', label: 'Último trimestre' },
                    ]}
                  />
                  <SelectFilter
                    label="Veículo"
                    value={f.veiculoId}
                    onChange={(v) => atualizarFiltro(r.id, { veiculoId: v })}
                    options={[
                      { value: 'todos', label: 'Todos os veículos' },
                      ...(veiculos ?? []).map((v) => ({ value: v.id, label: v.placa })),
                    ]}
                  />
                  <SelectFilter
                    label="Motorista"
                    value={f.motoristaId}
                    onChange={(v) => atualizarFiltro(r.id, { motoristaId: v })}
                    options={[
                      { value: 'todos', label: 'Todos os motoristas' },
                      ...(motoristas ?? []).map((m) => ({ value: m.id, label: m.nome })),
                    ]}
                  />
                </div>
              )}

              <button
                onClick={() => gerarRelatorio(r.id)}
                disabled={gerando === r.id}
                className="mt-4 w-full rounded-xl bg-navy-900 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-800 disabled:opacity-60"
              >
                {gerando === r.id ? 'Gerando…' : 'Gerar relatório'}
              </button>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
