# ADR-0006: Fotos e áudios em object storage

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

guardar binários no banco pesa backups e impede CDN; usar o link original quebra e sobrecarrega as fontes.

## Decisão

o worker processa e salva em SeaweedFS (local, ver ADR-0012) / Cloudflare R2 (produção); o banco guarda só a chave e os créditos.

## Consequências

CDN, tamanhos otimizados (WebP/AAC), custo zero no plano gratuito; o worker passa a processar mídia.
