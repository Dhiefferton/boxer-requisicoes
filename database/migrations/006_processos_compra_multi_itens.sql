-- ============================================================
-- MIGRATION 006 — Processos de Compra com múltiplos itens
-- Boxer Sistema de Requisição de Materiais
-- ============================================================
-- A migration 005 criou processos_compra com 1 material por card.
-- Esta migration transforma o card em um container que pode ter
-- vários materiais dentro (igual ao padrão requisicoes/itens_requisicao).
--
-- Cada item dentro do card tem seu próprio status e cotações —
-- assim um card pode ter itens em estágios diferentes ao mesmo tempo.
-- ============================================================

-- ------------------------------------------------------------
-- TABELA: itens_processo_compra
-- ------------------------------------------------------------
CREATE TABLE itens_processo_compra (
    id                     SERIAL PRIMARY KEY,
    processo_id            INTEGER      NOT NULL REFERENCES processos_compra(id) ON DELETE CASCADE,
    material_id            INTEGER      NOT NULL REFERENCES materiais(id),
    quantidade_necessaria  INTEGER      NOT NULL,
    status                 VARCHAR(20)  NOT NULL DEFAULT 'aguardando_cotacao',
    -- status: aguardando_cotacao, pronta_aprovar, aprovado, cancelada
    cotacao_vencedora_id   INTEGER,     -- FK adicionada depois de alterar cotacoes
    aprovado_por           INTEGER      REFERENCES usuarios(id),
    aprovado_em            TIMESTAMPTZ,
    -- snapshot pra manter o histórico legível mesmo se o produto mudar
    codigo_snapshot        VARCHAR(50),
    descricao_snapshot     VARCHAR(255),
    unidade_snapshot       VARCHAR(10),
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Migra os dados que já existiam (cada processo antigo tinha 1 material só)
INSERT INTO itens_processo_compra
  (processo_id, material_id, quantidade_necessaria, status, aprovado_por, aprovado_em,
   codigo_snapshot, descricao_snapshot, unidade_snapshot)
SELECT p.id, p.material_id, p.quantidade_necessaria, p.status, p.aprovado_por, p.aprovado_em,
       m.codigo, m.descricao, m.unidade
FROM processos_compra p
JOIN materiais m ON m.id = p.material_id;

-- Cotações passam a apontar para o ITEM, não mais para o card inteiro
ALTER TABLE cotacoes ADD COLUMN item_processo_id INTEGER REFERENCES itens_processo_compra(id) ON DELETE CASCADE;

UPDATE cotacoes ct
SET item_processo_id = ipc.id
FROM itens_processo_compra ipc
WHERE ipc.processo_id = ct.processo_id;

ALTER TABLE cotacoes ALTER COLUMN item_processo_id SET NOT NULL;
ALTER TABLE cotacoes DROP COLUMN processo_id;

-- Vincula a cotação vencedora no item (equivalente ao que existia no card)
UPDATE itens_processo_compra ipc
SET cotacao_vencedora_id = pc.cotacao_vencedora_id
FROM processos_compra pc
WHERE pc.id = ipc.processo_id AND pc.cotacao_vencedora_id IS NOT NULL;

ALTER TABLE itens_processo_compra
  ADD CONSTRAINT fk_item_cotacao_vencedora FOREIGN KEY (cotacao_vencedora_id) REFERENCES cotacoes(id);

-- 'aprovada' no card antigo vira 'aprovado' no item (nomenclatura no singular do item)
UPDATE itens_processo_compra SET status = 'aprovado' WHERE status = 'aprovada';

-- O card (processos_compra) agora é só um container: id, quem criou, quando.
-- O status/material/quantidade/aprovação viraram responsabilidade do item.
ALTER TABLE processos_compra DROP CONSTRAINT IF EXISTS fk_processos_cotacao_vencedora;
ALTER TABLE processos_compra DROP COLUMN IF EXISTS cotacao_vencedora_id;
ALTER TABLE processos_compra DROP COLUMN IF EXISTS material_id;
ALTER TABLE processos_compra DROP COLUMN IF EXISTS quantidade_necessaria;
ALTER TABLE processos_compra DROP COLUMN IF EXISTS status;
ALTER TABLE processos_compra DROP COLUMN IF EXISTS aprovado_por;
ALTER TABLE processos_compra DROP COLUMN IF EXISTS aprovado_em;

COMMENT ON TABLE  processos_compra              IS 'Card de solicitação de compra. Container de 1 ou mais itens (materiais).';
COMMENT ON TABLE  itens_processo_compra          IS 'Um material dentro de um card de compra, com seu próprio status e cotações';
COMMENT ON COLUMN itens_processo_compra.status   IS 'aguardando_cotacao | pronta_aprovar (>=2 cotações) | aprovado | cancelada';
COMMENT ON COLUMN cotacoes.item_processo_id      IS 'Item específico (material) do card ao qual esta cotação se refere';

CREATE INDEX idx_itens_processo_status   ON itens_processo_compra(status);
CREATE INDEX idx_itens_processo_processo ON itens_processo_compra(processo_id);
CREATE INDEX idx_itens_processo_material ON itens_processo_compra(material_id);
CREATE INDEX idx_cotacoes_item_processo  ON cotacoes(item_processo_id);
