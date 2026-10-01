# ADR-0004: Banco de dados pertence ao catalog

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

compartilhar banco entre serviços cria acoplamento invisível.

## Decisão

o PostgreSQL e suas migrations vivem no `passarim-catalog`; ninguém mais acessa o banco diretamente.

## Consequências

o schema pode mudar sem afetar o BFF; não há repositório próprio para o banco.
