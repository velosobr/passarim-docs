# Frente C2 — PiuDS, componentes: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar no `core:piu-ds` os 12 componentes de assinatura das variantes (seção 6 da spec) e o Pipo, com testes de semântica e de estado no host Android e snapshots, mais a ADR do Haze.

**Architecture:**
- **PR 4, `passarim-app` (`feat/piuds-c2-comuns`, sobre `main`):** as dependências (Haze, `graphics-shapes`, `ui-tooling-preview`, e Robolectric com `compose-ui-test` nos testes), as molas do `PiuMotion`, o pincel dos gradientes, a forma cookie, o crédito com e sem link, a superfície com desfoque, o `PiuNavItem` e o Pipo.
- **PR 5, `passarim-app` (`feat/piuds-c2-adultos`, sobre o PR 4):** chip de bioma, card do mosaico, "Ave do dia" e barra flutuante.
- **PR 6, `passarim-app` (`feat/piuds-c2-kids`, também sobre o PR 4):** botão que afunda, cartão de mundo, figurinhas, balão do Pipo e barra do Kids. Os PRs 5 e 6 não dependem um do outro.
- **PR 7, `passarim-docs` (`docs/plano-frente-c2-componentes`):** este plano, a ADR-0023 (Haze) e os ajustes do README do PiuDS.
- Nenhuma tela usa os componentes ainda: as frentes E (adulto) e F (Kids) os ligam às telas.

**Tech Stack:** Kotlin 2.4.21, Compose Multiplatform 1.12.2, Material 3 1.9.0, Haze 2.0.1, `androidx.graphics:graphics-shapes` 1.1.0, Robolectric 4.17, `org.jetbrains.compose.ui:ui-test` (API `v2`), Paparazzi 2.0.0-alpha05.1, assertk, AboutLibraries 15.3.0.

**Spec:** `passarim-docs/docs/superpowers/specs/2026-10-28-passarim-frente-c-piuds-design.md`, seções 6 (componentes), 7 (dependências), 8 (testes) e 9 (PRs 4 a 7). Regras do módulo: `passarim-docs/docs/design/piuds/README.md`.

## Global Constraints

- **Comentários didáticos em português** em todo código novo ou alterado (regra do `~/dev/passarim/CLAUDE.md`): todo arquivo começa dizendo o seu papel; conceitos aparecem explicados na primeira vez no arquivo (`ShaderBrush`, `MutableInteractionSource`, `selectableGroup`, `clearAndSetSemantics`, `autoSize`, `mainClock`); mudou o código, atualiza o comentário.
- **Idioma:** identificadores em inglês; comentários, KDoc, commits e PRs em português do Brasil. Nomes de teste em português entre crases, **sem acento e sem vírgula** (o Kotlin/Native não aceita vírgula no nome).
- **Identidade do Git:** `velosobr <linoc.veloso@gmail.com>`. Commits terminam com as linhas de atribuição da sessão.
- **JDK 21** (`export JAVA_HOME=$(/usr/libexec/java_home -v 21)`).
- **Versões fixas:** Haze `2.0.1` (estável; a spec previa beta), `graphics-shapes` `1.1.0`, Robolectric `4.17` com `@Config(sdk = [35])`, `androidx.compose.ui:ui-test-manifest` `1.12.1` (a versão do androidx que o CMP 1.12.2 usa).
- **Testes de Compose:** `androidx.compose.ui.test.v2.runComposeUiTest` (a v1 está depreciada), com `@RunWith(RobolectricTestRunner::class)`, em `core/piu-ds/src/androidHostTest`. Funções puras vão para `commonTest`.
- **README do PiuDS:** prefixo `Piu`; `modifier` como primeiro parâmetro opcional; estado levantado; alvo de 48 dp no Piu e 56 dp no Kids; papel semântico em todo clicável; `contentDescription` obrigatório (sem valor padrão) em clicável sem texto; nenhum modelo de feature como parâmetro; `@Preview` em claro e escuro no Piu (`PiuLightAndDarkPreview`) e só claro no Kids; animações pelo `PiuMotion`.
- **Haze só no `PiuBlurSurface.kt`** (ADR-0023). Nenhum outro arquivo importa `dev.chrisbanes.haze`.
- **Snapshots:** Piu em claro e escuro, Kids só em claro, cada um a 1.0×, 1.3× e 2.0×. Grave só a classe da tarefa (`--tests`) e abra cada imagem antes do commit.
- **Sem merge e sem push na `main`:** os merges são do dono.
- **iOS:** os testes do `core:piu-ds` no simulador (`:core:piu-ds:iosSimulatorArm64Test`) rodam com o Xcode selecionado no `xcode-select`. Se o Xcode selecionado não linkar, registre no PR e confie no job iOS do CI.

## Review Focus

1. **Pressionar e soltar o botão do Kids com a mola ligada:** a mola de toque passa do ponto; o botão não pode cair nem ficar fora do lugar. Testes na Task 11 (pressionar sem "reduzir animações" e soltar acompanhando quadro a quadro).
2. **Rótulos longos a 2.0× nas barras** ("Configurações", "Ajustes"): ficam numa linha, nunca quebram no meio da palavra. Snapshots nas Tasks 10 e 15.
3. **Texto e ícone no alto de um card, fora do scrim, sobre uma foto clara** (o selo da "Ave do dia", o coração do mosaico): o fundo deles é a cor do scrim, o par que a ferramenta de contraste mede. Tasks 8 e 9.
4. **"Reduzir animações" ligado:** a barra flutuante e o botão do Kids vão direto ao estado final, sem nenhum quadro intermediário; desligado, há quadros intermediários. Testes nas Tasks 10 e 11, e o `PiuMotionTest` na Task 1.
5. **Cartão esticado pela grade** (dois por linha, como na frente F): a face ocupa a coluna inteira, não só o tamanho do texto. Snapshot na Task 12.

## Decisões deste plano

Tomadas na prototipagem (branch `wip/c2-prototipo`) e na montagem dos PRs, dentro do que a spec delega:

1. **`PiuNavItem` fica nos comuns** (`components/`), e não no pacote adulto: assim a barra do Kids não depende do PR 5, e os PRs 5 e 6 ficam independentes.
2. **Estado pressionado sem snapshot.** O Compose só sabe do toque por um efeito, e o Paparazzi fotografa antes dos efeitos. O afundar é conferido no `PiuKidsButtonTest` (a face desce os 5 dp da sombra); o README do PiuDS ganha a regra (Task 20).
3. **Selo e coração com a cor do scrim** em vez do branco translúcido das pranchetas, para passar no contraste sobre foto clara (spec, seção 4.2: o texto só fica onde o scrim garante o contraste).
4. **`PiuPlayAction`** agrupa o canto da "Ave do dia" (descrição, tocando, clique), para a descrição do botão ser obrigatória.
   O botão usa o par `primaryContainer`/`onPrimaryContainer` em vez do cookie branco da prancheta: com o fundo branco fixo, o ícone na primária do tema escuro ficava com 1,7:1.
5. **Rótulos das barras numa linha com `autoSize`**, encolhendo só o necessário com fonte grande.
6. **`PiuKidsButton` aceita `interactionSource`**, como os botões do Material, para quem chama acompanhar o toque.
7. **README do PiuDS alinhado ao código** (Task 20): dependência da `@Preview`, a regra de literais (exceções para o branco sobre o scrim, o escurecimento da sombra do mundo e o Pipo; medidas de layout em `dp` no componente), a estabilidade de `List` com o *strong skipping*, o teste de estado de animação e a regra do texto sobre foto (o scrim acompanha o texto; Task 17).

## Contraste dos pares dos componentes

Os pares de cor que os componentes novos usam e ainda não estavam na ferramenta de `docs/design/tools`, calculados com a fórmula da WCAG a partir dos valores do código (Piu: claro / escuro; Kids: só claro). Mínimo de 4,5:1 para texto e 3:1 para ícone e traço. Os gradientes, o scrim e o rótulo do botão Kids já são conferidos pelo `check-tokens.mjs`.

| Onde | Par | Contraste | Mínimo |
|---|---|---|---|
| Crédito com link | `primary` sobre `surface` | 6,07 / 11,02 | 4,5 |
| Chip de bioma marcado | `onPrimary` sobre `primary` | 6,37 / 7,78 | 4,5 |
| Selo e coração (foto branca, pior caso) | branco sobre o scrim | 10,02 | 4,5 |
| Botão de canto | `onPrimaryContainer` sobre `primaryContainer` | 13,27 / 7,25 | 3 |
| Barra flutuante, item ativo | `onSecondaryContainer` sobre `secondaryContainer` | 13,27 / 7,26 | 4,5 |
| Barra flutuante, ícone inativo (pior fundo) | `onSurfaceVariant` sobre a tinta de 82% | 6,09 / 6,77 | 3 |
| Botão do Kids | `onPrimaryContainer` sobre `primaryContainer` | 6,14 | 4,5 |
| Barra do Kids, item ativo | `onSurface` sobre `inversePrimary` | 9,37 | 4,5 |
| Barra do Kids, inativo | `inverseOnSurface` sobre `inverseSurface` | 13,52 | 4,5 |
| Figurinha que falta, "?" e rótulo | `onSurfaceVariant` sobre o creme | 7,09 | 4,5 |
| Figurinha que falta, tracejado | `outline` sobre o creme | 4,32 | 3 |
| Balão do Pipo | `onSurface` sobre `surfaceContainerLowest` | 14,39 | 4,5 |

## Task 0: Preparação

- [ ] **Step 1: Branch do PR 4**

```bash
cd passarim-app
git fetch origin
git checkout -b feat/piuds-c2-comuns origin/main
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
```

- [ ] **Step 2: Base verde**

Run: `./gradlew ktlintCheck detekt :core:piu-ds:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`.

## PR 4 (`feat/piuds-c2-comuns`, sobre `main`)

### Task 1: Dependências, testes de Compose no host e as molas do `PiuMotion`

As bibliotecas do C2 entram no catálogo e no `piu-ds`, e o host Android ganha Robolectric e `compose-ui-test`. O primeiro teste de Compose confere o `PiuMotion`: com "reduzir animações", toda mola vira troca seca.

**Files:**
- Regenerate: `androidApp/gradle.lockfile`
- Regenerate: `app/gradle.lockfile`
- Modify: `build-logic/src/main/kotlin/passarim.kmp-library.gradle.kts`
- Modify: `config/detekt.yml`
- Modify: `core/piu-ds/build.gradle.kts`
- Create: `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuMotionTest.kt`
- Create: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/theme/PiuMotion.kt`
- Regenerate: `feature/settings/presentation/src/commonMain/composeResources/files/aboutlibraries.json`
- Modify: `gradle/libs.versions.toml`

**Interfaces:**
- Produz: `object PiuMotion { @Composable fun <T> press(): FiniteAnimationSpec<T>; @Composable fun <T> state(): FiniteAnimationSpec<T> }` em `com.velosobr.piuds.theme`.
- Produz (catálogo): `libs.haze`, `libs.haze.blur`, `libs.graphics.shapes`, `libs.compose.uiTest`, `libs.androidx.compose.uiTestManifest`, `libs.robolectric`.

- [ ] **Step 1: Ajustar `passarim.kmp-library.gradle.kts`**

Em `build-logic/src/main/kotlin/passarim.kmp-library.gradle.kts`, aplique (o diff mostra o arquivo antes e depois):

```diff
diff --git a/build-logic/src/main/kotlin/passarim.kmp-library.gradle.kts b/build-logic/src/main/kotlin/passarim.kmp-library.gradle.kts
index 9d525c6..21af0ec 100644
--- a/build-logic/src/main/kotlin/passarim.kmp-library.gradle.kts
+++ b/build-logic/src/main/kotlin/passarim.kmp-library.gradle.kts
@@ -12,7 +12,8 @@ kotlin {
         namespace = "com.velosobr.passarim" + project.path.replace(":", ".").replace("-", "")
         compileSdk = 37
         minSdk = 26
-        withHostTest { }
+        // isIncludeAndroidResources: os testes de Compose no host (Robolectric) precisam dos recursos Android.
+        withHostTest { isIncludeAndroidResources = true }
     }
     iosArm64()
     iosSimulatorArm64()
```

- [ ] **Step 2: Ajustar `detekt.yml`**

Em `config/detekt.yml`, aplique (o diff mostra o arquivo antes e depois):

```diff
diff --git a/config/detekt.yml b/config/detekt.yml
index bb69670..0162c2f 100644
--- a/config/detekt.yml
+++ b/config/detekt.yml
@@ -10,5 +10,8 @@ complexity:
 naming:
   FunctionNaming:
     ignoreAnnotated: ['Composable']
+    # Os padrões do detekt mais o androidHostTest (testes no host do plugin KMP do AGP 9), que o
+    # detekt ainda não conhece: nos testes, o nome é uma frase entre crases.
+    excludes: ['**/test/**', '**/androidTest/**', '**/commonTest/**', '**/jvmTest/**', '**/androidUnitTest/**', '**/androidHostTest/**', '**/androidInstrumentedTest/**', '**/jsTest/**', '**/iosTest/**']
   TopLevelPropertyNaming:
     constantPattern: '[A-Z][A-Za-z0-9_]*'
```

- [ ] **Step 3: Ajustar `build.gradle.kts`**

Em `core/piu-ds/build.gradle.kts`, aplique (o diff mostra o arquivo antes e depois):

```diff
diff --git a/core/piu-ds/build.gradle.kts b/core/piu-ds/build.gradle.kts
index ea8762a..32b6fbc 100644
--- a/core/piu-ds/build.gradle.kts
+++ b/core/piu-ds/build.gradle.kts
@@ -3,7 +3,9 @@
 // carregador de imagens) entra só como "implementation": os componentes de
 // foto o usam por dentro. O PiuDS usa o pacote curto com.velosobr.piuds, e
 // não o padrão por caminho do convention plugin, por isso o namespace
-// Android e o pacote dos recursos são fixados aqui.
+// Android e o pacote dos recursos são fixados aqui. Haze (desfoque) e
+// graphics-shapes (polígonos arredondados) entram no plano C2, só para os
+// componentes: o Haze fica isolado no PiuBlurSurface (ADR-0023).
 
 plugins {
     id("passarim.kmp-compose")
@@ -22,12 +24,25 @@ kotlin {
             api(libs.compose.ui)
             api(libs.compose.resources)
             implementation(libs.coil.compose)
+            implementation(libs.haze)
+            implementation(libs.haze.blur)
+            implementation(libs.graphics.shapes)
+            // A anotação @Preview, para ver cada componente no painel do Android Studio.
+            implementation(libs.compose.uiToolingPreview)
             // Para reler a preferência "reduzir animações" quando a pessoa volta ao app.
             implementation(libs.lifecycle.runtime.compose)
         }
         commonTest.dependencies {
             implementation(libs.assertk)
         }
+        // Testes de Compose no host Android: o Robolectric imita o Android numa JVM comum, e o
+        // ui-test monta a composição e consulta a árvore de semântica (o que o leitor de tela lê).
+        getByName("androidHostTest").dependencies {
+            implementation(libs.compose.uiTest)
+            implementation(libs.androidx.compose.uiTestManifest)
+            implementation(libs.robolectric)
+            implementation(libs.junit4)
+        }
     }
 }
 
```

- [ ] **Step 4: Ajustar `libs.versions.toml`**

Em `gradle/libs.versions.toml`, aplique (o diff mostra o arquivo antes e depois):

```diff
diff --git a/gradle/libs.versions.toml b/gradle/libs.versions.toml
index f654485..78e5726 100644
--- a/gradle/libs.versions.toml
+++ b/gradle/libs.versions.toml
@@ -20,12 +20,15 @@ navigation = "2.10.0"
 splashscreen = "1.2.0"
 activityCompose = "1.13.0"
 coil = "3.6.3"
+haze = "2.0.1"
+graphicsShapes = "1.1.0"
 media3 = "1.11.1"
 maplibreCompose = "0.20.0"
 maplibreNativeFfi = "0.202610.3"
 ktlint = "14.2.0"
 detekt = "2.0.0-alpha.6"
 junit4 = "4.13.2"
+robolectric = "4.17"
 aboutlibraries = "15.3.0"
 
 [libraries]
@@ -83,6 +86,11 @@ coil-core = { module = "io.coil-kt.coil3:coil", version.ref = "coil" }
 coil-compose = { module = "io.coil-kt.coil3:coil-compose", version.ref = "coil" }
 coil-network-ktor3 = { module = "io.coil-kt.coil3:coil-network-ktor3", version.ref = "coil" }
 
+# PiuDS: desfoque (só no PiuBlurSurface, ADR-0023) e polígonos arredondados (forma cookie)
+haze = { module = "dev.chrisbanes.haze:haze", version.ref = "haze" }
+haze-blur = { module = "dev.chrisbanes.haze:haze-blur", version.ref = "haze" }
+graphics-shapes = { module = "androidx.graphics:graphics-shapes", version.ref = "graphicsShapes" }
+
 # Licenças
 aboutlibraries-core = { module = "com.mikepenz:aboutlibraries-core", version.ref = "aboutlibraries" }
 aboutlibraries-compose-m3 = { module = "com.mikepenz:aboutlibraries-compose-m3", version.ref = "aboutlibraries" }
@@ -104,3 +112,7 @@ koin-android = { module = "io.insert-koin:koin-android", version.ref = "koin" }
 turbine = { module = "app.cash.turbine:turbine", version.ref = "turbine" }
 assertk = { module = "com.willowtreeapps.assertk:assertk", version.ref = "assertk" }
 junit4 = { module = "junit:junit", version.ref = "junit4" }
+# Testes de Compose no host Android (Robolectric); o manifesto de teste é o do androidx, por isso a versão fixa
+compose-uiTest = { module = "org.jetbrains.compose.ui:ui-test", version.ref = "compose" }
+androidx-compose-uiTestManifest = { module = "androidx.compose.ui:ui-test-manifest", version = "1.12.1" }
+robolectric = { module = "org.robolectric:robolectric", version.ref = "robolectric" }
```

- [ ] **Step 5: Escrever o teste que falha**

Crie `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuMotionTest.kt`:

```kotlin
// Testes do PiuMotion: com "reduzir animações" ligado, toda mola vira troca
// seca. Rodam no host Android com o Robolectric (que imita o Android numa JVM
// comum), porque precisam de uma composição de verdade.

package com.velosobr.piuds

import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.SnapSpec
import androidx.compose.animation.core.SpringSpec
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.v2.runComposeUiTest
import assertk.assertThat
import assertk.assertions.isInstanceOf
import com.velosobr.piuds.theme.LocalPiuReduceMotion
import com.velosobr.piuds.theme.PiuMotion
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PiuMotionTest {
    /** Lê as duas molas dentro do tema, com "reduzir animações" no valor dado. */
    private fun specs(reduceMotion: Boolean): List<FiniteAnimationSpec<Float>> {
        val out = mutableListOf<FiniteAnimationSpec<Float>>()
        runComposeUiTest {
            setContent {
                CompositionLocalProvider(LocalPiuReduceMotion provides reduceMotion) {
                    PiuTheme {
                        out += PiuMotion.press<Float>()
                        out += PiuMotion.state<Float>()
                    }
                }
            }
        }
        return out
    }

    @Test
    fun `com animacoes as molas sao spring`() {
        specs(reduceMotion = false).forEach { assertThat(it).isInstanceOf<SpringSpec<Float>>() }
    }

    @Test
    fun `com reduzir animacoes as molas viram troca seca`() {
        specs(reduceMotion = true).forEach { assertThat(it).isInstanceOf<SnapSpec<Float>>() }
    }
}
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: FAIL na compilação: `Unresolved reference 'PiuMotion'`.

- [ ] **Step 7: Implementar**

Crie `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/theme/PiuMotion.kt`:

```kotlin
// As molas do PiuDS: o lugar único de onde os componentes tiram as animações.
// Uma "mola" (spring) anima como um elástico: o valor chega ao destino com
// um pequeno balanço, sem duração fixa. Com "reduzir animações" ligado, toda
// mola vira uma troca seca (snap), e o componente vai direto ao estado final.
// Quando o MotionScheme expressivo do Material 3 sair em versão estável, é
// este arquivo que ele substitui (TODO(frente-H) no PiuTheme).

package com.velosobr.piuds.theme

import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable

/**
 * As duas molas nomeadas do PiuDS. Os componentes nunca escrevem `spring()`
 * direto: assim "reduzir animações" vale para todos de uma vez.
 */
object PiuMotion {
    /**
     * Para resposta ao toque (o botão que afunda e volta): rápida e com um
     * pequeno balanço, a "sensação de brinquedo".
     */
    @Composable
    @ReadOnlyComposable
    fun <T> press(): FiniteAnimationSpec<T> =
        if (PiuTheme.reduceMotion) snap() else spring(Spring.DampingRatioMediumBouncy, Spring.StiffnessMedium)

    /** Para troca de estado (o item da barra que expande): sem balanço. */
    @Composable
    @ReadOnlyComposable
    fun <T> state(): FiniteAnimationSpec<T> =
        if (PiuTheme.reduceMotion) snap() else spring(Spring.DampingRatioNoBouncy, Spring.StiffnessMediumLow)
}
```

- [ ] **Step 8: Rodar e ver passar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 9: Regenerar os lockfiles e as licenças**

As bibliotecas novas entram no app: sem os lockfiles, o `iosArm64` do `app` dá "KMP Dependencies Resolution Failure", e o CI confere o `aboutlibraries.json` (ADR-0020).

Run: `./gradlew resolveAndLockShipped --write-locks && ./gradlew :androidApp:exportLibraryDefinitions`

Expected: `androidApp/gradle.lockfile` e `app/gradle.lockfile` com `dev.chrisbanes.haze:*:2.0.1`, `androidx.graphics:graphics-shapes*:1.1.0` e `org.jetbrains.compose.ui:ui-tooling-preview*`; o `aboutlibraries.json` com a Haze e o graphics-shapes.

- [ ] **Step 10: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:piu-ds:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: Haze, graphics-shapes e testes de Compose no host, e as molas do PiuMotion"
```

### Task 2: Pincel dos gradientes com a reta do CSS

`PiuGradient.toBrush()` pinta os gradientes dos tokens no ângulo do CSS (o das pranchetas). A geometria é uma função pura, `gradientLine`, testada em `commonTest` (roda no host e no iOS).

**Files:**
- Create: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/theme/PiuGradientBrush.kt`
- Create: `core/piu-ds/src/commonTest/kotlin/com/velosobr/piuds/theme/GradientLineTest.kt`

**Interfaces:**
- Consome: `PiuGradient(from, to, content, angleDegrees)` do C1.
- Produz: `fun PiuGradient.toBrush(): Brush` e `internal fun gradientLine(angleDegrees: Float, size: Size): Pair<Offset, Offset>`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `core/piu-ds/src/commonTest/kotlin/com/velosobr/piuds/theme/GradientLineTest.kt`:

```kotlin
// Testes da reta do degradê: o ângulo segue a regra do CSS (0° para cima,
// sentido horário), a mesma das pranchetas, e a reta atravessa a área toda.
// Função pura, então o teste roda no host e no simulador iOS sem Compose.

package com.velosobr.piuds.theme

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import assertk.assertThat
import assertk.assertions.isCloseTo
import kotlin.test.Test

class GradientLineTest {
    /** Compara os dois pontos com folga de 0,01 px: seno e cosseno não dão números exatos. */
    private fun assertLine(
        actual: Pair<Offset, Offset>,
        from: Offset,
        to: Offset,
    ) {
        assertThat(actual.first.x).isCloseTo(from.x, 0.01f)
        assertThat(actual.first.y).isCloseTo(from.y, 0.01f)
        assertThat(actual.second.x).isCloseTo(to.x, 0.01f)
        assertThat(actual.second.y).isCloseTo(to.y, 0.01f)
    }

    @Test
    fun `0 graus vai de baixo para cima`() {
        assertLine(gradientLine(0f, Size(200f, 100f)), from = Offset(100f, 100f), to = Offset(100f, 0f))
    }

    @Test
    fun `90 graus vai da esquerda para a direita`() {
        assertLine(gradientLine(90f, Size(200f, 100f)), from = Offset(0f, 50f), to = Offset(200f, 50f))
    }

    @Test
    fun `135 graus cruza o quadrado de canto a canto`() {
        assertLine(gradientLine(135f, Size(100f, 100f)), from = Offset(0f, 0f), to = Offset(100f, 100f))
    }

    @Test
    fun `135 graus num card largo chega aos dois cantos como no CSS`() {
        // No CSS, a reta tem o comprimento da projeção do retângulo: as duas pontas do degradê caem
        // nas retas perpendiculares que passam pelos cantos, e os cantos ficam com as cores puras.
        val (from, to) = gradientLine(135f, Size(300f, 100f))
        val dir = Offset(0.70710677f, 0.70710677f)
        assertThat(from.x * dir.x + from.y * dir.y).isCloseTo(0f, 0.01f)
        assertThat(to.x * dir.x + to.y * dir.y).isCloseTo(300f * dir.x + 100f * dir.y, 0.01f)
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: FAIL na compilação: `Unresolved reference 'gradientLine'`.

- [ ] **Step 3: Implementar**

Crie `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/theme/PiuGradientBrush.kt`:

```kotlin
// Converte um PiuGradient (cores e ângulo dos tokens) num pincel do Compose.
// O ângulo segue a regra do CSS, a mesma das pranchetas: 0° aponta para
// cima e o ângulo cresce no sentido horário (135° vai do canto de cima à
// esquerda para o de baixo à direita).

package com.velosobr.piuds.theme

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.LinearGradientShader
import androidx.compose.ui.graphics.Shader
import androidx.compose.ui.graphics.ShaderBrush
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/**
 * O pincel do degradê. É um ShaderBrush porque a reta do degradê depende do
 * tamanho de quem é pintado: o Compose chama createShader com o tamanho
 * real, e a reta atravessa a área inteira, como no CSS.
 */
fun PiuGradient.toBrush(): Brush =
    object : ShaderBrush() {
        override fun createShader(size: Size): Shader {
            val (start, end) = gradientLine(angleDegrees, size)
            return LinearGradientShader(from = start, to = end, colors = listOf(from, to))
        }
    }

/**
 * A reta do degradê de `linear-gradient(<ângulo>deg, ...)` numa área de
 * [size]: o ponto onde a primeira cor é pura e o ponto onde a segunda é.
 * Ela passa pelo centro, e o comprimento é a projeção do retângulo na
 * direção do ângulo: assim os dois cantos opostos ficam com as cores puras.
 * Fica separada do pincel para ser testada sem Compose.
 */
