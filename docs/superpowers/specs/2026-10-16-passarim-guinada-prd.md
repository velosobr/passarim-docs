# Passarim — Guinada: PRD do Passarim e do Passarim Kids

Data: 2026-10-16 · Substitui: a etapa 5e (`2026-10-08-passarim-app-fechamento-design.md`), que vira a frente H · Referência visual: `docs/design/direcoes-2026/` · Depende de: 5a–5d, com o app #9 e o docs #7 mergeados (o `docs/privacidade.md` e a ADR-0020 estão no #7)

Este é o documento de produto da guinada. Ele junta as decisões tomadas com o dono e divide o trabalho em frentes. Cada frente ganha a própria spec e o próprio plano quando começar, seguindo o fluxo de Spec Driven Development já usado na etapa 5: spec, revisão do dono, plano, execução e PR.

Decisões do redator estão marcadas com **[DR]** e listadas na seção 12.

## 1. Problema

1. **O app parece genérico.** A auditoria de `docs/design/direcoes-2026/README.md` mostra:
   - o Explorar é uma grade de cards iguais, com o texto separado da foto;
   - no Detalhe, a foto é um retângulo solto;
   - o app é quase todo verde, e a barra de navegação é a padrão;
   - não há movimento entre as telas.
2. **A foto principal às vezes não mostra a ave.** No anu-preto, ela é um ninho com ovos; na andorinha, um bando. O catálogo pega a primeira foto (`photos[0]`) de cada observação do iNaturalist (`internal/adapter/sources/inaturalist/client.go`), e a primeira foto processada vira a principal (`internal/usecase/ingest/photos.go`), sem nenhum filtro de conteúdo.
3. **A galeria é pequena demais.** As fotos aparecem em miniatura no fim do Detalhe, cortadas, e não há como ver uma foto inteira nem passar de uma para outra.
4. **O app não fala com crianças.** O conteúdo é adulto, com nome científico em destaque, termos técnicos e links externos por toda parte.

## 2. Público e objetivos

**Público:**

- **Passarim:** adultos curiosos por aves do Brasil, como hoje.
- **Passarim Kids:** crianças de **8 a 12 anos, que já leem**. As frases são curtas, e não há narração no MVP.

**Idioma:** só pt-BR, nas duas jornadas e nas fichas das lojas. Os textos do Kids ficam em `composeResources`, como o resto.

**Objetivos:**

1. Depois do splash, a pessoa escolhe entre **Passarim** e **Passarim Kids** e entra numa jornada própria, com visual e conteúdo próprios.
2. A foto principal de toda ave mostra **uma ave**: nunca ninho, ovo, pena, ave morta ou bando.
3. Tocar numa foto abre um **visualizador em tela cheia**, com deslize entre as fotos e zoom.
4. O visual segue as direções de 2026 por meio de um design system com nome, o **PiuDS**, com duas variantes.
5. O código do Passarim fica **comentado de forma didática**, para estudo (regra do `CLAUDE.md` local).

**Fora do escopo:**

- narração ou áudio de texto no Kids (evolução futura);
- modo escuro no Kids;
- conteúdo Kids gerado em tempo real no BFF;
- juiz de fotos com um modelo hospedado (Claude com visão), que fica como evolução para os casos de baixa confiança;
- outros idiomas;
- login, identificação de aves pela câmera e notificações (v2, como antes).

## 3. Decisões do dono

| # | Tema | Decisão |
|---|---|---|
| 1 | Faixa etária do Kids | 8 a 12 anos, já leitores; sem narração no MVP |
| 2 | Escolha de jornada | O app lembra a última e abre direto nela. Do adulto para o Kids: livre, nas Configurações. Do Kids para o adulto: passa pela trava para adultos. O Kids não abre nenhum link externo. |
| 3 | Conteúdo Kids | Gerado por IA (script com a API do Claude no catalog) **a partir do texto adulto curado**, sem inventar fatos, com revisão humana do diff do YAML no PR. A comparação de tamanho e o status de conservação em linguagem simples saem de regras fixas, sem IA. |
| 4 | Curadoria de fotos | Serviço Python com modelos abertos de visão (detector de aves e classificação sem treino), só na CPU e só na ingestão, chamado pelo worker. Ele é combinado com as anotações do iNaturalist e com o override no YAML, que é a palavra final. Ninho, ovos, pena e ave morta saem de vez; **bando só na galeria**. |
| 5 | Favoritos e álbum | Separados: a mesma tabela do Room com a coluna `audience` (migração de v1 para v2) |
| 6 | Cronograma | A guinada substitui a 5e; o fechamento vira a última frente |
| 7 | Canvas | É inspiração. As telas sem desenho seguem a mesma linguagem e são desenhadas no canvas antes do código de cada frente. |
| 8 | Desfoque | Entra o Haze 2.0 beta |
| 9 | Ajustes do Kids | Não há aba de Ajustes: o Kids tem Explorar e Álbum, mais um botão "Para adultos" atrás da trava. O visual é sempre claro. |
| 10 | Repositório do curador | Repositório novo, `velosobr/passarim-photo-curator` (já criado, vazio) |
| 11 | Nome do design system | **PiuDS**, com as variantes **Piu** (adulto) e **Piu Kids** |
| 12 | Comentários no código existente | Uma frente própria (0), no começo, só de comentários |
| 13 | Forma de onda do canto | Real: 64 picos calculados pelo worker com o ffmpeg |

## 4. Lojas e legislação

Pesquisa de 2026-10-16. As fontes estão na seção 13.

O Passarim não tem conta, não tem anúncios e não usa análise de uso (`docs/privacidade.md`). Isso resolve a maior parte das exigências.

