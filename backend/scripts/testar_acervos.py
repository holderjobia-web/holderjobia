import asyncio
import io
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException, UploadFile

from core import acervos_processamento, base_conhecimento
from routes import acervos


class AcervosTests(unittest.TestCase):
    def setUp(self):
        self.upload = {
            "id": "arquivo-1", "cliente_id": "cliente-1", "empresa_id": "empresa-1",
            "nome_arquivo": "Contrato.PDF", "storage_path": "cliente-1/arquivo.pdf",
            "categoria": "contrato",
        }
        self.usuario = {"id": "usuario-1", "cliente_id": "cliente-1"}
        self.pdf = b"%PDF-1.5\nconteudo de teste"

    def banco(self):
        banco = MagicMock()
        query = banco.table.return_value
        for metodo in ("select", "eq", "limit", "update", "insert"):
            getattr(query, metodo).return_value = query
        query.execute.return_value = SimpleNamespace(data=[self.upload.copy()])
        banco.storage.from_.return_value.download.return_value = self.pdf
        return banco

    def test_upload_informa_mime_pdf(self):
        banco = self.banco()
        with patch.object(acervos, "supabase", banco), patch.object(acervos, "processar_indexacao", return_value={"status": "indexado"}):
            asyncio.run(acervos.enviar_arquivos(
                arquivos=[UploadFile(filename="Contrato.PDF", file=io.BytesIO(self.pdf))],
                empresa_id="empresa-1", categoria="contrato", descricao=None, usuario=self.usuario,
            ))
        argumentos = banco.storage.from_.return_value.upload.call_args.args
        self.assertEqual(argumentos[2]["content-type"], "application/pdf")

    def test_pdf_antigo_recebe_tipo_correto_sem_regravar_storage(self):
        banco = self.banco()
        with patch.object(acervos, "supabase", banco):
            resposta = acervos.conteudo_arquivo("arquivo-1", usuario=self.usuario)
        self.assertEqual(resposta.headers["content-type"], "application/pdf")
        self.assertEqual(resposta.body, self.pdf)
        self.assertEqual(resposta.headers["cache-control"], "private, no-store")
        banco.table.return_value.eq.assert_any_call("cliente_id", "cliente-1")
        banco.storage.from_.return_value.upload.assert_not_called()

    def test_outro_cliente_nao_pode_baixar(self):
        banco = self.banco()
        banco.table.return_value.execute.return_value.data = []
        with patch.object(acervos, "supabase", banco), self.assertRaises(HTTPException) as erro:
            acervos.conteudo_arquivo("arquivo-1", usuario=self.usuario)
        self.assertEqual(erro.exception.status_code, 404)
        banco.storage.from_.return_value.download.assert_not_called()

    def test_html_nao_abre_como_documento_ativo(self):
        banco = self.banco()
        banco.table.return_value.execute.return_value.data[0]["nome_arquivo"] = "pagina.html"
        with patch.object(acervos, "supabase", banco):
            resposta = acervos.conteudo_arquivo("arquivo-1", usuario=self.usuario)
        self.assertEqual(resposta.headers["content-type"], "application/octet-stream")
        self.assertTrue(resposta.headers["content-disposition"].startswith("attachment"))

    def test_falha_no_chunk_nao_pode_virar_sucesso(self):
        with patch.object(base_conhecimento, "reindexar_fonte"), patch.object(base_conhecimento, "_indexar_chunk", return_value="insert falhou"):
            with self.assertRaises(RuntimeError):
                base_conhecimento.indexar_texto_acervo("cliente-1", "empresa-1", "contrato.pdf", "Contrato", "contrato")

    def test_status_sem_texto_e_falha_de_indexacao(self):
        with patch.object(acervos_processamento, "extrair_texto", return_value=None):
            self.assertEqual(acervos_processamento.processar_indexacao(self.upload, b"")["status"], "sem_texto")
        with patch.object(acervos_processamento, "extrair_texto", return_value="Contrato"), patch.object(acervos_processamento, "indexar_texto_acervo", side_effect=RuntimeError("Falha")), self.assertLogs(level="ERROR"):
            self.assertEqual(acervos_processamento.processar_indexacao(self.upload, b"")["status"], "erro")

    def test_pdf_corrompido_nao_e_classificado_como_sem_texto(self):
        with patch("core.dre_parser.extrair_texto_pdf", side_effect=ValueError("PDF invalido")), self.assertLogs(level="ERROR"):
            self.assertEqual(acervos_processamento.processar_indexacao(self.upload, b"invalido")["status"], "erro")

    def test_editar_categoria_e_unidade_acompanha_o_agente(self):
        banco = self.banco()
        dados = acervos.UploadAtualizar(empresa_id="empresa-2", categoria="controle_mensal")
        with patch.object(acervos, "supabase", banco), patch.object(acervos, "atualizar_chunks_acervo") as chunks:
            asyncio.run(acervos.atualizar_upload("arquivo-1", dados, usuario=self.usuario))
        banco.table.return_value.update.assert_called_once_with(
            {"empresa_id": "empresa-2", "categoria": "controle_mensal"}
        )
        chunks.assert_called_once_with(
            "cliente-1", "Contrato.PDF",
            empresa_antiga="empresa-1", categoria_antiga="contrato",
            empresa_nova="empresa-2", categoria_nova="controle_mensal",
        )

    def test_editar_rejeita_categoria_invalida_e_empresa_de_outro_cliente(self):
        banco = self.banco()
        with patch.object(acervos, "supabase", banco), self.assertRaises(HTTPException) as erro:
            asyncio.run(acervos.atualizar_upload("arquivo-1", acervos.UploadAtualizar(categoria="xyz"), usuario=self.usuario))
        self.assertEqual(erro.exception.status_code, 422)
        with patch.object(acervos, "supabase", banco), patch.object(acervos, "_empresa_do_cliente", return_value=False), self.assertRaises(HTTPException) as erro:
            asyncio.run(acervos.atualizar_upload("arquivo-1", acervos.UploadAtualizar(empresa_id="de-outro"), usuario=self.usuario))
        self.assertEqual(erro.exception.status_code, 404)
        banco.table.return_value.update.assert_not_called()


if __name__ == "__main__":
    unittest.main()