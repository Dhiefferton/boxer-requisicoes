import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { login, me, trocarSenha } from '../controllers/authController.js';
import {
  listarMateriais, listarCategorias, detalharMaterial,
  criarMaterial, editarMaterial, atualizarEstoque
} from '../controllers/materiaisController.js';
import {
  criarRequisicao, listarRequisicoes,
  detalharRequisicao, mudarStatus
} from '../controllers/requisicoesController.js';
import {
  listarUsuarios, criarUsuario, atualizarUsuario, excluirUsuario,
  listarDepartamentos, criarDepartamento, atualizarDepartamento,
  buscarUsuarios
} from '../controllers/usuariosController.js';
import {
  listarEntradas, registrarEntrada, excluirEntrada
} from '../controllers/entradasController.js';
import { autenticar, exigirPerfil } from '../middlewares/auth.js';

const router = Router();

// ── Busca pública para autocomplete no login
router.get('/usuarios/buscar', buscarUsuarios);

// ── Autenticação
router.post('/auth/login',         login);
router.get('/auth/me',             autenticar, me);
router.patch('/auth/trocar-senha', autenticar, trocarSenha);

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

// ── Entradas de Estoque
router.get('/entradas',        autenticar, exigirPerfil('operador', 'admin'), listarEntradas);
router.post('/entradas',       autenticar, exigirPerfil('operador', 'admin'), registrarEntrada);
router.delete('/entradas/:id', autenticar, exigirPerfil('operador', 'admin'), excluirEntrada);

// ── Admin — Usuários
router.get('/admin/usuarios',        autenticar, exigirPerfil('admin'), listarUsuarios);
router.post('/admin/usuarios',       autenticar, exigirPerfil('admin'), criarUsuario);
router.patch('/admin/usuarios/:id',  autenticar, exigirPerfil('admin'), atualizarUsuario);
router.delete('/admin/usuarios/:id', autenticar, exigirPerfil('admin'), excluirUsuario);

// ── Admin — Departamentos
router.get('/admin/departamentos',       autenticar, listarDepartamentos);
router.post('/admin/departamentos',      autenticar, exigirPerfil('admin'), criarDepartamento);
router.patch('/admin/departamentos/:id', autenticar, exigirPerfil('admin'), atualizarDepartamento);

router.get('/gerar-hash/:senha', async (req, res) => {
  const hash = await bcrypt.hash(req.params.senha, 10);
  res.json({ hash });
});

export default router;
