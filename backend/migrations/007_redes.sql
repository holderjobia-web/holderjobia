-- ============================================================
-- 007_redes.sql
-- Redes / negócios de um cliente. Um dono (cliente) pode ter VÁRIAS redes
-- distintas (ex.: rede de clínicas odontológicas E rede de pizzarias). Cada
-- empresa/unidade pertence a uma rede. A "visão de grupo" passa a consolidar
-- por rede (com opção "Todos" = consolidado geral do dono).
--
-- GOVERNANÇA:
--   - rede_id em empresas é OPCIONAL (empresa avulsa = sem rede).
--   - ON DELETE SET NULL: apagar a rede não apaga as empresas, só desvincula.
--   - Rede é identificada por id (nunca só pelo nome).
--
-- COMO RODAR: cole no Supabase → SQL Editor → Run (primeiro DEV, depois PROD)
-- ============================================================

-- Rede / negócio (agrupa empresas de um cliente por marca/segmento)
CREATE TABLE IF NOT EXISTS redes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,

  nome          TEXT        NOT NULL,      -- ex.: "Rede Odonto", "Pizzaria X"
  segmento      TEXT,                      -- ex.: odontologia, alimentação
  observacao    TEXT,

  ativo         BOOLEAN     NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Nome único por cliente (evita duas redes com o mesmo nome no mesmo dono)
  UNIQUE (cliente_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_redes_cliente_id ON redes (cliente_id);

-- Vincula a empresa a uma rede (opcional). SET NULL ao apagar a rede.
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS rede_id UUID REFERENCES redes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_empresas_rede_id ON empresas (rede_id);

COMMENT ON TABLE  redes            IS 'Rede/negócio de um cliente; agrupa empresas por marca/segmento';
COMMENT ON COLUMN empresas.rede_id IS 'Rede a que a empresa pertence (NULL = empresa avulsa, sem rede)';
