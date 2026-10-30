// ============================================================
// components/operador/ConfigOrcamento.jsx — Configurações da tela de Orçamentos
// ============================================================
// Só admin. Colunas (fases) da tela e os campos de cada uma, gravados no
// banco do B-Requisições (nada vai para o Pipefy). "Formulário inicial" =
// campos do botão Novo card. Tudo é editado aqui e gravado em "Salvar".
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { X, Plus, Settings, ChevronUp, ChevronDown, Trash2, Pencil, Check } from 'lucide-react';
import { pedidosOrcamentoService } from '../../services/api';
import { Spinner } from '../ui';

export const TIPOS_CAMPO = [
  { tipo: 'texto', nome: 'Texto curto', sigla: 'Aa' },
  { tipo: 'longo', nome: 'Texto longo', sigla: '¶' },
  { tipo: 'anexo', nome: 'Fotos / anexo', sigla: 'IMG' },
  { tipo: 'checkbox', nome: 'Checkbox', sigla: '☐' },
  { tipo: 'responsavel', nome: 'Responsável', sigla: 'RS' },
  { tipo: 'data', nome: 'Data', sigla: 'DT' },
  { tipo: 'datahora', nome: 'Data e hora', sigla: 'DH' },
  { tipo: 'vencimento', nome: 'Data de vencimento', sigla: 'DV' },
  { tipo: 'etiquetas', nome: 'Etiquetas', sigla: '#' },
  { tipo: 'email', nome: 'E-mail', sigla: '@' },
  { tipo: 'telefone', nome: 'Telefone', sigla: 'TEL' },
  { tipo: 'lista', nome: 'Seleção de lista', sigla: '▾' },
  { tipo: 'unica', nome: 'Seleção de única opção', sigla: '◉' },
  { tipo: 'numero', nome: 'Numérico', sigla: '12' },
  { tipo: 'moeda', nome: 'Moeda', sigla: 'R$' },
  { tipo: 'documento', nome: 'CPF / CNPJ', sigla: 'DOC' },
  { tipo: 'conexao', nome: 'Lista do B-Requisições', sigla: '⇄', boxer: true },
];
const TIPO = Object.fromEntries(TIPOS_CAMPO.map(t => [t.tipo, t]));
const COM_OPCOES = ['lista', 'unica', 'checkbox', 'etiquetas'];
const CORES = ['#64748b', '#f43f5e', '#0ea5e9', '#6366f1', '#3b82f6', '#f59e0b', '#a855f7', '#14b8a6',
  '#eab308', '#06b6d4', '#f97316', '#ef4444', '#84cc16', '#22c55e', '#71717a', '#ec4899'];
const LISTAS = ['Modelos de máquina'];

let seq = 0;
const tempId = () => `novo_${Date.now().toString(36)}_${++seq}`;

const inp = 'w-full bg-[var(--c-fundo)] border border-[var(--c-borda)] rounded-lg px-2.5 py-2 text-sm text-[var(--c-texto)] focus:outline-none focus:border-[var(--c-destaque)]';

function Sigla({ tipo }) {
  return <span className="w-7 h-6 shrink-0 rounded-md bg-[var(--c-fundo)] text-[var(--c-destaque-claro)] text-[10px] font-bold flex items-center justify-center">{TIPO[tipo]?.sigla || '?'}</span>;
}

// Prévia do campo como ele aparece no card
function Previa({ campo }) {
  const ops = (campo.opcoes || []).join(' · ') || 'Selecione…';
  if (campo.tipo === 'longo') return <div className="h-14 rounded-lg bg-[var(--c-fundo)] border border-[var(--c-borda)]" />;
  if (campo.tipo === 'lista' || campo.tipo === 'unica') return <div className="h-8 rounded-lg bg-[var(--c-fundo)] border border-[var(--c-borda)] flex items-center justify-between px-2.5 text-[11px] text-[var(--c-suave)]"><span className="truncate">{ops}</span><span>▾</span></div>;
  if (campo.tipo === 'anexo') return <div className="h-12 rounded-lg border-2 border-dashed border-[var(--c-borda-forte)] flex items-center justify-center text-[11px] text-[var(--c-suave)]">Adicionar foto ou arquivo</div>;
  if (campo.tipo === 'checkbox' || campo.tipo === 'etiquetas') return <div className="flex items-center gap-2 text-[11px] text-[var(--c-suave)]"><span className="w-3.5 h-3.5 rounded border border-[var(--c-borda-forte)]" />{ops}</div>;
  if (campo.tipo === 'conexao') return <div className="text-xs font-semibold text-[var(--c-destaque-claro)]">+ Selecionar em “{campo.lista || LISTAS[0]}”</div>;
  return <div className="h-8 rounded-lg bg-[var(--c-fundo)] border border-[var(--c-borda)]" />;
}

