-- ============================================================
-- MIGRATION 017 — Pedidos de Orçamento: romaneio e nota fiscal do ZenERP
-- ============================================================
-- Botão "Mover p/ Finalizado": finaliza o romaneio de saída no Zen e
-- cria a nota fiscal (fica em preparação pra revisão/emissão no Zen).
-- ============================================================

ALTER TABLE pedidos_orcamento
    ADD COLUMN IF NOT EXISTS zen_romaneio_id INTEGER,
    ADD COLUMN IF NOT EXISTS zen_nota_id     INTEGER;

COMMENT ON COLUMN pedidos_orcamento.zen_romaneio_id IS 'ID do romaneio de saída no ZenERP (material/outgoingList)';
COMMENT ON COLUMN pedidos_orcamento.zen_nota_id     IS 'ID da nota fiscal de saída criada no ZenERP (fiscal/outgoingInvoice)';
