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
  Truck, BarChart3, ShoppingCart, Puzzle, Database, Video, Settings, Plus, Lock, Star,
  ArrowRightLeft, CheckCheck, ThumbsUp, FileCheck2, Timer,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTelas } from '../utils/nomesTelas';
import { veTela } from '../utils/telas';
import api from '../services/api';
import { LayoutTemplate } from 'lucide-react';
import { construtorService } from '../services/api';
import { ExternalLink, Gauge, ListChecks, RefreshCcw, PackageCheck, ScanLine, Smartphone, CarFront, CalendarDays, Route, ClipboardCheck, Calculator } from 'lucide-react';
import { MODULOS, enderecoDe } from '../utils/modulos';

const ICONES_MODULO = { painel: Gauge, pedidos: ListChecks, reposicao: RefreshCcw, historico: History, separacao: ScanLine, conferencia: PackageCheck, coletor: Smartphone, frotas: CarFront, agenda: CalendarDays, viagens: Route, checklist: ClipboardCheck, custo: Calculator };
const AZUL = 'var(--c-destaque)';

// Telas do sistema (ordem da tela inicial). As telas criadas entram depois da Garantia.
const SISTEMA = [
  { chave: 'orcamentos', rota: '/pedidos-orcamento', nome: 'Orçamentos', icon: Wrench, cor: '#4f46e5', conta: true },
  { chave: 'lojinha', rota: '/lojinha', nome: 'Lojinha Boxer', icon: ShoppingBag, cor: '#9333ea', conta: true },
  { chave: 'logistica_cif', rota: '/logistica-cif', nome: 'Garantia - Boxer Soldas', icon: ShieldCheck, cor: '#0284c7', conta: true },
  { quadros: true },
  { chave: 'inventario', rota: '/inventario', nome: 'Inventário', icon: Boxes, cor: '#d97706', desc: 'Contagens de estoque' },
  { chave: 'catalogo', rota: '/catalogo', nome: 'Catálogo / Requisição', icon: ClipboardList, cor: '#475569', desc: 'Requisição de materiais' },
  { chave: 'historico', rota: '/historico', nome: 'Histórico', icon: History, cor: '#64748b', desc: 'Requisições feitas' },
  { chave: 'operador', rota: '/operador', nome: 'Operador', icon: LayoutDashboard, cor: '#2563eb', desc: 'Separação das requisições' },
  { chave: 'entradas', rota: '/entradas', nome: 'Entradas', icon: PackageOpen, cor: '#0d9488', desc: 'Notas de entrada' },
  { chave: 'estoque', rota: '/estoque', nome: 'Estoque', icon: Warehouse, cor: '#0891b2', desc: 'Saldo de estoque' },
  { chave: 'recebimento_importacao', rota: '/recebimento-importacao', nome: 'Recebimento / Importação', icon: Truck, cor: '#7c3aed', desc: 'Conferência de importação' },
  { chave: 'relatorios', rota: '/relatorios', nome: 'Relatórios', icon: BarChart3, cor: '#0ea5e9', desc: 'Histórico do Pipefy' },
  { chave: 'mrp', rota: '/mrp', nome: 'MRP', icon: BarChart3, cor: '#be185d', desc: 'Planejamento' },
  { chave: 'compras', rota: '/compras', nome: 'Compras', icon: ShoppingCart, cor: '#ca8a04', desc: 'Pedidos de compra' },
  { chave: 'necessidade_pecas', rota: '/necessidade-pecas', nome: 'Necessidade de Peças', icon: Puzzle, cor: '#dc2626', desc: 'Peças a comprar' },
  { chave: 'databases', rota: '/databases', nome: 'Databases', icon: Database, cor: '#0369a1', desc: 'Bases de registros' },
  { chave: 'armazenamento', rota: '/armazenamento', nome: 'Armazenamento', icon: Video, cor: '#4b5563', desc: 'Vídeos e arquivos' },
  { chave: 'integracoes', rota: '/integracoes', nome: 'Integrações (API)', icon: Puzzle, cor: '#0f766e', desc: 'Chaves para outros sistemas' },
  { chave: 'admin', rota: '/admin', nome: 'Admin', icon: Settings, cor: '#334155', desc: 'Usuários e permissões' },
];
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
    ? (quadros || []).filter(q => q.ativo !== false).map((q, i) => ({ chave: `quadro_${q.id}`, rota: `/quadro/${q.id}`, nome: q.nome, icon: Kanban, cor: CORES_QUADROS[i % CORES_QUADROS.length], conta: true }))
    : [{ ...t, nome: nomes?.[t.chave] || t.nome }]))
    .map(t => ({ ...t, liberada: veTela(usuario, t.chave) })),
  [quadros, nomes, usuario]);
  // Armazém (WMS) e Frotas: abrem o outro sistema em outra aba; só aparecem com endereço configurado
  const modulos = useMemo(() => MODULOS.map(m => ({
    ...m,
    itens: m.itens.filter(i => enderecoDe(i)).map(i => ({
      ...i, externo: enderecoDe(i), icon: ICONES_MODULO[i.icone] || LayoutDashboard, liberada: veTela(usuario, m.chave),
    })),
  })).filter(m => m.itens.length), [usuario]);
  const grupos = [{ chave: 'operacoes', nome: 'Operações', resumo: 'orçamentos, garantia, lojinha, compras', itens: blocos }, ...modulos];
  const todos = grupos.flatMap(g => g.itens);
  const abrir = (b) => { if (!b.liberada) return; if (b.externo) window.open(b.externo, '_blank', 'noopener'); else navigate(b.rota); };

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
        <div className="flex gap-6 border-b border-[var(--c-borda)] mb-4">
          {[['telas', 'Telas'], ['favoritas', 'Favoritas']].map(([k, t]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`pb-2.5 text-sm -mb-px border-b-2 ${aba === k ? 'border-[var(--c-texto)] text-[var(--c-texto)] font-medium' : 'border-transparent text-[var(--c-suave)] hover:text-[var(--c-texto)]'}`}>{t}</button>
          ))}
        </div>
        {aba === 'favoritas' && !todos.some(b => favoritas.includes(b.chave)) && (
          <p className="text-sm text-[var(--c-suave)] py-8 text-center">Nenhuma favorita ainda. Clique na estrela de uma tela para fixar aqui.</p>
        )}
        <div className="space-y-6">
          {grupos.map((g, gi) => {
            const itens = aba === 'favoritas' ? g.itens.filter(b => favoritas.includes(b.chave)) : g.itens;
            const extras = gi === 0 && aba === 'telas' && (admin || construtor);
            if (!itens.length && !extras) return null;
            return (
              <section key={g.chave}>
                {grupos.length > 1 && (
                  <div className="flex items-center gap-2 mb-3 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: AZUL }} />
                    <h2 className="text-sm font-bold text-[var(--c-texto)] shrink-0">{g.nome}</h2>
                    <span className="text-xs text-[var(--c-suave)] truncate">{g.resumo}</span>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {extras && admin && (
                    <button onClick={() => navigate('/telas')}
                      className="rounded-2xl border-2 border-dashed border-[var(--c-borda-forte,var(--c-borda))] p-3.5 flex items-center gap-3 text-left hover:border-[var(--c-destaque)] transition-colors">
                      <span className="w-10 h-10 rounded-xl border border-[var(--c-borda)] flex items-center justify-center shrink-0"><Plus size={20} className="text-[var(--c-texto)]" /></span>
                      <span className="text-sm font-semibold text-[var(--c-texto)]">Criar tela</span>
                    </button>
                  )}
                  {extras && construtor && (
                    <button onClick={() => navigate('/construtor')}
                      className="rounded-2xl border-2 border-dashed border-[var(--c-destaque)] p-3.5 flex items-center gap-3 text-left hover:bg-[var(--c-destaque)]/10 transition-colors">
                      <span className="w-10 h-10 rounded-xl border border-[var(--c-borda)] flex items-center justify-center shrink-0"><LayoutTemplate size={20} className="text-[var(--c-texto)]" /></span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-[var(--c-texto)]">Construtor de telas</span>
                        <span className="block text-[10px] text-[var(--c-destaque-claro)]">beta</span>
                      </span>
                    </button>
                  )}
                  {itens.map(b => {
                    const Icon = b.icon;
                    const fav = favoritas.includes(b.chave);
                    const qtd = b.conta ? dados?.telas?.[b.chave] : undefined;
                    return (
                      <div key={b.chave} role="button" tabIndex={b.liberada ? 0 : -1}
                        onClick={() => abrir(b)}
                        onKeyDown={e => { if (e.key === 'Enter') abrir(b); }}
                        title={!b.liberada ? 'Você não tem acesso a esta tela' : b.externo ? `Abrir ${b.nome} (em outra aba)` : `Abrir ${b.nome}`}
                        className={`group relative rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-3.5 flex items-center gap-3 transition-colors ${b.liberada ? 'cursor-pointer hover:border-[var(--c-destaque)]' : 'cursor-not-allowed opacity-50 grayscale'}`}>
                        <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: b.liberada ? AZUL : '#4b5563' }}>
                          <Icon size={20} strokeWidth={1.75} className="text-white" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--c-texto)] leading-tight">
                            <span className="truncate">{b.nome}</span>
                            {b.externo && b.liberada && <ExternalLink size={12} className="shrink-0 text-[var(--c-suave)]" />}
                          </span>
                          <span className="block text-[11px] text-[var(--c-suave)] mt-0.5 truncate">
                            {!b.liberada ? 'Sem acesso' : b.conta ? (qtd != null ? `${fmt(qtd)} card${qtd === 1 ? '' : 's'}` : '…') : b.desc}
                          </span>
                        </span>
                        {b.liberada ? (
                          <button onClick={e => { e.stopPropagation(); alternarFavorita(b.chave); }} aria-label={fav ? 'Tirar das favoritas' : 'Favoritar'}
                            className={`shrink-0 p-1 rounded-lg ${fav ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}>
                            <Star size={16} className={fav ? 'text-[var(--c-destaque-claro)] fill-[var(--c-destaque-claro)]' : 'text-[var(--c-suave)]'} />
                          </button>
                        ) : (
                          <span className="shrink-0 w-7 h-7 rounded-full bg-[var(--c-borda)] flex items-center justify-center"><Lock size={13} className="text-[var(--c-texto)]" /></span>
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
