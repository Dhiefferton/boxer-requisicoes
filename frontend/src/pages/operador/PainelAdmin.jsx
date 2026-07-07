// ============================================================
// pages/operador/PainelAdmin.jsx
// ============================================================
import { useState, useEffect, useRef } from 'react';
import { UserPlus, RefreshCw, Check, X, Users, Package, Upload, FileDown, Plus, Pencil, Trash2, Search, Building2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import api, { adminService, materiaisService, fornecedoresService, materialFornecedoresService } from '../../services/api';
import { Button, Spinner } from '../../components/ui';

// ── Aba Usuários ─────────────────────────────────────────────
function AbaUsuarios() {
  const [usuarios,      setUsuarios]      = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [criando,       setCriando]       = useState(false);
  const [editando,      setEditando]      = useState(null);
  const [busca,         setBusca]         = useState('');
  const [form,          setForm]          = useState({ nome: '', email: '', senha: '', perfil: 'colaborador', departamento_id: '' });
  const [formEdit,      setFormEdit]      = useState({ email: '', senha: '', perfil: 'colaborador', departamento_id: '' });
  const [erro,          setErro]          = useState('');
  const [erroEdit,      setErroEdit]      = useState('');
  const [salvando,      setSalvando]      = useState(false);
  const [salvandoEdit,  setSalvandoEdit]  = useState(false);
  const [excluindo,     setExcluindo]     = useState(null);

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

  async function handleEditar(e) {
    e.preventDefault();
    setErroEdit('');
    setSalvandoEdit(true);
    try {
      const payload = {};
      if (formEdit.email)  payload.email  = formEdit.email;
      if (formEdit.senha)  payload.senha  = formEdit.senha;
      if (formEdit.perfil) payload.perfil = formEdit.perfil;
      if (formEdit.departamento_id !== undefined) payload.departamento_id = formEdit.departamento_id ? parseInt(formEdit.departamento_id) : null;
      await adminService.atualizarUsuario(editando.id, payload);
      setEditando(null);
      carregar();
    } catch (err) {
      setErroEdit(err.response?.data?.erro || 'Erro ao atualizar usuário.');
    } finally { setSalvandoEdit(false); }
  }

  async function handleExcluir(u) {
    if (!confirm(`Excluir o usuário "${u.nome}"? As requisições serão mantidas.`)) return;
    setExcluindo(u.id);
    try {
      await api.delete(`/admin/usuarios/${u.id}`);
      setUsuarios(prev => prev.filter(x => x.id !== u.id));
    } catch (err) {
      alert(err.response?.data?.erro || 'Erro ao excluir usuário.');
    } finally { setExcluindo(null); }
  }

  function abrirEdicao(u) {
    setEditando(u);
    setFormEdit({ email: u.email, senha: '', perfil: u.perfil, departamento_id: u.departamento_id || '' });
    setErroEdit('');
  }

  async function toggleAtivo(usuario) {
    await adminService.atualizarUsuario(usuario.id, { ativo: !usuario.ativo });
    setUsuarios(prev => prev.map(u => u.id === usuario.id ? { ...u, ativo: !u.ativo } : u));
  }

  // Filtra por nome ou departamento
  const usuariosFiltrados = usuarios.filter(u => {
    if (!busca) return true;
    const b = busca.toLowerCase();
    return (
      u.nome.toLowerCase().includes(b) ||
      (u.departamento_nome || '').toLowerCase().includes(b) ||
      u.email.toLowerCase().includes(b)
    );
  });

  const inputClass = `w-full bg-[#2e3347] border border-[#2e3347] text-[#e8eaf0] rounded-xl px-3 py-2 text-sm placeholder:text-[#8b91a8] focus:outline-none focus:border-[#4f6ef7] focus:ring-1 focus:ring-[#4f6ef7]/30`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-[#8b91a8]">{usuariosFiltrados.length} de {usuarios.length} usuário(s)</p>
        <div className="flex gap-2">
          <button onClick={carregar} className="p-2 rounded-xl text-[#8b91a8] hover:bg-[#2e3347] transition-colors"><RefreshCw size={15} /></button>
          <Button size="sm" onClick={() => setCriando(!criando)}>
            <UserPlus size={14} />{criando ? 'Cancelar' : 'Novo usuário'}
          </Button>
        </div>
      </div>

      {/* Campo de busca */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b91a8]" />
        <input
          type="search"
          placeholder="Buscar por nome, e-mail ou departamento..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="w-full bg-[#1a1d27] border border-[#2e3347] text-[#e8eaf0] rounded-xl pl-9 pr-4 py-2.5 text-sm placeholder:text-[#8b91a8] focus:outline-none focus:border-[#4f6ef7] transition-colors"
        />
        {busca && <button onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b91a8]"><X size={14} /></button>}
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

      {/* Modal de edição */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-[#e8eaf0]">Editar usuário</h3>
              <p className="text-xs text-[#8b91a8] mt-0.5">{editando.nome}</p>
            </div>
            <form onSubmit={handleEditar} className="space-y-3">
              <div>
                <label className="text-xs text-[#8b91a8] mb-1 block">E-mail</label>
                <input value={formEdit.email} onChange={e => setFormEdit(f => ({...f, email: e.target.value}))} placeholder="novo@email.com" className={inputClass} type="email" />
              </div>
              <div>
                <label className="text-xs text-[#8b91a8] mb-1 block">Nova senha (deixe em branco para manter)</label>
                <input value={formEdit.senha} onChange={e => setFormEdit(f => ({...f, senha: e.target.value}))} placeholder="mínimo 6 caracteres" className={inputClass} type="password" />
              </div>
              <div>
                <label className="text-xs text-[#8b91a8] mb-1 block">Perfil</label>
                <select value={formEdit.perfil} onChange={e => setFormEdit(f => ({...f, perfil: e.target.value}))} className={inputClass}>
                  <option value="colaborador">Colaborador</option>
                  <option value="operador">Operador</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-[#8b91a8] mb-1 block">Departamento</label>
                <select value={formEdit.departamento_id} onChange={e => setFormEdit(f => ({...f, departamento_id: e.target.value}))} className={inputClass}>
                  <option value="">— Sem departamento —</option>
                  {departamentos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </select>
              </div>
              {erroEdit && <p className="text-xs text-red-400">{erroEdit}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setEditando(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[#2e3347] text-[#8b91a8] hover:text-[#e8eaf0]">Cancelar</button>
                <button type="submit" disabled={salvandoEdit} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[#4f6ef7] text-white hover:bg-[#3d5ce5] disabled:opacity-40">
                  {salvandoEdit ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista de usuários */}
      {loading ? <div className="flex justify-center py-8"><Spinner className="text-[#4f6ef7]" /></div> : (
        <div className="space-y-2">
          {usuariosFiltrados.map(u => (
            <div key={u.id} className={`flex items-center gap-3 bg-[#1a1d27] border border-[#2e3347] rounded-xl px-4 py-3 ${!u.ativo ? 'opacity-50' : ''}`}>
              <div className="w-8 h-8 rounded-full bg-[#4f6ef7]/20 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-[#4f6ef7]">{u.nome.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#e8eaf0] truncate">{u.nome}</p>
                <p className="text-xs text-[#8b91a8]">{u.email} · <span className="capitalize">{u.perfil}</span>{u.departamento_nome ? ` · ${u.departamento_nome}` : ''}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => abrirEdicao(u)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#4f6ef7]/10 text-[#4f6ef7] hover:bg-[#4f6ef7]/20 transition-colors">
                  <Pencil size={12} /> Editar
                </button>
                <button onClick={() => toggleAtivo(u)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${u.ativo ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'}`}>
                  {u.ativo ? 'Desativar' : 'Ativar'}
                </button>
                <button onClick={() => handleExcluir(u)} disabled={excluindo === u.id}
                  className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40" title="Excluir usuário">
                  {excluindo === u.id ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Aba Departamentos ────────────────────────────────────────
function AbaDepartamentos() {
  const [departamentos, setDepartamentos] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [criando,       setCriando]       = useState(false);
  const [editando,      setEditando]      = useState(null);
  const [form,          setForm]          = useState({ nome: '', codigo: '' });
  const [formEdit,      setFormEdit]      = useState({ nome: '', codigo: '' });
  const [erro,          setErro]          = useState('');
  const [erroEdit,      setErroEdit]      = useState('');
  const [salvando,      setSalvando]      = useState(false);
  const [salvandoEdit,  setSalvandoEdit]  = useState(false);
  const [busca,         setBusca]         = useState('');

  async function carregar() {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/departamentos');
      setDepartamentos(data.departamentos);
    } finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  async function handleCriar(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      await api.post('/admin/departamentos', form);
      setCriando(false);
      setForm({ nome: '', codigo: '' });
      carregar();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao criar departamento.');
    } finally { setSalvando(false); }
  }

  async function handleEditar(e) {
    e.preventDefault();
    setErroEdit('');
    setSalvandoEdit(true);
    try {
      await api.patch(`/admin/departamentos/${editando.id}`, formEdit);
      setEditando(null);
      carregar();
    } catch (err) {
      setErroEdit(err.response?.data?.erro || 'Erro ao atualizar.');
    } finally { setSalvandoEdit(false); }
  }

  async function toggleAtivo(d) {
    await api.patch(`/admin/departamentos/${d.id}`, { ativo: !d.ativo });
    setDepartamentos(prev => prev.map(x => x.id === d.id ? { ...x, ativo: !x.ativo } : x));
  }

  const filtrados = departamentos.filter(d =>
    !busca ||
    d.nome.toLowerCase().includes(busca.toLowerCase()) ||
    d.codigo.toLowerCase().includes(busca.toLowerCase())
  );

  const inputClass = `w-full bg-[#2e3347] border border-[#2e3347] text-[#e8eaf0] rounded-xl px-3 py-2 text-sm placeholder:text-[#8b91a8] focus:outline-none focus:border-[#4f6ef7] focus:ring-1 focus:ring-[#4f6ef7]/30`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#8b91a8]">{filtrados.length} de {departamentos.length} departamento(s)</p>
        <div className="flex gap-2">
          <button onClick={carregar} className="p-2 rounded-xl text-[#8b91a8] hover:bg-[#2e3347] transition-colors"><RefreshCw size={15} /></button>
          <button onClick={() => setCriando(!criando)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#4f6ef7]/15 text-[#4f6ef7] hover:bg-[#4f6ef7]/25 transition-colors">
            <Plus size={13} /> {criando ? 'Cancelar' : 'Novo departamento'}
          </button>
        </div>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b91a8]" />
        <input type="search" placeholder="Buscar por nome ou código..." value={busca} onChange={e => setBusca(e.target.value)}
          className="w-full bg-[#1a1d27] border border-[#2e3347] text-[#e8eaf0] rounded-xl pl-9 pr-4 py-2.5 text-sm placeholder:text-[#8b91a8] focus:outline-none focus:border-[#4f6ef7] transition-colors" />
        {busca && <button onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b91a8]"><X size={14} /></button>}
      </div>

      {/* Formulário criar */}
      {criando && (
        <div className="bg-[#21253a] border border-[#2e3347] rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-[#e8eaf0]">Novo departamento</h3>
          <form onSubmit={handleCriar} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={form.nome} onChange={e => setForm(f => ({...f, nome: e.target.value}))} placeholder="Nome do departamento" className={inputClass} required />
            <input value={form.codigo} onChange={e => setForm(f => ({...f, codigo: e.target.value}))} placeholder="Código (ex: TI, RH)" className={inputClass} required />
            <div className="sm:col-span-2 flex gap-2 items-center">
              {erro && <p className="text-xs text-red-400 flex-1">{erro}</p>}
              <button type="submit" disabled={salvando} className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-[#4f6ef7] text-white hover:bg-[#3d5ce5] disabled:opacity-40">
                {salvando ? 'Criando...' : 'Criar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal editar */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-5 space-y-4">
            <h3 className="font-semibold text-[#e8eaf0]">Editar departamento</h3>
            <form onSubmit={handleEditar} className="space-y-3">
              <div>
                <label className="text-xs text-[#8b91a8] mb-1 block">Nome</label>
                <input value={formEdit.nome} onChange={e => setFormEdit(f => ({...f, nome: e.target.value}))} className={inputClass} required />
              </div>
              <div>
                <label className="text-xs text-[#8b91a8] mb-1 block">Código</label>
                <input value={formEdit.codigo} onChange={e => setFormEdit(f => ({...f, codigo: e.target.value}))} className={inputClass} required />
              </div>
              {erroEdit && <p className="text-xs text-red-400">{erroEdit}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setEditando(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[#2e3347] text-[#8b91a8]">Cancelar</button>
                <button type="submit" disabled={salvandoEdit} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[#4f6ef7] text-white disabled:opacity-40">
                  {salvandoEdit ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? <div className="flex justify-center py-8"><Spinner className="text-[#4f6ef7]" /></div> : (
        <div className="space-y-2">
          {filtrados.map(d => (
            <div key={d.id} className={`flex items-center gap-3 bg-[#1a1d27] border border-[#2e3347] rounded-xl px-4 py-3 ${!d.ativo ? 'opacity-50' : ''}`}>
              <div className="w-8 h-8 rounded-full bg-[#4f6ef7]/20 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-[#4f6ef7]">{d.codigo}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#e8eaf0]">{d.nome}</p>
                <p className="text-xs text-[#8b91a8]">{d.codigo} · {d.ativo ? 'Ativo' : 'Inativo'}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => { setEditando(d); setFormEdit({ nome: d.nome, codigo: d.codigo }); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#4f6ef7]/10 text-[#4f6ef7] hover:bg-[#4f6ef7]/20 transition-colors">
                  <Pencil size={12} /> Editar
                </button>
                <button onClick={() => toggleAtivo(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${d.ativo ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'}`}>
                  {d.ativo ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function AbaEstoque() {
  const [materiais,    setMateriais]    = useState([]);
  const [categorias,   setCategorias]   = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [busca,        setBusca]        = useState('');
  const [editandoQtd,  setEditandoQtd]  = useState(null);
  const [editandoProd, setEditandoProd] = useState(null);
  const [salvando,     setSalvando]     = useState(false);
  const [salvandoProd, setSalvandoProd] = useState(false);
  const [erroProd,     setErroProd]     = useState('');
  const [importando,   setImportando]   = useState(false);
  const [resultado,    setResultado]    = useState(null);
  const [criando,      setCriando]      = useState(false);
  const [salvandoNovo, setSalvandoNovo] = useState(false);
  const [erroNovo,     setErroNovo]     = useState('');
  const [formNovo,     setFormNovo]     = useState({ codigo: '', descricao: '', categoria_id: '', unidade: 'UN', quantidade: 0 });
  const inputFileRef = useRef(null);
  const [fornsProd,     setFornsProd]    = useState([]);
  const [todosForns,    setTodosForns]   = useState([]);
  const [fornSelecionado, setFornSelecionado] = useState('');
  const [precoForn,     setPrecoForn]    = useState('');

  async function carregarFornsProd(materialId) {
    const [f, t] = await Promise.all([
      materialFornecedoresService.listar(materialId),
      fornecedoresService.listar(),
    ]);
    setFornsProd(f.data.fornecedores);
    setTodosForns(t.data.fornecedores);
    setFornSelecionado('');
    setPrecoForn('');
  }

  async function handleVincularForn() {
    if (!fornSelecionado) return;
    await materialFornecedoresService.vincular(editandoProd.id, { fornecedor_id: parseInt(fornSelecionado), preco_unitario: precoForn || null });
    carregarFornsProd(editandoProd.id);
  }

  async function handleDesvincularForn(fornId) {
    await materialFornecedoresService.desvincular(editandoProd.id, fornId);
    carregarFornsProd(editandoProd.id);
  }

  async function carregar() {
    setLoading(true);
    try {
      const [m, c] = await Promise.all([
        materiaisService.listar({ limite: 5000 }),
        materiaisService.categorias(),
      ]);
      setMateriais(m.data.materiais);
      setCategorias(c.data.categorias);
    } finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  async function salvarEstoque() {
    if (!editandoQtd) return;
    setSalvando(true);
    try {
      await api.patch(`/materiais/${editandoQtd.id}/estoque`, {
        quantidade:   parseInt(editandoQtd.quantidade),
        nivel_minimo: parseInt(editandoQtd.nivel_minimo),
      });
      setMateriais(prev => prev.map(m =>
        m.id === editandoQtd.id
          ? { ...m, quantidade: parseInt(editandoQtd.quantidade), nivel_minimo: parseInt(editandoQtd.nivel_minimo) }
          : m
      ));
      setEditandoQtd(null);
    } catch (err) {
      alert(err.response?.data?.erro || 'Erro ao salvar.');
    } finally { setSalvando(false); }
  }

  async function salvarProduto(e) {
    e.preventDefault();
    setErroProd('');
    setSalvandoProd(true);
    try {
      await api.patch(`/materiais/${editandoProd.id}`, {
        descricao:    editandoProd.descricao,
        codigo:       editandoProd.codigo,
        categoria_id: parseInt(editandoProd.categoria_id),
        unidade:      editandoProd.unidade,
      });
      setEditandoProd(null);
      carregar();
    } catch (err) {
      setErroProd(err.response?.data?.erro || 'Erro ao salvar produto.');
    } finally { setSalvandoProd(false); }
  }

  async function handleCriarProduto(e) {
    e.preventDefault();
    setErroNovo('');
    setSalvandoNovo(true);
    try {
      const { data } = await api.post('/materiais', {
        codigo:       formNovo.codigo.toUpperCase(),
        descricao:    formNovo.descricao,
        categoria_id: parseInt(formNovo.categoria_id),
        unidade:      formNovo.unidade,
      });
      if (parseInt(formNovo.quantidade) > 0) {
        await api.patch(`/materiais/${data.material.id}/estoque`, { quantidade: parseInt(formNovo.quantidade) });
      }
      setCriando(false);
      setFormNovo({ codigo: '', descricao: '', categoria_id: '', unidade: 'UN', quantidade: 0 });
      carregar();
    } catch (err) {
      setErroNovo(err.response?.data?.erro || 'Erro ao criar produto.');
    } finally { setSalvandoNovo(false); }
  }

  function baixarModelo() {
    const modelo = materiais.slice(0, 5).map(m => ({ 'Codigo': m.codigo, 'Descricao': m.descricao, 'Quantidade': m.quantidade ?? 0 }));
    const ws = XLSX.utils.json_to_sheet(modelo);
    ws['!cols'] = [{ wch: 15 }, { wch: 45 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque');
    XLSX.writeFile(wb, 'modelo-estoque.xlsx');
  }

  async function handleImportar(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImportando(true);
    setResultado(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json(ws);
      let atualizados = 0;
      const erros = [];
      for (const linha of linhas) {
        const codigo = String(linha['Codigo'] || linha['codigo'] || linha['CODIGO'] || '').trim();
        const qtd    = parseInt(linha['Quantidade'] || linha['quantidade'] || linha['QUANTIDADE'] || 0);
        if (!codigo) continue;
        const material = materiais.find(m => m.codigo === codigo);
        if (!material) { erros.push(`Código não encontrado: ${codigo}`); continue; }
        try {
          await api.patch(`/materiais/${material.id}/estoque`, { quantidade: qtd });
          atualizados++;
        } catch { erros.push(`Erro ao atualizar: ${codigo}`); }
      }
      await carregar();
      setResultado({ atualizados, erros });
    } catch {
      alert('Erro ao ler a planilha.');
    } finally {
      setImportando(false);
      e.target.value = '';
    }
  }

  const inputClass = `w-full bg-[#2e3347] border border-[#2e3347] text-[#e8eaf0] rounded-xl px-3 py-2 text-sm placeholder:text-[#8b91a8] focus:outline-none focus:border-[#4f6ef7] focus:ring-1 focus:ring-[#4f6ef7]/30`;
  const statusColor = {
    disponivel:    'bg-green-500/15 text-green-400',
    baixo_estoque: 'bg-amber-500/15 text-amber-400',
    sem_estoque:   'bg-red-500/15 text-red-400',
  };

  const materiaisFiltrados = materiais.filter(m =>
    !busca ||
    m.codigo.toLowerCase().includes(busca.toLowerCase()) ||
    m.descricao.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-[#8b91a8]">{materiaisFiltrados.length} de {materiais.length} produto(s)</p>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={baixarModelo} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[#2e3347] text-[#8b91a8] hover:text-[#e8eaf0] transition-colors">
            <FileDown size={13} /> Baixar modelo
          </button>
          <button onClick={() => inputFileRef.current?.click()} disabled={importando}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#4f6ef7]/15 text-[#4f6ef7] hover:bg-[#4f6ef7]/25 transition-colors disabled:opacity-40">
            {importando ? <><RefreshCw size={13} className="animate-spin" /> Importando...</> : <><Upload size={13} /> Importar planilha</>}
          </button>
          <input ref={inputFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImportar} className="hidden" />
          <button onClick={() => setCriando(!criando)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors">
            <Plus size={13} /> {criando ? 'Cancelar' : 'Novo produto'}
          </button>
        </div>
      </div>

      {/* Campo de busca */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b91a8]" />
        <input type="search" placeholder="Buscar por código ou descrição..." value={busca} onChange={e => setBusca(e.target.value)}
          className="w-full bg-[#1a1d27] border border-[#2e3347] text-[#e8eaf0] rounded-xl pl-9 pr-4 py-2.5 text-sm placeholder:text-[#8b91a8] focus:outline-none focus:border-[#4f6ef7] transition-colors" />
        {busca && <button onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b91a8]"><X size={14} /></button>}
      </div>

      {criando && (
        <div className="bg-[#21253a] border border-[#2e3347] rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-[#e8eaf0]">Novo produto</h3>
          <form onSubmit={handleCriarProduto} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={formNovo.codigo} onChange={e => setFormNovo(f => ({...f, codigo: e.target.value}))} placeholder="Código" className={inputClass} required />
            <input value={formNovo.descricao} onChange={e => setFormNovo(f => ({...f, descricao: e.target.value}))} placeholder="Descrição" className={inputClass} required />
            <select value={formNovo.categoria_id} onChange={e => setFormNovo(f => ({...f, categoria_id: e.target.value}))} className={inputClass} required>
              <option value="">— Categoria —</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <select value={formNovo.unidade} onChange={e => setFormNovo(f => ({...f, unidade: e.target.value}))} className={inputClass}>
              <option value="UN">UN — Unidade</option>
              <option value="CX">CX — Caixa</option>
              <option value="PCT">PCT — Pacote</option>
              <option value="RL">RL — Rolo</option>
              <option value="KG">KG — Quilograma</option>
              <option value="L">L — Litro</option>
              <option value="PR">PR — Par</option>
              <option value="KT">KT — Kit</option>
              <option value="RS">RS — Resma</option>
            </select>
            <input type="number" min="0" value={formNovo.quantidade} onChange={e => setFormNovo(f => ({...f, quantidade: e.target.value}))} placeholder="Quantidade inicial" className={inputClass} />
            <div className="flex gap-2 items-end">
              {erroNovo && <p className="text-xs text-red-400 flex-1">{erroNovo}</p>}
              <button type="submit" disabled={salvandoNovo} className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-[#4f6ef7] text-white hover:bg-[#3d5ce5] disabled:opacity-40">
                {salvandoNovo ? 'Salvando...' : 'Criar produto'}
              </button>
            </div>
          </form>
        </div>
      )}

      {editandoProd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-5 space-y-4">
            <h3 className="font-semibold text-[#e8eaf0]">Editar produto</h3>
            <form onSubmit={salvarProduto} className="space-y-3">
              <div><label className="text-xs text-[#8b91a8] mb-1 block">Código</label>
                <input value={editandoProd.codigo} onChange={e => setEditandoProd(p => ({...p, codigo: e.target.value}))} className={inputClass} required /></div>
              <div><label className="text-xs text-[#8b91a8] mb-1 block">Descrição</label>
                <input value={editandoProd.descricao} onChange={e => setEditandoProd(p => ({...p, descricao: e.target.value}))} className={inputClass} required /></div>
              <div><label className="text-xs text-[#8b91a8] mb-1 block">Categoria</label>
                <select value={editandoProd.categoria_id} onChange={e => setEditandoProd(p => ({...p, categoria_id: e.target.value}))} className={inputClass} required>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select></div>
              <div><label className="text-xs text-[#8b91a8] mb-1 block">Unidade</label>
                <select value={editandoProd.unidade} onChange={e => setEditandoProd(p => ({...p, unidade: e.target.value}))} className={inputClass}>
                  <option value="UN">UN</option><option value="CX">CX</option><option value="PCT">PCT</option>
                  <option value="RL">RL</option><option value="KG">KG</option><option value="L">L</option>
                  <option value="PR">PR</option><option value="KT">KT</option><option value="RS">RS</option>
                </select></div>
              {erroProd && <p className="text-xs text-red-400">{erroProd}</p>}
              <div className="border-t border-[#2e3347] pt-3 mt-1">
                <p className="text-xs font-semibold text-[#8b91a8] mb-2">Fornecedores</p>
                <div className="space-y-1.5 mb-2">
                  {fornsProd.map(f => (
                    <div key={f.id} className="flex items-center justify-between bg-[#12141d] rounded-lg px-3 py-2">
                      <div>
                        <span className="text-xs text-[#e8eaf0]">{f.empresa}</span>
                        {f.preco_unitario && <span className="text-xs text-[#4f6ef7] ml-2">R$ {f.preco_unitario}</span>}
                      </div>
                      <button type="button" onClick={() => handleDesvincularForn(f.id)} className="text-red-400 hover:text-red-300 text-xs">Remover</button>
                    </div>
                  ))}
                  {fornsProd.length === 0 && <p className="text-xs text-[#8b91a8]">Nenhum fornecedor vinculado</p>}
                </div>
                <div className="flex gap-2">
                  <select value={fornSelecionado} onChange={e => setFornSelecionado(e.target.value)} className="flex-1 bg-[#12141d] border border-[#2e3347] text-[#e8eaf0] rounded-xl px-3 py-2 text-xs">
                    <option value="">Selecionar fornecedor...</option>
                    {todosForns.filter(f => !fornsProd.find(fp => fp.id === f.id)).map(f => <option key={f.id} value={f.id}>{f.empresa}</option>)}
                  </select>
                  <input type="number" placeholder="Preco" value={precoForn} onChange={e => setPrecoForn(e.target.value)} className="w-24 bg-[#12141d] border border-[#2e3347] text-[#e8eaf0] rounded-xl px-3 py-2 text-xs" />
                  <button type="button" onClick={handleVincularForn} disabled={!fornSelecionado} className="px-3 py-2 rounded-xl text-xs font-medium bg-[#4f6ef7]/15 text-[#4f6ef7] disabled:opacity-40">+ Add</button>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setEditandoProd(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[#2e3347] text-[#8b91a8]">Cancelar</button>
                <button type="submit" disabled={salvandoProd} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[#4f6ef7] text-white disabled:opacity-40">
                  {salvandoProd ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resultado && (
        <div className={`rounded-xl px-4 py-3 text-sm border ${resultado.erros.length > 0 ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-green-500/10 border-green-500/20 text-green-400'}`}>
          <p className="font-medium">✓ {resultado.atualizados} produto(s) atualizado(s)!</p>
          {resultado.erros.length > 0 && <div className="mt-1">{resultado.erros.map((e, i) => <p key={i} className="text-xs text-red-400">{e}</p>)}</div>}
          <button onClick={() => setResultado(null)} className="mt-1 text-xs underline opacity-60">Fechar</button>
        </div>
      )}

      {loading ? <div className="flex justify-center py-8"><Spinner className="text-[#4f6ef7]" /></div> : (
        <div className="space-y-1.5">
          {materiaisFiltrados.map(m => (
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
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => { setEditandoProd({ id: m.id, codigo: m.codigo, descricao: m.descricao, categoria_id: m.categoria_id, unidade: m.unidade }); carregarFornsProd(m.id); }}
                  className="p-1.5 rounded-lg bg-[#4f6ef7]/10 text-[#4f6ef7] hover:bg-[#4f6ef7]/20 transition-colors" title="Editar produto">
                  <Pencil size={13} />
                </button>
                {editandoQtd?.id === m.id ? (
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-1">
                      <input type="number" min="0" value={editandoQtd.quantidade} onChange={e => setEditandoQtd(v => ({...v, quantidade: e.target.value}))} className="w-20 bg-[#2e3347] border border-[#4f6ef7] text-[#e8eaf0] rounded-lg px-2 py-1 text-xs text-center" />
                      <input type="number" min="0" value={editandoQtd.nivel_minimo} onChange={e => setEditandoQtd(v => ({...v, nivel_minimo: e.target.value}))} className="w-20 bg-[#2e3347] border border-[#2e3347] text-[#8b91a8] rounded-lg px-2 py-1 text-xs text-center" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <button onClick={salvarEstoque} disabled={salvando} className="p-1.5 rounded-lg bg-green-500/15 text-green-400"><Check size={13} /></button>
                      <button onClick={() => setEditandoQtd(null)} className="p-1.5 rounded-lg bg-red-500/10 text-red-400"><X size={13} /></button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setEditandoQtd({ id: m.id, quantidade: m.quantidade ?? 0, nivel_minimo: m.nivel_minimo ?? 5 })} className="text-right hover:opacity-70">
                    <p className="text-sm font-bold text-[#e8eaf0]">{m.quantidade ?? '—'}</p>
                    <p className="text-[10px] text-[#8b91a8]">{m.unidade}</p>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function AbaFornecedores() {
  const [fornecedores, setFornecedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ empresa: '', representante: '', telefone: '', email: '', observacoes: '' });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const inputClass = "w-full bg-[#12141d] border border-[#2e3347] text-[#e8eaf0] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#4f6ef7]";

  async function carregar() {
    setLoading(true);
    try {
      const { data } = await fornecedoresService.listar();
      setFornecedores(data.fornecedores);
    } finally { setLoading(false); }
  }
  useEffect(() => { carregar(); }, []);

  async function handleCriar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      await fornecedoresService.criar(form);
      setCriando(false);
      setForm({ empresa: '', representante: '', telefone: '', email: '', observacoes: '' });
      carregar();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao criar fornecedor.');
    } finally { setSalvando(false); }
  }

  async function handleEditar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      await fornecedoresService.editar(editando.id, editando);
      setEditando(null);
      carregar();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao editar fornecedor.');
    } finally { setSalvando(false); }
  }

  async function handleExcluir(id) {
    if (!confirm('Excluir este fornecedor?')) return;
    await fornecedoresService.excluir(id);
    carregar();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#e8eaf0]">Fornecedores ({fornecedores.length})</h2>
        <button onClick={() => { setCriando(true); setEditando(null); }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[#4f6ef7]/15 text-[#4f6ef7] hover:bg-[#4f6ef7]/25">
          <Plus size={13} /> Novo Fornecedor
        </button>
      </div>

      {(criando || editando) && (
        <div className="bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-4 space-y-3">
          <h3 className="font-semibold text-[#e8eaf0] text-sm">{criando ? 'Novo Fornecedor' : 'Editar Fornecedor'}</h3>
          <form onSubmit={criando ? handleCriar : handleEditar} className="space-y-3">
            <div><label className="text-xs text-[#8b91a8] mb-1 block">Empresa *</label>
              <input value={criando ? form.empresa : editando.empresa} onChange={e => criando ? setForm(f => ({...f, empresa: e.target.value})) : setEditando(f => ({...f, empresa: e.target.value}))} className={inputClass} required /></div>
            <div><label className="text-xs text-[#8b91a8] mb-1 block">Representante</label>
              <input value={criando ? form.representante : editando.representante || ''} onChange={e => criando ? setForm(f => ({...f, representante: e.target.value})) : setEditando(f => ({...f, representante: e.target.value}))} className={inputClass} /></div>
            <div><label className="text-xs text-[#8b91a8] mb-1 block">Telefone</label>
              <input value={criando ? form.telefone : editando.telefone || ''} onChange={e => criando ? setForm(f => ({...f, telefone: e.target.value})) : setEditando(f => ({...f, telefone: e.target.value}))} className={inputClass} /></div>
            <div><label className="text-xs text-[#8b91a8] mb-1 block">Email</label>
              <input type="email" value={criando ? form.email : editando.email || ''} onChange={e => criando ? setForm(f => ({...f, email: e.target.value})) : setEditando(f => ({...f, email: e.target.value}))} className={inputClass} /></div>
            <div><label className="text-xs text-[#8b91a8] mb-1 block">Observacoes</label>
              <textarea value={criando ? form.observacoes : editando.observacoes || ''} onChange={e => criando ? setForm(f => ({...f, observacoes: e.target.value})) : setEditando(f => ({...f, observacoes: e.target.value}))} className={inputClass} rows={2} /></div>
            {erro && <p className="text-xs text-red-400">{erro}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => { setCriando(false); setEditando(null); }} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[#2e3347] text-[#8b91a8]">Cancelar</button>
              <button type="submit" disabled={salvando} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[#4f6ef7] text-white disabled:opacity-40">{salvando ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </form>
        </div>
      )}

      {loading ? <div className="flex justify-center py-8"><Spinner className="text-[#4f6ef7]" /></div> : (
        <div className="space-y-2">
          {fornecedores.length === 0 ? <p className="text-sm text-[#8b91a8] text-center py-8">Nenhum fornecedor cadastrado</p> : (
            fornecedores.map(f => (
              <div key={f.id} className="bg-[#1a1d27] border border-[#2e3347] rounded-xl px-4 py-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#e8eaf0]">{f.empresa}</p>
                  {f.representante && <p className="text-xs text-[#8b91a8] mt-0.5">Rep: {f.representante}</p>}
                  <div className="flex gap-3 mt-1">
                    {f.telefone && <span className="text-xs text-[#8b91a8]">{f.telefone}</span>}
                    {f.email && <span className="text-xs text-[#4f6ef7]">{f.email}</span>}
                  </div>
                  {f.observacoes && <p className="text-xs text-[#8b91a8] mt-1 italic">{f.observacoes}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => { setEditando({...f}); setCriando(false); }} className="p-1.5 rounded-lg text-[#8b91a8] hover:text-[#4f6ef7] hover:bg-[#4f6ef7]/10"><Pencil size={13} /></button>
                  <button onClick={() => handleExcluir(f.id)} className="p-1.5 rounded-lg text-[#8b91a8] hover:text-red-400 hover:bg-red-400/10"><Trash2 size={13} /></button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function PainelAdmin() {
  const [aba, setAba] = useState('usuarios');
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-[#e8eaf0]">Painel Administrativo</h1>
        <p className="text-sm text-[#8b91a8] mt-0.5">Gestão de usuários, departamentos e estoque</p>
      </div>
      <div className="flex bg-[#1a1d27] border border-[#2e3347] rounded-xl p-1 w-fit gap-1 flex-wrap">
        <button onClick={() => setAba('usuarios')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${aba === 'usuarios' ? 'bg-[#4f6ef7] text-white' : 'text-[#8b91a8] hover:text-[#e8eaf0]'}`}>
          <Users size={15} /> Usuários
        </button>
        <button onClick={() => setAba('departamentos')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${aba === 'departamentos' ? 'bg-[#4f6ef7] text-white' : 'text-[#8b91a8] hover:text-[#e8eaf0]'}`}>
          <Building2 size={15} /> Departamentos
        </button>
        <button onClick={() => setAba('estoque')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${aba === 'estoque' ? 'bg-[#4f6ef7] text-white' : 'text-[#8b91a8] hover:text-[#e8eaf0]'}`}>
          <Package size={15} /> Estoque
        </button>
        <button onClick={() => setAba('fornecedores')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${aba === 'fornecedores' ? 'bg-[#4f6ef7] text-white' : 'text-[#8b91a8] hover:text-[#e8eaf0]'}`}>
          <Users size={15} /> Fornecedores
        </button>
      </div>
      {aba === 'usuarios'      && <AbaUsuarios />}
      {aba === 'departamentos' && <AbaDepartamentos />}
      {aba === 'estoque' && <AbaEstoque />}
      {aba === 'fornecedores' && <AbaFornecedores />}
    </div>
  );
}


