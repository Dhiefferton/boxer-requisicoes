-- ============================================================
-- SEED — Dados Iniciais
-- Boxer Sistema de Requisição de Materiais
-- ============================================================
-- Popula o banco com dados de exemplo para desenvolvimento.
-- Execute APÓS todas as migrations (001 a 004).
--
-- IMPORTANTE: Este seed é só para desenvolvimento local.
-- Em produção, use dados reais da Boxer.
-- ============================================================

-- ------------------------------------------------------------
-- Departamentos
-- ------------------------------------------------------------
INSERT INTO departamentos (nome, codigo) VALUES
    ('Tecnologia da Informação',  'TI'),
    ('Recursos Humanos',          'RH'),
    ('Financeiro',                'FIN'),
    ('Operações',                 'OPS'),
    ('Comercial',                 'COM'),
    ('Marketing',                 'MKT'),
    ('Logística',                 'LOG'),
    ('Administrativo',            'ADM');

-- ------------------------------------------------------------
-- Categorias (com ícones do Lucide React)
-- ------------------------------------------------------------
INSERT INTO categorias (nome, icone, ordem) VALUES
    ('Papelaria',      'pencil',       1),
    ('Informática',    'monitor',      2),
    ('Limpeza',        'trash-2',      3),
    ('Alimentação',    'coffee',       4),
    ('Insumos',        'box',          5),
    ('Partes e Peças', 'wrench',       6);

-- ------------------------------------------------------------
-- Materiais (com código no formato CATEGORIA-NÚMERO)
-- ------------------------------------------------------------
INSERT INTO materiais (codigo, descricao, categoria_id, unidade) VALUES
    -- Papelaria (categoria_id = 1)
    ('PAP-001', 'Caneta esferográfica azul',        1, 'un'),
    ('PAP-002', 'Caneta esferográfica preta',        1, 'un'),
    ('PAP-003', 'Lápis grafite nº 2',                1, 'un'),
    ('PAP-004', 'Borracha branca grande',             1, 'un'),
    ('PAP-005', 'Papel A4 75g — resma 500 folhas',   1, 'resma'),
    ('PAP-006', 'Papel A4 90g — resma 500 folhas',   1, 'resma'),
    ('PAP-007', 'Grampeador pequeno',                 1, 'un'),
    ('PAP-008', 'Grampo 26/6 — caixa 5000 un',       1, 'cx'),
    ('PAP-009', 'Clipe metálico nº 2 — caixa 100',   1, 'cx'),
    ('PAP-010', 'Post-it 76x76mm — bloco 100 folhas',1, 'un'),
    ('PAP-011', 'Pasta AZ ofício',                    1, 'un'),
    ('PAP-012', 'Fita adesiva transparente 12mm',     1, 'rolo'),
    ('PAP-013', 'Envelopes brancos A4 — pacote 50',   1, 'pct'),
    ('PAP-014', 'Marca-texto amarelo',                1, 'un'),

    -- Informática (categoria_id = 2)
    ('INF-001', 'Mouse óptico USB',                   2, 'un'),
    ('INF-002', 'Teclado USB ABNT2',                  2, 'un'),
    ('INF-003', 'Cabo USB-A para USB-C 1m',           2, 'un'),
    ('INF-004', 'Cabo HDMI 2m',                       2, 'un'),
    ('INF-005', 'Pendrive 32GB USB 3.0',              2, 'un'),
    ('INF-006', 'Pilha AA — pacote 4 un',             2, 'pct'),
    ('INF-007', 'Pilha AAA — pacote 4 un',            2, 'pct'),
    ('INF-008', 'Cartucho de tinta preta HP 664',     2, 'un'),
    ('INF-009', 'Cartucho de tinta colorido HP 664',  2, 'un'),
    ('INF-010', 'Mousepad simples',                    2, 'un'),

    -- Limpeza (categoria_id = 3)
    ('LIM-001', 'Detergente líquido 500ml',            3, 'un'),
    ('LIM-002', 'Desinfetante 1L',                     3, 'un'),
    ('LIM-003', 'Papel toalha folha dupla — rolo',     3, 'rolo'),
    ('LIM-004', 'Papel higiênico folha dupla — rolo',  3, 'rolo'),
    ('LIM-005', 'Sabonete líquido refil 800ml',        3, 'un'),
    ('LIM-006', 'Álcool gel 70% 500ml',               3, 'un'),
    ('LIM-007', 'Saco de lixo 100L — pacote 10',      3, 'pct'),
    ('LIM-008', 'Saco de lixo 20L — pacote 20',       3, 'pct'),

    -- Alimentação (categoria_id = 4)
    ('ALI-001', 'Café em pó 500g',                    4, 'un'),
    ('ALI-002', 'Açúcar refinado 1kg',                4, 'un'),
    ('ALI-003', 'Adoçante líquido 100ml',             4, 'un'),
    ('ALI-004', 'Água mineral 500ml — pacote 12',     4, 'pct'),
    ('ALI-005', 'Copo descartável 200ml — pacote 100',4, 'pct'),
    ('ALI-006', 'Colher descartável — pacote 100',    4, 'pct'),

    -- Insumos (categoria_id = 5)
    ('INS-001', 'Caixinha de papelão pequena',         5, 'un'),
    ('INS-002', 'Caixinha de papelão média',           5, 'un'),
    ('INS-003', 'Plástico bolha — rolo 1m',            5, 'rolo'),
    ('INS-004', 'Fitilho para embalagem 50m',          5, 'rolo'),
    ('INS-005', 'Etiqueta adesiva A4 — pacote 100',    5, 'pct'),

    -- Partes e Peças (categoria_id = 6)
    ('PEC-001', 'Tomada universal 10A',                6, 'un'),
    ('PEC-002', 'Extensão elétrica 3 tomadas 2m',      6, 'un'),
    ('PEC-003', 'Fita isolante 19mm 10m',              6, 'rolo'),
    ('PEC-004', 'Lâmpada LED 9W E27 luz branca',       6, 'un'),
    ('PEC-005', 'Parafuso phillips M4 — caixa 50',     6, 'cx');

