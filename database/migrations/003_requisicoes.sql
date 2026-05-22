-- ============================================================
-- MIGRATION 003 — Requisições e Rastreabilidade
-- Boxer Sistema de Requisição de Materiais
-- ============================================================
-- Esta migration cria o coração do sistema:
--   - requisicoes: cada pedido submetido por um colaborador
--   - itens_requisicao: os materiais dentro de cada pedido
--   - historico_status: rastreio de cada mudança de status
-- Depende das migrations 001 e 002.
-- ============================================================

-- ------------------------------------------------------------
-- TABELA: requisicoes
-- Cada linha é uma solicitação de materiais.
-- status percorre o ciclo:
--   solicitado → em_separacao → separado → entregue
--   ou em qualquer ponto → cancelado
-- ------------------------------------------------------------
CREATE TABLE requisicoes (
    id               SERIAL PRIMARY KEY,
    usuario_id       INTEGER      NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    departamento_id  INTEGER      REFERENCES departamentos(id) ON DELETE SET NULL,
    data_necessidade DATE,                            -- quando o solicitante precisa receber
    observacoes      TEXT,
    status           VARCHAR(20)  NOT NULL DEFAULT 'solicitado'
                         CHECK (status IN (
                             'solicitado',
                             'em_separacao',
                             'separado',
                             'entregue',
                             'cancelado'
                         )),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  requisicoes                   IS 'Requisições de materiais submetidas pelos colaboradores';
COMMENT ON COLUMN requisicoes.status            IS 'solicitado | em_separacao | separado | entregue | cancelado';
COMMENT ON COLUMN requisicoes.data_necessidade  IS 'Data que o colaborador precisa receber os materiais';
COMMENT ON COLUMN requisicoes.departamento_id   IS 'Copiado do usuário no momento do envio para rastreio histórico';

CREATE INDEX idx_requisicoes_usuario     ON requisicoes(usuario_id);
CREATE INDEX idx_requisicoes_status      ON requisicoes(status);
CREATE INDEX idx_requisicoes_created_at  ON requisicoes(created_at DESC);

-- ------------------------------------------------------------
-- TABELA: itens_requisicao
-- Os materiais que compõem cada requisição.
-- Armazenamos descricao_snapshot e unidade_snapshot para
-- garantir que o histórico não mude se o catálogo for editado.
-- ------------------------------------------------------------
CREATE TABLE itens_requisicao (
    id                  SERIAL PRIMARY KEY,
    requisicao_id       INTEGER      NOT NULL REFERENCES requisicoes(id) ON DELETE CASCADE,
    material_id         INTEGER      NOT NULL REFERENCES materiais(id) ON DELETE RESTRICT,
    quantidade          INTEGER      NOT NULL CHECK (quantidade > 0),
    -- Snapshots: preservam o estado do material no momento da solicitação
    descricao_snapshot  VARCHAR(255) NOT NULL,  -- cópia da descrição no momento do pedido
    unidade_snapshot    VARCHAR(20)  NOT NULL,  -- cópia da unidade no momento do pedido
    codigo_snapshot     VARCHAR(30)  NOT NULL   -- cópia do código no momento do pedido
);

COMMENT ON TABLE  itens_requisicao                  IS 'Itens que compõem cada requisição';
COMMENT ON COLUMN itens_requisicao.descricao_snapshot IS 'Descrição do material no momento da requisição (histórico imutável)';
COMMENT ON COLUMN itens_requisicao.quantidade         IS 'Quantidade solicitada. Mínimo 1 (constraint CHECK).';

CREATE INDEX idx_itens_requisicao_id ON itens_requisicao(requisicao_id);

-- ------------------------------------------------------------
-- TABELA: historico_status
-- Registra CADA mudança de status de uma requisição.
-- Permite rastrear quem mudou, quando e o motivo.
-- Esta tabela nunca é editada ou deletada — apenas inserida.
-- ------------------------------------------------------------
CREATE TABLE historico_status (
    id                SERIAL PRIMARY KEY,
    requisicao_id     INTEGER      NOT NULL REFERENCES requisicoes(id) ON DELETE CASCADE,
    status_anterior   VARCHAR(20),             -- NULL quando é a criação inicial
    status_novo       VARCHAR(20)  NOT NULL,
    usuario_id        INTEGER      REFERENCES usuarios(id) ON DELETE SET NULL,
    observacao        TEXT,                    -- motivo da mudança (opcional)
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  historico_status                IS 'Log imutável de todas as mudanças de status das requisições';
COMMENT ON COLUMN historico_status.status_anterior IS 'NULL indica que é o registro de criação da requisição';
COMMENT ON COLUMN historico_status.usuario_id      IS 'Quem realizou a mudança de status';

CREATE INDEX idx_historico_requisicao ON historico_status(requisicao_id);
CREATE INDEX idx_historico_created_at ON historico_status(created_at DESC);
