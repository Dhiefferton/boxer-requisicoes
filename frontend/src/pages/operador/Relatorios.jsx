// ============================================================
// pages/operador/Relatorios.jsx — Relatórios (histórico do Pipefy dentro do sistema)
// ============================================================
// Lista de relatórios (criar, editar, excluir) e, dentro de cada um, filtros com e/ou,
// colunas, fórmulas, ordenação, paginação e exportação CSV — igual ao Pipefy.
// Os cards importados NÃO aparecem nos quadros: só aqui, nos relatórios.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Trash2, ChevronLeft, ChevronRight, Sigma, Columns3, Download, Save, X, ArrowUp, ArrowDown, Database, RefreshCw, ExternalLink, Pencil } from 'lucide-react';
import { relatoriosService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Spinner } from '../../components/ui';

const FIXAS = [
  ['@id', 'Código do card', 'texto'], ['@titulo', 'Título', 'texto'], ['@fase', 'Fase atual', 'texto'],
  ['@criado_por', 'Criado por', 'texto'], ['@criado_em', 'Criado em', 'data'],
  ['@finalizado_em', 'Finalizado em', 'data'], ['@atualizado_em', 'Atualizado em', 'data'],
];
const tipoDe = (chave) => {
  const f = FIXAS.find(x => x[0] === chave);
  if (f) return f[2];
  if (chave.startsWith('fe:')) return 'data';
  if (chave.startsWith('f:')) return 'numero';
  return 'texto';
};
const rotuloDe = (chave) => {
  const f = FIXAS.find(x => x[0] === chave);
  if (f) return f[1];
  if (chave.startsWith('fe:')) return `Entrada em "${chave.slice(3)}"`;
  if (chave.startsWith('f:')) return `Tempo em "${chave.slice(2)}"`;
  return chave.slice(2);
};
const OPS = {
  texto: [['contem', 'contém'], ['nao_contem', 'não contém'], ['igual', 'é igual a'], ['diferente', 'é diferente de'], ['comeca', 'começa com'],
          ['maior', 'maior que (nº)'], ['menor', 'menor que (nº)'], ['vazio', 'está vazio'], ['preenchido', 'está preenchido']],
  numero: [['maior', 'maior que (horas)'], ['menor', 'menor que (horas)'], ['maior_igual', 'maior ou igual (horas)'], ['menor_igual', 'menor ou igual (horas)'], ['vazio', 'sem passagem'], ['preenchido', 'passou pela fase']],
  data: [['mes_atual', 'neste mês'], ['mes_anterior', 'mês anterior'], ['ultimos_dias', 'últimos N dias'], ['periodo', 'entre'], ['antes', 'antes de'], ['depois', 'depois de'], ['vazio', 'está vazio'], ['preenchido', 'está preenchido']],
};
const FORMULAS = [['soma', 'Soma'], ['media', 'Média'], ['minimo', 'Mínimo'], ['maximo', 'Máximo'], ['contagem', 'Contagem']];
const SEM_VALOR = ['vazio', 'preenchido', 'mes_atual', 'mes_anterior'];

const fmtDataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const fmtDur = (s) => {
  const n = Math.round(Number(s) || 0);
  if (!n) return '';
  const d = Math.floor(n / 86400), h = Math.floor((n % 86400) / 3600), m = Math.floor((n % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, (m || (!d && !h)) && `${m}min`].filter(Boolean).join(' ');
};
const fmtCelula = (v, tipo) => {
  if (v == null || v === '') return '';
  if (tipo === 'data') return fmtDataHora(v);
  if (tipo === 'numero') return fmtDur(v);
  return String(v);
};
const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
const csvCel = (x) => `"${String(x ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
const campo = 'rounded-lg border border-[var(--c-borda)] bg-[var(--c-fundo)] px-2.5 py-1.5 text-xs text-[var(--c-texto)] outline-none focus:border-[var(--c-destaque)]';
const botao = 'rounded-lg border border-[var(--c-borda)] bg-[var(--c-superficie)] text-[var(--c-texto)] text-xs font-semibold px-3 py-1.5 hover:border-[var(--c-destaque)] disabled:opacity-40 flex items-center gap-1.5';

function Modal({ titulo, onFechar, children, largo }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onFechar}>
      <div className={`w-full ${largo ? 'max-w-2xl' : 'max-w-md'} max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4 space-y-3`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--c-texto)]">{titulo}</h2>
          <button onClick={onFechar} className="text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Período (dia, semana, mês, ano ou entre datas) ───────────
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const p2 = (n) => String(n).padStart(2, '0');
const isoDia = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const deIso = (v) => { const [a, m, d] = String(v || '').split('-').map(Number); return a && m && d ? new Date(a, m - 1, d) : new Date(); };
const segunda = (d) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const fmtCurto = (d) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`;
function valorPadrao(tipo) {
  const h = new Date();
  if (tipo === 'dia') return { valor: isoDia(h), valor2: '' };
  if (tipo === 'semana') return { valor: isoDia(segunda(h)), valor2: '' };
  if (tipo === 'mes') return { valor: `${h.getFullYear()}-${p2(h.getMonth() + 1)}`, valor2: '' };
  if (tipo === 'ano') return { valor: String(h.getFullYear()), valor2: '' };
  if (tipo === 'periodo') return { valor: isoDia(new Date(h.getFullYear(), h.getMonth(), 1)), valor2: isoDia(h) };
  return { valor: '', valor2: '' };
}
function andar(per, passo) {
  if (per.tipo === 'dia') { const d = deIso(per.valor); d.setDate(d.getDate() + passo); return isoDia(d); }
  if (per.tipo === 'semana') { const d = deIso(per.valor); d.setDate(d.getDate() + 7 * passo); return isoDia(d); }
  if (per.tipo === 'mes') { const [a, m] = per.valor.split('-').map(Number); const d = new Date(a, m - 1 + passo, 1); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`; }
  if (per.tipo === 'ano') return String(Number(per.valor) + passo);
  return per.valor;
}

function FiltroPeriodo({ periodo, colunasData, onMudar }) {
  const per = periodo || { chave: colunasData[0] || '@criado_em', tipo: '', valor: '', valor2: '' };
  const tipos = [['', 'Tudo'], ['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano'], ['periodo', 'Período']];
  const escolher = (tipo) => onMudar(tipo ? { ...per, tipo, ...valorPadrao(tipo) } : null);
  const seta = 'shrink-0 rounded-lg border border-[var(--c-borda)] bg-[var(--c-superficie)] p-1 text-[var(--c-suave)] hover:text-[var(--c-texto)] hover:border-[var(--c-destaque)]';
  const anoAtual = new Date().getFullYear();
  return (
    <div className="rounded-lg border border-[var(--c-borda)] bg-[var(--c-fundo)] p-2 space-y-1.5">
      <p className="text-[11px] font-semibold text-[var(--c-suave)]">Período</p>
      <select className={`${campo} w-full`} value={per.chave} onChange={e => onMudar(per.tipo ? { ...per, chave: e.target.value } : { ...per, chave: e.target.value, tipo: 'mes', ...valorPadrao('mes') })}>
        {colunasData.map(k => <option key={k} value={k}>{rotuloDe(k)}</option>)}
      </select>
      <div className="grid grid-cols-3 gap-1">
        {tipos.map(([k, t]) => (
          <button key={k || 'tudo'} onClick={() => escolher(k)}
            className={`text-[11px] font-semibold rounded-md py-1 ${(per.tipo || '') === k ? 'bg-[var(--c-destaque)] text-white' : 'bg-[var(--c-borda)] text-[var(--c-suave)] hover:text-[var(--c-texto)]'}`}>{t}</button>
        ))}
      </div>
      {['dia', 'semana', 'mes', 'ano'].includes(per.tipo) && (
        <div className="flex items-center gap-1">
          <button className={seta} title="Anterior" onClick={() => onMudar({ ...per, valor: andar(per, -1) })}><ChevronLeft size={13} /></button>
          {per.tipo === 'dia' && (
            <input className={`${campo} flex-1 min-w-0`} type="date" value={per.valor} onChange={e => e.target.value && onMudar({ ...per, valor: e.target.value })} />
          )}
          {per.tipo === 'semana' && (
            <label className="flex-1 min-w-0 relative">
              <span className={`${campo} block text-center truncate`}>{fmtCurto(deIso(per.valor))} a {fmtCurto(new Date(deIso(per.valor).getTime() + 6 * 86400000))}</span>
              <input className="absolute inset-0 opacity-0 cursor-pointer" type="date" value={per.valor} title="Escolha um dia da semana"
                onChange={e => e.target.value && onMudar({ ...per, valor: isoDia(segunda(deIso(e.target.value))) })} />
            </label>
          )}
          {per.tipo === 'mes' && (() => {
            const [a, m] = per.valor.split('-').map(Number);
            return (
              <div className="flex-1 min-w-0 flex gap-1">
                <select className={`${campo} flex-1 min-w-0`} value={m} onChange={e => onMudar({ ...per, valor: `${a}-${p2(e.target.value)}` })}>
                  {MESES.map((nm, i) => <option key={nm} value={i + 1}>{nm}</option>)}
                </select>
                <input className={`${campo} w-16`} type="number" value={a} onChange={e => /^\d{4}$/.test(e.target.value) && onMudar({ ...per, valor: `${e.target.value}-${p2(m)}` })} />
              </div>
            );
          })()}
          {per.tipo === 'ano' && (
            <select className={`${campo} flex-1 min-w-0`} value={per.valor} onChange={e => onMudar({ ...per, valor: e.target.value })}>
              {Array.from({ length: 12 }, (_, i) => String(anoAtual - 10 + i)).concat(per.valor).filter((x, i, l) => l.indexOf(x) === i).sort().map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          <button className={seta} title="Próximo" onClick={() => onMudar({ ...per, valor: andar(per, 1) })}><ChevronRight size={13} /></button>
        </div>
      )}
      {per.tipo === 'periodo' && (
        <div className="flex gap-1">
          <input className={`${campo} flex-1 min-w-0`} type="date" value={per.valor} onChange={e => onMudar({ ...per, valor: e.target.value })} />
          <input className={`${campo} flex-1 min-w-0`} type="date" value={per.valor2} onChange={e => onMudar({ ...per, valor2: e.target.value })} />
        </div>
      )}
    </div>
  );
}

// ── Importação do Pipefy (admin) ─────────────────────────────
function PainelImportacao({ onFechar, onMudou }) {
  const [pipes, setPipes] = useState([]);
  const [msg, setMsg] = useState('');
  const [trabalhando, setTrabalhando] = useState('');
  const carregar = useCallback(async () => {
    const { data } = await relatoriosService.importacao();
    setPipes(data.pipes);
  }, []);
  useEffect(() => { carregar().catch(() => {}); }, [carregar]);

  async function lerPipes() {
    setMsg(''); setTrabalhando('pipes');
    try { await relatoriosService.lerPipes(); await carregar(); }
    catch (e) { setMsg(e.response?.data?.erro || 'Não consegui ler os pipes do Pipefy.'); }
    finally { setTrabalhando(''); }
  }
  async function importar(p, recomecar = false) {
    setMsg(''); setTrabalhando(p.pipe_id);
    try {
      let concluido = false, primeira = true;
      while (!concluido) {
        const { data } = await relatoriosService.importarLote(p.pipe_id, recomecar && primeira);
        primeira = false; concluido = data.concluido;
        setPipes(ps => ps.map(x => (x.pipe_id === p.pipe_id ? { ...x, importados: data.importados, status: data.status } : x)));
      }
      await carregar(); onMudou();
    } catch (e) { setMsg(`${p.nome}: ${e.response?.data?.erro || e.message}`); await carregar().catch(() => {}); }
    finally { setTrabalhando(''); }
  }
  async function importarTudo() {
    for (const p of pipes.filter(x => x.status !== 'concluido')) { await importar(p); }
  }
  return (
    <Modal titulo="Importar histórico do Pipefy" onFechar={onFechar} largo>
      <p className="text-xs text-[var(--c-suave)]">Copia para o sistema todos os cards (inclusive os concluídos), campos e histórico de fases de cada pipe. Os cards não aparecem nos quadros, só nos relatórios. Pode fechar e continuar depois: a importação retoma de onde parou.</p>
      <div className="flex gap-2 flex-wrap">
        <button className={botao} onClick={lerPipes} disabled={!!trabalhando}>{trabalhando === 'pipes' ? <Spinner size={12} /> : <RefreshCw size={12} />} Ler pipes do Pipefy</button>
        <button className={botao} onClick={importarTudo} disabled={!!trabalhando || !pipes.length}><Download size={12} /> Importar tudo</button>
      </div>
      {msg && <p className="text-xs text-red-400">{msg}</p>}
      <ul className="space-y-1.5">
        {pipes.map(p => (
          <li key={p.pipe_id} className="flex items-center gap-2 rounded-lg border border-[var(--c-borda)] bg-[var(--c-fundo)] p-2 text-xs">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[var(--c-texto)] truncate">{p.nome}</p>
              <p className="text-[10px] text-[var(--c-suave)]">
                {p.importados} de {p.total_pipefy ?? '?'} cards · {p.status === 'concluido' ? 'concluído' : p.status === 'erro' ? `erro: ${p.erro || ''}` : p.status === 'importando' ? 'importando…' : 'pendente'}
              </p>
            </div>
            {trabalhando === p.pipe_id ? <Spinner size={14} /> : (
              <button className={botao} disabled={!!trabalhando} onClick={() => importar(p, p.status === 'concluido')}>
                {p.status === 'concluido' ? 'Reimportar' : p.importados ? 'Continuar' : 'Importar'}
              </button>
            )}
          </li>
        ))}
        {!pipes.length && <li className="text-xs text-[var(--c-suave)] text-center py-4">Clique em "Ler pipes do Pipefy" para listar os pipes.</li>}
      </ul>
    </Modal>
  );
}

// ── Seletor de colunas ───────────────────────────────────────
function Colunas({ pipe, colunas, onMudar, onFechar }) {
  const [busca, setBusca] = useState('');
  const grupos = useMemo(() => [
    ['Dados do card', FIXAS.map(f => f[0])],
    ['Campos', (pipe?.campos || []).map(c => `c:${c}`)],
    ['Tempo em cada fase', (pipe?.fases || []).map(f => `f:${f.nome}`)],
    ['Entrada em cada fase', (pipe?.fases || []).map(f => `fe:${f.nome}`)],
  ], [pipe]);
  const alternar = (k) => onMudar(colunas.includes(k) ? colunas.filter(x => x !== k) : [...colunas, k]);
  return (
    <Modal titulo="Colunas do relatório" onFechar={onFechar} largo>
      <input className={`${campo} w-full`} placeholder="Buscar coluna…" value={busca} onChange={e => setBusca(e.target.value)} />
      {grupos.map(([nome, chaves]) => {
        const vis = chaves.filter(k => rotuloDe(k).toLowerCase().includes(busca.toLowerCase()));
        if (!vis.length) return null;
        return (
          <div key={nome}>
            <p className="text-[11px] font-bold text-[var(--c-suave)] mb-1">{nome}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
              {vis.map(k => (
                <label key={k} className="flex items-center gap-2 text-xs text-[var(--c-texto)] py-0.5 cursor-pointer">
                  <input type="checkbox" checked={colunas.includes(k)} onChange={() => alternar(k)} /> <span className="truncate">{rotuloDe(k)}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </Modal>
  );
}

// ── Fórmulas ─────────────────────────────────────────────────
function Formulas({ colunas, formulas, onMudar, onFechar }) {
  const [chave, setChave] = useState(colunas[0] || '');
  const [fn, setFn] = useState('contagem');
  return (
    <Modal titulo="Fórmulas" onFechar={onFechar}>
      <p className="text-[11px] text-[var(--c-suave)]">Calculadas sobre todos os cards filtrados. Soma/média/mín./máx. valem para colunas numéricas (campos com número ou tempo em fase).</p>
      <ul className="space-y-1">
        {formulas.map((f, i) => (
          <li key={i} className="flex items-center gap-2 text-xs text-[var(--c-texto)]">
            <span className="flex-1">{FORMULAS.find(x => x[0] === f.fn)?.[1]} · {rotuloDe(f.chave)}</span>
            <button onClick={() => onMudar(formulas.filter((_, j) => j !== i))} className="text-[var(--c-suave)] hover:text-red-400"><Trash2 size={13} /></button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 flex-wrap">
        <select className={campo} value={fn} onChange={e => setFn(e.target.value)}>{FORMULAS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        <select className={`${campo} flex-1 min-w-0`} value={chave} onChange={e => setChave(e.target.value)}>
          {colunas.map(k => <option key={k} value={k}>{rotuloDe(k)}</option>)}
        </select>
        <button className={botao} disabled={!chave} onClick={() => onMudar([...formulas, { chave, fn }])}><Plus size={12} /> Adicionar</button>
      </div>
    </Modal>
  );
}

// ── Tela de um relatório ─────────────────────────────────────
function Relatorio({ id, pipes, onVoltar, onMudou }) {
  const [rel, setRel] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [aplicada, setAplicada] = useState(null); // config usada na última execução
  const [pagina, setPagina] = useState(1);
  const [res, setRes] = useState(null);
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false);
  const [modal, setModal] = useState('');
  const [nome, setNome] = useState('');
  const pipe = useMemo(() => pipes.find(p => p.pipe_id === rel?.pipe_id), [pipes, rel]);

  useEffect(() => {
    relatoriosService.ver(id).then(({ data }) => {
      const c = { colunas: [], filtros: [], ordem: null, formulas: [], ...data.config };
      if (!c.colunas.length) c.colunas = ['@id', '@titulo', '@fase', '@criado_em'];
      setRel(data); setNome(data.nome); setCfg(c); setAplicada(c);
    }).catch(e => setErro(e.response?.data?.erro || 'Não consegui abrir o relatório.'));
  }, [id]);

  useEffect(() => {
    if (!aplicada || !rel) return;
    let vivo = true;
    setRodando(true); setErro('');
    relatoriosService.executar({ ...aplicada, pipe_id: rel.pipe_id }, pagina)
      .then(({ data }) => { if (vivo) setRes(data); })
      .catch(e => { if (vivo) setErro(e.response?.data?.erro || 'Não consegui executar o relatório.'); })
      .finally(() => { if (vivo) setRodando(false); });
    return () => { vivo = false; };
  }, [aplicada, pagina, rel]);

  const mudar = (patch, aplicarJa = false) => {
    const novo = { ...cfg, ...patch };
    setCfg(novo); setSujo(true);
    if (aplicarJa) { setPagina(1); setAplicada(novo); }
  };
  const mudarFiltro = (i, patch) => mudar({ filtros: cfg.filtros.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const todasColunas = useMemo(() => [
    ...FIXAS.map(f => f[0]), ...(pipe?.campos || []).map(c => `c:${c}`),
    ...(pipe?.fases || []).map(f => `f:${f.nome}`), ...(pipe?.fases || []).map(f => `fe:${f.nome}`),
  ], [pipe]);

  async function salvar() {
    setSalvando(true);
    try {
      await relatoriosService.salvar(id, { nome, config: cfg });
      setSujo(false); onMudou();
    } catch (e) { setErro(e.response?.data?.erro || 'Não consegui salvar.'); }
    finally { setSalvando(false); }
  }
  async function exportar() {
    try {
      const { data } = await relatoriosService.executar({ ...aplicada, pipe_id: rel.pipe_id }, 1, true);
      const cab = data.colunas.map(rotuloDe).map(csvCel).join(';');
      const corpo = data.linhas.map(l => l.v.map((v, i) => csvCel(fmtCelula(v, data.tipos[i]))).join(';')).join('\n');
      const blob = new Blob([`﻿${cab}\n${corpo}`], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `${nome || 'relatorio'}.csv`; a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { setErro(e.response?.data?.erro || 'Não consegui exportar.'); }
  }
  function ordenar(chave) {
    const dir = aplicada?.ordem?.chave === chave && aplicada.ordem.dir === 'desc' ? 'asc' : 'desc';
    mudar({ ordem: { chave, dir } }, true);
  }

  if (!cfg) return <div className="flex justify-center py-20">{erro ? <p className="text-sm text-red-400">{erro}</p> : <Spinner />}</div>;
  const totalPag = res ? Math.max(1, Math.ceil(res.total / res.tamanho)) : 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={onVoltar} className="text-xs text-[var(--c-suave)] hover:text-[var(--c-texto)] flex items-center gap-1"><ChevronLeft size={14} /> Relatórios</button>
        <input className={`${campo} text-sm font-bold flex-1 min-w-[12rem]`} value={nome} onChange={e => { setNome(e.target.value); setSujo(true); }} />
        <span className="text-[11px] text-[var(--c-suave)]">Pipe: {pipe?.nome || rel.pipe_id}</span>
        <button className={botao} onClick={() => setModal('formulas')}><Sigma size={13} /> Fórmulas</button>
        <button className={botao} onClick={() => setModal('colunas')}><Columns3 size={13} /> Colunas</button>
        <button className={botao} onClick={exportar}><Download size={13} /> Exportar CSV</button>
        <button className={`${botao} !bg-[var(--c-destaque)] !text-white !border-transparent`} disabled={!sujo || salvando} onClick={salvar}>
          {salvando ? <Spinner size={12} /> : <Save size={13} />} Salvar
        </button>
      </div>

      <div className="grid lg:grid-cols-[18rem_1fr] gap-3 items-start">
        {/* Filtros */}
        <aside className="rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-3 space-y-2">
          <p className="text-xs font-bold text-[var(--c-texto)]">Filtros</p>
          <FiltroPeriodo periodo={cfg.periodo} colunasData={todasColunas.filter(k => tipoDe(k) === 'data')}
            onMudar={(per) => { const novo = { ...cfg, periodo: per }; setCfg(novo); setSujo(true); setPagina(1); setAplicada(novo); }} />
          {cfg.filtros.map((f, i) => {
            const tipo = tipoDe(f.chave);
            const emHoras = tipo === 'numero';
            const mostra = (v) => (emHoras && v !== '' ? Number(v) / 3600 : v);
            const grava = (v) => (emHoras && v !== '' ? Number(String(v).replace(',', '.')) * 3600 : v);
            return (
              <div key={i} className="space-y-1.5">
                {i > 0 && (
                  <div className="flex gap-1">
                    {['e', 'ou'].map(j => (
                      <button key={j} onClick={() => mudarFiltro(i, { junta: j })}
                        className={`text-[11px] font-bold rounded px-2.5 py-0.5 ${f.junta === j ? 'bg-[var(--c-destaque)] text-white' : 'bg-[var(--c-borda)] text-[var(--c-suave)]'}`}>{j}</button>
                    ))}
                  </div>
                )}
                <div className="rounded-lg border border-[var(--c-borda)] bg-[var(--c-fundo)] p-2 space-y-1.5">
                  <div className="flex gap-1">
                    <select className={`${campo} flex-1 min-w-0`} value={f.chave}
                            onChange={e => mudarFiltro(i, { chave: e.target.value, op: OPS[tipoDe(e.target.value)][0][0], valor: '', valor2: '' })}>
                      {todasColunas.map(k => <option key={k} value={k}>{rotuloDe(k)}</option>)}
                    </select>
                    <button onClick={() => mudar({ filtros: cfg.filtros.filter((_, j) => j !== i) })} className="text-[var(--c-suave)] hover:text-red-400"><Trash2 size={13} /></button>
                  </div>
                  <select className={`${campo} w-full`} value={f.op} onChange={e => mudarFiltro(i, { op: e.target.value })}>
                    {OPS[tipo].map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                  </select>
                  {!SEM_VALOR.includes(f.op) && (
                    tipo === 'data'
                      ? (f.op === 'ultimos_dias'
                          ? <input className={`${campo} w-full`} type="number" min="0" placeholder="Dias" value={f.valor} onChange={e => mudarFiltro(i, { valor: e.target.value })} />
                          : <div className="flex gap-1">
                              <input className={`${campo} flex-1 min-w-0`} type="date" value={f.valor} onChange={e => mudarFiltro(i, { valor: e.target.value })} />
                              {f.op === 'periodo' && <input className={`${campo} flex-1 min-w-0`} type="date" value={f.valor2} onChange={e => mudarFiltro(i, { valor2: e.target.value })} />}
                            </div>)
                      : <input className={`${campo} w-full`} placeholder="Valor" value={mostra(f.valor)} onChange={e => mudarFiltro(i, { valor: grava(e.target.value) })} />
                  )}
                </div>
              </div>
            );
          })}
          <button className={`${botao} w-full justify-center`} onClick={() => mudar({ filtros: [...cfg.filtros, { chave: '@fase', op: 'contem', valor: '', valor2: '', junta: 'e' }] })}>
            <Plus size={12} /> Adicionar filtro
          </button>
          <button className={`${botao} w-full justify-center !bg-[var(--c-destaque)] !text-white !border-transparent`} onClick={() => { setPagina(1); setAplicada(cfg); }}>
            <Search size={12} /> Aplicar filtros
          </button>
        </aside>

        {/* Resultado */}
        <section className="rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-3 space-y-2 min-w-0">
          <div className="flex items-center gap-2 text-xs text-[var(--c-suave)]">
            {rodando && <Spinner size={12} />}
            <span>{res ? `${res.total.toLocaleString('pt-BR')} resultado(s)` : 'Carregando…'}</span>
          </div>
          {res?.formulas?.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {res.formulas.map((f, i) => (
                <div key={i} className="rounded-lg border border-[var(--c-borda)] bg-[var(--c-fundo)] px-2.5 py-1.5 text-xs">
                  <span className="text-[var(--c-suave)]">{FORMULAS.find(x => x[0] === f.fn)?.[1]} · {rotuloDe(f.chave)}: </span>
                  <b className="text-[var(--c-texto)]">{tipoDe(f.chave) === 'numero' && f.fn !== 'contagem' ? fmtDur(f.valor) || '—' : fmtNum(f.valor)}</b>
                </div>
              ))}
            </div>
          )}
          {erro && <p className="text-xs text-red-400">{erro}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--c-borda)] text-[var(--c-suave)]">
                  {res?.colunas.map(c => (
                    <th key={c} className="text-left font-semibold py-2 px-2 whitespace-nowrap">
                      <button className="flex items-center gap-1 hover:text-[var(--c-texto)]" onClick={() => ordenar(c)}>
                        {rotuloDe(c)}
                        {aplicada?.ordem?.chave === c && (aplicada.ordem.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {res?.linhas.map(l => (
                  <tr key={l.id} className="border-b border-[var(--c-borda)]/60">
                    {l.v.map((v, i) => (
                      <td key={i} className="py-1.5 px-2 text-[var(--c-texto)] max-w-[22rem] truncate" title={fmtCelula(v, res.tipos[i])}>
                        {res.colunas[i] === '@titulo' && l.url
                          ? <a href={l.url} target="_blank" rel="noreferrer" className="text-[var(--c-destaque-claro)] hover:underline inline-flex items-center gap-1">{v}<ExternalLink size={10} /></a>
                          : fmtCelula(v, res.tipos[i])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {res && !res.linhas.length && <p className="text-center text-xs text-[var(--c-suave)] py-8">Nenhum card com esses filtros.</p>}
          </div>
          {res && totalPag > 1 && (
            <div className="flex items-center justify-center gap-3 text-xs text-[var(--c-texto)]">
              <button className={botao} disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}><ChevronLeft size={12} /></button>
              Página {pagina} de {totalPag}
              <button className={botao} disabled={pagina >= totalPag} onClick={() => setPagina(p => p + 1)}><ChevronRight size={12} /></button>
            </div>
          )}
        </section>
      </div>

      {modal === 'colunas' && <Colunas pipe={pipe} colunas={cfg.colunas} onMudar={(c) => mudar({ colunas: c }, true)} onFechar={() => setModal('')} />}
      {modal === 'formulas' && <Formulas colunas={cfg.colunas} formulas={cfg.formulas} onMudar={(f) => mudar({ formulas: f }, true)} onFechar={() => setModal('')} />}
    </div>
  );
}

// ── Lista de relatórios ──────────────────────────────────────
export default function Relatorios() {
  const { usuario } = useAuth();
  const admin = usuario?.perfil === 'admin';
  const [lista, setLista] = useState([]);
  const [pipes, setPipes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(null);
  const [novo, setNovo] = useState(null);       // { nome, pipe_id }
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try {
      const [l, p] = await Promise.all([relatoriosService.lista(), relatoriosService.pipes()]);
      setLista(l.data.relatorios); setPipes(p.data.pipes);
    } catch (e) { setErro(e.response?.data?.erro || 'Erro ao carregar os relatórios.'); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function criar() {
    try {
      const { data } = await relatoriosService.criar({ nome: novo.nome, pipe_id: novo.pipe_id, config: { colunas: ['@id', '@titulo', '@fase', '@criado_em'] } });
      setNovo(null); await carregar(); setAberto(data.id);
    } catch (e) { setErro(e.response?.data?.erro || 'Não consegui criar o relatório.'); }
  }
  async function excluir(r) {
    if (!window.confirm(`Excluir o relatório "${r.nome}"? Os dados importados do Pipefy não são apagados.`)) return;
    try { await relatoriosService.excluir(r.id); await carregar(); }
    catch (e) { setErro(e.response?.data?.erro || 'Não consegui excluir.'); }
  }

  if (aberto) return <Relatorio id={aberto} pipes={pipes} onVoltar={() => { setAberto(null); carregar(); }} onMudou={carregar} />;

  const vis = lista.filter(r => r.nome.toLowerCase().includes(busca.toLowerCase()));
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-[var(--c-texto)]">Relatórios</h1>
          <p className="text-xs text-[var(--c-suave)]">Relatórios rápidos e exportáveis com o histórico dos cards do Pipefy, já dentro do sistema.</p>
        </div>
        {admin && <button className={botao} onClick={() => setImportando(true)}><Database size={13} /> Importar do Pipefy</button>}
      </div>
      <div className="relative max-w-xs">
        <Search size={13} className="absolute left-2.5 top-2.5 text-[var(--c-suave)]" />
        <input className={`${campo} w-full pl-8`} placeholder="Buscar relatórios" value={busca} onChange={e => setBusca(e.target.value)} />
      </div>
      {erro && <p className="text-xs text-red-400">{erro}</p>}
      {carregando ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <>
          {!pipes.length && (
            <div className="rounded-xl border border-dashed border-[var(--c-borda)] p-4 text-xs text-[var(--c-suave)]">
              {admin ? 'Ainda não há dados do Pipefy no sistema. Clique em "Importar do Pipefy" para trazer todo o histórico.' : 'Ainda não há dados importados. Peça a um administrador para importar o histórico do Pipefy.'}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <button onClick={() => setNovo({ nome: '', pipe_id: pipes[0]?.pipe_id || '' })} disabled={!pipes.length}
                    className="rounded-xl border-2 border-dashed border-[var(--c-borda)] min-h-[8rem] flex flex-col items-center justify-center gap-2 text-xs font-semibold text-[var(--c-texto)] hover:border-[var(--c-destaque)] disabled:opacity-40">
              <span className="w-10 h-10 rounded-xl bg-[var(--c-destaque)]/15 text-[var(--c-destaque-claro)] flex items-center justify-center"><Plus size={20} /></span>
              Criar novo relatório
            </button>
            {vis.map(r => (
              <div key={r.id} className="relative rounded-xl min-h-[8rem] p-3 border border-[var(--c-borda)] bg-[var(--c-superficie)] hover:border-[var(--c-destaque)] cursor-pointer group"
                   style={{ borderTop: `4px solid ${r.cor || '#64748b'}` }} onClick={() => setAberto(r.id)}>
                <p className="text-2xl font-bold" style={{ color: r.cor || '#64748b' }}>{r.total == null ? '—' : r.total.toLocaleString('pt-BR')}</p>
                <p className="text-sm font-semibold text-[var(--c-texto)] mt-1">{r.nome}</p>
                <p className="text-[10px] text-[var(--c-suave)] mt-1">{r.pipe_nome}</p>
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100">
                  <button title="Editar" className="p-1 text-[var(--c-suave)] hover:text-[var(--c-texto)]" onClick={e => { e.stopPropagation(); setAberto(r.id); }}><Pencil size={13} /></button>
                  <button title="Excluir" className="p-1 text-[var(--c-suave)] hover:text-red-400" onClick={e => { e.stopPropagation(); excluir(r); }}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {novo && (
        <Modal titulo="Novo relatório" onFechar={() => setNovo(null)}>
          <input className={`${campo} w-full`} placeholder="Nome do relatório" value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} autoFocus />
          <select className={`${campo} w-full`} value={novo.pipe_id} onChange={e => setNovo({ ...novo, pipe_id: e.target.value })}>
            {pipes.map(p => <option key={p.pipe_id} value={p.pipe_id}>{p.nome} ({p.importados} cards)</option>)}
          </select>
          <button className={`${botao} !bg-[var(--c-destaque)] !text-white !border-transparent`} disabled={!novo.nome.trim() || !novo.pipe_id} onClick={criar}>Criar e abrir</button>
        </Modal>
      )}
      {importando && <PainelImportacao onFechar={() => setImportando(false)} onMudou={carregar} />}
    </div>
  );
}
