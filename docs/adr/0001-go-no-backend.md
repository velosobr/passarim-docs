# ADR-0001: Go no back-end

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

o projeto é de estudo; o autor quer aprender a linguagem que o mercado usa para serviços de rede.

## Decisão

catalog, worker e BFF em Go, usando a biblioteca padrão sempre que possível (`net/http`, `log/slog`).

## Consequências

binários pequenos e rápidos, imagens Docker mínimas, concorrência simples com goroutines; menos "mágica" de framework, então escrevemos mais código explícito (bom para aprender).
