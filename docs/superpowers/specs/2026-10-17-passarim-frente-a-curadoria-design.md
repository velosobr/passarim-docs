# Passarim — Frente A: curadoria de fotos

Data: 2026-10-17 · Origem: PRD da guinada (`2026-10-16-passarim-guinada-prd.md`), seção 6, frente A · Regra de comentários: `~/dev/passarim/CLAUDE.md` (todo código novo com comentários didáticos)

Decisões do redator estão marcadas com **[DR]** e listadas no fim. Onde esta spec corrige o PRD, a seção 10 diz o quê e por quê.

## 1. Objetivo

A foto principal de cada espécie mostra **uma ave sozinha**, nunca bando, ninho, ovos, pena, ave morta, ave na mão, ilustração ou foto sem ave. Os casos que motivaram a frente:
- a andorinha-pequena-de-casa, cuja foto principal é um bando no fio;
- o anu-preto, cuja foto principal é um ninho com ovos.

Um serviço novo em Python, o `passarim-photo-curator`, classifica as fotos. **Só o worker do catalog fala com ele, durante a ingestão.** A API do catalog, o BFF e o app não sabem que ele existe, e o Passarim no ar não depende dele.

### Pronto quando

1. Nas 41 espécies, a foto principal é uma ave sozinha, escolhida pelo modelo ou pelo override do YAML, conferida à mão no relatório de curadoria. **Este é o critério final.**
2. A andorinha-pequena-de-casa e o anu-preto estão corrigidos.
3. Na metade de medição do conjunto de referência (seção 4.5), a CI do curador mede três metas:
   - **precisão de `SINGLE_BIRD` ≥ 95%:** das fotos que o curador chama de ave sozinha, no máximo 1 em 20 está errada;
   - **revocação de `SINGLE_BIRD` ≥ 70%:** das fotos que são de fato uma ave sozinha, pelo menos 7 em 10 são reconhecidas. Sem essa meta, um curador que descarta tudo passaria nas outras duas;
   - **revocação dos descartes ≥ 90%:** nas fotos rotuladas `NEST`, `EGGS`, `FEATHER`, `DEAD_BIRD`, `NO_BIRD` ou `OTHER`, contadas juntas, pelo menos 9 em 10 são pegas. Conta como pega a predição que **não é** `SINGLE_BIRD` nem `FLOCK`, porque qualquer outra categoria já tira a foto da escolha.

   As metas são **indicativas**. Com cerca de 90 fotos na metade de medição, uma foto a mais ou a menos muda o resultado em 1 a 3 pontos. Por isso a CI também publica o intervalo de confiança de 95% (Wilson) de cada meta, a acurácia geral e a matriz de confusão.

## 2. Decisões do dono

| Tema | Decisão |
|---|---|
| Conjunto de referência | Montado pelo redator, com 150 a 200 fotos das 41 espécies mais casos difíceis buscados de propósito, e revisado pelo dono numa página com as fotos em grade |
| Onde ficam as fotos de referência | No repositório do curador, em `tests/reference/`, reduzidas a 512 px no lado maior, com `manifest.csv` |
| Métrica da CI | Precisão de `SINGLE_BIRD` ≥ 95% e revocação dos descartes ≥ 90%. A revocação de `SINGLE_BIRD` ≥ 70% foi acrescentada pela revisão **[DR]** |
| Abordagem | Detector de aves + CLIP sem treino; uma camada linear treinada sobre o CLIP fica prevista como plano B |

## 3. Contrato (`passarim-proto`)

Arquivo novo, `proto/passarim/curator/v1/curator.proto`, separado do catalog, porque é outro serviço com outro dono:

