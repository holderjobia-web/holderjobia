-- ============================================================
-- 009_agente_ia.sql
-- Etapa 7: Agente de IA (RAG). Base de conhecimento vetorial usada pelo
-- agente para responder perguntas sobre as empresas do cliente.
--
-- GOVERNANÇA:
--   - Conteúdo indexado é DERIVADO de dado já validado (dre_consolidado,
--     texto bruto do PDF, orçamento, distribuição societária) — o agente
--     NUNCA fabrica número; ele só recupera trechos já gravados no sistema.
--   - Isolamento por cliente_id em toda busca (nunca vazar dado entre clientes).
--   - empresa_id NULL = conteúdo de nível grupo/cliente (ex.: visão consolidada).
--
-- COMO RODAR: cole no Supabase → SQL Editor → Run (primeiro DEV, depois PROD)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS base_conhecimento (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       UUID          NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  empresa_id       UUID          REFERENCES empresas(id) ON DELETE CASCADE, -- NULL = nível grupo

  tipo             TEXT          NOT NULL, -- 'dre_resumo' | 'dre_pdf_bruto' | 'orcamento' | 'societario'
  mes_referencia   DATE,                   -- quando aplicável (ex.: dre_resumo)
  conteudo         TEXT          NOT NULL, -- chunk de texto indexado
  embedding        VECTOR(1536)  NOT NULL, -- text-embedding-3-small

  fonte            TEXT,                   -- rastreabilidade (ex.: nome do arquivo/upload_id)
  criado_em        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_base_conhecimento_cliente_id ON base_conhecimento (cliente_id);
CREATE INDEX IF NOT EXISTS idx_base_conhecimento_empresa_id ON base_conhecimento (empresa_id);
-- ivfflat: melhora com volume; funciona (mais lento) mesmo com poucas linhas no início.
CREATE INDEX IF NOT EXISTS idx_base_conhecimento_embedding ON base_conhecimento
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

COMMENT ON TABLE  base_conhecimento          IS 'Base vetorial (RAG) do agente de IA — chunks derivados de dado já validado no sistema';
COMMENT ON COLUMN base_conhecimento.empresa_id IS 'NULL = conteúdo de nível grupo/cliente (não específico de 1 empresa)';
COMMENT ON COLUMN base_conhecimento.tipo       IS 'Origem do chunk: dre_resumo | dre_pdf_bruto | orcamento | societario';

-- Busca por similaridade (cosine), isolada por cliente e opcionalmente por empresa.
-- match_empresa_id NULL = busca em toda a base do cliente (todas empresas + nível grupo).
CREATE OR REPLACE FUNCTION match_base_conhecimento(
  query_embedding VECTOR(1536),
  match_cliente_id UUID,
  match_empresa_id UUID DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.55,
  match_count INT DEFAULT 6
)
RETURNS TABLE (
  id UUID,
  conteudo TEXT,
  tipo TEXT,
  mes_referencia DATE,
  fonte TEXT,
  similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    bc.id,
    bc.conteudo,
    bc.tipo,
    bc.mes_referencia,
    bc.fonte,
    1 - (bc.embedding <=> query_embedding) AS similarity
  FROM base_conhecimento bc
  WHERE bc.cliente_id = match_cliente_id
    AND (match_empresa_id IS NULL OR bc.empresa_id = match_empresa_id OR bc.empresa_id IS NULL)
    AND 1 - (bc.embedding <=> query_embedding) > match_threshold
  ORDER BY bc.embedding <=> query_embedding
  LIMIT match_count;
$$;
