# Passarim — Etapa 5a: Fundação do app (KMP + Compose Multiplatform)

Data: 2026-10-08 · Origem: `2026-10-01-passarim-design.md` §6, §10, §13 (etapa 5), ADR-0009 e ADR-0010 · Insumos: `docs/design/` (tokens, ícone, mockups), `passarim-bff/openapi.yaml`, `BACKLOG.md` (seção passarim-app)

## 1. Contexto e decomposição

A etapa 5 (`passarim-app`) é grande demais para um único spec e plano. Ela é dividida em fatias verticais, cada uma com seu ciclo spec → plano → execução:

| Fatia | Conteúdo |
|---|---|
| **5a — Fundação (este spec)** | Projeto, módulos, convention plugins, tema, DI, navegação com 3 abas, camada de dados contra o BFF, conexão ao compose local, pipeline Paparazzi e CI |
| 5b — Explorar | Busca, filtros, grid, paginação infinita, loading, vazio e erros |
| 5c — Detalhe | Hero, conservação, player de canto, galeria, "Onde encontrar" (mapa) |
| 5d — Favoritos e Configurações | Room KMP, DataStore, tema Sistema/Claro/Escuro, cores dinâmicas, Sobre, Dados e armazenamento |
| 5e — Fechamento | Matriz completa de snapshots (claro/escuro, fonte 1.0×/1.3×/2.0×), validação no iOS, release com R8, acessibilidade, resiliência e documentação |

Specs das demais fatias: [5b](2026-10-08-passarim-app-explorar-design.md) · [5c](2026-10-08-passarim-app-detalhe-design.md) · [5d](2026-10-08-passarim-app-favoritos-configuracoes-design.md) · [5e](2026-10-08-passarim-app-fechamento-design.md).

**Decisões já tomadas:**
- **Plataformas:** Android primeiro, com o iOS compilando. Todo o código de produto fica em `commonMain`. O iOS só precisa linkar o framework e abrir no simulador; a validação visual completa no iOS fica para depois.
- **Identificador:** `com.velosobr.passarim` (pacote Kotlin, `applicationId` e bundle id).
- **Arquitetura:** a das skills `android-*` do dono (feature-layered, Clean Architecture, MVI, Koin, Ktor, Room, Result tipado, navegação type-safe), adaptada ao KMP.

## 2. Objetivo da 5a

Entregar uma base que as fatias 5b–5e só precisam preencher: o app abre, o tema vem dos tokens, as 3 abas navegam, a camada de dados fala com o BFF local, e o pipeline de snapshots e o CI estão provados com um componente real.

### Critérios de pronto
1. `./gradlew :androidApp:assembleDebug` verde; o app abre no emulador com splash e as abas **Explorar · Favoritos · Configurações** (conteúdo vazio, navegáveis), em claro e escuro.
2. O framework iOS linka (`linkDebugFrameworkIosSimulatorArm64`) e o app abre no simulador (placeholder das abas).
3. Um teste de integração manual documentado prova a conexão: com o `docker compose` local no ar, o app (emulador) busca `GET /v1/filters` e exibe a contagem de biomas numa tela de depuração (somente debug).
4. Pelo menos um componente do design system (o selo de conservação) tem snapshot Paparazzi em tema claro, escuro e fonte ampliada, e `verifyPaparazzi` roda no CI.
5. CI verde: ktlint, detekt, testes unitários, `verifyPaparazzi`, `assembleDebug` (Linux) e `linkDebugFrameworkIosSimulatorArm64` (macOS).
6. README do `passarim-app` com diagrama Mermaid de módulos e instruções para rodar contra o compose local.

**Fora da 5a:** qualquer tela de produto (Explorar, Detalhe, Favoritos, Configurações reais), Room (só o módulo vazio), mapa, player de áudio, publicação nas lojas.

## 3. Módulos

```text
passarim-app/
  build-logic/              convention plugins
  androidApp/               casca Android fina: Application, manifest, splash, network security config
  iosApp/                   projeto Xcode que consome o framework
  app/                      KMP: App() raiz, grafo de navegação, setup do Koin, framework iOS
  core/domain/              modelos compartilhados, Result, DataError, interfaces de repositório
  core/data/                HttpClient (Ktor), safeCall, parser de problem+json, BffConfig
  core/presentation/        UiText, ObserveAsEvents
  core/design-system/       tema (Manrope, cores, formas), componentes, selo de conservação
  core/database/            Room KMP (só o esqueleto; entra de verdade na 5d)
  snapshots/                módulo Android puro com Paparazzi
```

Regras de dependência (das skills): `presentation → domain ← data`; `domain` só depende de `core:domain`; features nunca dependem entre si; `app` conecta tudo. As features (`feature/explore`, `detail`, `favorites`, `settings`, cada uma com `domain`, `data` e `presentation`) entram nas fatias 5b–5d. Dados que mais de uma feature usa (por exemplo, `FavoritesRepository` e o modelo de resumo da espécie) ficam em `core:domain`.

### Convention plugins (`build-logic`)
`kmp-library`, `kmp-domain` (sem Android), `kmp-feature` (biblioteca + Compose + Koin), `compose`, `koin`, `ktor`, `room`, `kotlinx-serialization`, `android-application`. Catálogo de versões único em `gradle/libs.versions.toml`; nenhuma versão fixa em arquivos de build.

### Versões
O **primeiro passo do plano** valida e fixa o conjunto de versões estáveis (Kotlin, Compose Multiplatform 1.11.x, AGP, Gradle, KSP, Room 2.8.x, Ktor, Koin, Coil 3, Kermit, Paparazzi) compilando um projeto mínimo com todos os plugins juntos. Se o Paparazzi não fechar com o conjunto, troca-se por Roborazzi (ADR-0010) e registra-se um ADR.

