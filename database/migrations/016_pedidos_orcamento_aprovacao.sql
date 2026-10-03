-- ============================================================
-- MIGRATION 016 — Pedidos de Orçamento: Aprovado/Recusado
-- ============================================================
-- Quando o card do Pipefy chega na fase "Aprovado/Recusado", o pedido
-- vai pra coluna de mesmo nome (status 'aprovado_recusado') e guarda o
-- valor do campo "Aprovação" do card (Aprovado / Recusado).
-- ============================================================

ALTER TABLE pedidos_orcamento
    ADD COLUMN IF NOT EXISTS aprovacao VARCHAR(30);

COMMENT ON COLUMN pedidos_orcamento.aprovacao IS 'Campo "Aprovação" do card Pipefy: Aprovado | Recusado';
COMMENT ON COLUMN pedidos_orcamento.status    IS 'solicitacao | separando | separado | aprovado_recusado | finalizado | cancelado';
