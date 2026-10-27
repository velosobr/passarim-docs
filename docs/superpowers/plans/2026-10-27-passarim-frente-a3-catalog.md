# Frente A3 — Curadoria no catalog, curador no compose e reingestão: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o worker do catalog escolher a foto principal e a galeria de cada espécie com o curador, que passa a rodar no compose, e reingerir as 41 espécies com a conferência do dono.

**Architecture:**
- **Banco e seed (PR 6):** a migração `0004` cria as colunas de curadoria em `media` (`source_photo_id`, `category`, `score`, `model_version`), as tabelas `photo_override` e `curation_report` e a coluna `deferrals` da fila. O seed aceita a chave `photos:` no YAML e grava em `photo_override`.
- **Busca de candidatas (PR 7):** o cliente do iNaturalist junta até 3 fotos por observação, descarta observações com anotação de morto, ovo ou pena, lê os votos e busca uma foto de uma observação específica, que é a do override.
- **Ingestão curada (PR 8):** `IngestPhotos` faz download, gera a `medium`, manda ao curador em lotes de 8, pontua e escolhe, e só então gera `thumb` e `large` das escolhidas. Depois grava fotos e relatório numa transação.
  - Funções puras em `selection.go` fazem a pontuação e a escolha.
  - O cliente gRPC do curador fica num adapter novo.
  - Com o curador fora do ar, o job é **adiado**: volta para a fila sem gastar tentativa.
  - O worker ganha os comandos `requeue` e `curation-report`.
- **Compose (PR 9):** serviço `photo-curator` numa rede `internal: true`, a `passarim-curation`, só com o worker.
- **Reingestão (PR 10):** `worker requeue`, relatório, conferência das 41 espécies pelo dono e overrides no YAML.
- **Antes de tudo, um PR pequeno no curador:** um script sugere o limite `LOW_CONFIDENCE` a partir da metade de calibração.

**Tech Stack:**
- **Catalog:** Go 1.27.2, pgx v5, sqlc (`go tool sqlc`), golang-migrate, testcontainers (PostgreSQL 18), grpc-go (já no `go.mod`), `passarim-proto` v0.3.0.
- **Curador:** Python 3.13 com uv, para o script de limite.
- **Infra:** Docker Compose.

**Spec:** `passarim-docs/docs/superpowers/specs/2026-10-17-passarim-frente-a-curadoria-design.md`, seções 1 ("Pronto quando"), 3 (erros), 5 (inteira) e 6 ("Catalog" e "Ponta a ponta, à mão"). Cobre os PRs 6 a 10 da seção 7.

## Global Constraints

- **Comentários didáticos em português** em todo código, SQL, YAML e shell novos ou alterados (regra do `~/dev/passarim/CLAUDE.md`):
  - todo arquivo começa dizendo o seu papel;
  - funções e blocos não triviais dizem o que fazem e por quê;
  - conceitos (gRPC, deadline, jsonb, `DISTINCT ON`, `bufconn`, rede `internal`, percentil) são explicados na primeira vez que aparecem no arquivo;
  - mudou o código, atualiza o comentário.
- **Idioma:** identificadores em inglês; comentários, mensagens de erro, commits, PRs e README em português do Brasil.
- **Identidade do Git** em todos os repos: `velosobr <linoc.veloso@gmail.com>`.
- **Um PR por passo**, com os branches empilhados:
  - `passarim-catalog` `feat/curadoria-banco` (PR 6) ← `feat/inaturalist-candidatas` (PR 7) ← `feat/ingestao-curada` (PR 8). Cada PR aponta para o branch anterior como base; quando o anterior entra na `main`, o seguinte é rebaseado e passa a apontar para a `main`;
  - curador: `feat/limite-baixa-confianca`;
  - docs: `feat/compose-curador` (PR 9) e `content/reingestao-curada` no catalog (PR 10).
- **Dependência nova só uma:** `github.com/velosobr/passarim-proto` sobe de v0.2.1 para v0.3.0. O grpc-go já está no `go.mod`, e `bufconn` e `insecure` vêm dele.
- **Modelo de domínio sem tag de serialização:** o JSON do `curation_report` usa uma struct do adapter `postgres`, com `toDTO` e `fromDTO` lá.
- **Constantes da spec, copiadas:**
  - lote do curador: até 8 fotos, com deadline de 30 s por chamada;
  - `per_page`: 20 observações, até 3 fotos de cada, corte em 40 candidatas;
  - `MaxPhotos`: 6, com no máximo 2 fotos da mesma observação;
  - pesos 0,4 tamanho (`min(area/0,25, 1)`), 0,3 nitidez, 0,2 votos (`log(1+v)/log(1+max)`, ou 0 sem votos) e 0,1 confiança; ave cortada multiplica por 0,5;
  - `PHOTO_JOB_TIMEOUT`: 6 min por padrão;
  - backoff de `domain.NextAttemptDelay`: 1, 2, 4, 8 min... até 6 h.
- **Testes do catalog:**
  - `go test -race ./...` precisa de Docker (testcontainers) e de `ffmpeg` no PATH;
  - `go tool sqlc diff` tem que sair limpo depois de cada mudança de SQL (rode `go tool sqlc generate` antes);
  - `golangci-lint run` limpo.
- **Ambiente local:** use os scripts de `passarim-docs/env.scripts` (`status`, `back-end-init`, `back-end-down`). **Nunca** rode o `clean-all`.

## Decisões deste plano [DP]

1. **Prazo da rodada = `batchTimeout` + `PHOTO_JOB_TIMEOUT`** (a spec diz "o maior entre"). O job de fotos pode ser o último da rodada; com o máximo, ele herdaria só o que sobrou. Por isso o `stop_grace_period` do worker vai a 8m30s.
   - **Custo se errado:** um desligamento até 2 min mais lento.
2. **O adiamento usa uma coluna `deferrals` na fila,** zerada no sucesso. Sem ela, o backoff de um job adiado ficaria sempre em 1 min, e cada adiamento refaz a busca e os 40 downloads no iNaturalist.
   - **Custo:** uma coluna na `0004`.
3. **Os ids do iNaturalist ficam como `text`** em `photo_override` e `media.source_photo_id`, como o `SourceID` que já existe. No YAML eles são números; o loader converte.
4. **O `ImageProcessor` troca o `Process` por `Medium` e `ThumbAndLarge`** (passos 4 e 7 da seção 5.2 da spec).
5. **A principal do override passa pelo curador** (para ter categoria e pontuação no relatório), mas um veredito `UNSPECIFIED` (imagem que não abriu) conta como "override que falhou".
6. **Falha ao gerar `thumb` ou `large` de uma escolhida devolve erro** (o job tenta de novo, gastando tentativa): a `medium` da mesma foto já foi gerada, então essa falha é rara e quase sempre temporária.
7. **`low_confidence` só marca a principal escolhida pelo modelo,** não a do override (o dono já olhou essa foto).
8. **`LOW_CONFIDENCE` é o percentil 20 da confiança das fotos que o curador chama de `SINGLE_BIRD`** na metade de calibração: marca para conferência o quinto menos confiante. O Task 1 calcula o valor e o Task 10 o fixa como padrão.
9. **`requeue` não mexe em job `running`** e diz quais ids não reenfileirou. Reenfileirar um job rodando faria dois workers pegarem a mesma espécie.

## Review Focus

1. **A mesma foto aparece duas vezes.** Isso acontece com a principal do override que também está nas candidatas, ou com a mesma foto em duas observações. Ela entra uma vez só, na frente quando é a do override (teste no Task 9: `TestIngestPhotos_OverridePrimaryNotDuplicated`).
2. **O curador devolve vereditos em outra ordem ou em outro número.** O adapter recusa, com erro que não é `ErrCuratorUnavailable`, em vez de dar a categoria de uma foto a outra (Task 6: `TestClassify_RejectsMismatchedReply`).
3. **Override cuja foto tem licença NC com `ALLOW_NC=false`, ou cuja observação não existe mais.** A principal volta a ser a do modelo e a espécie é marcada `override_failed` (Task 9: `TestIngestPhotos_OverrideRejectedLicenseFails`, `TestIngestPhotos_OverrideMissingFails`).
4. **SIGTERM ou fim do prazo no meio da chamada ao curador.** A chamada volta `DEADLINE_EXCEEDED` ou `CANCELED`, e o job é adiado, sem trocar foto e sem gastar tentativa (Task 6: `TestClassify_CanceledIsUnavailable`; Task 10: `TestRunner_DefersCuratorUnavailable`).
5. **`requeue` com id que não existe ou de job rodando.** O comando sai com erro e cita os ids, sem reenfileirar nada errado (Task 11: `TestRequeuePhotoJobs`).

---

## Tarefa 1 — Curador: sugestão do `LOW_CONFIDENCE` (`passarim-photo-curator`, branch `feat/limite-baixa-confianca`)

**Files:**
- Create: `src/photo_curator/reference/confidence.py`
- Create: `scripts/low_confidence.py`
- Test: `tests/test_reference_confidence.py`
- Modify: `README.md` (seção do conjunto de referência: uma linha sobre o script)

**Interfaces:**
- Produces: `suggest_low_confidence(confidences: Sequence[float], share: float = 0.2) -> float` e o **valor impresso** pelo script, que o Task 10 usa como padrão de `LOW_CONFIDENCE`.

- [ ] **Step 1: Branch e teste que falha**

```bash
cd ~/dev/passarim/passarim-photo-curator && git checkout main && git pull && git checkout -b feat/limite-baixa-confianca
```

`tests/test_reference_confidence.py`:

```python
"""Testes da sugestão do limite de baixa confiança (LOW_CONFIDENCE do worker)."""

import pytest

from photo_curator.reference.confidence import suggest_low_confidence


def test_suggestion_is_the_20th_percentile():
    # 10 valores: o 2º menor deixa 20% das fotos abaixo ou no limite.
    values = [0.9, 0.1, 0.5, 0.3, 0.7, 0.2, 0.4, 0.6, 0.8, 1.0]
    assert suggest_low_confidence(values) == 0.2


def test_suggestion_with_one_value_is_that_value():
    assert suggest_low_confidence([0.42]) == 0.42


def test_suggestion_is_rounded_to_three_places():
    assert suggest_low_confidence([0.123456]) == 0.123


def test_suggestion_without_values_fails():
    with pytest.raises(ValueError, match="SINGLE_BIRD"):
        suggest_low_confidence([])
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `uv run pytest tests/test_reference_confidence.py -q`
Expected: FAIL com `ModuleNotFoundError: No module named 'photo_curator.reference.confidence'`

- [ ] **Step 3: Implementar**

`src/photo_curator/reference/confidence.py`:

```python
"""Sugere o limite de "baixa confiança" que o worker do catalog usa no relatório.

Quem usa: scripts/low_confidence.py. O valor impresso vira o padrão de
LOW_CONFIDENCE no passarim-catalog (internal/config/worker.go).

Para que serve: quando a foto principal escolhida pelo modelo tem confiança
abaixo desse limite, o worker marca a espécie com "low_confidence" no
relatório de curadoria, e o dono confere aquela foto primeiro. O limite não é
um número redondo como 0,6: o CLIP sem treino espalha a probabilidade por
muitas classes, então as confianças costumam ser baixas. Por isso ele sai dos
dados, da metade de calibração do conjunto de referência.
"""

import math
from collections.abc import Sequence


def suggest_low_confidence(confidences: Sequence[float], share: float = 0.2) -> float:
    """Devolve o "percentil" `share` das confianças: o valor que deixa essa fração
    das fotos abaixo dele ou nele.

    confidences: a confiança das fotos que o curador chamou de SINGLE_BIRD.
    Com share = 0,2, as 20% menos confiantes ficam marcadas para conferência.
    """
    if not confidences:
        raise ValueError("nenhuma foto SINGLE_BIRD na metade de calibração")
    ordered = sorted(confidences)
    # ceil(0,2 × 10) = 2: a 2ª menor (índice 1). max(0, ...) cobre a lista curta.
    index = max(0, math.ceil(share * len(ordered)) - 1)
    return round(ordered[index], 3)
```

- [ ] **Step 4: Rodar e ver passar**

Run: `uv run pytest tests/test_reference_confidence.py -q`
Expected: `4 passed`

- [ ] **Step 5: Script e o valor de verdade**

`scripts/low_confidence.py`:

```python
"""Imprime a sugestão de LOW_CONFIDENCE para o worker do catalog.

Uso: CURATOR_MODELS_DIR=models uv run python scripts/low_confidence.py

Roda a regra (com os limites do config.py) nas fotos da metade de CALIBRAÇÃO
do conjunto de referência, pega a confiança das que saíram SINGLE_BIRD e
imprime o percentil 20 (photo_curator.reference.confidence). Usa a metade de
calibração, e não a de medição, pela mesma razão da calibração dos limites:
a medição só mede, não ajusta nada.

Também conta quantos falsos positivos (fotos que o curador chamou de ave
sozinha, mas que não são) ficariam marcados: é o que a marca quer pegar.
"""

import os
import sys
from pathlib import Path

from photo_curator.reference import features, manifest, split
from photo_curator.reference.confidence import suggest_low_confidence
from photo_curator.rules import curate

REFERENCE = Path("tests/reference")
CACHE = Path(".cache/reference-features.json")


