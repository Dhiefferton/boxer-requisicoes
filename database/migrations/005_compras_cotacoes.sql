-- ============================================================
-- MIGRATION 005 — Processos de Compra e Cotações
-- Boxer Sistema de Requisição de Materiais
-- ============================================================
-- Fluxo: Necessidade (MRP) -> Processo de compra criado ->
-- Cotações registradas manualmente (mínimo 2) -> Aprovação ->
-- Vira histórico de compras.
-- Depende das tabelas: materiais, fornecedores, usuarios.
-- ============================================================

-- ------------------------------------------------------------
-- TABELA: processos_compra
-- Um processo por necessidade de compra identificada. Agrupa
-- as cotações recebidas até a aprovação final.
-- ------------------------------------------------------------
CREATE TABLE processos_compra (
    id                     SERIAL PRIMARY KEY,
    material_id            INTEGER      NOT NULL REFERENCES materiais(id),
    quantidade_necessaria  INTEGER      NOT NULL,
    status                 VARCHAR(20)  NOT NULL DEFAULT 'aguardando_cotacao',
    -- status: aguardando_cotacao, pronta_aprovar, aprovada, cancelada
    cotacao_vencedora_id   INTEGER,     -- FK adicionada depois (referencia cotacoes)
    aprovado_por           INTEGER      REFERENCES usuarios(id),
    aprovado_em            TIMESTAMPTZ,
    criado_por             INTEGER      REFERENCES usuarios(id),
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- TABELA: cotacoes
-- Cada proposta recebida de um fornecedor para um processo.
-- ------------------------------------------------------------
CREATE TABLE cotacoes (
    id              SERIAL PRIMARY KEY,
    processo_id     INTEGER       NOT NULL REFERENCES processos_compra(id) ON DELETE CASCADE,
    fornecedor_id   INTEGER       NOT NULL REFERENCES fornecedores(id),
    preco_unitario  NUMERIC(12,2) NOT NULL,
    prazo_dias      INTEGER,
    observacoes     TEXT,
    criado_por      INTEGER       REFERENCES usuarios(id),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE processos_compra
    ADD CONSTRAINT fk_processos_cotacao_vencedora
    FOREIGN KEY (cotacao_vencedora_id) REFERENCES cotacoes(id);

COMMENT ON TABLE  processos_compra                       IS 'Processo de compra: agrupa cotações de um material até aprovação';
COMMENT ON COLUMN processos_compra.status                IS 'aguardando_cotacao | pronta_aprovar (>=2 cotações) | aprovada | cancelada';
COMMENT ON COLUMN processos_compra.quantidade_necessaria  IS 'Quantidade sugerida pelo MRP no momento da criação do processo';
COMMENT ON TABLE  cotacoes                                IS 'Proposta de um fornecedor para um processo de compra, registrada manualmente pelo admin/operador';

CREATE INDEX idx_processos_compra_status  ON processos_compra(status);
CREATE INDEX idx_processos_compra_material ON processos_compra(material_id);
CREATE INDEX idx_cotacoes_processo         ON cotacoes(processo_id);
CREATE INDEX idx_cotacoes_fornecedor       ON cotacoes(fornecedor_id);
