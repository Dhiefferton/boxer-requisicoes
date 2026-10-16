// ============================================================
// pages/operador/LojinhaBoxer.jsx — Lojinha Boxer
// ============================================================
// Registro dos pedidos da Lojinha: cliente (CPF/CNPJ buscado no Zen),
// data, número do pedido da lojinha e tipo de envio.
// Próximas etapas: criar o pedido no Zen e o card no Pipefy.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { Store, Search, Check, RefreshCw, Truck, Package, Mail, Building2, ExternalLink, AlertTriangle } from 'lucide-react';
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
const fmtDataHora = (d) => (d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

const ICONE_ENVIO = { Sedex: Mail, PAC: Package, 'Próprio': Truck, Transportadora: Building2 };

export default function LojinhaBoxer() {
  const [config, setConfig] = useState({ tipos_envio: ['Sedex', 'PAC', 'Próprio', 'Transportadora'], transportadoras: [] });
  const [documento, setDocumento] = useState('');
  const [cliente, setCliente] = useState(null);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [erroCliente, setErroCliente] = useState('');
  const [data, setData] = useState(hojeISO());
  const [numero, setNumero] = useState('');
  const [tipo, setTipo] = useState('');
  const [transportadora, setTransportadora] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [pedidos, setPedidos] = useState(null);
  const [busca, setBusca] = useState('');
  const ultimaBusca = useRef('');

  async function carregar() {
    try { const { data } = await lojinhaService.pedidos(); setPedidos(data.pedidos); }
    catch { setPedidos([]); }
  }
  useEffect(() => {
    lojinhaService.config().then(r => setConfig(r.data)).catch(() => {});
    carregar();
  }, []);

  // Busca o cliente no Zen assim que o documento fica completo (11 ou 14 dígitos)
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

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setOk('');
    if (!cliente) { setErro('Busque o cliente pelo CPF/CNPJ.'); return; }
    if (!numero.trim()) { setErro('Informe o número do pedido da lojinha.'); return; }
    if (!tipo) { setErro('Escolha o tipo de envio.'); return; }
    if (tipo === 'Transportadora' && !transportadora.trim()) { setErro('Escolha a transportadora.'); return; }
    setSalvando(true);
    try {
      const { data: r } = await lojinhaService.criar({
        documento: soDigitos(documento), cliente_id_zen: cliente.id, cliente_nome: cliente.nome,
        cliente_cidade: [cliente.cidade, cliente.uf].filter(Boolean).join(' / '), cliente_uf: cliente.uf || '',
        data, numero_pedido: numero.trim(), tipo_envio: tipo, transportadora,
      });
      const pd = r.pedido;
      setOk(pd.pipefy_card_id
        ? `Pedido ${pd.numero_pedido} registrado e card criado no Pipefy (Peças p/ Envio → Entrada).${pd.pipefy_avisos ? ' ' + pd.pipefy_avisos : ''}`
        : `Pedido ${pd.numero_pedido} registrado, mas o card do Pipefy não foi criado: ${pd.pipefy_erro || 'erro desconhecido'}. Use "Reenviar" na lista.`);
      setDocumento(''); setCliente(null); setNumero(''); setTipo(''); setTransportadora(''); setData(hojeISO());
      carregar();
    } catch (e2) { setErro(e2.response?.data?.erro || 'Erro ao salvar o pedido.'); }
    finally { setSalvando(false); }
  }

  const [reenviando, setReenviando] = useState(null);
  async function reenviar(p) {
    setReenviando(p.id);
    try {
      const { data: r } = await lojinhaService.reenviar(p.id);
      if (!r.pedido.pipefy_card_id) alert(`Não consegui criar o card: ${r.pedido.pipefy_erro}`);
      carregar();
    } catch (e) { alert(e.response?.data?.erro || 'Erro ao reenviar.'); }
    finally { setReenviando(null); }
  }

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return pedidos || [];
    return (pedidos || []).filter(p => [p.numero_pedido, p.cliente_nome, p.documento, p.tipo_envio, p.transportadora]
      .some(v => String(v || '').toLowerCase().includes(t)));
  }, [pedidos, busca]);

  const campo = 'w-full bg-[var(--c-fundo)] border border-[var(--c-borda)] text-[var(--c-texto)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[var(--c-destaque)]';
  const rotulo = 'block text-xs text-[var(--c-suave)] mb-1.5';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Store size={20} className="text-[var(--c-destaque)]" />
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[var(--c-texto)]">Lojinha Boxer</h1>
          <p className="text-xs sm:text-sm text-[var(--c-suave)]">Registro dos pedidos da Lojinha</p>
        </div>
      </div>

      <form onSubmit={salvar} className="bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl p-4 sm:p-5 space-y-4">
        <b className="text-sm text-[var(--c-texto)]">Novo pedido</b>

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

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-[200px_1fr]">
          <div>
            <label className={rotulo}>Data</label>
            <input type="date" value={data} onChange={e => setData(e.target.value)} className={campo} />
          </div>
          <div>
            <label className={rotulo}>Número do pedido da lojinha</label>
            <input value={numero} onChange={e => setNumero(e.target.value)} placeholder="Ex.: 1234" className={campo} />
          </div>
        </div>

        <div>
          <label className={rotulo}>Tipo de envio</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {config.tipos_envio.map(t => {
              const Icone = ICONE_ENVIO[t] || Package;
              const ativo = tipo === t;
              return (
                <button key={t} type="button" onClick={() => { setTipo(t); if (t !== 'Transportadora') setTransportadora(''); }}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors ${ativo
                    ? 'bg-[var(--c-destaque)] border-[var(--c-destaque)] text-white'
                    : 'border-[var(--c-borda)] text-[var(--c-texto)] hover:border-[var(--c-destaque)]'}`}>
                  <Icone size={15} /> {t}
                </button>
              );
            })}
          </div>
        </div>

        {tipo === 'Transportadora' && (
          <div className="max-w-md">
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

        {erro && <p className="text-sm text-red-400">{erro}</p>}
        {ok && <p className="text-sm text-green-400">{ok}</p>}
        <div className="flex justify-end">
          <button type="submit" disabled={salvando}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--c-destaque)] text-white text-sm font-semibold disabled:opacity-50">
            {salvando ? <><Spinner size={14} /> Salvando…</> : <><Check size={15} /> Salvar pedido</>}
          </button>
        </div>
      </form>

      <div className="bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <b className="text-sm text-[var(--c-texto)]">Pedidos registrados</b>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-suave)]" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pedido, cliente, documento…"
                className="bg-[var(--c-fundo)] border border-[var(--c-borda)] text-[var(--c-texto)] rounded-xl pl-8 pr-3 py-1.5 text-xs w-56" />
            </div>
            <button onClick={carregar} className="p-2 rounded-xl border border-[var(--c-borda)] text-[var(--c-suave)]" title="Atualizar"><RefreshCw size={14} /></button>
          </div>
        </div>
        {!pedidos ? <div className="flex justify-center py-8"><Spinner size={22} className="text-[var(--c-destaque)]" /></div>
          : !filtrados.length ? <p className="text-sm text-[var(--c-suave)] text-center py-8">Nenhum pedido registrado.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-[13px]">
                <thead><tr className="text-left text-[var(--c-suave)] text-[11px]">
                  {['Data', 'Pedido', 'Cliente', 'CPF / CNPJ', 'Envio', 'Pipefy', 'Registrado por'].map(h => <th key={h} className="px-2 py-2 font-semibold whitespace-nowrap">{h}</th>)}
                </tr></thead>
                <tbody>
                  {filtrados.map(p => (
                    <tr key={p.id} className="border-t border-[var(--c-borda)]">
                      <td className="px-2 py-2 whitespace-nowrap">{fmtData(p.data)}</td>
                      <td className="px-2 py-2 font-mono font-semibold whitespace-nowrap">{p.numero_pedido}</td>
                      <td className="px-2 py-2 min-w-[200px]">{p.cliente_nome}{p.cliente_cidade && <span className="block text-[11px] text-[var(--c-suave)]">{p.cliente_cidade}</span>}</td>
                      <td className="px-2 py-2 font-mono whitespace-nowrap">{mascararDocumento(p.documento)}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{p.tipo_envio}{p.transportadora && <span className="block text-[11px] text-[var(--c-suave)]">{p.transportadora}</span>}</td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {p.pipefy_card_id ? (
                          <a href={p.pipefy_url || `https://app.pipefy.com/open-cards/${p.pipefy_card_id}`} target="_blank" rel="noreferrer"
                            title={p.pipefy_avisos || ''}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">
                            <Check size={11} /> Card {p.pipefy_card_id} <ExternalLink size={10} />
                          </a>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span title={p.pipefy_erro || ''} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
                              <AlertTriangle size={11} /> Sem card
                            </span>
                            <button onClick={() => reenviar(p)} disabled={reenviando === p.id}
                              className="text-[11px] px-2 py-0.5 rounded-lg border border-[var(--c-borda)] text-[var(--c-texto)] disabled:opacity-50">
                              {reenviando === p.id ? 'Enviando…' : 'Reenviar'}
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">{p.criado_por_nome?.split(' ')[0]}<span className="block text-[11px] text-[var(--c-suave)]">{fmtDataHora(p.criado_em)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}
