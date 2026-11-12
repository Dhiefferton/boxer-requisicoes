// Tela do motorista (Minha viagem) — trazida do Boxer Frotas para dentro do Boxer Operações (/frotas/motorista).
// Tema, senha e sair ficam na barra do topo do Operações, por isso o cabeçalho próprio saiu.
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Truck,
  MapPin,
  Clock,
  PlayCircle,
  CheckCircle2,
  ClipboardCheck,
  ChevronDown,
  ChevronLeft,
  AlertTriangle,
  Camera,
  CalendarDays,
  Plus,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../lib/hooks'
import {
  getMotoristaPorUserId,
  getViagemAtualDoMotorista,
  listVeiculos,
  listMotoristas,
  iniciarViagem,
  finalizarViagem,
  CHECKLIST_TEMPLATE,
  salvarChecklistExecucao,
  bloquearVeiculo,
  getChecklistMensalStatus,
  listAgendaItems,
  criarAgendaItem,
  salvarCustoViagem,
} from '../lib/supabaseClient'
import { buscarESomarNotas } from '../lib/zenerp'
import { TIPO_STYLE, TITULOS_RESERVA } from '../lib/agenda'
import { formatarHora, formatarData } from '../lib/stats'
import { useToast } from '../components/Toast'
import { EmptyState, ErrorState } from '../components/States'
import { ConfirmationModal } from '../components/Modal'
import type { AgendaItem, ChecklistItem, ChecklistResultado } from '../types'
import { cn } from '../lib/cn'

type Etapa = 'aguardando' | 'em_andamento' | 'concluida'
type Tela = 'viagem' | 'agenda'

const RESULT_STYLE: Record<ChecklistResultado, { active: string; label: string }> = {
  ok: { active: 'bg-emerald-500 text-white border-emerald-500', label: 'OK' },
  nao_ok: { active: 'bg-red-500 text-white border-red-500', label: 'NÃO OK' },
  na: { active: 'bg-slate-400 text-white border-slate-400', label: 'N/A' },
}

function agruparPorCategoria(itens: ChecklistItem[]) {
  const grupos: Record<string, ChecklistItem[]> = {}
  for (const item of itens) {
    grupos[item.categoria] = grupos[item.categoria] ?? []
    grupos[item.categoria].push(item)
  }
  return grupos
}

const AGENDA_FORM_INICIAL = {
  titulo: '',
  tipo: 'reserva' as AgendaItem['tipo'],
  veiculoId: '',
  inicio: '',
  fim: '',
  observacao: '',
}

