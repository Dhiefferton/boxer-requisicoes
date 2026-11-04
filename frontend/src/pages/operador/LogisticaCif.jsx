// ============================================================
// pages/operador/LogisticaCif.jsx — Logística CIF (Enviar)
// ============================================================
// Continuação da Lojinha Boxer: o pedido que chega em Finalizado entra aqui
// sozinho na coluna "Aguardando envio" (e continua em Finalizado na Lojinha).
// Mesmo quadro da Lojinha: colunas e campos configuráveis (engrenagem),
// card que abre em 3 partes, fotos/arquivos e o histórico inteiro do pedido
// (Lojinha + CIF). Os campos da Lojinha aparecem só para consulta.
// ============================================================
import { useEffect, useState } from 'react';
import { Search, Check, X, Settings, Activity, History, ArrowRight, ArrowLeft, ExternalLink } from 'lucide-react';
import { cifService } from '../../services/api';
import { Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { podeNaTela } from '../../utils/telas';
import ConfigOrcamento, { campoDaConfig } from '../../components/operador/ConfigOrcamento';
import PainelMovimentacao from '../../components/operador/PainelMovimentacao';
import { FotosProvider, FaixaFotosCard, FotosCampo } from '../../components/operador/FotosOrcamento';
import { useFasesPassadas, CaixaFase } from '../../components/operador/FaseAnterior';
import { Editor, Valor, SO_LEITURA, valorLista, obrigatorioAgora, visivelAgora, EtiquetasDoCard, lerRegistro } from '../../components/operador/CamposCardOrcamento';
import { combinaBusca, montarColunas as colunasLojinha, Pilula, Coluna, InfoLiberacao, DadosPedido } from './LojinhaBoxer';
import { NomeTela } from '../../utils/nomesTelas';

const fmtData = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');

const SERVICO_FOTOS = {
  base: '/logistica-cif/fotos',
  imagem: (url) => cifService.imagem(url),
  enviarFoto: (id, dados) => cifService.enviarFoto(id, dados),
  excluirFoto: (fotoId) => cifService.excluirFoto(fotoId),
  criarOpcao: (campoId, opcao) => cifService.criarOpcao(campoId, opcao),
};
const SERVICO_CONFIG = { config: () => cifService.quadroConfig(), salvarConfig: (d) => cifService.salvarQuadroConfig(d) };
const buscarMovimentos = (params) => cifService.movimentos(params);

// Colunas do CIF (configuração) — mesmo formato das colunas da Lojinha
function colunasCif(cfg) {
  const lista = cfg?.colunas?.length ? cfg.colunas : [{ chave: 'aguardando_envio', nome: 'Aguardando envio', cor: '#3b82f6' }];
  return lista.map(c => ({
    status: c.chave, inclui: [c.chave], titulo: c.nome, hex: c.cor, admin: !!c.so_admin, arquivada: !!c.arquivada,
    destinos: Array.isArray(c.destinos) ? c.destinos : null,
  }));
}
// Campos do CIF: ids com prefixo "cif_" (os valores ficam separados dos da Lojinha)
const pref = (id) => (id ? `cif_${id}` : id);
function prefixarCadeia(m) { return m ? { ...m, id: pref(m.id), pai: prefixarCadeia(m.pai) } : m; }
function campoCif(c, i, todos) {
  const x = campoDaConfig(c, i, todos);
  return { ...x, id: pref(x.id), quando: x.quando ? { ...x.quando, id: pref(x.quando.id) } : null, mostrar: prefixarCadeia(x.mostrar) };
}

export default function LogisticaCif() {
  const { usuario } = useAuth();
  const botoes = podeNaTela(usuario, 'logistica_cif');
  const [pedidos, setPedidos] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [cfgLoj, setCfgLoj] = useState(null);
  const [busca, setBusca] = useState('');
  const [verConfig, setVerConfig] = useState(false);
  const [verMov, setVerMov] = useState(false);
  const [historico, setHistorico] = useState(null);
  const [abertoId, setAbertoId] = useState(null);
  const [arrastando, setArrastando] = useState(null);
  const [soltando, setSoltando] = useState(null);
  const [movendoId, setMovendoId] = useState(null);

  async function carregar() {
    try { const { data } = await cifService.pedidos(); setPedidos(data.pedidos); }
    catch { setPedidos(p => p || []); }
  }
  useEffect(() => {
    cifService.quadroConfig().then(r => setCfg(r.data)).catch(() => {});
    cifService.lojinhaConfig().then(r => setCfgLoj(r.data)).catch(() => {});
    carregar();
    const t = setInterval(() => { if (!document.hidden) carregar(); }, 60000);
    return () => clearInterval(t);
  }, []);

  const lista = pedidos || [];
  const colunas = colunasCif(cfg);
  const colLoj = colunasLojinha(cfgLoj);
  const aberto = abertoId ? lista.find(p => p.id === abertoId) : null;
  const ativos = lista.filter(p => !colunas.find(c => c.status === p.cif_status)?.arquivada).length;
  // Nomes das colunas no histórico: Lojinha + CIF
  const nomeStatus = Object.fromEntries([...colLoj, ...colunas].map(c => [c.status, c.titulo]));
  const corStatus = Object.fromEntries([...colLoj, ...colunas].map(c => [c.status, 'bg-[var(--c-borda)] text-[var(--c-texto)]']));

  function podeSoltar(p, col) {
    if (!p || col.status === p.cif_status) return false;
    const atual = colunas.find(c => c.status === p.cif_status);
    if (Array.isArray(atual?.destinos) && !atual.destinos.includes(col.status)) return false;
    if (!botoes.mover_admin && (col.admin || atual?.admin)) return false;
    return true;
  }
  async function soltar(col) {
    const p = arrastando;
    setArrastando(null); setSoltando(null);
    if (!podeSoltar(p, col)) return;
    setMovendoId(p.id);
    try { await cifService.mover(p.id, col.status); }
    catch (e) { alert(e.response?.data?.erro || 'Erro ao mover.'); }
    finally { setMovendoId(null); carregar(); }
  }

  return (
    <FotosProvider servico={SERVICO_FOTOS}>
    <div className="space-y-5 xl:space-y-0 xl:flex xl:flex-col xl:gap-5 xl:h-[calc(100dvh-3.1rem)]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--c-texto)]"><NomeTela chave="logistica_cif" padrao="Garantia - Boxer Soldas" /></h1>
          <p className="text-sm text-[var(--c-suave)] mt-0.5">
            {ativos} pedido{ativos !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-suave)]" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente, CNPJ, nº, peça…"
              className="w-56 sm:w-64 pl-8 pr-7 py-2 rounded-xl text-xs bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto)] focus:outline-none focus:border-[var(--c-destaque)]" />
            {busca && <button onClick={() => setBusca('')} title="Limpar" className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={12} /></button>}
          </div>
          {botoes.movimentacao && (
            <button onClick={() => setVerMov(true)} title="Relatório de movimentação"
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto)] hover:border-[var(--c-destaque)] transition-colors">
              <Activity size={13} /> Movimentação
            </button>
          )}
        </div>
      </div>

      {!pedidos ? (
        <div className="flex justify-center py-16"><Spinner className="text-[var(--c-destaque)]" /></div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2 xl:flex-1 xl:min-h-0">
          {colunas.map(col => {
            const doStatus = lista.filter(p => p.cif_status === col.status && combinaBusca(p, busca));
            return (
              <Coluna key={col.status} col={col} total={doStatus.length} arquivada={col.arquivada && !busca}
                onConfigurar={botoes.configurar ? () => setVerConfig(col.status) : undefined}
                arraste={arrastando ? { pode: podeSoltar(arrastando, col), sobre: soltando === col.status } : null}
                onArrasteSobre={() => setSoltando(col.status)} onArrasteSai={() => setSoltando(s => (s === col.status ? null : s))}
                onSoltar={() => soltar(col)}>
                {doStatus.length === 0 ? (
                  <div className="border-2 border-dashed border-[var(--c-borda)] rounded-2xl py-8 text-center">
                    <p className="text-xs text-[var(--c-suave)]">{busca ? 'Nada encontrado' : 'Sem pedidos'}</p>
                  </div>
                ) : doStatus.map(p => (
                  <CardCif key={p.id} p={p} campos={cfg?.campos || []} movendo={movendoId === p.id} onAbrir={() => setAbertoId(p.id)}
                    onArrastar={() => setArrastando(p)} onFimArraste={() => { setArrastando(null); setSoltando(null); }} />
                ))}
              </Coluna>
            );
          })}
        </div>
      )}

      {aberto && (
        <CardAbertoCif p={aberto} cfg={cfg} cfgLoj={cfgLoj} colunas={colunas} colLoj={colLoj} botoes={botoes} carregar={carregar}
          onFechar={() => setAbertoId(null)}
          onConfigurarMover={botoes.configurar ? () => { setAbertoId(null); setVerConfig(aberto.cif_status); } : null}
          onHistorico={() => setHistorico({ id: aberto.id, nome: `Pedido ${aberto.numero_pedido} — ${aberto.cliente_nome}` })} />
      )}
      {verConfig && botoes.configurar && (
        <ConfigOrcamento servico={SERVICO_CONFIG} titulo="Configurações — Garantia - Boxer Soldas" semInicio
          colunaInicial={typeof verConfig === 'string' ? verConfig : null}
          onFechar={() => setVerConfig(false)} onSalvo={(data) => setCfg(data)} />
      )}
      {(verMov || historico) && (
        <PainelMovimentacao buscar={buscarMovimentos} nomeStatus={nomeStatus} corStatus={corStatus}
          titulo="Movimentação — Lojinha e Garantia" arquivo="movimentacao-logistica-cif" pedidoInicial={historico}
          onFechar={() => { setVerMov(false); setHistorico(null); }} />
      )}
    </div>
    </FotosProvider>
  );
}

