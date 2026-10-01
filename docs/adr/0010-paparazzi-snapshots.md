# ADR-0010: Paparazzi para testes de snapshot

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

queremos detectar regressões visuais em temas claro/escuro e fonte ampliada sem emulador.

## Decisão

Paparazzi no alvo Android (`androidUnitTest`), verificado no CI; Roborazzi como alternativa se houver incompatibilidade com o plugin KMP do AGP.

## Consequências

snapshots rápidos na JVM; o render iOS não é coberto por snapshot.
