"""
Entry point do FastAPI — holderjob backend.
SaaS de inteligência financeira (CFO/BI) multi-tenant.

Fase atual: scaffolding. Sem rotas de negócio ainda — apenas health check.
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from config import config


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adiciona security headers em todas as respostas HTTP."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "0"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
        if config.AMBIENTE != "local":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


# Validação de variáveis críticas — falha rápida no startup
_VARS_OBRIGATORIAS = {
    "JWT_SECRET": config.JWT_SECRET,
    "JWT_ADMIN_SECRET": config.JWT_ADMIN_SECRET,
    "SUPABASE_URL": config.SUPABASE_URL,
    "SUPABASE_SERVICE_KEY": config.SUPABASE_KEY,
}
_faltando = [k for k, v in _VARS_OBRIGATORIAS.items() if not v]
if _faltando:
    raise RuntimeError(
        f"Variáveis de ambiente obrigatórias não configuradas: {', '.join(_faltando)}"
    )


app = FastAPI(
    title="holderjob API",
    description="SaaS de inteligência financeira (CFO/BI) multi-tenant",
    version="0.1.0",
)

# CORS
_cors_origins = config.CORS_ORIGINS
_allow_credentials = "*" not in _cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(SecurityHeadersMiddleware)

# Rotas
from routes.auth import router as auth_router
from routes.admin_auth import router as admin_auth_router
from routes.admin_clientes import router as admin_clientes_router
from routes.admin_empresas import router as admin_empresas_router
from routes.admin_usuarios import router as admin_usuarios_router

app.include_router(auth_router)
app.include_router(admin_auth_router)
app.include_router(admin_clientes_router)
app.include_router(admin_empresas_router)
app.include_router(admin_usuarios_router)


@app.get("/")
async def root():
    return {
        "status": "online",
        "produto": "holderjob API",
        "versao": "0.1.0",
        "ambiente": config.AMBIENTE,
    }


@app.get("/health")
async def health():
    return {"status": "ok", "ambiente": config.AMBIENTE}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=config.PORT, reload=True)
