# ADR-0002: BFF separado do catálogo

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

o app precisa de respostas no formato de cada tela; os dados de aves precisam de um dono estável.

## Decisão

`passarim-catalog` é dono dos dados (genérico); `passarim-bff` adapta para o app (uma chamada por tela).

## Consequências

o app fica simples e rápido; mudanças de tela não mexem no catálogo; ganhamos um salto de rede a mais (mitigado por cache).
