import { useState } from 'react'
import { Plus, Users as UsersIcon, RefreshCw, Pencil, Ban, RotateCcw } from 'lucide-react'
import { PageHeader, PrimaryButton } from '../components/PageHeader'
import { Table, type Column } from '../components/Table'
import { Card } from '../components/Card'
import { Modal, ConfirmationModal } from '../components/Modal'
import { EmptyState, ErrorState, LoadingTable } from '../components/States'
import { useToast } from '../components/Toast'
import { useAsync } from '../lib/hooks'
import { listUsuarios, criarUsuario, atualizarUsuario, desativarUsuario, reativarUsuario } from '../lib/supabaseClient'
import type { Usuario } from '../types'

const PERFIL_LABEL: Record<Usuario['perfil'], string> = {
  gestor: 'Gestor',
  operador: 'Operador Logística',
  operador_comex: 'Operador Comex',
  motorista: 'Motorista',
}

function gerarSenhaProvisoria() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let senha = ''
  for (let i = 0; i < 10; i++) senha += chars[Math.floor(Math.random() * chars.length)]
  return senha
}

const FORM_INICIAL = {
  nome: '',
  email: '',
  cargo: '',
  perfil: 'operador' as Usuario['perfil'],
  senha: gerarSenhaProvisoria(),
}

