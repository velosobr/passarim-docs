# Passarim — Etapa 5b: Explorar

Data: 2026-10-08 · Depende de: 5a (`2026-10-08-passarim-app-fundacao-design.md`) · Contrato: `passarim-bff/openapi.yaml` · Telas: `docs/design/mockups/png/{explorar,busca-ativa,explorar-vazio,filtros,loading-explorar,erro-sem-internet,erro-servidor}.*`

Decisões do redator estão marcadas com **[DR]** e listadas no fim; o dono pode trocá-las sem afetar o resto.

## 1. Objetivo

A aba **Explorar**: grade de aves em 2 colunas, busca por nome, filtros de bioma e estado, paginação infinita, favoritar no card e estados de loading, vazio e erro, tudo contra o BFF local.

### Critérios de pronto
1. Com o compose no ar, Explorar lista as aves reais, rola e carrega as próximas páginas até o fim (`nextCursor == null`).
2. Buscar "azul" mostra 3 aves; combinar com um bioma sem resultado mostra o estado vazio com "Limpar filtros".
3. O sheet de filtros mostra biomas e estados com as contagens de `GET /v1/filters`; aplicar e limpar funciona; os filtros selecionados aparecem como chips selecionados.
4. Derrubar a rede mostra "Sem conexão" com "Tentar novamente"; parar o BFF mostra "Serviço indisponível".
5. Tocar num card navega para o destino `Detail(id)` (a tela real chega na 5c; até lá, um placeholder).
6. Snapshots Paparazzi de grade, loading, vazio, erro e sheet de filtros em claro, escuro e fonte 1.3×; testes de ViewModel verdes; CI verde.

**Fora do escopo:** persistência dos favoritos (a 5d troca a implementação), ordenação, "Identificar pássaro" (v2).

## 2. Módulos

`feature/explore/{domain,data,presentation}`. `core/domain` ganha `SpeciesSummary` e `ConservationStatus` (usados por Explorar, Detalhe e Favoritos) e a interface `FavoritesRepository`. `app` registra o destino `Explore`.

## 3. Domínio e dados

- `SpeciesSummary(id, commonName, scientificName, thumbnailUrl: String?, conservation: ConservationStatus?)` — `thumbnailUrl` e `conservationStatus` são **nulos** no contrato.
- `ExploreRepository.list(query: String, biome: BiomeCode?, state: StateCode?, cursor: String?, limit: Int = 20): Result<SpeciesPage, DataError.Network>` e `FiltersRepository.get(): Result<Filters, DataError.Network>`.
- DTOs e mappers em `feature/explore/data`; nunca expor DTO ao domínio. `limit` fixo em 20 **[DR]**.
- `FavoritesRepository` (em `core/domain`): `observeIds(): Flow<Set<String>>` e `toggle(summary)`. Na 5b o `app` registra uma implementação **em memória** (`InMemoryFavoritesRepository`, em `core/data`); a 5d a substitui por Room, sem tocar nas features.
- Mídia: `MediaUrlRewriter` (5a) aplicado antes do Coil; Coil 3 com `coil-network-ktor3` reaproveitando o `HttpClient`.

## 4. Estado (MVI) e regras

`ExploreState`: `query`, `biome`, `state`, `items`, `nextCursor`, `phase` (`Loading` | `Content` | `Empty` | `Error(kind)`), `isLoadingMore`, `loadMoreError`, `filters` (carregamento próprio), `filtersSheetOpen`, `favoriteIds`.

- **Busca com debounce de 400 ms** **[DR]**; cada nova busca cancela a anterior (`collectLatest`); `q` aparado e limitado a 100 caracteres na entrada (o BFF rejeita acima disso).
- Mudar `query`/`biome`/`state` zera a lista e o cursor e volta a `Loading`.
- **Paginação:** pedir a próxima página quando o item visível estiver a 6 do fim; ignorar se já houver requisição em curso ou `nextCursor == null`.
- **Erros → tela** (do `code` do problem+json e de falhas de rede): sem rede/timeout → "Sem conexão"; `SERVICE_UNAVAILABLE`/`INTERNAL` → "Serviço indisponível"; `RATE_LIMITED` → mensagem curta e "Tentar novamente" depois de `Retry-After`; `INVALID_PARAMETER` não deve ocorrer (UI limita entradas) e cai em genérico. Erro na **página seguinte** é uma linha no fim da grade com "Tentar novamente", sem perder os itens.
- Filtros carregados uma vez por sessão (em memória); falha mostra "Tentar novamente" dentro do sheet.
- Estado de busca e filtros sobrevive à morte do processo via `SavedStateHandle`.
- Eventos: navegar para o detalhe; mostrar mensagem pontual.

## 5. UI (mockups como referência)

- `ExploreRoot` (Koin, ViewModel, eventos) e `ExploreScreen` (stateless, previews). Componentes novos no `core/design-system`: `SpeciesCard` (foto com placeholder "foto ilustrativa", favorito 48dp, nome PT, científico em itálico), `SearchField`, `FilterChip`, `FiltersSheet`, `StateScreen` (ícone, título, texto, ação), `SkeletonBox`.
- Grade `LazyVerticalGrid` com 2 colunas, `key = id`, `contentType` fixo. Nomes longos quebram linha, nunca cortam (verificado a 1.3×).
- Acessibilidade: `contentDescription` no favorito ("Favoritar Bem-te-vi" / "Desfavoritar ..."), alvo ≥ 48dp.

## 6. Testes

- ViewModel (JUnit5 no `androidUnitTest`, ou `kotlin.test` comum, Turbine, AssertK, repositórios falsos): debounce com tempo virtual, cancelamento de busca antiga, paginação até o fim, reset ao mudar filtro, cada categoria de erro, erro na página seguinte preservando itens, favoritar.
- Mappers: campos nulos (`thumbnailUrl`, `conservationStatus`), status desconhecido.
- Paparazzi: grade, loading, vazio, erro (rede e servidor), sheet de filtros; claro/escuro/1.3×.

## 7. Riscos

| Risco | Mitigação |
|---|---|
| Rolagem lenta com muitas fotos | `key`/`contentType`, Coil com tamanho do card, teste manual de rolagem em debug |
| Corrida entre busca e paginação | `collectLatest` e um único `Job` de carregamento por consulta |
| Lista com `q` não é cacheada no BFF (spec do BFF) | debounce e limite de 100 caracteres; `RATE_LIMITED` tratado na UI |

## 8. Decisões do redator **[DR]**

`limit` 20; debounce 400 ms; pré-carga a 6 itens do fim; favoritos em memória até a 5d; filtros em memória por sessão.
