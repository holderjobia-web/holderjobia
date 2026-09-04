-- ============================================================
-- 006_societario.sql
-- Estrutura societária: sócios do grupo e sua participação (%) em cada
-- empresa/unidade. Base para cruzar a RETIRADA declarada na DRE com o
-- percentual de cada sócio (distribuição de lucros por sócio).
--
-- GOVERNANÇA:
--   - percentual é NUMERIC(5,2), faixa 0–100 (CHECK). NÃO se força que a
--     soma por empresa dê 100 — dados podem estar incompletos; a divergência
--     (soma ≠ 100) é SINALIZADA na aplicação, nunca "corrigida" no banco.
--   - Sócio é identificado por id (nunca só pelo nome).
--   - Distribuição por sócio é DERIVADA na consulta (retirada × %), nunca
--     gravada — mesma regra do dre_consolidado.
--
-- COMO RODAR: cole no Supabase → SQL Editor → Run (primeiro DEV, depois PROD)
-- ============================================================

-- Sócios (pessoas) de um cliente. Um sócio pode participar de N empresas.
CREATE TABLE IF NOT EXISTS socios (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,

  nome          TEXT        NOT NULL,
  cpf           TEXT,                       -- opcional (identificação fiscal)
  email         TEXT,
  papel         TEXT,                       -- ex.: administrador, investidor
  observacao    TEXT,

  ativo         BOOLEAN     NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_socios_cliente_id ON socios (cliente_id);

-- Participação de um sócio numa empresa (percentual). Uma linha por sócio/empresa.
CREATE TABLE IF NOT EXISTS participacao_societaria (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  empresa_id    UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  socio_id      UUID        NOT NULL REFERENCES socios(id)   ON DELETE CASCADE,

  percentual    NUMERIC(5,2) NOT NULL CHECK (percentual >= 0 AND percentual <= 100),
  papel         TEXT,                       -- ex.: sócio-administrador, cotista
  data_inicio   DATE,                       -- opcional (início da vigência)
  data_fim      DATE,                       -- NULL = vigente
  observacao    TEXT,

  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Um sócio tem uma participação por empresa (histórico de vigência via datas)
  UNIQUE (empresa_id, socio_id)
);

CREATE INDEX IF NOT EXISTS idx_participacao_cliente_id ON participacao_societaria (cliente_id);
CREATE INDEX IF NOT EXISTS idx_participacao_empresa_id ON participacao_societaria (empresa_id);
CREATE INDEX IF NOT EXISTS idx_participacao_socio_id   ON participacao_societaria (socio_id);

COMMENT ON TABLE  socios                       IS 'Sócios (pessoas) de um cliente; participam de N empresas';
COMMENT ON TABLE  participacao_societaria      IS 'Participação (%) de um sócio numa empresa. Base da distribuição de lucros';
COMMENT ON COLUMN participacao_societaria.percentual IS 'Percentual de participação do sócio na empresa (0–100)';
COMMENT ON COLUMN participacao_societaria.data_fim   IS 'NULL = participação vigente; preenchido = encerrada';
