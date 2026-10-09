# Spike: conjunto de versões do `passarim-app` (etapa 5a)

Data: 2026-10-09 · Resultado: **conjunto validado**, com Paparazzi 2.0 alpha · Alimenta: `docs/superpowers/specs/2026-10-08-passarim-app-fundacao-design.md` §3

A spec da 5a manda validar, antes de qualquer código, se AGP, KMP, Room (KSP) e Paparazzi fecham juntos. Este spike fez isso em projetos mínimos descartáveis (fora do repositório) na máquina de desenvolvimento: macOS, Xcode 16.2, Android SDK 36, JDK 17 e 21 instalados.

## Conjunto validado

| Peça | Versão |
|---|---|
| Gradle | 9.8.1 |
| JDK (Gradle, toolchain e testes) | **21** (Microsoft OpenJDK 21.0.8) |
| Android Gradle Plugin | 9.4.1 (DSL novo, Kotlin embutido) |
| Kotlin | 2.4.21 |
| Compose Multiplatform | 1.12.1 |
| KSP | 2.3.12 |
| Room / sqlite-bundled | 2.8.5 / 2.6.2 |
| Paparazzi | **2.0.0-alpha05** |
| `compileSdk` / `minSdk` | 36 / 26 |

Ainda não exercitados (entram no primeiro passo do plano): Ktor 3.6.0, Koin 4.2.2, Coil 3.6.3, kotlinx.serialization 1.11.0, kotlinx.coroutines 1.11.0, Turbine 1.2.1, AssertK 0.28.1, Kermit 2.2.0, navegação 2.9.2 e lifecycle 2.11.0 do Compose Multiplatform. São as últimas estáveis do Maven Central em 2026-10-09.

## O que foi provado

| # | Pergunta | Resultado |
|---|---|---|
| 1 | AGP 9.4.1 + plugin KMP-library + Compose compilam para Android e iOS? | Sim (`compileKotlinIosSimulatorArm64`, `compileAndroidMain`, `allTests`) |
| 2 | Paparazzi **estável** (1.3.5) funciona? | **Não.** Com o AGP 9 falha por `BaseExtension` (DSL legado removido); com `android.newDsl=false` ou com AGP 8.13 + Gradle 8.13/8.14 falha no relatório (`NoClassDefFoundError: ...junit.result.TestFailure`) |
| 3 | Paparazzi 2.0.0-alpha05 + AGP 9.4.1? | **Sim**, mas o bytecode é Java 21: com JDK 17 o teste falha (`UnsupportedClassVersionError`) |
| 4 | `Res.string` / `Res.font` do Compose Multiplatform renderizam no Paparazzi? | **Sim**, com `setResourceReaderAndroidContext(paparazzi.context)` no `@Before` e `androidResources { enable = true }` no módulo KMP. O `PreviewContextConfigurationEffect()` **não** basta: só age em modo de inspeção |
| 5 | Room KMP + KSP + `BundledSQLiteDriver` testáveis na JVM do host? | **Sim**, com um alvo `jvm()` só para testes e `Room.inMemoryDatabaseBuilder<T>()` em `jvmTest`. KSP roda para `Android`, `IosArm64`, `IosSimulatorArm64` e `Jvm` |
| 6 | Convention plugins como *precompiled script plugins* funcionam com AGP 9? | **Sim.** `commonTest` roda no iOS (`iosSimulatorArm64Test`) e na JVM do host (`testAndroidHostTest`) |

## Receitas que funcionaram

**Módulo KMP (convention plugin `passarim.kmp-library`)**

```kotlin
plugins {
    id("org.jetbrains.kotlin.multiplatform")
    id("com.android.kotlin.multiplatform.library")
}

kotlin {
    android {
        namespace = "com.velosobr.passarim" + project.path.replace(":", ".").replace("-", "")
        compileSdk = 36
        minSdk = 26
        withHostTest { }          // habilita testAndroidHostTest para o commonTest
    }
    iosArm64()
    iosSimulatorArm64()
    sourceSets { commonTest.dependencies { implementation(kotlin("test")) } }
}
```

`build-logic` usa `kotlin-dsl` e traz os plugins como `implementation` do catálogo (AGP, Kotlin, Compose, KSP, Room, Paparazzi); o `settings.gradle.kts` do projeto faz `includeBuild("build-logic")`.

**Módulo `snapshots` (Paparazzi)**

```kotlin
plugins {
    id("com.android.library")          // sem kotlin-android: o Kotlin vem embutido no AGP 9
    id("app.cash.paparazzi")
    id("org.jetbrains.kotlin.plugin.compose")
}
android { namespace = "..."; compileSdk = 36; defaultConfig { minSdk = 26 } }
kotlin { jvmToolchain(21) }
```

```kotlin
@OptIn(ExperimentalResourceApi::class)
class BadgeSnapshotTest {
    @get:Rule val paparazzi = Paparazzi()
    @Before fun setUp() { setResourceReaderAndroidContext(paparazzi.context) }
    @Test fun badge() { paparazzi.snapshot { SpikeBadge() } }
}
```

O snapshot gravado mostrou o texto "Vulnerável" lido de `composeResources/values/strings.xml`.

**Módulo de banco (Room KMP)**

```kotlin
plugins { /* kotlin multiplatform, plugin KMP-library, com.google.devtools.ksp, androidx.room */ }
kotlin { android { /* ... */ }; iosArm64(); iosSimulatorArm64(); jvm() }
dependencies {
    listOf("kspAndroid", "kspIosArm64", "kspIosSimulatorArm64", "kspJvm").forEach {
        add(it, "androidx.room:room-compiler:2.8.5")
    }
}
room { schemaDirectory("$projectDir/schemas") }
```

Teste em `jvmTest`: `Room.inMemoryDatabaseBuilder<AppDatabase>().setDriver(BundledSQLiteDriver()).build()`.

## Consequências para a spec e o plano

- **Paparazzi 2.0.0-alpha05 aceito [DR]** (é alpha). Fallback: Roborazzi (ADR-0010 atualizado na 5a). O CI precisa de JDK 21.
- **Testes de Room em `jvmTest`**, não em `androidUnitTest` (a 5d foi ajustada).
- Os testes de snapshot são os únicos em JUnit4 (regra do Paparazzi); a lógica usa `kotlin.test`.
- Dependências do Compose com coordenadas explícitas: os atalhos `compose.runtime`, `compose.material3` etc. estão obsoletos no 1.12.
- O bloco do módulo KMP se chama `android { }` (o `androidLibrary { }` está obsoleto).

## Não coberto

Ktor/Koin/Coil/navegação (primeiro passo do plano), detekt e ktlint com Kotlin 2.4 (o detekt 1.23.8 estável pode não analisar Kotlin 2.4; alternativa `dev.detekt` 2.0.0-alpha), `osv-scanner` sobre dependências do Gradle (requer `gradle.lockfile`), `xcodebuild` do `iosApp` (projeto Xcode ainda não existe; plano usa XcodeGen).