## 4. Camada de dados (`core:data`)

- `HttpClient` Ktor com `ContentNegotiation` (JSON), timeouts e `defaultRequest { url(baseUrl) }`; engine OkHttp no Android e Darwin no iOS.
- `safeCall` converte falhas em `Result<T, DataError.Network>`: sem conexão, timeout, erro de servidor e o `code` do `application/problem+json` do BFF (`SPECIES_NOT_FOUND`, `INVALID_PARAMETER`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`, `INTERNAL`).
- Nesta fatia só `GET /v1/filters` é implementado, como prova de conexão. O restante do contrato entra nas fatias de cada feature.
- Testes em `commonTest` com `MockEngine`: sucesso, cada `code`, timeout, corpo inválido.

## 5. Conexão ao compose local (BACKLOG P2)

- `BASE_URL` por plataforma via BuildKonfig: emulador Android `http://10.0.2.2:<porta do Traefik>`; simulador iOS `http://localhost:<porta>`; aparelho físico lê `bff.baseUrl` de `local.properties`.
- Texto puro (cleartext) permitido **só no debug** (network security config no source set `debug`); release exige HTTPS (MASVS, spec §9).
- **Mídia:** o BFF monta URLs com `MEDIA_BASE_URL` (hoje `localhost`). No debug, o app reescreve o host dessas URLs para o endereço alcançável pela plataforma (`MediaUrlRewriter`, ativo só quando `BuildKonfig.DEBUG`). O compose não muda. Para aparelho físico, um `docker-compose.device.yml` opcional (em `passarim-docs`) publica as portas do Traefik e do SeaweedFS além de `127.0.0.1`, apenas para teste local.
- O README documenta os três casos (emulador, simulador, aparelho).

## 6. Tema (`core:design-system`)

- `Color.kt` com `PassarimLightColors` e `PassarimDarkColors` coladas de `docs/design/tokens/TOKENS.md` (gerado pelo `build-tokens.mjs`). Uma regra no README do app diz que mudanças de cor começam no `passarim-tokens.json`.
- Tipografia Manrope (variável) como recurso de fonte do Compose Multiplatform; os 9 estilos de `TOKENS.md` mapeados para `Typography`.
- Formas 12/16/28dp em `Shapes`; espaçamento e alvo de toque como constantes.
- `PassarimTheme(darkTheme, dynamicColor)`: ambos parâmetros existem desde já; `dynamicColor` fica `false` até a 5d ligar o seletor.
- Selo de conservação (`ConservationBadge`) com as cores por tema em um `CompositionLocal`; primeiro componente do design system e primeiro snapshot.
- Ícone adaptativo (`foreground`, `background`, `monochrome`) importado dos SVGs de `docs/design/icon/` como VectorDrawable; splash com o ícone de `splash.svg` (Android 12+).

## 7. Navegação e DI

- Navegação type-safe (Compose Navigation multiplataforma, rotas `@Serializable`): três destinos de aba com `NavigationBar` do design system e um destino de depuração `Debug` (só debug) com a prova de conexão.
- Koin: módulos por camada; `app` monta `startKoin` (Android no `Application`, iOS no `MainViewController`). ViewModels com `koinViewModel()`.
- MVI (`State`, `Action`, `Event`, ViewModel) é aplicado a partir das features; na 5a só a tela de depuração o usa, como exemplo mínimo.

## 8. Testes e CI

- **Lógica:** `commonTest` com `kotlin.test`, Turbine e AssertK (JUnit5 só no `androidUnitTest`, porque o KMP não o usa em `commonMain`).
- **Snapshots:** módulo `snapshots` (`com.android.library` + Paparazzi) depende de `core:design-system` e renderiza o componente nos temas claro e escuro e com fonte 1.0×, 1.3× e 2.0×. Referências gravadas no repositório.
- **CI (GitHub Actions):** job Linux — `ktlintCheck`, `detekt`, testes, `verifyPaparazzi`, `assembleDebug`; job macOS — `linkDebugFrameworkIosSimulatorArm64`. Cache do Gradle. gitleaks e Dependabot (Gradle e Actions) desde o primeiro commit.
- **Segredos/segurança:** nenhum segredo no app; R8 no release; HTTPS-only fora do debug; sem certificate pinning (ADR-0008).

## 9. Estrutura do repositório e comentários

- Repositório novo `passarim-app` (GitHub `velosobr/passarim-app`), `main` direto, commits `<tipo>: mensagem` em português como nos outros repositórios.
- Código comentado em português, para estudante, identificadores em inglês (mesma regra do restante do projeto).

## 10. Riscos

| Risco | Mitigação |
|---|---|
| Incompatibilidade entre AGP, plugin KMP-library, Room KSP e Paparazzi | Primeiro passo do plano valida o conjunto; fallback Roborazzi com ADR |
| Paparazzi não roda em módulo KMP | Módulo `snapshots` Android puro (já no desenho) |
| Xcode/Gradle no macOS do CI consumindo minutos | Job iOS só linka o framework; repositório público tem minutos gratuitos |
| Aparelho físico não alcança o compose | `docker-compose.device.yml` opcional e `bff.baseUrl` em `local.properties` |
| Mídia local com `localhost` no emulador | Reescrita de host só em debug |

## 11. Perguntas em aberto

Nenhuma bloqueante. Versões exatas são fixadas no primeiro passo do plano; qualquer troca (por exemplo, Roborazzi) vira ADR.
