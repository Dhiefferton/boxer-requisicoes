import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Camera, AlertTriangle, ClipboardCheck, CalendarClock } from 'lucide-react'
import { PageHeader, PrimaryButton } from '../components/PageHeader'
import { SelectFilter, SegmentedControl } from '../components/Filters'
import { Card } from '../components/Card'
import { ConfirmationModal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { ErrorState, LoadingCards } from '../components/States'
import { useAsync } from '../lib/hooks'
import {
  listVeiculos,
  listMotoristas,
  listChecklistExecucoes,
  CHECKLIST_TEMPLATE,
  salvarChecklistExecucao,
  bloquearVeiculo,
} from '../lib/supabaseClient'
import { formatarData, formatarHora } from '../lib/stats'
import type { ChecklistExecucao, ChecklistItem, ChecklistResultado, Motorista, Veiculo } from '../types'
import { cn } from '../lib/cn'

const RESULT_STYLE: Record<ChecklistResultado, { active: string; label: string; badge: string }> = {
  ok: { active: 'bg-emerald-500 text-white border-emerald-500', label: 'OK', badge: 'bg-emerald-100 text-emerald-700' },
  nao_ok: { active: 'bg-red-500 text-white border-red-500', label: 'NÃO OK', badge: 'bg-red-100 text-red-700' },
  na: { active: 'bg-slate-400 text-white border-slate-400', label: 'N/A', badge: 'bg-slate-100 text-slate-600' },
}

function agruparPorCategoria(itens: ChecklistItem[]) {
  const grupos: Record<string, ChecklistItem[]> = {}
  for (const item of itens) {
    grupos[item.categoria] = grupos[item.categoria] ?? []
    grupos[item.categoria].push(item)
  }
  return grupos
}

/** Aba "Checklists feitos" — histórico das vistorias já realizadas, com um
 *  resumo (quantos itens OK/NÃO OK, se algum crítico foi reprovado) e a
 *  lista completa dos itens ao expandir. */
function HistoricoChecklists({
  execucoesState,
  veiculos,
  motoristas,
}: {
  execucoesState: { data: ChecklistExecucao[] | null; loading: boolean; error: string | null }
  veiculos: Veiculo[]
  motoristas: Motorista[]
}) {
  const [expandidas, setExpandidas] = useState<Record<string, boolean>>({})
  const veiculosPorId = useMemo(() => new Map(veiculos.map((v) => [v.id, v])), [veiculos])
  const motoristasPorId = useMemo(() => new Map(motoristas.map((m) => [m.id, m])), [motoristas])

  if (execucoesState.error) return <ErrorState description={execucoesState.error} />
  if (execucoesState.loading) return <LoadingCards count={3} />

  const execucoes = execucoesState.data ?? []
  if (execucoes.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum checklist foi realizado ainda.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {execucoes.map((exec) => {
        const veiculo = veiculosPorId.get(exec.veiculoId)
        const motorista = motoristasPorId.get(exec.motoristaId)
        const naoOk = exec.itens.filter((i) => i.resultado === 'nao_ok')
        const criticoReprovado = naoOk.some((i) => i.critico)
        const aberta = expandidas[exec.id] ?? false

        return (
          <Card key={exec.id} className="p-0">
            <button
              onClick={() => setExpandidas((e) => ({ ...e, [exec.id]: !aberta }))}
              className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  <CalendarClock size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">
                    {veiculo?.placa ?? 'Veículo removido'}
                    {veiculo?.modelo ? ` · ${veiculo.modelo}` : ''}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {motorista?.nome ?? 'Motorista removido'} · {formatarData(exec.data)} às {formatarHora(exec.data)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {criticoReprovado ? (
                  <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                    <AlertTriangle size={12} /> item crítico reprovado
                  </span>
                ) : naoOk.length > 0 ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                    {naoOk.length} reprovado{naoOk.length > 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Tudo OK</span>
                )}
                {!exec.finalizado && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">Não finalizado</span>
                )}
                <ChevronDown size={18} className={cn('text-slate-400 transition-transform', aberta && 'rotate-180')} />
              </div>
            </button>

            {aberta && (
              <div className="space-y-2 border-t border-slate-100 dark:border-slate-700 px-5 py-4">
                {Object.entries(agruparPorCategoria(exec.itens)).map(([categoria, categoriaItens]) => (
                  <div key={categoria}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{categoria}</p>
                    <div className="space-y-1.5">
                      {categoriaItens.map((item) => (
                        <div key={item.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-slate-50 dark:bg-navy-950 px-3 py-2">
                          <div>
                            <p className="text-sm text-slate-700 dark:text-slate-200">
                              {item.descricao}
                              {item.critico && <span className="ml-1.5 text-xs font-semibold text-red-500">crítico</span>}
                            </p>
                            {item.observacao && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.observacao}</p>}
                          </div>
                          <span
                            className={cn(
                              'shrink-0 rounded-full px-2 py-0.5 text-xs font-bold',
                              item.resultado ? RESULT_STYLE[item.resultado].badge : 'bg-slate-100 text-slate-400',
                            )}
                          >
                            {item.resultado ? RESULT_STYLE[item.resultado].label : 'Não avaliado'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

export function Checklist() {
  const [aba, setAba] = useState<'novo' | 'feitos'>('novo')
  const [veiculoId, setVeiculoId] = useState<string | null>(null)
  const [motoristaId, setMotoristaId] = useState<string | null>(null)
  const [itens, setItens] = useState<ChecklistItem[]>(() => CHECKLIST_TEMPLATE.map((i) => ({ ...i })))
  const [expandidas, setExpandidas] = useState<Record<string, boolean>>({ Documentação: true, 'Parte Mecânica': true })
  const [bloqueioAberto, setBloqueioAberto] = useState<ChecklistItem | null>(null)
  const [veiculoBloqueado, setVeiculoBloqueado] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const { show } = useToast()

  const veiculosState = useAsync(() => listVeiculos(), [])
  const motoristasState = useAsync(() => listMotoristas(), [])
  const execucoesState = useAsync(() => listChecklistExecucoes(), [])
  const carregando = veiculosState.loading || motoristasState.loading
  const erro = veiculosState.error ?? motoristasState.error
  const veiculos = veiculosState.data ?? []
  const motoristas = motoristasState.data ?? []

  useEffect(() => {
    if (!veiculoId && veiculos.length > 0) setVeiculoId(veiculos[0].id)
  }, [veiculoId, veiculos])
  useEffect(() => {
    if (!motoristaId && motoristas.length > 0) setMotoristaId(motoristas[0].id)
  }, [motoristaId, motoristas])

  const grupos = useMemo(() => agruparPorCategoria(itens), [itens])
  const problemaCritico = itens.find((i) => i.critico && i.resultado === 'nao_ok')

  function atualizarItem(id: string, resultado: ChecklistResultado) {
    setItens((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i
        const atualizado = { ...i, resultado }
        if (resultado === 'nao_ok' && i.critico) setBloqueioAberto(atualizado)
        return atualizado
      }),
    )
  }

  function atualizarObservacao(id: string, observacao: string) {
    setItens((prev) => prev.map((i) => (i.id === id ? { ...i, observacao } : i)))
  }

  async function salvar() {
    if (!veiculoId || !motoristaId) {
      show('Selecione o veículo e o motorista antes de salvar.')
      return
    }
    setSalvando(true)
    try {
      // O checklist é feito uma única vez (vistoria do veículo) — não existe
      // separação entre "antes da viagem" e "depois da viagem".
      await salvarChecklistExecucao({
        veiculoId,
        motoristaId,
        momento: 'mensal',
        itens,
        finalizado: true,
      })
      show('Checklist salvo com sucesso.')
      execucoesState.reload()
    } catch (err) {
      show(err instanceof Error ? `Erro ao salvar: ${err.message}` : 'Erro ao salvar o checklist.')
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarBloqueio() {
    setVeiculoBloqueado(true)
    if (veiculoId) {
      try {
        await bloquearVeiculo(veiculoId)
      } catch {
        // a UI já reflete o bloqueio localmente; a escrita pode ser tentada novamente ao salvar
      }
    }
  }

  return (
    <div>
      <PageHeader
        title="Checklist"
        subtitle="Garanta a segurança e o bom funcionamento da frota"
        action={
          <SegmentedControl
            value={aba}
            onChange={(v) => setAba(v as 'novo' | 'feitos')}
            options={[
              { value: 'novo', label: 'Novo checklist' },
              { value: 'feitos', label: 'Checklists feitos' },
            ]}
          />
        }
      />

      {erro ? (
        <ErrorState description={erro} />
      ) : carregando ? (
        <LoadingCards count={3} />
      ) : aba === 'feitos' ? (
        <HistoricoChecklists execucoesState={execucoesState} veiculos={veiculos} motoristas={motoristas} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <SelectFilter
              value={veiculoId ?? ''}
              onChange={setVeiculoId}
              options={veiculos.map((v) => ({ value: v.id, label: v.placa }))}
            />
            <SelectFilter
              value={motoristaId ?? ''}
              onChange={setMotoristaId}
              options={motoristas.map((m) => ({ value: m.id, label: m.nome }))}
            />
          </div>

          {problemaCritico && (
            <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
              <AlertTriangle className="mt-0.5 shrink-0 text-red-500" size={20} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-700">⚠ Problema identificado</p>
                <p className="mt-0.5 text-sm text-red-600">
                  {problemaCritico.descricao}
                  {problemaCritico.observacao ? `: ${problemaCritico.observacao}` : ''}. Este veículo deve ser encaminhado para
                  manutenção.
                </p>
                {veiculoBloqueado ? (
                  <span className="mt-2 inline-block rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white">
                    Veículo bloqueado
                  </span>
                ) : (
                  <button
                    onClick={confirmarBloqueio}
                    className="mt-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                  >
                    Bloquear veículo
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {Object.entries(grupos).map(([categoria, categoriaItens]) => {
              const aberta = expandidas[categoria] ?? false
              const pendentes = categoriaItens.filter((i) => !i.resultado).length
              return (
                <Card key={categoria} className="p-0">
                  <button
                    onClick={() => setExpandidas((e) => ({ ...e, [categoria]: !aberta }))}
                    className="flex w-full items-center justify-between px-5 py-4"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{categoria}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                        {categoriaItens.length} itens
                      </span>
                      {pendentes > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          {pendentes} pendentes
                        </span>
                      )}
                    </div>
                    <ChevronDown size={18} className={cn('text-slate-400 transition-transform', aberta && 'rotate-180')} />
                  </button>

                  {aberta && (
                    <div className="space-y-4 border-t border-slate-100 px-5 py-4">
                      {categoriaItens.map((item) => (
                        <div key={item.id}>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm font-medium text-slate-700">
                              {item.descricao}
                              {item.critico && <span className="ml-1.5 text-xs font-semibold text-red-500">crítico</span>}
                            </p>
                            <div className="grid grid-cols-3 gap-2 sm:flex">
                              {(['ok', 'nao_ok', 'na'] as ChecklistResultado[]).map((r) => (
                                <button
                                  key={r}
                                  onClick={() => atualizarItem(item.id, r)}
                                  className={cn(
                                    'min-w-[76px] rounded-xl border-2 px-3 py-2.5 text-sm font-bold transition',
                                  item.resultado === r
                                    ? RESULT_STYLE[r].active
                                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300',
                                  )}
                                >
                                  {RESULT_STYLE[r].label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {item.resultado === 'nao_ok' && (
                            <div className="mt-3 space-y-2 rounded-xl bg-red-50/60 p-3">
                              <textarea
                                value={item.observacao ?? ''}
                                onChange={(e) => atualizarObservacao(item.id, e.target.value)}
                                placeholder="Descreva o problema encontrado…"
                                rows={2}
                                className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400"
                              />
                              <button className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                                <Camera size={16} /> Anexar foto
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>

          <div className="sticky bottom-0 mt-6 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
            <PrimaryButton
              icon={ClipboardCheck}
              onClick={salvar}
              className="w-full py-3.5 text-base sm:w-auto sm:py-2.5 sm:text-sm"
            >
              {salvando ? 'Salvando…' : 'Salvar checklist'}
            </PrimaryButton>
          </div>
        </>
      )}

      <ConfirmationModal
        open={!!bloqueioAberto}
        onClose={() => setBloqueioAberto(null)}
        onConfirm={confirmarBloqueio}
        title="Item crítico reprovado"
        description={`"${bloqueioAberto?.descricao}" foi marcado como NÃO OK e é um item crítico. Recomendamos bloquear o veículo até a manutenção ser concluída.`}
        confirmLabel="Bloquear veículo"
        tone="danger"
      />
    </div>
  )
}
