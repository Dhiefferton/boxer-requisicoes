// ============================================================
// pages/operador/InventarioContagem.jsx — Contagem no celular
// Lê o QR code (câmera, leitor de código ou digitando), mostra o item
// e registra a quantidade. Contagem às cegas: o saldo do Zen não aparece.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, CameraOff, Check, List, Minus, Plus, ScanLine, Timer, X, MapPin, SkipForward, Navigation, Barcode } from 'lucide-react';
import { inventarioService } from '../../services/api';
import { Spinner } from '../../components/ui';
import { TagCurva, TagStatus, fmtCrono, fmtHora, fmtNum } from '../../components/inventario/util';

// Leitor de QR: usa o BarcodeDetector do navegador; se não existir (iPhone), carrega o jsQR
let jsqrPromessa = null;
function carregarJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (!jsqrPromessa) {
    jsqrPromessa = new Promise((ok, erro) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
      s.onload = () => ok(window.jsQR); s.onerror = erro;
      document.head.appendChild(s);
    });
  }
  return jsqrPromessa;
}

function LeitorQR({ ativo, onLer }) {
  const videoRef = useRef(null);
  const [erro, setErro] = useState('');
  const onLerRef = useRef(onLer);
  onLerRef.current = onLer;

  useEffect(() => {
    if (!ativo) return;
    let stream, parar = false, timer;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (parar) { stream.getTracks().forEach(t => t.stop()); return; }
        const v = videoRef.current; v.srcObject = stream; await v.play();
        let detector = null;
        if ('BarcodeDetector' in window) {
          try { detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13', 'code_39'] }); } catch { detector = null; }
        }
        const jsQR = detector ? null : await carregarJsQR();
        const loop = async () => {
          if (parar) return;
          try {
            if (v.readyState >= 2) {
              let texto = null;
              if (detector) {
                const r = await detector.detect(v);
                texto = r[0]?.rawValue || null;
              } else {
                const w = v.videoWidth, h = v.videoHeight;
                const esc = Math.min(1, 640 / Math.max(w, h));
                canvas.width = w * esc; canvas.height = h * esc;
                ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
                const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
                texto = jsQR(img.data, img.width, img.height)?.data || null;
              }
              if (texto) { onLerRef.current(texto); return; }
            }
          } catch { /* tenta de novo */ }
          timer = setTimeout(loop, 180);
        };
        loop();
      } catch (e) {
        setErro(e?.name === 'NotAllowedError' ? 'Permita o uso da câmera no navegador.' : 'Não consegui abrir a câmera. Use o campo de código abaixo.');
      }
    })();
    return () => { parar = true; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); };
  }, [ativo]);

  return (
    <div className="relative h-64 rounded-2xl overflow-hidden bg-black border border-[var(--c-borda)]">
      <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-44 h-44 rounded-2xl border-2 border-[var(--c-destaque)] shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>
      <p className="absolute bottom-2 left-0 right-0 text-center text-xs text-white/80">{erro || 'Aponte para o QR code da etiqueta'}</p>
    </div>
  );
}

