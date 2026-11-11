import { useMemo } from 'react'
import { Clock } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/Card'
import { StatusBadge } from '../components/StatusBadge'
import { ErrorState, LoadingCards } from '../components/States'
import { useAsync } from '../lib/hooks'
import { listVeiculos, listViagens, listMotoristas, listAgendaItems } from '../lib/supabaseClient'
import { formatarHora, formatarData } from '../lib/stats'
import type { Veiculo, VeiculoStatus } from '../types'
import { cn } from '../lib/cn'

const AVISO_ANTECEDENCIA_MS = 24 * 60 * 60 * 1000

const COLUNAS: { status: VeiculoStatus; titulo: string; barra: string }[] = [
  { status: 'disponivel', titulo: 'Disponível', barra: 'bg-status-available' },
  { status: 'reservado', titulo: 'Reservado', barra: 'bg-status-reserved' },
  { status: 'em_viagem', titulo: 'Em viagem', barra: 'bg-status-trip' },
  { status: 'manutencao', titulo: 'Manutenção', barra: 'bg-status-maintenance' },
  { status: 'bloqueado', titulo: 'Bloqueado', barra: 'bg-status-blocked' },
  { status: 'retornando', titulo: 'Retornando', barra: 'bg-status-idle' },
]

export function CentroOperacoes() {
  const veiculosState = useAsync(() => listVeiculos(), [])
  const viagensState = useAsync(() => listViagens(), [])
  const motoristasState = useAsync(() => listMotoristas(), [])
  const agendaState = useAsync(() => listAgendaItems(), [])

  const carregando = veiculosState.loading || viagensState.loading || motoristasState.loading || agendaState.loading
  const erro = veiculosState.error ?? viagensState.error ?? motoristasState.error ?? agendaState.error

  const veiculos = veiculosState.data ?? []
  const viagens = viagensState.data ?? []
  const motoristas = motoristasState.data ?? []
  const agendaItems = agendaState.data ?? []

  const motoristasPorId = useMemo(() => new Map(motoristas.map((m) => [m.id, m])), [motoristas])

  function viagemAtivaDoVeiculo(veiculoId: string) {
    return viagens.find((t) => t.veiculoId === veiculoId && (t.status === 'em_viagem' || t.status === 'programada'))
  }

  // O status do veículo (coluna `veiculos.status`) só é atualizado de fato
  // quando uma viagem inicia/termina ou no bloqueio manual do Checklist.
  // Um "bloqueio" agendado na Agenda (ex.: 2h reservadas para amanhã) não
  // grava nada em `veiculos.status` — e não deveria, já que o bloqueio só
  // vale durante o período marcado. Por isso o status exibido aqui é
  // calculado a cada carregamento da tela: se existe um item tipo
  // "bloqueio" cujo período cobre o instante atual, o veículo aparece como
  // "Bloqueado" enquanto durar, voltando ao status normal sozinho depois
  // (sem precisar de nenhuma ação manual) — mesma ideia já usada para
  // "Em viagem".
  function statusEfetivo(v: Veiculo): VeiculoStatus {
    if (v.status === 'em_viagem') return v.status
    const agora = new Date()
    const bloqueioAtivo = agendaItems.some(
      (a) => a.veiculoId === v.id && a.tipo === 'bloqueio' && new Date(a.inicio) <= agora && new Date(a.fim) >= agora,
    )
    return bloqueioAtivo ? 'bloqueado' : v.status
  }

  // Bloqueio que ainda não começou, mas começa dentro das próximas 24h — para
  // avisar com antecedência na própria tela, sem esperar o bloqueio virar
  // "ativo" (o veículo continua no status normal dele até lá).
  function proximoBloqueio(v: Veiculo) {
    const agora = new Date()
    const limite = new Date(agora.getTime() + AVISO_ANTECEDENCIA_MS)
    return agendaItems
      .filter(
        (a) => a.veiculoId === v.id && a.tipo === 'bloqueio' && new Date(a.inicio) > agora && new Date(a.inicio) <= limite,
      )
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())[0]
  }

  return (
    <div>
      <PageHeader title="Centro de Operações" subtitle="Torre de controle da frota em tempo real" />

      {erro ? (
        <ErrorState description={erro} />
      ) : carregando ? (
        <LoadingCards count={6} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {COLUNAS.map((col) => {
            const itensColuna = veiculos.filter((v) => statusEfetivo(v) === col.status)
            return (
              <div key={col.status} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-navy-900/60">
                <div className={cn('flex items-center justify-between rounded-t-2xl px-4 py-3 text-white', col.barra)}>
                  <span className="text-sm font-semibold">{col.titulo}</span>
                  <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs font-bold">{itensColuna.length}</span>
                </div>
                <div className="flex flex-1 flex-col gap-2.5 p-3">
                  {itensColuna.length === 0 && (
                    <p className="px-2 py-6 text-center text-xs text-slate-400 dark:text-slate-500">Nenhum veículo</p>
                  )}
                  {itensColuna.map((v) => {
                    const viagem = viagemAtivaDoVeiculo(v.id)
                    const motorista = viagem ? motoristasPorId.get(viagem.motoristaId) : undefined
                    const aviso = proximoBloqueio(v)
                    return (
                      <Card key={v.id} className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{v.placa}</p>
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{v.modelo}</p>
                          </div>
                          <StatusBadge status={statusEfetivo(v)} />
                        </div>
                        {aviso && (
                          <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-2 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                            <Clock size={13} className="shrink-0" />
                            <span className="truncate">
                              Bloqueio agendado: {formatarData(aviso.inicio)} às {formatarHora(aviso.inicio)}
                            </span>
                          </div>
                        )}
                        {viagem && (
                          <div className="mt-2 space-y-1 border-t border-slate-100 dark:border-slate-800 pt-2 text-xs text-slate-500 dark:text-slate-400">
                            <p className="truncate">
                              <span className="font-medium text-slate-700 dark:text-slate-200">{viagem.destino}</span>
                            </p>
                            {motorista && <p className="truncate">{motorista.nome}</p>}
                            <div className="flex items-center justify-between">
                              <span>{formatarHora(viagem.saidaPrevista)}</span>
                              {viagem.km && <span>{viagem.km.toLocaleString('pt-BR')} km</span>}
                            </div>
                          </div>
                        )}
                        {!viagem && (
                          <p className="mt-2 border-t border-slate-100 dark:border-slate-800 pt-2 text-xs text-slate-400 dark:text-slate-500">
                            {v.km.toLocaleString('pt-BR')} km rodados
                          </p>
                        )}
                      </Card>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
