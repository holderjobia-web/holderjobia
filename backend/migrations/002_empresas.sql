-- ============================================================
-- 002_empresas.sql
-- Cadastro das empresas/unidades de cada cliente (tenant).
-- Espelha a aba "Cadastro_Empresas" da planilha mestre do JOB.
--
-- GOVERNANÇA: cada unidade tem um CÓDIGO ÚNICO por cliente.
-- Nunca identificar unidade por nome (casos reais de duplicidade:
-- "Lapa de Baixo = Lapa II", "MAIRIPORA" vs "MAIRIPORÃ").
--
-- COMO RODAR: cole no Supabase → SQL Editor → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS empresas (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id                UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,

  -- Identidade da unidade
  codigo                    TEXT        NOT NULL,              -- código único por cliente
  nome_razao_social         TEXT        NOT NULL,
  cnpj                      TEXT,
  segmento                  TEXT,

  -- Participação societária do dono
  papel_socio               TEXT,
  percentual_participacao   NUMERIC(5,2),                      -- ex.: 100.00, 90.00

  -- Acompanhamento
  ativa                     BOOLEAN     NOT NULL DEFAULT true,
  prioridade_acompanhamento TEXT,                              -- ex.: alta/média/baixa
  status_maturidade         TEXT,                              -- ex.: pre_operacional, recem_inaugurada, madura
  data_inauguracao          DATE,

  -- Rastreabilidade / notas
  observacao                TEXT,

  criado_em                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Código único DENTRO de cada cliente
  UNIQUE (cliente_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_empresas_cliente_id ON empresas (cliente_id);
CREATE INDEX IF NOT EXISTS idx_empresas_cnpj       ON empresas (cnpj);

COMMENT ON TABLE  empresas                    IS 'Empresas/unidades de um cliente. Espelha Cadastro_Empresas da planilha mestre';
COMMENT ON COLUMN empresas.codigo             IS 'Código único da unidade por cliente — identidade estável (NUNCA usar o nome)';
COMMENT ON COLUMN empresas.percentual_participacao IS 'Percentual de participação do dono na unidade (0–100)';
COMMENT ON COLUMN empresas.status_maturidade  IS 'Estágio: pré-operacional, recém-inaugurada, madura, etc.';
