-- ============================================================
-- 011_vendas_categoria_auto.sql
-- Melhoria: 1 arquivo mensal único com TODAS as vendas da unidade; a categoria
-- do procedimento passa a ser detectada automaticamente por linha (sufixo da
-- coluna "Dentista": ORTO / C GERAL / IMPLANTE / ENDO / RADIOLOGIA).
--
-- Mudanças:
--   1. Novas categorias encontradas nos dados reais: endodontia, radiologia.
--      + 'nao_identificado' para linhas sem procedimento reconhecível — a regra
--      do projeto é sinalizar, nunca descartar dado legítimo em silêncio.
--   2. vendas_uploads.categoria vira NULLABLE: um envio agora pode conter
--      várias categorias (NULL = arquivo consolidado multi-categoria). Uploads
--      antigos (1 arquivo por categoria) seguem com o valor preenchido.
--
-- COMO RODAR: cole no Supabase → SQL Editor → Run (primeiro DEV, depois PROD)
-- ============================================================

ALTER TABLE vendas_uploads DROP CONSTRAINT IF EXISTS vendas_uploads_categoria_check;
ALTER TABLE vendas_uploads ALTER COLUMN categoria DROP NOT NULL;
ALTER TABLE vendas_uploads ADD CONSTRAINT vendas_uploads_categoria_check
  CHECK (categoria IS NULL OR categoria IN (
    'ortodontia', 'clinico_geral', 'implante', 'endodontia', 'radiologia', 'nao_identificado'
  ));

ALTER TABLE vendas_consolidado DROP CONSTRAINT IF EXISTS vendas_consolidado_categoria_check;
ALTER TABLE vendas_consolidado ADD CONSTRAINT vendas_consolidado_categoria_check
  CHECK (categoria IN (
    'ortodontia', 'clinico_geral', 'implante', 'endodontia', 'radiologia', 'nao_identificado'
  ));

COMMENT ON COLUMN vendas_uploads.categoria IS
  'NULL = arquivo mensal consolidado (categoria detectada por linha). Preenchido = envio antigo, 1 arquivo por categoria';
COMMENT ON COLUMN vendas_consolidado.categoria IS
  'ortodontia | clinico_geral | implante | endodontia | radiologia | nao_identificado';
COMMENT ON COLUMN base_conhecimento.categoria IS
  'Só p/ tipo=vendas_resumo: ortodontia | clinico_geral | implante | endodontia | radiologia | nao_identificado (NULL p/ chunks de DRE)';
