-- ============================================================
-- 014_acervos_controle_mensal.sql
-- Acervos: nova categoria 'controle_mensal' (Controle mensal de contas pagas).
--
-- COMO RODAR: cole no Supabase → SQL Editor → Run (primeiro DEV, depois PROD)
-- ============================================================

ALTER TABLE acervos_uploads DROP CONSTRAINT IF EXISTS acervos_uploads_categoria_check;
ALTER TABLE acervos_uploads ADD CONSTRAINT acervos_uploads_categoria_check
  CHECK (categoria IN (
    'contrato', 'planilha_obra', 'fotos', 'plantas', 'controle_mensal', 'documentos_gerais'
  ));
