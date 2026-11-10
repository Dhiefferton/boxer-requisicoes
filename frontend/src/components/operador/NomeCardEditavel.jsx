import { useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';

// Nome do card no topo do card aberto, editável (lápis → campo → Enter/✓ grava, Esc cancela).
export default function NomeCardEditavel({ nome, podeEditar = true, onSalvar, className = '' }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  function abrir() { setValor(nome || ''); setErro(''); setEditando(true); }
  async function salvar() {
    const novo = valor.trim();
    if (!novo) { setErro('Informe o nome.'); return; }
    if (novo === (nome || '').trim()) { setEditando(false); return; }
    setSalvando(true); setErro('');
    try { await onSalvar(novo); setEditando(false); }
    catch (e) { setErro(e?.response?.data?.erro || 'Não foi possível salvar o nome.'); }
    finally { setSalvando(false); }
  }

  if (!editando) {
    return (
      <div className="flex items-start gap-2 group">
        <p className={`text-lg font-bold text-[var(--c-texto)] break-words ${className}`}>{nome}</p>
        {podeEditar && (
          <button type="button" onClick={abrir} title="Editar nome do card"
            className="mt-1 shrink-0 text-[var(--c-suave)] hover:text-[var(--c-texto)] opacity-60 group-hover:opacity-100">
            <Pencil size={14} />
          </button>
        )}
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <input autoFocus value={valor} maxLength={255} onChange={e => setValor(e.target.value)} disabled={salvando}
          onKeyDown={e => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') setEditando(false); }}
          className="flex-1 min-w-0 rounded-lg border border-[var(--c-borda)] bg-[var(--c-fundo)] px-2.5 py-1.5 text-base font-bold text-[var(--c-texto)] focus:outline-none focus:border-[var(--c-destaque)]" />
        <button type="button" onClick={salvar} disabled={salvando} title="Salvar"
          className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"><Check size={16} /></button>
        <button type="button" onClick={() => setEditando(false)} disabled={salvando} title="Cancelar"
          className="p-1.5 rounded-lg bg-[var(--c-borda)] text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={16} /></button>
      </div>
      {erro && <p className="text-[11px] text-red-400 mt-1">{erro}</p>}
    </div>
  );
}
