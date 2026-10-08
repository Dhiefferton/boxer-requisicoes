-- ============================================================
-- MIGRATION 020 — Pedidos de Orçamento: Aprovado Parcial
-- ============================================================
-- Card "Aprovado Parcial" no Pipefy: o campo "Peças Recusadas" traz os
-- códigos que saem do pedido. O botão "Retirar peças recusadas no Zen"
-- cancela a ordem de separação, tira as peças do pedido de venda,
-- aprova de novo e gera uma nova ordem só com as peças aprovadas.
-- ============================================================

ALTER TABLE pedidos_orcamento
    ADD COLUMN IF NOT EXISTS pecas_recusadas        TEXT,
    ADD COLUMN IF NOT EXISTS recusadas_retiradas_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS itens_recusados        JSONB;

COMMENT ON COLUMN pedidos_orcamento.pecas_recusadas        IS 'Campo "Peças Recusadas" do card do Pipefy (códigos separados por vírgula/linha)';
COMMENT ON COLUMN pedidos_orcamento.recusadas_retiradas_em IS 'Quando as peças recusadas foram retiradas do pedido no ZenERP';
COMMENT ON COLUMN pedidos_orcamento.itens_recusados        IS 'Itens retirados do pedido (Aprovado Parcial)';