**Terceiros que recebem o IP:** o mapa (OpenFreeMap) e a CDN de mídia recebem o endereço IP do aparelho para entregar o conteúdo, sem identificação nem perfil. A política de privacidade e os formulários das lojas citam os dois. A frente H confirma se isso conta como "coleta" para o Play e para a Apple.

- **Google Play (política Families):**
  - Um app cujo público inclui crianças precisa de conteúdo adequado, e anúncio, quando houver, só pode vir de SDK certificado.
  - **Declaração:** público-alvo com as faixas **6–8, 9–12** e as faixas a partir de 13 (os 8 anos caem na faixa 6–8) **[DR]**.
  - **Consequência:** com essas faixas, a política Families vale para o **app inteiro**, inclusive a jornada adulta, e não só para o Kids. A primeira escolha de jornada não tem trava, então uma criança pode entrar no adulto e tocar nos links externos dos créditos (Wikipedia, iNaturalist, xeno-canto) e do mapa.
  - **Antes de publicar (frente H):** conferir se esses links são aceitos nesse enquadramento. Se não forem, ou a jornada adulta abre links só depois da mesma trava, ou a tela de escolha passa a funcionar como uma tela de idade neutra. As duas saídas mantêm a decisão 2.
  - O formulário de segurança de dados declara a ausência de coleta, com a ressalva dos terceiros acima.
- **App Store:**
  - A categoria Kids (diretriz 1.3) exige trava antes de qualquer link externo, compra ou pedido de permissão, e proíbe análise de terceiros. A Apple recusa nessa categoria apps que não pareçam feitos para crianças de até 11 anos.
  - **Decisão:** o Passarim vai na categoria normal (Referência ou Educação), com classificação 4+, e **não** entra na categoria Kids.
- **Nas duas lojas,** o Kids segue as regras da categoria Kids mesmo assim:
  - trava antes de sair do Kids;
  - nenhum link externo, nem nos créditos, nem na atribuição do mapa;
  - nenhuma coleta de dados;
  - nenhum pedido de permissão.
- **ECA Digital (Lei 15.211/2025, em vigor desde 17/03/2026):**
  - Vale para serviços com acesso provável de crianças.
  - A verificação da faixa etária fica principalmente com as lojas e os sistemas operacionais.
  - **Ponto aberto (seção 11):** conferir no texto oficial e nos decretos o que cabe ao app, por exemplo o uso do "sinal de idade" das lojas, antes de publicar.

## 5. Arquitetura

```text
passarim-app ──REST──▶ passarim-bff ──gRPC──▶ passarim-catalog (API + worker)
                                                   │ gRPC (na ingestão, rede interna)
                                                   ▼
                                          passarim-photo-curator (Python, novo)
```

- **O curador só é chamado pelo worker, durante a ingestão.** A API do catalog, o BFF e o app não sabem que ele existe, e o Passarim no ar não depende dele.
- **Rede:** o curador roda numa rede `internal: true` com o worker, sem acesso à internet. É o worker que baixa as fotos, pelo `safehttp` que ele já usa.
- **Contratos:**
  - O `passarim-proto` ganha o serviço do curador e a geração de Python no `buf.gen.yaml` (`protocolbuffers/python`, `pyi` e `grpc/python`), em `gen/python`, versionada como o Go.
  - O curador instala o pacote gerado com `pip install "git+https://github.com/velosobr/passarim-proto@<tag>#subdirectory=gen/python"`.
  - O `catalog.proto` ganha só campos e métodos novos, então o `buf breaking` continua passando.
- **CI do curador:**
  - ruff;
  - pytest com a taxa de acerto e o teste de conversa com o código gerado;
  - dependências travadas (`uv.lock`);
  - build da imagem;
  - Trivy e gitleaks, como no worker (ADR-0014).
- **Compose local:** o `passarim-docs/docker-compose.yml` ganha o serviço `photo-curator` (`build: ../passarim-photo-curator`), no mesmo padrão dos outros.
- **ADRs novas**, numeradas depois da 0020:
  - serviço de curadoria em Python, uma exceção à ADR-0001 (backend em Go);
  - conteúdo Kids gerado por LLM com revisão humana, ao lado da ADR-0011;
  - Haze 2.0 em beta.
- **Ordem de deploy:** catalog, BFF e só então o app.

| Frente | Repositórios |
|---|---|
| 0. Comentários didáticos | `passarim-app`, `passarim-bff`, `passarim-catalog` |
| A. Curadoria de fotos | `passarim-photo-curator` (novo), `passarim-catalog`, `passarim-proto`, `passarim-docs` (compose e ADR) |
| B. Conteúdo Kids, "Ave do dia" e forma de onda | `passarim-catalog`, `passarim-proto`, `passarim-bff`, `passarim-docs` (ADR) |
| C. PiuDS | `passarim-docs` (tokens, regras e ADR do Haze), `passarim-app` |
| D. Escolha de jornada e trava | `passarim-app` |
| G. Visualizador de fotos | `passarim-app` |
| E. Jornada adulta | `passarim-app` |
| F. Jornada Kids | `passarim-app` |
| H. Fechamento | `passarim-app`, `passarim-docs` |

## 6. Frentes

A ordem de execução é: **0 → A → B → C → D → G → E → F → H**. O backend vem antes porque o redesign depende de fotos boas e dos campos novos. As letras seguem a ordem em que as frentes foram pensadas, não a ordem de execução.

### Frente 0: comentários didáticos no código existente

