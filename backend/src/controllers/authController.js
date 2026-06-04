// ============================================================
// controllers/authController.js — Login e Autenticação
// ============================================================
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../config/db.js';

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(1, 'Senha obrigatória'),
});

// POST /auth/login
export async function login(req, res, next) {
  try {
    const { email, senha } = loginSchema.parse(req.body);

    const result = await query(
      `SELECT u.id, u.nome, u.email, u.senha_hash, u.perfil, u.ativo, u.trocar_senha,
              u.departamento_id, d.nome AS departamento_nome
       FROM usuarios u
       LEFT JOIN departamentos d ON d.id = u.departamento_id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    const usuario = result.rows[0];
    const erroGenerico = { erro: 'E-mail ou senha incorretos.' };

    if (!usuario) return res.status(401).json(erroGenerico);
    if (!usuario.ativo) return res.status(403).json({ erro: 'Usuário desativado. Entre em contato com o administrador.' });

    const senhaCorreta = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaCorreta) return res.status(401).json(erroGenerico);

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

    await query('UPDATE usuarios SET ultimo_acesso = NOW() WHERE id = $1', [usuario.id]);

    await query(
      `INSERT INTO logs (usuario_id, acao, payload_json, ip)
       VALUES ($1, 'LOGIN', $2, $3)`,
      [usuario.id, JSON.stringify({ email: usuario.email }), req.ip]
    );

    res.json({
      token,
      usuario: {
        id:                usuario.id,
        nome:              usuario.nome,
        email:             usuario.email,
        perfil:            usuario.perfil,
        departamento_id:   usuario.departamento_id,
        departamento_nome: usuario.departamento_nome,
        trocar_senha:      usuario.trocar_senha,
      }
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /auth/trocar-senha — Usuário troca a própria senha
export async function trocarSenha(req, res, next) {
  try {
    const { senha_nova } = req.body;
    const usuarioId = req.usuario.id;

    if (!senha_nova || senha_nova.length < 6) {
      return res.status(400).json({ erro: 'A nova senha deve ter ao menos 6 caracteres.' });
    }

    const senha_hash = await bcrypt.hash(senha_nova, 10);

    await query(
      `UPDATE usuarios SET senha_hash = $1, trocar_senha = FALSE, updated_at = NOW() WHERE id = $2`,
      [senha_hash, usuarioId]
    );

    res.json({ mensagem: 'Senha alterada com sucesso!' });
  } catch (err) {
    next(err);
  }
}

// GET /auth/me
export async function me(req, res, next) {
  try {
    const result = await query(
      `SELECT u.id, u.nome, u.email, u.perfil, u.departamento_id, u.trocar_senha,
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
