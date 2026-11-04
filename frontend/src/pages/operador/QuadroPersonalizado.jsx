// ============================================================
// pages/operador/QuadroPersonalizado.jsx — Tela criada pelo admin (quadro de cards)
// ============================================================
// Mesmo quadro da Lojinha / Logística CIF: colunas e campos configuráveis na
// engrenagem (Formulário inicial = campos do "Novo card"), card que abre em 3
// partes, anexos/vídeos, histórico e mover entre colunas (arrastando ou no card).
// Acesso: admin; os outros conforme Admin > Usuários (Só ver / Ver e mexer).
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Search, Check, X, Settings, Activity, History, ArrowRight, ArrowLeft, Plus, Trash2, Pencil } from 'lucide-react';
import { quadroService } from '../../services/api';
import { Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { nivelTela } from '../../utils/telas';
import { useTelas } from '../../utils/nomesTelas';
import ConfigOrcamento, { campoDaConfig } from '../../components/operador/ConfigOrcamento';
import PainelMovimentacao from '../../components/operador/PainelMovimentacao';
import { FotosProvider, FaixaFotosCard, FotosCampo } from '../../components/operador/FotosOrcamento';
import { useFasesPassadas, CaixaFase } from '../../components/operador/FaseAnterior';
import { Editor, Valor, SO_LEITURA, valorLista, obrigatorioAgora, visivelAgora, EtiquetasDoCard, lerRegistro } from '../../components/operador/CamposCardOrcamento';
import { Pilula, Coluna } from './LojinhaBoxer';

const fmtData = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function montarColunas(cfg) {
  const lista = cfg?.colunas?.length ? cfg.colunas : [{ chave: 'entrada', nome: 'Entrada', cor: '#3b82f6' }];
  return lista.map(c => ({
    status: c.chave, inclui: [c.chave], titulo: c.nome, hex: c.cor, admin: !!c.so_admin, arquivada: !!c.arquivada,
    destinos: Array.isArray(c.destinos) ? c.destinos : null,
  }));
}
function combina(card, busca) {
  const termos = semAcento(busca).split(/\s+/).filter(Boolean);
  if (!termos.length) return true;
  const texto = semAcento([card.titulo, `#${card.id}`, ...Object.values(card.valores || {})].join(' '));
  return termos.every(t => texto.includes(t));
}

export default function QuadroPersonalizado() {
  const { id } = useParams();
  const qid = parseInt(id) || 0;
  const { usuario } = useAuth();
  const { quadros } = useTelas();
  const nivel = nivelTela(usuario, `quadro_${qid}`);
  if (!qid || nivel === 'nenhum') return <Navigate to="/catalogo" replace />;
  const nome = quadros.find(q => q.id === qid)?.nome;
  return <Quadro key={qid} qid={qid} nome={nome} podeEditar={nivel === 'editar'} admin={usuario?.perfil === 'admin'} />;
}

function Quadro({ qid, nome: nomeMenu, podeEditar, admin }) {
  const svc = useMemo(() => quadroService(qid), [qid]);
  const servicoFotos = useMemo(() => ({
    base: `/quadros/${qid}/fotos`, imagem: svc.imagem, enviarFoto: svc.enviarFoto, excluirFoto: svc.excluirFoto, criarOpcao: svc.criarOpcao,
  }), [qid, svc]);
  const servicoConfig = useMemo(() => ({ config: svc.config, salvarConfig: svc.salvarConfig }), [svc]);
  const [cards, setCards] = useState(null);
  const [quadro, setQuadro] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [verConfig, setVerConfig] = useState(false);
  const [verMov, setVerMov] = useState(false);
  const [historico, setHistorico] = useState(null);
  const [novo, setNovo] = useState(false);
  const [abertoId, setAbertoId] = useState(null);
  const [arrastando, setArrastando] = useState(null);
  const [soltando, setSoltando] = useState(null);
  const [movendoId, setMovendoId] = useState(null);

  async function carregar() {
    try { const { data } = await svc.cards(); setCards(data.cards); setQuadro(data.quadro); setErro(''); }
    catch (e) { setErro(e.response?.data?.erro || 'Não consegui carregar a tela.'); setCards(c => c || []); }
  }
  useEffect(() => {
    svc.config().then(r => setCfg(r.data)).catch(() => {});
    carregar();
    const t = setInterval(() => { if (!document.hidden) carregar(); }, 60000);
    return () => clearInterval(t);
  }, [svc]); // eslint-disable-line react-hooks/exhaustive-deps

  const nome = quadro?.nome || nomeMenu || 'Tela';
  const lista = cards || [];
  const colunas = montarColunas(cfg);
  const aberto = abertoId ? lista.find(p => p.id === abertoId) : null;
  const ativos = lista.filter(p => !colunas.find(c => c.status === p.status)?.arquivada).length;
  const nomeStatus = Object.fromEntries(colunas.map(c => [c.status, c.titulo]));
  const corStatus = Object.fromEntries(colunas.map(c => [c.status, 'bg-[var(--c-borda)] text-[var(--c-texto)]']));

  function podeSoltar(p, col) {
    if (!podeEditar || !p || col.status === p.status) return false;
    const atual = colunas.find(c => c.status === p.status);
    if (Array.isArray(atual?.destinos) && !atual.destinos.includes(col.status)) return false;
    if (!admin && (col.admin || atual?.admin)) return false;
    return true;
  }
  async function soltar(col) {
    const p = arrastando;
    setArrastando(null); setSoltando(null);
    if (!podeSoltar(p, col)) return;
    setMovendoId(p.id);
    try { await svc.mover(p.id, col.status); }
    catch (e) { alert(e.response?.data?.erro || 'Erro ao mover.'); }
    finally { setMovendoId(null); carregar(); }
  }

  return (
    <FotosProvider servico={servicoFotos}>
    <div className="space-y-5 xl:space-y-0 xl:flex xl:flex-col xl:gap-5 xl:h-[calc(100dvh-3.1rem)]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--c-texto)]">{nome}</h1>
          <p className="text-sm text-[var(--c-suave)] mt-0.5">{ativos} card{ativos !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-suave)]" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar…"
              className="w-48 sm:w-60 pl-8 pr-7 py-2 rounded-xl text-xs bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto)] focus:outline-none focus:border-[var(--c-destaque)]" />
            {busca && <button onClick={() => setBusca('')} title="Limpar" className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={12} /></button>}
          </div>
          <button onClick={() => setVerMov(true)} title="Relatório de movimentação"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto)] hover:border-[var(--c-destaque)]">
            <Activity size={13} /> Movimentação
          </button>
          {admin && (
            <button onClick={() => setVerConfig(true)} title="Configurar colunas e campos"
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto)] hover:border-[var(--c-destaque)]">
              <Settings size={13} /> Configurar
            </button>
          )}
          {podeEditar && (
            <button onClick={() => setNovo(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--c-destaque)] text-white hover:opacity-90">
              <Plus size={13} /> Novo card
            </button>
          )}
        </div>
      </div>
      {erro && <p className="text-xs text-red-400">{erro}</p>}

      {!cards ? (
        <div className="flex justify-center py-16"><Spinner className="text-[var(--c-destaque)]" /></div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2 xl:flex-1 xl:min-h-0">
          {colunas.map(col => {
            const doStatus = lista.filter(p => p.status === col.status && combina(p, busca));
            return (
              <Coluna key={col.status} col={col} total={doStatus.length} arquivada={col.arquivada && !busca}
                onConfigurar={admin ? () => setVerConfig(col.status) : undefined}
                arraste={arrastando ? { pode: podeSoltar(arrastando, col), sobre: soltando === col.status } : null}
                onArrasteSobre={() => setSoltando(col.status)} onArrasteSai={() => setSoltando(s => (s === col.status ? null : s))}
                onSoltar={() => soltar(col)}>
                {doStatus.length === 0 ? (
                  <div className="border-2 border-dashed border-[var(--c-borda)] rounded-2xl py-8 text-center">
                    <p className="text-xs text-[var(--c-suave)]">{busca ? 'Nada encontrado' : 'Sem cards'}</p>
                  </div>
                ) : doStatus.map(p => (
                  <CardQuadro key={p.id} p={p} cfg={cfg} movendo={movendoId === p.id} podeArrastar={podeEditar} onAbrir={() => setAbertoId(p.id)}
                    onArrastar={() => setArrastando(p)} onFimArraste={() => { setArrastando(null); setSoltando(null); }} />
                ))}
              </Coluna>
            );
          })}
        </div>
      )}

      {novo && <NovoCard svc={svc} cfg={cfg} nome={nome} onFechar={() => setNovo(false)} onCriado={(c) => { setNovo(false); carregar(); setAbertoId(c.id); }} />}
      {aberto && (
        <CardAberto p={aberto} cfg={cfg} colunas={colunas} svc={svc} podeEditar={podeEditar} admin={admin} nomeQuadro={nome}
          carregar={carregar} onFechar={() => setAbertoId(null)}
          onConfigurar={admin ? () => { setAbertoId(null); setVerConfig(aberto.status); } : null}
          onHistorico={() => setHistorico({ id: aberto.id, nome: aberto.titulo })} />
      )}
      {verConfig && admin && (
        <ConfigOrcamento servico={servicoConfig} titulo={`Configurações — ${nome}`}
          colunaInicial={typeof verConfig === 'string' ? verConfig : null}
          onFechar={() => setVerConfig(false)} onSalvo={(data) => setCfg(data)} />
      )}
      {(verMov || historico) && (
        <PainelMovimentacao buscar={(params) => svc.movimentos(params)} nomeStatus={nomeStatus} corStatus={corStatus}
          titulo={`Movimentação — ${nome}`} arquivo={`movimentacao-${semAcento(nome).replace(/[^a-z0-9]+/g, '-')}`} pedidoInicial={historico}
          onFechar={() => { setVerMov(false); setHistorico(null); }} />
      )}
    </div>
    </FotosProvider>
  );
}

