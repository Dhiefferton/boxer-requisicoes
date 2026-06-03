// ============================================================
// components/operador/RequisicaoCard.jsx
// Card completo de uma requisição no painel do operador
// ============================================================
import { useState } from 'react';
import {
  ChevronDown, ChevronUp, User, Building2, Calendar,
  MessageSquare, ArrowRight, Loader2, Package
} from 'lucide-react';
import { requisicoesService } from '../../services/api';
import { StatusBadge } from '../ui';

// Define quais status podem vir depois do atual
const PROXIMOS_STATUS = {
  solicitado:   [{ value: 'em_separacao', label: 'Iniciar separação' }],
  em_separacao: [{ value: 'separado',     label: 'Marcar como separado' }],
  separado:     [{ value: 'entregue',     label: 'Confirmar entrega' }],
  entregue:     [],
  cancelado:    [],
};

const CANCELAR_DE = ['solicitado', 'em_separacao', 'separado'];

export default function RequisicaoCard({ requisicao, onMudarStatus }) {
  const [expandido,   setExpandido]   = useState(false);
  const [detalhe,     setDetalhe]     = useState(null);
  const [carregando,  setCarregando]  = useState(false);
  const [processando, setProcessando] = useState(false);
  const [obsModal,    setObsModal]    = useState(null);

  const proximos     = PROXIMOS_STATUS[requisicao.status] || [];
  const podeCancelar = CANCELAR_DE.includes(requisicao.status);

  async function toggleDetalhe() {
    if (expandido) { setExpandido(false); return; }
    setExpandido(true);
    if (!detalhe) {
      setCarregando(true);
      try {
        const { data } = await requisicoesService.detalhar(requisicao.id);
        setDetalhe(data.requisicao);
      } catch { /* silencioso */ }
      finally { setCarregando(false); }
    }
  }

  async function confirmarStatus(status, observacao) {
    setProcessando(true);
    setObsModal(null);
    try {
      await onMudarStatus(requisicao.id, status, observacao);
    } finally {
      setProcessando(false);
    }
  }

  function formatarData(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  function formatarDataNecessidade(data) {
    if (!data) return null;
    // Adiciona horário fixo para evitar problema de fuso horário
    const d = new Date(data + 'T12:00:00');
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('pt-BR');
  }

  const dataNecessidade = formatarDataNecessidade(requisicao.data_necessidade);

  return (
    <>
      <div className={`
        bg-[#1a1d27] border rounded-2xl overflow-hidden transition-colors
        ${processando ? 'opacity-60 pointer-events-none' : ''}
        ${requisicao.status === 'em_separacao' ? 'border-amber-500/30' :
          requisicao.status === 'separado'     ? 'border-purple-500/30' :
          'border-[#2e3347]'}
      `}>

        {/* ── Cabeçalho do card ─────────────────────────── */}
        <div className="px-4 py-4">
          <div className="flex items-start gap-3">

            {/* Número e status */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-[#e8eaf0]">#{requisicao.id}</span>
                <StatusBadge status={requisicao.status} />
                {processando && <Loader2 size={13} className="animate-spin text-[#4f6ef7]" />}
              </div>

              {/* Solicitante */}
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-[#8b91a8]">
                  <User size={12} />
                  <span className="text-[#e8eaf0] font-medium">{requisicao.solicitante_nome}</span>
                </div>
                {requisicao.departamento_nome && (
                  <div className="flex items-center gap-1.5 text-xs text-[#8b91a8]">
                    <Building2 size={12} />
                    {requisicao.departamento_nome}
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-xs text-[#8b91a8]">
                  <Calendar size={12} />
                  {formatarData(requisicao.created_at)}
                  {dataNecessidade && (
                    <span className="ml-2 bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-md">
                      Necessidade: {dataNecessidade}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Contagem de itens */}
            <div className="shrink-0 text-center bg-[#2e3347] rounded-xl px-3 py-2">
              <p className="text-lg font-bold text-[#e8eaf0] leading-none">{requisicao.total_itens}</p>
              <p className="text-[10px] text-[#8b91a8] mt-0.5">itens</p>
            </div>
          </div>

          {/* ── Botões de ação ────────────────────────────── */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {proximos.map(p => (
              <button
                key={p.value}
                onClick={() => setObsModal({ status: p.value, label: p.label })}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold
                           bg-[#4f6ef7]/15 text-[#4f6ef7] hover:bg-[#4f6ef7]/25 transition-colors active:scale-95"
              >
                <ArrowRight size={13} />
                {p.label}
              </button>
            ))}

            {podeCancelar && (
              <button
                onClick={() => setObsModal({ status: 'cancelado', label: 'Cancelar requisição' })}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium
                           text-red-400 hover:bg-red-500/10 transition-colors"
              >
                Cancelar
              </button>
            )}

            <button
              onClick={toggleDetalhe}
              className="ml-auto flex items-center gap-1 text-xs text-[#8b91a8] hover:text-[#e8eaf0] transition-colors"
            >
              {expandido ? <><ChevronUp size={14} /> Fechar</> : <><ChevronDown size={14} /> Detalhes</>}
            </button>
          </div>
        </div>

        {/* ── Detalhes expandidos ───────────────────────── */}
        {expandido && (
          <div className="border-t border-[#2e3347] px-4 py-4 space-y-4 bg-[#21253a]/50">
            {carregando ? (
              <div className="flex justify-center py-4">
                <Loader2 size={20} className="animate-spin text-[#4f6ef7]" />
              </div>
            ) : detalhe ? (
              <>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#8b91a8] mb-2">
                    Itens solicitados
                  </p>
                  <div className="space-y-2">
                    {detalhe.itens.map(item => (
                      <div key={item.id} className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-[#2e3347] flex items-center justify-center shrink-0">
                          <Package size={13} className="text-[#4f6ef7]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-mono text-[#4f6ef7]">{item.codigo_snapshot}</span>
                          <p className="text-sm text-[#e8eaf0] truncate">{item.descricao_snapshot}</p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-[#e8eaf0]">
                          {item.quantidade}
                          <span className="text-[#8b91a8] font-normal text-xs ml-1">{item.unidade_snapshot}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {detalhe.observacoes && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#8b91a8] mb-1">Observações</p>
                    <div className="flex items-start gap-2 bg-[#2e3347] rounded-xl p-3">
                      <MessageSquare size={13} className="text-[#8b91a8] shrink-0 mt-0.5" />
                      <p className="text-sm text-[#e8eaf0]">{detalhe.observacoes}</p>
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#8b91a8] mb-2">Histórico</p>
                  <div className="space-y-1.5">
                    {detalhe.historico?.map((h, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <StatusBadge status={h.status_novo} />
                        <span className="text-[#8b91a8]">
                          {formatarData(h.created_at)}
                          {h.usuario_nome && ` · ${h.usuario_nome}`}
                        </span>
                        {h.observacao && (
                          <span className="text-[#8b91a8] italic">— {h.observacao}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* ── Modal de confirmação de status ─────────────── */}
      {obsModal && (
        <ModalConfirmacao
          label={obsModal.label}
          status={obsModal.status}
          onConfirmar={(obs) => confirmarStatus(obsModal.status, obs)}
          onCancelar={() => setObsModal(null)}
        />
      )}
    </>
  );
}

function ModalConfirmacao({ label, status, onConfirmar, onCancelar }) {
  const [obs, setObs] = useState('');
  const isCancelamento = status === 'cancelado';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onCancelar}
    >
      <div
        className="w-full max-w-sm bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div>
          <h3 className="font-semibold text-[#e8eaf0]">{label}</h3>
          <p className="text-sm text-[#8b91a8] mt-0.5">
            {isCancelamento
              ? 'Esta ação não pode ser desfeita.'
              : 'Confirme para prosseguir com a atualização.'
            }
          </p>
        </div>

        <textarea
          value={obs}
          onChange={e => setObs(e.target.value)}
          placeholder={isCancelamento ? 'Motivo do cancelamento (obrigatório)…' : 'Observação (opcional)…'}
          rows={2}
          className="w-full bg-[#2e3347] border border-[#2e3347] text-[#e8eaf0] rounded-xl px-4 py-2.5
                     text-sm placeholder:text-[#8b91a8] resize-none
                     focus:outline-none focus:border-[#4f6ef7] focus:ring-1 focus:ring-[#4f6ef7]/30"
        />

        <div className="flex gap-2">
          <button
            onClick={onCancelar}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[#2e3347] text-[#8b91a8] hover:text-[#e8eaf0] transition-colors"
          >
            Voltar
          </button>
          <button
            onClick={() => {
              if (isCancelamento && !obs.trim()) return;
              onConfirmar(obs.trim());
            }}
            disabled={isCancelamento && !obs.trim()}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors active:scale-95 disabled:opacity-40
              ${isCancelamento
                ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                : 'bg-[#4f6ef7] text-white hover:bg-[#3d5ce5]'
              }`}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
