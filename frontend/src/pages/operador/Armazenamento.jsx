// ============================================================
// pages/operador/Armazenamento.jsx — Armazenamento de vídeos (Vercel Blob)
// ============================================================
// Acompanha o uso da cota grátis da Vercel (espaço, envios, aberturas e
// transferência do mês) e avisa a partir de 90%. No plano grátis, passar de
// 100% bloqueia os vídeos por 30 dias — por isso o envio é barrado antes.
// Lista os vídeos/arquivos guardados (maiores primeiro) para liberar espaço.
// ============================================================
import { useEffect, useState } from 'react';
import { HardDrive, Trash2, RefreshCw, AlertTriangle, ExternalLink, Save } from 'lucide-react';
import { blobService } from '../../services/api';
import { Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { mexeTela } from '../../utils/telas';

const fmtTam = (b) => {
  const n = Number(b) || 0;
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(0, Math.round(n / 1024))} KB`;
};
const fmtVal = (i, v) => (i.unidade === 'bytes' ? fmtTam(v) : Number(v || 0).toLocaleString('pt-BR'));
const cor = (pct) => (pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-[var(--c-destaque)]');
const inp = 'w-full bg-[var(--c-fundo)] border border-[var(--c-borda)] text-[var(--c-texto)] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[var(--c-destaque)]';

export default function Armazenamento() {
  const { usuario } = useAuth();
  const podeEditar = mexeTela(usuario, 'armazenamento');
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [lim, setLim] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [conferido, setConferido] = useState(null);
  const [conferindo, setConferindo] = useState(false);

  async function carregar() {
    try { const { data } = await blobService.uso(); setDados(data); setLim(data.limites); }
    catch (e) { setErro(e.response?.data?.erro || 'Não consegui carregar o uso do armazenamento.'); }
  }
  useEffect(() => { carregar(); }, []);

  async function salvarLimites() {
    setSalvando(true); setErro('');
    try { const { data } = await blobService.limites(lim); setDados(d => ({ ...d, ...data })); }
    catch (e) { setErro(e.response?.data?.erro || 'Erro ao salvar.'); }
    finally { setSalvando(false); }
  }
  async function excluir(a) {
    if (!confirm(`Excluir "${a.nome || 'arquivo'}" (${fmtTam(a.tamanho)})? Ele sai do card e do armazenamento. Não dá para desfazer.`)) return;
    try { await blobService.excluir(a.id); carregar(); }
    catch (e) { alert(e.response?.data?.erro || 'Erro ao excluir.'); }
  }
  async function conferir() {
    setConferindo(true); setErro('');
    try { const { data } = await blobService.conferir(); setConferido(data); }
    catch (e) { setErro(e.response?.data?.erro || 'Erro ao conferir.'); }
    finally { setConferindo(false); }
  }

  if (!dados) return <div className="flex justify-center py-16">{erro ? <p className="text-sm text-red-400">{erro}</p> : <Spinner className="text-[var(--c-destaque)]" />}</div>;

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--c-texto)] flex items-center gap-2"><HardDrive size={18} /> Armazenamento de vídeos</h1>
          <p className="text-sm text-[var(--c-suave)] mt-0.5">Vídeos e arquivos grandes dos cards (até 500 MB cada), guardados no Vercel Blob. Aviso a partir de 90% da cota grátis.</p>
        </div>
        <button onClick={carregar} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border border-[var(--c-borda)] bg-[var(--c-superficie)] text-[var(--c-texto)] hover:border-[var(--c-destaque)]">
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>
      {erro && <p className="text-xs text-red-400">{erro}</p>}

      {!dados.configurado && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300 space-y-1">
          <p className="font-semibold flex items-center gap-2"><AlertTriangle size={15} /> O armazenamento ainda não está ligado</p>
          <p className="text-xs">No painel da Vercel, abra o projeto <b>boxer-requisicoes-2kyh</b> (o do servidor) → <b>Storage</b> → <b>Create Database</b> → <b>Blob</b> (acesso <b>Public</b> e marcando o token de leitura/escrita) → <b>Create</b>. Depois faça um Redeploy do servidor. Até lá, vídeos não podem ser enviados.</p>
        </div>
      )}
      {dados.alerta && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          <p className="font-semibold flex items-center gap-2"><AlertTriangle size={15} /> {dados.maior.nome} em {dados.maior.pct}% da cota grátis</p>
          <p className="text-xs mt-1">No plano grátis, ao passar de 100% a Vercel bloqueia os vídeos por 30 dias. Exclua vídeos antigos abaixo ou mude para o plano Pro (e ajuste os limites).</p>
        </div>
      )}

      {/* Uso */}
      <div className="grid sm:grid-cols-2 gap-3">
        {dados.itens.map(i => (
          <div key={i.chave} className="rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4 space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-semibold text-[var(--c-texto)]">{i.nome}</p>
              <p className={`text-sm font-bold ${i.pct >= 90 ? 'text-red-400' : i.pct >= 70 ? 'text-amber-400' : 'text-[var(--c-texto)]'}`}>{i.pct}%</p>
            </div>
            <div className="h-2 rounded-full bg-[var(--c-borda)] overflow-hidden">
              <div className={`h-full ${cor(i.pct)}`} style={{ width: `${Math.min(100, i.pct)}%` }} />
            </div>
            <p className="text-[11px] text-[var(--c-suave)]">{fmtVal(i, i.usado)} de {fmtVal(i, i.limite)}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-[var(--c-suave)]">
        {dados.arquivos} arquivo(s) guardado(s). Envios e aberturas são contados pelo B-Requisições; a transferência é estimada (tamanho do vídeo × vezes que foi aberto).
        O número oficial fica no painel da Vercel (Observability → Blob).
      </p>

      {/* Limites e conferência */}
      {podeEditar && lim && (
        <div className="rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4 space-y-3">
          <p className="text-sm font-bold text-[var(--c-texto)]">Cota (plano grátis Hobby: 1 GB, 2.000 envios, 10.000 aberturas e 10 GB/mês)</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="text-[11px] text-[var(--c-suave)]">Espaço (GB)<input value={lim.armazenamento_gb} onChange={e => setLim(l => ({ ...l, armazenamento_gb: e.target.value }))} inputMode="decimal" className={`${inp} mt-1`} /></label>
            <label className="text-[11px] text-[var(--c-suave)]">Operações avançadas/mês<input value={lim.operacoes_avancadas} onChange={e => setLim(l => ({ ...l, operacoes_avancadas: e.target.value }))} inputMode="numeric" className={`${inp} mt-1`} /></label>
            <label className="text-[11px] text-[var(--c-suave)]">Operações simples/mês<input value={lim.operacoes_simples} onChange={e => setLim(l => ({ ...l, operacoes_simples: e.target.value }))} inputMode="numeric" className={`${inp} mt-1`} /></label>
            <label className="text-[11px] text-[var(--c-suave)]">Transferência (GB/mês)<input value={lim.transferencia_gb} onChange={e => setLim(l => ({ ...l, transferencia_gb: e.target.value }))} inputMode="decimal" className={`${inp} mt-1`} /></label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={salvarLimites} disabled={salvando} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--c-destaque)] text-white disabled:opacity-40"><Save size={12} /> Salvar cota</button>
            {dados.configurado && (
              <button onClick={conferir} disabled={conferindo} title="Lê a lista de arquivos na Vercel (gasta 1 operação avançada a cada 1.000 arquivos)"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--c-borda)] text-[var(--c-texto)] disabled:opacity-40">
                {conferindo ? <Spinner size={12} /> : <RefreshCw size={12} />} Conferir espaço real na Vercel
              </button>
            )}
            {conferido && <span className="text-xs text-[var(--c-texto)]">Na Vercel: <b>{fmtTam(conferido.bytes)}</b> em {conferido.arquivos} arquivo(s).</span>}
          </div>
        </div>
      )}

      {/* Arquivos */}
      <div className="rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] overflow-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-[var(--c-borda)]">
            <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--c-suave)]">
              <th className="px-3 py-2">Arquivo</th><th className="px-3 py-2">Card</th><th className="px-3 py-2 text-right">Tamanho</th>
              <th className="px-3 py-2">Enviado</th>{podeEditar && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {dados.lista.map(a => (
              <tr key={a.id} className="border-b border-[var(--c-borda)] last:border-0">
                <td className="px-3 py-2"><a href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--c-destaque)] hover:underline break-all">{a.nome || 'arquivo'} <ExternalLink size={10} /></a></td>
                <td className="px-3 py-2 text-[var(--c-texto)]">{a.quadro === 'orc' ? 'Orçamento' : 'Lojinha'} · {a.card || `#${a.pedido_id}`}</td>
                <td className="px-3 py-2 text-right font-semibold text-[var(--c-texto)] whitespace-nowrap">{fmtTam(a.tamanho)}</td>
                <td className="px-3 py-2 text-[var(--c-suave)] whitespace-nowrap">{new Date(a.criado_em).toLocaleDateString('pt-BR')} · {a.usuario_nome?.split(' ')[0] || '—'}</td>
                {podeEditar && <td className="px-3 py-2 text-right"><button onClick={() => excluir(a)} title="Excluir" className="p-1.5 rounded-lg text-[var(--c-suave)] hover:text-red-400 hover:bg-red-500/10"><Trash2 size={13} /></button></td>}
              </tr>
            ))}
            {!dados.lista.length && <tr><td colSpan={5} className="py-8 text-center text-[var(--c-suave)]">Nenhum vídeo ou arquivo grande guardado ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
