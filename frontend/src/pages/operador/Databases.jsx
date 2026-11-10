// ============================================================
// pages/operador/Databases.jsx — Databases do B-Requisições
// ============================================================
// Igual às databases do Pipefy: cada database tem Descrição, Valor (opcional)
// e colunas próprias (texto, número, moeda, data, opções). Os registros são
// usados nos campos "Registro (descrição e valor)" e "Lista do B-Requisições"
// de qualquer coluna (Orçamento, Lojinha, Logística CIF) — escolha a database
// no Configurar (engrenagem) de cada campo.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { Database, Plus, Search, Trash2, Pencil, Check, X, Download, Upload, DownloadCloud, MoreVertical } from 'lucide-react';
import { basesService } from '../../services/api';
import { Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { mexeTela } from '../../utils/telas';
import { NomeTela } from '../../utils/nomesTelas';

const TIPOS = [
  { valor: 'texto', nome: 'Texto' },
  { valor: 'numero', nome: 'Número' },
  { valor: 'moeda', nome: 'Moeda (R$)' },
  { valor: 'data', nome: 'Data' },
  { valor: 'opcoes', nome: 'Opções (lista)' },
];
const fmtR$ = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = (n) => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const inp = 'w-full bg-[var(--c-fundo)] border border-[var(--c-borda)] text-[var(--c-texto)] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[var(--c-destaque)]';
const btn = 'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-[var(--c-borda)] bg-[var(--c-superficie)] text-[var(--c-texto)] hover:border-[var(--c-destaque)] disabled:opacity-40';
const erroDe = (e, padrao) => e?.response?.data?.erro || padrao;
const mostrar = (tipo, v) => {
  if (v === undefined || v === null || v === '') return '';
  if (tipo === 'moeda') return fmtR$(String(v).replace(',', '.'));
  if (tipo === 'numero') return fmtNum(String(v).replace(',', '.'));
  if (tipo === 'data') { const d = String(v).slice(0, 10).split('-'); return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : v; }
  return String(v);
};

// Célula editável: salva ao sair do campo ou com Enter (Esc desfaz)
function Celula({ tipo = 'texto', valor, opcoes = [], onSalvar, podeEditar, alinhar = 'left' }) {
  const [editando, setEditando] = useState(false);
  const [txt, setTxt] = useState('');
  const [salvando, setSalvando] = useState(false);
  const abrir = () => { if (!podeEditar) return; setTxt(valor ?? ''); setEditando(true); };
  async function salvar() {
    if (String(txt ?? '') === String(valor ?? '')) { setEditando(false); return; }
    setSalvando(true);
    const ok = await onSalvar(txt);
    setSalvando(false);
    if (ok !== false) setEditando(false);
  }
  if (editando) {
    const comum = { autoFocus: true, onBlur: salvar, className: inp,
      onKeyDown: e => { if (e.key === 'Enter' && tipo !== 'longo') { e.preventDefault(); salvar(); } if (e.key === 'Escape') setEditando(false); } };
    if (tipo === 'opcoes') return (
      <select value={txt} onChange={e => setTxt(e.target.value)} {...comum}>
        <option value="">—</option>
        {opcoes.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
    return <input type={tipo === 'data' ? 'date' : 'text'} inputMode={['numero', 'moeda'].includes(tipo) ? 'decimal' : undefined}
      value={txt} onChange={e => setTxt(e.target.value)} disabled={salvando} {...comum} />;
  }
  const texto = mostrar(tipo, valor);
  return (
    <div onClick={abrir} title={podeEditar ? 'Clique para editar' : undefined}
      className={`min-h-[30px] px-2 py-1.5 rounded-lg text-xs text-[var(--c-texto)] break-words ${podeEditar ? 'cursor-text hover:bg-[var(--c-borda)]/40' : ''} ${alinhar === 'right' ? 'text-right' : ''}`}>
      {texto || <span className="text-[var(--c-suave)]">{podeEditar ? '—' : ''}</span>}
    </div>
  );
}

// Menu da coluna: nome, tipo, opções e excluir
function EditorColuna({ coluna, onSalvar, onExcluir, onFechar }) {
  const [nome, setNome] = useState(coluna?.nome || '');
  const [tipo, setTipo] = useState(coluna?.tipo || 'texto');
  const [opcoes, setOpcoes] = useState((coluna?.opcoes || []).join('\n'));
  const ref = useRef(null);
  useEffect(() => {
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) onFechar(); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [onFechar]);
  return (
    <div ref={ref} className="absolute z-30 top-full left-0 mt-1 w-64 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] shadow-xl p-3 space-y-2 text-left normal-case font-normal tracking-normal">
      <label className="block text-[11px] text-[var(--c-suave)]">Nome da coluna
        <input autoFocus value={nome} onChange={e => setNome(e.target.value)} className={`${inp} mt-1`} /></label>
      <label className="block text-[11px] text-[var(--c-suave)]">Tipo
        <select value={tipo} onChange={e => setTipo(e.target.value)} className={`${inp} mt-1`}>
          {TIPOS.map(t => <option key={t.valor} value={t.valor}>{t.nome}</option>)}
        </select></label>
      {tipo === 'opcoes' && (
        <label className="block text-[11px] text-[var(--c-suave)]">Opções (uma por linha)
          <textarea rows={4} value={opcoes} onChange={e => setOpcoes(e.target.value)} className={`${inp} mt-1`} /></label>
      )}
      <div className="flex items-center gap-2 pt-1">
        {onExcluir && <button type="button" onClick={onExcluir} className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300"><Trash2 size={12} /> Excluir coluna</button>}
        <button type="button" onClick={onFechar} className="ml-auto text-[11px] text-[var(--c-suave)] hover:text-[var(--c-texto)]">Cancelar</button>
        <button type="button" disabled={nome.trim().length < 1}
          onClick={() => onSalvar({ ...(coluna || {}), nome: nome.trim(), tipo, opcoes: tipo === 'opcoes' ? opcoes.split('\n').map(o => o.trim()).filter(Boolean) : [] })}
          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--c-destaque)] text-white disabled:opacity-40">Salvar</button>
      </div>
    </div>
  );
}

// Texto de uma célula da planilha: datas em dd/mm/aaaa, CPF/CNPJ/CEP com os zeros, sim/não
function textoCelula(v, rotulo = '') {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    const p = n => String(n).padStart(2, '0');
    const d = `${p(v.getDate())}/${p(v.getMonth() + 1)}/${v.getFullYear()}`;
    return v.getHours() || v.getMinutes() || v.getSeconds() ? `${d} ${p(v.getHours())}:${p(v.getMinutes())}` : d;
  }
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  const r = semAcento(String(rotulo));
  if (typeof v === 'number' && Number.isInteger(v)) {
    if (/cpf|cnpj/.test(r)) return String(v).padStart(String(v).length > 11 ? 14 : 11, '0');
    if (/\bcep\b/.test(r)) return String(v).padStart(8, '0');
    return String(v);
  }
  return String(v).trim();
}

export default function Databases() {
  const { usuario } = useAuth();
  const podeEditar = mexeTela(usuario, 'databases');
  const [bases, setBases] = useState(null);
  const [selId, setSelId] = useState(null);
  const [buscaBase, setBuscaBase] = useState('');
  const [nova, setNova] = useState(null); // { nome, com_valor }
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  async function carregarBases(selecionar) {
    try {
      const { data } = await basesService.listar();
      setBases(data.bases);
      setSelId(s => selecionar ?? (data.bases.some(b => b.id === s) ? s : data.bases[0]?.id ?? null));
    } catch (e) { setErro(erroDe(e, 'Não consegui carregar as databases.')); setBases([]); }
  }
  useEffect(() => { carregarBases(); }, []);

  async function criarBase() {
    const nome = String(nova?.nome || '').replace(/\s+/g, ' ').trim();
    if (nome.length < 2) return;
    setErro('');
    try {
      const { data } = await basesService.criar(nome, nova.com_valor !== false);
      setNova(null);
      await carregarBases(data.base.id);
    } catch (e) { setErro(erroDe(e, 'Erro ao criar a database.')); }
  }

  const sel = (bases || []).find(b => b.id === selId) || null;
  const listaBases = (bases || []).filter(b => semAcento(b.nome).includes(semAcento(buscaBase)));

  return (
    <div className="space-y-4 xl:h-[calc(100dvh-3.1rem)] xl:flex xl:flex-col">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--c-texto)] flex items-center gap-2"><Database size={18} /> <NomeTela chave="databases" padrao="Databases" /></h1>
          <p className="text-sm text-[var(--c-suave)] mt-0.5">Bases de registros para usar nos campos de qualquer coluna (Orçamento, Lojinha, Logística CIF).</p>
        </div>
        {podeEditar && (
          <button onClick={() => setNova({ nome: '', com_valor: true })} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--c-destaque)] text-white hover:bg-[var(--c-destaque-h)]">
            <Plus size={13} /> Nova database
          </button>
        )}
      </div>
      {erro && <p className="text-xs text-red-400">{erro}</p>}
      {aviso && <p className="text-xs text-green-400">{aviso}</p>}

      {nova && (
        <div className="rounded-xl border border-[var(--c-destaque)]/40 bg-[var(--c-superficie)] p-3 flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[220px] text-[11px] text-[var(--c-suave)]">Nome da database
            <input autoFocus value={nova.nome} onChange={e => setNova(n => ({ ...n, nome: e.target.value }))} placeholder="Ex.: Peças em Geral, Transportadoras…"
              onKeyDown={e => { if (e.key === 'Enter') criarBase(); if (e.key === 'Escape') setNova(null); }} className={`${inp} mt-1`} /></label>
          <label className="flex items-center gap-2 text-xs text-[var(--c-texto)] pb-2">
            <input type="checkbox" checked={nova.com_valor !== false} onChange={e => setNova(n => ({ ...n, com_valor: e.target.checked }))} className="accent-[var(--c-destaque)]" />
            Tem coluna Valor (R$)
          </label>
          <button onClick={criarBase} disabled={nova.nome.trim().length < 2} className="px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--c-destaque)] text-white disabled:opacity-40">Criar</button>
          <button onClick={() => setNova(null)} className="px-3 py-2 rounded-xl text-xs text-[var(--c-suave)]">Cancelar</button>
        </div>
      )}

      {!bases ? (
        <div className="flex justify-center py-16"><Spinner className="text-[var(--c-destaque)]" /></div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-4 xl:flex-1 xl:min-h-0">
          {/* Lista de databases */}
          <aside className="lg:w-64 shrink-0 space-y-2 xl:overflow-y-auto">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-suave)]" />
              <input value={buscaBase} onChange={e => setBuscaBase(e.target.value)} placeholder="Buscar database…" className={`${inp} pl-8`} />
            </div>
            {!listaBases.length && <p className="text-xs text-[var(--c-suave)] px-1">Nenhuma database.{podeEditar ? ' Use “Nova database”.' : ''}</p>}
            {listaBases.map(b => (
              <button key={b.id} onClick={() => setSelId(b.id)}
                className={`w-full text-left px-3 py-2 rounded-xl border transition-colors ${b.id === selId ? 'border-[var(--c-destaque)] bg-[var(--c-destaque)]/10' : 'border-[var(--c-borda)] bg-[var(--c-superficie)] hover:border-[var(--c-borda-forte)]'}`}>
                <p className="text-sm font-semibold text-[var(--c-texto)] truncate">{b.nome}</p>
                <p className="text-[11px] text-[var(--c-suave)]">{b.registros} registro{b.registros === 1 ? '' : 's'} · {b.com_valor === false ? 'só descrição' : 'com valor'}{b.pipefy_tabela ? ' · Pipefy' : ''}</p>
              </button>
            ))}
          </aside>

          {/* Database escolhida */}
          <section className="flex-1 min-w-0 xl:min-h-0 xl:flex xl:flex-col">
            {sel
              ? <TabelaDatabase key={sel.id} base={sel} podeEditar={podeEditar} onMudou={(selecionar) => carregarBases(selecionar)} setAviso={setAviso} />
              : <p className="text-sm text-[var(--c-suave)] py-10 text-center">Escolha ou crie uma database.</p>}
          </section>
        </div>
      )}
    </div>
  );
}

