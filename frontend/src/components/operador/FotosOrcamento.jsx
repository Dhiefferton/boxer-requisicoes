// ============================================================
// components/operador/FotosOrcamento.jsx — Fotos do card de orçamento
// ============================================================
// Mostra as fotos anexadas no Pipefy (campos de anexo) e as fotos
// adicionadas no B-Requisições. As fotos adicionadas aqui ficam SÓ no
// B-Requisições (não são enviadas para o Pipefy).
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { Camera, X, Paperclip, ImageOff, Trash2 } from 'lucide-react';
import { pedidosOrcamentoService } from '../../services/api';
import { Spinner } from '../ui';

// Lista de um valor do Pipefy (texto ou JSON '["url1","url2"]')
function lista(v) {
  if (v === null || v === undefined || v === '') return [];
  const s = String(v).trim();
  if (s.startsWith('[')) { try { const a = JSON.parse(s); if (Array.isArray(a)) return a.map(String).filter(Boolean); } catch { /* texto */ } }
  return [s];
}
export const ehImagem = (url) => /\.(jpe?g|png|webp|gif|bmp)(\?|$)/i.test(String(url || '').split('#')[0]);
const nomeArquivo = (url) => { try { return decodeURIComponent(new URL(url).pathname.split('/').pop() || url); } catch { return url; } };
const urlLocal = (id, tam) => `/pedidos-orcamento/fotos/${id}${tam ? `?tam=${tam}` : ''}`;

