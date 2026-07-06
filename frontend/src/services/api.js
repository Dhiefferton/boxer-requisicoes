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

export default api;
