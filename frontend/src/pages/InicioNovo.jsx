// ============================================================
// pages/InicioNovo.jsx — Tela inicial do Boxer Operações
// ============================================================
// Todo mundo vê a mesma tela: números de produtividade no topo e um bloco
// por tela. Tela não liberada para o colaborador aparece apagada, com cadeado.
// Favoritas ficam guardadas neste navegador (por usuário).
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wrench, ShoppingBag, ShieldCheck, Kanban, Boxes, ClipboardList, History, LayoutDashboard, PackageOpen, Warehouse,
  Truck, BarChart3, ShoppingCart, Puzzle, Database, Video, Plus, Lock, Star,
  ArrowRightLeft, CheckCheck, ThumbsUp, FileCheck2, Timer,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTelas } from '../utils/nomesTelas';
import { veTela } from '../utils/telas';
import api from '../services/api';
import { Search, X, LayoutTemplate, Radar, Users, Fuel, FileText, UserCog, Settings } from 'lucide-react';
import { construtorService } from '../services/api';
import { ExternalLink, Gauge, ListChecks, RefreshCcw, PackageCheck, ScanLine, Smartphone, CarFront, CalendarDays, Route, ClipboardCheck, Calculator } from 'lucide-react';
import { MODULOS, enderecoDe, abrirComLogin } from '../utils/modulos';

const ICONES_MODULO = { painel: Gauge, pedidos: ListChecks, reposicao: RefreshCcw, historico: History, separacao: ScanLine, conferencia: PackageCheck, coletor: Smartphone, frotas: CarFront, agenda: CalendarDays, viagens: Route, checklist: ClipboardCheck, custo: Calculator, operacoes: Radar, motoristas: Users, combustivel: Fuel, manutencao: Wrench, documentos: FileText, relatorios: BarChart3, usuarios: UserCog, configuracoes: Settings, motorista: Truck };
const AZUL = 'var(--c-destaque)';
// Busca de telas: ignora maiúsculas e acentos
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();


// Telas do sistema, por grupo (ordem da tela inicial). As telas criadas entram depois da Garantia.
// Admin e Integrações ficam na barra superior.
const SISTEMA = [
  { chave: 'orcamentos', grupo: 'logistica', rota: '/pedidos-orcamento', nome: 'Orçamentos', icon: Wrench, cor: '#4f46e5', conta: true },
  { chave: 'lojinha', grupo: 'logistica', rota: '/lojinha', nome: 'Lojinha Boxer', icon: ShoppingBag, cor: '#9333ea', conta: true },
  { chave: 'logistica_cif', grupo: 'logistica', rota: '/logistica-cif', nome: 'Garantia - Boxer Soldas', icon: ShieldCheck, cor: '#0284c7', conta: true },
  { quadros: true, grupo: 'logistica' },
  { chave: 'databases', grupo: 'logistica', rota: '/databases', nome: 'Databases', icon: Database, cor: '#0369a1', desc: 'Bases de registros' },
  { chave: 'armazenamento', grupo: 'logistica', rota: '/armazenamento', nome: 'Armazenamento', icon: Video, cor: '#4b5563', desc: 'Vídeos e arquivos' },
  { chave: 'relatorios', grupo: 'logistica', rota: '/relatorios', nome: 'Relatórios', icon: BarChart3, cor: '#0ea5e9', desc: 'Histórico do Pipefy' },
  { chave: 'inventario', grupo: 'almoxarifado', rota: '/inventario', nome: 'Inventário', icon: Boxes, cor: '#d97706', desc: 'Contagens de estoque' },
  { chave: 'catalogo', grupo: 'almoxarifado', rota: '/catalogo', nome: 'Catálogo / Requisição', icon: ClipboardList, cor: '#475569', desc: 'Requisição de materiais' },
  { chave: 'historico', grupo: 'almoxarifado', rota: '/historico', nome: 'Histórico', icon: History, cor: '#64748b', desc: 'Requisições feitas' },
  { chave: 'operador', grupo: 'almoxarifado', rota: '/operador', nome: 'Operador', icon: LayoutDashboard, cor: '#2563eb', desc: 'Separação das requisições' },
  { chave: 'entradas', grupo: 'almoxarifado', rota: '/entradas', nome: 'Entradas', icon: PackageOpen, cor: '#0d9488', desc: 'Notas de entrada' },
  { chave: 'estoque', grupo: 'almoxarifado', rota: '/estoque', nome: 'Estoque', icon: Warehouse, cor: '#0891b2', desc: 'Saldo de estoque' },
  { chave: 'recebimento_importacao', grupo: 'almoxarifado', rota: '/recebimento-importacao', nome: 'Recebimento / Importação', icon: Truck, cor: '#7c3aed', desc: 'Conferência de importação' },
  { chave: 'necessidade_pecas', grupo: 'almoxarifado', rota: '/necessidade-pecas', nome: 'Necessidade de Peças', icon: Puzzle, cor: '#dc2626', desc: 'Peças a comprar' },
  { chave: 'compras', grupo: 'almoxarifado', rota: '/compras', nome: 'Compras', icon: ShoppingCart, cor: '#ca8a04', desc: 'Pedidos de compra' },
  { chave: 'mrp', grupo: 'almoxarifado', rota: '/mrp', nome: 'MRP', icon: BarChart3, cor: '#be185d', desc: 'Planejamento' },
];
const GRUPOS = [
  { chave: 'logistica', nome: 'Logística / Manutenção', resumo: 'orçamentos, lojinha, garantia, notas de serviços, tratativa' },
  { chave: 'almoxarifado', nome: 'Almoxarifado', resumo: 'inventário, requisições, estoque, compras' },
];
const COR_PADRAO = '#2563eb'; // WMS / Frotas e o que vier sem cor
const CORES_QUADROS = ['#059669', '#0d9488', '#7c3aed', '#e11d48', '#2563eb', '#ca8a04', '#9333ea', '#0891b2'];

