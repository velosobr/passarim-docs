# ADR-0019: Conjunto de versões e ferramentas de build do app

- **Status:** Aceita
- **Data:** 2026-10-09

## Contexto

O app combina AGP, Kotlin Multiplatform, Compose Multiplatform, Room (KSP) e ferramentas de qualidade. Um spike
(`docs/superpowers/spikes/2026-10-09-passarim-app-versoes.md`) e o esqueleto da fundação mostraram quais
versões fecham juntas.

## Decisão

- **Gradle** 9.8.1, **AGP** 9.4.1 (DSL novo, plugin `com.android.kotlin.multiplatform.library`), **Kotlin** 2.4.21,
  **Compose Multiplatform** 1.12.1, **KSP** 2.3.12, **Room** 2.8.5.
- **JDK 21** no Gradle, nos testes e no CI.
- **`compileSdk` 37** (as bibliotecas do Compose 1.12.1 exigem; `targetSdk` 36) e `minSdk` 26.
- **detekt 2.0.0-alpha.6** (`dev.detekt`): o 1.23.8 estável embute um compilador antigo para Kotlin 2.4. O ktlint
  usa o estilo `ktlint_official`.
- Dependências travadas em `gradle.lockfile` só para o que é distribuído no app (classpath de runtime do release
  Android e klibs do iOS); o CI roda o `osv-scanner` e falha com CVSS >= 7.0.

## Consequências

- Duas ferramentas de qualidade em versão alpha (detekt e Paparazzi); ambas ficam fora do código distribuído.
- Atualizações de versão seguem pelo Dependabot e passam pelo CI completo.
- Mudar o conjunto exige revalidar Paparazzi, Room e o build iOS juntos.
