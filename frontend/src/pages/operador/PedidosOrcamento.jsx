// ============================================================
// pages/operador/PedidosOrcamento.jsx
// ============================================================
// V1: estrutura básica (3 colunas: Solicitação -> Separando ->
// Finalizado). Ainda sem puxar dados do Pipefy nem gerar pedido no
// ZenERP — vem nos próximos passos.

import { useState, useEffect } from 'react';
import { ArrowRight, RefreshCw, Ban, FileText, DownloadCloud, ExternalLink, ChevronDown, ChevronRight, Archive, Scissors, PackageCheck, Activity, History, Search, X, ListTree, MoveRight, EyeOff, Eye } from 'lucide-react';
import { pedidosOrcamentoService } from '../../services/api';
import { Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { podeEditarOrcamentos } from '../../utils/acessoOrcamentos';
import PainelMovimentacao from '../../components/operador/PainelMovimentacao';
import CamposCardOrcamento from '../../components/operador/CamposCardOrcamento';
import { COLUNAS_ORCAMENTO as COLUNAS, STATUS_SO_ADMIN } from '../../utils/fasesOrcamento';

// Colunas: fases do Pipefy + Em Separação / Separado (utils/fasesOrcamento.js).
// Colunas novas só o admin move; o fluxo de sempre continua igual:
// Requisitar Peças -> Em Separação (cria no Zen), Aprovado/Recusado -> Expedição (nota no Zen).
const PROXIMA = { solicitacao: 'separando', aprovado_recusado: 'finalizado' };

const ZEN_APP_URL = 'https://boxer.zenerp.app.br';

// ── Busca: junta os textos do pedido (cliente, CNPJ, nº, peças…) sem acento ──
const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const IGNORAR_BUSCA = new Set(['pipefy_campos', 'id', 'criado_por', 'created_at', 'updated_at']);
function textoBusca(o, prof = 0) {
  if (o == null || prof > 3) return '';
  if (typeof o !== 'object') return String(o);
  if (Array.isArray(o)) return o.map(x => textoBusca(x, prof + 1)).join(' ');
  return Object.entries(o).filter(([k]) => !IGNORAR_BUSCA.has(k)).map(([, v]) => textoBusca(v, prof + 1)).join(' ');
}
function combinaBusca(pedido, busca) {
  const termos = semAcento(busca).split(/\s+/).filter(Boolean);
  if (!termos.length) return true;
  const texto = semAcento(textoBusca(pedido));
  const digitos = texto.replace(/\D/g, '');
  return termos.every(t => texto.includes(t) || (/^[\d./-]+$/.test(t) && t.replace(/\D/g, '') && digitos.includes(t.replace(/\D/g, ''))));
}

const brl = (v) => (v === null || v === undefined) ? '—'
  : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function formatarDoc(doc) {
  const d = String(doc || '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return doc || null;
}

function formatarData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function PedidosOrcamento() {
  const { usuario } = useAuth();
  const podeEditar = podeEditarOrcamentos(usuario); // senão: somente visualização
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [msgSync, setMsgSync] = useState('');
  const [verMovimentacao, setVerMovimentacao] = useState(false);
  const [busca, setBusca] = useState('');
  const [ocultarVazias, setOcultarVazias] = useState(() => { try { return localStorage.getItem('orc_ocultar_vazias') === '1'; } catch { return false; } });
  function alternarVazias() {
    setOcultarVazias(v => { try { localStorage.setItem('orc_ocultar_vazias', v ? '0' : '1'); } catch { /* sem storage */ } return !v; });
  }

  async function carregar() {
    try {
      const { data } = await pedidosOrcamentoService.listar();
      setPedidos(data.pedidos);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  const ativos = pedidos.filter(p => !['finalizado', 'cancelado', 'sucata'].includes(p.status)).length;

  async function sincronizarPipefy() {
    setSincronizando(true);
    setMsgSync('');
    try {
      const { data } = await pedidosOrcamentoService.sincronizarPipefy();
      setMsgSync(`Pipefy: ${data.total} card(s) em "Requisitar Peças" — ${data.novos} novo(s), ${data.atualizados} atualizado(s)${data.reativados ? `, ${data.reativados} reaberto(s)` : ''}${data.alterados ? `, ${data.alterados} com peças alteradas` : ''}. Zen: ${data.separados || 0} separado(s). Aprovado/Recusado: ${data.aprovadosRecusados || 0}${data.naoLiberados ? ` (+${data.naoLiberados} não liberado(s))` : ''}.`);
      await carregar();
    } catch (err) {
      setMsgSync(err.response?.data?.erro || 'Erro ao sincronizar com o Pipefy.');
    } finally {
      setSincronizando(false);
    }
  }

  return (
    // Tela grande (5 colunas): tela travada na altura da janela e cada coluna rola sozinha
    <div className="space-y-5 xl:space-y-0 xl:flex xl:flex-col xl:gap-5 xl:h-[calc(100dvh-3.1rem)]">
      {/* ── Cabeçalho ───────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--c-texto)]">Pedidos de Orçamento</h1>
          <p className="text-sm text-[var(--c-suave)] mt-0.5">
            {ativos} orçamento{ativos !== 1 ? 's' : ''} ativo{ativos !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-suave)]" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente, CNPJ, nº, peça…"
              className="w-56 sm:w-64 pl-8 pr-7 py-2 rounded-xl text-xs bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto)] focus:outline-none focus:border-[var(--c-destaque)]" />
            {busca && <button onClick={() => setBusca('')} title="Limpar" className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={12} /></button>}
          </div>
          {usuario?.perfil === 'admin' && (
            <button onClick={() => setVerMovimentacao(true)} title="Relatório de movimentação"
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold
                bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto)] hover:border-[var(--c-destaque)] transition-colors">
              <Activity size={13} /> Movimentação
            </button>
          )}
          {podeEditar && (
          <button onClick={sincronizarPipefy} disabled={sincronizando}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold
              bg-[var(--c-destaque)]/15 text-[var(--c-destaque)] hover:bg-[var(--c-destaque)]/25 transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed">
            <DownloadCloud size={13} className={sincronizando ? 'animate-pulse' : ''} />
            {sincronizando ? 'Atualizando...' : 'Atualizar'}
          </button>
          )}
          <button onClick={alternarVazias} title={ocultarVazias ? 'Mostrar colunas vazias' : 'Esconder colunas vazias'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-suave)] hover:text-[var(--c-texto)]">
            {ocultarVazias ? <Eye size={13} /> : <EyeOff size={13} />} {ocultarVazias ? 'Mostrar vazias' : 'Esconder vazias'}
          </button>
          <button onClick={carregar} disabled={loading} title="Recarregar"
            className="p-2 rounded-xl text-[var(--c-suave)] hover:text-[var(--c-texto)] hover:bg-[var(--c-borda)] transition-colors">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {verMovimentacao && usuario?.perfil === 'admin' && <PainelMovimentacao onFechar={() => setVerMovimentacao(false)} />}

      {msgSync && <p className="text-xs text-[var(--c-suave)] bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-xl px-3 py-2">{msgSync}</p>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="text-[var(--c-destaque)]" /></div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2 xl:flex-1 xl:min-h-0">
          {COLUNAS.map(({ status, titulo, cor, badge, arquivada, admin }) => {
            const itens = pedidos.filter(p => p.status === status && combinaBusca(p, busca));
            if (ocultarVazias && !itens.length) return null;
            return (
              <Coluna key={`${status}${busca ? '-busca' : ''}`} titulo={titulo} cor={cor} badge={badge} total={itens.length} arquivada={arquivada && !busca} soAdmin={admin}>
                {itens.length === 0 ? (
                  <div className="border-2 border-dashed border-[var(--c-borda)] rounded-2xl py-8 text-center">
                    <p className="text-xs text-[var(--c-suave)]">{busca ? 'Nada encontrado' : 'Sem pedidos'}</p>
                  </div>
                ) : (
                  itens.map(pedido => (
                    <CardPedido key={pedido.id} pedido={pedido} onAtualizar={carregar} podeEditar={podeEditar} ehAdmin={usuario?.perfil === 'admin'} />
                  ))
                )}
              </Coluna>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Coluna({ titulo, cor, badge, total, arquivada = false, soAdmin = false, children }) {
  // Finalizado: arquivado — lista fechada, abre na seta
  const [aberta, setAberta] = useState(!arquivada);
  const pilula = <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${badge}`}>{titulo}</span>;
  return (
    <div className="space-y-2 w-[17.5rem] shrink-0 xl:min-h-0 xl:flex xl:flex-col">
      <div className={`flex items-center justify-between px-3 py-2 rounded-xl border ${cor} bg-[var(--c-superficie)] xl:shrink-0`}>
        {arquivada ? (
          <button onClick={() => setAberta(v => !v)} className="flex items-center gap-1.5 text-[var(--c-suave)] hover:text-[var(--c-texto)]">
            {aberta ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            <Archive size={13} />
            {pilula}
          </button>
        ) : (
          <div className="flex items-center gap-2" title={soAdmin ? 'Coluna do Pipefy — só o admin move cards aqui' : undefined}>{pilula}</div>
        )}
        <span className="text-xs font-bold text-[var(--c-suave)]">{total}</span>
      </div>
      {aberta ? (
        <div className="space-y-2 xl:flex-1 xl:min-h-0 xl:overflow-y-auto xl:pr-1 xl:-mr-1 xl:pb-2">{children}</div>
      ) : (
        <button onClick={() => setAberta(true)}
          className="w-full text-xs text-[var(--c-suave)] py-3 text-center rounded-2xl border-2 border-dashed border-[var(--c-borda)] hover:text-[var(--c-texto)]">
          {total} arquivado(s) — clique para ver
        </button>
      )}
    </div>
  );
}

function CardPedido({ pedido, onAtualizar, podeEditar, ehAdmin }) {
  const [mudando, setMudando] = useState(false);
  const itens = pedido.itens || [];
  const totalItens = itens.reduce((t, it) => t + (Number(it.quantidade) || 0) * (Number(it.valor_unitario) || 0), 0);
  // Automáticos (via "Atualizar"): Separando -> Separado (reserva finalizada no Zen)
  // e -> Aprovado/Recusado (fase do card no Pipefy)
  const aprovacao = String(pedido.aprovacao || '').toLowerCase();
  // Aprovado Parcial: as peças do campo "Peças Recusadas" saem do pedido no Zen
  const parcial = aprovacao.includes('parcial');
  const codigosRecusados = separarCodigos(pedido.pecas_recusadas);
  const recusadosSet = new Set(codigosRecusados);
  const precisaRetirar = parcial && pedido.status === 'aprovado_recusado' && !pedido.recusadas_retiradas_em;
  const itensRetirados = Array.isArray(pedido.itens_recusados) ? pedido.itens_recusados : [];
  const [retirando, setRetirando] = useState(false);
  const proxima = precisaRetirar || !PROXIMA[pedido.status] ? null : COLUNAS.find(c => c.status === PROXIMA[pedido.status]);
  const [verCampos, setVerCampos] = useState(false);
  const [movendoPara, setMovendoPara] = useState(false);
  // Admin: mover para qualquer coluna
  async function moverPara(status) {
    if (!status || status === pedido.status) return;
    const destino = COLUNAS.find(c => c.status === status);
    const avisoZen = status === 'separando' && pedido.status === 'solicitacao' ? '\n\nIsso cria o pedido de venda e a ordem de separação no Zen.'
      : status === 'finalizado' && pedido.zen_ordem_separacao_id && !pedido.zen_nota_id && ['aprovado_recusado', 'em_manutencao', 'liberado_saida'].includes(pedido.status)
        ? '\n\nIsso fecha o romaneio e cria a nota fiscal no Zen.' : '';
    if (!confirm(`Mover este card para "${destino?.titulo || status}"?${avisoZen}`)) return;
    setMovendoPara(true);
    try { await pedidosOrcamentoService.mover(pedido.id, status); onAtualizar(); }
    catch (err) { alert(err.response?.data?.erro || 'Erro ao mover.'); onAtualizar(); }
    finally { setMovendoPara(false); }
  }

  async function avancar() {
    setMudando(true);
    try {
      await pedidosOrcamentoService.mover(pedido.id, proxima.status);
      onAtualizar();
    } catch (err) { alert(err.response?.data?.erro || 'Erro ao mover.'); onAtualizar(); }
    finally { setMudando(false); }
  }

  async function retirarRecusadas() {
    const lista = codigosRecusados.join(', ');
    if (!confirm(
      `Retirar as peças recusadas (${lista}) do pedido no Zen?\n\n` +
      'A ordem de separação atual será cancelada (as peças voltam pro estoque), ' +
      'o pedido será aprovado de novo e uma nova ordem de separação será gerada só com as peças aprovadas. ' +
      'O card volta para "Em Separação".'
    )) return;
    setRetirando(true);
    try {
      const { data } = await pedidosOrcamentoService.retirarRecusadas(pedido.id);
      alert(`Pronto! Peças retiradas: ${(data.itens_retirados || []).join(', ') || lista}.\nNova ordem de separação: #${data.zen_ordem_separacao_id}.`);
      onAtualizar();
    } catch (err) { alert(err.response?.data?.erro || 'Erro ao retirar as peças no Zen.'); onAtualizar(); }
    finally { setRetirando(false); }
  }

  const [cancelando, setCancelando] = useState(false);
  const [verHistorico, setVerHistorico] = useState(false);
  // Peças mudaram no Pipefy depois do pedido já estar no Zen
  const podeAtualizarItens = !!pedido.zen_pedido_id && ['separando', 'separado', 'aprovado_recusado'].includes(pedido.status);
  const itensAlterados = podeAtualizarItens && !!pedido.itens_alterados_em;
  const [atualizandoItens, setAtualizandoItens] = useState(false);
  async function atualizarItensZen() {
    if (!confirm(
      `Atualizar as peças do pedido #${pedido.zen_pedido_id} no Zen com as peças do card?\n\n` +
      'A ordem de separação atual será desfeita (as peças voltam pro estoque), o pedido recebe as peças do card ' +
      '(inclui, tira e corrige quantidades), é aprovado de novo e ganha uma nova ordem de separação. ' +
      'O card volta para "Em Separação".'
    )) return;
    setAtualizandoItens(true);
    try {
      const { data } = await pedidosOrcamentoService.atualizarItensZen(pedido.id);
      if (data.sem_alteracao) alert('As peças do Zen já estão iguais às do card — nada a alterar.');
      else {
        const partes = [];
        if (data.adicionados?.length) partes.push(`incluídas: ${data.adicionados.join(', ')}`);
        if (data.alterados?.length)   partes.push(`quantidade corrigida: ${data.alterados.join(', ')}`);
        if (data.removidos?.length)   partes.push(`retiradas: ${data.removidos.join(', ')}`);
        alert(`Pronto! ${partes.join(' · ')}.\nNova ordem de separação: #${data.zen_ordem_separacao_id}.`);
      }
      onAtualizar();
    } catch (err) { alert(err.response?.data?.erro || 'Erro ao atualizar as peças no Zen.'); onAtualizar(); }
    finally { setAtualizandoItens(false); }
  }
  async function cancelar() {
    const noZen = pedido.status === 'aprovado_recusado' && pedido.zen_pedido_id;
    const msg = noZen
      ? `Cancelar este pedido?\n\nNo Zen, a separação será desfeita (as peças voltam pro estoque) e o pedido de venda #${pedido.zen_pedido_id} será EXCLUÍDO.`
      : 'Cancelar este pedido de orçamento?';
    if (!confirm(msg)) return;
    setCancelando(true);
    try {
      await pedidosOrcamentoService.cancelar(pedido.id);
      onAtualizar();
    } catch (err) { alert(err.response?.data?.erro || 'Erro ao cancelar.'); onAtualizar(); }
    finally { setCancelando(false); }
  }

  return (
    <div className="p-3 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] space-y-2 min-w-0 break-words">
      <div className="flex items-center gap-1.5">
        <FileText size={13} className="text-[var(--c-destaque)] shrink-0" />
        <p className="text-sm text-[var(--c-texto)] font-medium flex-1">{pedido.cliente_nome || pedido.referencia}</p>
        <button onClick={() => setVerCampos(true)} title="Todos os campos do card"
          className="text-[var(--c-suave)] hover:text-[var(--c-destaque)]"><ListTree size={13} /></button>
        {ehAdmin && (
          <button onClick={() => setVerHistorico(true)} title="Histórico deste card"
            className="text-[var(--c-suave)] hover:text-[var(--c-destaque)]"><History size={13} /></button>
        )}
        {pedido.pipefy_url && (
          <a href={pedido.pipefy_url} target="_blank" rel="noreferrer" title="Abrir no Pipefy"
            className="text-[var(--c-suave)] hover:text-[var(--c-destaque)]"><ExternalLink size={13} /></a>
        )}
      </div>
      {verCampos && <CamposCardOrcamento pedido={pedido} ehAdmin={ehAdmin} onFechar={() => setVerCampos(false)} onSalvo={onAtualizar} />}
      {ehAdmin && verHistorico && (
        <PainelMovimentacao pedidoInicial={{ id: pedido.id, nome: pedido.cliente_nome || pedido.referencia }}
          onFechar={() => setVerHistorico(false)} />
      )}
      {pedido.aprovacao && (
        <span className={`inline-block mr-1 text-[10px] font-bold uppercase rounded px-1.5 py-0.5 ${
          parcial ? 'text-amber-300 bg-amber-500/20'
          : aprovacao.startsWith('aprov') ? 'text-green-300 bg-green-500/20'
          : aprovacao.startsWith('recus') ? 'text-red-300 bg-red-500/20'
          : aprovacao.startsWith('não lib') || aprovacao.startsWith('nao lib') ? 'text-red-300 bg-red-500/20'
          : 'text-[var(--c-suave)] bg-[var(--c-borda)]'}`}>{pedido.aprovacao}</span>
      )}
      {pedido.pipefy_card_id && (
        <span className="inline-block text-[10px] font-semibold text-[var(--c-destaque)] bg-[var(--c-destaque)]/10 rounded px-1.5 py-0.5">Pipefy #{pedido.pipefy_card_id}</span>
      )}
      {pedido.zen_pedido_id && (
        <a href={`${ZEN_APP_URL}/sale/sale?q=id==${pedido.zen_pedido_id}`} target="_blank" rel="noreferrer" title="Abrir pedido no Zen"
          className="inline-flex items-center gap-1 ml-1 text-[10px] font-semibold text-green-400 bg-green-500/10 hover:bg-green-500/20 rounded px-1.5 py-0.5">
          Pedido Zen #{pedido.zen_pedido_id} <ExternalLink size={10} />
        </a>
      )}
      {pedido.zen_ordem_separacao_id && (
        <a href={`${ZEN_APP_URL}/material/pickingOrder?q=id==${pedido.zen_ordem_separacao_id}`} target="_blank" rel="noreferrer" title="Abrir ordem de separação no Zen"
          className="inline-flex items-center gap-1 ml-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded px-1.5 py-0.5">
          Ordem de separação #{pedido.zen_ordem_separacao_id} <ExternalLink size={10} />
        </a>
      )}
      {pedido.zen_nota_id && (
        <a href={`${ZEN_APP_URL}/fiscal/outgoingInvoice.html?q=id==${pedido.zen_nota_id}`} target="_blank" rel="noreferrer" title="Abrir nota fiscal no Zen"
          className="inline-flex items-center gap-1 ml-1 text-[10px] font-semibold text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 rounded px-1.5 py-0.5">
          Nota fiscal #{pedido.zen_nota_id} <ExternalLink size={10} />
        </a>
      )}
      {parcial && !pedido.recusadas_retiradas_em && (
        <div className="text-[11px] rounded-lg px-2 py-1.5 bg-amber-500/10 border border-amber-500/30 text-[var(--c-texto)]">
          <p className="font-semibold text-amber-400 mb-0.5">Peças recusadas</p>
          {codigosRecusados.length
            ? <p className="font-mono break-words">{codigosRecusados.join(', ')}</p>
            : <p className="text-[var(--c-suave)]">Campo "Peças Recusadas" vazio no Pipefy.</p>}
        </div>
      )}
      {pedido.recusadas_retiradas_em && (
        <div className="text-[11px] rounded-lg px-2 py-1.5 bg-[var(--c-fundo)] border border-[var(--c-borda)] text-[var(--c-suave)]">
          <p className="font-semibold text-[var(--c-texto)] mb-0.5">Peças recusadas retiradas do Zen em {formatarData(pedido.recusadas_retiradas_em)}</p>
          {(itensRetirados.length ? itensRetirados : codigosRecusados.map(c => ({ codigo: c }))).map((it, i) => (
            <p key={i} className="line-through">
              <span className="font-mono mr-1">{it.codigo}</span>{it.descricao} {it.quantidade != null && `(${it.quantidade})`}
            </p>
          ))}
        </div>
      )}
      {itensAlterados && (
        <div className="text-[11px] rounded-lg px-2 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400">
          <p className="font-semibold">Peças alteradas no Pipefy</p>
          <p className="text-[var(--c-suave)]">O pedido no Zen ainda está com as peças antigas.</p>
        </div>
      )}
      {pedido.zen_erro && (
        <p className="text-[11px] text-red-400 bg-red-500/10 rounded-lg px-2 py-1 break-words">ZenERP: {pedido.zen_erro}</p>
      )}
      {pedido.pipefy_card_id && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <Info rotulo="CNPJ" valor={formatarDoc(pedido.cliente_cnpj)} />
          <Info rotulo="NS de entrada" valor={pedido.ns_entrada} />
          <Info rotulo="Técnico" valor={pedido.tecnico} />
          <Info rotulo="Frete por conta" valor={pedido.frete_por_conta} />
          <Info rotulo="Entregue por" valor={pedido.entregue_por} />
        </dl>
      )}
      {itens.length > 0 && (
        <div className="rounded-lg border border-[var(--c-borda)] overflow-hidden">
          <table className="w-full text-xs table-fixed">
            <thead className="bg-[var(--c-fundo)] text-[var(--c-suave)]">
              <tr>
                <th className="text-left font-medium px-2 py-1">Peça</th>
                <th className="text-right font-medium px-1.5 py-1 w-9">Qtd</th>
                <th className="text-right font-medium px-2 py-1 w-[5.5rem]">Valor</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((it, i) => (
                <tr key={i} className={`border-t border-[var(--c-borda)] ${
                  !pedido.recusadas_retiradas_em && recusadosSet.has(String(it.codigo || '').trim().toUpperCase())
                    ? 'text-red-400 line-through' : 'text-[var(--c-texto)]'}`}>
                  <td className="px-2 py-1 break-words">
                    {it.codigo && <span className="font-mono text-[var(--c-destaque)] mr-1 break-all">{it.codigo}</span>}
                    {it.descricao}
                  </td>
                  <td className="px-1.5 py-1 text-right">{it.quantidade ?? '—'}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">{brl(it.valor_unitario)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--c-borda)] text-[var(--c-texto)] font-semibold">
                <td className="px-2 py-1" colSpan={2}>Total peças</td>
                <td className="px-2 py-1 text-right whitespace-nowrap">{brl(totalItens)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {pedido.observacoes && <p className="text-xs text-[var(--c-suave)]">{pedido.observacoes}</p>}
      <p className="text-[11px] text-[var(--c-suave)]">{formatarData(pedido.created_at)} · por {pedido.criado_por_nome || '—'}</p>

      {ehAdmin && (
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--c-suave)]">
          <MoveRight size={12} className="shrink-0" />
          <select value="" disabled={movendoPara} onChange={e => moverPara(e.target.value)}
            className="flex-1 min-w-0 bg-[var(--c-fundo)] border border-[var(--c-borda)] rounded-lg px-1.5 py-1 text-[11px] text-[var(--c-texto)] disabled:opacity-40">
            <option value="">{movendoPara ? 'Movendo…' : 'Mover para… (admin)'}</option>
            {COLUNAS.filter(c => c.status !== pedido.status).map(c => <option key={c.status} value={c.status}>{c.titulo}</option>)}
          </select>
        </label>
      )}
      {podeEditar && (
      <div className="flex gap-2 pt-1">
        {ehAdmin && podeAtualizarItens && (itensAlterados || !precisaRetirar) && (
          <button onClick={atualizarItensZen} disabled={atualizandoItens}
            title="Acertar o pedido no Zen com as peças atuais do card"
            className={`flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 px-2.5 rounded-lg disabled:opacity-40 ${
              itensAlterados ? 'flex-1 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
              : 'text-[var(--c-suave)] hover:text-[var(--c-texto)] hover:bg-[var(--c-borda)]'}`}>
            {atualizandoItens ? 'Atualizando no Zen...' : <><PackageCheck size={13} /> {itensAlterados ? 'Atualizar peças no Zen' : 'Peças no Zen'}</>}
          </button>
        )}
        {precisaRetirar && (
          <button onClick={retirarRecusadas} disabled={retirando || codigosRecusados.length === 0}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 disabled:opacity-40">
            {retirando ? 'Retirando no Zen...' : <><Scissors size={13} /> Retirar peças recusadas no Zen</>}
          </button>
        )}
        {proxima && !(STATUS_SO_ADMIN.includes(pedido.status) && !ehAdmin) && (
          <button onClick={avancar} disabled={mudando}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg bg-[var(--c-destaque)]/15 text-[var(--c-destaque)] hover:bg-[var(--c-destaque)]/25 disabled:opacity-40">
            {mudando ? (proxima.status === 'separando' ? 'Criando pedido no Zen...' : proxima.status === 'finalizado' ? 'Finalizando no Zen...' : 'Movendo...') : <>Mover p/ {proxima.titulo} <ArrowRight size={13} /></>}
          </button>
        )}
        <button onClick={cancelar} disabled={cancelando}
          title={pedido.status === 'aprovado_recusado' && pedido.zen_pedido_id ? 'Cancelar e excluir o pedido no Zen' : 'Cancelar'}
          className="p-1.5 rounded-lg text-[var(--c-suave)] hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40">
          {cancelando ? <span className="block w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <Ban size={14} />}
        </button>
      </div>
      )}
    </div>
  );
}

// "123, 456\n789" -> ['123', '456', '789'] (mesma regra do backend)
function separarCodigos(texto) {
  return [...new Set(String(texto || '').split(/[\s,;|]+/).map(c => c.trim().toUpperCase()).filter(Boolean))];
}

function Info({ rotulo, valor }) {
  return (
    <div className="min-w-0">
      <dt className="text-[var(--c-suave)]">{rotulo}</dt>
      <dd className="text-[var(--c-texto)] truncate" title={valor || ''}>{valor || '—'}</dd>
    </div>
  );
}
