import { useState, type FormEvent } from 'react'
import { Lock } from 'lucide-react'
import { Modal } from './Modal'
import { useToast } from './Toast'
import { atualizarSenhaPropria } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

export function TrocarSenhaModal({
  open,
  onClose,
  obrigatorio = false,
}: {
  open: boolean
  onClose: () => void
  /** Primeiro acesso: sem botão de cancelar/fechar, só some depois de salvar a nova senha. */
  obrigatorio?: boolean
}) {
  const { show } = useToast()
  const { refreshPerfil } = useAuth()
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function fechar() {
    setNovaSenha('')
    setConfirmarSenha('')
    setErro(null)
    onClose()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (novaSenha.length < 6) {
      setErro('A senha precisa ter pelo menos 6 caracteres.')
      return
    }
    if (novaSenha !== confirmarSenha) {
      setErro('As senhas não coincidem.')
      return
    }
    setSalvando(true)
    try {
      await atualizarSenhaPropria(novaSenha)
      await refreshPerfil()
      show('Senha alterada com sucesso.', 'success')
      fechar()
    } catch {
      setErro('Não foi possível trocar a senha. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal open={open} onClose={fechar} title="Trocar senha" size="sm" hideClose={obrigatorio}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {obrigatorio && (
          <p className="rounded-xl bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
            Por segurança, defina uma nova senha antes de continuar.
          </p>
        )}
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Nova senha</span>
          <input
            type="password"
            autoFocus
            required
            autoComplete="new-password"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-navy-950 px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            placeholder="••••••••"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Confirmar nova senha</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirmarSenha}
            onChange={(e) => setConfirmarSenha(e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-navy-950 px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            placeholder="••••••••"
          />
        </label>

        {erro && <p className="text-sm font-medium text-red-600 dark:text-red-400">{erro}</p>}

        <div className="flex justify-end gap-2 pt-1">
          {!obrigatorio && (
            <button
              type="button"
              onClick={fechar}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={salvando}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Lock size={15} />
            {salvando ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
