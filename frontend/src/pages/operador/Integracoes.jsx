// ============================================================
// pages/operador/Integracoes.jsx — Chaves da API pública (só admin)
// ============================================================
// O admin cria chaves e escolhe quais telas cada uma pode consultar. Quem tiver a chave
// consulta o Boxer Operações (somente leitura) em /api/v1.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Copy, Check, Trash2, Pause, Play, Pencil, X, ListOrdered, KeyRound } from 'lucide-react';
import { integracoesService, baseURL } from '../../services/api';
import { Spinner } from '../../components/ui';

const campo = 'rounded-lg border border-[var(--c-borda)] bg-[var(--c-fundo)] px-2.5 py-1.5 text-xs text-[var(--c-texto)] outline-none focus:border-[var(--c-destaque)]';
const botao = 'rounded-lg border border-[var(--c-borda)] bg-[var(--c-superficie)] text-[var(--c-texto)] text-xs font-semibold px-3 py-1.5 hover:border-[var(--c-destaque)] disabled:opacity-40 flex items-center gap-1.5';
const principal = '!bg-[var(--c-destaque)] !text-white !border-transparent';
const fmt = (d) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const URL_API = (/^https?:/.test(baseURL) ? baseURL : 'https://boxer-requisicoes-2kyh.vercel.app/api').replace(/\/api$/, '');

function Modal({ titulo, onFechar, children, largo }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onFechar}>
      <div className={`w-full ${largo ? 'max-w-2xl' : 'max-w-lg'} max-h-[88vh] overflow-y-auto rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4 space-y-3`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--c-texto)]">{titulo}</h2>
          <button onClick={onFechar} className="text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Copiar({ texto, rotulo = 'Copiar' }) {
  const [ok, setOk] = useState(false);
  return (
    <button className={botao} onClick={async () => { try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* sem permissão */ } }}>
      {ok ? <Check size={12} /> : <Copy size={12} />} {ok ? 'Copiado' : rotulo}
    </button>
  );
}

