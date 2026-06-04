// ============================================================
// context/AuthContext.jsx — Estado Global de Autenticação
// ============================================================
import { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario,    setUsuario]    = useState(null);
  const [carregando, setCarregando] = useState(true);

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
