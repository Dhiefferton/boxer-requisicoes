-- ============================================================
-- MIGRATION 007 — Acompanhamento de Entrega dos Pedidos
-- Boxer Sistema de Requisição de Materiais
-- ============================================================
-- Depois que um item é aprovado (fornecedor escolhido), passa a ser
-- rastreado até a mercadoria chegar: data prevista de entrega
-- (calculada automaticamente a partir do prazo da cotação vencedora),
-- número da nota fiscal, e vínculo com a entrada de estoque gerada
-- automaticamente na confirmação.
-- ============================================================

ALTER TABLE itens_processo_compra
  ADD COLUMN data_prevista_entrega DATE,
  ADD COLUMN numero_nota_fiscal    VARCHAR(50),
  ADD COLUMN entrada_id            INTEGER REFERENCES entradas_estoque(id),
  ADD COLUMN recebido_em           TIMESTAMPTZ;

COMMENT ON COLUMN itens_processo_compra.data_prevista_entrega IS 'aprovado_em + prazo_dias da cotação vencedora, calculado na aprovação';
COMMENT ON COLUMN itens_processo_compra.numero_nota_fiscal    IS 'Preenchido pelo admin ao confirmar o recebimento da mercadoria';
COMMENT ON COLUMN itens_processo_compra.entrada_id            IS 'Entrada de estoque gerada automaticamente ao confirmar a entrega';

CREATE INDEX idx_itens_processo_data_prevista ON itens_processo_compra(data_prevista_entrega);
