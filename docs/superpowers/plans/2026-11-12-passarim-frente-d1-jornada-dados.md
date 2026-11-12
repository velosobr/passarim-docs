# Frente D1 — Jornada nas preferências e checagem do Kids (domínio e dados): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Este plano cobre só o PR 2 da frente D (domínio e dados).** Ele será complementado pelo plano do PR 3 (apresentação: `feature:journey:presentation` com a Escolha, a trava e o `numberInWords`, a casca Kids, a raiz por jornada, o tema e as barras, a seção "Para crianças" das Configurações e o botão "Para adultos" na `PiuKidsNavBar`), escrito depois, a partir dos commits daquele PR.

**Goal:** Entregar a base de dados da frente D: o app passa a gravar a jornada (adulto ou Kids) nas preferências e sabe perguntar ao BFF se o Passarim Kids está disponível. Nada de tela aqui.

**Architecture:**
- **Um PR no `passarim-app` (`feat/d-jornada-dados`, sobre `feat/e1-explorar`, o app #36)**, de baixo para cima: a jornada no `Settings` e no `DataStoreSettingsRepository` (Task 1), a `KidsAvailabilityRepository` no `core:domain` com a implementação no `feature:explore:data` (Task 2) e o registro no Koin (Task 3). Depois da revisão final, as Tasks 4 a 7 corrigem quatro achados Minor em commits `fix:`. A base é o E1 porque ele já pôs o `primaryBiomes` no `FiltersDto`; quando o #36 entrar na `main`, o PR passa a apontar para ela.
- **Este plano** vai num PR do `passarim-docs` (`docs/plano-frente-d1`). Foi gerado dos commits do app #38 e provado por replay: aplicado tarefa por tarefa numa worktree limpa, reproduz a árvore de cada commit.
- A apresentação (Escolha, trava, casca Kids, raiz, Configurações) é o PR 3, com plano próprio.

**Tech Stack:** Kotlin 2.4.21, Koin 4.2.2, Ktor 3.6.1 (`MockEngine` nos testes), kotlinx-serialization, DataStore Preferences (KMP, arquivo temporário nos testes), assertk.

**Spec:** `passarim-docs/docs/superpowers/specs/2026-11-07-passarim-frente-d-jornada-design.md` (docs #28), seções 2 (dados), 7 (testes, "Dados") e 8 (ordem de entrega). Contrato real conferido com `curl 'http://127.0.0.1:8090/v1/filters?audience=kids'`: `biomes`, `states` e `primaryBiomes` (contagens Kids somando 41 no catalog local); um `audience` inválido responde 400 `INVALID_PARAMETER`.

## Global Constraints

- **Comentários didáticos em português** em todo código novo ou alterado (regra do `~/dev/passarim/CLAUDE.md`): todo arquivo começa dizendo o seu papel; conceitos aparecem explicados na primeira vez no arquivo (tipo anulável `Journey?`, `MockEngine`, `koinApplication`); mudou o código, atualiza o comentário.
- **Idioma:** identificadores em inglês; comentários, KDoc, commits e PRs em português do Brasil. Nomes de teste em português entre crases, **sem acento e sem vírgula** (o Kotlin/Native não aceita vírgula no nome).
- **Identidade do Git:** `velosobr <linoc.veloso@gmail.com>`. Commits terminam com as linhas de atribuição da sessão.
- **JDK 21** (`export JAVA_HOME=$(/usr/libexec/java_home -v 21)`).
- **Camadas:** modelo de domínio sem `@Serializable`. O `FiltersDto` continua no `feature:explore:data`; a `KidsAvailabilityRepository` devolve só um `Boolean`.
- **Nomes de método com substantivo:** `setJourney`, `checkKidsAvailability`.
- **Compatível com o BFF antigo:** sem `primaryBiomes`, o Kids fica escondido (`false`), nunca erro.
- **O DataStore é a única fonte da jornada:** nada de cópia em memória.
- **Sem merge e sem push na `main`:** os merges são do dono.

## Review Focus

1. **Trocar de jornada não mexe no adulto:** gravar a jornada mantém tema, cores dinâmicas e reprodução automática. Teste `grava a jornada sem mexer nas outras opcoes` (Task 1).
2. **Valor desconhecido no arquivo:** uma jornada que o app não conhece vira `null` (a Escolha aparece de novo), sem quebrar a leitura das outras chaves. Teste `jornada desconhecida no arquivo vira nula e as outras chaves continuam` (Task 1, reforçado na Task 5).
3. **BFF antigo e catálogo sem Kids:** sem `primaryBiomes` ou com soma zero, a resposta é `false`, não erro. Testes `indisponivel com um BFF sem primaryBiomes` e `indisponivel quando a soma e zero` (Task 2).
4. **Sem cache:** cada checagem vai ao BFF; o cache do `RemoteFiltersRepository` (filtros do adulto) não é tocado. Teste `cada checagem vai ao BFF sem cache` (Task 2).
5. **BFF que recusa o Kids:** um 400 `INVALID_PARAMETER` na checagem vira `false`, e não um erro com "Tentar de novo". Teste `audience recusado pelo BFF esconde o Kids` (Task 4).
6. **Preferências que não dão para ler:** um arquivo corrompido ou um `IOException` levam aos padrões de `Settings()` (jornada nula, Escolha de novo), sem derrubar a coleta da raiz. Testes `erro de leitura do arquivo usa os padroes` e `arquivo corrompido volta aos padroes e aceita gravar de novo` (Task 6).

## Decisões deste plano

Tomadas na montagem do PR, dentro do que a spec delega (as decisões da spec estão marcadas [R] nela):

1. **A implementação se chama `RemoteKidsAvailabilityRepository`**, no padrão `Remote*Repository` do `feature:explore:data`.
2. **O `audience=kids` vai como parâmetro do Ktor** (`parameter("audience", "kids")`), e o teste confere a URL completa `/v1/filters?audience=kids`.
3. **A regra é `primaryBiomes.sumOf { speciesCount } > 0` direto no DTO**, sem passar pelo `Filters` do domínio: a checagem só precisa do `Boolean`, e o `speciesTotal` do E1 tem outro sentido (o total do catálogo adulto).
4. **Não há `setJourney(null)`:** depois da primeira escolha, o app sempre abre numa jornada. Uma chave desconhecida no arquivo é o único caminho de volta à Escolha.
5. **O registro no Koin tem teste próprio (Task 3)**, com um `koinApplication` isolado, para o PR 3 não descobrir na hora de abrir a Escolha que a definição falta.
6. **Um 400 `INVALID_PARAMETER` esconde o Kids (Task 4):** o BFF respondeu que não conhece o pedido do Kids; tratar como falha mostraria um "Tentar de novo" que nunca resolve. Só esse erro vira `false`; sem rede, BFF fora do ar e resposta ilegível continuam falhas.
7. **Preferências resilientes (Task 6):** `ReplaceFileCorruptionHandler { emptyPreferences() }` na fábrica do DataStore e `catch` de `IOException` no `observe()`, ambos levando aos padrões. Outros erros seguem adiante, porque seriam bugs.

## Task 0: Preparação

- [ ] **Step 1: Branch**

```bash
cd passarim-app
git fetch origin
git checkout -b feat/d-jornada-dados origin/feat/e1-explorar
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
```

- [ ] **Step 2: Base verde**

Run: `./gradlew ktlintCheck detekt allTests :snapshots:verifyPaparazziDebug --continue`

Expected: `BUILD SUCCESSFUL`. Com o Xcode 16.2 (a máquina do dono), só `:app:linkDebugTestIosSimulatorArm64` e `:feature:detail:presentation:linkDebugTestIosSimulatorArm64` falham, com `ld: framework '_LocationEssentials' not found` (MapLibre); é um problema da máquina, já presente na base. O `--continue` roda o resto: confira que só essas duas falham. O CI decide o iOS.

- [ ] **Step 3: Back-end local e contrato**

Run: `../passarim-docs/env.scripts/status` e `curl -s 'http://127.0.0.1:8090/v1/filters?audience=kids'`

Expected: sai 0, e a resposta traz `primaryBiomes` com contagens. Os testes usam o `MockEngine` do Ktor e não dependem do back-end; o `curl` só confirma o contrato.

## Tasks
### Task 1: Jornada gravada nas preferências

`Settings` ganha `journey: Journey? = null` (nula é a primeira abertura, e o PR 3 mostra a Escolha) e o `SettingsRepository` ganha `setJourney`, no padrão do `setTheme` e do `setAutoPlay` (spec, seção 2.1). O `DataStoreSettingsRepository` grava a chave `journey` com o nome do enum; um nome desconhecido lido do arquivo vira `null`, e a Escolha aparece de novo. O `edit` do DataStore só toca na chave da jornada: tema, cores dinâmicas e reprodução automática ficam como estão (Pronto quando, item 4). Os dois `FakeSettingsRepository` (Configurações e Detalhe) ganham o `setJourney` para continuar compilando.

**Files:**
- Modify: `core/domain/src/commonMain/kotlin/com/velosobr/passarim/core/domain/Journey.kt`
- Modify: `core/domain/src/commonMain/kotlin/com/velosobr/passarim/core/domain/Settings.kt`
- Test: `feature/detail/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailFakes.kt`
- Modify: `feature/settings/data/src/commonMain/kotlin/com/velosobr/passarim/feature/settings/data/DataStoreSettingsRepository.kt`
- Test: `feature/settings/data/src/commonTest/kotlin/com/velosobr/passarim/feature/settings/data/DataStoreSettingsRepositoryTest.kt`
- Test: `feature/settings/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/settings/presentation/SettingsFakes.kt`

**Interfaces:**
- Produz: `Settings(theme, dynamicColors, autoPlay, journey: Journey? = null)` e `SettingsRepository.setJourney(journey: Journey)` em `core:domain`.
- Produz: a chave `journey` (`stringPreferencesKey`) no `DataStoreSettingsRepository`.
- Consome: `enum class Journey { ADULT, KIDS }` do C1.

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `feature/detail/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailFakes.kt`:

```kotlin
// Peças falsas e dados de exemplo dos testes do Detalhe.

package com.velosobr.passarim.feature.detail.presentation

import com.velosobr.passarim.core.domain.Credit
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.FavoritesRepository
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.passarim.core.domain.Result
import com.velosobr.passarim.core.domain.Settings
import com.velosobr.passarim.core.domain.SettingsRepository
import com.velosobr.passarim.core.domain.SpeciesSummary
import com.velosobr.passarim.core.domain.ThemeMode
import com.velosobr.passarim.feature.detail.domain.Audio
import com.velosobr.passarim.feature.detail.domain.AudioPlayer
import com.velosobr.passarim.feature.detail.domain.DetailRepository
import com.velosobr.passarim.feature.detail.domain.Photo
import com.velosobr.passarim.feature.detail.domain.PlaybackState
import com.velosobr.passarim.feature.detail.domain.SpeciesDetail
import com.velosobr.passarim.feature.detail.domain.WhereToFind
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.update

const val ARARA_ID = "anodorhynchus-hyacinthinus"
const val AUDIO_URL = "https://media/arara.aac"

/** credit é um crédito de exemplo, com link seguro. */
val credit = Credit("autor", "CC BY", "inaturalist", "https://www.inaturalist.org/observations/1")

/** arara é uma espécie de exemplo com todos os campos. */
val arara =
    SpeciesDetail(
        id = ARARA_ID,
        commonName = "Arara-azul-grande",
        scientificName = "Anodorhynchus hyacinthinus",
        family = "Psittacidae",
        conservation = null,
        sizeCm = 100,
        diet = null,
        description = "A maior arara do mundo.",
        descriptionCredit = credit,
        facts = emptyList(),
        biomes = emptyList(),
        photos = listOf(Photo("https://media/thumb.webp", null, null, credit)),
        audio = Audio(AUDIO_URL, 5_000, credit),
        whereToFind = WhereToFind(emptyList(), emptyList(), emptyList()),
    )

/** Repositório falso: devolve o resultado configurado e guarda os ids pedidos. */
class FakeDetailRepository(
    var next: Result<SpeciesDetail, DataError.Network> = Result.Success(arara),
) : DetailRepository {
    val calls = mutableListOf<String>()

    override suspend fun get(id: String): Result<SpeciesDetail, DataError.Network> {
        calls += id
        return next
    }
}

/** Favoritos falsos: os ids num StateFlow e as listas do que foi alternado e atualizado. */
class FakeFavoritesRepository : FavoritesRepository {
    val ids = MutableStateFlow<Set<String>>(emptySet())
    val toggled = mutableListOf<SpeciesSummary>()
    val refreshed = mutableListOf<SpeciesSummary>()

    override fun observeIds(): Flow<Set<String>> = ids

    override fun observeAll(): Flow<List<SpeciesSummary>> = flowOf(emptyList())

    override suspend fun toggle(summary: SpeciesSummary) {
        toggled += summary
        ids.value = if (summary.id in ids.value) ids.value - summary.id else ids.value + summary.id
    }

    override suspend fun refresh(summary: SpeciesSummary) {
        refreshed += summary
    }
}

/** Configurações falsas, com a reprodução automática escolhida pelo teste. */
class FakeSettingsRepository(
    autoPlay: Boolean = false,
) : SettingsRepository {
    private val settings = MutableStateFlow(Settings(autoPlay = autoPlay))

    override fun observe(): Flow<Settings> = settings

    override suspend fun setTheme(theme: ThemeMode) = settings.update { it.copy(theme = theme) }

    override suspend fun setDynamicColors(enabled: Boolean) = settings.update { it.copy(dynamicColors = enabled) }

    override suspend fun setAutoPlay(enabled: Boolean) = settings.update { it.copy(autoPlay = enabled) }

    override suspend fun setJourney(journey: Journey) = settings.update { it.copy(journey = journey) }
}

/** Player falso: anota cada chamada (play, pause, seek, release) e o estado é controlado pelo teste. */
class FakeAudioPlayer : AudioPlayer {
    override val state = MutableStateFlow<PlaybackState>(PlaybackState.Idle)
    val calls = mutableListOf<String>()

    override fun play(url: String) {
        calls += "play:$url"
    }

    override fun pause() {
        calls += "pause"
    }

    override fun seekTo(positionMs: Long) {
        calls += "seek:$positionMs"
    }

    override fun release() {
        calls += "release"
    }
}
```

Substitua o conteúdo de `feature/settings/data/src/commonTest/kotlin/com/velosobr/passarim/feature/settings/data/DataStoreSettingsRepositoryTest.kt`:

```kotlin
// Testes do repositório de preferências com um DataStore de verdade, num
// arquivo temporário apagado depois de cada teste.

package com.velosobr.passarim.feature.settings.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.passarim.core.domain.Settings
import com.velosobr.passarim.core.domain.ThemeMode
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import okio.FileSystem
import okio.Path
import kotlin.random.Random
import kotlin.test.AfterTest
import kotlin.test.Test

class DataStoreSettingsRepositoryTest {
    private val file: Path = FileSystem.SYSTEM_TEMPORARY_DIRECTORY / "settings-${Random.nextLong()}.preferences_pb"

    @AfterTest
    fun deleteFile() = FileSystem.SYSTEM.delete(file)

    /** dataStore cria o DataStore no arquivo temporário, preso ao escopo do teste. */
    private fun CoroutineScope.dataStore(): DataStore<Preferences> = PreferenceDataStoreFactory.createWithPath(scope = this) { file }

    @Test
    fun `sem arquivo usa os padroes`() =
        runTest {
            val repository = DataStoreSettingsRepository(backgroundScope.dataStore())

            assertThat(repository.observe().first()).isEqualTo(Settings(ThemeMode.SYSTEM, dynamicColors = false, autoPlay = false))
        }

    @Test
    fun `grava cada opcao`() =
        runTest {
            val repository = DataStoreSettingsRepository(backgroundScope.dataStore())

            repository.setTheme(ThemeMode.DARK)
            repository.setDynamicColors(true)
            repository.setAutoPlay(true)

            assertThat(repository.observe().first()).isEqualTo(Settings(ThemeMode.DARK, dynamicColors = true, autoPlay = true))
        }

    @Test
    fun `tema invalido no arquivo cai no padrao`() =
        runTest {
            val dataStore = backgroundScope.dataStore()
            dataStore.edit { it[stringPreferencesKey("theme")] = "PURPLE" }

            assertThat(DataStoreSettingsRepository(dataStore).observe().first().theme).isEqualTo(ThemeMode.SYSTEM)
        }

    @Test
    fun `sem arquivo a jornada e nula`() =
        runTest {
            val repository = DataStoreSettingsRepository(backgroundScope.dataStore())

            assertThat(repository.observe().first().journey).isNull()
        }

    @Test
    fun `grava a jornada sem mexer nas outras opcoes`() =
        runTest {
            val repository = DataStoreSettingsRepository(backgroundScope.dataStore())
            repository.setTheme(ThemeMode.DARK)
            repository.setDynamicColors(true)
            repository.setAutoPlay(true)

            repository.setJourney(Journey.KIDS)

            assertThat(repository.observe().first())
                .isEqualTo(Settings(ThemeMode.DARK, dynamicColors = true, autoPlay = true, journey = Journey.KIDS))
        }

    @Test
    fun `trocar de jornada substitui a anterior`() =
        runTest {
            val repository = DataStoreSettingsRepository(backgroundScope.dataStore())

            repository.setJourney(Journey.KIDS)
            repository.setJourney(Journey.ADULT)

            assertThat(repository.observe().first().journey).isEqualTo(Journey.ADULT)
        }

    @Test
    fun `jornada desconhecida no arquivo vira nula`() =
        runTest {
            val dataStore = backgroundScope.dataStore()
            dataStore.edit { it[stringPreferencesKey("journey")] = "TEEN" }

            assertThat(DataStoreSettingsRepository(dataStore).observe().first().journey).isNull()
        }
}
```

Substitua o conteúdo de `feature/settings/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/settings/presentation/SettingsFakes.kt`:

```kotlin
// Peças falsas dos testes de Configurações.

package com.velosobr.passarim.feature.settings.presentation

import com.velosobr.passarim.core.domain.ImageCacheCleaner
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.passarim.core.domain.Settings
import com.velosobr.passarim.core.domain.SettingsRepository
import com.velosobr.passarim.core.domain.ThemeMode
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

/** Preferências falsas num StateFlow, que mudam como as de verdade. */
class FakeSettingsRepository(
    initial: Settings = Settings(),
) : SettingsRepository {
    val settings = MutableStateFlow(initial)

    override fun observe(): StateFlow<Settings> = settings

    override suspend fun setTheme(theme: ThemeMode) = settings.update { it.copy(theme = theme) }

    override suspend fun setDynamicColors(enabled: Boolean) = settings.update { it.copy(dynamicColors = enabled) }

    override suspend fun setAutoPlay(enabled: Boolean) = settings.update { it.copy(autoPlay = enabled) }

    override suspend fun setJourney(journey: Journey) = settings.update { it.copy(journey = journey) }
}

/** Limpador falso: conta as limpezas e pode segurar a limpeza no gate até o teste liberar. */
class FakeImageCacheCleaner : ImageCacheCleaner {
    var calls = 0
    var gate: CompletableDeferred<Unit>? = null

    override suspend fun clearImageCache() {
        calls++
        gate?.await()
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:settings:data:testAndroidHostTest`

Expected: FAIL na compilação do `DataStoreSettingsRepositoryTest`: `Unresolved reference 'journey'`, `Unresolved reference 'setJourney'` e `No parameter with name 'journey' found`.

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `core/domain/src/commonMain/kotlin/com/velosobr/passarim/core/domain/Journey.kt`:

```kotlin
// A jornada do app: Passarim (adulto) ou Passarim Kids. O tema escolhe a
// variante do PiuDS por ela, e a escolha fica gravada nas preferências
// (Settings.journey, no Settings.kt).

package com.velosobr.passarim.core.domain

/** ADULT é o Passarim de sempre; KIDS é a jornada das crianças de 8 a 12 anos. */
enum class Journey { ADULT, KIDS }
```

Substitua o conteúdo de `core/domain/src/commonMain/kotlin/com/velosobr/passarim/core/domain/Settings.kt`:

```kotlin
// Preferências do usuário e o contrato para lê-las e gravá-las.
// "enum class" é um tipo com uma lista fechada de valores (aqui, os temas).

package com.velosobr.passarim.core.domain

import kotlinx.coroutines.flow.Flow

/** Tema escolhido: seguir o sistema, sempre claro ou sempre escuro. */
enum class ThemeMode { SYSTEM, LIGHT, DARK }

/**
 * As preferências, com os valores padrão de quem acabou de instalar o app.
 * [dynamicColors] usa as cores do papel de parede (Android 12+); [autoPlay]
 * toca o canto ao abrir uma ave. [journey] é a última jornada escolhida;
 * nula quer dizer primeira abertura, e o app mostra a Escolha (frente D).
 * O "?" no tipo diz que o valor pode ser null, e o Kotlin obriga quem lê a
 * tratar esse caso.
 */
data class Settings(
    val theme: ThemeMode = ThemeMode.SYSTEM,
    val dynamicColors: Boolean = false,
    val autoPlay: Boolean = false,
    val journey: Journey? = null,
)

/**
 * Lê e grava as preferências (DataStore, no feature:settings:data). [observe]
 * emite o valor atual e cada mudança.
 */
interface SettingsRepository {
    fun observe(): Flow<Settings>

    suspend fun setTheme(theme: ThemeMode)

    suspend fun setDynamicColors(enabled: Boolean)

    suspend fun setAutoPlay(enabled: Boolean)

    /**
     * Grava a jornada escolhida. Não há como voltar para null: depois da
     * primeira escolha, o app sempre abre numa jornada. Trocar de jornada não
     * mexe no tema nem na reprodução automática do adulto.
     */
    suspend fun setJourney(journey: Journey)
}
```

Substitua o conteúdo de `feature/settings/data/src/commonMain/kotlin/com/velosobr/passarim/feature/settings/data/DataStoreSettingsRepository.kt`:

```kotlin
// As preferências do usuário gravadas com o DataStore.

package com.velosobr.passarim.feature.settings.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.passarim.core.domain.Settings
import com.velosobr.passarim.core.domain.SettingsRepository
import com.velosobr.passarim.core.domain.ThemeMode
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

/**
 * Implementa o SettingsRepository com o DataStore Preferences, que guarda
 * pares chave/valor num arquivo e avisa por Flow a cada mudança. edit grava
 * de forma atômica (tudo ou nada). Chaves ausentes (primeira abertura) ficam
 * com os padrões de Settings().
 */
class DataStoreSettingsRepository(
    private val dataStore: DataStore<Preferences>,
) : SettingsRepository {
    override fun observe(): Flow<Settings> = dataStore.data.map { it.toSettings() }.distinctUntilChanged()

    override suspend fun setTheme(theme: ThemeMode) {
        dataStore.edit { it[THEME] = theme.name }
    }

    override suspend fun setDynamicColors(enabled: Boolean) {
        dataStore.edit { it[DYNAMIC_COLORS] = enabled }
    }

    override suspend fun setAutoPlay(enabled: Boolean) {
        dataStore.edit { it[AUTO_PLAY] = enabled }
    }

    /** Grava a jornada pelo nome do enum ("ADULT" ou "KIDS"); o edit só toca nesta chave, e as outras ficam como estão. */
    override suspend fun setJourney(journey: Journey) {
        dataStore.edit { it[JOURNEY] = journey.name }
    }

    /** Converte o que está gravado nas Settings do domínio. */
    private fun Preferences.toSettings(): Settings {
        val defaults = Settings()
        return Settings(
            theme = ThemeMode.entries.firstOrNull { it.name == this[THEME] } ?: defaults.theme,
            dynamicColors = this[DYNAMIC_COLORS] ?: defaults.dynamicColors,
            autoPlay = this[AUTO_PLAY] ?: defaults.autoPlay,
            // Sem a chave, ou com um nome que este app não conhece (um valor
            // de outra versão, por exemplo), a jornada fica nula e a Escolha
            // aparece de novo, em vez de o app quebrar ao abrir.
            journey = Journey.entries.firstOrNull { it.name == this[JOURNEY] },
        )
    }

    /** As chaves das preferências no arquivo; mudar o nome perderia o valor já gravado. */
    private companion object {
        val THEME = stringPreferencesKey("theme")
        val DYNAMIC_COLORS = booleanPreferencesKey("dynamicColors")
        val AUTO_PLAY = booleanPreferencesKey("autoPlay")
        val JOURNEY = stringPreferencesKey("journey")
    }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :feature:settings:data:testAndroidHostTest :feature:settings:presentation:testAndroidHostTest :feature:detail:presentation:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:settings:data:testAndroidHostTest :feature:settings:presentation:testAndroidHostTest :feature:detail:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 6: Commit**

A mensagem termina com as linhas de atribuição da sessão (Global Constraints).

```bash
git add -A
git commit -F - <<'EOF'
feat: jornada (adulto ou Kids) gravada nas preferências

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb
EOF
```

### Task 2: Checagem do Passarim Kids no BFF

O Kids está disponível quando `GET /v1/filters?audience=kids` traz `primaryBiomes` com a soma das contagens maior que zero (spec, seção 2.2, [R] 2). Um BFF sem a frente B ignora o `audience` e não manda o campo: o `FiltersDto` do E1 já o lê como lista vazia, a soma dá zero, e o Kids fica escondido. Um catálogo sem aves Kids manda contagens zeradas e também esconde o Kids. A interface fica no `core:domain`, para a apresentação do PR 3 não depender do `feature:explore:data`; a implementação reaproveita o `HttpClient` e o `FiltersDto` e não passa pelo cache em memória do `RemoteFiltersRepository` (aquele guarda os filtros do adulto, e esta resposta tem de ser a de agora).

**Files:**
- Create: `core/domain/src/commonMain/kotlin/com/velosobr/passarim/core/domain/KidsAvailabilityRepository.kt`
- Create: `feature/explore/data/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/data/RemoteKidsAvailabilityRepository.kt`
- Create (test): `feature/explore/data/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/data/RemoteKidsAvailabilityRepositoryTest.kt`

**Interfaces:**
- Produz: `interface KidsAvailabilityRepository { suspend fun checkKidsAvailability(): Result<Boolean, DataError.Network> }` em `core:domain`.
- Produz: `class RemoteKidsAvailabilityRepository(client: HttpClient) : KidsAvailabilityRepository` em `feature:explore:data`.
- Consome: `FiltersDto.primaryBiomes` (E1) e `safeCall` do `core:data`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `feature/explore/data/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/data/RemoteKidsAvailabilityRepositoryTest.kt`:

```kotlin
// Testes da checagem do Passarim Kids: o pedido feito ao BFF, a regra da soma
// das contagens por bioma principal e os erros de rede. O MockEngine do Ktor
// faz o papel do BFF: cada teste diz o que ele responde, sem rede de verdade.

package com.velosobr.passarim.feature.explore.data

import assertk.assertThat
import assertk.assertions.isEqualTo
import com.velosobr.passarim.core.data.createHttpClient
import com.velosobr.passarim.core.domain.AppConfig
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.Result
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandleScope
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test

/** json responde um corpo de sucesso; os corpos abaixo imitam o BFF com e sem a frente B. */
class RemoteKidsAvailabilityRepositoryTest {
    private val config = AppConfig(isDebug = false, baseUrl = "http://localhost:8080", mediaHostOverride = null, versionName = "1.0.0")

    private val withKids =
        """
        {"biomes":[],"states":[],
         "primaryBiomes":[{"code":"cerrado","label":"Cerrado","speciesCount":11},{"code":"pampa","label":"Pampa","speciesCount":2}]}
        """.trimIndent()

    // O BFF de antes da frente B ignora o ?audience=kids e não manda primaryBiomes.
    private val oldBff =
        """
        {"biomes":[{"code":"cerrado","label":"Cerrado","speciesCount":26}],"states":[{"code":"SP","speciesCount":29}]}
        """.trimIndent()

    private val noKidsBirds =
        """
        {"biomes":[],"states":[],
         "primaryBiomes":[{"code":"cerrado","label":"Cerrado","speciesCount":0},{"code":"pampa","label":"Pampa","speciesCount":0}]}
        """.trimIndent()

    private fun MockRequestHandleScope.json(body: String) =
        respond(body, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))

    private fun repository(engine: MockEngine) = RemoteKidsAvailabilityRepository(createHttpClient(engine, config))

    @Test
    fun `pede GET v1 filters com audience kids`() =
        runTest {
            var seenUrl = ""
            var seenMethod: HttpMethod? = null
            val engine =
                MockEngine { request ->
                    seenUrl = request.url.toString()
                    seenMethod = request.method
                    json(withKids)
                }

            repository(engine).checkKidsAvailability()

            assertThat(seenUrl).isEqualTo("http://localhost:8080/v1/filters?audience=kids")
            assertThat(seenMethod).isEqualTo(HttpMethod.Get)
        }

    @Test
    fun `disponivel quando a soma por bioma principal passa de zero`() =
        runTest {
            val result = repository(MockEngine { json(withKids) }).checkKidsAvailability()

            assertThat(result).isEqualTo(Result.Success(true))
        }

    @Test
    fun `indisponivel com um BFF sem primaryBiomes`() =
        runTest {
            val result = repository(MockEngine { json(oldBff) }).checkKidsAvailability()

            assertThat(result).isEqualTo(Result.Success(false))
        }

    @Test
    fun `indisponivel quando a soma e zero`() =
        runTest {
            val result = repository(MockEngine { json(noKidsBirds) }).checkKidsAvailability()

            assertThat(result).isEqualTo(Result.Success(false))
        }

    @Test
    fun `erro do servidor vira DataError Network`() =
        runTest {
            val engine = MockEngine { respond("", HttpStatusCode.ServiceUnavailable, headersOf(HttpHeaders.ContentType, "text/plain")) }

            val result = repository(engine).checkKidsAvailability()

            assertThat(result).isEqualTo(Result.Failure(DataError.Network.ServiceUnavailable))
        }

    @Test
    fun `sem rede vira NoConnection`() =
        runTest {
            val result = repository(MockEngine { error("sem rede") }).checkKidsAvailability()

            assertThat(result).isEqualTo(Result.Failure(DataError.Network.NoConnection))
        }

    @Test
    fun `cada checagem vai ao BFF sem cache`() =
        runTest {
            var calls = 0
            val repo =
                repository(
                    MockEngine {
                        calls++
                        json(withKids)
                    },
                )

            repo.checkKidsAvailability()
            repo.checkKidsAvailability()

            assertThat(calls).isEqualTo(2)
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:explore:data:testAndroidHostTest`

Expected: FAIL na compilação: `Unresolved reference 'RemoteKidsAvailabilityRepository'`.

- [ ] **Step 3: Implementar**

Crie `core/domain/src/commonMain/kotlin/com/velosobr/passarim/core/domain/KidsAvailabilityRepository.kt`:

```kotlin
// O contrato para saber se o BFF tem o Passarim Kids. Fica no core:domain
// porque quem pergunta (a Escolha e as Configurações, na frente D) não deve
// depender do módulo que responde (o feature:explore:data, que já fala com o
// /v1/filters). Assim, a apresentação só conhece esta interface, e os testes
// trocam a resposta por uma falsa.

package com.velosobr.passarim.core.domain

/**
 * Pergunta ao BFF se o Kids está disponível. A resposta não é gravada: cada
 * tela que precisa dela chama de novo ao abrir, porque o catálogo pode ganhar
 * (ou perder) as aves do Kids entre uma abertura e outra.
 */
interface KidsAvailabilityRepository {
    /**
     * true quando o BFF tem aves para o Kids; false quando o BFF não conhece o
     * Kids (anterior à frente B) ou não tem nenhuma ave para ele. Falha só
     * quando não deu para perguntar (sem rede, BFF fora do ar etc.), e aí a
     * tela decide o que mostrar, como o "Tentar de novo".
     */
    suspend fun checkKidsAvailability(): Result<Boolean, DataError.Network>
}
```

Crie `feature/explore/data/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/data/RemoteKidsAvailabilityRepository.kt`:

```kotlin
// A checagem do Passarim Kids no BFF. Mora no feature:explore:data porque
// reaproveita o HttpClient e o FiltersDto do /v1/filters (no
// RemoteFiltersRepository.kt), em vez de criar um módulo core só para isso.

package com.velosobr.passarim.feature.explore.data

import com.velosobr.passarim.core.data.safeCall
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.KidsAvailabilityRepository
import com.velosobr.passarim.core.domain.Result
import com.velosobr.passarim.core.domain.map
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.parameter

/**
 * `GET /v1/filters?audience=kids`: o Kids está disponível quando a soma das
 * contagens por bioma principal (`primaryBiomes`) passa de zero.
 *
 * - Um BFF de antes da frente B ignora o `audience` e não manda
 *   `primaryBiomes`; o FiltersDto lê o campo ausente como lista vazia, a soma
 *   dá zero, e o Kids fica escondido.
 * - Um catálogo sem aves para o Kids manda as contagens zeradas: também
 *   escondido, para o Kids não abrir vazio.
 *
 * De propósito, não passa pelo cache em memória do RemoteFiltersRepository:
 * aquele cache guarda os filtros do adulto (sem `audience`), e a resposta
 * daqui tem de ser a de agora, a cada abertura da Escolha ou das Configurações.
 */
class RemoteKidsAvailabilityRepository(
    private val client: HttpClient,
) : KidsAvailabilityRepository {
    override suspend fun checkKidsAvailability(): Result<Boolean, DataError.Network> =
        safeCall<FiltersDto> { client.get("/v1/filters") { parameter("audience", "kids") } }
            .map { filters -> filters.primaryBiomes.sumOf { it.speciesCount } > 0 }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :feature:explore:data:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:explore:data:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 6: Commit**

A mensagem termina com as linhas de atribuição da sessão (Global Constraints).

```bash
git add -A
git commit -F - <<'EOF'
feat: checagem do Passarim Kids pelo /v1/filters?audience=kids

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb
EOF
```

### Task 3: Checagem do Kids registrada no Koin

A Escolha e as Configurações (PR 3) pedem a `KidsAvailabilityRepository` ao Koin. O registro entra no `exploreDataModule`, ao lado dos outros repositórios do `/v1/filters`, e não precisa de módulo novo no `app` (o `exploreDataModule` já está na lista do `AppModule`). O teste monta um Koin isolado com um `HttpClient` de `MockEngine` e confere que a interface entrega a implementação remota.

**Files:**
- Modify: `feature/explore/data/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/data/ExploreDataModule.kt`
- Create (test): `feature/explore/data/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/data/ExploreDataModuleTest.kt`

**Interfaces:**
- Produz: `single<KidsAvailabilityRepository> { RemoteKidsAvailabilityRepository(get()) }` no `exploreDataModule`.
- Consome: `RemoteKidsAvailabilityRepository` (Task 2) e o `HttpClient` do `coreDataModule`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `feature/explore/data/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/data/ExploreDataModuleTest.kt`:

```kotlin
// Teste do registro no Koin: confere que quem pedir a interface do domínio
// recebe a implementação que fala com o BFF. O Koin só cria um objeto quando
// alguém o pede (get), então o teste pede e olha o que veio.

package com.velosobr.passarim.feature.explore.data

import assertk.assertThat
import assertk.assertions.isInstanceOf
import com.velosobr.passarim.core.data.createHttpClient
import com.velosobr.passarim.core.domain.AppConfig
import com.velosobr.passarim.core.domain.KidsAvailabilityRepository
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respondOk
import org.koin.dsl.koinApplication
import org.koin.dsl.module
import kotlin.test.Test

/** O HttpClient vem do coreDataModule no app; aqui, um módulo de teste o troca por um com MockEngine. */
class ExploreDataModuleTest {
    private val config = AppConfig(isDebug = false, baseUrl = "http://localhost:8080", mediaHostOverride = null, versionName = "1.0.0")

    private val testHttpModule = module { single<HttpClient> { createHttpClient(MockEngine { respondOk() }, config) } }

    @Test
    fun `entrega a checagem do Kids feita no BFF`() {
        // koinApplication monta um Koin isolado, sem o global do app, e o
        // close no fim libera o que ele criou.
        val app = koinApplication { modules(testHttpModule, exploreDataModule) }
        try {
            assertThat(app.koin.get<KidsAvailabilityRepository>()).isInstanceOf<RemoteKidsAvailabilityRepository>()
        } finally {
            app.close()
        }
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:explore:data:testAndroidHostTest`

Expected: FAIL no teste: `ExploreDataModuleTest > entrega a checagem do Kids feita no BFF FAILED` com `org.koin.core.error.NoDefinitionFoundException`.

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `feature/explore/data/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/data/ExploreDataModule.kt`:

```kotlin
// Registro dos repositórios do Explorar (e da checagem do Kids) no Koin.

package com.velosobr.passarim.feature.explore.data

import com.velosobr.passarim.core.domain.FeaturedRepository
import com.velosobr.passarim.core.domain.FiltersRepository
import com.velosobr.passarim.core.domain.KidsAvailabilityRepository
import com.velosobr.passarim.feature.explore.domain.ExploreRepository
import org.koin.dsl.module

/**
 * Repositórios de Explorar (a lista, os filtros e a "Ave do dia") e a checagem do Passarim Kids, que usa o mesmo
 * `/v1/filters`. O `HttpClient` e o `MediaUrlRewriter` vêm do `coreDataModule`.
 */
val exploreDataModule =
    module {
        single<ExploreRepository> { RemoteExploreRepository(get(), get()) }
        single<FiltersRepository> { RemoteFiltersRepository(get()) }
        single<FeaturedRepository> { RemoteFeaturedRepository(get(), get()) }
        single<KidsAvailabilityRepository> { RemoteKidsAvailabilityRepository(get()) }
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :feature:explore:data:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:explore:data:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 6: Commit**

A mensagem termina com as linhas de atribuição da sessão (Global Constraints).

```bash
git add -A
git commit -F - <<'EOF'
feat: checagem do Passarim Kids registrada no Koin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb
EOF
```

## Correções da revisão final

Depois da Task 3, um revisor independente (agente Opus) leu o branch inteiro. Ele não achou nada Critical nem Important. Dos seis achados Minor, os quatro que pesam no PR 3 (M1, M2, M3 e M5) viraram tarefas, com o teste vermelho primeiro quando há comportamento, cada uma num commit `fix:` no fim do branch (sem fixup nem autosquash). M4 e M6 eram da redação deste plano e já estão corrigidos no texto. O ledger completo está no fim do plano.

### Task 4: BFF que recusa o audience=kids esconde o Kids (revisão M1)

O `safeCall` transforma um 400 problem+json `INVALID_PARAMETER` em `Failure(InvalidParameter)`, e o PR 3 mostraria "Precisa de internet" com um "Tentar de novo" que nunca resolve. Um BFF que recusa o `audience=kids` é um BFF sem Kids (spec, "BFF que não conhece o Kids, Kids escondido"): a checagem devolve `Success(false)`. Os outros erros continuam falhas, e o KDoc da interface passa a dizer quando há falha (sem rede, BFF fora do ar ou resposta que o app não entende). Hoje o BFF da frente B aceita `kids` e o anterior ignora o parâmetro; o teste prende o comportamento para um contrato futuro.

**Files:**
- Modify: `core/domain/src/commonMain/kotlin/com/velosobr/passarim/core/domain/KidsAvailabilityRepository.kt`
- Modify: `feature/explore/data/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/data/RemoteKidsAvailabilityRepository.kt`
- Test: `feature/explore/data/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/data/RemoteKidsAvailabilityRepositoryTest.kt`

**Interfaces:**
- Muda: `RemoteKidsAvailabilityRepository.checkKidsAvailability()` devolve `Success(false)` diante de `DataError.Network.InvalidParameter`.
- Consome: o mapeamento `INVALID_PARAMETER` → `InvalidParameter` do `safeCall`.

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `feature/explore/data/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/data/RemoteKidsAvailabilityRepositoryTest.kt`:

```kotlin
// Testes da checagem do Passarim Kids: o pedido feito ao BFF, a regra da soma
// das contagens por bioma principal e os erros de rede. O MockEngine do Ktor
// faz o papel do BFF: cada teste diz o que ele responde, sem rede de verdade.

package com.velosobr.passarim.feature.explore.data

import assertk.assertThat
import assertk.assertions.isEqualTo
import com.velosobr.passarim.core.data.createHttpClient
import com.velosobr.passarim.core.domain.AppConfig
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.Result
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandleScope
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test

/** json responde um corpo de sucesso; os corpos abaixo imitam o BFF com e sem a frente B. */
class RemoteKidsAvailabilityRepositoryTest {
    private val config = AppConfig(isDebug = false, baseUrl = "http://localhost:8080", mediaHostOverride = null, versionName = "1.0.0")

    private val withKids =
        """
        {"biomes":[],"states":[],
         "primaryBiomes":[{"code":"cerrado","label":"Cerrado","speciesCount":11},{"code":"pampa","label":"Pampa","speciesCount":2}]}
        """.trimIndent()

    // O BFF de antes da frente B ignora o ?audience=kids e não manda primaryBiomes.
    private val oldBff =
        """
        {"biomes":[{"code":"cerrado","label":"Cerrado","speciesCount":26}],"states":[{"code":"SP","speciesCount":29}]}
        """.trimIndent()

    private val noKidsBirds =
        """
        {"biomes":[],"states":[],
         "primaryBiomes":[{"code":"cerrado","label":"Cerrado","speciesCount":0},{"code":"pampa","label":"Pampa","speciesCount":0}]}
        """.trimIndent()

    private fun MockRequestHandleScope.json(body: String) =
        respond(body, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))

    private fun repository(engine: MockEngine) = RemoteKidsAvailabilityRepository(createHttpClient(engine, config))

    @Test
    fun `pede GET v1 filters com audience kids`() =
        runTest {
            var seenUrl = ""
            var seenMethod: HttpMethod? = null
            val engine =
                MockEngine { request ->
                    seenUrl = request.url.toString()
                    seenMethod = request.method
                    json(withKids)
                }

            repository(engine).checkKidsAvailability()

            assertThat(seenUrl).isEqualTo("http://localhost:8080/v1/filters?audience=kids")
            assertThat(seenMethod).isEqualTo(HttpMethod.Get)
        }

    @Test
    fun `disponivel quando a soma por bioma principal passa de zero`() =
        runTest {
            val result = repository(MockEngine { json(withKids) }).checkKidsAvailability()

            assertThat(result).isEqualTo(Result.Success(true))
        }

    @Test
    fun `indisponivel com um BFF sem primaryBiomes`() =
        runTest {
            val result = repository(MockEngine { json(oldBff) }).checkKidsAvailability()

            assertThat(result).isEqualTo(Result.Success(false))
        }

    @Test
    fun `indisponivel quando a soma e zero`() =
        runTest {
            val result = repository(MockEngine { json(noKidsBirds) }).checkKidsAvailability()

            assertThat(result).isEqualTo(Result.Success(false))
        }

    @Test
    fun `erro do servidor vira DataError Network`() =
        runTest {
            val engine = MockEngine { respond("", HttpStatusCode.ServiceUnavailable, headersOf(HttpHeaders.ContentType, "text/plain")) }

            val result = repository(engine).checkKidsAvailability()

            assertThat(result).isEqualTo(Result.Failure(DataError.Network.ServiceUnavailable))
        }

    // Um BFF que não aceita o audience=kids responde 400 em problem+json com o
    // code INVALID_PARAMETER. Para o app, isso é um BFF sem Kids: tentar de
    // novo não resolveria, então o Kids fica escondido em vez de virar erro.
    @Test
    fun `audience recusado pelo BFF esconde o Kids`() =
        runTest {
            val engine =
                MockEngine {
                    respond(
                        """{"status":400,"code":"INVALID_PARAMETER","errors":[{"field":"audience","reason":"use adult ou kids"}]}""",
                        HttpStatusCode.BadRequest,
                        headersOf(HttpHeaders.ContentType, "application/problem+json"),
                    )
                }

            val result = repository(engine).checkKidsAvailability()

            assertThat(result).isEqualTo(Result.Success(false))
        }

    @Test
    fun `sem rede vira NoConnection`() =
        runTest {
            val result = repository(MockEngine { error("sem rede") }).checkKidsAvailability()

            assertThat(result).isEqualTo(Result.Failure(DataError.Network.NoConnection))
        }

    @Test
    fun `cada checagem vai ao BFF sem cache`() =
        runTest {
            var calls = 0
            val repo =
                repository(
                    MockEngine {
                        calls++
                        json(withKids)
                    },
                )

            repo.checkKidsAvailability()
            repo.checkKidsAvailability()

            assertThat(calls).isEqualTo(2)
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:explore:data:testAndroidHostTest`

Expected: FAIL no teste: `RemoteKidsAvailabilityRepositoryTest > audience recusado pelo BFF esconde o Kids FAILED` com `expected:<[Success(data=false])> but was:<[Failure(error=InvalidParameter])>`.

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `core/domain/src/commonMain/kotlin/com/velosobr/passarim/core/domain/KidsAvailabilityRepository.kt`:

```kotlin
// O contrato para saber se o BFF tem o Passarim Kids. Fica no core:domain
// porque quem pergunta (a Escolha e as Configurações, na frente D) não deve
// depender do módulo que responde (o feature:explore:data, que já fala com o
// /v1/filters). Assim, a apresentação só conhece esta interface, e os testes
// trocam a resposta por uma falsa.

package com.velosobr.passarim.core.domain

/**
 * Pergunta ao BFF se o Kids está disponível. A resposta não é gravada: cada
 * tela que precisa dela chama de novo ao abrir, porque o catálogo pode ganhar
 * (ou perder) as aves do Kids entre uma abertura e outra.
 */
interface KidsAvailabilityRepository {
    /**
     * true quando o BFF tem aves para o Kids; false quando o BFF não conhece o
     * Kids (anterior à frente B, ou que recusa o pedido do Kids como parâmetro
     * inválido) ou não tem nenhuma ave para ele. Falha quando não deu para
     * perguntar (sem rede, BFF fora do ar etc.) ou quando a resposta veio
     * num formato que o app não entende, e aí a tela decide o que mostrar,
     * como o "Tentar de novo".
     */
    suspend fun checkKidsAvailability(): Result<Boolean, DataError.Network>
}
```

Substitua o conteúdo de `feature/explore/data/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/data/RemoteKidsAvailabilityRepository.kt`:

```kotlin
// A checagem do Passarim Kids no BFF. Mora no feature:explore:data porque
// reaproveita o HttpClient e o FiltersDto do /v1/filters (no
// RemoteFiltersRepository.kt), em vez de criar um módulo core só para isso.

package com.velosobr.passarim.feature.explore.data

import com.velosobr.passarim.core.data.safeCall
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.KidsAvailabilityRepository
import com.velosobr.passarim.core.domain.Result
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.parameter

/**
 * `GET /v1/filters?audience=kids`: o Kids está disponível quando a soma das
 * contagens por bioma principal (`primaryBiomes`) passa de zero.
 *
 * - Um BFF de antes da frente B ignora o `audience` e não manda
 *   `primaryBiomes`; o FiltersDto lê o campo ausente como lista vazia, a soma
 *   dá zero, e o Kids fica escondido.
 * - Um catálogo sem aves para o Kids manda as contagens zeradas: também
 *   escondido, para o Kids não abrir vazio.
 * - Um BFF que recusa o `audience=kids` (400 com o code INVALID_PARAMETER)
 *   também não tem o Kids: vira false, e não falha, porque tentar de novo
 *   daria a mesma recusa e a tela mostraria um "Tentar de novo" inútil.
 *
 * De propósito, não passa pelo cache em memória do RemoteFiltersRepository:
 * aquele cache guarda os filtros do adulto (sem `audience`), e a resposta
 * daqui tem de ser a de agora, a cada abertura da Escolha ou das Configurações.
 */
class RemoteKidsAvailabilityRepository(
    private val client: HttpClient,
) : KidsAvailabilityRepository {
    override suspend fun checkKidsAvailability(): Result<Boolean, DataError.Network> =
        when (val result = safeCall<FiltersDto> { client.get("/v1/filters") { parameter("audience", "kids") } }) {
            is Result.Success -> Result.Success(result.data.primaryBiomes.sumOf { it.speciesCount } > 0)
            is Result.Failure -> if (result.error == DataError.Network.InvalidParameter) Result.Success(false) else result
        }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :feature:explore:data:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:explore:data:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 6: Commit**

A mensagem termina com as linhas de atribuição da sessão (Global Constraints).

```bash
git add -A
git commit -F - <<'EOF'
fix: BFF que recusa o audience=kids esconde o Kids em vez de falhar

Um 400 INVALID_PARAMETER na checagem do Kids vira Success(false): o BFF
respondeu que não conhece o Kids, e um "Tentar de novo" daria a mesma
recusa. O KDoc da interface passa a dizer quando há falha (revisão M1).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb
EOF
```

### Task 5: Valor desconhecido da jornada confere as outras chaves (revisão M2)

O teste do valor desconhecido gravava só a jornada e conferia só a jornada: uma leitura que caísse em `Settings()` inteiro diante do valor inválido passaria e apagaria o tema do adulto. O teste passa a gravar tema e reprodução automática junto da jornada `TEEN` e a comparar as `Settings` inteiras; um segundo teste confere o sentido contrário (gravar o tema depois da jornada a mantém). O código não muda.

**Files:**
- Test: `feature/settings/data/src/commonTest/kotlin/com/velosobr/passarim/feature/settings/data/DataStoreSettingsRepositoryTest.kt`

**Interfaces:**
- Nenhuma mudança de interface; só testes do `DataStoreSettingsRepository`.

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `feature/settings/data/src/commonTest/kotlin/com/velosobr/passarim/feature/settings/data/DataStoreSettingsRepositoryTest.kt`:

```kotlin
// Testes do repositório de preferências com um DataStore de verdade, num
// arquivo temporário apagado depois de cada teste.

package com.velosobr.passarim.feature.settings.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.passarim.core.domain.Settings
import com.velosobr.passarim.core.domain.ThemeMode
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import okio.FileSystem
import okio.Path
import kotlin.random.Random
import kotlin.test.AfterTest
import kotlin.test.Test

class DataStoreSettingsRepositoryTest {
    private val file: Path = FileSystem.SYSTEM_TEMPORARY_DIRECTORY / "settings-${Random.nextLong()}.preferences_pb"

    @AfterTest
    fun deleteFile() = FileSystem.SYSTEM.delete(file)

    /** dataStore cria o DataStore no arquivo temporário, preso ao escopo do teste. */
    private fun CoroutineScope.dataStore(): DataStore<Preferences> = PreferenceDataStoreFactory.createWithPath(scope = this) { file }

    @Test
    fun `sem arquivo usa os padroes`() =
        runTest {
            val repository = DataStoreSettingsRepository(backgroundScope.dataStore())

            assertThat(repository.observe().first()).isEqualTo(Settings(ThemeMode.SYSTEM, dynamicColors = false, autoPlay = false))
        }

    @Test
    fun `grava cada opcao`() =
        runTest {
            val repository = DataStoreSettingsRepository(backgroundScope.dataStore())

            repository.setTheme(ThemeMode.DARK)
            repository.setDynamicColors(true)
            repository.setAutoPlay(true)

            assertThat(repository.observe().first()).isEqualTo(Settings(ThemeMode.DARK, dynamicColors = true, autoPlay = true))
        }

    @Test
    fun `tema invalido no arquivo cai no padrao`() =
        runTest {
            val dataStore = backgroundScope.dataStore()
            dataStore.edit { it[stringPreferencesKey("theme")] = "PURPLE" }

            assertThat(DataStoreSettingsRepository(dataStore).observe().first().theme).isEqualTo(ThemeMode.SYSTEM)
        }

    @Test
    fun `sem arquivo a jornada e nula`() =
        runTest {
            val repository = DataStoreSettingsRepository(backgroundScope.dataStore())

            assertThat(repository.observe().first().journey).isNull()
        }

    @Test
    fun `grava a jornada sem mexer nas outras opcoes`() =
        runTest {
            val repository = DataStoreSettingsRepository(backgroundScope.dataStore())
            repository.setTheme(ThemeMode.DARK)
            repository.setDynamicColors(true)
            repository.setAutoPlay(true)

            repository.setJourney(Journey.KIDS)

            assertThat(repository.observe().first())
                .isEqualTo(Settings(ThemeMode.DARK, dynamicColors = true, autoPlay = true, journey = Journey.KIDS))
        }

    @Test
    fun `trocar de jornada substitui a anterior`() =
        runTest {
            val repository = DataStoreSettingsRepository(backgroundScope.dataStore())

            repository.setJourney(Journey.KIDS)
            repository.setJourney(Journey.ADULT)

            assertThat(repository.observe().first().journey).isEqualTo(Journey.ADULT)
        }

    // Confere também as outras chaves: uma leitura que caísse em Settings()
    // inteiro diante do valor desconhecido apagaria o tema e o autoPlay.
    @Test
    fun `jornada desconhecida no arquivo vira nula e as outras chaves continuam`() =
        runTest {
            val dataStore = backgroundScope.dataStore()
            dataStore.edit {
                it[stringPreferencesKey("theme")] = "DARK"
                it[booleanPreferencesKey("autoPlay")] = true
                it[stringPreferencesKey("journey")] = "TEEN"
            }

            assertThat(DataStoreSettingsRepository(dataStore).observe().first())
                .isEqualTo(Settings(ThemeMode.DARK, autoPlay = true, journey = null))
        }

    @Test
    fun `gravar outra opcao depois da jornada mantem a jornada`() =
        runTest {
            val repository = DataStoreSettingsRepository(backgroundScope.dataStore())

            repository.setJourney(Journey.KIDS)
            repository.setTheme(ThemeMode.DARK)

            assertThat(repository.observe().first().journey).isEqualTo(Journey.KIDS)
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:settings:data:testAndroidHostTest`

Expected: Com o código atual os testes passam (o código já faz a coisa certa, e o teste reforça a cobertura). Para ver o teste reforçado falhar, aplique um mutante temporário no início de `toSettings()` do `DataStoreSettingsRepository`: `if (this[JOURNEY] != null && Journey.entries.none { it.name == this[JOURNEY] }) return defaults`. Rode: FAIL em `jornada desconhecida no arquivo vira nula e as outras chaves continuam` com `expected:<Settings(theme=[DARK, dynamicColors=false, autoPlay=tru]e, journey=null)> but was:<Settings(theme=[SYSTEM, dynamicColors=false, autoPlay=fals]e, journey=null)>`. Desfaça o mutante (`git checkout -- feature/settings/data/src/commonMain`) antes de seguir.

- [ ] **Step 3: Rodar e ver passar**

Run: `./gradlew :feature:settings:data:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 4: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:settings:data:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 5: Commit**

A mensagem termina com as linhas de atribuição da sessão (Global Constraints).

```bash
git add -A
git commit -F - <<'EOF'
fix: teste da jornada desconhecida confere também as outras chaves

O teste passa a gravar tema e autoPlay junto da jornada inválida e a
comparar as Settings inteiras; outro teste confere que gravar o tema
depois da jornada a mantém (revisão M2).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb
EOF
```

### Task 6: Preferências resilientes a arquivo corrompido ou ilegível (revisão M5)

No PR 3, a raiz do app escolhe a jornada pelo `observe()` (o DataStore é a única fonte, spec 2.1). Hoje um arquivo corrompido ou um `IOException` derruba essa coleta. A fábrica do DataStore vira a função `createSettingsDataStore` (o módulo do Koin e o teste usam a mesma), com o `ReplaceFileCorruptionHandler` trocando um arquivo corrompido por preferências vazias, e o `observe()` ganha um `catch` que emite preferências vazias diante de um `IOException` (o do DataStore e o do Okio, que são classes diferentes no iOS). Nos dois casos o app volta aos padrões de `Settings()`, com a jornada nula e a Escolha aparecendo. O teste do arquivo corrompido também grava depois, porque sem o handler a gravação falharia mesmo com o `catch` na leitura.

**Files:**
- Modify: `feature/settings/data/src/commonMain/kotlin/com/velosobr/passarim/feature/settings/data/DataStoreSettingsRepository.kt`
- Modify: `feature/settings/data/src/commonMain/kotlin/com/velosobr/passarim/feature/settings/data/SettingsDataModule.kt`
- Test: `feature/settings/data/src/commonTest/kotlin/com/velosobr/passarim/feature/settings/data/DataStoreSettingsRepositoryTest.kt`

**Interfaces:**
- Produz: `internal fun createSettingsDataStore(scope: CoroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob()), produceFile: () -> Path): DataStore<Preferences>` no `SettingsDataModule.kt`.
- Muda: `DataStoreSettingsRepository.observe()` emite os padrões diante de `IOException`.

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `feature/settings/data/src/commonTest/kotlin/com/velosobr/passarim/feature/settings/data/DataStoreSettingsRepositoryTest.kt`:

```kotlin
// Testes do repositório de preferências com um DataStore de verdade, num
// arquivo temporário apagado depois de cada teste.

package com.velosobr.passarim.feature.settings.data

import androidx.datastore.core.DataStore
import androidx.datastore.core.IOException
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.passarim.core.domain.Settings
import com.velosobr.passarim.core.domain.ThemeMode
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.runTest
import okio.FileSystem
import okio.Path
import kotlin.random.Random
import kotlin.test.AfterTest
import kotlin.test.Test

class DataStoreSettingsRepositoryTest {
    private val file: Path = FileSystem.SYSTEM_TEMPORARY_DIRECTORY / "settings-${Random.nextLong()}.preferences_pb"

    @AfterTest
    fun deleteFile() = FileSystem.SYSTEM.delete(file)

    /** dataStore cria o DataStore no arquivo temporário, preso ao escopo do teste. */
    private fun CoroutineScope.dataStore(): DataStore<Preferences> = PreferenceDataStoreFactory.createWithPath(scope = this) { file }

    @Test
    fun `sem arquivo usa os padroes`() =
        runTest {
            val repository = DataStoreSettingsRepository(backgroundScope.dataStore())

            assertThat(repository.observe().first()).isEqualTo(Settings(ThemeMode.SYSTEM, dynamicColors = false, autoPlay = false))
        }

    @Test
    fun `grava cada opcao`() =
        runTest {
            val repository = DataStoreSettingsRepository(backgroundScope.dataStore())

            repository.setTheme(ThemeMode.DARK)
            repository.setDynamicColors(true)
            repository.setAutoPlay(true)

            assertThat(repository.observe().first()).isEqualTo(Settings(ThemeMode.DARK, dynamicColors = true, autoPlay = true))
        }

    @Test
    fun `tema invalido no arquivo cai no padrao`() =
        runTest {
            val dataStore = backgroundScope.dataStore()
            dataStore.edit { it[stringPreferencesKey("theme")] = "PURPLE" }

            assertThat(DataStoreSettingsRepository(dataStore).observe().first().theme).isEqualTo(ThemeMode.SYSTEM)
        }

    @Test
    fun `sem arquivo a jornada e nula`() =
        runTest {
            val repository = DataStoreSettingsRepository(backgroundScope.dataStore())

            assertThat(repository.observe().first().journey).isNull()
        }

    @Test
    fun `grava a jornada sem mexer nas outras opcoes`() =
        runTest {
            val repository = DataStoreSettingsRepository(backgroundScope.dataStore())
            repository.setTheme(ThemeMode.DARK)
            repository.setDynamicColors(true)
            repository.setAutoPlay(true)

            repository.setJourney(Journey.KIDS)

            assertThat(repository.observe().first())
                .isEqualTo(Settings(ThemeMode.DARK, dynamicColors = true, autoPlay = true, journey = Journey.KIDS))
        }

    @Test
    fun `trocar de jornada substitui a anterior`() =
        runTest {
            val repository = DataStoreSettingsRepository(backgroundScope.dataStore())

            repository.setJourney(Journey.KIDS)
            repository.setJourney(Journey.ADULT)

            assertThat(repository.observe().first().journey).isEqualTo(Journey.ADULT)
        }

    // Confere também as outras chaves: uma leitura que caísse em Settings()
    // inteiro diante do valor desconhecido apagaria o tema e o autoPlay.
    @Test
    fun `jornada desconhecida no arquivo vira nula e as outras chaves continuam`() =
        runTest {
            val dataStore = backgroundScope.dataStore()
            dataStore.edit {
                it[stringPreferencesKey("theme")] = "DARK"
                it[booleanPreferencesKey("autoPlay")] = true
                it[stringPreferencesKey("journey")] = "TEEN"
            }

            assertThat(DataStoreSettingsRepository(dataStore).observe().first())
                .isEqualTo(Settings(ThemeMode.DARK, autoPlay = true, journey = null))
        }

    @Test
    fun `gravar outra opcao depois da jornada mantem a jornada`() =
        runTest {
            val repository = DataStoreSettingsRepository(backgroundScope.dataStore())

            repository.setJourney(Journey.KIDS)
            repository.setTheme(ThemeMode.DARK)

            assertThat(repository.observe().first().journey).isEqualTo(Journey.KIDS)
        }

    @Test
    fun `erro de leitura do arquivo usa os padroes`() =
        runTest {
            val repository = DataStoreSettingsRepository(UnreadableDataStore())

            assertThat(repository.observe().first()).isEqualTo(Settings())
        }

    @Test
    fun `arquivo corrompido volta aos padroes e aceita gravar de novo`() =
        runTest {
            FileSystem.SYSTEM.write(file) { writeUtf8("isto nao e um arquivo de preferencias") }
            val repository = DataStoreSettingsRepository(createSettingsDataStore(backgroundScope) { file })

            assertThat(repository.observe().first()).isEqualTo(Settings())

            repository.setTheme(ThemeMode.DARK)

            assertThat(repository.observe().first().theme).isEqualTo(ThemeMode.DARK)
        }
}

/**
 * Um DataStore falso cujo arquivo não pode ser lido (disco cheio, permissão
 * negada): o data lança IOException assim que alguém começa a coletar.
 * flow { } cria um Flow que roda o bloco a cada coleta.
 */
private class UnreadableDataStore : DataStore<Preferences> {
    override val data: Flow<Preferences> = flow { throw IOException("arquivo ilegível", null) }

    override suspend fun updateData(transform: suspend (t: Preferences) -> Preferences): Preferences =
        throw IOException("arquivo ilegível", null)
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:settings:data:testAndroidHostTest`

Expected: FAIL na compilação do `DataStoreSettingsRepositoryTest`: `Unresolved reference 'createSettingsDataStore'`. Se quiser ver a falha de comportamento, crie antes só a função, repassando o `scope` e o `produceFile` ao `PreferenceDataStoreFactory.createWithPath` sem o handler, e rode de novo: FAIL em `erro de leitura do arquivo usa os padroes` (`java.io.IOException`) e em `arquivo corrompido volta aos padroes e aceita gravar de novo` (`androidx.datastore.core.CorruptionException`).

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `feature/settings/data/src/commonMain/kotlin/com/velosobr/passarim/feature/settings/data/DataStoreSettingsRepository.kt`:

```kotlin
// As preferências do usuário gravadas com o DataStore.

package com.velosobr.passarim.feature.settings.data

import androidx.datastore.core.DataStore
import androidx.datastore.core.IOException
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.passarim.core.domain.Settings
import com.velosobr.passarim.core.domain.SettingsRepository
import com.velosobr.passarim.core.domain.ThemeMode
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

/**
 * Implementa o SettingsRepository com o DataStore Preferences, que guarda
 * pares chave/valor num arquivo e avisa por Flow a cada mudança. edit grava
 * de forma atômica (tudo ou nada). Chaves ausentes (primeira abertura) ficam
 * com os padrões de Settings().
 */
class DataStoreSettingsRepository(
    private val dataStore: DataStore<Preferences>,
) : SettingsRepository {
    /**
     * As preferências atuais e as próximas mudanças. O catch intercepta um
     * erro que aconteça no Flow antes dele: se o arquivo não pôde ser lido
     * (IOException), emite preferências vazias, e quem observa recebe os
     * padrões de Settings() em vez de ver a coleta morrer (a raiz do app
     * depende deste Flow para escolher o que mostrar). Outros erros são bugs
     * e seguem adiante. São dois IOException porque, no iOS, o do DataStore e
     * o do Okio (que lê o arquivo) são classes diferentes; no Android, os dois
     * são o java.io.IOException.
     */
    override fun observe(): Flow<Settings> =
        dataStore.data
            .catch { if (it is IOException || it is okio.IOException) emit(emptyPreferences()) else throw it }
            .map { it.toSettings() }
            .distinctUntilChanged()

    override suspend fun setTheme(theme: ThemeMode) {
        dataStore.edit { it[THEME] = theme.name }
    }

    override suspend fun setDynamicColors(enabled: Boolean) {
        dataStore.edit { it[DYNAMIC_COLORS] = enabled }
    }

    override suspend fun setAutoPlay(enabled: Boolean) {
        dataStore.edit { it[AUTO_PLAY] = enabled }
    }

    /** Grava a jornada pelo nome do enum ("ADULT" ou "KIDS"); o edit só toca nesta chave, e as outras ficam como estão. */
    override suspend fun setJourney(journey: Journey) {
        dataStore.edit { it[JOURNEY] = journey.name }
    }

    /** Converte o que está gravado nas Settings do domínio. */
    private fun Preferences.toSettings(): Settings {
        val defaults = Settings()
        return Settings(
            theme = ThemeMode.entries.firstOrNull { it.name == this[THEME] } ?: defaults.theme,
            dynamicColors = this[DYNAMIC_COLORS] ?: defaults.dynamicColors,
            autoPlay = this[AUTO_PLAY] ?: defaults.autoPlay,
            // Sem a chave, ou com um nome que este app não conhece (um valor
            // de outra versão, por exemplo), a jornada fica nula e a Escolha
            // aparece de novo, em vez de o app quebrar ao abrir.
            journey = Journey.entries.firstOrNull { it.name == this[JOURNEY] },
        )
    }

    /** As chaves das preferências no arquivo; mudar o nome perderia o valor já gravado. */
    private companion object {
        val THEME = stringPreferencesKey("theme")
        val DYNAMIC_COLORS = booleanPreferencesKey("dynamicColors")
        val AUTO_PLAY = booleanPreferencesKey("autoPlay")
        val JOURNEY = stringPreferencesKey("journey")
    }
}
```

Substitua o conteúdo de `feature/settings/data/src/commonMain/kotlin/com/velosobr/passarim/feature/settings/data/SettingsDataModule.kt`:

```kotlin
// Registro do DataStore, das preferências e do limpador de cache no Koin.

package com.velosobr.passarim.feature.settings.data

import androidx.datastore.core.DataStore
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import com.velosobr.passarim.core.domain.ImageCacheCleaner
import com.velosobr.passarim.core.domain.SettingsRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import okio.Path
import okio.Path.Companion.toPath
import org.koin.core.scope.Scope
import org.koin.dsl.module

/** Nome do arquivo das preferências; o DataStore Preferences grava em protobuf e exige a extensão .preferences_pb. */
internal const val SETTINGS_FILE_NAME = "settings.preferences_pb"

/** Cada plataforma diz onde o arquivo fica. */
internal expect fun Scope.settingsFilePath(): String

/**
 * Cria o DataStore das preferências no arquivo que produceFile indica. O
 * scope é onde o DataStore roda as leituras e gravações: no app, um escopo
 * próprio no Dispatchers.IO que vive o processo inteiro (o SupervisorJob
 * impede que um erro numa gravação cancele o escopo); nos testes, o do teste.
 *
 * O ReplaceFileCorruptionHandler entra em ação quando o arquivo existe mas
 * não é um protobuf válido (gravação interrompida, por exemplo): troca o
 * conteúdo por preferências vazias, e o app volta aos padrões de Settings()
 * (inclusive a jornada nula, que mostra a Escolha) em vez de falhar a cada
 * leitura e a cada gravação.
 */
internal fun createSettingsDataStore(
    scope: CoroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob()),
    produceFile: () -> Path,
): DataStore<Preferences> =
    PreferenceDataStoreFactory.createWithPath(
        corruptionHandler = ReplaceFileCorruptionHandler { emptyPreferences() },
        scope = scope,
        produceFile = produceFile,
    )

/** Uma instância só do DataStore: o DataStore exige um por arquivo no processo. */
val settingsDataModule =
    module {
        single<DataStore<Preferences>> { createSettingsDataStore { settingsFilePath().toPath() } }
        single<SettingsRepository> { DataStoreSettingsRepository(get()) }
        single<ImageCacheCleaner> { CoilImageCacheCleaner(get()) }
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :feature:settings:data:testAndroidHostTest :feature:settings:data:iosSimulatorArm64Test`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:settings:data:testAndroidHostTest :feature:settings:data:iosSimulatorArm64Test :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 6: Commit**

A mensagem termina com as linhas de atribuição da sessão (Global Constraints).

```bash
git add -A
git commit -F - <<'EOF'
fix: preferências voltam aos padrões com o arquivo corrompido ou ilegível

O DataStore das preferências ganha o ReplaceFileCorruptionHandler (troca
o arquivo corrompido por preferências vazias) e o observe() emite os
padrões diante de um IOException, em vez de derrubar a coleta da qual a
raiz do app vai depender para escolher a jornada (revisão M5).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb
EOF
```

### Task 7: Comentários didáticos da checagem do Kids (revisão M3)

Conceitos que apareciam sem explicação na primeira vez no arquivo: `suspend` e o `Result<Boolean, DataError.Network>` na interface; o `safeCall`, o `parameter`, o `when` sobre o `Result` e o `sumOf` na implementação; o `runTest` e o `MockRequestHandleScope` no teste. Só comentários: não há teste a escrever, e a conferência é ler o diff com a régua do `CLAUDE.md`.

**Files:**
- Modify: `core/domain/src/commonMain/kotlin/com/velosobr/passarim/core/domain/KidsAvailabilityRepository.kt`
- Modify: `feature/explore/data/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/data/RemoteKidsAvailabilityRepository.kt`
- Test: `feature/explore/data/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/data/RemoteKidsAvailabilityRepositoryTest.kt`

**Interfaces:**
- Nenhuma mudança de código.

- [ ] **Step 1: Atualizar os comentários**

Substitua o conteúdo de `feature/explore/data/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/data/RemoteKidsAvailabilityRepositoryTest.kt`:

```kotlin
// Testes da checagem do Passarim Kids: o pedido feito ao BFF, a regra da soma
// das contagens por bioma principal e os erros de rede. O MockEngine do Ktor
// faz o papel do BFF: cada teste diz o que ele responde, sem rede de verdade.
// runTest roda o corpo do teste numa coroutine de teste, o que permite chamar
// a função suspend checkKidsAvailability() direto, sem esperar tempo real.

package com.velosobr.passarim.feature.explore.data

import assertk.assertThat
import assertk.assertions.isEqualTo
import com.velosobr.passarim.core.data.createHttpClient
import com.velosobr.passarim.core.domain.AppConfig
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.Result
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandleScope
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test

/**
 * Os corpos abaixo imitam o BFF com e sem a frente B. json é uma extension
 * function de MockRequestHandleScope (o "this" dentro do bloco do
 * MockEngine): responde 200 com o corpo dado e o Content-Type de JSON.
 */
class RemoteKidsAvailabilityRepositoryTest {
    private val config = AppConfig(isDebug = false, baseUrl = "http://localhost:8080", mediaHostOverride = null, versionName = "1.0.0")

    private val withKids =
        """
        {"biomes":[],"states":[],
         "primaryBiomes":[{"code":"cerrado","label":"Cerrado","speciesCount":11},{"code":"pampa","label":"Pampa","speciesCount":2}]}
        """.trimIndent()

    // O BFF de antes da frente B ignora o ?audience=kids e não manda primaryBiomes.
    private val oldBff =
        """
        {"biomes":[{"code":"cerrado","label":"Cerrado","speciesCount":26}],"states":[{"code":"SP","speciesCount":29}]}
        """.trimIndent()

    private val noKidsBirds =
        """
        {"biomes":[],"states":[],
         "primaryBiomes":[{"code":"cerrado","label":"Cerrado","speciesCount":0},{"code":"pampa","label":"Pampa","speciesCount":0}]}
        """.trimIndent()

    private fun MockRequestHandleScope.json(body: String) =
        respond(body, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))

    private fun repository(engine: MockEngine) = RemoteKidsAvailabilityRepository(createHttpClient(engine, config))

    @Test
    fun `pede GET v1 filters com audience kids`() =
        runTest {
            var seenUrl = ""
            var seenMethod: HttpMethod? = null
            val engine =
                MockEngine { request ->
                    seenUrl = request.url.toString()
                    seenMethod = request.method
                    json(withKids)
                }

            repository(engine).checkKidsAvailability()

            assertThat(seenUrl).isEqualTo("http://localhost:8080/v1/filters?audience=kids")
            assertThat(seenMethod).isEqualTo(HttpMethod.Get)
        }

    @Test
    fun `disponivel quando a soma por bioma principal passa de zero`() =
        runTest {
            val result = repository(MockEngine { json(withKids) }).checkKidsAvailability()

            assertThat(result).isEqualTo(Result.Success(true))
        }

    @Test
    fun `indisponivel com um BFF sem primaryBiomes`() =
        runTest {
            val result = repository(MockEngine { json(oldBff) }).checkKidsAvailability()

            assertThat(result).isEqualTo(Result.Success(false))
        }

    @Test
    fun `indisponivel quando a soma e zero`() =
        runTest {
            val result = repository(MockEngine { json(noKidsBirds) }).checkKidsAvailability()

            assertThat(result).isEqualTo(Result.Success(false))
        }

    @Test
    fun `erro do servidor vira DataError Network`() =
        runTest {
            val engine = MockEngine { respond("", HttpStatusCode.ServiceUnavailable, headersOf(HttpHeaders.ContentType, "text/plain")) }

            val result = repository(engine).checkKidsAvailability()

            assertThat(result).isEqualTo(Result.Failure(DataError.Network.ServiceUnavailable))
        }

    // Um BFF que não aceita o audience=kids responde 400 em problem+json com o
    // code INVALID_PARAMETER. Para o app, isso é um BFF sem Kids: tentar de
    // novo não resolveria, então o Kids fica escondido em vez de virar erro.
    @Test
    fun `audience recusado pelo BFF esconde o Kids`() =
        runTest {
            val engine =
                MockEngine {
                    respond(
                        """{"status":400,"code":"INVALID_PARAMETER","errors":[{"field":"audience","reason":"use adult ou kids"}]}""",
                        HttpStatusCode.BadRequest,
                        headersOf(HttpHeaders.ContentType, "application/problem+json"),
                    )
                }

            val result = repository(engine).checkKidsAvailability()

            assertThat(result).isEqualTo(Result.Success(false))
        }

    @Test
    fun `sem rede vira NoConnection`() =
        runTest {
            val result = repository(MockEngine { error("sem rede") }).checkKidsAvailability()

            assertThat(result).isEqualTo(Result.Failure(DataError.Network.NoConnection))
        }

    @Test
    fun `cada checagem vai ao BFF sem cache`() =
        runTest {
            var calls = 0
            val repo =
                repository(
                    MockEngine {
                        calls++
                        json(withKids)
                    },
                )

            repo.checkKidsAvailability()
            repo.checkKidsAvailability()

            assertThat(calls).isEqualTo(2)
        }
}
```

Substitua o conteúdo de `core/domain/src/commonMain/kotlin/com/velosobr/passarim/core/domain/KidsAvailabilityRepository.kt`:

```kotlin
// O contrato para saber se o BFF tem o Passarim Kids. Fica no core:domain
// porque quem pergunta (a Escolha e as Configurações, na frente D) não deve
// depender do módulo que responde (o feature:explore:data, que já fala com o
// /v1/filters). Assim, a apresentação só conhece esta interface, e os testes
// trocam a resposta por uma falsa.

package com.velosobr.passarim.core.domain

/**
 * Pergunta ao BFF se o Kids está disponível. A resposta não é gravada: cada
 * tela que precisa dela chama de novo ao abrir, porque o catálogo pode ganhar
 * (ou perder) as aves do Kids entre uma abertura e outra.
 */
interface KidsAvailabilityRepository {
    /**
     * true quando o BFF tem aves para o Kids; false quando o BFF não conhece o
     * Kids (anterior à frente B, ou que recusa o pedido do Kids como parâmetro
     * inválido) ou não tem nenhuma ave para ele. Falha quando não deu para
     * perguntar (sem rede, BFF fora do ar etc.) ou quando a resposta veio
     * num formato que o app não entende, e aí a tela decide o que mostrar,
     * como o "Tentar de novo".
     *
     * É "suspend" porque espera a resposta da rede: a função pode pausar sem
     * travar a tela (roda numa coroutine) e só pode ser chamada de dentro de
     * outra função suspend ou de uma coroutine. O Result<Boolean,
     * DataError.Network> obriga quem chama a tratar os dois casos: o
     * Success traz o true/false, e o Failure traz o erro de rede tipado.
     */
    suspend fun checkKidsAvailability(): Result<Boolean, DataError.Network>
}
```

Substitua o conteúdo de `feature/explore/data/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/data/RemoteKidsAvailabilityRepository.kt`:

```kotlin
// A checagem do Passarim Kids no BFF. Mora no feature:explore:data porque
// reaproveita o HttpClient e o FiltersDto do /v1/filters (no
// RemoteFiltersRepository.kt), em vez de criar um módulo core só para isso.

package com.velosobr.passarim.feature.explore.data

import com.velosobr.passarim.core.data.safeCall
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.KidsAvailabilityRepository
import com.velosobr.passarim.core.domain.Result
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.parameter

/**
 * `GET /v1/filters?audience=kids`: o Kids está disponível quando a soma das
 * contagens por bioma principal (`primaryBiomes`) passa de zero.
 *
 * - Um BFF de antes da frente B ignora o `audience` e não manda
 *   `primaryBiomes`; o FiltersDto lê o campo ausente como lista vazia, a soma
 *   dá zero, e o Kids fica escondido.
 * - Um catálogo sem aves para o Kids manda as contagens zeradas: também
 *   escondido, para o Kids não abrir vazio.
 * - Um BFF que recusa o `audience=kids` (400 com o code INVALID_PARAMETER)
 *   também não tem o Kids: vira false, e não falha, porque tentar de novo
 *   daria a mesma recusa e a tela mostraria um "Tentar de novo" inútil.
 *
 * De propósito, não passa pelo cache em memória do RemoteFiltersRepository:
 * aquele cache guarda os filtros do adulto (sem `audience`), e a resposta
 * daqui tem de ser a de agora, a cada abertura da Escolha ou das Configurações.
 */
class RemoteKidsAvailabilityRepository(
    private val client: HttpClient,
) : KidsAvailabilityRepository {
    // safeCall faz o pedido e nunca lança: uma resposta de erro vira Failure
    // com o erro do code do problem+json (ou do status HTTP), e uma falha de
    // transporte (sem rede, prazo estourado) vira Failure também. No sucesso,
    // converte o JSON no FiltersDto. parameter("audience", "kids") acrescenta
    // ?audience=kids na URL. O when olha os dois casos do Result: no Success,
    // sumOf soma o speciesCount de cada bioma principal; no Failure, só a
    // recusa do parâmetro vira false, e os outros erros seguem como estão.
    override suspend fun checkKidsAvailability(): Result<Boolean, DataError.Network> =
        when (val result = safeCall<FiltersDto> { client.get("/v1/filters") { parameter("audience", "kids") } }) {
            is Result.Success -> Result.Success(result.data.primaryBiomes.sumOf { it.speciesCount } > 0)
            is Result.Failure -> if (result.error == DataError.Network.InvalidParameter) Result.Success(false) else result
        }
}
```

- [ ] **Step 2: Rodar e ver passar**

Run: `./gradlew :feature:explore:data:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 3: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:explore:data:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 4: Commit**

A mensagem termina com as linhas de atribuição da sessão (Global Constraints).

```bash
git add -A
git commit -F - <<'EOF'
fix: comentários didáticos da checagem do Kids

Explica suspend e Result na interface, o safeCall, o parameter, o when
sobre o Result e o sumOf na implementação, e o runTest e o
MockRequestHandleScope no teste (revisão M3).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb
EOF
```


## Fechamento

### Task 8: Verificação final e PR

- [ ] **Step 1: Check como o CI**

Run: `./gradlew ktlintCheck detekt allTests :snapshots:verifyPaparazziDebug :androidApp:assembleDebug --continue`

Expected: `BUILD SUCCESSFUL`. Nenhum snapshot muda: este PR não tem tela. Com o Xcode 16.2, só os dois `linkDebugTestIosSimulatorArm64` (`:app` e `:feature:detail:presentation`) falham com `_LocationEssentials`, como na Task 0; qualquer outra falha é do PR.

- [ ] **Step 2: Push e PR, sem merge**

```bash
git push -u origin feat/d-jornada-dados
gh pr create --base feat/e1-explorar --head feat/d-jornada-dados --title 'Frente D (PR 2): jornada nas preferências e checagem do Kids'
```

A descrição aponta para a spec (docs #28) e para o PR deste plano, e lembra que a base muda para a `main` quando o app #36 entrar.

## Próximo plano

O PR 3 da frente D (apresentação) consome o que este plano entrega: o `Settings.journey` e o `setJourney` na raiz, na Escolha, na trava e nas Configurações; a `KidsAvailabilityRepository` nos quatro estados do cartão Kids e na seção "Para crianças". O plano dele complementa este.

## Ledger da revisão final

Revisor: agente Opus independente, sobre o app #38 (Tasks 1 a 3) e a primeira versão deste plano. Critical: nenhum. Important: nenhum.

| Achado | O que era | Situação |
|---|---|---|
| M1 | Um 400 `INVALID_PARAMETER` virava falha e contradizia o KDoc | Corrigido na Task 4: vira `Success(false)`, com teste problem+json 400 e KDoc coerente |
| M2 | O teste do valor desconhecido não conferia as outras chaves | Corrigido na Task 5: compara as `Settings` inteiras e confere o sentido contrário |
| M3 | Conceitos sem explicação na primeira vez no arquivo | Corrigido na Task 7 |
| M4 | O plano mandava esperar `BUILD SUCCESSFUL` no `allTests`, que falha nesta máquina no link do iOS | Corrigido no texto: nota e `--continue` na Task 0 e na Task 8 |
| M5 | Nenhum tratamento de arquivo corrompido ou `IOException` no DataStore (legado, pesa no PR 3) | Corrigido na Task 6 |
| M6 | Os `git commit -m` do plano saíam sem o rodapé de atribuição | Corrigido no texto: cada Task faz o commit com a mensagem inteira, rodapé incluído |