def main() -> int:
    models_dir = os.environ.get("CURATOR_MODELS_DIR")
    if not models_dir:
        sys.exit("defina CURATOR_MODELS_DIR (pasta dos pesos)")
    rows = manifest.read(REFERENCE / "manifest.csv")
    frozen = split.read_frozen(REFERENCE / "split.json")
    half = split.split(rows, frozen=frozen)[split.CALIBRATION]

    detector, zeroshot = features.load_models(Path(models_dir))
    feats = features.compute_all(half, REFERENCE, detector, zeroshot, CACHE)

    # (rótulo revisado, confiança) de cada foto que a regra chamou de SINGLE_BIRD.
    singles = []
    for r in half:
        f = feats[r.photo_id]
        v = curate(f.boxes, f.clip, f.sharpness, f.width, f.height)
        if v.category.name == "SINGLE_BIRD":
            singles.append((r.label, v.confidence))

    limit = suggest_low_confidence([c for _, c in singles])
    false_pos = [c for label, c in singles if label != "SINGLE_BIRD"]
    caught = sum(1 for c in false_pos if c <= limit)
    print(f"fotos SINGLE_BIRD na calibração: {len(singles)}")
    print(f"falsos positivos: {len(false_pos)}, {caught} deles marcados com o limite")
    print(f"LOW_CONFIDENCE sugerido: {limit}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

Run: `CURATOR_MODELS_DIR=models uv run python scripts/low_confidence.py`
Expected: três linhas, a última `LOW_CONFIDENCE sugerido: 0.xyz`. **Anote o valor no ledger**: o Task 10 usa esse número.

Se a pasta `models` não existir, baixe os pesos com `uv run python -m photo_curator.weights models`. O cache `.cache/reference-features.json` deixa a rodada rápida.

- [ ] **Step 6: README, lint e commit**

No `README.md`, na seção do conjunto de referência, depois do parágrafo do `measure.py`, acrescente:

```markdown
- `scripts/low_confidence.py` imprime o limite `LOW_CONFIDENCE` do worker do catalog: o percentil 20 da confiança das fotos que o curador chama de ave sozinha na metade de calibração. A principal com confiança abaixo dele é marcada `low_confidence` no relatório de curadoria.
```

```bash
uv run ruff check . && uv run ruff format --check . && uv run pytest -q
git add src/photo_curator/reference/confidence.py scripts/low_confidence.py tests/test_reference_confidence.py README.md
git commit -m "feat: script que sugere o LOW_CONFIDENCE do worker a partir da calibração"
git push -u origin feat/limite-baixa-confianca
gh pr create --title "Sugestão do LOW_CONFIDENCE do worker" --body "..."
```

No corpo do PR, ponha o valor e as três linhas impressas.

---

## Tarefa 2 — Domínio da curadoria (`passarim-catalog`, branch `feat/curadoria-banco`)

**Files:**
- Create: `internal/domain/curation.go`
- Test: `internal/domain/curation_test.go`
- Modify: `internal/domain/species.go` (campos em `Photo` e `Species`, chamada no `Validate`)

**Interfaces:**
- Produces:
  - `type PhotoCategory string`, com as constantes `PhotoUnspecified`, `PhotoSingleBird`, `PhotoFlock`, `PhotoNest`, `PhotoEggs`, `PhotoFeather`, `PhotoDeadBird`, `PhotoNoBird` e `PhotoOther` (valores `"unspecified"`, `"single_bird"`, ...);
  - `type PhotoOverride struct{ PrimaryObservationID, PrimaryPhotoID string; ExcludedIDs []string }`, com `HasPrimary() bool`, `Excludes(id string) bool` e `Validate() error`;
  - `type CurationFlag string`, com `FlagLowConfidence`, `FlagNoSingleBird` e `FlagOverrideFailed`;
  - `type CuratedCandidate struct{ PhotoID, ObservationID string; Category PhotoCategory; Score, Confidence float64 }`;
  - `type CurationReport struct{ ModelVersion, PrimaryPhotoID string; Candidates []CuratedCandidate; Flags []CurationFlag }`;
  - `type CurationReportEntry struct{ SpeciesID, CommonName string; RanAt time.Time; Report CurationReport }`;
  - `Photo` ganha `SourcePhotoID string`, `Category PhotoCategory`, `Score float64` e `ModelVersion string`;
  - `Species` ganha `PhotoOverride *PhotoOverride`.

- [ ] **Step 1: Branch e teste que falha**

```bash
cd ~/dev/passarim/passarim-catalog && git checkout main && git pull && git checkout -b feat/curadoria-banco
```

`internal/domain/curation_test.go`:

```go
// Testes das regras do override de fotos (a chave photos: do YAML).

package domain_test

import (
	"errors"
	"testing"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

// Cada caso diz se o override é aceito; os recusados dizem o campo do erro.
func TestPhotoOverrideValidate(t *testing.T) {
	cases := []struct {
		name  string
		o     domain.PhotoOverride
		field string // "" = válido
	}{
		{"só principal", domain.PhotoOverride{PrimaryObservationID: "123456", PrimaryPhotoID: "219317614"}, ""},
		{"só exclusões", domain.PhotoOverride{ExcludedIDs: []string{"1", "2"}}, ""},
		{"vazio", domain.PhotoOverride{}, "photos"},
		{"principal sem observação", domain.PhotoOverride{PrimaryPhotoID: "1"}, "photos.primary"},
		{"principal sem foto", domain.PhotoOverride{PrimaryObservationID: "1"}, "photos.primary"},
		{"id com letra", domain.PhotoOverride{PrimaryObservationID: "12a", PrimaryPhotoID: "1"}, "photos.primary"},
		{"id zero", domain.PhotoOverride{PrimaryObservationID: "0", PrimaryPhotoID: "1"}, "photos.primary"},
		{"exclusão inválida", domain.PhotoOverride{ExcludedIDs: []string{"../x"}}, "photos.exclude"},
		{"principal excluída", domain.PhotoOverride{PrimaryObservationID: "1", PrimaryPhotoID: "7", ExcludedIDs: []string{"7"}}, "photos.exclude"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := c.o.Validate()
			if c.field == "" {
				if err != nil {
					t.Fatalf("esperava válido: %v", err)
				}
				return
			}
			var inv *domain.InvalidArgumentError
			if !errors.As(err, &inv) || inv.Field != c.field {
				t.Fatalf("esperava erro no campo %q, veio %v", c.field, err)
			}
		})
	}
}

// Excludes e HasPrimary respondem pelo que o YAML disse.
func TestPhotoOverrideHelpers(t *testing.T) {
	o := domain.PhotoOverride{PrimaryObservationID: "1", PrimaryPhotoID: "2", ExcludedIDs: []string{"3"}}
	if !o.HasPrimary() || !o.Excludes("3") || o.Excludes("2") {
		t.Fatalf("helpers errados: %+v", o)
	}
	if (domain.PhotoOverride{}).HasPrimary() {
		t.Fatal("override vazio não tem principal")
	}
}

// Uma espécie com override inválido é recusada pelo Validate da espécie.
func TestSpeciesValidateChecksOverride(t *testing.T) {
	s := validSpecies()
	s.PhotoOverride = &domain.PhotoOverride{}
	var inv *domain.InvalidArgumentError
	if err := s.Validate(); !errors.As(err, &inv) || inv.Field != "photos" {
		t.Fatalf("esperava erro em photos, veio %v", err)
	}
}
```

`validSpecies()` já existe? Confira com `grep -n "func validSpecies" internal/domain/*_test.go`.
- **Se não existir,** acrescente no fim do arquivo de teste uma função que devolve uma espécie válida, copiando os campos do `sp(...)` de `internal/adapter/postgres/repository_test.go` (sabiá-laranjeira, com 2 fatos).
- **Se existir com outro nome,** use esse nome.

- [ ] **Step 2: Rodar e ver falhar**

Run: `go test ./internal/domain/ -run 'PhotoOverride|ChecksOverride'`
Expected: FAIL na compilação (`undefined: domain.PhotoOverride`)

- [ ] **Step 3: Implementar**

`internal/domain/curation.go`:

```go
// O vocabulário da curadoria de fotos (frente A) no domínio: o que uma foto
// mostra, a escolha manual do YAML (override) e o relatório de cada execução.
//
// Quem usa: o caso de uso IngestPhotos (escolhe as fotos), o seed (grava o
// override) e o comando curation-report do worker. Nada aqui sabe de gRPC,
// SQL ou JSON: os adapters traduzem.

package domain

import (
	"regexp"
	"slices"
	"time"
)

// PhotoCategory diz o que uma foto mostra, segundo o curador
// (passarim-photo-curator). Só PhotoSingleBird concorre a foto principal;
// PhotoFlock entra no fim da galeria; o resto é descarte.
type PhotoCategory string

const (
	PhotoUnspecified PhotoCategory = "unspecified" // a imagem não abriu no curador
	PhotoSingleBird  PhotoCategory = "single_bird"
	PhotoFlock       PhotoCategory = "flock"
	PhotoNest        PhotoCategory = "nest"
	PhotoEggs        PhotoCategory = "eggs"
	PhotoFeather     PhotoCategory = "feather"
	PhotoDeadBird    PhotoCategory = "dead_bird"
	PhotoNoBird      PhotoCategory = "no_bird"
	PhotoOther       PhotoCategory = "other" // ave na mão, ilustração, ave escondida
)

// PhotoOverride é a escolha manual da chave photos: do YAML de uma espécie.
// Os ids são os do iNaturalist, guardados como texto (como o SourceID das
// candidatas).
//
//   - PrimaryObservationID e PrimaryPhotoID: a foto que vira a principal, seja
//     qual for a categoria que o curador der. Vêm juntos ou não vêm.
//   - ExcludedIDs: fotos que nunca entram, mesmo se forem as melhores.
type PhotoOverride struct {
	PrimaryObservationID string
	PrimaryPhotoID       string
	ExcludedIDs          []string
}

// inatIDPattern: um id do iNaturalist é um inteiro positivo, sem zero à
// esquerda. Validar aqui evita que um id estranho chegue a uma URL ou a uma
// chave do storage.
var inatIDPattern = regexp.MustCompile(`^[1-9][0-9]{0,19}$`)

// HasPrimary diz se o YAML escolheu uma foto principal.
func (o PhotoOverride) HasPrimary() bool { return o.PrimaryPhotoID != "" }

// Excludes diz se a foto está na lista de exclusões.
func (o PhotoOverride) Excludes(photoID string) bool { return slices.Contains(o.ExcludedIDs, photoID) }

// Validate recusa o override vazio, ids que não são do iNaturalist, a
// principal pela metade e a principal que também está excluída (o YAML
// estaria pedindo duas coisas opostas).
func (o PhotoOverride) Validate() error {
	if o.PrimaryObservationID == "" && o.PrimaryPhotoID == "" && len(o.ExcludedIDs) == 0 {
		return invalid("photos", "vazio: use primary, exclude ou tire a chave")
	}
	if o.PrimaryObservationID != "" || o.PrimaryPhotoID != "" {
		if !inatIDPattern.MatchString(o.PrimaryObservationID) || !inatIDPattern.MatchString(o.PrimaryPhotoID) {
			return invalid("photos.primary", "precisa de observation e photo, ids positivos do iNaturalist")
		}
	}
	for _, id := range o.ExcludedIDs {
		if !inatIDPattern.MatchString(id) {
			return invalid("photos.exclude", "id inválido: "+id)
		}
	}
	if o.HasPrimary() && o.Excludes(o.PrimaryPhotoID) {
		return invalid("photos.exclude", "a foto principal "+o.PrimaryPhotoID+" também está excluída")
	}
	return nil
}

// CurationFlag marca uma espécie no relatório para o dono conferir.
type CurationFlag string

const (
	// FlagLowConfidence: a principal escolhida pelo modelo tem confiança
	// abaixo de LOW_CONFIDENCE.
	FlagLowConfidence CurationFlag = "low_confidence"
	// FlagNoSingleBird: nenhuma candidata saiu "ave sozinha".
	FlagNoSingleBird CurationFlag = "no_single_bird"
	// FlagOverrideFailed: a principal do YAML sumiu, mudou de licença ou não
	// abriu; a principal voltou a ser a do modelo.
	FlagOverrideFailed CurationFlag = "override_failed"
)

// CuratedCandidate é uma candidata classificada, como aparece no relatório.
type CuratedCandidate struct {
	PhotoID       string
	ObservationID string
	Category      PhotoCategory
	Score         float64
	Confidence    float64
}

// CurationReport é o resultado de uma execução da curadoria de uma espécie.
// PrimaryPhotoID fica "" quando a espécie ficou sem fotos.
type CurationReport struct {
	ModelVersion   string
	PrimaryPhotoID string
	Candidates     []CuratedCandidate
	Flags          []CurationFlag
}

// CurationReportEntry é uma linha do relatório lido do banco: a última
// execução de uma espécie, com o nome para o dono reconhecer.
type CurationReportEntry struct {
	SpeciesID  string
	CommonName string
	RanAt      time.Time
	Report     CurationReport
}
```

Em `internal/domain/species.go`, troque a struct `Photo` por:

```go
type Photo struct {
	ThumbKey, MediumKey, LargeKey string
	Width, Height                 int
	Credit                        Credit
	// Campos da curadoria (frente A). Ficam vazios nas fotos gravadas antes
	// da migração 0004, até a reingestão.
	SourcePhotoID string        // id da foto no iNaturalist
	Category      PhotoCategory // o que o curador viu na foto
	Score         float64       // pontuação da escolha, de 0 a 1
	ModelVersion  string        // versão do modelo que classificou
}
```

Acrescente na struct `Species`, depois de `Clusters`:

```go
	// PhotoOverride é a escolha manual de fotos do YAML (nil = sem a chave photos:).
	PhotoOverride *PhotoOverride
```

No `Validate` da `Species`, antes do `return nil` final, acrescente:

```go
	if s.PhotoOverride != nil {
		if err := s.PhotoOverride.Validate(); err != nil {
			return err
		}
	}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `go test ./internal/domain/`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add internal/domain/
git commit -m "feat: domínio da curadoria (categoria da foto, override e relatório)"
```

---

## Tarefa 3 — Migração 0004 e as fotos com os campos de curadoria (`feat/curadoria-banco`)

**Files:**
- Create: `internal/adapter/postgres/migrations/0004_photo_curation.up.sql`
- Create: `internal/adapter/postgres/migrations/0004_photo_curation.down.sql`
- Create: `internal/adapter/postgres/export_test.go`
- Create: `internal/adapter/postgres/migrate_test.go`
- Modify: `internal/adapter/postgres/queries_ingest.sql` (`InsertMedia`)
- Modify: `internal/adapter/postgres/ingest_repository.go` (`ReplacePhotos`)
- Modify: `internal/adapter/postgres/repository.go` (leitura das fotos em `GetSpecies`)
- Regenerate: `internal/adapter/postgres/sqlcgen/`
- Test: `internal/adapter/postgres/ingest_repository_test.go`

**Interfaces:**
- Consumes: os campos novos de `domain.Photo` (Tarefa 2).
- Produces:
  - tabelas `photo_override(species_id, primary_observation_id, primary_photo_id, excluded_ids)` e `curation_report(id, species_id, ran_at, model_version, primary_photo_id, candidates, flags)`;
  - colunas `media.source_photo_id`, `media.category`, `media.score` e `media.model_version`, e `ingestion_job.deferrals`;
  - `ReplacePhotos` grava os campos novos, e `GetSpecies` os devolve.

- [ ] **Step 1: Teste da migração que falha**

`internal/adapter/postgres/export_test.go`:

```go
// Expõe aos testes (pacote postgres_test) peças internas do pacote. Um
// arquivo _test.go no pacote "postgres" só entra na compilação dos testes,
// então nada disto vai para o binário.

package postgres

// MigrationsFS são as migrations embutidas, para o teste de subir e descer.
var MigrationsFS = migrationsFS
```

`internal/adapter/postgres/migrate_test.go`:

```go
// Testa que a última migration sobe, desce e sobe de novo sem erro: o
// .down.sql precisa desfazer exatamente o .up.sql.

package postgres_test

import (
	"context"
	"strings"
	"testing"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	"github.com/golang-migrate/migrate/v4/source/iofs"

	"github.com/velosobr/passarim-catalog/internal/adapter/postgres"
)

func TestMigration0004UpDownUp(t *testing.T) {
	_, pool := newRepo(t) // já aplica todas as migrations
	url := pool.Config().ConnString()
	src, err := iofs.New(postgres.MigrationsFS, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	m, err := migrate.NewWithSourceInstance("iofs", src, strings.Replace(url, "postgres://", "pgx5://", 1))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = m.Close() }()
	if v, _, _ := m.Version(); v != 4 {
		t.Fatalf("esperava a versão 4, veio %d", v)
	}
	if err := m.Steps(-1); err != nil {
		t.Fatalf("descer a 0004: %v", err)
	}
	var n int
	_ = pool.QueryRow(context.Background(),
		"SELECT count(*) FROM information_schema.tables WHERE table_name IN ('photo_override', 'curation_report')").Scan(&n)
	if n != 0 {
		t.Fatalf("o down deveria apagar as 2 tabelas, sobraram %d", n)
	}
	if err := m.Up(); err != nil {
		t.Fatalf("subir de novo: %v", err)
	}
}
```

Run: `go test ./internal/adapter/postgres/ -run TestMigration0004`
Expected: FAIL com `esperava a versão 4, veio 3`

- [ ] **Step 2: Escrever a migração**

`0004_photo_curation.up.sql`:

```sql
-- 0004_photo_curation: a curadoria de fotos (frente A).
--
-- 1) media ganha o que o curador disse de cada foto. As colunas aceitam NULL:
--    as fotos gravadas antes desta migration não têm esses dados até a
--    reingestão, e quem depende da categoria trata NULL como "não elegível".
ALTER TABLE media
    ADD COLUMN source_photo_id text,   -- id da foto no iNaturalist
    ADD COLUMN category        text CHECK (category IN ('unspecified', 'single_bird', 'flock', 'nest',
                                                      'eggs', 'feather', 'dead_bird', 'no_bird', 'other')),
    ADD COLUMN score           real,   -- pontuação da escolha, de 0 a 1
    ADD COLUMN model_version   text;   -- ex.: rtdetr-r50vd+openclip-b32@2

-- 2) photo_override: a escolha manual da chave photos: do YAML. O seed grava,
--    o worker lê. Uma linha por espécie, no máximo. O CHECK exige que a
--    observação e a foto da principal venham juntas (ou nenhuma das duas).
CREATE TABLE photo_override (
    species_id             text PRIMARY KEY REFERENCES species (id) ON DELETE CASCADE,
    primary_observation_id text,
    primary_photo_id       text,
    excluded_ids           text[] NOT NULL DEFAULT '{}',
    CHECK ((primary_observation_id IS NULL) = (primary_photo_id IS NULL))
);

-- 3) curation_report: uma linha por espécie e execução da curadoria. Existe
--    porque o worker roda com o sistema de arquivos só de leitura: o
--    relatório fica no banco e o comando "worker curation-report" o imprime.
--    jsonb guarda JSON num formato binário que o PostgreSQL consegue consultar.
CREATE TABLE curation_report (
    id               bigserial PRIMARY KEY,
    species_id       text NOT NULL REFERENCES species (id) ON DELETE CASCADE,
    ran_at           timestamptz NOT NULL DEFAULT now(),
    model_version    text NOT NULL,
    primary_photo_id text,                       -- NULL = a espécie ficou sem fotos
    candidates       jsonb NOT NULL,             -- id, observação, categoria, pontuação e confiança de cada candidata
    flags            text[] NOT NULL DEFAULT '{}'
);
-- "A última execução de cada espécie" é a pergunta do relatório.
CREATE INDEX curation_report_species_idx ON curation_report (species_id, ran_at DESC);

-- 4) ingestion_job.deferrals: quantas vezes o job foi ADIADO porque o curador
--    estava fora do ar. Adiar não gasta tentativa (attempts), mas a espera
--    cresce com o backoff a cada adiamento; o sucesso zera a contagem.
ALTER TABLE ingestion_job ADD COLUMN deferrals integer NOT NULL DEFAULT 0;
```

`0004_photo_curation.down.sql`:

```sql
-- Desfaz a 0004, na ordem inversa.
ALTER TABLE ingestion_job DROP COLUMN deferrals;
DROP TABLE curation_report;
DROP TABLE photo_override;
ALTER TABLE media
    DROP COLUMN model_version,
    DROP COLUMN score,
    DROP COLUMN category,
    DROP COLUMN source_photo_id;
```

Run: `go test ./internal/adapter/postgres/ -run TestMigration0004`
Expected: PASS

- [ ] **Step 3: Teste das fotos com campos de curadoria, que falha**

Em `ingest_repository_test.go`, acrescente:

```go
// ReplacePhotos grava os campos da curadoria, e a leitura da espécie os devolve.
func TestReplacePhotos_StoresCurationFields(t *testing.T) {
	repo, pool := newRepo(t)
	ctx := context.Background()
	seed(t, repo, sp("Turdus rufiventris", "Sabiá-laranjeira", nil))
	q := postgres.NewIngestRepository(pool)
	photo := domain.Photo{ThumbKey: "t", MediumKey: "m", LargeKey: "l", Width: 800, Height: 600,
		Credit:        domain.Credit{Author: "A", License: "CC-BY", Source: "inaturalist", SourceURL: "https://x"},
		SourcePhotoID: "219317614", Category: domain.PhotoSingleBird, Score: 0.75, ModelVersion: "m@2"}
	if err := q.ReplacePhotos(ctx, "turdus-rufiventris", []domain.Photo{photo}); err != nil {
		t.Fatal(err)
	}
	got, err := repo.GetSpecies(ctx, "turdus-rufiventris")
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Photos) != 1 || got.Photos[0] != photo {
		t.Fatalf("foto lida diferente da gravada:\n got %+v\nwant %+v", got.Photos, photo)
	}
}
```

O nome do método de leitura da espécie no `Repository` pode não ser `GetSpecies`. Confira com `grep -n "^func (r \*Repository)" internal/adapter/postgres/repository.go` e use o que existir.

Run: `go test ./internal/adapter/postgres/ -run TestReplacePhotos_StoresCurationFields`
Expected: FAIL (a foto lida volta sem `SourcePhotoID`, `Category`, `Score` e `ModelVersion`)

- [ ] **Step 4: SQL, sqlc e repositório**

Em `queries_ingest.sql`, troque o `InsertMedia` por:

```sql
-- name: InsertMedia :exec
-- Grava uma foto ou um canto, com o crédito. Os 4 últimos campos são da
-- curadoria (só fotos; NULL no canto).
INSERT INTO media (species_id, kind, position, thumb_key, medium_key, large_key, audio_key,
                   width, height, duration_ms, author, license, source, source_url,
                   source_photo_id, category, score, model_version)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18);
```

Run: `go tool sqlc generate && go build ./...`
Expected: erro de compilação só no repositório, se houver. `InsertMediaParams` ganha `SourcePhotoID`, `Category` e `ModelVersion` (`pgtype.Text`) e `Score` (`pgtype.Float4`). Se o sqlc der outros nomes, siga o código gerado.

Em `ingest_repository.go`, no `ReplacePhotos`, acrescente ao `InsertMediaParams` de cada foto:

```go
			// pgtype.Text e pgtype.Float4 representam colunas que aceitam NULL:
			// Valid=false grava NULL. Foto sem categoria (antes da curadoria) fica NULL.
			SourcePhotoID: pgtype.Text{String: p.SourcePhotoID, Valid: p.SourcePhotoID != ""},
			Category:      pgtype.Text{String: string(p.Category), Valid: p.Category != ""},
			Score:         pgtype.Float4{Float32: float32(p.Score), Valid: p.Category != ""},
			ModelVersion:  pgtype.Text{String: p.ModelVersion, Valid: p.ModelVersion != ""},
```

Acrescente também o import `"github.com/jackc/pgx/v5/pgtype"`.

Em `repository.go`, na leitura das fotos (o `case "photo":`), troque a construção da foto por:

```go
			s.Photos = append(s.Photos, domain.Photo{ThumbKey: m.ThumbKey, MediumKey: m.MediumKey, LargeKey: m.LargeKey,
				Width: int(m.Width), Height: int(m.Height), Credit: credit,
				// .String de um pgtype.Text NULL é "", e .Float32 de um NULL é 0.
				SourcePhotoID: m.SourcePhotoID.String, Category: domain.PhotoCategory(m.Category.String),
				Score: float64(m.Score.Float32), ModelVersion: m.ModelVersion.String})
```

O teste compara `0.75` gravado como `real` (float32) e lido de volta. `0.75` é exato em float32, então a comparação com `!=` vale.

- [ ] **Step 5: Rodar e ver passar**

Run: `go tool sqlc diff && go test -race ./internal/adapter/postgres/ ./internal/domain/`
Expected: `sqlc diff` sem saída; `ok` nos dois pacotes.

- [ ] **Step 6: Commit**

```bash
git add internal/adapter/postgres/
git commit -m "feat: migração 0004 (curadoria em media, override, relatório e adiamento na fila)"
```

---

## Tarefa 4 — Chave `photos:` no seed e leitura do override (`feat/curadoria-banco`)

**Files:**
- Modify: `internal/adapter/curated/loader.go`
- Create: `internal/adapter/curated/testdata/photos/turdus-rufiventris.yaml`, `testdata/photos-typo/bad.yaml`, `testdata/photos-conflict/bad.yaml`
- Test: `internal/adapter/curated/loader_test.go`
- Modify: `internal/adapter/postgres/queries.sql` (upsert/delete do override)
- Modify: `internal/adapter/postgres/queries_ingest.sql` (`GetPhotoOverride`)
- Modify: `internal/adapter/postgres/repository.go` (`UpsertCurated`)
- Modify: `internal/adapter/postgres/ingest_repository.go` (`PhotoOverride`)
- Test: `internal/adapter/postgres/repository_test.go`

**Interfaces:**
- Consumes: `domain.PhotoOverride`, `Species.PhotoOverride` (Tarefa 2) e a tabela `photo_override` (Tarefa 3).
- Produces: `func (r *IngestRepository) PhotoOverride(ctx context.Context, speciesID string) (domain.PhotoOverride, error)`, que devolve o valor zero sem linha. A Tarefa 9 o usa pela interface `ingest.OverrideSource`.

- [ ] **Step 1: Dados de teste**

```bash
cd internal/adapter/curated/testdata
mkdir -p photos photos-typo photos-conflict
cp valid/turdus-rufiventris.yaml photos/turdus-rufiventris.yaml
cat >> photos/turdus-rufiventris.yaml <<'EOF'
photos:
  primary: { observation: 123456, photo: 219317614 }
  exclude: [219317615, 219317616]
EOF
cp valid/turdus-rufiventris.yaml photos-typo/bad.yaml
cat >> photos-typo/bad.yaml <<'EOF'
photos:
  primari: { observation: 123456, photo: 219317614 }
EOF
cp valid/turdus-rufiventris.yaml photos-conflict/bad.yaml
cat >> photos-conflict/bad.yaml <<'EOF'
photos:
  primary: { observation: 123456, photo: 219317614 }
  exclude: [219317614]
EOF
cd -
```

Se o `valid/turdus-rufiventris.yaml` não terminar com quebra de linha, o `cat >>` gruda a chave na última linha. Confira com `tail -c1 ... | xxd`; se faltar, faça `echo >>` antes.

- [ ] **Step 2: Testes do loader que falham**

Em `loader_test.go`, acrescente (siga o estilo dos testes `typo` e `invalid-biome` que já existem):

```go
// A chave photos: vira o override da espécie, com os ids como texto.
func TestLoadDir_PhotosOverride(t *testing.T) {
	all, err := curated.LoadDir("testdata/photos")
	if err != nil {
		t.Fatal(err)
	}
	o := all[0].PhotoOverride
	if o == nil || o.PrimaryObservationID != "123456" || o.PrimaryPhotoID != "219317614" ||
		len(o.ExcludedIDs) != 2 || o.ExcludedIDs[1] != "219317616" {
		t.Fatalf("override lido errado: %+v", o)
	}
}

// Sem a chave photos:, não há override.
func TestLoadDir_NoPhotosKeyMeansNoOverride(t *testing.T) {
	all, err := curated.LoadDir("testdata/valid")
	if err != nil || all[0].PhotoOverride != nil {
		t.Fatalf("esperava sem override: %+v %v", all[0].PhotoOverride, err)
	}
}

// Chave errada dentro de photos: também é recusada (KnownFields).
func TestLoadDir_PhotosTypoIsError(t *testing.T) {
	if _, err := curated.LoadDir("testdata/photos-typo"); err == nil || !strings.Contains(err.Error(), "primari") {
		t.Fatalf("esperava erro citando a chave errada, veio %v", err)
	}
}

// A principal que também está excluída é recusada.
func TestLoadDir_PrimaryExcludedIsError(t *testing.T) {
	if _, err := curated.LoadDir("testdata/photos-conflict"); err == nil || !strings.Contains(err.Error(), "photos.exclude") {
		t.Fatalf("esperava erro em photos.exclude, veio %v", err)
	}
}
```

Acrescente `"strings"` aos imports, se faltar.

Run: `go test ./internal/adapter/curated/`
Expected: FAIL. O `TestLoadDir_PhotosOverride` falha com `field photos not found in type curated.speciesFile`, e o conflito falha pelo mesmo motivo.

- [ ] **Step 3: Implementar no loader**

Em `loader.go`, acrescente ao `speciesFile`, depois de `Facts`:

```go
	Photos               *photosFile `yaml:"photos"` // nil = sem a chave
```

Depois do `factFile`:

```go
// photosFile é a chave photos: do YAML, a escolha manual de fotos:
//
//	photos:
//	  primary: { observation: 123456, photo: 219317614 }
//	  exclude: [219317615, 219317616]
//
// Os ids são números no YAML (é como o iNaturalist os mostra) e viram texto no
// domínio. O KnownFields(true) do decoder vale também aqui dentro.
type photosFile struct {
	Primary *primaryFile `yaml:"primary"`
	Exclude []int64      `yaml:"exclude"`
}

// primaryFile é a foto principal: a observação e a foto dentro dela. As
// duas são necessárias porque a API do iNaturalist não busca foto pelo id
// sozinho, só a observação inteira.
type primaryFile struct {
	Observation int64 `yaml:"observation"`
	Photo       int64 `yaml:"photo"`
}

// toDomain converte a chave do YAML no override do domínio. A validação
// (ids positivos, principal fora das exclusões) fica no domínio.
func (p photosFile) toDomain() *domain.PhotoOverride {
	o := &domain.PhotoOverride{}
	if p.Primary != nil {
		o.PrimaryObservationID = strconv.FormatInt(p.Primary.Observation, 10)
		o.PrimaryPhotoID = strconv.FormatInt(p.Primary.Photo, 10)
	}
	for _, id := range p.Exclude {
		o.ExcludedIDs = append(o.ExcludedIDs, strconv.FormatInt(id, 10))
	}
	return o
}
```

Em `loadFile`, antes do `if err := s.Validate()`:

```go
	if f.Photos != nil {
		s.PhotoOverride = f.Photos.toDomain()
	}
```

Acrescente `"strconv"` aos imports.

Run: `go test ./internal/adapter/curated/`
Expected: `ok`

- [ ] **Step 4: Teste do override no banco, que falha**

Em `repository_test.go`, acrescente:

```go
// O seed grava o override; o worker lê; tirar a chave do YAML apaga a linha.
func TestUpsertCurated_PhotoOverride(t *testing.T) {
	repo, pool := newRepo(t)
	ctx := context.Background()
	ingestRepo := postgres.NewIngestRepository(pool)
	s := sp("Turdus rufiventris", "Sabiá-laranjeira", nil)
	s.PhotoOverride = &domain.PhotoOverride{PrimaryObservationID: "123456", PrimaryPhotoID: "219317614", ExcludedIDs: []string{"5"}}
	seed(t, repo, s)

	got, err := ingestRepo.PhotoOverride(ctx, s.ID)
	if err != nil || got.PrimaryPhotoID != "219317614" || got.PrimaryObservationID != "123456" || !got.Excludes("5") {
		t.Fatalf("override lido: %+v %v", got, err)
	}

	s.PhotoOverride = &domain.PhotoOverride{ExcludedIDs: []string{"9"}} // só exclusão
	seed(t, repo, s)
	if got, _ = ingestRepo.PhotoOverride(ctx, s.ID); got.HasPrimary() || !got.Excludes("9") || got.Excludes("5") {
		t.Fatalf("o seed deveria trocar o override inteiro: %+v", got)
	}

	s.PhotoOverride = nil // a chave photos: saiu do YAML
	seed(t, repo, s)
	if got, err = ingestRepo.PhotoOverride(ctx, s.ID); err != nil || got.HasPrimary() || len(got.ExcludedIDs) != 0 {
		t.Fatalf("sem a chave, o override deveria sumir: %+v %v", got, err)
	}
}
```

Run: `go test ./internal/adapter/postgres/ -run TestUpsertCurated_PhotoOverride`
Expected: FAIL na compilação (`ingestRepo.PhotoOverride undefined`)

- [ ] **Step 5: SQL e repositório**

Em `queries.sql`, no fim:

```sql
-- name: UpsertPhotoOverride :exec
-- Grava a escolha manual de fotos do YAML (chave photos:). EXCLUDED.x é o
-- valor que a linha nova traria: no conflito, a linha inteira é trocada.
INSERT INTO photo_override (species_id, primary_observation_id, primary_photo_id, excluded_ids)
VALUES ($1, $2, $3, $4)
ON CONFLICT (species_id) DO UPDATE SET
    primary_observation_id = EXCLUDED.primary_observation_id,
    primary_photo_id = EXCLUDED.primary_photo_id,
    excluded_ids = EXCLUDED.excluded_ids;

-- name: DeletePhotoOverride :exec
-- O YAML deixou de ter a chave photos: a escolha manual some.
DELETE FROM photo_override WHERE species_id = $1;
```

Em `queries_ingest.sql`, no fim:

```sql
-- name: GetPhotoOverride :one
-- A escolha manual de fotos da espécie, lida pelo worker antes da curadoria.
SELECT primary_observation_id, primary_photo_id, excluded_ids FROM photo_override WHERE species_id = $1;
```

Run: `go tool sqlc generate`

Em `repository.go`, no `UpsertCurated`, antes do `return tx.Commit(ctx)`:

```go
	// O override de fotos também é conteúdo curado: segue o YAML, inclusive
	// sumindo quando a chave photos: sai do arquivo.
	if s.PhotoOverride == nil {
		if err := q.DeletePhotoOverride(ctx, s.ID); err != nil {
			return err
		}
	} else {
		o := s.PhotoOverride
		// A coluna é NOT NULL: uma lista nil viraria NULL no pgx, então
		// mandamos uma lista vazia de verdade.
		excluded := append([]string{}, o.ExcludedIDs...)
		if err := q.UpsertPhotoOverride(ctx, sqlcgen.UpsertPhotoOverrideParams{SpeciesID: s.ID,
			PrimaryObservationID: pgtype.Text{String: o.PrimaryObservationID, Valid: o.HasPrimary()},
			PrimaryPhotoID:       pgtype.Text{String: o.PrimaryPhotoID, Valid: o.HasPrimary()},
			ExcludedIds:          excluded}); err != nil {
			return err
		}
	}
```

Em `ingest_repository.go`, acrescente:

```go
// PhotoOverride lê a escolha manual de fotos da espécie. Sem linha (o YAML
// não tem a chave photos:), devolve o override vazio, sem erro.
func (r *IngestRepository) PhotoOverride(ctx context.Context, speciesID string) (domain.PhotoOverride, error) {
	row, err := r.q.GetPhotoOverride(ctx, speciesID)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.PhotoOverride{}, nil
	}
	if err != nil {
		return domain.PhotoOverride{}, fmt.Errorf("ler override: %w", err)
	}
	return domain.PhotoOverride{PrimaryObservationID: row.PrimaryObservationID.String,
		PrimaryPhotoID: row.PrimaryPhotoID.String, ExcludedIDs: row.ExcludedIds}, nil
}
```

Acrescente os imports `"errors"` e `"github.com/jackc/pgx/v5"`. Siga os nomes que o sqlc gerar (por exemplo, `ExcludedIds`).

- [ ] **Step 6: Rodar, conferir o conteúdo real e commitar**

Run: `go tool sqlc diff && go test -race ./... && golangci-lint run`
Expected: tudo verde. O `content/content_test.go` carrega os 41 YAML reais, que ainda não têm `photos:`, e continua passando.

```bash
git add internal/
git commit -m "feat: chave photos: no seed grava o override de fotos da espécie"
git push -u origin feat/curadoria-banco
gh pr create --title "Curadoria no banco: migração 0004, campos das fotos e chave photos: no seed" --body "..."
```

No corpo do PR, resuma a migração, a chave `photos:` com um exemplo e o que fica para os PRs 7 e 8.

---

## Tarefa 5 — Cliente do iNaturalist: candidatas para a curadoria (`feat/inaturalist-candidatas`, PR 7)

**Files:**
- Modify: `internal/usecase/ingest/ports.go` (`PhotoCandidate`, `PhotoSource`)
- Modify: `internal/adapter/sources/inaturalist/client.go`
- Create: `internal/adapter/sources/inaturalist/annotation_test.go`
- Create: `internal/adapter/sources/inaturalist/testdata/observations-curation.json`
- Create: `internal/adapter/sources/inaturalist/testdata/observation-one.json`
- Test: `internal/adapter/sources/inaturalist/client_test.go`
- Modify: `internal/usecase/ingest/fakes_test.go` (`fakePhotoSource`)
- Modify: `internal/usecase/ingest/photos.go` (só a chamada `FindPhotos` com o novo sentido do número)

**Interfaces:**
- Produces:
  - `PhotoCandidate` ganha `ObservationID string` e `Votes int`;
  - `PhotoSource` passa a ter dois métodos: `FindPhotos(ctx, scientificName string, observations int) ([]PhotoCandidate, error)`, que traz até 3 fotos por observação e já sai filtrado pelas anotações, e `FindObservationPhoto(ctx, observationID, photoID string) (PhotoCandidate, bool, error)`, que devolve `false` quando a observação ou a foto não existe.

- [ ] **Step 1: Branch empilhado**

```bash
git checkout -b feat/inaturalist-candidatas
```

- [ ] **Step 2: Teste da tabela de anotações, que falha**

`annotation_test.go` (pacote interno `inaturalist`, para testar a função não exportada):

```go
// Testes do filtro de anotações: cada par (termo, valor) da tabela da spec
// descarta a observação, e o voto negativo da comunidade é ignorado.

package inaturalist

import "testing"

func TestRejectedByAnnotation(t *testing.T) {
	cases := []struct {
		name string
		ann  annotation
		want bool
	}{
		{"morto", annotation{AttributeID: 17, ValueID: 19, VoteScore: 1}, true},
		{"vivo", annotation{AttributeID: 17, ValueID: 18, VoteScore: 3}, false},
		{"ovo (estágio de vida)", annotation{AttributeID: 1, ValueID: 7, VoteScore: 0}, true},
		{"adulto", annotation{AttributeID: 1, ValueID: 2, VoteScore: 2}, false},
		{"pena", annotation{AttributeID: 22, ValueID: 23, VoteScore: 1}, true},
		{"osso", annotation{AttributeID: 22, ValueID: 27, VoteScore: 1}, true},
		{"muda", annotation{AttributeID: 22, ValueID: 28, VoteScore: 1}, true},
		{"ovo (evidência)", annotation{AttributeID: 22, ValueID: 30, VoteScore: 1}, true},
		{"construção (ninho)", annotation{AttributeID: 22, ValueID: 35, VoteScore: 1}, true},
		{"organismo (evidência)", annotation{AttributeID: 22, ValueID: 24, VoteScore: 1}, false},
		{"pena com voto negativo", annotation{AttributeID: 22, ValueID: 23, VoteScore: -1}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := rejectedByAnnotation([]annotation{c.ann}); got != c.want {
				t.Fatalf("rejectedByAnnotation(%+v) = %v, esperava %v", c.ann, got, c.want)
			}
		})
	}
	if rejectedByAnnotation(nil) {
		t.Fatal("sem anotação, a observação fica")
	}
}
```

Run: `go test ./internal/adapter/sources/inaturalist/ -run TestRejectedByAnnotation`
Expected: FAIL na compilação (`undefined: annotation`)

- [ ] **Step 3: Fixtures de observações**

`testdata/observations-curation.json`. Observação 1: 4 fotos, das quais ficam 3, com 7 votos. Observação 2: anotada como morta, descartada. Observação 3: pena com voto negativo, fica. Observação 4: sem fotos.

```json
{
 "total_results": 4,
 "results": [
  {
   "id": 1001, "uri": "https://www.inaturalist.org/observations/1001", "faves_count": 7,
   "annotations": [{"controlled_attribute_id": 17, "controlled_value_id": 18, "vote_score": 2}],
   "photos": [
    {"id": 11, "url": "https://inaturalist-open-data.s3.amazonaws.com/photos/11/square.jpeg", "license_code": "cc-by", "attribution": "(c) A", "original_dimensions": {"width": 2048, "height": 1365}},
    {"id": 12, "url": "https://inaturalist-open-data.s3.amazonaws.com/photos/12/square.jpeg", "license_code": "cc-by", "attribution": "(c) A", "original_dimensions": {"width": 2048, "height": 1365}},
    {"id": 13, "url": "https://inaturalist-open-data.s3.amazonaws.com/photos/13/square.jpeg", "license_code": "cc-by", "attribution": "(c) A", "original_dimensions": {"width": 2048, "height": 1365}},
    {"id": 14, "url": "https://inaturalist-open-data.s3.amazonaws.com/photos/14/square.jpeg", "license_code": "cc-by", "attribution": "(c) A", "original_dimensions": {"width": 2048, "height": 1365}}
   ]
  },
  {
   "id": 1002, "uri": "https://www.inaturalist.org/observations/1002", "faves_count": 3,
   "annotations": [{"controlled_attribute_id": 17, "controlled_value_id": 19, "vote_score": 1}],
   "photos": [
    {"id": 21, "url": "https://inaturalist-open-data.s3.amazonaws.com/photos/21/square.jpeg", "license_code": "cc0", "attribution": "(c) B", "original_dimensions": {"width": 1024, "height": 768}}
   ]
  },
  {
   "id": 1003, "uri": "https://www.inaturalist.org/observations/1003", "faves_count": 0,
   "annotations": [{"controlled_attribute_id": 22, "controlled_value_id": 23, "vote_score": -1}],
   "photos": [
    {"id": 31, "url": "https://inaturalist-open-data.s3.amazonaws.com/photos/31/square.jpeg", "license_code": "cc-by-nc", "attribution": "(c) C", "original_dimensions": {"width": 1024, "height": 768}}
   ]
  },
  {"id": 1004, "uri": "https://www.inaturalist.org/observations/1004", "faves_count": 1, "annotations": [], "photos": []}
 ]
}
```

`testdata/observation-one.json` é a resposta de `GET /v1/observations/1001`, com 5 fotos. A foto 15 é a 5ª: o override acha foto fora das 3 primeiras.

```json
{
 "total_results": 1,
 "results": [
  {
   "id": 1001, "uri": "https://www.inaturalist.org/observations/1001", "faves_count": 7, "annotations": [],
   "photos": [
    {"id": 11, "url": "https://inaturalist-open-data.s3.amazonaws.com/photos/11/square.jpeg", "license_code": "cc-by", "attribution": "(c) A"},
    {"id": 12, "url": "https://inaturalist-open-data.s3.amazonaws.com/photos/12/square.jpeg", "license_code": "cc-by", "attribution": "(c) A"},
    {"id": 13, "url": "https://inaturalist-open-data.s3.amazonaws.com/photos/13/square.jpeg", "license_code": "cc-by", "attribution": "(c) A"},
    {"id": 14, "url": "https://inaturalist-open-data.s3.amazonaws.com/photos/14/square.jpeg", "license_code": "cc-by", "attribution": "(c) A"},
    {"id": 15, "url": "https://inaturalist-open-data.s3.amazonaws.com/photos/15/square.jpeg", "license_code": "cc-by-sa", "attribution": "(c) A", "original_dimensions": {"width": 1600, "height": 1200}}
   ]
  }
 ]
}
```

- [ ] **Step 4: Testes do cliente que falham**

Em `client_test.go`, troque a função `server` por estas duas (a antiga passa a chamar a nova):

```go
// server responde a busca de táxon com o arquivo dado e a de observações
// com observations.json.
func server(t *testing.T, taxaFile string) *httptest.Server {
	return serverWith(t, taxaFile, "testdata/observations.json")
}

// serverWith é o servidor falso com o arquivo de observações escolhido. Ele
// também responde GET /v1/observations/{id}: o id 1001 devolve
// observation-one.json, e qualquer outro dá 404.
func serverWith(t *testing.T, taxaFile, obsFile string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("User-Agent") == "" {
			t.Error("User-Agent ausente")
		}
		var file string
		switch {
		case r.URL.Path == "/v1/taxa":
			file = taxaFile
		case r.URL.Path == "/v1/observations":
			q := r.URL.Query()
			if q.Get("place_id") != "6878" || q.Get("taxon_id") != "12738" || !strings.Contains(q.Get("photo_license"), "cc-by") {
				t.Errorf("parâmetros errados: %v", q)
			}
			file = obsFile
		case r.URL.Path == "/v1/observations/1001":
			file = "testdata/observation-one.json"
		default:
			http.NotFound(w, r)
			return
		}
		b, _ := os.ReadFile(file) //nolint:gosec // caminhos fixos de testdata
		_, _ = w.Write(b)
	}))
}
```

E acrescente:

```go
// Até 3 fotos por observação, com a observação e os votos; a observação
// anotada como morta sai, e a sem foto não gera candidata.
func TestFindPhotos_CurationCandidates(t *testing.T) {
	srv := serverWith(t, "testdata/taxa.json", "testdata/observations-curation.json")
	defer srv.Close()
	c := inaturalist.New(srv.URL, "ua", rate.NewLimiter(rate.Inf, 1))
	photos, err := c.FindPhotos(context.Background(), "Turdus rufiventris", 20)
	if err != nil {
		t.Fatal(err)
	}
	var ids []string
	for _, p := range photos {
		ids = append(ids, p.SourceID)
	}
	if strings.Join(ids, ",") != "11,12,13,31" {
		t.Fatalf("candidatas: %v (esperava 11,12,13 da obs 1001 e 31 da 1003)", ids)
	}
	if photos[0].ObservationID != "1001" || photos[0].Votes != 7 || photos[2].Votes != 7 || photos[3].Votes != 0 {
		t.Fatalf("observação ou votos errados: %+v", photos)
	}
}

// A busca pede 20 observações por página (o número que o caso de uso passa).
func TestFindPhotos_PerPageIsObservations(t *testing.T) {
	var perPage string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/taxa" {
			b, _ := os.ReadFile("testdata/taxa.json")
			_, _ = w.Write(b)
			return
		}
		perPage = r.URL.Query().Get("per_page")
		_, _ = w.Write([]byte(`{"results":[]}`))
	}))
	defer srv.Close()
	if _, err := inaturalist.New(srv.URL, "ua", rate.NewLimiter(rate.Inf, 1)).FindPhotos(context.Background(), "Turdus rufiventris", 20); err != nil {
		t.Fatal(err)
	}
	if perPage != "20" {
		t.Fatalf("per_page = %q, esperava 20", perPage)
	}
}

// FindObservationPhoto acha qualquer foto da observação (aqui a 5ª), com a
// URL grande e o crédito.
func TestFindObservationPhoto_Found(t *testing.T) {
	srv := server(t, "testdata/taxa.json")
	defer srv.Close()
	p, ok, err := inaturalist.New(srv.URL, "ua", rate.NewLimiter(rate.Inf, 1)).FindObservationPhoto(context.Background(), "1001", "15")
	if err != nil || !ok {
		t.Fatalf("esperava achar: %v %v", ok, err)
	}
	if p.SourceID != "15" || p.ObservationID != "1001" || p.License != "cc-by-sa" || p.Votes != 7 ||
		!strings.Contains(p.URL, "/15/large.") || p.PageURL != "https://www.inaturalist.org/observations/1001" || p.Width != 1600 {
		t.Fatalf("candidata do override: %+v", p)
	}
}

// Foto que não está na observação, ou observação que não existe (404): não
// achou, sem erro.
func TestFindObservationPhoto_NotFound(t *testing.T) {
	srv := server(t, "testdata/taxa.json")
	defer srv.Close()
	c := inaturalist.New(srv.URL, "ua", rate.NewLimiter(rate.Inf, 1))
	for _, ids := range [][2]string{{"1001", "99"}, {"404", "1"}} {
		if _, ok, err := c.FindObservationPhoto(context.Background(), ids[0], ids[1]); err != nil || ok {
			t.Fatalf("%v: esperava não achar sem erro, veio ok=%v err=%v", ids, ok, err)
		}
	}
}
```

Run: `go test ./internal/adapter/sources/inaturalist/`
Expected: FAIL na compilação (`FindObservationPhoto undefined`, `annotation` indefinido)

- [ ] **Step 5: Implementar o cliente**

Em `ports.go`, troque `PhotoCandidate` e `PhotoSource` por:

```go
// PhotoCandidate é uma foto encontrada na fonte (ainda não baixada).
type PhotoCandidate struct {
	SourceID      string // id da foto na fonte; faz parte da chave no storage
	ObservationID string // id da observação; a galeria aceita até 2 fotos de cada
	Votes         int    // votos da observação (faves); fotos da mesma observação empatam
	URL           string // URL do arquivo em tamanho grande
	PageURL       string // página da observação (crédito)
	License       string // como a fonte informa (ex.: "cc-by-nc")
	Author        string
	Width         int
	Height        int
}
```

```go
// PhotoSource é a fonte de fotos (iNaturalist).
type PhotoSource interface {
	// FindPhotos busca até `observations` observações da espécie e devolve
	// até 3 fotos de cada, sem as observações anotadas como morto, ovo, pena,
	// osso, muda ou ninho.
	FindPhotos(ctx context.Context, scientificName string, observations int) ([]PhotoCandidate, error)
	// FindObservationPhoto busca uma foto dentro de uma observação (a
	// principal escolhida no YAML). ok=false: a observação ou a foto não existe.
	FindObservationPhoto(ctx context.Context, observationID, photoID string) (PhotoCandidate, bool, error)
}
```

Em `client.go`:

1. **Tipos da resposta.** Troque a `observationsResponse` por estes tipos:

```go
// observation é a parte usada de uma observação: id, página, votos
// (faves_count, o campo que o order_by=votes usa), anotações e fotos.
type observation struct {
	ID          int          `json:"id"`
	URI         string       `json:"uri"`
	FavesCount  int          `json:"faves_count"`
	Annotations []annotation `json:"annotations"`
	Photos      []photo      `json:"photos"`
}

// annotation é uma anotação da comunidade ("está morto", "é uma pena"...).
// Os ids vêm de /v1/controlled_terms. vote_score é o saldo de votos: abaixo
// de 0, a comunidade discordou da anotação.
type annotation struct {
	AttributeID int `json:"controlled_attribute_id"`
	ValueID     int `json:"controlled_value_id"`
	VoteScore   int `json:"vote_score"`
}

// photo é uma foto de uma observação: id, URL, licença, autoria e dimensões.
type photo struct {
	ID          int    `json:"id"`
	URL         string `json:"url"`
	LicenseCode string `json:"license_code"`
	Attribution string `json:"attribution"`
	Dimensions  *struct {
		Width  int `json:"width"`
		Height int `json:"height"`
	} `json:"original_dimensions"`
}

// observationsResponse é a resposta de /v1/observations (e de /v1/observations/{id}).
type observationsResponse struct {
	Results []observation `json:"results"`
}
```

2. **Constantes e o filtro.** Acrescente:

```go
// photosPerObservation: quantas fotos de cada observação viram candidatas.
// As primeiras costumam ser as melhores; a 4ª em diante quase sempre repete.
const photosPerObservation = 3

// rejectedAnnotations: termo -> valores que tiram a observação inteira.
// A busca da API não filtra isso direito (sem term_id o parâmetro é
// ignorado; com term_id ela também exclui quem não tem a anotação), por
// isso o filtro é feito aqui, sobre as anotações da resposta.
var rejectedAnnotations = map[int]map[int]bool{
	17: {19: true}, // Alive or Dead: Dead
	1:  {7: true},  // Life Stage: Egg
	22: {23: true, 27: true, 28: true, 30: true, 35: true}, // Evidence of Presence: Feather, Bone, Molt, Egg, Construction
}

// rejectedByAnnotation diz se alguma anotação, com saldo de votos >= 0,
// marca a observação como morto, ovo, pena, osso, muda ou ninho. A anotação
// vale para a observação inteira; o curador continua olhando foto por foto.
func rejectedByAnnotation(anns []annotation) bool {
	for _, a := range anns {
		if a.VoteScore >= 0 && rejectedAnnotations[a.AttributeID][a.ValueID] {
			return true
		}
	}
	return false
}

// candidate converte uma foto da observação em candidata. A API devolve a
// miniatura quadrada; a versão grande tem o mesmo caminho com "large.".
func candidate(o observation, p photo) ingest.PhotoCandidate {
	c := ingest.PhotoCandidate{
		SourceID: strconv.Itoa(p.ID), ObservationID: strconv.Itoa(o.ID), Votes: o.FavesCount,
		URL:     strings.Replace(p.URL, "square.", "large.", 1),
		PageURL: o.URI, License: p.LicenseCode, Author: p.Attribution,
	}
	if p.Dimensions != nil {
		c.Width, c.Height = p.Dimensions.Width, p.Dimensions.Height
	}
	return c
}

// errNotFound: a API respondeu 404.
var errNotFound = errors.New("inaturalist: não encontrado")
```

3. **`FindPhotos`.** Troque o comentário e o laço de montagem:

```go
// FindPhotos busca o táxon pelo nome científico e depois as observações dele
// no Brasil: só "research grade" (identificação confirmada pela comunidade),
// só com as licenças aceitas e ordenadas pelos votos. De cada observação que
// passa no filtro de anotações, ficam até 3 fotos.
func (c *Client) FindPhotos(ctx context.Context, scientificName string, observations int) ([]ingest.PhotoCandidate, error) {
```

O `"per_page"` vira `{strconv.Itoa(observations)}`, e o laço vira:

```go
	var out []ingest.PhotoCandidate
	for _, o := range obs.Results {
		if rejectedByAnnotation(o.Annotations) {
			continue
		}
		for _, p := range o.Photos[:min(len(o.Photos), photosPerObservation)] {
			out = append(out, candidate(o, p))
		}
	}
	return out, nil
```

4. **`FindObservationPhoto`.** Acrescente:

```go
// FindObservationPhoto busca a observação pelo id e procura a foto entre
// TODAS as dela (não só as 3 primeiras): é a principal escolhida à mão no
// YAML. A API não tem busca de foto pelo id. Observação inexistente (404)
// ou foto fora dela: ok=false, sem erro. O filtro de anotações não vale
// aqui: o dono escolheu essa foto olhando para ela.
func (c *Client) FindObservationPhoto(ctx context.Context, observationID, photoID string) (ingest.PhotoCandidate, bool, error) {
	var obs observationsResponse
	err := c.getJSON(ctx, "/v1/observations/"+url.PathEscape(observationID), url.Values{}, &obs)
	if errors.Is(err, errNotFound) {
		return ingest.PhotoCandidate{}, false, nil
	}
	if err != nil {
		return ingest.PhotoCandidate{}, false, err
	}
	for _, o := range obs.Results {
		for _, p := range o.Photos {
			if strconv.Itoa(p.ID) == photoID {
				return candidate(o, p), true, nil
			}
		}
	}
	return ingest.PhotoCandidate{}, false, nil
}
```

5. **`getJSON`.** Antes do teste de `StatusOK`:

```go
	if resp.StatusCode == http.StatusNotFound {
		return errNotFound
	}
```

Acrescente o import `"errors"`.

Na doc do pacote, troque "Fica com a primeira foto de cada observação" (se aparecer) pela regra nova.

- [ ] **Step 6: Ajustar quem usa a interface**

Em `fakes_test.go`, troque o `fakePhotoSource` por:

```go
// fakePhotoSource devolve as candidatas e o erro configurados. primary é a
// resposta do FindObservationPhoto, por id da foto (ausente = não achou).
type fakePhotoSource struct {
	cands   []ingest.PhotoCandidate
	err     error
	primary map[string]ingest.PhotoCandidate
}

func (f fakePhotoSource) FindPhotos(context.Context, string, int) ([]ingest.PhotoCandidate, error) {
	return f.cands, f.err
}

func (f fakePhotoSource) FindObservationPhoto(_ context.Context, _, photoID string) (ingest.PhotoCandidate, bool, error) {
	c, ok := f.primary[photoID]
	return c, ok, nil
}
```

Em `photos.go`, a chamada passa a ser `u.Source.FindPhotos(ctx, job.ScientificName, u.MaxPhotos*2)`, sem mudar o número. O sentido mudou ("observações", não "fotos"), mas a Tarefa 9 reescreve esse caso de uso. Atualize só o comentário da linha:

```go
	// Pedimos observações, e cada uma pode trazer até 3 fotos.
```

- [ ] **Step 7: Rodar e commitar**

Run: `go test -race ./... && golangci-lint run`
Expected: tudo verde.

```bash
git add internal/
git commit -m "feat: iNaturalist traz até 3 fotos por observação, filtra anotações e busca a foto do override"
git push -u origin feat/inaturalist-candidatas
gh pr create --base feat/curadoria-banco --title "iNaturalist: candidatas para a curadoria" --body "..."
```

---

## Tarefa 6 — Cliente gRPC do curador (`feat/ingestao-curada`, PR 8)

**Files:**
- Modify: `go.mod`, `go.sum` (`passarim-proto` v0.3.0)
- Modify: `internal/usecase/ingest/ports.go` (`ErrCuratorUnavailable`, `CuratorPhoto`, `PhotoVerdict`, `PhotoCurator`, `MaxCuratorBatch`)
- Create: `internal/adapter/curator/client.go`
- Test: `internal/adapter/curator/client_test.go`

**Interfaces:**
- Consumes: `domain.PhotoCategory` (Tarefa 2).
- Produces:
  - `ingest.ErrCuratorUnavailable` (um erro sentinela);
  - `ingest.MaxCuratorBatch = 8`;
  - `type CuratorPhoto struct{ PhotoID string; Image []byte }`;
  - `type PhotoVerdict struct{ PhotoID string; Category domain.PhotoCategory; BirdCount int; LargestBirdArea, Sharpness, Confidence float64; LargestBirdCut bool }`;
  - `type PhotoCurator interface{ ClassifyPhotos(ctx, []CuratorPhoto) ([]PhotoVerdict, string, error) }`;
  - `curator.New(addr string, timeout time.Duration) (*curator.Client, error)` e `(*Client).Close() error`.

- [ ] **Step 1: Branch, contrato novo e portas**

```bash
git checkout -b feat/ingestao-curada
go get github.com/velosobr/passarim-proto@v0.3.0 && go mod tidy
```

Em `ports.go`, acrescente (e o import `"errors"`):

```go
// ErrCuratorUnavailable: o curador está fora do ar, subindo ou não
// respondeu no prazo. O job de fotos devolve este erro ANTES de trocar
// qualquer foto, e o Runner adia o job sem gastar tentativa (é uma falha
// do nosso lado, não da espécie).
var ErrCuratorUnavailable = errors.New("curador indisponível")

// MaxCuratorBatch é o maior lote que o curador aceita (o contrato diz 8).
const MaxCuratorBatch = 8

// CuratorPhoto é uma foto mandada ao curador: o id (ecoado na resposta) e
// os bytes WebP da variante medium.
type CuratorPhoto struct {
	PhotoID string
	Image   []byte
}

// PhotoVerdict é o que o curador diz de uma foto (espelha o PhotoVerdict do
// curator.proto, sem tipos do gRPC).
type PhotoVerdict struct {
	PhotoID         string
	Category        domain.PhotoCategory
	BirdCount       int
	LargestBirdArea float64 // fração da foto ocupada pela maior ave, de 0 a 1
	LargestBirdCut  bool    // a maior ave encosta na borda
	Sharpness       float64 // de 0 a 1
	Confidence      float64 // de 0 a 1
}

// PhotoCurator classifica até MaxCuratorBatch fotos por chamada. Devolve os
// vereditos na ordem do pedido e a versão do modelo. Curador fora do ar ou
// sem resposta no prazo: ErrCuratorUnavailable.
type PhotoCurator interface {
	ClassifyPhotos(ctx context.Context, photos []CuratorPhoto) ([]PhotoVerdict, string, error)
}
```

- [ ] **Step 2: Testes do adapter, que falham**

`internal/adapter/curator/client_test.go` (pacote interno, para montar o cliente sobre uma conexão em memória):

```go
// Testes do cliente do curador contra um servidor gRPC falso que roda na
// memória (bufconn): nenhuma porta de rede, nenhum modelo.

package curator

import (
	"context"
	"errors"
	"net"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"

	curatorv1 "github.com/velosobr/passarim-proto/gen/go/passarim/curator/v1"

	"github.com/velosobr/passarim-catalog/internal/domain"
	"github.com/velosobr/passarim-catalog/internal/usecase/ingest"
)

// fakeServer responde cada pedido com a função reply.
type fakeServer struct {
	curatorv1.UnimplementedPhotoCuratorServiceServer
	reply func(context.Context, *curatorv1.ClassifyPhotosRequest) (*curatorv1.ClassifyPhotosResponse, error)
}

func (f fakeServer) ClassifyPhotos(ctx context.Context, r *curatorv1.ClassifyPhotosRequest) (*curatorv1.ClassifyPhotosResponse, error) {
	return f.reply(ctx, r)
}

// newTestClient sobe o servidor falso num bufconn (uma "rede" dentro do
// processo) e devolve o cliente ligado a ele.
func newTestClient(t *testing.T, timeout time.Duration, reply func(context.Context, *curatorv1.ClassifyPhotosRequest) (*curatorv1.ClassifyPhotosResponse, error)) *Client {
	t.Helper()
	lis := bufconn.Listen(1 << 20)
	srv := grpc.NewServer()
	curatorv1.RegisterPhotoCuratorServiceServer(srv, fakeServer{reply: reply})
	go func() { _ = srv.Serve(lis) }()
	t.Cleanup(srv.Stop)
	conn, err := grpc.NewClient("passthrough:///bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) { return lis.DialContext(ctx) }),
		grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatal(err)
	}
	c := newClient(conn, timeout)
	t.Cleanup(func() { _ = c.Close() })
	return c
}

// echo devolve SINGLE_BIRD para cada foto, na ordem.
func echo(_ context.Context, r *curatorv1.ClassifyPhotosRequest) (*curatorv1.ClassifyPhotosResponse, error) {
	resp := &curatorv1.ClassifyPhotosResponse{ModelVersion: "m@2"}
	for _, p := range r.GetPhotos() {
		resp.Verdicts = append(resp.Verdicts, &curatorv1.PhotoVerdict{PhotoId: p.GetPhotoId(),
			Category: curatorv1.PhotoCategory_PHOTO_CATEGORY_SINGLE_BIRD, BirdCount: 1, LargestBirdArea: 0.5,
			LargestBirdCut: true, Sharpness: 0.25, Confidence: 0.75})
	}
	return resp, nil
}

var twoPhotos = []ingest.CuratorPhoto{{PhotoID: "1", Image: []byte("a")}, {PhotoID: "2", Image: []byte("b")}}

// Os campos do veredito e a versão do modelo chegam traduzidos para o domínio.
func TestClassify_MapsVerdicts(t *testing.T) {
	c := newTestClient(t, time.Second, echo)
	vs, version, err := c.ClassifyPhotos(context.Background(), twoPhotos)
	if err != nil {
		t.Fatal(err)
	}
	want := ingest.PhotoVerdict{PhotoID: "2", Category: domain.PhotoSingleBird, BirdCount: 1, LargestBirdArea: 0.5,
		LargestBirdCut: true, Sharpness: 0.25, Confidence: 0.75}
	if version != "m@2" || len(vs) != 2 || vs[1] != want {
		t.Fatalf("got %q %+v", version, vs)
	}
}

// Cada categoria do contrato vira a do domínio; um número desconhecido vira unspecified.
func TestClassify_MapsEveryCategory(t *testing.T) {
	for enum, want := range map[curatorv1.PhotoCategory]domain.PhotoCategory{
		curatorv1.PhotoCategory_PHOTO_CATEGORY_UNSPECIFIED: domain.PhotoUnspecified,
		curatorv1.PhotoCategory_PHOTO_CATEGORY_SINGLE_BIRD: domain.PhotoSingleBird,
		curatorv1.PhotoCategory_PHOTO_CATEGORY_FLOCK:       domain.PhotoFlock,
		curatorv1.PhotoCategory_PHOTO_CATEGORY_NEST:        domain.PhotoNest,
		curatorv1.PhotoCategory_PHOTO_CATEGORY_EGGS:        domain.PhotoEggs,
		curatorv1.PhotoCategory_PHOTO_CATEGORY_FEATHER:     domain.PhotoFeather,
		curatorv1.PhotoCategory_PHOTO_CATEGORY_DEAD_BIRD:   domain.PhotoDeadBird,
		curatorv1.PhotoCategory_PHOTO_CATEGORY_NO_BIRD:     domain.PhotoNoBird,
		curatorv1.PhotoCategory_PHOTO_CATEGORY_OTHER:       domain.PhotoOther,
		curatorv1.PhotoCategory(99):                        domain.PhotoUnspecified,
	} {
		if got := category(enum); got != want {
			t.Errorf("category(%v) = %q, esperava %q", enum, got, want)
		}
	}
}

// UNAVAILABLE (curador subindo) vira ErrCuratorUnavailable.
func TestClassify_UnavailableIsUnavailable(t *testing.T) {
	c := newTestClient(t, time.Second, func(context.Context, *curatorv1.ClassifyPhotosRequest) (*curatorv1.ClassifyPhotosResponse, error) {
		return nil, status.Error(codes.Unavailable, "subindo")
	})
	if _, _, err := c.ClassifyPhotos(context.Background(), twoPhotos); !errors.Is(err, ingest.ErrCuratorUnavailable) {
		t.Fatalf("esperava ErrCuratorUnavailable, veio %v", err)
	}
}

// Sem resposta dentro do prazo do cliente: DEADLINE_EXCEEDED, também indisponível.
func TestClassify_TimeoutIsUnavailable(t *testing.T) {
	c := newTestClient(t, 50*time.Millisecond, func(ctx context.Context, r *curatorv1.ClassifyPhotosRequest) (*curatorv1.ClassifyPhotosResponse, error) {
		<-ctx.Done()
		return nil, ctx.Err()
	})
	if _, _, err := c.ClassifyPhotos(context.Background(), twoPhotos); !errors.Is(err, ingest.ErrCuratorUnavailable) {
		t.Fatalf("esperava ErrCuratorUnavailable, veio %v", err)
	}
}

// O contexto de quem chama cancelado (SIGTERM, fim do prazo do job): também
// indisponível, para o job ser adiado e não gastar tentativa.
func TestClassify_CanceledIsUnavailable(t *testing.T) {
	c := newTestClient(t, time.Second, echo)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, _, err := c.ClassifyPhotos(ctx, twoPhotos); !errors.Is(err, ingest.ErrCuratorUnavailable) {
		t.Fatalf("esperava ErrCuratorUnavailable, veio %v", err)
	}
}

// INVALID_ARGUMENT é bug nosso: erro comum, que gasta tentativa.
func TestClassify_InvalidArgumentIsPlainError(t *testing.T) {
	c := newTestClient(t, time.Second, func(context.Context, *curatorv1.ClassifyPhotosRequest) (*curatorv1.ClassifyPhotosResponse, error) {
		return nil, status.Error(codes.InvalidArgument, "lote vazio")
	})
	_, _, err := c.ClassifyPhotos(context.Background(), twoPhotos)
	if err == nil || errors.Is(err, ingest.ErrCuratorUnavailable) {
		t.Fatalf("esperava erro comum, veio %v", err)
	}
}

// Resposta com outro número de vereditos ou em outra ordem é recusada:
// aceitar daria a categoria de uma foto a outra.
func TestClassify_RejectsMismatchedReply(t *testing.T) {
	replies := map[string]func(context.Context, *curatorv1.ClassifyPhotosRequest) (*curatorv1.ClassifyPhotosResponse, error){
		"um a menos": func(ctx context.Context, r *curatorv1.ClassifyPhotosRequest) (*curatorv1.ClassifyPhotosResponse, error) {
			resp, _ := echo(ctx, r)
			resp.Verdicts = resp.Verdicts[:1]
			return resp, nil
		},
		"fora de ordem": func(ctx context.Context, r *curatorv1.ClassifyPhotosRequest) (*curatorv1.ClassifyPhotosResponse, error) {
			resp, _ := echo(ctx, r)
			resp.Verdicts[0], resp.Verdicts[1] = resp.Verdicts[1], resp.Verdicts[0]
			return resp, nil
		},
	}
	for name, reply := range replies {
		t.Run(name, func(t *testing.T) {
			c := newTestClient(t, time.Second, reply)
			_, _, err := c.ClassifyPhotos(context.Background(), twoPhotos)
			if err == nil || errors.Is(err, ingest.ErrCuratorUnavailable) {
				t.Fatalf("esperava erro de contrato, veio %v", err)
			}
		})
	}
}

// Mais de 8 fotos nem sai do worker: é bug do caso de uso.
func TestClassify_RejectsBigBatch(t *testing.T) {
	c := newTestClient(t, time.Second, echo)
	if _, _, err := c.ClassifyPhotos(context.Background(), make([]ingest.CuratorPhoto, 9)); err == nil {
		t.Fatal("lote de 9 deveria ser recusado")
	}
}
```

Run: `go test ./internal/adapter/curator/`
Expected: FAIL na compilação (`undefined: newClient`)

- [ ] **Step 3: Implementar**

`internal/adapter/curator/client.go`:

```go
// Package curator é o cliente gRPC do passarim-photo-curator, o serviço em
// Python que diz o que cada foto mostra (ave sozinha, bando, ninho...).
//
// Quem usa: o caso de uso IngestPhotos do worker, pela porta
// ingest.PhotoCurator. Só o worker fala com o curador; a API, o BFF e o app
// nem sabem que ele existe.
//
// gRPC é um jeito de chamar uma função em outro processo pela rede: o
// contrato (curator.proto, no passarim-proto) define as mensagens, e o
// código gerado faz a conversa. Aqui só traduzimos os tipos gerados para os
// do domínio e os erros do gRPC para os que o caso de uso entende.
package curator

import (
	"context"
	"errors"
	"fmt"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"

	curatorv1 "github.com/velosobr/passarim-proto/gen/go/passarim/curator/v1"

	"github.com/velosobr/passarim-catalog/internal/domain"
	"github.com/velosobr/passarim-catalog/internal/usecase/ingest"
)

// Client fala com o curador. timeout é o prazo de cada chamada (o
// "deadline" do gRPC: passado esse tempo, a chamada desiste com
// DEADLINE_EXCEEDED).
type Client struct {
	conn    *grpc.ClientConn
	api     curatorv1.PhotoCuratorServiceClient
	timeout time.Duration
}

// Conferência em tempo de compilação: Client implementa ingest.PhotoCurator.
var _ ingest.PhotoCurator = (*Client)(nil)

// New prepara a conexão com o curador em addr (ex.: "photo-curator:50061").
// grpc.NewClient não conecta na hora: a conexão abre na primeira chamada e
// se refaz sozinha se o curador reiniciar.
//
// Sem TLS ("insecure"): o curador só é alcançável pela rede passarim-curation
// do compose, que é interna e só tem ele e o worker.
func New(addr string, timeout time.Duration) (*Client, error) {
	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("curador: configurar conexão: %w", err)
	}
	return newClient(conn, timeout), nil
}

// newClient monta o cliente sobre uma conexão pronta (os testes passam uma
// conexão em memória).
func newClient(conn *grpc.ClientConn, timeout time.Duration) *Client {
	return &Client{conn: conn, api: curatorv1.NewPhotoCuratorServiceClient(conn), timeout: timeout}
}

// Close fecha a conexão.
func (c *Client) Close() error { return c.conn.Close() }

// ClassifyPhotos manda um lote de até 8 fotos e devolve os vereditos na
// ordem do pedido, mais a versão do modelo.
func (c *Client) ClassifyPhotos(ctx context.Context, photos []ingest.CuratorPhoto) ([]ingest.PhotoVerdict, string, error) {
	if len(photos) == 0 || len(photos) > ingest.MaxCuratorBatch {
		return nil, "", fmt.Errorf("curador: lote de %d fotos (o contrato aceita de 1 a %d)", len(photos), ingest.MaxCuratorBatch)
	}
	req := &curatorv1.ClassifyPhotosRequest{}
	for _, p := range photos {
		req.Photos = append(req.Photos, &curatorv1.PhotoInput{PhotoId: p.PhotoID, Image: p.Image})
	}
	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()
	resp, err := c.api.ClassifyPhotos(ctx, req)
	if err != nil {
		return nil, "", translate(err)
	}
	// O contrato promete um veredito por foto, na mesma ordem. Se a resposta
	// não bater, é melhor falhar do que dar a categoria de uma foto a outra.
	if len(resp.GetVerdicts()) != len(photos) {
		return nil, "", fmt.Errorf("curador: %d vereditos para %d fotos", len(resp.GetVerdicts()), len(photos))
	}
	out := make([]ingest.PhotoVerdict, len(photos))
	for i, v := range resp.GetVerdicts() {
		if v.GetPhotoId() != photos[i].PhotoID {
			return nil, "", fmt.Errorf("curador: veredito %d é da foto %q, esperava %q", i, v.GetPhotoId(), photos[i].PhotoID)
		}
		out[i] = ingest.PhotoVerdict{PhotoID: v.GetPhotoId(), Category: category(v.GetCategory()),
			BirdCount: int(v.GetBirdCount()), LargestBirdArea: float64(v.GetLargestBirdArea()),
			LargestBirdCut: v.GetLargestBirdCut(), Sharpness: float64(v.GetSharpness()), Confidence: float64(v.GetConfidence())}
	}
	return out, resp.GetModelVersion(), nil
}

// translate separa "curador fora do ar" (adiar o job) de "erro de verdade"
// (gastar tentativa). status.Code lê o código gRPC do erro.
//   - UNAVAILABLE: o curador não está no ar ou está subindo.
//   - DEADLINE_EXCEEDED: não respondeu no prazo.
//   - CANCELED: quem chamou desistiu (SIGTERM ou fim do prazo do job).
func translate(err error) error {
	switch status.Code(err) {
	case codes.Unavailable, codes.DeadlineExceeded, codes.Canceled:
		return errors.Join(ingest.ErrCuratorUnavailable, err)
	}
	return fmt.Errorf("curador: %w", err)
}

// categories traduz o enum do contrato para o domínio.
var categories = map[curatorv1.PhotoCategory]domain.PhotoCategory{
	curatorv1.PhotoCategory_PHOTO_CATEGORY_SINGLE_BIRD: domain.PhotoSingleBird,
	curatorv1.PhotoCategory_PHOTO_CATEGORY_FLOCK:       domain.PhotoFlock,
	curatorv1.PhotoCategory_PHOTO_CATEGORY_NEST:        domain.PhotoNest,
	curatorv1.PhotoCategory_PHOTO_CATEGORY_EGGS:        domain.PhotoEggs,
	curatorv1.PhotoCategory_PHOTO_CATEGORY_FEATHER:     domain.PhotoFeather,
	curatorv1.PhotoCategory_PHOTO_CATEGORY_DEAD_BIRD:   domain.PhotoDeadBird,
	curatorv1.PhotoCategory_PHOTO_CATEGORY_NO_BIRD:     domain.PhotoNoBird,
	curatorv1.PhotoCategory_PHOTO_CATEGORY_OTHER:       domain.PhotoOther,
}

// category traduz uma categoria. Um número que não conhecemos (de uma
// versão futura do contrato) vira unspecified, que é tratado como descarte.
func category(c curatorv1.PhotoCategory) domain.PhotoCategory {
	if d, ok := categories[c]; ok {
		return d
	}
	return domain.PhotoUnspecified
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `go test -race ./internal/adapter/curator/ && go build ./...`
Expected: `ok`. O `go build` passa porque nada usa o adapter ainda.

- [ ] **Step 5: govulncheck e commit**

Run: `go run golang.org/x/vuln/cmd/govulncheck@v1.8.0 ./...`
Expected: sem vulnerabilidade nova trazida pelo `passarim-proto` v0.3.0.

Se aparecer GO-2026-6613 ou GO-2026-6617 (Go 1.27.2 e x/net 0.60.0, já conhecidas), elas não vêm deste PR:
- registre no ledger como `Ruling: avisos govulncheck preexistentes, fora do escopo do A3`;
- deixe a CI como ela já estava na `main` antes deste PR.

```bash
git add go.mod go.sum internal/usecase/ingest/ports.go internal/adapter/curator/
git commit -m "feat: cliente gRPC do curador e portas da curadoria no caso de uso"
```

---

## Tarefa 7 — `ImageProcessor` em dois passos: `Medium` e `ThumbAndLarge` (`feat/ingestao-curada`)

**Files:**
- Modify: `internal/usecase/ingest/ports.go` (`ImageProcessor`)
- Modify: `internal/adapter/media/ffmpeg.go`
- Test: `internal/adapter/media/ffmpeg_test.go`
- Modify: `internal/usecase/ingest/fakes_test.go` (`fakeImages`)

**Interfaces:**
- Produces: a interface `ImageProcessor` com dois métodos:
  - `Medium(ctx, original []byte) ([]byte, error)`;
  - `ThumbAndLarge(ctx, original []byte) (PhotoVariants, error)`, que devolve `Thumb`, `Large`, `Width` e `Height` e deixa `Medium` nil.

- [ ] **Step 1: Testes que falham**

Em `ffmpeg_test.go`, acrescente o helper e troque as chamadas antigas:

```go
// processAll gera as três variantes pelos dois passos do worker (a medium
// para o curador; thumb e large só para as escolhidas), para os testes
// antigos continuarem conferindo as três juntas.
func processAll(ctx context.Context, f *media.FFmpeg, in []byte) (ingest.PhotoVariants, error) {
	medium, err := f.Medium(ctx, in)
	if err != nil {
		return ingest.PhotoVariants{}, err
	}
	v, err := f.ThumbAndLarge(ctx, in)
	if err != nil {
		return ingest.PhotoVariants{}, err
	}
	v.Medium = medium
	return v, nil
}
```

```bash
sed -i '' -E 's/media\.NewFFmpeg\(("[^"]*")\)\.Process\(([^,]+), /processAll(\2, media.NewFFmpeg(\1), /' internal/adapter/media/ffmpeg_test.go
grep -n "Process(" internal/adapter/media/ffmpeg_test.go
```

Expected: o `grep` não acha mais `.Process(`. Acrescente o import de `ingest`, se faltar.

Acrescente também:

```go
// ThumbAndLarge não gera a medium (ela já foi gerada para o curador).
func TestImageProcessor_ThumbAndLargeLeavesMediumOut(t *testing.T) {
	requireFFmpeg(t)
	v, err := media.NewFFmpeg("ffmpeg").ThumbAndLarge(context.Background(), pngOf(2000, 1000))
	if err != nil || len(v.Thumb) == 0 || len(v.Large) == 0 || v.Medium != nil || v.Width != 1600 || v.Height != 800 {
		t.Fatalf("got thumb=%d large=%d medium=%v %dx%d err=%v", len(v.Thumb), len(v.Large), v.Medium != nil, v.Width, v.Height, err)
	}
}

// Medium também recusa a bomba de descompressão, sem chamar o ffmpeg.
func TestImageProcessor_MediumRejectsHugeDimensions(t *testing.T) {
	if _, err := media.NewFFmpeg("ffmpeg-que-nao-existe").Medium(context.Background(), pngHeader(100000, 100000)); !errors.Is(err, media.ErrTooLarge) {
		t.Fatalf("esperava ErrTooLarge, veio %v", err)
	}
}
```

O teste de imagem gigante que já existe usa uma variável `huge`; confira como ela é montada e use o mesmo jeito se `pngHeader` tiver outra assinatura.

Run: `go test ./internal/adapter/media/`
Expected: FAIL na compilação (`f.Medium undefined`)

- [ ] **Step 2: Implementar**

Em `ports.go`, troque o `ImageProcessor`:

```go
// ImageProcessor gera as versões WebP de uma foto original, em dois passos:
// a medium de todas as candidatas (é ela que vai ao curador) e a thumb e a
// large só das escolhidas. Assim as ~40 candidatas não custam 3 conversões
// cada.
type ImageProcessor interface {
	// Medium gera só a variante de 800 px.
	Medium(ctx context.Context, original []byte) ([]byte, error)
	// ThumbAndLarge gera a thumb (320 px) e a large (1600 px), com as
	// dimensões da large. O campo Medium volta vazio.
	ThumbAndLarge(ctx context.Context, original []byte) (PhotoVariants, error)
}
```

Em `ffmpeg.go`, troque o `Process` por:

```go
// check lê SÓ o cabeçalho da imagem: uma "bomba de descompressão" (arquivo
// pequeno que vira bilhões de pixels) é recusada sem gastar memória
// (OWASP API10). Devolve as dimensões.
func check(original []byte) (image.Config, error) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(original))
	if err != nil {
		return cfg, fmt.Errorf("%w: %w", ErrUnsupported, err)
	}
	if cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width*cfg.Height > MaxPixels {
		return cfg, fmt.Errorf("%w: %dx%d", ErrTooLarge, cfg.Width, cfg.Height)
	}
	return cfg, nil
}

