// ============================================================
// pages/Catalogo.jsx — Catálogo de Materiais
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { Search, SlidersHorizontal, X, ShoppingCart } from 'lucide-react';
import { materiaisService } from '../services/api';
import MaterialCard from '../components/catalog/MaterialCard';
import { Spinner, Empty } from '../components/ui';
import { Package } from 'lucide-react';
import { useCart } from '../context/CartContext';
import CartDrawer from '../components/cart/CartDrawer';

export default function Catalogo() {
  const [materiais,   setMateriais]   = useState([]);
  const [categorias,  setCategorias]  = useState([]);
  const [busca,       setBusca]       = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [loading,     setLoading]     = useState(true);
  const [total,       setTotal]       = useState(0);
  const [cartOpen,    setCartOpen]    = useState(false);

  const { totalItens } = useCart();

  // Carrega todas as categorias
  useEffect(() => {
    materiaisService.categorias()
      .then(r => setCategorias(r.data.categorias))
      .catch(console.error);
  }, []);

  const carregarMateriais = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limite: 5000 };
      if (busca)       params.busca     = busca;
      if (categoriaId) params.categoria = categoriaId;
      const { data } = await materiaisService.listar(params);
      setMateriais(data.materiais);
      setTotal(data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [busca, categoriaId]);

  useEffect(() => {
    const t = setTimeout(carregarMateriais, busca ? 300 : 0);
    return () => clearTimeout(t);
  }, [carregarMateriais, busca]);

  function limparFiltros() {
    setBusca('');
    setCategoriaId('');
  }

  const temFiltro = busca || categoriaId;

  return (
    <div className="space-y-5">

      {/* ── Título + botão carrinho ─────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[#e8eaf0]">Catálogo de Materiais</h1>
          <p className="text-sm text-[#8b91a8] mt-0.5">
            {loading ? 'Carregando…' : `${total} ${total === 1 ? 'item disponível' : 'itens disponíveis'}`}
          </p>
        </div>

        <button
          onClick={() => setCartOpen(true)}
          className="relative flex items-center gap-2 bg-[#4f6ef7]/15 hover:bg-[#4f6ef7]/25
            text-[#4f6ef7] px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
        >
          <ShoppingCart size={18} />
          <span className="hidden sm:block">Carrinho</span>
          {totalItens > 0 && (
            <span className="bg-[#4f6ef7] text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
              {totalItens}
            </span>
          )}
        </button>
      </div>

      {/* ── Busca ───────────────────────────────────────── */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8b91a8]" />
        <input
          type="search"
          placeholder="Buscar por nome ou código…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="
            w-full bg-[#1a1d27] border border-[#2e3347] text-[#e8eaf0] rounded-xl
            pl-10 pr-4 py-3 placeholder:text-[#8b91a8] text-sm
            focus:outline-none focus:border-[#4f6ef7] focus:ring-1 focus:ring-[#4f6ef7]/30
            transition-colors
          "
        />
        {busca && (
          <button
            onClick={() => setBusca('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#8b91a8] hover:text-[#e8eaf0]"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* ── Filtro por categorias ────────────────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <div className="shrink-0 flex items-center gap-1.5 text-xs text-[#8b91a8]">
          <SlidersHorizontal size={13} />
          Categoria:
        </div>
        <button
          onClick={() => setCategoriaId('')}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
            ${!categoriaId
              ? 'bg-[#4f6ef7] text-white'
              : 'bg-[#1a1d27] border border-[#2e3347] text-[#8b91a8] hover:text-[#e8eaf0]'
            }`}
        >
          Todos
        </button>
        {categorias.map(cat => (
          <button
            key={cat.id}
            onClick={() => setCategoriaId(cat.id === categoriaId ? '' : cat.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
              ${categoriaId === cat.id
                ? 'bg-[#4f6ef7] text-white'
                : 'bg-[#1a1d27] border border-[#2e3347] text-[#8b91a8] hover:text-[#e8eaf0]'
              }`}
          >
            {cat.nome}
          </button>
        ))}
      </div>

      {/* ── Resultado ───────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} className="text-[#4f6ef7]" />
        </div>
      ) : materiais.length === 0 ? (
        <Empty
          icon={Package}
          titulo="Nenhum material encontrado"
          descricao={temFiltro
            ? 'Tente uma busca diferente ou limpe os filtros'
            : 'O catálogo ainda não tem materiais cadastrados'
          }
        />
      ) : (
        <>
          {temFiltro && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#8b91a8]">{materiais.length} resultado(s)</span>
              <button
                onClick={limparFiltros}
                className="text-xs text-[#4f6ef7] hover:underline flex items-center gap-1"
              >
                <X size={12} /> Limpar filtros
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {materiais.map(material => (
              <MaterialCard key={material.id} material={material} />
            ))}
          </div>
        </>
      )}

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}
