# Frente E1 — Explorar em mosaico, "Ave do dia" e barra flutuante: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o E1 da frente E: o app passa a ler o `primaryBiome`, o `/v1/featured` e o `primaryBiomes` do BFF; o Explorar vira o mosaico do PiuDS com o total de aves, os chips de bioma e a "Ave do dia" (o canto abre o Detalhe tocando); as abas do adulto ganham a barra flutuante com desfoque.

**Architecture:**
- **Um PR no `passarim-app` (`feat/e1-explorar`, sobre `main`)**, de baixo para cima: dados no `core:domain`, `core:data` e `feature:explore:data` (Tasks 1 a 3), o `ExploreViewModel` (Task 4), a tela em mosaico (Task 5), o `autoPlay` do Detalhe (Task 6) e a barra flutuante nas abas (Task 7). A Task 8 é a correção da revisão final.
- **Este plano** vai num PR do `passarim-docs` (`docs/plano-frente-e1-explorar`). Foi gerado dos commits do app #36 e provado por replay: aplicado tarefa por tarefa numa worktree limpa, reproduz a árvore de cada commit.
- O Detalhe novo (foto de ponta a ponta, forma de onda, transição) é o E2; Favoritos e Configurações, o E3. Aqui eles só reservam o espaço da barra.

**Tech Stack:** Kotlin 2.4.21, Compose Multiplatform 1.12.2, Navigation Compose 2.10.0 (rotas tipadas), Lifecycle 2.11.0 (`SavedStateHandle`), Koin 4.2.2, Ktor 3.6.1 (`MockEngine` nos testes), kotlinx-serialization, Coil 3.6.3, Haze 2.0.1 (só dentro do `PiuBlurSurface`), Paparazzi 2.0.0-alpha05.1, assertk, Turbine.

