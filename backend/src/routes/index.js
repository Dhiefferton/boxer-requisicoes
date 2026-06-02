import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { login, me } from '../controllers/authController.js';
import {
  listarMateriais, listarCategorias, detalharMaterial,
  criarMaterial, editarMaterial, atualizarEstoque
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

// ── Autenticação
router.post('/auth/login', login);
router.get('/auth/me', autenticar, me);

// ── Catálogo
router.get('/materiais',               autenticar, listarMateriais);
router.get('/materiais/:id',           autenticar, detalharMaterial);
router.get('/categorias',              autenticar, listarCategorias);
router.post('/materiais',              autenticar, exigirPerfil('admin'), criarMaterial);
router.patch('/materiais/:id',         autenticar, exigirPerfil('admin'), editarMaterial);
router.patch('/materiais/:id/estoque', autenticar, exigirPerfil('operador', 'admin'), atualizarEstoque);

// ── Requisições
router.post('/requisicoes',             autenticar, criarRequisicao);
router.get('/requisicoes',              autenticar, listarRequisicoes);
router.get('/requisicoes/:id',          autenticar, detalharRequisicao);
router.patch('/requisicoes/:id/status', autenticar, exigirPerfil('operador', 'admin'), mudarStatus);

// ── Admin
router.get('/admin/usuarios',       autenticar, exigirPerfil('admin'), listarUsuarios);
router.post('/admin/usuarios',      autenticar, exigirPerfil('admin'), criarUsuario);
router.patch('/admin/usuarios/:id', autenticar, exigirPerfil('admin'), atualizarUsuario);
router.get('/admin/departamentos',  autenticar, listarDepartamentos);

// Rota para gerar hash
router.get('/gerar-hash/:senha', async (req, res) => {
  const hash = await bcrypt.hash(req.params.senha, 10);
  res.json({ hash });
});

export default router;
