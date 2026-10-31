// ============================================================
// components/operador/CardAbertoOrcamento.jsx — Card aberto (igual ao Pipefy)
// ============================================================
// Abre ao clicar no card da tela de Orçamentos. Três partes:
//   esquerda: Formulário inicial + um bloco por fase anterior (só o preenchido)
//   meio    : fase atual — resumo (Zen, peças) e os campos para preencher
//   direita : mover o card (próxima fase em destaque) e ações
// Os campos ficam gravados só no B-Requisições (integração com o Pipefy desligada).
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { X, Settings, ArrowRight, ArrowLeft, Save, ExternalLink, History, Ban, PackageCheck, Scissors, RotateCcw } from 'lucide-react';
import { pedidosOrcamentoService } from '../../services/api';
import { Spinner } from '../ui';
import { FotosCampo } from './FotosOrcamento';
import { carregarEstrutura, montarGrupos, valorLista, Valor, Editor, SO_LEITURA } from './CamposCardOrcamento';
import { COLUNAS_ORCAMENTO, STATUS_SO_ADMIN } from '../../utils/fasesOrcamento';

const ehLargo = (c) => c.tipo === 'long_text' || c.tipo === 'attachment';

function formatarData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function Pilula({ coluna, grande = false }) {
  if (!coluna) return null;
  const cls = `inline-flex items-center rounded-md font-semibold ${grande ? 'px-2 py-0.5 text-xs' : 'px-1.5 py-0.5 text-[11px]'}`;
  return coluna.hex
    ? <span className={cls} style={{ background: `${coluna.hex}26`, color: coluna.hex }}>{coluna.titulo}</span>
    : <span className={`${cls} ${coluna.badge || ''}`}>{coluna.titulo}</span>;
}