**Spec:** `passarim-docs/docs/superpowers/specs/2026-11-08-passarim-frente-e-adulto-design.md` (docs #29), seções 2 (dados), 3 (Explorar), 4 (barra flutuante), 5 (`autoPlay`), 8 (testes) e 9 (ordem de entrega). Componentes: plano C2 (`2026-11-07-passarim-frente-c2-componentes.md`) e `docs/design/piuds/README.md`. Prancheta: `docs/design/direcoes-2026/canvas/Explorar.dc.html`.

## Global Constraints

- **Comentários didáticos em português** em todo código novo ou alterado (regra do `~/dev/passarim/CLAUDE.md`): todo arquivo começa dizendo o seu papel; conceitos aparecem explicados na primeira vez no arquivo (`LazyVerticalStaggeredGrid`, `StaggeredGridItemSpan.FullLine`, `snapshotFlow`, `rememberUpdatedState`, `WindowInsets.navigationBars`, `SavedStateHandle`); mudou o código, atualiza o comentário.
- **Idioma:** identificadores em inglês; comentários, KDoc, commits e PRs em português do Brasil. Nomes de teste em português entre crases, **sem acento e sem vírgula** (o Kotlin/Native não aceita vírgula no nome).
- **Identidade do Git:** `velosobr <linoc.veloso@gmail.com>`. Commits terminam com as linhas de atribuição da sessão.
- **JDK 21** (`export JAVA_HOME=$(/usr/libexec/java_home -v 21)`).
- **Camadas:** modelo de domínio sem `@Serializable`. Os DTOs (`SpeciesSummaryDto`, `FeaturedDto`, `FiltersDto`) ficam no `feature:explore:data`, com o `toDomain()` ao lado.
- **Nomes de método com substantivo:** `getFeaturedSpecies`, nunca `get`/`fetch`/`load` sozinhos numa interface de repositório.
- **Compatível com o BFF antigo:** todo campo novo do contrato tem valor padrão no DTO (`primaryBiome = null`, `primaryBiomes = emptyList()`, `audio = null`); um bioma desconhecido vira `null`, nunca erro.
- **Navegação só liga:** o bloco de rota do `NavHost` (abas e raiz) pega o ViewModel, repassa callbacks e navega. Nunca `LaunchedEffect`, `collect` ou `DisposableEffect` ali. Os eventos de uma vez seguem pelo `ObserveAsEvents` dentro do `ExploreRoot`, como já era.
- **Snapshots:** Piu em claro e escuro, cada um a 1.0×, 1.3× e 2.0×. Grave só a classe da tarefa (`--tests`) e abra cada imagem antes do commit. Os snapshots de hoje do Explorar são regravados (spec, seção 8), e o diff vai para o dono no PR.
- **Sem merge e sem push na `main`:** os merges são do dono.

## Review Focus

1. **A "Ave do dia" chegando depois da lista:** a grade guarda a posição pelo primeiro item visível; um card que entra acima dela nasceria fora da tela. O lugar é reservado desde o começo. Teste `enquanto a ave do dia carrega o lugar dela ja existe no topo` (Task 8).
2. **BFF antigo ou sem ave elegível:** sem `primaryBiome`, sem `primaryBiomes` e com `/v1/featured` respondendo 404 (`FEATURED_NOT_FOUND`), nada vira erro na tela: o card usa o gradiente do Pantanal, o título aparece sem a contagem e a "Ave do dia" some. Testes nas Tasks 1, 2, 3 e 4 (`se a ave do dia falhar o card nao aparece e nada vira erro`).
3. **Sem rede ao abrir:** quem abriu o app sem conexão e tocou em "Tentar novamente" ganha a "Ave do dia" junto com a lista; já um `NotFound` não é pedido de novo a cada filtro. Testes na Task 8.
4. **Chip de bioma marcado tocado de novo:** volta a "Todos" e mantém a UF escolhida no sheet. Testes `o chip de bioma aplica o filtro e tocar de novo volta a todos` e `o chip de bioma mantem a UF escolhida no sheet` (Task 4).
5. **O último card e a barra flutuante:** com o gesto de navegação do sistema, o fim da grade rola até acima da barra, e a barra não cobre a área do gesto. Conferido no aparelho (Task 7); a fonte a 2.0× passa a uma coluna (snapshots da Task 5).

## Decisões deste plano

Tomadas na montagem do PR, dentro do que a spec delega (as decisões da spec estão marcadas [DR] nela):

1. **O mosaico fica em `ExploreMosaic.kt`**, separado da `ExploreScreen`: a tela cuida do título, da busca, dos chips e dos estados; o mosaico, da "Ave do dia", dos cards e do rodapé de "carregando mais".
2. **`mosaicHeightFor` é uma função pura** (alto, baixo, baixo, alto), testada em `commonTest`, para as duas colunas ficarem desencontradas sem depender do layout.
3. **O `autoPlay` vai pela rota tipada** (`DetailRoute(id, autoPlay)`) e chega ao `DetailViewModel` pelo `SavedStateHandle` com a chave `KEY_AUTO_PLAY = "autoPlay"`, o nome do campo. Vale mesmo com a reprodução automática desligada nas Configurações.
4. **O `FEATURED_NOT_FOUND` do BFF vira `NotFound` no `safeCall`**, e o ViewModel usa esse erro para não pedir a "Ave do dia" de novo na sessão.
5. **Favoritos e Configurações só reservam o espaço da barra** (`padding`) até o E3; o Explorar recebe o espaço como `contentPadding` da grade, para os cards rolarem por baixo da barra desfocada.
6. **A altura reservada para a barra (`92.dp`: 68 da barra mais 24 de margem) fica no `TabsScreen`.** Ver o ledger: o número repete uma medida do PiuDS.

## Task 0: Preparação

- [ ] **Step 1: Branch**

```bash
cd passarim-app
git fetch origin
git checkout -b feat/e1-explorar origin/main
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
```

- [ ] **Step 2: Base verde**

Run: `./gradlew ktlintCheck detekt allTests :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 3: Back-end local**

Run: `../passarim-docs/env.scripts/status`

Expected: sai 0. As Tasks 1 a 3 não precisam dele (os testes usam o `MockEngine` do Ktor), mas é bom conferir os contratos reais antes de começar: `curl -s http://127.0.0.1:8090/v1/featured`, `curl -s http://127.0.0.1:8090/v1/filters` e `curl -s 'http://127.0.0.1:8090/v1/species?limit=2'`.

## Tasks
### Task 1: Bioma principal no resumo da ave

O BFF da frente B manda `primaryBiome` em cada item de `/v1/species`. O app passa a lê-lo: `SpeciesSummary.primaryBiome` é o gradiente do card enquanto a foto não chega (spec, seção 2). Nulo, ausente (BFF antigo) ou um bioma que o app não conhece viram `null`, e a lista nunca cai por causa dele.

**Files:**
- Modify: `core/domain/src/commonMain/kotlin/com/velosobr/passarim/core/domain/SpeciesSummary.kt`
- Modify: `feature/explore/data/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/data/RemoteExploreRepository.kt`
- Test: `feature/explore/data/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/data/RemoteExploreRepositoryTest.kt`

**Interfaces:**
- Produz: `SpeciesSummary(id, commonName, scientificName, thumbnailUrl: String?, primaryBiome: Biome? = null)` em `core:domain`.
- Produz: `internal fun SpeciesSummaryDto.toDomain(rewriter: MediaUrlRewriter): SpeciesSummary` em `feature:explore:data` (reusado pela "Ave do dia" na Task 2).
- Consome: `biomeOf(code: String?): Biome?` do C1.

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `feature/explore/data/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/data/RemoteExploreRepositoryTest.kt`:

```kotlin
// Testes do repositório da lista com o MockEngine do Ktor no lugar do BFF.

package com.velosobr.passarim.feature.explore.data

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import com.velosobr.passarim.core.data.MediaUrlRewriter
import com.velosobr.passarim.core.data.createHttpClient
import com.velosobr.passarim.core.domain.AppConfig
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.Result
import com.velosobr.passarim.core.domain.SpeciesSummary
import com.velosobr.passarim.feature.explore.domain.SpeciesPage
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.Url
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test

/** Os parâmetros chegam certos na URL e a resposta vira a página do domínio. */
class RemoteExploreRepositoryTest {
    private val page =
        """
        {"items":[
          {"id":"bem-te-vi","commonName":"Bem-te-vi","scientificName":"Pitangus sulphuratus",
           "thumbnailUrl":"http://localhost:8888/buckets/passarim-media/bem-te-vi/thumb.jpg","conservationStatus":"LC",
           "primaryBiome":"mata_atlantica"},
          {"id":"ararinha-azul","commonName":"Ararinha-azul","scientificName":"Cyanopsitta spixii",
           "thumbnailUrl":null,"conservationStatus":"EW","primaryBiome":null},
          {"id":"ave-nova","commonName":"Ave nova","scientificName":"Avis nova",
           "thumbnailUrl":null,"conservationStatus":"LC","primaryBiome":"marte"}
        ],"nextCursor":"c2"}
        """.trimIndent()

    /**
     * repo cria o repositório com um "servidor" que sempre responde [page];
     * [onRequest] recebe a URL de cada pedido e [mediaHostOverride] liga a troca de host.
     */
    private fun repo(
        mediaHostOverride: String? = null,
        onRequest: (Url) -> Unit = {},
    ): RemoteExploreRepository {
        val config =
            AppConfig(isDebug = false, baseUrl = "http://localhost:8080", mediaHostOverride = mediaHostOverride, versionName = "1.0.0")
        val engine =
            MockEngine { request ->
                onRequest(request.url)
                respond(page, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
            }
        return RemoteExploreRepository(createHttpClient(engine, config), MediaUrlRewriter(config))
    }

    @Test
    fun `manda busca filtros cursor e limite como query`() =
        runTest {
            var url: Url? = null
            repo { url = it }.list(query = "azul", biome = "cerrado", state = "SP", cursor = "c1")

            val params = url!!.parameters
            assertThat(url!!.encodedPath).isEqualTo("/v1/species")
            assertThat(params["q"]).isEqualTo("azul")
            assertThat(params["biome"]).isEqualTo("cerrado")
            assertThat(params["state"]).isEqualTo("SP")
            assertThat(params["cursor"]).isEqualTo("c1")
            assertThat(params["limit"]).isEqualTo("20")
        }

    @Test
    fun `busca vazia e filtros nulos nao vao na URL`() =
        runTest {
            var url: Url? = null
            repo { url = it }.list(query = "", biome = null, state = null, cursor = null)
            assertThat(url.toString()).isEqualTo("http://localhost:8080/v1/species?limit=20")
        }

    @Test
    fun `mapeia a pagina com thumbnail nulo o bioma principal e o proximo cursor`() =
        runTest {
            val result = repo().list(query = "", biome = null, state = null, cursor = null)
            assertThat(result).isEqualTo(
                Result.Success(
                    SpeciesPage(
                        items =
                            listOf(
                                SpeciesSummary(
                                    "bem-te-vi",
                                    "Bem-te-vi",
                                    "Pitangus sulphuratus",
                                    "http://localhost:8888/buckets/passarim-media/bem-te-vi/thumb.jpg",
                                    primaryBiome = Biome.MATA_ATLANTICA,
                                ),
                                // Sem bioma principal e com um bioma que o app não conhece: os dois viram nulo.
                                SpeciesSummary("ararinha-azul", "Ararinha-azul", "Cyanopsitta spixii", null),
                                SpeciesSummary("ave-nova", "Ave nova", "Avis nova", null),
                            ),
                        nextCursor = "c2",
                    ),
                ),
            )
        }

    @Test
    fun `o MediaUrlRewriter e aplicado ao thumbnail`() =
        runTest {
            val result = repo(mediaHostOverride = "10.0.2.2").list(query = "", biome = null, state = null, cursor = null)
            val items = (result as Result.Success).data.items
            assertThat(items[0].thumbnailUrl).isEqualTo("http://10.0.2.2:8888/buckets/passarim-media/bem-te-vi/thumb.jpg")
            assertThat(items[1].thumbnailUrl).isNull()
        }

    @Test
    fun `propaga o erro do safeCall`() =
        runTest {
            val config = AppConfig(isDebug = false, baseUrl = "http://localhost:8080", mediaHostOverride = null, versionName = "1.0.0")
            val engine =
                MockEngine { respond("404 page not found", HttpStatusCode.NotFound, headersOf(HttpHeaders.ContentType, "text/plain")) }
            val result = RemoteExploreRepository(createHttpClient(engine, config), MediaUrlRewriter(config)).list("", null, null, null)
            assertThat(result).isEqualTo(Result.Failure(DataError.Network.ServiceUnavailable))
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:explore:data:testAndroidHostTest`

Expected: FAIL na compilação: `No parameter with name 'primaryBiome' found`.

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `core/domain/src/commonMain/kotlin/com/velosobr/passarim/core/domain/SpeciesSummary.kt`:

```kotlin
// Domínio compartilhado do app: o resumo de uma espécie, usado por várias
// features. O módulo core:domain é Kotlin puro (sem Android, sem iOS, sem
// rede), por isso compila para todas as plataformas e é fácil de testar.

package com.velosobr.passarim.core.domain

/**
 * Resumo de uma espécie, como aparece nos cards de Explorar e na lista de Favoritos.
 * [thumbnailUrl] é nulo quando a espécie ainda não tem foto (o card mostra o placeholder).
 * [primaryBiome] é o bioma principal da ave (o "mundo" no Kids): dá a cor do card enquanto a
 * foto não chega. Nulo quando o catalog ainda não tem esse dado (o card usa um gradiente padrão).
 *
 * "data class" é uma classe feita para guardar dados: o Kotlin gera sozinho
 * equals, hashCode, toString e copy a partir das propriedades. O "?" em
 * String? diz que o valor pode ser null; sem ele, o compilador proíbe null.
 */
data class SpeciesSummary(
    val id: String,
    val commonName: String,
    val scientificName: String,
    val thumbnailUrl: String?,
    val primaryBiome: Biome? = null,
)
```

Substitua o conteúdo de `feature/explore/data/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/data/RemoteExploreRepository.kt`:

```kotlin
// A lista do Explorar vinda do BFF: os DTOs, a conversão para o domínio e o
// repositório.

package com.velosobr.passarim.feature.explore.data

import com.velosobr.passarim.core.data.MediaUrlRewriter
import com.velosobr.passarim.core.data.safeCall
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.Result
import com.velosobr.passarim.core.domain.SpeciesSummary
import com.velosobr.passarim.core.domain.biomeOf
import com.velosobr.passarim.core.domain.map
import com.velosobr.passarim.feature.explore.domain.ExploreRepository
import com.velosobr.passarim.feature.explore.domain.SpeciesPage
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import kotlinx.serialization.Serializable

/**
 * O contrato também traz `conservationStatus`; os cards não o mostram, então o DTO o ignora.
 * `primaryBiome` só existe a partir da frente B do BFF: num BFF antigo ele falta e fica nulo.
 */
@Serializable
internal data class SpeciesSummaryDto(
    val id: String,
    val commonName: String,
    val scientificName: String,
    val thumbnailUrl: String? = null,
    val primaryBiome: String? = null,
)

/** Uma página da resposta; nextCursor ausente vira null (última página). */
@Serializable
internal data class SpeciesPageDto(
    val items: List<SpeciesSummaryDto>,
    val nextCursor: String? = null,
)

/**
 * Converte o resumo no domínio, trocando o host da miniatura em debug. biomeOf devolve null para um
 * bioma que o app não conhece (um bioma novo no BFF não derruba a lista).
 */
internal fun SpeciesSummaryDto.toDomain(rewriter: MediaUrlRewriter) =
    SpeciesSummary(id, commonName, scientificName, rewriter.rewrite(thumbnailUrl), biomeOf(primaryBiome))

/** Converte a página no domínio. */
internal fun SpeciesPageDto.toDomain(rewriter: MediaUrlRewriter) =
    SpeciesPage(
        items = items.map { it.toDomain(rewriter) },
        nextCursor = nextCursor,
    )

/**
 * `GET /v1/species`. Parâmetros nulos ficam fora da URL: o `parameter` do Ktor ignora null (o BFF recusa `biome=` vazio).
 * A busca nunca é nula, por isso é a única que precisa do if para ficar fora quando está em branco.
 */
class RemoteExploreRepository(
    private val client: HttpClient,
    private val rewriter: MediaUrlRewriter,
) : ExploreRepository {
    override suspend fun list(
        query: String,
        biome: String?,
        state: String?,
        cursor: String?,
        limit: Int,
    ): Result<SpeciesPage, DataError.Network> =
        safeCall<SpeciesPageDto> {
            client.get("/v1/species") {
                if (query.isNotBlank()) parameter("q", query)
                parameter("biome", biome)
                parameter("state", state)
                parameter("cursor", cursor)
                parameter("limit", limit)
            }
        }.map { it.toDomain(rewriter) }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :feature:explore:data:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:explore:data:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m 'feat: bioma principal no resumo da ave, lido da lista do BFF'
```

### Task 2: "Ave do dia" no domínio e no repositório do Explorar

`GET /v1/featured` vira `FeaturedRepository.getFeaturedSpecies()`. O resumo da ave é convertido pelo mesmo `toDomain` da lista; o áudio só importa para saber se há canto. Sem ave elegível, o BFF responde 404 com o código `FEATURED_NOT_FOUND`, que o `safeCall` passa a traduzir em `NotFound`. Sem cache no app: o BFF manda `Cache-Control` até a meia-noite de São Paulo.

**Files:**
- Modify: `core/data/src/commonMain/kotlin/com/velosobr/passarim/core/data/SafeCall.kt`
- Test: `core/data/src/commonTest/kotlin/com/velosobr/passarim/core/data/SafeCallTest.kt`
- Create: `core/domain/src/commonMain/kotlin/com/velosobr/passarim/core/domain/Featured.kt`
- Modify: `feature/explore/data/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/data/ExploreDataModule.kt`
- Create: `feature/explore/data/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/data/RemoteFeaturedRepository.kt`
- Create (test): `feature/explore/data/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/data/RemoteFeaturedRepositoryTest.kt`

**Interfaces:**
- Produz: `data class FeaturedSpecies(date: String, species: SpeciesSummary, hasSong: Boolean)` e `interface FeaturedRepository { suspend fun getFeaturedSpecies(): Result<FeaturedSpecies, DataError.Network> }` em `core:domain`.
- Produz: `class RemoteFeaturedRepository(client: HttpClient, rewriter: MediaUrlRewriter) : FeaturedRepository`, registrado no `exploreDataModule`.
- Consome: `SpeciesSummaryDto.toDomain` (Task 1).

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `core/data/src/commonTest/kotlin/com/velosobr/passarim/core/data/SafeCallTest.kt`:

```kotlin
// Testes do safeCall com o MockEngine do Ktor, que responde no lugar do BFF
// sem rede. runTest (das coroutines) roda funções suspend dentro do teste.

package com.velosobr.passarim.core.data

import assertk.assertThat
import assertk.assertions.isEqualTo
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.Result
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandler
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.HttpRequestTimeoutException
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.Serializable
import kotlin.test.Test

/** Cada tipo de resposta e de falha vira o Result esperado. */
class SafeCallTest {
    /** Pong é um DTO mínimo para testar a leitura do corpo. */
    @Serializable
    private data class Pong(
        val message: String,
    )

    /** client cria um HttpClient cujo "servidor" é a função handler. */
    private fun client(handler: MockRequestHandler) = HttpClient(MockEngine(handler)) { install(ContentNegotiation) { json(bffJson) } }

    private suspend fun call(handler: MockRequestHandler): Result<Pong, DataError.Network> =
        client(handler).let { c -> safeCall<Pong> { c.get("http://localhost/ping") } }

    /** problem responde um erro em problem+json com o code dado. */
    private fun problem(
        code: String,
        status: HttpStatusCode,
        extra: Map<String, String> = emptyMap(),
    ): MockRequestHandler =
        {
            respond(
                content = """{"type":"urn:x","title":"t","status":${status.value},"code":"$code","requestId":"r"}""",
                status = status,
                headers =
                    headersOf(
                        HttpHeaders.ContentType to listOf("application/problem+json"),
                        *extra.map { it.key to listOf(it.value) }.toTypedArray(),
                    ),
            )
        }

    /** plain responde um erro em texto puro, como um proxy faria. */
    private fun plain(
        status: HttpStatusCode,
        body: String = "",
    ): MockRequestHandler =
        {
            respond(content = body, status = status, headers = headersOf(HttpHeaders.ContentType, "text/plain"))
        }

    @Test
    fun `sucesso devolve o corpo decodificado`() =
        runTest {
            val result =
                call {
                    respond("""{"message":"oi","extra":1}""", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
                }
            assertThat(result).isEqualTo(Result.Success(Pong("oi")))
        }

    @Test
    fun `cada code do problem+json vira o erro certo`() =
        runTest {
            val table =
                mapOf(
                    "SPECIES_NOT_FOUND" to DataError.Network.NotFound,
                    "FEATURED_NOT_FOUND" to DataError.Network.NotFound,
                    "NOT_FOUND" to DataError.Network.NotFound,
                    "INVALID_PARAMETER" to DataError.Network.InvalidParameter,
                    "METHOD_NOT_ALLOWED" to DataError.Network.InvalidParameter,
                    "SERVICE_UNAVAILABLE" to DataError.Network.ServiceUnavailable,
                    "INTERNAL" to DataError.Network.Internal,
                    "ALGO_NOVO" to DataError.Network.Unknown,
                )
            for ((code, expected) in table) {
                assertThat(call(problem(code, HttpStatusCode.BadRequest))).isEqualTo(Result.Failure(expected))
            }
        }

    @Test
    fun `RATE_LIMITED le o Retry-After`() =
        runTest {
            val r = call(problem("RATE_LIMITED", HttpStatusCode.TooManyRequests, mapOf("Retry-After" to "30")))
            assertThat(r).isEqualTo(Result.Failure(DataError.Network.RateLimited(30)))
        }

    @Test
    fun `RATE_LIMITED sem Retry-After valido fica nulo`() =
        runTest {
            val r = call(problem("RATE_LIMITED", HttpStatusCode.TooManyRequests, mapOf("Retry-After" to "amanha")))
            assertThat(r).isEqualTo(Result.Failure(DataError.Network.RateLimited(null)))
        }

    @Test
    fun `404 em texto puro do proxy nunca vira NotFound`() =
        runTest {
            val r = call(plain(HttpStatusCode.NotFound, "404 page not found"))
            assertThat(r).isEqualTo(Result.Failure(DataError.Network.ServiceUnavailable))
        }

    @Test
    fun `status de proxy sem problem+json`() =
        runTest {
            val table =
                mapOf(
                    HttpStatusCode.BadGateway to DataError.Network.ServiceUnavailable,
                    HttpStatusCode.ServiceUnavailable to DataError.Network.ServiceUnavailable,
                    HttpStatusCode.GatewayTimeout to DataError.Network.ServiceUnavailable,
                    HttpStatusCode.InternalServerError to DataError.Network.Internal,
                    HttpStatusCode.BadRequest to DataError.Network.Unknown,
                )
            for ((status, expected) in table) {
                assertThat(call(plain(status))).isEqualTo(Result.Failure(expected))
            }
        }

    @Test
    fun `problem+json com corpo invalido cai na classificacao por status`() =
        runTest {
            val r =
                call {
                    respond("nao e json", HttpStatusCode.ServiceUnavailable, headersOf(HttpHeaders.ContentType, "application/problem+json"))
                }
            assertThat(r).isEqualTo(Result.Failure(DataError.Network.ServiceUnavailable))
        }

    @Test
    fun `timeout do Ktor vira Timeout`() =
        runTest {
            val r = call { throw HttpRequestTimeoutException("http://localhost/ping", 1_000) }
            assertThat(r).isEqualTo(Result.Failure(DataError.Network.Timeout))
        }

    @Test
    fun `falha de transporte vira NoConnection`() =
        runTest {
            val r = call { throw IllegalStateException("sem rede") }
            assertThat(r).isEqualTo(Result.Failure(DataError.Network.NoConnection))
        }

    @Test
    fun `200 com corpo invalido vira Unknown`() =
        runTest {
            val r =
                call {
                    respond("""{"outra":"coisa"}""", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
                }
            assertThat(r).isEqualTo(Result.Failure(DataError.Network.Unknown))
        }

    @Test
    fun `corpo de sucesso pode ser lido com body direto`() =
        runTest {
            val c = client { respond("""{"message":"x"}""", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json")) }
            assertThat(c.get("http://localhost/ping").body<Pong>()).isEqualTo(Pong("x"))
        }
}
```

Crie `feature/explore/data/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/data/RemoteFeaturedRepositoryTest.kt`:

```kotlin
// Testes do repositório da "Ave do dia" com o MockEngine do Ktor no lugar do
// BFF: o caminho pedido, a conversão da resposta e o 404 de quando não há ave.

package com.velosobr.passarim.feature.explore.data

import assertk.assertThat
import assertk.assertions.isEqualTo
import com.velosobr.passarim.core.data.MediaUrlRewriter
import com.velosobr.passarim.core.data.createHttpClient
import com.velosobr.passarim.core.domain.AppConfig
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.FeaturedSpecies
import com.velosobr.passarim.core.domain.Result
import com.velosobr.passarim.core.domain.SpeciesSummary
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test

class RemoteFeaturedRepositoryTest {
    private val config = AppConfig(isDebug = false, baseUrl = "http://localhost:8080", mediaHostOverride = null, versionName = "1.0.0")

    /** repo cria o repositório com um "servidor" que responde [body] com [status] e guarda o caminho pedido. */
    private fun repo(
        body: String,
        status: HttpStatusCode = HttpStatusCode.OK,
        contentType: String = "application/json",
        onPath: (String) -> Unit = {},
    ): RemoteFeaturedRepository {
        val engine =
            MockEngine { request ->
                onPath(request.url.encodedPath)
                respond(body, status, headersOf(HttpHeaders.ContentType, contentType))
            }
        return RemoteFeaturedRepository(createHttpClient(engine, config), MediaUrlRewriter(config))
    }

    private val featured =
        """
        {"date":"2026-11-08",
         "species":{"id":"tuiuiu","commonName":"Tuiuiú","scientificName":"Jabiru mycteria",
           "thumbnailUrl":"http://localhost:8888/m/tuiuiu.jpg","conservationStatus":"LC","primaryBiome":"pantanal"},
         "audio":{"url":"http://localhost:8888/m/tuiuiu.mp3","durationMs":12000,
           "credit":{"author":"Fulano","license":"CC BY-NC","source":"xeno-canto","sourceUrl":"https://xeno-canto.org/1"}}}
        """.trimIndent()

    @Test
    fun `pede a ave do dia e converte a resposta`() =
        runTest {
            var path = ""
            val result = repo(featured) { path = it }.getFeaturedSpecies()
            assertThat(path).isEqualTo("/v1/featured")
            assertThat(result).isEqualTo(
                Result.Success(
                    FeaturedSpecies(
                        date = "2026-11-08",
                        species =
                            SpeciesSummary(
                                "tuiuiu",
                                "Tuiuiú",
                                "Jabiru mycteria",
                                "http://localhost:8888/m/tuiuiu.jpg",
                                Biome.PANTANAL,
                            ),
                        hasSong = true,
                    ),
                ),
            )
        }

    @Test
    fun `sem canto a ave do dia vem com hasSong falso`() =
        runTest {
            val semCanto =
                """
                {"date":"2026-11-08","audio":null,
                 "species":{"id":"seriema","commonName":"Seriema","scientificName":"Cariama cristata","thumbnailUrl":null}}
                """.trimIndent()
            val result = repo(semCanto).getFeaturedSpecies() as Result.Success<FeaturedSpecies>
            assertThat(result.data.hasSong).isEqualTo(false)
        }

    @Test
    fun `sem ave elegivel o 404 vira NotFound`() =
        runTest {
            val problem =
                """
                {"type":"urn:passarim:problem:featured-not-found","title":"Nenhuma ave do dia",
                 "status":404,"code":"FEATURED_NOT_FOUND"}
                """.trimIndent()
            // O BFF responde problem+json com o code FEATURED_NOT_FOUND.
            val result = repo(problem, HttpStatusCode.NotFound, contentType = "application/problem+json").getFeaturedSpecies()
            assertThat(result).isEqualTo(Result.Failure(DataError.Network.NotFound))
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew --continue :core:data:testAndroidHostTest :feature:explore:data:testAndroidHostTest`

Expected: FAIL na compilação do `feature:explore:data`: `Unresolved reference 'FeaturedSpecies'`, `'RemoteFeaturedRepository'` e `'getFeaturedSpecies'`; e, no `core:data`, `SafeCallTest > cada code do problem+json vira o erro certo FAILED` (`AssertionFailedError`: o `FEATURED_NOT_FOUND` ainda não vira `NotFound`).

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `core/data/src/commonMain/kotlin/com/velosobr/passarim/core/data/SafeCall.kt`:

```kotlin
// Chamada segura ao BFF: transforma respostas e falhas em Result.
//
// Capturar `Exception` aqui é proposital: qualquer falha de transporte vira um erro tipado do app
// (o cancelamento de coroutine é sempre relançado antes).
@file:Suppress("TooGenericExceptionCaught", "SwallowedException")

package com.velosobr.passarim.core.data

import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.Result
import io.ktor.client.call.body
import io.ktor.client.network.sockets.ConnectTimeoutException
import io.ktor.client.network.sockets.SocketTimeoutException
import io.ktor.client.plugins.HttpRequestTimeoutException
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.Serializable

/**
 * Executa uma chamada e devolve sempre um [Result] tipado; nunca lança (exceto cancelamento).
 *
 * Erros de transporte viram [DataError.Network.Timeout] ou [DataError.Network.NoConnection].
 * Respostas de erro viram o erro do `code` do problem+json do BFF; se a resposta **não** for
 * problem+json (um 404 em texto puro do Traefik com as réplicas paradas, por exemplo),
 * classifica pelo status HTTP.
 *
 * "reified" (só possível em funções inline) mantém o tipo T disponível em
 * tempo de execução, e é isso que permite response.body<T>() saber em que
 * classe converter o JSON. CancellationException é relançada porque é o
 * sinal de que a coroutine foi cancelada (a tela fechou); engoli-la deixaria
 * a coroutine rodando à toa.
 */
suspend inline fun <reified T> safeCall(execute: () -> HttpResponse): Result<T, DataError.Network> {
    val response =
        try {
            execute()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return Result.Failure(e.toNetworkError())
        }
    return if (response.status.isSuccess()) {
        try {
            Result.Success(response.body<T>())
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.Failure(DataError.Network.Unknown)
        }
    } else {
        Result.Failure(response.toNetworkError())
    }
}

/** O corpo de erro problem+json do BFF; só o `code` interessa ao app. */
@Serializable
internal data class ProblemDto(
    val code: String? = null,
)

/**
 * Falha de transporte: estouro de prazo vira Timeout; o resto (sem rede, DNS,
 * conexão recusada) vira NoConnection. @PublishedApi deixa uma função
 * internal ser usada dentro de uma função inline pública.
 */
@PublishedApi
internal fun Exception.toNetworkError(): DataError.Network =
    when (this) {
        is HttpRequestTimeoutException, is ConnectTimeoutException, is SocketTimeoutException -> DataError.Network.Timeout
        else -> DataError.Network.NoConnection
    }

/** Resposta de erro: lê o `code` do problem+json ou, sem ele, classifica pelo status. */
@PublishedApi
internal suspend fun HttpResponse.toNetworkError(): DataError.Network {
    val isProblem = contentType()?.match("application/problem+json") == true
    if (isProblem) {
        val code =
            try {
                bffJson.decodeFromString(ProblemDto.serializer(), bodyAsText()).code
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                null
            }
        if (code != null) return code.toNetworkError(headers[HttpHeaders.RetryAfter]?.toIntOrNull())
    }
    return status.value.toNetworkError()
}

/** Traduz o `code` estável do contrato do BFF no erro do app. */
private fun String.toNetworkError(retryAfterSeconds: Int?): DataError.Network =
    when (this) {
        // FEATURED_NOT_FOUND: o catalog não tem nenhuma ave elegível para a "Ave do dia".
        "SPECIES_NOT_FOUND", "FEATURED_NOT_FOUND", "NOT_FOUND" -> DataError.Network.NotFound
        "INVALID_PARAMETER", "METHOD_NOT_ALLOWED" -> DataError.Network.InvalidParameter
        "RATE_LIMITED" -> DataError.Network.RateLimited(retryAfterSeconds)
        "SERVICE_UNAVAILABLE" -> DataError.Network.ServiceUnavailable
        "INTERNAL" -> DataError.Network.Internal
        else -> DataError.Network.Unknown
    }

/**
 * Status sem problem+json: 404/502/503/504 costumam ser o Traefik sem réplica
 * do BFF no ar, então viram ServiceUnavailable; outro 5xx vira Internal; o
 * resto, Unknown.
 */
private fun Int.toNetworkError(): DataError.Network =
    when (this) {
        404, 502, 503, 504 -> DataError.Network.ServiceUnavailable
        in 500..599 -> DataError.Network.Internal
        else -> DataError.Network.Unknown
    }
```

Crie `core/domain/src/commonMain/kotlin/com/velosobr/passarim/core/domain/Featured.kt`:

```kotlin
// A "Ave do dia": a mesma ave o dia inteiro, para todo mundo, escolhida pelo
// catalog (frente B). O Explorar a mostra num card largo, em destaque.

package com.velosobr.passarim.core.domain

/**
 * A ave do dia. [date] é o dia dela no fuso de São Paulo ("2026-11-08"), [species] é o resumo de
 * sempre e [hasSong] diz se ela tem canto, para o card mostrar o botão de ouvir.
 */
data class FeaturedSpecies(
    val date: String,
    val species: SpeciesSummary,
    val hasSong: Boolean,
)

/**
 * Busca a ave do dia no BFF. Sem ave elegível, o BFF responde 404 e o resultado é
 * [DataError.Network.NotFound]; quem mostra o card some com ele em qualquer falha.
 */
interface FeaturedRepository {
    suspend fun getFeaturedSpecies(): Result<FeaturedSpecies, DataError.Network>
}
```

Substitua o conteúdo de `feature/explore/data/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/data/ExploreDataModule.kt`:

```kotlin
// Registro dos repositórios do Explorar no Koin.

package com.velosobr.passarim.feature.explore.data

import com.velosobr.passarim.core.domain.FeaturedRepository
import com.velosobr.passarim.core.domain.FiltersRepository
import com.velosobr.passarim.feature.explore.domain.ExploreRepository
import org.koin.dsl.module

/** Repositórios de Explorar (a lista, os filtros e a "Ave do dia"). O `HttpClient` e o `MediaUrlRewriter` vêm do `coreDataModule`. */
val exploreDataModule =
    module {
        single<ExploreRepository> { RemoteExploreRepository(get(), get()) }
        single<FiltersRepository> { RemoteFiltersRepository(get()) }
        single<FeaturedRepository> { RemoteFeaturedRepository(get(), get()) }
    }
```

Crie `feature/explore/data/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/data/RemoteFeaturedRepository.kt`:

```kotlin
// A "Ave do dia" vinda do BFF (GET /v1/featured): o DTO, a conversão para o
// domínio e o repositório. Sem cache aqui: o BFF manda Cache-Control até a
// meia-noite de São Paulo.

package com.velosobr.passarim.feature.explore.data

import com.velosobr.passarim.core.data.MediaUrlRewriter
import com.velosobr.passarim.core.data.safeCall
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.FeaturedRepository
import com.velosobr.passarim.core.domain.FeaturedSpecies
import com.velosobr.passarim.core.domain.Result
import com.velosobr.passarim.core.domain.map
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/**
 * O corpo de `GET /v1/featured`. O card só precisa saber se há canto, então o áudio fica como um
 * JsonObject qualquer (nulo quando a ave não tem canto).
 */
@Serializable
internal data class FeaturedDto(
    val date: String,
    val species: SpeciesSummaryDto,
    val audio: JsonObject? = null,
)

/** `GET /v1/featured`: a ave do dia, com o resumo convertido como o da lista. */
class RemoteFeaturedRepository(
    private val client: HttpClient,
    private val rewriter: MediaUrlRewriter,
) : FeaturedRepository {
    override suspend fun getFeaturedSpecies(): Result<FeaturedSpecies, DataError.Network> =
        safeCall<FeaturedDto> { client.get("/v1/featured") }
            .map { FeaturedSpecies(date = it.date, species = it.species.toDomain(rewriter), hasSong = it.audio != null) }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :core:data:testAndroidHostTest :feature:explore:data:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:data:testAndroidHostTest :feature:explore:data:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m 'feat: "Ave do dia" do BFF no domínio e no repositório do Explorar'
```

### Task 3: Total de aves pela contagem por bioma principal

O título do Explorar mostra "41 aves". Cada ave tem um só bioma principal, então a soma de `primaryBiomes` de `/v1/filters` é o total (spec, seção 2, [DR] 4). Sem o campo (BFF antigo) ou com tudo zerado, o total é nulo e o título aparece sem a contagem.

**Files:**
- Modify: `core/domain/src/commonMain/kotlin/com/velosobr/passarim/core/domain/Filters.kt`
- Create (test): `core/domain/src/commonTest/kotlin/com/velosobr/passarim/core/domain/FiltersTest.kt`
- Modify: `feature/explore/data/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/data/RemoteFiltersRepository.kt`
- Test: `feature/explore/data/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/data/RemoteFiltersRepositoryTest.kt`

**Interfaces:**
- Produz: `Filters(biomes, states, primaryBiomes: List<BiomeFilter> = emptyList())` com `val speciesTotal: Int?`.
- Produz: `FiltersDto.primaryBiomes` lido de `/v1/filters`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `core/domain/src/commonTest/kotlin/com/velosobr/passarim/core/domain/FiltersTest.kt`:

```kotlin
// Testes do total de aves que o Explorar mostra no título: a soma das
// contagens por bioma principal (cada ave tem um só bioma principal).

package com.velosobr.passarim.core.domain

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import kotlin.test.Test

class FiltersTest {
    private fun filters(primary: List<BiomeFilter>) = Filters(biomes = emptyList(), states = emptyList(), primaryBiomes = primary)

    @Test
    fun `o total e a soma das contagens por bioma principal`() {
        val primary = listOf(BiomeFilter("cerrado", "Cerrado", 7), BiomeFilter("pampa", "Pampa", 4))
        assertThat(filters(primary).speciesTotal).isEqualTo(11)
    }

    @Test
    fun `sem bioma principal o total fica nulo`() {
        // Um BFF de antes da frente B não manda primaryBiomes: o título aparece sem a contagem.
        assertThat(filters(emptyList()).speciesTotal).isNull()
    }

    @Test
    fun `com todas as contagens zeradas o total fica nulo`() {
        assertThat(filters(listOf(BiomeFilter("cerrado", "Cerrado", 0))).speciesTotal).isNull()
    }
}
```

Substitua o conteúdo de `feature/explore/data/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/data/RemoteFiltersRepositoryTest.kt`:

```kotlin
// Testes do repositório de filtros: a leitura do JSON e o cache em memória.

package com.velosobr.passarim.feature.explore.data

import assertk.assertThat
import assertk.assertions.isEqualTo
import com.velosobr.passarim.core.data.createHttpClient
import com.velosobr.passarim.core.domain.AppConfig
import com.velosobr.passarim.core.domain.BiomeFilter
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.Filters
import com.velosobr.passarim.core.domain.Result
import com.velosobr.passarim.core.domain.StateFilter
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandleScope
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test

/** A leitura do JSON e o cache em memória; ok responde os filtros e down um 503. */
class RemoteFiltersRepositoryTest {
    private val config = AppConfig(isDebug = false, baseUrl = "http://localhost:8080", mediaHostOverride = null, versionName = "1.0.0")

    private val body =
        """
        {"biomes":[{"code":"cerrado","label":"Cerrado","speciesCount":26}],
         "states":[{"code":"SP","speciesCount":29}]}
        """.trimIndent()

    private fun MockRequestHandleScope.ok() = respond(body, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))

    private fun MockRequestHandleScope.down() =
        respond("", HttpStatusCode.ServiceUnavailable, headersOf(HttpHeaders.ContentType, "text/plain"))

    private val expected = Filters(listOf(BiomeFilter("cerrado", "Cerrado", 26)), listOf(StateFilter("SP", 29)))

    @Test
    fun `busca GET v1 filters na base configurada e mapeia para o dominio`() =
        runTest {
            var seenUrl = ""
            var seenMethod: HttpMethod? = null
            val engine =
                MockEngine { request ->
                    seenUrl = request.url.toString()
                    seenMethod = request.method
                    ok()
                }
            val result = RemoteFiltersRepository(createHttpClient(engine, config)).get()

            assertThat(seenUrl).isEqualTo("http://localhost:8080/v1/filters")
            assertThat(seenMethod).isEqualTo(HttpMethod.Get)
            assertThat(result).isEqualTo(Result.Success(expected))
        }

    @Test
    fun `le a contagem por bioma principal quando o BFF a manda`() =
        runTest {
            val withPrimary =
                """
                {"biomes":[],"states":[],
                 "primaryBiomes":[{"code":"cerrado","label":"Cerrado","speciesCount":7},{"code":"pampa","label":"Pampa","speciesCount":4}]}
                """.trimIndent()
            val engine = MockEngine { respond(withPrimary, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json")) }
            val result = RemoteFiltersRepository(createHttpClient(engine, config)).get() as Result.Success<Filters>
            assertThat(result.data.primaryBiomes).isEqualTo(listOf(BiomeFilter("cerrado", "Cerrado", 7), BiomeFilter("pampa", "Pampa", 4)))
            assertThat(result.data.speciesTotal).isEqualTo(11)
        }

    @Test
    fun `propaga o erro de servidor`() =
        runTest {
            val result = RemoteFiltersRepository(createHttpClient(MockEngine { down() }, config)).get()
            assertThat(result).isEqualTo(Result.Failure(DataError.Network.ServiceUnavailable))
        }

    @Test
    fun `o sucesso fica em memoria e a segunda chamada nao vai a rede`() =
        runTest {
            var calls = 0
            val repo =
                RemoteFiltersRepository(
                    createHttpClient(
                        MockEngine {
                            calls++
                            ok()
                        },
                        config,
                    ),
                )

            repo.get()
            val second = repo.get()

            assertThat(calls).isEqualTo(1)
            assertThat(second).isEqualTo(Result.Success(expected))
        }

    @Test
    fun `a falha nao fica em memoria e a proxima chamada tenta de novo`() =
        runTest {
            var calls = 0
            val repo = RemoteFiltersRepository(createHttpClient(MockEngine { if (calls++ == 0) down() else ok() }, config))

            repo.get()
            val second = repo.get()

            assertThat(calls).isEqualTo(2)
            assertThat(second).isEqualTo(Result.Success(expected))
        }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew --continue :core:domain:testAndroidHostTest :feature:explore:data:testAndroidHostTest`

Expected: FAIL na compilação: `No parameter with name 'primaryBiomes' found` e `Unresolved reference 'speciesTotal'` (`FiltersTest`); `Unresolved reference 'primaryBiomes'` (`RemoteFiltersRepositoryTest`).

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `core/domain/src/commonMain/kotlin/com/velosobr/passarim/core/domain/Filters.kt`:

```kotlin
// Opções de filtro do Explorar e o contrato para buscá-las.

package com.velosobr.passarim.core.domain

/** Um bioma com o rótulo em português e quantas espécies tem. */
data class BiomeFilter(
    val code: String,
    val label: String,
    val speciesCount: Int,
)

/** Uma UF com quantas espécies tem. */
data class StateFilter(
    val code: String,
    val speciesCount: Int,
)

/**
 * Todas as opções de filtro. [primaryBiomes] conta as aves pelo bioma principal; como cada ave tem
 * um só bioma principal, a soma dessas contagens é o total de aves ([speciesTotal]). Um BFF de antes
 * da frente B não manda esse campo, e a lista fica vazia.
 */
data class Filters(
    val biomes: List<BiomeFilter>,
    val states: List<StateFilter>,
    val primaryBiomes: List<BiomeFilter> = emptyList(),
) {
    /** O total de aves do catálogo, ou null quando não dá para saber (sem contagem ou com tudo zerado). */
    val speciesTotal: Int?
        get() = primaryBiomes.sumOf { it.speciesCount }.takeIf { it > 0 }
}

/** Busca as opções de filtro no BFF. */
interface FiltersRepository {
    suspend fun get(): Result<Filters, DataError.Network>
}
```

Substitua o conteúdo de `feature/explore/data/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/data/RemoteFiltersRepository.kt`:

```kotlin
// As opções de filtro vindas do BFF, guardadas em memória depois da primeira
// resposta com sucesso.

package com.velosobr.passarim.feature.explore.data

import com.velosobr.passarim.core.data.safeCall
import com.velosobr.passarim.core.domain.BiomeFilter
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.Filters
import com.velosobr.passarim.core.domain.FiltersRepository
import com.velosobr.passarim.core.domain.Result
import com.velosobr.passarim.core.domain.StateFilter
import com.velosobr.passarim.core.domain.map
import com.velosobr.passarim.core.domain.onSuccess
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable

/**
 * O corpo de `GET /v1/filters`: biomas e UFs com contagem, e a contagem por bioma principal, que só
 * existe a partir da frente B do BFF (ausente, vira lista vazia).
 */
@Serializable
internal data class FiltersDto(
    val biomes: List<BiomeDto>,
    val states: List<StateDto>,
    val primaryBiomes: List<BiomeDto> = emptyList(),
)

/** Um bioma com o rótulo em português. */
@Serializable
internal data class BiomeDto(
    val code: String,
    val label: String,
    val speciesCount: Int,
)

/** Uma UF. */
@Serializable
internal data class StateDto(
    val code: String,
    val speciesCount: Int,
)

/** Converte os DTOs no domínio. */
internal fun FiltersDto.toDomain() =
    Filters(
        biomes = biomes.map { BiomeFilter(it.code, it.label, it.speciesCount) },
        states = states.map { StateFilter(it.code, it.speciesCount) },
        primaryBiomes = primaryBiomes.map { BiomeFilter(it.code, it.label, it.speciesCount) },
    )

/**
 * `GET /v1/filters`: biomas e estados com a contagem de espécies. As contagens mudam pouco, então o
 * primeiro sucesso fica em memória até o processo morrer; uma falha não fica, e a próxima chamada tenta de novo.
 */
class RemoteFiltersRepository(
    private val client: HttpClient,
) : FiltersRepository {
    // O Mutex (trava das coroutines) garante que duas chamadas simultâneas não
    // façam dois pedidos: a segunda espera a primeira e já encontra o cache.
    private val mutex = Mutex()
    private var cached: Filters? = null

    override suspend fun get(): Result<Filters, DataError.Network> =
        mutex.withLock {
            cached?.let { return@withLock Result.Success(it) }
            safeCall<FiltersDto> { client.get("/v1/filters") }
                .map { it.toDomain() }
                .onSuccess { cached = it }
        }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :core:domain:testAndroidHostTest :feature:explore:data:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :core:domain:testAndroidHostTest :feature:explore:data:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m 'feat: total de aves pela contagem por bioma principal dos filtros'
```

### Task 4: "Ave do dia", chips de bioma e o total no ViewModel do Explorar

O `ExploreViewModel` pede a "Ave do dia" ao abrir e a mostra só sem busca e sem filtro; qualquer falha só deixa o card de fora ([DR] 6). Os chips de bioma usam o filtro de bioma de hoje: tocar no marcado volta a "Todos", e a UF do sheet continua ([DR] 5). O card abre o Detalhe; o botão de canto abre o Detalhe tocando (`autoPlay`, [DR] 7). O `ExploreRoot` passa a repassar o `autoPlay`; até a Task 6, as abas o ignoram.

**Files:**
- Modify: `app/src/commonMain/kotlin/com/velosobr/passarim/app/tabs/TabsScreen.kt`
- Modify: `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreAction.kt`
- Modify: `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreRoot.kt`
- Modify: `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreState.kt`
- Modify: `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreViewModel.kt`
- Test: `feature/explore/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreFakes.kt`
- Test: `feature/explore/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreViewModelTest.kt`

**Interfaces:**
- Produz: `ExploreAction.SelectBiome(code: String?)`, `ExploreAction.OpenFeatured`, `ExploreAction.PlayFeatured` e `ExploreEvent.NavigateToDetail(id: String, autoPlay: Boolean = false)`.
- Produz: `ExploreState.featured: FeaturedSpecies?`, `showFeatured: Boolean` e `speciesTotal: Int?`.
- Muda: `ExploreViewModel(explore, filtersRepository, favorites, featuredRepository: FeaturedRepository, savedState)` e `ExploreRoot(onOpenDetail: (id: String, autoPlay: Boolean) -> Unit, onOpenFavorites)`.
- Consome: `FeaturedRepository` (Task 2) e `Filters.speciesTotal` (Task 3).

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `feature/explore/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreFakes.kt`:

```kotlin
// Repositórios falsos e dados de exemplo para os testes do ViewModel.

package com.velosobr.passarim.feature.explore.presentation

import com.velosobr.passarim.core.domain.BiomeFilter
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.FavoritesRepository
import com.velosobr.passarim.core.domain.FeaturedRepository
import com.velosobr.passarim.core.domain.FeaturedSpecies
import com.velosobr.passarim.core.domain.Filters
import com.velosobr.passarim.core.domain.FiltersRepository
import com.velosobr.passarim.core.domain.Result
import com.velosobr.passarim.core.domain.SpeciesSummary
import com.velosobr.passarim.core.domain.StateFilter
import com.velosobr.passarim.feature.explore.domain.ExploreRepository
import com.velosobr.passarim.feature.explore.domain.SpeciesPage
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf

/** bird cria uma ave de exemplo com o id dado. */
fun bird(id: String) = SpeciesSummary(id, "Ave $id", "Avis $id", thumbnailUrl = null)

/** Página com os ids `from..<to` (por exemplo `page(0, 20, "c1")`). */
fun page(
    from: Int,
    to: Int,
    next: String?,
) = SpeciesPage((from until to).map { bird("ave-$it") }, next)

/** ListCall é um pedido recebido pelo repositório falso, para o teste conferir. */
data class ListCall(
    val query: String,
    val biome: String?,
    val state: String?,
    val cursor: String?,
)

/**
 * Repositório falso: responde por cursor (`pages[null]` é a primeira página) e guarda cada chamada.
 * [gates] seguram a resposta de uma chamada (pelo índice) para observar estados intermediários.
 */
class FakeExploreRepository : ExploreRepository {
    val calls = mutableListOf<ListCall>()
    val pages = mutableMapOf<String?, Result<SpeciesPage, DataError.Network>>(null to Result.Success(page(0, 20, "c1")))
    val gates = mutableMapOf<Int, CompletableDeferred<Unit>>()

    override suspend fun list(
        query: String,
        biome: String?,
        state: String?,
        cursor: String?,
        limit: Int,
    ): Result<SpeciesPage, DataError.Network> {
        val index = calls.size
        calls += ListCall(query, biome, state, cursor)
        gates[index]?.await()
        return pages.getValue(cursor)
    }
}

/** sampleFilters são filtros de exemplo. */
val sampleFilters =
    Filters(
        biomes = listOf(BiomeFilter("cerrado", "Cerrado", 26), BiomeFilter("pampa", "Pampa", 15)),
        states = listOf(StateFilter("RJ", 23), StateFilter("SP", 29), StateFilter("AC", 3)),
    )

/** Repositório falso de filtros, que responde o resultado configurado e conta as chamadas. */
class FakeFiltersRepository(
    var next: Result<Filters, DataError.Network> = Result.Success(sampleFilters),
) : FiltersRepository {
    var calls = 0

    override suspend fun get(): Result<Filters, DataError.Network> {
        calls++
        return next
    }
}

/** Favoritos falsos, em memória. */
class FakeFavoritesRepository : FavoritesRepository {
    val ids = MutableStateFlow<Set<String>>(emptySet())

    override fun observeIds(): Flow<Set<String>> = ids

    override fun observeAll(): Flow<List<SpeciesSummary>> = flowOf(emptyList())

    override suspend fun toggle(summary: SpeciesSummary) {
        ids.value = if (summary.id in ids.value) ids.value - summary.id else ids.value + summary.id
    }

    override suspend fun refresh(summary: SpeciesSummary) = Unit
}

/** sampleFeatured é uma "Ave do dia" de exemplo, com canto. */
val sampleFeatured = FeaturedSpecies(date = "2026-11-08", species = bird("tuiuiu"), hasSong = true)

/** A "Ave do dia" falsa: responde o resultado configurado e conta as chamadas. */
class FakeFeaturedRepository(
    var next: Result<FeaturedSpecies, DataError.Network> = Result.Success(sampleFeatured),
) : FeaturedRepository {
    var calls = 0

    override suspend fun getFeaturedSpecies(): Result<FeaturedSpecies, DataError.Network> {
        calls++
        return next
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
import com.velosobr.passarim.core.domain.BiomeFilter
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.Result
import com.velosobr.passarim.core.domain.StateFilter
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

    @Test
    fun `tocar no card e em Ver favoritos emite os eventos de navegacao`() =
        runTest {
            val vm = viewModel()
            vm.events.test {
                vm.onAction(ExploreAction.OpenDetail("bem-te-vi"))
                assertThat(awaitItem()).isEqualTo(ExploreEvent.NavigateToDetail("bem-te-vi"))
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

    @Test
    fun `tocar na ave do dia abre o detalhe e o canto abre tocando`() =
        runTest {
            val vm = viewModel()
            vm.events.test {
                vm.onAction(ExploreAction.OpenFeatured)
                assertThat(awaitItem()).isEqualTo(ExploreEvent.NavigateToDetail("tuiuiu"))
                vm.onAction(ExploreAction.PlayFeatured)
                assertThat(awaitItem()).isEqualTo(ExploreEvent.NavigateToDetail("tuiuiu", autoPlay = true))
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
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:explore:presentation:testAndroidHostTest`

Expected: FAIL na compilação: `Too many arguments for 'constructor(explore: ExploreRepository, filtersRepository: FiltersRepository, favorites: FavoritesRepository, savedState: SavedStateHandle)'` e `Unresolved reference` para `featured`, `showFeatured` e `SelectBiome`.

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `app/src/commonMain/kotlin/com/velosobr/passarim/app/tabs/TabsScreen.kt`:

```kotlin
// A tela com a barra inferior e a navegação dentro de cada aba.
// "by" lê o State como valor comum; currentBackStackEntryAsState recompõe a
// barra quando a aba muda. Scaffold é o esqueleto do Material com espaço para
// a barra inferior.

package com.velosobr.passarim.app.tabs

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
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
import org.jetbrains.compose.resources.stringResource
import org.jetbrains.compose.resources.vectorResource

/**
 * Scaffold com a barra inferior e um `NavHost` interno: cada aba tem a sua pilha, e trocar de aba
 * guarda e restaura o estado (`saveState`/`restoreState`).
 */
@Composable
fun TabsScreen(
    onOpenDetail: (String) -> Unit,
    onOpenStorage: () -> Unit,
    onOpenAbout: () -> Unit,
) {
    val navController = rememberNavController()
    val backStack by navController.currentBackStackEntryAsState()
    Scaffold(
        bottomBar = {
            NavigationBar {
                Tab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = backStack?.destination?.hasRoute(tab.route::class) == true,
                        onClick = { navController.navigateToTab(tab) },
                        icon = { Icon(vectorResource(tab.icon), contentDescription = null) },
                        label = { Text(stringResource(tab.label)) },
                    )
                }
            }
        },
    ) { padding ->
        NavHost(navController, startDestination = ExploreRoute, modifier = Modifier.padding(padding)) {
            composable<ExploreRoute> {
                ExploreRoot(
                    onOpenDetail = { id, _ -> onOpenDetail(id) },
                    onOpenFavorites = { navController.navigateToTab(Tab.Favorites) },
                )
            }
            composable<FavoritesRoute> {
                FavoritesRoot(onOpenDetail = onOpenDetail, onOpenExplore = { navController.navigateToTab(Tab.Explore) })
            }
            composable<SettingsRoute> { SettingsRoot(onOpenStorage = onOpenStorage, onOpenAbout = onOpenAbout) }
        }
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

Substitua o conteúdo de `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreAction.kt`:

```kotlin
// As ações que a tela Explorar manda ao ViewModel e os eventos de uma vez que
// ele devolve. É o padrão MVI: a tela só desenha o estado e avisa o que o
// usuário fez; quem decide o que acontecer é o ViewModel.

package com.velosobr.passarim.feature.explore.presentation

import com.velosobr.passarim.core.domain.SpeciesSummary

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

    /** Toque num card. */
    data class OpenDetail(
        val id: String,
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
    /** Abrir o Detalhe da ave [id]; com [autoPlay], o canto começa ao abrir. */
    data class NavigateToDetail(
        val id: String,
        val autoPlay: Boolean = false,
    ) : ExploreEvent

    data object NavigateToFavorites : ExploreEvent
}
```

Substitua o conteúdo de `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreRoot.kt`:

```kotlin
// A ligação entre a tela Explorar e o ViewModel.

package com.velosobr.passarim.feature.explore.presentation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.velosobr.passarim.core.presentation.ObserveAsEvents
import org.koin.compose.viewmodel.koinViewModel

/**
 * Liga a tela ao ViewModel (Koin) e transforma os eventos em navegação, que fica a cargo do `app`.
 * collectAsStateWithLifecycle só coleta o estado com a tela visível.
 */
@Composable
fun ExploreRoot(
    onOpenDetail: (id: String, autoPlay: Boolean) -> Unit,
    onOpenFavorites: () -> Unit,
    viewModel: ExploreViewModel = koinViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    ObserveAsEvents(viewModel.events) { event ->
        when (event) {
            is ExploreEvent.NavigateToDetail -> onOpenDetail(event.id, event.autoPlay)
            ExploreEvent.NavigateToFavorites -> onOpenFavorites()
        }
    }
    ExploreScreen(state = state, onAction = viewModel::onAction)
}
```

Substitua o conteúdo de `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreState.kt`:

```kotlin
// O estado da tela Explorar e as fases da lista e dos filtros.

package com.velosobr.passarim.feature.explore.presentation

import com.velosobr.passarim.core.domain.FeaturedSpecies
import com.velosobr.passarim.core.domain.Filters
import com.velosobr.passarim.core.domain.SpeciesSummary
import com.velosobr.passarim.core.domain.StateFilter
import com.velosobr.passarim.core.presentation.ScreenError

/** Quantos estados o sheet mostra antes de "Ver todos os estados". */
const val VISIBLE_STATES = 12

/** Estado da tela Explorar. Os critérios (`query`, `biome`, `state`) definem a lista; o resto deriva deles. */
data class ExploreState(
    /** Texto do campo, como o usuário digitou (a busca usa a versão limpa por `sanitizeQuery`). */
    val query: String = "",
    val biome: String? = null,
    val state: String? = null,
    val items: List<SpeciesSummary> = emptyList(),
    val nextCursor: String? = null,
    val phase: ExplorePhase = ExplorePhase.Loading,
    val isLoadingMore: Boolean = false,
    /** Erro da página seguinte: uma linha no fim da grade, sem perder os itens. */
    val loadMoreError: ScreenError? = null,
    /** Falso enquanto corre o `Retry-After` de um `RateLimited`. */
    val retryEnabled: Boolean = true,
    val filters: FiltersPhase = FiltersPhase.Loading,
    /** Sheet de filtros aberto (com as escolhas ainda não aplicadas) ou nulo, se fechado. */
    val sheet: FiltersSheetState? = null,
    val favoriteIds: Set<String> = emptySet(),
    /** A "Ave do dia", ou nulo enquanto carrega ou se o BFF não tiver uma (aí o card não aparece). */
    val featured: FeaturedSpecies? = null,
) {
    /** Nome do bioma selecionado para o chip ("Pampa"); o código, se os filtros ainda não chegaram. */
    val biomeLabel: String?
        get() =
            biome?.let { code ->
                (filters as? FiltersPhase.Loaded)
                    ?.filters
                    ?.biomes
                    ?.find { it.code == code }
                    ?.label ?: code
            }

    /** Se há bioma ou UF selecionados. */
    val hasFilters: Boolean get() = biome != null || state != null

    /** A "Ave do dia" só aparece na vitrine: sem busca e sem filtro. */
    val showFeatured: Boolean get() = featured != null && query.isBlank() && !hasFilters

    /** O total de aves para o título ("41 aves"), ou nulo enquanto os filtros não chegam. */
    val speciesTotal: Int? get() = (filters as? FiltersPhase.Loaded)?.filters?.speciesTotal
}

/** Em que ponto a lista está: carregando, com itens, vazia ou com erro. */
sealed interface ExplorePhase {
    data object Loading : ExplorePhase

    data object Content : ExplorePhase

    data object Empty : ExplorePhase

    data class Error(
        val error: ScreenError,
    ) : ExplorePhase
}

/** Os filtros têm carregamento próprio: a grade funciona mesmo se `GET /v1/filters` falhar. */
sealed interface FiltersPhase {
    data object Loading : FiltersPhase

    data class Loaded(
        val filters: Filters,
    ) : FiltersPhase

    data object Error : FiltersPhase
}

/** Escolhas no sheet; só viram filtro ao tocar em "Mostrar aves". */
data class FiltersSheetState(
    val biome: String?,
    val state: String?,
    val showAllStates: Boolean = false,
)

/** Estados por contagem (maior primeiro); só os [VISIBLE_STATES] primeiros até "Ver todos". */
fun visibleStates(
    states: List<StateFilter>,
    showAll: Boolean,
): List<StateFilter> = states.sortedByDescending { it.speciesCount }.let { if (showAll) it else it.take(VISIBLE_STATES) }
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
import com.velosobr.passarim.core.domain.FavoritesRepository
import com.velosobr.passarim.core.domain.FeaturedRepository
import com.velosobr.passarim.core.domain.FiltersRepository
import com.velosobr.passarim.core.domain.onFailure
import com.velosobr.passarim.core.domain.onSuccess
import com.velosobr.passarim.core.presentation.ScreenError
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
        // A "Ave do dia" é buscada uma vez; qualquer falha só deixa o card de fora, sem erro na tela.
        viewModelScope.launch {
            featuredRepository.getFeaturedSpecies().onSuccess { f -> _state.update { it.copy(featured = f) } }
        }
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
            is ExploreAction.OpenDetail -> eventChannel.trySend(ExploreEvent.NavigateToDetail(action.id))
            ExploreAction.OpenFavorites -> eventChannel.trySend(ExploreEvent.NavigateToFavorites)
            is ExploreAction.SelectBiome ->
                setFilters(biome = action.code.takeIf { it != _state.value.biome }, state = _state.value.state)
            ExploreAction.OpenFeatured -> openFeatured(autoPlay = false)
            ExploreAction.PlayFeatured -> openFeatured(autoPlay = true)
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

    /** Abre o Detalhe da "Ave do dia" (se ela já chegou), tocando o canto quando [autoPlay]. */
    private fun openFeatured(autoPlay: Boolean) {
        val id =
            _state.value.featured
                ?.species
                ?.id ?: return
        eventChannel.trySend(ExploreEvent.NavigateToDetail(id, autoPlay))
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :feature:explore:presentation:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Conferir que a navegação só liga**

O bloco de rota do `NavHost` só pega o ViewModel, repassa callbacks e navega; nenhum efeito ali.

Run: `git diff origin/main -- 'app/src/commonMain/kotlin/com/velosobr/passarim/app/' | grep -E '^\+.*(LaunchedEffect|DisposableEffect|\.collect *[{(])'`

Expected: nenhuma linha.

- [ ] **Step 6: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:explore:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m 'feat: "Ave do dia", chips de bioma e o total de aves no ViewModel do Explorar'
```

### Task 5: Explorar em mosaico

A tela ganha o desenho da prancheta `Explorar.dc.html`: o título com o total, a busca, os chips de bioma (`PiuBiomeChip`) numa linha que rola, a "Ave do dia" (`PiuFeaturedCard`) em largura total e o mosaico (`PiuMosaicCard`) num `LazyVerticalStaggeredGrid`, alternando alto e baixo. A partir de 1.5× de fonte, uma coluna (regra da 5b). O mosaico fica em `ExploreMosaic.kt`; a tela recebe o `contentPadding` que a barra flutuante vai usar na Task 7. Sem `primaryBiome`, o card usa o gradiente do Pantanal ([DR] 2).

**Files:**
- Modify: `feature/explore/presentation/src/commonMain/composeResources/values/strings.xml`
- Create: `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreMosaic.kt`
- Modify: `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreScreen.kt`
- Test: `feature/explore/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreLayoutTest.kt`
- Test: `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/ExploreSnapshotTest.kt`
- Record: 36 imagens em `snapshots/src/test/snapshots/images/` (6 novas, 30 regravadas)

**Interfaces:**
- Produz: `fun mosaicHeightFor(index: Int): PiuMosaicHeight` e `internal fun SpeciesMosaic(state, columns, onAction, contentPadding)`.
- Muda: `ExploreScreen(state, onAction, modifier = Modifier, contentPadding: PaddingValues = PaddingValues())`.
- Consome: `PiuBiomeChip`, `PiuFeaturedCard`, `PiuPlayAction`, `PiuMosaicCard` e `PiuMosaicHeight` do C2; `ExploreAction.SelectBiome`/`OpenFeatured`/`PlayFeatured` (Task 4).

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `feature/explore/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreLayoutTest.kt`:

```kotlin
// Teste do número de colunas da grade por escala de fonte.

package com.velosobr.passarim.feature.explore.presentation

import assertk.assertThat
import assertk.assertions.isEqualTo
import com.velosobr.piuds.components.adult.PiuMosaicHeight.SHORT
import com.velosobr.piuds.components.adult.PiuMosaicHeight.TALL
import kotlin.test.Test

class ExploreLayoutTest {
    @Test
    fun `duas colunas ate fonte 1_3 e uma coluna a partir de 1_5`() {
        assertThat(exploreGridColumns(1.0f)).isEqualTo(2)
        assertThat(exploreGridColumns(1.3f)).isEqualTo(2)
        assertThat(exploreGridColumns(1.5f)).isEqualTo(1)
        assertThat(exploreGridColumns(2.0f)).isEqualTo(1)
    }

    @Test
    fun `o mosaico alterna alto e baixo para as colunas ficarem desencontradas`() {
        // Coluna da esquerda: alto, baixo; da direita: baixo, alto. Assim as linhas nunca se alinham.
        val heights = (0 until 8).map { mosaicHeightFor(it) }
        assertThat(heights).isEqualTo(
            listOf(TALL, SHORT, SHORT, TALL, TALL, SHORT, SHORT, TALL),
        )
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:explore:presentation:testAndroidHostTest`

Expected: FAIL na compilação: `Unresolved reference 'mosaicHeightFor'`.

- [ ] **Step 3: Ajustar `strings.xml`**

Em `feature/explore/presentation/src/commonMain/composeResources/values/strings.xml`, aplique (o diff mostra o arquivo antes e depois):

```diff
diff --git a/feature/explore/presentation/src/commonMain/composeResources/values/strings.xml b/feature/explore/presentation/src/commonMain/composeResources/values/strings.xml
index 3785c82..db213de 100644
--- a/feature/explore/presentation/src/commonMain/composeResources/values/strings.xml
+++ b/feature/explore/presentation/src/commonMain/composeResources/values/strings.xml
@@ -1,4 +1,10 @@
 <resources>
+    <string name="explore_title">Explorar</string>
+    <string name="species_count">%1$d aves</string>
+    <string name="chip_all">Todos</string>
+    <string name="featured_badge">AVE DO DIA</string>
+    <string name="featured_badge_biome">AVE DO DIA · %1$s</string>
+    <string name="featured_play">Ouvir o canto de %1$s</string>
     <string name="search_placeholder">Buscar aves</string>
     <string name="filter_biome">Bioma</string>
     <string name="filter_state">Estado</string>
```

- [ ] **Step 4: Implementar**

Crie `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreMosaic.kt`:

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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
 * O mosaico: a "Ave do dia" ocupando a largura toda e, embaixo, os cards em colunas desencontradas,
 * com o rodapé de "carregando mais" ou de erro. LazyVerticalStaggeredGrid é a grade em que cada item
 * tem a própria altura e entra na coluna mais curta; FullLine faz um item ocupar todas as colunas.
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
    LaunchedEffect(gridState) {
        snapshotFlow {
            val info = gridState.layoutInfo
            (info.visibleItemsInfo.lastOrNull()?.index ?: -1) to info.totalItemsCount
        }.distinctUntilChanged()
            .collect { (last, count) -> if (shouldLoadMore(last, count)) onAction(ExploreAction.LoadMore) }
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
        if (state.showFeatured && featured != null) {
            item(key = "featured", span = StaggeredGridItemSpan.FullLine, contentType = "featured") {
                FeaturedCard(featured.species, featured.hasSong, state, onAction)
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
                    mosaicHeightFor(index).let {
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

- [ ] **Step 5: Rodar e ver passar**

Run: `./gradlew :feature:explore:presentation:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 6: Snapshots**

Substitua o conteúdo de `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/ExploreSnapshotTest.kt`:

```kotlin
// Snapshots da tela Explorar.

package com.velosobr.passarim.snapshots

import com.velosobr.passarim.core.domain.Biome
import com.velosobr.passarim.core.domain.BiomeFilter
import com.velosobr.passarim.core.domain.FeaturedSpecies
import com.velosobr.passarim.core.domain.Filters
import com.velosobr.passarim.core.domain.SpeciesSummary
import com.velosobr.passarim.core.domain.StateFilter
import com.velosobr.passarim.core.presentation.ScreenError
import com.velosobr.passarim.feature.explore.presentation.ExplorePhase
import com.velosobr.passarim.feature.explore.presentation.ExploreScreen
import com.velosobr.passarim.feature.explore.presentation.ExploreState
import com.velosobr.passarim.feature.explore.presentation.FiltersPhase
import com.velosobr.passarim.feature.explore.presentation.FiltersSheet
import com.velosobr.passarim.feature.explore.presentation.FiltersSheetState
import org.junit.Test

/**
 * As telas de Explorar dos mockups: grade, carregando, vazio, erros e o sheet de filtros. A 2.0× a grade
 * fica em 1 coluna. O sheet é fotografado sem o `ModalBottomSheet` (o Paparazzi não desenha janelas).
 */
class ExploreSnapshotTest(
    dark: Boolean,
    fontScalePercent: Int,
) : ThemedSnapshotTest(dark, fontScalePercent) {
    private val birds =
        listOf(
            SpeciesSummary("arara-azul-grande", "Arara-azul-grande", "Anodorhynchus hyacinthinus", null, Biome.PANTANAL),
            SpeciesSummary("bem-te-vi", "Bem-te-vi", "Pitangus sulphuratus", null, Biome.CERRADO),
            SpeciesSummary("sabia-laranjeira", "Sabiá-laranjeira", "Turdus rufiventris", null, Biome.MATA_ATLANTICA),
            SpeciesSummary("tucano-toco", "Tucano-toco", "Ramphastos toco", null, Biome.CAATINGA),
        )

    private val filters =
        Filters(
            biomes =
                listOf(
                    BiomeFilter("cerrado", "Cerrado", 26),
                    BiomeFilter("mata_atlantica", "Mata Atlântica", 29),
                    BiomeFilter("amazonia", "Amazônia", 24),
                    BiomeFilter("caatinga", "Caatinga", 19),
                    BiomeFilter("pantanal", "Pantanal", 19),
                    BiomeFilter("pampa", "Pampa", 15),
                ),
            states =
                listOf("SP" to 29, "PR" to 24, "RS" to 24, "RJ" to 23, "GO" to 22, "BA" to 21, "AM" to 19, "PA" to 19)
                    .plus(listOf("MT" to 19, "MG" to 19, "MS" to 16, "SC" to 15, "AC" to 3))
                    .map { (code, count) -> StateFilter(code, count) },
            primaryBiomes = listOf(BiomeFilter("pantanal", "Pantanal", 21), BiomeFilter("cerrado", "Cerrado", 20)),
        )

    private fun screen(
        name: String,
        state: ExploreState,
    ) = snap(name) { ExploreScreen(state = state, onAction = {}) }

    /** A vitrine: o total de aves, os chips de bioma, a "Ave do dia" e o mosaico. */
    @Test
    fun grid() =
        screen(
            "grid",
            ExploreState(
                items = birds,
                phase = ExplorePhase.Content,
                favoriteIds = setOf("arara-azul-grande", "tucano-toco"),
                filters = FiltersPhase.Loaded(filters),
                featured =
                    FeaturedSpecies(
                        "2026-11-08",
                        SpeciesSummary("tuiuiu", "Tuiuiú", "Jabiru mycteria", null, Biome.PANTANAL),
                        hasSong = true,
                    ),
            ),
        )

    /** Com um bioma marcado: o chip fica selecionado, e a "Ave do dia" sai da tela. */
    @Test
    fun gridFiltered() =
        screen(
            "grid-filtered",
            ExploreState(biome = "cerrado", items = birds, phase = ExplorePhase.Content, filters = FiltersPhase.Loaded(filters)),
        )

    @Test
    fun loading() = screen("loading", ExploreState(phase = ExplorePhase.Loading))

    @Test
    fun empty() =
        screen(
            "empty",
            ExploreState(query = "arara", biome = "pampa", phase = ExplorePhase.Empty, filters = FiltersPhase.Loaded(filters)),
        )

    @Test
    fun errorNoConnection() = screen("error-no-connection", ExploreState(phase = ExplorePhase.Error(ScreenError.NoConnection)))

    @Test
    fun errorServer() = screen("error-server", ExploreState(phase = ExplorePhase.Error(ScreenError.ServiceUnavailable)))

    @Test
    fun filtersSheet() =
        snap("filters-sheet") {
            FiltersSheet(sheet = FiltersSheetState(biome = "cerrado", state = "RJ"), filters = FiltersPhase.Loaded(filters), onAction = {})
        }
}
```

Run: `./gradlew :snapshots:recordPaparazziDebug --tests '*ExploreSnapshotTest*'`

Expected: 6 imagens novas e 30 regravadas em `snapshots/src/test/snapshots/images/`. Abra cada uma e confira a 1.0×, 1.3× e 2.0×, no claro e no escuro: nada cortado, nada quebrado no meio da palavra; o título com "41 aves", os chips com "Todos" marcado na vitrine e "Cerrado" marcado no `grid-filtered` (sem a "Ave do dia"), e os cards sem foto com o gradiente do bioma; a 2.0×, uma coluna.

- [ ] **Step 7: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:explore:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m 'feat: Explorar em mosaico, com o total de aves, chips de bioma e a "Ave do dia"'
```

### Task 6: Detalhe aberto pelo canto da "Ave do dia" já toca

A rota do Detalhe ganha `autoPlay: Boolean = false` (spec, seção 5). O `DetailViewModel` lê o argumento pelo `SavedStateHandle` (a navegação tipada põe cada campo da rota lá, com o nome do campo como chave) e toca o canto ao carregar, mesmo com a reprodução automática desligada. As abas e a raiz repassam o `autoPlay`; os Favoritos abrem sem tocar.

**Files:**
- Modify: `app/src/commonMain/kotlin/com/velosobr/passarim/app/App.kt`
- Modify: `app/src/commonMain/kotlin/com/velosobr/passarim/app/navigation/Routes.kt`
- Modify: `app/src/commonMain/kotlin/com/velosobr/passarim/app/tabs/TabsScreen.kt`
- Modify: `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailViewModel.kt`
- Test: `feature/detail/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailViewModelTest.kt`

**Interfaces:**
- Produz: `const val KEY_AUTO_PLAY = "autoPlay"` e `DetailRoute(id: String, autoPlay: Boolean = false)`.
- Muda: `TabsScreen(onOpenDetail: (id: String, autoPlay: Boolean) -> Unit, onOpenStorage, onOpenAbout)`.
- Consome: `ExploreRoot(onOpenDetail: (id, autoPlay) -> Unit, ...)` (Task 4).

- [ ] **Step 1: Escrever o teste que falha**

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
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.Result
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

- [ ] **Step 2: Rodar e ver falhar**

Run: `./gradlew :feature:detail:presentation:testAndroidHostTest`

Expected: FAIL na compilação: `Unresolved reference 'KEY_AUTO_PLAY'`.

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
 */
@Composable
private fun AppNavHost() {
    val rootNav = rememberNavController()
    NavHost(rootNav, startDestination = TabsRoute) {
        composable<TabsRoute> {
            TabsScreen(
                onOpenDetail = { id, autoPlay -> rootNav.navigate(DetailRoute(id, autoPlay)) },
                onOpenStorage = { rootNav.navigate(StorageRoute) },
                onOpenAbout = { rootNav.navigate(AboutRoute) },
            )
        }
        composable<DetailRoute> {
            DetailRoot(onBack = dropUnlessResumed { rootNav.popBackStack() })
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
```

Substitua o conteúdo de `app/src/commonMain/kotlin/com/velosobr/passarim/app/navigation/Routes.kt`:

```kotlin
// As rotas de navegação. Com o Navigation Compose, cada rota é uma classe
// @Serializable: a biblioteca converte a classe (e os argumentos) num destino.

package com.velosobr.passarim.app.navigation

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
 */
@Serializable
data class DetailRoute(
    val id: String,
    val autoPlay: Boolean = false,
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
// A tela com a barra inferior e a navegação dentro de cada aba.
// "by" lê o State como valor comum; currentBackStackEntryAsState recompõe a
// barra quando a aba muda. Scaffold é o esqueleto do Material com espaço para
// a barra inferior.

package com.velosobr.passarim.app.tabs

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
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
import org.jetbrains.compose.resources.stringResource
import org.jetbrains.compose.resources.vectorResource

/**
 * Scaffold com a barra inferior e um `NavHost` interno: cada aba tem a sua pilha, e trocar de aba
 * guarda e restaura o estado (`saveState`/`restoreState`).
 */
@Composable
fun TabsScreen(
    onOpenDetail: (id: String, autoPlay: Boolean) -> Unit,
    onOpenStorage: () -> Unit,
    onOpenAbout: () -> Unit,
) {
    val navController = rememberNavController()
    val backStack by navController.currentBackStackEntryAsState()
    Scaffold(
        bottomBar = {
            NavigationBar {
                Tab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = backStack?.destination?.hasRoute(tab.route::class) == true,
                        onClick = { navController.navigateToTab(tab) },
                        icon = { Icon(vectorResource(tab.icon), contentDescription = null) },
                        label = { Text(stringResource(tab.label)) },
                    )
                }
            }
        },
    ) { padding ->
        NavHost(navController, startDestination = ExploreRoute, modifier = Modifier.padding(padding)) {
            composable<ExploreRoute> {
                ExploreRoot(
                    onOpenDetail = onOpenDetail,
                    onOpenFavorites = { navController.navigateToTab(Tab.Favorites) },
                )
            }
            composable<FavoritesRoute> {
                FavoritesRoot(onOpenDetail = { id ->
                    onOpenDetail(id, false)
                }, onOpenExplore = { navController.navigateToTab(Tab.Explore) })
            }
            composable<SettingsRoute> { SettingsRoot(onOpenStorage = onOpenStorage, onOpenAbout = onOpenAbout) }
        }
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
import com.velosobr.passarim.core.domain.onFailure
import com.velosobr.passarim.core.domain.onSuccess
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

/**
 * Carrega a espécie, acompanha o favorito e o player, e trata as ações da
 * tela. Ao carregar, se a espécie já é favorita, atualiza o resumo guardado;
 * se a configuração pede, toca o canto sozinho.
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

    private val _state = MutableStateFlow(DetailState())
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

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :feature:detail:presentation:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Conferir que a navegação só liga**

O bloco de rota do `NavHost` só pega o ViewModel, repassa callbacks e navega; nenhum efeito ali.

Run: `git diff origin/main -- 'app/src/commonMain/kotlin/com/velosobr/passarim/app/' | grep -E '^\+.*(LaunchedEffect|DisposableEffect|\.collect *[{(])'`

Expected: nenhuma linha.

- [ ] **Step 6: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:detail:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m 'feat: Detalhe aberto pelo canto da "Ave do dia" já toca o canto'
```

### Task 7: Barra flutuante com desfoque nas abas

O `Scaffold` com a `NavigationBar` do Material sai. O `NavHost` das abas ocupa a tela inteira e é a fonte do desfoque (`piuBlurSource`); a `PiuFloatingNavBar` flutua por cima, acima da área do gesto de navegação (`navigationBars`). Cada aba recebe o espaço da barra para o último card não ficar escondido: o Explorar pelo `contentPadding` da grade (rola por baixo da barra); Favoritos e Configurações, que ganham o visual novo no E3, só com um `padding`.

**Files:**
- Modify: `app/src/commonMain/kotlin/com/velosobr/passarim/app/tabs/TabsScreen.kt`
- Modify: `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreRoot.kt`

**Interfaces:**
- Muda: `ExploreRoot(onOpenDetail, onOpenFavorites, contentPadding: PaddingValues = PaddingValues(), viewModel)`.
- Consome: `PiuFloatingNavBar`, `PiuNavItem`, `rememberPiuBlurState` e `piuBlurSource` do C2; `ExploreScreen(..., contentPadding)` (Task 5).

Esta tarefa só liga componentes que já têm teste no C2 (o `PiuFloatingNavBarTest` cobre a semântica de abas e a mola). Não há teste novo: a prova é a compilação do app, o check e o aparelho.

- [ ] **Step 1: Implementar**

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
            // Favoritos e Configurações ganham o visual novo na frente E3; até lá, só reservam o espaço da barra.
            composable<FavoritesRoute> {
                Box(Modifier.padding(barPadding)) {
                    FavoritesRoot(
                        onOpenDetail = { id -> onOpenDetail(id, false) },
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

Substitua o conteúdo de `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreRoot.kt`:

```kotlin
// A ligação entre a tela Explorar e o ViewModel.

package com.velosobr.passarim.feature.explore.presentation

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.velosobr.passarim.core.presentation.ObserveAsEvents
import org.koin.compose.viewmodel.koinViewModel

/**
 * Liga a tela ao ViewModel (Koin) e transforma os eventos em navegação, que fica a cargo do `app`.
 * collectAsStateWithLifecycle só coleta o estado com a tela visível.
 */
@Composable
fun ExploreRoot(
    onOpenDetail: (id: String, autoPlay: Boolean) -> Unit,
    onOpenFavorites: () -> Unit,
    contentPadding: PaddingValues = PaddingValues(),
    viewModel: ExploreViewModel = koinViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    ObserveAsEvents(viewModel.events) { event ->
        when (event) {
            is ExploreEvent.NavigateToDetail -> onOpenDetail(event.id, event.autoPlay)
            ExploreEvent.NavigateToFavorites -> onOpenFavorites()
        }
    }
    ExploreScreen(state = state, onAction = viewModel::onAction, contentPadding = contentPadding)
}
```

- [ ] **Step 2: Compilar o app**

Run: `./gradlew :androidApp:assembleDebug`

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 3: Conferir que a navegação só liga**

O bloco de rota do `NavHost` só pega o ViewModel, repassa callbacks e navega; nenhum efeito ali.

Run: `git diff origin/main -- 'app/src/commonMain/kotlin/com/velosobr/passarim/app/' | grep -E '^\+.*(LaunchedEffect|DisposableEffect|\.collect *[{(])'`

Expected: nenhuma linha.

- [ ] **Step 4: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 5: Conferir no aparelho**

Run: `ANDROID_SERIAL=4T9DSCR4IZDAGEI7 ./gradlew :androidApp:installDebug` (com o back-end local no ar: `passarim-docs/env.scripts/status`)

Expected: a barra em pílula flutua sobre o mosaico, o conteúdo aparece desfocado por baixo dela, o último card rola até acima da barra, e a barra fica acima do gesto de navegação do sistema. Sem o aparelho, registre "conferência no aparelho pendente" no PR e siga.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m 'feat: barra de navegação flutuante com desfoque nas abas do adulto'
```

## Correções da revisão final

Depois da Task 7, um revisor independente (agente Opus) leu o branch inteiro. Cada achado Critical ou Important virou uma tarefa com o teste vermelho primeiro, num commit `fix:` no fim do branch (sem fixup nem autosquash). Os achados Minor estão no ledger, no fim deste plano.

### Task 8: Revisão: a "Ave do dia" com lugar reservado e nova tentativa quando a lista volta

A revisão final (agente Opus) achou dois Important. (1) Quando a "Ave do dia" chegava depois da lista, o card entrava acima de uma grade já desenhada; as grades guardam a posição pelo primeiro item visível, e o card nascia fora da tela. Agora o lugar é reservado desde o começo (`featuredLoading`), com um esqueleto que o card substitui sob a mesma chave. (2) Depois de uma falha (sem rede), a "Ave do dia" não era pedida de novo; agora ela é pedida a cada lista que chega bem, menos quando o BFF disse que não há ave elegível (`NotFound`). De carona, o efeito de paginação usa `rememberUpdatedState` para o `onAction`, e o KDoc do `DetailViewModel` passa a citar o `KEY_AUTO_PLAY`.

**Files:**
- Modify: `feature/detail/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/detail/presentation/DetailViewModel.kt`
- Modify: `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreMosaic.kt`
- Modify: `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreState.kt`
- Modify: `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreViewModel.kt`
- Test: `feature/explore/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreFakes.kt`
- Test: `feature/explore/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreViewModelTest.kt`

**Interfaces:**
- Produz: `ExploreState.featuredLoading: Boolean = false` e `showFeaturedSlot: Boolean`.
- Muda: a grade usa `showFeaturedSlot` (esqueleto `PiuSkeletonBox` de 196 dp enquanto carrega); o `FakeFeaturedRepository` ganha `gate: CompletableDeferred<Unit>?` para o teste observar o "carregando".

- [ ] **Step 1: Escrever o teste que falha**

Substitua o conteúdo de `feature/explore/presentation/src/commonTest/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreFakes.kt`:

```kotlin
// Repositórios falsos e dados de exemplo para os testes do ViewModel.

package com.velosobr.passarim.feature.explore.presentation

import com.velosobr.passarim.core.domain.BiomeFilter
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.FavoritesRepository
import com.velosobr.passarim.core.domain.FeaturedRepository
import com.velosobr.passarim.core.domain.FeaturedSpecies
import com.velosobr.passarim.core.domain.Filters
import com.velosobr.passarim.core.domain.FiltersRepository
import com.velosobr.passarim.core.domain.Result
import com.velosobr.passarim.core.domain.SpeciesSummary
import com.velosobr.passarim.core.domain.StateFilter
import com.velosobr.passarim.feature.explore.domain.ExploreRepository
import com.velosobr.passarim.feature.explore.domain.SpeciesPage
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf

/** bird cria uma ave de exemplo com o id dado. */
fun bird(id: String) = SpeciesSummary(id, "Ave $id", "Avis $id", thumbnailUrl = null)

/** Página com os ids `from..<to` (por exemplo `page(0, 20, "c1")`). */
fun page(
    from: Int,
    to: Int,
    next: String?,
) = SpeciesPage((from until to).map { bird("ave-$it") }, next)

/** ListCall é um pedido recebido pelo repositório falso, para o teste conferir. */
data class ListCall(
    val query: String,
    val biome: String?,
    val state: String?,
    val cursor: String?,
)

/**
 * Repositório falso: responde por cursor (`pages[null]` é a primeira página) e guarda cada chamada.
 * [gates] seguram a resposta de uma chamada (pelo índice) para observar estados intermediários.
 */
class FakeExploreRepository : ExploreRepository {
    val calls = mutableListOf<ListCall>()
    val pages = mutableMapOf<String?, Result<SpeciesPage, DataError.Network>>(null to Result.Success(page(0, 20, "c1")))
    val gates = mutableMapOf<Int, CompletableDeferred<Unit>>()

    override suspend fun list(
        query: String,
        biome: String?,
        state: String?,
        cursor: String?,
        limit: Int,
    ): Result<SpeciesPage, DataError.Network> {
        val index = calls.size
        calls += ListCall(query, biome, state, cursor)
        gates[index]?.await()
        return pages.getValue(cursor)
    }
}

/** sampleFilters são filtros de exemplo. */
val sampleFilters =
    Filters(
        biomes = listOf(BiomeFilter("cerrado", "Cerrado", 26), BiomeFilter("pampa", "Pampa", 15)),
        states = listOf(StateFilter("RJ", 23), StateFilter("SP", 29), StateFilter("AC", 3)),
    )

/** Repositório falso de filtros, que responde o resultado configurado e conta as chamadas. */
class FakeFiltersRepository(
    var next: Result<Filters, DataError.Network> = Result.Success(sampleFilters),
) : FiltersRepository {
    var calls = 0

    override suspend fun get(): Result<Filters, DataError.Network> {
        calls++
        return next
    }
}

/** Favoritos falsos, em memória. */
class FakeFavoritesRepository : FavoritesRepository {
    val ids = MutableStateFlow<Set<String>>(emptySet())

    override fun observeIds(): Flow<Set<String>> = ids

    override fun observeAll(): Flow<List<SpeciesSummary>> = flowOf(emptyList())

    override suspend fun toggle(summary: SpeciesSummary) {
        ids.value = if (summary.id in ids.value) ids.value - summary.id else ids.value + summary.id
    }

    override suspend fun refresh(summary: SpeciesSummary) = Unit
}

/** sampleFeatured é uma "Ave do dia" de exemplo, com canto. */
val sampleFeatured = FeaturedSpecies(date = "2026-11-08", species = bird("tuiuiu"), hasSong = true)

/** A "Ave do dia" falsa: responde o resultado configurado e conta as chamadas. */
class FakeFeaturedRepository(
    var next: Result<FeaturedSpecies, DataError.Network> = Result.Success(sampleFeatured),
) : FeaturedRepository {
    var calls = 0

    /** Se preenchido, segura a resposta até o teste completar, para observar o "carregando". */
    var gate: CompletableDeferred<Unit>? = null

    override suspend fun getFeaturedSpecies(): Result<FeaturedSpecies, DataError.Network> {
        calls++
        gate?.await()
        return next
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
import com.velosobr.passarim.core.domain.BiomeFilter
import com.velosobr.passarim.core.domain.DataError
import com.velosobr.passarim.core.domain.Result
import com.velosobr.passarim.core.domain.StateFilter
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

    @Test
    fun `tocar no card e em Ver favoritos emite os eventos de navegacao`() =
        runTest {
            val vm = viewModel()
            vm.events.test {
                vm.onAction(ExploreAction.OpenDetail("bem-te-vi"))
                assertThat(awaitItem()).isEqualTo(ExploreEvent.NavigateToDetail("bem-te-vi"))
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

    @Test
    fun `tocar na ave do dia abre o detalhe e o canto abre tocando`() =
        runTest {
            val vm = viewModel()
            vm.events.test {
                vm.onAction(ExploreAction.OpenFeatured)
                assertThat(awaitItem()).isEqualTo(ExploreEvent.NavigateToDetail("tuiuiu"))
                vm.onAction(ExploreAction.PlayFeatured)
                assertThat(awaitItem()).isEqualTo(ExploreEvent.NavigateToDetail("tuiuiu", autoPlay = true))
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

Run: `./gradlew :feature:explore:presentation:testAndroidHostTest`

Expected: FAIL na compilação: `Unresolved reference 'featuredLoading'` e `'showFeaturedSlot'`.

- [ ] **Step 3: Implementar**

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
import com.velosobr.passarim.core.domain.onFailure
import com.velosobr.passarim.core.domain.onSuccess
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

    private val _state = MutableStateFlow(DetailState())
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
 * O mosaico: a "Ave do dia" ocupando a largura toda e, embaixo, os cards em colunas desencontradas,
 * com o rodapé de "carregando mais" ou de erro. LazyVerticalStaggeredGrid é a grade em que cada item
 * tem a própria altura e entra na coluna mais curta; FullLine faz um item ocupar todas as colunas.
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

Substitua o conteúdo de `feature/explore/presentation/src/commonMain/kotlin/com/velosobr/passarim/feature/explore/presentation/ExploreState.kt`:

```kotlin
// O estado da tela Explorar e as fases da lista e dos filtros.

package com.velosobr.passarim.feature.explore.presentation

import com.velosobr.passarim.core.domain.FeaturedSpecies
import com.velosobr.passarim.core.domain.Filters
import com.velosobr.passarim.core.domain.SpeciesSummary
import com.velosobr.passarim.core.domain.StateFilter
import com.velosobr.passarim.core.presentation.ScreenError

/** Quantos estados o sheet mostra antes de "Ver todos os estados". */
const val VISIBLE_STATES = 12

/** Estado da tela Explorar. Os critérios (`query`, `biome`, `state`) definem a lista; o resto deriva deles. */
data class ExploreState(
    /** Texto do campo, como o usuário digitou (a busca usa a versão limpa por `sanitizeQuery`). */
    val query: String = "",
    val biome: String? = null,
    val state: String? = null,
    val items: List<SpeciesSummary> = emptyList(),
    val nextCursor: String? = null,
    val phase: ExplorePhase = ExplorePhase.Loading,
    val isLoadingMore: Boolean = false,
    /** Erro da página seguinte: uma linha no fim da grade, sem perder os itens. */
    val loadMoreError: ScreenError? = null,
    /** Falso enquanto corre o `Retry-After` de um `RateLimited`. */
    val retryEnabled: Boolean = true,
    val filters: FiltersPhase = FiltersPhase.Loading,
    /** Sheet de filtros aberto (com as escolhas ainda não aplicadas) ou nulo, se fechado. */
    val sheet: FiltersSheetState? = null,
    val favoriteIds: Set<String> = emptySet(),
    /** A "Ave do dia", ou nulo enquanto carrega ou se o BFF não tiver uma (aí o card não aparece). */
    val featured: FeaturedSpecies? = null,
    /** A "Ave do dia" está a caminho: a grade já reserva o lugar dela no topo. */
    val featuredLoading: Boolean = false,
) {
    /** Nome do bioma selecionado para o chip ("Pampa"); o código, se os filtros ainda não chegaram. */
    val biomeLabel: String?
        get() =
            biome?.let { code ->
                (filters as? FiltersPhase.Loaded)
                    ?.filters
                    ?.biomes
                    ?.find { it.code == code }
                    ?.label ?: code
            }

    /** Se há bioma ou UF selecionados. */
    val hasFilters: Boolean get() = biome != null || state != null

    /** A "Ave do dia" só aparece na vitrine: sem busca e sem filtro. */
    val showFeatured: Boolean get() = featured != null && query.isBlank() && !hasFilters

    /**
     * O lugar da "Ave do dia" no topo da grade: existe enquanto ela carrega e depois que ela chega.
     * Reservar o lugar desde o começo evita que o card entre acima de uma grade já desenhada; as
     * grades guardam a posição pelo primeiro item visível, e o card nasceria fora da tela.
     */
    val showFeaturedSlot: Boolean get() = (featuredLoading || featured != null) && query.isBlank() && !hasFilters

    /** O total de aves para o título ("41 aves"), ou nulo enquanto os filtros não chegam. */
    val speciesTotal: Int? get() = (filters as? FiltersPhase.Loaded)?.filters?.speciesTotal
}

/** Em que ponto a lista está: carregando, com itens, vazia ou com erro. */
sealed interface ExplorePhase {
    data object Loading : ExplorePhase

    data object Content : ExplorePhase

    data object Empty : ExplorePhase

    data class Error(
        val error: ScreenError,
    ) : ExplorePhase
}

/** Os filtros têm carregamento próprio: a grade funciona mesmo se `GET /v1/filters` falhar. */
sealed interface FiltersPhase {
    data object Loading : FiltersPhase

    data class Loaded(
        val filters: Filters,
    ) : FiltersPhase

    data object Error : FiltersPhase
}

/** Escolhas no sheet; só viram filtro ao tocar em "Mostrar aves". */
data class FiltersSheetState(
    val biome: String?,
    val state: String?,
    val showAllStates: Boolean = false,
)

/** Estados por contagem (maior primeiro); só os [VISIBLE_STATES] primeiros até "Ver todos". */
fun visibleStates(
    states: List<StateFilter>,
    showAll: Boolean,
): List<StateFilter> = states.sortedByDescending { it.speciesCount }.let { if (showAll) it else it.take(VISIBLE_STATES) }
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
import com.velosobr.passarim.core.domain.onFailure
import com.velosobr.passarim.core.domain.onSuccess
import com.velosobr.passarim.core.presentation.ScreenError
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
            is ExploreAction.OpenDetail -> eventChannel.trySend(ExploreEvent.NavigateToDetail(action.id))
            ExploreAction.OpenFavorites -> eventChannel.trySend(ExploreEvent.NavigateToFavorites)
            is ExploreAction.SelectBiome ->
                setFilters(biome = action.code.takeIf { it != _state.value.biome }, state = _state.value.state)
            // O canto da "Ave do dia" abre o Detalhe já tocando (autoPlay).
            ExploreAction.OpenFeatured, ExploreAction.PlayFeatured ->
                _state.value.featured?.let {
                    eventChannel.trySend(ExploreEvent.NavigateToDetail(it.species.id, autoPlay = action == ExploreAction.PlayFeatured))
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `./gradlew :feature:explore:presentation:testAndroidHostTest :feature:detail:presentation:testAndroidHostTest`

Expected: `BUILD SUCCESSFUL`, com os testes novos verdes.

- [ ] **Step 5: Lint e verificação**

Run: `./gradlew ktlintCheck detekt :feature:explore:presentation:testAndroidHostTest :feature:detail:presentation:testAndroidHostTest :snapshots:verifyPaparazziDebug`

Expected: `BUILD SUCCESSFUL`. Se o ktlint reclamar de formatação, rode `./gradlew ktlintFormat` e confira o diff antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m 'fix: "Ave do dia" com lugar reservado no topo e nova tentativa quando a lista volta (revisão final do E1)'
```

## Ledger: achados Minor da revisão final

Registrados no app #36 para depois, sem tarefa neste plano:

1. **Vocabulários diferentes no leitor de tela:** o chip "Todos" é anunciado como caixa de seleção e os chips de bioma como abas.
2. **Chip de UF fora da tela com filtro ativo:** o chip de UF é o último da linha de chips; com uma UF escolhida, ele pode ficar fora da área visível, e quem olha a tela não vê que há filtro de UF.
3. **Insets laterais em paisagem:** a barra flutuante e a grade não somam os insets laterais (`displayCutout`, barras laterais).
4. **`92.dp` da barra repetido fora do PiuDS:** a altura da `PiuFloatingNavBar` mais a margem está copiada no `TabsScreen`; o certo é o PiuDS expor essa medida.
5. **O canto pode tocar de novo depois da morte do processo:** o `autoPlay` fica no `SavedStateHandle` e, ao restaurar o Detalhe, o canto recomeça.
6. **Teste da rota pelo nome do argumento:** nenhum teste garante que o campo `DetailRoute.autoPlay` e a chave `KEY_AUTO_PLAY` continuam com o mesmo nome.

**Próxima etapa (pedido do dono):** o título e a busca do Explorar sobem junto com a lista ao rolar.

## Fechamento

### Task 9: Verificação final, aparelho e PR

- [ ] **Step 1: Check como o CI**

Run: `./gradlew ktlintCheck detekt allTests :snapshots:verifyPaparazziDebug :androidApp:assembleDebug`

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 2: Navegação só liga**

Run: `git diff origin/main -- 'app/src/commonMain/kotlin/com/velosobr/passarim/app/' | grep -E '^\+.*(LaunchedEffect|DisposableEffect|\.collect *[{(])'`

Expected: nenhuma linha.

- [ ] **Step 3: Aparelho**

Com o back-end local no ar (`passarim-docs/env.scripts/status` sai 0, com o conteúdo do catalog que traz o bioma principal):

Run: `ANDROID_SERIAL=4T9DSCR4IZDAGEI7 ./gradlew :androidApp:installDebug`

Expected: o Explorar abre com o título e a contagem, os chips, a "Ave do dia" e o mosaico; o canto da "Ave do dia" abre o Detalhe tocando; a barra flutua com desfoque. Sem o bioma principal no catalog, a "Ave do dia" dá 404 e some, e os cards usam o gradiente padrão.

- [ ] **Step 4: Push e PR, sem merge**

```bash
git push -u origin feat/e1-explorar
gh pr create --base main --head feat/e1-explorar --title 'Frente E1: Explorar em mosaico, "Ave do dia" e barra flutuante'
```

A descrição lista os snapshots regravados, o resultado no aparelho, os achados da revisão (corrigidos e Minor) e aponta para a spec (docs #29) e para o PR deste plano.
