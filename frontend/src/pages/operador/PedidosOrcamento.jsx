// ============================================================
// pages/operador/PedidosOrcamento.jsx
// ============================================================
// V1: estrutura básica (3 colunas: Solicitação -> Separando ->
// Finalizado). Ainda sem puxar dados do Pipefy nem gerar pedido no
// ZenERP — vem nos próximos passos.

import { useState, useEffect } from 'react';
import { Plus, ArrowRight, RefreshCw, Ban, FileText } from 'lucide-react';
import { pedidosOrcamentoService } from '../../services/api';
import { Spinner } from '../../components/ui';

const COLUNAS = [
  { status: 'solicitacao', titulo: 'Solicitação', cor: 'border-blue-500/30' },
  { status: 'separando',   titulo: 'Separando',   cor: 'border-amber-500/30' },
  { status: 'finalizado',  titulo: 'Finalizado',  cor: 'border-green-500/30' },
];

function formatarData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function PedidosOrcamento() {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);

  async function carregar() {
    try {
      const { data } = await pedidosOrcamentoService.listar();
      setPedidos(data.pedidos);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[#e8eaf0]">Pedidos de Orçamento</h1>
          <p className="text-sm text-[#8b91a8] mt-0.5">Solicitação, separação e finalização de pedidos de orçamento</p>
        </div>
        <button onClick={carregar} className="p-2 rounded-xl text-[#8b91a8] hover:bg-[#2e3347] transition-colors">
          <RefreshCw size={15} />
        </button>
      </div>

      <FormNovoPedido onCriado={carregar} />

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="text-[#4f6ef7]" /></div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-4">
          {COLUNAS.map(({ status, titulo, cor }) => {
            const itens = pedidos.filter(p => p.status === status);
            return (
              <Coluna key={status} titulo={titulo} cor={cor} total={itens.length}>
                {itens.length === 0 ? (
                  <p className="text-xs text-[#8b91a8] py-8 text-center bg-[#1a1d27] rounded-xl border border-[#2e3347]">Nenhum pedido aqui.</p>
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

function Coluna({ titulo, cor, total, children }) {
  return (
    <div>
      <div className={`flex items-center justify-between pb-2 mb-3 border-b-2 ${cor}`}>
        <h2 className="text-sm font-semibold text-[#e8eaf0]">{titulo}</h2>
        <span className="text-xs text-[#8b91a8] bg-[#1a1d27] border border-[#2e3347] rounded-full px-2 py-0.5">{total}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function FormNovoPedido({ onCriado }) {
  const [referencia,  setReferencia]  = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [enviando,     setEnviando]   = useState(false);
  const [erro,         setErro]       = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');
    if (!referencia.trim()) { setErro('Informe uma referência.'); return; }
    setEnviando(true);
    try {
      await pedidosOrcamentoService.criar(referencia.trim(), observacoes.trim() || null);
      setReferencia(''); setObservacoes('');
      onCriado();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao registrar o pedido.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 rounded-2xl border border-[#2e3347] bg-[#1a1d27] space-y-2">
      <p className="text-xs font-medium text-[#8b91a8]">Registrar novo pedido de orçamento</p>
      <div className="grid sm:grid-cols-[1fr_2fr_auto] gap-2">
        <input type="text" placeholder="Referência (ex: nº do card, cliente...)" value={referencia}
          onChange={e => setReferencia(e.target.value)}
          className="bg-[#0f1117] border border-[#2e3347] text-[#e8eaf0] rounded-lg px-3 py-2 text-sm" />
        <input type="text" placeholder="Observações (opcional)" value={observacoes}
          onChange={e => setObservacoes(e.target.value)}
          className="bg-[#0f1117] border border-[#2e3347] text-[#e8eaf0] rounded-lg px-3 py-2 text-sm" />
        <button type="submit" disabled={enviando}
          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-[#4f6ef7] text-white hover:bg-[#3d5ce5] disabled:opacity-40 transition-colors whitespace-nowrap">
          <Plus size={15} /> {enviando ? 'Enviando...' : 'Registrar'}
        </button>
      </div>
      {erro && <p className="text-xs text-red-400">{erro}</p>}
    </form>
  );
}

function CardPedido({ pedido, onAtualizar }) {
  const [mudando, setMudando] = useState(false);
  const indiceAtual = COLUNAS.findIndex(c => c.status === pedido.status);
  const proxima = COLUNAS[indiceAtual + 1];

  async function avancar() {
    setMudando(true);
    try {
      await pedidosOrcamentoService.mover(pedido.id, proxima.status);
      onAtualizar();
    } catch (err) { alert(err.response?.data?.erro || 'Erro ao mover.'); }
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
        <p className="text-sm text-[#e8eaf0] font-medium">{pedido.referencia}</p>
      </div>
      {pedido.observacoes && <p className="text-xs text-[#8b91a8]">{pedido.observacoes}</p>}
      <p className="text-[11px] text-[#8b91a8]">{formatarData(pedido.created_at)} · por {pedido.criado_por_nome || '—'}</p>

      <div className="flex gap-2 pt-1">
        {proxima && (
          <button onClick={avancar} disabled={mudando}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg bg-[#4f6ef7]/15 text-[#4f6ef7] hover:bg-[#4f6ef7]/25 disabled:opacity-40">
            {mudando ? 'Movendo...' : <>Mover p/ {proxima.titulo} <ArrowRight size={13} /></>}
          </button>
        )}
        <button onClick={cancelar} title="Cancelar" className="p-1.5 rounded-lg text-[#8b91a8] hover:text-red-400 hover:bg-red-500/10">
          <Ban size={14} />
        </button>
      </div>
    </div>
  );
}
