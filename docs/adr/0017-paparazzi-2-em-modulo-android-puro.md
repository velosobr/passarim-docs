# ADR-0017: Paparazzi 2.0 (alpha) em um módulo Android puro

- **Status:** Aceita
- **Data:** 2026-10-09

## Contexto

O ADR-0010 previa o Paparazzi no `androidUnitTest` de módulos KMP, com o Roborazzi como alternativa se houvesse
incompatibilidade. Um spike com o conjunto de versões do app (Gradle 9.8.1, AGP 9.4.1, Kotlin 2.4.21,
Compose Multiplatform 1.12.1) mostrou que:

- o Paparazzi estável (1.3.5) **não funciona**: com o AGP 9 falha por `BaseExtension` (DSL legado removido) e,
  mesmo com o DSL legado ou com o AGP 8.13, o gerador de relatório quebra no Gradle atual
  (`NoClassDefFoundError: ...junit.result.TestFailure`);
- o Paparazzi **2.0.0-alpha05** funciona com o AGP 9.4.1, mas gera bytecode Java 21 (exige JDK 21);
- strings e fontes do Compose Multiplatform (`Res.string`, `Res.font`) só resolvem no Paparazzi se o teste
  chamar `setResourceReaderAndroidContext(paparazzi.context)`.

## Decisão

Usar o **Paparazzi 2.0.0-alpha05** num módulo Android puro (`snapshots`, `com.android.library`), fora dos módulos
KMP de produto. Os testes de snapshot são os únicos em JUnit4 (a regra do Paparazzi). O módulo depende do design
system e, a partir da 5b, das telas das features. O Roborazzi continua como fallback se uma versão estável
nova do Paparazzi regredir ou se o alpha parar de funcionar.

## Consequências

- O CI e as máquinas de desenvolvimento precisam de JDK 21.
- Aceitamos o risco de uma versão alpha numa ferramenta de teste (não vai para o app); a dependência é
  verificada pelo CI a cada PR.
- O render iOS continua sem snapshot (a validação visual no iOS é manual, na 5e).
- Substitui o ADR-0010.