- **Objetivo:** aplicar a regra do `~/dev/passarim/CLAUDE.md` ao código que já existe:
  - um comentário no topo de cada arquivo com o papel dele;
  - o que cada classe e cada função faz e por quê;
  - conceitos explicados na primeira vez que aparecem no arquivo;
  - tom do `catalog.proto`.
- **Escopo:** uma contagem de 2026-10-16 achou algum comentário em só parte dos arquivos:
  - no BFF, 16 de 68 arquivos Go;
  - no catalog, 21 de 70;
  - no app, 42 de 129 arquivos Kotlin.

  O critério foi "o arquivo começa com comentário" no Go e "tem pelo menos uma linha de comentário" no Kotlin. A spec da frente refaz a contagem sem o código gerado.
- **Fora do escopo:** o código gerado (`gen/`, `build/`, `internal/adapter/postgres/sqlcgen/`).
- **Regra da frente:** só mudam **comentários** e a **configuração de lint** que eles exigirem:
  - Detekt `ForbiddenComment`, para aceitar `TODO`;
  - `misspell`, que reclama de palavras em português, no `.golangci.yml`;
  - as regras do ktlint sobre a posição dos comentários.

  Nenhuma linha de código muda. A revisão confere isso com um diff das linhas que não são comentário, ignorando `config/` e `.golangci.yml`, que tem de voltar vazio.
- **Entrega:** um PR por repositório. O PR #9 (5d) é mergeado antes, e os comentários dele entram no PR do app.

### Frente A: curadoria de fotos

**Coleta (worker do catalog):**

- Buscar mais candidatas: até **3 fotos por observação** e cerca de **40 por espécie** **[DR]**.
- **Anotações do iNaturalist, usadas no filtro da busca (`without_term_value_id`):** descartar as observações anotadas com
  - "evidência de presença" = pena, ovo ou construção (ninho);
  - "estágio de vida" = ovo;
  - "vivo ou morto" = morto.

  A anotação vale para a **observação inteira**: uma observação de ave adulta pode ter o ninho na segunda foto. Por isso o curador continua avaliando foto por foto.
- **Banco:** a tabela `media` ganha `source_photo_id` (o id da foto no iNaturalist), `category`, `score` e `model_version`.

**Curador (`passarim-photo-curator`):**

- **Linguagem e contrato:** Python, servidor gRPC com o método `ClassifyPhotos`.
- **Entrada:** o worker baixa as fotos e manda os **bytes da variante `medium`**, em lotes de até 8 fotos por chamada, para não passar do limite padrão de 4 MB de uma mensagem gRPC.
- **Resposta, para cada foto:**
  - **categoria:** enum `PhotoCategory`, com `PHOTO_CATEGORY_UNSPECIFIED`, `PHOTO_CATEGORY_SINGLE_BIRD`, `_FLOCK`, `_NEST`, `_EGGS`, `_FEATHER`, `_DEAD_BIRD`, `_NO_BIRD` e `_OTHER`, que seguem o `buf lint`;
  - número de aves detectadas;
  - fração da foto ocupada pela maior ave;
  - indicação de que a ave está cortada na borda;
  - nitidez;
  - confiança;
  - versão do modelo.
- **Modelos:** um detector de aves e um CLIP para a classificação sem treino, com descrições como "a nest with eggs" e "a flock of birds".
- **Licenças:**
  - só código **e pesos** com licença permissiva, por exemplo OpenCLIP (MIT), torchvision (BSD) e RT-DETR pela implementação original (Apache 2.0) ou pelo Hugging Face `transformers`;
  - **nunca o Ultralytics** (YOLO, ou o RT-DETR dele), porque é AGPL;
  - a spec lista a licença do código e a dos pesos de cada modelo, e o README do curador as reproduz;
  - a escolha final sai do teste com o conjunto de referência.
- **Execução:** só na CPU, com os pesos dentro da imagem Docker e nenhuma chamada externa em tempo de execução.

**Decisão (worker):**

- **Descarte:** `NEST`, `EGGS`, `FEATHER`, `DEAD_BIRD` e `NO_BIRD` saem de vez.
- **Bando:** `FLOCK` entra só na galeria.
- **Foto principal:** a `SINGLE_BIRD` com a maior pontuação. A pontuação combina:
  - ave grande no quadro e sem corte;
  - nitidez;
  - votos no iNaturalist.
- **Galeria:** até 6 fotos.
- **O contrato "a primeira é a principal" continua valendo** (`catalog.proto` e `openapi.yaml`). Se nenhuma `SINGLE_BIRD` sobrar, a galeria de bandos **não é publicada**: a espécie fica sem fotos, o app mostra o placeholder e a espécie entra no relatório.
- **Override no YAML:**
  - `photos.primary` e `photos.exclude`, pelo id da foto no iNaturalist, mandam sobre o modelo;
  - o `photos.primary` pode apontar para qualquer foto do iNaturalist, mesmo fora das candidatas: o worker a busca por `GET /v1/photos/{id}`. É assim que os casos difíceis chegam a uma ave sozinha, como a ararinha-azul, que é extinta na natureza e cuja busca por `research` exclui as aves em cativeiro;
  - **caminho até o worker:** o seed (`curated.LoadDir`) passa a aceitar as chaves `photos:` e `kids:` antes de qualquer YAML usá-las, e grava o override numa tabela `photo_override (species_id, primary_photo_id, excluded_ids)`, que o worker lê.
- **Relatório de curadoria:**
  - fica na tabela `curation_report`, porque o worker roda com o sistema de arquivos só de leitura;
  - um comando o exporta para revisão, com as escolhas e os casos de baixa confiança.

**Falhas:**

- Com o curador fora do ar, o job **devolve erro**, sem concluir:
  - a fila tenta de novo com backoff;
  - as fotos atuais ficam;
  - uma espécie nova fica sem foto até o curador voltar.