const fmt = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR'));
const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

function Variacao({ atual, antes, sufixo = '', menorMelhor = false, texto }) {
  if (atual == null || antes == null) return <p className="text-[11px] text-[var(--c-suave)] mt-0.5">&nbsp;</p>;
  const dif = atual - antes;
  if (!dif) return <p className="text-[11px] text-[var(--c-suave)] mt-0.5">igual ao anterior</p>;
  const bom = menorMelhor ? dif < 0 : dif > 0;
  return (
    <p className={`text-[11px] mt-0.5 ${bom ? 'text-emerald-400' : 'text-red-400'}`}>
      {dif > 0 ? '▲' : '▼'} {texto ? texto(Math.abs(dif)) : `${fmt(Math.abs(Math.round(dif * 10) / 10))}${sufixo}`}
    </p>
  );
}

function CardProd({ icon: Icon, titulo, valor, children }) {
  return (
    <div className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4 min-w-0">
      <div className="flex items-center gap-2 text-xs text-[var(--c-suave)]">
        <span className="w-7 h-7 rounded-lg bg-[var(--c-borda)] flex items-center justify-center shrink-0"><Icon size={15} className="text-[var(--c-texto)]" /></span>
        <span className="truncate">{titulo}</span>
      </div>
      <p className="text-2xl sm:text-3xl font-extrabold text-[var(--c-texto)] mt-2">{valor}</p>
      {children}
    </div>
  );
}

