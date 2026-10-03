# ADR-0014: Imagem do worker com ffmpeg (Alpine, não distroless)

- **Status:** Aceita
- **Data:** 2026-10-02

## Contexto

O worker converte fotos para WebP e cantos para AAC. Nenhuma biblioteca em
Go puro faz os dois, então chamamos o `ffmpeg` (programa externo). O ffmpeg
depende de bibliotecas do sistema, que a imagem distroless usada pela API
não tem.

## Decisão

A imagem do worker é Alpine + ffmpeg, com usuário sem privilégios
(`uid 10001`), sistema de arquivos `read_only` e `tmpfs` em `/tmp`. A API
continua distroless.

## Consequências

- A imagem é maior (~100 MB) e tem mais superfície de ataque (há um shell).
- Mitigações: o worker não recebe conexões (não publica portas), roda sem
  root e o Trivy escaneia a imagem no CI.
