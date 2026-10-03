# Passarim — Etapa 2b: Worker de ingestão (fotos, cantos e ocorrências) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o worker do `passarim-catalog`. Ele busca, para cada espécie do catálogo, **fotos** (iNaturalist), **o canto** (xeno-canto) e **avistamentos agrupados** (GBIF), processa a mídia (WebP/AAC), guarda no object storage (SeaweedFS/R2) e grava chaves e créditos no PostgreSQL, com fila de jobs, tentativas e proteção contra SSRF.

**Architecture:** Mesmo repositório e mesma arquitetura limpa do catalog. Regras puras em `domain` (licenças, agrupamento de pontos, backoff). Casos de uso em `usecase/ingest`, com interfaces (ports) para fontes, downloader, processador de mídia, storage, fila e repositório de mídia. Adapters: clientes HTTP das três fontes (testados com *golden files*), downloader seguro, ffmpeg, S3 (minio-go) e PostgreSQL (fila com `FOR UPDATE SKIP LOCKED`). O binário `cmd/worker` roda em loop. A imagem do worker é Alpine + ffmpeg (não distroless — ADR-0014).

**Tech Stack:** Go 1.27, pgx/sqlc, golang.org/x/time/rate, minio-go v7, ffmpeg (CLI), testcontainers (postgres + seaweedfs), Prometheus client.

**Spec:** `docs/superpowers/specs/2026-10-01-passarim-design.md` (§4 fontes/mídia/licenças, §7 resiliência do worker, §9 API7 SSRF e API10)

## Global Constraints

- Código **comentado em português para um estudante**; identificadores em inglês. Repositório: `~/dev/passarim/passarim-catalog` (main; commit e push autorizados).
- Dependências apontam para dentro: `domain` puro; `usecase/ingest` importa só `domain`; adapters implementam as interfaces de `usecase/ingest`.
- **Licenças aceitas:** CC0, CC-BY, CC-BY-SA, CC-BY-NC, CC-BY-NC-SA. **ND é sempre recusada.** Filtro NC configurável (`ALLOW_NC`, padrão `true`).
- **Crédito obrigatório** em toda mídia: autor, licença, fonte, link original.
- **Mídia:** fotos em WebP com 3 variantes — `thumb` 320 px, `medium` 800 px e `large` 1600 px de largura (sem ampliar). Até **5 fotos** por espécie. Canto em AAC mono 96 kbps, **no máximo 30 s**, 1 por espécie. Chaves: `species/<id>/photo-<idDaFotoNaFonte>-<variant>.webp` e `species/<id>/audio-<idDaGravaçãoNaFonte>.aac` (alterado depois da revisão final: a chave leva o id de origem, não a posição, e os objetos órfãos são apagados após o banco ser atualizado).
- **Ocorrências:** só Brasil, coordenadas sem problemas geoespaciais, até 900 pontos (3 páginas de 300), agrupados em grade de **1,0°**.
- **SSRF (OWASP API7):** downloads só via HTTPS, para hosts de uma allowlist. IPs privados, loopback e link-local são bloqueados (também depois de redirecionamentos). Limite de bytes por tipo e `Content-Type` permitido.
- **API10:** imagens acima de **40 megapixels** são recusadas antes de decodificar; respostas externas são validadas.
- **Rate limit por fonte:** iNaturalist 1 req/s, xeno-canto 1 req/s, GBIF 2 req/s. `User-Agent` identificando o projeto.
- **Fila:** `ingestion_job` por (espécie, fonte), até **5 tentativas** com backoff exponencial (1 min × 2^tentativa, teto de 6 h). Uma fonte que falha não bloqueia as outras. Jobs concluídos são refeitos depois de **30 dias**.
- **Segredo:** `XENO_CANTO_API_KEY` só no servidor (variável de ambiente). Nunca vai para log, git ou mensagem de erro.
- O worker **nunca** altera campos curados (`species`, `species_fact`, `species_biome`, `species_state`); só `media`, `occurrence_cluster` e `ingestion_job`.
- Fora deste plano: importar a lista completa do CBRO e descrições da Wikipedia para aves não curadas (backlog), CDN e R2 (Etapa 4) e montagem de URLs (BFF, Etapa 3).

## Review Focus

1. **SSRF por redirecionamento:** um host permitido que redireciona para `169.254.169.254` ou `127.0.0.1` deve ser bloqueado → Task 3 (`TestDownloader_BlocksPrivateIPAfterRedirect`).
2. **Licença ND ou "todos os direitos reservados"** vinda da fonte deve ser descartada, nunca baixada → Task 1 (`TestParseLicense`) e Task 7 (`TestIngestPhotos_SkipsRejectedLicenses`).
3. **"Bomba de descompressão":** uma imagem pequena em bytes mas com 20000×20000 px deve ser recusada antes do ffmpeg → Task 4 (`TestImageProcessor_RejectsHugeDimensions`).
4. **Reprocessar não duplica mídia:** rodar o job duas vezes deixa exatamente as mesmas linhas → Task 2 (`TestMediaRepository_ReplaceIsIdempotent`).
5. **Dois workers ao mesmo tempo** não podem pegar o mesmo job → Task 2 (`TestJobQueue_ClaimDueSkipsLockedJobs`).
6. **Worker morre no meio de um job** → o job volta para a fila depois de 15 min → Task 2 (`TestJobQueue`, trecho "job preso").
7. **Fonte sem resultado** (ave sem canto no xeno-canto) conclui o job sem erro e sem apagar mídia de outra fonte → Task 7 (`TestIngestAudio_NoRecordingsIsNotAnError`).

---

## Estrutura de arquivos (novos, em `passarim-catalog`)

```
cmd/worker/main.go                          loop do worker, métricas, shutdown
internal/config/worker.go (+_test)          config do worker (env)
internal/domain/
  license.go (+_test)                       ParseLicense, LicensePolicy
  cluster.go (+_test)                       ClusterPoints
  backoff.go (+_test)                       NextAttemptDelay
internal/usecase/ingest/
  ports.go                                  interfaces e tipos
  photos.go / audio.go / occurrences.go     um caso de uso por fonte
  runner.go                                 Runner.RunOnce (fila → caso de uso)
  fakes_test.go, *_test.go
internal/adapter/
  safehttp/downloader.go (+_test)           downloader anti-SSRF
  media/ffmpeg.go (+_test)                  WebP e AAC via ffmpeg
  s3store/store.go (+_test)                 minio-go
  sources/inaturalist/{client.go,client_test.go,testdata/}
  sources/xenocanto/{client.go,client_test.go,testdata/}
  sources/gbif/{client.go,client_test.go,testdata/}
  postgres/
    migrations/0003_ingestion_job.{up,down}.sql
    queries_ingest.sql                      (sqlc lê todos os .sql da pasta)
    ingest_repository.go (+_test)           JobQueue + MediaRepository
Dockerfile.worker
```

`sqlc.yaml` muda `queries:` de `internal/adapter/postgres/queries.sql` para a pasta `internal/adapter/postgres/` (só os `.sql` de queries; as migrations estão em `migrations/`). Se o sqlc reclamar de ler as migrations como queries, use uma lista: `queries: [internal/adapter/postgres/queries.sql, internal/adapter/postgres/queries_ingest.sql]`.

---

### Task 1: Regras puras — licenças, agrupamento e backoff

**Files:** `internal/domain/license.go`, `cluster.go`, `backoff.go` e seus `_test.go`

**Interfaces (Produces):**
- `type License string`; consts `LicenseCC0="CC0"`, `LicenseCCBY="CC-BY"`, `LicenseCCBYSA="CC-BY-SA"`, `LicenseCCBYNC="CC-BY-NC"`, `LicenseCCBYNCSA="CC-BY-NC-SA"`
- `ParseLicense(s string) (License, error)` — aceita códigos (`cc-by-nc`, `CC BY-NC`) e URLs (`https://creativecommons.org/licenses/by-nc-sa/4.0/`, `.../publicdomain/zero/1.0/`). ND, vazio ou desconhecido → `ErrLicenseNotAccepted`.
- `var ErrLicenseNotAccepted = errors.New("licença não aceita")`
- `type LicensePolicy struct{ AllowNC bool }`; `(LicensePolicy) Accepts(License) bool`
- `type Point struct{ Lat, Lng float64 }`; `ClusterPoints(points []Point, cellDeg float64) []OccurrenceCluster` — centróide por célula, `Count` = pontos na célula, `Precision = cellDeg`, ordenado por `Count` desc e depois por (Lat, Lng).
- `NextAttemptDelay(attempt int) time.Duration` — `1min × 2^attempt`, teto de 6 h (attempt começa em 0).

- [ ] **Step 1: Testes que falham**

`license_test.go`:

```go
package domain_test

import (
	"errors"
	"testing"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

func TestParseLicense(t *testing.T) {
	ok := map[string]domain.License{
		"cc0":       domain.LicenseCC0,
		"cc-by":     domain.LicenseCCBY,
		"CC BY-SA":  domain.LicenseCCBYSA,
		"cc-by-nc":  domain.LicenseCCBYNC,
		"cc-by-nc-sa": domain.LicenseCCBYNCSA,
		"https://creativecommons.org/licenses/by-nc-sa/4.0/":     domain.LicenseCCBYNCSA,
		"//creativecommons.org/licenses/by/4.0/":                 domain.LicenseCCBY,
		"https://creativecommons.org/publicdomain/zero/1.0/":     domain.LicenseCC0,
	}
	for in, want := range ok {
		got, err := domain.ParseLicense(in)
		if err != nil || got != want {
			t.Errorf("ParseLicense(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	// Review Focus #2: ND (sem obras derivadas), vazio ("todos os direitos
	// reservados") e lixo são recusados.
	for _, in := range []string{"cc-by-nd", "cc-by-nc-nd", "https://creativecommons.org/licenses/by-nc-nd/4.0/", "", "all rights reserved", "gpl"} {
		if _, err := domain.ParseLicense(in); !errors.Is(err, domain.ErrLicenseNotAccepted) {
			t.Errorf("ParseLicense(%q) deveria recusar, veio %v", in, err)
		}
	}
}

func TestLicensePolicy(t *testing.T) {
	strict := domain.LicensePolicy{AllowNC: false}
	if strict.Accepts(domain.LicenseCCBYNC) || !strict.Accepts(domain.LicenseCCBY) {
		t.Fatal("sem NC: deveria recusar CC-BY-NC e aceitar CC-BY")
	}
	if !(domain.LicensePolicy{AllowNC: true}).Accepts(domain.LicenseCCBYNCSA) {
		t.Fatal("com NC: deveria aceitar CC-BY-NC-SA")
	}
}
```

`cluster_test.go`:

```go
package domain_test

import (
	"testing"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

func TestClusterPoints(t *testing.T) {
	pts := []domain.Point{
		{Lat: -23.5, Lng: -46.6}, {Lat: -23.7, Lng: -46.2}, {Lat: -23.1, Lng: -46.9}, // mesma célula (SP)
		{Lat: -22.9, Lng: -43.2}, // outra célula (RJ)
	}
	got := domain.ClusterPoints(pts, 1.0)
	if len(got) != 2 {
		t.Fatalf("esperava 2 clusters, veio %d: %+v", len(got), got)
	}
	sp := got[0] // o maior vem primeiro
	if sp.Count != 3 || sp.Precision != 1.0 {
		t.Fatalf("cluster SP = %+v", sp)
	}
	// Centróide = média dos pontos da célula.
	if d := sp.Lat - (-23.5 - 23.7 - 23.1) / 3; d > 1e-9 || d < -1e-9 {
		t.Fatalf("lat do centróide = %v", sp.Lat)
	}
	if got[1].Count != 1 {
		t.Fatalf("cluster RJ = %+v", got[1])
	}
}

func TestClusterPoints_Empty(t *testing.T) {
	if got := domain.ClusterPoints(nil, 1.0); len(got) != 0 {
		t.Fatalf("sem pontos deveria dar lista vazia, veio %v", got)
	}
}

func TestClusterPoints_NegativeCoordinatesUseFloor(t *testing.T) {
	// -0.5 e +0.5 estão em células DIFERENTES (floor(-0.5) = -1, floor(0.5) = 0).
	got := domain.ClusterPoints([]domain.Point{{Lat: -0.5, Lng: 0}, {Lat: 0.5, Lng: 0}}, 1.0)
	if len(got) != 2 {
		t.Fatalf("pontos dos dois lados do equador caíram juntos: %+v", got)
	}
}
```

