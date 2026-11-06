// ============================================================
// pages/operador/Construtor.jsx — Construtor de telas (beta)
// ============================================================
// 1) Começar: Assistente (perguntas), modelo pronto, copiar tela ou em branco
// 2) Montar: peças à esquerda, colunas e campos no meio, propriedades à direita
// 3) Prévia: card de teste, mover entre colunas, revisão automática e "Aprovar e criar tela"
// Tudo fica como rascunho até aprovar. Antes de "Ligar para todos", só o dono vê.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Wrench, ShieldCheck, ShoppingCart, Truck, ReceiptText, Package, ClipboardCheck, Copy, Plus, Trash2, ArrowLeft, ArrowRight,
  ChevronLeft, ChevronRight, GripVertical, Check, AlertTriangle, X, Play, Power, LayoutTemplate, ExternalLink, Eye, Hammer,
} from 'lucide-react';
import { construtorService, basesService } from '../../services/api';
import { Spinner } from '../../components/ui';
import { TIPOS_CAMPO, CORES_ETIQUETA } from '../../components/operador/ConfigOrcamento';
import { MODELOS, MODELO, BLOCOS, CORES_COLUNA, rascunhoDeEtapas, novoUid, novaChave } from '../../utils/modelosTela';
import { recarregarTelas } from '../../utils/nomesTelas';

const ICONES = { Wrench, ShieldCheck, ShoppingCart, Truck, ReceiptText, Package, ClipboardCheck };
const TIPO = Object.fromEntries(TIPOS_CAMPO.map(t => [t.tipo, t]));
const COM_OPCOES = ['lista', 'unica', 'checkbox', 'etiquetas'];
const inp = 'w-full bg-[var(--c-fundo)] border border-[var(--c-borda)] text-[var(--c-texto)] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[var(--c-destaque)]';
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-[var(--c-borda)] bg-[var(--c-superficie)] text-[var(--c-texto)] hover:border-[var(--c-destaque)] transition-colors disabled:opacity-50';
const btnPrim = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--c-destaque)] text-white hover:bg-[var(--c-destaque-h)] disabled:opacity-50';
const fmtData = (d) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const erroDe = (e, padrao) => e?.response?.data?.erro || padrao;
const listaValores = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]).map(String);

// Campo aparece agora? (regra "aparece só se")
function visivelAgora(c, valores) {
  if (!c.visivel?.campo) return true;
  const quer = listaValores(c.visivel.valor);
  const tem = listaValores(valores[c.visivel.campo]);
  return quer.some(q => tem.includes(q));
}
// Revisão automática do rascunho
function revisar(nome, d, nomesExistentes) {
  const erros = [], avisos = [];
  if (!nome.trim()) erros.push('Dê um nome para a tela.');
  else if (nomesExistentes.has(nome.trim().toLowerCase())) erros.push(`Já existe uma tela chamada "${nome.trim()}".`);
  if (!d.colunas.length) erros.push('A tela precisa de pelo menos uma coluna.');
  const nomes = d.colunas.map(c => c.nome.trim().toLowerCase());
  d.colunas.forEach((c, i) => { if (!c.nome.trim()) erros.push(`A coluna ${i + 1} está sem nome.`); });
  const rep = nomes.find((n, i) => n && nomes.indexOf(n) !== i);
  if (rep) erros.push(`Duas colunas com o nome "${rep}".`);
  for (const c of d.campos) {
    if (!c.rotulo.trim()) erros.push('Há um campo sem nome.');
    if (COM_OPCOES.includes(c.tipo) && c.tipo !== 'checkbox' && !c.opcoes.length) avisos.push(`"${c.rotulo || 'Campo'}" está sem opções.`);
    if (c.tipo === 'registro' && !c.lista) avisos.push(`"${c.rotulo}" não está ligado a uma base.`);
    if (c.visivel?.campo && !d.campos.some(o => o.uid === c.visivel.campo)) avisos.push(`"${c.rotulo}" depende de um campo que saiu.`);
  }
  d.colunas.forEach(c => { if (!d.campos.some(f => f.coluna === c.chave_temp)) avisos.push(`A coluna "${c.nome}" não tem campos.`); });
  if (d.colunas.length && !d.colunas.some(c => c.so_admin)) avisos.push('Nenhuma coluna é só do admin (todos movem tudo).');
  return { erros, avisos };
}

export default function Construtor() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [tela, setTela] = useState({ v: 'lista' }); // lista | comecar | assistente | editor
  useEffect(() => { construtorService.status().then(r => setStatus(r.data)).catch(() => setStatus({ pode: false })); }, []);

  if (!status) return <div className="flex justify-center py-16"><Spinner className="text-[var(--c-destaque)]" /></div>;
  if (!status.pode) return <p className="text-sm text-[var(--c-suave)] py-16 text-center">Página não encontrada.</p>;

  if (tela.v === 'comecar') return <Comecar onVoltar={() => setTela({ v: 'lista' })} onAssistente={() => setTela({ v: 'assistente' })} onCriado={(id) => setTela({ v: 'editor', id })} />;
  if (tela.v === 'assistente') return <Assistente onVoltar={() => setTela({ v: 'comecar' })} onCriado={(id) => setTela({ v: 'editor', id })} />;
  if (tela.v === 'editor') return <Editor id={tela.id} onVoltar={() => setTela({ v: 'lista' })} onAbrirTela={(qid) => navigate(`/quadro/${qid}`)} />;
  return <Lista status={status} setStatus={setStatus} onNovo={() => setTela({ v: 'comecar' })} onAbrir={(id) => setTela({ v: 'editor', id })} onAbrirTela={(qid) => navigate(`/quadro/${qid}`)} />;
}

