bash

cat > /mnt/user-data/outputs/MaterialCard.jsx << 'EOF'
// ============================================================
// components/catalog/MaterialCard.jsx — Card do catálogo
// ============================================================
import { Plus, Minus } from 'lucide-react';
import { useState } from 'react';
import { useCart } from '../../context/CartContext';
import { StockBadge } from '../ui';

export default function MaterialCard({ material }) {
  const { adicionar, itens } = useCart();
  const [qtd, setQtd] = useState(1);

  const noCarrinho = itens.find(i => i.material.id === material.id);
  const semEstoque = material.status_estoque === 'sem_estoque';

  function handleAdicionar() {
    if (semEstoque) return;
    for (let i = 0; i < qtd; i++) adicionar(material);
    setQtd(1);
  }

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
          {material.categoria_nome}
        </p>
        {/* Saldo do estoque */}
        {material.quantidade !== null && material.quantidade !== undefined && (
          <p className="text-xs mt-0.5">
            Estoque:{' '}
            <span className={`font-medium ${
              semEstoque ? 'text-red-400' :
              material.quantidade <= material.nivel_minimo ? 'text-yellow-400' :
              'text-green-400'
            }`}>
              {material.quantidade}
            </span>
          </p>
        )}
      </div>

      {/* Quantidade no carrinho (se houver) */}
      {noCarrinho && (
        <div className="text-xs text-[#4f6ef7] font-medium">
          {noCarrinho.quantidade}× no carrinho
        </div>
      )}

      {/* Seletor de quantidade + botão adicionar */}
      {!semEstoque ? (
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#12141d] border border-[#2e3347] rounded-xl overflow-hidden">
            <button
              onClick={() => setQtd(q => Math.max(1, q - 1))}
              className="px-2 py-2 text-[#8b91a8] hover:text-[#e8eaf0] transition-colors"
            >
              <Minus size={13} />
            </button>
            <input
              type="number"
              min={1}
              value={qtd}
              onChange={e => setQtd(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-8 text-center text-sm text-[#e8eaf0] bg-transparent outline-none"
            />
            <button
              onClick={() => setQtd(q => q + 1)}
              className="px-2 py-2 text-[#8b91a8] hover:text-[#e8eaf0] transition-colors"
            >
              <Plus size={13} />
            </button>
          </div>
          <button
            onClick={handleAdicionar}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium
              bg-[#4f6ef7]/15 text-[#4f6ef7] hover:bg-[#4f6ef7]/25 transition-all duration-200 active:scale-95"
          >
            <Plus size={15} /> Adicionar
          </button>
        </div>
      ) : (
        <button
          disabled
          className="w-full py-2.5 rounded-xl text-sm font-medium bg-[#2e3347] text-[#8b91a8] cursor-not-allowed"
        >
          Sem estoque
        </button>
      )}
    </div>
  );
}
EOF
echo "MaterialCard gerado!"
Saída

MaterialCard gerado!
