// ============================================================
// pages/operador/Compras.jsx — Cards de Compra, Comparação, Histórico e Dashboard
// ============================================================
import { useState, useEffect } from 'react';
import {
  RefreshCw, Plus, Check, ChevronDown, ChevronUp, Building2,
  TrendingUp, TrendingDown, Clock, CheckCircle2, DollarSign, Trash2, Ban, Truck, Pencil,
  Package, Layers
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, LabelList
} from 'recharts';
import { comprasService, fornecedoresService } from '../../services/api';
import { Spinner } from '../../components/ui';

const ABAS = [
  { id: 'cotacoes',       label: 'Cotações' },
  { id: 'acompanhamento', label: 'Acompanhamento' },
  { id: 'historico',      label: 'Histórico de compras' },
  { id: 'dashboard',      label: 'Dashboard' },
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

      {aba === 'cotacoes'       && <AbaCotacoes />}
      {aba === 'acompanhamento' && <AbaAcompanhamento />}
      {aba === 'historico'      && <AbaHistorico />}
      {aba === 'dashboard'      && <AbaDashboard />}
    </div>
  );
}

// Classifica um card pelo estado combinado dos itens dentro dele
function statusDoCard(itens) {
  const ativos = itens.filter(i => i.status !== 'cancelada');
  if (ativos.length === 0) return 'cancelado';
  if (ativos.every(i => i.status === 'aprovado')) return 'aprovado';
  if (ativos.some(i => i.status === 'pronta_aprovar')) return 'pronta_aprovar';
  return 'aguardando_cotacao';
}

// ============================================================
// ABA: Cotações — lista de cards agrupados por categoria + comparação
// ============================================================
function AbaCotacoes() {
  const [processos, setProcessos] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [expandido, setExpandido] = useState(null);

  async function carregar() {
    setLoading(true);
    try {
      const { data } = await comprasService.listarProcessos();
      // esconde cards onde todos os itens já foram cancelados
      setProcessos(data.processos.filter(p => p.itens.some(i => i.status !== 'cancelada')));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  const prontos     = processos.filter(p => statusDoCard(p.itens) === 'pronta_aprovar');
  const aguardando  = processos.filter(p => statusDoCard(p.itens) === 'aguardando_cotacao');

  if (loading) return <div className="flex justify-center py-16"><Spinner className="text-[#4f6ef7]" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={carregar} className="p-2 rounded-xl text-[#8b91a8] hover:bg-[#2e3347] transition-colors">
          <RefreshCw size={15} />
        </button>
      </div>

      <Secao titulo={`Aguardando cotação (${aguardando.length})`} vazio="Nenhum card aguardando cotação. Solicite pela tela de MRP.">
        {agruparPorCategoria(aguardando).map(([categoria, cards]) => (
          <GrupoCategoria key={categoria} categoria={categoria}>
            {cards.map(p => (
              <CardProcesso key={p.id} processo={p} expandido={expandido === p.id}
                onToggle={() => setExpandido(expandido === p.id ? null : p.id)}
                onAtualizar={carregar} />
            ))}
          </GrupoCategoria>
        ))}
      </Secao>

      <Secao titulo={`Prontas para aprovar (${prontos.length})`} vazio="Nenhum card com itens prontos para aprovar ainda.">
        {agruparPorCategoria(prontos).map(([categoria, cards]) => (
          <GrupoCategoria key={categoria} categoria={categoria}>
            {cards.map(p => (
              <CardProcesso key={p.id} processo={p} expandido={expandido === p.id}
                onToggle={() => setExpandido(expandido === p.id ? null : p.id)}
                onAtualizar={carregar} />
            ))}
          </GrupoCategoria>
        ))}
      </Secao>
    </div>
  );
}

// Agrupa cards por categoria predominante. Um card pode ter itens de
// categorias diferentes; nesse caso ele aparece em "Múltiplas categorias".
function agruparPorCategoria(lista) {
  const grupos = {};
  lista.forEach(p => {
    const categoriasDoCard = [...new Set(p.itens.map(i => i.categoria_nome || 'Sem categoria'))];
    const chave = categoriasDoCard.length === 1 ? categoriasDoCard[0] : 'Múltiplas categorias';
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push(p);
  });
  return Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b));
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

