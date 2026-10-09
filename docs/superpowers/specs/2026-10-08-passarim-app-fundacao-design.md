# Passarim — Etapa 5a: Fundação do app (KMP + Compose Multiplatform)

Data: 2026-10-08 · Origem: `2026-10-01-passarim-design.md` §6, §10, §13 (etapa 5), ADR-0009 e ADR-0010 · Insumos: `docs/design/` (tokens, ícone, mockups), `passarim-bff/openapi.yaml`, `BACKLOG.md` (seção passarim-app)

Decisões do redator estão marcadas com **[DR]**; o dono pode trocá-las sem afetar o resto.

## 1. Contexto e decomposição

A etapa 5 (`passarim-app`) é grande demais para um único spec e plano. Ela é dividida em fatias verticais, cada uma com seu ciclo spec → plano → execução:

| Fatia | Conteúdo |
|---|---|
| **5a — Fundação (este spec)** | Projeto, módulos, convention plugins, tema, DI, navegação com 3 abas, camada de dados contra o BFF, conexão ao compose local, pipeline Paparazzi e CI |
| 5b — Explorar | Busca, filtros, grid, paginação infinita, loading, vazio e erros |
| 5c — Detalhe | Hero, conservação, player de canto, galeria, "Onde encontrar" (mapa) |
| 5d — Favoritos e Configurações | Room KMP, DataStore, tema Sistema/Claro/Escuro, cores dinâmicas, Sobre, Dados e armazenamento |
| 5e — Fechamento | Matriz completa de snapshots, validação no iOS, release com R8, acessibilidade, resiliência e documentação |

Specs das demais fatias: [5b](2026-10-08-passarim-app-explorar-design.md) · [5c](2026-10-08-passarim-app-detalhe-design.md) · [5d](2026-10-08-passarim-app-favoritos-configuracoes-design.md) · [5e](2026-10-08-passarim-app-fechamento-design.md).

**Decisões já tomadas:**
- **Plataformas:** Android primeiro, com o iOS compilando. Todo o código de produto fica em `commonMain`. O iOS só precisa linkar o framework e abrir no simulador; a validação visual completa no iOS fica para depois.
- **Identificador:** `com.velosobr.passarim` (pacote Kotlin, `applicationId` e bundle id).
- **Arquitetura:** a das skills `android-*` do dono (feature-layered, Clean Architecture, MVI, Koin, Ktor, Room, Result tipado, navegação type-safe), adaptada ao KMP.
- **Versões de plataforma [DR]:** `minSdk` 26; `compileSdk`/`targetSdk` = o mais recente estável validado no passo de versões; iOS deployment target 15.0. Os valores finais ficam no catálogo de versões (§3).
- **Framework de teste [DR]:** `kotlin.test` + Turbine + AssertK em `commonTest` em **todas** as fatias. Isso desvia do §10 do spec geral (que cita JUnit5): o KMP não usa JUnit5 em `commonMain`, e manter um só framework evita testes duplicados. Registrado em ADR na 5a.

## 2. Objetivo da 5a

Entregar uma base que as fatias 5b–5e só precisam preencher: o app abre, o tema vem dos tokens, as 3 abas navegam, a camada de dados fala com o BFF local, e o pipeline de snapshots e o CI estão provados com um componente real.

### Critérios de pronto
1. `./gradlew :androidApp:assembleDebug` verde; o app abre no emulador com splash e as abas **Explorar · Favoritos · Configurações** (conteúdo vazio, navegáveis), em claro e escuro.
2. O framework iOS linka (`linkDebugFrameworkIosSimulatorArm64`) e o app abre no simulador (placeholder das abas), com Launch Screen e AppIcon do Passarim e App Transport Security configurado (§5).
3. Um teste de integração manual documentado prova a conexão: com o `docker compose` local no ar, o app (emulador) busca `GET /v1/filters` e exibe a contagem de biomas numa tela de depuração (somente debug). Essa tela e esse acesso provisório são **removidos** quando a 5b entrega o `FiltersRepository`.
4. Pelo menos um componente do design system (o selo de conservação) tem snapshot Paparazzi em tema claro, escuro e fonte ampliada, e `verifyPaparazzi` roda no CI. O snapshot usa texto e fonte de recursos do Compose Multiplatform (`Res.string`, `Res.font` Manrope), provando que o Paparazzi os resolve (§10).
5. CI verde: ktlint, detekt, testes unitários, `verifyPaparazzi`, `assembleDebug` (Linux) e `linkDebugFrameworkIosSimulatorArm64` (macOS); gitleaks, Dependabot e `osv-scanner` (falha em vulnerabilidade alta/crítica, spec §9) desde o primeiro commit.
6. README do `passarim-app` com diagrama Mermaid de módulos e instruções para rodar contra o compose local.

