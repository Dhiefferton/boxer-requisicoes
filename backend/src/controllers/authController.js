// ============================================================
// controllers/authController.js — Login e Autenticação
// ============================================================

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../config/db.js';

// Schema de validação do login
const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(1, 'Senha obrigatória'),
});

// POST /auth/login
export async function login(req, res, next) {
  try {
    // Valida os dados de entrada
    const { email, senha } = loginSchema.parse(req.body);

    // Busca o usuário pelo e-mail
    const result = await query(
      `SELECT u.id, u.nome, u.email, u.senha_hash, u.perfil, u.ativo,
              u.departamento_id, d.nome AS departamento_nome
       FROM usuarios u
       LEFT JOIN departamentos d ON d.id = u.departamento_id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    const usuario = result.rows[0];

    // Resposta genérica para não revelar se o e-mail existe ou não
    const erroGenerico = { erro: 'E-mail ou senha incorretos.' };

    if (!usuario) return res.status(401).json(erroGenerico);
    if (!usuario.ativo) return res.status(403).json({ erro: 'Usuário desativado. Entre em contato com o administrador.' });

    // Verifica a senha contra o hash
    const senhaCorreta = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaCorreta) return res.status(401).json(erroGenerico);

    // Gera o token JWT
    const payload = {
      id:              usuario.id,
      nome:            usuario.nome,
      email:           usuario.email,
      perfil:          usuario.perfil,
      departamento_id: usuario.departamento_id,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    });

    // Atualiza o último acesso
    await query('UPDATE usuarios SET ultimo_acesso = NOW() WHERE id = $1', [usuario.id]);

    // Log de login
    await query(
      `INSERT INTO logs (usuario_id, acao, payload_json, ip)
       VALUES ($1, 'LOGIN', $2, $3)`,
      [usuario.id, JSON.stringify({ email: usuario.email }), req.ip]
    );

    // Retorna o token e os dados do usuário (sem a senha)
    res.json({
      token,
      usuario: {
        id:                 usuario.id,
        nome:               usuario.nome,
        email:              usuario.email,
        perfil:             usuario.perfil,
        departamento_id:    usuario.departamento_id,
        departamento_nome:  usuario.departamento_nome,
      }
    });

  } catch (err) {
    next(err);
  }
}

// GET /auth/me — Retorna os dados do usuário logado
// Útil para o frontend verificar se o token ainda é válido
export async function me(req, res, next) {
  try {
    const result = await query(
      `SELECT u.id, u.nome, u.email, u.perfil, u.departamento_id,
              d.nome AS departamento_nome
       FROM usuarios u
       LEFT JOIN departamentos d ON d.id = u.departamento_id
       WHERE u.id = $1 AND u.ativo = TRUE`,
      [req.usuario.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }

    res.json({ usuario: result.rows[0] });
  } catch (err) {
    next(err);
  }
}