// Medium gera a variante de 800 px, a que o curador classifica.
func (f *FFmpeg) Medium(ctx context.Context, original []byte) ([]byte, error) {
	if _, err := check(original); err != nil {
		return nil, err
	}
	return f.webp(ctx, original, 800)
}

// ThumbAndLarge gera a thumb e a large de uma foto escolhida.
func (f *FFmpeg) ThumbAndLarge(ctx context.Context, original []byte) (ingest.PhotoVariants, error) {
	cfg, err := check(original)
	if err != nil {
		return ingest.PhotoVariants{}, err
	}
	var v ingest.PhotoVariants
	if v.Thumb, err = f.webp(ctx, original, 320); err != nil {
		return ingest.PhotoVariants{}, err
	}
	if v.Large, err = f.webp(ctx, original, 1600); err != nil {
		return ingest.PhotoVariants{}, err
	}
	// Dimensões da large: largura limitada a 1600 sem ampliar; altura proporcional e par.
	v.Width = min(cfg.Width, 1600)
	v.Height = cfg.Height * v.Width / cfg.Width
	v.Height -= v.Height % 2
	return v, nil
}
```

Em `fakes_test.go`, troque o `fakeImages`:

```go
// fakeImages "converte" sem ffmpeg: a medium é "m:" + os bytes originais
// (o curador falso usa isso para saber de que foto se trata); thumb e
// large são fixas, 1600×1000. failMedium faz a medium falhar para os
// originais listados; thumbAndLarge conta as chamadas.
type fakeImages struct {
	err           error
	failMedium    map[string]bool
	delay         time.Duration
	mu            sync.Mutex
	thumbAndLarge int
}

