// ============================================================
// pages/TrocarSenha.jsx — Tela obrigatória de troca de senha
// ============================================================
import { useState } from 'react';
import { Package, Eye, EyeOff, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function TrocarSenha() {
  const { trocarSenha, logout } = useAuth();
  const [senha,      setSenha]      = useState('');
  const [confirmar,  setConfirmar]  = useState('');
  const [verSenha,   setVerSenha]   = useState(false);
  const [erro,       setErro]       = useState('');
  const [loading,    setLoading]    = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');

    if (senha.length < 6) { setErro('A senha deve ter ao menos 6 caracteres.'); return; }
    if (senha !== confirmar) { setErro('As senhas não coincidem.'); return; }

    setLoading(true);
    try {
      await trocarSenha(senha);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao trocar a senha. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const inputClass = `
    w-full bg-[#2e3347] border border-[#2e3347] text-[#e8eaf0] rounded-xl
    px-4 py-2.5 pr-11 placeholder:text-[#8b91a8] text-sm
    focus:outline-none focus:border-[#4f6ef7] focus:ring-1 focus:ring-[#4f6ef7]/30
    transition-colors
  `;

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

        {/* Card */}
        <div className="bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
              <Lock size={18} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#e8eaf0]">Troca de senha obrigatória</h2>
              <p className="text-xs text-[#8b91a8] mt-0.5">Por segurança, defina uma nova senha para continuar.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-[#8b91a8] font-medium">Nova senha</label>
              <div className="relative">
                <input
                  type={verSenha ? 'text' : 'password'}
                  placeholder="mínimo 6 caracteres"
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  className={inputClass}
                  autoFocus
                  required
                />
                <button type="button" onClick={() => setVerSenha(!verSenha)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b91a8] hover:text-[#e8eaf0]">
                  {verSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-[#8b91a8] font-medium">Confirmar nova senha</label>
              <input
                type="password"
                placeholder="repita a senha"
                value={confirmar}
                onChange={e => setConfirmar(e.target.value)}
                className={inputClass.replace('pr-11', '')}
                required
              />
            </div>

            {erro && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
                {erro}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-[#4f6ef7] text-white hover:bg-[#3d5ce5] transition-colors disabled:opacity-40 mt-1">
              {loading ? 'Salvando...' : 'Salvar nova senha'}
            </button>
          </form>

          <button onClick={logout} className="w-full text-xs text-[#8b91a8] hover:text-red-400 transition-colors text-center">
            Sair e entrar com outra conta
          </button>
        </div>
      </div>
    </div>
  );
}
