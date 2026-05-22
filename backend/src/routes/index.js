// ============================================================
// routes/index.js — Mapa de todas as rotas da API
// ============================================================

import { Router } from 'express';
import { login, me } from '../controllers/authController.js';
import {
  listarMateriais, listarCategorias, detalharMaterial,
  criarMaterial, atualizarEstoque
} from '../controllers/materiaisController.js';
import {
  criarRequisicao, listarRequisicoes,
  detalharRequisicao, mudarStatus
} from '../controllers/requisicoesController.js';
import {
  listarUsuarios, criarUsuario,
  atualizarUsuario, listarDepartamentos
} from '../controllers/usuariosController.js';
import { autenticar, exigirPerfil } from '../middlewares/auth.js';

const router = Router();

// ── Autenticação ─────────────────────────────────────────────
// POST /api/auth/login        → Faz login, retorna JWT
// GET  /api/auth/me           → Dados do usuário logado
router.post('/auth/login', login);
router.get('/auth/me', autenticar, me);

// ── Catálogo ─────────────────────────────────────────────────
// GET  /api/materiais           → Lista materiais (com busca e filtro)
// GET  /api/materiais/:id       → Detalhe de um material
// GET  /api/categorias          → Lista categorias
// POST /api/materiais           → Cria material (admin)
// PATCH /api/materiais/:id/estoque → Atualiza estoque (operador/admin)
router.get('/materiais',            autenticar, listarMateriais);
router.get('/materiais/:id',        autenticar, detalharMaterial);
router.get('/categorias',           autenticar, listarCategorias);
router.post('/materiais',           autenticar, exigirPerfil('admin'), criarMaterial);
router.patch('/materiais/:id/estoque', autenticar, exigirPerfil('operador', 'admin'), atualizarEstoque);

// ── Requisições ───────────────────────────────────────────────
// POST  /api/requisicoes         → Cria requisição (colaborador)
// GET   /api/requisicoes         → Lista (colaborador = só as suas; operador/admin = todas)
// GET   /api/requisicoes/:id     → Detalhe com itens e histórico
// PATCH /api/requisicoes/:id/status → Muda status (operador/admin)
router.post('/requisicoes',                autenticar, criarRequisicao);
router.get('/requisicoes',                 autenticar, listarRequisicoes);
router.get('/requisicoes/:id',             autenticar, detalharRequisicao);
router.patch('/requisicoes/:id/status',    autenticar, exigirPerfil('operador', 'admin'), mudarStatus);

// ── Admin ─────────────────────────────────────────────────────
// GET   /api/admin/usuarios      → Lista usuários
// POST  /api/admin/usuarios      → Cria usuário
// PATCH /api/admin/usuarios/:id  → Atualiza usuário (ativo, perfil)
// GET   /api/admin/departamentos → Lista departamentos
router.get('/admin/usuarios',       autenticar, exigirPerfil('admin'), listarUsuarios);
router.post('/admin/usuarios',      autenticar, exigirPerfil('admin'), criarUsuario);
router.patch('/admin/usuarios/:id', autenticar, exigirPerfil('admin'), atualizarUsuario);
router.get('/admin/departamentos',  autenticar, listarDepartamentos);
// Rota temporária para gerar hash — REMOVER APÓS USO
import bcrypt from 'bcryptjs';
router.get('/gerar-hash/:senha', async (req, res) => {
  const hash = await bcrypt.hash(req.params.senha, 10);
  res.json({ hash });
});
export default router;
