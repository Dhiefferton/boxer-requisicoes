// ============================================================
// pages/Login.jsx
// ============================================================
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button, Input } from '../components/ui';

export default function Login() {
  const [email, setEmail]         = useState('');
  const [senha, setSenha]         = useState('');
  const [verSenha, setVerSenha]   = useState(false);
  const [erro, setErro]           = useState('');
  const [loading, setLoading]     = useState(false);

  const { login }  = useAuth();
  const navigate   = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !senha) { setErro('Preencha e-mail e senha.'); return; }
    setErro('');
    setLoading(true);
    try {
      await login(email, senha);
      navigate('/catalogo');
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao fazer login. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#4f6ef7] flex items-center justify-center shadow-lg shadow-[#4f6ef7]/20">
            <Package size={28} className="text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-[#e8eaf0]">Boxer Requisições</h1>
            <p className="text-sm text-[#8b91a8] mt-0.5">Sistema interno de materiais</p>
          </div>
        </div>

        {/* Card de login */}
        <div className="bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-6">
          <h2 className="text-base font-semibold text-[#e8eaf0] mb-5">Entrar na sua conta</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="E-mail"
              type="email"
              placeholder="seu@email.com.br"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-[#8b91a8] font-medium">Senha</label>
              <div className="relative">
                <input
                  type={verSenha ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  autoComplete="current-password"
                  className="
                    w-full bg-[#2e3347] border border-[#2e3347] text-[#e8eaf0] rounded-xl
                    px-4 py-2.5 pr-11 placeholder:text-[#8b91a8] text-sm
                    focus:outline-none focus:border-[#4f6ef7] focus:ring-1 focus:ring-[#4f6ef7]/30
                    transition-colors
                  "
                />
                <button
                  type="button"
                  onClick={() => setVerSenha(!verSenha)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b91a8] hover:text-[#e8eaf0] transition-colors"
                >
                  {verSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {erro && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
                {erro}
              </div>
            )}

            <Button type="submit" loading={loading} size="lg" className="mt-1">
              {loading ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-[#8b91a8] mt-6">
          Problemas com acesso? Fale com o administrador.
        </p>
      </div>
    </div>
  );
}