`backoff_test.go`:

```go
package domain_test

import (
	"testing"
	"time"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

func TestNextAttemptDelay(t *testing.T) {
	cases := map[int]time.Duration{0: time.Minute, 1: 2 * time.Minute, 3: 8 * time.Minute, 20: 6 * time.Hour, 100: 6 * time.Hour}
	for attempt, want := range cases {
		if got := domain.NextAttemptDelay(attempt); got != want {
			t.Errorf("NextAttemptDelay(%d) = %v, want %v", attempt, got, want)
		}
	}
}
```

- [ ] **Step 2: Ver falhar** — `go test ./internal/domain/` → FAIL (símbolos indefinidos).

- [ ] **Step 3: Implementar**

`license.go`:

```go
package domain

import (
	"errors"
	"strings"
)

// License é uma licença Creative Commons ACEITA pelo Passarim (ADR-0007).
type License string

const (
	LicenseCC0      License = "CC0"
	LicenseCCBY     License = "CC-BY"
	LicenseCCBYSA   License = "CC-BY-SA"
	LicenseCCBYNC   License = "CC-BY-NC"
	LicenseCCBYNCSA License = "CC-BY-NC-SA"
)

// ErrLicenseNotAccepted: a mídia não pode ser usada. ND ("sem obras
// derivadas") é recusada porque redimensionamos fotos e cortamos áudios.
var ErrLicenseNotAccepted = errors.New("licença não aceita")

// ParseLicense entende os formatos que as fontes usam:
// códigos ("cc-by-nc", "CC BY-NC") e URLs da Creative Commons.
func ParseLicense(s string) (License, error) {
	v := strings.ToLower(strings.TrimSpace(s))
	if strings.Contains(v, "creativecommons.org") {
		if strings.Contains(v, "/publicdomain/zero/") {
			return LicenseCC0, nil
		}
		// ".../licenses/by-nc-sa/4.0/" → "by-nc-sa"
		if i := strings.Index(v, "/licenses/"); i >= 0 {
			v = strings.SplitN(v[i+len("/licenses/"):], "/", 2)[0]
		}
	}
	v = strings.ReplaceAll(v, " ", "-")
	v = strings.TrimPrefix(v, "cc-")
	switch v {
	case "cc0", "zero":
		return LicenseCC0, nil
	case "by":
		return LicenseCCBY, nil
	case "by-sa":
		return LicenseCCBYSA, nil
	case "by-nc":
		return LicenseCCBYNC, nil
	case "by-nc-sa":
		return LicenseCCBYNCSA, nil
	}
	return "", ErrLicenseNotAccepted
}

// LicensePolicy decide o que este app pode usar. Gratuito e sem anúncios:
// NC permitido. Se o app um dia for monetizado, basta AllowNC=false.
type LicensePolicy struct {
	AllowNC bool
}

func (p LicensePolicy) Accepts(l License) bool {
	switch l {
	case LicenseCC0, LicenseCCBY, LicenseCCBYSA:
		return true
	case LicenseCCBYNC, LicenseCCBYNCSA:
		return p.AllowNC
	}
	return false
}
```

`cluster.go`:

```go
package domain

import (
	"math"
	"sort"
)

// Point é um avistamento (latitude/longitude em graus).
type Point struct {
	Lat, Lng float64
}

// ClusterPoints agrupa pontos numa grade de cellDeg graus. Cada célula vira
// UM ponto (a média das coordenadas) com a contagem. Assim o app desenha
// dezenas de círculos em vez de milhares de marcadores.
func ClusterPoints(points []Point, cellDeg float64) []OccurrenceCluster {
	type acc struct {
		sumLat, sumLng float64
		n              int
	}
	cells := map[[2]int]*acc{}
	for _, p := range points {
		// math.Floor (e não int()) para números negativos: int(-0.5) = 0,
		// mas -0.5 pertence à célula -1.
		key := [2]int{int(math.Floor(p.Lat / cellDeg)), int(math.Floor(p.Lng / cellDeg))}
		a := cells[key]
		if a == nil {
			a = &acc{}
			cells[key] = a
		}
		a.sumLat += p.Lat
		a.sumLng += p.Lng
		a.n++
	}
	out := make([]OccurrenceCluster, 0, len(cells))
	for _, a := range cells {
		out = append(out, OccurrenceCluster{Lat: a.sumLat / float64(a.n), Lng: a.sumLng / float64(a.n), Count: a.n, Precision: cellDeg})
	}
	// Ordem determinística (mapas em Go não têm ordem).
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count != out[j].Count {
			return out[i].Count > out[j].Count
		}
		if out[i].Lat != out[j].Lat {
			return out[i].Lat < out[j].Lat
		}
		return out[i].Lng < out[j].Lng
	})
	return out
}
```

`backoff.go`:

```go
package domain

import "time"

const maxAttemptDelay = 6 * time.Hour

// NextAttemptDelay implementa "backoff exponencial": cada falha dobra a
// espera (1, 2, 4, 8 min...). Assim não martelamos uma fonte que está fora
// do ar. O teto evita esperas absurdas.
func NextAttemptDelay(attempt int) time.Duration {
	if attempt >= 9 { // 2^9 min > 6 h: evita overflow em números grandes
		return maxAttemptDelay
	}
	d := time.Minute << attempt
	if d > maxAttemptDelay {
		return maxAttemptDelay
	}
	return d
}
```

- [ ] **Step 4: Ver passar** — `go test ./internal/domain/` → ok.
- [ ] **Step 5: Commit** — `git commit -m "feat: regras de licença, agrupamento de ocorrências e backoff"`

---

### Task 2: PostgreSQL — fila de jobs e repositório de mídia

**Files:**
- Create: `migrations/0003_ingestion_job.up.sql` / `.down.sql`, `queries_ingest.sql`, `ingest_repository.go`, `ingest_repository_test.go`
- Modify: `sqlc.yaml` (incluir `queries_ingest.sql`); regenerar `sqlcgen/`

**Interfaces (Produces, pacote `postgres`; os tipos de `ingest` vêm da Task 7, mas são definidos AQUI em `usecase/ingest/ports.go` para que esta task compile — crie esse arquivo agora com o conteúdo do Step 1):**
- `NewIngestRepository(pool *pgxpool.Pool) *IngestRepository`, que implementa `ingest.JobQueue` e `ingest.MediaRepository`.

- [ ] **Step 1: Criar `internal/usecase/ingest/ports.go`** (contrato compartilhado pelas Tasks 2 a 8)

```go
// Package ingest contém os casos de uso do worker de ingestão: buscar
// mídia e avistamentos em fontes externas e gravar no nosso catálogo.
// Como no resto do projeto, aqui só há regras e interfaces ("ports");
// HTTP, ffmpeg, S3 e SQL ficam nos adapters.
package ingest

import (
	"context"
	"time"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

// Source identifica de onde vem cada tipo de dado.
type Source string

const (
	SourceINaturalist Source = "inaturalist" // fotos
	SourceXenoCanto   Source = "xenocanto"   // cantos
	SourceGBIF        Source = "gbif"        // avistamentos
)

// AllSources na ordem em que os jobs são criados.
var AllSources = []Source{SourceINaturalist, SourceXenoCanto, SourceGBIF}

// Job é uma tarefa "buscar <fonte> para <espécie>".
type Job struct {
	ID             int64
	SpeciesID      string
	ScientificName string
	Source         Source
	Attempts       int
}

// JobQueue é a fila persistente (tabela ingestion_job).
type JobQueue interface {
	// EnqueueMissing cria jobs que ainda não existem (espécie × fonte) e
	// reagenda jobs concluídos há mais de refreshAfter. Devolve quantos ficaram pendentes.
	EnqueueMissing(ctx context.Context, sources []Source, refreshAfter time.Duration) (int, error)
	// ClaimDue pega até limit jobs vencidos e os marca como "running",
	// sem que outro worker pegue os mesmos.
	ClaimDue(ctx context.Context, limit int) ([]Job, error)
	Complete(ctx context.Context, jobID int64) error
	// Fail registra o erro. Se attempts chegou ao máximo, status = failed;
	// senão volta para pending com next_run_at = agora + retryIn.
	Fail(ctx context.Context, jobID int64, cause string, retryIn time.Duration, giveUp bool) error
}

// MediaRepository grava o resultado da ingestão. "Replace" = apaga o que
// havia DAQUELE tipo para a espécie e grava o novo, numa transação.
// Assim reprocessar nunca duplica nada.
type MediaRepository interface {
	ReplacePhotos(ctx context.Context, speciesID string, photos []domain.Photo) error
	ReplaceAudio(ctx context.Context, speciesID string, audio *domain.Audio) error
	ReplaceClusters(ctx context.Context, speciesID string, clusters []domain.OccurrenceCluster) error
}

// PhotoCandidate é uma foto encontrada na fonte (ainda não baixada).
type PhotoCandidate struct {
	URL       string // URL do arquivo em tamanho grande
	PageURL   string // página da observação (crédito)
	License   string // como a fonte informa (ex.: "cc-by-nc")
	Author    string
	Width     int
	Height    int
}

// AudioCandidate é uma gravação encontrada na fonte.
type AudioCandidate struct {
	URL        string // download do arquivo
	PageURL    string
	License    string // URL da licença, como o xeno-canto informa
	Author     string
	Quality    string // "A" (melhor) a "E"
	Type       string // "song", "call"...
	DurationMs int
}

type PhotoSource interface {
	FindPhotos(ctx context.Context, scientificName string, max int) ([]PhotoCandidate, error)
}

type AudioSource interface {
	FindRecordings(ctx context.Context, scientificName string) ([]AudioCandidate, error)
}

type OccurrenceSource interface {
	FindOccurrences(ctx context.Context, scientificName string, max int) ([]domain.Point, error)
}

// Downloader baixa um arquivo de forma segura (anti-SSRF) e devolve os bytes e o Content-Type.
type Downloader interface {
	Fetch(ctx context.Context, url string, kind DownloadKind) ([]byte, string, error)
}

// DownloadKind define limites diferentes para imagem e áudio.
type DownloadKind int

const (
	DownloadImage DownloadKind = iota
	DownloadAudio
)

// PhotoVariants são as três versões WebP de uma foto.
type PhotoVariants struct {
	Thumb, Medium, Large []byte
	Width, Height        int // dimensões da versão Large
}

type ImageProcessor interface {
	Process(ctx context.Context, original []byte) (PhotoVariants, error)
}

type AudioProcessor interface {
	// ToAAC converte para AAC mono e corta em maxDuration.
	ToAAC(ctx context.Context, original []byte, maxDuration time.Duration) ([]byte, error)
}

// MediaStore é o object storage (SeaweedFS local / R2 em produção).
type MediaStore interface {
	Put(ctx context.Context, key, contentType string, data []byte) error
}
```

> O crédito completo (autor, licença, fonte, link) de cada foto vai em `domain.Photo.Credit` e é gravado nas colunas `author`/`license`/`source`/`source_url` da tabela `media`.

- [ ] **Step 2: Migration** — `0003_ingestion_job.up.sql`

```sql
-- 0003: fila de ingestão. Cada linha = "buscar <fonte> para <espécie>".
CREATE TABLE ingestion_job (
    id          bigserial PRIMARY KEY,
    species_id  text NOT NULL REFERENCES species (id) ON DELETE CASCADE,
    source      text NOT NULL CHECK (source IN ('inaturalist', 'xenocanto', 'gbif')),
    status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
    attempts    integer NOT NULL DEFAULT 0,
    next_run_at timestamptz NOT NULL DEFAULT now(),
    last_error  text NOT NULL DEFAULT '',
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (species_id, source)   -- no máximo um job por espécie e fonte
);
-- Índice para a pergunta mais frequente: "quais jobs estão vencidos?".
CREATE INDEX ingestion_job_due_idx ON ingestion_job (status, next_run_at);
```

