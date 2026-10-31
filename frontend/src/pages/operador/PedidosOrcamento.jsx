// ============================================================
// pages/operador/PedidosOrcamento.jsx
// ============================================================
// V1: estrutura básica (3 colunas: Solicitação -> Separando ->
// Finalizado). Ainda sem puxar dados do Pipefy nem gerar pedido no
// ZenERP — vem nos próximos passos.

import { useState, useEffect, useRef } from 'react';
import { Settings, ArrowRight, RefreshCw, Ban, FileText, DownloadCloud, ExternalLink, ChevronDown, ChevronRight, Archive, Scissors, PackageCheck, Activity, History, Search, X, ListTree, MoveRight, EyeOff, Eye, Plus } from 'lucide-react';
import { pedidosOrcamentoService } from '../../services/api';
import { Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { podeEditarOrcamentos } from '../../utils/acessoOrcamentos';
import PainelMovimentacao from '../../components/operador/PainelMovimentacao';
import { carregarEstrutura, valorLista } from '../../components/operador/CamposCardOrcamento';
import CardAbertoOrcamento from '../../components/operador/CardAbertoOrcamento';
import NovoCardOrcamento from '../../components/operador/NovoCardOrcamento';
import { FaixaFotosCard } from '../../components/operador/FotosOrcamento';
import { COLUNAS_ORCAMENTO as COLUNAS, STATUS_SO_ADMIN, aplicarConfigOrcamento } from '../../utils/fasesOrcamento';
import ConfigOrcamento from '../../components/operador/ConfigOrcamento';

// Colunas: fases do Pipefy + Em Separação / Separado (utils/fasesOrcamento.js).
// Colunas novas só o admin move; o fluxo de sempre continua igual:
// Requisitar Peças -> Em Separação (cria no Zen). Concluído - Não Liberado (nota no Zen) segue o Pipefy.
const PROXIMA = { solicitacao: 'separando' };

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
  const [novoCard, setNovoCard] = useState(false);
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

  // Sincronização automática com o Pipefy/Zen: ao abrir a tela, a cada 30s com a
  // tela visível e ao voltar para a aba. Quem só visualiza recarrega a lista.
  const ultimaSyncRef = useRef(0);
  const syncRodandoRef = useRef(false);
  const falhasSyncRef = useRef(0);
  async function sincronizarPipefy() {
    if (syncRodandoRef.current) return;
    syncRodandoRef.current = true;
    setSincronizando(true);
    try {
      if (podeEditar) {
        await pedidosOrcamentoService.sincronizarPipefy();
        setMsgSync('');
      }
      await carregar();
      ultimaSyncRef.current = Date.now();
      falhasSyncRef.current = 0;
    } catch (err) {
      // Falha isolada (rede/lentidão) é silenciosa; só avisa se falhar 3 vezes seguidas
      falhasSyncRef.current += 1;
      if (falhasSyncRef.current >= 3) setMsgSync(err.response?.data?.erro || 'Não está conseguindo atualizar a tela (Zen) — tentando de novo a cada 30s.');
      await carregar();
    } finally {
      syncRodandoRef.current = false;
      setSincronizando(false);
    }
  }
  useEffect(() => {
    carregar();
    sincronizarPipefy();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') sincronizarPipefy(); }, 30000);
    const aoVoltar = () => { if (document.visibilityState === 'visible' && Date.now() - ultimaSyncRef.current > 15000) sincronizarPipefy(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', aoVoltar); };
  }, []);

  const ativos = pedidos.filter(p => !['finalizado', 'cancelado', 'sucata'].includes(p.status)).length;

  // Configuração do admin: colunas (nome, cor, ordem, colunas novas) e campos
  const [verConfig, setVerConfig] = useState(false);   // false | true | chave da coluna
  const [, setVersaoConfig] = useState(0);
  useEffect(() => {
    pedidosOrcamentoService.config()
      .then(({ data }) => { aplicarConfigOrcamento(data); setVersaoConfig(v => v + 1); })
      .catch(() => { /* sem configuração: colunas padrão */ });
  }, []);

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
            <button onClick={() => setNovoCard(true)} title="Criar card aqui no B-Requisições"
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--c-destaque)] text-white hover:bg-[var(--c-destaque-h)]">
              <Plus size={13} /> Novo card
            </button>
          )}
          {usuario?.perfil === 'admin' && (
            <button onClick={() => setVerConfig(true)} title="Configurar colunas e campos da tela"
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold
                bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto)] hover:border-[var(--c-destaque)] transition-colors">
              <Settings size={13} /> Configurar
            </button>
          )}
          {usuario?.perfil === 'admin' && (
            <button onClick={() => setVerMovimentacao(true)} title="Relatório de movimentação"
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold
                bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto)] hover:border-[var(--c-destaque)] transition-colors">
              <Activity size={13} /> Movimentação
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

      {verConfig && usuario?.perfil === 'admin' && (
        <ConfigOrcamento colunaInicial={typeof verConfig === 'string' ? verConfig : null} onFechar={() => setVerConfig(false)} onSalvo={(data) => { aplicarConfigOrcamento(data); setVersaoConfig(v => v + 1); }} />
      )}
      {verMovimentacao && usuario?.perfil === 'admin' && <PainelMovimentacao onFechar={() => setVerMovimentacao(false)} />}
      {novoCard && usuario?.perfil === 'admin' && <NovoCardOrcamento onFechar={() => setNovoCard(false)} onCriado={() => { setNovoCard(false); carregar(); }} />}

      {msgSync && <p className="text-xs text-amber-400 bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-xl px-3 py-2">{msgSync}</p>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="text-[var(--c-destaque)]" /></div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2 xl:flex-1 xl:min-h-0">
          {COLUNAS.map(({ status, titulo, cor, badge, arquivada, admin, hex }) => {
            const itens = pedidos.filter(p => p.status === status && combinaBusca(p, busca));
            // Requisitar Peças: o card vai direto para Em Separação (pedido criado no Zen sozinho);
            // a coluna só aparece quando há card nela (card criado aqui ou parado por erro do Zen)
            if ((ocultarVazias || status === 'solicitacao') && !itens.length) return null;
            return (
              <Coluna key={`${status}${busca ? '-busca' : ''}`} titulo={titulo} cor={cor} badge={badge} hex={hex} total={itens.length} arquivada={arquivada && !busca} soAdmin={admin}
                onConfigurar={usuario?.perfil === 'admin' ? () => setVerConfig(status) : undefined}>
                {itens.length === 0 ? (
                  <div className="border-2 border-dashed border-[var(--c-borda)] rounded-2xl py-8 text-center">
                    <p className="text-xs text-[var(--c-suave)]">{busca ? 'Nada encontrado' : 'Sem pedidos'}</p>
                  </div>
                ) : (
                  itens.map(pedido => (
                    <CardPedido key={pedido.id} pedido={pedido} onAtualizar={carregar} podeEditar={podeEditar} ehAdmin={usuario?.perfil === 'admin'} onConfigurarColuna={(k) => setVerConfig(k)} />
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

function Coluna({ titulo, cor, badge, hex, total, arquivada = false, soAdmin = false, onConfigurar, children }) {
  // Finalizado: arquivado — lista fechada, abre na seta
  const [aberta, setAberta] = useState(!arquivada);
  // Cor configurada pelo admin (hex) ou a padrão (classes)
  const pilula = hex
    ? <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: `${hex}26`, color: hex }}>{titulo}</span>
    : <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${badge}`}>{titulo}</span>;
  return (
    <div className="space-y-2 w-[17.5rem] shrink-0 xl:min-h-0 xl:flex xl:flex-col">
      <div className={`flex items-center justify-between px-3 py-2 rounded-xl border ${hex ? '' : cor} bg-[var(--c-superficie)] xl:shrink-0`} style={hex ? { borderColor: `${hex}66` } : undefined}>
        {arquivada ? (
          <button onClick={() => setAberta(v => !v)} className="flex items-center gap-1.5 text-[var(--c-suave)] hover:text-[var(--c-texto)]">
            {aberta ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            <Archive size={13} />
            {pilula}
          </button>
        ) : (
          <div className="flex items-center gap-2" title={soAdmin ? 'Coluna do Pipefy — só o admin move cards aqui' : undefined}>{pilula}</div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-[var(--c-suave)]">{total}</span>
          {onConfigurar && (
            <button onClick={onConfigurar} title="Editar esta coluna (nome, cor, campos)"
              className="p-1 rounded-lg text-[var(--c-suave)] hover:text-[var(--c-destaque)] hover:bg-[var(--c-borda)] transition-colors">
              <Settings size={13} />
            </button>
          )}
        </div>
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

function CardPedido({ pedido, onAtualizar, podeEditar, ehAdmin, onConfigurarColuna }) {
  const [mudando, setMudando] = useState(false);
  const itens = pedido.itens || [];
  const totalItens = itens.reduce((t, it) => t + (Number(it.quantidade) || 0) * (Number(it.valor_unitario) || 0), 0);
  // Automáticos (sincronização a cada 30s): Separando -> Separado (reserva finalizada no Zen)
  // e -> Aprovado/Recusado (fase do card no Pipefy)
  const aprovacao = String(pedido.aprovacao || '').toLowerCase();
  // Aprovado Parcial: as peças do campo "Peças Recusadas" saem do pedido no Zen
  const parcial = aprovacao.includes('parcial');
  const codigosRecusados = separarCodigos(pedido.pecas_recusadas);
  const recusadosSet = new Set(codigosRecusados);
  const precisaRetirar = parcial && ['aprovado_recusado', 'em_manutencao', 'nao_liberado', 'liberado_saida'].includes(pedido.status) && !pedido.recusadas_retiradas_em;
  // Fase atual do card no Pipefy, quando é diferente da coluna daqui
  const colunaAtual = COLUNAS.find(c => c.status === pedido.status);
  // Pipefy desligado: a fase do Pipefy não é mais acompanhada (sem a etiqueta "No Pipefy")
  const faseDiferente = null;
  const itensRetirados = Array.isArray(pedido.itens_recusados) ? pedido.itens_recusados : [];
  const [retirando, setRetirando] = useState(false);
  const proxima = precisaRetirar || !PROXIMA[pedido.status] ? null : COLUNAS.find(c => c.status === PROXIMA[pedido.status]);
  const [movendoPara, setMovendoPara] = useState(false);
  // Admin: mover para qualquer coluna
  async function moverPara(status) {
    if (!status || status === pedido.status) return;
    const destino = COLUNAS.find(c => c.status === status);
    const avisoZen = (status === 'separando' && pedido.status === 'solicitacao') || status === 'solicitacao' ? '\n\nIsso cria o pedido de venda e a ordem de separação no Zen (o card vai para Em Separação).'
      : ['nao_liberado', 'finalizado'].includes(status) && pedido.zen_ordem_separacao_id && !pedido.zen_nota_id
        ? '\n\nIsso fecha o romaneio e cria a nota fiscal no Zen.' : '';
    // Card criado aqui: avisa os campos obrigatórios da fase atual ainda vazios (como no Pipefy)
    let avisoCampos = '';
    if (!pedido.pipefy_card_id && colunaAtual?.faseId) {
      try {
        const fases = await carregarEstrutura();
        const valores = Object.fromEntries((pedido.pipefy_campos || []).filter(c => c?.id).map(c => [c.id, c.valor]));
        const faltando = (fases.find(f => f.faseId === colunaAtual.faseId)?.campos || [])
          .filter(c => c.obrigatorio && c.tipo !== 'attachment' && !valorLista(valores[c.id]).length);
        if (faltando.length) avisoCampos = `\n\nCampos obrigatórios desta fase ainda vazios: ${faltando.slice(0, 12).map(c => c.rotulo).join(', ')}${faltando.length > 12 ? '…' : ''}`;
      } catch { /* sem estrutura: segue */ }
    }
    if (!confirm(`Mover este card para "${destino?.titulo || status}"?${avisoZen}${avisoCampos}`)) return;
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

  const [aberto, setAberto] = useState(false);
  const parar = (e) => e.stopPropagation();

  // Etiquetas do Zen / Pipefy (quadro e card aberto)
  const tagsZen = (
    <>
      {faseDiferente && (
        <span title={pedido.zen_erro ? 'Não seguiu o Pipefy por causa do erro do Zen — corrija que ele segue na próxima sincronização (até 30s)'
          : pedido.status === 'separando' ? 'Etapa do Zen — segue o Pipefy quando a separação terminar' : undefined}
          className="inline-block mr-1 text-[10px] font-semibold text-amber-300 bg-amber-500/15 rounded px-1.5 py-0.5">No Pipefy: {faseDiferente}</span>
      )}
      {pedido.zen_pedido_id && (
        <a href={`${ZEN_APP_URL}/sale/sale?q=id==${pedido.zen_pedido_id}`} target="_blank" rel="noreferrer" title="Abrir pedido no Zen" onClick={parar}
          className="inline-flex items-center gap-1 mr-1 text-[10px] font-semibold text-green-400 bg-green-500/10 hover:bg-green-500/20 rounded px-1.5 py-0.5">
          Pedido Zen #{pedido.zen_pedido_id} <ExternalLink size={10} />
        </a>
      )}
      {pedido.zen_ordem_separacao_id && (
        <a href={`${ZEN_APP_URL}/material/pickingOrder?q=id==${pedido.zen_ordem_separacao_id}`} target="_blank" rel="noreferrer" title="Abrir ordem de separação no Zen" onClick={parar}
          className="inline-flex items-center gap-1 mr-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded px-1.5 py-0.5">
          Ordem de separação #{pedido.zen_ordem_separacao_id} <ExternalLink size={10} />
        </a>
      )}
      {pedido.zen_nota_id && (
        <a href={`${ZEN_APP_URL}/fiscal/outgoingInvoice.html?q=id==${pedido.zen_nota_id}`} target="_blank" rel="noreferrer" title="Abrir nota fiscal no Zen" onClick={parar}
          className="inline-flex items-center gap-1 mr-1 text-[10px] font-semibold text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 rounded px-1.5 py-0.5">
          Nota fiscal #{pedido.zen_nota_id} <ExternalLink size={10} />
        </a>
      )}
    </>
  );
  const alertas = (
    <>
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
    </>
  );
  const tabelaPecas = itens.length > 0 && (
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
  );

  // Ações do Zen (card aberto, lado direito)
  const acoesZen = [];
  if (podeEditar && ehAdmin && podeAtualizarItens && (itensAlterados || !precisaRetirar)) {
    acoesZen.push({ id: 'zen', onClick: atualizarItensZen, ocupado: atualizandoItens, alerta: itensAlterados,
      texto: itensAlterados ? 'Atualizar peças no Zen' : 'Peças no Zen', textoOcupado: 'Atualizando no Zen…' });
  }
  if (podeEditar && precisaRetirar && codigosRecusados.length) {
    acoesZen.push({ id: 'retirar', onClick: retirarRecusadas, ocupado: retirando, alerta: true,
      texto: 'Retirar peças recusadas no Zen', textoOcupado: 'Retirando no Zen…' });
  }
  const temPecas = (pedido.itens || []).some(i => i?.codigo && Number(i.quantidade) > 0);
  const podeAvancar = !!proxima && !(proxima.status === 'separando' && !temPecas);
  const motivoSemAvancar = 'Sem peças — preencha as peças nos campos do card para ir para Em Separação.';

  return (
    <>
    <div onClick={() => setAberto(true)} title="Abrir card"
      className="p-3 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] space-y-2 min-w-0 break-words cursor-pointer hover:border-[var(--c-borda-forte)] transition-colors">
      <div className="flex items-center gap-1.5">
        <FileText size={13} className="text-[var(--c-destaque)] shrink-0" />
        <p className="text-sm text-[var(--c-texto)] font-medium flex-1">{pedido.cliente_nome || pedido.referencia}</p>
        {pedido.pipefy_url && (
          <a href={pedido.pipefy_url} target="_blank" rel="noreferrer" title="Abrir no Pipefy" onClick={parar}
            className="text-[var(--c-suave)] hover:text-[var(--c-destaque)]"><ExternalLink size={13} /></a>
        )}
      </div>
      {pedido.aprovacao && (
        <span className={`inline-block mr-1 text-[10px] font-bold uppercase rounded px-1.5 py-0.5 ${
          parcial ? 'text-amber-300 bg-amber-500/20'
          : aprovacao.startsWith('aprov') ? 'text-green-300 bg-green-500/20'
          : aprovacao.startsWith('recus') ? 'text-red-300 bg-red-500/20'
          : aprovacao.startsWith('não lib') || aprovacao.startsWith('nao lib') ? 'text-red-300 bg-red-500/20'
          : 'text-[var(--c-suave)] bg-[var(--c-borda)]'}`}>{pedido.aprovacao}</span>
      )}
      {pedido.pipefy_card_id && (
        <span className="inline-block mr-1 text-[10px] font-semibold text-[var(--c-destaque)] bg-[var(--c-destaque)]/10 rounded px-1.5 py-0.5">Pipefy #{pedido.pipefy_card_id}</span>
      )}
      {!pedido.pipefy_card_id && (
        <span className="inline-block mr-1 text-[10px] font-semibold text-emerald-300 bg-emerald-500/15 rounded px-1.5 py-0.5">Criado no B-Requisições</span>
      )}
      {tagsZen}
      {alertas}
      <div onClick={parar}><FaixaFotosCard pedido={pedido} onVerTodas={() => setAberto(true)} /></div>
      {(pedido.pipefy_card_id || pedido.cliente_cnpj || pedido.ns_entrada || pedido.tecnico) && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <Info rotulo="CNPJ" valor={formatarDoc(pedido.cliente_cnpj)} />
          <Info rotulo="NS de entrada" valor={pedido.ns_entrada} />
          <Info rotulo="Técnico" valor={pedido.tecnico} />
          <Info rotulo="Frete por conta" valor={pedido.frete_por_conta} />
          <Info rotulo="Entregue por" valor={pedido.entregue_por} />
        </dl>
      )}
      {tabelaPecas}
      {pedido.observacoes && <p className="text-xs text-[var(--c-suave)]">{pedido.observacoes}</p>}
      <p className="text-[11px] text-[var(--c-suave)]">{formatarData(pedido.created_at)} · por {pedido.criado_por_nome || '—'}</p>
      {(itensAlterados || precisaRetirar) && podeEditar && (
        <p className="text-[11px] font-semibold text-amber-400">Abra o card para resolver no Zen.</p>
      )}
    </div>

    {aberto && (
      <CardAbertoOrcamento pedido={pedido} ehAdmin={ehAdmin} podeEditar={podeEditar}
        onFechar={() => setAberto(false)} onAtualizar={onAtualizar}
        resumo={(tagsZen || alertas || tabelaPecas) && (
          <div className="space-y-2">
            <div>{tagsZen}</div>
            {alertas}
            {tabelaPecas}
          </div>
        )}
        moverPara={moverPara} avancar={avancar} proxima={proxima} mudando={mudando} movendoPara={movendoPara}
        podeAvancar={podeAvancar} motivoSemAvancar={motivoSemAvancar}
        cancelar={cancelar} cancelando={cancelando} acoesZen={acoesZen}
        onConfigurarMover={ehAdmin && onConfigurarColuna ? () => { setAberto(false); onConfigurarColuna(pedido.status); } : null}
        onHistorico={ehAdmin ? () => setVerHistorico(true) : null} />
    )}
    {ehAdmin && verHistorico && (
      <PainelMovimentacao pedidoInicial={{ id: pedido.id, nome: pedido.cliente_nome || pedido.referencia }}
        onFechar={() => setVerHistorico(false)} />
    )}
    </>
  );
}

// "123, 456\n789" -> ['123', '456', '789'] (mesma regra do backend)
function separarCodigos(texto) {
  // "Peças Recusadas" é campo numérico no Pipefy: os códigos vêm separados por ponto (402086.701894)
  return [...new Set(String(texto || '').split(/[\s,;|/.]+/).map(c => c.trim().toUpperCase()).filter(Boolean))];
}

function Info({ rotulo, valor }) {
  return (
    <div className="min-w-0">
      <dt className="text-[var(--c-suave)]">{rotulo}</dt>
      <dd className="text-[var(--c-texto)] truncate" title={valor || ''}>{valor || '—'}</dd>
    </div>
  );
}
