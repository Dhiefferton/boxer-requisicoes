// ============================================================
// components/operador/PainelMovimentacao.jsx
// Relatório de movimentação da tela de Orçamentos: tudo o que aconteceu
// (mudança de coluna, Zen, Pipefy, erros, cancelamentos...), com filtros,
// resumo e exportação para Excel.
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  X, Search, FileDown, RefreshCw, ArrowRight, User, Bot, Cloud, History,
  ExternalLink, Activity, AlertTriangle, Ban, Layers,
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

export default function PainelMovimentacao({ onFechar }) {
  const [periodo, setPeriodo] = useState('30');
  const [movimentos, setMovimentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [usuario, setUsuario] = useState('');
  const [origem, setOrigem] = useState('');
  const [pedidoFiltro, setPedidoFiltro] = useState(null);
  const [ocultarSync, setOcultarSync] = useState(false);

  async function carregar() {
    setLoading(true); setErro('');
    try {
      const p = PERIODOS.find(x => x.id === periodo);
      const hoje = hojeISO();
      const params = p?.dias === null ? {} : { de: p.dias === 0 ? hoje : menosDias(hoje, p.dias), ate: hoje };
      const { data } = await pedidosOrcamentoService.movimentos(params);
      setMovimentos(data.movimentos || []);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Não foi possível carregar a movimentação.');
    } finally { setLoading(false); }
  }
  useEffect(() => { carregar(); }, [periodo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onFechar(); };
    document.addEventListener('keydown', esc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = overflow; };
  }, [onFechar]);

  const usuarios = useMemo(() => [...new Set(movimentos.map(m => m.usuario_nome).filter(Boolean))].sort(), [movimentos]);
  const tiposPresentes = useMemo(() => [...new Set(movimentos.map(m => m.tipo))], [movimentos]);

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return movimentos.filter(m => {
      if (ocultarSync && m.tipo === 'sincronizacao') return false;
      if (tipo && m.tipo !== tipo) return false;
      if (usuario && m.usuario_nome !== usuario) return false;
      if (origem && m.origem !== origem) return false;
      if (pedidoFiltro && m.pedido_id !== pedidoFiltro.id) return false;
      if (b) {
        const alvo = [m.cliente_nome, m.referencia, m.ns_entrada, m.pipefy_card_id, m.zen_pedido_id,
          m.descricao, m.usuario_nome, tipoInfo(m.tipo).label, textoDetalhes(m.detalhes)].join(' ').toLowerCase();
        if (!alvo.includes(b)) return false;
      }
      return true;
    });
  }, [movimentos, busca, tipo, usuario, origem, pedidoFiltro, ocultarSync]);

  const resumo = useMemo(() => ({
    total: filtrados.length,
    cards: new Set(filtrados.map(m => m.pedido_id).filter(Boolean)).size,
    erros: filtrados.filter(m => m.tipo === 'erro_zen').length,
    cancelados: filtrados.filter(m => m.tipo === 'cancelado').length,
  }), [filtrados]);

  const porDia = useMemo(() => {
    const grupos = [];
    let atual = null;
    for (const m of filtrados) {
      const k = chaveDia(m.criado_em);
      if (!atual || atual.chave !== k) { atual = { chave: k, itens: [] }; grupos.push(atual); }
      atual.itens.push(m);
    }
    return grupos;
  }, [filtrados]);

  function exportarExcel() {
    const linhas = filtrados.map(m => ({
      'Data/Hora': fmtDataHora(m.criado_em),
      'Movimento': tipoInfo(m.tipo).label,
      'Cliente / Card': nomeCard(m) || '—',
      'NS de entrada': m.ns_entrada || '',
      'Card Pipefy': m.pipefy_card_id || '',
      'Pedido Zen': m.zen_pedido_id || '',
      'De': STATUS[m.de_status] || m.de_status || '',
      'Para': STATUS[m.para_status] || m.para_status || '',
      'Descrição': m.descricao || '',
      'Detalhes': textoDetalhes(m.detalhes),
      'Usuário': m.usuario_nome || '',
      'Origem': ORIGENS[m.origem]?.label || m.origem,
      'Situação atual do card': STATUS[m.status_atual] || m.status_atual || '',
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    ws['!cols'] = [18, 24, 38, 14, 14, 11, 16, 16, 70, 60, 22, 14, 20].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimentação');
    XLSX.writeFile(wb, `movimentacao-orcamentos-${hojeISO()}.xlsx`);
  }

  const filtrosAtivos = tipo || usuario || origem || pedidoFiltro || busca || ocultarSync;
  const selectCls = 'min-w-0 max-w-full bg-[var(--c-fundo)] border border-[var(--c-borda)] text-[var(--c-texto)] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[var(--c-destaque)]';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4" onClick={onFechar}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-6xl h-[100dvh] sm:h-[92dvh] bg-[var(--c-fundo)] border border-[var(--c-borda)] sm:rounded-2xl flex flex-col overflow-hidden">

        {/* Cabeçalho */}
        <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-[var(--c-borda)] bg-[var(--c-superficie)]">
          <div className="w-9 h-9 rounded-xl bg-[var(--c-destaque)]/15 flex items-center justify-center shrink-0">
            <Activity size={18} className="text-[var(--c-destaque)]" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-[var(--c-texto)] truncate">Movimentação — Orçamentos</h2>
            <p className="text-xs text-[var(--c-suave)] truncate">Tudo o que aconteceu na tela: colunas, Zen, Pipefy, erros e cancelamentos</p>
          </div>
          <button onClick={carregar} disabled={loading} title="Recarregar"
            className="p-2 rounded-xl text-[var(--c-suave)] hover:text-[var(--c-texto)] hover:bg-[var(--c-borda)]">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={exportarExcel} disabled={!filtrados.length}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-green-500/15 text-green-400 hover:bg-green-500/25 disabled:opacity-40">
            <FileDown size={14} /> Exportar Excel
          </button>
          <button onClick={onFechar} title="Fechar" className="p-2 rounded-xl text-[var(--c-suave)] hover:text-[var(--c-texto)] hover:bg-[var(--c-borda)]">
            <X size={18} />
          </button>
        </div>

        {/* No celular tudo rola junto; no computador só a linha do tempo rola */}
        <div className="flex-1 min-h-0 overflow-y-auto sm:overflow-hidden sm:flex sm:flex-col">
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
            <button onClick={exportarExcel} disabled={!filtrados.length}
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
              {Object.keys(TIPOS).filter(t => tiposPresentes.includes(t)).map(t => <option key={t} value={t}>{TIPOS[t].label}</option>)}
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
              <input type="checkbox" checked={ocultarSync} onChange={e => setOcultarSync(e.target.checked)} className="accent-[var(--c-destaque)]" />
              Ocultar "Atualizar"
            </label>
          </div>
          {(pedidoFiltro || filtrosAtivos) && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {pedidoFiltro && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--c-destaque)]/15 text-[var(--c-destaque)]">
                  Card: {pedidoFiltro.nome}
                  <button onClick={() => setPedidoFiltro(null)}><X size={12} /></button>
                </span>
              )}
              {filtrosAtivos && (
                <button onClick={() => { setBusca(''); setTipo(''); setUsuario(''); setOrigem(''); setPedidoFiltro(null); setOcultarSync(false); }}
                  className="text-[var(--c-suave)] hover:text-[var(--c-texto)] underline">Limpar filtros</button>
              )}
            </div>
          )}
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 sm:px-5 py-3">
          <Kpi icon={Activity} valor={resumo.total} rotulo="Movimentos" cor="text-[var(--c-destaque)]" />
          <Kpi icon={Layers} valor={resumo.cards} rotulo="Cards movimentados" cor="text-blue-400" />
          <Kpi icon={AlertTriangle} valor={resumo.erros} rotulo="Erros no Zen" cor="text-red-400" />
          <Kpi icon={Ban} valor={resumo.cancelados} rotulo="Cancelamentos" cor="text-amber-400" />
        </div>

        {/* Linha do tempo */}
        <div className="sm:flex-1 sm:min-h-0 sm:overflow-y-auto px-4 sm:px-5 pb-5">
          {loading ? (
            <div className="flex justify-center py-16"><Spinner className="text-[var(--c-destaque)]" /></div>
          ) : erro ? (
            <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">{erro}</p>
          ) : porDia.length === 0 ? (
            <p className="text-sm text-[var(--c-suave)] text-center py-16">Nenhum movimento no período/filtros escolhidos.</p>
          ) : porDia.map(g => (
            <div key={g.chave} className="mb-4">
              <div className="sticky top-0 z-10 bg-[var(--c-fundo)] py-2 flex items-center gap-2">
                <p className="text-xs font-semibold text-[var(--c-texto)] capitalize">{tituloDia(g.chave)}</p>
                <span className="text-[10px] text-[var(--c-suave)]">{g.itens.length} movimento(s)</span>
                <div className="flex-1 border-t border-[var(--c-borda)]" />
              </div>
              <div className="space-y-1.5">
                {g.itens.map(m => (
                  <LinhaMovimento key={m.id} m={m}
                    onFiltrarCard={() => m.pedido_id && setPedidoFiltro({ id: m.pedido_id, nome: nomeCard(m) })} />
                ))}
              </div>
            </div>
          ))}
          {!loading && movimentos.length >= 5000 && (
            <p className="text-xs text-[var(--c-suave)] text-center">Mostrando os 5.000 movimentos mais recentes do período.</p>
          )}
        </div>
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

