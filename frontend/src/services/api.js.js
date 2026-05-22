// ============================================================
// services/api.js — Cliente HTTP centralizado
// ============================================================
// Em desenvolvimento: proxy do Vite redireciona /api → localhost:3001
// Em produção: VITE_API_URL aponta para o backend real
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

// Injeta token JWT em todas as requisições
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('boxer_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redireciona para login se o token expirar
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
  login: (email, senha) => api.post('/auth/login', { email, senha }),
  me:    ()             => api.get('/auth/me'),
};

export const materiaisService = {
  listar:          (params) => api.get('/materiais', { params }),
  detalhar:        (id)     => api.get(`/materiais/${id}`),
  categorias:      ()       => api.get('/categorias'),
  atualizarEstoque:(id, d)  => api.patch(`/materiais/${id}/estoque`, d),
};

export const requisicoesService = {
  criar:       (dados)         => api.post('/requisicoes', dados),
  listar:      (params)        => api.get('/requisicoes', { params }),
  detalhar:    (id)            => api.get(`/requisicoes/${id}`),
  mudarStatus: (id, status, obs) => api.patch(`/requisicoes/${id}/status`, { status, observacao: obs }),
};

export const adminService = {
  listarUsuarios:   ()       => api.get('/admin/usuarios'),
  criarUsuario:     (dados)  => api.post('/admin/usuarios', dados),
  atualizarUsuario: (id, d)  => api.patch(`/admin/usuarios/${id}`, d),
  departamentos:    ()       => api.get('/admin/departamentos'),
};

export default api;
