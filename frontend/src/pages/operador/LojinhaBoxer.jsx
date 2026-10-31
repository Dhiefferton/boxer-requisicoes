// ============================================================
// pages/operador/LojinhaBoxer.jsx — Lojinha Boxer
// ============================================================
// Quadro igual ao de Orçamentos: colunas configuráveis (Configurar, só admin),
// card que abre em 3 partes (dados e fases anteriores | fase atual | mover),
// campos por coluna, fotos e histórico de movimentação.
// Entrada: cliente (CPF/CNPJ buscado no Zen) e se é Assistente Autorizado,
// data, produtos (SKU do catálogo, só com saldo, com preço), nº do pedido
// da lojinha, vendedora, envio e valor do frete.
// Ao salvar, o sistema cria o pedido no Zen até a ordem de separação.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { Search, Check, RefreshCw, Truck, Package, Mail, Building2, Plus, X, Trash2, User, BadgeCheck, AlertTriangle, ExternalLink, Settings, Activity, History, ArrowRight, ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { lojinhaService } from '../../services/api';
import { Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import ConfigOrcamento, { campoDaConfig } from '../../components/operador/ConfigOrcamento';
import PainelMovimentacao from '../../components/operador/PainelMovimentacao';
import { FotosProvider, FaixaFotosCard, FotosCampo } from '../../components/operador/FotosOrcamento';
import { Editor, Valor, SO_LEITURA, valorLista } from '../../components/operador/CamposCardOrcamento';

const hojeISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const soDigitos = (v) => String(v || '').replace(/\D/g, '');

function mascararDocumento(v) {
  const d = soDigitos(v).slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
  }
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}

const fmtData = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—');
const fmtQtd = (n) => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const fmtR$ = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function numBR(v) {
  const t = String(v ?? '').trim().replace(/^R\$\s*/, '');
  if (!t) return NaN;
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
}
const ZEN_APP_URL = 'https://boxer.zenerp.app.br';
const linkZenPedido = (id) => `${ZEN_APP_URL}/sale/sale?q=id==${id}`;
const linkZenOrdem = (id) => `${ZEN_APP_URL}/material/pickingOrder?q=id==${id}`;
// Colunas (mesmo visual da tela de Orçamentos). Sem o Pipefy: criado o pedido no Zen
// (ordem de separação), vai sozinho para Em Separação; termina a separação no Zen,
// vai para Em Conferência. Daí em diante o pedido é movido na tela.
const COLUNAS = [
  { status: 'entrada',   inclui: ['entrada', 'liberacao'], titulo: 'Entrada',      cor: 'border-blue-500/40',   badge: 'bg-blue-500/15 text-blue-400' },
  { status: 'separacao', inclui: ['separacao'],            titulo: 'Em Separação', cor: 'border-purple-500/40', badge: 'bg-purple-500/15 text-purple-400' },
  { status: 'conferencia',  inclui: ['conferencia'],  titulo: 'Em Conferência',        cor: 'border-cyan-500/40',   badge: 'bg-cyan-500/15 text-cyan-400' },
  { status: 'teste_placas', inclui: ['teste_placas'], titulo: 'Em Teste de Placas',    cor: 'border-amber-500/40',  badge: 'bg-amber-500/15 text-amber-400' },
  { status: 'preparacao',   inclui: ['preparacao'],   titulo: 'Em Preparação (Exp.)',  cor: 'border-orange-500/40', badge: 'bg-orange-500/15 text-orange-400' },
  { status: 'finalizado',   inclui: ['finalizado'],   titulo: 'Finalizado',            cor: 'border-green-500/40',  badge: 'bg-green-500/15 text-green-400' },
];
const NO_PIPEFY = ['separacao', 'conferencia', 'teste_placas', 'preparacao', 'finalizado'];
const ITENS_POR_CARD = 7; // limite do Pipefy
const DESC_AUTORIZADO = 23; // % de desconto do Assistente Autorizado
const totalItens = (itens) => itens.reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.preco || 0), 0);
const valorDesconto = (itens, autorizado) => (autorizado ? Math.round(totalItens(itens) * DESC_AUTORIZADO) / 100 : 0);
const ICONE_ENVIO = { Sedex: Mail, PAC: Package, 'Próprio': Truck, Transportadora: Building2 };

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

const campo = 'w-full bg-[var(--c-fundo)] border border-[var(--c-borda)] text-[var(--c-texto)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[var(--c-destaque)]';
const rotulo = 'block text-xs text-[var(--c-suave)] mb-1.5';

// Fotos da Lojinha (mesmos componentes do Orçamento, com o serviço da Lojinha)
const SERVICO_FOTOS = {
  base: '/lojinha/fotos',
  imagem: (url) => lojinhaService.imagem(url),
  enviarFoto: (id, dados) => lojinhaService.enviarFoto(id, dados),
  excluirFoto: (fotoId) => lojinhaService.excluirFoto(fotoId),
};
const SERVICO_CONFIG = { config: () => lojinhaService.quadroConfig(), salvarConfig: (d) => lojinhaService.salvarQuadroConfig(d) };
const buscarMovimentos = (params) => lojinhaService.movimentos(params);

// Coluna do pedido na tela ('liberacao' aparece na Entrada)
const colunaDo = (p) => (['entrada', 'liberacao'].includes(p.status) ? 'entrada' : p.status);

// Colunas da tela: as da configuração (nome, cor, ordem, colunas novas) ou as padrão
function montarColunas(cfg) {
  if (!cfg?.colunas?.length) return COLUNAS.map(c => ({ ...c, admin: false, arquivada: false }));
  const padrao = new Map(COLUNAS.map(c => [c.status, c]));
  return cfg.colunas.map(c => ({
    ...(padrao.get(c.chave) || {}),
    status: c.chave, inclui: c.chave === 'entrada' ? ['entrada', 'liberacao'] : [c.chave],
    titulo: c.nome, hex: c.cor, admin: !!c.so_admin, arquivada: !!c.arquivada, zen: c.zen || null,
  }));
}

