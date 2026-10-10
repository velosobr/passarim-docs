# Passarim — Etapa 5b: Explorar

Data: 2026-10-08 · Depende de: 5a (`2026-10-08-passarim-app-fundacao-design.md`) · Contrato: `passarim-bff/openapi.yaml` · Telas: `docs/design/mockups/png/{explorar,busca-ativa,explorar-vazio,filtros,loading-explorar,erro-sem-internet,erro-servidor}.*`

Decisões do redator estão marcadas com **[DR]** e listadas no fim; o dono pode trocá-las sem afetar o resto.

## 1. Objetivo

A aba **Explorar**: grade de aves em 2 colunas, busca por nome, filtros de bioma e estado, paginação infinita, favoritar no card e estados de loading, vazio e erro, tudo contra o BFF local.

### Critérios de pronto
1. Com o compose no ar, Explorar lista as aves reais, rola e carrega as próximas páginas até o fim (`nextCursor == null`), sem itens repetidos.
2. Buscar "azul" mostra as aves cujo nome contém "azul" (4 no seed atual: Arara-azul-grande, Ararinha-azul, Gralha-azul e Udu-de-coroa-azul); combinar com um bioma sem resultado mostra o estado vazio com "Limpar filtros".
3. O sheet de filtros mostra biomas e estados com as contagens de `GET /v1/filters`; aplicar e limpar funciona; os filtros selecionados aparecem como chips selecionados.
4. Derrubar a rede mostra "Sem conexão" com "Tentar novamente" e "Ver favoritos"; parar as duas réplicas do BFF (o Traefik passa a responder sem `problem+json`: 404 `text/plain` ou 503) mostra "Serviço indisponível", **não** "ave não encontrada" (regra de `safeCall` da 5a).
5. Tocar num card navega para `DetailRoute(id)` (a tela real chega na 5c; até lá, o placeholder do `app`).
6. Com fonte 2.0×, a grade passa para **1 coluna** e nenhum texto é cortado (§5).
7. Snapshots Paparazzi de grade, loading, vazio, erro e sheet de filtros em claro e escuro, cada um em 1.0×, 1.3× e 2.0×; testes de ViewModel verdes; CI verde.

**Fora do escopo:** persistência dos favoritos (a 5d troca a implementação), ordenação, "Identificar pássaro" (v2), contador de resultados (§4).

## 2. Módulos

`feature/explore/{domain,data,presentation}`. `core/domain` ganha `SpeciesSummary` e a interface `FavoritesRepository` (usados por Explorar, Detalhe e Favoritos). `ConservationStatus` pertence ao Detalhe (5c): nem os cards nem a lista de Favoritos mostram o selo nos mockups. O `app` registra o grafo da aba `ExploreRoute`. O código de prova da 5a (`GET /v1/filters` e a tela de depuração) é **substituído** pelo `FiltersRepository` desta fatia.

## 3. Domínio e dados

- `SpeciesSummary(id, commonName, scientificName, thumbnailUrl: String?)` — `thumbnailUrl` é **nulo** no contrato.
- `ExploreRepository.list(query: String, biome: BiomeCode?, state: StateCode?, cursor: String?, limit: Int = 20): Result<SpeciesPage, DataError.Network>` e `FiltersRepository.get(): Result<Filters, DataError.Network>`.
- DTOs e mappers em `feature/explore/data`; nunca expor DTO ao domínio. `limit` fixo em 20 **[DR]**. O `MediaUrlRewriter` (5a) é aplicado no mapper, ao montar `thumbnailUrl`.
- `FavoritesRepository` (em `core/domain`): `observeIds(): Flow<Set<String>>` e `toggle(summary)`. Na 5b o `app` registra uma implementação **em memória** (`InMemoryFavoritesRepository`); a 5d a substitui por Room, sem tocar nas features.
- **Mídia (Coil):** Coil 3 com `coil-network-ktor3` e um `HttpClient` **próprio para mídia** (sem o `defaultRequest` do BFF e com timeouts maiores), para não herdar a URL base nem os timeouts curtos da API.

## 4. Estado (MVI) e regras

`ExploreState`: `query`, `biome`, `state`, `items`, `nextCursor`, `phase` (`Loading` | `Content` | `Empty` | `Error(kind)`), `isLoadingMore`, `loadMoreError`, `filters` (carregamento próprio), `filtersSheetOpen`, `favoriteIds`.

