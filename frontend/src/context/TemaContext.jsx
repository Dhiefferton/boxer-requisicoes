// ============================================================
// context/TemaContext.jsx — Modo claro / escuro
// ============================================================
// Guarda a escolha no navegador (localStorage 'boxer_tema') e aplica
// data-tema="claro" no <html>. Escuro é o padrão.
import { createContext, useContext, useEffect, useState } from 'react';

const TemaContext = createContext({ tema: 'escuro', alternarTema: () => {} });

// Cores para gráficos (SVG não lê as variáveis CSS do tema)
export const CORES_TEMA = {
  escuro: { texto: '#e8eaf0', suave: '#8b91a8', borda: '#2e3347', superficie: '#1a1d27', fundo: '#0f1117' },
  claro:  { texto: '#1b1f2e', suave: '#5c637a', borda: '#dde1ea', superficie: '#ffffff', fundo: '#f4f5f9' },
};

function temaSalvo() {
  try { return localStorage.getItem('boxer_tema') === 'claro' ? 'claro' : 'escuro'; } catch { return 'escuro'; }
}

export function TemaProvider({ children }) {
  const [tema, setTema] = useState(temaSalvo);

  useEffect(() => {
    const raiz = document.documentElement;
    if (tema === 'claro') raiz.dataset.tema = 'claro';
    else delete raiz.dataset.tema;
    try { localStorage.setItem('boxer_tema', tema); } catch { /* sem storage */ }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', CORES_TEMA[tema].fundo);
  }, [tema]);

  const alternarTema = () => setTema(t => (t === 'claro' ? 'escuro' : 'claro'));

  return (
    <TemaContext.Provider value={{ tema, alternarTema, cores: CORES_TEMA[tema] }}>
      {children}
    </TemaContext.Provider>
  );
}

export function useTema() {
  return useContext(TemaContext);
}
