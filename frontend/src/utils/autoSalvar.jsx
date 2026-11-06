import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { Spinner } from '../components/ui';

// Campos do card gravam sozinhos ao sair do campo (sem botões Salvar/Descartar).
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

  // Grava quando a pessoa SAI do campo (não enquanto digita).
  // Escolhas feitas com clique (lista, marcar, data no calendário) não deixam um campo de digitar em foco: gravam logo.
  useEffect(() => {
    if (!Object.keys(rascunho).length) return undefined;
    if (!campoDeDigitarEmFoco()) {
      const t = setTimeout(() => { salvarAgora(); }, atraso);
      return () => clearTimeout(t);
    }
    const sair = () => { setTimeout(() => { salvarAgora(); }, 0); };
    document.addEventListener('focusout', sair, true);
    return () => document.removeEventListener('focusout', sair, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rascunho]);

  return { salvando, salvoEm, erroSalvar: erro, salvarAgora };
}

// Indicador discreto no lugar da barra Salvar/Descartar
// eslint-disable-next-line no-unused-vars
export function StatusAutoSalvar({ salvando, pendente, salvoEm, erro }) {
  if (erro) return <p className="text-[11px] text-red-400">Não salvou: {erro}</p>;
  if (salvando) {
    return <p className="flex items-center gap-1.5 text-[11px] text-[var(--c-suave)]"><Spinner size={10} /> Salvando…</p>;
  }
  if (salvoEm) return <p className="flex items-center gap-1 text-[11px] text-green-400"><Check size={11} /> Salvo automaticamente</p>;
  return null;
}