// Formulário de criar/editar (escolha das telas)
function FormChave({ opcoes, inicial, onSalvar, onFechar }) {
  const [nome, setNome] = useState(inicial?.nome || '');
  const [telas, setTelas] = useState(new Set(inicial?.telas || []));
  const [limite, setLimite] = useState(inicial?.limite_min || 60);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const alternar = (t) => setTelas(s => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; });
  async function salvar() {
    setErro(''); setSalvando(true);
    try { await onSalvar({ nome, telas: [...telas], limite_min: Number(limite) || 60 }); }
    catch (e) { setErro(e.response?.data?.erro || 'Não consegui salvar.'); setSalvando(false); }
  }
  return (
    <Modal titulo={inicial ? 'Editar chave' : 'Nova chave de API'} onFechar={onFechar} largo>
      <input className={`${campo} w-full`} placeholder="Nome (ex.: Power BI - Diretoria)" value={nome} onChange={e => setNome(e.target.value)} autoFocus />
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <p className="text-xs font-bold text-[var(--c-texto)] flex-1">Telas que esta chave pode consultar</p>
          <button className="text-[11px] text-[var(--c-destaque-claro)] hover:underline" onClick={() => setTelas(new Set(opcoes.map(o => o.chave)))}>Marcar todas</button>
          <button className="text-[11px] text-[var(--c-suave)] hover:underline" onClick={() => setTelas(new Set())}>Limpar</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-[var(--c-borda)] bg-[var(--c-fundo)] p-2.5">
          {opcoes.map(o => (
            <label key={o.chave} className="flex items-center gap-2 text-xs text-[var(--c-texto)] cursor-pointer">
              <input type="checkbox" checked={telas.has(o.chave)} onChange={() => alternar(o.chave)} /> <span className="truncate">{o.nome}</span>
            </label>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-[var(--c-texto)]">
        Limite de consultas por minuto
        <input type="number" min="1" max="6000" className={`${campo} w-24`} value={limite} onChange={e => setLimite(e.target.value)} />
      </label>
      {erro && <p className="text-xs text-red-400">{erro}</p>}
      <button className={`${botao} ${principal}`} disabled={salvando || !nome.trim() || !telas.size} onClick={salvar}>
        {salvando ? <Spinner size={12} /> : <Check size={13} />} {inicial ? 'Salvar' : 'Criar chave'}
      </button>
    </Modal>
  );
}

// A chave aparece uma única vez
function ChaveCriada({ chave, onFechar }) {
  const exemplo = `curl "${URL_API}/api/v1" -H "Authorization: Bearer ${chave}"`;
  return (
    <Modal titulo="Chave criada" onFechar={onFechar} largo>
      <p className="text-xs text-amber-400">Copie agora. Por segurança esta chave não aparece de novo — se perder, crie outra.</p>
      <div className="rounded-lg border border-[var(--c-borda)] bg-[var(--c-fundo)] p-2.5 font-mono text-xs break-all text-[var(--c-texto)]">{chave}</div>
      <Copiar texto={chave} rotulo="Copiar chave" />
      <p className="text-xs text-[var(--c-suave)] pt-1">Teste rápido:</p>
      <pre className="rounded-lg border border-[var(--c-borda)] bg-[var(--c-fundo)] p-2.5 text-[11px] text-[var(--c-texto)] whitespace-pre-wrap break-all">{exemplo}</pre>
      <Copiar texto={exemplo} rotulo="Copiar exemplo" />
    </Modal>
  );
}

function Acessos({ chave, onFechar }) {
  const [lista, setLista] = useState(null);
  useEffect(() => { integracoesService.acessos(chave.id).then(({ data }) => setLista(data.acessos)).catch(() => setLista([])); }, [chave.id]);
  return (
    <Modal titulo={`Acessos recentes · ${chave.nome}`} onFechar={onFechar} largo>
      {!lista ? <div className="flex justify-center py-6"><Spinner /></div> : !lista.length ? <p className="text-xs text-[var(--c-suave)] text-center py-4">Nenhum acesso ainda.</p> : (
        <table className="w-full text-xs">
          <thead><tr className="text-[var(--c-suave)] text-left"><th className="py-1 pr-2">Quando</th><th className="pr-2">Consulta</th><th className="pr-2">Status</th><th>IP</th></tr></thead>
          <tbody>{lista.map((a, i) => (
            <tr key={i} className="border-t border-[var(--c-borda)]/60 text-[var(--c-texto)]">
              <td className="py-1 pr-2 whitespace-nowrap">{fmt(a.em)}</td><td className="pr-2 font-mono break-all">{a.caminho}</td>
              <td className={`pr-2 ${a.status >= 400 ? 'text-red-400' : ''}`}>{a.status}</td><td>{a.ip}</td>
            </tr>))}</tbody>
        </table>
      )}
    </Modal>
  );
}

export default function Integracoes() {
  const [chaves, setChaves] = useState([]);
  const [opcoes, setOpcoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [form, setForm] = useState(null);     // null | {} (nova) | chave (editar)
  const [criada, setCriada] = useState('');
  const [acessos, setAcessos] = useState(null);
  const nomes = useMemo(() => new Map(opcoes.map(o => [o.chave, o.nome])), [opcoes]);

  const carregar = useCallback(async () => {
    try {
      const [c, o] = await Promise.all([integracoesService.chaves(), integracoesService.opcoes()]);
      setChaves(c.data.chaves); setOpcoes(o.data.telas);
    } catch (e) { setErro(e.response?.data?.erro || 'Erro ao carregar as chaves.'); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function salvar(dados) {
    if (form?.id) { await integracoesService.editar(form.id, dados); setForm(null); }
    else { const { data } = await integracoesService.criar(dados); setForm(null); setCriada(data.chave); }
    await carregar();
  }
  async function alternarAtiva(c) {
    try { await integracoesService.editar(c.id, { ativo: !c.ativo }); await carregar(); }
    catch (e) { setErro(e.response?.data?.erro || 'Não consegui alterar.'); }
  }
  async function excluir(c) {
    if (!window.confirm(`Apagar a chave "${c.nome}"? Quem usa ela perde o acesso na hora.`)) return;
    try { await integracoesService.excluir(c.id); await carregar(); }
    catch (e) { setErro(e.response?.data?.erro || 'Não consegui apagar.'); }
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-[var(--c-texto)] flex items-center gap-2"><KeyRound size={18} /> Integrações · API</h1>
          <p className="text-xs text-[var(--c-suave)]">Chaves para outros sistemas consultarem o Boxer Operações (somente leitura). Cada chave só enxerga as telas que você liberar.</p>
        </div>
        <button className={`${botao} ${principal}`} onClick={() => setForm({})}><Plus size={13} /> Nova chave</button>
      </div>
      {erro && <p className="text-xs text-red-400">{erro}</p>}

      {carregando ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <div className="rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] divide-y divide-[var(--c-borda)]">
          {!chaves.length && <p className="text-xs text-[var(--c-suave)] text-center py-8">Nenhuma chave ainda. Clique em "Nova chave".</p>}
          {chaves.map(c => (
            <div key={c.id} className="p-3 flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-[14rem]">
                <p className="text-sm font-semibold text-[var(--c-texto)]">{c.nome}
                  <span className={`ml-2 text-[10px] font-semibold rounded px-1.5 py-0.5 ${c.ativo ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>{c.ativo ? 'Ativa' : 'Pausada'}</span>
                </p>
                <p className="text-[11px] font-mono text-[var(--c-suave)]">{c.prefixo}</p>
                <div className="flex gap-1 flex-wrap mt-1.5">
                  {c.telas.map(t => <span key={t} className="text-[10px] rounded px-1.5 py-0.5 bg-[var(--c-destaque)]/10 text-[var(--c-destaque-claro)]">{nomes.get(t) || t}</span>)}
                </div>
                <p className="text-[10px] text-[var(--c-suave)] mt-1.5">
                  Último uso: {fmt(c.ultimo_uso)} · {c.acessos_24h} consulta(s) em 24 h · limite {c.limite_min}/min · criada por {c.criado_por_nome || '—'} em {fmt(c.created_at)}
                </p>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <button className={botao} onClick={() => setAcessos(c)}><ListOrdered size={12} /> Acessos</button>
                <button className={botao} onClick={() => setForm(c)}><Pencil size={12} /> Editar</button>
                <button className={botao} onClick={() => alternarAtiva(c)}>{c.ativo ? <><Pause size={12} /> Pausar</> : <><Play size={12} /> Ativar</>}</button>
                <button className={`${botao} hover:!border-red-400`} onClick={() => excluir(c)}><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4 space-y-2 text-xs text-[var(--c-texto)]">
        <p className="font-bold text-sm">Como usar</p>
        <p className="text-[var(--c-suave)]">Toda consulta leva a chave no cabeçalho <code>Authorization: Bearer SUA_CHAVE</code>. Só aceita GET.</p>
        <pre className="rounded-lg border border-[var(--c-borda)] bg-[var(--c-fundo)] p-2.5 text-[11px] whitespace-pre-wrap break-all">{`${URL_API}/api/v1                              telas liberadas para a chave
${URL_API}/api/v1/orcamentos                   recursos da tela
${URL_API}/api/v1/orcamentos/pedidos           lista (limite, pagina, ordem=id:desc)
${URL_API}/api/v1/orcamentos/pedidos/4812      um registro
${URL_API}/api/v1/relatorios/executar/12       roda um relatório salvo`}</pre>
        <p className="text-[var(--c-suave)]">Filtros: <code>desde=2026-11-01</code> · <code>ate=2026-11-30</code> · <code>status=separando</code> · <code>cliente_nome__contem=paulista</code> · <code>valor__ge=100</code> · <code>campos=id,cliente_nome</code> · <code>limite=500</code>.</p>
      </div>

      {form && <FormChave opcoes={opcoes} inicial={form.id ? form : null} onSalvar={salvar} onFechar={() => setForm(null)} />}
      {criada && <ChaveCriada chave={criada} onFechar={() => setCriada('')} />}
      {acessos && <Acessos chave={acessos} onFechar={() => setAcessos(null)} />}
    </div>
  );
}
