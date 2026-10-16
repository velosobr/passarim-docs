# Passarim — Guinada: PRD do Passarim e do Passarim Kids

Data: 2026-10-16 · Substitui: a etapa 5e (`2026-10-08-passarim-app-fechamento-design.md`), que vira a frente H · Referência visual: `docs/design/direcoes-2026/` · Depende de: 5a–5d

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

O Passarim não coleta dados, não tem anúncios e não usa análise de uso (`docs/privacidade.md`). Isso resolve a maior parte das exigências.

- **Google Play (política Families):**
  - Um app cujo público inclui crianças precisa de conteúdo adequado, e anúncio, quando houver, só pode vir de SDK certificado.
  - **Declaração:** público-alvo com as faixas **6–8, 9–12** e as faixas a partir de 13 (os 8 anos caem na faixa 6–8) **[DR]**.
  - O formulário de segurança de dados declara que o app não coleta nada.
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
                                                   │ gRPC (na ingestão)
                                                   ▼
                                          passarim-photo-curator (Python, novo)
```

- **O curador só é chamado pelo worker, durante a ingestão.** A API do catalog, o BFF e o app não sabem que ele existe. O Passarim no ar não depende dele.
- **Contratos:** o `passarim-proto` ganha o serviço do curador e a geração de código Python no `buf.gen.yaml`. O `catalog.proto` ganha só campos e métodos novos, então o `buf breaking` continua passando.
- **Compose local:** o `passarim-docs/docker-compose.yml` ganha o serviço `photo-curator` (`build: ../passarim-photo-curator`), no mesmo padrão dos outros.

| Frente | Repositórios |
|---|---|
| 0. Comentários didáticos | `passarim-app`, `passarim-bff`, `passarim-catalog` |
| A. Curadoria de fotos | `passarim-photo-curator` (novo), `passarim-catalog`, `passarim-proto`, `passarim-docs` (compose) |
| B. Conteúdo Kids, "Ave do dia" e forma de onda | `passarim-catalog`, `passarim-proto`, `passarim-bff` |
| C. PiuDS | `passarim-docs` (tokens e regras), `passarim-app` |
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
- **Escopo:** hoje só uma parte dos arquivos tem algum comentário (contagem de 2026-10-16):
  - no BFF, 16 de 68 arquivos Go;
  - no catalog, 21 de 70 arquivos Go;
  - no app, 42 de 129 arquivos Kotlin.

  O código gerado (`gen/`, `build/`) fica de fora.
- **Regra da frente:** **só comentários.** Nenhuma linha de código muda. A revisão confere isso com `git diff --ignore-blank-lines` filtrado por linhas que não são comentário, que tem de voltar vazio.
- **Entrega:** um PR por repositório. O PR #9 (5d) é mergeado antes, e os comentários dele entram no PR do app.
- **Detekt:** a regra `ForbiddenComment` do app passa a aceitar `TODO`, se a frente precisar.

### Frente A: curadoria de fotos

**Coleta (worker do catalog):**

- Buscar mais candidatas: até **3 fotos por observação** e cerca de **40 por espécie** **[DR]**.
- Usar as anotações do iNaturalist ("evidência de presença" e "estágio de vida") para descartar já na busca as observações marcadas como ninho, ovo, pena ou carcaça.
- Guardar o id da foto no iNaturalist, para o override e para a auditoria.

**Curador (`passarim-photo-curator`):**

- **Linguagem e contrato:** Python, servidor gRPC com o método `ClassifyPhotos`, que recebe um lote de fotos.
- **Resposta, para cada foto:**
  - **categoria:** `AVE_UNICA`, `BANDO`, `NINHO`, `OVOS`, `PENA`, `AVE_MORTA`, `SEM_AVE` ou `OUTRO`;
  - número de aves detectadas;
  - fração da foto ocupada pela maior ave;
  - indicação de que a ave está cortada na borda;
  - nitidez;
  - confiança;
  - versão do modelo.
- **Modelos:** um detector de aves e um CLIP para a classificação sem treino, com descrições como "a nest with eggs" e "a flock of birds".
- **Licenças:** só licenças permissivas, por exemplo OpenCLIP (MIT) e RT-DETR ou torchvision (Apache 2.0 ou BSD). **Ultralytics/YOLO fica de fora, porque é AGPL.** A escolha final sai do teste com o conjunto de referência, na spec da frente.
- **Execução:** só na CPU, com os pesos dentro da imagem Docker e nenhuma chamada externa em tempo de execução.

**Decisão (worker):**

- **Descarte:** `NINHO`, `OVOS`, `PENA`, `AVE_MORTA` e `SEM_AVE` saem de vez.
- **Bando:** `BANDO` entra só na galeria.
- **Foto principal:** a `AVE_UNICA` com a maior pontuação. A pontuação combina:
  - ave grande no quadro e sem corte;
  - nitidez;
  - votos no iNaturalist.
- **Galeria:** até 6 fotos.
- **Override no YAML:** `photos.primary` e `photos.exclude`, pelo id da foto no iNaturalist, mandam sobre o modelo.
- **Relatório de curadoria:** a ingestão gera um relatório com as escolhas e os casos de baixa confiança, para revisão humana.
- **Sem foto principal:** se nenhuma `AVE_UNICA` sobrar, a espécie fica sem foto principal e entra no relatório. O app já mostra o placeholder nesse caso.

**Falhas:**

- Com o curador fora do ar, o worker **mantém as fotos atuais**, não troca nada, registra o erro e tenta de novo na próxima ingestão.
- Cada foto guarda a categoria, a pontuação e a versão do modelo, para refazer a curadoria e auditar.

**Pronto quando:**

1. Nas 41 espécies, a foto principal é uma ave sozinha, conferida à mão no relatório.
2. O anu-preto e a andorinha estão corrigidos.
3. O curador acerta acima do limite no conjunto de referência, medido na CI.

### Frente B: conteúdo Kids, "Ave do dia" e forma de onda

**YAML (`content/species/*.yaml`):** um bloco novo, `kids:`, com:

- `description`: frases curtas;
- `facts`: cada fato com `source_fact`, que aponta para o fato adulto de origem;
- `did_you_know`: um fato curto para o balão "Você sabia?".

**`cmd/kidsgen` (script com a API do Claude):**

- **Entrada:** só o texto adulto curado (descrição e fatos).
- **Saída:** o bloco `kids:` no YAML.
- **Rodada:** à mão, por quem cuida do conteúdo. O resultado é revisado no PR. O modelo padrão é o mais capaz disponível na rodada.
- **Validações do lint do conteúdo:**
  - todo fato Kids aponta para um fato adulto que existe;
  - toda frase respeita o limite de tamanho, definido na spec;
  - nenhum número aparece no texto Kids sem aparecer no texto adulto.

**Regras fixas no app, sem IA e sem mudar o contrato:**

- **Comparação de tamanho:** sai do `size_cm` por faixas, como "cabe na sua mão" ou "quase do seu tamanho". As faixas são definidas na spec da frente F.
- **Status de conservação em linguagem simples:** um texto por código IUCN, como VU → "Precisa da nossa ajuda para não sumir".

**Forma de onda:** o worker calcula 64 picos do canto com o ffmpeg, já presente na imagem (ADR-0014), e os guarda com o áudio.

**Proto (`catalog.proto`, só campos novos):**

- `Species.kids` (16): mensagem `KidsContent { description, repeated Fact facts, did_you_know }`.
- `SpeciesSummary.primary_biome` (6): usado pela cor do mosaico e das figurinhas.
- `ListSpeciesRequest.kids_only` (6) e `ListFiltersRequest.kids_only` (1): só aves com conteúdo Kids revisado.
- `Audio.peaks` (4): `repeated float`, com valores de 0 a 1.
- **RPC novo, `GetFeaturedSpecies(date)`:**
  - escolhe a ave por um hash da data sobre os ids das aves elegíveis (foto principal `AVE_UNICA` e conteúdo Kids);
  - fica no catalog porque é ele quem conhece a categoria das fotos **[DR]**;
  - devolve a **mesma ave para as duas jornadas**.

**BFF:**

- `GET /v1/species/{id}`: ganha o objeto `kids` e `audio.peaks`.
- `GET /v1/species` e `GET /v1/filters`: aceitam `?audience=kids`.
- **`GET /v1/featured`, endpoint novo:**
  - a data é calculada no fuso de São Paulo;
  - o cache no Redis vale até a meia-noite;
  - o OpenAPI é atualizado.

**Pronto quando:**

1. As 41 espécies têm o bloco `kids:` revisado.
2. O lint do conteúdo passa.
3. `/v1/featured` devolve a mesma ave o dia todo e troca à meia-noite de São Paulo.
4. Toda ave com canto tem `peaks`.

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
- **Componentes:**
  - **comuns:** a forma "cookie" (`graphics-shapes`), o desfoque (Haze) e o crédito com modo sem link;
  - **em `components/adult`:** card de mosaico, "Ave do dia", chip de bioma e barra flutuante;
  - **em `components/kids`:** botão com sombra que afunda, cartão de mundo, figurinha, balão do Pipo e barra Kids.
- **Pronto quando:**
  1. o app atual roda sobre o PiuDS (variante Piu) sem mudança visual além da troca de nome;
  2. os componentes novos têm snapshots;
  3. o contraste passa.

### Frente D: escolha de jornada e trava para adultos

- **Domínio:** `Journey { ADULT, KIDS }` em `core:domain`. A jornada é guardada no DataStore das configurações, com `journeyFlow` e `saveJourney`. Jornada nula quer dizer primeira abertura.
- **Navegação:**
  - a raiz vai do Splash para a Escolha, só na primeira vez, e depois para as abas do adulto ou do Kids;
  - os dois grafos são separados;
  - trocar de jornada limpa a pilha;
  - as rotas só ligam as peças, e os efeitos ficam nas telas.
- **Módulo novo `feature:journey:presentation`:**
  - **tela de escolha:** dois cartões grandes, cada um com uma prévia do próprio visual;
  - **trava para adultos:** uma soma de dois números de dois algarismos sorteados, com a resposta digitada num teclado numérico. Errou, sorteia outra conta.
- **Trocas de jornada:**
  - **do adulto para o Kids:** o item "Passarim Kids" nas Configurações;
  - **do Kids para o adulto:** o botão "Para adultos", depois da trava.
- **Desenho primeiro:** a escolha e a trava são desenhadas no canvas antes do código.
- **Pronto quando:**
  1. a primeira abertura mostra a escolha;
  2. as aberturas seguintes vão direto à última jornada;
  3. sair do Kids exige acertar a conta.

### Frente G: visualizador de fotos

- **Módulo novo:** `feature:viewer:presentation`, comum às duas jornadas. A rota recebe o id da ave e o índice da foto.
- **Abertura:** a partir da foto tocada, na galeria ou no topo do Detalhe.
- **Exibição:**
  - `HorizontalPager` entre as fotos, com o indicador "2 de 5";
  - a foto inteira, sem corte (`ContentScale.Fit`), sobre fundo escuro, no tamanho `large`;
  - o crédito sempre visível.
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
  - card "Ave do dia" (`/v1/featured`), com botão de canto;
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
- **Tela de mundo:** as aves de um bioma.
- **Detalhe:**
  - foto em forma de "cookie";
  - selo do mundo;
  - status de conservação em linguagem simples;
  - "Ouvir o canto!", com a forma de onda;
  - fatos comparados com a criança;
  - "Você sabia?";
  - "Guardar no meu álbum";
  - galeria que abre o visualizador;
  - mapa com a atribuição em texto ("© OpenStreetMap"), sem o botão do MapLibre.

  A reprodução automática do canto fica desligada.
- **Álbum:** os favoritos com `audience = KIDS` viram figurinhas:
  - progresso por mundo ("4 de 9", com as contagens de `/v1/filters?audience=kids`);
  - espaços "?" para as que faltam;
  - ao guardar, uma animação curta de "Nova figurinha!", sem sequência diária e sem pressa.
- **Área "Para adultos", depois da trava:**
  - trocar para o Passarim;
  - limpar o cache;
  - Sobre;
  - Licenças.
- **Estados de carregando, erro e vazio:** com o Pipo e frases amigáveis.
- **O Pipo:** desenho original, convertido de SVG para `ImageVector`.
- **Room:** a tabela de favoritos ganha a coluna `audience`, com padrão `ADULT`. A chave passa a ser (id da ave, audience). A migração de v1 para v2 é coberta pelo teste de migração, e os favoritos de hoje ficam no adulto.
- **Desenho primeiro:** a tela de mundo, a área "Para adultos" e os estados do Kids são desenhados no canvas.
- **Pronto quando:**
  1. a jornada funciona offline com o álbum;
  2. nenhuma tela Kids abre link externo, coberto por teste;
  3. os alvos de toque têm pelo menos 56 dp;
  4. os snapshots estão em claro e com fonte 1.0×, 1.3× e 2.0×.

### Frente H: fechamento (antiga 5e)

- **O que vem da 5e:**
  - R8;
  - revisão de acessibilidade das duas jornadas;
  - verificação completa no iOS, que depende de o dono aceitar a licença do Xcode 26 (`sudo xcodebuild -license accept`);
  - ícones.
- **Lojas:**
  - **Play:** público-alvo (seção 4), formulário de segurança de dados e categoria.
  - **App Store:** classificação 4+, categoria fora do Kids e "privacy nutrition label" sem coleta.
  - **Nas duas:** capturas das duas jornadas.
- **Política de privacidade:** `docs/privacidade.md` ganha uma seção sobre o Kids (nenhuma coleta, nenhum link externo, trava para adultos) e sobre o ECA Digital.
- **Pendência:** resolver o ponto aberto do ECA Digital (seção 11) antes de publicar.

## 7. Dados e contratos, em resumo

| Onde | O que muda |
|---|---|
| YAML do catalog | Blocos `kids:` e `photos.primary` / `photos.exclude` |
| Banco do catalog | Fotos ganham o id no iNaturalist, a categoria, a pontuação e a versão do modelo; o áudio ganha `peaks`; as espécies ganham o conteúdo Kids |
| `passarim-proto` | Serviço do curador (novo arquivo); no `catalog.proto`: `Species.kids`, `SpeciesSummary.primary_biome`, `kids_only` nos pedidos de lista e de filtros, `Audio.peaks` e `GetFeaturedSpecies` |
| BFF (REST) | `kids` e `audio.peaks` no detalhe; `?audience=kids` na lista e nos filtros; `GET /v1/featured` |
| App (Room) | `audience` na tabela de favoritos (v1 → v2) |
| App (DataStore) | A jornada escolhida |

## 8. Testes

- **Curador:**
  - pytest com um **conjunto de referência rotulado à mão**, de umas 60 fotos, que inclui o ninho com ovos do anu-preto, o bando de andorinhas, penas e fotos sem ave;
  - a CI mede a taxa de acerto e reprova abaixo do limite, definido na spec;
  - os pesos ficam em cache na CI.
- **Catalog:**
  - a regra de decisão com um curador falso: descarte, bando só na galeria, override do YAML e curador fora do ar;
  - o lint do conteúdo Kids;
  - os picos do canto, com golden file;
  - a escolha da "Ave do dia".
- **kidsgen:** a CI nunca chama a API do Claude. O montador do prompt e o validador da saída são testados com golden files.
- **Proto:**
  - `buf breaking`;
  - o teste de contrato atual;
  - um teste de que o Python gerado conversa com o servidor do curador.
- **BFF:**
  - `/v1/featured` determinístico, com a virada à meia-noite de São Paulo;
  - `audience=kids`;
  - cache;
  - OpenAPI.
- **App:**
  - ViewModels com o estado Kids;
  - a migração do Room de v1 para v2;
  - a trava (acerto, erro e nova conta);
  - a escolha e a persistência da jornada;
  - o visualizador (índice inicial e contagem);
  - nenhum link externo nas telas Kids;
  - Paparazzi do PiuDS e das telas: Piu em claro e escuro, Piu Kids só em claro, com fonte 1.0×, 1.3× e 2.0×.
- **Comentários:** toda frente confere no diff que o código novo ou alterado tem comentário didático.

## 9. Critérios de pronto da guinada

1. A primeira abertura mostra a escolha de jornada. As seguintes abrem na última, e sair do Kids exige a trava.
2. Nas 41 espécies, a foto principal é uma ave sozinha, sem ninho, ovo, pena, ave morta ou bando.
3. As 41 espécies têm conteúdo Kids revisado.
4. Tocar em qualquer foto abre o visualizador, com deslize e zoom.
5. As duas jornadas funcionam offline com favoritos e álbum, no Android e no iOS.
6. Nenhuma tela Kids abre link externo.
7. Todo o código do Passarim está comentado de forma didática.
8. Todos os testes e snapshots passam na CI dos repositórios.
9. Os materiais das lojas e a política de privacidade estão prontos (frente H).

## 10. Riscos

| Risco | Mitigação |
|---|---|
| Os modelos abertos erram em fotos difíceis (aves pequenas, contraluz, ninho com o filhote dentro) | Conjunto de referência na CI, relatório de baixa confiança e override no YAML como palavra final |
| A imagem do curador fica pesada (PyTorch e pesos) | Só CPU, só na ingestão, fora do caminho do usuário; a imagem roda só no worker |
| O Haze 2.0 está em beta | Isolado num componente do PiuDS; se quebrar, a troca é por fundo translúcido sem desfoque, sem mexer nas telas |
| O `telephoto` não funciona no iOS | Teste rápido no começo da frente G, com zoom próprio como alternativa |
| A IA inventa fatos no texto Kids | Só o texto adulto como entrada, lint com origem e números, e revisão humana no PR |
| Regras das lojas ou decretos do ECA Digital mudam | Conferência de novo na frente H, antes de publicar |
| O Xcode 26 continua sem a licença aceita | Os testes iOS que dependem do Xcode 26 ficam pendentes até o dono aceitar a licença |

## 11. Pontos abertos

1. **ECA Digital:** conferir no texto da Lei 15.211/2025 e nos decretos o que cabe ao app, por exemplo consumir o "sinal de idade" das lojas, e se a trava e a ausência de coleta bastam. Resolver na frente H.
2. **Os limites numéricos:** a taxa mínima de acerto do curador, o tamanho máximo das frases Kids e as faixas da comparação de tamanho são definidos nas specs das frentes A, B e F.

## 12. Decisões do redator [DR]

1. **Faixas no Google Play:** 6–8 e 9–12, mais as faixas a partir de 13, porque os 8 anos caem na faixa 6–8.
2. **"Ave do dia" no catalog:** a escolha fica num RPC do catalog (`GetFeaturedSpecies`), não no BFF, porque só o catalog conhece a categoria das fotos. O BFF expõe e guarda em cache.
3. **Quantidade de candidatas:** até 3 fotos por observação e cerca de 40 por espécie. O ajuste fino fica para a spec da frente A.
4. **Ordem das letras:** as frentes mantêm as letras com que foram pensadas (G antes de E na execução), para não renomear o que já foi discutido.

## 13. Fontes

- Referência visual: `docs/design/direcoes-2026/README.md` e o canvas <https://claude.ai/artifact/DthZynrHzz3Z9xwXTYreBk>
- [Política Families do Google Play](https://support.google.com/googleplay/android-developer/answer/9893335)
- [Público-alvo e conteúdo no Google Play](https://support.google.com/googleplay/android-developer/answer/9867159)
- [Diretriz 1.3 da App Store, com resumo e casos de recusa](https://www.goodbarber.com/help/apple-rejection-r100/apple-rejection-apps-for-kids-a365/)
- [Fórum da Apple sobre recusas na categoria Kids](https://developer.apple.com/forums/thread/813791)
- [ECA Digital em vigor (Olhar Digital, 17/03/2026)](https://olhardigital.com.br/2026/03/17/internet-e-redes-sociais/eca-digital-entra-em-vigor-nesta-terca-saiba-o-que-muda-na-internet-brasileira/)
- [Factsheet ECA Digital (Machado Meyer)](https://www.machadomeyer.com.br/images/ebooks/Factsheet_ECA_Digital.pdf)
- [O que é fato e o que é falso sobre o ECA Digital (Aos Fatos)](https://www.aosfatos.org/noticias/fato-falso-novas-regras-eca-digital/)
