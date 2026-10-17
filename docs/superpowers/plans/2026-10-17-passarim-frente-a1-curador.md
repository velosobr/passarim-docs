# Frente A1 — Contrato, ADR e curador de fotos: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o contrato `curator.proto` (v0.3.0, com geração Python), a ADR-0021 e o serviço `passarim-photo-curator` completo: regra, servidor gRPC, modelos de verdade e imagem Docker offline. Ficam de fora o conjunto de referência e a calibração (plano A2) e a integração com o catalog (plano A3).

**Architecture:**
- Um serviço gRPC em Python recebe lotes de até 8 fotos WebP.
- Para cada foto, roda um detector de aves (RT-DETR) e um classificador sem treino (OpenCLIP).
- Uma função pura, `curate`, transforma as saídas dos dois em um veredito com categoria, contagem, área, corte, nitidez e confiança.
- Os modelos ficam atrás de interfaces (`Protocol`), o que permite testar o servidor e a regra sem pesos.

**Tech Stack:**
- **Contrato:** Buf 1.73.0. Plugins de Python `buf.build/protocolbuffers/python:v36.2`, `buf.build/protocolbuffers/pyi:v36.2` e `buf.build/grpc/python:v1.84.0`.
- **Linguagem e ferramentas:** Python 3.13 e uv 0.13.1.
- **Bibliotecas:** grpcio e grpcio-health-checking 1.84.0, protobuf 7.36.2, torch 2.14.1 e torchvision 0.29.1 (só CPU), transformers 5.20.1, open-clip-torch 3.3.0, huggingface-hub 2.2.0, pillow 13.0.0 e numpy 2.5.4.
- **Testes e lint:** pytest 9.1.1 e ruff 0.17.1.

**Spec:** `passarim-docs/docs/superpowers/specs/2026-10-17-passarim-frente-a-curadoria-design.md` (seções 3, 4 e 7, PRs 1 a 4)

## Global Constraints

- **Comentários didáticos em português** em todo código e configuração novos (regra do `~/dev/passarim/CLAUDE.md`):
  - todo arquivo começa dizendo o seu papel;
  - funções, classes e blocos não triviais dizem o que fazem e por quê;
  - conceitos (gRPC, `Protocol`, softmax, Laplaciano, namespace package) são explicados na primeira vez que aparecem no arquivo.
- Identificadores em inglês; comentários, docstrings, mensagens de commit, PRs e README em português do Brasil.
- **Commits** com `-c user.name=velosobr -c user.email=linoc.veloso@gmail.com` e terminando com:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb
  ```
- **PRs** terminando com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`, uma linha em branco e `https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb`.
- **Lote:** 1 a 8 fotos por chamada; lote vazio ou maior que 8 dá `INVALID_ARGUMENT`.
- **Imagem que não abre:** `PHOTO_CATEGORY_UNSPECIFIED`, sem derrubar o lote.
- **Modelos (revisões fixas):**
  - RT-DETR `PekingU/rtdetr_r50vd`, revisão `df939e661d8c52e80608d1ec566561aabd25a4e7`;
  - OpenCLIP `laion/CLIP-ViT-B-32-laion2B-s34B-b79K` (arquitetura `ViT-B-32`), revisão `1a25a446712ba5ee05982a381eed697ef9b435cf`.
  - **Nunca o Ultralytics.**
- **Classe "bird" do COCO no RT-DETR:** `id2label[14] == "bird"`, com chaves `int`.
- **Execução:** só CPU, `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`, pesos em `/opt/models` dentro da imagem, usuário sem privilégios, `read_only` com `tmpfs: /tmp`, 2 threads de atendimento gRPC.
- **Versão do modelo:** `MODEL_VERSION = "rtdetr-r50vd+openclip-b32@1"`.
- **Porta gRPC do curador:** `50061` (variável `PORT`).
- **Velocidade:** um lote de 8 fotos em até 15 s na máquina da CI.

## Review Focus

1. **Bando que o detector não vê:** na andorinha real, o RT-DETR acha 0 aves e o CLIP dá `flock` 1,0. O curador tem que responder `FLOCK`, não `OTHER`, e não pode entrar no ramo "sem ave" antes do bando. É coberto pelo teste `test_flock_without_detections_is_flock` (Task 3) e pela fixture real (Task 7).
2. **Close-up que encosta na borda:** na arara-azul real, a caixa vai de x = 0 a 713 numa foto de 706 px de largura. O corte tem que ser marcado (`largest_bird_cut = True`), mas a categoria continua `SINGLE_BIRD`. É coberto por `test_close_up_touching_edge_is_single_and_cut` (Task 3).
3. **Lote com uma imagem corrompida no meio:** as outras fotos continuam classificadas, e a ordem da resposta é a do pedido. É coberto por `test_bad_image_does_not_break_batch` (Task 5).
4. **Caixa do detector fora da imagem** (coordenada negativa ou maior que o tamanho, o que o RT-DETR pode devolver): a área é limitada a 1 e o recorte de nitidez não quebra. É coberto por `test_box_outside_image_is_clamped` (Task 3) e por `test_sharpness_box_outside_image` (Task 4).
5. **Container sem rede:** a imagem não pode tentar baixar nada ao subir. É coberto pelo self-check com `--network none --read-only` (Task 8).

## Ajuste à spec registrado neste plano

**Ruling:** a ordem da regra (spec 4.3) passa a ser:
1. descarte por conteúdo;
2. **bando pelo CLIP**;
3. sem ave;
4. detecção falsa;
5. bando pelo detector;
6. ave sozinha.

Na spec, "sem ave" vinha antes do bando pelo CLIP. O teste com as fotos reais (2026-10-17) mostrou que, num bando de andorinhas no fio, o RT-DETR não acha nenhuma ave acima de 0,5. Com a ordem da spec, a foto sairia `OTHER` e ficaria fora da galeria.

**Custo se estiver errado:** uma foto sem ave de verdade, em que o CLIP veja "bando" acima do limite, vira `FLOCK` e pode entrar na galeria, nunca como principal. O plano A2 calibra o limite de `flock`.

---

## Parte 1 — `passarim-proto` (PR 1)

### Task 1: `curator.proto`, geração Python e testes de contrato

**Files:**
- Create: `passarim-proto/proto/passarim/curator/v1/curator.proto`
- Create: `passarim-proto/gen/python/pyproject.toml`
- Create: `passarim-proto/gen/python/README.md`
- Modify: `passarim-proto/buf.gen.yaml`
- Modify: `passarim-proto/contract_test.go`
- Modify: `passarim-proto/.github/workflows/ci.yml`
- Modify: `passarim-proto/README.md`
- Generated (committed): `passarim-proto/gen/go/passarim/curator/v1/*.go`, `passarim-proto/gen/python/passarim/**/*.py`, `*.pyi`

**Interfaces:**
- Produces:
  - o pacote Go `github.com/velosobr/passarim-proto/gen/go/passarim/curator/v1` (`curatorv1`);
  - o pacote Python `passarim.curator.v1`, com os módulos `curator_pb2` e `curator_pb2_grpc`, a classe `PhotoCuratorServiceServicer`, a função `add_PhotoCuratorServiceServicer_to_server` e o `PhotoCuratorServiceStub`;
  - o enum `PhotoCategory` com os valores 0 a 8 da spec;
  - a tag `v0.3.0`.

- [ ] **Step 1: Criar a branch**

```bash
cd ~/dev/passarim/passarim-proto && git switch main && git pull --ff-only && git switch -c feat/curator-proto
```

- [ ] **Step 2: Escrever o teste de contrato que falha**

Acrescentar ao fim de `contract_test.go` o import `curatorv1 "github.com/velosobr/passarim-proto/gen/go/passarim/curator/v1"` (no bloco de imports, ao lado do `catalogv1`) e estes testes:

```go
// O veredito do curador precisa sobreviver à ida e volta pelo formato binário,
// porque é assim que ele viaja do curador (Python) até o worker (Go) via gRPC.
func TestPhotoVerdictRoundTrip(t *testing.T) {
	original := &curatorv1.ClassifyPhotosResponse{
		ModelVersion: "rtdetr-r50vd+openclip-b32@1",
		Verdicts: []*curatorv1.PhotoVerdict{{
			PhotoId:         "144156085",
			Category:        curatorv1.PhotoCategory_PHOTO_CATEGORY_SINGLE_BIRD,
			BirdCount:       1,
			LargestBirdArea: 0.8,
			LargestBirdCut:  true,
			Sharpness:       0.6,
			Confidence:      0.9,
		}},
	}
	data, err := proto.Marshal(original)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var got curatorv1.ClassifyPhotosResponse
	if err := proto.Unmarshal(data, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !proto.Equal(original, &got) {
		t.Fatalf("ida e volta mudou a mensagem:\n antes %v\n depois %v", original, &got)
	}
}

// Os números do enum são parte do contrato: o worker grava a categoria no banco
// e o curador a envia como número. Trocar um número mudaria o significado de
// fotos já classificadas, então o teste trava cada um.
func TestPhotoCategoryNumbersAreStable(t *testing.T) {
	want := map[curatorv1.PhotoCategory]protoreflect.EnumNumber{
		curatorv1.PhotoCategory_PHOTO_CATEGORY_UNSPECIFIED: 0,
		curatorv1.PhotoCategory_PHOTO_CATEGORY_SINGLE_BIRD: 1,
		curatorv1.PhotoCategory_PHOTO_CATEGORY_FLOCK:       2,
		curatorv1.PhotoCategory_PHOTO_CATEGORY_NEST:        3,
		curatorv1.PhotoCategory_PHOTO_CATEGORY_EGGS:        4,
		curatorv1.PhotoCategory_PHOTO_CATEGORY_FEATHER:     5,
		curatorv1.PhotoCategory_PHOTO_CATEGORY_DEAD_BIRD:   6,
		curatorv1.PhotoCategory_PHOTO_CATEGORY_NO_BIRD:     7,
		curatorv1.PhotoCategory_PHOTO_CATEGORY_OTHER:       8,
	}
	for category, number := range want {
		if category.Number() != number {
			t.Errorf("%v: número %d, esperado %d", category, category.Number(), number)
		}
	}
	if n := len(curatorv1.PhotoCategory_name); n != len(want) {
		t.Errorf("o enum tem %d valores, o teste conhece %d: atualize o teste e o worker", n, len(want))
	}
}
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `go test ./...`
Expected: FAIL na compilação, com `no required module provides package github.com/velosobr/passarim-proto/gen/go/passarim/curator/v1`.

- [ ] **Step 4: Escrever o `curator.proto`**

```proto
// curator.proto — contrato do curador de fotos (passarim-photo-curator).
//
// Quem usa: o worker do passarim-catalog chama este serviço durante a ingestão,
// para saber o que cada foto candidata mostra. A API do catalog, o BFF e o app
// não conhecem este serviço: se ele cair, o Passarim no ar continua igual.
//
// Por que um arquivo separado do catalog.proto: é outro serviço, escrito em
// outra linguagem (Python) e com outro ciclo de vida. Separar deixa claro que
// mudar a curadoria não mexe no contrato que o BFF consome.
syntax = "proto3";

package passarim.curator.v1;

// PhotoCuratorService classifica fotos de aves.
service PhotoCuratorService {
  // ClassifyPhotos recebe de 1 a 8 fotos (bytes WebP da variante "medium", com
  // 800 px no lado maior) e devolve um veredito por foto, na mesma ordem.
  //
  // O limite de 8 fotos mantém a mensagem bem abaixo dos 4 MB que o gRPC aceita
  // por padrão. Lote vazio ou com mais de 8 fotos: INVALID_ARGUMENT.
  // Uma foto que não abre NÃO derruba o lote: volta com PHOTO_CATEGORY_UNSPECIFIED.
  rpc ClassifyPhotos(ClassifyPhotosRequest) returns (ClassifyPhotosResponse);
}

// ClassifyPhotosRequest é o lote de fotos a classificar.
message ClassifyPhotosRequest {
  repeated PhotoInput photos = 1;
}

// PhotoInput é uma foto do lote.
message PhotoInput {
  // photo_id é o id da foto no iNaturalist. O curador não o interpreta: só o
  // devolve no veredito, para o worker saber de qual foto se trata.
  string photo_id = 1;
  // image são os bytes do arquivo (WebP), sem nenhuma conversão.
  bytes image = 2;
}

// ClassifyPhotosResponse traz um veredito por foto, na ordem do pedido.
message ClassifyPhotosResponse {
  repeated PhotoVerdict verdicts = 1;
  // model_version identifica os modelos e a regra que geraram os vereditos
  // (ex.: "rtdetr-r50vd+openclip-b32@1"). O worker grava isso em cada foto, para
  // saber quais fotos refazer quando o modelo mudar.
  string model_version = 2;
}

// PhotoVerdict é o que o curador concluiu sobre uma foto.
message PhotoVerdict {
  string photo_id = 1;
  // category: o que a foto mostra. UNSPECIFIED quando a imagem não abriu.
  PhotoCategory category = 2;
  // bird_count: quantas aves o detector achou.
  int32 bird_count = 3;
  // largest_bird_area: fração da foto ocupada pela caixa da maior ave, de 0 a 1.
  float largest_bird_area = 4;
  // largest_bird_cut: a caixa da maior ave encosta na borda da foto (ave cortada).
  bool largest_bird_cut = 5;
  // sharpness: nitidez da maior ave (ou da foto inteira, sem ave), de 0 a 1.
  float sharpness = 6;
  // confidence: o quanto o curador confia na categoria, de 0 a 1.
  float confidence = 7;
}

