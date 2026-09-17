-- ============================================================
-- 010_vendas.sql
-- Melhoria 2: módulo "Vendas" — upload de planilhas de vendas (odontologia/
-- ortodontia, implante, clínico geral) por unidade, consolidação mensal e
-- indexação na base de conhecimento do agente de IA (RAG).
--
-- Mesma governança do DRE:
--   - Valores monetários NULLABLE = "não consta" (nunca fabricar/zerar).
--   - Divergência com dado já gravado é SINALIZADA (observacao), nunca
--     sobrescrita silenciosamente.
--   - O binário (.xlsx) fica no Storage; o banco guarda metadados + status
--     (vendas_uploads) e os totais mensais derivados (vendas_consolidado).
--
-- COMO RODAR: cole no Supabase → SQL Editor → Run (primeiro DEV, depois PROD)
-- ============================================================

CREATE TABLE IF NOT EXISTS vendas_uploads (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id     UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  empresa_id     UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  categoria      TEXT        NOT NULL CHECK (categoria IN ('ortodontia', 'clinico_geral', 'implante')),
  enviado_por    UUID        REFERENCES usuarios(id) ON DELETE SET NULL,

  nome_arquivo   TEXT        NOT NULL,
  storage_path   TEXT        NOT NULL,
  tamanho_bytes  BIGINT,
  mes_referencia DATE,                           -- rótulo informativo (o mês real é derivado por linha)

  status         TEXT        NOT NULL DEFAULT 'recebido'
                   CHECK (status IN ('recebido', 'processando', 'processado', 'erro')),
  erro_detalhe   TEXT,

  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendas_uploads_cliente_id ON vendas_uploads (cliente_id);
CREATE INDEX IF NOT EXISTS idx_vendas_uploads_empresa_id ON vendas_uploads (empresa_id);
CREATE INDEX IF NOT EXISTS idx_vendas_uploads_status     ON vendas_uploads (status);

COMMENT ON TABLE  vendas_uploads              IS 'Metadados das planilhas de vendas enviadas pelo portal (o binário fica no Storage)';
COMMENT ON COLUMN vendas_uploads.categoria    IS 'ortodontia | clinico_geral | implante';
COMMENT ON COLUMN vendas_uploads.mes_referencia IS 'Rótulo informativo do envio; a consolidação usa o mês real de cada venda (coluna Pagamento)';

CREATE TABLE IF NOT EXISTS vendas_consolidado (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id           UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  empresa_id           UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  categoria            TEXT        NOT NULL CHECK (categoria IN ('ortodontia', 'clinico_geral', 'implante')),

  mes_referencia       DATE        NOT NULL,     -- primeiro dia do mês (derivado da coluna Pagamento)

  quantidade_vendas    INTEGER     NOT NULL DEFAULT 0,
  valor_original       NUMERIC(15,2),             -- soma da coluna "Original" (NULL = não consta)
  valor_desconto       NUMERIC(15,2),             -- soma da coluna "Valor C. Desconto"
  valor_recebido       NUMERIC(15,2),             -- soma da coluna "Recebido" — fonte da verdade do dashboard
  breakdown_pagamento  JSONB,                     -- ex.: {"PIX": 1234.00, "CARTÃO DÉBITO": 560.00}

  fonte                TEXT,
  observacao           TEXT,

  criado_em            TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (empresa_id, categoria, mes_referencia)
);

CREATE INDEX IF NOT EXISTS idx_vendas_consolidado_cliente_id     ON vendas_consolidado (cliente_id);
CREATE INDEX IF NOT EXISTS idx_vendas_consolidado_empresa_id     ON vendas_consolidado (empresa_id);
CREATE INDEX IF NOT EXISTS idx_vendas_consolidado_mes_referencia ON vendas_consolidado (mes_referencia);

COMMENT ON TABLE  vendas_consolidado                IS 'Vendas tidy: uma linha por unidade/categoria/mês, derivada das planilhas enviadas';
COMMENT ON COLUMN vendas_consolidado.valor_recebido IS 'Valor efetivamente recebido — usado como indicador principal do dashboard';
COMMENT ON COLUMN vendas_consolidado.breakdown_pagamento IS 'Soma do valor recebido por forma de pagamento (TipoPagto), derivado';

-- RAG: os resumos mensais de vendas entram na mesma base_conhecimento do
-- agente de IA (migration 009). categoria distingue os 3 chunks possíveis
-- (ortodontia/clinico_geral/implante) de uma mesma empresa+mês.
ALTER TABLE base_conhecimento ADD COLUMN IF NOT EXISTS categoria TEXT;
COMMENT ON COLUMN base_conhecimento.categoria IS 'Só p/ tipo=vendas_resumo: ortodontia | clinico_geral | implante (NULL p/ chunks de DRE)';

-- ============================================================
-- STORAGE (fazer manualmente no painel, NÃO via SQL):
--   Supabase → Storage → New bucket
--     Name: vendas-uploads
--     Public: OFF (privado — acesso só pela service key do backend)
--   Criar o mesmo bucket no projeto DEV e no PROD.
-- ============================================================
