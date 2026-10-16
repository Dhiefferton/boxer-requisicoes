// ============================================================
// pages/operador/LojinhaBoxer.jsx — Lojinha Boxer
// ============================================================
// Duas colunas: Entrada e Liberação.
// Entrada: cliente (CPF/CNPJ buscado no Zen) e se é Assistente Autorizado,
// data, produtos (SKU do catálogo, só com saldo, com preço), nº do pedido
// da lojinha, vendedora, envio e valor do frete.
// Ao salvar, o sistema cria o pedido no Zen até a ordem de separação.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { Search, Check, RefreshCw, Truck, Package, Mail, Building2, Plus, X, Trash2, User, BadgeCheck, AlertTriangle, ExternalLink } from 'lucide-react';
import { lojinhaService } from '../../services/api';
import { Spinner } from '../../components/ui';

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
// Colunas (mesmo visual da tela de Orçamentos)
const COLUNAS = [
  { status: 'entrada',   titulo: 'Entrada',      resumo: 'Entrada',      cor: 'border-blue-500/40',   badge: 'bg-blue-500/15 text-blue-400' },
  { status: 'liberacao', titulo: 'Liberação',    resumo: 'Liberação',    cor: 'border-amber-500/40',  badge: 'bg-amber-500/15 text-amber-400' },
  { status: 'separacao', titulo: 'Em Separação', resumo: 'Em Separação', cor: 'border-purple-500/40', badge: 'bg-purple-500/15 text-purple-400' },
];
const ITENS_POR_CARD = 7; // limite do Pipefy
const DESC_AUTORIZADO = 23; // % de desconto do Assistente Autorizado
const totalItens = (itens) => itens.reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.preco || 0), 0);
const valorDesconto = (itens, autorizado) => (autorizado ? Math.round(totalItens(itens) * DESC_AUTORIZADO) / 100 : 0);
const ICONE_ENVIO = { Sedex: Mail, PAC: Package, 'Próprio': Truck, Transportadora: Building2 };

const campo = 'w-full bg-[var(--c-fundo)] border border-[var(--c-borda)] text-[var(--c-texto)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[var(--c-destaque)]';
const rotulo = 'block text-xs text-[var(--c-suave)] mb-1.5';

export default function LojinhaBoxer() {
  const [config, setConfig] = useState({ tipos_envio: ['Sedex', 'PAC', 'Próprio', 'Transportadora'], transportadoras: [], avisos_uf: {}, vendedoras: [], erro_vendedoras: null });
  const [pedidos, setPedidos] = useState(null);
  const [novo, setNovo] = useState(false);
  const [aviso, setAviso] = useState('');

  async function carregar() {
    try { const { data } = await lojinhaService.pedidos(); setPedidos(data.pedidos); }
    catch { setPedidos([]); }
  }
  useEffect(() => {
    lojinhaService.config().then(r => setConfig(c => ({ ...c, ...r.data }))).catch(() => {});
    carregar();
  }, []);

  const lista = pedidos || [];
  const ativos = lista.length;

  return (
    // Tela grande: travada na altura da janela e cada coluna rola sozinha (igual Orçamentos)
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
          <button onClick={() => { setNovo(true); setAviso(''); }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold
              bg-[var(--c-destaque)]/15 text-[var(--c-destaque)] hover:bg-[var(--c-destaque)]/25 transition-colors">
            <Plus size={13} /> Novo pedido
          </button>
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
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-rows-1 xl:flex-1 xl:min-h-0 gap-4">
          {COLUNAS.map(({ status, titulo, cor, badge }) => {
            const doStatus = lista.filter(p => p.status === status);
            return (
              <Coluna key={status} titulo={titulo} cor={cor} badge={badge} total={doStatus.length}>
                {doStatus.length === 0 ? (
                  <div className="border-2 border-dashed border-[var(--c-borda)] rounded-2xl py-8 text-center">
                    <p className="text-xs text-[var(--c-suave)]">Sem pedidos</p>
                    {status === 'entrada' && <button onClick={() => setNovo(true)} className="mt-1 text-xs text-[var(--c-destaque)] font-semibold">+ Novo pedido</button>}
                  </div>
                ) : doStatus.map(p => <CardPedido key={p.id} p={p} carregar={carregar} />)}
              </Coluna>
            );
          })}
        </div>
      )}

      {novo && (
        <NovoPedido config={config} onFechar={() => setNovo(false)}
          onSalvo={(p) => {
            setNovo(false);
            setAviso(p.zen_ordem_separacao_id
              ? (p.status === 'separacao'
                ? `Pedido ${p.numero_pedido}: Zen pedido ${p.zen_pedido_id} / ordem ${p.zen_ordem_separacao_id} e ${p.qtd_cards} card(s) no Pipefy — já em Separação.`
                : `Pedido ${p.numero_pedido} criado no Zen e na Liberação, mas o Pipefy deu erro: ${p.pipefy_erro || 'desconhecido'}. Use "Criar cards no Pipefy" no card.`)
              : `Pedido ${p.numero_pedido} registrado, mas o Zen deu erro: ${p.zen_erro || 'desconhecido'}. Use "Tentar de novo" no card.`);
            carregar();
          }} />
      )}
    </div>
  );
}

