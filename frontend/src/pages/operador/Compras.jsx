// ============================================================
// pages/operador/Compras.jsx — Cotações, Comparação, Histórico e Dashboard
// ============================================================
import { useState, useEffect } from 'react';
import {
  RefreshCw, Plus, Check, X, ChevronDown, ChevronUp, Building2,
  TrendingUp, Clock, CheckCircle2, DollarSign
} from 'lucide-react';
import { comprasService, fornecedoresService } from '../../services/api';
import { Spinner } from '../../components/ui';

const ABAS = [
  { id: 'cotacoes',  label: 'Cotações' },
  { id: 'historico', label: 'Histórico de compras' },
  { id: 'dashboard', label: 'Dashboard' },
];

export default function Compras() {
  const [aba, setAba] = useState('cotacoes');
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-[#e8eaf0]">Compras</h1>
        <p className="text-sm text-[#8b91a8] mt-0.5">Cotações, comparação de fornecedores e histórico de compras</p>
      </div>

      <div className="flex gap-1 border-b border-[#2e3347]">
        {ABAS.map(a => (
          <button key={a.id} onClick={() => setAba(a.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors
              ${aba === a.id ? 'border-[#4f6ef7] text-[#e8eaf0]' : 'border-transparent text-[#8b91a8] hover:text-[#e8eaf0]'}`}>
            {a.label}
          </button>
        ))}
      </div>

      {aba === 'cotacoes'  && <AbaCotacoes />}
      {aba === 'historico' && <AbaHistorico />}
      {aba === 'dashboard' && <AbaDashboard />}
    </div>
  );
}

// ============================================================
// ABA: Cotações — lista de processos + comparação
// ============================================================
function AbaCotacoes() {
  const [processos, setProcessos] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [expandido, setExpandido] = useState(null);

  async function carregar() {
    setLoading(true);
    try {
      const { data } = await comprasService.listarProcessos();
      setProcessos(data.processos);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  const aguardando = processos.filter(p => p.status === 'aguardando_cotacao');
  const prontas    = processos.filter(p => p.status === 'pronta_aprovar');

  if (loading) return <div className="flex justify-center py-16"><Spinner className="text-[#4f6ef7]" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={carregar} className="p-2 rounded-xl text-[#8b91a8] hover:bg-[#2e3347] transition-colors">
          <RefreshCw size={15} />
        </button>
      </div>

      <Secao titulo={`Prontas para aprovar (${prontas.length})`} vazio="Nenhum processo com cotações suficientes ainda.">
        {prontas.map(p => (
          <ProcessoCard key={p.id} processo={p} expandido={expandido === p.id}
            onToggle={() => setExpandido(expandido === p.id ? null : p.id)}
            onAtualizar={carregar} />
        ))}
      </Secao>

      <Secao titulo={`Aguardando cotação (${aguardando.length})`} vazio="Nenhum processo aguardando cotação. Solicite pela tela de MRP.">
        {aguardando.map(p => (
          <ProcessoCard key={p.id} processo={p} expandido={expandido === p.id}
            onToggle={() => setExpandido(expandido === p.id ? null : p.id)}
            onAtualizar={carregar} />
        ))}
      </Secao>
    </div>
  );
}

function Secao({ titulo, vazio, children }) {
  const temItens = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div>
      <h2 className="text-sm font-semibold text-[#e8eaf0] mb-2">{titulo}</h2>
      {temItens ? (
        <div className="space-y-2">{children}</div>
      ) : (
        <p className="text-xs text-[#8b91a8] py-6 text-center bg-[#1a1d27] rounded-xl border border-[#2e3347]">{vazio}</p>
      )}
    </div>
  );
}

function ProcessoCard({ processo, expandido, onToggle, onAtualizar }) {
  const pronta = processo.status === 'pronta_aprovar';
  return (
    <div className={`rounded-xl border bg-[#1a1d27] overflow-hidden ${pronta ? 'border-green-500/30' : 'border-[#2e3347]'}`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3">
        <div className="text-left">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-[#4f6ef7]">{processo.material_codigo}</span>
            <span className="text-[10px] text-[#8b91a8]">{processo.categoria_nome}</span>
          </div>
          <p className="text-sm text-[#e8eaf0]">{processo.material_descricao}</p>
          <p className="text-[10px] text-[#8b91a8]">Necessidade: {processo.quantidade_necessaria} {processo.unidade}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-[10px] font-medium px-2 py-1 rounded-full ${pronta ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-400'}`}>
            {processo.total_cotacoes} cotação(ões)
          </span>
          {expandido ? <ChevronUp size={16} className="text-[#8b91a8]" /> : <ChevronDown size={16} className="text-[#8b91a8]" />}
        </div>
      </button>
      {expandido && <DetalheProcesso processoId={processo.id} onAtualizar={onAtualizar} />}
    </div>
  );
}

function DetalheProcesso({ processoId, onAtualizar }) {
  const [dados,       setDados]       = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [fornecedores, setFornecedores] = useState([]);
  const [form,        setForm]        = useState({ fornecedor_id: '', preco_unitario: '', prazo_dias: '', observacoes: '' });
  const [enviando,    setEnviando]    = useState(false);
  const [erro,        setErro]        = useState('');

  async function carregar() {
    setLoading(true);
    try {
      const [{ data: proc }, { data: forns }] = await Promise.all([
        comprasService.detalharProcesso(processoId),
        fornecedoresService.listar(),
      ]);
      setDados(proc);
      setFornecedores(forns.fornecedores);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, [processoId]);

  async function adicionarCotacao(e) {
    e.preventDefault();
    setErro('');
    if (!form.fornecedor_id || !form.preco_unitario) { setErro('Selecione o fornecedor e informe o preço.'); return; }
    setEnviando(true);
    try {
      await comprasService.adicionarCotacao(processoId, {
        fornecedor_id:  parseInt(form.fornecedor_id),
        preco_unitario: parseFloat(form.preco_unitario),
        prazo_dias:     form.prazo_dias ? parseInt(form.prazo_dias) : null,
        observacoes:    form.observacoes || null,
      });
      setForm({ fornecedor_id: '', preco_unitario: '', prazo_dias: '', observacoes: '' });
      await carregar();
      onAtualizar();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao adicionar cotação.');
    } finally { setEnviando(false); }
  }

  async function aprovar(cotacaoId) {
    if (!confirm('Confirma a aprovação desta compra com este fornecedor?')) return;
    try {
      await comprasService.aprovarCompra(processoId, cotacaoId);
      await carregar();
      onAtualizar();
    } catch (err) {
      alert(err.response?.data?.erro || 'Erro ao aprovar compra.');
    }
  }

  if (loading || !dados) return <div className="px-4 py-6 flex justify-center"><Spinner size={20} className="text-[#4f6ef7]" /></div>;

  const menorPreco = dados.cotacoes.length > 0 ? Math.min(...dados.cotacoes.map(c => parseFloat(c.preco_unitario))) : null;

  return (
    <div className="border-t border-[#2e3347] px-4 py-4 space-y-4">
      {/* Cotações recebidas */}
      {dados.cotacoes.length === 0 ? (
        <p className="text-xs text-[#8b91a8]">Nenhuma cotação registrada ainda.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {dados.cotacoes.map(c => {
            const melhor = parseFloat(c.preco_unitario) === menorPreco;
            return (
              <div key={c.id} className={`rounded-lg p-3 border ${melhor ? 'border-[#4f6ef7] bg-[#4f6ef7]/10' : 'border-[#2e3347] bg-[#0f1117]'}`}>
                {melhor && <span className="text-[10px] font-medium text-[#4f6ef7] bg-[#4f6ef7]/15 px-2 py-0.5 rounded-full">Melhor preço</span>}
                <p className="text-sm text-[#e8eaf0] font-medium mt-1 flex items-center gap-1.5">
                  <Building2 size={13} className="text-[#8b91a8]" /> {c.fornecedor_empresa}
                </p>
                <p className="text-xl font-bold text-[#e8eaf0] mt-1">
                  R$ {parseFloat(c.preco_unitario).toFixed(2)} <span className="text-xs font-normal text-[#8b91a8]">/un</span>
                </p>
                {c.prazo_dias && <p className="text-[11px] text-[#8b91a8]">Prazo: {c.prazo_dias} dias úteis</p>}
                {c.observacoes && <p className="text-[11px] text-[#8b91a8] mt-1">{c.observacoes}</p>}
                {dados.processo.status === 'pronta_aprovar' && (
                  <button onClick={() => aprovar(c.id)}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors">
                    <Check size={13} /> Aprovar esta compra
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {dados.processo.status === 'pronta_aprovar' && dados.cotacoes.length < 2 && (
        <p className="text-[11px] text-amber-400">É necessário no mínimo 2 cotações para aprovar a compra.</p>
      )}

      {/* Form nova cotação */}
      {!['aprovada', 'cancelada'].includes(dados.processo.status) && (
        <form onSubmit={adicionarCotacao} className="border-t border-[#2e3347] pt-3 space-y-2">
          <p className="text-xs font-medium text-[#8b91a8]">Registrar nova cotação</p>
          <div className="grid sm:grid-cols-4 gap-2">
            <select value={form.fornecedor_id} onChange={e => setForm(f => ({ ...f, fornecedor_id: e.target.value }))}
              className="bg-[#0f1117] border border-[#2e3347] text-[#e8eaf0] rounded-lg px-2 py-1.5 text-xs">
              <option value="">Fornecedor...</option>
              {fornecedores.map(f => <option key={f.id} value={f.id}>{f.empresa}</option>)}
            </select>
            <input type="number" step="0.01" min="0" placeholder="Preço unitário"
              value={form.preco_unitario} onChange={e => setForm(f => ({ ...f, preco_unitario: e.target.value }))}
              className="bg-[#0f1117] border border-[#2e3347] text-[#e8eaf0] rounded-lg px-2 py-1.5 text-xs" />
            <input type="number" min="0" placeholder="Prazo (dias)"
              value={form.prazo_dias} onChange={e => setForm(f => ({ ...f, prazo_dias: e.target.value }))}
              className="bg-[#0f1117] border border-[#2e3347] text-[#e8eaf0] rounded-lg px-2 py-1.5 text-xs" />
            <input type="text" placeholder="Observações (opcional)"
              value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
              className="bg-[#0f1117] border border-[#2e3347] text-[#e8eaf0] rounded-lg px-2 py-1.5 text-xs" />
          </div>
          {erro && <p className="text-[11px] text-red-400">{erro}</p>}
          <button type="submit" disabled={enviando}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#4f6ef7]/15 text-[#4f6ef7] hover:bg-[#4f6ef7]/25 disabled:opacity-40">
            <Plus size={13} /> {enviando ? 'Adicionando...' : 'Adicionar cotação'}
          </button>
        </form>
      )}
    </div>
  );
}

// ============================================================
// ABA: Histórico de compras
// ============================================================
function AbaHistorico() {
  const [compras, setCompras] = useState([]);
  const [totalGasto, setTotalGasto] = useState(0);
  const [loading, setLoading] = useState(true);

  async function carregar() {
    setLoading(true);
    try {
      const { data } = await comprasService.historico();
      setCompras(data.compras);
      setTotalGasto(data.total_gasto);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  if (loading) return <div className="flex justify-center py-16"><Spinner className="text-[#4f6ef7]" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#8b91a8]">{compras.length} compra(s) aprovada(s)</p>
        <p className="text-sm font-bold text-[#e8eaf0]">Total: R$ {totalGasto.toFixed(2)}</p>
      </div>
      {compras.length === 0 ? (
        <p className="text-xs text-[#8b91a8] py-10 text-center bg-[#1a1d27] rounded-xl border border-[#2e3347]">Nenhuma compra aprovada ainda.</p>
      ) : (
        <div className="space-y-2">
          {compras.map(c => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-[#2e3347] bg-[#1a1d27]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[#4f6ef7]">{c.material_codigo}</span>
                  <span className="text-[10px] text-[#8b91a8]">{c.categoria_nome}</span>
                </div>
                <p className="text-sm text-[#e8eaf0]">{c.material_descricao}</p>
                <p className="text-[11px] text-[#8b91a8]">{c.fornecedor_empresa} · {new Date(c.aprovado_em).toLocaleDateString('pt-BR')} · aprovado por {c.aprovado_por_nome || '—'}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-[#e8eaf0]">R$ {parseFloat(c.total).toFixed(2)}</p>
                <p className="text-[11px] text-[#8b91a8]">{c.quantidade_necessaria} {c.unidade} × R$ {parseFloat(c.preco_unitario).toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// ABA: Dashboard
// ============================================================
function AbaDashboard() {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    comprasService.dashboard()
      .then(({ data }) => setDados(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Spinner className="text-[#4f6ef7]" /></div>;
  if (!dados) return null;

  const cards = [
    { label: 'Aguardando cotação', valor: dados.pendentes.aguardando_cotacao, icon: Clock,       cor: 'text-amber-400',  bg: 'bg-amber-500/15' },
    { label: 'Prontas p/ aprovar', valor: dados.pendentes.pronta_aprovar,     icon: CheckCircle2, cor: 'text-green-400', bg: 'bg-green-500/15' },
    { label: 'Gasto no mês',       valor: `R$ ${dados.gasto_mes_atual.toFixed(2)}`, icon: DollarSign, cor: 'text-[#4f6ef7]', bg: 'bg-[#4f6ef7]/15' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map(c => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="flex items-center gap-3 p-4 rounded-2xl border border-[#2e3347] bg-[#1a1d27]">
              <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center shrink-0`}>
                <Icon size={17} className={c.cor} />
              </div>
              <div>
                <p className={`text-lg font-bold ${c.cor}`}>{c.valor}</p>
                <p className="text-xs text-[#8b91a8]">{c.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold text-[#e8eaf0] mb-2 flex items-center gap-1.5"><TrendingUp size={14} /> Gasto por fornecedor</h3>
          {dados.por_fornecedor.length === 0 ? (
            <p className="text-xs text-[#8b91a8]">Sem dados ainda.</p>
          ) : (
            <div className="space-y-1.5">
              {dados.por_fornecedor.map(f => (
                <div key={f.empresa} className="flex justify-between text-xs px-3 py-2 rounded-lg bg-[#1a1d27] border border-[#2e3347]">
                  <span className="text-[#e8eaf0]">{f.empresa}</span>
                  <span className="text-[#8b91a8]">{f.qtd_compras}x · R$ {parseFloat(f.total_gasto).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-[#e8eaf0] mb-2 flex items-center gap-1.5"><TrendingUp size={14} /> Gasto por categoria</h3>
          {dados.por_categoria.length === 0 ? (
            <p className="text-xs text-[#8b91a8]">Sem dados ainda.</p>
          ) : (
            <div className="space-y-1.5">
              {dados.por_categoria.map(c => (
                <div key={c.categoria} className="flex justify-between text-xs px-3 py-2 rounded-lg bg-[#1a1d27] border border-[#2e3347]">
                  <span className="text-[#e8eaf0]">{c.categoria}</span>
                  <span className="text-[#8b91a8]">R$ {parseFloat(c.total_gasto).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