```proto
service PhotoCuratorService {
  // Classifica um lote de 1 a 8 fotos (bytes WebP da variante medium).
  rpc ClassifyPhotos(ClassifyPhotosRequest) returns (ClassifyPhotosResponse);
}

message ClassifyPhotosRequest {
  repeated PhotoInput photos = 1;
}

message PhotoInput {
  string photo_id = 1;  // id da foto no iNaturalist, ecoado na resposta
  bytes image = 2;
}

message ClassifyPhotosResponse {
  repeated PhotoVerdict verdicts = 1;  // na mesma ordem do pedido
  string model_version = 2;            // ex.: "rtdetr-r50vd+openclip-b32@1"
}

message PhotoVerdict {
  string photo_id = 1;
  PhotoCategory category = 2;    // UNSPECIFIED quando a imagem não abriu
  int32 bird_count = 3;
  float largest_bird_area = 4;   // fração da foto, de 0 a 1
  bool largest_bird_cut = 5;     // a maior ave encosta na borda
  float sharpness = 6;           // de 0 a 1, normalizada
  float confidence = 7;          // de 0 a 1
}

enum PhotoCategory {
  PHOTO_CATEGORY_UNSPECIFIED = 0;
  PHOTO_CATEGORY_SINGLE_BIRD = 1;
  PHOTO_CATEGORY_FLOCK = 2;
  PHOTO_CATEGORY_NEST = 3;
  PHOTO_CATEGORY_EGGS = 4;
  PHOTO_CATEGORY_FEATHER = 5;
  PHOTO_CATEGORY_DEAD_BIRD = 6;
  PHOTO_CATEGORY_NO_BIRD = 7;
  PHOTO_CATEGORY_OTHER = 8;
}
```

**Tamanho do lote:** até 8 fotos. A variante `medium` tem 800 px e no máximo algumas centenas de KB, então 8 fotos ficam bem abaixo do limite padrão de 4 MB de uma mensagem gRPC.

**Erros:**
- **Uma imagem que não abre não derruba o lote:** ela volta com `PHOTO_CATEGORY_UNSPECIFIED`, e o worker a trata como descarte. Um erro assim é determinístico; se derrubasse o lote, o job falharia em todas as tentativas e a espécie nunca seria atualizada.
- **Lote vazio ou com mais de 8 fotos:** `INVALID_ARGUMENT`. Esse caso é bug do worker.
- **Curador fora do ar ou subindo:** `UNAVAILABLE`.
- **Prazo:** o worker põe um deadline de 30 s em cada chamada; quando ele estoura, a chamada volta com `DEADLINE_EXCEEDED`.

**`model_version` vai uma vez por resposta**, porque um servidor roda um modelo só. O worker copia o valor para cada foto no banco.

**Geração:**
- O `buf.gen.yaml` ganha `buf.build/protocolbuffers/python`, `buf.build/protocolbuffers/pyi` e `buf.build/grpc/python`, com versões fixas, saindo em `gen/python`. Ele **não** usa `clean`, para não apagar o `pyproject.toml`.
- O código gerado não traz `__init__.py`, então `passarim.curator.v1` é um namespace package. O `gen/python/pyproject.toml` usa hatchling com `packages = ["passarim"]`.
- O pacote declara `protobuf >=` e `grpcio >=` as versões dos plugins. O código gerado confere essas versões quando é importado (`ValidateProtobufRuntimeVersion` e `GRPC_GENERATED_VERSION`).
- No curador, a dependência entra por `[tool.uv.sources] passarim-proto = { git = "https://github.com/velosobr/passarim-proto", tag = "v0.3.0", subdirectory = "gen/python" }`.

**Versão:** tag `v0.3.0`. A mudança é só de adição, então o `buf breaking` continua passando. O `buf lint` e o `buf format`, que a CI já roda, também cobrem o arquivo novo.

## 4. O curador (`passarim-photo-curator`)

### 4.1 Projeto

- **Linguagem e dependências:** Python 3.13 e `uv`, com as dependências travadas no `uv.lock`: `grpcio`, `grpcio-health-checking`, `torch` e `torchvision` (versões só de CPU), `transformers`, `open_clip_torch` e `pillow`.
- **Torch só de CPU:** sai do índice do PyTorch para CPU, declarado em `[tool.uv.index]` com `explicit = true`, e o `torch` aponta para ele em `[tool.uv.sources]`.

| Arquivo (`src/photo_curator/`) | Papel |
|---|---|
| `server.py` | Servidor gRPC: confere o lote, abre os WebP, chama os modelos e o `curate` para cada foto. Registra o health check do gRPC, que o compose usa. |
| `detector.py` | Envolve o RT-DETR e devolve as caixas da classe "bird" (`id2label[14]` do COCO) com confiança ≥ 0,5 |
| `zeroshot.py` | Envolve o CLIP: frases por categoria e agregação (seção 4.3) |
| `sharpness.py` | Nitidez da maior ave: variância do Laplaciano no recorte dela, levada para 0–1 em escala logarítmica, entre um mínimo e um máximo fixados no `config.py` |
| `rules.py` | Função pura `curate(detections, clip_scores, sharpness, image_size) -> PhotoVerdict`; não carrega modelo |
| `config.py` | Limites da regra, calibrados no conjunto de referência e fixados aqui |

