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

export function podeEditarOrcamentos(usuario) {
  return ['admin', 'operador'].includes(usuario?.perfil);
}

export function podeVerOrcamentos(usuario) {
  return podeEditarOrcamentos(usuario)
    || ORCAMENTOS_SOMENTE_LEITURA.includes(String(usuario?.email || '').trim().toLowerCase());
}
