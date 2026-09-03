-- ============================================================
-- 001_clientes_e_acessos.sql
-- Fundação multi-tenant do holderjob.
--   - admins:   super admins do SaaS (holderjob ADMIN) que criam
--               clientes e liberam acesso à ferramenta.
--   - clientes: o TENANT. Cada cliente administra suas empresas.
--               (JOB entra como o primeiro cliente.)
--   - usuarios: usuários do portal, vinculados a UM cliente.
--
-- COMO RODAR: cole no Supabase → SQL Editor → Run
-- ============================================================

-- 1. Super admins do SaaS (auth separada — JWT_ADMIN_SECRET)
CREATE TABLE IF NOT EXISTS admins (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT        NOT NULL,
  email         TEXT        UNIQUE NOT NULL,
  senha_hash    TEXT        NOT NULL,
  ativo         BOOLEAN     NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_acesso TIMESTAMPTZ
);

-- 2. Clientes = tenants. Todo dado de domínio é isolado por cliente_id.
CREATE TABLE IF NOT EXISTS clientes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT        NOT NULL,
  cnpj          TEXT,
  ativo         BOOLEAN     NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_acesso TIMESTAMPTZ
);

-- 3. Usuários do portal (auth — JWT_SECRET), sempre vinculados a um cliente
CREATE TABLE IF NOT EXISTS usuarios (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nome          TEXT        NOT NULL,
  email         TEXT        UNIQUE NOT NULL,
  senha_hash    TEXT        NOT NULL,
  perfil        TEXT        NOT NULL DEFAULT 'admin_cliente'
                  CHECK (perfil IN ('admin_cliente', 'operador')),
  ativo         BOOLEAN     NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_acesso TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_usuarios_cliente_id ON usuarios (cliente_id);

COMMENT ON TABLE admins   IS 'Super admins do SaaS (holderjob ADMIN): criam clientes e liberam acessos';
COMMENT ON TABLE clientes IS 'Tenant. Cada cliente administra suas próprias empresas. JOB = 1º cliente';
COMMENT ON TABLE usuarios IS 'Usuários do portal, vinculados a um cliente (tenant)';
COMMENT ON COLUMN usuarios.perfil IS 'admin_cliente = gerencia tudo do cliente; operador = acesso restrito';

-- Isolamento por tenant: por ora filtrado por cliente_id na aplicação
-- (mesmo padrão da orbitta-platform). RLS no Supabase fica como decisão futura.
