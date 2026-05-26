// ============================================================
// controllers/usuariosController.js — Gestão de Usuários (Admin)
// ============================================================
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../config/db.js';

const criarUsuarioSchema = z.object({
  nome:            z.string().min(2, 'Nome muito curto'),
  email:           z.string().email('E-mail inválido'),
  senha:           z.string().min(6, 'Senha deve ter ao menos 6 caracteres'),
  perfil:          z.enum(['colaborador', 'operador', 'admin']).default('colaborador'),
  departamento_id: z.number().int().positive().optional().nullable(),
});

// GET /admin/usuarios
export async function listarUsuarios(req, res, next) {
  try {
    const result = await query(
      `SELECT u.id, u.nome, u.email, u.perfil, u.ativo, u.ultimo_acesso, u.created_at,
              d.nome AS departamento_nome, d.codigo AS departamento_codigo
       FROM usuarios u
       LEFT JOIN departamentos d ON d.id = u.departamento_id
       ORDER BY u.nome`
    );
    res.json({ usuarios: result.rows });
  } catch (err) {
    next(err);
  }
}

// POST /admin/usuarios
export async function criarUsuario(req, res, next) {
  try {
    const dados = criarUsuarioSchema.parse(req.body);
    const senha_hash = await bcrypt.hash(dados.senha, 10);
    const result = await query(
      `INSERT INTO usuarios (nome, email, senha_hash, perfil, departamento_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nome, email, perfil, departamento_id, ativo, created_at`,
      [dados.nome, dados.email.toLowerCase(), senha_hash, dados.perfil, dados.departamento_id || null]
    );
    res.status(201).json({ usuario: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// PATCH /admin/usuarios/:id — Atualiza email, senha, perfil, ativo, departamento
export async function atualizarUsuario(req, res, next) {
  try {
    const { id } = req.params;
    const { ativo, perfil, departamento_id, email, senha } = req.body;

    // Se enviou nova senha, gera o hash
    let senha_hash = null;
    if (senha && senha.length >= 6) {
      senha_hash = await bcrypt.hash(senha, 10);
    }

    const result = await query(
      `UPDATE usuarios
       SET ativo           = COALESCE($1, ativo),
           perfil          = COALESCE($2, perfil),
           departamento_id = COALESCE($3, departamento_id),
           email           = COALESCE($4, email),
           senha_hash      = COALESCE($5, senha_hash),
           updated_at      = NOW()
       WHERE id = $6
       RETURNING id, nome, email, perfil, ativo, departamento_id`,
      [
        ativo ?? null,
        perfil || null,
        departamento_id || null,
        email ? email.toLowerCase() : null,
        senha_hash,
        parseInt(id)
      ]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }

    res.json({ usuario: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// GET /admin/departamentos
export async function listarDepartamentos(req, res, next) {
  try {
    const result = await query(
      `SELECT id, nome, codigo FROM departamentos WHERE ativo = TRUE ORDER BY nome`
    );
    res.json({ departamentos: result.rows });
  } catch (err) {
    next(err);
  }
}
