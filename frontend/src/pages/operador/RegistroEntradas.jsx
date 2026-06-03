// ============================================================
// pages/operador/RegistroEntradas.jsx
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, X, RefreshCw, PackagePlus, Calendar, User } from 'lucide-react';
import api, { materiaisService } from '../../services/api';
import { Spinner } from '../../components/ui';

export default function RegistroEntradas() {
  const [entradas,   setEntradas]   = useState([]);
  const [materiais,  setMateriais]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [salvando,   setSalvando]   = useState(false);
  const [busca,      setBusca]      = useState('');
  const [buscaProd,  setBuscaProd]  = useState('');
  const [sugestoes,  setSugestoes]  = useState([]);
  const [erro,       setErro]       = useState('');
  const [sucesso,    setSucesso]    = useState('');

  const [form, setForm] = useState({
    material_id:  '',
    material_nome: '',
    quantidade:   '',
    observacao:   '',
  });

  async function carregarEntradas() {
    setLoading(true);
    try {
      const params = { limite: 100 };
      if (busca) params.busca = busca;
      const { data } = await api.get('/entradas', { params });
      setEntradas(data.entradas);
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    materiaisService.listar({ limite: 5000 })
      .then(r => setMateriais(r.data.materiais))
      .catch(console.error);
  }, []);

  useEffect(() => {
    const t = setTimeout(carregarEntradas, busca ? 300 : 0);
    return () => clearTimeout(t);
  }, [busca]);

  // Busca de produto com sugestões
  function handleBuscaProd(valor) {
    setBuscaProd(valor);
    setForm(f => ({ ...f, material_id: '', material_nome: '' }));
    if (valor.length < 2) { setSugestoes([]); return; }
    const filtrados = materiais.filter(m =>
      m.codigo.toLowerCase().includes(valor.toLowerCase()) ||
      m.descricao.toLowerCase().includes(valor.toLowerCase())
    ).slice(0, 8);
    setSugestoes(filtrados);
  }

  function selecionarMaterial(m) {
    setForm(f => ({ ...f, material_id: m.id, material_nome: `${m.codigo} — ${m.descricao}` }));
    setBuscaProd(`${m.codigo} — ${m.descricao}`);
    setSugestoes([]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');
    setSucesso('');

    if (!form.material_id) { setErro('Selecione um produto da lista.'); return; }
    if (!form.quantidade || parseInt(form.quantidade) <= 0) { setErro('Informe uma quantidade válida.'); return; }

    setSalvando(true);
    try {
      const { data } = await api.post('/entradas', {
        material_id: parseInt(form.material_id),
        quantidade:  parseInt(form.quantidade),
        observacao:  form.observacao || null,
      });

      setSucesso(`✓ Entrada registrada! ${data.material.descricao} — Novo saldo: ${data.novo_saldo}`);
      setForm({ material_id: '', material_nome: '', quantidade: '', observacao: '' });
      setBuscaProd('');
      carregarEntradas();
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao registrar entrada.');
    } finally { setSalvando(false); }
  }

  function formatarData(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  const inputClass = `w-full bg-[#1a1d27] border border-[#2e3347] text-[#e8eaf0] rounded-xl px-3 py-2.5 text-sm placeholder:text-[#8b91a8] focus:outline-none focus:border-[#4f6ef7] focus:ring-1 focus:ring-[#4f6ef7]/30 transition-colors`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-[#e8eaf0]">Registro de Entradas</h1>
        <p className="text-sm text-[#8b91a8] mt-0.5">Registre entradas de produtos e atualize o estoque</p>
      </div>

      {/* Formulário de entrada */}
      <div className="bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[#e8eaf0] flex items-center gap-2">
          <PackagePlus size={16} className="text-[#4f6ef7]" />
          Nova Entrada
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Busca de produto */}
          <div className="relative">
            <label className="text-xs text-[#8b91a8] mb-1 block">Produto (código ou descrição)</label>
            <input
              value={buscaProd}
              onChange={e => handleBuscaProd(e.target.value)}
              placeholder="Digite o código ou nome do produto..."
              className={inputClass}
              autoComplete="off"
            />
            {sugestoes.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-[#21253a] border border-[#2e3347] rounded-xl overflow-hidden shadow-xl">
                {sugestoes.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => selecionarMaterial(m)}
                    className="w-full text-left px-4 py-2.5 hover:bg-[#2e3347] transition-colors"
                  >
                    <span className="text-xs font-mono text-[#4f6ef7]">{m.codigo}</span>
                    <p className="text-sm text-[#e8eaf0] truncate">{m.descricao}</p>
                    <p className="text-xs text-[#8b91a8]">Estoque atual: {m.quantidade ?? 0}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#8b91a8] mb-1 block">Quantidade</label>
              <input
                type="number"
                min="1"
                value={form.quantidade}
                onChange={e => setForm(f => ({...f, quantidade: e.target.value}))}
                placeholder="0"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="text-xs text-[#8b91a8] mb-1 block">Observação (opcional)</label>
              <input
                value={form.observacao}
                onChange={e => setForm(f => ({...f, observacao: e.target.value}))}
                placeholder="Ex: NF 12345, fornecedor..."
                className={inputClass}
              />
            </div>
          </div>

          {erro && <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-xl">{erro}</p>}
          {sucesso && <p className="text-xs text-green-400 bg-green-500/10 px-3 py-2 rounded-xl">{sucesso}</p>}

          <button
            type="submit"
            disabled={salvando}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
              bg-[#4f6ef7] text-white hover:bg-[#3d5ce5] transition-colors disabled:opacity-40"
          >
            {salvando
              ? <><RefreshCw size={15} className="animate-spin" /> Registrando...</>
              : <><Plus size={15} /> Registrar Entrada</>
            }
          </button>
        </form>
      </div>

      {/* Histórico de entradas */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[#e8eaf0]">Histórico de Entradas</h2>
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b91a8]" />
            <input
              type="search"
              placeholder="Buscar no histórico..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="w-full bg-[#1a1d27] border border-[#2e3347] text-[#e8eaf0] rounded-xl pl-8 pr-4 py-2 text-xs placeholder:text-[#8b91a8] focus:outline-none focus:border-[#4f6ef7] transition-colors"
            />
            {busca && <button onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b91a8]"><X size={13} /></button>}
          </div>
          <button onClick={carregarEntradas} className="p-2 rounded-xl text-[#8b91a8] hover:bg-[#2e3347] transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Spinner className="text-[#4f6ef7]" /></div>
        ) : entradas.length === 0 ? (
          <div className="text-center py-12 text-[#8b91a8] text-sm">Nenhuma entrada registrada ainda.</div>
        ) : (
          <div className="space-y-2">
            {entradas.map(e => (
              <div key={e.id} className="bg-[#1a1d27] border border-[#2e3347] rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0">
                  <PackagePlus size={16} className="text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-[#4f6ef7]">{e.codigo}</span>
                    <span className="text-xs font-bold text-green-400">+{e.quantidade} {e.unidade}</span>
                  </div>
                  <p className="text-sm text-[#e8eaf0] truncate">{e.descricao}</p>
                  {e.observacao && <p className="text-xs text-[#8b91a8] mt-0.5">{e.observacao}</p>}
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1 text-xs text-[#8b91a8] justify-end">
                    <Calendar size={11} />
                    {formatarData(e.created_at)}
                  </div>
                  {e.usuario_nome && (
                    <div className="flex items-center gap-1 text-xs text-[#8b91a8] justify-end mt-0.5">
                      <User size={11} />
                      {e.usuario_nome}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