- Cada foto guarda a categoria, a pontuação e a versão do modelo, para refazer a curadoria e auditar.

**Reingestão:**

- O worker só reprocessa uma espécie depois de 30 dias (`RefreshAfter`, `cmd/worker/main.go`). Por isso a frente entrega um **comando que reenfileira todas as espécies**.
- Até a reingestão, fotos sem categoria contam como não elegíveis.

**Pronto quando:**

1. Nas 41 espécies, a foto principal é uma ave sozinha, pelo modelo ou pelo override do YAML, conferida à mão no relatório.
2. O anu-preto e a andorinha estão corrigidos.
3. O curador acerta acima do limite no conjunto de referência, medido na CI.

### Frente B: conteúdo Kids, "Ave do dia" e forma de onda

**YAML (`content/species/*.yaml`):**

- **`primary_biome`, obrigatório:** um dos `biomes` da espécie. No Kids, o "mundo" da ave é sempre o `primary_biome`: a tela de mundo, a figurinha e o progresso usam o mesmo critério. O anu-preto, por exemplo, está nos 6 biomas, mas tem um só mundo.
- **Bloco `kids:`, com:**
  - `description`: frases curtas;
  - `facts`: cada fato com `source_fact`, o índice do fato adulto de origem;
  - `did_you_know`: um fato curto para o balão "Você sabia?";
  - `generated_by`: o id exato do modelo usado;
  - `source_hash`: um hash do texto adulto de origem.
- **Conteúdo Kids revisado** é o bloco `kids:` presente no YAML, que só entra por PR revisado. O lint exige o bloco em todas as espécies. O filtro `kids_only` existe para espécies futuras ainda sem o bloco: elas não aparecem no Kids e não são elegíveis para a "Ave do dia".

**`cmd/kidsgen` (script com a API do Claude):**

- **Entrada:** só o texto adulto curado (descrição e fatos).
- **Saída:** o kidsgen acrescenta ou substitui só o bloco `kids:` no texto do arquivo, sem regravar o resto. Assim o estilo `>` e a ordem das chaves continuam iguais, e o diff fica fácil de revisar.
- **Rodada:** à mão, por quem cuida do conteúdo, com o resultado revisado no PR. O id do modelo é fixado na spec.
- **Chave:** a variável `ANTHROPIC_API_KEY`, só na máquina de quem roda. Nunca vai para a CI nem para o repositório, e o gitleaks cobre isso. A spec registra o custo estimado de uma rodada completa.
- **Temas sensíveis:** o texto adulto fala de tráfico, morte, carniça, predação e doenças. O prompt e a revisão seguem uma lista do que suavizar ou omitir, definida na spec.
- **Validações do lint do conteúdo:**
  - todo fato Kids aponta para um fato adulto que existe;
  - o `source_hash` bate com o texto adulto atual, então mudar o texto adulto exige gerar o Kids de novo;
  - toda frase respeita o limite de tamanho, definido na spec;
  - nenhum número aparece no texto Kids sem aparecer no texto adulto, com os números por extenso normalizados antes da comparação ("dois ou três" conta).

**Forma de onda:** o worker calcula 64 picos do canto com o ffmpeg, que já está na imagem (ADR-0014), e os guarda com o áudio. O mesmo comando de reingestão da frente A reprocessa os cantos.

**Proto (`catalog.proto`, só campos e métodos novos):**

- `Species.kids` (16): mensagem `KidsContent { string description = 1; repeated KidsFact facts = 2; string did_you_know = 3; }`, com `KidsFact { string text = 1; int32 source_fact = 2; }`. Ela tem mensagem própria, sem URL, para não levar links ao Kids.
- `Species.primary_biome` (17) e `SpeciesSummary.primary_biome` (6).
- `ListSpeciesRequest.kids_only` (6) e `ListFiltersRequest.kids_only` (1).
- `ListFiltersResponse.primary_biome_counts` (3): as contagens por bioma principal, usadas no progresso do álbum.
- `Audio.peaks` (4): `repeated float`, com valores de 0 a 1.
- **RPC novo:** `GetFeaturedSpecies(GetFeaturedSpeciesRequest { string date = 1; })`, com a data em `AAAA-MM-DD`, que devolve `GetFeaturedSpeciesResponse { SpeciesSummary species = 1; Audio audio = 2; }`. O áudio vai junto porque o card adulto tem botão de canto.
  - **Elegíveis:** as aves com foto principal `SINGLE_BIRD` e com conteúdo Kids.
  - **Escolha:** os ids elegíveis em ordem alfabética, com o índice dado por um hash da data, módulo o número de elegíveis. Uma mudança no conjunto de elegíveis só passa a valer no dia seguinte, para a ave não trocar no meio do dia.
  - **Sem nenhuma elegível:** devolve `NOT_FOUND`.
  - **Onde fica:** no catalog, porque é ele quem conhece a categoria das fotos **[DR]**. A ave é a **mesma nas duas jornadas**.

**BFF:**

- `GET /v1/species/{id}`: ganha `kids`, `primaryBiome` e `audio.peaks`.
- `GET /v1/species` e `GET /v1/filters`: aceitam `?audience=kids`.
- **`GET /v1/featured`, endpoint novo:**
  - a data é calculada no fuso de São Paulo;
  - sem catalog, responde erro e o app esconde o card;
  - o `Cache-Control` expira na meia-noite de São Paulo.
- **Cache (ADR-0016):**
  - o prefixo das chaves sobe de `bff:v1:` para `bff:v2:`, porque o formato muda;
  - a audiência entra nas chaves de lista e de filtros;
  - a chave da "Ave do dia" leva a data (`featured:2026-10-16`), então depois da meia-noite não sobra resposta velha do dia anterior.
