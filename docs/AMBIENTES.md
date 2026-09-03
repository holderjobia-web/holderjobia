# Ambientes — dev & prod

O holderjob roda em **dois ambientes isolados**: `dev` (desenvolvimento/testes) e `prod` (produção). Cada camada tem sua própria instância por ambiente, e o **git é a fonte da verdade** de qual código vai para onde.

## Mapeamento por camada

| Camada        | Ambiente dev            | Ambiente prod           | Como separa            |
|---------------|-------------------------|-------------------------|------------------------|
| **Git**       | branch `dev`            | branch `main`           | branch                 |
| **Supabase**  | banco **dev**           | banco **prod**          | projeto/URL + chaves   |
| **Railway**   | serviço backend dev     | serviço backend prod    | env vars por serviço   |
| **Vercel**    | deploy dev (`dev.*`)    | deploy prod             | env vars por ambiente  |

> Os **2 bancos Supabase (dev e prod) já foram criados** pelo dono.

## Regra de branches (herdada da orbitta-platform)

- **`dev`** → branch de trabalho. Push do dia a dia vai só aqui.
- **`main`** → produção. Só recebe merge com **comando explícito**.
- Padrão quando não for dito nada: **somente `dev`**.
- **Nunca** fazer merge automático `dev → main`.

## Variáveis de ambiente (por ambiente)

Cada ambiente tem seu próprio conjunto de secrets — **nunca commitados** (ver `.gitignore`). Os nomes das variáveis são os mesmos; o que muda é o valor (dev x prod).

Backend (Railway) e scripts locais usam:

| Variável              | Descrição                                              |
|-----------------------|--------------------------------------------------------|
| `SUPABASE_URL`        | URL do projeto Supabase (dev **ou** prod)              |
| `SUPABASE_SERVICE_KEY`| Service role key do Supabase do ambiente               |
| `JWT_SECRET`          | Assina token do portal (usuários/cliente)              |
| `JWT_ADMIN_SECRET`    | Assina token do ADMIN (super admin do SaaS)            |
| `OPENAI_API_KEY`      | Chave OpenAI (agente IA — fase futura)                 |
| `ENVIRONMENT`         | `dev` ou `prod` (identifica o ambiente em runtime)     |

> O arquivo `backend/.env.example` (criado na etapa do backend) lista essas variáveis sem valores. Cada ambiente terá seu `.env` local (dev) e suas env vars no Railway (dev/prod).

## Fluxo de deploy (quando Railway/Vercel entrarem)

1. Trabalha em `dev` → push `origin dev` → Railway/Vercel **dev** atualizam (apontando para o **Supabase dev**).
2. Validado em dev → merge `dev → main` (com comando explícito) → Railway/Vercel **prod** atualizam (apontando para o **Supabase prod**).
3. Migrations SQL são aplicadas **manualmente** em cada banco Supabase, na ordem: primeiro **dev**, depois **prod** após validar.
