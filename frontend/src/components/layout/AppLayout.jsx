// ============================================================
// components/layout/AppLayout.jsx — Layout Principal
// ============================================================
import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Package, ShoppingCart, ClipboardList, LogOut, Menu, X, ChevronRight, MoreHorizontal, LayoutDashboard, ShieldCheck, PackagePlus, BarChart2, FileText, Lock, ClipboardCheck, PanelLeftClose, PanelLeftOpen, Store, Camera, Boxes, Truck, Database, HardDrive, LayoutGrid, Kanban, ShieldPlus, Home } from 'lucide-react';
import { useTelas } from '../../utils/nomesTelas';
import { blobService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import CartDrawer from '../cart/CartDrawer';
import { veTela, nivelTela, telaDaRota } from '../../utils/telas';
import { useLocation } from 'react-router-dom';
import BotaoTema from '../ui/BotaoTema';
import logoBoxer from '../../assets/logo-boxer.svg';
import BarraTopo from './BarraTopo';

// Sem barra lateral em nenhuma tela: a navegação é pela faixa do topo (BarraTopo) e pela tela Início
export default function AppLayout({ children }) {
  const semMenu = true;
  const { usuario, logout } = useAuth();
  const { totalItens }      = useCart();
  const navigate            = useNavigate();
  const [cartOpen, setCartOpen] = useState(false);
  // Aviso: armazenamento de vídeos (Vercel Blob) a partir de 90% da cota grátis
  const [alertaBlob, setAlertaBlob] = useState(null);
  const veArmazenamento = veTela(usuario, 'armazenamento');
  useEffect(() => {
    if (!veArmazenamento) return undefined;
    const ler = () => blobService.alerta().then(r => setAlertaBlob(r.data?.alerta ? r.data : null)).catch(() => {});
    ler();
    const t = setInterval(ler, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [veArmazenamento]);
  const [menuOpen, setMenuOpen] = useState(false);
  // Sidebar recolhida (só ícones) — lembrada neste navegador
  const [recolhida, setRecolhida] = useState(() => { try { return localStorage.getItem('boxer_sidebar') === '1'; } catch { return false; } });
  function alternarSidebar() {
    setRecolhida(v => { try { localStorage.setItem('boxer_sidebar', v ? '0' : '1'); } catch { /* ignora */ } return !v; });
  }

  function handleLogout() { logout(); navigate('/login'); }

  // Menu: telas liberadas pelo perfil e pelas telas escolhidas no cadastro do colaborador
  const { nomes: nomesTelas, quadros } = useTelas();
  const navItems = [
    { to: '/inicio',    icon: Home,          label: 'Início',     tela: 'inicio' },
    { to: '/catalogo',  icon: Package,        label: 'Catálogo',   tela: 'catalogo' },
    { to: '/historico', icon: ClipboardList,   label: 'Histórico',  tela: 'historico' },
    { to: '/operador',  icon: LayoutDashboard, label: 'Operador',   tela: 'operador' },
    { to: '/inventario', icon: ClipboardCheck, label: 'Inventário', tela: 'inventario' },
    { to: '/entradas',  icon: PackagePlus,     label: 'Entradas',   tela: 'entradas' },
    { to: '/estoque',   icon: Boxes,           label: 'Estoque',    tela: 'estoque' },
    { to: '/admin',     icon: ShieldCheck,     label: 'Admin',      tela: 'admin' },
    { to: '/mrp',       icon: BarChart2,       label: 'MRP',        tela: 'mrp' },
    { to: '/compras',   icon: FileText,        label: 'Compras',    tela: 'compras' },
    { to: '/necessidade-pecas', icon: Package, label: 'Nec. Peças', tela: 'necessidade_pecas' },
    { to: '/recebimento-importacao', icon: Camera, label: 'Recebimento/Importação', tela: 'recebimento_importacao' },
    { to: '/integracoes', icon: Database, label: 'Integrações (API)', tela: 'integracoes' },
    { to: '/relatorios', icon: BarChart2, label: 'Relatórios', tela: 'relatorios' },
    { to: '/lojinha', icon: Store, label: 'Lojinha Boxer', tela: 'lojinha' },
    { to: '/logistica-cif', icon: ShieldPlus, label: 'Garantia - Boxer Soldas', tela: 'logistica_cif' },
    { to: '/databases', icon: Database, label: 'Databases', tela: 'databases' },
    { to: '/armazenamento', icon: HardDrive, label: 'Armazenamento', tela: 'armazenamento' },
    { to: '/pedidos-orcamento', icon: FileText, label: 'Orçamentos', tela: 'orcamentos' },
    // Telas criadas pelo admin (quadros de cards)
    ...quadros.filter(q => q.ativo !== false).map(q => ({ to: `/quadro/${q.id}`, icon: Kanban, label: q.nome, tela: `quadro_${q.id}` })),
  ].filter(item => item.tela === 'inicio' || veTela(usuario, item.tela))
    .map(item => ({ ...item, label: nomesTelas[item.tela] || item.label }));
  // Criar e renomear telas: só o admin
  if (usuario?.perfil === 'admin') navItems.push({ to: '/telas', icon: LayoutGrid, label: 'Telas', tela: 'telas' });
  // Tela aberta com "Só ver": aviso no topo (o servidor bloqueia salvar/mover/criar/excluir)
  const { pathname } = useLocation();
  const telaAtual = telaDaRota(pathname);
  const soVer = telaAtual && nivelTela(usuario, telaAtual) === 'ver';

  // Nav inferior (celular): até 5 atalhos; com mais telas, 4 atalhos + "Mais" (abre o menu)
  const temCarrinho = usuario?.perfil === 'colaborador';
  const limiteNav = temCarrinho ? 4 : 5;
  // Telas de uso diário primeiro na barra de baixo (o resto fica em "Mais")
  const PRIORIDADE = ['/inicio', '/operador', '/inventario', '/pedidos-orcamento', '/compras', '/necessidade-pecas', '/catalogo', '/historico'];
  const ordemNav = (to) => { const i = PRIORIDADE.indexOf(to); return i === -1 ? 99 : i; };
  const navInferior = navItems.length > limiteNav
    ? [...navItems].sort((a, b) => ordemNav(a.to) - ordemNav(b.to)).slice(0, limiteNav - 1)
    : navItems;
  const temMais = navItems.length > limiteNav;

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[var(--c-fundo)] flex flex-col overflow-x-clip">

      {/* ── Sidebar (computador) ────────────────────────────── */}
      <aside className={`${semMenu ? 'hidden' : 'hidden md:flex'} fixed inset-y-0 left-0 z-40 flex-col bg-[var(--c-fundo-2)] border-r border-[var(--c-borda)] transition-[width] duration-200 ${recolhida ? 'w-16' : 'w-56'}`}>
        <div className={`h-14 flex items-center gap-2.5 border-b border-[var(--c-borda)] ${recolhida ? 'justify-center px-0' : 'px-4'}`}>
          <img src={logoBoxer} alt="Boxer" className="w-8 h-8 shrink-0" />
          {!recolhida && <span className="font-semibold text-sm text-[var(--c-texto)] truncate">Boxer Operações</span>}
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} title={recolhida ? label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl text-sm transition-colors ${recolhida ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'}
                 ${isActive ? 'bg-[var(--c-destaque)]/15 text-[var(--c-destaque)] font-medium' : 'text-[var(--c-suave)] hover:text-[var(--c-texto)] hover:bg-[var(--c-borda)]'}`
              }
            >
              <Icon size={18} className="shrink-0" />{!recolhida && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
          {usuario?.perfil === 'colaborador' && (
            <button onClick={() => setCartOpen(true)} title={recolhida ? 'Carrinho' : undefined}
              className={`relative w-full flex items-center gap-3 rounded-xl text-sm text-[var(--c-suave)] hover:text-[var(--c-texto)] hover:bg-[var(--c-borda)] ${recolhida ? 'justify-center py-2.5' : 'px-3 py-2.5'}`}>
              <ShoppingCart size={18} className="shrink-0" />
              {!recolhida && <span className="flex-1 text-left">Carrinho</span>}
              {totalItens > 0 && (
                <span className={`bg-[var(--c-destaque)] text-white text-[10px] font-bold rounded-full flex items-center justify-center ${recolhida ? 'absolute top-1 right-2 w-4 h-4' : 'px-1.5 py-0.5'}`}>
                  {totalItens > 9 && recolhida ? '9+' : totalItens}
                </span>
              )}
            </button>
          )}
        </nav>
        <div className="border-t border-[var(--c-borda)] p-2 space-y-1">
          {!recolhida && (
            <div className="px-2 py-1.5 min-w-0">
              <p className="text-sm font-medium text-[var(--c-texto)] truncate">{usuario?.nome}</p>
              <p className="text-[11px] text-[var(--c-suave)] capitalize truncate">{usuario?.perfil}{usuario?.departamento_nome ? ` · ${usuario.departamento_nome}` : ''}</p>
            </div>
          )}
          <div className={`flex items-center ${recolhida ? 'flex-col gap-1' : 'gap-1'}`}>
            <BotaoTema />
            <button onClick={() => navigate('/minha-senha')} className="p-2 rounded-xl text-[var(--c-suave)] hover:text-[var(--c-texto)] hover:bg-[var(--c-borda)] transition-colors" title="Trocar senha">
              <Lock size={16} />
            </button>
            <button onClick={handleLogout} className="p-2 rounded-xl text-[var(--c-suave)] hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Sair">
              <LogOut size={16} />
            </button>
            <button onClick={alternarSidebar} className={`p-2 rounded-xl text-[var(--c-suave)] hover:text-[var(--c-texto)] hover:bg-[var(--c-borda)] ${recolhida ? '' : 'ml-auto'}`}
              title={recolhida ? 'Abrir menu' : 'Recolher menu'}>
              {recolhida ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>
        </div>
      </aside>

      <div className={`flex-1 flex flex-col min-w-0 ${semMenu ? '' : recolhida ? 'md:pl-16' : 'md:pl-56'}`}>

      {/* ── Header (celular) ────────────────────────────────── */}
      {semMenu && <BarraTopo onSair={handleLogout} carrinho={usuario?.perfil === 'colaborador' ? { total: totalItens, abrir: () => setCartOpen(true) } : null} />}
      {!semMenu && <header className={`md:hidden sticky top-0 z-40 bg-[var(--c-fundo)]/95 backdrop-blur border-b border-[var(--c-borda)]`}>
        <div className="w-full px-3 sm:px-4 md:px-6 h-14 flex items-center justify-between gap-3">

          <div className="flex items-center gap-2.5 shrink-0">
            <img src={logoBoxer} alt="Boxer" className="w-7 h-7" />
            <span className="font-semibold text-sm text-[var(--c-texto)] hidden sm:block">Boxer Operações</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Carrinho (apenas para colaborador) */}
            {usuario?.perfil === 'colaborador' && (
              <button
                onClick={() => setCartOpen(true)}
                className="relative flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-[var(--c-suave)] hover:text-[var(--c-texto)] hover:bg-[var(--c-borda)] transition-colors"
              >
                <ShoppingCart size={18} />
                {totalItens > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[var(--c-destaque)] rounded-full text-white text-[10px] font-bold flex items-center justify-center">
                    {totalItens > 9 ? '9+' : totalItens}
                  </span>
                )}
                <span className="hidden sm:block">Carrinho</span>
                {totalItens > 0 && (
                  <span className="hidden sm:block bg-[var(--c-destaque)] text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                    {totalItens}
                  </span>
                )}
              </button>
            )}

            {/* Menu mobile */}
            <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-2 rounded-xl text-[var(--c-suave)] hover:bg-[var(--c-borda)] transition-colors">
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Menu mobile dropdown */}
        {menuOpen && (
          <div className="md:hidden border-t border-[var(--c-borda)] bg-[var(--c-fundo)] px-4 py-3 flex flex-col gap-1 max-h-[calc(100dvh-3.5rem)] overflow-y-auto">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-3 rounded-xl text-sm
                   ${isActive ? 'bg-[var(--c-destaque)]/15 text-[var(--c-destaque)]' : 'text-[var(--c-suave)]'}`
                }
              >
                <div className="flex items-center gap-2.5"><Icon size={17} />{label}</div>
                <ChevronRight size={16} className="opacity-40" />
              </NavLink>
            ))}
            <div className="mt-2 pt-2 border-t border-[var(--c-borda)] flex items-center justify-between gap-2 px-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--c-texto)] truncate">{usuario?.nome}</p>
                <p className="text-xs text-[var(--c-suave)] capitalize truncate">{usuario?.perfil} · {usuario?.departamento_nome}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <BotaoTema />
                <button onClick={() => { setMenuOpen(false); navigate('/minha-senha'); }} className="p-2 rounded-xl text-[var(--c-suave)] hover:bg-[var(--c-borda)]" title="Trocar senha">
                  <Lock size={16} />
                </button>
                <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs text-red-400 py-1.5 px-3 rounded-xl hover:bg-red-500/10">
                  <LogOut size={14} />Sair
                </button>
              </div>
            </div>
          </div>
        )}
      </header>}

      <main className="flex-1 w-full min-w-0 px-3 sm:px-4 md:px-6 py-4 sm:py-6">
        {alertaBlob && (
          <NavLink to="/armazenamento" className="block mb-3 text-xs rounded-xl px-3 py-2 border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/15">
            Atenção: o armazenamento de vídeos está em <b>{alertaBlob.pct}%</b> da cota grátis ({alertaBlob.item}). Ao passar de 100% a Vercel bloqueia os vídeos por 30 dias — clique para ver e liberar espaço.
          </NavLink>
        )}
        {soVer && <p className="mb-3 text-xs rounded-xl px-3 py-2 border border-amber-500/30 bg-amber-500/10 text-amber-400">Você só pode visualizar esta tela. Para alterar algo, peça a liberação ao administrador.</p>}
        {children}
      </main>

      {/* Nav inferior mobile */}
      <nav className="md:hidden sticky bottom-0 z-40 bg-[var(--c-fundo)]/95 backdrop-blur border-t border-[var(--c-borda)] pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch px-1 py-1.5">
          {navInferior.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex-1 min-w-0 flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-xl text-[11px] transition-colors
                 ${isActive ? 'text-[var(--c-destaque)]' : 'text-[var(--c-suave)]'}`
              }
            >
              <Icon size={20} className="shrink-0" /><span className="w-full truncate text-center">{label}</span>
            </NavLink>
          ))}
          {temCarrinho && (
            <button
              onClick={() => setCartOpen(true)}
              className={`relative flex-1 min-w-0 flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-xl text-[11px] transition-colors ${totalItens > 0 ? 'text-[var(--c-destaque)]' : 'text-[var(--c-suave)]'}`}
            >
              <ShoppingCart size={20} className="shrink-0" />
              {totalItens > 0 && (
                <span className="absolute top-0.5 left-1/2 ml-1.5 w-4 h-4 bg-[var(--c-destaque)] rounded-full text-white text-[10px] font-bold flex items-center justify-center">
                  {totalItens > 9 ? '9+' : totalItens}
                </span>
              )}
              <span className="w-full truncate text-center">Carrinho</span>
            </button>
          )}
          {temMais && (
            <button
              onClick={() => navigate('/inicio')}
              className={`flex-1 min-w-0 flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-xl text-[11px] transition-colors ${menuOpen ? 'text-[var(--c-destaque)]' : 'text-[var(--c-suave)]'}`}
            >
              <MoreHorizontal size={20} className="shrink-0" /><span className="w-full truncate text-center">Mais</span>
            </button>
          )}
        </div>
      </nav>

      </div>

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}