- O OpenAPI é atualizado.

**Pronto quando:**

1. As 41 espécies têm `primary_biome` e o bloco `kids:` revisado.
2. O lint do conteúdo passa.
3. `/v1/featured` devolve a mesma ave o dia todo e troca à meia-noite de São Paulo.
4. Depois da reingestão, toda ave com canto tem `peaks`.

### Frente C: PiuDS

- **Nome:** **PiuDS**, com as variantes **Piu** (adulto) e **Piu Kids**.
- **Código:**
  - o módulo `core:design-system` vira `core:piu-ds`;
  - o pacote passa a ser `com.velosobr.piuds`;
  - o prefixo dos componentes é `Piu`;
  - `PassarimTheme` vira `PiuTheme(journey, themeMode, dynamicColor)`.
- **Regras:** o README de regras do PiuDS, no branch local `docs/piu-readme` de 05/10, volta para `docs/design/piuds/README.md`, atualizado:
  - duas variantes: o tema recebe a jornada, e o PiuDS continua exclusivo do Passarim;
  - comentários didáticos;
  - matriz de snapshots com fonte 1.0×, 1.3× e 2.0×.

  Depois disso, o branch velho é apagado, com o ok do dono.
- **Variante Piu:**
  - `MaterialExpressiveTheme` com as cores atuais;
  - Manrope, com títulos em 800;
  - claro, escuro e cores dinâmicas.
- **Variante Piu Kids:**
  - um esquema só claro, com fundo creme e texto azul-noite;
  - Fredoka e Nunito, com licença OFL e listadas nas Licenças;
  - sem cores dinâmicas.
- **Tokens fora do Material:** ficam num `CompositionLocal`, `PiuTheme.tokens`, com:
  - os gradientes de bioma (Piu) e de mundo (Piu Kids);
  - o scrim de foto;
  - as sombras sólidas do Kids;
  - as cores de conservação.

  A fonte continua sendo o `passarim-tokens.json`, que ganha a variante Kids, e o contraste é verificado pela ferramenta de `docs/design/tools`.
- **O Pipo:** desenho original, convertido de SVG para `ImageVector`. É o guia do Kids, um passarinho amarelo, e fica aqui porque o balão e os estados do Kids dependem dele.
- **Componentes:**
  - **comuns:** a forma "cookie" (`graphics-shapes`), o desfoque (Haze) e o crédito com modo sem link;
  - **em `components/adult`:** card de mosaico, "Ave do dia", chip de bioma e barra flutuante;
  - **em `components/kids`:** botão com sombra que afunda, cartão de mundo, figurinha, balão do Pipo e barra Kids.
- **Pronto quando:**
  1. o app atual roda sobre o PiuDS (variante Piu), e os snapshots mudam só pelo tema expressivo e pelos títulos em 800 (hoje em 700), com a diferença aprovada pelo dono no PR;
  2. os componentes novos têm snapshots;
  3. o contraste passa.

### Frente D: escolha de jornada e trava para adultos

- **Domínio e dados:**
  - `Journey { ADULT, KIDS }` em `core:domain`;
  - `Settings` ganha `journey: Journey?`, e o `SettingsRepository` ganha `setJourney(journey)`, no padrão do `observe()` e dos `setTheme` e `setAutoPlay` de hoje;
  - jornada nula quer dizer primeira abertura.
- **O Kids não altera as preferências do adulto.** Ele força o tema claro e desliga a reprodução automática do canto sem gravar nada. As barras do sistema seguem o tema em uso (`SystemBarsAppearance`).
- **Navegação:**
  - a raiz vai do Splash para a Escolha, só na primeira vez, e depois para as abas do adulto ou do Kids;
  - os dois grafos são separados;
  - trocar de jornada limpa a pilha;
  - as rotas só ligam as peças, e os efeitos ficam nas telas.
- **Módulo novo `feature:journey:presentation`:**
  - **tela de escolha:** dois cartões grandes, cada um com uma prévia do próprio visual;
  - **trava para adultos** **[DR]:** uma multiplicação de um número de dois algarismos por um de um algarismo, escrita por extenso ("Quanto é treze vezes sete?"), com a resposta digitada num teclado numérico. Errou, sorteia outra. A trava desencoraja, mas não impede, uma criança mais velha, e a spec registra isso.
- **Trocas de jornada:**
  - **do adulto para o Kids:** o item "Passarim Kids" nas Configurações;
  - **do Kids para o adulto:** o botão "Para adultos", depois da trava.
- **BFF antigo:** o BFF ignora parâmetros desconhecidos. Com um BFF sem a frente B, o app receberia todas as aves no Kids sem erro. Por isso o app só mostra o Kids se as respostas trouxerem o campo `kids`, e a ordem de deploy vem antes (seção 5).
- **Desenho primeiro:** a escolha e a trava são desenhadas no canvas antes do código.
- **Acessibilidade:** a trava é anunciada pelo TalkBack e pelo VoiceOver.
- **Pronto quando:**
  1. a primeira abertura mostra a escolha;
  2. as aberturas seguintes vão direto à última jornada;
  3. sair do Kids exige acertar a conta.

### Frente G: visualizador de fotos

