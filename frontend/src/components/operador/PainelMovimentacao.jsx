// ============================================================
// components/operador/PainelMovimentacao.jsx
// Relatório de movimentação da tela de Orçamentos: tudo o que aconteceu
// (mudança de coluna, Zen, Pipefy, erros, cancelamentos...), agrupado por
// card — cada card abre a própria história completa. Com filtros, resumo e
// exportação para Excel. Também abre direto em um card (botão no card).
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  X, Search, FileDown, RefreshCw, ArrowRight, User, Bot, Cloud, History,
  ExternalLink, Activity, AlertTriangle, Ban, Layers, ChevronDown, ChevronRight, FileText,
} from 'lucide-react';
import { pedidosOrcamentoService } from '../../services/api';
import { Spinner } from '../ui';

const TIPOS = {
  importado:                 { label: 'Card importado',          cor: 'bg-blue-500/15 text-blue-400' },
  criado_manual:             { label: 'Criado manualmente',      cor: 'bg-blue-500/15 text-blue-400' },
  reaberto:                  { label: 'Reaberto',                cor: 'bg-blue-500/15 text-blue-400' },
  movido:                    { label: 'Mudou de coluna',         cor: 'bg-[var(--c-destaque)]/15 text-[var(--c-destaque)]' },
  zen_pedido_criado:         { label: 'Pedido criado no Zen',    cor: 'bg-green-500/15 text-green-400' },
  separado_automatico:       { label: 'Separação concluída',     cor: 'bg-purple-500/15 text-purple-400' },
  aprovacao_pipefy:          { label: 'Aprovação (Pipefy)',      cor: 'bg-cyan-500/15 text-cyan-400' },
  pecas_recusadas_retiradas: { label: 'Peças recusadas retiradas', cor: 'bg-amber-500/15 text-amber-400' },
  pecas_alteradas_pipefy:    { label: 'Peças alteradas (Pipefy)', cor: 'bg-amber-500/15 text-amber-400' },
  pecas_atualizadas_zen:     { label: 'Peças atualizadas no Zen', cor: 'bg-amber-500/15 text-amber-400' },
  pecas_conferidas_zen:      { label: 'Peças conferidas no Zen', cor: 'bg-[var(--c-borda)] text-[var(--c-suave)]' },
  dados_alterados_pipefy:    { label: 'Dados alterados (Pipefy)', cor: 'bg-[var(--c-borda)] text-[var(--c-suave)]' },
  editado:                   { label: 'Editado',                 cor: 'bg-[var(--c-borda)] text-[var(--c-suave)]' },
  finalizado:                { label: 'Finalizado',              cor: 'bg-green-500/15 text-green-400' },
  cancelado:                 { label: 'Cancelado',               cor: 'bg-red-500/15 text-red-400' },
  erro_zen:                  { label: 'Erro no Zen',             cor: 'bg-red-500/15 text-red-400' },
  sincronizacao:             { label: 'Atualizar (sincronização)', cor: 'bg-[var(--c-borda)] text-[var(--c-suave)]' },
};
const tipoInfo = (t) => TIPOS[t] || { label: t, cor: 'bg-[var(--c-borda)] text-[var(--c-suave)]' };

const STATUS = {
  solicitacao: 'Solicitado', separando: 'Em Separação', separado: 'Separado',
  aprovado_recusado: 'Aprovado/Recusado', finalizado: 'Finalizado', cancelado: 'Cancelado',
};
const ORIGENS = {
  usuario:       { label: 'Usuário',       icon: User },
  sincronizacao: { label: 'Sincronização', icon: Cloud },
  sistema:       { label: 'Automático',    icon: Bot },
  historico:     { label: 'Histórico',     icon: History },
};

const PERIODOS = [
  { id: 'hoje', label: 'Hoje',     dias: 0 },
  { id: '7',    label: '7 dias',   dias: 7 },
  { id: '30',   label: '30 dias',  dias: 30 },
  { id: '90',   label: '90 dias',  dias: 90 },
  { id: 'tudo', label: 'Tudo',     dias: null },
];

const hojeISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
function menosDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}
const fmtHora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const fmtDataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const chaveDia = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
function tituloDia(chave) {
  const hoje = hojeISO();
  if (chave === hoje) return 'Hoje';
  if (chave === menosDias(hoje, 1)) return 'Ontem';
  return new Date(`${chave}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}
const nomeCard = (m) => m.cliente_nome || m.referencia || (m.pedido_id ? `Pedido #${m.pedido_id}` : null);

function textoDetalhes(det) {
  if (!det || typeof det !== 'object') return '';
  const rot = {
    zen_pedido_id: 'Pedido Zen', ordem_separacao: 'Ordem', ordem_anterior: 'Ordem anterior', ordem_nova: 'Nova ordem',
    romaneio: 'Romaneio', nota: 'Nota', aprovacao: 'Aprovação', pecas_recusadas: 'Peças recusadas',
    antes: 'Antes', depois: 'Depois', codigos: 'Códigos', adicionados: 'Incluídas', removidos: 'Retiradas',
    alterados: 'Qtd. corrigida', itens_incluidos: 'Itens incluídos', pecas: 'Peças', acao: 'Ação',
    excluido_no_zen: 'Excluído no Zen', pipefy_card_id: 'Card Pipefy',
  };
  return Object.entries(det)
    .filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => {
      let val = v;
      if (Array.isArray(v)) val = v.join(', ');
      else if (typeof v === 'boolean') val = v ? 'sim' : 'não';
      else if (typeof v === 'object') val = `${v.antes ?? '—'} → ${v.depois ?? '—'}`;
      return `${rot[k] || k}: ${val}`;
    }).join(' · ');
}

const COR_STATUS = {
  solicitacao: 'bg-blue-500/15 text-blue-400', separando: 'bg-amber-500/15 text-amber-400',
  separado: 'bg-purple-500/15 text-purple-400', aprovado_recusado: 'bg-cyan-500/15 text-cyan-400',
  finalizado: 'bg-green-500/15 text-green-400', cancelado: 'bg-red-500/15 text-red-400',
};
const fmtDataCurta = (iso) => new Date(iso).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
});
const GERAL = 'geral';

/**
 * @param onFechar     fecha o painel
 * @param pedidoInicial { id, nome } — abre direto na história deste card (todo o período)
 */
