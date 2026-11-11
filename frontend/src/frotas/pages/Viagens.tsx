import { useMemo, useState } from 'react'
import { Plus, Route, Pencil, Trash2 } from 'lucide-react'
import { PageHeader, PrimaryButton } from '../components/PageHeader'
import { FilterBar, SearchInput, SelectFilter } from '../components/Filters'
import { Table, type Column } from '../components/Table'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState, ErrorState, LoadingTable } from '../components/States'
import { Card } from '../components/Card'
import { Modal, ConfirmationModal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { useAsync } from '../lib/hooks'
import { listViagens, listVeiculos, listMotoristas, criarViagem, atualizarViagem, excluirViagem } from '../lib/supabaseClient'
import { formatarData, formatarHora, paraDatetimeLocal } from '../lib/stats'
import type { Viagem } from '../types'

const FORM_INICIAL = {
  numero: '',
  data: '',
  veiculoId: '',
  motoristaId: '',
  origem: '',
  destino: '',
  saidaPrevista: '',
  chegadaPrevista: '',
  status: 'programada' as Viagem['status'],
}

export function Viagens() {
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('todos')
  const [formOpen, setFormOpen] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState<Viagem | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState(FORM_INICIAL)
  const { show } = useToast()

  const viagensState = useAsync(() => listViagens(), [])
  const veiculosState = useAsync(() => listVeiculos(), [])
  const motoristasState = useAsync(() => listMotoristas(), [])

  function abrirNovo() {
    setEditandoId(null)
    setForm(FORM_INICIAL)
    setFormOpen(true)
  }

  function abrirEdicao(t: Viagem) {
    setEditandoId(t.id)
    setForm({
      numero: t.numero,
      data: t.data ? t.data.slice(0, 10) : '',
      veiculoId: t.veiculoId,
      motoristaId: t.motoristaId,
      origem: t.origem,
      destino: t.destino,
      saidaPrevista: t.saidaPrevista ? paraDatetimeLocal(t.saidaPrevista) : '',
      chegadaPrevista: t.chegadaPrevista ? paraDatetimeLocal(t.chegadaPrevista) : '',
      status: t.status,
    })
    setFormOpen(true)
  }

  async function salvar() {
    if (!form.numero || !form.data || !form.veiculoId || !form.motoristaId || !form.origem || !form.destino) {
      show('Preencha número, data, veículo, motorista, origem e destino.')
      return
    }
    setSalvando(true)
    try {
      const payload = {
        numero: form.numero,
        data: form.data,
        veiculoId: form.veiculoId,
        motoristaId: form.motoristaId,
        origem: form.origem,
        destino: form.destino,
        // Os campos vêm de <input type="datetime-local"> em horário local —
        // new Date(...).toISOString() converte para o instante UTC correto
        // antes de salvar (o banco guarda tudo em UTC). Sem isso o valor era
        // salvo cru e reaparecia com um horário diferente do que foi digitado.
        saidaPrevista: form.saidaPrevista ? new Date(form.saidaPrevista).toISOString() : '',
        chegadaPrevista: form.chegadaPrevista ? new Date(form.chegadaPrevista).toISOString() : '',
      }
      if (editandoId) {
        await atualizarViagem(editandoId, { ...payload, status: form.status })
        show('Viagem atualizada com sucesso.')
      } else {
        await criarViagem(payload)
        show('Viagem criada com sucesso.')
      }
      setFormOpen(false)
      setForm(FORM_INICIAL)
      viagensState.reload()
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erro ao salvar viagem.')
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarExclusao() {
    if (!excluindo) return
    try {
      await excluirViagem(excluindo.id)
      show('Viagem excluída.')
      viagensState.reload()
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erro ao excluir viagem.')
    } finally {
      setExcluindo(null)
    }
  }

  const carregando = viagensState.loading || veiculosState.loading || motoristasState.loading
  const erro = viagensState.error ?? veiculosState.error ?? motoristasState.error

  const todasViagens = viagensState.data ?? []
  const veiculos = veiculosState.data ?? []
  const motoristas = motoristasState.data ?? []

  const veiculosPorId = useMemo(() => new Map(veiculos.map((v) => [v.id, v])), [veiculos])
  const motoristasPorId = useMemo(() => new Map(motoristas.map((m) => [m.id, m])), [motoristas])

  const filtradas = useMemo(() => {
    return todasViagens.filter((t) => {
      const veiculo = veiculosPorId.get(t.veiculoId)
      const motorista = motoristasPorId.get(t.motoristaId)
      const bateBusca =
        !busca ||
        t.destino.toLowerCase().includes(busca.toLowerCase()) ||
        veiculo?.placa.toLowerCase().includes(busca.toLowerCase()) ||
        motorista?.nome.toLowerCase().includes(busca.toLowerCase())
      const bateStatus = status === 'todos' || t.status === status
      return bateBusca && bateStatus
    })
  }, [busca, status, todasViagens, veiculosPorId, motoristasPorId])

  const columns: Column<Viagem>[] = [
    { header: 'Nº', accessor: (t) => <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{t.numero}</span> },
    { header: 'Data', accessor: (t) => formatarData(t.data) },
    { header: 'Veículo', accessor: (t) => veiculosPorId.get(t.veiculoId)?.placa ?? '—' },
    { header: 'Motorista', accessor: (t) => motoristasPorId.get(t.motoristaId)?.nome ?? '—' },
    { header: 'Destino', accessor: (t) => t.destino },
    { header: 'Saída', accessor: (t) => (t.saidaPrevista ? formatarHora(t.saidaPrevista) : '—') },
    { header: 'Chegada', accessor: (t) => (t.chegadaPrevista ? formatarHora(t.chegadaPrevista) : '—') },
    { header: 'KM', accessor: (t) => (t.km ? t.km.toLocaleString('pt-BR') : '—') },
    { header: 'Status', accessor: (t) => <StatusBadge status={t.status} /> },
    {
      header: 'Ações',
      accessor: (t) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              abrirEdicao(t)
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 dark:text-slate-500 dark:hover:bg-slate-800"
            aria-label="Editar"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setExcluindo(t)
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-500/10"
            aria-label="Excluir"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Viagens"
        subtitle="Controle completo de todas as viagens"
        action={
          <PrimaryButton icon={Plus} onClick={abrirNovo}>
            Nova viagem
          </PrimaryButton>
        }
      />

      <FilterBar>
        <SearchInput value={busca} onChange={setBusca} placeholder="Buscar por destino, veículo ou motorista…" className="w-full sm:w-80" />
        <SelectFilter
          value={status}
          onChange={setStatus}
          options={[
            { value: 'todos', label: 'Todos os status' },
            { value: 'programada', label: 'Programada' },
            { value: 'em_viagem', label: 'Em viagem' },
            { value: 'concluida', label: 'Concluída' },
            { value: 'cancelada', label: 'Cancelada' },
          ]}
        />
      </FilterBar>

      {erro ? (
        <ErrorState description={erro} />
      ) : carregando ? (
        <LoadingTable />
      ) : filtradas.length === 0 ? (
        <EmptyState icon={Route} title="Nenhuma viagem encontrada" description="Ajuste os filtros para ver mais resultados." />
      ) : (
        <Table
          columns={columns}
          rows={filtradas}
          renderMobileCard={(t) => (
            <Card className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{t.destino}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {veiculosPorId.get(t.veiculoId)?.placa} · {motoristasPorId.get(t.motoristaId)?.nome}
                  </p>
                </div>
                <StatusBadge status={t.status} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>{formatarData(t.data)}</span>
                <span>
                  {t.saidaPrevista ? formatarHora(t.saidaPrevista) : '—'} → {t.chegadaPrevista ? formatarHora(t.chegadaPrevista) : '—'}
                </span>
                {t.km ? <span>{t.km.toLocaleString('pt-BR')} km</span> : null}
              </div>
              <div className="mt-3 flex justify-end gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    abrirEdicao(t)
                  }}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Editar"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setExcluindo(t)
                  }}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                  aria-label="Excluir"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </Card>
          )}
        />
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editandoId ? 'Editar viagem' : 'Nova viagem'}
        size="lg"
        footer={
          <>
            <button onClick={() => setFormOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
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
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Número</span>
            <input
              value={form.numero}
              onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
              placeholder="V-0001"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Data</span>
            <input
              type="date"
              value={form.data}
              onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Veículo</span>
            <select
              value={form.veiculoId}
              onChange={(e) => setForm((f) => ({ ...f, veiculoId: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            >
              <option value="">Selecione…</option>
              {(veiculosState.data ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.placa} — {v.modelo}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Motorista</span>
            <select
              value={form.motoristaId}
              onChange={(e) => setForm((f) => ({ ...f, motoristaId: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            >
              <option value="">Selecione…</option>
              {(motoristasState.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Origem</span>
            <input
              value={form.origem}
              onChange={(e) => setForm((f) => ({ ...f, origem: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Destino</span>
            <input
              value={form.destino}
              onChange={(e) => setForm((f) => ({ ...f, destino: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Saída prevista</span>
            <input
              type="datetime-local"
              value={form.saidaPrevista}
              onChange={(e) => setForm((f) => ({ ...f, saidaPrevista: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Chegada prevista</span>
            <input
              type="datetime-local"
              value={form.chegadaPrevista}
              onChange={(e) => setForm((f) => ({ ...f, chegadaPrevista: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
          </label>
          {editandoId && (
            <label className="col-span-2 block text-sm">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Status</span>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Viagem['status'] }))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
              >
                <option value="programada">Programada</option>
                <option value="em_viagem">Em viagem</option>
                <option value="concluida">Concluída</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </label>
          )}
        </div>
      </Modal>

      <ConfirmationModal
        open={!!excluindo}
        onClose={() => setExcluindo(null)}
        onConfirm={confirmarExclusao}
        title="Excluir viagem"
        description={`Tem certeza que deseja excluir a viagem ${excluindo?.numero}? Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        tone="danger"
      />
    </div>
  )
}
