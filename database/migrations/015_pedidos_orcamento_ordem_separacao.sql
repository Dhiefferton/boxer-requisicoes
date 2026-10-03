-- ============================================================
-- MIGRATION 015 — Pedidos de Orçamento: ordem de separação do ZenERP
-- ============================================================
-- Ponto final do fluxo no Zen: pedido criado, preparado, aprovado e
-- com ordem de separação incluída. O ID da ordem fica no card.
-- ============================================================

ALTER TABLE pedidos_orcamento
    ADD COLUMN IF NOT EXISTS zen_ordem_separacao_id INTEGER;

COMMENT ON COLUMN pedidos_orcamento.zen_ordem_separacao_id IS 'ID da ordem de separação criada no ZenERP (material/pickingOrder)';
