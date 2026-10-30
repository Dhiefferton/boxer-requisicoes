// ============================================================
// components/operador/CamposCardOrcamento.jsx — Todos os campos do card
// ============================================================
// Mostra os campos preenchidos do card (os mesmos do Pipefy), agrupados
// pela fase em que são preenchidos. O admin pode editar: a edição é gravada
// também no card do Pipefy. Campos que o Pipefy não aceita por aqui (conexões
// como Cliente/Peça, anexos, etiquetas) ficam só no B-Requisições.
// Os demais só visualizam.
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { X, Pencil, Save, Paperclip, RotateCcw } from 'lucide-react';
import { pedidosOrcamentoService } from '../../services/api';
import { Spinner } from '../ui';
import { FotosCampo } from './FotosOrcamento';

let estruturaCache = null;
export async function carregarEstrutura() {
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

export function Editor({ campo, valor, onChange }) {
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

export default function CamposCardOrcamento({ pedido, ehAdmin, podeEditar = ehAdmin, onFechar, onSalvo, faseAtualId }) {
  const [fases, setFases] = useState(null);
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState(null);

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
  // A fase atual do card vem primeiro (são os campos a preencher agora)
  const ordenadas = fases ? [...fases.filter(f => f.faseId === faseAtualId), ...fases.filter(f => f.faseId !== faseAtualId)] : [];
  const grupos = fases ? [...ordenadas, ...(outros.length ? [{ faseId: 'outros', nome: 'Outros campos', campos: outros }] : [])] : [];
  const nativo = !pedido.pipefy_card_id;

  async function salvar() {
    setSalvando(true); setErro('');
    try {
      const { data } = await pedidosOrcamentoService.editarCampos(pedido.id, rascunho);
      const pf = data?.pipefy;
      if (pf) {
        const linhas = [];
        if (pf.gravados?.length) linhas.push({ ok: true, txt: `Gravado no Pipefy: ${pf.gravados.join(', ')}.` });
        if (pf.so_local?.length) linhas.push({ ok: false, txt: `Só no B-Requisições (o Pipefy não aceita editar por aqui): ${pf.so_local.join(', ')}.` });
        for (const e of pf.erros || []) linhas.push({ ok: false, txt: `Pipefy recusou "${e.campo}": ${e.erro}. Ficou só no B-Requisições.` });
        setAviso(linhas.length ? linhas : null);
      }
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
            <p className="text-[11px] text-[var(--c-suave)]">Campos do card{pedido.pipefy_card_id ? ` · Pipefy #${pedido.pipefy_card_id}` : ' · criado no B-Requisições'}{!ehAdmin ? ' · somente visualização' : ''}</p>
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
          {aviso && !editando && (
            <div className="rounded-lg border border-[var(--c-borda)] p-2 space-y-0.5">
              {aviso.map((l, i) => <p key={i} className={`text-[11px] ${l.ok ? 'text-green-400' : 'text-amber-400'}`}>{l.txt}</p>)}
            </div>
          )}
          {!fases && !erro && <div className="flex justify-center py-10"><Spinner className="text-[var(--c-destaque)]" /></div>}
          {editando && <p className="text-[11px] text-amber-400">{nativo ? 'Card do B-Requisições: os campos ficam gravados aqui.' : 'A edição é gravada também no card do Pipefy. Conexões (Cliente, Peça, Técnico…) e anexos ficam só no B-Requisições.'} Anexos do Pipefy não são editáveis por aqui; fotos adicionadas aqui ficam só no B-Requisições. * = obrigatório no Pipefy.</p>}
          {grupos.map(g => {
            // Campos de foto (anexo com "foto" no nome) aparecem sempre, para adicionar fotos aqui
            const temFoto = (c) => c.tipo === 'attachment' && (/foto/i.test(c.rotulo || '') || (pedido.fotos_locais || []).some(f => f.campo === c.id));
            const lista = editando ? g.campos.filter(c => !SO_LEITURA.includes(c.tipo) || temValor(c.id) || temFoto(c)) : g.campos.filter(c => temValor(c.id) || temFoto(c));
            if (!lista.length) return null;
            return (
              <div key={g.faseId}>
                <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--c-suave)] mb-1.5">{g.nome}{g.faseId === faseAtualId && <span className="ml-1.5 normal-case font-semibold text-[var(--c-destaque)]">· fase atual</span>}</p>
                <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  {lista.map(c => (
                    <div key={c.id} className={`min-w-0 ${c.tipo === 'long_text' || c.tipo === 'attachment' ? 'sm:col-span-2' : ''}`}>
                      <dt className="text-[var(--c-suave)] flex items-center gap-1">
                        {c.rotulo}{editando && c.obrigatorio && <span className="text-red-400">*</span>}
                        {c.id in editados && !(c.id in rascunho) && (
                          <span title="Editado no B-Requisições" className="text-[10px] text-amber-400">(editado)</span>
                        )}
                        {editando && c.id in editados && !(c.id in rascunho) && (
                          <button title="Desfazer a edição local" onClick={() => setRascunho(r => ({ ...r, [c.id]: '' }))}
                            className="text-[var(--c-suave)] hover:text-[var(--c-texto)]"><RotateCcw size={10} /></button>
                        )}
                      </dt>
                      <dd className="text-[var(--c-texto)] mt-0.5">
                        {c.tipo === 'attachment'
                          ? <FotosCampo pedido={pedido} campo={c} valor={valorDe(c.id)} podeEnviar={podeEditar} onMudou={onSalvo} />
                          : editando && !SO_LEITURA.includes(c.tipo)
                          ? <Editor campo={c} valor={valorDe(c.id)} onChange={v => setRascunho(r => ({ ...r, [c.id]: v }))} />
                          : <Valor campo={c} valor={valorDe(c.id)} />}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
          {fases && !editando && !grupos.some(g => g.campos.some(c => temValor(c.id) || (c.tipo === 'attachment' && /foto/i.test(c.rotulo || '')))) && (
            <p className="text-xs text-[var(--c-suave)] text-center py-6">Nenhum campo preenchido neste card.</p>
          )}
        </div>
      </div>
    </div>
  );
}
