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
  login:       (email, senha) => api.post('/auth/login', { email, senha }),
  me:          ()             => api.get('/auth/me'),
  trocarSenha: (senha_nova)   => api.patch('/auth/trocar-senha', { senha_nova }),
};

export const materiaisService = {
  listar:          (params) => api.get('/materiais', { params }),
  detalhar:        (id)     => api.get(`/materiais/${id}`),
  categorias:      ()       => api.get('/categorias'),
  atualizarEstoque:(id, d)  => api.patch(`/materiais/${id}/estoque`, d),
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
};

export const comprasService = {
  listarProcessos:  ()                      => api.get('/compras/processos'),
  detalharProcesso: (id)                    => api.get(`/compras/processos/${id}`),
  criarProcesso:    (itens)                 => api.post('/compras/processos', { itens }),
  cancelarProcesso: (id)                    => api.post(`/compras/processos/${id}/cancelar`),
  excluirProcesso:  (id)                    => api.delete(`/compras/processos/${id}`),
  detalharItem:     (processoId, itemId)    => api.get(`/compras/processos/${processoId}/itens/${itemId}`),
  adicionarCotacao: (processoId, itemId, d) => api.post(`/compras/processos/${processoId}/itens/${itemId}/cotacoes`, d),
  aprovarItem:      (processoId, itemId, cotacaoId) => api.post(`/compras/processos/${processoId}/itens/${itemId}/aprovar`, { cotacao_id: cotacaoId }),
  cancelarItem:     (processoId, itemId)    => api.post(`/compras/processos/${processoId}/itens/${itemId}/cancelar`),
  historico:        (params)                => api.get('/compras/historico', { params }),
  dashboard:        ()                      => api.get('/compras/dashboard'),
  acompanhamento:   ()                      => api.get('/compras/acompanhamento'),
  confirmarEntrega: (processoId, itemId, numeroNotaFiscal) =>
    api.post(`/compras/processos/${processoId}/itens/${itemId}/confirmar-entrega`, { numero_nota_fiscal: numeroNotaFiscal }),
};

export default api;