function GrupoCategoria({ categoria, children }) {
  return (
    <div className="mb-4 last:mb-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8b91a8] mb-1.5">{categoria}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function CardProcesso({ processo, expandido, onToggle, onAtualizar }) {
  const itensAtivos = processo.itens.filter(i => i.status !== 'cancelada');
  const prontosCount = itensAtivos.filter(i => i.status === 'pronta_aprovar').length;
  const temAprovado  = itensAtivos.some(i => i.status === 'aprovado');

  async function excluirCard(e) {
    e.stopPropagation();
    if (!confirm(`Excluir este card com ${itensAtivos.length} item(ns) de vez? Essa ação não pode ser desfeita.`)) return;
    try {
      await comprasService.excluirProcesso(processo.id);
      onAtualizar();
    } catch (err) {
      alert(err.response?.data?.erro || 'Erro ao excluir card.');
    }
  }

  async function cancelarCard(e) {
    e.stopPropagation();
    if (!confirm('Cancelar os itens pendentes deste card?')) return;
    try {
      await comprasService.cancelarProcesso(processo.id);
      onAtualizar();
    } catch (err) {
      alert('Erro ao cancelar card.');
    }
  }

  return (
    <div className={`rounded-xl border bg-[#1a1d27] overflow-hidden ${prontosCount > 0 ? 'border-green-500/30' : 'border-[#2e3347]'}`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3">
        <div className="text-left">
          <p className="text-sm text-[#e8eaf0] font-medium">Card #{processo.id} · {itensAtivos.length} item(ns)</p>
          <p className="text-[10px] text-[#8b91a8]">
            {itensAtivos.map(i => i.material_codigo).join(', ')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {prontosCount > 0 && (
            <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-green-500/15 text-green-400">
              {prontosCount} pronto(s) p/ aprovar
            </span>
          )}
          <button title="Cancelar itens pendentes" onClick={cancelarCard}
            className="p-1.5 rounded-lg text-[#8b91a8] hover:text-amber-400 hover:bg-amber-500/10">
            <Ban size={14} />
          </button>
          {!temAprovado && (
            <button title="Excluir card" onClick={excluirCard}
              className="p-1.5 rounded-lg text-[#8b91a8] hover:text-red-400 hover:bg-red-500/10">
              <Trash2 size={14} />
            </button>
          )}
          {expandido ? <ChevronUp size={16} className="text-[#8b91a8]" /> : <ChevronDown size={16} className="text-[#8b91a8]" />}
        </div>
      </button>
      {expandido && (
        <div className="border-t border-[#2e3347] divide-y divide-[#2e3347]/60">
          {itensAtivos.map(item => (
            <DetalheItem key={item.id} processoId={processo.id} item={item} onAtualizar={onAtualizar} />
          ))}
        </div>
      )}
    </div>
  );
}

function DetalheItem({ processoId, item, onAtualizar }) {
  const [dados,        setDados]        = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [fornecedores, setFornecedores] = useState([]);
  const [form,         setForm]         = useState({ fornecedor_id: '', preco_unitario: '', prazo_dias: '', observacoes: '' });
  const [enviando,     setEnviando]     = useState(false);
  const [erro,         setErro]         = useState('');
  const [editandoQtd,  setEditandoQtd]  = useState(false);
  const [novaQtd,      setNovaQtd]      = useState('');
  const [salvandoQtd,  setSalvandoQtd]  = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      const [{ data: detalhe }, { data: forns }] = await Promise.all([
        comprasService.detalharItem(processoId, item.id),
        fornecedoresService.listar(),
      ]);
      setDados(detalhe);
      setFornecedores(forns.fornecedores);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, [item.id]);

  async function adicionarCotacao(e) {
    e.preventDefault();
    setErro('');
    if (!form.fornecedor_id || !form.preco_unitario) { setErro('Selecione o fornecedor e informe o preço.'); return; }
    setEnviando(true);
    try {
      await comprasService.adicionarCotacao(processoId, item.id, {
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
    if (!confirm('Confirma a aprovação deste item com este fornecedor?')) return;
    try {
      await comprasService.aprovarItem(processoId, item.id, cotacaoId);
      await carregar();
      onAtualizar();
    } catch (err) {
      alert(err.response?.data?.erro || 'Erro ao aprovar.');
    }
  }

  async function cancelarItem() {
    if (!confirm('Cancelar este item?')) return;
    try {
      await comprasService.cancelarItem(processoId, item.id);
      onAtualizar();
    } catch (err) {
      alert(err.response?.data?.erro || 'Erro ao cancelar item.');
    }
  }

  function abrirEdicaoQtd() {
    setNovaQtd(String(item.quantidade_necessaria));
    setEditandoQtd(true);
  }

  async function salvarQtd() {
    const valor = parseInt(novaQtd, 10);
    if (!valor || valor <= 0) { alert('Informe uma quantidade válida.'); return; }
    setSalvandoQtd(true);
    try {
      await comprasService.editarQuantidade(processoId, item.id, valor);
      setEditandoQtd(false);
      await carregar();
      onAtualizar();
    } catch (err) {
      alert(err.response?.data?.erro || 'Erro ao atualizar quantidade.');
    } finally {
      setSalvandoQtd(false);
    }
  }

  if (loading || !dados) return <div className="px-4 py-4 flex justify-center"><Spinner size={18} className="text-[#4f6ef7]" /></div>;

  const menorPreco = dados.cotacoes.length > 0 ? Math.min(...dados.cotacoes.map(c => parseFloat(c.preco_unitario))) : null;

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-[#4f6ef7]">{item.material_codigo}</span>
            <span className="text-[10px] text-[#8b91a8]">{item.categoria_nome}</span>
          </div>
          <p className="text-sm text-[#e8eaf0]">{item.material_descricao}</p>
          {editandoQtd ? (
            <div className="flex items-center gap-1.5 mt-1">
              <input type="number" min="1" value={novaQtd} onChange={e => setNovaQtd(e.target.value)}
                autoFocus className="w-20 bg-[#0f1117] border border-[#4f6ef7] text-[#e8eaf0] rounded-lg px-2 py-1 text-[11px]" />
              <span className="text-[10px] text-[#8b91a8]">{item.unidade}</span>
              <button onClick={salvarQtd} disabled={salvandoQtd}
                className="text-[10px] font-medium text-green-400 hover:text-green-300 disabled:opacity-40">
                {salvandoQtd ? '...' : 'Salvar'}
              </button>
              <button onClick={() => setEditandoQtd(false)} className="text-[10px] text-[#8b91a8] hover:text-[#e8eaf0]">Cancelar</button>
            </div>
          ) : (
            <p className="text-[10px] text-[#8b91a8] flex items-center gap-1">
              Necessidade: {item.quantidade_necessaria} {item.unidade}
              {item.status !== 'aprovado' && (
                <button onClick={abrirEdicaoQtd} title="Editar quantidade" className="text-[#8b91a8] hover:text-[#4f6ef7]">
                  <Pencil size={11} />
                </button>
              )}
            </p>
          )}
        </div>
        {item.status !== 'aprovado' && (
          <button onClick={cancelarItem} title="Cancelar item" className="p-1.5 rounded-lg text-[#8b91a8] hover:text-amber-400 hover:bg-amber-500/10">
            <Ban size={13} />
          </button>
        )}
      </div>

      {item.status === 'aprovado' ? (
        <p className="text-xs text-green-400 flex items-center gap-1.5"><CheckCircle2 size={13} /> Aprovado — veja no Histórico de compras</p>
      ) : (
        <>
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
                    <p className="text-[11px] text-[#8b91a8]">
                      Total ({item.quantidade_necessaria} {item.unidade}): {' '}
                      <span className="text-[#e8eaf0] font-medium">R$ {(parseFloat(c.preco_unitario) * item.quantidade_necessaria).toFixed(2)}</span>
                    </p>
                    {c.prazo_dias && <p className="text-[11px] text-[#8b91a8]">Prazo: {c.prazo_dias} dias úteis</p>}
                    {c.observacoes && <p className="text-[11px] text-[#8b91a8] mt-1">{c.observacoes}</p>}
                    {item.status === 'pronta_aprovar' && (
                      <button onClick={() => aprovar(c.id)}
                        className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors">
                        <Check size={13} /> Aprovar este item
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {item.status === 'pronta_aprovar' && dados.cotacoes.length < 2 && (
            <p className="text-[11px] text-amber-400">É necessário no mínimo 2 cotações para aprovar.</p>
          )}

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
        </>
      )}
    </div>
  );
}

// Extrai só a parte YYYY-MM-DD, não importa se vier como 'YYYY-MM-DD' ou ISO completo com hora
function somenteData(valor) {
  if (!valor) return null;
  return String(valor).slice(0, 10);
}

// Calcula quantos dias faltam (ou de atraso) até a entrega planejada
function statusEntrega(dataPrevistaEntrega) {
  const dataStr = somenteData(dataPrevistaEntrega);
  if (!dataStr) return { texto: 'Sem prazo informado', cor: 'text-[#8b91a8]', bg: 'bg-[#2e3347]' };
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const prevista = new Date(dataStr + 'T00:00:00');
  const dias = Math.round((prevista - hoje) / (1000 * 60 * 60 * 24));

  if (dias < 0) return { texto: `Atrasado ${Math.abs(dias)} dia(s)`, cor: 'text-red-400', bg: 'bg-red-500/15' };
  if (dias === 0) return { texto: 'Entrega hoje', cor: 'text-green-400', bg: 'bg-green-500/15' };
  return { texto: `${dias} Faltante(s)`, cor: 'text-green-400', bg: 'bg-green-500/15' };
}

// ============================================================
// ABA: Acompanhamento — pedidos aprovados aguardando chegar
// ============================================================
function AbaAcompanhamento() {
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notaFiscal, setNotaFiscal] = useState({});
  const [confirmando, setConfirmando] = useState(null);

  async function carregar() {
    setLoading(true);
    try {
      const { data } = await comprasService.acompanhamento();
      setItens(data.itens);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  async function confirmarEntrega(item) {
    const nf = notaFiscal[item.id];
    if (!nf || !nf.trim()) { alert('Informe o número da nota fiscal antes de confirmar.'); return; }
    if (!confirm(`Confirmar entrega de ${item.quantidade_necessaria} ${item.unidade} de ${item.material_descricao}? Isso vai gerar entrada de estoque automaticamente.`)) return;
    setConfirmando(item.id);
    try {
      await comprasService.confirmarEntrega(item.processo_id, item.id, nf);
      await carregar();
    } catch (err) {
      alert(err.response?.data?.erro || 'Erro ao confirmar entrega.');
    } finally {
      setConfirmando(null);
    }
  }

  async function cancelarPedido(item) {
    if (!confirm(`Cancelar a solicitação de ${item.material_descricao}? Como a entrega ainda não foi confirmada, isso não afeta o estoque.`)) return;
    try {
      await comprasService.cancelarItem(item.processo_id, item.id);
      await carregar();
    } catch (err) {
      alert(err.response?.data?.erro || 'Erro ao cancelar.');
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner className="text-[#4f6ef7]" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#8b91a8]">{itens.length} pedido(s) aprovado(s) aguardando chegar</p>
        <button onClick={carregar} className="p-2 rounded-xl text-[#8b91a8] hover:bg-[#2e3347] transition-colors">
          <RefreshCw size={15} />
        </button>
      </div>

      {itens.length === 0 ? (
        <p className="text-xs text-[#8b91a8] py-10 text-center bg-[#1a1d27] rounded-xl border border-[#2e3347]">Nenhum pedido aguardando entrega.</p>
      ) : (
        <div className="space-y-2">
          {itens.map(item => {
            const st = statusEntrega(item.data_prevista_entrega);
            return (
              <div key={item.id} className="rounded-xl border border-[#2e3347] bg-[#1a1d27] p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-[#4f6ef7]">{item.material_codigo}</span>
                      <span className="text-[10px] text-[#8b91a8]">{item.categoria_nome}</span>
                    </div>
                    <p className="text-sm text-[#e8eaf0]">{item.material_descricao}</p>
                    <p className="text-[11px] text-[#8b91a8] flex items-center gap-1 mt-0.5">
                      <Building2 size={11} /> {item.fornecedor_vencedor} · {item.quantidade_necessaria} {item.unidade}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[10px] font-medium px-2 py-1 rounded-full flex items-center gap-1 ${st.bg} ${st.cor}`}>
                      <Truck size={11} /> {st.texto}
                    </span>
                    <button onClick={() => cancelarPedido(item)} title="Cancelar solicitação"
                      className="p-1.5 rounded-lg text-[#8b91a8] hover:text-red-400 hover:bg-red-500/10">
                      <Ban size={13} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div>
                    <p className="text-[#8b91a8]">Data Solicitada</p>
                    <p className="text-[#e8eaf0]">{new Date(item.aprovado_em).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <div>
                    <p className="text-[#8b91a8]">Entrega Planejada</p>
                    <p className="text-[#e8eaf0]">
                      {(() => {
                        const d = somenteData(item.data_prevista_entrega);
                        return d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
                      })()}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 border-t border-[#2e3347] pt-3">
                  <input type="text" placeholder="Número da nota fiscal"
                    value={notaFiscal[item.id] || ''}
                    onChange={e => setNotaFiscal(prev => ({ ...prev, [item.id]: e.target.value }))}
                    className="flex-1 bg-[#0f1117] border border-[#2e3347] text-[#e8eaf0] rounded-lg px-3 py-1.5 text-xs" />
                  <button onClick={() => confirmarEntrega(item)} disabled={confirmando === item.id}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500/15 text-green-400 hover:bg-green-500/25 disabled:opacity-40">
                    <CheckCircle2 size={13} /> {confirmando === item.id ? 'Confirmando...' : 'Confirmar entrega'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
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
        <p className="text-xs text-[#8b91a8]">{compras.length} item(ns) comprado(s)</p>
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
                <p className="text-[11px] text-[#8b91a8]">{c.fornecedor_empresa} · aprovado {new Date(c.aprovado_em).toLocaleDateString('pt-BR')} · por {c.aprovado_por_nome || '—'}</p>
                {c.numero_nota_fiscal && (
                  <p className="text-[11px] text-[#8b91a8]">
                    NF {c.numero_nota_fiscal} · recebido em {new Date(c.recebido_em).toLocaleDateString('pt-BR')}
                  </p>
                )}
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
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const CORES_DONUT = ['#4f6ef7', '#f97316', '#10b981', '#eab308', '#ec4899', '#8b5cf6', '#06b6d4', '#f43f5e', '#84cc16', '#a855f7'];

function TooltipCustom({ active, payload, label, formatador }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f1117] border border-[#2e3347] rounded-lg px-3 py-2 text-xs shadow-xl">
      {label && <p className="text-[#e8eaf0] font-medium mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill }}>{p.name}: {formatador ? formatador(p.value) : p.value}</p>
      ))}
    </div>
  );
}

function AbaDashboard() {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState(null); // null = ano inteiro
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    setLoading(true);
    setErro(null);
    comprasService.dashboard({ ano, ...(mes ? { mes } : {}) })
      .then(({ data }) => setDados(data))
      .catch(err => {
        console.error(err);
        setErro(err.response?.data?.erro || err.message || 'Erro ao carregar o dashboard.');
      })
      .finally(() => setLoading(false));
  }, [ano, mes]);

  const anosDisponiveis = [anoAtual, anoAtual - 1, anoAtual - 2];

  const dadosMensais = MESES.map((nome, idx) => {
    const registro = dados?.por_mes.find(m => m.mes === idx + 1);
    return { mes: nome, valor: registro ? parseFloat(registro.valor) : 0, quantidade: registro ? parseInt(registro.quantidade) : 0 };
  });

  const dadosEconomiaMensal = MESES.map((nome, idx) => {
    const registro = dados?.economia_por_mes.find(m => m.mes === idx + 1);
    return { mes: nome, economia: registro ? parseFloat(registro.economia) : 0 };
  });

  const totalCategorias = dados?.por_categoria.reduce((s, c) => s + parseFloat(c.total_gasto), 0) || 0;
  const dadosDonut = (dados?.por_categoria || []).map((c, i) => ({
    name: c.categoria,
    value: parseFloat(c.total_gasto),
    percentual: totalCategorias > 0 ? (parseFloat(c.total_gasto) / totalCategorias * 100) : 0,
    cor: CORES_DONUT[i % CORES_DONUT.length],
  }));

  const formatarMoeda = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      {/* Filtro de período */}
      <div className="flex flex-wrap items-center gap-2">
        {anosDisponiveis.map(a => (
          <button key={a} onClick={() => setAno(a)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${ano === a ? 'bg-[#4f6ef7] text-white' : 'bg-[#1a1d27] text-[#8b91a8] border border-[#2e3347] hover:text-[#e8eaf0]'}`}>
            {a}
          </button>
        ))}
        <div className="w-px h-5 bg-[#2e3347] mx-1" />
        <button onClick={() => setMes(null)}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${mes === null ? 'bg-[#4f6ef7] text-white' : 'bg-[#1a1d27] text-[#8b91a8] border border-[#2e3347] hover:text-[#e8eaf0]'}`}>
          Ano todo
        </button>
        {MESES.map((nome, idx) => (
          <button key={nome} onClick={() => setMes(idx + 1)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${mes === idx + 1 ? 'bg-[#4f6ef7] text-white' : 'bg-[#1a1d27] text-[#8b91a8] border border-[#2e3347] hover:text-[#e8eaf0]'}`}>
            {nome}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="text-[#4f6ef7]" /></div>
      ) : erro ? (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {erro}
        </div>
      ) : !dados ? null : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-center gap-3 p-4 rounded-2xl border border-[#2e3347] bg-[#1a1d27]">
              <div className="w-10 h-10 rounded-xl bg-[#4f6ef7]/15 flex items-center justify-center shrink-0"><DollarSign size={19} className="text-[#4f6ef7]" /></div>
              <div>
                <p className="text-xl font-bold text-[#4f6ef7]">{formatarMoeda(dados.gasto_total)}</p>
                <p className="text-xs text-[#8b91a8]">Gasto {mes ? `em ${MESES[mes - 1]}` : `em ${ano}`}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-2xl border border-[#2e3347] bg-[#1a1d27]">
              <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0"><Package size={19} className="text-green-400" /></div>
              <div>
                <p className="text-xl font-bold text-green-400">{dados.qtd_produtos}</p>
                <p className="text-xs text-[#8b91a8]">Qtd. Produtos comprados</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-2xl border border-[#2e3347] bg-[#1a1d27]">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0"><Layers size={19} className="text-amber-400" /></div>
              <div>
                <p className="text-xl font-bold text-amber-400">{dados.qtd_categorias}</p>
                <p className="text-xs text-[#8b91a8]">Qtd. Categorias</p>
              </div>
            </div>
          </div>

          {/* Gasto/Qtd Mensal + Donut por categoria */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl border border-[#2e3347] bg-[#1a1d27]">
              <h3 className="text-sm font-semibold text-[#e8eaf0] mb-3">Gasto / Qtd. Mensal — {ano}</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dadosMensais} margin={{ top: 20, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2e3347" vertical={false} />
                  <XAxis dataKey="mes" stroke="#8b91a8" fontSize={11} tickLine={false} axisLine={{ stroke: '#2e3347' }} />
                  <YAxis stroke="#8b91a8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<TooltipCustom formatador={formatarMoeda} />} cursor={{ fill: '#2e334740' }} />
                  <Bar dataKey="valor" name="Valor" fill="#4f6ef7" radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="quantidade" position="insideTop" fill="#e8eaf0" fontSize={10} formatter={v => v > 0 ? v : ''} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="p-4 rounded-2xl border border-[#2e3347] bg-[#1a1d27]">
              <h3 className="text-sm font-semibold text-[#e8eaf0] mb-3">Valor / Porcentagem por Categoria</h3>
              {dadosDonut.length === 0 ? (
                <p className="text-xs text-[#8b91a8] py-16 text-center">Sem dados no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={dadosDonut} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                      {dadosDonut.map((d, i) => <Cell key={i} fill={d.cor} stroke="#1a1d27" strokeWidth={2} />)}
                    </Pie>
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return <div className="bg-[#0f1117] border border-[#2e3347] rounded-lg px-3 py-2 text-xs"><p style={{ color: d.cor }}>{d.name}: {formatarMoeda(d.value)} ({d.percentual.toFixed(1)}%)</p></div>;
                    }} />
                    <Legend layout="vertical" align="right" verticalAlign="middle" iconSize={8}
                      formatter={(value, entry) => <span className="text-[10px] text-[#8b91a8]">{value} ({entry.payload.percentual.toFixed(1)}%)</span>} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Por solicitante + Por produto */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl border border-[#2e3347] bg-[#1a1d27]">
              <h3 className="text-sm font-semibold text-[#e8eaf0] mb-3">Qtd. por Solicitante</h3>
              {dados.por_solicitante.length === 0 ? (
                <p className="text-xs text-[#8b91a8] py-6 text-center">Sem dados no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(180, dados.por_solicitante.length * 34)}>
                  <BarChart data={dados.por_solicitante} layout="vertical" margin={{ left: 8, right: 24 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="solicitante" stroke="#8b91a8" fontSize={11} width={110} tickLine={false} axisLine={false} />
                    <Tooltip content={<TooltipCustom />} cursor={{ fill: '#2e334740' }} />
                    <Bar dataKey="quantidade" name="Qtd" fill="#06b6d4" radius={[0, 6, 6, 0]}>
                      <LabelList dataKey="quantidade" position="right" fill="#e8eaf0" fontSize={11} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="p-4 rounded-2xl border border-[#2e3347] bg-[#1a1d27]">
              <h3 className="text-sm font-semibold text-[#e8eaf0] mb-3">Qtd. por Produto</h3>
              {dados.por_produto.length === 0 ? (
                <p className="text-xs text-[#8b91a8] py-6 text-center">Sem dados no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(180, dados.por_produto.length * 34)}>
                  <BarChart data={dados.por_produto} layout="vertical" margin={{ left: 8, right: 24 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="codigo" stroke="#8b91a8" fontSize={11} width={70} tickLine={false} axisLine={false} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return <div className="bg-[#0f1117] border border-[#2e3347] rounded-lg px-3 py-2 text-xs max-w-[220px]"><p className="text-[#e8eaf0]">{d.descricao}</p><p className="text-[#f97316]">Qtd: {d.quantidade}</p></div>;
                    }} cursor={{ fill: '#2e334740' }} />
                    <Bar dataKey="quantidade" name="Qtd" fill="#f97316" radius={[0, 6, 6, 0]}>
                      <LabelList dataKey="quantidade" position="right" fill="#e8eaf0" fontSize={11} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Redução de preço */}
          <div className="p-4 rounded-2xl border border-[#2e3347] bg-[#1a1d27]">
            <h3 className="text-sm font-semibold text-[#e8eaf0] mb-1 flex items-center gap-1.5"><TrendingDown size={15} className="text-green-400" /> Redução no Preço — Economia por mês</h3>
            <p className="text-[11px] text-[#8b91a8] mb-3">Compara o preço de cada item com a compra anterior mais recente dele.</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dadosEconomiaMensal} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2e3347" vertical={false} />
                <XAxis dataKey="mes" stroke="#8b91a8" fontSize={11} tickLine={false} axisLine={{ stroke: '#2e3347' }} />
                <YAxis stroke="#8b91a8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `R$${v}`} />
                <Tooltip content={<TooltipCustom formatador={formatarMoeda} />} cursor={{ fill: '#2e334740' }} />
                <Bar dataKey="economia" name="Economia" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            {dados.reducao_preco.length === 0 ? (
              <p className="text-xs text-[#8b91a8] mt-3 text-center py-4">Nenhum item teve o preço reduzido em {ano} até agora.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[#8b91a8] border-b border-[#2e3347]">
                      <th className="py-2 pr-3 font-medium">Código</th>
                      <th className="py-2 pr-3 font-medium">Descrição</th>
                      <th className="py-2 pr-3 font-medium text-right">Preço anterior</th>
                      <th className="py-2 pr-3 font-medium text-right">Preço atual</th>
                      <th className="py-2 pr-3 font-medium text-right">Redução</th>
                      <th className="py-2 font-medium text-right">Economia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.reducao_preco.map((r, i) => (
                      <tr key={i} className="border-b border-[#2e3347]/50">
                        <td className="py-2 pr-3 font-mono text-[#4f6ef7]">{r.codigo}</td>
                        <td className="py-2 pr-3 text-[#e8eaf0]">{r.descricao}</td>
                        <td className="py-2 pr-3 text-right text-[#8b91a8] line-through">{formatarMoeda(r.preco_anterior)}</td>
                        <td className="py-2 pr-3 text-right text-[#e8eaf0] font-medium">{formatarMoeda(r.preco_atual)}</td>
                        <td className="py-2 pr-3 text-right text-green-400 font-medium">-{r.reducao_percentual}%</td>
                        <td className="py-2 text-right text-green-400">{formatarMoeda(r.economia_estimada)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Tabela de produtos */}
          <div className="p-4 rounded-2xl border border-[#2e3347] bg-[#1a1d27]">
            <h3 className="text-sm font-semibold text-[#e8eaf0] mb-3">Produtos</h3>
            {dados.tabela_produtos.length === 0 ? (
              <p className="text-xs text-[#8b91a8] py-6 text-center">Sem dados no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[#8b91a8] border-b border-[#2e3347]">
                      <th className="py-2 pr-3 font-medium">Código</th>
                      <th className="py-2 pr-3 font-medium">Descrição</th>
                      <th className="py-2 pr-3 font-medium text-right">Qtd.</th>
                      <th className="py-2 font-medium text-right">Valor Gasto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.tabela_produtos.map((p, i) => (
                      <tr key={i} className="border-b border-[#2e3347]/50">
                        <td className="py-2 pr-3 font-mono text-[#4f6ef7]">{p.codigo}</td>
                        <td className="py-2 pr-3 text-[#e8eaf0]">{p.descricao}</td>
                        <td className="py-2 pr-3 text-right text-[#8b91a8]">{p.quantidade}</td>
                        <td className="py-2 text-right text-[#e8eaf0] font-medium">{formatarMoeda(p.valor_gasto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