func (f *fakeImages) Medium(_ context.Context, orig []byte) ([]byte, error) {
	time.Sleep(f.delay)
	if f.err != nil || f.failMedium[string(orig)] {
		return nil, errors.New("conversão falhou")
	}
	return []byte("m:" + string(orig)), nil
}

func (f *fakeImages) ThumbAndLarge(_ context.Context, _ []byte) (ingest.PhotoVariants, error) {
	time.Sleep(f.delay)
	f.mu.Lock()
	f.thumbAndLarge++
	f.mu.Unlock()
	if f.err != nil {
		return ingest.PhotoVariants{}, f.err
	}
	return ingest.PhotoVariants{Thumb: []byte("t"), Large: []byte("l"), Width: 1600, Height: 1000}, nil
}
```

`fakeImages` passa a ser usado como ponteiro (`&fakeImages{}`). O pacote `ingest` não compila até a Tarefa 9 reescrever `photos.go` e `photos_test.go`. Os passos abaixo rodam só os pacotes `media` e `curator`.

- [ ] **Step 3: Rodar e commitar**

Run: `go test -race ./internal/adapter/media/ ./internal/adapter/curator/`
Expected: `ok` nos dois.

O commit deixa o pacote `ingest` sem compilar até a Tarefa 9, que fecha o PR verde; o corpo do commit diz isso:

```bash
git add internal/usecase/ingest/ports.go internal/usecase/ingest/fakes_test.go internal/adapter/media/
git commit -m "refactor: conversão de imagem em dois passos (medium para o curador, thumb e large das escolhidas)" \
  -m "O caso de uso de fotos passa a usar os dois passos dois commits adiante; até lá o pacote ingest não compila."
```

---

## Tarefa 8 — Pontuação e escolha (`feat/ingestao-curada`)

**Files:**
- Create: `internal/usecase/ingest/selection.go`
- Test: `internal/usecase/ingest/selection_test.go` (pacote interno `ingest`)

**Interfaces:**
- Consumes: `PhotoCandidate` (Tarefa 5), `PhotoVerdict` (Tarefa 6), `domain.CurationFlag` e `domain.CuratedCandidate` (Tarefa 2).
- Produces (não exportados, usados pela Tarefa 9 no mesmo pacote):
  - `type classified struct{ cand PhotoCandidate; license domain.License; original, medium []byte; verdict PhotoVerdict; score float64; override bool }`;
  - `func photoScore(v PhotoVerdict, votes, maxVotes int) float64`;
  - `func scoreAll(cs []classified)`;
  - `func choose(cs []classified, max int) []classified`;
  - `func curationFlags(cs, chosen []classified, overrideFailed bool, lowConfidence float64) []domain.CurationFlag`;
  - `func reportCandidates(cs []classified) []domain.CuratedCandidate`.

- [ ] **Step 1: Testes que falham**

`selection_test.go`:

```go
// Testes da pontuação e da escolha da foto principal e da galeria (funções
// puras, sem fakes).

package ingest

