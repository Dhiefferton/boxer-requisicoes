// ============================================================
// pages/RedefinirSenha.jsx — Nova senha a partir do link do e-mail
// ============================================================
import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Package, Eye, EyeOff, KeyRound, CheckCircle2, XCircle } from 'lucide-react';
import { authService } from '../services/api';

export default function RedefinirSenha() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [estado,    setEstado]    = useState('verificando'); // verificando | valido | invalido | pronto
  const [nome,      setNome]      = useState('');
  const [senha,     setSenha]     = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [verSenha,  setVerSenha]  = useState(false);
  const [erro,      setErro]      = useState('');
  const [loading,   setLoading]   = useState(false);

  useEffect(() => {
    if (!token) { setEstado('invalido'); setErro('Link incompleto. Abra o link direto do e-mail.'); return; }
    authService.validarReset(token)
      .then(({ data }) => { setNome(data.nome || ''); setEstado('valido'); })
      .catch(err => { setErro(err.response?.data?.erro || 'Este link é inválido ou já expirou.'); setEstado('invalido'); });
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');
    if (senha.length < 6) { setErro('A senha deve ter ao menos 6 caracteres.'); return; }
    if (senha !== confirmar) { setErro('As senhas não coincidem.'); return; }
    setLoading(true);
    try {
      await authService.redefinirSenha(token, senha);
      setEstado('pronto');
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao salvar a nova senha. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const inputClass = `
    w-full bg-[var(--c-borda)] border border-[var(--c-borda)] text-[var(--c-texto)] rounded-xl
    px-4 py-2.5 pr-11 placeholder:text-[var(--c-suave)] text-sm
    focus:outline-none focus:border-[var(--c-destaque)] focus:ring-1 focus:ring-[var(--c-destaque)]/30
    transition-colors
  `;

  return (
    <div className="min-h-screen bg-[var(--c-fundo)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[var(--c-destaque)] flex items-center justify-center shadow-lg shadow-[var(--c-destaque)]/20">
            <Package size={28} className="text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-[var(--c-texto)]">Boxer Requisições</h1>
            <p className="text-sm text-[var(--c-suave)] mt-0.5">Sistema interno de materiais</p>
          </div>
        </div>

        <div className="bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl p-6 space-y-5">

          {estado === 'verificando' && (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-[var(--c-destaque)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {estado === 'invalido' && (
            <div className="space-y-4 text-center">
              <XCircle size={36} className="mx-auto text-red-400" />
              <p className="text-sm text-[var(--c-texto)]">{erro}</p>
              <Link to="/login" className="block w-full py-3 rounded-xl text-sm font-semibold bg-[var(--c-destaque)] text-white hover:bg-[var(--c-destaque-h)] transition-colors">
                Voltar para o login
              </Link>
            </div>
          )}

          {estado === 'pronto' && (
            <div className="space-y-4 text-center">
              <CheckCircle2 size={36} className="mx-auto text-green-400" />
              <p className="text-sm text-[var(--c-texto)]">Senha redefinida! Agora é só entrar com a nova senha.</p>
              <Link to="/login" className="block w-full py-3 rounded-xl text-sm font-semibold bg-[var(--c-destaque)] text-white hover:bg-[var(--c-destaque-h)] transition-colors">
                Ir para o login
              </Link>
            </div>
          )}

          {estado === 'valido' && (
            <>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--c-destaque)]/15 flex items-center justify-center shrink-0">
                  <KeyRound size={18} className="text-[var(--c-destaque)]" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[var(--c-texto)]">Criar nova senha</h2>
                  <p className="text-xs text-[var(--c-suave)] mt-0.5">{nome ? `${nome}, defina` : 'Defina'} sua nova senha de acesso.</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-[var(--c-suave)] font-medium">Nova senha</label>
                  <div className="relative">
                    <input
                      type={verSenha ? 'text' : 'password'}
                      placeholder="mínimo 6 caracteres"
                      value={senha}
                      onChange={e => setSenha(e.target.value)}
                      className={inputClass}
                      autoComplete="new-password"
                      autoFocus
                      required
                    />
                    <button type="button" onClick={() => setVerSenha(!verSenha)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--c-suave)] hover:text-[var(--c-texto)]">
                      {verSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-[var(--c-suave)] font-medium">Confirmar nova senha</label>
                  <input
                    type="password"
                    placeholder="repita a senha"
                    value={confirmar}
                    onChange={e => setConfirmar(e.target.value)}
                    className={inputClass.replace('pr-11', '')}
                    autoComplete="new-password"
                    required
                  />
                </div>

                {erro && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
                    {erro}
                  </div>
                )}

                <button type="submit" disabled={loading}
                  className="w-full py-3 rounded-xl text-sm font-semibold bg-[var(--c-destaque)] text-white hover:bg-[var(--c-destaque-h)] transition-colors disabled:opacity-40 mt-1">
                  {loading ? 'Salvando...' : 'Salvar nova senha'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