function LinhaMovimento({ m, onFiltrarCard }) {
  const info = tipoInfo(m.tipo);
  const Origem = ORIGENS[m.origem]?.icon || User;
  const detalhes = textoDetalhes(m.detalhes);
  const card = nomeCard(m);
  return (
    <div className="bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-xl px-3 py-2.5 flex gap-3 min-w-0">
      <div className="w-11 shrink-0 pt-0.5">
        <p className="text-xs font-mono text-[var(--c-texto)]">{fmtHora(m.criado_em)}</p>
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${info.cor}`}>{info.label}</span>
          {card ? (
            <button onClick={onFiltrarCard} title="Ver só os movimentos deste card"
              className="text-xs font-semibold text-[var(--c-texto)] hover:text-[var(--c-destaque)] text-left break-words">
              {card}
            </button>
          ) : <span className="text-xs text-[var(--c-suave)]">Geral</span>}
          {m.ns_entrada && <span className="text-[10px] text-[var(--c-suave)]">NS {m.ns_entrada}</span>}
          {m.zen_pedido_id && <span className="text-[10px] text-green-400">Zen #{m.zen_pedido_id}</span>}
          {m.pipefy_url && (
            <a href={m.pipefy_url} target="_blank" rel="noreferrer" title="Abrir no Pipefy"
              className="text-[var(--c-suave)] hover:text-[var(--c-destaque)]"><ExternalLink size={11} /></a>
          )}
        </div>
        {m.descricao && <p className="text-xs text-[var(--c-texto)] break-words">{m.descricao}</p>}
        {(m.de_status || m.para_status) && m.de_status !== m.para_status && (
          <div className="flex flex-wrap items-center gap-1 text-[10px]">
            {m.de_status && <span className="px-1.5 py-0.5 rounded bg-[var(--c-borda)] text-[var(--c-suave)]">{STATUS[m.de_status] || m.de_status}</span>}
            {m.de_status && m.para_status && <ArrowRight size={10} className="text-[var(--c-suave)]" />}
            {m.para_status && <span className="px-1.5 py-0.5 rounded bg-[var(--c-destaque)]/15 text-[var(--c-destaque)]">{STATUS[m.para_status] || m.para_status}</span>}
          </div>
        )}
        {detalhes && <p className="text-[11px] text-[var(--c-suave)] break-words">{detalhes}</p>}
        <p className="sm:hidden flex items-center gap-1 text-[10px] text-[var(--c-suave)]">
          <Origem size={10} className="shrink-0" />{m.usuario_nome || '—'} · {ORIGENS[m.origem]?.label || m.origem}
        </p>
      </div>
      <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0 max-w-[11rem] text-right">
        <span className="flex items-center gap-1 text-[11px] text-[var(--c-texto)] min-w-0">
          <Origem size={11} className="shrink-0 text-[var(--c-suave)]" /><span className="truncate">{m.usuario_nome || '—'}</span>
        </span>
        <span className="text-[10px] text-[var(--c-suave)]">{ORIGENS[m.origem]?.label || m.origem}</span>
      </div>
    </div>
  );
}
