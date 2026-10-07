// ============================================================
// middlewares/acessoOrcamentos.js — Leitura da tela de Orçamentos
// ============================================================
// Admin e operador: acesso completo (rotas de escrita continuam em
// exigirPerfil('operador', 'admin')).
// Colaboradores abaixo: somente visualização (só a listagem).
// Manter igual a frontend/src/utils/acessoOrcamentos.js

export const ORCAMENTOS_SOMENTE_LEITURA = [
  'estefania.pontes@boxer.com.br',
  'daiani.silva@boxersoldas.com.br',
];

export function exigirLeituraOrcamentos(req, res, next) {
  if (!req.usuario) return res.status(401).json({ erro: 'Não autenticado.' });
  const email = String(req.usuario.email || '').trim().toLowerCase();
  if (['admin', 'operador'].includes(req.usuario.perfil) || ORCAMENTOS_SOMENTE_LEITURA.includes(email)) {
    return next();
  }
  return res.status(403).json({ erro: 'Acesso restrito à tela de Orçamentos.' });
}
