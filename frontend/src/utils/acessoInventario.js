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
// Liberados por colaborador em Admin > Usuários (padrão: só o Alexsander)
export const podeRecontar = (usuario) => temBotao(usuario, 'inv_recontagem');
export const podeFinalizar = (usuario) => temBotao(usuario, 'inv_finalizar');

// Também respeita as telas escolhidas no cadastro do colaborador (utils/telas.js)
import { veTela, temBotao } from './telas';
export function podeVerInventario(usuario) {
  return veTela(usuario, 'inventario');
}
