# ADR-0005: Pré-ingestão em vez de chamadas em tempo real

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

APIs externas são lentas, têm limite de uso e podem cair.

## Decisão

um worker importa periodicamente os dados para o nosso banco/storage; nenhuma requisição do app chama API externa.

## Consequências

respostas rápidas e resilientes; dados podem ficar algumas horas desatualizados; precisamos de fila de jobs com retry.
