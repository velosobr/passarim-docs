# Passarim — Frente G: visualizador de fotos

Data: 2026-11-12 · Origem: PRD da guinada (`2026-10-16-passarim-guinada-prd.md`), seção 6, frente G · Desenho: pranchetas `Visualizador.dc.html` e `KidsVisualizador.dc.html`, descritas em texto na seção 5.4 (o HTML é feito antes do código, no PR 2) · Regra de comentários: `~/dev/passarim/CLAUDE.md` · Depende de: E2 (app #40, o Detalhe novo) e frente B no BFF (no ar)

O dono delegou as decisões de design desta frente a um agente que o representou. Uma segunda opinião independente revisou as decisões mais arriscadas (o arrasto para fechar, as barras do sistema, os critérios do teste rápido, a acessibilidade e o tema local), e o que ela mudou já está no texto. O que esse agente decidiu está marcado com **[R]** e listado na seção 13. Onde esta spec ajusta o PRD, a seção 12 diz o quê.

## 1. Objetivo

Tocar numa foto do Detalhe abre a foto **inteira**, em tela cheia, com deslize entre as fotos da ave e zoom. Hoje as fotos aparecem só cortadas: a de cima com `ContentScale.Crop`, e as outras como miniaturas de 112 dp no fim da página (problema 3 do PRD).

O visualizador é **um só para as duas jornadas**. Nesta frente ele é ligado ao Detalhe do adulto. O Detalhe do Kids nasce na frente F, que só acrescenta a rota ao grafo do Kids **[R]**. A variante Kids da tela (controles de 56 dp, crédito sem link) é feita e fotografada aqui.

### Pronto quando

1. Dá para ver todas as fotos inteiras, com deslize e zoom, no Android e no iOS. O iOS vale pelo job `ios` da CI e pelo simulador, quando o Xcode 26 estiver selecionado (risco do PRD).
2. O leitor de tela anuncia "Foto 2 de 5" e o crédito.
3. Com o Detalhe já aberto, o visualizador abre **sem rede**, com as fotos que já vieram para o aparelho.
4. Nenhum toque no visualizador abre um link externo, nas duas jornadas.
5. Os snapshots estão na matriz da seção 9, com fonte 1.0×, 1.3× e 2.0×.

## 2. Biblioteca de zoom: o teste rápido do `telephoto`

O PRD manda começar por um teste rápido do `telephoto` (zoom com Coil 3 em KMP). A consulta ao Maven Central em 2026-11-12 já responde parte da pergunta:

| Artefato (versão 0.19.0, Apache 2.0) | Plataformas publicadas |
|---|---|
| `me.saket.telephoto:zoomable` (o `Modifier.zoomable`) | Android, iOS (arm64, simulador arm64, x64), desktop, web |
| `me.saket.telephoto:zoomable-image` e `zoomable-image-coil3` (o `ZoomableAsyncImage`) | **só Android** |

Ou seja, o `ZoomableAsyncImage` do Coil 3 não existe no iOS. O caminho multiplataforma é o `Modifier.zoomable` sobre o `AsyncImage` do Coil que o app já usa **[R]**. A subamostragem (`sub-sampling-image`), que serve para imagens enormes, não faz falta: a variante `large` tem no máximo 1024 px no lado maior.

**O teste rápido** responde ao que a consulta não responde. Ele roda **antes de escrever o plano**, num branch descartável, porque o resultado decide boa parte do G2 **[R]**. O plano registra o resultado. O `zoomable` 0.19.0 foi compilado contra o Compose Multiplatform 1.8.0, e o app está no 1.12.1. O teste passa quando:

1. a dependência resolve com o CMP 1.12.1 e os locks (`resolveAndLockShipped --write-locks`);
2. um módulo de teste com o arranjo do visualizador compila para o iOS **sem nenhum aviso de "partial linkage"** do Kotlin/Native. Com a ligação parcial, um símbolo que sumiu entre o CMP 1.8 e o 1.12 não dá erro de link: vira exceção na hora de rodar. O teste compila com `-Xpartial-linkage-loglevel=ERROR`, para o aviso virar erro. O módulo não depende do MapLibre, então o link não esbarra no problema do Xcode 26 que trava o `:app` e o Detalhe;
3. o mesmo teste de UI (`runComposeUiTest`) **roda no host (Robolectric) e no `iosSimulatorArm64Test`**, porque gesto no iOS é justamente o risco. Ele cobre, com o arranjo da seção 6 (`HorizontalPager`, `Modifier.zoomable` e o arrasto para fechar):
   - o toque duplo aproxima e o segundo volta a 1×;
   - com zoom, o arrasto horizontal move a foto e não troca de página;
   - com zoom, o arrasto para baixo move a foto e não fecha;
4. no aparelho (e no simulador iOS, quando o Xcode 26 estiver selecionado), o gesto de voltar da borda do sistema não briga com o deslize do pager na primeira foto.

**Se o teste falhar** em qualquer item, o zoom é próprio, como o PRD prevê: `detectTransformGestures` para a pinça e o arrasto, `detectTapGestures(onDoubleTap)` para o toque duplo, com os limites da seção 6, num `ZoomableBox` do próprio módulo. O resto da spec não muda.

**Fechar arrastando é próprio, nos dois casos** **[R]**: um `draggable` vertical, ligado só sem zoom. O `flick` do mesmo projeto foi pensado para uma camada desenhada por cima da tela anterior; aqui o visualizador é uma rota do `NavHost`, e o Detalhe por baixo não é desenhado depois que a transição termina. Por isso o fundo **não** clareia durante o arrasto (mostraria uma tela vazia, não o Detalhe): a foto acompanha o dedo e encolhe, o fundo continua opaco, e ao soltar além do limite a rota fecha (seção 6).

**Sem ADR nova** **[R]**: é uma biblioteca de interface com licença Apache 2.0, isolada num módulo só, que entra pelas Licenças (`aboutlibraries.json`) como as outras. A ADR-0019 (conjunto de versões) já cobre a regra de fixar a versão.

## 3. Dados

### 3.1 A foto vai para o `core:domain`

- A classe `Photo` sai de `feature:detail:domain` e vai para `core:domain` **[R]**. Agora duas features a usam (o Detalhe e o visualizador), e uma feature de apresentação não depende do domínio de outra feature (é o padrão do projeto: o `KidsAvailabilityRepository` da D fica em `core:domain` pelo mesmo motivo).
- `Photo` ganha `width: Int?` e `height: Int?`, que o BFF já manda (`openapi.yaml`, schema `Photo`, campos obrigatórios) e o app ignora hoje. Um valor zero ou ausente vira `null`.
  - **Para que servem:** o zoom precisa da proporção da imagem para saber onde ela está dentro da tela e não deixar arrastá-la para fora (`ZoomableContentLocation.scaledInsideAndCenterAligned`). Com as medidas do BFF, a proporção é conhecida antes de a imagem baixar, e o primeiro quadro não dá salto. Sem elas, a proporção vem do tamanho da imagem que o Coil entrega quando termina de carregar.
- `heroUrl` e `galleryUrl` continuam como estão.

### 3.2 O repositório guarda a última espécie em memória

- `DetailRepository.get(id)` passa a se chamar `getSpeciesDetail(id)` **[R]**. A interface já vai mudar, e a regra do projeto proíbe `get` sozinho em repositório (ele se confunde com o `get()` do Koin).
- Interface nova em `core:domain` **[R]**:

  ```kotlin
  interface SpeciesPhotosRepository {
      suspend fun getSpeciesPhotos(id: String): Result<SpeciesPhotos, DataError.Network>
  }

  data class SpeciesPhotos(val id: String, val commonName: String, val photos: List<Photo>)
  ```

  O `commonName` vai junto porque o leitor de tela anuncia o nome da ave na foto.
- **Implementação** **[R]:** o próprio `RemoteDetailRepository`, em `feature:detail:data`, implementa as duas interfaces e guarda **uma** espécie em memória, a última que o `getSpeciesDetail` trouxe com sucesso:
  - `getSpeciesDetail` **sempre** vai à rede e, se der certo, troca a espécie guardada. O Detalhe continua mostrando o dado mais novo;
  - `getSpeciesPhotos` devolve a espécie guardada se o id bater e só vai à rede se não bater (e aí também guarda o que veio);
  - a espécie guardada fica num `MutableStateFlow<SpeciesPhotos?>`, que troca o valor de uma vez só e pode ser lido e escrito de várias coroutines sem trava. Nenhum lock é segurado durante a chamada de rede **[R]**;
  - no Koin, o mesmo `single` atende às duas interfaces (`single { RemoteDetailRepository(...) } binds arrayOf(...)`), para os dois lados verem a mesma memória.
- **Sem prazo de validade e sem gravar em disco** **[R]**: a memória dura enquanto o processo vive. Se o sistema matar o app com o visualizador aberto, ele volta buscando na rede (seção 8).
- **Nada muda no BFF, no catalog nem no proto.** A frente G só lê campos que já existem.

## 4. Navegação

- **Rota** `ViewerRoute(id: String, index: Int)`, no `NavHost` da raiz do adulto, por cima do Detalhe, como o `DetailRoute`. No Kids, a frente F põe a mesma rota no grafo do Kids **[R]**.
- O nome dos campos da rota é a chave que o ViewModel lê do `SavedStateHandle` (`KEY_SPECIES_ID`, `KEY_PHOTO_INDEX`), com um teste em `RoutesTest`, como já há para o `DetailRoute`.
- **De onde se abre** (só no Detalhe):
  - **foto do topo:** índice 0. O `PiuHeroPhoto` ganha `onClick: (() -> Unit)?`, com o rótulo de clique "Ver foto inteira". Os botões de voltar e favoritar ficam por cima e continuam recebendo o próprio toque. Sem foto (o gradiente do bioma), o topo não é clicável;
  - **galeria:** o `PiuPhotoGallery` ganha `onPhotoClick: ((Int) -> Unit)?`. A galeria mostra as fotos a partir da segunda (`photos.drop(1)`), então a miniatura `i` abre o índice `i + 1`.
- **As rotas só ligam as peças.** O Detalhe ganha a ação `OpenPhoto(index)` e o evento `NavigateToViewer(id, index)`, que chega à tela como `Flow` e é coletado lá dentro (regra do projeto). O bloco da rota no `App.kt` só faz `rootNav.navigate(ViewerRoute(...))`.
- **Sem a foto viajando** da miniatura para o visualizador **[R]**: a abertura é a troca de tela de hoje. A `PiuSharedTransitionLayout` do E2 continua só entre o card e o Detalhe. Fica como ideia para a frente H.

## 5. Tela

Módulo novo `feature:viewer:presentation`, que depende de `core:domain`, `core:presentation` e `core:piu-ds` (o mesmo desenho do `feature:favorites:presentation`). Não há `feature:viewer:data` nem `domain`: os dados vêm da interface do `core:domain` **[R]**.

### 5.1 Fundo e tema

- **Fundo quase preto em todas as jornadas e temas** **[R]**: um token novo `PiuTheme.tokens.viewerBackground` (`#0B0F0C`, um pouco mais fundo que o fundo escuro do Piu, `#101410`). É um palco para a foto: com fundo claro, as bordas de uma foto escura somem, e uma foto clara cega.
- O texto e os ícones são brancos sobre o `photoTextScrim` do PiuDS (o mesmo do nome sobre a foto no Detalhe), então o contraste não depende do tema.
- **As barras do sistema** ficam com ícones claros enquanto o visualizador está aberto e voltam ao que o tema pede ao fechar **[R]**. Hoje a aparência das barras sai do `SystemBarsAppearance`, que é `internal` no `:app` e roda uma vez na raiz, então um módulo de feature não a alcança. A frente cria em `core:presentation` um `LocalSystemBarsOverride`: o `:app` o fornece e aplica o pedido mais recente por cima do tema; a tela do visualizador pede "ícones claros" num `DisposableEffect` e desfaz o pedido ao sair. No iOS, o `SystemBarsAppearance` hoje não faz nada (`= Unit`), e continua assim: a barra de status do iOS segue o tema, aceito como limitação. A foto vai de ponta a ponta; os controles respeitam `safeDrawing`.
- **Tema local** **[R]:** no adulto, o conteúdo do visualizador fica dentro de um `PiuTheme(journey = ADULT, themeMode = DARK, dynamicColor = false)` próprio. Assim o indicador de carregando, o botão "Tentar de novo" e qualquer peça que leia o `MaterialTheme` ficam iguais com o app claro ou escuro, e as cores dinâmicas não vazam para o palco escuro. É isso que deixa os snapshots só no escuro (seção 9) verdadeiros por construção.
- O PRD diz que o visual do Kids é sempre claro. O visualizador é a exceção de propósito, no próprio texto do PRD ("sobre fundo escuro"); os controles do Kids continuam com a cara do Kids (seção 5.3).
- **Jornada:** o `PiuTheme` passa a expor `PiuTheme.journey` **[R]** (hoje ele recebe a jornada, mas não a devolve). O visualizador lê dali se está no Kids, sem parâmetro na rota.

### 5.2 Conteúdo (adulto)

- **Topo**, sobre um degradê do `photoTextScrim` para transparente:
  - à esquerda, o botão **fechar** (X), círculo de vidro de 48 dp, o mesmo `PiuBlurSurface` dos botões do Detalhe;
  - no meio, o indicador **"2 de 5"** (`labelLarge`, branco). Com uma foto só, o indicador não aparece.
- **Meio:** um `HorizontalPager` com as fotos, `beyondViewportPageCount = 1` (a vizinha já começa a baixar). Cada página:
  - mostra a foto inteira, `ContentScale.Fit`, centralizada;
  - **duas camadas** **[R]**: por baixo, a variante `medium` (a mesma URL das miniaturas da galeria, que já está no cache de disco do Coil); por cima, a `large`. Enquanto a grande baixa, a média aparece; se a grande falhar (sem rede), a média fica. A foto do topo usa a `large` no Detalhe, então a primeira já costuma estar no cache em tamanho grande. Só a página tem descrição para o leitor de tela; as duas camadas ficam sem `contentDescription`. Com "reduzir animações", o `crossfade` do Coil é desligado nas duas;
  - sem nenhuma das duas, o `PhotoPlaceholder` do PiuDS, em branco sobre o fundo escuro.
- **Baixo**, sobre um degradê do scrim, o **crédito** sempre visível: "Foto: autor · licença", com o mesmo formatador do Detalhe (`rememberCreditFormatter`, que sai do `DetailContent.kt` e vai para `core:presentation` com as strings de crédito, e o `CreditFormat` vai para `core:domain` **[R]**, já que agora duas features os usam). **Sem link nas duas jornadas** **[R]**: os links para o iNaturalist continuam na seção de créditos do Detalhe do adulto. Assim nenhum toque no visualizador sai do app, e a mesma tela serve ao Kids sem ramo para o link.
- **Os controles não somem** **[R]**: um toque simples na foto não esconde nada. O crédito precisa ficar visível (licenças CC), e controles que somem confundem quem usa leitor de tela.

### 5.3 Variante Kids

A mesma tela, com o que muda pela `PiuTheme.journey`:

- o fechar vira um `PiuKidsButton` redondo de **56 dp**, com o X;
- o indicador "2 de 5" e o crédito usam a tipografia do Kids (Nunito);
- o crédito, sem link como no adulto;
- os alvos de toque têm pelo menos 56 dp (critério 3 da frente F).

### 5.4 Pranchetas novas (descrição para o canvas)

As duas entram em `docs/design/direcoes-2026/canvas/` e no `canvas.json`, ao lado do Detalhe de cada jornada, antes do código (PR 2):

- **`Visualizador.dc.html`** (390 × 844, "Moderno · Visualizador"): fundo `#0B0F0C`; no topo, faixa de 120 dp com o scrim descendo para transparente, o X num círculo de vidro de 48 dp a 16 dp da esquerda e "2 de 5" centralizado na mesma linha; no meio, uma foto de paisagem (proporção 4:3) inteira, centralizada, com as bordas do fundo aparecendo em cima e embaixo; embaixo, faixa de 96 dp com o scrim subindo e o crédito "Foto: Steve Foss · CC BY-NC" em branco, a 20 dp das bordas. Um segundo quadro, menor, mostra a mesma foto aproximada a 2.5×, com o indicador e o crédito no mesmo lugar.
- **`KidsVisualizador.dc.html`** (390 × 844, "Infantil · Visualizador"): o mesmo palco escuro; o X num botão redondo amarelo do Kids, de 56 dp, com a sombra sólida; "2 de 5" em Nunito 800; o crédito em Nunito, sem sublinhado. O Pipo **não** aparece: a foto é da ave, e o guia ali só atrapalharia.

## 6. Gestos

| Gesto | Sem zoom | Com zoom |
|---|---|---|
| Pinça | Aproxima até 4× **[R]** | Aproxima ou afasta, entre 1× e 4× |
| Toque duplo | Aproxima a 2.5× no ponto tocado **[R]** | Volta a 1× |
| Arrastar na horizontal | Troca de foto | Move a foto; troca de foto só depois de encostar na borda |
| Arrastar para baixo | A foto acompanha o dedo e encolhe; ao soltar além do limite, **fecha** | Move a foto (não fecha) |
| X ou voltar do sistema | Fecha | Fecha |

- **Fechar arrastando** **[R]:** passa de um quarto da altura da tela, ou solta rápido para baixo, fecha; menos que isso, a foto volta ao lugar. Para cima não fecha. O fundo continua opaco (seção 2).
- **Fechar, por qualquer caminho** (X, arrasto, voltar ou o evento `Close`), passa por `dropUnlessResumed`, como nas outras rotas: dois toques rápidos não desempilham duas telas.
- **Cada página tem o próprio zoom**, e trocar de foto deixa a anterior em 1×.
- **Reduzir animações:** o toque duplo e o fechar trocam de estado direto, sem animar. Os gestos com o dedo continuam acompanhando o dedo (não são animação, são resposta ao toque).
- **Acessibilidade dos gestos:** nada depende só de gesto. Fechar tem o X; trocar de foto tem as ações de rolagem do `HorizontalPager` (o leitor de tela passa de página com o gesto dele); o zoom não tem equivalente e não precisa ter, porque a foto já está inteira.

## 7. Acessibilidade

- **Cada página** tem `contentDescription` "Foto 2 de 5 de Andorinha-pequena-de-casa. Foto: Steve Foss, CC BY-NC" **[R]**. A foto é a informação, então ela é anunciada inteira, com o crédito. Ao trocar de página, o leitor de tela lê a página nova, e é assim que "foto 2 de 5" e o crédito são anunciados (pronto quando 2).
- **Sem anúncio repetido** **[R]:** o indicador "2 de 5" e o crédito visível saem da árvore de acessibilidade (`clearAndSetSemantics {}`), porque a descrição da página já diz os dois. Sem `liveRegion` no indicador: ele repetiria o anúncio da troca de página.
- **O X** é "Fechar foto", com 48 dp (56 dp no Kids).
- **Com fonte 2.0×**, o crédito quebra em até 3 linhas e sobe o degradê de baixo junto; ele nunca cobre o indicador nem o X.

## 8. Estado e carregamento

- `ViewerViewModel` lê o id e o índice da rota e pede `getSpeciesPhotos(id)`.
- **Fases:** carregando (o fundo escuro com um indicador branco), conteúdo e erro.
  - **Erro** **[R]:** o X continua no topo, e no meio aparecem a mensagem do `ScreenError` (como no Detalhe) e "Tentar de novo", em branco sobre o escuro. No Kids, a mesma coisa com o Pipo da frente F quando ela existir; aqui, o texto.
  - Espécie sem fotos (não deveria acontecer, porque o topo sem foto não abre): fecha sozinho com o evento `Close`.
- **Índice:** um índice fora da lista é trazido para dentro (`coerceIn`). A página atual vai para o `SavedStateHandle` a cada troca, numa chave própria (`KEY_CURRENT_PAGE`), separada do argumento da rota (`KEY_PHOTO_INDEX`): uma é o que pediram ao abrir, a outra é onde a pessoa está. Girar a tela ou o processo morrer volta na mesma foto.
- **Processo morto sem rede:** a espécie não está mais em memória, então o visualizador mostra o erro de sem conexão. Risco aceito: o Detalhe por baixo também volta pedindo a rede.

## 9. Testes

- **Dados:**
  - o DTO com `width` e `height` (e sem eles, ou com zero, vira `null`);
  - `getSpeciesPhotos` não vai à rede quando a espécie guardada é a mesma (o motor falso do Ktor conta as chamadas), vai quando é outra, e guarda o que trouxe;
  - `getSpeciesDetail` sempre vai à rede e troca a espécie guardada; uma falha não apaga a guardada;
  - o Koin entrega a mesma instância para as duas interfaces;
  - **abre sem rede** (pronto quando 3): depois de um `getSpeciesDetail` bem-sucedido, com o motor falso passando a falhar, `getSpeciesPhotos` da mesma espécie dá certo.
- **ViewModel do visualizador:** o índice inicial vindo da rota; o mesmo cenário sem rede depois do Detalhe aberto, de ponta a ponta com o repositório de verdade e o motor falso; o índice fora da lista; a página salva no `SavedStateHandle` e restaurada; o erro e o "Tentar de novo"; a lista vazia emite `Close`.
- **ViewModel do Detalhe:** `OpenPhoto(index)` emite `NavigateToViewer(id, index)`.
- **Funções puras:** o rótulo "2 de 5" e a descrição da página; a decisão de fechar pelo arrasto (distância e velocidade, e nunca com zoom).
- **UI no host (`runComposeUiTest` v2):**
  - o toque duplo aproxima e o segundo volta a 1×; com zoom, o arrasto horizontal não troca de página;
  - tocar no topo do Detalhe abre o índice 0, e na miniatura `i`, o `i + 1`;
  - semântica: o X com rótulo e 48 dp (56 no Kids), a descrição de cada página, e o indicador e o crédito fora da árvore;
  - **nenhum nó clicável** além do X e do "Tentar de novo" (garante que o crédito não virou link e que o `zoomable` não acrescentou um clique), nas duas jornadas;
  - o pedido de ícones claros nas barras é feito ao abrir e desfeito ao fechar.
- **Snapshots (Paparazzi)** **[R]:** o visualizador em Piu e em Piu Kids, cada um com foto de paisagem, foto de retrato, uma foto só (sem indicador), carregando e erro, com fonte 1.0×, 1.3× e 2.0×. O adulto roda dentro do tema escuro local (seção 5.1), então o Piu é fotografado **só uma vez**; com o app claro, a tela seria a mesma. No Kids, o contraste dos controles amarelos e do texto sobre `#0B0F0C` é conferido com a ferramenta de `docs/design/tools`. O topo do Detalhe e a galeria não mudam de aparência e mantêm os snapshots do E2.
- **iOS:** os testes do módulo do visualizador rodam no `iosSimulatorArm64Test` localmente (o módulo não linka o MapLibre); a conferência no simulador fica pendente do Xcode 26 selecionado.

## 10. Ordem de entrega **[R]**

| # | PR | Repositório | Depende de |
|---|---|---|---|
| 1 | Esta spec | `passarim-docs` | — |
| 2 | As pranchetas `Visualizador` e `KidsVisualizador` e o `canvas.json` | `passarim-docs` | aprovação desta spec |
| — | O teste rápido do `telephoto` (seção 2), num branch descartável, antes do plano; o resultado vai para o plano | — | aprovação desta spec |
| 3 | **G1:** `Photo` no `core:domain` com as medidas, `getSpeciesDetail`, `SpeciesPhotosRepository` e a memória do repositório | `passarim-app` | E2 (#40) |
| 4 | **G2:** a dependência do zoom (ou o zoom próprio), `feature:viewer:presentation` (tela, gestos, Kids), `PiuTheme.journey`, `viewerBackground`, o `LocalSystemBarsOverride`, o formatador de crédito no `core:presentation`, a rota e a abertura pelo topo e pela galeria | `passarim-app` | G1 e PR 2 |

O G1 empilha no E2 porque o E2 mexe no topo do Detalhe e no mapper, e é rebaseado sempre que o #40 mudar. O plano é escrito depois que o dono aprovar esta spec. Cada PR do app sai com o APK conferido no aparelho do dono, ou com a conferência registrada como pendente.

## 11. Fora do escopo

- a rota no grafo do Kids e a abertura pelo Detalhe do Kids (frente F, que só liga a rota);
- a foto viajando da miniatura para o visualizador (ideia para a frente H);
- compartilhar ou salvar a foto, legenda além do crédito, e link para a fonte dentro do visualizador;
- abrir o visualizador fora do Detalhe (mosaico, Favoritos, Álbum);
- subamostragem de imagens maiores que a `large` (o catalog não guarda nada maior);
- qualquer mudança no BFF, no catalog ou no proto.

## 12. Ajustes ao PRD

1. **Biblioteca:** o PRD fala em "`telephoto` (zoom com Coil 3 em KMP)". O artefato do Coil 3 do `telephoto` é só Android; a frente usa o `Modifier.zoomable` multiplataforma sobre o `AsyncImage` do Coil, e o teste rápido decide entre ele e o zoom próprio **[R]**.
2. **Cache do repositório:** o PRD diz que o repositório do Detalhe "guarda em memória a última espécie aberta", e isso ainda não existe no app. A frente cria essa memória, mas o Detalhe continua indo sempre à rede; só o visualizador usa a memória primeiro **[R]**.
3. **Tamanho da foto:** o PRD pede a variante `large`. A frente mostra a `medium` por baixo da `large`, para abrir sem rede com o que já veio nas miniaturas **[R]**.
4. **Crédito:** o PRD pede crédito sem link só no Kids. A frente tira o link nas duas jornadas, porque os links já estão na seção de créditos do Detalhe, e é ali que a atribuição CC fica completa **[R]**. Se um dia o visualizador abrir fora do Detalhe, o link precisa voltar a algum lugar. É o único ajuste que muda o produto para o adulto, e pede o aceite explícito do dono na revisão desta spec.
5. **Kids:** a variante Kids da tela é feita e fotografada aqui, mas ligada ao app só na frente F **[R]**.

## 13. Decisões do representante [R]

1. O zoom usa o `me.saket.telephoto:zoomable` 0.19.0 (`Modifier.zoomable`, KMP) sobre o `AsyncImage` do Coil, porque o `zoomable-image-coil3` é só Android; sem subamostragem.
2. O teste rápido roda antes do plano e passa com: resolução com o CMP 1.12.1 e locks; compilação iOS sem aviso de "partial linkage"; o mesmo teste de UI de gestos rodando no host e no simulador iOS; e o voltar da borda sem brigar com o pager. Se falhar, o zoom é próprio (`detectTransformGestures` e `detectTapGestures`).
3. Fechar arrastando é um `draggable` vertical próprio, só sem zoom, sem o `flick`: a foto acompanha o dedo e encolhe, e o fundo continua opaco, porque o Detalhe por baixo não é desenhado numa rota do `NavHost`.
4. Sem ADR nova para o `telephoto`; ele entra nas Licenças.
5. `Photo` vai para `core:domain` e ganha `width` e `height` do BFF (zero ou ausente vira `null`), usados para a proporção do zoom, com o tamanho da imagem carregada como plano B.
6. `DetailRepository.get` vira `getSpeciesDetail`.
7. `SpeciesPhotosRepository.getSpeciesPhotos(id)` e `SpeciesPhotos(id, commonName, photos)` em `core:domain`, implementados pelo `RemoteDetailRepository`, com uma espécie em memória num `MutableStateFlow` (sem lock durante a rede) e o mesmo `single` do Koin para as duas interfaces.
8. O Detalhe sempre vai à rede; só o visualizador usa a memória primeiro. Nada em disco e sem prazo.
9. `ViewerRoute(id, index)` no `NavHost` da raiz do adulto; a F põe a mesma rota no Kids.
10. Abre pelo topo (índice 0, `PiuHeroPhoto.onClick`, "Ver foto inteira") e pela galeria (miniatura `i` → índice `i + 1`, `PiuPhotoGallery.onPhotoClick`), pelo evento `NavigateToViewer` coletado na tela.
11. Sem a foto viajando da miniatura para o visualizador; fica para a H.
12. Módulo `feature:viewer:presentation` sem `data` nem `domain` próprios.
13. Fundo quase preto (`viewerBackground`, `#0B0F0C`) nas duas jornadas e nos dois temas; texto branco sobre o `photoTextScrim`; no adulto, um `PiuTheme` escuro local, sem cores dinâmicas.
14. `PiuTheme.journey` passa a existir, e o visualizador decide a variante Kids por ele.
15. Duas camadas por página: `medium` por baixo, `large` por cima, sem descrição nas camadas e sem `crossfade` com "reduzir animações"; `beyondViewportPageCount = 1`.
16. O crédito nunca tem link, nas duas jornadas; o formatador de crédito vai para `core:presentation`.
17. Os controles não somem com o toque simples.
18. Kids: fechar como `PiuKidsButton` de 56 dp, tipografia do Kids, sem o Pipo.
19. Zoom de 1× a 4×; o toque duplo vai a 2.5× no ponto tocado e volta a 1×; cada página tem o próprio zoom.
20. Fecha arrastando para baixo um quarto da tela, ou soltando rápido; nunca com zoom; com "reduzir animações", o toque duplo e o fechar não animam; todo fechamento passa por `dropUnlessResumed`.
21. A descrição de cada página é "Foto 2 de 5 de <ave>. Foto: <autor>, <licença>"; o indicador e o crédito visível ficam fora da árvore de acessibilidade, e não há `liveRegion`, para nada ser anunciado duas vezes.
22. Erro com o X, a mensagem e "Tentar de novo"; índice fora da lista é trazido para dentro; a página atual fica no `SavedStateHandle` numa chave própria (`KEY_CURRENT_PAGE`); lista vazia fecha.
23. Snapshots: Piu uma vez só (o tema escuro local o torna igual com o app claro) e Piu Kids, com paisagem, retrato, foto única, carregando e erro, em 1.0×, 1.3× e 2.0×.
24. As pranchetas `Visualizador` e `KidsVisualizador` são descritas nesta spec e desenhadas num PR próprio antes do código.
25. Quatro PRs: esta spec; as pranchetas; G1 (dados, empilhado no E2 e rebaseado com ele); G2 (o zoom, a tela e a ligação). O teste rápido roda antes do plano, fora dos PRs.
26. Riscos aceitos: processo morto sem rede mostra erro; o iOS no simulador fica pendente do Xcode 26.
27. Ícones claros nas barras do sistema enquanto o visualizador está aberto, por um `LocalSystemBarsOverride` em `core:presentation` pedido num `DisposableEffect` da tela; no iOS, a barra de status segue o tema.
