-- ============================================================
-- MIGRATION 012 — Pedidos de Orçamento: integração Pipefy
-- ============================================================
-- Coluna "Solicitação" passa a puxar cards do pipe
-- "Orçamento BOXER SOLDAS" (301367367), fase "Requisitar Peças"
-- (344449850), via botão manual "Atualizar do Pipefy".
-- Campos do card ficam em JSONB até o mapeamento definitivo.
-- ============================================================

ALTER TABLE pedidos_orcamento
    ADD COLUMN IF NOT EXISTS pipefy_campos          JSONB,
    ADD COLUMN IF NOT EXISTS pipefy_url             TEXT,
    ADD COLUMN IF NOT EXISTS pipefy_sincronizado_em TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_orcamento_pipefy_card
    ON pedidos_orcamento(pipefy_card_id)
    WHERE pipefy_card_id IS NOT NULL;

COMMENT ON COLUMN pedidos_orcamento.pipefy_card_id IS 'ID do card no Pipefy (pipe Orçamento BOXER SOLDAS)';
COMMENT ON COLUMN pedidos_orcamento.pipefy_campos  IS 'Campos do card Pipefy: [{ id, nome, valor }]';
