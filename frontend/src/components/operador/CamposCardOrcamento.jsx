// ============================================================
// components/operador/CamposCardOrcamento.jsx — Todos os campos do card
// ============================================================
// Mostra os campos preenchidos do card (os mesmos do Pipefy), agrupados
// pela fase em que são preenchidos. O admin pode editar: a edição é gravada
// também no card do Pipefy. Campos que o Pipefy não aceita por aqui (conexões
// como Cliente/Peça, anexos, etiquetas) ficam só no B-Requisições.
// Os demais só visualizam.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Pencil, Save, Paperclip, RotateCcw, Search, Plus, Check, ChevronDown } from 'lucide-react';
import { pedidosOrcamentoService, basesService } from '../../services/api';
import { Spinner } from '../ui';
import { useAuth } from '../../context/AuthContext';
import { FotosCampo, useServicoQuadro } from './FotosOrcamento';
import { CONFIG_ORCAMENTO, COLUNAS_ORCAMENTO } from '../../utils/fasesOrcamento';
import { campoDaConfig } from './ConfigOrcamento';

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
export const SO_LEITURA = ['attachment', 'id'];

// Valores aceitos pela condição: texto (um) ou lista (vários, ex.: Aprovado / Aprovado parcialmente)
export const valoresCondicao = (v) => (Array.isArray(v) ? v : [v]).map(x => String(x ?? '').trim()).filter(Boolean);
// Condições para qualquer campo (mesmo sem opções): "(preenchido)" = tem algum valor; "(vazio)" = sem valor
export const COND_PREENCHIDO = '(preenchido)';
export const COND_VAZIO = '(vazio)';
export const rotuloCondicao = (v) => (v === COND_PREENCHIDO ? 'preenchido' : v === COND_VAZIO ? 'vazio' : v);
const bate = (valores, cond) => {
  const ok = valoresCondicao(cond);
  const vs = (valores || []).map(v => String(v).trim()).filter(Boolean);
  if (ok.includes(COND_PREENCHIDO) && vs.length) return true;
  if (ok.includes(COND_VAZIO) && !vs.length) return true;
  return vs.some(v => ok.includes(v));
};

// Obrigatório agora? (campo.quando = obrigatório só quando outro campo tiver o valor)
/** Campo aparece agora? (Configurar → "Mostrar este campo: só quando …"), seguindo a cadeia de campos. */
export function visivelAgora(campo, valorDe) {
  let m = campo?.mostrar, n = 0;
  while (m && n++ < 10) {
    if (!bate(valorLista(valorDe(m.id)), m.valor)) return false;
    m = m.pai;
  }
  return true;
}

/**
 * Regra da coluna atual esconde o botão de mover para "destino"? (Configurar → "Regras para mover")
 * campos = campos da configuração (id, rotulo, pipefy_campo); idDe = id do valor do campo no card.
 * Devolve o motivo (texto) ou null.
 */
export function regraBloqueiaMover(col, destino, campos, valorDe, idDe = (c) => c.pipefy_campo || `bx_${c.id}`) {
  for (const r of (Array.isArray(col?.regras) ? col.regras : [])) {
    if (r?.destino !== destino) continue;
    const c = (campos || []).find(x => Number(x.id) === Number(r.campo));
    if (!c) continue;
    const atuais = valorLista(valorDe(idDe(c)));
    const ok = bate(atuais, r.valores);
    // modo "mostrar" (padrão): só aparece quando bate; "esconder" (regras antigas): some quando bate
    if (r.modo === 'esconder' ? ok : !ok) return r.modo === 'esconder' ? `"${c.rotulo}" está "${atuais.join(', ')}"` : `só quando "${c.rotulo}" for "${valoresCondicao(r.valores).map(rotuloCondicao).join('" ou "')}"`;
  }
  return null;
}

export function obrigatorioAgora(campo, valorDe) {
  if (!campo?.obrigatorio) return false;
  if (!visivelAgora(campo, valorDe)) return false;
  if (!campo.quando) return true;
  return bate(valorLista(valorDe(campo.quando.id)), campo.quando.valor);
}

export function Valor({ campo, valor }) {
  const lista = valorLista(valor);
  if (!lista.length) return <span className="text-[var(--c-suave)]">—</span>;
  // Registro (descrição e valor): mostra o cartão, mesmo quando o campo não está marcado como "registro"
  { const r = lerRegistro(valor); if (r) return <CartaoRegistro reg={r} />; }
  if (campo?.tipo === 'attachment') {
    return (
      <div className="flex flex-col gap-0.5">
        {lista.map((u, i) => /^https?:\/\//.test(u)
          ? <a key={i} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--c-destaque)] hover:underline break-all"><Paperclip size={11} />{nomeArquivo(u)}</a>
          : <span key={i}>{u}</span>)}
      </div>
    );
  }
  if (campo?.cores) return <Etiquetas lista={lista} cores={campo.cores} />;
  return <span className="whitespace-pre-wrap break-words">{lista.join(', ')}</span>;
}