function Coluna({ titulo, cor, badge, total, children }) {
  return (
    <div className="space-y-2 min-w-0 xl:min-h-0 xl:flex xl:flex-col">
      <div className={`flex items-center justify-between px-3 py-2 rounded-xl border ${cor} bg-[var(--c-superficie)] xl:shrink-0`}>
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${badge}`}>{titulo}</span>
        <span className="text-xs font-bold text-[var(--c-suave)]">{total}</span>
      </div>
      <div className="space-y-2 xl:flex-1 xl:min-h-0 xl:overflow-y-auto xl:pr-1 xl:-mr-1 xl:pb-2">{children}</div>
    </div>
  );
}

function StatusZen({ p, carregar }) {
  const [enviando, setEnviando] = useState(false);
  async function tentar() {
    setEnviando(true);
    try {
      const { data: r } = await lojinhaService.reenviarZen(p.id);
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
      <button onClick={tentar} disabled={enviando}
        className="px-2 py-0.5 rounded-lg border border-red-400/40 text-red-300 font-semibold disabled:opacity-50">
        {enviando ? 'Enviando ao Zen…' : 'Tentar de novo'}
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
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--c-suave)]">Nº Ordem de Separação (Zen)</p>
          <a href={linkZenOrdem(p.zen_ordem_separacao_id)} target="_blank" rel="noreferrer" title="Abrir ordem de separação no Zen"
            className="inline-flex items-center gap-1 font-mono font-bold text-base text-[var(--c-texto)] hover:text-[var(--c-destaque)]">
            {p.zen_ordem_separacao_id} <ExternalLink size={13} />
          </a>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--c-suave)]">Quantidade total de card</p>
          <p className="font-bold text-base text-[var(--c-texto)]">{qtd}</p>
        </div>
      </div>
      {qtd > 1 && (
        <ul className="text-[11px] text-[var(--c-texto)] space-y-0.5">
          {grupos.map((g, i) => (
            <li key={i}><b>Card {i + 1}:</b> {g.map(x => x.codigo).join(', ')} <span className="text-[var(--c-suave)]">({g.length} {g.length === 1 ? 'item' : 'itens'})</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusPipefy({ p, carregar }) {
  const [enviando, setEnviando] = useState(false);
  const cards = Array.isArray(p.pipefy_cards) ? p.pipefy_cards : [];
  async function enviar() {
    setEnviando(true);
    try {
      const { data: r } = await lojinhaService.reenviarPipefy(p.id);
      if (r.pedido.status !== 'separacao') alert(`O Pipefy deu erro: ${r.pedido.pipefy_erro}`);
      carregar();
    } catch (e) { alert(e.response?.data?.erro || 'Erro ao enviar ao Pipefy.'); }
    finally { setEnviando(false); }
  }
  const ok = p.status === 'separacao';
  return (
    <div className={`text-[11px] px-2 py-1.5 rounded-lg space-y-1 ${ok ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'}`}>
      {cards.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          <span>Pipefy:</span>
          {cards.filter(c => c.id).map((c, i) => (
            <a key={c.id} href={c.url || `https://app.pipefy.com/open-cards/${c.id}`} target="_blank" rel="noreferrer" className="hover:underline" title={c.fase || ''}>
              Card {i + 1}{cards.length > 1 ? `/${cards.length}` : ''} <b>{c.id}</b> · {c.fase || '—'} <ExternalLink size={10} className="inline -mt-0.5" />
            </a>
          ))}
        </div>
      )}
      {!ok && (
        <>
          {p.pipefy_erro
            ? <div className="flex items-start gap-1"><AlertTriangle size={12} className="shrink-0 mt-0.5" /><span>Pipefy: {p.pipefy_erro}</span></div>
            : !cards.length && <div>Pipefy: cards ainda não criados.</div>}
          <button onClick={enviar} disabled={enviando}
            className="px-2 py-0.5 rounded-lg border border-amber-400/40 text-amber-300 font-semibold disabled:opacity-50">
            {enviando ? 'Enviando ao Pipefy…' : (cards.length ? 'Tentar de novo no Pipefy' : 'Criar cards no Pipefy')}
          </button>
        </>
      )}
      {ok && p.pipefy_avisos && <div className="text-[var(--c-suave)]">{p.pipefy_avisos}</div>}
    </div>
  );
}

