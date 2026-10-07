// ============================================================
// pages/Revisao.jsx — Revisão e envio da requisição
// ============================================================
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Calendar, MessageSquare, CheckCircle, ShoppingCart } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { requisicoesService } from '../services/api';
import { Button, Textarea, Empty } from '../components/ui';

// Retorna a data de hoje no formato YYYY-MM-DD
function hoje() {
  return new Date().toISOString().split('T')[0];
}

export default function Revisao() {
  const { usuario }                   = useAuth();
  const { itens, limpar, totalItens } = useCart();
  const navigate                      = useNavigate();

  // Data preenchida automaticamente com hoje
  const [dataNecessidade, setDataNecessidade] = useState(hoje());
  const [observacoes,     setObservacoes]     = useState('');
  const [enviando,        setEnviando]        = useState(false);
  const [erro,            setErro]            = useState('');
  const [sucesso,         setSucesso]         = useState(false);
  const [requisicaoId,    setRequisicaoId]    = useState(null);

  if (itens.length === 0 && !sucesso) {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <button onClick={() => navigate('/catalogo')} className="flex items-center gap-2 text-sm text-[var(--c-suave)] hover:text-[var(--c-texto)] transition-colors">
          <ArrowLeft size={16} /> Voltar ao catálogo
        </button>
        <Empty icon={ShoppingCart} titulo="Carrinho vazio" descricao="Adicione itens ao carrinho antes de revisar" />
        <Button onClick={() => navigate('/catalogo')} className="w-full">Ir para o catálogo</Button>
      </div>
    );
  }

  if (sucesso) {
    return (
      <div className="max-w-sm mx-auto flex flex-col items-center justify-center py-16 gap-5 text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
          <CheckCircle size={32} className="text-green-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[var(--c-texto)]">Requisição enviada!</h2>
          <p className="text-sm text-[var(--c-suave)] mt-1">
            Sua requisição #{requisicaoId} foi registrada e será processada em breve.
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full">
          <Button onClick={() => navigate('/historico')} size="lg" className="w-full">Ver no histórico</Button>
          <Button onClick={() => navigate('/catalogo')} variant="secondary" size="lg" className="w-full">Nova requisição</Button>
        </div>
      </div>
    );
  }

  async function handleEnviar() {
    setErro('');

    // Valida data obrigatória
    if (!dataNecessidade) {
      setErro('A data de necessidade é obrigatória.');
      return;
    }

    setEnviando(true);
    try {
      const payload = {
        data_necessidade: dataNecessidade,
        observacoes:      observacoes || null,
        itens: itens.map(i => ({
          material_id: i.material.id,
          quantidade:  i.quantidade,
        })),
      };
      const { data } = await requisicoesService.criar(payload);
      setRequisicaoId(data.requisicao.id);
      limpar();
      setSucesso(true);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao enviar. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-[var(--c-suave)] hover:text-[var(--c-texto)] transition-colors">
        <ArrowLeft size={16} /> Voltar
      </button>

      <div>
        <h1 className="text-lg font-bold text-[var(--c-texto)]">Revisar requisição</h1>
        <p className="text-sm text-[var(--c-suave)] mt-0.5">Confira os dados antes de enviar</p>
      </div>

      {/* Dados do solicitante */}
      <div className="bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-[var(--c-texto)]">Solicitante</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[var(--c-suave)]">Nome</p>
            <p className="text-[var(--c-texto)] font-medium mt-0.5">{usuario?.nome}</p>
          </div>
          <div>
            <p className="text-[var(--c-suave)]">Departamento</p>
            <p className="text-[var(--c-texto)] font-medium mt-0.5">{usuario?.departamento_nome || '—'}</p>
          </div>
        </div>
      </div>

      {/* Data de necessidade — obrigatória e preenchida automaticamente */}
      <div className="bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-[var(--c-destaque)]" />
          <h3 className="text-sm font-semibold text-[var(--c-texto)]">Data de necessidade</h3>
          <span className="text-xs text-red-400 font-medium">obrigatório</span>
        </div>
        <input
          type="date"
          value={dataNecessidade}
          onChange={e => setDataNecessidade(e.target.value)}
          min={hoje()}
          required
          className="
            bg-[var(--c-borda)] border border-[var(--c-borda)] text-[var(--c-texto)] rounded-xl px-4 py-2.5
            text-sm w-full focus:outline-none focus:border-[var(--c-destaque)] focus:ring-1
            focus:ring-[var(--c-destaque)]/30 transition-colors
          "
        />
        <p className="text-xs text-[var(--c-suave)]">Preenchido com a data de hoje. Altere se necessário.</p>
      </div>

      {/* Itens do carrinho */}
      <div className="bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--c-texto)]">Itens solicitados</h3>
          <span className="text-xs text-[var(--c-suave)]">{totalItens} {totalItens === 1 ? 'item' : 'itens'}</span>
        </div>
        <div className="space-y-2">
          {itens.map(({ material, quantidade }) => (
            <div key={material.id} className="flex items-center justify-between py-2.5 border-b border-[var(--c-borda)] last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--c-destaque)] font-medium">{material.codigo}</p>
                <p className="text-sm text-[var(--c-texto)] truncate">{material.descricao}</p>
                <p className="text-xs text-[var(--c-suave)]">{material.unidade}</p>
              </div>
              <div className="text-right shrink-0 ml-4">
                <span className="text-sm font-semibold text-[var(--c-texto)]">{quantidade}</span>
                <p className="text-xs text-[var(--c-suave)]">{material.unidade}</p>
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => navigate('/catalogo')} className="text-xs text-[var(--c-destaque)] hover:underline">
          Editar itens no catálogo
        </button>
      </div>

      {/* Observações */}
      <div className="bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-[var(--c-destaque)]" />
          <h3 className="text-sm font-semibold text-[var(--c-texto)]">Observações</h3>
          <span className="text-xs text-[var(--c-suave)]">(opcional)</span>
        </div>
        <Textarea
          placeholder="Ex: Materiais urgentes para evento de sexta-feira…"
          value={observacoes}
          onChange={e => setObservacoes(e.target.value)}
          rows={3}
        />
      </div>

      {erro && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
          {erro}
        </div>
      )}

      <div className="flex gap-3 pb-6">
        <Button variant="secondary" onClick={() => navigate(-1)} className="flex-1">
          <ArrowLeft size={16} /> Voltar
        </Button>
        <Button onClick={handleEnviar} loading={enviando} className="flex-2">
          <Send size={16} />
          {enviando ? 'Enviando…' : 'Confirmar envio'}
        </Button>
      </div>
    </div>
  );
}