// Etiquetas marcadas no card, para mostrar com o card fechado (campos "Etiquetas" do Configurar)
export function EtiquetasDoCard({ campos, valorDe }) {
  const marcadas = [];
  for (const c of campos || []) {
    const vals = valorLista(valorDe(c.pipefy_campo || `bx_${c.id}`));
    // Etiqueta configurada numa opção ("Concluído sem peças" → "Sem pedido de venda")
    if (c.tipo !== 'etiquetas') {
      if (!c.marcas) continue;
      for (const o of vals) { const m = c.marcas[o]; if (m?.texto) marcadas.push({ k: `${c.id}-m-${o}`, o: m.texto, cor: m.cor || '#f59e0b' }); }
      continue;
    }
    for (const o of vals) marcadas.push({ k: `${c.id}-${o}`, o, cor: c.cores?.[o] || '#64748b' });
  }
  if (!marcadas.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {marcadas.map(m => <span key={m.k} className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white" style={{ background: m.cor }}>{m.o}</span>)}
    </div>
  );
}

// Etiquetas com a cor configurada em Configurar
export function Etiquetas({ lista, cores }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {lista.map(o => <span key={o} className="px-2 py-0.5 rounded-full text-[11px] font-semibold text-white" style={{ background: cores?.[o] || '#64748b' }}>{o}</span>)}
    </div>
  );
}

// ── Registro (descrição + valor) de uma base, ex.: "BX - Mão de obra" em "Peças em Geral" ──
// No card fica gravado { id, base_id, base, descricao, valor, criado_em } (valor fixo da base no momento da escolha)
export function lerRegistro(v) {
  const s = String(v ?? '').trim();
  if (!s.startsWith('{')) return null;
  try { const o = JSON.parse(s); return o && o.descricao ? o : null; } catch { return null; }
}
export const fmtMoeda = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDataLonga = (d) => { try { return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }); } catch { return ''; } };
const semAcentoReg = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// Dados do registro que mais ajudam a reconhecê-lo: CPF/CNPJ, telefone, estado… depois os demais preenchidos
export function extrasPrincipais(extras, max = 3) {
  const v = (extras || []).filter(x => String(x?.valor ?? '').trim() !== '');
  const out = [];
  for (const re of [/cpf|cnpj/, /numero.*contato|telefone|celular|fone/, /estado|^uf\b/]) {
    const x = v.find(e => re.test(semAcentoReg(e.nome)) && !out.includes(e));
    if (x) out.push(x);
  }
  for (const x of v) { if (out.length >= max) break; if (!out.includes(x)) out.push(x); }
  return out.slice(0, max);
}
export function CartaoRegistro({ reg, onLimpar, onTrocar }) {
  const [todos, setTodos] = useState(false);
  const extras = reg.extras || [];
  const principais = extrasPrincipais(extras, 6);
  const mostrar = todos ? extras : principais;
  return (
    <div className="rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-3 space-y-2">
      <div className="flex items-start gap-2">
        <p className="flex-1 text-sm font-semibold text-[var(--c-texto)] break-words">{reg.descricao}</p>
        {onTrocar && <button type="button" onClick={onTrocar} className="text-[11px] font-semibold text-[var(--c-destaque)] hover:underline">Trocar</button>}
        {onLimpar && <button type="button" onClick={onLimpar} title="Tirar o registro" className="text-[var(--c-suave)] hover:text-red-400"><X size={13} /></button>}
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <div className="min-w-0"><dt className="text-[10px] text-[var(--c-suave)]">Base</dt>
          <dd><span className="inline-block max-w-full truncate rounded px-1.5 py-0.5 text-[11px] font-semibold text-[var(--c-destaque)] bg-[var(--c-destaque)]/10">{reg.base || '—'}</span></dd></div>
        {!reg.sem_valor && <div><dt className="text-[10px] text-[var(--c-suave)]">Valor</dt><dd className="font-semibold text-[var(--c-texto)]">{fmtMoeda(reg.valor)}</dd></div>}
        {mostrar.map((x, i) => (
          <div key={i} className="min-w-0"><dt className="text-[10px] text-[var(--c-suave)]">{x.nome}</dt>
            <dd className="text-[var(--c-texto)] break-words">{x.tipo === 'moeda' ? fmtMoeda(String(x.valor).replace(',', '.')) : x.tipo === 'data' ? String(x.valor).slice(0, 10).split('-').reverse().join('/') : x.valor}</dd></div>
        ))}
        {reg.criado_em && !reg.sem_valor && <div className="col-span-2"><dt className="text-[10px] text-[var(--c-suave)]">Criado em</dt><dd className="text-[var(--c-texto)]">{fmtDataLonga(reg.criado_em)}</dd></div>}
      </dl>
      {extras.length > principais.length && (
        <button type="button" onClick={() => setTodos(t => !t)} className="text-[11px] font-semibold text-[var(--c-destaque)] hover:underline">
          {todos ? 'Ver menos' : `Ver todos os dados (${extras.length})`}
        </button>
      )}
    </div>
  );
}
const registrosCache = new Map();
function carregarRegistros(baseId, forcar = false) {
  if (!registrosCache.has(baseId) || forcar) {
    registrosCache.set(baseId, basesService.registros(baseId).then(r => r.data.registros)
      .catch(e => { registrosCache.delete(baseId); throw e; }));
  }
  return registrosCache.get(baseId);
}
// semValor: campo "Lista do B-Requisições" com lista salva (base:<id>) — grava só a descrição
function SeletorRegistro({ campo, valor, onChange, semValor = false }) {
  const baseId = Number(String(campo.lista || '').replace(/^base:/, '')) || 0;
  const textoAtual = semValor ? (valorLista(valor)[0] || '') : '';
  const atual = semValor ? (textoAtual ? { id: null, descricao: textoAtual } : null) : lerRegistro(valor);
  const caixa = useRef(null);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState(null);
  const [novo, setNovo] = useState(null); // null = fechado; { descricao, valor }
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  useEffect(() => {
    if (!aberto || lista || !baseId) return;
    carregarRegistros(baseId).then(setLista).catch(e => setErro(e.response?.data?.erro || 'Não consegui carregar os registros.'));
  }, [aberto, lista, baseId]);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e) => { if (caixa.current && !caixa.current.contains(e.target)) { setAberto(false); setNovo(null); } };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);
  if (!baseId) return <p className="text-[11px] text-amber-400">Escolha a base deste campo em Configurar.</p>;
  const filtrados = (lista || []).filter(r => normBusca(`${r.descricao} ${(r.extras || []).map(x => x.valor).join(' ')}`).includes(normBusca(busca))).slice(0, 300);
  const escolher = (r) => {
    onChange(!r ? '' : semValor ? r.descricao : JSON.stringify({ id: r.id, base_id: r.base_id, base: r.base, descricao: r.descricao, valor: r.valor, criado_em: r.criado_em, ...(r.extras?.length ? { extras: r.extras } : {}) }));
    setAberto(false); setBusca(''); setNovo(null); setErro('');
  };
  async function criar() {
    const descricao = String(novo?.descricao || '').replace(/\s+/g, ' ').trim();
    if (descricao.length < 2) { setErro('Digite a descrição.'); return; }
    if (!semValor && String(novo?.valor ?? '').trim() === '') { setErro('Digite o valor.'); return; }
    setSalvando(true); setErro('');
    try {
      const { data } = await basesService.criarRegistro(baseId, semValor ? { descricao } : { descricao, valor: novo.valor });
      setLista(await carregarRegistros(baseId, true));
      escolher(data.registro);
    } catch (e) {
      if (e.response?.status === 409 && e.response?.data?.registro) { escolher(e.response.data.registro); return; }
      setErro(e.response?.data?.erro || 'Erro ao criar o registro.');
    } finally { setSalvando(false); }
  }
  const inp = 'w-full py-1.5 rounded-lg text-xs bg-[var(--c-fundo)] border border-[var(--c-borda)] text-[var(--c-texto)] focus:outline-none focus:border-[var(--c-destaque)]';
  return (
    <div ref={caixa} className="relative space-y-1.5">
      {atual && !semValor
        ? <CartaoRegistro reg={atual} onTrocar={() => setAberto(a => !a)} onLimpar={() => escolher(null)} />
        : (
          <button type="button" onClick={() => setAberto(a => !a)}
            className="w-full flex items-center gap-2 text-left bg-[var(--c-fundo)] border border-[var(--c-borda)] rounded-lg px-2 py-1.5 text-xs text-[var(--c-texto)] focus:outline-none focus:border-[var(--c-destaque)]">
            <span className={`flex-1 truncate ${atual ? 'text-[var(--c-texto)]' : 'text-[var(--c-suave)]'}`}>{atual ? atual.descricao : 'Selecione um registro…'}</span>
            <ChevronDown size={13} className="shrink-0 text-[var(--c-suave)]" />
          </button>
        )}
      {aberto && (
        <div className="absolute z-30 left-0 right-0 bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-xl shadow-xl p-2 space-y-2">
          {novo === null ? (
            <button type="button" onClick={() => { setNovo({ descricao: busca, valor: '' }); setErro(''); }}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold text-[var(--c-destaque)] hover:bg-[var(--c-destaque)]/10">
              <Plus size={12} /> Criar registro
            </button>
          ) : (
            <div className="rounded-lg border border-[var(--c-destaque)]/40 bg-[var(--c-destaque)]/5 p-2 space-y-1.5">
              <p className="text-[11px] font-semibold text-[var(--c-texto)]">Novo registro</p>
              <input autoFocus value={novo.descricao} onChange={e => setNovo(n => ({ ...n, descricao: e.target.value }))} placeholder="Descrição" maxLength={160} className={`${inp} px-2`} />
              {!semValor && <input value={novo.valor} onChange={e => setNovo(n => ({ ...n, valor: e.target.value }))} placeholder="Valor (R$)" inputMode="decimal"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); criar(); } if (e.key === 'Escape') setNovo(null); }} className={`${inp} px-2`} />}
              <div className="flex justify-end gap-1.5">
                <button type="button" onClick={() => setNovo(null)} className="px-2 py-1 rounded-lg text-[11px] text-[var(--c-suave)] hover:text-[var(--c-texto)]">Cancelar</button>
                <button type="button" onClick={criar} disabled={salvando}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--c-destaque)] text-white disabled:opacity-40">
                  {salvando ? <Spinner size={11} /> : <Check size={11} />} Salvar registro
                </button>
              </div>
            </div>
          )}
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--c-suave)]" />
            <input autoFocus={novo === null} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (filtrados.length === 1) escolher(filtrados[0]); } if (e.key === 'Escape') setAberto(false); }}
              className={`${inp} pl-7 pr-7`} />
            {busca && <button type="button" onClick={() => setBusca('')} title="Limpar" className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={12} /></button>}
          </div>
          {erro && <p className="text-[11px] text-red-400">{erro}</p>}
          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {!lista && !erro && <div className="flex justify-center py-3"><Spinner size={14} /></div>}
            {semValor && atual && <button type="button" onClick={() => escolher(null)} className="w-full text-left px-2 py-1 rounded-lg text-[11px] text-[var(--c-suave)] hover:bg-[var(--c-borda)]/40">Limpar seleção</button>}
            {filtrados.map(r => (
              <button key={r.id} type="button" onClick={() => escolher(r)}
                className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg text-xs hover:bg-[var(--c-borda)]/40 ${(semValor ? r.descricao === atual?.descricao : r.id === atual?.id) ? 'text-[var(--c-destaque)] font-semibold' : 'text-[var(--c-texto)]'}`}>
                {(semValor ? r.descricao === atual?.descricao : r.id === atual?.id) && <Check size={12} />}
                <span className="flex-1 min-w-0 truncate">{r.descricao}</span>
                {!semValor && <span className="shrink-0 text-[var(--c-suave)]">{fmtMoeda(r.valor)}</span>}
              </button>
            ))}
            {lista && !filtrados.length && <p className="px-2 py-2 text-[11px] text-[var(--c-suave)]">{lista.length ? 'Nada encontrado. Use “Criar registro”.' : 'Base vazia. Use “Criar registro”.'}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Formulário "Criar registro" (cadastro completo, igual ao do Pipefy) ──
const UFS = ['AC - Acre', 'AL - Alagoas', 'AP - Amapá', 'AM - Amazonas', 'BA - Bahia', 'CE - Ceará', 'DF - Distrito Federal', 'ES - Espírito Santo', 'GO - Goiás', 'MA - Maranhão', 'MT - Mato Grosso', 'MS - Mato Grosso do Sul', 'MG - Minas Gerais', 'PA - Pará', 'PB - Paraíba', 'PR - Paraná', 'PE - Pernambuco', 'PI - Piauí', 'RJ - Rio de Janeiro', 'RN - Rio Grande do Norte', 'RS - Rio Grande do Sul', 'RO - Rondônia', 'RR - Roraima', 'SC - Santa Catarina', 'SP - São Paulo', 'SE - Sergipe', 'TO - Tocantins'];
const OPCOES_PADRAO = [[/tipo de cliente/, ['Consumidor Final', 'Lojista/Revenda', 'Posto Autorizado']], [/^pessoa/, ['Fisica', 'Juridica']], [/^estado|^uf\b/, UFS]];
const OCULTOS = /^(id registro|titulo|status|criador|finalizado|criado em|atualizado em|expirado|vencido)/;
const OBRIGATORIOS = /contato com|^e-?mail$|cpf|cnpj|^estado|numero.*contato|tipo de cliente|^pessoa/;
const soDigitos = (v) => String(v || '').replace(/\D/g, '');
function mascaraTelefone(v) {
  const d = soDigitos(v).replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function FormNovoRegistro({ base, comValor, colunas, inicial, salvando, erro, onFechar, onSalvar }) {
  const { usuario } = useAuth();
  const [descricao, setDescricao] = useState(inicial?.descricao || '');
  const [valor, setValor] = useState('');
  const [dados, setDados] = useState({});
  const [aviso, setAviso] = useState('');
  const hoje = new Date();
  const p2 = n => String(n).padStart(2, '0');
  const iso = `${hoje.getFullYear()}-${p2(hoje.getMonth() + 1)}-${p2(hoje.getDate())}`;
  const dataHora = `${p2(hoje.getDate())}/${p2(hoje.getMonth() + 1)}/${hoje.getFullYear()} ${p2(hoje.getHours())}:${p2(hoje.getMinutes())}`;
  const nome = (c) => normBusca(c.nome).trim();
  const visiveis = colunas.filter(c => !OCULTOS.test(nome(c)) && !/^data de cadastro/.test(nome(c)));
  const opcoesDe = (c) => {
    if (c.tipo === 'opcoes' && c.opcoes?.length) return c.opcoes;
    const f = OPCOES_PADRAO.find(([re]) => re.test(nome(c)));
    return f ? f[1] : null;
  };
  const obrigatoria = (c) => OBRIGATORIOS.test(nome(c)) && !/cobranc/.test(nome(c));
  const set = (id, v) => setDados(d => ({ ...d, [id]: v }));
  function salvar() {
    if (descricao.trim().length < 2) { setAviso(`Preencha ${colunas.length ? 'o nome' : 'a descrição'}.`); return; }
    if (comValor && String(valor).trim() === '') { setAviso('Preencha o valor.'); return; }
    for (const c of visiveis) {
      if (obrigatoria(c) && !String(dados[c.id] || '').trim()) { setAviso(`Preencha "${c.nome}".`); return; }
    }
    const out = { ...dados };
    for (const c of colunas) {
      const n = nome(c);
      if (/^data de cadastro/.test(n)) out[c.id] = iso;
      else if (/^titulo/.test(n)) out[c.id] = descricao.trim();
      else if (/^status/.test(n)) out[c.id] = 'Ativo';
      else if (/^criador/.test(n)) out[c.id] = usuario?.nome || '';
      else if (/^criado em/.test(n)) out[c.id] = dataHora;
      else if (/^vencido/.test(n)) out[c.id] = 'Não';
      else if (/numero.*contato|telefone|celular/.test(n) && out[c.id]) out[c.id] = `+55 ${mascaraTelefone(out[c.id])}`.replace(/^\+55 \((\d\d)\) /, '+55 $1 ');
    }
    setAviso('');
    onSalvar({ descricao: descricao.trim(), valor, dados: out });
  }
  const inp = 'w-full px-3 py-2.5 rounded-lg text-sm bg-[var(--c-fundo)] border border-[var(--c-borda)] text-[var(--c-texto)] placeholder:text-[var(--c-suave)] focus:outline-none focus:border-[var(--c-destaque)]';
  const rot = (t, obr) => <p className="text-sm font-semibold text-[var(--c-texto)] mb-1.5">{obr && <span className="text-red-400">* </span>}{t}</p>;
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-3" onClick={onFechar}>
      <div className="w-full max-w-md max-h-[94dvh] flex flex-col bg-[var(--c-superficie)] border-4 border-[var(--c-destaque)]/20 rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <p className="text-xl font-bold text-[var(--c-texto)]">{base?.nome || 'Novo registro'}</p>
          <button type="button" onClick={onFechar} className="p-1 text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-4">
          {colunas.some(c => /^data de cadastro/.test(nome(c))) && (
            <div><p className="text-xs font-semibold text-[var(--c-suave)]">Data de Cadastro</p><p className="text-sm text-[var(--c-texto)]">{iso.split('-').reverse().join('/')}</p></div>
          )}
          <div>{rot(colunas.length ? 'Nome / Razão Social' : 'Descrição', true)}
            <input autoFocus value={descricao} onChange={e => setDescricao(e.target.value)} maxLength={160} placeholder="Digite aqui ..." className={inp} /></div>
          {comValor && <div>{rot('Valor (R$)', true)}<input value={valor} onChange={e => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" className={inp} /></div>}
          {visiveis.map(c => {
            const n = nome(c), ops = opcoesDe(c), v = dados[c.id] || '', obr = obrigatoria(c);
            if (ops && ops.length <= 4) {
              return (
                <div key={c.id}>{rot(c.nome, obr)}
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {ops.map(o => (
                      <label key={o} className="flex items-center gap-2 text-sm text-[var(--c-texto)] cursor-pointer">
                        <input type="checkbox" checked={v === o} onChange={() => set(c.id, v === o ? '' : o)} className="w-4 h-4" /> {o}
                      </label>
                    ))}
                  </div>
                </div>
              );
            }
            if (ops) {
              return (
                <div key={c.id}>{rot(c.nome, obr)}
                  <select value={v} onChange={e => set(c.id, e.target.value)} className={inp}>
                    <option value="">Escolha uma opção</option>
                    {ops.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              );
            }
            if (/numero.*contato|telefone|celular/.test(n)) {
              return (
                <div key={c.id}>{rot(c.nome, obr)}
                  <div className="flex gap-2">
                    <span className="flex items-center justify-center w-16 rounded-lg bg-[var(--c-fundo)] border border-[var(--c-borda)] text-lg" title="Brasil (+55)">🇧🇷</span>
                    <input value={v} onChange={e => set(c.id, mascaraTelefone(e.target.value))} inputMode="tel" placeholder="(99) 99999-9999" className={inp} />
                  </div>
                </div>
              );
            }
            const dig = /cpf|cnpj/.test(n) ? 14 : /^cep$/.test(n) ? 8 : 0;
            return (
              <div key={c.id}>{rot(c.nome, obr)}
                <input value={v} onChange={e => set(c.id, dig ? soDigitos(e.target.value).slice(0, dig) : e.target.value)}
                  inputMode={dig ? 'numeric' : /e-?mail/.test(n) ? 'email' : 'text'} maxLength={dig || 1000} placeholder="Digite aqui ..." className={inp} />
              </div>
            );
          })}
          {colunas.some(c => /^id registro/.test(nome(c))) && (
            <div><p className="text-sm font-semibold text-[var(--c-texto)]">ID Registro</p><p className="text-sm text-[var(--c-suave)]">#</p></div>
          )}
        </div>
        <div className="px-5 pb-4 pt-2 space-y-1.5">
          {(aviso || erro) && <p className="text-xs text-red-400">{aviso || erro}</p>}
          <button type="button" onClick={salvar} disabled={salvando}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-full text-sm font-semibold bg-[var(--c-destaque)] text-white disabled:opacity-50">
            {salvando && <Spinner size={13} />} Criar registro
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Registro de uma database (ex.: Cliente do Cadastro Cliente): busca no servidor, cartões com os dados e "Criar registro" ──
// textoSimples: campo "Lista" ligado a uma database (base:<id>) — grava só a descrição, como antes
function SeletorRegistroCartoes({ campo, valor, onChange, textoSimples = false }) {
  const baseId = Number(String(campo.lista || '').replace(/^base:/, '')) || 0;
  const textoAtual = textoSimples ? (valorLista(valor)[0] || '') : '';
  const atual = textoSimples ? (textoAtual ? { id: null, descricao: textoAtual } : null) : lerRegistro(valor);
  const caixa = useRef(null);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState(null);
  const [total, setTotal] = useState(0);
  const [baseInfo, setBaseInfo] = useState(null);
  const [novo, setNovo] = useState(null); // null = fechado; { descricao, valor, dados }
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  async function buscar(q) {
    try {
      const { data } = await basesService.registros(baseId, { limite: 40, q: String(q || '').trim() });
      setLista(data.registros); setTotal(data.total ?? data.registros.length); setBaseInfo(data.base); setErro('');
    } catch (e) { setErro(e.response?.data?.erro || 'Não consegui carregar os registros.'); setLista([]); }
  }
  useEffect(() => {
    if (!aberto || !baseId) return;
    const t = setTimeout(() => buscar(busca), lista === null ? 0 : 300);
    return () => clearTimeout(t);
  }, [aberto, busca]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!aberto) return;
    const fora = (e) => { if (caixa.current && !caixa.current.contains(e.target)) { setAberto(false); setNovo(null); } };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);
  if (!baseId) return <p className="text-[11px] text-amber-400">Escolha a base deste campo em Configurar.</p>;
  const comValor = baseInfo ? baseInfo.com_valor !== false : true;
  const colunas = baseInfo?.colunas || [];
  const escolher = (r) => {
    onChange(!r ? '' : textoSimples ? r.descricao : JSON.stringify({ id: r.id, base_id: r.base_id, base: r.base, descricao: r.descricao, valor: r.valor, criado_em: r.criado_em, ...(comValor ? {} : { sem_valor: true }), ...(r.extras?.length ? { extras: r.extras } : {}) }));
    setAberto(false); setBusca(''); setNovo(null); setErro('');
  };
  async function criarComForm({ descricao, valor, dados }) {
    setSalvando(true); setErro('');
    try {
      const { data } = await basesService.criarRegistro(baseId, { descricao, ...(comValor ? { valor } : {}), dados });
      escolher(data.registro);
    } catch (e) {
      if (e.response?.status === 409 && e.response?.data?.registro) { escolher(e.response.data.registro); return; }
      setErro(e.response?.data?.erro || 'Erro ao criar o registro.');
    } finally { setSalvando(false); }
  }
  const inp = 'w-full py-1.5 rounded-lg text-xs bg-[var(--c-fundo)] border border-[var(--c-borda)] text-[var(--c-texto)] focus:outline-none focus:border-[var(--c-destaque)]';
  return (
    <div ref={caixa} className="relative space-y-1.5">
      {atual && textoSimples
        ? (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] px-3 py-2">
            <p className="flex-1 text-sm font-semibold text-[var(--c-texto)] break-words">{atual.descricao}</p>
            <button type="button" onClick={() => setAberto(a => !a)} className="text-[11px] font-semibold text-[var(--c-destaque)] hover:underline">Trocar</button>
            <button type="button" onClick={() => escolher(null)} title="Tirar" className="text-[var(--c-suave)] hover:text-red-400"><X size={13} /></button>
          </div>
        )
        : atual
        ? <CartaoRegistro reg={atual} onTrocar={() => setAberto(a => !a)} onLimpar={() => escolher(null)} />
        : (
          <button type="button" onClick={() => setAberto(a => !a)}
            className="flex items-center gap-1.5 text-xs font-semibold text-[var(--c-destaque)] hover:underline">
            <Plus size={13} /> Criar ou escolher registro
          </button>
        )}
      {aberto && (
        <div className="absolute z-30 left-0 right-0 min-w-[300px] bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl shadow-2xl p-3 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-suave)]" />
              <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar"
                onKeyDown={e => { if (e.key === 'Escape') setAberto(false); if (e.key === 'Enter') { e.preventDefault(); if (lista?.length === 1) escolher(lista[0]); } }}
                className="w-full pl-9 pr-8 py-2 rounded-full text-sm bg-[var(--c-fundo)] border-2 border-[var(--c-destaque)] text-[var(--c-texto)] focus:outline-none" />
              {busca && <button type="button" onClick={() => setBusca('')} title="Limpar" className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={13} /></button>}
            </div>
            <button type="button" onClick={() => { setNovo({ descricao: busca, valor: '', dados: {} }); setErro(''); }}
              className="shrink-0 flex items-center gap-1 text-xs font-semibold text-[var(--c-destaque)] hover:underline"><Plus size={13} /> Criar registro</button>
          </div>
          {novo !== null && (
            <FormNovoRegistro base={baseInfo} comValor={comValor} colunas={colunas} inicial={novo} salvando={salvando} erro={erro}
              onFechar={() => setNovo(null)} onSalvar={criarComForm} />
          )}
          {erro && <p className="text-[11px] text-red-400">{erro}</p>}
          <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
            {!lista && !erro && <div className="flex justify-center py-4"><Spinner size={14} /></div>}
            {(lista || []).map(r => (
              <button key={r.id} type="button" onClick={() => escolher(r)}
                className={`w-full text-left rounded-lg border-l-4 border-[var(--c-destaque)]/40 bg-[var(--c-fundo)] border-y border-r border-y-[var(--c-borda)] border-r-[var(--c-borda)] px-3 py-2.5 hover:shadow-md hover:border-l-[var(--c-destaque)] ${(textoSimples ? r.descricao === atual?.descricao : r.id === atual?.id) ? 'ring-1 ring-[var(--c-destaque)]' : ''}`}>
                <p className="text-sm font-bold text-[var(--c-texto)] break-words">{r.descricao}</p>
                {comValor && <p className="text-xs text-[var(--c-suave)] mt-0.5">{fmtMoeda(r.valor)}</p>}
                {extrasPrincipais(r.extras, 3).map((x, i) => (
                  <div key={i} className="mt-2 min-w-0">
                    <p className="text-[10px] font-semibold text-[var(--c-suave)]">{x.nome}</p>
                    <p className="text-xs text-[var(--c-texto)] break-words">{x.valor}</p>
                  </div>
                ))}
              </button>
            ))}
            {lista && !lista.length && <p className="px-1 py-2 text-[11px] text-[var(--c-suave)]">{busca ? 'Nada encontrado. Use “Criar registro”.' : 'Base vazia. Use “Criar registro”.'}</p>}
            {lista && total > lista.length && <p className="text-center text-[11px] text-[var(--c-suave)] py-1">Mostrando {lista.length} de {total}. Digite para filtrar.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// Gatilho dos campos de escolha: "+ Criar ou escolher registro" ou o valor escolhido com Trocar / X
function GatilhoEscolha({ atual, onAbrir, onLimpar }) {
  if (!atual) {
    return (
      <button type="button" onClick={onAbrir} className="flex items-center gap-1.5 text-xs font-semibold text-[var(--c-destaque)] hover:underline">
        <Plus size={13} /> Criar ou escolher registro
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] px-3 py-2">
      <p className="flex-1 text-sm font-semibold text-[var(--c-texto)] break-words">{atual}</p>
      <button type="button" onClick={onAbrir} className="text-[11px] font-semibold text-[var(--c-destaque)] hover:underline">Trocar</button>
      <button type="button" onClick={onLimpar} title="Tirar" className="text-[var(--c-suave)] hover:text-red-400"><X size={13} /></button>
    </div>
  );
}
const CLASSE_BUSCA = 'w-full pl-9 pr-8 py-2 rounded-full text-sm bg-[var(--c-fundo)] border-2 border-[var(--c-destaque)] text-[var(--c-texto)] focus:outline-none';
const classeCartaoOpcao = (sel) => `w-full flex items-center gap-1.5 text-left rounded-lg border-l-4 border-[var(--c-destaque)]/40 bg-[var(--c-fundo)] border-y border-r border-y-[var(--c-borda)] border-r-[var(--c-borda)] px-3 py-2.5 text-sm font-bold hover:shadow-md hover:border-l-[var(--c-destaque)] ${sel ? 'ring-1 ring-[var(--c-destaque)] text-[var(--c-destaque)]' : 'text-[var(--c-texto)]'}`;

// ── Modelo máquina: lista do B-Requisições, com busca e "Criar registro" ──
let modelosCache = null;
function carregarModelos(forcar = false) {
  if (!modelosCache || forcar) {
    modelosCache = pedidosOrcamentoService.modelos().then(r => r.data.modelos.map(m => m.nome))
      .catch(e => { modelosCache = null; throw e; });
  }
  return modelosCache;
}
function SeletorModelo({ valor, onChange }) {
  const atual = valorLista(valor)[0] || '';
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [modelos, setModelos] = useState(null);
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);
  const [novo, setNovo] = useState(null); // null = fechado; texto = nome do registro novo
  useEffect(() => {
    if (!aberto || modelos) return;
    carregarModelos().then(setModelos).catch(e => setErro(e.response?.data?.erro || 'Não consegui carregar os modelos.'));
  }, [aberto, modelos]);
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtrados = (modelos || []).filter(m => norm(m).includes(norm(busca))).slice(0, 200);
  const escolher = (m) => { onChange(m ? JSON.stringify([m]) : ''); setAberto(false); setBusca(''); setNovo(null); };
  async function criar() {
    const nome = String(novo || '').replace(/\s+/g, ' ').trim();
    if (nome.length < 2) { setErro('Digite o nome do modelo.'); return; }
    setCriando(true); setErro('');
    try {
      const { data } = await pedidosOrcamentoService.criarModelo(nome);
      const lista = await carregarModelos(true);
      setModelos(lista);
      escolher(data.modelo.nome);
    } catch (e) { setErro(e.response?.data?.erro || 'Erro ao criar o modelo.'); }
    finally { setCriando(false); }
  }
  return (
    <div className="relative">
      <GatilhoEscolha atual={atual} onAbrir={() => setAberto(a => !a)} onLimpar={() => escolher('')} />
      {aberto && (
        <div className="absolute z-20 mt-1 w-full min-w-[260px] bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl shadow-2xl p-3 space-y-2">
          {/* Criar registro: campo próprio, separado da pesquisa */}
          {novo === null ? (
            <button type="button" onClick={() => { setNovo(''); setErro(''); }}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold text-[var(--c-destaque)] hover:bg-[var(--c-destaque)]/10">
              <Plus size={12} /> Criar registro
            </button>
          ) : (
            <div className="rounded-lg border border-[var(--c-destaque)]/40 bg-[var(--c-destaque)]/5 p-2 space-y-1.5">
              <p className="text-[11px] font-semibold text-[var(--c-texto)]">Novo modelo</p>
              <div className="relative">
                <input autoFocus value={novo} onChange={e => setNovo(e.target.value)} placeholder="Nome do modelo"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); criar(); } if (e.key === 'Escape') setNovo(null); }}
                  className="w-full pl-2 pr-7 py-1.5 rounded-lg text-xs bg-[var(--c-fundo)] border border-[var(--c-borda)] text-[var(--c-texto)] focus:outline-none focus:border-[var(--c-destaque)]" />
                {novo && <button type="button" onClick={() => setNovo('')} title="Limpar" className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={12} /></button>}
              </div>
              <div className="flex justify-end gap-1.5">
                <button type="button" onClick={() => setNovo(null)} className="px-2 py-1 rounded-lg text-[11px] text-[var(--c-suave)] hover:text-[var(--c-texto)]">Cancelar</button>
                <button type="button" onClick={criar} disabled={criando || String(novo).trim().length < 2}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--c-destaque)] text-white disabled:opacity-40">
                  {criando ? <Spinner size={11} /> : <Check size={11} />} Salvar modelo
                </button>
              </div>
            </div>
          )}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-suave)]" />
            <input autoFocus={novo === null} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar modelo"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (filtrados.length === 1) escolher(filtrados[0]); } if (e.key === 'Escape') setAberto(false); }}
              className={CLASSE_BUSCA} />
            {busca && <button type="button" onClick={() => setBusca('')} title="Limpar" className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={12} /></button>}
          </div>
          {erro && <p className="text-[11px] text-red-400">{erro}</p>}
          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {!modelos && !erro && <div className="flex justify-center py-3"><Spinner size={14} /></div>}
            {atual && <button type="button" onClick={() => escolher('')} className="w-full text-left px-2 py-1 rounded-lg text-[11px] text-[var(--c-suave)] hover:bg-[var(--c-borda)]/40">Limpar seleção</button>}
            {filtrados.map(m => (
              <button key={m} type="button" onClick={() => escolher(m)}
                className={classeCartaoOpcao(m === atual)}>
                {m === atual && <Check size={12} />}{m}
              </button>
            ))}
            {modelos && !filtrados.length && <p className="px-2 py-2 text-[11px] text-[var(--c-suave)]">Nenhum modelo encontrado.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Data / data e hora: calendário do navegador; vazio, ao clicar já vem o momento atual ──
const doisDig = (n) => String(n).padStart(2, '0');
// Texto gravado ("28/10/2026 14:30", "2026-10-28 14:30:00", ISO…) → valor do input
function paraInput(texto, comHora) {
  const t = String(texto || '').trim();
  let m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T,]+(\d{1,2}):(\d{2}))?/);
  let a, mes, d, h = '00', mi = '00';
  if (m) { [, d, mes, a] = m; if (m[4]) { h = doisDig(m[4]); mi = m[5]; } }
  else if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/))) { [, a, mes, d] = m; if (m[4]) { h = m[4]; mi = m[5]; } }
  else return '';
  return comHora ? `${a}-${mes}-${d}T${h}:${mi}` : `${a}-${mes}-${d}`;
}
// Valor do input → texto gravado (padrão brasileiro, igual ao Pipefy)
function deInput(v, comHora) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return '';
  return comHora ? `${m[3]}/${m[2]}/${m[1]} ${m[4] || '00'}:${m[5] || '00'}` : `${m[3]}/${m[2]}/${m[1]}`;
}
function agora(comHora) {
  const n = new Date();
  const d = `${doisDig(n.getDate())}/${doisDig(n.getMonth() + 1)}/${n.getFullYear()}`;
  return comHora ? `${d} ${doisDig(n.getHours())}:${doisDig(n.getMinutes())}` : d;
}
function CampoData({ valor, onChange, comHora, cls }) {
  const texto = valorLista(valor).join(', ');
  const v = paraInput(texto, comHora);
  return (
    <div className="flex items-center gap-1.5">
      <input type={comHora ? 'datetime-local' : 'date'} value={v}
        onFocus={() => { if (!texto) onChange(agora(comHora)); }}
        onChange={e => onChange(deInput(e.target.value, comHora))}
        className={cls} />
      <button type="button" onClick={() => onChange(agora(comHora))} title={comHora ? 'Data e hora de agora' : 'Hoje'}
        className="shrink-0 px-2 py-1 rounded-lg border border-[var(--c-borda)] text-[10px] font-semibold text-[var(--c-suave)] hover:text-[var(--c-destaque)]">{comHora ? 'Agora' : 'Hoje'}</button>
      {texto && <button type="button" onClick={() => onChange('')} title="Limpar" className="shrink-0 text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={12} /></button>}
    </div>
  );
}

// Lista com busca e "Criar registro" (todas as listas, Orçamento e Lojinha).
// A opção criada fica salva no campo para os próximos cards (quando o campo é do Configurar).
const normBusca = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function ListaBusca({ campo, valor, onChange }) {
  const svc = useServicoQuadro();
  const caixa = useRef(null);
  const [opcoes, setOpcoes] = useState(() => campo.opcoes || []);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState(null); // null = fechado; texto = nome do registro novo
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  useEffect(() => { setOpcoes(campo.opcoes || []); }, [campo.opcoes]);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e) => { if (caixa.current && !caixa.current.contains(e.target)) { setAberto(false); setNovo(null); } };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);
  const atual = valorLista(valor)[0] || '';
  const filtradas = opcoes.filter(o => normBusca(o).includes(normBusca(busca)));
  const escolher = (o) => { onChange(o); setAberto(false); setBusca(''); setNovo(null); setErro(''); };
  async function criar() {
    const t = String(novo || '').replace(/\s+/g, ' ').trim();
    if (!t) return;
    const igual = opcoes.find(o => normBusca(o) === normBusca(t));
    if (igual) { escolher(igual); return; }
    if (!campo.cfg_id || !svc.criarOpcao) { setOpcoes(l => [...l, t]); escolher(t); return; }
    setSalvando(true); setErro('');
    try {
      const { data } = await svc.criarOpcao(campo.cfg_id, t);
      const lista = Array.isArray(data?.opcoes) ? data.opcoes : [...opcoes, t];
      setOpcoes(lista);
      if (Array.isArray(campo.opcoes)) campo.opcoes.splice(0, campo.opcoes.length, ...lista);
      escolher(data?.opcao || t);
    } catch (e) { setErro(e?.response?.data?.erro || 'Não foi possível criar o registro.'); }
    finally { setSalvando(false); }
  }
  const inp = 'w-full py-1.5 rounded-lg text-xs bg-[var(--c-fundo)] border border-[var(--c-borda)] text-[var(--c-texto)] focus:outline-none focus:border-[var(--c-destaque)]';
  return (
    <div ref={caixa} className="relative">
      <GatilhoEscolha atual={atual} onAbrir={() => setAberto(a => !a)} onLimpar={() => escolher('')} />
      {aberto && (
        <div className="absolute z-30 mt-1 w-full min-w-[260px] bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl shadow-2xl p-3 space-y-2">
          {novo === null ? (
            <button type="button" onClick={() => { setNovo(busca); setErro(''); }}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold text-[var(--c-destaque)] hover:bg-[var(--c-destaque)]/10">
              <Plus size={12} /> Criar registro
            </button>
          ) : (
            <div className="rounded-lg border border-[var(--c-destaque)]/40 bg-[var(--c-destaque)]/5 p-2 space-y-1.5">
              <p className="text-[11px] font-semibold text-[var(--c-texto)]">Novo registro em “{campo.rotulo}”</p>
              <input autoFocus value={novo} onChange={e => setNovo(e.target.value)} placeholder="Nome" maxLength={120}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); criar(); } if (e.key === 'Escape') setNovo(null); }}
                className={`${inp} px-2`} />
              <div className="flex justify-end gap-1.5">
                <button type="button" onClick={() => setNovo(null)} className="px-2 py-1 rounded-lg text-[11px] text-[var(--c-suave)] hover:text-[var(--c-texto)]">Cancelar</button>
                <button type="button" onClick={criar} disabled={salvando || !String(novo).trim()}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--c-destaque)] text-white disabled:opacity-40">
                  {salvando ? <Spinner size={11} /> : <Check size={11} />} Salvar registro
                </button>
              </div>
            </div>
          )}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-suave)]" />
            <input autoFocus={novo === null} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (filtradas.length === 1) escolher(filtradas[0]); } if (e.key === 'Escape') setAberto(false); }}
              className={CLASSE_BUSCA} />
            {busca && <button type="button" onClick={() => setBusca('')} title="Limpar" className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={12} /></button>}
          </div>
          {erro && <p className="text-[11px] text-red-400">{erro}</p>}
          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {atual && <button type="button" onClick={() => escolher('')} className="w-full text-left px-2 py-1 rounded-lg text-[11px] text-[var(--c-suave)] hover:bg-[var(--c-borda)]/40">Limpar seleção</button>}
            {filtradas.map(o => (
              <button key={o} type="button" onClick={() => escolher(o)}
                className={classeCartaoOpcao(o === atual)}>
                {o === atual && <Check size={12} />}{o}
              </button>
            ))}
            {!filtradas.length && <p className="px-2 py-2 text-[11px] text-[var(--c-suave)]">{opcoes.length ? 'Nada encontrado. Use “Criar registro”.' : 'Lista vazia. Use “Criar registro”.'}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export function Editor({ campo, valor, onChange }) {
  if (['date', 'datetime', 'due_date'].includes(campo.tipo)) {
    const cls = 'w-full bg-[var(--c-fundo)] border border-[var(--c-borda)] rounded-lg px-2 py-1 text-xs text-[var(--c-texto)] focus:outline-none focus:border-[var(--c-destaque)]';
    return <CampoData valor={valor} onChange={onChange} comHora={campo.tipo !== 'date'} cls={cls} />;
  }
  if (campo.id === 'modelo_m_quina' || campo.lista === 'Modelos de máquina') return <SeletorModelo valor={valor} onChange={onChange} />;
  const cls = 'w-full bg-[var(--c-fundo)] border border-[var(--c-borda)] rounded-lg px-2 py-1 text-xs text-[var(--c-texto)] focus:outline-none focus:border-[var(--c-destaque)]';
  if (MULTI.includes(campo.tipo) && campo.opcoes?.length) {
    const sel = valorLista(valor);
    const alternar = (o) => {
      const n = sel.includes(o) ? sel.filter(x => x !== o) : [...sel, o];
      onChange(n.length ? JSON.stringify(n) : '');
    };
    if (campo.cores) return (
      <div className="flex flex-wrap gap-1.5">
        {campo.opcoes.map(o => {
          const cor = campo.cores[o] || '#64748b', on = sel.includes(o);
          return (
            <button key={o} type="button" onClick={() => alternar(o)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${on ? 'text-white' : 'opacity-60 hover:opacity-100'}`}
              style={on ? { background: cor, borderColor: cor } : { borderColor: cor, color: cor }}>{on ? '✓ ' : ''}{o}</button>
          );
        })}
      </div>
    );
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
  if (campo.tipo === 'registro') return <SeletorRegistroCartoes campo={campo} valor={valor} onChange={onChange} />;
  if (/^base:\d+$/.test(String(campo.lista || ''))) return <SeletorRegistroCartoes campo={campo} valor={valor} onChange={onChange} textoSimples />;
  if ((campo.tipo === 'radio_vertical' || campo.tipo === 'radio_horizontal') && campo.opcoes?.length) {
    const atual = valorLista(valor)[0] || '';
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {campo.opcoes.map(o => (
            <label key={o} className="flex items-center gap-1.5 text-xs text-[var(--c-texto)] cursor-pointer">
              <input type="radio" checked={atual === o} onChange={() => onChange(o)} className="accent-[var(--c-destaque)]" /> {o}
            </label>
          ))}
        </div>
        {atual && <button type="button" onClick={() => onChange('')} className="text-[11px] text-[var(--c-suave)] hover:text-[var(--c-texto)]">Limpar opção selecionada</button>}
      </div>
    );
  }
  if (ESCOLHA.includes(campo.tipo)) return <ListaBusca campo={campo} valor={valor} onChange={onChange} />;
  // Texto do jeito que foi digitado (sem cortar espaço do fim enquanto digita); lista do Pipefy vira texto
  const texto = typeof valor === 'string' && !valor.trim().startsWith('[') ? valor : valorLista(valor).join(', ');
  if (campo.tipo === 'long_text') return <textarea rows={3} value={texto} onChange={e => onChange(e.target.value)} className={cls} />;
  return <input value={texto} onChange={e => onChange(e.target.value)} className={cls} />;
}

