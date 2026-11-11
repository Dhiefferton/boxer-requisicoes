import { Outlet } from 'react-router-dom'

/** Moldura do Frotas dentro do Operações: a barra do topo é a do Operações; as telas do Frotas abrem pelo Início. */
export function FrotasLayout() {
  return (
    <div className="frotas-escopo">
      <main className="mx-auto max-w-[1500px] px-3 py-5 sm:px-4 md:px-6">
        <Outlet />
      </main>
    </div>
  )
}