### 4.2 Modelos e licenças

| Modelo | Uso | Código | Pesos | Revisão fixada |
|---|---|---|---|---|
| RT-DETR R50vd (`PekingU/rtdetr_r50vd`, pelo `transformers`) | Detector, classe "bird" do COCO | Apache 2.0 | Apache 2.0 | `df939e661d8c52e80608d1ec566561aabd25a4e7` |
| OpenCLIP ViT-B/32, pesos `laion2b_s34b_b79k` (`laion/CLIP-ViT-B-32-laion2B-s34B-b79K`) | Classificação sem treino | MIT | MIT | `1a25a446712ba5ee05982a381eed697ef9b435cf` |

- **Nunca o Ultralytics** (YOLO ou o RT-DETR dele), porque é AGPL.
- **Primeira escolha, não definitiva:** o R50vd COCO é o ponto de partida. O PRD previa que a escolha final sairia do teste com o conjunto de referência: se as metas não forem alcançadas, a troca de modelo entra junto com o plano B (seção 7).
- **Aviso do card do LAION:** o card desaconselha qualquer uso implantado ("any deployed use case") sem teste no domínio. Não é uma restrição de licença. O README do curador registra o aviso e explica por que o uso aqui é aceitável: offline, com taxonomia fixa, sem gente nas decisões, testado no conjunto de referência e com revisão humana das 41 espécies.
- O README do curador reproduz esta tabela.
- **Na execução, só CPU**, com os pesos dentro da imagem Docker e nenhuma chamada externa.

### 4.3 CLIP e regra

**Frases do CLIP (`zeroshot.py`).** Cada classe do CLIP tem algumas frases em inglês. A probabilidade de uma classe é a soma das probabilidades das suas frases, num softmax único sobre todas as frases de todas as classes.

| Classe do CLIP | Exemplos de frase |
|---|---|
| `single` | "a photo of a single bird", "a close-up photo of a bird perched" |
| `flock` | "a photo of a flock of birds", "many birds on a wire" |
| `nest` | "a bird nest", "a nest with chicks" |
| `eggs` | "bird eggs in a nest", "a clutch of eggs" |
| `feather` | "a single feather on the ground" |
| `dead` | "a dead bird", "a bird carcass" |
| `in_hand` | "a bird held in a human hand", "a bird being banded" |
| `drawing` | "a drawing or illustration of a bird", "a photo of a camera screen" |
| `no_bird` | "a photo of a landscape with no animals", "a photo of trees" |

As frases finais saem da calibração e ficam versionadas no `config.py`.

**A regra (`rules.py`), em ordem:**

1. **Descarte por conteúdo:**
   - CLIP com `nest`, `eggs`, `feather` ou `dead` acima do limite da classe: a foto recebe essa categoria;
   - CLIP com `in_hand` ou `drawing` acima do limite: `OTHER`.

   O descarte vem antes porque um ninho com filhote também tem "uma ave" para o detector. Um adulto chocando no ninho também vira `NEST`, e isso está certo: o objetivo é a ave fora do ninho.
2. **Sem ave:**
   - nenhuma ave detectada e CLIP com `no_bird` acima do limite: `NO_BIRD`;
   - nenhuma ave detectada nos outros casos: `OTHER` (ave pequena demais ou escondida);
   - CLIP com `no_bird` acima de um limite alto e a maior ave detectada com confiança abaixo do limite do detector para esse caso: `NO_BIRD` (detecção falsa).
3. **Bando:**
   - duas aves ou mais sem uma dominante: `FLOCK`. Conta como dominante a maior ave que ocupa pelo menos 4 vezes a área da segunda; isso cobre o passarinho desfocado no fundo **[DR]**. Um casal lado a lado também cai aqui: serve para a galeria, não para a foto principal;
   - CLIP com `flock` acima do limite: `FLOCK`, **mesmo com uma ave detectada**. É o caso da andorinha: as aves pequenas do bando ficam abaixo da confiança do detector.
4. **Senão:** `SINGLE_BIRD`.

Em todos os casos o veredito traz:
- a contagem de aves, a área e o corte da maior ave;
- **corte:** a caixa da ave a menos de 2% do lado da imagem de qualquer borda;
- a nitidez;
- a **confiança:** a probabilidade do CLIP para a classe que decidiu. Em `SINGLE_BIRD` e `FLOCK` decididos pelo detector, é o menor valor entre a probabilidade do CLIP para `single` ou `flock` e a confiança do detector na maior ave.

