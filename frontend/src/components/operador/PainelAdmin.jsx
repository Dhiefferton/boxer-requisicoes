// ============================================================
// pages/operador/PainelAdmin.jsx
// Gestão de usuários e catálogo — perfil admin
// ============================================================
import { useState, useEffect } from 'react';
import { UserPlus, RefreshCw, Check, X, Users, Package } from 'lucide-react';
import api, { adminService, materiaisService } from '../../services/api';
import { Button, Input, Spinner, Empty } from '../../components/ui';

// ── Aba Usuários ─────────────────────────────────────────────
function AbaUsuarios() {
  const [usuarios,      setUsuarios]      = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [criando,       setCriando]       = useState(false);
  const [form,          setForm]          = useState({ nome: '', email: '', senha: '', perfil: 'colaborador', departamento_id: '' });
  const [erro,          setErro]          = useState('');
  const [salvando,      setSalvando]      = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      const [u, d] = await Promise.all([adminService.listarUsuarios(), adminService.departamentos()]);
      setUsuarios(u.data.usuarios);
      setDepartamentos(d.data.departamentos);
    } finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  async function handleCriar(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      await adminService.criarUsuario({
        ...form,
        departamento_id: form.departamento_id ? parseInt(form.departamento_id) : null,
      });
      setCriando(false);
      setForm({ nome: '', email: '', senha: '', perfil: 'colaborador', departamento_id: '' });
      carregar();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao criar usuário.');
    } finally { setSalvando(false); }
  }

  async function toggleAtivo(usuario) {
    await adminService.atualizarUsuario(usuario.id, { ativo: !usuario.ativo });
    setUsuarios(prev => prev.map(u => u.id === usuario.id ? { ...u, ativo: !u.ativo } : u));
  }

  const inputClass = `
    w-full bg-[#2e3347] border border-[#2e3347] text-[#e8eaf0] rounded-xl px-3 py-2
    text-sm placeholder:text-[#8b91a8]
    focus:outline-none focus:border-[#4f6ef7] focus:ring-1 focus:ring-[#4f6ef7]/30
  `;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#8b91a8]">{usuarios.length} usuário(s) cadastrado(s)</p>
        <div className="flex gap-2">
          <button onClick={carregar} className="p-2 rounded-xl text-[#8b91a8] hover:bg-[#2e3347] transition-colors">
            <RefreshCw size={15} />
          </button>
          <Button size="sm" onClick={() => setCriando(!criando)}>
            <UserPlus size={14} />
            {criando ? 'Cancelar' : 'Novo usuário'}
          </Button>
        </div>
      </div>

      {/* Formulário de criação */}
      {criando && (
        <div className="bg-[#21253a] border border-[#2e3347] rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-[#e8eaf0]">Novo usuário</h3>
          <form onSubmit={handleCriar} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={form.nome}  onChange={e => setForm(f => ({...f, nome: e.target.value}))}  placeholder="Nome completo"  className={inputClass} required />
            <input value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="E-mail"        className={inputClass} type="email" required />
            <input value={form.senha} onChange={e => setForm(f => ({...f, senha: e.target.value}))} placeholder="Senha inicial" className={inputClass} type="password" required minLength={6} />
            <select value={form.perfil} onChange={e => setForm(f => ({...f, perfil: e.target.value}))} className={inputClass}>
              <option value="colaborador">Colaborador</option>
              <option value="operador">Operador</option>
              <option value="admin">Admin</option>
            </select>
            <select value={form.departamento_id} onChange={e => setForm(f => ({...f, departamento_id: e.target.value}))} className={inputClass}>
              <option value="">— Departamento —</option>
              {departamentos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
            <div className="flex gap-2 items-end">
              {erro && <p className="text-xs text-red-400 flex-1">{erro}</p>}
              <Button type="submit" loading={salvando} className="ml-auto">Criar</Button>
            </div>
          </form>
        </div>
      )}

      {/* Lista de usuários */}
      {loading ? <div className="flex justify-center py-8"><Spinner className="text-[#4f6ef7]" /></div> : (
        <div className="space-y-2">
          {usuarios.map(u => (
            <div key={u.id} className={`flex items-center gap-3 bg-[#1a1d27] border border-[#2e3347] rounded-xl px-4 py-3 ${!u.ativo ? 'opacity-50' : ''}`}>
              <div className="w-8 h-8 rounded-full bg-[#4f6ef7]/20 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-[#4f6ef7]">{u.nome.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#e8eaf0] truncate">{u.nome}</p>
                <p className="text-xs text-[#8b91a8]">{u.email} · <span className="capitalize">{u.perfil}</span>{u.departamento_nome ? ` · ${u.departamento_nome}` : ''}</p>
              </div>
              <button
                onClick={() => toggleAtivo(u)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                  ${u.ativo
                    ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                    : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                  }`}
              >
                {u.ativo ? <><X size={12} /> Desativar</> : <><Check size={12} /> Ativar</>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Aba Estoque ──────────────────────────────────────────────
function AbaEstoque() {
  const [materiais, setMateriais]   = useState([]);
  const [loading,   setLoading]     = useState(true);
  const [editando,  setEditando]    = useState(null); // { id, quantidade, nivel_minimo }
  const [salvando,  setSalvando]    = useState(false);

  useEffect(() => {
    setLoading(true);
    materiaisService.listar({ limite: 200 })
      .then(r => setMateriais(r.data.materiais))
      .finally(() => setLoading(false));
  }, []);

  async function salvarEstoque() {
    if (!editando) return;
    setSalvando(true);
    try {
      await api.patch(`/materiais/${editando.id}/estoque`, {
        quantidade:   parseInt(editando.quantidade),
        nivel_minimo: parseInt(editando.nivel_minimo),
      });
      setMateriais(prev => prev.map(m =>
        m.id === editando.id
          ? { ...m, quantidade: parseInt(editando.quantidade), nivel_minimo: parseInt(editando.nivel_minimo) }
          : m
      ));
      setEditando(null);
    } catch (err) {
      alert(err.response?.data?.erro || 'Erro ao salvar.');
    } finally { setSalvando(false); }
  }

  const statusColor = {
    disponivel:    'bg-green-500/15 text-green-400',
    baixo_estoque: 'bg-amber-500/15 text-amber-400',
    sem_estoque:   'bg-red-500/15 text-red-400',
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-[#8b91a8]">Clique na quantidade para editar o estoque de qualquer material.</p>
      {loading ? <div className="flex justify-center py-8"><Spinner className="text-[#4f6ef7]" /></div> : (
        <div className="space-y-1.5">
          {materiais.map(m => (
            <div key={m.id} className="flex items-center gap-3 bg-[#1a1d27] border border-[#2e3347] rounded-xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[#4f6ef7]">{m.codigo}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColor[m.status_estoque]}`}>
                    {m.status_estoque === 'disponivel' ? 'OK' : m.status_estoque === 'baixo_estoque' ? 'Baixo' : 'Zero'}
                  </span>
                </div>
                <p className="text-sm text-[#e8eaf0] truncate">{m.descricao}</p>
              </div>

              {editando?.id === m.id ? (
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex flex-col gap-1">
                    <input
                      type="number" min="0"
                      value={editando.quantidade}
                      onChange={e => setEditando(v => ({...v, quantidade: e.target.value}))}
                      className="w-20 bg-[#2e3347] border border-[#4f6ef7] text-[#e8eaf0] rounded-lg px-2 py-1 text-xs text-center"
                      placeholder="Qtd"
                    />
                    <input
                      type="number" min="0"
                      value={editando.nivel_minimo}
                      onChange={e => setEditando(v => ({...v, nivel_minimo: e.target.value}))}
                      className="w-20 bg-[#2e3347] border border-[#2e3347] text-[#8b91a8] rounded-lg px-2 py-1 text-xs text-center"
                      placeholder="Mínimo"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={salvarEstoque} disabled={salvando} className="p-1.5 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25">
                      <Check size={13} />
                    </button>
                    <button onClick={() => setEditando(null)} className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20">
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setEditando({ id: m.id, quantidade: m.quantidade ?? 0, nivel_minimo: m.nivel_minimo ?? 5 })}
                  className="shrink-0 text-right hover:opacity-70 transition-opacity"
                >
                  <p className="text-sm font-bold text-[#e8eaf0]">{m.quantidade ?? '—'}</p>
                  <p className="text-[10px] text-[#8b91a8]">{m.unidade}</p>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Painel Admin principal ────────────────────────────────────
export default function PainelAdmin() {
  const [aba, setAba] = useState('usuarios');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-[#e8eaf0]">Painel Administrativo</h1>
        <p className="text-sm text-[#8b91a8] mt-0.5">Gestão de usuários e estoque</p>
      </div>

      {/* Abas */}
      <div className="flex bg-[#1a1d27] border border-[#2e3347] rounded-xl p-1 w-fit gap-1">
        <button
          onClick={() => setAba('usuarios')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors
            ${aba === 'usuarios' ? 'bg-[#4f6ef7] text-white' : 'text-[#8b91a8] hover:text-[#e8eaf0]'}`}
        >
          <Users size={15} /> Usuários
        </button>
        <button
          onClick={() => setAba('estoque')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors
            ${aba === 'estoque' ? 'bg-[#4f6ef7] text-white' : 'text-[#8b91a8] hover:text-[#e8eaf0]'}`}
        >
          <Package size={15} /> Estoque
        </button>
      </div>

      {aba === 'usuarios' && <AbaUsuarios />}
      {aba === 'estoque'  && <AbaEstoque />}
    </div>
  );
}