export default function PainelMovimentacao({ onFechar, pedidoInicial = null }) {
  const soUmCard = !!pedidoInicial;
  const [periodo, setPeriodo] = useState(soUmCard ? 'tudo' : '30');
  const [movimentos, setMovimentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [usuario, setUsuario] = useState('');
  const [origem, setOrigem] = useState('');
  const [mostrarSync, setMostrarSync] = useState(false);
  const [abertos, setAbertos] = useState(() => new Set(soUmCard ? [pedidoInicial.id] : []));

  async function carregar() {
    setLoading(true); setErro('');
    try {
      const p = PERIODOS.find(x => x.id === periodo);
      const hoje = hojeISO();
      const params = p?.dias === null ? {} : { de: p.dias === 0 ? hoje : menosDias(hoje, p.dias), ate: hoje };
      if (soUmCard) params.pedido = pedidoInicial.id;
      const { data } = await pedidosOrcamentoService.movimentos(params);
      setMovimentos(data.movimentos || []);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Não foi possível carregar a movimentação.');
    } finally { setLoading(false); }
  }
  useEffect(() => { carregar(); }, [periodo]); // eslint-disable-line react-hooks/exhaustive-deps

  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') fecharRef.current(); };
    document.addEventListener('keydown', esc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = overflow; };
  }, []);

  const usuarios = useMemo(() => [...new Set(movimentos.map(m => m.usuario_nome).filter(Boolean))].sort(), [movimentos]);
  const tiposPresentes = useMemo(() => [...new Set(movimentos.map(m => m.tipo))], [movimentos]);

  // Filtros por movimento (tipo/usuário/origem)
  const filtrados = useMemo(() => movimentos.filter(m => {
    if (tipo && m.tipo !== tipo) return false;
    if (usuario && m.usuario_nome !== usuario) return false;
    if (origem && m.origem !== origem) return false;
    return true;
  }), [movimentos, tipo, usuario, origem]);

  // Um grupo por card (pedido). As idas ao "Atualizar" (sem card) ficam num grupo "Geral".
  const grupos = useMemo(() => {
    const mapa = new Map();
    for (const m of filtrados) {
      const chave = m.pedido_id || GERAL;
      if (!mapa.has(chave)) {
        mapa.set(chave, {
          chave, pedido_id: m.pedido_id || null,
          nome: m.pedido_id ? nomeCard(m) : 'Atualizações (Pipefy / Zen)',
          ns_entrada: m.ns_entrada, pipefy_card_id: m.pipefy_card_id, pipefy_url: m.pipefy_url,
          zen_pedido_id: m.zen_pedido_id, status_atual: m.status_atual, itens: [],
        });
      }
      mapa.get(chave).itens.push(m);
    }
    const b = busca.trim().toLowerCase();
    return [...mapa.values()]
      .map(g => ({
        ...g,
        itens: [...g.itens].sort((a, b2) => new Date(a.criado_em) - new Date(b2.criado_em) || a.id - b2.id), // história em ordem
        ultimo: g.itens.reduce((x, y) => (new Date(y.criado_em) > new Date(x.criado_em) ? y : x)),
        erros: g.itens.filter(m => m.tipo === 'erro_zen').length,
      }))
      .filter(g => {
        if (g.chave === GERAL) return mostrarSync && !b;
        if (!b) return true;
        const alvo = [g.nome, g.ns_entrada, g.pipefy_card_id, g.zen_pedido_id,
          ...g.itens.map(m => [m.descricao, m.usuario_nome, tipoInfo(m.tipo).label, textoDetalhes(m.detalhes)].join(' '))]
          .join(' ').toLowerCase();
        return alvo.includes(b);
      })
      .sort((a, b2) => (a.chave === GERAL) - (b2.chave === GERAL) || new Date(b2.ultimo.criado_em) - new Date(a.ultimo.criado_em));
  }, [filtrados, busca, mostrarSync]);

  const resumo = useMemo(() => {
    const doCards = grupos.filter(g => g.chave !== GERAL).flatMap(g => g.itens);
    return {
      total: doCards.length,
      cards: grupos.filter(g => g.chave !== GERAL).length,
      erros: doCards.filter(m => m.tipo === 'erro_zen').length,
      cancelados: doCards.filter(m => m.tipo === 'cancelado').length,
    };
  }, [grupos]);

  const alternar = (chave) => setAbertos(prev => {
    const n = new Set(prev);
    if (n.has(chave)) n.delete(chave); else n.add(chave);
    return n;
  });
  const todosAbertos = grupos.length > 0 && grupos.every(g => abertos.has(g.chave));

  function exportarExcel() {
    const linhas = grupos.flatMap(g => g.itens.map(m => ({
      'Cliente / Card': g.nome || '—',
      'NS de entrada': g.ns_entrada || '',
      'Card Pipefy': g.pipefy_card_id || '',
      'Pedido Zen': g.zen_pedido_id || '',
      'Situação atual do card': STATUS[g.status_atual] || g.status_atual || '',
      'Data/Hora': fmtDataHora(m.criado_em),
      'Movimento': tipoInfo(m.tipo).label,
      'De': STATUS[m.de_status] || m.de_status || '',
      'Para': STATUS[m.para_status] || m.para_status || '',
      'Descrição': m.descricao || '',
      'Detalhes': textoDetalhes(m.detalhes),
      'Usuário': m.usuario_nome || '',
      'Origem': ORIGENS[m.origem]?.label || m.origem,
    })));
    const ws = XLSX.utils.json_to_sheet(linhas);
    ws['!cols'] = [38, 14, 14, 11, 20, 18, 24, 16, 16, 70, 60, 22, 14].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimentação');
    const sufixo = soUmCard ? `card-${pedidoInicial.id}` : hojeISO();
    XLSX.writeFile(wb, `movimentacao-orcamentos-${sufixo}.xlsx`);
  }

  const filtrosAtivos = tipo || usuario || origem || busca;
  const selectCls = 'min-w-0 max-w-full bg-[var(--c-fundo)] border border-[var(--c-borda)] text-[var(--c-texto)] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[var(--c-destaque)]';
  const grupoUnico = soUmCard ? (grupos.find(g => String(g.pedido_id) === String(pedidoInicial.id)) || grupos.find(g => g.pedido_id)) : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4" onClick={onFechar}>
      <div onClick={e => e.stopPropagation()}
        className={`w-full ${soUmCard ? 'max-w-3xl' : 'max-w-6xl'} h-[100dvh] sm:h-[92dvh] bg-[var(--c-fundo)] border border-[var(--c-borda)] sm:rounded-2xl flex flex-col overflow-hidden`}>

        {/* Cabeçalho */}
        <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-[var(--c-borda)] bg-[var(--c-superficie)]">
          <div className="w-9 h-9 rounded-xl bg-[var(--c-destaque)]/15 flex items-center justify-center shrink-0">
            {soUmCard ? <History size={18} className="text-[var(--c-destaque)]" /> : <Activity size={18} className="text-[var(--c-destaque)]" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-[var(--c-texto)] truncate">
              {soUmCard ? `Histórico — ${pedidoInicial.nome || `Pedido #${pedidoInicial.id}`}` : 'Movimentação — Orçamentos'}
            </h2>
            <p className="text-xs text-[var(--c-suave)] truncate">
              {soUmCard ? 'Tudo o que aconteceu com este card, do primeiro ao último movimento'
                : 'Um card por pedido — clique no card para ver toda a história dele'}
            </p>
          </div>
          <button onClick={carregar} disabled={loading} title="Recarregar"
            className="p-2 rounded-xl text-[var(--c-suave)] hover:text-[var(--c-texto)] hover:bg-[var(--c-borda)]">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={exportarExcel} disabled={!grupos.length}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-green-500/15 text-green-400 hover:bg-green-500/25 disabled:opacity-40">
            <FileDown size={14} /> Exportar Excel
          </button>
          <button onClick={onFechar} title="Fechar" className="p-2 rounded-xl text-[var(--c-suave)] hover:text-[var(--c-texto)] hover:bg-[var(--c-borda)]">
            <X size={18} />
          </button>
        </div>

        {/* No celular tudo rola junto; no computador só a lista rola */}
        <div className="flex-1 min-h-0 overflow-y-auto sm:overflow-hidden sm:flex sm:flex-col">

        {soUmCard ? (
          <>
            {grupoUnico && <ResumoCard g={grupoUnico} />}
            <div className="sm:flex-1 sm:min-h-0 sm:overflow-y-auto px-4 sm:px-5 pb-5 pt-1">
              {loading ? (
                <div className="flex justify-center py-16"><Spinner className="text-[var(--c-destaque)]" /></div>
              ) : erro ? (
                <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">{erro}</p>
              ) : !grupoUnico ? (
                <p className="text-sm text-[var(--c-suave)] text-center py-16">Nenhum movimento registrado para este card.</p>
              ) : <Historia itens={grupoUnico.itens} />}
              <button onClick={exportarExcel} disabled={!grupos.length}
                className="sm:hidden mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-green-500/15 text-green-400 disabled:opacity-40">
                <FileDown size={13} /> Exportar Excel
              </button>
            </div>
          </>
        ) : (
          <>
        {/* Filtros */}
        <div className="px-4 sm:px-5 py-3 border-b border-[var(--c-borda)] space-y-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {PERIODOS.map(p => (
              <button key={p.id} onClick={() => setPeriodo(p.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${periodo === p.id
                  ? 'bg-[var(--c-destaque)] text-white' : 'bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-suave)] hover:text-[var(--c-texto)]'}`}>
                {p.label}
              </button>
            ))}
            <button onClick={exportarExcel} disabled={!grupos.length}
              className="sm:hidden ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-green-500/15 text-green-400 disabled:opacity-40">
              <FileDown size={13} /> Excel
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[12rem]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-suave)]" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente, NS, pedido Zen, peça, usuário..."
                className="w-full bg-[var(--c-fundo)] border border-[var(--c-borda)] text-[var(--c-texto)] rounded-xl pl-9 pr-3 py-2 text-xs placeholder:text-[var(--c-suave)] focus:outline-none focus:border-[var(--c-destaque)]" />
            </div>
            <select value={tipo} onChange={e => setTipo(e.target.value)} className={selectCls}>
              <option value="">Todos os movimentos</option>
              {Object.keys(TIPOS).filter(t => t !== 'sincronizacao' && tiposPresentes.includes(t)).map(t => <option key={t} value={t}>{TIPOS[t].label}</option>)}
            </select>
            <select value={usuario} onChange={e => setUsuario(e.target.value)} className={selectCls}>
              <option value="">Todos os usuários</option>
              {usuarios.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <select value={origem} onChange={e => setOrigem(e.target.value)} className={selectCls}>
              <option value="">Todas as origens</option>
              {Object.entries(ORIGENS).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-[var(--c-suave)] cursor-pointer select-none">
              <input type="checkbox" checked={mostrarSync} onChange={e => setMostrarSync(e.target.checked)} className="accent-[var(--c-destaque)]" />
              Mostrar cliques em "Atualizar"
            </label>
          </div>
          {filtrosAtivos && (
            <button onClick={() => { setBusca(''); setTipo(''); setUsuario(''); setOrigem(''); }}
              className="text-xs text-[var(--c-suave)] hover:text-[var(--c-texto)] underline">Limpar filtros</button>
          )}
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 sm:px-5 py-3">
          <Kpi icon={Layers} valor={resumo.cards} rotulo="Cards" cor="text-blue-400" />
          <Kpi icon={Activity} valor={resumo.total} rotulo="Movimentos" cor="text-[var(--c-destaque)]" />
          <Kpi icon={AlertTriangle} valor={resumo.erros} rotulo="Erros no Zen" cor="text-red-400" />
          <Kpi icon={Ban} valor={resumo.cancelados} rotulo="Cancelamentos" cor="text-amber-400" />
        </div>

        {/* Cards */}
        <div className="sm:flex-1 sm:min-h-0 sm:overflow-y-auto px-4 sm:px-5 pb-5">
          {!loading && !erro && grupos.length > 0 && (
            <div className="flex justify-end pb-2">
              <button onClick={() => setAbertos(todosAbertos ? new Set() : new Set(grupos.map(g => g.chave)))}
                className="text-xs text-[var(--c-suave)] hover:text-[var(--c-texto)]">
                {todosAbertos ? 'Fechar todos' : 'Abrir todos'}
              </button>
            </div>
          )}
          {loading ? (
            <div className="flex justify-center py-16"><Spinner className="text-[var(--c-destaque)]" /></div>
          ) : erro ? (
            <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">{erro}</p>
          ) : grupos.length === 0 ? (
            <p className="text-sm text-[var(--c-suave)] text-center py-16">Nenhum movimento no período/filtros escolhidos.</p>
          ) : (
            <div className="space-y-2">
              {grupos.map(g => (
                <GrupoCard key={g.chave} g={g} aberto={abertos.has(g.chave)} onAlternar={() => alternar(g.chave)} />
              ))}
            </div>
          )}
          {!loading && movimentos.length >= 5000 && (
            <p className="text-xs text-[var(--c-suave)] text-center mt-3">Mostrando os 5.000 movimentos mais recentes do período.</p>
          )}
        </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, valor, rotulo, cor }) {
  return (
    <div className="bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-xl px-3 py-2.5 flex items-center gap-2.5 min-w-0">
      <Icon size={16} className={`${cor} shrink-0`} />
      <div className="min-w-0">
        <p className="text-lg font-bold text-[var(--c-texto)] leading-none">{valor}</p>
        <p className="text-[10px] text-[var(--c-suave)] mt-1 truncate">{rotulo}</p>
      </div>
    </div>
  );
}

function Etiquetas({ g }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
      {g.status_atual && (
        <span className={`font-semibold px-2 py-0.5 rounded-full ${COR_STATUS[g.status_atual] || 'bg-[var(--c-borda)] text-[var(--c-suave)]'}`}>
          {STATUS[g.status_atual] || g.status_atual}
        </span>
      )}
      {g.ns_entrada && <span className="text-[var(--c-suave)]">NS {g.ns_entrada}</span>}
      {g.pipefy_card_id && <span className="text-[var(--c-destaque)]">Pipefy #{g.pipefy_card_id}</span>}
      {g.zen_pedido_id && <span className="text-green-400">Zen #{g.zen_pedido_id}</span>}
      {g.pipefy_url && (
        <a href={g.pipefy_url} target="_blank" rel="noreferrer" title="Abrir no Pipefy" onClick={e => e.stopPropagation()}
          className="text-[var(--c-suave)] hover:text-[var(--c-destaque)]"><ExternalLink size={11} /></a>
      )}
    </div>
  );
}

function ResumoCard({ g }) {
  return (
    <div className="px-4 sm:px-5 py-3 border-b border-[var(--c-borda)] space-y-1.5">
      <Etiquetas g={g} />
      <p className="text-xs text-[var(--c-suave)]">
        {g.itens.length} movimento(s) · primeiro em {fmtDataCurta(g.itens[0].criado_em)} · último em {fmtDataCurta(g.ultimo.criado_em)}
        {g.erros > 0 && <span className="text-red-400"> · {g.erros} erro(s) no Zen</span>}
      </p>
    </div>
  );
}

function GrupoCard({ g, aberto, onAlternar }) {
  const geral = g.chave === GERAL;
  const ult = tipoInfo(g.ultimo.tipo);
  return (
    <div className={`rounded-xl border bg-[var(--c-superficie)] overflow-hidden ${aberto ? 'border-[var(--c-destaque)]/40' : 'border-[var(--c-borda)]'}`}>
      <div role="button" tabIndex={0} onClick={onAlternar}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAlternar(); } }}
        className="flex items-start gap-3 px-3 py-3 cursor-pointer hover:bg-[var(--c-borda)]/30">
        <div className="pt-0.5 text-[var(--c-suave)] shrink-0">{aberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {geral ? <Cloud size={13} className="text-[var(--c-suave)] shrink-0" /> : <FileText size={13} className="text-[var(--c-destaque)] shrink-0" />}
            <p className="text-sm font-semibold text-[var(--c-texto)] break-words">{g.nome}</p>
          </div>
          {!geral && <Etiquetas g={g} />}
          <p className="text-[11px] text-[var(--c-suave)] break-words">
            <span className={`inline-block mr-1 font-semibold px-1.5 py-px rounded ${ult.cor}`}>{ult.label}</span>
            {g.ultimo.descricao}
          </p>
        </div>
        <div className="shrink-0 text-right space-y-0.5">
          <p className="text-xs font-bold text-[var(--c-texto)]">{g.itens.length}</p>
          <p className="text-[10px] text-[var(--c-suave)]">mov.</p>
          {g.erros > 0 && <p className="text-[10px] text-red-400 font-semibold">{g.erros} erro(s)</p>}
          <p className="hidden sm:block text-[10px] text-[var(--c-suave)] whitespace-nowrap">{fmtDataCurta(g.ultimo.criado_em)}</p>
        </div>
      </div>
      {aberto && (
        <div className="border-t border-[var(--c-borda)] px-3 sm:px-4 py-3 bg-[var(--c-fundo)]/40">
          <Historia itens={g.itens} />
        </div>
      )}
    </div>
  );
}

// Linha do tempo do card: do primeiro ao último movimento, separada por dia
function Historia({ itens }) {
  let diaAnterior = null;
  return (
    <ol className="relative">
      {itens.map((m, i) => {
        const dia = chaveDia(m.criado_em);
        const novoDia = dia !== diaAnterior;
        diaAnterior = dia;
        return (
          <li key={m.id}>
            {novoDia && (
              <p className={`text-[11px] font-semibold text-[var(--c-texto)] capitalize mb-1.5 ${i ? 'mt-3' : ''}`}>{tituloDia(dia)}</p>
            )}
            <ItemHistoria m={m} ultimo={i === itens.length - 1} />
          </li>
        );
      })}
    </ol>
  );
}

function ItemHistoria({ m, ultimo }) {
  const info = tipoInfo(m.tipo);
  const Origem = ORIGENS[m.origem]?.icon || User;
  const detalhes = textoDetalhes(m.detalhes);
  const erroZen = m.tipo === 'erro_zen';
  return (
    <div className="flex gap-3 min-w-0">
      <div className="flex flex-col items-center shrink-0 w-3">
        <span className={`mt-1.5 w-2.5 h-2.5 rounded-full border-2 ${erroZen ? 'border-red-400 bg-red-400/30' : 'border-[var(--c-destaque)] bg-[var(--c-fundo)]'}`} />
        {!ultimo && <span className="flex-1 w-px bg-[var(--c-borda)] my-0.5" />}
      </div>
      <div className="flex-1 min-w-0 pb-3 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-mono text-[var(--c-texto)]">{fmtHora(m.criado_em)}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${info.cor}`}>{info.label}</span>
          <span className="flex items-center gap-1 text-[10px] text-[var(--c-suave)] min-w-0">
            <Origem size={10} className="shrink-0" /><span className="truncate">{m.usuario_nome || '—'}</span>
          </span>
        </div>
        {m.descricao && <p className={`text-xs break-words ${erroZen ? 'text-red-400' : 'text-[var(--c-texto)]'}`}>{m.descricao}</p>}
        {(m.de_status || m.para_status) && m.de_status !== m.para_status && (
          <div className="flex flex-wrap items-center gap-1 text-[10px]">
            {m.de_status && <span className="px-1.5 py-0.5 rounded bg-[var(--c-borda)] text-[var(--c-suave)]">{STATUS[m.de_status] || m.de_status}</span>}
            {m.de_status && m.para_status && <ArrowRight size={10} className="text-[var(--c-suave)]" />}
            {m.para_status && <span className="px-1.5 py-0.5 rounded bg-[var(--c-destaque)]/15 text-[var(--c-destaque)]">{STATUS[m.para_status] || m.para_status}</span>}
          </div>
        )}
        {detalhes && <p className="text-[11px] text-[var(--c-suave)] break-words">{detalhes}</p>}
      </div>
    </div>
  );
}
