"""
Acervos (portal) — repositório de arquivos por unidade: Contrato, Planilha de
obra, Fotos, Plantas, Documentos em geral. Upload em lote, multi-extensão
(sem restrição de tipo), busca por nome e por unidade.

Rotas (exigem JWT do portal — JWT_SECRET):
  POST   /acervos/uploads             → recebe 1+ arquivos (multipart), salva e indexa
  GET    /acervos/uploads             → lista os arquivos do cliente (filtro empresa/categoria/busca)
  GET    /acervos/uploads/{id}/arquivo → link temporário + prévia (quando aplicável)
  DELETE /acervos/uploads/{id}        → remove o arquivo (Storage + base de conhecimento)

O binário vai para o bucket privado do Supabase Storage; o banco guarda só os
metadados e o status de indexação. Diferente do DRE/Vendas, não há tabela
"consolidado" nem botão "Processar" — a indexação (quando o tipo permite
extrair texto) roda automaticamente no upload.
"""

import logging
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile

from config import config
from core.acervos_extracao import extensao_de, previa_csv
from core.acervos_processamento import processar_indexacao
from core.auth import admin_do_cliente, usuario_atual
from core.base_conhecimento import remover_por_nome_arquivo
from core.storage import EXPIRACAO_SEGUNDOS, gerar_link_temporario
from core.vendas_parser import previa_planilha
from supabase_client import supabase

router = APIRouter(prefix="/acervos", tags=["acervos"])

logger = logging.getLogger(__name__)

_MAX_BYTES = 50 * 1024 * 1024  # 50 MB — fotos/plantas costumam ser maiores que PDFs de DRE
_CATEGORIAS_VALIDAS = ("contrato", "planilha_obra", "fotos", "plantas", "documentos_gerais")
_EXT_IMAGEM = ("jpg", "jpeg", "png", "gif", "webp", "bmp", "svg")
_EXT_OFFICE = ("doc", "docx", "ppt", "pptx")
_EXT_TEXTO = ("txt", "md", "log")

_CAMPOS_UPLOAD = (
    "id, cliente_id, empresa_id, categoria, nome_arquivo, extensao, "
    "tamanho_bytes, descricao, status, erro_detalhe, criado_em"
)


def _empresa_do_cliente(empresa_id: str, cliente_id: str) -> bool:
    res = (
        supabase.table("empresas")
        .select("id")
        .eq("id", empresa_id)
        .eq("cliente_id", cliente_id)
        .limit(1)
        .execute()
    )
    return bool(res.data)


def _validar_categoria(categoria: str) -> None:
    if categoria not in _CATEGORIAS_VALIDAS:
        raise HTTPException(
            status_code=422,
            detail=f"categoria inválida. Use uma de: {', '.join(_CATEGORIAS_VALIDAS)}.",
        )


def _tipo_visualizacao(nome: str) -> str:
    ext = extensao_de(nome)
    if ext == "pdf":
        return "pdf"
    if ext in _EXT_IMAGEM:
        return "imagem"
    if ext == "xlsx":
        return "xlsx"
    if ext == "csv":
        return "csv"
    if ext in _EXT_OFFICE:
        return "office"
    if ext in _EXT_TEXTO:
        return "texto"
    return "outro"


@router.get("/uploads")
async def listar_uploads(
    empresa_id: str | None = Query(None),
    categoria: str | None = Query(None),
    busca: str | None = Query(None),
    usuario: dict = Depends(usuario_atual),
):
    query = (
        supabase.table("acervos_uploads")
        .select(_CAMPOS_UPLOAD)
        .eq("cliente_id", usuario["cliente_id"])
    )
    if empresa_id:
        query = query.eq("empresa_id", empresa_id)
    if categoria:
        query = query.eq("categoria", categoria)
    if busca:
        query = query.ilike("nome_arquivo", f"%{busca}%")
    res = query.order("criado_em", desc=True).execute()
    return res.data or []


