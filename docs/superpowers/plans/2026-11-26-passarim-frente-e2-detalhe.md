# Frente E2 — o Detalhe novo e o Explorar rolando inteiro: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o E2 da frente E: o Explorar rola inteiro (título, busca e chips dentro da grade); o Detalhe ganha a foto de ponta a ponta com o nome sobre ela e os botões de vidro, o player com o botão em cookie e a forma de onda do canto no lugar da barra, e a foto do card viaja até o topo do Detalhe ao abrir a ave (e volta).

**Architecture:**
- **Um PR no `passarim-app` (`feat/e2-detalhe`, sobre `feat/e1-explorar`, app #40)**, de baixo para cima: o Explorar rolando inteiro (Task 1), os dados novos do Detalhe (Task 2), a forma de onda (Task 3), o player (Task 4), o topo novo do Detalhe (Task 5), a guarda do `autoPlay` (Task 6) e a transição card → Detalhe (Task 7). As Tasks 8 a 19 são as correções da revisão final.
- **Este plano** vai num PR do `passarim-docs` (`docs/plano-frente-e2`). Foi gerado dos commits do app #40 e provado por replay: aplicado tarefa por tarefa numa worktree limpa, reproduz a árvore de cada commit.
- O E3 (Favoritos e Configurações, app #37) corre em paralelo sobre a mesma base e mexe no mosaico do Explorar (o xadrez do PiuDS): o rebase de um sobre o outro tem um conflito pequeno em `ExploreMosaic.kt` e no esqueleto do `ExploreScreen.kt`.

**Tech Stack:** Kotlin 2.4.21, Compose Multiplatform 1.12.2 (`LazyVerticalStaggeredGrid`, `Canvas`, `pointerInput`, `SharedTransitionLayout`/`sharedBounds`), Navigation Compose (NavHost da raiz e o das abas), Koin 4.2.2, Ktor + kotlinx.serialization (DTO do Detalhe), Coil 3, Paparazzi 2.0.0-alpha05.1, Robolectric + `androidx.compose.ui.test.v2.runComposeUiTest`, assertk, Turbine.

**Spec:** `passarim-docs/docs/superpowers/specs/2026-11-08-passarim-frente-e-adulto-design.md` (docs #29), seções 1 (critério de pronto: as telas batem com as pranchetas), 4 (Explorar), 5 (Detalhe), 6 (transição do card para o Detalhe) e 8 (testes). Prancheta: `docs/design/direcoes-2026/canvas/Detalhe.dc.html`. Plano anterior: E1 (`2026-11-11-passarim-frente-e1-explorar.md`).

## Global Constraints

- **Comentários didáticos em português** em todo código novo ou alterado (regra do `~/dev/passarim/CLAUDE.md`): todo arquivo começa dizendo o seu papel; conceitos aparecem explicados na primeira vez no arquivo (`LazyVerticalStaggeredGrid` e `FullLine`, `Canvas`, `pointerInput`, `rememberUpdatedState`, `progressBarRangeInfo`/`setProgress`, `drawBehind`, `compositionLocalOf`, `SharedTransitionLayout` e `sharedBounds`); mudou o código, atualiza o comentário.
- **Idioma:** identificadores em inglês; comentários, KDoc, commits e PRs em português do Brasil. Nomes de teste em português entre crases, **sem acento e sem vírgula**.
- **Identidade do Git:** `velosobr <linoc.veloso@gmail.com>`. Commits terminam com as linhas de atribuição da sessão.
- **JDK 21** (`export JAVA_HOME=$(/usr/libexec/java_home -v 21)`).
- **Navegação só liga:** o `App.kt` e o `TabsScreen` só passam o escopo de animação (`PiuSharedScope`), repassam callbacks e navegam; nenhum `LaunchedEffect`, `collect` ou `DisposableEffect` no bloco de rota.
- **Modelo de domínio sem `@Serializable`:** o DTO do Detalhe (`SpeciesDetailDto`) é que lê o JSON; o mapper converte para o `SpeciesDetail`.
- **Fonte grande:** empilhar, nunca cortar o texto (regra da 5b). O nome sobre a foto empurra o topo para baixo em vez de ser cortado.
- **Testes de UI no host:** `runComposeUiTest` da v2 no Robolectric; transições quadro a quadro com `mainClock.autoAdvance = false`.
- **Snapshots:** Piu em claro e escuro, cada um a 1.0×, 1.3× e 2.0×. A foto falsa do Detalhe é toda branca (o pior caso para o nome em branco). Abra cada imagem antes do commit.
- **Sem merge e sem push na `main`:** os merges são do dono.

## Review Focus

1. **A foto que viaja entre os dois NavHosts:** o card mora no NavHost das abas e o Detalhe no da raiz. O escopo de animação da rota das abas desce para elas por um `CompositionLocal`; o teste `a foto viaja do card das abas ao detalhe da raiz e volta` (Task 12) acompanha a ida e a volta quadro a quadro.
2. **A ida com o Detalhe carregando:** o Detalhe quase sempre nasce no esqueleto; a chave, a miniatura e o bioma vêm na rota (`DetailPreview`), e o esqueleto já tem o par da foto (Task 8).
3. **"Ave do dia" × mosaico:** a mesma ave pode estar nos dois cards; cada um tem a sua chave (`foto-destaque-<id>` e `foto-<id>`), e a foto parte do card tocado (Task 9).
4. **A forma de onda como controle:** área de toque de 48 dp, toque, arrasto (inclusive cancelado) e `setProgress` do leitor de tela (Tasks 4, 10 e 11).
5. **O topo no escuro:** o degradê vai do scrim até a cor do fundo, sem faixa cinza (Task 13, snapshot `detail-complete-top-dark`).

## Decisões deste plano

1. **O Explorar rolando inteiro entrou no E2** (Task 1), e não num PR separado: o #36 (E1) já estava revisado. Uma grade só, com chaves fixas (`title`, `search`, `chips`) em todas as fases, para o campo de busca não ser recriado a cada letra.
2. **Forma de onda sem picos = linha reta** na altura mínima (10%); pico 0 também vira a barra mínima. Ela substitui o `Slider` e herda o papel dele (toque, arrasto e `setProgress`).
3. **Nome sobre a foto no tema claro:** a prancheta (só escura) funde a foto direto no fundo; no claro o branco ficaria sem contraste, então o nome fica sobre o scrim cheio e só uma faixa curta leva o scrim ao fundo claro. No escuro, o degradê segue direto até o fundo (Task 13).
4. **A transição entrou** (não foi para a frente H): o suporte mora no PiuDS (`PiuSharedTransitionLayout`, `PiuSharedScope`, `Modifier.piuSharedPhoto`), com `sharedBounds` (a miniatura do card e a foto grande são conteúdos diferentes) e desligado com "reduzir animações".
5. **A rota do Detalhe leva a prévia do card** (`photoKey`, `thumbnailUrl`, `primaryBiome`, só tipos simples), e o nome de cada campo é a chave que o ViewModel lê do `SavedStateHandle` (guardado por teste).
6. **O título do Explorar é um `Text` no estilo do `PiuScreenTitle`**, sem os 8 dp que ele põe embaixo, como as Configurações do E3 (Task 16).
7. **Testes de guarda:** as Tasks 6, 12 e 18 só acrescentam testes que passam com o código de hoje; o RED delas foi provado com uma mutação temporária (descrita em cada uma). As Tasks 17 e 19 não têm teste (refatoração e documentação).

## Task 0: Preparação

- [ ] **Step 1: Branch**

```bash
cd passarim-app
git fetch origin
git checkout -b feat/e2-detalhe origin/feat/e1-explorar
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
```

- [ ] **Step 2: Base verde**

Run: `./gradlew ktlintCheck detekt allTests :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL` (no Mac com Xcode 16.2, só os `linkDebugTestIosSimulatorArm64` de `:app` e `:feature:detail:presentation` falham, por `ld: framework '_LocationEssentials' not found`; o MapLibre pede o Xcode 26).

## Tasks

### Task 1: O título e a busca do Explorar rolam junto com o mosaico

O Explorar vira uma grade só (`LazyVerticalStaggeredGrid`): o título com a contagem, a busca e os chips são os primeiros itens, de largura cheia (`FullLine`), e sobem junto com o mosaico. Cada item do topo tem uma chave fixa (`title`, `search`, `chips`) em todas as fases, para o campo de busca continuar o mesmo item e não perder o foco quando a fase muda ao digitar. Os itens do topo "sangram" a margem da grade (`fullBleed`) para a linha de chips rolar até a borda. O vazio e o erro viram um item da grade, com respiro de 48 dp. O módulo ganha testes de UI no host.

**Files:**
- Modify: `feature/explore/presentation/build.gradle.kts`
- Create (test): `feature/explore/presentation/src/androidHostTest/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreScrollTest.kt`
- Modify: `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreMosaic.kt`
- Modify: `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreScreen.kt`
- Record: 36 imagens em `snapshots/src/test/snapshots/images/` (0 novas, 36 regravadas)

**Interfaces:**
- Produz: `LazyStaggeredGridScope.mosaicItems(state, onAction)`, `skeletonItems()`, `LoadMoreEffect(gridState, onAction)`, `PaddingValues.plusMargins()` e `Modifier.fullBleed()` (internos do Explorar).

- [ ] **Step 1: Escrever o teste que falha**

Crie `feature/explore/presentation/src/androidHostTest/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreScrollTest.kt`:

```kotlin
// Testes de interface do Explorar no host (Robolectric): o título e a busca
// fazem parte da grade e sobem junto com ela ao rolar, continuam na tela em
// todas as fases (carregando, vazio, erro) e o campo de busca não perde o
// foco quando a fase muda enquanto a pessoa digita.

package com.velosobr.passarim.feature.explore.presentation

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.hasScrollToIndexAction
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.v2.runComposeUiTest
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.domain.SpeciesSummary
import com.velosobr.passarim.core.presentation.ScreenError
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class ExploreScrollTest {
    /** Trinta aves: bastante para a grade rolar várias telas. */
    private val birds =
        List(30) { SpeciesSummary("ave-$it", "Ave $it", "Avis numerus $it", null, Biome.CERRADO) }

    /**
     * A grade é o único nó que rola na vertical e aceita "rolar até o item N" (a linha de chips
     * também aceita, mas rola na horizontal). VerticalScrollAxisRange é a propriedade de
     * semântica que diz até onde algo rola na vertical.
     */
    private val grid = hasScrollToIndexAction() and SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange)

    @Test
    fun `ao rolar a grade o titulo e a busca saem da tela`() =
        runComposeUiTest {
            setContent {
                PiuTheme { ExploreScreen(ExploreState(items = birds, phase = ExplorePhase.Content), onAction = {}) }
            }
            onNodeWithText("Explorar").assertIsDisplayed()
            onNode(grid).performScrollToIndex(25)
            // A grade preguiçosa descarta os itens que saem da tela: o título e a busca somem da árvore.
            onNodeWithText("Explorar").assertDoesNotExist()
            onNode(hasSetTextAction()).assertDoesNotExist()
        }

    @Test
    fun `carregando vazio e erro continuam mostrando o titulo e a busca`() =
        runComposeUiTest {
            var phase: ExplorePhase by mutableStateOf(ExplorePhase.Loading)
            setContent { PiuTheme { ExploreScreen(ExploreState(phase = phase), onAction = {}) } }
            listOf(ExplorePhase.Loading, ExplorePhase.Empty, ExplorePhase.Error(ScreenError.Generic)).forEach {
                phase = it
                waitForIdle()
                onNodeWithText("Explorar").assertIsDisplayed()
                onNode(hasText("Buscar aves")).assertIsDisplayed()
            }
        }

    /**
     * Digitar muda a fase (a busca recomeça: carregando, depois vazio ou com aves). Se o campo
     * saísse da composição nessa troca, o teclado fecharia no meio da palavra.
     */
    @Test
    fun `a busca continua com o foco quando a fase muda ao digitar`() =
        runComposeUiTest {
            setContent {
                var state by remember { mutableStateOf(ExploreState(items = birds, phase = ExplorePhase.Content)) }
                PiuTheme {
                    ExploreScreen(
                        state = state,
                        onAction = { action ->
                            if (action is ExploreAction.QueryChange) {
                                state = state.copy(query = action.text, items = emptyList(), phase = ExplorePhase.Loading)
                            }
                        },
                    )
                }
            }
            onNode(hasSetTextAction()).performClick()
            onNode(hasSetTextAction()).performTextInput("ara")
            onNode(hasSetTextAction()).assertIsFocused()
            onNode(hasText("ara")).assertIsDisplayed()
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:explore:presentation:testAndroidHostTest`

Expected: FAIL em `ExploreScrollTest > ao rolar a grade o titulo e a busca saem da tela` (o título fica preso no topo, fora da grade, e continua na árvore depois de rolar). Os outros testes novos (título e busca em todas as fases, o foco da busca ao digitar) já passam: são testes de caracterização, que fixam o comportamento de hoje para a troca de layout não quebrá-lo.

- [ ] **Step 3: Ajustar `build.gradle.kts`**

Em `feature/explore/presentation/build.gradle.kts`, aplique (o diff mostra o arquivo antes e depois):

```diff
diff --git a/feature/explore/presentation/build.gradle.kts b/feature/explore/presentation/build.gradle.kts
index 3b2adf6..624ddeb 100644
--- a/feature/explore/presentation/build.gradle.kts
+++ b/feature/explore/presentation/build.gradle.kts
@@ -22,5 +22,13 @@ kotlin {
             implementation(libs.turbine)
             implementation(libs.kotlinx.coroutines.test)
         }
+        // Testes de Compose no host Android (Robolectric): montam a tela de verdade e consultam a
+        // árvore de semântica, para conferir o que rola junto com a grade e o foco da busca.
+        getByName("androidHostTest").dependencies {
+            implementation(libs.compose.uiTest)
+            implementation(libs.androidx.compose.uiTestManifest)
+            implementation(libs.robolectric)
+            implementation(libs.junit4)
+        }
     }
 }
```

- [ ] **Step 4: Implementar**

Substitua o conteúdo de `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreMosaic.kt`:

```kotlin
// Os itens da grade do Explorar (frente E): a "Ave do dia" em largura total,
// os cards de espécie em colunas desencontradas, o rodapé de "carregando
// mais" e o esqueleto do carregamento. A ExploreScreen monta a grade e põe
// estes itens embaixo do título, da busca e dos chips; separar os dois
// arquivos dá a cada um uma responsabilidade.

package com.velosobr.passarim.feature.explore.presentation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.calculateEndPadding
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.staggeredgrid.LazyStaggeredGridScope
import androidx.compose.foundation.lazy.staggeredgrid.LazyStaggeredGridState
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan
import androidx.compose.foundation.lazy.staggeredgrid.items
import androidx.compose.foundation.lazy.staggeredgrid.itemsIndexed
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
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.feature.explore.presentation.resources.Res
import com.velosobr.passarim.feature.explore.presentation.resources.featured_badge
import com.velosobr.passarim.feature.explore.presentation.resources.featured_badge_biome
import com.velosobr.passarim.feature.explore.presentation.resources.featured_play
import com.velosobr.passarim.feature.explore.presentation.resources.load_more_error
import com.velosobr.passarim.feature.explore.presentation.resources.retry
import com.velosobr.piuds.components.PiuSkeletonBox
import com.velosobr.piuds.components.adult.PiuFeaturedCard
import com.velosobr.piuds.components.adult.PiuMosaicCard
import com.velosobr.piuds.components.adult.PiuMosaicHeight
import com.velosobr.piuds.components.adult.PiuPlayAction
import kotlinx.coroutines.flow.distinctUntilChanged
import org.jetbrains.compose.resources.stringResource

/**
 * A altura do card na posição [index] do mosaico: alto, baixo, baixo, alto, e repete. Com duas
 * colunas, a da esquerda começa alta e a da direita baixa, e as linhas nunca se alinham.
 */
fun mosaicHeightFor(index: Int): PiuMosaicHeight = if (index % 4 == 0 || index % 4 == 3) PiuMosaicHeight.TALL else PiuMosaicHeight.SHORT

/** O gradiente de um card sem bioma principal (catalog sem esse dado): o do Pantanal. */
private val FallbackBiome = Biome.PANTANAL

/**
 * Pede a próxima página quando o último item visível chega perto do fim da grade (a regra está em
 * shouldLoadMore; o ViewModel ignora pedidos repetidos e fora da fase de conteúdo, então emitir a
 * mais é inofensivo). snapshotFlow transforma a leitura do estado da grade num Flow, e
 * rememberUpdatedState dá ao efeito o onAction atual sem reiniciá-lo.
 */
@Composable
internal fun LoadMoreEffect(
    gridState: LazyStaggeredGridState,
    onAction: (ExploreAction) -> Unit,
) {
    val currentOnAction by rememberUpdatedState(onAction)
    LaunchedEffect(gridState) {
        snapshotFlow {
            val info = gridState.layoutInfo
            (info.visibleItemsInfo.lastOrNull()?.index ?: -1) to info.totalItemsCount
        }.distinctUntilChanged()
            .collect { (last, count) -> if (shouldLoadMore(last, count)) currentOnAction(ExploreAction.LoadMore) }
    }
}

/**
 * Os itens do mosaico: a "Ave do dia" ocupando a largura toda e, embaixo, os cards em colunas
 * desencontradas, com o rodapé de "carregando mais" ou de erro. Na LazyVerticalStaggeredGrid cada
 * item tem a própria altura e entra na coluna mais curta; FullLine faz um item ocupar todas as
 * colunas. É uma função de extensão de LazyStaggeredGridScope (o "escopo" em que se declaram os
 * itens de uma grade), para a ExploreScreen chamá-la dentro da grade dela.
 */
internal fun LazyStaggeredGridScope.mosaicItems(
    state: ExploreState,
    onAction: (ExploreAction) -> Unit,
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
            biome = bird.primaryBiome ?: FallbackBiome,
            isFavorite = bird.id in state.favoriteIds,
            onToggleFavorite = { onAction(ExploreAction.ToggleFavorite(bird)) },
            onClick = { onAction(ExploreAction.OpenDetail(bird.id)) },
            height = mosaicHeightFor(index),
        )
    }
    if (state.isLoadingMore || state.loadMoreError != null) {
        item(key = "footer", span = StaggeredGridItemSpan.FullLine, contentType = "footer") {
            LoadMoreFooter(isLoading = state.isLoadingMore, onRetry = { onAction(ExploreAction.RetryLoadMore) })
        }
    }
}

/** O "esqueleto" do carregamento: quatro blocos cinzas no desenho do mosaico, no lugar dos cards. */
internal fun LazyStaggeredGridScope.skeletonItems() {
    items(4, key = { "skeleton-$it" }, contentType = { "skeleton" }) { index ->
        val height = if (mosaicHeightFor(index) == PiuMosaicHeight.TALL) 220.dp else 168.dp
        PiuSkeletonBox(Modifier.fillMaxWidth().height(height), shape = MaterialTheme.shapes.large)
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
        biome = bird.primaryBiome ?: FallbackBiome,
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
internal fun PaddingValues.plusMargins(): PaddingValues {
    val direction = LocalLayoutDirection.current
    return PaddingValues(
        start = calculateStartPadding(direction) + GridMargin,
        end = calculateEndPadding(direction) + GridMargin,
        bottom = calculateBottomPadding() + 16.dp,
    )
}

/** A margem lateral da grade, que [fullBleed] desfaz para os itens do topo. */
private val GridMargin = 16.dp

/**
 * Faz um item ocupar a largura da tela inteira, por cima da margem lateral da grade. O título, a
 * busca e os chips já trazem as próprias margens, e a linha de chips precisa ir até a borda para
 * rolar na horizontal sem um corte a 16 dp dela. Modifier.layout mede o item com a largura da
 * grade mais as duas margens e o desenha deslocado para a esquerda; a grade não corta o que passa
 * da área dos itens enquanto continua dentro dela.
 */
internal fun Modifier.fullBleed(): Modifier =
    layout { measurable, constraints ->
        val extra = (GridMargin * 2).roundToPx()
        val width = constraints.maxWidth + extra
        val placeable = measurable.measure(constraints.copy(minWidth = width, maxWidth = width))
        layout(constraints.maxWidth, placeable.height) { placeable.place(-extra / 2, 0) }
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
// carregando, vazio e erro, tudo numa grade só que rola inteira. Os
// componentes visuais vêm do PiuDS; os itens do mosaico, de ExploreMosaic.kt.

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
import androidx.compose.foundation.lazy.staggeredgrid.LazyStaggeredGridScope
import androidx.compose.foundation.lazy.staggeredgrid.LazyStaggeredGridState
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan
import androidx.compose.foundation.lazy.staggeredgrid.rememberLazyStaggeredGridState
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
import com.velosobr.piuds.components.PiuStateScreen
import com.velosobr.piuds.components.StateTone
import com.velosobr.piuds.components.adult.PiuBiomeChip
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
 * A tela inteira é uma grade só (LazyVerticalStaggeredGrid): o título, a busca e os chips são os
 * primeiros itens dela, em largura cheia, e sobem junto com o mosaico ao rolar, em vez de ficarem
 * presos no topo. Abaixo deles, cada fase põe os próprios itens: o esqueleto, o mosaico ou o
 * estado de vazio ou de erro.
 *
 * A grade é a mesma em todas as fases, e cada item do topo tem uma chave fixa ("title",
 * "search", "chips"): digitar muda a fase (a busca recomeça), mas o campo continua o mesmo item
 * da mesma grade, e por isso não perde o foco nem fecha o teclado. Se cada fase tivesse a sua
 * grade, o campo seria criado de novo a cada letra.
 *
 * [contentPadding] é o espaço que a barra flutuante ocupa embaixo: a grade rola por baixo dela
 * (o desfoque precisa do conteúdo atrás) e termina acima dela.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExploreScreen(
    state: ExploreState,
    onAction: (ExploreAction) -> Unit,
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(),
    gridState: LazyStaggeredGridState = rememberLazyStaggeredGridState(),
) {
    val columns = exploreGridColumns(LocalDensity.current.fontScale)
    LoadMoreEffect(gridState, onAction)
    LazyVerticalStaggeredGrid(
        columns = StaggeredGridCells.Fixed(columns),
        state = gridState,
        modifier = modifier.fillMaxSize(),
        contentPadding = contentPadding.plusMargins(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalItemSpacing = 12.dp,
    ) {
        item(key = "title", span = StaggeredGridItemSpan.FullLine, contentType = "title") {
            Header(state, Modifier.fullBleed())
        }
        item(key = "search", span = StaggeredGridItemSpan.FullLine, contentType = "search") {
            PiuSearchField(
                value = state.query,
                onValueChange = { onAction(ExploreAction.QueryChange(it)) },
                placeholder = stringResource(Res.string.search_placeholder),
                modifier = Modifier.fullBleed().fillMaxWidth().padding(horizontal = 16.dp),
            )
        }
        item(key = "chips", span = StaggeredGridItemSpan.FullLine, contentType = "chips") {
            BiomeChips(state, onAction, Modifier.fullBleed())
        }
        when (val phase = state.phase) {
            ExplorePhase.Loading -> skeletonItems()
            ExplorePhase.Content -> mosaicItems(state, onAction)
            ExplorePhase.Empty -> stateItem { EmptyState(state, onAction) }
            is ExplorePhase.Error -> stateItem { ErrorState(phase.error, state.retryEnabled, onAction) }
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
private fun Header(
    state: ExploreState,
    modifier: Modifier,
) {
    Column(modifier) {
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
    modifier: Modifier,
) {
    val biomes = (state.filters as? FiltersPhase.Loaded)?.filters?.biomes.orEmpty()
    LazyRow(
        modifier = modifier,
        contentPadding = PaddingValues(horizontal = 16.dp),
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
 * O vazio ou o erro, como um item de largura cheia logo abaixo dos chips. É um item da grade, e
 * não uma tela à parte, para o título e a busca continuarem em cima dele.
 */
private fun LazyStaggeredGridScope.stateItem(content: @Composable () -> Unit) {
    item(key = "state", span = StaggeredGridItemSpan.FullLine, contentType = "state") {
        Box(Modifier.fillMaxWidth().padding(vertical = 48.dp), contentAlignment = Alignment.Center) { content() }
    }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `./gradlew :feature:explore:presentation:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 6: Snapshots**

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*ExploreSnapshotTest*'`

Expected: 0 imagens novas e 36 regravadas em `snapshots/src/test/snapshots/images/`. Abra cada uma e confira a 1.0×, 1.3× e 2.0×, no claro e no escuro: o título e a busca dentro da grade, nas fases de conteúdo, filtro, carregando, vazio e erro; nada cortado.

- [ ] **Step 7: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:explore:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m 'feat: título e busca do Explorar rolam junto com o mosaico'
```

### Task 2: Bioma principal e picos do canto no Detalhe, lidos do BFF

O BFF passou a mandar `primaryBiome` no topo da espécie e 64 `peaks` (de 0 a 1) em `audio` (contrato conferido em `GET /v1/species/crotophaga-ani` do BFF local). O DTO lê os dois campos com valor padrão, então um BFF antigo, sem eles, continua funcionando; o mapper converte o código do bioma (desconhecido vira nulo) e limita os picos a 0..1. O resumo da ave (o que vai para os Favoritos) leva o bioma.

**Files:**
- Modify: `feature/detail/data/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/data/SpeciesDetailDto.kt`
- Modify: `feature/detail/data/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/data/SpeciesDetailMapper.kt`
- Test: `feature/detail/data/src/commonTest/kotlin/com/velosobr/passarim/feature/detail/data/RemoteDetailRepositoryTest.kt`
- Modify: `feature/detail/domain/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/domain/SpeciesDetail.kt`
- Test: `feature/detail/domain/src/commonTest/kotlin/com/velosobr/passarim/feature/detail/domain/SpeciesDetailTest.kt`

**Interfaces:**
- Muda: `SpeciesDetail.primaryBiome: Biome?` e `Audio.peaks: List<Float>` (padrões nulo e vazio).
- Muda: `SpeciesDetail.toSummary()` leva o `primaryBiome`.

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `feature/detail/data/src/commonTest/kotlin/com/velosobr/passarim/feature/detail/data/RemoteDetailRepositoryTest.kt`:

```kotlin
// Testes do repositório do Detalhe com o MockEngine do Ktor no lugar do BFF.

package com.velosobr.passarim.feature.detail.data

import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isNull
import com.velosobr.passarim.core.data.MediaUrlRewriter
import com.velosobr.passarim.core.data.createHttpClient
import com.velosobr.passarim.core.domain.AppConfig
import com.velosobr.passarim.core.domain.ConservationStatus
import com.velosobr.passarim.core.domain.Credit
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.Result
import com.velosobr.passarim.feature.detail.domain.Audio
import com.velosobr.passarim.feature.detail.domain.Biome
import com.velosobr.passarim.feature.detail.domain.Cluster
import com.velosobr.passarim.feature.detail.domain.Photo
import com.velosobr.passarim.feature.detail.domain.SpeciesDetail
import com.velosobr.passarim.feature.detail.domain.WhereToFind
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.Url
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import com.velosobr.passarim.core.domain.Biome as PrimaryBiome

/**
 * full é uma resposta com todos os campos (inclusive os da frente B: o bioma principal e os picos
 * do canto); empty, uma com os campos opcionais nulos, vazios ou em branco.
 */
class RemoteDetailRepositoryTest {
    private val media = "http://localhost:8888/buckets/passarim-media/species/anodorhynchus-hyacinthinus"

    private val full =
        """
        {"id":"anodorhynchus-hyacinthinus","commonName":"Arara-azul-grande","scientificName":"Anodorhynchus hyacinthinus",
         "family":"Psittacidae","conservationStatus":{"code":"VU","label":"Vulnerável"},"sizeCm":100,
         "diet":"Sementes duras de palmeiras.","description":"A maior arara do mundo.",
         "descriptionCredit":{"author":"Equipe Passarim","license":"CC-BY-4.0","source":"curated","sourceUrl":"https://pt.wikipedia.org/wiki/Arara-azul-grande"},
         "facts":[{"text":"Formam casais monogâmicos.","source":"https://pt.wikipedia.org/wiki/Arara-azul-grande"}],
         "chips":[{"code":"cerrado","label":"Cerrado"},{"code":"pantanal","label":"Pantanal"}],
         "photos":[{"thumbUrl":"$media/p1-thumb.webp","mediumUrl":"$media/p1-medium.webp","largeUrl":"$media/p1-large.webp",
                    "width":900,"height":794,
                    "credit":{"author":"(c) Paul Donahue","license":"CC-BY-NC","source":"inaturalist","sourceUrl":"https://www.inaturalist.org/observations/87436377"}}],
         "audio":{"url":"$media/audio-403887.aac","durationMs":5000,
                  "credit":{"author":"Jayrson","license":"CC-BY-NC-SA","source":"xeno-canto","sourceUrl":"https://xeno-canto.org/403887"},
                  "peaks":[0.0,0.5,1.0]},
         "primaryBiome":"pantanal",
         "whereToFind":{"states":["MS","MT"],"biomes":["cerrado","pantanal"],
                        "clusters":[{"lat":-19.65,"lng":-56.42,"count":197,"precision":1}]}}
        """.trimIndent()

    private val empty =
        """
        {"id":"cyanopsitta-spixii","commonName":"Ararinha-azul","scientificName":"Cyanopsitta spixii","family":"Psittacidae",
         "conservationStatus":null,"sizeCm":null,"diet":"","description":"Texto.",
         "descriptionCredit":{"author":"","license":"","source":"","sourceUrl":""},
         "facts":[{"text":"","source":""}],"chips":[],
         "photos":[{"thumbUrl":null,"mediumUrl":null,"largeUrl":"$media/p1-large.webp","width":1,"height":1,
                    "credit":{"author":" ","license":"","source":"inaturalist","sourceUrl":""}}],
         "audio":null,"whereToFind":{"states":[],"biomes":[],"clusters":[]}}
        """.trimIndent()

    /**
     * repo cria o repositório com um "servidor" que responde [body] com o status e o
     * tipo dados; [mediaHostOverride] liga a troca de host.
     */
    private fun repo(
        body: String = full,
        status: HttpStatusCode = HttpStatusCode.OK,
        contentType: String = "application/json",
        mediaHostOverride: String? = null,
        onRequest: (Url) -> Unit = {},
    ): RemoteDetailRepository {
        val config =
            AppConfig(isDebug = false, baseUrl = "http://localhost:8080", mediaHostOverride = mediaHostOverride, versionName = "1.0.0")
        val engine =
            MockEngine { request ->
                onRequest(request.url)
                respond(body, status, headersOf(HttpHeaders.ContentType, contentType))
            }
        return RemoteDetailRepository(createHttpClient(engine, config), MediaUrlRewriter(config))
    }

    /** conservationJson é a resposta full com o status de conservação trocado pelo código dado. */
    private fun conservationJson(code: String) =
        full.replace("{\"code\":\"VU\",\"label\":\"Vulnerável\"}", "{\"code\":\"$code\",\"label\":\"x\"}")

    @Test
    fun `pede a especie pelo id no caminho`() =
        runTest {
            var url: Url? = null
            repo { url = it }.get("anodorhynchus-hyacinthinus")
            assertThat(url.toString()).isEqualTo("http://localhost:8080/v1/species/anodorhynchus-hyacinthinus")
        }

    @Test
    fun `mapeia a especie completa com a licenca formatada`() =
        runTest {
            val result = repo().get("anodorhynchus-hyacinthinus")
            assertThat(result).isEqualTo(
                Result.Success(
                    SpeciesDetail(
                        id = "anodorhynchus-hyacinthinus",
                        commonName = "Arara-azul-grande",
                        scientificName = "Anodorhynchus hyacinthinus",
                        family = "Psittacidae",
                        conservation = ConservationStatus.VU,
                        sizeCm = 100,
                        diet = "Sementes duras de palmeiras.",
                        description = "A maior arara do mundo.",
                        descriptionCredit =
                            Credit("Equipe Passarim", "CC BY 4.0", "curated", "https://pt.wikipedia.org/wiki/Arara-azul-grande"),
                        facts = listOf("Formam casais monogâmicos."),
                        biomes = listOf(Biome("cerrado", "Cerrado"), Biome("pantanal", "Pantanal")),
                        photos =
                            listOf(
                                Photo(
                                    "$media/p1-thumb.webp",
                                    "$media/p1-medium.webp",
                                    "$media/p1-large.webp",
                                    Credit(
                                        "(c) Paul Donahue",
                                        "CC BY-NC",
                                        "inaturalist",
                                        "https://www.inaturalist.org/observations/87436377",
                                    ),
                                ),
                            ),
                        audio =
                            Audio(
                                "$media/audio-403887.aac",
                                5000,
                                Credit("Jayrson", "CC BY-NC-SA", "xeno-canto", "https://xeno-canto.org/403887"),
                                peaks = listOf(0f, 0.5f, 1f),
                            ),
                        whereToFind = WhereToFind(listOf("MS", "MT"), listOf("cerrado", "pantanal"), listOf(Cluster(-19.65, -56.42, 197))),
                        primaryBiome = PrimaryBiome.PANTANAL,
                    ),
                ),
            )
        }

    @Test
    fun `campos nulos e vazios viram ausentes`() =
        runTest {
            val detail = (repo(body = empty).get("cyanopsitta-spixii") as Result.Success).data
            assertThat(detail.conservation).isNull()
            assertThat(detail.sizeCm).isNull()
            assertThat(detail.diet).isNull()
            assertThat(detail.audio).isNull()
            assertThat(detail.facts).isEmpty()
            assertThat(detail.descriptionCredit).isEqualTo(Credit(null, null, null, null))
            assertThat(detail.photos.single().credit).isEqualTo(Credit(null, null, "inaturalist", null))
            assertThat(detail.photos.single().heroUrl).isEqualTo("$media/p1-large.webp")
            assertThat(detail.photos.single().galleryUrl).isEqualTo("$media/p1-large.webp")
        }

    @Test
    fun `EX e DD sao reconhecidos e status desconhecido vira ausente`() =
        runTest {
            assertThat((repo(body = conservationJson("EX")).get("x") as Result.Success).data.conservation).isEqualTo(ConservationStatus.EX)
            assertThat((repo(body = conservationJson("DD")).get("x") as Result.Success).data.conservation).isEqualTo(ConservationStatus.DD)
            assertThat((repo(body = conservationJson("ZZ")).get("x") as Result.Success).data.conservation).isNull()
        }

    /** Um BFF de antes da frente B não manda o bioma principal nem os picos: o Detalhe abre do mesmo jeito. */
    @Test
    fun `sem bioma principal e sem picos a especie continua sendo lida`() =
        runTest {
            val old = full.replace(Regex(""",\s*"peaks":\[[^\]]*]"""), "").replace(Regex(""""primaryBiome":"pantanal","""), "")
            assertThat(old.contains("peaks") || old.contains("primaryBiome")).isFalse()
            val detail = (repo(body = old).get("x") as Result.Success).data
            assertThat(detail.primaryBiome).isNull()
            assertThat(detail.audio?.peaks).isEqualTo(emptyList())
        }

    @Test
    fun `bioma principal desconhecido vira ausente`() =
        runTest {
            val body = full.replace("\"primaryBiome\":\"pantanal\"", "\"primaryBiome\":\"tundra\"")
            assertThat((repo(body = body).get("x") as Result.Success).data.primaryBiome).isNull()
        }

    @Test
    fun `picos fora de 0 a 1 sao limitados ao intervalo`() =
        runTest {
            val body = full.replace("[0.0,0.5,1.0]", "[-0.2,0.5,1.7]")
            assertThat((repo(body = body).get("x") as Result.Success).data.audio?.peaks).isEqualTo(listOf(0f, 0.5f, 1f))
        }

    @Test
    fun `audio com url vazia vira ausente`() =
        runTest {
            val body = full.replace("\"$media/audio-403887.aac\"", "\"\"")
            assertThat((repo(body = body).get("x") as Result.Success).data.audio).isNull()
        }

    @Test
    fun `o MediaUrlRewriter e aplicado as fotos e ao audio`() =
        runTest {
            val detail = (repo(mediaHostOverride = "10.0.2.2").get("x") as Result.Success).data
            val rewritten = "http://10.0.2.2:8888/buckets/passarim-media/species/anodorhynchus-hyacinthinus"
            val photo = detail.photos.single()
            assertThat(listOf(photo.thumbUrl, photo.mediumUrl, photo.largeUrl))
                .containsExactly("$rewritten/p1-thumb.webp", "$rewritten/p1-medium.webp", "$rewritten/p1-large.webp")
            assertThat(detail.audio?.url).isEqualTo("$rewritten/audio-403887.aac")
        }

    @Test
    fun `especie inexistente vira NotFound`() =
        runTest {
            val problem = """{"type":"urn:passarim:problem:species-not-found","status":404,"code":"SPECIES_NOT_FOUND","requestId":"r"}"""
            val result = repo(body = problem, status = HttpStatusCode.NotFound, contentType = "application/problem+json").get("nao-existe")
            assertThat(result).isEqualTo(Result.Failure(DataError.Network.NotFound))
        }
}
```

Substitua o conteúdo de `feature/detail/domain/src/commonTest/kotlin/com/velosobr/passarim/feature/detail/domain/SpeciesDetailTest.kt`:

```kotlin
// Testes das regras do SpeciesDetail: URLs de foto e o resumo para os favoritos
// (com o bioma principal, que dá o gradiente do card).

package com.velosobr.passarim.feature.detail.domain

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import com.velosobr.passarim.core.domain.Credit
import com.velosobr.passarim.core.domain.SpeciesSummary
import kotlin.test.Test
import com.velosobr.passarim.core.domain.Biome as PrimaryBiome

class SpeciesDetailTest {
    private val credit = Credit("autor", "CC BY", "inaturalist", null)

    /** photo cria uma foto com as URLs dadas. */
    private fun photo(
        thumb: String? = "t",
        medium: String? = "m",
        large: String? = "l",
    ) = Photo(thumb, medium, large, credit)

    private val detail =
        SpeciesDetail(
            id = "pitangus-sulphuratus",
            commonName = "Bem-te-vi",
            scientificName = "Pitangus sulphuratus",
            family = "Tyrannidae",
            conservation = null,
            sizeCm = null,
            diet = null,
            description = "",
            descriptionCredit = credit,
            facts = emptyList(),
            biomes = emptyList(),
            photos = listOf(photo(thumb = "thumb-1"), photo(thumb = "thumb-2")),
            audio = null,
            whereToFind = WhereToFind(emptyList(), emptyList(), emptyList()),
        )

    @Test
    fun `o hero usa a foto grande e cai para a media`() {
        assertThat(photo().heroUrl).isEqualTo("l")
        assertThat(photo(large = null).heroUrl).isEqualTo("m")
        assertThat(photo(medium = null, large = null).heroUrl).isNull()
    }

    @Test
    fun `a galeria usa a foto media e cai para a grande`() {
        assertThat(photo().galleryUrl).isEqualTo("m")
        assertThat(photo(medium = null).galleryUrl).isEqualTo("l")
        assertThat(photo(medium = null, large = null).galleryUrl).isNull()
    }

    @Test
    fun `o resumo do favorito usa a miniatura da primeira foto`() {
        assertThat(detail.toSummary()).isEqualTo(SpeciesSummary("pitangus-sulphuratus", "Bem-te-vi", "Pitangus sulphuratus", "thumb-1"))
        assertThat(detail.copy(photos = emptyList()).toSummary().thumbnailUrl).isNull()
    }

    @Test
    fun `o resumo do favorito leva o bioma principal da ave`() {
        assertThat(detail.copy(primaryBiome = PrimaryBiome.CERRADO).toSummary().primaryBiome).isEqualTo(PrimaryBiome.CERRADO)
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew --continue :feature:detail:data:testAndroidHostTest :feature:detail:domain:testAndroidHostTest`

Expected: FAIL na compilação dos testes: em `RemoteDetailRepositoryTest`, `No parameter with name 'peaks' found` e `'primaryBiome'` no DTO e `Unresolved reference 'primaryBiome' on receiver of type 'SpeciesDetail'` / `'peaks' on receiver of type 'Audio'`; em `SpeciesDetailTest`, `No parameter with name 'primaryBiome' found`.

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `feature/detail/data/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/data/SpeciesDetailDto.kt`:

```kotlin
// Os DTOs da resposta de `GET /v1/species/{id}`, no formato do contrato do BFF.
// Campos com valor padrão (= null, = emptyList()) podem faltar no JSON sem
// quebrar a leitura.

package com.velosobr.passarim.feature.detail.data

import kotlinx.serialization.Serializable

/** A espécie completa; os campos que o app não usa (como a fonte de cada fato) ficam de fora. */
@Serializable
internal data class SpeciesDetailDto(
    val id: String,
    val commonName: String,
    val scientificName: String,
    val family: String,
    val conservationStatus: ConservationStatusDto? = null,
    val sizeCm: Int? = null,
    val diet: String? = null,
    val description: String,
    val descriptionCredit: CreditDto,
    val facts: List<FactDto> = emptyList(),
    val chips: List<LabelDto> = emptyList(),
    val photos: List<PhotoDto> = emptyList(),
    val audio: AudioDto? = null,
    val whereToFind: WhereToFindDto,
    /** O código do bioma principal ("pantanal"); só vem do BFF a partir da frente B. */
    val primaryBiome: String? = null,
)

/** O status de conservação; o app só lê o código e usa o próprio rótulo. */
@Serializable
internal data class ConservationStatusDto(
    val code: String,
)

/** Crédito de autoria. */
@Serializable
internal data class CreditDto(
    val author: String,
    val license: String,
    val source: String,
    val sourceUrl: String,
)

/** Uma curiosidade. */
@Serializable
internal data class FactDto(
    val text: String,
)

/** Um chip de bioma: código e rótulo. */
@Serializable
internal data class LabelDto(
    val code: String,
    val label: String,
)

/** Uma foto nos três tamanhos. */
@Serializable
internal data class PhotoDto(
    val thumbUrl: String? = null,
    val mediumUrl: String? = null,
    val largeUrl: String? = null,
    val credit: CreditDto,
)

/** O canto. [peaks] são as 64 alturas da forma de onda (de 0 a 1); só vêm a partir da frente B. */
@Serializable
internal data class AudioDto(
    val url: String,
    val durationMs: Long,
    val credit: CreditDto,
    val peaks: List<Float> = emptyList(),
)

/** A seção "Onde encontrar". */
@Serializable
internal data class WhereToFindDto(
    val states: List<String> = emptyList(),
    val biomes: List<String> = emptyList(),
    val clusters: List<ClusterDto> = emptyList(),
)

/** Um grupo de avistamentos do mapa. */
@Serializable
internal data class ClusterDto(
    val lat: Double,
    val lng: Double,
    val count: Int,
)
```

Substitua o conteúdo de `feature/detail/data/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/data/SpeciesDetailMapper.kt`:

```kotlin
// Conversão dos DTOs do Detalhe no domínio: textos vazios viram null, as
// licenças são formatadas, o host das mídias é trocado em debug, o código do
// bioma principal vira o enum e os picos do canto ficam entre 0 e 1.

package com.velosobr.passarim.feature.detail.data

import com.velosobr.passarim.core.data.MediaUrlRewriter
import com.velosobr.passarim.core.domain.Credit
import com.velosobr.passarim.core.domain.biomeOf
import com.velosobr.passarim.core.domain.conservationStatusOf
import com.velosobr.passarim.feature.detail.domain.Audio
import com.velosobr.passarim.feature.detail.domain.Biome
import com.velosobr.passarim.feature.detail.domain.Cluster
import com.velosobr.passarim.feature.detail.domain.Photo
import com.velosobr.passarim.feature.detail.domain.SpeciesDetail
import com.velosobr.passarim.feature.detail.domain.WhereToFind
import com.velosobr.passarim.feature.detail.domain.formatLicense

/** Converte a espécie inteira. Fatos vazios são descartados. */
internal fun SpeciesDetailDto.toDomain(rewriter: MediaUrlRewriter) =
    SpeciesDetail(
        id = id,
        commonName = commonName,
        scientificName = scientificName,
        family = family,
        conservation = conservationStatusOf(conservationStatus?.code),
        sizeCm = sizeCm,
        diet = diet.orNullIfBlank(),
        description = description,
        descriptionCredit = descriptionCredit.toDomain(),
        facts = facts.mapNotNull { it.text.orNullIfBlank() },
        biomes = chips.map { Biome(it.code, it.label) },
        photos = photos.map { it.toDomain(rewriter) },
        audio = audio?.toDomain(rewriter),
        whereToFind =
            WhereToFind(
                states = whereToFind.states,
                biomes = whereToFind.biomes,
                clusters = whereToFind.clusters.map { Cluster(it.lat, it.lng, it.count) },
            ),
        // biomeOf devolve null para um código que o app não conhece (um bioma novo no BFF).
        primaryBiome = biomeOf(primaryBiome),
    )

/** Converte o crédito; a licença "CC-BY-4.0" vira "CC BY 4.0". */
private fun CreditDto.toDomain() =
    Credit(
        author = author.orNullIfBlank(),
        license = formatLicense(license),
        source = source.orNullIfBlank(),
        sourceUrl = sourceUrl.orNullIfBlank(),
    )

/** Converte uma foto, trocando o host das três URLs em debug. */
private fun PhotoDto.toDomain(rewriter: MediaUrlRewriter) =
    Photo(
        thumbUrl = rewriter.rewrite(thumbUrl.orNullIfBlank()),
        mediumUrl = rewriter.rewrite(mediumUrl.orNullIfBlank()),
        largeUrl = rewriter.rewrite(largeUrl.orNullIfBlank()),
        credit = credit.toDomain(),
    )

/**
 * Converte o canto; sem URL válida, não há canto (null). Os picos passam por coerceIn(0f, 1f): um
 * valor fora do intervalo desenharia uma barra maior que a área da forma de onda.
 */
private fun AudioDto.toDomain(rewriter: MediaUrlRewriter): Audio? =
    rewriter.rewrite(url.orNullIfBlank())?.let { Audio(it, durationMs, credit.toDomain(), peaks.map { p -> p.coerceIn(0f, 1f) }) }

/** Texto nulo, vazio ou só com espaços vira null. */
private fun String?.orNullIfBlank(): String? = this?.trim()?.takeIf { it.isNotEmpty() }
```

Substitua o conteúdo de `feature/detail/domain/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/domain/SpeciesDetail.kt`:

```kotlin
// Os dados do Detalhe de uma espécie.
//
// Aqui existem dois "biomas": o Biome deste arquivo é o chip da tela (código e
// rótulo, como o BFF manda), e o com.velosobr.passarim.core.domain.Biome é o
// enum dos seis biomas, com gradiente no adulto. O bioma principal da ave usa
// o enum; para os dois nomes não se confundirem, ele entra como PrimaryBiome.

package com.velosobr.passarim.feature.detail.domain

import com.velosobr.passarim.core.domain.ConservationStatus
import com.velosobr.passarim.core.domain.Credit
import com.velosobr.passarim.core.domain.SpeciesSummary
import com.velosobr.passarim.core.domain.Biome as PrimaryBiome

/**
 * A espécie completa como a tela de Detalhe usa. A primeira foto é a principal. [primaryBiome] é
 * o bioma principal da ave (o gradiente do card quando ela vira um resumo); fica nulo
 * com um BFF de antes da frente B ou com um bioma que o app não conhece.
 */
data class SpeciesDetail(
    val id: String,
    val commonName: String,
    val scientificName: String,
    val family: String,
    val conservation: ConservationStatus?,
    val sizeCm: Int?,
    val diet: String?,
    val description: String,
    val descriptionCredit: Credit,
    val facts: List<String>,
    val biomes: List<Biome>,
    val photos: List<Photo>,
    val audio: Audio?,
    val whereToFind: WhereToFind,
    val primaryBiome: PrimaryBiome? = null,
)

/** Um bioma com o rótulo para o chip. */
data class Biome(
    val code: String,
    val label: String,
)

/**
 * Uma foto nos três tamanhos. [heroUrl] prefere a grande (para o topo) e
 * [galleryUrl] a média (para as miniaturas), cada uma caindo na outra se faltar.
 */
data class Photo(
    val thumbUrl: String?,
    val mediumUrl: String?,
    val largeUrl: String?,
    val credit: Credit,
) {
    val heroUrl: String? get() = largeUrl ?: mediumUrl
    val galleryUrl: String? get() = mediumUrl ?: largeUrl
}

/**
 * O canto: URL, duração e crédito. [peaks] é a forma de onda já calculada pelo catalog: 64 alturas
 * de 0 (silêncio) a 1 (o trecho mais alto), da esquerda para a direita. Vazia quando o BFF não
 * manda (versão antiga ou canto ainda sem processar); aí a forma de onda vira uma linha reta.
 */
data class Audio(
    val url: String,
    val durationMs: Long,
    val credit: Credit,
    val peaks: List<Float> = emptyList(),
)

/** A seção "Onde encontrar": UFs, biomas e grupos de avistamentos. */
data class WhereToFind(
    val states: List<String>,
    val biomes: List<String>,
    val clusters: List<Cluster>,
)

/** Um grupo de avistamentos no mapa. */
data class Cluster(
    val lat: Double,
    val lng: Double,
    val count: Int,
)

/** O resumo da espécie para guardar nos favoritos, com a miniatura da primeira foto e o bioma principal. */
fun SpeciesDetail.toSummary(): SpeciesSummary = SpeciesSummary(id, commonName, scientificName, photos.firstOrNull()?.thumbUrl, primaryBiome)
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew --continue :feature:detail:data:testAndroidHostTest :feature:detail:domain:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:detail:data:testAndroidHostTest :feature:detail:domain:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m 'feat: bioma principal e picos do canto no Detalhe, lidos do BFF'
```

### Task 3: A forma de onda do canto, com as barras calculadas dos picos

A forma de onda é um componente do Detalhe (só ele a usa; a "regra do 2" do PiuDS). A conta é uma função pura, `waveformBars`, testada sem desenhar nada: uma barra por pico, a altura mínima para o silêncio, linha reta sem picos e as barras tocadas pelo progresso. O `Waveform` só pinta o que ela devolve, num `Canvas`.

**Files:**
- Create: `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/Waveform.kt`
- Create (test): `feature/detail/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/detail/presentation/WaveformTest.kt`

**Interfaces:**
- Produz: `WAVEFORM_BARS = 64`, `MIN_BAR_HEIGHT = 0.1f`, `data class WaveformBar(height, played)`, `fun waveformBars(peaks, progress, barCount)` e `@Composable fun Waveform(peaks, progress, modifier, playedColor, idleColor)`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `feature/detail/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/detail/presentation/WaveformTest.kt`:

```kotlin
// Testes da função pura da forma de onda: dos picos do canto e do progresso
// do player até as barras que a tela desenha (altura e se já tocou).

package com.velosobr.passarim.feature.detail.presentation

import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.each
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import assertk.assertions.prop
import kotlin.test.Test

class WaveformTest {
    /** 64 picos crescentes, de 0 a 1, como os que o catalog calcula. */
    private val peaks = List(64) { it / 63f }

    @Test
    fun `uma barra por pico com a altura do pico`() {
        val bars = waveformBars(peaks, progress = 0f)
        assertThat(bars).hasSize(WAVEFORM_BARS)
        assertThat(bars[32].height).isEqualTo(peaks[32])
        assertThat(bars.last().height).isEqualTo(1f)
    }

    @Test
    fun `pico zero vira a barra minima para o silencio continuar visivel`() {
        assertThat(waveformBars(peaks, progress = 0f).first().height).isEqualTo(MIN_BAR_HEIGHT)
    }

    @Test
    fun `sem picos a forma de onda e uma linha reta`() {
        val bars = waveformBars(emptyList(), progress = 0.5f)
        assertThat(bars).hasSize(WAVEFORM_BARS)
        assertThat(bars.map { it.height }.distinct()).containsExactly(MIN_BAR_HEIGHT)
    }

    @Test
    fun `com progresso zero nenhuma barra tocou`() {
        assertThat(waveformBars(peaks, progress = 0f)).each { it.prop(WaveformBar::played).isFalse() }
    }

    @Test
    fun `com progresso um todas as barras tocaram`() {
        assertThat(waveformBars(peaks, progress = 1f)).each { it.prop(WaveformBar::played).isTrue() }
    }

    @Test
    fun `no meio do canto a primeira metade das barras tocou`() {
        val bars = waveformBars(peaks, progress = 0.5f)
        assertThat(bars.count { it.played }).isEqualTo(32)
        assertThat(bars[31].played).isTrue()
        assertThat(bars[32].played).isFalse()
    }

    @Test
    fun `progresso fora de 0 a 1 e limitado ao intervalo`() {
        assertThat(waveformBars(peaks, progress = -1f).count { it.played }).isEqualTo(0)
        assertThat(waveformBars(peaks, progress = 2f).count { it.played }).isEqualTo(WAVEFORM_BARS)
    }

    @Test
    fun `picos em quantidade diferente sao reamostrados para o numero de barras`() {
        val bars = waveformBars(listOf(0.2f, 0.8f), progress = 0f)
        assertThat(bars).hasSize(WAVEFORM_BARS)
        assertThat(bars.first().height).isEqualTo(0.2f)
        assertThat(bars.last().height).isEqualTo(0.8f)
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:detail:presentation:testAndroidHostTest`

Expected: FAIL na compilação de `WaveformTest`: `Unresolved reference 'waveformBars'`, `'WAVEFORM_BARS'` e `'MIN_BAR_HEIGHT'`.

- [ ] **Step 3: Implementar**

Crie `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/Waveform.kt`:

```kotlin
// A forma de onda do canto no player do Detalhe: barras verticais com a
// altura de cada trecho do áudio, e a parte já tocada na cor primária. É um
// componente do Detalhe, e não do PiuDS, porque só esta tela o usa (a "regra
// do 2" do PiuDS: um componente só sobe para o design system quando a
// segunda tela pede). A conta das barras é uma função pura (waveformBars),
// testada sem desenhar nada; o desenho só pinta o que ela devolve.

package com.velosobr.passarim.feature.detail.presentation

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** Quantas barras a forma de onda tem: uma para cada um dos 64 picos que o catalog calcula. */
const val WAVEFORM_BARS = 64

/**
 * A altura mínima de uma barra (fração da altura total). Um trecho em silêncio (pico 0) ainda
 * aparece como um traço, e sem picos todas as barras ficam nessa altura: uma linha reta.
 */
const val MIN_BAR_HEIGHT = 0.1f

/** Uma barra: [height] de [MIN_BAR_HEIGHT] a 1 (fração da altura total) e se o canto já passou por ela. */
data class WaveformBar(
    val height: Float,
    val played: Boolean,
)

/**
 * Transforma os [peaks] do canto e o [progress] do player (de 0 a 1) nas [barCount] barras da
 * forma de onda. Com outra quantidade de picos, cada barra pega o pico da posição proporcional
 * (a primeira barra o primeiro pico, a última o último). Uma barra conta como tocada quando o
 * progresso já passou do começo dela por inteiro: com progresso 0 nenhuma acende, com 1 todas.
 */
fun waveformBars(
    peaks: List<Float>,
    progress: Float,
    barCount: Int = WAVEFORM_BARS,
): List<WaveformBar> {
    val playedCount = (progress.coerceIn(0f, 1f) * barCount).toInt()
    return List(barCount) { index ->
        val peak =
            if (peaks.isEmpty()) {
                0f
            } else {
                peaks[if (barCount == 1) 0 else index * (peaks.size - 1) / (barCount - 1)]
            }
        WaveformBar(height = peak.coerceIn(MIN_BAR_HEIGHT, 1f), played = index < playedCount)
    }
}

/**
 * Desenha a forma de onda: as barras centralizadas na vertical, com cantos arredondados e um
 * espaço entre elas. Canvas é a área de desenho livre do Compose: o bloco roda a cada quadro em
 * que algo que ele lê muda (aqui, o progresso), e desenhar é barato, então não há nada a guardar
 * entre um quadro e outro. A parte tocada usa [playedColor] (a primária do tema) e o resto
 * [idleColor] (outlineVariant, o cinza das bordas).
 */
@Composable
fun Waveform(
    peaks: List<Float>,
    progress: Float,
    modifier: Modifier = Modifier,
    playedColor: Color = MaterialTheme.colorScheme.primary,
    idleColor: Color = MaterialTheme.colorScheme.outlineVariant,
) {
    Canvas(modifier.fillMaxWidth().height(32.dp)) {
        val bars = waveformBars(peaks, progress)
        val gap = 2.dp.toPx()
        val barWidth = ((size.width - gap * (bars.size - 1)) / bars.size).coerceAtLeast(1f)
        val radius = CornerRadius(barWidth / 2)
        bars.forEachIndexed { index, bar ->
            val barHeight = size.height * bar.height
            drawRoundRect(
                color = if (bar.played) playedColor else idleColor,
                topLeft = Offset(index * (barWidth + gap), (size.height - barHeight) / 2),
                size = Size(barWidth, barHeight),
                cornerRadius = radius,
            )
        }
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :feature:detail:presentation:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:detail:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m 'feat: forma de onda do canto, com as barras calculadas dos picos'
```

### Task 4: O player do canto com o botão em cookie e a forma de onda no lugar da barra

O cartão do player segue a prancheta: o botão de tocar em `PiuCookieShape` (64 dp, na primária) e a forma de onda no lugar do `Slider`, com o fundo em degradê da `primaryContainer` à `surfaceContainer`. A forma de onda herda o papel do `Slider`: tocar ou arrastar pula a posição (durante o arrasto ela segue o dedo e só pula ao soltar), e o leitor de tela lê o progresso (`progressBarRangeInfo`) e muda a posição (`setProgress`). O módulo ganha testes de UI no host.

**Files:**
- Modify: `feature/detail/presentation/build.gradle.kts`
- Create (test): `feature/detail/presentation/src/androidHostTest/kotlin/com/velosobr/passarim/feature/detail/presentation/AudioPlayerCardTest.kt`
- Modify: `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/AudioPlayerCard.kt`
- Modify: `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailContent.kt`
- Record: 12 imagens em `snapshots/src/test/snapshots/images/` (0 novas, 12 regravadas)

**Interfaces:**
- Muda: `AudioPlayerCard(durationMs, peaks, credit, playback, onTogglePlay, onSeek, modifier)` (ganha `peaks`).

- [ ] **Step 1: Escrever o teste que falha**

Crie `feature/detail/presentation/src/androidHostTest/kotlin/com/velosobr/passarim/feature/detail/presentation/AudioPlayerCardTest.kt`:

```kotlin
// Testes de interface do player do Detalhe no host (Robolectric): o botão de
// tocar em forma de cookie e a forma de onda, que também serve para pular a
// posição do canto (com o dedo ou pelo leitor de tela).

package com.velosobr.passarim.feature.detail.presentation

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.click
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import assertk.assertThat
import assertk.assertions.isBetween
import assertk.assertions.isEqualTo
import assertk.assertions.isNotNull
import com.velosobr.passarim.feature.detail.domain.PlaybackState
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class AudioPlayerCardTest {
    /** Um canto de 31 s, pausado no meio (15,5 s). */
    private val duration = 31_000L

    @Test
    fun `o botao de tocar tem 48 dp e diz o que faz`() =
        runComposeUiTest {
            var toggled = 0
            setContent {
                PiuTheme {
                    AudioPlayerCard(duration, List(64) { 0.5f }, "Gravação: autor", PlaybackState.Idle, { toggled++ }, {})
                }
            }
            onNodeWithContentDescription("Tocar canto").assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp).performClick()
            assertThat(toggled).isEqualTo(1)
        }

    @Test
    fun `a forma de onda diz ao leitor de tela quanto do canto ja tocou`() =
        runComposeUiTest {
            setContent {
                PiuTheme {
                    AudioPlayerCard(duration, List(64) { 0.5f }, "Gravação: autor", PlaybackState.Paused(15_500), {}, {})
                }
            }
            onNodeWithContentDescription("Progresso do canto")
                .assert(SemanticsMatcher.expectValue(SemanticsProperties.ProgressBarRangeInfo, ProgressBarRangeInfo(0.5f, 0f..1f)))
        }

    @Test
    fun `o leitor de tela pula a posicao do canto pela forma de onda`() =
        runComposeUiTest {
            var seekMs: Long? = null
            setContent {
                PiuTheme {
                    AudioPlayerCard(duration, List(64) { 0.5f }, "Gravação: autor", PlaybackState.Paused(0), {}, { seekMs = it })
                }
            }
            onNodeWithContentDescription("Progresso do canto").performSemanticsAction(SemanticsActions.SetProgress) { it(0.25f) }
            assertThat(seekMs).isEqualTo(7_750L)
        }

    @Test
    fun `tocar perto do fim da forma de onda pula para perto do fim do canto`() =
        runComposeUiTest {
            var seekMs: Long? = null
            setContent {
                PiuTheme {
                    AudioPlayerCard(duration, List(64) { 0.5f }, "Gravação: autor", PlaybackState.Paused(0), {}, { seekMs = it })
                }
            }
            onNodeWithContentDescription("Progresso do canto").performTouchInput { click(Offset(width * 0.75f, height / 2f)) }
            assertThat(seekMs).isNotNull().isBetween(22_000L, 24_500L)
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:detail:presentation:testAndroidHostTest`

Expected: FAIL na compilação de `AudioPlayerCardTest`: `Argument type mismatch: actual type is 'List<Float>', but 'String' was expected` (o `AudioPlayerCard` ainda não recebe os `peaks`).

- [ ] **Step 3: Ajustar `build.gradle.kts`**

Em `feature/detail/presentation/build.gradle.kts`, aplique (o diff mostra o arquivo antes e depois):

```diff
diff --git a/feature/detail/presentation/build.gradle.kts b/feature/detail/presentation/build.gradle.kts
index 201f92c..ec2f9de 100644
--- a/feature/detail/presentation/build.gradle.kts
+++ b/feature/detail/presentation/build.gradle.kts
@@ -28,5 +28,13 @@ kotlin {
             implementation(libs.turbine)
             implementation(libs.kotlinx.coroutines.test)
         }
+        // Testes de Compose no host Android (Robolectric): montam o player e o topo do Detalhe e
+        // consultam a árvore de semântica (o que o leitor de tela lê e os tamanhos de toque).
+        getByName("androidHostTest").dependencies {
+            implementation(libs.compose.uiTest)
+            implementation(libs.androidx.compose.uiTestManifest)
+            implementation(libs.robolectric)
+            implementation(libs.junit4)
+        }
     }
 }
```

- [ ] **Step 4: Implementar**

Substitua o conteúdo de `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/AudioPlayerCard.kt`:

```kotlin
// O cartão do player do canto (prancheta Detalhe.dc.html): o botão de tocar
// em forma de cookie, a forma de onda com a parte tocada na cor primária, os
// tempos e o crédito da gravação.

package com.velosobr.passarim.feature.detail.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.feature.detail.domain.PlaybackState
import com.velosobr.passarim.feature.detail.presentation.resources.Res
import com.velosobr.passarim.feature.detail.presentation.resources.audio_error
import com.velosobr.passarim.feature.detail.presentation.resources.audio_pause
import com.velosobr.passarim.feature.detail.presentation.resources.audio_play
import com.velosobr.passarim.feature.detail.presentation.resources.audio_progress
import com.velosobr.piuds.components.PiuCookieShape
import com.velosobr.piuds.components.PiuCreditCaption
import com.velosobr.piuds.resources.ic_pause
import com.velosobr.piuds.resources.ic_play
import org.jetbrains.compose.resources.stringResource
import org.jetbrains.compose.resources.vectorResource
import com.velosobr.piuds.resources.Res as DesignRes

/**
 * Mostra o canto e deixa tocar, pausar e pular a posição tocando ou arrastando na forma de onda.
 * [peaks] são as alturas da forma de onda (vazia vira uma linha reta). Enquanto o dedo arrasta, a
 * forma de onda segue o dedo (dragging) e não o player; ao soltar, o player pula para a posição
 * escolhida. "by remember { mutableStateOf(...) }" cria um estado que sobrevive às recomposições
 * e, ao mudar, recompõe quem o lê.
 *
 * O fundo é um degradê suave da primaryContainer para a surfaceContainer, como na prancheta; as
 * duas cores vêm do tema, então o par funciona no claro e no escuro.
 */
@Composable
fun AudioPlayerCard(
    durationMs: Long,
    peaks: List<Float>,
    credit: String,
    playback: PlaybackState,
    onTogglePlay: () -> Unit,
    onSeek: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    val position =
        when (playback) {
            is PlaybackState.Playing -> playback.positionMs
            is PlaybackState.Paused -> playback.positionMs
            else -> 0L
        }
    val duration = durationMs.coerceAtLeast(1)
    var dragging by remember { mutableStateOf<Float?>(null) }
    val colors = MaterialTheme.colorScheme
    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(28.dp))
            .background(Brush.linearGradient(listOf(colors.primaryContainer.copy(alpha = 0.55f), colors.surfaceContainer)))
            .padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PlayButton(playback, onTogglePlay)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Waveform(
                peaks = peaks,
                progress = dragging ?: (position.toFloat() / duration).coerceIn(0f, 1f),
                modifier =
                    Modifier.seekable(
                        label = stringResource(Res.string.audio_progress),
                        progress = (position.toFloat() / duration).coerceIn(0f, 1f),
                        onDrag = { dragging = it },
                        onSeek = { fraction ->
                            dragging = null
                            onSeek((fraction * duration).toLong())
                        },
                    ),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(formatTime(position), style = MaterialTheme.typography.labelSmall, color = colors.onSurfaceVariant)
                Text(formatTime(durationMs), style = MaterialTheme.typography.labelSmall, color = colors.onSurfaceVariant)
            }
            if (playback == PlaybackState.Error) {
                Text(
                    stringResource(Res.string.audio_error),
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.error,
                )
            }
            PiuCreditCaption(credit)
        }
    }
}

/**
 * Deixa pular a posição do canto pela forma de onda, de três jeitos: tocando num ponto, arrastando
 * (a forma de onda acompanha o dedo por [onDrag] e só pula ao soltar) e pelo leitor de tela.
 * pointerInput recebe os toques crus; a fração é a posição do dedo dividida pela largura.
 * Na semântica, progressBarRangeInfo diz ao leitor de tela quanto já tocou ("50%"), e setProgress
 * é a ação que ele usa para mudar a posição (o gesto de deslizar para cima ou para baixo no
 * TalkBack). rememberUpdatedState deixa os gestos, criados uma vez, chamarem sempre o onSeek atual.
 */
@Composable
private fun Modifier.seekable(
    label: String,
    progress: Float,
    onDrag: (Float) -> Unit,
    onSeek: (Float) -> Unit,
): Modifier {
    val currentOnDrag by rememberUpdatedState(onDrag)
    val currentOnSeek by rememberUpdatedState(onSeek)
    var lastDrag by remember { mutableStateOf(0f) }
    return this
        .pointerInput(Unit) {
            detectTapGestures { offset -> currentOnSeek((offset.x / size.width).coerceIn(0f, 1f)) }
        }.pointerInput(Unit) {
            detectHorizontalDragGestures(
                onDragEnd = { currentOnSeek(lastDrag) },
                onHorizontalDrag = { change, _ ->
                    lastDrag = (change.position.x / size.width).coerceIn(0f, 1f)
                    currentOnDrag(lastDrag)
                },
            )
        }.semantics {
            contentDescription = label
            progressBarRangeInfo = ProgressBarRangeInfo(progress, 0f..1f)
            setProgress { target ->
                currentOnSeek(target.coerceIn(0f, 1f))
                true
            }
        }
}

/**
 * O botão de tocar: cookie de 64 dp (a forma de assinatura do PiuDS) na cor primária, com spinner
 * enquanto carrega, pausa enquanto toca e play no resto. Role.Button faz o leitor de tela dizer
 * "botão" depois da descrição.
 */
@Composable
private fun PlayButton(
    playback: PlaybackState,
    onTogglePlay: () -> Unit,
) {
    val playing = playback is PlaybackState.Playing || playback == PlaybackState.Loading
    val label = stringResource(if (playing) Res.string.audio_pause else Res.string.audio_play)
    Box(
        Modifier
            .size(64.dp)
            .clip(PiuCookieShape())
            .background(MaterialTheme.colorScheme.primary)
            .clickable(role = Role.Button, onClick = onTogglePlay)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        if (playback == PlaybackState.Loading) {
            CircularProgressIndicator(Modifier.size(24.dp), color = MaterialTheme.colorScheme.onPrimary, strokeWidth = 2.dp)
        } else {
            Icon(
                vectorResource(if (playing) DesignRes.drawable.ic_pause else DesignRes.drawable.ic_play),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.size(28.dp),
            )
        }
    }
}
```

Substitua o conteúdo de `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailContent.kt`:

```kotlin
// O conteúdo do Detalhe de uma espécie, seção por seção.

package com.velosobr.passarim.feature.detail.presentation

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Credit
import com.velosobr.passarim.feature.detail.domain.Audio
import com.velosobr.passarim.feature.detail.domain.Cluster
import com.velosobr.passarim.feature.detail.domain.PlaybackState
import com.velosobr.passarim.feature.detail.domain.SpeciesDetail
import com.velosobr.passarim.feature.detail.domain.WhereToFind
import com.velosobr.passarim.feature.detail.domain.isSafeLink
import com.velosobr.passarim.feature.detail.presentation.resources.Res
import com.velosobr.passarim.feature.detail.presentation.resources.back
import com.velosobr.passarim.feature.detail.presentation.resources.credit_audio
import com.velosobr.passarim.feature.detail.presentation.resources.credit_open_source
import com.velosobr.passarim.feature.detail.presentation.resources.credit_photo
import com.velosobr.passarim.feature.detail.presentation.resources.credit_photo_numbered
import com.velosobr.passarim.feature.detail.presentation.resources.credit_text
import com.velosobr.passarim.feature.detail.presentation.resources.credit_unknown_author
import com.velosobr.passarim.feature.detail.presentation.resources.credit_unknown_license
import com.velosobr.passarim.feature.detail.presentation.resources.credits_toggle
import com.velosobr.passarim.feature.detail.presentation.resources.fact_biomes
import com.velosobr.passarim.feature.detail.presentation.resources.fact_bullet
import com.velosobr.passarim.feature.detail.presentation.resources.fact_occurrence
import com.velosobr.passarim.feature.detail.presentation.resources.fact_size
import com.velosobr.passarim.feature.detail.presentation.resources.fact_size_value
import com.velosobr.passarim.feature.detail.presentation.resources.fact_states
import com.velosobr.passarim.feature.detail.presentation.resources.family
import com.velosobr.passarim.feature.detail.presentation.resources.section_about
import com.velosobr.passarim.feature.detail.presentation.resources.section_biome
import com.velosobr.passarim.feature.detail.presentation.resources.section_diet
import com.velosobr.passarim.feature.detail.presentation.resources.section_facts
import com.velosobr.passarim.feature.detail.presentation.resources.section_gallery
import com.velosobr.passarim.feature.detail.presentation.resources.section_song
import com.velosobr.passarim.feature.detail.presentation.resources.section_where
import com.velosobr.piuds.components.GalleryPhoto
import com.velosobr.piuds.components.PiuConservationBadge
import com.velosobr.piuds.components.PiuCreditCaption
import com.velosobr.piuds.components.PiuFactTile
import com.velosobr.piuds.components.PiuHeroIconButton
import com.velosobr.piuds.components.PiuHeroPhoto
import com.velosobr.piuds.components.PiuInfoChips
import com.velosobr.piuds.components.PiuLabeledChips
import com.velosobr.piuds.components.PiuPhotoGallery
import com.velosobr.piuds.resources.favorite_add
import com.velosobr.piuds.resources.favorite_remove
import com.velosobr.piuds.resources.ic_arrow_back
import com.velosobr.piuds.resources.ic_favorite_filled
import com.velosobr.piuds.resources.ic_favorites
import com.velosobr.piuds.theme.PiuDimens
import org.jetbrains.compose.resources.painterResource
import org.jetbrains.compose.resources.pluralStringResource
import org.jetbrains.compose.resources.stringResource
import com.velosobr.piuds.resources.Res as DesignRes

/**
 * A página rolável do Detalhe: foto do topo, cabeçalho, fatos, biomas,
 * dieta, canto, descrição, curiosidades, galeria, "Onde encontrar" e
 * créditos. Seções sem dado não aparecem. [mapContent] é um slot para o mapa,
 * para os snapshots trocarem o MapLibre por um desenho simples.
 * Quando a página rola, uma faixa da cor do fundo cobre a barra de status,
 * para o texto não passar por baixo do relógio.
 */
@Composable
internal fun DetailContent(
    detail: SpeciesDetail,
    state: DetailState,
    onAction: (DetailAction) -> Unit,
    mapContent: @Composable (List<Cluster>, Modifier) -> Unit,
    scrollState: ScrollState,
) {
    val credit = rememberCreditFormatter()
    Box {
        Column(Modifier.fillMaxSize().verticalScroll(scrollState).navigationBarsPadding()) {
            Hero(detail, state.isFavorite, onAction)
            Column(
                Modifier.padding(horizontal = PiuDimens.screenMargin, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(24.dp),
            ) {
                Header(
                    detail,
                    detail.photos
                        .firstOrNull()
                        ?.credit
                        ?.let { stringResource(Res.string.credit_photo, credit(it)) },
                )
                Facts(detail)
                if (detail.biomes.isNotEmpty()) PiuLabeledChips(stringResource(Res.string.section_biome), detail.biomes.map { it.label })
                detail.diet?.let { Diet(it) }
                detail.audio?.let { Song(it, state.player, credit, onAction) }
                if (detail.description.isNotBlank()) {
                    Section(stringResource(Res.string.section_about)) {
                        Text(detail.description, style = MaterialTheme.typography.bodyMedium)
                        PiuCreditCaption(stringResource(Res.string.credit_text, credit(detail.descriptionCredit)))
                    }
                }
                if (detail.facts.isNotEmpty()) {
                    Section(stringResource(Res.string.section_facts)) {
                        detail.facts.forEach {
                            Text(
                                stringResource(Res.string.fact_bullet, it),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                }
                if (detail.photos.size > 1) {
                    Section(stringResource(Res.string.section_gallery)) {
                        PiuPhotoGallery(detail.photos.drop(1).map { GalleryPhoto(it.galleryUrl, credit(it.credit)) })
                    }
                }
                WhereToFindSection(detail.whereToFind, mapContent)
                Credits(detail, state.creditsExpanded, credit, onAction)
            }
        }
        if (scrollState.value > 0) {
            Box(Modifier.fillMaxWidth().windowInsetsTopHeight(WindowInsets.statusBars).background(MaterialTheme.colorScheme.surface))
        }
    }
}

/** A seção de dieta. */
@Composable
private fun Diet(diet: String) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            stringResource(Res.string.section_diet),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(diet, style = MaterialTheme.typography.bodyMedium)
    }
}

/** A seção do canto, com o player. */
@Composable
private fun Song(
    audio: Audio,
    playback: PlaybackState,
    credit: (Credit) -> String,
    onAction: (DetailAction) -> Unit,
) {
    Section(stringResource(Res.string.section_song)) {
        AudioPlayerCard(
            durationMs = audio.durationMs,
            peaks = audio.peaks,
            credit = stringResource(Res.string.credit_audio, credit(audio.credit)),
            playback = playback,
            onTogglePlay = { onAction(DetailAction.TogglePlay) },
            onSeek = { onAction(DetailAction.Seek(it)) },
        )
    }
}

/** "Onde encontrar": o mapa e as UFs; some se não houver nenhum dos dois. */
@Composable
private fun WhereToFindSection(
    where: WhereToFind,
    mapContent: @Composable (List<Cluster>, Modifier) -> Unit,
) {
    if (where.clusters.isEmpty() && where.states.isEmpty()) return
    Section(stringResource(Res.string.section_where)) {
        mapContent(where.clusters, Modifier)
        if (where.states.isNotEmpty()) PiuInfoChips(where.states)
    }
}

/** A foto do topo, que vai até atrás da barra de status, com os botões de voltar e de favoritar por cima, logo abaixo dela. */
@Composable
private fun Hero(
    detail: SpeciesDetail,
    isFavorite: Boolean,
    onAction: (DetailAction) -> Unit,
) {
    PiuHeroPhoto(imageUrl = detail.photos.firstOrNull()?.heroUrl) {
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            PiuHeroIconButton(
                painterResource(DesignRes.drawable.ic_arrow_back),
                contentDescription = stringResource(Res.string.back),
                onClick = { onAction(DetailAction.Back) },
            )
            PiuHeroIconButton(
                painterResource(if (isFavorite) DesignRes.drawable.ic_favorite_filled else DesignRes.drawable.ic_favorites),
                contentDescription =
                    stringResource(if (isFavorite) DesignRes.string.favorite_remove else DesignRes.string.favorite_add, detail.commonName),
                onClick = { onAction(DetailAction.ToggleFavorite) },
                tint = if (isFavorite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

/** Crédito da foto, nome popular, nome científico em itálico, selo de conservação e família. */
@Composable
private fun Header(
    detail: SpeciesDetail,
    photoCredit: String?,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        photoCredit?.let { PiuCreditCaption(it) }
        Text(detail.commonName, style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.onSurface)
        Text(
            detail.scientificName,
            style = MaterialTheme.typography.bodyLarge,
            fontStyle = FontStyle.Italic,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            detail.conservation?.let { PiuConservationBadge(it, Modifier.align(Alignment.CenterVertically)) }
            Text(
                stringResource(Res.string.family, detail.family),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.align(Alignment.CenterVertically),
            )
        }
    }
}

/**
 * Os blocos de fatos (tamanho, número de biomas e de UFs), lado a lado ou
 * empilhados com fonte grande. pluralStringResource escolhe "1 bioma" ou
 * "3 biomas" conforme o número.
 */
@Composable
private fun Facts(detail: SpeciesDetail) {
    val tiles =
        buildList {
            detail.sizeCm?.let { add(stringResource(Res.string.fact_size_value, it) to stringResource(Res.string.fact_size)) }
            val biomes = detail.biomes.size
            if (biomes > 0) add(pluralStringResource(Res.plurals.fact_biomes, biomes, biomes) to stringResource(Res.string.fact_occurrence))
            val states = detail.whereToFind.states.size
            if (states > 0) add(pluralStringResource(Res.plurals.fact_states, states, states) to stringResource(Res.string.fact_occurrence))
        }
    if (tiles.isEmpty()) return
    if (factsInSingleColumn(LocalDensity.current.fontScale)) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            tiles.forEach { (value, label) -> PiuFactTile(value, label, Modifier.fillMaxWidth()) }
        }
    } else {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            tiles.forEach { (value, label) -> PiuFactTile(value, label, Modifier.weight(1f)) }
        }
    }
}

/** Uma seção com título e conteúdo. */
@Composable
private fun Section(
    title: String,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
        content()
    }
}

/** O botão que abre e fecha a lista completa de créditos (fotos, numeradas quando há mais de uma, canto e texto). */
@Composable
private fun Credits(
    detail: SpeciesDetail,
    expanded: Boolean,
    credit: (Credit) -> String,
    onAction: (DetailAction) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        TextButton(onClick = { onAction(DetailAction.ToggleCredits) }, modifier = Modifier.heightIn(min = PiuDimens.touchTarget)) {
            Text(stringResource(Res.string.credits_toggle))
        }
        if (!expanded) return@Column
        val photos = detail.photos
        photos.forEachIndexed { index, photo ->
            val line =
                if (photos.size == 1) {
                    stringResource(Res.string.credit_photo, credit(photo.credit))
                } else {
                    stringResource(Res.string.credit_photo_numbered, index + 1, credit(photo.credit))
                }
            CreditEntry(line, photo.credit.sourceUrl, onAction)
        }
        detail.audio?.let { CreditEntry(stringResource(Res.string.credit_audio, credit(it.credit)), it.credit.sourceUrl, onAction) }
        CreditEntry(stringResource(Res.string.credit_text, credit(detail.descriptionCredit)), detail.descriptionCredit.sourceUrl, onAction)
    }
}

/** Uma linha de crédito, com o link para o original quando ele é seguro (https). */
@Composable
private fun CreditEntry(
    text: String,
    url: String?,
    onAction: (DetailAction) -> Unit,
) {
    Column {
        Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (url != null && isSafeLink(url)) {
            TextButton(
                onClick = { onAction(DetailAction.OpenCredit(url)) },
                modifier = Modifier.heightIn(min = PiuDimens.touchTarget),
            ) {
                Text(stringResource(Res.string.credit_open_source))
            }
        }
    }
}

/** Monta a função que escreve "autor · licença", com os textos traduzidos de "desconhecido". */
@Composable
private fun rememberCreditFormatter(): (Credit) -> String {
    val unknownAuthor = stringResource(Res.string.credit_unknown_author)
    val unknownLicense = stringResource(Res.string.credit_unknown_license)
    return { creditLine(it, unknownAuthor, unknownLicense) }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `./gradlew :feature:detail:presentation:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 6: Snapshots**

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*DetailSnapshotTest*'`

Expected: 0 imagens novas e 12 regravadas em `snapshots/src/test/snapshots/images/`. Abra cada uma e confira a 1.0×, 1.3× e 2.0×, no claro e no escuro: o botão em cookie, a forma de onda com a parte tocada na primária e, sem picos, uma linha reta.

- [ ] **Step 7: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:detail:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m 'feat: player do canto com o botão em cookie e a forma de onda no lugar da barra'
```

### Task 5: O Detalhe com a foto de ponta a ponta, o nome sobre ela e os botões de vidro

O topo do Detalhe segue a prancheta: a foto de ponta a ponta (430 dp, até atrás da barra de status) com o gradiente do bioma por trás, o nome e o nome científico em branco sobre o `photoTextScrim` na base da foto, uma faixa que funde a foto ao fundo e os botões de voltar e de favoritar em círculos de vidro fosco (`PiuBlurSurface`, 48 dp; o favorito como liga/desliga). Com fonte grande, o nome empurra o topo para baixo em vez de ser cortado. O PiuDS acompanha: `photoTextScrim` fica público (terceiro uso), o `PiuHeroPhoto` ganha `biome` e `aspectRatio` nulo, e o `PiuFactTile` passa ao raio de 20 dp.

**Files:**
- Modify: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuFactTile.kt`
- Modify: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuHeroPhoto.kt`
- Modify: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PhotoScrim.kt`
- Create (test): `feature/detail/presentation/src/androidHostTest/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailHeroTest.kt`
- Modify: `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailContent.kt`
- Create: `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailHero.kt`
- Modify: `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailScreen.kt`
- Test: `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/DetailSnapshotTest.kt`
- Record: 54 imagens em `snapshots/src/test/snapshots/images/` (12 novas, 42 regravadas)

**Interfaces:**
- Produz: `val HERO_HEIGHT = 430.dp` e `internal fun DetailHero(detail, isFavorite, onAction)`, `internal fun BackButton(blur, onBack, modifier)`.
- Muda: `fun Modifier.photoTextScrim(color, fade)` passa a público; `PiuHeroPhoto(..., biome, aspectRatio)`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `feature/detail/presentation/src/androidHostTest/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailHeroTest.kt`:

```kotlin
// Testes de interface do topo do Detalhe no host (Robolectric): os botões
// sobre a foto (voltar e favoritar) têm 48 dp e dizem o que fazem, o nome
// fica sobre a foto e o resto da página começa abaixo dela.

package com.velosobr.passarim.feature.detail.presentation

import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.isGreaterThanOrEqualTo
import assertk.assertions.isLessThanOrEqualTo
import com.velosobr.passarim.core.domain.ConservationStatus
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w411dp-h891dp")
class DetailHeroTest {
    private val detail = arara.copy(conservation = ConservationStatus.VU)

    /** Monta o Detalhe com o conteúdo pronto; o mapa vira um espaço vazio (o MapLibre não roda no host). */
    private fun androidx.compose.ui.test.ComposeUiTest.showDetail(
        isFavorite: Boolean,
        onAction: (DetailAction) -> Unit = {},
    ) {
        setContent {
            PiuTheme {
                DetailScreen(
                    state = DetailState(phase = DetailPhase.Content(detail), isFavorite = isFavorite),
                    onAction = onAction,
                    mapContent = { _, _ -> },
                )
            }
        }
    }

    @Test
    fun `os botoes sobre a foto tem 48 dp e dizem o que fazem`() =
        runComposeUiTest {
            val actions = mutableListOf<DetailAction>()
            showDetail(isFavorite = false) { actions += it }
            onNodeWithContentDescription("Voltar").assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp).performClick()
            onNodeWithContentDescription("Favoritar Arara-azul-grande")
                .assertWidthIsAtLeast(48.dp)
                .assertHeightIsAtLeast(48.dp)
                .performClick()
            assertThat(actions).containsExactly(DetailAction.Back, DetailAction.ToggleFavorite)
        }

    /** Um botão de liga/desliga: o leitor de tela anuncia se a ave já está nos favoritos. */
    @Test
    fun `favoritar e um botao de liga e desliga`() =
        runComposeUiTest {
            showDetail(isFavorite = true)
            onNode(isToggleable()).assertIsOn()
            onNodeWithContentDescription("Desfavoritar Arara-azul-grande").assertIsOn()
        }

    @Test
    fun `sem favorito o botao fica desligado`() =
        runComposeUiTest {
            showDetail(isFavorite = false)
            onNode(isToggleable()).assertIsOff()
        }

    @Test
    fun `o nome fica sobre a foto e o resto da pagina comeca abaixo dela`() =
        runComposeUiTest {
            showDetail(isFavorite = false)
            assertThat(onNodeWithText(detail.commonName).getBoundsInRoot().bottom).isLessThanOrEqualTo(HERO_HEIGHT)
            assertThat(onNodeWithText(detail.scientificName).getBoundsInRoot().bottom).isLessThanOrEqualTo(HERO_HEIGHT)
            assertThat(onNodeWithText("Vulnerável").getBoundsInRoot().top).isGreaterThanOrEqualTo(HERO_HEIGHT)
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:detail:presentation:testAndroidHostTest`

Expected: FAIL na compilação de `DetailHeroTest`: `Unresolved reference 'HERO_HEIGHT'`.

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuFactTile.kt`:

```kotlin
// Bloco de um fato do Detalhe (tamanho, dieta...).
// @Composable: função que desenha interface; Modifier ajusta tamanho, espaço,
// cliques e acessibilidade (veja PiuBackTopBar.kt).

package com.velosobr.piuds.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp

/**
 * Um valor em destaque ([value], como "23 cm") com o rótulo embaixo ([label]), num bloco de
 * cantos de 20 dp (prancheta Detalhe.dc.html da frente E).
 */
@Composable
fun PiuFactTile(
    value: String,
    label: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier
            .clip(RoundedCornerShape(20.dp))
            .background(MaterialTheme.colorScheme.surfaceContainer)
            .padding(horizontal = 12.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(value, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
```

Substitua o conteúdo de `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuHeroPhoto.kt`:

```kotlin
// Foto grande do topo do Detalhe e o botão redondo que fica sobre ela.

package com.velosobr.piuds.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.piuds.theme.PiuDimens
import com.velosobr.piuds.theme.PiuTheme
import com.velosobr.piuds.theme.toBrush

/** Proporção largura:altura da foto do topo. */
private const val HERO_ASPECT_RATIO = 1.3f

/**
 * A foto do topo, com o placeholder por baixo enquanto ela carrega (ou se não
 * houver). [overlay] é um "slot": um bloco @Composable que quem chama passa
 * para desenhar por cima (os botões de voltar e favoritar). AsyncImage é o
 * componente do Coil que baixa e mostra a imagem; ContentScale.Crop preenche o
 * espaço cortando as bordas.
 *
 * Com [biome], o fundo enquanto a foto não chega (ou sem foto) é o gradiente
 * do bioma, como nos cards do mosaico, no lugar do placeholder com o
 * passarinho. Com [aspectRatio] nulo, a altura vem do [modifier] (o Detalhe
 * usa uma altura fixa e faz a foto ocupar o espaço todo).
 */
@Composable
fun PiuHeroPhoto(
    imageUrl: String?,
    modifier: Modifier = Modifier,
    biome: Biome? = null,
    aspectRatio: Float? = HERO_ASPECT_RATIO,
    overlay: @Composable BoxScope.() -> Unit = {},
) {
    Box(modifier.fillMaxWidth().then(if (aspectRatio != null) Modifier.aspectRatio(aspectRatio) else Modifier)) {
        if (biome != null) {
            Box(
                Modifier.fillMaxSize().background(
                    PiuTheme.tokens.gradients
                        .getValue(biome)
                        .toBrush(),
                ),
            )
        } else {
            PhotoPlaceholder(iconSize = 96.dp)
        }
        if (imageUrl != null) {
            AsyncImage(model = imageUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        }
        overlay()
    }
}

/** Botão redondo e translúcido para ficar legível sobre qualquer foto, com área de toque de 48dp. */
@Composable
fun PiuHeroIconButton(
    icon: Painter,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tint: Color = MaterialTheme.colorScheme.onSurface,
) {
    IconButton(onClick = onClick, modifier = modifier.size(PiuDimens.touchTarget)) {
        Box(
            Modifier.size(40.dp).background(MaterialTheme.colorScheme.surface.copy(alpha = 0.85f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = contentDescription, tint = tint)
        }
    }
}
```

Substitua o conteúdo de `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PhotoScrim.kt`:

```kotlin
// O scrim das fotos do adulto: o degradê escuro atrás do nome da ave, para o
// texto branco ter contraste sobre qualquer foto. Usado pelo card do mosaico,
// pela "Ave do dia" e pelo nome sobre a foto do Detalhe: com a terceira tela,
// passou a ser público (antes era interno ao PiuDS).

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
fun Modifier.photoTextScrim(
    color: Color,
    fade: Dp = 32.dp,
): Modifier =
    drawBehind {
        drawRect(Brush.verticalGradient(listOf(color.copy(alpha = 0f), color), startY = 0f, endY = fade.toPx()))
    }
```

Substitua o conteúdo de `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailContent.kt`:

```kotlin
// O conteúdo do Detalhe de uma espécie, seção por seção.

package com.velosobr.passarim.feature.detail.presentation

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Credit
import com.velosobr.passarim.feature.detail.domain.Audio
import com.velosobr.passarim.feature.detail.domain.Cluster
import com.velosobr.passarim.feature.detail.domain.PlaybackState
import com.velosobr.passarim.feature.detail.domain.SpeciesDetail
import com.velosobr.passarim.feature.detail.domain.WhereToFind
import com.velosobr.passarim.feature.detail.domain.isSafeLink
import com.velosobr.passarim.feature.detail.presentation.resources.Res
import com.velosobr.passarim.feature.detail.presentation.resources.credit_audio
import com.velosobr.passarim.feature.detail.presentation.resources.credit_open_source
import com.velosobr.passarim.feature.detail.presentation.resources.credit_photo
import com.velosobr.passarim.feature.detail.presentation.resources.credit_photo_numbered
import com.velosobr.passarim.feature.detail.presentation.resources.credit_text
import com.velosobr.passarim.feature.detail.presentation.resources.credit_unknown_author
import com.velosobr.passarim.feature.detail.presentation.resources.credit_unknown_license
import com.velosobr.passarim.feature.detail.presentation.resources.credits_toggle
import com.velosobr.passarim.feature.detail.presentation.resources.fact_biomes
import com.velosobr.passarim.feature.detail.presentation.resources.fact_bullet
import com.velosobr.passarim.feature.detail.presentation.resources.fact_occurrence
import com.velosobr.passarim.feature.detail.presentation.resources.fact_size
import com.velosobr.passarim.feature.detail.presentation.resources.fact_size_value
import com.velosobr.passarim.feature.detail.presentation.resources.fact_states
import com.velosobr.passarim.feature.detail.presentation.resources.family
import com.velosobr.passarim.feature.detail.presentation.resources.section_about
import com.velosobr.passarim.feature.detail.presentation.resources.section_biome
import com.velosobr.passarim.feature.detail.presentation.resources.section_diet
import com.velosobr.passarim.feature.detail.presentation.resources.section_facts
import com.velosobr.passarim.feature.detail.presentation.resources.section_gallery
import com.velosobr.passarim.feature.detail.presentation.resources.section_song
import com.velosobr.passarim.feature.detail.presentation.resources.section_where
import com.velosobr.piuds.components.GalleryPhoto
import com.velosobr.piuds.components.PiuConservationBadge
import com.velosobr.piuds.components.PiuCreditCaption
import com.velosobr.piuds.components.PiuFactTile
import com.velosobr.piuds.components.PiuInfoChips
import com.velosobr.piuds.components.PiuLabeledChips
import com.velosobr.piuds.components.PiuPhotoGallery
import com.velosobr.piuds.theme.PiuDimens
import org.jetbrains.compose.resources.pluralStringResource
import org.jetbrains.compose.resources.stringResource

/**
 * A página rolável do Detalhe: foto do topo com o nome (DetailHero), cabeçalho, fatos, biomas,
 * dieta, canto, descrição, curiosidades, galeria, "Onde encontrar" e
 * créditos. Seções sem dado não aparecem. [mapContent] é um slot para o mapa,
 * para os snapshots trocarem o MapLibre por um desenho simples.
 * Quando a página rola, uma faixa da cor do fundo cobre a barra de status,
 * para o texto não passar por baixo do relógio.
 */
@Composable
internal fun DetailContent(
    detail: SpeciesDetail,
    state: DetailState,
    onAction: (DetailAction) -> Unit,
    mapContent: @Composable (List<Cluster>, Modifier) -> Unit,
    scrollState: ScrollState,
) {
    val credit = rememberCreditFormatter()
    Box {
        Column(Modifier.fillMaxSize().verticalScroll(scrollState).navigationBarsPadding()) {
            DetailHero(detail, state.isFavorite, onAction)
            Column(
                Modifier.padding(start = 20.dp, end = 20.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(24.dp),
            ) {
                Header(
                    detail,
                    detail.photos
                        .firstOrNull()
                        ?.credit
                        ?.let { stringResource(Res.string.credit_photo, credit(it)) },
                )
                Facts(detail)
                if (detail.biomes.isNotEmpty()) PiuLabeledChips(stringResource(Res.string.section_biome), detail.biomes.map { it.label })
                detail.diet?.let { Diet(it) }
                detail.audio?.let { Song(it, state.player, credit, onAction) }
                if (detail.description.isNotBlank()) {
                    Section(stringResource(Res.string.section_about)) {
                        Text(detail.description, style = MaterialTheme.typography.bodyMedium)
                        PiuCreditCaption(stringResource(Res.string.credit_text, credit(detail.descriptionCredit)))
                    }
                }
                if (detail.facts.isNotEmpty()) {
                    Section(stringResource(Res.string.section_facts)) {
                        detail.facts.forEach {
                            Text(
                                stringResource(Res.string.fact_bullet, it),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                }
                if (detail.photos.size > 1) {
                    Section(stringResource(Res.string.section_gallery)) {
                        PiuPhotoGallery(detail.photos.drop(1).map { GalleryPhoto(it.galleryUrl, credit(it.credit)) })
                    }
                }
                WhereToFindSection(detail.whereToFind, mapContent)
                Credits(detail, state.creditsExpanded, credit, onAction)
            }
        }
        if (scrollState.value > 0) {
            Box(Modifier.fillMaxWidth().windowInsetsTopHeight(WindowInsets.statusBars).background(MaterialTheme.colorScheme.surface))
        }
    }
}

/** A seção de dieta. */
@Composable
private fun Diet(diet: String) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            stringResource(Res.string.section_diet),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(diet, style = MaterialTheme.typography.bodyMedium)
    }
}

/** A seção do canto, com o player. */
@Composable
private fun Song(
    audio: Audio,
    playback: PlaybackState,
    credit: (Credit) -> String,
    onAction: (DetailAction) -> Unit,
) {
    Section(stringResource(Res.string.section_song)) {
        AudioPlayerCard(
            durationMs = audio.durationMs,
            peaks = audio.peaks,
            credit = stringResource(Res.string.credit_audio, credit(audio.credit)),
            playback = playback,
            onTogglePlay = { onAction(DetailAction.TogglePlay) },
            onSeek = { onAction(DetailAction.Seek(it)) },
        )
    }
}

/** "Onde encontrar": o mapa e as UFs; some se não houver nenhum dos dois. */
@Composable
private fun WhereToFindSection(
    where: WhereToFind,
    mapContent: @Composable (List<Cluster>, Modifier) -> Unit,
) {
    if (where.clusters.isEmpty() && where.states.isEmpty()) return
    Section(stringResource(Res.string.section_where)) {
        mapContent(where.clusters, Modifier)
        if (where.states.isNotEmpty()) PiuInfoChips(where.states)
    }
}

/**
 * O que vem logo abaixo da foto: o crédito dela, o selo de conservação e a família. O nome e o
 * nome científico ficam sobre a foto (DetailHero).
 */
@Composable
private fun Header(
    detail: SpeciesDetail,
    photoCredit: String?,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        photoCredit?.let { PiuCreditCaption(it) }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            detail.conservation?.let { PiuConservationBadge(it, Modifier.align(Alignment.CenterVertically)) }
            Text(
                stringResource(Res.string.family, detail.family),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.align(Alignment.CenterVertically),
            )
        }
    }
}

/**
 * Os blocos de fatos (tamanho, número de biomas e de UFs), lado a lado ou
 * empilhados com fonte grande. pluralStringResource escolhe "1 bioma" ou
 * "3 biomas" conforme o número.
 */
@Composable
private fun Facts(detail: SpeciesDetail) {
    val tiles =
        buildList {
            detail.sizeCm?.let { add(stringResource(Res.string.fact_size_value, it) to stringResource(Res.string.fact_size)) }
            val biomes = detail.biomes.size
            if (biomes > 0) add(pluralStringResource(Res.plurals.fact_biomes, biomes, biomes) to stringResource(Res.string.fact_occurrence))
            val states = detail.whereToFind.states.size
            if (states > 0) add(pluralStringResource(Res.plurals.fact_states, states, states) to stringResource(Res.string.fact_occurrence))
        }
    if (tiles.isEmpty()) return
    if (factsInSingleColumn(LocalDensity.current.fontScale)) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            tiles.forEach { (value, label) -> PiuFactTile(value, label, Modifier.fillMaxWidth()) }
        }
    } else {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            tiles.forEach { (value, label) -> PiuFactTile(value, label, Modifier.weight(1f)) }
        }
    }
}

/** Uma seção com título e conteúdo. */
@Composable
private fun Section(
    title: String,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
        content()
    }
}

/** O botão que abre e fecha a lista completa de créditos (fotos, numeradas quando há mais de uma, canto e texto). */
@Composable
private fun Credits(
    detail: SpeciesDetail,
    expanded: Boolean,
    credit: (Credit) -> String,
    onAction: (DetailAction) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        TextButton(onClick = { onAction(DetailAction.ToggleCredits) }, modifier = Modifier.heightIn(min = PiuDimens.touchTarget)) {
            Text(stringResource(Res.string.credits_toggle))
        }
        if (!expanded) return@Column
        val photos = detail.photos
        photos.forEachIndexed { index, photo ->
            val line =
                if (photos.size == 1) {
                    stringResource(Res.string.credit_photo, credit(photo.credit))
                } else {
                    stringResource(Res.string.credit_photo_numbered, index + 1, credit(photo.credit))
                }
            CreditEntry(line, photo.credit.sourceUrl, onAction)
        }
        detail.audio?.let { CreditEntry(stringResource(Res.string.credit_audio, credit(it.credit)), it.credit.sourceUrl, onAction) }
        CreditEntry(stringResource(Res.string.credit_text, credit(detail.descriptionCredit)), detail.descriptionCredit.sourceUrl, onAction)
    }
}

/** Uma linha de crédito, com o link para o original quando ele é seguro (https). */
@Composable
private fun CreditEntry(
    text: String,
    url: String?,
    onAction: (DetailAction) -> Unit,
) {
    Column {
        Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (url != null && isSafeLink(url)) {
            TextButton(
                onClick = { onAction(DetailAction.OpenCredit(url)) },
                modifier = Modifier.heightIn(min = PiuDimens.touchTarget),
            ) {
                Text(stringResource(Res.string.credit_open_source))
            }
        }
    }
}

/** Monta a função que escreve "autor · licença", com os textos traduzidos de "desconhecido". */
@Composable
private fun rememberCreditFormatter(): (Credit) -> String {
    val unknownAuthor = stringResource(Res.string.credit_unknown_author)
    val unknownLicense = stringResource(Res.string.credit_unknown_license)
    return { creditLine(it, unknownAuthor, unknownLicense) }
}
```

Crie `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailHero.kt`:

```kotlin
// O topo do Detalhe (prancheta Detalhe.dc.html, frente E): a foto de ponta a
// ponta, que vai até atrás da barra de status, o nome da ave em branco sobre
// o scrim na base da foto, uma faixa que funde a foto ao fundo da tela e os
// botões de voltar e de favoritar em círculos de vidro fosco por cima.

package com.velosobr.passarim.feature.detail.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconToggleButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.feature.detail.domain.SpeciesDetail
import com.velosobr.passarim.feature.detail.presentation.resources.Res
import com.velosobr.passarim.feature.detail.presentation.resources.back
import com.velosobr.piuds.components.PiuBlurState
import com.velosobr.piuds.components.PiuBlurSurface
import com.velosobr.piuds.components.PiuHeroPhoto
import com.velosobr.piuds.components.adult.photoTextScrim
import com.velosobr.piuds.components.piuBlurSource
import com.velosobr.piuds.components.rememberPiuBlurState
import com.velosobr.piuds.resources.favorite_add
import com.velosobr.piuds.resources.favorite_remove
import com.velosobr.piuds.resources.ic_arrow_back
import com.velosobr.piuds.resources.ic_favorite_filled
import com.velosobr.piuds.resources.ic_favorites
import com.velosobr.piuds.theme.PiuDimens
import com.velosobr.piuds.theme.PiuTheme
import org.jetbrains.compose.resources.stringResource
import org.jetbrains.compose.resources.vectorResource
import com.velosobr.piuds.resources.Res as DesignRes

/** A altura da foto de ponta a ponta do topo (prancheta Detalhe.dc.html). */
val HERO_HEIGHT = 430.dp

/** O gradiente atrás da foto de uma ave sem bioma principal (BFF antigo): o do Pantanal, como no mosaico. */
private val FallbackBiome = Biome.PANTANAL

/** A altura da faixa que funde a base da foto (já escurecida pelo scrim) à cor do fundo da tela. */
private val FadeHeight = 32.dp

/**
 * O topo: foto, nome e botões. A caixa tem no mínimo [HERO_HEIGHT]; com fonte grande, o nome
 * empurra a caixa para baixo em vez de ser cortado. A foto é a fonte do desfoque
 * (piuBlurSource): os botões desfocam o que está atrás deles. Ela fica numa camada à parte dos
 * botões porque uma superfície não pode desfocar a si mesma.
 *
 * O nome fica num bloco com o photoTextScrim, o degradê escuro do PiuDS que garante o contraste
 * do branco sobre qualquer foto (inclusive uma foto toda branca). Embaixo dele, uma faixa vai da
 * cor do scrim à cor do fundo do tema, e a foto se funde à página: no tema escuro a emenda some,
 * no claro vira uma transição curta do escuro para o claro.
 */
@Composable
internal fun DetailHero(
    detail: SpeciesDetail,
    isFavorite: Boolean,
    onAction: (DetailAction) -> Unit,
) {
    val blur = rememberPiuBlurState()
    val scrim = PiuTheme.tokens.scrim
    Box(Modifier.fillMaxWidth().heightIn(min = HERO_HEIGHT)) {
        PiuHeroPhoto(
            imageUrl = detail.photos.firstOrNull()?.heroUrl,
            biome = detail.primaryBiome ?: FallbackBiome,
            aspectRatio = null,
            modifier = Modifier.matchParentSize().piuBlurSource(blur),
        )
        Column(Modifier.align(Alignment.BottomStart).fillMaxWidth()) {
            // Guarda o lugar da barra de status e dos botões: um nome longo nunca sobe para baixo deles.
            Spacer(Modifier.statusBarsPadding().height(PiuDimens.touchTarget + 32.dp))
            Column(
                Modifier
                    .fillMaxWidth()
                    .photoTextScrim(scrim, fade = 48.dp)
                    .padding(start = 20.dp, end = 20.dp, top = 56.dp, bottom = 8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    detail.commonName,
                    style = MaterialTheme.typography.headlineLarge,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color.White,
                )
                Text(
                    detail.scientificName,
                    style = MaterialTheme.typography.bodyLarge,
                    fontStyle = FontStyle.Italic,
                    color = Color.White.copy(alpha = 0.9f),
                )
            }
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(FadeHeight)
                    .background(Brush.verticalGradient(listOf(scrim, MaterialTheme.colorScheme.background))),
            )
        }
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            BackButton(blur, onBack = { onAction(DetailAction.Back) })
            FavoriteButton(blur, detail.commonName, isFavorite, onToggle = { onAction(DetailAction.ToggleFavorite) })
        }
    }
}

/**
 * O botão de voltar: um círculo de vidro fosco de 48 dp (PiuBlurSurface) com a tinta translúcida
 * da superfície do tema, que dá contraste ao ícone mesmo onde o desfoque não roda.
 */
@Composable
internal fun BackButton(
    blur: PiuBlurState,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    GlassCircle(blur, modifier) {
        IconButton(onClick = onBack, modifier = Modifier.size(PiuDimens.touchTarget)) {
            Icon(vectorResource(DesignRes.drawable.ic_arrow_back), contentDescription = stringResource(Res.string.back))
        }
    }
}

/**
 * O coração: IconToggleButton é um botão de liga/desliga, então o leitor de tela anuncia se a ave
 * já está nos favoritos, e a descrição diz o que o toque vai fazer ("Favoritar Tuiuiú").
 */
@Composable
private fun FavoriteButton(
    blur: PiuBlurState,
    name: String,
    isFavorite: Boolean,
    onToggle: () -> Unit,
) {
    GlassCircle(blur) {
        IconToggleButton(checked = isFavorite, onCheckedChange = { onToggle() }, modifier = Modifier.size(PiuDimens.touchTarget)) {
            Icon(
                vectorResource(if (isFavorite) DesignRes.drawable.ic_favorite_filled else DesignRes.drawable.ic_favorites),
                contentDescription =
                    stringResource(
                        if (isFavorite) DesignRes.string.favorite_remove else DesignRes.string.favorite_add,
                        name,
                    ),
                tint = if (isFavorite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

/** O círculo de vidro fosco de 48 dp que os dois botões usam. */
@Composable
private fun GlassCircle(
    blur: PiuBlurState,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    PiuBlurSurface(
        state = blur,
        shape = CircleShape,
        tint = MaterialTheme.colorScheme.surface.copy(alpha = 0.6f),
        modifier = modifier.size(PiuDimens.touchTarget),
    ) { content() }
}
```

Substitua o conteúdo de `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailScreen.kt`:

```kotlin
// A tela de Detalhe: escolhe o que mostrar em cada fase (carregando,
// conteúdo, não encontrada ou erro).

package com.velosobr.passarim.feature.detail.presentation

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.presentation.ScreenError
import com.velosobr.passarim.feature.detail.domain.Cluster
import com.velosobr.passarim.feature.detail.presentation.resources.Res
import com.velosobr.passarim.feature.detail.presentation.resources.back
import com.velosobr.passarim.feature.detail.presentation.resources.error_generic_body
import com.velosobr.passarim.feature.detail.presentation.resources.error_generic_title
import com.velosobr.passarim.feature.detail.presentation.resources.error_no_connection_body
import com.velosobr.passarim.feature.detail.presentation.resources.error_no_connection_title
import com.velosobr.passarim.feature.detail.presentation.resources.error_rate_limited_body
import com.velosobr.passarim.feature.detail.presentation.resources.error_rate_limited_title
import com.velosobr.passarim.feature.detail.presentation.resources.error_server_body
import com.velosobr.passarim.feature.detail.presentation.resources.error_server_title
import com.velosobr.passarim.feature.detail.presentation.resources.not_found_action
import com.velosobr.passarim.feature.detail.presentation.resources.not_found_body
import com.velosobr.passarim.feature.detail.presentation.resources.not_found_title
import com.velosobr.passarim.feature.detail.presentation.resources.retry
import com.velosobr.piuds.components.PiuSkeletonBox
import com.velosobr.piuds.components.PiuStateScreen
import com.velosobr.piuds.components.StateTone
import com.velosobr.piuds.components.piuBlurSource
import com.velosobr.piuds.components.rememberPiuBlurState
import com.velosobr.piuds.resources.ic_arrow_back
import com.velosobr.piuds.resources.ic_bird
import com.velosobr.piuds.resources.ic_cloud_off
import com.velosobr.piuds.resources.ic_wifi_off
import com.velosobr.piuds.theme.PiuDimens
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.painterResource
import org.jetbrains.compose.resources.stringResource
import org.jetbrains.compose.resources.vectorResource
import com.velosobr.piuds.resources.Res as DesignRes

/**
 * A tela sem estado próprio: tudo vem de [state] e cada interação vira uma
 * [DetailAction]. [mapContent] tem o mapa de verdade como padrão; os snapshots
 * passam outro.
 */
@Composable
fun DetailScreen(
    state: DetailState,
    onAction: (DetailAction) -> Unit,
    mapContent: @Composable (List<Cluster>, Modifier) -> Unit = { clusters, modifier -> SpeciesMap(clusters, modifier) },
    scrollState: ScrollState = rememberScrollState(),
) {
    when (val phase = state.phase) {
        DetailPhase.Loading -> DetailSkeleton(onBack = { onAction(DetailAction.Back) })
        is DetailPhase.Content -> DetailContent(phase.detail, state, onAction, mapContent, scrollState)
        DetailPhase.NotFound ->
            StatePage(onBack = { onAction(DetailAction.Back) }) {
                PiuStateScreen(
                    icon = painterResource(DesignRes.drawable.ic_bird),
                    title = stringResource(Res.string.not_found_title),
                    body = stringResource(Res.string.not_found_body),
                ) {
                    Button(onClick = { onAction(DetailAction.Back) }, modifier = Modifier.height(PiuDimens.touchTarget)) {
                        Text(stringResource(Res.string.not_found_action))
                    }
                }
            }
        is DetailPhase.Error -> {
            val copy = phase.error.copy()
            StatePage(onBack = { onAction(DetailAction.Back) }) {
                PiuStateScreen(
                    icon = painterResource(copy.icon),
                    title = stringResource(copy.title),
                    body = stringResource(copy.body),
                    tone = StateTone.Error,
                ) {
                    Button(
                        onClick = { onAction(DetailAction.Retry) },
                        enabled = state.retryEnabled,
                        modifier = Modifier.height(PiuDimens.touchTarget),
                    ) { Text(stringResource(Res.string.retry)) }
                }
            }
        }
    }
}

/**
 * O "esqueleto" do carregamento, já com o botão de voltar funcionando, no mesmo lugar e no mesmo
 * círculo de vidro do conteúdo. O bloco cinza do topo é a fonte do desfoque do botão.
 */
@Composable
private fun DetailSkeleton(onBack: () -> Unit) {
    val blur = rememberPiuBlurState()
    Column(Modifier.fillMaxSize()) {
        Box {
            PiuSkeletonBox(Modifier.fillMaxWidth().height(HERO_HEIGHT).piuBlurSource(blur), shape = RectangleShape)
            BackButton(blur, onBack, Modifier.statusBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp))
        }
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            PiuSkeletonBox(Modifier.width(250.dp).height(32.dp))
            PiuSkeletonBox(Modifier.width(180.dp).height(18.dp))
            PiuSkeletonBox(Modifier.width(125.dp).height(24.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                repeat(3) { PiuSkeletonBox(Modifier.weight(1f).height(64.dp)) }
            }
            PiuSkeletonBox(Modifier.fillMaxWidth().height(72.dp))
            PiuSkeletonBox(Modifier.fillMaxWidth().height(14.dp))
            PiuSkeletonBox(Modifier.fillMaxWidth().height(14.dp))
            PiuSkeletonBox(Modifier.width(285.dp).height(14.dp))
        }
    }
}

/** Página das telas de estado (não encontrada, erro), com o botão de voltar no topo. */
@Composable
private fun StatePage(
    onBack: () -> Unit,
    content: @Composable () -> Unit,
) {
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        IconButton(onClick = onBack, modifier = Modifier.padding(8.dp)) {
            Icon(vectorResource(DesignRes.drawable.ic_arrow_back), contentDescription = stringResource(Res.string.back))
        }
        Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
            Box(Modifier.verticalScroll(rememberScrollState()).padding(vertical = 24.dp)) { content() }
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :feature:detail:presentation:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Snapshots**

Substitua o conteúdo de `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/DetailSnapshotTest.kt`:

```kotlin
// Snapshots da tela de Detalhe.

package com.velosobr.passarim.snapshots

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalInspectionMode
import coil3.ColorImage
import coil3.annotation.ExperimentalCoilApi
import coil3.compose.AsyncImagePreviewHandler
import coil3.compose.LocalAsyncImagePreviewHandler
import com.velosobr.passarim.core.domain.ConservationStatus
import com.velosobr.passarim.core.domain.Credit
import com.velosobr.passarim.core.presentation.ScreenError
import com.velosobr.passarim.feature.detail.domain.Audio
import com.velosobr.passarim.feature.detail.domain.Biome
import com.velosobr.passarim.feature.detail.domain.Cluster
import com.velosobr.passarim.feature.detail.domain.Photo
import com.velosobr.passarim.feature.detail.domain.PlaybackState
import com.velosobr.passarim.feature.detail.domain.SpeciesDetail
import com.velosobr.passarim.feature.detail.domain.WhereToFind
import com.velosobr.passarim.feature.detail.presentation.DetailPhase
import com.velosobr.passarim.feature.detail.presentation.DetailScreen
import com.velosobr.passarim.feature.detail.presentation.DetailState
import com.velosobr.passarim.feature.detail.presentation.MAP_HEIGHT
import com.velosobr.passarim.feature.detail.presentation.MapAttribution
import org.junit.Test
import com.velosobr.passarim.core.domain.Biome as PrimaryBiome

/**
 * O Detalhe completo (topo, meio e fim, com créditos abertos e o canto pausado), o player com e
 * sem os picos da forma de onda, sem canto, sem foto (o gradiente do bioma), carregando, não
 * encontrado e com erro. O mapa entra como um desenho simples, porque o MapLibre não desenha no
 * Paparazzi. A foto é uma imagem toda branca, o pior caso para o nome em branco sobre ela: o Coil,
 * em modo de inspeção (LocalInspectionMode), pede a imagem ao AsyncImagePreviewHandler em vez de
 * baixar.
 */
class DetailSnapshotTest(
    dark: Boolean,
    fontScalePercent: Int,
) : ThemedSnapshotTest(dark, fontScalePercent) {
    private val photoCredit = Credit("(c) Paul Donahue", "CC BY-NC", "inaturalist", "https://www.inaturalist.org/observations/87436377")

    private val arara =
        SpeciesDetail(
            id = "anodorhynchus-hyacinthinus",
            commonName = "Arara-azul-grande",
            scientificName = "Anodorhynchus hyacinthinus",
            family = "Psittacidae",
            conservation = ConservationStatus.VU,
            sizeCm = 100,
            diet = "Sementes duras de palmeiras, como coco-de-urucuri e coco-de-espinho, quebradas com a força do bico.",
            description =
                "A arara-azul-grande é a maior espécie de arara do mundo, com plumagem azul-cobalto intensa e um anel " +
                    "amarelo ao redor dos olhos e na base do bico.",
            descriptionCredit = Credit("Equipe Passarim", "CC BY 4.0", "curated", "https://pt.wikipedia.org/wiki/Arara-azul-grande"),
            facts =
                listOf(
                    "Formam casais monogâmicos que permanecem juntos durante toda a vida.",
                    "Já foram registradas usando folhas mastigadas como ferramentas.",
                ),
            biomes = listOf(Biome("amazonia", "Amazônia"), Biome("cerrado", "Cerrado"), Biome("pantanal", "Pantanal")),
            photos =
                listOf(
                    Photo(null, null, "foto-branca", photoCredit),
                    Photo(null, null, null, Credit("(c) Jéssica Martins", "CC BY-NC-SA", "inaturalist", null)),
                    Photo(null, null, null, Credit(null, "CC0", "inaturalist", null)),
                ),
            audio =
                Audio(
                    "https://media/arara.aac",
                    31_000,
                    Credit("Jayrson Araujo de Oliveira", "CC BY-NC-SA", "xeno-canto", null),
                    peaks = PEAKS,
                ),
            whereToFind =
                WhereToFind(
                    states = listOf("AM", "BA", "GO", "MA", "MG", "MS", "MT", "PA", "PI", "TO"),
                    biomes = listOf("amazonia", "cerrado", "pantanal"),
                    clusters = listOf(Cluster(-19.6, -56.4, 197)),
                ),
            primaryBiome = PrimaryBiome.PANTANAL,
        )

    private val complete =
        DetailState(phase = DetailPhase.Content(arara), isFavorite = true, player = PlaybackState.Paused(12_000), creditsExpanded = true)

    @OptIn(ExperimentalCoilApi::class)
    private fun screen(
        name: String,
        state: DetailState,
        scrollPx: Int = 0,
    ) = snap(name) {
        CompositionLocalProvider(
            LocalInspectionMode provides true,
            LocalAsyncImagePreviewHandler provides AsyncImagePreviewHandler { ColorImage(Color.White.toArgb()) },
        ) {
            DetailScreen(
                state = state,
                onAction = {},
                mapContent = { _, modifier -> MapPlaceholder(modifier) },
                scrollState = ScrollState(scrollPx),
            )
        }
    }

    @Test
    fun completeTop() = screen("detail-complete-top", complete)

    @Test
    fun completeMiddle() = screen("detail-complete-middle", complete, scrollPx = MIDDLE_PX)

    @Test
    fun completeBottom() = screen("detail-complete-bottom", complete, scrollPx = Int.MAX_VALUE)

    /** O player com os 64 picos: a parte já tocada (12 de 31 s) na cor primária. */
    @Test
    fun player() = screen("detail-player", complete, scrollPx = PLAYER_PX)

    /** Sem picos (BFF antigo ou canto sem processar): a forma de onda é uma linha reta. */
    @Test
    fun playerWithoutPeaks() =
        screen(
            "detail-player-without-peaks",
            complete.copy(phase = DetailPhase.Content(arara.copy(audio = arara.audio?.copy(peaks = emptyList())))),
            scrollPx = PLAYER_PX,
        )

    @Test
    fun withoutAudio() = screen("detail-without-audio", DetailState(phase = DetailPhase.Content(arara.copy(audio = null))), MIDDLE_PX)

    @Test
    fun withoutPhoto() =
        screen(
            "detail-without-photo",
            DetailState(
                phase =
                    DetailPhase.Content(
                        arara.copy(photos = emptyList(), conservation = null, sizeCm = null, diet = null, facts = emptyList()),
                    ),
                player = PlaybackState.Error,
            ),
        )

    @Test
    fun loading() = screen("detail-loading", DetailState(phase = DetailPhase.Loading))

    @Test
    fun notFound() = screen("detail-not-found", DetailState(phase = DetailPhase.NotFound))

    @Test
    fun errorServer() = screen("detail-error-server", DetailState(phase = DetailPhase.Error(ScreenError.ServiceUnavailable)))
}

/** Rolagem, em pixels, até o meio da página, para fotografar as seções de baixo. */
private const val MIDDLE_PX = 2_200

/** Rolagem, em pixels, que deixa o player do canto no meio da tela. */
private const val PLAYER_PX = 1_000

/**
 * 64 picos de exemplo, no desenho da prancheta (alturas de 10 a 32 de 32, repetidas): o suficiente
 * para a forma de onda ter altos e baixos.
 */
private val PEAKS =
    listOf(10, 18, 26, 14, 30, 22, 12, 28, 20, 32, 16, 24, 30, 12, 20, 28, 14, 22, 18, 26, 10, 20, 14, 24, 18, 12, 16, 10)
        .let { heights -> List(64) { heights[it % heights.size] / 32f } }

/** Um retângulo com a atribuição no lugar do mapa, do mesmo tamanho dele. */
@Composable
private fun MapPlaceholder(modifier: Modifier) {
    Box(
        modifier
            .fillMaxWidth()
            .height(MAP_HEIGHT)
            .clip(MaterialTheme.shapes.small)
            .background(MaterialTheme.colorScheme.surfaceVariant),
    ) {
        MapAttribution(Modifier.align(Alignment.BottomStart))
    }
}
```

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*DetailSnapshotTest*' --tests '*DetailComponentsSnapshotTest*'`

Expected: 12 imagens novas e 42 regravadas em `snapshots/src/test/snapshots/images/`. Abra cada uma e confira a 1.0×, 1.3× e 2.0×, no claro e no escuro: a foto branca de ponta a ponta, o nome legível sobre o scrim, os botões de vidro no alto e os fatos com raio de 20 dp; nada cortado.

- [ ] **Step 6: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:detail:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m 'feat: Detalhe com a foto de ponta a ponta, o nome sobre ela e os botões de vidro'
```

### Task 6: Guarda: o `autoPlay` da rota do Detalhe é a chave que o ViewModel lê

O E1 já tinha a rota com `autoPlay`, o ViewModel e o teste do ViewModel. Faltava a guarda de que o nome do campo da rota é a chave que o ViewModel lê do `SavedStateHandle`: o Navigation Compose põe cada campo com o nome dele, e um renomear sozinho faria o argumento chegar vazio sem nenhum erro.

**Files:**
- Test: `app/src/commonTest/kotlin/com/velosobr/passarim/app/navigation/RoutesTest.kt`

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `app/src/commonTest/kotlin/com/velosobr/passarim/app/navigation/RoutesTest.kt`:

```kotlin
// Teste das rotas: os nomes dos argumentos do Detalhe (o id e o autoPlay) são
// as chaves que o ViewModel lê do SavedStateHandle. O Navigation Compose põe
// cada campo da rota no SavedStateHandle com o nome do campo; se um dos dois
// mudar sozinho, o argumento chega vazio e nada avisa.

package com.velosobr.passarim.app.navigation

import assertk.assertThat
import assertk.assertions.isEqualTo
import com.velosobr.passarim.feature.detail.presentation.KEY_AUTO_PLAY
import com.velosobr.passarim.feature.detail.presentation.KEY_SPECIES_ID
import kotlin.test.Test

class RoutesTest {
    @Test
    fun `o argumento da rota do Detalhe e a chave que o ViewModel le`() {
        assertThat(DetailRoute::id.name).isEqualTo(KEY_SPECIES_ID)
    }

    @Test
    fun `o autoPlay da rota do Detalhe e a chave que o ViewModel le`() {
        assertThat(DetailRoute::autoPlay.name).isEqualTo(KEY_AUTO_PLAY)
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :app:testAndroidHostTest`

Expected: é um teste de guarda: passa de primeira (`BUILD SUCCESSFUL`), porque o E1 já usa o mesmo nome. Ele falha se alguém renomear o campo da rota ou a constante sozinho.

- [ ] **Step 3: Rodar e ver passar**

Run: `./gradlew :app:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 4: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :app:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m 'test: o autoPlay da rota do Detalhe usa a chave que o ViewModel lê'
```

### Task 7: A foto do card do mosaico viaja até o topo do Detalhe

Ao abrir uma ave pelo mosaico, a foto do card cresce até o topo do Detalhe, e volta ao card no "voltar" (spec, seção 6). É um elemento compartilhado do Compose: `PiuSharedTransitionLayout` (o `SharedTransitionLayout`) em volta do NavHost da raiz, `PiuSharedScope` com o escopo de animação de cada rota (as abas herdam o da rota delas) e `Modifier.piuSharedPhoto(key)` na foto das duas pontas, com a chave `foto-<id>`. Usa `sharedBounds`, porque o card mostra a miniatura e o Detalhe a foto grande. Com "reduzir animações", ou fora dessa estrutura (prévias e snapshots), nada viaja.

**Files:**
- Modify: `app/src/commonMain/kotlin/com/velosobr/passarim/app/App.kt`
- Create (test): `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuSharedPhotoTest.kt`
- Modify: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuHeroPhoto.kt`
- Create: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuSharedPhoto.kt`
- Modify: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PiuMosaicCard.kt`
- Create: `core/presentation/src/commonMain/kotlin/com/velosobr/passarim/core/presentation/SharedPhotoKey.kt`
- Create (test): `core/presentation/src/commonTest/kotlin/com/velosobr/passarim/core/presentation/SharedPhotoKeyTest.kt`
- Modify: `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailHero.kt`
- Modify: `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreMosaic.kt`

**Interfaces:**
- Produz (PiuDS): `PiuSharedTransitionLayout(modifier, content)`, `PiuSharedScope(scope, content)` e `fun Modifier.piuSharedPhoto(key: String?, shape: Shape = RectangleShape)`.
- Produz (`core:presentation`): `fun speciesPhotoKey(id: String): String` (`foto-<id>`).
- Muda: `PiuHeroPhoto(..., sharedPhotoKey)` e `PiuMosaicCard(..., sharedPhotoKey)`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuSharedPhotoTest.kt`:

```kotlin
// Testes da foto que viaja entre duas telas (frente E, seção 6): com a camada
// de transição e o escopo de animação, a foto do card cresce aos poucos até o
// tamanho do topo do Detalhe; com "reduzir animações" ou sem a camada, ela
// não viaja.

package com.velosobr.piuds

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import com.velosobr.piuds.components.PiuSharedScope
import com.velosobr.piuds.components.PiuSharedTransitionLayout
import com.velosobr.piuds.components.piuSharedPhoto
import com.velosobr.piuds.theme.LocalPiuReduceMotion
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w411dp-h891dp")
class PiuSharedPhotoTest {
    /** Abre o "Detalhe" no meio do teste. */
    private var detail by mutableStateOf(false)

    /**
     * Duas telas trocadas por AnimatedContent (o mesmo que o NavHost usa por dentro): um card de
     * 100 dp e um topo de 430 dp de altura, os dois com a foto da chave "foto-1". AnimatedContent
     * dá a cada tela um escopo de animação, que o PiuSharedScope entrega à foto. A troca é só um
     * esmaecer, sem animar o tamanho (SizeTransform nulo) e numa área do tamanho da tela: assim,
     * só a foto compartilhada muda de tamanho no meio da troca.
     */
    @Composable
    private fun TwoScreens() {
        PiuSharedTransitionLayout {
            AnimatedContent(
                targetState = detail,
                modifier = Modifier.fillMaxSize(),
                transitionSpec = { (fadeIn() togetherWith fadeOut()).using(null) },
            ) { showDetail ->
                PiuSharedScope(this) {
                    if (showDetail) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .height(430.dp)
                                .piuSharedPhoto("foto-1")
                                .background(Color.Blue)
                                .testTag("hero"),
                        )
                    } else {
                        Box(
                            Modifier
                                .offset(
                                    40.dp,
                                    300.dp,
                                ).size(100.dp)
                                .piuSharedPhoto("foto-1")
                                .background(Color.Red)
                                .testTag("card")
                                .clickable {
                                    detail =
                                        true
                                },
                        )
                    }
                }
            }
        }
    }

    /**
     * Onde o topo do Detalhe começa (a borda de cima, em pixels), quadro a quadro, depois de tocar
     * no card. O card começa 300 dp abaixo do topo da tela; o topo do Detalhe, no 0.
     */
    private fun heroTopsAfterOpening(reduceMotion: Boolean): List<Float> {
        val tops = mutableListOf<Float>()
        runComposeUiTest {
            mainClock.autoAdvance = false
            setContent {
                CompositionLocalProvider(LocalPiuReduceMotion provides reduceMotion) { PiuTheme { TwoScreens() } }
            }
            mainClock.advanceTimeBy(1_000)
            onNodeWithTag("card").performClick()
            repeat(40) {
                mainClock.advanceTimeByFrame()
                onAllNodes(hasTestTag("hero")).fetchSemanticsNodes().forEach { tops += it.boundsInRoot.top }
            }
        }
        return tops
    }

    @Test
    fun `a foto sai do card e sobe aos poucos ate o topo do detalhe`() {
        // Em algum quadro, a foto está no meio do caminho entre o card e o topo: ela viajou.
        // No Robolectric a densidade padrão é 1, então pixels e dp coincidem.
        assertThat(heroTopsAfterOpening(reduceMotion = false).any { it > 20 && it < 280 }).isTrue()
    }

    @Test
    fun `com reduzir animacoes a foto nao viaja`() {
        assertThat(heroTopsAfterOpening(reduceMotion = true).any { it > 20 && it < 280 }).isFalse()
    }

    @Test
    fun `sem a camada de transicao a foto fica no lugar dela`() =
        runComposeUiTest {
            setContent { PiuTheme { Box(Modifier.size(100.dp).piuSharedPhoto("foto-1").testTag("solo")) } }
            assertThat(onNodeWithTag("solo").fetchSemanticsNode().boundsInRoot.width).isEqualTo(100f)
        }
}
```

Crie `core/presentation/src/commonTest/kotlin/com/velosobr/passarim/core/presentation/SharedPhotoKeyTest.kt`:

```kotlin
// Teste da chave que liga a foto do card à foto do topo do Detalhe.

package com.velosobr.passarim.core.presentation

import assertk.assertThat
import assertk.assertions.isEqualTo
import kotlin.test.Test

class SharedPhotoKeyTest {
    @Test
    fun `a chave da foto compartilhada e foto mais o id da ave`() {
        assertThat(speciesPhotoKey("jabiru-mycteria")).isEqualTo("foto-jabiru-mycteria")
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew --continue :core:piu-ds:testAndroidHostTest :core:presentation:testAndroidHostTest`

Expected: FAIL na compilação: em `PiuSharedPhotoTest`, `Unresolved reference 'PiuSharedTransitionLayout'`, `'PiuSharedScope'` e `'piuSharedPhoto'`; em `SharedPhotoKeyTest`, `Unresolved reference 'speciesPhotoKey'`.

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `app/src/commonMain/kotlin/com/velosobr/passarim/app/App.kt`:

```kotlin
// A raiz do app: tema, carregador de imagens e a navegação de primeiro nível.

package com.velosobr.passarim.app

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.dropUnlessResumed
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import coil3.ImageLoader
import coil3.compose.setSingletonImageLoaderFactory
import com.velosobr.passarim.app.navigation.AboutRoute
import com.velosobr.passarim.app.navigation.DetailRoute
import com.velosobr.passarim.app.navigation.LicensesRoute
import com.velosobr.passarim.app.navigation.StorageRoute
import com.velosobr.passarim.app.navigation.TabsRoute
import com.velosobr.passarim.app.tabs.TabsScreen
import com.velosobr.passarim.app.theme.SystemBarsAppearance
import com.velosobr.passarim.core.domain.SettingsRepository
import com.velosobr.passarim.feature.detail.presentation.DetailRoot
import com.velosobr.passarim.feature.settings.presentation.AboutRoot
import com.velosobr.passarim.feature.settings.presentation.LicensesRoot
import com.velosobr.passarim.feature.settings.presentation.StorageRoot
import com.velosobr.piuds.components.PiuSharedScope
import com.velosobr.piuds.components.PiuSharedTransitionLayout
import com.velosobr.piuds.theme.PiuTheme
import com.velosobr.piuds.theme.isDark
import org.koin.compose.koinInject

/**
 * O app inteiro, chamado pelo Android (MainActivity) e pelo iOS
 * (MainViewController). Espera as configurações do DataStore antes de
 * desenhar, para a primeira tela já sair no tema certo; [onSettingsLoaded]
 * avisa a plataforma (o Android segura o splash até lá).
 *
 * koinInject pega uma peça do Koin dentro de uma função @Composable.
 * collectAsState transforma o Flow das configurações num estado que, ao
 * mudar, recompõe a tela; remember guarda o Flow entre recomposições.
 * LaunchedEffect(Unit) roda o bloco uma vez quando a função entra na
 * composição. setSingletonImageLoaderFactory entrega o ImageLoader do Koin a
 * todo AsyncImage do app.
 */
@Composable
fun App(onSettingsLoaded: () -> Unit = {}) {
    val imageLoader = koinInject<ImageLoader>()
    setSingletonImageLoaderFactory { imageLoader }
    val settingsRepository = koinInject<SettingsRepository>()
    val settings by remember(settingsRepository) { settingsRepository.observe() }.collectAsState(initial = null)
    val loaded = settings ?: return
    LaunchedEffect(Unit) { onSettingsLoaded() }
    val darkTheme = loaded.theme.isDark(isSystemInDarkTheme())
    // TODO(frente-D): com a jornada ligada, as barras do sistema devem seguir o PiuTheme.isDark (o Kids é
    // sempre claro); hoje elas seguem só a preferência do adulto.
    SystemBarsAppearance(darkTheme)
    PiuTheme(themeMode = loaded.theme, dynamicColor = loaded.dynamicColors) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            AppNavHost()
        }
    }
}

/**
 * Navegação de primeiro nível: as abas e as telas que abrem por cima delas.
 * Cada rota é uma classe @Serializable (Routes.kt), e os argumentos (o id da
 * espécie) vão nela. dropUnlessResumed só executa o "voltar" com a tela em
 * RESUMED; durante uma transição (entrando ou saindo) o toque é ignorado, o
 * que evita voltar duas vezes com toques rápidos. Os
 * blocos de rota só ligam as telas: os efeitos ficam dentro delas.
 *
 * PiuSharedTransitionLayout em volta do NavHost deixa a foto do card do
 * mosaico viajar até o topo do Detalhe. Cada bloco de rota passa o próprio
 * escopo de animação (o `this` de composable { }) com PiuSharedScope; as
 * abas, que têm o NavHost delas, usam o escopo da rota das abas daqui.
 */
@Composable
private fun AppNavHost() {
    val rootNav = rememberNavController()
    PiuSharedTransitionLayout {
        NavHost(rootNav, startDestination = TabsRoute) {
            composable<TabsRoute> {
                PiuSharedScope(this) {
                    TabsScreen(
                        onOpenDetail = { id, autoPlay -> rootNav.navigate(DetailRoute(id, autoPlay)) },
                        onOpenStorage = { rootNav.navigate(StorageRoute) },
                        onOpenAbout = { rootNav.navigate(AboutRoute) },
                    )
                }
            }
            composable<DetailRoute> {
                PiuSharedScope(this) { DetailRoot(onBack = dropUnlessResumed { rootNav.popBackStack() }) }
            }
            composable<StorageRoute> {
                StorageRoot(onBack = dropUnlessResumed { rootNav.popBackStack() })
            }
            composable<AboutRoute> {
                AboutRoot(
                    onBack = dropUnlessResumed { rootNav.popBackStack() },
                    onOpenLicenses = { rootNav.navigate(LicensesRoute) },
                )
            }
            composable<LicensesRoute> {
                LicensesRoot(onBack = dropUnlessResumed { rootNav.popBackStack() })
            }
        }
    }
}
```

Substitua o conteúdo de `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuHeroPhoto.kt`:

```kotlin
// Foto grande do topo do Detalhe e o botão redondo que fica sobre ela.

package com.velosobr.piuds.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.piuds.theme.PiuDimens
import com.velosobr.piuds.theme.PiuTheme
import com.velosobr.piuds.theme.toBrush

/** Proporção largura:altura da foto do topo. */
private const val HERO_ASPECT_RATIO = 1.3f

/**
 * A foto do topo, com o placeholder por baixo enquanto ela carrega (ou se não
 * houver). [overlay] é um "slot": um bloco @Composable que quem chama passa
 * para desenhar por cima (os botões de voltar e favoritar). AsyncImage é o
 * componente do Coil que baixa e mostra a imagem; ContentScale.Crop preenche o
 * espaço cortando as bordas.
 *
 * Com [biome], o fundo enquanto a foto não chega (ou sem foto) é o gradiente
 * do bioma, como nos cards do mosaico, no lugar do placeholder com o
 * passarinho. Com [aspectRatio] nulo, a altura vem do [modifier] (o Detalhe
 * usa uma altura fixa e faz a foto ocupar o espaço todo). Com
 * [sharedPhotoKey], a foto chega voando do card com a mesma chave (veja
 * PiuSharedPhoto.kt).
 */
@Composable
fun PiuHeroPhoto(
    imageUrl: String?,
    modifier: Modifier = Modifier,
    biome: Biome? = null,
    aspectRatio: Float? = HERO_ASPECT_RATIO,
    sharedPhotoKey: String? = null,
    overlay: @Composable BoxScope.() -> Unit = {},
) {
    Box(modifier.fillMaxWidth().then(if (aspectRatio != null) Modifier.aspectRatio(aspectRatio) else Modifier)) {
        // A camada da foto (fundo e imagem) é a que viaja do card; o overlay fica fora dela.
        Box(Modifier.matchParentSize().piuSharedPhoto(sharedPhotoKey)) {
            if (biome != null) {
                Box(
                    Modifier.fillMaxSize().background(
                        PiuTheme.tokens.gradients
                            .getValue(biome)
                            .toBrush(),
                    ),
                )
            } else {
                PhotoPlaceholder(iconSize = 96.dp)
            }
            if (imageUrl != null) {
                AsyncImage(model = imageUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            }
        }
        overlay()
    }
}

/** Botão redondo e translúcido para ficar legível sobre qualquer foto, com área de toque de 48dp. */
@Composable
fun PiuHeroIconButton(
    icon: Painter,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tint: Color = MaterialTheme.colorScheme.onSurface,
) {
    IconButton(onClick = onClick, modifier = modifier.size(PiuDimens.touchTarget)) {
        Box(
            Modifier.size(40.dp).background(MaterialTheme.colorScheme.surface.copy(alpha = 0.85f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = contentDescription, tint = tint)
        }
    }
}
```

Crie `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuSharedPhoto.kt`:

```kotlin
// A foto que viaja de uma tela para outra (frente E, seção 6): ao abrir o
// Detalhe, a foto do card do mosaico cresce até o topo do Detalhe, e volta ao
// card no "voltar". É um "elemento compartilhado" do Compose: duas peças, uma
// em cada tela, com a mesma chave; durante a troca de tela, o Compose anima
// os limites de uma até a outra.
//
// O app liga as peças: PiuSharedTransitionLayout em volta da navegação e
// PiuSharedScope em cada tela; os componentes só marcam a foto com
// piuSharedPhoto e uma chave. Com "reduzir animações" ligado, ou fora dessa
// estrutura (prévias e snapshots), nada viaja e a troca de tela é a comum.
// Os dois CompositionLocals e as três funções ficam juntos neste arquivo, por
// isso o detekt não cobra um arquivo com o nome de cada declaração.
@file:Suppress("MatchingDeclarationName")
@file:OptIn(ExperimentalSharedTransitionApi::class)

package com.velosobr.piuds.components

import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.Shape
import com.velosobr.piuds.theme.PiuTheme

/**
 * A camada que desenha a foto enquanto ela viaja. compositionLocalOf é um valor que desce pela
 * árvore de composição sem passar de parâmetro em parâmetro: quem está dentro de
 * PiuSharedTransitionLayout o lê; fora dela, é nulo.
 */
private val LocalPiuSharedTransition = compositionLocalOf<SharedTransitionScope?> { null }

/**
 * O escopo de animação da tela atual (entrando ou saindo). É ele que diz ao Compose em que ponto
 * da troca de tela a foto está.
 */
private val LocalPiuSharedVisibility = compositionLocalOf<AnimatedVisibilityScope?> { null }

/**
 * Envolve a navegação (o NavHost da raiz) para as fotos poderem viajar entre as telas dela.
 * SharedTransitionLayout é a camada do Compose que acompanha os elementos compartilhados e os
 * desenha por cima de tudo durante a troca.
 */
@Composable
fun PiuSharedTransitionLayout(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    SharedTransitionLayout(modifier) {
        CompositionLocalProvider(LocalPiuSharedTransition provides this) { content() }
    }
}

/**
 * Entrega às fotos de uma tela o [scope] de animação dela: no NavHost, o `this` de cada
 * `composable<Rota> { }`. As telas de dentro de outro NavHost (as abas) herdam o escopo da tela
 * da raiz que as contém, e é isso que deixa a foto atravessar dos dois NavHosts.
 */
@Composable
fun PiuSharedScope(
    scope: AnimatedVisibilityScope,
    content: @Composable () -> Unit,
) {
    CompositionLocalProvider(LocalPiuSharedVisibility provides scope) { content() }
}

/**
 * Marca a foto com a [key] que a liga à foto da outra tela ("foto-<id>"). Sem chave, sem a camada,
 * sem escopo ou com "reduzir animações", devolve o próprio modificador, sem nada a mais.
 *
 * Usa sharedBounds, e não sharedElement: o card mostra a miniatura e o Detalhe a foto grande
 * (que ainda está baixando). sharedBounds faz a ponte entre conteúdos diferentes: os limites
 * viajam enquanto um lado some e o outro aparece. [shape] recorta a foto durante a viagem (os
 * cantos arredondados do card).
 */
@Composable
fun Modifier.piuSharedPhoto(
    key: String?,
    shape: Shape = RectangleShape,
): Modifier {
    val transition = LocalPiuSharedTransition.current
    val visibility = LocalPiuSharedVisibility.current
    val outsideTransition = transition == null || visibility == null
    if (key == null || outsideTransition || PiuTheme.reduceMotion) return this
    return with(transition) {
        this@piuSharedPhoto.sharedBounds(
            sharedContentState = rememberSharedContentState(key),
            animatedVisibilityScope = visibility,
            clipInOverlayDuringTransition = OverlayClip(shape),
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
import com.velosobr.piuds.components.piuSharedPhoto
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
 * gradiente do [biome], para o card nunca ficar vazio. Com [sharedPhotoKey],
 * a foto viaja até a tela que tiver a mesma chave (o topo do Detalhe; veja
 * PiuSharedPhoto.kt). O nome e o nome
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
    sharedPhotoKey: String? = null,
) {
    Box(
        modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = height.minHeightDp.dp)
            .clip(RoundedCornerShape(24.dp))
            // Role.Button: o leitor de tela diz "botão" depois do nome da ave.
            .clickable(role = Role.Button, onClick = onClick),
    ) {
        // A camada da foto (o gradiente e a imagem por cima) é a que viaja até o Detalhe.
        Box(
            Modifier
                .matchParentSize()
                .piuSharedPhoto(sharedPhotoKey, RoundedCornerShape(24.dp))
                .background(
                    PiuTheme.tokens.gradients
                        .getValue(biome)
                        .toBrush(),
                ),
        ) {
            if (imageUrl != null) {
                AsyncImage(
                    model = imageUrl,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.matchParentSize(),
                )
            }
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

Crie `core/presentation/src/commonMain/kotlin/com/velosobr/passarim/core/presentation/SharedPhotoKey.kt`:

```kotlin
// A chave da foto que viaja do card do mosaico (Explorar) para o topo do
// Detalhe. As duas telas ficam em módulos diferentes e precisam escrever a
// mesma chave; por isso ela mora aqui, no módulo que as duas já usam.

package com.velosobr.passarim.core.presentation

/** A chave do elemento compartilhado da foto de uma ave: "foto-<id>" (spec da frente E, seção 6). */
fun speciesPhotoKey(id: String): String = "foto-$id"
```

Substitua o conteúdo de `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailHero.kt`:

```kotlin
// O topo do Detalhe (prancheta Detalhe.dc.html, frente E): a foto de ponta a
// ponta, que vai até atrás da barra de status, o nome da ave em branco sobre
// o scrim na base da foto, uma faixa que funde a foto ao fundo da tela e os
// botões de voltar e de favoritar em círculos de vidro fosco por cima.

package com.velosobr.passarim.feature.detail.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconToggleButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.presentation.speciesPhotoKey
import com.velosobr.passarim.feature.detail.domain.SpeciesDetail
import com.velosobr.passarim.feature.detail.presentation.resources.Res
import com.velosobr.passarim.feature.detail.presentation.resources.back
import com.velosobr.piuds.components.PiuBlurState
import com.velosobr.piuds.components.PiuBlurSurface
import com.velosobr.piuds.components.PiuHeroPhoto
import com.velosobr.piuds.components.adult.photoTextScrim
import com.velosobr.piuds.components.piuBlurSource
import com.velosobr.piuds.components.rememberPiuBlurState
import com.velosobr.piuds.resources.favorite_add
import com.velosobr.piuds.resources.favorite_remove
import com.velosobr.piuds.resources.ic_arrow_back
import com.velosobr.piuds.resources.ic_favorite_filled
import com.velosobr.piuds.resources.ic_favorites
import com.velosobr.piuds.theme.PiuDimens
import com.velosobr.piuds.theme.PiuTheme
import org.jetbrains.compose.resources.stringResource
import org.jetbrains.compose.resources.vectorResource
import com.velosobr.piuds.resources.Res as DesignRes

/** A altura da foto de ponta a ponta do topo (prancheta Detalhe.dc.html). */
val HERO_HEIGHT = 430.dp

/** O gradiente atrás da foto de uma ave sem bioma principal (BFF antigo): o do Pantanal, como no mosaico. */
private val FallbackBiome = Biome.PANTANAL

/** A altura da faixa que funde a base da foto (já escurecida pelo scrim) à cor do fundo da tela. */
private val FadeHeight = 32.dp

/**
 * O topo: foto, nome e botões. A caixa tem no mínimo [HERO_HEIGHT]; com fonte grande, o nome
 * empurra a caixa para baixo em vez de ser cortado. A foto é a fonte do desfoque
 * (piuBlurSource): os botões desfocam o que está atrás deles. Ao abrir pelo mosaico, ela chega
 * voando do card (a mesma chave speciesPhotoKey). Ela fica numa camada à parte dos
 * botões porque uma superfície não pode desfocar a si mesma.
 *
 * O nome fica num bloco com o photoTextScrim, o degradê escuro do PiuDS que garante o contraste
 * do branco sobre qualquer foto (inclusive uma foto toda branca). Embaixo dele, uma faixa vai da
 * cor do scrim à cor do fundo do tema, e a foto se funde à página: no tema escuro a emenda some,
 * no claro vira uma transição curta do escuro para o claro.
 */
@Composable
internal fun DetailHero(
    detail: SpeciesDetail,
    isFavorite: Boolean,
    onAction: (DetailAction) -> Unit,
) {
    val blur = rememberPiuBlurState()
    val scrim = PiuTheme.tokens.scrim
    Box(Modifier.fillMaxWidth().heightIn(min = HERO_HEIGHT)) {
        PiuHeroPhoto(
            imageUrl = detail.photos.firstOrNull()?.heroUrl,
            biome = detail.primaryBiome ?: FallbackBiome,
            aspectRatio = null,
            sharedPhotoKey = speciesPhotoKey(detail.id),
            modifier = Modifier.matchParentSize().piuBlurSource(blur),
        )
        Column(Modifier.align(Alignment.BottomStart).fillMaxWidth()) {
            // Guarda o lugar da barra de status e dos botões: um nome longo nunca sobe para baixo deles.
            Spacer(Modifier.statusBarsPadding().height(PiuDimens.touchTarget + 32.dp))
            Column(
                Modifier
                    .fillMaxWidth()
                    .photoTextScrim(scrim, fade = 48.dp)
                    .padding(start = 20.dp, end = 20.dp, top = 56.dp, bottom = 8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    detail.commonName,
                    style = MaterialTheme.typography.headlineLarge,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color.White,
                )
                Text(
                    detail.scientificName,
                    style = MaterialTheme.typography.bodyLarge,
                    fontStyle = FontStyle.Italic,
                    color = Color.White.copy(alpha = 0.9f),
                )
            }
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(FadeHeight)
                    .background(Brush.verticalGradient(listOf(scrim, MaterialTheme.colorScheme.background))),
            )
        }
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            BackButton(blur, onBack = { onAction(DetailAction.Back) })
            FavoriteButton(blur, detail.commonName, isFavorite, onToggle = { onAction(DetailAction.ToggleFavorite) })
        }
    }
}

/**
 * O botão de voltar: um círculo de vidro fosco de 48 dp (PiuBlurSurface) com a tinta translúcida
 * da superfície do tema, que dá contraste ao ícone mesmo onde o desfoque não roda.
 */
@Composable
internal fun BackButton(
    blur: PiuBlurState,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    GlassCircle(blur, modifier) {
        IconButton(onClick = onBack, modifier = Modifier.size(PiuDimens.touchTarget)) {
            Icon(vectorResource(DesignRes.drawable.ic_arrow_back), contentDescription = stringResource(Res.string.back))
        }
    }
}

/**
 * O coração: IconToggleButton é um botão de liga/desliga, então o leitor de tela anuncia se a ave
 * já está nos favoritos, e a descrição diz o que o toque vai fazer ("Favoritar Tuiuiú").
 */
@Composable
private fun FavoriteButton(
    blur: PiuBlurState,
    name: String,
    isFavorite: Boolean,
    onToggle: () -> Unit,
) {
    GlassCircle(blur) {
        IconToggleButton(checked = isFavorite, onCheckedChange = { onToggle() }, modifier = Modifier.size(PiuDimens.touchTarget)) {
            Icon(
                vectorResource(if (isFavorite) DesignRes.drawable.ic_favorite_filled else DesignRes.drawable.ic_favorites),
                contentDescription =
                    stringResource(
                        if (isFavorite) DesignRes.string.favorite_remove else DesignRes.string.favorite_add,
                        name,
                    ),
                tint = if (isFavorite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

/** O círculo de vidro fosco de 48 dp que os dois botões usam. */
@Composable
private fun GlassCircle(
    blur: PiuBlurState,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    PiuBlurSurface(
        state = blur,
        shape = CircleShape,
        tint = MaterialTheme.colorScheme.surface.copy(alpha = 0.6f),
        modifier = modifier.size(PiuDimens.touchTarget),
    ) { content() }
}
```

Substitua o conteúdo de `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreMosaic.kt`:

```kotlin
// Os itens da grade do Explorar (frente E): a "Ave do dia" em largura total,
// os cards de espécie em colunas desencontradas, o rodapé de "carregando
// mais" e o esqueleto do carregamento. A ExploreScreen monta a grade e põe
// estes itens embaixo do título, da busca e dos chips; separar os dois
// arquivos dá a cada um uma responsabilidade.

package com.velosobr.passarim.feature.explore.presentation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.calculateEndPadding
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.staggeredgrid.LazyStaggeredGridScope
import androidx.compose.foundation.lazy.staggeredgrid.LazyStaggeredGridState
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan
import androidx.compose.foundation.lazy.staggeredgrid.items
import androidx.compose.foundation.lazy.staggeredgrid.itemsIndexed
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
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.presentation.speciesPhotoKey
import com.velosobr.passarim.feature.explore.presentation.resources.Res
import com.velosobr.passarim.feature.explore.presentation.resources.featured_badge
import com.velosobr.passarim.feature.explore.presentation.resources.featured_badge_biome
import com.velosobr.passarim.feature.explore.presentation.resources.featured_play
import com.velosobr.passarim.feature.explore.presentation.resources.load_more_error
import com.velosobr.passarim.feature.explore.presentation.resources.retry
import com.velosobr.piuds.components.PiuSkeletonBox
import com.velosobr.piuds.components.adult.PiuFeaturedCard
import com.velosobr.piuds.components.adult.PiuMosaicCard
import com.velosobr.piuds.components.adult.PiuMosaicHeight
import com.velosobr.piuds.components.adult.PiuPlayAction
import kotlinx.coroutines.flow.distinctUntilChanged
import org.jetbrains.compose.resources.stringResource

/**
 * A altura do card na posição [index] do mosaico: alto, baixo, baixo, alto, e repete. Com duas
 * colunas, a da esquerda começa alta e a da direita baixa, e as linhas nunca se alinham.
 */
fun mosaicHeightFor(index: Int): PiuMosaicHeight = if (index % 4 == 0 || index % 4 == 3) PiuMosaicHeight.TALL else PiuMosaicHeight.SHORT

/** O gradiente de um card sem bioma principal (catalog sem esse dado): o do Pantanal. */
private val FallbackBiome = Biome.PANTANAL

/**
 * Pede a próxima página quando o último item visível chega perto do fim da grade (a regra está em
 * shouldLoadMore; o ViewModel ignora pedidos repetidos e fora da fase de conteúdo, então emitir a
 * mais é inofensivo). snapshotFlow transforma a leitura do estado da grade num Flow, e
 * rememberUpdatedState dá ao efeito o onAction atual sem reiniciá-lo.
 */
@Composable
internal fun LoadMoreEffect(
    gridState: LazyStaggeredGridState,
    onAction: (ExploreAction) -> Unit,
) {
    val currentOnAction by rememberUpdatedState(onAction)
    LaunchedEffect(gridState) {
        snapshotFlow {
            val info = gridState.layoutInfo
            (info.visibleItemsInfo.lastOrNull()?.index ?: -1) to info.totalItemsCount
        }.distinctUntilChanged()
            .collect { (last, count) -> if (shouldLoadMore(last, count)) currentOnAction(ExploreAction.LoadMore) }
    }
}

/**
 * Os itens do mosaico: a "Ave do dia" ocupando a largura toda e, embaixo, os cards em colunas
 * desencontradas, com o rodapé de "carregando mais" ou de erro. Na LazyVerticalStaggeredGrid cada
 * item tem a própria altura e entra na coluna mais curta; FullLine faz um item ocupar todas as
 * colunas. É uma função de extensão de LazyStaggeredGridScope (o "escopo" em que se declaram os
 * itens de uma grade), para a ExploreScreen chamá-la dentro da grade dela.
 */
internal fun LazyStaggeredGridScope.mosaicItems(
    state: ExploreState,
    onAction: (ExploreAction) -> Unit,
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
            biome = bird.primaryBiome ?: FallbackBiome,
            isFavorite = bird.id in state.favoriteIds,
            onToggleFavorite = { onAction(ExploreAction.ToggleFavorite(bird)) },
            onClick = { onAction(ExploreAction.OpenDetail(bird.id)) },
            height = mosaicHeightFor(index),
            // A foto do card viaja até o topo do Detalhe ao abrir a ave (só o mosaico: a "Ave do dia"
            // costuma estar também no mosaico, e duas fotos com a mesma chave deixariam a origem ambígua).
            sharedPhotoKey = speciesPhotoKey(bird.id),
        )
    }
    if (state.isLoadingMore || state.loadMoreError != null) {
        item(key = "footer", span = StaggeredGridItemSpan.FullLine, contentType = "footer") {
            LoadMoreFooter(isLoading = state.isLoadingMore, onRetry = { onAction(ExploreAction.RetryLoadMore) })
        }
    }
}

/** O "esqueleto" do carregamento: quatro blocos cinzas no desenho do mosaico, no lugar dos cards. */
internal fun LazyStaggeredGridScope.skeletonItems() {
    items(4, key = { "skeleton-$it" }, contentType = { "skeleton" }) { index ->
        val height = if (mosaicHeightFor(index) == PiuMosaicHeight.TALL) 220.dp else 168.dp
        PiuSkeletonBox(Modifier.fillMaxWidth().height(height), shape = MaterialTheme.shapes.large)
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
        biome = bird.primaryBiome ?: FallbackBiome,
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
internal fun PaddingValues.plusMargins(): PaddingValues {
    val direction = LocalLayoutDirection.current
    return PaddingValues(
        start = calculateStartPadding(direction) + GridMargin,
        end = calculateEndPadding(direction) + GridMargin,
        bottom = calculateBottomPadding() + 16.dp,
    )
}

/** A margem lateral da grade, que [fullBleed] desfaz para os itens do topo. */
private val GridMargin = 16.dp

/**
 * Faz um item ocupar a largura da tela inteira, por cima da margem lateral da grade. O título, a
 * busca e os chips já trazem as próprias margens, e a linha de chips precisa ir até a borda para
 * rolar na horizontal sem um corte a 16 dp dela. Modifier.layout mede o item com a largura da
 * grade mais as duas margens e o desenha deslocado para a esquerda; a grade não corta o que passa
 * da área dos itens enquanto continua dentro dela.
 */
internal fun Modifier.fullBleed(): Modifier =
    layout { measurable, constraints ->
        val extra = (GridMargin * 2).roundToPx()
        val width = constraints.maxWidth + extra
        val placeable = measurable.measure(constraints.copy(minWidth = width, maxWidth = width))
        layout(constraints.maxWidth, placeable.height) { placeable.place(-extra / 2, 0) }
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

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew --continue :core:piu-ds:testAndroidHostTest :core:presentation:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Conferir que a navegação só liga**

O bloco de rota do `NavHost` só pega o ViewModel, repassa callbacks e navega; nenhum efeito ali.

Run: `git diff feat/e1-explorar -- '*Navigator*.kt' '*NavHost*.kt' '*Graph*.kt' 'app/**/App*.kt' '*TabsScreen*.kt' | grep -E '^\+.*(LaunchedEffect|DisposableEffect|\.collect *[{(])'`

Expected: nenhuma linha.

- [ ] **Step 6: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:piu-ds:testAndroidHostTest :core:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m 'feat: foto do card do mosaico viaja até o topo do Detalhe'
```

## Correções da revisão final

Depois da Task 7, um revisor independente (agente Opus) leu o branch inteiro. Cada achado Critical ou Important virou uma tarefa com o teste vermelho primeiro, num commit `fix:` no fim do branch (sem fixup nem autosquash): C1 na Task 8, I1 a I5 nas Tasks 9 a 13. Os Minors baratos (1, 2, 4, 5 e 8 do ledger) e o vão do título do Explorar (do ledger do E3) estão nas Tasks 14 a 19; os outros ficam no ledger, no fim deste plano.

### Task 8: Revisão C1: a foto do card viaja também na ida, com o Detalhe ainda carregando

Na ida, o Detalhe quase sempre nasce carregando (a ave vem da rede), e o esqueleto não tinha a chave da foto: o card ficava sem par e nada viajava com o BFF real. O card agora manda na rota a chave da foto, a miniatura e o bioma (`DetailPreview`, dentro de um `DetailOpening`), e o topo do esqueleto já nasce com eles: a miniatura sobre o gradiente, com a mesma chave. Depois, a miniatura fica por baixo da foto grande até ela baixar. A "Ave do dia" ainda não manda chave (a Task 9 resolve).

**Files:**
- Modify: `app/src/commonMain/kotlin/com/velosobr/passarim/app/App.kt`
- Modify: `app/src/commonMain/kotlin/com/velosobr/passarim/app/navigation/Routes.kt`
- Modify: `app/src/commonMain/kotlin/com/velosobr/passarim/app/tabs/TabsScreen.kt`
- Test: `app/src/commonTest/kotlin/com/velosobr/passarim/app/navigation/RoutesTest.kt`
- Modify: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuHeroPhoto.kt`
- Create: `core/presentation/src/commonMain/kotlin/com/velosobr/passarim/core/presentation/DetailOpening.kt`
- Create (test): `feature/detail/presentation/src/androidHostTest/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailPhotoTransitionTest.kt`
- Modify: `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailContent.kt`
- Modify: `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailHero.kt`
- Modify: `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailScreen.kt`
- Modify: `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailState.kt`
- Modify: `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailViewModel.kt`
- Test: `feature/detail/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailViewModelTest.kt`
- Modify: `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreAction.kt`
- Modify: `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreMosaic.kt`
- Modify: `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreRoot.kt`
- Modify: `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreViewModel.kt`
- Test: `feature/explore/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreViewModelTest.kt`
- Test: `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/DetailSnapshotTest.kt`
- Record: 6 imagens em `snapshots/src/test/snapshots/images/` (6 novas, 0 regravadas)

**Interfaces:**
- Produz (`core:presentation`): `data class DetailPreview(photoKey, thumbnailUrl, biome)` e `data class DetailOpening(id, autoPlay, preview)`.
- Produz: `KEY_PHOTO_KEY`, `KEY_THUMBNAIL_URL`, `KEY_PRIMARY_BIOME` (Detalhe) e `fun DetailOpening.toRoute(): DetailRoute` (app).
- Muda: `DetailRoute(id, autoPlay, photoKey, thumbnailUrl, primaryBiome)`, `DetailState.preview`, `ExploreAction.OpenDetail(summary)`, `ExploreEvent.NavigateToDetail(opening)`, `onOpenDetail: (DetailOpening) -> Unit` no `ExploreRoot` e no `TabsScreen`, e `PiuHeroPhoto(..., placeholderUrl)`.

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `app/src/commonTest/kotlin/com/velosobr/passarim/app/navigation/RoutesTest.kt`:

```kotlin
// Teste das rotas: os nomes dos argumentos do Detalhe (o id, o autoPlay e a
// prévia do topo) são as chaves que o ViewModel lê do SavedStateHandle. O
// Navigation Compose põe cada campo da rota no SavedStateHandle com o nome do
// campo; se um dos dois mudar sozinho, o argumento chega vazio e nada avisa.

package com.velosobr.passarim.app.navigation

import assertk.assertThat
import assertk.assertions.isEqualTo
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.presentation.DetailOpening
import com.velosobr.passarim.core.presentation.DetailPreview
import com.velosobr.passarim.feature.detail.presentation.KEY_AUTO_PLAY
import com.velosobr.passarim.feature.detail.presentation.KEY_PHOTO_KEY
import com.velosobr.passarim.feature.detail.presentation.KEY_PRIMARY_BIOME
import com.velosobr.passarim.feature.detail.presentation.KEY_SPECIES_ID
import com.velosobr.passarim.feature.detail.presentation.KEY_THUMBNAIL_URL
import kotlin.test.Test

class RoutesTest {
    @Test
    fun `o argumento da rota do Detalhe e a chave que o ViewModel le`() {
        assertThat(DetailRoute::id.name).isEqualTo(KEY_SPECIES_ID)
    }

    @Test
    fun `o autoPlay da rota do Detalhe e a chave que o ViewModel le`() {
        assertThat(DetailRoute::autoPlay.name).isEqualTo(KEY_AUTO_PLAY)
    }

    @Test
    fun `os campos da previa da rota do Detalhe sao as chaves que o ViewModel le`() {
        assertThat(DetailRoute::photoKey.name).isEqualTo(KEY_PHOTO_KEY)
        assertThat(DetailRoute::thumbnailUrl.name).isEqualTo(KEY_THUMBNAIL_URL)
        assertThat(DetailRoute::primaryBiome.name).isEqualTo(KEY_PRIMARY_BIOME)
    }

    @Test
    fun `o pedido de abrir o Detalhe vira a rota com o bioma pelo codigo do BFF`() {
        val preview = DetailPreview("foto-tuiuiu", "https://thumb/t.jpg", Biome.PANTANAL)
        val opening = DetailOpening("tuiuiu", autoPlay = true, preview = preview)
        assertThat(opening.toRoute()).isEqualTo(DetailRoute("tuiuiu", true, "foto-tuiuiu", "https://thumb/t.jpg", "pantanal"))
    }
}
```

Crie `feature/detail/presentation/src/androidHostTest/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailPhotoTransitionTest.kt`:

```kotlin
// Testes da foto que viaja do card até o topo do Detalhe, com a tela de
// Detalhe de verdade (DetailScreen). Na ida, o Detalhe quase sempre nasce
// carregando (a ave ainda vem da rede), então é o esqueleto que precisa ter a
// mesma chave do card desde o primeiro quadro; sem ela, o card não tem par e a
// foto não viaja.

package com.velosobr.passarim.feature.detail.presentation

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import assertk.assertThat
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import com.velosobr.passarim.core.presentation.DetailPreview
import com.velosobr.piuds.components.PiuSharedScope
import com.velosobr.piuds.components.PiuSharedTransitionLayout
import com.velosobr.piuds.components.piuSharedPhoto
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w411dp-h891dp")
class DetailPhotoTransitionTest {
    /** Abre o Detalhe no meio do teste. */
    private var detailOpen by mutableStateOf(false)

    /**
     * Onde o card começa (a borda de cima, em pixels), quadro a quadro, depois de tocar nele. O card
     * fica 300 dp abaixo do topo da tela e tem a chave "foto-1"; o Detalhe abre carregando, com a
     * [preview] que a rota daria. AnimatedContent troca as duas telas como o NavHost faz por dentro,
     * e mainClock.autoAdvance = false deixa o teste avançar o relógio um quadro de cada vez. Com
     * par, o card viaja junto até o topo do Detalhe; sem par, só esmaece no lugar.
     */
    private fun cardTopsAfterOpening(preview: DetailPreview): List<Float> {
        val tops = mutableListOf<Float>()
        runComposeUiTest {
            mainClock.autoAdvance = false
            setContent {
                PiuTheme {
                    PiuSharedTransitionLayout {
                        AnimatedContent(
                            targetState = detailOpen,
                            modifier = Modifier.fillMaxSize(),
                            transitionSpec = { (fadeIn() togetherWith fadeOut()).using(null) },
                        ) { open ->
                            PiuSharedScope(this) {
                                if (open) {
                                    DetailScreen(state = DetailState(phase = DetailPhase.Loading, preview = preview), onAction = {})
                                } else {
                                    Box(
                                        Modifier
                                            .offset(40.dp, 300.dp)
                                            .size(100.dp)
                                            .piuSharedPhoto("foto-1")
                                            .background(Color.Red)
                                            .testTag("card")
                                            .clickable { detailOpen = true },
                                    )
                                }
                            }
                        }
                    }
                }
            }
            mainClock.advanceTimeBy(1_000)
            onNodeWithTag("card").performClick()
            repeat(40) {
                mainClock.advanceTimeByFrame()
                onAllNodes(hasTestTag("card")).fetchSemanticsNodes().forEach { tops += it.boundsInRoot.top }
            }
        }
        return tops
    }

    @Test
    fun `aberto carregando o esqueleto recebe a foto do card`() {
        // Em algum quadro o card está no meio do caminho até o topo: ele achou o par no esqueleto.
        assertThat(cardTopsAfterOpening(DetailPreview(photoKey = "foto-1")).any { it > 20 && it < 280 }).isTrue()
    }

    @Test
    fun `sem a chave na rota o card nao viaja`() {
        assertThat(cardTopsAfterOpening(DetailPreview()).any { it > 20 && it < 280 }).isFalse()
    }
}
```

Substitua o conteúdo de `feature/detail/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailViewModelTest.kt`:

```kotlin
// Testes do ViewModel do Detalhe com repositórios e player falsos.

package com.velosobr.passarim.feature.detail.presentation

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import app.cash.turbine.test
import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.Result
import com.velosobr.passarim.core.presentation.DetailPreview
import com.velosobr.passarim.core.presentation.ScreenError
import com.velosobr.passarim.feature.detail.domain.PlaybackState
import com.velosobr.passarim.feature.detail.domain.toSummary
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DetailViewModelTest {
    private val repo = FakeDetailRepository()
    private val favorites = FakeFavoritesRepository()
    private val player = FakeAudioPlayer()

    /** viewModel cria o ViewModel com o id e a configuração de reprodução automática dados. */
    private fun viewModel(
        id: String = ARARA_ID,
        autoPlay: Boolean = false,
    ) = DetailViewModel(SavedStateHandle(mapOf(KEY_SPECIES_ID to id)), repo, favorites, FakeSettingsRepository(autoPlay), player)

    @BeforeTest
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @AfterTest
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun `ao abrir carrega a especie do id da rota`() {
        val vm = viewModel()
        assertThat(repo.calls).containsExactly(ARARA_ID)
        assertThat(vm.state.value.phase).isEqualTo(DetailPhase.Content(arara))
    }

    @Test
    fun `id invalido vira nao encontrada sem chamar o repositorio`() {
        val vm = viewModel(id = "../admin")
        assertThat(repo.calls).isEmpty()
        assertThat(vm.state.value.phase).isEqualTo(DetailPhase.NotFound)
    }

    @Test
    fun `especie inexistente vira nao encontrada`() {
        repo.next = Result.Failure(DataError.Network.NotFound)
        assertThat(viewModel().state.value.phase).isEqualTo(DetailPhase.NotFound)
    }

    @Test
    fun `cada erro de rede vira o erro de tela correspondente`() {
        mapOf(
            DataError.Network.NoConnection to ScreenError.NoConnection,
            DataError.Network.Timeout to ScreenError.NoConnection,
            DataError.Network.ServiceUnavailable to ScreenError.ServiceUnavailable,
            DataError.Network.Internal to ScreenError.ServiceUnavailable,
            DataError.Network.InvalidParameter to ScreenError.Generic,
            DataError.Network.Unknown to ScreenError.Generic,
        ).forEach { (error, expected) ->
            repo.next = Result.Failure(error)
            assertThat(viewModel().state.value.phase).isEqualTo(DetailPhase.Error(expected))
        }
    }

    @Test
    fun `RateLimited so libera tentar de novo depois do Retry-After`() =
        runTest {
            repo.next = Result.Failure(DataError.Network.RateLimited(30))
            val vm = viewModel()
            assertThat(vm.state.value.retryEnabled).isFalse()

            vm.onAction(DetailAction.Retry)
            assertThat(repo.calls).containsExactly(ARARA_ID)

            advanceTimeBy(30_001)
            assertThat(vm.state.value.retryEnabled).isTrue()
        }

    @Test
    fun `tentar de novo recarrega a especie`() {
        repo.next = Result.Failure(DataError.Network.NoConnection)
        val vm = viewModel()
        repo.next = Result.Success(arara)

        vm.onAction(DetailAction.Retry)

        assertThat(repo.calls).containsExactly(ARARA_ID, ARARA_ID)
        assertThat(vm.state.value.phase).isEqualTo(DetailPhase.Content(arara))
    }

    @Test
    fun `favoritar envia o resumo da especie e o estado acompanha os favoritos`() {
        val vm = viewModel()
        assertThat(vm.state.value.isFavorite).isFalse()

        vm.onAction(DetailAction.ToggleFavorite)

        assertThat(favorites.toggled).containsExactly(arara.toSummary())
        assertThat(vm.state.value.isFavorite).isTrue()
    }

    @Test
    fun `abrir uma especie ja favorita atualiza o resumo guardado`() {
        favorites.ids.value = setOf(ARARA_ID)
        viewModel()
        assertThat(favorites.refreshed).containsExactly(arara.toSummary())
    }

    @Test
    fun `abrir uma especie que nao e favorita nao mexe nos favoritos`() {
        viewModel()
        assertThat(favorites.refreshed).isEmpty()
    }

    @Test
    fun `tocar pausar e retomar o canto`() {
        val vm = viewModel()

        vm.onAction(DetailAction.TogglePlay)
        player.state.value = PlaybackState.Playing(1_200)
        vm.onAction(DetailAction.TogglePlay)
        player.state.value = PlaybackState.Paused(1_200)
        vm.onAction(DetailAction.TogglePlay)

        assertThat(player.calls).containsExactly("play:$AUDIO_URL", "pause", "play:$AUDIO_URL")
    }

    @Test
    fun `o estado do player aparece no estado da tela`() {
        val vm = viewModel()
        player.state.value = PlaybackState.Playing(2_500)
        assertThat(vm.state.value.player).isEqualTo(PlaybackState.Playing(2_500))
    }

    @Test
    fun `seek move o player`() {
        val vm = viewModel()
        vm.onAction(DetailAction.Seek(3_000))
        assertThat(player.calls).containsExactly("seek:3000")
    }

    @Test
    fun `sem audio tocar nao faz nada`() {
        repo.next = Result.Success(arara.copy(audio = null))
        val vm = viewModel()
        vm.onAction(DetailAction.TogglePlay)
        assertThat(player.calls).isEmpty()
    }

    @Test
    fun `depois de um erro do player tocar tenta de novo`() {
        val vm = viewModel()
        player.state.value = PlaybackState.Error
        assertThat(vm.state.value.player).isEqualTo(PlaybackState.Error)

        vm.onAction(DetailAction.TogglePlay)

        assertThat(player.calls).containsExactly("play:$AUDIO_URL")
    }

    @Test
    fun `perder o foco pausa o player`() {
        val vm = viewModel()
        player.state.value = PlaybackState.Playing(100)
        vm.onAction(DetailAction.ScreenPaused)
        assertThat(player.calls).containsExactly("pause")
    }

    @Test
    fun `sair da tela libera o player`() {
        val store = ViewModelStore()
        ViewModelProvider.create(store, viewModelFactory { initializer { viewModel() } })[DetailViewModel::class]

        store.clear()

        assertThat(player.calls).containsExactly("release")
    }

    @Test
    fun `com reproducao automatica ligada toca ao carregar`() {
        viewModel(autoPlay = true)
        assertThat(player.calls).containsExactly("play:$AUDIO_URL")
    }

    @Test
    fun `com reproducao automatica desligada nao toca`() {
        viewModel(autoPlay = false)
        assertThat(player.calls).isEmpty()
    }

    @Test
    fun `aberto pelo canto da ave do dia toca mesmo com a reproducao automatica desligada`() {
        // A rota DetailRoute(id, autoPlay = true) põe o argumento no SavedStateHandle.
        DetailViewModel(
            SavedStateHandle(mapOf(KEY_SPECIES_ID to ARARA_ID, KEY_AUTO_PLAY to true)),
            repo,
            favorites,
            FakeSettingsRepository(autoPlay = false),
            player,
        )
        assertThat(player.calls).containsExactly("play:$AUDIO_URL")
    }

    /**
     * A rota aberta pelo mosaico traz a chave da foto, a miniatura e o código do bioma: o ViewModel
     * os entrega ao estado desde o primeiro quadro, para o topo do esqueleto já ter o par da foto.
     */
    @Test
    fun `a previa do topo vem da rota`() {
        val vm =
            DetailViewModel(
                SavedStateHandle(
                    mapOf(
                        KEY_SPECIES_ID to ARARA_ID,
                        KEY_PHOTO_KEY to "foto-$ARARA_ID",
                        KEY_THUMBNAIL_URL to "https://thumb/arara.jpg",
                        KEY_PRIMARY_BIOME to "pantanal",
                    ),
                ),
                repo,
                favorites,
                FakeSettingsRepository(autoPlay = false),
                player,
            )
        assertThat(vm.state.value.preview).isEqualTo(DetailPreview("foto-$ARARA_ID", "https://thumb/arara.jpg", Biome.PANTANAL))
    }

    @Test
    fun `sem previa na rota o topo fica sem chave`() {
        assertThat(viewModel().state.value.preview).isEqualTo(DetailPreview())
    }

    @Test
    fun `reproducao automatica sem audio nao toca`() {
        repo.next = Result.Success(arara.copy(audio = null))
        viewModel(autoPlay = true)
        assertThat(player.calls).isEmpty()
    }

    @Test
    fun `a linha de creditos expande e recolhe`() {
        val vm = viewModel()
        vm.onAction(DetailAction.ToggleCredits)
        assertThat(vm.state.value.creditsExpanded).isTrue()
        vm.onAction(DetailAction.ToggleCredits)
        assertThat(vm.state.value.creditsExpanded).isFalse()
    }

    @Test
    fun `so links https de credito abrem`() =
        runTest {
            val vm = viewModel()
            vm.events.test {
                vm.onAction(DetailAction.OpenCredit("javascript:alert(1)"))
                vm.onAction(DetailAction.OpenCredit("http://www.inaturalist.org/observations/1"))
                vm.onAction(DetailAction.OpenCredit(""))
                vm.onAction(DetailAction.OpenCredit("https://xeno-canto.org/403887"))
                assertThat(awaitItem()).isEqualTo(DetailEvent.OpenUrl("https://xeno-canto.org/403887"))
            }
        }

    @Test
    fun `voltar emite a navegacao de volta`() =
        runTest {
            val vm = viewModel()
            vm.events.test {
                vm.onAction(DetailAction.Back)
                assertThat(awaitItem()).isEqualTo(DetailEvent.NavigateBack)
            }
        }
}
```

Substitua o conteúdo de `feature/explore/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreViewModelTest.kt`:

```kotlin
// Testes do ViewModel do Explorar com repositórios falsos (ExploreFakes.kt).
// Dispatchers.setMain troca a thread principal por um dispatcher de teste, e
// advanceTimeBy avança o relógio virtual, para testar o debounce sem esperar.

package com.velosobr.passarim.feature.explore.presentation

import androidx.lifecycle.SavedStateHandle
import app.cash.turbine.test
import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.hasLength
import assertk.assertions.hasSize
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isNull
import assertk.assertions.isTrue
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.domain.BiomeFilter
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.Result
import com.velosobr.passarim.core.domain.StateFilter
import com.velosobr.passarim.core.presentation.DetailOpening
import com.velosobr.passarim.core.presentation.DetailPreview
import com.velosobr.passarim.core.presentation.ScreenError
import com.velosobr.passarim.feature.explore.domain.SpeciesPage
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test

/**
 * O `Main` de teste é um `UnconfinedTestDispatcher`: o `viewModelScope` roda na hora, e o `runTest`
 * usa o mesmo relógio virtual, então `advanceTimeBy` controla o debounce e o `Retry-After`.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ExploreViewModelTest {
    private val repo = FakeExploreRepository()
    private val filters = FakeFiltersRepository()
    private val favorites = FakeFavoritesRepository()
    private val featured = FakeFeaturedRepository()

    /** viewModel cria o ViewModel com os fakes e um SavedStateHandle (vazio por padrão). */
    private fun viewModel(saved: SavedStateHandle = SavedStateHandle()) = ExploreViewModel(repo, filters, favorites, featured, saved)

    @BeforeTest
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @AfterTest
    fun tearDown() = Dispatchers.resetMain()

    /** Passa o debounce da busca. */
    private fun TestScope.typed() = advanceTimeBy(SEARCH_DEBOUNCE_MILLIS + 1)

    // --- Primeira página e busca ---

    @Test
    fun `ao abrir carrega a primeira pagina sem busca nem filtros`() =
        runTest {
            val vm = viewModel()
            assertThat(repo.calls).containsExactly(ListCall("", null, null, null))
            val s = vm.state.value
            assertThat(s.phase).isEqualTo(ExplorePhase.Content)
            assertThat(s.items).hasSize(20)
            assertThat(s.nextCursor).isEqualTo("c1")
        }

    @Test
    fun `a busca espera 400 ms sem digitar antes de pedir`() =
        runTest {
            val vm = viewModel()
            vm.onAction(ExploreAction.QueryChange("a"))
            advanceTimeBy(200)
            vm.onAction(ExploreAction.QueryChange("az"))
            advanceTimeBy(SEARCH_DEBOUNCE_MILLIS - 1)
            assertThat(repo.calls).hasSize(1)

            advanceTimeBy(2)
            assertThat(repo.calls).containsExactly(ListCall("", null, null, null), ListCall("az", null, null, null))
            assertThat(vm.state.value.query).isEqualTo("az")
        }

    @Test
    fun `uma busca nova cancela a anterior que ainda nao respondeu`() =
        runTest {
            repo.gates[1] = CompletableDeferred()
            val vm = viewModel()
            vm.onAction(ExploreAction.QueryChange("arara"))
            typed()
            repo.pages[null] = Result.Success(SpeciesPage(listOf(bird("gralha-azul")), null))
            vm.onAction(ExploreAction.QueryChange("azul"))
            typed()

            repo.gates.getValue(1).complete(Unit)
            advanceUntilIdle()

            assertThat(repo.calls.map { it.query }).containsExactly("", "arara", "azul")
            assertThat(
                vm.state.value.items
                    .map { it.id },
            ).containsExactly("gralha-azul")
        }

    @Test
    fun `caracteres de controle e espacos das pontas nao vao para o BFF`() =
        runTest {
            val vm = viewModel()
            vm.onAction(ExploreAction.QueryChange("  arara\nazul "))
            typed()
            assertThat(repo.calls.last().query).isEqualTo("arara azul")
        }

    @Test
    fun `o campo guarda no maximo 100 caracteres`() =
        runTest {
            val vm = viewModel()
            vm.onAction(ExploreAction.QueryChange("a".repeat(150)))
            assertThat(vm.state.value.query).hasLength(100)
        }

    @Test
    fun `enquanto a primeira pagina nao chega a fase e Loading`() =
        runTest {
            repo.gates[0] = CompletableDeferred()
            val vm = viewModel()
            vm.state.test {
                assertThat(awaitItem().phase).isEqualTo(ExplorePhase.Loading)
                repo.gates.getValue(0).complete(Unit)
                assertThat(awaitItem().phase).isEqualTo(ExplorePhase.Content)
            }
        }

    @Test
    fun `pagina vazia vira Empty`() =
        runTest {
            repo.pages[null] = Result.Success(SpeciesPage(emptyList(), null))
            val vm = viewModel()
            assertThat(vm.state.value.phase).isEqualTo(ExplorePhase.Empty)
        }

    // --- Paginação ---

    @Test
    fun `pagina ate o fim e para quando nextCursor e nulo`() =
        runTest {
            repo.pages["c1"] = Result.Success(page(20, 40, "c2"))
            repo.pages["c2"] = Result.Success(page(40, 45, null))
            val vm = viewModel()

            vm.onAction(ExploreAction.LoadMore)
            vm.onAction(ExploreAction.LoadMore)
            vm.onAction(ExploreAction.LoadMore)

            assertThat(repo.calls.map { it.cursor }).containsExactly(null, "c1", "c2")
            assertThat(vm.state.value.items).hasSize(45)
            assertThat(vm.state.value.nextCursor).isNull()
        }

    @Test
    fun `ids repetidos entre paginas sao descartados`() =
        runTest {
            // A página 2 repete "ave-19" (da página 1) e traz "ave-20" duas vezes.
            repo.pages["c1"] = Result.Success(SpeciesPage(listOf(bird("ave-19"), bird("ave-20"), bird("ave-20")), null))
            val vm = viewModel()
            vm.onAction(ExploreAction.LoadMore)

            val ids =
                vm.state.value.items
                    .map { it.id }
            assertThat(ids).hasSize(21)
            assertThat(ids.toSet()).hasSize(21)
        }

    @Test
    fun `pedir a proxima pagina com uma requisicao em curso e ignorado`() =
        runTest {
            repo.pages["c1"] = Result.Success(page(20, 40, null))
            repo.gates[1] = CompletableDeferred()
            val vm = viewModel()

            vm.onAction(ExploreAction.LoadMore)
            assertThat(vm.state.value.isLoadingMore).isTrue()
            vm.onAction(ExploreAction.LoadMore)
            repo.gates.getValue(1).complete(Unit)

            assertThat(repo.calls).hasSize(2)
            assertThat(vm.state.value.isLoadingMore).isFalse()
        }

    @Test
    fun `erro na pagina seguinte preserva os itens e tentar de novo continua`() =
        runTest {
            repo.pages["c1"] = Result.Failure(DataError.Network.Timeout)
            val vm = viewModel()

            vm.onAction(ExploreAction.LoadMore)
            assertThat(vm.state.value.items).hasSize(20)
            assertThat(vm.state.value.phase).isEqualTo(ExplorePhase.Content)
            assertThat(vm.state.value.loadMoreError).isEqualTo(ScreenError.NoConnection)

            // Rolar de novo não repete o pedido sozinho: só o botão da linha de erro.
            vm.onAction(ExploreAction.LoadMore)
            assertThat(repo.calls).hasSize(2)

            repo.pages["c1"] = Result.Success(page(20, 30, null))
            vm.onAction(ExploreAction.RetryLoadMore)
            assertThat(vm.state.value.items).hasSize(30)
            assertThat(vm.state.value.loadMoreError).isNull()
        }

    @Test
    fun `mudar o filtro zera a lista e o cursor e pede a primeira pagina`() =
        runTest {
            repo.pages["c1"] = Result.Success(page(20, 40, "c2"))
            val vm = viewModel()
            vm.onAction(ExploreAction.LoadMore)
            repo.gates[2] = CompletableDeferred()

            vm.onAction(ExploreAction.OpenFilters)
            vm.onAction(ExploreAction.SheetBiome("cerrado"))
            vm.onAction(ExploreAction.ApplyFilters)

            val s = vm.state.value
            assertThat(s.phase).isEqualTo(ExplorePhase.Loading)
            assertThat(s.items).isEmpty()
            assertThat(s.nextCursor).isNull()
            assertThat(repo.calls.last()).isEqualTo(ListCall("", "cerrado", null, null))
        }

    @Test
    fun `mudar o filtro com uma pagina seguinte em curso descarta essa pagina`() =
        runTest {
            repo.pages["c1"] = Result.Success(page(20, 40, "c2"))
            repo.gates[1] = CompletableDeferred()
            val vm = viewModel()
            vm.onAction(ExploreAction.LoadMore)

            vm.onAction(ExploreAction.OpenFilters)
            vm.onAction(ExploreAction.SheetState("SP"))
            vm.onAction(ExploreAction.ApplyFilters)
            repo.gates.getValue(1).complete(Unit)
            advanceUntilIdle()

            assertThat(vm.state.value.items).hasSize(20)
            assertThat(vm.state.value.nextCursor).isEqualTo("c1")
            assertThat(repo.calls.last()).isEqualTo(ListCall("", null, "SP", null))
        }

    @Test
    fun `shouldLoadMore pede a proxima pagina a 6 itens do fim`() {
        assertThat(shouldLoadMore(lastVisibleIndex = 13, itemCount = 20)).isFalse()
        assertThat(shouldLoadMore(lastVisibleIndex = 14, itemCount = 20)).isTrue()
        assertThat(shouldLoadMore(lastVisibleIndex = -1, itemCount = 0)).isFalse()
    }

    // --- Erros ---

    @Test
    fun `cada erro de rede vira a tela de erro certa`() =
        runTest {
            val table =
                mapOf(
                    DataError.Network.NoConnection to ScreenError.NoConnection,
                    DataError.Network.Timeout to ScreenError.NoConnection,
                    DataError.Network.ServiceUnavailable to ScreenError.ServiceUnavailable,
                    DataError.Network.Internal to ScreenError.ServiceUnavailable,
                    DataError.Network.RateLimited(null) to ScreenError.RateLimited(null),
                    DataError.Network.InvalidParameter to ScreenError.Generic,
                    DataError.Network.NotFound to ScreenError.Generic,
                    DataError.Network.Unknown to ScreenError.Generic,
                )
            for ((error, expected) in table) {
                repo.pages[null] = Result.Failure(error)
                assertThat(viewModel().state.value.phase).isEqualTo(ExplorePhase.Error(expected))
            }
        }

    @Test
    fun `tentar de novo recarrega a primeira pagina`() =
        runTest {
            repo.pages[null] = Result.Failure(DataError.Network.ServiceUnavailable)
            val vm = viewModel()
            repo.pages[null] = Result.Success(page(0, 3, null))

            vm.onAction(ExploreAction.Retry)

            assertThat(vm.state.value.phase).isEqualTo(ExplorePhase.Content)
            assertThat(vm.state.value.items).hasSize(3)
        }

    @Test
    fun `RateLimited so libera tentar de novo depois do Retry-After`() =
        runTest {
            repo.pages[null] = Result.Failure(DataError.Network.RateLimited(30))
            val vm = viewModel()
            assertThat(vm.state.value.retryEnabled).isFalse()

            vm.onAction(ExploreAction.Retry)
            assertThat(repo.calls).hasSize(1)

            advanceTimeBy(30_001)
            assertThat(vm.state.value.retryEnabled).isTrue()
            vm.onAction(ExploreAction.Retry)
            assertThat(repo.calls).hasSize(2)
        }

    // --- Filtros ---

    @Test
    fun `os filtros carregam ao abrir a tela`() =
        runTest {
            val vm = viewModel()
            assertThat(vm.state.value.filters).isEqualTo(FiltersPhase.Loaded(sampleFilters))
        }

    @Test
    fun `o sheet so aplica ao tocar em Mostrar aves`() =
        runTest {
            val vm = viewModel()
            vm.onAction(ExploreAction.OpenFilters)
            vm.onAction(ExploreAction.SheetBiome("pampa"))
            assertThat(vm.state.value.sheet).isEqualTo(FiltersSheetState(biome = "pampa", state = null))
            assertThat(vm.state.value.biome).isNull()

            vm.onAction(ExploreAction.DismissFilters)
            assertThat(vm.state.value.sheet).isNull()
            assertThat(vm.state.value.biome).isNull()
            assertThat(repo.calls).hasSize(1)
        }

    @Test
    fun `selecao unica por grupo e tocar de novo desmarca`() =
        runTest {
            val vm = viewModel()
            vm.onAction(ExploreAction.OpenFilters)
            vm.onAction(ExploreAction.SheetBiome("pampa"))
            vm.onAction(ExploreAction.SheetBiome("cerrado"))
            vm.onAction(ExploreAction.SheetState("SP"))
            assertThat(vm.state.value.sheet).isEqualTo(FiltersSheetState(biome = "cerrado", state = "SP"))

            vm.onAction(ExploreAction.SheetBiome("cerrado"))
            assertThat(
                vm.state.value.sheet
                    ?.biome,
            ).isNull()
        }

    @Test
    fun `Limpar no sheet desmarca tudo mas so vale ao aplicar`() =
        runTest {
            val vm = viewModel(SavedStateHandle(mapOf(KEY_BIOME to "pampa", KEY_STATE to "RS")))
            vm.onAction(ExploreAction.OpenFilters)
            assertThat(vm.state.value.sheet).isEqualTo(FiltersSheetState(biome = "pampa", state = "RS"))

            vm.onAction(ExploreAction.ClearSheet)
            assertThat(vm.state.value.biome).isEqualTo("pampa")

            vm.onAction(ExploreAction.ApplyFilters)
            assertThat(vm.state.value.biome).isNull()
            assertThat(vm.state.value.state).isNull()
            assertThat(repo.calls.last()).isEqualTo(ListCall("", null, null, null))
        }

    @Test
    fun `Limpar filtros do estado vazio mantem a busca`() =
        runTest {
            repo.pages[null] = Result.Success(SpeciesPage(emptyList(), null))
            val vm = viewModel(SavedStateHandle(mapOf(KEY_QUERY to "arara", KEY_BIOME to "pampa")))
            assertThat(vm.state.value.phase).isEqualTo(ExplorePhase.Empty)

            vm.onAction(ExploreAction.ClearFilters)

            assertThat(repo.calls.last()).isEqualTo(ListCall("arara", null, null, null))
            assertThat(vm.state.value.query).isEqualTo("arara")
        }

    @Test
    fun `o X do chip remove so aquele filtro`() =
        runTest {
            val vm = viewModel(SavedStateHandle(mapOf(KEY_BIOME to "pampa", KEY_STATE to "RS")))
            vm.onAction(ExploreAction.ClearBiome)
            assertThat(repo.calls.last()).isEqualTo(ListCall("", null, "RS", null))
            vm.onAction(ExploreAction.ClearState)
            assertThat(repo.calls.last()).isEqualTo(ListCall("", null, null, null))
        }

    @Test
    fun `falha nos filtros mostra erro e abrir o sheet tenta de novo`() =
        runTest {
            filters.next = Result.Failure(DataError.Network.NoConnection)
            val vm = viewModel()
            assertThat(vm.state.value.filters).isEqualTo(FiltersPhase.Error)

            filters.next = Result.Success(sampleFilters)
            vm.onAction(ExploreAction.OpenFilters)

            assertThat(filters.calls).isEqualTo(2)
            assertThat(vm.state.value.filters).isEqualTo(FiltersPhase.Loaded(sampleFilters))
        }

    @Test
    fun `estados ordenados por contagem e os 12 primeiros ate ver todos`() {
        val many = (1..20).map { StateFilter("U$it", it) }
        assertThat(visibleStates(sampleFilters.states, showAll = false).map { it.code }).containsExactly("SP", "RJ", "AC")
        assertThat(visibleStates(many, showAll = false)).hasSize(VISIBLE_STATES)
        assertThat(visibleStates(many, showAll = false).first().code).isEqualTo("U20")
        assertThat(visibleStates(many, showAll = true)).hasSize(20)
    }

    // --- Favoritos, eventos e morte do processo ---

    @Test
    fun `favoritar no card alterna e o estado acompanha`() =
        runTest {
            val vm = viewModel()
            val first =
                vm.state.value.items
                    .first()

            vm.onAction(ExploreAction.ToggleFavorite(first))
            assertThat(vm.state.value.favoriteIds).isEqualTo(setOf(first.id))

            vm.onAction(ExploreAction.ToggleFavorite(first))
            assertThat(vm.state.value.favoriteIds).isEmpty()
        }

    /**
     * O card leva para o Detalhe a chave da foto do mosaico, a miniatura e o bioma: o topo do Detalhe
     * já nasce com eles, enquanto a ave ainda carrega, e a foto tem par para viajar.
     */
    @Test
    fun `tocar no card e em Ver favoritos emite os eventos de navegacao`() =
        runTest {
            val vm = viewModel()
            val card = bird("bem-te-vi").copy(thumbnailUrl = "https://thumb/bem-te-vi.jpg", primaryBiome = Biome.CERRADO)
            vm.events.test {
                vm.onAction(ExploreAction.OpenDetail(card))
                assertThat(awaitItem()).isEqualTo(
                    ExploreEvent.NavigateToDetail(
                        DetailOpening(
                            id = "bem-te-vi",
                            preview = DetailPreview("foto-bem-te-vi", "https://thumb/bem-te-vi.jpg", Biome.CERRADO),
                        ),
                    ),
                )
                vm.onAction(ExploreAction.OpenFavorites)
                assertThat(awaitItem()).isEqualTo(ExploreEvent.NavigateToFavorites)
            }
        }

    @Test
    fun `busca e filtros sobrevivem a morte do processo`() =
        runTest {
            val saved = SavedStateHandle(mapOf(KEY_QUERY to "azul", KEY_BIOME to "cerrado"))
            val vm = viewModel(saved)
            assertThat(repo.calls).containsExactly(ListCall("azul", "cerrado", null, null))

            vm.onAction(ExploreAction.QueryChange("gralha"))
            vm.onAction(ExploreAction.OpenFilters)
            vm.onAction(ExploreAction.SheetState("PR"))
            vm.onAction(ExploreAction.ApplyFilters)

            assertThat(saved.get<String>(KEY_QUERY)).isEqualTo("gralha")
            assertThat(saved.get<String>(KEY_BIOME)).isEqualTo("cerrado")
            assertThat(saved.get<String>(KEY_STATE)).isEqualTo("PR")
        }

    // --- "Ave do dia" ---

    @Test
    fun `ao abrir busca a ave do dia e a mostra sem busca nem filtro`() =
        runTest {
            val vm = viewModel()
            assertThat(featured.calls).isEqualTo(1)
            assertThat(vm.state.value.featured).isEqualTo(sampleFeatured)
            assertThat(vm.state.value.showFeatured).isTrue()
        }

    @Test
    fun `com busca ou filtro a ave do dia some da tela`() =
        runTest {
            val vm = viewModel()
            vm.onAction(ExploreAction.QueryChange("bem"))
            assertThat(vm.state.value.showFeatured).isFalse()
            vm.onAction(ExploreAction.QueryChange(""))
            vm.onAction(ExploreAction.SelectBiome("cerrado"))
            assertThat(vm.state.value.showFeatured).isFalse()
        }

    @Test
    fun `se a ave do dia falhar o card nao aparece e nada vira erro`() =
        runTest {
            featured.next = Result.Failure(DataError.Network.NotFound)
            val vm = viewModel()
            assertThat(vm.state.value.featured).isNull()
            assertThat(vm.state.value.showFeatured).isFalse()
            assertThat(vm.state.value.phase).isEqualTo(ExplorePhase.Content)
        }

    /** A "Ave do dia" leva a miniatura e o bioma dela, mas nenhuma chave: a foto não viaja de um card que não foi tocado. */
    private val featuredPreview =
        DetailPreview(photoKey = null, thumbnailUrl = sampleFeatured.species.thumbnailUrl, biome = sampleFeatured.species.primaryBiome)

    @Test
    fun `tocar na ave do dia abre o detalhe e o canto abre tocando`() =
        runTest {
            val vm = viewModel()
            vm.events.test {
                vm.onAction(ExploreAction.OpenFeatured)
                assertThat(awaitItem()).isEqualTo(ExploreEvent.NavigateToDetail(DetailOpening("tuiuiu", preview = featuredPreview)))
                vm.onAction(ExploreAction.PlayFeatured)
                assertThat(awaitItem()).isEqualTo(
                    ExploreEvent.NavigateToDetail(DetailOpening("tuiuiu", autoPlay = true, preview = featuredPreview)),
                )
            }
        }

    // --- Chips de bioma ---

    @Test
    fun `o chip de bioma aplica o filtro e tocar de novo volta a todos`() =
        runTest {
            val vm = viewModel()
            vm.onAction(ExploreAction.SelectBiome("cerrado"))
            assertThat(vm.state.value.biome).isEqualTo("cerrado")
            assertThat(repo.calls.last()).isEqualTo(ListCall("", "cerrado", null, null))
            vm.onAction(ExploreAction.SelectBiome("cerrado"))
            assertThat(vm.state.value.biome).isNull()
            vm.onAction(ExploreAction.SelectBiome("pampa"))
            vm.onAction(ExploreAction.SelectBiome(null))
            assertThat(vm.state.value.biome).isNull()
        }

    @Test
    fun `o chip de bioma mantem a UF escolhida no sheet`() =
        runTest {
            val vm = viewModel(SavedStateHandle(mapOf(KEY_STATE to "SP")))
            vm.onAction(ExploreAction.SelectBiome("pampa"))
            assertThat(repo.calls.last()).isEqualTo(ListCall("", "pampa", "SP", null))
        }

    @Test
    fun `o total de aves vem dos filtros`() =
        runTest {
            filters.next = Result.Success(sampleFilters.copy(primaryBiomes = listOf(BiomeFilter("cerrado", "Cerrado", 41))))
            val vm = viewModel()
            assertThat(vm.state.value.speciesTotal).isEqualTo(41)
        }

    // --- "Ave do dia": o lugar reservado e as novas tentativas (revisão final do E1) ---

    @Test
    fun `enquanto a ave do dia carrega o lugar dela ja existe no topo`() =
        runTest {
            // Se o card só entrasse depois da lista, a grade ficaria parada no primeiro pássaro e o card
            // nasceria acima da tela, fora da vista.
            featured.gate = CompletableDeferred()
            val vm = viewModel()
            assertThat(vm.state.value.featuredLoading).isTrue()
            assertThat(vm.state.value.showFeaturedSlot).isTrue()
            featured.gate!!.complete(Unit)
            assertThat(vm.state.value.featuredLoading).isFalse()
            assertThat(vm.state.value.featured).isEqualTo(sampleFeatured)
        }

    @Test
    fun `sem rede a ave do dia volta junto com a lista no tentar novamente`() =
        runTest {
            featured.next = Result.Failure(DataError.Network.NoConnection)
            repo.pages[null] = Result.Failure(DataError.Network.NoConnection)
            val vm = viewModel()
            assertThat(vm.state.value.featured).isNull()
            featured.next = Result.Success(sampleFeatured)
            repo.pages[null] = Result.Success(page(0, 20, "c1"))
            vm.onAction(ExploreAction.Retry)
            assertThat(vm.state.value.featured).isEqualTo(sampleFeatured)
        }

    @Test
    fun `sem ave elegivel nao pede de novo a cada filtro`() =
        runTest {
            featured.next = Result.Failure(DataError.Network.NotFound)
            val vm = viewModel()
            vm.onAction(ExploreAction.SelectBiome("cerrado"))
            vm.onAction(ExploreAction.SelectBiome(null))
            assertThat(featured.calls).isEqualTo(1)
            assertThat(vm.state.value.showFeaturedSlot).isFalse()
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew --continue :app:testAndroidHostTest :feature:detail:presentation:testAndroidHostTest :feature:explore:presentation:testAndroidHostTest`

Expected: FAIL na compilação dos testes de `:app` (`RoutesTest`), do Detalhe (`DetailPhotoTransitionTest`, `DetailViewModelTest`) e do Explorar (`ExploreViewModelTest`): `Unresolved reference 'DetailOpening'` e `'DetailPreview'`, `No parameter with name 'preview' found` no `DetailState` e `actual type is 'SpeciesSummary', but 'String' was expected` no `ExploreAction.OpenDetail`.

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `app/src/commonMain/kotlin/com/velosobr/passarim/app/App.kt`:

```kotlin
// A raiz do app: tema, carregador de imagens e a navegação de primeiro nível.

package com.velosobr.passarim.app

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.dropUnlessResumed
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import coil3.ImageLoader
import coil3.compose.setSingletonImageLoaderFactory
import com.velosobr.passarim.app.navigation.AboutRoute
import com.velosobr.passarim.app.navigation.DetailRoute
import com.velosobr.passarim.app.navigation.LicensesRoute
import com.velosobr.passarim.app.navigation.StorageRoute
import com.velosobr.passarim.app.navigation.TabsRoute
import com.velosobr.passarim.app.navigation.toRoute
import com.velosobr.passarim.app.tabs.TabsScreen
import com.velosobr.passarim.app.theme.SystemBarsAppearance
import com.velosobr.passarim.core.domain.SettingsRepository
import com.velosobr.passarim.feature.detail.presentation.DetailRoot
import com.velosobr.passarim.feature.settings.presentation.AboutRoot
import com.velosobr.passarim.feature.settings.presentation.LicensesRoot
import com.velosobr.passarim.feature.settings.presentation.StorageRoot
import com.velosobr.piuds.components.PiuSharedScope
import com.velosobr.piuds.components.PiuSharedTransitionLayout
import com.velosobr.piuds.theme.PiuTheme
import com.velosobr.piuds.theme.isDark
import org.koin.compose.koinInject

/**
 * O app inteiro, chamado pelo Android (MainActivity) e pelo iOS
 * (MainViewController). Espera as configurações do DataStore antes de
 * desenhar, para a primeira tela já sair no tema certo; [onSettingsLoaded]
 * avisa a plataforma (o Android segura o splash até lá).
 *
 * koinInject pega uma peça do Koin dentro de uma função @Composable.
 * collectAsState transforma o Flow das configurações num estado que, ao
 * mudar, recompõe a tela; remember guarda o Flow entre recomposições.
 * LaunchedEffect(Unit) roda o bloco uma vez quando a função entra na
 * composição. setSingletonImageLoaderFactory entrega o ImageLoader do Koin a
 * todo AsyncImage do app.
 */
@Composable
fun App(onSettingsLoaded: () -> Unit = {}) {
    val imageLoader = koinInject<ImageLoader>()
    setSingletonImageLoaderFactory { imageLoader }
    val settingsRepository = koinInject<SettingsRepository>()
    val settings by remember(settingsRepository) { settingsRepository.observe() }.collectAsState(initial = null)
    val loaded = settings ?: return
    LaunchedEffect(Unit) { onSettingsLoaded() }
    val darkTheme = loaded.theme.isDark(isSystemInDarkTheme())
    // TODO(frente-D): com a jornada ligada, as barras do sistema devem seguir o PiuTheme.isDark (o Kids é
    // sempre claro); hoje elas seguem só a preferência do adulto.
    SystemBarsAppearance(darkTheme)
    PiuTheme(themeMode = loaded.theme, dynamicColor = loaded.dynamicColors) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            AppNavHost()
        }
    }
}

/**
 * Navegação de primeiro nível: as abas e as telas que abrem por cima delas.
 * Cada rota é uma classe @Serializable (Routes.kt), e os argumentos (o id da
 * espécie) vão nela. dropUnlessResumed só executa o "voltar" com a tela em
 * RESUMED; durante uma transição (entrando ou saindo) o toque é ignorado, o
 * que evita voltar duas vezes com toques rápidos. Os
 * blocos de rota só ligam as telas: os efeitos ficam dentro delas.
 *
 * PiuSharedTransitionLayout em volta do NavHost deixa a foto do card do
 * mosaico viajar até o topo do Detalhe. Cada bloco de rota passa o próprio
 * escopo de animação (o `this` de composable { }) com PiuSharedScope; as
 * abas, que têm o NavHost delas, usam o escopo da rota das abas daqui.
 */
@Composable
private fun AppNavHost() {
    val rootNav = rememberNavController()
    PiuSharedTransitionLayout {
        NavHost(rootNav, startDestination = TabsRoute) {
            composable<TabsRoute> {
                PiuSharedScope(this) {
                    TabsScreen(
                        onOpenDetail = { opening -> rootNav.navigate(opening.toRoute()) },
                        onOpenStorage = { rootNav.navigate(StorageRoute) },
                        onOpenAbout = { rootNav.navigate(AboutRoute) },
                    )
                }
            }
            composable<DetailRoute> {
                PiuSharedScope(this) { DetailRoot(onBack = dropUnlessResumed { rootNav.popBackStack() }) }
            }
            composable<StorageRoute> {
                StorageRoot(onBack = dropUnlessResumed { rootNav.popBackStack() })
            }
            composable<AboutRoute> {
                AboutRoot(
                    onBack = dropUnlessResumed { rootNav.popBackStack() },
                    onOpenLicenses = { rootNav.navigate(LicensesRoute) },
                )
            }
            composable<LicensesRoute> {
                LicensesRoot(onBack = dropUnlessResumed { rootNav.popBackStack() })
            }
        }
    }
}
```

Substitua o conteúdo de `app/src/commonMain/kotlin/com/velosobr/passarim/app/navigation/Routes.kt`:

```kotlin
// As rotas de navegação. Com o Navigation Compose, cada rota é uma classe
// @Serializable: a biblioteca converte a classe (e os argumentos) num destino.

package com.velosobr.passarim.app.navigation

import com.velosobr.passarim.core.presentation.DetailOpening
import kotlinx.serialization.Serializable

/** Camada 1 (raiz): o scaffold com a barra inferior. */
@Serializable
data object TabsRoute

/** A aba Explorar. As três abas são destinos do NavHost interno (TabsScreen), cada um com o estado guardado ao trocar de aba. */
@Serializable
data object ExploreRoute

/** A aba Favoritos. */
@Serializable
data object FavoritesRoute

/** A aba Configurações. */
@Serializable
data object SettingsRoute

/**
 * Tela cheia, empilhada sobre as abas (sem a barra inferior). [autoPlay] abre tocando o canto (o
 * botão de canto da "Ave do dia"); o nome do campo é a chave KEY_AUTO_PLAY que o ViewModel lê.
 * [photoKey], [thumbnailUrl] e [primaryBiome] são a prévia do topo (DetailPreview): o que o card
 * tocado já mostra. Uma rota só leva tipos simples (texto, número, sim/não), por isso o bioma vai
 * pelo código do BFF ("pantanal"), e cada campo tem o nome da chave que o ViewModel lê.
 */
@Serializable
data class DetailRoute(
    val id: String,
    val autoPlay: Boolean = false,
    val photoKey: String? = null,
    val thumbnailUrl: String? = null,
    val primaryBiome: String? = null,
)

/** Converte o pedido de abrir o Detalhe (vindo de uma tela de lista) na rota dele. */
fun DetailOpening.toRoute(): DetailRoute =
    DetailRoute(
        id = id,
        autoPlay = autoPlay,
        photoKey = preview.photoKey,
        thumbnailUrl = preview.thumbnailUrl,
        primaryBiome = preview.biome?.code,
    )

/** Dados e armazenamento (limpar cache), aberta pelas Configurações. */
@Serializable
data object StorageRoute

/** Sobre o app. */
@Serializable
data object AboutRoute

/** As licenças das bibliotecas, aberta pelo Sobre. */
@Serializable
data object LicensesRoute
```

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
import com.velosobr.passarim.core.presentation.DetailOpening
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
    onOpenDetail: (DetailOpening) -> Unit,
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
            // Favoritos e Configurações ganham o visual novo na frente E3; até lá, só reservam o espaço da barra.
            composable<FavoritesRoute> {
                Box(Modifier.padding(barPadding)) {
                    FavoritesRoot(
                        onOpenDetail = { id -> onOpenDetail(DetailOpening(id)) },
                        onOpenExplore = { navController.navigateToTab(Tab.Explore) },
                    )
                }
            }
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

Substitua o conteúdo de `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuHeroPhoto.kt`:

```kotlin
// Foto grande do topo do Detalhe e o botão redondo que fica sobre ela.

package com.velosobr.piuds.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.piuds.theme.PiuDimens
import com.velosobr.piuds.theme.PiuTheme
import com.velosobr.piuds.theme.toBrush

/** Proporção largura:altura da foto do topo. */
private const val HERO_ASPECT_RATIO = 1.3f

/**
 * A foto do topo, com o placeholder por baixo enquanto ela carrega (ou se não
 * houver). [overlay] é um "slot": um bloco @Composable que quem chama passa
 * para desenhar por cima (os botões de voltar e favoritar). AsyncImage é o
 * componente do Coil que baixa e mostra a imagem; ContentScale.Crop preenche o
 * espaço cortando as bordas.
 *
 * Com [biome], o fundo enquanto a foto não chega (ou sem foto) é o gradiente
 * do bioma, como nos cards do mosaico, no lugar do placeholder com o
 * passarinho. Com [aspectRatio] nulo, a altura vem do [modifier] (o Detalhe
 * usa uma altura fixa e faz a foto ocupar o espaço todo). Com
 * [sharedPhotoKey], a foto chega voando do card com a mesma chave (veja
 * PiuSharedPhoto.kt). [placeholderUrl] é uma imagem menor que já está
 * guardada (a miniatura do card tocado), desenhada entre o gradiente e a foto
 * enquanto a foto grande baixa: assim o topo não volta ao gradiente depois de
 * a miniatura ter chegado voando.
 */
@Composable
fun PiuHeroPhoto(
    imageUrl: String?,
    modifier: Modifier = Modifier,
    biome: Biome? = null,
    aspectRatio: Float? = HERO_ASPECT_RATIO,
    placeholderUrl: String? = null,
    sharedPhotoKey: String? = null,
    overlay: @Composable BoxScope.() -> Unit = {},
) {
    Box(modifier.fillMaxWidth().then(if (aspectRatio != null) Modifier.aspectRatio(aspectRatio) else Modifier)) {
        // A camada da foto (fundo e imagem) é a que viaja do card; o overlay fica fora dela.
        Box(Modifier.matchParentSize().piuSharedPhoto(sharedPhotoKey)) {
            if (biome != null) {
                Box(
                    Modifier.fillMaxSize().background(
                        PiuTheme.tokens.gradients
                            .getValue(biome)
                            .toBrush(),
                    ),
                )
            } else {
                PhotoPlaceholder(iconSize = 96.dp)
            }
            if (placeholderUrl != null && placeholderUrl != imageUrl) {
                AsyncImage(
                    model = placeholderUrl,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            if (imageUrl != null) {
                AsyncImage(model = imageUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            }
        }
        overlay()
    }
}

/** Botão redondo e translúcido para ficar legível sobre qualquer foto, com área de toque de 48dp. */
@Composable
fun PiuHeroIconButton(
    icon: Painter,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tint: Color = MaterialTheme.colorScheme.onSurface,
) {
    IconButton(onClick = onClick, modifier = modifier.size(PiuDimens.touchTarget)) {
        Box(
            Modifier.size(40.dp).background(MaterialTheme.colorScheme.surface.copy(alpha = 0.85f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = contentDescription, tint = tint)
        }
    }
}
```

Crie `core/presentation/src/commonMain/kotlin/com/velosobr/passarim/core/presentation/DetailOpening.kt`:

```kotlin
// O pedido de abrir o Detalhe de uma ave, que as telas de lista (Explorar,
// Favoritos) entregam ao app para ele navegar. Mora aqui, no módulo que todas
// as telas usam, porque quem pede (o Explorar) e quem recebe (o Detalhe) são
// módulos que não se conhecem; o app converte o pedido na rota do Detalhe.

package com.velosobr.passarim.core.presentation

import com.velosobr.passarim.core.domain.Biome

/**
 * O que o card tocado já sabe da ave e o Detalhe pode desenhar antes de a ave chegar da rede: a
 * [photoKey] do elemento compartilhado (a foto que viaja do card, veja SharedPhotoKey.kt), a
 * [thumbnailUrl] da miniatura, que o carregador de imagens já tem guardada, e o [biome] principal,
 * cujo gradiente fica atrás da foto. Tudo é opcional: sem chave, a foto não viaja (abrir pelos
 * Favoritos, por exemplo); sem miniatura nem bioma, o topo mostra o bloco cinza do carregamento.
 */
data class DetailPreview(
    val photoKey: String? = null,
    val thumbnailUrl: String? = null,
    val biome: Biome? = null,
)

/** Abrir o Detalhe da ave [id]; com [autoPlay], o canto começa ao abrir; [preview] é o que o card já mostra. */
data class DetailOpening(
    val id: String,
    val autoPlay: Boolean = false,
    val preview: DetailPreview = DetailPreview(),
)
```

Substitua o conteúdo de `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailContent.kt`:

```kotlin
// O conteúdo do Detalhe de uma espécie, seção por seção.

package com.velosobr.passarim.feature.detail.presentation

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Credit
import com.velosobr.passarim.feature.detail.domain.Audio
import com.velosobr.passarim.feature.detail.domain.Cluster
import com.velosobr.passarim.feature.detail.domain.PlaybackState
import com.velosobr.passarim.feature.detail.domain.SpeciesDetail
import com.velosobr.passarim.feature.detail.domain.WhereToFind
import com.velosobr.passarim.feature.detail.domain.isSafeLink
import com.velosobr.passarim.feature.detail.presentation.resources.Res
import com.velosobr.passarim.feature.detail.presentation.resources.credit_audio
import com.velosobr.passarim.feature.detail.presentation.resources.credit_open_source
import com.velosobr.passarim.feature.detail.presentation.resources.credit_photo
import com.velosobr.passarim.feature.detail.presentation.resources.credit_photo_numbered
import com.velosobr.passarim.feature.detail.presentation.resources.credit_text
import com.velosobr.passarim.feature.detail.presentation.resources.credit_unknown_author
import com.velosobr.passarim.feature.detail.presentation.resources.credit_unknown_license
import com.velosobr.passarim.feature.detail.presentation.resources.credits_toggle
import com.velosobr.passarim.feature.detail.presentation.resources.fact_biomes
import com.velosobr.passarim.feature.detail.presentation.resources.fact_bullet
import com.velosobr.passarim.feature.detail.presentation.resources.fact_occurrence
import com.velosobr.passarim.feature.detail.presentation.resources.fact_size
import com.velosobr.passarim.feature.detail.presentation.resources.fact_size_value
import com.velosobr.passarim.feature.detail.presentation.resources.fact_states
import com.velosobr.passarim.feature.detail.presentation.resources.family
import com.velosobr.passarim.feature.detail.presentation.resources.section_about
import com.velosobr.passarim.feature.detail.presentation.resources.section_biome
import com.velosobr.passarim.feature.detail.presentation.resources.section_diet
import com.velosobr.passarim.feature.detail.presentation.resources.section_facts
import com.velosobr.passarim.feature.detail.presentation.resources.section_gallery
import com.velosobr.passarim.feature.detail.presentation.resources.section_song
import com.velosobr.passarim.feature.detail.presentation.resources.section_where
import com.velosobr.piuds.components.GalleryPhoto
import com.velosobr.piuds.components.PiuConservationBadge
import com.velosobr.piuds.components.PiuCreditCaption
import com.velosobr.piuds.components.PiuFactTile
import com.velosobr.piuds.components.PiuInfoChips
import com.velosobr.piuds.components.PiuLabeledChips
import com.velosobr.piuds.components.PiuPhotoGallery
import com.velosobr.piuds.theme.PiuDimens
import org.jetbrains.compose.resources.pluralStringResource
import org.jetbrains.compose.resources.stringResource

/**
 * A página rolável do Detalhe: foto do topo com o nome (DetailHero), cabeçalho, fatos, biomas,
 * dieta, canto, descrição, curiosidades, galeria, "Onde encontrar" e
 * créditos. Seções sem dado não aparecem. [mapContent] é um slot para o mapa,
 * para os snapshots trocarem o MapLibre por um desenho simples.
 * Quando a página rola, uma faixa da cor do fundo cobre a barra de status,
 * para o texto não passar por baixo do relógio.
 */
@Composable
internal fun DetailContent(
    detail: SpeciesDetail,
    state: DetailState,
    onAction: (DetailAction) -> Unit,
    mapContent: @Composable (List<Cluster>, Modifier) -> Unit,
    scrollState: ScrollState,
) {
    val credit = rememberCreditFormatter()
    Box {
        Column(Modifier.fillMaxSize().verticalScroll(scrollState).navigationBarsPadding()) {
            DetailHero(detail, state.preview, state.isFavorite, onAction)
            Column(
                Modifier.padding(start = 20.dp, end = 20.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(24.dp),
            ) {
                Header(
                    detail,
                    detail.photos
                        .firstOrNull()
                        ?.credit
                        ?.let { stringResource(Res.string.credit_photo, credit(it)) },
                )
                Facts(detail)
                if (detail.biomes.isNotEmpty()) PiuLabeledChips(stringResource(Res.string.section_biome), detail.biomes.map { it.label })
                detail.diet?.let { Diet(it) }
                detail.audio?.let { Song(it, state.player, credit, onAction) }
                if (detail.description.isNotBlank()) {
                    Section(stringResource(Res.string.section_about)) {
                        Text(detail.description, style = MaterialTheme.typography.bodyMedium)
                        PiuCreditCaption(stringResource(Res.string.credit_text, credit(detail.descriptionCredit)))
                    }
                }
                if (detail.facts.isNotEmpty()) {
                    Section(stringResource(Res.string.section_facts)) {
                        detail.facts.forEach {
                            Text(
                                stringResource(Res.string.fact_bullet, it),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                }
                if (detail.photos.size > 1) {
                    Section(stringResource(Res.string.section_gallery)) {
                        PiuPhotoGallery(detail.photos.drop(1).map { GalleryPhoto(it.galleryUrl, credit(it.credit)) })
                    }
                }
                WhereToFindSection(detail.whereToFind, mapContent)
                Credits(detail, state.creditsExpanded, credit, onAction)
            }
        }
        if (scrollState.value > 0) {
            Box(Modifier.fillMaxWidth().windowInsetsTopHeight(WindowInsets.statusBars).background(MaterialTheme.colorScheme.surface))
        }
    }
}

/** A seção de dieta. */
@Composable
private fun Diet(diet: String) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            stringResource(Res.string.section_diet),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(diet, style = MaterialTheme.typography.bodyMedium)
    }
}

/** A seção do canto, com o player. */
@Composable
private fun Song(
    audio: Audio,
    playback: PlaybackState,
    credit: (Credit) -> String,
    onAction: (DetailAction) -> Unit,
) {
    Section(stringResource(Res.string.section_song)) {
        AudioPlayerCard(
            durationMs = audio.durationMs,
            peaks = audio.peaks,
            credit = stringResource(Res.string.credit_audio, credit(audio.credit)),
            playback = playback,
            onTogglePlay = { onAction(DetailAction.TogglePlay) },
            onSeek = { onAction(DetailAction.Seek(it)) },
        )
    }
}

/** "Onde encontrar": o mapa e as UFs; some se não houver nenhum dos dois. */
@Composable
private fun WhereToFindSection(
    where: WhereToFind,
    mapContent: @Composable (List<Cluster>, Modifier) -> Unit,
) {
    if (where.clusters.isEmpty() && where.states.isEmpty()) return
    Section(stringResource(Res.string.section_where)) {
        mapContent(where.clusters, Modifier)
        if (where.states.isNotEmpty()) PiuInfoChips(where.states)
    }
}

/**
 * O que vem logo abaixo da foto: o crédito dela, o selo de conservação e a família. O nome e o
 * nome científico ficam sobre a foto (DetailHero).
 */
@Composable
private fun Header(
    detail: SpeciesDetail,
    photoCredit: String?,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        photoCredit?.let { PiuCreditCaption(it) }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            detail.conservation?.let { PiuConservationBadge(it, Modifier.align(Alignment.CenterVertically)) }
            Text(
                stringResource(Res.string.family, detail.family),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.align(Alignment.CenterVertically),
            )
        }
    }
}

/**
 * Os blocos de fatos (tamanho, número de biomas e de UFs), lado a lado ou
 * empilhados com fonte grande. pluralStringResource escolhe "1 bioma" ou
 * "3 biomas" conforme o número.
 */
@Composable
private fun Facts(detail: SpeciesDetail) {
    val tiles =
        buildList {
            detail.sizeCm?.let { add(stringResource(Res.string.fact_size_value, it) to stringResource(Res.string.fact_size)) }
            val biomes = detail.biomes.size
            if (biomes > 0) add(pluralStringResource(Res.plurals.fact_biomes, biomes, biomes) to stringResource(Res.string.fact_occurrence))
            val states = detail.whereToFind.states.size
            if (states > 0) add(pluralStringResource(Res.plurals.fact_states, states, states) to stringResource(Res.string.fact_occurrence))
        }
    if (tiles.isEmpty()) return
    if (factsInSingleColumn(LocalDensity.current.fontScale)) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            tiles.forEach { (value, label) -> PiuFactTile(value, label, Modifier.fillMaxWidth()) }
        }
    } else {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            tiles.forEach { (value, label) -> PiuFactTile(value, label, Modifier.weight(1f)) }
        }
    }
}

/** Uma seção com título e conteúdo. */
@Composable
private fun Section(
    title: String,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
        content()
    }
}

/** O botão que abre e fecha a lista completa de créditos (fotos, numeradas quando há mais de uma, canto e texto). */
@Composable
private fun Credits(
    detail: SpeciesDetail,
    expanded: Boolean,
    credit: (Credit) -> String,
    onAction: (DetailAction) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        TextButton(onClick = { onAction(DetailAction.ToggleCredits) }, modifier = Modifier.heightIn(min = PiuDimens.touchTarget)) {
            Text(stringResource(Res.string.credits_toggle))
        }
        if (!expanded) return@Column
        val photos = detail.photos
        photos.forEachIndexed { index, photo ->
            val line =
                if (photos.size == 1) {
                    stringResource(Res.string.credit_photo, credit(photo.credit))
                } else {
                    stringResource(Res.string.credit_photo_numbered, index + 1, credit(photo.credit))
                }
            CreditEntry(line, photo.credit.sourceUrl, onAction)
        }
        detail.audio?.let { CreditEntry(stringResource(Res.string.credit_audio, credit(it.credit)), it.credit.sourceUrl, onAction) }
        CreditEntry(stringResource(Res.string.credit_text, credit(detail.descriptionCredit)), detail.descriptionCredit.sourceUrl, onAction)
    }
}

/** Uma linha de crédito, com o link para o original quando ele é seguro (https). */
@Composable
private fun CreditEntry(
    text: String,
    url: String?,
    onAction: (DetailAction) -> Unit,
) {
    Column {
        Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (url != null && isSafeLink(url)) {
            TextButton(
                onClick = { onAction(DetailAction.OpenCredit(url)) },
                modifier = Modifier.heightIn(min = PiuDimens.touchTarget),
            ) {
                Text(stringResource(Res.string.credit_open_source))
            }
        }
    }
}

/** Monta a função que escreve "autor · licença", com os textos traduzidos de "desconhecido". */
@Composable
private fun rememberCreditFormatter(): (Credit) -> String {
    val unknownAuthor = stringResource(Res.string.credit_unknown_author)
    val unknownLicense = stringResource(Res.string.credit_unknown_license)
    return { creditLine(it, unknownAuthor, unknownLicense) }
}
```

Substitua o conteúdo de `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailHero.kt`:

```kotlin
// O topo do Detalhe (prancheta Detalhe.dc.html, frente E): a foto de ponta a
// ponta, que vai até atrás da barra de status, o nome da ave em branco sobre
// o scrim na base da foto, uma faixa que funde a foto ao fundo da tela e os
// botões de voltar e de favoritar em círculos de vidro fosco por cima.

package com.velosobr.passarim.feature.detail.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconToggleButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.presentation.DetailPreview
import com.velosobr.passarim.feature.detail.domain.SpeciesDetail
import com.velosobr.passarim.feature.detail.presentation.resources.Res
import com.velosobr.passarim.feature.detail.presentation.resources.back
import com.velosobr.piuds.components.PiuBlurState
import com.velosobr.piuds.components.PiuBlurSurface
import com.velosobr.piuds.components.PiuHeroPhoto
import com.velosobr.piuds.components.adult.photoTextScrim
import com.velosobr.piuds.components.piuBlurSource
import com.velosobr.piuds.components.rememberPiuBlurState
import com.velosobr.piuds.resources.favorite_add
import com.velosobr.piuds.resources.favorite_remove
import com.velosobr.piuds.resources.ic_arrow_back
import com.velosobr.piuds.resources.ic_favorite_filled
import com.velosobr.piuds.resources.ic_favorites
import com.velosobr.piuds.theme.PiuDimens
import com.velosobr.piuds.theme.PiuTheme
import org.jetbrains.compose.resources.stringResource
import org.jetbrains.compose.resources.vectorResource
import com.velosobr.piuds.resources.Res as DesignRes

/** A altura da foto de ponta a ponta do topo (prancheta Detalhe.dc.html). */
val HERO_HEIGHT = 430.dp

/** O gradiente atrás da foto de uma ave sem bioma principal (BFF antigo): o do Pantanal, como no mosaico. */
internal val FallbackBiome = Biome.PANTANAL

/** A altura da faixa que funde a base da foto (já escurecida pelo scrim) à cor do fundo da tela. */
private val FadeHeight = 32.dp

/**
 * O topo: foto, nome e botões. A caixa tem no mínimo [HERO_HEIGHT]; com fonte grande, o nome
 * empurra a caixa para baixo em vez de ser cortado. A foto é a fonte do desfoque
 * (piuBlurSource): os botões desfocam o que está atrás deles. Ao abrir por um card, ela chega
 * voando dele com a chave da [preview] (a mesma do esqueleto do carregamento), e a miniatura do
 * card fica por baixo até a foto grande baixar. Ela fica numa camada à parte dos
 * botões porque uma superfície não pode desfocar a si mesma.
 *
 * O nome fica num bloco com o photoTextScrim, o degradê escuro do PiuDS que garante o contraste
 * do branco sobre qualquer foto (inclusive uma foto toda branca). Embaixo dele, uma faixa vai da
 * cor do scrim à cor do fundo do tema, e a foto se funde à página: no tema escuro a emenda some,
 * no claro vira uma transição curta do escuro para o claro.
 */
@Composable
internal fun DetailHero(
    detail: SpeciesDetail,
    preview: DetailPreview,
    isFavorite: Boolean,
    onAction: (DetailAction) -> Unit,
) {
    val blur = rememberPiuBlurState()
    val scrim = PiuTheme.tokens.scrim
    Box(Modifier.fillMaxWidth().heightIn(min = HERO_HEIGHT)) {
        PiuHeroPhoto(
            imageUrl = detail.photos.firstOrNull()?.heroUrl,
            biome = detail.primaryBiome ?: preview.biome ?: FallbackBiome,
            aspectRatio = null,
            placeholderUrl = preview.thumbnailUrl,
            sharedPhotoKey = preview.photoKey,
            modifier = Modifier.matchParentSize().piuBlurSource(blur),
        )
        Column(Modifier.align(Alignment.BottomStart).fillMaxWidth()) {
            // Guarda o lugar da barra de status e dos botões: um nome longo nunca sobe para baixo deles.
            Spacer(Modifier.statusBarsPadding().height(PiuDimens.touchTarget + 32.dp))
            Column(
                Modifier
                    .fillMaxWidth()
                    .photoTextScrim(scrim, fade = 48.dp)
                    .padding(start = 20.dp, end = 20.dp, top = 56.dp, bottom = 8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    detail.commonName,
                    style = MaterialTheme.typography.headlineLarge,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color.White,
                )
                Text(
                    detail.scientificName,
                    style = MaterialTheme.typography.bodyLarge,
                    fontStyle = FontStyle.Italic,
                    color = Color.White.copy(alpha = 0.9f),
                )
            }
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(FadeHeight)
                    .background(Brush.verticalGradient(listOf(scrim, MaterialTheme.colorScheme.background))),
            )
        }
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            BackButton(blur, onBack = { onAction(DetailAction.Back) })
            FavoriteButton(blur, detail.commonName, isFavorite, onToggle = { onAction(DetailAction.ToggleFavorite) })
        }
    }
}

/**
 * O botão de voltar: um círculo de vidro fosco de 48 dp (PiuBlurSurface) com a tinta translúcida
 * da superfície do tema, que dá contraste ao ícone mesmo onde o desfoque não roda.
 */
@Composable
internal fun BackButton(
    blur: PiuBlurState,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    GlassCircle(blur, modifier) {
        IconButton(onClick = onBack, modifier = Modifier.size(PiuDimens.touchTarget)) {
            Icon(vectorResource(DesignRes.drawable.ic_arrow_back), contentDescription = stringResource(Res.string.back))
        }
    }
}

/**
 * O coração: IconToggleButton é um botão de liga/desliga, então o leitor de tela anuncia se a ave
 * já está nos favoritos, e a descrição diz o que o toque vai fazer ("Favoritar Tuiuiú").
 */
@Composable
private fun FavoriteButton(
    blur: PiuBlurState,
    name: String,
    isFavorite: Boolean,
    onToggle: () -> Unit,
) {
    GlassCircle(blur) {
        IconToggleButton(checked = isFavorite, onCheckedChange = { onToggle() }, modifier = Modifier.size(PiuDimens.touchTarget)) {
            Icon(
                vectorResource(if (isFavorite) DesignRes.drawable.ic_favorite_filled else DesignRes.drawable.ic_favorites),
                contentDescription =
                    stringResource(
                        if (isFavorite) DesignRes.string.favorite_remove else DesignRes.string.favorite_add,
                        name,
                    ),
                tint = if (isFavorite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

/** O círculo de vidro fosco de 48 dp que os dois botões usam. */
@Composable
private fun GlassCircle(
    blur: PiuBlurState,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    PiuBlurSurface(
        state = blur,
        shape = CircleShape,
        tint = MaterialTheme.colorScheme.surface.copy(alpha = 0.6f),
        modifier = modifier.size(PiuDimens.touchTarget),
    ) { content() }
}
```

Substitua o conteúdo de `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailScreen.kt`:

```kotlin
// A tela de Detalhe: escolhe o que mostrar em cada fase (carregando,
// conteúdo, não encontrada ou erro).

package com.velosobr.passarim.feature.detail.presentation

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.presentation.DetailPreview
import com.velosobr.passarim.core.presentation.ScreenError
import com.velosobr.passarim.feature.detail.domain.Cluster
import com.velosobr.passarim.feature.detail.presentation.resources.Res
import com.velosobr.passarim.feature.detail.presentation.resources.back
import com.velosobr.passarim.feature.detail.presentation.resources.error_generic_body
import com.velosobr.passarim.feature.detail.presentation.resources.error_generic_title
import com.velosobr.passarim.feature.detail.presentation.resources.error_no_connection_body
import com.velosobr.passarim.feature.detail.presentation.resources.error_no_connection_title
import com.velosobr.passarim.feature.detail.presentation.resources.error_rate_limited_body
import com.velosobr.passarim.feature.detail.presentation.resources.error_rate_limited_title
import com.velosobr.passarim.feature.detail.presentation.resources.error_server_body
import com.velosobr.passarim.feature.detail.presentation.resources.error_server_title
import com.velosobr.passarim.feature.detail.presentation.resources.not_found_action
import com.velosobr.passarim.feature.detail.presentation.resources.not_found_body
import com.velosobr.passarim.feature.detail.presentation.resources.not_found_title
import com.velosobr.passarim.feature.detail.presentation.resources.retry
import com.velosobr.piuds.components.PiuHeroPhoto
import com.velosobr.piuds.components.PiuSkeletonBox
import com.velosobr.piuds.components.PiuStateScreen
import com.velosobr.piuds.components.StateTone
import com.velosobr.piuds.components.piuBlurSource
import com.velosobr.piuds.components.piuSharedPhoto
import com.velosobr.piuds.components.rememberPiuBlurState
import com.velosobr.piuds.resources.ic_arrow_back
import com.velosobr.piuds.resources.ic_bird
import com.velosobr.piuds.resources.ic_cloud_off
import com.velosobr.piuds.resources.ic_wifi_off
import com.velosobr.piuds.theme.PiuDimens
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.painterResource
import org.jetbrains.compose.resources.stringResource
import org.jetbrains.compose.resources.vectorResource
import com.velosobr.piuds.resources.Res as DesignRes

/**
 * A tela sem estado próprio: tudo vem de [state] e cada interação vira uma
 * [DetailAction]. [mapContent] tem o mapa de verdade como padrão; os snapshots
 * passam outro.
 */
@Composable
fun DetailScreen(
    state: DetailState,
    onAction: (DetailAction) -> Unit,
    mapContent: @Composable (List<Cluster>, Modifier) -> Unit = { clusters, modifier -> SpeciesMap(clusters, modifier) },
    scrollState: ScrollState = rememberScrollState(),
) {
    when (val phase = state.phase) {
        DetailPhase.Loading -> DetailSkeleton(state.preview, onBack = { onAction(DetailAction.Back) })
        is DetailPhase.Content -> DetailContent(phase.detail, state, onAction, mapContent, scrollState)
        DetailPhase.NotFound ->
            StatePage(onBack = { onAction(DetailAction.Back) }) {
                PiuStateScreen(
                    icon = painterResource(DesignRes.drawable.ic_bird),
                    title = stringResource(Res.string.not_found_title),
                    body = stringResource(Res.string.not_found_body),
                ) {
                    Button(onClick = { onAction(DetailAction.Back) }, modifier = Modifier.height(PiuDimens.touchTarget)) {
                        Text(stringResource(Res.string.not_found_action))
                    }
                }
            }
        is DetailPhase.Error -> {
            val copy = phase.error.copy()
            StatePage(onBack = { onAction(DetailAction.Back) }) {
                PiuStateScreen(
                    icon = painterResource(copy.icon),
                    title = stringResource(copy.title),
                    body = stringResource(copy.body),
                    tone = StateTone.Error,
                ) {
                    Button(
                        onClick = { onAction(DetailAction.Retry) },
                        enabled = state.retryEnabled,
                        modifier = Modifier.height(PiuDimens.touchTarget),
                    ) { Text(stringResource(Res.string.retry)) }
                }
            }
        }
    }
}

/**
 * O "esqueleto" do carregamento, já com o botão de voltar funcionando, no mesmo lugar e no mesmo
 * círculo de vidro do conteúdo. O topo é a fonte do desfoque do botão.
 *
 * Ao abrir por um card, o Detalhe quase sempre nasce aqui (a ave ainda vem da rede), e é este topo
 * que recebe a foto que viaja do card: ele já tem a chave da [preview] no primeiro quadro, e mostra
 * a miniatura do card sobre o gradiente do bioma, então a foto chega sem virar um bloco cinza. Sem
 * miniatura nem bioma (aberto pelos Favoritos), o topo é o bloco cinza de sempre, com a chave se
 * houver.
 */
@Composable
private fun DetailSkeleton(
    preview: DetailPreview,
    onBack: () -> Unit,
) {
    val blur = rememberPiuBlurState()
    Column(Modifier.fillMaxSize()) {
        Box {
            val heroModifier = Modifier.fillMaxWidth().height(HERO_HEIGHT).piuBlurSource(blur)
            if (preview.thumbnailUrl != null || preview.biome != null) {
                PiuHeroPhoto(
                    imageUrl = preview.thumbnailUrl,
                    biome = preview.biome ?: FallbackBiome,
                    aspectRatio = null,
                    sharedPhotoKey = preview.photoKey,
                    modifier = heroModifier,
                )
            } else {
                PiuSkeletonBox(heroModifier.piuSharedPhoto(preview.photoKey), shape = RectangleShape)
            }
            BackButton(blur, onBack, Modifier.statusBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp))
        }
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            PiuSkeletonBox(Modifier.width(250.dp).height(32.dp))
            PiuSkeletonBox(Modifier.width(180.dp).height(18.dp))
            PiuSkeletonBox(Modifier.width(125.dp).height(24.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                repeat(3) { PiuSkeletonBox(Modifier.weight(1f).height(64.dp)) }
            }
            PiuSkeletonBox(Modifier.fillMaxWidth().height(72.dp))
            PiuSkeletonBox(Modifier.fillMaxWidth().height(14.dp))
            PiuSkeletonBox(Modifier.fillMaxWidth().height(14.dp))
            PiuSkeletonBox(Modifier.width(285.dp).height(14.dp))
        }
    }
}

/** Página das telas de estado (não encontrada, erro), com o botão de voltar no topo. */
@Composable
private fun StatePage(
    onBack: () -> Unit,
    content: @Composable () -> Unit,
) {
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        IconButton(onClick = onBack, modifier = Modifier.padding(8.dp)) {
            Icon(vectorResource(DesignRes.drawable.ic_arrow_back), contentDescription = stringResource(Res.string.back))
        }
        Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
            Box(Modifier.verticalScroll(rememberScrollState()).padding(vertical = 24.dp)) { content() }
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
```

Substitua o conteúdo de `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailState.kt`:

```kotlin
// O estado da tela de Detalhe.

package com.velosobr.passarim.feature.detail.presentation

import com.velosobr.passarim.core.presentation.DetailPreview
import com.velosobr.passarim.core.presentation.ScreenError
import com.velosobr.passarim.feature.detail.domain.PlaybackState
import com.velosobr.passarim.feature.detail.domain.SpeciesDetail

/**
 * O estado da tela: a fase do conteúdo, o favorito, os créditos abertos e o player. [preview] vem
 * da rota (o card que abriu o Detalhe) e não muda: o topo a usa enquanto carrega e, depois, para a
 * foto voltar ao mesmo card no "voltar".
 */
data class DetailState(
    val phase: DetailPhase = DetailPhase.Loading,
    val preview: DetailPreview = DetailPreview(),
    val retryEnabled: Boolean = true,
    val isFavorite: Boolean = false,
    val creditsExpanded: Boolean = false,
    val player: PlaybackState = PlaybackState.Idle,
)

/** Em que ponto o conteúdo está: carregando, pronto, não encontrado ou com erro. */
sealed interface DetailPhase {
    data object Loading : DetailPhase

    data class Content(
        val detail: SpeciesDetail,
    ) : DetailPhase

    data object NotFound : DetailPhase

    data class Error(
        val error: ScreenError,
    ) : DetailPhase
}
```

Substitua o conteúdo de `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailViewModel.kt`:

```kotlin
// O ViewModel do Detalhe.

package com.velosobr.passarim.feature.detail.presentation

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.FavoritesRepository
import com.velosobr.passarim.core.domain.SettingsRepository
import com.velosobr.passarim.core.domain.biomeOf
import com.velosobr.passarim.core.domain.onFailure
import com.velosobr.passarim.core.domain.onSuccess
import com.velosobr.passarim.core.presentation.DetailPreview
import com.velosobr.passarim.core.presentation.ScreenError
import com.velosobr.passarim.core.presentation.toScreenError
import com.velosobr.passarim.feature.detail.domain.AudioPlayer
import com.velosobr.passarim.feature.detail.domain.DetailRepository
import com.velosobr.passarim.feature.detail.domain.PlaybackState
import com.velosobr.passarim.feature.detail.domain.SpeciesDetail
import com.velosobr.passarim.feature.detail.domain.isSafeLink
import com.velosobr.passarim.feature.detail.domain.isValidSpeciesId
import com.velosobr.passarim.feature.detail.domain.toSummary
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Nome do argumento da rota com o id da espécie, lido do SavedStateHandle. */
const val KEY_SPECIES_ID = "id"

/**
 * Argumento da rota que pede o canto tocando ao abrir (o botão de canto da "Ave do dia"). Vale
 * mesmo com a reprodução automática desligada nas Configurações.
 */
const val KEY_AUTO_PLAY = "autoPlay"

/** Argumento da rota com a chave da foto que viaja do card tocado (nulo: a foto não viaja). */
const val KEY_PHOTO_KEY = "photoKey"

/** Argumento da rota com a miniatura do card tocado, desenhada no topo enquanto a ave carrega. */
const val KEY_THUMBNAIL_URL = "thumbnailUrl"

/** Argumento da rota com o código do bioma principal ("pantanal"), o gradiente atrás da foto. */
const val KEY_PRIMARY_BIOME = "primaryBiome"

/**
 * Carrega a espécie, acompanha o favorito e o player, e trata as ações da
 * tela. Ao carregar, se a espécie já é favorita, atualiza o resumo guardado;
 * toca o canto sozinho se a rota pede (KEY_AUTO_PLAY, o canto da "Ave do
 * dia") ou se a reprodução automática está ligada nas Configurações.
 */
class DetailViewModel(
    savedState: SavedStateHandle,
    private val repository: DetailRepository,
    private val favorites: FavoritesRepository,
    private val settings: SettingsRepository,
    private val player: AudioPlayer,
) : ViewModel() {
    private val id: String = savedState[KEY_SPECIES_ID] ?: ""
    private val autoPlayRequested: Boolean = savedState[KEY_AUTO_PLAY] ?: false

    // A prévia do topo (chave da foto, miniatura e bioma) chega pela rota e já vale no primeiro quadro.
    private val _state =
        MutableStateFlow(
            DetailState(
                preview =
                    DetailPreview(
                        photoKey = savedState[KEY_PHOTO_KEY],
                        thumbnailUrl = savedState[KEY_THUMBNAIL_URL],
                        biome = biomeOf(savedState[KEY_PRIMARY_BIOME]),
                    ),
            ),
        )
    val state: StateFlow<DetailState> = _state.asStateFlow()

    private val eventChannel = Channel<DetailEvent>(Channel.BUFFERED)
    val events: Flow<DetailEvent> = eventChannel.receiveAsFlow()

    private var retryJob: Job? = null

    private val detail: SpeciesDetail?
        get() = (_state.value.phase as? DetailPhase.Content)?.detail

    init {
        favorites.observeIds().onEach { ids -> _state.update { it.copy(isFavorite = id in ids) } }.launchIn(viewModelScope)
        player.state.onEach { playback -> _state.update { it.copy(player = playback) } }.launchIn(viewModelScope)
        if (isValidSpeciesId(id)) load() else _state.update { it.copy(phase = DetailPhase.NotFound) }
    }

    /** Trata cada ação da tela. Um link de crédito só é aberto se for seguro (https). */
    fun onAction(action: DetailAction) {
        when (action) {
            DetailAction.Back -> eventChannel.trySend(DetailEvent.NavigateBack)
            DetailAction.Retry -> if (_state.value.retryEnabled) load()
            DetailAction.ToggleFavorite -> detail?.let { viewModelScope.launch { favorites.toggle(it.toSummary()) } }
            DetailAction.TogglePlay -> togglePlay()
            is DetailAction.Seek -> player.seekTo(action.positionMs)
            DetailAction.ToggleCredits -> _state.update { it.copy(creditsExpanded = !it.creditsExpanded) }
            is DetailAction.OpenCredit -> if (isSafeLink(action.url)) eventChannel.trySend(DetailEvent.OpenUrl(action.url))
            DetailAction.ScreenPaused -> if (isPlaying()) player.pause()
        }
    }

    /** onCleared roda quando o ViewModel sai de vez: o player é liberado. */
    override fun onCleared() {
        player.release()
    }

    /** Busca a espécie; "não encontrado" tem tela própria, os outros erros viram a tela de erro. */
    private fun load() {
        retryJob?.cancel()
        _state.update { it.copy(phase = DetailPhase.Loading, retryEnabled = true) }
        viewModelScope.launch {
            repository
                .get(id)
                .onSuccess { detail ->
                    _state.update { it.copy(phase = DetailPhase.Content(detail)) }
                    if (id in favorites.observeIds().first()) favorites.refresh(detail.toSummary())
                    if (autoPlayRequested || settings.observe().first().autoPlay) detail.audio?.let { player.play(it.url) }
                }.onFailure { error ->
                    if (error == DataError.Network.NotFound) {
                        _state.update { it.copy(phase = DetailPhase.NotFound) }
                    } else {
                        showError(error.toScreenError())
                    }
                }
        }
    }

    /** Mostra o erro; com RateLimited, o botão de tentar fica desligado pelo Retry-After. */
    private fun showError(error: ScreenError) {
        val wait = (error as? ScreenError.RateLimited)?.retryAfterSeconds
        _state.update { it.copy(phase = DetailPhase.Error(error), retryEnabled = wait == null) }
        if (wait != null) {
            retryJob =
                viewModelScope.launch {
                    delay(wait * 1_000L)
                    _state.update { it.copy(retryEnabled = true) }
                }
        }
    }

    /** Toca ou pausa o canto, se a espécie tiver um. */
    private fun togglePlay() {
        val audio = detail?.audio ?: return
        if (isPlaying()) player.pause() else player.play(audio.url)
    }

    /** Se o canto está tocando ou carregando para tocar. */
    private fun isPlaying(): Boolean = _state.value.player.let { it is PlaybackState.Playing || it == PlaybackState.Loading }
}
```

Substitua o conteúdo de `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreAction.kt`:

```kotlin
// As ações que a tela Explorar manda ao ViewModel e os eventos de uma vez que
// ele devolve. É o padrão MVI: a tela só desenha o estado e avisa o que o
// usuário fez; quem decide o que acontecer é o ViewModel.

package com.velosobr.passarim.feature.explore.presentation

import com.velosobr.passarim.core.domain.SpeciesSummary
import com.velosobr.passarim.core.presentation.DetailOpening

/** Tudo o que o usuário pode fazer no Explorar. */
sealed interface ExploreAction {
    /** O texto da busca mudou. */
    data class QueryChange(
        val text: String,
    ) : ExploreAction

    /** Chegou perto do fim da grade (veja [shouldLoadMore]). */
    data object LoadMore : ExploreAction

    /** "Tentar novamente" na linha de erro do fim da grade. */
    data object RetryLoadMore : ExploreAction

    /** "Tentar novamente" da tela de erro. */
    data object Retry : ExploreAction

    /** "Limpar filtros" do estado vazio: tira bioma e estado, mantém a busca. */
    data object ClearFilters : ExploreAction

    /** O X do chip selecionado. */
    data object ClearBiome : ExploreAction

    /** O X do chip de UF. */
    data object ClearState : ExploreAction

    /** Abre o sheet de filtros. */
    data object OpenFilters : ExploreAction

    /** Fecha o sheet sem aplicar. */
    data object DismissFilters : ExploreAction

    /** Seleciona o bioma no sheet; tocar no já selecionado desmarca. */
    data class SheetBiome(
        val code: String,
    ) : ExploreAction

    /** Seleciona a UF no sheet; tocar na já selecionada desmarca. */
    data class SheetState(
        val code: String,
    ) : ExploreAction

    /** "Ver todos os estados" do sheet. */
    data object ShowAllStates : ExploreAction

    /** "Limpar" do sheet: desmarca tudo no sheet. */
    data object ClearSheet : ExploreAction

    /** "Mostrar aves". */
    data object ApplyFilters : ExploreAction

    /** Tenta carregar os filtros de novo. */
    data object RetryFilters : ExploreAction

    /** O coração de um card. */
    data class ToggleFavorite(
        val summary: SpeciesSummary,
    ) : ExploreAction

    /** Toque num card: leva a ave inteira, para o Detalhe já nascer com a miniatura e o bioma dela. */
    data class OpenDetail(
        val summary: SpeciesSummary,
    ) : ExploreAction

    /** "Ver favoritos" da tela sem conexão. */
    data object OpenFavorites : ExploreAction

    /**
     * Toque num chip de bioma: [code] aplica o bioma; o mesmo bioma de novo, ou null ("Todos"),
     * tira o filtro. A UF escolhida no sheet continua.
     */
    data class SelectBiome(
        val code: String?,
    ) : ExploreAction

    /** Toque no card da "Ave do dia": abre o Detalhe. */
    data object OpenFeatured : ExploreAction

    /** Toque no botão de canto da "Ave do dia": abre o Detalhe já tocando o canto. */
    data object PlayFeatured : ExploreAction
}

/**
 * Eventos que acontecem uma vez (navegar): não fazem parte do estado, para
 * não se repetirem ao girar a tela.
 */
sealed interface ExploreEvent {
    /** Abrir o Detalhe: a ave, se o canto começa ao abrir e o que o card já mostra (veja DetailOpening). */
    data class NavigateToDetail(
        val opening: DetailOpening,
    ) : ExploreEvent

    data object NavigateToFavorites : ExploreEvent
}
```

Substitua o conteúdo de `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreMosaic.kt`:

```kotlin
// Os itens da grade do Explorar (frente E): a "Ave do dia" em largura total,
// os cards de espécie em colunas desencontradas, o rodapé de "carregando
// mais" e o esqueleto do carregamento. A ExploreScreen monta a grade e põe
// estes itens embaixo do título, da busca e dos chips; separar os dois
// arquivos dá a cada um uma responsabilidade.

package com.velosobr.passarim.feature.explore.presentation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.calculateEndPadding
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.staggeredgrid.LazyStaggeredGridScope
import androidx.compose.foundation.lazy.staggeredgrid.LazyStaggeredGridState
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan
import androidx.compose.foundation.lazy.staggeredgrid.items
import androidx.compose.foundation.lazy.staggeredgrid.itemsIndexed
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
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.presentation.speciesPhotoKey
import com.velosobr.passarim.feature.explore.presentation.resources.Res
import com.velosobr.passarim.feature.explore.presentation.resources.featured_badge
import com.velosobr.passarim.feature.explore.presentation.resources.featured_badge_biome
import com.velosobr.passarim.feature.explore.presentation.resources.featured_play
import com.velosobr.passarim.feature.explore.presentation.resources.load_more_error
import com.velosobr.passarim.feature.explore.presentation.resources.retry
import com.velosobr.piuds.components.PiuSkeletonBox
import com.velosobr.piuds.components.adult.PiuFeaturedCard
import com.velosobr.piuds.components.adult.PiuMosaicCard
import com.velosobr.piuds.components.adult.PiuMosaicHeight
import com.velosobr.piuds.components.adult.PiuPlayAction
import kotlinx.coroutines.flow.distinctUntilChanged
import org.jetbrains.compose.resources.stringResource

/**
 * A altura do card na posição [index] do mosaico: alto, baixo, baixo, alto, e repete. Com duas
 * colunas, a da esquerda começa alta e a da direita baixa, e as linhas nunca se alinham.
 */
fun mosaicHeightFor(index: Int): PiuMosaicHeight = if (index % 4 == 0 || index % 4 == 3) PiuMosaicHeight.TALL else PiuMosaicHeight.SHORT

/** O gradiente de um card sem bioma principal (catalog sem esse dado): o do Pantanal. */
private val FallbackBiome = Biome.PANTANAL

/**
 * Pede a próxima página quando o último item visível chega perto do fim da grade (a regra está em
 * shouldLoadMore; o ViewModel ignora pedidos repetidos e fora da fase de conteúdo, então emitir a
 * mais é inofensivo). snapshotFlow transforma a leitura do estado da grade num Flow, e
 * rememberUpdatedState dá ao efeito o onAction atual sem reiniciá-lo.
 */
@Composable
internal fun LoadMoreEffect(
    gridState: LazyStaggeredGridState,
    onAction: (ExploreAction) -> Unit,
) {
    val currentOnAction by rememberUpdatedState(onAction)
    LaunchedEffect(gridState) {
        snapshotFlow {
            val info = gridState.layoutInfo
            (info.visibleItemsInfo.lastOrNull()?.index ?: -1) to info.totalItemsCount
        }.distinctUntilChanged()
            .collect { (last, count) -> if (shouldLoadMore(last, count)) currentOnAction(ExploreAction.LoadMore) }
    }
}

/**
 * Os itens do mosaico: a "Ave do dia" ocupando a largura toda e, embaixo, os cards em colunas
 * desencontradas, com o rodapé de "carregando mais" ou de erro. Na LazyVerticalStaggeredGrid cada
 * item tem a própria altura e entra na coluna mais curta; FullLine faz um item ocupar todas as
 * colunas. É uma função de extensão de LazyStaggeredGridScope (o "escopo" em que se declaram os
 * itens de uma grade), para a ExploreScreen chamá-la dentro da grade dela.
 */
internal fun LazyStaggeredGridScope.mosaicItems(
    state: ExploreState,
    onAction: (ExploreAction) -> Unit,
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
            biome = bird.primaryBiome ?: FallbackBiome,
            isFavorite = bird.id in state.favoriteIds,
            onToggleFavorite = { onAction(ExploreAction.ToggleFavorite(bird)) },
            onClick = { onAction(ExploreAction.OpenDetail(bird)) },
            height = mosaicHeightFor(index),
            // A foto do card viaja até o topo do Detalhe ao abrir a ave: o ViewModel manda a mesma chave na rota.
            sharedPhotoKey = speciesPhotoKey(bird.id),
        )
    }
    if (state.isLoadingMore || state.loadMoreError != null) {
        item(key = "footer", span = StaggeredGridItemSpan.FullLine, contentType = "footer") {
            LoadMoreFooter(isLoading = state.isLoadingMore, onRetry = { onAction(ExploreAction.RetryLoadMore) })
        }
    }
}

/** O "esqueleto" do carregamento: quatro blocos cinzas no desenho do mosaico, no lugar dos cards. */
internal fun LazyStaggeredGridScope.skeletonItems() {
    items(4, key = { "skeleton-$it" }, contentType = { "skeleton" }) { index ->
        val height = if (mosaicHeightFor(index) == PiuMosaicHeight.TALL) 220.dp else 168.dp
        PiuSkeletonBox(Modifier.fillMaxWidth().height(height), shape = MaterialTheme.shapes.large)
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
        biome = bird.primaryBiome ?: FallbackBiome,
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
internal fun PaddingValues.plusMargins(): PaddingValues {
    val direction = LocalLayoutDirection.current
    return PaddingValues(
        start = calculateStartPadding(direction) + GridMargin,
        end = calculateEndPadding(direction) + GridMargin,
        bottom = calculateBottomPadding() + 16.dp,
    )
}

/** A margem lateral da grade, que [fullBleed] desfaz para os itens do topo. */
private val GridMargin = 16.dp

/**
 * Faz um item ocupar a largura da tela inteira, por cima da margem lateral da grade. O título, a
 * busca e os chips já trazem as próprias margens, e a linha de chips precisa ir até a borda para
 * rolar na horizontal sem um corte a 16 dp dela. Modifier.layout mede o item com a largura da
 * grade mais as duas margens e o desenha deslocado para a esquerda; a grade não corta o que passa
 * da área dos itens enquanto continua dentro dela.
 */
internal fun Modifier.fullBleed(): Modifier =
    layout { measurable, constraints ->
        val extra = (GridMargin * 2).roundToPx()
        val width = constraints.maxWidth + extra
        val placeable = measurable.measure(constraints.copy(minWidth = width, maxWidth = width))
        layout(constraints.maxWidth, placeable.height) { placeable.place(-extra / 2, 0) }
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

Substitua o conteúdo de `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreRoot.kt`:

```kotlin
// A ligação entre a tela Explorar e o ViewModel.

package com.velosobr.passarim.feature.explore.presentation

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.velosobr.passarim.core.presentation.DetailOpening
import com.velosobr.passarim.core.presentation.ObserveAsEvents
import org.koin.compose.viewmodel.koinViewModel

/**
 * Liga a tela ao ViewModel (Koin) e transforma os eventos em navegação, que fica a cargo do `app`.
 * collectAsStateWithLifecycle só coleta o estado com a tela visível.
 */
@Composable
fun ExploreRoot(
    onOpenDetail: (DetailOpening) -> Unit,
    onOpenFavorites: () -> Unit,
    contentPadding: PaddingValues = PaddingValues(),
    viewModel: ExploreViewModel = koinViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    ObserveAsEvents(viewModel.events) { event ->
        when (event) {
            is ExploreEvent.NavigateToDetail -> onOpenDetail(event.opening)
            ExploreEvent.NavigateToFavorites -> onOpenFavorites()
        }
    }
    ExploreScreen(state = state, onAction = viewModel::onAction, contentPadding = contentPadding)
}
```

Substitua o conteúdo de `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreViewModel.kt`:

```kotlin
// O ViewModel do Explorar.
//
// Um ViewModel guarda o estado da tela e sobrevive à rotação. viewModelScope
// é o escopo das coroutines dele: tudo o que roda ali é cancelado quando a
// tela sai de vez. MutableStateFlow guarda o estado atual (a tela lê pelo
// StateFlow, só leitura); Channel entrega cada evento uma vez só.

package com.velosobr.passarim.feature.explore.presentation

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.FavoritesRepository
import com.velosobr.passarim.core.domain.FeaturedRepository
import com.velosobr.passarim.core.domain.FiltersRepository
import com.velosobr.passarim.core.domain.SpeciesSummary
import com.velosobr.passarim.core.domain.onFailure
import com.velosobr.passarim.core.domain.onSuccess
import com.velosobr.passarim.core.presentation.DetailOpening
import com.velosobr.passarim.core.presentation.DetailPreview
import com.velosobr.passarim.core.presentation.ScreenError
import com.velosobr.passarim.core.presentation.speciesPhotoKey
import com.velosobr.passarim.core.presentation.toScreenError
import com.velosobr.passarim.feature.explore.domain.ExploreRepository
import com.velosobr.passarim.feature.explore.domain.MAX_QUERY_LENGTH
import com.velosobr.passarim.feature.explore.domain.sanitizeQuery
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Espera sem digitar antes de buscar. */
const val SEARCH_DEBOUNCE_MILLIS = 400L

/** A próxima página é pedida quando o último item visível está a esta distância do fim. */
const val PREFETCH_DISTANCE = 6

// Chaves do SavedStateHandle: busca e filtros sobrevivem à morte do processo.
const val KEY_QUERY = "explore.query"
const val KEY_BIOME = "explore.biome"
const val KEY_STATE = "explore.state"

/** Regra da paginação, separada da UI para ser testada. */
fun shouldLoadMore(
    lastVisibleIndex: Int,
    itemCount: Int,
): Boolean = itemCount > 0 && lastVisibleIndex >= itemCount - PREFETCH_DISTANCE

/** O que define a lista: mudou, a lista recomeça do zero. */
private data class Criteria(
    val query: String,
    val biome: String?,
    val state: String?,
)

/**
 * Explorar: busca com debounce, filtros, paginação por cursor, favoritos e a "Ave do dia".
 *
 * Há **um só** [loadJob] por vez (primeira página ou página seguinte): uma busca nova o cancela, então a
 * resposta de uma busca antiga nunca sobrescreve a atual, e a paginação não corre em paralelo com ela.
 */
@OptIn(FlowPreview::class)
class ExploreViewModel(
    private val explore: ExploreRepository,
    private val filtersRepository: FiltersRepository,
    private val favorites: FavoritesRepository,
    private val featuredRepository: FeaturedRepository,
    private val savedState: SavedStateHandle,
) : ViewModel() {
    private val _state =
        MutableStateFlow(
            ExploreState(query = savedState[KEY_QUERY] ?: "", biome = savedState[KEY_BIOME], state = savedState[KEY_STATE]),
        )
    val state: StateFlow<ExploreState> = _state.asStateFlow()

    private val eventChannel = Channel<ExploreEvent>(Channel.BUFFERED)
    val events: Flow<ExploreEvent> = eventChannel.receiveAsFlow()

    /** O texto cru do campo; o debounce é aplicado sobre ele (a primeira emissão não espera). */
    private val queryText = MutableStateFlow(_state.value.query)
    private var criteria = Criteria("", null, null)
    private var loadJob: Job? = null
    private var retryJob: Job? = null

    /** O BFF respondeu que não há "Ave do dia" (NotFound): não adianta pedir de novo nesta sessão. */
    private var featuredAbsent = false

    // Monta a busca: a primeira emissão sai na hora; as seguintes esperam
    // SEARCH_DEBOUNCE_MILLIS sem digitação (debounce), para não fazer um pedido
    // por tecla. combine junta busca, bioma e UF, e distinctUntilChanged evita
    // recarregar quando nada mudou de fato.
    init {
        val query =
            queryText
                .drop(1)
                .debounce(SEARCH_DEBOUNCE_MILLIS)
                .onStart { emit(queryText.value) }
                .map(::sanitizeQuery)
        val biome = _state.map { it.biome }.distinctUntilChanged()
        val uf = _state.map { it.state }.distinctUntilChanged()
        combine(query, biome, uf, ::Criteria)
            .distinctUntilChanged()
            .onEach(::loadFirstPage)
            .launchIn(viewModelScope)
        favorites
            .observeIds()
            .onEach { ids -> _state.update { it.copy(favoriteIds = ids) } }
            .launchIn(viewModelScope)
        loadFilters()
        loadFeatured()
    }

    /** Trata cada ação da tela. */
    @Suppress("CyclomaticComplexMethod")
    fun onAction(action: ExploreAction) {
        when (action) {
            is ExploreAction.QueryChange -> setQuery(action.text)
            ExploreAction.LoadMore -> loadMore()
            ExploreAction.RetryLoadMore -> {
                _state.update { it.copy(loadMoreError = null) }
                loadMore()
            }
            ExploreAction.Retry -> if (_state.value.retryEnabled) loadFirstPage(criteria)
            ExploreAction.ClearFilters -> setFilters(biome = null, state = null)
            ExploreAction.ClearBiome -> setFilters(biome = null, state = _state.value.state)
            ExploreAction.ClearState -> setFilters(biome = _state.value.biome, state = null)
            ExploreAction.OpenFilters -> openSheet()
            ExploreAction.DismissFilters -> _state.update { it.copy(sheet = null) }
            is ExploreAction.SheetBiome -> updateSheet { it.copy(biome = action.code.takeIf { code -> code != it.biome }) }
            is ExploreAction.SheetState -> updateSheet { it.copy(state = action.code.takeIf { code -> code != it.state }) }
            ExploreAction.ShowAllStates -> updateSheet { it.copy(showAllStates = true) }
            ExploreAction.ClearSheet -> updateSheet { it.copy(biome = null, state = null) }
            ExploreAction.ApplyFilters -> applySheet()
            ExploreAction.RetryFilters -> loadFilters()
            is ExploreAction.ToggleFavorite -> viewModelScope.launch { favorites.toggle(action.summary) }
            // O card do mosaico leva a chave da foto dele: a foto viaja do card até o topo do Detalhe.
            is ExploreAction.OpenDetail ->
                eventChannel.trySend(ExploreEvent.NavigateToDetail(action.summary.opening(photoKey = speciesPhotoKey(action.summary.id))))
            ExploreAction.OpenFavorites -> eventChannel.trySend(ExploreEvent.NavigateToFavorites)
            is ExploreAction.SelectBiome ->
                setFilters(biome = action.code.takeIf { it != _state.value.biome }, state = _state.value.state)
            // O canto da "Ave do dia" abre o Detalhe já tocando (autoPlay). Sem chave de foto: a mesma ave
            // costuma estar também no mosaico, e a foto viajaria do card dela, que ninguém tocou.
            ExploreAction.OpenFeatured, ExploreAction.PlayFeatured ->
                _state.value.featured?.let {
                    val opening = it.species.opening(photoKey = null, autoPlay = action == ExploreAction.PlayFeatured)
                    eventChannel.trySend(ExploreEvent.NavigateToDetail(opening))
                }
        }
    }

    /** Guarda o texto (também no SavedStateHandle) e o entrega ao debounce. */
    private fun setQuery(text: String) {
        val limited = text.take(MAX_QUERY_LENGTH)
        savedState[KEY_QUERY] = limited
        _state.update { it.copy(query = limited) }
        queryText.value = limited
    }

    /** Mudar bioma ou estado dispara a recarga pelo `combine` do `init`. */
    private fun setFilters(
        biome: String?,
        state: String?,
    ) {
        savedState[KEY_BIOME] = biome
        savedState[KEY_STATE] = state
        _state.update { it.copy(biome = biome, state = state, sheet = null) }
    }

    /** Abre o sheet com as escolhas atuais; se os filtros falharam antes, tenta de novo. */
    private fun openSheet() {
        _state.update { it.copy(sheet = FiltersSheetState(biome = it.biome, state = it.state)) }
        if (_state.value.filters == FiltersPhase.Error) loadFilters()
    }

    /** Muda as escolhas do sheet aberto (nada acontece se ele estiver fechado). */
    private fun updateSheet(change: (FiltersSheetState) -> FiltersSheetState) {
        _state.update { s -> s.copy(sheet = s.sheet?.let(change)) }
    }

    /** "Mostrar aves": as escolhas do sheet viram os filtros da lista. */
    private fun applySheet() {
        val sheet = _state.value.sheet ?: return
        setFilters(sheet.biome, sheet.state)
    }

    /** Recomeça a lista do zero para os critérios novos, cancelando o pedido anterior. */
    private fun loadFirstPage(next: Criteria) {
        criteria = next
        loadJob?.cancel()
        retryJob?.cancel()
        _state.update {
            it.copy(
                items = emptyList(),
                nextCursor = null,
                phase = ExplorePhase.Loading,
                isLoadingMore = false,
                loadMoreError = null,
                retryEnabled = true,
            )
        }
        loadJob =
            viewModelScope.launch {
                explore
                    .list(next.query, next.biome, next.state, cursor = null)
                    .onSuccess { page ->
                        _state.update {
                            it.copy(
                                items = page.items.distinctBy { item -> item.id },
                                nextCursor = page.nextCursor,
                                phase = if (page.items.isEmpty()) ExplorePhase.Empty else ExplorePhase.Content,
                            )
                        }
                        loadFeatured()
                    }.onFailure { showError(it.toScreenError()) }
            }
    }

    /** Pede a próxima página, se houver cursor e nada estiver em andamento. */
    private fun loadMore() {
        val s = _state.value
        val cursor = s.nextCursor
        // Só pede com a grade na tela, sem outra requisição em curso e sem erro pendente (esse espera o botão).
        val idle = loadJob?.isActive != true && s.loadMoreError == null
        if (!idle || cursor == null || s.phase != ExplorePhase.Content) return
        _state.update { it.copy(isLoadingMore = true) }
        loadJob =
            viewModelScope.launch {
                explore
                    .list(criteria.query, criteria.biome, criteria.state, cursor = cursor)
                    .onSuccess { page ->
                        _state.update {
                            // Um `key = id` repetido derruba a LazyVerticalGrid: ids já vistos são descartados.
                            val seen = it.items.mapTo(HashSet()) { item -> item.id }
                            it.copy(
                                items = it.items + page.items.filter { item -> seen.add(item.id) },
                                nextCursor = page.nextCursor,
                                isLoadingMore = false,
                            )
                        }
                    }.onFailure { error ->
                        _state.update { it.copy(isLoadingMore = false, loadMoreError = error.toScreenError()) }
                    }
            }
    }

    /**
     * Mostra a tela de erro. Com RateLimited, o botão de tentar fica desligado
     * pelos segundos do Retry-After e religa sozinho depois.
     */
    private fun showError(error: ScreenError) {
        val wait = (error as? ScreenError.RateLimited)?.retryAfterSeconds
        _state.update { it.copy(phase = ExplorePhase.Error(error), retryEnabled = wait == null) }
        if (wait != null) {
            retryJob =
                viewModelScope.launch {
                    delay(wait * 1_000L)
                    _state.update { it.copy(retryEnabled = true) }
                }
        }
    }

    /**
     * Busca a "Ave do dia", se ela ainda não chegou, não está a caminho e o BFF não disse que não há
     * ave elegível (NotFound). Roda ao abrir e a cada lista que chega bem: assim, quem abriu sem rede
     * ganha o card no "Tentar novamente". Qualquer falha só deixa o card de fora, sem erro na tela.
     */
    private fun loadFeatured() {
        val s = _state.value
        if (s.featured != null || s.featuredLoading || featuredAbsent) return
        _state.update { it.copy(featuredLoading = true) }
        viewModelScope.launch {
            featuredRepository
                .getFeaturedSpecies()
                .onSuccess { f -> _state.update { it.copy(featured = f, featuredLoading = false) } }
                .onFailure { error ->
                    featuredAbsent = error == DataError.Network.NotFound
                    _state.update { it.copy(featuredLoading = false) }
                }
        }
    }

    /** Carrega as opções de filtro, independente da lista. */
    private fun loadFilters() {
        _state.update { it.copy(filters = FiltersPhase.Loading) }
        viewModelScope.launch {
            filtersRepository
                .get()
                .onSuccess { f -> _state.update { it.copy(filters = FiltersPhase.Loaded(f)) } }
                .onFailure { _state.update { it.copy(filters = FiltersPhase.Error) } }
        }
    }
}

/**
 * O pedido de abrir o Detalhe desta ave, com o que o card já mostra (miniatura e bioma) e a
 * [photoKey] da foto que viaja do card (nula: a foto não viaja).
 */
private fun SpeciesSummary.opening(
    photoKey: String?,
    autoPlay: Boolean = false,
): DetailOpening = DetailOpening(id, autoPlay, DetailPreview(photoKey, thumbnailUrl, primaryBiome))
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew --continue :app:testAndroidHostTest :feature:detail:presentation:testAndroidHostTest :feature:explore:presentation:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Snapshots**

Substitua o conteúdo de `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/DetailSnapshotTest.kt`:

```kotlin
// Snapshots da tela de Detalhe.

package com.velosobr.passarim.snapshots

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalInspectionMode
import coil3.ColorImage
import coil3.annotation.ExperimentalCoilApi
import coil3.compose.AsyncImagePreviewHandler
import coil3.compose.LocalAsyncImagePreviewHandler
import com.velosobr.passarim.core.domain.ConservationStatus
import com.velosobr.passarim.core.domain.Credit
import com.velosobr.passarim.core.presentation.DetailPreview
import com.velosobr.passarim.core.presentation.ScreenError
import com.velosobr.passarim.feature.detail.domain.Audio
import com.velosobr.passarim.feature.detail.domain.Biome
import com.velosobr.passarim.feature.detail.domain.Cluster
import com.velosobr.passarim.feature.detail.domain.Photo
import com.velosobr.passarim.feature.detail.domain.PlaybackState
import com.velosobr.passarim.feature.detail.domain.SpeciesDetail
import com.velosobr.passarim.feature.detail.domain.WhereToFind
import com.velosobr.passarim.feature.detail.presentation.DetailPhase
import com.velosobr.passarim.feature.detail.presentation.DetailScreen
import com.velosobr.passarim.feature.detail.presentation.DetailState
import com.velosobr.passarim.feature.detail.presentation.MAP_HEIGHT
import com.velosobr.passarim.feature.detail.presentation.MapAttribution
import org.junit.Test
import com.velosobr.passarim.core.domain.Biome as PrimaryBiome

/**
 * O Detalhe completo (topo, meio e fim, com créditos abertos e o canto pausado), o player com e
 * sem os picos da forma de onda, sem canto, sem foto (o gradiente do bioma), carregando (sem e com
 * a prévia do card que abriu a tela), não encontrado e com erro. O mapa entra como um desenho simples, porque o MapLibre não desenha no
 * Paparazzi. A foto é uma imagem toda branca, o pior caso para o nome em branco sobre ela: o Coil,
 * em modo de inspeção (LocalInspectionMode), pede a imagem ao AsyncImagePreviewHandler em vez de
 * baixar.
 */
class DetailSnapshotTest(
    dark: Boolean,
    fontScalePercent: Int,
) : ThemedSnapshotTest(dark, fontScalePercent) {
    private val photoCredit = Credit("(c) Paul Donahue", "CC BY-NC", "inaturalist", "https://www.inaturalist.org/observations/87436377")

    private val arara =
        SpeciesDetail(
            id = "anodorhynchus-hyacinthinus",
            commonName = "Arara-azul-grande",
            scientificName = "Anodorhynchus hyacinthinus",
            family = "Psittacidae",
            conservation = ConservationStatus.VU,
            sizeCm = 100,
            diet = "Sementes duras de palmeiras, como coco-de-urucuri e coco-de-espinho, quebradas com a força do bico.",
            description =
                "A arara-azul-grande é a maior espécie de arara do mundo, com plumagem azul-cobalto intensa e um anel " +
                    "amarelo ao redor dos olhos e na base do bico.",
            descriptionCredit = Credit("Equipe Passarim", "CC BY 4.0", "curated", "https://pt.wikipedia.org/wiki/Arara-azul-grande"),
            facts =
                listOf(
                    "Formam casais monogâmicos que permanecem juntos durante toda a vida.",
                    "Já foram registradas usando folhas mastigadas como ferramentas.",
                ),
            biomes = listOf(Biome("amazonia", "Amazônia"), Biome("cerrado", "Cerrado"), Biome("pantanal", "Pantanal")),
            photos =
                listOf(
                    Photo(null, null, "foto-branca", photoCredit),
                    Photo(null, null, null, Credit("(c) Jéssica Martins", "CC BY-NC-SA", "inaturalist", null)),
                    Photo(null, null, null, Credit(null, "CC0", "inaturalist", null)),
                ),
            audio =
                Audio(
                    "https://media/arara.aac",
                    31_000,
                    Credit("Jayrson Araujo de Oliveira", "CC BY-NC-SA", "xeno-canto", null),
                    peaks = PEAKS,
                ),
            whereToFind =
                WhereToFind(
                    states = listOf("AM", "BA", "GO", "MA", "MG", "MS", "MT", "PA", "PI", "TO"),
                    biomes = listOf("amazonia", "cerrado", "pantanal"),
                    clusters = listOf(Cluster(-19.6, -56.4, 197)),
                ),
            primaryBiome = PrimaryBiome.PANTANAL,
        )

    private val complete =
        DetailState(phase = DetailPhase.Content(arara), isFavorite = true, player = PlaybackState.Paused(12_000), creditsExpanded = true)

    @OptIn(ExperimentalCoilApi::class)
    private fun screen(
        name: String,
        state: DetailState,
        scrollPx: Int = 0,
    ) = snap(name) {
        CompositionLocalProvider(
            LocalInspectionMode provides true,
            LocalAsyncImagePreviewHandler provides AsyncImagePreviewHandler { ColorImage(Color.White.toArgb()) },
        ) {
            DetailScreen(
                state = state,
                onAction = {},
                mapContent = { _, modifier -> MapPlaceholder(modifier) },
                scrollState = ScrollState(scrollPx),
            )
        }
    }

    @Test
    fun completeTop() = screen("detail-complete-top", complete)

    @Test
    fun completeMiddle() = screen("detail-complete-middle", complete, scrollPx = MIDDLE_PX)

    @Test
    fun completeBottom() = screen("detail-complete-bottom", complete, scrollPx = Int.MAX_VALUE)

    /** O player com os 64 picos: a parte já tocada (12 de 31 s) na cor primária. */
    @Test
    fun player() = screen("detail-player", complete, scrollPx = PLAYER_PX)

    /** Sem picos (BFF antigo ou canto sem processar): a forma de onda é uma linha reta. */
    @Test
    fun playerWithoutPeaks() =
        screen(
            "detail-player-without-peaks",
            complete.copy(phase = DetailPhase.Content(arara.copy(audio = arara.audio?.copy(peaks = emptyList())))),
            scrollPx = PLAYER_PX,
        )

    @Test
    fun withoutAudio() = screen("detail-without-audio", DetailState(phase = DetailPhase.Content(arara.copy(audio = null))), MIDDLE_PX)

    @Test
    fun withoutPhoto() =
        screen(
            "detail-without-photo",
            DetailState(
                phase =
                    DetailPhase.Content(
                        arara.copy(photos = emptyList(), conservation = null, sizeCm = null, diet = null, facts = emptyList()),
                    ),
                player = PlaybackState.Error,
            ),
        )

    @Test
    fun loading() = screen("detail-loading", DetailState(phase = DetailPhase.Loading))

    /** Aberto por um card do mosaico: enquanto a ave carrega, o topo já mostra a miniatura do card sobre o gradiente do bioma. */
    @Test
    fun loadingFromCard() =
        screen(
            "detail-loading-from-card",
            DetailState(
                phase = DetailPhase.Loading,
                preview = DetailPreview("foto-${arara.id}", "foto-branca", PrimaryBiome.PANTANAL),
            ),
        )

    @Test
    fun notFound() = screen("detail-not-found", DetailState(phase = DetailPhase.NotFound))

    @Test
    fun errorServer() = screen("detail-error-server", DetailState(phase = DetailPhase.Error(ScreenError.ServiceUnavailable)))
}

/** Rolagem, em pixels, até o meio da página, para fotografar as seções de baixo. */
private const val MIDDLE_PX = 2_200

/** Rolagem, em pixels, que deixa o player do canto no meio da tela. */
private const val PLAYER_PX = 1_000

/**
 * 64 picos de exemplo, no desenho da prancheta (alturas de 10 a 32 de 32, repetidas): o suficiente
 * para a forma de onda ter altos e baixos.
 */
private val PEAKS =
    listOf(10, 18, 26, 14, 30, 22, 12, 28, 20, 32, 16, 24, 30, 12, 20, 28, 14, 22, 18, 26, 10, 20, 14, 24, 18, 12, 16, 10)
        .let { heights -> List(64) { heights[it % heights.size] / 32f } }

/** Um retângulo com a atribuição no lugar do mapa, do mesmo tamanho dele. */
@Composable
private fun MapPlaceholder(modifier: Modifier) {
    Box(
        modifier
            .fillMaxWidth()
            .height(MAP_HEIGHT)
            .clip(MaterialTheme.shapes.small)
            .background(MaterialTheme.colorScheme.surfaceVariant),
    ) {
        MapAttribution(Modifier.align(Alignment.BottomStart))
    }
}
```

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*DetailSnapshotTest*'`

Expected: 6 imagens novas e 0 regravadas em `snapshots/src/test/snapshots/images/`. Abra cada uma: o esqueleto aberto por um card mostra a miniatura (branca) sobre o gradiente do Pantanal, com o botão de voltar de vidro.

- [ ] **Step 6: Conferir que a navegação só liga**

O bloco de rota do `NavHost` só pega o ViewModel, repassa callbacks e navega; nenhum efeito ali.

Run: `git diff feat/e1-explorar -- '*Navigator*.kt' '*NavHost*.kt' '*Graph*.kt' 'app/**/App*.kt' '*TabsScreen*.kt' | grep -E '^\+.*(LaunchedEffect|DisposableEffect|\.collect *[{(])'`

Expected: nenhuma linha.

- [ ] **Step 7: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :app:testAndroidHostTest :feature:detail:presentation:testAndroidHostTest :feature:explore:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m 'fix: foto do card viaja também na ida, com o Detalhe ainda carregando'
```

### Task 9: Revisão I1: a foto da "Ave do dia" viaja do card dela, com chave própria

A "Ave do dia" costuma estar também no mosaico. Com a mesma chave nos dois cards, a foto podia partir do card do mosaico, que ninguém tocou; a Task 8 tirou a chave da "Ave do dia", e a foto dela deixou de viajar. Agora o card da "Ave do dia" tem a chave dele (`foto-destaque-<id>`, `featuredPhotoKey`), o `PiuFeaturedCard` marca a camada da foto (o gradiente e a imagem) com ela, e o Explorar manda essa chave na rota ao abrir pela "Ave do dia".

**Files:**
- Test: `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuSharedPhotoTest.kt`
- Modify: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuSharedPhoto.kt`
- Modify: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/adult/PiuFeaturedCard.kt`
- Modify: `core/presentation/src/commonMain/kotlin/com/velosobr/passarim/core/presentation/SharedPhotoKey.kt`
- Test: `core/presentation/src/commonTest/kotlin/com/velosobr/passarim/core/presentation/SharedPhotoKeyTest.kt`
- Modify: `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreMosaic.kt`
- Modify: `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreViewModel.kt`
- Test: `feature/explore/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreViewModelTest.kt`

**Interfaces:**
- Produz: `fun featuredPhotoKey(id: String): String` (`foto-destaque-<id>`) em `core:presentation`.
- Muda: `PiuFeaturedCard(..., sharedPhotoKey: String? = null)`.

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuSharedPhotoTest.kt`:

```kotlin
// Testes da foto que viaja entre duas telas (frente E, seção 6): com a camada
// de transição e o escopo de animação, a foto do card cresce aos poucos até o
// tamanho do topo do Detalhe; com "reduzir animações" ou sem a camada, ela
// não viaja.

package com.velosobr.piuds

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.piuds.components.PiuSharedScope
import com.velosobr.piuds.components.PiuSharedTransitionLayout
import com.velosobr.piuds.components.adult.PiuFeaturedCard
import com.velosobr.piuds.components.piuSharedPhoto
import com.velosobr.piuds.theme.LocalPiuReduceMotion
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w411dp-h891dp")
class PiuSharedPhotoTest {
    /** Abre o "Detalhe" no meio do teste. */
    private var detail by mutableStateOf(false)

    /**
     * Duas telas trocadas por AnimatedContent (o mesmo que o NavHost usa por dentro): um card de
     * 100 dp e um topo de 430 dp de altura, os dois com a foto da chave "foto-1". AnimatedContent
     * dá a cada tela um escopo de animação, que o PiuSharedScope entrega à foto. A troca é só um
     * esmaecer, sem animar o tamanho (SizeTransform nulo) e numa área do tamanho da tela: assim,
     * só a foto compartilhada muda de tamanho no meio da troca.
     */
    @Composable
    private fun TwoScreens(card: @Composable (onOpen: () -> Unit) -> Unit) {
        PiuSharedTransitionLayout {
            AnimatedContent(
                targetState = detail,
                modifier = Modifier.fillMaxSize(),
                transitionSpec = { (fadeIn() togetherWith fadeOut()).using(null) },
            ) { showDetail ->
                PiuSharedScope(this) {
                    if (showDetail) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .height(430.dp)
                                .piuSharedPhoto("foto-1")
                                .background(Color.Blue)
                                .testTag("hero"),
                        )
                    } else {
                        card { detail = true }
                    }
                }
            }
        }
    }

    /** O card mais simples: um quadrado vermelho de 100 dp, 300 dp abaixo do topo, com a foto "foto-1". */
    @Composable
    private fun PlainCard(onOpen: () -> Unit) {
        Box(
            Modifier
                .offset(40.dp, 300.dp)
                .size(100.dp)
                .piuSharedPhoto("foto-1")
                .background(Color.Red)
                .testTag("card")
                .clickable(onClick = onOpen),
        )
    }

    /**
     * Onde o topo do Detalhe começa (a borda de cima, em pixels), quadro a quadro, depois de tocar
     * no card. O card começa 300 dp abaixo do topo da tela; o topo do Detalhe, no 0.
     */
    private fun heroTopsAfterOpening(
        reduceMotion: Boolean = false,
        card: @Composable (onOpen: () -> Unit) -> Unit = { PlainCard(it) },
    ): List<Float> {
        val tops = mutableListOf<Float>()
        runComposeUiTest {
            mainClock.autoAdvance = false
            setContent {
                CompositionLocalProvider(LocalPiuReduceMotion provides reduceMotion) { PiuTheme { TwoScreens(card) } }
            }
            mainClock.advanceTimeBy(1_000)
            onNodeWithTag("card").performClick()
            repeat(40) {
                mainClock.advanceTimeByFrame()
                onAllNodes(hasTestTag("hero")).fetchSemanticsNodes().forEach { tops += it.boundsInRoot.top }
            }
        }
        return tops
    }

    @Test
    fun `a foto sai do card e sobe aos poucos ate o topo do detalhe`() {
        // Em algum quadro, a foto está no meio do caminho entre o card e o topo: ela viajou.
        // No Robolectric a densidade padrão é 1, então pixels e dp coincidem.
        assertThat(heroTopsAfterOpening(reduceMotion = false).any { it > 20 && it < 280 }).isTrue()
    }

    /**
     * A "Ave do dia" também participa: o card dela, com a [sharedPhotoKey], é a outra ponta da foto
     * do topo. O card fica 300 dp abaixo do topo da tela, como o quadrado dos outros testes.
     */
    @Test
    fun `a foto da ave do dia tambem viaja ate o topo do detalhe`() {
        val tops =
            heroTopsAfterOpening { onOpen ->
                PiuFeaturedCard(
                    badge = "AVE DO DIA",
                    name = "Tuiuiú",
                    scientificName = "Jabiru mycteria",
                    imageUrl = null,
                    biome = Biome.PANTANAL,
                    onClick = onOpen,
                    modifier = Modifier.offset(0.dp, 300.dp).testTag("card"),
                    sharedPhotoKey = "foto-1",
                )
            }
        assertThat(tops.any { it > 20 && it < 280 }).isTrue()
    }

    @Test
    fun `com reduzir animacoes a foto nao viaja`() {
        assertThat(heroTopsAfterOpening(reduceMotion = true).any { it > 20 && it < 280 }).isFalse()
    }

    @Test
    fun `sem a camada de transicao a foto fica no lugar dela`() =
        runComposeUiTest {
            setContent { PiuTheme { Box(Modifier.size(100.dp).piuSharedPhoto("foto-1").testTag("solo")) } }
            assertThat(onNodeWithTag("solo").fetchSemanticsNode().boundsInRoot.width).isEqualTo(100f)
        }
}
```

Substitua o conteúdo de `core/presentation/src/commonTest/kotlin/com/velosobr/passarim/core/presentation/SharedPhotoKeyTest.kt`:

```kotlin
// Teste das chaves que ligam a foto de um card à foto do topo do Detalhe: uma
// para o card do mosaico e outra para o da "Ave do dia", porque a mesma ave
// pode estar nos dois ao mesmo tempo.

package com.velosobr.passarim.core.presentation

import assertk.assertThat
import assertk.assertions.isEqualTo
import kotlin.test.Test

class SharedPhotoKeyTest {
    @Test
    fun `a chave da foto compartilhada e foto mais o id da ave`() {
        assertThat(speciesPhotoKey("jabiru-mycteria")).isEqualTo("foto-jabiru-mycteria")
    }

    @Test
    fun `a chave da foto da ave do dia e outra que a do mosaico da mesma ave`() {
        assertThat(featuredPhotoKey("jabiru-mycteria")).isEqualTo("foto-destaque-jabiru-mycteria")
    }
}
```

Substitua o conteúdo de `feature/explore/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreViewModelTest.kt`:

```kotlin
// Testes do ViewModel do Explorar com repositórios falsos (ExploreFakes.kt).
// Dispatchers.setMain troca a thread principal por um dispatcher de teste, e
// advanceTimeBy avança o relógio virtual, para testar o debounce sem esperar.

package com.velosobr.passarim.feature.explore.presentation

import androidx.lifecycle.SavedStateHandle
import app.cash.turbine.test
import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.hasLength
import assertk.assertions.hasSize
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isNull
import assertk.assertions.isTrue
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.domain.BiomeFilter
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.Result
import com.velosobr.passarim.core.domain.StateFilter
import com.velosobr.passarim.core.presentation.DetailOpening
import com.velosobr.passarim.core.presentation.DetailPreview
import com.velosobr.passarim.core.presentation.ScreenError
import com.velosobr.passarim.feature.explore.domain.SpeciesPage
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test

/**
 * O `Main` de teste é um `UnconfinedTestDispatcher`: o `viewModelScope` roda na hora, e o `runTest`
 * usa o mesmo relógio virtual, então `advanceTimeBy` controla o debounce e o `Retry-After`.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ExploreViewModelTest {
    private val repo = FakeExploreRepository()
    private val filters = FakeFiltersRepository()
    private val favorites = FakeFavoritesRepository()
    private val featured = FakeFeaturedRepository()

    /** viewModel cria o ViewModel com os fakes e um SavedStateHandle (vazio por padrão). */
    private fun viewModel(saved: SavedStateHandle = SavedStateHandle()) = ExploreViewModel(repo, filters, favorites, featured, saved)

    @BeforeTest
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @AfterTest
    fun tearDown() = Dispatchers.resetMain()

    /** Passa o debounce da busca. */
    private fun TestScope.typed() = advanceTimeBy(SEARCH_DEBOUNCE_MILLIS + 1)

    // --- Primeira página e busca ---

    @Test
    fun `ao abrir carrega a primeira pagina sem busca nem filtros`() =
        runTest {
            val vm = viewModel()
            assertThat(repo.calls).containsExactly(ListCall("", null, null, null))
            val s = vm.state.value
            assertThat(s.phase).isEqualTo(ExplorePhase.Content)
            assertThat(s.items).hasSize(20)
            assertThat(s.nextCursor).isEqualTo("c1")
        }

    @Test
    fun `a busca espera 400 ms sem digitar antes de pedir`() =
        runTest {
            val vm = viewModel()
            vm.onAction(ExploreAction.QueryChange("a"))
            advanceTimeBy(200)
            vm.onAction(ExploreAction.QueryChange("az"))
            advanceTimeBy(SEARCH_DEBOUNCE_MILLIS - 1)
            assertThat(repo.calls).hasSize(1)

            advanceTimeBy(2)
            assertThat(repo.calls).containsExactly(ListCall("", null, null, null), ListCall("az", null, null, null))
            assertThat(vm.state.value.query).isEqualTo("az")
        }

    @Test
    fun `uma busca nova cancela a anterior que ainda nao respondeu`() =
        runTest {
            repo.gates[1] = CompletableDeferred()
            val vm = viewModel()
            vm.onAction(ExploreAction.QueryChange("arara"))
            typed()
            repo.pages[null] = Result.Success(SpeciesPage(listOf(bird("gralha-azul")), null))
            vm.onAction(ExploreAction.QueryChange("azul"))
            typed()

            repo.gates.getValue(1).complete(Unit)
            advanceUntilIdle()

            assertThat(repo.calls.map { it.query }).containsExactly("", "arara", "azul")
            assertThat(
                vm.state.value.items
                    .map { it.id },
            ).containsExactly("gralha-azul")
        }

    @Test
    fun `caracteres de controle e espacos das pontas nao vao para o BFF`() =
        runTest {
            val vm = viewModel()
            vm.onAction(ExploreAction.QueryChange("  arara\nazul "))
            typed()
            assertThat(repo.calls.last().query).isEqualTo("arara azul")
        }

    @Test
    fun `o campo guarda no maximo 100 caracteres`() =
        runTest {
            val vm = viewModel()
            vm.onAction(ExploreAction.QueryChange("a".repeat(150)))
            assertThat(vm.state.value.query).hasLength(100)
        }

    @Test
    fun `enquanto a primeira pagina nao chega a fase e Loading`() =
        runTest {
            repo.gates[0] = CompletableDeferred()
            val vm = viewModel()
            vm.state.test {
                assertThat(awaitItem().phase).isEqualTo(ExplorePhase.Loading)
                repo.gates.getValue(0).complete(Unit)
                assertThat(awaitItem().phase).isEqualTo(ExplorePhase.Content)
            }
        }

    @Test
    fun `pagina vazia vira Empty`() =
        runTest {
            repo.pages[null] = Result.Success(SpeciesPage(emptyList(), null))
            val vm = viewModel()
            assertThat(vm.state.value.phase).isEqualTo(ExplorePhase.Empty)
        }

    // --- Paginação ---

    @Test
    fun `pagina ate o fim e para quando nextCursor e nulo`() =
        runTest {
            repo.pages["c1"] = Result.Success(page(20, 40, "c2"))
            repo.pages["c2"] = Result.Success(page(40, 45, null))
            val vm = viewModel()

            vm.onAction(ExploreAction.LoadMore)
            vm.onAction(ExploreAction.LoadMore)
            vm.onAction(ExploreAction.LoadMore)

            assertThat(repo.calls.map { it.cursor }).containsExactly(null, "c1", "c2")
            assertThat(vm.state.value.items).hasSize(45)
            assertThat(vm.state.value.nextCursor).isNull()
        }

    @Test
    fun `ids repetidos entre paginas sao descartados`() =
        runTest {
            // A página 2 repete "ave-19" (da página 1) e traz "ave-20" duas vezes.
            repo.pages["c1"] = Result.Success(SpeciesPage(listOf(bird("ave-19"), bird("ave-20"), bird("ave-20")), null))
            val vm = viewModel()
            vm.onAction(ExploreAction.LoadMore)

            val ids =
                vm.state.value.items
                    .map { it.id }
            assertThat(ids).hasSize(21)
            assertThat(ids.toSet()).hasSize(21)
        }

    @Test
    fun `pedir a proxima pagina com uma requisicao em curso e ignorado`() =
        runTest {
            repo.pages["c1"] = Result.Success(page(20, 40, null))
            repo.gates[1] = CompletableDeferred()
            val vm = viewModel()

            vm.onAction(ExploreAction.LoadMore)
            assertThat(vm.state.value.isLoadingMore).isTrue()
            vm.onAction(ExploreAction.LoadMore)
            repo.gates.getValue(1).complete(Unit)

            assertThat(repo.calls).hasSize(2)
            assertThat(vm.state.value.isLoadingMore).isFalse()
        }

    @Test
    fun `erro na pagina seguinte preserva os itens e tentar de novo continua`() =
        runTest {
            repo.pages["c1"] = Result.Failure(DataError.Network.Timeout)
            val vm = viewModel()

            vm.onAction(ExploreAction.LoadMore)
            assertThat(vm.state.value.items).hasSize(20)
            assertThat(vm.state.value.phase).isEqualTo(ExplorePhase.Content)
            assertThat(vm.state.value.loadMoreError).isEqualTo(ScreenError.NoConnection)

            // Rolar de novo não repete o pedido sozinho: só o botão da linha de erro.
            vm.onAction(ExploreAction.LoadMore)
            assertThat(repo.calls).hasSize(2)

            repo.pages["c1"] = Result.Success(page(20, 30, null))
            vm.onAction(ExploreAction.RetryLoadMore)
            assertThat(vm.state.value.items).hasSize(30)
            assertThat(vm.state.value.loadMoreError).isNull()
        }

    @Test
    fun `mudar o filtro zera a lista e o cursor e pede a primeira pagina`() =
        runTest {
            repo.pages["c1"] = Result.Success(page(20, 40, "c2"))
            val vm = viewModel()
            vm.onAction(ExploreAction.LoadMore)
            repo.gates[2] = CompletableDeferred()

            vm.onAction(ExploreAction.OpenFilters)
            vm.onAction(ExploreAction.SheetBiome("cerrado"))
            vm.onAction(ExploreAction.ApplyFilters)

            val s = vm.state.value
            assertThat(s.phase).isEqualTo(ExplorePhase.Loading)
            assertThat(s.items).isEmpty()
            assertThat(s.nextCursor).isNull()
            assertThat(repo.calls.last()).isEqualTo(ListCall("", "cerrado", null, null))
        }

    @Test
    fun `mudar o filtro com uma pagina seguinte em curso descarta essa pagina`() =
        runTest {
            repo.pages["c1"] = Result.Success(page(20, 40, "c2"))
            repo.gates[1] = CompletableDeferred()
            val vm = viewModel()
            vm.onAction(ExploreAction.LoadMore)

            vm.onAction(ExploreAction.OpenFilters)
            vm.onAction(ExploreAction.SheetState("SP"))
            vm.onAction(ExploreAction.ApplyFilters)
            repo.gates.getValue(1).complete(Unit)
            advanceUntilIdle()

            assertThat(vm.state.value.items).hasSize(20)
            assertThat(vm.state.value.nextCursor).isEqualTo("c1")
            assertThat(repo.calls.last()).isEqualTo(ListCall("", null, "SP", null))
        }

    @Test
    fun `shouldLoadMore pede a proxima pagina a 6 itens do fim`() {
        assertThat(shouldLoadMore(lastVisibleIndex = 13, itemCount = 20)).isFalse()
        assertThat(shouldLoadMore(lastVisibleIndex = 14, itemCount = 20)).isTrue()
        assertThat(shouldLoadMore(lastVisibleIndex = -1, itemCount = 0)).isFalse()
    }

    // --- Erros ---

    @Test
    fun `cada erro de rede vira a tela de erro certa`() =
        runTest {
            val table =
                mapOf(
                    DataError.Network.NoConnection to ScreenError.NoConnection,
                    DataError.Network.Timeout to ScreenError.NoConnection,
                    DataError.Network.ServiceUnavailable to ScreenError.ServiceUnavailable,
                    DataError.Network.Internal to ScreenError.ServiceUnavailable,
                    DataError.Network.RateLimited(null) to ScreenError.RateLimited(null),
                    DataError.Network.InvalidParameter to ScreenError.Generic,
                    DataError.Network.NotFound to ScreenError.Generic,
                    DataError.Network.Unknown to ScreenError.Generic,
                )
            for ((error, expected) in table) {
                repo.pages[null] = Result.Failure(error)
                assertThat(viewModel().state.value.phase).isEqualTo(ExplorePhase.Error(expected))
            }
        }

    @Test
    fun `tentar de novo recarrega a primeira pagina`() =
        runTest {
            repo.pages[null] = Result.Failure(DataError.Network.ServiceUnavailable)
            val vm = viewModel()
            repo.pages[null] = Result.Success(page(0, 3, null))

            vm.onAction(ExploreAction.Retry)

            assertThat(vm.state.value.phase).isEqualTo(ExplorePhase.Content)
            assertThat(vm.state.value.items).hasSize(3)
        }

    @Test
    fun `RateLimited so libera tentar de novo depois do Retry-After`() =
        runTest {
            repo.pages[null] = Result.Failure(DataError.Network.RateLimited(30))
            val vm = viewModel()
            assertThat(vm.state.value.retryEnabled).isFalse()

            vm.onAction(ExploreAction.Retry)
            assertThat(repo.calls).hasSize(1)

            advanceTimeBy(30_001)
            assertThat(vm.state.value.retryEnabled).isTrue()
            vm.onAction(ExploreAction.Retry)
            assertThat(repo.calls).hasSize(2)
        }

    // --- Filtros ---

    @Test
    fun `os filtros carregam ao abrir a tela`() =
        runTest {
            val vm = viewModel()
            assertThat(vm.state.value.filters).isEqualTo(FiltersPhase.Loaded(sampleFilters))
        }

    @Test
    fun `o sheet so aplica ao tocar em Mostrar aves`() =
        runTest {
            val vm = viewModel()
            vm.onAction(ExploreAction.OpenFilters)
            vm.onAction(ExploreAction.SheetBiome("pampa"))
            assertThat(vm.state.value.sheet).isEqualTo(FiltersSheetState(biome = "pampa", state = null))
            assertThat(vm.state.value.biome).isNull()

            vm.onAction(ExploreAction.DismissFilters)
            assertThat(vm.state.value.sheet).isNull()
            assertThat(vm.state.value.biome).isNull()
            assertThat(repo.calls).hasSize(1)
        }

    @Test
    fun `selecao unica por grupo e tocar de novo desmarca`() =
        runTest {
            val vm = viewModel()
            vm.onAction(ExploreAction.OpenFilters)
            vm.onAction(ExploreAction.SheetBiome("pampa"))
            vm.onAction(ExploreAction.SheetBiome("cerrado"))
            vm.onAction(ExploreAction.SheetState("SP"))
            assertThat(vm.state.value.sheet).isEqualTo(FiltersSheetState(biome = "cerrado", state = "SP"))

            vm.onAction(ExploreAction.SheetBiome("cerrado"))
            assertThat(
                vm.state.value.sheet
                    ?.biome,
            ).isNull()
        }

    @Test
    fun `Limpar no sheet desmarca tudo mas so vale ao aplicar`() =
        runTest {
            val vm = viewModel(SavedStateHandle(mapOf(KEY_BIOME to "pampa", KEY_STATE to "RS")))
            vm.onAction(ExploreAction.OpenFilters)
            assertThat(vm.state.value.sheet).isEqualTo(FiltersSheetState(biome = "pampa", state = "RS"))

            vm.onAction(ExploreAction.ClearSheet)
            assertThat(vm.state.value.biome).isEqualTo("pampa")

            vm.onAction(ExploreAction.ApplyFilters)
            assertThat(vm.state.value.biome).isNull()
            assertThat(vm.state.value.state).isNull()
            assertThat(repo.calls.last()).isEqualTo(ListCall("", null, null, null))
        }

    @Test
    fun `Limpar filtros do estado vazio mantem a busca`() =
        runTest {
            repo.pages[null] = Result.Success(SpeciesPage(emptyList(), null))
            val vm = viewModel(SavedStateHandle(mapOf(KEY_QUERY to "arara", KEY_BIOME to "pampa")))
            assertThat(vm.state.value.phase).isEqualTo(ExplorePhase.Empty)

            vm.onAction(ExploreAction.ClearFilters)

            assertThat(repo.calls.last()).isEqualTo(ListCall("arara", null, null, null))
            assertThat(vm.state.value.query).isEqualTo("arara")
        }

    @Test
    fun `o X do chip remove so aquele filtro`() =
        runTest {
            val vm = viewModel(SavedStateHandle(mapOf(KEY_BIOME to "pampa", KEY_STATE to "RS")))
            vm.onAction(ExploreAction.ClearBiome)
            assertThat(repo.calls.last()).isEqualTo(ListCall("", null, "RS", null))
            vm.onAction(ExploreAction.ClearState)
            assertThat(repo.calls.last()).isEqualTo(ListCall("", null, null, null))
        }

    @Test
    fun `falha nos filtros mostra erro e abrir o sheet tenta de novo`() =
        runTest {
            filters.next = Result.Failure(DataError.Network.NoConnection)
            val vm = viewModel()
            assertThat(vm.state.value.filters).isEqualTo(FiltersPhase.Error)

            filters.next = Result.Success(sampleFilters)
            vm.onAction(ExploreAction.OpenFilters)

            assertThat(filters.calls).isEqualTo(2)
            assertThat(vm.state.value.filters).isEqualTo(FiltersPhase.Loaded(sampleFilters))
        }

    @Test
    fun `estados ordenados por contagem e os 12 primeiros ate ver todos`() {
        val many = (1..20).map { StateFilter("U$it", it) }
        assertThat(visibleStates(sampleFilters.states, showAll = false).map { it.code }).containsExactly("SP", "RJ", "AC")
        assertThat(visibleStates(many, showAll = false)).hasSize(VISIBLE_STATES)
        assertThat(visibleStates(many, showAll = false).first().code).isEqualTo("U20")
        assertThat(visibleStates(many, showAll = true)).hasSize(20)
    }

    // --- Favoritos, eventos e morte do processo ---

    @Test
    fun `favoritar no card alterna e o estado acompanha`() =
        runTest {
            val vm = viewModel()
            val first =
                vm.state.value.items
                    .first()

            vm.onAction(ExploreAction.ToggleFavorite(first))
            assertThat(vm.state.value.favoriteIds).isEqualTo(setOf(first.id))

            vm.onAction(ExploreAction.ToggleFavorite(first))
            assertThat(vm.state.value.favoriteIds).isEmpty()
        }

    /**
     * O card leva para o Detalhe a chave da foto do mosaico, a miniatura e o bioma: o topo do Detalhe
     * já nasce com eles, enquanto a ave ainda carrega, e a foto tem par para viajar.
     */
    @Test
    fun `tocar no card e em Ver favoritos emite os eventos de navegacao`() =
        runTest {
            val vm = viewModel()
            val card = bird("bem-te-vi").copy(thumbnailUrl = "https://thumb/bem-te-vi.jpg", primaryBiome = Biome.CERRADO)
            vm.events.test {
                vm.onAction(ExploreAction.OpenDetail(card))
                assertThat(awaitItem()).isEqualTo(
                    ExploreEvent.NavigateToDetail(
                        DetailOpening(
                            id = "bem-te-vi",
                            preview = DetailPreview("foto-bem-te-vi", "https://thumb/bem-te-vi.jpg", Biome.CERRADO),
                        ),
                    ),
                )
                vm.onAction(ExploreAction.OpenFavorites)
                assertThat(awaitItem()).isEqualTo(ExploreEvent.NavigateToFavorites)
            }
        }

    @Test
    fun `busca e filtros sobrevivem a morte do processo`() =
        runTest {
            val saved = SavedStateHandle(mapOf(KEY_QUERY to "azul", KEY_BIOME to "cerrado"))
            val vm = viewModel(saved)
            assertThat(repo.calls).containsExactly(ListCall("azul", "cerrado", null, null))

            vm.onAction(ExploreAction.QueryChange("gralha"))
            vm.onAction(ExploreAction.OpenFilters)
            vm.onAction(ExploreAction.SheetState("PR"))
            vm.onAction(ExploreAction.ApplyFilters)

            assertThat(saved.get<String>(KEY_QUERY)).isEqualTo("gralha")
            assertThat(saved.get<String>(KEY_BIOME)).isEqualTo("cerrado")
            assertThat(saved.get<String>(KEY_STATE)).isEqualTo("PR")
        }

    // --- "Ave do dia" ---

    @Test
    fun `ao abrir busca a ave do dia e a mostra sem busca nem filtro`() =
        runTest {
            val vm = viewModel()
            assertThat(featured.calls).isEqualTo(1)
            assertThat(vm.state.value.featured).isEqualTo(sampleFeatured)
            assertThat(vm.state.value.showFeatured).isTrue()
        }

    @Test
    fun `com busca ou filtro a ave do dia some da tela`() =
        runTest {
            val vm = viewModel()
            vm.onAction(ExploreAction.QueryChange("bem"))
            assertThat(vm.state.value.showFeatured).isFalse()
            vm.onAction(ExploreAction.QueryChange(""))
            vm.onAction(ExploreAction.SelectBiome("cerrado"))
            assertThat(vm.state.value.showFeatured).isFalse()
        }

    @Test
    fun `se a ave do dia falhar o card nao aparece e nada vira erro`() =
        runTest {
            featured.next = Result.Failure(DataError.Network.NotFound)
            val vm = viewModel()
            assertThat(vm.state.value.featured).isNull()
            assertThat(vm.state.value.showFeatured).isFalse()
            assertThat(vm.state.value.phase).isEqualTo(ExplorePhase.Content)
        }

    /**
     * A "Ave do dia" leva a miniatura, o bioma e a chave da foto dela ("foto-destaque-<id>"), e não a
     * do mosaico: a mesma ave costuma estar também no mosaico, e a foto partiria do card errado.
     */
    private val featuredPreview =
        DetailPreview(
            photoKey = "foto-destaque-tuiuiu",
            thumbnailUrl = sampleFeatured.species.thumbnailUrl,
            biome = sampleFeatured.species.primaryBiome,
        )

    @Test
    fun `tocar na ave do dia abre o detalhe e o canto abre tocando`() =
        runTest {
            val vm = viewModel()
            vm.events.test {
                vm.onAction(ExploreAction.OpenFeatured)
                assertThat(awaitItem()).isEqualTo(ExploreEvent.NavigateToDetail(DetailOpening("tuiuiu", preview = featuredPreview)))
                vm.onAction(ExploreAction.PlayFeatured)
                assertThat(awaitItem()).isEqualTo(
                    ExploreEvent.NavigateToDetail(DetailOpening("tuiuiu", autoPlay = true, preview = featuredPreview)),
                )
            }
        }

    // --- Chips de bioma ---

    @Test
    fun `o chip de bioma aplica o filtro e tocar de novo volta a todos`() =
        runTest {
            val vm = viewModel()
            vm.onAction(ExploreAction.SelectBiome("cerrado"))
            assertThat(vm.state.value.biome).isEqualTo("cerrado")
            assertThat(repo.calls.last()).isEqualTo(ListCall("", "cerrado", null, null))
            vm.onAction(ExploreAction.SelectBiome("cerrado"))
            assertThat(vm.state.value.biome).isNull()
            vm.onAction(ExploreAction.SelectBiome("pampa"))
            vm.onAction(ExploreAction.SelectBiome(null))
            assertThat(vm.state.value.biome).isNull()
        }

    @Test
    fun `o chip de bioma mantem a UF escolhida no sheet`() =
        runTest {
            val vm = viewModel(SavedStateHandle(mapOf(KEY_STATE to "SP")))
            vm.onAction(ExploreAction.SelectBiome("pampa"))
            assertThat(repo.calls.last()).isEqualTo(ListCall("", "pampa", "SP", null))
        }

    @Test
    fun `o total de aves vem dos filtros`() =
        runTest {
            filters.next = Result.Success(sampleFilters.copy(primaryBiomes = listOf(BiomeFilter("cerrado", "Cerrado", 41))))
            val vm = viewModel()
            assertThat(vm.state.value.speciesTotal).isEqualTo(41)
        }

    // --- "Ave do dia": o lugar reservado e as novas tentativas (revisão final do E1) ---

    @Test
    fun `enquanto a ave do dia carrega o lugar dela ja existe no topo`() =
        runTest {
            // Se o card só entrasse depois da lista, a grade ficaria parada no primeiro pássaro e o card
            // nasceria acima da tela, fora da vista.
            featured.gate = CompletableDeferred()
            val vm = viewModel()
            assertThat(vm.state.value.featuredLoading).isTrue()
            assertThat(vm.state.value.showFeaturedSlot).isTrue()
            featured.gate!!.complete(Unit)
            assertThat(vm.state.value.featuredLoading).isFalse()
            assertThat(vm.state.value.featured).isEqualTo(sampleFeatured)
        }

    @Test
    fun `sem rede a ave do dia volta junto com a lista no tentar novamente`() =
        runTest {
            featured.next = Result.Failure(DataError.Network.NoConnection)
            repo.pages[null] = Result.Failure(DataError.Network.NoConnection)
            val vm = viewModel()
            assertThat(vm.state.value.featured).isNull()
            featured.next = Result.Success(sampleFeatured)
            repo.pages[null] = Result.Success(page(0, 20, "c1"))
            vm.onAction(ExploreAction.Retry)
            assertThat(vm.state.value.featured).isEqualTo(sampleFeatured)
        }

    @Test
    fun `sem ave elegivel nao pede de novo a cada filtro`() =
        runTest {
            featured.next = Result.Failure(DataError.Network.NotFound)
            val vm = viewModel()
            vm.onAction(ExploreAction.SelectBiome("cerrado"))
            vm.onAction(ExploreAction.SelectBiome(null))
            assertThat(featured.calls).isEqualTo(1)
            assertThat(vm.state.value.showFeaturedSlot).isFalse()
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew --continue :core:presentation:testAndroidHostTest :core:piu-ds:testAndroidHostTest :feature:explore:presentation:testAndroidHostTest`

Expected: FAIL na compilação de `SharedPhotoKeyTest` (`Unresolved reference 'featuredPhotoKey'`) e de `PiuSharedPhotoTest` (`No parameter with name 'sharedPhotoKey' found`, no `PiuFeaturedCard`), e em `ExploreViewModelTest > tocar na ave do dia abre o detalhe e o canto abre tocando` (a rota ainda vai sem chave).

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuSharedPhoto.kt`:

```kotlin
// A foto que viaja de uma tela para outra (frente E, seção 6): ao abrir o
// Detalhe, a foto do card do mosaico cresce até o topo do Detalhe, e volta ao
// card no "voltar". É um "elemento compartilhado" do Compose: duas peças, uma
// em cada tela, com a mesma chave; durante a troca de tela, o Compose anima
// os limites de uma até a outra.
//
// O app liga as peças: PiuSharedTransitionLayout em volta da navegação e
// PiuSharedScope em cada tela; os componentes só marcam a foto com
// piuSharedPhoto e uma chave. Com "reduzir animações" ligado, ou fora dessa
// estrutura (prévias e snapshots), nada viaja e a troca de tela é a comum.
// Os dois CompositionLocals e as três funções ficam juntos neste arquivo, por
// isso o detekt não cobra um arquivo com o nome de cada declaração.
@file:Suppress("MatchingDeclarationName")
@file:OptIn(ExperimentalSharedTransitionApi::class)

package com.velosobr.piuds.components

import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.Shape
import com.velosobr.piuds.theme.PiuTheme

/**
 * A camada que desenha a foto enquanto ela viaja. compositionLocalOf é um valor que desce pela
 * árvore de composição sem passar de parâmetro em parâmetro: quem está dentro de
 * PiuSharedTransitionLayout o lê; fora dela, é nulo.
 */
private val LocalPiuSharedTransition = compositionLocalOf<SharedTransitionScope?> { null }

/**
 * O escopo de animação da tela atual (entrando ou saindo). É ele que diz ao Compose em que ponto
 * da troca de tela a foto está.
 */
private val LocalPiuSharedVisibility = compositionLocalOf<AnimatedVisibilityScope?> { null }

/**
 * Envolve a navegação (o NavHost da raiz) para as fotos poderem viajar entre as telas dela.
 * SharedTransitionLayout é a camada do Compose que acompanha os elementos compartilhados e os
 * desenha por cima de tudo durante a troca.
 */
@Composable
fun PiuSharedTransitionLayout(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    SharedTransitionLayout(modifier) {
        CompositionLocalProvider(LocalPiuSharedTransition provides this) { content() }
    }
}

/**
 * Entrega às fotos de uma tela o [scope] de animação dela: no NavHost, o `this` de cada
 * `composable<Rota> { }`. As telas de dentro de outro NavHost (as abas) herdam o escopo da tela
 * da raiz que as contém, e é isso que deixa a foto atravessar dos dois NavHosts.
 */
@Composable
fun PiuSharedScope(
    scope: AnimatedVisibilityScope,
    content: @Composable () -> Unit,
) {
    CompositionLocalProvider(LocalPiuSharedVisibility provides scope) { content() }
}

/**
 * Marca a foto com a [key] que a liga à foto da outra tela ("foto-<id>" ou "foto-destaque-<id>"). Sem chave, sem a camada,
 * sem escopo ou com "reduzir animações", devolve o próprio modificador, sem nada a mais.
 *
 * Usa sharedBounds, e não sharedElement: o card mostra a miniatura e o Detalhe a foto grande
 * (que ainda está baixando). sharedBounds faz a ponte entre conteúdos diferentes: os limites
 * viajam enquanto um lado some e o outro aparece. [shape] recorta a foto durante a viagem (os
 * cantos arredondados do card).
 */
@Composable
fun Modifier.piuSharedPhoto(
    key: String?,
    shape: Shape = RectangleShape,
): Modifier {
    val transition = LocalPiuSharedTransition.current
    val visibility = LocalPiuSharedVisibility.current
    val outsideTransition = transition == null || visibility == null
    if (key == null || outsideTransition || PiuTheme.reduceMotion) return this
    return with(transition) {
        this@piuSharedPhoto.sharedBounds(
            sharedContentState = rememberSharedContentState(key),
            animatedVisibilityScope = visibility,
            clipInOverlayDuringTransition = OverlayClip(shape),
        )
    }
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
import com.velosobr.piuds.components.piuSharedPhoto
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
 * 196 dp, como na prancheta). Com [sharedPhotoKey], a foto (o gradiente e a
 * imagem) viaja até o topo do Detalhe ao tocar no card (veja PiuSharedPhoto.kt).
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
    sharedPhotoKey: String? = null,
) {
    Box(
        modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 196.dp)
            .clip(RoundedCornerShape(28.dp))
            // Role.Button: o leitor de tela diz "botão" depois do nome da ave.
            .clickable(role = Role.Button, onClick = onClick),
    ) {
        // A camada da foto (o gradiente e a imagem por cima) é a que viaja até o Detalhe; o selo, o
        // nome e o botão de canto ficam no card.
        Box(
            Modifier
                .matchParentSize()
                .piuSharedPhoto(sharedPhotoKey, RoundedCornerShape(28.dp))
                .background(
                    PiuTheme.tokens.gradients
                        .getValue(biome)
                        .toBrush(),
                ),
        ) {
            if (imageUrl != null) {
                AsyncImage(
                    model = imageUrl,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.matchParentSize(),
                )
            }
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

Substitua o conteúdo de `core/presentation/src/commonMain/kotlin/com/velosobr/passarim/core/presentation/SharedPhotoKey.kt`:

```kotlin
// As chaves da foto que viaja de um card do Explorar (o do mosaico ou o da
// "Ave do dia") para o topo do Detalhe. As duas telas ficam em módulos
// diferentes e precisam escrever a mesma chave; por isso elas moram aqui, no
// módulo que as duas já usam.

package com.velosobr.passarim.core.presentation

/** A chave do elemento compartilhado da foto de uma ave no mosaico: "foto-<id>" (spec da frente E, seção 6). */
fun speciesPhotoKey(id: String): String = "foto-$id"

/**
 * A chave da foto do card da "Ave do dia": "foto-destaque-<id>". É outra que a do mosaico porque a
 * mesma ave costuma estar nos dois cards ao mesmo tempo; com uma chave só, o Compose não saberia de
 * qual dos dois a foto parte, e ela poderia sair do card que ninguém tocou.
 */
fun featuredPhotoKey(id: String): String = "foto-destaque-$id"
```

Substitua o conteúdo de `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreMosaic.kt`:

```kotlin
// Os itens da grade do Explorar (frente E): a "Ave do dia" em largura total,
// os cards de espécie em colunas desencontradas, o rodapé de "carregando
// mais" e o esqueleto do carregamento. A ExploreScreen monta a grade e põe
// estes itens embaixo do título, da busca e dos chips; separar os dois
// arquivos dá a cada um uma responsabilidade.

package com.velosobr.passarim.feature.explore.presentation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.calculateEndPadding
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.staggeredgrid.LazyStaggeredGridScope
import androidx.compose.foundation.lazy.staggeredgrid.LazyStaggeredGridState
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan
import androidx.compose.foundation.lazy.staggeredgrid.items
import androidx.compose.foundation.lazy.staggeredgrid.itemsIndexed
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
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.presentation.featuredPhotoKey
import com.velosobr.passarim.core.presentation.speciesPhotoKey
import com.velosobr.passarim.feature.explore.presentation.resources.Res
import com.velosobr.passarim.feature.explore.presentation.resources.featured_badge
import com.velosobr.passarim.feature.explore.presentation.resources.featured_badge_biome
import com.velosobr.passarim.feature.explore.presentation.resources.featured_play
import com.velosobr.passarim.feature.explore.presentation.resources.load_more_error
import com.velosobr.passarim.feature.explore.presentation.resources.retry
import com.velosobr.piuds.components.PiuSkeletonBox
import com.velosobr.piuds.components.adult.PiuFeaturedCard
import com.velosobr.piuds.components.adult.PiuMosaicCard
import com.velosobr.piuds.components.adult.PiuMosaicHeight
import com.velosobr.piuds.components.adult.PiuPlayAction
import kotlinx.coroutines.flow.distinctUntilChanged
import org.jetbrains.compose.resources.stringResource

/**
 * A altura do card na posição [index] do mosaico: alto, baixo, baixo, alto, e repete. Com duas
 * colunas, a da esquerda começa alta e a da direita baixa, e as linhas nunca se alinham.
 */
fun mosaicHeightFor(index: Int): PiuMosaicHeight = if (index % 4 == 0 || index % 4 == 3) PiuMosaicHeight.TALL else PiuMosaicHeight.SHORT

/** O gradiente de um card sem bioma principal (catalog sem esse dado): o do Pantanal. */
private val FallbackBiome = Biome.PANTANAL

/**
 * Pede a próxima página quando o último item visível chega perto do fim da grade (a regra está em
 * shouldLoadMore; o ViewModel ignora pedidos repetidos e fora da fase de conteúdo, então emitir a
 * mais é inofensivo). snapshotFlow transforma a leitura do estado da grade num Flow, e
 * rememberUpdatedState dá ao efeito o onAction atual sem reiniciá-lo.
 */
@Composable
internal fun LoadMoreEffect(
    gridState: LazyStaggeredGridState,
    onAction: (ExploreAction) -> Unit,
) {
    val currentOnAction by rememberUpdatedState(onAction)
    LaunchedEffect(gridState) {
        snapshotFlow {
            val info = gridState.layoutInfo
            (info.visibleItemsInfo.lastOrNull()?.index ?: -1) to info.totalItemsCount
        }.distinctUntilChanged()
            .collect { (last, count) -> if (shouldLoadMore(last, count)) currentOnAction(ExploreAction.LoadMore) }
    }
}

/**
 * Os itens do mosaico: a "Ave do dia" ocupando a largura toda e, embaixo, os cards em colunas
 * desencontradas, com o rodapé de "carregando mais" ou de erro. Na LazyVerticalStaggeredGrid cada
 * item tem a própria altura e entra na coluna mais curta; FullLine faz um item ocupar todas as
 * colunas. É uma função de extensão de LazyStaggeredGridScope (o "escopo" em que se declaram os
 * itens de uma grade), para a ExploreScreen chamá-la dentro da grade dela.
 */
internal fun LazyStaggeredGridScope.mosaicItems(
    state: ExploreState,
    onAction: (ExploreAction) -> Unit,
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
            biome = bird.primaryBiome ?: FallbackBiome,
            isFavorite = bird.id in state.favoriteIds,
            onToggleFavorite = { onAction(ExploreAction.ToggleFavorite(bird)) },
            onClick = { onAction(ExploreAction.OpenDetail(bird)) },
            height = mosaicHeightFor(index),
            // A foto do card viaja até o topo do Detalhe ao abrir a ave: o ViewModel manda a mesma chave na rota.
            sharedPhotoKey = speciesPhotoKey(bird.id),
        )
    }
    if (state.isLoadingMore || state.loadMoreError != null) {
        item(key = "footer", span = StaggeredGridItemSpan.FullLine, contentType = "footer") {
            LoadMoreFooter(isLoading = state.isLoadingMore, onRetry = { onAction(ExploreAction.RetryLoadMore) })
        }
    }
}

/** O "esqueleto" do carregamento: quatro blocos cinzas no desenho do mosaico, no lugar dos cards. */
internal fun LazyStaggeredGridScope.skeletonItems() {
    items(4, key = { "skeleton-$it" }, contentType = { "skeleton" }) { index ->
        val height = if (mosaicHeightFor(index) == PiuMosaicHeight.TALL) 220.dp else 168.dp
        PiuSkeletonBox(Modifier.fillMaxWidth().height(height), shape = MaterialTheme.shapes.large)
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
        biome = bird.primaryBiome ?: FallbackBiome,
        onClick = { onAction(ExploreAction.OpenFeatured) },
        // A chave própria da "Ave do dia": a mesma ave pode estar no mosaico, com a chave do mosaico.
        sharedPhotoKey = featuredPhotoKey(bird.id),
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
internal fun PaddingValues.plusMargins(): PaddingValues {
    val direction = LocalLayoutDirection.current
    return PaddingValues(
        start = calculateStartPadding(direction) + GridMargin,
        end = calculateEndPadding(direction) + GridMargin,
        bottom = calculateBottomPadding() + 16.dp,
    )
}

/** A margem lateral da grade, que [fullBleed] desfaz para os itens do topo. */
private val GridMargin = 16.dp

/**
 * Faz um item ocupar a largura da tela inteira, por cima da margem lateral da grade. O título, a
 * busca e os chips já trazem as próprias margens, e a linha de chips precisa ir até a borda para
 * rolar na horizontal sem um corte a 16 dp dela. Modifier.layout mede o item com a largura da
 * grade mais as duas margens e o desenha deslocado para a esquerda; a grade não corta o que passa
 * da área dos itens enquanto continua dentro dela.
 */
internal fun Modifier.fullBleed(): Modifier =
    layout { measurable, constraints ->
        val extra = (GridMargin * 2).roundToPx()
        val width = constraints.maxWidth + extra
        val placeable = measurable.measure(constraints.copy(minWidth = width, maxWidth = width))
        layout(constraints.maxWidth, placeable.height) { placeable.place(-extra / 2, 0) }
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

Substitua o conteúdo de `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreViewModel.kt`:

```kotlin
// O ViewModel do Explorar.
//
// Um ViewModel guarda o estado da tela e sobrevive à rotação. viewModelScope
// é o escopo das coroutines dele: tudo o que roda ali é cancelado quando a
// tela sai de vez. MutableStateFlow guarda o estado atual (a tela lê pelo
// StateFlow, só leitura); Channel entrega cada evento uma vez só.

package com.velosobr.passarim.feature.explore.presentation

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.FavoritesRepository
import com.velosobr.passarim.core.domain.FeaturedRepository
import com.velosobr.passarim.core.domain.FiltersRepository
import com.velosobr.passarim.core.domain.SpeciesSummary
import com.velosobr.passarim.core.domain.onFailure
import com.velosobr.passarim.core.domain.onSuccess
import com.velosobr.passarim.core.presentation.DetailOpening
import com.velosobr.passarim.core.presentation.DetailPreview
import com.velosobr.passarim.core.presentation.ScreenError
import com.velosobr.passarim.core.presentation.featuredPhotoKey
import com.velosobr.passarim.core.presentation.speciesPhotoKey
import com.velosobr.passarim.core.presentation.toScreenError
import com.velosobr.passarim.feature.explore.domain.ExploreRepository
import com.velosobr.passarim.feature.explore.domain.MAX_QUERY_LENGTH
import com.velosobr.passarim.feature.explore.domain.sanitizeQuery
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Espera sem digitar antes de buscar. */
const val SEARCH_DEBOUNCE_MILLIS = 400L

/** A próxima página é pedida quando o último item visível está a esta distância do fim. */
const val PREFETCH_DISTANCE = 6

// Chaves do SavedStateHandle: busca e filtros sobrevivem à morte do processo.
const val KEY_QUERY = "explore.query"
const val KEY_BIOME = "explore.biome"
const val KEY_STATE = "explore.state"

/** Regra da paginação, separada da UI para ser testada. */
fun shouldLoadMore(
    lastVisibleIndex: Int,
    itemCount: Int,
): Boolean = itemCount > 0 && lastVisibleIndex >= itemCount - PREFETCH_DISTANCE

/** O que define a lista: mudou, a lista recomeça do zero. */
private data class Criteria(
    val query: String,
    val biome: String?,
    val state: String?,
)

/**
 * Explorar: busca com debounce, filtros, paginação por cursor, favoritos e a "Ave do dia".
 *
 * Há **um só** [loadJob] por vez (primeira página ou página seguinte): uma busca nova o cancela, então a
 * resposta de uma busca antiga nunca sobrescreve a atual, e a paginação não corre em paralelo com ela.
 */
@OptIn(FlowPreview::class)
class ExploreViewModel(
    private val explore: ExploreRepository,
    private val filtersRepository: FiltersRepository,
    private val favorites: FavoritesRepository,
    private val featuredRepository: FeaturedRepository,
    private val savedState: SavedStateHandle,
) : ViewModel() {
    private val _state =
        MutableStateFlow(
            ExploreState(query = savedState[KEY_QUERY] ?: "", biome = savedState[KEY_BIOME], state = savedState[KEY_STATE]),
        )
    val state: StateFlow<ExploreState> = _state.asStateFlow()

    private val eventChannel = Channel<ExploreEvent>(Channel.BUFFERED)
    val events: Flow<ExploreEvent> = eventChannel.receiveAsFlow()

    /** O texto cru do campo; o debounce é aplicado sobre ele (a primeira emissão não espera). */
    private val queryText = MutableStateFlow(_state.value.query)
    private var criteria = Criteria("", null, null)
    private var loadJob: Job? = null
    private var retryJob: Job? = null

    /** O BFF respondeu que não há "Ave do dia" (NotFound): não adianta pedir de novo nesta sessão. */
    private var featuredAbsent = false

    // Monta a busca: a primeira emissão sai na hora; as seguintes esperam
    // SEARCH_DEBOUNCE_MILLIS sem digitação (debounce), para não fazer um pedido
    // por tecla. combine junta busca, bioma e UF, e distinctUntilChanged evita
    // recarregar quando nada mudou de fato.
    init {
        val query =
            queryText
                .drop(1)
                .debounce(SEARCH_DEBOUNCE_MILLIS)
                .onStart { emit(queryText.value) }
                .map(::sanitizeQuery)
        val biome = _state.map { it.biome }.distinctUntilChanged()
        val uf = _state.map { it.state }.distinctUntilChanged()
        combine(query, biome, uf, ::Criteria)
            .distinctUntilChanged()
            .onEach(::loadFirstPage)
            .launchIn(viewModelScope)
        favorites
            .observeIds()
            .onEach { ids -> _state.update { it.copy(favoriteIds = ids) } }
            .launchIn(viewModelScope)
        loadFilters()
        loadFeatured()
    }

    /** Trata cada ação da tela. */
    @Suppress("CyclomaticComplexMethod")
    fun onAction(action: ExploreAction) {
        when (action) {
            is ExploreAction.QueryChange -> setQuery(action.text)
            ExploreAction.LoadMore -> loadMore()
            ExploreAction.RetryLoadMore -> {
                _state.update { it.copy(loadMoreError = null) }
                loadMore()
            }
            ExploreAction.Retry -> if (_state.value.retryEnabled) loadFirstPage(criteria)
            ExploreAction.ClearFilters -> setFilters(biome = null, state = null)
            ExploreAction.ClearBiome -> setFilters(biome = null, state = _state.value.state)
            ExploreAction.ClearState -> setFilters(biome = _state.value.biome, state = null)
            ExploreAction.OpenFilters -> openSheet()
            ExploreAction.DismissFilters -> _state.update { it.copy(sheet = null) }
            is ExploreAction.SheetBiome -> updateSheet { it.copy(biome = action.code.takeIf { code -> code != it.biome }) }
            is ExploreAction.SheetState -> updateSheet { it.copy(state = action.code.takeIf { code -> code != it.state }) }
            ExploreAction.ShowAllStates -> updateSheet { it.copy(showAllStates = true) }
            ExploreAction.ClearSheet -> updateSheet { it.copy(biome = null, state = null) }
            ExploreAction.ApplyFilters -> applySheet()
            ExploreAction.RetryFilters -> loadFilters()
            is ExploreAction.ToggleFavorite -> viewModelScope.launch { favorites.toggle(action.summary) }
            // O card do mosaico leva a chave da foto dele: a foto viaja do card até o topo do Detalhe.
            is ExploreAction.OpenDetail ->
                eventChannel.trySend(ExploreEvent.NavigateToDetail(action.summary.opening(photoKey = speciesPhotoKey(action.summary.id))))
            ExploreAction.OpenFavorites -> eventChannel.trySend(ExploreEvent.NavigateToFavorites)
            is ExploreAction.SelectBiome ->
                setFilters(biome = action.code.takeIf { it != _state.value.biome }, state = _state.value.state)
            // O canto da "Ave do dia" abre o Detalhe já tocando (autoPlay). A chave da foto é a do card da
            // "Ave do dia" (featuredPhotoKey), e não a do mosaico, onde a mesma ave costuma estar também.
            ExploreAction.OpenFeatured, ExploreAction.PlayFeatured ->
                _state.value.featured?.let {
                    val opening =
                        it.species.opening(photoKey = featuredPhotoKey(it.species.id), autoPlay = action == ExploreAction.PlayFeatured)
                    eventChannel.trySend(ExploreEvent.NavigateToDetail(opening))
                }
        }
    }

    /** Guarda o texto (também no SavedStateHandle) e o entrega ao debounce. */
    private fun setQuery(text: String) {
        val limited = text.take(MAX_QUERY_LENGTH)
        savedState[KEY_QUERY] = limited
        _state.update { it.copy(query = limited) }
        queryText.value = limited
    }

    /** Mudar bioma ou estado dispara a recarga pelo `combine` do `init`. */
    private fun setFilters(
        biome: String?,
        state: String?,
    ) {
        savedState[KEY_BIOME] = biome
        savedState[KEY_STATE] = state
        _state.update { it.copy(biome = biome, state = state, sheet = null) }
    }

    /** Abre o sheet com as escolhas atuais; se os filtros falharam antes, tenta de novo. */
    private fun openSheet() {
        _state.update { it.copy(sheet = FiltersSheetState(biome = it.biome, state = it.state)) }
        if (_state.value.filters == FiltersPhase.Error) loadFilters()
    }

    /** Muda as escolhas do sheet aberto (nada acontece se ele estiver fechado). */
    private fun updateSheet(change: (FiltersSheetState) -> FiltersSheetState) {
        _state.update { s -> s.copy(sheet = s.sheet?.let(change)) }
    }

    /** "Mostrar aves": as escolhas do sheet viram os filtros da lista. */
    private fun applySheet() {
        val sheet = _state.value.sheet ?: return
        setFilters(sheet.biome, sheet.state)
    }

    /** Recomeça a lista do zero para os critérios novos, cancelando o pedido anterior. */
    private fun loadFirstPage(next: Criteria) {
        criteria = next
        loadJob?.cancel()
        retryJob?.cancel()
        _state.update {
            it.copy(
                items = emptyList(),
                nextCursor = null,
                phase = ExplorePhase.Loading,
                isLoadingMore = false,
                loadMoreError = null,
                retryEnabled = true,
            )
        }
        loadJob =
            viewModelScope.launch {
                explore
                    .list(next.query, next.biome, next.state, cursor = null)
                    .onSuccess { page ->
                        _state.update {
                            it.copy(
                                items = page.items.distinctBy { item -> item.id },
                                nextCursor = page.nextCursor,
                                phase = if (page.items.isEmpty()) ExplorePhase.Empty else ExplorePhase.Content,
                            )
                        }
                        loadFeatured()
                    }.onFailure { showError(it.toScreenError()) }
            }
    }

    /** Pede a próxima página, se houver cursor e nada estiver em andamento. */
    private fun loadMore() {
        val s = _state.value
        val cursor = s.nextCursor
        // Só pede com a grade na tela, sem outra requisição em curso e sem erro pendente (esse espera o botão).
        val idle = loadJob?.isActive != true && s.loadMoreError == null
        if (!idle || cursor == null || s.phase != ExplorePhase.Content) return
        _state.update { it.copy(isLoadingMore = true) }
        loadJob =
            viewModelScope.launch {
                explore
                    .list(criteria.query, criteria.biome, criteria.state, cursor = cursor)
                    .onSuccess { page ->
                        _state.update {
                            // Um `key = id` repetido derruba a LazyVerticalGrid: ids já vistos são descartados.
                            val seen = it.items.mapTo(HashSet()) { item -> item.id }
                            it.copy(
                                items = it.items + page.items.filter { item -> seen.add(item.id) },
                                nextCursor = page.nextCursor,
                                isLoadingMore = false,
                            )
                        }
                    }.onFailure { error ->
                        _state.update { it.copy(isLoadingMore = false, loadMoreError = error.toScreenError()) }
                    }
            }
    }

    /**
     * Mostra a tela de erro. Com RateLimited, o botão de tentar fica desligado
     * pelos segundos do Retry-After e religa sozinho depois.
     */
    private fun showError(error: ScreenError) {
        val wait = (error as? ScreenError.RateLimited)?.retryAfterSeconds
        _state.update { it.copy(phase = ExplorePhase.Error(error), retryEnabled = wait == null) }
        if (wait != null) {
            retryJob =
                viewModelScope.launch {
                    delay(wait * 1_000L)
                    _state.update { it.copy(retryEnabled = true) }
                }
        }
    }

    /**
     * Busca a "Ave do dia", se ela ainda não chegou, não está a caminho e o BFF não disse que não há
     * ave elegível (NotFound). Roda ao abrir e a cada lista que chega bem: assim, quem abriu sem rede
     * ganha o card no "Tentar novamente". Qualquer falha só deixa o card de fora, sem erro na tela.
     */
    private fun loadFeatured() {
        val s = _state.value
        if (s.featured != null || s.featuredLoading || featuredAbsent) return
        _state.update { it.copy(featuredLoading = true) }
        viewModelScope.launch {
            featuredRepository
                .getFeaturedSpecies()
                .onSuccess { f -> _state.update { it.copy(featured = f, featuredLoading = false) } }
                .onFailure { error ->
                    featuredAbsent = error == DataError.Network.NotFound
                    _state.update { it.copy(featuredLoading = false) }
                }
        }
    }

    /** Carrega as opções de filtro, independente da lista. */
    private fun loadFilters() {
        _state.update { it.copy(filters = FiltersPhase.Loading) }
        viewModelScope.launch {
            filtersRepository
                .get()
                .onSuccess { f -> _state.update { it.copy(filters = FiltersPhase.Loaded(f)) } }
                .onFailure { _state.update { it.copy(filters = FiltersPhase.Error) } }
        }
    }
}

/**
 * O pedido de abrir o Detalhe desta ave, com o que o card já mostra (miniatura e bioma) e a
 * [photoKey] da foto que viaja do card (nula: a foto não viaja).
 */
private fun SpeciesSummary.opening(
    photoKey: String?,
    autoPlay: Boolean = false,
): DetailOpening = DetailOpening(id, autoPlay, DetailPreview(photoKey, thumbnailUrl, primaryBiome))
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew --continue :core:presentation:testAndroidHostTest :core:piu-ds:testAndroidHostTest :feature:explore:presentation:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:presentation:testAndroidHostTest :core:piu-ds:testAndroidHostTest :feature:explore:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m 'fix: foto da "Ave do dia" viaja do card dela, com chave própria'
```

### Task 10: Revisão I2: a forma de onda com área de toque de 48 dp

A forma de onda virou o controle de posição do canto, mas tinha só os 32 dp do desenho de altura (o `Slider` de antes tinha 48). A caixa com os gestos passa a ter no mínimo 48 dp, a altura mínima de um alvo de toque, com o desenho de 32 dp centralizado nela.

**Files:**
- Test: `feature/detail/presentation/src/androidHostTest/kotlin/com/velosobr/passarim/feature/detail/presentation/AudioPlayerCardTest.kt`
- Modify: `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/Waveform.kt`
- Record: 20 imagens em `snapshots/src/test/snapshots/images/` (0 novas, 20 regravadas)

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `feature/detail/presentation/src/androidHostTest/kotlin/com/velosobr/passarim/feature/detail/presentation/AudioPlayerCardTest.kt`:

```kotlin
// Testes de interface do player do Detalhe no host (Robolectric): o botão de
// tocar em forma de cookie e a forma de onda, que também serve para pular a
// posição do canto (com o dedo ou pelo leitor de tela).

package com.velosobr.passarim.feature.detail.presentation

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.click
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import assertk.assertThat
import assertk.assertions.isBetween
import assertk.assertions.isEqualTo
import assertk.assertions.isNotNull
import com.velosobr.passarim.feature.detail.domain.PlaybackState
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class AudioPlayerCardTest {
    /** Um canto de 31 s, pausado no meio (15,5 s). */
    private val duration = 31_000L

    @Test
    fun `o botao de tocar tem 48 dp e diz o que faz`() =
        runComposeUiTest {
            var toggled = 0
            setContent {
                PiuTheme {
                    AudioPlayerCard(duration, List(64) { 0.5f }, "Gravação: autor", PlaybackState.Idle, { toggled++ }, {})
                }
            }
            onNodeWithContentDescription("Tocar canto").assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp).performClick()
            assertThat(toggled).isEqualTo(1)
        }

    @Test
    fun `a forma de onda diz ao leitor de tela quanto do canto ja tocou`() =
        runComposeUiTest {
            setContent {
                PiuTheme {
                    AudioPlayerCard(duration, List(64) { 0.5f }, "Gravação: autor", PlaybackState.Paused(15_500), {}, {})
                }
            }
            onNodeWithContentDescription("Progresso do canto")
                .assert(SemanticsMatcher.expectValue(SemanticsProperties.ProgressBarRangeInfo, ProgressBarRangeInfo(0.5f, 0f..1f)))
        }

    /**
     * A forma de onda é o controle de posição do canto: a área de toque dela tem pelo menos 48 dp
     * de altura (a mínima de um alvo de toque no Android), mesmo com o desenho de 32 dp.
     */
    @Test
    fun `a forma de onda tem area de toque de 48 dp`() =
        runComposeUiTest {
            setContent {
                PiuTheme {
                    AudioPlayerCard(duration, List(64) { 0.5f }, "Gravação: autor", PlaybackState.Paused(0), {}, {})
                }
            }
            onNodeWithContentDescription("Progresso do canto").assertHeightIsAtLeast(48.dp)
        }

    @Test
    fun `o leitor de tela pula a posicao do canto pela forma de onda`() =
        runComposeUiTest {
            var seekMs: Long? = null
            setContent {
                PiuTheme {
                    AudioPlayerCard(duration, List(64) { 0.5f }, "Gravação: autor", PlaybackState.Paused(0), {}, { seekMs = it })
                }
            }
            onNodeWithContentDescription("Progresso do canto").performSemanticsAction(SemanticsActions.SetProgress) { it(0.25f) }
            assertThat(seekMs).isEqualTo(7_750L)
        }

    @Test
    fun `tocar perto do fim da forma de onda pula para perto do fim do canto`() =
        runComposeUiTest {
            var seekMs: Long? = null
            setContent {
                PiuTheme {
                    AudioPlayerCard(duration, List(64) { 0.5f }, "Gravação: autor", PlaybackState.Paused(0), {}, { seekMs = it })
                }
            }
            onNodeWithContentDescription("Progresso do canto").performTouchInput { click(Offset(width * 0.75f, height / 2f)) }
            assertThat(seekMs).isNotNull().isBetween(22_000L, 24_500L)
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:detail:presentation:testAndroidHostTest --tests '*AudioPlayerCardTest*'`

Expected: FAIL em `AudioPlayerCardTest > a forma de onda tem area de toque de 48 dp` (`assertHeightIsAtLeast(48.dp)`: o nó tem 32 dp).

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/Waveform.kt`:

```kotlin
// A forma de onda do canto no player do Detalhe: barras verticais com a
// altura de cada trecho do áudio, e a parte já tocada na cor primária. É um
// componente do Detalhe, e não do PiuDS, porque só esta tela o usa (a "regra
// do 2" do PiuDS: um componente só sobe para o design system quando a
// segunda tela pede). A conta das barras é uma função pura (waveformBars),
// testada sem desenhar nada; o desenho só pinta o que ela devolve.

package com.velosobr.passarim.feature.detail.presentation

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** Quantas barras a forma de onda tem: uma para cada um dos 64 picos que o catalog calcula. */
const val WAVEFORM_BARS = 64

/**
 * A altura mínima de uma barra (fração da altura total). Um trecho em silêncio (pico 0) ainda
 * aparece como um traço, e sem picos todas as barras ficam nessa altura: uma linha reta.
 */
const val MIN_BAR_HEIGHT = 0.1f

/** Uma barra: [height] de [MIN_BAR_HEIGHT] a 1 (fração da altura total) e se o canto já passou por ela. */
data class WaveformBar(
    val height: Float,
    val played: Boolean,
)

/**
 * Transforma os [peaks] do canto e o [progress] do player (de 0 a 1) nas [barCount] barras da
 * forma de onda. Com outra quantidade de picos, cada barra pega o pico da posição proporcional
 * (a primeira barra o primeiro pico, a última o último). Uma barra conta como tocada quando o
 * progresso já passou do começo dela por inteiro: com progresso 0 nenhuma acende, com 1 todas.
 */
fun waveformBars(
    peaks: List<Float>,
    progress: Float,
    barCount: Int = WAVEFORM_BARS,
): List<WaveformBar> {
    val playedCount = (progress.coerceIn(0f, 1f) * barCount).toInt()
    return List(barCount) { index ->
        val peak =
            if (peaks.isEmpty()) {
                0f
            } else {
                peaks[if (barCount == 1) 0 else index * (peaks.size - 1) / (barCount - 1)]
            }
        WaveformBar(height = peak.coerceIn(MIN_BAR_HEIGHT, 1f), played = index < playedCount)
    }
}

/** A altura do desenho das barras, como na prancheta. */
private val WaveformDrawingHeight = 32.dp

/**
 * A altura mínima da forma de onda inteira: ela é o controle de posição do canto, e 48 dp é a
 * altura mínima de um alvo de toque no Android. O desenho de 32 dp fica centralizado nela.
 */
private val WaveformTouchHeight = 48.dp

/**
 * Desenha a forma de onda: as barras centralizadas na vertical, com cantos arredondados e um
 * espaço entre elas. O [modifier] (com os gestos de tocar e arrastar) vale para a caixa de 48 dp,
 * e não só para o desenho: assim o dedo acerta a forma de onda mesmo um pouco acima ou abaixo
 * dela. Canvas é a área de desenho livre do Compose: o bloco roda a cada quadro em
 * que algo que ele lê muda (aqui, o progresso), e desenhar é barato, então não há nada a guardar
 * entre um quadro e outro. A parte tocada usa [playedColor] (a primária do tema) e o resto
 * [idleColor] (outlineVariant, o cinza das bordas).
 */
@Composable
fun Waveform(
    peaks: List<Float>,
    progress: Float,
    modifier: Modifier = Modifier,
    playedColor: Color = MaterialTheme.colorScheme.primary,
    idleColor: Color = MaterialTheme.colorScheme.outlineVariant,
) {
    Box(modifier.fillMaxWidth().heightIn(min = WaveformTouchHeight), contentAlignment = Alignment.Center) {
        WaveformBars(peaks, progress, playedColor, idleColor)
    }
}

/** O desenho das barras em si, com [WaveformDrawingHeight] de altura. */
@Composable
private fun WaveformBars(
    peaks: List<Float>,
    progress: Float,
    playedColor: Color,
    idleColor: Color,
) {
    Canvas(Modifier.fillMaxWidth().height(WaveformDrawingHeight)) {
        val bars = waveformBars(peaks, progress)
        val gap = 2.dp.toPx()
        val barWidth = ((size.width - gap * (bars.size - 1)) / bars.size).coerceAtLeast(1f)
        val radius = CornerRadius(barWidth / 2)
        bars.forEachIndexed { index, bar ->
            val barHeight = size.height * bar.height
            drawRoundRect(
                color = if (bar.played) playedColor else idleColor,
                topLeft = Offset(index * (barWidth + gap), (size.height - barHeight) / 2),
                size = Size(barWidth, barHeight),
                cornerRadius = radius,
            )
        }
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :feature:detail:presentation:testAndroidHostTest --tests '*AudioPlayerCardTest*'`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Snapshots**

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*DetailSnapshotTest*'`

Expected: 0 imagens novas e 20 regravadas em `snapshots/src/test/snapshots/images/`. Abra cada uma: o player 16 dp mais alto, com a forma de onda centralizada; o resto igual.

- [ ] **Step 6: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:detail:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m 'fix: forma de onda com área de toque de 48 dp'
```

### Task 11: Revisão I3: um arrasto cancelado não deixa a forma de onda presa

Quando outro gesto tomava o dedo no meio do arrasto (a rolagem da tela, por exemplo), a forma de onda ficava parada onde o dedo estava. O cancelamento (`onDragCancel`) agora limpa a posição do arrasto. A semântica da forma de onda passa a dizer a posição que ela mostra (a do dedo durante o arrasto), e entram os testes do arrasto: segue o dedo, pula ao soltar e volta ao player quando é cancelado.

**Files:**
- Test: `feature/detail/presentation/src/androidHostTest/kotlin/com/velosobr/passarim/feature/detail/presentation/AudioPlayerCardTest.kt`
- Modify: `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/AudioPlayerCard.kt`

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `feature/detail/presentation/src/androidHostTest/kotlin/com/velosobr/passarim/feature/detail/presentation/AudioPlayerCardTest.kt`:

```kotlin
// Testes de interface do player do Detalhe no host (Robolectric): o botão de
// tocar em forma de cookie e a forma de onda, que também serve para pular a
// posição do canto (com o dedo ou pelo leitor de tela).

package com.velosobr.passarim.feature.detail.presentation

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.click
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import assertk.assertThat
import assertk.assertions.isBetween
import assertk.assertions.isEqualTo
import assertk.assertions.isNotNull
import assertk.assertions.isNull
import com.velosobr.passarim.feature.detail.domain.PlaybackState
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class AudioPlayerCardTest {
    /** Um canto de 31 s, pausado no meio (15,5 s). */
    private val duration = 31_000L

    @Test
    fun `o botao de tocar tem 48 dp e diz o que faz`() =
        runComposeUiTest {
            var toggled = 0
            setContent {
                PiuTheme {
                    AudioPlayerCard(duration, List(64) { 0.5f }, "Gravação: autor", PlaybackState.Idle, { toggled++ }, {})
                }
            }
            onNodeWithContentDescription("Tocar canto").assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp).performClick()
            assertThat(toggled).isEqualTo(1)
        }

    @Test
    fun `a forma de onda diz ao leitor de tela quanto do canto ja tocou`() =
        runComposeUiTest {
            setContent {
                PiuTheme {
                    AudioPlayerCard(duration, List(64) { 0.5f }, "Gravação: autor", PlaybackState.Paused(15_500), {}, {})
                }
            }
            onNodeWithContentDescription("Progresso do canto")
                .assert(SemanticsMatcher.expectValue(SemanticsProperties.ProgressBarRangeInfo, ProgressBarRangeInfo(0.5f, 0f..1f)))
        }

    /**
     * A forma de onda é o controle de posição do canto: a área de toque dela tem pelo menos 48 dp
     * de altura (a mínima de um alvo de toque no Android), mesmo com o desenho de 32 dp.
     */
    @Test
    fun `a forma de onda tem area de toque de 48 dp`() =
        runComposeUiTest {
            setContent {
                PiuTheme {
                    AudioPlayerCard(duration, List(64) { 0.5f }, "Gravação: autor", PlaybackState.Paused(0), {}, {})
                }
            }
            onNodeWithContentDescription("Progresso do canto").assertHeightIsAtLeast(48.dp)
        }

    @Test
    fun `o leitor de tela pula a posicao do canto pela forma de onda`() =
        runComposeUiTest {
            var seekMs: Long? = null
            setContent {
                PiuTheme {
                    AudioPlayerCard(duration, List(64) { 0.5f }, "Gravação: autor", PlaybackState.Paused(0), {}, { seekMs = it })
                }
            }
            onNodeWithContentDescription("Progresso do canto").performSemanticsAction(SemanticsActions.SetProgress) { it(0.25f) }
            assertThat(seekMs).isEqualTo(7_750L)
        }

    @Test
    fun `tocar perto do fim da forma de onda pula para perto do fim do canto`() =
        runComposeUiTest {
            var seekMs: Long? = null
            setContent {
                PiuTheme {
                    AudioPlayerCard(duration, List(64) { 0.5f }, "Gravação: autor", PlaybackState.Paused(0), {}, { seekMs = it })
                }
            }
            onNodeWithContentDescription("Progresso do canto").performTouchInput { click(Offset(width * 0.75f, height / 2f)) }
            assertThat(seekMs).isNotNull().isBetween(22_000L, 24_500L)
        }

    /** O que a forma de onda diz ao leitor de tela: a fração do canto que ela mostra como tocada. */
    private fun progressOf(fraction: Float) =
        SemanticsMatcher.expectValue(SemanticsProperties.ProgressBarRangeInfo, ProgressBarRangeInfo(fraction, 0f..1f))

    @Test
    fun `arrastar na forma de onda segue o dedo e pula ao soltar`() =
        runComposeUiTest {
            var seekMs: Long? = null
            setContent {
                PiuTheme {
                    AudioPlayerCard(duration, List(64) { 0.5f }, "Gravação: autor", PlaybackState.Paused(0), {}, { seekMs = it })
                }
            }
            val waveform = onNodeWithContentDescription("Progresso do canto")
            waveform.performTouchInput {
                down(Offset(width * 0.25f, height / 2f))
                moveTo(Offset(width * 0.5f, height / 2f))
                moveTo(Offset(width * 0.75f, height / 2f))
            }
            // Enquanto o dedo arrasta, a forma de onda mostra a posição dele, e o player ainda não pulou.
            waveform.assert(progressOf(0.75f))
            assertThat(seekMs).isNull()
            waveform.performTouchInput { up() }
            assertThat(seekMs).isNotNull().isBetween(22_000L, 24_500L)
        }

    /**
     * Um arrasto cancelado (outro gesto, como a rolagem da tela, toma o dedo) não pula a posição, e
     * a forma de onda volta a mostrar onde o player está, em vez de ficar presa onde o dedo parou.
     */
    @Test
    fun `arrasto cancelado devolve a forma de onda a posicao do player`() =
        runComposeUiTest {
            var seekMs: Long? = null
            setContent {
                PiuTheme {
                    AudioPlayerCard(duration, List(64) { 0.5f }, "Gravação: autor", PlaybackState.Paused(0), {}, { seekMs = it })
                }
            }
            val waveform = onNodeWithContentDescription("Progresso do canto")
            waveform.performTouchInput {
                down(Offset(width * 0.25f, height / 2f))
                moveTo(Offset(width * 0.5f, height / 2f))
                moveTo(Offset(width * 0.75f, height / 2f))
                cancel()
            }
            waveform.assert(progressOf(0f))
            assertThat(seekMs).isNull()
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:detail:presentation:testAndroidHostTest --tests '*AudioPlayerCardTest*'`

Expected: FAIL em `AudioPlayerCardTest > arrastar na forma de onda segue o dedo e pula ao soltar` (a semântica ainda diz a posição do player, 0, e não a do dedo, 0.75). Depois de a semântica passar a dizer a posição mostrada (a primeira linha do `AudioPlayerCard`), o teste do arrasto passa e falha `arrasto cancelado devolve a forma de onda a posicao do player` (a onda fica presa em 0.75): é o bug, que o `onDragCancel` corrige.

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/AudioPlayerCard.kt`:

```kotlin
// O cartão do player do canto (prancheta Detalhe.dc.html): o botão de tocar
// em forma de cookie, a forma de onda com a parte tocada na cor primária, os
// tempos e o crédito da gravação.

package com.velosobr.passarim.feature.detail.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.feature.detail.domain.PlaybackState
import com.velosobr.passarim.feature.detail.presentation.resources.Res
import com.velosobr.passarim.feature.detail.presentation.resources.audio_error
import com.velosobr.passarim.feature.detail.presentation.resources.audio_pause
import com.velosobr.passarim.feature.detail.presentation.resources.audio_play
import com.velosobr.passarim.feature.detail.presentation.resources.audio_progress
import com.velosobr.piuds.components.PiuCookieShape
import com.velosobr.piuds.components.PiuCreditCaption
import com.velosobr.piuds.resources.ic_pause
import com.velosobr.piuds.resources.ic_play
import org.jetbrains.compose.resources.stringResource
import org.jetbrains.compose.resources.vectorResource
import com.velosobr.piuds.resources.Res as DesignRes

/**
 * Mostra o canto e deixa tocar, pausar e pular a posição tocando ou arrastando na forma de onda.
 * [peaks] são as alturas da forma de onda (vazia vira uma linha reta). Enquanto o dedo arrasta, a
 * forma de onda segue o dedo (dragging) e não o player; ao soltar, o player pula para a posição
 * escolhida. "by remember { mutableStateOf(...) }" cria um estado que sobrevive às recomposições
 * e, ao mudar, recompõe quem o lê.
 *
 * O fundo é um degradê suave da primaryContainer para a surfaceContainer, como na prancheta; as
 * duas cores vêm do tema, então o par funciona no claro e no escuro.
 */
@Composable
fun AudioPlayerCard(
    durationMs: Long,
    peaks: List<Float>,
    credit: String,
    playback: PlaybackState,
    onTogglePlay: () -> Unit,
    onSeek: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    val position =
        when (playback) {
            is PlaybackState.Playing -> playback.positionMs
            is PlaybackState.Paused -> playback.positionMs
            else -> 0L
        }
    val duration = durationMs.coerceAtLeast(1)
    var dragging by remember { mutableStateOf<Float?>(null) }
    val colors = MaterialTheme.colorScheme
    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(28.dp))
            .background(Brush.linearGradient(listOf(colors.primaryContainer.copy(alpha = 0.55f), colors.surfaceContainer)))
            .padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PlayButton(playback, onTogglePlay)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            // O que a forma de onda mostra: a posição do dedo durante um arrasto, senão a do player.
            val shownProgress = dragging ?: (position.toFloat() / duration).coerceIn(0f, 1f)
            Waveform(
                peaks = peaks,
                progress = shownProgress,
                modifier =
                    Modifier.seekable(
                        label = stringResource(Res.string.audio_progress),
                        progress = shownProgress,
                        onDrag = { dragging = it },
                        onDragCancel = { dragging = null },
                        onSeek = { fraction ->
                            dragging = null
                            onSeek((fraction * duration).toLong())
                        },
                    ),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(formatTime(position), style = MaterialTheme.typography.labelSmall, color = colors.onSurfaceVariant)
                Text(formatTime(durationMs), style = MaterialTheme.typography.labelSmall, color = colors.onSurfaceVariant)
            }
            if (playback == PlaybackState.Error) {
                Text(
                    stringResource(Res.string.audio_error),
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.error,
                )
            }
            PiuCreditCaption(credit)
        }
    }
}

/**
 * Deixa pular a posição do canto pela forma de onda, de três jeitos: tocando num ponto, arrastando
 * (a forma de onda acompanha o dedo por [onDrag] e só pula ao soltar) e pelo leitor de tela. Um
 * arrasto cancelado (outro gesto, como a rolagem da tela, tomou o dedo) chama [onDragCancel] e não
 * pula: a forma de onda volta à posição do player em vez de ficar presa onde o dedo parou.
 * pointerInput recebe os toques crus; a fração é a posição do dedo dividida pela largura.
 * Na semântica, progressBarRangeInfo diz ao leitor de tela quanto já tocou ("50%"), e setProgress
 * é a ação que ele usa para mudar a posição (o gesto de deslizar para cima ou para baixo no
 * TalkBack). rememberUpdatedState deixa os gestos, criados uma vez, chamarem sempre o onSeek atual.
 */
@Composable
private fun Modifier.seekable(
    label: String,
    progress: Float,
    onDrag: (Float) -> Unit,
    onDragCancel: () -> Unit,
    onSeek: (Float) -> Unit,
): Modifier {
    val currentOnDrag by rememberUpdatedState(onDrag)
    val currentOnDragCancel by rememberUpdatedState(onDragCancel)
    val currentOnSeek by rememberUpdatedState(onSeek)
    var lastDrag by remember { mutableStateOf(0f) }
    return this
        .pointerInput(Unit) {
            detectTapGestures { offset -> currentOnSeek((offset.x / size.width).coerceIn(0f, 1f)) }
        }.pointerInput(Unit) {
            detectHorizontalDragGestures(
                onDragEnd = { currentOnSeek(lastDrag) },
                onDragCancel = { currentOnDragCancel() },
                onHorizontalDrag = { change, _ ->
                    lastDrag = (change.position.x / size.width).coerceIn(0f, 1f)
                    currentOnDrag(lastDrag)
                },
            )
        }.semantics {
            contentDescription = label
            progressBarRangeInfo = ProgressBarRangeInfo(progress, 0f..1f)
            setProgress { target ->
                currentOnSeek(target.coerceIn(0f, 1f))
                true
            }
        }
}

/**
 * O botão de tocar: cookie de 64 dp (a forma de assinatura do PiuDS) na cor primária, com spinner
 * enquanto carrega, pausa enquanto toca e play no resto. Role.Button faz o leitor de tela dizer
 * "botão" depois da descrição.
 */
@Composable
private fun PlayButton(
    playback: PlaybackState,
    onTogglePlay: () -> Unit,
) {
    val playing = playback is PlaybackState.Playing || playback == PlaybackState.Loading
    val label = stringResource(if (playing) Res.string.audio_pause else Res.string.audio_play)
    Box(
        Modifier
            .size(64.dp)
            .clip(PiuCookieShape())
            .background(MaterialTheme.colorScheme.primary)
            .clickable(role = Role.Button, onClick = onTogglePlay)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        if (playback == PlaybackState.Loading) {
            CircularProgressIndicator(Modifier.size(24.dp), color = MaterialTheme.colorScheme.onPrimary, strokeWidth = 2.dp)
        } else {
            Icon(
                vectorResource(if (playing) DesignRes.drawable.ic_pause else DesignRes.drawable.ic_play),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.size(28.dp),
            )
        }
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :feature:detail:presentation:testAndroidHostTest --tests '*AudioPlayerCardTest*'`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:detail:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m 'fix: arrasto cancelado não deixa a forma de onda presa'
```

### Task 12: Revisão I4: teste da foto que viaja entre os dois NavHosts, na ida e na volta

O teste da transição usava um `AnimatedContent` só e olhava só a ida. O teste novo, no `:app`, monta a ligação do app em miniatura (a camada em volta do NavHost da raiz, o escopo de cada rota e as abas com o NavHost delas) e acompanha, quadro a quadro, a foto indo do card das abas ao topo do Detalhe e voltando ao card. O `:app` ganha testes de UI no host.

**Files:**
- Modify: `app/build.gradle.kts`
- Create (test): `app/src/androidHostTest/kotlin/com/velosobr/passarim/app/navigation/SharedPhotoNavigationTest.kt`

- [ ] **Step 1: Escrever o teste que falha**

Crie `app/src/androidHostTest/kotlin/com/velosobr/passarim/app/navigation/SharedPhotoNavigationTest.kt`:

```kotlin
// Teste da foto que viaja entre os dois NavHosts do app, no host (Robolectric).
// O card do mosaico mora no NavHost das abas (TabsScreen), e o Detalhe no
// NavHost da raiz (App.kt): a foto precisa atravessar de um para o outro na ida
// (abrir o Detalhe) e voltar ao card na volta. O teste monta a mesma ligação do
// app (a camada PiuSharedTransitionLayout em volta do NavHost da raiz, o
// PiuSharedScope com o escopo de cada rota da raiz e as abas dentro da rota
// delas), com telas mínimas no lugar do Explorar e do Detalhe, que precisariam
// do Koin e da rede.

package com.velosobr.passarim.app.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsNodeInteractionsProvider
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import assertk.assertThat
import assertk.assertions.isTrue
import com.velosobr.piuds.components.PiuSharedScope
import com.velosobr.piuds.components.PiuSharedTransitionLayout
import com.velosobr.piuds.components.piuSharedPhoto
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w411dp-h891dp")
class SharedPhotoNavigationTest {
    /** O NavHost da raiz, guardado para o teste navegar e voltar como os botões do app fazem. */
    private lateinit var rootNav: NavHostController

    /**
     * A ligação do app em miniatura: a raiz com as abas e o Detalhe, e as abas com o próprio
     * NavHost, onde fica o "Explorar" com um card de 100 dp, 300 dp abaixo do topo. O card e o topo
     * do Detalhe (430 dp de altura, no topo da tela) têm a foto da mesma chave.
     */
    @Composable
    private fun AppInMiniature() {
        rootNav = rememberNavController()
        PiuSharedTransitionLayout {
            NavHost(rootNav, startDestination = TabsRoute, modifier = Modifier.fillMaxSize()) {
                composable<TabsRoute> {
                    PiuSharedScope(this) { Tabs(onOpenDetail = { rootNav.navigate(DetailRoute("tuiuiu")) }) }
                }
                composable<DetailRoute> {
                    PiuSharedScope(this) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .height(430.dp)
                                .piuSharedPhoto("foto-tuiuiu")
                                .background(Color.Blue)
                                .testTag("hero"),
                        )
                    }
                }
            }
        }
    }

    /** As abas: um NavHost interno, como o do TabsScreen, com o "Explorar" e o card. */
    @Composable
    private fun Tabs(onOpenDetail: () -> Unit) {
        val tabsNav = rememberNavController()
        NavHost(tabsNav, startDestination = ExploreRoute, modifier = Modifier.fillMaxSize()) {
            composable<ExploreRoute> {
                Box(
                    Modifier
                        .offset(40.dp, 300.dp)
                        .size(100.dp)
                        .piuSharedPhoto("foto-tuiuiu")
                        .background(Color.Red)
                        .testTag("card")
                        .clickable(onClick = onOpenDetail),
                )
            }
        }
    }

    /**
     * A borda de cima (em pixels) dos nós com a [tag], quadro a quadro, por [frames] quadros. No
     * Robolectric a densidade padrão é 1, então pixels e dp coincidem.
     */
    private fun SemanticsNodeInteractionsProvider.topsFrameByFrame(
        tag: String,
        frames: Int,
        advanceFrame: () -> Unit,
    ): List<Float> {
        val tops = mutableListOf<Float>()
        repeat(frames) {
            advanceFrame()
            onAllNodes(hasTestTag(tag)).fetchSemanticsNodes().forEach { tops += it.boundsInRoot.top }
        }
        return tops
    }

    /**
     * Ida e volta, com o relógio parado (mainClock.autoAdvance = false) e avançado um quadro de cada
     * vez. Na ida, o topo do Detalhe passa pelo meio do caminho entre o card (300) e o topo (0): a
     * foto saiu do card. Na volta, o card passa pelo meio do caminho também: a foto voltou a ele.
     */
    @Test
    fun `a foto viaja do card das abas ao detalhe da raiz e volta`() =
        runComposeUiTest {
            mainClock.autoAdvance = false
            setContent { PiuTheme { AppInMiniature() } }
            mainClock.advanceTimeBy(1_000)

            onNodeWithTag("card").performClick()
            val goingTops = topsFrameByFrame("hero", frames = 60) { mainClock.advanceTimeByFrame() }
            assertThat(goingTops.any { it > 20 && it < 280 }).isTrue()
            mainClock.advanceTimeBy(1_000)

            runOnIdle { rootNav.popBackStack() }
            val returningTops = topsFrameByFrame("card", frames = 60) { mainClock.advanceTimeByFrame() }
            assertThat(returningTops.any { it > 20 && it < 280 }).isTrue()
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :app:testAndroidHostTest --tests '*SharedPhotoNavigationTest*'`

Expected: é um teste de guarda: com o código de hoje, passa. O RED foi provado com uma mutação temporária no próprio teste (as abas sem o `PiuSharedScope` da rota delas, a ligação errada do app): `SharedPhotoNavigationTest > a foto viaja do card das abas ao detalhe da raiz e volta` FAILED. Desfeita a mutação, ele passa.

- [ ] **Step 3: Ajustar `build.gradle.kts`**

Em `app/build.gradle.kts`, aplique (o diff mostra o arquivo antes e depois):

```diff
diff --git a/app/build.gradle.kts b/app/build.gradle.kts
index de6614f..6ddf2fb 100644
--- a/app/build.gradle.kts
+++ b/app/build.gradle.kts
@@ -42,5 +42,13 @@ kotlin {
             implementation(libs.turbine)
             implementation(libs.kotlinx.coroutines.test)
         }
+        // Testes de Compose no host Android (Robolectric): a foto que viaja entre os dois NavHosts
+        // do app (o das abas e o da raiz), quadro a quadro.
+        getByName("androidHostTest").dependencies {
+            implementation(libs.compose.uiTest)
+            implementation(libs.androidx.compose.uiTestManifest)
+            implementation(libs.robolectric)
+            implementation(libs.junit4)
+        }
     }
 }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :app:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Conferir que a navegação só liga**

O bloco de rota do `NavHost` só pega o ViewModel, repassa callbacks e navega; nenhum efeito ali.

Run: `git diff feat/e1-explorar -- '*Navigator*.kt' '*NavHost*.kt' '*Graph*.kt' 'app/**/App*.kt' '*TabsScreen*.kt' | grep -E '^\+.*(LaunchedEffect|DisposableEffect|\.collect *[{(])'`

Expected: nenhuma linha.

- [ ] **Step 6: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :app:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m 'fix: teste da foto que viaja entre os dois NavHosts, na ida e na volta'
```

### Task 13: Revisão I5: no escuro, a base da foto do Detalhe escurece até o fundo sem faixa

No tema escuro, o scrim parava na cor dele (80%) atrás do nome e só depois uma faixa de 32 dp ia ao fundo: sobre uma foto clara, ficava uma faixa cinza com a borda dura. O degradê atrás do nome e da faixa passa a ser um só (`heroScrim`): no escuro, como na prancheta, segue do scrim direto até a cor do fundo; no claro, o scrim fica cheio atrás do texto e só depois vai ao fundo claro. As paradas de cor são uma função pura (`heroScrimStops`), testada nos dois temas.

**Files:**
- Modify: `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailHero.kt`
- Create (test): `feature/detail/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/detail/presentation/HeroScrimTest.kt`
- Record: 13 imagens em `snapshots/src/test/snapshots/images/` (0 novas, 13 regravadas)

**Interfaces:**
- Produz: `internal fun heroScrimStops(scrim, background, dark, fadeEnd, textEnd): List<Pair<Float, Color>>`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `feature/detail/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/detail/presentation/HeroScrimTest.kt`:

```kotlin
// Testes do degradê na base da foto do Detalhe (o scrim atrás do nome e a
// faixa que funde a foto ao fundo da tela): as paradas de cor que o topo
// desenha, no tema escuro e no claro.

package com.velosobr.passarim.feature.detail.presentation

import androidx.compose.ui.graphics.Color
import assertk.assertThat
import assertk.assertions.containsExactly
import kotlin.test.Test

class HeroScrimTest {
    /** O scrim dos tokens (#101410 com 80%) e os fundos do Piu escuro e claro. */
    private val scrim = Color(0xCC101410)
    private val darkBackground = Color(0xFF101410)
    private val lightBackground = Color(0xFFF6FBF2)

    /**
     * No escuro, como na prancheta, o degradê não para no scrim: depois de chegar a ele, segue
     * escurecendo até a cor do fundo, sem a faixa cinza de cor parada sobre uma foto clara.
     */
    @Test
    fun `no escuro o degrade segue do scrim ate a cor do fundo sem faixa parada`() {
        val stops = heroScrimStops(scrim, darkBackground, dark = true, fadeEnd = 0.2f, textEnd = 0.8f)
        assertThat(stops).containsExactly(
            0f to scrim.copy(alpha = 0f),
            0.2f to scrim,
            1f to darkBackground,
        )
    }

    /**
     * No claro, o texto branco fica todo sobre o scrim cheio (o contraste), e só depois dele a faixa
     * vai do scrim ao fundo claro.
     */
    @Test
    fun `no claro o scrim fica cheio atras do texto e so depois vai ao fundo`() {
        val stops = heroScrimStops(scrim, lightBackground, dark = false, fadeEnd = 0.2f, textEnd = 0.8f)
        assertThat(stops).containsExactly(
            0f to scrim.copy(alpha = 0f),
            0.2f to scrim,
            0.8f to scrim,
            1f to lightBackground,
        )
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:detail:presentation:testAndroidHostTest --tests '*HeroScrimTest*'`

Expected: FAIL na compilação de `HeroScrimTest`: `Unresolved reference 'heroScrimStops'`.

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailHero.kt`:

```kotlin
// O topo do Detalhe (prancheta Detalhe.dc.html, frente E): a foto de ponta a
// ponta, que vai até atrás da barra de status, o nome da ave em branco sobre
// o scrim na base da foto, uma faixa que funde a foto ao fundo da tela e os
// botões de voltar e de favoritar em círculos de vidro fosco por cima.

package com.velosobr.passarim.feature.detail.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconToggleButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.presentation.DetailPreview
import com.velosobr.passarim.feature.detail.domain.SpeciesDetail
import com.velosobr.passarim.feature.detail.presentation.resources.Res
import com.velosobr.passarim.feature.detail.presentation.resources.back
import com.velosobr.piuds.components.PiuBlurState
import com.velosobr.piuds.components.PiuBlurSurface
import com.velosobr.piuds.components.PiuHeroPhoto
import com.velosobr.piuds.components.piuBlurSource
import com.velosobr.piuds.components.rememberPiuBlurState
import com.velosobr.piuds.resources.favorite_add
import com.velosobr.piuds.resources.favorite_remove
import com.velosobr.piuds.resources.ic_arrow_back
import com.velosobr.piuds.resources.ic_favorite_filled
import com.velosobr.piuds.resources.ic_favorites
import com.velosobr.piuds.theme.PiuDimens
import com.velosobr.piuds.theme.PiuTheme
import org.jetbrains.compose.resources.stringResource
import org.jetbrains.compose.resources.vectorResource
import com.velosobr.piuds.resources.Res as DesignRes

/** A altura da foto de ponta a ponta do topo (prancheta Detalhe.dc.html). */
val HERO_HEIGHT = 430.dp

/** O gradiente atrás da foto de uma ave sem bioma principal (BFF antigo): o do Pantanal, como no mosaico. */
internal val FallbackBiome = Biome.PANTANAL

/** A altura da faixa que funde a base da foto (já escurecida pelo scrim) à cor do fundo da tela. */
private val FadeHeight = 32.dp

/**
 * O topo: foto, nome e botões. A caixa tem no mínimo [HERO_HEIGHT]; com fonte grande, o nome
 * empurra a caixa para baixo em vez de ser cortado. A foto é a fonte do desfoque
 * (piuBlurSource): os botões desfocam o que está atrás deles. Ao abrir por um card, ela chega
 * voando dele com a chave da [preview] (a mesma do esqueleto do carregamento), e a miniatura do
 * card fica por baixo até a foto grande baixar. Ela fica numa camada à parte dos
 * botões porque uma superfície não pode desfocar a si mesma.
 *
 * O nome fica sobre um degradê escuro (heroScrim, com a cor do scrim do PiuDS) que garante o
 * contraste do branco sobre qualquer foto (inclusive uma foto toda branca), e o degradê termina na
 * cor do fundo do tema: a foto se funde à página. No escuro ele escurece sem parar até o fundo,
 * como na prancheta; no claro vira uma transição curta do escuro para o claro, depois do texto.
 */
@Composable
internal fun DetailHero(
    detail: SpeciesDetail,
    preview: DetailPreview,
    isFavorite: Boolean,
    onAction: (DetailAction) -> Unit,
) {
    val blur = rememberPiuBlurState()
    val scrim = PiuTheme.tokens.scrim
    Box(Modifier.fillMaxWidth().heightIn(min = HERO_HEIGHT)) {
        PiuHeroPhoto(
            imageUrl = detail.photos.firstOrNull()?.heroUrl,
            biome = detail.primaryBiome ?: preview.biome ?: FallbackBiome,
            aspectRatio = null,
            placeholderUrl = preview.thumbnailUrl,
            sharedPhotoKey = preview.photoKey,
            modifier = Modifier.matchParentSize().piuBlurSource(blur),
        )
        Column(Modifier.align(Alignment.BottomStart).fillMaxWidth()) {
            // Guarda o lugar da barra de status e dos botões: um nome longo nunca sobe para baixo deles.
            Spacer(Modifier.statusBarsPadding().height(PiuDimens.touchTarget + 32.dp))
            Column(Modifier.fillMaxWidth().heroScrim(scrim, MaterialTheme.colorScheme.background, PiuTheme.isDark)) {
                Column(
                    Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 56.dp, bottom = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        detail.commonName,
                        style = MaterialTheme.typography.headlineLarge,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color.White,
                    )
                    Text(
                        detail.scientificName,
                        style = MaterialTheme.typography.bodyLarge,
                        fontStyle = FontStyle.Italic,
                        color = Color.White.copy(alpha = 0.9f),
                    )
                }
                // A faixa que funde a base da foto ao fundo da tela: só espaço, o degradê é o do heroScrim.
                Spacer(Modifier.height(FadeHeight))
            }
        }
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            BackButton(blur, onBack = { onAction(DetailAction.Back) })
            FavoriteButton(blur, detail.commonName, isFavorite, onToggle = { onAction(DetailAction.ToggleFavorite) })
        }
    }
}

/** Até onde o degradê sobe transparente, no alto do bloco do nome, antes de chegar ao scrim cheio. */
private val ScrimFade = 48.dp

/**
 * As paradas de cor (posição de 0 a 1 na altura, cor) do degradê atrás do nome e da faixa de
 * baixo. Sobe transparente até [fadeEnd], onde chega ao [scrim] cheio. No [dark], segue direto do
 * scrim até o [background]: o scrim escuro e o fundo escuro são quase a mesma cor, então o texto
 * fica sempre sobre algo pelo menos tão escuro quanto o scrim, e não sobra uma faixa de cor parada
 * (cinza, sobre uma foto clara) com a borda dura no fim. No claro, o fundo é claro: o scrim fica
 * cheio até [textEnd], o fim do texto, e só a faixa de baixo vai até o fundo.
 */
internal fun heroScrimStops(
    scrim: Color,
    background: Color,
    dark: Boolean,
    fadeEnd: Float,
    textEnd: Float,
): List<Pair<Float, Color>> {
    val start = 0f to scrim.copy(alpha = 0f)
    val full = fadeEnd to scrim
    val end = 1f to background
    return if (dark) listOf(start, full, end) else listOf(start, full, textEnd to scrim, end)
}

/**
 * Pinta o degradê de [heroScrimStops] atrás do bloco do nome e da faixa de [FadeHeight] embaixo
 * dele. drawBehind desenha antes do conteúdo, no tamanho do bloco; as posições das paradas são
 * frações da altura, calculadas a cada desenho, porque o bloco cresce com fonte grande.
 */
private fun Modifier.heroScrim(
    scrim: Color,
    background: Color,
    dark: Boolean,
): Modifier =
    drawBehind {
        val stops =
            heroScrimStops(
                scrim = scrim,
                background = background,
                dark = dark,
                fadeEnd = (ScrimFade.toPx() / size.height).coerceIn(0f, 1f),
                textEnd = ((size.height - FadeHeight.toPx()) / size.height).coerceIn(0f, 1f),
            )
        drawRect(Brush.verticalGradient(*stops.toTypedArray()))
    }

/**
 * O botão de voltar: um círculo de vidro fosco de 48 dp (PiuBlurSurface) com a tinta translúcida
 * da superfície do tema, que dá contraste ao ícone mesmo onde o desfoque não roda.
 */
@Composable
internal fun BackButton(
    blur: PiuBlurState,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    GlassCircle(blur, modifier) {
        IconButton(onClick = onBack, modifier = Modifier.size(PiuDimens.touchTarget)) {
            Icon(vectorResource(DesignRes.drawable.ic_arrow_back), contentDescription = stringResource(Res.string.back))
        }
    }
}

/**
 * O coração: IconToggleButton é um botão de liga/desliga, então o leitor de tela anuncia se a ave
 * já está nos favoritos, e a descrição diz o que o toque vai fazer ("Favoritar Tuiuiú").
 */
@Composable
private fun FavoriteButton(
    blur: PiuBlurState,
    name: String,
    isFavorite: Boolean,
    onToggle: () -> Unit,
) {
    GlassCircle(blur) {
        IconToggleButton(checked = isFavorite, onCheckedChange = { onToggle() }, modifier = Modifier.size(PiuDimens.touchTarget)) {
            Icon(
                vectorResource(if (isFavorite) DesignRes.drawable.ic_favorite_filled else DesignRes.drawable.ic_favorites),
                contentDescription =
                    stringResource(
                        if (isFavorite) DesignRes.string.favorite_remove else DesignRes.string.favorite_add,
                        name,
                    ),
                tint = if (isFavorite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

/** O círculo de vidro fosco de 48 dp que os dois botões usam. */
@Composable
private fun GlassCircle(
    blur: PiuBlurState,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    PiuBlurSurface(
        state = blur,
        shape = CircleShape,
        tint = MaterialTheme.colorScheme.surface.copy(alpha = 0.6f),
        modifier = modifier.size(PiuDimens.touchTarget),
    ) { content() }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :feature:detail:presentation:testAndroidHostTest --tests '*HeroScrimTest*'`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Snapshots**

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*DetailSnapshotTest*'`

Expected: 0 imagens novas e 13 regravadas em `snapshots/src/test/snapshots/images/`. Abra o `detail-complete-top-dark` e compare com a prancheta `Detalhe.dc.html`: a base da foto escurece sem parar até a cor do fundo, sem a faixa cinza; no claro, o topo continua igual.

- [ ] **Step 6: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:detail:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m 'fix: no escuro, a base da foto do Detalhe escurece até o fundo sem faixa'
```

### Task 14: Revisão minor 1: com outro número de picos, cada barra usa o maior pico do trecho

Com uma quantidade de picos diferente de 64, cada barra pegava um pico só, na posição arredondada para baixo: trechos altos podiam sumir. Os picos passam a ser divididos em trechos iguais, e cada barra fica com o maior pico do trecho dela. Os testes olham todas as barras, e não só a primeira e a última.

**Files:**
- Modify: `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/Waveform.kt`
- Test: `feature/detail/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/detail/presentation/WaveformTest.kt`

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `feature/detail/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/detail/presentation/WaveformTest.kt`:

```kotlin
// Testes da função pura da forma de onda: dos picos do canto e do progresso
// do player até as barras que a tela desenha (altura e se já tocou).

package com.velosobr.passarim.feature.detail.presentation

import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.each
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import assertk.assertions.prop
import kotlin.test.Test

class WaveformTest {
    /** 64 picos crescentes, de 0 a 1, como os que o catalog calcula. */
    private val peaks = List(64) { it / 63f }

    @Test
    fun `uma barra por pico com a altura do pico`() {
        val bars = waveformBars(peaks, progress = 0f)
        assertThat(bars).hasSize(WAVEFORM_BARS)
        assertThat(bars[32].height).isEqualTo(peaks[32])
        assertThat(bars.last().height).isEqualTo(1f)
    }

    @Test
    fun `pico zero vira a barra minima para o silencio continuar visivel`() {
        assertThat(waveformBars(peaks, progress = 0f).first().height).isEqualTo(MIN_BAR_HEIGHT)
    }

    @Test
    fun `sem picos a forma de onda e uma linha reta`() {
        val bars = waveformBars(emptyList(), progress = 0.5f)
        assertThat(bars).hasSize(WAVEFORM_BARS)
        assertThat(bars.map { it.height }.distinct()).containsExactly(MIN_BAR_HEIGHT)
    }

    @Test
    fun `com progresso zero nenhuma barra tocou`() {
        assertThat(waveformBars(peaks, progress = 0f)).each { it.prop(WaveformBar::played).isFalse() }
    }

    @Test
    fun `com progresso um todas as barras tocaram`() {
        assertThat(waveformBars(peaks, progress = 1f)).each { it.prop(WaveformBar::played).isTrue() }
    }

    @Test
    fun `no meio do canto a primeira metade das barras tocou`() {
        val bars = waveformBars(peaks, progress = 0.5f)
        assertThat(bars.count { it.played }).isEqualTo(32)
        assertThat(bars[31].played).isTrue()
        assertThat(bars[32].played).isFalse()
    }

    @Test
    fun `progresso fora de 0 a 1 e limitado ao intervalo`() {
        assertThat(waveformBars(peaks, progress = -1f).count { it.played }).isEqualTo(0)
        assertThat(waveformBars(peaks, progress = 2f).count { it.played }).isEqualTo(WAVEFORM_BARS)
    }

    @Test
    fun `picos em quantidade diferente sao reamostrados para o numero de barras`() {
        val bars = waveformBars(listOf(0.2f, 0.8f), progress = 0f)
        assertThat(bars).hasSize(WAVEFORM_BARS)
        assertThat(bars.first().height).isEqualTo(0.2f)
        assertThat(bars.last().height).isEqualTo(0.8f)
    }

    /**
     * Com mais picos que barras, cada barra fica com o maior pico do trecho dela, e não com um pico
     * qualquer: aqui, 128 picos alternando silêncio e máximo viram 64 barras cheias, e nenhum
     * trecho alto some da forma de onda.
     */
    @Test
    fun `com mais picos que barras cada barra pega o maior pico do trecho dela`() {
        val alternating = List(128) { if (it % 2 == 1) 1f else 0f }
        val bars = waveformBars(alternating, progress = 0f)
        assertThat(bars).hasSize(WAVEFORM_BARS)
        assertThat(bars).each { it.prop(WaveformBar::height).isEqualTo(1f) }
    }

    /** Com menos picos que barras, cada pico se estica por um trecho igual: metade das barras para cada um. */
    @Test
    fun `com menos picos que barras cada pico ocupa um trecho igual`() {
        val bars = waveformBars(listOf(0.2f, 0.8f), progress = 0f)
        assertThat(bars.count { it.height == 0.2f }).isEqualTo(WAVEFORM_BARS / 2)
        assertThat(bars.count { it.height == 0.8f }).isEqualTo(WAVEFORM_BARS / 2)
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:detail:presentation:testAndroidHostTest --tests '*WaveformTest*'`

Expected: FAIL em `WaveformTest > com mais picos que barras cada barra pega o maior pico do trecho dela` (barras de 128 picos alternados ficavam em 0.1) e em `com menos picos que barras cada pico ocupa um trecho igual`.

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/Waveform.kt`:

```kotlin
// A forma de onda do canto no player do Detalhe: barras verticais com a
// altura de cada trecho do áudio, e a parte já tocada na cor primária. É um
// componente do Detalhe, e não do PiuDS, porque só esta tela o usa (a "regra
// do 2" do PiuDS: um componente só sobe para o design system quando a
// segunda tela pede). A conta das barras é uma função pura (waveformBars),
// testada sem desenhar nada; o desenho só pinta o que ela devolve.

package com.velosobr.passarim.feature.detail.presentation

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** Quantas barras a forma de onda tem: uma para cada um dos 64 picos que o catalog calcula. */
const val WAVEFORM_BARS = 64

/**
 * A altura mínima de uma barra (fração da altura total). Um trecho em silêncio (pico 0) ainda
 * aparece como um traço, e sem picos todas as barras ficam nessa altura: uma linha reta.
 */
const val MIN_BAR_HEIGHT = 0.1f

/** Uma barra: [height] de [MIN_BAR_HEIGHT] a 1 (fração da altura total) e se o canto já passou por ela. */
data class WaveformBar(
    val height: Float,
    val played: Boolean,
)

/**
 * Transforma os [peaks] do canto e o [progress] do player (de 0 a 1) nas [barCount] barras da
 * forma de onda. Com outra quantidade de picos, a lista é dividida em [barCount] trechos iguais
 * e cada barra fica com o maior pico do trecho dela (com mais picos que barras, nenhum trecho alto
 * some; com menos, cada pico se estica por um trecho igual). Uma barra conta como tocada quando o
 * progresso já passou do começo dela por inteiro: com progresso 0 nenhuma acende, com 1 todas.
 */
fun waveformBars(
    peaks: List<Float>,
    progress: Float,
    barCount: Int = WAVEFORM_BARS,
): List<WaveformBar> {
    val playedCount = (progress.coerceIn(0f, 1f) * barCount).toInt()
    return List(barCount) { index ->
        val peak =
            if (peaks.isEmpty()) {
                0f
            } else {
                // O trecho da barra: do pico "from" (inclusive) ao "to" (exclusive), com pelo menos um pico.
                val from = index * peaks.size / barCount
                val to = maxOf(from + 1, (index + 1) * peaks.size / barCount)
                peaks.subList(from, to).max()
            }
        WaveformBar(height = peak.coerceIn(MIN_BAR_HEIGHT, 1f), played = index < playedCount)
    }
}

/** A altura do desenho das barras, como na prancheta. */
private val WaveformDrawingHeight = 32.dp

/**
 * A altura mínima da forma de onda inteira: ela é o controle de posição do canto, e 48 dp é a
 * altura mínima de um alvo de toque no Android. O desenho de 32 dp fica centralizado nela.
 */
private val WaveformTouchHeight = 48.dp

/**
 * Desenha a forma de onda: as barras centralizadas na vertical, com cantos arredondados e um
 * espaço entre elas. O [modifier] (com os gestos de tocar e arrastar) vale para a caixa de 48 dp,
 * e não só para o desenho: assim o dedo acerta a forma de onda mesmo um pouco acima ou abaixo
 * dela. Canvas é a área de desenho livre do Compose: o bloco roda a cada quadro em
 * que algo que ele lê muda (aqui, o progresso), e desenhar é barato, então não há nada a guardar
 * entre um quadro e outro. A parte tocada usa [playedColor] (a primária do tema) e o resto
 * [idleColor] (outlineVariant, o cinza das bordas).
 */
@Composable
fun Waveform(
    peaks: List<Float>,
    progress: Float,
    modifier: Modifier = Modifier,
    playedColor: Color = MaterialTheme.colorScheme.primary,
    idleColor: Color = MaterialTheme.colorScheme.outlineVariant,
) {
    Box(modifier.fillMaxWidth().heightIn(min = WaveformTouchHeight), contentAlignment = Alignment.Center) {
        WaveformBars(peaks, progress, playedColor, idleColor)
    }
}

/** O desenho das barras em si, com [WaveformDrawingHeight] de altura. */
@Composable
private fun WaveformBars(
    peaks: List<Float>,
    progress: Float,
    playedColor: Color,
    idleColor: Color,
) {
    Canvas(Modifier.fillMaxWidth().height(WaveformDrawingHeight)) {
        val bars = waveformBars(peaks, progress)
        val gap = 2.dp.toPx()
        val barWidth = ((size.width - gap * (bars.size - 1)) / bars.size).coerceAtLeast(1f)
        val radius = CornerRadius(barWidth / 2)
        bars.forEachIndexed { index, bar ->
            val barHeight = size.height * bar.height
            drawRoundRect(
                color = if (bar.played) playedColor else idleColor,
                topLeft = Offset(index * (barWidth + gap), (size.height - barHeight) / 2),
                size = Size(barWidth, barHeight),
                cornerRadius = radius,
            )
        }
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :feature:detail:presentation:testAndroidHostTest --tests '*WaveformTest*'`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:detail:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m 'fix: forma de onda com outro número de picos usa o maior pico de cada trecho'
```

### Task 15: Revisão minor 2: as alturas da forma de onda ficam guardadas enquanto os picos não mudam

O desenho recalculava todas as barras a cada quadro. A conta se divide: `waveformHeights` depende só dos picos e fica guardada com `remember`; a cada quadro só se conta quantas barras já tocaram (`playedBarCount`). `waveformBars` junta as duas e continua sendo a função testada.

**Files:**
- Modify: `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/Waveform.kt`
- Test: `feature/detail/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/detail/presentation/WaveformTest.kt`

**Interfaces:**
- Produz: `fun waveformHeights(peaks, barCount): List<Float>` e `fun playedBarCount(progress, barCount): Int`.

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `feature/detail/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/detail/presentation/WaveformTest.kt`:

```kotlin
// Testes da função pura da forma de onda: dos picos do canto e do progresso
// do player até as barras que a tela desenha (altura e se já tocou).

package com.velosobr.passarim.feature.detail.presentation

import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.each
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import assertk.assertions.prop
import kotlin.test.Test

class WaveformTest {
    /** 64 picos crescentes, de 0 a 1, como os que o catalog calcula. */
    private val peaks = List(64) { it / 63f }

    @Test
    fun `uma barra por pico com a altura do pico`() {
        val bars = waveformBars(peaks, progress = 0f)
        assertThat(bars).hasSize(WAVEFORM_BARS)
        assertThat(bars[32].height).isEqualTo(peaks[32])
        assertThat(bars.last().height).isEqualTo(1f)
    }

    @Test
    fun `pico zero vira a barra minima para o silencio continuar visivel`() {
        assertThat(waveformBars(peaks, progress = 0f).first().height).isEqualTo(MIN_BAR_HEIGHT)
    }

    @Test
    fun `sem picos a forma de onda e uma linha reta`() {
        val bars = waveformBars(emptyList(), progress = 0.5f)
        assertThat(bars).hasSize(WAVEFORM_BARS)
        assertThat(bars.map { it.height }.distinct()).containsExactly(MIN_BAR_HEIGHT)
    }

    @Test
    fun `com progresso zero nenhuma barra tocou`() {
        assertThat(waveformBars(peaks, progress = 0f)).each { it.prop(WaveformBar::played).isFalse() }
    }

    @Test
    fun `com progresso um todas as barras tocaram`() {
        assertThat(waveformBars(peaks, progress = 1f)).each { it.prop(WaveformBar::played).isTrue() }
    }

    @Test
    fun `no meio do canto a primeira metade das barras tocou`() {
        val bars = waveformBars(peaks, progress = 0.5f)
        assertThat(bars.count { it.played }).isEqualTo(32)
        assertThat(bars[31].played).isTrue()
        assertThat(bars[32].played).isFalse()
    }

    @Test
    fun `progresso fora de 0 a 1 e limitado ao intervalo`() {
        assertThat(waveformBars(peaks, progress = -1f).count { it.played }).isEqualTo(0)
        assertThat(waveformBars(peaks, progress = 2f).count { it.played }).isEqualTo(WAVEFORM_BARS)
    }

    @Test
    fun `picos em quantidade diferente sao reamostrados para o numero de barras`() {
        val bars = waveformBars(listOf(0.2f, 0.8f), progress = 0f)
        assertThat(bars).hasSize(WAVEFORM_BARS)
        assertThat(bars.first().height).isEqualTo(0.2f)
        assertThat(bars.last().height).isEqualTo(0.8f)
    }

    /**
     * Com mais picos que barras, cada barra fica com o maior pico do trecho dela, e não com um pico
     * qualquer: aqui, 128 picos alternando silêncio e máximo viram 64 barras cheias, e nenhum
     * trecho alto some da forma de onda.
     */
    @Test
    fun `com mais picos que barras cada barra pega o maior pico do trecho dela`() {
        val alternating = List(128) { if (it % 2 == 1) 1f else 0f }
        val bars = waveformBars(alternating, progress = 0f)
        assertThat(bars).hasSize(WAVEFORM_BARS)
        assertThat(bars).each { it.prop(WaveformBar::height).isEqualTo(1f) }
    }

    /** Com menos picos que barras, cada pico se estica por um trecho igual: metade das barras para cada um. */
    @Test
    fun `com menos picos que barras cada pico ocupa um trecho igual`() {
        val bars = waveformBars(listOf(0.2f, 0.8f), progress = 0f)
        assertThat(bars.count { it.height == 0.2f }).isEqualTo(WAVEFORM_BARS / 2)
        assertThat(bars.count { it.height == 0.8f }).isEqualTo(WAVEFORM_BARS / 2)
    }

    /**
     * As alturas dependem só dos picos, e o desenho as guarda entre um quadro e outro; a cada quadro
     * só se conta quantas barras já tocaram. As duas contas juntas dão as mesmas barras de waveformBars.
     */
    @Test
    fun `alturas e barras tocadas separadas dao as mesmas barras`() {
        val heights = waveformHeights(peaks)
        val played = playedBarCount(progress = 0.5f, barCount = heights.size)
        assertThat(heights.mapIndexed { index, height -> WaveformBar(height, index < played) })
            .isEqualTo(waveformBars(peaks, progress = 0.5f))
        assertThat(played).isEqualTo(32)
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:detail:presentation:testAndroidHostTest --tests '*WaveformTest*'`

Expected: FAIL na compilação de `WaveformTest`: `Unresolved reference 'waveformHeights'` e `'playedBarCount'`.

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/Waveform.kt`:

```kotlin
// A forma de onda do canto no player do Detalhe: barras verticais com a
// altura de cada trecho do áudio, e a parte já tocada na cor primária. É um
// componente do Detalhe, e não do PiuDS, porque só esta tela o usa (a "regra
// do 2" do PiuDS: um componente só sobe para o design system quando a
// segunda tela pede). A conta das barras é uma função pura (waveformBars),
// testada sem desenhar nada; o desenho só pinta o que ela devolve.

package com.velosobr.passarim.feature.detail.presentation

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** Quantas barras a forma de onda tem: uma para cada um dos 64 picos que o catalog calcula. */
const val WAVEFORM_BARS = 64

/**
 * A altura mínima de uma barra (fração da altura total). Um trecho em silêncio (pico 0) ainda
 * aparece como um traço, e sem picos todas as barras ficam nessa altura: uma linha reta.
 */
const val MIN_BAR_HEIGHT = 0.1f

/** Uma barra: [height] de [MIN_BAR_HEIGHT] a 1 (fração da altura total) e se o canto já passou por ela. */
data class WaveformBar(
    val height: Float,
    val played: Boolean,
)

/**
 * Transforma os [peaks] do canto e o [progress] do player (de 0 a 1) nas [barCount] barras da
 * forma de onda. Com outra quantidade de picos, a lista é dividida em [barCount] trechos iguais
 * e cada barra fica com o maior pico do trecho dela (com mais picos que barras, nenhum trecho alto
 * some; com menos, cada pico se estica por um trecho igual). Uma barra conta como tocada quando o
 * progresso já passou do começo dela por inteiro: com progresso 0 nenhuma acende, com 1 todas.
 */
fun waveformBars(
    peaks: List<Float>,
    progress: Float,
    barCount: Int = WAVEFORM_BARS,
): List<WaveformBar> {
    val playedCount = playedBarCount(progress, barCount)
    return waveformHeights(peaks, barCount).mapIndexed { index, height -> WaveformBar(height, played = index < playedCount) }
}

/**
 * Só as alturas das [barCount] barras (a parte de waveformBars que depende dos [peaks]). O desenho
 * as guarda enquanto os picos não mudam, porque o progresso muda a cada quadro e os picos não.
 */
fun waveformHeights(
    peaks: List<Float>,
    barCount: Int = WAVEFORM_BARS,
): List<Float> =
    List(barCount) { index ->
        val peak =
            if (peaks.isEmpty()) {
                0f
            } else {
                // O trecho da barra: do pico "from" (inclusive) ao "to" (exclusive), com pelo menos um pico.
                val from = index * peaks.size / barCount
                val to = maxOf(from + 1, (index + 1) * peaks.size / barCount)
                peaks.subList(from, to).max()
            }
        peak.coerceIn(MIN_BAR_HEIGHT, 1f)
    }

/** Quantas das [barCount] barras o canto já passou por inteiro, com o [progress] limitado de 0 a 1. */
fun playedBarCount(
    progress: Float,
    barCount: Int = WAVEFORM_BARS,
): Int = (progress.coerceIn(0f, 1f) * barCount).toInt()

/** A altura do desenho das barras, como na prancheta. */
private val WaveformDrawingHeight = 32.dp

/**
 * A altura mínima da forma de onda inteira: ela é o controle de posição do canto, e 48 dp é a
 * altura mínima de um alvo de toque no Android. O desenho de 32 dp fica centralizado nela.
 */
private val WaveformTouchHeight = 48.dp

/**
 * Desenha a forma de onda: as barras centralizadas na vertical, com cantos arredondados e um
 * espaço entre elas. O [modifier] (com os gestos de tocar e arrastar) vale para a caixa de 48 dp,
 * e não só para o desenho: assim o dedo acerta a forma de onda mesmo um pouco acima ou abaixo
 * dela. Canvas é a área de desenho livre do Compose: o bloco roda a cada quadro em
 * que algo que ele lê muda (aqui, o progresso); as alturas das barras, que só dependem dos picos,
 * ficam guardadas de um quadro para o outro. A parte tocada usa [playedColor] (a primária do tema) e o resto
 * [idleColor] (outlineVariant, o cinza das bordas).
 */
@Composable
fun Waveform(
    peaks: List<Float>,
    progress: Float,
    modifier: Modifier = Modifier,
    playedColor: Color = MaterialTheme.colorScheme.primary,
    idleColor: Color = MaterialTheme.colorScheme.outlineVariant,
) {
    Box(modifier.fillMaxWidth().heightIn(min = WaveformTouchHeight), contentAlignment = Alignment.Center) {
        WaveformBars(peaks, progress, playedColor, idleColor)
    }
}

/** O desenho das barras em si, com [WaveformDrawingHeight] de altura. */
@Composable
private fun WaveformBars(
    peaks: List<Float>,
    progress: Float,
    playedColor: Color,
    idleColor: Color,
) {
    // As alturas só mudam com os picos: remember as guarda entre as recomposições, e o desenho de cada
    // quadro só conta as barras tocadas.
    val heights = remember(peaks) { waveformHeights(peaks) }
    Canvas(Modifier.fillMaxWidth().height(WaveformDrawingHeight)) {
        val playedCount = playedBarCount(progress, heights.size)
        val gap = 2.dp.toPx()
        val barWidth = ((size.width - gap * (heights.size - 1)) / heights.size).coerceAtLeast(1f)
        val radius = CornerRadius(barWidth / 2)
        heights.forEachIndexed { index, height ->
            val barHeight = size.height * height
            drawRoundRect(
                color = if (index < playedCount) playedColor else idleColor,
                topLeft = Offset(index * (barWidth + gap), (size.height - barHeight) / 2),
                size = Size(barWidth, barHeight),
                cornerRadius = radius,
            )
        }
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :feature:detail:presentation:testAndroidHostTest --tests '*WaveformTest*'`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:detail:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m 'fix: alturas da forma de onda guardadas enquanto os picos não mudam'
```

### Task 16: Ledger do E3: o título do Explorar a 18 dp da busca, com a contagem colada nele

O `PiuScreenTitle` põe 8 dp embaixo por dentro, e o `padding(bottom = 0.dp)` não os tirava: a contagem ficava solta do título (8 dp), e o título ficava a 20 dp da busca. Como nas Configurações do E3, o título passa a ser um `Text` no estilo do `PiuScreenTitle`, sem esse espaço, com a contagem colada embaixo, e o cabeçalho termina a 18 dp da busca (6 dp dele mais os 12 dp entre os itens da grade).

**Files:**
- Test: `feature/explore/presentation/src/androidHostTest/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreScrollTest.kt`
- Modify: `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreScreen.kt`
- Record: 36 imagens em `snapshots/src/test/snapshots/images/` (0 novas, 36 regravadas)

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `feature/explore/presentation/src/androidHostTest/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreScrollTest.kt`:

```kotlin
// Testes de interface do Explorar no host (Robolectric): o título e a busca
// fazem parte da grade e sobem junto com ela ao rolar, continuam na tela em
// todas as fases (carregando, vazio, erro) e o campo de busca não perde o
// foco quando a fase muda enquanto a pessoa digita.

package com.velosobr.passarim.feature.explore.presentation

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.hasScrollToIndexAction
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isHeading
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import assertk.assertThat
import assertk.assertions.isEqualTo
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.domain.BiomeFilter
import com.velosobr.passarim.core.domain.Filters
import com.velosobr.passarim.core.domain.SpeciesSummary
import com.velosobr.passarim.core.presentation.ScreenError
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class ExploreScrollTest {
    /** Trinta aves: bastante para a grade rolar várias telas. */
    private val birds =
        List(30) { SpeciesSummary("ave-$it", "Ave $it", "Avis numerus $it", null, Biome.CERRADO) }

    /**
     * A grade é o único nó que rola na vertical e aceita "rolar até o item N" (a linha de chips
     * também aceita, mas rola na horizontal). VerticalScrollAxisRange é a propriedade de
     * semântica que diz até onde algo rola na vertical.
     */
    private val grid = hasScrollToIndexAction() and SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange)

    @Test
    fun `ao rolar a grade o titulo e a busca saem da tela`() =
        runComposeUiTest {
            setContent {
                PiuTheme { ExploreScreen(ExploreState(items = birds, phase = ExplorePhase.Content), onAction = {}) }
            }
            onNodeWithText("Explorar").assertIsDisplayed()
            onNode(grid).performScrollToIndex(25)
            // A grade preguiçosa descarta os itens que saem da tela: o título e a busca somem da árvore.
            onNodeWithText("Explorar").assertDoesNotExist()
            onNode(hasSetTextAction()).assertDoesNotExist()
        }

    @Test
    fun `carregando vazio e erro continuam mostrando o titulo e a busca`() =
        runComposeUiTest {
            var phase: ExplorePhase by mutableStateOf(ExplorePhase.Loading)
            setContent { PiuTheme { ExploreScreen(ExploreState(phase = phase), onAction = {}) } }
            listOf(ExplorePhase.Loading, ExplorePhase.Empty, ExplorePhase.Error(ScreenError.Generic)).forEach {
                phase = it
                waitForIdle()
                onNodeWithText("Explorar").assertIsDisplayed()
                onNode(hasText("Buscar aves")).assertIsDisplayed()
            }
        }

    /**
     * Digitar muda a fase (a busca recomeça: carregando, depois vazio ou com aves). Se o campo
     * saísse da composição nessa troca, o teclado fecharia no meio da palavra.
     */
    @Test
    fun `a busca continua com o foco quando a fase muda ao digitar`() =
        runComposeUiTest {
            setContent {
                var state by remember { mutableStateOf(ExploreState(items = birds, phase = ExplorePhase.Content)) }
                PiuTheme {
                    ExploreScreen(
                        state = state,
                        onAction = { action ->
                            if (action is ExploreAction.QueryChange) {
                                state = state.copy(query = action.text, items = emptyList(), phase = ExplorePhase.Loading)
                            }
                        },
                    )
                }
            }
            onNode(hasSetTextAction()).performClick()
            onNode(hasSetTextAction()).performTextInput("ara")
            onNode(hasSetTextAction()).assertIsFocused()
            onNode(hasText("ara")).assertIsDisplayed()
        }

    /** Prancheta: 18 dp entre o título da tela e a primeira seção (a busca), sem a contagem. */
    @Test
    fun `o titulo fica a 18 dp da busca`() =
        runComposeUiTest {
            setContent { PiuTheme { ExploreScreen(ExploreState(items = birds, phase = ExplorePhase.Content), onAction = {}) } }
            val title = onNode(hasText("Explorar") and isHeading()).getBoundsInRoot()
            val search = onNode(hasSetTextAction()).getBoundsInRoot()
            assertThat(search.top - title.bottom).isEqualTo(18.dp)
        }

    /** Filtros com a contagem por bioma principal: 41 aves no catálogo. */
    private val filtersWith41Birds =
        Filters(biomes = emptyList(), states = emptyList(), primaryBiomes = listOf(BiomeFilter("cerrado", "Cerrado", 41)))

    /** Com a contagem de aves embaixo do título, ela fica colada nele, e a busca a 18 dp dela. */
    @Test
    fun `com a contagem a busca fica a 18 dp dela e a contagem colada no titulo`() =
        runComposeUiTest {
            setContent {
                PiuTheme {
                    ExploreScreen(
                        ExploreState(items = birds, phase = ExplorePhase.Content, filters = FiltersPhase.Loaded(filtersWith41Birds)),
                        onAction = {},
                    )
                }
            }
            val title = onNode(hasText("Explorar") and isHeading()).getBoundsInRoot()
            val count = onNodeWithText("41 aves").getBoundsInRoot()
            val search = onNode(hasSetTextAction()).getBoundsInRoot()
            assertThat(count.top - title.bottom).isEqualTo(0.dp)
            assertThat(search.top - count.bottom).isEqualTo(18.dp)
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:explore:presentation:testAndroidHostTest --tests '*ExploreScrollTest*'`

Expected: FAIL em `ExploreScrollTest > o titulo fica a 18 dp da busca` (são 20 dp) e em `com a contagem a busca fica a 18 dp dela e a contagem colada no titulo` (a contagem está a 8 dp do título).

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreScreen.kt`:

```kotlin
// A tela Explorar (frente E): título com o total de aves, busca, chips de
// bioma, a "Ave do dia" e o mosaico de espécies, mais os estados de
// carregando, vazio e erro, tudo numa grade só que rola inteira. Os
// componentes visuais vêm do PiuDS; os itens do mosaico, de ExploreMosaic.kt.

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
import androidx.compose.foundation.lazy.staggeredgrid.LazyStaggeredGridScope
import androidx.compose.foundation.lazy.staggeredgrid.LazyStaggeredGridState
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan
import androidx.compose.foundation.lazy.staggeredgrid.rememberLazyStaggeredGridState
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
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
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
import com.velosobr.piuds.components.PiuSearchField
import com.velosobr.piuds.components.PiuStateScreen
import com.velosobr.piuds.components.StateTone
import com.velosobr.piuds.components.adult.PiuBiomeChip
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
 * A tela inteira é uma grade só (LazyVerticalStaggeredGrid): o título, a busca e os chips são os
 * primeiros itens dela, em largura cheia, e sobem junto com o mosaico ao rolar, em vez de ficarem
 * presos no topo. Abaixo deles, cada fase põe os próprios itens: o esqueleto, o mosaico ou o
 * estado de vazio ou de erro.
 *
 * A grade é a mesma em todas as fases, e cada item do topo tem uma chave fixa ("title",
 * "search", "chips"): digitar muda a fase (a busca recomeça), mas o campo continua o mesmo item
 * da mesma grade, e por isso não perde o foco nem fecha o teclado. Se cada fase tivesse a sua
 * grade, o campo seria criado de novo a cada letra.
 *
 * [contentPadding] é o espaço que a barra flutuante ocupa embaixo: a grade rola por baixo dela
 * (o desfoque precisa do conteúdo atrás) e termina acima dela.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExploreScreen(
    state: ExploreState,
    onAction: (ExploreAction) -> Unit,
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(),
    gridState: LazyStaggeredGridState = rememberLazyStaggeredGridState(),
) {
    val columns = exploreGridColumns(LocalDensity.current.fontScale)
    LoadMoreEffect(gridState, onAction)
    LazyVerticalStaggeredGrid(
        columns = StaggeredGridCells.Fixed(columns),
        state = gridState,
        modifier = modifier.fillMaxSize(),
        contentPadding = contentPadding.plusMargins(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalItemSpacing = 12.dp,
    ) {
        item(key = "title", span = StaggeredGridItemSpan.FullLine, contentType = "title") {
            Header(state, Modifier.fullBleed())
        }
        item(key = "search", span = StaggeredGridItemSpan.FullLine, contentType = "search") {
            PiuSearchField(
                value = state.query,
                onValueChange = { onAction(ExploreAction.QueryChange(it)) },
                placeholder = stringResource(Res.string.search_placeholder),
                modifier = Modifier.fullBleed().fillMaxWidth().padding(horizontal = 16.dp),
            )
        }
        item(key = "chips", span = StaggeredGridItemSpan.FullLine, contentType = "chips") {
            BiomeChips(state, onAction, Modifier.fullBleed())
        }
        when (val phase = state.phase) {
            ExplorePhase.Loading -> skeletonItems()
            ExplorePhase.Content -> mosaicItems(state, onAction)
            ExplorePhase.Empty -> stateItem { EmptyState(state, onAction) }
            is ExplorePhase.Error -> stateItem { ErrorState(phase.error, state.retryEnabled, onAction) }
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

/** O espaço a mais embaixo do cabeçalho: somado aos 12 dp entre os itens da grade, dá os 18 dp da prancheta até a busca. */
private val HeaderBottomSpace = 6.dp

/**
 * O título da tela e, quando os filtros já chegaram, o total de aves do catálogo, colado embaixo
 * dele. O título tem o estilo do PiuScreenTitle, mas sem os 8 dp que ele põe embaixo por dentro: o
 * espaço até a busca é só o [HeaderBottomSpace] mais o espaço entre os itens da grade.
 */
@Composable
private fun Header(
    state: ExploreState,
    modifier: Modifier,
) {
    Column(modifier.padding(bottom = HeaderBottomSpace)) {
        Text(
            stringResource(Res.string.explore_title),
            style = MaterialTheme.typography.headlineLarge,
            color = MaterialTheme.colorScheme.onSurface,
            // heading(): o leitor de tela anuncia o título como cabeçalho e deixa pular até ele.
            modifier = Modifier.padding(start = PiuDimens.screenMargin, top = 24.dp, end = PiuDimens.screenMargin).semantics { heading() },
        )
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
    modifier: Modifier,
) {
    val biomes = (state.filters as? FiltersPhase.Loaded)?.filters?.biomes.orEmpty()
    LazyRow(
        modifier = modifier,
        contentPadding = PaddingValues(horizontal = 16.dp),
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
 * O vazio ou o erro, como um item de largura cheia logo abaixo dos chips. É um item da grade, e
 * não uma tela à parte, para o título e a busca continuarem em cima dele.
 */
private fun LazyStaggeredGridScope.stateItem(content: @Composable () -> Unit) {
    item(key = "state", span = StaggeredGridItemSpan.FullLine, contentType = "state") {
        Box(Modifier.fillMaxWidth().padding(vertical = 48.dp), contentAlignment = Alignment.Center) { content() }
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :feature:explore:presentation:testAndroidHostTest --tests '*ExploreScrollTest*'`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Snapshots**

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*ExploreSnapshotTest*'`

Expected: 0 imagens novas e 36 regravadas em `snapshots/src/test/snapshots/images/`. Abra cada uma e confira a 1.0×, 1.3× e 2.0×, no claro e no escuro: a contagem colada no título e a busca um pouco mais perto; o resto igual.

- [ ] **Step 6: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:explore:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m 'fix: título do Explorar a 18 dp da busca, com a contagem colada nele'
```

### Task 17: Revisão minor 4: tirar os `run { }` sem função das telas de vazio e de erro do Explorar

Os blocos `run { }` em volta do `PiuStateScreen` sobraram de uma versão anterior e não faziam nada (o `padding(bottom = 0.dp)`, o outro resto do minor 4, saiu na Task 16).

**Files:**
- Modify: `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreScreen.kt`

- [ ] **Step 1: Sem teste novo**

Refatoração sem mudança de comportamento: não há teste que falhe antes. A prova é a suíte e os snapshots do Explorar continuarem iguais (Steps seguintes).

- [ ] **Step 2: Implementar**

Substitua o conteúdo de `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreScreen.kt`:

```kotlin
// A tela Explorar (frente E): título com o total de aves, busca, chips de
// bioma, a "Ave do dia" e o mosaico de espécies, mais os estados de
// carregando, vazio e erro, tudo numa grade só que rola inteira. Os
// componentes visuais vêm do PiuDS; os itens do mosaico, de ExploreMosaic.kt.

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
import androidx.compose.foundation.lazy.staggeredgrid.LazyStaggeredGridScope
import androidx.compose.foundation.lazy.staggeredgrid.LazyStaggeredGridState
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan
import androidx.compose.foundation.lazy.staggeredgrid.rememberLazyStaggeredGridState
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
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
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
import com.velosobr.piuds.components.PiuSearchField
import com.velosobr.piuds.components.PiuStateScreen
import com.velosobr.piuds.components.StateTone
import com.velosobr.piuds.components.adult.PiuBiomeChip
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
 * A tela inteira é uma grade só (LazyVerticalStaggeredGrid): o título, a busca e os chips são os
 * primeiros itens dela, em largura cheia, e sobem junto com o mosaico ao rolar, em vez de ficarem
 * presos no topo. Abaixo deles, cada fase põe os próprios itens: o esqueleto, o mosaico ou o
 * estado de vazio ou de erro.
 *
 * A grade é a mesma em todas as fases, e cada item do topo tem uma chave fixa ("title",
 * "search", "chips"): digitar muda a fase (a busca recomeça), mas o campo continua o mesmo item
 * da mesma grade, e por isso não perde o foco nem fecha o teclado. Se cada fase tivesse a sua
 * grade, o campo seria criado de novo a cada letra.
 *
 * [contentPadding] é o espaço que a barra flutuante ocupa embaixo: a grade rola por baixo dela
 * (o desfoque precisa do conteúdo atrás) e termina acima dela.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExploreScreen(
    state: ExploreState,
    onAction: (ExploreAction) -> Unit,
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(),
    gridState: LazyStaggeredGridState = rememberLazyStaggeredGridState(),
) {
    val columns = exploreGridColumns(LocalDensity.current.fontScale)
    LoadMoreEffect(gridState, onAction)
    LazyVerticalStaggeredGrid(
        columns = StaggeredGridCells.Fixed(columns),
        state = gridState,
        modifier = modifier.fillMaxSize(),
        contentPadding = contentPadding.plusMargins(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalItemSpacing = 12.dp,
    ) {
        item(key = "title", span = StaggeredGridItemSpan.FullLine, contentType = "title") {
            Header(state, Modifier.fullBleed())
        }
        item(key = "search", span = StaggeredGridItemSpan.FullLine, contentType = "search") {
            PiuSearchField(
                value = state.query,
                onValueChange = { onAction(ExploreAction.QueryChange(it)) },
                placeholder = stringResource(Res.string.search_placeholder),
                modifier = Modifier.fullBleed().fillMaxWidth().padding(horizontal = 16.dp),
            )
        }
        item(key = "chips", span = StaggeredGridItemSpan.FullLine, contentType = "chips") {
            BiomeChips(state, onAction, Modifier.fullBleed())
        }
        when (val phase = state.phase) {
            ExplorePhase.Loading -> skeletonItems()
            ExplorePhase.Content -> mosaicItems(state, onAction)
            ExplorePhase.Empty -> stateItem { EmptyState(state, onAction) }
            is ExplorePhase.Error -> stateItem { ErrorState(phase.error, state.retryEnabled, onAction) }
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

/** O espaço a mais embaixo do cabeçalho: somado aos 12 dp entre os itens da grade, dá os 18 dp da prancheta até a busca. */
private val HeaderBottomSpace = 6.dp

/**
 * O título da tela e, quando os filtros já chegaram, o total de aves do catálogo, colado embaixo
 * dele. O título tem o estilo do PiuScreenTitle, mas sem os 8 dp que ele põe embaixo por dentro: o
 * espaço até a busca é só o [HeaderBottomSpace] mais o espaço entre os itens da grade.
 */
@Composable
private fun Header(
    state: ExploreState,
    modifier: Modifier,
) {
    Column(modifier.padding(bottom = HeaderBottomSpace)) {
        Text(
            stringResource(Res.string.explore_title),
            style = MaterialTheme.typography.headlineLarge,
            color = MaterialTheme.colorScheme.onSurface,
            // heading(): o leitor de tela anuncia o título como cabeçalho e deixa pular até ele.
            modifier = Modifier.padding(start = PiuDimens.screenMargin, top = 24.dp, end = PiuDimens.screenMargin).semantics { heading() },
        )
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
    modifier: Modifier,
) {
    val biomes = (state.filters as? FiltersPhase.Loaded)?.filters?.biomes.orEmpty()
    LazyRow(
        modifier = modifier,
        contentPadding = PaddingValues(horizontal = 16.dp),
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

/** Nenhuma ave encontrada: o texto cita a busca (se houver) e oferece limpar os filtros. */
@Composable
private fun EmptyState(
    state: ExploreState,
    onAction: (ExploreAction) -> Unit,
) {
    val query = state.query.trim()
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

/**
 * O vazio ou o erro, como um item de largura cheia logo abaixo dos chips. É um item da grade, e
 * não uma tela à parte, para o título e a busca continuarem em cima dele.
 */
private fun LazyStaggeredGridScope.stateItem(content: @Composable () -> Unit) {
    item(key = "state", span = StaggeredGridItemSpan.FullLine, contentType = "state") {
        Box(Modifier.fillMaxWidth().padding(vertical = 48.dp), contentAlignment = Alignment.Center) { content() }
    }
}
```

- [ ] **Step 3: Rodar e ver passar**

Run: `./gradlew :feature:explore:presentation:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes de antes verdes.

- [ ] **Step 4: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:explore:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m 'fix: tira os run { } sem função das telas de vazio e de erro do Explorar'
```

### Task 18: Revisão minor 5: fora da camada de transição, a foto não ganha modificador

O teste "sem a camada de transição" media a largura do nó, e passaria com ou sem o `sharedBounds`, que mede o mesmo fora de uma transição. Ele passa a conferir que `piuSharedPhoto` devolve o próprio modificador recebido, sem nada a mais.

**Files:**
- Test: `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuSharedPhotoTest.kt`

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `core/piu-ds/src/androidHostTest/kotlin/com/velosobr/piuds/PiuSharedPhotoTest.kt`:

```kotlin
// Testes da foto que viaja entre duas telas (frente E, seção 6): com a camada
// de transição e o escopo de animação, a foto do card cresce aos poucos até o
// tamanho do topo do Detalhe; com "reduzir animações" ou sem a camada, ela
// não viaja.

package com.velosobr.piuds

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.piuds.components.PiuSharedScope
import com.velosobr.piuds.components.PiuSharedTransitionLayout
import com.velosobr.piuds.components.adult.PiuFeaturedCard
import com.velosobr.piuds.components.piuSharedPhoto
import com.velosobr.piuds.theme.LocalPiuReduceMotion
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w411dp-h891dp")
class PiuSharedPhotoTest {
    /** Abre o "Detalhe" no meio do teste. */
    private var detail by mutableStateOf(false)

    /**
     * Duas telas trocadas por AnimatedContent (o mesmo que o NavHost usa por dentro): um card de
     * 100 dp e um topo de 430 dp de altura, os dois com a foto da chave "foto-1". AnimatedContent
     * dá a cada tela um escopo de animação, que o PiuSharedScope entrega à foto. A troca é só um
     * esmaecer, sem animar o tamanho (SizeTransform nulo) e numa área do tamanho da tela: assim,
     * só a foto compartilhada muda de tamanho no meio da troca.
     */
    @Composable
    private fun TwoScreens(card: @Composable (onOpen: () -> Unit) -> Unit) {
        PiuSharedTransitionLayout {
            AnimatedContent(
                targetState = detail,
                modifier = Modifier.fillMaxSize(),
                transitionSpec = { (fadeIn() togetherWith fadeOut()).using(null) },
            ) { showDetail ->
                PiuSharedScope(this) {
                    if (showDetail) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .height(430.dp)
                                .piuSharedPhoto("foto-1")
                                .background(Color.Blue)
                                .testTag("hero"),
                        )
                    } else {
                        card { detail = true }
                    }
                }
            }
        }
    }

    /** O card mais simples: um quadrado vermelho de 100 dp, 300 dp abaixo do topo, com a foto "foto-1". */
    @Composable
    private fun PlainCard(onOpen: () -> Unit) {
        Box(
            Modifier
                .offset(40.dp, 300.dp)
                .size(100.dp)
                .piuSharedPhoto("foto-1")
                .background(Color.Red)
                .testTag("card")
                .clickable(onClick = onOpen),
        )
    }

    /**
     * Onde o topo do Detalhe começa (a borda de cima, em pixels), quadro a quadro, depois de tocar
     * no card. O card começa 300 dp abaixo do topo da tela; o topo do Detalhe, no 0.
     */
    private fun heroTopsAfterOpening(
        reduceMotion: Boolean = false,
        card: @Composable (onOpen: () -> Unit) -> Unit = { PlainCard(it) },
    ): List<Float> {
        val tops = mutableListOf<Float>()
        runComposeUiTest {
            mainClock.autoAdvance = false
            setContent {
                CompositionLocalProvider(LocalPiuReduceMotion provides reduceMotion) { PiuTheme { TwoScreens(card) } }
            }
            mainClock.advanceTimeBy(1_000)
            onNodeWithTag("card").performClick()
            repeat(40) {
                mainClock.advanceTimeByFrame()
                onAllNodes(hasTestTag("hero")).fetchSemanticsNodes().forEach { tops += it.boundsInRoot.top }
            }
        }
        return tops
    }

    @Test
    fun `a foto sai do card e sobe aos poucos ate o topo do detalhe`() {
        // Em algum quadro, a foto está no meio do caminho entre o card e o topo: ela viajou.
        // No Robolectric a densidade padrão é 1, então pixels e dp coincidem.
        assertThat(heroTopsAfterOpening(reduceMotion = false).any { it > 20 && it < 280 }).isTrue()
    }

    /**
     * A "Ave do dia" também participa: o card dela, com a [sharedPhotoKey], é a outra ponta da foto
     * do topo. O card fica 300 dp abaixo do topo da tela, como o quadrado dos outros testes.
     */
    @Test
    fun `a foto da ave do dia tambem viaja ate o topo do detalhe`() {
        val tops =
            heroTopsAfterOpening { onOpen ->
                PiuFeaturedCard(
                    badge = "AVE DO DIA",
                    name = "Tuiuiú",
                    scientificName = "Jabiru mycteria",
                    imageUrl = null,
                    biome = Biome.PANTANAL,
                    onClick = onOpen,
                    modifier = Modifier.offset(0.dp, 300.dp).testTag("card"),
                    sharedPhotoKey = "foto-1",
                )
            }
        assertThat(tops.any { it > 20 && it < 280 }).isTrue()
    }

    @Test
    fun `com reduzir animacoes a foto nao viaja`() {
        assertThat(heroTopsAfterOpening(reduceMotion = true).any { it > 20 && it < 280 }).isFalse()
    }

    /**
     * Fora da camada de transição (prévias e snapshots), piuSharedPhoto devolve o próprio
     * modificador que recebeu, sem nada a mais: a foto é desenhada como se ele não existisse. Medir
     * o tamanho não bastaria, porque um sharedBounds sem transição também mede o mesmo.
     */
    @Test
    fun `sem a camada de transicao o modificador nao acrescenta nada`() =
        runComposeUiTest {
            var marked: Modifier? = null
            setContent { PiuTheme { marked = Modifier.piuSharedPhoto("foto-1") } }
            assertThat(marked).isEqualTo(Modifier)
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest --tests '*PiuSharedPhotoTest*'`

Expected: é um teste de guarda: com o código de hoje, passa. O RED foi provado com uma mutação temporária no `PiuSharedPhoto.kt` (fora da camada, devolver `this.then(Modifier.graphicsLayer())`): `PiuSharedPhotoTest > sem a camada de transicao o modificador nao acrescenta nada` FAILED, enquanto o teste antigo (a largura de 100) passaria. Desfeita a mutação, ele passa.

- [ ] **Step 3: Rodar e ver passar**

Run: `./gradlew :core:piu-ds:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 4: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:piu-ds:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m 'fix: teste de que, fora da camada de transição, a foto não ganha modificador'
```

### Task 19: Revisão minor 8: o KDoc do `PiuSharedScope` diz que o escopo das abas desce para todas elas

O escopo da rota das abas vale para as três abas, e não só para a que abriu o Detalhe: uma foto com a mesma chave em outra aba também viajaria. O KDoc passa a dizer isso, e que cada chave deve existir numa aba só.

**Files:**
- Modify: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuSharedPhoto.kt`

- [ ] **Step 1: Sem teste novo**

Só documentação (uma linha no KDoc): não muda código nem teste.

- [ ] **Step 2: Implementar**

Substitua o conteúdo de `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuSharedPhoto.kt`:

```kotlin
// A foto que viaja de uma tela para outra (frente E, seção 6): ao abrir o
// Detalhe, a foto do card do mosaico cresce até o topo do Detalhe, e volta ao
// card no "voltar". É um "elemento compartilhado" do Compose: duas peças, uma
// em cada tela, com a mesma chave; durante a troca de tela, o Compose anima
// os limites de uma até a outra.
//
// O app liga as peças: PiuSharedTransitionLayout em volta da navegação e
// PiuSharedScope em cada tela; os componentes só marcam a foto com
// piuSharedPhoto e uma chave. Com "reduzir animações" ligado, ou fora dessa
// estrutura (prévias e snapshots), nada viaja e a troca de tela é a comum.
// Os dois CompositionLocals e as três funções ficam juntos neste arquivo, por
// isso o detekt não cobra um arquivo com o nome de cada declaração.
@file:Suppress("MatchingDeclarationName")
@file:OptIn(ExperimentalSharedTransitionApi::class)

package com.velosobr.piuds.components

import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.Shape
import com.velosobr.piuds.theme.PiuTheme

/**
 * A camada que desenha a foto enquanto ela viaja. compositionLocalOf é um valor que desce pela
 * árvore de composição sem passar de parâmetro em parâmetro: quem está dentro de
 * PiuSharedTransitionLayout o lê; fora dela, é nulo.
 */
private val LocalPiuSharedTransition = compositionLocalOf<SharedTransitionScope?> { null }

/**
 * O escopo de animação da tela atual (entrando ou saindo). É ele que diz ao Compose em que ponto
 * da troca de tela a foto está.
 */
private val LocalPiuSharedVisibility = compositionLocalOf<AnimatedVisibilityScope?> { null }

/**
 * Envolve a navegação (o NavHost da raiz) para as fotos poderem viajar entre as telas dela.
 * SharedTransitionLayout é a camada do Compose que acompanha os elementos compartilhados e os
 * desenha por cima de tudo durante a troca.
 */
@Composable
fun PiuSharedTransitionLayout(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    SharedTransitionLayout(modifier) {
        CompositionLocalProvider(LocalPiuSharedTransition provides this) { content() }
    }
}

/**
 * Entrega às fotos de uma tela o [scope] de animação dela: no NavHost, o `this` de cada
 * `composable<Rota> { }`. As telas de dentro de outro NavHost (as abas) herdam o escopo da tela
 * da raiz que as contém, e é isso que deixa a foto atravessar dos dois NavHosts. O escopo desce
 * para todas as abas, e não só para a que abriu o Detalhe: uma foto marcada em qualquer aba com a
 * mesma chave também viajaria, então cada chave deve existir numa aba só.
 */
@Composable
fun PiuSharedScope(
    scope: AnimatedVisibilityScope,
    content: @Composable () -> Unit,
) {
    CompositionLocalProvider(LocalPiuSharedVisibility provides scope) { content() }
}

/**
 * Marca a foto com a [key] que a liga à foto da outra tela ("foto-<id>" ou "foto-destaque-<id>"). Sem chave, sem a camada,
 * sem escopo ou com "reduzir animações", devolve o próprio modificador, sem nada a mais.
 *
 * Usa sharedBounds, e não sharedElement: o card mostra a miniatura e o Detalhe a foto grande
 * (que ainda está baixando). sharedBounds faz a ponte entre conteúdos diferentes: os limites
 * viajam enquanto um lado some e o outro aparece. [shape] recorta a foto durante a viagem (os
 * cantos arredondados do card).
 */
@Composable
fun Modifier.piuSharedPhoto(
    key: String?,
    shape: Shape = RectangleShape,
): Modifier {
    val transition = LocalPiuSharedTransition.current
    val visibility = LocalPiuSharedVisibility.current
    val outsideTransition = transition == null || visibility == null
    if (key == null || outsideTransition || PiuTheme.reduceMotion) return this
    return with(transition) {
        this@piuSharedPhoto.sharedBounds(
            sharedContentState = rememberSharedContentState(key),
            animatedVisibilityScope = visibility,
            clipInOverlayDuringTransition = OverlayClip(shape),
        )
    }
}
```

- [ ] **Step 3: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:piu-ds:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m 'fix: KDoc do PiuSharedScope diz que o escopo das abas desce para todas elas'
```

## Ledger: achados Minor da revisão final

Corrigidos nas Tasks 14 a 19: minor 1 (reamostragem pelo maior pico do trecho), 2 (alturas guardadas com `remember`), 4 (restos sem função no `ExploreScreen.kt`), 5 (teste "sem a camada" que passaria sem o modificador), 8 (KDoc do `PiuSharedScope`) e o vão do título do Explorar (do ledger do E3). Registrados no app #40 para depois, sem tarefa neste plano:

1. **Minor 3. Os tempos não acompanham o arrasto:** durante o arrasto, a forma de onda segue o dedo, mas o "0:12" continua mostrando a posição do player.
2. **Minor 6. Ordem das seções:** a ordem das seções do Detalhe difere da prancheta.
3. **Minor 7. Círculo de vidro no claro:** sobre uma foto branca, o círculo dos botões (superfície clara a 60%) quase some.
4. **Minor 9a. Palavra quebrada a 2.0×:** "Arara-azul-grande" quebra no meio da palavra no topo do Detalhe (palavra única maior que a tela; já acontecia no título antigo).
5. **Minor 9b. `PiuHeroIconButton` sem uso** no app; remover numa limpeza do PiuDS.
6. **Minor 9c. Favoritos sem `primaryBiome` no Room:** o resumo já leva o bioma; guardar pede migração do banco (versão 2).

## Fechamento

### Task 20: Verificação final, aparelho e PR

- [ ] **Step 1: Check como o CI**

Run: `./gradlew ktlintCheck detekt allTests :snapshots:verifyPaparazziDebug :androidApp:assembleDebug`

Expected: `BUILD SUCCESSFUL` (com o Xcode 16.2, as mesmas duas falhas de link iOS da Task 0).

- [ ] **Step 2: Navegação só liga**

Run: `git diff feat/e1-explorar -- '*Navigator*.kt' '*NavHost*.kt' '*Graph*.kt' 'app/**/App*.kt' '*TabsScreen*.kt' | grep -E '^\+.*(LaunchedEffect|DisposableEffect|\.collect *[{(])'`

Expected: nenhuma linha.

- [ ] **Step 3: Aparelho**

Run: `ANDROID_SERIAL=4T9DSCR4IZDAGEI7 ./gradlew :androidApp:installDebug`

Expected: o Explorar rolando inteiro; ao tocar num card do mosaico ou na "Ave do dia", a foto cresce até o topo do Detalhe e volta ao card no "voltar"; o player com a forma de onda (tocar, arrastar e soltar pula a posição); com "remover animações" ligado no sistema, a troca de tela é a comum. Sem o aparelho, registre "instalação no aparelho pendente" no PR.

- [ ] **Step 4: Push e PR, sem merge**

```bash
git push -u origin feat/e2-detalhe
gh pr create --base feat/e1-explorar --head feat/e2-detalhe --title 'feat: E2, o Detalhe novo e o Explorar rolando inteiro (frente E)'
```

A descrição lista os snapshots regravados, os achados da revisão (corrigidos e Minor) e aponta para a spec (docs #29) e para o PR deste plano.
