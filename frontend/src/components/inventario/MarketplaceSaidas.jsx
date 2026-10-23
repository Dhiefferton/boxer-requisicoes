// ============================================================
// components/inventario/MarketplaceSaidas.jsx — Saídas e reposição do marketplace
// ============================================================
// Aba da tela de Inventário (local Marketplace):
//   - quanto sai por dia / mês / ano (Mercado Livre e Shopee)
//   - relatório semanal de reposição (fechado toda sexta) + cálculo de hoje
//   - saídas por produto
// Até 18/09/2026 os números vêm da planilha Reposição.xlsx; depois, do Zen.
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import { FileDown, RefreshCw, Search, CalendarClock, Zap } from 'lucide-react';
import { marketplaceService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Spinner } from '../ui';
import { Kpi, fmtNum, fmtData, fmtDataHora } from './util';

const CORES = { 'Mercado Livre': '#eab308', Shopee: '#f97316' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
const rotulo = {
  dia: (c) => { const [, m, d] = c.split('-'); return `${d}/${m}`; },
  mes: (c) => { const [a, m] = c.split('-'); return `${MESES[+m - 1]}/${a.slice(2)}`; },
  ano: (c) => c,
};

const STATUS = {
  critico:          { label: 'Crítico (zerado)', cor: 'bg-red-500/15 text-red-400' },
  atencao:          { label: 'Repor — atenção',  cor: 'bg-orange-500/15 text-orange-400' },
  repor:            { label: 'Repor',            cor: 'bg-amber-500/15 text-amber-400' },
  ok:               { label: 'OK',               cor: 'bg-green-500/15 text-green-400' },
  sem_estoque_info: { label: 'Sem estoque do Zen', cor: 'bg-[var(--c-borda)] text-[var(--c-suave)]' },
};
function TagRepo({ status }) {
  const s = STATUS[status] || STATUS.sem_estoque_info;
  return <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${s.cor}`}>{s.label}</span>;
}

const cartao = 'bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl p-4';
const chip = (ativo) => `px-3 py-1.5 rounded-full text-xs font-medium border ${ativo ? 'bg-[var(--c-destaque)] border-[var(--c-destaque)] text-white' : 'border-[var(--c-borda)] text-[var(--c-suave)] hover:text-[var(--c-texto)]'}`;
const combina = (p, busca) => {
  const b = busca.trim().toLowerCase();
  return !b || String(p.codigo).toLowerCase().includes(b) || String(p.descricao || '').toLowerCase().includes(b);
};

export default function MarketplaceSaidas() {
  const { usuario } = useAuth();
  const admin = usuario?.perfil === 'admin';
  const [canal, setCanal] = useState('');
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [grafico, setGrafico] = useState('dia');
  const [busca, setBusca] = useState('');

  async function carregar() {
    setCarregando(true); setErro('');
    try { const { data } = await marketplaceService.saidas({ canal: canal || undefined, dias: 60 }); setDados(data); }
    catch (e) { setErro(e.response?.data?.erro || 'Erro ao carregar as saídas do marketplace.'); }
    finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, [canal]);

  const canais = dados?.canais || ['Mercado Livre', 'Shopee'];
  const serie = useMemo(() => {
    if (!dados) return [];
    const base = grafico === 'dia' ? dados.porDia : grafico === 'mes' ? dados.porMes : dados.porAno;
    return base.map(x => ({ ...x, nome: rotulo[grafico](x.chave) }));
  }, [dados, grafico]);

  const tot = useMemo(() => {
    const p = dados?.produtos || [];
    const s = (k) => p.reduce((a, x) => a + (x[k] || 0), 0);
    return { hoje: s('ultimo_dia'), d7: s('dias7'), d28: s('dias28'), mes: s('mes'), ano: s('ano') };
  }, [dados]);

  const produtos = (dados?.produtos || []).filter(p => combina(p, busca));

  function exportarProdutos() {
    const linhas = produtos.map(p => ({
      'Código': p.codigo, 'Descrição': p.descricao || '', 'Hoje': p.ultimo_dia || 0, 'Últimos 7 dias': p.dias7 || 0,
      'Últimos 28 dias': p.dias28 || 0, 'Média diária (28 dias)': +((p.dias28 || 0) / 28).toFixed(2), 'Mês atual': p.mes || 0,
      'Ano atual': p.ano || 0, 'Total': p.total || 0, 'Última saída': dataBR(p.ultima_saida),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Saidas por produto');
    const porMes = (dados?.porMes || []).map(m => ({ 'Mês': rotulo.mes(m.chave), ...Object.fromEntries(canais.map(c => [c, m[c] || 0])), 'Total': m.total }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(porMes), 'Por mes');
    XLSX.writeFile(wb, `saidas-marketplace-${dados?.hoje || ''}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[['', 'Todos os canais'], ...canais.map(c => [c, c])].map(([v, l]) => (
            <button key={l} onClick={() => setCanal(v)} className={chip(canal === v)}>{l}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[var(--c-suave)]">
          {dados?.sync?.diaConcluido && <span>Zen copiado até {dataBR(dados.sync.diaConcluido)}{dados.sync.atualizadoEm ? ` · ${fmtDataHora(dados.sync.atualizadoEm)}` : ''}</span>}
          <button onClick={carregar} className="p-2 rounded-xl border border-[var(--c-borda)] text-[var(--c-suave)] hover:text-[var(--c-texto)]" title="Atualizar">
            <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {erro && <p className="text-sm text-red-400">{erro}</p>}
      {dados?.aviso && <p className="text-xs text-amber-400">{dados.aviso}</p>}

      {!dados ? <div className="flex justify-center py-16"><Spinner size={28} className="text-[var(--c-destaque)]" /></div> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi valor={fmtNum(tot.hoje)} rotulo="Saídas hoje" extra={`até agora · ${dataBR(dados.hoje)}`} />
            <Kpi valor={fmtNum(tot.d7)} rotulo="Últimos 7 dias" />
            <Kpi valor={fmtNum((tot.d28 / 28).toFixed(1))} rotulo="Média por dia (28 dias)" />
            <Kpi valor={fmtNum(tot.mes)} rotulo="Mês atual" />
            <Kpi valor={fmtNum(tot.ano)} rotulo="Ano atual" />
          </div>

          <div className={cartao}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="text-sm text-[var(--c-texto)]">Unidades que saíram por {grafico === 'dia' ? 'dia (últimos 60 dias)' : grafico === 'mes' ? 'mês' : 'ano'}</b>
              <div className="flex gap-1.5">
                {[['dia', 'Dia'], ['mes', 'Mês'], ['ano', 'Ano']].map(([v, l]) => <button key={v} onClick={() => setGrafico(v)} className={chip(grafico === v)}>{l}</button>)}
              </div>
            </div>
            <div className="h-72 mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serie} margin={{ top: 8, right: 4, left: -14, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--c-borda)" />
                  <XAxis dataKey="nome" tick={{ fill: 'var(--c-suave)', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
                  <YAxis tick={{ fill: 'var(--c-suave)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'var(--c-borda)', opacity: 0.4 }} formatter={(v, n) => [fmtNum(v), n]}
                    labelFormatter={(l, p) => (grafico === 'dia' && p?.[0] ? dataBR(p[0].payload.chave) : l)}
                    contentStyle={{ background: 'var(--c-superficie)', border: '1px solid var(--c-borda)', borderRadius: 12, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {(canal ? [canal] : canais).map((c, i, arr) => (
                    <Bar key={c} dataKey={c} stackId="c" fill={CORES[c] || '#3b82f6'} radius={i === arr.length - 1 ? [5, 5, 0, 0] : 0} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-[var(--c-suave)] mt-2">
              Até {dataBR('2026-09-18')} os números vêm da planilha Reposição.xlsx; de {dataBR(dados.corte)} em diante, das notas de saída do Zen com tag MercadoLivre / Shopee (sem canceladas).
            </p>
          </div>

          <ReposicaoSemanal admin={admin} canal={canal} />

          <div className={cartao}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="text-sm text-[var(--c-texto)]">Saídas por produto <span className="font-normal text-[var(--c-suave)]">({fmtNum(produtos.length)})</span></b>
              <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-1.5 px-3 rounded-xl border border-[var(--c-borda)] bg-[var(--c-fundo)]">
                  <Search size={13} className="text-[var(--c-suave)]" />
                  <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Código ou descrição"
                    className="bg-transparent text-xs py-2 w-44 focus:outline-none text-[var(--c-texto)]" />
                </label>
                <button onClick={exportarProdutos} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20">
                  <FileDown size={14} /> Exportar Excel
                </button>
              </div>
            </div>
            <div className="overflow-x-auto mt-2 max-h-[480px] overflow-y-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="sticky top-0 bg-[var(--c-superficie)]"><tr className="text-[var(--c-suave)] text-[11px]">
                  {['Produto', 'Hoje', '7 dias', '28 dias', 'Média/dia', 'Mês', 'Ano', 'Total', 'Última saída'].map((h, i) =>
                    <th key={h} className={`px-2 py-2 font-semibold whitespace-nowrap ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {produtos.map(p => (
                    <tr key={p.codigo} className="border-t border-[var(--c-borda)]">
                      <td className="px-2 py-2 min-w-[220px]"><p className="font-semibold text-[var(--c-texto)] truncate max-w-[340px]">{p.descricao || '—'}</p><p className="text-[11px] text-[var(--c-suave)]">{p.codigo}</p></td>
                      <td className="px-2 py-2 text-right">{fmtNum(p.ultimo_dia || 0)}</td>
                      <td className="px-2 py-2 text-right">{fmtNum(p.dias7 || 0)}</td>
                      <td className="px-2 py-2 text-right">{fmtNum(p.dias28 || 0)}</td>
                      <td className="px-2 py-2 text-right font-semibold">{fmtNum(((p.dias28 || 0) / 28).toFixed(1))}</td>
                      <td className="px-2 py-2 text-right">{fmtNum(p.mes || 0)}</td>
                      <td className="px-2 py-2 text-right">{fmtNum(p.ano || 0)}</td>
                      <td className="px-2 py-2 text-right">{fmtNum(p.total || 0)}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">{dataBR(p.ultima_saida)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Relatório semanal de reposição ────────────────────────────
function ReposicaoSemanal({ admin, canal }) {
  const [lista, setLista] = useState(null);
  const [sel, setSel] = useState('');                 // id do relatório ou 'agora'
  const [rel, setRel] = useState(null);
  const [janela, setJanela] = useState(28);
  const [margem, setMargem] = useState(20);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [gerando, setGerando] = useState(false);
  const [busca, setBusca] = useState('');
  const [recarga, setRecarga] = useState(0);

  async function carregarLista(selecionar) {
    try {
      const { data } = await marketplaceService.relatorios();
      setLista(data.relatorios);
      setSel(s => selecionar || s || (data.relatorios[0] ? String(data.relatorios[0].id) : 'agora'));
    } catch (e) { setErro(e.response?.data?.erro || 'Erro ao carregar os relatórios.'); setLista([]); setSel('agora'); }
  }
  useEffect(() => { carregarLista(); }, []);

  useEffect(() => {
    if (!sel) return;
    setCarregando(true); setErro(''); setRel(null);
    const p = sel === 'agora'
      ? marketplaceService.reposicao({ janela, margem, canal: canal || undefined }).then(r => ({ ...r.data, agora: true }))
      : marketplaceService.relatorio(sel).then(r => r.data.relatorio);
    p.then(setRel).catch(e => setErro(e.response?.data?.erro || 'Erro ao carregar a reposição.')).finally(() => setCarregando(false));
  }, [sel, janela, margem, canal, recarga]);

  async function refazer() {
    if (!window.confirm('Refazer o relatório desta semana com o estoque atual do Zen?')) return;
    setGerando(true); setErro('');
    try { const { data } = await marketplaceService.gerarRelatorio(); await carregarLista(); setSel(String(data.id)); setRecarga(x => x + 1); }
    catch (e) { setErro(e.response?.data?.erro || 'Erro ao gerar o relatório.'); }
    finally { setGerando(false); }
  }

  const linhas = (rel?.linhas || []).filter(l => combina(l, busca));
  const r = rel?.resumo;

  function exportar() {
    const dados = (rel?.linhas || []).map(l => ({
      'Código': l.codigo, 'Descrição': l.descricao, 'Saídas na janela': l.saidas, 'Mercado Livre': l.ml, 'Shopee': l.shopee,
      'Média diária': l.media, 'Necessidade semanal': l.necessidade, 'Estoque MKT_PLACE': l.estoque ?? '',
      'A repor': l.repor ?? '', 'Cobertura (dias)': l.cobertura_dias ?? '', 'Endereço': l.endereco || '', 'Status': STATUS[l.status]?.label || l.status,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dados), 'Reposicao');
    XLSX.writeFile(wb, `reposicao-marketplace-${rel?.semana || rel?.janela_ate || 'hoje'}.xlsx`);
  }

  return (
    <div className={cartao}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <b className="text-sm text-[var(--c-texto)] flex items-center gap-1.5"><CalendarClock size={15} className="text-[var(--c-destaque)]" /> Reposição semanal do estoque</b>
          <p className="text-[11px] text-[var(--c-suave)] mt-0.5">
            Fechado toda sexta-feira. Média diária × 7 dias × (1 + margem) − estoque do MKT_PLACE no Zen = quanto repor.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={sel} onChange={e => setSel(e.target.value)}
            className="bg-[var(--c-fundo)] border border-[var(--c-borda)] rounded-xl text-xs px-2 py-2 text-[var(--c-texto)]">
            {(lista || []).map(x => <option key={x.id} value={x.id}>Semana de {fmtData(`${x.semana}T12:00:00`)} (sexta)</option>)}
            <option value="agora">Cálculo de hoje (ao vivo)</option>
          </select>
          {admin && sel !== 'agora' && lista?.[0] && String(lista[0].id) === sel && (
            <button onClick={refazer} disabled={gerando} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-[var(--c-borda)] text-[var(--c-texto)] hover:border-[var(--c-destaque)] disabled:opacity-40">
              {gerando ? <Spinner size={13} /> : <Zap size={13} />} Refazer esta semana
            </button>
          )}
          <button onClick={exportar} disabled={!rel?.linhas?.length}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20 disabled:opacity-40">
            <FileDown size={14} /> Exportar Excel
          </button>
        </div>
      </div>

      {sel === 'agora' && (
        <div className="flex flex-wrap gap-4 mt-3 text-xs">
          <label className="flex items-center gap-2 text-[var(--c-suave)]">Janela
            <select value={janela} onChange={e => setJanela(+e.target.value)} className="bg-[var(--c-fundo)] border border-[var(--c-borda)] rounded-lg px-2 py-1 text-[var(--c-texto)]">
              {[7, 14, 28, 60, 90].map(v => <option key={v} value={v}>{v} dias</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[var(--c-suave)]">Margem de segurança
            <select value={margem} onChange={e => setMargem(+e.target.value)} className="bg-[var(--c-fundo)] border border-[var(--c-borda)] rounded-lg px-2 py-1 text-[var(--c-texto)]">
              {[0, 10, 20, 30, 50].map(v => <option key={v} value={v}>{v}%</option>)}
            </select>
          </label>
          {canal && <span className="text-[var(--c-suave)] self-center">Só {canal}</span>}
        </div>
      )}

      {lista && !lista.length && sel !== 'agora' && <p className="text-xs text-[var(--c-suave)] mt-3">O primeiro relatório semanal ainda não foi fechado.</p>}
      {erro && <p className="text-sm text-red-400 mt-3">{erro}</p>}
      {rel?.erroEstoque && <p className="text-xs text-amber-400 mt-3">{rel.erroEstoque}</p>}

      {carregando || !rel ? (!erro && <div className="flex justify-center py-10"><Spinner size={24} className="text-[var(--c-destaque)]" /></div>) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
            <Kpi valor={fmtNum(r?.a_repor)} rotulo="Produtos a repor" cor={r?.a_repor ? 'text-amber-400' : 'text-green-400'} extra={`de ${fmtNum(r?.produtos)} com saída`} />
            <Kpi valor={fmtNum(r?.unidades_repor)} rotulo="Unidades a repor" />
            <Kpi valor={fmtNum(r?.criticos)} rotulo="Zerados no MKT_PLACE" cor={r?.criticos ? 'text-red-400' : undefined} />
            <Kpi valor={`${dataBR(rel.janela_de).slice(0, 5)} a ${dataBR(rel.janela_ate).slice(0, 5)}`} rotulo="Janela das saídas"
              extra={`${rel.parametros?.janela} dias · margem ${rel.parametros?.margem}%${rel.gerado_em ? ` · gerado ${fmtDataHora(rel.gerado_em)}` : ''}`} />
          </div>
          <div className="flex justify-end mt-3">
            <label className="flex items-center gap-1.5 px-3 rounded-xl border border-[var(--c-borda)] bg-[var(--c-fundo)]">
              <Search size={13} className="text-[var(--c-suave)]" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar produto"
                className="bg-transparent text-xs py-2 w-40 focus:outline-none text-[var(--c-texto)]" />
            </label>
          </div>
          <div className="overflow-x-auto mt-2 max-h-[520px] overflow-y-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="sticky top-0 bg-[var(--c-superficie)]"><tr className="text-[var(--c-suave)] text-[11px]">
                {['Produto', 'Saídas', 'Média/dia', 'Necessidade semanal', 'Estoque MKT_PLACE', 'A repor', 'Cobertura', 'Status'].map((h, i) =>
                  <th key={h} className={`px-2 py-2 font-semibold whitespace-nowrap ${i && i < 7 ? 'text-right' : 'text-left'}`}>{h}</th>)}
              </tr></thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.codigo} className="border-t border-[var(--c-borda)]">
                    <td className="px-2 py-2 min-w-[220px]"><p className="font-semibold text-[var(--c-texto)] truncate max-w-[340px]">{l.descricao || '—'}</p>
                      <p className="text-[11px] text-[var(--c-suave)]">{l.codigo}{l.endereco ? ` · ${l.endereco}` : ''}</p></td>
                    <td className="px-2 py-2 text-right" title={`Mercado Livre ${l.ml} · Shopee ${l.shopee}`}>{fmtNum(l.saidas)}</td>
                    <td className="px-2 py-2 text-right">{fmtNum(l.media.toFixed(1))}</td>
                    <td className="px-2 py-2 text-right">{fmtNum(l.necessidade)}</td>
                    <td className="px-2 py-2 text-right">{l.estoque == null ? '—' : fmtNum(l.estoque)}</td>
                    <td className={`px-2 py-2 text-right font-bold ${l.repor > 0 ? 'text-amber-400' : 'text-[var(--c-suave)]'}`}>{l.repor == null ? '—' : fmtNum(l.repor)}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">{l.cobertura_dias == null ? '—' : `${fmtNum(l.cobertura_dias)} d`}</td>
                    <td className="px-2 py-2"><TagRepo status={l.status} /></td>
                  </tr>
                ))}
                {!linhas.length && <tr><td colSpan={8} className="px-2 py-8 text-center text-[var(--c-suave)]">Nenhum produto com saída na janela.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