// Grupos de campos do card (uma fase/coluna por grupo): configurados no B-Requisições
// (Configurar) + fases do Pipefy ainda não trazidas + campos fora da estrutura.
// atual = grupo da coluna/fase em que o card está.
export function montarGrupos(fases, pedido, statusAtual, faseAtualId) {
  // Campos do card que não estão na estrutura (ex.: campo removido do pipe)
  // (inclui os campos do Configurar: senão eles se repetiam em "Outros campos" como texto cru)
  const conhecidos = new Set([...(fases || []).flatMap(f => f.campos.map(c => c.id)),
    ...(CONFIG_ORCAMENTO.campos || []).map(c => c.pipefy_campo || `bx_${c.id}`)]);
  const outros = (Array.isArray(pedido.pipefy_campos) ? pedido.pipefy_campos : [])
    .filter(c => c?.id && !conhecidos.has(c.id)).map(c => ({ id: c.id, rotulo: c.nome, tipo: 'short_text', opcoes: [] }));
  // A fase atual do card vem primeiro (são os campos a preencher agora)
  // Fases cujos campos já foram trazidos para a configuração: aparecem pelo grupo configurado
  const importadas = new Set(COLUNAS_ORCAMENTO.filter(c => c.importados && c.faseId).map(c => String(c.faseId)));
  const visiveis = (fases || []).filter(f => !importadas.has(String(f.faseId)));
  const chaveDaFase = (id) => (id === 'inicio' ? 'inicio' : COLUNAS_ORCAMENTO.find(c => String(c.faseId) === String(id))?.status || null);
  const ordenadas = [...visiveis.filter(f => f.faseId === faseAtualId), ...visiveis.filter(f => f.faseId !== faseAtualId)]
    .map(f => ({ ...f, chave: chaveDaFase(f.faseId), atual: f.faseId === faseAtualId }));
  // Campos configurados no B-Requisições (Configurar): um grupo por coluna, a coluna atual primeiro
  const cfgCampos = CONFIG_ORCAMENTO.campos || [];
  const ordemCols = ['inicio', ...COLUNAS_ORCAMENTO.map(c => c.status)];
  const nomeCol = (k) => (k === 'inicio' ? 'Abertura do card' : COLUNAS_ORCAMENTO.find(c => c.status === k)?.titulo || k);
  const gruposCfg = [...new Set(cfgCampos.map(c => c.coluna))]
    .sort((a, b) => (a === statusAtual ? -1 : b === statusAtual ? 1 : ordemCols.indexOf(a) - ordemCols.indexOf(b)))
    .map(k => ({ faseId: `bx-${k}`, nome: COLUNAS_ORCAMENTO.find(c => c.status === k)?.importados ? nomeCol(k) : `${nomeCol(k)} · B-Requisições`, chave: k, atual: k === statusAtual, campos: cfgCampos.filter(c => c.coluna === k).map(c => campoDaConfig(c, 0, cfgCampos)) }));
  return [...gruposCfg, ...ordenadas, ...(outros.length ? [{ faseId: 'outros', nome: 'Outros campos', campos: outros }] : [])];
}