// Card do quadro
function CardCif({ p, campos, movendo, onAbrir, onArrastar, onFimArraste }) {
  const parar = (e) => e.stopPropagation();
  const valores = p.cif_valores || {};
  return (
    <div onClick={onAbrir} title="Abrir pedido (segure e arraste para mudar de coluna)"
      draggable={!movendo}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(p.id)); onArrastar?.(); }}
      onDragEnd={() => onFimArraste?.()}
      className={`${movendo ? 'opacity-50 pointer-events-none ' : ''}p-3 rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] space-y-1.5 min-w-0 break-words cursor-pointer hover:border-[var(--c-borda-forte)] transition-colors`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono font-semibold text-sm text-[var(--c-texto)]">Pedido {p.numero_pedido}</span>
        <span className="text-[11px] text-[var(--c-suave)]" title="Entrou na Garantia">{fmtData(p.cif_entrou_em)}</span>
      </div>
      {p.zen_ordem_separacao_id && <div onClick={parar}><InfoLiberacao p={p} itens={Array.isArray(p.itens) ? p.itens : []} /></div>}
      <EtiquetasDoCard campos={campos} valorDe={(id) => valores[pref(id)]} />
      <div onClick={parar}><FaixaFotosCard pedido={p} onVerTodas={onAbrir} /></div>
      <DadosPedido p={p} />
    </div>
  );
}

