// ============================================================
// pages/operador/MRP.jsx — Necessidade de Estoque
// ============================================================
import { useState, useEffect, useRef } from 'react';
import { RefreshCw, FileDown, Upload, AlertTriangle, AlertCircle, CheckCircle, XCircle, TrendingDown, Search, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import api, { materiaisService } from '../../services/api';
import { Spinner } from '../../components/ui';

const STATUS_CONFIG = {
  critico: { label: 'Crítico',  cor: 'text-red-400',    bg: 'bg-red-500/15',    icon: XCircle,       borda: 'border-red-500/30' },
  urgente: { label: 'Urgente',  cor: 'text-orange-400', bg: 'bg-orange-500/15', icon: AlertCircle,   borda: 'border-orange-500/30' },
  atencao: { label: 'Atenção',  cor: 'text-amber-400',  bg: 'bg-amber-500/15',  icon: AlertTriangle, borda: 'border-amber-500/30' },
  ok:      { label: 'OK',       cor: 'text-green-400',  bg: 'bg-green-500/15',  icon: CheckCircle,   borda: 'border-green-500/30' },
};

export default function MRP() {
  const [itens,      setItens]      = useState([]);
  const [resumo,     setResumo]     = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [meses,      setMeses]      = useState(3);
  const [categoria,  setCategoria]  = useState('');
  const [busca,      setBusca]      = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [periodo,    setPeriodo]    = useState(null);
  const [importando, setImportando] = useState(false);
  const [resultImport, setResultImport] = useState(null);
  const inputImportRef = useRef(null);

  async function carregar() {
    setLoading(true);
    try {
      const params = { meses };
      if (categoria) params.categoria = categoria;
      const { data } = await api.get('/mrp', { params });
      setItens(data.itens);
      setResumo(data.resumo);
      setCategorias(data.categorias);
      setPeriodo(data.periodo);
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, [meses, categoria]);

  function baixarModelo() {
    const modelo = [
      { 'Codigo': 'EX001', 'Tipo': 'saida',   'Quantidade': 10 },
      { 'Codigo': 'EX002', 'Tipo': 'entrada',  'Quantidade': 5  },
    ];
    const ws = XLSX.utils.json_to_sheet(modelo);
    ws['!cols'] = [{ wch: 15 }, { wch: 10 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimentacoes');
    XLSX.writeFile(wb, 'modelo-mrp.xlsx');
  }

  async function handleImportar(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImportando(true);
    setResultImport(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json(ws);

      const movimentacoes = linhas.map(l => ({
        codigo:     String(l['Codigo'] || l['codigo'] || l['CODIGO'] || '').trim(),
        tipo:       String(l['Tipo'] || l['tipo'] || l['TIPO'] || '').toLowerCase().trim(),
        quantidade: parseInt(l['Quantidade'] || l['quantidade'] || l['QUANTIDADE'] || 0),
      })).filter(l => l.codigo && l.tipo && l.quantidade > 0);

      if (movimentacoes.length === 0) {
        alert('Nenhuma linha válida encontrada na planilha.');
        return;
      }

      const { data } = await api.post('/mrp/importar', { movimentacoes });
      setResultImport(data);
      carregar();
    } catch (err) {
      alert(err.response?.data?.erro || 'Erro ao importar planilha.');
    } finally {
      setImportando(false);
      e.target.value = '';
    }
  }

  function exportarExcel() {
    const itenCompra = itens.filter(i => i.quantidade_comprar > 0);
    if (itenCompra.length === 0) return;

    const wb = XLSX.utils.book_new();
    const colWidths = [
      { wch: 12 }, { wch: 45 }, { wch: 8 },
      { wch: 12 }, { wch: 12 }, { wch: 13 },
      { wch: 14 }, { wch: 14 }, { wch: 10 }
    ];

    const toRow = i => ({
      'Código':            i.codigo,
      'Descrição':         i.descricao,
      'Unidade':           i.unidade,
      'Estoque Atual':     i.estoque_atual,
      'Saída Total':       i.total_saida,
      'Entrada Total':     i.total_entrada,
      'Média Mensal':      parseFloat(i.media_mensal),
      'Qtd a Comprar':     i.quantidade_comprar,
      'Status':            STATUS_CONFIG[i.status_mrp]?.label,
    });

    // Aba geral com todos os itens
    const wsGeral = XLSX.utils.json_to_sheet(itenCompra.map(toRow));
    wsGeral['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, wsGeral, 'Geral');

    // Uma aba por categoria
    const porCategoria = {};
    itenCompra.forEach(i => {
      if (!porCategoria[i.categoria_nome]) porCategoria[i.categoria_nome] = [];
      porCategoria[i.categoria_nome].push(i);
    });

    Object.entries(porCategoria).sort(([a], [b]) => a.localeCompare(b)).forEach(([cat, itenscat]) => {
      // Nome da aba limitado a 31 chars (limite do Excel)
      const nomAba = cat.substring(0, 31);
      const ws = XLSX.utils.json_to_sheet(itenscat.map(toRow));
      ws['!cols'] = colWidths;
      XLSX.utils.book_append_sheet(wb, ws, nomAba);
    });

    const dataHoje = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    XLSX.writeFile(wb, `lista-compras-${dataHoje}.xlsx`);
  }

  const itensFiltrados = itens.filter(i => {
    if (filtroStatus && i.status_mrp !== filtroStatus) return false;
    if (busca) {
      const b = busca.toLowerCase();
      return i.codigo.toLowerCase().includes(b) || i.descricao.toLowerCase().includes(b);
    }
    return true;
  });

  const precisamCompra = itens.filter(i => i.quantidade_comprar > 0).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-[#e8eaf0]">MRP — Necessidade de Estoque</h1>
          <p className="text-sm text-[#8b91a8] mt-0.5">
            Análise de consumo e previsão de compras mensais
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Período */}
          <select value={meses} onChange={e => setMeses(parseInt(e.target.value))}
            className="bg-[#1a1d27] border border-[#2e3347] text-[#e8eaf0] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#4f6ef7]">
            <option value={1}>Último mês</option>
            <option value={2}>Últimos 2 meses</option>
            <option value={3}>Últimos 3 meses</option>
            <option value={6}>Últimos 6 meses</option>
          </select>
          {/* Categoria */}
          <select value={categoria} onChange={e => setCategoria(e.target.value)}
            className="bg-[#1a1d27] border border-[#2e3347] text-[#e8eaf0] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#4f6ef7]">
            <option value="">Todas categorias</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <button onClick={baixarModelo} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[#2e3347] text-[#8b91a8] hover:text-[#e8eaf0] transition-colors">
            <FileDown size={13} /> Baixar modelo
          </button>
          <button onClick={() => inputImportRef.current?.click()} disabled={importando}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#4f6ef7]/15 text-[#4f6ef7] hover:bg-[#4f6ef7]/25 transition-colors disabled:opacity-40">
            {importando ? <><RefreshCw size={13} className="animate-spin" /> Importando...</> : <><Upload size={13} /> Importar planilha</>}
          </button>
          <input ref={inputImportRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImportar} className="hidden" />
          <button onClick={carregar} className="p-2 rounded-xl text-[#8b91a8] hover:bg-[#2e3347] transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          {precisamCompra > 0 && (
            <button onClick={exportarExcel}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors">
              <FileDown size={13} /> Exportar Lista de Compras
            </button>
          )}
        </div>
      </div>

      {/* Cards de resumo */}
      {resumo && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
            const Icon = cfg.icon;
            const count = resumo[status === 'ok' ? 'ok' : status === 'atencao' ? 'atencao' : status + 's'] || resumo[status] || 0;
            return (
              <button key={status}
                onClick={() => setFiltroStatus(filtroStatus === status ? '' : status)}
                className={`flex items-center gap-3 p-4 rounded-2xl border transition-all
                  ${filtroStatus === status ? `${cfg.bg} ${cfg.borda}` : 'bg-[#1a1d27] border-[#2e3347] hover:border-[#3a3f55]'}`}>
                <div className={`w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center shrink-0`}>
                  <Icon size={17} className={cfg.cor} />
                </div>
                <div className="text-left">
                  <p className={`text-lg font-bold ${cfg.cor}`}>{count}</p>
                  <p className="text-xs text-[#8b91a8]">{cfg.label}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Resultado importação */}
      {resultImport && (
        <div className={`rounded-xl px-4 py-3 text-sm border ${resultImport.erros?.length > 0 ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-green-500/10 border-green-500/20 text-green-400'}`}>
          <p className="font-medium">✓ {resultImport.inseridos} movimentação(ões) importada(s)!</p>
          {resultImport.erros?.length > 0 && <div className="mt-1">{resultImport.erros.map((e, i) => <p key={i} className="text-xs text-red-400">{e}</p>)}</div>}
          <button onClick={() => setResultImport(null)} className="mt-1 text-xs underline opacity-60">Fechar</button>
        </div>
      )}

      {/* Info período */}
      {periodo && (
        <div className="flex items-center gap-2 text-xs text-[#8b91a8]">
          <TrendingDown size={13} />
          Análise dos últimos {periodo.meses} meses ·
          {precisamCompra > 0
            ? <span className="text-amber-400 font-medium">{precisamCompra} produto(s) precisam ser comprados</span>
            : <span className="text-green-400">Estoque adequado</span>
          }
        </div>
      )}

      {/* Busca e filtros */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b91a8]" />
          <input type="search" placeholder="Buscar produto..." value={busca} onChange={e => setBusca(e.target.value)}
            className="w-full bg-[#1a1d27] border border-[#2e3347] text-[#e8eaf0] rounded-xl pl-8 pr-4 py-2 text-sm placeholder:text-[#8b91a8] focus:outline-none focus:border-[#4f6ef7] transition-colors" />
          {busca && <button onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b91a8]"><X size={13} /></button>}
        </div>
        {filtroStatus && (
          <button onClick={() => setFiltroStatus('')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs bg-[#2e3347] text-[#8b91a8] hover:text-[#e8eaf0]">
            <X size={12} /> Limpar filtro
          </button>
        )}
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="text-[#4f6ef7]" /></div>
      ) : itensFiltrados.length === 0 ? (
        <div className="text-center py-16 text-[#8b91a8] text-sm">
          {itens.length === 0
            ? 'Nenhum dado de consumo encontrado no período selecionado.'
            : 'Nenhum produto encontrado com os filtros aplicados.'
          }
        </div>
      ) : (
        <div className="space-y-2">
          {/* Header */}
          <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 text-xs text-[#8b91a8] font-medium">
            <div className="col-span-4">Produto</div>
            <div className="col-span-1 text-center">Estoque</div>
            <div className="col-span-1 text-center">Saída</div>
            <div className="col-span-1 text-center">Entrada</div>
            <div className="col-span-2 text-center">Média/Mês</div>
            <div className="col-span-2 text-center">Qtd Comprar</div>
            <div className="col-span-1 text-center">Status</div>
          </div>

          {itensFiltrados.map(item => {
            const cfg = STATUS_CONFIG[item.status_mrp];
            const Icon = cfg.icon;
            return (
              <div key={item.id}
                className={`grid grid-cols-12 gap-2 items-center px-4 py-3 rounded-xl border bg-[#1a1d27]
                  ${item.status_mrp !== 'ok' ? cfg.borda : 'border-[#2e3347]'}`}>
                {/* Produto */}
                <div className="col-span-12 sm:col-span-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-[#4f6ef7]">{item.codigo}</span>
                    <span className="text-[10px] text-[#8b91a8]">{item.unidade}</span>
                  </div>
                  <p className="text-sm text-[#e8eaf0] truncate">{item.descricao}</p>
                  <p className="text-[10px] text-[#8b91a8]">{item.categoria_nome}</p>
                </div>

                {/* Estoque atual */}
                <div className="col-span-3 sm:col-span-1 text-center">
                  <p className={`text-sm font-bold ${item.estoque_atual === 0 ? 'text-red-400' : 'text-[#e8eaf0]'}`}>
                    {item.estoque_atual}
                  </p>
                  <p className="text-[10px] text-[#8b91a8] sm:hidden">estoque</p>
                </div>

                {/* Saída */}
                <div className="col-span-3 sm:col-span-1 text-center">
                  <p className="text-sm text-red-400 font-medium">-{item.total_saida}</p>
                  <p className="text-[10px] text-[#8b91a8] sm:hidden">saída</p>
                </div>

                {/* Entrada */}
                <div className="col-span-3 sm:col-span-1 text-center">
                  <p className="text-sm text-green-400 font-medium">+{item.total_entrada}</p>
                  <p className="text-[10px] text-[#8b91a8] sm:hidden">entrada</p>
                </div>

                {/* Média mensal */}
                <div className="col-span-3 sm:col-span-2 text-center">
                  <p className="text-sm text-[#4f6ef7] font-medium">{item.media_mensal}</p>
                  <p className="text-[10px] text-[#8b91a8]">/{item.unidade}/mês</p>
                </div>

                {/* Quantidade a comprar */}
                <div className="col-span-6 sm:col-span-2 text-center">
                  {item.quantidade_comprar > 0 ? (
                    <div className={`inline-flex flex-col items-center px-3 py-1 rounded-lg ${cfg.bg}`}>
                      <p className={`text-sm font-bold ${cfg.cor}`}>{item.quantidade_comprar}</p>
                      <p className={`text-[10px] ${cfg.cor}`}>{item.unidade}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-[#8b91a8]">—</p>
                  )}
                </div>

                {/* Status */}
                <div className="col-span-6 sm:col-span-1 flex justify-center">
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium ${cfg.bg} ${cfg.cor}`}>
                    <Icon size={10} />
                    <span className="hidden sm:block">{cfg.label}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
