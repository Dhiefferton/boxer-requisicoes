// ============================================================
// components/cart/CartDrawer.jsx — Carrinho (drawer)
// ============================================================
import { useNavigate } from 'react-router-dom';
import { X, ShoppingCart, Minus, Plus, Trash2, ArrowRight } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { Button, Empty } from '../ui';

export default function CartDrawer({ open, onClose }) {
  const { itens, remover, ajustar, totalItens } = useCart();
  const navigate = useNavigate();

  function irParaRevisao() {
    onClose();
    navigate('/revisao');
  }

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* ── Drawer lateral (desktop) / bottom sheet (mobile) ── */}
      <div className={`
        fixed z-50 bg-[var(--c-superficie)] border-[var(--c-borda)] transition-transform duration-300 ease-out
        flex flex-col

        /* Mobile: sobe de baixo */
        bottom-0 left-0 right-0 max-h-[85vh] rounded-t-2xl border-t
        md:bottom-auto md:top-0 md:left-auto md:right-0 md:h-full md:w-96 md:max-h-none
        md:rounded-none md:rounded-l-2xl md:border-l md:border-t-0

        ${open
          ? 'translate-y-0 md:translate-x-0'
          : 'translate-y-full md:translate-y-0 md:translate-x-full'
        }
      `}>

        {/* Handle mobile */}
        <div className="md:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-[var(--c-borda)] rounded-full" />
        </div>

        {/* Header do drawer */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-borda)]">
          <div className="flex items-center gap-2.5">
            <ShoppingCart size={18} className="text-[var(--c-destaque)]" />
            <h2 className="font-semibold text-[var(--c-texto)]">Carrinho</h2>
            {totalItens > 0 && (
              <span className="bg-[var(--c-destaque)]/20 text-[var(--c-destaque)] text-xs font-bold px-2 py-0.5 rounded-full">
                {totalItens} {totalItens === 1 ? 'item' : 'itens'}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[var(--c-suave)] hover:text-[var(--c-texto)] hover:bg-[var(--c-borda)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Lista de itens */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {itens.length === 0
            ? <Empty
                icon={ShoppingCart}
                titulo="Carrinho vazio"
                descricao="Adicione itens do catálogo para continuar"
              />
            : itens.map(({ material, quantidade }) => (
                <div
                  key={material.id}
                  className="bg-[var(--c-cartao)] rounded-xl p-3.5 flex gap-3"
                >
                  {/* Info do material */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--c-destaque)] font-medium">{material.codigo}</p>
                    <p className="text-sm text-[var(--c-texto)] font-medium leading-snug mt-0.5 truncate">
                      {material.descricao}
                    </p>
                    <p className="text-xs text-[var(--c-suave)] mt-0.5">{material.unidade}</p>
                  </div>

                  {/* Controles de quantidade */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <button
                      onClick={() => remover(material.id)}
                      className="p-1 text-[var(--c-suave)] hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => ajustar(material.id, -1)}
                        className="w-7 h-7 rounded-lg bg-[var(--c-borda)] hover:bg-[var(--c-borda-forte)] text-[var(--c-texto)]
                                   flex items-center justify-center transition-colors active:scale-90"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="w-8 text-center text-sm font-semibold text-[var(--c-texto)]">
                        {quantidade}
                      </span>
                      <button
                        onClick={() => ajustar(material.id, +1)}
                        className="w-7 h-7 rounded-lg bg-[var(--c-borda)] hover:bg-[var(--c-borda-forte)] text-[var(--c-texto)]
                                   flex items-center justify-center transition-colors active:scale-90"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
          }
        </div>

        {/* Footer com botão de revisão */}
        {itens.length > 0 && (
          <div className="px-4 py-4 border-t border-[var(--c-borda)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-[var(--c-suave)]">Total de itens</span>
              <span className="text-sm font-semibold text-[var(--c-texto)]">{totalItens}</span>
            </div>
            <Button onClick={irParaRevisao} className="w-full" size="lg">
              Revisar e enviar
              <ArrowRight size={16} />
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
