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

## Ambientes & workflow de branches

Dois ambientes isolados: **dev** e **prod**. Detalhes em [docs/AMBIENTES.md](docs/AMBIENTES.md).

- **`dev`** → branch de trabalho / ambiente dev (Supabase dev). Push só em `dev` por padrão.
- **`main`** → produção (Supabase prod). Merge só com comando explícito.
- Nunca fazer merge automático para `main`.

## Backend — rodar localmente

```powershell
cd backend
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example ..\.env.local   # preencha SUPABASE_* e JWT_* (banco DEV)
$env:AMBIENTE="local"; python main.py
```

Health check: `GET http://localhost:8000/health`.

## Status

🚧 **Etapa 2 — scaffolding do backend.** FastAPI de pé (config multi-ambiente, cliente Supabase, health check) + deploy Railway (`nixpacks.toml`/`railway.toml`). Schema do banco já criado (Supabase dev e prod). Sem rotas de negócio ainda. Ver [docs/ARQUITETURA.md](docs/ARQUITETURA.md) e [docs/AMBIENTES.md](docs/AMBIENTES.md).
