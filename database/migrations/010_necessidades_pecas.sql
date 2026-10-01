-- ============================================================
-- MIGRATION 010 — Necessidade de Peças
-- Boxer Sistema de Requisição de Materiais
-- ============================================================
-- Tela nova: funcionários registram código + quantidade de uma
-- peça necessária (precisa já existir no catálogo). Fluxo em 3
-- colunas: Solicitado -> Em andamento (revisão: define modal de
-- frete marítimo/aéreo) -> Aprovado (envio pra outro sistema,
-- ainda a definir qual — por isso o payload é guardado localmente
-- até a integração real ser plugada).
-- ============================================================

CREATE TABLE necessidades_pecas (
    id                    SERIAL PRIMARY KEY,
    material_id           INTEGER      NOT NULL REFERENCES materiais(id),
    quantidade            INTEGER      NOT NULL CHECK (quantidade > 0),
    status                VARCHAR(20)  NOT NULL DEFAULT 'solicitado',
    -- status: solicitado, em_andamento, aprovado, cancelado

    frete_maritimo        BOOLEAN      NOT NULL DEFAULT FALSE,
    frete_aereo           BOOLEAN      NOT NULL DEFAULT FALSE,
    observacoes           TEXT,

    -- snapshot, pra manter legível mesmo se o produto mudar depois
    codigo_snapshot       VARCHAR(50),
    descricao_snapshot    VARCHAR(255),

    solicitado_por        INTEGER      REFERENCES usuarios(id),
    solicitado_em         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    revisado_por           INTEGER      REFERENCES usuarios(id),
    revisado_em            TIMESTAMPTZ,

    aprovado_por           INTEGER      REFERENCES usuarios(id),
    aprovado_em            TIMESTAMPTZ,

    enviado_outro_sistema  BOOLEAN      NOT NULL DEFAULT FALSE,
    enviado_em             TIMESTAMPTZ,
    payload_enviado        JSONB,

    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  necessidades_pecas                      IS 'Pedido interno de necessidade de peça — fluxo Solicitado -> Em andamento -> Aprovado -> enviado a outro sistema (destino ainda não definido)';
COMMENT ON COLUMN necessidades_pecas.status               IS 'solicitado | em_andamento | aprovado | cancelado';
COMMENT ON COLUMN necessidades_pecas.frete_maritimo        IS 'Editável na etapa Em andamento, parte da revisão';
COMMENT ON COLUMN necessidades_pecas.frete_aereo           IS 'Editável na etapa Em andamento, parte da revisão';
COMMENT ON COLUMN necessidades_pecas.payload_enviado       IS 'Snapshot do que seria enviado ao sistema externo — preenchido quando o botão Enviar é clicado, mesmo sem integração real plugada ainda';

CREATE INDEX idx_necessidades_pecas_status   ON necessidades_pecas(status);
CREATE INDEX idx_necessidades_pecas_material ON necessidades_pecas(material_id);