export function Usuarios() {
  const { data: usuarios, loading, error, reload } = useAsync(() => listUsuarios(), [])
  const lista = usuarios ?? []
  const { show } = useToast()

  const [formOpen, setFormOpen] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [alterandoStatus, setAlterandoStatus] = useState<Usuario | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState(FORM_INICIAL)

  function abrirNovo() {
    setEditandoId(null)
    setForm({ ...FORM_INICIAL, senha: gerarSenhaProvisoria() })
    setFormOpen(true)
  }

  function abrirEdicao(u: Usuario) {
    setEditandoId(u.id)
    setForm({ nome: u.nome, email: u.email, cargo: u.cargo ?? '', perfil: u.perfil, senha: '' })
    setFormOpen(true)
  }

  async function salvar() {
    if (!form.nome) {
      show('Preencha o nome.')
      return
    }
    setSalvando(true)
    try {
      if (editandoId) {
        await atualizarUsuario(editandoId, { nome: form.nome, cargo: form.cargo, perfil: form.perfil })
        show('Usuário atualizado com sucesso.')
        setFormOpen(false)
        reload()
      } else {
        if (!form.email || !form.senha) {
          show('Preencha e-mail e senha provisória.')
          setSalvando(false)
          return
        }
        await criarUsuario({
          nome: form.nome,
          email: form.email,
          senha: form.senha,
          cargo: form.cargo,
          perfil: form.perfil,
        })
        setFormOpen(false)
        show(`Usuário criado. Senha provisória: ${form.senha} — repasse ao ${form.nome} para o primeiro acesso.`)
        reload()
      }
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erro ao salvar usuário.')
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarAlteracaoStatus() {
    if (!alterandoStatus) return
    try {
      if (alterandoStatus.ativo) {
        await desativarUsuario(alterandoStatus.id)
        show('Usuário desativado.')
      } else {
        await reativarUsuario(alterandoStatus.id)
        show('Usuário reativado.')
      }
      reload()
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erro ao alterar status do usuário.')
    } finally {
      setAlterandoStatus(null)
    }
  }

  const columns: Column<Usuario>[] = [
    {
      header: 'Usuário',
      accessor: (u) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-900 text-sm font-bold text-white">
            {u.nome.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{u.nome}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{u.email}</p>
          </div>
        </div>
      ),
    },
    { header: 'Cargo', accessor: (u) => u.cargo || '—' },
    { header: 'Perfil', accessor: (u) => PERFIL_LABEL[u.perfil] },
    {
      header: 'Status',
      accessor: (u) => (
        <span className={`text-xs font-semibold ${u.ativo ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
          {u.ativo ? 'Ativo' : 'Inativo'}
        </span>
      ),
    },
    {
      header: 'Ações',
      accessor: (u) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              abrirEdicao(u)
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 dark:text-slate-500 dark:hover:bg-slate-800"
            aria-label="Editar"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setAlterandoStatus(u)
            }}
            className={
              u.ativo
                ? 'rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-500/10'
                : 'rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:text-slate-500 dark:hover:bg-emerald-500/10'
            }
            aria-label={u.ativo ? 'Desativar' : 'Reativar'}
          >
            {u.ativo ? <Ban size={15} /> : <RotateCcw size={15} />}
          </button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Usuários"
        subtitle="Gerencie o acesso da sua equipe ao sistema"
        action={
          <PrimaryButton icon={Plus} onClick={abrirNovo}>
            Novo usuário
          </PrimaryButton>
        }
      />

      {error ? (
        <ErrorState description={error} />
      ) : loading ? (
        <LoadingTable />
      ) : lista.length === 0 ? (
        <EmptyState icon={UsersIcon} title="Nenhum usuário cadastrado" />
      ) : (
        <Table
          columns={columns}
          rows={lista}
          renderMobileCard={(u) => (
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-900 text-sm font-bold text-white">
                  {u.nome.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900 dark:text-white">{u.nome}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{u.cargo}</p>
                </div>
                <span className={`text-xs font-semibold ${u.ativo ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                  {u.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <div className="mt-2 flex justify-end gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    abrirEdicao(u)
                  }}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Editar"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setAlterandoStatus(u)
                  }}
                  className={
                    u.ativo
                      ? 'rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10'
                      : 'rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10'
                  }
                  aria-label={u.ativo ? 'Desativar' : 'Reativar'}
                >
                  {u.ativo ? <Ban size={15} /> : <RotateCcw size={15} />}
                </button>
              </div>
            </Card>
          )}
        />
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editandoId ? 'Editar usuário' : 'Novo usuário'}
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
          <label className="col-span-2 block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">E-mail</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              disabled={!!editandoId}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400 disabled:bg-slate-50 dark:disabled:bg-navy-950 disabled:text-slate-400"
              placeholder="nome@empresa.com"
            />
            {editandoId && (
              <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">O e-mail não pode ser alterado por aqui.</span>
            )}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Cargo</span>
            <input
              value={form.cargo}
              onChange={(e) => setForm((f) => ({ ...f, cargo: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
              placeholder="Ex: Coordenador de frota"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Perfil</span>
            <select
              value={form.perfil}
              onChange={(e) => setForm((f) => ({ ...f, perfil: e.target.value as Usuario['perfil'] }))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
            >
              <option value="gestor">Gestor</option>
              <option value="operador">Operador Logística</option>
              <option value="operador_comex">Operador Comex</option>
              <option value="motorista">Motorista</option>
            </select>
          </label>
          {!editandoId && (
            <label className="col-span-2 block text-sm">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Senha provisória</span>
              <div className="flex gap-2">
                <input
                  value={form.senha}
                  onChange={(e) => setForm((f) => ({ ...f, senha: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand-400"
                />
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, senha: gerarSenhaProvisoria() }))}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-950"
                >
                  <RefreshCw size={14} />
                  Gerar
                </button>
              </div>
              <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">
                Repasse essa senha para o usuário fazer o primeiro acesso (pode ser exigida confirmação por e-mail).
              </span>
            </label>
          )}
        </div>
      </Modal>

      <ConfirmationModal
        open={!!alterandoStatus}
        onClose={() => setAlterandoStatus(null)}
        onConfirm={confirmarAlteracaoStatus}
        title={alterandoStatus?.ativo ? 'Desativar usuário' : 'Reativar usuário'}
        description={
          alterandoStatus?.ativo
            ? `Tem certeza que deseja desativar o acesso de ${alterandoStatus?.nome}? Ele(a) não conseguirá mais entrar no sistema, mas o histórico é mantido.`
            : `Reativar o acesso de ${alterandoStatus?.nome} ao sistema?`
        }
        confirmLabel={alterandoStatus?.ativo ? 'Desativar' : 'Reativar'}
        tone={alterandoStatus?.ativo ? 'danger' : 'default'}
      />
    </div>
  )
}