// Todas as fotos de um card: as do Pipefy (anexos com imagem) + as do B-Requisições
export function fotosDoCard(pedido, campoId = null) {
  const campos = Array.isArray(pedido?.pipefy_campos) ? pedido.pipefy_campos : [];
  const editados = pedido?.campos_editados || {};
  const pipefy = [];
  for (const c of campos) {
    if (!c?.id || (campoId && c.id !== campoId)) continue;
    const valor = c.id in editados ? editados[c.id] : c.valor;
    for (const u of lista(valor)) if (/^https?:\/\//.test(u) && ehImagem(u)) pipefy.push({ tipo: 'pipefy', url: u, campo: c.id });
  }
  const locais = (Array.isArray(pedido?.fotos_locais) ? pedido.fotos_locais : [])
    .filter(f => !campoId || f.campo === campoId).map(f => ({ tipo: 'local', id: f.id, campo: f.campo }));
  return [...pipefy, ...locais];
}

// ── Imagem autenticada (fotos do B-Requisições) ─────────────
const cacheImg = new Map();
function ImagemAuth({ url, className = '', onClick, alt = '' }) {
  const [src, setSrc] = useState(() => cacheImg.get(url));
  useEffect(() => {
    let vivo = true;
    if (cacheImg.has(url)) { setSrc(cacheImg.get(url)); return undefined; }
    setSrc(undefined);
    pedidosOrcamentoService.imagem(url)
      .then(({ data }) => { const o = URL.createObjectURL(data); cacheImg.set(url, o); if (vivo) setSrc(o); })
      .catch(() => { cacheImg.set(url, null); if (vivo) setSrc(null); });
    return () => { vivo = false; };
  }, [url]);
  if (src === undefined) return <div className={`${className} flex items-center justify-center`}><Spinner size={12} className="text-[var(--c-suave)]" /></div>;
  if (src === null) return <div className={`${className} flex items-center justify-center text-[var(--c-suave)]`}><ImageOff size={14} /></div>;
  return <img src={src} alt={alt} onClick={onClick} className={`${className} object-cover${onClick ? ' cursor-zoom-in' : ''}`} />;
}

// Miniatura de uma foto (Pipefy ou local)
function Miniatura({ foto, className, onClick }) {
  const [falhou, setFalhou] = useState(false);
  if (foto.tipo === 'local') return <ImagemAuth url={urlLocal(foto.id, 'mini')} className={className} onClick={onClick} />;
  if (falhou) return <a href={foto.url} target="_blank" rel="noreferrer" title="Abrir no Pipefy" className={`${className} flex items-center justify-center text-[var(--c-suave)]`}><ImageOff size={14} /></a>;
  return <img src={foto.url} alt="" loading="lazy" onError={() => setFalhou(true)} onClick={onClick} className={`${className} object-cover cursor-zoom-in`} />;
}

// ── Foto ampliada ───────────────────────────────────────────
export function FotoAmpliada({ fotos, inicio = 0, onFechar, podeExcluir, onExcluir }) {
  const [i, setI] = useState(inicio);
  const foto = fotos[i];
  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape') onFechar();
      if (e.key === 'ArrowRight') setI(n => Math.min(fotos.length - 1, n + 1));
      if (e.key === 'ArrowLeft') setI(n => Math.max(0, n - 1));
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [fotos.length, onFechar]);
  if (!foto) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-black/85 flex flex-col items-center justify-center p-3" onClick={onFechar}>
      <div className="flex items-center gap-2 mb-2 text-xs text-white/80" onClick={e => e.stopPropagation()}>
        <span>{i + 1} de {fotos.length} · {foto.tipo === 'local' ? 'adicionada no B-Requisições' : 'anexo do Pipefy'}</span>
        {foto.tipo === 'pipefy' && <a href={foto.url} target="_blank" rel="noreferrer" className="underline">abrir original</a>}
        {foto.tipo === 'local' && podeExcluir && (
          <button onClick={() => onExcluir?.(foto)} className="flex items-center gap-1 text-red-300 hover:text-red-200"><Trash2 size={12} /> excluir</button>
        )}
        <button onClick={onFechar} className="ml-2 p-1 text-white/80 hover:text-white"><X size={16} /></button>
      </div>
      <div className="flex items-center gap-2 max-w-full" onClick={e => e.stopPropagation()}>
        <button disabled={i === 0} onClick={() => setI(n => n - 1)} className="px-2 py-6 text-white/70 hover:text-white disabled:opacity-20 text-2xl">‹</button>
        {foto.tipo === 'local'
          ? <ImagemAuth url={urlLocal(foto.id)} className="max-h-[80dvh] max-w-[85vw] !object-contain rounded-lg" />
          : <img src={foto.url} alt="" className="max-h-[80dvh] max-w-[85vw] object-contain rounded-lg" />}
        <button disabled={i === fotos.length - 1} onClick={() => setI(n => n + 1)} className="px-2 py-6 text-white/70 hover:text-white disabled:opacity-20 text-2xl">›</button>
      </div>
    </div>
  );
}

// ── Reduz a foto no aparelho antes de enviar ────────────────
function lerImagem(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não consegui abrir a foto.')); };
    img.src = url;
  });
}
function reduzir(img, max, qualidade) {
  const escala = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * escala);
  c.height = Math.round(img.naturalHeight * escala);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', qualidade);
}