export default function InicioNovo() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const { nomes, quadros } = useTelas();
  const admin = veTela(usuario, 'telas'); // "Criar tela": quem tem a tela Telas liberada
  const [dados, setDados] = useState(null);
  // Construtor de telas (beta): o servidor diz se este usuário vê (antes de ligar, só o dono)
  const [construtor, setConstrutor] = useState(false);
  useEffect(() => { construtorService.status().then(r => setConstrutor(!!r.data?.pode)).catch(() => {}); }, []);
  const [aba, setAba] = useState('telas');
  const [buscaTela, setBuscaTela] = useState('');
  const chaveFav = `boxer_favoritas_${usuario?.id || ''}`;
  const [favoritas, setFavoritas] = useState(() => { try { return JSON.parse(localStorage.getItem(chaveFav) || '[]'); } catch { return []; } });
  function alternarFavorita(chave) {
    setFavoritas(f => {
      const n = f.includes(chave) ? f.filter(x => x !== chave) : [...f, chave];
      try { localStorage.setItem(chaveFav, JSON.stringify(n)); } catch { /* sem storage */ }
      return n;
    });
  }

  useEffect(() => {
    const ler = () => api.get('/inicio/resumo', { timeout: 30000 }).then(r => setDados(r.data)).catch(() => {});
    ler();
    const t = setInterval(() => { if (!document.hidden) ler(); }, 120000);
    return () => clearInterval(t);
  }, []);

  const blocos = useMemo(() => SISTEMA.flatMap(t => (t.quadros
    ? (quadros || []).filter(q => q.ativo !== false).map((q, i) => ({ grupo: t.grupo, chave: `quadro_${q.id}`, rota: `/quadro/${q.id}`, nome: q.nome, icon: Kanban, cor: CORES_QUADROS[i % CORES_QUADROS.length], conta: true }))
    : [{ ...t, nome: nomes?.[t.chave] || t.nome }]))
    .map(t => ({ ...t, liberada: veTela(usuario, t.chave) })),
  [quadros, nomes, usuario]);
  // Armazém (WMS) e Frotas: abrem o outro sistema em outra aba; só aparecem com endereço configurado
  const modulos = useMemo(() => MODULOS.map(m => ({
    ...m,
    itens: m.itens.filter(i => m.chave === 'frotas' || enderecoDe(i)).map(i => ({
      ...i, externo: m.chave === 'frotas' ? null : enderecoDe(i), rota: m.chave === 'frotas' ? (i.caminho === '/' ? '/frotas' : `/frotas${i.caminho}`) : undefined, icon: ICONES_MODULO[i.icone] || LayoutDashboard, liberada: veTela(usuario, m.chave),
    })),
  })).filter(m => m.itens.length), [usuario]);
  const grupos = [...GRUPOS.map(g => ({ ...g, itens: blocos.filter(b => b.grupo === g.chave) })), ...modulos];
  const todos = grupos.flatMap(g => g.itens);
  const abrir = (b) => { if (!b.liberada) return; if (b.externo) abrirComLogin(b, b.externo); else navigate(b.rota); };

  const p = dados?.produtividade || {};
  const aprovPct = p.aprovados_mes != null && (p.aprovados_mes + (p.recusados_mes || 0)) > 0
    ? Math.round((p.aprovados_mes / (p.aprovados_mes + (p.recusados_mes || 0))) * 100) : null;
  const primeiroNome = String(usuario?.nome || '').split(' ')[0];

  return (
    <div className="space-y-6 max-w-[1500px] mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--c-texto)]">
          {saudacao()}, {primeiroNome} <span className="font-normal text-[var(--c-suave)]">· produtividade de hoje</span>
        </h1>
      </div>

      {/* Produtividade */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <CardProd icon={ArrowRightLeft} titulo="Cards movidos hoje" valor={fmt(p.movidos_hoje)}>
          <Variacao atual={p.movidos_hoje} antes={p.movidos_ontem} texto={(d) => `${fmt(d)} vs ontem`} />
        </CardProd>
        <CardProd icon={CheckCheck} titulo="Concluídos na semana" valor={fmt(p.concluidos_semana)}>
          <Variacao atual={p.concluidos_semana} antes={p.concluidos_anterior} texto={(d) => `${fmt(d)} vs semana anterior`} />
        </CardProd>
        <CardProd icon={ThumbsUp} titulo="Orçamentos aprovados (mês)" valor={fmt(p.aprovados_mes)}>
          <p className="text-[11px] text-[var(--c-suave)] mt-0.5">{aprovPct != null ? `${aprovPct}% de aprovação` : '\u00a0'}</p>
        </CardProd>
        <CardProd icon={FileCheck2} titulo="Liberados p/ faturamento hoje" valor={fmt(p.faturamento_hoje)}>
          <p className="text-[11px] text-[var(--c-suave)] mt-0.5">{p.faturamento_hoje != null ? `Lojinha ${fmt(p.faturamento_lojinha)} · Orçamento ${fmt(p.faturamento_orcamento)}` : '\u00a0'}</p>
        </CardProd>
        <CardProd icon={Timer} titulo="Tempo médio até faturar" valor={p.dias_ate_faturar != null ? `${String(p.dias_ate_faturar).replace('.', ',')} d` : '—'}>
          <Variacao atual={p.dias_ate_faturar} antes={p.dias_ate_faturar_anterior} menorMelhor
            texto={(d) => `${String(Math.round(d * 10) / 10).replace('.', ',')} d vs 30 dias antes`} />
        </CardProd>
      </div>

      {/* Telas */}
      <div>
        <div className="flex items-end gap-6 border-b border-[var(--c-borda)] mb-4">
          {[['telas', 'Telas'], ['favoritas', 'Favoritas']].map(([k, t]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`pb-2.5 text-sm -mb-px border-b-2 ${aba === k ? 'border-[var(--c-texto)] text-[var(--c-texto)] font-medium' : 'border-transparent text-[var(--c-suave)] hover:text-[var(--c-texto)]'}`}>{t}</button>
          ))}
          <div className="ml-auto relative w-44 sm:w-64 -mt-1 mb-1.5">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-suave)] pointer-events-none" />
            <input value={buscaTela} onChange={e => setBuscaTela(e.target.value)} placeholder="Buscar tela…" aria-label="Buscar tela"
              className="w-full pl-8 pr-7 py-1.5 rounded-full text-sm bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto)] placeholder:text-[var(--c-suave)] focus:outline-none focus:border-[var(--c-destaque)]" />
            {buscaTela && <button onClick={() => setBuscaTela('')} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={13} /></button>}
          </div>
        </div>
        {buscaTela.trim() && !todos.some(b => semAcento(`${b.nome} ${b.desc || ''}`).includes(semAcento(buscaTela.trim()))) && !grupos.some(g => semAcento(g.nome).includes(semAcento(buscaTela.trim()))) && (
          <p className="text-sm text-[var(--c-suave)] py-8 text-center">Nenhuma tela encontrada para "{buscaTela.trim()}".</p>
        )}
        {!buscaTela.trim() && aba === 'favoritas' && !todos.some(b => favoritas.includes(b.chave)) && (
          <p className="text-sm text-[var(--c-suave)] py-8 text-center">Nenhuma favorita ainda. Clique na estrela de uma tela para fixar aqui.</p>
        )}
        <div className="space-y-6">
          {grupos.map((g, gi) => {
            const termo = semAcento(buscaTela.trim());
            const itens = (aba === 'favoritas' ? g.itens.filter(b => favoritas.includes(b.chave)) : g.itens)
              .filter(b => !termo || semAcento(`${b.nome} ${b.desc || ''} ${g.nome}`).includes(termo));
            if (!itens.length) return null;
            return (
              <section key={g.chave}>
                {grupos.length > 1 && (
                  <div className="flex items-center gap-2 mb-3 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: AZUL }} />
                    <h2 className="text-sm font-bold text-[var(--c-texto)] shrink-0">{g.nome}</h2>
                    <span className="text-xs text-[var(--c-suave)] truncate">{g.resumo}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
                  {itens.map(b => {
                    const Icon = b.icon;
                    const cor = /^#[0-9a-f]{6}$/i.test(b.cor || '') ? b.cor : COR_PADRAO;
                    const fav = favoritas.includes(b.chave);
                    const qtd = b.conta ? dados?.telas?.[b.chave] : undefined;
                    return (
                      <div key={b.chave} role="button" tabIndex={b.liberada ? 0 : -1}
                        onClick={() => abrir(b)}
                        onKeyDown={e => { if (e.key === 'Enter') abrir(b); }}
                        title={!b.liberada ? 'Você não tem acesso a esta tela' : b.externo ? `Abrir ${b.nome} (em outra aba)` : `Abrir ${b.nome}`}
                        className={`group relative h-36 rounded-2xl border p-4 flex flex-col transition-colors ${b.liberada ? 'cursor-pointer hover:brightness-110' : 'cursor-not-allowed opacity-50 grayscale'}`}
                        style={{ background: `${cor}1f`, borderColor: `${cor}40` }}>
                        <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: b.liberada ? cor : '#4b5563' }}>
                          <Icon size={20} strokeWidth={1.75} className="text-white" />
                        </span>
                        {b.liberada && (
                          <button onClick={e => { e.stopPropagation(); alternarFavorita(b.chave); }} aria-label={fav ? 'Tirar das favoritas' : 'Favoritar'}
                            className={`absolute top-3 right-3 p-1 rounded-lg ${fav ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}>
                            <Star size={16} className={fav ? 'text-amber-400 fill-amber-400' : 'text-[var(--c-suave)]'} />
                          </button>
                        )}
                        <span className="mt-auto flex items-center gap-1.5 text-sm font-semibold text-[var(--c-texto)] leading-tight">
                          <span className="line-clamp-2">{b.nome}</span>
                          {b.externo && b.liberada && <ExternalLink size={12} className="shrink-0 text-[var(--c-suave)]" />}
                        </span>
                        <span className="text-[11px] text-[var(--c-suave)] mt-1 truncate">
                          {!b.liberada ? 'Sem acesso' : b.conta ? (qtd != null ? `${fmt(qtd)} card${qtd === 1 ? '' : 's'}` : '…') : b.desc}
                        </span>
                        {!b.liberada && (
                          <span className="absolute bottom-3 right-3 w-7 h-7 rounded-full bg-[var(--c-borda)] flex items-center justify-center"><Lock size={13} className="text-[var(--c-texto)]" /></span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
