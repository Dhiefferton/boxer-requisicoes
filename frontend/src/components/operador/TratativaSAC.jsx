// ============================================================
// components/operador/TratativaSAC.jsx — Tratativa do SAC no Formulário inicial
// ============================================================
// Mostra todos os campos da tratativa (pipe "Tratativa de manutenção - SAC") de
// onde o card de orçamento veio, igual ao Pipefy: campos conectados (Cliente,
// Responsável, Modelo da máquina…) aparecem como caixinhas com os dados do registro.
// Só leitura — vem do Pipefy e é atualizado a cada 30 min (ou no botão).
// ============================================================
import { useEffect, useState } from 'react';
import { RefreshCw, Database, Paperclip, ExternalLink } from 'lucide-react';
import { tratativaService } from '../../services/api';
import { Spinner } from '../ui';

const fmtData = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '');

function Registro({ r }) {
  return (
    <div className="rounded-lg border border-[var(--c-borda)] border-l-4 border-l-[var(--c-borda-forte)] bg-[var(--c-fundo)] p-3 mt-1">
      <p className="text-xs font-semibold text-[var(--c-texto)]">{r.titulo || `Registro ${r.id}`}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-2">
        {r.base && (
          <div className="min-w-0">
            <p className="text-[10px] text-[var(--c-suave)]">Database</p>
            <p className="text-[11px] text-[var(--c-destaque)] flex items-center gap-1"><Database size={10} /> {r.base}</p>
          </div>
        )}
        {(r.campos || []).map((c, i) => (
          <div key={i} className="min-w-0">
            <p className="text-[10px] text-[var(--c-suave)] truncate">{c.nome}</p>
            <p className="text-[11px] text-[var(--c-texto)] break-words">{c.valor}</p>
          </div>
        ))}
        {r.criado_em && (
          <div className="min-w-0">
            <p className="text-[10px] text-[var(--c-suave)]">Criado em</p>
            <p className="text-[11px] text-[var(--c-texto)]">{fmtData(r.criado_em)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

const ehRegistroNS = (c) => /registro.*\bns\b/i.test(String(c?.nome || ''));
const textoCampo = (c) => (c.conectados?.length ? c.conectados.map(r => r.titulo || r.id).join(', ') : c.valor);

export default function TratativaSAC({ pedido, semRegistroNS = false }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [abrindo, setAbrindo] = useState('');

  async function carregar(atualizar = false) {
    setCarregando(true);
    try { const { data } = await tratativaService.ver(pedido.id, atualizar); setDados(data); }
    catch (e) { setDados(d => ({ ...(d || {}), erro: e.response?.data?.erro || 'Não consegui ler a tratativa.' })); }
    finally { setCarregando(false); }
  }
  useEffect(() => { if (pedido.pipefy_card_id) carregar(); }, [pedido.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function abrirAnexo(a) {
    const janela = window.open('', '_blank');
    setAbrindo(a.caminho);
    try {
      const { data } = await tratativaService.anexo(pedido.id, a.caminho);
      if (janela) janela.location.href = data.url; else window.open(data.url, '_blank', 'noopener');
    } catch (e) { janela?.close(); alert(e.response?.data?.erro || 'Não consegui abrir o anexo.'); }
    finally { setAbrindo(''); }
  }

  if (!pedido.pipefy_card_id) return null;
  if (!dados) return <div className="flex items-center gap-2 text-[11px] text-[var(--c-suave)] py-2"><Spinner size={12} /> Lendo a tratativa do SAC…</div>;
  const t = dados.tratativa;

  return (
    <div className="space-y-3 pb-3 mb-3 border-b border-[var(--c-borda)]">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-[var(--c-suave)]">Pipe</p>
          <p className="text-xs text-[var(--c-destaque)] font-semibold">{t?.pipe || 'Tratativa de manutenção - SAC'}</p>
          {t && <p className="text-[10px] text-[var(--c-suave)] mt-0.5">Fase: <span className="text-[var(--c-texto)]">{t.fase || '—'}</span>
            {t.criado_em && <> · criado em {fmtData(t.criado_em)}{t.criado_por ? ` por ${t.criado_por}` : ''}</>}</p>}
        </div>
        <button type="button" onClick={() => carregar(true)} disabled={carregando} title="Ler de novo do Pipefy"
          className="p-1.5 rounded-lg text-[var(--c-suave)] hover:text-[var(--c-texto)] hover:bg-[var(--c-borda)]/40 disabled:opacity-40">
          {carregando ? <Spinner size={12} /> : <RefreshCw size={12} />}
        </button>
        {t?.url && <a href={t.url} target="_blank" rel="noreferrer" title="Abrir a tratativa no Pipefy" className="p-1.5 rounded-lg text-[var(--c-suave)] hover:text-[var(--c-destaque)]"><ExternalLink size={12} /></a>}
      </div>
      {dados.erro && <p className="text-[11px] text-amber-400">{dados.erro}</p>}
      {!t && !dados.erro && <p className="text-[11px] text-[var(--c-suave)]">Este card não veio de uma tratativa do SAC.</p>}
      {t && !semRegistroNS && t.campos.filter(ehRegistroNS).map((c, i) => (
        <div key={`rns-${i}`}>
          <p className="text-[11px] text-[var(--c-suave)]">Registro de NS</p>
          <p className="text-[13px] font-semibold font-mono text-[var(--c-texto)]">{textoCampo(c)}</p>
        </div>
      ))}
      {t && (
        <dl className="flex flex-col gap-3">
          {t.campos.map((c, i) => (
            <div key={c.id || i} className="min-w-0">
              <dt className="text-xs font-semibold text-[var(--c-texto)]">{c.nome}</dt>
              <dd className="text-xs text-[var(--c-texto)] mt-1">
                {c.anexos
                  ? <div className="flex flex-col gap-1">{c.anexos.map(a => (
                      <button key={a.caminho} type="button" onClick={() => abrirAnexo(a)} disabled={abrindo === a.caminho}
                        className="inline-flex items-center gap-1.5 text-left text-[var(--c-destaque)] hover:underline break-all disabled:opacity-50">
                        {abrindo === a.caminho ? <Spinner size={11} /> : <Paperclip size={11} />} {a.nome}
                      </button>))}</div>
                  : c.conectados?.length
                    ? c.conectados.map(r => <Registro key={r.id} r={r} />)
                    : <span className="whitespace-pre-wrap break-words">{c.valor}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
