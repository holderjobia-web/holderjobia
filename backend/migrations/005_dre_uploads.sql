-- ============================================================
-- 005_dre_uploads.sql
-- Registro dos arquivos de DRE enviados pelo portal (etapa 5a).
-- O PDF em si fica no Supabase Storage (bucket privado); esta tabela
-- guarda os metadados e o status do processamento.
--
-- Fluxo de status:
--   recebido    → arquivo salvo no Storage, aguardando parsing
--   processando → parsing em andamento (etapa 5b)
--   processado  → dados extraídos e gravados em dre_consolidado
--   erro        → falha no parsing (ver erro_detalhe)
--
-- COMO RODAR: cole no Supabase → SQL Editor → Run (primeiro DEV, depois PROD)
-- ============================================================

CREATE TABLE IF NOT EXISTS dre_uploads (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id     UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  empresa_id     UUID        REFERENCES empresas(id) ON DELETE SET NULL,
  enviado_por    UUID        REFERENCES usuarios(id) ON DELETE SET NULL,

  nome_arquivo   TEXT        NOT NULL,           -- nome original do arquivo
  storage_path   TEXT        NOT NULL,           -- caminho no bucket do Storage
  tamanho_bytes  BIGINT,
  mes_referencia DATE,                           -- competência (opcional; parsing pode preencher)

  status         TEXT        NOT NULL DEFAULT 'recebido'
                   CHECK (status IN ('recebido', 'processando', 'processado', 'erro')),
  erro_detalhe   TEXT,

  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dre_uploads_cliente_id ON dre_uploads (cliente_id);
CREATE INDEX IF NOT EXISTS idx_dre_uploads_empresa_id ON dre_uploads (empresa_id);
CREATE INDEX IF NOT EXISTS idx_dre_uploads_status     ON dre_uploads (status);

COMMENT ON TABLE  dre_uploads              IS 'Metadados dos PDFs de DRE enviados pelo portal (o binário fica no Storage)';
COMMENT ON COLUMN dre_uploads.storage_path IS 'Caminho do arquivo no bucket privado do Supabase Storage';
COMMENT ON COLUMN dre_uploads.status       IS 'recebido | processando | processado | erro';

-- ============================================================
-- STORAGE (fazer manualmente no painel, NÃO via SQL):
--   Supabase → Storage → New bucket
--     Name: dre-uploads
--     Public: OFF (privado — acesso só pela service key do backend)
--   Criar o mesmo bucket no projeto DEV e no PROD.
-- ============================================================
