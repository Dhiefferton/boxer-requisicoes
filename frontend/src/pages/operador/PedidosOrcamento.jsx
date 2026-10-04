// ============================================================
// pages/operador/PedidosOrcamento.jsx
// ============================================================
// V1: estrutura básica (3 colunas: Solicitação -> Separando ->
// Finalizado). Ainda sem puxar dados do Pipefy nem gerar pedido no
// ZenERP — vem nos próximos passos.

import { useState, useEffect } from 'react';
import { ArrowRight, RefreshCw, Ban, FileText, DownloadCloud, ExternalLink, ChevronDown, ChevronRight, Archive } from 'lucide-react';
import { pedidosOrcamentoService } from '../../services/api';
import { Spinner } from '../../components/ui';

const COLUNAS = [
  { status: 'solicitacao', titulo: 'Solicitado',  resumo: 'Solicitados',  cor: 'border-blue-500/40',   badge: 'bg-blue-500/15 text-blue-400' },
  { status: 'separando',   titulo: 'Em Separação', resumo: 'Em Separação', cor: 'border-amber-500/40',  badge: 'bg-amber-500/15 text-amber-400' },
  { status: 'separado',    titulo: 'Separado',    resumo: 'Separados',    cor: 'border-purple-500/40', badge: 'bg-purple-500/15 text-purple-400' },
  { status: 'aprovado_recusado', titulo: 'Aprovado/Recusado', resumo: 'Aprovados/Recusados', cor: 'border-cyan-500/40', badge: 'bg-cyan-500/15 text-cyan-400' },
  { status: 'finalizado',  titulo: 'Finalizado',  resumo: 'Finalizados',  cor: 'border-green-500/40',  badge: 'bg-green-500/15 text-green-400' },
];

