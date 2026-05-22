-- ============================================================
-- MIGRATION 001 — Departamentos e Usuários
-- Boxer Sistema de Requisição de Materiais
-- ============================================================
-- Esta migration cria a base de autenticação e controle de acesso.
-- Deve ser executada PRIMEIRO, pois outras tabelas dependem de usuarios.
-- ============================================================

-- Extensão para gerar UUIDs automaticamente
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------
-- TABELA: departamentos
-- Registra os departamentos da empresa.
-- Usuários pertencem a um departamento.
-- Requisições são associadas ao departamento do solicitante.
-- ------------------------------------------------------------
CREATE TABLE departamentos (
    id          SERIAL PRIMARY KEY,
    nome        VARCHAR(100) NOT NULL,
    codigo      VARCHAR(20)  NOT NULL UNIQUE,
    ativo       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  departamentos          IS 'Departamentos da empresa Boxer';
COMMENT ON COLUMN departamentos.codigo   IS 'Código curto do departamento, ex: TI, RH, OPERACOES';

-- ------------------------------------------------------------
-- TABELA: usuarios
-- Armazena todos os colaboradores que acessam o sistema.
-- perfil controla o que cada usuário pode ver e fazer:
--   colaborador → solicita materiais
--   operador    → processa e muda status das requisições
--   admin       → gerencia catálogo, usuários e configurações
-- ------------------------------------------------------------
CREATE TABLE usuarios (
    id               SERIAL PRIMARY KEY,
    nome             VARCHAR(150) NOT NULL,
    email            VARCHAR(150) NOT NULL UNIQUE,
    senha_hash       VARCHAR(255) NOT NULL,
    perfil           VARCHAR(20)  NOT NULL DEFAULT 'colaborador'
                         CHECK (perfil IN ('colaborador', 'operador', 'admin')),
    departamento_id  INTEGER      REFERENCES departamentos(id) ON DELETE SET NULL,
    ativo            BOOLEAN      NOT NULL DEFAULT TRUE,
    ultimo_acesso    TIMESTAMPTZ,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  usuarios               IS 'Colaboradores com acesso ao sistema';
COMMENT ON COLUMN usuarios.senha_hash    IS 'Hash bcrypt da senha. Nunca armazenar senha em texto plano.';
COMMENT ON COLUMN usuarios.perfil        IS 'Nível de acesso: colaborador | operador | admin';
COMMENT ON COLUMN usuarios.ativo         IS 'FALSE = usuário desativado, não consegue fazer login';

-- Índices para buscas frequentes
CREATE INDEX idx_usuarios_email         ON usuarios(email);
CREATE INDEX idx_usuarios_departamento  ON usuarios(departamento_id);
CREATE INDEX idx_usuarios_perfil        ON usuarios(perfil);
