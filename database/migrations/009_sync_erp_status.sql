-- ============================================================
-- MIGRATION 009 — Status da Sincronização ERP persistido no banco
-- Boxer Sistema de Requisição de Materiais
-- ============================================================
-- Em ambiente serverless (Vercel), variáveis em memória não
-- sobrevivem entre chamadas — cada requisição é um processo novo.
-- Essa tabela guarda o resultado da última sincronização com o
-- ZenERP pra que GET /api/erp/status funcione corretamente.
-- ============================================================

CREATE TABLE sync_erp_status (
    id                    INTEGER PRIMARY KEY DEFAULT 1,
    ultima_sync           TIMESTAMPTZ,
    atualizados           INTEGER,
    total_monitorado      INTEGER,
    total_registros_erp   INTEGER,
    duracao_segundos      NUMERIC(10,1),
    erro                  TEXT,
    CONSTRAINT sync_erp_status_singleton CHECK (id = 1)
);

INSERT INTO sync_erp_status (id) VALUES (1);

COMMENT ON TABLE sync_erp_status IS 'Linha única (id=1) com o resultado da última sincronização ZenERP. Substitui as variáveis em memória, que não funcionam em ambiente serverless.';
