# Frente E3 — Favoritos em mosaico e Configurações em cartões: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o E3 da frente E: a aba Favoritos passa a usar o mosaico do Explorar, com o título e a contagem de aves guardadas rolando junto; a aba Configurações ganha os grupos de cartões da prancheta, com o tema em botões segmentados; as regras do mosaico (colunas, alturas, bioma padrão) passam a morar no PiuDS.

**Architecture:**
- **Um PR no `passarim-app` (`feat/e3-favoritos-configuracoes`, sobre `feat/e1-explorar`, app #37)**, de baixo para cima: a contagem no estado dos Favoritos (Task 1), as regras do mosaico no PiuDS (Task 2), a tela dos Favoritos (Task 3) e a das Configurações (Task 4). As Tasks 5 a 7 são as correções da revisão final.
- **Este plano** vai num PR do `passarim-docs` (`docs/plano-frente-e3`). Foi gerado dos commits do app #37 e provado por replay: aplicado tarefa por tarefa numa worktree limpa, reproduz a árvore de cada commit.
- O Detalhe novo e o cabeçalho do Explorar rolando junto são o E2, que corre em paralelo sobre a mesma base. Aqui o Explorar só troca a regra de alturas pela do PiuDS (Task 5).

**Tech Stack:** Kotlin 2.4.21, Compose Multiplatform 1.12.2 (`LazyVerticalStaggeredGrid`, `FlowRow`, `Layout`), Koin 4.2.2, Room (tabela `favorites`), Paparazzi 2.0.0-alpha05.1, Robolectric + `androidx.compose.ui.test.v2.runComposeUiTest`, assertk, Turbine.

**Spec:** `passarim-docs/docs/superpowers/specs/2026-11-08-passarim-frente-e-adulto-design.md` (docs #29), seções 1 (critério de pronto: as telas batem com as pranchetas), 3 (mosaico), 7 (Favoritos e Configurações) e 8 (testes). Prancheta: `docs/design/direcoes-2026/canvas/FavoritosConfiguracoes.dc.html`. Plano anterior: E1 (`2026-11-11-passarim-frente-e1-explorar.md`).

## Global Constraints

- **Comentários didáticos em português** em todo código novo ou alterado (regra do `~/dev/passarim/CLAUDE.md`): todo arquivo começa dizendo o seu papel; conceitos aparecem explicados na primeira vez no arquivo (`LazyVerticalStaggeredGrid`, `FullLine`, `pluralStringResource`, `FlowRow`, `selectableGroup`, `Layout` e `maxIntrinsicWidth`, `key`/`contentType`); mudou o código, atualiza o comentário.
- **Idioma:** identificadores em inglês; comentários, KDoc, commits e PRs em português do Brasil. Nomes de teste em português entre crases, **sem acento e sem vírgula**.
- **Identidade do Git:** `velosobr <linoc.veloso@gmail.com>`. Commits terminam com as linhas de atribuição da sessão.
- **JDK 21** (`export JAVA_HOME=$(/usr/libexec/java_home -v 21)`).
- **Navegação só liga:** o `TabsScreen` só repassa o `contentPadding` da barra às abas; nenhum `LaunchedEffect`, `collect` ou `DisposableEffect` no bloco de rota.
- **Fonte grande:** empilhar, nunca cortar o texto (regra da 5b). A partir de 1.5×, o mosaico tem uma coluna e o tema fica empilhado; abaixo disso, o tema empilha quando não cabe (Task 6).
- **Testes de UI no host:** `runComposeUiTest` da v2 no Robolectric. Teste que depende da largura do texto usa `@GraphicsMode(GraphicsMode.Mode.NATIVE)`; no modo padrão, o texto mede quase nada.
- **Snapshots:** Piu em claro e escuro, cada um a 1.0×, 1.3× e 2.0×. Grave só as classes da tarefa (`--tests`) e abra cada imagem antes do commit.
- **Sem merge e sem push na `main`:** os merges são do dono.

## Review Focus

1. **O xadrez do mosaico:** a grade põe cada card na coluna mais curta, então a sequência de alturas decide o desenho. Com alto, baixo, alto, baixo, cada coluna tem um alto e um baixo e as duas terminam juntas, como na prancheta. Teste `cada coluna do mosaico tem um card alto e um baixo e as duas terminam juntas` (Task 5).
2. **O tema em aparelho estreito:** a 360 dp com 1.3× e a 320 dp com 1.0×, as três opções não cabem lado a lado e ficam empilhadas, sem palavra quebrada. Testes `o tema cabe num aparelho de 360 dp com fonte 1_3` e `... 320 dp com fonte 1_0` (Task 6) e o snapshot no Nexus 5.
3. **O espaço da barra flutuante:** as duas abas recebem o `contentPadding` e rolam por baixo da barra; o último item termina acima dela (snapshots `systemEnd`; ver o ledger, M3).
4. **Leitor de tela:** títulos e seções como cabeçalho, o tema como grupo de opções (`Role.RadioButton`), as chaves com `Role.Switch` na linha toda e as linhas que abrem subtelas com `Role.Button`.

## Decisões deste plano

1. **As regras do mosaico ficam no PiuDS** (`PiuMosaicLayout.kt`). O Explorar usa a sequência de alturas e o bioma padrão de lá desde a Task 5; o número de colunas dele (`exploreGridColumns`) fica para a unificação depois do E2 (ledger, M5).
2. **Conflito spec §3 × prancheta: vale a prancheta.** A spec cita "`TALL`, `SHORT`, `SHORT`, `TALL`"; numa grade que põe cada card na coluna mais curta, essa sequência deixa os dois altos na mesma coluna. A Task 2 segue a spec; a Task 5 a corrige para alto, baixo, alto, baixo.
3. **A contagem é derivada** (`FavoritesState.Content.count = items.size`) e a frase vem de `<plurals>`.
4. **O título dos Favoritos é o primeiro item da grade** (`FullLine`), para rolar junto, como o dono decidiu para o Explorar.
5. **Os favoritos não guardam o bioma principal:** sem foto, o card usa o gradiente do Pantanal (`PiuFallbackBiome`). Guardar o bioma pede migração do Room.
6. **Os botões segmentados são feitos na tela** (sem o check do `SegmentedButton` do Material), com 48 dp por opção, `selectableGroup` e `Role.RadioButton`.
7. **A cor do cartão segue o brilho do fundo:** `surfaceContainerLowest` no claro, `surfaceContainer` no escuro.
8. **Testes de caracterização:** parte dos testes de UI das Tasks 3 e 4 já passa antes do código novo, de propósito: eles fixam o comportamento de hoje (título rolando, toques, vazio, seções, empilhamento a 2.0×) para a troca de layout não quebrá-lo. O RED esperado de cada tarefa diz quais falham.

## Task 0: Preparação

- [ ] **Step 1: Branch**

```bash
cd passarim-app
git fetch origin
git checkout -b feat/e3-favoritos-configuracoes origin/feat/e1-explorar
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
```

- [ ] **Step 2: Base verde**

Run: `./gradlew ktlintCheck detekt allTests :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL` (no Mac com Xcode 16.2, só os `linkDebugTestIosSimulatorArm64` de `:app` e `:feature:detail:presentation` falham, por `ld: framework '_LocationEssentials' not found`; o MapLibre pede o Xcode 26).

## Tasks

### Task 1: Contagem de aves guardadas no estado dos Favoritos

O subtítulo da prancheta é a contagem ("4 aves guardadas"). `FavoritesState.Content.count` é calculada de `items` (nunca guardada à parte), então lista e contagem não discordam.

**Files:**
- Modify: `feature/favorites/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/favorites/presentation/FavoritesState.kt`
- Test: `feature/favorites/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/favorites/presentation/FavoritesViewModelTest.kt`

**Interfaces:**
- Produz: `val FavoritesState.Content.count: Int` (`items.size`).

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `feature/favorites/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/favorites/presentation/FavoritesViewModelTest.kt`:

```kotlin
// Testes do ViewModel dos Favoritos com um repositório falso em memória.

package com.velosobr.passarim.feature.favorites.presentation

import app.cash.turbine.test
import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.isEqualTo
import com.velosobr.passarim.core.domain.FavoritesRepository
import com.velosobr.passarim.core.domain.SpeciesSummary
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test

// Duas aves de exemplo.
private val arara = SpeciesSummary("anodorhynchus-hyacinthinus", "Arara-azul-grande", "Anodorhynchus hyacinthinus", null)
private val tucano = SpeciesSummary("ramphastos-toco", "Tucano-toco", "Ramphastos toco", "https://media/tucano.webp")

/**
 * Favoritos falsos num StateFlow. Começar com null simula o banco ainda sem
 * resposta (filterNotNull só deixa passar a lista quando ela chega).
 */
private class FakeFavoritesRepository(
    initial: List<SpeciesSummary>?,
) : FavoritesRepository {
    val favorites = MutableStateFlow(initial)
    val toggled = mutableListOf<SpeciesSummary>()

    override fun observeIds(): Flow<Set<String>> = observeAll().map { list -> list.map { it.id }.toSet() }

    override fun observeAll(): Flow<List<SpeciesSummary>> = favorites.filterNotNull()

    override suspend fun toggle(summary: SpeciesSummary) {
        toggled += summary
        favorites.value = favorites.value.orEmpty().filterNot { it.id == summary.id }
    }

    override suspend fun refresh(summary: SpeciesSummary) = Unit
}

@OptIn(ExperimentalCoroutinesApi::class)
class FavoritesViewModelTest {
    @BeforeTest
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @AfterTest
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun `carregando ate o banco responder`() {
        val vm = FavoritesViewModel(FakeFavoritesRepository(initial = null))

        assertThat(vm.state.value).isEqualTo(FavoritesState.Loading)
    }

    @Test
    fun `sem favoritos fica vazio`() {
        val vm = FavoritesViewModel(FakeFavoritesRepository(initial = emptyList()))

        assertThat(vm.state.value).isEqualTo(FavoritesState.Empty)
    }

    @Test
    fun `com favoritos mostra a lista na ordem do repositorio`() {
        val vm = FavoritesViewModel(FakeFavoritesRepository(initial = listOf(tucano, arara)))

        assertThat(vm.state.value).isEqualTo(FavoritesState.Content(listOf(tucano, arara)))
    }

    @Test
    fun `desfavoritar remove da lista e o ultimo leva ao vazio`() {
        val repository = FakeFavoritesRepository(initial = listOf(tucano, arara))
        val vm = FavoritesViewModel(repository)

        vm.onAction(FavoritesAction.ToggleFavorite(tucano))
        assertThat(vm.state.value).isEqualTo(FavoritesState.Content(listOf(arara)))

        vm.onAction(FavoritesAction.ToggleFavorite(arara))
        assertThat(vm.state.value).isEqualTo(FavoritesState.Empty)
        assertThat(repository.toggled).containsExactly(tucano, arara)
    }

    @Test
    fun `a contagem acompanha as aves guardadas`() {
        // A contagem vai para o subtítulo ("2 aves guardadas") e cai junto quando uma ave sai.
        val repository = FakeFavoritesRepository(initial = listOf(tucano, arara))
        val vm = FavoritesViewModel(repository)
        assertThat((vm.state.value as FavoritesState.Content).count).isEqualTo(2)

        vm.onAction(FavoritesAction.ToggleFavorite(tucano))
        assertThat((vm.state.value as FavoritesState.Content).count).isEqualTo(1)
    }

    @Test
    fun `abrir uma ave e explorar viram eventos de navegacao`() =
        runTest {
            val vm = FavoritesViewModel(FakeFavoritesRepository(initial = listOf(arara)))

            vm.events.test {
                vm.onAction(FavoritesAction.OpenDetail(arara.id))
                assertThat(awaitItem()).isEqualTo(FavoritesEvent.NavigateToDetail(arara.id))
                vm.onAction(FavoritesAction.ExploreClick)
                assertThat(awaitItem()).isEqualTo(FavoritesEvent.NavigateToExplore)
            }
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:favorites:presentation:testAndroidHostTest`

Expected: FAIL na compilação: `Function invocation 'count(...)' expected` em `FavoritesViewModelTest` (a propriedade ainda não existe e o Kotlin tenta a `count()` das coleções).

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `feature/favorites/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/favorites/presentation/FavoritesState.kt`:

```kotlin
// O estado da aba Favoritos.

package com.velosobr.passarim.feature.favorites.presentation

import com.velosobr.passarim.core.domain.SpeciesSummary

/** Carregando (o banco ainda não respondeu), com itens ou vazio. */
sealed interface FavoritesState {
    data object Loading : FavoritesState

    /**
     * As aves guardadas, na ordem do repositório (a mais recente primeiro).
     * [count] é calculada a partir de [items], e não guardada à parte: assim
     * as duas nunca discordam. "get() =" refaz a conta a cada leitura, o que
     * é barato (o tamanho de uma lista).
     */
    data class Content(
        val items: List<SpeciesSummary>,
    ) : FavoritesState {
        /** Quantas aves estão guardadas, para o subtítulo ("4 aves guardadas"). */
        val count: Int get() = items.size
    }

    data object Empty : FavoritesState
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :feature:favorites:presentation:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:favorites:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m 'feat: contagem de aves guardadas no estado dos Favoritos'
```

### Task 2: Regras de colunas e alturas do mosaico no PiuDS

Os Favoritos usam o mesmo mosaico do Explorar (spec, seção 7). As regras viram funções puras no PiuDS (`PiuMosaicLayout.kt`): 2 colunas, ou 1 a partir de 1.5× de fonte (`PIU_STACK_FONT_SCALE`, regra da 5b), e a altura de cada card pela posição. A sequência de alturas desta tarefa é a da spec (alto, baixo, baixo, alto); a Task 5 a corrige para a da prancheta.

**Files:**
- Create: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PiuMosaicLayout.kt`
- Create (test): `core/piu-ds/src/commonTest/kotlin/com/velosobr/piuds/components/adult/PiuMosaicLayoutTest.kt`

**Interfaces:**
- Produz: `const val PIU_STACK_FONT_SCALE = 1.5f`, `fun piuMosaicColumns(fontScale: Float): Int` e `fun piuMosaicHeightFor(index: Int): PiuMosaicHeight` em `core:piu-ds` (`components.adult`).

- [ ] **Step 1: Escrever o teste que falha**

Crie `core/piu-ds/src/commonTest/kotlin/com/velosobr/piuds/components/adult/PiuMosaicLayoutTest.kt`:

```kotlin
// Testes das regras de layout do mosaico do PiuDS: quantas colunas para cada
// escala de fonte e a sequência de alturas que deixa as colunas desencontradas.
// São funções puras (sem Compose), então rodam como teste comum.

package com.velosobr.piuds.components.adult

import assertk.assertThat
import assertk.assertions.isEqualTo
import com.velosobr.piuds.components.adult.PiuMosaicHeight.SHORT
import com.velosobr.piuds.components.adult.PiuMosaicHeight.TALL
import kotlin.test.Test

class PiuMosaicLayoutTest {
    @Test
    fun `duas colunas ate fonte 1_3 e uma coluna a partir de 1_5`() {
        assertThat(piuMosaicColumns(1.0f)).isEqualTo(2)
        assertThat(piuMosaicColumns(1.3f)).isEqualTo(2)
        assertThat(piuMosaicColumns(PIU_STACK_FONT_SCALE)).isEqualTo(1)
        assertThat(piuMosaicColumns(2.0f)).isEqualTo(1)
    }

    @Test
    fun `as alturas alternam alto e baixo para as colunas ficarem desencontradas`() {
        // Coluna da esquerda: alto, baixo; da direita: baixo, alto. As linhas nunca se alinham.
        val heights = (0 until 8).map { piuMosaicHeightFor(it) }
        assertThat(heights).isEqualTo(listOf(TALL, SHORT, SHORT, TALL, TALL, SHORT, SHORT, TALL))
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: FAIL na compilação: `Unresolved reference 'piuMosaicColumns'`, `'piuMosaicHeightFor'` e `'PIU_STACK_FONT_SCALE'`.

- [ ] **Step 3: Implementar**

Crie `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PiuMosaicLayout.kt`:

```kotlin
// As regras de layout do mosaico adulto (frente E), num lugar só para as telas
// que o usam (Favoritos agora; o Explorar tem a mesma regra na própria feature).
// São funções puras: recebem números e devolvem números, sem Compose, e por
// isso são testadas como qualquer função comum (PiuMosaicLayoutTest).

package com.velosobr.piuds.components.adult

/**
 * A escala de fonte a partir da qual as telas adultas empilham o que ficaria
 * lado a lado (a grade vira uma coluna, as opções do tema vão uma embaixo da
 * outra). A regra é a da 5b: com fonte grande, empilhar, nunca cortar o texto.
 */
const val PIU_STACK_FONT_SCALE = 1.5f

/** Quantas colunas o mosaico tem para a escala de fonte do aparelho: 2, ou 1 com fonte grande. */
fun piuMosaicColumns(fontScale: Float): Int = if (fontScale >= PIU_STACK_FONT_SCALE) 1 else 2

/**
 * A altura do card na posição [index]: alto, baixo, baixo, alto, e repete. Com
 * duas colunas, a da esquerda começa alta e a da direita baixa (a grade põe
 * cada card na coluna mais curta), e as linhas nunca se alinham.
 */
fun piuMosaicHeightFor(index: Int): PiuMosaicHeight = if (index % 4 == 0 || index % 4 == 3) PiuMosaicHeight.TALL else PiuMosaicHeight.SHORT
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
git commit -m 'feat: regras de colunas e alturas do mosaico no PiuDS, para os Favoritos usarem'
```

### Task 3: Favoritos no mosaico

A aba ganha o desenho da prancheta `FavoritosConfiguracoes.dc.html`: `PiuMosaicCard` num `LazyVerticalStaggeredGrid`, com o título e a contagem (`<plurals>`) como primeiro item (`FullLine`), rolando junto. O estado vazio continua o de hoje. O `TabsScreen` para de embrulhar a aba num `Box` com padding e passa o espaço da barra como `contentPadding`, para a grade rolar por baixo da barra desfocada. O módulo ganha testes de UI no host (Robolectric + ui-test).

**Files:**
- Modify: `app/src/commonMain/kotlin/com/velosobr/passarim/app/tabs/TabsScreen.kt`
- Modify: `feature/favorites/presentation/build.gradle.kts`
- Create (test): `feature/favorites/presentation/src/androidHostTest/kotlin/com/velosobr/passarim/feature/favorites/presentation/FavoritesScreenTest.kt`
- Modify: `feature/favorites/presentation/src/commonMain/composeResources/values/strings.xml`
- Modify: `feature/favorites/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/favorites/presentation/FavoritesRoot.kt`
- Modify: `feature/favorites/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/favorites/presentation/FavoritesScreen.kt`
- Test: `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/FavoritesSnapshotTest.kt`
- Record: 12 imagens em `snapshots/src/test/snapshots/images/` (0 novas, 12 regravadas)

**Interfaces:**
- Muda: `FavoritesScreen(state, onAction, modifier = Modifier, contentPadding: PaddingValues = PaddingValues(), gridState: LazyStaggeredGridState = rememberLazyStaggeredGridState())` e `FavoritesRoot(onOpenDetail, onOpenExplore, contentPadding: PaddingValues = PaddingValues(), viewModel)`.
- Consome: `piuMosaicColumns`/`piuMosaicHeightFor` (Task 2), `FavoritesState.Content.count` (Task 1) e `PiuMosaicCard` do C2.

- [ ] **Step 1: Escrever o teste que falha**

Crie `feature/favorites/presentation/src/androidHostTest/kotlin/com/velosobr/passarim/feature/favorites/presentation/FavoritesScreenTest.kt`:

```kotlin
// Testes da tela de Favoritos no mosaico (frente E3): o título e a contagem no
// singular e no plural, os toques no card e no coração, o título rolando junto
// com a grade e o estado vazio. Rodam no Robolectric (um Android de mentira na
// JVM) com runComposeUiTest, que monta a tela e deixa consultar a semântica.

package com.velosobr.passarim.feature.favorites.presentation

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isNotDisplayed
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.v2.runComposeUiTest
import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.isTrue
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.domain.SpeciesSummary
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

private val arara = SpeciesSummary("anodorhynchus-hyacinthinus", "Arara-azul-grande", "Anodorhynchus hyacinthinus", null, Biome.PANTANAL)
private val carcara = SpeciesSummary("caracara-plancus", "Carcará", "Caracara plancus", null, Biome.CAATINGA)

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class FavoritesScreenTest {
    /** O título é marcado como cabeçalho: o leitor de tela deixa pular direto para ele. */
    private val isHeading = SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading)

    @Test
    fun `titulo e cabecalho e a contagem fica no plural`() =
        runComposeUiTest {
            setContent { PiuTheme { FavoritesScreen(FavoritesState.Content(listOf(arara, carcara)), onAction = {}) } }
            onNodeWithText("Favoritos").assert(isHeading)
            onNodeWithText("2 aves guardadas").assertIsDisplayed()
        }

    @Test
    fun `com uma ave a contagem fica no singular`() =
        runComposeUiTest {
            setContent { PiuTheme { FavoritesScreen(FavoritesState.Content(listOf(arara)), onAction = {}) } }
            onNodeWithText("1 ave guardada").assertIsDisplayed()
        }

    @Test
    fun `tocar no card abre a ave e tocar no coracao desfavorita`() =
        runComposeUiTest {
            val actions = mutableListOf<FavoritesAction>()
            setContent { PiuTheme { FavoritesScreen(FavoritesState.Content(listOf(arara, carcara)), onAction = { actions += it }) } }
            onNodeWithText("Carcará").performClick()
            onNode(hasContentDescription("Desfavoritar Arara-azul-grande")).performClick()
            assertThat(actions).containsExactly(
                FavoritesAction.OpenDetail(carcara.id),
                FavoritesAction.ToggleFavorite(arara),
            )
        }

    @Test
    fun `o titulo rola junto com a grade`() =
        runComposeUiTest {
            val many = (1..16).map { SpeciesSummary("ave-$it", "Ave $it", "Avis $it", null, Biome.CERRADO) }
            setContent { PiuTheme { FavoritesScreen(FavoritesState.Content(many), onAction = {}) } }
            onNode(hasScrollAction()).performScrollToNode(hasText("Ave 16"))
            // Se o título ficasse fixo no topo, ele continuaria na tela depois de rolar até o fim.
            assertThat(onNodeWithText("Favoritos").isNotDisplayed()).isTrue()
        }

    @Test
    fun `vazio convida a explorar`() =
        runComposeUiTest {
            val actions = mutableListOf<FavoritesAction>()
            setContent { PiuTheme { FavoritesScreen(FavoritesState.Empty, onAction = { actions += it }) } }
            onNodeWithText("Favoritos").assert(isHeading)
            onNodeWithText("Nenhum favorito ainda").assertIsDisplayed()
            onNodeWithText("Explorar aves").performClick()
            assertThat(actions).containsExactly(FavoritesAction.ExploreClick)
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:favorites:presentation:testAndroidHostTest`

Expected: FAIL em 2 de 5 testes de `FavoritesScreenTest`: `titulo e cabecalho e a contagem fica no plural` e `com uma ave a contagem fica no singular` (a contagem ainda não existe na tela). Os outros 3 (o título rolando, o toque no card e no coração, o vazio) já passam: são testes de caracterização, que fixam o comportamento de hoje para a troca de layout não quebrá-lo.

- [ ] **Step 3: Ajustar `build.gradle.kts`**

Em `feature/favorites/presentation/build.gradle.kts`, aplique (o diff mostra o arquivo antes e depois):

```diff
diff --git a/feature/favorites/presentation/build.gradle.kts b/feature/favorites/presentation/build.gradle.kts
index 85a5ca0..bd2625d 100644
--- a/feature/favorites/presentation/build.gradle.kts
+++ b/feature/favorites/presentation/build.gradle.kts
@@ -20,5 +20,13 @@ kotlin {
             implementation(libs.turbine)
             implementation(libs.kotlinx.coroutines.test)
         }
+        // Testes de Compose no host Android (como no PiuDS): o Robolectric imita o Android numa JVM
+        // comum, e o ui-test monta a tela e consulta a árvore de semântica (o que o leitor de tela lê).
+        getByName("androidHostTest").dependencies {
+            implementation(libs.compose.uiTest)
+            implementation(libs.androidx.compose.uiTestManifest)
+            implementation(libs.robolectric)
+            implementation(libs.junit4)
+        }
     }
 }
```

- [ ] **Step 4: Ajustar `strings.xml`**

Em `feature/favorites/presentation/src/commonMain/composeResources/values/strings.xml`, aplique (o diff mostra o arquivo antes e depois):

```diff
diff --git a/feature/favorites/presentation/src/commonMain/composeResources/values/strings.xml b/feature/favorites/presentation/src/commonMain/composeResources/values/strings.xml
index d2d77e7..604c418 100644
--- a/feature/favorites/presentation/src/commonMain/composeResources/values/strings.xml
+++ b/feature/favorites/presentation/src/commonMain/composeResources/values/strings.xml
@@ -1,7 +1,10 @@
 <resources>
     <string name="favorites_title">Favoritos</string>
-    <string name="favorites_subtitle">Salvos neste aparelho. Funcionam sem internet.</string>
     <string name="empty_title">Nenhum favorito ainda</string>
     <string name="empty_body">Toque no coração de uma ave para guardá-la aqui. Os favoritos ficam salvos no aparelho e funcionam sem internet.</string>
     <string name="explore_birds">Explorar aves</string>
+    <plurals name="favorites_count">
+        <item quantity="one">%1$d ave guardada</item>
+        <item quantity="other">%1$d aves guardadas</item>
+    </plurals>
 </resources>
```

- [ ] **Step 5: Implementar**

Substitua o conteúdo de `app/src/commonMain/kotlin/com/velosobr/passarim/app/tabs/TabsScreen.kt`:

```kotlin
// A tela das abas do adulto: o NavHost de cada aba e, flutuando por cima, a
// barra de navegação em pílula do PiuDS, que desfoca o conteúdo que passa por
// baixo dela (frente E). "by" lê o State como valor comum;
// currentBackStackEntryAsState recompõe a barra quando a aba muda.

package com.velosobr.passarim.app.tabs

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.velosobr.passarim.app.navigation.ExploreRoute
import com.velosobr.passarim.app.navigation.FavoritesRoute
import com.velosobr.passarim.app.navigation.SettingsRoute
import com.velosobr.passarim.feature.explore.presentation.ExploreRoot
import com.velosobr.passarim.feature.favorites.presentation.FavoritesRoot
import com.velosobr.passarim.feature.settings.presentation.SettingsRoot
import com.velosobr.piuds.components.PiuNavItem
import com.velosobr.piuds.components.adult.PiuFloatingNavBar
import com.velosobr.piuds.components.piuBlurSource
import com.velosobr.piuds.components.rememberPiuBlurState
import org.jetbrains.compose.resources.stringResource
import org.jetbrains.compose.resources.vectorResource

/** A altura da barra flutuante (68 dp) mais a margem dela até o fim da tela (24 dp). */
private val FloatingBarSpace = 92.dp

/**
 * As abas com um `NavHost` interno: cada aba tem a sua pilha, e trocar de aba guarda e restaura o
 * estado (`saveState`/`restoreState`). O conteúdo ocupa a tela inteira e é a fonte do desfoque; a
 * barra flutua por cima, acima da área do gesto de navegação do sistema (`navigationBars`). Cada
 * tela recebe o espaço da barra para o fim da lista não ficar escondido atrás dela.
 */
@Composable
fun TabsScreen(
    onOpenDetail: (id: String, autoPlay: Boolean) -> Unit,
    onOpenStorage: () -> Unit,
    onOpenAbout: () -> Unit,
) {
    val navController = rememberNavController()
    val backStack by navController.currentBackStackEntryAsState()
    val blur = rememberPiuBlurState()
    val systemBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val barPadding = PaddingValues(bottom = FloatingBarSpace + systemBottom)
    Box(Modifier.fillMaxSize()) {
        NavHost(
            navController,
            startDestination = ExploreRoute,
            modifier = Modifier.fillMaxSize().piuBlurSource(blur).statusBarsPadding(),
        ) {
            composable<ExploreRoute> {
                ExploreRoot(
                    onOpenDetail = onOpenDetail,
                    onOpenFavorites = { navController.navigateToTab(Tab.Favorites) },
                    contentPadding = barPadding,
                )
            }
            composable<FavoritesRoute> {
                FavoritesRoot(
                    onOpenDetail = { id -> onOpenDetail(id, false) },
                    onOpenExplore = { navController.navigateToTab(Tab.Explore) },
                    contentPadding = barPadding,
                )
            }
            // Configurações ganham o visual novo ainda na frente E3; até lá, só reservam o espaço da barra.
            composable<SettingsRoute> {
                Box(Modifier.padding(barPadding)) { SettingsRoot(onOpenStorage = onOpenStorage, onOpenAbout = onOpenAbout) }
            }
        }
        val tabs = Tab.entries
        PiuFloatingNavBar(
            items = tabs.map { PiuNavItem(vectorResource(it.icon), stringResource(it.label)) },
            selected = tabs.indexOfFirst { backStack?.destination?.hasRoute(it.route::class) == true }.coerceAtLeast(0),
            onSelect = { navController.navigateToTab(tabs[it]) },
            blurState = blur,
            modifier = Modifier.align(Alignment.BottomCenter).padding(start = 24.dp, end = 24.dp, bottom = 24.dp + systemBottom),
        )
    }
}

/** Troca de aba como a barra inferior faz: uma instância por aba, guardando o estado da que sai. */
private fun NavHostController.navigateToTab(tab: Tab) {
    navigate(tab.route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}
```

Substitua o conteúdo de `feature/favorites/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/favorites/presentation/FavoritesRoot.kt`:

```kotlin
// A ligação entre a aba Favoritos e o ViewModel.

package com.velosobr.passarim.feature.favorites.presentation

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.velosobr.passarim.core.presentation.ObserveAsEvents
import org.koin.compose.viewmodel.koinViewModel

/**
 * Liga a tela ao ViewModel e transforma os eventos em navegação, que fica a cargo do app.
 * [contentPadding] é o espaço da barra flutuante das abas, repassado à tela.
 */
@Composable
fun FavoritesRoot(
    onOpenDetail: (String) -> Unit,
    onOpenExplore: () -> Unit,
    contentPadding: PaddingValues = PaddingValues(),
    viewModel: FavoritesViewModel = koinViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    ObserveAsEvents(viewModel.events) { event ->
        when (event) {
            is FavoritesEvent.NavigateToDetail -> onOpenDetail(event.id)
            FavoritesEvent.NavigateToExplore -> onOpenExplore()
        }
    }
    FavoritesScreen(state = state, onAction = viewModel::onAction, contentPadding = contentPadding)
}
```

Substitua o conteúdo de `feature/favorites/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/favorites/presentation/FavoritesScreen.kt`:

```kotlin
// A tela da aba Favoritos (frente E3): o mesmo mosaico do Explorar, com o
// título e a contagem de aves guardadas rolando junto com os cards, ou o
// estado vazio. Os cards (PiuMosaicCard) e as regras de colunas e alturas
// vêm do PiuDS; o FavoritesRoot liga esta tela ao ViewModel.

package com.velosobr.passarim.feature.favorites.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.staggeredgrid.LazyStaggeredGridState
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan
import androidx.compose.foundation.lazy.staggeredgrid.itemsIndexed
import androidx.compose.foundation.lazy.staggeredgrid.rememberLazyStaggeredGridState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.feature.favorites.presentation.resources.Res
import com.velosobr.passarim.feature.favorites.presentation.resources.empty_body
import com.velosobr.passarim.feature.favorites.presentation.resources.empty_title
import com.velosobr.passarim.feature.favorites.presentation.resources.explore_birds
import com.velosobr.passarim.feature.favorites.presentation.resources.favorites_count
import com.velosobr.passarim.feature.favorites.presentation.resources.favorites_title
import com.velosobr.piuds.components.PiuStateScreen
import com.velosobr.piuds.components.adult.PiuMosaicCard
import com.velosobr.piuds.components.adult.piuMosaicColumns
import com.velosobr.piuds.components.adult.piuMosaicHeightFor
import com.velosobr.piuds.resources.ic_favorites
import com.velosobr.piuds.theme.PiuDimens
import org.jetbrains.compose.resources.painterResource
import org.jetbrains.compose.resources.pluralStringResource
import org.jetbrains.compose.resources.stringResource
import com.velosobr.piuds.resources.Res as DesignRes

/** O gradiente de um card sem bioma principal: o do Pantanal, como no Explorar. */
private val FallbackBiome = Biome.PANTANAL

/**
 * A tela sem estado próprio: tudo vem de [state] e cada toque vira uma [FavoritesAction]. Enquanto o
 * banco não responde, mostra só o título. [contentPadding] é o espaço da barra flutuante embaixo: a
 * grade rola por baixo dela (o desfoque precisa do conteúdo atrás) e termina acima dela.
 */
@Composable
fun FavoritesScreen(
    state: FavoritesState,
    onAction: (FavoritesAction) -> Unit,
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(),
    gridState: LazyStaggeredGridState = rememberLazyStaggeredGridState(),
) {
    when (state) {
        FavoritesState.Loading -> FavoritesHeader(count = null, modifier.padding(horizontal = PiuDimens.screenMargin))
        FavoritesState.Empty -> EmptyFavorites(onAction, contentPadding, modifier)
        is FavoritesState.Content -> FavoritesMosaic(state, onAction, contentPadding, gridState, modifier)
    }
}

/**
 * O título "Favoritos" (marcado como cabeçalho para o leitor de tela) e, com aves, a contagem
 * ("4 aves guardadas"). pluralStringResource escolhe a frase no singular ou no plural pela regra
 * do idioma do aparelho. As margens laterais ficam com quem chama: na grade, elas já vêm do
 * contentPadding dela.
 */
@Composable
private fun FavoritesHeader(
    count: Int?,
    modifier: Modifier = Modifier,
) {
    Column(modifier.padding(top = 24.dp, bottom = 2.dp)) {
        Text(
            stringResource(Res.string.favorites_title),
            style = MaterialTheme.typography.headlineLarge,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.semantics { heading() },
        )
        if (count != null) {
            Text(
                pluralStringResource(Res.plurals.favorites_count, count, count),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * O mosaico: o cabeçalho ocupando a largura toda (FullLine) como primeiro item da grade, para rolar
 * junto com os cards, e as aves em colunas desencontradas. LazyVerticalStaggeredGrid é a grade em que
 * cada item tem a própria altura e entra na coluna mais curta; ela só cria os cards visíveis. Com
 * fonte grande, a grade vira uma coluna (piuMosaicColumns). animateItem anima a saída do card
 * desfavoritado e o deslizar dos outros.
 */
@Composable
private fun FavoritesMosaic(
    state: FavoritesState.Content,
    onAction: (FavoritesAction) -> Unit,
    contentPadding: PaddingValues,
    gridState: LazyStaggeredGridState,
    modifier: Modifier,
) {
    LazyVerticalStaggeredGrid(
        columns = StaggeredGridCells.Fixed(piuMosaicColumns(LocalDensity.current.fontScale)),
        state = gridState,
        modifier = modifier.fillMaxSize(),
        contentPadding =
            PaddingValues(
                start = PiuDimens.screenMargin,
                end = PiuDimens.screenMargin,
                bottom = contentPadding.calculateBottomPadding() + 16.dp,
            ),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalItemSpacing = 12.dp,
    ) {
        item(key = "header", span = StaggeredGridItemSpan.FullLine, contentType = "header") {
            FavoritesHeader(count = state.count)
        }
        itemsIndexed(state.items, key = { _, bird -> bird.id }, contentType = { _, _ -> "species" }) { index, bird ->
            PiuMosaicCard(
                name = bird.commonName,
                scientificName = bird.scientificName,
                imageUrl = bird.thumbnailUrl,
                biome = bird.primaryBiome ?: FallbackBiome,
                isFavorite = true,
                onToggleFavorite = { onAction(FavoritesAction.ToggleFavorite(bird)) },
                onClick = { onAction(FavoritesAction.OpenDetail(bird.id)) },
                height = piuMosaicHeightFor(index),
                modifier = Modifier.animateItem(),
            )
        }
    }
}

/**
 * Nenhum favorito: o convite para explorar, centralizado no espaço acima da barra flutuante.
 * BoxWithConstraints dá a altura disponível (maxHeight), usada para centralizar o conteúdo e ainda
 * permitir rolagem com fonte grande.
 */
@Composable
private fun EmptyFavorites(
    onAction: (FavoritesAction) -> Unit,
    contentPadding: PaddingValues,
    modifier: Modifier,
) {
    Column(modifier.fillMaxSize().padding(bottom = contentPadding.calculateBottomPadding())) {
        FavoritesHeader(count = null, Modifier.padding(horizontal = PiuDimens.screenMargin))
        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
            PiuStateScreen(
                icon = painterResource(DesignRes.drawable.ic_favorites),
                title = stringResource(Res.string.empty_title),
                body = stringResource(Res.string.empty_body),
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .heightIn(min = maxHeight)
                        .padding(vertical = 24.dp),
            ) {
                Button(onClick = { onAction(FavoritesAction.ExploreClick) }) {
                    Text(stringResource(Res.string.explore_birds))
                }
            }
        }
    }
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `./gradlew :feature:favorites:presentation:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 7: Snapshots**

Substitua o conteúdo de `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/FavoritesSnapshotTest.kt`:

```kotlin
// Snapshots da aba Favoritos.

package com.velosobr.passarim.snapshots

import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.domain.SpeciesSummary
import com.velosobr.passarim.feature.favorites.presentation.FavoritesScreen
import com.velosobr.passarim.feature.favorites.presentation.FavoritesState
import org.junit.Test

/** O mosaico com as quatro aves da prancheta e o estado vazio. A 2.0× a grade fica em 1 coluna. */
class FavoritesSnapshotTest(
    dark: Boolean,
    fontScalePercent: Int,
) : ThemedSnapshotTest(dark, fontScalePercent) {
    private val birds =
        listOf(
            SpeciesSummary("jabiru-mycteria", "Tuiuiú", "Jabiru mycteria", null, Biome.PANTANAL),
            SpeciesSummary("caracara-plancus", "Carcará", "Caracara plancus", null, Biome.CAATINGA),
            SpeciesSummary("cariama-cristata", "Seriema", "Cariama cristata", null, Biome.CERRADO),
            SpeciesSummary("anodorhynchus-hyacinthinus", "Arara-azul-grande", "Anodorhynchus hyacinthinus", null, Biome.PANTANAL),
        )

    @Test
    fun list() = snap("favorites") { FavoritesScreen(state = FavoritesState.Content(birds), onAction = {}) }

    @Test
    fun empty() = snap("favorites-empty") { FavoritesScreen(state = FavoritesState.Empty, onAction = {}) }
}
```

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*FavoritesSnapshotTest*'`

Expected: 0 imagens novas e 12 regravadas em `snapshots/src/test/snapshots/images/`. Abra cada uma e confira a 1.0×, 1.3× e 2.0×, no claro e no escuro: nada cortado, nada quebrado no meio da palavra; o mosaico com Tuiuiú, Carcará, Seriema e Arara-azul-grande e a contagem "4 aves guardadas"; a 2.0×, uma coluna; o vazio igual ao de hoje.

- [ ] **Step 8: Conferir que a navegação só liga**

O bloco de rota do `NavHost` só pega o ViewModel, repassa callbacks e navega; nenhum efeito ali.

Run: `git diff feat/e1-explorar -- '*Navigator*.kt' '*NavHost*.kt' '*Graph*.kt' '*TabsScreen*.kt' | grep -E '^\+.*(LaunchedEffect|DisposableEffect|\.collect *[{(])'`

Expected: nenhuma linha.

- [ ] **Step 9: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:favorites:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m 'feat: Favoritos no mosaico do Explorar, com a contagem de aves guardadas e o título rolando junto'
```

### Task 4: Configurações em grupos de cartões

A aba ganha os cartões da prancheta (spec, seção 7): Aparência, Reprodução, Dados e Sobre, cada um com título verde e cartão de 24 dp, linhas de 56 dp com ícone em círculo, e o tema em botões segmentados próprios (48 dp, `selectableGroup` + `Role.RadioButton`). A seção "Para crianças" é da frente D. As peças ficam em `SettingsCards.kt`; `SectionHeader` e `RowTextStart` saem. Como nos Favoritos, o `TabsScreen` passa o espaço da barra como `contentPadding`.

**Files:**
- Modify: `app/src/commonMain/kotlin/com/velosobr/passarim/app/tabs/TabsScreen.kt`
- Modify: `feature/settings/presentation/build.gradle.kts`
- Create (test): `feature/settings/presentation/src/androidHostTest/kotlin/com/velosobr/passarim/feature/settings/presentation/SettingsScreenTest.kt`
- Modify: `feature/settings/presentation/src/commonMain/composeResources/values/strings.xml`
- Create: `feature/settings/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/settings/presentation/SettingsCards.kt`
- Modify: `feature/settings/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/settings/presentation/SettingsComponents.kt`
- Modify: `feature/settings/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/settings/presentation/SettingsRoot.kt`
- Modify: `feature/settings/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/settings/presentation/SettingsScreen.kt`
- Test: `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/SettingsSnapshotTest.kt`
- Record: 30 imagens em `snapshots/src/test/snapshots/images/` (0 novas, 30 regravadas)

**Interfaces:**
- Produz: `SettingsGroup`, `GroupDivider`, `GroupRow`, `GroupFlowRow`, `Segment` e `SegmentedControl` (internos de `feature:settings:presentation`).
- Muda: `SettingsScreen(state, onAction, modifier, contentPadding: PaddingValues = PaddingValues(), scrollState: ScrollState = rememberScrollState())` e `SettingsRoot(..., contentPadding: PaddingValues = PaddingValues(), ...)`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `feature/settings/presentation/src/androidHostTest/kotlin/com/velosobr/passarim/feature/settings/presentation/SettingsScreenTest.kt`:

```kotlin
// Testes da aba Configurações em grupos de cartões (frente E3): as seções como
// cabeçalhos, o tema como botões segmentados que o leitor de tela anuncia como
// opções marcáveis, as chaves e as linhas que abrem outra tela. Rodam no
// Robolectric com runComposeUiTest (veja FavoritesScreenTest).

package com.velosobr.passarim.feature.settings.presentation

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import com.velosobr.passarim.core.domain.Settings
import com.velosobr.passarim.core.domain.ThemeMode
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class SettingsScreenTest {
    private val isHeading = SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading)

    /** Confere o papel que o leitor de tela anuncia ("botão de opção", "chave"). */
    private fun hasRole(role: Role) = SemanticsMatcher.expectValue(SemanticsProperties.Role, role)

    private val state =
        SettingsState(
            Settings(theme = ThemeMode.LIGHT, dynamicColors = false, autoPlay = true),
            dynamicColorsSupported = true,
            versionName = "1.0.0",
        )

    @Test
    fun `as quatro secoes sao cabecalhos e nao ha a secao para criancas`() =
        runComposeUiTest {
            setContent { PiuTheme { SettingsScreen(state, onAction = {}) } }
            listOf("Configurações", "Aparência", "Reprodução", "Dados", "Sobre").forEach { title ->
                onNode(hasText(title) and isHeading).performScrollTo()
            }
            onNodeWithText("Para crianças").assertDoesNotExist()
        }

    @Test
    fun `o tema e um grupo de botoes segmentados com a opcao atual marcada`() =
        runComposeUiTest {
            val actions = mutableListOf<SettingsAction>()
            setContent { PiuTheme { SettingsScreen(state, onAction = { actions += it }) } }
            onNodeWithText("Claro").assert(hasRole(Role.RadioButton)).assertIsSelected().assertHeightIsAtLeast(48.dp)
            onNodeWithText("Sistema").assertIsNotSelected()
            onNodeWithText("Escuro").assert(hasRole(Role.RadioButton)).assertIsNotSelected().performClick()
            assertThat(actions).containsExactly(SettingsAction.SelectTheme(ThemeMode.DARK))
            // Segmentados: as três opções lado a lado, na mesma linha.
            val tops = listOf("Sistema", "Claro", "Escuro").map { onNodeWithText(it).getBoundsInRoot().top }
            assertThat(tops.distinct()).hasSize(1)
        }

    @Test
    fun `com fonte grande as opcoes do tema ficam uma embaixo da outra`() =
        runComposeUiTest {
            setContent {
                // Density com fontScale 2: o mesmo que a pessoa aumentar a fonte do aparelho para 200%.
                val density = LocalDensity.current
                CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale = 2f)) {
                    PiuTheme { SettingsScreen(state, onAction = {}) }
                }
            }
            val tops = listOf("Sistema", "Claro", "Escuro").map { onNodeWithText(it).getBoundsInRoot().top }
            assertThat(tops).isEqualTo(tops.sorted())
            assertThat(tops.distinct()).hasSize(3)
        }

    @Test
    fun `as chaves de cores e de reproducao mudam a preferencia`() =
        runComposeUiTest {
            val actions = mutableListOf<SettingsAction>()
            setContent { PiuTheme { SettingsScreen(state, onAction = { actions += it }) } }
            onNodeWithText("Cores do papel de parede").assertIsOff().performClick()
            onNodeWithText("Tocar o canto ao abrir")
                .performScrollTo()
                .assert(hasRole(Role.Switch))
                .assertIsOn()
                .performClick()
            assertThat(actions).containsExactly(SettingsAction.ChangeDynamicColors(true), SettingsAction.ChangeAutoPlay(false))
        }

    @Test
    fun `sem cores dinamicas no sistema a chave nao aparece`() =
        runComposeUiTest {
            setContent { PiuTheme { SettingsScreen(state.copy(dynamicColorsSupported = false), onAction = {}) } }
            onNodeWithText("Cores do papel de parede").assertDoesNotExist()
        }

    @Test
    fun `armazenamento e sobre abrem as subtelas`() =
        runComposeUiTest {
            val actions = mutableListOf<SettingsAction>()
            setContent { PiuTheme { SettingsScreen(state, onAction = { actions += it }) } }
            onNodeWithText("Armazenamento").performScrollTo().performClick()
            onNodeWithText("Versão 1.0.0, fontes e licenças").performScrollTo()
            onNodeWithText("Sobre o Passarim").performClick()
            assertThat(actions).containsExactly(SettingsAction.OpenStorage, SettingsAction.OpenAbout)
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:settings:presentation:testAndroidHostTest`

Expected: FAIL em 3 de 6 testes de `SettingsScreenTest`: `o tema e um grupo de botoes segmentados com a opcao atual marcada`, `armazenamento e sobre abrem as subtelas` e `as chaves de cores e de reproducao mudam a preferencia` (textos e papéis novos). Os outros 3 (seções como cabeçalho, o empilhamento a 2.0× e "sem cores dinâmicas") já passam: são testes de caracterização.

- [ ] **Step 3: Ajustar `build.gradle.kts`**

Em `feature/settings/presentation/build.gradle.kts`, aplique (o diff mostra o arquivo antes e depois):

```diff
diff --git a/feature/settings/presentation/build.gradle.kts b/feature/settings/presentation/build.gradle.kts
index 25481d5..ba97173 100644
--- a/feature/settings/presentation/build.gradle.kts
+++ b/feature/settings/presentation/build.gradle.kts
@@ -22,5 +22,13 @@ kotlin {
             implementation(libs.turbine)
             implementation(libs.kotlinx.coroutines.test)
         }
+        // Testes de Compose no host Android (como no PiuDS): o Robolectric imita o Android numa JVM
+        // comum, e o ui-test monta a tela e consulta a árvore de semântica (o que o leitor de tela lê).
+        getByName("androidHostTest").dependencies {
+            implementation(libs.compose.uiTest)
+            implementation(libs.androidx.compose.uiTestManifest)
+            implementation(libs.robolectric)
+            implementation(libs.junit4)
+        }
     }
 }
```

- [ ] **Step 4: Ajustar `strings.xml`**

Em `feature/settings/presentation/src/commonMain/composeResources/values/strings.xml`, aplique (o diff mostra o arquivo antes e depois):

```diff
diff --git a/feature/settings/presentation/src/commonMain/composeResources/values/strings.xml b/feature/settings/presentation/src/commonMain/composeResources/values/strings.xml
index 1d1066e..d9c94d4 100644
--- a/feature/settings/presentation/src/commonMain/composeResources/values/strings.xml
+++ b/feature/settings/presentation/src/commonMain/composeResources/values/strings.xml
@@ -5,17 +5,18 @@
     <string name="theme_system">Sistema</string>
     <string name="theme_light">Claro</string>
     <string name="theme_dark">Escuro</string>
-    <string name="dynamic_colors">Cores dinâmicas</string>
-    <string name="dynamic_colors_body">Usa as cores do papel de parede (Android 12+)</string>
+    <string name="dynamic_colors">Cores do papel de parede</string>
+    <string name="dynamic_colors_body">Android 12 ou mais novo</string>
     <string name="section_playback">Reprodução</string>
-    <string name="autoplay">Tocar canto ao abrir ave</string>
-    <string name="autoplay_body">Começa a tocar assim que o detalhe abre</string>
+    <string name="autoplay">Tocar o canto ao abrir</string>
+    <string name="autoplay_body">Começa sozinho no Detalhe</string>
     <string name="section_data">Dados</string>
     <string name="storage">Dados e armazenamento</string>
-    <string name="storage_body">Limpar cache de imagens</string>
+    <string name="storage_row">Armazenamento</string>
+    <string name="storage_body">Limpar as imagens guardadas</string>
     <string name="section_about">Sobre</string>
     <string name="about_row">Sobre o Passarim</string>
-    <string name="about_row_body">Versão %1$s · créditos e licenças</string>
+    <string name="about_row_body">Versão %1$s, fontes e licenças</string>
     <string name="image_cache">Cache de imagens</string>
     <string name="image_cache_body">Libera espaço; as imagens são baixadas de novo quando você abrir a ave</string>
     <string name="clear_cache">Limpar cache</string>
```

- [ ] **Step 5: Implementar**

Substitua o conteúdo de `app/src/commonMain/kotlin/com/velosobr/passarim/app/tabs/TabsScreen.kt`:

```kotlin
// A tela das abas do adulto: o NavHost de cada aba e, flutuando por cima, a
// barra de navegação em pílula do PiuDS, que desfoca o conteúdo que passa por
// baixo dela (frente E). "by" lê o State como valor comum;
// currentBackStackEntryAsState recompõe a barra quando a aba muda.

package com.velosobr.passarim.app.tabs

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.velosobr.passarim.app.navigation.ExploreRoute
import com.velosobr.passarim.app.navigation.FavoritesRoute
import com.velosobr.passarim.app.navigation.SettingsRoute
import com.velosobr.passarim.feature.explore.presentation.ExploreRoot
import com.velosobr.passarim.feature.favorites.presentation.FavoritesRoot
import com.velosobr.passarim.feature.settings.presentation.SettingsRoot
import com.velosobr.piuds.components.PiuNavItem
import com.velosobr.piuds.components.adult.PiuFloatingNavBar
import com.velosobr.piuds.components.piuBlurSource
import com.velosobr.piuds.components.rememberPiuBlurState
import org.jetbrains.compose.resources.stringResource
import org.jetbrains.compose.resources.vectorResource

/** A altura da barra flutuante (68 dp) mais a margem dela até o fim da tela (24 dp). */
private val FloatingBarSpace = 92.dp

/**
 * As abas com um `NavHost` interno: cada aba tem a sua pilha, e trocar de aba guarda e restaura o
 * estado (`saveState`/`restoreState`). O conteúdo ocupa a tela inteira e é a fonte do desfoque; a
 * barra flutua por cima, acima da área do gesto de navegação do sistema (`navigationBars`). Cada
 * tela recebe o espaço da barra para o fim da lista não ficar escondido atrás dela.
 */
@Composable
fun TabsScreen(
    onOpenDetail: (id: String, autoPlay: Boolean) -> Unit,
    onOpenStorage: () -> Unit,
    onOpenAbout: () -> Unit,
) {
    val navController = rememberNavController()
    val backStack by navController.currentBackStackEntryAsState()
    val blur = rememberPiuBlurState()
    val systemBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val barPadding = PaddingValues(bottom = FloatingBarSpace + systemBottom)
    Box(Modifier.fillMaxSize()) {
        NavHost(
            navController,
            startDestination = ExploreRoute,
            modifier = Modifier.fillMaxSize().piuBlurSource(blur).statusBarsPadding(),
        ) {
            composable<ExploreRoute> {
                ExploreRoot(
                    onOpenDetail = onOpenDetail,
                    onOpenFavorites = { navController.navigateToTab(Tab.Favorites) },
                    contentPadding = barPadding,
                )
            }
            composable<FavoritesRoute> {
                FavoritesRoot(
                    onOpenDetail = { id -> onOpenDetail(id, false) },
                    onOpenExplore = { navController.navigateToTab(Tab.Explore) },
                    contentPadding = barPadding,
                )
            }
            composable<SettingsRoute> {
                SettingsRoot(onOpenStorage = onOpenStorage, onOpenAbout = onOpenAbout, contentPadding = barPadding)
            }
        }
        val tabs = Tab.entries
        PiuFloatingNavBar(
            items = tabs.map { PiuNavItem(vectorResource(it.icon), stringResource(it.label)) },
            selected = tabs.indexOfFirst { backStack?.destination?.hasRoute(it.route::class) == true }.coerceAtLeast(0),
            onSelect = { navController.navigateToTab(tabs[it]) },
            blurState = blur,
            modifier = Modifier.align(Alignment.BottomCenter).padding(start = 24.dp, end = 24.dp, bottom = 24.dp + systemBottom),
        )
    }
}

/** Troca de aba como a barra inferior faz: uma instância por aba, guardando o estado da que sai. */
private fun NavHostController.navigateToTab(tab: Tab) {
    navigate(tab.route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}
```

Crie `feature/settings/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/settings/presentation/SettingsCards.kt`:

```kotlin
// As peças da aba Configurações no visual da frente E3 (prancheta
// FavoritosConfiguracoes): cada seção é um título em verde e um cartão de
// cantos de 24 dp com as linhas dentro, separadas por um fio. O tema é um
// controle de botões segmentados. Ficam neste arquivo, e não no PiuDS, porque
// só esta tela os usa.

package com.velosobr.passarim.feature.settings.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.velosobr.piuds.theme.PiuDimens
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.vectorResource

/** O raio dos cartões das seções (prancheta: 24 dp). */
private val GroupShape = RoundedCornerShape(24.dp)

/**
 * A cor do cartão: branco no tema claro (surfaceContainerLowest), como na prancheta. No escuro, o
 * "lowest" é mais escuro que o fundo e o cartão sumiria, então usamos o surfaceContainer, um pouco
 * mais claro que o fundo. luminance() mede o brilho da cor de fundo (0 é preto, 1 é branco) e vale
 * também com as cores dinâmicas do papel de parede.
 */
@Composable
private fun groupColor(): Color {
    val scheme = MaterialTheme.colorScheme
    return if (scheme.background.luminance() > 0.5f) scheme.surfaceContainerLowest else scheme.surfaceContainer
}

/**
 * Uma seção: o título (verde, marcado como cabeçalho para o leitor de tela poder pular de seção em
 * seção) e o cartão com as linhas. ColumnScope no [content] deixa as linhas usarem os modificadores
 * de coluna; clip recorta o fundo das linhas (o realce do toque) nos cantos arredondados.
 */
@Composable
internal fun SettingsGroup(
    title: String,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(modifier.padding(horizontal = PiuDimens.screenMargin), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            title,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(horizontal = 4.dp).semantics { heading() },
        )
        Column(Modifier.fillMaxWidth().clip(GroupShape).background(groupColor()), content = content)
    }
}

/** O fio entre duas linhas do mesmo cartão. */
@Composable
internal fun GroupDivider() {
    HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
}

/** O ícone da linha num círculo de 36 dp com a cor de destaque suave do tema (secondaryContainer). */
@Composable
private fun RowIcon(icon: DrawableResource) {
    Box(Modifier.size(36.dp).background(MaterialTheme.colorScheme.secondaryContainer, CircleShape), contentAlignment = Alignment.Center) {
        Icon(
            vectorResource(icon),
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSecondaryContainer,
            modifier = Modifier.size(20.dp),
        )
    }
}

/** O título da linha e, se houver, o subtítulo embaixo, mais apagado. */
@Composable
private fun RowTexts(
    title: String,
    subtitle: String?,
    modifier: Modifier = Modifier,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
        if (subtitle != null) {
            Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/**
 * Uma linha do cartão: ícone, título, subtítulo e um slot à direita (a chave ou a seta). O
 * [modifier] recebe o toque (clickable, toggleable) e vale na linha toda; 56 dp de altura mínima
 * passa dos 48 dp de alvo de toque.
 */
@Composable
internal fun GroupRow(
    title: String,
    icon: DrawableResource,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    Row(
        modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        RowIcon(icon)
        RowTexts(title, subtitle, Modifier.weight(1f))
        trailing()
    }
}

/**
 * Uma linha com um controle que pode descer para baixo do título quando não cabe ao lado dele (o
 * tema com fonte grande). FlowRow é uma linha que "quebra": o que não cabe vai para a linha de
 * baixo, como palavras num parágrafo; SpaceBetween joga o controle para a direita quando cabe.
 */
@Composable
internal fun GroupFlowRow(
    title: String,
    icon: DrawableResource,
    control: @Composable () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        RowIcon(icon)
        FlowRow(
            Modifier.weight(1f),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalArrangement = Arrangement.spacedBy(8.dp),
            itemVerticalAlignment = Alignment.CenterVertically,
        ) {
            RowTexts(title, subtitle = null)
            control()
        }
    }
}

/** Uma opção de um controle segmentado: o rótulo e se está marcada. */
internal class Segment(
    val label: String,
    val selected: Boolean,
    val onClick: () -> Unit,
)

/**
 * Botões segmentados: as opções coladas num contorno de pílula, com a marcada pintada. [stacked]
 * põe uma embaixo da outra, na largura toda (fonte grande: empilhar, nunca cortar o texto).
 * selectableGroup junta as opções num grupo para o leitor de tela, e cada opção é selectable com
 * Role.RadioButton: ele anuncia "botão de opção, selecionado". Cada opção tem 48 dp de altura, o
 * alvo mínimo de toque.
 */
@Composable
internal fun SegmentedControl(
    segments: List<Segment>,
    stacked: Boolean,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(24.dp)
    val frame = modifier.selectableGroup().clip(shape).border(1.dp, MaterialTheme.colorScheme.outline, shape)
    if (stacked) {
        Column(frame.fillMaxWidth()) { segments.forEach { SegmentButton(it, Modifier.fillMaxWidth()) } }
    } else {
        Row(frame) { segments.forEach { SegmentButton(it) } }
    }
}

/** Uma opção do controle segmentado; a marcada ganha o fundo de destaque suave do tema. */
@Composable
private fun SegmentButton(
    segment: Segment,
    modifier: Modifier = Modifier,
) {
    val colors = MaterialTheme.colorScheme
    Box(
        modifier
            .heightIn(min = PiuDimens.touchTarget)
            .background(if (segment.selected) colors.secondaryContainer else Color.Transparent)
            .selectable(selected = segment.selected, onClick = segment.onClick, role = Role.RadioButton)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            segment.label,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            color = if (segment.selected) colors.onSecondaryContainer else colors.onSurface,
        )
    }
}
```

Substitua o conteúdo de `feature/settings/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/settings/presentation/SettingsComponents.kt`:

```kotlin
// Peças visuais compartilhadas pelas subtelas de Configurações (Dados e
// armazenamento, Sobre). A aba em si usa os cartões de SettingsCards.kt.

package com.velosobr.passarim.feature.settings.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.velosobr.piuds.resources.Res
import com.velosobr.piuds.resources.ic_chevron_right
import com.velosobr.piuds.theme.PiuDimens
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.vectorResource

/** Uma linha de configuração: ícone, título, subtítulo e um slot à direita (chave, seta). */
@Composable
internal fun SettingsRow(
    title: String,
    modifier: Modifier = Modifier,
    icon: DrawableResource? = null,
    subtitle: String? = null,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .padding(horizontal = PiuDimens.screenMargin, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Box(Modifier.size(40.dp), contentAlignment = Alignment.CenterStart) {
            if (icon != null) Icon(vectorResource(icon), contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface)
            if (subtitle != null) {
                Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        trailing()
    }
}

/** A seta "›" das linhas que abrem outra tela. */
@Composable
internal fun Chevron() {
    Icon(vectorResource(Res.drawable.ic_chevron_right), contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
}
```

Substitua o conteúdo de `feature/settings/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/settings/presentation/SettingsRoot.kt`:

```kotlin
// As ligações entre as telas de Configurações e os ViewModels.

package com.velosobr.passarim.feature.settings.presentation

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalUriHandler
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.velosobr.passarim.core.presentation.ObserveAsEvents
import org.koin.compose.viewmodel.koinViewModel

/**
 * A aba Configurações: liga a tela ao ViewModel e transforma os eventos em navegação.
 * [contentPadding] é o espaço da barra flutuante das abas, repassado à tela.
 */
@Composable
fun SettingsRoot(
    onOpenStorage: () -> Unit,
    onOpenAbout: () -> Unit,
    contentPadding: PaddingValues = PaddingValues(),
    viewModel: SettingsViewModel = koinViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    ObserveAsEvents(viewModel.events) { event ->
        when (event) {
            SettingsEvent.NavigateToStorage -> onOpenStorage()
            SettingsEvent.NavigateToAbout -> onOpenAbout()
        }
    }
    SettingsScreen(state = state, onAction = viewModel::onAction, contentPadding = contentPadding)
}

/** Dados e armazenamento. */
@Composable
fun StorageRoot(
    onBack: () -> Unit,
    viewModel: StorageViewModel = koinViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    ObserveAsEvents(viewModel.events) { event ->
        when (event) {
            StorageEvent.NavigateBack -> onBack()
        }
    }
    StorageScreen(state = state, onAction = viewModel::onAction)
}

/** Sobre: além de navegar, abre a política de privacidade no navegador. */
@Composable
fun AboutRoot(
    onBack: () -> Unit,
    onOpenLicenses: () -> Unit,
    viewModel: AboutViewModel = koinViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val uriHandler = LocalUriHandler.current
    ObserveAsEvents(viewModel.events) { event ->
        when (event) {
            AboutEvent.NavigateBack -> onBack()
            is AboutEvent.OpenUrl -> uriHandler.openUri(event.url)
            AboutEvent.NavigateToLicenses -> onOpenLicenses()
        }
    }
    AboutScreen(state = state, onAction = viewModel::onAction)
}
```

Substitua o conteúdo de `feature/settings/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/settings/presentation/SettingsScreen.kt`:

```kotlin
// A aba Configurações (frente E3): as seções Aparência, Reprodução, Dados e
// Sobre, cada uma num cartão de cantos arredondados (SettingsCards.kt). A seção
// "Para crianças" entra com a frente D.

package com.velosobr.passarim.feature.settings.presentation

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Switch
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.ThemeMode
import com.velosobr.passarim.feature.settings.presentation.resources.Res
import com.velosobr.passarim.feature.settings.presentation.resources.about_row
import com.velosobr.passarim.feature.settings.presentation.resources.about_row_body
import com.velosobr.passarim.feature.settings.presentation.resources.autoplay
import com.velosobr.passarim.feature.settings.presentation.resources.autoplay_body
import com.velosobr.passarim.feature.settings.presentation.resources.dynamic_colors
import com.velosobr.passarim.feature.settings.presentation.resources.dynamic_colors_body
import com.velosobr.passarim.feature.settings.presentation.resources.section_about
import com.velosobr.passarim.feature.settings.presentation.resources.section_appearance
import com.velosobr.passarim.feature.settings.presentation.resources.section_data
import com.velosobr.passarim.feature.settings.presentation.resources.section_playback
import com.velosobr.passarim.feature.settings.presentation.resources.settings_title
import com.velosobr.passarim.feature.settings.presentation.resources.storage_body
import com.velosobr.passarim.feature.settings.presentation.resources.storage_row
import com.velosobr.passarim.feature.settings.presentation.resources.theme
import com.velosobr.passarim.feature.settings.presentation.resources.theme_dark
import com.velosobr.passarim.feature.settings.presentation.resources.theme_light
import com.velosobr.passarim.feature.settings.presentation.resources.theme_system
import com.velosobr.piuds.components.PiuScreenTitle
import com.velosobr.piuds.components.adult.PIU_STACK_FONT_SCALE
import com.velosobr.piuds.resources.ic_info
import com.velosobr.piuds.resources.ic_palette
import com.velosobr.piuds.resources.ic_storage
import com.velosobr.piuds.resources.ic_theme
import com.velosobr.piuds.resources.ic_volume
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.stringResource
import com.velosobr.piuds.resources.Res as DesignRes

/** O rótulo traduzível de cada opção de tema. */
private val ThemeMode.label: StringResource
    get() =
        when (this) {
            ThemeMode.SYSTEM -> Res.string.theme_system
            ThemeMode.LIGHT -> Res.string.theme_light
            ThemeMode.DARK -> Res.string.theme_dark
        }

/**
 * A tela sem estado próprio: tudo vem de [state] e cada toque vira uma [SettingsAction]. A opção de
 * cores dinâmicas só aparece onde o sistema tem. [contentPadding] é o espaço da barra flutuante: a
 * tela rola por baixo dela e o último cartão termina acima dela.
 */
@Composable
fun SettingsScreen(
    state: SettingsState,
    onAction: (SettingsAction) -> Unit,
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(),
    scrollState: ScrollState = rememberScrollState(),
) {
    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(bottom = contentPadding.calculateBottomPadding() + 16.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        PiuScreenTitle(stringResource(Res.string.settings_title), Modifier.padding(bottom = 0.dp))
        SettingsGroup(stringResource(Res.string.section_appearance)) {
            GroupFlowRow(title = stringResource(Res.string.theme), icon = DesignRes.drawable.ic_theme) {
                ThemeSegments(state.settings.theme, onAction)
            }
            if (state.dynamicColorsSupported) {
                GroupDivider()
                SwitchRow(
                    title = stringResource(Res.string.dynamic_colors),
                    subtitle = stringResource(Res.string.dynamic_colors_body),
                    icon = DesignRes.drawable.ic_palette,
                    checked = state.settings.dynamicColors,
                    onCheckedChange = { onAction(SettingsAction.ChangeDynamicColors(it)) },
                )
            }
        }
        SettingsGroup(stringResource(Res.string.section_playback)) {
            SwitchRow(
                title = stringResource(Res.string.autoplay),
                subtitle = stringResource(Res.string.autoplay_body),
                icon = DesignRes.drawable.ic_volume,
                checked = state.settings.autoPlay,
                onCheckedChange = { onAction(SettingsAction.ChangeAutoPlay(it)) },
            )
        }
        SettingsGroup(stringResource(Res.string.section_data)) {
            GroupRow(
                title = stringResource(Res.string.storage_row),
                subtitle = stringResource(Res.string.storage_body),
                icon = DesignRes.drawable.ic_storage,
                modifier = Modifier.clickable { onAction(SettingsAction.OpenStorage) },
            ) { Chevron() }
        }
        SettingsGroup(stringResource(Res.string.section_about)) {
            GroupRow(
                title = stringResource(Res.string.about_row),
                subtitle = stringResource(Res.string.about_row_body, state.versionName),
                icon = DesignRes.drawable.ic_info,
                modifier = Modifier.clickable { onAction(SettingsAction.OpenAbout) },
            ) { Chevron() }
        }
    }
}

/**
 * O tema como botões segmentados (Sistema, Claro, Escuro). Com fonte a partir de 1.5×, as opções
 * ficam uma embaixo da outra (PIU_STACK_FONT_SCALE, a mesma regra que põe o mosaico em uma coluna).
 */
@Composable
private fun ThemeSegments(
    selected: ThemeMode,
    onAction: (SettingsAction) -> Unit,
) {
    SegmentedControl(
        segments =
            ThemeMode.entries.map { mode ->
                Segment(stringResource(mode.label), selected = mode == selected, onClick = { onAction(SettingsAction.SelectTheme(mode)) })
            },
        stacked = LocalDensity.current.fontScale >= PIU_STACK_FONT_SCALE,
    )
}

/** Uma linha com chave liga/desliga; o toque vale na linha toda (toggleable) e a chave só mostra o estado. */
@Composable
private fun SwitchRow(
    title: String,
    subtitle: String,
    icon: DrawableResource,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    GroupRow(
        title = title,
        subtitle = subtitle,
        icon = icon,
        modifier = Modifier.toggleable(value = checked, role = Role.Switch, onValueChange = onCheckedChange),
    ) {
        Switch(checked = checked, onCheckedChange = null)
    }
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `./gradlew :feature:settings:presentation:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 7: Snapshots**

Substitua o conteúdo de `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/SettingsSnapshotTest.kt`:

```kotlin
// Snapshots das telas de Configurações.

package com.velosobr.passarim.snapshots

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Settings
import com.velosobr.passarim.core.domain.ThemeMode
import com.velosobr.passarim.feature.settings.presentation.AboutScreen
import com.velosobr.passarim.feature.settings.presentation.AboutState
import com.velosobr.passarim.feature.settings.presentation.SettingsScreen
import com.velosobr.passarim.feature.settings.presentation.SettingsState
import com.velosobr.passarim.feature.settings.presentation.StorageScreen
import com.velosobr.passarim.feature.settings.presentation.StorageState
import org.junit.Test

/**
 * Configurações em várias combinações (com e sem cores dinâmicas, rolada até
 * o fim), Dados e armazenamento e Sobre. ScrollState(Int.MAX_VALUE) começa a
 * tela rolada até o fim. A aba Configurações recebe o espaço da barra
 * flutuante (92 dp), como no app: o fim rolado mostra o último cartão acima dela.
 */
class SettingsSnapshotTest(
    dark: Boolean,
    fontScalePercent: Int,
) : ThemedSnapshotTest(dark, fontScalePercent) {
    private fun settings(
        name: String,
        state: SettingsState,
        scrollToEnd: Boolean = false,
    ) = snap(name) {
        val scroll = ScrollState(if (scrollToEnd) Int.MAX_VALUE else 0)
        SettingsScreen(state = state, onAction = {}, contentPadding = PaddingValues(bottom = 92.dp), scrollState = scroll)
    }

    private val defaults = SettingsState(Settings(), dynamicColorsSupported = true, versionName = "1.0.0")

    @Test
    fun system() = settings("settings-system", defaults)

    @Test
    fun systemEnd() = settings("settings-system-end", defaults, scrollToEnd = true)

    @Test
    fun lightWithDynamicColors() =
        settings("settings-light-dynamic", defaults.copy(settings = Settings(theme = ThemeMode.LIGHT, dynamicColors = true)))

    @Test
    fun darkWithAutoPlay() = settings("settings-dark-autoplay", defaults.copy(settings = Settings(theme = ThemeMode.DARK, autoPlay = true)))

    @Test
    fun withoutDynamicColors() = settings("settings-ios", defaults.copy(dynamicColorsSupported = false))

    @Test
    fun storage() = snap("storage") { StorageScreen(state = StorageState.Idle, onAction = {}) }

    @Test
    fun storageCleared() = snap("storage-cleared") { StorageScreen(state = StorageState.Cleared, onAction = {}) }

    @Test
    fun about() = snap("about") { AboutScreen(state = AboutState("1.0.0"), onAction = {}) }

    @Test
    fun aboutEnd() = snap("about-end") { AboutScreen(state = AboutState("1.0.0"), onAction = {}, scrollState = ScrollState(Int.MAX_VALUE)) }
}
```

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*SettingsSnapshotTest*'`

Expected: 0 imagens novas e 30 regravadas em `snapshots/src/test/snapshots/images/`. Abra cada uma e confira a 1.0×, 1.3× e 2.0×, no claro e no escuro: nada cortado, nada quebrado no meio da palavra; os quatro cartões brancos no claro e um pouco mais claros que o fundo no escuro, o tema lado a lado a 1.0×, embaixo de "Tema" a 1.3× e empilhado a 2.0×; o fim rolado com o último cartão acima da barra.

- [ ] **Step 8: Conferir que a navegação só liga**

O bloco de rota do `NavHost` só pega o ViewModel, repassa callbacks e navega; nenhum efeito ali.

Run: `git diff feat/e1-explorar -- '*Navigator*.kt' '*NavHost*.kt' '*Graph*.kt' '*TabsScreen*.kt' | grep -E '^\+.*(LaunchedEffect|DisposableEffect|\.collect *[{(])'`

Expected: nenhuma linha.

- [ ] **Step 9: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:settings:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m 'feat: Configurações em grupos de cartões, com o tema em botões segmentados'
```

## Correções da revisão final

Depois da Task 4, um revisor independente (agente Opus) leu o branch inteiro. Cada achado Critical ou Important virou uma tarefa com o teste vermelho primeiro, num commit `fix:` no fim do branch (sem fixup nem autosquash). Os achados Minor estão no ledger, no fim deste plano.

### Task 5: Revisão I1: mosaico em xadrez como na prancheta, com a regra do PiuDS também no Explorar

A grade põe cada card na coluna mais curta. Com alto, baixo, baixo, alto, os dois altos caíam na coluna da esquerda e as colunas terminavam desencontradas (452 contra 348 dp). Com alto, baixo, alto, baixo, cada coluna tem um alto e um baixo e as duas terminam juntas, como na prancheta. A spec (seção 3) cita a outra sequência; vale a prancheta, que a seção 1 dá como critério de pronto. O Explorar passa a usar `piuMosaicHeightFor` e o `PiuFallbackBiome` do PiuDS, e a cópia dele sai (o teste da sequência fica só no PiuDS). A ordem das aves do snapshot dos Favoritos passa a ser a que dá o desenho da prancheta.

**Files:**
- Modify: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PiuMosaicLayout.kt`
- Test: `core/piu-ds/src/commonTest/kotlin/com/velosobr/piuds/components/adult/PiuMosaicLayoutTest.kt`
- Modify: `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreMosaic.kt`
- Modify: `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreScreen.kt`
- Test: `feature/explore/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreLayoutTest.kt`
- Test: `feature/favorites/presentation/src/androidHostTest/kotlin/com/velosobr/passarim/feature/favorites/presentation/FavoritesScreenTest.kt`
- Modify: `feature/favorites/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/favorites/presentation/FavoritesScreen.kt`
- Test: `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/FavoritesSnapshotTest.kt`
- Record: 22 imagens em `snapshots/src/test/snapshots/images/` (0 novas, 22 regravadas)

**Interfaces:**
- Muda: `piuMosaicHeightFor(index)` = `TALL` nos pares, `SHORT` nos ímpares.
- Produz: `val PiuFallbackBiome = Biome.PANTANAL` em `core:piu-ds`.
- Remove: `mosaicHeightFor` e os `FallbackBiome` privados do Explorar e dos Favoritos.

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `core/piu-ds/src/commonTest/kotlin/com/velosobr/piuds/components/adult/PiuMosaicLayoutTest.kt`:

```kotlin
// Testes das regras de layout do mosaico do PiuDS: quantas colunas para cada
// escala de fonte e a sequência de alturas que deixa as colunas desencontradas.
// São funções puras (sem Compose), então rodam como teste comum.

package com.velosobr.piuds.components.adult

import assertk.assertThat
import assertk.assertions.isEqualTo
import com.velosobr.piuds.components.adult.PiuMosaicHeight.SHORT
import com.velosobr.piuds.components.adult.PiuMosaicHeight.TALL
import kotlin.test.Test

class PiuMosaicLayoutTest {
    @Test
    fun `duas colunas ate fonte 1_3 e uma coluna a partir de 1_5`() {
        assertThat(piuMosaicColumns(1.0f)).isEqualTo(2)
        assertThat(piuMosaicColumns(1.3f)).isEqualTo(2)
        assertThat(piuMosaicColumns(PIU_STACK_FONT_SCALE)).isEqualTo(1)
        assertThat(piuMosaicColumns(2.0f)).isEqualTo(1)
    }

    @Test
    fun `as alturas alternam alto e baixo para as colunas ficarem desencontradas`() {
        // A grade põe cada card na coluna mais curta: alto (esquerda), baixo (direita), alto (direita,
        // que ficou mais curta), baixo (esquerda). Cada coluna fica com um alto e um baixo e as duas
        // terminam juntas, como na prancheta; FavoritesScreenTest confere isso na tela de verdade.
        val heights = (0 until 8).map { piuMosaicHeightFor(it) }
        assertThat(heights).isEqualTo(listOf(TALL, SHORT, TALL, SHORT, TALL, SHORT, TALL, SHORT))
    }
}
```

Substitua o conteúdo de `feature/explore/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreLayoutTest.kt`:

```kotlin
// Teste do número de colunas da grade por escala de fonte. A sequência de
// alturas do mosaico é do PiuDS e é testada lá (PiuMosaicLayoutTest).

package com.velosobr.passarim.feature.explore.presentation

import assertk.assertThat
import assertk.assertions.isEqualTo
import kotlin.test.Test

class ExploreLayoutTest {
    @Test
    fun `duas colunas ate fonte 1_3 e uma coluna a partir de 1_5`() {
        assertThat(exploreGridColumns(1.0f)).isEqualTo(2)
        assertThat(exploreGridColumns(1.3f)).isEqualTo(2)
        assertThat(exploreGridColumns(1.5f)).isEqualTo(1)
        assertThat(exploreGridColumns(2.0f)).isEqualTo(1)
    }
}
```

Substitua o conteúdo de `feature/favorites/presentation/src/androidHostTest/kotlin/com/velosobr/passarim/feature/favorites/presentation/FavoritesScreenTest.kt`:

```kotlin
// Testes da tela de Favoritos no mosaico (frente E3): o título e a contagem no
// singular e no plural, os toques no card e no coração, o título rolando junto
// com a grade, o xadrez de alturas do mosaico e o estado vazio. Rodam no Robolectric (um Android de mentira na
// JVM) com runComposeUiTest, que monta a tela e deixa consultar a semântica.

package com.velosobr.passarim.feature.favorites.presentation

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isNotDisplayed
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.containsExactlyInAnyOrder
import assertk.assertions.isEqualTo
import assertk.assertions.isTrue
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.domain.SpeciesSummary
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

private val arara = SpeciesSummary("anodorhynchus-hyacinthinus", "Arara-azul-grande", "Anodorhynchus hyacinthinus", null, Biome.PANTANAL)
private val carcara = SpeciesSummary("caracara-plancus", "Carcará", "Caracara plancus", null, Biome.CAATINGA)
private val tuiuiu = SpeciesSummary("jabiru-mycteria", "Tuiuiú", "Jabiru mycteria", null, Biome.PANTANAL)
private val seriema = SpeciesSummary("cariama-cristata", "Seriema", "Cariama cristata", null, Biome.CERRADO)

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class FavoritesScreenTest {
    /** O título é marcado como cabeçalho: o leitor de tela deixa pular direto para ele. */
    private val isHeading = SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading)

    @Test
    fun `titulo e cabecalho e a contagem fica no plural`() =
        runComposeUiTest {
            setContent { PiuTheme { FavoritesScreen(FavoritesState.Content(listOf(arara, carcara)), onAction = {}) } }
            onNodeWithText("Favoritos").assert(isHeading)
            onNodeWithText("2 aves guardadas").assertIsDisplayed()
        }

    @Test
    fun `com uma ave a contagem fica no singular`() =
        runComposeUiTest {
            setContent { PiuTheme { FavoritesScreen(FavoritesState.Content(listOf(arara)), onAction = {}) } }
            onNodeWithText("1 ave guardada").assertIsDisplayed()
        }

    @Test
    fun `tocar no card abre a ave e tocar no coracao desfavorita`() =
        runComposeUiTest {
            val actions = mutableListOf<FavoritesAction>()
            setContent { PiuTheme { FavoritesScreen(FavoritesState.Content(listOf(arara, carcara)), onAction = { actions += it }) } }
            onNodeWithText("Carcará").performClick()
            onNode(hasContentDescription("Desfavoritar Arara-azul-grande")).performClick()
            assertThat(actions).containsExactly(
                FavoritesAction.OpenDetail(carcara.id),
                FavoritesAction.ToggleFavorite(arara),
            )
        }

    @Test
    fun `o titulo rola junto com a grade`() =
        runComposeUiTest {
            val many = (1..16).map { SpeciesSummary("ave-$it", "Ave $it", "Avis $it", null, Biome.CERRADO) }
            setContent { PiuTheme { FavoritesScreen(FavoritesState.Content(many), onAction = {}) } }
            onNode(hasScrollAction()).performScrollToNode(hasText("Ave 16"))
            // Se o título ficasse fixo no topo, ele continuaria na tela depois de rolar até o fim.
            assertThat(onNodeWithText("Favoritos").isNotDisplayed()).isTrue()
        }

    /**
     * O xadrez da prancheta: com as quatro aves dela, cada coluna tem um card alto e um baixo, e as
     * duas terminam na mesma altura. A tela alta (qualifiers h900dp) deixa os quatro cards
     * compostos de uma vez; a grade só cria os que cabem na tela.
     */
    @Test
    @Config(qualifiers = "w393dp-h900dp")
    fun `cada coluna do mosaico tem um card alto e um baixo e as duas terminam juntas`() =
        runComposeUiTest {
            setContent { PiuTheme { FavoritesScreen(FavoritesState.Content(listOf(tuiuiu, carcara, seriema, arara)), onAction = {}) } }
            val bounds = listOf("Tuiuiú", "Carcará", "Seriema", "Arara-azul-grande").map { onNodeWithText(it).getBoundsInRoot() }
            // groupBy separa os cards pela borda esquerda: cada grupo é uma coluna.
            val columns = bounds.groupBy { it.left }.values.toList()
            assertThat(columns.size).isEqualTo(2)
            columns.forEach { column ->
                assertThat(column.map { it.height }).containsExactlyInAnyOrder(220.dp, 168.dp)
            }
            assertThat(columns[0].maxOf { it.bottom }).isEqualTo(columns[1].maxOf { it.bottom })
        }

    @Test
    fun `vazio convida a explorar`() =
        runComposeUiTest {
            val actions = mutableListOf<FavoritesAction>()
            setContent { PiuTheme { FavoritesScreen(FavoritesState.Empty, onAction = { actions += it }) } }
            onNodeWithText("Favoritos").assert(isHeading)
            onNodeWithText("Nenhum favorito ainda").assertIsDisplayed()
            onNodeWithText("Explorar aves").performClick()
            assertThat(actions).containsExactly(FavoritesAction.ExploreClick)
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew --continue :core:piu-ds:testAndroidHostTest :feature:favorites:presentation:testAndroidHostTest`

Expected: FAIL em `PiuMosaicLayoutTest > as alturas alternam alto e baixo...` (a lista ainda é alto, baixo, baixo, alto) e em `FavoritesScreenTest > cada coluna do mosaico tem um card alto e um baixo e as duas terminam juntas` (`expected to contain exactly in any order:<[220.0.dp, 168.0.dp]> but was:<[220.0.dp, 220.0.dp]>`).

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PiuMosaicLayout.kt`:

```kotlin
// As regras de layout do mosaico adulto (frente E), num lugar só para as telas
// que o usam (Explorar e Favoritos): quantas colunas, a altura de cada card e o
// bioma do gradiente quando a ave não tem um. São funções puras: recebem números
// e devolvem números, sem Compose, e por isso são testadas como qualquer função
// comum (PiuMosaicLayoutTest).

package com.velosobr.piuds.components.adult

import com.velosobr.passarim.core.domain.Biome

/**
 * A escala de fonte a partir da qual as telas adultas empilham o que ficaria
 * lado a lado (a grade vira uma coluna, as opções do tema vão uma embaixo da
 * outra). A regra é a da 5b: com fonte grande, empilhar, nunca cortar o texto.
 */
const val PIU_STACK_FONT_SCALE = 1.5f

/** Quantas colunas o mosaico tem para a escala de fonte do aparelho: 2, ou 1 com fonte grande. */
fun piuMosaicColumns(fontScale: Float): Int = if (fontScale >= PIU_STACK_FONT_SCALE) 1 else 2

/**
 * A altura do card na posição [index]: alto, baixo, alto, baixo, e repete.
 *
 * A grade (LazyVerticalStaggeredGrid) põe cada card na coluna mais curta naquele
 * momento, então a ordem dos cards não é "esquerda, direita, esquerda...":
 * - 0, alto: vai para a esquerda (as duas vazias, ganha a primeira);
 * - 1, baixo: vai para a direita, a vazia;
 * - 2, alto: vai para a direita de novo, que ficou mais curta (baixo < alto);
 * - 3, baixo: vai para a esquerda, que agora é a mais curta.
 *
 * Resultado: a esquerda fica alta-baixa, a direita baixa-alta, as linhas nunca
 * se alinham e as duas colunas terminam juntas a cada quatro cards, como na
 * prancheta. Por isso a sequência é esta e não "alto, baixo, baixo, alto", que
 * a spec da frente E cita: aquela deixaria os dois altos na mesma coluna.
 */
fun piuMosaicHeightFor(index: Int): PiuMosaicHeight = if (index % 2 == 0) PiuMosaicHeight.TALL else PiuMosaicHeight.SHORT

/** O gradiente de um card sem bioma principal (o catalog nem sempre traz esse dado): o do Pantanal. */
val PiuFallbackBiome = Biome.PANTANAL
```

Substitua o conteúdo de `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreMosaic.kt`:

```kotlin
// O mosaico do Explorar (frente E): a "Ave do dia" em largura total e os cards
// de espécie em colunas desencontradas, com o rodapé de "carregando mais".
// Separado da ExploreScreen para cada arquivo ter uma responsabilidade.

package com.velosobr.passarim.feature.explore.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.calculateEndPadding
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.staggeredgrid.LazyStaggeredGridState
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan
import androidx.compose.foundation.lazy.staggeredgrid.itemsIndexed
import androidx.compose.foundation.lazy.staggeredgrid.rememberLazyStaggeredGridState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.feature.explore.presentation.resources.Res
import com.velosobr.passarim.feature.explore.presentation.resources.featured_badge
import com.velosobr.passarim.feature.explore.presentation.resources.featured_badge_biome
import com.velosobr.passarim.feature.explore.presentation.resources.featured_play
import com.velosobr.passarim.feature.explore.presentation.resources.load_more_error
import com.velosobr.passarim.feature.explore.presentation.resources.retry
import com.velosobr.piuds.components.PiuSkeletonBox
import com.velosobr.piuds.components.adult.PiuFallbackBiome
import com.velosobr.piuds.components.adult.PiuFeaturedCard
import com.velosobr.piuds.components.adult.PiuMosaicCard
import com.velosobr.piuds.components.adult.PiuPlayAction
import com.velosobr.piuds.components.adult.piuMosaicHeightFor
import kotlinx.coroutines.flow.distinctUntilChanged
import org.jetbrains.compose.resources.stringResource

/**
 * O mosaico: a "Ave do dia" ocupando a largura toda e, embaixo, os cards em colunas desencontradas,
 * com o rodapé de "carregando mais" ou de erro. LazyVerticalStaggeredGrid é a grade em que cada item
 * tem a própria altura e entra na coluna mais curta; FullLine faz um item ocupar todas as colunas. A
 * altura de cada card e o bioma de quem não tem um vêm do PiuDS (piuMosaicHeightFor, PiuFallbackBiome),
 * as mesmas regras dos Favoritos.
 * snapshotFlow transforma a leitura do estado da grade num Flow, e rememberUpdatedState dá ao efeito
 * o total atual de itens sem reiniciá-lo.
 */
@Composable
internal fun SpeciesMosaic(
    state: ExploreState,
    columns: Int,
    onAction: (ExploreAction) -> Unit,
    contentPadding: PaddingValues,
    gridState: LazyStaggeredGridState = rememberLazyStaggeredGridState(),
) {
    // Pede a próxima página quando o último item visível chega perto do fim (a regra está em shouldLoadMore;
    // o ViewModel ignora pedidos repetidos, então emitir a mais é inofensivo).
    val currentOnAction by rememberUpdatedState(onAction)
    LaunchedEffect(gridState) {
        snapshotFlow {
            val info = gridState.layoutInfo
            (info.visibleItemsInfo.lastOrNull()?.index ?: -1) to info.totalItemsCount
        }.distinctUntilChanged()
            .collect { (last, count) -> if (shouldLoadMore(last, count)) currentOnAction(ExploreAction.LoadMore) }
    }
    LazyVerticalStaggeredGrid(
        columns = StaggeredGridCells.Fixed(columns),
        state = gridState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = contentPadding.plusMargins(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalItemSpacing = 12.dp,
    ) {
        val featured = state.featured
        if (state.showFeaturedSlot) {
            // A mesma chave "featured" para o esqueleto e para o card: a grade troca um pelo outro no lugar.
            item(key = "featured", span = StaggeredGridItemSpan.FullLine, contentType = "featured") {
                if (featured != null) {
                    FeaturedCard(featured.species, featured.hasSong, state, onAction)
                } else {
                    PiuSkeletonBox(Modifier.fillMaxWidth().height(196.dp), shape = RoundedCornerShape(28.dp))
                }
            }
        }
        itemsIndexed(state.items, key = { _, bird -> bird.id }, contentType = { _, _ -> "species" }) { index, bird ->
            PiuMosaicCard(
                name = bird.commonName,
                scientificName = bird.scientificName,
                imageUrl = bird.thumbnailUrl,
                biome = bird.primaryBiome ?: PiuFallbackBiome,
                isFavorite = bird.id in state.favoriteIds,
                onToggleFavorite = { onAction(ExploreAction.ToggleFavorite(bird)) },
                onClick = { onAction(ExploreAction.OpenDetail(bird.id)) },
                height = piuMosaicHeightFor(index),
            )
        }
        if (state.isLoadingMore || state.loadMoreError != null) {
            item(key = "footer", span = StaggeredGridItemSpan.FullLine, contentType = "footer") {
                LoadMoreFooter(isLoading = state.isLoadingMore, onRetry = { onAction(ExploreAction.RetryLoadMore) })
            }
        }
    }
}

/** O card da "Ave do dia", com o selo citando o bioma principal (quando os filtros já trazem o nome). */
@Composable
private fun FeaturedCard(
    bird: com.velosobr.passarim.core.domain.SpeciesSummary,
    hasSong: Boolean,
    state: ExploreState,
    onAction: (ExploreAction) -> Unit,
) {
    val biomeLabel =
        (state.filters as? FiltersPhase.Loaded)
            ?.filters
            ?.biomes
            ?.find { it.code == bird.primaryBiome?.code }
            ?.label
    PiuFeaturedCard(
        badge =
            if (biomeLabel != null) {
                stringResource(Res.string.featured_badge_biome, biomeLabel.uppercase())
            } else {
                stringResource(Res.string.featured_badge)
            },
        name = bird.commonName,
        scientificName = bird.scientificName,
        imageUrl = bird.thumbnailUrl,
        biome = bird.primaryBiome ?: PiuFallbackBiome,
        onClick = { onAction(ExploreAction.OpenFeatured) },
        play =
            if (hasSong) {
                PiuPlayAction(
                    description = stringResource(Res.string.featured_play, bird.commonName),
                    playing = false,
                    onClick = { onAction(ExploreAction.PlayFeatured) },
                )
            } else {
                null
            },
    )
}

/** As margens laterais da tela somadas ao espaço da barra flutuante embaixo. */
@Composable
private fun PaddingValues.plusMargins(): PaddingValues {
    val direction = LocalLayoutDirection.current
    return PaddingValues(
        start = calculateStartPadding(direction) + 16.dp,
        end = calculateEndPadding(direction) + 16.dp,
        bottom = calculateBottomPadding() + 16.dp,
    )
}

/** Fim da grade: carregando a próxima página, ou a linha de erro com "Tentar novamente". */
@Composable
private fun LoadMoreFooter(
    isLoading: Boolean,
    onRetry: () -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        if (isLoading) {
            CircularProgressIndicator()
        } else {
            Text(
                stringResource(Res.string.load_more_error),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            TextButton(onClick = onRetry) { Text(stringResource(Res.string.retry)) }
        }
    }
}
```

Substitua o conteúdo de `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreScreen.kt`:

```kotlin
// A tela Explorar (frente E): título com o total de aves, busca, chips de
// bioma, a "Ave do dia" e o mosaico de espécies, mais os estados de
// carregando, vazio e erro. Os componentes visuais vêm do PiuDS.

package com.velosobr.passarim.feature.explore.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.biomeOf
import com.velosobr.passarim.core.presentation.ScreenError
import com.velosobr.passarim.feature.explore.presentation.resources.Res
import com.velosobr.passarim.feature.explore.presentation.resources.chip_all
import com.velosobr.passarim.feature.explore.presentation.resources.clear_filters
import com.velosobr.passarim.feature.explore.presentation.resources.empty_body_filters
import com.velosobr.passarim.feature.explore.presentation.resources.empty_body_query
import com.velosobr.passarim.feature.explore.presentation.resources.empty_title
import com.velosobr.passarim.feature.explore.presentation.resources.error_generic_body
import com.velosobr.passarim.feature.explore.presentation.resources.error_generic_title
import com.velosobr.passarim.feature.explore.presentation.resources.error_no_connection_body
import com.velosobr.passarim.feature.explore.presentation.resources.error_no_connection_title
import com.velosobr.passarim.feature.explore.presentation.resources.error_rate_limited_body
import com.velosobr.passarim.feature.explore.presentation.resources.error_rate_limited_title
import com.velosobr.passarim.feature.explore.presentation.resources.error_server_body
import com.velosobr.passarim.feature.explore.presentation.resources.error_server_title
import com.velosobr.passarim.feature.explore.presentation.resources.explore_title
import com.velosobr.passarim.feature.explore.presentation.resources.filter_state
import com.velosobr.passarim.feature.explore.presentation.resources.retry
import com.velosobr.passarim.feature.explore.presentation.resources.search_placeholder
import com.velosobr.passarim.feature.explore.presentation.resources.see_favorites
import com.velosobr.passarim.feature.explore.presentation.resources.species_count
import com.velosobr.piuds.components.PiuFilterChip
import com.velosobr.piuds.components.PiuScreenTitle
import com.velosobr.piuds.components.PiuSearchField
import com.velosobr.piuds.components.PiuSkeletonBox
import com.velosobr.piuds.components.PiuStateScreen
import com.velosobr.piuds.components.StateTone
import com.velosobr.piuds.components.adult.PiuBiomeChip
import com.velosobr.piuds.components.adult.PiuMosaicHeight
import com.velosobr.piuds.components.adult.piuMosaicHeightFor
import com.velosobr.piuds.resources.ic_cloud_off
import com.velosobr.piuds.resources.ic_search
import com.velosobr.piuds.resources.ic_wifi_off
import com.velosobr.piuds.theme.PiuDimens
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.painterResource
import org.jetbrains.compose.resources.stringResource
import com.velosobr.piuds.resources.Res as DesignRes

/** A partir desta escala de fonte, a grade passa a 1 coluna: empilhar, nunca cortar o texto. */
const val SINGLE_COLUMN_FONT_SCALE = 1.5f

/** Quantas colunas a grade tem para a escala de fonte do aparelho. */
fun exploreGridColumns(fontScale: Float): Int = if (fontScale >= SINGLE_COLUMN_FONT_SCALE) 1 else 2

/**
 * Explorar, sem estado próprio: tudo vem de [state] e cada interação vira uma [ExploreAction].
 * O título, a busca e os chips ficam visíveis em todas as fases, para que digitar nunca seja
 * interrompido. [contentPadding] é o espaço que a barra flutuante ocupa embaixo: a grade rola por
 * baixo dela (o desfoque precisa do conteúdo atrás) e termina acima dela.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExploreScreen(
    state: ExploreState,
    onAction: (ExploreAction) -> Unit,
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(),
) {
    val columns = exploreGridColumns(LocalDensity.current.fontScale)
    Column(modifier.fillMaxSize()) {
        Header(state)
        PiuSearchField(
            value = state.query,
            onValueChange = { onAction(ExploreAction.QueryChange(it)) },
            placeholder = stringResource(Res.string.search_placeholder),
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        )
        BiomeChips(state, onAction)
        when (val phase = state.phase) {
            ExplorePhase.Loading -> SkeletonGrid(columns)
            ExplorePhase.Content -> SpeciesMosaic(state, columns, onAction, contentPadding)
            ExplorePhase.Empty -> CenteredState(contentPadding) { EmptyState(state, onAction) }
            is ExplorePhase.Error -> CenteredState(contentPadding) { ErrorState(phase.error, state.retryEnabled, onAction) }
        }
    }
    if (state.sheet != null) {
        ModalBottomSheet(
            onDismissRequest = { onAction(ExploreAction.DismissFilters) },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = MaterialTheme.colorScheme.surfaceContainer,
        ) {
            FiltersSheet(sheet = state.sheet, filters = state.filters, onAction = onAction)
        }
    }
}

/** O título da tela e, quando os filtros já chegaram, o total de aves do catálogo. */
@Composable
private fun Header(state: ExploreState) {
    Column(Modifier.padding(bottom = 8.dp)) {
        PiuScreenTitle(stringResource(Res.string.explore_title), Modifier.padding(bottom = 0.dp))
        state.speciesTotal?.let { total ->
            Text(
                stringResource(Res.string.species_count, total),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = PiuDimens.screenMargin),
            )
        }
    }
}

/**
 * A linha de chips, que rola na horizontal: "Todos", um chip com o gradiente de cada bioma (o toque
 * aplica o filtro direto) e, no fim, o chip de UF, que abre o sheet como antes. LazyRow só cria os
 * chips visíveis, como a grade faz com os cards.
 */
@Composable
private fun BiomeChips(
    state: ExploreState,
    onAction: (ExploreAction) -> Unit,
) {
    val biomes = (state.filters as? FiltersPhase.Loaded)?.filters?.biomes.orEmpty()
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item(key = "all") {
            PiuFilterChip(
                stringResource(Res.string.chip_all),
                selected = state.biome == null,
                onClick = { onAction(ExploreAction.SelectBiome(null)) },
            )
        }
        // Um bioma que o app não conhece (novo no BFF) fica de fora: sem ele não há gradiente.
        items(biomes.mapNotNull { f -> biomeOf(f.code)?.let { it to f } }, key = { it.second.code }) { (biome, filter) ->
            PiuBiomeChip(
                biome = biome,
                label = filter.label,
                selected = state.biome == filter.code,
                onClick = { onAction(ExploreAction.SelectBiome(filter.code)) },
            )
        }
        item(key = "uf") {
            val uf = state.state
            if (uf == null) {
                PiuFilterChip(
                    stringResource(Res.string.filter_state),
                    selected = false,
                    onClick = { onAction(ExploreAction.OpenFilters) },
                    showDropdown = true,
                )
            } else {
                PiuFilterChip(
                    uf,
                    selected = true,
                    onClick = { onAction(ExploreAction.OpenFilters) },
                    onClear = { onAction(ExploreAction.ClearState) },
                )
            }
        }
    }
}

/** O "esqueleto" do carregamento: quatro blocos cinzas no desenho do mosaico, sem rolagem. */
@Composable
private fun SkeletonGrid(columns: Int) {
    LazyVerticalStaggeredGrid(
        columns = StaggeredGridCells.Fixed(columns),
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalItemSpacing = 12.dp,
        userScrollEnabled = false,
    ) {
        items(4) { index ->
            PiuSkeletonBox(
                Modifier.fillMaxWidth().height(
                    piuMosaicHeightFor(index).let {
                        if (it ==
                            PiuMosaicHeight.TALL
                        ) {
                            220.dp
                        } else {
                            168.dp
                        }
                    },
                ),
                shape = MaterialTheme.shapes.large,
            )
        }
    }
}

/** Nenhuma ave encontrada: o texto cita a busca (se houver) e oferece limpar os filtros. */
@Composable
private fun EmptyState(
    state: ExploreState,
    onAction: (ExploreAction) -> Unit,
) {
    val query = state.query.trim()
    run {
        PiuStateScreen(
            icon = painterResource(DesignRes.drawable.ic_search),
            title = stringResource(Res.string.empty_title),
            body =
                if (query.isNotEmpty()) {
                    stringResource(Res.string.empty_body_query, query)
                } else {
                    stringResource(Res.string.empty_body_filters)
                },
        ) {
            if (state.hasFilters) {
                FilledTonalButton(
                    onClick = { onAction(ExploreAction.ClearFilters) },
                    modifier = Modifier.height(PiuDimens.touchTarget),
                ) {
                    Text(stringResource(Res.string.clear_filters))
                }
            }
        }
    }
}

/** Ícone, título e texto de cada tela de erro. */
private class ErrorCopy(
    val icon: DrawableResource,
    val title: StringResource,
    val body: StringResource,
)

/** Escolhe os textos e o ícone de cada tipo de erro. */
private fun ScreenError.copy(): ErrorCopy =
    when (this) {
        ScreenError.NoConnection ->
            ErrorCopy(DesignRes.drawable.ic_wifi_off, Res.string.error_no_connection_title, Res.string.error_no_connection_body)
        ScreenError.ServiceUnavailable ->
            ErrorCopy(DesignRes.drawable.ic_cloud_off, Res.string.error_server_title, Res.string.error_server_body)
        is ScreenError.RateLimited ->
            ErrorCopy(DesignRes.drawable.ic_cloud_off, Res.string.error_rate_limited_title, Res.string.error_rate_limited_body)
        ScreenError.Generic ->
            ErrorCopy(DesignRes.drawable.ic_cloud_off, Res.string.error_generic_title, Res.string.error_generic_body)
    }

/**
 * Tela de erro com "Tentar novamente" (desligado durante o Retry-After) e,
 * sem conexão, o atalho para os favoritos, que funcionam offline.
 */
@Composable
private fun ErrorState(
    error: ScreenError,
    retryEnabled: Boolean,
    onAction: (ExploreAction) -> Unit,
) {
    val copy = error.copy()
    run {
        PiuStateScreen(
            icon = painterResource(copy.icon),
            title = stringResource(copy.title),
            body = stringResource(copy.body),
            tone = StateTone.Error,
        ) {
            Button(
                onClick = { onAction(ExploreAction.Retry) },
                enabled = retryEnabled,
                modifier = Modifier.height(PiuDimens.touchTarget),
            ) { Text(stringResource(Res.string.retry)) }
            if (error == ScreenError.NoConnection) {
                TextButton(onClick = { onAction(ExploreAction.OpenFavorites) }, modifier = Modifier.height(PiuDimens.touchTarget)) {
                    Text(stringResource(Res.string.see_favorites))
                }
            }
        }
    }
}

/**
 * Centraliza o estado no espaço que sobra (acima da barra flutuante) e rola se a fonte grande não
 * couber na tela.
 */
@Composable
private fun CenteredState(
    contentPadding: PaddingValues,
    content: @Composable () -> Unit,
) {
    Box(Modifier.fillMaxSize().padding(bottom = contentPadding.calculateBottomPadding()), contentAlignment = Alignment.Center) {
        Box(Modifier.verticalScroll(rememberScrollState()).padding(vertical = 24.dp)) { content() }
    }
}
```

Substitua o conteúdo de `feature/favorites/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/favorites/presentation/FavoritesScreen.kt`:

```kotlin
// A tela da aba Favoritos (frente E3): o mesmo mosaico do Explorar, com o
// título e a contagem de aves guardadas rolando junto com os cards, ou o
// estado vazio. Os cards (PiuMosaicCard) e as regras de colunas e alturas
// vêm do PiuDS; o FavoritesRoot liga esta tela ao ViewModel.

package com.velosobr.passarim.feature.favorites.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.staggeredgrid.LazyStaggeredGridState
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan
import androidx.compose.foundation.lazy.staggeredgrid.itemsIndexed
import androidx.compose.foundation.lazy.staggeredgrid.rememberLazyStaggeredGridState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.feature.favorites.presentation.resources.Res
import com.velosobr.passarim.feature.favorites.presentation.resources.empty_body
import com.velosobr.passarim.feature.favorites.presentation.resources.empty_title
import com.velosobr.passarim.feature.favorites.presentation.resources.explore_birds
import com.velosobr.passarim.feature.favorites.presentation.resources.favorites_count
import com.velosobr.passarim.feature.favorites.presentation.resources.favorites_title
import com.velosobr.piuds.components.PiuStateScreen
import com.velosobr.piuds.components.adult.PiuFallbackBiome
import com.velosobr.piuds.components.adult.PiuMosaicCard
import com.velosobr.piuds.components.adult.piuMosaicColumns
import com.velosobr.piuds.components.adult.piuMosaicHeightFor
import com.velosobr.piuds.resources.ic_favorites
import com.velosobr.piuds.theme.PiuDimens
import org.jetbrains.compose.resources.painterResource
import org.jetbrains.compose.resources.pluralStringResource
import org.jetbrains.compose.resources.stringResource
import com.velosobr.piuds.resources.Res as DesignRes

/**
 * A tela sem estado próprio: tudo vem de [state] e cada toque vira uma [FavoritesAction]. Enquanto o
 * banco não responde, mostra só o título. [contentPadding] é o espaço da barra flutuante embaixo: a
 * grade rola por baixo dela (o desfoque precisa do conteúdo atrás) e termina acima dela.
 */
@Composable
fun FavoritesScreen(
    state: FavoritesState,
    onAction: (FavoritesAction) -> Unit,
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(),
    gridState: LazyStaggeredGridState = rememberLazyStaggeredGridState(),
) {
    when (state) {
        FavoritesState.Loading -> FavoritesHeader(count = null, modifier.padding(horizontal = PiuDimens.screenMargin))
        FavoritesState.Empty -> EmptyFavorites(onAction, contentPadding, modifier)
        is FavoritesState.Content -> FavoritesMosaic(state, onAction, contentPadding, gridState, modifier)
    }
}

/**
 * O título "Favoritos" (marcado como cabeçalho para o leitor de tela) e, com aves, a contagem
 * ("4 aves guardadas"). pluralStringResource escolhe a frase no singular ou no plural pela regra
 * do idioma do aparelho. As margens laterais ficam com quem chama: na grade, elas já vêm do
 * contentPadding dela.
 */
@Composable
private fun FavoritesHeader(
    count: Int?,
    modifier: Modifier = Modifier,
) {
    Column(modifier.padding(top = 24.dp, bottom = 2.dp)) {
        Text(
            stringResource(Res.string.favorites_title),
            style = MaterialTheme.typography.headlineLarge,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.semantics { heading() },
        )
        if (count != null) {
            Text(
                pluralStringResource(Res.plurals.favorites_count, count, count),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * O mosaico: o cabeçalho ocupando a largura toda (FullLine) como primeiro item da grade, para rolar
 * junto com os cards, e as aves em colunas desencontradas. LazyVerticalStaggeredGrid é a grade em que
 * cada item tem a própria altura e entra na coluna mais curta; ela só cria os cards visíveis. Com
 * fonte grande, a grade vira uma coluna (piuMosaicColumns). animateItem anima a saída do card
 * desfavoritado e o deslizar dos outros.
 */
@Composable
private fun FavoritesMosaic(
    state: FavoritesState.Content,
    onAction: (FavoritesAction) -> Unit,
    contentPadding: PaddingValues,
    gridState: LazyStaggeredGridState,
    modifier: Modifier,
) {
    LazyVerticalStaggeredGrid(
        columns = StaggeredGridCells.Fixed(piuMosaicColumns(LocalDensity.current.fontScale)),
        state = gridState,
        modifier = modifier.fillMaxSize(),
        contentPadding =
            PaddingValues(
                start = PiuDimens.screenMargin,
                end = PiuDimens.screenMargin,
                bottom = contentPadding.calculateBottomPadding() + 16.dp,
            ),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalItemSpacing = 12.dp,
    ) {
        item(key = "header", span = StaggeredGridItemSpan.FullLine, contentType = "header") {
            FavoritesHeader(count = state.count)
        }
        itemsIndexed(state.items, key = { _, bird -> bird.id }, contentType = { _, _ -> "species" }) { index, bird ->
            PiuMosaicCard(
                name = bird.commonName,
                scientificName = bird.scientificName,
                imageUrl = bird.thumbnailUrl,
                biome = bird.primaryBiome ?: PiuFallbackBiome,
                isFavorite = true,
                onToggleFavorite = { onAction(FavoritesAction.ToggleFavorite(bird)) },
                onClick = { onAction(FavoritesAction.OpenDetail(bird.id)) },
                height = piuMosaicHeightFor(index),
                modifier = Modifier.animateItem(),
            )
        }
    }
}

/**
 * Nenhum favorito: o convite para explorar, centralizado no espaço acima da barra flutuante.
 * BoxWithConstraints dá a altura disponível (maxHeight), usada para centralizar o conteúdo e ainda
 * permitir rolagem com fonte grande.
 */
@Composable
private fun EmptyFavorites(
    onAction: (FavoritesAction) -> Unit,
    contentPadding: PaddingValues,
    modifier: Modifier,
) {
    Column(modifier.fillMaxSize().padding(bottom = contentPadding.calculateBottomPadding())) {
        FavoritesHeader(count = null, Modifier.padding(horizontal = PiuDimens.screenMargin))
        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
            PiuStateScreen(
                icon = painterResource(DesignRes.drawable.ic_favorites),
                title = stringResource(Res.string.empty_title),
                body = stringResource(Res.string.empty_body),
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .heightIn(min = maxHeight)
                        .padding(vertical = 24.dp),
            ) {
                Button(onClick = { onAction(FavoritesAction.ExploreClick) }) {
                    Text(stringResource(Res.string.explore_birds))
                }
            }
        }
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest :feature:favorites:presentation:testAndroidHostTest :feature:explore:presentation:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Snapshots**

Substitua o conteúdo de `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/FavoritesSnapshotTest.kt`:

```kotlin
// Snapshots da aba Favoritos.

package com.velosobr.passarim.snapshots

import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.domain.SpeciesSummary
import com.velosobr.passarim.feature.favorites.presentation.FavoritesScreen
import com.velosobr.passarim.feature.favorites.presentation.FavoritesState
import org.junit.Test

/**
 * O mosaico com as quatro aves da prancheta e o estado vazio. A 2.0× a grade fica em 1 coluna. A
 * ordem da lista é a que dá o desenho da prancheta: a grade põe cada card na coluna mais curta, então
 * a terceira ave (alta) vai para a direita, embaixo do Carcará, e a quarta (baixa) para a esquerda.
 */
class FavoritesSnapshotTest(
    dark: Boolean,
    fontScalePercent: Int,
) : ThemedSnapshotTest(dark, fontScalePercent) {
    private val birds =
        listOf(
            SpeciesSummary("jabiru-mycteria", "Tuiuiú", "Jabiru mycteria", null, Biome.PANTANAL),
            SpeciesSummary("caracara-plancus", "Carcará", "Caracara plancus", null, Biome.CAATINGA),
            SpeciesSummary("anodorhynchus-hyacinthinus", "Arara-azul-grande", "Anodorhynchus hyacinthinus", null, Biome.PANTANAL),
            SpeciesSummary("cariama-cristata", "Seriema", "Cariama cristata", null, Biome.CERRADO),
        )

    @Test
    fun list() = snap("favorites") { FavoritesScreen(state = FavoritesState.Content(birds), onAction = {}) }

    @Test
    fun empty() = snap("favorites-empty") { FavoritesScreen(state = FavoritesState.Empty, onAction = {}) }
}
```

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*ExploreSnapshotTest*' --tests '*FavoritesSnapshotTest*'`

Expected: 0 imagens novas e 22 regravadas em `snapshots/src/test/snapshots/images/`. Abra cada uma e confira a 1.0×, 1.3× e 2.0×, no claro e no escuro: nada cortado, nada quebrado no meio da palavra; nos Favoritos, Tuiuiú e Seriema à esquerda, Carcará e Arara-azul-grande à direita, e as duas colunas terminando juntas; no Explorar, o mesmo xadrez embaixo da "Ave do dia".

- [ ] **Step 6: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:piu-ds:testAndroidHostTest :feature:favorites:presentation:testAndroidHostTest :feature:explore:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m 'fix: mosaico em xadrez como na prancheta, com a regra de alturas do PiuDS também no Explorar'
```

### Task 6: Revisão I2: o tema empilha quando não cabe lado a lado

A decisão de empilhar o tema olhava só a escala de fonte. Num aparelho de 360 dp com fonte 1.3×, ou de 320 dp com 1.0×, as três opções não cabem, e a `Row` dava ao "Escuro" só o que sobrava: a palavra quebrava em duas linhas. O `SegmentedControl` vira um `Layout` que soma a `maxIntrinsicWidth` das opções e empilha quando a soma passa da largura disponível; a partir de 1.5× continua sempre empilhado (`alwaysStacked`). Os testes medem o texto com a fonte de verdade (`@GraphicsMode(NATIVE)`): no modo padrão do Robolectric, cada letra mede quase nada e tudo caberia. Um snapshot novo no Nexus 5 (360 dp) deixa o caso à vista.

**Files:**
- Test: `feature/settings/presentation/src/androidHostTest/kotlin/com/velosobr/passarim/feature/settings/presentation/SettingsScreenTest.kt`
- Modify: `feature/settings/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/settings/presentation/SettingsCards.kt`
- Modify: `feature/settings/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/settings/presentation/SettingsScreen.kt`
- Create (test): `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/SettingsNarrowSnapshotTest.kt`
- Record: 6 imagens em `snapshots/src/test/snapshots/images/` (6 novas, 0 regravadas)

**Interfaces:**
- Muda: `SegmentedControl(segments: List<Segment>, alwaysStacked: Boolean, modifier)` (antes `stacked`).

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `feature/settings/presentation/src/androidHostTest/kotlin/com/velosobr/passarim/feature/settings/presentation/SettingsScreenTest.kt`:

```kotlin
// Testes da aba Configurações em grupos de cartões (frente E3): as seções como
// cabeçalhos, o tema como botões segmentados que o leitor de tela anuncia como
// opções marcáveis e empilhados quando não cabem na largura, as chaves e as
// linhas que abrem outra tela. Rodam no
// Robolectric com runComposeUiTest (veja FavoritesScreenTest).

package com.velosobr.passarim.feature.settings.presentation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ComposeUiTest
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import assertk.assertions.isLessThanOrEqualTo
import com.velosobr.passarim.core.domain.Settings
import com.velosobr.passarim.core.domain.ThemeMode
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class SettingsScreenTest {
    private val isHeading = SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading)

    /** Confere o papel que o leitor de tela anuncia ("botão de opção", "chave"). */
    private fun hasRole(role: Role) = SemanticsMatcher.expectValue(SemanticsProperties.Role, role)

    private val state =
        SettingsState(
            Settings(theme = ThemeMode.LIGHT, dynamicColors = false, autoPlay = true),
            dynamicColorsSupported = true,
            versionName = "1.0.0",
        )

    @Test
    fun `as quatro secoes sao cabecalhos e nao ha a secao para criancas`() =
        runComposeUiTest {
            setContent { PiuTheme { SettingsScreen(state, onAction = {}) } }
            listOf("Configurações", "Aparência", "Reprodução", "Dados", "Sobre").forEach { title ->
                onNode(hasText(title) and isHeading).performScrollTo()
            }
            onNodeWithText("Para crianças").assertDoesNotExist()
        }

    @Test
    fun `o tema e um grupo de botoes segmentados com a opcao atual marcada`() =
        runComposeUiTest {
            val actions = mutableListOf<SettingsAction>()
            setContent { PiuTheme { SettingsScreen(state, onAction = { actions += it }) } }
            onNodeWithText("Claro").assert(hasRole(Role.RadioButton)).assertIsSelected().assertHeightIsAtLeast(48.dp)
            onNodeWithText("Sistema").assertIsNotSelected()
            onNodeWithText("Escuro").assert(hasRole(Role.RadioButton)).assertIsNotSelected().performClick()
            assertThat(actions).containsExactly(SettingsAction.SelectTheme(ThemeMode.DARK))
            // Segmentados: as três opções lado a lado, na mesma linha.
            val tops = listOf("Sistema", "Claro", "Escuro").map { onNodeWithText(it).getBoundsInRoot().top }
            assertThat(tops.distinct()).hasSize(1)
        }

    @Test
    fun `com fonte grande as opcoes do tema ficam uma embaixo da outra`() =
        runComposeUiTest {
            setContent {
                // Density com fontScale 2: o mesmo que a pessoa aumentar a fonte do aparelho para 200%.
                val density = LocalDensity.current
                CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale = 2f)) {
                    PiuTheme { SettingsScreen(state, onAction = {}) }
                }
            }
            val tops = listOf("Sistema", "Claro", "Escuro").map { onNodeWithText(it).getBoundsInRoot().top }
            assertThat(tops).isEqualTo(tops.sorted())
            assertThat(tops.distinct()).hasSize(3)
        }

    /**
     * Num aparelho estreito, o controle do tema não pode cortar nem quebrar um rótulo: ou as três
     * opções cabem lado a lado, ou ficam uma embaixo da outra. As três com a mesma altura provam que
     * nenhum rótulo quebrou em duas linhas, e o "Escuro" terminando dentro do cartão (tela menos a
     * margem de 16 dp e o padding da linha de 16 dp) prova que nada passou da borda. GraphicsMode
     * NATIVE faz o Robolectric medir o texto com a fonte de verdade; no modo padrão dele, cada letra
     * mede quase nada e o texto sempre caberia.
     */
    private fun ComposeUiTest.assertThemeFits(
        screenWidth: Dp,
        fontScale: Float,
    ) {
        setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale = fontScale)) {
                PiuTheme { Box(Modifier.width(screenWidth)) { SettingsScreen(state, onAction = {}) } }
            }
        }
        val bounds = listOf("Sistema", "Claro", "Escuro").map { onNodeWithText(it).getBoundsInRoot() }
        assertThat(bounds.map { it.height }.distinct()).hasSize(1)
        assertThat(bounds.last().right).isLessThanOrEqualTo(screenWidth - 32.dp)
    }

    @Test
    @Config(qualifiers = "w400dp-h900dp")
    @GraphicsMode(GraphicsMode.Mode.NATIVE)
    fun `o tema cabe num aparelho de 360 dp com fonte 1_3`() = runComposeUiTest { assertThemeFits(360.dp, 1.3f) }

    @Test
    @Config(qualifiers = "w400dp-h900dp")
    @GraphicsMode(GraphicsMode.Mode.NATIVE)
    fun `o tema cabe num aparelho de 320 dp com fonte 1_0`() = runComposeUiTest { assertThemeFits(320.dp, 1.0f) }

    @Test
    fun `as chaves de cores e de reproducao mudam a preferencia`() =
        runComposeUiTest {
            val actions = mutableListOf<SettingsAction>()
            setContent { PiuTheme { SettingsScreen(state, onAction = { actions += it }) } }
            onNodeWithText("Cores do papel de parede").assertIsOff().performClick()
            onNodeWithText("Tocar o canto ao abrir")
                .performScrollTo()
                .assert(hasRole(Role.Switch))
                .assertIsOn()
                .performClick()
            assertThat(actions).containsExactly(SettingsAction.ChangeDynamicColors(true), SettingsAction.ChangeAutoPlay(false))
        }

    @Test
    fun `sem cores dinamicas no sistema a chave nao aparece`() =
        runComposeUiTest {
            setContent { PiuTheme { SettingsScreen(state.copy(dynamicColorsSupported = false), onAction = {}) } }
            onNodeWithText("Cores do papel de parede").assertDoesNotExist()
        }

    @Test
    fun `armazenamento e sobre abrem as subtelas`() =
        runComposeUiTest {
            val actions = mutableListOf<SettingsAction>()
            setContent { PiuTheme { SettingsScreen(state, onAction = { actions += it }) } }
            onNodeWithText("Armazenamento").performScrollTo().performClick()
            onNodeWithText("Versão 1.0.0, fontes e licenças").performScrollTo()
            onNodeWithText("Sobre o Passarim").performClick()
            assertThat(actions).containsExactly(SettingsAction.OpenStorage, SettingsAction.OpenAbout)
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:settings:presentation:testAndroidHostTest`

Expected: FAIL em `o tema cabe num aparelho de 360 dp com fonte 1_3` (`expected [size]:<[1]> but was:<[2]> ([48.0.dp, 69.0.dp])`) e em `o tema cabe num aparelho de 320 dp com fonte 1_0` (`([48.0.dp, 55.0.dp])`): o "Escuro" quebrou em duas linhas.

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `feature/settings/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/settings/presentation/SettingsCards.kt`:

```kotlin
// As peças da aba Configurações no visual da frente E3 (prancheta
// FavoritosConfiguracoes): cada seção é um título em verde e um cartão de
// cantos de 24 dp com as linhas dentro, separadas por um fio. O tema é um
// controle de botões segmentados. Ficam neste arquivo, e não no PiuDS, porque
// só esta tela os usa.

package com.velosobr.passarim.feature.settings.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.constrainHeight
import androidx.compose.ui.unit.constrainWidth
import androidx.compose.ui.unit.dp
import com.velosobr.piuds.theme.PiuDimens
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.vectorResource

/** O raio dos cartões das seções (prancheta: 24 dp). */
private val GroupShape = RoundedCornerShape(24.dp)

/**
 * A cor do cartão: branco no tema claro (surfaceContainerLowest), como na prancheta. No escuro, o
 * "lowest" é mais escuro que o fundo e o cartão sumiria, então usamos o surfaceContainer, um pouco
 * mais claro que o fundo. luminance() mede o brilho da cor de fundo (0 é preto, 1 é branco) e vale
 * também com as cores dinâmicas do papel de parede.
 */
@Composable
private fun groupColor(): Color {
    val scheme = MaterialTheme.colorScheme
    return if (scheme.background.luminance() > 0.5f) scheme.surfaceContainerLowest else scheme.surfaceContainer
}

/**
 * Uma seção: o título (verde, marcado como cabeçalho para o leitor de tela poder pular de seção em
 * seção) e o cartão com as linhas. ColumnScope no [content] deixa as linhas usarem os modificadores
 * de coluna; clip recorta o fundo das linhas (o realce do toque) nos cantos arredondados.
 */
@Composable
internal fun SettingsGroup(
    title: String,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(modifier.padding(horizontal = PiuDimens.screenMargin), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            title,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(horizontal = 4.dp).semantics { heading() },
        )
        Column(Modifier.fillMaxWidth().clip(GroupShape).background(groupColor()), content = content)
    }
}

/** O fio entre duas linhas do mesmo cartão. */
@Composable
internal fun GroupDivider() {
    HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
}

/** O ícone da linha num círculo de 36 dp com a cor de destaque suave do tema (secondaryContainer). */
@Composable
private fun RowIcon(icon: DrawableResource) {
    Box(Modifier.size(36.dp).background(MaterialTheme.colorScheme.secondaryContainer, CircleShape), contentAlignment = Alignment.Center) {
        Icon(
            vectorResource(icon),
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSecondaryContainer,
            modifier = Modifier.size(20.dp),
        )
    }
}

/** O título da linha e, se houver, o subtítulo embaixo, mais apagado. */
@Composable
private fun RowTexts(
    title: String,
    subtitle: String?,
    modifier: Modifier = Modifier,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
        if (subtitle != null) {
            Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/**
 * Uma linha do cartão: ícone, título, subtítulo e um slot à direita (a chave ou a seta). O
 * [modifier] recebe o toque (clickable, toggleable) e vale na linha toda; 56 dp de altura mínima
 * passa dos 48 dp de alvo de toque.
 */
@Composable
internal fun GroupRow(
    title: String,
    icon: DrawableResource,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    Row(
        modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        RowIcon(icon)
        RowTexts(title, subtitle, Modifier.weight(1f))
        trailing()
    }
}

/**
 * Uma linha com um controle que pode descer para baixo do título quando não cabe ao lado dele (o
 * tema com fonte grande). FlowRow é uma linha que "quebra": o que não cabe vai para a linha de
 * baixo, como palavras num parágrafo; SpaceBetween joga o controle para a direita quando cabe.
 */
@Composable
internal fun GroupFlowRow(
    title: String,
    icon: DrawableResource,
    control: @Composable () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        RowIcon(icon)
        FlowRow(
            Modifier.weight(1f),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalArrangement = Arrangement.spacedBy(8.dp),
            itemVerticalAlignment = Alignment.CenterVertically,
        ) {
            RowTexts(title, subtitle = null)
            control()
        }
    }
}

/** Uma opção de um controle segmentado: o rótulo e se está marcada. */
internal class Segment(
    val label: String,
    val selected: Boolean,
    val onClick: () -> Unit,
)

/**
 * Botões segmentados: as opções coladas num contorno de pílula, com a marcada pintada. Ficam lado a
 * lado só se couberem inteiras na largura disponível; senão, uma embaixo da outra, na largura toda
 * (empilhar, nunca cortar o texto). [alwaysStacked] empilha mesmo quando caberia (fonte grande).
 * selectableGroup junta as opções num grupo para o leitor de tela, e cada opção é selectable com
 * Role.RadioButton: ele anuncia "botão de opção, selecionado". Cada opção tem 48 dp de altura, o
 * alvo mínimo de toque.
 *
 * A decisão é por medida, não pela escala de fonte: num aparelho estreito o controle pode não caber
 * nem com fonte 1.0×, e uma Row comum daria ao último botão só o que sobrou, quebrando "Escuro" no
 * meio. Layout é o jeito de medir e posicionar os filhos à mão: maxIntrinsicWidth pergunta a cada
 * opção "quanto você mede sem quebrar linha?" antes de medir de verdade, e a soma decide o arranjo.
 */
@Composable
internal fun SegmentedControl(
    segments: List<Segment>,
    alwaysStacked: Boolean,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(24.dp)
    Layout(
        content = { segments.forEach { SegmentButton(it) } },
        modifier = modifier.selectableGroup().clip(shape).border(1.dp, MaterialTheme.colorScheme.outline, shape),
    ) { measurables, constraints ->
        val widths = measurables.map { it.maxIntrinsicWidth(Constraints.Infinity) }
        val sideBySide = !alwaysStacked && widths.sum() <= constraints.maxWidth
        if (sideBySide) {
            // Lado a lado: cada opção na largura do próprio rótulo e todas na altura da mais alta.
            val height = measurables.zip(widths).maxOf { (measurable, width) -> measurable.maxIntrinsicHeight(width) }
            val placeables = measurables.zip(widths).map { (measurable, width) -> measurable.measure(Constraints.fixed(width, height)) }
            layout(constraints.constrainWidth(widths.sum()), constraints.constrainHeight(height)) {
                var x = 0
                placeables.forEach { placeable ->
                    placeable.placeRelative(x, 0)
                    x += placeable.width
                }
            }
        } else {
            // Empilhadas: todas na largura toda (ou na da opção mais larga, se a largura não tiver limite).
            val width = if (constraints.hasBoundedWidth) constraints.maxWidth else widths.max()
            val placeables = measurables.map { it.measure(Constraints(minWidth = width, maxWidth = width)) }
            layout(width, constraints.constrainHeight(placeables.sumOf { it.height })) {
                var y = 0
                placeables.forEach { placeable ->
                    placeable.placeRelative(0, y)
                    y += placeable.height
                }
            }
        }
    }
}

/** Uma opção do controle segmentado; a marcada ganha o fundo de destaque suave do tema. */
@Composable
private fun SegmentButton(
    segment: Segment,
    modifier: Modifier = Modifier,
) {
    val colors = MaterialTheme.colorScheme
    Box(
        modifier
            .heightIn(min = PiuDimens.touchTarget)
            .background(if (segment.selected) colors.secondaryContainer else Color.Transparent)
            .selectable(selected = segment.selected, onClick = segment.onClick, role = Role.RadioButton)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            segment.label,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            color = if (segment.selected) colors.onSecondaryContainer else colors.onSurface,
        )
    }
}
```

Substitua o conteúdo de `feature/settings/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/settings/presentation/SettingsScreen.kt`:

```kotlin
// A aba Configurações (frente E3): as seções Aparência, Reprodução, Dados e
// Sobre, cada uma num cartão de cantos arredondados (SettingsCards.kt). A seção
// "Para crianças" entra com a frente D.

package com.velosobr.passarim.feature.settings.presentation

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Switch
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.ThemeMode
import com.velosobr.passarim.feature.settings.presentation.resources.Res
import com.velosobr.passarim.feature.settings.presentation.resources.about_row
import com.velosobr.passarim.feature.settings.presentation.resources.about_row_body
import com.velosobr.passarim.feature.settings.presentation.resources.autoplay
import com.velosobr.passarim.feature.settings.presentation.resources.autoplay_body
import com.velosobr.passarim.feature.settings.presentation.resources.dynamic_colors
import com.velosobr.passarim.feature.settings.presentation.resources.dynamic_colors_body
import com.velosobr.passarim.feature.settings.presentation.resources.section_about
import com.velosobr.passarim.feature.settings.presentation.resources.section_appearance
import com.velosobr.passarim.feature.settings.presentation.resources.section_data
import com.velosobr.passarim.feature.settings.presentation.resources.section_playback
import com.velosobr.passarim.feature.settings.presentation.resources.settings_title
import com.velosobr.passarim.feature.settings.presentation.resources.storage_body
import com.velosobr.passarim.feature.settings.presentation.resources.storage_row
import com.velosobr.passarim.feature.settings.presentation.resources.theme
import com.velosobr.passarim.feature.settings.presentation.resources.theme_dark
import com.velosobr.passarim.feature.settings.presentation.resources.theme_light
import com.velosobr.passarim.feature.settings.presentation.resources.theme_system
import com.velosobr.piuds.components.PiuScreenTitle
import com.velosobr.piuds.components.adult.PIU_STACK_FONT_SCALE
import com.velosobr.piuds.resources.ic_info
import com.velosobr.piuds.resources.ic_palette
import com.velosobr.piuds.resources.ic_storage
import com.velosobr.piuds.resources.ic_theme
import com.velosobr.piuds.resources.ic_volume
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.stringResource
import com.velosobr.piuds.resources.Res as DesignRes

/** O rótulo traduzível de cada opção de tema. */
private val ThemeMode.label: StringResource
    get() =
        when (this) {
            ThemeMode.SYSTEM -> Res.string.theme_system
            ThemeMode.LIGHT -> Res.string.theme_light
            ThemeMode.DARK -> Res.string.theme_dark
        }

/**
 * A tela sem estado próprio: tudo vem de [state] e cada toque vira uma [SettingsAction]. A opção de
 * cores dinâmicas só aparece onde o sistema tem. [contentPadding] é o espaço da barra flutuante: a
 * tela rola por baixo dela e o último cartão termina acima dela.
 */
@Composable
fun SettingsScreen(
    state: SettingsState,
    onAction: (SettingsAction) -> Unit,
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(),
    scrollState: ScrollState = rememberScrollState(),
) {
    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(bottom = contentPadding.calculateBottomPadding() + 16.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        PiuScreenTitle(stringResource(Res.string.settings_title), Modifier.padding(bottom = 0.dp))
        SettingsGroup(stringResource(Res.string.section_appearance)) {
            GroupFlowRow(title = stringResource(Res.string.theme), icon = DesignRes.drawable.ic_theme) {
                ThemeSegments(state.settings.theme, onAction)
            }
            if (state.dynamicColorsSupported) {
                GroupDivider()
                SwitchRow(
                    title = stringResource(Res.string.dynamic_colors),
                    subtitle = stringResource(Res.string.dynamic_colors_body),
                    icon = DesignRes.drawable.ic_palette,
                    checked = state.settings.dynamicColors,
                    onCheckedChange = { onAction(SettingsAction.ChangeDynamicColors(it)) },
                )
            }
        }
        SettingsGroup(stringResource(Res.string.section_playback)) {
            SwitchRow(
                title = stringResource(Res.string.autoplay),
                subtitle = stringResource(Res.string.autoplay_body),
                icon = DesignRes.drawable.ic_volume,
                checked = state.settings.autoPlay,
                onCheckedChange = { onAction(SettingsAction.ChangeAutoPlay(it)) },
            )
        }
        SettingsGroup(stringResource(Res.string.section_data)) {
            GroupRow(
                title = stringResource(Res.string.storage_row),
                subtitle = stringResource(Res.string.storage_body),
                icon = DesignRes.drawable.ic_storage,
                modifier = Modifier.clickable { onAction(SettingsAction.OpenStorage) },
            ) { Chevron() }
        }
        SettingsGroup(stringResource(Res.string.section_about)) {
            GroupRow(
                title = stringResource(Res.string.about_row),
                subtitle = stringResource(Res.string.about_row_body, state.versionName),
                icon = DesignRes.drawable.ic_info,
                modifier = Modifier.clickable { onAction(SettingsAction.OpenAbout) },
            ) { Chevron() }
        }
    }
}

/**
 * O tema como botões segmentados (Sistema, Claro, Escuro). As opções ficam uma embaixo da outra
 * quando não cabem lado a lado (o SegmentedControl mede) e, com fonte a partir de 1.5×, sempre
 * (PIU_STACK_FONT_SCALE, a mesma regra que põe o mosaico em uma coluna).
 */
@Composable
private fun ThemeSegments(
    selected: ThemeMode,
    onAction: (SettingsAction) -> Unit,
) {
    SegmentedControl(
        segments =
            ThemeMode.entries.map { mode ->
                Segment(stringResource(mode.label), selected = mode == selected, onClick = { onAction(SettingsAction.SelectTheme(mode)) })
            },
        alwaysStacked = LocalDensity.current.fontScale >= PIU_STACK_FONT_SCALE,
    )
}

/** Uma linha com chave liga/desliga; o toque vale na linha toda (toggleable) e a chave só mostra o estado. */
@Composable
private fun SwitchRow(
    title: String,
    subtitle: String,
    icon: DrawableResource,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    GroupRow(
        title = title,
        subtitle = subtitle,
        icon = icon,
        modifier = Modifier.toggleable(value = checked, role = Role.Switch, onValueChange = onCheckedChange),
    ) {
        Switch(checked = checked, onCheckedChange = null)
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :feature:settings:presentation:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Snapshots**

Crie `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/SettingsNarrowSnapshotTest.kt`:

```kotlin
// Snapshots da aba Configurações num aparelho estreito (360 dp de largura).

package com.velosobr.passarim.snapshots

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.ui.unit.dp
import app.cash.paparazzi.DeviceConfig
import com.velosobr.passarim.core.domain.Settings
import com.velosobr.passarim.feature.settings.presentation.SettingsScreen
import com.velosobr.passarim.feature.settings.presentation.SettingsState
import org.junit.Test

/**
 * A aba Configurações no Nexus 5 (360 dp), mais estreito que o Pixel 5 (393 dp) dos outros
 * snapshots. Mostra o controle do tema empilhado quando as três opções não cabem lado a lado
 * (a 1.3×, por exemplo), em vez de cortar ou quebrar o "Escuro".
 */
class SettingsNarrowSnapshotTest(
    dark: Boolean,
    fontScalePercent: Int,
) : ThemedSnapshotTest(dark, fontScalePercent, DeviceConfig.NEXUS_5) {
    @Test
    fun system() =
        snap("settings-narrow") {
            SettingsScreen(
                state = SettingsState(Settings(), dynamicColorsSupported = true, versionName = "1.0.0"),
                onAction = {},
                contentPadding = PaddingValues(bottom = 92.dp),
            )
        }
}
```

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*SettingsNarrowSnapshotTest*'`

Expected: 6 imagens novas e 0 regravadas em `snapshots/src/test/snapshots/images/`. Abra cada uma e confira a 1.0×, 1.3× e 2.0×, no claro e no escuro: nada cortado, nada quebrado no meio da palavra; a 1.3× no Nexus 5, as três opções uma embaixo da outra na largura do cartão, sem palavra quebrada.

- [ ] **Step 6: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:settings:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m 'fix: tema das Configurações empilhado quando não cabe lado a lado, medindo em vez de olhar só a fonte'
```

### Task 7: Revisão M1, M7 e M9: título a 18 dp, linhas com papel de botão e comentários da grade

Três Minor baratos da revisão. (M1) O `PiuScreenTitle` põe 8 dp embaixo por dentro, e o `padding(bottom = 0.dp)` não os tirava: o vão até "Aparência" era 26 dp, e a prancheta tem 18. O título vira um `Text` no mesmo estilo, sem o espaço de baixo. (M7) As linhas de Armazenamento e Sobre ganham `Role.Button`, e o leitor de tela passa a anunciá-las como botão. (M9) A grade dos Favoritos explica `key` e `contentType`.

**Files:**
- Modify: `feature/favorites/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/favorites/presentation/FavoritesScreen.kt`
- Test: `feature/settings/presentation/src/androidHostTest/kotlin/com/velosobr/passarim/feature/settings/presentation/SettingsScreenTest.kt`
- Modify: `feature/settings/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/settings/presentation/SettingsScreen.kt`
- Record: 34 imagens em `snapshots/src/test/snapshots/images/` (0 novas, 34 regravadas)

**Interfaces:**
- Sem mudança de assinatura.

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `feature/settings/presentation/src/androidHostTest/kotlin/com/velosobr/passarim/feature/settings/presentation/SettingsScreenTest.kt`:

```kotlin
// Testes da aba Configurações em grupos de cartões (frente E3): as seções como
// cabeçalhos, o tema como botões segmentados que o leitor de tela anuncia como
// opções marcáveis e empilhados quando não cabem na largura, as chaves e as
// linhas que abrem outra tela. Rodam no
// Robolectric com runComposeUiTest (veja FavoritesScreenTest).

package com.velosobr.passarim.feature.settings.presentation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ComposeUiTest
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import assertk.assertions.isLessThanOrEqualTo
import com.velosobr.passarim.core.domain.Settings
import com.velosobr.passarim.core.domain.ThemeMode
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class SettingsScreenTest {
    private val isHeading = SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading)

    /** Confere o papel que o leitor de tela anuncia ("botão de opção", "chave"). */
    private fun hasRole(role: Role) = SemanticsMatcher.expectValue(SemanticsProperties.Role, role)

    private val state =
        SettingsState(
            Settings(theme = ThemeMode.LIGHT, dynamicColors = false, autoPlay = true),
            dynamicColorsSupported = true,
            versionName = "1.0.0",
        )

    @Test
    fun `as quatro secoes sao cabecalhos e nao ha a secao para criancas`() =
        runComposeUiTest {
            setContent { PiuTheme { SettingsScreen(state, onAction = {}) } }
            listOf("Configurações", "Aparência", "Reprodução", "Dados", "Sobre").forEach { title ->
                onNode(hasText(title) and isHeading).performScrollTo()
            }
            onNodeWithText("Para crianças").assertDoesNotExist()
        }

    /** Prancheta: 18 dp entre o título da tela e o título da primeira seção. */
    @Test
    fun `o titulo fica a 18 dp da primeira secao`() =
        runComposeUiTest {
            setContent { PiuTheme { SettingsScreen(state, onAction = {}) } }
            val title = onNode(hasText("Configurações") and isHeading).getBoundsInRoot()
            val firstSection = onNode(hasText("Aparência") and isHeading).getBoundsInRoot()
            assertThat(firstSection.top - title.bottom).isEqualTo(18.dp)
        }

    @Test
    fun `o tema e um grupo de botoes segmentados com a opcao atual marcada`() =
        runComposeUiTest {
            val actions = mutableListOf<SettingsAction>()
            setContent { PiuTheme { SettingsScreen(state, onAction = { actions += it }) } }
            onNodeWithText("Claro").assert(hasRole(Role.RadioButton)).assertIsSelected().assertHeightIsAtLeast(48.dp)
            onNodeWithText("Sistema").assertIsNotSelected()
            onNodeWithText("Escuro").assert(hasRole(Role.RadioButton)).assertIsNotSelected().performClick()
            assertThat(actions).containsExactly(SettingsAction.SelectTheme(ThemeMode.DARK))
            // Segmentados: as três opções lado a lado, na mesma linha.
            val tops = listOf("Sistema", "Claro", "Escuro").map { onNodeWithText(it).getBoundsInRoot().top }
            assertThat(tops.distinct()).hasSize(1)
        }

    @Test
    fun `com fonte grande as opcoes do tema ficam uma embaixo da outra`() =
        runComposeUiTest {
            setContent {
                // Density com fontScale 2: o mesmo que a pessoa aumentar a fonte do aparelho para 200%.
                val density = LocalDensity.current
                CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale = 2f)) {
                    PiuTheme { SettingsScreen(state, onAction = {}) }
                }
            }
            val tops = listOf("Sistema", "Claro", "Escuro").map { onNodeWithText(it).getBoundsInRoot().top }
            assertThat(tops).isEqualTo(tops.sorted())
            assertThat(tops.distinct()).hasSize(3)
        }

    /**
     * Num aparelho estreito, o controle do tema não pode cortar nem quebrar um rótulo: ou as três
     * opções cabem lado a lado, ou ficam uma embaixo da outra. As três com a mesma altura provam que
     * nenhum rótulo quebrou em duas linhas, e o "Escuro" terminando dentro do cartão (tela menos a
     * margem de 16 dp e o padding da linha de 16 dp) prova que nada passou da borda. GraphicsMode
     * NATIVE faz o Robolectric medir o texto com a fonte de verdade; no modo padrão dele, cada letra
     * mede quase nada e o texto sempre caberia.
     */
    private fun ComposeUiTest.assertThemeFits(
        screenWidth: Dp,
        fontScale: Float,
    ) {
        setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale = fontScale)) {
                PiuTheme { Box(Modifier.width(screenWidth)) { SettingsScreen(state, onAction = {}) } }
            }
        }
        val bounds = listOf("Sistema", "Claro", "Escuro").map { onNodeWithText(it).getBoundsInRoot() }
        assertThat(bounds.map { it.height }.distinct()).hasSize(1)
        assertThat(bounds.last().right).isLessThanOrEqualTo(screenWidth - 32.dp)
    }

    @Test
    @Config(qualifiers = "w400dp-h900dp")
    @GraphicsMode(GraphicsMode.Mode.NATIVE)
    fun `o tema cabe num aparelho de 360 dp com fonte 1_3`() = runComposeUiTest { assertThemeFits(360.dp, 1.3f) }

    @Test
    @Config(qualifiers = "w400dp-h900dp")
    @GraphicsMode(GraphicsMode.Mode.NATIVE)
    fun `o tema cabe num aparelho de 320 dp com fonte 1_0`() = runComposeUiTest { assertThemeFits(320.dp, 1.0f) }

    @Test
    fun `as chaves de cores e de reproducao mudam a preferencia`() =
        runComposeUiTest {
            val actions = mutableListOf<SettingsAction>()
            setContent { PiuTheme { SettingsScreen(state, onAction = { actions += it }) } }
            onNodeWithText("Cores do papel de parede").assertIsOff().performClick()
            onNodeWithText("Tocar o canto ao abrir")
                .performScrollTo()
                .assert(hasRole(Role.Switch))
                .assertIsOn()
                .performClick()
            assertThat(actions).containsExactly(SettingsAction.ChangeDynamicColors(true), SettingsAction.ChangeAutoPlay(false))
        }

    @Test
    fun `sem cores dinamicas no sistema a chave nao aparece`() =
        runComposeUiTest {
            setContent { PiuTheme { SettingsScreen(state.copy(dynamicColorsSupported = false), onAction = {}) } }
            onNodeWithText("Cores do papel de parede").assertDoesNotExist()
        }

    @Test
    fun `armazenamento e sobre abrem as subtelas`() =
        runComposeUiTest {
            val actions = mutableListOf<SettingsAction>()
            setContent { PiuTheme { SettingsScreen(state, onAction = { actions += it }) } }
            // Role.Button: o leitor de tela anuncia a linha como botão.
            onNodeWithText("Armazenamento").performScrollTo().assert(hasRole(Role.Button)).performClick()
            onNodeWithText("Versão 1.0.0, fontes e licenças").performScrollTo()
            onNodeWithText("Sobre o Passarim").assert(hasRole(Role.Button)).performClick()
            assertThat(actions).containsExactly(SettingsAction.OpenStorage, SettingsAction.OpenAbout)
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:settings:presentation:testAndroidHostTest`

Expected: FAIL em `o titulo fica a 18 dp da primeira secao` (`expected:<[18].0.dp> but was:<[26].0.dp>`) e em `armazenamento e sobre abrem as subtelas` (`Failed to assert the following: (Role = 'Button')`).

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `feature/favorites/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/favorites/presentation/FavoritesScreen.kt`:

```kotlin
// A tela da aba Favoritos (frente E3): o mesmo mosaico do Explorar, com o
// título e a contagem de aves guardadas rolando junto com os cards, ou o
// estado vazio. Os cards (PiuMosaicCard) e as regras de colunas e alturas
// vêm do PiuDS; o FavoritesRoot liga esta tela ao ViewModel.

package com.velosobr.passarim.feature.favorites.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.staggeredgrid.LazyStaggeredGridState
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan
import androidx.compose.foundation.lazy.staggeredgrid.itemsIndexed
import androidx.compose.foundation.lazy.staggeredgrid.rememberLazyStaggeredGridState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.feature.favorites.presentation.resources.Res
import com.velosobr.passarim.feature.favorites.presentation.resources.empty_body
import com.velosobr.passarim.feature.favorites.presentation.resources.empty_title
import com.velosobr.passarim.feature.favorites.presentation.resources.explore_birds
import com.velosobr.passarim.feature.favorites.presentation.resources.favorites_count
import com.velosobr.passarim.feature.favorites.presentation.resources.favorites_title
import com.velosobr.piuds.components.PiuStateScreen
import com.velosobr.piuds.components.adult.PiuFallbackBiome
import com.velosobr.piuds.components.adult.PiuMosaicCard
import com.velosobr.piuds.components.adult.piuMosaicColumns
import com.velosobr.piuds.components.adult.piuMosaicHeightFor
import com.velosobr.piuds.resources.ic_favorites
import com.velosobr.piuds.theme.PiuDimens
import org.jetbrains.compose.resources.painterResource
import org.jetbrains.compose.resources.pluralStringResource
import org.jetbrains.compose.resources.stringResource
import com.velosobr.piuds.resources.Res as DesignRes

/**
 * A tela sem estado próprio: tudo vem de [state] e cada toque vira uma [FavoritesAction]. Enquanto o
 * banco não responde, mostra só o título. [contentPadding] é o espaço da barra flutuante embaixo: a
 * grade rola por baixo dela (o desfoque precisa do conteúdo atrás) e termina acima dela.
 */
@Composable
fun FavoritesScreen(
    state: FavoritesState,
    onAction: (FavoritesAction) -> Unit,
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(),
    gridState: LazyStaggeredGridState = rememberLazyStaggeredGridState(),
) {
    when (state) {
        FavoritesState.Loading -> FavoritesHeader(count = null, modifier.padding(horizontal = PiuDimens.screenMargin))
        FavoritesState.Empty -> EmptyFavorites(onAction, contentPadding, modifier)
        is FavoritesState.Content -> FavoritesMosaic(state, onAction, contentPadding, gridState, modifier)
    }
}

/**
 * O título "Favoritos" (marcado como cabeçalho para o leitor de tela) e, com aves, a contagem
 * ("4 aves guardadas"). pluralStringResource escolhe a frase no singular ou no plural pela regra
 * do idioma do aparelho. As margens laterais ficam com quem chama: na grade, elas já vêm do
 * contentPadding dela.
 */
@Composable
private fun FavoritesHeader(
    count: Int?,
    modifier: Modifier = Modifier,
) {
    Column(modifier.padding(top = 24.dp, bottom = 2.dp)) {
        Text(
            stringResource(Res.string.favorites_title),
            style = MaterialTheme.typography.headlineLarge,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.semantics { heading() },
        )
        if (count != null) {
            Text(
                pluralStringResource(Res.plurals.favorites_count, count, count),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * O mosaico: o cabeçalho ocupando a largura toda (FullLine) como primeiro item da grade, para rolar
 * junto com os cards, e as aves em colunas desencontradas. LazyVerticalStaggeredGrid é a grade em que
 * cada item tem a própria altura e entra na coluna mais curta; ela só cria os cards visíveis. Com
 * fonte grande, a grade vira uma coluna (piuMosaicColumns). animateItem anima a saída do card
 * desfavoritado e o deslizar dos outros.
 */
@Composable
private fun FavoritesMosaic(
    state: FavoritesState.Content,
    onAction: (FavoritesAction) -> Unit,
    contentPadding: PaddingValues,
    gridState: LazyStaggeredGridState,
    modifier: Modifier,
) {
    LazyVerticalStaggeredGrid(
        columns = StaggeredGridCells.Fixed(piuMosaicColumns(LocalDensity.current.fontScale)),
        state = gridState,
        modifier = modifier.fillMaxSize(),
        contentPadding =
            PaddingValues(
                start = PiuDimens.screenMargin,
                end = PiuDimens.screenMargin,
                bottom = contentPadding.calculateBottomPadding() + 16.dp,
            ),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalItemSpacing = 12.dp,
    ) {
        item(key = "header", span = StaggeredGridItemSpan.FullLine, contentType = "header") {
            FavoritesHeader(count = state.count)
        }
        // key: cada card é identificado pelo id da ave, e não pela posição; assim o animateItem segue
        // a mesma ave quando outra sai da lista. contentType: itens do mesmo tipo ("species") podem
        // reaproveitar a composição uns dos outros ao rolar, o que deixa a grade mais leve.
        itemsIndexed(state.items, key = { _, bird -> bird.id }, contentType = { _, _ -> "species" }) { index, bird ->
            PiuMosaicCard(
                name = bird.commonName,
                scientificName = bird.scientificName,
                imageUrl = bird.thumbnailUrl,
                biome = bird.primaryBiome ?: PiuFallbackBiome,
                isFavorite = true,
                onToggleFavorite = { onAction(FavoritesAction.ToggleFavorite(bird)) },
                onClick = { onAction(FavoritesAction.OpenDetail(bird.id)) },
                height = piuMosaicHeightFor(index),
                modifier = Modifier.animateItem(),
            )
        }
    }
}

/**
 * Nenhum favorito: o convite para explorar, centralizado no espaço acima da barra flutuante.
 * BoxWithConstraints dá a altura disponível (maxHeight), usada para centralizar o conteúdo e ainda
 * permitir rolagem com fonte grande.
 */
@Composable
private fun EmptyFavorites(
    onAction: (FavoritesAction) -> Unit,
    contentPadding: PaddingValues,
    modifier: Modifier,
) {
    Column(modifier.fillMaxSize().padding(bottom = contentPadding.calculateBottomPadding())) {
        FavoritesHeader(count = null, Modifier.padding(horizontal = PiuDimens.screenMargin))
        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
            PiuStateScreen(
                icon = painterResource(DesignRes.drawable.ic_favorites),
                title = stringResource(Res.string.empty_title),
                body = stringResource(Res.string.empty_body),
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .heightIn(min = maxHeight)
                        .padding(vertical = 24.dp),
            ) {
                Button(onClick = { onAction(FavoritesAction.ExploreClick) }) {
                    Text(stringResource(Res.string.explore_birds))
                }
            }
        }
    }
}
```

Substitua o conteúdo de `feature/settings/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/settings/presentation/SettingsScreen.kt`:

```kotlin
// A aba Configurações (frente E3): as seções Aparência, Reprodução, Dados e
// Sobre, cada uma num cartão de cantos arredondados (SettingsCards.kt). A seção
// "Para crianças" entra com a frente D.

package com.velosobr.passarim.feature.settings.presentation

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.ThemeMode
import com.velosobr.passarim.feature.settings.presentation.resources.Res
import com.velosobr.passarim.feature.settings.presentation.resources.about_row
import com.velosobr.passarim.feature.settings.presentation.resources.about_row_body
import com.velosobr.passarim.feature.settings.presentation.resources.autoplay
import com.velosobr.passarim.feature.settings.presentation.resources.autoplay_body
import com.velosobr.passarim.feature.settings.presentation.resources.dynamic_colors
import com.velosobr.passarim.feature.settings.presentation.resources.dynamic_colors_body
import com.velosobr.passarim.feature.settings.presentation.resources.section_about
import com.velosobr.passarim.feature.settings.presentation.resources.section_appearance
import com.velosobr.passarim.feature.settings.presentation.resources.section_data
import com.velosobr.passarim.feature.settings.presentation.resources.section_playback
import com.velosobr.passarim.feature.settings.presentation.resources.settings_title
import com.velosobr.passarim.feature.settings.presentation.resources.storage_body
import com.velosobr.passarim.feature.settings.presentation.resources.storage_row
import com.velosobr.passarim.feature.settings.presentation.resources.theme
import com.velosobr.passarim.feature.settings.presentation.resources.theme_dark
import com.velosobr.passarim.feature.settings.presentation.resources.theme_light
import com.velosobr.passarim.feature.settings.presentation.resources.theme_system
import com.velosobr.piuds.components.adult.PIU_STACK_FONT_SCALE
import com.velosobr.piuds.resources.ic_info
import com.velosobr.piuds.resources.ic_palette
import com.velosobr.piuds.resources.ic_storage
import com.velosobr.piuds.resources.ic_theme
import com.velosobr.piuds.resources.ic_volume
import com.velosobr.piuds.theme.PiuDimens
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.stringResource
import com.velosobr.piuds.resources.Res as DesignRes

/** O rótulo traduzível de cada opção de tema. */
private val ThemeMode.label: StringResource
    get() =
        when (this) {
            ThemeMode.SYSTEM -> Res.string.theme_system
            ThemeMode.LIGHT -> Res.string.theme_light
            ThemeMode.DARK -> Res.string.theme_dark
        }

/**
 * A tela sem estado próprio: tudo vem de [state] e cada toque vira uma [SettingsAction]. A opção de
 * cores dinâmicas só aparece onde o sistema tem. [contentPadding] é o espaço da barra flutuante: a
 * tela rola por baixo dela e o último cartão termina acima dela. As linhas que abrem outra tela
 * levam Role.Button, para o leitor de tela anunciá-las como botão.
 */
@Composable
fun SettingsScreen(
    state: SettingsState,
    onAction: (SettingsAction) -> Unit,
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(),
    scrollState: ScrollState = rememberScrollState(),
) {
    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(bottom = contentPadding.calculateBottomPadding() + 16.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        // O título no estilo do PiuScreenTitle, mas sem os 8 dp que ele põe embaixo: o espaço até a
        // primeira seção é só o spacedBy(18.dp) da coluna, como na prancheta.
        Text(
            stringResource(Res.string.settings_title),
            style = MaterialTheme.typography.headlineLarge,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(start = PiuDimens.screenMargin, top = 24.dp, end = PiuDimens.screenMargin).semantics { heading() },
        )
        SettingsGroup(stringResource(Res.string.section_appearance)) {
            GroupFlowRow(title = stringResource(Res.string.theme), icon = DesignRes.drawable.ic_theme) {
                ThemeSegments(state.settings.theme, onAction)
            }
            if (state.dynamicColorsSupported) {
                GroupDivider()
                SwitchRow(
                    title = stringResource(Res.string.dynamic_colors),
                    subtitle = stringResource(Res.string.dynamic_colors_body),
                    icon = DesignRes.drawable.ic_palette,
                    checked = state.settings.dynamicColors,
                    onCheckedChange = { onAction(SettingsAction.ChangeDynamicColors(it)) },
                )
            }
        }
        SettingsGroup(stringResource(Res.string.section_playback)) {
            SwitchRow(
                title = stringResource(Res.string.autoplay),
                subtitle = stringResource(Res.string.autoplay_body),
                icon = DesignRes.drawable.ic_volume,
                checked = state.settings.autoPlay,
                onCheckedChange = { onAction(SettingsAction.ChangeAutoPlay(it)) },
            )
        }
        SettingsGroup(stringResource(Res.string.section_data)) {
            GroupRow(
                title = stringResource(Res.string.storage_row),
                subtitle = stringResource(Res.string.storage_body),
                icon = DesignRes.drawable.ic_storage,
                modifier = Modifier.clickable(role = Role.Button) { onAction(SettingsAction.OpenStorage) },
            ) { Chevron() }
        }
        SettingsGroup(stringResource(Res.string.section_about)) {
            GroupRow(
                title = stringResource(Res.string.about_row),
                subtitle = stringResource(Res.string.about_row_body, state.versionName),
                icon = DesignRes.drawable.ic_info,
                modifier = Modifier.clickable(role = Role.Button) { onAction(SettingsAction.OpenAbout) },
            ) { Chevron() }
        }
    }
}

/**
 * O tema como botões segmentados (Sistema, Claro, Escuro). As opções ficam uma embaixo da outra
 * quando não cabem lado a lado (o SegmentedControl mede) e, com fonte a partir de 1.5×, sempre
 * (PIU_STACK_FONT_SCALE, a mesma regra que põe o mosaico em uma coluna).
 */
@Composable
private fun ThemeSegments(
    selected: ThemeMode,
    onAction: (SettingsAction) -> Unit,
) {
    SegmentedControl(
        segments =
            ThemeMode.entries.map { mode ->
                Segment(stringResource(mode.label), selected = mode == selected, onClick = { onAction(SettingsAction.SelectTheme(mode)) })
            },
        alwaysStacked = LocalDensity.current.fontScale >= PIU_STACK_FONT_SCALE,
    )
}

/** Uma linha com chave liga/desliga; o toque vale na linha toda (toggleable) e a chave só mostra o estado. */
@Composable
private fun SwitchRow(
    title: String,
    subtitle: String,
    icon: DrawableResource,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    GroupRow(
        title = title,
        subtitle = subtitle,
        icon = icon,
        modifier = Modifier.toggleable(value = checked, role = Role.Switch, onValueChange = onCheckedChange),
    ) {
        Switch(checked = checked, onCheckedChange = null)
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :feature:settings:presentation:testAndroidHostTest :feature:favorites:presentation:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Snapshots**

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*SettingsSnapshotTest*' --tests '*SettingsNarrowSnapshotTest*'`

Expected: 0 imagens novas e 34 regravadas em `snapshots/src/test/snapshots/images/`. Abra cada uma e confira a 1.0×, 1.3× e 2.0×, no claro e no escuro: nada cortado, nada quebrado no meio da palavra; o título "Configurações" mais perto de "Aparência" (18 dp); o resto igual.

- [ ] **Step 6: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:settings:presentation:testAndroidHostTest :feature:favorites:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m 'fix: título das Configurações a 18 dp da primeira seção, linhas com papel de botão e comentários da grade dos Favoritos'
```


## Ledger: achados Minor da revisão final

Corrigidos na Task 7: M1 (título a 18 dp), M7 (`Role.Button`) e M9 (comentários de `key`/`contentType`). Registrados no app #37 para depois, sem tarefa neste plano:

1. **M2. Snapshot dos Favoritos sem o espaço da barra:** o `FavoritesSnapshotTest` não passa `contentPadding = PaddingValues(bottom = 92.dp)`, ao contrário das Configurações; o vazio aparece centrado na tela toda, e no app fica centrado acima da barra.
2. **M3. Nenhum teste prova o `contentPadding`:** se Favoritos ou Configurações deixarem de aplicá-lo, o último item fica atrás da barra sem nenhum teste falhar. Teste sugerido: rolar até o último item e conferir que o `bottom` dele fica acima da altura da raiz menos 92 dp.
3. **M4. Texto do vazio:** o código diz "Nenhum favorito ainda" (o de hoje, como a spec manda); a nota da prancheta cita "Nenhuma ave favorita ainda". Corrigir a nota da prancheta.
4. **M5. Regras repetidas:** três cópias da escala de 1.5× (`PIU_STACK_FONT_SCALE`, `SINGLE_COLUMN_FONT_SCALE` no Explorar e no `DetailFormat.kt`), `exploreGridColumns` ao lado do `piuMosaicColumns`, e, depois do E2, dois cabeçalhos "título + contagem na grade" quase iguais (candidato: `PiuScreenHeader(title, subtitle)` no PiuDS). `PIU_STACK_FONT_SCALE` também governa o tema, e o nome do arquivo não diz isso. **Quando:** logo depois do merge do E2 e deste E3, num PR só de unificação.
5. **M6. `Segment` instável:** classe comum com lambda; `List<Segment>` é instável para o compilador do Compose. Trocar por `@Immutable` ou por `options: List<String>, selectedIndex: Int, onSelect: (Int) -> Unit`.
6. **M8. RED parcial:** parte dos testes das Tasks 3 e 4 é de caracterização (ver "Decisões deste plano", item 8).
7. **Vão de 26 dp no Explorar:** o `PiuScreenTitle` com `padding(bottom = 0.dp)` do Explorar tem o mesmo problema do M1; fica para o E2, que reorganiza esse cabeçalho.

## Fechamento

### Task 8: Verificação final, aparelho e PR

- [ ] **Step 1: Check como o CI**

Run: `./gradlew ktlintCheck detekt allTests :snapshots:verifyPaparazziDebug :androidApp:assembleDebug`

Expected: `BUILD SUCCESSFUL` (com o Xcode 16.2, as mesmas duas falhas de link iOS da Task 0).

- [ ] **Step 2: Navegação só liga**

Run: `git diff feat/e1-explorar -- '*Navigator*.kt' '*NavHost*.kt' '*Graph*.kt' '*TabsScreen*.kt' | grep -E '^\+.*(LaunchedEffect|DisposableEffect|\.collect *[{(])'`

Expected: nenhuma linha.

- [ ] **Step 3: Aparelho**

Run: `ANDROID_SERIAL=4T9DSCR4IZDAGEI7 ./gradlew :androidApp:installDebug`

Expected: os Favoritos em xadrez com a contagem, o título rolando junto e o último card acima da barra; as Configurações em cartões, o tema trocando na hora, e com a fonte do aparelho em 130% o tema desce para baixo de "Tema" (ou empilha, num aparelho estreito). Sem o aparelho, registre "instalação no aparelho pendente" no PR.

- [ ] **Step 4: Push e PR, sem merge**

```bash
git push -u origin feat/e3-favoritos-configuracoes
gh pr create --base feat/e1-explorar --head feat/e3-favoritos-configuracoes --title 'feat: E3 — Favoritos no mosaico e Configurações em cartões'
```

A descrição lista os snapshots regravados, os achados da revisão (corrigidos e Minor) e aponta para a spec (docs #29) e para o PR deste plano.