// PhotoCategory é o que uma foto mostra. Os números são parte do contrato:
// o worker os grava no banco, então nunca mudam de significado.
enum PhotoCategory {
  // O valor zero é obrigatório no proto3 e significa "não sei" (aqui: a
  // imagem não abriu).
  PHOTO_CATEGORY_UNSPECIFIED = 0;
  // Uma ave sozinha (ou uma ave dominante com outras pequenas ao fundo).
  // Só esta categoria pode ser a foto principal.
  PHOTO_CATEGORY_SINGLE_BIRD = 1;
  // Duas aves ou mais sem uma dominante, ou um bando. Pode entrar na galeria.
  PHOTO_CATEGORY_FLOCK = 2;
  // Ninho (com ou sem filhotes, ou com o adulto chocando). Descartada.
  PHOTO_CATEGORY_NEST = 3;
  // Ovos. Descartada.
  PHOTO_CATEGORY_EGGS = 4;
  // Pena solta. Descartada.
  PHOTO_CATEGORY_FEATHER = 5;
  // Ave morta. Descartada.
  PHOTO_CATEGORY_DEAD_BIRD = 6;
  // Nenhuma ave na foto. Descartada.
  PHOTO_CATEGORY_NO_BIRD = 7;
  // Outros casos: ave na mão, ilustração, foto de tela, ave escondida demais.
  // Descartada.
  PHOTO_CATEGORY_OTHER = 8;
}
```

- [ ] **Step 5: Acrescentar os plugins de Python ao `buf.gen.yaml`**

Acrescentar ao fim da lista `plugins:` (sem `clean`, para o `buf generate` não apagar o `gen/python/pyproject.toml`):

```yaml
  # Python: as mensagens (_pb2.py), as dicas de tipo para editores e para o
  # mypy (_pb2.pyi) e o cliente e servidor gRPC (_pb2_grpc.py). Quem usa é o
  # passarim-photo-curator. A versão do protocolbuffers/python acompanha a do
  # pacote "protobuf" do PyPI: v36.2 gera código que exige protobuf >= 7.36.2.
  - remote: buf.build/protocolbuffers/python:v36.2
    out: gen/python
  - remote: buf.build/protocolbuffers/pyi:v36.2
    out: gen/python
  - remote: buf.build/grpc/python:v1.84.0
    out: gen/python
```

- [ ] **Step 6: Gerar e rodar o teste**

Run: `buf lint && buf format -d --exit-code && buf generate && go test ./...`
Expected:
- o lint e o format não mostram nada;
- os testes passam (`ok github.com/velosobr/passarim-proto`);
- surgem os arquivos em `gen/go/passarim/curator/v1/`, `gen/python/passarim/curator/v1/` e `gen/python/passarim/catalog/v1/`.

- [ ] **Step 7: Empacotar o Python**

`gen/python/pyproject.toml`:

```toml
# pyproject.toml — transforma o código Python gerado num pacote instalável.
#
# Quem usa: o passarim-photo-curator instala daqui com
#   uv: [tool.uv.sources] passarim-proto = { git = "...", tag = "v0.3.0", subdirectory = "gen/python" }
#
# O buf não gera arquivos __init__.py. Por isso "passarim", "passarim.curator" e
# "passarim.curator.v1" são "namespace packages": pastas que o Python aceita como
# pacote mesmo sem __init__.py. O hatchling empacota a pasta "passarim" inteira.
[build-system]
requires = ["hatchling==1.32.4"]
build-backend = "hatchling.build"

[project]
name = "passarim-proto"
version = "0.3.0"
description = "Código Python gerado dos contratos gRPC do Passarim"
requires-python = ">=3.10"
# O código gerado confere a versão do protobuf ao ser importado
# (ValidateProtobufRuntimeVersion) e recusa uma versão mais velha que a do
# plugin. Por isso o mínimo aqui é o mesmo do plugin (v36.2 -> 7.36.2).
dependencies = [
  "protobuf>=7.36.2",
  "grpcio>=1.84.0",
]

[tool.hatch.build.targets.wheel]
packages = ["passarim"]
```

`gen/python/README.md`:

```markdown
# passarim-proto (Python)

Código Python gerado pelo `buf generate` a partir de `proto/`. **Não edite os arquivos `_pb2*`**: mude o `.proto` e gere de novo.

Instalação com pip:

    pip install "git+https://github.com/velosobr/passarim-proto@v0.3.0#subdirectory=gen/python"

Uso:

    from passarim.curator.v1 import curator_pb2, curator_pb2_grpc
```

- [ ] **Step 8: Conferir que o pacote instala e importa**

Run:
```bash
python3.13 -m venv /tmp/protopy && /tmp/protopy/bin/pip install -q ./gen/python && /tmp/protopy/bin/python -c "from passarim.curator.v1 import curator_pb2, curator_pb2_grpc; print(curator_pb2.PhotoCategory.Name(1), hasattr(curator_pb2_grpc, 'PhotoCuratorServiceStub'))"
```
Expected: `PHOTO_CATEGORY_SINGLE_BIRD True`

- [ ] **Step 9: Conferir o pacote Python na CI**

Em `.github/workflows/ci.yml`, depois do passo `- run: go test ./...`:

```yaml
      # O pacote Python gerado (gen/python) precisa instalar e importar: é o
      # que o passarim-photo-curator faz. Um erro aqui (ex.: falta de
      # dependência no pyproject) só apareceria lá, bem mais tarde.
      - uses: actions/setup-python@v6
        with:
          python-version: "3.13"
      - name: o pacote Python instala e importa
        run: |
          python -m pip install ./gen/python
          python -c "from passarim.curator.v1 import curator_pb2, curator_pb2_grpc; from passarim.catalog.v1 import catalog_pb2"
```

- [ ] **Step 10: README**

Em `passarim-proto/README.md`, acrescentar uma seção:

```markdown
## Serviços

| Arquivo | Serviço | Quem implementa | Quem chama |
|---|---|---|---|
| `proto/passarim/catalog/v1/catalog.proto` | `CatalogService` | passarim-catalog | passarim-bff |
| `proto/passarim/curator/v1/curator.proto` | `PhotoCuratorService` | passarim-photo-curator | worker do passarim-catalog |

## Código gerado

- Go: `gen/go` (módulo `github.com/velosobr/passarim-proto`).
- Python: `gen/python`, instalável como pacote (ver `gen/python/README.md`).

Os dois são gerados com `buf generate` e versionados; a CI falha se estiverem desatualizados.
```

- [ ] **Step 11: Commit, PR e tag**

```bash
git add -A && git -c user.name=velosobr -c user.email=linoc.veloso@gmail.com commit -m "feat: contrato do curador de fotos e geração Python" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb"
git push -u origin feat/curator-proto
gh pr create --base main --title "feat: contrato do curador de fotos e geração Python" --body "<resumo: curator.proto, plugins Python, pacote gen/python, testes de contrato; fecha o PR 1 da frente A>"
```

Depois da CI verde e do merge, criar a tag na `main`:

```bash
git switch main && git pull --ff-only && git tag -a v0.3.0 -m "v0.3.0: contrato do curador de fotos e geração Python" && git push origin v0.3.0
```

---

## Parte 2 — `passarim-docs` (PR 2)

### Task 2: ADR-0021

**Files:**
- Create: `passarim-docs/docs/adr/0021-curador-de-fotos-em-python.md`
- Modify: o índice de ADRs, se existir (`grep -rl "0020-licencas" passarim-docs/docs passarim-docs/README.md`), acrescentando a linha da 0021 no mesmo formato.

- [ ] **Step 1: Escrever a ADR**

```markdown
# ADR-0021: Curador de fotos em Python, uma exceção à ADR-0001

- **Status:** Aceita
- **Data:** 2026-10-17

## Contexto

A frente A da guinada escolhe a foto principal de cada espécie: uma ave sozinha, nunca bando, ninho, ovos, pena ou
ave morta. Isso pede um detector de objetos e um classificador de imagem sem treino (CLIP). Em Go não há
implementação madura e mantida desses modelos; em Python, o `transformers` (RT-DETR) e o `open_clip` são o padrão
da área, com código e pesos sob licenças permissivas.

A ADR-0001 define Go para o backend.

## Decisão

- O curador é um serviço separado, `passarim-photo-curator`, escrito em **Python**, com gRPC
  (`passarim.curator.v1.PhotoCuratorService`, no `passarim-proto` a partir da v0.3.0).
- **Só o worker do catalog o chama, durante a ingestão.** A API do catalog, o BFF e o app não dependem dele.
- Roda **só na CPU**, com os pesos dentro da imagem Docker e nenhuma chamada externa: rede `internal` no compose,
  `HF_HUB_OFFLINE=1`.
- Modelos: RT-DETR R50vd (Apache 2.0, código e pesos) e OpenCLIP ViT-B/32 LAION-2B (MIT, código e pesos).
  O Ultralytics fica de fora por ser AGPL.
- O resto do backend continua em Go. A exceção vale para trabalho de visão computacional que roda fora do caminho
  de uma requisição.

## Consequências

- Um segundo ecossistema no backend: `uv`, `ruff` e `pytest` ao lado do Go, com CI própria.
- A imagem do curador é grande (cerca de 2 GB), mas só o worker depende dela e só durante a ingestão.
- O contrato gRPC isola as linguagens: trocar o modelo, ou até a linguagem do curador, não mexe no catalog.
- O card dos pesos do LAION desaconselha uso implantado sem teste no domínio. O uso aqui é offline, com taxonomia
  fixa, medido num conjunto de referência e com revisão humana das 41 espécies; o README do curador registra isso.
```

- [ ] **Step 2: Commit e PR**

```bash
cd ~/dev/passarim/passarim-docs && git switch main && git pull --ff-only && git switch -c docs/adr-0021-curador
git add docs/adr/0021-curador-de-fotos-em-python.md && git -c user.name=velosobr -c user.email=linoc.veloso@gmail.com commit -m "docs: ADR-0021, curador de fotos em Python" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb"
git push -u origin docs/adr-0021-curador && gh pr create --base main --title "docs: ADR-0021, curador de fotos em Python" --body "<resumo>"
```

---

## Parte 3 — `passarim-photo-curator`, esqueleto, regra e servidor (PR 3)

O repositório `velosobr/passarim-photo-curator` existe e está **vazio**. Um PR precisa de uma branch base, então a Task 3 começa com um commit inicial na `main` (só README e `.gitignore`), e o resto vem por PR.

### Task 3: Projeto, configuração e a regra `curate`

**Files:**
- Create: `README.md`, `.gitignore`, `pyproject.toml`, `uv.lock` (gerado), `.python-version`
- Create: `src/photo_curator/__init__.py`, `src/photo_curator/config.py`, `src/photo_curator/types.py`, `src/photo_curator/rules.py`
- Test: `tests/test_rules.py`

**Interfaces:**
- Produces (`photo_curator.types`):
  - `class Category(enum.IntEnum)`: `UNSPECIFIED=0, SINGLE_BIRD=1, FLOCK=2, NEST=3, EGGS=4, FEATHER=5, DEAD_BIRD=6, NO_BIRD=7, OTHER=8`;
  - `@dataclass(frozen=True) class Box`: `x0: float, y0: float, x1: float, y1: float, score: float`, com `area` (property);
  - `@dataclass(frozen=True) class Verdict`: `category: Category, bird_count: int, largest_bird_area: float, largest_bird_cut: bool, sharpness: float, confidence: float`;
  - `CLIP_CLASSES: tuple[str, ...] = ("single", "flock", "nest", "eggs", "feather", "dead", "in_hand", "drawing", "no_bird")`.
- Produces (`photo_curator.rules`):
  - `curate(boxes: Sequence[Box], clip: Mapping[str, float], sharpness: float, width: int, height: int) -> Verdict`;
  - `largest_box(boxes: Sequence[Box]) -> Box | None`;
  - `clamp_box(box: Box, width: int, height: int) -> Box`.
- Produces (`photo_curator.config`): as constantes `DETECTOR_MIN_SCORE`, `DISCARD_MIN`, `FLOCK_MIN`, `NO_BIRD_MIN`, `NO_BIRD_STRONG`, `WEAK_DETECTION`, `DOMINANCE`, `EDGE_TOLERANCE`, `SHARPNESS_LOG_MIN`, `SHARPNESS_LOG_MAX`, `MAX_BATCH`, `MODEL_VERSION`.

- [ ] **Step 1: Instalar o uv e clonar o repositório**

```bash
brew install uv && uv --version   # esperado: uv 0.13.1 ou mais novo
cd ~/dev/passarim && git clone https://github.com/velosobr/passarim-photo-curator.git && cd passarim-photo-curator
```

- [ ] **Step 2: Commit inicial na `main` (o repositório está vazio)**

`.gitignore`:

```gitignore
# Arquivos que o git ignora.
# .venv é o ambiente virtual que o uv cria: cada máquina gera o seu.
.venv/
# Cache do Python e das ferramentas de teste e lint.
__pycache__/
*.pyc
.pytest_cache/
.ruff_cache/
# Pesos baixados localmente para os testes com modelos de verdade (ver README).
models/
# Lixo do macOS e das IDEs.
.DS_Store
.idea/
.vscode/
```

`README.md` (versão inicial; a Task 8 completa):

```markdown
# passarim-photo-curator