function CardPedido({ p, carregar }) {
  const itens = Array.isArray(p.itens) ? p.itens : [];
  const [aberto, setAberto] = useState(false);
  const desconto = valorDesconto(itens, p.assistente_autorizado);
  const [excluindo, setExcluindo] = useState(false);
  async function excluir() {
    const cards = (p.pipefy_cards || []).filter(c => c?.id).length;
    const partes = [
      p.zen_pedido_id && `o pedido ${p.zen_pedido_id} no Zen (desfazendo a ordem de separação ${p.zen_ordem_separacao_id || ''})`,
      cards && `${cards} card(s) no Pipefy`,
      'o pedido na Lojinha',
    ].filter(Boolean);
    if (!window.confirm(`Excluir o pedido ${p.numero_pedido}?\n\nIsso vai excluir ${partes.join(', ')}.\nNão dá para desfazer.`)) return;
    setExcluindo(true);
    try { await lojinhaService.excluir(p.id); carregar(); }
    catch (e) { alert(e.response?.data?.erro || 'Erro ao excluir.'); carregar(); }
    finally { setExcluindo(false); }
  }
  return (
    <div className="p-3 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] space-y-1.5 min-w-0 break-words">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono font-semibold text-sm text-[var(--c-texto)]">Pedido {p.numero_pedido}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-[var(--c-suave)]">{fmtData(p.data)}</span>
          <button onClick={excluir} disabled={excluindo} title="Excluir pedido (Zen, Pipefy e Lojinha)"
            className="p-1 rounded-lg text-[var(--c-suave)] hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50">
            {excluindo ? <Spinner size={13} /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>
      <p className="text-[13px] font-semibold text-[var(--c-texto)] leading-snug">{p.cliente_nome}</p>
      {['liberacao', 'separacao'].includes(p.status) && p.zen_ordem_separacao_id && <InfoLiberacao p={p} itens={itens} />}
      {p.assistente_autorizado && <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400"><BadgeCheck size={11} /> Assistente Autorizado</span>}
      <p className="text-[11px] text-[var(--c-suave)] font-mono">{mascararDocumento(p.documento)}{p.cliente_cidade ? ` · ${p.cliente_cidade}` : ''}</p>
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[var(--c-borda)] text-[var(--c-texto)]"><User size={11} /> {p.vendedora}</span>
        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[var(--c-borda)] text-[var(--c-texto)]">
          {p.tipo_envio}{p.transportadora ? ` · ${p.transportadora}` : ''}
        </span>
        <button onClick={() => setAberto(a => !a)} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[var(--c-destaque)]/15 text-[var(--c-destaque)] font-semibold">
          <Package size={11} /> {itens.length} {itens.length === 1 ? 'produto' : 'produtos'}
        </button>
      </div>
      {aberto && (
        <ul className="pt-1 space-y-0.5">
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
        <span>Registrado por {p.criado_por_nome?.split(' ')[0] || '—'}</span>
        <b className="text-[12px] text-[var(--c-texto)]">{fmtR$(totalItens(itens) - desconto + Number(p.valor_frete || 0))}</b>
      </div>
      <StatusZen p={p} carregar={carregar} />
      {['liberacao', 'separacao'].includes(p.status) && <StatusPipefy p={p} carregar={carregar} />}
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
          {/* 1. Cliente */}
          <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
            <div>
              <label className={rotulo}>CPF / CNPJ do cliente</label>
              <div className="flex gap-2">
                <input value={documento} onChange={e => mudarDocumento(e.target.value)} inputMode="numeric" autoFocus
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
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={rotulo}>Data</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)} className={campo} />
            </div>
            <div>
              <label className={rotulo}>Número do pedido da lojinha</label>
              <input value={numero} onChange={e => setNumero(e.target.value)} placeholder="Ex.: 3625" className={campo} />
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
              {salvando ? <><Spinner size={14} /> Criando no Zen e no Pipefy…</> : <><Check size={15} /> Salvar na Entrada</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