// Card do quadro: título, data, etiquetas, anexos e até 3 campos do formulário inicial
function CardQuadro({ p, cfg, movendo, podeArrastar, onAbrir, onArrastar, onFimArraste }) {
  const parar = (e) => e.stopPropagation();
  const valores = p.valores || {};
  const resumo = (cfg?.campos || []).filter(c => c.coluna === 'inicio' && !['anexo', 'etiquetas', 'longo'].includes(c.tipo))
    .map(campoDaConfig).filter(c => valorLista(valores[c.id]).length).slice(0, 3);
  return (
    <div onClick={onAbrir} title={podeArrastar ? 'Abrir card (segure e arraste para mudar de coluna)' : 'Abrir card'}
      draggable={podeArrastar && !movendo}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(p.id)); onArrastar?.(); }}
      onDragEnd={() => onFimArraste?.()}
      className={`${movendo ? 'opacity-50 pointer-events-none ' : ''}p-3 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] space-y-1.5 min-w-0 break-words cursor-pointer hover:border-[var(--c-borda-forte)] transition-colors`}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-sm text-[var(--c-texto)]">{p.titulo}</span>
        <span className="text-[11px] text-[var(--c-suave)] shrink-0" title="Criado em">{fmtData(p.criado_em)}</span>
      </div>
      <EtiquetasDoCard campos={cfg?.campos || []} valorDe={(id) => valores[id]} />
      {resumo.map(c => (
        <p key={c.id} className="text-[11px] text-[var(--c-suave)] truncate"><span className="text-[var(--c-texto)]">{c.rotulo}:</span> {valorLista(valores[c.id]).join(', ')}</p>
      ))}
      <div onClick={parar}><FaixaFotosCard pedido={p} onVerTodas={onAbrir} /></div>
    </div>
  );
}