internal fun gradientLine(
    angleDegrees: Float,
    size: Size,
): Pair<Offset, Offset> {
    val radians = angleDegrees * PI / 180.0
    // Direção do degradê: no CSS, 0° é "para cima" (y negativo na tela).
    val dx = sin(radians).toFloat()
    val dy = -cos(radians).toFloat()
    val half = (abs(size.width * dx) + abs(size.height * dy)) / 2f
    val center = Offset(size.width / 2f, size.height / 2f)
    return center - Offset(dx * half, dy * half) to center + Offset(dx * half, dy * half)
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:piu-ds:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: pincel dos gradientes do PiuDS com a reta do CSS"
```

### Task 3: Forma cookie

`PiuCookieShape` monta o cookie do M3 Expressive com o `graphics-shapes`. O `toPath` da biblioteca só existe no Android, então o contorno é desenhado das curvas cúbicas, no código comum.

**Files:**
- Create: `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuCookieShapeTest.kt`
- Create: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuCookieShape.kt`

**Interfaces:**
- Produz: `class PiuCookieShape(lobes: Int = 9) : Shape`, igual a outra com as mesmas ondas.

- [ ] **Step 1: Escrever o teste que falha**

Crie `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuCookieShapeTest.kt`:

```kotlin
// Testes da forma cookie: o contorno fica dentro da área de quem ela recorta
// e a ocupa quase toda (o cookie de 9 ondas não é simétrico na horizontal,
// então sobra uma folga de uns 2% dos lados), e duas formas com as mesmas ondas são iguais. Rodam com o
// Robolectric porque o Path do Compose, no Android, é o android.graphics.Path,
// que só existe num Android (de verdade ou imitado).

package com.velosobr.piuds

import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isGreaterThanOrEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isLessThanOrEqualTo
import assertk.assertions.isNotEqualTo
import com.velosobr.piuds.components.PiuCookieShape
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
// NATIVE: o Robolectric usa a biblioteca gráfica de verdade, e o Path calcula os limites.
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PiuCookieShapeTest {
    @Test
    fun `o contorno fica dentro da area e a ocupa quase toda`() {
        val outline = PiuCookieShape().createOutline(Size(120f, 80f), LayoutDirection.Ltr, Density(1f))
        assertThat(outline).isInstanceOf<Outline.Generic>()
        val bounds = (outline as Outline.Generic).path.getBounds()
        assertThat(bounds.left).isGreaterThanOrEqualTo(-0.5f)
        assertThat(bounds.top).isGreaterThanOrEqualTo(-0.5f)
        assertThat(bounds.right).isLessThanOrEqualTo(120.5f)
        assertThat(bounds.bottom).isLessThanOrEqualTo(80.5f)
        assertThat(bounds.width).isGreaterThanOrEqualTo(120f * 0.95f)
        assertThat(bounds.height).isGreaterThanOrEqualTo(80f * 0.95f)
    }

    @Test
    fun `formas com as mesmas ondas sao iguais`() {
        assertThat(PiuCookieShape()).isEqualTo(PiuCookieShape(lobes = 9))
        assertThat(PiuCookieShape().hashCode()).isEqualTo(PiuCookieShape(lobes = 9).hashCode())
        assertThat(PiuCookieShape(lobes = 9)).isNotEqualTo(PiuCookieShape(lobes = 12))
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: FAIL na compilação: `Unresolved reference 'PiuCookieShape'`.

- [ ] **Step 3: Implementar**

Crie `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuCookieShape.kt`:

```kotlin
// A forma "cookie" do Material 3 Expressive: um círculo com a borda em
// ondas suaves, usada no botão de canto e nas figurinhas. O Material só tem
// as formas prontas (MaterialShapes) em versão alpha, então ela é montada
// aqui com o graphics-shapes, a biblioteca de polígonos arredondados do
// AndroidX que o próprio Material usa por dentro.

package com.velosobr.piuds.components

import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Matrix
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.graphics.shapes.CornerRounding
import androidx.graphics.shapes.RoundedPolygon
import androidx.graphics.shapes.star

/**
 * A forma cookie, com [lobes] ondas (9 é o "cookie 9" do Material). Uma
 * estrela com o raio de dentro perto do de fora e as pontas bem arredondadas
 * vira uma borda ondulada.
 *
 * O Shape é o "molde" que o Compose usa para recortar (clip), pintar o fundo
 * e desenhar a borda: createOutline recebe o tamanho real e devolve o
 * contorno.
 */
class PiuCookieShape(
    private val lobes: Int = 9,
) : Shape {
    // normalized() deixa o polígono no quadrado de 0 a 1; depois é só esticar até o tamanho.
    private val polygon =
        RoundedPolygon
            .star(numVerticesPerRadius = lobes, innerRadius = 0.8f, rounding = CornerRounding(0.4f))
            .normalized()

    override fun createOutline(
        size: Size,
        layoutDirection: LayoutDirection,
        density: Density,
    ): Outline {
        // O graphics-shapes só converte para Path no Android (toPath); no código comum, o contorno é
        // montado das curvas de Bézier cúbicas do polígono: cada uma vai de anchor0 a anchor1,
        // puxada pelos dois pontos de controle.
        val cubics = polygon.cubics
        val path = Path()
        path.moveTo(cubics.first().anchor0X, cubics.first().anchor0Y)
        for (c in cubics) {
            path.cubicTo(c.control0X, c.control0Y, c.control1X, c.control1Y, c.anchor1X, c.anchor1Y)
        }
        path.close()
        path.transform(Matrix().apply { scale(size.width, size.height) })
        return Outline.Generic(path)
    }

    // Duas formas com o mesmo número de ondas são iguais: o Compose compara a forma nova com a
    // anterior e, se forem iguais, não refaz o contorno nem redesenha à toa.
    override fun equals(other: Any?): Boolean = other is PiuCookieShape && other.lobes == lobes

    override fun hashCode(): Int = lobes
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:piu-ds:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: forma cookie do PiuDS com o graphics-shapes"
```

### Task 4: Crédito com link e o modo sem link do Kids

`PiuCreditCaption` ganha `onOpenSource` (o crédito vira um link com papel de botão) e `linkEnabled = false`, o modo do Kids. Entra também a moldura interna das prévias, com o claro e o escuro (README do PiuDS, seção 9), e a classe de snapshots dos componentes comuns.

**Files:**
- Create: `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuCommonSemanticsTest.kt`
- Modify: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuCreditCaption.kt`
- Create: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuPreviewThemes.kt`
- Create: `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuCommonComponentsSnapshotTest.kt`
- Record: 6 imagens em `snapshots/src/test/snapshots/images/`

**Interfaces:**
- Produz: `PiuCreditCaption(text: String, modifier: Modifier = Modifier, onOpenSource: (() -> Unit)? = null, linkEnabled: Boolean = true)` e `internal fun PiuLightAndDarkPreview(content: @Composable () -> Unit)`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuCommonSemanticsTest.kt`:

```kotlin
// Testes de acessibilidade dos componentes comuns do PiuDS. A "árvore de
// semântica" é o que o TalkBack e o VoiceOver leem: os testes a consultam
// por texto, descrição ou papel (botão, aba), como um leitor de tela faria.
// runComposeUiTest monta a composição de verdade no Robolectric.

package com.velosobr.piuds

import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHasNoClickAction
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.v2.runComposeUiTest
import assertk.assertThat
import assertk.assertions.isEqualTo
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.piuds.components.PiuCreditCaption
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PiuCommonSemanticsTest {
    /** Confere o papel que o leitor de tela anuncia ("botão", "aba"). */
    private fun hasRole(role: Role) = SemanticsMatcher.expectValue(SemanticsProperties.Role, role)

    @Test
    fun `credito com link e um botao que abre a fonte`() =
        runComposeUiTest {
            var opened = 0
            setContent { PiuTheme { PiuCreditCaption("Foto: Fulano", onOpenSource = { opened++ }) } }
            onNodeWithText("Foto: Fulano").assert(hasRole(Role.Button)).assertHasClickAction().performClick()
            assertThat(opened).isEqualTo(1)
        }

    @Test
    fun `credito com o link desligado nao e clicavel`() =
        runComposeUiTest {
            setContent {
                PiuTheme(journey = Journey.KIDS) { PiuCreditCaption("Foto: Fulano", onOpenSource = {}, linkEnabled = false) }
            }
            onNodeWithText("Foto: Fulano").assertHasNoClickAction()
        }

    @Test
    fun `credito sem fonte continua so texto`() =
        runComposeUiTest {
            setContent { PiuTheme { PiuCreditCaption("Canto: Beltrano") } }
            onNodeWithText("Canto: Beltrano").assertHasNoClickAction()
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: FAIL na compilação: `No parameter with name 'onOpenSource' found`.

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuCreditCaption.kt`:

```kotlin
// Legenda de crédito (autor · licença), em letra pequena, com ou sem link
// para a fonte original.
// @Composable: função que desenha interface; Modifier ajusta tamanho, espaço,
// cliques e acessibilidade (veja PiuBackTopBar.kt).

package com.velosobr.piuds.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.tooling.preview.Preview

/**
 * Mostra o crédito de uma foto ou de um canto, como as licenças CC exigem.
 *
 * Com [onOpenSource], o crédito vira um link sublinhado para a fonte
 * original. [linkEnabled] = false desliga o link mesmo assim: é o modo da
 * jornada Kids, em que nenhuma tela abre um site de fora. O texto do
 * crédito aparece igual nos dois modos.
 */
@Composable
fun PiuCreditCaption(
    text: String,
    modifier: Modifier = Modifier,
    onOpenSource: (() -> Unit)? = null,
    linkEnabled: Boolean = true,
) {
    val link = if (linkEnabled) onOpenSource else null
    Text(
        text,
        style = MaterialTheme.typography.labelSmall,
        color = if (link != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        textDecoration = if (link != null) TextDecoration.Underline else null,
        // Role.Button faz o leitor de tela anunciar que o crédito pode ser tocado.
        modifier = if (link != null) modifier.clickable(role = Role.Button, onClick = link) else modifier,
    )
}

/**
 * @Preview desenha a função no painel de pré-visualização do Android Studio,
 * sem rodar o app, aqui no tema claro e no escuro. Os snapshots do módulo
 * snapshots são a referência conferida no CI; a prévia é só para quem está
 * editando o componente.
 */
@Preview
@Composable
private fun PiuCreditCaptionPreview() {
    PiuLightAndDarkPreview {
        Column {
            PiuCreditCaption("Foto: Fulano · CC BY-NC", onOpenSource = {})
            PiuCreditCaption("Foto: Fulano · CC BY-NC", onOpenSource = {}, linkEnabled = false)
        }
    }
}
```

Crie `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuPreviewThemes.kt`:

```kotlin
// Moldura das prévias (@Preview) dos componentes do Piu: desenha o mesmo
// conteúdo no tema claro e no escuro, um embaixo do outro, como pede o
// README do PiuDS (seção 9). Só as prévias usam; fica interna ao módulo.

package com.velosobr.piuds.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.ThemeMode
import com.velosobr.piuds.theme.PiuTheme

/** [content] no Piu claro e no Piu escuro, cada um sobre o fundo do próprio tema. */
@Composable
internal fun PiuLightAndDarkPreview(content: @Composable () -> Unit) {
    Column {
        listOf(ThemeMode.LIGHT, ThemeMode.DARK).forEach { mode ->
            PiuTheme(themeMode = mode) {
                Surface(color = MaterialTheme.colorScheme.background) {
                    Box(Modifier.padding(8.dp)) { content() }
                }
            }
        }
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Snapshots**

Crie `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuCommonComponentsSnapshotTest.kt`:

```kotlin
// Snapshots dos componentes comuns do PiuDS (frente C, plano C2): os que as
// duas jornadas usam, fotografados no tema do adulto, em claro e escuro e
// nas três escalas de fonte.

package com.velosobr.passarim.snapshots

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.velosobr.piuds.components.PiuCreditCaption
import org.junit.Test

class PiuCommonComponentsSnapshotTest(
    dark: Boolean,
    fontScalePercent: Int,
) : ThemedSnapshotTest(dark, fontScalePercent) {
    /** O crédito com link (sublinhado, na cor primária) e com o link desligado, como no Kids. */
    @Test
    fun credits() =
        snap("credits") {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                PiuCreditCaption("Foto: Fulano · CC BY-NC", onOpenSource = {})
                PiuCreditCaption("Foto: Fulano · CC BY-NC", onOpenSource = {}, linkEnabled = false)
                PiuCreditCaption("Canto: Beltrano · CC BY-SA")
            }
        }
}
```

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*PiuCommonComponentsSnapshotTest*'`

Expected: 6 imagens novas ou alteradas em `snapshots/src/test/snapshots/images/`. Abra cada uma e confira a 1.0×, 1.3× e 2.0×: nada cortado, nada quebrado no meio da palavra.

- [ ] **Step 6: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:piu-ds:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: crédito do PiuDS com link para a fonte e modo sem link do Kids"
```

### Task 5: Superfície com desfoque e o item de navegação comum

`PiuBlurSurface` é o único arquivo que importa a Haze (ADR-0023): desfoca o que foi marcado com `piuBlurSource` e pinta uma tinta translúcida que, sozinha, já dá o contraste. `PiuNavItem` fica entre os comuns porque as duas barras (PR 5 e PR 6) o usam.

**Files:**
- Modify: `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuCommonSemanticsTest.kt`
- Create: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuBlurSurface.kt`
- Create: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuNavItem.kt`
- Modify: `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuCommonComponentsSnapshotTest.kt`
- Record: 6 imagens em `snapshots/src/test/snapshots/images/`

**Interfaces:**
- Produz: `class PiuBlurState`, `@Composable fun rememberPiuBlurState(): PiuBlurState`, `fun Modifier.piuBlurSource(state: PiuBlurState): Modifier`, `PiuBlurSurface(state: PiuBlurState, shape: Shape, tint: Color, modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit)` e `data class PiuNavItem(icon: ImageVector, label: String)` em `com.velosobr.piuds.components`.

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuCommonSemanticsTest.kt`:

```kotlin
// Testes de acessibilidade dos componentes comuns do PiuDS. A "árvore de
// semântica" é o que o TalkBack e o VoiceOver leem: os testes a consultam
// por texto, descrição ou papel (botão, aba), como um leitor de tela faria.
// runComposeUiTest monta a composição de verdade no Robolectric.

package com.velosobr.piuds

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHasNoClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import assertk.assertThat
import assertk.assertions.isEqualTo
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.piuds.components.PiuBlurSurface
import com.velosobr.piuds.components.PiuCreditCaption
import com.velosobr.piuds.components.piuBlurSource
import com.velosobr.piuds.components.rememberPiuBlurState
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PiuCommonSemanticsTest {
    /** Confere o papel que o leitor de tela anuncia ("botão", "aba"). */
    private fun hasRole(role: Role) = SemanticsMatcher.expectValue(SemanticsProperties.Role, role)

    @Test
    fun `credito com link e um botao que abre a fonte`() =
        runComposeUiTest {
            var opened = 0
            setContent { PiuTheme { PiuCreditCaption("Foto: Fulano", onOpenSource = { opened++ }) } }
            onNodeWithText("Foto: Fulano").assert(hasRole(Role.Button)).assertHasClickAction().performClick()
            assertThat(opened).isEqualTo(1)
        }

    @Test
    fun `credito com o link desligado nao e clicavel`() =
        runComposeUiTest {
            setContent {
                PiuTheme(journey = Journey.KIDS) { PiuCreditCaption("Foto: Fulano", onOpenSource = {}, linkEnabled = false) }
            }
            onNodeWithText("Foto: Fulano").assertHasNoClickAction()
        }

    @Test
    fun `superficie com desfoque mostra o conteudo por cima`() =
        runComposeUiTest {
            setContent {
                PiuTheme {
                    val blur = rememberPiuBlurState()
                    Box(Modifier.size(120.dp)) {
                        Box(Modifier.matchParentSize().piuBlurSource(blur).background(Color.Red))
                        PiuBlurSurface(blur, RoundedCornerShape(16.dp), Color.White.copy(alpha = 0.8f), Modifier.size(80.dp)) {
                            Text("Por cima")
                        }
                    }
                }
            }
            onNodeWithText("Por cima").assertIsDisplayed()
        }

    @Test
    fun `credito sem fonte continua so texto`() =
        runComposeUiTest {
            setContent { PiuTheme { PiuCreditCaption("Canto: Beltrano") } }
            onNodeWithText("Canto: Beltrano").assertHasNoClickAction()
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: FAIL na compilação: `Unresolved reference 'PiuBlurSurface'`.

- [ ] **Step 3: Implementar**

Crie `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuBlurSurface.kt`:

```kotlin
// Superfície com desfoque do que está atrás (o "vidro fosco" das barras sobre
// a foto). É o ÚNICO arquivo que importa o Haze, a biblioteca de desfoque:
// se ela quebrar numa versão nova, troca-se só este arquivo por um fundo
// translúcido sem desfoque, e nenhuma tela muda. Por isso o estado, a marca
// da fonte e a superfície ficam juntos aqui, e o detekt não cobra um arquivo
// com o nome de cada declaração (MatchingDeclarationName).
@file:Suppress("MatchingDeclarationName")

package com.velosobr.piuds.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import dev.chrisbanes.haze.HazeInput
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.blur.HazeBlurStyle
import dev.chrisbanes.haze.blur.hazeBlur
import dev.chrisbanes.haze.hazeSource

/**
 * O "estado" do desfoque: liga quem é desfocado ([piuBlurSource]) a quem
 * desfoca ([PiuBlurSurface]). Crie um por tela com [rememberPiuBlurState].
 */
class PiuBlurState internal constructor(
    internal val haze: HazeState,
)

/** Cria e guarda o estado do desfoque entre recomposições. */
@Composable
fun rememberPiuBlurState(): PiuBlurState = remember { PiuBlurState(HazeState()) }

/** Marca o conteúdo (a foto, a lista) que as superfícies de [state] desfocam. */
fun Modifier.piuBlurSource(state: PiuBlurState): Modifier = hazeSource(state.haze)

/**
 * A superfície: desfoca o conteúdo marcado com [piuBlurSource] que está
 * atrás dela e pinta por cima a [tint] translúcida. A tinta sozinha já dá
 * contraste ao que vai em cima: o desfoque é só decoração, e por isso a
 * superfície continua legível onde o desfoque não roda.
 */
@Composable
fun PiuBlurSurface(
    state: PiuBlurState,
    shape: Shape,
    tint: Color,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier
            .clip(shape)
            .hazeBlur(HazeInput.Sources(state.haze), HazeBlurStyle { blurRadius(24.dp) })
            .background(tint),
        content = content,
    )
}

/** Prévia: a superfície em forma de cookie sobre um quadrado amarelo, nos dois temas. */
@Preview
@Composable
private fun PiuBlurSurfacePreview() {
    PiuLightAndDarkPreview {
        val blur = rememberPiuBlurState()
        Box(Modifier.size(96.dp)) {
            Box(Modifier.matchParentSize().piuBlurSource(blur).background(Color(0xFFD9A13B)))
            PiuBlurSurface(
                state = blur,
                shape = PiuCookieShape(),
                tint = MaterialTheme.colorScheme.surface.copy(alpha = 0.6f),
                modifier = Modifier.size(72.dp).align(Alignment.Center),
            ) {
                Text("A", Modifier.align(Alignment.Center))
            }
        }
    }
}
```

Crie `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuNavItem.kt`:

```kotlin
// Um destino das barras de navegação do PiuDS (a flutuante do adulto e a do
// Kids). Fica entre os componentes comuns porque as duas barras o usam.

package com.velosobr.piuds.components

import androidx.compose.ui.graphics.vector.ImageVector

/** Um destino da barra: o ícone e o rótulo (que também é a descrição para o leitor de tela). */
data class PiuNavItem(
    val icon: ImageVector,
    val label: String,
)
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Snapshots**

Substitua o conteúdo de `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuCommonComponentsSnapshotTest.kt`:

```kotlin
// Snapshots dos componentes comuns do PiuDS (frente C, plano C2): os que as
// duas jornadas usam, fotografados no tema do adulto, em claro e escuro e
// nas três escalas de fonte.

package com.velosobr.passarim.snapshots

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.velosobr.piuds.components.PiuBlurSurface
import com.velosobr.piuds.components.PiuCookieShape
import com.velosobr.piuds.components.PiuCreditCaption
import com.velosobr.piuds.components.piuBlurSource
import com.velosobr.piuds.components.rememberPiuBlurState
import org.junit.Test

class PiuCommonComponentsSnapshotTest(
    dark: Boolean,
    fontScalePercent: Int,
) : ThemedSnapshotTest(dark, fontScalePercent) {
    /** O crédito com link (sublinhado, na cor primária) e com o link desligado, como no Kids. */
    @Test
    fun credits() =
        snap("credits") {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                PiuCreditCaption("Foto: Fulano · CC BY-NC", onOpenSource = {})
                PiuCreditCaption("Foto: Fulano · CC BY-NC", onOpenSource = {}, linkEnabled = false)
                PiuCreditCaption("Canto: Beltrano · CC BY-SA")
            }
        }

    /**
     * A forma cookie pintada com a primária e a superfície com desfoque sobre um fundo amarelo. O
     * Paparazzi desenha com o renderizador do Android (o mesmo do RenderEffect), então o desfoque
     * aparece na imagem.
     */
    @Test
    fun cookieAndBlur() =
        snap("cookie-and-blur") {
            val blur = rememberPiuBlurState()
            Row(
                Modifier.padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(72.dp).background(MaterialTheme.colorScheme.primary, PiuCookieShape()))
                Box(Modifier.size(96.dp)) {
                    Stripes(Modifier.matchParentSize().piuBlurSource(blur))
                    PiuBlurSurface(
                        state = blur,
                        shape = PiuCookieShape(),
                        tint = MaterialTheme.colorScheme.surface.copy(alpha = 0.6f),
                        modifier = Modifier.size(72.dp).align(Alignment.Center),
                    ) {
                        Text("A", Modifier.align(Alignment.Center))
                    }
                }
            }
        }

    /** Listras pretas e amarelas: num fundo liso, não daria para ver se o desfoque rodou. */
    @Composable
    private fun Stripes(modifier: Modifier) {
        Row(modifier) {
            repeat(8) { i -> Box(Modifier.weight(1f).fillMaxHeight().background(if (i % 2 == 0) Color(0xFFD9A13B) else Color.Black)) }
        }
    }
}
```

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*PiuCommonComponentsSnapshotTest*'`

Expected: 6 imagens novas ou alteradas em `snapshots/src/test/snapshots/images/`. Abra cada uma e confira a 1.0×, 1.3× e 2.0×: nada cortado, nada quebrado no meio da palavra; o desfoque tem de aparecer: as listras ficam borradas sob o cookie.

- [ ] **Step 6: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:piu-ds:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: superfície com desfoque (Haze isolado no PiuBlurSurface) e o PiuNavItem comum"
```

### Task 6: O Pipo como `ImageVector`

O Pipo da prancheta `KidsSistema.dc.html` (viewBox 120 × 120), copiado à mão, caminho por caminho, só na pose normal. Abre a classe de snapshots do Kids.

**Files:**
- Create: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/kids/Pipo.kt`
- Create: `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuKidsComponentsSnapshotTest.kt`
- Record: 3 imagens em `snapshots/src/test/snapshots/images/`

**Interfaces:**
- Produz: `val PiuPipo: ImageVector` em `com.velosobr.piuds.components.kids`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuKidsComponentsSnapshotTest.kt`:

```kotlin
// Snapshots dos componentes do Piu Kids (frente C, plano C2), só no tema
// claro (o Kids não tem escuro) e nas três escalas de fonte. O Pipo não muda
// com a fonte, mas fica na mesma matriz para a base Kids ser uma só.

package com.velosobr.passarim.snapshots

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.velosobr.piuds.components.kids.PiuPipo
import org.junit.Test

