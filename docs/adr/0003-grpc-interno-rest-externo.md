# ADR-0003: gRPC entre serviços, REST para o app

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

serviços internos se beneficiam de contrato tipado; o app precisa de algo fácil de depurar e cachear.

## Decisão

BFF → catalog via gRPC (contratos em `passarim-proto`); app → BFF via REST/JSON documentado em OpenAPI.

## Consequências

erros de contrato aparecem em tempo de compilação; `buf breaking` protege a evolução; dois estilos de API para manter.