**Fora da 5a:** qualquer tela de produto (Explorar, Detalhe, Favoritos, Configurações reais), Room (só o módulo vazio), mapa, player de áudio, publicação nas lojas.

## 3. Módulos

```text
passarim-app/
  build-logic/              convention plugins
  androidApp/               casca Android fina: Application, manifest, splash, network security config, BuildConfig
  iosApp/                   projeto Xcode que consome o framework (Info.plist com ATS, Launch Screen, AppIcon)
  app/                      KMP: App() raiz, grafo de navegação, setup do Koin, AppConfig, framework iOS
  core/domain/              modelos compartilhados, Result, DataError, interfaces de repositório
  core/data/                HttpClient (Ktor), safeCall, parser de problem+json
  core/presentation/        UiText, ObserveAsEvents
  core/design-system/       tema (Manrope, cores, formas) e componentes genéricos (sem dependência de feature)
  core/database/            Room KMP (esqueleto na 5a; entidades, DAO e LocalFavoritesRepository na 5d)
  snapshots/                módulo Android puro com Paparazzi
```

Regras de dependência (das skills): `presentation → domain ← data`; `domain` só depende de `core:domain`; features nunca dependem entre si; `app` conecta tudo. As features (`feature/explore`, `detail`, `favorites`, `settings`) entram nas fatias 5b–5d e **só criam o submódulo que tiver conteúdo próprio** (`domain`, `data`, `presentation`); um submódulo vazio não é criado. Dados que mais de uma feature usa (`FavoritesRepository`, `SettingsRepository`, o modelo `SpeciesSummary`) ficam em `core:domain`; as implementações ficam onde estão suas dependências pesadas (Room em `core:database`, DataStore em `feature/settings/data`) e são ligadas no módulo Koin do `app`. `core:data` fica só com a rede.

**Componentes de feature não vão para o design system:** o `core:design-system` só tem componentes genéricos, sem Room, sem mapa e sem player. Isso mantém o módulo `snapshots` (Paparazzi) livre de bibliotecas nativas (MapLibre).

### Convention plugins (`build-logic`)
`kmp-library`, `kmp-domain` (sem Android), `kmp-feature` (biblioteca + Compose + Koin), `compose`, `koin`, `ktor`, `room`, `kotlinx-serialization`, `android-application`. Catálogo de versões único em `gradle/libs.versions.toml`; nenhuma versão fixa em arquivos de build.

### Versões
O **primeiro passo do plano** valida e fixa o conjunto de versões estáveis (Kotlin, Compose Multiplatform 1.11.x, AGP, Gradle, KSP, Room 2.8.x, Ktor, Koin, Coil 3, Kermit, Paparazzi, SDKs) compilando um projeto mínimo com todos os plugins juntos, e prova três pontos de risco:
1. o Paparazzi renderiza um componente com `Res.font`/`Res.string` do Compose Multiplatform (§8);
2. o Room com `BundledSQLiteDriver` abre um banco em memória no teste local da JVM do host (`androidUnitTest`); se o artefato Android não trouxer a biblioteca nativa do desktop, usa-se `androidx.sqlite:sqlite-bundled-jvm` no classpath de teste, um alvo `jvm()` ou `iosSimulatorArm64Test`;
3. o plugin de biblioteca KMP do AGP convive com o módulo `snapshots`.

Se o Paparazzi não fechar com o conjunto, troca-se por Roborazzi (ADR-0010) e registra-se um ADR.

## 4. Camada de dados (`core:data`)

- `HttpClient` Ktor com `ContentNegotiation` (JSON), timeouts e `defaultRequest { url(baseUrl) }`; engine OkHttp no Android e Darwin no iOS. `Logging` do Ktor só quando `AppConfig.isDebug`.
- **`DataError.Network`** é um tipo selado: `NoConnection`, `Timeout`, `NotFound`, `InvalidParameter`, `RateLimited(retryAfterSeconds: Int?)`, `ServiceUnavailable`, `Internal`, `Unknown`.
- `safeCall` converte falhas em `Result<T, DataError.Network>`:
  - `Content-Type: application/problem+json` → mapeia o `code`: `SPECIES_NOT_FOUND` e `NOT_FOUND` → `NotFound`; `INVALID_PARAMETER` e `METHOD_NOT_ALLOWED` → `InvalidParameter`; `RATE_LIMITED` → `RateLimited` (lê o cabeçalho `Retry-After`); `SERVICE_UNAVAILABLE` → `ServiceUnavailable`; `INTERNAL` → `Internal`; `code` desconhecido → `Unknown`.
  - **Resposta que não é problem+json** (por exemplo o 404 `text/plain` que o Traefik devolve quando as duas réplicas do BFF estão paradas, ou 502/503/504 de proxy): classifica pelo status — 404, 502, 503 e 504 → `ServiceUnavailable`; demais 5xx → `Internal`; qualquer outro → `Unknown`. Um 404 sem problem+json **nunca** vira `NotFound`.
  - Sem conexão e timeout do Ktor → `NoConnection` e `Timeout`; corpo inválido → `Unknown`.
