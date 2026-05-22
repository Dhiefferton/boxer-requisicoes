// ============================================================
// components/catalog/MaterialCard.jsx — Card do catálogo
// ============================================================
import { Plus, Check } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { StockBadge } from '../ui';

export default function MaterialCard({ material }) {
  const { adicionar, feedbackId, itens } = useCart();

  const noCarrinho    = itens.find(i => i.material.id === material.id);
  const acabouDeAdicionar = feedbackId === material.id;
  const semEstoque    = material.status_estoque === 'sem_estoque';

  return (
    <div className={`
      bg-[#1a1d27] border rounded-2xl p-4 flex flex-col gap-3
      transition-all duration-200
      ${noCarrinho ? 'border-[#4f6ef7]/40' : 'border-[#2e3347] hover:border-[#383d54]'}
    `}>

      {/* Cabeçalho: código + badge de estoque */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-mono text-[#4f6ef7] bg-[#4f6ef7]/10 px-2 py-0.5 rounded-lg">
          {material.codigo}
        </span>
        <StockBadge status={material.status_estoque} />
      </div>

      {/* Descrição */}
      <div className="flex-1">
        <p className="text-sm font-medium text-[#e8eaf0] leading-snug line-clamp-2">
          {material.descricao}
        </p>
        <p className="text-xs text-[#8b91a8] mt-1.5">
          {material.categoria_nome} · {material.unidade}
        </p>
      </div>

      {/* Quantidade no carrinho (se houver) */}
      {noCarrinho && (
        <div className="text-xs text-[#4f6ef7] font-medium">
          {noCarrinho.quantidade}× no carrinho
        </div>
      )}

      {/* Botão adicionar */}
      <button
        onClick={() => !semEstoque && adicionar(material)}
        disabled={semEstoque}
        className={`
          w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium
          transition-all duration-200 active:scale-95
          ${semEstoque
            ? 'bg-[#2e3347] text-[#8b91a8] cursor-not-allowed'
            : acabouDeAdicionar
              ? 'bg-green-500/20 text-green-400'
              : 'bg-[#4f6ef7]/15 text-[#4f6ef7] hover:bg-[#4f6ef7]/25'
          }
        `}
      >
        {acabouDeAdicionar
          ? <><Check size={15} /> Adicionado!</>
          : semEstoque
            ? 'Sem estoque'
            : <><Plus size={15} /> Adicionar</>
        }
      </button>
    </div>
  );
}
