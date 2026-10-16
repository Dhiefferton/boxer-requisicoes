// ============================================================
// pages/operador/LojinhaBoxer.jsx — Lojinha Boxer
// ============================================================
// Duas colunas: Entrada e Liberação.
// Entrada: cliente (CPF/CNPJ buscado no Zen), data, produtos (SKU do
// catálogo, só com saldo), nº do pedido da lojinha, vendedora e envio.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { Store, Search, Check, RefreshCw, Truck, Package, Mail, Building2, Plus, X, Trash2, ClipboardList, Send, User } from 'lucide-react';
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
const ICONE_ENVIO = { Sedex: Mail, PAC: Package, 'Próprio': Truck, Transportadora: Building2 };

const campo = 'w-full bg-[var(--c-fundo)] border border-[var(--c-borda)] text-[var(--c-texto)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[var(--c-destaque)]';
const rotulo = 'block text-xs text-[var(--c-suave)] mb-1.5';

export default function LojinhaBoxer() {
  const [config, setConfig] = useState({ tipos_envio: ['Sedex', 'PAC', 'Próprio', 'Transportadora'], transportadoras: [], vendedoras: [] });
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

  const entrada = useMemo(() => (pedidos || []).filter(p => p.status === 'entrada'), [pedidos]);
  const liberacao = useMemo(() => (pedidos || []).filter(p => p.status === 'liberacao'), [pedidos]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Store size={20} className="text-[var(--c-destaque)]" />
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-[var(--c-texto)]">Lojinha Boxer</h1>
            <p className="text-xs sm:text-sm text-[var(--c-suave)]">Pedidos da Lojinha</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={carregar} className="p-2.5 rounded-xl border border-[var(--c-borda)] text-[var(--c-suave)]" title="Atualizar"><RefreshCw size={15} /></button>
          <button onClick={() => { setNovo(true); setAviso(''); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--c-destaque)] text-white text-sm font-semibold">
            <Plus size={16} /> Novo pedido
          </button>
        </div>
      </div>

      {aviso && <p className="text-sm text-green-400">{aviso}</p>}

      <div className="grid gap-4 md:grid-cols-2 items-start">
        <Coluna titulo="1. Entrada" Icone={ClipboardList} pedidos={entrada} carregando={!pedidos}
          vazio="Nenhum pedido na Entrada." onNovo={() => setNovo(true)} />
        <Coluna titulo="2. Liberação" Icone={Send} pedidos={liberacao} carregando={!pedidos}
          vazio="Nenhum pedido em Liberação." />
      </div>

      {novo && (
        <NovoPedido config={config} onFechar={() => setNovo(false)}
          onSalvo={(p) => { setNovo(false); setAviso(`Pedido ${p.numero_pedido} registrado na Entrada.`); carregar(); }} />
      )}
    </div>
  );
}

function Coluna({ titulo, Icone, pedidos, carregando, vazio, onNovo }) {
  return (
    <div className="bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl p-3 space-y-3 min-h-[200px]">
      <div className="flex items-center justify-between px-1">
        <b className="flex items-center gap-2 text-sm text-[var(--c-texto)]"><Icone size={15} className="text-[var(--c-destaque)]" /> {titulo}</b>
        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--c-borda)] text-[var(--c-texto)]">{pedidos.length}</span>
      </div>
      {carregando ? <div className="flex justify-center py-8"><Spinner size={22} className="text-[var(--c-destaque)]" /></div>
        : !pedidos.length ? (
          <div className="text-center py-8 text-sm text-[var(--c-suave)]">
            {vazio}
            {onNovo && <button onClick={onNovo} className="block mx-auto mt-2 text-[var(--c-destaque)] font-semibold">+ Novo pedido</button>}
          </div>
        ) : pedidos.map(p => <CardPedido key={p.id} p={p} />)}
    </div>
  );
}