function TabelaDatabase({ base, podeEditar, onMudou, setAviso }) {
  const [info, setInfo] = useState({ nome: base.nome, com_valor: base.com_valor !== false, colunas: Array.isArray(base.colunas) ? base.colunas : [], pipefy_tabela: base.pipefy_tabela });
  const [registros, setRegistros] = useState(null);
  const [total, setTotal] = useState(0);
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(300);
  const [erro, setErro] = useState('');
  const [editNome, setEditNome] = useState(null);
  const [menuCol, setMenuCol] = useState(null); // id da coluna | 'nova'
  const [novo, setNovo] = useState(null); // { descricao, valor, dados }
  const [ocupado, setOcupado] = useState('');
  const colunas = info.colunas;

  async function carregar(q = busca, lim = limite) {
    try {
      const { data } = await basesService.registros(base.id, { limite: lim, q: q.trim() });
      setRegistros(data.registros); setTotal(data.total ?? data.registros.length);
    } catch (e) { setErro(erroDe(e, 'Não consegui carregar os registros.')); setRegistros([]); setTotal(0); }
  }
  // A lista vem por páginas e a busca é feita no servidor (a database pode ter dezenas de milhares de registros)
  useEffect(() => {
    const t = setTimeout(() => carregar(busca, limite), registros === null ? 0 : 350);
    return () => clearTimeout(t);
  }, [busca, limite]); // eslint-disable-line react-hooks/exhaustive-deps

  async function salvarBase(mudanca) {
    setErro('');
    try {
      const { data } = await basesService.editarBase(base.id, mudanca);
      setInfo(i => ({ ...i, ...data.base, com_valor: data.base.com_valor !== false }));
      onMudou(base.id);
      return true;
    } catch (e) { setErro(erroDe(e, 'Erro ao salvar a database.')); return false; }
  }
  async function salvarColuna(c) {
    const nova = !c.id;
    const lista = nova ? [...colunas, c] : colunas.map(x => (x.id === c.id ? c : x));
    if (await salvarBase({ colunas: lista })) setMenuCol(null);
  }
  async function excluirColuna(c) {
    if (!confirm(`Excluir a coluna "${c.nome}"? Os valores dela somem desta database.`)) return;
    if (await salvarBase({ colunas: colunas.filter(x => x.id !== c.id) })) setMenuCol(null);
  }
  async function salvarCelula(r, chave, v) {
    setErro('');
    const corpo = chave === 'descricao' ? { descricao: v } : chave === 'valor' ? { valor: v } : { dados: { [chave]: v } };
    try {
      const { data } = await basesService.editarRegistro(r.id, corpo);
      setRegistros(lista => lista.map(x => (x.id === r.id ? data.registro : x)));
      return true;
    } catch (e) { setErro(erroDe(e, 'Erro ao salvar.')); return false; }
  }
  async function excluirRegistro(r) {
    if (!confirm(`Excluir "${r.descricao}" da database? Os cards que já usaram continuam com o que foi escolhido.`)) return;
    try { await basesService.excluirRegistro(r.id); setRegistros(l => l.filter(x => x.id !== r.id)); onMudou(base.id); }
    catch (e) { setErro(erroDe(e, 'Erro ao excluir.')); }
  }
  async function criarRegistro() {
    const descricao = String(novo?.descricao || '').replace(/\s+/g, ' ').trim();
    if (descricao.length < 2) { setErro('Digite a descrição.'); return; }
    setErro('');
    try {
      const { data } = await basesService.criarRegistro(base.id, { descricao, valor: info.com_valor ? (novo.valor || 0) : 0, dados: novo.dados || {} });
      setRegistros(l => [data.registro, ...l]);
      setNovo({ descricao: '', valor: '', dados: {} });
      onMudou(base.id);
    } catch (e) { setErro(erroDe(e, 'Erro ao criar o registro.')); }
  }
  async function excluirDatabase() {
    if (!confirm(`Excluir a database "${info.nome}" e os ${total} registro(s)? Os cards que já usaram continuam com o que foi escolhido.`)) return;
    try { await basesService.excluir(base.id); onMudou(null); }
    catch (e) { setErro(erroDe(e, 'Erro ao excluir a database.')); }
  }
  // Exportar CSV (abre no Excel)
  async function exportar() {
    setOcupado('Preparando a exportação…'); setErro('');
    try {
      const todos = [];
      for (let off = 0; ; off += 2000) {
        const { data } = await basesService.registros(base.id, { limite: 2000, offset: off, q: busca.trim() });
        todos.push(...data.registros);
        if (data.registros.length < 2000) break;
      }
      const cab = ['Descrição', ...(info.com_valor ? ['Valor'] : []), ...colunas.map(c => c.nome)];
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const linhas = todos.map(r => [r.descricao, ...(info.com_valor ? [String(r.valor).replace('.', ',')] : []), ...colunas.map(c => r.dados?.[c.id] ?? '')].map(esc).join(';'));
      const blob = new Blob(['\ufeff' + [cab.map(esc).join(';'), ...linhas].join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `${info.nome}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { setErro(erroDe(e, 'Erro ao exportar.')); }
    finally { setOcupado(''); }
  }
  async function trazerPipefy() {
    if (!confirm('Atualizar esta database com a "Peças em Geral" do Pipefy (descrição e preço)? Só lê o Pipefy.')) return;
    setErro(''); setOcupado('Lendo o Pipefy…');
    try {
      let cursor = null, r;
      do {
        ({ data: r } = await basesService.importarPipefy(cursor, base.id));
        cursor = r.cursor; setOcupado(`${r.total} registro(s)…`);
      } while (!r.terminou);
      setAviso(`Pipefy: ${r.total} registro(s) em "${r.base.nome}".`);
      await carregar(busca, limite); onMudou(base.id);
    } catch (e) { setErro(erroDe(e, 'Erro ao trazer do Pipefy.')); }
    finally { setOcupado(''); }
  }

  const filtrados = registros || [];
  const visiveis = filtrados;
  const th = 'px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--c-suave)] whitespace-nowrap';

  return (
    <div className="space-y-3 xl:flex xl:flex-col xl:min-h-0 xl:flex-1">
      {/* Cabeçalho da database */}
      <div className="flex items-center gap-2 flex-wrap">
        {editNome !== null ? (
          <div className="flex items-center gap-1.5">
            <input autoFocus value={editNome} onChange={e => setEditNome(e.target.value)} className={`${inp} w-64 text-sm`}
              onKeyDown={async e => { if (e.key === 'Enter' && await salvarBase({ nome: editNome })) setEditNome(null); if (e.key === 'Escape') setEditNome(null); }} />
            <button onClick={async () => { if (await salvarBase({ nome: editNome })) setEditNome(null); }} className="p-1.5 text-green-400"><Check size={15} /></button>
            <button onClick={() => setEditNome(null)} className="p-1.5 text-[var(--c-suave)]"><X size={15} /></button>
          </div>
        ) : (
          <h2 className="text-base font-bold text-[var(--c-texto)] flex items-center gap-2">
            {info.nome}
            {podeEditar && <button onClick={() => setEditNome(info.nome)} title="Renomear" className="p-1 text-[var(--c-suave)] hover:text-[var(--c-destaque)]"><Pencil size={13} /></button>}
          </h2>
        )}
        <span className="text-xs text-[var(--c-suave)]">{registros ? `${total} registro(s)` : ''}</span>
        {podeEditar && (
          <label className="flex items-center gap-1.5 text-xs text-[var(--c-texto)] ml-2" title="Coluna Valor (R$) usada no campo Registro (descrição e valor)">
            <input type="checkbox" checked={info.com_valor} onChange={e => salvarBase({ com_valor: e.target.checked })} className="accent-[var(--c-destaque)]" /> Coluna Valor
          </label>
        )}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-suave)]" />
            <input value={busca} onChange={e => { setBusca(e.target.value); setLimite(300); }} placeholder="Buscar registro…" className={`${inp} pl-8 w-52`} />
          </div>
          {podeEditar && <button onClick={() => setNovo({ descricao: '', valor: '', dados: {} })} className={btn}><Plus size={13} /> Registro</button>}
          {podeEditar && (
            <label className={`${btn} cursor-pointer`} title="Importar planilha do Excel (.xlsx, .xls ou .csv)">
              <Upload size={13} /> Importar planilha
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={!!ocupado}
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; importarArquivo(f); }} />
            </label>
          )}
          <button onClick={exportar} disabled={!registros?.length} className={btn}><Download size={13} /> Exportar</button>
          {podeEditar && (info.pipefy_tabela || /pe[cç]as em geral/i.test(info.nome)) && (
            <button onClick={trazerPipefy} disabled={!!ocupado} className={btn}><DownloadCloud size={13} /> Atualizar do Pipefy</button>
          )}
          {podeEditar && <button onClick={excluirDatabase} title="Excluir database" className="p-2 rounded-xl text-red-400 hover:bg-red-500/10"><Trash2 size={15} /></button>}
        </div>
      </div>
      {ocupado && <p className="flex items-center gap-2 text-xs text-[var(--c-suave)]"><Spinner size={12} /> {ocupado}</p>}
      {erro && <p className="text-xs text-red-400">{erro}</p>}

      {/* Tabela */}
      <div className="rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] overflow-auto xl:flex-1 xl:min-h-0">
        {!registros ? <div className="flex justify-center py-10"><Spinner className="text-[var(--c-destaque)]" /></div> : (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-20 bg-[var(--c-superficie)] border-b border-[var(--c-borda)]">
              <tr>
                <th className={`${th} min-w-[260px]`}>Descrição</th>
                {info.com_valor && <th className={`${th} w-32 text-right`}>Valor</th>}
                {colunas.map(c => (
                  <th key={c.id} className={`${th} min-w-[140px] relative`}>
                    <button disabled={!podeEditar} onClick={() => setMenuCol(m => (m === c.id ? null : c.id))}
                      className="inline-flex items-center gap-1 hover:text-[var(--c-texto)] disabled:cursor-default" title={podeEditar ? 'Editar coluna' : undefined}>
                      {c.nome} <span className="normal-case font-normal text-[10px]">({TIPOS.find(t => t.valor === c.tipo)?.nome || c.tipo})</span>
                      {podeEditar && <MoreVertical size={11} />}
                    </button>
                    {menuCol === c.id && <EditorColuna coluna={c} onSalvar={salvarColuna} onExcluir={() => excluirColuna(c)} onFechar={() => setMenuCol(null)} />}
                  </th>
                ))}
                {podeEditar && (
                  <th className={`${th} w-28 relative`}>
                    <button onClick={() => setMenuCol(m => (m === 'nova' ? null : 'nova'))} className="inline-flex items-center gap-1 text-[var(--c-destaque)] hover:underline normal-case"><Plus size={12} /> Coluna</button>
                    {menuCol === 'nova' && <EditorColuna coluna={null} onSalvar={salvarColuna} onFechar={() => setMenuCol(null)} />}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {novo && (
                <tr className="border-b border-[var(--c-borda)] bg-[var(--c-destaque)]/5">
                  <td className="p-1.5"><input autoFocus value={novo.descricao} onChange={e => setNovo(n => ({ ...n, descricao: e.target.value }))} placeholder="Descrição do novo registro"
                    onKeyDown={e => { if (e.key === 'Enter') criarRegistro(); if (e.key === 'Escape') setNovo(null); }} className={inp} /></td>
                  {info.com_valor && <td className="p-1.5"><input value={novo.valor} onChange={e => setNovo(n => ({ ...n, valor: e.target.value }))} inputMode="decimal" placeholder="0,00"
                    onKeyDown={e => { if (e.key === 'Enter') criarRegistro(); }} className={`${inp} text-right`} /></td>}
                  {colunas.map(c => (
                    <td key={c.id} className="p-1.5">
                      {c.tipo === 'opcoes'
                        ? <select value={novo.dados?.[c.id] || ''} onChange={e => setNovo(n => ({ ...n, dados: { ...n.dados, [c.id]: e.target.value } }))} className={inp}>
                            <option value="">—</option>{c.opcoes.map(o => <option key={o} value={o}>{o}</option>)}</select>
                        : <input type={c.tipo === 'data' ? 'date' : 'text'} value={novo.dados?.[c.id] || ''} onChange={e => setNovo(n => ({ ...n, dados: { ...n.dados, [c.id]: e.target.value } }))}
                            onKeyDown={e => { if (e.key === 'Enter') criarRegistro(); }} className={inp} />}
                    </td>
                  ))}
                  <td className="p-1.5 whitespace-nowrap">
                    <button onClick={criarRegistro} className="p-1.5 text-green-400" title="Salvar"><Check size={14} /></button>
                    <button onClick={() => setNovo(null)} className="p-1.5 text-[var(--c-suave)]" title="Cancelar"><X size={14} /></button>
                  </td>
                </tr>
              )}
              {visiveis.map(r => (
                <tr key={r.id} className="border-b border-[var(--c-borda)] last:border-0 group">
                  <td className="p-1"><Celula valor={r.descricao} podeEditar={podeEditar} onSalvar={v => salvarCelula(r, 'descricao', v)} /></td>
                  {info.com_valor && <td className="p-1"><Celula tipo="moeda" alinhar="right" valor={r.valor} podeEditar={podeEditar} onSalvar={v => salvarCelula(r, 'valor', v)} /></td>}
                  {colunas.map(c => (
                    <td key={c.id} className="p-1"><Celula tipo={c.tipo} opcoes={c.opcoes} valor={r.dados?.[c.id]} podeEditar={podeEditar} onSalvar={v => salvarCelula(r, c.id, v)} /></td>
                  ))}
                  {podeEditar && (
                    <td className="p-1 text-center">
                      <button onClick={() => excluirRegistro(r)} title="Excluir registro" className="p-1.5 rounded-lg text-[var(--c-suave)] opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10"><Trash2 size={13} /></button>
                    </td>
                  )}
                </tr>
              ))}
              {!visiveis.length && !novo && (
                <tr><td colSpan={99} className="py-10 text-center text-xs text-[var(--c-suave)]">{busca ? 'Nada encontrado.' : 'Database vazia. Use “+ Registro” ou “Colar planilha”.'}</td></tr>
              )}
            </tbody>
          </table>
        )}
        {registros && total > registros.length && (
          <button onClick={() => setLimite(l => l + 300)} className="w-full py-2 text-xs text-[var(--c-destaque)] hover:underline">Mostrar mais ({total - registros.length} restantes)</button>
        )}
      </div>
      <p className="text-[11px] text-[var(--c-suave)]">Para usar em um campo: abra a engrenagem da coluna (Orçamento, Lojinha ou Logística CIF), crie o campo do tipo <b>Registro (descrição e valor)</b> ou <b>Lista do B-Requisições</b> e escolha esta database.</p>
    </div>
  );
}
