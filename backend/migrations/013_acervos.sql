-- ============================================================
-- 013_acervos.sql
-- Módulo "Acervos" — repositório de arquivos por unidade (Contrato,
-- Planilha de obra, Fotos, Plantas, Documentos em geral). Multi-extensão,
-- upload em lote. Texto extraível (PDF/XLSX/CSV/TXT) alimenta a base de
-- conhecimento do agente de IA (RAG); os demais tipos ficam só guardados.
--
-- Diferente do DRE/Vendas: não há "processar" nem tabela _consolidado — é
-- puro repositório de arquivo + indexação best-effort no upload.
--
-- COMO RODAR: cole no Supabase → SQL Editor → Run (primeiro DEV, depois PROD)
-- ============================================================

CREATE TABLE IF NOT EXISTS acervos_uploads (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id     UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  empresa_id     UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  categoria      TEXT        NOT NULL CHECK (categoria IN (
                   'contrato', 'planilha_obra', 'fotos', 'plantas', 'documentos_gerais'
                 )),
  enviado_por    UUID        REFERENCES usuarios(id) ON DELETE SET NULL,

  nome_arquivo   TEXT        NOT NULL,
  extensao       TEXT,                           -- minúscula, sem ponto (ex.: 'pdf'); guia a pré-visualização
  storage_path   TEXT        NOT NULL,
  tamanho_bytes  BIGINT,
  descricao      TEXT,                           -- anotação livre e opcional do usuário

  status         TEXT        NOT NULL DEFAULT 'recebido'
                   CHECK (status IN ('recebido', 'indexado', 'sem_texto', 'erro')),
  erro_detalhe   TEXT,

  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acervos_uploads_cliente  ON acervos_uploads(cliente_id);
CREATE INDEX IF NOT EXISTS idx_acervos_uploads_empresa  ON acervos_uploads(empresa_id);
CREATE INDEX IF NOT EXISTS idx_acervos_uploads_categoria ON acervos_uploads(categoria);

COMMENT ON TABLE acervos_uploads IS 'Repositório de arquivos por unidade (contrato/planilha de obra/fotos/plantas/documentos gerais)';
COMMENT ON COLUMN acervos_uploads.status IS 'recebido=aguardando indexação; indexado=texto extraído e no RAG; sem_texto=tipo sem parser (foto/CAD/etc, não é erro); erro=falha ao indexar';
