// ============================================================
// hooks/useRequisicoes.js — Dados e ações do painel operador
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { requisicoesService } from '../services/api';

export function useRequisicoes(statusFiltro = '') {
  const [requisicoes, setRequisicoes] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [erro,        setErro]        = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const params = { limite: 100 };
      if (statusFiltro) params.status = statusFiltro;
      const { data } = await requisicoesService.listar(params);
      setRequisicoes(data.requisicoes);
    } catch {
      setErro('Erro ao carregar requisições.');
    } finally {
      setLoading(false);
    }
  }, [statusFiltro]);

  useEffect(() => { carregar(); }, [carregar]);

  async function mudarStatus(id, novoStatus, observacao = '') {
    const { data } = await requisicoesService.mudarStatus(id, novoStatus, observacao);

    // Se foi cancelado, remove o card da lista
    if (data.excluida) {
      setRequisicoes(prev => prev.filter(r => r.id !== id));
    } else {
      // Atualiza localmente sem recarregar tudo
      setRequisicoes(prev =>
        prev.map(r => r.id === id ? { ...r, status: novoStatus } : r)
      );
    }
  }

  return { requisicoes, loading, erro, recarregar: carregar, mudarStatus };
}
