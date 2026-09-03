-- ============================================================
-- 003_dre_consolidado.sql
-- Base "tidy": UMA linha por unidade/mês (empresa_id + mes_referencia).
-- Espelha a aba "DRE_Consolidado" da planilha mestre do JOB.
--
-- GOVERNANÇA:
--   - Valores monetários são NULLABLE de propósito: NULL = "não consta"
--     na fonte. Não preencher com 0 para não fabricar dado (regra do JOB:
--     não inventar número; divergência é sinalizada, não sobrescrita).
--   - Percentuais (margem etc.) NÃO são armazenados: calculados na
--     aplicação/consulta a partir dos valores brutos.
--   - Rastreabilidade obrigatória: fonte + confiabilidade + observacao.
--
-- COMO RODAR: cole no Supabase → SQL Editor → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS dre_consolidado (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id            UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  empresa_id            UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,

  -- Competência: primeiro dia do mês de referência (ex.: 2026-07-01)
  mes_referencia        DATE        NOT NULL,

  -- Linhas do DRE (R$)
  receita_bruta         NUMERIC(15,2),
  impostos              NUMERIC(15,2),
  devolucoes            NUMERIC(15,2),
  receita_liquida       NUMERIC(15,2),
  custo_servico_vendido NUMERIC(15,2),   -- CSV / base da margem de contribuição
  despesas_operacionais NUMERIC(15,2),
  resultado_operacional NUMERIC(15,2),
  despesas_financeiras  NUMERIC(15,2),
  ir_csll               NUMERIC(15,2),
  lucro_liquido         NUMERIC(15,2),
  retirada              NUMERIC(15,2),

  -- Rastreabilidade de cada lançamento
  fonte                 TEXT,           -- ex.: "DRE consolidado Jan–Jul/2026 (PDF)"
  confiabilidade        TEXT,           -- ex.: alta/média/baixa/pendente
  observacao            TEXT,

  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Impede duplicar a mesma unidade/mês (linha de total duplicada era bug real)
  UNIQUE (empresa_id, mes_referencia)
);

CREATE INDEX IF NOT EXISTS idx_dre_cliente_id     ON dre_consolidado (cliente_id);
CREATE INDEX IF NOT EXISTS idx_dre_empresa_id     ON dre_consolidado (empresa_id);
CREATE INDEX IF NOT EXISTS idx_dre_mes_referencia ON dre_consolidado (mes_referencia);

COMMENT ON TABLE  dre_consolidado                IS 'DRE tidy: uma linha por unidade/mês. Espelha DRE_Consolidado da planilha mestre';
COMMENT ON COLUMN dre_consolidado.mes_referencia IS 'Primeiro dia do mês de competência (DATE)';
COMMENT ON COLUMN dre_consolidado.fonte          IS 'Origem do dado (qual PDF/planilha) — rastreabilidade';
COMMENT ON COLUMN dre_consolidado.confiabilidade IS 'Nível de confiança do lançamento (alta/média/baixa/pendente)';