`.down.sql`: `DROP TABLE IF EXISTS ingestion_job;`

- [ ] **Step 3: Queries** — `queries_ingest.sql`

```sql
-- name: EnqueueMissingJobs :exec
-- Cria (espécie × fonte) que ainda não existe. ON CONFLICT DO NOTHING
-- torna a operação idempotente.
INSERT INTO ingestion_job (species_id, source)
SELECT s.id, src FROM species s CROSS JOIN unnest(sqlc.arg('sources')::text[]) AS src
ON CONFLICT (species_id, source) DO NOTHING;

-- name: RescheduleStaleJobs :exec
-- Dados mudam (novas fotos, novos avistamentos): refaz jobs antigos.
UPDATE ingestion_job SET status = 'pending', attempts = 0, next_run_at = now(), updated_at = now()
WHERE status = 'done' AND updated_at < now() - make_interval(secs => sqlc.arg('refresh_after_secs')::double precision);

-- name: RequeueStuckJobs :exec
-- Se o worker morrer no meio de um job, ele fica "running" para sempre.
-- Depois de 15 min sem atualização, devolvemos o job para a fila.
UPDATE ingestion_job SET status = 'pending', updated_at = now()
WHERE status = 'running' AND updated_at < now() - interval '15 minutes';

-- name: CountPendingJobs :one
SELECT count(*)::int FROM ingestion_job WHERE status = 'pending';

-- name: ClaimDueJobs :many
-- FOR UPDATE SKIP LOCKED: se outro worker já travou uma linha nesta
-- transação, pulamos ela em vez de esperar. É o padrão clássico de
-- "fila no PostgreSQL" sem dois workers pegarem o mesmo job.
UPDATE ingestion_job j SET status = 'running', updated_at = now()
FROM species s
WHERE j.species_id = s.id AND j.id IN (
    SELECT id FROM ingestion_job
    WHERE status = 'pending' AND next_run_at <= now()
    ORDER BY next_run_at
    LIMIT sqlc.arg('lim')
    FOR UPDATE SKIP LOCKED)
RETURNING j.id, j.species_id, s.scientific_name, j.source, j.attempts;

-- name: CompleteJob :exec
UPDATE ingestion_job SET status = 'done', last_error = '', updated_at = now() WHERE id = $1;

-- name: FailJob :exec
UPDATE ingestion_job SET
    status = CASE WHEN sqlc.arg('give_up')::bool THEN 'failed' ELSE 'pending' END,
    attempts = attempts + 1,
    last_error = sqlc.arg('last_error'),
    next_run_at = now() + make_interval(secs => sqlc.arg('retry_in_secs')::double precision),
    updated_at = now()
WHERE id = sqlc.arg('id');

-- name: DeleteMediaByKind :exec
DELETE FROM media WHERE species_id = $1 AND kind = $2;

-- name: InsertMedia :exec
INSERT INTO media (species_id, kind, position, thumb_key, medium_key, large_key, audio_key,
                   width, height, duration_ms, author, license, source, source_url)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14);

-- name: DeleteClusters :exec
DELETE FROM occurrence_cluster WHERE species_id = $1;

-- name: InsertCluster :exec
INSERT INTO occurrence_cluster (species_id, lat, lng, count, precision) VALUES ($1, $2, $3, $4, $5);
```

`sqlc.yaml`: `queries: [internal/adapter/postgres/queries.sql, internal/adapter/postgres/queries_ingest.sql]`, depois `go tool sqlc generate`. Ajuste o `repository.go` existente se algum nome gerado mudar (não deve mudar).

- [ ] **Step 4: Testes de integração que falham** — `ingest_repository_test.go` (reusa `newRepo`, `sp` e `seed` do `repository_test.go`)

```go
package postgres_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/velosobr/passarim-catalog/internal/adapter/postgres"
	"github.com/velosobr/passarim-catalog/internal/domain"
	"github.com/velosobr/passarim-catalog/internal/usecase/ingest"
)

func TestJobQueue(t *testing.T) {
	repo, pool := newRepo(t)
	ctx := context.Background()
	seed(t, repo,
		sp("Turdus rufiventris", "Sabiá-laranjeira", nil),
		sp("Pitangus sulphuratus", "Bem-te-vi", nil))
	q := postgres.NewIngestRepository(pool)

	n, err := q.EnqueueMissing(ctx, ingest.AllSources, 30*24*time.Hour)
	if err != nil || n != 6 {
		t.Fatalf("2 espécies × 3 fontes = 6 pendentes; veio %d, %v", n, err)
	}
	if n, _ := q.EnqueueMissing(ctx, ingest.AllSources, 30*24*time.Hour); n != 6 {
		t.Fatalf("enfileirar de novo não pode duplicar: %d", n)
	}

	jobs, err := q.ClaimDue(ctx, 4)
	if err != nil || len(jobs) != 4 || jobs[0].ScientificName == "" {
		t.Fatalf("claim: %v %+v", err, jobs)
	}
	if again, _ := q.ClaimDue(ctx, 10); len(again) != 2 {
		t.Fatalf("só 2 deveriam sobrar (os 4 estão running), veio %d", len(again))
	}

	if err := q.Fail(ctx, jobs[0].ID, "fonte fora do ar", time.Hour, false); err != nil {
		t.Fatal(err)
	}
	var status string
	var attempts int
	_ = pool.QueryRow(ctx, "SELECT status, attempts FROM ingestion_job WHERE id=$1", jobs[0].ID).Scan(&status, &attempts)
	if status != "pending" || attempts != 1 {
		t.Fatalf("depois de Fail: status=%s attempts=%d", status, attempts)
	}
	if due, _ := q.ClaimDue(ctx, 10); len(due) != 0 {
		t.Fatalf("job reagendado para daqui a 1h não pode estar vencido: %+v", due)
	}
	_ = q.Fail(ctx, jobs[1].ID, "x", time.Hour, true)
	_ = pool.QueryRow(ctx, "SELECT status FROM ingestion_job WHERE id=$1", jobs[1].ID).Scan(&status)
	if status != "failed" {
		t.Fatalf("giveUp deveria marcar failed, veio %s", status)
	}
	// Job "preso" em running há mais de 15 min volta para a fila.
	_, _ = pool.Exec(ctx, "UPDATE ingestion_job SET updated_at = now() - interval '1 hour' WHERE id=$1", jobs[3].ID)
	_, _ = q.EnqueueMissing(ctx, ingest.AllSources, 30*24*time.Hour)
	_ = pool.QueryRow(ctx, "SELECT status FROM ingestion_job WHERE id=$1", jobs[3].ID).Scan(&status)
	if status != "pending" {
		t.Fatalf("job preso deveria voltar para pending, veio %s", status)
	}
	_ = q.Complete(ctx, jobs[2].ID)
	_ = pool.QueryRow(ctx, "SELECT status FROM ingestion_job WHERE id=$1", jobs[2].ID).Scan(&status)
	if status != "done" {
		t.Fatalf("Complete: status=%s", status)
	}
}

// Review Focus #5
func TestJobQueue_ClaimDueSkipsLockedJobs(t *testing.T) {
	repo, pool := newRepo(t)
	ctx := context.Background()
	seed(t, repo, sp("Turdus rufiventris", "Sabiá-laranjeira", nil), sp("Pitangus sulphuratus", "Bem-te-vi", nil))
	q := postgres.NewIngestRepository(pool)
	_, _ = q.EnqueueMissing(ctx, ingest.AllSources, time.Hour)

	var mu sync.Mutex
	seen := map[int64]int{}
	var wg sync.WaitGroup
	for w := 0; w < 4; w++ { // 4 "workers" disputando os mesmos 6 jobs
		wg.Add(1)
		go func() {
			defer wg.Done()
			jobs, err := q.ClaimDue(ctx, 3)
			if err != nil {
				t.Error(err)
				return
			}
			mu.Lock()
			for _, j := range jobs {
				seen[j.ID]++
			}
			mu.Unlock()
		}()
	}
	wg.Wait()
	for id, n := range seen {
		if n > 1 {
			t.Fatalf("job %d foi pego %d vezes", id, n)
		}
	}
	if len(seen) != 6 {
		t.Fatalf("esperava os 6 jobs distribuídos, veio %d", len(seen))
	}
}

// Review Focus #4
func TestMediaRepository_ReplaceIsIdempotent(t *testing.T) {
	repo, pool := newRepo(t)
	ctx := context.Background()
	seed(t, repo, sp("Turdus rufiventris", "Sabiá-laranjeira", nil))
	m := postgres.NewIngestRepository(pool)
	credit := domain.Credit{Author: "A", License: "CC-BY", Source: "inaturalist", SourceURL: "https://www.inaturalist.org/observations/1"}
	photos := []domain.Photo{
		{ThumbKey: "t0", MediumKey: "m0", LargeKey: "l0", Width: 1600, Height: 1000, Credit: credit},
		{ThumbKey: "t1", MediumKey: "m1", LargeKey: "l1", Width: 1600, Height: 900, Credit: credit},
	}
	audio := &domain.Audio{Key: "a.aac", DurationMs: 30000, Credit: domain.Credit{Author: "B", License: "CC-BY-NC-SA", Source: "xeno-canto", SourceURL: "https://xeno-canto.org/1"}}
	clusters := []domain.OccurrenceCluster{{Lat: -23.5, Lng: -46.6, Count: 3, Precision: 1}}
	for i := 0; i < 2; i++ { // duas vezes = reprocessamento
		if err := m.ReplacePhotos(ctx, "turdus-rufiventris", photos); err != nil {
			t.Fatal(err)
		}
		if err := m.ReplaceAudio(ctx, "turdus-rufiventris", audio); err != nil {
			t.Fatal(err)
		}
		if err := m.ReplaceClusters(ctx, "turdus-rufiventris", clusters); err != nil {
			t.Fatal(err)
		}
	}
	s, _ := repo.GetSpecies(ctx, "turdus-rufiventris")
	if len(s.Photos) != 2 || s.Photos[1].LargeKey != "l1" || s.Audio == nil || s.Audio.Key != "a.aac" || len(s.Clusters) != 1 {
		t.Fatalf("depois de 2 replaces: photos=%d audio=%+v clusters=%d", len(s.Photos), s.Audio, len(s.Clusters))
	}
	// Trocar fotos não apaga o áudio (cada fonte cuida do seu tipo).
	_ = m.ReplacePhotos(ctx, "turdus-rufiventris", photos[:1])
	s, _ = repo.GetSpecies(ctx, "turdus-rufiventris")
	if len(s.Photos) != 1 || s.Audio == nil {
		t.Fatalf("replace de fotos afetou o áudio: %+v", s)
	}
	// Áudio nil = "não há canto": remove o anterior.
	_ = m.ReplaceAudio(ctx, "turdus-rufiventris", nil)
	s, _ = repo.GetSpecies(ctx, "turdus-rufiventris")
	if s.Audio != nil {
		t.Fatal("ReplaceAudio(nil) deveria remover o canto")
	}
}
```

Run: `go test ./internal/adapter/postgres/ -run 'JobQueue|MediaRepository'` → FAIL (`NewIngestRepository` indefinido).

- [ ] **Step 5: Implementar `ingest_repository.go`**

