// ============================================================
// context/AuthContext.jsx — Estado Global de Autenticação
// ============================================================
import { createContext, useContext, useState, useEffect } from 'react';
import { definirPerfilAtual } from '../utils/perfilAtual';
import { authService } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario,    setUsuario]    = useState(null);
  const [carregando, setCarregando] = useState(true);
  // Perfil para regras fora dos componentes (ex.: para onde o admin pode mover os cards)
  useEffect(() => { definirPerfilAtual(usuario?.perfil); }, [usuario?.perfil]);

  useEffect(() => {
    const token = localStorage.getItem('boxer_token');
    const salvo = localStorage.getItem('boxer_usuario');
    if (token && salvo) {
      try {
        setUsuario(JSON.parse(salvo));
      } catch {
        logout();
      }
    }
    setCarregando(false);
  }, []);

  // Atualiza os dados do usuário (telas liberadas, perfil, setor) ao abrir e ao voltar para a aba,
  // para a mudança feita no cadastro valer sem precisar sair e entrar de novo
  useEffect(() => {
    async function atualizar() {
      if (!localStorage.getItem('boxer_token')) return;
      try {
        const { data } = await authService.me();
        if (!data?.usuario) return;
        setUsuario(u => {
          if (!u) return u;
          const novo = { ...u, ...data.usuario, trocar_senha: u.trocar_senha && data.usuario.trocar_senha };
          localStorage.setItem('boxer_usuario', JSON.stringify(novo));
          return novo;
        });
      } catch { /* sem rede ou sessão expirada: segue com o que está salvo */ }
    }
    atualizar();
    const aoVoltar = () => { if (document.visibilityState === 'visible') atualizar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, []);

  async function login(email, senha) {
    const { data } = await authService.login(email, senha);
    localStorage.setItem('boxer_token', data.token);
    localStorage.setItem('boxer_usuario', JSON.stringify(data.usuario));
    setUsuario(data.usuario);
    return data.usuario;
  }

  async function trocarSenha(senha_nova) {
    await authService.trocarSenha(senha_nova);
    // Atualiza o usuário local removendo a flag
    const atualizado = { ...usuario, trocar_senha: false };
    localStorage.setItem('boxer_usuario', JSON.stringify(atualizado));
    setUsuario(atualizado);
  }

  function logout() {
    localStorage.removeItem('boxer_token');
    localStorage.removeItem('boxer_usuario');
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, login, logout, trocarSenha, carregando }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve estar dentro de AuthProvider');
  return ctx;
}
