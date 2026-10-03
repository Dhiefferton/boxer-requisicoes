-- ============================================================
-- MIGRATION 014 — Pedidos de Orçamento: pedido de venda no ZenERP
-- ============================================================
-- Ao mover de "Solicitação" para "Separando", o sistema cria o
-- pedido de venda no ZenERP. Guarda o ID criado e o último erro
-- (pra reenviar sem duplicar o pedido).
-- ============================================================

ALTER TABLE pedidos_orcamento
    ADD COLUMN IF NOT EXISTS zen_pedido_id  INTEGER,
    ADD COLUMN IF NOT EXISTS zen_erro       TEXT,
    ADD COLUMN IF NOT EXISTS zen_enviado_em TIMESTAMPTZ;

COMMENT ON COLUMN pedidos_orcamento.zen_pedido_id IS 'ID do pedido de venda criado no ZenERP (sale.id)';
COMMENT ON COLUMN pedidos_orcamento.zen_erro      IS 'Último erro ao criar o pedido no ZenERP (NULL = ok)';