import (
	"math"
	"strings"
	"testing"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

// cl monta uma candidata classificada: id, observação, categoria e pontuação.
func cl(id, obs string, cat domain.PhotoCategory, score float64) classified {
	return classified{cand: PhotoCandidate{SourceID: id, ObservationID: obs},
		verdict: PhotoVerdict{PhotoID: id, Category: cat, Confidence: 0.5}, score: score}
}

// idsOf devolve os ids na ordem, para comparar.
func idsOf(cs []classified) string {
	var out []string
	for _, x := range cs {
		out = append(out, x.cand.SourceID)
	}
	return strings.Join(out, ",")
}

func nearly(a, b float64) bool { return math.Abs(a-b) < 1e-9 }

// A fórmula da spec: 0,4 tamanho + 0,3 nitidez + 0,2 votos + 0,1 confiança.
func TestPhotoScore(t *testing.T) {
	v := PhotoVerdict{LargestBirdArea: 0.125, Sharpness: 0.5, Confidence: 0.8}
	// tamanho 0,125/0,25 = 0,5; votos log(1+3)/log(1+3) = 1.
	if got := photoScore(v, 3, 3); !nearly(got, 0.4*0.5+0.3*0.5+0.2*1+0.1*0.8) {
		t.Fatalf("pontuação = %v", got)
	}
	// Ave enorme: o tamanho satura em 1. Ninguém com voto: a parte de votos é 0.
	big := PhotoVerdict{LargestBirdArea: 0.9}
	if got := photoScore(big, 0, 0); !nearly(got, 0.4) {
		t.Fatalf("tamanho saturado e sem votos = %v", got)
	}
	// Ave cortada na borda: metade.
	cut := v
	cut.LargestBirdCut = true
	if got := photoScore(cut, 3, 3); !nearly(got, photoScore(v, 3, 3)/2) {
		t.Fatalf("cortada = %v", got)
	}
}

// scoreAll usa o maior número de votos entre as candidatas da espécie.
func TestScoreAll(t *testing.T) {
	cs := []classified{
		{cand: PhotoCandidate{Votes: 0}, verdict: PhotoVerdict{}},
		{cand: PhotoCandidate{Votes: 9}, verdict: PhotoVerdict{}},
	}
	scoreAll(cs)
	if !nearly(cs[0].score, 0) || !nearly(cs[1].score, 0.2) {
		t.Fatalf("pontuações: %v %v", cs[0].score, cs[1].score)
	}
}

// Principal = a ave sozinha de maior pontuação; depois as outras aves
// sozinhas, depois os bandos; descartes ficam de fora.
func TestChoose_OrderAndDiscards(t *testing.T) {
	cs := []classified{
		cl("flock", "1", domain.PhotoFlock, 0.99),
		cl("nest", "2", domain.PhotoNest, 0.95),
		cl("s-low", "3", domain.PhotoSingleBird, 0.40),
		cl("s-top", "4", domain.PhotoSingleBird, 0.80),
		cl("unk", "5", domain.PhotoUnspecified, 0.90),
	}
	if got := idsOf(choose(cs, 6)); got != "s-top,s-low,flock" {
		t.Fatalf("galeria: %s", got)
	}
}

// No máximo 6 fotos e no máximo 2 da mesma observação.
func TestChoose_LimitsPerGalleryAndObservation(t *testing.T) {
	var cs []classified
	for i, id := range []string{"a1", "a2", "a3", "b1", "c1", "d1", "e1", "f1"} {
		cs = append(cs, c(id, id[:1], domain.PhotoSingleBird, 1-float64(i)/10))
	}
	if got := idsOf(choose(cs, 6)); got != "a1,a2,b1,c1,d1,e1" {
		t.Fatalf("galeria: %s (a3 é a 3ª da observação a)", got)
	}
}

// O override passa à frente de tudo, mesmo sendo bando.
func TestChoose_OverrideFirst(t *testing.T) {
	ov := cl("ov", "9", domain.PhotoFlock, 0.1)
	ov.override = true
	cs := []classified{cl("s", "1", domain.PhotoSingleBird, 0.9), ov}
	if got := idsOf(choose(cs, 6)); got != "ov,s" {
		t.Fatalf("galeria: %s", got)
	}
}

// Sem ave sozinha e sem override, a espécie fica sem fotos (uma galeria só
// de bandos não é publicada).
func TestChoose_OnlyFlocksMeansNoPhotos(t *testing.T) {
	cs := []classified{cl("f1", "1", domain.PhotoFlock, 0.9), cl("f2", "2", domain.PhotoFlock, 0.8)}
	if got := choose(cs, 6); len(got) != 0 {
		t.Fatalf("esperava nenhuma foto, veio %s", idsOf(got))
	}
}

// Empate de pontuação: desempata pelo id, para a escolha não mudar de uma
// rodada para outra sem motivo.
func TestChoose_TieBreakIsStable(t *testing.T) {
	cs := []classified{cl("20", "1", domain.PhotoSingleBird, 0.5), cl("10", "2", domain.PhotoSingleBird, 0.5)}
	if got := idsOf(choose(cs, 6)); got != "10,20" {
		t.Fatalf("galeria: %s", got)
	}
}

// As marcas do relatório.
func TestCurationFlags(t *testing.T) {
	single := cl("s", "1", domain.PhotoSingleBird, 0.9)
	single.verdict.Confidence = 0.2
	flock := cl("f", "2", domain.PhotoFlock, 0.9)

	if got := curationFlags([]classified{flock}, nil, false, 0.3); len(got) != 1 || got[0] != domain.FlagNoSingleBird {
		t.Fatalf("só bando: %v", got)
	}
	if got := curationFlags([]classified{single}, []classified{single}, false, 0.3); len(got) != 1 || got[0] != domain.FlagLowConfidence {
		t.Fatalf("confiança 0,2 < 0,3: %v", got)
	}
	if got := curationFlags([]classified{single}, []classified{single}, true, 0.1); len(got) != 1 || got[0] != domain.FlagOverrideFailed {
		t.Fatalf("override falhou: %v", got)
	}
	ov := single
	ov.override = true
	if got := curationFlags([]classified{ov}, []classified{ov}, false, 0.3); len(got) != 0 {
		t.Fatalf("a principal do override não ganha low_confidence: %v", got)
	}
}

// O relatório lista todas as candidatas classificadas.
func TestReportCandidates(t *testing.T) {
	x := cl("7", "70", domain.PhotoNest, 0.25)
	got := reportCandidates([]classified{x})
	want := domain.CuratedCandidate{PhotoID: "7", ObservationID: "70", Category: domain.PhotoNest, Score: 0.25, Confidence: 0.5}
	if len(got) != 1 || got[0] != want {
		t.Fatalf("got %+v", got)
	}
}
```

Run: `go vet ./internal/usecase/ingest/ 2>&1 | head -5`
Expected: erros de compilação (`undefined: classified`), além dos de `photos.go` que vêm da Tarefa 7.

- [ ] **Step 2: Implementar**

`internal/usecase/ingest/selection.go`:

```go
// Pontuação e escolha das fotos de uma espécie, depois que o curador disse
// o que cada candidata mostra. São funções puras (sem rede, banco ou
// storage): o IngestPhotos as chama, e os testes as exercitam direto.

package ingest

import (
	"cmp"
	"math"
	"slices"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

// maxPerObservation: no máximo 2 fotos da mesma observação na galeria, para
// não mostrar três fotos quase iguais da mesma ave.
const maxPerObservation = 2

// classified é uma candidata que já passou pela licença, foi baixada, ganhou
// a medium e voltou do curador. Guarda o original para gerar a thumb e a
// large se for escolhida. override marca a principal escolhida no YAML.
type classified struct {
	cand     PhotoCandidate
	license  domain.License
	original []byte
	medium   []byte
	verdict  PhotoVerdict
	score    float64
	override bool
}

// photoScore dá uma nota de 0 a 1 a uma foto (pesos da spec, seção 5.3):
//   - 0,4 pelo tamanho da ave: 25% da foto ou mais já vale a nota cheia;
//   - 0,3 pela nitidez;
//   - 0,2 pelos votos, em escala logarítmica (log1p(x) = log(1+x)), relativa
//     à candidata mais votada da espécie: 2 votos contra 200 ainda contam algo;
//   - 0,1 pela confiança do curador.
//
// Ave cortada na borda vale a metade.
func photoScore(v PhotoVerdict, votes, maxVotes int) float64 {
	size := math.Min(v.LargestBirdArea/0.25, 1)
	var voteShare float64
	if maxVotes > 0 {
		voteShare = math.Log1p(float64(votes)) / math.Log1p(float64(maxVotes))
	}
	s := 0.4*size + 0.3*v.Sharpness + 0.2*voteShare + 0.1*v.Confidence
	if v.LargestBirdCut {
		s *= 0.5
	}
	return s
}

// scoreAll calcula a pontuação de cada candidata, com o maior número de
// votos entre todas elas.
func scoreAll(cs []classified) {
	maxVotes := 0
	for _, x := range cs {
		maxVotes = max(maxVotes, x.cand.Votes)
	}
	for i := range cs {
		cs[i].score = photoScore(cs[i].verdict, cs[i].cand.Votes, maxVotes)
	}
}

// choose monta a galeria, com a principal na posição 0:
//  1. a principal do override, se houver (seja qual for a categoria);
//  2. as aves sozinhas, da maior pontuação para a menor;
//  3. os bandos, também por pontuação.
//
// Descartes (ninho, ovos, pena, ave morta, sem ave, outro e unspecified)
// não entram. Até `max` fotos e até 2 por observação. Sem override e sem
// nenhuma ave sozinha, devolve nada: a galeria só de bandos não é publicada,
// porque o contrato diz que a primeira foto é a principal.
func choose(cs []classified, max int) []classified {
	var out []classified
	perObservation := map[string]int{}
	take := func(x classified) {
		if len(out) < max && perObservation[x.cand.ObservationID] < maxPerObservation {
			perObservation[x.cand.ObservationID]++
			out = append(out, x)
		}
	}
	for _, x := range cs {
		if x.override {
			take(x)
		}
	}
	rank := map[domain.PhotoCategory]int{domain.PhotoSingleBird: 0, domain.PhotoFlock: 1}
	var eligible []classified
	for _, x := range cs {
		if _, ok := rank[x.verdict.Category]; ok && !x.override {
			eligible = append(eligible, x)
		}
	}
	// Ordena por categoria, pontuação (maior primeiro) e, no empate, id.
	// cmp.Or devolve o primeiro critério que não empatou.
	slices.SortFunc(eligible, func(a, b classified) int {
		return cmp.Or(
			cmp.Compare(rank[a.verdict.Category], rank[b.verdict.Category]),
			cmp.Compare(b.score, a.score),
			cmp.Compare(a.cand.SourceID, b.cand.SourceID),
		)
	})
	if len(out) == 0 && (len(eligible) == 0 || eligible[0].verdict.Category != domain.PhotoSingleBird) {
		return nil
	}
	for _, x := range eligible {
		take(x)
	}
	return out
}

// curationFlags diz o que o dono precisa conferir nesta espécie:
//   - no_single_bird: nenhuma candidata saiu ave sozinha;
//   - override_failed: a principal do YAML não pôde ser usada;
//   - low_confidence: a principal escolhida pelo MODELO tem confiança abaixo
//     do limite. A do override não é marcada: o dono já olhou essa foto.
//
// A lista nunca é nil: a coluna flags é NOT NULL.
func curationFlags(cs, chosen []classified, overrideFailed bool, lowConfidence float64) []domain.CurationFlag {
	flags := []domain.CurationFlag{}
	if !slices.ContainsFunc(cs, func(x classified) bool { return x.verdict.Category == domain.PhotoSingleBird }) {
		flags = append(flags, domain.FlagNoSingleBird)
	}
	if overrideFailed {
		flags = append(flags, domain.FlagOverrideFailed)
	}
	if len(chosen) > 0 && !chosen[0].override && chosen[0].verdict.Confidence < lowConfidence {
		flags = append(flags, domain.FlagLowConfidence)
	}
	return flags
}

// reportCandidates resume as candidatas para o relatório.
func reportCandidates(cs []classified) []domain.CuratedCandidate {
	out := make([]domain.CuratedCandidate, len(cs))
	for i, x := range cs {
		out[i] = domain.CuratedCandidate{PhotoID: x.cand.SourceID, ObservationID: x.cand.ObservationID,
			Category: x.verdict.Category, Score: x.score, Confidence: x.verdict.Confidence}
	}
	return out
}
```

Os testes rodam junto com a Tarefa 9, que devolve a compilação ao pacote. Commit:

```bash
git add internal/usecase/ingest/selection.go internal/usecase/ingest/selection_test.go
git commit -m "feat: pontuação e escolha da principal e da galeria"
```

---

## Tarefa 9 — `IngestPhotos` com o curador, o override e o relatório (`feat/ingestao-curada`)

**Files:**
- Modify: `internal/usecase/ingest/photos.go` (reescrita)
- Modify: `internal/usecase/ingest/ports.go` (`MediaRepository.ReplacePhotos` com relatório, `OverrideSource`)
- Test: `internal/usecase/ingest/photos_test.go` (reescrita)
- Modify: `internal/usecase/ingest/fakes_test.go` (`fakeRepo`, `fakeCurator`, `fakeOverrides`)
- Modify: `internal/adapter/postgres/queries_ingest.sql` (`InsertCurationReport`)
- Modify: `internal/adapter/postgres/ingest_repository.go` (`ReplacePhotos` com relatório; DTO do JSON)
- Test: `internal/adapter/postgres/ingest_repository_test.go`

**Interfaces:**
- Consumes: tudo das Tarefas 2 a 8.
- Produces:
  - `MediaRepository.ReplacePhotos(ctx, speciesID string, photos []domain.Photo, report domain.CurationReport) error`, que grava as fotos e a linha do relatório na mesma transação;
  - `type OverrideSource interface{ PhotoOverride(ctx, speciesID string) (domain.PhotoOverride, error) }`;
  - `IngestPhotos` com os campos `Source`, `Downloader`, `Images`, `Curator`, `Store`, `Repo`, `Overrides`, `Policy`, `MaxPhotos`, `MaxCandidates`, `Observations`, `LowConfidence` e `Timeout`.

- [ ] **Step 1: Portas**

Em `ports.go`, troque o `ReplacePhotos` da `MediaRepository`:

```go
	// ReplacePhotos troca as fotos da espécie e grava a linha do relatório
	// de curadoria, as duas coisas numa transação só.
	ReplacePhotos(ctx context.Context, speciesID string, photos []domain.Photo, report domain.CurationReport) error
```

E acrescente:

```go
// OverrideSource lê a escolha manual de fotos (chave photos: do YAML, que o
// seed grava). Sem escolha, devolve o override vazio.
type OverrideSource interface {
	PhotoOverride(ctx context.Context, speciesID string) (domain.PhotoOverride, error)
}
```

- [ ] **Step 2: Fakes**

Em `fakes_test.go`, troque o `ReplacePhotos` do `fakeRepo` e o campo:

```go
// fakeRepo guarda o último valor gravado de cada tipo.
type fakeRepo struct {
	photos       []domain.Photo
	report       domain.CurationReport
	audio        *domain.Audio
	clusters     []domain.OccurrenceCluster
	photoCalls   int
	audioCalls   int
	clusterCalls int
	replaceErr   error
}

func (f *fakeRepo) ReplacePhotos(_ context.Context, _ string, p []domain.Photo, r domain.CurationReport) error {
	f.photoCalls++
	if f.replaceErr != nil {
		return f.replaceErr
	}
	f.photos, f.report = p, r
	return nil
}
```

Acrescente:

```go
// fakeCurator classifica pela medium: a medium do fakeImages é "m:" + os
// bytes originais, e os originais dos testes são "img-<id>". verdicts dá o
// veredito de cada id; sem entrada, a foto é uma ave sozinha comum. err faz
// todas as chamadas falharem; batches guarda o tamanho de cada lote.
type fakeCurator struct {
	verdicts map[string]ingest.PhotoVerdict
	err      error
	delay    time.Duration
	mu       sync.Mutex
	batches  []int
}

func (f *fakeCurator) ClassifyPhotos(_ context.Context, photos []ingest.CuratorPhoto) ([]ingest.PhotoVerdict, string, error) {
	time.Sleep(f.delay)
	f.mu.Lock()
	f.batches = append(f.batches, len(photos))
	f.mu.Unlock()
	if f.err != nil {
		return nil, "", f.err
	}
	out := make([]ingest.PhotoVerdict, len(photos))
	for i, p := range photos {
		id := strings.TrimPrefix(string(p.Image), "m:img-")
		v, ok := f.verdicts[id]
		if !ok {
			v = ingest.PhotoVerdict{Category: domain.PhotoSingleBird, LargestBirdArea: 0.1, Sharpness: 0.5, Confidence: 0.5}
		}
		v.PhotoID = p.PhotoID
		out[i] = v
	}
	return out, "fake@1", nil
}

// fakeOverrides devolve o override configurado para qualquer espécie.
type fakeOverrides struct{ o domain.PhotoOverride }

func (f fakeOverrides) PhotoOverride(context.Context, string) (domain.PhotoOverride, error) { return f.o, nil }
```

- [ ] **Step 3: Testes do caso de uso (reescrita de `photos_test.go`)**

Substitua `photos_test.go` inteiro por:

```go
// Testes do caso de uso de fotos com o curador: licença, download, curadoria,
// escolha, override, relatório e storage, todos com peças falsas.

package ingest_test

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/velosobr/passarim-catalog/internal/domain"
	"github.com/velosobr/passarim-catalog/internal/usecase/ingest"
)

// sabia é o job de fotos usado nos testes.
var sabia = ingest.Job{ID: 1, SpeciesID: "turdus-rufiventris", ScientificName: "Turdus rufiventris", Source: ingest.SourceINaturalist}

// cand cria a candidata de id n, cada uma na sua observação (n+1000).
func cand(n int, license string) ingest.PhotoCandidate {
	return ingest.PhotoCandidate{SourceID: fmt.Sprint(n), ObservationID: fmt.Sprint(n + 1000),
		URL: fmt.Sprintf("https://x/%d.jpg", n), PageURL: fmt.Sprintf("https://www.inaturalist.org/observations/%d", n+1000),
		License: license, Author: "Autor", Width: 2000, Height: 1000}
}

// cands cria as candidatas de 0 a n-1, todas cc-by.
func cands(n int) []ingest.PhotoCandidate {
	var out []ingest.PhotoCandidate
	for i := range n {
		out = append(out, cand(i, "cc-by"))
	}
	return out
}

// photoFiles monta o downloader falso: a foto n devolve "img-n".
func photoFiles(ids ...int) map[string][]byte {
	m := map[string][]byte{}
	for _, i := range ids {
		m[fmt.Sprintf("https://x/%d.jpg", i)] = []byte(fmt.Sprintf("img-%d", i))
	}
	return m
}

// upTo devolve 0, 1, ..., n-1.
func upTo(n int) []int {
	out := make([]int, n)
	for i := range out {
		out[i] = i
	}
	return out
}

// env junta as peças falsas de um teste.
type env struct {
	uc      ingest.IngestPhotos
	dl      *fakeDownloader
	imgs    *fakeImages
	curator *fakeCurator
	store   *fakeStore
	repo    *fakeRepo
}

// newEnv monta o caso de uso como o worker (6 fotos, 40 candidatas, 20
// observações), com o downloader respondendo às fotos dadas.
func newEnv(src fakePhotoSource, files map[string][]byte) *env {
	e := &env{dl: &fakeDownloader{files: files}, imgs: &fakeImages{}, curator: &fakeCurator{},
		store: newFakeStore(), repo: &fakeRepo{}}
	e.uc = ingest.IngestPhotos{Source: src, Downloader: e.dl, Images: e.imgs, Curator: e.curator, Store: e.store,
		Repo: e.repo, Overrides: fakeOverrides{}, Policy: domain.LicensePolicy{AllowNC: true},
		MaxPhotos: 6, MaxCandidates: 40, Observations: 20, LowConfidence: 0.3, Timeout: time.Minute}
	return e
}

// gallery devolve os ids de origem das fotos gravadas, na ordem.
func (e *env) gallery() string {
	var out []string
	for _, p := range e.repo.photos {
		out = append(out, p.SourcePhotoID)
	}
	return strings.Join(out, ",")
}

// A principal é a de maior pontuação, e cada foto gravada leva categoria,
// pontuação, versão do modelo e as três chaves.
func TestIngestPhotos_PicksPrimaryByScore(t *testing.T) {
	e := newEnv(fakePhotoSource{cands: cands(3)}, photoFiles(0, 1, 2))
	e.curator.verdicts = map[string]ingest.PhotoVerdict{
		"2": {Category: domain.PhotoSingleBird, LargestBirdArea: 0.3, Sharpness: 0.9, Confidence: 0.9},
	}
	if err := e.uc.Run(context.Background(), sabia); err != nil {
		t.Fatal(err)
	}
	if e.gallery() != "2,0,1" {
		t.Fatalf("galeria: %s", e.gallery())
	}
	p := e.repo.photos[0]
	if p.Category != domain.PhotoSingleBird || p.ModelVersion != "fake@1" || p.Score <= e.repo.photos[1].Score ||
		p.LargeKey != "species/turdus-rufiventris/photo-2-large.webp" || p.Credit.License != "CC-BY" {
		t.Fatalf("principal gravada: %+v", p)
	}
	if e.repo.report.PrimaryPhotoID != "2" || len(e.repo.report.Candidates) != 3 || e.repo.report.ModelVersion != "fake@1" {
		t.Fatalf("relatório: %+v", e.repo.report)
	}
}

// As candidatas vão ao curador em lotes de até 8, e são cortadas em 40.
func TestIngestPhotos_BatchesOfEightAndCutAtForty(t *testing.T) {
	e := newEnv(fakePhotoSource{cands: cands(45)}, photoFiles(upTo(45)...))
	if err := e.uc.Run(context.Background(), sabia); err != nil {
		t.Fatal(err)
	}
	if fmt.Sprint(e.curator.batches) != "[8 8 8 8 8]" {
		t.Fatalf("lotes: %v (40 candidatas em lotes de 8)", e.curator.batches)
	}
	if len(e.dl.requested) != 40 {
		t.Fatalf("baixou %d, esperava 40", len(e.dl.requested))
	}
}

// Só as escolhidas ganham thumb e large e vão para o storage (3 arquivos cada).
func TestIngestPhotos_OnlyChosenAreStored(t *testing.T) {
	e := newEnv(fakePhotoSource{cands: cands(10)}, photoFiles(upTo(10)...))
	if err := e.uc.Run(context.Background(), sabia); err != nil {
		t.Fatal(err)
	}
	if len(e.repo.photos) != 6 || e.imgs.thumbAndLarge != 6 || len(e.store.objects) != 18 {
		t.Fatalf("fotos=%d thumb+large=%d objetos=%d", len(e.repo.photos), e.imgs.thumbAndLarge, len(e.store.objects))
	}
}

// Curador fora do ar: ErrCuratorUnavailable, nada gravado no banco nem no storage.
func TestIngestPhotos_CuratorUnavailable(t *testing.T) {
	e := newEnv(fakePhotoSource{cands: cands(2)}, photoFiles(0, 1))
	e.curator.err = fmt.Errorf("conexão: %w", ingest.ErrCuratorUnavailable)
	e.store.objects["species/turdus-rufiventris/photo-OLD-thumb.webp"] = "x"
	err := e.uc.Run(context.Background(), sabia)
	if !errors.Is(err, ingest.ErrCuratorUnavailable) {
		t.Fatalf("esperava ErrCuratorUnavailable, veio %v", err)
	}
	if e.repo.photoCalls != 0 || len(e.store.deleted) != 0 || len(e.store.objects) != 1 {
		t.Fatalf("nada podia mudar: calls=%d deleted=%v objects=%v", e.repo.photoCalls, e.store.deleted, e.store.objects)
	}
}

// Uma foto UNSPECIFIED (não abriu no curador) é descarte.
func TestIngestPhotos_UnspecifiedIsDiscarded(t *testing.T) {
	e := newEnv(fakePhotoSource{cands: cands(2)}, photoFiles(0, 1))
	e.curator.verdicts = map[string]ingest.PhotoVerdict{"0": {Category: domain.PhotoUnspecified}}
	if err := e.uc.Run(context.Background(), sabia); err != nil {
		t.Fatal(err)
	}
	if e.gallery() != "1" {
		t.Fatalf("galeria: %s", e.gallery())
	}
}

// Só bandos: a espécie fica sem fotos, os arquivos antigos saem e o
// relatório marca no_single_bird.
func TestIngestPhotos_OnlyFlocksLeavesNoPhotos(t *testing.T) {
	e := newEnv(fakePhotoSource{cands: cands(2)}, photoFiles(0, 1))
	e.curator.verdicts = map[string]ingest.PhotoVerdict{"0": {Category: domain.PhotoFlock}, "1": {Category: domain.PhotoFlock}}
	e.store.objects["species/turdus-rufiventris/photo-OLD-thumb.webp"] = "x"
	if err := e.uc.Run(context.Background(), sabia); err != nil {
		t.Fatal(err)
	}
	if e.repo.photoCalls != 1 || len(e.repo.photos) != 0 || len(e.store.objects) != 0 {
		t.Fatalf("esperava nenhuma foto e storage limpo: %+v %v", e.repo.photos, e.store.objects)
	}
	if e.repo.report.PrimaryPhotoID != "" || len(e.repo.report.Flags) != 1 || e.repo.report.Flags[0] != domain.FlagNoSingleBird {
		t.Fatalf("relatório: %+v", e.repo.report)
	}
}

// photos.exclude tira a foto, mesmo sendo a melhor.
func TestIngestPhotos_OverrideExclude(t *testing.T) {
	e := newEnv(fakePhotoSource{cands: cands(2)}, photoFiles(0, 1))
	e.curator.verdicts = map[string]ingest.PhotoVerdict{"0": {Category: domain.PhotoSingleBird, LargestBirdArea: 1, Sharpness: 1, Confidence: 1}}
	e.uc.Overrides = fakeOverrides{domain.PhotoOverride{ExcludedIDs: []string{"0"}}}
	if err := e.uc.Run(context.Background(), sabia); err != nil {
		t.Fatal(err)
	}
	if e.gallery() != "1" || slicesContain(e.dl.requested, "https://x/0.jpg") {
		t.Fatalf("galeria: %s, baixou: %v", e.gallery(), e.dl.requested)
	}
}

// photos.primary passa à frente, mesmo fora das candidatas e sendo bando.
func TestIngestPhotos_OverridePrimary(t *testing.T) {
	primary := cand(99, "cc-by")
	e := newEnv(fakePhotoSource{cands: cands(2), primary: map[string]ingest.PhotoCandidate{"99": primary}}, photoFiles(0, 1, 99))
	e.curator.verdicts = map[string]ingest.PhotoVerdict{"99": {Category: domain.PhotoFlock}}
	e.uc.Overrides = fakeOverrides{domain.PhotoOverride{PrimaryObservationID: "1099", PrimaryPhotoID: "99"}}
	if err := e.uc.Run(context.Background(), sabia); err != nil {
		t.Fatal(err)
	}
	if e.gallery() != "99,0,1" || e.repo.report.PrimaryPhotoID != "99" || len(e.repo.report.Flags) != 0 {
		t.Fatalf("galeria: %s, relatório: %+v", e.gallery(), e.repo.report)
	}
}

// A principal do override que também está nas candidatas entra uma vez só.
func TestIngestPhotos_OverridePrimaryNotDuplicated(t *testing.T) {
	e := newEnv(fakePhotoSource{cands: cands(3), primary: map[string]ingest.PhotoCandidate{"2": cand(2, "cc-by")}}, photoFiles(0, 1, 2))
	e.uc.Overrides = fakeOverrides{domain.PhotoOverride{PrimaryObservationID: "1002", PrimaryPhotoID: "2"}}
	if err := e.uc.Run(context.Background(), sabia); err != nil {
		t.Fatal(err)
	}
	if e.gallery() != "2,0,1" || len(e.repo.report.Candidates) != 3 {
		t.Fatalf("galeria: %s, candidatas no relatório: %d", e.gallery(), len(e.repo.report.Candidates))
	}
}

// A foto do override sumiu: a principal volta a ser a do modelo, com override_failed.
func TestIngestPhotos_OverrideMissingFails(t *testing.T) {
	e := newEnv(fakePhotoSource{cands: cands(2)}, photoFiles(0, 1))
	e.uc.Overrides = fakeOverrides{domain.PhotoOverride{PrimaryObservationID: "1", PrimaryPhotoID: "77"}}
	if err := e.uc.Run(context.Background(), sabia); err != nil {
		t.Fatal(err)
	}
	if e.gallery() != "0,1" || !hasFlag(e.repo.report, domain.FlagOverrideFailed) {
		t.Fatalf("galeria: %s, relatório: %+v", e.gallery(), e.repo.report)
	}
}

// A foto do override mudou para uma licença fora da política (NC com
// ALLOW_NC=false): override_failed, e a foto não é baixada.
func TestIngestPhotos_OverrideRejectedLicenseFails(t *testing.T) {
	e := newEnv(fakePhotoSource{cands: cands(1), primary: map[string]ingest.PhotoCandidate{"99": cand(99, "cc-by-nc")}}, photoFiles(0, 99))
	e.uc.Policy = domain.LicensePolicy{AllowNC: false}
	e.uc.Overrides = fakeOverrides{domain.PhotoOverride{PrimaryObservationID: "1099", PrimaryPhotoID: "99"}}
	if err := e.uc.Run(context.Background(), sabia); err != nil {
		t.Fatal(err)
	}
	if e.gallery() != "0" || !hasFlag(e.repo.report, domain.FlagOverrideFailed) || slicesContain(e.dl.requested, "https://x/99.jpg") {
		t.Fatalf("galeria: %s, relatório: %+v, baixou %v", e.gallery(), e.repo.report, e.dl.requested)
	}
}

// A foto do override não abriu (download falhou ou o curador deu UNSPECIFIED): override_failed.
func TestIngestPhotos_OverrideBrokenFails(t *testing.T) {
	for name, setup := range map[string]func(e *env){
		"download": func(e *env) { delete(e.dl.files, "https://x/99.jpg") },
		"curador":  func(e *env) { e.curator.verdicts = map[string]ingest.PhotoVerdict{"99": {Category: domain.PhotoUnspecified}} },
	} {
		t.Run(name, func(t *testing.T) {
			e := newEnv(fakePhotoSource{cands: cands(1), primary: map[string]ingest.PhotoCandidate{"99": cand(99, "cc-by")}}, photoFiles(0, 99))
			e.uc.Overrides = fakeOverrides{domain.PhotoOverride{PrimaryObservationID: "1099", PrimaryPhotoID: "99"}}
			setup(e)
			if err := e.uc.Run(context.Background(), sabia); err != nil {
				t.Fatal(err)
			}
			if e.gallery() != "0" || !hasFlag(e.repo.report, domain.FlagOverrideFailed) {
				t.Fatalf("galeria: %s, relatório: %+v", e.gallery(), e.repo.report)
			}
		})
	}
}

// A principal com confiança baixa é marcada low_confidence.
func TestIngestPhotos_LowConfidenceFlag(t *testing.T) {
	e := newEnv(fakePhotoSource{cands: cands(1)}, photoFiles(0))
	e.curator.verdicts = map[string]ingest.PhotoVerdict{"0": {Category: domain.PhotoSingleBird, Confidence: 0.1}}
	if err := e.uc.Run(context.Background(), sabia); err != nil {
		t.Fatal(err)
	}
	if !hasFlag(e.repo.report, domain.FlagLowConfidence) {
		t.Fatalf("relatório: %+v", e.repo.report)
	}
}

// Fotos com licença não aceita são ignoradas antes do download; sem nenhuma
// sobrando, as fotos da espécie são limpas e o relatório registra.
func TestIngestPhotos_SkipsRejectedLicenses(t *testing.T) {
	e := newEnv(fakePhotoSource{cands: []ingest.PhotoCandidate{cand(0, "cc-by-nd"), cand(1, ""), cand(2, "cc-by-nc")}}, photoFiles(0, 1, 2))
	e.uc.Policy = domain.LicensePolicy{AllowNC: false}
	if err := e.uc.Run(context.Background(), sabia); err != nil {
		t.Fatal(err)
	}
	if len(e.dl.requested) != 0 || e.repo.photoCalls != 1 || len(e.repo.photos) != 0 || len(e.curator.batches) != 0 {
		t.Fatalf("baixou %v, calls=%d, lotes=%v", e.dl.requested, e.repo.photoCalls, e.curator.batches)
	}
	if !hasFlag(e.repo.report, domain.FlagNoSingleBird) {
		t.Fatalf("relatório: %+v", e.repo.report)
	}
}

// Um id da fonte com caracteres perigosos é ignorado.
func TestIngestPhotos_SkipsUnsafeSourceID(t *testing.T) {
	bad := cand(0, "cc-by")
	bad.SourceID = "../../outro"
	e := newEnv(fakePhotoSource{cands: []ingest.PhotoCandidate{bad}}, photoFiles(0))
	if err := e.uc.Run(context.Background(), sabia); err != nil {
		t.Fatal(err)
	}
	if len(e.dl.requested) != 0 || len(e.store.objects) != 0 {
		t.Fatalf("id inseguro não pode virar chave: dl=%v store=%v", e.dl.requested, e.store.objects)
	}
}

// Uma foto que falha no download ou na medium não derruba as outras.
func TestIngestPhotos_SkipsBrokenPhoto(t *testing.T) {
	e := newEnv(fakePhotoSource{cands: cands(3)}, photoFiles(1, 2)) // a 0 falha no download
	e.imgs.failMedium = map[string]bool{"img-1": true}             // a 1 falha na medium
	if err := e.uc.Run(context.Background(), sabia); err != nil {
		t.Fatal(err)
	}
	if e.gallery() != "2" {
		t.Fatalf("galeria: %s", e.gallery())
	}
}

// Se todas falham no download, o job dá erro e as fotos antigas ficam.
func TestIngestPhotos_AllDownloadsFailIsError(t *testing.T) {
	e := newEnv(fakePhotoSource{cands: cands(2)}, map[string][]byte{})
	if err := e.uc.Run(context.Background(), sabia); err == nil || errors.Is(err, ingest.ErrCuratorUnavailable) {
		t.Fatalf("falha total deveria virar erro comum, veio %v", err)
	}
	if e.repo.photoCalls != 0 {
		t.Fatal("não pode apagar fotos boas por causa de uma falha temporária")
	}
}

// Erro da fonte vira erro do job.
func TestIngestPhotos_SourceErrorIsError(t *testing.T) {
	e := newEnv(fakePhotoSource{err: errors.New("fora do ar")}, nil)
	if err := e.uc.Run(context.Background(), sabia); err == nil || e.repo.photoCalls != 0 {
		t.Fatalf("erro da fonte deveria propagar sem gravar: %v", err)
	}
}

// Depois de trocar as fotos no banco, os arquivos antigos saem do storage;
// o canto e as outras espécies ficam.
func TestIngestPhotos_DeletesOrphanPhotosAfterReplace(t *testing.T) {
	e := newEnv(fakePhotoSource{cands: cands(2)}, photoFiles(0, 1))
	for _, k := range []string{"species/turdus-rufiventris/photo-OLD-thumb.webp", "species/turdus-rufiventris/audio-7.aac",
		"species/outra-especie/photo-OLD-thumb.webp"} {
		e.store.objects[k] = "x"
	}
	if err := e.uc.Run(context.Background(), sabia); err != nil {
		t.Fatal(err)
	}
	if _, ok := e.store.objects["species/turdus-rufiventris/photo-OLD-thumb.webp"]; ok {
		t.Fatal("foto antiga órfã deveria ser apagada")
	}
	for _, k := range []string{"species/turdus-rufiventris/audio-7.aac", "species/outra-especie/photo-OLD-thumb.webp",
		"species/turdus-rufiventris/photo-1-medium.webp"} {
		if _, ok := e.store.objects[k]; !ok {
			t.Fatalf("%s não podia ser apagado", k)
		}
	}
}

// Se a troca no banco falha, nada é apagado do storage.
func TestIngestPhotos_NoCleanupWhenReplaceFails(t *testing.T) {
	e := newEnv(fakePhotoSource{cands: cands(1)}, photoFiles(0))
	e.repo.replaceErr = errors.New("banco fora")
	e.store.objects["species/turdus-rufiventris/photo-OLD-thumb.webp"] = "x"
	if err := e.uc.Run(context.Background(), sabia); err == nil {
		t.Fatal("falha do banco deveria propagar")
	}
	if len(e.store.deleted) != 0 {
		t.Fatalf("o banco ainda referencia a foto antiga: não pode apagar %v", e.store.deleted)
	}
}

// 40 candidatas com curador e conversor falsos lentos terminam dentro do prazo.
func TestIngestPhotos_FinishesWithinTimeout(t *testing.T) {
	e := newEnv(fakePhotoSource{cands: cands(40)}, photoFiles(upTo(40)...))
	e.imgs.delay, e.curator.delay = 5*time.Millisecond, 100*time.Millisecond
	e.uc.Timeout = 3 * time.Second
	start := time.Now()
	if err := e.uc.Run(context.Background(), sabia); err != nil {
		t.Fatal(err)
	}
	if time.Since(start) > e.uc.Timeout {
		t.Fatalf("levou %v", time.Since(start))
	}
}

// hasFlag diz se o relatório tem a marca.
func hasFlag(r domain.CurationReport, f domain.CurationFlag) bool {
	for _, x := range r.Flags {
		if x == f {
			return true
		}
	}
	return false
}

// slicesContain diz se a lista tem o texto.
func slicesContain(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}
```

Algum teste antigo de `photos_test.go` (como `TestIngestPhotos_KeyFollowsSourcePhotoNotPosition` ou o resto de `NoAcceptedPhotosRemovesAllOldPhotos`) pode não ter um equivalente acima:
- se o comportamento ainda existe, reescreva o teste no formato `newEnv`;
- se não existe mais, registre no ledger por que ele saiu.

A chave por id da foto continua coberta pelo `LargeKey` de `TestIngestPhotos_PicksPrimaryByScore`.

Run: `go test ./internal/usecase/ingest/`
Expected: FAIL na compilação (`unknown field Curator in struct literal`)

- [ ] **Step 4: Reescrever `photos.go`**

Substitua `photos.go` inteiro por:

```go
// Caso de uso das fotos (iNaturalist) com a curadoria da frente A: buscar
// candidatas, aplicar licença e override, baixar, gerar a medium, perguntar
// ao curador o que cada foto mostra, escolher a principal e a galeria, gerar
// thumb e large só das escolhidas e trocar tudo no banco com o relatório.

package ingest

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

// IngestPhotos escolhe e grava as fotos de uma espécie.
//
//   - MaxPhotos: tamanho da galeria (6); a posição 0 é a principal.
//   - MaxCandidates: quantas candidatas vão ao curador (40).
//   - Observations: quantas observações a busca pede (20, com até 3 fotos cada).
//   - LowConfidence: abaixo disso, a principal do modelo é marcada no relatório.
//   - Timeout: prazo do job inteiro (PHOTO_JOB_TIMEOUT).
type IngestPhotos struct {
	Source        PhotoSource
	Downloader    Downloader
	Images        ImageProcessor
	Curator       PhotoCurator
	Store         MediaStore
	Repo          MediaRepository
	Overrides     OverrideSource
	Policy        domain.LicensePolicy
	MaxPhotos     int
	MaxCandidates int
	Observations  int
	LowConfidence float64
	Timeout       time.Duration
}

// acceptedPhoto é uma candidata que passou na licença, com a licença já
// interpretada. override marca a principal do YAML.
type acceptedPhoto struct {
	cand     PhotoCandidate
	license  domain.License
	override bool
}

// Run trata um job de fotos, na ordem da seção 5.2 da spec. Se o curador
// está fora do ar, devolve ErrCuratorUnavailable antes de tocar no storage
// ou no banco: as fotos atuais ficam, e o Runner adia o job.
func (u IngestPhotos) Run(ctx context.Context, job Job) error {
	if u.Timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, u.Timeout)
		defer cancel()
	}
	override, err := u.Overrides.PhotoOverride(ctx, job.SpeciesID)
	if err != nil {
		return err
	}
	found, err := u.Source.FindPhotos(ctx, job.ScientificName, u.Observations)
	if err != nil {
		return fmt.Errorf("buscar fotos: %w", err)
	}

	// Passos 1 a 3: licença, exclusões, a principal do override na frente e o corte.
	accepted := u.accept(found, override)
	overrideFailed := false
	if override.HasPrimary() {
		primary, ok, err := u.findPrimary(ctx, override)
		if err != nil {
			return err
		}
		if ok {
			accepted = withPrimaryFirst(accepted, primary)
		} else {
			overrideFailed = true
		}
	}
	accepted = accepted[:min(len(accepted), u.MaxCandidates)]
	if len(accepted) == 0 {
		// A fonte respondeu e não há nada utilizável: limpar é o resultado correto.
		return u.publish(ctx, job, nil, domain.CurationReport{Flags: curationFlags(nil, nil, overrideFailed, u.LowConfidence)})
	}

	// Passo 4: baixar e gerar a medium. Uma foto ruim não derruba as outras.
	prepared, lastErr := u.prepare(ctx, accepted)
	if len(prepared) == 0 {
		// Havia candidatas boas e todas falharam: provavelmente algo temporário.
		// Devolvemos erro (o job tenta de novo) em vez de apagar fotos que já temos.
		return fmt.Errorf("nenhuma foto processada: %w", lastErr)
	}
	if accepted[0].override && !prepared[0].override {
		overrideFailed = true // a principal do YAML não baixou ou não converteu
	}

	// Passo 5: o curador, em lotes de 8.
	modelVersion, err := u.classify(ctx, prepared)
	if err != nil {
		return err
	}
	if prepared[0].override && prepared[0].verdict.Category == domain.PhotoUnspecified {
		prepared[0].override, overrideFailed = false, true // a principal do YAML não abriu no curador
	}

	// Passo 6: pontuar e escolher.
	scoreAll(prepared)
	chosen := choose(prepared, u.MaxPhotos)

	// Passo 7: thumb e large só das escolhidas, e as três no storage.
	photos, err := u.finish(ctx, job, chosen, modelVersion)
	if err != nil {
		return err
	}
	report := domain.CurationReport{ModelVersion: modelVersion, Candidates: reportCandidates(prepared),
		Flags: curationFlags(prepared, chosen, overrideFailed, u.LowConfidence)}
	if len(photos) > 0 {
		report.PrimaryPhotoID = photos[0].SourcePhotoID
	}
	// Passos 8 e 9: banco (fotos + relatório numa transação) e limpeza.
	return u.publish(ctx, job, photos, report)
}

