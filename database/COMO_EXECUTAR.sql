-- ============================================================
-- COMO EXECUTAR O BANCO DE DADOS — PASSO A PASSO
-- Boxer Sistema de Requisição de Materiais
-- ============================================================
--
-- PRÉ-REQUISITO: PostgreSQL instalado e rodando.
-- Se não tiver, instale com:
--   macOS:  brew install postgresql
--   Linux:  sudo apt install postgresql postgresql-contrib
--   Windows: baixe em https://www.postgresql.org/download/
--
-- ============================================================
-- PASSO 1 — Criar o banco de dados
-- ============================================================
--
--   psql -U postgres -c "CREATE DATABASE boxer_requisicoes;"
--
-- ============================================================
-- PASSO 2 — Executar as migrations em ordem
-- ============================================================
--
-- Sempre execute na ordem numérica. Cada migration depende da anterior.
--
--   psql -U postgres -d boxer_requisicoes -f migrations/001_departamentos_usuarios.sql
--   psql -U postgres -d boxer_requisicoes -f migrations/002_catalogo_materiais.sql
--   psql -U postgres -d boxer_requisicoes -f migrations/003_requisicoes.sql
--   psql -U postgres -d boxer_requisicoes -f migrations/004_logs.sql
--
-- ============================================================
-- PASSO 3 — Carregar dados iniciais (só para desenvolvimento)
-- ============================================================
--
--   psql -U postgres -d boxer_requisicoes -f seeds/001_dados_iniciais.sql
--
-- ============================================================
-- PASSO 4 — Verificar se tudo foi criado
-- ============================================================
--
--   psql -U postgres -d boxer_requisicoes -c "\dt"
--
-- Deve listar as tabelas:
--   categorias, departamentos, estoques, historico_status,
--   itens_requisicao, logs, materiais, requisicoes, usuarios
--
-- ============================================================
-- ROLLBACK — Como desfazer tudo (CUIDADO: apaga dados!)
-- ============================================================
--
--   psql -U postgres -c "DROP DATABASE boxer_requisicoes;"
--
-- Para recriar do zero, repita os passos 1 a 3.
--
-- ============================================================
-- ROLLBACK PARCIAL — Desfazer só a última migration
-- ============================================================
--
-- Execute o script DROP correspondente na pasta migrations/,
-- ou use os comandos abaixo (nesta ordem reversa):
--
--   DROP TABLE logs;
--   DROP TABLE historico_status;
--   DROP TABLE itens_requisicao;
--   DROP TABLE requisicoes;
--   DROP TABLE estoques;
--   DROP TABLE materiais;
--   DROP TABLE categorias;
--   DROP TABLE usuarios;
--   DROP TABLE departamentos;
--
-- ============================================================

-- ============================================================
-- VIEWS ÚTEIS PARA CONSULTA
-- ============================================================
-- Estas views facilitam as consultas do backend.
-- Execute após as migrations.
-- ============================================================

-- View: material com estoque e categoria (o que o catálogo usa)
CREATE OR REPLACE VIEW vw_catalogo AS
SELECT
    m.id,
    m.codigo,
    m.descricao,
    m.unidade,
    m.ativo,
    c.nome    AS categoria_nome,
    c.icone   AS categoria_icone,
    c.id      AS categoria_id,
    e.quantidade,
    e.nivel_minimo,
    -- Indicador visual calculado diretamente no banco
    CASE
        WHEN e.quantidade = 0                        THEN 'sem_estoque'
        WHEN e.quantidade <= e.nivel_minimo          THEN 'baixo_estoque'
        ELSE                                              'disponivel'
    END AS status_estoque
FROM materiais m
JOIN categorias c ON c.id = m.categoria_id
LEFT JOIN estoques e ON e.material_id = m.id
WHERE m.ativo = TRUE;

COMMENT ON VIEW vw_catalogo IS 'Catálogo completo com estoque e status visual para o frontend';

-- View: requisições com nome do solicitante e departamento
CREATE OR REPLACE VIEW vw_requisicoes AS
SELECT
    r.id,
    r.status,
    r.data_necessidade,
    r.observacoes,
    r.created_at,
    r.updated_at,
    u.nome       AS solicitante_nome,
    u.email      AS solicitante_email,
    d.nome       AS departamento_nome,
    d.codigo     AS departamento_codigo,
    -- Conta quantos itens tem na requisição
    (SELECT COUNT(*) FROM itens_requisicao ir WHERE ir.requisicao_id = r.id) AS total_itens
FROM requisicoes r
JOIN usuarios u    ON u.id = r.usuario_id
LEFT JOIN departamentos d ON d.id = r.departamento_id;

COMMENT ON VIEW vw_requisicoes IS 'Requisições com dados do solicitante e contagem de itens';
