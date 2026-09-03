# Migrations — holderjob

SQL versionado do banco Supabase (PostgreSQL). Não há runner automático: cada arquivo é aplicado **manualmente** no Supabase → **SQL Editor → Run**, na ordem numérica.

## Ordem de aplicação

| #   | Arquivo                        | O que cria                                              |
|-----|--------------------------------|---------------------------------------------------------|
| 001 | `001_clientes_e_acessos.sql`   | `admins` (super admin do SaaS), `clientes` (tenant), `usuarios` (portal) |
| 002 | `002_empresas.sql`             | `empresas` (unidades do cliente, com código único)      |
| 003 | `003_dre_consolidado.sql`      | `dre_consolidado` (base tidy: 1 linha por unidade/mês)  |
| 004 | `004_seguranca_auth.sql`       | colunas de segurança: senha temporária + account lockout |

## Convenções

- PK `UUID` com `gen_random_uuid()`.
- `criado_em` / `atualizado_em` em `TIMESTAMPTZ DEFAULT now()`.
- Tudo idempotente (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`).
- Todo dado de domínio carrega `cliente_id` (isolamento multi-tenant).
- Valores monetários **NULLABLE** de propósito: `NULL` = "não consta na fonte" (não fabricar 0).
- Isolamento por tenant é feito **na aplicação** (filtro por `cliente_id`), seguindo o padrão da orbitta-platform. RLS no Supabase fica como decisão futura.

## Próximas migrations (roadmap)

- `004_participacao_societaria.sql` — cruzamento retirada declarada × DRE × % participação.
- Storage bucket para PDFs de DRE/notas.
- `pgvector` para RAG do agente de IA (fase futura).
