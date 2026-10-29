// ============================================================
// pages/operador/RecebimentoImportacao.jsx — Recebimento/Importação
// ============================================================
// Notas de entrada de importação (Zen) com peças. Cada peça é fotografada
// na chegada e comparada com a foto do catálogo (PMD):
//   Conferido = bate com o catálogo · Divergente = peça diferente.
// No celular: "Fotografar em sequência" passa item por item.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, RefreshCw, Search, Check, X, AlertTriangle, ImageOff, ChevronLeft, ChevronRight, Trash2, SkipForward, Package, FileText, RotateCcw, RotateCw, Save } from 'lucide-react';
import { recebimentoImportacaoService } from '../../services/api';
import { Spinner } from '../../components/ui';

const ZEN_APP_URL = 'https://boxer.zenerp.app.br';
const fmtData = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—');
const fmtQtd = (n) => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

const SITUACAO_NOTA = {
  pendente:     { label: 'Pendente',     cls: 'bg-[var(--c-borda)] text-[var(--c-suave)]' },
  em_andamento: { label: 'Em andamento', cls: 'bg-amber-500/15 text-amber-400' },
  concluida:    { label: 'Concluída',    cls: 'bg-green-500/15 text-green-400' },
};

// ── Imagem autenticada (busca com o token e guarda em cache) ──
const cacheImg = new Map(); // url -> objectURL | null (sem foto)
function ImagemAuth({ url, alt = '', className = '', vazio = null, onFalha, onClick }) {
  const [src, setSrc] = useState(() => cacheImg.get(url) ?? undefined);
  useEffect(() => {
    let vivo = true;
    if (!url) { setSrc(null); return undefined; }
    if (cacheImg.has(url)) { setSrc(cacheImg.get(url)); if (cacheImg.get(url) === null) onFalha?.(); return undefined; }
    setSrc(undefined);
    recebimentoImportacaoService.imagem(url)
      .then(({ data }) => { const o = URL.createObjectURL(data); cacheImg.set(url, o); if (vivo) setSrc(o); })
      .catch(() => { cacheImg.set(url, null); if (vivo) { setSrc(null); onFalha?.(); } });
    return () => { vivo = false; };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
  if (src === undefined) return <div className={`${className} flex items-center justify-center`}><Spinner size={14} className="text-[var(--c-suave)]" /></div>;
  if (src === null) return vazio;
  return <img src={src} alt={alt} onClick={onClick} className={`${className} object-contain${onClick ? ' cursor-zoom-in' : ''}`} />;
}

const urlCatalogo = (sku, tam) => `/recebimento-importacao/catalogo/${encodeURIComponent(sku)}/foto${tam ? `?tam=${tam}` : ''}`;
// v = versão da foto (muda quando a foto é girada, para não usar a imagem antiga do cache)
const versaoFoto = new Map(); // fotoId -> versão (cada vez que é girada)
const urlFoto = (id, tam, v = versaoFoto.get(id)) => {
  const q = [tam ? `tam=${tam}` : '', v ? `v=${v}` : ''].filter(Boolean).join('&');
  return `/recebimento-importacao/fotos/${id}${q ? `?${q}` : ''}`;
};

function SemFotoCatalogo({ className = '' }) {
  return (
    <div className={`${className} border-2 border-dashed border-[var(--c-borda-forte)] rounded-xl flex flex-col items-center justify-center text-center text-[10px] text-[var(--c-suave)] gap-0.5 p-1`}>
      <ImageOff size={14} /> sem foto no catálogo
    </div>
  );
}

// ── Redimensiona a foto no próprio aparelho antes de enviar ───
function lerImagem(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não consegui abrir a foto.')); };
    img.src = url;
  });
}
function redimensionar(img, max, qualidade) {
  const escala = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * escala);
  c.height = Math.round(img.naturalHeight * escala);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', qualidade);
}
// Gira a imagem (múltiplos de 90°) e devolve um Blob JPEG
function girarImagem(img, graus) {
  const g = ((graus % 360) + 360) % 360;
  const deitada = g === 90 || g === 270;
  const c = document.createElement('canvas');
  c.width = deitada ? img.naturalHeight : img.naturalWidth;
  c.height = deitada ? img.naturalWidth : img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((g * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return new Promise((ok, falha) => c.toBlob(b => (b ? ok(b) : falha(new Error('Não consegui girar a foto.'))), 'image/jpeg', 0.92));
}

async function prepararFoto(arquivo) {
  const img = await lerImagem(arquivo);
  return { imagem: redimensionar(img, 1280, 0.78), miniatura: redimensionar(img, 320, 0.7) };
}

function SituacaoItem({ item }) {
  if (item.situacao === 'conferido') return <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-green-500/15 text-green-400">Conferido</span>;
  if (item.situacao === 'divergente') return (
    <div>
      <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-red-500/15 text-red-400">Divergente</span>
      {item.observacao && <div className="text-[10px] text-[var(--c-suave)] mt-1 max-w-[180px] break-words">{item.observacao}</div>}
    </div>
  );
  return <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-[var(--c-borda)] text-[var(--c-suave)]">{item.fotos.length ? 'Fotografado' : 'Aguardando foto'}</span>;
}

// ============================================================
// Tela do item: foto do catálogo x fotos do recebimento
// ============================================================
function ModalItem({ nota, item, posicao, total, sequencia, onFechar, onSalvo, onProximo, onAnterior }) {
  const inputRef = useRef(null);
  const [fotos, setFotos] = useState(item.fotos);
  const [obs, setObs] = useState(item.observacao || '');
  const [usarNoCatalogo, setUsarNoCatalogo] = useState(false);
  const [semCatalogo, setSemCatalogo] = useState(item.foto_catalogo === false);
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState('');
  const [erro, setErro] = useState('');
  const [ampliada, setAmpliada] = useState(null); // { url, fotoId? } da foto aberta em tela cheia
  const [versao, setVersao] = useState({}); // fotoId -> nº de vezes que foi girada (recarrega a imagem)

  // Grava a foto do recebimento girada (substitui a foto e a miniatura)
  async function salvarGiro(fotoId, graus) {
    const { data } = await recebimentoImportacaoService.imagem(urlFoto(fotoId, undefined, versao[fotoId]));
    const original = await lerImagem(data);
    const girada = await lerImagem(await girarImagem(original, graus));
    await recebimentoImportacaoService.substituirFoto(fotoId, {
      imagem: redimensionar(girada, 1280, 0.85), miniatura: redimensionar(girada, 320, 0.7),
    });
    const nova = (versaoFoto.get(fotoId) || 0) + 1;
    versaoFoto.set(fotoId, nova);
    setVersao(v => ({ ...v, [fotoId]: nova }));
    onSalvo({ ...item, fotos }); // atualiza a miniatura na lista da nota
    setAmpliada(a => (a && a.fotoId === fotoId ? { ...a, url: urlFoto(fotoId, undefined, nova) } : a));
  }

  useEffect(() => {
    setFotos(item.fotos); setObs(item.observacao || ''); setUsarNoCatalogo(false);
    setSemCatalogo(item.foto_catalogo === false); setErro('');
  }, [item.item_erp_id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function aoEscolherFoto(e) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setErro(''); setEnviando(true);
    try {
      const { imagem, miniatura } = await prepararFoto(arquivo);
      const usar = semCatalogo && usarNoCatalogo;
      const { data } = await recebimentoImportacaoService.enviarFoto(item.item_erp_id, {
        nf_erp_id: nota.id, sku: item.sku, imagem, miniatura, usar_no_catalogo: usar,
      });
      const novas = [...fotos, data.id];
      setFotos(novas);
      if (usar) { cacheImg.delete(urlCatalogo(item.sku)); cacheImg.delete(urlCatalogo(item.sku, 'mini')); setSemCatalogo(false); }
      onSalvo({ ...item, fotos: novas, ...(usar ? { foto_catalogo: true } : {}) });
    } catch (err) {
      setErro(err.response?.data?.erro || err.message || 'Erro ao enviar a foto.');
    } finally { setEnviando(false); }
  }

  async function excluir(id) {
    if (!window.confirm('Excluir esta foto?')) return;
    try {
      await recebimentoImportacaoService.excluirFoto(id);
      const novas = fotos.filter(f => f !== id);
      setFotos(novas);
      onSalvo({ ...item, fotos: novas });
    } catch (err) { setErro(err.response?.data?.erro || 'Erro ao excluir a foto.'); }
  }

  async function marcar(situacao) {
    if (!fotos.length) { setErro('Tire pelo menos uma foto da peça antes.'); return; }
    if (situacao === 'divergente' && !obs.trim()) { setErro('Descreva a divergência na observação.'); return; }
    setErro(''); setSalvando(situacao);
    try {
      await recebimentoImportacaoService.marcarItem(item.item_erp_id, { nf_erp_id: nota.id, sku: item.sku, situacao, observacao: obs });
      onSalvo({ ...item, fotos, situacao, observacao: obs.trim() });
      if (sequencia) onProximo(); else onFechar();
    } catch (err) { setErro(err.response?.data?.erro || 'Erro ao salvar.'); }
    finally { setSalvando(''); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4" onClick={onFechar}>
      <div className="bg-[var(--c-fundo)] sm:bg-[var(--c-superficie)] sm:border sm:border-[var(--c-borda)] sm:rounded-2xl w-full sm:max-w-2xl max-h-[100dvh] overflow-y-auto flex flex-col"
           onClick={e => e.stopPropagation()}>
        {/* Topo */}
        <div className="px-4 pt-4 pb-3 border-b border-[var(--c-borda)] sticky top-0 bg-inherit z-10">
          <div className="flex items-center justify-between text-xs text-[var(--c-suave)]">
            <button onClick={onFechar} className="flex items-center gap-1 hover:text-[var(--c-texto)]"><ChevronLeft size={14} /> NF {nota.numero}</button>
            <div className="flex items-center gap-2">
              {sequencia && <button onClick={onAnterior} disabled={posicao <= 1} className="p-1 rounded hover:bg-[var(--c-borda)] disabled:opacity-30"><ChevronLeft size={14} /></button>}
              <span>Item {posicao} de {total}</span>
              {sequencia && <button onClick={onProximo} className="p-1 rounded hover:bg-[var(--c-borda)]"><ChevronRight size={14} /></button>}
              <button onClick={onFechar} className="p-1 rounded hover:bg-[var(--c-borda)]"><X size={14} /></button>
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--c-borda)] overflow-hidden mt-2">
            <div className="h-full bg-[var(--c-destaque)]" style={{ width: `${(posicao / Math.max(total, 1)) * 100}%` }} />
          </div>
        </div>

        <div className="p-4 space-y-4 flex-1">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-[var(--c-destaque-claro)]">{item.sku || 'sem SKU'}</span>
              <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-[var(--c-borda)] text-[var(--c-suave)]">Qtd {fmtQtd(item.quantidade)} {item.unidade}</span>
              {!item.no_catalogo && <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-[var(--c-borda)] text-[var(--c-suave)]">não está no catálogo</span>}
              <SituacaoItem item={{ ...item, fotos }} />
            </div>
            <div className="text-base font-bold text-[var(--c-texto)] mt-1">{item.descricao}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-semibold text-[var(--c-suave)] mb-1">CATÁLOGO (PMD)</div>
              {semCatalogo
                ? <SemFotoCatalogo className="w-full aspect-square" />
                : <ImagemAuth url={urlCatalogo(item.sku)} alt="Catálogo" onClick={() => setAmpliada({ url: urlCatalogo(item.sku) })} className="w-full aspect-square rounded-xl border border-[var(--c-borda)] bg-white"
                              vazio={<SemFotoCatalogo className="w-full aspect-square" />} onFalha={() => setSemCatalogo(true)} />}
            </div>
            <div>
              <div className="text-[10px] font-semibold text-[var(--c-suave)] mb-1">FOTO DO RECEBIMENTO</div>
              {fotos.length
                ? <ImagemAuth url={urlFoto(fotos[fotos.length - 1], undefined, versao[fotos[fotos.length - 1]])} alt="Recebimento" onClick={() => setAmpliada({ url: urlFoto(fotos[fotos.length - 1], undefined, versao[fotos[fotos.length - 1]]), fotoId: fotos[fotos.length - 1] })} className="w-full aspect-square rounded-xl border border-[var(--c-borda)] bg-black" />
                : (
                  <button onClick={() => inputRef.current?.click()} disabled={enviando}
                          className="w-full aspect-square rounded-xl border-2 border-dashed border-[var(--c-destaque)] bg-[var(--c-destaque)]/5 text-[var(--c-destaque-claro)] flex flex-col items-center justify-center gap-2 font-semibold text-sm">
                    {enviando ? <Spinner size={22} /> : <Camera size={28} />}
                    {enviando ? 'Enviando…' : 'Tirar foto'}
                  </button>
                )}
            </div>
          </div>

          {/* Miniaturas + outra foto */}
          {fotos.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {fotos.map(id => (
                <div key={id} className="relative">
                  <ImagemAuth url={urlFoto(id, 'mini', versao[id])} onClick={() => setAmpliada({ url: urlFoto(id, undefined, versao[id]), fotoId: id })} className="w-16 h-16 rounded-lg border border-[var(--c-borda)] bg-black" />
                  <button onClick={() => excluir(id)} title="Excluir foto"
                          className="absolute -top-1.5 -right-1.5 bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-full p-1 text-red-400 hover:bg-red-500/20">
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
              <button onClick={() => inputRef.current?.click()} disabled={enviando}
                      className="w-16 h-16 rounded-lg border-2 border-dashed border-[var(--c-destaque)] text-[var(--c-destaque-claro)] text-[10px] font-semibold flex flex-col items-center justify-center gap-0.5">
                {enviando ? <Spinner size={14} /> : <><Camera size={14} /> outra foto</>}
              </button>
            </div>
          )}

          {semCatalogo && item.sku && (
            <label className="flex gap-2 items-start rounded-xl border border-[var(--c-destaque)]/40 bg-[var(--c-destaque)]/10 px-3 py-2.5 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={usarNoCatalogo} onChange={e => setUsarNoCatalogo(e.target.checked)} />
              <span>
                <span className="text-sm font-semibold text-[var(--c-texto)]">Usar a próxima foto como foto do catálogo</span>
                <span className="block text-[11px] text-[var(--c-suave)]">Esta peça não tem foto no catálogo; a foto tirada passa a ser a foto dela.</span>
              </span>
            </label>
          )}

          <div>
            <div className="text-[11px] text-[var(--c-suave)] mb-1">Observação {item.situacao === 'divergente' || obs ? '' : '(obrigatória se for divergente)'}</div>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
                      placeholder="Ex.: peça diferente da foto, caixa amassada, quantidade menor…"
                      className="w-full rounded-xl bg-[var(--c-superficie)] border border-[var(--c-borda)] px-3 py-2 text-sm text-[var(--c-texto)] outline-none focus:border-[var(--c-destaque)]" />
          </div>

          {erro && <div className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 flex gap-1.5 items-start"><AlertTriangle size={13} className="shrink-0 mt-0.5" /> {erro}</div>}
        </div>

        {/* Ações */}
        <div className="p-4 pt-0 space-y-2 sticky bottom-0 bg-inherit pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button onClick={() => marcar('conferido')} disabled={!!salvando || enviando}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3 font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50">
            {salvando === 'conferido' ? <Spinner size={16} /> : <Check size={16} />} Confere com o catálogo{sequencia ? ' · Próximo' : ''}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => marcar('divergente')} disabled={!!salvando || enviando}
                    className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-red-400 border border-red-500/40 hover:bg-red-500/10 disabled:opacity-50">
              {salvando === 'divergente' ? <Spinner size={14} /> : <AlertTriangle size={14} />} Peça diferente
            </button>
            {sequencia
              ? <button onClick={onProximo} className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-[var(--c-texto)] border border-[var(--c-borda)] hover:bg-[var(--c-borda)]"><SkipForward size={14} /> Pular</button>
              : <button onClick={() => inputRef.current?.click()} disabled={enviando} className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-[var(--c-texto)] border border-[var(--c-borda)] hover:bg-[var(--c-borda)]"><Camera size={14} /> {fotos.length ? 'Outra foto' : 'Tirar foto'}</button>}
          </div>
        </div>

        <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={aoEscolherFoto} />
        {ampliada && <FotoAmpliada key={`${ampliada.url}-${versao[ampliada.fotoId] || 0}`} url={ampliada.url} onFechar={() => setAmpliada(null)}
                                   onSalvarGiro={ampliada.fotoId ? (g) => salvarGiro(ampliada.fotoId, g) : null} />}
      </div>
    </div>
  );
}

// Foto em tela cheia, com botões para girar (90° para cada lado).
// Foto do recebimento: "Salvar" grava a foto girada (vale para todos).
function FotoAmpliada({ url, onFechar, onSalvarGiro }) {
  const [graus, setGraus] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const deitada = Math.abs(graus / 90) % 2 === 1;
  const girado = ((graus % 360) + 360) % 360 !== 0;
  const girar = (e, d) => { e.stopPropagation(); setErro(''); setGraus(g => g + d); };
  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape') onFechar();
      else if (e.key === 'ArrowLeft') setGraus(g => g - 90);
      else if (e.key === 'ArrowRight') setGraus(g => g + 90);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onFechar]);
  async function salvar(e) {
    e.stopPropagation();
    setSalvando(true); setErro('');
    try { await onSalvarGiro(graus); }
    catch (err) { setErro(err.response?.data?.erro || err.message || 'Erro ao salvar a foto girada.'); setSalvando(false); }
  }
  const btn = 'p-2 rounded-full bg-white/10 text-white hover:bg-white/20';
  return (
    <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-3 overflow-hidden" onClick={onFechar}>
      <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
        <button title="Girar para a esquerda" onClick={e => girar(e, -90)} className={btn}><RotateCcw size={18} /></button>
        <button title="Girar para a direita" onClick={e => girar(e, 90)} className={btn}><RotateCw size={18} /></button>
        {onSalvarGiro && girado && (
          <button title="Salvar a foto girada" onClick={salvar} disabled={salvando}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-[var(--c-destaque)] text-white text-xs font-semibold disabled:opacity-50">
            {salvando ? <Spinner size={14} /> : <Save size={14} />} Salvar
          </button>
        )}
        <button title="Fechar" onClick={e => { e.stopPropagation(); onFechar(); }} className={btn}><X size={18} /></button>
      </div>
      {erro && <div className="absolute top-16 right-3 z-10 text-xs text-red-300 bg-black/70 rounded-lg px-3 py-2 max-w-xs" onClick={e => e.stopPropagation()}>{erro}</div>}
      <div onClick={e => e.stopPropagation()} style={{ transform: `rotate(${graus}deg)`, transition: 'transform .2s' }}>
        <ImagemAuth url={url} alt="Foto ampliada"
          className={`rounded-lg ${deitada ? 'max-w-[88dvh] max-h-[92vw]' : 'max-w-[calc(100vw-24px)] max-h-[92dvh]'}`} />
      </div>
    </div>
  );
}

// ============================================================
// Página
// ============================================================
export default function RecebimentoImportacao() {
  const [notas, setNotas] = useState([]);
  const [verificando, setVerificando] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erroLista, setErroLista] = useState('');
  const [busca, setBusca] = useState('');
  const [notaSel, setNotaSel] = useState(null);     // id
  const [detalhe, setDetalhe] = useState(null);     // { nota, itens }
  const [carregandoNota, setCarregandoNota] = useState(false);
  const [erroNota, setErroNota] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [modal, setModal] = useState(null);         // { idx, sequencia }
  const tentativas = useRef(0);

  async function carregarNotas({ silencioso = false } = {}) {
    if (!silencioso) setCarregando(true);
    setErroLista('');
    try {
      const { data } = await recebimentoImportacaoService.notas();
      setNotas(data.notas || []);
      setVerificando(data.verificando || 0);
    } catch (err) {
      setErroLista(err.response?.data?.erro || 'Erro ao buscar as notas no Zen.');
    } finally { setCarregando(false); }
  }
  useEffect(() => { carregarNotas(); }, []);
  // Ainda verificando notas novas no Zen? busca de novo (algumas vezes)
  useEffect(() => {
    if (!verificando || tentativas.current >= 6) return undefined;
    const t = setTimeout(() => { tentativas.current++; carregarNotas({ silencioso: true }); }, 1500);
    return () => clearTimeout(t);
  }, [verificando, notas]);

  async function abrirNota(id) {
    setNotaSel(id); setFiltro('todos'); setErroNota(''); setCarregandoNota(true);
    try {
      const { data } = await recebimentoImportacaoService.nota(id);
      setDetalhe(data);
    } catch (err) {
      setDetalhe(null);
      setErroNota(err.response?.data?.erro || 'Erro ao abrir a nota.');
    } finally { setCarregandoNota(false); }
  }

  // Atualiza um item (depois de foto/conferência) e o resumo da nota na lista
  function aoSalvarItem(novo) {
    setDetalhe(d => {
      if (!d) return d;
      const itens = d.itens.map(i => (i.item_erp_id === novo.item_erp_id ? { ...i, ...novo } : i));
      const fotografados = itens.filter(i => i.fotos.length).length;
      const conferidos = itens.filter(i => i.situacao === 'conferido').length;
      const divergentes = itens.filter(i => i.situacao === 'divergente').length;
      const situacao = conferidos + divergentes >= itens.length ? 'concluida' : (fotografados || conferidos || divergentes) ? 'em_andamento' : 'pendente';
      setNotas(ns => ns.map(n => (n.id === d.nota.id ? { ...n, fotografados, conferidos, divergentes, situacao } : n)));
      return { ...d, itens };
    });
  }

  const notasFiltradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return notas;
    return notas.filter(n => String(n.numero).includes(t) || String(n.fornecedor || '').toLowerCase().includes(t));
  }, [notas, busca]);

  const kpis = useMemo(() => ({
    pendentes: notas.filter(n => n.situacao !== 'concluida').length,
    aguardando: notas.reduce((s, n) => s + Math.max(0, n.itens_peca - n.conferidos - n.divergentes), 0),
    divergencias: notas.reduce((s, n) => s + n.divergentes, 0),
  }), [notas]);

  const itens = detalhe?.itens || [];
  const contagem = {
    todos: itens.length,
    aguardando: itens.filter(i => !i.situacao).length,
    conferido: itens.filter(i => i.situacao === 'conferido').length,
    divergente: itens.filter(i => i.situacao === 'divergente').length,
  };
  const itensFiltrados = itens.filter(i => filtro === 'todos' || (filtro === 'aguardando' ? !i.situacao : i.situacao === filtro));
  const feitos = contagem.conferido + contagem.divergente;

  // Sequência: percorre os itens ainda sem conferência, a partir do atual
  function abrirSequencia() {
    const idx = itens.findIndex(i => !i.situacao);
    setModal({ idx: idx === -1 ? 0 : idx, sequencia: true });
  }
  function proximo() {
    setModal(m => {
      if (!m) return m;
      const prox = itens.findIndex((i, k) => k > m.idx && !i.situacao);
      if (prox === -1) {
        const qualquer = itens.findIndex((i, k) => k !== m.idx && !i.situacao);
        return qualquer === -1 ? null : { ...m, idx: qualquer };
      }
      return { ...m, idx: prox };
    });
  }
  const anterior = () => setModal(m => (m && m.idx > 0 ? { ...m, idx: m.idx - 1 } : m));

  const notaResumo = notas.find(n => n.id === notaSel);

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--c-texto)]">Recebimento/Importação</h1>
          <p className="text-sm text-[var(--c-suave)] mt-0.5">Notas de entrada de importação com peças · fotografe cada item na chegada</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-suave)]" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar NF ou fornecedor"
                   className="w-full pl-8 pr-3 py-2 rounded-xl bg-[var(--c-superficie)] border border-[var(--c-borda)] text-sm text-[var(--c-texto)] outline-none focus:border-[var(--c-destaque)]" />
          </div>
          <button onClick={() => { tentativas.current = 0; carregarNotas(); if (notaSel) abrirNota(notaSel); }}
                  className="flex items-center gap-1.5 text-sm font-medium rounded-xl px-3 py-2 bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto)] hover:bg-[var(--c-borda)] whitespace-nowrap">
            <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} /> Atualizar do Zen
          </button>
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          ['Notas pendentes', kpis.pendentes, 'text-[var(--c-texto)]'],
          ['Peças aguardando conferência', kpis.aguardando, 'text-amber-400'],
          ['Divergências', kpis.divergencias, 'text-red-400'],
        ].map(([t, v, c]) => (
          <div key={t} className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] px-3 sm:px-4 py-2.5">
            <div className="text-[11px] sm:text-xs text-[var(--c-suave)] leading-tight">{t}</div>
            <div className={`text-xl font-extrabold ${c}`}>{carregando && !notas.length ? '—' : v}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* Lista de notas */}
        <div className={`w-full lg:w-80 shrink-0 space-y-2 ${notaSel ? 'hidden lg:block' : ''}`}>
          <div className="text-xs font-bold text-[var(--c-suave)]">NOTAS DE ENTRADA</div>
          {erroLista && <div className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{erroLista}</div>}
          {carregando && !notas.length && <div className="flex justify-center py-10"><Spinner size={24} className="text-[var(--c-destaque)]" /></div>}
          {verificando > 0 && (
            <div className="text-[11px] text-[var(--c-suave)] flex items-center gap-1.5"><Spinner size={11} /> Verificando {verificando} nota(s) no Zen…</div>
          )}
          {!carregando && !notasFiltradas.length && !erroLista && (
            <div className="border-2 border-dashed border-[var(--c-borda)] rounded-2xl py-8 text-center text-xs text-[var(--c-suave)]">Nenhuma nota de importação com peças.</div>
          )}
          {notasFiltradas.map(n => {
            const s = SITUACAO_NOTA[n.situacao] || SITUACAO_NOTA.pendente;
            const feitosN = n.conferidos + n.divergentes;
            return (
              <button key={n.id} onClick={() => abrirNota(n.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-colors ${notaSel === n.id ? 'border-[var(--c-destaque)] bg-[var(--c-destaque)]/10' : 'border-[var(--c-borda)] bg-[var(--c-superficie)] hover:border-[var(--c-borda-forte)]'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm text-[var(--c-texto)]">NF {n.numero}</span>
                  <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${s.cls}`}>{s.label}</span>
                </div>
                <div className="text-xs text-[var(--c-suave)] mt-0.5 truncate">{n.fornecedor || '—'}</div>
                <div className="flex items-center justify-between text-[11px] text-[var(--c-suave)] mt-1.5">
                  <span>{fmtData(n.data)} · {n.itens_peca} peça(s){n.divergentes ? <span className="text-red-400"> · {n.divergentes} diverg.</span> : null}</span>
                  <span className="flex items-center gap-1"><Camera size={11} /> {feitosN}/{n.itens_peca}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--c-borda)] overflow-hidden mt-1.5">
                  <div className={`h-full ${n.situacao === 'concluida' ? 'bg-green-500' : 'bg-[var(--c-destaque)]'}`} style={{ width: `${(feitosN / Math.max(n.itens_peca, 1)) * 100}%` }} />
                </div>
              </button>
            );
          })}
        </div>

        {/* Detalhe da nota */}
        <div className={`flex-1 min-w-0 w-full ${notaSel ? '' : 'hidden lg:block'}`}>
          {!notaSel && (
            <div className="border-2 border-dashed border-[var(--c-borda)] rounded-2xl py-16 text-center text-sm text-[var(--c-suave)]">
              <Package size={28} className="mx-auto mb-2 opacity-60" /> Escolha uma nota para ver as peças.
            </div>
          )}
          {notaSel && (
            <div className="rounded-2xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-3 sm:p-4 space-y-3">
              <button onClick={() => { setNotaSel(null); setDetalhe(null); }} className="lg:hidden flex items-center gap-1 text-xs text-[var(--c-suave)]">
                <ChevronLeft size={14} /> Notas
              </button>
              {carregandoNota && <div className="flex justify-center py-12"><Spinner size={24} className="text-[var(--c-destaque)]" /></div>}
              {erroNota && <div className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{erroNota}</div>}
              {detalhe && !carregandoNota && (
                <>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-bold text-[var(--c-texto)]">NF {detalhe.nota.numero}</h2>
                        {notaResumo && <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${(SITUACAO_NOTA[notaResumo.situacao] || SITUACAO_NOTA.pendente).cls}`}>{(SITUACAO_NOTA[notaResumo.situacao] || SITUACAO_NOTA.pendente).label}</span>}
                        {detalhe.nota.status_fiscal && <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-[var(--c-destaque)]/10 text-[var(--c-destaque-claro)]">Zen: {detalhe.nota.status_fiscal}</span>}
                      </div>
                      <div className="text-xs text-[var(--c-suave)] mt-0.5">
                        {detalhe.nota.fornecedor || '—'} · {fmtData(detalhe.nota.data)} · {itens.length} peça(s) de {detalhe.nota.total_itens} item(ns) da nota
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a href={`${ZEN_APP_URL}/fiscal/incomingInvoice.html?q=id==${detalhe.nota.id}`} target="_blank" rel="noreferrer"
                         className="flex items-center gap-1.5 text-xs font-semibold rounded-xl px-3 py-2 border border-[var(--c-borda)] text-[var(--c-texto)] hover:bg-[var(--c-borda)]">
                        <FileText size={13} /> Ver no Zen
                      </a>
                      {itens.length > 0 && (
                        <button onClick={abrirSequencia}
                                className="flex items-center gap-1.5 text-xs font-semibold rounded-xl px-3 py-2 bg-[var(--c-destaque)] hover:bg-[var(--c-destaque-h)] text-white">
                          <Camera size={13} /> Fotografar em sequência
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--c-borda)] overflow-hidden">
                      <div className="h-full bg-[var(--c-destaque)]" style={{ width: `${(feitos / Math.max(itens.length, 1)) * 100}%` }} />
                    </div>
                    <span className="text-xs text-[var(--c-suave)] whitespace-nowrap">{feitos} de {itens.length} conferidas</span>
                  </div>

                  {!detalhe.pmd_configurado && (
                    <div className="text-[11px] rounded-lg px-3 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-400">
                      As fotos do PMD ainda não estão ligadas — por enquanto aparecem só as fotos já gravadas no catálogo.
                    </div>
                  )}

                  <div className="flex gap-1.5 flex-wrap">
                    {[['todos', 'Todos'], ['aguardando', 'Aguardando'], ['conferido', 'Conferidos'], ['divergente', 'Divergentes']].map(([k, t]) => (
                      <button key={k} onClick={() => setFiltro(k)}
                              className={`text-[11px] font-semibold rounded-lg px-2 py-1 ${filtro === k ? 'bg-[var(--c-destaque)]/15 text-[var(--c-destaque-claro)]' : 'bg-[var(--c-borda)] text-[var(--c-suave)] hover:text-[var(--c-texto)]'}`}>
                        {t} ({contagem[k]})
                      </button>
                    ))}
                  </div>

                  {!itens.length && <div className="text-sm text-[var(--c-suave)] py-6 text-center">Esta nota não tem peças.</div>}

                  {/* Celular: cartões · Computador: tabela */}
                  <div className="space-y-2 md:hidden">
                    {itensFiltrados.map(i => {
                      const idx = itens.indexOf(i);
                      return (
                        <button key={i.item_erp_id} onClick={() => setModal({ idx, sequencia: false })}
                                className="w-full flex gap-3 items-center p-2.5 rounded-xl border border-[var(--c-borda)] bg-[var(--c-fundo)] text-left">
                          <ImagemAuth url={i.fotos.length ? urlFoto(i.fotos[i.fotos.length - 1], 'mini') : (i.foto_catalogo === false ? null : urlCatalogo(i.sku, 'mini'))}
                                      className="w-14 h-14 rounded-lg border border-[var(--c-borda)] bg-white shrink-0"
                                      vazio={<div className="w-14 h-14 rounded-lg border-2 border-dashed border-[var(--c-destaque)] text-[var(--c-destaque-claro)] flex items-center justify-center shrink-0"><Camera size={16} /></div>} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5"><span className="font-mono text-xs font-bold text-[var(--c-destaque-claro)]">{i.sku}</span><span className="text-[10px] text-[var(--c-suave)]">Qtd {fmtQtd(i.quantidade)}</span></div>
                            <div className="text-xs text-[var(--c-texto)] line-clamp-2">{i.descricao}</div>
                            <div className="mt-1"><SituacaoItem item={i} /></div>
                          </div>
                          <ChevronRight size={14} className="text-[var(--c-suave)] shrink-0" />
                        </button>
                      );
                    })}
                  </div>

                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] text-[var(--c-suave)] border-b border-[var(--c-borda)]">
                          <th className="text-left font-semibold py-2 px-2">SKU</th>
                          <th className="text-left font-semibold py-2 px-2">Descrição</th>
                          <th className="text-center font-semibold py-2 px-2">Qtd</th>
                          <th className="text-left font-semibold py-2 px-2">Foto catálogo (PMD)</th>
                          <th className="text-left font-semibold py-2 px-2">Foto recebimento</th>
                          <th className="text-left font-semibold py-2 px-2">Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itensFiltrados.map(i => {
                          const idx = itens.indexOf(i);
                          const abrir = () => setModal({ idx, sequencia: false });
                          return (
                            <tr key={i.item_erp_id} className="border-b border-[var(--c-borda)]/60 hover:bg-[var(--c-fundo)]/60 cursor-pointer" onClick={abrir}>
                              <td className="py-2 px-2 font-mono text-[var(--c-destaque-claro)] whitespace-nowrap">{i.sku}</td>
                              <td className="py-2 px-2 text-[var(--c-texto)]">
                                {i.descricao}
                                {!i.no_catalogo && <div className="mt-1"><span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-[var(--c-borda)] text-[var(--c-suave)]">não está no catálogo</span></div>}
                              </td>
                              <td className="py-2 px-2 text-center text-[var(--c-texto)]">{fmtQtd(i.quantidade)}</td>
                              <td className="py-2 px-2">
                                {i.foto_catalogo === false
                                  ? <SemFotoCatalogo className="w-16 h-16" />
                                  : <ImagemAuth url={urlCatalogo(i.sku, 'mini')} className="w-16 h-16 rounded-xl border border-[var(--c-borda)] bg-white" vazio={<SemFotoCatalogo className="w-16 h-16" />} />}
                              </td>
                              <td className="py-2 px-2">
                                {i.fotos.length
                                  ? (
                                    <div className="relative w-16 h-16">
                                      <ImagemAuth url={urlFoto(i.fotos[i.fotos.length - 1], 'mini')} className="w-16 h-16 rounded-xl border border-[var(--c-borda)]" />
                                      {i.fotos.length > 1 && <span className="absolute bottom-0.5 right-0.5 text-[9px] font-bold bg-black/70 text-white rounded px-1">+{i.fotos.length - 1}</span>}
                                    </div>
                                  )
                                  : (
                                    <div className="w-16 h-16 rounded-xl border-2 border-dashed border-[var(--c-destaque)] bg-[var(--c-destaque)]/5 text-[var(--c-destaque-claro)] text-[10px] font-semibold flex flex-col items-center justify-center gap-0.5">
                                      <Camera size={14} /> Tirar foto
                                    </div>
                                  )}
                              </td>
                              <td className="py-2 px-2"><SituacaoItem item={i} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {modal && detalhe && itens[modal.idx] && (
        <ModalItem
          nota={detalhe.nota}
          item={itens[modal.idx]}
          posicao={modal.idx + 1}
          total={itens.length}
          sequencia={modal.sequencia}
          onFechar={() => setModal(null)}
          onSalvo={aoSalvarItem}
          onProximo={proximo}
          onAnterior={anterior}
        />
      )}
    </div>
  );
}
