-- ============================================================
-- 018 — Recuperação de senha por e-mail
-- ============================================================
-- Cada pedido de "Esqueci minha senha" gera um token de uso único,
-- válido por 30 minutos. Guardamos só o hash (SHA-256) do token —
-- o token em si vai apenas no link do e-mail.

CREATE TABLE IF NOT EXISTS senha_reset_tokens (
  id          SERIAL PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash  CHAR(64) NOT NULL UNIQUE,
  expira_em   TIMESTAMPTZ NOT NULL,
  usado_em    TIMESTAMPTZ,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_senha_reset_usuario ON senha_reset_tokens (usuario_id, created_at DESC);

-- Sem acesso pela API pública do Supabase (o backend conecta direto no Postgres)
ALTER TABLE senha_reset_tokens ENABLE ROW LEVEL SECURITY;
