// ============================================================
// utils/nomesTelas.jsx — Nomes das telas (renomeadas pelo admin) e telas criadas
// ============================================================
// Lido uma vez (GET /telas) e compartilhado: menu, títulos e Admin > Usuários.
// recarregarTelas() depois de criar/renomear na tela "Telas".
// ============================================================
import { useEffect, useState } from 'react';
import { telasService } from '../services/api';

let dados = { nomes: {}, quadros: [] };
let carregando = null;
const ouvintes = new Set();
const avisar = () => ouvintes.forEach(f => f(dados));

export function recarregarTelas() {
  carregando = telasService.ver()
    .then(r => { dados = { nomes: r.data?.nomes || {}, quadros: r.data?.quadros || [] }; avisar(); return dados; })
    .catch(() => dados);
  return carregando;
}

/** { nomes, quadros } — atualiza sozinho quando alguém recarrega. */
export function useTelas() {
  const [d, setD] = useState(dados);
  useEffect(() => {
    ouvintes.add(setD);
    if (!carregando) recarregarTelas();
    else setD(dados);
    return () => { ouvintes.delete(setD); };
  }, []);
  return d;
}

/** Nome da tela: o renomeado pelo admin, senão o padrão. */
export function useNomeTela(chave, padrao) {
  const { nomes } = useTelas();
  return nomes?.[chave] || padrao;
}
export function NomeTela({ chave, padrao }) {
  return <>{useNomeTela(chave, padrao)}</>;
}
