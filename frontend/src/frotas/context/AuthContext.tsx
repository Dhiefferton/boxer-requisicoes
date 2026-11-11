import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, getMeuPerfil, SUPABASE_CONFIGURADO } from '../lib/supabaseClient'
import { useAuth as useAuthOperacoes } from '../../context/AuthContext'
import api from '../../services/api'
import type { Usuario } from '../types'

interface AuthContextValue {
  session: Session | null
  user: User | null
  perfil: Usuario | null
  loading: boolean
  /** true enquanto o perfil (usuarios_perfil) do usuário logado ainda está sendo buscado. */
  perfilLoading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  /** Rebusca o perfil do usuário logado (ex.: depois de trocar a senha). */
  refreshPerfil: () => Promise<void>
  /** Motivo de não ter conseguido entrar no Frotas com o login do Operações. */
  erroSso: string | null
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Usuario | null>(null)
  const [perfilLoading, setPerfilLoading] = useState(true)
  const [loading, setLoading] = useState(true)

  const { usuario } = useAuthOperacoes()
  const [erroSso, setErroSso] = useState<string | null>(null)
  const emailOperacoes = String(usuario?.email || '').trim().toLowerCase()

  // Login único: usa a sessão do Boxer Operações para abrir a sessão do Frotas (mesmo e-mail)
  useEffect(() => {
    let cancelado = false
    if (!SUPABASE_CONFIGURADO) {
      setErroSso('O Frotas ainda não está configurado neste sistema (faltam VITE_FROTAS_SUPABASE_URL / VITE_FROTAS_SUPABASE_ANON_KEY).')
      setLoading(false)
      return
    }
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        // e-mail que a pessoa usa no Frotas (pode ser diferente do e-mail do Operações)
        const emailSalvo = localStorage.getItem('frotas_email_' + emailOperacoes)
        if (data.session?.user?.email && data.session.user.email.toLowerCase() === (emailSalvo || emailOperacoes)) {
          if (!cancelado) { setSession(data.session); setErroSso(null) }
          return
        }
        const r = await api.post('/sso/codigo', { destino: 'frotas' }, { timeout: 20000 })
        if (r.data?.token_hash) {
          const { data: v, error } = await supabase.auth.verifyOtp({ token_hash: r.data.token_hash, type: 'magiclink' })
          if (error || !v.session) throw new Error('O Frotas não aceitou o login. Tente de novo.')
          try { localStorage.setItem('frotas_email_' + emailOperacoes, String(r.data?.email || emailOperacoes).toLowerCase()) } catch { /* sem armazenamento */ }
          if (!cancelado) { setSession(v.session); setErroSso(null) }
        } else if (!cancelado) {
          setSession(null)
          setErroSso(r.data?.motivo || 'Não consegui abrir o Frotas com o seu login.')
        }
      } catch (e) {
        if (!cancelado) { setSession(null); setErroSso((e as Error).message || 'Não consegui abrir o Frotas com o seu login.') }
      } finally {
        if (!cancelado) setLoading(false)
      }
    })()
    const { data: listener } = supabase.auth.onAuthStateChange((_event, novaSessao) => {
      if (!cancelado && novaSessao) setSession(novaSessao)
    })
    return () => { cancelado = true; listener.subscription.unsubscribe() }
  }, [emailOperacoes])

  useEffect(() => {
    if (!session?.user) {
      setPerfil(null)
      setPerfilLoading(false)
      return
    }
    let cancelado = false
    setPerfilLoading(true)
    getMeuPerfil(session.user.id)
      .then((p) => {
        if (!cancelado) setPerfil(p ? { ...p, precisaTrocarSenha: false } : p)
      })
      .catch(() => {
        if (!cancelado) setPerfil(null)
      })
      .finally(() => {
        if (!cancelado) setPerfilLoading(false)
      })
    return () => {
      cancelado = true
    }
  }, [session?.user?.id])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function refreshPerfil() {
    if (!session?.user) return
    try {
      const p = await getMeuPerfil(session.user.id)
      setPerfil(p)
    } catch {
      // mantém o perfil atual em memória se a rebusca falhar
    }
  }

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, perfil, loading, perfilLoading, signIn, signOut, refreshPerfil, erroSso }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa ser usado dentro de <AuthProvider>')
  return ctx
}
