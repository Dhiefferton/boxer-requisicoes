// ============================================================
// services/api.js — Cliente HTTP centralizado
// ============================================================
// Toda chamada ao backend passa por aqui.
// O interceptor injeta o token JWT automaticamente em toda requisição
// e redireciona para o login se o token expirar.
// ============================================================

import axios from 'axios';

// Em desenvolvimento local, usa o proxy do Vite ('/api' relativo).
// Em produção no Vercel, frontend e backend ficam em domínios
// separados - VITE_API_URL aponta pra URL completa do backend.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Injeta o token JWT em todas as requisições autenticadas
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('boxer_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Trata erros globalmente
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Token expirado ou inválido → redireciona para o login
    if (error.response?.status === 401) {
      localStorage.removeItem('boxer_token');
      localStorage.removeItem('boxer_usuario');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ── Endpoints de Autenticação ────────────────────────────────
export const authService = {
  login:  (email, senha) => api.post('/auth/login', { email, senha }),
  me:     ()             => api.get('/auth/me'),
};

// ── Endpoints do Catálogo ────────────────────────────────────
export const materiaisService = {
  listar:     (params) => api.get('/materiais', { params }),
  detalhar:   (id)     => api.get(`/materiais/${id}`),
  categorias: ()       => api.get('/categorias'),
};

// ── Endpoints de Requisições ─────────────────────────────────
export const requisicoesService = {
  criar:       (dados)            => api.post('/requisicoes', dados),
  listar:      (params)           => api.get('/requisicoes', { params }),
  detalhar:    (id)               => api.get(`/requisicoes/${id}`),
  mudarStatus: (id, status, obs)  => api.patch(`/requisicoes/${id}/status`, { status, observacao: obs }),
};

// ── Endpoints de Admin ───────────────────────────────────────
export const adminService = {
  listarUsuarios:    ()      => api.get('/admin/usuarios'),
  criarUsuario:      (dados) => api.post('/admin/usuarios', dados),
  atualizarUsuario:  (id, d) => api.patch(`/admin/usuarios/${id}`, d),
  departamentos:     ()      => api.get('/admin/departamentos'),
};

export default api;
