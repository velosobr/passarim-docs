# Passarim — Etapa 5c: Detalhe da ave

Data: 2026-10-08 · Depende de: 5a e 5b · Contrato: `passarim-bff/openapi.yaml` (`GET /v1/species/{id}`) · Telas: `docs/design/mockups/png/{detalhe,loading-detalhe,erro-nao-encontrada}.*`

Decisões do redator estão marcadas com **[DR]** e listadas no fim.

## 1. Objetivo

A tela de **Detalhe**: hero com foto, nome e selo de conservação, fatos, biomas, dieta, **player de canto**, descrição, curiosidades, galeria e **"Onde encontrar"** (mapa com clusters e lista de estados), sempre com os créditos exigidos pelas licenças (ADR-0007). É um destino de tela cheia (`DetailRoute(id)`), **sem barra inferior**, empilhado sobre as abas (5a §7).

### Critérios de pronto
1. Abrir uma ave pelo Explorar mostra todas as seções do mockup com dados reais do BFF.
2. O player toca o canto no emulador **e no simulador iOS** (a sessão de áudio permite tocar com o aparelho no modo silencioso), mostra progresso e tempo, pausa e retoma; ao sair da tela ou ir para o segundo plano, pausa e libera o áudio.
3. Campos nulos **ou vazios** não quebram a tela: sem foto, sem áudio, sem `sizeCm`, sem `diet`, sem status de conservação, sem `clusters`, com autor ou link de crédito vazios (o BFF pode devolver `""`) renderizam sem seção vazia nem texto "null".
4. `NotFound` mostra "Ave não encontrada" (com "Voltar para Explorar"); rede e servidor mostram os estados de erro da 5b; loading mostra o skeleton.
5. O mapa mostra os clusters. Se o estilo ou os tiles do mapa não carregarem (servidor de tiles fora, por exemplo), a seção cai para a lista de estados com o aviso "Mapa indisponível", sem travar a tela (§6).
6. A atribuição do mapa ("© OpenFreeMap · dados © OpenStreetMap") fica visível sobre o mapa.
7. O projeto Xcode compila com o framework nativo do MapLibre (job macOS faz `xcodebuild` do `iosApp`, e não só o link do framework Kotlin).
8. Snapshots Paparazzi (completo, sem áudio, sem foto, loading, não encontrada) em claro e escuro × 1.0×/1.3×/2.0×; testes verdes; CI verde.

**Fora do escopo:** compartilhar, tela cheia da galeria, navegação offline do mapa, cache de áudio (§4).

## 2. Pré-requisito de design (em `passarim-docs`)

O contrato devolve `conservationStatus.code ∈ {LC, NT, VU, EN, CR, EW, EX, DD}`, mas os tokens só têm 6 status. Antes de codar o selo, estender `passarim-tokens.json` com `EX` e `DD` (cores por tema, contraste ≥ 4.5:1 verificado por `check-tokens`; **aprovado** como decisão do redator), regenerar `_base.css` e `TOKENS.md`. Rótulos: `EX` "Extinta", `DD` "Dados insuficientes".

**Status desconhecido:** o BFF já devolve `conservationStatus = null` para o que não conhece; o app trata `null` e qualquer código fora da lista como **ausente** (selo oculto). `DD` só aparece quando o BFF manda `DD`. O selo **não** segue as cores dinâmicas.

## 3. Módulos

`feature/detail/{domain,data,presentation}`. `core/domain` ganha `ConservationStatus` e `Credit`. A interface `AudioPlayer` fica em `feature/detail/domain` (só o Detalhe a usa); a implementação é `expect/actual` em `feature/detail/presentation`: Media3 ExoPlayer no Android; AVPlayer no iOS, com `AVAudioSession` na categoria `playback`.

`SettingsRepository` (interface em `core/domain`) é consumido aqui (`autoPlay`). Até a 5d, o `app` registra uma implementação **em memória** com os padrões, como foi feito com os favoritos na 5b.

## 4. Domínio e dados

- `SpeciesDetail`: `id`, `commonName`, `scientificName`, `family`, `conservation?`, `sizeCm?`, `diet?`, `description`, `descriptionCredit`, `facts`, `biomes` (do campo `chips`), `photos`, `audio?`, `whereToFind(states, biomes, clusters)`.
- `DetailRepository.get(id): Result<SpeciesDetail, DataError.Network>`; mapper trata os `nullable` do contrato e **trata string vazia como ausente** nos campos de crédito. `id` é validado contra `^[a-z0-9-]{1,80}$` **antes** da chamada; um `id` inválido resulta em `NotFound`, sem requisição.
- **Fotos:** a primeira é a principal; usar `largeUrl` no hero e `mediumUrl` na galeria, com queda para o outro tamanho quando um for nulo. `photos` vazio → hero com placeholder. O `MediaUrlRewriter` (5a) é aplicado no mapper (fotos e áudio).
- **Resumo para favoritos:** o Detalhe monta o `SpeciesSummary` do favorito com `commonName`, `scientificName` e `photos[0].thumbUrl`. Ao abrir o Detalhe de uma ave já favorita, o registro é atualizado (a miniatura pode mudar quando o worker troca a mídia).
- **Chip de dieta não existe** (o `diet` é texto livre): a seção "Dieta" mostra o texto, e os chips mostram só biomas rotulados.
- **Sem cache de áudio [DR]:** o canto é transmitido a cada reprodução; o cache de imagens (Coil) é o único cache do app (5d).

