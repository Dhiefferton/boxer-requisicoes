// ============================================================
// utils/acessoOrcamentos.js — Quem acessa a tela de Orçamentos
// ============================================================
// Admin e operador: acesso completo.
// Colaboradores abaixo: somente visualização (ver cards e abrir os links).
// Manter igual a backend/src/middlewares/acessoOrcamentos.js

export const ORCAMENTOS_SOMENTE_LEITURA = [
  'estefania.pontes@boxer.com.br',
  'daiani.silva@boxersoldas.com.br',
];

// Também respeita as telas escolhidas no cadastro do colaborador (utils/telas.js)
import { mexeTela, veTela } from './telas';

export function podeEditarOrcamentos(usuario) {
  return mexeTela(usuario, 'orcamentos');
}

export function podeVerOrcamentos(usuario) {
  return veTela(usuario, 'orcamentos');
}