class PiuKidsComponentsSnapshotTest(
    fontScalePercent: Int,
) : KidsSnapshotTest(fontScalePercent) {
    /** O Pipo em três tamanhos: o vetor tem de continuar nítido do ícone ao destaque. */
    @Test
    fun pipo() =
        snap("kids-pipo") {
            Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.Bottom) {
                Image(PiuPipo, contentDescription = null, modifier = Modifier.size(32.dp))
                Image(PiuPipo, contentDescription = null, modifier = Modifier.size(64.dp))
                Image(PiuPipo, contentDescription = null, modifier = Modifier.size(120.dp))
            }
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :snapshots:compileDebugUnitTestKotlin`

Expected: FAIL na compilação do módulo `snapshots`: `Unresolved reference 'PiuPipo'` (`./gradlew :snapshots:compileDebugUnitTestKotlin`).

- [ ] **Step 3: Implementar**

Crie `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/kids/Pipo.kt`:

```kotlin
// O Pipo, o passarinho guia do Kids, como ImageVector: um desenho vetorial
// que o Compose pinta em qualquer tamanho sem perder nitidez. Foi copiado à
// mão do SVG da prancheta KidsSistema (viewBox de 120 × 120), caminho por
// caminho, sem conversor. Só a pose normal; as outras vêm com a frente F.

package com.velosobr.piuds.components.kids

import androidx.compose.foundation.Image
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathBuilder
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/** As cores do Pipo (prancheta KidsSistema e README das direções). */
private val PipoYellow = Color(0xFFFFC93C)
private val PipoOrange = Color(0xFFFF8A3D)
private val PipoCoral = Color(0xFFFF6B4A)
private val PipoNavy = Color(0xFF1D2B3A)
private val PipoCheek = Color(0xFFFF9DB5)
private val PipoShadow = Color(0xFFF2E3C6)

/**
 * Um círculo (ou elipse) como caminho: dois arcos de meia volta, de um lado
 * ao outro e de volta. arcTo desenha um pedaço de elipse até o ponto dado.
 */
private fun PathBuilder.ellipse(
    cx: Float,
    cy: Float,
    rx: Float,
    ry: Float = rx,
) {
    moveTo(cx - rx, cy)
    arcTo(rx, ry, 0f, isMoreThanHalf = true, isPositiveArc = false, x1 = cx + rx, y1 = cy)
    arcTo(rx, ry, 0f, isMoreThanHalf = true, isPositiveArc = false, x1 = cx - rx, y1 = cy)
    close()
}

/**
 * O Pipo na pose normal. `by lazy` monta o desenho só na primeira vez que
 * alguém o usa e guarda o resultado. Quando ele é decoração ao lado de um
 * texto, quem o desenha passa contentDescription = null.
 */
val PiuPipo: ImageVector by lazy {
    ImageVector
        .Builder(name = "Pipo", defaultWidth = 120.dp, defaultHeight = 120.dp, viewportWidth = 120f, viewportHeight = 120f)
        .apply {
            // A sombra no chão.
            path(fill = SolidColor(PipoShadow)) { ellipse(60f, 112f, 34f, 6f) }
            // O corpo.
            path(fill = SolidColor(PipoYellow)) {
                moveTo(22f, 70f)
                curveTo(22f, 42f, 40f, 24f, 64f, 24f)
                curveTo(88f, 24f, 100f, 44f, 100f, 64f)
                curveTo(100f, 88f, 82f, 104f, 58f, 104f)
                curveTo(38f, 104f, 22f, 92f, 22f, 70f)
                close()
            }
            // A barriga e a asa, em laranja.
            path(fill = SolidColor(PipoOrange)) {
                moveTo(30f, 74f)
                curveTo(38f, 92f, 62f, 98f, 78f, 90f)
                curveTo(66f, 88f, 48f, 82f, 30f, 74f)
                close()
            }
            path(fill = SolidColor(PipoOrange)) {
                moveTo(40f, 60f)
                curveTo(30f, 64f, 26f, 76f, 34f, 84f)
                curveTo(42f, 80f, 48f, 70f, 46f, 60f)
                close()
            }
            // O olho: o branco, a pupila e o brilho.
            path(fill = SolidColor(Color.White)) { ellipse(74f, 50f, 12f) }
            path(fill = SolidColor(PipoNavy)) { ellipse(77f, 51f, 6f) }
            path(fill = SolidColor(Color.White)) { ellipse(79f, 48f, 2f) }
            // O bico.
            path(fill = SolidColor(PipoCoral)) {
                moveTo(96f, 56f)
                lineTo(114f, 62f)
                lineTo(96f, 68f)
                close()
            }
            // A bochecha, meio transparente.
            path(fill = SolidColor(PipoCheek), fillAlpha = 0.7f) { ellipse(84f, 70f, 5f) }
            // As perninhas: só traço, com a ponta arredondada.
            path(stroke = SolidColor(PipoCoral), strokeLineWidth = 4f, strokeLineCap = StrokeCap.Round) {
                moveTo(50f, 104f)
                lineTo(46f, 114f)
                moveTo(64f, 104f)
                lineTo(66f, 114f)
            }
        }.build()
}

/** Prévia do Pipo no tamanho da prancheta. */
@Preview
@Composable
private fun PiuPipoPreview() {
    Image(PiuPipo, contentDescription = null)
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :snapshots:compileDebugUnitTestKotlin`

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Gravar os snapshots**

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*PiuKidsComponentsSnapshotTest*'`

Expected: 3 imagens novas ou alteradas em `snapshots/src/test/snapshots/images/`. Abra cada uma e confira a 1.0×, 1.3× e 2.0×: nada cortado, nada quebrado no meio da palavra; confira contra o SVG da prancheta (corpo, barriga e asa, olho, bico, bochecha e perninhas).

- [ ] **Step 6: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:piu-ds:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: o Pipo como ImageVector, na pose normal"
```

## PR 5 (`feat/piuds-c2-adultos`, sobre `feat/piuds-c2-comuns`)

```bash
git checkout feat/piuds-c2-comuns
git checkout -b feat/piuds-c2-adultos
```

### Task 7: Chip de bioma

`PiuBiomeChip`: a bolinha com o gradiente do bioma e o nome; selecionado, ganha a primária. É uma aba marcável com alvo de 48 dp.

**Files:**
- Create: `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuAdultSemanticsTest.kt`
- Create: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PiuBiomeChip.kt`
- Create: `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuAdultComponentsSnapshotTest.kt`
- Record: 6 imagens em `snapshots/src/test/snapshots/images/`

**Interfaces:**
- Produz: `PiuBiomeChip(biome: Biome, label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier)` em `com.velosobr.piuds.components.adult`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuAdultSemanticsTest.kt`:

```kotlin
// Testes de acessibilidade dos componentes da jornada adulta: cada clicável
// tem papel, descrição e o alvo mínimo de toque do Piu (48 dp). Rodam no
// Robolectric com runComposeUiTest (veja PiuCommonSemanticsTest).

package com.velosobr.piuds

import androidx.compose.runtime.Composable
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import assertk.assertThat
import assertk.assertions.isEqualTo
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.piuds.components.adult.PiuBiomeChip
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PiuAdultSemanticsTest {
    /** Confere o papel que o leitor de tela anuncia ("botão", "aba"). */
    private fun hasRole(role: Role) = SemanticsMatcher.expectValue(SemanticsProperties.Role, role)

    @Composable
    private fun Adult(content: @Composable () -> Unit) = PiuTheme(content = content)

    @Test
    fun `chip de bioma e uma aba marcavel com alvo de 48 dp`() =
        runComposeUiTest {
            var clicks = 0
            setContent {
                Adult {
                    PiuBiomeChip(Biome.CERRADO, "Cerrado", selected = true, onClick = { clicks++ })
                }
            }
            onNodeWithText("Cerrado")
                .assert(hasRole(Role.Tab))
                .assertIsSelected()
                .assertHeightIsAtLeast(48.dp)
                .performClick()
            assertThat(clicks).isEqualTo(1)
        }

    @Test
    fun `chip de bioma desmarcado e anunciado como nao selecionado`() =
        runComposeUiTest {
            setContent { Adult { PiuBiomeChip(Biome.PAMPA, "Pampa", selected = false, onClick = {}) } }
            onNodeWithText("Pampa").assertIsNotSelected()
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: FAIL na compilação: `Unresolved reference 'PiuBiomeChip'`.

- [ ] **Step 3: Implementar**

Crie `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PiuBiomeChip.kt`:

```kotlin
// Chip de filtro por bioma do Explorar adulto: uma bolinha com o gradiente
// do bioma e o nome. Selecionado, o chip ganha a cor primária, como o chip
// "Todos" da prancheta.

package com.velosobr.piuds.components.adult

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.piuds.components.PiuLightAndDarkPreview
import com.velosobr.piuds.theme.PiuDimens
import com.velosobr.piuds.theme.PiuTheme
import com.velosobr.piuds.theme.toBrush

/**
 * O chip de um bioma. [label] é o nome já traduzido ("Amazônia"). selectable
 * dá ao leitor de tela o papel de opção marcável e o estado
 * "selecionado/não selecionado". A altura mínima é o alvo de 48 dp.
 */
@Composable
fun PiuBiomeChip(
    biome: Biome,
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MaterialTheme.colorScheme
    Surface(
        shape = RoundedCornerShape(24.dp),
        color = if (selected) colors.primary else colors.surface,
        contentColor = if (selected) colors.onPrimary else colors.onSurface,
        border = if (selected) null else BorderStroke(1.dp, colors.outlineVariant),
        modifier =
            modifier
                .defaultMinSize(minHeight = PiuDimens.touchTarget)
                .selectable(selected = selected, role = Role.Tab, onClick = onClick),
    ) {
        Row(
            Modifier.padding(start = 6.dp, end = 14.dp, top = 6.dp, bottom = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(28.dp).background(
                    PiuTheme.tokens.gradients
                        .getValue(biome)
                        .toBrush(),
                    CircleShape,
                ),
            )
            Text(label, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
        }
    }
}

/** Prévia: um chip marcado e um desmarcado, nos dois temas. */
@Preview
@Composable
private fun PiuBiomeChipPreview() {
    PiuLightAndDarkPreview {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PiuBiomeChip(Biome.AMAZONIA, "Amazônia", selected = true, onClick = {})
            PiuBiomeChip(Biome.CERRADO, "Cerrado", selected = false, onClick = {})
        }
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Snapshots**

Crie `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuAdultComponentsSnapshotTest.kt`:

```kotlin
// Snapshots dos componentes da jornada adulta do PiuDS (frente C, plano C2),
// em claro e escuro e nas três escalas de fonte. Sem foto: o fundo dos cards
// é o gradiente do bioma, como no app antes de a foto carregar.

package com.velosobr.passarim.snapshots

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.piuds.components.adult.PiuBiomeChip
import org.junit.Test

class PiuAdultComponentsSnapshotTest(
    dark: Boolean,
    fontScalePercent: Int,
) : ThemedSnapshotTest(dark, fontScalePercent) {
    /** Os seis biomas, o primeiro marcado. FlowRow quebra a linha quando a fonte cresce. */
    @OptIn(ExperimentalLayoutApi::class)
    @Test
    fun biomeChips() =
        snap("biome-chips") {
            FlowRow(
                Modifier.padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                listOf(
                    Biome.AMAZONIA to "Amazônia",
                    Biome.CERRADO to "Cerrado",
                    Biome.MATA_ATLANTICA to "Mata Atlântica",
                    Biome.CAATINGA to "Caatinga",
                    Biome.PANTANAL to "Pantanal",
                    Biome.PAMPA to "Pampa",
                ).forEachIndexed { index, (biome, label) ->
                    PiuBiomeChip(biome, label, selected = index == 0, onClick = {})
                }
            }
        }
}
```

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*PiuAdultComponentsSnapshotTest*'`

Expected: 6 imagens novas ou alteradas em `snapshots/src/test/snapshots/images/`. Abra cada uma e confira a 1.0×, 1.3× e 2.0×: nada cortado, nada quebrado no meio da palavra.

- [ ] **Step 6: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:piu-ds:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: chip de bioma do Piu com o gradiente do bioma"
```

### Task 8: Card do mosaico

`PiuMosaicCard`: a foto inteira, o scrim, o nome em branco e o coração num controle à parte. O coração fica no alto, fora do scrim: o círculo dele usa a cor do scrim (e não o branco translúcido da prancheta) para passar a 3:1 sobre uma foto clara. `PhotoScrim` fica interno e é reusado pela "Ave do dia".

**Files:**
- Modify: `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuAdultSemanticsTest.kt`
- Create: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PhotoScrim.kt`
- Create: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PiuMosaicCard.kt`
- Create: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PiuMosaicHeight.kt`
- Modify: `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuAdultComponentsSnapshotTest.kt`
- Record: 6 imagens em `snapshots/src/test/snapshots/images/`

**Interfaces:**
- Produz: `PiuMosaicCard(name, scientificName, imageUrl: String?, biome: Biome, isFavorite: Boolean, onToggleFavorite: () -> Unit, onClick: () -> Unit, modifier: Modifier = Modifier, height: PiuMosaicHeight = PiuMosaicHeight.TALL)`, `enum class PiuMosaicHeight { TALL, SHORT }` e `internal fun PhotoScrim(modifier, startFraction: Float = PiuTheme.tokens.scrimStart)`.

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuAdultSemanticsTest.kt`:

```kotlin
// Testes de acessibilidade dos componentes da jornada adulta: cada clicável
// tem papel, descrição e o alvo mínimo de toque do Piu (48 dp). Rodam no
// Robolectric com runComposeUiTest (veja PiuCommonSemanticsTest).

package com.velosobr.piuds

import androidx.compose.runtime.Composable
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import assertk.assertThat
import assertk.assertions.isEqualTo
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.piuds.components.adult.PiuBiomeChip
import com.velosobr.piuds.components.adult.PiuMosaicCard
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PiuAdultSemanticsTest {
    /** Confere o papel que o leitor de tela anuncia ("botão", "aba"). */
    private fun hasRole(role: Role) = SemanticsMatcher.expectValue(SemanticsProperties.Role, role)

    @Composable
    private fun Adult(content: @Composable () -> Unit) = PiuTheme(content = content)

    @Test
    fun `chip de bioma e uma aba marcavel com alvo de 48 dp`() =
        runComposeUiTest {
            var clicks = 0
            setContent {
                Adult {
                    PiuBiomeChip(Biome.CERRADO, "Cerrado", selected = true, onClick = { clicks++ })
                }
            }
            onNodeWithText("Cerrado")
                .assert(hasRole(Role.Tab))
                .assertIsSelected()
                .assertHeightIsAtLeast(48.dp)
                .performClick()
            assertThat(clicks).isEqualTo(1)
        }

    @Test
    fun `chip de bioma desmarcado e anunciado como nao selecionado`() =
        runComposeUiTest {
            setContent { Adult { PiuBiomeChip(Biome.PAMPA, "Pampa", selected = false, onClick = {}) } }
            onNodeWithText("Pampa").assertIsNotSelected()
        }

    @Test
    fun `card do mosaico e um botao com o nome e o coracao separado`() =
        runComposeUiTest {
            var opened = 0
            var toggled = 0
            setContent {
                Adult {
                    PiuMosaicCard(
                        name = "Carcará",
                        scientificName = "Caracara plancus",
                        imageUrl = null,
                        biome = Biome.CAATINGA,
                        isFavorite = false,
                        onToggleFavorite = { toggled++ },
                        onClick = { opened++ },
                    )
                }
            }
            onNodeWithText("Carcará").assert(hasRole(Role.Button)).assertHasClickAction()
            onNode(hasContentDescription("Favoritar Carcará"))
                .assertIsOff()
                .assertHeightIsAtLeast(48.dp)
                .assertWidthIsAtLeast(48.dp)
                .performClick()
            assertThat(toggled).isEqualTo(1)
            assertThat(opened).isEqualTo(0)
            onNodeWithText("Carcará").performClick()
            assertThat(opened).isEqualTo(1)
        }

    @Test
    fun `coracao de favorita e anunciado como marcado e para desfavoritar`() =
        runComposeUiTest {
            setContent {
                Adult {
                    PiuMosaicCard("Tuiuiú", "Jabiru mycteria", null, Biome.PANTANAL, isFavorite = true, onToggleFavorite = {}, onClick = {})
                }
            }
            onNode(hasContentDescription("Desfavoritar Tuiuiú")).assertIsOn()
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: FAIL na compilação: `Unresolved reference 'PiuMosaicCard'`.

- [ ] **Step 3: Implementar**

Crie `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PhotoScrim.kt`:

```kotlin
// O scrim das fotos do adulto: o degradê escuro que cobre a parte de baixo
// da foto para o texto branco por cima ter contraste. Usado pelo card do
// mosaico e pela "Ave do dia"; fica interno ao PiuDS.

package com.velosobr.piuds.components.adult

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import com.velosobr.piuds.theme.PiuTheme

/**
 * O scrim: degradê de transparente (até [startFraction] da altura) até o
 * scrim dos tokens, embaixo. Ele dá ao texto branco contraste sobre qualquer
 * foto (a ferramenta de contraste mede o pior caso, foto branca, na faixa
 * mais escura). colorStops dá a posição de cada cor, de 0 (topo) a 1 (base).
 */
@Composable
internal fun PhotoScrim(
    modifier: Modifier,
    startFraction: Float = PiuTheme.tokens.scrimStart,
) {
    val scrim = PiuTheme.tokens.scrim
    Box(modifier.background(Brush.verticalGradient(0f to scrim.copy(alpha = 0f), startFraction to scrim.copy(alpha = 0f), 1f to scrim)))
}
```

Crie `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PiuMosaicCard.kt`:

```kotlin
// Card da grade em mosaico do Explorar adulto (frente E): a foto ocupa o
// card inteiro, um scrim escurece a parte de baixo e o nome vai em branco
// por cima. Duas alturas, alta e baixa, que a grade alterna.

package com.velosobr.piuds.components.adult

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconToggleButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.piuds.components.PiuLightAndDarkPreview
import com.velosobr.piuds.resources.Res
import com.velosobr.piuds.resources.favorite_add
import com.velosobr.piuds.resources.favorite_remove
import com.velosobr.piuds.resources.ic_favorite_filled
import com.velosobr.piuds.resources.ic_favorites
import com.velosobr.piuds.theme.PiuDimens
import com.velosobr.piuds.theme.PiuTheme
import com.velosobr.piuds.theme.toBrush
import org.jetbrains.compose.resources.stringResource
import org.jetbrains.compose.resources.vectorResource

/**
 * Card do mosaico. Sem foto (ou enquanto ela carrega), o fundo é o
 * gradiente do [biome], para o card nunca ficar vazio. O nome e o nome
 * científico ficam sobre o scrim e quebram linha em vez de cortar. O
 * coração fica num círculo translúcido de 44 dp, com alvo de toque de 48 dp,
 * e é um controle à parte: tocar nele favorita, tocar no resto abre a ave.
 */
@Composable
fun PiuMosaicCard(
    name: String,
    scientificName: String,
    imageUrl: String?,
    biome: Biome,
    isFavorite: Boolean,
    onToggleFavorite: () -> Unit,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    height: PiuMosaicHeight = PiuMosaicHeight.TALL,
) {
    Box(
        modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = height.minHeightDp.dp)
            .clip(RoundedCornerShape(24.dp))
            .background(
                PiuTheme.tokens.gradients
                    .getValue(biome)
                    .toBrush(),
            )
            // Role.Button: o leitor de tela diz "botão" depois do nome da ave.
            .clickable(role = Role.Button, onClick = onClick),
    ) {
        if (imageUrl != null) {
            AsyncImage(model = imageUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
        }
        PhotoScrim(Modifier.matchParentSize(), startFraction = 0.4f)
        // O top de 56 dp guarda o lugar do coração: um nome longo empurra o card para baixo, nunca para cima dele.
        Column(Modifier.align(Alignment.BottomStart).padding(start = 14.dp, end = 14.dp, bottom = 12.dp, top = 56.dp)) {
            Text(name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = Color.White)
            Text(
                scientificName,
                style = MaterialTheme.typography.labelMedium,
                fontStyle = FontStyle.Italic,
                color = Color.White.copy(alpha = 0.9f),
            )
        }
        FavoriteBubble(name, isFavorite, onToggleFavorite, Modifier.align(Alignment.TopEnd).padding(6.dp))
    }
}

/**
 * O coração do card: círculo translúcido de 44 dp dentro de um alvo de 48 dp.
 * Ele fica no alto, fora do scrim: o círculo usa a cor do scrim, e não o
 * branco translúcido da prancheta, para o coração branco passar no contraste
 * (3:1) sobre uma foto clara.
 * IconToggleButton é um botão de liga/desliga: o leitor de tela anuncia se
 * está marcado, e a descrição diz o que o toque vai fazer.
 */
@Composable
private fun FavoriteBubble(
    name: String,
    isFavorite: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier,
) {
    val description = stringResource(if (isFavorite) Res.string.favorite_remove else Res.string.favorite_add, name)
    IconToggleButton(checked = isFavorite, onCheckedChange = { onToggle() }, modifier = modifier.size(PiuDimens.touchTarget)) {
        Box(Modifier.size(44.dp).background(PiuTheme.tokens.scrim, CircleShape), contentAlignment = Alignment.Center) {
            Icon(
                vectorResource(if (isFavorite) Res.drawable.ic_favorite_filled else Res.drawable.ic_favorites),
                contentDescription = description,
                tint = Color.White,
                modifier = Modifier.size(22.dp),
            )
        }
    }
}

/** Prévia: um card alto favorito e um baixo, sem foto, nos dois temas. */
@Preview
@Composable
private fun PiuMosaicCardPreview() {
    PiuLightAndDarkPreview {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            PiuMosaicCard(
                name = "Arara-azul-grande",
                scientificName = "Anodorhynchus hyacinthinus",
                imageUrl = null,
                biome = Biome.PANTANAL,
                isFavorite = true,
                onToggleFavorite = {},
                onClick = {},
                modifier = Modifier.weight(1f),
            )
            PiuMosaicCard(
                name = "Carcará",
                scientificName = "Caracara plancus",
                imageUrl = null,
                biome = Biome.CAATINGA,
                isFavorite = false,
                onToggleFavorite = {},
                onClick = {},
                modifier = Modifier.weight(1f),
                height = PiuMosaicHeight.SHORT,
            )
        }
    }
}
```

Crie `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PiuMosaicHeight.kt`:

```kotlin
// As alturas do card do mosaico do Explorar adulto (PiuMosaicCard). A grade
// da frente E alterna as duas para formar o mosaico.

package com.velosobr.piuds.components.adult

/**
 * As duas alturas do card no mosaico (prancheta Explorar: 220 e 168 dp).
 * enum class é um tipo com um conjunto fechado de valores: quem chama só
 * pode escolher TALL ou SHORT, nunca uma altura qualquer.
 */
enum class PiuMosaicHeight(
    internal val minHeightDp: Int,
) {
    TALL(220),
    SHORT(168),
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Snapshots**

Substitua o conteúdo de `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuAdultComponentsSnapshotTest.kt`:

```kotlin
// Snapshots dos componentes da jornada adulta do PiuDS (frente C, plano C2),
// em claro e escuro e nas três escalas de fonte. Sem foto: o fundo dos cards
// é o gradiente do bioma, como no app antes de a foto carregar.

package com.velosobr.passarim.snapshots

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.piuds.components.adult.PiuBiomeChip
import com.velosobr.piuds.components.adult.PiuMosaicCard
import com.velosobr.piuds.components.adult.PiuMosaicHeight
import org.junit.Test

class PiuAdultComponentsSnapshotTest(
    dark: Boolean,
    fontScalePercent: Int,
) : ThemedSnapshotTest(dark, fontScalePercent) {
    /** Os seis biomas, o primeiro marcado. FlowRow quebra a linha quando a fonte cresce. */
    @OptIn(ExperimentalLayoutApi::class)
    @Test
    fun biomeChips() =
        snap("biome-chips") {
            FlowRow(
                Modifier.padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                listOf(
                    Biome.AMAZONIA to "Amazônia",
                    Biome.CERRADO to "Cerrado",
                    Biome.MATA_ATLANTICA to "Mata Atlântica",
                    Biome.CAATINGA to "Caatinga",
                    Biome.PANTANAL to "Pantanal",
                    Biome.PAMPA to "Pampa",
                ).forEachIndexed { index, (biome, label) ->
                    PiuBiomeChip(biome, label, selected = index == 0, onClick = {})
                }
            }
        }

    /**
     * Um card alto e favorito ao lado de um baixo: o nome longo quebra linha em vez de cortar. Lado
     * a lado a 2.0× é o pior caso (o nome científico quebra no meio da palavra): a grade do app passa
     * a uma coluna com fonte a partir de 1.5×, regra que a frente E mantém no mosaico.
     */
    @Test
    fun mosaicCards() =
        snap("mosaic-cards") {
            Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                PiuMosaicCard(
                    name = "Arara-azul-grande",
                    scientificName = "Anodorhynchus hyacinthinus",
                    imageUrl = null,
                    biome = Biome.PANTANAL,
                    isFavorite = true,
                    onToggleFavorite = {},
                    onClick = {},
                    modifier = Modifier.weight(1f),
                )
                PiuMosaicCard(
                    name = "Carcará",
                    scientificName = "Caracara plancus",
                    imageUrl = null,
                    biome = Biome.CAATINGA,
                    isFavorite = false,
                    onToggleFavorite = {},
                    onClick = {},
                    modifier = Modifier.weight(1f),
                    height = PiuMosaicHeight.SHORT,
                )
            }
        }
}
```

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*PiuAdultComponentsSnapshotTest*'`

Expected: 6 imagens novas ou alteradas em `snapshots/src/test/snapshots/images/`. Abra cada uma e confira a 1.0×, 1.3× e 2.0×: nada cortado, nada quebrado no meio da palavra; lado a lado a 2.0× o nome científico quebra no meio da palavra: é o pior caso, e a grade do app passa a uma coluna a partir de 1.5×.

- [ ] **Step 6: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:piu-ds:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: card do mosaico do Piu, com o scrim e o coração à parte"
```

### Task 9: "Ave do dia"

`PiuFeaturedCard`: o card largo com o selo, o nome e o botão de canto em cookie. O selo usa a cor do scrim como fundo, pelo mesmo motivo do coração. O canto é um `PiuPlayAction`, para a descrição do botão ser obrigatória (README do PiuDS, seção 6).

**Files:**
- Modify: `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuAdultSemanticsTest.kt`
- Create: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PiuFeaturedCard.kt`
- Create: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PiuPlayAction.kt`
- Modify: `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuAdultComponentsSnapshotTest.kt`
- Record: 6 imagens em `snapshots/src/test/snapshots/images/`

**Interfaces:**
- Produz: `PiuFeaturedCard(badge, name, scientificName, imageUrl: String?, biome: Biome, onClick: () -> Unit, modifier: Modifier = Modifier, play: PiuPlayAction? = null)` e `data class PiuPlayAction(description: String, playing: Boolean, onClick: () -> Unit)`.
- Consome: `PhotoScrim` (Task 8) e `PiuCookieShape` (Task 3).

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuAdultSemanticsTest.kt`:

```kotlin
// Testes de acessibilidade dos componentes da jornada adulta: cada clicável
// tem papel, descrição e o alvo mínimo de toque do Piu (48 dp). Rodam no
// Robolectric com runComposeUiTest (veja PiuCommonSemanticsTest).

package com.velosobr.piuds

import androidx.compose.runtime.Composable
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import assertk.assertThat
import assertk.assertions.isEqualTo
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.piuds.components.adult.PiuBiomeChip
import com.velosobr.piuds.components.adult.PiuFeaturedCard
import com.velosobr.piuds.components.adult.PiuMosaicCard
import com.velosobr.piuds.components.adult.PiuPlayAction
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PiuAdultSemanticsTest {
    /** Confere o papel que o leitor de tela anuncia ("botão", "aba"). */
    private fun hasRole(role: Role) = SemanticsMatcher.expectValue(SemanticsProperties.Role, role)

    @Composable
    private fun Adult(content: @Composable () -> Unit) = PiuTheme(content = content)

    @Test
    fun `chip de bioma e uma aba marcavel com alvo de 48 dp`() =
        runComposeUiTest {
            var clicks = 0
            setContent {
                Adult {
                    PiuBiomeChip(Biome.CERRADO, "Cerrado", selected = true, onClick = { clicks++ })
                }
            }
            onNodeWithText("Cerrado")
                .assert(hasRole(Role.Tab))
                .assertIsSelected()
                .assertHeightIsAtLeast(48.dp)
                .performClick()
            assertThat(clicks).isEqualTo(1)
        }

    @Test
    fun `chip de bioma desmarcado e anunciado como nao selecionado`() =
        runComposeUiTest {
            setContent { Adult { PiuBiomeChip(Biome.PAMPA, "Pampa", selected = false, onClick = {}) } }
            onNodeWithText("Pampa").assertIsNotSelected()
        }

    @Test
    fun `card do mosaico e um botao com o nome e o coracao separado`() =
        runComposeUiTest {
            var opened = 0
            var toggled = 0
            setContent {
                Adult {
                    PiuMosaicCard(
                        name = "Carcará",
                        scientificName = "Caracara plancus",
                        imageUrl = null,
                        biome = Biome.CAATINGA,
                        isFavorite = false,
                        onToggleFavorite = { toggled++ },
                        onClick = { opened++ },
                    )
                }
            }
            onNodeWithText("Carcará").assert(hasRole(Role.Button)).assertHasClickAction()
            onNode(hasContentDescription("Favoritar Carcará"))
                .assertIsOff()
                .assertHeightIsAtLeast(48.dp)
                .assertWidthIsAtLeast(48.dp)
                .performClick()
            assertThat(toggled).isEqualTo(1)
            assertThat(opened).isEqualTo(0)
            onNodeWithText("Carcará").performClick()
            assertThat(opened).isEqualTo(1)
        }

    @Test
    fun `coracao de favorita e anunciado como marcado e para desfavoritar`() =
        runComposeUiTest {
            setContent {
                Adult {
                    PiuMosaicCard("Tuiuiú", "Jabiru mycteria", null, Biome.PANTANAL, isFavorite = true, onToggleFavorite = {}, onClick = {})
                }
            }
            onNode(hasContentDescription("Desfavoritar Tuiuiú")).assertIsOn()
        }

    @Test
    fun `ave do dia e um botao e o canto e outro botao de 48 dp`() =
        runComposeUiTest {
            var opened = 0
            var played = 0
            setContent {
                Adult {
                    PiuFeaturedCard(
                        badge = "AVE DO DIA · PANTANAL",
                        name = "Tuiuiú",
                        scientificName = "Jabiru mycteria",
                        imageUrl = null,
                        biome = Biome.PANTANAL,
                        onClick = { opened++ },
                        play = PiuPlayAction(description = "Ouvir o canto do Tuiuiú", playing = false, onClick = { played++ }),
                    )
                }
            }
            onNodeWithText("Tuiuiú").assert(hasRole(Role.Button)).assertHasClickAction()
            onNodeWithContentDescription("Ouvir o canto do Tuiuiú")
                .assert(hasRole(Role.Button))
                .assertHeightIsAtLeast(48.dp)
                .assertWidthIsAtLeast(48.dp)
                .performClick()
            assertThat(played).isEqualTo(1)
            assertThat(opened).isEqualTo(0)
        }

    @Test
    fun `ave do dia sem canto nao mostra o botao de canto`() =
        runComposeUiTest {
            setContent {
                Adult {
                    PiuFeaturedCard("AVE DO DIA · CERRADO", "Seriema", "Cariama cristata", null, Biome.CERRADO, onClick = {})
                }
            }
            onAllNodes(hasRole(Role.Button)).assertCountEquals(1)
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: FAIL na compilação: `Unresolved reference 'PiuFeaturedCard'` e `'PiuPlayAction'`.

- [ ] **Step 3: Implementar**

Crie `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PiuFeaturedCard.kt`:

```kotlin
// A "Ave do dia" do Explorar adulto (frente B traz o dado, a frente E a
// tela): card largo com a foto, um selo no alto, o nome e o nome científico
// embaixo e o botão de canto em forma de cookie no canto.

package com.velosobr.piuds.components.adult

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.piuds.components.PiuCookieShape
import com.velosobr.piuds.components.PiuLightAndDarkPreview
import com.velosobr.piuds.resources.Res
import com.velosobr.piuds.resources.ic_pause
import com.velosobr.piuds.resources.ic_play
import com.velosobr.piuds.theme.PiuTheme
import com.velosobr.piuds.theme.toBrush
import org.jetbrains.compose.resources.vectorResource

/**
 * O card da "Ave do dia". [badge] é o texto do selo ("AVE DO DIA ·
 * PANTANAL"), já pronto. Sem canto ([play] nulo), o botão some: a ave do
 * dia pode não ter canto numa linha antiga do catalog. O card cresce para caber nomes longos e fonte grande (no mínimo
 * 196 dp, como na prancheta).
 */
@Composable
fun PiuFeaturedCard(
    badge: String,
    name: String,
    scientificName: String,
    imageUrl: String?,
    biome: Biome,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    play: PiuPlayAction? = null,
) {
    Box(
        modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 196.dp)
            .clip(RoundedCornerShape(28.dp))
            .background(
                PiuTheme.tokens.gradients
                    .getValue(biome)
                    .toBrush(),
            )
            // Role.Button: o leitor de tela diz "botão" depois do nome da ave.
            .clickable(role = Role.Button, onClick = onClick),
    ) {
        if (imageUrl != null) {
            AsyncImage(model = imageUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
        }
        PhotoScrim(Modifier.matchParentSize())
        // O selo fica no alto, fora do scrim: o fundo dele é a própria cor do scrim, e não o branco
        // translúcido da prancheta, para o texto branco passar no contraste sobre uma foto clara.
        Text(
            badge,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            modifier =
                Modifier
                    .align(Alignment.TopStart)
                    .padding(start = 18.dp, top = 16.dp)
                    .background(PiuTheme.tokens.scrim, RoundedCornerShape(14.dp))
                    .padding(horizontal = 12.dp, vertical = 6.dp),
        )
        // O end de 84 dp guarda o lugar do botão de canto; o top de 56 dp, o do selo.
        Column(
            Modifier
                .align(Alignment.BottomStart)
                .padding(start = 18.dp, end = if (play != null) 84.dp else 18.dp, bottom = 16.dp, top = 56.dp),
        ) {
            Text(name, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold, color = Color.White)
            Text(
                scientificName,
                style = MaterialTheme.typography.bodyMedium,
                fontStyle = FontStyle.Italic,
                color = Color.White.copy(alpha = 0.9f),
            )
        }
        if (play != null) {
            PlayButton(play, Modifier.align(Alignment.BottomEnd).padding(16.dp))
        }
    }
}

/**
 * O botão de canto: cookie de 56 dp com o ícone de tocar ou de pausar. As
 * cores são o par primaryContainer/onPrimaryContainer do tema, e não o
 * branco da prancheta: com o fundo branco fixo, o ícone na primária do tema
 * escuro (verde claro) ficaria com 1,7:1. O par passa nos dois temas (13:1
 * no claro, 7:1 no escuro).
 */
@Composable
private fun PlayButton(
    play: PiuPlayAction,
    modifier: Modifier,
) {
    Box(
        modifier
            .size(56.dp)
            .clip(PiuCookieShape())
            .background(MaterialTheme.colorScheme.primaryContainer)
            .clickable(role = Role.Button, onClick = play.onClick)
            .semantics { contentDescription = play.description },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            vectorResource(if (play.playing) Res.drawable.ic_pause else Res.drawable.ic_play),
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onPrimaryContainer,
            modifier = Modifier.size(28.dp),
        )
    }
}

/** Prévia: a "Ave do dia" com o botão de canto, nos dois temas. */
@Preview
@Composable
private fun PiuFeaturedCardPreview() {
    PiuLightAndDarkPreview {
        PiuFeaturedCard(
            badge = "AVE DO DIA · PANTANAL",
            name = "Tuiuiú",
            scientificName = "Jabiru mycteria",
            imageUrl = null,
            biome = Biome.PANTANAL,
            onClick = {},
            play = PiuPlayAction(description = "Ouvir o canto do Tuiuiú", playing = false, onClick = {}),
        )
    }
}
```

Crie `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PiuPlayAction.kt`:

```kotlin
// O botão de canto que um card pode ter (hoje, a "Ave do dia"). Agrupa o que
// o botão precisa num tipo só para que a descrição seja obrigatória: um
// botão só com ícone, sem descrição, fica mudo para o leitor de tela
// (README do PiuDS, seção 6).

package com.velosobr.piuds.components.adult

/**
 * O canto do card. [description] é o que o leitor de tela diz do botão
 * ("Ouvir o canto do Tuiuiú"); [playing] troca o ícone de tocar pelo de
 * pausar; [onClick] toca ou pausa.
 */
data class PiuPlayAction(
    val description: String,
    val playing: Boolean,
    val onClick: () -> Unit,
)
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Snapshots**

Substitua o conteúdo de `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuAdultComponentsSnapshotTest.kt`:

```kotlin
// Snapshots dos componentes da jornada adulta do PiuDS (frente C, plano C2),
// em claro e escuro e nas três escalas de fonte. Sem foto: o fundo dos cards
// é o gradiente do bioma, como no app antes de a foto carregar.

package com.velosobr.passarim.snapshots

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.piuds.components.adult.PiuBiomeChip
import com.velosobr.piuds.components.adult.PiuFeaturedCard
import com.velosobr.piuds.components.adult.PiuMosaicCard
import com.velosobr.piuds.components.adult.PiuMosaicHeight
import com.velosobr.piuds.components.adult.PiuPlayAction
import org.junit.Test

class PiuAdultComponentsSnapshotTest(
    dark: Boolean,
    fontScalePercent: Int,
) : ThemedSnapshotTest(dark, fontScalePercent) {
    /** Os seis biomas, o primeiro marcado. FlowRow quebra a linha quando a fonte cresce. */
    @OptIn(ExperimentalLayoutApi::class)
    @Test
    fun biomeChips() =
        snap("biome-chips") {
            FlowRow(
                Modifier.padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                listOf(
                    Biome.AMAZONIA to "Amazônia",
                    Biome.CERRADO to "Cerrado",
                    Biome.MATA_ATLANTICA to "Mata Atlântica",
                    Biome.CAATINGA to "Caatinga",
                    Biome.PANTANAL to "Pantanal",
                    Biome.PAMPA to "Pampa",
                ).forEachIndexed { index, (biome, label) ->
                    PiuBiomeChip(biome, label, selected = index == 0, onClick = {})
                }
            }
        }

    /**
     * Um card alto e favorito ao lado de um baixo: o nome longo quebra linha em vez de cortar. Lado
     * a lado a 2.0× é o pior caso (o nome científico quebra no meio da palavra): a grade do app passa
     * a uma coluna com fonte a partir de 1.5×, regra que a frente E mantém no mosaico.
     */
    @Test
    fun mosaicCards() =
        snap("mosaic-cards") {
            Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                PiuMosaicCard(
                    name = "Arara-azul-grande",
                    scientificName = "Anodorhynchus hyacinthinus",
                    imageUrl = null,
                    biome = Biome.PANTANAL,
                    isFavorite = true,
                    onToggleFavorite = {},
                    onClick = {},
                    modifier = Modifier.weight(1f),
                )
                PiuMosaicCard(
                    name = "Carcará",
                    scientificName = "Caracara plancus",
                    imageUrl = null,
                    biome = Biome.CAATINGA,
                    isFavorite = false,
                    onToggleFavorite = {},
                    onClick = {},
                    modifier = Modifier.weight(1f),
                    height = PiuMosaicHeight.SHORT,
                )
            }
        }

    /** A "Ave do dia" tocando o canto (ícone de pausa) e outra sem canto (sem o botão). */
    @Test
    fun featuredCard() =
        snap("featured-card") {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                PiuFeaturedCard(
                    badge = "AVE DO DIA · PANTANAL",
                    name = "Tuiuiú",
                    scientificName = "Jabiru mycteria",
                    imageUrl = null,
                    biome = Biome.PANTANAL,
                    onClick = {},
                    play = PiuPlayAction(description = "Pausar o canto do Tuiuiú", playing = true, onClick = {}),
                )
                PiuFeaturedCard(
                    badge = "AVE DO DIA · CERRADO",
                    name = "Seriema",
                    scientificName = "Cariama cristata",
                    imageUrl = null,
                    biome = Biome.CERRADO,
                    onClick = {},
                )
            }
        }
}
```

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*PiuAdultComponentsSnapshotTest*'`

Expected: 6 imagens novas ou alteradas em `snapshots/src/test/snapshots/images/`. Abra cada uma e confira a 1.0×, 1.3× e 2.0×: nada cortado, nada quebrado no meio da palavra.

- [ ] **Step 6: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:piu-ds:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: "Ave do dia" do Piu, com o botão de canto em cookie"
```

### Task 10: Barra flutuante

`PiuFloatingNavBar`: a pílula sobre o `PiuBlurSurface`, com o item ativo expandido pela mola de estado do `PiuMotion`. O rótulo ativo fica numa linha só (`autoSize`): "Configurações" a 2.0× quebrava no meio da palavra. O teste de estado acompanha a largura quadro a quadro, com e sem "reduzir animações".

**Files:**
- Create: `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuFloatingNavBarTest.kt`
- Create: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PiuFloatingNavBar.kt`
- Modify: `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuAdultComponentsSnapshotTest.kt`
- Record: 6 imagens em `snapshots/src/test/snapshots/images/`

**Interfaces:**
- Produz: `PiuFloatingNavBar(items: List<PiuNavItem>, selected: Int, onSelect: (Int) -> Unit, blurState: PiuBlurState, modifier: Modifier = Modifier)`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuFloatingNavBarTest.kt`:

```kotlin
// Testes da barra flutuante do adulto: os itens são abas com o alvo de
// 48 dp, e o item ativo cresce com a mola de estado do PiuMotion, ou de uma
// vez com "reduzir animações" (o "teste de estado" da spec, seção 8).

package com.velosobr.piuds

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.isSelectable
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.width
import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.isEqualTo
import assertk.assertions.isGreaterThan
import assertk.assertions.isTrue
import com.velosobr.piuds.components.PiuNavItem
import com.velosobr.piuds.components.adult.PiuFloatingNavBar
import com.velosobr.piuds.components.kids.PiuPipo
import com.velosobr.piuds.components.rememberPiuBlurState
import com.velosobr.piuds.theme.LocalPiuReduceMotion
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PiuFloatingNavBarTest {
    /** Confere o papel que o leitor de tela anuncia ("aba"). */
    private fun hasRole(role: Role) = SemanticsMatcher.expectValue(SemanticsProperties.Role, role)

    /** Dois destinos com o mesmo ícone: o teste só olha rótulos, papéis e tamanhos. */
    private val navItems = listOf(PiuNavItem(PiuPipo, "Explorar"), PiuNavItem(PiuPipo, "Favoritos"))

    @Test
    fun `itens da barra flutuante sao abas de 48 dp e o inativo e descrito pelo icone`() =
        runComposeUiTest {
            var chosen = -1
            setContent {
                PiuTheme { PiuFloatingNavBar(navItems, selected = 0, onSelect = { chosen = it }, blurState = rememberPiuBlurState()) }
            }
            onNodeWithText("Explorar").assert(hasRole(Role.Tab)).assertIsSelected().assertHeightIsAtLeast(48.dp)
            onNodeWithContentDescription("Favoritos")
                .assertIsNotSelected()
                .assertHeightIsAtLeast(48.dp)
                .assertWidthIsAtLeast(48.dp)
                .performClick()
            assertThat(chosen).isEqualTo(1)
        }

    /**
     * As larguras do item "Favoritos", quadro a quadro, depois de ele virar o ativo.
     * mainClock.autoAdvance = false para o relógio da composição só andar quando o teste mandar:
     * assim dá para ver cada quadro da animação. 30 quadros (meio segundo) bastam para a mola de
     * estado chegar ao fim.
     */
    private fun widthsAfterSelecting(reduceMotion: Boolean): List<Float> {
        var widths = emptyList<Float>()
        runComposeUiTest {
            mainClock.autoAdvance = false
            setContent {
                CompositionLocalProvider(LocalPiuReduceMotion provides reduceMotion) {
                    PiuTheme {
                        var selected by remember { mutableIntStateOf(0) }
                        PiuFloatingNavBar(navItems, selected, onSelect = { selected = it }, blurState = rememberPiuBlurState())
                    }
                }
            }
            mainClock.advanceTimeBy(1_000)
            onAllNodes(isSelectable())[1].performClick()
            widths =
                List(30) {
                    mainClock.advanceTimeByFrame()
                    onAllNodes(isSelectable())[1].getBoundsInRoot().width.value
                }
        }
        return widths
    }

    @Test
    fun `com reduzir animacoes o item ativo da barra flutuante cresce de uma vez`() {
        val widths = widthsAfterSelecting(reduceMotion = true)
        assertThat(widths.last()).isGreaterThan(widths.first())
        assertThat(widths.distinct()).containsExactly(widths.first(), widths.last())
    }

    @Test
    fun `sem reduzir animacoes o item ativo da barra flutuante cresce aos poucos`() {
        val widths = widthsAfterSelecting(reduceMotion = false)
        assertThat(widths.last()).isGreaterThan(widths.first())
        assertThat(widths.any { it > widths.first() && it < widths.last() }).isTrue()
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: FAIL na compilação: `Unresolved reference 'PiuFloatingNavBar'`.

- [ ] **Step 3: Implementar**

Crie `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PiuFloatingNavBar.kt`:

```kotlin
// A barra de navegação flutuante do adulto (frente E): uma pílula com raio
// de 34 dp que flutua sobre o conteúdo, com o item ativo expandido (ícone e
// rótulo) e os outros só com o ícone. É feita sobre Row porque a
// ShortNavigationBar do Material é experimental e não flutua.

package com.velosobr.piuds.components.adult

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.velosobr.piuds.components.PiuBlurState
import com.velosobr.piuds.components.PiuBlurSurface
import com.velosobr.piuds.components.PiuLightAndDarkPreview
import com.velosobr.piuds.components.PiuNavItem
import com.velosobr.piuds.components.rememberPiuBlurState
import com.velosobr.piuds.resources.Res
import com.velosobr.piuds.resources.ic_explore
import com.velosobr.piuds.resources.ic_favorites
import com.velosobr.piuds.resources.ic_settings
import com.velosobr.piuds.theme.PiuDimens
import com.velosobr.piuds.theme.PiuMotion
import org.jetbrains.compose.resources.vectorResource

/**
 * A barra flutuante. [selected] é o índice do item ativo. O fundo é a
 * superfície com desfoque ([PiuBlurSurface]) sobre o conteúdo marcado com
 * [blurState]. selectableGroup diz ao leitor de tela que os itens formam
 * um grupo em que só um fica marcado.
 *
 * O item ativo cresce com a mola de estado do [PiuMotion]
 * (animateContentSize); com "reduzir animações", a troca é seca. Ele ocupa
 * no máximo o espaço que os outros deixam, e o rótulo fica numa linha só,
 * encolhendo o necessário para caber com fonte grande ("Configurações" a
 * 2.0× quebraria no meio da palavra).
 */
@Composable
fun PiuFloatingNavBar(
    items: List<PiuNavItem>,
    selected: Int,
    onSelect: (Int) -> Unit,
    blurState: PiuBlurState,
    modifier: Modifier = Modifier,
) {
    val colors = MaterialTheme.colorScheme
    PiuBlurSurface(
        state = blurState,
        shape = RoundedCornerShape(34.dp),
        tint = colors.surfaceContainerLowest.copy(alpha = 0.82f),
        modifier = modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = 68.dp)
                .padding(horizontal = 8.dp, vertical = 10.dp)
                .selectableGroup(),
            horizontalArrangement = Arrangement.SpaceAround,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            items.forEachIndexed { index, item ->
                val active = index == selected
                Row(
                    // Só o ativo tem weight: ele pode ocupar o que os outros deixam na barra; fill = false
                    // faz com que ele não seja esticado quando o rótulo é curto.
                    Modifier
                        .then(if (active) Modifier.weight(1f, fill = false) else Modifier)
                        .animateContentSize(PiuMotion.state())
                        .defaultMinSize(minWidth = PiuDimens.touchTarget, minHeight = PiuDimens.touchTarget)
                        // O inativo pinta a mesma cor transparente, e não "nada", para a troca não piscar.
                        .background(
                            if (active) colors.secondaryContainer else colors.secondaryContainer.copy(alpha = 0f),
                            RoundedCornerShape(24.dp),
                        ).selectable(selected = active, role = Role.Tab, onClick = { onSelect(index) })
                        .padding(horizontal = if (active) 18.dp else 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // Ativo, o rótulo já está escrito; inativo, o ícone é tudo o que o leitor de tela tem.
                    Icon(
                        item.icon,
                        contentDescription = if (active) null else item.label,
                        tint = if (active) colors.onSecondaryContainer else colors.onSurfaceVariant,
                        modifier = Modifier.size(24.dp),
                    )
                    if (active) {
                        // autoSize escolhe o maior tamanho, até o do estilo, em que o rótulo cabe na linha.
                        val style = MaterialTheme.typography.labelLarge
                        BasicText(
                            item.label,
                            style = style.copy(fontWeight = FontWeight.Bold, color = colors.onSecondaryContainer),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            autoSize = TextAutoSize.StepBased(minFontSize = 10.sp, maxFontSize = style.fontSize),
                        )
                    }
                }
            }
        }
    }
}

/** Prévia: a barra com "Explorar" ativo, nos dois temas. */
@Preview
@Composable
private fun PiuFloatingNavBarPreview() {
    PiuLightAndDarkPreview {
        PiuFloatingNavBar(
            items =
                listOf(
                    PiuNavItem(vectorResource(Res.drawable.ic_explore), "Explorar"),
                    PiuNavItem(vectorResource(Res.drawable.ic_favorites), "Favoritos"),
                    PiuNavItem(vectorResource(Res.drawable.ic_settings), "Configurações"),
                ),
            selected = 0,
            onSelect = {},
            blurState = rememberPiuBlurState(),
        )
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Snapshots**

Substitua o conteúdo de `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuAdultComponentsSnapshotTest.kt`:

```kotlin
// Snapshots dos componentes da jornada adulta do PiuDS (frente C, plano C2),
// em claro e escuro e nas três escalas de fonte. Sem foto: o fundo dos cards
// é o gradiente do bioma, como no app antes de a foto carregar.

package com.velosobr.passarim.snapshots

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.piuds.components.PiuNavItem
import com.velosobr.piuds.components.adult.PiuBiomeChip
import com.velosobr.piuds.components.adult.PiuFeaturedCard
import com.velosobr.piuds.components.adult.PiuFloatingNavBar
import com.velosobr.piuds.components.adult.PiuMosaicCard
import com.velosobr.piuds.components.adult.PiuMosaicHeight
import com.velosobr.piuds.components.adult.PiuPlayAction
import com.velosobr.piuds.components.piuBlurSource
import com.velosobr.piuds.components.rememberPiuBlurState
import com.velosobr.piuds.resources.Res
import com.velosobr.piuds.resources.ic_explore
import com.velosobr.piuds.resources.ic_favorites
import com.velosobr.piuds.resources.ic_settings
import org.jetbrains.compose.resources.vectorResource
import org.junit.Test

class PiuAdultComponentsSnapshotTest(
    dark: Boolean,
    fontScalePercent: Int,
) : ThemedSnapshotTest(dark, fontScalePercent) {
    /** Os seis biomas, o primeiro marcado. FlowRow quebra a linha quando a fonte cresce. */
    @OptIn(ExperimentalLayoutApi::class)
    @Test
    fun biomeChips() =
        snap("biome-chips") {
            FlowRow(
                Modifier.padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                listOf(
                    Biome.AMAZONIA to "Amazônia",
                    Biome.CERRADO to "Cerrado",
                    Biome.MATA_ATLANTICA to "Mata Atlântica",
                    Biome.CAATINGA to "Caatinga",
                    Biome.PANTANAL to "Pantanal",
                    Biome.PAMPA to "Pampa",
                ).forEachIndexed { index, (biome, label) ->
                    PiuBiomeChip(biome, label, selected = index == 0, onClick = {})
                }
            }
        }

    /**
     * Um card alto e favorito ao lado de um baixo: o nome longo quebra linha em vez de cortar. Lado
     * a lado a 2.0× é o pior caso (o nome científico quebra no meio da palavra): a grade do app passa
     * a uma coluna com fonte a partir de 1.5×, regra que a frente E mantém no mosaico.
     */
    @Test
    fun mosaicCards() =
        snap("mosaic-cards") {
            Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                PiuMosaicCard(
                    name = "Arara-azul-grande",
                    scientificName = "Anodorhynchus hyacinthinus",
                    imageUrl = null,
                    biome = Biome.PANTANAL,
                    isFavorite = true,
                    onToggleFavorite = {},
                    onClick = {},
                    modifier = Modifier.weight(1f),
                )
                PiuMosaicCard(
                    name = "Carcará",
                    scientificName = "Caracara plancus",
                    imageUrl = null,
                    biome = Biome.CAATINGA,
                    isFavorite = false,
                    onToggleFavorite = {},
                    onClick = {},
                    modifier = Modifier.weight(1f),
                    height = PiuMosaicHeight.SHORT,
                )
            }
        }

    /** A "Ave do dia" tocando o canto (ícone de pausa) e outra sem canto (sem o botão). */
    @Test
    fun featuredCard() =
        snap("featured-card") {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                PiuFeaturedCard(
                    badge = "AVE DO DIA · PANTANAL",
                    name = "Tuiuiú",
                    scientificName = "Jabiru mycteria",
                    imageUrl = null,
                    biome = Biome.PANTANAL,
                    onClick = {},
                    play = PiuPlayAction(description = "Pausar o canto do Tuiuiú", playing = true, onClick = {}),
                )
                PiuFeaturedCard(
                    badge = "AVE DO DIA · CERRADO",
                    name = "Seriema",
                    scientificName = "Cariama cristata",
                    imageUrl = null,
                    biome = Biome.CERRADO,
                    onClick = {},
                )
            }
        }

    /**
     * A barra flutuante sobre um fundo colorido (o que ela desfoca), com o primeiro e com o último
     * item ativos: "Configurações" é o rótulo mais longo e tem de caber a 2.0×.
     */
    @Test
    fun floatingNavBar() =
        snap("floating-nav-bar") {
            val blur = rememberPiuBlurState()
            val items =
                listOf(
                    PiuNavItem(vectorResource(Res.drawable.ic_explore), "Explorar"),
                    PiuNavItem(vectorResource(Res.drawable.ic_favorites), "Favoritos"),
                    PiuNavItem(vectorResource(Res.drawable.ic_settings), "Configurações"),
                )
            Box(Modifier.padding(16.dp)) {
                Box(Modifier.matchParentSize().piuBlurSource(blur).background(Color(0xFF3E9CB5)))
                Column(Modifier.padding(8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    PiuFloatingNavBar(items, selected = 0, onSelect = {}, blurState = blur)
                    PiuFloatingNavBar(items, selected = 2, onSelect = {}, blurState = blur)
                }
            }
        }
}
```

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*PiuAdultComponentsSnapshotTest*'`

Expected: 6 imagens novas ou alteradas em `snapshots/src/test/snapshots/images/`. Abra cada uma e confira a 1.0×, 1.3× e 2.0×: nada cortado, nada quebrado no meio da palavra; a 2.0×, "Configurações" cabe numa linha.

- [ ] **Step 6: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:piu-ds:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: barra flutuante do Piu, com o rótulo ativo numa linha só"
```

## PR 6 (`feat/piuds-c2-kids`, sobre `feat/piuds-c2-comuns`)

```bash
git checkout feat/piuds-c2-comuns
git checkout -b feat/piuds-c2-kids
```

### Task 11: Botão do Kids que afunda

`PiuSinkingSurface` (interna) é a face apoiada na sombra sólida, que desce ao tocar; `PiuKidsButton` a usa com o laranja e o rótulo azul-noite. A face desce com `offset { }`, e não com padding: a mola de toque passa do ponto, e um padding negativo derrubaria o app. O estado pressionado é conferido aqui, quadro a quadro; o Paparazzi não o fotografa.

**Files:**
- Create: `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuKidsButtonTest.kt`
- Create: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/kids/PiuKidsButton.kt`
- Create: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/kids/PiuSinkingSurface.kt`
- Modify: `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuKidsComponentsSnapshotTest.kt`
- Record: 3 imagens em `snapshots/src/test/snapshots/images/`

**Interfaces:**
- Produz: `PiuKidsButton(text, onClick, modifier = Modifier, icon: ImageVector? = null, height: Dp = PiuKidsDimens.touchTarget, enabled = true, interactionSource: MutableInteractionSource? = null)` e `internal fun PiuSinkingSurface(face: Brush, shadowColor: Color, shadowOffset: Dp, shape: Shape, minHeight: Dp, onClick, modifier, enabled, interactionSource, content)`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuKidsButtonTest.kt`:

```kotlin
// Testes do botão do Kids: é um botão com o alvo de 56 dp do Kids, não
// responde desabilitado e, ao ser pressionado, a face afunda até cobrir a
// sombra: com a mola de toque do PiuMotion, ou de uma vez com "reduzir
// animações" (o "teste de estado" da spec, seção 8).

package com.velosobr.piuds

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.isCloseTo
import assertk.assertions.isEqualTo
import assertk.assertions.isTrue
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.piuds.components.kids.PiuKidsButton
import com.velosobr.piuds.theme.LocalPiuReduceMotion
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PiuKidsButtonTest {
    @Test
    fun `botao do Kids e um botao com alvo de 56 dp`() =
        runComposeUiTest {
            var clicks = 0
            setContent { PiuTheme(journey = Journey.KIDS) { PiuKidsButton("Ouvir!", onClick = { clicks++ }) } }
            onNodeWithText("Ouvir!")
                .assertHasClickAction()
                .assertIsEnabled()
                .assertHeightIsAtLeast(56.dp)
                .performClick()
            assertThat(clicks).isEqualTo(1)
        }

    @Test
    fun `botao do Kids desabilitado nao responde`() =
        runComposeUiTest {
            var clicks = 0
            setContent { PiuTheme(journey = Journey.KIDS) { PiuKidsButton("Ouvir!", onClick = { clicks++ }, enabled = false) } }
            onNodeWithText("Ouvir!").assertIsNotEnabled().performClick()
            assertThat(clicks).isEqualTo(0)
        }

    /**
     * A posição do topo do rótulo, quadro a quadro, enquanto o dedo segura o botão (down sem up).
     * mainClock.autoAdvance = false para o relógio só andar quando o teste mandar.
     */
    private fun labelTopsWhilePressed(reduceMotion: Boolean): List<Float> {
        var tops = emptyList<Float>()
        runComposeUiTest {
            mainClock.autoAdvance = false
            setContent {
                CompositionLocalProvider(LocalPiuReduceMotion provides reduceMotion) {
                    PiuTheme(journey = Journey.KIDS) { PiuKidsButton("Ouvir!", onClick = {}) }
                }
            }
            mainClock.advanceTimeBy(1_000)
            onNodeWithText("Ouvir!").performTouchInput { down(center) }
            tops =
                List(30) {
                    mainClock.advanceTimeByFrame()
                    onNodeWithText("Ouvir!", useUnmergedTree = true).getBoundsInRoot().top.value
                }
        }
        return tops
    }

    @Test
    fun `com reduzir animacoes a face afunda de uma vez`() {
        val tops = labelTopsWhilePressed(reduceMotion = true)
        // A sombra do botão é de 5 dp (buttonShadow dos tokens Kids): é o quanto a face desce.
        assertThat(tops.last() - tops.first()).isCloseTo(5f, 0.5f)
        assertThat(tops.distinct()).containsExactly(tops.first(), tops.last())
    }

    @Test
    fun `sem reduzir animacoes a face afunda aos poucos`() {
        val tops = labelTopsWhilePressed(reduceMotion = false)
        assertThat(tops.last() - tops.first()).isCloseTo(5f, 0.5f)
        assertThat(tops.any { it > tops.first() && it < tops.last() }).isTrue()
    }

    @Test
    fun `ao soltar a face volta ao lugar mesmo passando do ponto com a mola`() =
        runComposeUiTest {
            mainClock.autoAdvance = false
            setContent { PiuTheme(journey = Journey.KIDS) { PiuKidsButton("Ouvir!", onClick = {}) } }
            mainClock.advanceTimeBy(1_000)
            val rest = onNodeWithText("Ouvir!", useUnmergedTree = true).getBoundsInRoot().top.value
            onNodeWithText("Ouvir!").performTouchInput { down(center) }
            repeat(30) { mainClock.advanceTimeByFrame() }
            onNodeWithText("Ouvir!").performTouchInput { up() }
            // Quadro a quadro: a mola que passa do ponto na volta é o caso que derrubava o app.
            repeat(60) {
                mainClock.advanceTimeByFrame()
                onNodeWithText("Ouvir!", useUnmergedTree = true).getBoundsInRoot()
            }
            assertThat(onNodeWithText("Ouvir!", useUnmergedTree = true).getBoundsInRoot().top.value).isCloseTo(rest, 0.5f)
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: FAIL na compilação: `Unresolved reference 'PiuKidsButton'`.

- [ ] **Step 3: Implementar**

Crie `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/kids/PiuKidsButton.kt`:

```kotlin
// O botão "gordinho" do Kids: raio total, de 56 a 72 dp de altura, com a
// sombra sólida que afunda ao tocar. O rótulo é azul-noite sobre o laranja:
// o branco da prancheta não passava no contraste (spec da frente C, 4.3).

package com.velosobr.piuds.components.kids

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.piuds.theme.PiuKidsDimens
import com.velosobr.piuds.theme.PiuTheme

/**
 * Botão do Kids. [height] vai de 56 dp (o alvo mínimo do Kids) a 72 dp. A
 * face é a cor primaryContainer do esquema Kids (o laranja) com o rótulo em
 * onPrimaryContainer (azul-noite), e a sombra é a "buttonShadow" dos tokens.
 * [interactionSource] é opcional, como nos botões do Material: serve para
 * acompanhar (ou simular, nos snapshots) o toque.
 */
@Composable
fun PiuKidsButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    height: Dp = PiuKidsDimens.touchTarget,
    enabled: Boolean = true,
    interactionSource: MutableInteractionSource? = null,
) {
    val colors = MaterialTheme.colorScheme
    val shadow = checkNotNull(PiuTheme.tokens.buttonShadow) { "PiuKidsButton só existe dentro do PiuTheme(journey = KIDS)" }
    PiuSinkingSurface(
        face = SolidColor(colors.primaryContainer),
        shadowColor = shadow.color,
        shadowOffset = shadow.offset,
        shape = RoundedCornerShape(percent = 50),
        minHeight = height.coerceIn(PiuKidsDimens.touchTarget, 72.dp),
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        interactionSource = interactionSource,
    ) {
        Row(
            Modifier.padding(horizontal = 22.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (icon != null) {
                Icon(icon, contentDescription = null, tint = colors.onPrimaryContainer, modifier = Modifier.size(26.dp))
            }
            Text(text, style = MaterialTheme.typography.titleMedium, color = colors.onPrimaryContainer)
        }
    }
}

/** Prévia: o botão normal, o alto e o desabilitado, no tema Kids. */
@Preview
@Composable
private fun PiuKidsButtonPreview() {
    PiuTheme(journey = Journey.KIDS) {
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            PiuKidsButton("Ouvir!", onClick = {})
            PiuKidsButton("Guardar no meu álbum", onClick = {}, height = 72.dp)
            PiuKidsButton("Desabilitado", onClick = {}, enabled = false)
        }
    }
}
```

Crie `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/kids/PiuSinkingSurface.kt`:

```kotlin
// A base dos botões do Kids: uma face colorida apoiada numa "sombra sólida"
// (uma faixa da mesma forma, mais escura, logo abaixo). Ao tocar, a face
// desce até cobrir a sombra, como um botão de brinquedo que afunda, e volta
// ao soltar. Usada pelo PiuKidsButton e pelo PiuWorldCard.

package com.velosobr.piuds.components.kids

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.velosobr.piuds.theme.PiuMotion

/**
 * A superfície que afunda. A altura total é [minHeight] mais a sombra: a
 * sombra fica fixa embaixo, e a face desce [shadowOffset] quando pressionada.
 *
 * MutableInteractionSource é o "canal" por onde o clickable conta o que o
 * dedo está fazendo; collectIsPressedAsState transforma isso num Boolean que
 * redesenha a tela quando muda. animateDpAsState anima o deslocamento com a
 * mola de toque do PiuMotion (seca, com "reduzir animações"). Quem chama pode
 * passar o próprio [interactionSource] para acompanhar o toque (ou, num
 * snapshot, simular o dedo segurando).
 */
@Composable
internal fun PiuSinkingSurface(
    face: Brush,
    shadowColor: Color,
    shadowOffset: Dp,
    shape: Shape,
    minHeight: Dp,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    interactionSource: MutableInteractionSource? = null,
    content: @Composable BoxScope.() -> Unit,
) {
    val interaction = interactionSource ?: remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val sink by animateDpAsState(if (pressed && enabled) shadowOffset else 0.dp, PiuMotion.press(), label = "afundar")
    Box(
        modifier
            .alpha(if (enabled) 1f else 0.5f)
            // indication = null: o retorno visual do toque é o afundar, não a "onda" padrão do Material.
            .clickable(interactionSource = interaction, indication = null, enabled = enabled, role = Role.Button, onClick = onClick),
        // propagateMinConstraints: a largura mínima que vem de fora (um cartão esticado na grade, por
        // exemplo) chega à face, que então ocupa o cartão inteiro em vez de só o tamanho do texto.
        propagateMinConstraints = true,
    ) {
        Box(Modifier.matchParentSize().padding(top = shadowOffset).background(shadowColor, shape))
        Box(
            Modifier
                .padding(bottom = shadowOffset)
                // offset { } desloca a face sem mudar o tamanho de ninguém. A mola de toque passa um
                // pouco do fim e volta (o balanço); com padding, a passada daria um espaço negativo e
                // derrubaria o app. E o estado é lido só na fase de layout: cada quadro da animação
                // reposiciona a face sem recompor o botão.
                .offset { IntOffset(0, sink.roundToPx()) }
                .defaultMinSize(minHeight = minHeight)
                .background(face, shape),
            contentAlignment = Alignment.Center,
            content = content,
        )
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Snapshots**

Substitua o conteúdo de `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuKidsComponentsSnapshotTest.kt`:

```kotlin
// Snapshots dos componentes do Piu Kids (frente C, plano C2), só no tema
// claro (o Kids não tem escuro) e nas três escalas de fonte. O Pipo não muda
// com a fonte, mas fica na mesma matriz para a base Kids ser uma só.

package com.velosobr.passarim.snapshots

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.velosobr.piuds.components.kids.PiuKidsButton
import com.velosobr.piuds.components.kids.PiuPipo
import com.velosobr.piuds.resources.Res
import com.velosobr.piuds.resources.ic_play
import org.jetbrains.compose.resources.vectorResource
import org.junit.Test

class PiuKidsComponentsSnapshotTest(
    fontScalePercent: Int,
) : KidsSnapshotTest(fontScalePercent) {
    /** O Pipo em três tamanhos: o vetor tem de continuar nítido do ícone ao destaque. */
    @Test
    fun pipo() =
        snap("kids-pipo") {
            Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.Bottom) {
                Image(PiuPipo, contentDescription = null, modifier = Modifier.size(32.dp))
                Image(PiuPipo, contentDescription = null, modifier = Modifier.size(64.dp))
                Image(PiuPipo, contentDescription = null, modifier = Modifier.size(120.dp))
            }
        }

    /**
     * O botão normal com ícone, o alto (72 dp) e o desabilitado. O pressionado não aparece aqui: o
     * Compose só fica sabendo do toque por um efeito (LaunchedEffect), e o Paparazzi fotografa antes
     * de os efeitos rodarem. O afundar é conferido no PiuKidsButtonTest, do :core:piu-ds.
     */
    @Test
    fun buttons() =
        snap("kids-buttons") {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                PiuKidsButton("Ouvir!", onClick = {}, icon = vectorResource(Res.drawable.ic_play))
                PiuKidsButton("Guardar no meu álbum", onClick = {}, height = 72.dp)
                PiuKidsButton("Desabilitado", onClick = {}, enabled = false)
            }
        }
}
```

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*PiuKidsComponentsSnapshotTest*'`

Expected: 3 imagens novas ou alteradas em `snapshots/src/test/snapshots/images/`. Abra cada uma e confira a 1.0×, 1.3× e 2.0×: nada cortado, nada quebrado no meio da palavra.

- [ ] **Step 6: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:piu-ds:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: botão do Kids que afunda ao tocar, com a mola de toque do PiuMotion"
```

### Task 12: Cartão de mundo

`PiuWorldCard`: o gradiente do mundo, o nome e o progresso ("4 de 9", vindo de fora), sobre a `PiuSinkingSurface`. A superfície repassa a largura mínima à face (`propagateMinConstraints`), para o cartão esticado na grade ficar cheio.

**Files:**
- Create: `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuKidsSemanticsTest.kt`
- Create: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/kids/PiuWorldCard.kt`
- Modify: `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuKidsComponentsSnapshotTest.kt`
- Record: 3 imagens em `snapshots/src/test/snapshots/images/`

**Interfaces:**
- Produz: `PiuWorldCard(biome: Biome, name: String, onClick: () -> Unit, modifier: Modifier = Modifier, progress: String? = null)`.
- Consome: `PiuSinkingSurface` (Task 11).

- [ ] **Step 1: Escrever o teste que falha**

Crie `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuKidsSemanticsTest.kt`:

```kotlin
// Testes de acessibilidade dos componentes do Kids: cada clicável tem papel,
// descrição e o alvo de toque do Kids (56 dp, porque o dedo da criança é
// menos preciso). Rodam no Robolectric com runComposeUiTest (veja
// PiuCommonSemanticsTest).

package com.velosobr.piuds

import androidx.compose.runtime.Composable
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import assertk.assertThat
import assertk.assertions.isEqualTo
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.piuds.components.kids.PiuWorldCard
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PiuKidsSemanticsTest {
    /** Confere o papel que o leitor de tela anuncia ("botão", "aba"). */
    private fun hasRole(role: Role) = SemanticsMatcher.expectValue(SemanticsProperties.Role, role)

    @Composable
    private fun Kids(content: @Composable () -> Unit) = PiuTheme(journey = Journey.KIDS, content = content)

    @Test
    fun `cartao de mundo e um botao que le o nome e o progresso`() =
        runComposeUiTest {
            var opened = 0
            setContent { Kids { PiuWorldCard(Biome.PAMPA, "Pampa", onClick = { opened++ }, progress = "2 de 3") } }
            onNodeWithText("Pampa")
                .assert(hasRole(Role.Button))
                .assert(hasText("2 de 3"))
                .assertHasClickAction()
                .assertHeightIsAtLeast(56.dp)
                .performClick()
            assertThat(opened).isEqualTo(1)
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: FAIL na compilação: `Unresolved reference 'PiuWorldCard'`.

- [ ] **Step 3: Implementar**

Crie `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/kids/PiuWorldCard.kt`:

```kotlin
// O cartão de um "mundo" (bioma) do Kids: o gradiente do mundo, o nome e,
// no álbum, o progresso ("4 de 9"). Também afunda ao tocar.

package com.velosobr.piuds.components.kids

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.piuds.theme.PiuTheme
import com.velosobr.piuds.theme.toBrush

/**
 * O cartão do mundo [biome]. [name] e [progress] chegam prontos (o progresso
 * vem de fora, das contagens do catalog: nada aqui fixa quantas aves há). O
 * texto usa a cor de texto do próprio mundo, que passa no contraste nas duas
 * pontas do gradiente. A sombra é a ponta escura do gradiente, 25% mais
 * escura (lerp mistura duas cores na proporção dada).
 */
@Composable
fun PiuWorldCard(
    biome: Biome,
    name: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    progress: String? = null,
) {
    val gradient = PiuTheme.tokens.gradients.getValue(biome)
    PiuSinkingSurface(
        face = gradient.toBrush(),
        shadowColor = lerp(gradient.to, Color.Black, 0.25f),
        shadowOffset = 5.dp,
        shape = RoundedCornerShape(26.dp),
        minHeight = 76.dp,
        onClick = onClick,
        modifier = modifier,
    ) {
        Column(
            Modifier.padding(horizontal = 8.dp, vertical = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(name, style = MaterialTheme.typography.titleMedium, color = gradient.content, textAlign = TextAlign.Center)
            if (progress != null) {
                Text(progress, style = MaterialTheme.typography.labelLarge, color = gradient.content, textAlign = TextAlign.Center)
            }
        }
    }
}

/** Prévia: dois mundos lado a lado, um com o progresso do álbum. */
@Preview
@Composable
private fun PiuWorldCardPreview() {
    PiuTheme(journey = Journey.KIDS) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PiuWorldCard(Biome.AMAZONIA, "Amazônia", onClick = {}, modifier = Modifier.weight(1f))
            PiuWorldCard(Biome.CAATINGA, "Caatinga", onClick = {}, progress = "4 de 9", modifier = Modifier.weight(1f))
        }
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Snapshots**

Substitua o conteúdo de `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuKidsComponentsSnapshotTest.kt`:

```kotlin
// Snapshots dos componentes do Piu Kids (frente C, plano C2), só no tema
// claro (o Kids não tem escuro) e nas três escalas de fonte. O Pipo não muda
// com a fonte, mas fica na mesma matriz para a base Kids ser uma só.

package com.velosobr.passarim.snapshots

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.piuds.components.kids.PiuKidsButton
import com.velosobr.piuds.components.kids.PiuPipo
import com.velosobr.piuds.components.kids.PiuWorldCard
import com.velosobr.piuds.resources.Res
import com.velosobr.piuds.resources.ic_play
import org.jetbrains.compose.resources.vectorResource
import org.junit.Test

class PiuKidsComponentsSnapshotTest(
    fontScalePercent: Int,
) : KidsSnapshotTest(fontScalePercent) {
    /** O Pipo em três tamanhos: o vetor tem de continuar nítido do ícone ao destaque. */
    @Test
    fun pipo() =
        snap("kids-pipo") {
            Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.Bottom) {
                Image(PiuPipo, contentDescription = null, modifier = Modifier.size(32.dp))
                Image(PiuPipo, contentDescription = null, modifier = Modifier.size(64.dp))
                Image(PiuPipo, contentDescription = null, modifier = Modifier.size(120.dp))
            }
        }

    /**
     * O botão normal com ícone, o alto (72 dp) e o desabilitado. O pressionado não aparece aqui: o
     * Compose só fica sabendo do toque por um efeito (LaunchedEffect), e o Paparazzi fotografa antes
     * de os efeitos rodarem. O afundar é conferido no PiuKidsButtonTest, do :core:piu-ds.
     */
    @Test
    fun buttons() =
        snap("kids-buttons") {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                PiuKidsButton("Ouvir!", onClick = {}, icon = vectorResource(Res.drawable.ic_play))
                PiuKidsButton("Guardar no meu álbum", onClick = {}, height = 72.dp)
                PiuKidsButton("Desabilitado", onClick = {}, enabled = false)
            }
        }

    /**
     * Os seis mundos em duas colunas, metade com o progresso do álbum. Duas, e não três: a 2.0×,
     * com três colunas, os nomes quebrariam no meio da palavra (regra que a grade da frente F segue).
     */
    @Test
    fun worldCards() =
        snap("kids-world-cards") {
            val worlds =
                listOf(
                    Triple(Biome.AMAZONIA, "Amazônia", null),
                    Triple(Biome.PANTANAL, "Pantanal", "1 de 6"),
                    Triple(Biome.CAATINGA, "Caatinga", "4 de 9"),
                    Triple(Biome.MATA_ATLANTICA, "Mata Atlântica", "0 de 12"),
                    Triple(Biome.CERRADO, "Cerrado", null),
                    Triple(Biome.PAMPA, "Pampa", "2 de 3"),
                )
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                worlds.chunked(2).forEach { pair ->
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        pair.forEach { (biome, name, progress) ->
                            PiuWorldCard(biome, name, onClick = {}, progress = progress, modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }
}
```

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*PiuKidsComponentsSnapshotTest*'`

Expected: 3 imagens novas ou alteradas em `snapshots/src/test/snapshots/images/`. Abra cada uma e confira a 1.0×, 1.3× e 2.0×: nada cortado, nada quebrado no meio da palavra; a face de cada cartão ocupa a coluna inteira.

- [ ] **Step 6: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:piu-ds:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: cartão de mundo do Kids, com o progresso vindo de fora"
```

### Task 13: Figurinhas

`PiuSticker` (a foto em cookie sobre o gradiente do mundo, com borda branca do esquema Kids) e `PiuMissingSticker` (o espaço tracejado com "?", lido como uma frase só).

**Files:**
- Modify: `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuKidsSemanticsTest.kt`
- Create: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/kids/PiuSticker.kt`
- Modify: `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuKidsComponentsSnapshotTest.kt`
- Record: 3 imagens em `snapshots/src/test/snapshots/images/`

**Interfaces:**
- Produz: `PiuSticker(name, biome: Biome, imageUrl: String?, onClick, modifier = Modifier)` e `PiuMissingSticker(label, description, modifier = Modifier)`.

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuKidsSemanticsTest.kt`:

```kotlin
// Testes de acessibilidade dos componentes do Kids: cada clicável tem papel,
// descrição e o alvo de toque do Kids (56 dp, porque o dedo da criança é
// menos preciso). Rodam no Robolectric com runComposeUiTest (veja
// PiuCommonSemanticsTest).

package com.velosobr.piuds

import androidx.compose.runtime.Composable
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHasNoClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import assertk.assertThat
import assertk.assertions.isEqualTo
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.piuds.components.kids.PiuMissingSticker
import com.velosobr.piuds.components.kids.PiuSticker
import com.velosobr.piuds.components.kids.PiuWorldCard
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PiuKidsSemanticsTest {
    /** Confere o papel que o leitor de tela anuncia ("botão", "aba"). */
    private fun hasRole(role: Role) = SemanticsMatcher.expectValue(SemanticsProperties.Role, role)

    @Composable
    private fun Kids(content: @Composable () -> Unit) = PiuTheme(journey = Journey.KIDS, content = content)

    @Test
    fun `cartao de mundo e um botao que le o nome e o progresso`() =
        runComposeUiTest {
            var opened = 0
            setContent { Kids { PiuWorldCard(Biome.PAMPA, "Pampa", onClick = { opened++ }, progress = "2 de 3") } }
            onNodeWithText("Pampa")
                .assert(hasRole(Role.Button))
                .assert(hasText("2 de 3"))
                .assertHasClickAction()
                .assertHeightIsAtLeast(56.dp)
                .performClick()
            assertThat(opened).isEqualTo(1)
        }

    @Test
    fun `figurinha guardada e um botao com o nome da ave`() =
        runComposeUiTest {
            var opened = 0
            setContent { Kids { PiuSticker("Tuiuiú", Biome.PANTANAL, imageUrl = null, onClick = { opened++ }) } }
            onNodeWithText("Tuiuiú").assert(hasRole(Role.Button)).assertHeightIsAtLeast(56.dp).performClick()
            assertThat(opened).isEqualTo(1)
        }

    @Test
    fun `figurinha que falta e lida como uma frase so e nao e clicavel`() =
        runComposeUiTest {
            setContent { Kids { PiuMissingSticker(label = "Ainda falta", description = "figurinha que falta") } }
            onNodeWithContentDescription("figurinha que falta").assertHasNoClickAction()
            // clearAndSetSemantics troca o "?" e o rótulo pela descrição: o leitor de tela não lê o "?".
            onNodeWithText("?").assertDoesNotExist()
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: FAIL na compilação: `Unresolved reference 'PiuSticker'` e `'PiuMissingSticker'`.

- [ ] **Step 3: Implementar**

Crie `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/kids/PiuSticker.kt`:

```kotlin
// A figurinha do álbum do Kids: a foto da ave dentro da forma cookie, na cor
// do mundo, com borda branca. A que ainda falta é um espaço tracejado com
// "?", anunciado como "figurinha que falta".

package com.velosobr.piuds.components.kids

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.piuds.components.PiuCookieShape
import com.velosobr.piuds.theme.PiuTheme
import com.velosobr.piuds.theme.toBrush

/**
 * Uma figurinha guardada: a foto em forma de cookie sobre o gradiente do
 * mundo, com borda branca de 4 dp, e o nome embaixo. Sem foto (ou enquanto
 * carrega), aparece só o gradiente.
 */
@Composable
fun PiuSticker(
    name: String,
    biome: Biome,
    imageUrl: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val cookie = PiuCookieShape()
    Column(
        modifier.clickable(role = Role.Button, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            Modifier
                .size(100.dp)
                // A borda branca da prancheta é o surfaceContainerLowest do esquema Kids.
                .border(4.dp, MaterialTheme.colorScheme.surfaceContainerLowest, cookie)
                .padding(4.dp)
                .clip(cookie)
                .background(
                    PiuTheme.tokens.gradients
                        .getValue(biome)
                        .toBrush(),
                ),
        ) {
            if (imageUrl != null) {
                AsyncImage(model = imageUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            }
        }
        Text(
            name,
            style = MaterialTheme.typography.titleSmall,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onBackground,
        )
    }
}

/**
 * O espaço de uma figurinha que ainda falta: borda tracejada e "?".
 * [label] é o texto embaixo ("Ainda falta") e [description] o que o leitor
 * de tela diz ("figurinha que falta"). clearAndSetSemantics troca tudo o
 * que há dentro (o "?" e o rótulo) por essa única frase.
 */
@Composable
fun PiuMissingSticker(
    label: String,
    description: String,
    modifier: Modifier = Modifier,
) {
    val colors = MaterialTheme.colorScheme
    Column(
        modifier.clearAndSetSemantics { contentDescription = description },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            Modifier
                .padding(4.dp)
                .size(92.dp)
                .drawBehind {
                    // PathEffect.dashPathEffect desenha o contorno em traços de 10 px com 8 px de intervalo.
                    drawRoundRect(
                        color = colors.outline,
                        cornerRadius = CornerRadius(30.dp.toPx()),
                        style = Stroke(width = 3.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 8f))),
                    )
                },
            contentAlignment = Alignment.Center,
        ) {
            Text("?", style = MaterialTheme.typography.displaySmall, color = colors.onSurfaceVariant)
        }
        Text(label, style = MaterialTheme.typography.labelLarge, textAlign = TextAlign.Center, color = colors.onSurfaceVariant)
    }
}

/** Prévia: uma figurinha guardada (sem foto, só o gradiente) e uma que falta. */
@Preview
@Composable
private fun PiuStickerPreview() {
    PiuTheme(journey = Journey.KIDS) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            PiuSticker("Tuiuiú", Biome.PANTANAL, imageUrl = null, onClick = {})
            PiuMissingSticker(label = "Ainda falta", description = "figurinha que falta")
        }
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Snapshots**

Substitua o conteúdo de `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuKidsComponentsSnapshotTest.kt`:

```kotlin
// Snapshots dos componentes do Piu Kids (frente C, plano C2), só no tema
// claro (o Kids não tem escuro) e nas três escalas de fonte. O Pipo não muda
// com a fonte, mas fica na mesma matriz para a base Kids ser uma só.

package com.velosobr.passarim.snapshots

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.piuds.components.kids.PiuKidsButton
import com.velosobr.piuds.components.kids.PiuMissingSticker
import com.velosobr.piuds.components.kids.PiuPipo
import com.velosobr.piuds.components.kids.PiuSticker
import com.velosobr.piuds.components.kids.PiuWorldCard
import com.velosobr.piuds.resources.Res
import com.velosobr.piuds.resources.ic_play
import org.jetbrains.compose.resources.vectorResource
import org.junit.Test

class PiuKidsComponentsSnapshotTest(
    fontScalePercent: Int,
) : KidsSnapshotTest(fontScalePercent) {
    /** O Pipo em três tamanhos: o vetor tem de continuar nítido do ícone ao destaque. */
    @Test
    fun pipo() =
        snap("kids-pipo") {
            Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.Bottom) {
                Image(PiuPipo, contentDescription = null, modifier = Modifier.size(32.dp))
                Image(PiuPipo, contentDescription = null, modifier = Modifier.size(64.dp))
                Image(PiuPipo, contentDescription = null, modifier = Modifier.size(120.dp))
            }
        }

    /**
     * O botão normal com ícone, o alto (72 dp) e o desabilitado. O pressionado não aparece aqui: o
     * Compose só fica sabendo do toque por um efeito (LaunchedEffect), e o Paparazzi fotografa antes
     * de os efeitos rodarem. O afundar é conferido no PiuKidsButtonTest, do :core:piu-ds.
     */
    @Test
    fun buttons() =
        snap("kids-buttons") {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                PiuKidsButton("Ouvir!", onClick = {}, icon = vectorResource(Res.drawable.ic_play))
                PiuKidsButton("Guardar no meu álbum", onClick = {}, height = 72.dp)
                PiuKidsButton("Desabilitado", onClick = {}, enabled = false)
            }
        }

    /**
     * Os seis mundos em duas colunas, metade com o progresso do álbum. Duas, e não três: a 2.0×,
     * com três colunas, os nomes quebrariam no meio da palavra (regra que a grade da frente F segue).
     */
    @Test
    fun worldCards() =
        snap("kids-world-cards") {
            val worlds =
                listOf(
                    Triple(Biome.AMAZONIA, "Amazônia", null),
                    Triple(Biome.PANTANAL, "Pantanal", "1 de 6"),
                    Triple(Biome.CAATINGA, "Caatinga", "4 de 9"),
                    Triple(Biome.MATA_ATLANTICA, "Mata Atlântica", "0 de 12"),
                    Triple(Biome.CERRADO, "Cerrado", null),
                    Triple(Biome.PAMPA, "Pampa", "2 de 3"),
                )
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                worlds.chunked(2).forEach { pair ->
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        pair.forEach { (biome, name, progress) ->
                            PiuWorldCard(biome, name, onClick = {}, progress = progress, modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }

    /** Duas figurinhas guardadas (sem foto, só o gradiente do mundo) e a que falta, tracejada. */
    @Test
    fun stickers() =
        snap("kids-stickers") {
            Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                PiuSticker("Tuiuiú", Biome.PANTANAL, imageUrl = null, onClick = {})
                PiuSticker("Arara-azul", Biome.CERRADO, imageUrl = null, onClick = {})
                PiuMissingSticker(label = "Ainda falta", description = "figurinha que falta")
            }
        }
}
```

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*PiuKidsComponentsSnapshotTest*'`

Expected: 3 imagens novas ou alteradas em `snapshots/src/test/snapshots/images/`. Abra cada uma e confira a 1.0×, 1.3× e 2.0×: nada cortado, nada quebrado no meio da palavra.

- [ ] **Step 6: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:piu-ds:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: figurinhas do Kids, a guardada em cookie e a que falta tracejada"
```

### Task 14: Balão do Pipo

`PiuPipoBalloon`: o Pipo de 64 dp, decorativo, e o balão branco com a sombra sólida dos cartões.

**Files:**
- Modify: `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuKidsSemanticsTest.kt`
- Create: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/kids/PiuPipoBalloon.kt`
- Modify: `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuKidsComponentsSnapshotTest.kt`
- Record: 3 imagens em `snapshots/src/test/snapshots/images/`

**Interfaces:**
- Produz: `PiuPipoBalloon(text: String, modifier: Modifier = Modifier)`.
- Consome: `PiuPipo` (Task 6).

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuKidsSemanticsTest.kt`:

```kotlin
// Testes de acessibilidade dos componentes do Kids: cada clicável tem papel,
// descrição e o alvo de toque do Kids (56 dp, porque o dedo da criança é
// menos preciso). Rodam no Robolectric com runComposeUiTest (veja
// PiuCommonSemanticsTest).

package com.velosobr.piuds

import androidx.compose.runtime.Composable
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHasNoClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import assertk.assertThat
import assertk.assertions.isEqualTo
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.piuds.components.kids.PiuMissingSticker
import com.velosobr.piuds.components.kids.PiuPipoBalloon
import com.velosobr.piuds.components.kids.PiuSticker
import com.velosobr.piuds.components.kids.PiuWorldCard
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PiuKidsSemanticsTest {
    /** Confere o papel que o leitor de tela anuncia ("botão", "aba"). */
    private fun hasRole(role: Role) = SemanticsMatcher.expectValue(SemanticsProperties.Role, role)

    /** Qualquer nó com descrição para o leitor de tela. */
    private fun hasAnyContentDescription() = SemanticsMatcher.keyIsDefined(SemanticsProperties.ContentDescription)

    @Composable
    private fun Kids(content: @Composable () -> Unit) = PiuTheme(journey = Journey.KIDS, content = content)

    @Test
    fun `cartao de mundo e um botao que le o nome e o progresso`() =
        runComposeUiTest {
            var opened = 0
            setContent { Kids { PiuWorldCard(Biome.PAMPA, "Pampa", onClick = { opened++ }, progress = "2 de 3") } }
            onNodeWithText("Pampa")
                .assert(hasRole(Role.Button))
                .assert(hasText("2 de 3"))
                .assertHasClickAction()
                .assertHeightIsAtLeast(56.dp)
                .performClick()
            assertThat(opened).isEqualTo(1)
        }

    @Test
    fun `figurinha guardada e um botao com o nome da ave`() =
        runComposeUiTest {
            var opened = 0
            setContent { Kids { PiuSticker("Tuiuiú", Biome.PANTANAL, imageUrl = null, onClick = { opened++ }) } }
            onNodeWithText("Tuiuiú").assert(hasRole(Role.Button)).assertHeightIsAtLeast(56.dp).performClick()
            assertThat(opened).isEqualTo(1)
        }

    @Test
    fun `figurinha que falta e lida como uma frase so e nao e clicavel`() =
        runComposeUiTest {
            setContent { Kids { PiuMissingSticker(label = "Ainda falta", description = "figurinha que falta") } }
            onNodeWithContentDescription("figurinha que falta").assertHasNoClickAction()
            // clearAndSetSemantics troca o "?" e o rótulo pela descrição: o leitor de tela não lê o "?".
            onNodeWithText("?").assertDoesNotExist()
        }

    @Test
    fun `balao do Pipo le so a frase e o Pipo e decoracao`() =
        runComposeUiTest {
            setContent { Kids { PiuPipoBalloon("Qual ave vamos conhecer hoje?") } }
            onNodeWithText("Qual ave vamos conhecer hoje?").assertExists()
            // Nenhum nó com descrição: o desenho do Pipo não é anunciado.
            onAllNodes(hasAnyContentDescription(), useUnmergedTree = true).assertCountEquals(0)
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: FAIL na compilação: `Unresolved reference 'PiuPipoBalloon'`.

- [ ] **Step 3: Implementar**

Crie `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/kids/PiuPipoBalloon.kt`:

```kotlin
// O balão de fala do Pipo ("Qual ave vamos conhecer hoje?"), com o Pipo ao
// lado. O Pipo aqui é decoração: o leitor de tela lê só a frase do balão.

package com.velosobr.piuds.components.kids

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.piuds.theme.PiuTheme

/**
 * O Pipo de 64 dp e o balão branco com a [text]. O balão tem raio de 22 dp e
 * a sombra sólida dos cartões do Kids, 3 dp abaixo (desenhada como uma caixa
 * da cor da sombra atrás do balão).
 */
@Composable
fun PiuPipoBalloon(
    text: String,
    modifier: Modifier = Modifier,
) {
    val shadow = checkNotNull(PiuTheme.tokens.cardShadow) { "PiuPipoBalloon só existe dentro do PiuTheme(journey = KIDS)" }
    val shape = RoundedCornerShape(22.dp)
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
        Image(PiuPipo, contentDescription = null, modifier = Modifier.size(64.dp))
        Box(Modifier.weight(1f)) {
            Box(Modifier.matchParentSize().padding(top = 3.dp).background(shadow.color, shape))
            Text(
                text,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier =
                    Modifier
                        .padding(bottom = 3.dp)
                        .background(MaterialTheme.colorScheme.surfaceContainerLowest, shape)
                        .padding(horizontal = 16.dp, vertical = 12.dp),
            )
        }
    }
}

/** Prévia do balão com a frase da prancheta. */
@Preview
@Composable
private fun PiuPipoBalloonPreview() {
    PiuTheme(journey = Journey.KIDS) {
        PiuPipoBalloon("Qual ave vamos conhecer hoje?")
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Snapshots**

Substitua o conteúdo de `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuKidsComponentsSnapshotTest.kt`:

```kotlin
// Snapshots dos componentes do Piu Kids (frente C, plano C2), só no tema
// claro (o Kids não tem escuro) e nas três escalas de fonte. O Pipo não muda
// com a fonte, mas fica na mesma matriz para a base Kids ser uma só.

package com.velosobr.passarim.snapshots

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.piuds.components.kids.PiuKidsButton
import com.velosobr.piuds.components.kids.PiuMissingSticker
import com.velosobr.piuds.components.kids.PiuPipo
import com.velosobr.piuds.components.kids.PiuPipoBalloon
import com.velosobr.piuds.components.kids.PiuSticker
import com.velosobr.piuds.components.kids.PiuWorldCard
import com.velosobr.piuds.resources.Res
import com.velosobr.piuds.resources.ic_play
import org.jetbrains.compose.resources.vectorResource
import org.junit.Test

class PiuKidsComponentsSnapshotTest(
    fontScalePercent: Int,
) : KidsSnapshotTest(fontScalePercent) {
    /** O Pipo em três tamanhos: o vetor tem de continuar nítido do ícone ao destaque. */
    @Test
    fun pipo() =
        snap("kids-pipo") {
            Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.Bottom) {
                Image(PiuPipo, contentDescription = null, modifier = Modifier.size(32.dp))
                Image(PiuPipo, contentDescription = null, modifier = Modifier.size(64.dp))
                Image(PiuPipo, contentDescription = null, modifier = Modifier.size(120.dp))
            }
        }

    /**
     * O botão normal com ícone, o alto (72 dp) e o desabilitado. O pressionado não aparece aqui: o
     * Compose só fica sabendo do toque por um efeito (LaunchedEffect), e o Paparazzi fotografa antes
     * de os efeitos rodarem. O afundar é conferido no PiuKidsButtonTest, do :core:piu-ds.
     */
    @Test
    fun buttons() =
        snap("kids-buttons") {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                PiuKidsButton("Ouvir!", onClick = {}, icon = vectorResource(Res.drawable.ic_play))
                PiuKidsButton("Guardar no meu álbum", onClick = {}, height = 72.dp)
                PiuKidsButton("Desabilitado", onClick = {}, enabled = false)
            }
        }

    /**
     * Os seis mundos em duas colunas, metade com o progresso do álbum. Duas, e não três: a 2.0×,
     * com três colunas, os nomes quebrariam no meio da palavra (regra que a grade da frente F segue).
     */
    @Test
    fun worldCards() =
        snap("kids-world-cards") {
            val worlds =
                listOf(
                    Triple(Biome.AMAZONIA, "Amazônia", null),
                    Triple(Biome.PANTANAL, "Pantanal", "1 de 6"),
                    Triple(Biome.CAATINGA, "Caatinga", "4 de 9"),
                    Triple(Biome.MATA_ATLANTICA, "Mata Atlântica", "0 de 12"),
                    Triple(Biome.CERRADO, "Cerrado", null),
                    Triple(Biome.PAMPA, "Pampa", "2 de 3"),
                )
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                worlds.chunked(2).forEach { pair ->
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        pair.forEach { (biome, name, progress) ->
                            PiuWorldCard(biome, name, onClick = {}, progress = progress, modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }

    /** Duas figurinhas guardadas (sem foto, só o gradiente do mundo) e a que falta, tracejada. */
    @Test
    fun stickers() =
        snap("kids-stickers") {
            Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                PiuSticker("Tuiuiú", Biome.PANTANAL, imageUrl = null, onClick = {})
                PiuSticker("Arara-azul", Biome.CERRADO, imageUrl = null, onClick = {})
                PiuMissingSticker(label = "Ainda falta", description = "figurinha que falta")
            }
        }

    /** O balão com uma frase curta e com uma longa, que quebra linha ao lado do Pipo. */
    @Test
    fun pipoBalloon() =
        snap("kids-pipo-balloon") {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                PiuPipoBalloon("Qual ave vamos conhecer hoje?")
                PiuPipoBalloon("Você já guardou 4 figurinhas da Caatinga. Falta pouco para completar o mundo!")
            }
        }
}
```

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*PiuKidsComponentsSnapshotTest*'`

Expected: 3 imagens novas ou alteradas em `snapshots/src/test/snapshots/images/`. Abra cada uma e confira a 1.0×, 1.3× e 2.0×: nada cortado, nada quebrado no meio da palavra.

- [ ] **Step 6: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:piu-ds:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: balão de fala do Pipo"
```

### Task 15: Barra do Kids

`PiuKidsNavBar`: a barra escura com o item ativo em amarelo. Os rótulos sempre aparecem e ficam numa linha só (`autoSize`), com pesos que dão mais espaço ao ativo: "Ajustes" a 2.0× quebrava no meio da palavra.

**Files:**
- Modify: `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuKidsSemanticsTest.kt`
- Create: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/kids/PiuKidsNavBar.kt`
- Modify: `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuKidsComponentsSnapshotTest.kt`
- Record: 3 imagens em `snapshots/src/test/snapshots/images/`

**Interfaces:**
- Produz: `PiuKidsNavBar(items: List<PiuNavItem>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier)`.
- Consome: `PiuNavItem` (Task 5).

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuKidsSemanticsTest.kt`:

```kotlin
// Testes de acessibilidade dos componentes do Kids: cada clicável tem papel,
// descrição e o alvo de toque do Kids (56 dp, porque o dedo da criança é
// menos preciso). Rodam no Robolectric com runComposeUiTest (veja
// PiuCommonSemanticsTest).

package com.velosobr.piuds

import androidx.compose.runtime.Composable
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHasNoClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import assertk.assertThat
import assertk.assertions.isEqualTo
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.piuds.components.PiuNavItem
import com.velosobr.piuds.components.kids.PiuKidsNavBar
import com.velosobr.piuds.components.kids.PiuMissingSticker
import com.velosobr.piuds.components.kids.PiuPipo
import com.velosobr.piuds.components.kids.PiuPipoBalloon
import com.velosobr.piuds.components.kids.PiuSticker
import com.velosobr.piuds.components.kids.PiuWorldCard
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PiuKidsSemanticsTest {
    /** Confere o papel que o leitor de tela anuncia ("botão", "aba"). */
    private fun hasRole(role: Role) = SemanticsMatcher.expectValue(SemanticsProperties.Role, role)

    /** Qualquer nó com descrição para o leitor de tela. */
    private fun hasAnyContentDescription() = SemanticsMatcher.keyIsDefined(SemanticsProperties.ContentDescription)

    @Composable
    private fun Kids(content: @Composable () -> Unit) = PiuTheme(journey = Journey.KIDS, content = content)

    @Test
    fun `cartao de mundo e um botao que le o nome e o progresso`() =
        runComposeUiTest {
            var opened = 0
            setContent { Kids { PiuWorldCard(Biome.PAMPA, "Pampa", onClick = { opened++ }, progress = "2 de 3") } }
            onNodeWithText("Pampa")
                .assert(hasRole(Role.Button))
                .assert(hasText("2 de 3"))
                .assertHasClickAction()
                .assertHeightIsAtLeast(56.dp)
                .performClick()
            assertThat(opened).isEqualTo(1)
        }

    @Test
    fun `figurinha guardada e um botao com o nome da ave`() =
        runComposeUiTest {
            var opened = 0
            setContent { Kids { PiuSticker("Tuiuiú", Biome.PANTANAL, imageUrl = null, onClick = { opened++ }) } }
            onNodeWithText("Tuiuiú").assert(hasRole(Role.Button)).assertHeightIsAtLeast(56.dp).performClick()
            assertThat(opened).isEqualTo(1)
        }

    @Test
    fun `figurinha que falta e lida como uma frase so e nao e clicavel`() =
        runComposeUiTest {
            setContent { Kids { PiuMissingSticker(label = "Ainda falta", description = "figurinha que falta") } }
            onNodeWithContentDescription("figurinha que falta").assertHasNoClickAction()
            // clearAndSetSemantics troca o "?" e o rótulo pela descrição: o leitor de tela não lê o "?".
            onNodeWithText("?").assertDoesNotExist()
        }

    @Test
    fun `balao do Pipo le so a frase e o Pipo e decoracao`() =
        runComposeUiTest {
            setContent { Kids { PiuPipoBalloon("Qual ave vamos conhecer hoje?") } }
            onNodeWithText("Qual ave vamos conhecer hoje?").assertExists()
            // Nenhum nó com descrição: o desenho do Pipo não é anunciado.
            onAllNodes(hasAnyContentDescription(), useUnmergedTree = true).assertCountEquals(0)
        }

    @Test
    fun `itens da barra do Kids sao abas de 56 dp sempre com o rotulo`() =
        runComposeUiTest {
            var chosen = -1
            val items = listOf(PiuNavItem(PiuPipo, "Explorar"), PiuNavItem(PiuPipo, "Álbum"))
            setContent { Kids { PiuKidsNavBar(items, selected = 0, onSelect = { chosen = it }) } }
            onNodeWithText("Explorar").assert(hasRole(Role.Tab)).assertIsSelected().assertHeightIsAtLeast(56.dp)
            onNodeWithText("Álbum")
                .assert(hasRole(Role.Tab))
                .assertIsNotSelected()
                .assertHeightIsAtLeast(56.dp)
                .assertWidthIsAtLeast(56.dp)
                .performClick()
            assertThat(chosen).isEqualTo(1)
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: FAIL na compilação: `Unresolved reference 'PiuKidsNavBar'`.

- [ ] **Step 3: Implementar**

Crie `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/kids/PiuKidsNavBar.kt`:

```kotlin
// A barra de navegação do Kids: escura, flutuante, com raio de 38 dp e 76 dp
// de altura. O item ativo fica amarelo, com ícone e rótulo grandes; os
// outros mostram o ícone e um rótulo pequeno embaixo.

package com.velosobr.piuds.components.kids

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.piuds.components.PiuNavItem
import com.velosobr.piuds.resources.Res
import com.velosobr.piuds.resources.ic_explore
import com.velosobr.piuds.resources.ic_favorites
import com.velosobr.piuds.resources.ic_settings
import com.velosobr.piuds.theme.PiuKidsDimens
import com.velosobr.piuds.theme.PiuMotion
import com.velosobr.piuds.theme.PiuTheme
import org.jetbrains.compose.resources.vectorResource

/**
 * A barra do Kids. O fundo é o inverseSurface do esquema Kids (azul-noite),
 * o item ativo o inversePrimary (o amarelo do Pipo) com o texto em
 * onSurface, e os inativos o inverseOnSurface (o creme). Todo item tem o
 * alvo de 56 dp do Kids. Os rótulos sempre aparecem: no Kids, ícone sozinho
 * não basta para quem ainda está aprendendo a ler os ícones. Cada rótulo
 * fica numa linha só e encolhe o necessário para caber com fonte grande
 * ("Ajustes" a 2.0× quebraria no meio da palavra).
 */
@Composable
fun PiuKidsNavBar(
    items: List<PiuNavItem>,
    selected: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MaterialTheme.colorScheme
    Row(
        modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 76.dp)
            .clip(RoundedCornerShape(38.dp))
            .background(colors.inverseSurface)
            .padding(horizontal = 10.dp, vertical = 10.dp)
            .selectableGroup(),
        horizontalArrangement = Arrangement.SpaceAround,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        items.forEachIndexed { index, item ->
            val active = index == selected
            // weight divide a largura que sobra: o ativo pode crescer até uns 45% da barra e cada
            // inativo até uns 28%. fill = false: ninguém é esticado além do que o conteúdo pede.
            val itemModifier =
                Modifier
                    .weight(if (active) 1.6f else 1f, fill = false)
                    .animateContentSize(PiuMotion.state())
                    .defaultMinSize(minWidth = 72.dp, minHeight = PiuKidsDimens.touchTarget)
                    .clip(RoundedCornerShape(28.dp))
                    .background(if (active) colors.inversePrimary else colors.inverseSurface)
                    .selectable(selected = active, role = Role.Tab, onClick = { onSelect(index) })
            if (active) {
                Row(
                    itemModifier.padding(horizontal = 18.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(item.icon, contentDescription = null, tint = colors.onSurface, modifier = Modifier.size(26.dp))
                    OneLineLabel(item.label, MaterialTheme.typography.titleMedium.copy(color = colors.onSurface))
                }
            } else {
                Column(
                    itemModifier.padding(horizontal = 6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterVertically),
                ) {
                    Icon(item.icon, contentDescription = null, tint = colors.inverseOnSurface, modifier = Modifier.size(24.dp))
                    OneLineLabel(
                        item.label,
                        MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.ExtraBold, color = colors.inverseOnSurface),
                    )
                }
            }
        }
    }
}

/** Um rótulo numa linha só: autoSize escolhe o maior tamanho, até o do [style], em que ele cabe. */
@Composable
private fun OneLineLabel(
    text: String,
    style: TextStyle,
) {
    BasicText(
        text,
        style = style,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        autoSize = TextAutoSize.StepBased(minFontSize = 10.sp, maxFontSize = style.fontSize),
    )
}

/** Prévia: a barra do Kids com "Explorar" ativo. */
@Preview
@Composable
private fun PiuKidsNavBarPreview() {
    PiuTheme(journey = Journey.KIDS) {
        PiuKidsNavBar(
            items =
                listOf(
                    PiuNavItem(vectorResource(Res.drawable.ic_explore), "Explorar"),
                    PiuNavItem(vectorResource(Res.drawable.ic_favorites), "Álbum"),
                    PiuNavItem(vectorResource(Res.drawable.ic_settings), "Ajustes"),
                ),
            selected = 0,
            onSelect = {},
        )
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Snapshots**

Substitua o conteúdo de `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuKidsComponentsSnapshotTest.kt`:

```kotlin
// Snapshots dos componentes do Piu Kids (frente C, plano C2), só no tema
// claro (o Kids não tem escuro) e nas três escalas de fonte. O Pipo não muda
// com a fonte, mas fica na mesma matriz para a base Kids ser uma só.

package com.velosobr.passarim.snapshots

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.piuds.components.PiuNavItem
import com.velosobr.piuds.components.kids.PiuKidsButton
import com.velosobr.piuds.components.kids.PiuKidsNavBar
import com.velosobr.piuds.components.kids.PiuMissingSticker
import com.velosobr.piuds.components.kids.PiuPipo
import com.velosobr.piuds.components.kids.PiuPipoBalloon
import com.velosobr.piuds.components.kids.PiuSticker
import com.velosobr.piuds.components.kids.PiuWorldCard
import com.velosobr.piuds.resources.Res
import com.velosobr.piuds.resources.ic_explore
import com.velosobr.piuds.resources.ic_favorites
import com.velosobr.piuds.resources.ic_play
import com.velosobr.piuds.resources.ic_settings
import org.jetbrains.compose.resources.vectorResource
import org.junit.Test

class PiuKidsComponentsSnapshotTest(
    fontScalePercent: Int,
) : KidsSnapshotTest(fontScalePercent) {
    /** O Pipo em três tamanhos: o vetor tem de continuar nítido do ícone ao destaque. */
    @Test
    fun pipo() =
        snap("kids-pipo") {
            Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.Bottom) {
                Image(PiuPipo, contentDescription = null, modifier = Modifier.size(32.dp))
                Image(PiuPipo, contentDescription = null, modifier = Modifier.size(64.dp))
                Image(PiuPipo, contentDescription = null, modifier = Modifier.size(120.dp))
            }
        }

    /**
     * O botão normal com ícone, o alto (72 dp) e o desabilitado. O pressionado não aparece aqui: o
     * Compose só fica sabendo do toque por um efeito (LaunchedEffect), e o Paparazzi fotografa antes
     * de os efeitos rodarem. O afundar é conferido no PiuKidsButtonTest, do :core:piu-ds.
     */
    @Test
    fun buttons() =
        snap("kids-buttons") {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                PiuKidsButton("Ouvir!", onClick = {}, icon = vectorResource(Res.drawable.ic_play))
                PiuKidsButton("Guardar no meu álbum", onClick = {}, height = 72.dp)
                PiuKidsButton("Desabilitado", onClick = {}, enabled = false)
            }
        }

    /**
     * Os seis mundos em duas colunas, metade com o progresso do álbum. Duas, e não três: a 2.0×,
     * com três colunas, os nomes quebrariam no meio da palavra (regra que a grade da frente F segue).
     */
    @Test
    fun worldCards() =
        snap("kids-world-cards") {
            val worlds =
                listOf(
                    Triple(Biome.AMAZONIA, "Amazônia", null),
                    Triple(Biome.PANTANAL, "Pantanal", "1 de 6"),
                    Triple(Biome.CAATINGA, "Caatinga", "4 de 9"),
                    Triple(Biome.MATA_ATLANTICA, "Mata Atlântica", "0 de 12"),
                    Triple(Biome.CERRADO, "Cerrado", null),
                    Triple(Biome.PAMPA, "Pampa", "2 de 3"),
                )
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                worlds.chunked(2).forEach { pair ->
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        pair.forEach { (biome, name, progress) ->
                            PiuWorldCard(biome, name, onClick = {}, progress = progress, modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }

    /** Duas figurinhas guardadas (sem foto, só o gradiente do mundo) e a que falta, tracejada. */
    @Test
    fun stickers() =
        snap("kids-stickers") {
            Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                PiuSticker("Tuiuiú", Biome.PANTANAL, imageUrl = null, onClick = {})
                PiuSticker("Arara-azul", Biome.CERRADO, imageUrl = null, onClick = {})
                PiuMissingSticker(label = "Ainda falta", description = "figurinha que falta")
            }
        }

    /** O balão com uma frase curta e com uma longa, que quebra linha ao lado do Pipo. */
    @Test
    fun pipoBalloon() =
        snap("kids-pipo-balloon") {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                PiuPipoBalloon("Qual ave vamos conhecer hoje?")
                PiuPipoBalloon("Você já guardou 4 figurinhas da Caatinga. Falta pouco para completar o mundo!")
            }
        }

    /** A barra do Kids com o primeiro e com o segundo item ativos: os rótulos sempre aparecem. */
    @Test
    fun navBar() =
        snap("kids-nav-bar") {
            val items =
                listOf(
                    PiuNavItem(vectorResource(Res.drawable.ic_explore), "Explorar"),
                    PiuNavItem(vectorResource(Res.drawable.ic_favorites), "Álbum"),
                    PiuNavItem(vectorResource(Res.drawable.ic_settings), "Ajustes"),
                )
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                PiuKidsNavBar(items, selected = 0, onSelect = {})
                PiuKidsNavBar(items, selected = 1, onSelect = {})
            }
        }
}
```

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*PiuKidsComponentsSnapshotTest*'`

Expected: 3 imagens novas ou alteradas em `snapshots/src/test/snapshots/images/`. Abra cada uma e confira a 1.0×, 1.3× e 2.0×: nada cortado, nada quebrado no meio da palavra; a 2.0×, "Explorar", "Álbum" e "Ajustes" cabem numa linha.

- [ ] **Step 6: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:piu-ds:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: barra de navegação do Kids, com os rótulos numa linha só"
```

## Correções da revisão final

Depois da Task 15, um revisor independente (agente Opus) leu os três branches. Cada achado Critical ou Important virou uma tarefa com o teste vermelho primeiro, num commit `fix:` no fim do branch do PR. Depois da Task 16, rebaseie os PRs 5 e 6 sobre o PR 4: `git rebase --onto feat/piuds-c2-comuns <ponta antiga do PR 4> <branch>`. Os achados Minor ficaram registrados na descrição dos PRs.

```bash
git checkout feat/piuds-c2-comuns
```

### Task 16: Revisão: o link do crédito com a área de toque de 48 dp

A revisão final achou o link do crédito com uns 35 dp de altura de toque (README do PiuDS, seção 6: 48 dp no Piu). Com link, o crédito ganha altura mínima de 48 dp e o texto fica centralizado; sem link, nada muda.

**Files:**
- Modify: `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuCommonSemanticsTest.kt`
- Modify: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuCreditCaption.kt`
- Record: 6 imagens em `snapshots/src/test/snapshots/images/`

**Interfaces:**
- Muda: o `PiuCreditCaption` com `onOpenSource` e `linkEnabled = true` mede pelo menos 48 dp de altura.

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuCommonSemanticsTest.kt`:

```kotlin
// Testes de acessibilidade dos componentes comuns do PiuDS. A "árvore de
// semântica" é o que o TalkBack e o VoiceOver leem: os testes a consultam
// por texto, descrição ou papel (botão, aba), como um leitor de tela faria.
// runComposeUiTest monta a composição de verdade no Robolectric.

package com.velosobr.piuds

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHasNoClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import assertk.assertThat
import assertk.assertions.isEqualTo
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.piuds.components.PiuBlurSurface
import com.velosobr.piuds.components.PiuCreditCaption
import com.velosobr.piuds.components.piuBlurSource
import com.velosobr.piuds.components.rememberPiuBlurState
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PiuCommonSemanticsTest {
    /** Confere o papel que o leitor de tela anuncia ("botão", "aba"). */
    private fun hasRole(role: Role) = SemanticsMatcher.expectValue(SemanticsProperties.Role, role)

    @Test
    fun `credito com link e um botao que abre a fonte`() =
        runComposeUiTest {
            var opened = 0
            setContent { PiuTheme { PiuCreditCaption("Foto: Fulano", onOpenSource = { opened++ }) } }
            onNodeWithText("Foto: Fulano")
                .assert(hasRole(Role.Button))
                .assertHasClickAction()
                .assertHeightIsAtLeast(48.dp)
                .performClick()
            assertThat(opened).isEqualTo(1)
        }

    @Test
    fun `credito com o link desligado nao e clicavel`() =
        runComposeUiTest {
            setContent {
                PiuTheme(journey = Journey.KIDS) { PiuCreditCaption("Foto: Fulano", onOpenSource = {}, linkEnabled = false) }
            }
            onNodeWithText("Foto: Fulano").assertHasNoClickAction()
        }

    @Test
    fun `superficie com desfoque mostra o conteudo por cima`() =
        runComposeUiTest {
            setContent {
                PiuTheme {
                    val blur = rememberPiuBlurState()
                    Box(Modifier.size(120.dp)) {
                        Box(Modifier.matchParentSize().piuBlurSource(blur).background(Color.Red))
                        PiuBlurSurface(blur, RoundedCornerShape(16.dp), Color.White.copy(alpha = 0.8f), Modifier.size(80.dp)) {
                            Text("Por cima")
                        }
                    }
                }
            }
            onNodeWithText("Por cima").assertIsDisplayed()
        }

    @Test
    fun `credito sem fonte continua so texto`() =
        runComposeUiTest {
            setContent { PiuTheme { PiuCreditCaption("Canto: Beltrano") } }
            onNodeWithText("Canto: Beltrano").assertHasNoClickAction()
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: FAIL: `Actual height is 35.0.dp, expected at least 48.0.dp`.

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuCreditCaption.kt`:

```kotlin
// Legenda de crédito (autor · licença), em letra pequena, com ou sem link
// para a fonte original.
// @Composable: função que desenha interface; Modifier ajusta tamanho, espaço,
// cliques e acessibilidade (veja PiuBackTopBar.kt).

package com.velosobr.piuds.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.tooling.preview.Preview
import com.velosobr.piuds.theme.PiuDimens

/**
 * Mostra o crédito de uma foto ou de um canto, como as licenças CC exigem.
 *
 * Com [onOpenSource], o crédito vira um link sublinhado para a fonte
 * original. [linkEnabled] = false desliga o link mesmo assim: é o modo da
 * jornada Kids, em que nenhuma tela abre um site de fora. O texto do
 * crédito aparece igual nos dois modos.
 */
@Composable
fun PiuCreditCaption(
    text: String,
    modifier: Modifier = Modifier,
    onOpenSource: (() -> Unit)? = null,
    linkEnabled: Boolean = true,
) {
    val link = if (linkEnabled) onOpenSource else null
    Text(
        text,
        style = MaterialTheme.typography.labelSmall,
        color = if (link != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        textDecoration = if (link != null) TextDecoration.Underline else null,
        // Role.Button faz o leitor de tela anunciar que o crédito pode ser tocado. Com link, a área de
        // toque tem a altura mínima de 48 dp (a letra pequena sozinha tem uns 16), e
        // wrapContentHeight centraliza o texto nessa altura.
        modifier =
            if (link != null) {
                modifier
                    .clickable(role = Role.Button, onClick = link)
                    .defaultMinSize(minHeight = PiuDimens.touchTarget)
                    .wrapContentHeight()
            } else {
                modifier
            },
    )
}

/**
 * @Preview desenha a função no painel de pré-visualização do Android Studio,
 * sem rodar o app, aqui no tema claro e no escuro. Os snapshots do módulo
 * snapshots são a referência conferida no CI; a prévia é só para quem está
 * editando o componente.
 */
@Preview
@Composable
private fun PiuCreditCaptionPreview() {
    PiuLightAndDarkPreview {
        Column {
            PiuCreditCaption("Foto: Fulano · CC BY-NC", onOpenSource = {})
            PiuCreditCaption("Foto: Fulano · CC BY-NC", onOpenSource = {}, linkEnabled = false)
        }
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:piu-ds:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: link do crédito com a área de toque de 48 dp (revisão final do C2)"
```

```bash
git checkout feat/piuds-c2-adultos
```

### Task 17: Revisão: o nome da ave legível sobre foto clara

A revisão final mostrou que o scrim por altura do card deixava o nome sobre um degradê ainda claro: numa foto branca, "Carcará" sumia, e a 2.0× o nome subia para a parte sem scrim. O scrim passa a ser ancorado no bloco de texto (`photoTextScrim`): cheio desde o topo do nome, em qualquer altura e escala. O snapshot novo usa uma foto branca falsa pelo `AsyncImagePreviewHandler` do Coil, e o módulo `snapshots` passa a depender do Coil.

**Files:**
- Modify: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PhotoScrim.kt`
- Modify: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PiuFeaturedCard.kt`
- Modify: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PiuMosaicCard.kt`
- Modify: `snapshots/build.gradle.kts`
- Modify: `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuAdultComponentsSnapshotTest.kt`
- Record: 18 imagens em `snapshots/src/test/snapshots/images/`

**Interfaces:**
- Troca: `internal fun PhotoScrim(...)` vira `internal fun Modifier.photoTextScrim(color: Color, fade: Dp = 32.dp): Modifier`, aplicado ao `Column` do texto no `PiuMosaicCard` e no `PiuFeaturedCard`.

- [ ] **Step 1: Ajustar `build.gradle.kts`**

Em `snapshots/build.gradle.kts`, aplique (o diff mostra o arquivo antes e depois):

```diff
diff --git a/snapshots/build.gradle.kts b/snapshots/build.gradle.kts
index 3af1ca2..c315d60 100644
--- a/snapshots/build.gradle.kts
+++ b/snapshots/build.gradle.kts
@@ -17,5 +17,7 @@ dependencies {
     implementation(projects.feature.detail.presentation)
     implementation(projects.feature.favorites.presentation)
     implementation(projects.feature.settings.presentation)
+    // O Coil direto, para os snapshots trocarem a foto da rede por uma imagem falsa (a foto branca).
+    implementation(libs.coil.compose)
     testImplementation(libs.junit4)
 }
```

- [ ] **Step 2: Escrever o teste que falha**

Substitua o conteúdo de `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuAdultComponentsSnapshotTest.kt`:

```kotlin
// Snapshots dos componentes da jornada adulta do PiuDS (frente C, plano C2),
// em claro e escuro e nas três escalas de fonte. Sem foto: o fundo dos cards
// é o gradiente do bioma, como no app antes de a foto carregar.

package com.velosobr.passarim.snapshots

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.unit.dp
import coil3.ColorImage
import coil3.annotation.ExperimentalCoilApi
import coil3.compose.AsyncImagePreviewHandler
import coil3.compose.LocalAsyncImagePreviewHandler
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.piuds.components.PiuNavItem
import com.velosobr.piuds.components.adult.PiuBiomeChip
import com.velosobr.piuds.components.adult.PiuFeaturedCard
import com.velosobr.piuds.components.adult.PiuFloatingNavBar
import com.velosobr.piuds.components.adult.PiuMosaicCard
import com.velosobr.piuds.components.adult.PiuMosaicHeight
import com.velosobr.piuds.components.adult.PiuPlayAction
import com.velosobr.piuds.components.piuBlurSource
import com.velosobr.piuds.components.rememberPiuBlurState
import com.velosobr.piuds.resources.Res
import com.velosobr.piuds.resources.ic_explore
import com.velosobr.piuds.resources.ic_favorites
import com.velosobr.piuds.resources.ic_settings
import org.jetbrains.compose.resources.vectorResource
import org.junit.Test

class PiuAdultComponentsSnapshotTest(
    dark: Boolean,
    fontScalePercent: Int,
) : ThemedSnapshotTest(dark, fontScalePercent) {
    /** Os seis biomas, o primeiro marcado. FlowRow quebra a linha quando a fonte cresce. */
    @OptIn(ExperimentalLayoutApi::class)
    @Test
    fun biomeChips() =
        snap("biome-chips") {
            FlowRow(
                Modifier.padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                listOf(
                    Biome.AMAZONIA to "Amazônia",
                    Biome.CERRADO to "Cerrado",
                    Biome.MATA_ATLANTICA to "Mata Atlântica",
                    Biome.CAATINGA to "Caatinga",
                    Biome.PANTANAL to "Pantanal",
                    Biome.PAMPA to "Pampa",
                ).forEachIndexed { index, (biome, label) ->
                    PiuBiomeChip(biome, label, selected = index == 0, onClick = {})
                }
            }
        }

    /**
     * Um card alto e favorito ao lado de um baixo: o nome longo quebra linha em vez de cortar. Lado
     * a lado a 2.0× é o pior caso (o nome científico quebra no meio da palavra): a grade do app passa
     * a uma coluna com fonte a partir de 1.5×, regra que a frente E mantém no mosaico.
     */
    @Test
    fun mosaicCards() =
        snap("mosaic-cards") {
            Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                PiuMosaicCard(
                    name = "Arara-azul-grande",
                    scientificName = "Anodorhynchus hyacinthinus",
                    imageUrl = null,
                    biome = Biome.PANTANAL,
                    isFavorite = true,
                    onToggleFavorite = {},
                    onClick = {},
                    modifier = Modifier.weight(1f),
                )
                PiuMosaicCard(
                    name = "Carcará",
                    scientificName = "Caracara plancus",
                    imageUrl = null,
                    biome = Biome.CAATINGA,
                    isFavorite = false,
                    onToggleFavorite = {},
                    onClick = {},
                    modifier = Modifier.weight(1f),
                    height = PiuMosaicHeight.SHORT,
                )
            }
        }

    /** A "Ave do dia" tocando o canto (ícone de pausa) e outra sem canto (sem o botão). */
    @Test
    fun featuredCard() =
        snap("featured-card") {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                PiuFeaturedCard(
                    badge = "AVE DO DIA · PANTANAL",
                    name = "Tuiuiú",
                    scientificName = "Jabiru mycteria",
                    imageUrl = null,
                    biome = Biome.PANTANAL,
                    onClick = {},
                    play = PiuPlayAction(description = "Pausar o canto do Tuiuiú", playing = true, onClick = {}),
                )
                PiuFeaturedCard(
                    badge = "AVE DO DIA · CERRADO",
                    name = "Seriema",
                    scientificName = "Cariama cristata",
                    imageUrl = null,
                    biome = Biome.CERRADO,
                    onClick = {},
                )
            }
        }

    /**
     * A barra flutuante sobre um fundo colorido (o que ela desfoca), com o primeiro e com o último
     * item ativos: "Configurações" é o rótulo mais longo e tem de caber a 2.0×.
     */
    @Test
    fun floatingNavBar() =
        snap("floating-nav-bar") {
            val blur = rememberPiuBlurState()
            val items =
                listOf(
                    PiuNavItem(vectorResource(Res.drawable.ic_explore), "Explorar"),
                    PiuNavItem(vectorResource(Res.drawable.ic_favorites), "Favoritos"),
                    PiuNavItem(vectorResource(Res.drawable.ic_settings), "Configurações"),
                )
            Box(Modifier.padding(16.dp)) {
                Box(Modifier.matchParentSize().piuBlurSource(blur).background(Color(0xFF3E9CB5)))
                Column(Modifier.padding(8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    PiuFloatingNavBar(items, selected = 0, onSelect = {}, blurState = blur)
                    PiuFloatingNavBar(items, selected = 2, onSelect = {}, blurState = blur)
                }
            }
        }

    /**
     * O pior caso do texto sobre foto: uma foto toda branca (céu, garça). O Coil, em modo de
     * inspeção (prévias e snapshots), pergunta ao AsyncImagePreviewHandler que imagem mostrar em vez
     * de baixar: aqui, um ColorImage branco. O nome, o nome científico, o selo e o coração precisam
     * continuar legíveis nas três escalas de fonte.
     */
    @OptIn(ExperimentalCoilApi::class)
    @Test
    fun cardsOverWhitePhoto() =
        snap("cards-over-white-photo") {
            CompositionLocalProvider(
                LocalInspectionMode provides true,
                LocalAsyncImagePreviewHandler provides AsyncImagePreviewHandler { ColorImage(Color.White.toArgb()) },
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        PiuMosaicCard(
                            name = "Garça-branca-grande",
                            scientificName = "Ardea alba",
                            imageUrl = "foto-branca",
                            biome = Biome.PANTANAL,
                            isFavorite = false,
                            onToggleFavorite = {},
                            onClick = {},
                            modifier = Modifier.weight(1f),
                        )
                        PiuMosaicCard(
                            name = "Carcará",
                            scientificName = "Caracara plancus",
                            imageUrl = "foto-branca",
                            biome = Biome.CAATINGA,
                            isFavorite = true,
                            onToggleFavorite = {},
                            onClick = {},
                            modifier = Modifier.weight(1f),
                            height = PiuMosaicHeight.SHORT,
                        )
                    }
                    PiuFeaturedCard(
                        badge = "AVE DO DIA · PANTANAL",
                        name = "Tuiuiú",
                        scientificName = "Jabiru mycteria",
                        imageUrl = "foto-branca",
                        biome = Biome.PANTANAL,
                        onClick = {},
                        play = PiuPlayAction(description = "Ouvir o canto do Tuiuiú", playing = false, onClick = {}),
                    )
                }
            }
        }
}
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*PiuAdultComponentsSnapshotTest*'`

Expected: o snapshot `cardsOverWhitePhoto` grava, e a imagem mostra "Carcará" ilegível sobre o branco e "Tuiuiú" com pouco contraste (é o teste vermelho desta tarefa: confira a imagem antes de implementar).

- [ ] **Step 4: Implementar**

Substitua o conteúdo de `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PhotoScrim.kt`:

```kotlin
// O scrim das fotos do adulto: o degradê escuro atrás do nome da ave, para o
// texto branco ter contraste sobre qualquer foto. Usado pelo card do mosaico
// e pela "Ave do dia"; fica interno ao PiuDS.

package com.velosobr.piuds.components.adult

import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Pinta o scrim atrás do bloco de texto a que é aplicado: transparente no
 * topo do bloco, chega à cor cheia do scrim ([color], a dos tokens) em
 * [fade] e fica cheia daí para baixo.
 *
 * O scrim acompanha o texto, e não a altura do card: com fonte grande o
 * bloco cresce para cima, e o scrim cresce junto. Quem usa deixa no topo do
 * bloco um espaço maior que [fade] (os cards guardam 56 dp para o coração e
 * o selo), então o texto fica sempre sobre a cor cheia, o par que a
 * ferramenta de contraste mede (branco sobre o scrim numa foto branca).
 *
 * drawBehind desenha antes do conteúdo, no tamanho do próprio bloco. O
 * degradê vai de 0 a [fade] em pixels; depois do fim, ele repete a última
 * cor (o padrão "clamp"), por isso o resto do bloco fica todo escuro.
 */
internal fun Modifier.photoTextScrim(
    color: Color,
    fade: Dp = 32.dp,
): Modifier =
    drawBehind {
        drawRect(Brush.verticalGradient(listOf(color.copy(alpha = 0f), color), startY = 0f, endY = fade.toPx()))
    }
```

Substitua o conteúdo de `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PiuFeaturedCard.kt`:

```kotlin
// A "Ave do dia" do Explorar adulto (frente B traz o dado, a frente E a
// tela): card largo com a foto, um selo no alto, o nome e o nome científico
// embaixo e o botão de canto em forma de cookie no canto.

package com.velosobr.piuds.components.adult

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.piuds.components.PiuCookieShape
import com.velosobr.piuds.components.PiuLightAndDarkPreview
import com.velosobr.piuds.resources.Res
import com.velosobr.piuds.resources.ic_pause
import com.velosobr.piuds.resources.ic_play
import com.velosobr.piuds.theme.PiuTheme
import com.velosobr.piuds.theme.toBrush
import org.jetbrains.compose.resources.vectorResource

/**
 * O card da "Ave do dia". [badge] é o texto do selo ("AVE DO DIA ·
 * PANTANAL"), já pronto. Sem canto ([play] nulo), o botão some: a ave do
 * dia pode não ter canto numa linha antiga do catalog. O card cresce para caber nomes longos e fonte grande (no mínimo
 * 196 dp, como na prancheta).
 */
@Composable
fun PiuFeaturedCard(
    badge: String,
    name: String,
    scientificName: String,
    imageUrl: String?,
    biome: Biome,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    play: PiuPlayAction? = null,
) {
    Box(
        modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 196.dp)
            .clip(RoundedCornerShape(28.dp))
            .background(
                PiuTheme.tokens.gradients
                    .getValue(biome)
                    .toBrush(),
            )
            // Role.Button: o leitor de tela diz "botão" depois do nome da ave.
            .clickable(role = Role.Button, onClick = onClick),
    ) {
        if (imageUrl != null) {
            AsyncImage(model = imageUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
        }
        // O selo fica no alto, fora do scrim: o fundo dele é a própria cor do scrim, e não o branco
        // translúcido da prancheta, para o texto branco passar no contraste sobre uma foto clara.
        Text(
            badge,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            modifier =
                Modifier
                    .align(Alignment.TopStart)
                    .padding(start = 18.dp, top = 16.dp)
                    .background(PiuTheme.tokens.scrim, RoundedCornerShape(14.dp))
                    .padding(horizontal = 12.dp, vertical = 6.dp),
        )
        // O end de 84 dp guarda o lugar do botão de canto; o top de 56 dp, o do selo.
        Column(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .photoTextScrim(PiuTheme.tokens.scrim)
                .padding(start = 18.dp, end = if (play != null) 84.dp else 18.dp, bottom = 16.dp, top = 56.dp),
        ) {
            Text(name, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold, color = Color.White)
            Text(
                scientificName,
                style = MaterialTheme.typography.bodyMedium,
                fontStyle = FontStyle.Italic,
                color = Color.White.copy(alpha = 0.9f),
            )
        }
        if (play != null) {
            PlayButton(play, Modifier.align(Alignment.BottomEnd).padding(16.dp))
        }
    }
}

/**
 * O botão de canto: cookie de 56 dp com o ícone de tocar ou de pausar. As
 * cores são o par primaryContainer/onPrimaryContainer do tema, e não o
 * branco da prancheta: com o fundo branco fixo, o ícone na primária do tema
 * escuro (verde claro) ficaria com 1,7:1. O par passa nos dois temas (13:1
 * no claro, 7:1 no escuro).
 */
@Composable
private fun PlayButton(
    play: PiuPlayAction,
    modifier: Modifier,
) {
    Box(
        modifier
            .size(56.dp)
            .clip(PiuCookieShape())
            .background(MaterialTheme.colorScheme.primaryContainer)
            .clickable(role = Role.Button, onClick = play.onClick)
            .semantics { contentDescription = play.description },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            vectorResource(if (play.playing) Res.drawable.ic_pause else Res.drawable.ic_play),
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onPrimaryContainer,
            modifier = Modifier.size(28.dp),
        )
    }
}

/** Prévia: a "Ave do dia" com o botão de canto, nos dois temas. */
@Preview
@Composable
private fun PiuFeaturedCardPreview() {
    PiuLightAndDarkPreview {
        PiuFeaturedCard(
            badge = "AVE DO DIA · PANTANAL",
            name = "Tuiuiú",
            scientificName = "Jabiru mycteria",
            imageUrl = null,
            biome = Biome.PANTANAL,
            onClick = {},
            play = PiuPlayAction(description = "Ouvir o canto do Tuiuiú", playing = false, onClick = {}),
        )
    }
}
```

Substitua o conteúdo de `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PiuMosaicCard.kt`:

```kotlin
// Card da grade em mosaico do Explorar adulto (frente E): a foto ocupa o
// card inteiro, um scrim escurece a parte de baixo e o nome vai em branco
// por cima. Duas alturas, alta e baixa, que a grade alterna.

package com.velosobr.piuds.components.adult

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconToggleButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.piuds.components.PiuLightAndDarkPreview
import com.velosobr.piuds.resources.Res
import com.velosobr.piuds.resources.favorite_add
import com.velosobr.piuds.resources.favorite_remove
import com.velosobr.piuds.resources.ic_favorite_filled
import com.velosobr.piuds.resources.ic_favorites
import com.velosobr.piuds.theme.PiuDimens
import com.velosobr.piuds.theme.PiuTheme
import com.velosobr.piuds.theme.toBrush
import org.jetbrains.compose.resources.stringResource
import org.jetbrains.compose.resources.vectorResource

/**
 * Card do mosaico. Sem foto (ou enquanto ela carrega), o fundo é o
 * gradiente do [biome], para o card nunca ficar vazio. O nome e o nome
 * científico ficam sobre o scrim e quebram linha em vez de cortar. O
 * coração fica num círculo translúcido de 44 dp, com alvo de toque de 48 dp,
 * e é um controle à parte: tocar nele favorita, tocar no resto abre a ave.
 */
@Composable
fun PiuMosaicCard(
    name: String,
    scientificName: String,
    imageUrl: String?,
    biome: Biome,
    isFavorite: Boolean,
    onToggleFavorite: () -> Unit,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    height: PiuMosaicHeight = PiuMosaicHeight.TALL,
) {
    Box(
        modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = height.minHeightDp.dp)
            .clip(RoundedCornerShape(24.dp))
            .background(
                PiuTheme.tokens.gradients
                    .getValue(biome)
                    .toBrush(),
            )
            // Role.Button: o leitor de tela diz "botão" depois do nome da ave.
            .clickable(role = Role.Button, onClick = onClick),
    ) {
        if (imageUrl != null) {
            AsyncImage(model = imageUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
        }
        // O top de 56 dp guarda o lugar do coração: um nome longo empurra o card para baixo, nunca para
        // cima dele. O scrim fica atrás do bloco de texto e já está cheio quando o nome começa.
        Column(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .photoTextScrim(PiuTheme.tokens.scrim)
                .padding(start = 14.dp, end = 14.dp, bottom = 12.dp, top = 56.dp),
        ) {
            Text(name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = Color.White)
            Text(
                scientificName,
                style = MaterialTheme.typography.labelMedium,
                fontStyle = FontStyle.Italic,
                color = Color.White.copy(alpha = 0.9f),
            )
        }
        FavoriteBubble(name, isFavorite, onToggleFavorite, Modifier.align(Alignment.TopEnd).padding(6.dp))
    }
}

/**
 * O coração do card: círculo translúcido de 44 dp dentro de um alvo de 48 dp.
 * Ele fica no alto, fora do scrim: o círculo usa a cor do scrim, e não o
 * branco translúcido da prancheta, para o coração branco passar no contraste
 * (3:1) sobre uma foto clara.
 * IconToggleButton é um botão de liga/desliga: o leitor de tela anuncia se
 * está marcado, e a descrição diz o que o toque vai fazer.
 */
@Composable
private fun FavoriteBubble(
    name: String,
    isFavorite: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier,
) {
    val description = stringResource(if (isFavorite) Res.string.favorite_remove else Res.string.favorite_add, name)
    IconToggleButton(checked = isFavorite, onCheckedChange = { onToggle() }, modifier = modifier.size(PiuDimens.touchTarget)) {
        Box(Modifier.size(44.dp).background(PiuTheme.tokens.scrim, CircleShape), contentAlignment = Alignment.Center) {
            Icon(
                vectorResource(if (isFavorite) Res.drawable.ic_favorite_filled else Res.drawable.ic_favorites),
                contentDescription = description,
                tint = Color.White,
                modifier = Modifier.size(22.dp),
            )
        }
    }
}

/** Prévia: um card alto favorito e um baixo, sem foto, nos dois temas. */
@Preview
@Composable
private fun PiuMosaicCardPreview() {
    PiuLightAndDarkPreview {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            PiuMosaicCard(
                name = "Arara-azul-grande",
                scientificName = "Anodorhynchus hyacinthinus",
                imageUrl = null,
                biome = Biome.PANTANAL,
                isFavorite = true,
                onToggleFavorite = {},
                onClick = {},
                modifier = Modifier.weight(1f),
            )
            PiuMosaicCard(
                name = "Carcará",
                scientificName = "Caracara plancus",
                imageUrl = null,
                biome = Biome.CAATINGA,
                isFavorite = false,
                onToggleFavorite = {},
                onClick = {},
                modifier = Modifier.weight(1f),
                height = PiuMosaicHeight.SHORT,
            )
        }
    }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `./gradlew :snapshots:compileDebugUnitTestKotlin`

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 6: Gravar os snapshots**

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*PiuAdultComponentsSnapshotTest*'`

Expected: 18 imagens novas ou alteradas em `snapshots/src/test/snapshots/images/`. Abra cada uma e confira a 1.0×, 1.3× e 2.0×: nada cortado, nada quebrado no meio da palavra; sobre a foto branca, os nomes, os nomes científicos, o selo e o coração ficam legíveis.

- [ ] **Step 7: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:piu-ds:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "fix: nome da ave legível sobre foto clara, com o scrim ancorado no texto (revisão final do C2)"
```

```bash
git checkout feat/piuds-c2-kids
```

### Task 18: Revisão: o botão do Kids afunda num toque rápido em lista rolável

Dentro de algo rolável, o `clickable` só avisa o Press depois de saber que não é rolagem, e num toque rápido o Press e o Release chegam juntos: olhando só "está pressionado", a face nunca descia. O afundar passa a ser um `Animatable` que escuta as interações: cada Press garante uma descida inteira, e a volta só começa depois dela. Os testes de estado medem a base antes do toque, porque a troca seca agora acontece já no primeiro quadro.

**Files:**
- Modify: `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuKidsButtonTest.kt`
- Modify: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/kids/PiuKidsButton.kt`
- Modify: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/kids/PiuSinkingSurface.kt`

**Interfaces:**
- Muda só o interior do `PiuSinkingSurface`; a assinatura continua a mesma.

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuKidsButtonTest.kt`:

```kotlin
// Testes do botão do Kids: é um botão com o alvo de 56 dp do Kids, não
// responde desabilitado e, ao ser pressionado, a face afunda até cobrir a
// sombra: com a mola de toque do PiuMotion, ou de uma vez com "reduzir
// animações" (o "teste de estado" da spec, seção 8).

package com.velosobr.piuds

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.isCloseTo
import assertk.assertions.isEqualTo
import assertk.assertions.isTrue
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.piuds.components.kids.PiuKidsButton
import com.velosobr.piuds.theme.LocalPiuReduceMotion
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PiuKidsButtonTest {
    @Test
    fun `botao do Kids e um botao com alvo de 56 dp`() =
        runComposeUiTest {
            var clicks = 0
            setContent { PiuTheme(journey = Journey.KIDS) { PiuKidsButton("Ouvir!", onClick = { clicks++ }) } }
            onNodeWithText("Ouvir!")
                .assertHasClickAction()
                .assertIsEnabled()
                .assertHeightIsAtLeast(56.dp)
                .performClick()
            assertThat(clicks).isEqualTo(1)
        }

    @Test
    fun `botao do Kids desabilitado nao responde`() =
        runComposeUiTest {
            var clicks = 0
            setContent { PiuTheme(journey = Journey.KIDS) { PiuKidsButton("Ouvir!", onClick = { clicks++ }, enabled = false) } }
            onNodeWithText("Ouvir!").assertIsNotEnabled().performClick()
            assertThat(clicks).isEqualTo(0)
        }

    /**
     * A posição do topo do rótulo antes do toque (o primeiro valor) e depois, quadro a quadro,
     * enquanto o dedo segura o botão (down sem up). mainClock.autoAdvance = false para o relógio só
     * andar quando o teste mandar. A base é medida antes do down: com a troca seca, a face já pode
     * estar embaixo no primeiro quadro depois do toque.
     */
    private fun labelTopsWhilePressed(reduceMotion: Boolean): List<Float> {
        var tops = emptyList<Float>()
        runComposeUiTest {
            mainClock.autoAdvance = false
            setContent {
                CompositionLocalProvider(LocalPiuReduceMotion provides reduceMotion) {
                    PiuTheme(journey = Journey.KIDS) { PiuKidsButton("Ouvir!", onClick = {}) }
                }
            }
            mainClock.advanceTimeBy(1_000)
            val rest = onNodeWithText("Ouvir!", useUnmergedTree = true).getBoundsInRoot().top.value
            onNodeWithText("Ouvir!").performTouchInput { down(center) }
            tops = listOf(rest) +
                List(30) {
                    mainClock.advanceTimeByFrame()
                    onNodeWithText("Ouvir!", useUnmergedTree = true).getBoundsInRoot().top.value
                }
        }
        return tops
    }

    @Test
    fun `com reduzir animacoes a face afunda de uma vez`() {
        val tops = labelTopsWhilePressed(reduceMotion = true)
        // A sombra do botão é de 5 dp (buttonShadow dos tokens Kids): é o quanto a face desce.
        assertThat(tops.last() - tops.first()).isCloseTo(5f, 0.5f)
        assertThat(tops.distinct()).containsExactly(tops.first(), tops.last())
    }

    @Test
    fun `sem reduzir animacoes a face afunda aos poucos`() {
        val tops = labelTopsWhilePressed(reduceMotion = false)
        assertThat(tops.last() - tops.first()).isCloseTo(5f, 0.5f)
        assertThat(tops.any { it > tops.first() && it < tops.last() }).isTrue()
    }

    @Test
    fun `ao soltar a face volta ao lugar mesmo passando do ponto com a mola`() =
        runComposeUiTest {
            mainClock.autoAdvance = false
            setContent { PiuTheme(journey = Journey.KIDS) { PiuKidsButton("Ouvir!", onClick = {}) } }
            mainClock.advanceTimeBy(1_000)
            val rest = onNodeWithText("Ouvir!", useUnmergedTree = true).getBoundsInRoot().top.value
            onNodeWithText("Ouvir!").performTouchInput { down(center) }
            repeat(30) { mainClock.advanceTimeByFrame() }
            onNodeWithText("Ouvir!").performTouchInput { up() }
            // Quadro a quadro: a mola que passa do ponto na volta é o caso que derrubava o app.
            repeat(60) {
                mainClock.advanceTimeByFrame()
                onNodeWithText("Ouvir!", useUnmergedTree = true).getBoundsInRoot()
            }
            assertThat(onNodeWithText("Ouvir!", useUnmergedTree = true).getBoundsInRoot().top.value).isCloseTo(rest, 0.5f)
        }

    @Test
    fun `um toque rapido dentro de uma lista rolavel tambem afunda a face`() =
        runComposeUiTest {
            mainClock.autoAdvance = false
            // Dentro de algo rolável, o clickable só avisa o "pressionado" depois de ter certeza de que
            // não é o começo de uma rolagem; num toque rápido, o aviso e a soltura chegam juntos.
            setContent {
                PiuTheme(journey = Journey.KIDS) {
                    Column(Modifier.verticalScroll(rememberScrollState())) { PiuKidsButton("Ouvir!", onClick = {}) }
                }
            }
            mainClock.advanceTimeBy(1_000)
            val rest = onNodeWithText("Ouvir!", useUnmergedTree = true).getBoundsInRoot().top.value
            onNodeWithText("Ouvir!").performClick()
            // 90 quadros (1,5 s): a descida inteira, a volta e o balanço da mola até assentar.
            val tops =
                List(90) {
                    mainClock.advanceTimeByFrame()
                    onNodeWithText("Ouvir!", useUnmergedTree = true).getBoundsInRoot().top.value
                }
            assertThat(tops.any { it > rest + 1f }).isTrue()
            assertThat(tops.last()).isCloseTo(rest, 0.5f)
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: FAIL em `um toque rapido dentro de uma lista rolavel tambem afunda a face`: `expected to be true`.

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/kids/PiuKidsButton.kt`:

```kotlin
// O botão "gordinho" do Kids: raio total, de 56 a 72 dp de altura, com a
// sombra sólida que afunda ao tocar. O rótulo é azul-noite sobre o laranja:
// o branco da prancheta não passava no contraste (spec da frente C, 4.3).

package com.velosobr.piuds.components.kids

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.piuds.theme.PiuKidsDimens
import com.velosobr.piuds.theme.PiuTheme

/**
 * Botão do Kids. [height] vai de 56 dp (o alvo mínimo do Kids) a 72 dp. A
 * face é a cor primaryContainer do esquema Kids (o laranja) com o rótulo em
 * onPrimaryContainer (azul-noite), e a sombra é a "buttonShadow" dos tokens.
 * [interactionSource] é opcional, como nos botões do Material: serve para
 * acompanhar o toque de fora.
 */
@Composable
fun PiuKidsButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    height: Dp = PiuKidsDimens.touchTarget,
    enabled: Boolean = true,
    interactionSource: MutableInteractionSource? = null,
) {
    val colors = MaterialTheme.colorScheme
    val shadow = checkNotNull(PiuTheme.tokens.buttonShadow) { "PiuKidsButton só existe dentro do PiuTheme(journey = KIDS)" }
    PiuSinkingSurface(
        face = SolidColor(colors.primaryContainer),
        shadowColor = shadow.color,
        shadowOffset = shadow.offset,
        shape = RoundedCornerShape(percent = 50),
        minHeight = height.coerceIn(PiuKidsDimens.touchTarget, 72.dp),
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        interactionSource = interactionSource,
    ) {
        Row(
            Modifier.padding(horizontal = 22.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (icon != null) {
                Icon(icon, contentDescription = null, tint = colors.onPrimaryContainer, modifier = Modifier.size(26.dp))
            }
            Text(text, style = MaterialTheme.typography.titleMedium, color = colors.onPrimaryContainer)
        }
    }
}

/** Prévia: o botão normal, o alto e o desabilitado, no tema Kids. */
@Preview
@Composable
private fun PiuKidsButtonPreview() {
    PiuTheme(journey = Journey.KIDS) {
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            PiuKidsButton("Ouvir!", onClick = {})
            PiuKidsButton("Guardar no meu álbum", onClick = {}, height = 72.dp)
            PiuKidsButton("Desabilitado", onClick = {}, enabled = false)
        }
    }
}
```

Substitua o conteúdo de `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/kids/PiuSinkingSurface.kt`:

```kotlin
// A base dos botões do Kids: uma face colorida apoiada numa "sombra sólida"
// (uma faixa da mesma forma, mais escura, logo abaixo). Ao tocar, a face
// desce até cobrir a sombra, como um botão de brinquedo que afunda, e volta
// ao soltar. Usada pelo PiuKidsButton e pelo PiuWorldCard.

package com.velosobr.piuds.components.kids

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.VectorConverter
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.velosobr.piuds.theme.PiuMotion
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * A superfície que afunda. A altura total é [minHeight] mais a sombra: a
 * sombra fica fixa embaixo, e a face desce [shadowOffset] quando pressionada.
 *
 * MutableInteractionSource é o "canal" por onde o clickable conta o que o
 * dedo está fazendo: um Press quando ele encosta, um Release quando solta (ou
 * um Cancel, se o gesto vira rolagem). O deslocamento é um Animatable, um
 * valor animado que a gente comanda por código, com a mola de toque do
 * PiuMotion (seca, com "reduzir animações"). Quem chama pode passar o próprio
 * [interactionSource] para acompanhar o toque.
 *
 * Por que não só "está pressionado ou não": dentro de uma lista rolável, o
 * clickable espera um instante para saber se o dedo vai rolar, e num toque
 * rápido o Press e o Release chegam juntos. Olhando só o estado, a face nunca
 * desceria. Aqui, cada Press garante uma descida inteira, e a volta só começa
 * depois dela.
 */
@Composable
internal fun PiuSinkingSurface(
    face: Brush,
    shadowColor: Color,
    shadowOffset: Dp,
    shape: Shape,
    minHeight: Dp,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    interactionSource: MutableInteractionSource? = null,
    content: @Composable BoxScope.() -> Unit,
) {
    val interaction = interactionSource ?: remember { MutableInteractionSource() }
    // Dp.VectorConverter ensina o Animatable a animar um Dp (ele anima números por dentro).
    val sink = remember { Animatable(0.dp, Dp.VectorConverter) }
    // rememberUpdatedState: o efeito abaixo roda uma vez só, mas sempre lê a mola atual (ela muda
    // quando a pessoa liga ou desliga "reduzir animações").
    val spring by rememberUpdatedState(PiuMotion.press<Dp>())
    val depth by rememberUpdatedState(shadowOffset)
    LaunchedEffect(interaction) {
        var descent: Job? = null
        interaction.interactions.collect { event ->
            when (event) {
                is PressInteraction.Press -> descent = launch { sink.animateTo(depth, spring) }
                is PressInteraction.Release, is PressInteraction.Cancel -> {
                    val pending = descent
                    launch {
                        pending?.join()
                        sink.animateTo(0.dp, spring)
                    }
                }
            }
        }
    }
    Box(
        modifier
            .alpha(if (enabled) 1f else 0.5f)
            // indication = null: o retorno visual do toque é o afundar, não a "onda" padrão do Material.
            .clickable(interactionSource = interaction, indication = null, enabled = enabled, role = Role.Button, onClick = onClick),
        // propagateMinConstraints: a largura mínima que vem de fora (um cartão esticado na grade, por
        // exemplo) chega à face, que então ocupa o cartão inteiro em vez de só o tamanho do texto.
        propagateMinConstraints = true,
    ) {
        Box(Modifier.matchParentSize().padding(top = shadowOffset).background(shadowColor, shape))
        Box(
            Modifier
                .padding(bottom = shadowOffset)
                // offset { } desloca a face sem mudar o tamanho de ninguém. A mola de toque passa um
                // pouco do fim e volta (o balanço); com padding, a passada daria um espaço negativo e
                // derrubaria o app. E o estado é lido só na fase de layout: cada quadro da animação
                // reposiciona a face sem recompor o botão.
                .offset { IntOffset(0, sink.value.roundToPx()) }
                .defaultMinSize(minHeight = minHeight)
                .background(face, shape),
            contentAlignment = Alignment.Center,
            content = content,
        )
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:piu-ds:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: botão do Kids afunda também num toque rápido dentro de lista rolável (revisão final do C2)"
```

```bash
git checkout feat/piuds-c2-kids
```

### Task 19: Revisão: o balão do Pipo do tamanho da frase

Com uma frase curta, a sombra do balão (que usa `matchParentSize`) ocupava a largura toda, porque o `weight(1f)` esticava a caixa. Com `fill = false`, o balão e a sombra têm a largura da frase.

**Files:**
- Modify: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/kids/PiuPipoBalloon.kt`
- Modify: `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuKidsComponentsSnapshotTest.kt`
- Record: 3 imagens em `snapshots/src/test/snapshots/images/`

**Interfaces:**
- Nenhuma mudança de API.

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/PiuKidsComponentsSnapshotTest.kt`:

```kotlin
// Snapshots dos componentes do Piu Kids (frente C, plano C2), só no tema
// claro (o Kids não tem escuro) e nas três escalas de fonte. O Pipo não muda
// com a fonte, mas fica na mesma matriz para a base Kids ser uma só.

package com.velosobr.passarim.snapshots

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.piuds.components.PiuNavItem
import com.velosobr.piuds.components.kids.PiuKidsButton
import com.velosobr.piuds.components.kids.PiuKidsNavBar
import com.velosobr.piuds.components.kids.PiuMissingSticker
import com.velosobr.piuds.components.kids.PiuPipo
import com.velosobr.piuds.components.kids.PiuPipoBalloon
import com.velosobr.piuds.components.kids.PiuSticker
import com.velosobr.piuds.components.kids.PiuWorldCard
import com.velosobr.piuds.resources.Res
import com.velosobr.piuds.resources.ic_explore
import com.velosobr.piuds.resources.ic_favorites
import com.velosobr.piuds.resources.ic_play
import com.velosobr.piuds.resources.ic_settings
import org.jetbrains.compose.resources.vectorResource
import org.junit.Test

class PiuKidsComponentsSnapshotTest(
    fontScalePercent: Int,
) : KidsSnapshotTest(fontScalePercent) {
    /** O Pipo em três tamanhos: o vetor tem de continuar nítido do ícone ao destaque. */
    @Test
    fun pipo() =
        snap("kids-pipo") {
            Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.Bottom) {
                Image(PiuPipo, contentDescription = null, modifier = Modifier.size(32.dp))
                Image(PiuPipo, contentDescription = null, modifier = Modifier.size(64.dp))
                Image(PiuPipo, contentDescription = null, modifier = Modifier.size(120.dp))
            }
        }

    /**
     * O botão normal com ícone, o alto (72 dp) e o desabilitado. O pressionado não aparece aqui: o
     * Compose só fica sabendo do toque por um efeito (LaunchedEffect), e o Paparazzi fotografa antes
     * de os efeitos rodarem. O afundar é conferido no PiuKidsButtonTest, do :core:piu-ds.
     */
    @Test
    fun buttons() =
        snap("kids-buttons") {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                PiuKidsButton("Ouvir!", onClick = {}, icon = vectorResource(Res.drawable.ic_play))
                PiuKidsButton("Guardar no meu álbum", onClick = {}, height = 72.dp)
                PiuKidsButton("Desabilitado", onClick = {}, enabled = false)
            }
        }

    /**
     * Os seis mundos em duas colunas, metade com o progresso do álbum. Duas, e não três: a 2.0×,
     * com três colunas, os nomes quebrariam no meio da palavra (regra que a grade da frente F segue).
     */
    @Test
    fun worldCards() =
        snap("kids-world-cards") {
            val worlds =
                listOf(
                    Triple(Biome.AMAZONIA, "Amazônia", null),
                    Triple(Biome.PANTANAL, "Pantanal", "1 de 6"),
                    Triple(Biome.CAATINGA, "Caatinga", "4 de 9"),
                    Triple(Biome.MATA_ATLANTICA, "Mata Atlântica", "0 de 12"),
                    Triple(Biome.CERRADO, "Cerrado", null),
                    Triple(Biome.PAMPA, "Pampa", "2 de 3"),
                )
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                worlds.chunked(2).forEach { pair ->
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        pair.forEach { (biome, name, progress) ->
                            PiuWorldCard(biome, name, onClick = {}, progress = progress, modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }

    /** Duas figurinhas guardadas (sem foto, só o gradiente do mundo) e a que falta, tracejada. */
    @Test
    fun stickers() =
        snap("kids-stickers") {
            Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                PiuSticker("Tuiuiú", Biome.PANTANAL, imageUrl = null, onClick = {})
                PiuSticker("Arara-azul", Biome.CERRADO, imageUrl = null, onClick = {})
                PiuMissingSticker(label = "Ainda falta", description = "figurinha que falta")
            }
        }

    /**
     * O balão com uma frase bem curta (o balão e a sombra têm a largura da frase), uma média e uma
     * longa, que quebra linha ao lado do Pipo.
     */
    @Test
    fun pipoBalloon() =
        snap("kids-pipo-balloon") {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                PiuPipoBalloon("Oi!")
                PiuPipoBalloon("Qual ave vamos conhecer hoje?")
                PiuPipoBalloon("Você já guardou 4 figurinhas da Caatinga. Falta pouco para completar o mundo!")
            }
        }

    /** A barra do Kids com o primeiro e com o segundo item ativos: os rótulos sempre aparecem. */
    @Test
    fun navBar() =
        snap("kids-nav-bar") {
            val items =
                listOf(
                    PiuNavItem(vectorResource(Res.drawable.ic_explore), "Explorar"),
                    PiuNavItem(vectorResource(Res.drawable.ic_favorites), "Álbum"),
                    PiuNavItem(vectorResource(Res.drawable.ic_settings), "Ajustes"),
                )
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                PiuKidsNavBar(items, selected = 0, onSelect = {})
                PiuKidsNavBar(items, selected = 1, onSelect = {})
            }
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*PiuKidsComponentsSnapshotTest*'`

Expected: o snapshot `pipoBalloon` com "Oi!" mostra uma faixa bege comprida saindo do balão (o teste vermelho desta tarefa: confira a imagem antes de implementar).

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/kids/PiuPipoBalloon.kt`:

```kotlin
// O balão de fala do Pipo ("Qual ave vamos conhecer hoje?"), com o Pipo ao
// lado. O Pipo aqui é decoração: o leitor de tela lê só a frase do balão.

package com.velosobr.piuds.components.kids

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.piuds.theme.PiuTheme

/**
 * O Pipo de 64 dp e o balão branco com a [text]. O balão tem raio de 22 dp e
 * a sombra sólida dos cartões do Kids, 3 dp abaixo (desenhada como uma caixa
 * da cor da sombra atrás do balão).
 */
@Composable
fun PiuPipoBalloon(
    text: String,
    modifier: Modifier = Modifier,
) {
    val shadow = checkNotNull(PiuTheme.tokens.cardShadow) { "PiuPipoBalloon só existe dentro do PiuTheme(journey = KIDS)" }
    val shape = RoundedCornerShape(22.dp)
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
        Image(PiuPipo, contentDescription = null, modifier = Modifier.size(64.dp))
        // weight(fill = false): o balão pode crescer até o espaço que sobra, mas fica do tamanho da
        // frase; com fill = true, a sombra (matchParentSize) ocuparia a largura toda numa frase curta.
        Box(Modifier.weight(1f, fill = false)) {
            Box(Modifier.matchParentSize().padding(top = 3.dp).background(shadow.color, shape))
            Text(
                text,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier =
                    Modifier
                        .padding(bottom = 3.dp)
                        .background(MaterialTheme.colorScheme.surfaceContainerLowest, shape)
                        .padding(horizontal = 16.dp, vertical = 12.dp),
            )
        }
    }
}

/** Prévia do balão com a frase da prancheta. */
@Preview
@Composable
private fun PiuPipoBalloonPreview() {
    PiuTheme(journey = Journey.KIDS) {
        PiuPipoBalloon("Qual ave vamos conhecer hoje?")
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :snapshots:compileDebugUnitTestKotlin`

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Gravar os snapshots**

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*PiuKidsComponentsSnapshotTest*'`

Expected: 3 imagens novas ou alteradas em `snapshots/src/test/snapshots/images/`. Abra cada uma e confira a 1.0×, 1.3× e 2.0×: nada cortado, nada quebrado no meio da palavra.

- [ ] **Step 6: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:piu-ds:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "fix: balão do Pipo e a sombra com a largura da frase (revisão final do C2)"
```

## PR 7 (`passarim-docs`, `docs/plano-frente-c2-componentes`, sobre `main`)

### Task 20: ADR-0023 e o README do PiuDS

A ADR registra a Haze isolada no `PiuBlurSurface`, com o resultado do teste de iOS (spec, seção 7). O README passa a
dizer o que o código do C2 faz. O número 0023 é o próximo livre: a 0022 está no docs #26.

**Files:**
- Create: `docs/adr/0023-haze-isolado-no-piublursurface.md`
- Modify: `docs/design/piuds/README.md`
- Create: `docs/superpowers/plans/2026-11-07-passarim-frente-c2-componentes.md` (este plano)

- [ ] **Step 1: Branch**

```bash
cd passarim-docs
git fetch origin
git checkout -b docs/plano-frente-c2-componentes origin/main
```

- [ ] **Step 2: A ADR**

Crie `docs/adr/0023-haze-isolado-no-piublursurface.md`:

```markdown
# ADR-0023: Haze para o desfoque, isolado no `PiuBlurSurface`

- **Status:** Aceita
- **Data:** 2026-11-07

## Contexto

As direções de 2026 põem superfícies de "vidro fosco" sobre as fotos: a barra flutuante do adulto desfoca o
conteúdo que passa por baixo dela. O Compose Multiplatform não desfoca o que está **atrás** de um elemento: o
`Modifier.blur` borra o próprio conteúdo. A biblioteca que faz isso no Android e no iOS é a Haze, de Chris Banes
(Apache 2.0).

A spec da frente C (seção 7) previa a Haze 2.0 em beta e pedia um teste de iOS antes de decidir. Na hora do plano C2,
a 2.0.1 já era estável. O teste do C2 deu:

- a Haze 2.0.1 (`haze` e `haze-blur`) tem artefatos para `iosArm64` e `iosSimulatorArm64` e funciona com o Compose
  Multiplatform 1.12 do app (ADR-0019);
- os testes do `core:piu-ds` no simulador iOS linkam e passam com ela;
- o snapshot do Paparazzi mostra o desfoque no Android.

Nenhuma tela usa o desfoque ainda: ver o efeito rodando no simulador iOS fica para a frente E, quando a barra
flutuante entra numa tela.

## Decisão

- O desfoque usa a **Haze 2.0.1** (`dev.chrisbanes.haze:haze` e `haze-blur`), como `implementation` do `core:piu-ds`,
  nas duas plataformas.
- **Só o arquivo `PiuBlurSurface.kt` importa a Haze.** O resto do app usa `rememberPiuBlurState`,
  `Modifier.piuBlurSource` e `PiuBlurSurface`, que não expõem nenhum tipo da Haze.
- **O contraste não depende do desfoque:** o que vai sobre a superfície é legível só com a tinta translúcida dela.
  O desfoque é decoração.

## Consequências

- Três artefatos novos no app (`haze`, `haze-blur` e `haze-utils`), todos Apache 2.0, na tela de Licenças.
- Se a Haze quebrar numa versão nova, ou não desfocar no iOS na frente E, troca-se só o `PiuBlurSurface.kt` por um
  fundo translúcido sem desfoque (ou por um `expect/actual` com esse fundo só no iOS). Nenhuma tela muda, e o
  contraste continua o mesmo.
- A Haze é uma biblioteca de uma pessoa: atualizações dela pedem um olhar no snapshot do desfoque
  (`PiuCommonComponentsSnapshotTest.cookieAndBlur`) antes do merge.
```

- [ ] **Step 3: O README**

Em `docs/design/piuds/README.md`, aplique:

```diff
diff --git a/docs/design/piuds/README.md b/docs/design/piuds/README.md
index 1c7b2c1..112c1b6 100644
--- a/docs/design/piuds/README.md
+++ b/docs/design/piuds/README.md
@@ -24,7 +24,7 @@ Este documento são as **regras do projeto PiuDS**. Quem mexe no PiuDS (inclusiv
 
 O módulo é `core/piu-ds`, pacote `com.velosobr.piuds`, e fica **abaixo** de todas as features.
 
-- Pode depender **apenas** de: Compose (runtime, foundation, material3, ui), Compose Resources, `lifecycle-runtime-compose` (para reler preferências do sistema ao voltar ao app), Coil (os componentes de foto carregam imagens), Haze (só no `PiuBlurSurface`), `graphics-shapes` (a forma cookie) e `:core:domain`.
+- Pode depender **apenas** de: Compose (runtime, foundation, material3, ui), Compose Resources, `lifecycle-runtime-compose` (para reler preferências do sistema ao voltar ao app), Coil (os componentes de foto carregam imagens), Haze (só no `PiuBlurSurface`, ADR-0023), `graphics-shapes` (a forma cookie), `ui-tooling-preview` (a anotação `@Preview`) e `:core:domain`. Nos testes de `androidHostTest`, também `compose-ui-test` e Robolectric.
 - **Não pode** depender de: `:app`, `:feature:*`, `:core:data`, `:core:presentation`, Koin, Ktor, Room nem MapLibre.
 - **Sem textos do produto.** Componentes recebem `String` ou *slots* (`@Composable () -> Unit`). Textos como "Sem conexão" ficam em recursos de string do app, para manter a internacionalização possível.
 - **Conhece só o domínio compartilhado.** Pode receber tipos de `:core:domain` (`ConservationStatus`, `Biome`, `Journey`); modelos de uma feature (`Species`, filtros) nunca entram.
@@ -35,7 +35,9 @@ O módulo é `core/piu-ds`, pacote `com.velosobr.piuds`, e fica **abaixo** de to
 
 - A fonte dos valores é `passarim-docs/docs/design/tokens/passarim-tokens.json` (versão 2.0.0). O Kotlin é derivado dele e leva no cabeçalho a versão de origem.
 - Esquema de cores **Material 3**, com os mesmos nomes de papel do `ColorScheme`. As features leem cores, tipografia e formas pelo `MaterialTheme`. O que o Material não tem fica em `PiuTheme.tokens` (gradientes de bioma e de mundo, scrim, sombras sólidas do Kids e cores de conservação). Além dele, só `PiuTheme.reduceMotion` e `PiuTheme.isDark`.
-- **Proibido em componentes:** cor literal (`Color(0xFF...)`), `dp` e `sp` soltos fora de `PiuDimens` e da tipografia, `RoundedCornerShape(12.dp)` direto. Use `MaterialTheme.colorScheme`, `MaterialTheme.typography`, `MaterialTheme.shapes`, `PiuTheme.tokens` e `PiuDimens`.
+- **Proibido em componentes:** cor literal (`Color(0xFF...)`), alvo de toque solto e tamanho de fonte (`sp`) fora da tipografia. Use `MaterialTheme.colorScheme`, `MaterialTheme.typography`, `MaterialTheme.shapes`, `PiuTheme.tokens`, `PiuDimens` e `PiuKidsDimens`.
+  - **Exceções:** o branco do texto e dos ícones sobre o scrim de uma foto (o par que a ferramenta de contraste mede), o preto usado para escurecer uma cor de token (a sombra do cartão de mundo é a ponta do gradiente 25% mais escura) e o desenho do Pipo, que é ilustração.
+  - **Medidas de layout** (espaçamento, raio e tamanho tirados de uma prancheta) podem ser `dp` dentro do componente, perto de onde são usadas. Uma medida que dois componentes repetem vira token.
 - Temas: no Piu, Sistema, Claro e Escuro, mais **cores dinâmicas** opcionais (Android 12+, via `expect/actual`; nas outras plataformas cai para a paleta da marca). No Piu Kids, sempre claro.
 - **Contraste verificado por teste** (`docs/design/tools/check-tokens.mjs`): texto ≥ 4.5:1 e elementos não textuais ≥ 3:1, no Piu claro, no Piu escuro e no Kids; o texto de cada gradiente contra as duas pontas; o branco sobre o scrim no pior caso (foto branca); as cores de conservação sobre o creme do Kids. Mudar um token sem rodar essa verificação não passa no CI.
 
@@ -46,7 +48,7 @@ O módulo é `core/piu-ds`, pacote `com.velosobr.piuds`, e fica **abaixo** de to
 - **Sem estado interno que o chamador não controle.** Estado sobe (*state hoisting*): `selected`, `checked`, `value` e o `onChange` correspondente vêm de fora.
 - **Slots no lugar de dezenas de parâmetros.** Conteúdo variável é `@Composable () -> Unit`; evite listas de booleanos de estilo.
 - **Estados explícitos:** `enabled`, e quando fizer sentido, `loading` e erro. Cada estado tem visual definido e snapshot.
-- **Parâmetros estáveis:** tipos imutáveis ou anotados `@Immutable`/`@Stable`; coleções em parâmetros usam `kotlinx.collections.immutable` (ou a configuração de estabilidade do projeto), pois `List` é instável. Objetos não triviais criados na composição ficam em `remember`; isso é conferido na revisão e pelos relatórios do compilador do Compose.
+- **Parâmetros estáveis:** tipos imutáveis ou anotados `@Immutable`/`@Stable`. Com o *strong skipping* (padrão do compilador do Compose desde o Kotlin 2.0.20), um parâmetro instável como `List` é comparado pela instância: quem chama passa a mesma lista (guardada em `remember` ou vinda do estado) para o componente não recompor à toa. Objetos não triviais criados na composição ficam em `remember`; isso é conferido na revisão e pelos relatórios do compilador do Compose.
 - **Sem `ViewModel`, sem `Koin`, sem acesso a rede ou disco.** Um componente é função de seus parâmetros.
 - **Efeitos colaterais** (`LaunchedEffect`, `DisposableEffect`) só quando indispensáveis e com chave correta.
 - **Animação:** curta e com função. Todo componente animado lê `PiuTheme.reduceMotion` e, com a preferência do sistema ligada, troca a mola por uma troca seca, sem esconder nada (uma mensagem aparece parada).
@@ -58,6 +60,7 @@ O módulo é `core/piu-ds`, pacote `com.velosobr.piuds`, e fica **abaixo** de to
 - Papéis semânticos corretos (`Role.Button`, `Role.Checkbox`, ...), e estado (`selected`, `toggleable`) exposto à acessibilidade.
 - O layout aguenta **fonte 2.0×** sem cortar texto: nada de altura fixa em contêiner de texto (use `heightIn`/`defaultMinSize`), e nada de reticências que escondam o nome de uma ave ou de um filtro.
 - Cor nunca é o único sinal: um status tem texto ou ícone além da cor.
+- **Texto sobre foto** fica só onde o scrim já está na opacidade cheia: o scrim acompanha o bloco de texto, e não a altura do card, para continuar atrás do texto quando a fonte cresce. O que fica no alto de um card, fora do scrim (um selo, um botão), tem fundo próprio na cor do scrim. Um snapshot com foto branca é o pior caso.
 
 ## 7. Quando criar (ou não) um componente no PiuDS
 
@@ -74,7 +77,8 @@ Toda mudança visual passa por estes portões, todos no CI:
 
 - **Snapshots com Paparazzi** (módulo Android `snapshots`, ADR-0017): cada componente do Piu em **claro e escuro** × **fonte 1.0×, 1.3× e 2.0×**, e cada componente do Piu Kids **só em claro** × as mesmas três escalas, em cada estado relevante.
 - **Contraste** dos tokens (seção 4).
-- **Semântica** de componentes clicáveis (papel, descrição, alvo de toque), com `compose-ui-test` e `runComposeUiTest` em `androidHostTest`, a partir do plano C2.
+- **Semântica** de componentes clicáveis (papel, descrição, alvo de toque), com `compose-ui-test` e `runComposeUiTest` (a API `v2`) em `androidHostTest`, a partir do plano C2.
+- **Estado de animação:** um componente animado tem um teste que acompanha a animação quadro a quadro (`mainClock`) com e sem "reduzir animações". É também onde fica o estado **pressionado**, que o Paparazzi não fotografa: o toque chega ao Compose por um efeito, e o snapshot é tirado antes de os efeitos rodarem.
 - **Paridade com os tokens:** um teste confere que as cores, a conservação, a tipografia e as formas em Kotlin batem com o `passarim-tokens.json`.
 - Snapshot só é regravado com o **diff visual revisado** no PR; "regravar tudo" para o CI passar é proibido.
 - O iOS não tem snapshot (limitação do Paparazzi); o código comum é validado pelo alvo Android e a compilação do iOS roda no CI.
```

- [ ] **Step 4: Conferir**

Run: `grep -n "ADR-0023\|ui-tooling-preview\|strong skipping\|pressionado" docs/design/piuds/README.md`

Expected: as mudanças aparecem.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: plano C2 da frente C (componentes do PiuDS), ADR-0023 (Haze) e o README do PiuDS alinhado ao código"
```

### Task 21: Abrir os PRs

- [ ] **Step 1: Verificação final de cada branch do app**

Para `feat/piuds-c2-comuns`, `feat/piuds-c2-adultos` e `feat/piuds-c2-kids`:

Run: `./gradlew ktlintCheck detekt :core:piu-ds:allTests :snapshots:verifyPaparazziDebug :androidApp:assembleDebug`

Expected: `BUILD SUCCESSFUL`. E, no PR 4, `./gradlew resolveAndLockShipped --write-locks :androidApp:exportLibraryDefinitions` sem diff.

- [ ] **Step 2: Push e PRs, sem merge**

```bash
git push -u origin feat/piuds-c2-comuns feat/piuds-c2-adultos feat/piuds-c2-kids
gh pr create --base main --head feat/piuds-c2-comuns --title "PiuDS C2: componentes comuns, Pipo, Haze e graphics-shapes"
gh pr create --base feat/piuds-c2-comuns --head feat/piuds-c2-adultos --title "PiuDS C2: componentes do adulto"
gh pr create --base feat/piuds-c2-comuns --head feat/piuds-c2-kids --title "PiuDS C2: componentes do Kids"
```

Cada descrição lista os snapshots novos, as decisões deste plano que tocam o PR e o resultado do iOS. O PR do docs
aponta para os três.