// ── Campo de fotos (dentro dos campos do card) ──────────────
// valor = valor do campo de anexo no Pipefy; arquivos que não são imagem viram link.
export function FotosCampo({ pedido, campo, valor, podeEnviar, onMudou }) {
  const [ampliada, setAmpliada] = useState(null);
  const [enviando, setEnviando] = useState(0);
  const [erro, setErro] = useState('');
  const input = useRef(null);
  const fotos = fotosDoCard(pedido, campo.id);
  const outros = lista(valor).filter(u => /^https?:\/\//.test(u) && !ehImagem(u));

  async function enviar(arquivos) {
    setErro('');
    const lista = [...(arquivos || [])].filter(a => a.type.startsWith('image/'));
    if (!lista.length) return;
    setEnviando(lista.length);
    try {
      for (const a of lista) {
        const img = await lerImagem(a);
        await pedidosOrcamentoService.enviarFoto(pedido.id, {
          campo_id: campo.id, imagem: reduzir(img, 1280, 0.75), miniatura: reduzir(img, 320, 0.7),
        });
        setEnviando(n => n - 1);
      }
      onMudou?.();
    } catch (e) { setErro(e.response?.data?.erro || e.message || 'Erro ao enviar a foto.'); onMudou?.(); }
    finally { setEnviando(0); if (input.current) input.current.value = ''; }
  }
  async function excluir(foto) {
    if (!confirm('Excluir esta foto do B-Requisições?')) return;
    try { await pedidosOrcamentoService.excluirFoto(foto.id); setAmpliada(null); onMudou?.(); }
    catch (e) { alert(e.response?.data?.erro || 'Erro ao excluir a foto.'); }
  }

  return (
    <div className="space-y-1.5">
      {(fotos.length > 0 || podeEnviar) && (
        <div className="flex flex-wrap gap-1.5">
          {fotos.map((f, i) => (
            <div key={f.tipo === 'local' ? `l${f.id}` : f.url} className="relative">
              <Miniatura foto={f} className="w-16 h-16 rounded-lg border border-[var(--c-borda)] bg-black" onClick={() => setAmpliada(i)} />
              {f.tipo === 'local' && <span title="Adicionada no B-Requisições" className="absolute bottom-0.5 left-0.5 text-[8px] font-bold px-1 rounded bg-[var(--c-destaque)] text-white">B-REQ</span>}
            </div>
          ))}
          {podeEnviar && (
            <button onClick={() => input.current?.click()} disabled={enviando > 0} title="Adicionar foto (fica só no B-Requisições)"
              className="w-16 h-16 rounded-lg border-2 border-dashed border-[var(--c-borda)] text-[var(--c-suave)] hover:text-[var(--c-destaque)] hover:border-[var(--c-destaque)] flex flex-col items-center justify-center gap-0.5 text-[10px] disabled:opacity-50">
              {enviando > 0 ? <><Spinner size={14} /> {enviando}</> : <><Camera size={16} /> Foto</>}
            </button>
          )}
          <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={e => enviar(e.target.files)} />
        </div>
      )}
      {!fotos.length && !podeEnviar && !outros.length && <span className="text-[var(--c-suave)]">—</span>}
      {outros.map((u, i) => (
        <a key={i} href={u} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[var(--c-destaque)] hover:underline break-all"><Paperclip size={11} />{nomeArquivo(u)}</a>
      ))}
      {erro && <p className="text-[11px] text-red-400">{erro}</p>}
      {ampliada !== null && <FotoAmpliada fotos={fotos} inicio={ampliada} onFechar={() => setAmpliada(null)} podeExcluir={podeEnviar} onExcluir={excluir} />}
    </div>
  );
}

// ── Faixa de fotos no card do quadro ────────────────────────
export function FaixaFotosCard({ pedido, onVerTodas }) {
  const [ampliada, setAmpliada] = useState(null);
  const fotos = fotosDoCard(pedido);
  if (!fotos.length) return null;
  const mostrar = fotos.slice(0, 4);
  return (
    <div className="flex items-center gap-1">
      {mostrar.map((f, i) => (
        <Miniatura key={f.tipo === 'local' ? `l${f.id}` : f.url} foto={f} className="w-11 h-11 rounded-md border border-[var(--c-borda)] bg-black" onClick={() => setAmpliada(i)} />
      ))}
      {fotos.length > mostrar.length && (
        <button onClick={() => setAmpliada(mostrar.length)} className="w-11 h-11 rounded-md border border-[var(--c-borda)] text-[11px] font-semibold text-[var(--c-suave)] hover:text-[var(--c-texto)]">+{fotos.length - mostrar.length}</button>
      )}
      {onVerTodas && <button onClick={onVerTodas} title="Ver/adicionar fotos nos campos do card" className="ml-1 p-1 text-[var(--c-suave)] hover:text-[var(--c-destaque)]"><Camera size={14} /></button>}
      {ampliada !== null && <FotoAmpliada fotos={fotos} inicio={ampliada} onFechar={() => setAmpliada(null)} />}
    </div>
  );
}