function CardPedido({ p }) {
  const itens = Array.isArray(p.itens) ? p.itens : [];
  const [aberto, setAberto] = useState(false);
  return (
    <div className="rounded-xl border border-[var(--c-borda)] bg-[var(--c-fundo)] p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono font-semibold text-sm text-[var(--c-texto)]">Pedido {p.numero_pedido}</span>
        <span className="text-[11px] text-[var(--c-suave)]">{fmtData(p.data)}</span>
      </div>
      <p className="text-[13px] font-semibold text-[var(--c-texto)] leading-snug">{p.cliente_nome}</p>
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
              <span className="shrink-0 font-semibold">{fmtQtd(i.quantidade)} {i.unidade}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-[var(--c-suave)]">Registrado por {p.criado_por_nome?.split(' ')[0] || '—'}</p>
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
  const [buscandoSku, setBuscandoSku] = useState(false);
  const [erroSku, setErroSku] = useState('');
  const [numero, setNumero] = useState('');
  const [vendedora, setVendedora] = useState('');
  const [tipo, setTipo] = useState('');
  const [transportadora, setTransportadora] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const ultimaBusca = useRef('');
  const skuRef = useRef(null);

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
    setBuscandoSku(true);
    try {
      const { data: r } = await lojinhaService.produto(codigo);
      const p = r.produto;
      const jaTem = itens.find(i => i.codigo === p.codigo);
      const total = (jaTem?.quantidade || 0) + q;
      if (total > p.saldo) { setErroSku(`SKU ${p.codigo}: só há ${fmtQtd(p.saldo)} ${p.unidade} em estoque.`); return; }
      setItens(lista => jaTem
        ? lista.map(i => (i.codigo === p.codigo ? { ...i, quantidade: total } : i))
        : [...lista, { codigo: p.codigo, descricao: p.descricao, unidade: p.unidade, saldo: p.saldo, quantidade: q }]);
      setSku(''); setQtd('1');
      skuRef.current?.focus();
    } catch (e2) { setErroSku(e2.response?.data?.erro || 'Erro ao buscar o SKU.'); }
    finally { setBuscandoSku(false); }
  }

  async function salvar() {
    setErro('');
    if (!cliente) { setErro('Busque o cliente pelo CPF/CNPJ.'); return; }
    if (!itens.length) { setErro('Inclua pelo menos um produto.'); return; }
    if (!numero.trim()) { setErro('Informe o número do pedido da lojinha.'); return; }
    if (!vendedora.trim()) { setErro('Informe a vendedora.'); return; }
    if (!tipo) { setErro('Escolha o tipo de envio.'); return; }
    if (tipo === 'Transportadora' && !transportadora.trim()) { setErro('Escolha a transportadora.'); return; }
    setSalvando(true);
    try {
      const { data: r } = await lojinhaService.criar({
        documento: soDigitos(documento), cliente_id_zen: cliente.id, cliente_nome: cliente.nome,
        cliente_cidade: [cliente.cidade, cliente.uf].filter(Boolean).join(' / '), cliente_uf: cliente.uf || '',
        data, itens: itens.map(i => ({ codigo: i.codigo, quantidade: i.quantidade })),
        numero_pedido: numero.trim(), vendedora: vendedora.trim(), tipo_envio: tipo, transportadora: transportadora.trim(),
      });
      onSalvo(r.pedido);
    } catch (e) { setErro(e.response?.data?.erro || 'Erro ao salvar o pedido.'); }
    finally { setSalvando(false); }
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
              {config.vendedoras.length ? (
                <select value={vendedora} onChange={e => setVendedora(e.target.value)} className={campo}>
                  <option value="">Selecione…</option>
                  {config.vendedoras.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : (
                <input value={vendedora} onChange={e => setVendedora(e.target.value)} placeholder="Nome da vendedora" className={campo} />
              )}
            </div>
          </div>

          {/* 3. Produtos */}
          <div>
            <label className={rotulo}>Produtos</label>
            <form onSubmit={incluirProduto} className="flex gap-2">
              <input ref={skuRef} value={sku} onChange={e => { setSku(e.target.value); setErroSku(''); }} placeholder="SKU" className={`${campo} font-mono`} />
              <input value={qtd} onChange={e => setQtd(e.target.value)} inputMode="decimal" className={`${campo} w-24 text-center`} title="Quantidade" />
              <button type="submit" disabled={buscandoSku}
                className="flex items-center gap-1.5 px-4 rounded-xl bg-[var(--c-borda)] text-[var(--c-texto)] text-sm font-semibold disabled:opacity-50 shrink-0">
                {buscandoSku ? <Spinner size={14} /> : <Plus size={15} />} Incluir
              </button>
            </form>
            {erroSku && <p className="text-xs text-red-400 mt-1">{erroSku}</p>}
            {itens.length > 0 && (
              <div className="mt-2 rounded-xl border border-[var(--c-borda)] divide-y divide-[var(--c-borda)]">
                {itens.map(i => (
                  <div key={i.codigo} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="font-mono font-semibold text-[var(--c-texto)] shrink-0">{i.codigo}</span>
                    <span className="flex-1 min-w-0 truncate text-[var(--c-texto)]">{i.descricao}</span>
                    <span className="text-[11px] text-[var(--c-suave)] shrink-0 hidden sm:inline">saldo {fmtQtd(i.saldo)}</span>
                    <b className="shrink-0 text-[var(--c-texto)]">{fmtQtd(i.quantidade)} {i.unidade}</b>
                    <button onClick={() => setItens(l => l.filter(x => x.codigo !== i.codigo))} className="p-1 text-[var(--c-suave)] hover:text-red-400" title="Remover"><Trash2 size={14} /></button>
                  </div>
                ))}
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
                  <button key={t} type="button" onClick={() => { setTipo(t); if (t !== 'Transportadora') setTransportadora(''); }} className={botao(tipo === t)}>
                    <Icone size={15} /> {t}
                  </button>
                );
              })}
            </div>
            {tipo === 'Transportadora' && (
              <div className="max-w-md mt-3">
                <label className={rotulo}>Transportadora</label>
                {config.transportadoras.length ? (
                  <select value={transportadora} onChange={e => setTransportadora(e.target.value)} className={campo}>
                    <option value="">Selecione…</option>
                    {config.transportadoras.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                ) : (
                  <>
                    <input value={transportadora} onChange={e => setTransportadora(e.target.value)} placeholder="Nome da transportadora" className={campo} />
                    <p className="text-[11px] text-[var(--c-suave)] mt-1">A lista de transportadoras ainda vai ser cadastrada — por enquanto, digite o nome.</p>
                  </>
                )}
              </div>
            )}
          </div>

          {erro && <p className="text-sm text-red-400">{erro}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onFechar} className="px-4 py-2.5 rounded-xl border border-[var(--c-borda)] text-sm text-[var(--c-texto)]">Cancelar</button>
            <button onClick={salvar} disabled={salvando}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--c-destaque)] text-white text-sm font-semibold disabled:opacity-50">
              {salvando ? <><Spinner size={14} /> Salvando…</> : <><Check size={15} /> Salvar na Entrada</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
