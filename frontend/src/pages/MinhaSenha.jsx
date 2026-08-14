// ============================================================
// pages/MinhaSenha.jsx — Troca de senha voluntária (qualquer perfil)
// ============================================================
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, ArrowLeft } from 'lucide-react';
import { authService } from '../services/api';

export default function MinhaSenha() {
  const navigate = useNavigate();
  const [senhaAtual,  setSenhaAtual]  = useState('');
  const [senhaNova,   setSenhaNova]   = useState('');
  const [confirmar,   setConfirmar]   = useState('');
  const [verSenha,    setVerSenha]    = useState(false);
  const [erro,        setErro]        = useState('');
  const [sucesso,     setSucesso]     = useState(false);
  const [loading,     setLoading]     = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');
    setSucesso(false);

    if (senhaNova.length < 6) { setErro('A nova senha deve ter ao menos 6 caracteres.'); return; }
    if (senhaNova !== confirmar) { setErro('As senhas não coincidem.'); return; }

    setLoading(true);
    try {
      await authService.alterarSenha(senhaAtual, senhaNova);
      setSucesso(true);
      setSenhaAtual(''); setSenhaNova(''); setConfirmar('');
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao trocar a senha. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const inputClass = `
    w-full bg-[#0f1117] border border-[#2e3347] text-[#e8eaf0] rounded-xl
    px-4 py-2.5 pr-11 placeholder:text-[#8b91a8] text-sm
    focus:outline-none focus:border-[#4f6ef7] focus:ring-1 focus:ring-[#4f6ef7]/30
    transition-colors
  `;

  return (
    <div className="max-w-md mx-auto space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-xs text-[#8b91a8] hover:text-[#e8eaf0]">
        <ArrowLeft size={14} /> Voltar
      </button>

      <div className="bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#4f6ef7]/15 flex items-center justify-center shrink-0">
            <Lock size={18} className="text-[#4f6ef7]" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-[#e8eaf0]">Trocar minha senha</h1>
            <p className="text-xs text-[#8b91a8] mt-0.5">Informe a senha atual e defina uma nova.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-[#8b91a8] font-medium">Senha atual</label>
            <input type="password" placeholder="sua senha de agora"
              value={senhaAtual} onChange={e => setSenhaAtual(e.target.value)}
              className={inputClass.replace('pr-11', '')} autoFocus required />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-[#8b91a8] font-medium">Nova senha</label>
            <div className="relative">
              <input type={verSenha ? 'text' : 'password'} placeholder="mínimo 6 caracteres"
                value={senhaNova} onChange={e => setSenhaNova(e.target.value)}
                className={inputClass} required />
              <button type="button" onClick={() => setVerSenha(!verSenha)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b91a8] hover:text-[#e8eaf0]">
                {verSenha ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-[#8b91a8] font-medium">Confirmar nova senha</label>
            <input type="password" placeholder="repita a nova senha"
              value={confirmar} onChange={e => setConfirmar(e.target.value)}
              className={inputClass.replace('pr-11', '')} required />
          </div>

          {erro && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
              {erro}
            </div>
          )}
          {sucesso && (
            <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm px-4 py-3 rounded-xl">
              Senha alterada com sucesso!
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-[#4f6ef7] text-white hover:bg-[#3d5ce5] transition-colors disabled:opacity-40 mt-1">
            {loading ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </form>
      </div>
    </div>
  );
}
