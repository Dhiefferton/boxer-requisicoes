import { useMemo, useState } from 'react'
import { Plus, UserRound, Phone, Pencil, Trash2 } from 'lucide-react'
import { PageHeader, PrimaryButton } from '../components/PageHeader'
import { FilterBar, SearchInput } from '../components/Filters'
import { Table, type Column } from '../components/Table'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState, ErrorState, LoadingTable } from '../components/States'
import { Card } from '../components/Card'
import { Modal, ConfirmationModal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { useAsync } from '../lib/hooks'
import {
  listMotoristas,
  listViagens,
  listUsuarios,
  contarViagensConcluidasPorMotorista,
  criarMotorista,
  atualizarMotorista,
  excluirMotorista,
} from '../lib/supabaseClient'
import type { Motorista } from '../types'

const FORM_INICIAL = { nome: '', cnh: '', categoriaCnh: '', validadeCnh: '', telefone: '', userId: '' }

export function Motoristas() {
  const [busca, setBusca] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState<Motorista | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState(FORM_INICIAL)
  const { show } = useToast()

  const motoristasState = useAsync(() => listMotoristas(), [])
  const viagensState = useAsync(() => listViagens(), [])
  const usuariosState = useAsync(() => listUsuarios(), [])

  function abrirNovo() {
    setEditandoId(null)
    setForm(FORM_INICIAL)
    setFormOpen(true)
  }

  function abrirEdicao(m: Motorista) {
    setEditandoId(m.id)
    setForm({
      nome: m.nome,
      cnh: m.cnh,
      categoriaCnh: m.categoriaCnh,
      validadeCnh: m.validadeCnh,
      telefone: m.telefone,
      userId: m.userId ?? '',
    })
    setFormOpen(true)
  }

  async function salvar() {
    if (!form.nome || !form.cnh) {
      show('Preencha nome e CNH.')
      return
    }
    setSalvando(true)
    try {
      const payload = {
        nome: form.nome,
        cnh: form.cnh,
        categoriaCnh: form.categoriaCnh,
        validadeCnh: form.validadeCnh,
        telefone: form.telefone,
        userId: form.userId || null,
      }
      if (editandoId) {
        await atualizarMotorista(editandoId, payload)
        show('Motorista atualizado com sucesso.')
      } else {
        await criarMotorista(payload)
        show('Motorista cadastrado com sucesso.')
      }
      setFormOpen(false)
      motoristasState.reload()
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erro ao salvar motorista.')
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarExclusao() {
    if (!excluindo) return
    try {
      await excluirMotorista(excluindo.id)
      show('Motorista excluído.')
      motoristasState.reload()
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erro ao excluir motorista.')
    } finally {
      setExcluindo(null)
    }
  }

  const carregando = motoristasState.loading || viagensState.loading
  const erro = motoristasState.error ?? viagensState.error

  const motoristasComEstatisticas = useMemo(
    () => contarViagensConcluidasPorMotorista(motoristasState.data ?? [], viagensState.data ?? []),
    [motoristasState.data, viagensState.data],
  )

  const filtrados = useMemo(
    () => motoristasComEstatisticas.filter((m) => !busca || m.nome.toLowerCase().includes(busca.toLowerCase())),
    [busca, motoristasComEstatisticas],
  )

  const usuariosDisponiveis = usuariosState.data ?? []

  const columns: Column<Motorista>[] = [
    {
      header: 'Motorista',
      accessor: (m) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
            <UserRound size={16} />
          </div>
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{m.nome}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">CNH {m.categoriaCnh} · {m.cnh}</p>
          </div>
        </div>
      ),
    },
    { header: 'Telefone', accessor: (m) => m.telefone },
    {
      header: 'Validade CNH',
      accessor: (m) => (m.validadeCnh ? new Date(m.validadeCnh).toLocaleDateString('pt-BR') : '—'),
    },
    { header: 'Viagens', accessor: (m) => m.viagensRealizadas },
    { header: 'Status', accessor: (m) => <StatusBadge status={m.status} /> },
    {
      header: 'Login vinculado',
      accessor: (m) => (m.userId ? <span className="text-xs text-emerald-600 dark:text-emerald-400">Vinculado</span> : <span className="text-xs text-slate-400 dark:text-slate-500">—</span>),
    },
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
        title="Motoristas"
        subtitle="Cadastro e acompanhamento da equipe de motoristas"
        action={
          <PrimaryButton icon={Plus} onClick={abrirNovo}>
            Novo motorista
          </PrimaryButton>
        }
      />

      <FilterBar>
        <SearchInput value={busca} onChange={setBusca} placeholder="Buscar por nome…" className="w-full sm:w-72" />
      </FilterBar>

      {erro ? (
        <ErrorState description={erro} />
      ) : carregando ? (
        <LoadingTable />
      ) : filtrados.length === 0 ? (
        <EmptyState icon={UserRound} title="Nenhum motorista encontrado" />
      ) : (
        <Table
          columns={columns}
          rows={filtrados}
          renderMobileCard={(m) => (
            <Card className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
                    <UserRound size={18} />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{m.nome}</p>
                    <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <Phone size={11} /> {m.telefone}
                    </p>
                  </div>
                </div>
                <StatusBadge status={m.status} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <div className="flex gap-4">
                  <span>CNH {m.categoriaCnh}</span>
                  <span>{m.viagensRealizadas} viagens</span>
                </div>
                <div className="flex gap-1">
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
              </div>
            </Card>
          )}
        />
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editandoId ? 'Editar motorista' : 'Novo motorista'}
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
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Nome</span>
            <input
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
              placeholder="Nome completo"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">CNH</span>
            <input
              value={form.cnh}
              onChange={(e) => setForm((f) => ({ ...f, cnh: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Categoria CNH</span>
            <input
              value={form.categoriaCnh}
              onChange={(e) => setForm((f) => ({ ...f, categoriaCnh: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
              placeholder="E"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Validade CNH</span>
            <input
              type="date"
              value={form.validadeCnh}
              onChange={(e) => setForm((f) => ({ ...f, validadeCnh: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Telefone</span>
            <input
              value={form.telefone}
              onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
              placeholder="(11) 99999-9999"
            />
          </label>
          <label className="col-span-2 block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Login vinculado (modo motorista)</span>
            <select
              value={form.userId}
              onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            >
              <option value="">Nenhum (sem acesso ao modo motorista)</option>
              {usuariosDisponiveis.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome} {u.email ? `(${u.email})` : ''}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">
              Vincule a um usuário cadastrado em "Usuários" para que ele consiga abrir o modo motorista com o próprio login.
            </span>
          </label>
        </div>
      </Modal>

      <ConfirmationModal
        open={!!excluindo}
        onClose={() => setExcluindo(null)}
        onConfirm={confirmarExclusao}
        title="Excluir motorista"
        description={`Tem certeza que deseja excluir ${excluindo?.nome}? Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        tone="danger"
      />
    </div>
  )
}
