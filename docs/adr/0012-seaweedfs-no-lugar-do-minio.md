# ADR-0012: SeaweedFS no lugar do MinIO no ambiente local

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

A spec previa o MinIO como object storage local. Em 2025 o projeto MinIO deixou de
publicar imagens Docker da edição comunitária: `minio/minio` não existe mais no
Docker Hub e o espelho `quay.io/minio/minio` exige autenticação.

## Decisão

Usar o **SeaweedFS** (`chrislusf/seaweedfs`, Apache 2.0) com a API S3 habilitada.
Em produção continua o Cloudflare R2.

## Consequências

O código Go usa um cliente S3 genérico, então trocar de storage é só configuração
(endpoint e credenciais). Perdemos o console web do MinIO; o SeaweedFS oferece um
navegador de arquivos mais simples (filer, porta 8888).
