// ============================================================
// pages/operador/PainelOperador.jsx
// ============================================================
import { useState } from 'react';
import { RefreshCw, LayoutGrid, List, FileDown } from 'lucide-react';
import { useRequisicoes } from '../../hooks/useRequisicoes';
import RequisicaoCard from '../../components/operador/RequisicaoCard';
import { Spinner, StatusBadge, Empty } from '../../components/ui';
import { ClipboardList } from 'lucide-react';
import { requisicoesService } from '../../services/api';
import * as XLSX from 'xlsx';

const COLUNAS = [
  { status: 'solicitado',   label: 'Solicitado',   cor: 'border-blue-500/40'   },
  { status: 'em_separacao', label: 'Em separação', cor: 'border-amber-500/40'  },
  { status: 'separado',     label: 'Separado',     cor: 'border-purple-500/40' },
];

function usarContadores(requisicoes) {
  return {
    solicitado:   requisicoes.filter(r => r.status === 'solicitado').length,
    em_separacao: requisicoes.filter(r => r.status === 'em_separacao').length,
    separado:     requisicoes.filter(r => r.status === 'separado').length,
    entregue:     requisicoes.filter(r => r.status === 'entregue').length,
    cancelado:    requisicoes.filter(r => r.status === 'cancelado').length,
  };
}

function formatarData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

export default function PainelOperador() {
  const [modo,          setModo]          = useState('kanban');
  const [verArquivado,  setVerArquivado]  = useState(false);
  const [gerando,       setGerando]       = useState(false);

  const { requisicoes, loading, erro, recarregar, mudarStatus } = useRequisicoes('');
  const contadores = usarContadores(requisicoes);

  const ativas    = requisicoes.filter(r => !['entregue', 'cancelado'].includes(r.status));
  const arquivadas = requisicoes.filter(r => ['entregue', 'cancelado'].includes(r.status));

  async function gerarRelatorio() {
    setGerando(true);
    try {
      const linhas = [];
      for (const req of requisicoes) {
        linhas.push({
          'Requisicao':      `#${req.id}`,
          'Data':            req.created_at ? new Date(req.created_at).toLocaleDateString('pt-BR') : '-',
          'Solicitante':     req.solicitante_nome || '-',
          'Departamento':    req.departamento_nome || '-',
          'Status':          req.status,
        });
      }
      const ws = XLSX.utils.json_to_sheet(linhas);
      ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 25 }, { wch: 25 }, { wch: 15 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Requisicoes');
      const dataHoje = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
      XLSX.writeFile(wb, `relatorio-requisicoes-${dataHoje}.xlsx`);
    } catch (err) {
      console.error('Erro ao gerar relatorio:', err);
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="space-y-5">

      {/* ── Cabeçalho ───────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-[#e8eaf0]">Painel do Operador</h1>
          <p className="text-sm text-[#8b91a8] mt-0.5">
            {ativas.length} requisição{ativas.length !== 1 ? 'ões' : ''} ativa{ativas.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">

          {/* Botão exportar Excel */}
          <button
            onClick={gerarRelatorio}
            disabled={gerando || requisicoes.length === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold
              bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {gerando
              ? <><RefreshCw size={13} className="animate-spin" /> Gerando...</>
              : <><FileDown size={13} /> Exportar Excel</>
            }
          </button>

          {/* Alternar modo */}
          <div className="flex bg-[#1a1d27] border border-[#2e3347] rounded-xl p-0.5">
            <button
              onClick={() => setModo('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${modo === 'kanban' ? 'bg-[#4f6ef7] text-white' : 'text-[#8b91a8] hover:text-[#e8eaf0]'}`}
            >
              <LayoutGrid size={13} /> Kanban
            </button>
            <button
              onClick={() => setModo('lista')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${modo === 'lista' ? 'bg-[#4f6ef7] text-white' : 'text-[#8b91a8] hover:text-[#e8eaf0]'}`}
            >
              <List size={13} /> Lista
            </button>
          </div>

          {/* Recarregar */}
          <button
            onClick={recarregar}
            disabled={loading}
            className="p-2 rounded-xl text-[#8b91a8] hover:text-[#e8eaf0] hover:bg-[#2e3347] transition-colors"
            title="Atualizar"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Cards de resumo ──────────────────────────────── */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {[
          { key: 'solicitado',   label: 'Solicitados' },
          { key: 'em_separacao', label: 'Separando'   },
          { key: 'separado',     label: 'Separados'   },
          { key: 'entregue',     label: 'Entregues'   },
          { key: 'cancelado',    label: 'Cancelados'  },
        ].map(({ key, label }) => (
          <div key={key} className="bg-[#1a1d27] border border-[#2e3347] rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-[#e8eaf0]">{contadores[key]}</p>
            <p className="text-[10px] text-[#8b91a8] mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Estado de carregamento / erro ────────────────── */}
      {loading && (
        <div className="flex justify-center py-10">
          <Spinner size={28} className="text-[#4f6ef7]" />
        </div>
      )}

      {!loading && erro && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
          {erro} <button onClick={recarregar} className="underline ml-2">Tentar novamente</button>
        </div>
      )}

      {/* ── Modo Kanban ──────────────────────────────────── */}
      {!loading && modo === 'kanban' && (
        <>
          {ativas.length === 0 ? (
            <Empty
              icon={ClipboardList}
              titulo="Nenhuma requisição ativa"
              descricao="Todas as requisições foram processadas"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {COLUNAS.map(col => {
                const itens = ativas.filter(r => r.status === col.status);
                return (
                  <div key={col.status} className="space-y-2">
                    <div className={`flex items-center justify-between px-3 py-2 rounded-xl border ${col.cor} bg-[#1a1d27]`}>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={col.status} />
                      </div>
                      <span className="text-xs font-bold text-[#8b91a8]">{itens.length}</span>
                    </div>
                    {itens.length === 0 ? (
                      <div className="border-2 border-dashed border-[#2e3347] rounded-2xl py-8 text-center">
                        <p className="text-xs text-[#8b91a8]">Sem requisições</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {itens.map(req => (
                          <RequisicaoCard
                            key={req.id}
                            requisicao={req}
                            onMudarStatus={mudarStatus}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {arquivadas.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setVerArquivado(!verArquivado)}
                className="flex items-center gap-2 text-sm text-[#8b91a8] hover:text-[#e8eaf0] transition-colors"
              >
                <span className={`transition-transform ${verArquivado ? 'rotate-90' : ''}`}>▶</span>
                Arquivados ({arquivadas.length})
              </button>
              {verArquivado && (
                <div className="mt-3 space-y-2">
                  {arquivadas.map(req => (
                    <RequisicaoCard key={req.id} requisicao={req} onMudarStatus={mudarStatus} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Modo Lista ───────────────────────────────────── */}
      {!loading && modo === 'lista' && (
        <div className="space-y-2">
          {requisicoes.length === 0 ? (
            <Empty icon={ClipboardList} titulo="Nenhuma requisição" />
          ) : (
            requisicoes.map(req => (
              <RequisicaoCard key={req.id} requisicao={req} onMudarStatus={mudarStatus} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

