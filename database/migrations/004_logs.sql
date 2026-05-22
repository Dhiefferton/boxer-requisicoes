-- ============================================================
-- MIGRATION 004 — Logs de Auditoria
-- Boxer Sistema de Requisição de Materiais
-- ============================================================
-- Registra ações importantes no sistema para auditoria.
-- Esta tabela é append-only: nunca atualizada nem deletada.
-- Depende da migration 001.
-- ============================================================

-- ------------------------------------------------------------
-- TABELA: logs
-- Rastreia ações relevantes: logins, criações, atualizações.
-- O campo payload_json armazena dados adicionais livremente.
-- Exemplo: ao fazer login, payload = {"ip": "192.168.1.10"}
-- ============================================================
CREATE TABLE logs (
    id           SERIAL PRIMARY KEY,
    usuario_id   INTEGER      REFERENCES usuarios(id) ON DELETE SET NULL,
    acao         VARCHAR(50)  NOT NULL,  -- ex: LOGIN, CRIAR_REQUISICAO, MUDAR_STATUS
    tabela       VARCHAR(50),            -- tabela afetada, ex: requisicoes
    registro_id  INTEGER,                -- id do registro afetado
    payload_json JSONB,                  -- dados extras em JSON
    ip           VARCHAR(45),            -- IPv4 ou IPv6
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  logs              IS 'Log de auditoria append-only de ações no sistema';
COMMENT ON COLUMN logs.acao         IS 'Ação realizada: LOGIN, LOGOUT, CRIAR_REQUISICAO, MUDAR_STATUS, etc.';
COMMENT ON COLUMN logs.payload_json IS 'Dados adicionais em JSON. Ex: {"status_anterior": "solicitado", "status_novo": "em_separacao"}';
COMMENT ON COLUMN logs.ip           IS 'Endereço IP do cliente no momento da ação';

CREATE INDEX idx_logs_usuario    ON logs(usuario_id);
CREATE INDEX idx_logs_acao       ON logs(acao);
CREATE INDEX idx_logs_created_at ON logs(created_at DESC);
-- Índice no JSONB permite buscar dentro do payload
CREATE INDEX idx_logs_payload    ON logs USING gin(payload_json);
