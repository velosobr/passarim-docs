# Passarim — Frente F: jornada Kids

Data: 2026-11-26 · Origem: PRD da guinada (`2026-10-16-passarim-guinada-prd.md`), seção 6, frente F · Desenho: `docs/design/direcoes-2026/canvas/KidsExplorar.dc.html`, `KidsAlbum.dc.html`, `KidsDetalhe.dc.html` e `KidsSistema.dc.html` (as versões com "Para adultos" estão no branch da spec D), mais as pranchetas novas descritas em texto na seção 6.6 · Regra de comentários: `~/dev/passarim/CLAUDE.md` · Depende de: frente D (PR 3: Escolha, trava, casca Kids e raiz por jornada), E2 (app #40), E3 (app #37), G2 (o visualizador, só para o PR F3) e frente B no BFF (no ar)

O dono delegou as decisões de design desta frente a um agente que o representou. Uma segunda opinião independente revisou as decisões mais arriscadas (a migração, a área "Para adultos", a prova de que não há link, as colunas e os dados da contagem), e o que ela mudou já está no texto. O que esse agente decidiu está marcado com **[R]** e listado na seção 13. Onde esta spec ajusta o PRD, a seção 12 diz o quê.

## 1. Objetivo

Trocar a casca da frente D pelas telas Kids de verdade: o Explorar com o Pipo e os mundos, a tela de mundo, o Detalhe com a foto em cookie e o canto, o álbum de figurinhas e a área "Para adultos" depois da trava. É a frente que deixa o Passarim Kids **completo no aparelho**.

Tudo fala com uma criança de 8 a 12 anos que já lê: frases curtas, alvos de toque grandes, nenhum link para fora, nenhum nome científico em destaque, e o canto só toca quando ela pede.

### Pronto quando

1. No aparelho, contra o BFF local, a criança percorre Explorar, mundo, Detalhe, visualizador, álbum e "Para adultos" sem ver nenhuma tela adulta antes da trava.
2. A jornada funciona offline na definição do PRD: sem rede, o álbum abre com as figurinhas, as miniaturas do cache e o progresso pela última contagem guardada; Explorar, mundo e Detalhe mostram o erro com o Pipo.
3. Nenhuma tela Kids abre link externo, coberto por teste (seção 10).
4. Os alvos de toque têm pelo menos 56 dp.
5. O canto nunca toca sozinho no Kids, seja qual for a preferência gravada pelo adulto.
6. Os favoritos do adulto continuam onde estavam depois da migração do Room, e o álbum começa vazio.
7. Os snapshots estão em Piu Kids claro, com fonte 1.0×, 1.3× e 2.0× (e 1.5×, onde as colunas mudam).

## 2. Contratos que a frente usa (conferidos no BFF local em 2026-11-26)

Nada muda no BFF, no catalog nem no proto. A frente só lê o que a frente B já entrega.

| Chamada | O que a F usa |
|---|---|
| `GET /v1/species?audience=kids` | Lista com `primaryBiome` em cada item, 20 por página com `nextCursor`. Hoje são 41 aves |
| `GET /v1/species?audience=kids&primaryBiome=caatinga` | As aves de um mundo (hoje, 2 na Caatinga) |
| `GET /v1/species?audience=kids&q=...` | A busca do Kids |
| `GET /v1/species/{id}` | `kids { description, facts[{text}], didYouKnow }`, `primaryBiome`, `sizeCm` (pode ser `null`: Canário-da-terra e Guará), `conservationStatus.code`, `photos` (com `width` e `height`), `audio` com os 64 `peaks`, `whereToFind.clusters` |
| `GET /v1/filters?audience=kids` | `primaryBiomes[{code, label, speciesCount}]`: a contagem de cada mundo (hoje 9, 12, 11, 2, 5 e 2, somando 41) |
| `GET /v1/featured` | A "Ave do dia", a mesma nas duas jornadas; só é elegível uma ave com conteúdo Kids |

No catálogo de hoje, `sizeCm` vai de 12 (Andorinha-pequena-de-casa) a 170 (Ema), e os status são LC, NT e VU. As regras da seção 5 cobrem também os tamanhos e os códigos que ainda não aparecem.

## 3. Dados no app

### 3.1 Favoritos com audiência (Room v1 → v2)

- `FavoriteEntity` ganha `audience: String` (o nome de `Journey`, `ADULT` ou `KIDS`) e `primaryBiome: String?`. A chave passa a ser `(id, audience)` **[R]**: a mesma ave pode estar nos favoritos do adulto e no álbum da criança, cada uma com a própria data.
- **A audiência é a própria `Journey`** **[R]**, sem enum novo: o álbum é o favorito com `audience = KIDS`.
- **Migração com `@AutoMigration(from = 1, to = 2)`** **[R]**, com `@ColumnInfo(defaultValue = "ADULT")` em `audience`. O SQLite não troca a chave primária de uma tabela, e é por isso que o PRD fala em migração manual (criar `favorites_new`, copiar com `audience = 'ADULT'`, apagar e renomear). A migração automática do Room faz exatamente esses passos quando a chave muda, e confere o resultado contra o `2.json`: um SQL escrito à mão que divergisse do schema (ordem, `NOT NULL`, valor padrão) só quebraria ao abrir o banco. A mesma versão cria a tabela `kids_world_counts` (seção 3.3). Se a migração automática não aceitar a troca de chave na versão do Room do projeto, o plano volta aos passos manuais, com o SQL exato no plano e o mesmo teste.
- O schema `2.json` é exportado e versionado, como o `1.json`.
- **`FavoritesRepository`** passa a receber a audiência em todos os métodos **[R]**: `observeIds(audience)`, `observeAll(audience)`, `toggle(summary, audience)` e `refresh(summary, audience)`. As telas do adulto passam `Journey.ADULT`, e nenhuma consulta mistura as duas audiências. No DAO, todas as consultas filtram por `audience`, inclusive `deleteById` e `updateSummary`.
- `toggle` grava também o `primaryBiome` do `SpeciesSummary`, que é o mundo da figurinha. `refresh` atualiza nome, miniatura e mundo; o Detalhe Kids chama `refresh(summary, KIDS)` ao carregar uma ave que já está no álbum, como o adulto faz.
- `SpeciesDetail.toSummary()` já leva o `primaryBiome` (E2).

### 3.2 Lista e filtros com audiência

- `ExploreRepository.list` ganha `audience: Journey = Journey.ADULT` e `primaryBiome: Biome? = null`, que viram `audience=kids` e `primaryBiome=<código>` na chamada **[R]**. O adulto não muda.
- `FiltersRepository.get()` vira `getFilters(audience: Journey = Journey.ADULT)` **[R]**: a interface já vai mudar, e a regra do projeto proíbe `get` sozinho em repositório. O cache em memória do `RemoteFiltersRepository` passa a ser por audiência.
- **Conferência em cada resposta** (item que a D deixou para a F) **[R]:**
  - na lista Kids, um item sem `primaryBiome` é descartado. Toda ave com conteúdo Kids tem bioma principal (o kidsgen grava os dois juntos, spec B), então um item sem ele quer dizer um BFF que ignorou o `audience`;
  - no Detalhe Kids, uma ave sem `kids` mostra o estado "Essa ave ainda não chegou ao Kids" (seção 6.3), nunca o texto adulto. O Detalhe é o mesmo nas duas audiências (o BFF não filtra o `GET /v1/species/{id}` por audiência), então quem decide é `kids == null`; o 404 é só para um id que não existe.

### 3.3 Contagem por mundo guardada para o álbum

- Interface nova em `core:domain` **[R]**:

  ```kotlin
  interface WorldCountsRepository {
      fun observeWorldCounts(): Flow<Map<Biome, Int>>
      suspend fun refreshWorldCounts(): EmptyResult<DataError.Network>
  }
  ```

- `refreshWorldCounts` chama `getFilters(Journey.KIDS)` e grava os `primaryBiomes` na tabela `kids_world_counts (biome TEXT PRIMARY KEY, speciesCount INTEGER NOT NULL)`, numa transação que troca todas as linhas de uma vez. Um bioma desconhecido é ignorado.
  - **Uma lista vazia não apaga nada** **[R]**: `primaryBiomes` vazio ou ausente é um BFF que ignorou o `audience`, e a contagem boa fica.
  - **O cache em memória do `RemoteFiltersRepository` é por audiência e dura o processo**, como o do adulto hoje. A contagem guardada no Room muda, então, a cada abertura do app, o que basta para um catálogo que muda por PR de conteúdo **[R]**.
- **Fica no Room, não no DataStore** **[R]**: o álbum lê as figurinhas e as contagens do mesmo banco, e a migração para a v2 já existe nesta frente. O DataStore continua só com as preferências.
- **Implementação:** em `core:database`, que recebe o `FiltersRepository` pelo Koin. Quem chama o `refresh` é o Explorar Kids e o álbum, ao abrir; uma falha não apaga a contagem guardada.
- **Limpar o cache** apaga as miniaturas do Coil, não o álbum nem as contagens (PRD).

### 3.4 Conteúdo Kids no Detalhe

- `SpeciesDetail` ganha `kids: KidsContent?`, com `KidsContent(description: String, facts: List<String>, didYouKnow: String)` em `feature:detail:domain`. O DTO ganha `KidsDto` (`@Serializable`, em `feature:detail:data`) e o mapper.
- O Detalhe do adulto ignora o campo.

### 3.5 "Ave do dia"

O Kids usa o mesmo `FeaturedRepository.getFeaturedSpecies()` do E1. A ave é a mesma nas duas jornadas, e só é elegível quem tem conteúdo Kids (spec B), então o card nunca leva uma ave sem Kids.

## 4. Navegação

O grafo do Kids nasce na D PR 3 (casca, `KidsGateRoute`). A F acrescenta as rotas e troca o conteúdo das abas.

| Rota | Tela | De onde abre |
|---|---|---|
| `KidsTabsRoute` (D) | As abas Explorar e Álbum, com a `PiuKidsNavBar` | Raiz do Kids |
| `KidsWorldRoute(biome: String)` | Tela de mundo | Cartão de mundo no Explorar |
| `KidsDetailRoute(id: String, primaryBiome: String?)` | Detalhe Kids | Card, "Ave do dia", figurinha |
| `ViewerRoute(id, index)` (G) | Visualizador, variante Kids | Foto do topo e galeria do Detalhe Kids |
| `KidsGateRoute` (D) | Trava | "Para adultos" na barra |
| `AdultAreaRoute` | Área "Para adultos" | Trava, depois do acerto |
| `StorageRoute`, `AboutRoute`, `LicensesRoute` (5d/E3) | As telas do adulto, reaproveitadas, só dentro do `AdultAreaFrame` (seção 6.8) | Área "Para adultos" |

- **O `primaryBiome` vai na rota do Detalhe** **[R]** para o fundo da tela já nascer na cor do mundo enquanto a ave carrega.
- **A trava passa a abrir a área "Para adultos"** em vez de gravar `ADULT` **[R]**: acertou, `navigate(AdultAreaRoute) { popUpTo<KidsGateRoute> { inclusive = true } }`. Quem grava `ADULT` agora é o item "Voltar para o Passarim" da área. Assim o voltar da área cai no Kids, e não na trava.
- **As rotas só ligam as peças.** Cada tela recebe seus eventos como `Flow` mais um callback e os coleta dentro dela (regra do projeto). O bloco da rota só chama `navigate` ou `popBackStack`, com `dropUnlessResumed`.
- **Sem a foto viajando** do card para o Detalhe no Kids **[R]**: a foto em cookie muda de forma e de tamanho, e a transição compartilhada do E2 fica só no adulto. É ideia para a frente H.

## 5. Regras fixas (sem IA, sem mudar o contrato)

As duas regras são funções puras em `feature:detail:domain`, que devolvem um enum. Os textos ficam em `composeResources`, um por valor do enum, e o teste confere que todo valor tem texto.

### 5.1 Comparação de tamanho

O `sizeCm` do catálogo é o comprimento do bico à ponta da cauda. A referência é uma criança de 8 a 12 anos, com uns 130 a 150 cm de altura **[R]**.

| `sizeCm` | Enum | Texto |
|---|---|---|
| até 15 | `PALM` | "Cabe na palma da sua mão!" |
| 16 a 30 | `RULER` | "Do tamanho de uma régua da escola." |
| 31 a 60 | `ARM` | "Do comprimento do seu braço." |
| 61 a 99 | `GUITAR` | "Do tamanho de um violão." |
| 100 a 130 | `ALMOST_YOU` | "Quase do seu tamanho!" |
| 131 a 150 | `LIKE_YOU` | "Do seu tamanho!" |
| mais de 150 | `BIGGER_THAN_YOU` | "Maior que você!" |
| `null` ou ≤ 0 | — | O bloco de tamanho não aparece |

- **O número vem junto**, como na prancheta ("1 metro"): até 99 cm, "35 cm"; de 100 em diante, em metros com uma casa, arredondada para o décimo mais próximo (145 → "1,5 metro"), sem a casa quando ela é zero ("1 metro"), e no plural a partir de 2 ("2 metros", "2,3 metros").
- **O bloco tem três linhas:** o número, a legenda fixa "do bico à cauda" e o texto da faixa, um só por faixa, o da tabela.
- Exemplos do catálogo: Uirapuru-verdadeiro (13) cabe na mão; Bem-te-vi (23), régua; Tucano-toco (56), braço; Seriema (80), violão; Arara-azul-grande (100), quase do seu tamanho; Tuiuiú (140), do seu tamanho; Ema (170), maior que você.

### 5.2 Status de conservação em linguagem simples

Os textos seguem a tabela de temas sensíveis da spec B: sem desesperança, sempre com alguém cuidando **[R]**.

| Código | Texto do selo |
|---|---|
| `LC` | "Tem bastante na natureza" |
| `NT` | "Precisa de atenção para continuar por aqui" |
| `VU` | "Precisa da nossa ajuda para não sumir" (o exemplo do PRD) |
| `EN` | "Restam poucas, e tem gente cuidando delas" |
| `CR` | "Restam muito poucas, e tem gente cuidando delas" |
| `EW` | "Hoje só vive com a ajuda das pessoas" |
| `EX` | "Não existe mais, e por isso cuidamos das outras" |
| `DD` | "Ainda sabemos pouco sobre ela" |
| sem status ou código desconhecido | Sem selo (como a corruíra no PRD) |

O selo usa as cores de conservação do `PiuTheme.tokens.conservation` (Kids), que já têm cor para todos os oito códigos, verificadas sobre o creme.

## 6. Telas

Todas no tema Piu Kids (claro), com Fredoka nos títulos e Nunito no texto. Os componentes de assinatura do Kids (`PiuKidsButton`, `PiuWorldCard`, `PiuSticker`, `PiuMissingSticker`, `PiuPipoBalloon`, `PiuKidsNavBar`, `PiuCookieShape`) vêm do PiuDS. Os componentes novos nascem na feature que os usa (regra do 2 do PiuDS), com uma exceção na seção 6.7.

**Onde fica cada tela** **[R]:** no módulo da feature que já tem os dados dela, num pacote `kids`, com ViewModel próprio. Assim nenhuma feature de apresentação depende do domínio de outra, e nenhum módulo novo é criado além do que a D já criou.

| Tela | Módulo |
|---|---|
| Explorar Kids e tela de mundo | `feature:explore:presentation` (`kids/`) |
| Detalhe Kids | `feature:detail:presentation` (`kids/`), ao lado do player e da forma de onda |
| Álbum | `feature:favorites:presentation` (`kids/`) |
| Área "Para adultos" | `feature:journey:presentation`, ao lado da trava |
| Grafo do Kids | `app/kids` (D) |

- **Strings dos dois públicos no mesmo módulo:** os recursos do Kids levam o prefixo `kids_` (`kids_explore_balloon`), para não se misturarem com os do adulto.
- **O player não é copiado:** o Detalhe Kids usa o mesmo `AudioPlayer` (a interface do `feature:detail:domain` e as implementações do módulo) e o mesmo `Waveform`. O que o `KidsDetailViewModel` repete do adulto são as poucas linhas de tocar e pausar, sem a preferência de reprodução automática.

### Regra das colunas

As grades decidem as colunas pela **largura disponível dividida pela escala da fonte** **[R]**, e não só pela escala: assim a regra vale também numa tela de 320 dp, com o "tamanho de exibição" do Android aumentado e em paisagem. Os limites são escolhidos para dar, numa tela de 390 dp, o resultado da tabela:

| Grade | Abaixo de 1.3× | De 1.3× a 1.49× | A partir de 1.5× |
|---|---|---|---|
| Mundos (Explorar) | 3 colunas | 2 colunas | 2 colunas |
| Cards de ave (Explorar, mundo) e blocos de fatos (Detalhe) | 2 colunas | 2 colunas | 1 coluna |
| Figurinhas (álbum) | 3 colunas | 3 colunas | 2 colunas |

No Explorar, os mundos e os cards ficam na mesma `LazyVerticalGrid`, então ela usa uma base de 6 colunas (`GridCells.Fixed(6)`): um mundo ocupa 2 (ou 3, com 2 colunas), um card ocupa 3 (ou 6, com 1 coluna), e as seções de cima ocupam as 6.

### 6.1 Explorar Kids

Prancheta `KidsExplorar.dc.html`. Uma `LazyVerticalGrid` só, com as seções de cima ocupando a linha inteira:

1. **Pipo e balão:** `PiuPipoBalloon` com "Qual ave vamos conhecer hoje?". O Pipo é decoração; o leitor de tela lê só a frase.
2. **Busca:** campo de 56 dp, borda de 3 dp em azul-noite, "Procurar uma ave". A mesma regra do adulto (`sanitizeQuery`, espera de 300 ms antes de buscar), com `audience=kids`. Com texto na busca, as seções 3 e 4 somem, e a grade mostra os resultados.
3. **"Escolha um mundo":** os mundos com pelo menos uma ave, na ordem do enum `Biome`, em `PiuWorldCard`:
   - **3 colunas e 2 linhas** abaixo de 1.3×; **2 colunas a partir de 1.3×** **[R]** (regra do dono: a grade de mundos tem 2 colunas com fonte grande; o limite segue a "Regra das colunas" acima). Em 3 colunas, "Atlântica" a 1.3× já passa da largura do cartão;
   - cada cartão mostra o progresso do álbum naquele mundo ("4 de 9"), quando a contagem já veio uma vez **[R]**;
   - tocar abre a tela de mundo.
4. **"Ave do dia"** (`KidsFeaturedCard`, da feature): selo "AVE DO DIA", foto em cookie de 104 dp sobre o gradiente do mundo, o nome e "Mora no mundo Cerrado". **Sem botão de canto** **[R]**: o canto é o "Ouvir o canto!" do Detalhe, e o card inteiro é um alvo só. Some sem aviso se o endpoint falhar, e não aparece com busca.
5. **"Todas as aves":** os cards (`KidsSpeciesCard`, da feature) em **2 colunas; 1 coluna a partir de 1.5×** (a regra do mosaico do adulto, na forma da "Regra das colunas"). Cada card tem a foto (110 dp, raio 20 dp, gradiente do mundo por baixo), o nome em Fredoka e, se a ave já está no álbum, um selo redondo com uma figurinha **[R]**. Paginação por cursor, 20 por vez, como no adulto.

- **Ao abrir:** busca a lista, a "Ave do dia" e chama `refreshWorldCounts()`. Os mundos vêm da contagem guardada, então aparecem mesmo se só a contagem falhar.
- **Estados** (seção 6.7): carregando, erro e busca sem resultado com o Pipo. Quando a lista sem busca responde com sucesso e **vazia**, o Pipo diz "Logo, logo tem aves aqui!", como na casca da D **[R]**. Quem decide é a lista, não a contagem: na primeira abertura offline não há contagem guardada, e isso é erro de rede, não falta de aves.

### 6.2 Tela de mundo

Prancheta nova `KidsMundo.dc.html` (seção 6.6).

- **Topo** no gradiente do mundo (`PiuTheme.tokens.gradients`), com o voltar (`PiuKidsButton` redondo de 56 dp), o título "Mundo Cerrado" e a linha do progresso: "Você já tem 4 de 11 aves deste mundo", com a barra na cor do mundo. Sem contagem guardada, só "Você já tem 4 aves deste mundo".
- **Grade:** os mesmos `KidsSpeciesCard` do Explorar, com `audience=kids&primaryBiome=<mundo>`, na mesma regra de colunas, com paginação.
- **Estados:** carregando, erro e "Ainda não tem aves neste mundo" com o Pipo.
- O bioma da rota é validado com `biomeOf`; um código desconhecido mostra o erro de "não encontrado".

### 6.3 Detalhe Kids

Prancheta `KidsDetalhe.dc.html`, completada pela descrição da seção 6.6. Uma coluna que rola, sem a barra das abas:

1. **Topo** no gradiente do mundo, que se funde ao creme: o voltar (56 dp) à esquerda e o **selo do mundo** ("Mundo Pantanal", pílula na cor do mundo) à direita.
2. **Foto em cookie** de 220 dp (`PiuCookieShape`), a variante `large`. Tocar abre o visualizador no índice 0, com o rótulo "Ver foto inteira" (seção 4). Sem foto, o cookie mostra o gradiente do mundo e o `PhotoPlaceholder`, e não é clicável.
3. **Nome** em Fredoka 38, centralizado. Sem nome científico.
4. **Selo de conservação** em linguagem simples (seção 5.2).
5. **"Ouvir o canto!"**: botão laranja de 72 dp, com o círculo de tocar e a forma de onda real (o `Waveform` do E2, na cor do texto do botão). Tocando, o rótulo vira "Pausar o canto" e a parte já tocada se destaca. Sem `audio`, o botão não aparece. **Nunca toca sozinho** **[R]**: o `KidsDetailViewModel` não lê a preferência de reprodução automática, e a rota não tem `autoPlay`. Sair da tela pausa, como no adulto.
6. **Blocos de fatos** em grade de 2 colunas (1 coluna a partir de 1.5×):
   - o primeiro é o **tamanho** (seção 5.1): o número em Fredoka 26 na cor do mundo e, embaixo, "do bico à cauda" e o texto da faixa;
   - depois, um bloco por **fato Kids** (`kids.facts`), só com o texto.
7. **O texto Kids** (`kids.description`), em Nunito 17.
8. **"Você sabia?"**: o Pipo com o balão azul-claro, o título "Você sabia?" e o `kids.didYouKnow`.
9. **"Guardar no meu álbum"** (seção 6.5).
10. **"Mais fotos":** a galeria (`PiuPhotoGallery` com `onPhotoClick`, do G), que abre o visualizador no índice da foto.
11. **"Onde ela vive":** o mapa do Detalhe (`SpeciesMap`), que já é só para ver, sem gestos, sem os botões do MapLibre, e com a atribuição em texto e sem link: "© OpenFreeMap © OpenMapTiles · dados © contribuidores do OpenStreetMap". Sem rede, o aviso de mapa indisponível do E2.
12. **"Quem fez as fotos e o canto":** os créditos de cada foto e do canto, em texto pequeno (`PiuCreditCaption` com `linkEnabled = false`) **[R]**. As licenças CC pedem a atribuição; o link fica para o adulto.

- **Estados:** carregando (o topo na cor do mundo da rota e o Pipo), erro com o Pipo e "Tentar de novo", e **"Essa ave ainda não chegou ao Kids"** para `404` e para uma ave sem `kids` (seção 3.2), com o botão "Voltar".

### 6.4 Álbum

Prancheta `KidsAlbum.dc.html`. Pensado para crescer: o PRD pede outro desenho quando um mundo tiver centenas de aves, e este já é por mundo **[R]**.

- **Topo:** "Meu álbum", "Cada ave que você guarda vira uma figurinha." e o total "12 figurinhas de 41" (a soma das contagens guardadas; sem contagem, "12 figurinhas").
- **Mundos:** uma linha de chips que rola na horizontal (44 dp de altura visual, 56 dp de toque), um por mundo com pelo menos uma ave na contagem ou uma figurinha guardada. O chip marcado tem a cor do mundo e borda azul-noite.
  - **Mundo marcado ao abrir** **[R]:** o da figurinha guardada mais recente; com o álbum vazio, o primeiro mundo do enum. Depois que a criança escolhe um mundo, a escolha fica no `SavedStateHandle` e se mantém ao trocar de aba e voltar.
- **Progresso do mundo:** cartão branco com "Mundo Pantanal" e "4 de 9", e a barra na cor do mundo. Para o leitor de tela, um nó só: "4 de 9 figurinhas do Pantanal".
- **Figurinhas:** grade de **3 colunas; 2 a partir de 1.5×** **[R]**:
  - primeiro as guardadas (`PiuSticker`), em ordem alfabética **[R]**. Tocar abre o Detalhe Kids;
  - depois os **espaços "?"** (`PiuMissingSticker`, "Ainda falta"), um por figurinha que falta, **até 12** **[R]**. Se faltarem mais, o último espaço vira "Faltam 87" e o leitor de tela anuncia "87 figurinhas que faltam". Cada "?" é anunciado como "figurinha que falta" e não é clicável;
  - figurinhas a mais que a contagem (uma ave que saiu do catálogo, ou contagem velha) aparecem todas, e o progresso fica em "9 de 9".
- **Offline:** tudo vem do Room (figurinhas e contagens) e do cache de imagens do Coil. Ao abrir, o álbum chama `refreshWorldCounts()`; se falhar, nada avisa.
- **Vazio:** o Pipo com "Seu álbum está esperando!", "Guarde uma ave para ganhar sua primeira figurinha." e o botão "Explorar aves", que leva à aba Explorar.
- **Uma figurinha sem `primaryBiome`** (não deveria existir, porque o Detalhe Kids não guarda sem mundo, seção 6.5) não aparece em nenhum mundo e não conta no progresso **[R]**.

### 6.5 Guardar no álbum e "Nova figurinha!"

- **Botão:** `PiuKidsButton` de 72 dp, "Guardar no meu álbum", com o ícone de figurinha.
- **O mundo da figurinha** é o `primaryBiome` do Detalhe; se ele vier nulo, o da rota. Sem nenhum dos dois, o botão não aparece **[R]**: uma figurinha sem mundo ficaria invisível no álbum.
- **Guardou:** o botão vira "Está no seu álbum!" com um visto, e aparece por 2 s, logo acima dele, um cartão com a figurinha da ave (`PiuSticker`) e "Nova figurinha!". A figurinha cresce de 60 % para 100 % com a mola do PiuDS e o cartão some aos poucos. Sem som, sem confete, sem sequência diária e sem contagem regressiva.
  - **Reduzir animações:** o cartão aparece e some sem crescer nem desbotar, nos mesmos 2 s.
  - O leitor de tela anuncia "Nova figurinha no álbum!" (`liveRegion` Polite), uma vez.
- **Tirar do álbum** **[R]:** tocar em "Está no seu álbum!" abre uma confirmação, "Tirar o Tuiuiú do álbum?", com "Tirar" e "Deixar no álbum" (`PiuKidsButton`, 56 dp). Um toque sem querer não apaga a figurinha.
- O evento de uma vez ("Nova figurinha!") chega à tela como `Flow` e é coletado dentro dela.

### 6.6 Pranchetas novas (descrição para o canvas)

Entram em `docs/design/direcoes-2026/canvas/` e no `canvas.json` num PR próprio, antes do código (PR 2 da seção 11). Todas com 390 × 844, fundo `#FFF7E8` e texto `#1D2B3A`.

- **`KidsMundo.dc.html`** ("Infantil · Mundo"): faixa de topo de 220 dp no gradiente do mundo (Cerrado, `#FFE066` → `#FF9F1C`), com o voltar branco de 56 dp e borda de 3 dp, o título "Mundo Cerrado" em Fredoka 34 e "Você já tem 4 de 11 aves deste mundo" em Nunito 800, com a barra de 16 dp (fundo `#FFF1C2`, preenchimento no gradiente); embaixo, a grade de 2 colunas com seis `KidsSpeciesCard` (Seriema com o selo de figurinha, Tucano-toco, Ema, Coruja-buraqueira, Anu-preto, Tesourinha) e a `PiuKidsNavBar` flutuando no fim, com Explorar ativo.
- **`KidsParaAdultos.dc.html`** ("Infantil · Para adultos"): no visual do Piu claro (Manrope, fundo `#F6F8F4`), o X de 48 dp à esquerda com "Voltar ao Kids", o título "Para adultos" e o aviso "Esta área é para adultos. As crianças voltam pelo X."; um cartão de grupo com quatro itens de 64 dp, cada um com ícone, título e subtítulo: "Voltar para o Passarim" ("Abre a versão para adultos"), "Limpar o cache de imagens" ("O álbum continua guardado"), "Sobre o Passarim" e "Licenças". Sem barra de abas.
- **`KidsEstados.dc.html`** ("Infantil · Estados"): quatro quadros de 390 × 420 lado a lado, cada um com o Pipo de 120 dp no centro, título em Fredoka 24, frase em Nunito 17 e, quando houver, o `PiuKidsButton`: carregando ("Procurando aves..."), sem rede ("Ops! Sem internet." / "Peça para um adulto conferir a conexão." / "Tentar de novo"), busca vazia ("Nenhuma ave com esse nome." / "Tente outro nome.") e álbum vazio ("Seu álbum está esperando!" / "Explorar aves").
- **`KidsDetalhe.dc.html`, completada:** abaixo do "Guardar no meu álbum", os títulos "Mais fotos" (fila de miniaturas de 112 dp, raio 20 dp), "Onde ela vive" (mapa de 200 dp, raio 24 dp, com a atribuição em texto no canto) e "Quem fez as fotos e o canto" (Nunito 13, sem sublinhado); um segundo quadro mostra o estado guardado ("Está no seu álbum!" e o cartão "Nova figurinha!" com a figurinha do Tuiuiú).

### 6.7 Estados com o Pipo

- **Componente novo no PiuDS:** `PiuKidsStateScreen(title, body, action?)`, com o Pipo de 120 dp, título, frase e um `PiuKidsButton` opcional **[R]**. Os textos chegam por parâmetro e ficam nas features, não no PiuDS. Ele entra no PiuDS porque três features o usam (Explorar, Detalhe e Álbum), pela regra do 2. O Pipo ali é decoração: sem `contentDescription`, e o leitor de tela lê o título e a frase.
- **Carregando:** o Pipo com "Procurando aves..." e um indicador. Com "reduzir animações", o indicador é a barra sem animação. Não há esqueleto de cards no Kids **[R]**.

| Situação | Título | Frase | Botão |
|---|---|---|---|
| Sem rede | "Ops! Sem internet." | "Peça para um adulto conferir a conexão." | "Tentar de novo" |
| Erro do servidor | "Ops! Algo deu errado." | "Tente de novo daqui a pouco." | "Tentar de novo" |
| Muitas buscas (429) | "Calma, muitas buscas!" | "Espere um pouquinho e tente de novo." | "Tentar de novo", desabilitado pelo tempo pedido, como no adulto |
| Busca sem resultado | "Nenhuma ave com esse nome." | "Tente outro nome." | — |
| Mundo sem aves | "Ainda não tem aves neste mundo." | "Logo, logo chegam mais!" | — |
| Kids sem nenhuma ave | "Logo, logo tem aves aqui!" | — | — |
| Ave fora do Kids (404 ou sem `kids`) | "Essa ave ainda não chegou ao Kids." | "Que tal conhecer outra?" | "Voltar" |
| Álbum vazio | "Seu álbum está esperando!" | "Guarde uma ave para ganhar sua primeira figurinha." | "Explorar aves" |

### 6.8 Área "Para adultos"

- **Abre só pela trava** (seção 4). É uma tela para adultos, então usa o **Piu claro** num `PiuTheme(journey = ADULT, themeMode = LIGHT, dynamicColor = false)` local **[R]**: as telas reaproveitadas do adulto (Armazenamento, Sobre e Licenças) funcionam sem mudança, e o claro segue o Kids por baixo e as barras do sistema.
- **Itens** (prancheta `KidsParaAdultos`):
  - **"Voltar para o Passarim":** grava `ADULT`, e a raiz abre as abas do adulto (D);
  - **"Limpar o cache de imagens":** abre a `StorageRoute` do E3 (o tamanho e o botão de limpar);
  - **"Sobre o Passarim"** e **"Licenças":** as telas do E3.
- **O X** ("Voltar ao Kids") e o voltar do sistema fecham a área e voltam às abas do Kids.
- **Links dentro da área** **[R]:** Sobre e Licenças abrem links externos, como no adulto. Isso é permitido porque a área fica depois da trava (as regras da seção 4 do PRD pedem a trava antes de qualquer link). Fora da área, nenhum link (seção 7).
- **A área não sobrevive sem a trava** **[R]:** um `AdultAreaSession` em memória (um `single` do Koin, em `feature:journey:presentation`) é destrancado pelo acerto da trava e trancado:
  - ao fechar a área (X ou voltar);
  - quando o app sai da tela (`ON_STOP` do ciclo de vida), para um adulto que deixou a área aberta e entregou o aparelho, ou mandou o app para o fundo, não deixar a área destrancada para a criança;
  - quando o processo morre, porque a sessão só existe em memória.
- **`AdultAreaFrame(onLocked, systemUriHandler) { conteúdo }`:** a área e as três telas reaproveitadas entram no grafo do Kids só dentro dele. As classes de rota (`StorageRoute`, `AboutRoute`, `LicensesRoute`) são as mesmas do adulto, registradas também no `NavHost` do Kids, que é outro `NavHost` (D). O frame:
  - aplica o tema Piu claro local;
  - fornece o `UriHandler` do sistema, que o grafo do Kids guarda **antes** de trocar o `LocalUriHandler` pelo bloqueado (seção 7) e passa ao frame;
  - com a sessão trancada, **não compõe o conteúdo**: mostra só o fundo e chama `onLocked`, e o bloco da rota faz `popBackStack` até as abas do Kids. Assim a tela adulta não pisca quando a pilha volta restaurada depois da morte do processo, ou quando o app volta do fundo. O efeito que observa a sessão e o ciclo de vida fica dentro do frame, não no bloco da rota.
- **O texto do Armazenamento** diz que "os favoritos ficam salvos" ao limpar o cache. Vale também para o álbum, que é a mesma tabela, e o texto não muda.

## 7. Nenhum link externo no Kids

Quatro camadas **[R]**:

1. **Por construção:** nenhum ViewModel Kids tem evento de abrir URL, e nenhum crédito Kids tem link (`linkEnabled = false`).
2. **Por proteção:** o grafo do Kids fornece um `LocalUriHandler` que não abre nada (`BlockedUriHandler`) e registra a tentativa no log de depuração. Só o `AdultAreaFrame` devolve o do sistema.
3. **Teste de UI, nó por nó:** cada tela Kids roda com um `UriHandler` falso que conta as chamadas. O teste lista os nós clicáveis (`onAllNodes(hasClickAction())`) e, para cada um, **monta a tela de novo**, toca só naquele nó e confere que a contagem continua zero. Montar de novo a cada nó evita usar uma lista velha depois que um toque muda a tela. Vale para o Explorar, a tela de mundo, o Detalhe (galeria e créditos), o álbum, o visualizador na variante Kids e os estados.
4. **Teste estático:** um teste que lê o código-fonte dos pacotes `kids` (e do grafo `app/kids`) e reprova `openUri`, `LinkAnnotation`, `ACTION_VIEW` e `linkEnabled = true`. Ele pega o que a varredura de nós não vê: um link dentro de um texto (`LinkAnnotation` não vira nó clicável) e um `Intent` aberto direto.

**O mapa** é nativo (MapLibre), e no teste de host ele não existe de verdade. Por isso o `SpeciesMap` ganha um teste próprio que confere que o mapa é montado sem os enfeites do MapLibre (logo e botão de atribuição, o `overlay = {}` de hoje) e que a atribuição é o texto sem link do E2.

## 8. Acessibilidade

- **Alvos de 56 dp** em tudo que é clicável no Kids, mesmo quando o visual é menor (o chip de mundo do álbum tem 44 dp de visual e 56 dp de toque). Um teste de semântica confere a medida em cada tela.
- **Títulos de seção** ("Escolha um mundo", "Ave do dia", "Todas as aves", "Você sabia?", "Mais fotos", "Onde ela vive") com `heading()`.
- **Cartão de mundo:** um nó só, "Mundo Cerrado, 4 de 11 no seu álbum", com papel de botão.
- **Card de ave:** "Seriema, já está no seu álbum" quando tem o selo; só o nome quando não tem.
- **Figurinha:** "Tuiuiú, figurinha do Pantanal"; o "?" é "figurinha que falta"; o último espaço, "87 figurinhas que faltam".
- **Pipo:** decoração em todo lugar, sem anúncio; quem fala é o balão.
- **"Nova figurinha!"** em `liveRegion` Polite; o botão "Ouvir o canto!" vira "Pausar o canto" no rótulo e no anúncio.
- **Fonte 2.0×:** toda tela rola; os nomes compostos quebram no hífen, nunca no meio da palavra; as regras de colunas das seções 6.1, 6.3 e 6.4 valem.

## 9. Textos

Todos em `composeResources`, só em pt-BR, na feature de cada tela: as frases das telas e dos estados, as faixas de tamanho, os selos de conservação, os rótulos de acessibilidade, o formato "35 cm" e "1,4 metro", e os itens da área "Para adultos". Toda frase da criança tem no máximo 15 palavras, o mesmo limite do conteúdo Kids (spec B).

## 10. Testes

- **Room:**
  - a migração de v1 para v2 com o `MigrationTestHelper`: os favoritos de hoje ficam no adulto, com os mesmos dados e datas, e a tabela `kids_world_counts` existe vazia;
  - a mesma ave no adulto e no Kids convive; `toggle` numa audiência não mexe na outra;
  - `observeAll(KIDS)` devolve o `primaryBiome`.
- **Dados:**
  - `list` com `audience=kids` e `primaryBiome` monta a chamada certa, e o adulto continua sem os parâmetros novos;
  - a lista Kids descarta itens sem `primaryBiome`;
  - `getFilters` guarda em memória por audiência;
  - `refreshWorldCounts` grava as contagens, ignora bioma desconhecido e, com falha, mantém as guardadas;
  - o DTO do Detalhe com `kids`, com `kids: null` e sem o campo (BFF antigo).
- **Funções puras:** a comparação de tamanho nas bordas de cada faixa (15, 16, 30, 31, 60, 61, 99, 100, 130, 131, 150, 151), com `null` e zero; o formato "35 cm", "1 metro", "1,4 metro"; o status em linguagem simples cobrindo **todos** os valores de `ConservationStatus` e o nulo; as páginas do álbum (ordem alfabética, até 12 espaços e o "Faltam N", figurinhas a mais, sem contagem, figurinha sem mundo, mundo marcado ao abrir).
- **ViewModels:**
  - Explorar Kids: carrega lista, "Ave do dia" e contagens; a busca esconde mundos e "Ave do dia"; a "Ave do dia" some no erro; o selo de figurinha segue o álbum; o progresso dos mundos;
  - mundo: filtra pelo bioma, paginação, bioma inválido;
  - Detalhe Kids: **não toca sozinho** com a reprodução automática ligada no adulto; tocar e pausar; pausa ao sair; guardar grava com `audience = KIDS` e o `primaryBiome`, e emite "Nova figurinha!" uma vez; tirar pede confirmação; ave sem `kids` e 404 vão para o estado "ainda não chegou ao Kids"; `OpenPhoto(index)` emite a navegação ao visualizador;
  - álbum: figurinhas e progresso do Room, sem rede; vazio; troca de mundo;
  - área "Para adultos": "Voltar para o Passarim" grava `ADULT`; fechar tranca a sessão; a trava destranca e navega para a área.
- **UI no host (`runComposeUiTest` v2):** a varredura de links nó por nó da seção 7 em cada tela, e o teste estático; os alvos de 56 dp; a semântica da seção 8; a área trancada (sessão nova) não compõe o conteúdo e chama `onLocked`; o `ON_STOP` tranca a sessão; com "reduzir animações", o "Nova figurinha!" aparece sem animar; a regra das colunas por largura e escala (320 e 390 dp).
- **Snapshots (Paparazzi), Piu Kids claro, 1.0×, 1.3×, 1.5× e 2.0×** **[R]**: o 1.5× entra porque é onde os cards e as figurinhas mudam de colunas; o resto da matriz do projeto segue com 1.0×, 1.3× e 2.0×.
  - Explorar (com "Ave do dia", com busca, carregando, erro, Kids sem aves);
  - mundo (com aves, com e sem contagem, vazio);
  - Detalhe (completo, sem canto, sem tamanho, sem selo, guardado, "ainda não chegou ao Kids");
  - álbum (com figurinhas e espaços, com "Faltam N", vazio, sem contagem);
  - os estados do `PiuKidsStateScreen`, o `KidsSpeciesCard` e o `KidsFeaturedCard`;
  - a área "Para adultos" em Piu claro.
  - A grade de mundos aparece em 3 colunas a 1.0× e em 2 a 1.3×, 1.5× e 2.0×; os cards, em 1 coluna a partir de 1.5×.
- **iOS:** os testes comuns rodam no `iosSimulatorArm64Test` onde o módulo não linka o MapLibre; a conferência no simulador fica pendente do Xcode 26 selecionado (risco do PRD).
- **No aparelho:** cada PR do app sai com o APK conferido no aparelho do dono, ou com a conferência registrada como pendente.

## 11. Ordem de entrega **[R]**

Todos os PRs do app empilham sobre o **PR 3 da D** (Escolha, trava, casca Kids e raiz por jornada), que ainda vai ser construído, e são rebaseados com ele.

| # | PR | Repositório | Depende de |
|---|---|---|---|
| 1 | Esta spec | `passarim-docs` | — |
| 2 | As pranchetas `KidsMundo`, `KidsParaAdultos`, `KidsEstados`, a `KidsDetalhe` completada e o `canvas.json` | `passarim-docs` | aprovação desta spec |
| 3 | **F1, dados:** Room v2 (audiência, `primaryBiome`, `kids_world_counts`, migração, `2.json`), `FavoritesRepository` com audiência (o adulto passa `ADULT`), `list` com `audience` e `primaryBiome`, `getFilters(audience)`, `WorldCountsRepository`, `KidsContent` no Detalhe | `passarim-app` | D PR 3 |
| 4 | **F2, Explorar e mundo:** `PiuKidsStateScreen`, `KidsSpeciesCard`, `KidsFeaturedCard`, Explorar Kids na aba, `KidsWorldRoute`, o `BlockedUriHandler` no grafo do Kids | `passarim-app` | F1 e PR 2 |
| 5 | **F3, Detalhe:** as regras de tamanho e de status, o Detalhe Kids, guardar e "Nova figurinha!", o mapa, os créditos e, se o G2 já existir, a `ViewerRoute` no grafo do Kids | `passarim-app` | F2 (e G2 para o visualizador) |
| 6 | **F4, Álbum:** a aba Álbum com mundos, progresso, figurinhas e espaços | `passarim-app` | F3 |
| 7 | **F5, "Para adultos":** a trava abrindo a área, `AdultAreaSession`, `AdultAreaFrame`, os itens e a varredura de links em todas as telas | `passarim-app` | F4 |

- **Cada PR traz os testes das telas que entrega:** a varredura de links nó por nó, os 56 dp, a semântica e os snapshots. O `BlockedUriHandler` e o teste estático entram no F2; o F5 acrescenta só os testes da área.
- **O F4 depois do F3 é escolha de produto**, não de código: o álbum só faz sentido quando já dá para guardar uma ave.
- **O F1 não depende do código do PR 3 da D**, só da base dele. Pode ser escrito em paralelo e rebaseado quando o PR 3 existir.
- **Se o G2 ainda não estiver pronto no F3,** a foto e a galeria do Detalhe Kids ficam sem toque, e a `ViewerRoute` do Kids entra num PR pequeno depois do G2 (o G prevê que a F "só acrescenta a rota").
- **A F2 já deixa o Kids "de verdade" no aparelho** (Explorar e mundos); cada PR seguinte acrescenta uma tela. O plano é escrito depois que o dono aprovar esta spec.

## 12. Ajustes ao PRD

1. **A grade de mundos** tem 3 colunas e 2 linhas com fonte normal, e 2 colunas a partir de 1.3× (regra do dono, com o limite definido aqui) **[R]**.
2. **A migração do Room** é a automática do Room (`@AutoMigration`), que faz os passos manuais do PRD e os confere contra o `2.json` **[R]**.
3. **A última contagem do álbum por mundo** fica no Room (`kids_world_counts`), não no DataStore, porque o álbum lê as figurinhas e as contagens do mesmo banco e a migração v2 já é desta frente **[R]**.
4. **A trava** passa a abrir a área "Para adultos", como o PRD previa; na D ela levava direto ao adulto. Voltar ao adulto é um item da área **[R]**.
5. **A área "Para adultos"** usa o Piu claro e reaproveita as telas do adulto, inclusive os links do Sobre e das Licenças, que ficam depois da trava **[R]**. É a leitura desta spec de "o Kids não abre nenhum link externo": nenhuma tela **antes da trava** abre link. É uma reinterpretação do PRD e pede o aceite explícito do dono na revisão desta spec; se ele preferir, Sobre e Licenças entram na área sem os links, com o mesmo `BlockedUriHandler`, e nada mais muda.
6. **A "Ave do dia" do Kids** não tem botão de canto; o canto fica no Detalhe **[R]**.
7. **O álbum** é por mundo, com até 12 espaços "?" e um "Faltam N", para escalar para um catálogo grande (o PRD deixava esse desenho para a F) **[R]**.
8. **Sem a foto viajando** do card para o Detalhe no Kids **[R]**.
9. **Créditos no Detalhe Kids** em texto e sem link, numa seção "Quem fez as fotos e o canto" **[R]**.

## 13. Decisões do representante [R]

1. As telas Kids ficam no módulo da feature que já tem os dados, num pacote `kids`, com ViewModel próprio: Explorar e mundo em `feature:explore:presentation`, Detalhe em `feature:detail:presentation`, álbum em `feature:favorites:presentation`, área "Para adultos" em `feature:journey:presentation`. Nenhum módulo novo.
2. Favoritos com chave `(id, audience)`, a audiência sendo a própria `Journey`; `FavoritesRepository` recebe a audiência em todos os métodos, e o DAO filtra por ela em todas as consultas; migração v1 → v2 com `@AutoMigration` e `defaultValue = "ADULT"` (os passos manuais, com o SQL no plano, só se a automática não aceitar a troca de chave).
3. `ExploreRepository.list` ganha `audience` e `primaryBiome`; `FiltersRepository.get()` vira `getFilters(audience)`, com cache por audiência.
4. Lista Kids descarta item sem `primaryBiome`; Detalhe Kids sem `kids` (ou 404) mostra "Essa ave ainda não chegou ao Kids", nunca o texto adulto.
5. `WorldCountsRepository` em `core:domain`, com a contagem na tabela `kids_world_counts` do Room, atualizada ao abrir o Explorar Kids e o álbum; falha ou lista vazia mantém a guardada; o cache em memória dos filtros dura o processo.
6. `KidsContent(description, facts, didYouKnow)` no `SpeciesDetail`.
7. `KidsDetailRoute(id, primaryBiome)`, para o fundo nascer na cor do mundo.
8. A trava abre a `AdultAreaRoute` (tirando a trava da pilha); "Voltar para o Passarim" grava `ADULT`.
9. Sem transição compartilhada no Kids.
10. Faixas de tamanho: até 15 mão; 16–30 régua; 31–60 braço; 61–99 violão; 100–130 quase do seu tamanho; 131–150 do seu tamanho; mais de 150 maior que você; sem tamanho, sem bloco. Número em cm até 99, em metros com uma casa a partir de 100.
11. Selos de conservação em linguagem simples para LC, NT, VU, EN, CR, EW, EX e DD, sem desesperança; sem status, sem selo.
12. Grade de mundos 3 × 2, com 2 colunas a partir de 1.3×; cards de ave e blocos de fatos em 2 colunas, 1 a partir de 1.5×; figurinhas em 3 colunas, 2 a partir de 1.5×; tudo decidido pela largura dividida pela escala da fonte, com uma base de 6 colunas na grade do Explorar; snapshots também a 1.5×.
13. O cartão de mundo mostra o progresso do álbum quando a contagem já veio.
14. "Ave do dia" do Kids sem botão de canto, com "Mora no mundo <mundo>", escondida com busca ou erro.
15. Card de ave com selo de figurinha quando a ave está no álbum.
16. O Detalhe Kids nunca toca o canto sozinho: o ViewModel não lê a preferência e a rota não tem `autoPlay`.
17. Ordem do Detalhe: topo com voltar e selo do mundo, foto em cookie de 220 dp, nome, selo de conservação, "Ouvir o canto!", blocos (tamanho e fatos), texto, "Você sabia?", "Guardar no meu álbum", galeria, mapa e créditos sem link.
18. Álbum por mundo, com chips, progresso, figurinhas em ordem alfabética e até 12 espaços "?" mais o "Faltam N"; mundo marcado ao abrir é o da figurinha mais recente; figurinha sem mundo não aparece.
19. "Nova figurinha!" por 2 s, com a figurinha crescendo pela mola do PiuDS; com "reduzir animações", sem animar; anúncio em `liveRegion`.
20. Tirar do álbum pede confirmação.
21. `PiuKidsStateScreen` no PiuDS (três features o usam), com o Pipo como decoração; carregando sem esqueleto; os textos da tabela da seção 6.7.
22. A área "Para adultos" em Piu claro local, reaproveitando Armazenamento, Sobre e Licenças, com links permitidos ali dentro.
23. `AdultAreaSession` em memória, trancada ao fechar a área, em `ON_STOP` e com a morte do processo; `AdultAreaFrame(onLocked, systemUriHandler)` aplica o tema local, devolve o `UriHandler` do sistema guardado pelo grafo e, trancado, não compõe o conteúdo e chama `onLocked`.
24. Nenhum link no Kids em quatro camadas: nenhum evento de URL, `BlockedUriHandler` no grafo do Kids, a varredura nó por nó (montando a tela de novo a cada nó) e um teste estático do código-fonte dos pacotes `kids`; o mapa ganha teste próprio dos enfeites do MapLibre.
25. Sete PRs: spec, pranchetas, F1 (dados), F2 (Explorar e mundo), F3 (Detalhe), F4 (álbum), F5 ("Para adultos"), todos sobre o PR 3 da D; a rota do visualizador entra no F3 ou num PR pequeno depois do G2.
26. As pranchetas `KidsMundo`, `KidsParaAdultos` e `KidsEstados`, e a `KidsDetalhe` completada, descritas aqui e desenhadas num PR próprio antes do código.
27. Strings do Kids com o prefixo `kids_` nos módulos que têm os dois públicos; o Detalhe Kids usa o mesmo `AudioPlayer` e o mesmo `Waveform` do adulto.
28. "Kids sem nenhuma ave" sai da lista vazia com sucesso, não da contagem; o estado "ainda não chegou ao Kids" sai de `kids == null`, e o 404 é só para id inexistente.
29. O mundo da figurinha é o `primaryBiome` do Detalhe ou, se nulo, o da rota; sem nenhum, o botão "Guardar" não aparece. O mundo escolhido no álbum fica no `SavedStateHandle`.
30. Cada PR traz os testes de link, alvo de toque, semântica e snapshots das próprias telas; o F4 depois do F3 é escolha de produto.
