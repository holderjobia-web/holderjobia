-- ============================================================
-- 012_socios_dados_cadastrais.sql
-- Melhoria: o módulo de sócios vira um cadastro completo. Além de nome/CPF/
-- e-mail/papel, passa a guardar endereço e CRO (registro do conselho de
-- odontologia — vários sócios do grupo são dentistas atuantes nas unidades).
--
-- Campos opcionais de propósito: sócio pode ser cadastrado só com o nome e ter
-- o restante completado depois (NULL = "não informado", nunca inventar dado).
--
-- COMO RODAR: cole no Supabase → SQL Editor → Run (primeiro DEV, depois PROD)
-- ============================================================

ALTER TABLE socios ADD COLUMN IF NOT EXISTS endereco TEXT;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS cro      TEXT;

COMMENT ON COLUMN socios.endereco IS 'Endereço completo do sócio (opcional)';
COMMENT ON COLUMN socios.cro      IS 'Registro no Conselho Regional de Odontologia (opcional)';