@router.post("/uploads", status_code=201)
async def enviar_arquivos(
    arquivos: list[UploadFile] = File(...),
    empresa_id: str = Form(...),
    categoria: str = Form(...),
    descricao: str | None = Form(None),
    usuario: dict = Depends(usuario_atual),
):
    """Upload em lote: cada arquivo do envio vira 1 registro próprio (permite
    excluir/visualizar individualmente). Um arquivo com falha não derruba os
    demais do mesmo lote — cada resultado é reportado por item."""
    cliente_id = usuario["cliente_id"]
    _validar_categoria(categoria)
    if not _empresa_do_cliente(empresa_id, cliente_id):
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")
    if not arquivos:
        raise HTTPException(status_code=422, detail="Envie ao menos 1 arquivo.")

    resultados = []
    for arquivo in arquivos:
        nome = (arquivo.filename or "").strip()
        if not nome:
            continue
        conteudo = await arquivo.read()
        if not conteudo:
            resultados.append({"nome_arquivo": nome, "erro": "Arquivo vazio."})
            continue
        if len(conteudo) > _MAX_BYTES:
            resultados.append({"nome_arquivo": nome, "erro": "Arquivo excede o limite de 50 MB."})
            continue

        extensao = extensao_de(nome)
        storage_path = f"{cliente_id}/{uuid.uuid4()}.{extensao}" if extensao else f"{cliente_id}/{uuid.uuid4()}"
        try:
            supabase.storage.from_(config.ACERVOS_BUCKET).upload(storage_path, conteudo)
        except Exception as e:
            corpo = getattr(getattr(e, "response", None), "text", "") or repr(e)
            logger.exception(
                "Falha ao enviar arquivo de Acervos para o Storage (bucket=%s) erro=%s",
                config.ACERVOS_BUCKET, corpo,
            )
            resultados.append({"nome_arquivo": nome, "erro": "Falha ao armazenar o arquivo."})
            continue

        payload = {
            "cliente_id": cliente_id,
            "empresa_id": empresa_id,
            "categoria": categoria,
            "enviado_por": usuario["id"],
            "nome_arquivo": nome,
            "extensao": extensao,
            "storage_path": storage_path,
            "tamanho_bytes": len(conteudo),
            "descricao": descricao,
            "status": "recebido",
        }
        res = supabase.table("acervos_uploads").insert(payload).execute()
        if not res.data:
            try:
                supabase.storage.from_(config.ACERVOS_BUCKET).remove([storage_path])
            except Exception:
                pass
            resultados.append({"nome_arquivo": nome, "erro": "Falha ao registrar o envio."})
            continue

        registro = res.data[0]
        indexacao = processar_indexacao(registro, conteudo)
        supabase.table("acervos_uploads").update(indexacao).eq("id", registro["id"]).execute()
        registro.update(indexacao)
        registro.pop("storage_path", None)
        resultados.append(registro)

    return resultados


@router.get("/uploads/{upload_id}/arquivo")
async def visualizar_arquivo(upload_id: str, usuario: dict = Depends(usuario_atual)):
    """Link temporário para o arquivo + prévia (quando o tipo permite montar uma)."""
    res = (
        supabase.table("acervos_uploads")
        .select("id, nome_arquivo, storage_path")
        .eq("id", upload_id)
        .eq("cliente_id", usuario["cliente_id"])
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")

    up = res.data[0]
    tipo = _tipo_visualizacao(up["nome_arquivo"])
    url = gerar_link_temporario(config.ACERVOS_BUCKET, up["storage_path"])

    previa = None
    erro_previa = None
    if tipo in ("xlsx", "csv"):
        try:
            conteudo = supabase.storage.from_(config.ACERVOS_BUCKET).download(up["storage_path"])
            previa = previa_planilha(conteudo) if tipo == "xlsx" else previa_csv(conteudo)
        except Exception:
            logger.exception("Falha ao gerar prévia (upload=%s)", upload_id)
            erro_previa = "Não foi possível gerar a prévia deste arquivo."

    if url is None and previa is None:
        raise HTTPException(status_code=502, detail="Não foi possível abrir o arquivo.")

    return {
        "url": url,
        "nome_arquivo": up["nome_arquivo"],
        "tipo": tipo,
        "previa": previa,
        "erro_previa": erro_previa,
        "expira_em_segundos": EXPIRACAO_SEGUNDOS,
    }


@router.delete("/uploads/{upload_id}")
async def remover_upload(upload_id: str, usuario: dict = Depends(admin_do_cliente)):
    """Remove o arquivo (Storage + registro) e limpa o que ele indexou no agente."""
    cliente_id = usuario["cliente_id"]
    res = (
        supabase.table("acervos_uploads")
        .select("id, storage_path, nome_arquivo")
        .eq("id", upload_id)
        .eq("cliente_id", cliente_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    up = res.data[0]

    if up.get("nome_arquivo"):
        # O agente não pode continuar citando um arquivo que saiu do sistema.
        remover_por_nome_arquivo(cliente_id, up["nome_arquivo"])

    if up.get("storage_path"):
        try:
            supabase.storage.from_(config.ACERVOS_BUCKET).remove([up["storage_path"]])
        except Exception:  # noqa: BLE001 — arquivo órfão não deve travar a exclusão
            logger.warning("Falha ao remover arquivo do Storage: %s", up["storage_path"])

    supabase.table("acervos_uploads").delete().eq("id", upload_id).eq("cliente_id", cliente_id).execute()
    return {"removido": True}
