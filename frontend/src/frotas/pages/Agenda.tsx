import { useMemo, useState } from 'react'
import { Plus, ChevronLeft, ChevronRight, Trash2, CheckCircle2 } from 'lucide-react'
import { PageHeader, PrimaryButton } from '../components/PageHeader'
import { SelectFilter } from '../components/Filters'
import { Modal, ConfirmationModal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { ErrorState, LoadingCards } from '../components/States'
import { useAsync } from '../lib/hooks'
import { listVeiculos, listMotoristas, listAgendaItems, listViagens, criarAgendaItem, atualizarAgendaItem, excluirAgendaItem } from '../lib/supabaseClient'
import { TIPO_STYLE, TITULOS_RESERVA, diasGradeMes, itensNoDia, DIAS_SEMANA } from '../lib/agenda'
import { formatarHora, paraDatetimeLocal } from '../lib/stats'
import { feriadoDoDia, FERIADO_STYLE, type TipoFeriado } from '../lib/feriados'
import type { AgendaItem } from '../types'
import { cn } from '../lib/cn'

const FORM_INICIAL = {
  veiculoId: '',
  motoristaId: '',
  tipo: 'reserva' as AgendaItem['tipo'],
  titulo: '',
  inicio: '',
  fim: '',
  observacao: '',
}

const LEGENDA: { tipo: keyof typeof TIPO_STYLE; label: string }[] = [
  { tipo: 'reserva', label: 'Reserva / Viagem' },
  { tipo: 'retorno', label: 'Disponível' },
  { tipo: 'manutencao', label: 'Manutenção' },
  { tipo: 'bloqueio', label: 'Bloqueado' },
]

const LEGENDA_FERIADOS: TipoFeriado[] = ['nacional', 'municipal', 'facultativo']

const MAX_ITENS_VISIVEIS = 3

// Formata um objeto Date (horário local, sem conversão de fuso) para o
// formato que um <input type="datetime-local"> espera — usado ao pré-marcar
// o horário quando o usuário clica em um dia vazio do calendário.
function paraInputLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Selo mostrado nos itens da agenda cuja viagem já foi finalizada. `claro`
 *  = versão pra fundo claro (lista do dia); sem ele, versão pra cima do
 *  bloco colorido do calendário. */
function TagConcluida({ claro }: { claro?: boolean }) {
  return (
    <span
      className={cn(
        'mt-0.5 inline-flex w-fit items-center gap-1 rounded px-1 text-[10px] font-semibold',
        claro ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' : 'bg-white/25 text-white',
      )}
    >
      <CheckCircle2 size={10} /> Viagem Concluída
    </span>
  )
}

export function Agenda() {
  const [mesRef, setMesRef] = useState(new Date())
  const [veiculoFiltro, setVeiculoFiltro] = useState('todos')
  const [formOpen, setFormOpen] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState<AgendaItem | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState(FORM_INICIAL)
  const [diaExpandido, setDiaExpandido] = useState<Date | null>(null)
  const { show } = useToast()

  const veiculosState = useAsync(() => listVeiculos(), [])
  const motoristasState = useAsync(() => listMotoristas(), [])
  const agendaState = useAsync(() => listAgendaItems(), [])
  // Só serve pra marcar "Viagem Concluída" nos itens — se falhar ou demorar,
  // a agenda abre normal, só sem a tag.
  const viagensState = useAsync(() => listViagens(), [])

  function abrirNovo(diaClicado?: Date) {
    setEditandoId(null)
    if (diaClicado) {
      const inicio = new Date(diaClicado)
      inicio.setHours(8, 0, 0, 0)
      const fim = new Date(diaClicado)
      fim.setHours(9, 0, 0, 0)
      setForm({ ...FORM_INICIAL, inicio: paraInputLocal(inicio), fim: paraInputLocal(fim) })
    } else {
      setForm(FORM_INICIAL)
    }
    setFormOpen(true)
  }

  function abrirEdicao(item: AgendaItem) {
    setDiaExpandido(null)
    setEditandoId(item.id)
    setForm({
      veiculoId: item.veiculoId,
      motoristaId: item.motoristaId ?? motoristas.find((m) => m.nome === item.motoristaNome)?.id ?? '',
      // Itens antigos do tipo 'viagem' abrem como 'Reserva / Viagem' (mesmo tipo).
      tipo: item.tipo === 'viagem' ? 'reserva' : item.tipo,
      titulo: item.titulo,
      inicio: item.inicio ? paraDatetimeLocal(item.inicio) : '',
      fim: item.fim ? paraDatetimeLocal(item.fim) : '',
      observacao: item.observacao ?? '',
    })
    setFormOpen(true)
  }

  async function salvar() {
    // Título só é obrigatório pra reserva (é ele que identifica o cliente) —
    // bloqueio, manutenção, viagem e disponível/retorno podem ficar sem.
    if (!form.veiculoId || !form.inicio || !form.fim || (form.tipo === 'reserva' && !form.titulo)) {
      show('Preencha veículo, início e fim (e título, no caso de reserva).')
      return
    }
    setSalvando(true)
    try {
      const motoristaNome = motoristas.find((m) => m.id === form.motoristaId)?.nome
      const payload = {
        veiculoId: form.veiculoId,
        tipo: form.tipo,
        titulo: form.titulo,
        motoristaId: form.motoristaId || undefined,
        motoristaNome,
        // form.inicio/form.fim vêm de <input type="datetime-local">, ou seja,
        // em horário local, sem informação de fuso — new Date(...).toISOString()
        // converte para o instante UTC correto antes de salvar (o banco guarda
        // tudo em UTC). Sem isso, o valor era salvo cru e acabava sendo
        // interpretado como se já estivesse em UTC, adiantando/atrasando o
        // horário registrado em relação ao que a pessoa digitou.
        inicio: new Date(form.inicio).toISOString(),
        fim: new Date(form.fim).toISOString(),
        observacao: form.observacao || undefined,
      }
      if (editandoId) {
        await atualizarAgendaItem(editandoId, payload)
        show('Item da agenda atualizado com sucesso.')
      } else {
        await criarAgendaItem(payload)
        show('Reserva criada com sucesso.')
      }
      setFormOpen(false)
      setForm(FORM_INICIAL)
      agendaState.reload()
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erro ao salvar item da agenda.')
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarExclusao() {
    if (!excluindo) return
    try {
      await excluirAgendaItem(excluindo.id)
      show('Item da agenda excluído.')
      agendaState.reload()
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erro ao excluir item da agenda.')
    } finally {
      setExcluindo(null)
    }
  }

  const carregando = veiculosState.loading || motoristasState.loading || agendaState.loading
  const erro = veiculosState.error ?? motoristasState.error ?? agendaState.error

  const veiculos = veiculosState.data ?? []
  const motoristas = motoristasState.data ?? []
  const agendaItems = agendaState.data ?? []

  const veiculosPorId = useMemo(() => new Map(veiculos.map((v) => [v.id, v])), [veiculos])
  const mostrarPlaca = veiculoFiltro === 'todos'

  // Itens da agenda cuja viagem vinculada já foi finalizada pelo motorista.
  const viagensConcluidas = useMemo(
    () => new Set((viagensState.data ?? []).filter((v) => v.status === 'concluida').map((v) => v.id)),
    [viagensState.data],
  )
  const concluida = (item: AgendaItem) => !!item.viagemId && viagensConcluidas.has(item.viagemId)

  const itensFiltrados = useMemo(
    () => (veiculoFiltro === 'todos' ? agendaItems : agendaItems.filter((i) => i.veiculoId === veiculoFiltro)),
    [agendaItems, veiculoFiltro],
  )

  const diasGrade = useMemo(() => diasGradeMes(mesRef), [mesRef])
  const semanas = useMemo(() => {
    const grupos: Date[][] = []
    for (let i = 0; i < diasGrade.length; i += 7) grupos.push(diasGrade.slice(i, i + 7))
    return grupos
  }, [diasGrade])

  const hojeStr = new Date().toDateString()

  function navegarMes(direcao: 1 | -1) {
    setMesRef((d) => {
      const nd = new Date(d)
      nd.setMonth(nd.getMonth() + direcao)
      return nd
    })
  }

  function tituloItem(item: AgendaItem) {
    const placa = veiculosPorId.get(item.veiculoId)?.placa
    // Bloqueio/manutenção/etc. podem não ter título (não fazem sentido com um
    // dos clientes fixos da lista) — nesse caso mostra o tipo (ex.: "Bloqueado").
    const titulo = item.titulo || TIPO_STYLE[item.tipo].label
    return mostrarPlaca && placa ? `${placa} — ${titulo}` : titulo
  }

  return (
    <div>
      <PageHeader
        title="Agenda da Frota"
        subtitle="Reserve e acompanhe a disponibilidade dos veículos"
        action={
          <PrimaryButton icon={Plus} onClick={() => abrirNovo()}>
            Nova reserva
          </PrimaryButton>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-navy-800 px-1.5 py-1 shadow-sm">
          <button onClick={() => navegarMes(-1)} className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[140px] text-center text-sm font-medium capitalize text-slate-700 dark:text-slate-200">
            {mesRef.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={() => navegarMes(1)} className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <ChevronRight size={16} />
          </button>
        </div>
        <button
          onClick={() => setMesRef(new Date())}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-navy-800 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:hover:bg-navy-950"
        >
          Hoje
        </button>
        <SelectFilter
          value={veiculoFiltro}
          onChange={setVeiculoFiltro}
          options={[{ value: 'todos', label: 'Todos os veículos' }, ...veiculos.map((v) => ({ value: v.id, label: v.placa }))]}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
        {LEGENDA.map((l) => (
          <span key={l.tipo} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${TIPO_STYLE[l.tipo].bg}`} />
            {l.label}
          </span>
        ))}
        <span className="text-slate-300 dark:text-slate-600">·</span>
        {LEGENDA_FERIADOS.map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${FERIADO_STYLE[t].dot}`} />
            {FERIADO_STYLE[t].label}
          </span>
        ))}
        <span className="text-slate-300 dark:text-slate-600">·</span>
        <span>Clique em um item para editar · clique num dia vazio para criar uma reserva</span>
      </div>

      {erro ? (
        <ErrorState description={erro} />
      ) : carregando ? (
        <LoadingCards count={4} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-navy-800 shadow-card">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-navy-900/60 text-xs font-semibold text-slate-500 dark:text-slate-400">
              {DIAS_SEMANA.map((d) => (
                <div key={d} className="px-2 py-2.5 text-center">
                  {d}
                </div>
              ))}
            </div>
            {semanas.map((semana, i) => (
              <div key={i} className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800 last:border-0">
                {semana.map((d) => {
                  const doMes = d.getMonth() === mesRef.getMonth() && d.getFullYear() === mesRef.getFullYear()
                  const ehHoje = d.toDateString() === hojeStr
                  const feriado = feriadoDoDia(d)
                  const feriadoStyle = feriado ? FERIADO_STYLE[feriado.tipo] : undefined
                  const itensDia = itensNoDia(itensFiltrados, d)
                  const visiveis = itensDia.slice(0, MAX_ITENS_VISIVEIS)
                  const restante = itensDia.length - visiveis.length
                  return (
                    <button
                      key={d.toISOString()}
                      onClick={() => abrirNovo(d)}
                      className={cn(
                        'flex min-h-[104px] flex-col gap-1 border-l border-slate-100 dark:border-slate-800 p-1.5 text-left first:border-l-0 hover:bg-slate-50/80 dark:hover:bg-navy-950/60',
                        !doMes && 'bg-slate-50/40 dark:bg-navy-950/30',
                        feriadoStyle && doMes && feriadoStyle.fundo,
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                            ehHoje
                              ? 'bg-brand-600 text-white'
                              : doMes
                                ? feriadoStyle?.texto ?? 'text-slate-700 dark:text-slate-200'
                                : 'text-slate-300 dark:text-slate-600',
                          )}
                        >
                          {d.getDate()}
                        </span>
                        {feriado && feriadoStyle && (
                          <span
                            title={`${feriado.nome} — ${feriadoStyle.label}`}
                            className={cn(
                              'min-w-0 truncate text-[10px] font-semibold leading-tight',
                              doMes ? feriadoStyle.texto : 'text-slate-300 dark:text-slate-600',
                            )}
                          >
                            {feriado.nome}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-1">
                        {visiveis.map((item) => {
                          const style = TIPO_STYLE[item.tipo]
                          return (
                            <span
                              key={item.id}
                              title={tituloItem(item)}
                              onClick={(e) => {
                                e.stopPropagation()
                                abrirEdicao(item)
                              }}
                              className={`flex flex-col rounded-md px-1.5 py-0.5 text-[11px] font-medium ${style.bg} ${style.text}`}
                            >
                              <span className="truncate">
                                {formatarHora(item.inicio)} {tituloItem(item)}
                              </span>
                              {concluida(item) && <TagConcluida />}
                            </span>
                          )
                        })}
                        {restante > 0 && (
                          <span
                            onClick={(e) => {
                              e.stopPropagation()
                              setDiaExpandido(d)
                            }}
                            className="truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:underline"
                          >
                            +{restante} mais
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista completa de um dia quando há mais itens do que cabem na célula */}
      <Modal
        open={!!diaExpandido}
        onClose={() => setDiaExpandido(null)}
        title={diaExpandido ? diaExpandido.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' }) : ''}
        size="sm"
      >
        <div className="flex flex-col gap-2">
          {diaExpandido &&
            itensNoDia(itensFiltrados, diaExpandido).map((item) => {
              const style = TIPO_STYLE[item.tipo]
              return (
                <button
                  key={item.id}
                  onClick={() => abrirEdicao(item)}
                  className="flex items-start gap-2 rounded-xl bg-slate-50 dark:bg-navy-950 p-2.5 text-left"
                >
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${style.bg}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{tituloItem(item)}</p>
                    {concluida(item) && <TagConcluida claro />}
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatarHora(item.inicio)} → {formatarHora(item.fim)}
                    </p>
                    {item.motoristaNome && <p className="text-xs text-slate-500 dark:text-slate-400">{item.motoristaNome}</p>}
                  </div>
                </button>
              )
            })}
        </div>
      </Modal>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editandoId ? 'Editar item da agenda' : 'Nova reserva'}
        footer={
          <>
            {editandoId && (
              <button
                onClick={() => {
                  const item = agendaItems.find((a) => a.id === editandoId)
                  if (item) {
                    setFormOpen(false)
                    setExcluindo(item)
                  }
                }}
                className="mr-auto rounded-lg px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                <span className="flex items-center gap-1.5">
                  <Trash2 size={15} /> Excluir
                </span>
              </button>
            )}
            <button
              onClick={() => setFormOpen(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={salvando}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {salvando ? 'Salvando…' : editandoId ? 'Salvar' : 'Criar reserva'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {editandoId && agendaItems.some((a) => a.id === editandoId && concluida(a)) && <TagConcluida claro />}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
              Título{form.tipo !== 'reserva' && ' (opcional)'}
            </span>
            <select
              required={form.tipo === 'reserva'}
              value={form.titulo}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            >
              <option value="">{form.tipo === 'reserva' ? 'Selecione…' : 'Nenhum'}</option>
              {TITULOS_RESERVA.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Tipo</span>
              <select
                value={form.tipo}
                onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as AgendaItem['tipo'] }))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
              >
                <option value="reserva">Reserva / Viagem</option>
                <option value="retorno">Disponível</option>
                <option value="manutencao">Manutenção</option>
                <option value="bloqueio">Bloqueado</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Veículo</span>
              <select
                value={form.veiculoId}
                onChange={(e) => setForm((f) => ({ ...f, veiculoId: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
              >
                <option value="">Selecione…</option>
                {veiculos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.placa}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Motorista</span>
            <select
              value={form.motoristaId}
              onChange={(e) => setForm((f) => ({ ...f, motoristaId: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            >
              <option value="">Selecione…</option>
              {motoristas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
            {form.tipo === 'reserva' && form.veiculoId && form.motoristaId && (
              <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">
                Isso cria/atualiza automaticamente o registro correspondente na aba Viagens.
              </span>
            )}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Início</span>
              <input
                type="datetime-local"
                value={form.inicio}
                onChange={(e) => setForm((f) => ({ ...f, inicio: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Fim</span>
              <input
                type="datetime-local"
                value={form.fim}
                onChange={(e) => setForm((f) => ({ ...f, fim: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Observação</span>
            <input
              value={form.observacao}
              onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
          </label>
        </div>
      </Modal>

      <ConfirmationModal
        open={!!excluindo}
        onClose={() => setExcluindo(null)}
        onConfirm={confirmarExclusao}
        title="Excluir item da agenda"
        description={`Tem certeza que deseja excluir "${excluindo?.titulo}"? Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        tone="danger"
      />
    </div>
  )
}