- Nesta fatia só `GET /v1/filters` é implementado, como prova de conexão. O restante do contrato entra nas fatias de cada feature.
- Testes em `commonTest` com `MockEngine`: sucesso, **cada** `code` do OpenAPI, cada status sem problem+json (404 texto puro, 502, 503, 504, 500), `Retry-After`, timeout, corpo inválido.

## 5. Conexão ao compose local (BACKLOG P2)

- **`AppConfig(isDebug, baseUrl, mediaHostOverride)`**, injetada pelo Koin e preenchida por cada plataforma. Os módulos KMP compilam uma vez só e não têm build types, então debug/release **não** vem de `BuildKonfig` dentro do código compartilhado:
  - `androidApp`: `BuildConfig.DEBUG` e `buildConfigField` por build type (`debug`, `releaseLocal`, `release`; ver a 5e);
  - iOS: `#if DEBUG` / xcconfig por configuração do Xcode, passando os valores a `MainViewController`.
  - Tudo que é "só debug" lê `AppConfig.isDebug`: o destino de depuração, o `MediaUrlRewriter` e o log do Ktor.
- `baseUrl` por plataforma: emulador Android `http://10.0.2.2:<porta do Traefik>`; simulador iOS `http://localhost:<porta>`; aparelho físico lê `bff.baseUrl` de `local.properties` (Android) ou do xcconfig (iOS).
- Texto puro (cleartext) permitido **só no debug**: Android, network security config no source set `debug`; **iOS, exceção de App Transport Security só na configuração Debug** (`NSAllowsLocalNetworking`/exceção para `localhost`, sem `NSAllowsArbitraryLoads` no release). Release exige HTTPS (MASVS, spec §9).
- **Mídia:** o BFF monta URLs com `MEDIA_BASE_URL` (hoje `http://localhost:${HOST_PORT_S3_UI}/...`). No debug, o app reescreve **somente o host** dessas URLs para o host alcançável pela plataforma (`MediaUrlRewriter`, ativo só com `AppConfig.isDebug`; a porta já vem na URL). A reescrita é aplicada no mapper, ao montar o domínio, então vale para fotos e áudio. O compose não muda.
- **Aparelho físico:** `docker-compose.device.yml` opcional (em `passarim-docs`) republica as portas do Traefik e do SeaweedFS fora de `127.0.0.1`, **apenas para teste local em rede confiável**. Como o Compose concatena listas de `ports`, o override usa `ports: !override` (Compose ≥ 2.24) para substituir, e não somar, os mapeamentos `127.0.0.1`. O host reescrito é o de `bff.baseUrl`.
- O README documenta os três casos (emulador, simulador, aparelho).

## 6. Tema (`core:design-system`)

- **Pré-requisito de design (em `passarim-docs`, já feito):** `passarim-tokens.json` cobre todos os papéis do `ColorScheme` do Material 3 (`background`, `onBackground`, `surfaceDim`, `surfaceBright`, `surfaceContainerLowest/Low/High/Highest`) e os 15 estilos de tipografia, para que nenhum papel caia no baseline lilás do Material nem em `FontFamily.Default`. `background` = `surface`, mantendo o fundo único da etapa 4.
- `Color.kt` com `PassarimLightColors` e `PassarimDarkColors` coladas de `docs/design/tokens/TOKENS.md` (gerado pelo `build-tokens.mjs`), **preenchendo todos os parâmetros do `ColorScheme`**. Uma regra no README do app diz que mudanças de cor começam no `passarim-tokens.json`.
- Tipografia Manrope (variável) como recurso de fonte do Compose Multiplatform; os **15** estilos de `TOKENS.md` mapeados para `Typography`, todos com a família Manrope.
- Formas 12/16/28dp em `Shapes`; espaçamento e alvo de toque como constantes.
- `PassarimTheme(darkTheme, dynamicColor)`: ambos parâmetros existem desde já; `dynamicColor` fica `false` até a 5d ligar o seletor.
- Selo de conservação (`ConservationBadge`) com as cores por tema em um `CompositionLocal`; primeiro componente do design system e primeiro snapshot. O selo **não** segue as cores dinâmicas (as cores semânticas dos status são fixas).
- Ícone adaptativo (`foreground`, `background`, `monochrome`) importado dos SVGs de `docs/design/icon/` como VectorDrawable; splash com o ícone de `splash.svg` (Android 12+). No iOS, AppIcon e Launch Screen a partir dos mesmos SVGs.

