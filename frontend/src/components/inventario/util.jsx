// ============================================================
// components/inventario/util.jsx — peças compartilhadas do Inventário
// ============================================================

export function fmtTempo(seg) {
  const s = Math.max(0, Math.round(seg || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h${String(m).padStart(2, '0')}`;
}

export function fmtCrono(seg) {
  const s = Math.max(0, Math.floor(seg || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return [h, m, x].map(n => String(n).padStart(2, '0')).join(':');
}

export const fmtPct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`);
export const fmtNum = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
export const fmtData = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
export const fmtHora = (d) => (d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtDataHora = (d) => (d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

const COR_CURVA = {
  A: 'bg-red-500/15 text-red-400',
  B: 'bg-amber-500/15 text-amber-400',
  C: 'bg-cyan-500/15 text-cyan-400',
};

export function TagCurva({ curva, longa }) {
  if (!curva) return <span className="text-[11px] text-[var(--c-suave)]">—</span>;
  return (
    <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full ${COR_CURVA[curva] || ''}`}>
      {longa ? `Curva ${curva}` : curva}
    </span>
  );
}

const STATUS = {
  pendente:   { label: 'Pendente',   cor: 'bg-[var(--c-borda)] text-[var(--c-suave)]' },
  ok:         { label: 'OK',         cor: 'bg-green-500/15 text-green-400' },
  divergente: { label: 'Divergente', cor: 'bg-red-500/15 text-red-400' },
  recontagem: { label: 'Recontagem', cor: 'bg-purple-500/15 text-purple-400' },
  andamento:  { label: 'Em andamento', cor: 'bg-[var(--c-destaque)]/15 text-[var(--c-destaque)]' },
  finalizado: { label: 'Finalizado', cor: 'bg-green-500/15 text-green-400' },
  cancelado:  { label: 'Cancelado',  cor: 'bg-red-500/15 text-red-400' },
};

export function TagStatus({ status }) {
  const s = STATUS[status] || { label: status, cor: 'bg-[var(--c-borda)] text-[var(--c-suave)]' };
  return <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${s.cor}`}>{s.label}</span>;
}

export function Kpi({ valor, rotulo, cor, extra }) {
  return (
    <div className="bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl px-4 py-3 min-w-0">
      <p className={`text-xl sm:text-2xl font-bold truncate ${cor || 'text-[var(--c-texto)]'}`}>{valor}</p>
      <p className="text-xs text-[var(--c-suave)] truncate">{rotulo}</p>
      {extra && <p className="text-[11px] text-[var(--c-suave)] mt-0.5 truncate">{extra}</p>}
    </div>
  );
}

export function Progresso({ feito, total }) {
  const pct = total ? Math.round((feito / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-2 rounded-full bg-[var(--c-borda)] overflow-hidden">
        <div className="h-full rounded-full bg-[var(--c-destaque)]" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-[var(--c-suave)] whitespace-nowrap">
        {fmtNum(feito)} / {fmtNum(total)}
        <span className="ml-1.5 font-semibold text-[var(--c-texto)]">
          {(total ? (feito / total) * 100 : 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
        </span>
      </span>
    </div>
  );
}