const ZEN_APP_URL = 'https://boxer.zenerp.app.br';

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
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [msgSync, setMsgSync] = useState('');

  async function carregar() {
    try {
      const { data } = await pedidosOrcamentoService.listar();
      setPedidos(data.pedidos);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  const ativos = pedidos.filter(p => p.status !== 'finalizado' && p.status !== 'cancelado').length;

  async function sincronizarPipefy() {
    setSincronizando(true);
    setMsgSync('');
    try {
      const { data } = await pedidosOrcamentoService.sincronizarPipefy();
      setMsgSync(`Pipefy: ${data.total} card(s) em "Requisitar Peças" — ${data.novos} novo(s), ${data.atualizados} atualizado(s). Zen: ${data.separados || 0} separado(s). Aprovado/Recusado: ${data.aprovadosRecusados || 0}.`);
      await carregar();
    } catch (err) {
      setMsgSync(err.response?.data?.erro || 'Erro ao sincronizar com o Pipefy.');
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* ── Cabeçalho ───────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-[#e8eaf0]">Pedidos de Orçamento</h1>
          <p className="text-sm text-[#8b91a8] mt-0.5">
            {ativos} orçamento{ativos !== 1 ? 's' : ''} ativo{ativos !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={sincronizarPipefy} disabled={sincronizando}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold
              bg-[#4f6ef7]/15 text-[#4f6ef7] hover:bg-[#4f6ef7]/25 transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed">
            <DownloadCloud size={13} className={sincronizando ? 'animate-pulse' : ''} />
            {sincronizando ? 'Atualizando...' : 'Atualizar'}
          </button>
          <button onClick={carregar} disabled={loading} title="Recarregar"
            className="p-2 rounded-xl text-[#8b91a8] hover:text-[#e8eaf0] hover:bg-[#2e3347] transition-colors">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Cards de resumo ──────────────────────────────── */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {COLUNAS.map(({ status, resumo }) => (
          <div key={status} className="bg-[#1a1d27] border border-[#2e3347] rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-[#e8eaf0]">{pedidos.filter(p => p.status === status).length}</p>
            <p className="text-[10px] text-[#8b91a8] mt-0.5">{resumo}</p>
          </div>
        ))}
      </div>

      {msgSync && <p className="text-xs text-[#8b91a8] bg-[#1a1d27] border border-[#2e3347] rounded-xl px-3 py-2">{msgSync}</p>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="text-[#4f6ef7]" /></div>
      ) : (
        <div className="grid md:grid-cols-3 xl:grid-cols-5 gap-4">
          {COLUNAS.map(({ status, titulo, cor, badge }) => {
            const itens = pedidos.filter(p => p.status === status);
            return (
              <Coluna key={status} titulo={titulo} cor={cor} badge={badge} total={itens.length} arquivada={status === 'finalizado'}>
                {itens.length === 0 ? (
                  <div className="border-2 border-dashed border-[#2e3347] rounded-2xl py-8 text-center">
                    <p className="text-xs text-[#8b91a8]">Sem pedidos</p>
                  </div>
                ) : (
                  itens.map(pedido => (
                    <CardPedido key={pedido.id} pedido={pedido} onAtualizar={carregar} />
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

function Coluna({ titulo, cor, badge, total, arquivada = false, children }) {
  // Finalizado: arquivado — lista fechada, abre na seta
  const [aberta, setAberta] = useState(!arquivada);
  const pilula = <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${badge}`}>{titulo}</span>;
  return (
    <div className="space-y-2">
      <div className={`flex items-center justify-between px-3 py-2 rounded-xl border ${cor} bg-[#1a1d27]`}>
        {arquivada ? (
          <button onClick={() => setAberta(v => !v)} className="flex items-center gap-1.5 text-[#8b91a8] hover:text-[#e8eaf0]">
            {aberta ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            <Archive size={13} />
            {pilula}
          </button>
        ) : (
          <div className="flex items-center gap-2">{pilula}</div>
        )}
        <span className="text-xs font-bold text-[#8b91a8]">{total}</span>
      </div>
      {aberta ? (
        <div className="space-y-2">{children}</div>
      ) : (
        <button onClick={() => setAberta(true)}
          className="w-full text-xs text-[#8b91a8] py-3 text-center rounded-2xl border-2 border-dashed border-[#2e3347] hover:text-[#e8eaf0]">
          {total} arquivado(s) — clique para ver
        </button>
      )}
    </div>
  );
}

function CardPedido({ pedido, onAtualizar }) {
  const [mudando, setMudando] = useState(false);
  const itens = pedido.itens || [];
  const totalItens = itens.reduce((t, it) => t + (Number(it.quantidade) || 0) * (Number(it.valor_unitario) || 0), 0);
  const indiceAtual = COLUNAS.findIndex(c => c.status === pedido.status);
  // Automáticos (via "Atualizar"): Separando -> Separado (reserva finalizada no Zen)
  // e -> Aprovado/Recusado (fase do card no Pipefy)
  const proxima = ['separando', 'separado'].includes(pedido.status) ? null : COLUNAS[indiceAtual + 1];
  const aprovacao = String(pedido.aprovacao || '').toLowerCase();

  async function avancar() {
    setMudando(true);
    try {
      await pedidosOrcamentoService.mover(pedido.id, proxima.status);
      onAtualizar();
    } catch (err) { alert(err.response?.data?.erro || 'Erro ao mover.'); onAtualizar(); }
    finally { setMudando(false); }
  }

  async function cancelar() {
    if (!confirm('Cancelar este pedido de orçamento?')) return;
    try {
      await pedidosOrcamentoService.cancelar(pedido.id);
      onAtualizar();
    } catch (err) { alert(err.response?.data?.erro || 'Erro ao cancelar.'); }
  }

  return (
    <div className="p-3 rounded-xl border border-[#2e3347] bg-[#1a1d27] space-y-2">
      <div className="flex items-center gap-1.5">
        <FileText size={13} className="text-[#4f6ef7] shrink-0" />
        <p className="text-sm text-[#e8eaf0] font-medium flex-1">{pedido.cliente_nome || pedido.referencia}</p>
        {pedido.pipefy_url && (
          <a href={pedido.pipefy_url} target="_blank" rel="noreferrer" title="Abrir no Pipefy"
            className="text-[#8b91a8] hover:text-[#4f6ef7]"><ExternalLink size={13} /></a>
        )}
      </div>
      {pedido.aprovacao && (
        <span className={`inline-block mr-1 text-[10px] font-bold uppercase rounded px-1.5 py-0.5 ${
          aprovacao.startsWith('aprov') ? 'text-green-300 bg-green-500/20'
          : aprovacao.startsWith('recus') ? 'text-red-300 bg-red-500/20'
          : 'text-[#8b91a8] bg-[#2e3347]'}`}>{pedido.aprovacao}</span>
      )}
      {pedido.pipefy_card_id && (
        <span className="inline-block text-[10px] font-semibold text-[#4f6ef7] bg-[#4f6ef7]/10 rounded px-1.5 py-0.5">Pipefy #{pedido.pipefy_card_id}</span>
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
        <div className="rounded-lg border border-[#2e3347] overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-[#0f1117] text-[#8b91a8]">
              <tr>
                <th className="text-left font-medium px-2 py-1">Peça</th>
                <th className="text-right font-medium px-2 py-1">Qtd</th>
                <th className="text-right font-medium px-2 py-1">Valor</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((it, i) => (
                <tr key={i} className="border-t border-[#2e3347] text-[#e8eaf0]">
                  <td className="px-2 py-1">
                    {it.codigo && <span className="font-mono text-[#4f6ef7] mr-1">{it.codigo}</span>}
                    {it.descricao}
                  </td>
                  <td className="px-2 py-1 text-right">{it.quantidade ?? '—'}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">{brl(it.valor_unitario)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#2e3347] text-[#e8eaf0] font-semibold">
                <td className="px-2 py-1" colSpan={2}>Total peças</td>
                <td className="px-2 py-1 text-right whitespace-nowrap">{brl(totalItens)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {pedido.observacoes && <p className="text-xs text-[#8b91a8]">{pedido.observacoes}</p>}
      <p className="text-[11px] text-[#8b91a8]">{formatarData(pedido.created_at)} · por {pedido.criado_por_nome || '—'}</p>

      <div className="flex gap-2 pt-1">
        {proxima && (
          <button onClick={avancar} disabled={mudando}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg bg-[#4f6ef7]/15 text-[#4f6ef7] hover:bg-[#4f6ef7]/25 disabled:opacity-40">
            {mudando ? (proxima.status === 'separando' ? 'Criando pedido no Zen...' : proxima.status === 'finalizado' ? 'Finalizando no Zen...' : 'Movendo...') : <>Mover p/ {proxima.titulo} <ArrowRight size={13} /></>}
          </button>
        )}
        <button onClick={cancelar} title="Cancelar" className="p-1.5 rounded-lg text-[#8b91a8] hover:text-red-400 hover:bg-red-500/10">
          <Ban size={14} />
        </button>
      </div>
    </div>
  );
}

function Info({ rotulo, valor }) {
  return (
    <div className="min-w-0">
      <dt className="text-[#8b91a8]">{rotulo}</dt>
      <dd className="text-[#e8eaf0] truncate" title={valor || ''}>{valor || '—'}</dd>
    </div>
  );
}
