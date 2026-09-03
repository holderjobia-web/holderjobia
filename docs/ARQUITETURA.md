# holderjob — Arquitetura & Consolidação da Ideia

Documento de referência do projeto. Consolida o domínio (a partir do sistema que o sócio vinha operando manualmente no Claude) e a arquitetura técnica (espelhada da orbitta-platform).

Data: 2026-09-03 · Fase: 0 (setup do repositório, nada implementado ainda).

---

## 1. Problema que o produto resolve

O sócio administra um grupo de empresas (rede de unidades / holding) e hoje faz a inteligência financeira **manualmente**: extrai DREs de PDFs, consolida em uma planilha mestre única (`Planilha_Mestre_CFO.xlsx`), compara unidades, acompanha margem e cruza com retiradas pessoais e participação societária.

Dores atuais (do processo manual):
- Consolidação manual, sujeita a erro (colunas deslocadas, linhas de total duplicadas, nomes fragmentados por acento/duplicidade).
- Sem persistência confiável (ambiente temporário; risco de perder a planilha).
- Governança de dados frágil (mesma unidade com nomes diferentes; sem código único).
- Análises refeitas do zero a cada sessão.

**holderjob** transforma esse processo em um SaaS: base de dados única (Supabase), upload de DREs, consolidação automática, dashboards e — no futuro — um agente de IA que responde perguntas sobre as empresas.

## 2. Domínio (modelo de dados inicial)

Derivado da estrutura da planilha mestre que o sócio já usava.

### 2.1 Empresas / Unidades (`empresas`)
Cadastro das unidades do grupo. Campos:
- `id` (código único — **decisão de governança: nunca identificar unidade por nome**)
- Nome / Razão Social
- CNPJ
- Segmento
- Papel do sócio / % Participação
- Ativa? · Prioridade de acompanhamento
- Data de cadastro · Data de inauguração/abertura
- Status de maturidade (ex.: pré-operacional, recém-inaugurada, madura)
- Observação

### 2.2 DRE Consolidado (`dre_consolidado`)
Tabela "tidy": **uma linha por unidade/mês**. Campos financeiros:
- Receita Bruta · Impostos · Devoluções · Receita Líquida
- CSV / Margem de Contribuição · Despesas Operacionais · Resultado Operacional
- Despesas Financeiras · IR/CSLL · Lucro Líquido · Retirada
- Percentuais calculados (margem, etc.)
- **Rastreabilidade:** Fonte · Confiabilidade · Observação

### 2.3 Participação Societária (`participacao_societaria`)
Cruza a retirada pessoal declarada (por unidade/mês) contra a retirada registrada no DRE e o % de participação → valor esperado, diferença e categoria de divergência.

### 2.4 Outras entidades (roadmap)
Categorias financeiras · DRE gerencial · Fluxo de caixa · Patrimônio pessoal · Metas · Registro de decisões · Dashboard.

## 3. Regras de negócio / governança de dados

Regras que o sócio já validou no uso manual — devem virar comportamento do sistema:

1. **Dado novo consolidado prevalece** sobre dado antigo (mês único), MAS toda divergência é **sinalizada e documentada**, nunca sobrescrita em silêncio.
2. **Ambiguidade não é resolvida por suposição** → marcar como "pendente de confirmação" em vez de adivinhar (ex.: CNPJ igual em duas unidades).
3. **Honestidade sobre limitação de dado** → não fabricar número. Ex.: liquidez real exige balanço patrimonial (não temos) → oferecer proxy claramente rotulado como proxy.
4. **Código único por unidade** — evitar fragmentação (casos reais: "Lapa de Baixo = Lapa II", "Gianetti = Guaianases II", "MAIRIPORA" vs "MAIRIPORÃ").
5. **Validações de integridade na importação:** detectar coluna deslocada (CNPJ ausente), linha de total duplicada, nome fragmentado por acento.

## 4. Funcionalidades (roadmap por fases)

### Fase 1 — Fundação
- Auth (admin + usuário), multi-empresa.
- CRUD de empresas/unidades.
- Upload de DRE (PDF) → parsing → dados estruturados na base.
- Base consolidada (`dre_consolidado`) com rastreabilidade.

### Fase 2 — BI / Dashboards
- Comparação entre unidades, ranking de rentabilidade e de estabilidade financeira (coeficiente de variação de margem/receita, meses de prejuízo).
- Acompanhamento de margem, análise de estrutura de custos.
- Cruzamento retirada × participação societária.
- Alertas (ex.: salto de impostos ISS + PIS/COFINS — risco de mudança de faixa RBT12 do Simples Nacional).

### Fase 3 — Agente de IA (GPT)
- Conversa que responde perguntas sobre as empresas a partir da base consolidada.
- RAG (pgvector) sobre DREs/análises.
- Postura de conselheiro estratégico: análise crítica (riscos, gargalos, contrapontos), não validação automática.

## 5. Arquitetura técnica (espelhada da orbitta-platform)

- **Backend:** FastAPI + Python 3.11 → Railway (`nixpacks.toml` + `railway.toml`, `uvicorn main:app`).
- **Frontend:** Next.js + Tailwind + TypeScript → Vercel. Middleware `proxy.ts` para auth via cookies.
- **Banco:** Supabase PostgreSQL. **Storage** para PDFs de DRE/notas (bucket dedicado). **pgvector** para RAG na fase 3.
- **Auth:** JWT — separação admin (`/admin/*`, cookie `admin_token`) vs portal usuário (`/portal/*`, token no localStorage + cookie).
- **Parsing de DRE:** `pdfplumber` (Python). Método validado no uso manual: extração com layout preservado é mais confiável que OCR de imagem para tabelas largas.
- **IA:** OpenAI GPT (fase 3).
- **Migrations:** SQL versionado em `backend/migrations/`, aplicado no Supabase.

### Ambientes (a definir junto com o sócio)
- Dev e Prod separados (Railway + Vercel + Supabase por ambiente), seguindo o padrão da orbitta-platform.

## 6. Infra / contas

- **GitHub:** org `holderjobia-web`, repo `holderjobia` (privado).
- **Supabase** · **Vercel** · **Railway** · **OpenAI (GPT)** — a provisionar.

## 7. Decisões em aberto

- Modelo de multi-tenant: um único grupo (holding do sócio) ou multi-cliente desde já?
- Domínios/DNS de dev e prod.
- Estrutura exata das migrations iniciais (schema de `empresas` e `dre_consolidado`).
- Formato/variações dos PDFs de DRE a suportar no parser.