export function MinhaViagem() {
  const { user, perfil } = useAuth()
  const { show } = useToast()

  // Vínculo do login com o cadastro de motorista. Gestor/operador sem vínculo
  // próprio pode escolher um motorista cadastrado para ver a tela em modo prévia.
  const motoristaState = useAsync(() => (user ? getMotoristaPorUserId(user.id) : Promise.resolve(null)), [user?.id])
  const podePreVisualizar = !!perfil && perfil.perfil !== 'motorista'
  const [previewMotoristaId, setPreviewMotoristaId] = useState<string | null>(null)
  const motoristasPreviewState = useAsync(
    () => (podePreVisualizar && !motoristaState.data ? listMotoristas() : Promise.resolve([])),
    [podePreVisualizar, motoristaState.data],
  )
  const motorista =
    motoristaState.data ?? (previewMotoristaId ? (motoristasPreviewState.data ?? []).find((m) => m.id === previewMotoristaId) ?? null : null)
  const emPreview = !motoristaState.data && !!motorista

  const viagemState = useAsync(
    () => (motorista ? getViagemAtualDoMotorista(motorista.id) : Promise.resolve(null)),
    [motorista?.id],
  )
  const viagem = viagemState.data

  const veiculosState = useAsync(() => listVeiculos(), [])
  const veiculo = veiculosState.data?.find((v) => v.id === viagem?.veiculoId)

  const [etapa, setEtapa] = useState<Etapa>('aguardando')
  const [kmSaida, setKmSaida] = useState('')
  const [kmChegada, setKmChegada] = useState('')
  const [notasFiscais, setNotasFiscais] = useState('')
  const [modalKm, setModalKm] = useState<'saida' | 'chegada' | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erroKm, setErroKm] = useState<string | null>(null)

  useEffect(() => {
    if (viagem?.status === 'em_viagem') setEtapa('em_andamento')
    else if (viagem?.status === 'concluida') setEtapa('concluida')
    else setEtapa('aguardando')
  }, [viagem?.status])

  const carregando = motoristaState.loading || viagemState.loading

  const kmRodados = kmSaida && kmChegada ? Math.max(0, Number(kmChegada) - Number(kmSaida)) : null

  async function confirmarKm() {
    if (!viagem) return
    // KM de saída e notas fiscais são obrigatórios para iniciar a viagem.
    if (modalKm === 'saida' && (!kmSaida || !notasFiscais.trim())) {
      show('Preencha o KM de saída e as notas fiscais da carga.')
      return
    }
    // Trava (chegada): o KM de chegada precisa ser MAIOR que o de saída.
    if (modalKm === 'chegada') {
      if (!kmChegada) {
        setErroKm('Informe o KM de chegada.')
        return
      }
      if (viagem.kmSaida != null && Number(kmChegada) <= Number(viagem.kmSaida)) {
        setErroKm(
          `O KM de chegada (${Number(kmChegada).toLocaleString('pt-BR')}) precisa ser maior que o KM de saída (${Number(viagem.kmSaida).toLocaleString('pt-BR')}). Confira o odômetro e corrija o valor.`,
        )
        return
      }
    }
    // Trava (saída): o KM de saída não pode ser menor que o último KM registrado do veículo.
    if (modalKm === 'saida' && veiculo && veiculo.km > 0 && Number(kmSaida) < Number(veiculo.km)) {
      setErroKm(
        `O KM de saída (${Number(kmSaida).toLocaleString('pt-BR')}) não pode ser menor que o KM da viagem anterior (${Number(veiculo.km).toLocaleString('pt-BR')}). Confira o odômetro e corrija o valor.`,
      )
      return
    }
    setErroKm(null)
    setSalvando(true)
    try {
      if (modalKm === 'saida') {
        await iniciarViagem(viagem.id, Number(kmSaida))
        const notas = notasFiscais.trim()
        await salvarCustoViagem(viagem.id, { notas })
        setEtapa('em_andamento')
        show('Viagem iniciada. Boa viagem!')
        // Busca a nota no ZenERP em segundo plano, sem travar o início da viagem.
        buscarESomarNotas(notas)
          .then((resumo) => {
            if (!resumo || resumo.encontradas === 0) return
            return salvarCustoViagem(viagem.id, {
              ...(resumo.valorNota != null ? { valorNota: resumo.valorNota } : {}),
              ...(resumo.peso != null ? { peso: resumo.peso } : {}),
              ...(resumo.destino != null ? { destinoNota: resumo.destino } : {}),
            })
          })
          .catch(() => {
            // etapa auxiliar; o gestor resolve no Custo de Viagem se falhar
          })
      } else if (modalKm === 'chegada') {
        await finalizarViagem(viagem.id, Number(kmChegada))
        setEtapa('concluida')
        show('Viagem finalizada com sucesso.')
      }
    } catch (err) {
      show(err instanceof Error ? `Erro: ${err.message}` : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
      setModalKm(null)
    }
  }

  const [tela, setTela] = useState<Tela>('viagem')

  // Checklist mensal do veículo, preenchido direto do celular.
  const [checklistAberto, setChecklistAberto] = useState(false)
  const [itensChecklist, setItensChecklist] = useState<ChecklistItem[]>(() => CHECKLIST_TEMPLATE.map((i) => ({ ...i })))
  const [expandidas, setExpandidas] = useState<Record<string, boolean>>({ Documentação: true, 'Parte Mecânica': true })
  const [bloqueioAberto, setBloqueioAberto] = useState<ChecklistItem | null>(null)
  const [veiculoBloqueado, setVeiculoBloqueado] = useState(false)
  const [salvandoChecklist, setSalvandoChecklist] = useState(false)

  const statusChecklistState = useAsync(
    () => (veiculo ? getChecklistMensalStatus([veiculo.id]) : Promise.resolve([])),
    [veiculo?.id],
  )
  const statusMes = statusChecklistState.data?.[0]

  const gruposChecklist = useMemo(() => agruparPorCategoria(itensChecklist), [itensChecklist])
  const problemaCritico = itensChecklist.find((i) => i.critico && i.resultado === 'nao_ok')

  function abrirChecklist() {
    setItensChecklist(CHECKLIST_TEMPLATE.map((i) => ({ ...i })))
    setExpandidas({ Documentação: true, 'Parte Mecânica': true })
    setVeiculoBloqueado(false)
    setChecklistAberto(true)
  }

  function atualizarItemChecklist(id: string, resultado: ChecklistResultado) {
    setItensChecklist((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i
        const atualizado = { ...i, resultado }
        if (resultado === 'nao_ok' && i.critico) setBloqueioAberto(atualizado)
        return atualizado
      }),
    )
  }

  function atualizarObservacaoChecklist(id: string, observacao: string) {
    setItensChecklist((prev) => prev.map((i) => (i.id === id ? { ...i, observacao } : i)))
  }

  async function salvarChecklist() {
    if (!veiculo || !motorista) return
    setSalvandoChecklist(true)
    try {
      await salvarChecklistExecucao({
        veiculoId: veiculo.id,
        motoristaId: motorista.id,
        momento: 'mensal',
        itens: itensChecklist,
        finalizado: true,
      })
      show('Checklist do mês salvo com sucesso.')
      statusChecklistState.reload()
      setChecklistAberto(false)
    } catch (err) {
      show(err instanceof Error ? `Erro ao salvar: ${err.message}` : 'Erro ao salvar o checklist.')
    } finally {
      setSalvandoChecklist(false)
    }
  }

  async function confirmarBloqueioChecklist() {
    setVeiculoBloqueado(true)
    if (veiculo) {
      try {
        await bloquearVeiculo(veiculo.id)
      } catch {
        // a UI já reflete o bloqueio localmente
      }
    }
  }

  // Agenda do motorista: vê os próprios compromissos e registra reserva pelo celular.
  const agendaState = useAsync(() => listAgendaItems(), [])
  const minhaAgenda = useMemo(
    () => (agendaState.data ?? []).filter((a) => a.motoristaId === motorista?.id).sort((a, b) => a.inicio.localeCompare(b.inicio)),
    [agendaState.data, motorista?.id],
  )
  const [agendaFormOpen, setAgendaFormOpen] = useState(false)
  const [agendaForm, setAgendaForm] = useState(AGENDA_FORM_INICIAL)
  const [salvandoAgenda, setSalvandoAgenda] = useState(false)

  function abrirNovaReserva() {
    setAgendaForm(AGENDA_FORM_INICIAL)
    setAgendaFormOpen(true)
  }

  async function salvarNovaReserva(e: FormEvent) {
    e.preventDefault()
    if (!motorista || !agendaForm.veiculoId || !agendaForm.inicio || !agendaForm.fim) return
    setSalvandoAgenda(true)
    try {
      await criarAgendaItem({
        veiculoId: agendaForm.veiculoId,
        tipo: agendaForm.tipo,
        titulo: agendaForm.titulo || TIPO_STYLE[agendaForm.tipo].label,
        motoristaId: motorista.id,
        motoristaNome: motorista.nome,
        inicio: new Date(agendaForm.inicio).toISOString(),
        fim: new Date(agendaForm.fim).toISOString(),
        observacao: agendaForm.observacao || undefined,
      })
      show('Reserva registrada na agenda.')
      agendaState.reload()
      setAgendaFormOpen(false)
    } catch (err) {
      show(err instanceof Error ? `Erro: ${err.message}` : 'Não foi possível registrar a reserva.')
    } finally {
      setSalvandoAgenda(false)
    }
  }

  return (
    <div className="pb-10">
      <div className="mx-auto flex max-w-sm items-center gap-3 pb-4">
        {checklistAberto ? (
          <button onClick={() => setChecklistAberto(false)} className="rounded-full bg-slate-900/5 dark:bg-white/10 p-2 text-slate-700 dark:text-white">
            <ChevronLeft size={18} />
          </button>
        ) : (
          <Link to="/" className="rounded-full bg-slate-900/5 dark:bg-white/10 p-2 text-slate-700 dark:text-white" aria-label="Voltar ao Início">
            <ArrowLeft size={18} />
          </Link>
        )}
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {checklistAberto ? 'Checklist do mês' : tela === 'agenda' ? 'Agenda' : 'Minha viagem'}
        </h1>
      </div>

      {!checklistAberto && motorista && (
        <div className="mx-auto mb-3 flex max-w-sm gap-2">
          <button
            onClick={() => setTela('viagem')}
            className={cn(
              'flex-1 rounded-xl py-2 text-sm font-semibold transition',
              tela === 'viagem' ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 dark:bg-navy-800 dark:text-slate-400',
            )}
          >
            Viagem
          </button>
          <button
            onClick={() => setTela('agenda')}
            className={cn(
              'flex-1 rounded-xl py-2 text-sm font-semibold transition',
              tela === 'agenda' ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 dark:bg-navy-800 dark:text-slate-400',
            )}
          >
            Agenda
          </button>
        </div>
      )}

      <div className="mx-auto max-w-sm">
        {motoristaState.error || viagemState.error ? (
          <div className="rounded-2xl bg-white p-5 shadow-popover">
            <ErrorState description={motoristaState.error ?? viagemState.error ?? ''} />
          </div>
        ) : carregando ? (
          <div className="rounded-2xl bg-white p-5 text-center text-sm text-slate-500 shadow-popover">Carregando…</div>
        ) : !motorista ? (
          <div className="space-y-3 rounded-2xl bg-white p-5 shadow-popover">
            <EmptyState
              icon={Truck}
              title="Conta não vinculada a um motorista"
              description="Peça ao gestor da frota para vincular seu login a um cadastro de motorista."
            />
            {podePreVisualizar && (motoristasPreviewState.data?.length ?? 0) > 0 && (
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <p className="text-xs font-medium text-slate-500">Ou visualize a tela de um motorista já cadastrado:</p>
                <select
                  value={previewMotoristaId ?? ''}
                  onChange={(e) => setPreviewMotoristaId(e.target.value || null)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400"
                >
                  <option value="">Selecione um motorista…</option>
                  {motoristasPreviewState.data?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ) : checklistAberto ? (
          <div className="space-y-3 pb-6">
            {problemaCritico && (
              <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
                <AlertTriangle className="mt-0.5 shrink-0 text-red-500" size={20} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-700">⚠ Problema identificado</p>
                  <p className="mt-0.5 text-sm text-red-600">
                    {problemaCritico.descricao}
                    {problemaCritico.observacao ? `: ${problemaCritico.observacao}` : ''}. Este veículo deve ser encaminhado
                    para manutenção.
                  </p>
                  {veiculoBloqueado ? (
                    <span className="mt-2 inline-block rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white">
                      Veículo bloqueado
                    </span>
                  ) : (
                    <button
                      onClick={confirmarBloqueioChecklist}
                      className="mt-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white active:bg-red-700"
                    >
                      Bloquear veículo
                    </button>
                  )}
                </div>
              </div>
            )}

            {Object.entries(gruposChecklist).map(([categoria, itensCategoria]) => {
              const aberta = expandidas[categoria] ?? false
              const pendentes = itensCategoria.filter((i) => !i.resultado).length
              return (
                <div key={categoria} className="overflow-hidden rounded-2xl bg-white shadow-popover">
                  <button
                    onClick={() => setExpandidas((e) => ({ ...e, [categoria]: !aberta }))}
                    className="flex w-full items-center justify-between px-4 py-3.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{categoria}</span>
                      {pendentes > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                          {pendentes} pendentes
                        </span>
                      )}
                    </div>
                    <ChevronDown size={16} className={cn('text-slate-400 transition-transform', aberta && 'rotate-180')} />
                  </button>

                  {aberta && (
                    <div className="space-y-3 border-t border-slate-100 px-4 py-3">
                      {itensCategoria.map((item) => (
                        <div key={item.id}>
                          <p className="mb-2 text-sm font-medium text-slate-700">
                            {item.descricao}
                            {item.critico && <span className="ml-1.5 text-xs font-semibold text-red-500">crítico</span>}
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {(['ok', 'nao_ok', 'na'] as ChecklistResultado[]).map((r) => (
                              <button
                                key={r}
                                onClick={() => atualizarItemChecklist(item.id, r)}
                                className={cn(
                                  'rounded-xl border-2 py-2 text-xs font-bold transition',
                                  item.resultado === r
                                    ? RESULT_STYLE[r].active
                                    : 'border-slate-200 bg-white text-slate-500 active:border-slate-300',
                                )}
                              >
                                {RESULT_STYLE[r].label}
                              </button>
                            ))}
                          </div>
                          {item.resultado === 'nao_ok' && (
                            <div className="mt-2 space-y-2 rounded-xl bg-red-50/60 p-3">
                              <textarea
                                value={item.observacao ?? ''}
                                onChange={(e) => atualizarObservacaoChecklist(item.id, e.target.value)}
                                placeholder="Descreva o problema encontrado…"
                                rows={2}
                                className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400"
                              />
                              <button className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600">
                                <Camera size={14} /> Anexar foto
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            <button
              onClick={salvarChecklist}
              disabled={salvandoChecklist}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-4 text-base font-bold text-white shadow-sm active:bg-brand-700 disabled:opacity-60"
            >
              <ClipboardCheck size={20} /> {salvandoChecklist ? 'Salvando…' : 'Salvar checklist do mês'}
            </button>
          </div>
        ) : tela === 'agenda' ? (
          <div className="space-y-3 pb-6">
            {emPreview && (
              <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-center text-xs font-semibold text-amber-700">
                Visualizando a agenda de {motorista.nome} (modo prévia)
              </div>
            )}

            <button
              onClick={abrirNovaReserva}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 text-sm font-bold text-white shadow-sm active:bg-brand-700"
            >
              <Plus size={18} /> Nova reserva
            </button>

            {agendaState.loading ? (
              <div className="rounded-2xl bg-white p-5 text-center text-sm text-slate-500 shadow-popover">Carregando…</div>
            ) : minhaAgenda.length === 0 ? (
              <div className="rounded-2xl bg-white p-5 shadow-popover">
                <EmptyState icon={CalendarDays} title="Nada na agenda" description="Você não tem itens agendados no momento." />
              </div>
            ) : (
              minhaAgenda.map((item) => {
                const v = veiculosState.data?.find((x) => x.id === item.veiculoId)
                const style = TIPO_STYLE[item.tipo]
                return (
                  <div key={item.id} className="flex gap-3 rounded-2xl bg-white p-4 shadow-popover">
                    <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', style.bg)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">{item.titulo || style.label}</p>
                        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', style.bg, style.text)}>
                          {style.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{v ? `${v.placa} — ${v.modelo}` : 'Veículo não definido'}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {formatarData(item.inicio)} {formatarHora(item.inicio)} até {formatarData(item.fim)} {formatarHora(item.fim)}
                      </p>
                      {item.observacao && <p className="mt-1 text-xs text-slate-500">{item.observacao}</p>}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {emPreview && (
              <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-center text-xs font-semibold text-amber-700">
                Visualizando como {motorista.nome} (modo prévia)
              </div>
            )}

            {!viagem ? (
              <div className="rounded-2xl bg-white p-5 shadow-popover">
                <EmptyState icon={MapPin} title="Nenhuma viagem atribuída" description="Você não tem viagens programadas no momento." />
              </div>
            ) : (
              <div className="rounded-2xl bg-white p-5 shadow-popover">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Truck size={22} />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-900">{veiculo?.placa}</p>
                    <p className="text-sm text-slate-500">{veiculo?.modelo}</p>
                  </div>
                </div>

                <div className="space-y-3 py-4">
                  <div className="flex items-center gap-3">
                    <MapPin size={18} className="text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-400">Destino</p>
                      <p className="font-semibold text-slate-800">{viagem.destino}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <CalendarDays size={18} className="text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-400">Data</p>
                      <p className="font-semibold text-slate-800">{formatarData(viagem.data)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock size={18} className="text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-400">Horário de saída</p>
                      <p className="font-semibold text-slate-800">
                        {viagem.saidaPrevista ? formatarHora(viagem.saidaPrevista) : '—'}
                      </p>
                    </div>
                  </div>
                </div>

                {etapa === 'aguardando' && (
                  <button
                    onClick={() => {
                      setNotasFiscais('')
                      setModalKm('saida')
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-4 text-base font-bold text-white shadow-sm active:bg-emerald-700"
                  >
                    <PlayCircle size={20} /> INICIAR VIAGEM
                  </button>
                )}

                {etapa === 'em_andamento' && (
                  <div className="space-y-3">
                    <div className="rounded-xl bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-700">
                      Viagem em andamento{kmSaida ? ` · KM saída: ${kmSaida}` : ''}
                    </div>
                    <button
                      onClick={() => setModalKm('chegada')}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-4 text-base font-bold text-white shadow-sm active:bg-red-700"
                    >
                      FINALIZAR VIAGEM
                    </button>
                  </div>
                )}

                {etapa === 'concluida' && (
                  <div className="space-y-3 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <CheckCircle2 size={28} />
                    </div>
                    <p className="font-semibold text-slate-900">Viagem finalizada</p>
                    <div className="rounded-xl bg-slate-50 p-4 text-sm">
                      <div className="flex justify-between py-1">
                        <span className="text-slate-500">KM saída</span>
                        <span className="font-semibold text-slate-800">{viagem.kmSaida ?? kmSaida}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-slate-500">KM chegada</span>
                        <span className="font-semibold text-slate-800">{viagem.kmChegada ?? kmChegada}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-200 py-1 pt-2">
                        <span className="font-medium text-slate-600">KM rodados</span>
                        <span className="font-bold text-brand-600">{viagem.km ?? kmRodados} km</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {veiculo && (
              <div className="rounded-2xl bg-white p-5 shadow-popover">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                    <ClipboardCheck size={20} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800">Checklist mensal — {veiculo.placa}</p>
                    <p className="text-xs text-slate-500">
                      {statusChecklistState.loading
                        ? 'Verificando…'
                        : statusMes?.feito
                          ? `Feito em ${statusMes.data ? new Date(statusMes.data).toLocaleDateString('pt-BR') : '—'}`
                          : 'Ainda não feito este mês'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={abrirChecklist}
                  className={cn(
                    'mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold shadow-sm',
                    statusMes?.feito ? 'border border-slate-200 text-slate-600 active:bg-slate-50' : 'bg-brand-600 text-white active:bg-brand-700',
                  )}
                >
                  <ClipboardCheck size={18} /> {statusMes?.feito ? 'Refazer checklist' : 'Fazer checklist do mês'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {modalKm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center">
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 sm:rounded-2xl">
            <p className="mb-3 text-base font-bold text-slate-900">
              {modalKm === 'saida' ? 'KM de saída' : 'KM de chegada'}
            </p>
            <input
              autoFocus
              required
              type="text"
              inputMode="numeric"
              value={modalKm === 'saida' ? kmSaida : kmChegada}
              onChange={(e) => {
                // Só dígitos — KM do odômetro é sempre inteiro (evita "52.671" virar decimal).
                const digitos = e.target.value.replace(/\D/g, '')
                setErroKm(null)
                if (modalKm === 'saida') setKmSaida(digitos)
                else setKmChegada(digitos)
              }}
              placeholder="Ex: 182430"
              className={`w-full rounded-xl border-2 px-4 py-3.5 text-lg font-semibold outline-none ${
                erroKm ? 'border-red-400 focus:border-red-500' : 'border-slate-200 focus:border-brand-400'
              }`}
            />
            {erroKm && (
              <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {erroKm}
              </p>
            )}
            {modalKm === 'saida' && (
              <label className="mt-3 block text-sm">
                <span className="mb-1 block font-medium text-slate-600">Notas fiscais da carga</span>
                <input
                  required
                  value={notasFiscais}
                  onChange={(e) => setNotasFiscais(e.target.value)}
                  placeholder="Ex: 106190/106191"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
                />
              </label>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  setErroKm(null)
                  setModalKm(null)
                }}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarKm}
                disabled={salvando}
                className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {salvando ? 'Salvando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {agendaFormOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center">
          <form onSubmit={salvarNovaReserva} className="w-full max-w-sm space-y-3 rounded-t-2xl bg-white p-6 sm:rounded-2xl">
            <p className="text-base font-bold text-slate-900">Nova reserva</p>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">
                Título{agendaForm.tipo !== 'reserva' && ' (opcional)'}
              </span>
              <select
                required={agendaForm.tipo === 'reserva'}
                value={agendaForm.titulo}
                onChange={(e) => setAgendaForm((f) => ({ ...f, titulo: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
              >
                <option value="">{agendaForm.tipo === 'reserva' ? 'Selecione…' : 'Nenhum'}</option>
                {TITULOS_RESERVA.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">Tipo</span>
              <select
                value={agendaForm.tipo}
                onChange={(e) => setAgendaForm((f) => ({ ...f, tipo: e.target.value as AgendaItem['tipo'] }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
              >
                <option value="reserva">Reserva / Viagem</option>
                <option value="retorno">Disponível</option>
                <option value="manutencao">Manutenção</option>
                <option value="bloqueio">Bloqueado</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">Veículo</span>
              <select
                required
                value={agendaForm.veiculoId}
                onChange={(e) => setAgendaForm((f) => ({ ...f, veiculoId: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
              >
                <option value="">Selecione…</option>
                {veiculosState.data?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.placa} — {v.modelo}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">Início</span>
                <input
                  required
                  type="datetime-local"
                  value={agendaForm.inicio}
                  onChange={(e) => setAgendaForm((f) => ({ ...f, inicio: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-2 py-2.5 text-sm outline-none focus:border-brand-400"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">Fim</span>
                <input
                  required
                  type="datetime-local"
                  value={agendaForm.fim}
                  onChange={(e) => setAgendaForm((f) => ({ ...f, fim: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-2 py-2.5 text-sm outline-none focus:border-brand-400"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-600">Observação</span>
              <input
                value={agendaForm.observacao}
                onChange={(e) => setAgendaForm((f) => ({ ...f, observacao: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
              />
            </label>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setAgendaFormOpen(false)}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvandoAgenda}
                className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {salvandoAgenda ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmationModal
        open={!!bloqueioAberto}
        onClose={() => setBloqueioAberto(null)}
        onConfirm={confirmarBloqueioChecklist}
        title="Item crítico reprovado"
        description={`"${bloqueioAberto?.descricao}" foi marcado como NÃO OK e é um item crítico. Recomendamos bloquear o veículo até a manutenção ser concluída.`}
        confirmLabel="Bloquear veículo"
        tone="danger"
      />
    </div>
  )
}