```go
package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velosobr/passarim-catalog/internal/adapter/postgres/sqlcgen"
	"github.com/velosobr/passarim-catalog/internal/domain"
	"github.com/velosobr/passarim-catalog/internal/usecase/ingest"
)

// IngestRepository implementa a fila de jobs e a gravação de mídia.
type IngestRepository struct {
	pool *pgxpool.Pool
	q    *sqlcgen.Queries
}

var (
	_ ingest.JobQueue        = (*IngestRepository)(nil)
	_ ingest.MediaRepository = (*IngestRepository)(nil)
)

func NewIngestRepository(pool *pgxpool.Pool) *IngestRepository {
	return &IngestRepository{pool: pool, q: sqlcgen.New(pool)}
}

func (r *IngestRepository) EnqueueMissing(ctx context.Context, sources []ingest.Source, refreshAfter time.Duration) (int, error) {
	names := make([]string, len(sources))
	for i, s := range sources {
		names[i] = string(s)
	}
	if err := r.q.EnqueueMissingJobs(ctx, names); err != nil {
		return 0, fmt.Errorf("enfileirar: %w", err)
	}
	if err := r.q.RescheduleStaleJobs(ctx, refreshAfter.Seconds()); err != nil {
		return 0, fmt.Errorf("reagendar: %w", err)
	}
	if err := r.q.RequeueStuckJobs(ctx); err != nil {
		return 0, fmt.Errorf("devolver jobs presos: %w", err)
	}
	n, err := r.q.CountPendingJobs(ctx)
	return int(n), err
}

func (r *IngestRepository) ClaimDue(ctx context.Context, limit int) ([]ingest.Job, error) {
	rows, err := r.q.ClaimDueJobs(ctx, toInt32(limit))
	if err != nil {
		return nil, err
	}
	jobs := make([]ingest.Job, len(rows))
	for i, row := range rows {
		jobs[i] = ingest.Job{ID: row.ID, SpeciesID: row.SpeciesID, ScientificName: row.ScientificName,
			Source: ingest.Source(row.Source), Attempts: int(row.Attempts)}
	}
	return jobs, nil
}

func (r *IngestRepository) Complete(ctx context.Context, jobID int64) error {
	return r.q.CompleteJob(ctx, jobID)
}

func (r *IngestRepository) Fail(ctx context.Context, jobID int64, cause string, retryIn time.Duration, giveUp bool) error {
	if len(cause) > 500 { // a mensagem vai para o banco: limitamos o tamanho
		cause = cause[:500]
	}
	return r.q.FailJob(ctx, sqlcgen.FailJobParams{ID: jobID, GiveUp: giveUp, LastError: cause, RetryInSecs: retryIn.Seconds()})
}

// replaceMedia apaga a mídia de um tipo e grava a nova, numa transação.
func (r *IngestRepository) replaceMedia(ctx context.Context, speciesID, kind string, rows []sqlcgen.InsertMediaParams) error {
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
	return tx.Commit(ctx)
}

func (r *IngestRepository) ReplacePhotos(ctx context.Context, speciesID string, photos []domain.Photo) error {
	rows := make([]sqlcgen.InsertMediaParams, len(photos))
	for i, p := range photos {
		rows[i] = sqlcgen.InsertMediaParams{SpeciesID: speciesID, Kind: "photo", Position: toInt32(i),
			ThumbKey: p.ThumbKey, MediumKey: p.MediumKey, LargeKey: p.LargeKey,
			Width: toInt32(p.Width), Height: toInt32(p.Height),
			Author: p.Credit.Author, License: p.Credit.License, Source: p.Credit.Source, SourceUrl: p.Credit.SourceURL}
	}
	return r.replaceMedia(ctx, speciesID, "photo", rows)
}

func (r *IngestRepository) ReplaceAudio(ctx context.Context, speciesID string, a *domain.Audio) error {
	var rows []sqlcgen.InsertMediaParams
	if a != nil {
		rows = append(rows, sqlcgen.InsertMediaParams{SpeciesID: speciesID, Kind: "audio", Position: 0,
			AudioKey: a.Key, DurationMs: toInt32(a.DurationMs),
			Author: a.Credit.Author, License: a.Credit.License, Source: a.Credit.Source, SourceUrl: a.Credit.SourceURL})
	}
	return r.replaceMedia(ctx, speciesID, "audio", rows)
}

func (r *IngestRepository) ReplaceClusters(ctx context.Context, speciesID string, clusters []domain.OccurrenceCluster) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // após Commit, Rollback não faz nada
	q := r.q.WithTx(tx)
	if err := q.DeleteClusters(ctx, speciesID); err != nil {
		return err
	}
	for _, c := range clusters {
		if err := q.InsertCluster(ctx, sqlcgen.InsertClusterParams{SpeciesID: speciesID, Lat: c.Lat, Lng: c.Lng,
			Count: toInt32(c.Count), Precision: c.Precision}); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
```

> `toInt32` já existe no pacote `postgres` (criado na Etapa 2a). Se os nomes gerados pelo sqlc diferirem (ex.: `ClaimDueJobsRow`, `Lim`), ajuste ao código gerado.

- [ ] **Step 6: Ver passar** — `go test -race ./internal/adapter/postgres/` → ok.
- [ ] **Step 7: Commit** — `git commit -m "feat: fila de ingestão (SKIP LOCKED) e repositório de mídia"`

---

### Task 3: Downloader seguro (anti-SSRF)

**Files:** `internal/adapter/safehttp/downloader.go`, `downloader_test.go`

**Interfaces (Produces):**
- `type Options struct { AllowedHosts []string; AllowPrivateIPs bool; Timeout time.Duration; MaxImageBytes, MaxAudioBytes int64; UserAgent string; Blocked func(reason string) }`
- `New(opts Options) *Downloader` — implementa `ingest.Downloader`
- `var ErrBlocked = errors.New("download bloqueado")`
- Content-Types permitidos: imagem `image/jpeg`, `image/png`; áudio `audio/mpeg`, `audio/wav`, `audio/x-wav`, `audio/wave`, `audio/mp3`.

- [ ] **Step 1: Testes que falham**

```go
package safehttp_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/velosobr/passarim-catalog/internal/adapter/safehttp"
	"github.com/velosobr/passarim-catalog/internal/usecase/ingest"
)

func host(t *testing.T, srv *httptest.Server) string {
	u, _ := url.Parse(srv.URL)
	return u.Hostname()
}

func imageServer() *httptest.Server {
	return httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		_, _ = w.Write([]byte("fake-jpeg-bytes"))
	}))
}

// newTestDownloader confia no certificado do servidor de teste.
func newTestDownloader(srv *httptest.Server, opts safehttp.Options) *safehttp.Downloader {
	opts.Timeout = 2 * time.Second
	if opts.MaxImageBytes == 0 {
		opts.MaxImageBytes = 1 << 20
	}
	return safehttp.NewWithTransport(opts, srv.Client().Transport.(*http.Transport).TLSClientConfig)
}

func TestDownloader_AllowsListedHostWhenPrivateAllowed(t *testing.T) {
	srv := imageServer()
	defer srv.Close()
	d := newTestDownloader(srv, safehttp.Options{AllowedHosts: []string{host(t, srv)}, AllowPrivateIPs: true})
	data, ct, err := d.Fetch(context.Background(), srv.URL+"/a.jpg", ingest.DownloadImage)
	if err != nil || string(data) != "fake-jpeg-bytes" || ct != "image/jpeg" {
		t.Fatalf("got %q %q %v", data, ct, err)
	}
}

func TestDownloader_BlocksHostNotInAllowlist(t *testing.T) {
	srv := imageServer()
	defer srv.Close()
	d := newTestDownloader(srv, safehttp.Options{AllowedHosts: []string{"inaturalist-open-data.s3.amazonaws.com"}, AllowPrivateIPs: true})
	_, _, err := d.Fetch(context.Background(), srv.URL+"/a.jpg", ingest.DownloadImage)
	if !errors.Is(err, safehttp.ErrBlocked) {
		t.Fatalf("host fora da allowlist deveria ser bloqueado, veio %v", err)
	}
}

func TestDownloader_BlocksPlainHTTP(t *testing.T) {
	d := safehttp.New(safehttp.Options{AllowedHosts: []string{"example.org"}})
	_, _, err := d.Fetch(context.Background(), "http://example.org/a.jpg", ingest.DownloadImage)
	if !errors.Is(err, safehttp.ErrBlocked) {
		t.Fatalf("http:// deveria ser bloqueado, veio %v", err)
	}
}

func TestDownloader_BlocksPrivateIP(t *testing.T) {
	srv := imageServer() // escuta em 127.0.0.1
	defer srv.Close()
	// Host na allowlist, mas o IP é loopback: deve bloquear mesmo assim.
	d := newTestDownloader(srv, safehttp.Options{AllowedHosts: []string{host(t, srv)}, AllowPrivateIPs: false})
	_, _, err := d.Fetch(context.Background(), srv.URL+"/a.jpg", ingest.DownloadImage)
	if !errors.Is(err, safehttp.ErrBlocked) {
		t.Fatalf("IP privado deveria ser bloqueado, veio %v", err)
	}
}

// Review Focus #1
func TestDownloader_BlocksPrivateIPAfterRedirect(t *testing.T) {
	var target *httptest.Server
	target = imageServer()
	defer target.Close()
	redirector := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "https://169.254.169.254/latest/meta-data", http.StatusFound)
	}))
	defer redirector.Close()
	d := newTestDownloader(redirector, safehttp.Options{AllowedHosts: []string{host(t, redirector), "169.254.169.254"}, AllowPrivateIPs: false})
	_, _, err := d.Fetch(context.Background(), redirector.URL+"/a.jpg", ingest.DownloadImage)
	if !errors.Is(err, safehttp.ErrBlocked) {
		t.Fatalf("redirecionamento para IP de metadados deveria ser bloqueado, veio %v", err)
	}
}

func TestDownloader_RejectsOversizedBody(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		_, _ = w.Write([]byte(strings.Repeat("x", 2048)))
	}))
	defer srv.Close()
	d := newTestDownloader(srv, safehttp.Options{AllowedHosts: []string{host(t, srv)}, AllowPrivateIPs: true, MaxImageBytes: 1024})
	if _, _, err := d.Fetch(context.Background(), srv.URL+"/a.jpg", ingest.DownloadImage); !errors.Is(err, safehttp.ErrBlocked) {
		t.Fatalf("corpo maior que o limite deveria ser recusado, veio %v", err)
	}
}

func TestDownloader_RejectsUnexpectedContentType(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte("<html>"))
	}))
	defer srv.Close()
	d := newTestDownloader(srv, safehttp.Options{AllowedHosts: []string{host(t, srv)}, AllowPrivateIPs: true})
	if _, _, err := d.Fetch(context.Background(), srv.URL+"/a.jpg", ingest.DownloadImage); !errors.Is(err, safehttp.ErrBlocked) {
		t.Fatalf("text/html não é imagem, veio %v", err)
	}
}

func TestDownloader_ReportsBlockedReason(t *testing.T) {
	var reasons []string
	d := safehttp.New(safehttp.Options{AllowedHosts: []string{"example.org"}, Blocked: func(r string) { reasons = append(reasons, r) }})
	_, _, _ = d.Fetch(context.Background(), "http://example.org/a.jpg", ingest.DownloadImage)
	if len(reasons) != 1 {
		t.Fatalf("Blocked deveria ser chamado uma vez (vira métrica de segurança), veio %v", reasons)
	}
}
```

- [ ] **Step 2: Ver falhar.**

- [ ] **Step 3: Implementar `downloader.go`**

