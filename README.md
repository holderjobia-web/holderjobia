# holderjob

SaaS de inteligência financeira (CFO / BI) para administração de múltiplas empresas: cadastro de unidades, upload de DREs e notas, consolidação de dados e dashboards.

> Repositório: `holderjobia-web/holderjobia` · Produto: **holderjob**

## Visão

Plataforma que centraliza a gestão financeira de um grupo de empresas (unidades/holding). O usuário administra suas empresas, carrega arquivos de DRE (Demonstrativo de Resultado) e notas, e a plataforma consolida tudo em uma base única para comparação entre unidades, acompanhamento de margem, análise de estabilidade e cruzamento com participações societárias.

No futuro, um **agente de IA (GPT)** conversará com o usuário e trará informações das empresas a partir dessa base consolidada.

## Stack (mesma arquitetura técnica da orbitta-platform)

| Camada    | Tecnologia                                  | Deploy   |
|-----------|---------------------------------------------|----------|
| Backend   | FastAPI + Python 3.11                        | Railway  |
| Frontend  | Next.js + Tailwind + TypeScript             | Vercel   |
| Banco     | Supabase (PostgreSQL + Storage + pgvector)  | Supabase |
| IA        | OpenAI GPT (agente + RAG — fase futura)      | —        |

## Estrutura planejada

```
holderjobia/
├── backend/            # FastAPI (Python 3.11) → Railway
│   ├── main.py
│   ├── requirements.txt
│   ├── config.py
│   ├── supabase_client.py
│   ├── core/           # utils, permissões, helpers compartilhados
│   ├── routes/         # endpoints (empresas, dre, dashboard, auth)
│   ├── services/       # parsing de DRE (pdfplumber), consolidação
│   └── migrations/     # SQL versionado do Supabase
├── frontend-next/      # Next.js + Tailwind + TS → Vercel
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── proxy.ts        # middleware de auth (cookies)
├── nixpacks.toml       # build Railway
├── railway.toml        # deploy Railway
└── docs/
    └── ARQUITETURA.md  # consolidação da ideia + decisões
```

## Workflow de branches (herdado da orbitta-platform)

- **`dev`** → branch de trabalho. Push só em `dev` por padrão.
- **`main`** → produção. Merge só com comando explícito.
- Nunca fazer merge automático para `main`.

## Status

🚧 **Fase 0 — Consolidação e setup do repositório.** Nenhuma feature implementada ainda. Ver [docs/ARQUITETURA.md](docs/ARQUITETURA.md).
