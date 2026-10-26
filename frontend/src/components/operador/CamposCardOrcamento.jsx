// ============================================================
// components/operador/CamposCardOrcamento.jsx — Todos os campos do card
// ============================================================
// Mostra os campos preenchidos do card (os mesmos do Pipefy), agrupados
// pela fase em que são preenchidos. O admin pode editar: a edição fica
// gravada no B-Requisições (vale mais que o valor do Pipefy) e não é
// enviada ao Pipefy. Os demais só visualizam.
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { X, Pencil, Save, Paperclip, RotateCcw } from 'lucide-react';
import { pedidosOrcamentoService } from '../../services/api';
import { Spinner } from '../ui';

let estruturaCache = null;
async function carregarEstrutura() {
  if (!estruturaCache) {
    estruturaCache = pedidosOrcamentoService.estrutura().then(r => r.data.fases)
      .catch(e => { estruturaCache = null; throw e; });
  }
  return estruturaCache;
}

// Valor do Pipefy: texto ou lista em JSON ('["A","B"]')
export function valorLista(v) {
  if (v === null || v === undefined || v === '') return [];
  const s = String(v).trim();
  if (s.startsWith('[')) {
    try { const a = JSON.parse(s); if (Array.isArray(a)) return a.map(x => String(x)).filter(Boolean); } catch { /* texto */ }
  }
  return [s];
}
const nomeArquivo = (url) => {
  try { return decodeURIComponent(new URL(url).pathname.split('/').pop() || url); } catch { return url; }
};
const MULTI = ['checklist_vertical', 'checklist_horizontal', 'label_select'];
const ESCOLHA = ['select', 'radio_vertical', 'radio_horizontal'];
const SO_LEITURA = ['attachment', 'id'];

function Valor({ campo, valor }) {
  const lista = valorLista(valor);
  if (!lista.length) return <span className="text-[var(--c-suave)]">—</span>;
  if (campo?.tipo === 'attachment') {
    return (
      <div className="flex flex-col gap-0.5">
        {lista.map((u, i) => /^https?:\/\//.test(u)
          ? <a key={i} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--c-destaque)] hover:underline break-all"><Paperclip size={11} />{nomeArquivo(u)}</a>
          : <span key={i}>{u}</span>)}
      </div>
    );
  }
  return <span className="whitespace-pre-wrap break-words">{lista.join(', ')}</span>;
}

function Editor({ campo, valor, onChange }) {
  const cls = 'w-full bg-[var(--c-fundo)] border border-[var(--c-borda)] rounded-lg px-2 py-1 text-xs text-[var(--c-texto)] focus:outline-none focus:border-[var(--c-destaque)]';
  if (MULTI.includes(campo.tipo) && campo.opcoes?.length) {
    const sel = valorLista(valor);
    const alternar = (o) => {
      const n = sel.includes(o) ? sel.filter(x => x !== o) : [...sel, o];
      onChange(n.length ? JSON.stringify(n) : '');
    };
    return (
      <div className="flex flex-wrap gap-2">
        {campo.opcoes.map(o => (
          <label key={o} className="flex items-center gap-1 text-xs text-[var(--c-texto)]">
            <input type="checkbox" checked={sel.includes(o)} onChange={() => alternar(o)} /> {o}
          </label>
        ))}
      </div>
    );
  }
  if (ESCOLHA.includes(campo.tipo) && campo.opcoes?.length) {
    const atual = valorLista(valor)[0] || '';
    return (
      <select value={atual} onChange={e => onChange(e.target.value)} className={cls}>
        <option value="">—</option>
        {campo.opcoes.map(o => <option key={o} value={o}>{o}</option>)}
        {atual && !campo.opcoes.includes(atual) && <option value={atual}>{atual}</option>}
      </select>
    );
  }
  const texto = valorLista(valor).join(', ');
  if (campo.tipo === 'long_text') return <textarea rows={3} value={texto} onChange={e => onChange(e.target.value)} className={cls} />;
  return <input value={texto} onChange={e => onChange(e.target.value)} className={cls} />;
}

