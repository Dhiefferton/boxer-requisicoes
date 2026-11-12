import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { rotaPermitida, primeiraRotaPermitida } from '../lib/nav'

const Centro = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-[60vh] items-center justify-center px-4">{children}</div>
)

/** Porta do Frotas dentro do Boxer Operações: o login é o do Operações (login único). */
export function RequireAuth() {
  const { session, loading, perfil, perfilLoading, erroSso } = useAuth()
  const location = useLocation()
  const caminho = location.pathname.replace(/^\/frotas/, '') || '/'

  if (loading || (session && perfilLoading)) {
    return <Centro><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" /></Centro>
  }
  if (!session) {
    return <Centro><p className="max-w-md rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-5 text-sm text-[var(--c-texto)]">{erroSso || 'Não consegui abrir o Frotas com o seu login.'}</p></Centro>
  }
  if (!perfil) {
    return <Centro><p className="max-w-md rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-5 text-sm text-[var(--c-texto)]">{erroSso || 'Seu usuário não tem perfil no Frotas.'}</p></Centro>
  }
  // Motorista só usa a tela dele (Minha viagem); qualquer outra tela do Frotas leva para ela.
  if (perfil.perfil === 'motorista') {
    return caminho === '/motorista' ? <Outlet /> : <Navigate to="/frotas/motorista" replace />
  }
  if (!rotaPermitida(perfil.perfil, caminho, perfil.email)) {
    return <Navigate to={`/frotas${primeiraRotaPermitida(perfil.perfil, perfil.email) === '/' ? '' : primeiraRotaPermitida(perfil.perfil, perfil.email)}`} replace />
  }
  return <Outlet />
}