// Novo card: título + campos do Formulário inicial (anexos depois de criar)
function NovoCard({ svc, cfg, nome, onFechar, onCriado }) {
  const [titulo, setTitulo] = useState('');
  const [valores, setValores] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const todos = (cfg?.campos || []).filter(c => c.coluna === 'inicio').map(campoDaConfig);
  const valorDe = (id) => valores[id];
  const campos = todos.filter(c => visivelAgora(c, valorDe));
  const temAnexo = campos.some(c => c.tipo === 'attachment');
  async function criar() {
    setSalvando(true); setErro('');
    try { const { data } = await svc.criar({ titulo, campos: valores }); onCriado(data.card); }
    catch (e) { setErro(e.response?.data?.erro || 'Erro ao criar o card.'); }
    finally { setSalvando(false); }
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={onFechar}>
      <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto bg-[var(--c-fundo)] border border-[var(--c-borda)] rounded-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-[var(--c-texto)]">Novo card — {nome}</p>
          <button onClick={onFechar} className="p-1 text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={18} /></button>
        </div>
        <div>
          <p className="text-xs font-semibold text-[var(--c-texto)] mb-1">Título do card</p>
          <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Se deixar vazio, usa o primeiro campo preenchido"
            className="w-full bg-[var(--c-fundo)] border border-[var(--c-borda)] text-[var(--c-texto)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[var(--c-destaque)]" />
        </div>
        {!todos.length && <p className="text-xs text-[var(--c-suave)]">Sem campos no Formulário inicial. O admin cria em Configurar → Formulário inicial.</p>}
        <dl className="flex flex-col gap-4">
          {campos.filter(c => c.tipo !== 'attachment').map(c => (
            <div key={c.id}>
              <dt className="text-xs font-semibold text-[var(--c-texto)]">{obrigatorioAgora(c, valorDe) && <span className="text-red-400">* </span>}{c.rotulo}</dt>
              {c.descricao && <p className="text-[11px] text-[var(--c-suave)]">{c.descricao}</p>}
              <dd className="mt-1 text-xs"><Editor campo={c} valor={valores[c.id]} onChange={v => setValores(s => ({ ...s, [c.id]: v }))} /></dd>
            </div>
          ))}
        </dl>
        {temAnexo && <p className="text-[11px] text-[var(--c-suave)]">Fotos, arquivos e vídeos são anexados depois de criar o card.</p>}
        {erro && <p className="text-xs text-red-400">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onFechar} className="px-3 py-2 rounded-lg text-xs text-[var(--c-suave)] hover:text-[var(--c-texto)]">Cancelar</button>
          <button onClick={criar} disabled={salvando} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--c-destaque)] text-white disabled:opacity-40">
            {salvando ? <Spinner size={12} /> : <Plus size={12} />} Criar card
          </button>
        </div>
      </div>
    </div>
  );
}