// Card aberto: dados, fases da Lojinha e do CIF | fase atual | mover
function CardAbertoCif({ p, cfg, cfgLoj, colunas, colLoj, botoes = {}, carregar, onFechar, onHistorico, onConfigurarMover = null }) {
  const [editandoFase, setEditandoFase] = useState(() => new Set());
  const [abertas, setAbertas] = useState(() => new Set());
  const [rascunho, setRascunho] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [movendo, setMovendo] = useState(false);
  const [erro, setErro] = useState('');
  const norm = (s) => (s === 'liberacao' ? 'entrada' : s);
  // Fases por onde o pedido passou (histórico inteiro: Lojinha + CIF)
  const fasesPassadas = useFasesPassadas(() => cifService.movimentos({ pedido: p.id }), `${p.id}-${p.cif_status}`,
    p.cif_status, [...colLoj.map(c => c.status), ...colunas.map(c => c.status)], p.criado_em || p.created_at, norm);

  const atual = p.cif_status;
  const colAtual = colunas.find(c => c.status === atual);
  const idx = colunas.findIndex(c => c.status === atual);
  const valoresCif = p.cif_valores || {};
  const valorCif = (id) => (id in rascunho ? rascunho[id] : valoresCif[id]);
  const valorLoj = (id) => (p.campos || {})[id];
  const temFoto = (id) => (p.fotos_locais || []).some(f => f.campo === id);
  const sujo = Object.keys(rascunho).length > 0;
  const camposCif = cfg?.campos || [];
  const camposCifDe = (k) => camposCif.filter(c => c.coluna === k).map(campoCif);
  const camposLoj = cfgLoj?.campos || [];
  const camposLojDe = (k) => camposLoj.filter(c => c.coluna === k).map(campoDaConfig);
  const camposAtuais = camposCifDe(atual).filter(c => visivelAgora(c, valorCif));

  // Lojinha: fases por onde passou (só consulta) — inclui Finalizado
  const fasesLoj = colLoj
    .map(c => ({ col: c, campos: camposLojDe(c.status).filter(f => visivelAgora(f, valorLoj))
      .filter(f => valorLista(valorLoj(f.id)).length || (f.tipo === 'attachment' && temFoto(f.id))) }))
    .filter(g => fasesPassadas.passou(g.col.status) || g.col.status === 'finalizado' || g.campos.length);
  // CIF: fases anteriores (editáveis com o botão "Editar fases anteriores")
  const anteriores = colunas.filter(c => c.status !== atual)
    .map(c => {
      const editando = botoes.editar_fase && editandoFase.has(c.status);
      const todos = camposCifDe(c.status).filter(f => visivelAgora(f, valorCif));
      return { col: c, editando, todos, campos: editando ? todos : todos.filter(f => valorLista(valorCif(f.id)).length || (f.tipo === 'attachment' && temFoto(f.id))) };
    })
    .filter(g => fasesPassadas.passou(g.col.status))
    .filter(g => g.campos.length || (botoes.editar_fase && g.todos.length));

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') fechar(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  async function salvar() {
    if (!sujo) return true;
    setSalvando(true); setErro('');
    try { await cifService.editarCampos(p.id, rascunho); setRascunho({}); setEditandoFase(new Set()); await carregar(); return true; }
    catch (e) { setErro(e.response?.data?.erro || 'Erro ao salvar os campos.'); return false; }
    finally { setSalvando(false); }
  }
  function fechar() {
    if (sujo && !confirm('Há campos alterados sem salvar. Fechar mesmo assim?')) return;
    onFechar();
  }
  async function mover(status) {
    if (sujo && !(await salvar())) return;
    setMovendo(true); setErro('');
    try { await cifService.mover(p.id, status); await carregar(); }
    catch (e) { setErro(e.response?.data?.erro || 'Erro ao mover.'); }
    finally { setMovendo(false); }
  }

  const permitido = (c) => !Array.isArray(colAtual?.destinos) || colAtual.destinos.includes(c.status);
  const destinos = colunas.filter(c => c.status !== atual && permitido(c) && !(c.admin && !botoes.mover_admin) && !(colAtual?.admin && !botoes.mover_admin));
  const proxima = destinos.find(c => colunas.indexOf(c) > idx) || null;
  const outros = destinos.filter(c => c !== proxima);

  const blocoCampo = (c, editavel, valorDe = valorCif) => (
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
          {/* Esquerda: dados do pedido, fases da Lojinha e fases anteriores do CIF */}
          <div className="lg:w-[38%] lg:min-w-[340px] lg:overflow-y-auto border-b lg:border-b-0 lg:border-r border-[var(--c-borda)] p-5 space-y-4">
            <div className="pb-3 border-b border-[var(--c-borda)]">
              <p className="text-lg font-bold font-mono text-[var(--c-texto)]">Pedido {p.numero_pedido}</p>
              <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-[var(--c-borda)] text-[var(--c-suave)]">Lojinha Boxer → Garantia</span>
            </div>
            <div className="rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4 space-y-1.5">
              <p className="text-sm font-bold text-[var(--c-texto)] mb-1">Dados do pedido</p>
              <DadosPedido p={p} sempreProdutos />
              {p.zen_pedido_id && (
                <a href={`https://boxer.zenerp.app.br/sale/sale?q=id==${p.zen_pedido_id}`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-green-400 hover:underline">Pedido Zen #{p.zen_pedido_id} <ExternalLink size={10} /></a>
              )}
            </div>
            {fasesLoj.length > 0 && <p className="text-[10px] uppercase tracking-wide text-[var(--c-suave)] pt-1">Lojinha Boxer</p>}
            {fasesLoj.map(g => {
              const k = `loj-${g.col.status}`;
              const aberta = abertas.has(k);
              return (
                <CaixaFase key={k} titulo="" pilula={<Pilula col={g.col} />} tempo={fasesPassadas.tempo(g.col.status)}
                  aberta={aberta} onAlternar={() => alternar(k, aberta)}>
                  {g.campos.length
                    ? <dl className="flex flex-col gap-3">{g.campos.map(c => blocoCampo(c, false, valorLoj))}</dl>
                    : <p className="text-xs text-[var(--c-suave)]">Nenhum campo preenchido.</p>}
                </CaixaFase>
              );
            })}
            {anteriores.length > 0 && <p className="text-[10px] uppercase tracking-wide text-[var(--c-suave)] pt-1">Garantia</p>}
            {anteriores.map(g => {
              const k = `cif-${g.col.status}`;
              const aberta = abertas.has(k);
              return (
                <CaixaFase key={k} titulo="" pilula={<Pilula col={g.col} />} tempo={fasesPassadas.tempo(g.col.status)}
                  aberta={aberta} onAlternar={() => alternar(k, aberta)}
                  podeEditar={botoes.editar_fase} editando={g.editando}
                  onEditar={() => setEditandoFase(s => { const n = new Set(s); n.has(g.col.status) ? n.delete(g.col.status) : n.add(g.col.status); return n; })}>
                  {g.campos.length
                    ? <dl className="flex flex-col gap-3">{g.campos.map(c => blocoCampo(c, g.editando))}</dl>
                    : <p className="text-xs text-[var(--c-suave)]">Nenhum campo preenchido.</p>}
                </CaixaFase>
              );
            })}
          </div>

          {/* Meio: fase atual do CIF */}
          <div className="flex-1 min-w-0 lg:overflow-y-auto p-5 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-[var(--c-borda)]">
              <p className="text-sm font-bold text-[var(--c-texto)]">Fase atual</p>
              <Pilula col={colAtual} />
            </div>
            {erro && <p className="text-xs text-red-400">{erro}</p>}
            {camposAtuais.length
              ? <dl className="flex flex-col gap-4">{camposAtuais.map(c => blocoCampo(c, true))}</dl>
              : <p className="text-xs text-[var(--c-suave)] py-4">Esta coluna não tem campos para preencher.{botoes.configurar ? ' Crie em Configurar (engrenagem da coluna).' : ''}</p>}
            {sujo && (
              <div className="sticky bottom-0 flex items-center justify-end gap-2 py-2 bg-[var(--c-fundo)] border-t border-[var(--c-borda)]">
                <p className="flex-1 text-[11px] text-amber-400">Alterações não salvas.</p>
                <button onClick={() => setRascunho({})} className="px-3 py-1.5 rounded-lg text-xs text-[var(--c-suave)] hover:text-[var(--c-texto)]">Descartar</button>
                <button onClick={salvar} disabled={salvando}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--c-destaque)] text-white disabled:opacity-40">
                  {salvando ? <Spinner size={12} /> : <Check size={12} />} Salvar
                </button>
              </div>
            )}
          </div>

          {/* Direita: mover e histórico */}
          <div className="lg:w-[270px] shrink-0 lg:overflow-y-auto border-t lg:border-t-0 lg:border-l border-[var(--c-borda)] p-5 space-y-4 bg-[var(--c-superficie)]/40">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-[var(--c-texto)]">Mover pedido para</p>
              <button onClick={fechar} aria-label="Fechar" className="p-1 text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={18} /></button>
            </div>
            {proxima && botao(proxima, true)}
            {movendo && <p className="flex items-center gap-2 text-[11px] text-[var(--c-suave)]"><Spinner size={12} /> Movendo…</p>}
            {outros.length > 0 && <div className="space-y-1.5 pt-3 border-t border-[var(--c-borda)]">{outros.map(c => botao(c))}</div>}
            {!destinos.length && <p className="text-[11px] text-[var(--c-suave)]">Esta coluna não tem para onde mover.{botoes.configurar ? ' Crie colunas na engrenagem.' : ''}</p>}
            {onConfigurarMover && (
              <button onClick={onConfigurarMover} className="flex items-center gap-1.5 text-[11px] text-[var(--c-suave)] hover:text-[var(--c-destaque)]">
                <Settings size={12} /> Configurar colunas e campos
              </button>
            )}
            <div className="space-y-1.5 pt-3 border-t border-[var(--c-borda)]">
              <button onClick={onHistorico}
                className="w-full flex items-center gap-2 rounded-xl border border-[var(--c-borda)] px-3 py-2 text-xs font-semibold text-[var(--c-texto)] hover:bg-[var(--c-borda)]/40">
                <History size={13} /> <span className="flex-1 text-left">Histórico do pedido</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
