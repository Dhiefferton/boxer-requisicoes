// ============================================================
// pages/operador/InventarioDetalhe.jsx — Conferência de um inventário
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileSpreadsheet, RotateCcw, Check, ScanLine, Search, X, Ban, RefreshCw } from 'lucide-react';
import { inventarioService } from '../../services/api';
import { loginMicrosoft, alimentarPlanilha, dataExcel } from '../../services/planilhaMicrosoft';
import { useAuth } from '../../context/AuthContext';
import { Spinner } from '../../components/ui';
import { Kpi, TagCurva, TagStatus, fmtData, fmtHora, fmtDataHora, fmtNum, fmtPct, fmtTempo } from '../../components/inventario/util';

const FILTROS = [
  ['todos', 'Todos'], ['divergente', 'Divergentes'], ['ok', 'OK'], ['pendente', 'Pendentes'], ['recontagem', 'Recontagem'],
];

export default function InventarioDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [curva, setCurva] = useState('');
  const [busca, setBusca] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [historico, setHistorico] = useState(null);
  const [planilha, setPlanilha] = useState(''); // texto do progresso ao lançar na planilha

  async function carregar() {
    setErro('');
    try { const { data } = await inventarioService.detalhar(id); setDados(data); }
    catch (e) { setErro(e.response?.data?.erro || 'Erro ao carregar o inventário.'); }
  }
  useEffect(() => { carregar(); }, [id]);
  // Atualiza sozinho enquanto está em andamento
  useEffect(() => {
    if (dados?.inventario?.status !== 'andamento') return;
    const t = setInterval(carregar, 30000);
    return () => clearInterval(t);
  }, [dados?.inventario?.status, id]);

  const itens = dados?.itens || [];
  const contagem = useMemo(() => {
    const c = { todos: itens.length, ok: 0, divergente: 0, pendente: 0, recontagem: 0 };
    itens.forEach(i => { c[i.status] = (c[i.status] || 0) + 1; });
    return c;
  }, [itens]);
  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return itens.filter(i =>
      (filtro === 'todos' || i.status === filtro) &&
      (!curva || (curva === '-' ? !i.curva : i.curva === curva)) &&
      (!t || [i.codigo, i.descricao, i.endereco, i.contado_por_nome].some(v => String(v || '').toLowerCase().includes(t))));
  }, [itens, filtro, curva, busca]);

  if (erro) return <p className="text-sm text-red-400">{erro}</p>;
  if (!dados) return <div className="flex justify-center py-16"><Spinner size={28} className="text-[var(--c-destaque)]" /></div>;

  const inv = dados.inventario;
  const r = inv.resumo;
  const emAndamento = inv.status === 'andamento';

  async function acao(fn, msg) {
    if (msg && !confirm(msg)) return;
    setOcupado(true);
    try { await fn(); await carregar(); }
    catch (e) { alert(e.response?.data?.erro || 'Erro.'); }
    finally { setOcupado(false); }
  }

  // Alimenta a planilha de Inventário (OneDrive/SharePoint) com este inventário:
  //  • Tabela5 (Dados do inventário): uma linha por item contado
  //  • Tabela11: a data do inventário e o tempo de contagem por curva
  // As colunas calculadas da planilha (OK?, Mês, Ano, Período…) o próprio Excel preenche.
  async function lancarNaPlanilha() {
    const contados = itens.filter(i => i.contado != null);
    if (!contados.length) { alert('Nenhum item contado neste inventário.'); return; }
    if (inv.planilha_em && !confirm(`Este inventário já foi lançado na planilha em ${fmtDataHora(inv.planilha_em)} por ${inv.planilha_por_nome}. Lançar de novo vai DUPLICAR as linhas. Continuar?`)) return;
    if (!inv.planilha_em && !confirm(`Lançar ${fmtNum(contados.length)} itens deste inventário na planilha de Inventário?`)) return;
    setPlanilha('Preparando…');
    try {
      const { data: cfg } = await inventarioService.planilhaConfig();
      if (!cfg.configurado) throw new Error('A ligação com a planilha ainda não foi configurada (MS_CLIENT_ID e INVENTARIO_PLANILHA_URL no servidor).');
      setPlanilha('Entrando na conta Microsoft…');
      const token = await loginMicrosoft(cfg);
      const data = dataExcel(inv.criado_em);
      const num = (v) => (v == null ? null : Number(v));
      const linhasDados = contados.map(i => [
        data, i.curva ? `Curva ${i.curva}` : 'Sem curva',
        /^\d+$/.test(i.codigo) ? Number(i.codigo) : i.codigo, i.descricao,
        num(i.saldo_zen ?? i.saldo_inicial), num(i.contado),
        null, null, null, null, null, null, null,
      ]);
      const tc = r.tempo_curva || {};
      const linhaTempos = [data, null, null, (tc.A || 0) / 86400, (tc.B || 0) / 86400, (tc.C || 0) / 86400, null];
      const res = await alimentarPlanilha({ token, arquivoUrl: cfg.arquivoUrl, linhasDados, linhaTempos, aoProgredir: setPlanilha });
      await inventarioService.marcarPlanilha(inv.id);
      await carregar();
      alert(`Pronto! ${fmtNum(linhasDados.length)} itens e os tempos por curva foram lançados em "${res.arquivo}".`);
    } catch (e) {
      alert(e.response?.data?.erro || e.message || 'Erro ao lançar na planilha.');
    } finally { setPlanilha(''); }
  }

  async function verHistorico(item) {
    setHistorico({ item, contagens: null });
    try { const { data } = await inventarioService.historico(inv.id, item.id); setHistorico({ item, contagens: data.contagens }); }
    catch { setHistorico({ item, contagens: [] }); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button onClick={() => navigate('/inventario')} className="flex items-center gap-1 text-xs text-[var(--c-suave)] hover:text-[var(--c-texto)] mb-1">
            <ArrowLeft size={13} /> Inventários
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-xl font-bold text-[var(--c-texto)]">Inventário #{inv.id} — {fmtData(inv.criado_em)}</h1>
            <TagStatus status={inv.status} />
          </div>
          <p className="text-xs sm:text-sm text-[var(--c-suave)]">
            Iniciado {fmtHora(inv.criado_em)} por {inv.criado_por_nome} · {fmtTempo(r.tempo_seg)} de contagem
            {r.contadores.length > 0 && ` · ${r.contadores.map(c => c.nome?.split(' ')[0]).join(', ')}`}
            {inv.finalizado_em && ` · ${inv.status === 'cancelado' ? 'cancelado' : 'finalizado'} ${fmtDataHora(inv.finalizado_em)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={carregar} className="p-2 rounded-xl border border-[var(--c-borda)] text-[var(--c-suave)]" title="Atualizar"><RefreshCw size={15} /></button>
          {inv.status === 'finalizado' && (
            <button onClick={lancarNaPlanilha} disabled={!!planilha}
              title={inv.planilha_em ? `Lançado em ${fmtDataHora(inv.planilha_em)} por ${inv.planilha_por_nome}` : 'Lançar este inventário na planilha de Inventário'}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/30 disabled:opacity-60">
              {planilha ? <><Spinner size={14} /> {planilha}</> : <><FileSpreadsheet size={14} /> {inv.planilha_em ? `Na planilha ✓ ${fmtData(inv.planilha_em)}` : 'Alimentar planilha'}</>}
            </button>
          )}
          {emAndamento && <>
            <button onClick={() => navigate(`/inventario/${inv.id}/contar`)} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--c-borda)] text-[var(--c-texto)]">
              <ScanLine size={14} /> Contar
            </button>
            <button disabled={ocupado || !contagem.divergente} onClick={() => acao(() => inventarioService.recontar(inv.id, []),
              `Mandar os ${contagem.divergente} itens divergentes para recontagem?`)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-purple-500/15 text-purple-300 disabled:opacity-40">
              <RotateCcw size={14} /> Pedir recontagem ({contagem.divergente})
            </button>
            <button disabled={ocupado} onClick={() => acao(() => inventarioService.finalizar(inv.id),
              contagem.pendente ? `Ainda há ${contagem.pendente} itens pendentes. Finalizar mesmo assim?` : 'Finalizar o inventário?')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--c-destaque)] text-white disabled:opacity-40">
              <Check size={14} /> Finalizar inventário
            </button>
            {usuario?.perfil === 'admin' && (
              <button disabled={ocupado} onClick={() => acao(() => inventarioService.cancelar(inv.id), 'Cancelar este inventário? As contagens ficam guardadas, mas ele sai dos indicadores.')}
                className="p-2 rounded-xl text-red-400 hover:bg-red-500/10" title="Cancelar inventário"><Ban size={15} /></button>
            )}
          </>}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi valor={<>{fmtNum(r.contados)} <span className="text-sm font-normal text-[var(--c-suave)]">/ {fmtNum(r.total)}</span></>} rotulo="Itens contados" />
        <Kpi valor={fmtPct(r.acuracidade)} rotulo={emAndamento ? 'Acuracidade parcial' : 'Acuracidade'} cor="text-green-400" />
        <Kpi valor={fmtNum(r.divergentes + r.recontagem)} rotulo="Divergências" cor="text-red-400" />
        <Kpi valor={<span className="text-base sm:text-lg">{fmtTempo(r.tempo_curva.A)} · {fmtTempo(r.tempo_curva.B)} · {fmtTempo(r.tempo_curva.C)}</span>} rotulo="Tempo curva A · B · C" />
        <Kpi valor={r.itens_hora ? fmtNum(r.itens_hora.toFixed(1)) : '—'} rotulo="Itens por hora" />
      </div>

      <div className="bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {FILTROS.map(([k, l]) => (
            <button key={k} onClick={() => setFiltro(k)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${filtro === k ? 'bg-[var(--c-destaque)] border-[var(--c-destaque)] text-white' : 'border-[var(--c-borda)] text-[var(--c-suave)]'}`}>
              {l} {fmtNum(contagem[k] || 0)}
            </button>
          ))}
          <select value={curva} onChange={e => setCurva(e.target.value)}
            className="bg-[var(--c-fundo)] border border-[var(--c-borda)] text-[var(--c-texto)] rounded-xl px-3 py-1.5 text-xs">
            <option value="">Todas as curvas</option><option value="A">Curva A</option><option value="B">Curva B</option><option value="C">Curva C</option><option value="-">Sem curva</option>
          </select>
          <div className="relative w-full sm:w-auto sm:ml-auto sm:min-w-[260px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-suave)]" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Código, descrição, endereço…"
              className="w-full bg-[var(--c-fundo)] border border-[var(--c-borda)] text-[var(--c-texto)] rounded-xl pl-8 pr-3 py-1.5 text-xs" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-[13px]">
            <thead><tr className="text-left text-[var(--c-suave)] text-[11px]">
              {['Código', 'Descrição', 'Endereço (Zen)', 'Curva', 'Saldo Zen', 'Contado', 'Diferença', 'Status', 'Contador', 'Hora', ''].map(h =>
                <th key={h} className={`px-2 py-2 font-semibold whitespace-nowrap ${['Saldo Zen', 'Contado', 'Diferença'].includes(h) ? 'text-right' : ''}`}>{h}</th>)}
            </tr></thead>
            <tbody>
              {filtrados.slice(0, 1500).map(i => {
                const dif = i.diferenca == null ? null : Number(i.diferenca);
                return (
                  <tr key={i.id} onClick={() => i.contagens > 0 && verHistorico(i)}
                    className={`border-t border-[var(--c-borda)] ${i.contagens > 0 ? 'cursor-pointer hover:bg-[var(--c-borda)]/40' : ''}`}>
                    <td className="px-2 py-2 font-mono whitespace-nowrap">{i.codigo}</td>
                    <td className="px-2 py-2 min-w-[220px]">{i.descricao}</td>
                    <td className="px-2 py-2 font-mono whitespace-nowrap">{i.endereco || <span className="text-[var(--c-suave)]">sem saldo no Zen</span>}</td>
                    <td className="px-2 py-2"><TagCurva curva={i.curva} /></td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmtNum(i.saldo_zen ?? i.saldo_inicial)}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-bold">{fmtNum(i.contado)}</td>
                    <td className={`px-2 py-2 text-right tabular-nums font-bold ${dif == null ? '' : dif > 0 ? 'text-green-400' : dif < 0 ? 'text-red-400' : 'text-[var(--c-suave)]'}`}>
                      {dif == null ? '—' : dif > 0 ? `+${fmtNum(dif)}` : fmtNum(dif)}
                    </td>
                    <td className="px-2 py-2"><TagStatus status={i.status} /></td>
                    <td className="px-2 py-2 whitespace-nowrap">{i.contado_por_nome?.split(' ')[0] || '—'}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{i.contado_em ? fmtHora(i.contado_em) : '—'}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {emAndamento && i.status === 'divergente' && (
                        <button onClick={(e) => { e.stopPropagation(); acao(() => inventarioService.recontar(inv.id, [i.id])); }}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--c-borda)] text-[11px] text-[var(--c-texto)] hover:border-purple-400">
                          <RotateCcw size={12} /> Recontar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtrados.length > 1500 && <p className="text-xs text-[var(--c-suave)] mt-2">Mostrando 1.500 de {fmtNum(filtrados.length)} — use os filtros ou exporte o Excel.</p>}
          {!filtrados.length && <p className="text-sm text-[var(--c-suave)] text-center py-8">Nenhum item neste filtro.</p>}
        </div>
        <p className="text-[11px] text-[var(--c-suave)] mt-3">
          Saldo Zen = saldo buscado no Zen no momento em que o item foi contado (antes de contar, mostra o saldo do dia em que o inventário foi criado). Clique em um item contado para ver todas as contagens dele.
        </p>
      </div>

      {historico && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3" onClick={() => setHistorico(null)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-lg bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl p-5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div><p className="font-mono text-xs text-[var(--c-destaque)]">{historico.item.codigo}</p>
                <b className="text-sm text-[var(--c-texto)]">{historico.item.descricao}</b></div>
              <button onClick={() => setHistorico(null)} className="text-[var(--c-suave)]"><X size={18} /></button>
            </div>
            {!historico.contagens ? <Spinner size={18} className="text-[var(--c-destaque)]" /> : (
              <table className="w-full text-xs">
                <thead><tr className="text-left text-[var(--c-suave)]"><th className="py-1">Data/hora</th><th>Contador</th><th className="text-right">Contado</th><th className="text-right">Saldo Zen</th><th>Endereço</th></tr></thead>
                <tbody>{historico.contagens.map((c, k) => (
                  <tr key={k} className="border-t border-[var(--c-borda)]">
                    <td className="py-1.5 whitespace-nowrap">{fmtDataHora(c.criado_em)}</td><td>{c.usuario_nome?.split(' ')[0]}</td>
                    <td className="text-right font-bold">{fmtNum(c.quantidade)}</td><td className="text-right">{fmtNum(c.saldo_zen)}</td>
                    <td className="font-mono">{c.endereco || '—'}{c.observacao && <p className="font-sans text-[var(--c-suave)]">{c.observacao}</p>}</td>
                  </tr>))}</tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