export default function LojinhaBoxer() {
  const { usuario } = useAuth();
  const ehAdmin = usuario?.perfil === 'admin';
  const [config, setConfig] = useState({ tipos_envio: ['Sedex', 'PAC', 'Próprio', 'Transportadora'], transportadoras: [], avisos_uf: {}, vendedoras: [], erro_vendedoras: null });
  const [pedidos, setPedidos] = useState(null);
  const [novo, setNovo] = useState(false);
  const [aviso, setAviso] = useState('');
  const [busca, setBusca] = useState('');
  const [cfg, setCfg] = useState(null);                 // colunas e campos (Configurar)
  const [verConfig, setVerConfig] = useState(false);     // false | true | chave da coluna
  const [verMov, setVerMov] = useState(false);
  const [historico, setHistorico] = useState(null);      // { id, nome }
  const [abertoId, setAbertoId] = useState(null);

  async function carregar() {
    try { const { data } = await lojinhaService.pedidos(); setPedidos(data.pedidos); }
    catch { setPedidos([]); }
  }
  useEffect(() => {
    lojinhaService.config().then(r => setConfig(c => ({ ...c, ...r.data }))).catch(() => {});
    lojinhaService.quadroConfig().then(r => setCfg(r.data)).catch(() => {});
    carregar();
    // Atualiza sozinho a cada minuto (separação do Zen)
    const t = setInterval(() => { if (!document.hidden) carregar(); }, 60000);
    return () => clearInterval(t);
  }, []);

  const lista = pedidos || [];
  const ativos = lista.filter(p => p.status !== 'finalizado').length;
  const colunas = montarColunas(cfg);
  const aberto = abertoId ? lista.find(p => p.id === abertoId) : null;
  const nomeStatus = Object.fromEntries(colunas.map(c => [c.status, c.titulo]));
  const corStatus = Object.fromEntries(colunas.map(c => [c.status, 'bg-[var(--c-borda)] text-[var(--c-texto)]']));

  return (
    <FotosProvider servico={SERVICO_FOTOS}>
    {/* Tela grande: travada na altura da janela e cada coluna rola sozinha (igual Orçamentos) */}
    <div className="space-y-5 xl:space-y-0 xl:flex xl:flex-col xl:gap-5 xl:h-[calc(100dvh-3.1rem)]">
      {/* ── Cabeçalho ───────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--c-texto)]">Lojinha Boxer</h1>
          <p className="text-sm text-[var(--c-suave)] mt-0.5">
            {ativos} pedido{ativos !== 1 ? 's' : ''} ativo{ativos !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-suave)]" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente, CNPJ, nº, peça…"
              className="w-56 sm:w-64 pl-8 pr-7 py-2 rounded-xl text-xs bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto)] focus:outline-none focus:border-[var(--c-destaque)]" />
            {busca && <button onClick={() => setBusca('')} title="Limpar" className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={12} /></button>}
          </div>
          <button onClick={() => { setNovo(true); setAviso(''); }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold
              bg-[var(--c-destaque)]/15 text-[var(--c-destaque)] hover:bg-[var(--c-destaque)]/25 transition-colors">
            <Plus size={13} /> Novo pedido
          </button>
          {ehAdmin && (
            <button onClick={() => setVerConfig(true)} title="Configurar colunas e campos da tela"
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto)] hover:border-[var(--c-destaque)] transition-colors">
              <Settings size={13} /> Configurar
            </button>
          )}
          {ehAdmin && (
            <button onClick={() => setVerMov(true)} title="Relatório de movimentação"
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto)] hover:border-[var(--c-destaque)] transition-colors">
              <Activity size={13} /> Movimentação
            </button>
          )}
          <button onClick={carregar} title="Recarregar"
            className="p-2 rounded-xl text-[var(--c-suave)] hover:text-[var(--c-texto)] hover:bg-[var(--c-borda)] transition-colors">
            <RefreshCw size={16} className={!pedidos ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {aviso && <p className="text-xs text-[var(--c-suave)] bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-xl px-3 py-2">{aviso}</p>}

      {!pedidos ? (
        <div className="flex justify-center py-16"><Spinner className="text-[var(--c-destaque)]" /></div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2 xl:flex-1 xl:min-h-0">
          {colunas.map(col => {
            const doStatus = lista.filter(p => col.inclui.includes(p.status) && combinaBusca(p, busca));
            return (
              <Coluna key={col.status} col={col} total={doStatus.length} arquivada={col.arquivada && !busca}
                onConfigurar={ehAdmin ? () => setVerConfig(col.status) : undefined}>
                {doStatus.length === 0 ? (
                  <div className="border-2 border-dashed border-[var(--c-borda)] rounded-2xl py-8 text-center">
                    <p className="text-xs text-[var(--c-suave)]">{busca ? 'Nada encontrado' : 'Sem pedidos'}</p>
                    {col.status === 'entrada' && !busca && <button onClick={() => setNovo(true)} className="mt-1 text-xs text-[var(--c-destaque)] font-semibold">+ Novo pedido</button>}
                  </div>
                ) : doStatus.map(p => <CardPedido key={p.id} p={p} carregar={carregar} onAbrir={() => setAbertoId(p.id)} />)}
              </Coluna>
            );
          })}
        </div>
      )}

      {aberto && (
        <CardAbertoLojinha p={aberto} cfg={cfg} colunas={colunas} ehAdmin={ehAdmin} carregar={carregar}
          onFechar={() => setAbertoId(null)}
          onHistorico={() => setHistorico({ id: aberto.id, nome: `Pedido ${aberto.numero_pedido} — ${aberto.cliente_nome}` })} />
      )}
      {verConfig && ehAdmin && (
        <ConfigOrcamento servico={SERVICO_CONFIG} titulo="Configurações — Lojinha Boxer" semInicio
          colunaInicial={typeof verConfig === 'string' ? verConfig : null}
          onFechar={() => setVerConfig(false)} onSalvo={(data) => setCfg(data)} />
      )}
      {(verMov || historico) && (
        <PainelMovimentacao buscar={buscarMovimentos} nomeStatus={nomeStatus} corStatus={corStatus}
          titulo="Movimentação — Lojinha" arquivo="movimentacao-lojinha" pedidoInicial={historico}
          onFechar={() => { setVerMov(false); setHistorico(null); }} />
      )}

      {novo && (
        <NovoPedido config={config} onFechar={() => setNovo(false)}
          onSalvo={(p) => {
            setNovo(false);
            setAviso(p.zen_ordem_separacao_id
              ? `Pedido ${p.numero_pedido}: Zen pedido ${p.zen_pedido_id} / ordem de separação ${p.zen_ordem_separacao_id} — já em Separação.`
              : `Pedido ${p.numero_pedido} registrado, mas o Zen deu erro: ${p.zen_erro || 'desconhecido'}. Use "Tentar de novo" no card.`);
            carregar();
          }} />
      )}
    </div>
    </FotosProvider>
  );
}

function Pilula({ col }) {
  if (!col) return null;
  return col.hex
    ? <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: `${col.hex}26`, color: col.hex }}>{col.titulo}</span>
    : <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${col.badge || ''}`}>{col.titulo}</span>;
}

function Coluna({ col, total, arquivada = false, onConfigurar, children }) {
  const [aberta, setAberta] = useState(!arquivada);
  return (
    <div className="space-y-2 w-[17.5rem] shrink-0 xl:min-h-0 xl:flex xl:flex-col">
      <div className={`flex items-center justify-between px-3 py-2 rounded-xl border ${col.hex ? '' : col.cor} bg-[var(--c-superficie)] xl:shrink-0`}
        style={col.hex ? { borderColor: `${col.hex}66` } : undefined}>
        {arquivada
          ? <button onClick={() => setAberta(v => !v)} className="flex items-center gap-1.5 text-[var(--c-suave)] hover:text-[var(--c-texto)]">
              {aberta ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<Pilula col={col} />
            </button>
          : <Pilula col={col} />}
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
      {aberta
        ? <div className="space-y-2 xl:flex-1 xl:min-h-0 xl:overflow-y-auto xl:pr-1 xl:-mr-1 xl:pb-2">{children}</div>
        : <button onClick={() => setAberta(true)} className="w-full text-xs text-[var(--c-suave)] border border-dashed border-[var(--c-borda)] rounded-xl py-2 hover:text-[var(--c-texto)]">Mostrar {total}</button>}
    </div>
  );
}

function StatusZen({ p, carregar }) {
  const [enviando, setEnviando] = useState(false);
  // ID da transação à mão: quando a Loja Integrada não traz um ID válido
  const pedeTransacao = /ID da transa[çc][ãa]o/i.test(p.zen_erro || '') || !!p.transacao_manual;
  const [transacao, setTransacao] = useState(p.transacao_manual || '');
  async function tentar() {
    const t = transacao.replace(/\s+/g, '');
    if (pedeTransacao && t && !/^\d{6,}(,\d{6,})*$/.test(t)) { alert('O ID da transação é só números (ex.: 186216402648), como aparece no painel da Loja Integrada.'); return; }
    setEnviando(true);
    try {
      const { data: r } = await lojinhaService.reenviarZen(p.id, pedeTransacao ? t : undefined);
      if (!r.pedido.zen_ordem_separacao_id) alert(`O Zen ainda deu erro: ${r.pedido.zen_erro}`);
      carregar();
    } catch (e) { alert(e.response?.data?.erro || 'Erro ao enviar ao Zen.'); }
    finally { setEnviando(false); }
  }
  if (p.zen_ordem_separacao_id) return (
    <div className="text-[11px] px-2 py-1 rounded-lg bg-green-500/10 text-green-400">
      <Check size={11} className="inline -mt-0.5" /> Zen:{' '}
      <a href={linkZenPedido(p.zen_pedido_id)} target="_blank" rel="noreferrer" title="Abrir pedido no Zen" className="hover:underline">
        pedido <b>{p.zen_pedido_id}</b> <ExternalLink size={10} className="inline -mt-0.5" /></a>
      {' · '}
      <a href={linkZenOrdem(p.zen_ordem_separacao_id)} target="_blank" rel="noreferrer" title="Abrir ordem de separação no Zen" className="hover:underline">
        ordem de separação <b>{p.zen_ordem_separacao_id}</b> <ExternalLink size={10} className="inline -mt-0.5" /></a>
      {p.zen_cfop ? ` · CFOP ${p.zen_cfop}` : ''}
    </div>
  );
  return (
    <div className="text-[11px] px-2 py-1.5 rounded-lg bg-red-500/10 text-red-400 space-y-1">
      <div className="flex items-start gap-1"><AlertTriangle size={12} className="shrink-0 mt-0.5" />
        <span>Zen: {p.zen_erro || 'pedido ainda não criado'}{p.zen_pedido_id && <> (<a href={linkZenPedido(p.zen_pedido_id)} target="_blank" rel="noreferrer" className="underline">pedido {p.zen_pedido_id} <ExternalLink size={10} className="inline -mt-0.5" /></a>)</>}</span></div>
      {pedeTransacao && (
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="text-red-300 font-semibold">ID da transação:</label>
          <input value={transacao} onChange={e => setTransacao(e.target.value)} inputMode="numeric" placeholder="ex.: 186216402648"
            onKeyDown={e => e.key === 'Enter' && tentar()}
            className="flex-1 min-w-[140px] bg-[var(--c-fundo)] border border-red-400/40 rounded-lg px-2 py-0.5 text-[var(--c-texto)] font-mono focus:outline-none focus:border-red-300" />
        </div>
      )}
      <button onClick={tentar} disabled={enviando || (pedeTransacao && !transacao.trim())}
        className="px-2 py-0.5 rounded-lg border border-red-400/40 text-red-300 font-semibold disabled:opacity-50">
        {enviando ? 'Enviando ao Zen…' : pedeTransacao ? 'Salvar ID e enviar ao Zen' : 'Tentar de novo'}
      </button>
    </div>
  );
}

// Dados da coluna Liberação: Nº da ordem de separação e cards (7 itens por card)
function InfoLiberacao({ p, itens }) {
  const qtd = p.qtd_cards || Math.max(1, Math.ceil(itens.length / ITENS_POR_CARD));
  const grupos = Array.from({ length: qtd }, (_, i) => itens.slice(i * ITENS_POR_CARD, (i + 1) * ITENS_POR_CARD));
  return (
    <div className="rounded-lg border border-[var(--c-destaque)]/40 bg-[var(--c-destaque)]/10 p-2.5 space-y-1.5">
      <div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--c-suave)]">Nº Ordem de Separação (Zen)</p>
          <a href={linkZenOrdem(p.zen_ordem_separacao_id)} target="_blank" rel="noreferrer" title="Abrir ordem de separação no Zen"
            className="inline-flex items-center gap-1 font-mono font-bold text-base text-[var(--c-texto)] hover:text-[var(--c-destaque)]">
            {p.zen_ordem_separacao_id} <ExternalLink size={13} />
          </a>
        </div>
      </div>
      {false && qtd > 1 && (
        <ul className="text-[11px] text-[var(--c-texto)] space-y-0.5">
          {grupos.map((g, i) => (
            <li key={i}><b>Card {i + 1}:</b> {g.map(x => x.codigo).join(', ')} <span className="text-[var(--c-suave)]">({g.length} {g.length === 1 ? 'item' : 'itens'})</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}


// Excluir o pedido (Zen e Lojinha) — usado no card e no card aberto
async function excluirPedido(p) {
  const partes = [
    p.zen_pedido_id && `o pedido ${p.zen_pedido_id} no Zen (desfazendo a ordem de separação ${p.zen_ordem_separacao_id || ''})`,
    'o pedido na Lojinha',
  ].filter(Boolean);
  if (!window.confirm(`Excluir o pedido ${p.numero_pedido}?\n\nIsso vai excluir ${partes.join(', ')}.\nNão dá para desfazer.`)) return false;
  try { await lojinhaService.excluir(p.id); return true; }
  catch (e) { alert(e.response?.data?.erro || 'Erro ao excluir.'); return false; }
}

// Dados fixos do pedido (cliente, envio, produtos e totais)
function DadosPedido({ p, sempreProdutos = false }) {
  const itens = Array.isArray(p.itens) ? p.itens : [];
  const [abertoProd, setAbertoProd] = useState(sempreProdutos);
  const desconto = valorDesconto(itens, p.assistente_autorizado);
  const parar = (e) => e.stopPropagation();
  return (
    <>
      <p className="text-[13px] font-semibold text-[var(--c-texto)] leading-snug">{p.cliente_nome}</p>
      {p.assistente_autorizado && <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400"><BadgeCheck size={11} /> Assistente Autorizado</span>}
      <p className="text-[11px] text-[var(--c-suave)] font-mono">{mascararDocumento(p.documento)}{p.cliente_cidade ? ` · ${p.cliente_cidade}` : ''}</p>
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[var(--c-borda)] text-[var(--c-texto)]"><User size={11} /> {p.vendedora}</span>
        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[var(--c-borda)] text-[var(--c-texto)]">
          {p.tipo_envio}{p.transportadora ? ` · ${p.transportadora}` : ''}
        </span>
        {!sempreProdutos && (
          <button onClick={e => { parar(e); setAbertoProd(a => !a); }} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[var(--c-destaque)]/15 text-[var(--c-destaque)] font-semibold">
            <Package size={11} /> {itens.length} {itens.length === 1 ? 'produto' : 'produtos'}
          </button>
        )}
      </div>
      {abertoProd && (
        <ul className="pt-1 space-y-0.5" onClick={parar}>
          {itens.map(i => (
            <li key={i.codigo} className="flex justify-between gap-2 text-[12px] text-[var(--c-texto)]">
              <span className="truncate"><b className="font-mono">{i.codigo}</b> {i.descricao}</span>
              <span className="shrink-0 font-semibold">{fmtQtd(i.quantidade)} {i.unidade} × {fmtR$(i.preco)}</span>
            </li>
          ))}
          <li className="flex justify-between text-[12px] text-[var(--c-suave)] pt-1 border-t border-[var(--c-borda)]"><span>Produtos</span><span>{fmtR$(totalItens(itens))}</span></li>
          {desconto > 0 && <li className="flex justify-between text-[12px] text-green-400"><span>Desconto Assistente Autorizado ({DESC_AUTORIZADO}%)</span><span>− {fmtR$(desconto)}</span></li>}
          <li className="flex justify-between text-[12px] text-[var(--c-suave)]"><span>Frete</span><span>{fmtR$(p.valor_frete)}</span></li>
        </ul>
      )}
      <div className="flex items-center justify-between text-[10px] text-[var(--c-suave)]">
        <span>Registrado por {p.criado_por_nome?.split(' ')[0] || '—'} · {fmtData(p.data)}</span>
        <b className="text-[12px] text-[var(--c-texto)]">{fmtR$(totalItens(itens) - desconto + Number(p.valor_frete || 0))}</b>
      </div>
    </>
  );
}

// Card do quadro (enxuto): clique abre o card
function CardPedido({ p, carregar, onAbrir }) {
  const itens = Array.isArray(p.itens) ? p.itens : [];
  const [excluindo, setExcluindo] = useState(false);
  const parar = (e) => e.stopPropagation();
  async function excluir(e) {
    parar(e);
    setExcluindo(true);
    if (await excluirPedido(p)) carregar();
    setExcluindo(false);
  }
  return (
    <div onClick={onAbrir} title="Abrir pedido"
      className="p-3 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] space-y-1.5 min-w-0 break-words cursor-pointer hover:border-[var(--c-borda-forte)] transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono font-semibold text-sm text-[var(--c-texto)]">Pedido {p.numero_pedido}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-[var(--c-suave)]">{fmtData(p.data)}</span>
          <button onClick={excluir} disabled={excluindo} title="Excluir pedido (Zen e Lojinha)"
            className="p-1 rounded-lg text-[var(--c-suave)] hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50">
            {excluindo ? <Spinner size={13} /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>
      {p.zen_ordem_separacao_id && <div onClick={parar}><InfoLiberacao p={p} itens={itens} /></div>}
      <div onClick={parar}><FaixaFotosCard pedido={p} onVerTodas={onAbrir} /></div>
      <DadosPedido p={p} />
      {!p.zen_ordem_separacao_id && <div onClick={parar}><StatusZen p={p} carregar={carregar} /></div>}
    </div>
  );
}

// ── Card aberto: dados e fases anteriores | fase atual | mover ──
function CardAbertoLojinha({ p, cfg, colunas, ehAdmin, carregar, onFechar, onHistorico }) {
  const [rascunho, setRascunho] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [movendo, setMovendo] = useState(false);
  const [erro, setErro] = useState('');
  const atual = colunaDo(p);
  const colAtual = colunas.find(c => c.status === atual);
  const valores = p.campos || {};
  const valorDe = (id) => (id in rascunho ? rascunho[id] : valores[id]);
  const temValor = (id) => valorLista(valorDe(id)).length > 0;
  const temFoto = (id) => (p.fotos_locais || []).some(f => f.campo === id);
  const sujo = Object.keys(rascunho).length > 0;
  const campos = cfg?.campos || [];
  const camposDe = (k) => campos.filter(c => c.coluna === k).map(campoDaConfig);
  const camposAtuais = camposDe(atual);
  const idx = colunas.findIndex(c => c.status === atual);
  const anteriores = colunas.filter(c => c.status !== atual)
    .map(c => ({ col: c, campos: camposDe(c.status).filter(f => temValor(f.id) || (f.tipo === 'attachment' && temFoto(f.id))) }))
    .filter(g => g.campos.length);

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') fechar(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  async function salvar() {
    if (!sujo) return true;
    setSalvando(true); setErro('');
    try { await lojinhaService.editarCampos(p.id, rascunho); setRascunho({}); await carregar(); return true; }
    catch (e) { setErro(e.response?.data?.erro || 'Erro ao salvar os campos.'); return false; }
    finally { setSalvando(false); }
  }
  function fechar() {
    if (sujo && !confirm('Há campos alterados sem salvar. Fechar mesmo assim?')) return;
    onFechar();
  }
  async function mover(status) {
    if (sujo && !(await salvar())) return;
    setMovendo(true); setErro('');
    try { await lojinhaService.mover(p.id, status); await carregar(); }
    catch (e) { setErro(e.response?.data?.erro || 'Erro ao mover.'); }
    finally { setMovendo(false); }
  }
  async function excluir() {
    if (await excluirPedido(p)) { onFechar(); carregar(); }
  }

  // Mover: a próxima coluna em destaque e as outras (Entrada é automática, via Zen)
  const podeMover = !!p.zen_ordem_separacao_id;
  const destinos = colunas.filter(c => c.status !== atual && c.status !== 'entrada' && !(c.admin && !ehAdmin) && !(colAtual?.admin && !ehAdmin));
  const proxima = destinos.find(c => colunas.indexOf(c) > idx) || null;
  const outros = destinos.filter(c => c !== proxima);

  const blocoCampo = (c, editavel) => (
    <div key={c.id} className={`min-w-0 ${c.tipo === 'long_text' || c.tipo === 'attachment' ? 'sm:col-span-2' : ''}`}>
      <dt className="text-xs font-semibold text-[var(--c-texto)]">{c.obrigatorio && <span className="text-red-400">* </span>}{c.rotulo}</dt>
      {c.descricao && <p className="text-[11px] text-[var(--c-suave)]">{c.descricao}</p>}
      <dd className="text-xs text-[var(--c-texto)] mt-1">
        {c.tipo === 'attachment'
          ? <FotosCampo pedido={p} campo={c} valor={null} podeEnviar={editavel} onMudou={carregar} />
          : editavel && !SO_LEITURA.includes(c.tipo)
          ? <Editor campo={c} valor={valorDe(c.id)} onChange={v => setRascunho(r => ({ ...r, [c.id]: v }))} />
          : <Valor campo={c} valor={valorDe(c.id)} />}
      </dd>
    </div>
  );
  const botao = (c, principal = false) => {
    const antes = colunas.indexOf(c) < idx;
    return (
      <button key={c.status} onClick={() => mover(c.status)} disabled={movendo || salvando || !podeMover}
        className={`w-full flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold text-left transition-colors disabled:opacity-40 ${
          principal ? 'border-[var(--c-destaque)]/50 bg-[var(--c-destaque)]/15 text-[var(--c-destaque)] hover:bg-[var(--c-destaque)]/25'
          : 'border-[var(--c-borda)] text-[var(--c-texto)] hover:bg-[var(--c-borda)]/40'}`}>
        {!principal && antes && <ArrowLeft size={13} className="shrink-0 text-[var(--c-suave)]" />}
        <span className="flex-1 truncate">{c.titulo}</span>
        {(principal || !antes) && <ArrowRight size={13} className="shrink-0" />}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-2 sm:p-4" onClick={fechar}>
      <div className="w-full max-w-[1320px] h-full max-h-[94dvh] flex flex-col bg-[var(--c-fundo)] border border-[var(--c-borda)] rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
          {/* Esquerda: dados do pedido e fases anteriores */}
          <div className="lg:w-[38%] lg:min-w-[340px] lg:overflow-y-auto border-b lg:border-b-0 lg:border-r border-[var(--c-borda)] p-5 space-y-4">
            <div className="pb-3 border-b border-[var(--c-borda)]">
              <p className="text-lg font-bold font-mono text-[var(--c-texto)]">Pedido {p.numero_pedido}</p>
              <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-[var(--c-borda)] text-[var(--c-suave)]">Lojinha Boxer</span>
            </div>
            <div className="rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4 space-y-1.5">
              <p className="text-sm font-bold text-[var(--c-texto)] mb-1">Dados do pedido</p>
              <DadosPedido p={p} sempreProdutos />
              <StatusZen p={p} carregar={carregar} />
            </div>
            {anteriores.map(g => (
              <div key={g.col.status} className="rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4">
                <div className="flex items-center gap-2 mb-3"><p className="text-sm font-bold text-[var(--c-texto)] flex-1">Fase</p><Pilula col={g.col} /></div>
                <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-3">{g.campos.map(c => blocoCampo(c, false))}</dl>
              </div>
            ))}
          </div>

          {/* Meio: fase atual */}
          <div className="flex-1 min-w-0 lg:overflow-y-auto p-5 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-[var(--c-borda)]">
              <p className="text-sm font-bold text-[var(--c-texto)]">Fase atual</p>
              <Pilula col={colAtual} />
            </div>
            {p.zen_ordem_separacao_id && <InfoLiberacao p={p} itens={Array.isArray(p.itens) ? p.itens : []} />}
            {colAtual?.zen && <p className="text-[11px] text-amber-400">Zen: {colAtual.zen}</p>}
            {erro && <p className="text-xs text-red-400">{erro}</p>}
            {camposAtuais.length
              ? <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-4">{camposAtuais.map(c => blocoCampo(c, true))}</dl>
              : <p className="text-xs text-[var(--c-suave)] py-4">Esta coluna não tem campos para preencher.{ehAdmin ? ' Crie em Configurar (engrenagem da coluna).' : ''}</p>}
            {sujo && (
              <div className="sticky bottom-0 flex items-center justify-end gap-2 py-2 bg-[var(--c-fundo)] border-t border-[var(--c-borda)]">
                <p className="flex-1 text-[11px] text-amber-400">Alterações não salvas.</p>
                <button onClick={() => setRascunho({})} className="px-3 py-1.5 rounded-lg text-xs text-[var(--c-suave)] hover:text-[var(--c-texto)]">Descartar</button>
                <button onClick={salvar} disabled={salvando}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--c-destaque)] text-white disabled:opacity-40">
                  {salvando ? <Spinner size={12} /> : <Check size={12} />} Salvar
                </button>
              </div>
            )}
          </div>

          {/* Direita: mover e ações */}
          <div className="lg:w-[270px] shrink-0 lg:overflow-y-auto border-t lg:border-t-0 lg:border-l border-[var(--c-borda)] p-5 space-y-4 bg-[var(--c-superficie)]/40">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-[var(--c-texto)]">Mover pedido para</p>
              <button onClick={fechar} aria-label="Fechar" className="p-1 text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={18} /></button>
            </div>
            {!podeMover && <p className="text-[11px] rounded-xl border border-[var(--c-borda)] px-3 py-2 text-[var(--c-suave)]">O pedido sai da Entrada sozinho quando o Zen criar a ordem de separação.</p>}
            {proxima && botao(proxima, true)}
            {movendo && <p className="flex items-center gap-2 text-[11px] text-[var(--c-suave)]"><Spinner size={12} /> Movendo…</p>}
            {outros.length > 0 && <div className="space-y-1.5 pt-3 border-t border-[var(--c-borda)]">{outros.map(c => botao(c))}</div>}
            <div className="space-y-1.5 pt-3 border-t border-[var(--c-borda)]">
              <button onClick={onHistorico}
                className="w-full flex items-center gap-2 rounded-xl border border-[var(--c-borda)] px-3 py-2 text-xs font-semibold text-[var(--c-texto)] hover:bg-[var(--c-borda)]/40">
                <History size={13} /> <span className="flex-1 text-left">Histórico do pedido</span>
              </button>
              <button onClick={excluir}
                className="w-full flex items-center gap-2 rounded-xl border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/10">
                <Trash2 size={13} /> <span className="flex-1 text-left">Excluir pedido</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- Formulário da Entrada ----------------
