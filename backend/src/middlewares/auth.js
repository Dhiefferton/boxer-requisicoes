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
import { query } from '../config/db.js';

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

// Restringe uma rota a admin, OU a usuários de um(ns) setor(es) específico(s)
// (por nome do departamento, não por perfil). Admin sempre passa, de
// qualquer setor. Comparação sem diferenciar maiúsculas/minúsculas.
// Uso: exigirAdminOuSetor('Sac / Suporte')
export function exigirAdminOuSetor(...nomesSetor) {
  const nomesNormalizados = nomesSetor.map(n => n.trim().toLowerCase());
  return async (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ erro: 'Não autenticado.' });
    if (req.usuario.perfil === 'admin') return next();

    try {
      if (!req.usuario.departamento_id) {
        return res.status(403).json({ erro: `Acesso restrito ao setor: ${nomesSetor.join(' ou ')}.` });
      }
      const result = await query(`SELECT nome FROM departamentos WHERE id = $1`, [req.usuario.departamento_id]);
      const nomeDepto = (result.rows[0]?.nome || '').trim().toLowerCase();
      if (!nomesNormalizados.includes(nomeDepto)) {
        return res.status(403).json({ erro: `Acesso restrito ao setor: ${nomesSetor.join(' ou ')}.` });
      }
      next();
    } catch (err) { next(err); }
  };
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