```go
// Package safehttp baixa arquivos de fontes externas de forma segura.
//
// SSRF (Server-Side Request Forgery, OWASP API7): se o worker baixasse
// QUALQUER URL que uma API externa mandasse, um atacante poderia fazê-lo
// acessar endereços internos (o banco, o serviço de metadados da nuvem em
// 169.254.169.254...). Por isso:
//  1. só HTTPS;
//  2. só hosts de uma lista permitida (allowlist);
//  3. o IP é checado NA HORA DE CONECTAR (depois do DNS), então nem um DNS
//     "malicioso" nem um redirecionamento escapam;
//  4. limite de tamanho e de Content-Type.
package safehttp

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"strings"
	"syscall"
	"time"

	"github.com/velosobr/passarim-catalog/internal/usecase/ingest"
)

var ErrBlocked = errors.New("download bloqueado")

type Options struct {
	AllowedHosts    []string
	AllowPrivateIPs bool // SÓ para testes locais
	Timeout         time.Duration
	MaxImageBytes   int64
	MaxAudioBytes   int64
	UserAgent       string
	Blocked         func(reason string) // chamada a cada bloqueio (métrica)
}

type Downloader struct {
	opts    Options
	allowed map[string]bool
	client  *http.Client
}

var _ ingest.Downloader = (*Downloader)(nil)

var allowedTypes = map[ingest.DownloadKind]map[string]bool{
	ingest.DownloadImage: {"image/jpeg": true, "image/png": true},
	ingest.DownloadAudio: {"audio/mpeg": true, "audio/mp3": true, "audio/wav": true, "audio/x-wav": true, "audio/wave": true},
}

func New(opts Options) *Downloader { return NewWithTransport(opts, nil) }

// NewWithTransport permite injetar uma config TLS (usado nos testes para
// confiar no certificado do servidor de teste).
func NewWithTransport(opts Options, tlsConfig *tls.Config) *Downloader {
	if opts.Timeout == 0 {
		opts.Timeout = 30 * time.Second
	}
	if opts.MaxImageBytes == 0 {
		opts.MaxImageBytes = 15 << 20 // 15 MB
	}
	if opts.MaxAudioBytes == 0 {
		opts.MaxAudioBytes = 40 << 20 // 40 MB (WAV é grande)
	}
	d := &Downloader{opts: opts, allowed: map[string]bool{}}
	for _, h := range opts.AllowedHosts {
		d.allowed[strings.ToLower(h)] = true
	}
	dialer := &net.Dialer{Timeout: 10 * time.Second, Control: d.checkIP}
	d.client = &http.Client{
		Timeout: opts.Timeout,
		Transport: &http.Transport{
			DialContext:     dialer.DialContext,
			TLSClientConfig: tlsConfig,
			Proxy:           nil, // sem proxy: a checagem de IP precisa ver o destino real
		},
		// Cada redirecionamento passa pelas mesmas regras de URL.
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return d.block("redirecionamentos demais")
			}
			return d.checkURL(req.URL)
		},
	}
	return d
}

func (d *Downloader) block(reason string) error {
	if d.opts.Blocked != nil {
		d.opts.Blocked(reason)
	}
	return fmt.Errorf("%w: %s", ErrBlocked, reason)
}

func (d *Downloader) checkURL(u *url.URL) error {
	if u.Scheme != "https" {
		return d.block("esquema não é https")
	}
	if !d.allowed[strings.ToLower(u.Hostname())] {
		return d.block("host fora da allowlist: " + u.Hostname())
	}
	return nil
}

// checkIP roda DEPOIS da resolução de DNS, com o IP real da conexão.
func (d *Downloader) checkIP(_, address string, _ syscall.RawConn) error {
	if d.opts.AllowPrivateIPs {
		return nil
	}
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return d.block("endereço inválido")
	}
	ip := net.ParseIP(host)
	if ip == nil || ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsUnspecified() || ip.IsMulticast() {
		return d.block("IP não permitido: " + host)
	}
	return nil
}

func (d *Downloader) Fetch(ctx context.Context, rawURL string, kind ingest.DownloadKind) ([]byte, string, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, "", d.block("URL inválida")
	}
	if err := d.checkURL(u); err != nil {
		return nil, "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, "", err
	}
	if d.opts.UserAgent != "" {
		req.Header.Set("User-Agent", d.opts.UserAgent)
	}
	resp, err := d.client.Do(req)
	if err != nil {
		if errors.Is(err, ErrBlocked) {
			return nil, "", err
		}
		return nil, "", fmt.Errorf("baixar: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("baixar: status %d", resp.StatusCode)
	}
	ct, _, _ := mime.ParseMediaType(resp.Header.Get("Content-Type"))
	if !allowedTypes[kind][ct] {
		return nil, "", d.block("content-type não permitido: " + ct)
	}
	limit := d.opts.MaxImageBytes
	if kind == ingest.DownloadAudio {
		limit = d.opts.MaxAudioBytes
	}
	// Lemos no máximo limit+1 bytes: se vier mais, o arquivo é grande demais.
	data, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if err != nil {
		return nil, "", fmt.Errorf("ler corpo: %w", err)
	}
	if int64(len(data)) > limit {
		return nil, "", d.block("arquivo maior que o limite")
	}
	return data, ct, nil
}
```

> O erro de `checkIP` chega embrulhado pelo `net/http`: `errors.Is(err, ErrBlocked)` funciona porque `fmt.Errorf("%w")` é preservado na cadeia (`*url.Error` → `*net.OpError` → nosso erro). Se em algum caso não funcionar, embrulhe também ali com `%w` de `ErrBlocked`.

- [ ] **Step 4: Ver passar** — `go test -race ./internal/adapter/safehttp/`.
- [ ] **Step 5: Commit** — `git commit -m "feat: downloader seguro contra SSRF (allowlist, IP, tamanho, tipo)"`

---

### Task 4: Processamento de mídia com ffmpeg

**Files:** `internal/adapter/media/ffmpeg.go`, `ffmpeg_test.go`

**Interfaces (Produces):** `NewFFmpeg(binary string) *FFmpeg` (implementa `ingest.ImageProcessor` e `ingest.AudioProcessor`); `var ErrTooLarge`, `var ErrUnsupported`; `const MaxPixels = 40_000_000`.

Pré-requisito local: `brew install ffmpeg`. Os testes que precisam do ffmpeg chamam `requireFFmpeg(t)`, que faz `t.Skip` se o binário não existir. **No CI o ffmpeg será instalado (Task 10), então lá eles rodam.**

- [ ] **Step 1: Testes que falham**

```go
package media_test

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"image/png"
	"os/exec"
	"testing"
	"time"

	"github.com/velosobr/passarim-catalog/internal/adapter/media"
)

func requireFFmpeg(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg não instalado")
	}
}

func pngOf(w, h int) []byte {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for x := 0; x < w; x++ {
		img.Set(x, 0, color.RGBA{R: 200, A: 255})
	}
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	return buf.Bytes()
}

func TestImageProcessor_CreatesThreeWebPVariants(t *testing.T) {
	requireFFmpeg(t)
	v, err := media.NewFFmpeg("ffmpeg").Process(context.Background(), pngOf(2000, 1000))
	if err != nil {
		t.Fatal(err)
	}
	for name, b := range map[string][]byte{"thumb": v.Thumb, "medium": v.Medium, "large": v.Large} {
		// Arquivos WebP começam com "RIFF....WEBP".
		if len(b) < 12 || string(b[0:4]) != "RIFF" || string(b[8:12]) != "WEBP" {
			t.Errorf("%s não é WebP", name)
		}
	}
	if v.Width != 1600 || v.Height != 800 {
		t.Fatalf("large deveria ter 1600x800, veio %dx%d", v.Width, v.Height)
	}
}

func TestImageProcessor_DoesNotUpscale(t *testing.T) {
	requireFFmpeg(t)
	v, err := media.NewFFmpeg("ffmpeg").Process(context.Background(), pngOf(500, 250))
	if err != nil || v.Width != 500 || v.Height != 250 {
		t.Fatalf("imagem pequena não pode ser ampliada: %dx%d %v", v.Width, v.Height, err)
	}
}

// Review Focus #3: rejeitado ANTES de chamar o ffmpeg (não precisa dele).
func TestImageProcessor_RejectsHugeDimensions(t *testing.T) {
	// Cabeçalho PNG declarando 20000x20000 = 400 MP (o arquivo tem poucos bytes).
	huge := pngHeader(20000, 20000)
	if _, err := media.NewFFmpeg("ffmpeg-que-nao-existe").Process(context.Background(), huge); !errors.Is(err, media.ErrTooLarge) {
		t.Fatalf("esperava ErrTooLarge, veio %v", err)
	}
}

func TestImageProcessor_RejectsNonImage(t *testing.T) {
	if _, err := media.NewFFmpeg("ffmpeg").Process(context.Background(), []byte("not an image")); !errors.Is(err, media.ErrUnsupported) {
		t.Fatalf("esperava ErrUnsupported, veio %v", err)
	}
}

func TestAudioProcessor_TrimsToAAC(t *testing.T) {
	requireFFmpeg(t)
	// Gera 5 s de tom em WAV com o próprio ffmpeg.
	wav, err := exec.Command("ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=1000:duration=5",
		"-f", "wav", "pipe:1").Output()
	if err != nil {
		t.Fatal(err)
	}
	out, err := media.NewFFmpeg("ffmpeg").ToAAC(context.Background(), wav, 2*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	// ADTS (AAC "cru") começa com o syncword 0xFFF.
	if len(out) < 2 || out[0] != 0xFF || out[1]&0xF0 != 0xF0 {
		t.Fatalf("saída não é AAC/ADTS: % x", out[:min(4, len(out))])
	}
	if len(out) > len(wav) {
		t.Fatalf("AAC cortado em 2 s deveria ser bem menor que o WAV de 5 s")
	}
}
```

E no mesmo arquivo, o helper que monta só o cabeçalho de um PNG enorme (sem pixels — é isso que torna a "bomba" barata de criar):

```go
// pngHeader devolve o início de um PNG válido (assinatura + chunk IHDR)
// declarando w x h. image.DecodeConfig lê só isso.
func pngHeader(w, h uint32) []byte {
	var buf bytes.Buffer
	buf.Write([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'})
	ihdr := []byte{'I', 'H', 'D', 'R',
		byte(w >> 24), byte(w >> 16), byte(w >> 8), byte(w),
		byte(h >> 24), byte(h >> 16), byte(h >> 8), byte(h),
		8, 2, 0, 0, 0}
	buf.Write([]byte{0, 0, 0, 13})
	buf.Write(ihdr)
	crc := crc32.ChecksumIEEE(ihdr)
	buf.Write([]byte{byte(crc >> 24), byte(crc >> 16), byte(crc >> 8), byte(crc)})
	return buf.Bytes()
}
```

(adicione `"hash/crc32"` aos imports.)

- [ ] **Step 2: Ver falhar.**

- [ ] **Step 3: Implementar `ffmpeg.go`**

```go
// Package media converte fotos e áudios usando o ffmpeg (programa externo).
// Chamamos o binário em vez de uma biblioteca Go porque nenhuma biblioteca
// em Go puro codifica WebP com perdas E AAC. O ffmpeg faz os dois.
package media

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg" // registra o decodificador JPEG para image.DecodeConfig
	_ "image/png"  // idem para PNG
	"os/exec"
	"strconv"
	"time"

	"github.com/velosobr/passarim-catalog/internal/usecase/ingest"
)

const MaxPixels = 40_000_000 // 40 megapixels

var (
	ErrTooLarge    = errors.New("imagem grande demais")
	ErrUnsupported = errors.New("formato não suportado")
)

type FFmpeg struct {
	binary string
}

var (
	_ ingest.ImageProcessor = (*FFmpeg)(nil)
	_ ingest.AudioProcessor = (*FFmpeg)(nil)
)

func NewFFmpeg(binary string) *FFmpeg { return &FFmpeg{binary: binary} }

// Process gera as 3 variantes WebP. Antes de tudo lê SÓ o cabeçalho da
// imagem: uma "bomba de descompressão" (arquivo pequeno que vira bilhões
// de pixels) é recusada sem gastar memória (OWASP API10).
func (f *FFmpeg) Process(ctx context.Context, original []byte) (ingest.PhotoVariants, error) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(original))
	if err != nil {
		return ingest.PhotoVariants{}, fmt.Errorf("%w: %v", ErrUnsupported, err)
	}
	if cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width*cfg.Height > MaxPixels {
		return ingest.PhotoVariants{}, fmt.Errorf("%w: %dx%d", ErrTooLarge, cfg.Width, cfg.Height)
	}
	var v ingest.PhotoVariants
	for _, spec := range []struct {
		width int
		dst   *[]byte
	}{{320, &v.Thumb}, {800, &v.Medium}, {1600, &v.Large}} {
		out, err := f.webp(ctx, original, spec.width)
		if err != nil {
			return ingest.PhotoVariants{}, err
		}
		*spec.dst = out
	}
	// Dimensões da large: largura limitada a 1600 sem ampliar; altura proporcional e par.
	v.Width = min(cfg.Width, 1600)
	v.Height = cfg.Height * v.Width / cfg.Width
	v.Height -= v.Height % 2
	return v, nil
}

func (f *FFmpeg) webp(ctx context.Context, in []byte, width int) ([]byte, error) {
	// scale='min(W,iw)':-2 = largura no máximo W (nunca amplia), altura
	// proporcional e PAR (-2), exigência de vários codificadores.
	filter := "scale='min(" + strconv.Itoa(width) + ",iw)':-2"
	return f.run(ctx, in, "-i", "pipe:0", "-vf", filter, "-c:v", "libwebp", "-quality", "80", "-f", "webp", "pipe:1")
}

// ToAAC converte para AAC mono 96 kbps, cortando em maxDuration.
// Usamos o formato ADTS (AAC "cru"), que pode ser escrito num pipe.
func (f *FFmpeg) ToAAC(ctx context.Context, original []byte, maxDuration time.Duration) ([]byte, error) {
	secs := strconv.FormatFloat(maxDuration.Seconds(), 'f', 3, 64)
	return f.run(ctx, original, "-i", "pipe:0", "-t", secs, "-ac", "1", "-c:a", "aac", "-b:a", "96k", "-f", "adts", "pipe:1")
}

func (f *FFmpeg) run(ctx context.Context, in []byte, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	full := append([]string{"-hide_banner", "-loglevel", "error", "-nostdin"}, args...)
	// gosec G204: os argumentos são fixos no código; só os BYTES vêm de fora (stdin).
	cmd := exec.CommandContext(ctx, f.binary, full...) //nolint:gosec // argumentos constantes
	cmd.Stdin = bytes.NewReader(in)
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("ffmpeg: %w: %s", err, stderr.String())
	}
	return stdout.Bytes(), nil
}
```

