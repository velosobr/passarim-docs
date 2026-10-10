# ADR-0018: Estratégia de testes do app

- **Status:** Aceita
- **Data:** 2026-10-09

## Contexto

O spec geral (§10) citava JUnit5, Turbine e AssertK para ViewModels e o Room testado em `commonTest`. O app é
Kotlin Multiplatform: o JUnit5 não existe em `commonMain`, e o Room com banco em memória precisa de um driver
SQLite nativo que o teste local do Android (JVM do host) não traz.

## Decisão

- Toda a lógica (ViewModels, repositórios, mappers, `safeCall`) é testada em **`commonTest`** com `kotlin.test`,
  Turbine e AssertK, e roda em dois lugares: na JVM do host (`testAndroidHostTest`) e no simulador iOS
  (`iosSimulatorArm64Test`).
- Os **snapshots** (ADR-0017) são os únicos testes em JUnit4.
- Os testes de **Room** rodam em `jvmTest` de `core:database`, com banco em memória e `BundledSQLiteDriver`; o alvo
  `jvm()` existe só para isso e nenhum código de produto o usa.
- Nomes de teste não podem ter vírgula (o Kotlin/Native rejeita `,` em nomes com crases).

## Consequências

- Um só framework de lógica, sem testes duplicados por plataforma.
- A lógica de `commonMain` é executada de fato no iOS, não só compilada.
- Os testes de Room não rodam no Android real nem no iOS; a validação do banco nessas plataformas é manual (5e).