- **Módulo novo:** `feature:viewer:presentation`, comum às duas jornadas. A rota recebe o id da ave e o índice da foto.
- **De onde vêm as fotos:** do repositório do Detalhe, que guarda em memória a última espécie aberta. A rede só é usada se esse cache não tiver a espécie, e assim o visualizador abre offline com as imagens em cache.
- **Abertura:** a partir da foto tocada, na galeria ou no topo do Detalhe.
- **Exibição:**
  - `HorizontalPager` entre as fotos, com o indicador "2 de 5";
  - a foto inteira, sem corte (`ContentScale.Fit`), sobre fundo escuro, no tamanho `large`;
  - o crédito sempre visível, com o autor e o código da licença, como as licenças CC pedem.
- **Gestos:**
  - zoom com pinça e com toque duplo;
  - fechar pelo X, pelo voltar ou deslizando para baixo (este último só sem zoom).
- **Biblioteca de zoom:** a spec começa com um teste rápido do `telephoto` (zoom com Coil 3 em KMP). Se ele não funcionar no iOS, o zoom é próprio, com `detectTransformGestures`.
- **No Kids:** controles de 56 dp e crédito sem link.
- **Desenho primeiro:** o visualizador é desenhado no canvas.
- **Pronto quando:**
  1. dá para ver todas as fotos inteiras, com deslize e zoom, no Android e no iOS;
  2. o leitor de tela anuncia "foto 2 de 5" e o crédito.

### Frente E: jornada adulta

- **Explorar:**
  - título com a contagem;
  - busca;
  - chips de bioma com gradiente;
  - card "Ave do dia" (`/v1/featured`), com botão de canto, que some se o endpoint falhar;
  - mosaico em 2 colunas (`LazyVerticalStaggeredGrid`), com o nome sobre a foto e o scrim;
  - barra de navegação flutuante em pílula, com Haze.
- **Detalhe:**
  - foto de ponta a ponta que se funde ao fundo, com botões translúcidos e Haze;
  - título sobre a transição;
  - player com a forma de onda real (`peaks`);
  - fatos em blocos;
  - a galeria abre o visualizador.
- **Transição:** a foto viaja do card para o topo do Detalhe (`SharedTransitionLayout`). Fica desligada quando a pessoa pede para reduzir animações.
- **Favoritos:** o mesmo mosaico.
- **Configurações:** visual novo, com grupos em cartões, e o item "Passarim Kids".
- **Desenho primeiro:** Favoritos e Configurações seguem a inspiração do canvas e são desenhados antes do código.
- **Pronto quando:**
  1. as telas batem com os desenhos aprovados;
  2. os snapshots estão em claro e escuro e com fonte 1.0×, 1.3× e 2.0×.

### Frente F: jornada Kids

- **Barra:** Explorar e Álbum, mais o botão "Para adultos".
- **Explorar:**
  - balão do Pipo;
  - busca;
  - "Escolha um mundo", com os 6 mundos numa grade 3×2;
  - "Ave do dia";
  - cards.

  Só aparecem aves com conteúdo Kids (`audience=kids`).
- **Tela de mundo:** as aves cujo `primary_biome` é aquele mundo.
- **Detalhe:**
  - foto em forma de "cookie";
  - selo do mundo (`primary_biome`);
  - status de conservação em linguagem simples;
  - "Ouvir o canto!", com a forma de onda;
  - fatos comparados com a criança;
  - "Você sabia?";
  - "Guardar no meu álbum";
  - galeria que abre o visualizador;
  - mapa com a atribuição em texto, sem link e sem o botão do MapLibre: "© OpenFreeMap © OpenMapTiles · dados © contribuidores do OpenStreetMap", o mesmo texto do adulto.

  A reprodução automática do canto fica desligada.
- **Regras fixas do app, sem IA e sem mudar o contrato:**
  - **comparação de tamanho:** sai do `size_cm` por faixas, como "cabe na sua mão" ou "quase do seu tamanho". As faixas são definidas na spec;
  - **status de conservação em linguagem simples:** um texto por código IUCN, como VU → "Precisa da nossa ajuda para não sumir". O mapa cobre todos os códigos: os casos de EW e EX têm texto pensado para criança, e `UNSPECIFIED` não mostra selo, como na corruíra.
- **Álbum:** os favoritos com `audience = KIDS` viram figurinhas na cor do mundo:
  - progresso por mundo ("4 de 9"), com as contagens de `primary_biome_counts` (`/v1/filters?audience=kids`);
  - a última contagem recebida fica guardada, para o álbum funcionar offline;
  - espaços "?" para as que faltam, anunciados como "figurinha que falta";
  - ao guardar, uma animação curta de "Nova figurinha!", sem sequência diária e sem pressa, que obedece a "reduzir animações".
- **Área "Para adultos", depois da trava:**
  - trocar para o Passarim;
  - limpar o cache;
  - Sobre;
  - Licenças.
- **Estados de carregando, erro e vazio:** com o Pipo e frases amigáveis. Quando o Pipo é só decoração, o leitor de tela não o anuncia.
- **Room (v1 → v2):**
  - a tabela `favorites` ganha `audience` (padrão `ADULT`) e `primaryBiome`;
  - a chave passa a ser (id da ave, audience). O SQLite não troca a chave primária de uma tabela, então a migração é **manual**: cria `favorites_new`, copia os dados com `audience = 'ADULT'` e renomeia;
  - o schema `2.json` é exportado;
  - as consultas do DAO passam a receber `audience`;
  - o teste de migração cobre a passagem, e os favoritos de hoje ficam no adulto.
