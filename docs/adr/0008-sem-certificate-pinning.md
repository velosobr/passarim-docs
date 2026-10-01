# ADR-0008: Sem certificate pinning no MVP

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

pinning dificulta interceptação, mas uma troca de certificado sem atualizar o app o deixa inutilizável.

## Decisão

não usar pinning no MVP; HTTPS obrigatório com validação padrão do sistema.

## Consequências

menor risco operacional; proteção contra MITM depende da cadeia de certificados do sistema. Reavaliar na v2 com login.
