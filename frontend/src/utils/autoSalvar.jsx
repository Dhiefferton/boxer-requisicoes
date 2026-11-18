import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { Spinner } from '../components/ui';

// Campos do card: as alterações ficam num rascunho e gravam no botão Salvar (ou ao fechar o card).
// enviar(rascunho) grava e recarrega o card; depois disso só saem do rascunho os campos que não mudaram de novo.
const NAO_DIGITA = new Set(['checkbox', 'radio', 'file', 'button', 'submit', 'reset', 'range', 'color']);
function campoDeDigitarEmFoco() {
  const a = document.activeElement;
  if (!a) return false;
  if (a.isContentEditable || a.tagName === 'TEXTAREA') return true;
  return a.tagName === 'INPUT' && !NAO_DIGITA.has(String(a.type || 'text').toLowerCase());
}

export function useAutoSalvar(rascunho, setRascunho, enviar, atraso = 300) {
  const [salvando, setSalvando] = useState(false);
  const [salvoEm, setSalvoEm] = useState(null);
  const [erro, setErro] = useState('');
  const atual = useRef({ rascunho, enviar });
  atual.current = { rascunho, enviar };
  const emAndamento = useRef(null);

  async function salvarAgora() {
    while (emAndamento.current) await emAndamento.current.catch(() => {});
    const envio = atual.current.rascunho;
    if (!Object.keys(envio).length) return true;
    const p = (async () => {
      setSalvando(true); setErro('');
      try {
        await atual.current.enviar(envio);
        setRascunho(r => {
          const n = { ...r };
          for (const k of Object.keys(envio)) if (n[k] === envio[k]) delete n[k];
          return n;
        });
        setSalvoEm(Date.now());
        return true;
      } catch (e) { setErro(e?.response?.data?.erro || e?.message || 'Erro ao salvar.'); return false; }
      finally { setSalvando(false); }
    })();
    emAndamento.current = p;
    try { return await p; } finally { if (emAndamento.current === p) emAndamento.current = null; }
  }

  // Não grava sozinho a cada campo (economiza chamadas): grava no botão Salvar.
  // Se o card for fechado com alterações pendentes, grava uma vez ao fechar (não perde o que foi digitado).
  useEffect(() => () => {
    const pend = atual.current.rascunho;
    if (Object.keys(pend).length) Promise.resolve(atual.current.enviar(pend)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!Object.keys(rascunho).length) return undefined;
    const aviso = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [rascunho]);

  const descartar = () => { setRascunho({}); setErro(''); };
  return { salvando, salvoEm, erroSalvar: erro, salvarAgora, descartar };
}

// Barra Salvar / Descartar (aparece quando há alteração não salva)
export function StatusAutoSalvar({ salvando, pendente, salvoEm, erro, onSalvar, onDescartar }) {
  if (pendente || salvando) {
    return (
      <div className="flex items-center gap-2 flex-wrap rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
        <span className="flex-1 min-w-0 text-[11px] text-amber-500">{salvando ? 'Salvando…' : erro ? `Não salvou: ${erro}` : 'Alterações não salvas'}</span>
        {onDescartar && <button type="button" disabled={salvando} onClick={onDescartar}
          className="text-xs px-3 py-1.5 rounded-lg border border-[var(--c-borda)] text-[var(--c-texto)] hover:bg-[var(--c-borda)] disabled:opacity-50">Descartar</button>}
        {onSalvar && <button type="button" disabled={salvando} onClick={onSalvar}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--c-destaque)] text-white hover:brightness-110 disabled:opacity-50">
          {salvando ? <Spinner size={11} /> : <Check size={12} />} Salvar</button>}
      </div>
    );
  }
  if (erro) return <p className="text-[11px] text-red-400">Não salvou: {erro}</p>;
  if (salvoEm) return <p className="flex items-center gap-1 text-[11px] text-green-400"><Check size={11} /> Salvo</p>;
  return null;
}
