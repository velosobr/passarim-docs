# ADR-0009: Room KMP para persistência local

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

favoritos precisam funcionar offline no Android e no iOS.

## Decisão

Room 2.8.x (estável, suporta KMP desde 2.7.0) com `BundledSQLiteDriver`; Room 3.x alpha descartado.

## Consequências

mesma API que o time já usa; SQLite com versão idêntica nas duas plataformas.
