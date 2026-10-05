-- ============================================================
-- 019 — Relatórios da coluna "Aprovado" (Necessidade de Peças)
-- ============================================================
-- Cada clique em "Gerar relatório" cria um lote numerado com todos os
-- itens aprovados no momento. Os itens passam para status 'relatorio'
-- (saem da coluna Aprovado e não entram nos próximos relatórios) e o
-- lote fica no histórico para baixar de novo.

CREATE TABLE IF NOT EXISTS necessidades_pecas_relatorios (
  id           SERIAL PRIMARY KEY,
  gerado_por   INTEGER REFERENCES usuarios(id),
  gerado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_itens  INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE necessidades_pecas
  ADD COLUMN IF NOT EXISTS relatorio_id INTEGER REFERENCES necessidades_pecas_relatorios(id);

CREATE INDEX IF NOT EXISTS idx_necessidades_pecas_relatorio ON necessidades_pecas(relatorio_id);

COMMENT ON COLUMN necessidades_pecas.status IS 'solicitado | em_andamento | aprovado | recusado | relatorio | cancelado';

ALTER TABLE necessidades_pecas_relatorios ENABLE ROW LEVEL SECURITY;