// accept fica com as candidatas de licença aceita, id seguro e fora das
// exclusões, sem repetir a mesma foto. A licença é conferida ANTES de
// baixar: nem tocamos em arquivos que não podemos usar.
func (u IngestPhotos) accept(cands []PhotoCandidate, override domain.PhotoOverride) []acceptedPhoto {
	var out []acceptedPhoto
	seen := map[string]bool{}
	for _, c := range cands {
		lic, ok := u.license(c)
		if !ok || seen[c.SourceID] || override.Excludes(c.SourceID) {
			continue
		}
		seen[c.SourceID] = true
		out = append(out, acceptedPhoto{cand: c, license: lic})
	}
	return out
}

// license interpreta a licença da candidata e diz se ela e o id servem.
func (u IngestPhotos) license(c PhotoCandidate) (domain.License, bool) {
	lic, err := domain.ParseLicense(c.License)
	return lic, err == nil && u.Policy.Accepts(lic) && validSourceID(c.SourceID)
}

// findPrimary busca a principal do YAML, mesmo fora das candidatas. Ela
// passa pela mesma política de licença. ok=false: sumiu ou a licença não
// serve mais (a espécie é marcada override_failed).
func (u IngestPhotos) findPrimary(ctx context.Context, o domain.PhotoOverride) (acceptedPhoto, bool, error) {
	c, found, err := u.Source.FindObservationPhoto(ctx, o.PrimaryObservationID, o.PrimaryPhotoID)
	if err != nil {
		return acceptedPhoto{}, false, fmt.Errorf("buscar a foto do override: %w", err)
	}
	if !found {
		return acceptedPhoto{}, false, nil
	}
	lic, ok := u.license(c)
	return acceptedPhoto{cand: c, license: lic, override: true}, ok, nil
}

// withPrimaryFirst põe a principal do override na frente e tira a cópia
// dela que tenha vindo nas candidatas.
func withPrimaryFirst(accepted []acceptedPhoto, primary acceptedPhoto) []acceptedPhoto {
	out := []acceptedPhoto{primary}
	for _, a := range accepted {
		if a.cand.SourceID != primary.cand.SourceID {
			out = append(out, a)
		}
	}
	return out
}

// prepare baixa cada candidata e gera a medium. As que falham ficam de fora;
// lastErr guarda o último erro, para a mensagem quando todas falham.
func (u IngestPhotos) prepare(ctx context.Context, accepted []acceptedPhoto) ([]classified, error) {
	var out []classified
	var lastErr error
	for _, a := range accepted {
		data, _, err := u.Downloader.Fetch(ctx, a.cand.URL, DownloadImage)
		if err != nil {
			lastErr = err
			continue
		}
		medium, err := u.Images.Medium(ctx, data)
		if err != nil {
			lastErr = err
			continue
		}
		out = append(out, classified{cand: a.cand, license: a.license, original: data, medium: medium, override: a.override})
	}
	return out, lastErr
}

// classify manda as mediums ao curador em lotes de MaxCuratorBatch e guarda
// o veredito de cada uma. Devolve a versão do modelo.
func (u IngestPhotos) classify(ctx context.Context, cs []classified) (string, error) {
	var version string
	for start := 0; start < len(cs); start += MaxCuratorBatch {
		batch := cs[start:min(start+MaxCuratorBatch, len(cs))]
		in := make([]CuratorPhoto, len(batch))
		for i, x := range batch {
			in[i] = CuratorPhoto{PhotoID: x.cand.SourceID, Image: x.medium}
		}
		verdicts, v, err := u.Curator.ClassifyPhotos(ctx, in)
		if err != nil {
			return "", fmt.Errorf("classificar fotos: %w", err)
		}
		for i := range batch {
			batch[i].verdict = verdicts[i] // batch aponta para o mesmo array de cs
		}
		version = v
	}
	return version, nil
}

// finish gera a thumb e a large das escolhidas e grava as três variantes no
// storage. O crédito guarda a página da observação, para o app linkar o
// original. Uma falha aqui devolve erro: a medium da mesma foto já foi
// gerada, então é quase sempre algo temporário, e o job tenta de novo.
func (u IngestPhotos) finish(ctx context.Context, job Job, chosen []classified, modelVersion string) ([]domain.Photo, error) {
	photos := make([]domain.Photo, 0, len(chosen))
	for _, x := range chosen {
		v, err := u.Images.ThumbAndLarge(ctx, x.original)
		if err != nil {
			return nil, fmt.Errorf("gerar thumb e large da foto %s: %w", x.cand.SourceID, err)
		}
		p := domain.Photo{
			ThumbKey:  photoKey(job.SpeciesID, x.cand.SourceID, "thumb"),
			MediumKey: photoKey(job.SpeciesID, x.cand.SourceID, "medium"),
			LargeKey:  photoKey(job.SpeciesID, x.cand.SourceID, "large"),
			Width:     v.Width, Height: v.Height,
			Credit: domain.Credit{Author: x.cand.Author, License: string(x.license), Source: "inaturalist", SourceURL: x.cand.PageURL},
			SourcePhotoID: x.cand.SourceID, Category: x.verdict.Category, Score: x.score, ModelVersion: modelVersion,
		}
		for key, body := range map[string][]byte{p.ThumbKey: v.Thumb, p.MediumKey: x.medium, p.LargeKey: v.Large} {
			if err := u.Store.Put(ctx, key, "image/webp", body); err != nil {
				return nil, errors.Join(errors.New("gravar no storage"), err)
			}
		}
		photos = append(photos, p)
	}
	return photos, nil
}

// publish troca as fotos no banco (com o relatório) e, só depois de o banco
// apontar para as novas, apaga do storage os arquivos que ninguém usa mais.
func (u IngestPhotos) publish(ctx context.Context, job Job, photos []domain.Photo, report domain.CurationReport) error {
	if err := u.Repo.ReplacePhotos(ctx, job.SpeciesID, photos, report); err != nil {
		return err
	}
	keep := map[string]bool{}
	for _, p := range photos {
		keep[p.ThumbKey], keep[p.MediumKey], keep[p.LargeKey] = true, true, true
	}
	removeOrphans(ctx, u.Store, photoPrefix(job.SpeciesID), keep)
	return nil
}
```

Run: `go test -race ./internal/usecase/ingest/`
Expected: `ok`, com os testes de seleção (Tarefa 8) e os de fotos. O `go build ./...` ainda falha no `postgres` (assinatura do `ReplacePhotos`) e no `cmd/worker`, e o próximo passo resolve.

- [ ] **Step 5: Repositório com o relatório**

Teste novo em `ingest_repository_test.go`:

```go
// ReplacePhotos grava a linha do relatório junto, com as candidatas em JSON e as marcas.
func TestReplacePhotos_WritesCurationReport(t *testing.T) {
	repo, pool := newRepo(t)
	ctx := context.Background()
	seed(t, repo, sp("Turdus rufiventris", "Sabiá-laranjeira", nil))
	q := postgres.NewIngestRepository(pool)
	report := domain.CurationReport{ModelVersion: "m@2", PrimaryPhotoID: "11",
		Candidates: []domain.CuratedCandidate{{PhotoID: "11", ObservationID: "1001", Category: domain.PhotoSingleBird, Score: 0.5, Confidence: 0.25}},
		Flags:      []domain.CurationFlag{domain.FlagLowConfidence}}
	if err := q.ReplacePhotos(ctx, "turdus-rufiventris", nil, report); err != nil {
		t.Fatal(err)
	}
	var version, primary, category string
	var flags []string
	err := pool.QueryRow(ctx, `SELECT model_version, primary_photo_id, candidates->0->>'category', flags
		FROM curation_report WHERE species_id = 'turdus-rufiventris'`).Scan(&version, &primary, &category, &flags)
	if err != nil || version != "m@2" || primary != "11" || category != "single_bird" || len(flags) != 1 || flags[0] != "low_confidence" {
		t.Fatalf("relatório gravado: %q %q %q %v %v", version, primary, category, flags, err)
	}
}
```

No `TestReplacePhotos_StoresCurationFields` da Tarefa 3, a chamada passa a ser `q.ReplacePhotos(ctx, "turdus-rufiventris", []domain.Photo{photo}, domain.CurationReport{ModelVersion: "m@2"})`. Faça o mesmo em qualquer outra chamada antiga de `ReplacePhotos` nos testes (`grep -rn "ReplacePhotos(" internal/adapter/postgres/`).

Em `queries_ingest.sql`:

```sql
-- name: InsertCurationReport :exec
-- Uma linha do relatório de curadoria: o que o curador disse de cada
-- candidata, a principal escolhida e as marcas para o dono conferir.
INSERT INTO curation_report (species_id, model_version, primary_photo_id, candidates, flags)
VALUES ($1, $2, $3, $4, $5);
```

Run: `go tool sqlc generate`

Em `ingest_repository.go`:

```go
// candidateDTO é o formato JSON de uma candidata na coluna candidates. As
// tags `json:"..."` ficam aqui no adapter: o domínio não sabe de JSON.
type candidateDTO struct {
	PhotoID       string  `json:"photo_id"`
	ObservationID string  `json:"observation_id"`
	Category      string  `json:"category"`
	Score         float64 `json:"score"`
	Confidence    float64 `json:"confidence"`
}

