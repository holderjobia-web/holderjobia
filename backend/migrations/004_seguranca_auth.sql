-- ============================================================
-- 004_seguranca_auth.sql
-- Colunas de segurança da autenticação (espelha o padrão da orbitta-platform).
--   - senha_temporaria: força troca de senha no primeiro acesso.
--   - login_tentativas / login_bloqueado_ate: account lockout persistido
--     contra brute force (complementa o rate limit por IP em memória).
--
-- COMO RODAR: cole no Supabase → SQL Editor → Run (primeiro no DEV, depois no PROD)
-- ============================================================

-- Usuários do portal
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS senha_temporaria    BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS login_tentativas    INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS login_bloqueado_ate TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN usuarios.senha_temporaria    IS 'true = usuário precisa trocar a senha no próximo login';
COMMENT ON COLUMN usuarios.login_tentativas    IS 'Tentativas de login com senha incorreta (reseta no sucesso ou fim do bloqueio)';
COMMENT ON COLUMN usuarios.login_bloqueado_ate IS 'Conta bloqueada até este instante por excesso de tentativas. NULL = liberada';

-- Super admins do SaaS (primeiro acesso também troca senha)
ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS senha_temporaria BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN admins.senha_temporaria IS 'true = admin precisa trocar a senha no próximo login';