- [ ] **Step 4: Ver passar** — `brew install ffmpeg` (se faltar) e depois `go test -race ./internal/adapter/media/`.
- [ ] **Step 5: Commit** — `git commit -m "feat: processamento de fotos (WebP) e cantos (AAC) com ffmpeg"`

---

### Task 5: Object storage (S3) com minio-go

**Files:** `internal/adapter/s3store/store.go`, `store_test.go`

**Interfaces (Produces):** `New(ctx, Config{Endpoint, AccessKey, SecretKey, Bucket string; UseSSL bool}) (*Store, error)` — cria o bucket se não existir; `(*Store).Put(ctx, key, contentType string, data []byte) error`; `(*Store).Get(ctx, key) ([]byte, error)` (usado nos testes e no e2e).

- [ ] **Step 1: Teste de integração que falha** (SeaweedFS via testcontainers)

```go
package s3store_test

import (
	"context"
	"testing"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/velosobr/passarim-catalog/internal/adapter/s3store"
)

func TestStore_PutAndGet(t *testing.T) {
	if testing.Short() {
		t.Skip("integração")
	}
	ctx := context.Background()
	ctr, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        "chrislusf/seaweedfs:4.48",
			Cmd:          []string{"server", "-s3", "-dir=/data"},
			Env:          map[string]string{"AWS_ACCESS_KEY_ID": "test", "AWS_SECRET_ACCESS_KEY": "test-secret"},
			ExposedPorts: []string{"8333/tcp"},
			WaitingFor:   wait.ForHTTP("/healthz").WithPort("8333/tcp"),
		},
		Started: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ctr.Terminate(context.Background()) })
	endpoint, err := ctr.PortEndpoint(ctx, "8333/tcp", "")
	if err != nil {
		t.Fatal(err)
	}

	st, err := s3store.New(ctx, s3store.Config{Endpoint: endpoint, AccessKey: "test", SecretKey: "test-secret", Bucket: "passarim-media"})
	if err != nil {
		t.Fatal(err)
	}
	if err := st.Put(ctx, "species/x/photo-0-thumb.webp", "image/webp", []byte("RIFF....WEBP")); err != nil {
		t.Fatal(err)
	}
	got, err := st.Get(ctx, "species/x/photo-0-thumb.webp")
	if err != nil || string(got) != "RIFF....WEBP" {
		t.Fatalf("get: %q %v", got, err)
	}
	// Criar de novo (bucket já existe) não pode falhar.
	if _, err := s3store.New(ctx, s3store.Config{Endpoint: endpoint, AccessKey: "test", SecretKey: "test-secret", Bucket: "passarim-media"}); err != nil {
		t.Fatalf("New com bucket existente: %v", err)
	}
}
```

- [ ] **Step 2: Ver falhar.**

- [ ] **Step 3: Implementar `store.go`**

```go
// Package s3store grava arquivos num object storage compatível com S3
// (SeaweedFS no ambiente local, Cloudflare R2 em produção — ADR-0006/0012).
// O minio-go é só um CLIENTE S3 genérico; funciona com qualquer servidor S3.
package s3store

import (
	"bytes"
	"context"
	"fmt"
	"io"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"github.com/velosobr/passarim-catalog/internal/usecase/ingest"
)

type Config struct {
	Endpoint  string // host:porta, sem "http://"
	AccessKey string
	SecretKey string
	Bucket    string
	UseSSL    bool
}

type Store struct {
	client *minio.Client
	bucket string
}

var _ ingest.MediaStore = (*Store)(nil)

func New(ctx context.Context, cfg Config) (*Store, error) {
	client, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("cliente s3: %w", err)
	}
	exists, err := client.BucketExists(ctx, cfg.Bucket)
	if err != nil {
		return nil, fmt.Errorf("verificar bucket: %w", err)
	}
	if !exists {
		if err := client.MakeBucket(ctx, cfg.Bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, fmt.Errorf("criar bucket: %w", err)
		}
	}
	return &Store{client: client, bucket: cfg.Bucket}, nil
}

// Put grava (ou substitui) um arquivo. O Content-Type é guardado junto,
// para a CDN servir o arquivo com o tipo certo.
func (s *Store) Put(ctx context.Context, key, contentType string, data []byte) error {
	_, err := s.client.PutObject(ctx, s.bucket, key, bytes.NewReader(data), int64(len(data)),
		minio.PutObjectOptions{ContentType: contentType})
	return err
}

func (s *Store) Get(ctx context.Context, key string) ([]byte, error) {
	obj, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	defer obj.Close()
	return io.ReadAll(obj)
}
```

- [ ] **Step 4: Ver passar** — `go get github.com/minio/minio-go/v7 && go mod tidy && go test ./internal/adapter/s3store/`.
- [ ] **Step 5: Commit** — `git commit -m "feat: object storage S3 (minio-go) para a mídia"`

---

### Task 6: Clientes das fontes (iNaturalist, xeno-canto, GBIF) com golden files

**Files:** `internal/adapter/sources/{inaturalist,xenocanto,gbif}/client.go`, `client_test.go`, `testdata/*.json`

**Interfaces (Produces):**
- `inaturalist.New(baseURL, userAgent string, limiter *rate.Limiter) *Client` → `FindPhotos(ctx, sciName, max) ([]ingest.PhotoCandidate, error)`. Usa `GET {base}/v1/taxa?q=<nome>&rank=species&per_page=1` → `results[0].id`; depois `GET {base}/v1/observations?taxon_id=<id>&place_id=6878&quality_grade=research&photo_license=cc-by,cc-by-nc,cc-by-sa,cc-by-nc-sa,cc0&order_by=votes&per_page=<max>`. Para cada observação, a 1ª foto: `URL` = `photos[0].url` com `square.` trocado por `large.`; `PageURL` = `uri`; `License` = `license_code`; `Author` = `attribution`; `Width/Height` = `original_dimensions`. Nenhum táxon → lista vazia, sem erro. `place_id=6878` = Brasil no iNaturalist.
- `xenocanto.New(baseURL, apiKey, userAgent string, limiter *rate.Limiter) *Client` → `FindRecordings(ctx, sciName) ([]ingest.AudioCandidate, error)`. `GET {base}/api/3/recordings?query=sp:"<nome>" cnt:brazil&key=<key>&per_page=50` → `recordings[]` com `file`→URL, `url`→PageURL, `lic`→License (URL; prefixe `https:` se vier `//...`), `rec`→Author, `q`→Quality, `type`→Type, `length` "m:ss"→DurationMs. **A chave nunca aparece em erro ou log:** erros HTTP citam só o status.
- `gbif.New(baseURL string, limiter *rate.Limiter) *Client` → `FindOccurrences(ctx, sciName, max) ([]domain.Point, error)`. `GET {base}/v1/species/match?name=<nome>` → `usageKey` (se `matchType == "NONE"`, devolve vazio); depois páginas de `GET {base}/v1/occurrence/search?taxonKey=<key>&country=BR&hasCoordinate=true&hasGeospatialIssue=false&limit=300&offset=<n>`, até `max` pontos ou `endOfRecords`.
- Todos: `User-Agent`, `limiter.Wait(ctx)` antes de cada requisição, timeout de 20 s, status ≠ 200 → erro `fmt.Errorf("<fonte>: status %d", code)`, JSON limitado a 5 MB (`io.LimitReader`).

- [ ] **Step 1: Gravar os golden files** (respostas reais, reduzidas)

```bash
cd ~/dev/passarim/passarim-catalog
UA="Passarim/0.1 (+https://github.com/velosobr/passarim-docs)"
mkdir -p internal/adapter/sources/{inaturalist,xenocanto,gbif}/testdata
curl -s -A "$UA" "https://api.inaturalist.org/v1/taxa?q=Turdus%20rufiventris&rank=species&per_page=1" \
 | python3 -c "import json,sys;r=json.load(sys.stdin)['results'][0];print(json.dumps({'total_results':1,'results':[{'id':r['id'],'name':r['name'],'rank':r['rank']}]},indent=1))" \
 > internal/adapter/sources/inaturalist/testdata/taxa.json
curl -s -A "$UA" "https://api.inaturalist.org/v1/observations?taxon_id=12738&place_id=6878&quality_grade=research&photo_license=cc-by,cc-by-nc,cc-by-sa,cc-by-nc-sa,cc0&order_by=votes&per_page=3" \
 | python3 -c "import json,sys;d=json.load(sys.stdin);print(json.dumps({'total_results':d['total_results'],'results':[{'id':o['id'],'uri':o['uri'],'photos':[{'id':p['id'],'url':p['url'],'license_code':p['license_code'],'attribution':p['attribution'],'original_dimensions':p.get('original_dimensions')} for p in o['photos'][:1]]} for o in d['results']]},ensure_ascii=False,indent=1))" \
 > internal/adapter/sources/inaturalist/testdata/observations.json
. ~/dev/passarim/.secrets/xeno-canto.env
curl -s -G "https://xeno-canto.org/api/3/recordings" --data-urlencode 'query=sp:"Turdus rufiventris" cnt:brazil' --data-urlencode "key=$XENO_CANTO_API_KEY" --data-urlencode per_page=50 \
 | python3 -c "import json,sys;d=json.load(sys.stdin);keep=['id','file','lic','rec','url','length','q','type'];print(json.dumps({'numRecordings':d['numRecordings'],'numPages':d['numPages'],'page':d['page'],'recordings':[{k:r[k] for k in keep} for r in d['recordings'][:4]]},ensure_ascii=False,indent=1))" \
 > internal/adapter/sources/xenocanto/testdata/recordings.json
curl -s "https://api.gbif.org/v1/species/match?name=Turdus%20rufiventris" \
 | python3 -c "import json,sys;d=json.load(sys.stdin);print(json.dumps({k:d.get(k) for k in ['usageKey','matchType','scientificName']},indent=1))" \
 > internal/adapter/sources/gbif/testdata/match.json
curl -s "https://api.gbif.org/v1/occurrence/search?taxonKey=2490718&country=BR&hasCoordinate=true&hasGeospatialIssue=false&limit=3" \
 | python3 -c "import json,sys;d=json.load(sys.stdin);print(json.dumps({'offset':0,'limit':3,'endOfRecords':True,'count':3,'results':[{k:o.get(k) for k in ['decimalLatitude','decimalLongitude','stateProvince']} for o in d['results']]},ensure_ascii=False,indent=1))" \
 > internal/adapter/sources/gbif/testdata/occurrences.json
grep -c "$XENO_CANTO_API_KEY" internal/adapter/sources/xenocanto/testdata/recordings.json   # Expected: 0 (a chave NÃO pode estar no arquivo)
```

Crie também `gbif/testdata/match-none.json` com `{"matchType": "NONE"}` e `inaturalist/testdata/taxa-empty.json` com `{"total_results": 0, "results": []}`.