// candidatesToJSON converte as candidatas do domínio no JSON da coluna.
func candidatesToJSON(cs []domain.CuratedCandidate) ([]byte, error) {
	out := make([]candidateDTO, len(cs)) // nunca nil: vira [] e não null
	for i, c := range cs {
		out[i] = candidateDTO{PhotoID: c.PhotoID, ObservationID: c.ObservationID, Category: string(c.Category),
			Score: c.Score, Confidence: c.Confidence}
	}
	return json.Marshal(out)
}
```

Troque `replaceMedia` e `ReplacePhotos`:

```go
// replaceMedia apaga a mídia de um tipo e grava a nova, numa transação.
// extra (opcional) roda dentro da mesma transação, antes do Commit.
func (r *IngestRepository) replaceMedia(ctx context.Context, speciesID, kind string, rows []sqlcgen.InsertMediaParams,
	extra func(*sqlcgen.Queries) error) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // após Commit, Rollback não faz nada
	q := r.q.WithTx(tx)
	if err := q.DeleteMediaByKind(ctx, sqlcgen.DeleteMediaByKindParams{SpeciesID: speciesID, Kind: kind}); err != nil {
		return err
	}
	for _, row := range rows {
		if err := q.InsertMedia(ctx, row); err != nil {
			return err
		}
	}
	if extra != nil {
		if err := extra(q); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
```

```go
// ReplacePhotos grava as fotos na ordem recebida (a posição 0 é a principal)
// e a linha do relatório de curadoria, na mesma transação: ou as duas
// coisas ficam, ou nenhuma.
func (r *IngestRepository) ReplacePhotos(ctx context.Context, speciesID string, photos []domain.Photo, report domain.CurationReport) error {
	rows := make([]sqlcgen.InsertMediaParams, len(photos))
	for i, p := range photos {
		rows[i] = sqlcgen.InsertMediaParams{SpeciesID: speciesID, Kind: "photo", Position: toInt32(i),
			ThumbKey: p.ThumbKey, MediumKey: p.MediumKey, LargeKey: p.LargeKey,
			Width: toInt32(p.Width), Height: toInt32(p.Height),
			Author: p.Credit.Author, License: p.Credit.License, Source: p.Credit.Source, SourceUrl: p.Credit.SourceURL,
			SourcePhotoID: pgtype.Text{String: p.SourcePhotoID, Valid: p.SourcePhotoID != ""},
			Category:      pgtype.Text{String: string(p.Category), Valid: p.Category != ""},
			Score:         pgtype.Float4{Float32: float32(p.Score), Valid: p.Category != ""},
			ModelVersion:  pgtype.Text{String: p.ModelVersion, Valid: p.ModelVersion != ""}}
	}
	candidates, err := candidatesToJSON(report.Candidates)
	if err != nil {
		return err
	}
	flags := make([]string, 0, len(report.Flags)) // NOT NULL: lista vazia, nunca nil
	for _, f := range report.Flags {
		flags = append(flags, string(f))
	}
	return r.replaceMedia(ctx, speciesID, "photo", rows, func(q *sqlcgen.Queries) error {
		return q.InsertCurationReport(ctx, sqlcgen.InsertCurationReportParams{SpeciesID: speciesID,
			ModelVersion:   report.ModelVersion,
			PrimaryPhotoID: pgtype.Text{String: report.PrimaryPhotoID, Valid: report.PrimaryPhotoID != ""},
			Candidates:     candidates, Flags: flags})
	})
}
```

No `ReplaceAudio`, a chamada passa a ser `r.replaceMedia(ctx, speciesID, "audio", rows, nil)`. Acrescente o import `"encoding/json"`.

- [ ] **Step 6: Rodar e commitar**

Run: `go tool sqlc diff && go test -race ./internal/usecase/... ./internal/adapter/...`
Expected: tudo verde. O `cmd/worker` ainda não compila; a Tarefa 10 liga as peças.

```bash
git add internal/
git commit -m "feat: ingestão de fotos com o curador, override e relatório de curadoria"
```

---

## Tarefa 10 — Fila com adiamento, um job de fotos por rodada e o worker ligado (`feat/ingestao-curada`)

**Files:**
- Modify: `internal/usecase/ingest/ports.go` (`Job.Deferrals`, `JobQueue.Defer`)
- Modify: `internal/usecase/ingest/runner.go`
- Test: `internal/usecase/ingest/runner_test.go`
- Modify: `internal/usecase/ingest/fakes_test.go` (`fakeQueue.Defer`)
- Modify: `internal/adapter/postgres/queries_ingest.sql` (`DeferJob`; `ClaimDueJobs` devolve `deferrals`; `CompleteJob`, `RescheduleStaleJobs` e `ReopenFailedJobs` zeram)
- Modify: `internal/adapter/postgres/ingest_repository.go` (`Defer`, `ClaimDue`)
- Test: `internal/adapter/postgres/ingest_repository_test.go`
- Modify: `internal/config/worker.go`
- Test: `internal/config/worker_test.go`
- Modify: `cmd/worker/main.go`

**Interfaces:**
- Consumes: `ErrCuratorUnavailable` (Tarefa 6), `IngestPhotos` (Tarefa 9), `curator.New` (Tarefa 6) e o valor de `LOW_CONFIDENCE` (Tarefa 1).
- Produces:
  - `Job.Deferrals int`;
  - `JobQueue.Defer(ctx, jobID int64, cause string, retryIn time.Duration) error`;
  - `Runner.MaxPerRound map[Source]int`;
  - `WorkerConfig.CuratorAddr`, `WorkerConfig.PhotoJobTimeout` e `WorkerConfig.LowConfidence`.

- [ ] **Step 1: Testes do Runner, que falham**

Em `fakes_test.go`, no `fakeQueue`, acrescente o campo `deferred []failCall` e o método:

```go
func (f *fakeQueue) Defer(ctx context.Context, id int64, cause string, retryIn time.Duration) error {
	f.ctxErrOnFinish = append(f.ctxErrOnFinish, ctx.Err())
	f.deferred = append(f.deferred, failCall{id: id, cause: cause, retryIn: retryIn})
	return nil
}
```

Em `runner_test.go`, acrescente:

```go
// Curador fora do ar: o job é adiado (sem gastar tentativa), não falha. A
// espera cresce com os adiamentos anteriores (backoff).
func TestRunner_DefersCuratorUnavailable(t *testing.T) {
	q := &fakeQueue{jobs: []ingest.Job{{ID: 1, Source: ingest.SourceINaturalist, Attempts: 4, Deferrals: 2}}}
	r := ingest.Runner{Queue: q, BatchSize: 5, MaxAttempts: 5,
		Handlers: map[ingest.Source]ingest.Handler{ingest.SourceINaturalist: handlerFunc(func(context.Context, ingest.Job) error {
			return fmt.Errorf("classificar: %w", ingest.ErrCuratorUnavailable)
		})}}
	if _, err := r.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(q.failed) != 0 || len(q.deferred) != 1 || q.deferred[0].retryIn != 4*time.Minute {
		t.Fatalf("esperava adiar 4 min sem falhar: failed=%+v deferred=%+v", q.failed, q.deferred)
	}
}

// No máximo 1 job de fotos por rodada: os outros voltam para a fila sem rodar.
func TestRunner_OnePhotoJobPerRound(t *testing.T) {
	q := &fakeQueue{jobs: []ingest.Job{
		{ID: 1, Source: ingest.SourceINaturalist}, {ID: 2, Source: ingest.SourceGBIF}, {ID: 3, Source: ingest.SourceINaturalist},
	}}
	var ran []int64
	h := handlerFunc(func(_ context.Context, j ingest.Job) error { ran = append(ran, j.ID); return nil })
	r := ingest.Runner{Queue: q, BatchSize: 5, MaxAttempts: 5, MaxPerRound: map[ingest.Source]int{ingest.SourceINaturalist: 1},
		Handlers: map[ingest.Source]ingest.Handler{ingest.SourceINaturalist: h, ingest.SourceGBIF: h}}
	n, err := r.RunOnce(context.Background())
	if err != nil || n != 3 {
		t.Fatalf("n=%d err=%v (o lote pegou 3)", n, err)
	}
	if fmt.Sprint(ran) != "[1 2]" || fmt.Sprint(q.released) != "[3]" {
		t.Fatalf("rodou %v, devolveu %v", ran, q.released)
	}
}
```

Acrescente `"fmt"` aos imports.

Run: `go test ./internal/usecase/ingest/ -run 'Defers|OnePhotoJob'`
Expected: FAIL na compilação (`unknown field Deferrals`, `MaxPerRound`)

- [ ] **Step 2: Implementar no Runner**

Em `ports.go`, o `Job` ganha:

```go
	Deferrals      int // quantas vezes foi adiado (curador fora do ar)
```

E a `JobQueue` ganha:

```go
	// Defer devolve o job à fila para daqui a retryIn SEM contar tentativa
	// (o problema foi nosso, não da espécie) e soma um adiamento.
	Defer(ctx context.Context, jobID int64, cause string, retryIn time.Duration) error
```

Em `runner.go`, o `Runner` ganha o campo:

```go
	// MaxPerRound limita quantos jobs de uma fonte rodam por rodada. O job de
	// fotos é longo (40 downloads, o curador, o ffmpeg): com 1 por rodada,
	// ele não disputa o prazo da rodada com outro igual. Os que passam do
	// limite voltam para a fila sem gastar tentativa e saem na rodada seguinte.
	MaxPerRound map[Source]int
```

No `RunOnce`, troque o laço por:

```go
	perSource := map[Source]int{}
	for _, job := range jobs {
		limit, limited := r.MaxPerRound[job.Source]
		if ctx.Err() != nil || (limited && perSource[job.Source] >= limit) {
			// O lote acabou (tempo ou shutdown), ou a fonte já rodou o seu
			// limite nesta rodada: devolvemos o job sem rodar, sem gastar
			// tentativa e sem sujar a métrica de erros.
			_ = r.finishCtx(ctx, func(c context.Context) error { return r.Queue.Release(c, job.ID) })
			continue
		}
		perSource[job.Source]++
		r.runJob(ctx, job)
	}
```

No `runJob`, logo depois do `if err == nil { ... return }`:

```go
	if errors.Is(err, ErrCuratorUnavailable) {
		// Curador fora do ar: adiar, não falhar. A espera cresce com os
		// adiamentos (1, 2, 4... min), não com as tentativas.
		_ = r.finishCtx(ctx, func(c context.Context) error {
			return r.Queue.Defer(c, job.ID, err.Error(), domain.NextAttemptDelay(job.Deferrals))
		})
		return
	}
```

Acrescente `"errors"` aos imports e atualize o comentário do `runJob` dizendo que "curador indisponível adia o job".

Run: `go test -race ./internal/usecase/ingest/`
Expected: `ok`

- [ ] **Step 3: Fila no banco**

Teste novo em `ingest_repository_test.go`:

```go
// Defer reagenda sem somar tentativa e soma um adiamento; o sucesso zera.
func TestJobQueue_Defer(t *testing.T) {
	repo, pool := newRepo(t)
	ctx := context.Background()
	seed(t, repo, sp("Turdus rufiventris", "Sabiá-laranjeira", nil))
	q := postgres.NewIngestRepository(pool)
	if _, err := q.EnqueueMissing(ctx, []ingest.Source{ingest.SourceINaturalist}, time.Hour); err != nil {
		t.Fatal(err)
	}
	jobs, _ := q.ClaimDue(ctx, 1)
	if err := q.Defer(ctx, jobs[0].ID, "curador indisponível", time.Hour); err != nil {
		t.Fatal(err)
	}
	var status string
	var attempts, deferrals int
	_ = pool.QueryRow(ctx, "SELECT status, attempts, deferrals FROM ingestion_job WHERE id=$1", jobs[0].ID).Scan(&status, &attempts, &deferrals)
	if status != "pending" || attempts != 0 || deferrals != 1 {
		t.Fatalf("depois de Defer: %s attempts=%d deferrals=%d", status, attempts, deferrals)
	}
	if due, _ := q.ClaimDue(ctx, 1); len(due) != 0 {
		t.Fatal("adiado para daqui a 1 h não pode estar vencido")
	}
	_, _ = pool.Exec(ctx, "UPDATE ingestion_job SET next_run_at = now() WHERE id=$1", jobs[0].ID)
	again, _ := q.ClaimDue(ctx, 1)
	if len(again) != 1 || again[0].Deferrals != 1 {
		t.Fatalf("ClaimDue deveria trazer os adiamentos: %+v", again)
	}
	_ = q.Complete(ctx, again[0].ID)
	_ = pool.QueryRow(ctx, "SELECT deferrals FROM ingestion_job WHERE id=$1", jobs[0].ID).Scan(&deferrals)
	if deferrals != 0 {
		t.Fatalf("o sucesso deveria zerar os adiamentos, veio %d", deferrals)
	}
}
```

Em `queries_ingest.sql`:
- `ClaimDueJobs` passa a terminar com `RETURNING j.id, j.species_id, s.scientific_name, j.source, j.attempts, j.deferrals;`;
- `CompleteJob` vira `UPDATE ingestion_job SET status = 'done', last_error = '', deferrals = 0, updated_at = now() WHERE id = $1;`;
- `RescheduleStaleJobs` e `ReopenFailedJobs` ganham `deferrals = 0,` junto do `attempts = 0`.

Acrescente:

```sql
-- name: DeferJob :exec
-- Adia o job porque o curador está fora do ar: volta para 'pending' daqui a
-- retry_in_secs segundos, SEM somar tentativa (attempts) e somando um
-- adiamento (deferrals), que é o que faz a espera crescer.
UPDATE ingestion_job SET
    status = 'pending',
    deferrals = deferrals + 1,
    last_error = sqlc.arg('last_error'),
    next_run_at = now() + make_interval(secs => sqlc.arg('retry_in_secs')::double precision),
    updated_at = now()
WHERE id = sqlc.arg('id');
```

Atualize os comentários das consultas alteradas (`CompleteJob` "e zera os adiamentos").

Run: `go tool sqlc generate`

Em `ingest_repository.go`:
- no `ClaimDue`, acrescente `Deferrals: int(row.Deferrals)`;
- acrescente o método:

```go
// Defer adia o job sem contar tentativa (curador fora do ar). A mensagem é
// cortada como no Fail.
func (r *IngestRepository) Defer(ctx context.Context, jobID int64, cause string, retryIn time.Duration) error {
	if len(cause) > 500 {
		cause = strings.ToValidUTF8(cause[:500], "")
	}
	return r.q.DeferJob(ctx, sqlcgen.DeferJobParams{ID: jobID, LastError: cause, RetryInSecs: retryIn.Seconds()})
}
```

Run: `go tool sqlc diff && go test -race ./internal/adapter/postgres/`
Expected: `ok`

- [ ] **Step 4: Configuração**

Teste novo em `worker_test.go`. Siga o helper de ambiente que o arquivo já usa para montar o `getenv` com as obrigatórias; abaixo ele se chama `env(...)`:

```go
// As variáveis da curadoria: padrões e valores inválidos.
func TestLoadWorker_Curation(t *testing.T) {
	c, err := config.LoadWorker(env(nil))
	if err != nil {
		t.Fatal(err)
	}
	if c.CuratorAddr != "photo-curator:50061" || c.PhotoJobTimeout != 6*time.Minute || c.LowConfidence != config.DefaultLowConfidence {
		t.Fatalf("padrões: %+v", c)
	}
	for _, bad := range []map[string]string{
		{"PHOTO_JOB_TIMEOUT": "0s"}, {"LOW_CONFIDENCE": "1.5"}, {"LOW_CONFIDENCE": "0"}, {"LOW_CONFIDENCE": "abc"},
	} {
		if _, err := config.LoadWorker(env(bad)); err == nil {
			t.Errorf("deveria recusar %v", bad)
		}
	}
}
```

Se o arquivo de teste não tiver um helper assim, crie um `env(extra map[string]string) func(string) string` com as cinco obrigatórias preenchidas e os valores de `extra` por cima.

Run: `go test ./internal/config/ -run Curation`
Expected: FAIL (`c.CuratorAddr undefined`)

Em `worker.go`:
- no comentário da struct, acrescente: "Curadoria: o curador em photo-curator:50061, prazo de 6 min por job de fotos e LOW_CONFIDENCE calibrado no conjunto de referência do curador.";
- na struct:

```go
	CuratorAddr     string        // endereço gRPC do passarim-photo-curator
	PhotoJobTimeout time.Duration // prazo de um job de fotos
	LowConfidence   float64       // abaixo disso, a principal é marcada no relatório
```

```go
// DefaultLowConfidence é o percentil 20 da confiança das fotos que o curador
// chama de ave sozinha na metade de calibração do conjunto de referência
// (scripts/low_confidence.py do passarim-photo-curator). Recalcule quando o
// MODEL_VERSION do curador mudar.
const DefaultLowConfidence = <VALOR DO TASK 1>
```

`<VALOR DO TASK 1>` é o número que o Task 1 Step 5 imprimiu e o ledger guardou, por exemplo `0.412`. Ponha também o `MODEL_VERSION` do curador no comentário, por exemplo "medido com rtdetr-r50vd+openclip-b32@2".

No `LoadWorker`:
- acrescente `CuratorAddr: or(getenv("CURATOR_ADDR"), "photo-curator:50061"),` no literal;
- antes do `return c, nil`, acrescente:

```go
	if c.PhotoJobTimeout, err = durationVar(getenv, "PHOTO_JOB_TIMEOUT", 6*time.Minute); err != nil {
		return c, err
	}
	c.LowConfidence = DefaultLowConfidence
	if v := getenv("LOW_CONFIDENCE"); v != "" {
		// Uma probabilidade: estritamente entre 0 e 1 (0 não marcaria nada; 1 marcaria tudo).
		if c.LowConfidence, err = strconv.ParseFloat(v, 64); err != nil || c.LowConfidence <= 0 || c.LowConfidence >= 1 {
			return c, errors.New("LOW_CONFIDENCE: esperava um número entre 0 e 1, ex.: 0.4")
		}
	}
```

Run: `go test ./internal/config/`
Expected: `ok`

- [ ] **Step 5: Ligar no worker**

Em `cmd/worker/main.go`:

1. Troque a constante:

```go
// batchTimeout é o tempo de uma rodada sem job de fotos. A rodada inteira
// ganha também o prazo do job de fotos (cfg.PhotoJobTimeout), porque ele
// pode ser o último a rodar: somar garante o prazo inteiro a ele.
const batchTimeout = 2 * time.Minute
```

2. Depois do `ffmpeg := ...`:

```go
	// O curador (passarim-photo-curator) diz o que cada foto mostra. Só ele
	// e o worker estão na rede passarim-curation do compose.
	photoCurator, err := curator.New(cfg.CuratorAddr, 30*time.Second)
	if err != nil {
		return err
	}
	defer func() { _ = photoCurator.Close() }()
```

3. No `Runner`, acrescente `MaxPerRound: map[ingest.Source]int{ingest.SourceINaturalist: 1},`. O handler de fotos vira:

```go
			ingest.SourceINaturalist: ingest.IngestPhotos{
				Source:     inaturalist.New("https://api.inaturalist.org", cfg.UserAgent, oneSec()),
				Downloader: downloader, Images: ffmpeg, Curator: photoCurator, Store: store, Repo: repo, Overrides: repo,
				Policy: policy, MaxPhotos: 6, MaxCandidates: 40, Observations: 20,
				LowConfidence: cfg.LowConfidence, Timeout: cfg.PhotoJobTimeout},
```

4. O comentário do Runner troca "até 5 fotos por espécie" por "galeria de até 6 fotos escolhidas pelo curador entre até 40 candidatas, e um job de fotos por rodada".

5. `loop` e `runBatch` passam a usar o prazo da rodada:

```go
func runBatch(ctx context.Context, log *slog.Logger, runner ingest.Runner, timeout time.Duration) int {
	batchCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), timeout)
```

No `loop`, chame `runBatch(ctx, log, runner, batchTimeout+cfg.PhotoJobTimeout)`. Atualize o comentário do `runBatch`, que fala de `batchTimeout`.

6. Acrescente o import `"github.com/velosobr/passarim-catalog/internal/adapter/curator"`.

`repo` (`*postgres.IngestRepository`) já tem `PhotoOverride` (Tarefa 4) e, por isso, serve de `OverrideSource`. Acrescente essa conferência em `ingest_repository.go`, junto das outras:

```go
	_ ingest.OverrideSource  = (*IngestRepository)(nil)
