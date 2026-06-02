// ============================================================
// pages/operador/PainelAdmin.jsx
// ============================================================
import { useState, useEffect, useRef } from 'react';
import { UserPlus, RefreshCw, Check, X, Users, Package, Upload, FileDown, Plus, Pencil } from 'lucide-react';
import * as XLSX from 'xlsx';
import api, { adminService, materiaisService } from '../../services/api';
import { Button, Spinner } from '../../components/ui';

// ── Aba Usuários ─────────────────────────────────────────────
function AbaUsuarios() {
  const [usuarios,      setUsuarios]      = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [criando,       setCriando]       = useState(false);
  const [editando,      setEditando]      = useState(null);
  const [form,          setForm]          = useState({ nome: '', email: '', senha: '', perfil: 'colaborador', departamento_id: '' });
  const [formEdit,      setFormEdit]      = useState({ email: '', senha: '', perfil: 'colaborador' });
  const [erro,          setErro]          = useState('');
  const [erroEdit,      setErroEdit]      = useState('');
  const [salvando,      setSalvando]      = useState(false);
  const [salvandoEdit,  setSalvandoEdit]  = useState(false);

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
      await adminService.atualizarUsuario(editando.id, payload);
      setEditando(null);
      carregar();
    } catch (err) {
      setErroEdit(err.response?.data?.erro || 'Erro ao atualizar usuário.');
    } finally { setSalvandoEdit(false); }
  }

  function abrirEdicao(u) {
    setEditando(u);
    setFormEdit({ email: u.email, senha: '', perfil: u.perfil });
    setErroEdit('');
  }

  async function toggleAtivo(usuario) {
    await adminService.atualizarUsuario(usuario.id, { ativo: !usuario.ativo });
    setUsuarios(prev => prev.map(u => u.id === usuario.id ? { ...u, ativo: !u.ativo } : u));
  }

  const inputClass = `w-full bg-[#2e3347] border border-[#2e3347] text-[#e8eaf0] rounded-xl px-3 py-2 text-sm placeholder:text-[#8b91a8] focus:outline-none focus:border-[#4f6ef7] focus:ring-1 focus:ring-[#4f6ef7]/30`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#8b91a8]">{usuarios.length} usuário(s) cadastrado(s)</p>
        <div className="flex gap-2">
          <button onClick={carregar} className="p-2 rounded-xl text-[#8b91a8] hover:bg-[#2e3347] transition-colors"><RefreshCw size={15} /></button>
          <Button size="sm" onClick={() => setCriando(!criando)}>
            <UserPlus size={14} />{criando ? 'Cancelar' : 'Novo usuário'}
          </Button>
        </div>
      </div>

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
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => abrirEdicao(u)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#4f6ef7]/10 text-[#4f6ef7] hover:bg-[#4f6ef7]/20 transition-colors">
                  <Pencil size={12} /> Editar
                </button>
                <button onClick={() => toggleAtivo(u)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${u.ativo ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'}`}>
                  {u.ativo ? <><X size={12} /> Desativar</> : <><Check size={12} /> Ativar</>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Aba Estoque ──────────────────────────────────────────────
function AbaEstoque() {
  const [materiais,    setMateriais]    = useState([]);
  const [categorias,   setCategorias]   = useState([]);
  const [loading,      setLoading]      = useState(true);
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

  return (
    <div className="space-y-4">
      {/* Barra de ações */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-[#8b91a8]">{materiais.length} produto(s) cadastrado(s)</p>
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

      {/* Formulário novo produto */}
      {criando && (
        <div className="bg-[#21253a] border border-[#2e3347] rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-[#e8eaf0]">Novo produto</h3>
          <form onSubmit={handleCriarProduto} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={formNovo.codigo} onChange={e => setFormNovo(f => ({...f, codigo: e.target.value}))} placeholder="Código" className={inputClass} required />
            <input value={formNovo.descricao} onChange={e => setFormNovo(f => ({...f, descricao: e.target.value}))} placeholder="Descrição do produto" className={inputClass} required />
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

      {/* Modal edição completa do produto */}
      {editandoProd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-[#e8eaf0]">Editar produto</h3>
              <p className="text-xs text-[#8b91a8] mt-0.5">Código: {editandoProd.codigo}</p>
            </div>
            <form onSubmit={salvarProduto} className="space-y-3">
              <div>
                <label className="text-xs text-[#8b91a8] mb-1 block">Código</label>
                <input value={editandoProd.codigo} onChange={e => setEditandoProd(p => ({...p, codigo: e.target.value}))} className={inputClass} required />
              </div>
              <div>
                <label className="text-xs text-[#8b91a8] mb-1 block">Descrição</label>
                <input value={editandoProd.descricao} onChange={e => setEditandoProd(p => ({...p, descricao: e.target.value}))} className={inputClass} required />
              </div>
              <div>
                <label className="text-xs text-[#8b91a8] mb-1 block">Categoria</label>
                <select value={editandoProd.categoria_id} onChange={e => setEditandoProd(p => ({...p, categoria_id: e.target.value}))} className={inputClass} required>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-[#8b91a8] mb-1 block">Unidade</label>
                <select value={editandoProd.unidade} onChange={e => setEditandoProd(p => ({...p, unidade: e.target.value}))} className={inputClass}>
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
              </div>
              {erroProd && <p className="text-xs text-red-400">{erroProd}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setEditandoProd(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[#2e3347] text-[#8b91a8] hover:text-[#e8eaf0]">Cancelar</button>
                <button type="submit" disabled={salvandoProd} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[#4f6ef7] text-white hover:bg-[#3d5ce5] disabled:opacity-40">
                  {salvandoProd ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resultado importação */}
      {resultado && (
        <div className={`rounded-xl px-4 py-3 text-sm border ${resultado.erros.length > 0 ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-green-500/10 border-green-500/20 text-green-400'}`}>
          <p className="font-medium">✓ {resultado.atualizados} produto(s) atualizado(s) com sucesso!</p>
          {resultado.erros.length > 0 && <div className="mt-1 space-y-0.5">{resultado.erros.map((e, i) => <p key={i} className="text-xs text-red-400">{e}</p>)}</div>}
          <button onClick={() => setResultado(null)} className="mt-1 text-xs underline opacity-60">Fechar</button>
        </div>
      )}

      {/* Lista de materiais */}
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

              <div className="flex items-center gap-2 shrink-0">
                {/* Botão editar produto */}
                <button
                  onClick={() => setEditandoProd({ id: m.id, codigo: m.codigo, descricao: m.descricao, categoria_id: m.categoria_id, unidade: m.unidade })}
                  className="p-1.5 rounded-lg bg-[#4f6ef7]/10 text-[#4f6ef7] hover:bg-[#4f6ef7]/20 transition-colors"
                  title="Editar produto"
                >
                  <Pencil size={13} />
                </button>

                {/* Editar quantidade */}
                {editandoQtd?.id === m.id ? (
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-1">
                      <input type="number" min="0" value={editandoQtd.quantidade} onChange={e => setEditandoQtd(v => ({...v, quantidade: e.target.value}))} className="w-20 bg-[#2e3347] border border-[#4f6ef7] text-[#e8eaf0] rounded-lg px-2 py-1 text-xs text-center" placeholder="Qtd" />
                      <input type="number" min="0" value={editandoQtd.nivel_minimo} onChange={e => setEditandoQtd(v => ({...v, nivel_minimo: e.target.value}))} className="w-20 bg-[#2e3347] border border-[#2e3347] text-[#8b91a8] rounded-lg px-2 py-1 text-xs text-center" placeholder="Mínimo" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <button onClick={salvarEstoque} disabled={salvando} className="p-1.5 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25"><Check size={13} /></button>
                      <button onClick={() => setEditandoQtd(null)} className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"><X size={13} /></button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setEditandoQtd({ id: m.id, quantidade: m.quantidade ?? 0, nivel_minimo: m.nivel_minimo ?? 5 })} className="text-right hover:opacity-70 transition-opacity">
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

// ── Painel Admin principal ────────────────────────────────────
export default function PainelAdmin() {
  const [aba, setAba] = useState('usuarios');
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-[#e8eaf0]">Painel Administrativo</h1>
        <p className="text-sm text-[#8b91a8] mt-0.5">Gestão de usuários e estoque</p>
      </div>
      <div className="flex bg-[#1a1d27] border border-[#2e3347] rounded-xl p-1 w-fit gap-1">
        <button onClick={() => setAba('usuarios')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${aba === 'usuarios' ? 'bg-[#4f6ef7] text-white' : 'text-[#8b91a8] hover:text-[#e8eaf0]'}`}>
          <Users size={15} /> Usuários
        </button>
        <button onClick={() => setAba('estoque')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${aba === 'estoque' ? 'bg-[#4f6ef7] text-white' : 'text-[#8b91a8] hover:text-[#e8eaf0]'}`}>
          <Package size={15} /> Estoque
        </button>
      </div>
      {aba === 'usuarios' && <AbaUsuarios />}
      {aba === 'estoque'  && <AbaEstoque />}
    </div>
  );
}