export default function InventarioContagem({ modo }) {
  const { id } = useParams();
  const recontagem = modo === 'recontagem';
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [erro, setErro] = useState('');
  // Coletor de dados sempre ativo (o leitor "digita" o código e manda Enter).
  // A câmera é opcional: só abre quando a pessoa pede.
  const coletor = true;
  const [camera, setCamera] = useState(false);
  const [usarCamera, setUsarCamera] = useState(false); // reabre a câmera depois de cada contagem
  const [codigo, setCodigo] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [item, setItem] = useState(null);
  const [qtd, setQtd] = useState('');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(null);
  const [verPendentes, setVerPendentes] = useState(false);
  const [agora, setAgora] = useState(Date.now());
  const [pulados, setPulados] = useState([]);
  const inputQtd = useRef(null);
  const inputCodigo = useRef(null);
  const estado = useRef({});
  estado.current = { item, qtd, buscando, salvando };

  async function carregar() {
    try { const { data } = await inventarioService.meu(id, recontagem ? 'recontagem' : undefined); setInfo(data); }
    catch (e) { setErro(e.response?.data?.erro || 'Erro ao carregar o inventário.'); }
  }
  useEffect(() => { carregar(); }, [id]);
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (item) setTimeout(() => inputQtd.current?.focus(), 50); }, [item]);
  // No modo coletor, deixa o campo de código sempre pronto para a próxima leitura


  // Leitura do coletor: teclas chegando muito rápidas (< 50 ms entre elas) e
  // terminando em Enter são uma leitura, não digitação. Funciona com o foco em
  // qualquer campo. Na tela da quantidade, bipar o mesmo item soma +1.
  const buscarRef = useRef(null);
  useEffect(() => {
    let buf = '', ultimaTecla = 0, inicio = 0, qtdAntes = '';
    function onKey(e) {
      const t = performance.now();
      if (e.key === 'Enter') {
        const leitura = buf.length >= 3 && (t - inicio) / buf.length < 50 && t - ultimaTecla < 100;
        const texto = buf; buf = '';
        if (!leitura) return;
        e.preventDefault(); e.stopPropagation();
        const st = estado.current;
        if (st.item) {
          setQtd(qtdAntes);
          const lido = texto.trim().toUpperCase();
          if (lido.includes(String(st.item.codigo).toUpperCase())) {
            setQtd(String((Number(String(qtdAntes).replace(',', '.')) || 0) + 1));
            if (navigator.vibrate) navigator.vibrate(30);
          } else {
            setErro(`Código lido (${texto.trim()}) é de outro item. Registre ou cancele o item atual primeiro.`);
            if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
          }
        } else {
          setCodigo('');
          buscarRef.current?.(texto);
        }
        return;
      }
      if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return;
      if (t - ultimaTecla > 100) { buf = ''; inicio = t; qtdAntes = estado.current.qtd; }
      buf += e.key; ultimaTecla = t;
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Cronômetro: tempo efetivo do contador (pausas > 10 min não contam)
  const ultima = info?.minha_ultima ? new Date(info.minha_ultima).getTime() : null;
  const desde = ultima ? (agora - ultima) / 1000 : 0;
  const crono = (info?.meu_tempo_seg || 0) + (ultima && desde <= (info?.pausa_seg || 600) ? desde : 0);
  const pausado = ultima && desde > (info?.pausa_seg || 600);

  // Rota de contagem: pendentes em ordem de endereço (A → Z); os pulados vão para o fim
  const fila = info?.pendentes || [];
  const proximo = fila.find(p => !pulados.includes(p.id)) || fila.find(p => p.id === pulados[0]) || null;
  const posicao = proximo ? fila.indexOf(proximo) + 1 : 0;
  const seguinte = proximo ? fila.slice(fila.indexOf(proximo) + 1).find(p => !pulados.includes(p.id)) : null;
  function pular() {
    if (!proximo) return;
    setPulados(l => [...l.filter(x => x !== proximo.id), proximo.id]);
  }

  buscarRef.current = (t) => buscar(t);
  async function buscar(texto) {
    const t = String(texto || '').trim();
    if (!t || buscando) return;
    setBuscando(true); setErro(''); setOk(null);
    try {
      const { data } = await inventarioService.buscar(id, t, recontagem ? 'recontagem' : undefined);
      if (navigator.vibrate) navigator.vibrate(60);
      setItem(data.item); setQtd(''); setObs(''); setCodigo(''); setCamera(false);
    } catch (e) {
      if (e.response?.status === 410) { alert(e.response.data.erro); navigate('/inventario'); return; }
      setErro(e.response?.data?.erro || 'Erro ao buscar o item.');
      if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
    } finally { setBuscando(false); }
  }

  async function registrar() {
    const n = Number(String(qtd).replace(',', '.'));
    if (qtd === '' || !Number.isFinite(n) || n < 0) { setErro('Informe a quantidade contada.'); return; }
    if (!recontagem && item.contagens > 0 &&
      !confirm(`Este item já foi contado (${fmtNum(item.contado)} por ${item.contado_por_nome?.split(' ')[0]}). Registrar nova contagem?`)) return;
    setSalvando(true); setErro('');
    try {
      const { data } = await inventarioService.contar(id, item.id, { quantidade: n, observacao: obs });
      setOk({ codigo: item.codigo, descricao: item.descricao, quantidade: n, hora: data.item.contado_em });
      setItem(null); setCamera(usarCamera);
      carregar();
    } catch (e) { setErro(e.response?.data?.erro || 'Erro ao registrar.'); }
    finally { setSalvando(false); }
  }

  if (!info && !erro) return <div className="flex justify-center py-16"><Spinner size={28} className="text-[var(--c-destaque)]" /></div>;
  if (info && info.inventario.status !== 'andamento') {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-3">
        <p className="text-[var(--c-texto)] font-semibold">Este inventário não está mais em andamento.</p>
        <button onClick={() => navigate('/inventario')} className="text-sm text-[var(--c-destaque)]">Voltar</button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => navigate('/inventario')} className="p-1.5 rounded-lg text-[var(--c-suave)]"><ArrowLeft size={18} /></button>
          <div className="min-w-0">
            <b className="text-[var(--c-texto)]">{recontagem ? `Recontagem — Inventário #${id}` : `Inventário #${id}`}</b>
            <p className="text-[11px] text-[var(--c-suave)]">{info ? `${fmtNum(info.minhas_contagens)} contagens minhas` : ''}</p>
          </div>
        </div>
        <span className={`flex items-center gap-1.5 font-mono text-sm px-2.5 py-1 rounded-lg ${pausado ? 'bg-amber-500/15 text-amber-400' : 'bg-[var(--c-destaque)]/15 text-[var(--c-destaque)]'}`}
          title="Tempo de contagem (pausas de mais de 10 min não contam)">
          <Timer size={14} /> {fmtCrono(crono)}{pausado && ' ⏸'}
        </span>
      </div>

      {info && (
        <div>
          <div className="flex justify-between text-xs text-[var(--c-suave)] mb-1">
            <span>{fmtNum(info.contados)} de {fmtNum(info.total)} itens contados</span>
            {recontagem && <span className="text-purple-300">{fmtNum(info.pendentes.length)} para recontar</span>}
          </div>
          <div className="h-2 rounded-full bg-[var(--c-borda)] overflow-hidden">
            <div className="h-full bg-[var(--c-destaque)] rounded-full" style={{ width: `${info.total ? (info.contados / info.total) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {erro && <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{erro}</div>}

      {!item ? (
        <>
          {ok && (
            <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/30 rounded-xl px-3 py-2.5">
              <div className="w-8 h-8 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center shrink-0"><Check size={18} /></div>
              <div className="min-w-0 text-sm"><p className="text-green-300 font-semibold">Contagem registrada</p>
                <p className="text-xs text-[var(--c-suave)] truncate">{ok.codigo} · {fmtNum(ok.quantidade)} un · {fmtHora(ok.hora)}</p></div>
            </div>
          )}
          {proximo ? (
            <div className="bg-[var(--c-superficie)] border-2 border-[var(--c-destaque)]/60 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-[var(--c-suave)]">
                <span className="flex items-center gap-1"><Navigation size={12} /> Próximo da rota (endereço A → Z)</span>
                <span>{fmtNum(posicao)} de {fmtNum(fila.length)}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin size={20} className="text-[var(--c-destaque)] shrink-0" />
                <span className={`font-mono font-extrabold text-2xl break-all ${proximo.endereco ? 'text-[var(--c-texto)]' : 'text-amber-400 text-base'}`}>
                  {proximo.endereco || 'Sem endereço PE no Zen'}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-[var(--c-destaque)]">{proximo.codigo}</span>
                <TagCurva curva={proximo.curva} longa />
                {proximo.status === 'recontagem' && <TagStatus status="recontagem" />}
              </div>
              <p className="text-sm font-semibold text-[var(--c-texto)]">{proximo.descricao}</p>
              <div className="flex gap-2 pt-1">
                <button onClick={() => buscar(proximo.codigo)} disabled={buscando}
                  className="flex-1 py-3 rounded-xl bg-[var(--c-destaque)] text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-40">
                  <Check size={17} /> Contar este
                </button>
                <button onClick={pular} disabled={fila.length < 2}
                  className="px-4 py-3 rounded-xl border border-[var(--c-borda)] text-[var(--c-texto)] text-sm flex items-center gap-1.5 disabled:opacity-40">
                  <SkipForward size={15} /> Pular
                </button>
              </div>
              {seguinte && (
                <p className="text-[11px] text-[var(--c-suave)] truncate">Depois: <span className="font-mono">{seguinte.endereco || 'sem endereço'}</span> · {seguinte.codigo}</p>
              )}
            </div>
          ) : info && (
            <div className="text-center text-sm text-green-300 bg-green-500/10 border border-green-500/30 rounded-2xl py-4">{recontagem ? 'Nenhum item aguardando recontagem.' : 'Todos os itens foram contados.'}</div>
          )}
          {buscando && <p className="text-center text-sm text-[var(--c-destaque)] flex items-center justify-center gap-2"><Spinner size={14} /> Buscando item…</p>}
          <button onClick={() => setVerPendentes(true)} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-[var(--c-borda)] text-sm text-[var(--c-texto)] whitespace-nowrap">
            <List size={15} className="shrink-0" /> {fmtNum(info?.pendentes.length || 0)} pendentes
          </button>
          {info?.ultimas?.length > 0 && (
            <div>
              <p className="text-xs text-[var(--c-suave)] mb-1">Minhas últimas contagens</p>
              <ul className="divide-y divide-[var(--c-borda)]">
                {info.ultimas.map(u => (
                  <li key={u.id} onClick={() => buscar(u.codigo)} className="flex justify-between gap-2 py-2 text-sm cursor-pointer">
                    <span className="min-w-0 truncate"><span className="font-mono text-xs text-[var(--c-suave)] mr-1.5">{u.codigo}</span>{u.descricao}</span>
                    <span className="flex items-center gap-2 shrink-0"><b>{fmtNum(u.quantidade)}</b><span className="text-[11px] text-[var(--c-suave)]">{fmtHora(u.criado_em)}</span></span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-[var(--c-suave)] mt-1">Errou? Toque no item para contar de novo.</p>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <div className="bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-[var(--c-destaque)]">{item.codigo}</span>
              <TagCurva curva={item.curva} longa />
              {item.status === 'recontagem' && <TagStatus status="recontagem" />}
            </div>
            <p className="text-[15px] font-semibold text-[var(--c-texto)] mt-1">{item.descricao}</p>
            <p className="text-xs text-[var(--c-suave)] mt-1 flex items-center gap-1"><MapPin size={12} /> {item.endereco || 'Sem endereço com saldo no Zen'} · {item.categoria}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--c-suave)] mb-1.5">Quantidade física contada</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setQtd(q => String(Math.max(0, (Number(q) || 0) - 1)))} className="w-16 h-16 rounded-2xl bg-[var(--c-cartao)] border border-[var(--c-borda)] flex items-center justify-center text-[var(--c-texto)]"><Minus size={24} /></button>
              <input ref={inputQtd} value={qtd} onChange={e => setQtd(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" placeholder="0"
                onKeyDown={e => e.key === 'Enter' && registrar()}
                className="flex-1 min-w-0 h-16 rounded-2xl border-2 border-[var(--c-destaque)] bg-[var(--c-fundo)] text-center text-3xl font-extrabold text-[var(--c-texto)]" />
              <button onClick={() => setQtd(q => String((Number(q) || 0) + 1))} className="w-16 h-16 rounded-2xl bg-[var(--c-cartao)] border border-[var(--c-borda)] flex items-center justify-center text-[var(--c-texto)]"><Plus size={24} /></button>
            </div>
            <p className="text-[11px] text-[var(--c-suave)] mt-1.5">Contagem às cegas: o saldo do Zen não aparece para quem conta.</p>
            {coletor && <p className="text-[11px] text-[var(--c-destaque)] mt-0.5 flex items-center gap-1"><Barcode size={12} /> Bipe o mesmo código de novo para somar +1.</p>}
          </div>
          <div>
            <p className="text-xs text-[var(--c-suave)] mb-1.5">Observação (opcional)</p>
            <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: 2 caixas abertas"
              className="w-full bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto)] rounded-xl px-3 py-3" />
          </div>
          <button onClick={registrar} disabled={salvando || qtd === ''} className="w-full py-4 rounded-2xl bg-[var(--c-destaque)] text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-40">
            {salvando ? <><Spinner size={16} /> Registrando…</> : <><Check size={18} /> Registrar contagem</>}
          </button>
          <button onClick={() => { setItem(null); setCamera(usarCamera); }} className="w-full py-3 rounded-2xl border border-[var(--c-borda)] text-[var(--c-texto)] text-sm">
            Cancelar
          </button>
        </div>
      )}

      {verPendentes && info && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={() => setVerPendentes(false)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-md max-h-[85dvh] bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-t-2xl sm:rounded-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-[var(--c-borda)]">
              <b className="text-[var(--c-texto)]">Pendentes ({fmtNum(info.pendentes.length)})</b>
              <button onClick={() => setVerPendentes(false)} className="text-[var(--c-suave)]"><X size={18} /></button>
            </div>
            <ul className="overflow-y-auto divide-y divide-[var(--c-borda)] px-4">
              {info.pendentes.map(p => (
                <li key={p.id} onClick={() => { setVerPendentes(false); buscar(p.codigo); }} className="py-2.5 cursor-pointer">
                  <div className="flex items-center gap-2"><span className="font-mono text-xs text-[var(--c-destaque)]">{p.codigo}</span><TagCurva curva={p.curva} />
                    {p.status === 'recontagem' && <TagStatus status="recontagem" />}</div>
                  <p className="text-sm text-[var(--c-texto)] truncate">{p.descricao}</p>
                  <p className="text-[11px] text-[var(--c-suave)] font-mono">{p.endereco || 'sem endereço no Zen'}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