### 4.4 Imagem Docker

- Base `python:3.13-slim`.
- Os pesos são baixados no build, nas revisões fixadas da seção 4.2, com conferência do hash, e ficam em `HF_HOME=/opt/models`, dentro da imagem.
- Na execução: `HF_HUB_OFFLINE=1` e `TRANSFORMERS_OFFLINE=1`, usuário sem privilégios, `read_only: true` com `tmpfs: [/tmp]`, como o worker.
- Um processo com 2 threads de atendimento gRPC: o trabalho é de CPU e o worker manda um lote por vez. As chamadas a mais esperam na fila do gRPC.

### 4.5 Conjunto de referência

**Montagem.** O `scripts/build_reference.py` busca no iNaturalist:
- candidatas das 41 espécies;
- casos difíceis de propósito: observações com anotação de ninho, ovo, pena ou morto, fotos de bando e fotos de ave na mão.

O script:
- reduz as fotos a 512 px;
- aceita só as licenças da política do Passarim;
- escreve o `manifest.csv` com `photo_id, observation_id, species, proposed_label, label, author, license, url`.

**Revisão.**
- Uma página (Artifact com banco compartilhado) mostra as fotos em grade com o `proposed_label`, e o dono corrige com um toque.
- As correções são exportadas do banco da página para `tests/reference/review.json`.
- O `scripts/apply_review.py` lê esse arquivo e preenche a coluna `label`, o rótulo revisado que vale para a métrica.

**Atribuição.**
- O `tests/reference/ATTRIBUTION.md` lista autor, licença e link de cada foto.
- Ele diz que as imagens mantêm a licença CC de cada uma, fora da licença do repositório.

**Divisão em calibração e medição** **[DR]**:
- **Duas metades sorteadas com semente fixa:** os limites do `config.py` (por classe do CLIP, de dominância e de "sem ave") são escolhidos na metade de calibração, e a CI mede na metade de medição.
- **Estratificada pelo rótulo e agrupada por observação:** fotos da mesma observação ficam sempre na mesma metade, para a calibração não vazar para a medição.
- **Tamanho mínimo:** a metade de medição precisa ter pelo menos 50 fotos `SINGLE_BIRD` e 40 de descarte. Se não tiver, o conjunto cresce até ter.
- **A medição não ajusta limites.** Ajustar um limite depois de olhar a medição pede um sorteio novo, com a semente trocada e registrada.

## 5. Mudanças no catalog

### 5.1 Busca de candidatas (cliente do iNaturalist)

**Mais fotos por observação.** `per_page` vai a 20 observações, e o cliente junta **até 3 fotos de cada uma**; hoje pega só a primeira. Depois dos filtros de licença e de anotação, o caso de uso corta em **40 candidatas**.

**Filtro de anotação, no cliente.** A API não filtra isso na busca:
- `without_term_value_id` sem `term_id` é ignorado;
- com `term_id`, a busca exclui também as observações que não têm aquela anotação, que são a maioria.

A resposta de `/v1/observations` já traz `annotations[]`, com `controlled_attribute_id`, `controlled_value_id` e `vote_score`. O cliente descarta a observação quando ela tem, com `vote_score` ≥ 0:

| Termo (`controlled_attribute_id`) | Valores descartados (`controlled_value_id`) |
|---|---|
| Alive or Dead (17) | Dead (19) |
| Life Stage (1) | Egg (7) |
| Evidence of Presence (22) | Feather (23), Bone (27), Molt (28), Egg (30), Construction (35) |

Os ids vêm de `/v1/controlled_terms` e ficam fixos no código, com teste.

A anotação vale para a observação inteira, por isso o curador continua avaliando foto por foto.

**Votos e override.**
- `PhotoCandidate` ganha `ObservationID` e `Votes`, que vem do `faves_count` da observação (é o campo que o `order_by=votes` usa). As fotos da mesma observação empatam nos votos.
- Ele já tem o `SourceID`, que é o id da foto no iNaturalist.
- **Método novo `FindObservationPhoto(ctx, observationID, photoID)`**, via `GET /v1/observations/{id}`, para o override do YAML. A API não tem `GET /v1/photos/{id}` (ver seção 10).

### 5.2 Caso de uso `IngestPhotos`

`MaxPhotos` passa de 5 para **6**. O caso de uso roda nesta ordem:

1. Busca as candidatas e aplica os filtros de licença e de anotação.
2. **Aplica o override:**
   - tira as fotos de `photos.exclude`;
   - se houver `photos.primary`, busca a foto com `FindObservationPhoto`, mesmo fora das candidatas, e a licença dela passa pela mesma política.
3. Corta em 40 candidatas.
4. Baixa cada candidata e gera **só a variante `medium`**, em memória. São cerca de 40 × (original de até 1024 px + WebP de 800 px), entre 20 e 40 MB.
5. Manda as `medium` ao curador, em lotes de 8.
6. Decide a principal e a galeria (seção 5.3).
7. Gera a `thumb` e a `large` **só das fotos escolhidas** e grava as três variantes delas no storage. Hoje ele grava tudo o que baixa.
8. Numa transação, grava as fotos no banco (`ReplacePhotos`) com categoria, pontuação e versão do modelo, e grava a linha do relatório.
9. Roda o `removeOrphans`, como hoje.

**O tempo do job.** Hoje o `batchTimeout` de 2 minutos (`cmd/worker/main.go:42`) vale para a rodada inteira, com até 5 jobs por rodada. Um job de fotos novo faz:
- 40 downloads;
- 40 chamadas ao ffmpeg, mais 12 para as escolhidas;
- 5 chamadas ao curador, de até cerca de 8 s cada.

Por isso **[DR]**:
- o job de fotos ganha prazo próprio, `PHOTO_JOB_TIMEOUT`, de 6 minutos por padrão;
- o worker roda os jobs de fotos **um por rodada**, com o prazo da rodada passando a ser o maior entre o `batchTimeout` e o `PHOTO_JOB_TIMEOUT`;
- o `stop_grace_period` do worker no compose sobe para cobrir esse prazo.

**Falhas:**
- **Curador fora do ar:** o job devolve erro **antes do passo 7**. Nada é trocado, as fotos atuais ficam e a fila tenta de novo com backoff exponencial (`domain/backoff.go`: 1, 2, 4 e 8 min).
- **O erro do curador não gasta tentativa** **[DR]**. Com `MaxAttempts` = 5, o job viraria `failed` em cerca de 31 min e só voltaria em 24 h (`ReopenFailedJobs`). Por isso `UNAVAILABLE` e `DEADLINE_EXCEEDED` viram um erro `ErrCuratorUnavailable`, que a fila trata como "adiar": reagenda com o backoff sem somar tentativa.
- **Espécie nova:** fica sem foto até o curador voltar.
- **Override que falhou:** se a foto do `photos.primary` sumiu, mudou para uma licença fora da política ou não abriu, a principal volta a ser a do modelo, e a espécie entra no relatório com `override_failed`.

### 5.3 Pontuação e escolha

Só as `SINGLE_BIRD` concorrem a principal. A pontuação vai de 0 a 1 **[DR]**:

| Parte | Peso | Cálculo |
|---|---|---|
| Tamanho da ave | 0,4 | `min(largest_bird_area / 0,25, 1)` |
| Nitidez | 0,3 | `sharpness` |
| Votos | 0,2 | `log(1 + votos) / log(1 + maior número de votos entre as candidatas da espécie)`, ou 0 quando ninguém tem voto |
| Confiança | 0,1 | `confidence` |

- Uma ave cortada na borda tem a pontuação multiplicada por 0,5.
- **Ordem da galeria:** a principal (a de maior pontuação), depois as outras `SINGLE_BIRD` por pontuação e por fim os `FLOCK` por pontuação, até **6 fotos**. Os `FLOCK` são pontuados pela mesma fórmula.
- **No máximo 2 fotos da mesma observação** na galeria, para não mostrar três quase iguais **[DR]**.
- **Descartes:** `NEST`, `EGGS`, `FEATHER`, `DEAD_BIRD`, `NO_BIRD`, `OTHER` e `UNSPECIFIED` não entram.
- **Override:**
  - o `photos.primary` do YAML passa à frente de tudo, seja qual for a categoria que o curador deu;
  - o `photos.exclude` tira a foto mesmo se ela for a melhor.
- **Sem nenhuma `SINGLE_BIRD`** e sem `photos.primary`, a espécie **fica sem fotos**:
  - `ReplacePhotos` com lista vazia e `removeOrphans`, como já acontece hoje sem candidatas;
  - o contrato "a primeira é a principal", do `catalog.proto` e do `openapi.yaml`, continua valendo, então uma galeria só de bandos não é publicada;
  - o app mostra o placeholder, e a espécie entra no relatório.

