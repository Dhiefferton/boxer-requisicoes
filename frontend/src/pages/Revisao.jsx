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

export default function Revisao() {
  const { usuario }           = useAuth();
  const { itens, limpar, totalItens } = useCart();
  const navigate              = useNavigate();

  const [dataNecessidade, setDataNecessidade] = useState('');
  const [observacoes,     setObservacoes]     = useState('');
  const [enviando,        setEnviando]        = useState(false);
  const [erro,            setErro]            = useState('');
  const [sucesso,         setSucesso]         = useState(false);
  const [requisicaoId,    setRequisicaoId]    = useState(null);

  // Carrinho vazio → não tem o que revisar
  if (itens.length === 0 && !sucesso) {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <button onClick={() => navigate('/catalogo')} className="flex items-center gap-2 text-sm text-[#8b91a8] hover:text-[#e8eaf0] transition-colors">
          <ArrowLeft size={16} /> Voltar ao catálogo
        </button>
        <Empty
          icon={ShoppingCart}
          titulo="Carrinho vazio"
          descricao="Adicione itens ao carrinho antes de revisar"
        />
        <Button onClick={() => navigate('/catalogo')} className="w-full">
          Ir para o catálogo
        </Button>
      </div>
    );
  }

  // Tela de sucesso após envio
  if (sucesso) {
    return (
      <div className="max-w-sm mx-auto flex flex-col items-center justify-center py-16 gap-5 text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
          <CheckCircle size={32} className="text-green-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[#e8eaf0]">Requisição enviada!</h2>
          <p className="text-sm text-[#8b91a8] mt-1">
            Sua requisição #{requisicaoId} foi registrada e será processada em breve.
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full">
          <Button onClick={() => navigate('/historico')} size="lg" className="w-full">
            Ver no histórico
          </Button>
          <Button onClick={() => navigate('/catalogo')} variant="secondary" size="lg" className="w-full">
            Nova requisição
          </Button>
        </div>
      </div>
    );
  }

  async function handleEnviar() {
    setErro('');
    setEnviando(true);
    try {
      const payload = {
        data_necessidade: dataNecessidade || null,
        observacoes:      observacoes     || null,
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

      {/* Voltar */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-[#8b91a8] hover:text-[#e8eaf0] transition-colors"
      >
        <ArrowLeft size={16} /> Voltar
      </button>

      <div>
        <h1 className="text-lg font-bold text-[#e8eaf0]">Revisar requisição</h1>
        <p className="text-sm text-[#8b91a8] mt-0.5">Confira os dados antes de enviar</p>
      </div>

      {/* Dados do solicitante */}
      <div className="bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-[#e8eaf0]">Solicitante</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[#8b91a8]">Nome</p>
            <p className="text-[#e8eaf0] font-medium mt-0.5">{usuario?.nome}</p>
          </div>
          <div>
            <p className="text-[#8b91a8]">Departamento</p>
            <p className="text-[#e8eaf0] font-medium mt-0.5">{usuario?.departamento_nome || '—'}</p>
          </div>
        </div>
      </div>

      {/* Data de necessidade */}
      <div className="bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-[#4f6ef7]" />
          <h3 className="text-sm font-semibold text-[#e8eaf0]">Data de necessidade</h3>
          <span className="text-xs text-[#8b91a8]">(opcional)</span>
        </div>
        <input
          type="date"
          value={dataNecessidade}
          onChange={e => setDataNecessidade(e.target.value)}
          min={new Date().toISOString().split('T')[0]}
          className="
            bg-[#2e3347] border border-[#2e3347] text-[#e8eaf0] rounded-xl px-4 py-2.5
            text-sm w-full focus:outline-none focus:border-[#4f6ef7] focus:ring-1
            focus:ring-[#4f6ef7]/30 transition-colors
          "
        />
      </div>

      {/* Itens do carrinho */}
      <div className="bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#e8eaf0]">Itens solicitados</h3>
          <span className="text-xs text-[#8b91a8]">{totalItens} {totalItens === 1 ? 'item' : 'itens'}</span>
        </div>
        <div className="space-y-2">
          {itens.map(({ material, quantidade }) => (
            <div key={material.id} className="flex items-center justify-between py-2.5 border-b border-[#2e3347] last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#4f6ef7] font-medium">{material.codigo}</p>
                <p className="text-sm text-[#e8eaf0] truncate">{material.descricao}</p>
                <p className="text-xs text-[#8b91a8]">{material.unidade}</p>
              </div>
              <div className="text-right shrink-0 ml-4">
                <span className="text-sm font-semibold text-[#e8eaf0]">{quantidade}</span>
                <p className="text-xs text-[#8b91a8]">{material.unidade}</p>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={() => navigate('/catalogo')}
          className="text-xs text-[#4f6ef7] hover:underline"
        >
          Editar itens no catálogo
        </button>
      </div>

      {/* Observações */}
      <div className="bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-[#4f6ef7]" />
          <h3 className="text-sm font-semibold text-[#e8eaf0]">Observações</h3>
          <span className="text-xs text-[#8b91a8]">(opcional)</span>
        </div>
        <Textarea
          placeholder="Ex: Materiais urgentes para evento de sexta-feira…"
          value={observacoes}
          onChange={e => setObservacoes(e.target.value)}
          rows={3}
        />
      </div>

      {/* Erro */}
      {erro && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
          {erro}
        </div>
      )}

      {/* Botões de ação */}
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
