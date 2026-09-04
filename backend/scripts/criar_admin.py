"""
Gera o hash bcrypt de uma senha e imprime o SQL de INSERT do admin inicial.
NÃO conecta no banco — você cola o SQL no Supabase → SQL Editor (padrão manual).

Uso:
    python backend/scripts/criar_admin.py
    python backend/scripts/criar_admin.py --nome "Victor" --email victor@holderjob.com

A senha é lida de forma oculta (não fica no histórico). O admin nasce com
senha_temporaria = true → troca obrigatória no primeiro login.
"""

import sys
import getpass
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.security import gerar_hash_senha, validar_forca_senha


def main() -> None:
    parser = argparse.ArgumentParser(description="Cria o SQL do admin inicial.")
    parser.add_argument("--nome", help="Nome do admin")
    parser.add_argument("--email", help="E-mail do admin")
    args = parser.parse_args()

    nome = args.nome or input("Nome: ").strip()
    email = (args.email or input("E-mail: ").strip()).lower()

    senha = getpass.getpass("Senha: ")
    confirmar = getpass.getpass("Confirmar senha: ")
    if senha != confirmar:
        sys.exit("As senhas nao conferem.")

    faltando = validar_forca_senha(senha)
    if faltando:
        sys.exit("Senha fraca. Falta: " + ", ".join(faltando))

    senha_hash = gerar_hash_senha(senha)
    email_sql = email.replace("'", "''")
    nome_sql = nome.replace("'", "''")

    print("\n-- Cole no Supabase (projeto dev) -> SQL Editor -> Run:\n")
    print(
        "INSERT INTO admins (nome, email, senha_hash, senha_temporaria)\n"
        f"VALUES ('{nome_sql}', '{email_sql}', '{senha_hash}', true);"
    )


if __name__ == "__main__":
    main()
