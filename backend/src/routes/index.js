import { listarFornecedores, criarFornecedor, editarFornecedor, excluirFornecedor, fornecedoresPorMaterial, vincularFornecedor, desvincularFornecedor } from '../controllers/fornecedoresController.js';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { login, me, trocarSenha, alterarSenha, esqueciSenha, validarTokenSenha, redefinirSenha } from '../controllers/authController.js';
import rateLimit from 'express-rate-limit';
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
  listarAcompanhamento, confirmarEntrega, editarQuantidadeItem
} from '../controllers/comprasController.js';
import {
  listarNecessidades, criarNecessidade, iniciarRevisao, editarNecessidade,
  aprovarNecessidade, recusarNecessidade, enviarOutroSistema, cancelarNecessidade,
  gerarRelatorio, listarRelatorios, detalharRelatorio
} from '../controllers/necessidadesPecasController.js';
import {
  listarPedidos, criarPedido, moverPedido, editarPedido, cancelarPedido, listarPipesPipefy, sincronizarPipefy, retirarRecusadas, atualizarItensZen
} from '../controllers/pedidosOrcamentoController.js';
import { autenticar, exigirPerfil, exigirAdminOuSetor } from '../middlewares/auth.js';
import { exigirLeituraOrcamentos } from '../middlewares/acessoOrcamentos.js';

const router = Router();

// ── Busca pública para autocomplete no login
router.get('/usuarios/buscar', buscarUsuarios);

// ── Autenticação
router.post('/auth/login',         login);
router.get('/auth/me',             autenticar, me);
router.patch('/auth/trocar-senha', autenticar, trocarSenha);
router.patch('/auth/alterar-senha', autenticar, alterarSenha);

// ── Recuperação de senha por e-mail (público)
const limiteRecuperacao = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { erro: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' } });
router.post('/auth/esqueci-senha',          limiteRecuperacao, esqueciSenha);
router.get('/auth/redefinir-senha/:token',  limiteRecuperacao, validarTokenSenha);
router.post('/auth/redefinir-senha',        limiteRecuperacao, redefinirSenha);

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
router.patch('/compras/processos/:id/itens/:itemId',          autenticar, exigirPerfil('admin'), editarQuantidadeItem);
router.post('/compras/processos/:id/itens/:itemId/cotacoes',  autenticar, exigirPerfil('admin'), adicionarCotacao);
router.post('/compras/processos/:id/itens/:itemId/aprovar',   autenticar, exigirPerfil('admin'), aprovarItem);
router.post('/compras/processos/:id/itens/:itemId/cancelar',  autenticar, exigirPerfil('admin'), cancelarItem);
router.get('/compras/historico',                       autenticar, exigirPerfil('admin'), historicoCompras);
router.get('/compras/dashboard',                       autenticar, exigirPerfil('admin'), dashboardCompras);
router.get('/compras/acompanhamento',                  autenticar, exigirPerfil('admin'), listarAcompanhamento);
router.post('/compras/processos/:id/itens/:itemId/confirmar-entrega', autenticar, exigirPerfil('admin'), confirmarEntrega);

// ── Necessidade de Peças
// Solicitado: aberto a admin ou setor Sac / Suporte (criar, ver, cancelar)
// Relatórios da coluna Aprovado (antes das rotas com :id)
router.get('/necessidades-pecas/relatorios',       autenticar, exigirPerfil('admin'), listarRelatorios);
router.get('/necessidades-pecas/relatorios/:id',   autenticar, exigirPerfil('admin'), detalharRelatorio);
router.post('/necessidades-pecas/relatorios',      autenticar, exigirPerfil('admin'), gerarRelatorio);
router.get('/necessidades-pecas',                  autenticar, exigirAdminOuSetor('Sac / Suporte'), listarNecessidades);
router.post('/necessidades-pecas',                 autenticar, exigirAdminOuSetor('Sac / Suporte'), criarNecessidade);
router.post('/necessidades-pecas/:id/cancelar',     autenticar, exigirAdminOuSetor('Sac / Suporte'), cancelarNecessidade);

// ── Pedidos de Orçamento (v1: só estrutura, admin only por enquanto)
router.get('/pedidos-orcamento',                autenticar, exigirLeituraOrcamentos, listarPedidos);
router.post('/pedidos-orcamento',               autenticar, exigirPerfil('operador', 'admin'), criarPedido);
router.patch('/pedidos-orcamento/:id/mover',    autenticar, exigirPerfil('operador', 'admin'), moverPedido);
router.patch('/pedidos-orcamento/:id',          autenticar, exigirPerfil('operador', 'admin'), editarPedido);
router.post('/pedidos-orcamento/:id/cancelar',  autenticar, exigirPerfil('operador', 'admin'), cancelarPedido);
router.post('/pedidos-orcamento/:id/retirar-recusadas', autenticar, exigirPerfil('operador', 'admin'), retirarRecusadas);
router.post('/pedidos-orcamento/:id/atualizar-itens-zen', autenticar, exigirPerfil('operador', 'admin'), atualizarItensZen);
router.get('/pedidos-orcamento/pipefy-pipes',   autenticar, exigirPerfil('admin'), listarPipesPipefy);
router.post('/pedidos-orcamento/sincronizar-pipefy', autenticar, exigirPerfil('operador', 'admin'), sincronizarPipefy);

// Em andamento e Aprovado: só admin edita/decide
router.post('/necessidades-pecas/:id/iniciar-revisao', autenticar, exigirPerfil('admin'), iniciarRevisao);
router.patch('/necessidades-pecas/:id',             autenticar, exigirPerfil('admin'), editarNecessidade);
router.post('/necessidades-pecas/:id/aprovar',      autenticar, exigirPerfil('admin'), aprovarNecessidade);
router.post('/necessidades-pecas/:id/recusar',      autenticar, exigirPerfil('admin'), recusarNecessidade);
router.post('/necessidades-pecas/:id/enviar',       autenticar, exigirPerfil('admin'), enviarOutroSistema);

export default router;
