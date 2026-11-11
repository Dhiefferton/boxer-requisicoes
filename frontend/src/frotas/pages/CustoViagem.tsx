import { useEffect, useMemo, useState } from 'react'
import { Calculator, ChevronDown, ChevronUp, Fuel, Pencil, Plus, Route, Search, Trash2, TrendingDown, TrendingUp } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { FilterBar, SearchInput, SelectFilter } from '../components/Filters'
import { Table, type Column } from '../components/Table'
import { EmptyState, ErrorState, LoadingTable } from '../components/States'
import { Card } from '../components/Card'
import { Modal, ConfirmationModal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { useAsync } from '../lib/hooks'
import {
  listViagens,
  listVeiculos,
  listMotoristas,
  listCustosViagem,
  salvarCustoViagem,
  getConfiguracaoCombustivel,
  salvarConfiguracaoCombustivelERecalcular,
  listClientesPedagioPadrao,
  salvarClientePedagioPadrao,
  excluirClientePedagioPadrao,
} from '../lib/supabaseClient'
import { formatarData, formatarMoeda } from '../lib/stats'
import {
  calcularCombustivelEstimado,
  calcularCotacaoTransportadora,
  calcularCustoReal,
  calcularSaving,
  encontrarPedagioPadrao,
} from '../lib/custoViagem'
import { buscarESomarNotas } from '../lib/zenerp'
import type { ClientePedagioPadrao, CustoViagem, Viagem } from '../types'
import { cn } from '../lib/cn'

const FORM_INICIAL = { valorNota: '', peso: '', destinoNota: '' }

/** Tira todos os números de dentro do texto de notas fiscais (ex.: "106190/106191" →
 *  ["106190", "106191"]), usado para já sugerir os números a buscar no ZenERP quando
 *  o motorista informou as notas — uma viagem pode ter mais de uma nota. */
function extrairNumerosDeNotas(notas: string | undefined) {
  return notas?.match(/\d+/g) ?? []
}

/** Uma linha da tela: a viagem + os campos de custo (quando ainda não
 *  existe uma linha em custos_viagem para ela, usa os valores padrão). */
interface Linha {
  id: string
  viagem: Viagem
  custo: CustoViagem
}

const CHAVE_CUSTOS_AUTOMATICOS = 'boxer-frotas:custo-viagem:custos-automaticos-aberto'

export function CustoViagem() {
  // Painel "Custos automáticos" (combustível + pedágio padrão) pode ser
  // ocultado; a escolha fica lembrada neste navegador. Aberto por padrão.
  const [custosAutomaticosAbertos, setCustosAutomaticosAbertos] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_CUSTOS_AUTOMATICOS) !== 'fechado'
    } catch {
      return true
    }
  })
  function alternarCustosAutomaticos() {
    setCustosAutomaticosAbertos((aberto) => {
      const proximo = !aberto
      try {
        localStorage.setItem(CHAVE_CUSTOS_AUTOMATICOS, proximo ? 'aberto' : 'fechado')
      } catch {
        // Sem localStorage (janela privada etc.): só não lembra a escolha.
      }
      return proximo
    })
  }
  const [busca, setBusca] = useState('')
  const [veiculoFiltro, setVeiculoFiltro] = useState('todos')
  const [editando, setEditando] = useState<Linha | null>(null)
  const [form, setForm] = useState(FORM_INICIAL)
  const [salvando, setSalvando] = useState(false)
  const [numeroNota, setNumeroNota] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [buscaInfo, setBuscaInfo] = useState<string | null>(null)
  const [consumoForm, setConsumoForm] = useState('')
  const [precoForm, setPrecoForm] = useState('')
  const [salvandoConfig, setSalvandoConfig] = useState(false)
  const [clienteEdits, setClienteEdits] = useState<Record<string, { cliente: string; valorPadrao: string }>>({})
  const [novoCliente, setNovoCliente] = useState('')
  const [novoValorPadrao, setNovoValorPadrao] = useState('')
  const [salvandoCliente, setSalvandoCliente] = useState<string | null>(null)
  const [excluindoCliente, setExcluindoCliente] = useState<ClientePedagioPadrao | null>(null)
  const { show } = useToast()

  const viagensState = useAsync(() => listViagens(), [])
  const veiculosState = useAsync(() => listVeiculos(), [])
  const motoristasState = useAsync(() => listMotoristas(), [])
  const custosState = useAsync(() => listCustosViagem(), [])
  const configState = useAsync(() => getConfiguracaoCombustivel(), [])
  const clientesState = useAsync(() => listClientesPedagioPadrao(), [])
  const clientes = useMemo(() => clientesState.data ?? [], [clientesState.data])

  // Viagens e custos são recarregados sozinhos a cada 20s. Sem isso, uma
  // viagem que o motorista inicia (já com a nota fiscal preenchida) só
  // aparecia atualizada aqui na próxima vez que a tela fosse recarregada do
  // zero — até lá, o gestor via a linha da viagem "em_viagem" já na tabela
  // (calculada a partir de viagensState, que carrega antes) mas sem os
  // dados de custos_viagem que o motorista acabou de salvar.
  useEffect(() => {
    const id = setInterval(() => {
      viagensState.reload()
      custosState.reload()
    }, 20000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (configState.data) {
      setConsumoForm(String(configState.data.consumoMedioKmL))
      setPrecoForm(String(configState.data.precoDieselLitro))
    }
  }, [configState.data])

  useEffect(() => {
    if (clientesState.data) {
      setClienteEdits(Object.fromEntries(clientesState.data.map((c) => [c.id, { cliente: c.cliente, valorPadrao: String(c.valorPadrao) }])))
    }
  }, [clientesState.data])

  async function salvarCliente(id: string) {
    const edit = clienteEdits[id]
    const valor = edit ? Number(edit.valorPadrao) : NaN
    if (!edit || !edit.cliente.trim() || !valor || valor <= 0) {
      show('Informe um nome de cliente e um valor de pedágio válidos (maior que zero).')
      return
    }
    setSalvandoCliente(id)
    try {
      await salvarClientePedagioPadrao({ id, cliente: edit.cliente, valorPadrao: valor })
      show('Cliente atualizado.')
      clientesState.reload()
      custosState.reload()
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erro ao salvar cliente.')
    } finally {
      setSalvandoCliente(null)
    }
  }

  async function adicionarCliente() {
    const valor = Number(novoValorPadrao)
    if (!novoCliente.trim() || !valor || valor <= 0) {
      show('Informe um nome de cliente e um valor de pedágio válidos (maior que zero).')
      return
    }
    setSalvandoCliente('novo')
    try {
      await salvarClientePedagioPadrao({ cliente: novoCliente, valorPadrao: valor })
      show('Cliente adicionado.')
      setNovoCliente('')
      setNovoValorPadrao('')
      clientesState.reload()
      custosState.reload()
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erro ao adicionar cliente.')
    } finally {
      setSalvandoCliente(null)
    }
  }

  async function confirmarExclusaoCliente() {
    if (!excluindoCliente) return
    try {
      await excluirClientePedagioPadrao(excluindoCliente.id)
      show('Cliente removido.')
      clientesState.reload()
      custosState.reload()
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erro ao remover cliente.')
    } finally {
      setExcluindoCliente(null)
    }
  }

  async function salvarConfig() {
    if (!configState.data) return
    const consumo = Number(consumoForm)
    const preco = Number(precoForm)
    if (!consumo || consumo <= 0 || !preco || preco <= 0) {
      show('Informe consumo médio e preço do diesel válidos (maiores que zero).')
      return
    }
    setSalvandoConfig(true)
    try {
      const quantidade = await salvarConfiguracaoCombustivelERecalcular({
        id: configState.data.id,
        consumoMedioKmL: consumo,
        precoDieselLitro: preco,
      })
      show(
        quantidade > 0
          ? `Combustível recalculado em ${quantidade} viagem(ns) deste mês.`
          : 'Configuração salva. Nenhuma viagem deste mês para recalcular ainda.',
      )
      configState.reload()
      custosState.reload()
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erro ao salvar a configuração de combustível.')
    } finally {
      setSalvandoConfig(false)
    }
  }

  const carregando = viagensState.loading || veiculosState.loading || motoristasState.loading || custosState.loading
  const erro = viagensState.error ?? veiculosState.error ?? motoristasState.error ?? custosState.error

  const veiculos = veiculosState.data ?? []
  const motoristas = motoristasState.data ?? []
  const veiculosPorId = useMemo(() => new Map(veiculos.map((v) => [v.id, v])), [veiculos])
  const motoristasPorId = useMemo(() => new Map(motoristas.map((m) => [m.id, m])), [motoristas])
  const custosPorViagem = useMemo(() => new Map((custosState.data ?? []).map((c) => [c.viagemId, c])), [custosState.data])

  // Só entram na tela viagens que já saíram (têm KM rodado ou notas/pedágio
  // preenchidos) — uma viagem "programada" ainda não tem o que calcular.
  const linhas: Linha[] = useMemo(() => {
    return (viagensState.data ?? [])
      .filter((v) => v.status === 'em_viagem' || v.status === 'concluida')
      .map((viagem) => ({
        id: viagem.id,
        viagem,
        custo: custosPorViagem.get(viagem.id) ?? {
          id: '',
          viagemId: viagem.id,
          combustivel: 0,
          pedagio: 0,
          seguroCarga: 0,
        },
      }))
  }, [viagensState.data, custosPorViagem])

  /** Pedágio "efetivo" de uma viagem: se o destino bate com um cliente
   *  cadastrado, usa o valor padrão dele em vez do que o motorista informou. */
  function pedagioEfetivo(linha: Linha) {
    const padrao = encontrarPedagioPadrao(clientes, [linha.custo.destinoNota, linha.viagem.destino])
    return { valor: padrao ? padrao.valorPadrao : linha.custo.pedagio, padrao }
  }

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
  }, [linhas, busca, veiculoFiltro, veiculosPorId, motoristasPorId])

  const totais = useMemo(() => {
    let cotacao = 0
    let custoReal = 0
    for (const linha of filtradas) {
      const { viagem, custo } = linha
      cotacao += calcularCotacaoTransportadora(viagem.km)
      custoReal += calcularCustoReal({
        kmRodado: viagem.km,
        combustivel: custo.combustivel,
        seguroCarga: custo.seguroCarga,
        pedagio: pedagioEfetivo(linha).valor,
      })
    }
    return { cotacao, custoReal, saving: calcularSaving(cotacao, custoReal) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtradas, clientes])

  function abrirEdicao(linha: Linha) {
    setEditando(linha)
    setForm({
      valorNota: linha.custo.valorNota != null ? String(linha.custo.valorNota) : '',
      peso: linha.custo.peso != null ? String(linha.custo.peso) : '',
      destinoNota: linha.custo.destinoNota ?? '',
    })
    setNumeroNota(extrairNumerosDeNotas(linha.custo.notas).join(' / '))
    setBuscaInfo(null)
  }

  /** Busca uma ou várias notas no ZenERP (separadas por "/", "," ou espaço no
   *  campo). Quando a viagem tem mais de uma nota, soma valor e peso de todas
   *  as encontradas e junta os destinos diferentes com "/". */
  async function buscarZenErp() {
    if (!(numeroNota.match(/\d+/g) ?? []).length) {
      show('Informe ao menos um número de nota para buscar.')
      return
    }
    setBuscando(true)
    setBuscaInfo(null)
    try {
      const resumo = await buscarESomarNotas(numeroNota)
      if (!resumo || resumo.encontradas === 0) {
        show('Nenhuma das notas informadas foi encontrada no ZenERP.')
        return
      }

      setForm((f) => ({
        ...f,
        valorNota: resumo.valorNota ? String(resumo.valorNota) : f.valorNota,
        peso: resumo.peso ? String(resumo.peso) : f.peso,
        destinoNota: resumo.destino ?? f.destinoNota,
      }))

      let mensagem = `${resumo.encontradas} de ${resumo.total} nota(s) encontrada(s) no ZenERP.`
      if (resumo.naoEncontradas.length > 0) {
        mensagem += ` Não encontrada(s) ou com erro: ${resumo.naoEncontradas.join(', ')}.`
      }
      setBuscaInfo(mensagem)
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erro ao buscar nota no ZenERP.')
    } finally {
      setBuscando(false)
    }
  }

  const combustivelEstimadoEdicao = useMemo(() => {
    if (!editando || !configState.data) return 0
    return calcularCombustivelEstimado(editando.viagem.km, configState.data.consumoMedioKmL, configState.data.precoDieselLitro)
  }, [editando, configState.data])

  // Enquanto o modal está aberto, o destino pode mudar (o gestor edita/busca
  // a nota no ZenERP) — então o pedágio padrão é recalculado a partir do que
  // está no formulário, não do destino salvo antes de abrir a edição.
  const pedagioEdicao = useMemo(() => {
    if (!editando) return { valor: 0, padrao: undefined as ClientePedagioPadrao | undefined }
    const padrao = encontrarPedagioPadrao(clientes, [form.destinoNota, editando.viagem.destino])
    return { valor: padrao ? padrao.valorPadrao : editando.custo.pedagio, padrao }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando, form.destinoNota, clientes])

  async function salvar() {
    if (!editando) return
    setSalvando(true)
    try {
      await salvarCustoViagem(editando.viagem.id, {
        notas: numeroNota.trim(),
        valorNota: form.valorNota ? Number(form.valorNota) : undefined,
        peso: form.peso ? Number(form.peso) : undefined,
        destinoNota: form.destinoNota,
        combustivel: combustivelEstimadoEdicao,
        pedagio: pedagioEdicao.padrao ? pedagioEdicao.valor : undefined,
      })
      show('Custo da viagem atualizado.')
      setEditando(null)
      custosState.reload()
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erro ao salvar custo da viagem.')
    } finally {
      setSalvando(false)
    }
  }

  const columns: Column<Linha>[] = [
    { header: 'Nº', accessor: ({ viagem }) => <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{viagem.numero}</span> },
    { header: 'Data', accessor: ({ viagem }) => formatarData(viagem.data) },
    { header: 'Veículo', accessor: ({ viagem }) => veiculosPorId.get(viagem.veiculoId)?.placa ?? '—' },
    { header: 'Motorista', accessor: ({ viagem }) => motoristasPorId.get(viagem.motoristaId)?.nome ?? '—' },
    { header: 'Notas', accessor: ({ custo }) => custo.notas || '—' },
    { header: 'Valor NF', accessor: ({ custo }) => (custo.valorNota != null ? formatarMoeda(custo.valorNota) : '—') },
    { header: 'Peso (kg)', accessor: ({ custo }) => (custo.peso != null ? custo.peso.toLocaleString('pt-BR') : '—') },
    { header: 'Destino', accessor: ({ custo }) => custo.destinoNota || '—' },
    { header: 'KM', accessor: ({ viagem }) => (viagem.km ? viagem.km.toLocaleString('pt-BR') : '—') },
    { header: 'Seguro carga', accessor: ({ custo }) => formatarMoeda(custo.seguroCarga) },
    {
      header: 'Pedágio',
      accessor: (linha) => {
        const { valor, padrao } = pedagioEfetivo(linha)
        return (
          <span>
            {formatarMoeda(valor)}
            {padrao && <span className="ml-1 text-[10px] font-medium text-brand-500">padrão</span>}
          </span>
        )
      },
    },
    { header: 'Combustível', accessor: ({ custo }) => formatarMoeda(custo.combustivel) },
    {
      header: 'Cotação transp.',
      accessor: ({ viagem }) => formatarMoeda(calcularCotacaoTransportadora(viagem.km)),
    },
    {
      header: 'Custo real',
      accessor: (linha) =>
        formatarMoeda(
          calcularCustoReal({
            kmRodado: linha.viagem.km,
            combustivel: linha.custo.combustivel,
            seguroCarga: linha.custo.seguroCarga,
            pedagio: pedagioEfetivo(linha).valor,
          }),
        ),
    },
    {
      header: 'Saving',
      accessor: (linha) => {
        const saving = calcularSaving(
          calcularCotacaoTransportadora(linha.viagem.km),
          calcularCustoReal({
            kmRodado: linha.viagem.km,
            combustivel: linha.custo.combustivel,
            seguroCarga: linha.custo.seguroCarga,
            pedagio: pedagioEfetivo(linha).valor,
          }),
        )
        return (
          <span className={cn('font-semibold', saving >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
            {formatarMoeda(saving)}
          </span>
        )
      },
    },
    {
      header: 'Ações',
      accessor: (linha) => (
        <button
          onClick={(e) => {
            e.stopPropagation()
            abrirEdicao(linha)
          }}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 dark:text-slate-500 dark:hover:bg-slate-800"
          aria-label="Editar"
        >
          <Pencil size={15} />
        </button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader title="Custo de Viagem" subtitle="Compare o custo real de cada viagem com o de contratar uma transportadora" />

      <Card className="mb-4 p-4">
        <button
          type="button"
          onClick={alternarCustosAutomaticos}
          aria-expanded={custosAutomaticosAbertos}
          className={`flex w-full items-center justify-between gap-2 text-left ${custosAutomaticosAbertos ? 'mb-3' : ''}`}
        >
          <span className="text-sm font-semibold text-slate-900 dark:text-white">Custos automáticos</span>
          <span className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            {custosAutomaticosAbertos ? (
              <>
                Ocultar <ChevronUp size={14} />
              </>
            ) : (
              <>
                Mostrar <ChevronDown size={14} />
              </>
            )}
          </span>
        </button>

        {custosAutomaticosAbertos && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10">
            <Fuel size={20} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Combustível estimado</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              O combustível de cada viagem é calculado automaticamente: KM rodado ÷ consumo médio × preço do diesel. Confira o preço do
              diesel uma vez por mês e, se mudar, atualize aqui — a correção é aplicada a todas as viagens deste mês.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Consumo médio (km/L)</span>
                <input
                  type="number"
                  step="0.01"
                  value={consumoForm}
                  onChange={(e) => setConsumoForm(e.target.value)}
                  className="w-32 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400 dark:bg-navy-950"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Preço do diesel (R$/L)</span>
                <input
                  type="number"
                  step="0.01"
                  value={precoForm}
                  onChange={(e) => setPrecoForm(e.target.value)}
                  className="w-32 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400 dark:bg-navy-950"
                />
              </label>
              <button
                onClick={salvarConfig}
                disabled={salvandoConfig || configState.loading}
                className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {salvandoConfig ? 'Salvando…' : 'Salvar e recalcular viagens do mês'}
              </button>
            </div>
            {configState.data && (
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                Última atualização: {formatarData(configState.data.atualizadoEm.slice(0, 10))}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-start gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10">
            <Route size={20} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Pedágio padrão por cliente</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Quando o destino da viagem ou da nota contém o nome de um cliente daqui, o pedágio dele substitui o valor informado pelo
              motorista.
            </p>

            <div className="mt-3 space-y-2">
              {clientesState.loading ? (
                <p className="text-xs text-slate-400 dark:text-slate-500">Carregando…</p>
              ) : (
                clientes.map((c) => {
                  const edit = clienteEdits[c.id] ?? { cliente: c.cliente, valorPadrao: String(c.valorPadrao) }
                  return (
                    <div key={c.id} className="flex flex-wrap items-center gap-2">
                      <input
                        value={edit.cliente}
                        onChange={(e) => setClienteEdits((s) => ({ ...s, [c.id]: { ...edit, cliente: e.target.value } }))}
                        className="w-40 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm outline-none focus:border-brand-400 dark:bg-navy-950"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={edit.valorPadrao}
                        onChange={(e) => setClienteEdits((s) => ({ ...s, [c.id]: { ...edit, valorPadrao: e.target.value } }))}
                        className="w-28 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm outline-none focus:border-brand-400 dark:bg-navy-950"
                      />
                      <button
                        onClick={() => salvarCliente(c.id)}
                        disabled={salvandoCliente === c.id}
                        className="rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                      >
                        {salvandoCliente === c.id ? 'Salvando…' : 'Salvar'}
                      </button>
                      <button
                        onClick={() => setExcluindoCliente(c)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:text-slate-500 dark:hover:bg-slate-800"
                        aria-label="Remover cliente"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )
                })
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  value={novoCliente}
                  onChange={(e) => setNovoCliente(e.target.value)}
                  placeholder="Novo cliente (ex: Embragem)"
                  className="w-40 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm outline-none focus:border-brand-400 dark:bg-navy-950"
                />
                <input
                  type="number"
                  step="0.01"
                  value={novoValorPadrao}
                  onChange={(e) => setNovoValorPadrao(e.target.value)}
                  placeholder="Valor (R$)"
                  className="w-28 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm outline-none focus:border-brand-400 dark:bg-navy-950"
                />
                <button
                  onClick={adicionarCliente}
                  disabled={salvandoCliente === 'novo'}
                  className="flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <Plus size={14} /> {salvandoCliente === 'novo' ? 'Adicionando…' : 'Adicionar cliente'}
                </button>
              </div>
            </div>
          </div>
        </div>
        </div>
        )}
      </Card>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10">
            <Calculator size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Cotação transportadora (total)</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{formatarMoeda(totais.cotacao)}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Calculator size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Custo real (total)</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{formatarMoeda(totais.custoReal)}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl',
              totais.saving >= 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10' : 'bg-red-50 text-red-600 dark:bg-red-500/10',
            )}
          >
            {totais.saving >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Saving (total)</p>
            <p className={cn('text-lg font-bold', totais.saving >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
              {formatarMoeda(totais.saving)}
            </p>
          </div>
        </Card>
      </div>

      <FilterBar>
        <SearchInput value={busca} onChange={setBusca} placeholder="Buscar por número, destino ou motorista…" className="w-full sm:w-80" />
        <SelectFilter
          value={veiculoFiltro}
          onChange={setVeiculoFiltro}
          options={[{ value: 'todos', label: 'Todos os veículos' }, ...veiculos.map((v) => ({ value: v.id, label: v.placa }))]}
        />
      </FilterBar>

      <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
        Notas e pedágio são preenchidos pelo motorista. Valor da nota, peso e destino são buscados automaticamente do ZenERP assim que o motorista informa o número da nota ao iniciar a viagem — se a busca falhar, também dá pra buscar de novo aqui, ao editar a viagem.
      </p>

      {erro ? (
        <ErrorState description={erro} />
      ) : carregando ? (
        <LoadingTable />
      ) : filtradas.length === 0 ? (
        <EmptyState icon={Calculator} title="Nenhuma viagem encontrada" description="Viagens em andamento ou concluídas aparecem aqui." />
      ) : (
        <Table
          columns={columns}
          rows={filtradas}
          renderMobileCard={(linha) => {
            const saving = calcularSaving(
              calcularCotacaoTransportadora(linha.viagem.km),
              calcularCustoReal({
                kmRodado: linha.viagem.km,
                combustivel: linha.custo.combustivel,
                seguroCarga: linha.custo.seguroCarga,
                pedagio: pedagioEfetivo(linha).valor,
              }),
            )
            return (
              <Card className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{linha.viagem.numero}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {veiculosPorId.get(linha.viagem.veiculoId)?.placa} · {motoristasPorId.get(linha.viagem.motoristaId)?.nome}
                    </p>
                  </div>
                  <button onClick={() => abrirEdicao(linha)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                    <Pencil size={15} />
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>{formatarData(linha.viagem.data)}</span>
                  <span>{linha.viagem.km ? `${linha.viagem.km.toLocaleString('pt-BR')} km` : '—'}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Saving</span>
                  <span className={cn('font-semibold', saving >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                    {formatarMoeda(saving)}
                  </span>
                </div>
              </Card>
            )
          }}
        />
      )}

      <Modal
        open={!!editando}
        onClose={() => setEditando(null)}
        title={editando ? `Custo da viagem ${editando.viagem.numero}` : ''}
        footer={
          <>
            <button onClick={() => setEditando(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={salvando}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {editando?.custo.notas && (
            <p className="rounded-xl bg-slate-50 dark:bg-navy-950 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
              <span className="font-medium">Notas informadas pelo motorista:</span> {editando.custo.notas}
            </p>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Número(s) da nota (ZenERP)</span>
            <div className="flex gap-2">
              <input
                value={numeroNota}
                onChange={(e) => setNumeroNota(e.target.value)}
                placeholder="Ex: 140963 ou 140963 / 141810"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
              />
              <button
                type="button"
                onClick={buscarZenErp}
                disabled={buscando}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                <Search size={14} />
                {buscando ? 'Buscando…' : 'Buscar'}
              </button>
            </div>
            {buscaInfo && <span className="mt-1 block text-xs text-emerald-600 dark:text-emerald-400">{buscaInfo}</span>}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Valor da nota (R$)</span>
              <input
                type="number"
                step="0.01"
                value={form.valorNota}
                onChange={(e) => setForm((f) => ({ ...f, valorNota: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
                placeholder="Ex: 69648.00"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Peso (kg)</span>
              <input
                type="number"
                step="0.01"
                value={form.peso}
                onChange={(e) => setForm((f) => ({ ...f, peso: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
                placeholder="Ex: 530"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Destino (cliente)</span>
            <input
              value={form.destinoNota}
              onChange={(e) => setForm((f) => ({ ...f, destinoNota: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
              placeholder="Ex: Gurgelmix Máquinas e Ferramentas"
            />
          </label>
          {editando && configState.data && (
            <div className="rounded-xl bg-slate-50 dark:bg-navy-950 px-3 py-2 text-sm">
              <span className="block font-medium text-slate-600 dark:text-slate-300">Combustível (R$) — estimado automaticamente</span>
              <span className="mt-0.5 block font-semibold text-slate-900 dark:text-white">{formatarMoeda(combustivelEstimadoEdicao)}</span>
              <span className="mt-0.5 block text-xs text-slate-400 dark:text-slate-500">
                {editando.viagem.km ? editando.viagem.km.toLocaleString('pt-BR') : '0'} km ÷ {configState.data.consumoMedioKmL} km/L ×{' '}
                {formatarMoeda(configState.data.precoDieselLitro)}/L
              </span>
            </div>
          )}
          {editando && (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Pedágio: {formatarMoeda(pedagioEdicao.valor)}{' '}
              {pedagioEdicao.padrao
                ? `(padrão do cliente ${pedagioEdicao.padrao.cliente})`
                : '(preenchido pelo motorista ao finalizar a viagem)'}{' '}
              · Seguro da carga: {formatarMoeda(editando.custo.seguroCarga)} (0,045% do valor da nota, calculado automaticamente)
            </p>
          )}
        </div>
      </Modal>

      <ConfirmationModal
        open={!!excluindoCliente}
        onClose={() => setExcluindoCliente(null)}
        onConfirm={confirmarExclusaoCliente}
        title="Remover cliente"
        description={`Tem certeza que deseja remover "${excluindoCliente?.cliente}" do pedágio padrão? As viagens desse cliente voltam a usar o valor informado pelo motorista.`}
        confirmLabel="Remover"
        tone="danger"
      />
    </div>
  )
}