export default function CamposCardOrcamento({ pedido, ehAdmin, onFechar, onSalvo }) {
  const [fases, setFases] = useState(null);
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregarEstrutura().then(setFases).catch(e => setErro(e.response?.data?.erro || 'Não consegui ler as fases do Pipefy.'));
  }, []);

  // Valores: Pipefy, com as edições feitas aqui por cima
  const doPipefy = useMemo(() => Object.fromEntries((Array.isArray(pedido.pipefy_campos) ? pedido.pipefy_campos : [])
    .filter(c => c?.id).map(c => [c.id, c.valor])), [pedido.pipefy_campos]);
  const editados = pedido.campos_editados || {};
  const valorDe = (id) => (id in rascunho ? rascunho[id] : id in editados ? editados[id] : doPipefy[id]);
  const temValor = (id) => valorLista(valorDe(id)).length > 0;

  // Campos do card que não estão na estrutura (ex.: campo removido do pipe)
  const conhecidos = new Set((fases || []).flatMap(f => f.campos.map(c => c.id)));
  const outros = (Array.isArray(pedido.pipefy_campos) ? pedido.pipefy_campos : [])
    .filter(c => c?.id && !conhecidos.has(c.id)).map(c => ({ id: c.id, rotulo: c.nome, tipo: 'short_text', opcoes: [] }));
  const grupos = fases ? [...fases, ...(outros.length ? [{ faseId: 'outros', nome: 'Outros campos', campos: outros }] : [])] : [];

  async function salvar() {
    setSalvando(true); setErro('');
    try {
      await pedidosOrcamentoService.editarCampos(pedido.id, rascunho);
      setRascunho({}); setEditando(false); onSalvo?.();
    } catch (e) { setErro(e.response?.data?.erro || 'Erro ao salvar os campos.'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3" onClick={onFechar}>
      <div className="w-full max-w-2xl max-h-[90dvh] flex flex-col bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--c-borda)]">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[var(--c-texto)] truncate">{pedido.cliente_nome || pedido.referencia}</p>
            <p className="text-[11px] text-[var(--c-suave)]">Campos do card{pedido.pipefy_card_id ? ` · Pipefy #${pedido.pipefy_card_id}` : ''}{!ehAdmin ? ' · somente visualização' : ''}</p>
          </div>
          {ehAdmin && !editando && fases && (
            <button onClick={() => setEditando(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--c-destaque)]/15 text-[var(--c-destaque)]"><Pencil size={12} /> Editar</button>
          )}
          {editando && <>
            <button onClick={() => { setRascunho({}); setEditando(false); }} className="px-3 py-1.5 rounded-lg text-xs text-[var(--c-suave)] hover:text-[var(--c-texto)]">Cancelar</button>
            <button onClick={salvar} disabled={salvando || !Object.keys(rascunho).length}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--c-destaque)] text-white disabled:opacity-40">
              {salvando ? <Spinner size={12} /> : <Save size={12} />} Salvar
            </button>
          </>}
          <button onClick={onFechar} className="p-1 text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          {erro && <p className="text-xs text-red-400">{erro}</p>}
          {!fases && !erro && <div className="flex justify-center py-10"><Spinner className="text-[var(--c-destaque)]" /></div>}
          {editando && <p className="text-[11px] text-amber-400">A edição fica gravada só no B-Requisições (não altera o card no Pipefy). Anexos não são editáveis por aqui.</p>}
          {grupos.map(g => {
            const lista = editando ? g.campos.filter(c => !SO_LEITURA.includes(c.tipo) || temValor(c.id)) : g.campos.filter(c => temValor(c.id));
            if (!lista.length) return null;
            return (
              <div key={g.faseId}>
                <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--c-suave)] mb-1.5">{g.nome}</p>
                <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  {lista.map(c => (
                    <div key={c.id} className={`min-w-0 ${c.tipo === 'long_text' || c.tipo === 'attachment' ? 'sm:col-span-2' : ''}`}>
                      <dt className="text-[var(--c-suave)] flex items-center gap-1">
                        {c.rotulo}
                        {c.id in editados && !(c.id in rascunho) && (
                          <span title="Editado no B-Requisições" className="text-[10px] text-amber-400">(editado)</span>
                        )}
                        {editando && c.id in editados && !(c.id in rascunho) && (
                          <button title="Voltar ao valor do Pipefy" onClick={() => setRascunho(r => ({ ...r, [c.id]: '' }))}
                            className="text-[var(--c-suave)] hover:text-[var(--c-texto)]"><RotateCcw size={10} /></button>
                        )}
                      </dt>
                      <dd className="text-[var(--c-texto)] mt-0.5">
                        {editando && !SO_LEITURA.includes(c.tipo)
                          ? <Editor campo={c} valor={valorDe(c.id)} onChange={v => setRascunho(r => ({ ...r, [c.id]: v }))} />
                          : <Valor campo={c} valor={valorDe(c.id)} />}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
          {fases && !editando && !grupos.some(g => g.campos.some(c => temValor(c.id))) && (
            <p className="text-xs text-[var(--c-suave)] text-center py-6">Nenhum campo preenchido neste card.</p>
          )}
        </div>
      </div>
    </div>
  );
}
