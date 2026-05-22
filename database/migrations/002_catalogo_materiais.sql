-- ============================================================
-- MIGRATION 002 — Catálogo de Materiais
-- Boxer Sistema de Requisição de Materiais
-- ============================================================
-- Esta migration cria o catálogo: categorias, materiais e
-- controle de estoque com indicador de nível visual.
-- Depende da migration 001 (não usa chaves de usuarios aqui,
-- mas segue a sequência obrigatória de execução).
-- ============================================================

-- ------------------------------------------------------------
-- TABELA: categorias
-- Agrupa os materiais por tipo.
-- O campo icone guarda o nome do ícone (ex: do Lucide React)
-- para exibir no frontend sem precisar voltar ao banco.
-- ------------------------------------------------------------
CREATE TABLE categorias (
    id          SERIAL PRIMARY KEY,
    nome        VARCHAR(100) NOT NULL UNIQUE,
    icone       VARCHAR(50),           -- nome do ícone, ex: "package", "monitor", "trash-2"
    ativo       BOOLEAN      NOT NULL DEFAULT TRUE,
    ordem       INTEGER      NOT NULL DEFAULT 0,  -- controla a ordem de exibição no catálogo
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  categorias        IS 'Categorias do catálogo de materiais';
COMMENT ON COLUMN categorias.icone  IS 'Nome do ícone Lucide React para exibição no frontend';
COMMENT ON COLUMN categorias.ordem  IS 'Ordem de exibição crescente (0 = primeiro)';

-- ------------------------------------------------------------
-- TABELA: materiais
-- Cada linha é um item do catálogo que pode ser solicitado.
-- unidade define como o item é contado (unidade, caixa, resma…)
-- ------------------------------------------------------------
CREATE TABLE materiais (
    id           SERIAL PRIMARY KEY,
    codigo       VARCHAR(30)  NOT NULL UNIQUE,  -- código interno do material, ex: PAP-001
    descricao    VARCHAR(255) NOT NULL,
    categoria_id INTEGER      NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
    unidade      VARCHAR(20)  NOT NULL DEFAULT 'un',  -- un, cx, resma, litro, kg, par…
    ativo        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  materiais             IS 'Itens disponíveis para requisição no catálogo';
COMMENT ON COLUMN materiais.codigo      IS 'Código único do material, ex: PAP-001, INF-003';
COMMENT ON COLUMN materiais.unidade     IS 'Unidade de medida: un, cx, resma, litro, kg, par, rolo';

CREATE INDEX idx_materiais_categoria ON materiais(categoria_id);
CREATE INDEX idx_materiais_codigo    ON materiais(codigo);

-- Busca por texto na descrição (índice de texto completo)
CREATE INDEX idx_materiais_descricao_busca ON materiais USING gin(to_tsvector('portuguese', descricao));

-- ------------------------------------------------------------
-- TABELA: estoques
-- Relacionamento 1-para-1 com materiais.
-- nivel_minimo define o ponto de alerta:
--   quantidade > nivel_minimo × 2  → verde  (disponível)
--   quantidade > 0 e <= nivel_minimo  → amarelo (baixo estoque)
--   quantidade = 0                 → vermelho (sem estoque)
-- A lógica de cor fica no backend, não no banco.
-- ------------------------------------------------------------
CREATE TABLE estoques (
    id           SERIAL PRIMARY KEY,
    material_id  INTEGER     NOT NULL UNIQUE REFERENCES materiais(id) ON DELETE CASCADE,
    quantidade   INTEGER     NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
    nivel_minimo INTEGER     NOT NULL DEFAULT 5 CHECK (nivel_minimo >= 0),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  estoques               IS 'Controle de quantidade em estoque por material';
COMMENT ON COLUMN estoques.nivel_minimo  IS 'Abaixo deste valor o badge vira amarelo. Zero = vermelho.';
COMMENT ON COLUMN estoques.quantidade    IS 'Quantidade atual. Nunca negativo (constraint CHECK).';
