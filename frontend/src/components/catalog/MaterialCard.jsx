// ============================================================
// components/catalog/MaterialCard.jsx - Card do catalogo
// ============================================================
import { Plus, Minus, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useCart } from '../../context/CartContext';
import { StockBadge } from '../ui';

export default function MaterialCard({ material }) {
  const { adicionar, itens } = useCart();
  const [qtd, setQtd] = useState(1);

  const noCarrinho = itens.find(i => i.material.id === material.id);
  const semEstoque = material.status_estoque === 'sem_estoque';

  const qtdExibida = material.categoria_id === 6 ? (material.quantidade_erp ?? material.quantidade) : material.quantidade;
  const temSyncErp = material.categoria_id === 6 && material.quantidade_erp !== null && material.quantidade_erp !== undefined;

  const corQtd = semEstoque ? 'text-red-400' :
    material.status_estoque === 'baixo_estoque' ? 'text-yellow-400' : 'text-green-400';

  function formatSync(ts) {
    if (!ts) return null;
    const d = new Date(ts);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function handleAdicionar() {
    if (semEstoque) return;
    for (let i = 0; i < qtd; i++) adicionar(material);
    setQtd(1);
  }

  return (
    <div className={`
      bg-[var(--c-superficie)] border rounded-2xl p-3 sm:p-4 flex flex-col gap-3 min-w-0
      transition-all duration-200
      ${noCarrinho ? 'border-[var(--c-destaque)]/40' : 'border-[var(--c-borda)] hover:border-[var(--c-borda-forte)]'}
    `}>
      {/* Cabecalho: codigo + badge de estoque */}
      <div className="flex flex-wrap items-start justify-between gap-1.5">
        <span className="max-w-full truncate text-xs font-mono text-[var(--c-destaque)] bg-[var(--c-destaque)]/10 px-2 py-0.5 rounded-lg">
          {material.codigo}
        </span>
        <StockBadge status={material.status_estoque} />
      </div>

      {/* Descricao */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--c-texto)] leading-snug line-clamp-3 sm:line-clamp-2 break-words">
          {material.descricao}
        </p>
        <p className="text-xs text-[var(--c-suave)] mt-1.5">
          {material.categoria_nome}
        </p>

        {/* Estoque ERP */}
        {qtdExibida !== null && qtdExibida !== undefined && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <p className="text-xs">
              Estoque:{' '}
              <span className={`font-semibold ${corQtd}`}>
                {qtdExibida} {material.unidade || 'un'}
              </span>
            </p>
            {temSyncErp && (
              <span className="flex items-center gap-0.5 text-[10px] text-[var(--c-suave)]">
                <RefreshCw size={9} />
                {formatSync(material.ultima_sync_erp)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Quantidade no carrinho */}
      {noCarrinho && (
        <div className="text-xs text-[var(--c-destaque)] font-medium">
          {noCarrinho.quantidade}x no carrinho
        </div>
      )}

      {/* Seletor de quantidade + botao adicionar */}
      {!semEstoque ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex items-center justify-between bg-[var(--c-fundo-2)] border border-[var(--c-borda)] rounded-xl overflow-hidden">
            <button
              onClick={() => setQtd(q => Math.max(1, q - 1))}
              className="px-3 sm:px-2 py-2 text-[var(--c-suave)] hover:text-[var(--c-texto)] transition-colors"
            >
              <Minus size={13} />
            </button>
            <input
              type="number"
              min={1}
              value={qtd}
              onChange={e => setQtd(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-10 sm:w-8 min-w-0 text-center text-sm text-[var(--c-texto)] bg-transparent outline-none"
            />
            <button
              onClick={() => setQtd(q => q + 1)}
              className="px-3 sm:px-2 py-2 text-[var(--c-suave)] hover:text-[var(--c-texto)] transition-colors"
            >
              <Plus size={13} />
            </button>
          </div>
          <button
            onClick={handleAdicionar}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium
              bg-[var(--c-destaque)]/15 text-[var(--c-destaque)] hover:bg-[var(--c-destaque)]/25 transition-all duration-200 active:scale-95"
          >
            <Plus size={15} /> Adicionar
          </button>
        </div>
      ) : (
        <button
          disabled
          className="w-full py-2.5 rounded-xl text-sm font-medium bg-[var(--c-borda)] text-[var(--c-suave)] cursor-not-allowed"
        >
          Sem estoque
        </button>
      )}
    </div>
  );
}