### 5.4 Domínio e banco (migração `0004`)

**`domain.Photo`** ganha `SourcePhotoID`, `Category`, `Score` e `ModelVersion`.

**`media`:**
- colunas novas `source_photo_id text`, `category text`, `score real` e `model_version text`;
- **até a reingestão, a API continua servindo as fotos atuais:** a consulta pega a de menor `position` (`queries.sql`) e não olha a categoria;
- quem depender da categoria trata `category IS NULL` como não elegível, como a "Ave do dia" da frente B.

**`photo_override`:**
- colunas `(species_id, primary_observation_id, primary_photo_id, excluded_ids text[])`;
- gravada pelo seed e lida pelo worker.

**`curation_report`:**
- uma linha por espécie e execução, com:
  - `species_id`, `ran_at` e `model_version`;
  - `primary_photo_id`;
  - `candidates`, em JSON: id, observação, categoria, pontuação e confiança de cada candidata;
  - `flags text[]`: `low_confidence`, `no_single_bird` e `override_failed`;
- a tabela existe porque o worker roda com o sistema de arquivos só de leitura;
- **`low_confidence`:** a principal tem confiança abaixo do limite `LOW_CONFIDENCE`, calibrado no conjunto de referência e fixado na configuração do worker **[DR]**.

As consultas novas passam pelo `sqlc`, e a CI confere com `go tool sqlc diff`.

### 5.5 Seed

O `curated.LoadDir` passa a aceitar a chave `photos:`:

```yaml
photos:
  primary: { observation: 123456, photo: 219317614 }
  exclude: [219317615, 219317616]
```

- O seed grava em `photo_override`. Quando o YAML deixa de ter a chave `photos:`, ele **apaga** a linha da espécie.
- O seed recusa um `primary.photo` que também esteja em `exclude`.
- O `KnownFields(true)` continua recusando chave desconhecida, inclusive dentro de `photos:`.
- A chave `kids:` fica para a frente B, que é quem a usa **[DR]**.

### 5.6 Comandos novos do worker

O `cmd/worker` hoje não tem subcomandos. Ele passa a aceitar:

- **`worker requeue [species-id...]`:** reenfileira os jobs de fotos (fonte `inaturalist`) das espécies dadas, ou de todas se nenhuma for dada, sem esperar os 30 dias do `RefreshAfter`. Na frente A ele só reenfileira fotos.
- **`worker curation-report`:** escreve em Markdown, na saída padrão, a última execução de cada espécie, com as marcadas primeiro.
- **Sem subcomando:** o laço da fila, como hoje.

No compose, os comandos rodam com `docker compose run --rm catalog-worker requeue ...`.

### 5.7 Configuração e compose

- O worker ganha as variáveis `CURATOR_ADDR`, `PHOTO_JOB_TIMEOUT` e `LOW_CONFIDENCE`.
- O `passarim-docs/docker-compose.yml` ganha o serviço `photo-curator` (`build: ../passarim-photo-curator`), com estas características:
  - fica numa rede nova `internal: true`, a `passarim-curation`, que só ele e o worker compartilham. Por ela o curador não tem acesso à internet;
  - o worker continua também na `passarim-private`, que tem internet, para baixar do iNaturalist;
  - tem health check pelo gRPC;
  - roda com `read_only: true` e `tmpfs: [/tmp]`.
- O worker ganha `depends_on: photo-curator: condition: service_healthy`, para não começar a falhar jobs enquanto o curador sobe.

## 6. Testes

### Proto

- O `contract_test.go` ganha o serviço do curador.
- A CI confere que o código Go e o Python gerados estão em dia (o `git diff --exit-code gen/` já cobre `gen/python`).
- O `buf lint`, o `buf format` e o `buf breaking` continuam passando.

### Curador

**`rules.py`** — testes de tabela, sem modelo:
- ninho com filhote: o descarte vence o "uma ave";
- ave na mão e ilustração viram `OTHER`;
- ave dominante 4× maior que a do fundo é `SINGLE_BIRD`;
- casal lado a lado é `FLOCK`;
- **bando com uma só ave detectada** (o caso da andorinha) é `FLOCK`;
- nenhuma ave detectada, com e sem concordância do CLIP;
- "sem ave" forte com detecção fraca é `NO_BIRD`;
- ave cortada na borda, com a tolerância de 2%.

**`zeroshot.py`:**
- a agregação das frases soma as probabilidades por classe, num softmax único.

