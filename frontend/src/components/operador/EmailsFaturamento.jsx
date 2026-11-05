// ============================================================
// components/operador/EmailsFaturamento.jsx — E-mails ao faturamento (Orçamento)
// ============================================================
// Botão "Email" na fase Liberação de faturamento: ao abrir mostra os e-mails
// mandados ao faturamento (retorno de conserto e prestação de serviço), como o
// Pipefy mostra — assunto, remetente, destinatário, data e o texto completo.
// Os que ainda não saíram aparecem como prévia.
// ============================================================
import { useEffect, useState } from 'react';
import { Mail, ChevronDown, ChevronRight, Check, Copy } from 'lucide-react';
import api from '../../services/api';
import { Spinner } from '../ui';

const fmt = (d) => { try { return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const iniciais = (n) => String(n || 'BR').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();

export default function EmailsFaturamento({ pedidoId }) {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState(-1);
  async function copiar(m, i) {
    try { await navigator.clipboard.writeText(`${m.assunto}\n\n${m.texto}`); setCopiado(i); setTimeout(() => setCopiado(-1), 2000); } catch { /* sem área de transferência */ }
  }
  useEffect(() => {
    let vivo = true;
    api.get(`/pedidos-orcamento/${pedidoId}/emails-faturamento`, { timeout: 60000 })
      .then(r => { if (vivo) setDados(r.data); })
      .catch(e => { if (vivo) setErro(e.response?.data?.erro || 'Não consegui ler os e-mails.'); });
    return () => { vivo = false; };
  }, [pedidoId]);
  const lista = dados ? [...dados.enviados.map(x => ({ ...x, enviado: true })), ...dados.pendentes.map(x => ({ ...x, enviado: false }))] : [];
  return (
    <div className="rounded-lg border border-[var(--c-borda)]" onClick={e => e.stopPropagation()}>
      <button type="button" onClick={() => setAberto(a => !a)}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-[var(--c-texto)] hover:bg-[var(--c-borda)]/30 rounded-lg">
        {aberto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Mail size={13} /> <span className="flex-1 text-left">Email</span>
        {dados ? <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 bg-[var(--c-destaque)] text-white">{dados.enviados.length + dados.pendentes.length}</span> : !erro && <Spinner size={11} />}
      </button>
      {aberto && (
        <div className="px-2.5 pb-2.5 space-y-2.5">
          {erro && <p className="text-[11px] text-red-400">{erro}</p>}
          {dados && !lista.length && <p className="text-[11px] text-[var(--c-suave)]">Nenhum e-mail para este card (sem remessa de conserto e orçamento recusado).</p>}
          {dados?.erro && <p className="text-[11px] text-amber-400">Último erro no envio: {dados.erro}</p>}
          {lista.map((m, i) => (
            <div key={i} className="rounded-xl border border-[var(--c-borda)] bg-[var(--c-fundo)] p-3 space-y-2">
              <div className="flex items-start gap-2">
                <p className="flex-1 text-sm font-bold text-[var(--c-texto)] break-words">{m.assunto}</p>
                <span className={`shrink-0 text-[10px] font-semibold rounded px-1.5 py-0.5 ${m.enviado ? 'bg-[var(--c-borda)] text-[var(--c-suave)]' : 'bg-amber-500/15 text-amber-400'}`}>
                  {m.enviado ? 'Enviado' : 'Não enviado'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 shrink-0 rounded-full bg-[var(--c-destaque)]/20 text-[var(--c-destaque)] text-[11px] font-bold flex items-center justify-center">{iniciais(m.de)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[var(--c-texto)] truncate">{m.de}</p>
                  <p className="text-[11px] text-[var(--c-suave)] truncate">para {m.para}</p>
                </div>
                {m.enviado && <span className="shrink-0 text-[10px] text-[var(--c-suave)] flex items-center gap-1">{fmt(m.enviado_em)} <Check size={11} className="text-green-400" /></span>}
                <button type="button" onClick={() => copiar(m, i)} title="Copiar assunto e texto"
                  className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--c-borda)] text-[10px] font-semibold text-[var(--c-texto)] hover:border-[var(--c-destaque)]">
                  {copiado === i ? <><Check size={11} className="text-green-400" /> Copiado</> : <><Copy size={11} /> Copiar</>}
                </button>
              </div>
              <div className="text-xs text-[var(--c-texto)] whitespace-pre-wrap break-words leading-relaxed border-t border-[var(--c-borda)] pt-2">{m.texto}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
