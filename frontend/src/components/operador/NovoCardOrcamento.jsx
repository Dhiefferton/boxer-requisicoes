// ============================================================
// components/operador/NovoCardOrcamento.jsx — Criar card no B-Requisições
// ============================================================
// Mesmo formulário inicial do pipe "Orçamento BOXER SOLDAS" no Pipefy
// (+ CNPJ/CPF do cliente, usado no pedido do Zen). O card entra em "Entrada".
// Só admin. Os campos das próximas fases são preenchidos pelo ícone de lista
// do card (a fase atual aparece primeiro).
// ============================================================
import { useEffect, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { pedidosOrcamentoService } from '../../services/api';
import { Spinner } from '../ui';
import { carregarEstrutura, Editor, valorLista } from './CamposCardOrcamento';

export default function NovoCardOrcamento({ onFechar, onCriado }) {
  const [campos, setCampos] = useState(null);
  const [valores, setValores] = useState({});
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregarEstrutura()
      .then(f => setCampos((f.find(x => x.faseId === 'inicio')?.campos || []).filter(c => !['id', 'attachment'].includes(c.tipo))))
      .catch(e => setErro(e.response?.data?.erro || 'Não consegui ler o formulário do Pipefy.'));
  }, []);

  async function criar() {
    const faltando = (campos || []).filter(c => c.obrigatorio && !valorLista(valores[c.id]).length);
    if (faltando.length) { setErro(`Preencha: ${faltando.map(c => c.rotulo).join(', ')}.`); return; }
    setSalvando(true); setErro('');
    try {
      const { data } = await pedidosOrcamentoService.novoCard(valores);
      onCriado?.(data.id);
    } catch (e) { setErro(e.response?.data?.erro || 'Erro ao criar o card.'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3" onClick={onFechar}>
      <div className="w-full max-w-xl max-h-[90dvh] flex flex-col bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--c-borda)]">
          <div className="flex-1">
            <p className="text-sm font-bold text-[var(--c-texto)]">Novo card de orçamento</p>
            <p className="text-[11px] text-[var(--c-suave)]">Mesmos campos do formulário do Pipefy · o card entra em "Entrada"</p>
          </div>
          <button onClick={onFechar} className="p-1 text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto p-4 space-y-3">
          {!campos && !erro && <div className="flex justify-center py-10"><Spinner className="text-[var(--c-destaque)]" /></div>}
          {campos?.map(c => (
            <div key={c.id}>
              <label className="block text-xs text-[var(--c-suave)] mb-1">{c.rotulo}{c.obrigatorio && <span className="text-red-400">*</span>}</label>
              <Editor campo={c} valor={valores[c.id] || ''} onChange={v => setValores(x => ({ ...x, [c.id]: v }))} />
            </div>
          ))}
          {erro && <p className="text-xs text-red-400">{erro}</p>}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[var(--c-borda)]">
          <button onClick={onFechar} className="px-3 py-2 rounded-xl text-xs text-[var(--c-suave)] hover:text-[var(--c-texto)]">Cancelar</button>
          <button onClick={criar} disabled={salvando || !campos}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--c-destaque)] text-white disabled:opacity-40">
            {salvando ? <Spinner size={13} /> : <Plus size={13} />} Criar card
          </button>
        </div>
      </div>
    </div>
  );
}