**Servidor**, com modelos falsos:
- o lote vazio e o de 9 fotos voltam `INVALID_ARGUMENT`;
- bytes que não abrem voltam `UNSPECIFIED` sem derrubar o lote;
- a resposta vem na mesma ordem do pedido;
- o health check responde.

**Contrato:**
- um teste conversa com o servidor pelo pacote Python gerado do proto.

**Conjunto de referência:**
- a divisão é determinística, agrupada por observação e estratificada pelo rótulo;
- a metade de medição tem o tamanho mínimo.

**Referência** — um job à parte, com os modelos de verdade e os pesos em cache:
- roda a metade de medição e escreve no resumo da CI as três metas com o intervalo de Wilson, a acurácia geral e a matriz de confusão;
- reprova abaixo das metas da seção 1.

**Imagem Docker:**
- um teste roda o container com `--network none` e `--read-only` e classifica um lote. É a prova de que o serviço não chama nada de fora.
- **velocidade:** falha se um lote de 8 fotos passar de 15 s na máquina da CI.

**Qualidade e segurança:**
- ruff, build da imagem, Trivy e gitleaks.

### Catalog

**Cliente do iNaturalist** (`httptest`):
- até 3 fotos por observação;
- o filtro de anotação no cliente, com cada par (termo, valor) da tabela e o `vote_score` negativo ignorado;
- `faves_count` vira `Votes`;
- o `FindObservationPhoto`, encontrando e não encontrando a foto.

**`IngestPhotos`**, com curador, ffmpeg e storage falsos:
- a escolha da principal pela pontuação;
- a ordem da galeria, o limite de 6 fotos e o de 2 por observação;
- o override `primary`, inclusive quando a foto falha (`override_failed`), e o override `exclude`;
- o curador fora do ar (`UNAVAILABLE` ou `DEADLINE_EXCEEDED`) devolve `ErrCuratorUnavailable` sem trocar nada nem gastar tentativa;
- uma foto `UNSPECIFIED` é tratada como descarte;
- uma espécie só com `FLOCK` fica sem fotos, roda o `removeOrphans` e é marcada no relatório;
- só as escolhidas ganham `thumb` e `large` e vão para o storage;
- um job de 40 candidatas com curador e ffmpeg falsos lentos termina dentro do `PHOTO_JOB_TIMEOUT`.

**Fila:**
- `ErrCuratorUnavailable` reagenda sem somar tentativa;
- os jobs de fotos rodam um por rodada.

**Migração, seed e comandos:**
- a migração 0004 sobe e desce;
- o seed aceita a chave `photos:`, recusa chave errada dentro dela, recusa `primary` dentro de `exclude` e apaga o override quando a chave some;
- `requeue` reenfileira só as espécies dadas, ou todas sem argumento;
- `curation-report` lista a última execução de cada espécie, com as marcadas primeiro.

**O que já existe:**
- o `sqlc diff` e o resto da CI continuam passando.

### Ponta a ponta, à mão

1. Subir o compose com o curador.
2. Rodar `worker requeue` e esperar a ingestão.
3. Exportar o `worker curation-report` e conferir as 41 espécies.
4. Abrir o app no emulador e ver a andorinha e o anu-preto.
5. As espécies que precisarem ganham override no YAML, e o `worker requeue <species-id>` aplica o override só nelas.

## 7. Ordem de entrega

Um PR por passo. Os PRs 6 e 7 não dependem do curador e podem andar em paralelo com os PRs 2 a 4.

1. **`passarim-proto`:** o `curator.proto`, a geração Python e a tag `v0.3.0`.
2. **`passarim-docs`:** a ADR-0021 ("curador de fotos em Python, exceção à ADR-0001").
3. **`passarim-photo-curator`:**
   - o esqueleto;
   - o `rules.py`;
   - o servidor com modelos falsos;
   - a CI (ruff, pytest e gitleaks).
4. **`passarim-photo-curator`:**
   - os modelos de verdade;
   - a imagem Docker;
   - o Trivy;
   - os testes de velocidade e de rede.
5. **`passarim-photo-curator`:**
   - o conjunto de referência, com a revisão do dono na página;
   - a calibração do `config.py`;
   - o job que reprova abaixo das metas.

   **Ponto de parada:** se a abordagem 1 não alcançar as metas, o redator volta ao dono com os números antes de seguir para o plano B. O plano B é a camada linear treinada sobre o CLIP, ou a troca do detector.
