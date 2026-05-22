// ============================================================
// context/CartContext.jsx — Estado Global do Carrinho
// ============================================================
import { createContext, useContext, useState, useCallback } from 'react';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [itens, setItens]         = useState([]);
  const [feedbackId, setFeedbackId] = useState(null); // id do item recém-adicionado

  // Dispara feedback visual por 1.2s
  function dispararFeedback(materialId) {
    setFeedbackId(materialId);
    setTimeout(() => setFeedbackId(null), 1200);
  }

  const adicionar = useCallback((material) => {
    setItens(prev => {
      const existe = prev.find(i => i.material.id === material.id);
      if (existe) {
        return prev.map(i =>
          i.material.id === material.id
            ? { ...i, quantidade: i.quantidade + 1 }
            : i
        );
      }
      return [...prev, { material, quantidade: 1 }];
    });
    dispararFeedback(material.id);
  }, []);

  const remover = useCallback((materialId) => {
    setItens(prev => prev.filter(i => i.material.id !== materialId));
  }, []);

  const ajustar = useCallback((materialId, delta) => {
    setItens(prev =>
      prev
        .map(i => i.material.id === materialId
          ? { ...i, quantidade: i.quantidade + delta }
          : i
        )
        .filter(i => i.quantidade > 0)
    );
  }, []);

  const limpar = useCallback(() => setItens([]), []);

  const totalItens = itens.reduce((acc, i) => acc + i.quantidade, 0);

  return (
    <CartContext.Provider value={{ itens, adicionar, remover, ajustar, limpar, totalItens, feedbackId }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart deve estar dentro de CartProvider');
  return ctx;
}