-- ------------------------------------------------------------
-- Estoques iniciais para todos os materiais
-- Usamos subquery para pegar todos os ids automaticamente
-- ------------------------------------------------------------
INSERT INTO estoques (material_id, quantidade, nivel_minimo)
SELECT id,
    -- Quantidade inicial aleatória entre 0 e 50 para simular cenários
    CASE
        WHEN id % 7 = 0 THEN 0   -- sem estoque (vermelho)
        WHEN id % 5 = 0 THEN 3   -- baixo estoque (amarelo)
        ELSE (10 + (id * 3) % 40) -- estoque normal (verde)
    END,
    5  -- nivel_minimo padrão
FROM materiais;

-- ------------------------------------------------------------
-- Usuário administrador inicial
-- Senha: boxer@2025 (hash bcrypt gerado externamente)
-- IMPORTANTE: Trocar a senha no primeiro acesso em produção!
-- O hash abaixo corresponde a: boxer@2025
-- ------------------------------------------------------------
INSERT INTO usuarios (nome, email, senha_hash, perfil, departamento_id) VALUES
    (
        'Administrador Boxer',
        'admin@boxer.com.br',
        '$2b$10$YourHashHere.ReplaceThisWithRealBcryptHash.ForSecurity',
        'admin',
        (SELECT id FROM departamentos WHERE codigo = 'TI')
    );

-- Usuários de exemplo para desenvolvimento
INSERT INTO usuarios (nome, email, senha_hash, perfil, departamento_id) VALUES
    (
        'Carlos Operador',
        'operador@boxer.com.br',
        '$2b$10$YourHashHere.ReplaceThisWithRealBcryptHash.ForSecurity',
        'operador',
        (SELECT id FROM departamentos WHERE codigo = 'OPS')
    ),
    (
        'Ana Colaboradora',
        'colaborador@boxer.com.br',
        '$2b$10$YourHashHere.ReplaceThisWithRealBcryptHash.ForSecurity',
        'colaborador',
        (SELECT id FROM departamentos WHERE codigo = 'ADM')
    );

-- ============================================================
-- NOTA SOBRE AS SENHAS:
-- Os hashes acima são placeholder. O backend vai gerar hashes
-- reais com bcrypt ao criar/redefinir senhas.
-- Para desenvolvimento, use o script generate-seed-passwords.js
-- que vamos criar junto com o backend.
-- ============================================================
