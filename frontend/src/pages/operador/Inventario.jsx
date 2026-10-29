// ============================================================
// pages/operador/Inventario.jsx — Painel do Inventário
// ============================================================
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Plus, BarChart2, FileDown, ScanLine, ClipboardCheck, X, RefreshCw, MapPin } from 'lucide-react';
import { inventarioService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Spinner, Empty } from '../../components/ui';
import { Kpi, Progresso, TagStatus, fmtData, fmtHora, fmtPct, fmtNum, fmtTempo } from '../../components/inventario/util';
import MarketplaceSaidas from '../../components/inventario/MarketplaceSaidas';
import { podeRecontar } from '../../utils/acessoInventario';

// Onde o inventário é feito — cada local tem seus próprios inventários
export const LOCAIS_INVENTARIO = [
  { id: 'almoxarifado', nome: 'Almoxarifado' },
  { id: 'marketplace', nome: 'Marketplace (Mercado Livre)' },
];
const nomeLocal = (id) => LOCAIS_INVENTARIO.find(l => l.id === id)?.nome || 'Almoxarifado';

export default function Inventario() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const local = LOCAIS_INVENTARIO.some(l => l.id === params.get('local')) ? params.get('local') : 'almoxarifado';
  const mkt = local === 'marketplace';
  const aba = mkt && params.get('aba') === 'saidas' ? 'saidas' : 'inventarios';
  const { usuario } = useAuth();
  const [lista, setLista] = useState([]);
  const [saldoMax, setSaldoMax] = useState(30);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [novo, setNovo] = useState(false);

  async function carregar(silencioso = false) {
    if (!silencioso) setCarregando(true);
    setErro('');
    try {
      const { data } = await inventarioService.listar(local);
      setLista(data.inventarios); setSaldoMax(data.saldo_maximo);
    } catch (e) { setErro(e.response?.data?.erro || 'Erro ao carregar os inventários.'); }
    finally { setCarregando(false); }
  }
  useEffect(() => { setLista([]); carregar(); }, [local]);
  // Atualiza sozinho a cada 20 s (progresso da contagem de todos os contadores)
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') carregar(true); }, 20000);
    return () => clearInterval(t);
  }, [local]);

  const andamento = lista.find(i => i.status === 'andamento');
  const finalizados = lista.filter(i => i.status === 'finalizado');
  const ultimo = finalizados[0];

  function exportar() {
    const linhas = finalizados.map(i => ({
      'Inventário': `#${i.id}`, 'Data': fmtData(i.criado_em),
      'Itens contados': i.resumo.contados, 'OK': i.resumo.ok, 'Divergências': i.resumo.divergentes + i.resumo.recontagem,
      'Acuracidade': i.resumo.acuracidade ?? '', 'Tempo curva A (h)': +(i.resumo.tempo_curva.A / 3600).toFixed(2),
      'Tempo curva B (h)': +(i.resumo.tempo_curva.B / 3600).toFixed(2), 'Tempo curva C (h)': +(i.resumo.tempo_curva.C / 3600).toFixed(2),
      'Tempo total (h)': +(i.resumo.tempo_seg / 3600).toFixed(2), 'Itens/hora': i.resumo.itens_hora ? +i.resumo.itens_hora.toFixed(1) : '',
      'Criado por': i.criado_por_nome, 'Finalizado em': fmtData(i.finalizado_em),
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventarios');
    XLSX.writeFile(wb, `inventarios-${local}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-[var(--c-texto)]">Inventário</h1>
          <p className="text-xs sm:text-sm text-[var(--c-suave)]">
            {aba === 'saidas'
              ? 'Quanto sai por dia, mês e ano no Mercado Livre e na Shopee, e a reposição semanal do estoque do marketplace'
              : mkt
              ? 'Itens com saldo no depósito MKT_PLACE (endereço MERCADO_LIVRE) — saldo e endereço vêm do Zen na hora da contagem'
              : `Contagem cíclica dos itens com saldo até ${saldoMax} — saldo e endereço vêm do Zen na hora da contagem`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-1.5 pl-3 pr-1 rounded-xl border border-[var(--c-destaque)] bg-[var(--c-superficie)]" title="Local do inventário">
            <MapPin size={14} className="text-[var(--c-destaque)]" />
            <select value={local} onChange={e => setParams(e.target.value === 'almoxarifado' ? {} : { local: e.target.value })}
              className="bg-transparent text-xs font-semibold text-[var(--c-texto)] py-2 pr-1 focus:outline-none cursor-pointer">
              {LOCAIS_INVENTARIO.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </label>
          {aba === 'inventarios' && <>
          <button onClick={carregar} className="p-2 rounded-xl border border-[var(--c-borda)] text-[var(--c-suave)] hover:text-[var(--c-texto)]" title="Atualizar">
            <RefreshCw size={15} />
          </button>
          <button onClick={exportar} disabled={!finalizados.length}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20 disabled:opacity-40">
            <FileDown size={14} /> Exportar Excel
          </button>
          <button onClick={() => navigate(`/inventario/indicadores${mkt ? '?local=marketplace' : ''}`)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--c-superficie)] border border-[var(--c-borda)] text-[var(--c-texto)] hover:border-[var(--c-destaque)]">
            <BarChart2 size={14} /> Indicadores
          </button>
          <button onClick={() => setNovo(true)} disabled={!!andamento} title={andamento ? 'Já existe um inventário em andamento' : ''}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--c-destaque)] text-white hover:bg-[var(--c-destaque-h)] disabled:opacity-40">
            <Plus size={14} /> Novo inventário
          </button>
          </>}
        </div>
      </div>

      {mkt && (
        <div className="flex gap-1 border-b border-[var(--c-borda)]">
          {[['inventarios', 'Inventários'], ['saidas', 'Saídas e reposição']].map(([v, l]) => (
            <button key={v} onClick={() => setParams(v === 'saidas' ? { local, aba: v } : { local })}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${aba === v ? 'border-[var(--c-destaque)] text-[var(--c-texto)]' : 'border-transparent text-[var(--c-suave)] hover:text-[var(--c-texto)]'}`}>{l}</button>
          ))}
        </div>
      )}

      {aba === 'saidas' ? <MarketplaceSaidas /> : <>
      {erro && <p className="text-sm text-red-400">{erro}</p>}
      {carregando ? (
        <div className="flex justify-center py-16"><Spinner size={28} className="text-[var(--c-destaque)]" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi valor={fmtPct(ultimo?.resumo.acuracidade)} rotulo="Acuracidade (último)" cor="text-green-400" />
            <Kpi valor={fmtNum(ultimo?.resumo.contados ?? 0)} rotulo="Itens contados (último)" />
            <Kpi valor={fmtNum(ultimo ? ultimo.resumo.divergentes + ultimo.resumo.recontagem : 0)} rotulo="Divergências (último)" cor="text-red-400" />
            <Kpi valor={ultimo ? fmtTempo(ultimo.resumo.tempo_seg) : '—'} rotulo="Tempo de contagem (último)" />
            <Kpi valor={ultimo?.resumo.itens_hora ? fmtNum(ultimo.resumo.itens_hora.toFixed(1)) : '—'} rotulo="Itens por hora (último)" />
          </div>

          {andamento && (
            <div className="bg-[var(--c-superficie)] border border-[var(--c-destaque)]/40 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <b className="text-sm text-[var(--c-texto)]">Inventário #{andamento.id} · {nomeLocal(local)}</b>
                  <TagStatus status="andamento" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => navigate(`/inventario/${andamento.id}/contar`)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--c-destaque)] text-white">
                    <ScanLine size={14} /> Contar
                  </button>
                  {podeRecontar(usuario) && andamento.resumo?.recontagem > 0 && (
                    <button onClick={() => navigate(`/inventario/${andamento.id}/recontar`)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-purple-500 text-white">
                      <ScanLine size={14} /> Recontar ({fmtNum(andamento.resumo.recontagem)})
                    </button>
                  )}
                  <button onClick={() => navigate(`/inventario/${andamento.id}`)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--c-borda)] text-[var(--c-texto)]">
                    <ClipboardCheck size={14} /> Conferência
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-xs">
                <Info rotulo="Início" valor={`${fmtData(andamento.criado_em)} ${fmtHora(andamento.criado_em)}`} />
                <Info rotulo={mkt ? 'Local' : 'Categorias'} valor={mkt ? 'MKT_PLACE' : (andamento.filtros?.categorias || []).join(', ')} />
                <Info rotulo="Contadores" valor={andamento.resumo.contadores.map(c => c.nome?.split(' ')[0]).join(', ') || '—'} />
                <Info rotulo="OK / Diverg." valor={<><span className="text-green-400">{andamento.resumo.ok}</span> / <span className="text-red-400">{andamento.resumo.divergentes + andamento.resumo.recontagem}</span></>} />
                <Info rotulo="Tempo" valor={fmtTempo(andamento.resumo.tempo_seg)} />
                <div className="col-span-2 md:col-span-1"><p className="text-[var(--c-suave)] mb-1">Progresso</p>
                  <Progresso feito={andamento.resumo.contados} total={andamento.resumo.total} /></div>
              </div>
            </div>
          )}

          <div className="bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl p-4">
            <b className="text-sm text-[var(--c-texto)]">Histórico — {nomeLocal(local)}</b>
            {!finalizados.length ? (
              <Empty icon={ClipboardCheck} titulo="Nenhum inventário finalizado ainda" descricao="Clique em “Novo inventário” para começar." />
            ) : (
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-xs sm:text-sm">
                  <thead><tr className="text-left text-[var(--c-suave)] text-[11px]">
                    {['Inventário', 'Data', 'Itens', 'OK', 'Diverg.', 'Acuracidade', 'Curva A', 'Curva B', 'Curva C', 'Tempo total', 'Itens/h', ''].map(h =>
                      <th key={h} className="px-2 py-2 font-semibold whitespace-nowrap">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {finalizados.map(i => (
                      <tr key={i.id} onClick={() => navigate(`/inventario/${i.id}`)} className="border-t border-[var(--c-borda)] hover:bg-[var(--c-borda)]/40 cursor-pointer">
                        <td className="px-2 py-2 font-semibold whitespace-nowrap">#{i.id}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{fmtData(i.criado_em)}</td>
                        <td className="px-2 py-2">{fmtNum(i.resumo.contados)}</td>
                        <td className="px-2 py-2 text-green-400">{fmtNum(i.resumo.ok)}</td>
                        <td className="px-2 py-2 text-red-400">{fmtNum(i.resumo.divergentes + i.resumo.recontagem)}</td>
                        <td className="px-2 py-2 font-semibold text-green-400">{fmtPct(i.resumo.acuracidade)}</td>
                        <td className="px-2 py-2">{fmtTempo(i.resumo.tempo_curva.A)}</td>
                        <td className="px-2 py-2">{fmtTempo(i.resumo.tempo_curva.B)}</td>
                        <td className="px-2 py-2">{fmtTempo(i.resumo.tempo_curva.C)}</td>
                        <td className="px-2 py-2">{fmtTempo(i.resumo.tempo_seg)}</td>
                        <td className="px-2 py-2">{i.resumo.itens_hora ? fmtNum(i.resumo.itens_hora.toFixed(1)) : '—'}</td>
                        <td className="px-2 py-2"><TagStatus status={i.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
      </>}

      {novo && <NovoInventario local={local} saldoMax={saldoMax} onFechar={() => setNovo(false)}
        onCriado={(id) => { setNovo(false); navigate(`/inventario/${id}`); }} />}
    </div>
  );
}

function Info({ rotulo, valor }) {
  return <div className="min-w-0"><p className="text-[var(--c-suave)] mb-0.5">{rotulo}</p><p className="text-[var(--c-texto)] font-medium truncate">{valor}</p></div>;
}

function NovoInventario({ local, saldoMax, onFechar, onCriado }) {
  const mkt = local === 'marketplace';
  const [categorias, setCategorias] = useState(['Partes e Peças']);
  const [curvas, setCurvas] = useState(['A', 'B', 'C', '-']);
  const [incluirZerados, setIncluirZerados] = useState(true);
  const [previa, setPrevia] = useState(null);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    setPrevia(null);
    setErro('');
    inventarioService.previa({ local, categorias, curvas, incluirZerados })
      .then(r => vivo && setPrevia(r.data))
      .catch(e => { if (vivo) { setPrevia({ total: 0, grupos: [] }); setErro(e.response?.data?.erro || ''); } });
    return () => { vivo = false; };
  }, [local, categorias.join(), curvas.join(), incluirZerados]);

  const alternar = (lista, set, v) => set(lista.includes(v) ? lista.filter(x => x !== v) : [...lista, v]);

  async function criar() {
    setCriando(true); setErro('');
    try {
      const { data } = await inventarioService.criar({ local, categorias, curvas, incluirZerados });
      if (data.aviso) alert(data.aviso);
      onCriado(data.inventario.id);
    } catch (e) { setErro(e.response?.data?.erro || 'Erro ao criar o inventário.'); }
    finally { setCriando(false); }
  }

  const chip = (ativo) => `px-3 py-1.5 rounded-full text-xs font-medium border ${ativo
    ? 'bg-[var(--c-destaque)] border-[var(--c-destaque)] text-white' : 'border-[var(--c-borda)] text-[var(--c-suave)]'}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3" onClick={onFechar}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-md bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <b className="text-[var(--c-texto)]">Novo inventário — {nomeLocal(local)}</b>
          <button onClick={onFechar} className="text-[var(--c-suave)]"><X size={18} /></button>
        </div>
        {mkt
          ? <p className="text-xs text-[var(--c-suave)]">Entram todos os itens com saldo no depósito <b className="text-[var(--c-texto)]">MKT_PLACE</b> do Zen (endereço MERCADO_LIVRE). Separado do inventário do almoxarifado.</p>
          : <p className="text-xs text-[var(--c-suave)]">Entram os itens com saldo no sistema até <b className="text-[var(--c-texto)]">{saldoMax}</b>. O endereço é buscado no Zen.</p>}
        {!mkt && <div><p className="text-xs text-[var(--c-suave)] mb-2">Categorias</p>
          <div className="flex flex-wrap gap-2">{['Partes e Peças', 'Máquinas'].map(c =>
            <button key={c} onClick={() => alternar(categorias, setCategorias, c)} className={chip(categorias.includes(c))}>{c}</button>)}</div></div>}
        <div><p className="text-xs text-[var(--c-suave)] mb-2">Curvas</p>
          <div className="flex flex-wrap gap-2">{[['A', 'Curva A'], ['B', 'Curva B'], ['C', 'Curva C'], ['-', 'Sem curva']].map(([v, l]) =>
            <button key={v} onClick={() => alternar(curvas, setCurvas, v)} className={chip(curvas.includes(v))}>{l}</button>)}</div></div>
        {!mkt && <label className="flex items-center gap-2 text-sm text-[var(--c-texto)]">
          <input type="checkbox" checked={incluirZerados} onChange={e => setIncluirZerados(e.target.checked)} />
          Incluir itens com saldo 0
        </label>}
        <div className="rounded-xl bg-[var(--c-fundo)] border border-[var(--c-borda)] p-3">
          {!previa ? <div className="flex items-center gap-2 text-xs text-[var(--c-suave)]"><Spinner size={16} className="text-[var(--c-destaque)]" />{mkt && 'Lendo o estoque do marketplace no Zen…'}</div> : (
            <>
              <p className="text-2xl font-bold text-[var(--c-texto)]">{fmtNum(previa.total)} <span className="text-sm font-normal text-[var(--c-suave)]">{mkt ? `itens no marketplace${previa.unidades != null ? ` (${fmtNum(previa.unidades)} unidades)` : ''}` : `itens com saldo até ${saldoMax}`}</span></p>
              <p className="text-xs text-[var(--c-suave)] mt-1">
                {['A', 'B', 'C', '-'].map(c => {
                  const n = previa.grupos.filter(g => g.curva === c).reduce((s, g) => s + g.n, 0);
                  return n ? `${c === '-' ? 'Sem curva' : 'Curva ' + c}: ${fmtNum(n)}` : null;
                }).filter(Boolean).join(' · ')}
              </p>
              {!mkt && <p className="text-[11px] text-[var(--c-suave)] mt-1">Ao criar, saem os itens que só têm saldo fora dos endereços PE (Mercado Livre, AVA, Devolução…).</p>}
            </>
          )}
        </div>
        {erro && <p className="text-sm text-red-400">{erro}</p>}
        <button onClick={criar} disabled={criando || !previa?.total || (!mkt && !categorias.length) || !curvas.length}
          className="w-full py-3 rounded-xl text-sm font-semibold bg-[var(--c-destaque)] text-white disabled:opacity-40 flex items-center justify-center gap-2">
          {criando ? <><Spinner size={14} /> Buscando no Zen…</> : `Criar inventário — ${nomeLocal(local)}`}
        </button>
      </div>
    </div>
  );
}
