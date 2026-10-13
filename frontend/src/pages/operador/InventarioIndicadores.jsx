// ============================================================
// pages/operador/InventarioIndicadores.jsx — KPIs do inventário
// ============================================================
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { inventarioService } from '../../services/api';
import { Spinner } from '../../components/ui';
import { Kpi, TagCurva, fmtNum, fmtPct, fmtTempo } from '../../components/inventario/util';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export default function InventarioIndicadores() {
  const navigate = useNavigate();
  const [meses, setMeses] = useState(12);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    setDados(null); setErro('');
    inventarioService.indicadores(meses).then(r => setDados(r.data))
      .catch(e => setErro(e.response?.data?.erro || 'Erro ao carregar os indicadores.'));
  }, [meses]);

  const t = dados?.totais;
  const grafico = (dados?.por_mes || []).map(m => {
    const [a, mm] = m.mes.split('-');
    return { nome: `${MESES[+mm - 1]}/${a.slice(2)}`, pct: m.acuracidade == null ? 0 : +(m.acuracidade * 100).toFixed(1) };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button onClick={() => navigate('/inventario')} className="flex items-center gap-1 text-xs text-[var(--c-suave)] hover:text-[var(--c-texto)] mb-1">
            <ArrowLeft size={13} /> Inventários
          </button>
          <h1 className="text-lg sm:text-xl font-bold text-[var(--c-texto)]">Indicadores do inventário</h1>
          <p className="text-xs sm:text-sm text-[var(--c-suave)]">Somente inventários finalizados</p>
        </div>
        <div className="flex gap-2">
          {[[3, '3 meses'], [12, '12 meses'], [120, 'Tudo']].map(([v, l]) => (
            <button key={v} onClick={() => setMeses(v)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${meses === v ? 'bg-[var(--c-destaque)] border-[var(--c-destaque)] text-white' : 'border-[var(--c-borda)] text-[var(--c-suave)]'}`}>{l}</button>
          ))}
        </div>
      </div>

      {erro && <p className="text-sm text-red-400">{erro}</p>}
      {!dados ? <div className="flex justify-center py-16"><Spinner size={28} className="text-[var(--c-destaque)]" /></div> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi valor={fmtNum(t.contados)} rotulo="Itens inventariados" extra={`${t.inventarios} inventário(s)`} />
            <Kpi valor={fmtPct(t.acuracidade)} rotulo="Acuracidade geral" cor="text-green-400" />
            <Kpi valor={fmtNum(t.divergentes)} rotulo="Divergências" cor="text-red-400" />
            <Kpi valor={fmtTempo(t.tempo_seg)} rotulo="Tempo total de contagem" />
            <Kpi valor={t.itens_hora ? fmtNum(t.itens_hora.toFixed(1)) : '—'} rotulo="Itens por hora (média)" />
          </div>
          <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4">
            <div className="bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl p-4">
              <b className="text-sm text-[var(--c-texto)]">Acuracidade por mês</b>
              {grafico.length ? (
                <div className="h-64 mt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={grafico} margin={{ top: 20, right: 4, left: -18, bottom: 0 }}>
                      <XAxis dataKey="nome" tick={{ fill: 'var(--c-suave)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: 'var(--c-suave)', fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                      <Tooltip formatter={(v) => [`${v}%`, 'Acuracidade']} contentStyle={{ background: 'var(--c-superficie)', border: '1px solid var(--c-borda)', borderRadius: 12 }} />
                      <Bar dataKey="pct" radius={[6, 6, 0, 0]}>
                        {grafico.map((g, i) => <Cell key={i} fill={g.pct >= 95 ? '#22c55e' : g.pct >= 80 ? '#f59e0b' : '#ef4444'} />)}
                        <LabelList dataKey="pct" position="top" formatter={v => `${v}%`} style={{ fill: 'var(--c-suave)', fontSize: 10 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <p className="text-sm text-[var(--c-suave)] py-10 text-center">Sem inventários finalizados no período.</p>}
            </div>
            <div className="bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl p-4 space-y-4">
              <div>
                <b className="text-sm text-[var(--c-texto)]">Desempenho por curva</b>
                <table className="w-full text-xs mt-2">
                  <thead><tr className="text-left text-[var(--c-suave)]"><th className="py-1">Curva</th><th className="text-right">Itens</th><th className="text-right">OK</th><th className="text-right">Diverg.</th><th className="text-right">Acuracidade</th><th className="text-right">Tempo</th></tr></thead>
                  <tbody>{dados.por_curva.map(c => (
                    <tr key={c.curva} className="border-t border-[var(--c-borda)]">
                      <td className="py-1.5">{c.curva === '-' ? <span className="text-[var(--c-suave)]">Sem curva</span> : <TagCurva curva={c.curva} longa />}</td>
                      <td className="text-right">{fmtNum(c.contados)}</td><td className="text-right text-green-400">{fmtNum(c.ok)}</td>
                      <td className="text-right text-red-400">{fmtNum(c.divergentes)}</td><td className="text-right font-semibold">{fmtPct(c.acuracidade)}</td>
                      <td className="text-right">{fmtTempo(c.tempo_seg)}</td>
                    </tr>))}</tbody>
                </table>
              </div>
              <div>
                <b className="text-sm text-[var(--c-texto)]">Produtividade por contador</b>
                {(() => {
                  const max = Math.max(1, ...dados.contadores.map(c => c.itens_hora || 0));
                  return (
                    <div className="space-y-2 mt-2">
                      {dados.contadores.map(c => (
                        <div key={c.nome} className="flex items-center gap-2 text-xs">
                          <span className="w-24 truncate text-[var(--c-texto)]">{c.nome?.split(' ')[0]}</span>
                          <div className="flex-1 h-2 rounded-full bg-[var(--c-borda)] overflow-hidden"><div className="h-full bg-[var(--c-destaque)] rounded-full" style={{ width: `${((c.itens_hora || 0) / max) * 100}%` }} /></div>
                          <span className="w-28 text-right text-[var(--c-suave)]">{c.itens_hora ? `${fmtNum(c.itens_hora.toFixed(1))} itens/h` : '—'}</span>
                        </div>
                      ))}
                      {!dados.contadores.length && <p className="text-xs text-[var(--c-suave)]">Sem contagens no período.</p>}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