// ── Lista de rascunhos + Ligar para todos ─────────────────────
function Lista({ status, setStatus, onNovo, onAbrir, onAbrirTela }) {
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState('');
  const [ligando, setLigando] = useState(false);
  const [confirmarLigar, setConfirmarLigar] = useState(false);
  const carregar = () => construtorService.rascunhos().then(r => setItens(r.data.rascunhos)).catch(e => setErro(erroDe(e, 'Não consegui carregar os rascunhos.')));
  useEffect(() => { carregar(); }, []);
  async function alternarLigado() {
    setLigando(true); setErro('');
    try { const { data } = await construtorService.ligar(!status.ligado); setStatus(s => ({ ...s, ligado: data.ligado })); setConfirmarLigar(false); }
    catch (e) { setErro(erroDe(e, 'Não consegui mudar.')); }
    finally { setLigando(false); }
  }
  async function excluir(id) {
    try { await construtorService.excluir(id); carregar(); } catch (e) { setErro(erroDe(e, 'Erro ao excluir.')); }
  }
  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--c-texto)] flex items-center gap-2"><LayoutTemplate size={18} /> Construtor de telas
            <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-[var(--c-destaque)]/15 text-[var(--c-destaque-claro)]">beta</span></h1>
          <p className="text-sm text-[var(--c-suave)] mt-0.5">Monte a tela inteira, veja a prévia e só depois aprove para criar.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {status.dono && (
            confirmarLigar ? (
              <span className="flex items-center gap-2 text-xs">
                <span className="text-[var(--c-suave)]">{status.ligado ? 'Esconder de novo para todos?' : 'Liberar para admins e quem tem a tela Telas?'}</span>
                <button onClick={alternarLigado} disabled={ligando} className={btnPrim}>{ligando ? <Spinner size={12} /> : <Check size={13} />} Confirmar</button>
                <button onClick={() => setConfirmarLigar(false)} className={btn}>Cancelar</button>
              </span>
            ) : (
              <button onClick={() => setConfirmarLigar(true)} className={btn} title="Hoje só você vê o Construtor">
                <Power size={13} className={status.ligado ? 'text-green-400' : 'text-[var(--c-suave)]'} /> {status.ligado ? 'Ligado para todos · desligar' : 'Só você vê · ligar para todos'}
              </button>
            )
          )}
          <button onClick={onNovo} className={btnPrim}><Plus size={14} /> Nova tela</button>
        </div>
      </div>
      {erro && <p className="text-xs text-red-400">{erro}</p>}
      {!itens ? <div className="flex justify-center py-10"><Spinner className="text-[var(--c-destaque)]" /></div>
        : !itens.length ? (
          <button onClick={onNovo} className="w-full border-2 border-dashed border-[var(--c-borda)] rounded-2xl py-12 text-center hover:border-[var(--c-destaque)]">
            <Sparkles size={22} className="mx-auto text-[var(--c-destaque-claro)]" />
            <p className="text-sm font-semibold text-[var(--c-texto)] mt-2">Crie sua primeira tela</p>
            <p className="text-xs text-[var(--c-suave)] mt-1">Com o assistente, um modelo pronto ou do zero.</p>
          </button>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {itens.map(r => (
              <div key={r.id} className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-sm font-semibold text-[var(--c-texto)] break-words">{r.nome}</p>
                  {r.status === 'criado'
                    ? <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-green-500/15 text-green-400">Criada</span>
                    : <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-amber-500/15 text-amber-400">Rascunho</span>}
                </div>
                <p className="text-[11px] text-[var(--c-suave)]">{r.n_colunas} colunas · {r.n_campos} campos{r.modelo ? ` · ${MODELO[r.modelo]?.nome || r.modelo}` : ''}</p>
                <p className="text-[11px] text-[var(--c-suave)]">{r.status === 'criado' ? `Aprovada em ${fmtData(r.aprovado_em)} por ${r.aprovado_por_nome || '—'}` : `Editado em ${fmtData(r.atualizado_em)}`}</p>
                <div className="flex items-center gap-2 pt-1">
                  {r.status === 'criado'
                    ? (r.quadro_ativo ? <button onClick={() => onAbrirTela(r.quadro_id)} className={btn}><ExternalLink size={12} /> Abrir a tela</button> : <span className="text-[11px] text-[var(--c-suave)]">Tela desativada</span>)
                    : <button onClick={() => onAbrir(r.id)} className={btn}><Hammer size={12} /> Continuar</button>}
                  <button onClick={() => excluir(r.id)} title={r.status === 'criado' ? 'Tirar da lista (a tela continua)' : 'Excluir rascunho'} className="ml-auto p-1.5 text-[var(--c-suave)] hover:text-red-400"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

// ── Passo 1: começar ───────────────────────────────────────────
function Comecar({ onVoltar, onAssistente, onCriado }) {
  const [telas, setTelas] = useState(null);
  const [copiarDe, setCopiarDe] = useState('');
  const [criando, setCriando] = useState('');
  const [erro, setErro] = useState('');
  useEffect(() => { construtorService.telas().then(r => setTelas(r.data.telas)).catch(() => setTelas([])); }, []);
  async function criar(chave, nome, dados) {
    setCriando(chave); setErro('');
    try { const { data } = await construtorService.criar({ nome, modelo: chave, dados }); onCriado(data.rascunho.id); }
    catch (e) { setErro(erroDe(e, 'Não consegui criar o rascunho.')); setCriando(''); }
  }
  async function copiar() {
    if (!copiarDe) return;
    setCriando('copia'); setErro('');
    try { const { data } = await construtorService.copiarTela(copiarDe); await criar('copia', `${data.nome} (cópia)`, data.dados); }
    catch (e) { setErro(erroDe(e, 'Não consegui copiar a tela.')); setCriando(''); }
  }
  const card = 'text-left rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4 hover:border-[var(--c-destaque)] transition-colors disabled:opacity-50';
  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <Passos atual={1} onVoltar={onVoltar} titulo="Nova tela · escolha um ponto de partida" />
      {erro && <p className="text-xs text-red-400">{erro}</p>}
      <button onClick={onAssistente} className="w-full text-left rounded-2xl border-2 border-[var(--c-destaque)] bg-[var(--c-destaque)]/10 p-5 flex items-center gap-4 hover:bg-[var(--c-destaque)]/15">
        <span className="w-11 h-11 rounded-xl bg-[var(--c-destaque)] flex items-center justify-center shrink-0"><Sparkles size={20} className="text-white" /></span>
        <span className="flex-1">
          <span className="block text-sm font-bold text-[var(--c-texto)]">Assistente de criação</span>
          <span className="block text-xs text-[var(--c-suave)] mt-0.5">Responda 4 perguntas sobre o processo e o assistente monta o rascunho: colunas, campos e obrigatórios.</span>
        </span>
        <ArrowRight size={18} className="text-[var(--c-destaque-claro)]" />
      </button>
      <p className="text-[11px] uppercase tracking-wide text-[var(--c-suave)]">Ou um modelo pronto</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {MODELOS.map(m => {
          const Icon = ICONES[m.icone] || LayoutTemplate;
          const d = rascunhoDeEtapas(m.etapas);
          return (
            <button key={m.chave} disabled={!!criando} onClick={() => criar(m.chave, m.nome, d)} className={card}>
              <Icon size={18} className="text-[var(--c-texto)]" />
              <p className="text-sm font-semibold text-[var(--c-texto)] mt-2">{m.nome} {criando === m.chave && <Spinner size={12} />}</p>
              <p className="text-[11px] text-[var(--c-suave)] mt-0.5">{m.resumo}</p>
              <p className="text-[10px] text-[var(--c-suave)] mt-2">{d.colunas.length} colunas · {d.campos.length} campos</p>
            </button>
          );
        })}
        <div className={card}>
          <Copy size={18} className="text-[var(--c-texto)]" />
          <p className="text-sm font-semibold text-[var(--c-texto)] mt-2">Copiar tela existente</p>
          <p className="text-[11px] text-[var(--c-suave)] mt-0.5">Duplica colunas e campos, sem os cards.</p>
          <div className="flex gap-1.5 mt-2">
            <select value={copiarDe} onChange={e => setCopiarDe(e.target.value)} className={inp}>
              <option value="">{telas ? (telas.length ? 'Escolha a tela' : 'Nenhuma tela criada') : 'Carregando…'}</option>
              {(telas || []).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
            <button onClick={copiar} disabled={!copiarDe || !!criando} className={btnPrim}>{criando === 'copia' ? <Spinner size={12} /> : <ArrowRight size={13} />}</button>
          </div>
        </div>
        <button disabled={!!criando} onClick={() => criar('branco', 'Nova tela', rascunhoDeEtapas([{ nome: 'Entrada', blocos: [] }]))} className={`${card} border-dashed`}>
          <Plus size={18} className="text-[var(--c-texto)]" />
          <p className="text-sm font-semibold text-[var(--c-texto)] mt-2">Em branco {criando === 'branco' && <Spinner size={12} />}</p>
          <p className="text-[11px] text-[var(--c-suave)] mt-0.5">Começo do zero, só com a coluna Entrada.</p>
        </button>
      </div>
    </div>
  );
}

function Passos({ atual, onVoltar, titulo, direita = null }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button onClick={onVoltar} className="p-1.5 rounded-lg text-[var(--c-suave)] hover:text-[var(--c-texto)]" title="Voltar"><ArrowLeft size={16} /></button>
      <span className="text-[11px] font-semibold rounded-md px-2 py-0.5 bg-[var(--c-destaque)]/15 text-[var(--c-destaque-claro)]">Passo {atual} de 3</span>
      <h1 className="text-base font-bold text-[var(--c-texto)]">{titulo}</h1>
      <div className="ml-auto flex items-center gap-2">{direita}</div>
    </div>
  );
}

// ── Assistente (sem IA): 4 perguntas → rascunho ─────────────────
function Assistente({ onVoltar, onCriado }) {
  const [passo, setPasso] = useState(0);
  const [tipo, setTipo] = useState(null);
  const [nome, setNome] = useState('');
  const [etapas, setEtapas] = useState([]);
  const [novaEtapa, setNovaEtapa] = useState('');
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState('');
  function escolher(m) {
    setTipo(m.chave); setNome(m.nome);
    setEtapas(m.etapas.map(e => ({ nome: e.nome, blocos: [...(e.blocos || [])], obrigatorios: [...(e.obrigatorios || [])], so_admin: !!e.so_admin })));
    setPasso(1);
  }
  function outro() { setTipo('outro'); setNome(''); setEtapas([{ nome: 'Entrada', blocos: [], obrigatorios: [] }, { nome: 'Em andamento', blocos: [], obrigatorios: [] }, { nome: 'Concluído', blocos: [], obrigatorios: [], so_admin: true }]); setPasso(1); }
  const mudarEtapa = (i, fn) => setEtapas(l => l.map((e, n) => (n === i ? fn({ ...e }) : e)));
  const moverEtapa = (i, d) => setEtapas(l => { const j = i + d; if (j < 0 || j >= l.length) return l; const n = [...l]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  function alternarBloco(i, b) {
    mudarEtapa(i, e => (e.blocos.includes(b) ? { ...e, blocos: e.blocos.filter(x => x !== b), obrigatorios: e.obrigatorios.filter(x => x !== b) } : { ...e, blocos: [...e.blocos, b] }));
  }
  function alternarObrig(i, b) { mudarEtapa(i, e => ({ ...e, obrigatorios: e.obrigatorios.includes(b) ? e.obrigatorios.filter(x => x !== b) : [...e.obrigatorios, b] })); }
  async function gerar() {
    setCriando(true); setErro('');
    try {
      const dados = rascunhoDeEtapas(etapas.filter(e => e.nome.trim()));
      const { data } = await construtorService.criar({ nome: nome.trim() || 'Nova tela', modelo: tipo === 'outro' ? 'assistente' : tipo, dados });
      onCriado(data.rascunho.id);
    } catch (e) { setErro(erroDe(e, 'Não consegui gerar o rascunho.')); setCriando(false); }
  }
  const perguntas = ['Que tipo de processo?', 'Como a tela vai se chamar?', 'Quais são as etapas?', 'O que registrar em cada etapa?'];
  const podeSeguir = passo === 1 ? nome.trim().length > 1 : passo === 2 ? etapas.filter(e => e.nome.trim()).length > 0 : true;
  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <Passos atual={1} onVoltar={passo ? () => setPasso(p => p - 1) : onVoltar} titulo="Assistente de criação" />
      <div className="flex items-center gap-2">
        {perguntas.map((p, i) => <span key={p} className={`h-1.5 flex-1 rounded-full ${i <= passo ? 'bg-[var(--c-destaque)]' : 'bg-[var(--c-borda)]'}`} />)}
      </div>
      <div className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-5 space-y-4">
        <p className="text-sm font-bold text-[var(--c-texto)] flex items-center gap-2"><Sparkles size={15} className="text-[var(--c-destaque-claro)]" /> {passo + 1}. {perguntas[passo]}</p>
        {passo === 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {MODELOS.map(m => {
              const Icon = ICONES[m.icone] || LayoutTemplate;
              return (
                <button key={m.chave} onClick={() => escolher(m)} className="text-left rounded-xl border border-[var(--c-borda)] p-3 hover:border-[var(--c-destaque)]">
                  <Icon size={16} className="text-[var(--c-texto)]" />
                  <p className="text-sm font-semibold text-[var(--c-texto)] mt-1.5">{m.nome}</p>
                  <p className="text-[11px] text-[var(--c-suave)]">{m.resumo}</p>
                </button>
              );
            })}
            <button onClick={outro} className="text-left rounded-xl border border-dashed border-[var(--c-borda)] p-3 hover:border-[var(--c-destaque)]">
              <Plus size={16} className="text-[var(--c-texto)]" />
              <p className="text-sm font-semibold text-[var(--c-texto)] mt-1.5">Outro processo</p>
              <p className="text-[11px] text-[var(--c-suave)]">Eu digo as etapas</p>
            </button>
          </div>
        )}
        {passo === 1 && (
          <div className="space-y-2">
            <input autoFocus value={nome} onChange={e => setNome(e.target.value)} maxLength={80} placeholder="Devoluções do Mercado Livre" className={`${inp} !text-sm !py-2.5`} />
            <p className="text-[11px] text-[var(--c-suave)]">É o nome que aparece no Início e no topo da tela. Dá para mudar depois.</p>
          </div>
        )}
        {passo === 2 && (
          <div className="space-y-2">
            {etapas.map((e, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-6 text-center text-xs text-[var(--c-suave)]">{i + 1}</span>
                <input value={e.nome} onChange={ev => mudarEtapa(i, x => ({ ...x, nome: ev.target.value }))} className={inp} />
                <label className="flex items-center gap-1 text-[11px] text-[var(--c-suave)] whitespace-nowrap" title="Só o admin move cards de/para esta etapa">
                  <input type="checkbox" checked={e.so_admin} onChange={() => mudarEtapa(i, x => ({ ...x, so_admin: !x.so_admin }))} /> só admin</label>
                <button onClick={() => moverEtapa(i, -1)} className="p-1 text-[var(--c-suave)] hover:text-[var(--c-texto)]" aria-label="Subir"><ChevronLeft size={14} className="rotate-90" /></button>
                <button onClick={() => moverEtapa(i, 1)} className="p-1 text-[var(--c-suave)] hover:text-[var(--c-texto)]" aria-label="Descer"><ChevronRight size={14} className="rotate-90" /></button>
                <button onClick={() => setEtapas(l => l.filter((_, n) => n !== i))} className="p-1 text-[var(--c-suave)] hover:text-red-400" aria-label="Remover"><Trash2 size={14} /></button>
              </div>
            ))}
            <div className="flex items-center gap-2 pl-8">
              <input value={novaEtapa} onChange={e => setNovaEtapa(e.target.value)} placeholder="Nova etapa"
                onKeyDown={e => { if (e.key === 'Enter' && novaEtapa.trim()) { setEtapas(l => [...l, { nome: novaEtapa.trim(), blocos: [], obrigatorios: [], so_admin: false }]); setNovaEtapa(''); } }} className={inp} />
              <button onClick={() => { if (novaEtapa.trim()) { setEtapas(l => [...l, { nome: novaEtapa.trim(), blocos: [], obrigatorios: [], so_admin: false }]); setNovaEtapa(''); } }} className={btn}><Plus size={13} /> Etapa</button>
            </div>
          </div>
        )}
        {passo === 3 && (
          <div className="space-y-3">
            <p className="text-[11px] text-[var(--c-suave)]">Clique para incluir a informação na etapa. Clique no <b>*</b> para deixar obrigatória antes de sair dela.</p>
            {etapas.filter(e => e.nome.trim()).map((e, i) => (
              <div key={i} className="rounded-xl border border-[var(--c-borda)] p-3">
                <p className="text-xs font-semibold text-[var(--c-texto)] mb-2">{e.nome} <span className="font-normal text-[var(--c-suave)]">· {e.blocos.length} informações</span></p>
                <div className="flex flex-wrap gap-1.5">
                  {BLOCOS.map(b => {
                    const on = e.blocos.includes(b.chave);
                    const ob = e.obrigatorios.includes(b.chave);
                    return (
                      <span key={b.chave} className={`inline-flex items-center rounded-full border text-[11px] ${on ? 'border-[var(--c-destaque)] bg-[var(--c-destaque)]/15 text-[var(--c-texto)]' : 'border-[var(--c-borda)] text-[var(--c-suave)]'}`}>
                        <button onClick={() => alternarBloco(etapas.indexOf(e), b.chave)} className="px-2 py-0.5">{b.nome}</button>
                        {on && <button onClick={() => alternarObrig(etapas.indexOf(e), b.chave)} title="Obrigatório" className={`pr-2 font-bold ${ob ? 'text-red-400' : 'text-[var(--c-suave)]'}`}>*</button>}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        {erro && <p className="text-xs text-red-400">{erro}</p>}
        {passo > 0 && (
          <div className="flex justify-end gap-2 pt-1">
            {passo < 3
              ? <button onClick={() => setPasso(p => p + 1)} disabled={!podeSeguir} className={btnPrim}>Próximo <ArrowRight size={13} /></button>
              : <button onClick={gerar} disabled={criando} className={btnPrim}>{criando ? <Spinner size={12} /> : <Sparkles size={13} />} Gerar rascunho</button>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Passos 2 e 3: editor do rascunho ───────────────────────────
function Editor({ id, onVoltar, onAbrirTela }) {
  const [rasc, setRasc] = useState(null);
  const [nome, setNome] = useState('');
  const [d, setD] = useState(null);
  const [passo, setPasso] = useState(2);
  const [salvo, setSalvo] = useState('');
  const [erro, setErro] = useState('');
  const [sel, setSel] = useState(null); // { tipo: 'campo'|'coluna', id }
  const [nomesExistentes, setNomesExistentes] = useState(new Set());
  const carregou = useRef(false);
  useEffect(() => {
    construtorService.ver(id).then(r => { setRasc(r.data.rascunho); setNome(r.data.rascunho.nome); setD({ colunas: r.data.rascunho.dados?.colunas || [], campos: r.data.rascunho.dados?.campos || [] }); })
      .catch(e => setErro(erroDe(e, 'Não consegui abrir o rascunho.')));
    construtorService.telas().then(r => setNomesExistentes(new Set(r.data.telas.map(t => t.nome.trim().toLowerCase())))).catch(() => {});
  }, [id]);
  // Salva sozinho (1,2 s depois da última mudança)
  useEffect(() => {
    if (!d || rasc?.status !== 'rascunho') return undefined;
    if (!carregou.current) { carregou.current = true; return undefined; }
    setSalvo('salvando');
    const t = setTimeout(() => {
      construtorService.salvar(id, { nome: nome.trim() || 'Nova tela', dados: d }).then(() => setSalvo('ok')).catch(e => { setSalvo(''); setErro(erroDe(e, 'Não consegui salvar o rascunho.')); });
    }, 1200);
    return () => clearTimeout(t);
  }, [d, nome]); // eslint-disable-line react-hooks/exhaustive-deps

  if (erro && !d) return <p className="text-sm text-red-400 py-10 text-center">{erro}</p>;
  if (!d) return <div className="flex justify-center py-16"><Spinner className="text-[var(--c-destaque)]" /></div>;
  if (rasc.status !== 'rascunho') {
    return (
      <div className="max-w-xl mx-auto py-10 text-center space-y-3">
        <p className="text-sm text-[var(--c-texto)]">Este rascunho já virou tela.</p>
        <div className="flex justify-center gap-2"><button onClick={onVoltar} className={btn}>Voltar</button>{rasc.quadro_id && <button onClick={() => onAbrirTela(rasc.quadro_id)} className={btnPrim}><ExternalLink size={13} /> Abrir a tela</button>}</div>
      </div>
    );
  }
  const statusSalvo = salvo === 'salvando' ? <span className="text-[11px] text-[var(--c-suave)] flex items-center gap-1"><Spinner size={10} /> Salvando rascunho…</span>
    : salvo === 'ok' ? <span className="text-[11px] text-green-400 flex items-center gap-1"><Check size={11} /> Rascunho salvo</span> : null;
  return (
    <div className="space-y-4">
      <Passos atual={passo} onVoltar={passo === 3 ? () => setPasso(2) : onVoltar} titulo={passo === 2 ? 'Montar a tela' : 'Prévia e aprovação'}
        direita={<>
          {statusSalvo}
          {passo === 2
            ? <button onClick={() => setPasso(3)} className={btnPrim}><Eye size={13} /> Ver prévia</button>
            : <button onClick={() => setPasso(2)} className={btn}><Hammer size={13} /> Voltar a montar</button>}
        </>} />
      <div className="flex items-center gap-2">
        <input value={nome} onChange={e => setNome(e.target.value)} maxLength={80} placeholder="Nome da tela"
          className="flex-1 max-w-md bg-transparent border-b border-[var(--c-borda)] focus:border-[var(--c-destaque)] text-lg font-bold text-[var(--c-texto)] py-1 focus:outline-none" />
      </div>
      {erro && <p className="text-xs text-red-400">{erro}</p>}
      {passo === 2
        ? <Montar d={d} setD={setD} sel={sel} setSel={setSel} />
        : <Previa id={id} nome={nome} d={d} nomesExistentes={nomesExistentes} onCriada={(qid) => { recarregarTelas(); setRasc(r => ({ ...r, status: 'criado', quadro_id: qid })); }} onAbrirTela={onAbrirTela} />}
    </div>
  );
}

// ── Montar: peças | colunas | propriedades ─────────────────────
function Montar({ d, setD, sel, setSel }) {
  const [arrasto, setArrasto] = useState(null); // { tipo: 'peca', valor } | { tipo: 'campo', uid }
  const colSel = sel?.tipo === 'coluna' ? sel.id : sel?.tipo === 'campo' ? d.campos.find(c => c.uid === sel.id)?.coluna : d.colunas[0]?.chave_temp;
  const mudarCampo = (uid, fn) => setD(x => ({ ...x, campos: x.campos.map(c => (c.uid === uid ? fn({ ...c }) : c)) }));
  const mudarColuna = (k, fn) => setD(x => ({ ...x, colunas: x.colunas.map(c => (c.chave_temp === k ? fn({ ...c }) : c)) }));
  function novoCampo(tipo, coluna, antesDe = null) {
    if (!coluna) return;
    const c = { uid: novoUid(), coluna, tipo, rotulo: TIPO[tipo]?.nome || 'Campo', descricao: '', obrigatorio: false,
      opcoes: tipo === 'checkbox' ? ['Sim'] : ['lista', 'unica', 'etiquetas'].includes(tipo) ? ['Opção 1', 'Opção 2'] : [],
      lista: tipo === 'conexao' ? 'Modelos de máquina' : null, cores: null, visivel: null, condicao: null };
    if (tipo === 'etiquetas') c.cores = { 'Opção 1': CORES_ETIQUETA[0], 'Opção 2': CORES_ETIQUETA[1] };
    setD(x => {
      const l = [...x.campos];
      const i = antesDe ? l.findIndex(f => f.uid === antesDe) : -1;
      if (i >= 0) l.splice(i, 0, c); else l.push(c);
      return { ...x, campos: l };
    });
    setSel({ tipo: 'campo', id: c.uid });
  }
  function moverCampoPara(uid, coluna, antesDe = null) {
    if (uid === antesDe) return;
    setD(x => {
      const l = [...x.campos];
      const i = l.findIndex(f => f.uid === uid);
      if (i < 0) return x;
      const [c] = l.splice(i, 1);
      c.coluna = coluna;
      const j = antesDe ? l.findIndex(f => f.uid === antesDe) : -1;
      if (j >= 0) l.splice(j, 0, c); else l.push(c);
      return { ...x, campos: l };
    });
  }
  function soltar(coluna, antesDe = null) {
    if (arrasto?.tipo === 'peca') novoCampo(arrasto.valor, coluna, antesDe);
    if (arrasto?.tipo === 'campo') moverCampoPara(arrasto.uid, coluna, antesDe);
    setArrasto(null);
  }
  function novaColuna() {
    const k = novaChave();
    setD(x => ({ ...x, colunas: [...x.colunas, { chave_temp: k, nome: `Coluna ${x.colunas.length + 1}`, cor: CORES_COLUNA[x.colunas.length % CORES_COLUNA.length], so_admin: false }] }));
    setSel({ tipo: 'coluna', id: k });
  }
  const moverColuna = (k, dir) => setD(x => { const i = x.colunas.findIndex(c => c.chave_temp === k), j = i + dir; if (i < 0 || j < 0 || j >= x.colunas.length) return x; const n = [...x.colunas]; [n[i], n[j]] = [n[j], n[i]]; return { ...x, colunas: n }; });
  function excluirColuna(k) {
    setD(x => ({ ...x, colunas: x.colunas.filter(c => c.chave_temp !== k), campos: x.campos.filter(c => c.coluna !== k) }));
    setSel(null);
  }
  function duplicarCampo(uid) {
    const o = d.campos.find(c => c.uid === uid); if (!o) return;
    const c = { ...JSON.parse(JSON.stringify(o)), uid: novoUid(), rotulo: `${o.rotulo} (cópia)` };
    setD(x => { const l = [...x.campos]; l.splice(l.findIndex(f => f.uid === uid) + 1, 0, c); return { ...x, campos: l }; });
    setSel({ tipo: 'campo', id: c.uid });
  }
  const excluirCampo = (uid) => { setD(x => ({ ...x, campos: x.campos.filter(c => c.uid !== uid) })); setSel(null); };

  const campoSel = sel?.tipo === 'campo' ? d.campos.find(c => c.uid === sel.id) : null;
  const colunaSel = sel?.tipo === 'coluna' ? d.colunas.find(c => c.chave_temp === sel.id) : null;
  return (
    <div className="grid lg:grid-cols-[170px_minmax(0,1fr)_280px] gap-3 items-start">
      {/* Peças */}
      <div className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-3 space-y-1.5 lg:sticky lg:top-2">
        <p className="text-[10px] uppercase tracking-wide text-[var(--c-suave)]">Peças · arraste ou clique</p>
        {TIPOS_CAMPO.map(t => (
          <div key={t.tipo} draggable onDragStart={() => setArrasto({ tipo: 'peca', valor: t.tipo })} onDragEnd={() => setArrasto(null)}
            onClick={() => novoCampo(t.tipo, colSel)} title={`Adicionar em "${d.colunas.find(c => c.chave_temp === colSel)?.nome || ''}"`}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-[var(--c-borda)] text-[11px] text-[var(--c-texto)] cursor-grab hover:border-[var(--c-destaque)]">
            <span className="w-7 text-center text-[9px] font-bold text-[var(--c-suave)]">{t.sigla}</span>{t.nome}
          </div>
        ))}
      </div>
      {/* Colunas */}
      <div className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-3 overflow-x-auto">
        <div className="flex gap-3 min-h-[360px]">
          {d.colunas.map((col, i) => {
            const campos = d.campos.filter(c => c.coluna === col.chave_temp);
            const ativa = colSel === col.chave_temp;
            return (
              <div key={col.chave_temp} onDragOver={e => e.preventDefault()} onDrop={() => soltar(col.chave_temp)}
                className={`w-56 shrink-0 rounded-xl border p-2 space-y-1.5 ${ativa ? 'border-[var(--c-destaque)]' : 'border-[var(--c-borda)]'} bg-[var(--c-fundo)]`}>
                <div onClick={() => setSel({ tipo: 'coluna', id: col.chave_temp })} className="cursor-pointer border-t-[3px] rounded-t pt-1.5" style={{ borderColor: col.cor }}>
                  <div className="flex items-center gap-1">
                    <p className="flex-1 text-xs font-bold text-[var(--c-texto)] truncate">{col.nome || 'Sem nome'}</p>
                    {col.so_admin && <span className="text-[9px] font-semibold rounded px-1 bg-amber-500/15 text-amber-400">admin</span>}
                    <button onClick={e => { e.stopPropagation(); moverColuna(col.chave_temp, -1); }} disabled={i === 0} className="p-0.5 text-[var(--c-suave)] hover:text-[var(--c-texto)] disabled:opacity-20" aria-label="Para a esquerda"><ChevronLeft size={13} /></button>
                    <button onClick={e => { e.stopPropagation(); moverColuna(col.chave_temp, 1); }} disabled={i === d.colunas.length - 1} className="p-0.5 text-[var(--c-suave)] hover:text-[var(--c-texto)] disabled:opacity-20" aria-label="Para a direita"><ChevronRight size={13} /></button>
                  </div>
                  <p className="text-[10px] text-[var(--c-suave)]">{i === 0 ? 'Primeira coluna (onde o card nasce)' : `${campos.length} campo${campos.length !== 1 ? 's' : ''}`}</p>
                </div>
                {campos.map(c => (
                  <div key={c.uid} draggable onDragStart={() => setArrasto({ tipo: 'campo', uid: c.uid })} onDragEnd={() => setArrasto(null)}
                    onDragOver={e => e.preventDefault()} onDrop={e => { e.stopPropagation(); soltar(col.chave_temp, c.uid); }}
                    onClick={() => setSel({ tipo: 'campo', id: c.uid })}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] cursor-pointer border ${sel?.id === c.uid ? 'border-[var(--c-destaque)] bg-[var(--c-destaque)]/10' : 'border-[var(--c-borda)] bg-[var(--c-superficie)]'} ${arrasto?.uid === c.uid ? 'opacity-40' : ''}`}>
                    <GripVertical size={11} className="text-[var(--c-suave)] shrink-0" />
                    <span className="w-6 text-[9px] font-bold text-[var(--c-suave)] shrink-0">{TIPO[c.tipo]?.sigla || '?'}</span>
                    <span className="flex-1 min-w-0 truncate text-[var(--c-texto)]">{c.obrigatorio && <span className="text-red-400">* </span>}{c.rotulo || 'Sem nome'}</span>
                    {c.visivel?.campo && <span className="text-[9px] text-sky-400" title="Aparece só se…">se</span>}
                  </div>
                ))}
                <div className={`rounded-lg border border-dashed px-2 py-2 text-[10px] text-center ${arrasto ? 'border-[var(--c-destaque)] text-[var(--c-destaque-claro)]' : 'border-[var(--c-borda)] text-[var(--c-suave)]'}`}>
                  {arrasto ? 'Solte aqui' : 'Arraste uma peça para cá'}
                </div>
              </div>
            );
          })}
          <button onClick={novaColuna} className="w-40 shrink-0 rounded-xl border-2 border-dashed border-[var(--c-borda)] text-xs text-[var(--c-suave)] hover:border-[var(--c-destaque)] hover:text-[var(--c-texto)] flex flex-col items-center justify-center gap-1">
            <Plus size={16} /> Nova coluna
          </button>
        </div>
        <p className="text-[10px] text-[var(--c-suave)] mt-2">Fluxo: {d.colunas.map(c => c.nome || '?').join(' → ') || '—'}</p>
      </div>
      {/* Propriedades */}
      <div className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-3 space-y-2.5 lg:sticky lg:top-2">
        {campoSel ? <PropsCampo c={campoSel} todos={d.campos} colunas={d.colunas} mudar={(fn) => mudarCampo(campoSel.uid, fn)}
          onDuplicar={() => duplicarCampo(campoSel.uid)} onExcluir={() => excluirCampo(campoSel.uid)} />
          : colunaSel ? <PropsColuna c={colunaSel} primeira={d.colunas[0]?.chave_temp === colunaSel.chave_temp} mudar={(fn) => mudarColuna(colunaSel.chave_temp, fn)}
            onExcluir={() => excluirColuna(colunaSel.chave_temp)} nCampos={d.campos.filter(f => f.coluna === colunaSel.chave_temp).length} podeExcluir={d.colunas.length > 1} />
          : <p className="text-xs text-[var(--c-suave)] py-6 text-center">Clique numa coluna ou num campo para configurar.</p>}
      </div>
    </div>
  );
}

function Rot({ children }) { return <p className="text-[11px] text-[var(--c-suave)] mb-1">{children}</p>; }

function PropsColuna({ c, primeira, mudar, onExcluir, nCampos, podeExcluir }) {
  const [confirma, setConfirma] = useState(false);
  return (
    <>
      <p className="text-[10px] uppercase tracking-wide text-[var(--c-suave)]">Coluna</p>
      <div><Rot>Nome</Rot><input value={c.nome} onChange={e => mudar(x => ({ ...x, nome: e.target.value }))} maxLength={80} className={inp} /></div>
      <div><Rot>Cor</Rot>
        <div className="flex flex-wrap gap-1.5">{CORES_COLUNA.map(cor => (
          <button key={cor} onClick={() => mudar(x => ({ ...x, cor }))} className={`w-6 h-6 rounded-md ${c.cor === cor ? 'ring-2 ring-offset-1 ring-[var(--c-destaque)] ring-offset-[var(--c-superficie)]' : ''}`} style={{ background: cor }} aria-label={cor} />
        ))}</div>
      </div>
      <label className="flex items-center gap-2 text-xs text-[var(--c-texto)]"><input type="checkbox" checked={c.so_admin} onChange={() => mudar(x => ({ ...x, so_admin: !x.so_admin }))} /> Só o admin move cards desta coluna</label>
      {primeira && <p className="text-[11px] text-[var(--c-suave)]">É a primeira coluna: o card nasce aqui.</p>}
      {podeExcluir && (confirma
        ? <div className="flex items-center gap-2"><span className="text-[11px] text-red-400">Excluir a coluna e {nCampos} campo(s)?</span><button onClick={onExcluir} className="text-xs font-semibold text-red-400">Sim</button><button onClick={() => setConfirma(false)} className="text-xs text-[var(--c-suave)]">Não</button></div>
        : <button onClick={() => setConfirma(true)} className="flex items-center gap-1 text-xs text-[var(--c-suave)] hover:text-red-400"><Trash2 size={12} /> Excluir coluna</button>)}
    </>
  );
}

function PropsCampo({ c, todos, colunas, mudar, onDuplicar, onExcluir }) {
  const [nova, setNova] = useState('');
  const [bases, setBases] = useState(null);
  useEffect(() => { if (['registro', 'conexao'].includes(c.tipo) && !bases) basesService.listar().then(r => setBases(r.data.bases || [])).catch(() => setBases([])); }, [c.tipo]); // eslint-disable-line react-hooks/exhaustive-deps
  const comOpcoes = COM_OPCOES.includes(c.tipo);
  // "Aparece só se": campos com opções que vêm antes (na mesma coluna ou em colunas anteriores)
  const ordemCol = (k) => colunas.findIndex(x => x.chave_temp === k);
  const refs = todos.filter(o => o.uid !== c.uid && COM_OPCOES.includes(o.tipo) && o.opcoes.length && ordemCol(o.coluna) <= ordemCol(c.coluna));
  const ref = refs.find(o => o.uid === c.visivel?.campo);
  function addOpcao() {
    const t = nova.trim(); if (!t || c.opcoes.includes(t)) return;
    mudar(x => ({ ...x, opcoes: [...x.opcoes, t], cores: x.tipo === 'etiquetas' ? { ...(x.cores || {}), [t]: CORES_ETIQUETA[x.opcoes.length % CORES_ETIQUETA.length] } : x.cores }));
    setNova('');
  }
  return (
    <>
      <div className="flex items-center gap-2">
        <p className="flex-1 text-[10px] uppercase tracking-wide text-[var(--c-suave)]">Campo · {TIPO[c.tipo]?.nome}</p>
        <button onClick={onDuplicar} title="Duplicar campo" className="p-1 text-[var(--c-suave)] hover:text-[var(--c-texto)]"><Copy size={13} /></button>
        <button onClick={onExcluir} title="Excluir campo" className="p-1 text-[var(--c-suave)] hover:text-red-400"><Trash2 size={13} /></button>
      </div>
      <div><Rot>Nome</Rot><input value={c.rotulo} onChange={e => mudar(x => ({ ...x, rotulo: e.target.value }))} maxLength={120} className={inp} /></div>
      <div><Rot>Descrição (ajuda para quem preenche)</Rot><input value={c.descricao} onChange={e => mudar(x => ({ ...x, descricao: e.target.value }))} maxLength={300} placeholder="Opcional" className={inp} /></div>
      <div><Rot>Tipo</Rot>
        <select value={c.tipo} onChange={e => { const tipo = e.target.value; mudar(x => ({ ...x, tipo, opcoes: COM_OPCOES.includes(tipo) ? (x.opcoes.length ? x.opcoes : tipo === 'checkbox' ? ['Sim'] : ['Opção 1', 'Opção 2']) : [], lista: tipo === 'conexao' ? (x.lista || 'Modelos de máquina') : tipo === 'registro' ? null : null })); }} className={inp}>
          {TIPOS_CAMPO.map(t => <option key={t.tipo} value={t.tipo}>{t.nome}</option>)}
        </select>
      </div>
      <div><Rot>Coluna</Rot>
        <select value={c.coluna} onChange={e => mudar(x => ({ ...x, coluna: e.target.value }))} className={inp}>
          {colunas.map(k => <option key={k.chave_temp} value={k.chave_temp}>{k.nome}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 text-xs text-[var(--c-texto)]"><input type="checkbox" checked={c.obrigatorio} onChange={() => mudar(x => ({ ...x, obrigatorio: !x.obrigatorio }))} /> Obrigatório para sair da coluna</label>
      {comOpcoes && (
        <div><Rot>Opções</Rot>
          <div className="space-y-1">
            {c.opcoes.map((o, i) => (
              <div key={o} className="flex items-center gap-1.5">
                {c.tipo === 'etiquetas' && <input type="color" value={c.cores?.[o] || '#64748b'} onChange={e => mudar(x => ({ ...x, cores: { ...(x.cores || {}), [o]: e.target.value } }))} className="w-6 h-6 rounded border-0 bg-transparent p-0" />}
                <span className="flex-1 text-xs text-[var(--c-texto)] truncate">{o}</span>
                <button onClick={() => mudar(x => ({ ...x, opcoes: x.opcoes.filter((_, n) => n !== i) }))} className="text-[var(--c-suave)] hover:text-red-400" aria-label="Remover opção"><X size={12} /></button>
              </div>
            ))}
            <div className="flex gap-1.5"><input value={nova} onChange={e => setNova(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addOpcao(); }} placeholder="Nova opção" className={inp} /><button onClick={addOpcao} className={btn}><Plus size={12} /></button></div>
          </div>
        </div>
      )}
      {c.tipo === 'conexao' && (
        <div><Rot>Lista</Rot>
          <select value={c.lista || 'Modelos de máquina'} onChange={e => mudar(x => ({ ...x, lista: e.target.value }))} className={inp}>
            <option value="Modelos de máquina">Modelos de máquina</option>
            {(bases || []).filter(b => b.com_valor === false).map(b => <option key={b.id} value={`base:${b.id}`}>{b.nome}</option>)}
          </select>
        </div>
      )}
      {c.tipo === 'registro' && (
        <div><Rot>Base (descrição e valor)</Rot>
          <select value={c.lista || ''} onChange={e => mudar(x => ({ ...x, lista: e.target.value || null }))} className={inp}>
            <option value="">{bases ? 'Escolha a base' : 'Carregando…'}</option>
            {(bases || []).filter(b => b.com_valor !== false).map(b => <option key={b.id} value={String(b.id)}>{b.nome}</option>)}
          </select>
        </div>
      )}
      <div className="pt-1 border-t border-[var(--c-borda)]"><Rot>Aparece só se…</Rot>
        <select value={c.visivel?.campo || ''} onChange={e => { const r = refs.find(o => o.uid === e.target.value); mudar(x => ({ ...x, visivel: r ? { campo: r.uid, valor: [r.opcoes[0]] } : null })); }} className={inp}>
          <option value="">Sempre aparece</option>
          {refs.map(o => <option key={o.uid} value={o.uid}>{o.rotulo}</option>)}
        </select>
        {ref && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {ref.opcoes.map(o => {
              const on = listaValores(c.visivel.valor).includes(o);
              return <button key={o} onClick={() => mudar(x => { const v = listaValores(x.visivel.valor); const n = on ? v.filter(y => y !== o) : [...v, o]; return { ...x, visivel: n.length ? { ...x.visivel, valor: n } : null }; })}
                className={`text-[11px] rounded-full px-2 py-0.5 border ${on ? 'border-[var(--c-destaque)] bg-[var(--c-destaque)]/15 text-[var(--c-texto)]' : 'border-[var(--c-borda)] text-[var(--c-suave)]'}`}>{o}</button>;
            })}
          </div>
        )}
        {refs.length === 0 && <p className="text-[10px] text-[var(--c-suave)] mt-1">Crie antes um campo de lista/opções para usar como condição.</p>}
      </div>
    </>
  );
}

// ── Prévia: card de teste, mover, revisão e aprovar ─────────────
function CampoTeste({ c, valor, onChange }) {
  const v = valor ?? '';
  if (c.tipo === 'longo') return <textarea rows={2} value={v} onChange={e => onChange(e.target.value)} className={inp} />;
  if (['lista', 'conexao', 'registro'].includes(c.tipo)) {
    const ops = c.tipo === 'lista' ? c.opcoes : ['Exemplo A', 'Exemplo B'];
    return <select value={v} onChange={e => onChange(e.target.value)} className={inp}><option value="">Escolha</option>{ops.map(o => <option key={o}>{o}</option>)}</select>;
  }
  if (['unica', 'checkbox', 'etiquetas'].includes(c.tipo)) {
    const multi = c.tipo !== 'unica';
    const atual = listaValores(valor);
    return (
      <div className="flex flex-wrap gap-1">{c.opcoes.map(o => {
        const on = atual.includes(o);
        return <button key={o} onClick={() => onChange(multi ? (on ? atual.filter(x => x !== o) : [...atual, o]) : (on ? '' : o))}
          className={`text-[11px] rounded-full px-2 py-0.5 border ${on ? 'border-[var(--c-destaque)] bg-[var(--c-destaque)]/15 text-[var(--c-texto)]' : 'border-[var(--c-borda)] text-[var(--c-suave)]'}`}>{o}</button>;
      })}</div>
    );
  }
  if (c.tipo === 'anexo') return <button onClick={() => onChange(valor ? '' : 'foto-teste.jpg')} className={btn}>{valor ? 'foto-teste.jpg ✓' : 'Simular foto'}</button>;
  const tipoInput = { data: 'date', datahora: 'datetime-local', vencimento: 'date', numero: 'number', moeda: 'number', email: 'email', telefone: 'tel' }[c.tipo] || 'text';
  return <input type={tipoInput} value={v} onChange={e => onChange(e.target.value)} className={inp} />;
}

function Previa({ id, nome, d, nomesExistentes, onCriada, onAbrirTela }) {
  const [cards, setCards] = useState([]);
  const [aberto, setAberto] = useState(null);
  const [aviso, setAviso] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [aprovando, setAprovando] = useState(false);
  const [criada, setCriada] = useState(null);
  const [erro, setErro] = useState('');
  const { erros, avisos } = useMemo(() => revisar(nome, d, nomesExistentes), [nome, d, nomesExistentes]);
  const camposDe = (k, valores) => d.campos.filter(c => c.coluna === k && visivelAgora(c, valores));
  const card = cards.find(c => c.id === aberto);
  function criarTeste() {
    const n = { id: Date.now(), coluna: d.colunas[0]?.chave_temp, valores: {} };
    setCards(l => [...l, n]); setAberto(n.id); setAviso('');
  }
  function mover(dir) {
    const i = d.colunas.findIndex(c => c.chave_temp === card.coluna);
    const j = i + dir;
    if (j < 0 || j >= d.colunas.length) return;
    if (dir > 0) {
      const faltam = camposDe(card.coluna, card.valores).filter(c => c.obrigatorio && !listaValores(card.valores[c.uid]).filter(Boolean).length);
      if (faltam.length) { setAviso(`Preencha antes de sair de "${d.colunas[i].nome}": ${faltam.map(c => c.rotulo).join(', ')}.`); return; }
    }
    setAviso('');
    setCards(l => l.map(c => (c.id === card.id ? { ...c, coluna: d.colunas[j].chave_temp } : c)));
  }
  async function aprovar() {
    setAprovando(true); setErro('');
    try {
      const { data } = await construtorService.aprovar(id);
      setCriada(data.quadro); onCriada(data.quadro.id);
    } catch (e) { setErro(erroDe(e, 'Não consegui criar a tela.')); }
    finally { setAprovando(false); setConfirmar(false); }
  }
  if (criada) {
    return (
      <div className="max-w-lg mx-auto rounded-2xl border border-green-500/30 bg-green-500/5 p-6 text-center space-y-3">
        <Check size={28} className="mx-auto text-green-400" />
        <p className="text-sm font-bold text-[var(--c-texto)]">Tela "{criada.nome}" criada</p>
        <p className="text-xs text-[var(--c-suave)]">Ela já aparece para os admins. Para liberar a outros colaboradores, use Admin › Usuários.</p>
        <button onClick={() => onAbrirTela(criada.id)} className={btnPrim}><ExternalLink size={13} /> Abrir a tela</button>
      </div>
    );
  }
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-3 items-start">
      <div className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-3 space-y-3 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold text-[var(--c-texto)]">{nome || 'Sem nome'}</p>
          <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-amber-500/15 text-amber-400">Modo teste · nada é gravado</span>
          <button onClick={criarTeste} className={`${btn} ml-auto`}><Play size={12} /> Criar card de teste</button>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {d.colunas.map(col => {
            const dela = cards.filter(c => c.coluna === col.chave_temp);
            return (
              <div key={col.chave_temp} className="w-52 shrink-0 space-y-1.5">
                <div className="border-t-[3px] rounded-t pt-1.5 flex items-center gap-1" style={{ borderColor: col.cor }}>
                  <p className="flex-1 text-xs font-bold text-[var(--c-texto)] truncate">{col.nome}</p>
                  <span className="text-[10px] text-[var(--c-suave)]">{dela.length}</span>
                </div>
                {dela.length ? dela.map(c => (
                  <button key={c.id} onClick={() => { setAberto(c.id); setAviso(''); }} className={`w-full text-left rounded-xl border p-2 text-[11px] ${aberto === c.id ? 'border-[var(--c-destaque)]' : 'border-[var(--c-borda)]'} bg-[var(--c-fundo)]`}>
                    <p className="font-semibold text-[var(--c-texto)]">Card de teste</p>
                    <p className="text-[var(--c-suave)]">{Object.values(c.valores).filter(v => listaValores(v).filter(Boolean).length).length} campos preenchidos</p>
                  </button>
                )) : <div className="rounded-xl border border-dashed border-[var(--c-borda)] py-5 text-center text-[10px] text-[var(--c-suave)]">Sem cards</div>}
              </div>
            );
          })}
        </div>
        {card && (
          <div className="rounded-xl border border-[var(--c-borda)] bg-[var(--c-fundo)] p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <p className="flex-1 text-xs font-bold text-[var(--c-texto)]">Card de teste · {d.colunas.find(c => c.chave_temp === card.coluna)?.nome}</p>
              <button onClick={() => mover(-1)} className={btn}><ArrowLeft size={12} /></button>
              <button onClick={() => mover(1)} className={btnPrim}>Mover <ArrowRight size={12} /></button>
              <button onClick={() => setAberto(null)} className="p-1 text-[var(--c-suave)]" aria-label="Fechar"><X size={14} /></button>
            </div>
            {aviso && <p className="text-[11px] text-amber-400">{aviso}</p>}
            {camposDe(card.coluna, card.valores).length ? camposDe(card.coluna, card.valores).map(c => (
              <div key={c.uid}>
                <p className="text-[11px] text-[var(--c-suave)] mb-1">{c.obrigatorio && <span className="text-red-400">* </span>}{c.rotulo}{c.descricao ? <span className="text-[10px]"> · {c.descricao}</span> : null}</p>
                <CampoTeste c={c} valor={card.valores[c.uid]} onChange={v => setCards(l => l.map(x => (x.id === card.id ? { ...x, valores: { ...x.valores, [c.uid]: v } } : x)))} />
              </div>
            )) : <p className="text-[11px] text-[var(--c-suave)]">Esta coluna não tem campos.</p>}
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-3 space-y-2 lg:sticky lg:top-2">
        <p className="text-[10px] uppercase tracking-wide text-[var(--c-suave)]">Revisão automática</p>
        <p className="text-xs text-green-400 flex items-center gap-1.5"><Check size={12} /> {d.colunas.length} colunas · {d.campos.length} campos</p>
        {erros.map(e => <p key={e} className="text-xs text-red-400 flex items-start gap-1.5"><X size={12} className="mt-0.5 shrink-0" /> {e}</p>)}
        {avisos.map(a => <p key={a} className="text-xs text-amber-400 flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {a}</p>)}
        {!erros.length && !avisos.length && <p className="text-xs text-green-400 flex items-center gap-1.5"><Check size={12} /> Tudo certo</p>}
        <div className="pt-2 border-t border-[var(--c-borda)] space-y-1.5">
          <p className="text-[11px] text-[var(--c-suave)]">Ao aprovar, a tela é criada com essas colunas e campos e aparece para os admins. Depois dá para ajustar no Configurar da tela.</p>
          {erro && <p className="text-xs text-red-400">{erro}</p>}
          {confirmar ? (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-[var(--c-texto)]">Criar a tela "{nome.trim()}" agora?</p>
              <div className="flex gap-2">
                <button onClick={aprovar} disabled={aprovando} className={`${btnPrim} flex-1 justify-center`}>{aprovando ? <Spinner size={12} /> : <Check size={13} />} Sim, criar</button>
                <button onClick={() => setConfirmar(false)} className={btn}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmar(true)} disabled={erros.length > 0} title={erros.length ? 'Corrija os itens em vermelho' : ''} className={`${btnPrim} w-full justify-center`}><Check size={13} /> Aprovar e criar tela</button>
          )}
        </div>
      </div>
    </div>
  );
}
