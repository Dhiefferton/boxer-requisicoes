// ============================================================
// middlewares/auth.js — Verificação de Token JWT
// ============================================================
// Este middleware protege as rotas. Coloque-o antes de qualquer
// rota que exija login.
//
// Uso em rotas:
//   router.get('/materiais', autenticar, controller)
//   router.get('/admin/x', autenticar, exigirPerfil('admin'), controller)
// ============================================================

import jwt from 'jsonwebtoken';

// Verifica se o usuário está autenticado
export function autenticar(req, res, next) {
  // O token vem no header: Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      erro: 'Acesso negado. Faça login para continuar.'
    });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Adiciona os dados do usuário na requisição para usar nos controllers
    req.usuario = {
      id:              payload.id,
      nome:            payload.nome,
      email:           payload.email,
      perfil:          payload.perfil,
      departamento_id: payload.departamento_id,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
    }
    return res.status(401).json({ erro: 'Token inválido.' });
  }
}

// Restringe uma rota a um ou mais perfis específicos
// Uso: exigirPerfil('admin') ou exigirPerfil('operador', 'admin')
export function exigirPerfil(...perfis) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ erro: 'Não autenticado.' });
    }
    if (!perfis.includes(req.usuario.perfil)) {
      return res.status(403).json({
        erro: `Acesso restrito. Necessário perfil: ${perfis.join(' ou ')}.`
      });
    }
    next();
  };
}
