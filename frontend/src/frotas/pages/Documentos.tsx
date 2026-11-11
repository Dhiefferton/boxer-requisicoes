import { useMemo, useState } from 'react'
import { Plus, FileText, Pencil, Trash2 } from 'lucide-react'
import { PageHeader, PrimaryButton } from '../components/PageHeader'
import { Table, type Column } from '../components/Table'
import { StatusBadge } from '../components/StatusBadge'
import { Card } from '../components/Card'
import { Modal, ConfirmationModal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { EmptyState, ErrorState, LoadingTable } from '../components/States'
import { useAsync } from '../lib/hooks'
import { listDocumentos, listVeiculos, listMotoristas, criarDocumento, atualizarDocumento, excluirDocumento } from '../lib/supabaseClient'
import type { Documento } from '../types'

const TIPOS: Documento['tipo'][] = ['CRLV', 'Licenciamento', 'Seguro', 'CNH', 'Outros']

const FORM_INICIAL = {
  entidade: 'veiculo' as Documento['entidade'],
  entidadeId: '',
  tipo: 'CRLV' as Documento['tipo'],
  numero: '',
  validade: '',
}

export function Documentos() {
  const documentosState = useAsync(() => listDocumentos(), [])
  const veiculosState = useAsync(() => listVeiculos(), [])
  const motoristasState = useAsync(() => listMotoristas(), [])
  const { show } = useToast()

  const [formOpen, setFormOpen] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState<Documento | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState(FORM_INICIAL)

  const carregando = documentosState.loading || veiculosState.loading || motoristasState.loading
  const erro = documentosState.error ?? veiculosState.error ?? motoristasState.error
  const documentos = documentosState.data ?? []
  const veiculos = veiculosState.data ?? []
  const motoristas = motoristasState.data ?? []

  const veiculosPorId = useMemo(() => new Map(veiculos.map((v) => [v.id, v])), [veiculos])
  const motoristasPorId = useMemo(() => new Map(motoristas.map((m) => [m.id, m])), [motoristas])

  function nomeEntidade(d: Documento) {
    if (d.entidade === 'veiculo') return veiculosPorId.get(d.entidadeId)?.placa ?? '—'
    return motoristasPorId.get(d.entidadeId)?.nome ?? '—'
  }

  function abrirNovo() {
    setEditandoId(null)
    setForm(FORM_INICIAL)
    setFormOpen(true)
  }

  function abrirEdicao(d: Documento) {
    setEditandoId(d.id)
    setForm({
      entidade: d.entidade,
      entidadeId: d.entidadeId,
      tipo: d.tipo,
      numero: d.numero ?? '',
      validade: d.validade ? d.validade.slice(0, 10) : '',
    })
    setFormOpen(true)
  }

  async function salvar() {
    if (!form.entidadeId || !form.tipo) {
      show('Selecione a entidade e o tipo de documento.')
      return
    }
    setSalvando(true)
    try {
      const payload = {
        entidade: form.entidade,
        entidadeId: form.entidadeId,
        tipo: form.tipo,
        numero: form.numero || undefined,
        validade: form.validade || undefined,
      }
      if (editandoId) {
        await atualizarDocumento(editandoId, payload)
        show('Documento atualizado com sucesso.')
      } else {
        await criarDocumento(payload)
        show('Documento cadastrado com sucesso.')
      }
      setFormOpen(false)
      setForm(FORM_INICIAL)
      documentosState.reload()
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erro ao salvar documento.')
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarExclusao() {
    if (!excluindo) return
    try {
      await excluirDocumento(excluindo.id)
      show('Documento excluído.')
      documentosState.reload()
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erro ao excluir documento.')
    } finally {
      setExcluindo(null)
    }
  }

  const columns: Column<Documento>[] = [
    { header: 'Entidade', accessor: (d) => nomeEntidade(d) },
    { header: 'Tipo', accessor: (d) => d.tipo },
    { header: 'Número', accessor: (d) => d.numero ?? '—' },
    { header: 'Validade', accessor: (d) => (d.validade ? new Date(d.validade).toLocaleDateString('pt-BR') : '—') },
    { header: 'Status', accessor: (d) => <StatusBadge status={d.status} /> },
    {
      header: 'Ações',
      accessor: (d) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              abrirEdicao(d)
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 dark:text-slate-500 dark:hover:bg-slate-800"
            aria-label="Editar"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setExcluindo(d)
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
        title="Documentos"
        subtitle="Documentação de veículos e motoristas"
        action={
          <PrimaryButton icon={Plus} onClick={abrirNovo}>
            Novo documento
          </PrimaryButton>
        }
      />

      {erro ? (
        <ErrorState description={erro} />
      ) : carregando ? (
        <LoadingTable />
      ) : documentos.length === 0 ? (
        <EmptyState icon={FileText} title="Nenhum documento cadastrado" />
      ) : (
        <Table
          columns={columns}
          rows={documentos}
          renderMobileCard={(d) => (
            <Card className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{nomeEntidade(d)}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{d.tipo}</p>
                </div>
                <StatusBadge status={d.status} />
              </div>
              {d.validade && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Validade: {new Date(d.validade).toLocaleDateString('pt-BR')}</p>
              )}
              <div className="mt-2 flex justify-end gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    abrirEdicao(d)
                  }}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Editar"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setExcluindo(d)
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
        title={editandoId ? 'Editar documento' : 'Novo documento'}
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
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Vincular a</span>
            <select
              value={form.entidade}
              onChange={(e) => setForm((f) => ({ ...f, entidade: e.target.value as Documento['entidade'], entidadeId: '' }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            >
              <option value="veiculo">Veículo</option>
              <option value="motorista">Motorista</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{form.entidade === 'veiculo' ? 'Veículo' : 'Motorista'}</span>
            <select
              value={form.entidadeId}
              onChange={(e) => setForm((f) => ({ ...f, entidadeId: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            >
              <option value="">Selecione…</option>
              {form.entidade === 'veiculo'
                ? veiculos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.placa} — {v.modelo}
                    </option>
                  ))
                : motoristas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Tipo</span>
            <select
              value={form.tipo}
              onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as Documento['tipo'] }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Número</span>
            <input
              value={form.numero}
              onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
          </label>
          <label className="col-span-2 block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Validade</span>
            <input
              type="date"
              value={form.validade}
              onChange={(e) => setForm((f) => ({ ...f, validade: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
            <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">
              O status (em dia / vencendo / vencido) é calculado automaticamente a partir desta data.
            </span>
          </label>
        </div>
      </Modal>

      <ConfirmationModal
        open={!!excluindo}
        onClose={() => setExcluindo(null)}
        onConfirm={confirmarExclusao}
        title="Excluir documento"
        description="Tem certeza que deseja excluir este documento? Essa ação não pode ser desfeita."
        confirmLabel="Excluir"
        tone="danger"
      />
    </div>
  )
}
