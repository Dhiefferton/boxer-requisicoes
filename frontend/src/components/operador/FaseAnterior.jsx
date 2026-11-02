// ============================================================
// components/operador/FaseAnterior.jsx — fases por onde o card já passou
// ============================================================
// Usado no card aberto (Orçamento e Lojinha), coluna da esquerda:
//  • useFasesPassadas: lê o histórico do card e diz por quais colunas ele
//    passou e quanto tempo ficou em cada uma.
//  • CaixaFase: a caixa da fase, que encolhe/expande ("Mostrar mais") e
//    tem o botão Editar (admin).
// ============================================================
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, Check } from 'lucide-react';

const duracao = (ms) => {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} minuto${min === 1 ? '' : 's'}`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hora${h === 1 ? '' : 's'}`;
  const d = Math.round(h / 24);
  return `${d} dia${d === 1 ? '' : 's'}`;
};

/**
 * buscar(): Promise<{ data: { movimentos } }> (null quando não dá para ler o histórico).
 * norm(status): status da coluna (ex.: liberacao → entrada).
 * Sem histórico: considera as colunas antes da atual (ordem do quadro).
 */
export function useFasesPassadas(buscar, chaveCard, statusAtual, ordem, criadoEm, norm = (s) => s) {
  const [hist, setHist] = useState(null);
  useEffect(() => {
    let vivo = true;
    if (!buscar) { setHist(null); return undefined; }
    buscar().then(r => {
      if (!vivo) return;
      const movs = (r?.data?.movimentos || []).filter(m => m.para_status || m.de_status)
        .sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
      const passou = new Set();
      const tempo = {};
      let fase = null, desde = criadoEm ? new Date(criadoEm) : null;
      for (const m of movs) {
        const de = m.de_status ? norm(m.de_status) : null, para = m.para_status ? norm(m.para_status) : null;
        if (de) passou.add(de);
        if (!fase) fase = de;
        if (para && para !== fase) {
          if (fase && desde) tempo[fase] = (tempo[fase] || 0) + (new Date(m.criado_em) - desde);
          fase = para; desde = new Date(m.criado_em);
          passou.add(para);
        }
      }
      setHist({ passou, tempo, temMov: movs.length > 0 });
    }).catch(() => { if (vivo) setHist(null); });
    return () => { vivo = false; };
  }, [chaveCard]); // eslint-disable-line react-hooks/exhaustive-deps

  const idxAtual = ordem.indexOf(statusAtual);
  return {
    passou: (k) => {
      if (!k || k === 'inicio') return true;
      if (k === statusAtual) return false;
      if (hist?.temMov) return hist.passou.has(k);
      return ordem.indexOf(k) >= 0 && ordem.indexOf(k) < idxAtual;
    },
    tempo: (k) => (hist?.tempo?.[k] ? duracao(hist.tempo[k]) : null),
  };
}

export function CaixaFase({ titulo, pilula, tempo, aberta, onAlternar, podeEditar, editando, onEditar, children }) {
  const visivel = aberta || editando;
  return (
    <div className="rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onAlternar} className="flex-1 min-w-0 flex items-center gap-2 text-left" title={visivel ? 'Mostrar menos' : 'Mostrar mais'}>
          {titulo && <span className="text-sm font-bold text-[var(--c-texto)] truncate">{titulo}</span>}
          {pilula}
        </button>
        {podeEditar && (
          <button type="button" onClick={onEditar} title={editando ? 'Parar de editar' : 'Editar campos desta fase'}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border ${editando ? 'border-[var(--c-destaque)] text-[var(--c-destaque)] bg-[var(--c-destaque)]/10' : 'border-[var(--c-borda)] text-[var(--c-suave)] hover:text-[var(--c-texto)]'}`}>
            {editando ? <><Check size={11} /> Pronto</> : <><Pencil size={11} /> Editar</>}
          </button>
        )}
      </div>
      {tempo && <p className="text-[11px] text-[var(--c-suave)] mt-1">{tempo}</p>}
      {visivel && <div className="mt-3">{children}</div>}
      {!editando && (
        <button type="button" onClick={onAlternar} className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-[var(--c-destaque)] hover:underline">
          {visivel ? <><ChevronUp size={12} /> Mostrar menos</> : <><ChevronDown size={12} /> Mostrar mais</>}
        </button>
      )}
    </div>
  );
}
