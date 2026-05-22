// ============================================================
// pages/Historico.jsx — Histórico de Requisições
// ============================================================
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, ChevronRight, Calendar, Package } from 'lucide-react';
import { requisicoesService } from '../services/api';
import { StatusBadge, Spinner, Empty } from '../components/ui';

const STATUS_OPTS = [
  { value: '',             label: 'Todos'        },
  { value: 'solicitado',   label: 'Solicitado'   },
  { value: 'em_separacao', label: 'Em separação' },
  { value: 'separado',     label: 'Separado'     },
  { value: 'entregue',     label: 'Entregue'     },
  { value: 'cancelado',    label: 'Cancelado'    },
];

export default function Historico() {
  const [requisicoes, setRequisicoes] = useState([]);
  const [statusFiltro, setStatusFiltro] = useState('');
  const [loading, setLoading]   = useState(true);
  const [expandido, setExpandido] = useState(null);
  const [detalhe, setDetalhe]   = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (statusFiltro) params.status = statusFiltro;
    requisicoesService.listar(params)
      .then(r => setRequisicoes(r.data.requisicoes))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [statusFiltro]);

  async function toggleDetalhe(id) {
    if (expandido === id) { setExpandido(null); return; }
    setExpandido(id);
    if (!detalhe[id]) {
      try {
        const { data } = await requisicoesService.detalhar(id);
        setDetalhe(prev => ({ ...prev, [id]: data.requisicao }));
      } catch (err) { console.error(err); }
    }
  }

  function formatarData(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-[#e8eaf0]">Histórico de Requisições</h1>
        <p className="text-sm text-[#8b91a8] mt-0.5">Acompanhe o status das suas solicitações</p>
      </div>

      {/* Filtro de status */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {STATUS_OPTS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setStatusFiltro(opt.value)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
              ${statusFiltro === opt.value
                ? 'bg-[#4f6ef7] text-white'
                : 'bg-[#1a1d27] border border-[#2e3347] text-[#8b91a8] hover:text-[#e8eaf0]'
              }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={28} className="text-[#4f6ef7]" /></div>
      ) : requisicoes.length === 0 ? (
        <Empty
          icon={ClipboardList}
          titulo="Nenhuma requisição encontrada"
          descricao={statusFiltro ? 'Tente outro filtro de status' : 'Suas requisições aparecerão aqui'}
        />
      ) : (
        <div className="space-y-2">
          {requisicoes.map(req => (
            <div key={req.id} className="bg-[#1a1d27] border border-[#2e3347] rounded-2xl overflow-hidden">

              {/* Linha principal */}
              <button
                onClick={() => toggleDetalhe(req.id)}
                className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-[#21253a] transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-[#2e3347] flex items-center justify-center shrink-0">
                  <ClipboardList size={16} className="text-[#4f6ef7]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-[#e8eaf0]">Req. #{req.id}</span>
                    <StatusBadge status={req.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-[#8b91a8]">
                    <span className="flex items-center gap-1">
                      <Calendar size={11} />
                      {formatarData(req.created_at)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Package size={11} />
                      {req.total_itens} {req.total_itens === 1 ? 'item' : 'itens'}
                    </span>
                  </div>
                </div>
                <ChevronRight
                  size={16}
                  className={`text-[#8b91a8] transition-transform ${expandido === req.id ? 'rotate-90' : ''}`}
                />
              </button>

              {/* Detalhe expandido */}
              {expandido === req.id && (
                <div className="border-t border-[#2e3347] px-4 py-4 space-y-4">

                  {/* Itens */}
                  {detalhe[req.id] ? (
                    <>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-[#8b91a8] uppercase tracking-wide">Itens</p>
                        {detalhe[req.id].itens.map(item => (
                          <div key={item.id} className="flex justify-between items-start text-sm">
                            <div>
                              <span className="text-[#4f6ef7] font-mono text-xs">{item.codigo_snapshot}</span>
                              <p className="text-[#e8eaf0]">{item.descricao_snapshot}</p>
                            </div>
                            <span className="text-[#8b91a8] shrink-0 ml-3">
                              {item.quantidade} {item.unidade_snapshot}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Histórico de status */}
                      {detalhe[req.id].historico?.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-[#8b91a8] uppercase tracking-wide">Histórico</p>
                          <div className="space-y-1.5">
                            {detalhe[req.id].historico.map((h, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                <StatusBadge status={h.status_novo} />
                                <span className="text-[#8b91a8]">
                                  {formatarData(h.created_at)}
                                  {h.usuario_nome && ` · ${h.usuario_nome}`}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {detalhe[req.id].observacoes && (
                        <div>
                          <p className="text-xs font-semibold text-[#8b91a8] uppercase tracking-wide mb-1">Observações</p>
                          <p className="text-sm text-[#e8eaf0]">{detalhe[req.id].observacoes}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex justify-center py-4">
                      <Spinner size={20} className="text-[#4f6ef7]" />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