## 7. Navegação e DI

- Navegação type-safe (Compose Navigation multiplataforma, rotas `@Serializable`, nomes `<Tela>Route`). O `app` hospeda um `NavHost` raiz com duas camadas:
  - **`TabsRoute`**: o scaffold com `NavigationBar` e três grafos de aba (`ExploreRoute`, `FavoritesRoute`, `SettingsRoute`), cada um com pilha própria e `saveState`/`restoreState` ao trocar de aba;
  - **destinos de tela cheia, fora do scaffold e sem barra inferior** (como nos mockups): `DetailRoute(id)`, `AboutRoute`, `StorageRoute`, `LicensesRoute` e `DebugRoute` (só `AppConfig.isDebug`). Eles empilham **sobre** as abas; voltar retorna à aba de origem.
  - Features expõem callbacks (`onOpenDetail(id)`, `onOpenFavorites()`, `onOpenExplore()`), e o `app` os liga às rotas. Assim "Ver favoritos" (erro de rede), "Explorar aves" (favoritos vazio) e "Voltar para Explorar" (ave não encontrada) funcionam sem uma feature depender da outra.
  - Enquanto a 5c não existe, `DetailRoute` aponta para um placeholder dentro do `app`.
- Koin: módulos por camada; `app` monta `startKoin` (Android no `Application`, iOS no `MainViewController`). ViewModels com `koinViewModel()`.
- MVI (`State`, `Action`, `Event`, ViewModel) é aplicado a partir das features; na 5a só a tela de depuração o usa, como exemplo mínimo.
- Strings de interface em recursos do Compose Multiplatform (`composeResources`), não em literais no código.

## 8. Testes e CI

- **Lógica:** `commonTest` com `kotlin.test`, Turbine e AssertK, em todas as fatias (ver decisões, §1). ADR registra o desvio do §10 do spec geral.
- **Snapshots:** módulo `snapshots` (`com.android.library` + Paparazzi) depende de `core:design-system` e, a partir da 5b, de cada `feature/*/presentation`; renderiza o componente nos temas claro e escuro e com fonte 1.0×, 1.3× e 2.0× (matriz: **todas** as escalas nos **dois** temas). Referências gravadas no repositório. A tela da splash **não** entra: é da SplashScreen API do sistema (o ícone tem preview próprio).
- **CI (GitHub Actions):** job Linux — `ktlintCheck`, `detekt`, testes, `verifyPaparazzi`, `assembleDebug`, `osv-scanner`; job macOS — `linkDebugFrameworkIosSimulatorArm64`. Cache do Gradle. gitleaks e Dependabot (Gradle e Actions) desde o primeiro commit.
- **Segredos/segurança:** nenhum segredo no app; R8 no release; HTTPS-only fora do debug (Android e iOS); sem certificate pinning (ADR-0008).
- **ADRs:** cada decisão vira ADR **na fatia que a toma** (5a: framework de teste e módulo `snapshots` Android puro, com a atualização do ADR-0010; 5c: mapa e `AudioPlayer`; 5e: o que restar).

## 9. Estrutura do repositório e comentários

- Repositório novo `passarim-app` (GitHub `velosobr/passarim-app`), `main` direto, commits `<tipo>: mensagem` em português como nos outros repositórios.
- Código comentado em português, para estudante, identificadores em inglês (mesma regra do restante do projeto).

## 10. Riscos

| Risco | Mitigação |
|---|---|
| Incompatibilidade entre AGP, plugin KMP-library, Room KSP e Paparazzi | Primeiro passo do plano valida o conjunto; fallback Roborazzi com ADR |
| Paparazzi não roda em módulo KMP | Módulo `snapshots` Android puro (já no desenho) |
| Paparazzi não resolve `Res.font`/`Res.string` do Compose Multiplatform | Snapshot do selo já os usa (critério 4); fallback: fonte/strings injetadas por parâmetro nos snapshots, registrado em ADR |
| `BundledSQLiteDriver` sem biblioteca nativa no teste da JVM do host | Prova no primeiro passo (§3); alternativas listadas |
| Xcode/Gradle no macOS do CI consumindo minutos | Job iOS só linka o framework; repositório público tem minutos gratuitos |
| Aparelho físico não alcança o compose | `docker-compose.device.yml` opcional e `bff.baseUrl` em `local.properties` |
| Mídia local com `localhost` no emulador | Reescrita de host só em debug |
| Debug/release dentro de código compartilhado | `AppConfig` injetada pela plataforma (§5), nunca `BuildKonfig` no `commonMain` |

## 11. Perguntas em aberto

Nenhuma bloqueante. Versões exatas são fixadas no primeiro passo do plano; qualquer troca (por exemplo, Roborazzi) vira ADR.