- [ ] **Step 2: Testes que falham** — um `client_test.go` por pacote, com `httptest.NewServer` servindo o golden file da rota pedida e conferindo os parâmetros recebidos. Exemplo completo para o iNaturalist (repita o padrão nos outros dois):

```go
package inaturalist_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"golang.org/x/time/rate"

	"github.com/velosobr/passarim-catalog/internal/adapter/sources/inaturalist"
)

func server(t *testing.T, taxaFile string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("User-Agent") == "" {
			t.Error("User-Agent ausente")
		}
		var file string
		switch r.URL.Path {
		case "/v1/taxa":
			file = taxaFile
		case "/v1/observations":
			q := r.URL.Query()
			if q.Get("place_id") != "6878" || q.Get("taxon_id") != "12738" || !strings.Contains(q.Get("photo_license"), "cc-by") {
				t.Errorf("parâmetros errados: %v", q)
			}
			file = "testdata/observations.json"
		default:
			http.NotFound(w, r)
			return
		}
		b, _ := os.ReadFile(file)
		_, _ = w.Write(b)
	}))
}

func TestFindPhotos(t *testing.T) {
	srv := server(t, "testdata/taxa.json")
	defer srv.Close()
	c := inaturalist.New(srv.URL, "test-agent", rate.NewLimiter(rate.Inf, 1))
	photos, err := c.FindPhotos(context.Background(), "Turdus rufiventris", 3)
	if err != nil || len(photos) == 0 {
		t.Fatalf("got %v %v", photos, err)
	}
	p := photos[0]
	if !strings.Contains(p.URL, "/large.") || strings.Contains(p.URL, "square") {
		t.Errorf("URL deveria apontar para a versão large: %s", p.URL)
	}
	if p.License == "" || p.Author == "" || !strings.HasPrefix(p.PageURL, "https://www.inaturalist.org/observations/") || p.Width == 0 {
		t.Errorf("crédito incompleto: %+v", p)
	}
}

func TestFindPhotos_UnknownTaxonIsEmpty(t *testing.T) {
	srv := server(t, "testdata/taxa-empty.json")
	defer srv.Close()
	photos, err := inaturalist.New(srv.URL, "ua", rate.NewLimiter(rate.Inf, 1)).FindPhotos(context.Background(), "Nada nada", 3)
	if err != nil || len(photos) != 0 {
		t.Fatalf("táxon desconhecido: %v %v", photos, err)
	}
}

func TestFindPhotos_HTTPErrorIsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) }))
	defer srv.Close()
	if _, err := inaturalist.New(srv.URL, "ua", rate.NewLimiter(rate.Inf, 1)).FindPhotos(context.Background(), "X y", 3); err == nil {
		t.Fatal("503 deveria virar erro")
	}
}
```

Testes obrigatórios dos outros dois clientes:
- **xeno-canto:** `TestFindRecordings` confere que a query recebida contém `sp:"Turdus rufiventris"` e `cnt:brazil` e que `key` foi enviada; que `DurationMs` de `"1:26"` vale 86000; e que `License` começa com `https://`. `TestFindRecordings_ErrorDoesNotLeakKey`: o servidor responde 401 e `err.Error()` **não** contém a chave usada no teste (`"segredo-de-teste"`).
- **GBIF:** `TestFindOccurrences` confere que os pontos vêm do golden file, com o filtro `country=BR`. `TestFindOccurrences_PaginatesUntilMax`: o servidor gera páginas sintéticas com 300 pontos e `endOfRecords:false`, e `max=650` deve fazer 3 requisições e devolver exatamente 650 pontos. `TestFindOccurrences_NoMatchIsEmpty` usa `match-none.json`.

- [ ] **Step 3: Ver falhar.**

- [ ] **Step 4: Implementar os três `client.go`** seguindo o contrato acima. Estrutura comum: comentário de pacote explicando a fonte e seus termos de uso, `struct` com `baseURL`, `http.Client{Timeout: 20s}`, `limiter`, `userAgent` (e `apiKey` no xeno-canto), um helper `getJSON(ctx, path string, q url.Values, out any) error` que faz `limiter.Wait`, monta a URL com `url.Values.Encode()`, define o `User-Agent`, checa o status e decodifica com `json.NewDecoder(io.LimitReader(resp.Body, 5<<20))`. Structs de resposta com só os campos usados. No xeno-canto, `parseLength("m:ss")` com teste próprio (`"1:26"` → 86000, `"0:07"` → 7000, `"lixo"` → 0).

- [ ] **Step 5: Ver passar** — `go get golang.org/x/time/rate && go test -race ./internal/adapter/sources/...`.
- [ ] **Step 6: Commit** — `git commit -m "feat: clientes iNaturalist, xeno-canto e GBIF com golden files"`

---

### Task 7: Casos de uso de ingestão e Runner

**Files:** `internal/usecase/ingest/photos.go`, `audio.go`, `occurrences.go`, `runner.go`, `fakes_test.go`, `photos_test.go`, `audio_test.go`, `occurrences_test.go`, `runner_test.go`