export default function CamposCardOrcamento({ pedido, ehAdmin, podeEditar = ehAdmin, onFechar, onSalvo, faseAtualId, statusAtual }) {
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

  const grupos = fases ? montarGrupos(fases, pedido, statusAtual, faseAtualId) : [];
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
          {editando && <p className="text-[11px] text-amber-400">Os campos ficam gravados só no B-Requisições. Anexos antigos do Pipefy não são editáveis; fotos adicionadas aqui ficam no B-Requisições. * = obrigatório.</p>}
          {grupos.map(g => {
            // Campos de foto (anexo com "foto" no nome) aparecem sempre, para adicionar fotos aqui
            const temFoto = (c) => c.tipo === 'attachment' && (c.boxer || /foto/i.test(c.rotulo || '') || (pedido.fotos_locais || []).some(f => f.campo === c.id));
            const lista = editando ? g.campos.filter(c => !SO_LEITURA.includes(c.tipo) || temValor(c.id) || temFoto(c)) : g.campos.filter(c => temValor(c.id) || temFoto(c));
            if (!lista.length) return null;
            return (
              <div key={g.faseId}>
                <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--c-suave)] mb-1.5">{g.nome}{(g.faseId === faseAtualId || g.atual) && <span className="ml-1.5 normal-case font-semibold text-[var(--c-destaque)]">· fase atual</span>}</p>
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
