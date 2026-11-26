// ============================================================
// components/layout/SidebarBoxer.jsx — Sidebar nova (em teste, só o dono)
// ============================================================
// Mesmo azul e mesmo estilo da sidebar do Boxer WMS: navy #00083b no tema
// claro (#161a26 no escuro), grupos que abrem e fecham, busca (Ctrl K),
// favoritas, usuário no rodapé e botão de recolher (só ícones).
// Só computador (md+); no celular continua a barra do topo + nav de baixo.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Search, Home, Star, ChevronDown, Truck, Boxes, Warehouse, CarFront, Settings, Plus, LayoutTemplate,
  Database, Sun, Moon, Lock, LogOut, PanelLeftClose, PanelLeftOpen, ShoppingCart, X, ExternalLink, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTema } from '../../context/TemaContext';
import { veTela } from '../../utils/telas';
import api, { construtorService } from '../../services/api';
import { abrirComLogin } from '../../utils/modulos';
import { useGruposMenu, semAcento } from '../../utils/menuSistema';
import logoBoxer from '../../assets/logo-boxer.svg';

const ICONE_GRUPO = { logistica: Truck, almoxarifado: Boxes, wms: Warehouse, frotas: CarFront, sistema: Settings };
export const LARGURA_SIDEBAR = { aberta: 'md:pl-60', recolhida: 'md:pl-16' };

function lerJson(chave, padrao) { try { return JSON.parse(localStorage.getItem(chave) || 'null') ?? padrao; } catch { return padrao; } }
function gravar(chave, v) { try { localStorage.setItem(chave, JSON.stringify(v)); } catch { /* sem storage */ } }

