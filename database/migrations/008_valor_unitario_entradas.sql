-- ============================================================
-- MIGRATION 008 — Valor Unitário nas Entradas de Estoque
-- Boxer Sistema de Requisição de Materiais
-- ============================================================
-- Entradas geradas a partir de "Confirmar entrega" (módulo de Compras)
-- passam a gravar o valor unitário da cotação vencedora. Entradas
-- registradas manualmente continuam sem valor (coluna fica NULL).
-- ============================================================

ALTER TABLE entradas_estoque ADD COLUMN valor_unitario NUMERIC(12,2);

COMMENT ON COLUMN entradas_estoque.valor_unitario IS 'Preço unitário da cotação vencedora, quando a entrada vem de uma compra aprovada. NULL em entradas registradas manualmente.';