- **Offline:** sem rede, Favoritos e Álbum abrem e mostram o que foi salvo, com as miniaturas do cache de imagens e o progresso pela última contagem guardada. Explorar, Detalhe e "Ave do dia" mostram o estado de erro (no Kids, com o Pipo). Limpar o cache apaga as miniaturas, não os favoritos.
- **Desenho primeiro:** a tela de mundo, a área "Para adultos" e os estados do Kids são desenhados no canvas.
- **Pronto quando:**
  1. a jornada funciona offline, na definição acima;
  2. nenhuma tela Kids abre link externo, coberto por teste;
  3. os alvos de toque têm pelo menos 56 dp;
  4. os snapshots estão em claro e com fonte 1.0×, 1.3× e 2.0×.

### Frente H: fechamento (antiga 5e)

- **O que vem da 5e:** **todos** os critérios de pronto de `2026-10-08-passarim-app-fechamento-design.md`, com a matriz de snapshots, a paridade e a acessibilidade estendidas às duas jornadas. Entre eles:
  - R8;
  - o roteiro de resiliência;
  - os testes de Compose UI;
  - o README com o diagrama;
  - a CI final (macOS, osv-scanner, gitleaks e Dependabot);
  - o APK como artefato;
  - os ícones.
- **Verificação iOS:** o dono aceita a licença do Xcode 26 (`sudo xcodebuild -license accept`) e o seleciona com `xcode-select` ou `DEVELOPER_DIR`. Hoje o `xcode-select` aponta para o 16.2.
- **Lojas:**
  - **Play:**
    - público-alvo (seção 4), com a conferência dos links externos da jornada adulta na política Families;
    - formulário de segurança de dados, que cita os terceiros que recebem o IP;
    - categoria.
  - **App Store:** classificação 4+, categoria fora do Kids e "privacy nutrition label".
  - **Nas duas:** capturas das duas jornadas.
- **Política de privacidade:** `docs/privacidade.md` ganha:
  - uma seção sobre o Kids (nenhuma coleta, nenhum link externo, trava para adultos);
  - o ECA Digital;
  - a CDN de mídia ao lado do OpenFreeMap.
- **Pendência:** resolver o ponto aberto do ECA Digital (seção 11) antes de publicar.

## 7. Dados e contratos, em resumo

| Onde | O que muda |
|---|---|
| YAML do catalog | `primary_biome`, bloco `kids:` (com `generated_by` e `source_hash`) e `photos.primary` / `photos.exclude` |
| Seed do catalog | O loader aceita `photos:`, `kids:` e `primary_biome` antes de qualquer YAML usá-los; o override vai para a tabela `photo_override` |
| Banco do catalog | `media` ganha `source_photo_id`, `category`, `score` e `model_version`; o áudio ganha `peaks`; as espécies ganham `primary_biome` e o conteúdo Kids; tabelas novas `photo_override` e `curation_report` |
| Reingestão | Comando do worker que reenfileira todas as espécies (fotos na frente A, cantos na B) |
| `passarim-proto` | Serviço do curador (arquivo novo, enum `PhotoCategory`) e geração de Python; no `catalog.proto`: `Species.kids` (16), `Species.primary_biome` (17), `SpeciesSummary.primary_biome` (6), `kids_only` nos pedidos de lista (6) e de filtros (1), `ListFiltersResponse.primary_biome_counts` (3), `Audio.peaks` (4) e `GetFeaturedSpecies` |
| BFF (REST) | `kids`, `primaryBiome` e `audio.peaks` no detalhe; `?audience=kids` na lista e nos filtros; `GET /v1/featured`; cache `bff:v2:`, com a audiência e a data nas chaves |
| App (Room) | `audience` e `primaryBiome` na tabela de favoritos (v1 → v2, migração manual) |
| App (DataStore) | `Settings.journey` e a última contagem do álbum por mundo |

## 8. Testes

- **Curador:**
  - pytest com um **conjunto de referência rotulado à mão**, de umas 60 fotos, que inclui o ninho com ovos do anu-preto, o bando de andorinhas, penas e fotos sem ave;
  - o conjunto guarda só os ids do iNaturalist, todos com licença CC, e um `ATTRIBUTION.md`; as fotos são baixadas e ficam em cache na CI;
  - a CI mede a taxa de acerto e reprova abaixo do limite, definido na spec;
  - o teste de conversa com o Python gerado do `passarim-proto` roda na CI do curador;
  - os pesos ficam em cache na CI.
- **Catalog:**
  - a regra de decisão com um curador falso: descarte, bando só na galeria, espécie sem `SINGLE_BIRD`, override do YAML e curador fora do ar devolvendo erro;
  - o loader com as chaves novas;
  - o lint do conteúdo Kids (origem, hash, tamanho e números, inclusive por extenso);
  - os picos do canto, com golden file;
  - a escolha da "Ave do dia": determinística, estável no dia e `NOT_FOUND` sem elegíveis.
- **kidsgen:** a CI nunca chama a API do Claude. O montador do prompt, o validador da saída e a troca só do bloco `kids:` no arquivo são testados com golden files.
- **Proto:** `buf lint`, `buf breaking` e o teste de contrato atual.
- **BFF:**
  - `/v1/featured` determinístico, com a virada à meia-noite de São Paulo e sem resposta velha depois dela;
  - `audience=kids` nas chaves de cache;
  - o prefixo `bff:v2:`;
  - OpenAPI.
- **App:**
  - ViewModels com o estado Kids;
  - a migração manual do Room de v1 para v2;
  - a trava (acerto, erro e nova conta);
  - a escolha e a persistência da jornada, e o Kids sem alterar as preferências do adulto;
  - o Kids escondido contra um BFF sem o campo `kids`;
  - o visualizador (índice inicial, contagem e abertura offline);
  - nenhum link externo nas telas Kids;
  - o mapa de status em linguagem simples cobrindo todos os códigos;
  - Paparazzi do PiuDS e das telas: Piu em claro e escuro, Piu Kids só em claro, com fonte 1.0×, 1.3× e 2.0×.
