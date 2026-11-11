// ============================================================
// components/layout/BarraTopo.jsx — Faixa do topo da tela Início (sem menu lateral)
// ============================================================
// Estrela + "Boxer Operações", atalhos (Início, Telas, Bases), busca em todas as
// telas (cliente, CPF/CNPJ, NS, pedido, pedido de venda, NF) e o avatar com
// tema, trocar senha e sair. A busca só mostra telas liberadas para o usuário.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Search, X, Lock, LogOut, Sun, Moon, ShoppingCart, Plus, LayoutTemplate, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTema } from '../../context/TemaContext';
import { veTela } from '../../utils/telas';
import api, { construtorService } from '../../services/api';
import logoBoxer from '../../assets/logo-boxer.svg';

const iniciais = (n) => String(n || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();

export default function BarraTopo({ onSair, carrinho = null }) {
  const { usuario } = useAuth();
  const { tema, alternarTema } = useTema();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [aberto, setAberto] = useState(false);
  const [menu, setMenu] = useState(false);
  const [construtor, setConstrutor] = useState(false);
  useEffect(() => { construtorService.status().then(r => setConstrutor(!!r.data?.pode)).catch(() => {}); }, []);
  const caixa = useRef(null);
  const avatar = useRef(null);

  // Busca com espera curta enquanto digita
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
  // Fecha a lista / o menu ao clicar fora
  useEffect(() => {
    const f = (e) => {
      if (caixa.current && !caixa.current.contains(e.target)) setAberto(false);
      if (avatar.current && !avatar.current.contains(e.target)) setMenu(false);
    };
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, []);

  const links = [
    { to: '/inicio', label: 'Início', ok: true },
    { to: '/admin', label: 'Admin', ok: veTela(usuario, 'admin') },
    { to: '/integracoes', label: 'Integrações', ok: veTela(usuario, 'integracoes') },
  ].filter(l => l.ok);
  const abrir = (r) => { setAberto(false); setQ(''); navigate(`${r.rota}?busca=${encodeURIComponent(r.busca)}`); };

  return (
    <header className="sticky top-0 z-40 bg-[var(--c-fundo-2,var(--c-fundo))]/95 backdrop-blur border-b border-[var(--c-borda)]">
      <div className="max-w-[1500px] mx-auto px-3 sm:px-4 md:px-6 h-14 flex items-center gap-3 sm:gap-5">
        <NavLink to="/inicio" className="flex items-center gap-2.5 shrink-0">
          <img src={logoBoxer} alt="Boxer" className="w-7 h-7" />
          <span className="font-semibold text-sm text-[var(--c-texto)] hidden sm:block whitespace-nowrap">Boxer Operações</span>
        </NavLink>
        <nav className="hidden md:flex items-center gap-1">
          {[...links.map(l => ({ ...l, icon: null })),
            ...(veTela(usuario, 'telas') ? [{ to: '/telas', label: 'Criar tela', icon: Plus, chave: 'criar' }] : []),
            ...(construtor ? [{ to: '/construtor', label: 'Construtor de telas', icon: LayoutTemplate }] : []),
          ].map(l => (
            <NavLink key={l.chave || l.to} to={l.to} end={l.chave === 'criar' ? false : undefined}
              className={({ isActive }) => `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${isActive && l.chave !== 'criar' ? 'bg-[var(--c-borda)] text-[var(--c-texto)]' : 'text-[var(--c-suave)] hover:text-[var(--c-texto)]'}`}>
              {l.icon && <l.icon size={14} />}{l.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex-1" />

        {/* Busca em todas as telas */}
        <div ref={caixa} className="relative w-full max-w-[420px] min-w-0">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--c-suave)]" />
          <input value={q} onChange={e => { setQ(e.target.value); setAberto(true); }} onFocus={() => setAberto(true)}
            onKeyDown={e => { if (e.key === 'Enter' && res?.[0]) abrir(res[0]); if (e.key === 'Escape') setAberto(false); }}
            placeholder="Buscar card, cliente, NS, pedido, NF…"
            className="w-full pl-9 pr-8 py-2 rounded-full text-sm bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto)] placeholder:text-[var(--c-suave)] focus:outline-none focus:border-[var(--c-destaque)]" />
          {q && <button onClick={() => { setQ(''); setRes(null); }} aria-label="Limpar" className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={13} /></button>}
          {aberto && q.trim().length >= 2 && (
            <div className="absolute right-0 left-0 mt-2 max-h-[60vh] overflow-y-auto rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] shadow-2xl p-1.5">
              {res == null && <p className="px-3 py-3 text-xs text-[var(--c-suave)]">Procurando…</p>}
              {res && !res.length && <p className="px-3 py-3 text-xs text-[var(--c-suave)]">Nada encontrado.</p>}
              {res?.map((r, i) => (
                <button key={i} onClick={() => abrir(r)} className="w-full text-left px-3 py-2 rounded-xl hover:bg-[var(--c-borda)]">
                  <p className="text-sm text-[var(--c-texto)] truncate">{r.titulo}</p>
                  <p className="text-[11px] text-[var(--c-suave)] truncate">{r.sub}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Carrinho (colaborador) */}
        {carrinho && (
          <button onClick={carrinho.abrir} title="Carrinho" className="relative hidden md:flex p-2 rounded-xl text-[var(--c-suave)] hover:text-[var(--c-texto)] hover:bg-[var(--c-borda)]">
            <ShoppingCart size={18} />
            {carrinho.total > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-[var(--c-destaque)] rounded-full text-white text-[10px] font-bold flex items-center justify-center">{carrinho.total > 9 ? '9+' : carrinho.total}</span>}
          </button>
        )}

        {/* Avatar: tema, senha e sair */}
        <div ref={avatar} className="relative shrink-0">
          <button onClick={() => setMenu(m => !m)} title={usuario?.nome}
            className="w-9 h-9 rounded-full bg-[var(--c-destaque)] text-white text-xs font-bold flex items-center justify-center">
            {iniciais(usuario?.nome)}
          </button>
          {menu && (
            <div className="absolute right-0 mt-2 w-60 rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] shadow-2xl p-1.5">
              <div className="px-3 py-2 border-b border-[var(--c-borda)] mb-1">
                <p className="text-sm font-medium text-[var(--c-texto)] truncate">{usuario?.nome}</p>
                <p className="text-[11px] text-[var(--c-suave)] capitalize truncate">{usuario?.perfil}{usuario?.departamento_nome ? ` · ${usuario.departamento_nome}` : ''}</p>
              </div>
              {veTela(usuario, 'admin') && (
                <button onClick={() => { setMenu(false); navigate('/admin'); }} className="md:hidden w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-[var(--c-texto)] hover:bg-[var(--c-borda)]">
                  <Settings size={15} /> Admin
                </button>
              )}
              <button onClick={alternarTema} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-[var(--c-texto)] hover:bg-[var(--c-borda)]">
                {tema === 'claro' ? <Moon size={15} /> : <Sun size={15} />} {tema === 'claro' ? 'Modo escuro' : 'Modo claro'}
              </button>
              <button onClick={() => { setMenu(false); navigate('/minha-senha'); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-[var(--c-texto)] hover:bg-[var(--c-borda)]">
                <Lock size={15} /> Trocar senha
              </button>
              <button onClick={onSair} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-400 hover:bg-red-500/10">
                <LogOut size={15} /> Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
