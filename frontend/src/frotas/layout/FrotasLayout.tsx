import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { navItemsParaPerfil } from '../lib/nav'

/** Moldura do Frotas dentro do Operações: a barra do topo é a do Operações; aqui só a faixa de telas do Frotas. */
export function FrotasLayout() {
  const { perfil } = useAuth()
  const itens = perfil && perfil.perfil !== 'motorista' ? navItemsParaPerfil(perfil.perfil, perfil.email) : []
  return (
    <div className="frotas-escopo">
      <div className="sticky top-14 z-30 border-b border-[var(--c-borda)] bg-[var(--c-fundo-2,var(--c-fundo))]/95 backdrop-blur">
        <nav className="mx-auto flex max-w-[1500px] items-center gap-1 overflow-x-auto px-3 py-2 sm:px-4 md:px-6 scrollbar-none">
          <span className="mr-2 shrink-0 text-xs font-bold uppercase tracking-wide text-[var(--c-suave)]">Frotas</span>
          {itens.map((i) => (
            <NavLink key={i.path} to={i.path === '/' ? '/frotas' : `/frotas${i.path}`} end={i.path === '/'}
              className={({ isActive }) => `inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors ${isActive ? 'bg-[var(--c-borda)] text-[var(--c-texto)]' : 'text-[var(--c-suave)] hover:text-[var(--c-texto)]'}`}>
              <i.icon size={14} />{i.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <main className="mx-auto max-w-[1500px] px-3 py-5 sm:px-4 md:px-6">
        <Outlet />
      </main>
    </div>
  )
}