export default function ConfigOrcamento({ onFechar, onSalvo }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [colunas, setColunas] = useState([]);   // { chave | chave_temp, nome, cor, so_admin, arquivada, sistema, zen, fase_pipefy }
  const [campos, setCampos] = useState([]);     // { id | uid, coluna, tipo, rotulo, descricao, obrigatorio, opcoes, lista }
  const [aba, setAba] = useState('colunas');    // 'inicio' | 'colunas'
  const [colSel, setColSel] = useState(null);
  const [campoSel, setCampoSel] = useState(null);
  const [novaOpcao, setNovaOpcao] = useState('');
  const [nova, setNova] = useState(null);       // formulário "Incluir coluna nova"
  const [alterado, setAlterado] = useState(false);

  function carregarDe(data) {
    setColunas(data.colunas.map(c => ({ ...c })));
    setCampos(data.campos.map(c => ({ ...c, uid: `id_${c.id}`, opcoes: Array.isArray(c.opcoes) ? c.opcoes : [] })));
    setColSel(s => (s && data.colunas.some(c => c.chave === s) ? s : data.colunas[0]?.chave || null));
  }
  useEffect(() => {
    pedidosOrcamentoService.config()
      .then(({ data }) => carregarDe(data))
      .catch(e => setErro(e.response?.data?.erro || 'Não consegui carregar a configuração.'))
      .finally(() => setCarregando(false));
  }, []);

  const keyCol = (c) => c.chave || c.chave_temp;
  const colAtual = colunas.find(c => keyCol(c) === colSel) || null;
  const chaveAtual = aba === 'inicio' ? 'inicio' : colSel;
  const camposAtuais = useMemo(() => campos.filter(c => c.coluna === chaveAtual), [campos, chaveAtual]);
  const campoAtual = campos.find(c => c.uid === campoSel) || null;
  const qtdPorColuna = useMemo(() => campos.reduce((m, c) => ({ ...m, [c.coluna]: (m[c.coluna] || 0) + 1 }), {}), [campos]);

  const mudou = () => setAlterado(true);
  const mudarCampo = (uid, fn) => { setCampos(l => l.map(c => (c.uid === uid ? fn({ ...c }) : c))); mudou(); };
  const mudarColuna = (k, fn) => { setColunas(l => l.map(c => (keyCol(c) === k ? fn({ ...c }) : c))); mudou(); };

  function addCampo(tipo) {
    if (!chaveAtual) return;
    const novo = { uid: tempId(), coluna: chaveAtual, tipo, rotulo: TIPO[tipo].nome, descricao: '', obrigatorio: false,
      opcoes: tipo === 'lista' || tipo === 'unica' ? ['Opção 1', 'Opção 2'] : tipo === 'checkbox' ? ['Sim'] : [],
      lista: tipo === 'conexao' ? LISTAS[0] : null };
    setCampos(l => [...l, novo]); setCampoSel(novo.uid); setNovaOpcao(''); mudou();
  }
  function moverCampo(uid, d) {
    setCampos(l => {
      const daCol = l.filter(c => c.coluna === chaveAtual);
      const i = daCol.findIndex(c => c.uid === uid), j = i + d;
      if (i < 0 || j < 0 || j >= daCol.length) return l;
      const a = daCol[i], b = daCol[j];
      return l.map(c => (c.uid === a.uid ? b : c.uid === b.uid ? a : c));
    });
    mudou();
  }
  function removerCampo(uid) {
    setCampos(l => l.filter(c => c.uid !== uid)); if (campoSel === uid) setCampoSel(null); mudou();
  }
  function moverColuna(d) {
    setColunas(l => {
      const i = l.findIndex(c => keyCol(c) === colSel), j = i + d;
      if (i < 0 || j < 0 || j >= l.length) return l;
      const n = [...l]; [n[i], n[j]] = [n[j], n[i]]; return n;
    });
    mudou();
  }
  function excluirColuna() {
    if (!colAtual || colAtual.sistema) return;
    if (!confirm(`Excluir a coluna "${colAtual.nome}"? Os campos dela também saem.`)) return;
    const k = keyCol(colAtual);
    setColunas(l => l.filter(c => keyCol(c) !== k));
    setCampos(l => l.filter(c => c.coluna !== k));
    const resto = colunas.filter(c => keyCol(c) !== k);
    setColSel(resto[0] ? keyCol(resto[0]) : null); setCampoSel(null); mudou();
  }
  function criarColuna() {
    const nome = (nova?.nome || '').trim();
    if (!nome) return;
    if (colunas.some(c => c.nome.trim().toLowerCase() === nome.toLowerCase())) { setErro(`Já existe uma coluna "${nome}".`); return; }
    const col = { chave_temp: tempId(), nome, cor: nova.cor, so_admin: nova.quem === 'admin', arquivada: false, sistema: false };
    setColunas(l => { const n = [...l]; n.splice(Number(nova.pos) + 1, 0, col); return n; });
    setColSel(col.chave_temp); setCampoSel(null); setNova(null); setAba('colunas'); setErro(''); mudou();
  }

  async function salvar() {
    setSalvando(true); setErro('');
    try {
      const { data } = await pedidosOrcamentoService.salvarConfig({
        colunas: colunas.map(c => ({ chave: c.chave || null, chave_temp: c.chave_temp || null, nome: c.nome, cor: c.cor, so_admin: c.so_admin, arquivada: c.arquivada })),
        campos: campos.map(c => ({ id: c.id || null, coluna: c.coluna, tipo: c.tipo, rotulo: c.rotulo, descricao: c.descricao, obrigatorio: c.obrigatorio, opcoes: c.opcoes, lista: c.lista })),
      });
      // as colunas novas ganharam chave: mantém a seleção pela posição
      const pos = colunas.findIndex(c => keyCol(c) === colSel);
      carregarDe(data);
      if (pos >= 0 && data.colunas[pos]) setColSel(data.colunas[pos].chave);
      setCampoSel(null); setAlterado(false);
      onSalvo?.(data);
    } catch (e) { setErro(e.response?.data?.erro || 'Erro ao salvar a configuração.'); }
    finally { setSalvando(false); }
  }
  function fechar() {
    if (alterado && !confirm('Há alterações não salvas. Fechar mesmo assim?')) return;
    onFechar?.();
  }

  const abaBtn = (id, nome) => (
    <button onClick={() => { setAba(id); setCampoSel(null); }}
      className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 ${aba === id ? 'border-[var(--c-destaque)] text-[var(--c-texto)] font-semibold' : 'border-transparent text-[var(--c-suave)] hover:text-[var(--c-texto)]'}`}>{nome}</button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-stretch justify-center p-2 sm:p-4" onClick={fechar}>
      <div className="w-full max-w-[1400px] flex flex-col bg-[var(--c-fundo)] border border-[var(--c-borda)] rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Cabeçalho */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--c-borda)] bg-[var(--c-superficie)]">
          <div className="w-9 h-9 rounded-xl bg-[var(--c-destaque)]/15 text-[var(--c-destaque-claro)] flex items-center justify-center"><Settings size={18} /></div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-[var(--c-texto)]">Configurações — Pedidos de Orçamento</p>
            <p className="text-xs text-[var(--c-suave)]">Colunas da tela e os campos de cada uma · gravado só no B-Requisições</p>
          </div>
          <button onClick={fechar} aria-label="Fechar" className="p-2 rounded-lg text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={18} /></button>
        </div>
        <div className="flex gap-1 px-5 border-b border-[var(--c-borda)] bg-[var(--c-superficie)] overflow-x-auto">
          {abaBtn('inicio', 'Formulário inicial (Novo card)')}
          {abaBtn('colunas', 'Colunas e campos')}
        </div>

        {carregando ? <div className="flex-1 flex items-center justify-center"><Spinner /></div> : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Faixa de colunas */}
          {aba === 'colunas' && (
            <div className="px-5 pt-4">
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                <span className="text-[11px] text-[var(--c-suave)] whitespace-nowrap mr-1">Colunas na ordem da tela:</span>
                {colunas.map(c => {
                  const k = keyCol(c), ativa = k === colSel;
                  return (
                    <button key={k} onClick={() => { setColSel(k); setCampoSel(null); }}
                      style={{ borderColor: ativa ? c.cor : undefined, background: ativa ? `${c.cor}26` : undefined }}
                      className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border ${ativa ? 'font-bold text-[var(--c-texto)]' : 'border-[var(--c-borda)] bg-[var(--c-superficie)] text-[var(--c-texto)] hover:border-[var(--c-destaque)]'}`}>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.cor }} />{c.nome}
                      <span className="text-[10px] text-[var(--c-suave)]">{qtdPorColuna[k] || 0}</span>
                    </button>
                  );
                })}
                <button onClick={() => setNova({ nome: '', pos: String(Math.max(0, colunas.findIndex(c => keyCol(c) === colSel))), cor: '#64748b', quem: 'admin' })}
                  className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-dashed border-[var(--c-borda-forte)] text-[var(--c-destaque-claro)] hover:border-[var(--c-destaque)]">
                  <Plus size={13} /> Nova coluna
                </button>
              </div>
              {nova && (
                <div className="mt-2 rounded-2xl border border-[var(--c-destaque)]/50 bg-[var(--c-superficie)] p-4 space-y-3">
                  <p className="text-sm font-bold text-[var(--c-texto)]">Incluir coluna nova</p>
                  <div className="grid gap-3 md:grid-cols-[2fr_2fr_1.3fr]">
                    <label className="text-[11px] text-[var(--c-suave)] space-y-1">Nome da coluna
                      <input autoFocus value={nova.nome} onChange={e => setNova(n => ({ ...n, nome: e.target.value }))} placeholder="Ex.: Aguardando peça do fornecedor" className={inp}
                        onKeyDown={e => e.key === 'Enter' && criarColuna()} />
                    </label>
                    <label className="text-[11px] text-[var(--c-suave)] space-y-1">Posição na tela
                      <select value={nova.pos} onChange={e => setNova(n => ({ ...n, pos: e.target.value }))} className={inp}>
                        <option value="-1">No início (antes de todas)</option>
                        {colunas.map((c, i) => <option key={keyCol(c)} value={String(i)}>Depois de “{c.nome}”</option>)}
                      </select>
                    </label>
                    <label className="text-[11px] text-[var(--c-suave)] space-y-1">Quem move cards para ela
                      <select value={nova.quem} onChange={e => setNova(n => ({ ...n, quem: e.target.value }))} className={inp}>
                        <option value="admin">Só o administrador</option>
                        <option value="todos">Admin e operadores</option>
                      </select>
                    </label>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[11px] text-[var(--c-suave)]">Cor da coluna</span>
                    <div className="flex flex-wrap gap-1.5">
                      {CORES.map(cor => <button key={cor} onClick={() => setNova(n => ({ ...n, cor }))} aria-label={cor} className="w-6 h-6 rounded-full border-2" style={{ background: cor, borderColor: nova.cor === cor ? 'var(--c-texto)' : 'transparent' }} />)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-[var(--c-suave)]">Prévia:</span>
                    <span className="px-3 py-1 rounded-xl text-xs font-bold text-[var(--c-texto)] border" style={{ borderColor: nova.cor, background: `${nova.cor}26` }}>{nova.nome.trim() || 'Nome da coluna'}</span>
                    <span className="flex-1" />
                    <button onClick={() => setNova(null)} className="px-3 py-2 rounded-lg text-xs text-[var(--c-suave)] hover:text-[var(--c-texto)]">Cancelar</button>
                    <button onClick={criarColuna} disabled={!nova.nome.trim()} className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--c-destaque)] text-white disabled:opacity-40">Criar coluna</button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-4 p-5 items-start">
            {/* Tipos de campo */}
            <div className="flex-[0_1_230px] min-w-[200px] rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-3">
              <p className="text-sm font-bold text-[var(--c-texto)]">Tipos de campo</p>
              <p className="text-[11px] text-[var(--c-suave)] mb-2">Clique para adicionar em <b className="text-[var(--c-texto)]">{aba === 'inicio' ? 'Formulário inicial' : colAtual?.nome || '—'}</b></p>
              <div className="space-y-1.5">
                {TIPOS_CAMPO.map(t => (
                  <button key={t.tipo} onClick={() => addCampo(t.tipo)} disabled={!chaveAtual}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border border-[var(--c-borda)] bg-[var(--c-cartao)] text-xs text-[var(--c-texto)] hover:border-[var(--c-destaque)] disabled:opacity-40">
                    <Sigla tipo={t.tipo} /><span className="flex-1 text-left">{t.nome}</span>
                    {t.boxer && <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/15 rounded px-1">B-REQ</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Campos da coluna */}
            <div className="flex-[999_1_460px] min-w-0 rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--c-borda)] flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <p className="text-[11px] font-semibold text-[var(--c-suave)] mb-1">{aba === 'inicio' ? 'Formulário do Novo card' : 'Coluna'}</p>
                  {aba === 'inicio'
                    ? <span className="inline-block text-lg font-extrabold rounded-xl px-3 py-1.5 text-[var(--c-destaque-claro)] bg-[var(--c-destaque)]/10">Formulário inicial</span>
                    : colAtual && <span className="inline-block text-lg font-extrabold rounded-xl px-3 py-1.5" style={{ color: colAtual.cor, background: `${colAtual.cor}1f` }}>{colAtual.nome}</span>}
                </div>
                {aba === 'colunas' && colAtual?.zen && <span className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-1">Zen: {colAtual.zen}</span>}
                {aba === 'colunas' && colAtual && (
                  <button onClick={() => setCampoSel(null)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--c-borda)] bg-[var(--c-cartao)] text-xs text-[var(--c-texto)] hover:border-[var(--c-destaque)]"><Pencil size={12} /> Configurar coluna</button>
                )}
              </div>
              <div className="p-4 space-y-2">
                <p className="text-[11px] text-[var(--c-suave)]">Campos: {camposAtuais.length} · clique num campo para editar</p>
                {aba === 'inicio' && <p className="text-[11px] text-[var(--c-suave)]">Sem campos aqui, o Novo card continua com o formulário de hoje. O CPF/CNPJ do cliente (busca no Zen) aparece sempre.</p>}
                {!camposAtuais.length && <div className="border-2 border-dashed border-[var(--c-borda)] rounded-xl py-8 text-center text-xs text-[var(--c-suave)]">Nenhum campo. Escolha um tipo de campo à esquerda.</div>}
                {camposAtuais.map(c => (
                  <div key={c.uid} onClick={() => { setCampoSel(c.uid); setNovaOpcao(''); }}
                    className={`cursor-pointer rounded-xl border p-3 ${campoSel === c.uid ? 'border-[var(--c-destaque)] bg-[var(--c-destaque)]/10' : 'border-[var(--c-borda)] bg-[var(--c-cartao)] hover:border-[var(--c-borda-forte)]'}`}>
                    <div className="flex items-start gap-2">
                      <Sigla tipo={c.tipo} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--c-texto)]">{c.obrigatorio && <span className="text-red-400">* </span>}{c.rotulo}</p>
                        {c.descricao && <p className="text-[11px] text-[var(--c-suave)]">{c.descricao}</p>}
                      </div>
                      <button onClick={e => { e.stopPropagation(); moverCampo(c.uid, -1); }} aria-label="Subir" className="p-1 rounded text-[var(--c-suave)] hover:text-[var(--c-texto)]"><ChevronUp size={14} /></button>
                      <button onClick={e => { e.stopPropagation(); moverCampo(c.uid, 1); }} aria-label="Descer" className="p-1 rounded text-[var(--c-suave)] hover:text-[var(--c-texto)]"><ChevronDown size={14} /></button>
                      <button onClick={e => { e.stopPropagation(); removerCampo(c.uid); }} aria-label="Remover" className="p-1 rounded text-[var(--c-suave)] hover:text-red-400"><Trash2 size={14} /></button>
                    </div>
                    <div className="mt-2 ml-9"><Previa campo={c} /></div>
                  </div>
                ))}
              </div>
            </div>

            {/* Painel direito */}
            <div className="flex-[0_1_320px] min-w-[270px] rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4 space-y-3">
              {campoAtual ? (
                <>
                  <div className="flex items-center gap-2"><Sigla tipo={campoAtual.tipo} /><p className="text-sm font-bold text-[var(--c-texto)]">Editar campo · {TIPO[campoAtual.tipo]?.nome}</p></div>
                  <label className="block text-[11px] text-[var(--c-suave)] space-y-1">Nome do campo
                    <input value={campoAtual.rotulo} onChange={e => mudarCampo(campoAtual.uid, c => ({ ...c, rotulo: e.target.value }))} className={inp} />
                  </label>
                  <label className="block text-[11px] text-[var(--c-suave)] space-y-1">Descrição (aparece embaixo do nome)
                    <input value={campoAtual.descricao || ''} onChange={e => mudarCampo(campoAtual.uid, c => ({ ...c, descricao: e.target.value }))} placeholder="Opcional" className={inp} />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-[var(--c-texto)] cursor-pointer">
                    <input type="checkbox" checked={!!campoAtual.obrigatorio} onChange={() => mudarCampo(campoAtual.uid, c => ({ ...c, obrigatorio: !c.obrigatorio }))} />
                    {aba === 'inicio' ? 'Obrigatório para criar o card' : 'Obrigatório para sair desta coluna'}
                  </label>
                  {COM_OPCOES.includes(campoAtual.tipo) && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-[var(--c-suave)]">Opções</p>
                      {campoAtual.opcoes.map((o, i) => (
                        <div key={`${o}-${i}`} className="flex items-center gap-2 rounded-lg border border-[var(--c-borda)] bg-[var(--c-fundo)] px-2.5 py-1.5 text-xs text-[var(--c-texto)]">
                          <span className="flex-1">{o}</span>
                          <button onClick={() => mudarCampo(campoAtual.uid, c => ({ ...c, opcoes: c.opcoes.filter((_, n) => n !== i) }))} aria-label="Remover opção" className="text-[var(--c-suave)] hover:text-red-400"><X size={12} /></button>
                        </div>
                      ))}
                      <div className="flex gap-1.5">
                        <div className="relative flex-1">
                          <input value={novaOpcao} onChange={e => setNovaOpcao(e.target.value)} placeholder="Nova opção" className={`${inp} pr-7`}
                            onKeyDown={e => { if (e.key === 'Enter' && novaOpcao.trim()) { mudarCampo(campoAtual.uid, c => ({ ...c, opcoes: [...c.opcoes, novaOpcao.trim()] })); setNovaOpcao(''); } }} />
                          {novaOpcao && <button onClick={() => setNovaOpcao('')} title="Limpar" className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--c-suave)]"><X size={12} /></button>}
                        </div>
                        <button onClick={() => { if (!novaOpcao.trim()) return; mudarCampo(campoAtual.uid, c => ({ ...c, opcoes: [...c.opcoes, novaOpcao.trim()] })); setNovaOpcao(''); }}
                          className="px-3 rounded-lg border border-[var(--c-borda)] bg-[var(--c-cartao)] text-xs font-semibold text-[var(--c-destaque-claro)]">Adicionar</button>
                      </div>
                    </div>
                  )}
                  {campoAtual.tipo === 'conexao' && (
                    <label className="block text-[11px] text-[var(--c-suave)] space-y-1">Lista do B-Requisições
                      <select value={campoAtual.lista || LISTAS[0]} onChange={e => mudarCampo(campoAtual.uid, c => ({ ...c, lista: e.target.value }))} className={inp}>
                        {LISTAS.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                      <span className="block">Quem preenche escolhe um registro ou usa “+ Criar registro”.</span>
                    </label>
                  )}
                  <div className="flex justify-end pt-2 border-t border-[var(--c-borda)]">
                    <button onClick={() => setCampoSel(null)} className="mt-2 px-3 py-1.5 rounded-lg text-xs text-[var(--c-suave)] hover:text-[var(--c-texto)]">Fechar</button>
                  </div>
                </>
              ) : aba === 'inicio' ? (
                <>
                  <p className="text-sm font-bold text-[var(--c-texto)]">Formulário inicial</p>
                  <p className="text-xs text-[var(--c-suave)] leading-relaxed">Campos do botão <b className="text-[var(--c-texto)]">Novo card</b>. O card criado entra na primeira coluna.</p>
                </>
              ) : colAtual ? (
                <>
                  <p className="text-sm font-bold text-[var(--c-texto)]">Configurar coluna</p>
                  <label className="block text-[11px] text-[var(--c-suave)] space-y-1">Nome da coluna
                    <input value={colAtual.nome} onChange={e => mudarColuna(colSel, c => ({ ...c, nome: e.target.value }))} className={inp} />
                  </label>
                  <div className="space-y-1">
                    <span className="text-[11px] text-[var(--c-suave)]">Cor</span>
                    <div className="flex flex-wrap gap-1.5">
                      {CORES.map(cor => <button key={cor} onClick={() => mudarColuna(colSel, c => ({ ...c, cor }))} aria-label={cor} className="w-6 h-6 rounded-full border-2" style={{ background: cor, borderColor: colAtual.cor === cor ? 'var(--c-texto)' : 'transparent' }} />)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => moverColuna(-1)} className="flex-1 py-2 rounded-lg border border-[var(--c-borda)] bg-[var(--c-cartao)] text-xs text-[var(--c-texto)] hover:border-[var(--c-destaque)]">← Mover antes</button>
                    <button onClick={() => moverColuna(1)} className="flex-1 py-2 rounded-lg border border-[var(--c-borda)] bg-[var(--c-cartao)] text-xs text-[var(--c-texto)] hover:border-[var(--c-destaque)]">Mover depois →</button>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-[var(--c-texto)] cursor-pointer">
                    <input type="checkbox" checked={!!colAtual.so_admin} onChange={() => mudarColuna(colSel, c => ({ ...c, so_admin: !c.so_admin }))} />
                    Só o administrador move cards para esta coluna
                  </label>
                  <label className="flex items-center gap-2 text-xs text-[var(--c-texto)] cursor-pointer">
                    <input type="checkbox" checked={!!colAtual.arquivada} onChange={() => mudarColuna(colSel, c => ({ ...c, arquivada: !c.arquivada }))} />
                    Coluna arquivada (lista fechada na tela)
                  </label>
                  <div className="text-[11px] text-[var(--c-suave)] rounded-lg border border-[var(--c-borda)] bg-[var(--c-fundo)] p-2.5 leading-relaxed">
                    <b className="text-[var(--c-texto)]">Ação no Zen</b><br />{colAtual.zen || 'Nenhuma. O card só muda de coluna.'}
                    {colAtual.fase_pipefy && <><br /><b className="text-[var(--c-texto)]">Pipefy</b><br />Segue a fase do Pipefy desta coluna.</>}
                  </div>
                  {colAtual.sistema
                    ? <p className="text-[11px] text-[var(--c-suave)]">Coluna do sistema: não pode ser excluída.</p>
                    : <button onClick={excluirColuna} className="w-full py-2 rounded-lg border border-red-500/40 bg-red-500/10 text-xs font-semibold text-red-400">Excluir coluna</button>}
                </>
              ) : <p className="text-xs text-[var(--c-suave)]">Escolha uma coluna.</p>}
            </div>
          </div>
        </div>
        )}

        {/* Rodapé */}
        <div className="flex items-center gap-3 px-5 py-3 border-t border-[var(--c-borda)] bg-[var(--c-superficie)]">
          {erro ? <p className="flex-1 text-xs text-red-400">{erro}</p> : <p className="flex-1 text-[11px] text-[var(--c-suave)]">{alterado ? 'Alterações não salvas.' : 'Tudo salvo.'}</p>}
          <button onClick={fechar} className="px-4 py-2 rounded-lg text-xs text-[var(--c-suave)] hover:text-[var(--c-texto)]">Fechar</button>
          <button onClick={salvar} disabled={salvando || !alterado}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--c-destaque)] text-white disabled:opacity-40">
            {salvando ? <Spinner size={12} /> : <Check size={13} />} Salvar configuração
          </button>
        </div>
      </div>
    </div>
  );
}

// Campo configurado → formato usado pelos campos do card (Editor / FotosCampo)
const TIPO_EDITOR = {
  texto: 'short_text', longo: 'long_text', anexo: 'attachment', checkbox: 'checklist_vertical', responsavel: 'short_text',
  data: 'date', datahora: 'datetime', vencimento: 'due_date', etiquetas: 'label_select', email: 'email', telefone: 'phone',
  lista: 'select', unica: 'radio_vertical', numero: 'number', moeda: 'currency', documento: 'short_text', conexao: 'connector',
};
export function campoDaConfig(c) {
  return { id: `bx_${c.id}`, rotulo: c.rotulo, tipo: TIPO_EDITOR[c.tipo] || 'short_text', opcoes: Array.isArray(c.opcoes) ? c.opcoes : [],
    obrigatorio: !!c.obrigatorio, lista: c.lista || null, descricao: c.descricao || '', boxer: true };
}
