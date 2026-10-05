// ============================================================
// controllers/authController.js — Login e Autenticação
// ============================================================
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import crypto from 'crypto';
import { query } from '../config/db.js';
import { enviarEmail, emailConfigurado, emailRecuperacaoSenha } from '../integrations/email.js';

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

// PATCH /auth/alterar-senha — troca voluntária, feita a qualquer momento pelo próprio
// usuário (diferente de trocarSenha, que é só pra troca obrigatória no primeiro acesso).
// Exige a senha atual pra confirmar identidade, já que fica acessível o tempo todo.
export async function alterarSenha(req, res, next) {
  try {
    const { senha_atual, senha_nova } = req.body;
    const usuarioId = req.usuario.id;

    if (!senha_atual) return res.status(400).json({ erro: 'Informe a senha atual.' });
    if (!senha_nova || senha_nova.length < 6) {
      return res.status(400).json({ erro: 'A nova senha deve ter ao menos 6 caracteres.' });
    }

    const result = await query(`SELECT senha_hash FROM usuarios WHERE id = $1`, [usuarioId]);
    if (!result.rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });

    const senhaValida = await bcrypt.compare(senha_atual, result.rows[0].senha_hash);
    if (!senhaValida) return res.status(400).json({ erro: 'Senha atual incorreta.' });

    const senha_hash = await bcrypt.hash(senha_nova, 10);
    await query(`UPDATE usuarios SET senha_hash = $1, updated_at = NOW() WHERE id = $2`, [senha_hash, usuarioId]);

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

// ============================================================
// Recuperação de senha por e-mail
// ============================================================
const RESET_MINUTOS     = 30;  // validade do link
const RESET_MAX_POR_HORA = 3;  // pedidos por usuário por hora
const APP_URL = () => (process.env.APP_URL || 'https://boxer-requisicoes.vercel.app').replace(/\/$/, '');
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

async function buscarTokenValido(token) {
  if (!token || typeof token !== 'string' || token.length < 32) return null;
  const r = await query(
    `SELECT t.id, t.usuario_id, u.nome
       FROM senha_reset_tokens t
       JOIN usuarios u ON u.id = t.usuario_id
      WHERE t.token_hash = $1 AND t.usado_em IS NULL AND t.expira_em > NOW() AND u.ativo = TRUE`,
    [hashToken(token)]
  );
  return r.rows[0] || null;
}

// POST /auth/esqueci-senha { email }
// Resposta sempre igual (não revela se o e-mail existe).
export async function esqueciSenha(req, res, next) {
  const respostaPadrao = { mensagem: 'Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.' };
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!z.string().email().safeParse(email).success) {
      return res.status(400).json({ erro: 'Selecione seu usuário antes de pedir a recuperação.' });
    }
    if (!emailConfigurado()) {
      return res.status(503).json({ erro: 'Recuperação por e-mail ainda não está configurada. Fale com o administrador.' });
    }

    const r = await query(`SELECT id, nome, email FROM usuarios WHERE email = $1 AND ativo = TRUE`, [email]);
    const usuario = r.rows[0];
    if (!usuario) return res.json(respostaPadrao);

    const recentes = await query(
      `SELECT COUNT(*)::int AS n FROM senha_reset_tokens WHERE usuario_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [usuario.id]
    );
    if (recentes.rows[0].n >= RESET_MAX_POR_HORA) return res.json(respostaPadrao);

    const token = crypto.randomBytes(32).toString('hex');
    await query(
      `INSERT INTO senha_reset_tokens (usuario_id, token_hash, expira_em, ip)
       VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval, $4)`,
      [usuario.id, hashToken(token), String(RESET_MINUTOS), req.ip || null]
    );

    const link = `${APP_URL()}/redefinir-senha?token=${token}`;
    const { assunto, html, texto } = emailRecuperacaoSenha({ nome: usuario.nome, link, minutos: RESET_MINUTOS });
    try {
      await enviarEmail({ para: usuario.email, assunto, html, texto });
    } catch (err) {
      console.error('[esqueciSenha] falha ao enviar e-mail:', err.message);
      return res.status(502).json({ erro: 'Não foi possível enviar o e-mail agora. Tente novamente em alguns minutos.' });
    }

    await query(
      `INSERT INTO logs (usuario_id, acao, payload_json, ip) VALUES ($1, 'SENHA_RESET_SOLICITADO', $2, $3)`,
      [usuario.id, JSON.stringify({ email: usuario.email }), req.ip]
    );
    res.json(respostaPadrao);
  } catch (err) {
    next(err);
  }
}

// GET /auth/redefinir-senha/:token — confere se o link ainda vale
export async function validarTokenSenha(req, res, next) {
  try {
    const t = await buscarTokenValido(req.params.token);
    if (!t) return res.status(400).json({ erro: 'Este link é inválido ou já expirou. Peça um novo na tela de login.' });
    res.json({ valido: true, nome: t.nome });
  } catch (err) {
    next(err);
  }
}

// POST /auth/redefinir-senha { token, senha_nova }
export async function redefinirSenha(req, res, next) {
  try {
    const { token, senha_nova } = req.body || {};
    if (!senha_nova || String(senha_nova).length < 6) {
      return res.status(400).json({ erro: 'A nova senha deve ter ao menos 6 caracteres.' });
    }
    const t = await buscarTokenValido(token);
    if (!t) return res.status(400).json({ erro: 'Este link é inválido ou já expirou. Peça um novo na tela de login.' });

    // marca o token como usado primeiro (evita uso duplo em requisições simultâneas)
    const marcado = await query(
      `UPDATE senha_reset_tokens SET usado_em = NOW() WHERE id = $1 AND usado_em IS NULL RETURNING id`,
      [t.id]
    );
    if (!marcado.rows[0]) return res.status(400).json({ erro: 'Este link já foi usado. Peça um novo na tela de login.' });

    const senha_hash = await bcrypt.hash(String(senha_nova), 10);
    await query(
      `UPDATE usuarios SET senha_hash = $1, trocar_senha = FALSE, updated_at = NOW() WHERE id = $2`,
      [senha_hash, t.usuario_id]
    );
    // invalida outros links pendentes do mesmo usuário
    await query(
      `UPDATE senha_reset_tokens SET usado_em = NOW() WHERE usuario_id = $1 AND usado_em IS NULL`,
      [t.usuario_id]
    );
    await query(
      `INSERT INTO logs (usuario_id, acao, payload_json, ip) VALUES ($1, 'SENHA_REDEFINIDA', $2, $3)`,
      [t.usuario_id, JSON.stringify({ via: 'email' }), req.ip]
    );
    res.json({ mensagem: 'Senha redefinida! Agora é só entrar com a nova senha.' });
  } catch (err) {
    next(err);
  }
}