export default function CardAbertoOrcamento({
  pedido, ehAdmin, podeEditar, onFechar, onAtualizar, resumo,
  // ações do card (mesmas regras do quadro)
  moverPara, avancar, proxima: proximaProp, mudando, movendoPara, podeAvancar, motivoSemAvancar,
  cancelar, cancelando, acoesZen, onHistorico, onConfigurarMover = null,
}) {
  const [fases, setFases] = useState(null);
  const [erro, setErro] = useState('');
  const [rascunho, setRascunho] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    carregarEstrutura().then(setFases).catch(e => setErro(e.response?.data?.erro || 'Não consegui ler os campos das fases.'));
  }, []);
  // Esc fecha
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') fechar(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const colunaAtual = COLUNAS_ORCAMENTO.find(c => c.status === pedido.status);
  const grupos = useMemo(() => (fases ? montarGrupos(fases, pedido, pedido.status, colunaAtual?.faseId) : []),
    [fases, pedido, colunaAtual?.faseId]);

  const doPipefy = useMemo(() => Object.fromEntries((Array.isArray(pedido.pipefy_campos) ? pedido.pipefy_campos : [])
    .filter(c => c?.id).map(c => [c.id, c.valor])), [pedido.pipefy_campos]);
  const editados = pedido.campos_editados || {};
  const valorDe = (id) => (id in rascunho ? rascunho[id] : id in editados ? editados[id] : doPipefy[id]);
  const temValor = (id) => valorLista(valorDe(id)).length > 0;
  const fotosLocais = (id) => (pedido.fotos_locais || []).some(f => f.campo === id);
  const sujo = Object.keys(rascunho).length > 0;

  // Meio: grupos da coluna atual; esquerda: os outros, na ordem das colunas (Formulário inicial primeiro)
  const atuais = grupos.filter(g => g.atual);
  const ordemCol = (k) => (k === 'inicio' ? -1 : k ? COLUNAS_ORCAMENTO.findIndex(c => c.status === k) : 999);
  const anteriores = grupos.filter(g => !g.atual)
    .map(g => ({ ...g, campos: g.campos.filter(c => temValor(c.id) || (c.tipo === 'attachment' && fotosLocais(c.id))) }))
    .filter(g => g.campos.length)
    .sort((a, b) => ordemCol(a.chave) - ordemCol(b.chave));
  const camposAtuais = atuais.flatMap(g => g.campos);

  async function salvar() {
    if (!sujo) return true;
    setSalvando(true); setErro('');
    try {
      const { data } = await pedidosOrcamentoService.editarCampos(pedido.id, rascunho);
      const pf = data?.pipefy;
      const linhas = [];
      if (pf?.gravados?.length) linhas.push({ ok: true, txt: `Gravado no Pipefy: ${pf.gravados.join(', ')}.` });
      if (pf?.so_local?.length) linhas.push({ ok: false, txt: `Só no B-Requisições: ${pf.so_local.join(', ')}.` });
      for (const e of pf?.erros || []) linhas.push({ ok: false, txt: `Pipefy recusou "${e.campo}": ${e.erro}. Ficou só no B-Requisições.` });
      setAviso(linhas.length ? linhas : [{ ok: true, txt: 'Campos salvos.' }]);
      setRascunho({});
      onAtualizar?.();
      return true;
    } catch (e) { setErro(e.response?.data?.erro || 'Erro ao salvar os campos.'); return false; }
    finally { setSalvando(false); }
  }
  function fechar() {
    if (sujo && !confirm('Há campos alterados sem salvar. Fechar mesmo assim?')) return;
    onFechar?.();
  }
  // Antes de mover, grava o que foi preenchido
  async function mover(fn) {
    if (sujo && !(await salvar())) return;
    fn();
  }

  // Botões de mover (direita)
  const idxAtual = COLUNAS_ORCAMENTO.findIndex(c => c.status === pedido.status);
  let proxima = proximaProp;
  // Configurar → "Pode mover cards desta coluna para" (sem lista = todas)
  const permitido = (c) => !Array.isArray(colunaAtual?.destinos) || colunaAtual.destinos.includes(c.status);
  if (proxima && !permitido(proxima)) proxima = null;
  const destinos = ehAdmin
    ? COLUNAS_ORCAMENTO.filter(c => c.status !== pedido.status && permitido(c))
    : [];
  const destaque = proxima
    ? null
    : destinos.find(c => COLUNAS_ORCAMENTO.indexOf(c) > idxAtual) || null;
  const outros = destinos.filter(c => c !== destaque && c.status !== proxima?.status);
  const ocupado = mudando || movendoPara || salvando;
  const podeMoverAqui = !(STATUS_SO_ADMIN.includes(pedido.status) && !ehAdmin);

  const blocoCampo = (c, editavel) => (
    <div key={c.id} className={`min-w-0 ${ehLargo(c) ? 'sm:col-span-2' : ''}`}>
      <dt className="text-xs font-semibold text-[var(--c-texto)] flex items-center gap-1">
        {c.obrigatorio && <span className="text-red-400">*</span>}{c.rotulo}
        {c.id in editados && !(c.id in rascunho) && <span title="Editado no B-Requisições" className="text-[10px] font-normal text-amber-400">(editado)</span>}
        {editavel && c.id in editados && !(c.id in rascunho) && (
          <button title="Desfazer a edição local" onClick={() => setRascunho(r => ({ ...r, [c.id]: '' }))}
            className="text-[var(--c-suave)] hover:text-[var(--c-texto)]"><RotateCcw size={10} /></button>
        )}
      </dt>
      {c.descricao && <p className="text-[11px] text-[var(--c-suave)]">{c.descricao}</p>}
      <dd className="text-xs text-[var(--c-texto)] mt-1">
        {c.tipo === 'attachment'
          ? <FotosCampo pedido={pedido} campo={c} valor={valorDe(c.id)} podeEnviar={podeEditar} onMudou={onAtualizar} />
          : editavel && !SO_LEITURA.includes(c.tipo)
          ? <Editor campo={c} valor={valorDe(c.id)} onChange={v => setRascunho(r => ({ ...r, [c.id]: v }))} />
          : <Valor campo={c} valor={valorDe(c.id)} />}
      </dd>
    </div>
  );

  const botaoMover = (c, principal = false) => {
    const antes = COLUNAS_ORCAMENTO.indexOf(c) < idxAtual;
    return (
      <button key={c.status} onClick={() => mover(() => moverPara(c.status))} disabled={ocupado}
        className={`w-full flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold text-left transition-colors disabled:opacity-40 ${
          principal ? 'border-[var(--c-destaque)]/50 bg-[var(--c-destaque)]/15 text-[var(--c-destaque)] hover:bg-[var(--c-destaque)]/25'
          : 'border-[var(--c-borda)] text-[var(--c-texto)] hover:border-[var(--c-borda-forte)] hover:bg-[var(--c-borda)]/40'}`}>
        {!principal && antes && <ArrowLeft size={13} className="shrink-0 text-[var(--c-suave)]" />}
        <span className="flex-1 truncate">{c.titulo}</span>
        {(principal || !antes) && <ArrowRight size={13} className="shrink-0" />}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-2 sm:p-4" onClick={fechar}>
      <div className="w-full max-w-[1320px] h-full max-h-[94dvh] flex flex-col bg-[var(--c-fundo)] border border-[var(--c-borda)] rounded-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">

          {/* ── Esquerda: Formulário inicial e fases anteriores ── */}
          <div className="lg:w-[38%] lg:min-w-[340px] lg:overflow-y-auto border-b lg:border-b-0 lg:border-r border-[var(--c-borda)] p-5 space-y-4">
            <div className="pb-3 border-b border-[var(--c-borda)]">
              <p className="text-lg font-bold text-[var(--c-texto)] break-words">{pedido.cliente_nome || pedido.referencia}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-[var(--c-borda)] text-[var(--c-suave)]">Orçamento</span>
                {pedido.pipefy_card_id
                  ? <span className="text-[10px] font-semibold text-[var(--c-destaque)] bg-[var(--c-destaque)]/10 rounded px-1.5 py-0.5">Pipefy #{pedido.pipefy_card_id}</span>
                  : <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-500/15 rounded px-1.5 py-0.5">Criado no B-Requisições</span>}
                {pedido.aprovacao && <span className="text-[10px] font-bold uppercase rounded px-1.5 py-0.5 text-[var(--c-texto)] bg-[var(--c-borda)]">{pedido.aprovacao}</span>}
              </div>
              <p className="text-[11px] text-[var(--c-suave)] mt-1.5">Criado em {formatarData(pedido.created_at)} · por {pedido.criado_por_nome || '—'}</p>
            </div>

            {!fases && !erro && <div className="flex justify-center py-10"><Spinner className="text-[var(--c-destaque)]" /></div>}
            {fases && !anteriores.length && <p className="text-xs text-[var(--c-suave)]">Nenhum campo preenchido nas fases anteriores.</p>}
            {anteriores.map(g => {
              const col = g.chave && g.chave !== 'inicio' ? COLUNAS_ORCAMENTO.find(c => c.status === g.chave) : null;
              return (
                <div key={g.faseId} className="rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-sm font-bold text-[var(--c-texto)] flex-1">{g.chave === 'inicio' ? 'Formulário inicial' : col ? 'Fase' : g.nome}</p>
                    {col && <Pilula coluna={col} />}
                  </div>
                  <dl className="grid grid-cols-1 gap-y-3">{g.campos.map(c => blocoCampo(c, false))}</dl>
                </div>
              );
            })}
          </div>

          {/* ── Meio: fase atual ── */}
          <div className="flex-1 min-w-0 lg:overflow-y-auto p-5 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-[var(--c-borda)]">
              <p className="text-sm font-bold text-[var(--c-texto)]">Fase atual</p>
              <Pilula coluna={colunaAtual} grande />
              {pedido.pipefy_url && (
                <a href={pedido.pipefy_url} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-[11px] text-[var(--c-suave)] hover:text-[var(--c-destaque)]">
                  Abrir no Pipefy <ExternalLink size={11} />
                </a>
              )}
            </div>

            {resumo}

            {erro && <p className="text-xs text-red-400">{erro}</p>}
            {aviso && !sujo && (
              <div className="rounded-lg border border-[var(--c-borda)] p-2 space-y-0.5">
                {aviso.map((l, i) => <p key={i} className={`text-[11px] ${l.ok ? 'text-green-400' : 'text-amber-400'}`}>{l.txt}</p>)}
              </div>
            )}
            {fases && (camposAtuais.length
              ? <dl className="grid grid-cols-1 gap-y-4">{camposAtuais.map(c => blocoCampo(c, ehAdmin))}</dl>
              : <p className="text-xs text-[var(--c-suave)] py-4">Esta coluna não tem campos para preencher.</p>)}

            {sujo && (
              <div className="sticky bottom-0 flex items-center justify-end gap-2 py-2 bg-[var(--c-fundo)] border-t border-[var(--c-borda)]">
                <p className="flex-1 text-[11px] text-amber-400">Alterações não salvas.</p>
                <button onClick={() => setRascunho({})} className="px-3 py-1.5 rounded-lg text-xs text-[var(--c-suave)] hover:text-[var(--c-texto)]">Descartar</button>
                <button onClick={salvar} disabled={salvando}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--c-destaque)] text-white disabled:opacity-40">
                  {salvando ? <Spinner size={12} /> : <Save size={12} />} Salvar
                </button>
              </div>
            )}
          </div>

          {/* ── Direita: mover e ações ── */}
          <div className="lg:w-[270px] shrink-0 lg:overflow-y-auto border-t lg:border-t-0 lg:border-l border-[var(--c-borda)] p-5 space-y-4 bg-[var(--c-superficie)]/40">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-[var(--c-texto)]">Mover card para fase</p>
              <button onClick={fechar} aria-label="Fechar" className="p-1 text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={18} /></button>
            </div>

            {podeEditar && proxima && podeMoverAqui && (podeAvancar
              ? <button onClick={() => mover(avancar)} disabled={ocupado}
                  className="w-full flex items-center gap-2 rounded-xl border border-[var(--c-destaque)]/50 bg-[var(--c-destaque)]/15 px-3 py-2 text-xs font-semibold text-[var(--c-destaque)] hover:bg-[var(--c-destaque)]/25 disabled:opacity-40">
                  <span className="flex-1 text-left">{mudando ? (proxima.status === 'separando' ? 'Criando pedido no Zen…' : 'Movendo…') : proxima.titulo}</span>
                  <ArrowRight size={13} />
                </button>
              : <p className="text-[11px] rounded-xl border border-[var(--c-borda)] px-3 py-2 text-[var(--c-suave)]">{motivoSemAvancar}</p>)}
            {destaque && botaoMover(destaque, true)}
            {movendoPara && <p className="flex items-center gap-2 text-[11px] text-[var(--c-suave)]"><Spinner size={12} /> Movendo…</p>}

            {outros.length > 0 && (
              <div className="space-y-1.5 pt-3 border-t border-[var(--c-borda)]">
                {outros.map(c => botaoMover(c))}
              </div>
            )}
            {!ehAdmin && !proxima && (
              <p className="text-[11px] text-[var(--c-suave)]">Só o administrador move este card.</p>
            )}
            {ehAdmin && !proxima && !destaque && !outros.length && (
              <p className="text-[11px] text-[var(--c-suave)]">Esta coluna não tem para onde mover.</p>
            )}
            {onConfigurarMover && (
              <button onClick={onConfigurarMover} className="flex items-center gap-1.5 text-[11px] text-[var(--c-suave)] hover:text-[var(--c-destaque)]">
                <Settings size={12} /> Configurar mover cards
              </button>
            )}

            {(acoesZen?.length > 0 || podeEditar || onHistorico) && (
              <div className="space-y-1.5 pt-3 border-t border-[var(--c-borda)]">
                {acoesZen?.map(a => (
                  <button key={a.id} onClick={a.onClick} disabled={a.ocupado}
                    className={`w-full flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-40 ${
                      a.alerta ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25' : 'border border-[var(--c-borda)] text-[var(--c-texto)] hover:bg-[var(--c-borda)]/40'}`}>
                    {a.id === 'retirar' ? <Scissors size={13} /> : <PackageCheck size={13} />}
                    <span className="flex-1 text-left">{a.ocupado ? a.textoOcupado : a.texto}</span>
                  </button>
                ))}
                {onHistorico && (
                  <button onClick={onHistorico}
                    className="w-full flex items-center gap-2 rounded-xl border border-[var(--c-borda)] px-3 py-2 text-xs font-semibold text-[var(--c-texto)] hover:bg-[var(--c-borda)]/40">
                    <History size={13} /> <span className="flex-1 text-left">Histórico do card</span>
                  </button>
                )}
                {podeEditar && (
                  <button onClick={cancelar} disabled={cancelando}
                    className="w-full flex items-center gap-2 rounded-xl border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-40">
                    <Ban size={13} /> <span className="flex-1 text-left">{cancelando ? 'Cancelando…' : 'Cancelar pedido'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