- **Busca com debounce de 400 ms** **[DR]**; cada nova busca cancela a anterior (`collectLatest`). A entrada é aparada, limitada a 100 caracteres e **sem caracteres de controle** (um texto colado com `\n` geraria 400 no BFF).
- Mudar `query`/`biome`/`state` zera a lista e o cursor e volta a `Loading`.
- **Paginação:** pedir a próxima página quando o item visível estiver a 6 do fim; ignorar se já houver requisição em curso ou `nextCursor == null`. Ao juntar páginas, **ids duplicados são descartados** (um `key = id` repetido derruba a `LazyVerticalGrid`).
- **Erros → tela** (do `DataError.Network` da 5a): `NoConnection`/`Timeout` → "Sem conexão" (com "Tentar novamente" e "Ver favoritos"); `ServiceUnavailable`/`Internal` → "Serviço indisponível"; `RateLimited(retryAfterSeconds)` → mensagem curta e "Tentar novamente" habilitado depois de `retryAfterSeconds`; `InvalidParameter`, `NotFound` e `Unknown` → mensagem genérica com "Tentar novamente" (a UI limita as entradas, então não devem ocorrer). Erro na **página seguinte** é uma linha no fim da grade com "Tentar novamente", sem perder os itens.
- **Filtros (sheet):** seleção **única** por grupo (a API aceita um bioma e um estado); biomas e estados mostram a contagem de `GET /v1/filters`, estados ordenados por contagem, com "Ver todos os estados" para expandir; as escolhas só valem ao tocar em **"Mostrar aves"**; "Limpar" desmarca tudo no sheet. O "Limpar filtros" do estado vazio limpa `biome` e `state` e **mantém** `query`.
- Filtros carregados uma vez por sessão (em memória); falha mostra "Tentar novamente" dentro do sheet.
- Estado de busca e filtros sobrevive à morte do processo via `SavedStateHandle`.
- **Sem contador de resultados [DR]:** o `SpeciesPage` do BFF só traz `items` e `nextCursor` (sem total), então a linha "N aves encontradas" do mockup `busca-ativa` foi removida do design.
- Eventos: navegar para o detalhe (`onOpenDetail(id)`) e para Favoritos (`onOpenFavorites()`); mostrar mensagem pontual.

## 5. UI (mockups como referência)

- `ExploreRoot` (Koin, ViewModel, eventos) e `ExploreScreen` (stateless, previews). Componentes genéricos novos no `core/design-system`: `SpeciesCard` (foto com placeholder "foto ilustrativa", favorito 48dp, nome PT, científico em itálico), `SearchField`, `FilterChip`, `StateScreen` (ícone, título, texto, ações), `SkeletonBox`. O `FiltersSheet` fica em `feature/explore/presentation`.
- Grade `LazyVerticalGrid` com `key = id` e `contentType` fixo. **Layout adaptável à fonte:** 2 colunas, e **1 coluna quando `fontScale ≥ 1.5`** (decisão que vale para as demais telas em lista: ajustar o número de colunas ou empilhar, nunca cortar). Nomes longos quebram linha, nunca cortam.
- Acessibilidade: `contentDescription` no favorito ("Favoritar Bem-te-vi" / "Desfavoritar ..."), alvo ≥ 48dp.

## 6. Testes

- ViewModel (`kotlin.test`, Turbine, AssertK, repositórios falsos): debounce com tempo virtual, cancelamento de busca antiga, paginação até o fim, sem ids duplicados, reset ao mudar filtro, entrada com caracteres de controle, cada `DataError.Network` → tela, erro na página seguinte preservando itens, favoritar.
- Mappers: `thumbnailUrl` nulo, `MediaUrlRewriter` aplicado.
- Paparazzi: grade, loading, vazio, erro (rede e servidor), sheet de filtros; claro e escuro × 1.0×/1.3×/2.0× (grade em 1 coluna a 2.0×).

## 7. Riscos

| Risco | Mitigação |
|---|---|
| Rolagem lenta com muitas fotos | `key`/`contentType`, Coil com tamanho do card, teste manual de rolagem em debug |
| Corrida entre busca e paginação | `collectLatest` e um único `Job` de carregamento por consulta |
| Lista com `q` não é cacheada no BFF (spec do BFF) | debounce e limite de 100 caracteres; `RateLimited` tratado na UI |

## 8. Decisões do redator **[DR]**

`limit` 20; debounce 400 ms; pré-carga a 6 itens do fim; favoritos em memória até a 5d; filtros em memória por sessão; seleção única por grupo no sheet; sem contador de resultados; 1 coluna a partir de `fontScale` 1.5.

## 9. Ajustes da implementação (2026-10-10)

Validados no esqueleto da fatia e detalhados no plano (`docs/superpowers/plans/2026-10-10-passarim-app-5b-explorar.md`, seção "Diferenças em relação à spec"): bioma e estado como códigos `String` (sem `BiomeCode`/`StateCode`); `Filters` e `FiltersRepository` continuam em `core:domain`, só a implementação vai para `feature:explore:data`; `filtersSheetOpen` vira `sheet: FiltersSheetState?` (com as escolhas ainda não aplicadas); um único `Job` de carregamento no lugar de `collectLatest`; sem o evento de mensagem pontual (nenhum caso na 5b); busca e chips visíveis em todas as fases; o texto do vazio não cita o bioma; `ScreenError` novo em `core:presentation`; Coil no `core:design-system` (o `SpeciesCard` mostra a foto).