Serviço gRPC, em Python, que classifica fotos de aves para o Passarim: ave sozinha, bando, ninho, ovos, pena, ave
morta, sem ave ou outro. Só o worker do `passarim-catalog` o chama, durante a ingestão.

Contrato: `passarim.curator.v1.PhotoCuratorService`, no [passarim-proto](https://github.com/velosobr/passarim-proto).
Decisão: ADR-0021 no `passarim-docs`.
```

```bash
git add .gitignore README.md && git -c user.name=velosobr -c user.email=linoc.veloso@gmail.com commit -m "chore: começo do repositório" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb"
git push -u origin main && git switch -c feat/esqueleto-regra-servidor
```

- [ ] **Step 3: `pyproject.toml` e `.python-version`**

`.python-version`:

```
3.13
```

`pyproject.toml`:

```toml
# pyproject.toml — a "ficha" do projeto: nome, versão do Python, dependências e
# configuração das ferramentas (pytest e ruff). O uv lê este arquivo, resolve as
# versões e as trava no uv.lock, que vai para o repositório: assim todo mundo
# (e a CI, e a imagem Docker) instala exatamente as mesmas versões.
[project]
name = "passarim-photo-curator"
version = "0.1.0"
description = "Curador de fotos de aves do Passarim (serviço gRPC)"
requires-python = ">=3.13,<3.14"
dependencies = [
  # gRPC: servidor, health check (o compose pergunta "você está de pé?") e o
  # código gerado do contrato.
  "grpcio==1.84.0",
  "grpcio-health-checking==1.84.0",
  "protobuf==7.36.2",
  "passarim-proto",
  # Imagem: abrir WebP (Pillow) e fazer contas com os pixels (numpy).
  "pillow==13.0.0",
  "numpy==2.5.4",
  # Modelos: torch é a biblioteca de redes neurais; transformers traz o
  # RT-DETR (detector); open_clip traz o CLIP; huggingface_hub baixa os pesos.
  "torch==2.14.1",
  "torchvision==0.29.1",
  "transformers==5.20.1",
  "open-clip-torch==3.3.0",
  "huggingface-hub==2.2.0",
]

[dependency-groups]
# Ferramentas só de desenvolvimento: não vão para a imagem Docker.
dev = [
  "pytest==9.1.1",
  "ruff==0.17.1",
]

[build-system]
requires = ["hatchling==1.32.4"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/photo_curator"]

# O torch publica no PyPI uma versão com suporte a GPU (NVIDIA), bem maior.
# O índice abaixo tem a versão só de CPU, que é a que usamos. "explicit = true"
# quer dizer: só os pacotes apontados em [tool.uv.sources] vêm dele; o resto
# continua vindo do PyPI.
[[tool.uv.index]]
name = "pytorch-cpu"
url = "https://download.pytorch.org/whl/cpu"
explicit = true

[tool.uv.sources]
torch = { index = "pytorch-cpu" }
torchvision = { index = "pytorch-cpu" }
# O contrato vem do repositório do proto, numa tag fixa, da pasta gen/python.
passarim-proto = { git = "https://github.com/velosobr/passarim-proto", tag = "v0.3.0", subdirectory = "gen/python" }

[tool.pytest.ini_options]
testpaths = ["tests"]
# "models" marca os testes que precisam dos pesos de verdade (lentos, cerca de
# 600 MB). Rodam só quando pedidos: pytest -m models.
markers = ["models: precisa dos pesos dos modelos (CURATOR_MODELS_DIR)"]
addopts = "-m 'not models'"

[tool.ruff]
line-length = 110
target-version = "py313"

[tool.ruff.lint]
# E/F: erros básicos; I: ordem dos imports; UP: sintaxe moderna; B: armadilhas
# comuns; SIM: simplificações.
select = ["E", "F", "I", "UP", "B", "SIM"]
```

Run: `uv lock && uv sync`
Expected: o uv cria o `uv.lock` e a `.venv`, e o `torch` resolvido vem de `download.pytorch.org/whl/cpu` (`grep -A2 'name = "torch"' uv.lock` mostra esse `source`).

- [ ] **Step 4: Escrever os testes da regra (falham)**

`tests/test_rules.py`:

```python
"""Testes da regra de decisão (photo_curator.rules.curate).

A regra é uma função pura: recebe o que os modelos viram (caixas do detector,
probabilidades do CLIP, nitidez) e devolve o veredito. Por isso estes testes não
carregam modelo nenhum e rodam em milissegundos. Cada caso é uma foto
"imaginada" com números escolhidos para cair num ramo da regra.
"""

import pytest

from photo_curator import config
from photo_curator.rules import clamp_box, curate, largest_box
from photo_curator.types import CLIP_CLASSES, Box, Category

W, H = 800, 600  # tamanho de foto usado na maioria dos casos


def clip(**probs: float) -> dict[str, float]:
    """Monta as probabilidades do CLIP: as classes não citadas ficam em 0."""
    scores = dict.fromkeys(CLIP_CLASSES, 0.0)
    scores.update(probs)
    return scores


def bird(x0: float, y0: float, x1: float, y1: float, score: float = 0.9) -> Box:
    return Box(x0, y0, x1, y1, score)


def test_single_bird_in_the_middle():
    v = curate([bird(200, 150, 600, 450)], clip(single=0.9), 0.7, W, H)
    assert v.category is Category.SINGLE_BIRD
    assert v.bird_count == 1
    assert v.largest_bird_area == pytest.approx(400 * 300 / (W * H))
    assert v.largest_bird_cut is False
    assert v.sharpness == 0.7
    assert v.confidence == pytest.approx(0.9)  # min(CLIP single 0,9; detector 0,9)


def test_nest_with_chick_is_nest_even_with_one_bird():
    # O filhote é "uma ave" para o detector, mas a foto é de ninho: o descarte vem antes.
    v = curate([bird(300, 200, 500, 400)], clip(nest=0.8, single=0.2), 0.5, W, H)
    assert v.category is Category.NEST
    assert v.confidence == pytest.approx(0.8)


@pytest.mark.parametrize(
    ("clip_class", "expected"),
    [
        ("eggs", Category.EGGS),
        ("feather", Category.FEATHER),
        ("dead", Category.DEAD_BIRD),
        ("in_hand", Category.OTHER),
        ("drawing", Category.OTHER),
    ],
)
def test_content_discards(clip_class, expected):
    v = curate([bird(300, 200, 500, 400)], clip(**{clip_class: 0.9}), 0.5, W, H)
    assert v.category is expected


def test_flock_without_detections_is_flock():
    # Caso real da andorinha: o detector não acha nenhuma ave (pequenas demais),
    # mas o CLIP tem certeza de que é um bando. Tem que ser FLOCK, não OTHER.
    v = curate([], clip(flock=1.0), 0.4, W, H)
    assert v.category is Category.FLOCK
    assert v.bird_count == 0
    assert v.confidence == pytest.approx(1.0)


def test_flock_by_clip_with_one_detected_bird():
    v = curate([bird(10, 10, 60, 60)], clip(flock=0.9, single=0.1), 0.4, W, H)
    assert v.category is Category.FLOCK


def test_no_bird_when_clip_agrees():
    v = curate([], clip(no_bird=0.7), 0.3, W, H)
    assert v.category is Category.NO_BIRD
    assert v.confidence == pytest.approx(0.7)


def test_no_detection_without_clip_agreement_is_other():
    v = curate([], clip(single=0.6, no_bird=0.2), 0.3, W, H)
    assert v.category is Category.OTHER
    assert v.confidence == pytest.approx(0.8)  # 1 - no_bird


def test_strong_no_bird_with_weak_detection_is_no_bird():
    v = curate([bird(0, 0, 50, 50, score=0.55)], clip(no_bird=0.9), 0.3, W, H)
    assert v.category is Category.NO_BIRD


def test_strong_no_bird_with_confident_detection_keeps_bird():
    v = curate([bird(200, 150, 600, 450, score=0.95)], clip(no_bird=0.9, single=0.1), 0.3, W, H)
    assert v.category is Category.SINGLE_BIRD


def test_couple_side_by_side_is_flock():
    v = curate([bird(100, 100, 300, 400), bird(400, 100, 620, 400)], clip(single=0.5, flock=0.3), 0.5, W, H)
    assert v.category is Category.FLOCK
    assert v.bird_count == 2


def test_dominant_bird_with_small_one_behind_is_single():
    # A maior ocupa 300x300 = 90 000 px²; a do fundo, 100x100 = 10 000 px² (9x menor).
    v = curate([bird(100, 100, 400, 400), bird(600, 50, 700, 150, score=0.6)], clip(single=0.8), 0.6, W, H)
    assert v.category is Category.SINGLE_BIRD
    assert v.bird_count == 2


def test_dominance_threshold_is_respected():
    # Segunda ave com exatamente 1/DOMINANCE da área: ainda conta como dominante.
    big = bird(0, 0, 400, 400)  # 160 000
    side = (160_000 / config.DOMINANCE) ** 0.5
    small = bird(500, 0, 500 + side, side)
    v = curate([big, small], clip(single=0.8), 0.6, W, H)
    assert v.category is Category.SINGLE_BIRD


def test_close_up_touching_edge_is_single_and_cut():
    # Caso real da arara-azul: a caixa vai de x=0 a 713 numa foto de 706 px de largura.
    v = curate([bird(0, 53, 713, 703, score=0.97)], clip(single=1.0), 0.8, 706, 800)
    assert v.category is Category.SINGLE_BIRD
    assert v.largest_bird_cut is True
    assert v.largest_bird_area <= 1.0


def test_bird_inside_edge_tolerance_is_cut():
    margin = config.EDGE_TOLERANCE * W / 2  # metade da tolerância: encosta
    v = curate([bird(margin, 200, 400, 400)], clip(single=0.9), 0.5, W, H)
    assert v.largest_bird_cut is True


def test_bird_outside_edge_tolerance_is_not_cut():
    margin = config.EDGE_TOLERANCE * W * 2  # o dobro da tolerância: não encosta
    v = curate([bird(margin, 200, 400, 400)], clip(single=0.9), 0.5, W, H)
    assert v.largest_bird_cut is False


def test_box_outside_image_is_clamped():
    box = clamp_box(Box(-20, -10, 900, 700, 0.9), W, H)
    assert (box.x0, box.y0, box.x1, box.y1) == (0, 0, W, H)
    v = curate([Box(-20, -10, 900, 700, 0.9)], clip(single=0.9), 0.5, W, H)
    assert v.largest_bird_area == pytest.approx(1.0)


def test_largest_box_picks_biggest_area():
    small, big = bird(0, 0, 10, 10), bird(0, 0, 100, 100)
    assert largest_box([small, big]) is big
    assert largest_box([]) is None
```

Run: `uv run pytest tests/test_rules.py -q`
Expected: FAIL com `ModuleNotFoundError: No module named 'photo_curator'`.

- [ ] **Step 5: Escrever `types.py`, `config.py` e `rules.py`**

`src/photo_curator/__init__.py`:

```python
"""passarim-photo-curator: classifica fotos de aves para o Passarim (ver README)."""
```

`src/photo_curator/types.py`:

```python
"""Tipos que circulam dentro do curador.

Quem usa: rules.py (a decisão), server.py (converte de/para o contrato gRPC),
detector.py e zeroshot.py (produzem Box e as probabilidades do CLIP).

"dataclass(frozen=True)" cria uma classe só com dados, imutável: depois de
criada, ninguém muda os campos por engano no meio do caminho.
"""

import enum
from dataclasses import dataclass


class Category(enum.IntEnum):
    """O que a foto mostra. Os números são os mesmos do enum PhotoCategory do
    contrato (passarim.curator.v1), para a conversão ser direta: Category(3) é NEST.
    IntEnum é um enum que também se comporta como número inteiro."""

    UNSPECIFIED = 0
    SINGLE_BIRD = 1
    FLOCK = 2
    NEST = 3
    EGGS = 4
    FEATHER = 5
    DEAD_BIRD = 6
    NO_BIRD = 7
    OTHER = 8


# As "classes" do CLIP: cada uma tem algumas frases (ver zeroshot.py) e recebe
# uma probabilidade. Não são as mesmas categorias do contrato: "in_hand" e
# "drawing" viram OTHER, e "single" e "flock" ajudam a confirmar o detector.
CLIP_CLASSES: tuple[str, ...] = (
    "single",
    "flock",
    "nest",
    "eggs",
    "feather",
    "dead",
    "in_hand",
    "drawing",
    "no_bird",
)


@dataclass(frozen=True)
class Box:
    """A caixa de uma ave achada pelo detector, em pixels da foto: (x0, y0) é o
    canto de cima à esquerda e (x1, y1) o de baixo à direita. score é a confiança
    do detector, de 0 a 1."""

    x0: float
    y0: float
    x1: float
    y1: float
    score: float

    @property
    def area(self) -> float:
        """Área em pixels² (zero se a caixa estiver "virada")."""
        return max(0.0, self.x1 - self.x0) * max(0.0, self.y1 - self.y0)


@dataclass(frozen=True)
class Verdict:
    """O veredito de uma foto; espelha o PhotoVerdict do contrato, sem o photo_id
    (quem conhece o id é o servidor)."""

    category: Category
    bird_count: int
    largest_bird_area: float
    largest_bird_cut: bool
    sharpness: float
    confidence: float
```

`src/photo_curator/config.py`:

```python
"""Limites da regra de decisão e constantes do serviço.

Os limites abaixo são o ponto de partida. O plano A2 os calibra no conjunto
de referência (metade de calibração) e atualiza este arquivo: por isso eles
ficam todos aqui, num lugar só, e não espalhados pelo código.

Quem usa: rules.py, detector.py, sharpness.py e server.py.
"""

# Versão dos modelos + da regra. Muda quando um modelo, uma frase do CLIP ou um
# limite muda: o worker grava este texto em cada foto e sabe o que refazer.
MODEL_VERSION = "rtdetr-r50vd+openclip-b32@1"

# Lote máximo por chamada (o contrato diz 8: bem abaixo dos 4 MB do gRPC).
MAX_BATCH = 8

# Detector: só caixas da classe "bird" com confiança a partir daqui contam como ave.
DETECTOR_MIN_SCORE = 0.5

# Descarte por conteúdo: se a probabilidade do CLIP para a classe passa do
# limite, a foto é descartada com a categoria correspondente.
DISCARD_MIN: dict[str, float] = {
    "nest": 0.5,
    "eggs": 0.5,
    "feather": 0.5,
    "dead": 0.5,
    "in_hand": 0.5,
    "drawing": 0.5,
}

# Bando pelo CLIP: a partir daqui é FLOCK, mesmo que o detector ache 0 ou 1 ave.
FLOCK_MIN = 0.6

# Sem ave: com nenhuma detecção, o CLIP precisa dar "no_bird" a partir daqui
# para a foto ser NO_BIRD (senão é OTHER: ave pequena ou escondida).
NO_BIRD_MIN = 0.5

# Detecção falsa: "no_bird" muito forte e a melhor detecção fraca -> NO_BIRD.
NO_BIRD_STRONG = 0.8
WEAK_DETECTION = 0.7

# Dominância: a maior ave com pelo menos DOMINANCE vezes a área da segunda conta
# como "ave sozinha" (cobre o passarinho pequeno no fundo).
DOMINANCE = 4.0

# Borda: a caixa a menos de 2% do lado da foto encosta na borda (ave cortada).
EDGE_TOLERANCE = 0.02

# Nitidez: a variância do Laplaciano (ver sharpness.py) cresce muito de uma foto
# para outra (de 10 a 10 000), então usamos log10 e levamos o intervalo
# [SHARPNESS_LOG_MIN, SHARPNESS_LOG_MAX] para [0, 1].
SHARPNESS_LOG_MIN = 1.0
SHARPNESS_LOG_MAX = 3.5
```

`src/photo_curator/rules.py`:

```python
"""A regra de decisão: transforma o que os modelos viram num veredito.

É o coração do curador, e de propósito é uma função pura: não carrega modelo,
não lê arquivo, não acessa rede. Recebe números e devolve um Verdict. Isso
permite testar cada ramo com casos inventados (tests/test_rules.py).

A ordem dos passos importa e está explicada em curate().
Quem usa: server.py. Depende de: config.py e types.py.
"""

from collections.abc import Mapping, Sequence

from photo_curator import config
from photo_curator.types import Box, Category, Verdict

# Classes do CLIP que descartam a foto, e a categoria que cada uma vira.
_DISCARD_CATEGORY: dict[str, Category] = {
    "nest": Category.NEST,
    "eggs": Category.EGGS,
    "feather": Category.FEATHER,
    "dead": Category.DEAD_BIRD,
    "in_hand": Category.OTHER,
    "drawing": Category.OTHER,
}


def clamp_box(box: Box, width: int, height: int) -> Box:
    """Prende a caixa dentro da foto. O detector às vezes devolve coordenadas um
    pouco fora (negativas ou maiores que a foto); sem isso a área passaria de 1."""
    return Box(
        x0=min(max(box.x0, 0.0), width),
        y0=min(max(box.y0, 0.0), height),
        x1=min(max(box.x1, 0.0), width),
        y1=min(max(box.y1, 0.0), height),
        score=box.score,
    )


def largest_box(boxes: Sequence[Box]) -> Box | None:
    """A caixa de maior área, ou None se não houver nenhuma."""
    return max(boxes, key=lambda b: b.area, default=None)


def _touches_edge(box: Box, width: int, height: int) -> bool:
    """A caixa encosta na borda? "Encostar" é ficar a menos de EDGE_TOLERANCE
    (2%) do lado da foto, porque o detector raramente acerta o pixel exato."""
    mx, my = config.EDGE_TOLERANCE * width, config.EDGE_TOLERANCE * height
    return box.x0 <= mx or box.y0 <= my or box.x1 >= width - mx or box.y1 >= height - my


def _has_dominant(boxes: Sequence[Box]) -> bool:
    """Com duas aves ou mais, a maior é "dominante" se tem pelo menos DOMINANCE
    vezes a área da segunda maior."""
    areas = sorted((b.area for b in boxes), reverse=True)
    return areas[0] >= config.DOMINANCE * areas[1]


def curate(
    boxes: Sequence[Box],
    clip: Mapping[str, float],
    sharpness: float,
    width: int,
    height: int,
) -> Verdict:
    """Decide a categoria de uma foto.

    boxes: as aves achadas pelo detector (já filtradas por DETECTOR_MIN_SCORE).
    clip: probabilidade de cada classe do CLIP (somam 1).
    sharpness: nitidez da maior ave (ou da foto), de 0 a 1.
    width, height: tamanho da foto em pixels.

    A ordem dos passos:
    1. Descarte por conteúdo (ninho, ovos, pena, morta, na mão, ilustração). Vem
       primeiro porque um ninho com filhote também tem "uma ave" para o detector.
    2. Bando pelo CLIP. Vem antes do "sem ave" porque, num bando no fio, as aves
       são pequenas demais e o detector não acha nenhuma (caso real da andorinha).
    3. Nenhuma ave detectada: NO_BIRD se o CLIP concorda, senão OTHER.
    4. Detecção falsa: CLIP com "sem ave" muito forte e detecção fraca -> NO_BIRD.
    5. Duas aves ou mais sem uma dominante: FLOCK (um casal também).
    6. O que sobra: SINGLE_BIRD.
    """
    clamped = [clamp_box(b, width, height) for b in boxes]
    biggest = largest_box(clamped)
    photo_area = float(width * height)

    def verdict(category: Category, confidence: float) -> Verdict:
        # Os campos de tamanho e corte vêm sempre da maior ave, seja qual for a
        # categoria: o worker usa isso na pontuação e no relatório.
        return Verdict(
            category=category,
            bird_count=len(clamped),
            largest_bird_area=biggest.area / photo_area if biggest else 0.0,
            largest_bird_cut=_touches_edge(biggest, width, height) if biggest else False,
            sharpness=sharpness,
            confidence=float(min(max(confidence, 0.0), 1.0)),
        )

    # 1. Descarte por conteúdo: vence a classe de maior probabilidade entre as
    # que passaram do limite.
    passed = [(clip.get(name, 0.0), name) for name in _DISCARD_CATEGORY if clip.get(name, 0.0) >= config.DISCARD_MIN[name]]
    if passed:
        prob, name = max(passed)
        return verdict(_DISCARD_CATEGORY[name], prob)

    # 2. Bando pelo CLIP.
    if clip.get("flock", 0.0) >= config.FLOCK_MIN:
        return verdict(Category.FLOCK, clip["flock"])

    # 3. Nenhuma ave detectada.
    if biggest is None:
        no_bird = clip.get("no_bird", 0.0)
        if no_bird >= config.NO_BIRD_MIN:
            return verdict(Category.NO_BIRD, no_bird)
        # OTHER: o CLIP acha que há algo além de paisagem; a confiança é o quanto
        # ele NÃO acha que é paisagem.
        return verdict(Category.OTHER, 1.0 - no_bird)

    # 4. Detecção falsa.
    best_score = max(b.score for b in clamped)
    if clip.get("no_bird", 0.0) >= config.NO_BIRD_STRONG and best_score < config.WEAK_DETECTION:
        return verdict(Category.NO_BIRD, clip["no_bird"])

    # 5. Bando pelo detector.
    if len(clamped) >= 2 and not _has_dominant(clamped):
        return verdict(Category.FLOCK, min(clip.get("flock", 0.0) + clip.get("single", 0.0), biggest.score))

    # 6. Ave sozinha: a confiança é a menor entre o CLIP ("single") e o detector.
    return verdict(Category.SINGLE_BIRD, min(clip.get("single", 0.0), biggest.score))
```

- [ ] **Step 6: Rodar e ver passar**

Run: `uv run pytest tests/test_rules.py -q && uv run ruff check . && uv run ruff format --check .`
Expected: todos os testes passam, e o ruff não aponta nada. Se o `ruff format --check` acusar, rodar `uv run ruff format .` e conferir o diff.

- [ ] **Step 7: Commit**

```bash
git add -A && git -c user.name=velosobr -c user.email=linoc.veloso@gmail.com commit -m "feat: projeto e regra de decisão do curador" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb"
```

### Task 4: Nitidez e agregação das frases do CLIP

**Files:**
- Create: `src/photo_curator/sharpness.py`
- Create: `src/photo_curator/prompts.py`
- Test: `tests/test_sharpness.py`, `tests/test_prompts.py`

**Interfaces:**
- Consumes: `Box` e `CLIP_CLASSES` (Task 3), `config.SHARPNESS_LOG_MIN/MAX` (Task 3).
- Produces:
  - `sharpness.measure(image: PIL.Image.Image, box: Box | None) -> float` (de 0 a 1);
  - `prompts.PROMPTS: dict[str, tuple[str, ...]]`, com uma entrada para cada classe de `CLIP_CLASSES`;
  - `prompts.flat_prompts() -> list[str]`;
  - `prompts.aggregate(prompt_probs: Sequence[float]) -> dict[str, float]`.

- [ ] **Step 1: Escrever os testes (falham)**

`tests/test_sharpness.py`:

```python
"""Testes da medida de nitidez. Usamos imagens sintéticas: um tabuleiro de
xadrez (bordas fortes, muito nítido) e um cinza liso (nenhuma borda)."""

import numpy as np
from PIL import Image, ImageFilter

from photo_curator.sharpness import measure
from photo_curator.types import Box


def checkerboard(size: int = 200, cell: int = 10) -> Image.Image:
    yy, xx = np.indices((size, size))
    board = (((xx // cell) + (yy // cell)) % 2 * 255).astype(np.uint8)
    return Image.fromarray(board).convert("RGB")


def test_sharp_image_scores_higher_than_blurred():
    sharp = checkerboard()
    blurred = sharp.filter(ImageFilter.GaussianBlur(radius=4))
    assert measure(sharp, None) > measure(blurred, None)


def test_flat_image_is_zero_and_values_stay_in_range():
    flat = Image.new("RGB", (100, 100), (128, 128, 128))
    assert measure(flat, None) == 0.0
    assert 0.0 <= measure(checkerboard(), None) <= 1.0


def test_measures_only_inside_the_box():
    # Metade de cima nítida, metade de baixo lisa: a caixa na metade lisa dá 0.
    img = checkerboard(200)
    img.paste((128, 128, 128), (0, 100, 200, 200))
    assert measure(img, Box(0, 120, 200, 200, 0.9)) == 0.0
    assert measure(img, Box(0, 0, 200, 90, 0.9)) > 0.5


def test_sharpness_box_outside_image():
    # Caixa fora da foto (o detector às vezes erra): não pode quebrar.
    assert 0.0 <= measure(checkerboard(), Box(-50, -50, 900, 900, 0.9)) <= 1.0


def test_tiny_box_falls_back_to_whole_image():
    # Uma caixa de 1 px não tem vizinhos para o Laplaciano: usa a foto inteira.
    assert measure(checkerboard(), Box(10, 10, 11, 11, 0.9)) == measure(checkerboard(), None)
```

`tests/test_prompts.py`:

```python
"""Testes da agregação das frases do CLIP em classes."""

import pytest

from photo_curator.prompts import PROMPTS, aggregate, flat_prompts
from photo_curator.types import CLIP_CLASSES


def test_every_clip_class_has_prompts():
    assert tuple(PROMPTS) == CLIP_CLASSES
    assert all(len(texts) >= 1 for texts in PROMPTS.values())


def test_flat_prompts_follow_class_order():
    expected = [t for name in CLIP_CLASSES for t in PROMPTS[name]]
    assert flat_prompts() == expected


def test_aggregate_sums_probabilities_per_class():
    n = len(flat_prompts())
    probs = [0.0] * n
    # Toda a probabilidade nas frases de "eggs".
    start = sum(len(PROMPTS[c]) for c in CLIP_CLASSES[: CLIP_CLASSES.index("eggs")])
    for i in range(len(PROMPTS["eggs"])):
        probs[start + i] = 1.0 / len(PROMPTS["eggs"])
    scores = aggregate(probs)
    assert scores["eggs"] == pytest.approx(1.0)
    assert sum(scores.values()) == pytest.approx(1.0)
    assert set(scores) == set(CLIP_CLASSES)


def test_aggregate_rejects_wrong_length():
    with pytest.raises(ValueError):
        aggregate([1.0])
```

Run: `uv run pytest tests/test_sharpness.py tests/test_prompts.py -q`
Expected: FAIL com `ModuleNotFoundError: No module named 'photo_curator.sharpness'`.

- [ ] **Step 2: Escrever `sharpness.py`**

```python
"""Nitidez da foto (ou da maior ave), de 0 a 1.

Como medimos: aplicamos o Laplaciano, uma conta que olha cada pixel e os 4
vizinhos (cima, baixo, esquerda, direita) e dá um número alto onde há borda
forte e perto de zero onde a imagem é lisa. Numa foto nítida, as bordas são
fortes e esse número varia muito de pixel para pixel; numa foto borrada, quase
não varia. A "variância do Laplaciano" mede justamente essa variação.

Como a variância vai de ~10 (borrada) a ~10 000 (muito nítida), usamos log10 e
levamos o intervalo [SHARPNESS_LOG_MIN, SHARPNESS_LOG_MAX] do config para 0..1.

Quem usa: server.py, uma vez por foto, no recorte da maior ave.
"""

import math

import numpy as np
from PIL import Image

from photo_curator import config
from photo_curator.rules import clamp_box
from photo_curator.types import Box

# Abaixo disso, a caixa não tem pixels vizinhos suficientes: usa a foto inteira.
_MIN_CROP_SIDE = 3


def _laplacian_variance(gray: np.ndarray) -> float:
    """Variância do Laplaciano de uma imagem em tons de cinza (array 2D)."""
    g = gray.astype(np.float64)
    # Laplaciano com o "kernel" de 4 vizinhos: 4*centro - cima - baixo - esq - dir.
    # Fatiar o array evita laços em Python (numpy faz a conta toda de uma vez).
    lap = 4 * g[1:-1, 1:-1] - g[:-2, 1:-1] - g[2:, 1:-1] - g[1:-1, :-2] - g[1:-1, 2:]
    return float(lap.var())


def measure(image: Image.Image, box: Box | None) -> float:
    """Nitidez de 0 a 1 do recorte da caixa (ou da foto inteira, se box é None)."""
    crop = image
    if box is not None:
        b = clamp_box(box, image.width, image.height)
        if b.x1 - b.x0 >= _MIN_CROP_SIDE and b.y1 - b.y0 >= _MIN_CROP_SIDE:
            crop = image.crop((int(b.x0), int(b.y0), int(b.x1), int(b.y1)))
    gray = np.asarray(crop.convert("L"))
    if gray.shape[0] < _MIN_CROP_SIDE or gray.shape[1] < _MIN_CROP_SIDE:
        return 0.0
    variance = _laplacian_variance(gray)
    if variance <= 0:
        return 0.0
    span = config.SHARPNESS_LOG_MAX - config.SHARPNESS_LOG_MIN
    normalized = (math.log10(variance) - config.SHARPNESS_LOG_MIN) / span
    return min(max(normalized, 0.0), 1.0)
```

- [ ] **Step 3: Escrever `prompts.py`**

```python
"""As frases do CLIP para cada classe e a soma das probabilidades por classe.

Como o CLIP classifica "sem treino" (zero-shot): ele transforma a foto e cada
frase em vetores, num mesmo "espaço", e mede o quanto a foto se parece com cada
frase. Aplicando softmax nessas semelhanças (uma conta que transforma números
quaisquer em probabilidades que somam 1), temos a probabilidade de cada frase.

Cada classe tem algumas frases, para não depender de uma palavra só. A
probabilidade da classe é a SOMA das probabilidades das suas frases, num
softmax único sobre todas as frases de todas as classes.

As frases são em inglês porque o CLIP foi treinado com legendas em inglês.
O plano A2 pode ajustá-las na calibração; mudar uma frase muda MODEL_VERSION.

Quem usa: zeroshot.py (o modelo de verdade) e os testes.
"""

from collections.abc import Sequence

from photo_curator.types import CLIP_CLASSES

PROMPTS: dict[str, tuple[str, ...]] = {
    "single": ("a photo of a single bird", "a close-up photo of a bird perched"),
    "flock": ("a photo of a flock of birds", "many birds on a wire"),
    "nest": ("a bird nest", "a nest with chicks"),
    "eggs": ("bird eggs in a nest", "a clutch of eggs"),
    "feather": ("a single feather on the ground", "a bird feather"),
    "dead": ("a dead bird", "a bird carcass"),
    "in_hand": ("a bird held in a human hand", "a bird being banded"),
    "drawing": ("a drawing or illustration of a bird", "a photo of a camera screen"),
    "no_bird": ("a photo of a landscape with no animals", "a photo of trees"),
}


def flat_prompts() -> list[str]:
    """Todas as frases numa lista só, na ordem de CLIP_CLASSES (é a ordem em
    que o CLIP as recebe e devolve as probabilidades)."""
    return [text for name in CLIP_CLASSES for text in PROMPTS[name]]


def aggregate(prompt_probs: Sequence[float]) -> dict[str, float]:
    """Soma as probabilidades das frases de cada classe.

    prompt_probs vem do softmax sobre flat_prompts(), na mesma ordem.
    """
    expected = len(flat_prompts())
    if len(prompt_probs) != expected:
        raise ValueError(f"esperava {expected} probabilidades, recebi {len(prompt_probs)}")
    scores: dict[str, float] = {}
    i = 0
    for name in CLIP_CLASSES:
        n = len(PROMPTS[name])
        scores[name] = float(sum(prompt_probs[i : i + n]))
        i += n
    return scores
```

- [ ] **Step 4: Rodar e ver passar**

Run: `uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
Expected: todos os testes passam.

- [ ] **Step 5: Commit**

```bash
git add -A && git -c user.name=velosobr -c user.email=linoc.veloso@gmail.com commit -m "feat: nitidez e frases do CLIP" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb"
```

### Task 5: Servidor gRPC com modelos falsos

**Files:**
- Create: `src/photo_curator/models.py` (as interfaces)
- Create: `src/photo_curator/server.py`
- Test: `tests/test_server.py`

**Interfaces:**
- Consumes:
  - `curate` (Task 3);
  - `measure` (Task 4);
  - `Category`, `Box` e `Verdict` (Task 3);
  - `config.MAX_BATCH` e `config.MODEL_VERSION`;
  - `curator_pb2` e `curator_pb2_grpc` (Task 1, `passarim.curator.v1`).
- Produces:
  - `models.Detector`, um `Protocol` com o método `detect(self, image: Image.Image) -> list[Box]`;
  - `models.ZeroShot`, um `Protocol` com o método `classify(self, image: Image.Image) -> dict[str, float]`;
  - `server.CuratorServicer(detector: Detector, zeroshot: ZeroShot, model_version: str = config.MODEL_VERSION)`;
  - `server.build_server(servicer: CuratorServicer, address: str, max_workers: int = 2) -> tuple[grpc.Server, int]`, que devolve o servidor (ainda não iniciado) e a porta ligada.

- [ ] **Step 1: Escrever os testes (falham)**

`tests/test_server.py`:

```python
"""Testes do servidor gRPC com modelos FALSOS.

Por que falsos: os modelos de verdade levam ~1 s por foto e precisam de ~600 MB
de pesos. Aqui queremos testar o servidor (lote, ordem, erros, health check),
não os modelos. Os falsos devolvem respostas fixas escolhidas pelo tamanho da
imagem, que cada teste controla.

O servidor sobe de verdade numa porta livre do localhost, e o teste conversa
com ele pelo cliente gerado do contrato (passarim.curator.v1): isso também testa
o contrato de ponta a ponta.
"""

import io

import grpc
import pytest
from grpc_health.v1 import health_pb2, health_pb2_grpc
from passarim.curator.v1 import curator_pb2, curator_pb2_grpc
from PIL import Image

from photo_curator.server import CuratorServicer, build_server
from photo_curator.types import CLIP_CLASSES, Box


def webp(width: int, height: int) -> bytes:
    """Uma imagem WebP lisa do tamanho pedido (o tamanho é a "chave" dos falsos)."""
    buf = io.BytesIO()
    Image.new("RGB", (width, height), (90, 120, 60)).save(buf, format="WEBP")
    return buf.getvalue()


def clip(**probs: float) -> dict[str, float]:
    scores = dict.fromkeys(CLIP_CLASSES, 0.0)
    scores.update(probs)
    return scores


class FakeDetector:
    """Detector falso: a resposta depende da largura da imagem."""

    def detect(self, image):
        return {
            400: [Box(100, 100, 300, 250, 0.95)],  # uma ave
            401: [],  # nada
        }.get(image.width, [])


class FakeZeroShot:
    def classify(self, image):
        return {
            400: clip(single=0.9),
            401: clip(eggs=0.95),
        }.get(image.width, clip(no_bird=0.9))


@pytest.fixture
def stub():
    server, port = build_server(CuratorServicer(FakeDetector(), FakeZeroShot(), "teste@1"), "127.0.0.1:0")
    server.start()
    channel = grpc.insecure_channel(f"127.0.0.1:{port}")
    yield curator_pb2_grpc.PhotoCuratorServiceStub(channel), channel
    channel.close()
    server.stop(grace=None)


def request(*photos: tuple[str, bytes]) -> curator_pb2.ClassifyPhotosRequest:
    return curator_pb2.ClassifyPhotosRequest(photos=[curator_pb2.PhotoInput(photo_id=i, image=b) for i, b in photos])


def test_classifies_in_request_order(stub):
    client, _ = stub
    resp = client.ClassifyPhotos(request(("a", webp(400, 300)), ("b", webp(401, 300))))
    assert resp.model_version == "teste@1"
    assert [v.photo_id for v in resp.verdicts] == ["a", "b"]
    assert resp.verdicts[0].category == curator_pb2.PHOTO_CATEGORY_SINGLE_BIRD
    assert resp.verdicts[0].bird_count == 1
    assert resp.verdicts[1].category == curator_pb2.PHOTO_CATEGORY_EGGS


def test_bad_image_does_not_break_batch(stub):
    client, _ = stub
    resp = client.ClassifyPhotos(request(("a", webp(400, 300)), ("ruim", b"isto nao e imagem"), ("c", webp(401, 300))))
    assert [v.photo_id for v in resp.verdicts] == ["a", "ruim", "c"]
    assert resp.verdicts[1].category == curator_pb2.PHOTO_CATEGORY_UNSPECIFIED
    assert resp.verdicts[0].category == curator_pb2.PHOTO_CATEGORY_SINGLE_BIRD
    assert resp.verdicts[2].category == curator_pb2.PHOTO_CATEGORY_EGGS


@pytest.mark.parametrize("size", [0, 9])
def test_empty_or_too_big_batch_is_invalid_argument(stub, size):
    client, _ = stub
    photos = [(str(i), webp(400, 300)) for i in range(size)]
    with pytest.raises(grpc.RpcError) as err:
        client.ClassifyPhotos(request(*photos))
    assert err.value.code() == grpc.StatusCode.INVALID_ARGUMENT


def test_eight_photos_is_accepted(stub):
    client, _ = stub
    resp = client.ClassifyPhotos(request(*[(str(i), webp(400, 300)) for i in range(8)]))
    assert len(resp.verdicts) == 8


def test_health_check_reports_serving(stub):
    _, channel = stub
    health = health_pb2_grpc.HealthStub(channel)
    for service in ("", "passarim.curator.v1.PhotoCuratorService"):
        resp = health.Check(health_pb2.HealthCheckRequest(service=service))
        assert resp.status == health_pb2.HealthCheckResponse.SERVING
```

Run: `uv run pytest tests/test_server.py -q`
Expected: FAIL com `ModuleNotFoundError: No module named 'photo_curator.server'`.

- [ ] **Step 2: Escrever `models.py`**

```python
"""As interfaces dos modelos, separadas da implementação.

Protocol (do módulo typing) descreve "o que um objeto precisa saber fazer",
sem herança: qualquer classe com um método detect(image) -> list[Box] serve
como Detector. O servidor depende só dessas interfaces. Em produção, quem as
cumpre são detector.py e zeroshot.py; nos testes, classes falsas e rápidas.
"""

from typing import Protocol

from PIL import Image

from photo_curator.types import Box


class Detector(Protocol):
    def detect(self, image: Image.Image) -> list[Box]:
        """Devolve as caixas das aves (só classe "bird", já filtradas pela
        confiança mínima), em pixels da imagem recebida."""
        ...


class ZeroShot(Protocol):
    def classify(self, image: Image.Image) -> dict[str, float]:
        """Devolve a probabilidade de cada classe de CLIP_CLASSES (somam 1)."""
        ...
```

- [ ] **Step 3: Escrever `server.py`**

```python
"""O servidor gRPC do curador.

O que faz, para cada chamada ClassifyPhotos:
1. confere o tamanho do lote (1 a 8 fotos; fora disso, INVALID_ARGUMENT);
2. para cada foto: abre o WebP, roda o detector e o CLIP, mede a nitidez da
   maior ave e chama a regra (rules.curate);
3. devolve os vereditos na ordem do pedido.

Uma foto que não abre vira PHOTO_CATEGORY_UNSPECIFIED e o lote segue: o erro é
da foto, não do lote, e derrubar tudo faria o worker tentar de novo para sempre.

gRPC em Python: o servidor tem um "pool" de threads; cada chamada roda numa
thread. Usamos 2 (o trabalho é de CPU e o worker manda um lote por vez); as
chamadas a mais esperam na fila do gRPC.

Também registra o health check padrão do gRPC (grpc.health.v1), que o compose
e o worker usam para saber se o curador está de pé.

Quem usa: __main__.py (produção) e tests/test_server.py.
Depende de: o contrato gerado (passarim.curator.v1), rules, sharpness, models.
"""

import io
import logging
from concurrent import futures

import grpc
from grpc_health.v1 import health, health_pb2, health_pb2_grpc
from passarim.curator.v1 import curator_pb2, curator_pb2_grpc
from PIL import Image, UnidentifiedImageError

from photo_curator import config
from photo_curator.models import Detector, ZeroShot
from photo_curator.rules import curate, largest_box
from photo_curator.sharpness import measure
from photo_curator.types import Category, Verdict

log = logging.getLogger(__name__)

# Nome completo do serviço, como o health check o conhece.
SERVICE_NAME = curator_pb2.DESCRIPTOR.services_by_name["PhotoCuratorService"].full_name

_UNREADABLE = Verdict(Category.UNSPECIFIED, 0, 0.0, False, 0.0, 0.0)


class CuratorServicer(curator_pb2_grpc.PhotoCuratorServiceServicer):
    """Implementa o PhotoCuratorService. Herda da classe gerada, que já sabe
    receber e responder pelo gRPC; aqui só preenchemos o método."""

    def __init__(self, detector: Detector, zeroshot: ZeroShot, model_version: str = config.MODEL_VERSION):
        self._detector = detector
        self._zeroshot = zeroshot
        self._model_version = model_version

    def ClassifyPhotos(self, request, context):  # noqa: N802 (nome vem do contrato)
        n = len(request.photos)
        if not 1 <= n <= config.MAX_BATCH:
            # context.abort encerra a chamada com o código de erro do gRPC.
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, f"lote com {n} fotos; o limite é de 1 a {config.MAX_BATCH}")
        verdicts = [self._classify_one(p.photo_id, p.image) for p in request.photos]
        return curator_pb2.ClassifyPhotosResponse(verdicts=verdicts, model_version=self._model_version)

    def _classify_one(self, photo_id: str, data: bytes) -> curator_pb2.PhotoVerdict:
        try:
            image = Image.open(io.BytesIO(data))
            image.load()  # força a leitura agora, para o erro aparecer aqui
            image = image.convert("RGB")
        except (UnidentifiedImageError, OSError, ValueError):
            log.warning("foto %s não abriu; veredito UNSPECIFIED", photo_id)
            return _to_proto(photo_id, _UNREADABLE)
        boxes = self._detector.detect(image)
        scores = self._zeroshot.classify(image)
        sharpness = measure(image, largest_box(boxes))
        return _to_proto(photo_id, curate(boxes, scores, sharpness, image.width, image.height))


def _to_proto(photo_id: str, v: Verdict) -> curator_pb2.PhotoVerdict:
    """Converte o Verdict interno na mensagem do contrato. Category tem os mesmos
    números do enum do contrato, então int(v.category) basta."""
    return curator_pb2.PhotoVerdict(
        photo_id=photo_id,
        category=int(v.category),
        bird_count=v.bird_count,
        largest_bird_area=v.largest_bird_area,
        largest_bird_cut=v.largest_bird_cut,
        sharpness=v.sharpness,
        confidence=v.confidence,
    )


def build_server(servicer: CuratorServicer, address: str, max_workers: int = 2) -> tuple[grpc.Server, int]:
    """Monta o servidor (sem iniciar) e devolve (servidor, porta).

    address "0.0.0.0:50061" em produção; "127.0.0.1:0" nos testes (a porta 0
    pede ao sistema uma porta livre, devolvida por add_insecure_port).
    "insecure" = sem TLS: o curador só é acessível na rede interna do compose.
    """
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=max_workers))
    curator_pb2_grpc.add_PhotoCuratorServiceServicer_to_server(servicer, server)
    health_servicer = health.HealthServicer()
    health_pb2_grpc.add_HealthServicer_to_server(health_servicer, server)
    # "" é o status geral do servidor; SERVICE_NAME, o do nosso serviço.
    for name in ("", SERVICE_NAME):
        health_servicer.set(name, health_pb2.HealthCheckResponse.SERVING)
    port = server.add_insecure_port(address)
    return server, port
```

- [ ] **Step 4: Rodar e ver passar**

Run: `uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
Expected: todos os testes passam.

- [ ] **Step 5: CI do repositório (lint, testes e gitleaks)**

`.github/workflows/ci.yml`:

```yaml
# CI do curador. Roda em todo PR e em todo push na main.
# - test: ruff (estilo e erros) e pytest (sem os testes que precisam dos pesos);
# - security: gitleaks procura segredos no histórico do git.
# Os jobs com os modelos de verdade e a imagem Docker entram no PR seguinte.
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      # setup-uv instala o uv; "enable-cache" guarda os pacotes baixados entre
      # execuções (o torch tem centenas de MB).
      - uses: astral-sh/setup-uv@v10.3.0
        with:
          version: "0.13.1"
          enable-cache: true
      # --frozen: instala exatamente o uv.lock e falha se ele estiver desatualizado.
      - run: uv sync --frozen
      - run: uv run ruff check .
      - run: uv run ruff format --check .
      - run: uv run pytest -q

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0 # o gitleaks olha o histórico inteiro
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 6: Commit, PR e merge**

```bash
git add -A && git -c user.name=velosobr -c user.email=linoc.veloso@gmail.com commit -m "feat: servidor gRPC do curador e CI" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb"
git push -u origin feat/esqueleto-regra-servidor
gh pr create --base main --title "feat: esqueleto, regra de decisão e servidor gRPC do curador" --body "<resumo; PR 3 da frente A>"
```

Expected: a CI fica verde (`test` e `security`).

---

## Parte 4 — `passarim-photo-curator`, modelos e imagem Docker (PR 4)

### Task 6: Pesos com revisão e hash fixos

**Files:**
- Create: `src/photo_curator/weights.py`
- Test: `tests/test_weights.py`

**Interfaces:**
- Produces:
  - `weights.FILES: tuple[WeightFile, ...]`, onde `WeightFile` tem `repo_id`, `revision`, `filename`, `subdir` e `sha256`;
  - `weights.download(dest: Path) -> None`, que baixa e confere o hash e falha com `RuntimeError` se ele não bater;
  - `weights.verify(dest: Path) -> None`;
  - `weights.RTDETR_SUBDIR = "rtdetr"`;
  - `weights.CLIP_FILE = "clip/open_clip_model.safetensors"`;
  - linha de comando: `python -m photo_curator.weights <pasta>`.

Hashes conferidos em 2026-10-17 a partir das revisões fixadas:

| Arquivo | sha256 |
|---|---|
| `rtdetr/model.safetensors` | `5263d5521eff3e356f6cd8a371fd5dfb891725beda5f713674f79669115cdc64` |
| `rtdetr/config.json` | `2ed2a305c51eef46715eb755a02b2a266ecfb752936cc9574bb5714601c2742d` |
| `rtdetr/preprocessor_config.json` | `ffb4b9461a1dad746be8f0f9c8330ed7743a1ba5fba4f75c232cd281b3d4c64a` |
| `clip/open_clip_model.safetensors` | `ac4f8c4b88af6d963118cbf40ad93176d092abbedfcb752601ae1866352656e6` |

- [ ] **Step 0: Branch do PR 4 (depois do merge do PR 3)**

```bash
git switch main && git pull --ff-only && git switch -c feat/modelos-e-imagem
```

- [ ] **Step 1: Escrever os testes (falham)**

`tests/test_weights.py`:

```python
"""Testes da conferência dos pesos, sem baixar nada: criamos arquivos falsos
numa pasta temporária e conferimos que um hash errado é recusado."""

import hashlib

import pytest

from photo_curator import weights


def test_files_are_pinned():
    for f in weights.FILES:
        assert len(f.revision) == 40  # hash de commit do Hugging Face, nunca "main"
        assert len(f.sha256) == 64


def test_verify_rejects_wrong_hash(tmp_path, monkeypatch):
    fake = weights.WeightFile("x/y", "0" * 40, "a.bin", "sub", hashlib.sha256(b"certo").hexdigest())
    monkeypatch.setattr(weights, "FILES", (fake,))
    (tmp_path / "sub").mkdir()
    (tmp_path / "sub" / "a.bin").write_bytes(b"errado")
    with pytest.raises(RuntimeError, match="sha256"):
        weights.verify(tmp_path)
    (tmp_path / "sub" / "a.bin").write_bytes(b"certo")
    weights.verify(tmp_path)  # não levanta


def test_verify_rejects_missing_file(tmp_path, monkeypatch):
    fake = weights.WeightFile("x/y", "0" * 40, "a.bin", "sub", "0" * 64)
    monkeypatch.setattr(weights, "FILES", (fake,))
    with pytest.raises(RuntimeError, match="falta"):
        weights.verify(tmp_path)
```

Run: `uv run pytest tests/test_weights.py -q`
Expected: FAIL com `ImportError` (`weights` não existe).

- [ ] **Step 2: Escrever `weights.py`**

```python
"""Baixa e confere os pesos dos modelos.

Pesos são os números que o modelo aprendeu no treino (centenas de MB). Eles
ficam DENTRO da imagem Docker: o Dockerfile roda `python -m photo_curator.weights
/opt/models` na hora do build, e em execução o serviço não acessa a internet.

Duas travas garantem que sempre usamos exatamente os mesmos pesos:
- revision: o hash do commit no Hugging Face (nunca "main", que muda);
- sha256: o hash de cada arquivo, conferido depois do download.

Quem usa: o Dockerfile, a CI (job dos modelos) e __main__.py (verify ao subir).
"""

import hashlib
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

RTDETR_SUBDIR = "rtdetr"
CLIP_FILE = "clip/open_clip_model.safetensors"

_RTDETR = ("PekingU/rtdetr_r50vd", "df939e661d8c52e80608d1ec566561aabd25a4e7")
_CLIP = ("laion/CLIP-ViT-B-32-laion2B-s34B-b79K", "1a25a446712ba5ee05982a381eed697ef9b435cf")


@dataclass(frozen=True)
class WeightFile:
    repo_id: str  # repositório no Hugging Face
    revision: str  # commit fixo
    filename: str  # arquivo dentro do repositório
    subdir: str  # pasta de destino dentro de dest
    sha256: str  # hash esperado do arquivo


FILES: tuple[WeightFile, ...] = (
    WeightFile(*_RTDETR, "model.safetensors", RTDETR_SUBDIR, "5263d5521eff3e356f6cd8a371fd5dfb891725beda5f713674f79669115cdc64"),
    WeightFile(*_RTDETR, "config.json", RTDETR_SUBDIR, "2ed2a305c51eef46715eb755a02b2a266ecfb752936cc9574bb5714601c2742d"),
    WeightFile(
        *_RTDETR, "preprocessor_config.json", RTDETR_SUBDIR, "ffb4b9461a1dad746be8f0f9c8330ed7743a1ba5fba4f75c232cd281b3d4c64a"
    ),
    WeightFile(*_CLIP, "open_clip_model.safetensors", "clip", "ac4f8c4b88af6d963118cbf40ad93176d092abbedfcb752601ae1866352656e6"),
)


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):  # lê de 1 MB em 1 MB
            h.update(chunk)
    return h.hexdigest()


def verify(dest: Path) -> None:
    """Confere que todos os arquivos existem e têm o hash esperado."""
    for f in FILES:
        path = dest / f.subdir / f.filename
        if not path.is_file():
            raise RuntimeError(f"falta o arquivo de pesos {path}")
        got = _sha256(path)
        if got != f.sha256:
            raise RuntimeError(f"sha256 de {path} é {got}, esperado {f.sha256}")


def download(dest: Path) -> None:
    """Baixa cada arquivo na revisão fixa para dest/<subdir>/<filename> e confere."""
    # Import aqui dentro: o serviço em execução não precisa do huggingface_hub
    # para nada além deste download (e roda offline).
    from huggingface_hub import hf_hub_download

    for f in FILES:
        target_dir = dest / f.subdir
        target_dir.mkdir(parents=True, exist_ok=True)
        cached = hf_hub_download(f.repo_id, f.filename, revision=f.revision)
        shutil.copyfile(cached, target_dir / f.filename)
    verify(dest)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("uso: python -m photo_curator.weights <pasta>")
    download(Path(sys.argv[1]))
    print(f"pesos baixados e conferidos em {sys.argv[1]}")
```

- [ ] **Step 3: Rodar e ver passar; baixar os pesos de verdade uma vez**

Run: `uv run pytest tests/test_weights.py -q && uv run python -m photo_curator.weights models`
Expected: os testes passam, e o comando termina com `pesos baixados e conferidos em models`. A pasta `models/` está no `.gitignore`.

- [ ] **Step 4: Commit**

```bash
git add -A && git -c user.name=velosobr -c user.email=linoc.veloso@gmail.com commit -m "feat: pesos com revisão e hash fixos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb"
```

### Task 7: Detector e CLIP de verdade, com teste nas fotos reais

**Files:**
- Create: `src/photo_curator/detector.py`, `src/photo_curator/zeroshot.py`
- Create: `tests/fixtures/andorinha-bando.webp`, `tests/fixtures/anu-ovos.webp`, `tests/fixtures/arara-sozinha.webp`
- Create: `tests/fixtures/ATTRIBUTION.md`
- Test: `tests/test_models.py`, com a marca `models`

**Interfaces:**
- Consumes:
  - `models.Detector` e `models.ZeroShot` (Task 5);
  - `weights.RTDETR_SUBDIR` e `weights.CLIP_FILE` (Task 6);
  - `prompts.flat_prompts` e `prompts.aggregate` (Task 4);
  - `config.DETECTOR_MIN_SCORE`.
- Produces:
  - `detector.RtDetrDetector(model_dir: Path)`, que cumpre `Detector`;
  - `detector.BIRD_LABEL = "bird"`;
  - `zeroshot.ClipZeroShot(weights_file: Path)`, que cumpre `ZeroShot`.

- [ ] **Step 1: Copiar as fotos de teste**

As três fotos são as variantes `medium` que o worker gerou e que estão no storage local. As fotos de origem são as `658753271`, `78501041` e `144156085` do iNaturalist. Com o compose do `passarim-docs` de pé:

```bash
mkdir -p tests/fixtures
curl -fsS -o tests/fixtures/andorinha-bando.webp http://localhost:8888/buckets/passarim-media/species/pygochelidon-cyanoleuca/photo-658753271-medium.webp
curl -fsS -o tests/fixtures/anu-ovos.webp http://localhost:8888/buckets/passarim-media/species/crotophaga-ani/photo-78501041-medium.webp
curl -fsS -o tests/fixtures/arara-sozinha.webp http://localhost:8888/buckets/passarim-media/species/anodorhynchus-hyacinthinus/photo-144156085-medium.webp
```

`tests/fixtures/ATTRIBUTION.md`:

```markdown
# Fotos de teste

As fotos desta pasta vêm do iNaturalist e **mantêm a licença de cada uma** (fora da licença do repositório). Foram
reduzidas para 800 px no lado maior e convertidas para WebP pelo worker do passarim-catalog.

| Arquivo | Autor | Licença | Observação |
|---|---|---|---|
| `andorinha-bando.webp` | (c) Davi Fernandes de Sousa Carmo | CC BY-NC | https://www.inaturalist.org/observations/360985180 |
| `anu-ovos.webp` | (c) Henrique_Anizio | CC BY-NC | https://www.inaturalist.org/observations/49451331 |
| `arara-sozinha.webp` | (c) Paul Donahue | CC BY-NC | https://www.inaturalist.org/observations/87436377 |
```

- [ ] **Step 2: Escrever o teste com os modelos de verdade (falha)**

`tests/test_models.py`:

```python
"""Testes com os modelos de VERDADE nas três fotos reais que motivaram a frente A.

Marcados com "models": não rodam no `pytest` comum (ver addopts no
pyproject.toml). Rodam com `pytest -m models` e precisam da variável
CURATOR_MODELS_DIR apontando para a pasta criada por
`python -m photo_curator.weights <pasta>`.
"""

import io
import os
import time
from pathlib import Path

import pytest
from PIL import Image

from photo_curator import config, weights
from photo_curator.detector import RtDetrDetector
from photo_curator.rules import curate, largest_box
from photo_curator.sharpness import measure
from photo_curator.types import Category
from photo_curator.zeroshot import ClipZeroShot

pytestmark = pytest.mark.models
FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="module")
def models():
    root = os.environ.get("CURATOR_MODELS_DIR")
    if not root:
        pytest.skip("defina CURATOR_MODELS_DIR (pasta dos pesos)")
    root = Path(root)
    weights.verify(root)
    return RtDetrDetector(root / weights.RTDETR_SUBDIR), ClipZeroShot(root / weights.CLIP_FILE)


def classify(models, name):
    detector, zeroshot = models
    image = Image.open(FIXTURES / name).convert("RGB")
    boxes = detector.detect(image)
    return curate(boxes, zeroshot.classify(image), measure(image, largest_box(boxes)), image.width, image.height)


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("andorinha-bando.webp", Category.FLOCK),
        ("anu-ovos.webp", Category.EGGS),
        ("arara-sozinha.webp", Category.SINGLE_BIRD),
    ],
)
def test_real_photos(models, name, expected):
    assert classify(models, name).category is expected


def test_detector_only_returns_confident_birds(models):
    detector, _ = models
    boxes = detector.detect(Image.open(FIXTURES / "arara-sozinha.webp").convert("RGB"))
    assert len(boxes) == 1
    assert all(b.score >= config.DETECTOR_MIN_SCORE for b in boxes)


def test_clip_probabilities_sum_to_one(models):
    _, zeroshot = models
    scores = zeroshot.classify(Image.open(FIXTURES / "anu-ovos.webp").convert("RGB"))
    assert sum(scores.values()) == pytest.approx(1.0, abs=1e-4)


def test_batch_of_eight_is_fast_enough(models):
    # 8 fotos (as 3 reais, repetidas) em até 15 s na máquina da CI.
    names = ["andorinha-bando.webp", "anu-ovos.webp", "arara-sozinha.webp"] * 3
    start = time.perf_counter()
    for name in names[:8]:
        classify(models, name)
    assert time.perf_counter() - start < 15.0


def test_webp_bytes_roundtrip(models):
    # Mesmo caminho do servidor: bytes -> Image. Garante que o Pillow lê os WebP do worker.
    data = (FIXTURES / "arara-sozinha.webp").read_bytes()
    assert Image.open(io.BytesIO(data)).format == "WEBP"
```

Run: `CURATOR_MODELS_DIR=models uv run pytest -m models -q`
Expected: FAIL com `ModuleNotFoundError: No module named 'photo_curator.detector'`.

- [ ] **Step 3: Escrever `detector.py`**

```python
"""O detector de aves: RT-DETR R50vd (pelo Hugging Face transformers).

RT-DETR é um detector de objetos: recebe a foto e devolve caixas com a classe
de cada objeto (entre as 80 do conjunto COCO) e a confiança. Usamos só a
classe "bird". Licença: Apache 2.0 (código e pesos). Ultralytics NÃO: é AGPL.

torch.no_grad(): diz ao torch que não vamos treinar, então ele não guarda as
contas intermediárias (gasta menos memória e é mais rápido).

Quem usa: __main__.py. Cumpre a interface models.Detector.
"""

from pathlib import Path

import torch
from PIL import Image
from transformers import RTDetrForObjectDetection, RTDetrImageProcessor

from photo_curator import config
from photo_curator.types import Box

BIRD_LABEL = "bird"


class RtDetrDetector:
    def __init__(self, model_dir: Path):
        # from_pretrained lê de uma PASTA local (os pesos já estão na imagem).
        self._processor = RTDetrImageProcessor.from_pretrained(model_dir)
        self._model = RTDetrForObjectDetection.from_pretrained(model_dir).eval()
        # id2label mapeia número -> nome da classe; achamos o número de "bird"
        # (14 no COCO) em vez de escrever 14 no código.
        labels = self._model.config.id2label
        self._bird_id = next(i for i, name in labels.items() if name == BIRD_LABEL)

    def detect(self, image: Image.Image) -> list[Box]:
        with torch.no_grad():
            inputs = self._processor(images=image, return_tensors="pt")
            outputs = self._model(**inputs)
            # post_process converte a saída crua em caixas na escala da foto
            # original (target_sizes é (altura, largura)) e já corta pela confiança.
            result = self._processor.post_process_object_detection(
                outputs,
                target_sizes=torch.tensor([[image.height, image.width]]),
                threshold=config.DETECTOR_MIN_SCORE,
            )[0]
        return [
            Box(*(float(v) for v in box.tolist()), score=float(score))
            for score, label, box in zip(result["scores"], result["labels"], result["boxes"], strict=True)
            if int(label) == self._bird_id
        ]
```

- [ ] **Step 4: Escrever `zeroshot.py`**

```python
"""A classificação sem treino: OpenCLIP ViT-B/32 com pesos LAION-2B.

O CLIP transforma a foto e cada frase de prompts.py em vetores ("embeddings").
Normalizamos os vetores (tamanho 1) e o produto escalar entre eles vira a
"semelhança" (cosseno). Multiplicamos por 100 (a escala com que o CLIP foi
treinado) e aplicamos softmax para virar probabilidades.

Os vetores das frases não mudam: calculamos uma vez, no __init__.
Licença: MIT (código e pesos). O card do LAION desaconselha uso implantado sem
teste no domínio; o README explica por que o nosso uso é aceitável.

Quem usa: __main__.py. Cumpre a interface models.ZeroShot.
"""

from pathlib import Path

import open_clip
import torch
from PIL import Image

from photo_curator.prompts import aggregate, flat_prompts

ARCHITECTURE = "ViT-B-32"
_LOGIT_SCALE = 100.0


class ClipZeroShot:
    def __init__(self, weights_file: Path):
        # pretrained aceita o caminho de um arquivo local: nada é baixado.
        self._model, _, self._preprocess = open_clip.create_model_and_transforms(
            ARCHITECTURE, pretrained=str(weights_file)
        )
        self._model.eval()
        tokenizer = open_clip.get_tokenizer(ARCHITECTURE)
        with torch.no_grad():
            text = self._model.encode_text(tokenizer(flat_prompts()))
            self._text = text / text.norm(dim=-1, keepdim=True)

    def classify(self, image: Image.Image) -> dict[str, float]:
        with torch.no_grad():
            img = self._model.encode_image(self._preprocess(image).unsqueeze(0))
            img = img / img.norm(dim=-1, keepdim=True)
            probs = (_LOGIT_SCALE * img @ self._text.T).softmax(dim=-1)[0]
        return aggregate(probs.tolist())
```

- [ ] **Step 5: Rodar e ver passar**

Run: `CURATOR_MODELS_DIR=models uv run pytest -m models -q && uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
Expected: os testes com modelos passam (andorinha `FLOCK`, anu `EGGS`, arara `SINGLE_BIRD`, lote de 8 em menos de 15 s), e os outros também.

**Se a andorinha não der `FLOCK`:** com o `feather`, o `dead`, o `in_hand` e o `drawing`, que não existiam no spike de 2026-10-17, o softmax é dividido entre mais frases. Imprimir as probabilidades de cada classe e conferir:
- se o `flock` caiu abaixo de `FLOCK_MIN`, baixar o `FLOCK_MIN` em `config.py` até o menor valor que ainda separa as três fotos, e anotar o valor no commit;
- se outra classe venceu, não mexer nas frases sem registrar o motivo. A calibração de verdade é do plano A2.

- [ ] **Step 6: Commit**

```bash
git add -A && git -c user.name=velosobr -c user.email=linoc.veloso@gmail.com commit -m "feat: detector RT-DETR e CLIP sem treino, testados nas fotos reais" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb"
```

### Task 8: Ponto de entrada, imagem Docker, self-check offline e CI

**Files:**
- Create: `src/photo_curator/__main__.py`
- Create: `src/photo_curator/healthcheck.py`
- Create: `src/photo_curator/selfcheck.py`
- Create: `Dockerfile`, `.dockerignore`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Test: `tests/test_main.py`

**Interfaces:**
- Consumes:
  - `build_server` e `CuratorServicer` (Task 5);
  - `RtDetrDetector` e `ClipZeroShot` (Task 7);
  - `weights.verify`, `RTDETR_SUBDIR` e `CLIP_FILE` (Task 6).
- Produces:
  - `python -m photo_curator`, o servidor, configurado pelas variáveis `PORT` (padrão `50061`) e `MODELS_DIR` (padrão `/opt/models`);
  - `python -m photo_curator.healthcheck`, que sai com 0 se o servidor responde `SERVING`;
  - `python -m photo_curator.selfcheck <pasta de fotos>`, que sobe o servidor no próprio processo, classifica as 3 fixtures e confere as categorias.

- [ ] **Step 1: Escrever o teste do ponto de entrada (falha)**

`tests/test_main.py`:

```python
"""Testes da leitura da configuração do ponto de entrada (sem subir modelos)."""

from pathlib import Path

from photo_curator.__main__ import Settings


def test_defaults():
    s = Settings.from_env({})
    assert s.port == 50061
    assert s.models_dir == Path("/opt/models")


def test_env_overrides():
    s = Settings.from_env({"PORT": "6000", "MODELS_DIR": "/tmp/m"})
    assert s.port == 6000
    assert s.models_dir == Path("/tmp/m")
```

Run: `uv run pytest tests/test_main.py -q`
Expected: FAIL com `ModuleNotFoundError: No module named 'photo_curator.__main__'`.

- [ ] **Step 2: Escrever `__main__.py`, `healthcheck.py` e `selfcheck.py`**

`src/photo_curator/__main__.py`:

```python
"""Ponto de entrada: `python -m photo_curator` sobe o servidor gRPC.

Ordem: lê a configuração das variáveis de ambiente, confere os pesos (hash),
carrega os modelos (alguns segundos) e só então abre a porta. Assim o health
check só responde depois que o serviço consegue de fato classificar.

Variáveis: PORT (padrão 50061) e MODELS_DIR (padrão /opt/models).
"""

import logging
import os
import signal
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from photo_curator import weights
from photo_curator.detector import RtDetrDetector
from photo_curator.server import CuratorServicer, build_server
from photo_curator.zeroshot import ClipZeroShot

log = logging.getLogger("photo_curator")


@dataclass(frozen=True)
class Settings:
    port: int
    models_dir: Path

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> "Settings":
        return cls(port=int(env.get("PORT", "50061")), models_dir=Path(env.get("MODELS_DIR", "/opt/models")))


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = Settings.from_env(os.environ)
    weights.verify(settings.models_dir)
    log.info("carregando modelos de %s", settings.models_dir)
    servicer = CuratorServicer(
        RtDetrDetector(settings.models_dir / weights.RTDETR_SUBDIR),
        ClipZeroShot(settings.models_dir / weights.CLIP_FILE),
    )
    server, port = build_server(servicer, f"0.0.0.0:{settings.port}")
    server.start()
    log.info("curador ouvindo na porta %d", port)
    # SIGTERM é o sinal que o Docker manda no "stop": paramos com 10 s de folga
    # para as chamadas em andamento terminarem.
    signal.signal(signal.SIGTERM, lambda *_: server.stop(grace=10))
    server.wait_for_termination()


if __name__ == "__main__":
    main()
```

`src/photo_curator/healthcheck.py`:

```python
"""Health check para o Docker/compose: `python -m photo_curator.healthcheck`.

Pergunta ao servidor local (grpc.health.v1) se o PhotoCuratorService está
SERVING. Sai com 0 se sim e 1 se não (o Docker marca o container como
"unhealthy"). Usamos Python porque a imagem não tem o grpc_health_probe.
"""

import os
import sys

import grpc
from grpc_health.v1 import health_pb2, health_pb2_grpc

from photo_curator.server import SERVICE_NAME


def main() -> int:
    port = os.environ.get("PORT", "50061")
    try:
        with grpc.insecure_channel(f"127.0.0.1:{port}") as channel:
            resp = health_pb2_grpc.HealthStub(channel).Check(
                health_pb2.HealthCheckRequest(service=SERVICE_NAME), timeout=3
            )
    except grpc.RpcError:
        return 1
    return 0 if resp.status == health_pb2.HealthCheckResponse.SERVING else 1


if __name__ == "__main__":
    sys.exit(main())
```

`src/photo_curator/selfcheck.py`:

```python
"""Self-check da imagem Docker: `python -m photo_curator.selfcheck <pasta>`.

Roda DENTRO do container, de preferência com `--network none --read-only`.
Prova duas coisas de uma vez:
- a imagem tem tudo para classificar sem internet (pesos, bibliotecas);
- as três fotos reais saem com as categorias certas, pelo gRPC de verdade.

A pasta tem andorinha-bando.webp, anu-ovos.webp e arara-sozinha.webp (as
fixtures dos testes, montadas no container como volume só de leitura).
"""

import sys
import time
from pathlib import Path

import grpc
from passarim.curator.v1 import curator_pb2, curator_pb2_grpc

from photo_curator import weights
from photo_curator.__main__ import Settings
from photo_curator.detector import RtDetrDetector
from photo_curator.server import CuratorServicer, build_server
from photo_curator.zeroshot import ClipZeroShot

EXPECTED = {
    "andorinha-bando.webp": curator_pb2.PHOTO_CATEGORY_FLOCK,
    "anu-ovos.webp": curator_pb2.PHOTO_CATEGORY_EGGS,
    "arara-sozinha.webp": curator_pb2.PHOTO_CATEGORY_SINGLE_BIRD,
}


def main(folder: Path) -> int:
    models = Settings.from_env({}).models_dir
    weights.verify(models)
    servicer = CuratorServicer(RtDetrDetector(models / weights.RTDETR_SUBDIR), ClipZeroShot(models / weights.CLIP_FILE))
    server, port = build_server(servicer, "127.0.0.1:0")
    server.start()
    try:
        photos = [curator_pb2.PhotoInput(photo_id=name, image=(folder / name).read_bytes()) for name in EXPECTED]
        # Repete até 8 fotos: o mesmo tamanho de lote que o worker manda.
        photos = (photos * 3)[:8]
        start = time.perf_counter()
        with grpc.insecure_channel(f"127.0.0.1:{port}") as channel:
            resp = curator_pb2_grpc.PhotoCuratorServiceStub(channel).ClassifyPhotos(
                curator_pb2.ClassifyPhotosRequest(photos=photos), timeout=60
            )
        elapsed = time.perf_counter() - start
    finally:
        server.stop(grace=None)
    failures = [
        f"{v.photo_id}: {curator_pb2.PhotoCategory.Name(v.category)}"
        for v in resp.verdicts
        if v.category != EXPECTED[v.photo_id]
    ]
    print(f"lote de {len(photos)} fotos em {elapsed:.1f} s; modelo {resp.model_version}")
    if failures:
        print("categorias erradas:", *failures, sep="\n  ")
        return 1
    if elapsed > 15:
        print("lento demais: o limite é 15 s por lote de 8")
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("uso: python -m photo_curator.selfcheck <pasta com as fotos de teste>")
    sys.exit(main(Path(sys.argv[1])))
```

Run: `uv run pytest -q && CURATOR_MODELS_DIR=models uv run pytest -m models -q && MODELS_DIR=models uv run python -m photo_curator.selfcheck tests/fixtures`
Expected: os testes passam, e o self-check imprime `lote de 8 fotos em X s` e `ok`.

- [ ] **Step 3: `Dockerfile` e `.dockerignore`**

`.dockerignore`:

```
# O que NÃO vai para o contexto do docker build: deixa o build rápido e evita
# copiar o ambiente local, os pesos baixados à mão e os testes.
.venv
models
tests
.git
.github
**/__pycache__
.ruff_cache
.pytest_cache
```

`Dockerfile`:

```dockerfile
# Imagem do curador em dois estágios ("multi-stage"):
# 1) "build": instala as dependências com o uv e baixa os pesos (precisa de
#    internet e do git, para o pacote do contrato que vem do GitHub);
# 2) final: só o Python, o ambiente pronto e os pesos. Sem uv, sem git, sem
#    compilador: menos coisa para ter vulnerabilidade.

FROM python:3.13-slim AS build
# O uv vem da imagem oficial, numa versão fixa.
COPY --from=ghcr.io/astral-sh/uv:0.13.1 /uv /usr/local/bin/uv
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# UV_COMPILE_BYTECODE: já gera os .pyc (a imagem final é só leitura).
# UV_LINK_MODE=copy: copia os pacotes para a .venv em vez de criar links para o cache.
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
# Primeiro só os arquivos de dependência: enquanto eles não mudam, o Docker
# reaproveita esta camada (a mais demorada) entre builds.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev
# Pesos dentro da imagem, na revisão e com o hash conferidos (weights.py).
RUN /app/.venv/bin/python -m photo_curator.weights /opt/models

FROM python:3.13-slim
WORKDIR /app
COPY --from=build /app /app
COPY --from=build /opt/models /opt/models
# Usuário sem privilégios: se alguém explorar uma falha, não vira root.
RUN useradd --system --uid 10001 --no-create-home curator
USER 10001
# Em execução, nada de internet: o Hugging Face fica proibido de baixar.
# HOME=/tmp: o usuário não tem pasta própria e o sistema de arquivos é só de
# leitura; bibliotecas que gravam cache em ~ (torch, matplotlib) usam o tmpfs.
ENV PATH="/app/.venv/bin:$PATH" \
    MODELS_DIR=/opt/models \
    PORT=50061 \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/tmp
EXPOSE 50061
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=3 CMD ["python", "-m", "photo_curator.healthcheck"]
CMD ["python", "-m", "photo_curator"]
```

Run:
```bash
docker build -t passarim-photo-curator:dev .
docker run --rm --network none --read-only --tmpfs /tmp -v "$PWD/tests/fixtures:/fixtures:ro" passarim-photo-curator:dev python -m photo_curator.selfcheck /fixtures
docker image ls passarim-photo-curator:dev --format '{{.Size}}'
```
Expected:
- o self-check imprime `ok`, sem rede e com o sistema de arquivos só de leitura;
- a imagem tem algo perto de 2 GB.

Se alguma biblioteca ainda reclamar de pasta sem permissão de escrita, apontar a variável de cache dela para `/tmp` (ex.: `TORCH_HOME=/tmp/torch`), rodar de novo e anotar o motivo num comentário do Dockerfile.

- [ ] **Step 4: CI com os jobs dos modelos e da imagem**

Em `.github/workflows/ci.yml`, acrescentar dois jobs:
- `models`: baixa os pesos, com cache, e roda `pytest -m models`;
- `image`: build da imagem, self-check sem rede e Trivy.

Acrescentar também ao job `security` o build e o Trivy:

```yaml
  # Testes com os modelos de verdade nas fotos reais (lento: ~600 MB de pesos).
  # O cache guarda a pasta dos pesos; a chave é o hash do weights.py, então ele
  # só baixa de novo quando uma revisão ou um hash muda.
  models:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: astral-sh/setup-uv@v10.3.0
        with:
          version: "0.13.1"
          enable-cache: true
      - run: uv sync --frozen
      - uses: actions/cache@v4
        with:
          path: models
          key: weights-${{ hashFiles('src/photo_curator/weights.py') }}
      - run: uv run python -m photo_curator.weights models
      - run: uv run pytest -m models -q
        env:
          CURATOR_MODELS_DIR: models
```

E dentro de `security`, depois do gitleaks:

```yaml
      - name: build da imagem
        run: docker build -t passarim-photo-curator:ci .
      # A imagem classifica as fotos reais SEM rede e com o sistema de arquivos
      # só de leitura: prova que nada é baixado em execução.
      - name: self-check sem rede
        run: >
          docker run --rm --network none --read-only --tmpfs /tmp
          -v "$PWD/tests/fixtures:/fixtures:ro"
          passarim-photo-curator:ci python -m photo_curator.selfcheck /fixtures
      # Trivy procura vulnerabilidades na imagem. Falha em HIGH/CRITICAL.
      - uses: aquasecurity/trivy-action@v0.36.0
        with:
          image-ref: passarim-photo-curator:ci
          severity: HIGH,CRITICAL
          exit-code: "1"
          ignore-unfixed: true
```

- [ ] **Step 5: README completo**

Substituir o `README.md` por:

````markdown
# passarim-photo-curator

Serviço gRPC, em Python, que classifica fotos de aves para o Passarim: ave sozinha, bando, ninho, ovos, pena, ave
morta, sem ave ou outro. Só o worker do `passarim-catalog` o chama, durante a ingestão; o Passarim no ar não depende
dele.

- Contrato: `passarim.curator.v1.PhotoCuratorService` no [passarim-proto](https://github.com/velosobr/passarim-proto)
  (v0.3.0).
- Decisão: ADR-0021 no `passarim-docs`. Spec: `docs/superpowers/specs/2026-10-17-passarim-frente-a-curadoria-design.md`.

## Por onde começar a ler

1. `src/photo_curator/rules.py`: a regra de decisão (função pura).
2. `src/photo_curator/server.py`: o servidor gRPC.
3. `src/photo_curator/detector.py` e `zeroshot.py`: os modelos.
4. `tests/test_rules.py`: os casos que a regra cobre.

## Modelos e licenças

| Modelo | Uso | Código | Pesos | Revisão |
|---|---|---|---|---|
| RT-DETR R50vd (`PekingU/rtdetr_r50vd`) | Detector, classe "bird" do COCO | Apache 2.0 | Apache 2.0 | `df939e66…` |
| OpenCLIP ViT-B/32 (`laion/CLIP-ViT-B-32-laion2B-s34B-b79K`) | Classificação sem treino | MIT | MIT | `1a25a446…` |

O Ultralytics (YOLO ou o RT-DETR dele) não é usado por ser AGPL.

**Aviso do card do LAION:** o card dos pesos do CLIP desaconselha uso implantado sem teste no domínio. Aqui o uso é
offline, com classes fixas, sem decisões sobre pessoas, medido num conjunto de referência e com revisão humana da foto
principal de cada espécie.

## Rodando

```bash
uv sync                                   # instala tudo (torch só de CPU)
uv run python -m photo_curator.weights models   # baixa e confere os pesos (~600 MB)
uv run pytest                             # testes rápidos (sem pesos)
CURATOR_MODELS_DIR=models uv run pytest -m models   # testes com os modelos de verdade
MODELS_DIR=models uv run python -m photo_curator     # servidor na porta 50061
```

Imagem Docker:

```bash
docker build -t passarim-photo-curator:dev .
docker run --rm --network none --read-only --tmpfs /tmp -v "$PWD/tests/fixtures:/fixtures:ro" \
  passarim-photo-curator:dev python -m photo_curator.selfcheck /fixtures
```

As fotos de `tests/fixtures` mantêm a licença de cada uma (ver `tests/fixtures/ATTRIBUTION.md`).
````

- [ ] **Step 6: Commit, PR e CI**

```bash
git add -A && git -c user.name=velosobr -c user.email=linoc.veloso@gmail.com commit -m "feat: ponto de entrada, imagem Docker offline e CI dos modelos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb"
git push -u origin feat/modelos-e-imagem
gh pr create --base main --title "feat: modelos de verdade e imagem Docker do curador" --body "<resumo; PR 4 da frente A>"
```

Expected: a CI fica verde (`test`, `models` e `security`, com o self-check e o Trivy).

---

## Depois deste plano

- **Plano A2:** o conjunto de referência (`build_reference.py`, página de revisão, `apply_review.py`), a divisão em calibração e medição, a calibração do `config.py` e o job que mede as metas. É o PR 5 da spec.
- **Plano A3:** o catalog e o compose (PRs 6 a 9) e a reingestão (PR 10).