```

- [ ] **Step 6: Rodar tudo e commitar**

Run: `go build ./... && go tool sqlc diff && go test -race ./... && golangci-lint run`
Expected: tudo verde.

```bash
git add internal/ cmd/
git commit -m "feat: curador fora do ar adia o job, um job de fotos por rodada e worker ligado ao curador"
```

---

## Tarefa 11 — Comandos `requeue` e `curation-report` (`feat/ingestao-curada`)

**Files:**
- Modify: `internal/adapter/postgres/queries_ingest.sql` (`RequeuePhotoJobs`, `LatestCurationReports`)
- Modify: `internal/adapter/postgres/ingest_repository.go` (`RequeuePhotoJobs`, `LatestCurationReports`, `fromDTO`)
- Test: `internal/adapter/postgres/ingest_repository_test.go`
- Create: `internal/usecase/ingest/report.go`
- Test: `internal/usecase/ingest/report_test.go`
- Modify: `cmd/worker/main.go` (subcomandos)
- Modify: `README.md` do catalog (seção do worker)

**Interfaces:**
- Consumes: as tabelas da Tarefa 3 e os tipos da Tarefa 2.
- Produces:
  - `(*IngestRepository).RequeuePhotoJobs(ctx, speciesIDs []string) ([]string, error)`, que devolve os ids reenfileirados;
  - `(*IngestRepository).LatestCurationReports(ctx) ([]domain.CurationReportEntry, error)`;
  - `ingest.FormatCurationReport(entries []domain.CurationReportEntry) string`.

- [ ] **Step 1: Testes do repositório, que falham**

```go
// requeue: só as espécies dadas, ou todas; nunca um job rodando.
func TestRequeuePhotoJobs(t *testing.T) {
	repo, pool := newRepo(t)
	ctx := context.Background()
	seed(t, repo, sp("Turdus rufiventris", "Sabiá-laranjeira", nil), sp("Pitangus sulphuratus", "Bem-te-vi", nil),
		sp("Crotophaga ani", "Anu-preto", nil))
	q := postgres.NewIngestRepository(pool)
	// Sem rodar o EnqueueMissing antes: o requeue cria os jobs que faltam.
	_, _ = pool.Exec(ctx, `UPDATE ingestion_job SET status = 'done'`)
	got, err := q.RequeuePhotoJobs(ctx, []string{"crotophaga-ani"})
	if err != nil || fmt.Sprint(got) != "[crotophaga-ani]" {
		t.Fatalf("só a dada: %v %v", got, err)
	}
	_, _ = pool.Exec(ctx, `UPDATE ingestion_job SET status = 'done'`)
	_, _ = pool.Exec(ctx, `UPDATE ingestion_job SET status = 'running' WHERE species_id = 'pitangus-sulphuratus'`)
	got, _ = q.RequeuePhotoJobs(ctx, nil)
	slices.Sort(got)
	if fmt.Sprint(got) != "[crotophaga-ani turdus-rufiventris]" {
		t.Fatalf("todas menos a que está rodando: %v", got)
	}
	var otherSources int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM ingestion_job WHERE source <> 'inaturalist'`).Scan(&otherSources)
	if otherSources != 0 {
		t.Fatalf("requeue só cria e mexe em jobs de fotos, achou %d de outras fontes", otherSources)
	}
}

// O relatório traz só a última execução de cada espécie, com o nome popular.
func TestLatestCurationReports(t *testing.T) {
	repo, pool := newRepo(t)
	ctx := context.Background()
	seed(t, repo, sp("Turdus rufiventris", "Sabiá-laranjeira", nil))
	q := postgres.NewIngestRepository(pool)
	_ = q.ReplacePhotos(ctx, "turdus-rufiventris", nil, domain.CurationReport{ModelVersion: "old"})
	_ = q.ReplacePhotos(ctx, "turdus-rufiventris", nil, domain.CurationReport{ModelVersion: "new", PrimaryPhotoID: "11",
		Candidates: []domain.CuratedCandidate{{PhotoID: "11", ObservationID: "1", Category: domain.PhotoSingleBird, Score: 0.5, Confidence: 0.25}},
		Flags:      []domain.CurationFlag{domain.FlagLowConfidence}})
	got, err := q.LatestCurationReports(ctx)
	if err != nil || len(got) != 1 {
		t.Fatalf("got %+v %v", got, err)
	}
	e := got[0]
	if e.CommonName != "Sabiá-laranjeira" || e.Report.ModelVersion != "new" || e.Report.PrimaryPhotoID != "11" ||
		len(e.Report.Candidates) != 1 || e.Report.Candidates[0].Category != domain.PhotoSingleBird ||
		len(e.Report.Flags) != 1 || e.RanAt.IsZero() {
		t.Fatalf("entrada: %+v", e)
	}
}
```

As duas execuções acontecem na mesma transação de teste? Não: cada `ReplacePhotos` é uma transação, e o `now()` delas difere. Se elas empatarem no microssegundo, o `ORDER BY ran_at DESC, id DESC` desempata pelo `id`.

Acrescente `"fmt"` e `"slices"` aos imports.

Run: `go test ./internal/adapter/postgres/ -run 'Requeue|LatestCuration'`
Expected: FAIL na compilação.

- [ ] **Step 2: SQL e repositório**

Em `queries_ingest.sql`:

```sql
-- name: RequeuePhotoJobs :many
-- Comando "worker requeue": devolve à fila, agora, os jobs de fotos das
-- espécies dadas (lista vazia = todas), sem esperar os 30 dias do refresh.
-- Zera tentativas e adiamentos. Não mexe em job 'running': outro worker
-- está com ele, e reenfileirar faria dois pegarem a mesma espécie.
-- cardinality(lista) é o tamanho da lista; "= ANY(lista)" é "está na lista".
UPDATE ingestion_job SET status = 'pending', attempts = 0, deferrals = 0, last_error = '',
    next_run_at = now(), updated_at = now()
WHERE source = 'inaturalist' AND status <> 'running'
  AND (cardinality(sqlc.arg('species_ids')::text[]) = 0 OR species_id = ANY(sqlc.arg('species_ids')::text[]))
RETURNING species_id;

-- name: LatestCurationReports :many
-- A última execução da curadoria de cada espécie. DISTINCT ON (species_id)
-- fica com a PRIMEIRA linha de cada espécie na ordem do ORDER BY, ou seja,
-- a mais recente; o id desempata duas execuções no mesmo instante.
SELECT DISTINCT ON (r.species_id) r.species_id, s.common_name_pt, r.ran_at, r.model_version,
       r.primary_photo_id, r.candidates, r.flags
FROM curation_report r JOIN species s ON s.id = r.species_id
ORDER BY r.species_id, r.ran_at DESC, r.id DESC;
```

Run: `go tool sqlc generate`

Em `ingest_repository.go`:

```go
// RequeuePhotoJobs reenfileira os jobs de fotos das espécies dadas (nil =
// todas). Antes cria os jobs de fotos que faltam, para o comando funcionar
// mesmo num banco em que o worker ainda não rodou. Devolve as espécies
// reenfileiradas; quem chama compara com as pedidas.
func (r *IngestRepository) RequeuePhotoJobs(ctx context.Context, speciesIDs []string) ([]string, error) {
	if err := r.q.EnqueueMissingJobs(ctx, []string{string(ingest.SourceINaturalist)}); err != nil {
		return nil, fmt.Errorf("enfileirar: %w", err)
	}
	return r.q.RequeuePhotoJobs(ctx, append([]string{}, speciesIDs...)) // nil viraria NULL, e cardinality(NULL) é NULL
}

// LatestCurationReports lê a última execução da curadoria de cada espécie.
func (r *IngestRepository) LatestCurationReports(ctx context.Context) ([]domain.CurationReportEntry, error) {
	rows, err := r.q.LatestCurationReports(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]domain.CurationReportEntry, len(rows))
	for i, row := range rows {
		var dtos []candidateDTO
		if err := json.Unmarshal(row.Candidates, &dtos); err != nil {
			return nil, fmt.Errorf("relatório de %s: %w", row.SpeciesID, err)
		}
		report := domain.CurationReport{ModelVersion: row.ModelVersion, PrimaryPhotoID: row.PrimaryPhotoID.String}
		for _, d := range dtos {
			report.Candidates = append(report.Candidates, domain.CuratedCandidate{PhotoID: d.PhotoID, ObservationID: d.ObservationID,
				Category: domain.PhotoCategory(d.Category), Score: d.Score, Confidence: d.Confidence})
		}
		for _, f := range row.Flags {
			report.Flags = append(report.Flags, domain.CurationFlag(f))
		}
		out[i] = domain.CurationReportEntry{SpeciesID: row.SpeciesID, CommonName: row.CommonNamePt, RanAt: row.RanAt.Time, Report: report}
	}
	return out, nil
}
```

Run: `go tool sqlc diff && go test -race ./internal/adapter/postgres/`
Expected: `ok`

- [ ] **Step 3: Formatação do relatório (teste e código)**

`report_test.go`:

```go
// Testes do relatório de curadoria em Markdown.

package ingest_test

import (
	"strings"
	"testing"
	"time"

	"github.com/velosobr/passarim-catalog/internal/domain"
	"github.com/velosobr/passarim-catalog/internal/usecase/ingest"
)

// As espécies marcadas vêm antes, cada linha com a principal, as marcas e a
// contagem de candidatas por tipo.
func TestFormatCurationReport(t *testing.T) {
	at := time.Date(2026, 10, 27, 14, 30, 0, 0, time.UTC)
	entries := []domain.CurationReportEntry{
		{SpeciesID: "turdus-rufiventris", CommonName: "Sabiá-laranjeira", RanAt: at, Report: domain.CurationReport{
			ModelVersion: "m@2", PrimaryPhotoID: "11",
			Candidates: []domain.CuratedCandidate{{PhotoID: "11", Category: domain.PhotoSingleBird, Confidence: 0.61}}}},
		{SpeciesID: "crotophaga-ani", CommonName: "Anu-preto", RanAt: at, Report: domain.CurationReport{
			ModelVersion: "m@2",
			Candidates: []domain.CuratedCandidate{{PhotoID: "21", Category: domain.PhotoFlock}, {PhotoID: "22", Category: domain.PhotoNest}},
			Flags:      []domain.CurationFlag{domain.FlagNoSingleBird}}},
	}
	got := ingest.FormatCurationReport(entries)
	for _, want := range []string{
		"2 espécies, 1 marcada",
		"| Anu-preto (`crotophaga-ani`) | — | — | no_single_bird | 0 aves sozinhas, 1 bando, 1 descarte | 2026-10-27 14:30 |",
		"| Sabiá-laranjeira (`turdus-rufiventris`) | [11](https://www.inaturalist.org/photos/11) | 0.61 |  | 1 ave sozinha, 0 bandos, 0 descartes | 2026-10-27 14:30 |",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("faltou %q em:\n%s", want, got)
		}
	}
	if strings.Index(got, "Anu-preto") > strings.Index(got, "Sabiá") {
		t.Error("as marcadas vêm primeiro")
	}
}
```

Run: `go test ./internal/usecase/ingest/ -run FormatCuration`
Expected: FAIL (`undefined: ingest.FormatCurationReport`)

`report.go`:

```go
// O relatório de curadoria em Markdown, que o comando "worker
// curation-report" imprime. O dono o usa para conferir as 41 espécies:
// as marcadas (low_confidence, no_single_bird, override_failed) vêm
// primeiro, e cada principal tem o link da foto no iNaturalist.

package ingest

import (
	"fmt"
	"slices"
	"strings"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

// FormatCurationReport monta o relatório: um resumo e uma tabela, com as
// espécies marcadas primeiro e, dentro de cada grupo, a ordem do id.
func FormatCurationReport(entries []domain.CurationReportEntry) string {
	sorted := slices.Clone(entries)
	slices.SortFunc(sorted, func(a, b domain.CurationReportEntry) int {
		af, bf := len(a.Report.Flags) > 0, len(b.Report.Flags) > 0
		if af != bf {
			if af {
				return -1
			}
			return 1
		}
		return strings.Compare(a.SpeciesID, b.SpeciesID)
	})
	flagged := 0
	for _, e := range entries {
		if len(e.Report.Flags) > 0 {
			flagged++
		}
	}
	var b strings.Builder
	fmt.Fprintf(&b, "# Relatório de curadoria\n\n%d espécies, %d %s.\n\n", len(entries), flagged, plural(flagged, "marcada", "marcadas"))
	b.WriteString("| Espécie | Principal | Confiança | Marcas | Candidatas | Rodou em |\n|---|---|---|---|---|---|\n")
	for _, e := range sorted {
		r := e.Report
		primary, confidence := "—", "—"
		if r.PrimaryPhotoID != "" {
			primary = fmt.Sprintf("[%s](https://www.inaturalist.org/photos/%s)", r.PrimaryPhotoID, r.PrimaryPhotoID)
			for _, c := range r.Candidates {
				if c.PhotoID == r.PrimaryPhotoID {
					confidence = fmt.Sprintf("%.2f", c.Confidence)
				}
			}
		}
		flags := make([]string, len(r.Flags))
		for i, f := range r.Flags {
			flags[i] = string(f)
		}
		fmt.Fprintf(&b, "| %s (`%s`) | %s | %s | %s | %s | %s |\n", e.CommonName, e.SpeciesID, primary, confidence,
			strings.Join(flags, ", "), counts(r.Candidates), e.RanAt.Format("2006-01-02 15:04"))
	}
	return b.String()
}

// counts resume as candidatas: aves sozinhas, bandos e o resto (descartes).
func counts(cs []domain.CuratedCandidate) string {
	var single, flock, other int
	for _, c := range cs {
		switch c.Category {
		case domain.PhotoSingleBird:
			single++
		case domain.PhotoFlock:
			flock++
		default:
			other++
		}
	}
	return fmt.Sprintf("%d %s, %d %s, %d %s", single, plural(single, "ave sozinha", "aves sozinhas"),
		flock, plural(flock, "bando", "bandos"), other, plural(other, "descarte", "descartes"))
}

// plural escolhe a forma da palavra pelo número (1 = singular).
func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}
```

Run: `go test ./internal/usecase/ingest/`
Expected: `ok`

- [ ] **Step 4: Subcomandos no `main.go`**

Troque o `main` e acrescente as duas funções:

```go
// main escolhe o que fazer pelo primeiro argumento:
//   - sem argumento: o laço da fila (o que o compose sobe);
//   - "requeue [species-id...]": reenfileira as fotos das espécies dadas (ou todas);
//   - "curation-report": imprime o relatório de curadoria em Markdown.
//
// No compose: docker compose run --rm catalog-worker requeue crotophaga-ani
func main() {
	log := slog.New(slog.NewJSONHandler(os.Stderr, nil))
	var err error
	args := os.Args[1:]
	switch {
	case len(args) == 0:
		log = slog.New(slog.NewJSONHandler(os.Stdout, nil))
		err = run(log)
	case args[0] == "requeue":
		err = requeue(args[1:])
	case args[0] == "curation-report":
		err = curationReport()
	default:
		err = fmt.Errorf("comando desconhecido %q (use requeue ou curation-report)", args[0])
	}
	if err != nil {
		log.Error("worker encerrou com erro", "error", err)
		os.Exit(1)
	}
}

// openRepo abre o banco para os comandos (só precisam de DATABASE_URL) e
// aplica as migrations, como o laço faz.
func openRepo(ctx context.Context) (*postgres.IngestRepository, func(), error) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		return nil, nil, errors.New("DATABASE_URL é obrigatória")
	}
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, nil, fmt.Errorf("configurar pool: %w", err)
	}
	if err := postgres.WaitForDB(ctx, pool.Ping, 30, time.Second); err != nil {
		pool.Close()
		return nil, nil, err
	}
	if err := postgres.Migrate(url); err != nil {
		pool.Close()
		return nil, nil, err
	}
	return postgres.NewIngestRepository(pool), pool.Close, nil
}

// requeue reenfileira os jobs de fotos e diz quantos. Se algum id pedido não
// voltou (não existe ou está rodando agora), sai com erro citando os ids.
func requeue(speciesIDs []string) error {
	ctx := context.Background()
	repo, closeDB, err := openRepo(ctx)
	if err != nil {
		return err
	}
	defer closeDB()
	done, err := repo.RequeuePhotoJobs(ctx, speciesIDs)
	if err != nil {
		return err
	}
	fmt.Printf("%d jobs de fotos reenfileirados\n", len(done))
	var missing []string
	for _, id := range speciesIDs {
		if !slices.Contains(done, id) {
			missing = append(missing, id)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("não reenfileirados (espécie inexistente ou job rodando agora): %s", strings.Join(missing, ", "))
	}
	return nil
}

// curationReport imprime o relatório da última curadoria de cada espécie.
func curationReport() error {
	ctx := context.Background()
	repo, closeDB, err := openRepo(ctx)
	if err != nil {
		return err
	}
	defer closeDB()
	entries, err := repo.LatestCurationReports(ctx)
	if err != nil {
		return err
	}
	fmt.Print(ingest.FormatCurationReport(entries))
	return nil
}
```

Nos comandos, o log vai para a saída de erro (stderr): a saída padrão fica só com o relatório, para dar para redirecionar para um arquivo. O laço continua logando na saída padrão, como antes. Acrescente `"slices"` aos imports. Na doc do pacote, cite os dois comandos.

- [ ] **Step 5: README do catalog**

Na seção do worker do `README.md` do catalog, acrescente:

```markdown
### Curadoria de fotos

O job de fotos manda as candidatas ao `passarim-photo-curator` (gRPC, `CURATOR_ADDR`) e só publica uma ave sozinha como principal. Curador fora do ar adia o job sem gastar tentativa. Variáveis: `CURATOR_ADDR` (padrão `photo-curator:50061`), `PHOTO_JOB_TIMEOUT` (`6m`) e `LOW_CONFIDENCE`.

- `docker compose run --rm catalog-worker requeue [species-id...]` reenfileira as fotos (todas, sem argumento).
- `docker compose run --rm catalog-worker curation-report > relatorio.md` imprime a última curadoria de cada espécie, com as marcadas primeiro.
- A chave `photos:` no YAML escolhe a principal (`primary: { observation, photo }`) ou tira fotos (`exclude: [...]`).
```

Os comandos rodam a partir do `passarim-docs`, onde está o compose.

- [ ] **Step 6: Rodar tudo, commit e PR 8**

Run: `go build ./... && go tool sqlc diff && go test -race ./... && golangci-lint run && go run golang.org/x/vuln/cmd/govulncheck@v1.8.0 ./...`
Expected: tudo verde, exceto avisos preexistentes do govulncheck (ruling da Tarefa 6).

Confira também que o `TODO` de `photos.go` sumiu: `grep -rn "TODO" internal/usecase/ingest/` não acha mais o da curadoria.

```bash
git add internal/ cmd/ README.md
git commit -m "feat: comandos requeue e curation-report do worker"
git push -u origin feat/ingestao-curada
gh pr create --base feat/inaturalist-candidatas --title "Ingestão de fotos com o curador" --body "..."
```

No corpo do PR, inclua:
- o fluxo dos passos 1 a 9;
- as decisões [DP] 1, 2, 5, 6 e 7;
- as variáveis novas;
- os comandos.

---

## Tarefa 12 — Curador no compose (`passarim-docs`, branch `feat/compose-curador`, PR 9)

**Files:**
- Modify: `docker-compose.yml`
- Modify: `env.scripts/back-end-init` (comentário do `--build`)
- Modify: `README.md` (seção "Operando o ambiente local" e tabela de serviços)

**Interfaces:**
- Consumes: a imagem do curador (`passarim-photo-curator/Dockerfile`, que já tem `HEALTHCHECK`, `MODELS_DIR=/opt/models` e `PORT=50061`) e o worker do PR 8.

- [ ] **Step 1: Compose**

```bash
cd ~/dev/passarim/passarim-docs && git checkout main && git pull && git checkout -b feat/compose-curador
```

Em `docker-compose.yml`, antes do `catalog-worker`:

```yaml
  # Curador de fotos (frente A): serviço em Python que diz o que cada foto
  # mostra (ave sozinha, bando, ninho...). Só o worker fala com ele, pela
  # rede passarim-curation, que é "internal": sem saída para a internet. Os
  # pesos dos modelos já estão dentro da imagem, então ele nunca baixa nada.
  # A primeira construção da imagem demora (cerca de 2 GB) e ele usa cerca de
  # 2 GB de memória quando os modelos carregam.
  # O health check vem do Dockerfile (python -m photo_curator.healthcheck):
  # o worker só sobe depois de ele responder.
  photo-curator:
    build: ../passarim-photo-curator
    image: passarim-photo-curator:dev
    networks: [passarim-curation]
    read_only: true
    tmpfs: [/tmp]   # HOME=/tmp: o torch grava cache aqui
```

No `catalog-worker`:
- `environment` ganha `CURATOR_ADDR: photo-curator:50061`;
- `depends_on` ganha:

```yaml
      photo-curator:
        condition: service_healthy   # sem o curador de pé, os jobs de fotos só seriam adiados
```

- `networks: [passarim-private, passarim-curation]`;
- o comentário e o valor do `stop_grace_period` viram:

```yaml
    # O worker termina a rodada em andamento antes de sair: até 2 min mais o
    # prazo do job de fotos (6 min). Sem isto, o Docker o mata após 10 s e o
    # job fica 'running' até voltar à fila (15 min).
    stop_grace_period: 8m30s
```

Atualize também o comentário do `catalog-worker` com a ligação ao curador.

Em `networks:`:

```yaml
  # Rede exclusiva entre o worker e o curador. "internal: true" tira a saída
  # para a internet: o curador não chama nada de fora, e um bug nele não vira
  # acesso à rede.
  passarim-curation:
    name: passarim-curation
    internal: true
```

- [ ] **Step 2: Subir e conferir**

Para o worker do PR 8 entrar na imagem, o catalog local precisa estar no branch `feat/ingestao-curada`, ou na `main` com o PR 8 já mergeado.

Run:

```bash
cd ~/dev/passarim/passarim-catalog && git checkout feat/ingestao-curada && cd -
docker compose config --quiet && env.scripts/back-end-init --build
env.scripts/back-end-status
docker compose run --rm --entrypoint sh photo-curator -c 'python -c "import urllib.request; urllib.request.urlopen(\"https://example.org\", timeout=5)"'; echo "saída: $?"
docker compose logs catalog-worker --since 5m | grep -i -E "rodada|curador" | tail -5
```

Expected:
- o `back-end-status` mostra `photo-curator running (healthy)` e sai 0;
- o teste de internet do curador **falha** (saída diferente de 0), porque a rede é `internal`;
- os logs mostram rodadas sem `curador indisponível`.

O primeiro build do curador baixa os pesos e demora vários minutos. Rode o `back-end-init` com `run_in_background` se passar do limite do terminal.

- [ ] **Step 3: README e script**

Em `env.scripts/back-end-init`, o comentário do `--build` passa a citar o curador. Por exemplo: "reconstrói as imagens do catalog, do worker, do curador e do BFF a partir dos repos vizinhos".

No `README.md` do docs:
- a tabela ou lista de serviços ganha `photo-curator` (gRPC 50061, só na rede `passarim-curation`);
- a seção "Operando o ambiente local" ganha um parágrafo:

```markdown
**Curador de fotos.** O `photo-curator` sobe junto com o back-end. A primeira construção baixa os pesos dos modelos (a imagem tem cerca de 2 GB) e ele usa perto de 2 GB de memória: no Docker Desktop, deixe pelo menos 6 GB para os containers. Para reprocessar as fotos: `docker compose run --rm catalog-worker requeue [species-id...]`; para conferir o resultado: `docker compose run --rm catalog-worker curation-report > relatorio.md`.
```

- [ ] **Step 4: Commit e PR**

```bash
git add docker-compose.yml env.scripts/back-end-init README.md
git commit -m "feat: curador de fotos no compose, numa rede interna só com o worker"
git push -u origin feat/compose-curador
gh pr create --title "Curador de fotos no compose" --body "..."
```

No corpo do PR, diga que ele depende do PR 8 do catalog.

---

## Tarefa 13 — Reingestão e conferência das 41 espécies (PR 10, conteúdo)

**Files:**
- Modify: `passarim-catalog/content/species/*.yaml`, só as espécies que precisarem de `photos:`
- Create: `passarim-docs/docs/curadoria/2026-10-27-relatorio.md` (o relatório final, versionado como registro)

**Pré-requisito:** os PRs 6, 7, 8 e 9 mergeados (ou o ambiente local nos branches deles). **Ponto de parada:** a conferência é do dono.

- [ ] **Step 1: Reingerir tudo**

```bash
cd ~/dev/passarim/passarim-docs && env.scripts/status
docker compose run --rm catalog-worker requeue
```

Expected: `41 jobs de fotos reenfileirados`.

Com um job de fotos por rodada, a reingestão leva por volta de 1 h. Acompanhe:

```bash
docker compose exec postgres psql -U passarim -d passarim -c \
  "SELECT status, count(*) FROM ingestion_job WHERE source = 'inaturalist' GROUP BY status"
```

Espere até não sobrar `pending` nem `running`. Use o Monitor com uma condição de parada, não `sleep`.

- [ ] **Step 2: Relatório**

```bash
docker compose run --rm catalog-worker curation-report > docs/curadoria/2026-10-27-relatorio.md
head -20 docs/curadoria/2026-10-27-relatorio.md
```

Expected: `41 espécies, N marcadas.`

Confira no relatório a andorinha (`pygochelidon-cyanoleuca`) e o anu-preto (`crotophaga-ani`): a principal tem que ser uma ave sozinha.

- [ ] **Step 3: Conferência visual**

```bash
env.scripts/front-end-init
```

No emulador, abra a andorinha-pequena-de-casa e o anu-preto e faça uma captura de tela de cada um. Depois, para o dono conferir as 41, publique o relatório como página: um Artifact com a foto principal de cada espécie em grade, montado a partir do relatório e das URLs `medium` do BFF. Siga a skill `artifact-design`.

- [ ] **Step 4: PARAR e pedir a conferência do dono**

Mande ao dono:
- o link da página;
- as capturas;
- a lista das espécies marcadas.

Pergunte quais precisam de override. **Não escolha fotos pelo dono.**

- [ ] **Step 5: Overrides que o dono pedir**

Para cada espécie indicada, acrescente ao YAML:

```yaml
# Escolha manual da foto (frente A): <motivo que o dono deu>.
photos:
  primary: { observation: <id da observação>, photo: <id da foto> }
```

Ou acrescente `exclude: [...]`. Depois aplique só nelas:

```bash
cd ~/dev/passarim/passarim-docs
docker compose up -d --build catalog-seed   # o seed relê os YAML
docker compose run --rm catalog-worker requeue <species-id> [<species-id>...]
```

Espere os jobs, gere o relatório de novo e confira que as espécies com override não têm `override_failed`.

- [ ] **Step 6: PRs de conteúdo**

```bash
cd ~/dev/passarim/passarim-catalog && git checkout main && git pull && git checkout -b content/reingestao-curada
git add content/species/ && git commit -m "content: overrides de foto conferidos pelo dono após a curadoria"
git push -u origin content/reingestao-curada && gh pr create --title "Overrides de foto após a curadoria" --body "..."
cd ~/dev/passarim/passarim-docs && git checkout -b docs/relatorio-curadoria
git add docs/curadoria/ && git commit -m "docs: relatório da curadoria das 41 espécies"
git push -u origin docs/relatorio-curadoria && gh pr create --title "Relatório da curadoria das 41 espécies" --body "..."
```

Se nenhum override for necessário, o PR do catalog não existe; diga isso no PR do docs.

O critério final da spec é "nas 41 espécies, a foto principal é uma ave sozinha, conferida à mão". Ele só se cumpre com o "ok" do dono no Step 4 ou no Step 5.
