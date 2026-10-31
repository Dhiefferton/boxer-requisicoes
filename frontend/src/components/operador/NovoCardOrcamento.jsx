// ============================================================
// components/operador/NovoCardOrcamento.jsx — Criar card no B-Requisições
// ============================================================
// Mesmo formulário inicial do pipe "Orçamento BOXER SOLDAS" no Pipefy
// (+ CNPJ/CPF do cliente, usado no pedido do Zen). O card entra em "Entrada".
// O cliente é buscado no Zen pelo CPF/CNPJ: nome, estado, telefone e o
// cadastro (IE, endereço, e-mail…) vêm de lá.
// Só admin. Os campos das próximas fases são preenchidos pelo ícone de lista
// do card (a fase atual aparece primeiro).
// ============================================================
import { useEffect, useState } from 'react';
import { X, Plus, Search, CheckCircle2 } from 'lucide-react';
import { pedidosOrcamentoService } from '../../services/api';
import { Spinner } from '../ui';
import { carregarEstrutura, Editor, valorLista, obrigatorioAgora } from './CamposCardOrcamento';
import { CONFIG_ORCAMENTO } from '../../utils/fasesOrcamento';
import { campoDaConfig } from './ConfigOrcamento';

export default function NovoCardOrcamento({ onFechar, onCriado }) {
  const [campos, setCampos] = useState(null);
  const [valores, setValores] = useState({});
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [doc, setDoc] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [cliente, setCliente] = useState(null);
  const [erroCliente, setErroCliente] = useState('');

  // Campos preenchidos pela busca no Zen (não aparecem na lista de baixo)
  const DO_ZEN = ['boxer_cliente_documento', 'boxer_cliente_zen_id', 'boxer_cliente_fantasia', 'boxer_cliente_ie',
    'boxer_cliente_perfil_fiscal', 'boxer_cliente_endereco', 'boxer_cliente_cidade', 'boxer_cliente_cep',
    'boxer_cliente_telefone', 'boxer_cliente_email'];

  async function buscarCliente() {
    const d = doc.replace(/\D/g, '');
    if (d.length !== 11 && d.length !== 14) { setErroCliente('Digite um CPF (11 dígitos) ou CNPJ (14 dígitos).'); return; }
    setBuscando(true); setErroCliente(''); setCliente(null);
    try {
      const { data } = await pedidosOrcamentoService.clienteZen(d);
      const c = data.cliente;
      setCliente(c);
      // Opção do campo ESTADO do Pipefy que começa com a UF ("SP - São Paulo")
      const campoEstado = (campos || []).find(x => x.id === 'sele_o_de_lista_1');
      const opEstado = campoEstado?.opcoes?.find(o => o.toUpperCase().startsWith(`${c.uf} -`)) || '';
      setValores(v => ({
        ...v,
        cadastro_cliente: c.nome,
        boxer_cliente_documento: c.documento,
        boxer_cliente_zen_id: String(c.zen_id),
        boxer_cliente_fantasia: c.fantasia,
        boxer_cliente_ie: c.ie,
        boxer_cliente_perfil_fiscal: c.perfil_fiscal,
        boxer_cliente_endereco: c.endereco,
        boxer_cliente_cidade: c.cidade,
        boxer_cliente_cep: c.cep,
        boxer_cliente_telefone: c.telefone,
        boxer_cliente_email: c.email,
        ...(opEstado ? { sele_o_de_lista_1: opEstado } : {}),
        ...(c.telefone && !v.contato_de_faturamento ? { contato_de_faturamento: c.telefone } : {}),
      }));
    } catch (e) { setErroCliente(e.response?.data?.erro || 'Erro ao buscar o cliente no Zen.'); }
    finally { setBuscando(false); }
  }

  useEffect(() => {
    // Formulário configurado pelo admin (Configurar › Formulário inicial); sem campos lá, usa o de hoje
    const cfg = (CONFIG_ORCAMENTO.campos || []).filter(c => c.coluna === 'inicio' && c.tipo !== 'anexo').map(campoDaConfig);
    if (cfg.length) { setCampos(cfg); return; }
    carregarEstrutura()
      .then(f => setCampos((f.find(x => x.faseId === 'inicio')?.campos || []).filter(c => !['id', 'attachment'].includes(c.tipo))))
      .catch(e => setErro(e.response?.data?.erro || 'Não consegui ler o formulário do Pipefy.'));
  }, []);

  async function criar() {
    if (!cliente) { setErro('Busque o cliente no Zen pelo CPF/CNPJ.'); return; }
    const faltando = (campos || []).filter(c => obrigatorioAgora(c, (id) => valores[id]) && !valorLista(valores[c.id]).length);
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
          {campos && (
            <div className="rounded-xl border border-[var(--c-destaque)]/40 bg-[var(--c-destaque)]/5 p-3 space-y-2">
              <label className="block text-xs font-semibold text-[var(--c-texto)]">CPF / CNPJ do cliente<span className="text-red-400">*</span></label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input value={doc} onChange={e => setDoc(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscarCliente()} autoFocus
                    placeholder="Digite o documento e busque no Zen"
                    className="w-full bg-[var(--c-fundo)] border border-[var(--c-borda)] rounded-lg pl-2 pr-8 py-1.5 text-sm text-[var(--c-texto)] focus:outline-none focus:border-[var(--c-destaque)]" />
                  {doc && <button type="button" onClick={() => setDoc('')} title="Limpar" className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--c-suave)] hover:text-[var(--c-texto)]"><X size={13} /></button>}
                </div>
                <button onClick={buscarCliente} disabled={buscando}
                  className="flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold bg-[var(--c-destaque)] text-white disabled:opacity-40">
                  {buscando ? <Spinner size={12} /> : <Search size={12} />} Buscar no Zen
                </button>
              </div>
              {erroCliente && <p className="text-xs text-red-400">{erroCliente}</p>}
              {cliente && (
                <div className="text-xs space-y-0.5">
                  <p className="flex items-center gap-1.5 font-semibold text-green-400"><CheckCircle2 size={13} /> {cliente.nome}{cliente.fantasia ? ` (${cliente.fantasia})` : ''}</p>
                  <p className="text-[var(--c-suave)]">{cliente.documento}{cliente.ie ? ` · IE ${cliente.ie}` : ''}{cliente.perfil_fiscal ? ` · ${cliente.perfil_fiscal}` : ''}</p>
                  {cliente.endereco && <p className="text-[var(--c-suave)]">{cliente.endereco}{cliente.cidade ? ` — ${cliente.cidade}` : ''}{cliente.cep ? ` · CEP ${cliente.cep}` : ''}</p>}
                  {(cliente.telefone || cliente.email) && <p className="text-[var(--c-suave)]">{[cliente.telefone, cliente.email].filter(Boolean).join(' · ')}</p>}
                </div>
              )}
            </div>
          )}
          {campos?.filter(c => !DO_ZEN.includes(c.id)).map(c => (
            <div key={c.id}>
              <label className="block text-xs text-[var(--c-suave)] mb-1">{c.rotulo}{obrigatorioAgora(c, (id) => valores[id]) && <span className="text-red-400">*</span>}</label>
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
