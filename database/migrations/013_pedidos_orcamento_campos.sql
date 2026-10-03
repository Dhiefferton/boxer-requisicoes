-- ============================================================
-- MIGRATION 013 — Pedidos de Orçamento: campos extraídos do Pipefy
-- ============================================================
-- Dados que aparecem na coluna "Solicitação", extraídos do card
-- do pipe "Orçamento BOXER SOLDAS" a cada "Atualizar do Pipefy".
-- itens: [{ n, codigo, descricao, quantidade, valor_unitario }]
-- ============================================================

ALTER TABLE pedidos_orcamento
    ADD COLUMN IF NOT EXISTS cliente_nome    VARCHAR(255),
    ADD COLUMN IF NOT EXISTS cliente_cnpj    VARCHAR(30),
    ADD COLUMN IF NOT EXISTS tecnico         VARCHAR(150),
    ADD COLUMN IF NOT EXISTS frete_por_conta VARCHAR(120),
    ADD COLUMN IF NOT EXISTS entregue_por    VARCHAR(120),
    ADD COLUMN IF NOT EXISTS ns_entrada      VARCHAR(60),
    ADD COLUMN IF NOT EXISTS itens           JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN pedidos_orcamento.itens IS 'Peças do card Pipefy: [{ n, codigo, descricao, quantidade, valor_unitario }]';
