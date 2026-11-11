import { useMemo, useState } from 'react'
import { Plus, Wrench, Pencil, Trash2 } from 'lucide-react'
import { PageHeader, PrimaryButton } from '../components/PageHeader'
import { Table, type Column } from '../components/Table'
import { StatusBadge } from '../components/StatusBadge'
import { Card } from '../components/Card'
import { Modal, ConfirmationModal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { EmptyState, ErrorState, LoadingTable } from '../components/States'
import { useAsync } from '../lib/hooks'
import { listManutencoes, listVeiculos, criarManutencao, atualizarManutencao, excluirManutencao } from '../lib/supabaseClient'
import { formatarData, formatarMoeda } from '../lib/stats'
import type { ManutencaoRegistro } from '../types'

const FORM_INICIAL = {
  veiculoId: '',
  tipo: 'preventiva' as ManutencaoRegistro['tipo'],
  descricao: '',
  status: 'agendada' as ManutencaoRegistro['status'],
  dataInicio: '',
  dataFim: '',
  oficina: '',
  custo: '',
}

export function Manutencao() {
  const manutencoesState = useAsync(() => listManutencoes(), [])
  const veiculosState = useAsync(() => listVeiculos(), [])
  const { show } = useToast()

  const [formOpen, setFormOpen] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState<ManutencaoRegistro | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState(FORM_INICIAL)

  const carregando = manutencoesState.loading || veiculosState.loading
  const erro = manutencoesState.error ?? veiculosState.error
  const manutencoes = manutencoesState.data ?? []
  const veiculos = veiculosState.data ?? []

  const veiculosPorId = useMemo(() => new Map(veiculos.map((v) => [v.id, v])), [veiculos])

  function abrirNovo() {
    setEditandoId(null)
    setForm(FORM_INICIAL)
    setFormOpen(true)
  }

  function abrirEdicao(m: ManutencaoRegistro) {
    setEditandoId(m.id)
    setForm({
      veiculoId: m.veiculoId,
      tipo: m.tipo,
      descricao: m.descricao,
      status: m.status,
      dataInicio: m.dataInicio ? m.dataInicio.slice(0, 10) : '',
      dataFim: m.dataFim ? m.dataFim.slice(0, 10) : '',
      oficina: m.oficina ?? '',
      custo: m.custo != null ? String(m.custo) : '',
    })
    setFormOpen(true)
  }

  async function salvar() {
    if (!form.veiculoId || !form.descricao || !form.dataInicio) {
      show('Preencha veículo, descrição e data de início.')
      return
    }
    setSalvando(true)
    try {
      const base = {
        veiculoId: form.veiculoId,
        tipo: form.tipo,
        descricao: form.descricao,
        dataInicio: form.dataInicio,
        oficina: form.oficina || undefined,
        custo: form.custo ? Number(form.custo) : undefined,
      }
      if (editandoId) {
        await atualizarManutencao(editandoId, { ...base, status: form.status, dataFim: form.dataFim || undefined })
        show('Manutenção atualizada com sucesso.')
      } else {
        await criarManutencao(base)
        show('Manutenção agendada com sucesso.')
      }
      setFormOpen(false)
      setForm(FORM_INICIAL)
      manutencoesState.reload()
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erro ao salvar manutenção.')
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarExclusao() {
    if (!excluindo) return
    try {
      await excluirManutencao(excluindo.id)
      show('Manutenção excluída.')
      manutencoesState.reload()
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erro ao excluir manutenção.')
    } finally {
      setExcluindo(null)
    }
  }

  const columns: Column<ManutencaoRegistro>[] = [
    { header: 'Veículo', accessor: (m) => veiculosPorId.get(m.veiculoId)?.placa ?? '—' },
    { header: 'Tipo', accessor: (m) => (m.tipo === 'preventiva' ? 'Preventiva' : 'Corretiva') },
    { header: 'Descrição', accessor: (m) => <span className="line-clamp-1 max-w-xs">{m.descricao}</span> },
    { header: 'Oficina', accessor: (m) => m.oficina ?? '—' },
    { header: 'Início', accessor: (m) => formatarData(m.dataInicio) },
    { header: 'Custo', accessor: (m) => (m.custo ? formatarMoeda(m.custo) : '—') },
    { header: 'Status', accessor: (m) => <StatusBadge status={m.status} /> },
    {
      header: 'Ações',
      accessor: (m) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              abrirEdicao(m)
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 dark:text-slate-500 dark:hover:bg-slate-800"
            aria-label="Editar"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setExcluindo(m)
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
        title="Manutenção"
        subtitle="Histórico e agendamentos de manutenção da frota"
        action={
          <PrimaryButton icon={Plus} onClick={abrirNovo}>
            Nova manutenção
          </PrimaryButton>
        }
      />

      {erro ? (
        <ErrorState description={erro} />
      ) : carregando ? (
        <LoadingTable />
      ) : manutencoes.length === 0 ? (
        <EmptyState icon={Wrench} title="Nenhuma manutenção registrada" />
      ) : (
        <Table
          columns={columns}
          rows={manutencoes}
          renderMobileCard={(m) => (
            <Card className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{veiculosPorId.get(m.veiculoId)?.placa}</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{m.descricao}</p>
                </div>
                <StatusBadge status={m.status} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>{formatarData(m.dataInicio)}</span>
                {m.custo && <span>{formatarMoeda(m.custo)}</span>}
              </div>
              <div className="mt-2 flex justify-end gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    abrirEdicao(m)
                  }}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Editar"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setExcluindo(m)
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
        title={editandoId ? 'Editar manutenção' : 'Nova manutenção'}
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
          <label className="col-span-2 block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Veículo</span>
            <select
              value={form.veiculoId}
              onChange={(e) => setForm((f) => ({ ...f, veiculoId: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            >
              <option value="">Selecione…</option>
              {veiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.placa} — {v.modelo}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Tipo</span>
            <select
              value={form.tipo}
              onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as ManutencaoRegistro['tipo'] }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            >
              <option value="preventiva">Preventiva</option>
              <option value="corretiva">Corretiva</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Data de início</span>
            <input
              type="date"
              value={form.dataInicio}
              onChange={(e) => setForm((f) => ({ ...f, dataInicio: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
          </label>
          <label className="col-span-2 block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Descrição</span>
            <input
              value={form.descricao}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
              placeholder="Troca de óleo e filtros"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Oficina</span>
            <input
              value={form.oficina}
              onChange={(e) => setForm((f) => ({ ...f, oficina: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Custo (R$)</span>
            <input
              type="number"
              value={form.custo}
              onChange={(e) => setForm((f) => ({ ...f, custo: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
          </label>
          {editandoId && (
            <>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Status</span>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ManutencaoRegistro['status'] }))}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
                >
                  <option value="agendada">Agendada</option>
                  <option value="em_andamento">Em andamento</option>
                  <option value="concluida">Concluída</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Data de conclusão</span>
                <input
                  type="date"
                  value={form.dataFim}
                  onChange={(e) => setForm((f) => ({ ...f, dataFim: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
                />
              </label>
            </>
          )}
        </div>
      </Modal>

      <ConfirmationModal
        open={!!excluindo}
        onClose={() => setExcluindo(null)}
        onConfirm={confirmarExclusao}
        title="Excluir manutenção"
        description="Tem certeza que deseja excluir este registro de manutenção? Essa ação não pode ser desfeita."
        confirmLabel="Excluir"
        tone="danger"
      />
    </div>
  )
}