6. **`passarim-catalog`:**
   - a migração 0004;
   - os campos novos em `domain.Photo`;
   - a chave `photos:` no seed.
7. **`passarim-catalog`:** o cliente do iNaturalist, com até 3 fotos por observação, o filtro de anotação, os votos e o `FindObservationPhoto`.
8. **`passarim-catalog`:**
   - a ingestão com o curador, que remove o `TODO` de `photos.go`;
   - o prazo próprio do job de fotos e o `ErrCuratorUnavailable` na fila;
   - os comandos `requeue` e `curation-report`;
   - o `passarim-proto` sobe de v0.2.1 para v0.3.0 no `go.mod`.
9. **`passarim-docs`:** o serviço `photo-curator` no compose, a rede `passarim-curation`, o `depends_on` e o `stop_grace_period` do worker.
10. **Reingestão e conferência:** o relatório das 41 espécies e os overrides necessários no YAML, num PR de conteúdo.

## 8. Riscos

| Risco | Mitigação |
|---|---|
| O CLIP sem treino confunde pena ou ovo com ave | Limite por classe, calibrado; plano B com a camada linear; override no YAML |
| A métrica de referência é ruidosa com cerca de 90 fotos | Intervalo de Wilson no resumo; metas indicativas; o critério final é a conferência das 41 espécies |
| A imagem Docker do curador fica grande (cerca de 2 GB) | Torch só de CPU; só o worker depende dela e só na ingestão |
| A ingestão fica mais lenta | Um job de fotos por rodada, com prazo de 6 min; a reingestão das 41 espécies leva por volta de 1 h, e só quando rodada à mão ou a cada 30 dias |
| Os ids de anotação do iNaturalist mudam | Fixados no código com teste; o curador continua avaliando foto por foto |
| O card do LAION desaconselha uso implantado sem teste | Uso offline com taxonomia fixa, testado no conjunto e com revisão humana; registrado no README |

## 9. Decisões do redator [DR]

1. **Dominância 4×:** uma ave que ocupa 4 vezes a área da segunda conta como ave sozinha. O valor inicial é ajustado na calibração.
2. **Revocação de `SINGLE_BIRD` ≥ 70%,** acrescentada para que um curador que descarta tudo não passe nas metas.
3. **Divisão do conjunto em calibração e medição,** com semente fixa, estratificada por rótulo e agrupada por observação, e tamanho mínimo da medição.
4. **Pesos da pontuação:** 0,4 tamanho, 0,3 nitidez, 0,2 votos, 0,1 confiança, e metade para ave cortada. São um ponto de partida: a conferência das 41 espécies pode pedir ajuste.
5. **No máximo 2 fotos da mesma observação na galeria.**
6. **O limite de baixa confiança é calibrado**, não fixado em 0,6, porque o softmax sem treino sobre muitas classes dá probabilidades baixas.
7. **Prazo próprio do job de fotos** (6 min) **e um job de fotos por rodada.**
8. **Curador fora do ar não gasta tentativa:** o job é adiado, não falha.
9. **Ave na mão e ilustração viram `OTHER`.** O CLIP com `flock` alto vira `FLOCK` mesmo com uma ave detectada.
10. **A chave `kids:` do seed fica para a frente B.** O PRD a colocava junto da `photos:`, mas nada a usa antes da frente B.

## 10. Correções ao PRD

| PRD | Esta spec | Por quê |
|---|---|---|
| Filtro de anotação com `without_term_value_id` na busca | Filtro no cliente, sobre `annotations[]` da resposta | A API ignora o parâmetro sem `term_id` e, com `term_id`, exclui as observações sem anotação (conferido em 2026-10-17) |
| `photos.primary` com o id da foto, buscado por `GET /v1/photos/{id}` | `photos.primary: { observation, photo }`, buscado por `GET /v1/observations/{id}` | O endpoint de foto não existe na v1 nem na v2 (404) |
| Cerca de 40 candidatas com até 3 por observação | 20 observações, até 3 fotos de cada, corte em 40 | O PRD não dizia quantas observações buscar |
| Conjunto de referência de cerca de 60 fotos, só com ids, baixadas na CI | 150 a 200 fotos versionadas no repositório, com `ATTRIBUTION.md` | Decisão do dono (seção 2): a CI roda sem rede e com o mesmo conjunto sempre |
| A escolha final do modelo sai do teste | O R50vd COCO é a primeira escolha; a troca entra no plano B | Um ponto de partida concreto para o PR 4 |