export default function SidebarBoxer({ recolhida, onRecolher, onSair, carrinho }) {
  const { usuario } = useAuth();
  const { tema, alternarTema } = useTema();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const grupos = useGruposMenu(usuario);
  const [construtor, setConstrutor] = useState(false);
  useEffect(() => { construtorService.status().then(r => setConstrutor(!!r.data?.pode)).catch(() => {}); }, []);

  // Grupo "Sistema": o que antes ficava na barra do topo
  const sistema = useMemo(() => ({
    chave: 'sistema', nome: 'Sistema',
    itens: [
      veTela(usuario, 'admin') && { chave: 'admin', rota: '/admin', nome: 'Admin', icon: ShieldCheck, liberada: true },
      veTela(usuario, 'integracoes') && { chave: 'integracoes', rota: '/integracoes', nome: 'Integrações', icon: Database, liberada: true },
      veTela(usuario, 'telas') && { chave: 'telas', rota: '/telas', nome: 'Criar tela', icon: Plus, liberada: true },
      construtor && { chave: 'construtor', rota: '/construtor', nome: 'Construtor de telas', icon: LayoutTemplate, liberada: true },
    ].filter(Boolean),
  }), [usuario, construtor]);
  // Só telas liberadas (sem cadeado na sidebar)
  const todosGrupos = useMemo(() => [...grupos, sistema]
    .map(g => ({ ...g, itens: g.itens.filter(i => i.liberada) }))
    .filter(g => g.itens.length), [grupos, sistema]);
  const todosItens = todosGrupos.flatMap(g => g.itens);

  // Favoritas: a mesma lista da tela Início (por usuário, neste navegador)
  const chaveFav = `boxer_favoritas_${usuario?.id || ''}`;
  const [favoritas, setFavoritas] = useState(() => lerJson(chaveFav, []));
  useEffect(() => {
    const ler = () => setFavoritas(lerJson(chaveFav, []));
    window.addEventListener('storage', ler);
    window.addEventListener('boxer:favoritas', ler);
    return () => { window.removeEventListener('storage', ler); window.removeEventListener('boxer:favoritas', ler); };
  }, [chaveFav]);
  function alternarFavorita(chave) {
    const n = favoritas.includes(chave) ? favoritas.filter(x => x !== chave) : [...favoritas, chave];
    setFavoritas(n); gravar(chaveFav, n); window.dispatchEvent(new Event('boxer:favoritas'));
  }
  const itensFav = todosItens.filter(i => favoritas.includes(i.chave));

  // Grupos abertos (lembrado); abre sozinho o grupo da tela atual
  const ativo = (i) => i.rota && (pathname === i.rota || pathname.startsWith(`${i.rota}/`));
  const [abertos, setAbertos] = useState(() => lerJson('boxer_sidebar_grupos', { logistica: true }));
  useEffect(() => {
    const g = todosGrupos.find(gr => gr.itens.some(ativo));
    if (g && !abertos[g.chave]) setAbertos(a => { const n = { ...a, [g.chave]: true }; gravar('boxer_sidebar_grupos', n); return n; });
  }, [pathname, todosGrupos.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const alternarGrupo = (k) => setAbertos(a => { const n = { ...a, [k]: !a[k] }; gravar('boxer_sidebar_grupos', n); return n; });

  const abrir = (i) => { if (i.externo) abrirComLogin(i, i.externo); else navigate(i.rota); };

  // Busca (Ctrl K): telas + registros (cliente, CPF/CNPJ, NS, pedido, NF), igual à barra do topo
  const [buscando, setBuscando] = useState(false);
  useEffect(() => {
    const f = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setBuscando(true); } };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);

  const fundo = tema === 'claro' ? '#00083b' : '#161a26';
  const base = `group flex items-center gap-2.5 rounded-lg text-[13.5px] transition-colors ${recolhida ? 'justify-center px-0 py-2.5' : 'px-2.5 py-2'}`;
  const corItem = (on) => (on ? 'bg-[rgba(79,110,247,0.2)] text-[#8fa3ff] font-semibold' : 'text-white/70 hover:bg-white/[0.07] hover:text-white');
  const iniciais = String(usuario?.nome || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();

  const Item = ({ i, sub }) => {
    const on = ativo(i);
    const fav = favoritas.includes(i.chave);
    return (
      <div className={`${base} ${corItem(on)} cursor-pointer ${sub && !recolhida ? '!py-1.5 text-[13px]' : ''}`}
        role="link" tabIndex={0} title={recolhida ? i.nome : undefined}
        onClick={() => abrir(i)} onKeyDown={e => { if (e.key === 'Enter') abrir(i); }}>
        {(!sub || recolhida) && i.icon && <i.icon size={recolhida ? 18 : 16} className="shrink-0" />}
        {!recolhida && <span className="truncate flex-1">{i.nome}</span>}
        {!recolhida && i.externo && <ExternalLink size={12} className="shrink-0 opacity-50" />}
        {!recolhida && !['admin', 'integracoes', 'telas', 'construtor'].includes(i.chave) && (
          <button onClick={e => { e.stopPropagation(); alternarFavorita(i.chave); }} aria-label={fav ? 'Tirar das favoritas' : 'Favoritar'}
            className={`shrink-0 ${fav ? 'opacity-100' : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'}`}>
            <Star size={13} className={fav ? 'text-amber-400 fill-amber-400' : ''} />
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <aside style={{ background: fundo }}
        className={`hidden md:flex fixed inset-y-0 left-0 z-40 flex-col text-white transition-[width] duration-200 ${recolhida ? 'w-16' : 'w-60'}`}>
        <NavLink to="/inicio" title="Ir para o início"
          className={`h-14 flex items-center gap-2.5 border-b border-white/[0.08] shrink-0 ${recolhida ? 'justify-center' : 'px-4'}`}>
          <img src={logoBoxer} alt="Boxer" className="w-8 h-8 shrink-0" />
          {!recolhida && <span className="font-semibold text-[15px] text-white truncate">Boxer Operações</span>}
        </NavLink>

        <nav className="flex-1 overflow-y-auto py-2 px-2.5 space-y-0.5 [scrollbar-width:thin]">
          <div className={`${base} ${corItem(false)} cursor-pointer`} role="button" tabIndex={0} title={recolhida ? 'Buscar (Ctrl K)' : undefined}
            onClick={() => setBuscando(true)} onKeyDown={e => { if (e.key === 'Enter') setBuscando(true); }}>
            <Search size={recolhida ? 18 : 16} className="shrink-0" />
            {!recolhida && <><span className="flex-1">Buscar</span><span className="text-[10px] opacity-60 border border-current rounded px-1">Ctrl K</span></>}
          </div>
          <NavLink to="/inicio" title={recolhida ? 'Início' : undefined} className={({ isActive }) => `${base} ${corItem(isActive)}`}>
            <Home size={recolhida ? 18 : 16} className="shrink-0" />{!recolhida && <span>Início</span>}
          </NavLink>
          {carrinho && (
            <div className={`${base} ${corItem(false)} cursor-pointer relative`} role="button" tabIndex={0} onClick={carrinho.abrir} title={recolhida ? 'Carrinho' : undefined}>
              <ShoppingCart size={recolhida ? 18 : 16} className="shrink-0" />
              {!recolhida && <span className="flex-1">Carrinho</span>}
              {carrinho.total > 0 && <span className={`bg-[#0005e1] text-white text-[10px] font-bold rounded-full px-1.5 ${recolhida ? 'absolute top-0.5 right-1.5' : ''}`}>{carrinho.total > 9 ? '9+' : carrinho.total}</span>}
            </div>
          )}

          {itensFav.length > 0 && (
            <>
              <div className="h-px bg-white/[0.08] mx-1.5 my-1.5" />
              {!recolhida && <p className="px-2.5 pt-1 pb-0.5 text-[11px] text-white/45 flex items-center gap-1.5"><Star size={11} /> Favoritas</p>}
              {itensFav.map(i => <Item key={`fav-${i.chave}`} i={i} />)}
            </>
          )}

          <div className="h-px bg-white/[0.08] mx-1.5 my-1.5" />
          {todosGrupos.map(g => {
            const Icone = ICONE_GRUPO[g.chave] || Boxes;
            const aberto = !!abertos[g.chave];
            const temAtivo = g.itens.some(ativo);
            if (recolhida) {
              return (
                <div key={g.chave} className="pt-1">
                  <div className="h-px bg-white/[0.06] mx-2 mb-1" />
                  {g.itens.map(i => <Item key={i.chave} i={i} />)}
                </div>
              );
            }
            return (
              <div key={g.chave}>
                <div role="button" tabIndex={0} onClick={() => alternarGrupo(g.chave)} onKeyDown={e => { if (e.key === 'Enter') alternarGrupo(g.chave); }}
                  className={`${base} cursor-pointer ${temAtivo && !aberto ? 'text-[#8fa3ff]' : 'text-white/70 hover:bg-white/[0.07] hover:text-white'}`}>
                  <Icone size={16} className="shrink-0" />
                  <span className="flex-1 truncate">{g.nome}</span>
                  <ChevronDown size={14} className="shrink-0 opacity-60 transition-transform" style={{ transform: aberto ? 'none' : 'rotate(-90deg)' }} />
                </div>
                {aberto && (
                  <div className="ml-[19px] pl-2 border-l border-white/[0.09] space-y-0.5 mb-1">
                    {g.itens.map(i => <Item key={i.chave} i={i} sub />)}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/[0.08] px-3 py-3 shrink-0">
          {!recolhida && (
            <div className="flex items-center gap-2.5 mb-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#0005e1] text-white text-xs font-bold flex items-center justify-center shrink-0">{iniciais}</div>
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-white truncate">{usuario?.nome}</p>
                <p className="text-xs text-white/50 capitalize truncate">{usuario?.perfil}{usuario?.departamento_nome ? ` · ${usuario.departamento_nome}` : ''}</p>
              </div>
            </div>
          )}
          <div className={`flex items-center ${recolhida ? 'flex-col gap-1' : 'gap-1'}`}>
            {[
              { t: tema === 'claro' ? 'Modo escuro' : 'Modo claro', I: tema === 'claro' ? Moon : Sun, f: alternarTema },
              { t: 'Trocar senha', I: Lock, f: () => navigate('/minha-senha') },
              { t: 'Sair', I: LogOut, f: onSair },
            ].map(b => (
              <button key={b.t} onClick={b.f} title={b.t} aria-label={b.t} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.07]"><b.I size={16} /></button>
            ))}
            <button onClick={onRecolher} title={recolhida ? 'Abrir menu' : 'Recolher menu'} aria-label={recolhida ? 'Abrir menu' : 'Recolher menu'}
              className={`p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.07] ${recolhida ? '' : 'ml-auto'}`}>
              {recolhida ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>
        </div>
      </aside>

      {buscando && <BuscaSidebar itens={todosItens} usuario={usuario} onAbrirTela={(i) => { setBuscando(false); abrir(i); }} onFechar={() => setBuscando(false)} />}
    </>
  );
}

function BuscaSidebar({ itens, usuario, onAbrirTela, onFechar }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    const f = (e) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onFechar]);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setRes(null); return undefined; }
    let vivo = true;
    const id = setTimeout(() => {
      api.get('/inicio/busca', { params: { q: t }, timeout: 20000 })
        .then(r => { if (vivo) setRes((r.data.resultados || []).filter(x => veTela(usuario, x.tela))); })
        .catch(() => { if (vivo) setRes([]); });
    }, 300);
    return () => { vivo = false; clearTimeout(id); };
  }, [q, usuario]);
  const termo = semAcento(q.trim());
  const telas = termo ? itens.filter(i => semAcento(i.nome).includes(termo)).slice(0, 6) : itens.slice(0, 6);
  const abrirRegistro = (r) => { onFechar(); navigate(`${r.rota}?busca=${encodeURIComponent(r.busca)}`); };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-[12vh] px-4" onMouseDown={onFechar}>
      <div className="w-full max-w-xl rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] shadow-2xl overflow-hidden" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 border-b border-[var(--c-borda)]">
          <Search size={16} className="text-[var(--c-suave)]" />
          <input ref={ref} value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { if (telas[0] && (!res || !res.length)) onAbrirTela(telas[0]); else if (res?.[0]) abrirRegistro(res[0]); } }}
            placeholder="Buscar tela, card, cliente, NS, pedido, NF…"
            className="flex-1 py-3.5 bg-transparent text-sm text-[var(--c-texto)] placeholder:text-[var(--c-suave)] focus:outline-none" />
          <button onClick={onFechar} aria-label="Fechar" className="p-1 text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={15} /></button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-1.5">
          {telas.length > 0 && <p className="px-3 pt-2 pb-1 text-[11px] text-[var(--c-suave)]">Telas</p>}
          {telas.map(i => (
            <button key={i.chave} onClick={() => onAbrirTela(i)} className="w-full flex items-center gap-2.5 text-left px-3 py-2 rounded-xl hover:bg-[var(--c-borda)]">
              {i.icon && <i.icon size={15} className="text-[var(--c-suave)] shrink-0" />}
              <span className="text-sm text-[var(--c-texto)] truncate">{i.nome}</span>
            </button>
          ))}
          {q.trim().length >= 2 && (
            <>
              <p className="px-3 pt-2 pb-1 text-[11px] text-[var(--c-suave)]">Registros</p>
              {res == null && <p className="px-3 py-2 text-xs text-[var(--c-suave)]">Procurando…</p>}
              {res && !res.length && <p className="px-3 py-2 text-xs text-[var(--c-suave)]">Nada encontrado.</p>}
              {res?.map((r, i) => (
                <button key={i} onClick={() => abrirRegistro(r)} className="w-full text-left px-3 py-2 rounded-xl hover:bg-[var(--c-borda)]">
                  <p className="text-sm text-[var(--c-texto)] truncate">{r.titulo}</p>
                  <p className="text-[11px] text-[var(--c-suave)] truncate">{r.sub}</p>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
