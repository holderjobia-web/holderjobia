-- ============================================================
-- 008_orcamento.sql
-- Orçamento (metas previstas) por EMPRESA e MÊS. O dono cadastra quanto espera
-- de receita líquida, lucro líquido e retirada em cada mês; o sistema compara
-- com o REALIZADO (dre_consolidado) e mostra a variação (derivada na consulta).
--
-- GOVERNANÇA:
--   - Previsto é o que o dono digita (NUNCA fabricado). Valores NULLABLE:
--     NULL = não consta (não assumir 0).
--   - Realizado vem do DRE; variação é DERIVADA na consulta, nunca gravada.
--   - 1 linha por (empresa, mês) — UNIQUE evita duplicar orçamento do mês.
--   - Começo enxuto (3 linhas de KPI); novas linhas podem ser adicionadas depois.
--
-- COMO RODAR: cole no Supabase → SQL Editor → Run (primeiro DEV, depois PROD)
-- ============================================================

CREATE TABLE IF NOT EXISTS orcamento (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  empresa_id       UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,

  mes_referencia   DATE        NOT NULL,   -- 1º dia do mês (AAAA-MM-01)

  -- Metas previstas (NULLABLE = não consta). Começo enxuto com os 3 KPIs.
  receita_liquida  NUMERIC(14,2),
  lucro_liquido    NUMERIC(14,2),
  retirada         NUMERIC(14,2),

  observacao       TEXT,

  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Um orçamento por empresa e mês
  UNIQUE (empresa_id, mes_referencia)
);

CREATE INDEX IF NOT EXISTS idx_orcamento_cliente_id ON orcamento (cliente_id);
CREATE INDEX IF NOT EXISTS idx_orcamento_empresa_id ON orcamento (empresa_id);

COMMENT ON TABLE  orcamento                IS 'Metas previstas por empresa/mês; comparadas com o realizado (dre_consolidado)';
COMMENT ON COLUMN orcamento.mes_referencia IS '1º dia do mês de referência (AAAA-MM-01)';
COMMENT ON COLUMN orcamento.receita_liquida IS 'Receita líquida prevista (NULL = não consta, não assumir 0)';
COMMENT ON COLUMN orcamento.lucro_liquido   IS 'Lucro líquido previsto (NULL = não consta)';
COMMENT ON COLUMN orcamento.retirada        IS 'Retirada prevista (NULL = não consta)';
