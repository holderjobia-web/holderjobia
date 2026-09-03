"""
Rate limiting de login por IP (em memória).

Complementa o account lockout persistido no banco. Em memória basta porque:
  - é a primeira barreira (por IP, antes de tocar o banco);
  - o lockout por conta (login_bloqueado_ate) cobre o caso de restart.

Uvicorn roda em processo único (sem --workers), então o dict é consistente.
"""

from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status


class RateLimiter:
    def __init__(self, max_tentativas: int = 5, janela_min: int = 10, bloqueio_min: int = 15):
        self.max = max_tentativas
        self.janela = timedelta(minutes=janela_min)
        self.bloqueio = timedelta(minutes=bloqueio_min)
        self._estado: dict = defaultdict(
            lambda: {"count": 0, "inicio": datetime.now(timezone.utc), "ate": None}
        )

    def verificar(self, ip: str) -> None:
        """Lança 429 se o IP está bloqueado; reinicia a janela se expirou."""
        agora = datetime.now(timezone.utc)
        e = self._estado[ip]

        if e["ate"] and agora < e["ate"]:
            restante = int((e["ate"] - agora).total_seconds() / 60) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"Acesso temporariamente bloqueado por excesso de tentativas. "
                    f"Aguarde {restante} minuto(s) e tente novamente."
                ),
            )

        if agora - e["inicio"] > self.janela:
            e["count"] = 0
            e["inicio"] = agora
            e["ate"] = None

    def registrar_falha(self, ip: str) -> int:
        """Incrementa o contador; bloqueia ao atingir o limite. Retorna tentativas restantes."""
        e = self._estado[ip]
        e["count"] += 1
        if e["count"] >= self.max:
            e["ate"] = datetime.now(timezone.utc) + self.bloqueio
            return 0
        return max(0, self.max - e["count"])

    def limpar(self, ip: str) -> None:
        """Reseta o contador após login bem-sucedido."""
        self._estado.pop(ip, None)
