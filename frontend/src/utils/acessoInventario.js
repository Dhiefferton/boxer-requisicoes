// ============================================================
// utils/acessoInventario.js — Quem acessa a tela de Inventário
// ============================================================
// Admin e operador, e os colaboradores abaixo (mesmo acesso do operador:
// ver, iniciar e contar; recontagem, ajuste no Zen e cancelar seguem só admin).
// Manter igual a INVENTARIO_COLABORADORES em backend/src/routes/index.js

export const INVENTARIO_COLABORADORES = [
  'caua.pedroso@boxer.com.br',
  'alexsander.lucas@boxer.com.br',
];

// Recontagem: só o Alexsander. Manter igual a RECONTAGEM_EMAILS em
// backend/src/controllers/inventarioController.js
export const RECONTAGEM_EMAILS = ['alexsander.lucas@boxer.com.br'];
export const podeRecontar = (usuario) => RECONTAGEM_EMAILS.includes(String(usuario?.email || '').trim().toLowerCase());

export function podeVerInventario(usuario) {
  return ['admin', 'operador'].includes(usuario?.perfil)
    || INVENTARIO_COLABORADORES.includes(String(usuario?.email || '').trim().toLowerCase());
}
