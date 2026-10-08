# Passarim — Etapa 5c: Detalhe da ave

Data: 2026-10-08 · Depende de: 5a e 5b · Contrato: `passarim-bff/openapi.yaml` (`GET /v1/species/{id}`) · Telas: `docs/design/mockups/png/{detalhe,loading-detalhe,erro-nao-encontrada}.*`

Decisões do redator estão marcadas com **[DR]** e listadas no fim.

## 1. Objetivo

A tela de **Detalhe**: hero com foto, nome e selo de conservação, fatos, biomas, dieta, **player de canto**, descrição, curiosidades, galeria e **"Onde encontrar"** (mapa com clusters e lista de estados), sempre com os créditos exigidos pelas licenças (ADR-0007).

### Critérios de pronto
1. Abrir uma ave pelo Explorar mostra todas as seções do mockup com dados reais do BFF.
2. O player toca o canto no emulador, mostra progresso e tempo, pausa e retoma; ao sair da tela ou ir para o segundo plano, para o áudio.
3. Campos nulos não quebram a tela: sem foto, sem áudio, sem `sizeCm`, sem `diet`, sem status de conservação e sem `clusters` renderizam sem seção vazia nem texto "null".
4. `SPECIES_NOT_FOUND` mostra "Ave não encontrada"; rede e servidor mostram os estados de erro da 5b; loading mostra o skeleton.
5. O mapa mostra os clusters; sem rede (tiles indisponíveis) a seção cai para a lista de estados com um aviso, sem travar a tela.
6. Snapshots Paparazzi (completo, sem áudio, sem foto, loading, não encontrada) em claro, escuro e 1.3×; testes verdes; CI verde.

**Fora do escopo:** compartilhar, tela cheia da galeria, navegação offline do mapa.

## 2. Pré-requisito de design (em `passarim-docs`)

O contrato devolve `conservationStatus.code ∈ {LC, NT, VU, EN, CR, EW, EX, DD}`, mas os tokens só têm 6 status. Antes de codar o selo, estender `passarim-tokens.json` com `EX` e `DD` (cores por tema, contraste ≥ 4.5:1 verificado por `check-tokens`), regenerar `_base.css` e `TOKENS.md`. Status desconhecido cai em `DD` e nunca quebra.

## 3. Módulos

`feature/detail/{domain,data,presentation}`. `core/domain` ganha `AudioPlayer` (interface) e `Credit`. A implementação de `AudioPlayer` é `expect/actual` em `feature/detail/presentation`: Media3 ExoPlayer no Android; AVPlayer no iOS (compila na 5c, validação visual na 5e).

## 4. Domínio e dados

- `SpeciesDetail`: `id`, `commonName`, `scientificName`, `family`, `conservation?`, `sizeCm?`, `diet?`, `description`, `descriptionCredit`, `facts`, `biomes` (do campo `chips`), `photos`, `audio?`, `whereToFind(states, biomes, clusters)`.
- `DetailRepository.get(id): Result<SpeciesDetail, DataError.Network>`; mapper trata `nullable` do contrato. `id` validado contra `^[a-z0-9-]{1,80}$` antes da chamada.
- **Fotos:** a primeira é a principal; usar `largeUrl` no hero e `mediumUrl` na galeria, com queda para o outro tamanho quando um for nulo. `photos` vazio → hero com placeholder.
- **Chip de dieta não existe** (o `diet` é texto livre): a seção "Dieta" mostra o texto, e os chips mostram só biomas rotulados.

## 5. Estado (MVI)

`DetailState`: `phase` (`Loading` | `Content(detail)` | `NotFound` | `Error(kind)`), `isFavorite`, `player` (`Idle` | `Loading` | `Playing(positionMs)` | `Paused(positionMs)` | `Error`). Ações: `Retry`, `ToggleFavorite`, `TogglePlay`, `Seek`, `OpenCredit(url)`.

- `id` vem do argumento da rota (sobrevive à morte do processo).
- **Player:** um só `AudioPlayer` por tela, liberado em `onCleared`; pausa ao perder o foco do ciclo de vida; a duração mostrada vem de `audio.durationMs`, a posição do player; erro de reprodução mostra "Não foi possível tocar o canto" e permite tentar de novo.
- **Reprodução automática:** lê `autoPlay` de `SettingsRepository` (interface em `core/domain`, padrão `false` até a 5d implementar).
- **Links de crédito:** só abrem `https://` (valida o esquema antes de chamar o `UriHandler`); qualquer outro vira texto sem link (API10 do spec).

## 6. Mapa "Onde encontrar" **[DR]**

- Biblioteca: `maplibre-compose` (MapLibre para Compose Multiplatform) com o estilo vetorial público do OpenFreeMap (sem chave); clusters como camada de círculos com a contagem (`count`), câmera ajustada aos limites dos clusters (Brasil inteiro quando não houver).
- Os tiles são buscados pelo app (não pelo BFF); nenhum dado pessoal é enviado. Se a biblioteca não estiver estável no conjunto de versões da 5a, o fallback é a lista de estados (chips) com um mapa estático — decisão registrada em ADR.
- Abaixo do mapa: chips com as siglas de `states`.

## 7. UI

`DetailRoot`/`DetailScreen`; componentes novos no design system: `HeroPhoto`, `FactTile`, `LabeledChips`, `AudioPlayerCard`, `CreditCaption`, `PhotoGallery`, `SpeciesMap`. Seções ausentes não ocupam espaço. Botão voltar e favoritar sobre o hero com fundo translúcido legível nos dois temas. Créditos de foto e canto sempre visíveis (autor · licença).

## 8. Testes

- ViewModel: carregamento, cada erro, `NotFound`, favoritar, estados do player com `AudioPlayer` falso (play, pause, seek, erro, liberar ao sair), auto-play ligado/desligado.
- Mappers: todos os campos nulos, status `EX`/`DD`/desconhecido, fotos sem um dos tamanhos.
- Segurança: URL de crédito `javascript:`/`http:` não abre.
- Paparazzi: variações da §1.6; o mapa é substituído por um placeholder nos snapshots (tiles são externos).

## 9. Riscos

| Risco | Mitigação |
|---|---|
| `maplibre-compose` instável em alguma plataforma | fallback para lista de estados (ADR) |
| Áudio vazando em segundo plano | liberar no `onCleared` e pausar no ciclo de vida; teste com player falso |
| URL de mídia local inalcançável | `MediaUrlRewriter` da 5a também para o áudio |

## 10. Decisões do redator **[DR]**

OpenFreeMap + `maplibre-compose`; `AudioPlayer` próprio (`expect/actual`) em vez de biblioteca KMP de mídia; sem tela cheia da galeria; só links `https`.
