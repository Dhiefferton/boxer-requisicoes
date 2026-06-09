// ============================================================
// components/layout/AppLayout.jsx — Layout Principal
// ============================================================
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Package, ShoppingCart, ClipboardList, LogOut, Menu, X, ChevronRight, LayoutDashboard, ShieldCheck, PackagePlus, BarChart2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import CartDrawer from '../cart/CartDrawer';

export default function AppLayout({ children }) {
  const { usuario, logout } = useAuth();
  const { totalItens }      = useCart();
  const navigate            = useNavigate();
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() { logout(); navigate('/login'); }

  const navItems = [
    { to: '/catalogo',  icon: Package,        label: 'Catálogo',   perfis: ['colaborador', 'operador', 'admin'] },
    { to: '/historico', icon: ClipboardList,   label: 'Histórico',  perfis: ['colaborador', 'operador', 'admin'] },
    { to: '/operador',  icon: LayoutDashboard, label: 'Operador',   perfis: ['operador', 'admin'] },
    { to: '/entradas',  icon: PackagePlus,     label: 'Entradas',   perfis: ['operador', 'admin'] },
    { to: '/admin',     icon: ShieldCheck,     label: 'Admin',      perfis: ['admin'] },
    { to: '/mrp',       icon: BarChart2,       label: 'MRP',        perfis: ['admin'] },
  ].filter(item => item.perfis.includes(usuario?.perfil));

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col">

      {/* ── Header ──────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-[#0f1117]/95 backdrop-blur border-b border-[#2e3347]">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-[#4f6ef7] flex items-center justify-center">
              <Package size={14} className="text-white" />
            </div>
            <span className="font-semibold text-sm text-[#e8eaf0] hidden sm:block">Boxer Requisições</span>
          </div>

          {/* Nav desktop */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors
                   ${isActive ? 'bg-[#4f6ef7]/15 text-[#4f6ef7]' : 'text-[#8b91a8] hover:text-[#e8eaf0] hover:bg-[#2e3347]'}`
                }
              >
                <Icon size={16} />{label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {/* Carrinho (apenas para colaborador) */}
            {usuario?.perfil === 'colaborador' && (
              <button
                onClick={() => setCartOpen(true)}
                className="relative flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-[#8b91a8] hover:text-[#e8eaf0] hover:bg-[#2e3347] transition-colors"
              >
                <ShoppingCart size={18} />
                {totalItens > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#4f6ef7] rounded-full text-white text-[10px] font-bold flex items-center justify-center">
                    {totalItens > 9 ? '9+' : totalItens}
                  </span>
                )}
                <span className="hidden sm:block">Carrinho</span>
                {totalItens > 0 && (
                  <span className="hidden sm:block bg-[#4f6ef7] text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                    {totalItens}
                  </span>
                )}
              </button>
            )}

            {/* Usuário + logout (desktop) */}
            <div className="hidden md:flex items-center gap-2 pl-2 border-l border-[#2e3347]">
              <div className="text-right">
                <p className="text-xs font-medium text-[#e8eaf0] leading-tight">{usuario?.nome?.split(' ')[0]}</p>
                <p className="text-[10px] text-[#8b91a8] capitalize">{usuario?.perfil}</p>
              </div>
              <button onClick={handleLogout} className="p-2 rounded-xl text-[#8b91a8] hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Sair">
                <LogOut size={16} />
              </button>
            </div>

            {/* Menu mobile */}
            <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-2 rounded-xl text-[#8b91a8] hover:bg-[#2e3347] transition-colors">
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Menu mobile dropdown */}
        {menuOpen && (
          <div className="md:hidden border-t border-[#2e3347] bg-[#0f1117] px-4 py-3 flex flex-col gap-1">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-3 rounded-xl text-sm
                   ${isActive ? 'bg-[#4f6ef7]/15 text-[#4f6ef7]' : 'text-[#8b91a8]'}`
                }
              >
                <div className="flex items-center gap-2.5"><Icon size={17} />{label}</div>
                <ChevronRight size={16} className="opacity-40" />
              </NavLink>
            ))}
            <div className="mt-2 pt-2 border-t border-[#2e3347] flex items-center justify-between px-3">
              <div>
                <p className="text-sm font-medium text-[#e8eaf0]">{usuario?.nome}</p>
                <p className="text-xs text-[#8b91a8] capitalize">{usuario?.perfil} · {usuario?.departamento_nome}</p>
              </div>
              <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs text-red-400 py-1.5 px-3 rounded-xl hover:bg-red-500/10">
                <LogOut size={14} />Sair
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">{children}</main>

      {/* Nav inferior mobile */}
      <nav className="md:hidden sticky bottom-0 z-40 bg-[#0f1117]/95 backdrop-blur border-t border-[#2e3347]">
        <div className="flex items-center justify-around px-2 py-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-xs transition-colors
                 ${isActive ? 'text-[#4f6ef7]' : 'text-[#8b91a8]'}`
              }
            >
              <Icon size={20} />{label}
            </NavLink>
          ))}
          {usuario?.perfil === 'colaborador' && (
            <button
              onClick={() => setCartOpen(true)}
              className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-xs transition-colors ${totalItens > 0 ? 'text-[#4f6ef7]' : 'text-[#8b91a8]'}`}
            >
              <ShoppingCart size={20} />
              {totalItens > 0 && (
                <span className="absolute top-0.5 right-1 w-4 h-4 bg-[#4f6ef7] rounded-full text-white text-[10px] font-bold flex items-center justify-center">
                  {totalItens > 9 ? '9+' : totalItens}
                </span>
              )}
              Carrinho
            </button>
          )}
        </div>
      </nav>

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}
