import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Truck as TruckIcon, Pencil, Trash2 } from 'lucide-react'
import { PageHeader, PrimaryButton } from '../components/PageHeader'
import { FilterBar, SearchInput, SelectFilter } from '../components/Filters'
import { Table, type Column } from '../components/Table'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState, ErrorState, LoadingTable } from '../components/States'
import { Card } from '../components/Card'
import { Modal, ConfirmationModal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { useAsync } from '../lib/hooks'
import { listVeiculos, criarVeiculo, atualizarVeiculo, excluirVeiculo } from '../lib/supabaseClient'
import type { Veiculo } from '../types'

const FORM_INICIAL = { placa: '', modelo: '', ano: '', cubagem: '', tipo: 'frota_propria' as Veiculo['tipo'] }

export function Veiculos() {
  const [params] = useSearchParams()
  const [busca, setBusca] = useState(params.get('busca') ?? '')
  const [status, setStatus] = useState('todos')
  const [formOpen, setFormOpen] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState<Veiculo | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState(FORM_INICIAL)
  const { show } = useToast()

  const { data: veiculos, loading, error, reload } = useAsync(() => listVeiculos(), [])
  const todosVeiculos = veiculos ?? []

  function abrirNovo() {
    setEditandoId(null)
    setForm(FORM_INICIAL)
    setFormOpen(true)
  }

  function abrirEdicao(v: Veiculo) {
    setEditandoId(v.id)
    setForm({ placa: v.placa, modelo: v.modelo, ano: String(v.ano), cubagem: v.cubagem, tipo: v.tipo })
    setFormOpen(true)
  }

  async function salvar() {
    if (!form.placa || !form.modelo || !form.ano) {
      show('Preencha placa, modelo e ano.')
      return
    }
    setSalvando(true)
    try {
      const payload = { placa: form.placa, modelo: form.modelo, ano: Number(form.ano), cubagem: form.cubagem, tipo: form.tipo }
      if (editandoId) {
        await atualizarVeiculo(editandoId, payload)
        show('Veículo atualizado com sucesso.')
      } else {
        await criarVeiculo(payload)
        show('Veículo cadastrado com sucesso.')
      }
      setFormOpen(false)
      reload()
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erro ao salvar veículo.')
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarExclusao() {
    if (!excluindo) return
    try {
      await excluirVeiculo(excluindo.id)
      show('Veículo excluído.')
      reload()
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erro ao excluir veículo.')
    } finally {
      setExcluindo(null)
    }
  }

  const filtrados = useMemo(() => {
    return todosVeiculos.filter((v) => {
      const bateBusca =
        !busca || v.placa.toLowerCase().includes(busca.toLowerCase()) || v.modelo.toLowerCase().includes(busca.toLowerCase())
      const bateStatus = status === 'todos' || v.status === status
      return bateBusca && bateStatus
    })
  }, [busca, status, todosVeiculos])

  const columns: Column<Veiculo>[] = [
    {
      header: 'Veículo',
      accessor: (v) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
            <TruckIcon size={16} />
          </div>
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{v.placa}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{v.modelo}</p>
          </div>
        </div>
      ),
    },
    { header: 'Ano', accessor: (v) => v.ano },
    { header: 'Cubagem', accessor: (v) => v.cubagem },
    { header: 'KM', accessor: (v) => v.km.toLocaleString('pt-BR') },
    { header: 'Status', accessor: (v) => <StatusBadge status={v.status} /> },
    {
      header: 'Ações',
      accessor: (v) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              abrirEdicao(v)
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 dark:text-slate-500 dark:hover:bg-slate-800"
            aria-label="Editar"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setExcluindo(v)
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
        title="Veículos"
        subtitle="Cadastro e gestão da frota"
        action={
          <PrimaryButton icon={Plus} onClick={abrirNovo}>
            Novo veículo
          </PrimaryButton>
        }
      />

      <FilterBar>
        <SearchInput value={busca} onChange={setBusca} placeholder="Buscar por placa ou modelo…" className="w-full sm:w-72" />
        <SelectFilter
          value={status}
          onChange={setStatus}
          options={[
            { value: 'todos', label: 'Todos os status' },
            { value: 'disponivel', label: 'Disponível' },
            { value: 'em_viagem', label: 'Em viagem' },
            { value: 'reservado', label: 'Reservado' },
            { value: 'manutencao', label: 'Manutenção' },
            { value: 'bloqueado', label: 'Bloqueado' },
          ]}
        />
      </FilterBar>

      {error ? (
        <ErrorState description={error} />
      ) : loading ? (
        <LoadingTable />
      ) : filtrados.length === 0 ? (
        <EmptyState icon={TruckIcon} title="Nenhum veículo encontrado" description="Tente ajustar a busca ou os filtros." />
      ) : (
        <Table
          columns={columns}
          rows={filtrados}
          renderMobileCard={(v) => (
            <Card className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
                    <TruckIcon size={18} />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{v.placa}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{v.modelo} · {v.ano}</p>
                  </div>
                </div>
                <StatusBadge status={v.status} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <div className="flex gap-4">
                  <span>{v.cubagem}</span>
                  <span>{v.km.toLocaleString('pt-BR')} km</span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      abrirEdicao(v)
                    }}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="Editar"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setExcluindo(v)
                    }}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                    aria-label="Excluir"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </Card>
          )}
        />
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editandoId ? 'Editar veículo' : 'Novo veículo'}
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
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Placa</span>
            <input
              value={form.placa}
              onChange={(e) => setForm((f) => ({ ...f, placa: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
              placeholder="ABC-1234"
            />
          </label>
          <label className="col-span-2 block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Modelo</span>
            <input
              value={form.modelo}
              onChange={(e) => setForm((f) => ({ ...f, modelo: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
              placeholder="Volvo FH 540"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Ano</span>
            <input
              type="number"
              value={form.ano}
              onChange={(e) => setForm((f) => ({ ...f, ano: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Cubagem</span>
            <input
              value={form.cubagem}
              onChange={(e) => setForm((f) => ({ ...f, cubagem: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
              placeholder="110 m³"
            />
          </label>
          <label className="col-span-2 block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Tipo</span>
            <select
              value={form.tipo}
              onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as Veiculo['tipo'] }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            >
              <option value="frota_propria">Frota própria</option>
              <option value="transportadora">Transportadora</option>
            </select>
          </label>
        </div>
      </Modal>

      <ConfirmationModal
        open={!!excluindo}
        onClose={() => setExcluindo(null)}
        onConfirm={confirmarExclusao}
        title="Excluir veículo"
        description={`Tem certeza que deseja excluir o veículo ${excluindo?.placa}? Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        tone="danger"
      />
    </div>
  )
}