**Interfaces (Produces):**
- `IngestPhotos{Source PhotoSource; Downloader Downloader; Images ImageProcessor; Store MediaStore; Repo MediaRepository; Policy domain.LicensePolicy; MaxPhotos int}.Run(ctx, Job) error`. Pede `MaxPhotos*2` candidatas, descarta licenças não aceitas (`ParseLicense` + `Policy`) **antes de baixar**, baixa, processa e grava `species/<id>/photo-<n>-{thumb,medium,large}.webp` (`image/webp`) até `MaxPhotos`. Credit: `{Author, License: string(parsed), Source: "inaturalist", SourceURL: PageURL}`. Uma foto que falha no download ou processamento é **pulada** (log via erro agregado não fatal). Se nenhuma sobrar, `ReplacePhotos(ctx, id, nil)` só é chamado se a fonte devolveu zero candidatas aceitas (não apague fotos boas por causa de uma falha temporária de rede: se houve candidatas aceitas mas todas falharam, devolva erro para o job tentar de novo).
- `IngestAudio{Source AudioSource; Downloader; Audio AudioProcessor; Store; Repo; Policy; MaxDuration time.Duration}.Run(ctx, Job) error`. Escolhe a melhor gravação aceita: qualidade A > B > C (D e E são descartadas); empate → `Type` contendo `"song"` primeiro; empate → menor `DurationMs` ≥ 5 s. Baixa (`DownloadAudio`), converte (`ToAAC`) e grava `species/<id>/audio-0.aac` (`audio/aac`). `DurationMs = min(candidata, MaxDuration)`. Credit `Source: "xeno-canto"`. **Sem candidatas aceitas → `ReplaceAudio(ctx, id, nil)` e sucesso** (Review Focus #7). Tenta a próxima candidata se uma falhar no download ou na conversão.
- `IngestOccurrences{Source OccurrenceSource; Repo; MaxPoints int; CellDeg float64}.Run(ctx, Job) error` → `ClusterPoints` → `ReplaceClusters` (zero pontos → grava lista vazia).
- `Runner{Queue JobQueue; Handlers map[Source]Handler; BatchSize int; MaxAttempts int; RefreshAfter time.Duration; Now func() time.Time; Observe func(source Source, ok bool)}` com `type Handler interface{ Run(ctx, Job) error }` e `RunOnce(ctx) (processed int, err error)`: `EnqueueMissing` → `ClaimDue(BatchSize)` → para cada job, o handler da fonte. Sucesso → `Complete`. Erro → `Fail(id, err.Error(), domain.NextAttemptDelay(job.Attempts), job.Attempts+1 >= MaxAttempts)`. Erro de **um** job não interrompe os outros. `Observe` (métrica) é chamado por job.

- [ ] **Step 1: Fakes** (`fakes_test.go`): `fakePhotoSource`, `fakeAudioSource`, `fakeOccSource` (devolvem listas fixas ou erro); `fakeDownloader` (mapa URL → bytes ou erro; registra as URLs pedidas); `fakeImages`/`fakeAudio` (devolvem bytes fixos ou erro); `fakeStore` (mapa key → contentType); `fakeRepo` (guarda o último `ReplacePhotos`/`ReplaceAudio`/`ReplaceClusters` e quantas vezes cada um foi chamado); `fakeQueue` (jobs em memória; registra `Complete` e `Fail` com seus argumentos).

- [ ] **Step 2: Testes que falham** — obrigatórios, com estes nomes e asserções:
  - `TestIngestPhotos_StoresVariantsAndCredits` — 2 candidatas `cc-by` → 6 objetos no store com as chaves `species/turdus-rufiventris/photo-0-thumb.webp` … `photo-1-large.webp`, todos `image/webp`; `ReplacePhotos` com 2 fotos e `Credit.License == "CC-BY"`, `Source == "inaturalist"`.
  - `TestIngestPhotos_SkipsRejectedLicenses` (Review Focus #2) — candidatas `cc-by-nd`, `""` e `cc-by-nc` com `Policy{AllowNC:false}` → **nenhuma** URL pedida ao downloader; `ReplacePhotos(nil)`.
  - `TestIngestPhotos_RespectsMax` — 10 candidatas e `MaxPhotos: 5` → 5 fotos.
  - `TestIngestPhotos_SkipsBrokenPhoto` — a 1ª falha no download e a 2ª funciona → 1 foto gravada na posição 0.
  - `TestIngestPhotos_AllDownloadsFailIsError` — candidatas aceitas, todas falham → erro, e `ReplacePhotos` **não** é chamado.
  - `TestIngestAudio_PicksBestRecording` — candidatas (B song), (A call), (A song 40 s), (A song 20 s), (D song) → escolhe a (A song 20 s); `DurationMs` = 20000 com `MaxDuration` de 30 s.
  - `TestIngestAudio_CapsDuration` — A song de 90 s → `DurationMs` = 30000.
  - `TestIngestAudio_NoRecordingsIsNotAnError` (Review Focus #7) — fonte vazia → `nil`, `ReplaceAudio(nil)` chamado e nada baixado.
  - `TestIngestAudio_FallsBackToNextCandidate` — a melhor falha na conversão, então usa a seguinte.
  - `TestIngestOccurrences_ClustersAndReplaces` — 4 pontos → `ReplaceClusters` com 2 clusters de `Precision` 1.0.
  - `TestRunner_CompletesSuccessfulAndRetriesFailed` — 2 jobs (um handler OK e outro com erro, attempts=0) → `Complete(1)`; `Fail(2, msg, 1min, giveUp=false)`; `Observe` chamado 2× (`true`, `false`).
  - `TestRunner_GivesUpAfterMaxAttempts` — job com `Attempts: 4` e `MaxAttempts: 5` falha → `giveUp=true`.
  - `TestRunner_UnknownSourceFailsJobWithoutPanic` — job de fonte sem handler → `Fail(..., giveUp=true)`.

- [ ] **Step 3: Ver falhar.**
- [ ] **Step 4: Implementar** os quatro arquivos conforme os contratos acima, com comentários em português explicando cada decisão (ex.: "descartar a licença ANTES de baixar: nem tocamos em arquivos que não podemos usar"). As chaves de storage ficam num helper `photoKey(speciesID string, n int, variant string) string` e `audioKey(speciesID string) string`, com teste próprio.
- [ ] **Step 5: Ver passar** — `go test -race ./internal/usecase/...`.
- [ ] **Step 6: Commit** — `git commit -m "feat: casos de uso de ingestão (fotos, canto, ocorrências) e runner com retry"`

---

### Task 8: `cmd/worker` e configuração

**Files:** `internal/config/worker.go`, `worker_test.go`, `cmd/worker/main.go`

**Interfaces (Produces):** `config.LoadWorker(getenv) (WorkerConfig, error)` com `WorkerConfig{DatabaseURL, S3Endpoint, S3AccessKey, S3SecretKey, S3Bucket string; S3UseSSL bool; XenoCantoAPIKey string; Interval time.Duration; BatchSize int; AllowNC bool; MetricsAddr string; FFmpegPath string; UserAgent string}`.
Padrões: `S3_BUCKET=passarim-media`, `WORKER_INTERVAL=1m`, `WORKER_BATCH_SIZE=5`, `ALLOW_NC=true`, `METRICS_ADDR=:9092`, `FFMPEG_PATH=ffmpeg`, `USER_AGENT="Passarim/0.1 (+https://github.com/velosobr/passarim-docs)"`. Obrigatórias: `DATABASE_URL`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `XENO_CANTO_API_KEY`. **A mensagem de erro cita o NOME da variável, nunca o valor.**

- [ ] **Step 1: Testes que falham** (`worker_test.go`): padrões aplicados; cada variável obrigatória ausente gera um erro com o nome dela; `WORKER_INTERVAL=abc` gera erro; `TestLoadWorker_ErrorNeverContainsSecretValues` (com `S3_SECRET_KEY=super-secreto` e `WORKER_INTERVAL=xx`, o erro não contém `super-secreto`).
- [ ] **Step 2: Ver falhar; implementar `worker.go`** no estilo do `config.go` existente (getenv injetado); ver passar.
- [ ] **Step 3: `cmd/worker/main.go`** — monta tudo, sem regra de negócio:
  - logs JSON (`slog`); `signal.NotifyContext` para SIGINT e SIGTERM;
  - pool pgx + `postgres.WaitForDB` + `postgres.Migrate` (o worker também aplica migrations, para poder subir antes da API);
  - `s3store.New`;
  - `safehttp.New` com `AllowedHosts: inaturalist-open-data.s3.amazonaws.com, static.inaturalist.org, xeno-canto.org, www.xeno-canto.org` e `Blocked` incrementando a métrica `passarim_downloads_blocked_total{reason}` (use só o prefixo do motivo antes de `:` como label, para não explodir a cardinalidade);
  - clientes das fontes com `rate.NewLimiter(rate.Every(time.Second), 1)` (iNaturalist e xeno-canto) e `rate.Every(500*time.Millisecond)` (GBIF), URLs base `https://api.inaturalist.org`, `https://xeno-canto.org`, `https://api.gbif.org`;
  - `media.NewFFmpeg(cfg.FFmpegPath)`;
  - handlers `IngestPhotos{MaxPhotos: 5}`, `IngestAudio{MaxDuration: 30s}`, `IngestOccurrences{MaxPoints: 900, CellDeg: 1.0}` e `Policy{AllowNC: cfg.AllowNC}`;
  - `Runner{BatchSize, MaxAttempts: 5, RefreshAfter: 30 dias}`, com `Observe` incrementando `passarim_ingest_jobs_total{source,result}`;
  - servidor HTTP de métricas (`/metrics`) com `ReadHeaderTimeout`, `ReadTimeout`, `WriteTimeout` e `IdleTimeout`;
  - loop: `RunOnce` imediato; depois um `time.Ticker(cfg.Interval)` até o contexto ser cancelado. Se `RunOnce` processou um lote cheio, roda de novo logo em seguida, sem esperar o ticker. Cada `RunOnce` loga `processed`;
  - shutdown: para o loop, termina o job em andamento (o contexto do job é derivado de um `context.WithoutCancel` com timeout de 2 min, para não deixar um job pela metade) e desliga o servidor de métricas.
- [ ] **Step 4:** `go build ./... && go vet ./...`.
- [ ] **Step 5: Commit** — `git commit -m "feat: binário do worker com fila, métricas e graceful shutdown"`

---

### Task 9: Imagem do worker, compose e teste ponta a ponta

**Files:**
- Create: `passarim-catalog/Dockerfile.worker`
- Modify: `passarim-docs/docker-compose.yml`, `.env.example`, `.env` (local, fora do git), `infra/prometheus/prometheus.yml`
- Create: `passarim-docs/docs/adr/0014-imagem-do-worker-com-ffmpeg.md`

- [ ] **Step 1: `Dockerfile.worker`**

```dockerfile
# Imagem do worker. Diferente da API (distroless), o worker precisa do
# ffmpeg, que depende de bibliotecas do sistema. Usamos Alpine (pequena)
# e criamos um usuário sem privilégios (ADR-0014).
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/worker ./cmd/worker

FROM alpine:3.22
# --no-cache: não guarda o índice de pacotes na imagem (menor e sem lixo).
RUN apk add --no-cache ffmpeg ca-certificates && adduser -D -H -u 10001 worker
COPY --from=build /out/worker /usr/local/bin/worker
USER worker
EXPOSE 9092
ENTRYPOINT ["/usr/local/bin/worker"]
```

```bash
cd ~/dev/passarim/passarim-catalog && docker build -f Dockerfile.worker -t passarim-worker:dev .
docker run --rm passarim-worker:dev 2>&1 | head -1   # Expected: erro citando DATABASE_URL (variável obrigatória)
docker run --rm --entrypoint ffmpeg passarim-worker:dev -hide_banner -encoders 2>/dev/null | grep -cE "libwebp |aac "   # Expected: 2
```

- [ ] **Step 2: Compose** — no `passarim-docs/docker-compose.yml`, depois do `catalog-seed`:

```yaml
  # Worker de ingestão (Etapa 2b): busca fotos, cantos e avistamentos nas
  # fontes externas e grava no banco e no object storage. Precisa de
  # INTERNET (sai pela rede privada, que não é "internal") e não recebe
  # conexões de ninguém, então não publica portas.
  catalog-worker:
    build:
      context: ../passarim-catalog
      dockerfile: Dockerfile.worker
    image: passarim-worker:dev
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?sslmode=disable
      S3_ENDPOINT: objectstorage:8333
      S3_ACCESS_KEY: ${S3_ACCESS_KEY}
      S3_SECRET_KEY: ${S3_SECRET_KEY}
      XENO_CANTO_API_KEY: ${XENO_CANTO_API_KEY:?defina XENO_CANTO_API_KEY no .env}
    depends_on:
      catalog-seed:
        condition: service_completed_successfully   # só começa com as aves já no banco
      objectstorage:
        condition: service_healthy
    networks: [passarim-private]
    read_only: true
    tmpfs: [/tmp]   # o ffmpeg pode precisar de arquivos temporários
```

`.env.example`, depois do bloco do S3:

```dotenv
# Chave da API do xeno-canto (cantos). Crie a sua em https://xeno-canto.org
# (conta gratuita). NUNCA commite a chave: ela fica só no seu .env.
XENO_CANTO_API_KEY=
```

No `.env` local (fora do git), copie o valor de `~/dev/passarim/.secrets/xeno-canto.env`:

```bash
cd ~/dev/passarim/passarim-docs
grep -q '^XENO_CANTO_API_KEY=' .env || grep '^XENO_CANTO_API_KEY=' ~/dev/passarim/.secrets/xeno-canto.env >> .env
git check-ignore .env   # Expected: .env
```

`infra/prometheus/prometheus.yml`: adicionar o job `worker` → `catalog-worker:9092`.

- [ ] **Step 3: ADR-0014** (`docs/adr/0014-imagem-do-worker-com-ffmpeg.md`, no formato dos outros ADRs, status Aceita, data 2026-10-02): **Contexto:** o worker converte para WebP e AAC, e nenhuma biblioteca Go pura faz os dois; o ffmpeg precisa de bibliotecas do sistema, que a imagem distroless não tem. **Decisão:** imagem Alpine + ffmpeg, com usuário não-root, `read_only` + `tmpfs /tmp`; a API continua distroless. **Consequências:** imagem maior (~100 MB) e mais superfície de ataque (há um shell), mitigadas porque o worker não recebe conexões, roda sem root e o Trivy escaneia a imagem no CI.

- [ ] **Step 4: Ponta a ponta**

```bash
cd ~/dev/passarim/passarim-docs
docker compose up -d --wait --build    # o worker não tem healthcheck; --wait espera os demais
sleep 120
docker compose logs catalog-worker | tail -5          # Expected: linhas com "processed"
docker compose exec postgres psql -U passarim -d passarim -c \
  "SELECT source, status, count(*) FROM ingestion_job GROUP BY 1,2 ORDER BY 1,2;"
# Expected: jobs 'done' para as 3 fontes (alguns ainda pending é normal)
docker compose exec postgres psql -U passarim -d passarim -c \
  "SELECT kind, count(*) FROM media GROUP BY kind; SELECT count(DISTINCT species_id) FROM occurrence_cluster;"
docker run --rm --network passarim-private fullstorydev/grpcurl -plaintext -d '{"id":"turdus-rufiventris"}' \
  catalog-api:50051 passarim.catalog.v1.CatalogService/GetSpecies | grep -E '"(largeKey|key|clusters)"' | head -5
# Expected: largeKey "species/turdus-rufiventris/photo-0-large.webp", key ".../audio-0.aac", clusters presentes
#   (se o sabiá ainda não foi processado, espere mais um minuto e repita)
curl -s -o /tmp/p.webp -w "%{http_code} %{content_type}\n" \
  http://localhost:8888/buckets/passarim-media/species/turdus-rufiventris/photo-0-large.webp
# Expected: 200 image/webp  (filer do SeaweedFS; se o caminho do bucket for outro, liste com curl -s http://localhost:8888/buckets/)
curl -s localhost:9090/api/v1/targets | python3 -c "import json,sys;print([(t['labels']['job'],t['health']) for t in json.load(sys.stdin)['data']['activeTargets']])"
# Expected: ('worker','up')
docker compose logs catalog-worker | grep -c "$(grep XENO_CANTO_API_KEY .env | cut -d= -f2)"   # Expected: 0 (a chave nunca aparece no log)
docker compose stop catalog-worker && docker compose logs catalog-worker | tail -2   # Expected: shutdown limpo
docker compose down
```

- [ ] **Step 5: Commits** — no catalog: `build: imagem do worker (alpine + ffmpeg, não-root)`. No docs: `feat: worker de ingestão no docker compose; ADR-0014`.

---

### Task 10: CI, README e publicação

**Files:** `passarim-catalog/.github/workflows/ci.yml`, `README.md`; `passarim-docs/README.md`

- [ ] **Step 1: CI do catalog**
  - No job `test`, antes do `go test`, adicione `- run: sudo apt-get update && sudo apt-get install -y ffmpeg` (para os testes da Task 4 rodarem de verdade).
  - Para garantir que nenhum teste de ffmpeg foi pulado no CI, adicione a variável `REQUIRE_FFMPEG=1` ao passo do `go test`. Em `requireFFmpeg`, se `os.Getenv("REQUIRE_FFMPEG") == "1"` e o ffmpeg faltar, use `t.Fatal` em vez de `t.Skip`.
  - No job `security`, construa e escaneie também a imagem do worker: `docker build -f Dockerfile.worker -t passarim-worker:ci .` e um segundo passo `aquasecurity/trivy-action` com `image-ref: passarim-worker:ci`, mesmas opções do primeiro.
- [ ] **Step 2: README do catalog** — no diagrama Mermaid, adicione um subgraph `worker`: `Runner` → `IngestPhotos`/`IngestAudio`/`IngestOccurrences` → portas `PhotoSource`/`AudioSource`/`OccurrenceSource`/`Downloader`/`MediaStore` → adapters `inaturalist`/`xenocanto`/`gbif`/`safehttp`/`s3store`/`ffmpeg`. Adicione também uma seção curta "Worker de ingestão", explicando a fila (SKIP LOCKED), o backoff, as licenças e o SSRF, com links para os ADRs 0006, 0007 e 0014. Valide com `npx -y @mermaid-js/mermaid-cli -i README.md -o /tmp/r.md`.
- [ ] **Step 3: README do docs** — no diagrama principal, o worker já aparece; acrescente na tabela de serviços locais que os arquivos ficam no bucket `passarim-media` (filer `http://localhost:8888`) e que o `.env` precisa de `XENO_CANTO_API_KEY`. Valide markdownlint + mermaid (com `-p .github/puppeteer-config.json`).
- [ ] **Step 4: Verificação completa** — `gofmt -l .`, `go vet ./...`, `golangci-lint run`, `go tool sqlc diff` e `REQUIRE_FFMPEG=1 go test -race ./...` → tudo limpo.
- [ ] **Step 5: Commit, push e CI** — commits `ci: ffmpeg nos testes e trivy na imagem do worker` e `docs: worker de ingestão no README`; `git push` nos dois repositórios; `gh run watch` até ficar verde. Se falhar, corrija a causa raiz e registre no relatório.