- **Comentários:** toda frente confere no diff que o código novo ou alterado tem comentário didático.

## 9. Critérios de pronto da guinada

1. A primeira abertura mostra a escolha de jornada. As seguintes abrem na última, e sair do Kids exige a trava.
2. Nas 41 espécies, a foto principal é uma ave sozinha, pelo modelo ou pelo override do YAML, sem ninho, ovo, pena, ave morta ou bando.
3. As 41 espécies têm `primary_biome` e conteúdo Kids revisado.
4. Tocar em qualquer foto abre o visualizador, com deslize e zoom.
5. As duas jornadas funcionam offline na definição da frente F, no Android e no iOS.
6. Nenhuma tela Kids abre link externo.
7. Todo o código do Passarim está comentado de forma didática.
8. Todos os testes e snapshots passam na CI dos repositórios.
9. Os materiais das lojas e a política de privacidade estão prontos (frente H).

## 10. Riscos

| Risco | Mitigação |
|---|---|
| Os modelos abertos erram em fotos difíceis (aves pequenas, contraluz, ninho com o filhote dentro) | Conjunto de referência na CI, relatório de baixa confiança e override no YAML como palavra final |
| Uma espécie fica sem nenhuma foto de ave sozinha nas candidatas (por exemplo, a ararinha-azul) | O `photos.primary` aponta para qualquer foto do iNaturalist pelo id |
| A imagem do curador fica pesada (PyTorch e pesos) | Só CPU, só na ingestão, fora do caminho do usuário; a imagem roda só no worker |
| A política Families do Play vale para o app inteiro, e a jornada adulta tem links externos | Conferência na frente H; as saídas são a trava também nos links do adulto ou uma tela de idade neutra |
| O Haze 2.0 está em beta | Isolado num componente do PiuDS; se quebrar, a troca é por fundo translúcido sem desfoque, sem mexer nas telas |
| O `telephoto` não funciona no iOS | Teste rápido no começo da frente G, com zoom próprio como alternativa |
| A IA inventa fatos ou traz temas pesados para o texto Kids | Só o texto adulto como entrada, lint de origem, hash e números, lista de temas a suavizar e revisão humana no PR |
| A trava é fácil para uma criança de 12 anos | Multiplicação por extenso; a spec registra que ela desencoraja, sem impedir |
| Um app novo fala com um BFF antigo | O app só mostra o Kids se as respostas trouxerem `kids`; deploy na ordem catalog, BFF e app |
| Regras das lojas ou decretos do ECA Digital mudam | Conferência de novo na frente H, antes de publicar |
| O Xcode 26 continua sem a licença aceita | Os testes iOS que dependem do Xcode 26 ficam pendentes até o dono aceitar a licença e selecioná-lo |

## 11. Pontos abertos

1. **ECA Digital:** conferir no texto da Lei 15.211/2025 e nos decretos o que cabe ao app, por exemplo consumir o "sinal de idade" das lojas, e se a trava e a ausência de coleta bastam. Resolver na frente H.
2. **Política Families e a jornada adulta:** conferir se os links externos do adulto são aceitos (seção 4). Resolver na frente H.
3. **Os limites numéricos:** a taxa mínima de acerto do curador, o tamanho máximo das frases Kids, a lista de temas sensíveis e as faixas da comparação de tamanho são definidos nas specs das frentes A, B e F.

## 12. Decisões do redator [DR]

1. **Faixas no Google Play:** 6–8 e 9–12, mais as faixas a partir de 13, porque os 8 anos caem na faixa 6–8.
2. **"Ave do dia" no catalog:** a escolha fica num RPC do catalog (`GetFeaturedSpecies`), não no BFF, porque só o catalog conhece a categoria das fotos. A ordem dos elegíveis é alfabética, e mudanças no conjunto só valem no dia seguinte. O BFF expõe e guarda em cache.
3. **Quantidade de candidatas:** até 3 fotos por observação e cerca de 40 por espécie. O ajuste fino fica para a spec da frente A.
4. **Ordem das letras:** as frentes mantêm as letras com que foram pensadas (G antes de E na execução), para não renomear o que já foi discutido.
5. **Trava para adultos:** uma multiplicação por extenso, e não a soma de dois números, porque somar é matéria escolar dos 7 aos 8 anos e não seguraria crianças de 9 a 12.

## 13. Fontes

- Referência visual: `docs/design/direcoes-2026/README.md` e o canvas <https://claude.ai/artifact/DthZynrHzz3Z9xwXTYreBk>
- [Política Families do Google Play](https://support.google.com/googleplay/android-developer/answer/9893335)
- [Público-alvo e conteúdo no Google Play](https://support.google.com/googleplay/android-developer/answer/9867159)
- [Diretriz 1.3 da App Store, com resumo e casos de recusa](https://www.goodbarber.com/help/apple-rejection-r100/apple-rejection-apps-for-kids-a365/)
- [Fórum da Apple sobre recusas na categoria Kids](https://developer.apple.com/forums/thread/813791)
- [ECA Digital em vigor (Olhar Digital, 17/03/2026)](https://olhardigital.com.br/2026/03/17/internet-e-redes-sociais/eca-digital-entra-em-vigor-nesta-terca-saiba-o-que-muda-na-internet-brasileira/)
- [Factsheet ECA Digital (Machado Meyer)](https://www.machadomeyer.com.br/images/ebooks/Factsheet_ECA_Digital.pdf)
- [O que é fato e o que é falso sobre o ECA Digital (Aos Fatos)](https://www.aosfatos.org/noticias/fato-falso-novas-regras-eca-digital/)
