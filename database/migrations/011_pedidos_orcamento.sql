-- ============================================================
-- MIGRATION 011 — Pedidos de Orçamento
-- Boxer Sistema de Requisição de Materiais
-- ============================================================
-- Tela nova: pedidos de orçamento em 3 colunas (Solicitação ->
-- Separando -> Finalizado). Primeira versão é só a estrutura —
-- ainda sem puxar dados do Pipefy nem gerar pedido no ZenERP
-- (isso vem em passos seguintes). pipefy_card_id já fica reservado
-- pra quando essa integração for plugada.
-- ============================================================

CREATE TABLE pedidos_orcamento (
    id                SERIAL PRIMARY KEY,
    referencia        VARCHAR(255) NOT NULL,
    pipefy_card_id    VARCHAR(50),
    status            VARCHAR(20)  NOT NULL DEFAULT 'solicitacao',
    -- status: solicitacao, separando, finalizado, cancelado
    observacoes       TEXT,

    criado_por        INTEGER      REFERENCES usuarios(id),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    atualizado_em     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  pedidos_orcamento                   IS 'Pedido de orçamento — fluxo Solicitação -> Separando -> Finalizado. Futuramente puxado do Pipefy e usado pra gerar pedido no ZenERP.';
COMMENT ON COLUMN pedidos_orcamento.status            IS 'solicitacao | separando | finalizado | cancelado';
COMMENT ON COLUMN pedidos_orcamento.pipefy_card_id     IS 'Reservado pra integração futura com o Pipefy — ainda não usado';

CREATE INDEX idx_pedidos_orcamento_status ON pedidos_orcamento(status);