### Créditos
- `Credit(author, license, source, sourceUrl)`; vazio vira ausente. Autor ausente → "Autor não informado"; licença ausente → "Licença não informada"; `sourceUrl` ausente ou não `https` → texto sem link.
- **Formatação da licença** (`formatLicense`): o catálogo traz `CC0`, `CC-BY`, `CC-BY-NC`, `CC-BY-4.0` etc. O primeiro hífen vira espaço, e a versão final numérica é separada por espaço: `CC-BY-NC` → "CC BY-NC", `CC-BY-4.0` → "CC BY 4.0", `CC-BY-NC-SA-4.0` → "CC BY-NC-SA 4.0", `CC0` → "CC0".
- A linha **"Créditos e licenças desta ave"**, no fim do Detalhe, expande **no próprio lugar** uma lista com os créditos de foto(s), canto e texto (Wikipédia), cada um com autor · licença e, quando válido, o link.

## 5. Estado (MVI)

`DetailState`: `phase` (`Loading` | `Content(detail)` | `NotFound` | `Error(kind)`), `isFavorite`, `creditsExpanded`, `player` (`Idle` | `Loading` | `Playing(positionMs)` | `Paused(positionMs)` | `Error`). Ações: `Retry`, `ToggleFavorite`, `TogglePlay`, `Seek`, `ToggleCredits`, `OpenCredit(url)`.

- `id` vem do argumento da rota (sobrevive à morte do processo).
- **Player:** um só `AudioPlayer` por tela, **pausado e liberado** ao sair da tela (`onCleared`) e pausado ao perder o foco do ciclo de vida; a duração mostrada vem de `audio.durationMs`, a posição do player; erro de reprodução mostra "Não foi possível tocar o canto" e permite tentar de novo.
- **Reprodução automática:** lê `autoPlay` de `SettingsRepository` (padrão `false` até a 5d).
- **Links de crédito:** só abrem `https://` (valida o esquema antes de chamar o `UriHandler`); qualquer outro vira texto sem link (API10 do spec).

## 6. Mapa "Onde encontrar" **[DR]**

- Biblioteca: `maplibre-compose` (MapLibre para Compose Multiplatform) com o estilo vetorial público do OpenFreeMap (sem chave); clusters como camada de círculos com a contagem (`count`), câmera ajustada aos limites dos clusters (Brasil inteiro quando não houver). No iOS, o framework nativo do MapLibre entra no projeto Xcode (SPM ou CocoaPods).
- **Atribuição:** "© OpenFreeMap · dados © OpenStreetMap" visível sobre o mapa e repetida em Sobre (5d), como exigem os termos do OpenFreeMap e a ODbL.
- Os tiles são buscados pelo app (não pelo BFF); nenhum dado pessoal é enviado.
- **Fallback:** a lista de estados (chips) com o aviso "Mapa indisponível" — sem mapa estático. Dispara quando o carregamento do estilo falha ou quando nenhum tile carrega em 10 s (melhor esforço: a biblioteca detecta falha de estilo com segurança, mas não de tiles individuais). Se a biblioteca não ficar estável no conjunto de versões da 5a, o mapa é cortado e fica só a lista de estados, registrado em ADR **nesta fatia**.
- Abaixo do mapa: chips com as siglas de `states`.

## 7. UI

`DetailRoot`/`DetailScreen`. Componentes genéricos novos no design system: `HeroPhoto`, `FactTile`, `LabeledChips`, `CreditCaption`, `PhotoGallery`. **Em `feature/detail/presentation`:** `AudioPlayerCard` e `SpeciesMap` (dependem de player e de mapa; mantêm o design system livre de bibliotecas nativas). Seções ausentes não ocupam espaço. Botão voltar e favoritar sobre o hero com fundo translúcido legível nos dois temas. Créditos de foto e canto sempre visíveis (autor · licença). Com fonte 2.0×, os fatos passam de 3 colunas para coluna única.

## 8. Testes

- ViewModel (`kotlin.test`, Turbine, AssertK): carregamento, cada `DataError.Network`, `NotFound`, `id` inválido sem chamada, favoritar, estados do player com `AudioPlayer` falso (play, pause, seek, erro, liberar ao sair), auto-play ligado/desligado.
- Mappers: todos os campos nulos e vazios, status `EX`/`DD`/desconhecido (→ ausente), fotos sem um dos tamanhos, `formatLicense` (`CC0`, `CC-BY-NC`, `CC-BY-4.0`, `CC-BY-NC-SA-4.0`, vazio).
- Segurança: URL de crédito `javascript:`/`http:`/vazia não abre.
- Paparazzi: variações do critério 8; o mapa é substituído por um placeholder nos snapshots (tiles são externos).
- Verificação manual documentada: áudio no simulador iOS (incluindo modo silencioso) e fallback do mapa com o servidor de tiles bloqueado.

## 9. Riscos

| Risco | Mitigação |
|---|---|
| `maplibre-compose` instável em alguma plataforma | fallback para lista de estados (ADR nesta fatia) |
| Framework nativo do MapLibre quebra o projeto Xcode | `xcodebuild` do `iosApp` no job macOS (critério 7) |
| Áudio vazando em segundo plano | pausar e liberar ao sair/perder foco; teste com player falso |
| `.aac` do SeaweedFS com content-type que o AVPlayer recusa | teste manual no simulador nesta fatia (critério 2) |
| URL de mídia local inalcançável | `MediaUrlRewriter` da 5a também para o áudio |

## 10. Decisões do redator **[DR]**

OpenFreeMap + `maplibre-compose`; `AudioPlayer` próprio (`expect/actual`) em vez de biblioteca KMP de mídia; sem tela cheia da galeria; só links `https`; sem cache de áudio; status desconhecido = selo oculto; EX/DD aprovados; lista de estados como único fallback do mapa.
