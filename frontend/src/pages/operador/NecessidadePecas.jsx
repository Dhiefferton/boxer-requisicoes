// ============================================================
// pages/operador/NecessidadePecas.jsx
// ============================================================
// Fluxo em 3 colunas: Solicitado -> Em andamento (revisão: define
// frete marítimo/aéreo) -> Aprovado (envia pra outro sistema —
// destino ainda não definido, por enquanto só prepara o pacote).

import { useState, useEffect, useRef } from 'react';
import { Plus, Ship, Plane, Check, X, Send, RefreshCw, Ban, Package } from 'lucide-react';
import { necessidadesPecasService, materiaisService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Spinner } from '../../components/ui';

function formatarData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function NecessidadePecas() {
  const { usuario } = useAuth();
  const podeRevisar = usuario?.perfil === 'operador' || usuario?.perfil === 'admin';

  const [itens,   setItens]   = useState([]);
  const [loading, setLoading] = useState(true);

  async function carregar() {
    try {
      const { data } = await necessidadesPecasService.listar();
      setItens(data.necessidades);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  const solicitados  = itens.filter(i => i.status === 'solicitado');
  const emAndamento  = itens.filter(i => i.status === 'em_andamento');
  const aprovados    = itens.filter(i => i.status === 'aprovado');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[#e8eaf0]">Necessidade de Peças</h1>
          <p className="text-sm text-[#8b91a8] mt-0.5">Registro, revisão e aprovação de necessidade de peças</p>
        </div>
        <button onClick={carregar} className="p-2 rounded-xl text-[#8b91a8] hover:bg-[#2e3347] transition-colors">
          <RefreshCw size={15} />
        </button>
      </div>

      <FormNovaSolicitacao onCriado={carregar} />

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="text-[#4f6ef7]" /></div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-4">
          <Coluna titulo="Solicitados" cor="border-blue-500/30" itens={solicitados}
            vazio="Nenhuma solicitação aberta.">
            {solicitados.map(item => (
              <CardSolicitado key={item.id} item={item} podeRevisar={podeRevisar} onAtualizar={carregar} />
            ))}
          </Coluna>

          <Coluna titulo="Em andamento" cor="border-amber-500/30" itens={emAndamento}
            vazio="Nenhum item em revisão.">
            {emAndamento.map(item => (
              <CardEmAndamento key={item.id} item={item} podeRevisar={podeRevisar} onAtualizar={carregar} />
            ))}
          </Coluna>

          <Coluna titulo="Aprovado" cor="border-green-500/30" itens={aprovados}
            vazio="Nenhum item aprovado ainda.">
            {aprovados.map(item => (
              <CardAprovado key={item.id} item={item} podeRevisar={podeRevisar} onAtualizar={carregar} />
            ))}
          </Coluna>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Formulário de nova solicitação
// ============================================================
function FormNovaSolicitacao({ onCriado }) {
  const [codigo,      setCodigo]      = useState('');
  const [quantidade,  setQuantidade]  = useState('');
  const [sugestao,    setSugestao]    = useState(null); // material encontrado
  const [buscando,    setBuscando]    = useState(false);
  const [enviando,    setEnviando]    = useState(false);
  const [erro,        setErro]        = useState('');
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSugestao(null);
    if (!codigo.trim()) return;
    debounceRef.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const { data } = await materiaisService.listar({ busca: codigo.trim(), limite: 5 });
        const encontrado = data.materiais?.find(m => m.codigo.toLowerCase() === codigo.trim().toLowerCase());
        setSugestao(encontrado || null);
      } catch { setSugestao(null); }
      finally { setBuscando(false); }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [codigo]);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');
    const qtd = parseInt(quantidade, 10);
    if (!codigo.trim()) { setErro('Informe o código.'); return; }
    if (!qtd || qtd <= 0) { setErro('Informe uma quantidade válida.'); return; }

    setEnviando(true);
    try {
      await necessidadesPecasService.criar(codigo.trim(), qtd);
      setCodigo(''); setQuantidade(''); setSugestao(null);
      onCriado();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao registrar a necessidade.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 rounded-2xl border border-[#2e3347] bg-[#1a1d27] space-y-2">
      <p className="text-xs font-medium text-[#8b91a8]">Registrar nova necessidade</p>
      <div className="grid sm:grid-cols-[180px_120px_1fr_auto] gap-2 items-start">
        <div>
          <input type="text" placeholder="Código" value={codigo} onChange={e => setCodigo(e.target.value)}
            className="w-full bg-[#0f1117] border border-[#2e3347] text-[#e8eaf0] rounded-lg px-3 py-2 text-sm" />
          {codigo.trim() && (
            <p className="text-[10px] mt-1">
              {buscando ? <span className="text-[#8b91a8]">buscando...</span>
                : sugestao ? <span className="text-green-400">✓ {sugestao.descricao}</span>
                : <span className="text-red-400">código não encontrado no catálogo</span>}
            </p>
          )}
        </div>
        <input type="number" min="1" placeholder="Quantidade" value={quantidade} onChange={e => setQuantidade(e.target.value)}
          className="bg-[#0f1117] border border-[#2e3347] text-[#e8eaf0] rounded-lg px-3 py-2 text-sm" />
        <div className="flex items-center text-xs text-[#8b91a8] px-1 py-2">
          Descrição e data são preenchidas automaticamente
        </div>
        <button type="submit" disabled={enviando || !sugestao}
          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-[#4f6ef7] text-white hover:bg-[#3d5ce5] disabled:opacity-40 transition-colors whitespace-nowrap">
          <Plus size={15} /> {enviando ? 'Enviando...' : 'Registrar'}
        </button>
      </div>
      {erro && <p className="text-xs text-red-400">{erro}</p>}
    </form>
  );
}

// ============================================================
// Coluna do kanban
// ============================================================
function Coluna({ titulo, cor, itens, vazio, children }) {
  return (
    <div>
      <div className={`flex items-center justify-between pb-2 mb-3 border-b-2 ${cor}`}>
        <h2 className="text-sm font-semibold text-[#e8eaf0]">{titulo}</h2>
        <span className="text-xs text-[#8b91a8] bg-[#1a1d27] border border-[#2e3347] rounded-full px-2 py-0.5">{itens.length}</span>
      </div>
      {itens.length === 0 ? (
        <p className="text-xs text-[#8b91a8] py-8 text-center bg-[#1a1d27] rounded-xl border border-[#2e3347]">{vazio}</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  );
}

function CabecalhoCard({ item }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-[#4f6ef7]">{item.codigo}</span>
      </div>
      <p className="text-sm text-[#e8eaf0]">{item.descricao}</p>
      <p className="text-[11px] text-[#8b91a8]">Qtd: {item.quantidade} · {formatarData(item.solicitado_em)} · por {item.solicitado_por_nome || '—'}</p>
    </div>
  );
}

// ============================================================
// Card — Solicitado
// ============================================================
function CardSolicitado({ item, podeRevisar, onAtualizar }) {
  const [carregando, setCarregando] = useState(false);

  async function iniciar() {
    setCarregando(true);
    try {
      await necessidadesPecasService.iniciarRevisao(item.id);
      onAtualizar();
    } catch (err) { alert(err.response?.data?.erro || 'Erro ao iniciar revisão.'); }
    finally { setCarregando(false); }
  }

  async function cancelar() {
    if (!confirm('Cancelar esta solicitação?')) return;
    try {
      await necessidadesPecasService.cancelar(item.id);
      onAtualizar();
    } catch (err) { alert(err.response?.data?.erro || 'Erro ao cancelar.'); }
  }

  return (
    <div className="p-3 rounded-xl border border-[#2e3347] bg-[#1a1d27] space-y-2">
      <CabecalhoCard item={item} />
      {podeRevisar && (
        <div className="flex gap-2 pt-1">
          <button onClick={iniciar} disabled={carregando}
            className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 disabled:opacity-40">
            {carregando ? 'Abrindo...' : 'Iniciar revisão →'}
          </button>
          <button onClick={cancelar} title="Cancelar" className="p-1.5 rounded-lg text-[#8b91a8] hover:text-red-400 hover:bg-red-500/10">
            <Ban size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Card — Em andamento (revisão: frete + observações, editável)
// ============================================================
function CardEmAndamento({ item, podeRevisar, onAtualizar }) {
  const [maritimo,  setMaritimo]  = useState(item.frete_maritimo);
  const [aereo,     setAereo]     = useState(item.frete_aereo);
  const [obs,       setObs]       = useState(item.observacoes || '');
  const [salvando,  setSalvando]  = useState(false);
  const [aprovando, setAprovando] = useState(false);

  async function salvar(campos) {
    setSalvando(true);
    try {
      await necessidadesPecasService.editar(item.id, campos);
      onAtualizar();
    } catch (err) { alert(err.response?.data?.erro || 'Erro ao salvar.'); }
    finally { setSalvando(false); }
  }

  async function aprovar() {
    if (!confirm('Aprovar esta necessidade de peça?')) return;
    setAprovando(true);
    try {
      await necessidadesPecasService.aprovar(item.id);
      onAtualizar();
    } catch (err) { alert(err.response?.data?.erro || 'Erro ao aprovar.'); }
    finally { setAprovando(false); }
  }

  return (
    <div className="p-3 rounded-xl border border-amber-500/20 bg-[#1a1d27] space-y-2">
      <CabecalhoCard item={item} />

      {podeRevisar ? (
        <>
          <div className="flex gap-2">
            <button onClick={() => { setMaritimo(!maritimo); salvar({ frete_maritimo: !maritimo }); }}
              className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium py-1.5 rounded-lg border transition-colors ${maritimo ? 'bg-blue-500/15 border-blue-500/30 text-blue-400' : 'border-[#2e3347] text-[#8b91a8] hover:text-[#e8eaf0]'}`}>
              <Ship size={13} /> Marítimo
            </button>
            <button onClick={() => { setAereo(!aereo); salvar({ frete_aereo: !aereo }); }}
              className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium py-1.5 rounded-lg border transition-colors ${aereo ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400' : 'border-[#2e3347] text-[#8b91a8] hover:text-[#e8eaf0]'}`}>
              <Plane size={13} /> Aéreo
            </button>
          </div>

          <textarea placeholder="Observações da revisão..." value={obs}
            onChange={e => setObs(e.target.value)}
            onBlur={() => salvar({ observacoes: obs })}
            rows={2}
            className="w-full bg-[#0f1117] border border-[#2e3347] text-[#e8eaf0] rounded-lg px-2.5 py-1.5 text-xs resize-none" />

          <button onClick={aprovar} disabled={aprovando}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 disabled:opacity-40">
            <Check size={13} /> {aprovando ? 'Aprovando...' : 'Aprovar'}
          </button>
        </>
      ) : (
        <div className="flex gap-2 text-[11px] text-[#8b91a8]">
          {item.frete_maritimo && <span className="flex items-center gap-1"><Ship size={12} /> Marítimo</span>}
          {item.frete_aereo && <span className="flex items-center gap-1"><Plane size={12} /> Aéreo</span>}
          {!item.frete_maritimo && !item.frete_aereo && <span>Em revisão...</span>}
        </div>
      )}
      {salvando && <p className="text-[10px] text-[#8b91a8]">salvando...</p>}
    </div>
  );
}

// ============================================================
// Card — Aprovado (botão de enviar pro outro sistema)
// ============================================================
function CardAprovado({ item, podeRevisar, onAtualizar }) {
  const [enviando, setEnviando] = useState(false);
  const [aviso,    setAviso]    = useState('');

  async function enviar() {
    setEnviando(true);
    setAviso('');
    try {
      const { data } = await necessidadesPecasService.enviar(item.id);
      setAviso(data.aviso || 'Enviado.');
      onAtualizar();
    } catch (err) { alert(err.response?.data?.erro || 'Erro ao enviar.'); }
    finally { setEnviando(false); }
  }

  return (
    <div className="p-3 rounded-xl border border-green-500/20 bg-[#1a1d27] space-y-2">
      <CabecalhoCard item={item} />
      <div className="flex gap-2 text-[11px] text-[#8b91a8]">
        {item.frete_maritimo && <span className="flex items-center gap-1"><Ship size={12} /> Marítimo</span>}
        {item.frete_aereo && <span className="flex items-center gap-1"><Plane size={12} /> Aéreo</span>}
      </div>

      {item.enviado_outro_sistema ? (
        <div className="text-[11px] text-green-400 flex items-center gap-1.5 py-1">
          <Check size={13} /> Enviado em {formatarData(item.enviado_em)}
        </div>
      ) : podeRevisar ? (
        <button onClick={enviar} disabled={enviando}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg bg-[#4f6ef7]/15 text-[#4f6ef7] hover:bg-[#4f6ef7]/25 disabled:opacity-40">
          <Send size={13} /> {enviando ? 'Enviando...' : 'Enviar'}
        </button>
      ) : null}

      {aviso && <p className="text-[10px] text-amber-400">{aviso}</p>}
    </div>
  );
}