// Card aberto: formulário inicial e fases anteriores | fase atual | mover
function CardAberto({ p, cfg, colunas, svc, podeEditar, admin, nomeQuadro, carregar, onFechar, onHistorico, onConfigurar = null }) {
  const [editandoFase, setEditandoFase] = useState(() => new Set());
  const [abertas, setAbertas] = useState(() => new Set(['inicio']));
  const [rascunho, setRascunho] = useState({});
  const [titulo, setTitulo] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [movendo, setMovendo] = useState(false);
  const [erro, setErro] = useState('');
  const fasesPassadas = useFasesPassadas(() => svc.movimentos({ pedido: p.id }), `${p.id}-${p.status}`,
    p.status, colunas.map(c => c.status), p.criado_em);

  const atual = p.status;
  const colAtual = colunas.find(c => c.status === atual);
  const idx = colunas.findIndex(c => c.status === atual);
  const valores = p.valores || {};
  const valorDe = (id) => (id in rascunho ? rascunho[id] : valores[id]);
  const temFoto = (id) => (p.fotos_locais || []).some(f => f.campo === id);
  const sujo = Object.keys(rascunho).length > 0 || (titulo !== null && titulo.trim() && titulo.trim() !== p.titulo);
  const camposDe = (k) => (cfg?.campos || []).filter(c => c.coluna === k).map(campoDaConfig);
  const camposAtuais = camposDe(atual).filter(c => visivelAgora(c, valorDe));
  const preenchido = (f) => valorLista(valorDe(f.id)).length || (f.tipo === 'attachment' && temFoto(f.id));

  const grupos = [{ chave: 'inicio', titulo: 'Formulário inicial', col: null }, ...colunas.filter(c => c.status !== atual).map(c => ({ chave: c.status, col: c }))]
    .map(g => {
      const editando = podeEditar && editandoFase.has(g.chave);
      const todos = camposDe(g.chave).filter(f => visivelAgora(f, valorDe));
      return { ...g, editando, todos, campos: editando ? todos : todos.filter(preenchido) };
    })
    .filter(g => g.chave === 'inicio' || fasesPassadas.passou(g.chave))
    .filter(g => g.campos.length || (podeEditar && g.todos.length));

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') fechar(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  async function salvar() {
    if (!sujo) return true;
    setSalvando(true); setErro('');
    try {
      await svc.editarCampos(p.id, rascunho, titulo !== null ? titulo : undefined);
      setRascunho({}); setTitulo(null); setEditandoFase(new Set()); await carregar(); return true;
    } catch (e) { setErro(e.response?.data?.erro || 'Erro ao salvar.'); return false; }
    finally { setSalvando(false); }
  }
  function fechar() {
    if (sujo && !confirm('Há alterações sem salvar. Fechar mesmo assim?')) return;
    onFechar();
  }
  async function mover(status) {
    if (sujo && !(await salvar())) return;
    setMovendo(true); setErro('');
    try { await svc.mover(p.id, status); await carregar(); }
    catch (e) { setErro(e.response?.data?.erro || 'Erro ao mover.'); }
    finally { setMovendo(false); }
  }
  async function excluir() {
    if (!confirm(`Excluir o card "${p.titulo}"? Os anexos também são apagados. Não dá para desfazer.`)) return;
    try { await svc.excluir(p.id); onFechar(); carregar(); }
    catch (e) { setErro(e.response?.data?.erro || 'Erro ao excluir.'); }
  }

  const permitido = (c) => !Array.isArray(colAtual?.destinos) || colAtual.destinos.includes(c.status);
  const destinos = podeEditar ? colunas.filter(c => c.status !== atual && permitido(c) && !(c.admin && !admin) && !(colAtual?.admin && !admin)) : [];
  const proxima = destinos.find(c => colunas.indexOf(c) > idx) || null;
  const outros = destinos.filter(c => c !== proxima);

  const blocoCampo = (c, editavel) => (
    <div key={c.id} className="min-w-0">
      <dt className="text-xs font-semibold text-[var(--c-texto)]">{editavel && obrigatorioAgora(c, valorDe) && <span className="text-red-400">* </span>}{c.rotulo}</dt>
      {c.descricao && editavel && <p className="text-[11px] text-[var(--c-suave)]">{c.descricao}</p>}
      <dd className="text-xs text-[var(--c-texto)] mt-1">
        {c.tipo === 'attachment'
          ? <FotosCampo pedido={p} campo={c} valor={null} podeEnviar={editavel} onMudou={carregar} />
          : editavel && !SO_LEITURA.includes(c.tipo) && !(c.tipo !== 'registro' && lerRegistro(valorDe(c.id)))
          ? <Editor campo={c} valor={valorDe(c.id)} onChange={v => setRascunho(r => ({ ...r, [c.id]: v }))} />
          : <Valor campo={c} valor={valorDe(c.id)} />}
      </dd>
    </div>
  );
  const botao = (c, principal = false) => {
    const antes = colunas.indexOf(c) < idx;
    return (
      <button key={c.status} onClick={() => mover(c.status)} disabled={movendo || salvando}
        className={`w-full flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold text-left transition-colors disabled:opacity-40 ${
          principal ? 'border-[var(--c-destaque)]/50 bg-[var(--c-destaque)]/15 text-[var(--c-destaque)] hover:bg-[var(--c-destaque)]/25'
          : 'border-[var(--c-borda)] text-[var(--c-texto)] hover:bg-[var(--c-borda)]/40'}`}>
        {!principal && antes && <ArrowLeft size={13} className="shrink-0 text-[var(--c-suave)]" />}
        <span className="flex-1 truncate">{c.titulo}</span>
        {(principal || !antes) && <ArrowRight size={13} className="shrink-0" />}
      </button>
    );
  };
  const alternar = (k, aberta) => setAbertas(s => { const n = new Set(s); aberta ? n.delete(k) : n.add(k); return n; });

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-2 sm:p-4" onClick={fechar}>
      <div className="w-full max-w-[1320px] h-full max-h-[94dvh] flex flex-col bg-[var(--c-fundo)] border border-[var(--c-borda)] rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
          {/* Esquerda */}
          <div className="lg:w-[38%] lg:min-w-[340px] lg:overflow-y-auto border-b lg:border-b-0 lg:border-r border-[var(--c-borda)] p-5 space-y-4">
            <div className="pb-3 border-b border-[var(--c-borda)] space-y-1">
              {titulo !== null
                ? <input autoFocus value={titulo} onChange={e => setTitulo(e.target.value)}
                    className="w-full bg-[var(--c-fundo)] border border-[var(--c-destaque)] text-[var(--c-texto)] rounded-lg px-2 py-1 text-lg font-bold focus:outline-none" />
                : <p className="text-lg font-bold text-[var(--c-texto)] break-words flex items-start gap-2">
                    <span className="flex-1">{p.titulo}</span>
                    {podeEditar && <button onClick={() => setTitulo(p.titulo)} title="Editar título" className="mt-1 text-[var(--c-suave)] hover:text-[var(--c-texto)]"><Pencil size={13} /></button>}
                  </p>}
              <span className="inline-block text-[10px] font-semibold rounded px-1.5 py-0.5 bg-[var(--c-borda)] text-[var(--c-suave)]">{nomeQuadro} · #{p.id}</span>
              <p className="text-[11px] text-[var(--c-suave)]">Criado em {fmtData(p.criado_em)} · por {p.criado_por_nome || '—'}</p>
            </div>
            {grupos.map(g => {
              const aberta = abertas.has(g.chave);
              return (
                <CaixaFase key={g.chave} titulo={g.col ? '' : g.titulo} pilula={g.col && <Pilula col={g.col} />}
                  tempo={g.col ? fasesPassadas.tempo(g.chave) : null}
                  aberta={aberta} onAlternar={() => alternar(g.chave, aberta)}
                  podeEditar={podeEditar} editando={g.editando}
                  onEditar={() => setEditandoFase(s => { const n = new Set(s); n.has(g.chave) ? n.delete(g.chave) : n.add(g.chave); return n; })}>
                  {g.campos.length
                    ? <dl className="flex flex-col gap-3">{g.campos.map(c => blocoCampo(c, g.editando))}</dl>
                    : <p className="text-xs text-[var(--c-suave)]">Nenhum campo preenchido.</p>}
                </CaixaFase>
              );
            })}
          </div>

          {/* Meio: fase atual */}
          <div className="flex-1 min-w-0 lg:overflow-y-auto p-5 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-[var(--c-borda)]">
              <p className="text-sm font-bold text-[var(--c-texto)]">Fase atual</p>
              <Pilula col={colAtual} />
            </div>
            {erro && <p className="text-xs text-red-400">{erro}</p>}
            {camposAtuais.length
              ? <dl className="flex flex-col gap-4">{camposAtuais.map(c => blocoCampo(c, podeEditar))}</dl>
              : <p className="text-xs text-[var(--c-suave)] py-4">Esta coluna não tem campos para preencher.{admin ? ' Crie em Configurar (engrenagem da coluna).' : ''}</p>}
            {sujo && (
              <div className="sticky bottom-0 flex items-center justify-end gap-2 py-2 bg-[var(--c-fundo)] border-t border-[var(--c-borda)]">
                <p className="flex-1 text-[11px] text-amber-400">Alterações não salvas.</p>
                <button onClick={() => { setRascunho({}); setTitulo(null); }} className="px-3 py-1.5 rounded-lg text-xs text-[var(--c-suave)] hover:text-[var(--c-texto)]">Descartar</button>
                <button onClick={salvar} disabled={salvando}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--c-destaque)] text-white disabled:opacity-40">
                  {salvando ? <Spinner size={12} /> : <Check size={12} />} Salvar
                </button>
              </div>
            )}
          </div>

          {/* Direita: mover, histórico, excluir */}
          <div className="lg:w-[270px] shrink-0 lg:overflow-y-auto border-t lg:border-t-0 lg:border-l border-[var(--c-borda)] p-5 space-y-4 bg-[var(--c-superficie)]/40">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-[var(--c-texto)]">Mover card para</p>
              <button onClick={fechar} aria-label="Fechar" className="p-1 text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={18} /></button>
            </div>
            {proxima && botao(proxima, true)}
            {movendo && <p className="flex items-center gap-2 text-[11px] text-[var(--c-suave)]"><Spinner size={12} /> Movendo…</p>}
            {outros.length > 0 && <div className="space-y-1.5 pt-3 border-t border-[var(--c-borda)]">{outros.map(c => botao(c))}</div>}
            {!destinos.length && <p className="text-[11px] text-[var(--c-suave)]">{podeEditar ? 'Esta coluna não tem para onde mover.' : 'Você só pode visualizar esta tela.'}</p>}
            {onConfigurar && (
              <button onClick={onConfigurar} className="flex items-center gap-1.5 text-[11px] text-[var(--c-suave)] hover:text-[var(--c-destaque)]">
                <Settings size={12} /> Configurar colunas e campos
              </button>
            )}
            <div className="space-y-1.5 pt-3 border-t border-[var(--c-borda)]">
              <button onClick={onHistorico}
                className="w-full flex items-center gap-2 rounded-xl border border-[var(--c-borda)] px-3 py-2 text-xs font-semibold text-[var(--c-texto)] hover:bg-[var(--c-borda)]/40">
                <History size={13} /> <span className="flex-1 text-left">Histórico do card</span>
              </button>
              {admin && (
                <button onClick={excluir}
                  className="w-full flex items-center gap-2 rounded-xl border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/10">
                  <Trash2 size={13} /> <span className="flex-1 text-left">Excluir card</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
