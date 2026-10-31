// ============================================================
// services/api.js — Cliente HTTP centralizado
// ============================================================
import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const api = axios.create({
  baseURL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('boxer_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('boxer_token');
      localStorage.removeItem('boxer_usuario');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authService = {
  login:       (email, senha)              => api.post('/auth/login', { email, senha }),
  me:          ()                          => api.get('/auth/me'),
  trocarSenha: (senha_nova)                => api.patch('/auth/trocar-senha', { senha_nova }),
  alterarSenha: (senha_atual, senha_nova)  => api.patch('/auth/alterar-senha', { senha_atual, senha_nova }),
  esqueciSenha:   (email)                  => api.post('/auth/esqueci-senha', { email }),
  validarReset:   (token)                  => api.get(`/auth/redefinir-senha/${encodeURIComponent(token)}`),
  redefinirSenha: (token, senha_nova)      => api.post('/auth/redefinir-senha', { token, senha_nova }),
};

export const materiaisService = {
  listar:          (params) => api.get('/materiais', { params }),
  detalhar:        (id)     => api.get(`/materiais/${id}`),
  categorias:      ()       => api.get('/categorias'),
  atualizarEstoque:(id, d)  => api.patch(`/materiais/${id}/estoque`, d),
};

export const necessidadesPecasService = {
  listar:         ()                => api.get('/necessidades-pecas'),
  criar:          (codigo, quantidade) => api.post('/necessidades-pecas', { codigo, quantidade }),
  iniciarRevisao: (id)               => api.post(`/necessidades-pecas/${id}/iniciar-revisao`),
  editar:         (id, dados)        => api.patch(`/necessidades-pecas/${id}`, dados),
  aprovar:        (id, quantidade)   => api.post(`/necessidades-pecas/${id}/aprovar`, { quantidade }),
  recusar:        (id)               => api.post(`/necessidades-pecas/${id}/recusar`),
  enviar:         (id)               => api.post(`/necessidades-pecas/${id}/enviar`),
  cancelar:       (id)               => api.post(`/necessidades-pecas/${id}/cancelar`),
  gerarRelatorio:   ()               => api.post('/necessidades-pecas/relatorios'),
  listarRelatorios: ()               => api.get('/necessidades-pecas/relatorios'),
  detalharRelatorio:(id)             => api.get(`/necessidades-pecas/relatorios/${id}`),
};

export const pedidosOrcamentoService = {
  imagem:      (url)               => api.get(url, { responseType: 'blob', timeout: 30000 }),
  enviarFoto:  (id, dados)         => api.post(`/pedidos-orcamento/${id}/fotos`, dados, { timeout: 60000 }),
  excluirFoto: (fotoId)            => api.delete(`/pedidos-orcamento/fotos/${fotoId}`),
  modelos:     ()                  => api.get('/pedidos-orcamento/modelos', { timeout: 60000 }),
  config:      ()                  => api.get('/pedidos-orcamento/config', { timeout: 30000 }),
  salvarConfig: (dados)            => api.post('/pedidos-orcamento/config', dados, { timeout: 60000 }),
  criarModelo: (nome)              => api.post('/pedidos-orcamento/modelos', { nome }),
  listar:   ()                  => api.get('/pedidos-orcamento'),
  criar:    (referencia, observacoes) => api.post('/pedidos-orcamento', { referencia, observacoes }),
  mover:    (id, status)         => api.patch(`/pedidos-orcamento/${id}/mover`, { status }),
  editar:   (id, dados)          => api.patch(`/pedidos-orcamento/${id}`, dados),
  cancelar: (id)                 => api.post(`/pedidos-orcamento/${id}/cancelar`),
  retirarRecusadas: (id)         => api.post(`/pedidos-orcamento/${id}/retirar-recusadas`),
  atualizarItensZen: (id)        => api.post(`/pedidos-orcamento/${id}/atualizar-itens-zen`, {}, { timeout: 120000 }),
  sincronizarPipefy: ()          => api.post('/pedidos-orcamento/sincronizar-pipefy', {}, { timeout: 120000 }),
  movimentos: (params)           => api.get('/pedidos-orcamento/movimentos', { params, timeout: 30000 }),
  estrutura: ()                  => api.get('/pedidos-orcamento/estrutura', { timeout: 30000 }),
  editarCampos: (id, campos)     => api.patch(`/pedidos-orcamento/${id}/campos`, { campos }),
  novoCard: (campos)             => api.post('/pedidos-orcamento/novo-card', { campos }),
  clienteZen: (documento)        => api.get('/pedidos-orcamento/cliente-zen', { params: { documento }, timeout: 30000 }),
};

export const inventarioService = {
  listar:       (local)             => api.get('/inventarios', { params: { local } }),
  indicadores:  (meses, local)      => api.get('/inventarios/indicadores', { params: { meses, local }, timeout: 30000 }),
  previa:       (filtros)           => api.post('/inventarios/previa', filtros, { timeout: 120000 }),
  criar:        (filtros)           => api.post('/inventarios', filtros, { timeout: 120000 }),
  detalhar:     (id)                => api.get(`/inventarios/${id}`, { timeout: 30000 }),
  meu:          (id, modo)          => api.get(`/inventarios/${id}/meu`, { params: { modo }, timeout: 20000 }),
  buscar:       (id, texto, modo)   => api.get(`/inventarios/${id}/buscar`, { params: { texto, modo }, timeout: 30000 }),
  contar:       (id, itemId, dados) => api.post(`/inventarios/${id}/itens/${itemId}/contar`, dados, { timeout: 30000 }),
  historico:    (id, itemId)        => api.get(`/inventarios/${id}/itens/${itemId}/historico`),
  recontar:     (id, itens)         => api.post(`/inventarios/${id}/recontar`, { itens }),
  finalizar:    (id)                => api.post(`/inventarios/${id}/finalizar`),
  cancelar:     (id)                => api.post(`/inventarios/${id}/cancelar`),
  planilhaConfig: ()                => api.get('/inventarios/planilha/config'),
  marcarPlanilha: (id)              => api.post(`/inventarios/${id}/planilha`),
  ajusteZen:    (id, itemId, ajustado) => api.post(`/inventarios/${id}/itens/${itemId}/ajuste-zen`, { ajustado }),
};

export const marketplaceService = {
  saidas:        (params)          => api.get('/marketplace/saidas', { params, timeout: 60000 }),
  reposicao:     (params)          => api.get('/marketplace/reposicao', { params, timeout: 60000 }),
  relatorios:    ()                => api.get('/marketplace/relatorios'),
  relatorio:     (id)              => api.get(`/marketplace/relatorios/${id}`),
  gerarRelatorio: ()               => api.post('/marketplace/relatorios/gerar', null, { timeout: 90000 }),
};

export const recebimentoImportacaoService = {
  notas:      ()               => api.get('/recebimento-importacao/notas', { timeout: 60000 }),
  nota:       (id)             => api.get(`/recebimento-importacao/notas/${id}`, { timeout: 60000 }),
  imagem:     (url)            => api.get(url, { responseType: 'blob', timeout: 30000 }),
  enviarFoto: (itemId, dados)  => api.post(`/recebimento-importacao/itens/${itemId}/fotos`, dados, { timeout: 60000 }),
  excluirFoto: (id)            => api.delete(`/recebimento-importacao/fotos/${id}`),
  substituirFoto: (id, dados)  => api.patch(`/recebimento-importacao/fotos/${id}`, dados, { timeout: 60000 }),
  marcarItem: (itemId, dados)  => api.patch(`/recebimento-importacao/itens/${itemId}`, dados),
};

export const lojinhaService = {
  config:  ()          => api.get('/lojinha/config'),
  cliente: (documento) => api.get('/lojinha/cliente', { params: { documento }, timeout: 30000 }),
  produto: (sku)       => api.get('/lojinha/produto', { params: { sku } }),
  lojaIntegrada: (numero) => api.get(`/lojinha/loja-integrada/${encodeURIComponent(numero)}`, { timeout: 60000 }),
  pedidos: ()          => api.get('/lojinha/pedidos'),
  criar:   (dados)     => api.post('/lojinha/pedidos', dados, { timeout: 120000 }),
  reenviarZen: (id, transacao) => api.post(`/lojinha/pedidos/${id}/zen`, transacao !== undefined ? { transacao } : {}, { timeout: 120000 }),
  reenviarPipefy: (id) => api.post(`/lojinha/pedidos/${id}/pipefy`, {}, { timeout: 120000 }),
  mover:   (id, status) => api.post(`/lojinha/pedidos/${id}/mover`, { status }),
  quadroConfig:       ()      => api.get('/lojinha/quadro-config', { timeout: 30000 }),
  salvarQuadroConfig: (dados) => api.post('/lojinha/quadro-config', dados, { timeout: 60000 }),
  editarCampos: (id, campos)  => api.post(`/lojinha/pedidos/${id}/campos`, { campos }),
  imagem:      (url)          => api.get(url, { responseType: 'blob', timeout: 30000 }),
  enviarFoto:  (id, dados)    => api.post(`/lojinha/pedidos/${id}/fotos`, dados, { timeout: 60000 }),
  excluirFoto: (fotoId)       => api.delete(`/lojinha/fotos/${fotoId}`),
  movimentos:  (params)       => api.get('/lojinha/movimentos', { params, timeout: 30000 }),
  excluir: (id)        => api.delete(`/lojinha/pedidos/${id}`, { timeout: 120000 }),
};

export const requisicoesService = {
  criar:       (dados)           => api.post('/requisicoes', dados),
  listar:      (params)          => api.get('/requisicoes', { params }),
  detalhar:    (id)              => api.get(`/requisicoes/${id}`),
  relatorio:    () => api.get('/requisicoes/relatorio'),
  mudarStatus: (id, status, obs) => api.patch(`/requisicoes/${id}/status`, { status, observacao: obs }),
};

export const adminService = {
  listarUsuarios:   ()       => api.get('/admin/usuarios'),
  criarUsuario:     (dados)  => api.post('/admin/usuarios', dados),
  atualizarUsuario: (id, d)  => api.patch(`/admin/usuarios/${id}`, d),
  excluirUsuario:   (id)     => api.delete(`/admin/usuarios/${id}`),
  departamentos:    ()       => api.get('/admin/departamentos'),
  pipefyUso:        ()       => api.get('/admin/pipefy-uso'),
  pipefyChamadas:   (params) => api.get('/admin/pipefy-uso/chamadas', { params, timeout: 30000 }),
};

export const materialFornecedoresService = {
  listar:     (materialId) => api.get('/materiais/'+materialId+'/fornecedores'),
  vincular:   (materialId, d) => api.post('/materiais/'+materialId+'/fornecedores', d),
  desvincular:(materialId, fornecedorId) => api.delete('/materiais/'+materialId+'/fornecedores/'+fornecedorId),
};

export const fornecedoresService = {
  listar:  () => api.get('/fornecedores'),
  criar:   (d) => api.post('/fornecedores', d),
  editar:  (id, d) => api.patch('/fornecedores/'+id, d),
  excluir: (id) => api.delete('/fornecedores/'+id),
  zen:     (documento) => api.get('/fornecedores/zen', { params: { documento }, timeout: 30000 }),
};

export const comprasService = {
  listarProcessos:  ()                      => api.get('/compras/processos'),
  detalharProcesso: (id)                    => api.get(`/compras/processos/${id}`),
  criarProcesso:    (itens)                 => api.post('/compras/processos', { itens }),
  cancelarProcesso: (id)                    => api.post(`/compras/processos/${id}/cancelar`),
  excluirProcesso:  (id)                    => api.delete(`/compras/processos/${id}`),
  detalharItem:     (processoId, itemId)    => api.get(`/compras/processos/${processoId}/itens/${itemId}`),
  editarQuantidade: (processoId, itemId, quantidade) =>
    api.patch(`/compras/processos/${processoId}/itens/${itemId}`, { quantidade_necessaria: quantidade }),
  adicionarCotacao: (processoId, itemId, d) => api.post(`/compras/processos/${processoId}/itens/${itemId}/cotacoes`, d),
  aprovarItem:      (processoId, itemId, cotacaoId) => api.post(`/compras/processos/${processoId}/itens/${itemId}/aprovar`, { cotacao_id: cotacaoId }),
  cancelarItem:     (processoId, itemId)    => api.post(`/compras/processos/${processoId}/itens/${itemId}/cancelar`),
  historico:        (params)                => api.get('/compras/historico', { params }),
  dashboard:        (params)                => api.get('/compras/dashboard', { params }),
  acompanhamento:   ()                      => api.get('/compras/acompanhamento'),
  confirmarEntrega: (processoId, itemId, numeroNotaFiscal) =>
    api.post(`/compras/processos/${processoId}/itens/${itemId}/confirmar-entrega`, { numero_nota_fiscal: numeroNotaFiscal }),
};

export default api;
