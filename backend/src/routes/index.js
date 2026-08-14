import { listarFornecedores, criarFornecedor, editarFornecedor, excluirFornecedor, fornecedoresPorMaterial, vincularFornecedor, desvincularFornecedor } from '../controllers/fornecedoresController.js';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { login, me, trocarSenha, alterarSenha } from '../controllers/authController.js';
import {
  listarMateriais, listarCategorias, detalharMaterial,
  criarMaterial, editarMaterial, atualizarEstoque
} from '../controllers/materiaisController.js';
import {
  criarRequisicao, listarRequisicoes, relatorioRequisicoes,
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
import { calcularMRP, importarMovimentacoes } from '../controllers/mrpController.js';
import {
  listarProcessos, detalharProcesso, detalharItem, criarProcesso, adicionarCotacao,
  aprovarItem, cancelarItem, cancelarProcesso, excluirProcesso, historicoCompras, dashboardCompras,
  listarAcompanhamento, confirmarEntrega
} from '../controllers/comprasController.js';
import { autenticar, exigirPerfil } from '../middlewares/auth.js';

const router = Router();

// ── Busca pública para autocomplete no login
router.get('/usuarios/buscar', buscarUsuarios);

// ── Autenticação
router.post('/auth/login',         login);
router.get('/auth/me',             autenticar, me);
router.patch('/auth/trocar-senha', autenticar, trocarSenha);
router.patch('/auth/alterar-senha', autenticar, alterarSenha);

// ── Catálogo
router.get('/materiais',               autenticar, listarMateriais);
router.get('/materiais/:id',           autenticar, detalharMaterial);
router.get('/categorias',              autenticar, listarCategorias);
router.post('/materiais',              autenticar, exigirPerfil('admin'), criarMaterial);
router.patch('/materiais/:id',         autenticar, exigirPerfil('admin'), editarMaterial);
router.patch('/materiais/:id/estoque', autenticar, exigirPerfil('operador', 'admin'), atualizarEstoque);

// ── Requisições
router.post('/requisicoes',             autenticar, criarRequisicao);
router.get('/requisicoes/relatorio', autenticar, relatorioRequisicoes);
router.get('/requisicoes',              autenticar, listarRequisicoes);
router.get('/requisicoes/:id',          autenticar, detalharRequisicao);
router.patch('/requisicoes/:id/status', autenticar, exigirPerfil('operador', 'admin'), mudarStatus);

// ── Entradas de Estoque
router.get('/entradas',        autenticar, exigirPerfil('admin'), listarEntradas);
router.post('/entradas',       autenticar, exigirPerfil('admin'), registrarEntrada);
router.delete('/entradas/:id', autenticar, exigirPerfil('admin'), excluirEntrada);

// ── Admin — Usuários
router.get('/admin/usuarios',        autenticar, exigirPerfil('admin'), listarUsuarios);
router.post('/admin/usuarios',       autenticar, exigirPerfil('admin'), criarUsuario);
router.patch('/admin/usuarios/:id',  autenticar, exigirPerfil('admin'), atualizarUsuario);
router.delete('/admin/usuarios/:id', autenticar, exigirPerfil('admin'), excluirUsuario);

// ── Admin — Departamentos
router.get('/admin/departamentos',       autenticar, listarDepartamentos);
router.post('/admin/departamentos',      autenticar, exigirPerfil('admin'), criarDepartamento);
router.patch('/admin/departamentos/:id', autenticar, exigirPerfil('admin'), atualizarDepartamento);

// ── MRP
router.get('/mrp',             autenticar, exigirPerfil('admin'), calcularMRP);
router.post('/mrp/importar',    autenticar, exigirPerfil('admin'), importarMovimentacoes);

router.get('/gerar-hash/:senha', async (req, res) => {
  const hash = await bcrypt.hash(req.params.senha, 10);
  res.json({ hash });
});


router.get('/fornecedores',      autenticar, exigirPerfil('admin'), listarFornecedores);
router.post('/fornecedores',     autenticar, exigirPerfil('admin'), criarFornecedor);
router.patch('/fornecedores/:id',autenticar, exigirPerfil('admin'), editarFornecedor);
router.delete('/fornecedores/:id',autenticar, exigirPerfil('admin'), excluirFornecedor);

router.get('/materiais/:id/fornecedores',              autenticar, exigirPerfil('admin'), fornecedoresPorMaterial);
router.post('/materiais/:id/fornecedores',             autenticar, exigirPerfil('admin'), vincularFornecedor);
router.delete('/materiais/:id/fornecedores/:fornecedor_id', autenticar, exigirPerfil('admin'), desvincularFornecedor);

// ── Compras — Cards de compra, itens e cotações
router.get('/compras/processos',                       autenticar, exigirPerfil('admin'), listarProcessos);
router.post('/compras/processos',                      autenticar, exigirPerfil('admin'), criarProcesso);
router.get('/compras/processos/:id',                   autenticar, exigirPerfil('admin'), detalharProcesso);
router.post('/compras/processos/:id/cancelar',         autenticar, exigirPerfil('admin'), cancelarProcesso);
router.delete('/compras/processos/:id',                autenticar, exigirPerfil('admin'), excluirProcesso);
router.get('/compras/processos/:id/itens/:itemId',            autenticar, exigirPerfil('admin'), detalharItem);
router.post('/compras/processos/:id/itens/:itemId/cotacoes',  autenticar, exigirPerfil('admin'), adicionarCotacao);
router.post('/compras/processos/:id/itens/:itemId/aprovar',   autenticar, exigirPerfil('admin'), aprovarItem);
router.post('/compras/processos/:id/itens/:itemId/cancelar',  autenticar, exigirPerfil('admin'), cancelarItem);
router.get('/compras/historico',                       autenticar, exigirPerfil('admin'), historicoCompras);
router.get('/compras/dashboard',                       autenticar, exigirPerfil('admin'), dashboardCompras);
router.get('/compras/acompanhamento',                  autenticar, exigirPerfil('admin'), listarAcompanhamento);
router.post('/compras/processos/:id/itens/:itemId/confirmar-entrega', autenticar, exigirPerfil('admin'), confirmarEntrega);

export default router;