function NovoPedido({ config, onFechar, onSalvo }) {
  const [documento, setDocumento] = useState('');
  const [cliente, setCliente] = useState(null);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [erroCliente, setErroCliente] = useState('');
  const [data, setData] = useState(hojeISO());
  const [itens, setItens] = useState([]);
  const [sku, setSku] = useState('');
  const [qtd, setQtd] = useState('1');
  const [preco, setPreco] = useState('');
  const [autorizado, setAutorizado] = useState(false);
  const [frete, setFrete] = useState('');
  const [buscandoSku, setBuscandoSku] = useState(false);
  const [erroSku, setErroSku] = useState('');
  const [previa, setPrevia] = useState(null); // { sku, produto?, erro? }
  const [numero, setNumero] = useState('');
  const [vendedoraId, setVendedoraId] = useState('');
  const [tipo, setTipo] = useState('');
  const [transportadora, setTransportadora] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [buscandoLI, setBuscandoLI] = useState(false);
  const [infoLI, setInfoLI] = useState(null); // { numero, situacao, envio_nome, avisos[] }
  const [erroLI, setErroLI] = useState('');
  const ultimaBusca = useRef('');
  const skuRef = useRef(null);

  // Mostra a descrição do SKU enquanto digita
  useEffect(() => {
    const codigo = sku.trim();
    if (!codigo) { setPrevia(null); return; }
    let vivo = true;
    const t = setTimeout(async () => {
      setPrevia({ sku: codigo, carregando: true });
      try {
        const { data: r } = await lojinhaService.produto(codigo);
        if (vivo) setPrevia({ sku: codigo, produto: r.produto });
      } catch (e) {
        if (vivo) setPrevia({ sku: codigo, produto: e.response?.data?.produto, erro: e.response?.data?.erro || 'Erro ao buscar o SKU.' });
      }
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
  }, [sku]);

  async function buscarCliente(doc = documento) {
    const d = soDigitos(doc);
    if (d.length !== 11 && d.length !== 14) { setErroCliente('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).'); return; }
    ultimaBusca.current = d;
    setBuscandoCliente(true); setErroCliente(''); setCliente(null);
    try {
      const { data } = await lojinhaService.cliente(d);
      if (ultimaBusca.current === d) setCliente(data.cliente);
    } catch (e) {
      if (ultimaBusca.current === d) setErroCliente(e.response?.data?.erro || 'Erro ao buscar o cliente.');
    } finally { if (ultimaBusca.current === d) setBuscandoCliente(false); }
  }
  function mudarDocumento(v) {
    const m = mascararDocumento(v);
    setDocumento(m); setCliente(null); setErroCliente('');
    const d = soDigitos(m);
    if (d.length === 11 || d.length === 14) buscarCliente(m);
  }

  // Busca o pedido na Loja Integrada e preenche o formulário
  async function importarLI(e) {
    e?.preventDefault();
    const n = soDigitos(numero);
    if (!n) { setErroLI('Informe o número do pedido da lojinha.'); return; }
    setBuscandoLI(true); setErroLI(''); setInfoLI(null);
    try {
      const { data: r } = await lojinhaService.lojaIntegrada(n);
      const p = r.pedido;
      const avisos = [];
      if (p.duplicado) avisos.push(`Este pedido já foi lançado aqui (status: ${p.duplicado.status}).`);
      setNumero(p.numero);
      ultimaBusca.current = soDigitos(p.documento);
      setDocumento(mascararDocumento(p.documento || ''));
      setCliente(p.cliente); setErroCliente(p.erro_cliente || ''); setBuscandoCliente(false);
      if (p.data) setData(p.data);
      setItens(p.itens.filter(i => !i.erro).map(({ erro, ...i }) => i));
      p.itens.filter(i => i.erro).forEach(i => avisos.push(`SKU ${i.codigo}${i.descricao ? ` (${i.descricao})` : ''}: ${i.erro} Não foi incluído.`));
      setFrete(p.valor_frete ? p.valor_frete.toFixed(2).replace('.', ',') : '');
      const ufCli = (p.cliente?.uf || p.uf || '').toUpperCase();
      setTipo(p.tipo_envio || '');
      if (p.tipo_envio === 'Transportadora') {
        const ind = config.transportadoras.filter(t => ufCli && t.ufs.includes(ufCli));
        setTransportadora(ind.length === 1 ? ind[0].nome : '');
      } else setTransportadora('');
      if (!p.tipo_envio) avisos.push('Forma de envio não identificada — escolha abaixo.');
      setInfoLI({ numero: p.numero, situacao: p.situacao, envio_nome: p.envio_nome, avisos });
    } catch (e2) { setErroLI(e2.response?.data?.erro || 'Erro ao buscar o pedido na Loja Integrada.'); }
    finally { setBuscandoLI(false); }
  }

  async function incluirProduto(e) {
    e?.preventDefault();
    const codigo = sku.trim();
    const q = Number(String(qtd).replace(',', '.'));
    setErroSku('');
    if (!codigo) { setErroSku('Informe o SKU.'); return; }
    if (!(q > 0)) { setErroSku('Informe a quantidade.'); return; }
    const pr = numBR(preco);
    if (!(pr >= 0)) { setErroSku('Informe o preço unitário.'); return; }
    setBuscandoSku(true);
    try {
      const { data: r } = await lojinhaService.produto(codigo);
      const p = r.produto;
      const jaTem = itens.find(i => i.codigo === p.codigo);
      const total = (jaTem?.quantidade || 0) + q;
      if (total > p.saldo) { setErroSku(`SKU ${p.codigo}: só há ${fmtQtd(p.saldo)} ${p.unidade} em estoque.`); return; }
      setItens(lista => jaTem
        ? lista.map(i => (i.codigo === p.codigo ? { ...i, quantidade: total, preco: pr } : i))
        : [...lista, { codigo: p.codigo, descricao: p.descricao, unidade: p.unidade, saldo: p.saldo, quantidade: q, preco: pr }]);
      setSku(''); setQtd('1'); setPreco('');
      skuRef.current?.focus();
    } catch (e2) { setErroSku(e2.response?.data?.erro || 'Erro ao buscar o SKU.'); }
    finally { setBuscandoSku(false); }
  }

  async function salvar() {
    setErro('');
    if (!cliente) { setErro('Busque o cliente pelo CPF/CNPJ.'); return; }
    if (!itens.length) { setErro('Inclua pelo menos um produto.'); return; }
    if (!numero.trim()) { setErro('Informe o número do pedido da lojinha.'); return; }
    if (!vendedoraId) { setErro('Escolha a vendedora.'); return; }
    if (!tipo) { setErro('Escolha o tipo de envio.'); return; }
    if (tipo === 'Transportadora' && !transportadora.trim()) { setErro('Escolha a transportadora.'); return; }
    const vFrete = frete.trim() === '' ? 0 : numBR(frete);
    if (!(vFrete >= 0)) { setErro('Valor do frete inválido.'); return; }
    setSalvando(true);
    try {
      const { data: r } = await lojinhaService.criar({
        documento: soDigitos(documento), cliente_id_zen: cliente.id, cliente_nome: cliente.nome,
        cliente_cidade: [cliente.cidade, cliente.uf].filter(Boolean).join(' / '), cliente_uf: cliente.uf || '',
        data, itens: itens.map(i => ({ codigo: i.codigo, quantidade: i.quantidade, preco: i.preco })),
        assistente_autorizado: autorizado, valor_frete: vFrete,
        numero_pedido: numero.trim(), vendedora_id_zen: Number(vendedoraId), vendedora: config.vendedoras.find(v => String(v.id) === String(vendedoraId))?.nome || '', tipo_envio: tipo, transportadora: transportadora.trim(),
      });
      onSalvo(r.pedido);
    } catch (e) { setErro(e.response?.data?.erro || 'Erro ao salvar o pedido.'); }
    finally { setSalvando(false); }
  }

  const uf = (cliente?.uf || '').toUpperCase();
  const indicadas = config.transportadoras.filter(t => uf && t.ufs.includes(uf));
  function escolherEnvio(t) {
    setTipo(t);
    if (t !== 'Transportadora') setTransportadora('');
    else if (!transportadora && indicadas.length === 1) setTransportadora(indicadas[0].nome);
  }

  const botao = (ativo) => `flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors ${ativo
    ? 'bg-[var(--c-destaque)] border-[var(--c-destaque)] text-white'
    : 'border-[var(--c-borda)] text-[var(--c-texto)] hover:border-[var(--c-destaque)]'}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start sm:items-center justify-center p-0 sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="bg-[var(--c-superficie)] border border-[var(--c-borda)] sm:rounded-2xl w-full max-w-3xl max-h-screen sm:max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-[var(--c-superficie)] border-b border-[var(--c-borda)] px-4 sm:px-5 py-3 flex items-center justify-between z-10">
          <b className="text-[var(--c-texto)]">Novo pedido — Entrada</b>
          <button onClick={onFechar} className="p-1.5 rounded-lg text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={18} /></button>
        </div>

        <div className="p-4 sm:p-5 space-y-5">
          {/* 0. Pedido da Loja Integrada */}
          <div className="rounded-xl border border-[var(--c-destaque)] p-3">
            <label className={rotulo}>Número do pedido da lojinha</label>
            <form onSubmit={importarLI} className="flex gap-2 max-w-md">
              <input value={numero} onChange={e => { setNumero(e.target.value); setErroLI(''); }} inputMode="numeric" autoFocus
                placeholder="Ex.: 11131" className={campo} />
              <button type="submit" disabled={buscandoLI}
                className="flex items-center gap-1.5 px-4 rounded-xl bg-[var(--c-destaque)] text-white text-sm font-semibold disabled:opacity-50 shrink-0">
                {buscandoLI ? <Spinner size={14} /> : <Search size={15} />} Buscar na lojinha
              </button>
            </form>
            <p className="text-[11px] text-[var(--c-suave)] mt-1.5">Puxa cliente, data, produtos, preços, frete e envio da Loja Integrada. Confira, escolha a vendedora e salve.</p>
            {erroLI && <p className="text-xs text-red-400 mt-1.5">{erroLI}</p>}
            {infoLI && (
              <div className="mt-2 text-xs space-y-1">
                <p className="text-green-400 flex items-center gap-1.5"><Check size={13} /> Pedido #{infoLI.numero} carregado{infoLI.situacao ? ` — ${infoLI.situacao}` : ''}{infoLI.envio_nome ? ` — ${infoLI.envio_nome}` : ''}</p>
                {infoLI.avisos.map((a, k) => <p key={k} className="text-amber-400 flex items-start gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-px" /> {a}</p>)}
              </div>
            )}
          </div>

          {/* 1. Cliente */}
          <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
            <div>
              <label className={rotulo}>CPF / CNPJ do cliente</label>
              <div className="flex gap-2">
                <input value={documento} onChange={e => mudarDocumento(e.target.value)} inputMode="numeric"
                  placeholder="000.000.000-00" className={campo} />
                <button type="button" onClick={() => buscarCliente()} disabled={buscandoCliente}
                  className="px-3 rounded-xl bg-[var(--c-borda)] text-[var(--c-texto)] disabled:opacity-50" title="Buscar no Zen">
                  {buscandoCliente ? <Spinner size={15} /> : <Search size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className={rotulo}>Cliente (cadastro do Zen)</label>
              <div className={`${campo} min-h-[42px] flex items-center gap-2 ${cliente ? '' : 'text-[var(--c-suave)]'}`}>
                {buscandoCliente ? <><Spinner size={14} /> Buscando no Zen…</>
                  : cliente ? <>
                    <Check size={15} className="text-green-400 shrink-0" />
                    <span className="font-semibold truncate">{cliente.nome}</span>
                    {(cliente.cidade || cliente.uf) && <span className="text-xs text-[var(--c-suave)] shrink-0">{[cliente.cidade, cliente.uf].filter(Boolean).join(' / ')}</span>}
                  </>
                  : 'Preenchido automaticamente pelo documento'}
              </div>
              {erroCliente && <p className="text-xs text-red-400 mt-1">{erroCliente}</p>}
            </div>
          </div>
          <label className="flex items-center gap-2.5 w-fit cursor-pointer select-none text-sm text-[var(--c-texto)]">
            <input type="checkbox" checked={autorizado} onChange={e => setAutorizado(e.target.checked)}
              className="w-4 h-4 accent-[var(--c-destaque)]" />
            Cliente é <b>Assistente Autorizado</b>
          </label>

          {/* 2. Data / 4. Nº pedido / 5. Vendedora */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={rotulo}>Data</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)} className={campo} />
            </div>
            <div>
              <label className={rotulo}>Vendedora</label>
              <select value={vendedoraId} onChange={e => setVendedoraId(e.target.value)} className={campo}>
                <option value="">{config.vendedoras.length ? 'Selecione…' : 'Carregando do Zen…'}</option>
                {config.vendedoras.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
              {config.erro_vendedoras && <p className="text-xs text-red-400 mt-1">{config.erro_vendedoras}</p>}
            </div>
          </div>

          {/* 3. Produtos */}
          <div>
            <label className={rotulo}>Produtos</label>
            <form onSubmit={incluirProduto} className="grid grid-cols-[70px_1fr_auto] sm:grid-cols-[1fr_80px_130px_auto] gap-2">
              <input ref={skuRef} value={sku} onChange={e => { setSku(e.target.value); setErroSku(''); }} placeholder="SKU" className={`${campo} font-mono col-span-3 sm:col-span-1`} />
              <input value={qtd} onChange={e => setQtd(e.target.value)} inputMode="decimal" className={`${campo} text-center`} title="Quantidade" placeholder="Qtd" />
              <input value={preco} onChange={e => setPreco(e.target.value)} inputMode="decimal" className={`${campo} text-right`} title="Preço unitário (R$)" placeholder="Preço R$" />
              <button type="submit" disabled={buscandoSku}
                className="flex items-center justify-center gap-1.5 px-4 rounded-xl bg-[var(--c-borda)] text-[var(--c-texto)] text-sm font-semibold disabled:opacity-50 shrink-0">
                {buscandoSku ? <Spinner size={14} /> : <Plus size={15} />} Incluir
              </button>
            </form>
            {previa && previa.sku === sku.trim() && (
              <div className="mt-1.5 text-xs flex items-center gap-2 min-h-[18px]">
                {previa.carregando ? <><Spinner size={12} /> <span className="text-[var(--c-suave)]">Buscando no catálogo…</span></>
                  : previa.produto ? <>
                    <span className="text-[var(--c-texto)] font-semibold truncate">{previa.produto.descricao}</span>
                    <span className={`shrink-0 ${previa.produto.saldo > 0 ? 'text-green-400' : 'text-red-400'}`}>saldo {fmtQtd(previa.produto.saldo)} {previa.produto.unidade}</span>
                  </> : null}
                {!previa.carregando && previa.erro && !previa.produto && <span className="text-red-400">{previa.erro}</span>}
              </div>
            )}
            {erroSku && <p className="text-xs text-red-400 mt-1">{erroSku}</p>}
            {itens.length > 0 && (
              <div className="mt-2 rounded-xl border border-[var(--c-borda)] divide-y divide-[var(--c-borda)]">
                {itens.map(i => (
                  <div key={i.codigo} className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                    <span className="font-mono font-semibold text-[var(--c-texto)] shrink-0">{i.codigo}</span>
                    <span className="basis-[calc(100%-5rem)] sm:basis-auto flex-1 min-w-0 truncate text-[var(--c-texto)]">{i.descricao}</span>
                    <span className="text-[11px] text-[var(--c-suave)] shrink-0 hidden sm:inline">saldo {fmtQtd(i.saldo)}</span>
                    <span className="shrink-0 text-[var(--c-texto)]">{fmtQtd(i.quantidade)} {i.unidade} × {fmtR$(i.preco)}</span>
                    <b className="shrink-0 w-24 text-right text-[var(--c-texto)]">{fmtR$(totalItens([i]) - valorDesconto([i], autorizado))}</b>
                    <button onClick={() => setItens(l => l.filter(x => x.codigo !== i.codigo))} className="p-1 text-[var(--c-suave)] hover:text-red-400" title="Remover"><Trash2 size={14} /></button>
                  </div>
                ))}
                {autorizado && <div className="flex justify-between px-3 py-2 text-sm text-green-400"><span>Desconto Assistente Autorizado ({DESC_AUTORIZADO}% em cada peça)</span><b>− {fmtR$(valorDesconto(itens, true))}</b></div>}
                <div className="flex justify-between px-3 py-2 text-sm text-[var(--c-suave)]"><span>Total dos produtos</span><b className="text-[var(--c-texto)]">{fmtR$(totalItens(itens) - valorDesconto(itens, autorizado))}</b></div>
              </div>
            )}
          </div>

          {/* 6. Envio */}
          <div>
            <label className={rotulo}>Envio</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {config.tipos_envio.map(t => {
                const Icone = ICONE_ENVIO[t] || Package;
                return (
                  <button key={t} type="button" onClick={() => escolherEnvio(t)} className={botao(tipo === t)}>
                    <Icone size={15} /> {t}
                  </button>
                );
              })}
            </div>
            {tipo === 'Transportadora' && (
              <div className="max-w-md mt-3">
                <label className={rotulo}>Transportadora</label>
                <select value={transportadora} onChange={e => setTransportadora(e.target.value)} className={campo}>
                  <option value="">Selecione…</option>
                  {config.transportadoras.map(t => (
                    <option key={t.nome} value={t.nome}>
                      {uf && t.ufs.includes(uf) ? '★ ' : ''}{t.nome} — {t.ufs.join(', ')}
                    </option>
                  ))}
                </select>
                {uf && (indicadas.length || config.avisos_uf[uf]) ? (
                  <p className="text-xs mt-1.5 text-amber-400">
                    {config.avisos_uf[uf] || `Cliente em ${uf}: ${indicadas.map(t => t.nome + (t.obs ? ` (${t.obs})` : '')).join(' ou ')}.`}
                  </p>
                ) : null}
                <p className="text-[11px] text-[var(--c-suave)] mt-1">Tudo que for REDESPACHO vai pela Rodo Cargo.</p>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-[200px_1fr] items-end">
            <div>
              <label className={rotulo}>Valor do frete (R$)</label>
              <input value={frete} onChange={e => setFrete(e.target.value)} inputMode="decimal" placeholder="0,00" className={`${campo} text-right`} />
            </div>
            <div className="text-right text-sm text-[var(--c-suave)] pb-2.5">
              Total do pedido <b className="text-lg text-[var(--c-texto)] ml-2">{fmtR$(totalItens(itens) - valorDesconto(itens, autorizado) + (numBR(frete) >= 0 ? numBR(frete) : 0))}</b>
            </div>
          </div>

          {erro && <p className="text-sm text-red-400">{erro}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onFechar} className="px-4 py-2.5 rounded-xl border border-[var(--c-borda)] text-sm text-[var(--c-texto)]">Cancelar</button>
            <button onClick={salvar} disabled={salvando}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--c-destaque)] text-white text-sm font-semibold disabled:opacity-50">
              {salvando ? <><Spinner size={14} /> Criando no Zen…</> : <><Check size={15} /> Salvar na Entrada</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
