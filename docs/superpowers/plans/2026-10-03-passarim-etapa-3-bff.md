# Passarim — Etapa 3: BFF (REST/JSON + cache + resiliência) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o `passarim-bff`: serviço Go que expõe REST/JSON em `/v1` para o app, fala com o catalog por gRPC, e entrega cache Redis com stale-while-error, circuit breaker, retry, rate limit por IP, observabilidade e duas réplicas atrás do Traefik no `docker compose`.

**Architecture:** Arquitetura limpa, igual à do `passarim-catalog`: `domain` puro → `usecase` (porta `CatalogReader`) → `adapter`s. A porta é implementada pelo cliente gRPC e envolvida por decorators: `cache → circuit breaker → retry/timeout → grpcclient`. O handler HTTP converte o domínio em DTOs explícitos e monta as URLs de mídia a partir das chaves.

**Tech Stack:** Go 1.27, `net/http` (roteador da stdlib), gRPC (`passarim-proto v0.2.1`), `go-redis/v9`, `sony/gobreaker/v2`, `golang.org/x/time/rate`, `golang.org/x/sync/singleflight`, `kin-openapi`, Prometheus client, OpenTelemetry (`otelhttp`, `otelgrpc`), testcontainers (Redis), Docker/Traefik/Grafana.

**Spec:** `docs/superpowers/specs/2026-10-03-passarim-bff-design.md` (a fonte única; as seções citadas abaixo como `§N` são dela). Spec geral: `2026-10-01-passarim-design.md`.

## Global Constraints

- Repositórios em `~/dev/passarim/`: o novo `passarim-bff` (módulo `github.com/velosobr/passarim-bff`) e o `passarim-docs` (compose, Traefik, Prometheus, Grafana, ADRs). Trabalho direto na `main`; **commit e push dependem de autorização do dono** (inclusive criar o repositório público `velosobr/passarim-bff`, que é uma ação externa).
- **Código comentado em português para um estudante**; identificadores em inglês. Go 1.27.1 (mesmo do catalog). Copie as versões de `google.golang.org/grpc`, `google.golang.org/protobuf`, `prometheus/client_golang`, `testcontainers-go` e `golang.org/x/time` do `go.mod` do `passarim-catalog` para manter a mesma pilha.
- Dependências apontam para dentro: `domain` não importa nada do projeto; `usecase` importa só `domain`; `adapter/*` implementam as portas. `adapter/http` **nunca** serializa tipos do domínio nem do proto: sempre DTOs próprios (OWASP API3).
- O BFF **nunca chama APIs externas** e nunca escreve em lugar nenhum além do cache Redis.
- **Erros:** `application/problem+json` (RFC 9457) com `type` = `urn:passarim:problem:<code-em-minusculas-com-hifen>`, `title` fixo em PT, `code`, `status`, `requestId` (+ `errors[{field,reason}]` no 400). Códigos: `INVALID_PARAMETER`, `SPECIES_NOT_FOUND`, `NOT_FOUND`, `METHOD_NOT_ALLOWED`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`, `INTERNAL`. Nenhuma resposta carrega mensagem interna, host, stack ou texto de erro gRPC.
- **Biomas** (códigos do catalog): `amazonia`, `mata_atlantica`, `cerrado`, `caatinga`, `pantanal`, `pampa`. **UFs:** as 27 siglas, sempre maiúsculas na resposta, aceitas sem diferenciar maiúsculas na entrada. Conservação: `{code,label}` ou `null`.
- **Validação de entrada:** `id` `^[a-z0-9-]{1,80}$`; `limit` inteiro 1–50 (padrão 20; fora disso = 400, nunca ajustado em silêncio); `q` aparado, ≤ 100 runas, UTF-8 válido, sem caracteres de controle; `cursor` `[A-Za-z0-9_-]{1,512}`; parâmetro repetido = 400; desconhecido = ignorado; valor vazio = ausente.
- **Tabela de classificação de erros (única, em `domain/errors.go`):** `Unavailable` e `Timeout` → retry sim, breaker sim, stale sim; `Upstream` (Internal/Unknown/ResourceExhausted) → retry não, breaker sim, stale sim; `CircuitOpen` → retry não, stale sim; `NotFound`, `InvalidArgument`, `Canceled`, `Internal` → tudo não.
- **Tempo:** orçamento total por requisição `REQUEST_BUDGET` = 3 s (aplicado no caso de uso); 2 s por tentativa (`CATALOG_ATTEMPT_TIMEOUT`); até 2 retries; backoff exponencial com jitter total (`[0, 50 ms × 2ⁿ]`); sem nova tentativa com menos de 200 ms restantes; `WriteTimeout` 5 s; `REQUEST_BUDGET` ≤ 4 s.
- **Cache:** frescor 10 min (`CACHE_FRESH_TTL`), TTL no Redis 24 h (`CACHE_STALE_TTL`); chaves `bff:v1:species:{id}`, `bff:v1:filters`, `bff:v1:list:{sha256}`; lista com `q` não vazio **fora do cache** (`bypass`); Redis fora do ar = miss; envelope que não decodifica = miss.
- **Breaker:** abre com 5 falhas seguidas ou ≥ 60% em ≥ 10 chamadas; aberto 30 s; half-open 3 chamadas; `Interval` 60 s; um breaker único para o catalog.
- **Rate limit:** 10 req/s, rajada 30, por IP, em memória, teto de 10 000 IPs com despejo do mais ocioso; 429 com `Retry-After`. IP real só via `TRUSTED_PROXIES`, lendo `X-Forwarded-For` da direita para a esquerda; nunca a primeira entrada.
- **Servidor:** `ReadHeaderTimeout` 2 s, `ReadTimeout` 5 s, `WriteTimeout` 5 s, `IdleTimeout` 60 s, `MaxHeaderBytes` 8 KiB; só `GET`/`HEAD`; `/metrics` em porta separada (`METRICS_ADDR`, `:9091`); API em `HTTP_ADDR` (`:8080`).
- **Configuração por variáveis de ambiente; mensagens de erro citam o NOME da variável, nunca o valor.**
- Container distroless `nonroot`, `read_only`, sem porta publicada além do Traefik. `bff healthcheck` faz `GET http://127.0.0.1:<porta>/healthz`.
- Fora deste plano: mTLS BFF↔catalog (BACKLOG P2), deploy (Etapa 4), HSTS, tracing dentro do catalog, autenticação, CORS, chip de dieta (exige campo no proto).

## Review Focus

1. **Primeiro chamador cancela e o segundo ainda recebe o dado** (singleflight com `WithoutCancel` + `DoChan`) → Task 6 (`TestCache_FirstCallerCancelsSecondStillGetsData`).
2. **Catalog fora do ar ⇒ stale servido, não o 503 do Traefik** (`/readyz` independente do catalog; `Internal` do catalog libera stale) → Task 6 (`TestCache_ServesStaleOnUpstreamAndCircuitOpen`) e Task 8 (`TestReadyz_IgnoresCatalogAndRedis`).
3. **`X-Forwarded-For` forjado não burla o rate limit** (sem proxy confiável o cabeçalho é ignorado; com proxy confiável vale a entrada mais à direita que não é proxy) → Task 5 (`TestClientIP_*`).
4. **`NotFound`/`InvalidArgument`/`Canceled` não contam no breaker nem liberam stale** (cliente que desconecta não abre o circuito; 404 não vira dado velho) → Task 1 (`TestKindTable`), Task 6 (`TestBreaker_IgnoresNonInfrastructureErrors`).
5. **Resposta de erro nunca vaza texto interno** (o catalog falso devolve mensagem "segredo-interno") → Task 4 (`TestErrors_NeverLeakInternalText`).
6. **Cardinalidade do cache**: `q` livre não gera chaves no Redis e `state=sp`/`state=SP` geram a mesma chave → Task 6 (`TestCache_SearchBypassesCache`, `TestCache_KeyIsNormalized`).
7. **Chave de mídia maliciosa vinda do catalog** (`..`, caracteres fora do charset) vira URL `null`, nunca sai do bucket → Task 4 (`TestMediaURL_RejectsUnsafeKeys`).

---

## Estrutura de arquivos

Repositório novo `passarim-bff` (módulo `github.com/velosobr/passarim-bff`):

```text
cmd/bff/main.go                       montagem; subcomando "healthcheck" (Task 9a)
internal/config/config.go (+_test)    variáveis de ambiente (Task 1)
internal/domain/
  catalog.go (+_test)                 Biome, ConservationStatus, UFs (Task 1)
  species.go                          tipos do domínio (Task 1)
  query.go (+_test)                   RawListQuery, ListQuery, validação, ValidateSpeciesID (Task 1)
  errors.go (+_test)                  Kind, Error, KindOf, tabela de classificação (Task 1)
internal/usecase/
  catalog.go                          porta CatalogReader (Task 1)
  list_species.go get_species.go list_filters.go (+_test)   (Task 2)
internal/adapter/
  grpcclient/                         cliente gRPC, mapeamento, interceptors, TLS (Task 3)
  reqmeta/                            request_id e resultado do cache no contexto (Task 4)
  media/                              URL pública da mídia (Task 4)
  http/                               rotas, handlers, DTOs, rótulos, erros, health (Tasks 4 e 8)
  http/middleware/                    recovery, request_id, log, headers, limites, IP, rate limit (Task 5)
  resilience/                         retry e breaker (Task 6)
  cache/                              decorator, chaves, envelope, Store Redis (Task 6)
  metrics/                            interfaces + no-op (Task 6) e Prometheus (Task 8)
  telemetry/                          OpenTelemetry (Task 8)
openapi.yaml                          contrato (Task 7)
Dockerfile · Makefile · .golangci.yml · .gitignore · .dockerignore · .github/workflows/ci.yml · README.md
```

No `passarim-docs`: `docker-compose.yml`, `infra/prometheus/prometheus.yml`, `infra/grafana/provisioning/dashboards/*`, `docs/adr/0015-*.md`, `docs/adr/0016-*.md`, `README.md`, `BACKLOG.md`.

---

### Task 1: Esqueleto, configuração, domínio e a porta `CatalogReader`

**Files:** `go.mod`, `Makefile`, `.golangci.yml`, `.gitignore`, `.dockerignore`, `.github/workflows/ci.yml`, `internal/config/config.go`, `internal/config/config_test.go`, `internal/domain/{catalog,species,query,errors}.go` + `_test.go`, `internal/usecase/catalog.go`

**Interfaces (Produces):**
- `domain`: `type Biome string` (consts `BiomeAmazonia="amazonia"`, `BiomeMataAtlantica="mata_atlantica"`, `BiomeCerrado`, `BiomeCaatinga`, `BiomePantanal`, `BiomePampa`); `ParseBiome(s string) (Biome, bool)`; `type ConservationStatus string` (`""`, `"LC"`…`"DD"`); `NormalizeUF(s string) (string, bool)` (maiúscula + valida as 27 UFs).
- `domain` tipos: `Credit{Author, License, Source, SourceURL string}`, `Photo{ThumbKey, MediumKey, LargeKey string; Width, Height int; Credit Credit}`, `Audio{Key string; DurationMs int; Credit Credit}`, `Fact{Text, Source string}`, `Cluster{Lat, Lng float64; Count int; Precision float64}`, `Summary{ID, ScientificName, CommonName, ThumbnailKey string; Conservation ConservationStatus}`, `SpeciesPage{Items []Summary; NextCursor string}`, `Species{ID, ScientificName, CommonName, Family string; SizeCm *int; Diet *string; Conservation ConservationStatus; Description string; DescriptionCredit Credit; Facts []Fact; Biomes []Biome; States []string; Photos []Photo; Audio *Audio; Clusters []Cluster}`, `BiomeCount{Biome Biome; SpeciesCount int}`, `StateCount{State string; SpeciesCount int}`, `Filters{Biomes []BiomeCount; States []StateCount}`.
- `domain.RawListQuery{Q, Biome, State, Cursor, Limit string; Repeated []string}`; `domain.ListQuery{Q string; Biome Biome; State, Cursor string; Limit int}`; `NewListQuery(RawListQuery) (ListQuery, error)`; `ValidateSpeciesID(id string) error`; `type FieldError{Field, Reason string}`; `type ValidationError struct{ Fields []FieldError }` (`Error() string`); `DefaultLimit = 20`, `MaxLimit = 50`.
- `domain.Kind` (consts `KindUnavailable`, `KindTimeout`, `KindUpstream`, `KindCircuitOpen`, `KindNotFound`, `KindInvalidArgument`, `KindCanceled`, `KindInternal`) com métodos `Retryable() bool`, `CountsForBreaker() bool`, `AllowsStale() bool`, `String() string`; `type Error struct{ Kind Kind; Err error }` (`Error()`, `Unwrap()`); `NewError(kind Kind, err error) error`; `KindOf(err error) Kind` (entende `*Error`, `*ValidationError`→`KindInvalidArgument`, `context.DeadlineExceeded`→`KindTimeout`, `context.Canceled`→`KindCanceled`, qualquer outro→`KindInternal`).
- `usecase.CatalogReader` (interface com `ListSpecies(ctx, domain.ListQuery) (domain.SpeciesPage, error)`, `GetSpecies(ctx, id string) (domain.Species, error)`, `ListFilters(ctx) (domain.Filters, error)`).
- `config.Config` e `config.Load(getenv func(string) string) (Config, error)`. Campos: `HTTPAddr, MetricsAddr, CatalogAddr, CatalogTLSCAFile, CatalogTLSCertFile, CatalogTLSKeyFile, CatalogTLSServerName, RedisURL string; RedisTimeout time.Duration; MediaBaseURL string; RequestBudget, CatalogAttemptTimeout time.Duration; CatalogMaxRetries int; CacheFreshTTL, CacheStaleTTL time.Duration; RateLimitRPS float64; RateLimitBurst, RateLimitMaxIPs int; TrustedProxies []netip.Prefix; ClientIPHeader string; ShutdownDrainDelay, ShutdownTimeout time.Duration; LogLevel slog.Level; OTelEndpoint, OTelServiceName string`.

- [ ] **Step 1: Criar o repositório e o esqueleto**

Pré-requisito: o dono autorizou criar o repositório público. Sem autorização, trabalhe só localmente em `~/dev/passarim/passarim-bff` e peça autorização antes de qualquer `gh`/`git push`.

```bash
cd ~/dev/passarim
gh repo create velosobr/passarim-bff --public --description "BFF REST do Passarim" --clone
cd passarim-bff
go mod init github.com/velosobr/passarim-bff
cp ../passarim-catalog/.golangci.yml ../passarim-catalog/.gitignore ../passarim-catalog/.dockerignore .
mkdir -p internal/{config,domain,usecase} .github/workflows
```

`go.mod`: ajuste a linha `go 1.27.1`. `.dockerignore` fica como a do catalog. `Makefile`:

```makefile
# Atalhos do dia a dia. Uso: make test | make lint | make e2e | make run
.PHONY: test lint e2e run

# Testes unitários, de contrato e de integração com Redis (testcontainers: precisa de Docker).
test:
	go test -race ./...

lint:
	golangci-lint run

# Teste ponta a ponta com o catalog real. Só local: constrói o catalog de ../passarim-catalog.
e2e:
	PASSARIM_CATALOG_DIR=../passarim-catalog go test -race -tags e2e ./e2e/...

# Roda o BFF local apontando para o catalog e o Redis do docker compose (portas do host).
run:
	CATALOG_ADDR=localhost:50051 REDIS_URL=redis://localhost:6379 MEDIA_BASE_URL=http://localhost:8888/buckets/passarim-media go run ./cmd/bff
```

`.github/workflows/ci.yml` (mínimo agora; a Task 10 completa):

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version-file: go.mod
      - run: go test -race ./...

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version-file: go.mod
      - uses: golangci/golangci-lint-action@v8
        with:
          version: v2.14.0
```

- [ ] **Step 2: Testes do domínio que falham** — `internal/domain/errors_test.go`:

```go
package domain_test

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/velosobr/passarim-bff/internal/domain"
)

// Review Focus #4: a tabela é a única fonte de verdade sobre retry, breaker e stale.
func TestKindTable(t *testing.T) {
	cases := []struct {
		kind                     domain.Kind
		retry, breaker, stale    bool
	}{
		{domain.KindUnavailable, true, true, true},
		{domain.KindTimeout, true, true, true},
		{domain.KindUpstream, false, true, true},
		{domain.KindCircuitOpen, false, false, true},
		{domain.KindNotFound, false, false, false},
		{domain.KindInvalidArgument, false, false, false},
		{domain.KindCanceled, false, false, false},
		{domain.KindInternal, false, false, false},
	}
	for _, c := range cases {
		if c.kind.Retryable() != c.retry || c.kind.CountsForBreaker() != c.breaker || c.kind.AllowsStale() != c.stale {
			t.Errorf("%s: retry=%v breaker=%v stale=%v; esperado %v/%v/%v", c.kind,
				c.kind.Retryable(), c.kind.CountsForBreaker(), c.kind.AllowsStale(), c.retry, c.breaker, c.stale)
		}
	}
}

func TestKindOf(t *testing.T) {
	cases := map[string]struct {
		err  error
		want domain.Kind
	}{
		"erro tipado":           {domain.NewError(domain.KindNotFound, errors.New("x")), domain.KindNotFound},
		"embrulhado":            {fmt.Errorf("camada: %w", domain.NewError(domain.KindUnavailable, errors.New("x"))), domain.KindUnavailable},
		"deadline":              {context.DeadlineExceeded, domain.KindTimeout},
		"cancelado":             {context.Canceled, domain.KindCanceled},
		"validação":             {&domain.ValidationError{Fields: []domain.FieldError{{Field: "id", Reason: "x"}}}, domain.KindInvalidArgument},
		"desconhecido":          {errors.New("boom"), domain.KindInternal},
	}
	for name, c := range cases {
		if got := domain.KindOf(c.err); got != c.want {
			t.Errorf("%s: KindOf = %s, quer %s", name, got, c.want)
		}
	}
}

func TestErrorKeepsCauseForLogsButIsUnwrappable(t *testing.T) {
	cause := errors.New("causa interna")
	err := domain.NewError(domain.KindUpstream, cause)
	if !errors.Is(err, cause) {
		t.Fatal("Unwrap deveria expor a causa (para logs e testes)")
	}
}
```

`internal/domain/query_test.go`:

```go
package domain_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/velosobr/passarim-bff/internal/domain"
)

func fields(t *testing.T, err error) map[string]bool {
	t.Helper()
	var ve *domain.ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("esperava ValidationError, veio %v", err)
	}
	m := map[string]bool{}
	for _, f := range ve.Fields {
		m[f.Field] = true
	}
	return m
}

func TestNewListQuery_Defaults(t *testing.T) {
	q, err := domain.NewListQuery(domain.RawListQuery{})
	if err != nil || q.Limit != 20 || q.Q != "" || q.Biome != "" || q.State != "" || q.Cursor != "" {
		t.Fatalf("padrões errados: %+v %v", q, err)
	}
}

func TestNewListQuery_Normalizes(t *testing.T) {
	q, err := domain.NewListQuery(domain.RawListQuery{Q: "  sabiá  ", State: "sp", Biome: "cerrado", Limit: "50", Cursor: "abc_-123"})
	if err != nil {
		t.Fatal(err)
	}
	if q.Q != "sabiá" || q.State != "SP" || q.Biome != domain.BiomeCerrado || q.Limit != 50 || q.Cursor != "abc_-123" {
		t.Fatalf("normalização errada: %+v", q)
	}
}

func TestNewListQuery_RejectsAndReportsAllFields(t *testing.T) {
	_, err := domain.NewListQuery(domain.RawListQuery{
		Q: strings.Repeat("a", 101), Biome: "deserto", State: "XX", Cursor: "tem espaço", Limit: "0", Repeated: []string{"state"},
	})
	got := fields(t, err)
	for _, f := range []string{"q", "biome", "state", "cursor", "limit"} {
		if !got[f] {
			t.Errorf("campo %q deveria estar no erro: %v", f, got)
		}
	}
}

func TestNewListQuery_LimitBounds(t *testing.T) {
	for _, bad := range []string{"0", "51", "-1", "abc", "1.5"} {
		if _, err := domain.NewListQuery(domain.RawListQuery{Limit: bad}); err == nil {
			t.Errorf("limit=%q deveria ser recusado (nunca ajustado em silêncio)", bad)
		}
	}
	for _, ok := range []string{"1", "20", "50"} {
		if _, err := domain.NewListQuery(domain.RawListQuery{Limit: ok}); err != nil {
			t.Errorf("limit=%q deveria passar: %v", ok, err)
		}
	}
}

func TestNewListQuery_QueryRules(t *testing.T) {
	if _, err := domain.NewListQuery(domain.RawListQuery{Q: "a\x00b"}); err == nil {
		t.Error("caractere de controle deveria ser recusado")
	}
	if _, err := domain.NewListQuery(domain.RawListQuery{Q: "\xff\xfe"}); err == nil {
		t.Error("UTF-8 inválido deveria ser recusado")
	}
	if _, err := domain.NewListQuery(domain.RawListQuery{Q: strings.Repeat("é", 100)}); err != nil {
		t.Errorf("100 runas (200 bytes) deveriam passar: %v", err)
	}
	q, err := domain.NewListQuery(domain.RawListQuery{Q: "    "})
	if err != nil || q.Q != "" {
		t.Errorf("só espaços = sem busca: %+v %v", q, err)
	}
}

func TestValidateSpeciesID(t *testing.T) {
	for _, ok := range []string{"turdus-rufiventris", "a", strings.Repeat("a", 80)} {
		if err := domain.ValidateSpeciesID(ok); err != nil {
			t.Errorf("%q deveria ser válido: %v", ok, err)
		}
	}
	for _, bad := range []string{"", "Turdus", "a_b", "a/b", "../x", strings.Repeat("a", 81), "é"} {
		if err := domain.ValidateSpeciesID(bad); err == nil {
			t.Errorf("%q deveria ser inválido", bad)
		}
	}
}
```

`internal/domain/catalog_test.go`:

```go
package domain_test

import (
	"testing"

	"github.com/velosobr/passarim-bff/internal/domain"
)

func TestParseBiome(t *testing.T) {
	for _, code := range []string{"amazonia", "mata_atlantica", "cerrado", "caatinga", "pantanal", "pampa"} {
		if b, ok := domain.ParseBiome(code); !ok || string(b) != code {
			t.Errorf("ParseBiome(%q) = %q, %v", code, b, ok)
		}
	}
	for _, bad := range []string{"", "CERRADO", "Cerrado", "deserto"} {
		if _, ok := domain.ParseBiome(bad); ok {
			t.Errorf("ParseBiome(%q) deveria falhar (códigos são exatos)", bad)
		}
	}
}

func TestNormalizeUF(t *testing.T) {
	if uf, ok := domain.NormalizeUF("sp"); !ok || uf != "SP" {
		t.Errorf("sp → %q %v", uf, ok)
	}
	if _, ok := domain.NormalizeUF("XX"); ok {
		t.Error("XX não é UF")
	}
	if len(domain.AllUFs()) != 27 {
		t.Errorf("deveria haver 27 UFs, há %d", len(domain.AllUFs()))
	}
}
```

`internal/config/config_test.go`:

```go
package config_test

import (
	"strings"
	"testing"
	"time"

	"github.com/velosobr/passarim-bff/internal/config"
)

func env(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

func required() map[string]string {
	return map[string]string{"CATALOG_ADDR": "catalog-api:50051", "REDIS_URL": "redis://redis:6379", "MEDIA_BASE_URL": "http://localhost:8888/buckets/passarim-media"}
}

func TestLoad_Defaults(t *testing.T) {
	c, err := config.Load(env(required()))
	if err != nil {
		t.Fatal(err)
	}
	if c.HTTPAddr != ":8080" || c.MetricsAddr != ":9091" || c.RequestBudget != 3*time.Second || c.CatalogAttemptTimeout != 2*time.Second ||
		c.CatalogMaxRetries != 2 || c.CacheFreshTTL != 10*time.Minute || c.CacheStaleTTL != 24*time.Hour || c.RateLimitRPS != 10 ||
		c.RateLimitBurst != 30 || c.RateLimitMaxIPs != 10000 || c.ClientIPHeader != "X-Forwarded-For" || c.RedisTimeout != 100*time.Millisecond ||
		c.ShutdownDrainDelay != 3*time.Second || c.ShutdownTimeout != 10*time.Second || c.OTelServiceName != "passarim-bff" || c.OTelEndpoint != "" {
		t.Fatalf("padrões errados: %+v", c)
	}
}

func TestLoad_MissingRequiredNamesTheVariable(t *testing.T) {
	for _, name := range []string{"CATALOG_ADDR", "REDIS_URL", "MEDIA_BASE_URL"} {
		m := required()
		delete(m, name)
		if _, err := config.Load(env(m)); err == nil || !strings.Contains(err.Error(), name) {
			t.Errorf("sem %s: o erro deveria citar o nome, veio %v", name, err)
		}
	}
}

func TestLoad_InvalidValues(t *testing.T) {
	cases := map[string]string{
		"REQUEST_BUDGET": "5s", "CATALOG_ATTEMPT_TIMEOUT": "abc", "CATALOG_MAX_RETRIES": "-1", "CACHE_FRESH_TTL": "0s",
		"RATE_LIMIT_RPS": "0", "RATE_LIMIT_BURST": "x", "TRUSTED_PROXIES": "nao-e-cidr", "MEDIA_BASE_URL": "ftp://x/y", "LOG_LEVEL": "gritando",
	}
	for name, bad := range cases {
		m := required()
		m[name] = bad
		if _, err := config.Load(env(m)); err == nil || !strings.Contains(err.Error(), name) {
			t.Errorf("%s=%q deveria falhar citando a variável: %v", name, bad, err)
		}
	}
}

func TestLoad_RetriesAcceptsZero(t *testing.T) {
	m := required()
	m["CATALOG_MAX_RETRIES"] = "0"
	if c, err := config.Load(env(m)); err != nil || c.CatalogMaxRetries != 0 {
		t.Fatalf("0 retries é válido: %+v %v", c, err)
	}
}

func TestLoad_TrustedProxiesAndTLSRules(t *testing.T) {
	m := required()
	m["TRUSTED_PROXIES"] = "172.30.0.10/32, 10.0.0.0/8"
	c, err := config.Load(env(m))
	if err != nil || len(c.TrustedProxies) != 2 {
		t.Fatalf("CIDRs: %+v %v", c.TrustedProxies, err)
	}
	m = required()
	m["CATALOG_TLS_CERT_FILE"] = "/c.pem"
	if _, err := config.Load(env(m)); err == nil || !strings.Contains(err.Error(), "CATALOG_TLS") {
		t.Errorf("certificado sem chave e sem CA deveria falhar: %v", err)
	}
	m = required()
	m["CATALOG_TLS_CA_FILE"] = "/ca.pem"
	if _, err := config.Load(env(m)); err != nil {
		t.Errorf("só a CA é válido (TLS simples): %v", err)
	}
}

// Segredos: REDIS_URL pode ter senha; o valor nunca aparece em erros.
func TestLoad_ErrorNeverContainsValues(t *testing.T) {
	m := required()
	m["REDIS_URL"] = "redis://:super-secreto@redis:6379"
	m["REQUEST_BUDGET"] = "xx"
	_, err := config.Load(env(m))
	if err == nil || strings.Contains(err.Error(), "super-secreto") {
		t.Fatalf("o erro não pode conter o valor: %v", err)
	}
}
```

- [ ] **Step 3: Ver falhar** — `go test ./internal/...` → FAIL (símbolos indefinidos / pacotes sem código).

- [ ] **Step 4: Implementar o domínio**

`internal/domain/catalog.go`:

```go
// Package domain guarda os tipos e as regras puras do BFF: nada de JSON,
// gRPC, Redis ou HTTP aqui. É a camada mais interna da arquitetura limpa.
package domain

import "sort"

// Biome é um bioma brasileiro. O valor é o MESMO código que o catalog usa
// no seu domínio e que a API REST expõe (/v1/filters e o parâmetro biome).
type Biome string

const (
	BiomeAmazonia      Biome = "amazonia"
	BiomeMataAtlantica Biome = "mata_atlantica"
	BiomeCerrado       Biome = "cerrado"
	BiomeCaatinga      Biome = "caatinga"
	BiomePantanal      Biome = "pantanal"
	BiomePampa         Biome = "pampa"
)

var validBiomes = map[Biome]bool{
	BiomeAmazonia: true, BiomeMataAtlantica: true, BiomeCerrado: true,
	BiomeCaatinga: true, BiomePantanal: true, BiomePampa: true,
}

// ParseBiome aceita só os códigos exatos (sem diferenciar nada: "Cerrado" não vale).
func ParseBiome(s string) (Biome, bool) {
	b := Biome(s)
	return b, validBiomes[b]
}

// ConservationStatus é a categoria da lista vermelha da IUCN ("" = desconhecida).
type ConservationStatus string

// As 27 unidades federativas: 26 estados + Distrito Federal.
var validUFs = map[string]bool{
	"AC": true, "AL": true, "AP": true, "AM": true, "BA": true, "CE": true, "DF": true,
	"ES": true, "GO": true, "MA": true, "MT": true, "MS": true, "MG": true, "PA": true,
	"PB": true, "PR": true, "PE": true, "PI": true, "RJ": true, "RN": true, "RS": true,
	"RO": true, "RR": true, "SC": true, "SP": true, "SE": true, "TO": true,
}

// NormalizeUF converte para maiúsculas e valida.
func NormalizeUF(s string) (string, bool) {
	up := toUpperASCII(s)
	return up, validUFs[up]
}

// AllUFs devolve as siglas em ordem alfabética.
func AllUFs() []string {
	out := make([]string, 0, len(validUFs))
	for uf := range validUFs {
		out = append(out, uf)
	}
	sort.Strings(out)
	return out
}

func toUpperASCII(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'a' && c <= 'z' {
			b[i] = c - 'a' + 'A'
		}
	}
	return string(b)
}
```

`internal/domain/species.go`:

```go
package domain

// Os tipos abaixo guardam CHAVES de mídia (como o proto), nunca URLs:
// quem monta a URL pública é o adapter HTTP (assim trocar de CDN não muda o domínio).

type Credit struct {
	Author, License, Source, SourceURL string
}

type Photo struct {
	ThumbKey, MediumKey, LargeKey string
	Width, Height                 int
	Credit                        Credit
}

type Audio struct {
	Key        string
	DurationMs int
	Credit     Credit
}

type Fact struct {
	Text, Source string
}

type Cluster struct {
	Lat, Lng  float64
	Count     int
	Precision float64
}

// Summary é a versão leve usada nos cards da lista.
type Summary struct {
	ID, ScientificName, CommonName string
	ThumbnailKey                   string // vazio = ainda sem foto
	Conservation                   ConservationStatus
}

type SpeciesPage struct {
	Items      []Summary
	NextCursor string // vazio = não há mais páginas
}

// Species é a versão completa (tela de detalhe). Ponteiros = "pode não existir".
type Species struct {
	ID, ScientificName, CommonName, Family string
	SizeCm                                 *int
	Diet                                   *string // texto livre
	Conservation                           ConservationStatus
	Description                            string
	DescriptionCredit                      Credit
	Facts                                  []Fact
	Biomes                                 []Biome
	States                                 []string
	Photos                                 []Photo
	Audio                                  *Audio
	Clusters                               []Cluster
}

type BiomeCount struct {
	Biome        Biome
	SpeciesCount int
}

type StateCount struct {
	State        string
	SpeciesCount int
}

type Filters struct {
	Biomes []BiomeCount
	States []StateCount
}
```

`internal/domain/errors.go`:

```go
package domain

import (
	"context"
	"errors"
)

// Kind classifica um erro vindo do catalog (ou do próprio BFF). A tabela
// abaixo é a ÚNICA fonte de verdade: o grpcclient traduz o código gRPC para
// um Kind, e retry, breaker, cache e HTTP só consultam estas funções.
type Kind int

const (
	KindInternal        Kind = iota // bug, resposta inesperada, Unimplemented...
	KindUnavailable                 // gRPC Unavailable
	KindTimeout                     // gRPC DeadlineExceeded (ou nosso timeout)
	KindUpstream                    // gRPC Internal/Unknown/ResourceExhausted (ex.: Postgres caiu)
	KindCircuitOpen                 // breaker aberto
	KindNotFound                    // gRPC NotFound
	KindInvalidArgument             // gRPC InvalidArgument (ou validação nossa)
	KindCanceled                    // o cliente desistiu
)

func (k Kind) String() string {
	return [...]string{"Internal", "Unavailable", "Timeout", "Upstream", "CircuitOpen", "NotFound", "InvalidArgument", "Canceled"}[k]
}

// Retryable: vale a pena tentar de novo? Só falhas passageiras.
func (k Kind) Retryable() bool { return k == KindUnavailable || k == KindTimeout }

// CountsForBreaker: conta como falha do catalog? Cliente que cancela ou pede
// uma espécie inexistente NÃO é falha do catalog (senão abriria o circuito à toa).
func (k Kind) CountsForBreaker() bool {
	return k == KindUnavailable || k == KindTimeout || k == KindUpstream
}

// AllowsStale: se o catalog falhou assim, podemos servir o dado velho do cache?
func (k Kind) AllowsStale() bool {
	return k == KindUnavailable || k == KindTimeout || k == KindUpstream || k == KindCircuitOpen
}

// Error carrega o Kind e a causa original (a causa vai SÓ para logs: nunca para a resposta HTTP).
type Error struct {
	Kind Kind
	Err  error
}

func NewError(kind Kind, err error) error { return &Error{Kind: kind, Err: err} }

func (e *Error) Error() string {
	if e.Err == nil {
		return e.Kind.String()
	}
	return e.Kind.String() + ": " + e.Err.Error()
}

func (e *Error) Unwrap() error { return e.Err }

// KindOf descobre o Kind de qualquer erro da cadeia.
func KindOf(err error) Kind {
	var de *Error
	if errors.As(err, &de) {
		return de.Kind
	}
	var ve *ValidationError
	if errors.As(err, &ve) {
		return KindInvalidArgument
	}
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		return KindTimeout
	case errors.Is(err, context.Canceled):
		return KindCanceled
	}
	return KindInternal
}
```

`internal/domain/query.go`:

```go
package domain

import (
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	DefaultLimit = 20
	MaxLimit     = 50
	maxQueryLen  = 100
	maxCursorLen = 512
	maxIDLen     = 80
)

// FieldError aponta UM parâmetro inválido (vira errors[] no problem+json).
type FieldError struct {
	Field, Reason string
}

// ValidationError reúne TODOS os problemas de uma requisição de uma vez.
type ValidationError struct {
	Fields []FieldError
}

func (e *ValidationError) Error() string { return "parâmetros inválidos" }

// RawListQuery são as strings cruas da URL (vazio = ausente). Repeated lista
// parâmetros que vieram mais de uma vez (o handler detecta; aqui só reportamos).
type RawListQuery struct {
	Q, Biome, State, Cursor, Limit string
	Repeated                       []string
}

// ListQuery é a consulta JÁ validada e normalizada. A chave de cache é calculada em cima dela.
type ListQuery struct {
	Q      string
	Biome  Biome
	State  string
	Cursor string
	Limit  int
}

// NewListQuery valida e normaliza. Devolve *ValidationError com todos os campos ruins.
func NewListQuery(raw RawListQuery) (ListQuery, error) {
	var bad []FieldError
	q := ListQuery{Limit: DefaultLimit}

	for _, f := range raw.Repeated {
		bad = append(bad, FieldError{f, "não pode ser repetido"})
	}

	if s := strings.TrimSpace(raw.Q); s != "" {
		switch {
		case !utf8.ValidString(s):
			bad = append(bad, FieldError{"q", "texto inválido"})
		case utf8.RuneCountInString(s) > maxQueryLen:
			bad = append(bad, FieldError{"q", "no máximo 100 caracteres"})
		case strings.IndexFunc(s, unicode.IsControl) >= 0:
			bad = append(bad, FieldError{"q", "não pode conter caracteres de controle"})
		default:
			q.Q = s
		}
	}
	if raw.Biome != "" {
		if b, ok := ParseBiome(raw.Biome); ok {
			q.Biome = b
		} else {
			bad = append(bad, FieldError{"biome", "bioma desconhecido"})
		}
	}
	if raw.State != "" {
		if uf, ok := NormalizeUF(raw.State); ok {
			q.State = uf
		} else {
			bad = append(bad, FieldError{"state", "UF desconhecida"})
		}
	}
	if raw.Cursor != "" {
		if validCursor(raw.Cursor) {
			q.Cursor = raw.Cursor
		} else {
			bad = append(bad, FieldError{"cursor", "cursor inválido"})
		}
	}
	if raw.Limit != "" {
		n, err := strconv.Atoi(raw.Limit)
		if err != nil || n < 1 || n > MaxLimit {
			bad = append(bad, FieldError{"limit", "deve ser um inteiro entre 1 e 50"})
		} else {
			q.Limit = n
		}
	}
	if len(bad) > 0 {
		return ListQuery{}, &ValidationError{Fields: bad}
	}
	return q, nil
}

// O cursor é opaco para nós, mas vem do cliente: só repassamos se parecer base64url curto.
func validCursor(s string) bool {
	if len(s) > maxCursorLen {
		return false
	}
	for _, c := range s {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_' || c == '-') {
			return false
		}
	}
	return true
}

// ValidateSpeciesID aceita só ^[a-z0-9-]{1,80}$.
func ValidateSpeciesID(id string) error {
	if id == "" || len(id) > maxIDLen {
		return &ValidationError{Fields: []FieldError{{"id", "identificador inválido"}}}
	}
	for _, c := range id {
		if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-') {
			return &ValidationError{Fields: []FieldError{{"id", "identificador inválido"}}}
		}
	}
	return nil
}
```

`internal/usecase/catalog.go`:

```go
// Package usecase contém os casos de uso do BFF e a PORTA que eles usam para
// falar com o catalog. Só regras e interfaces: gRPC, Redis e HTTP ficam nos adapters.
package usecase

import (
	"context"

	"github.com/velosobr/passarim-bff/internal/domain"
)

// CatalogReader é tudo o que o BFF precisa do catalog. Quem implementa:
// o cliente gRPC e cada decorator (retry, breaker, cache), todos com a MESMA interface.
type CatalogReader interface {
	ListSpecies(ctx context.Context, q domain.ListQuery) (domain.SpeciesPage, error)
	GetSpecies(ctx context.Context, id string) (domain.Species, error)
	ListFilters(ctx context.Context) (domain.Filters, error)
}
```

`internal/config/config.go`:

```go
// Package config lê a configuração das variáveis de ambiente (12-factor).
// Os erros citam o NOME da variável, nunca o valor: REDIS_URL pode ter senha.
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	HTTPAddr, MetricsAddr string

	CatalogAddr                                   string
	CatalogTLSCAFile, CatalogTLSCertFile          string
	CatalogTLSKeyFile, CatalogTLSServerName       string
	RedisURL                                      string
	RedisTimeout                                  time.Duration
	MediaBaseURL                                  string
	RequestBudget, CatalogAttemptTimeout          time.Duration
	CatalogMaxRetries                             int
	CacheFreshTTL, CacheStaleTTL                  time.Duration
	RateLimitRPS                                  float64
	RateLimitBurst, RateLimitMaxIPs               int
	TrustedProxies                                []netip.Prefix
	ClientIPHeader                                string
	ShutdownDrainDelay, ShutdownTimeout           time.Duration
	LogLevel                                      slog.Level
	OTelEndpoint, OTelServiceName                 string
}

// writeTimeout é o WriteTimeout fixo do servidor (Task 8); o orçamento + 1 s de margem precisa caber nele.
const writeTimeout = 5 * time.Second

// Load recebe getenv (e não chama os.Getenv) para os testes passarem um ambiente falso.
func Load(getenv func(string) string) (Config, error) {
	c := Config{
		HTTPAddr:             or(getenv("HTTP_ADDR"), ":8080"),
		MetricsAddr:          or(getenv("METRICS_ADDR"), ":9091"),
		CatalogAddr:          getenv("CATALOG_ADDR"),
		CatalogTLSCAFile:     getenv("CATALOG_TLS_CA_FILE"),
		CatalogTLSCertFile:   getenv("CATALOG_TLS_CERT_FILE"),
		CatalogTLSKeyFile:    getenv("CATALOG_TLS_KEY_FILE"),
		CatalogTLSServerName: getenv("CATALOG_TLS_SERVER_NAME"),
		RedisURL:             getenv("REDIS_URL"),
		MediaBaseURL:         getenv("MEDIA_BASE_URL"),
		ClientIPHeader:       or(getenv("CLIENT_IP_HEADER"), "X-Forwarded-For"),
		OTelEndpoint:         getenv("OTEL_EXPORTER_OTLP_ENDPOINT"),
		OTelServiceName:      or(getenv("OTEL_SERVICE_NAME"), "passarim-bff"),
	}
	for name, v := range map[string]string{"CATALOG_ADDR": c.CatalogAddr, "REDIS_URL": c.RedisURL, "MEDIA_BASE_URL": c.MediaBaseURL} {
		if v == "" {
			return c, errors.New(name + " é obrigatória")
		}
	}
	var err error
	if c.RedisTimeout, err = dur(getenv, "REDIS_TIMEOUT", 100*time.Millisecond); err != nil {
		return c, err
	}
	if c.RequestBudget, err = dur(getenv, "REQUEST_BUDGET", 3*time.Second); err != nil {
		return c, err
	}
	if c.RequestBudget+time.Second > writeTimeout {
		return c, errors.New("REQUEST_BUDGET: precisa ser no máximo 4s (WriteTimeout é 5s)")
	}
	if c.CatalogAttemptTimeout, err = dur(getenv, "CATALOG_ATTEMPT_TIMEOUT", 2*time.Second); err != nil {
		return c, err
	}
	if c.CacheFreshTTL, err = dur(getenv, "CACHE_FRESH_TTL", 10*time.Minute); err != nil {
		return c, err
	}
	if c.CacheStaleTTL, err = dur(getenv, "CACHE_STALE_TTL", 24*time.Hour); err != nil {
		return c, err
	}
	if c.ShutdownDrainDelay, err = dur(getenv, "SHUTDOWN_DRAIN_DELAY", 3*time.Second); err != nil {
		return c, err
	}
	if c.ShutdownTimeout, err = dur(getenv, "SHUTDOWN_TIMEOUT", 10*time.Second); err != nil {
		return c, err
	}
	if c.CatalogMaxRetries, err = integer(getenv, "CATALOG_MAX_RETRIES", 2, 0); err != nil {
		return c, err
	}
	if c.RateLimitBurst, err = integer(getenv, "RATE_LIMIT_BURST", 30, 1); err != nil {
		return c, err
	}
	if c.RateLimitMaxIPs, err = integer(getenv, "RATE_LIMIT_MAX_IPS", 10000, 1); err != nil {
		return c, err
	}
	if v := getenv("RATE_LIMIT_RPS"); v == "" {
		c.RateLimitRPS = 10
	} else if c.RateLimitRPS, err = strconv.ParseFloat(v, 64); err != nil || c.RateLimitRPS <= 0 {
		return c, errors.New("RATE_LIMIT_RPS: esperava um número positivo")
	}
	if c.TrustedProxies, err = prefixes(getenv("TRUSTED_PROXIES")); err != nil {
		return c, err
	}
	if u, perr := url.Parse(c.MediaBaseURL); perr != nil || !u.IsAbs() || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return c, errors.New("MEDIA_BASE_URL: esperava uma URL absoluta http ou https")
	}
	if v := getenv("LOG_LEVEL"); v != "" {
		if err := c.LogLevel.UnmarshalText([]byte(v)); err != nil {
			return c, errors.New("LOG_LEVEL: esperava debug, info, warn ou error")
		}
	}
	// TLS: cert e chave andam juntos, e só fazem sentido com a CA.
	if (c.CatalogTLSCertFile == "") != (c.CatalogTLSKeyFile == "") {
		return c, errors.New("CATALOG_TLS_CERT_FILE e CATALOG_TLS_KEY_FILE devem ser definidos juntos")
	}
	if c.CatalogTLSCertFile != "" && c.CatalogTLSCAFile == "" {
		return c, errors.New("CATALOG_TLS_CERT_FILE exige CATALOG_TLS_CA_FILE")
	}
	return c, nil
}

func or(v, def string) string {
	if v == "" {
		return def
	}
	return v
}

func dur(getenv func(string) string, key string, def time.Duration) (time.Duration, error) {
	v := getenv(key)
	if v == "" {
		return def, nil
	}
	d, err := time.ParseDuration(v)
	if err != nil || d <= 0 {
		return 0, fmt.Errorf("%s: esperava uma duração positiva, ex.: 3s", key)
	}
	return d, nil
}

func integer(getenv func(string) string, key string, def, min int) (int, error) {
	v := getenv(key)
	if v == "" {
		return def, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < min {
		return 0, fmt.Errorf("%s: esperava um inteiro >= %d", key, min)
	}
	return n, nil
}

func prefixes(v string) ([]netip.Prefix, error) {
	var out []netip.Prefix
	for _, part := range strings.Split(v, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		p, err := netip.ParsePrefix(part)
		if err != nil {
			return nil, errors.New("TRUSTED_PROXIES: CIDR inválido (ex.: 172.30.0.10/32)")
		}
		out = append(out, p.Masked())
	}
	return out, nil
}
```

- [ ] **Step 5: Ver passar** — `go mod tidy && go test -race ./internal/... && gofmt -l . && golangci-lint run`. Expected: tudo ok, 0 issues (se o `misspell` reclamar de palavra portuguesa legítima, acrescente-a em `ignore-rules` do `.golangci.yml`, como no catalog).
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: esqueleto do BFF, config, domínio e porta CatalogReader"` (e `git push -u origin main` se autorizado).

---

### Task 2: Casos de uso (validação e orçamento de tempo)

**Files:** `internal/usecase/list_species.go`, `get_species.go`, `list_filters.go`, `usecase_test.go`

**Interfaces (Consumes):** `usecase.CatalogReader`, `domain.NewListQuery`, `domain.ValidateSpeciesID`.
**Interfaces (Produces):**
- `usecase.ListSpecies{Catalog CatalogReader; Budget time.Duration}` com `Run(ctx, domain.RawListQuery) (domain.SpeciesPage, error)`
- `usecase.GetSpecies{Catalog CatalogReader; Budget time.Duration}` com `Run(ctx, id string) (domain.Species, error)`
- `usecase.ListFilters{Catalog CatalogReader; Budget time.Duration}` com `Run(ctx) (domain.Filters, error)`

- [ ] **Step 1: Teste que falha** — `internal/usecase/usecase_test.go`:

```go
package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/velosobr/passarim-bff/internal/domain"
	"github.com/velosobr/passarim-bff/internal/usecase"
)

// fakeCatalog guarda o que recebeu para o teste conferir.
type fakeCatalog struct {
	calls       int
	lastQuery   domain.ListQuery
	lastID      string
	deadline    time.Time
	hasDeadline bool
	err         error
}

func (f *fakeCatalog) note(ctx context.Context) {
	f.calls++
	f.deadline, f.hasDeadline = ctx.Deadline()
}

func (f *fakeCatalog) ListSpecies(ctx context.Context, q domain.ListQuery) (domain.SpeciesPage, error) {
	f.note(ctx)
	f.lastQuery = q
	return domain.SpeciesPage{NextCursor: "n"}, f.err
}

func (f *fakeCatalog) GetSpecies(ctx context.Context, id string) (domain.Species, error) {
	f.note(ctx)
	f.lastID = id
	return domain.Species{ID: id}, f.err
}

func (f *fakeCatalog) ListFilters(ctx context.Context) (domain.Filters, error) {
	f.note(ctx)
	return domain.Filters{}, f.err
}

func TestListSpecies_ValidatesBeforeCalling(t *testing.T) {
	f := &fakeCatalog{}
	uc := usecase.ListSpecies{Catalog: f, Budget: time.Second}
	_, err := uc.Run(context.Background(), domain.RawListQuery{Limit: "999"})
	if domain.KindOf(err) != domain.KindInvalidArgument || f.calls != 0 {
		t.Fatalf("validação deveria barrar antes do catalog: err=%v calls=%d", err, f.calls)
	}
}

func TestListSpecies_PassesNormalizedQueryAndAppliesBudget(t *testing.T) {
	f := &fakeCatalog{}
	uc := usecase.ListSpecies{Catalog: f, Budget: 3 * time.Second}
	page, err := uc.Run(context.Background(), domain.RawListQuery{State: "sp", Limit: "10"})
	if err != nil || page.NextCursor != "n" {
		t.Fatalf("got %+v %v", page, err)
	}
	if f.lastQuery.State != "SP" || f.lastQuery.Limit != 10 {
		t.Fatalf("a consulta deveria chegar normalizada: %+v", f.lastQuery)
	}
	if !f.hasDeadline || time.Until(f.deadline) > 3*time.Second || time.Until(f.deadline) < 2*time.Second {
		t.Fatalf("o orçamento de 3s deveria estar no contexto: %v %v", f.hasDeadline, time.Until(f.deadline))
	}
}

func TestGetSpecies_ValidatesIDAndAppliesBudget(t *testing.T) {
	f := &fakeCatalog{}
	uc := usecase.GetSpecies{Catalog: f, Budget: time.Second}
	if _, err := uc.Run(context.Background(), "../etc/passwd"); domain.KindOf(err) != domain.KindInvalidArgument || f.calls != 0 {
		t.Fatalf("id inválido não pode chegar ao catalog: %v calls=%d", err, f.calls)
	}
	s, err := uc.Run(context.Background(), "turdus-rufiventris")
	if err != nil || s.ID != "turdus-rufiventris" || !f.hasDeadline {
		t.Fatalf("got %+v %v deadline=%v", s, err, f.hasDeadline)
	}
}

func TestListFilters_AppliesBudgetAndPropagatesErrors(t *testing.T) {
	f := &fakeCatalog{err: domain.NewError(domain.KindUnavailable, errors.New("x"))}
	uc := usecase.ListFilters{Catalog: f, Budget: time.Second}
	if _, err := uc.Run(context.Background()); domain.KindOf(err) != domain.KindUnavailable || !f.hasDeadline {
		t.Fatalf("o erro do catalog deve passar intacto e com orçamento: %v", err)
	}
}

func TestBudgetDoesNotExtendAnEarlierDeadline(t *testing.T) {
	f := &fakeCatalog{}
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	_, _ = usecase.GetSpecies{Catalog: f, Budget: 3 * time.Second}.Run(ctx, "a")
	if time.Until(f.deadline) > 600*time.Millisecond {
		t.Fatal("o orçamento nunca pode ESTENDER o prazo que o chamador já tinha")
	}
}
```

- [ ] **Step 2: Ver falhar** — `go test ./internal/usecase/` → FAIL (tipos indefinidos).

- [ ] **Step 3: Implementar**

`internal/usecase/list_species.go`:

```go
package usecase

import (
	"context"
	"time"

	"github.com/velosobr/passarim-bff/internal/domain"
)

// ListSpecies valida os parâmetros (domain) ANTES de gastar uma chamada ao
// catalog e aplica o orçamento total de tempo da requisição. A cadeia de
// resiliência (cache, breaker, retry) fica atrás da porta Catalog.
type ListSpecies struct {
	Catalog CatalogReader
	Budget  time.Duration
}

func (u ListSpecies) Run(ctx context.Context, raw domain.RawListQuery) (domain.SpeciesPage, error) {
	q, err := domain.NewListQuery(raw)
	if err != nil {
		return domain.SpeciesPage{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, u.Budget) // nunca estende um prazo anterior, só encurta
	defer cancel()
	return u.Catalog.ListSpecies(ctx, q)
}
```

`internal/usecase/get_species.go`:

```go
package usecase

import (
	"context"
	"time"

	"github.com/velosobr/passarim-bff/internal/domain"
)

type GetSpecies struct {
	Catalog CatalogReader
	Budget  time.Duration
}

func (u GetSpecies) Run(ctx context.Context, id string) (domain.Species, error) {
	if err := domain.ValidateSpeciesID(id); err != nil {
		return domain.Species{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, u.Budget)
	defer cancel()
	return u.Catalog.GetSpecies(ctx, id)
}
```

`internal/usecase/list_filters.go`:

```go
package usecase

import (
	"context"
	"time"

	"github.com/velosobr/passarim-bff/internal/domain"
)

type ListFilters struct {
	Catalog CatalogReader
	Budget  time.Duration
}

func (u ListFilters) Run(ctx context.Context) (domain.Filters, error) {
	ctx, cancel := context.WithTimeout(ctx, u.Budget)
	defer cancel()
	return u.Catalog.ListFilters(ctx)
}
```

- [ ] **Step 4: Ver passar** — `go test -race ./internal/usecase/ && golangci-lint run` → ok.
- [ ] **Step 5: Commit** — `git commit -am "feat: casos de uso com validação e orçamento de tempo"`

---

### Task 3: `reqmeta` e o cliente gRPC (`grpcclient`)

**Files:** `internal/adapter/reqmeta/reqmeta.go` + `_test.go`; `internal/adapter/grpcclient/{client,mapping,tls}.go` + `client_test.go`

**Interfaces (Consumes):** `usecase.CatalogReader`, `domain.*`, `domain.NewError`, `domain.KindOf`, e o pacote gerado `catalogv1 "github.com/velosobr/passarim-proto/gen/go/passarim/catalog/v1"` (`go get github.com/velosobr/passarim-proto@v0.2.1`).
**Interfaces (Produces):**
- `reqmeta.Meta` (dados mutáveis de UMA requisição): `reqmeta.New(requestID string) *Meta`, `(*Meta).RequestID() string`, `(*Meta).SetCache(result string)`, `(*Meta).Cache() string`; `reqmeta.With(ctx, *Meta) context.Context`; `reqmeta.From(ctx) *Meta` (nunca nil: sem registro no contexto devolve um `Meta` descartável); `reqmeta.RequestID(ctx) string`.
- `grpcclient.TLS{CAFile, CertFile, KeyFile, ServerName string}`; `grpcclient.Config{Addr string; TLS TLS; Logger *slog.Logger}`; `grpcclient.New(cfg Config, extra ...grpc.DialOption) (*Client, error)`; `(*Client)` implementa `usecase.CatalogReader`; `(*Client).Close() error`; `(*Client).Conn() *grpc.ClientConn` (usado pela métrica de conexão na Task 8).

- [ ] **Step 1: Testes que falham**

`internal/adapter/reqmeta/reqmeta_test.go`:

```go
package reqmeta_test

import (
	"context"
	"sync"
	"testing"

	"github.com/velosobr/passarim-bff/internal/adapter/reqmeta"
)

func TestMetaRoundTrip(t *testing.T) {
	m := reqmeta.New("abc")
	ctx := reqmeta.With(context.Background(), m)
	if reqmeta.RequestID(ctx) != "abc" {
		t.Fatal("request id perdido")
	}
	reqmeta.From(ctx).SetCache("stale")
	if m.Cache() != "stale" {
		t.Fatal("o registro é compartilhado: quem escreve no contexto escreve no mesmo Meta")
	}
}

func TestFromWithoutMetaIsSafe(t *testing.T) {
	m := reqmeta.From(context.Background())
	m.SetCache("hit") // não pode dar panic
	if reqmeta.RequestID(context.Background()) != "" {
		t.Fatal("sem Meta, o request id é vazio")
	}
}

func TestMetaIsConcurrencySafe(t *testing.T) {
	m := reqmeta.New("x")
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); m.SetCache("miss"); _ = m.Cache() }()
	}
	wg.Wait() // rodando com -race, qualquer corrida falha o teste
}
```

`internal/adapter/grpcclient/client_test.go`:

```go
package grpcclient_test

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"

	catalogv1 "github.com/velosobr/passarim-proto/gen/go/passarim/catalog/v1"

	"github.com/velosobr/passarim-bff/internal/adapter/grpcclient"
	"github.com/velosobr/passarim-bff/internal/adapter/reqmeta"
	"github.com/velosobr/passarim-bff/internal/domain"
)

// fakeServer é um catalog de mentira: cada teste configura o que ele responde.
type fakeServer struct {
	catalogv1.UnimplementedCatalogServiceServer
	list     func(*catalogv1.ListSpeciesRequest) (*catalogv1.ListSpeciesResponse, error)
	get      func(*catalogv1.GetSpeciesRequest) (*catalogv1.GetSpeciesResponse, error)
	filters  func() (*catalogv1.ListFiltersResponse, error)
	calls    atomic.Int32
	lastMD   metadata.MD
}

func (f *fakeServer) ListSpecies(ctx context.Context, r *catalogv1.ListSpeciesRequest) (*catalogv1.ListSpeciesResponse, error) {
	f.calls.Add(1)
	f.lastMD, _ = metadata.FromIncomingContext(ctx)
	return f.list(r)
}

func (f *fakeServer) GetSpecies(ctx context.Context, r *catalogv1.GetSpeciesRequest) (*catalogv1.GetSpeciesResponse, error) {
	f.calls.Add(1)
	f.lastMD, _ = metadata.FromIncomingContext(ctx)
	return f.get(r)
}

func (f *fakeServer) ListFilters(ctx context.Context, _ *catalogv1.ListFiltersRequest) (*catalogv1.ListFiltersResponse, error) {
	f.calls.Add(1)
	return f.filters()
}

// start sobe o servidor em memória (bufconn: sem rede de verdade) e devolve o cliente do BFF.
func start(t *testing.T, srv *fakeServer) *grpcclient.Client {
	t.Helper()
	lis := bufconn.Listen(1 << 20)
	gs := grpc.NewServer()
	catalogv1.RegisterCatalogServiceServer(gs, srv)
	go func() { _ = gs.Serve(lis) }()
	t.Cleanup(gs.Stop)
	c, err := grpcclient.New(grpcclient.Config{Addr: "passthrough:///bufnet", Logger: slog.New(slog.DiscardHandler)},
		grpc.WithContextDialer(func(context.Context, string) (net.Conn, error) { return lis.Dial() }))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.Close() })
	return c
}

func TestGetSpecies_MapsProtoToDomain(t *testing.T) {
	size, diet := int32(23), "Frutos e insetos"
	srv := &fakeServer{get: func(r *catalogv1.GetSpeciesRequest) (*catalogv1.GetSpeciesResponse, error) {
		return &catalogv1.GetSpeciesResponse{Species: &catalogv1.Species{
			Id: r.GetId(), ScientificName: "Turdus rufiventris", CommonNamePt: "Sabiá-laranjeira", Family: "Turdidae",
			SizeCm: &size, Diet: &diet, ConservationStatus: catalogv1.ConservationStatus_CONSERVATION_STATUS_LC,
			Description: "d", DescriptionCredit: &catalogv1.Credit{Author: "a", License: "CC-BY", Source: "curated", SourceUrl: "https://x"},
			Facts:  []*catalogv1.Fact{{Text: "t", Source: "s"}},
			Biomes: []catalogv1.Biome{catalogv1.Biome_BIOME_MATA_ATLANTICA, catalogv1.Biome_BIOME_UNSPECIFIED, catalogv1.Biome(99)},
			States: []string{"SP", "xx", "RJ"},
			Photos: []*catalogv1.Photo{{ThumbKey: "t", MediumKey: "m", LargeKey: "l", Width: 1600, Height: 900, Credit: &catalogv1.Credit{Author: "p"}}},
			Audio:  &catalogv1.Audio{Key: "audio-1.aac", DurationMs: 21500, Credit: &catalogv1.Credit{Author: "z"}},
			Clusters: []*catalogv1.OccurrenceCluster{{Lat: -23.5, Lng: -46.6, Count: 4, Precision: 0.5}},
		}}, nil
	}}
	c := start(t, srv)
	s, err := c.GetSpecies(context.Background(), "turdus-rufiventris")
	if err != nil {
		t.Fatal(err)
	}
	if s.CommonName != "Sabiá-laranjeira" || s.Conservation != "LC" || *s.SizeCm != 23 || *s.Diet != "Frutos e insetos" {
		t.Fatalf("campos básicos: %+v", s)
	}
	if len(s.Biomes) != 1 || s.Biomes[0] != domain.BiomeMataAtlantica {
		t.Fatalf("biomas desconhecidos/UNSPECIFIED deveriam ser descartados: %v", s.Biomes)
	}
	if len(s.States) != 2 || s.States[0] != "SP" || s.States[1] != "RJ" {
		t.Fatalf("UF desconhecida deveria ser descartada: %v", s.States)
	}
	if len(s.Photos) != 1 || s.Photos[0].LargeKey != "l" || s.Audio == nil || s.Audio.Key != "audio-1.aac" || len(s.Clusters) != 1 || s.Clusters[0].Count != 4 {
		t.Fatalf("mídia e clusters: %+v", s)
	}
}

func TestGetSpecies_UnspecifiedConservationIsEmpty_AudioMissingIsNil(t *testing.T) {
	srv := &fakeServer{get: func(*catalogv1.GetSpeciesRequest) (*catalogv1.GetSpeciesResponse, error) {
		return &catalogv1.GetSpeciesResponse{Species: &catalogv1.Species{Id: "x", Audio: &catalogv1.Audio{Key: ""}}}, nil
	}}
	s, err := start(t, srv).GetSpecies(context.Background(), "x")
	if err != nil || s.Conservation != "" || s.Audio != nil || s.SizeCm != nil || s.Diet != nil {
		t.Fatalf("got %+v %v", s, err)
	}
}

func TestGetSpecies_EmptyResponseIsInternal(t *testing.T) {
	srv := &fakeServer{get: func(*catalogv1.GetSpeciesRequest) (*catalogv1.GetSpeciesResponse, error) {
		return &catalogv1.GetSpeciesResponse{}, nil // sem species: resposta inesperada
	}}
	_, err := start(t, srv).GetSpecies(context.Background(), "x")
	if domain.KindOf(err) != domain.KindInternal {
		t.Fatalf("esperava Internal, veio %v", err)
	}
}

func TestListSpecies_TranslatesRequestAndResponse(t *testing.T) {
	var got *catalogv1.ListSpeciesRequest
	srv := &fakeServer{list: func(r *catalogv1.ListSpeciesRequest) (*catalogv1.ListSpeciesResponse, error) {
		got = r
		return &catalogv1.ListSpeciesResponse{
			Species: []*catalogv1.SpeciesSummary{
				{Id: "a", ScientificName: "A a", CommonNamePt: "A", ThumbnailKey: "k", ConservationStatus: catalogv1.ConservationStatus_CONSERVATION_STATUS_VU},
				{Id: "b"},
			},
			NextPageToken: "tok",
		}, nil
	}}
	page, err := start(t, srv).ListSpecies(context.Background(), domain.ListQuery{Q: "sabia", Biome: domain.BiomeCerrado, State: "SP", Cursor: "c", Limit: 7})
	if err != nil {
		t.Fatal(err)
	}
	if got.GetQuery() != "sabia" || got.GetBiome() != catalogv1.Biome_BIOME_CERRADO || got.GetState() != "SP" || got.GetPageSize() != 7 || got.GetPageToken() != "c" {
		t.Fatalf("pedido ao catalog: %v", got)
	}
	if len(page.Items) != 2 || page.NextCursor != "tok" || page.Items[0].Conservation != "VU" || page.Items[0].ThumbnailKey != "k" || page.Items[1].Conservation != "" {
		t.Fatalf("resposta: %+v", page)
	}
}

func TestListFilters_DropsUnknownBiomeAndState(t *testing.T) {
	srv := &fakeServer{filters: func() (*catalogv1.ListFiltersResponse, error) {
		return &catalogv1.ListFiltersResponse{
			Biomes: []*catalogv1.BiomeCount{{Biome: catalogv1.Biome_BIOME_PAMPA, SpeciesCount: 3}, {Biome: catalogv1.Biome_BIOME_UNSPECIFIED, SpeciesCount: 9}},
			States: []*catalogv1.StateCount{{State: "RS", SpeciesCount: 5}, {State: "ZZ", SpeciesCount: 1}},
		}, nil
	}}
	f, err := start(t, srv).ListFilters(context.Background())
	if err != nil || len(f.Biomes) != 1 || f.Biomes[0].Biome != domain.BiomePampa || f.Biomes[0].SpeciesCount != 3 || len(f.States) != 1 || f.States[0].State != "RS" {
		t.Fatalf("got %+v %v", f, err)
	}
}

// Cada código gRPC cai num Kind da tabela única (spec §5.3).
func TestErrorCodesMapToKinds(t *testing.T) {
	cases := map[codes.Code]domain.Kind{
		codes.Unavailable: domain.KindUnavailable, codes.DeadlineExceeded: domain.KindTimeout,
		codes.Internal: domain.KindUpstream, codes.Unknown: domain.KindUpstream, codes.ResourceExhausted: domain.KindUpstream,
		codes.NotFound: domain.KindNotFound, codes.InvalidArgument: domain.KindInvalidArgument, codes.Canceled: domain.KindCanceled,
		codes.Unimplemented: domain.KindInternal, codes.PermissionDenied: domain.KindInternal, codes.FailedPrecondition: domain.KindInternal,
	}
	for code, want := range cases {
		srv := &fakeServer{get: func(*catalogv1.GetSpeciesRequest) (*catalogv1.GetSpeciesResponse, error) {
			return nil, status.Error(code, "mensagem-interna-do-catalog")
		}}
		_, err := start(t, srv).GetSpecies(context.Background(), "x")
		if got := domain.KindOf(err); got != want {
			t.Errorf("%s → %s, esperado %s", code, got, want)
		}
	}
}

func TestSendsRequestIDMetadata(t *testing.T) {
	srv := &fakeServer{get: func(*catalogv1.GetSpeciesRequest) (*catalogv1.GetSpeciesResponse, error) {
		return &catalogv1.GetSpeciesResponse{Species: &catalogv1.Species{Id: "x"}}, nil
	}}
	c := start(t, srv)
	ctx := reqmeta.With(context.Background(), reqmeta.New("req-123"))
	if _, err := c.GetSpecies(ctx, "x"); err != nil {
		t.Fatal(err)
	}
	if v := srv.lastMD.Get("x-request-id"); len(v) != 1 || v[0] != "req-123" {
		t.Fatalf("metadado x-request-id: %v", v)
	}
}

// grpc.WithDisableRetry: o único retry do BFF é o nosso (camada resilience).
func TestDoesNotRetryByItself(t *testing.T) {
	srv := &fakeServer{get: func(*catalogv1.GetSpeciesRequest) (*catalogv1.GetSpeciesResponse, error) {
		return nil, status.Error(codes.Unavailable, "x")
	}}
	_, _ = start(t, srv).GetSpecies(context.Background(), "x")
	if srv.calls.Load() != 1 {
		t.Fatalf("esperava 1 chamada, houve %d", srv.calls.Load())
	}
}

func TestTLSConfigErrors(t *testing.T) {
	dir := t.TempDir()
	bad := filepath.Join(dir, "ca.pem")
	if err := os.WriteFile(bad, []byte("isto não é um certificado"), 0o600); err != nil {
		t.Fatal(err)
	}
	for name, tls := range map[string]grpcclient.TLS{
		"CA inexistente": {CAFile: filepath.Join(dir, "nao-existe.pem")},
		"CA inválida":    {CAFile: bad},
		"cert sem chave": {CAFile: bad, CertFile: bad, KeyFile: bad},
	} {
		if _, err := grpcclient.New(grpcclient.Config{Addr: "localhost:1", TLS: tls}); err == nil {
			t.Errorf("%s: deveria falhar", name)
		}
	}
	// Sem TLS configurado, sobe "insecure" (rede privada local) e não conecta de verdade até a 1ª chamada.
	c, err := grpcclient.New(grpcclient.Config{Addr: "localhost:1"})
	if err != nil {
		t.Fatalf("sem TLS deveria criar o cliente: %v", err)
	}
	_ = c.Close()
	if errors.Is(err, context.Canceled) {
		t.Fatal("inesperado")
	}
}
```

- [ ] **Step 2: Ver falhar** — `go test ./internal/adapter/...` → FAIL (pacotes sem código / símbolos indefinidos).

- [ ] **Step 3: Implementar**

`internal/adapter/reqmeta/reqmeta.go`:

```go
// Package reqmeta guarda, no contexto, os dados de UMA requisição que várias
// camadas precisam compartilhar: o request_id (para os logs) e o resultado do
// cache (para o cabeçalho X-Cache e o log de acesso). É um registro MUTÁVEL:
// o handler cria, o decorator de cache escreve, o handler lê depois.
package reqmeta

import (
	"context"
	"sync"
)

type Meta struct {
	mu        sync.Mutex
	requestID string
	cache     string
}

func New(requestID string) *Meta { return &Meta{requestID: requestID} }

func (m *Meta) RequestID() string { return m.requestID }

func (m *Meta) SetCache(result string) {
	m.mu.Lock()
	m.cache = result
	m.mu.Unlock()
}

func (m *Meta) Cache() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.cache
}

type ctxKey struct{}

func With(ctx context.Context, m *Meta) context.Context { return context.WithValue(ctx, ctxKey{}, m) }

// From nunca devolve nil: sem registro no contexto, devolve um descartável
// (assim os decorators não precisam checar nil em cada uso).
func From(ctx context.Context) *Meta {
	if m, ok := ctx.Value(ctxKey{}).(*Meta); ok {
		return m
	}
	return &Meta{}
}

func RequestID(ctx context.Context) string { return From(ctx).requestID }
```

`internal/adapter/grpcclient/tls.go`:

```go
package grpcclient

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
	"os"

	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
)

// TLS: sem CAFile o cliente usa "insecure" (catalog na rede privada local).
// Com CAFile liga TLS; com CertFile+KeyFile também apresenta certificado de
// cliente (a base do mTLS, que será ligado na Etapa 4).
type TLS struct {
	CAFile, CertFile, KeyFile, ServerName string
}

func (t TLS) credentials() (credentials.TransportCredentials, error) {
	if t.CAFile == "" {
		return insecure.NewCredentials(), nil
	}
	pem, err := os.ReadFile(t.CAFile) //nolint:gosec // caminho vem da configuração do operador
	if err != nil {
		return nil, errors.New("CATALOG_TLS_CA_FILE: não foi possível ler o arquivo")
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(pem) {
		return nil, errors.New("CATALOG_TLS_CA_FILE: nenhum certificado PEM válido")
	}
	cfg := &tls.Config{RootCAs: pool, ServerName: t.ServerName, MinVersion: tls.VersionTLS13}
	if t.CertFile != "" {
		cert, err := tls.LoadX509KeyPair(t.CertFile, t.KeyFile)
		if err != nil {
			return nil, errors.New("CATALOG_TLS_CERT_FILE/CATALOG_TLS_KEY_FILE: par de certificado inválido")
		}
		cfg.Certificates = []tls.Certificate{cert}
	}
	return credentials.NewTLS(cfg), nil
}
```

`internal/adapter/grpcclient/mapping.go`:

```go
package grpcclient

import (
	"context"
	"log/slog"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	catalogv1 "github.com/velosobr/passarim-proto/gen/go/passarim/catalog/v1"

	"github.com/velosobr/passarim-bff/internal/adapter/reqmeta"
	"github.com/velosobr/passarim-bff/internal/domain"
)

var biomeToProto = map[domain.Biome]catalogv1.Biome{
	domain.BiomeAmazonia:      catalogv1.Biome_BIOME_AMAZONIA,
	domain.BiomeMataAtlantica: catalogv1.Biome_BIOME_MATA_ATLANTICA,
	domain.BiomeCerrado:       catalogv1.Biome_BIOME_CERRADO,
	domain.BiomeCaatinga:      catalogv1.Biome_BIOME_CAATINGA,
	domain.BiomePantanal:      catalogv1.Biome_BIOME_PANTANAL,
	domain.BiomePampa:         catalogv1.Biome_BIOME_PAMPA,
}

var biomeFromProto = func() map[catalogv1.Biome]domain.Biome {
	m := make(map[catalogv1.Biome]domain.Biome, len(biomeToProto))
	for d, p := range biomeToProto {
		m[p] = d
	}
	return m
}()

var statusFromProto = map[catalogv1.ConservationStatus]domain.ConservationStatus{
	catalogv1.ConservationStatus_CONSERVATION_STATUS_LC: "LC", catalogv1.ConservationStatus_CONSERVATION_STATUS_NT: "NT",
	catalogv1.ConservationStatus_CONSERVATION_STATUS_VU: "VU", catalogv1.ConservationStatus_CONSERVATION_STATUS_EN: "EN",
	catalogv1.ConservationStatus_CONSERVATION_STATUS_CR: "CR", catalogv1.ConservationStatus_CONSERVATION_STATUS_EW: "EW",
	catalogv1.ConservationStatus_CONSERVATION_STATUS_EX: "EX", catalogv1.ConservationStatus_CONSERVATION_STATUS_DD: "DD",
}

// conservation: UNSPECIFIED (ou valor que não conhecemos) vira "" = desconhecido.
func conservation(s catalogv1.ConservationStatus) domain.ConservationStatus { return statusFromProto[s] }

func credit(c *catalogv1.Credit) domain.Credit {
	return domain.Credit{Author: c.GetAuthor(), License: c.GetLicense(), Source: c.GetSource(), SourceURL: c.GetSourceUrl()}
}

// mapper carrega o logger para avisar (com o request_id) quando descarta dado desconhecido.
type mapper struct {
	ctx context.Context
	log *slog.Logger
}

func (m mapper) warnDropped(what, value string) {
	m.log.WarnContext(m.ctx, "dado desconhecido do catalog descartado", "what", what, "value", value, "request_id", reqmeta.RequestID(m.ctx))
}

func (m mapper) biome(b catalogv1.Biome) (domain.Biome, bool) {
	d, ok := biomeFromProto[b]
	if !ok {
		m.warnDropped("biome", b.String())
	}
	return d, ok
}

func (m mapper) uf(s string) (string, bool) {
	uf, ok := domain.NormalizeUF(s)
	if !ok {
		m.warnDropped("state", s)
	}
	return uf, ok
}

func (m mapper) summary(s *catalogv1.SpeciesSummary) domain.Summary {
	return domain.Summary{ID: s.GetId(), ScientificName: s.GetScientificName(), CommonName: s.GetCommonNamePt(),
		ThumbnailKey: s.GetThumbnailKey(), Conservation: conservation(s.GetConservationStatus())}
}

func (m mapper) species(s *catalogv1.Species) domain.Species {
	out := domain.Species{
		ID: s.GetId(), ScientificName: s.GetScientificName(), CommonName: s.GetCommonNamePt(), Family: s.GetFamily(),
		Conservation: conservation(s.GetConservationStatus()), Description: s.GetDescription(),
		DescriptionCredit: credit(s.GetDescriptionCredit()),
	}
	if s.SizeCm != nil {
		v := int(*s.SizeCm)
		out.SizeCm = &v
	}
	if s.Diet != nil {
		v := *s.Diet
		out.Diet = &v
	}
	for _, f := range s.GetFacts() {
		out.Facts = append(out.Facts, domain.Fact{Text: f.GetText(), Source: f.GetSource()})
	}
	for _, b := range s.GetBiomes() {
		if d, ok := m.biome(b); ok {
			out.Biomes = append(out.Biomes, d)
		}
	}
	for _, st := range s.GetStates() {
		if uf, ok := m.uf(st); ok {
			out.States = append(out.States, uf)
		}
	}
	for _, p := range s.GetPhotos() {
		out.Photos = append(out.Photos, domain.Photo{ThumbKey: p.GetThumbKey(), MediumKey: p.GetMediumKey(), LargeKey: p.GetLargeKey(),
			Width: int(p.GetWidth()), Height: int(p.GetHeight()), Credit: credit(p.GetCredit())})
	}
	if a := s.GetAudio(); a != nil && a.GetKey() != "" { // áudio sem chave = sem áudio
		out.Audio = &domain.Audio{Key: a.GetKey(), DurationMs: int(a.GetDurationMs()), Credit: credit(a.GetCredit())}
	}
	for _, c := range s.GetClusters() {
		out.Clusters = append(out.Clusters, domain.Cluster{Lat: c.GetLat(), Lng: c.GetLng(), Count: int(c.GetCount()), Precision: c.GetPrecision()})
	}
	return out
}

// translateError converte o código gRPC no Kind da tabela única. A causa
// original fica embrulhada (vai para os logs); a mensagem do catalog NUNCA vai ao cliente.
func translateError(err error) error {
	if err == nil {
		return nil
	}
	st, ok := status.FromError(err)
	if !ok {
		return domain.NewError(domain.KindOf(err), err) // erro local (ex.: contexto)
	}
	var kind domain.Kind
	switch st.Code() {
	case codes.Unavailable:
		kind = domain.KindUnavailable
	case codes.DeadlineExceeded:
		kind = domain.KindTimeout
	case codes.Internal, codes.Unknown, codes.ResourceExhausted:
		kind = domain.KindUpstream
	case codes.NotFound:
		kind = domain.KindNotFound
	case codes.InvalidArgument:
		kind = domain.KindInvalidArgument
	case codes.Canceled:
		kind = domain.KindCanceled
	default: // Unimplemented, PermissionDenied, FailedPrecondition...: erro de versão/config, não queda
		kind = domain.KindInternal
	}
	return domain.NewError(kind, err)
}
```

`internal/adapter/grpcclient/client.go`:

```go
// Package grpcclient implementa usecase.CatalogReader falando gRPC com o
// catalog. Traduz proto → domínio e código gRPC → domain.Kind; não decide
// retry, cache nem breaker (isso é das camadas de fora).
package grpcclient

import (
	"context"
	"log/slog"

	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"

	catalogv1 "github.com/velosobr/passarim-proto/gen/go/passarim/catalog/v1"

	"github.com/velosobr/passarim-bff/internal/adapter/reqmeta"
	"github.com/velosobr/passarim-bff/internal/domain"
	"github.com/velosobr/passarim-bff/internal/usecase"
)

const requestIDHeader = "x-request-id"

type Config struct {
	Addr   string
	TLS    TLS
	Logger *slog.Logger
}

type Client struct {
	conn *grpc.ClientConn
	rpc  catalogv1.CatalogServiceClient
	log  *slog.Logger
}

var _ usecase.CatalogReader = (*Client)(nil)

// New cria a conexão (preguiçosa: o gRPC só conecta na 1ª chamada). "extra"
// permite acrescentar opções (o dialer dos testes, o tracing da Task 8).
func New(cfg Config, extra ...grpc.DialOption) (*Client, error) {
	creds, err := cfg.TLS.credentials()
	if err != nil {
		return nil, err
	}
	opts := append([]grpc.DialOption{
		grpc.WithTransportCredentials(creds),
		// O único retry do BFF é o da camada resilience; o do gRPC ficaria duplicado.
		grpc.WithDisableRetry(),
		grpc.WithChainUnaryInterceptor(requestIDInterceptor),
	}, extra...)
	conn, err := grpc.NewClient(cfg.Addr, opts...)
	if err != nil {
		return nil, err
	}
	log := cfg.Logger
	if log == nil {
		log = slog.Default()
	}
	return &Client{conn: conn, rpc: catalogv1.NewCatalogServiceClient(conn), log: log}, nil
}

func (c *Client) Close() error { return c.conn.Close() }

// Conn expõe a conexão para a métrica de estado (bff_catalog_connection_state).
func (c *Client) Conn() *grpc.ClientConn { return c.conn }

// requestIDInterceptor manda o request_id do BFF ao catalog (x-request-id),
// para seguir a mesma requisição nos logs dos dois serviços.
func requestIDInterceptor(ctx context.Context, method string, req, reply any, cc *grpc.ClientConn, invoker grpc.UnaryInvoker, opts ...grpc.CallOption) error {
	if id := reqmeta.RequestID(ctx); id != "" {
		ctx = metadata.AppendToOutgoingContext(ctx, requestIDHeader, id)
	}
	return invoker(ctx, method, req, reply, cc, opts...)
}

func (c *Client) ListSpecies(ctx context.Context, q domain.ListQuery) (domain.SpeciesPage, error) {
	req := &catalogv1.ListSpeciesRequest{Query: q.Q, State: q.State, PageSize: int32(q.Limit), PageToken: q.Cursor} //nolint:gosec // limit já validado (1..50)
	if q.Biome != "" {
		req.Biome = biomeToProto[q.Biome]
	}
	resp, err := c.rpc.ListSpecies(ctx, req)
	if err != nil {
		return domain.SpeciesPage{}, translateError(err)
	}
	m := mapper{ctx: ctx, log: c.log}
	page := domain.SpeciesPage{NextCursor: resp.GetNextPageToken(), Items: make([]domain.Summary, 0, len(resp.GetSpecies()))}
	for _, s := range resp.GetSpecies() {
		page.Items = append(page.Items, m.summary(s))
	}
	return page, nil
}

func (c *Client) GetSpecies(ctx context.Context, id string) (domain.Species, error) {
	resp, err := c.rpc.GetSpecies(ctx, &catalogv1.GetSpeciesRequest{Id: id})
	if err != nil {
		return domain.Species{}, translateError(err)
	}
	if resp.GetSpecies() == nil {
		return domain.Species{}, domain.NewError(domain.KindInternal, nil) // resposta inesperada
	}
	return mapper{ctx: ctx, log: c.log}.species(resp.GetSpecies()), nil
}

func (c *Client) ListFilters(ctx context.Context) (domain.Filters, error) {
	resp, err := c.rpc.ListFilters(ctx, &catalogv1.ListFiltersRequest{})
	if err != nil {
		return domain.Filters{}, translateError(err)
	}
	m := mapper{ctx: ctx, log: c.log}
	var f domain.Filters
	for _, b := range resp.GetBiomes() {
		if d, ok := m.biome(b.GetBiome()); ok {
			f.Biomes = append(f.Biomes, domain.BiomeCount{Biome: d, SpeciesCount: int(b.GetSpeciesCount())})
		}
	}
	for _, s := range resp.GetStates() {
		if uf, ok := m.uf(s.GetState()); ok {
			f.States = append(f.States, domain.StateCount{State: uf, SpeciesCount: int(s.GetSpeciesCount())})
		}
	}
	return f, nil
}
```

- [ ] **Step 4: Ver passar** — `go get github.com/velosobr/passarim-proto@v0.2.1 && go mod tidy && go test -race ./internal/adapter/... && golangci-lint run` → ok. (Se `slog.DiscardHandler` não existir na sua versão do Go, use `slog.New(slog.NewTextHandler(io.Discard, nil))`.)
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: cliente gRPC do catalog (mapeamento, Kind, request_id, TLS opcional)"`

---

### Task 4: Camada HTTP — rotas, DTOs, URLs de mídia e erros `problem+json`

**Files:** `internal/adapter/media/media.go` + `_test.go`; `internal/adapter/http/{handler,dto,labels,problem,errors}.go` + `handler_test.go`

**Interfaces (Consumes):** `domain.*`, `reqmeta.From/RequestID`, os tipos de caso de uso da Task 2 (via interfaces locais).
**Interfaces (Produces):**
- `media.New(base string, log *slog.Logger) (*media.Builder, error)`; `(*Builder).URL(ctx context.Context, key string) *string` (nil para chave vazia ou insegura).
- Pacote `httpadapter` (diretório `internal/adapter/http`): interfaces `SpeciesLister{Run(ctx, domain.RawListQuery) (domain.SpeciesPage, error)}`, `SpeciesGetter{Run(ctx, string) (domain.Species, error)}`, `FiltersLister{Run(ctx) (domain.Filters, error)}`; `Handler{List SpeciesLister; Get SpeciesGetter; Filters FiltersLister; Media *media.Builder; Log *slog.Logger}`; `(*Handler).Routes() http.Handler` (mux com `GET /v1/species`, `GET /v1/species/{id}`, `GET /v1/filters` e `/` → 404 `NOT_FOUND`); `WriteProblem(w http.ResponseWriter, r *http.Request, status int, code string, fields []domain.FieldError)` (exportada: os middlewares da Task 5 também a usam); constantes de código `CodeInvalidParameter`, `CodeSpeciesNotFound`, `CodeNotFound`, `CodeMethodNotAllowed`, `CodeRateLimited`, `CodeServiceUnavailable`, `CodeInternal`.

- [ ] **Step 1: Testes que falham**

`internal/adapter/media/media_test.go`:

```go
package media_test

import (
	"context"
	"log/slog"
	"testing"

	"github.com/velosobr/passarim-bff/internal/adapter/media"
)

func build(t *testing.T, base string) *media.Builder {
	t.Helper()
	b, err := media.New(base, slog.New(slog.DiscardHandler))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestMediaURL_JoinsBaseAndKey(t *testing.T) {
	const key = "species/turdus-rufiventris/photo-12345-thumb.webp"
	want := "http://localhost:8888/buckets/passarim-media/" + key
	for _, base := range []string{"http://localhost:8888/buckets/passarim-media", "http://localhost:8888/buckets/passarim-media/"} {
		if u := build(t, base).URL(context.Background(), key); u == nil || *u != want {
			t.Errorf("base %q → %v, esperado %s", base, u, want)
		}
	}
}

func TestMediaURL_EmptyKeyIsNil(t *testing.T) {
	if u := build(t, "http://x/b").URL(context.Background(), ""); u != nil {
		t.Fatalf("chave vazia deveria dar nil, veio %q", *u)
	}
}

// Review Focus #7: a chave vem do catalog, mas não confiamos cegamente.
func TestMediaURL_RejectsUnsafeKeys(t *testing.T) {
	b := build(t, "http://x/bucket")
	for _, key := range []string{"../outro-bucket/x.webp", "species/../../x", "/abs/x.webp", "species//x.webp", "species/a b.webp", "species/x.webp?x=1", "species/é.webp", "a/./b"} {
		if u := b.URL(context.Background(), key); u != nil {
			t.Errorf("chave %q deveria ser recusada, gerou %q", key, *u)
		}
	}
}

func TestNew_RejectsRelativeBase(t *testing.T) {
	if _, err := media.New("/relativo", slog.New(slog.DiscardHandler)); err == nil {
		t.Fatal("base relativa deveria falhar")
	}
}
```

`internal/adapter/http/handler_test.go`:

```go
package httpadapter_test

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	httpadapter "github.com/velosobr/passarim-bff/internal/adapter/http"
	"github.com/velosobr/passarim-bff/internal/adapter/media"
	"github.com/velosobr/passarim-bff/internal/adapter/reqmeta"
	"github.com/velosobr/passarim-bff/internal/domain"
)

// Fakes dos casos de uso: o handler só conhece as interfaces.
type fakeList struct {
	page domain.SpeciesPage
	err  error
	got  domain.RawListQuery
}

func (f *fakeList) Run(_ context.Context, raw domain.RawListQuery) (domain.SpeciesPage, error) {
	f.got = raw
	return f.page, f.err
}

type fakeGet struct {
	sp  domain.Species
	err error
}

func (f *fakeGet) Run(context.Context, string) (domain.Species, error) { return f.sp, f.err }

type fakeFilters struct {
	f   domain.Filters
	err error
}

func (f *fakeFilters) Run(context.Context) (domain.Filters, error) { return f.f, f.err }

const base = "http://localhost:8888/buckets/passarim-media"

func newHandler(t *testing.T, l *fakeList, g *fakeGet, f *fakeFilters) http.Handler {
	t.Helper()
	m, err := media.New(base, slog.New(slog.DiscardHandler))
	if err != nil {
		t.Fatal(err)
	}
	h := &httpadapter.Handler{List: l, Get: g, Filters: f, Media: m, Log: slog.New(slog.DiscardHandler)}
	return h.Routes()
}

func do(h http.Handler, method, target string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, nil)
	req = req.WithContext(reqmeta.With(req.Context(), reqmeta.New("req-1")))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatalf("JSON inválido: %v\n%s", err, rec.Body.String())
	}
	return m
}

func TestListSpecies_OK(t *testing.T) {
	l := &fakeList{page: domain.SpeciesPage{Items: []domain.Summary{
		{ID: "turdus-rufiventris", CommonName: "Sabiá-laranjeira", ScientificName: "Turdus rufiventris", ThumbnailKey: "species/turdus-rufiventris/photo-1-thumb.webp", Conservation: "LC"},
		{ID: "cariama-cristata", CommonName: "Seriema", ScientificName: "Cariama cristata"},
	}}}
	rec := do(newHandler(t, l, &fakeGet{}, &fakeFilters{}), "GET", "/v1/species?state=sp&limit=10")
	if rec.Code != 200 || rec.Header().Get("Content-Type") != "application/json; charset=utf-8" {
		t.Fatalf("status/content-type: %d %s", rec.Code, rec.Header().Get("Content-Type"))
	}
	if l.got.State != "sp" || l.got.Limit != "10" {
		t.Fatalf("o handler deve repassar as strings cruas: %+v", l.got)
	}
	body := decode(t, rec)
	items := body["items"].([]any)
	first, second := items[0].(map[string]any), items[1].(map[string]any)
	if first["thumbnailUrl"] != base+"/species/turdus-rufiventris/photo-1-thumb.webp" || first["commonName"] != "Sabiá-laranjeira" {
		t.Fatalf("primeiro item: %v", first)
	}
	if c := first["conservationStatus"].(map[string]any); c["code"] != "LC" || c["label"] != "Pouco preocupante" {
		t.Fatalf("conservação: %v", c)
	}
	if second["thumbnailUrl"] != nil || second["conservationStatus"] != nil {
		t.Fatalf("sem foto e sem status devem ser null: %v", second)
	}
	if v, ok := body["nextCursor"]; !ok || v != nil {
		t.Fatalf("nextCursor deveria ser null (e presente): %v %v", v, ok)
	}
}

func TestListSpecies_EmptyListIsArrayNotNull(t *testing.T) {
	rec := do(newHandler(t, &fakeList{}, &fakeGet{}, &fakeFilters{}), "GET", "/v1/species")
	if !strings.Contains(rec.Body.String(), `"items":[]`) {
		t.Fatalf("lista vazia deve sair como []: %s", rec.Body.String())
	}
}

func TestListSpecies_NextCursor(t *testing.T) {
	l := &fakeList{page: domain.SpeciesPage{NextCursor: "abc"}}
	if body := decode(t, do(newHandler(t, l, &fakeGet{}, &fakeFilters{}), "GET", "/v1/species")); body["nextCursor"] != "abc" {
		t.Fatalf("nextCursor: %v", body["nextCursor"])
	}
}

func TestListSpecies_RepeatedParamIsInvalid(t *testing.T) {
	l := &fakeList{}
	rec := do(newHandler(t, l, &fakeGet{}, &fakeFilters{}), "GET", "/v1/species?state=SP&state=RJ")
	if len(l.got.Repeated) != 1 || l.got.Repeated[0] != "state" {
		t.Fatalf("o handler deve informar o parâmetro repetido: %+v", l.got)
	}
	_ = rec
}

func TestInvalidParameter_400WithFields(t *testing.T) {
	l := &fakeList{err: &domain.ValidationError{Fields: []domain.FieldError{{Field: "limit", Reason: "deve ser um inteiro entre 1 e 50"}, {Field: "state", Reason: "UF desconhecida"}}}}
	rec := do(newHandler(t, l, &fakeGet{}, &fakeFilters{}), "GET", "/v1/species?limit=999&state=XX")
	if rec.Code != 400 || rec.Header().Get("Content-Type") != "application/problem+json" || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("400: %d %s %s", rec.Code, rec.Header().Get("Content-Type"), rec.Header().Get("Cache-Control"))
	}
	b := decode(t, rec)
	if b["code"] != "INVALID_PARAMETER" || b["type"] != "urn:passarim:problem:invalid-parameter" || b["requestId"] != "req-1" || b["status"].(float64) != 400 || b["title"] == "" {
		t.Fatalf("problem: %v", b)
	}
	if errs := b["errors"].([]any); len(errs) != 2 || errs[0].(map[string]any)["field"] != "limit" {
		t.Fatalf("errors[]: %v", b["errors"])
	}
}

func TestGetSpecies_FullDetail(t *testing.T) {
	size, diet := 23, "Frutos e insetos"
	g := &fakeGet{sp: domain.Species{
		ID: "turdus-rufiventris", CommonName: "Sabiá-laranjeira", ScientificName: "Turdus rufiventris", Family: "Turdidae",
		Conservation: "LC", SizeCm: &size, Diet: &diet, Description: "d",
		DescriptionCredit: domain.Credit{Author: "Passarim", License: "CC-BY-SA", Source: "curated", SourceURL: "https://pt.wikipedia.org/x"},
		Facts:             []domain.Fact{{Text: "f", Source: "s"}},
		Biomes:            []domain.Biome{domain.BiomeMataAtlantica, domain.BiomeCerrado},
		States:            []string{"SP", "RJ"},
		Photos: []domain.Photo{{ThumbKey: "species/t/photo-1-thumb.webp", MediumKey: "species/t/photo-1-medium.webp", LargeKey: "species/t/photo-1-large.webp",
			Width: 1600, Height: 1067, Credit: domain.Credit{Author: "Fulano", License: "CC-BY-NC", Source: "inaturalist", SourceURL: "https://www.inaturalist.org/photos/1"}}},
		Audio:    &domain.Audio{Key: "species/t/audio-9.aac", DurationMs: 21500, Credit: domain.Credit{Author: "Beltrano", License: "CC-BY-NC-SA", Source: "xeno-canto", SourceURL: "https://xeno-canto.org/9"}},
		Clusters: []domain.Cluster{{Lat: -23.5, Lng: -46.6, Count: 42, Precision: 0.5}},
	}}
	rec := do(newHandler(t, &fakeList{}, g, &fakeFilters{}), "GET", "/v1/species/turdus-rufiventris")
	if rec.Code != 200 {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	b := decode(t, rec)
	if b["sizeCm"].(float64) != 23 || b["diet"] != "Frutos e insetos" || b["family"] != "Turdidae" {
		t.Fatalf("campos: %v", b)
	}
	chips := b["chips"].([]any)
	if len(chips) != 2 || chips[0].(map[string]any)["label"] != "Mata Atlântica" {
		t.Fatalf("chips (biomas rotulados): %v", chips)
	}
	photo := b["photos"].([]any)[0].(map[string]any)
	if photo["largeUrl"] != base+"/species/t/photo-1-large.webp" || photo["credit"].(map[string]any)["sourceUrl"] != "https://www.inaturalist.org/photos/1" || photo["width"].(float64) != 1600 {
		t.Fatalf("foto: %v", photo)
	}
	audio := b["audio"].(map[string]any)
	if audio["url"] != base+"/species/t/audio-9.aac" || audio["durationMs"].(float64) != 21500 {
		t.Fatalf("áudio: %v", audio)
	}
	w := b["whereToFind"].(map[string]any)
	if w["biomes"].([]any)[0] != "mata_atlantica" || w["states"].([]any)[1] != "RJ" || w["clusters"].([]any)[0].(map[string]any)["count"].(float64) != 42 {
		t.Fatalf("whereToFind: %v", w)
	}
}

func TestGetSpecies_NullablesAndEmptyArrays(t *testing.T) {
	rec := do(newHandler(t, &fakeList{}, &fakeGet{sp: domain.Species{ID: "x"}}, &fakeFilters{}), "GET", "/v1/species/x")
	b := decode(t, rec)
	for _, k := range []string{"sizeCm", "diet", "audio", "conservationStatus"} {
		if v, ok := b[k]; !ok || v != nil {
			t.Errorf("%s deveria estar presente e null: %v %v", k, v, ok)
		}
	}
	for _, k := range []string{"facts", "chips", "photos"} {
		if arr, ok := b[k].([]any); !ok || len(arr) != 0 {
			t.Errorf("%s deveria ser []: %v", k, b[k])
		}
	}
	w := b["whereToFind"].(map[string]any)
	for _, k := range []string{"states", "biomes", "clusters"} {
		if arr, ok := w[k].([]any); !ok || len(arr) != 0 {
			t.Errorf("whereToFind.%s deveria ser []: %v", k, w[k])
		}
	}
}

func TestGetSpecies_NotFoundAndInvalidID(t *testing.T) {
	g := &fakeGet{err: domain.NewError(domain.KindNotFound, errors.New("x"))}
	rec := do(newHandler(t, &fakeList{}, g, &fakeFilters{}), "GET", "/v1/species/nao-existe")
	if b := decode(t, rec); rec.Code != 404 || b["code"] != "SPECIES_NOT_FOUND" || b["type"] != "urn:passarim:problem:species-not-found" {
		t.Fatalf("404: %d %v", rec.Code, b)
	}
	g = &fakeGet{err: &domain.ValidationError{Fields: []domain.FieldError{{Field: "id", Reason: "identificador inválido"}}}}
	rec = do(newHandler(t, &fakeList{}, g, &fakeFilters{}), "GET", "/v1/species/ABC")
	if b := decode(t, rec); rec.Code != 400 || b["errors"].([]any)[0].(map[string]any)["field"] != "id" {
		t.Fatalf("id inválido: %d %v", rec.Code, b)
	}
}

func TestListFilters_OK(t *testing.T) {
	f := &fakeFilters{f: domain.Filters{
		Biomes: []domain.BiomeCount{{Biome: domain.BiomePampa, SpeciesCount: 3}},
		States: []domain.StateCount{{State: "RS", SpeciesCount: 5}},
	}}
	b := decode(t, do(newHandler(t, &fakeList{}, &fakeGet{}, f), "GET", "/v1/filters"))
	biome := b["biomes"].([]any)[0].(map[string]any)
	state := b["states"].([]any)[0].(map[string]any)
	if biome["code"] != "pampa" || biome["label"] != "Pampa" || biome["speciesCount"].(float64) != 3 || state["code"] != "RS" || state["speciesCount"].(float64) != 5 {
		t.Fatalf("filtros: %v", b)
	}
}

func TestSuccessHeaders(t *testing.T) {
	rec := do(newHandler(t, &fakeList{}, &fakeGet{}, &fakeFilters{}), "GET", "/v1/species")
	if rec.Header().Get("Cache-Control") != "public, max-age=60" || rec.Header().Get("X-Cache") != "miss" {
		t.Fatalf("headers: %v", rec.Header())
	}
}

func TestXCacheComesFromRequestMeta(t *testing.T) {
	m, _ := media.New(base, slog.New(slog.DiscardHandler))
	list := stubList(func(ctx context.Context, _ domain.RawListQuery) (domain.SpeciesPage, error) {
		reqmeta.From(ctx).SetCache("stale") // é o que o decorator de cache faz
		return domain.SpeciesPage{}, nil
	})
	h := (&httpadapter.Handler{List: list, Get: &fakeGet{}, Filters: &fakeFilters{}, Media: m, Log: slog.New(slog.DiscardHandler)}).Routes()
	if rec := do(h, "GET", "/v1/species"); rec.Header().Get("X-Cache") != "stale" {
		t.Fatalf("X-Cache = %q", rec.Header().Get("X-Cache"))
	}
}

type stubList func(context.Context, domain.RawListQuery) (domain.SpeciesPage, error)

func (s stubList) Run(ctx context.Context, r domain.RawListQuery) (domain.SpeciesPage, error) {
	return s(ctx, r)
}

func TestRouteNotFound_IsProblemJSON(t *testing.T) {
	rec := do(newHandler(t, &fakeList{}, &fakeGet{}, &fakeFilters{}), "GET", "/v1/nada")
	if b := decode(t, rec); rec.Code != 404 || b["code"] != "NOT_FOUND" || rec.Header().Get("Content-Type") != "application/problem+json" {
		t.Fatalf("404 de rota: %d %v", rec.Code, b)
	}
}

func TestUpstreamErrors_503(t *testing.T) {
	for _, k := range []domain.Kind{domain.KindUnavailable, domain.KindTimeout, domain.KindUpstream, domain.KindCircuitOpen} {
		g := &fakeGet{err: domain.NewError(k, errors.New("x"))}
		rec := do(newHandler(t, &fakeList{}, g, &fakeFilters{}), "GET", "/v1/species/x")
		if b := decode(t, rec); rec.Code != 503 || b["code"] != "SERVICE_UNAVAILABLE" {
			t.Errorf("%s → %d %v", k, rec.Code, b)
		}
	}
}

func TestInternalAndUnknownErrors_500(t *testing.T) {
	for _, err := range []error{domain.NewError(domain.KindInternal, nil), errors.New("qualquer coisa")} {
		rec := do(newHandler(t, &fakeList{}, &fakeGet{err: err}, &fakeFilters{}), "GET", "/v1/species/x")
		if b := decode(t, rec); rec.Code != 500 || b["code"] != "INTERNAL" {
			t.Errorf("%v → %d %v", err, rec.Code, b)
		}
	}
}

// InvalidArgument vindo do CATALOG (ex.: cursor adulterado) vira 400 apontando o campo
// pelo método chamado, sem repassar a mensagem dele.
func TestCatalogInvalidArgument_MapsToFieldByMethod(t *testing.T) {
	cause := domain.NewError(domain.KindInvalidArgument, errors.New("segredo-interno: cursor corrompido"))
	rec := do(newHandler(t, &fakeList{err: cause}, &fakeGet{}, &fakeFilters{}), "GET", "/v1/species?cursor=abc")
	b := decode(t, rec)
	if rec.Code != 400 || b["errors"].([]any)[0].(map[string]any)["field"] != "cursor" {
		t.Fatalf("lista: %d %v", rec.Code, b)
	}
	rec = do(newHandler(t, &fakeList{}, &fakeGet{err: cause}, &fakeFilters{}), "GET", "/v1/species/x")
	b = decode(t, rec)
	if rec.Code != 400 || b["errors"].([]any)[0].(map[string]any)["field"] != "id" {
		t.Fatalf("detalhe: %d %v", rec.Code, b)
	}
}

// Review Focus #5: nenhum texto interno chega ao cliente.
func TestErrors_NeverLeakInternalText(t *testing.T) {
	secret := errors.New("segredo-interno: postgres://user:senha@10.0.0.5/db")
	for _, k := range []domain.Kind{domain.KindUnavailable, domain.KindUpstream, domain.KindInternal, domain.KindNotFound, domain.KindInvalidArgument, domain.KindCircuitOpen} {
		g := &fakeGet{err: domain.NewError(k, secret)}
		rec := do(newHandler(t, &fakeList{}, g, &fakeFilters{}), "GET", "/v1/species/x")
		if strings.Contains(rec.Body.String(), "segredo-interno") || strings.Contains(rec.Body.String(), "postgres") || strings.Contains(rec.Body.String(), "10.0.0.5") {
			t.Errorf("%s vazou texto interno: %s", k, rec.Body.String())
		}
	}
}

func TestCanceledRequest_NoBodyAndStatus499(t *testing.T) {
	g := &fakeGet{err: domain.NewError(domain.KindCanceled, context.Canceled)}
	rec := do(newHandler(t, &fakeList{}, g, &fakeFilters{}), "GET", "/v1/species/x")
	if rec.Code != 499 || rec.Body.Len() != 0 {
		t.Fatalf("cliente que desistiu: status %d, corpo %q", rec.Code, rec.Body.String())
	}
}
```

- [ ] **Step 2: Ver falhar** — `go test ./internal/adapter/media/ ./internal/adapter/http/` → FAIL (pacotes sem código).

- [ ] **Step 3: Implementar**

`internal/adapter/media/media.go`:

```go
// Package media monta a URL PÚBLICA de uma mídia a partir da chave guardada
// no catalog. Trocar de CDN (SeaweedFS local → Cloudflare R2) é só mudar
// MEDIA_BASE_URL: nada no banco muda.
package media

import (
	"context"
	"errors"
	"log/slog"
	"net/url"
	"regexp"
	"strings"

	"github.com/velosobr/passarim-bff/internal/adapter/reqmeta"
)

type Builder struct {
	base *url.URL
	log  *slog.Logger
}

func New(base string, log *slog.Logger) (*Builder, error) {
	u, err := url.Parse(base)
	if err != nil || !u.IsAbs() || u.Host == "" {
		return nil, errors.New("MEDIA_BASE_URL: esperava uma URL absoluta")
	}
	return &Builder{base: u, log: log}, nil
}

// Chaves reais: species/<id>/photo-<idNaFonte>-<variante>.webp e species/<id>/audio-<idNaFonte>.aac.
var safeKey = regexp.MustCompile(`^[A-Za-z0-9._/-]+$`)

// URL devolve nil para chave vazia (espécie ainda sem foto) ou insegura.
// Defesa em profundidade: url.JoinPath "limpa" ".." e uma chave maliciosa
// poderia sair do bucket, então recusamos antes.
func (b *Builder) URL(ctx context.Context, key string) *string {
	if key == "" {
		return nil
	}
	if !safeKey.MatchString(key) || strings.HasPrefix(key, "/") || strings.Contains(key, "//") || hasDotSegment(key) {
		b.log.WarnContext(ctx, "chave de mídia insegura descartada", "key", key, "request_id", reqmeta.RequestID(ctx))
		return nil
	}
	s, err := url.JoinPath(b.base.String(), key)
	if err != nil {
		return nil
	}
	return &s
}

func hasDotSegment(key string) bool {
	for _, seg := range strings.Split(key, "/") {
		if seg == ".." || seg == "." {
			return true
		}
	}
	return false
}
```

`internal/adapter/http/labels.go`:

```go
package httpadapter

import "github.com/velosobr/passarim-bff/internal/domain"

// Rótulos em português: o app não precisa conhecer os códigos.
var biomeLabels = map[domain.Biome]string{
	domain.BiomeAmazonia: "Amazônia", domain.BiomeMataAtlantica: "Mata Atlântica", domain.BiomeCerrado: "Cerrado",
	domain.BiomeCaatinga: "Caatinga", domain.BiomePantanal: "Pantanal", domain.BiomePampa: "Pampa",
}

var conservationLabels = map[domain.ConservationStatus]string{
	"LC": "Pouco preocupante", "NT": "Quase ameaçada", "VU": "Vulnerável", "EN": "Em perigo",
	"CR": "Criticamente em perigo", "EW": "Extinta na natureza", "EX": "Extinta", "DD": "Dados insuficientes",
}
```

`internal/adapter/http/dto.go`:

```go
package httpadapter

import (
	"context"

	"github.com/velosobr/passarim-bff/internal/adapter/media"
	"github.com/velosobr/passarim-bff/internal/domain"
)

// DTOs = o contrato REST. São structs PRÓPRIAS: nunca serializamos o domínio
// nem o proto (OWASP API3: só sai o que está listado aqui).

type labelDTO struct {
	Code  string `json:"code"`
	Label string `json:"label"`
}

type creditDTO struct {
	Author    string `json:"author"`
	License   string `json:"license"`
	Source    string `json:"source"`
	SourceURL string `json:"sourceUrl"`
}

type summaryDTO struct {
	ID                 string    `json:"id"`
	CommonName         string    `json:"commonName"`
	ScientificName     string    `json:"scientificName"`
	ThumbnailURL       *string   `json:"thumbnailUrl"`
	ConservationStatus *labelDTO `json:"conservationStatus"`
}

type speciesPageDTO struct {
	Items      []summaryDTO `json:"items"`
	NextCursor *string      `json:"nextCursor"`
}

type factDTO struct {
	Text   string `json:"text"`
	Source string `json:"source"`
}

type photoDTO struct {
	ThumbURL  *string   `json:"thumbUrl"`
	MediumURL *string   `json:"mediumUrl"`
	LargeURL  *string   `json:"largeUrl"`
	Width     int       `json:"width"`
	Height    int       `json:"height"`
	Credit    creditDTO `json:"credit"`
}

type audioDTO struct {
	URL        string    `json:"url"`
	DurationMs int       `json:"durationMs"`
	Credit     creditDTO `json:"credit"`
}

type clusterDTO struct {
	Lat       float64 `json:"lat"`
	Lng       float64 `json:"lng"`
	Count     int     `json:"count"`
	Precision float64 `json:"precision"`
}

type whereToFindDTO struct {
	States   []string     `json:"states"`
	Biomes   []string     `json:"biomes"`
	Clusters []clusterDTO `json:"clusters"`
}

type speciesDTO struct {
	ID                 string         `json:"id"`
	CommonName         string         `json:"commonName"`
	ScientificName     string         `json:"scientificName"`
	Family             string         `json:"family"`
	ConservationStatus *labelDTO      `json:"conservationStatus"`
	SizeCm             *int           `json:"sizeCm"`
	Diet               *string        `json:"diet"`
	Description        string         `json:"description"`
	DescriptionCredit  creditDTO      `json:"descriptionCredit"`
	Facts              []factDTO      `json:"facts"`
	Chips              []labelDTO     `json:"chips"`
	Photos             []photoDTO     `json:"photos"`
	Audio              *audioDTO      `json:"audio"`
	WhereToFind        whereToFindDTO `json:"whereToFind"`
}

type biomeCountDTO struct {
	Code         string `json:"code"`
	Label        string `json:"label"`
	SpeciesCount int    `json:"speciesCount"`
}

type stateCountDTO struct {
	Code         string `json:"code"`
	SpeciesCount int    `json:"speciesCount"`
}

type filtersDTO struct {
	Biomes []biomeCountDTO `json:"biomes"`
	States []stateCountDTO `json:"states"`
}

func conservationDTO(s domain.ConservationStatus) *labelDTO {
	label, ok := conservationLabels[s]
	if !ok {
		return nil // desconhecido → null
	}
	return &labelDTO{Code: string(s), Label: label}
}

func toCredit(c domain.Credit) creditDTO {
	return creditDTO{Author: c.Author, License: c.License, Source: c.Source, SourceURL: c.SourceURL}
}

func toPageDTO(ctx context.Context, p domain.SpeciesPage, m *media.Builder) speciesPageDTO {
	out := speciesPageDTO{Items: make([]summaryDTO, 0, len(p.Items))}
	for _, s := range p.Items {
		out.Items = append(out.Items, summaryDTO{ID: s.ID, CommonName: s.CommonName, ScientificName: s.ScientificName,
			ThumbnailURL: m.URL(ctx, s.ThumbnailKey), ConservationStatus: conservationDTO(s.Conservation)})
	}
	if p.NextCursor != "" {
		out.NextCursor = &p.NextCursor
	}
	return out
}

func toSpeciesDTO(ctx context.Context, s domain.Species, m *media.Builder) speciesDTO {
	out := speciesDTO{
		ID: s.ID, CommonName: s.CommonName, ScientificName: s.ScientificName, Family: s.Family,
		ConservationStatus: conservationDTO(s.Conservation), SizeCm: s.SizeCm, Diet: s.Diet,
		Description: s.Description, DescriptionCredit: toCredit(s.DescriptionCredit),
		Facts: make([]factDTO, 0, len(s.Facts)), Chips: make([]labelDTO, 0, len(s.Biomes)), Photos: make([]photoDTO, 0, len(s.Photos)),
		WhereToFind: whereToFindDTO{States: make([]string, 0, len(s.States)), Biomes: make([]string, 0, len(s.Biomes)), Clusters: make([]clusterDTO, 0, len(s.Clusters))},
	}
	for _, f := range s.Facts {
		out.Facts = append(out.Facts, factDTO{Text: f.Text, Source: f.Source})
	}
	for _, b := range s.Biomes {
		out.Chips = append(out.Chips, labelDTO{Code: string(b), Label: biomeLabels[b]})
		out.WhereToFind.Biomes = append(out.WhereToFind.Biomes, string(b))
	}
	out.WhereToFind.States = append(out.WhereToFind.States, s.States...)
	for _, p := range s.Photos {
		out.Photos = append(out.Photos, photoDTO{ThumbURL: m.URL(ctx, p.ThumbKey), MediumURL: m.URL(ctx, p.MediumKey), LargeURL: m.URL(ctx, p.LargeKey),
			Width: p.Width, Height: p.Height, Credit: toCredit(p.Credit)})
	}
	if s.Audio != nil {
		// Áudio com URL insegura/vazia = sem áudio: o app esconde o player.
		if u := m.URL(ctx, s.Audio.Key); u != nil {
			out.Audio = &audioDTO{URL: *u, DurationMs: s.Audio.DurationMs, Credit: toCredit(s.Audio.Credit)}
		}
	}
	for _, c := range s.Clusters {
		out.WhereToFind.Clusters = append(out.WhereToFind.Clusters, clusterDTO{Lat: c.Lat, Lng: c.Lng, Count: c.Count, Precision: c.Precision})
	}
	return out
}

func toFiltersDTO(f domain.Filters) filtersDTO {
	out := filtersDTO{Biomes: make([]biomeCountDTO, 0, len(f.Biomes)), States: make([]stateCountDTO, 0, len(f.States))}
	for _, b := range f.Biomes {
		out.Biomes = append(out.Biomes, biomeCountDTO{Code: string(b.Biome), Label: biomeLabels[b.Biome], SpeciesCount: b.SpeciesCount})
	}
	for _, s := range f.States {
		out.States = append(out.States, stateCountDTO{Code: s.State, SpeciesCount: s.SpeciesCount})
	}
	return out
}
```

`internal/adapter/http/problem.go`:

```go
package httpadapter

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/velosobr/passarim-bff/internal/adapter/reqmeta"
	"github.com/velosobr/passarim-bff/internal/domain"
)

// Códigos estáveis do contrato (o app mapeia cada um para uma tela de erro).
const (
	CodeInvalidParameter   = "INVALID_PARAMETER"
	CodeSpeciesNotFound    = "SPECIES_NOT_FOUND"
	CodeNotFound           = "NOT_FOUND"
	CodeMethodNotAllowed   = "METHOD_NOT_ALLOWED"
	CodeRateLimited        = "RATE_LIMITED"
	CodeServiceUnavailable = "SERVICE_UNAVAILABLE"
	CodeInternal           = "INTERNAL"
)

var problemTitles = map[string]string{
	CodeInvalidParameter:   "Parâmetro inválido",
	CodeSpeciesNotFound:    "Espécie não encontrada",
	CodeNotFound:           "Recurso não encontrado",
	CodeMethodNotAllowed:   "Método não permitido",
	CodeRateLimited:        "Muitas requisições",
	CodeServiceUnavailable: "Serviço temporariamente indisponível",
	CodeInternal:           "Erro interno",
}

type fieldErrorDTO struct {
	Field  string `json:"field"`
	Reason string `json:"reason"`
}

// problemDTO segue o RFC 9457 (application/problem+json).
type problemDTO struct {
	Type      string          `json:"type"`
	Title     string          `json:"title"`
	Status    int             `json:"status"`
	Code      string          `json:"code"`
	RequestID string          `json:"requestId"`
	Errors    []fieldErrorDTO `json:"errors,omitempty"`
}

// WriteProblem escreve um erro padronizado. Os textos são FIXOS (escritos aqui):
// nunca repassamos mensagem de erro de outra camada.
func WriteProblem(w http.ResponseWriter, r *http.Request, status int, code string, fields []domain.FieldError) {
	p := problemDTO{
		Type:      "urn:passarim:problem:" + strings.ToLower(strings.ReplaceAll(code, "_", "-")),
		Title:     problemTitles[code],
		Status:    status,
		Code:      code,
		RequestID: reqmeta.RequestID(r.Context()),
	}
	for _, f := range fields {
		p.Errors = append(p.Errors, fieldErrorDTO{Field: f.Field, Reason: f.Reason})
	}
	body, err := json.Marshal(p)
	if err != nil { // não deveria acontecer; resposta mínima segura
		http.Error(w, "internal", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}
```

`internal/adapter/http/errors.go`:

```go
package httpadapter

import (
	"errors"
	"net/http"

	"github.com/velosobr/passarim-bff/internal/adapter/reqmeta"
	"github.com/velosobr/passarim-bff/internal/domain"
)

// statusClientClosed: convenção do nginx para "o cliente desistiu". Só aparece
// no log de acesso (ninguém lê a resposta), e não polui as métricas de 5xx.
const statusClientClosed = 499

// fail é o ÚNICO lugar que traduz erro de domínio em resposta HTTP.
// fieldHint diz qual parâmetro apontar quando o CATALOG reclama de InvalidArgument
// ("cursor" na lista, "id" no detalhe); nunca repassamos a mensagem dele.
func (h *Handler) fail(w http.ResponseWriter, r *http.Request, err error, fieldHint string) {
	kind := domain.KindOf(err)
	rid := reqmeta.RequestID(r.Context())
	switch kind {
	case domain.KindInvalidArgument:
		var ve *domain.ValidationError
		if errors.As(err, &ve) {
			WriteProblem(w, r, http.StatusBadRequest, CodeInvalidParameter, ve.Fields)
			return
		}
		h.Log.WarnContext(r.Context(), "catalog recusou o parâmetro", "request_id", rid, "error", err)
		WriteProblem(w, r, http.StatusBadRequest, CodeInvalidParameter, []domain.FieldError{{Field: fieldHint, Reason: "valor inválido"}})
	case domain.KindNotFound:
		WriteProblem(w, r, http.StatusNotFound, CodeSpeciesNotFound, nil)
	case domain.KindCanceled:
		w.WriteHeader(statusClientClosed) // sem corpo: ninguém está ouvindo
	case domain.KindUnavailable, domain.KindTimeout, domain.KindUpstream, domain.KindCircuitOpen:
		h.Log.WarnContext(r.Context(), "catalog indisponível", "request_id", rid, "kind", kind.String(), "error", err)
		WriteProblem(w, r, http.StatusServiceUnavailable, CodeServiceUnavailable, nil)
	default:
		h.Log.ErrorContext(r.Context(), "erro interno", "request_id", rid, "error", err)
		WriteProblem(w, r, http.StatusInternalServerError, CodeInternal, nil)
	}
}
```

`internal/adapter/http/handler.go`:

```go
// Package httpadapter é a borda REST do BFF: rotas /v1, DTOs, erros
// problem+json. Os middlewares (Task 5) ficam em ./middleware.
package httpadapter

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/velosobr/passarim-bff/internal/adapter/media"
	"github.com/velosobr/passarim-bff/internal/adapter/reqmeta"
	"github.com/velosobr/passarim-bff/internal/domain"
)

type SpeciesLister interface {
	Run(ctx context.Context, raw domain.RawListQuery) (domain.SpeciesPage, error)
}

type SpeciesGetter interface {
	Run(ctx context.Context, id string) (domain.Species, error)
}

type FiltersLister interface {
	Run(ctx context.Context) (domain.Filters, error)
}

type Handler struct {
	List    SpeciesLister
	Get     SpeciesGetter
	Filters FiltersLister
	Media   *media.Builder
	Log     *slog.Logger
}

// Routes monta o roteador da stdlib (Go 1.22+: padrões com método e {id}).
// O "/" no fim captura rota inexistente para responder 404 em problem+json
// (o mux padrão responderia texto puro).
func (h *Handler) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/species", h.listSpecies)
	mux.HandleFunc("GET /v1/species/{id}", h.getSpecies)
	mux.HandleFunc("GET /v1/filters", h.listFilters)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		WriteProblem(w, r, http.StatusNotFound, CodeNotFound, nil)
	})
	return mux
}

var listParams = []string{"q", "biome", "state", "cursor", "limit"}

func (h *Handler) listSpecies(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	raw := domain.RawListQuery{Q: query.Get("q"), Biome: query.Get("biome"), State: query.Get("state"), Cursor: query.Get("cursor"), Limit: query.Get("limit")}
	for _, p := range listParams {
		if len(query[p]) > 1 {
			raw.Repeated = append(raw.Repeated, p)
		}
	}
	page, err := h.List.Run(r.Context(), raw)
	if err != nil {
		h.fail(w, r, err, "cursor")
		return
	}
	h.ok(w, r, toPageDTO(r.Context(), page, h.Media))
}

func (h *Handler) getSpecies(w http.ResponseWriter, r *http.Request) {
	s, err := h.Get.Run(r.Context(), r.PathValue("id"))
	if err != nil {
		h.fail(w, r, err, "id")
		return
	}
	h.ok(w, r, toSpeciesDTO(r.Context(), s, h.Media))
}

func (h *Handler) listFilters(w http.ResponseWriter, r *http.Request) {
	f, err := h.Filters.Run(r.Context())
	if err != nil {
		h.fail(w, r, err, "")
		return
	}
	h.ok(w, r, toFiltersDTO(f))
}

// ok escreve um 200 com os cabeçalhos de cache. O corpo é montado ANTES de
// escrever, para um erro de serialização nunca deixar uma resposta pela metade.
func (h *Handler) ok(w http.ResponseWriter, r *http.Request, v any) {
	body, err := json.Marshal(v)
	if err != nil {
		h.fail(w, r, err, "")
		return
	}
	cache := reqmeta.From(r.Context()).Cache()
	if cache == "" {
		cache = "miss"
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=60")
	w.Header().Set("X-Cache", cache)
	_, _ = w.Write(body)
}
```

- [ ] **Step 4: Ver passar** — `go test -race ./internal/adapter/media/ ./internal/adapter/http/ && golangci-lint run`. Expected: ok. (Se o linter reclamar do pacote `http` com nome `httpadapter` em diretório `http`, mantenha: o nome do pacote é `httpadapter`, como `grpcadapter` no catalog.)
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: camada HTTP (rotas, DTOs, URLs de mídia, problem+json)"`

---

### Task 5: Middlewares (recovery, request_id, log, headers, limites, IP real, rate limit)

**Files:** `internal/adapter/http/middleware/{recorder,recovery,requestid,accesslog,headers,limits,clientip,ratelimit,chain}.go` + `middleware_test.go`, `clientip_test.go`, `ratelimit_test.go`

**Interfaces (Consumes):** `httpadapter.WriteProblem` e as constantes `Code*` (Task 4), `reqmeta` (Task 3).
**Interfaces (Produces)**, pacote `middleware`:
- `type Middleware = func(http.Handler) http.Handler`; `Chain(h http.Handler, mws ...Middleware) http.Handler` (o **primeiro** da lista fica mais **externo**).
- `Recovery(log *slog.Logger) Middleware`; `RequestID() Middleware`; `AccessLog(log *slog.Logger, ip IPResolver, obs Observer) Middleware`; `SecurityHeaders() Middleware`; `Limits() Middleware`.
- `type Observer interface{ ObserveHTTP(route, method string, status int, d time.Duration) }` (`nil` é aceito; a Task 8 implementa com Prometheus).
- `type IPResolver func(*http.Request) string`; `NewIPResolver(trusted []netip.Prefix, header string) IPResolver`.
- `type RateLimitConfig struct{ RPS float64; Burst, MaxIPs int; IdleAfter time.Duration; OnLimited func() }`; `NewRateLimiter(cfg RateLimitConfig, ip IPResolver, now func() time.Time) *RateLimiter`; `(*RateLimiter).Middleware() Middleware`; `(*RateLimiter).Cleanup()`; `(*RateLimiter).Run(ctx context.Context, every time.Duration)` (limpeza periódica); `(*RateLimiter).Tracked() int`.

**Atenção (ordem e `r.Pattern`):** o `AccessLog` lê `r.Pattern` DEPOIS de chamar o próximo handler. O `ServeMux` grava o padrão no mesmo `*http.Request` que recebe, então nenhum middleware **entre o `AccessLog` e o roteador** pode trocar o request por uma cópia (`r.WithContext`). Só o `RequestID` (que fica fora do `AccessLog`) faz essa cópia. Ordem final (de fora para dentro): `Recovery → RequestID → AccessLog → SecurityHeaders → RateLimit → Limits → roteador`.

- [ ] **Step 1: Testes que falham**

`internal/adapter/http/middleware/middleware_test.go`:

```go
package middleware_test

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/velosobr/passarim-bff/internal/adapter/http/middleware"
	"github.com/velosobr/passarim-bff/internal/adapter/reqmeta"
)

var discard = slog.New(slog.DiscardHandler)

func TestRecovery_PanicBecomes500WithoutStack(t *testing.T) {
	h := middleware.Chain(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("segredo-do-panic") }),
		middleware.Recovery(discard), middleware.RequestID())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/x", nil))
	if rec.Code != 500 || rec.Header().Get("Content-Type") != "application/problem+json" {
		t.Fatalf("status/content-type: %d %s", rec.Code, rec.Header().Get("Content-Type"))
	}
	var p map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &p)
	if p["code"] != "INTERNAL" || p["requestId"] == "" || strings.Contains(rec.Body.String(), "segredo-do-panic") || strings.Contains(rec.Body.String(), "goroutine") {
		t.Fatalf("corpo: %s", rec.Body.String())
	}
}

func TestRecovery_RepropagatesAbortHandler(t *testing.T) {
	h := middleware.Recovery(discard)(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic(http.ErrAbortHandler) }))
	defer func() {
		if r := recover(); r != http.ErrAbortHandler {
			t.Fatalf("http.ErrAbortHandler deveria ser repropagado, veio %v", r)
		}
	}()
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/x", nil))
}

var hex32 = regexp.MustCompile(`^[0-9a-f]{32}$`)

func TestRequestID_AcceptsValidAndReplacesInvalid(t *testing.T) {
	var seen string
	h := middleware.RequestID()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { seen = reqmeta.RequestID(r.Context()) }))
	for _, valid := range []string{"abc-123_X.y", strings.Repeat("a", 64)} {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest("GET", "/", nil)
		req.Header.Set("X-Request-Id", valid)
		h.ServeHTTP(rec, req)
		if seen != valid || rec.Header().Get("X-Request-Id") != valid {
			t.Errorf("%q deveria ser aceito: ctx=%q header=%q", valid, seen, rec.Header().Get("X-Request-Id"))
		}
	}
	for _, bad := range []string{strings.Repeat("a", 65), "tem espaço", "ação", "a\nb", ""} {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest("GET", "/", nil)
		if bad != "" {
			req.Header.Set("X-Request-Id", bad)
		}
		h.ServeHTTP(rec, req)
		if !hex32.MatchString(seen) || rec.Header().Get("X-Request-Id") != seen {
			t.Errorf("%q deveria ser trocado por 32 hex, veio ctx=%q", bad, seen)
		}
	}
}

type recObserver struct {
	route, method string
	status        int
	calls         int
}

func (o *recObserver) ObserveHTTP(route, method string, status int, _ time.Duration) {
	o.route, o.method, o.status = route, method, status
	o.calls++
}

func TestAccessLog_FieldsRouteAndObserver(t *testing.T) {
	var buf bytes.Buffer
	log := slog.New(slog.NewJSONHandler(&buf, nil))
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/species/{id}", func(w http.ResponseWriter, r *http.Request) {
		reqmeta.From(r.Context()).SetCache("hit")
		w.WriteHeader(200)
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(404) })
	obs := &recObserver{}
	ip := func(*http.Request) string { return "203.0.113.9" }
	h := middleware.Chain(mux, middleware.RequestID(), middleware.AccessLog(log, ip, obs))

	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/v1/species/turdus-rufiventris?q=segredo", nil))
	var line map[string]any
	if err := json.Unmarshal(bytes.TrimSpace(buf.Bytes()), &line); err != nil {
		t.Fatalf("log não é JSON: %v\n%s", err, buf.String())
	}
	if line["route"] != "GET /v1/species/{id}" || line["status"].(float64) != 200 || line["cache"] != "hit" || line["client_ip"] != "203.0.113.9" ||
		line["method"] != "GET" || line["request_id"] == "" || line["duration_ms"] == nil {
		t.Fatalf("campos do log: %v", line)
	}
	if strings.Contains(buf.String(), "turdus-rufiventris") || strings.Contains(buf.String(), "segredo") {
		t.Fatalf("o log guarda o padrão da rota, nunca a URL com parâmetros: %s", buf.String())
	}
	if obs.route != "GET /v1/species/{id}" || obs.status != 200 || obs.method != "GET" || obs.calls != 1 {
		t.Fatalf("observer: %+v", obs)
	}

	buf.Reset()
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/nada/aqui", nil))
	if obs.route != "unmatched" {
		t.Fatalf("rota sem padrão deveria ser 'unmatched', veio %q", obs.route)
	}
}

func TestSecurityHeaders(t *testing.T) {
	rec := httptest.NewRecorder()
	middleware.SecurityHeaders()(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})).ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
	for k, v := range map[string]string{"X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'", "Referrer-Policy": "no-referrer"} {
		if rec.Header().Get(k) != v {
			t.Errorf("%s = %q, esperado %q", k, rec.Header().Get(k), v)
		}
	}
}

func TestLimits_OnlyGetAndHead(t *testing.T) {
	called := false
	h := middleware.Chain(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { called = true }), middleware.RequestID(), middleware.Limits())
	for _, m := range []string{"POST", "PUT", "DELETE", "PATCH", "OPTIONS"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(m, "/v1/species", strings.NewReader("corpo")))
		var p map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &p)
		if rec.Code != 405 || rec.Header().Get("Allow") != "GET, HEAD" || p["code"] != "METHOD_NOT_ALLOWED" || rec.Header().Get("Content-Type") != "application/problem+json" {
			t.Errorf("%s: %d allow=%q corpo=%s", m, rec.Code, rec.Header().Get("Allow"), rec.Body.String())
		}
	}
	if called {
		t.Fatal("métodos recusados não podem chegar ao handler")
	}
	for _, m := range []string{"GET", "HEAD"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(m, "/v1/species", nil))
		if rec.Code == 405 {
			t.Errorf("%s deveria passar", m)
		}
	}
}

func TestChain_FirstIsOutermost(t *testing.T) {
	var order []string
	mk := func(name string) middleware.Middleware {
		return func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { order = append(order, name); next.ServeHTTP(w, r) })
		}
	}
	middleware.Chain(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { order = append(order, "handler") }), mk("a"), mk("b")).
		ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/", nil))
	if strings.Join(order, ",") != "a,b,handler" {
		t.Fatalf("ordem: %v", order)
	}
}
```

`internal/adapter/http/middleware/clientip_test.go`:

```go
package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"net/netip"
	"testing"

	"github.com/velosobr/passarim-bff/internal/adapter/http/middleware"
)

func req(remote string, xff ...string) *http.Request {
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = remote
	for _, v := range xff {
		r.Header.Add("X-Forwarded-For", v)
	}
	return r
}

func trusted(cidrs ...string) []netip.Prefix {
	var out []netip.Prefix
	for _, c := range cidrs {
		out = append(out, netip.MustParsePrefix(c))
	}
	return out
}

// Review Focus #3: sem proxy confiável, o cabeçalho é IGNORADO (qualquer cliente poderia forjá-lo).
func TestClientIP_IgnoresHeaderWhenConnectionNotTrusted(t *testing.T) {
	ip := middleware.NewIPResolver(trusted("172.30.0.10/32"), "X-Forwarded-For")
	if got := ip(req("198.51.100.7:5555", "1.2.3.4")); got != "198.51.100.7" {
		t.Fatalf("got %s", got)
	}
	if got := middleware.NewIPResolver(nil, "X-Forwarded-For")(req("198.51.100.7:5555", "1.2.3.4")); got != "198.51.100.7" {
		t.Fatalf("sem lista de proxies, ninguém é confiável: %s", got)
	}
}

func TestClientIP_TrustedProxyUsesRightmostNonTrusted(t *testing.T) {
	ip := middleware.NewIPResolver(trusted("172.30.0.10/32", "10.0.0.0/8"), "X-Forwarded-For")
	cases := map[string]struct {
		xff  []string
		want string
	}{
		"um cliente":                    {[]string{"203.0.113.9"}, "203.0.113.9"},
		"o cliente forjou a esquerda":   {[]string{"9.9.9.9, 203.0.113.9"}, "203.0.113.9"}, // vale a entrada mais à direita
		"proxy confiável na cadeia":     {[]string{"203.0.113.9, 10.1.2.3"}, "203.0.113.9"},
		"várias linhas do cabeçalho":    {[]string{"9.9.9.9", "203.0.113.9"}, "203.0.113.9"},
		"só proxies confiáveis":         {[]string{"10.1.1.1, 10.2.2.2"}, "172.30.0.10"},
		"entrada inválida na direita":   {[]string{"203.0.113.9, lixo"}, "172.30.0.10"},
		"sem cabeçalho":                 {nil, "172.30.0.10"},
	}
	for name, c := range cases {
		if got := ip(req("172.30.0.10:4444", c.xff...)); got != c.want {
			t.Errorf("%s: %s, esperado %s", name, got, c.want)
		}
	}
}

func TestClientIP_IPv6AndMappedAddresses(t *testing.T) {
	ip := middleware.NewIPResolver(trusted("172.30.0.10/32"), "X-Forwarded-For")
	if got := ip(req("[2001:db8::1]:80")); got != "2001:db8::1" {
		t.Errorf("IPv6: %s", got)
	}
	if got := ip(req("[::ffff:172.30.0.10]:80", "203.0.113.9")); got != "203.0.113.9" {
		t.Errorf("IPv4 mapeado em IPv6 deve ser reconhecido como o proxy: %s", got)
	}
}

func TestClientIP_HeaderNameIsConfigurable(t *testing.T) {
	ip := middleware.NewIPResolver(trusted("172.30.0.10/32"), "Fly-Client-IP")
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "172.30.0.10:1"
	r.Header.Set("Fly-Client-IP", "203.0.113.9")
	r.Header.Set("X-Forwarded-For", "9.9.9.9")
	if got := ip(r); got != "203.0.113.9" {
		t.Fatalf("got %s", got)
	}
}
```

`internal/adapter/http/middleware/ratelimit_test.go`:

```go
package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/velosobr/passarim-bff/internal/adapter/http/middleware"
)

type clock struct{ now time.Time }

func (c *clock) Now() time.Time          { return c.now }
func (c *clock) Advance(d time.Duration) { c.now = c.now.Add(d) }

func newLimiter(t *testing.T, cfg middleware.RateLimitConfig, clk *clock) (*middleware.RateLimiter, http.Handler) {
	t.Helper()
	ip := func(r *http.Request) string { return r.Header.Get("X-Test-IP") }
	rl := middleware.NewRateLimiter(cfg, ip, clk.Now)
	h := middleware.Chain(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }), middleware.RequestID(), rl.Middleware())
	return rl, h
}

func hit(h http.Handler, ip, path string) *httptest.ResponseRecorder {
	r := httptest.NewRequest("GET", path, nil)
	r.Header.Set("X-Test-IP", ip)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	return rec
}

func TestRateLimit_BurstThen429WithRetryAfter(t *testing.T) {
	clk := &clock{now: time.Unix(1_000_000, 0)}
	limited := 0
	_, h := newLimiter(t, middleware.RateLimitConfig{RPS: 10, Burst: 3, MaxIPs: 100, IdleAfter: 3 * time.Minute, OnLimited: func() { limited++ }}, clk)
	for i := 0; i < 3; i++ {
		if rec := hit(h, "1.1.1.1", "/v1/species"); rec.Code != 200 {
			t.Fatalf("a rajada de 3 deveria passar (req %d): %d", i, rec.Code)
		}
	}
	rec := hit(h, "1.1.1.1", "/v1/species")
	if rec.Code != 429 || rec.Header().Get("Content-Type") != "application/problem+json" {
		t.Fatalf("4ª deveria ser 429 problem+json: %d %s", rec.Code, rec.Header().Get("Content-Type"))
	}
	if ra, _ := strconv.Atoi(rec.Header().Get("Retry-After")); ra < 1 {
		t.Fatalf("Retry-After mínimo 1s: %q", rec.Header().Get("Retry-After"))
	}
	if limited != 1 {
		t.Fatalf("OnLimited deveria ser chamado 1 vez, veio %d", limited)
	}
	clk.Advance(200 * time.Millisecond) // 10 req/s → 2 fichas
	if rec := hit(h, "1.1.1.1", "/v1/species"); rec.Code != 200 {
		t.Fatalf("depois de 200ms o balde enche de novo: %d", rec.Code)
	}
}

func TestRateLimit_PerIPAndExemptHealth(t *testing.T) {
	clk := &clock{now: time.Unix(1_000_000, 0)}
	_, h := newLimiter(t, middleware.RateLimitConfig{RPS: 1, Burst: 1, MaxIPs: 100, IdleAfter: time.Minute}, clk)
	_ = hit(h, "1.1.1.1", "/v1/species")
	if hit(h, "1.1.1.1", "/v1/species").Code != 429 {
		t.Fatal("o mesmo IP deveria estar limitado")
	}
	if hit(h, "2.2.2.2", "/v1/species").Code != 200 {
		t.Fatal("outro IP tem o seu próprio balde")
	}
	for i := 0; i < 5; i++ {
		if hit(h, "1.1.1.1", "/healthz").Code != 200 || hit(h, "1.1.1.1", "/readyz").Code != 200 {
			t.Fatal("/healthz e /readyz ficam fora do limite")
		}
	}
}

func TestRateLimit_RetryAfterFollowsRate(t *testing.T) {
	clk := &clock{now: time.Unix(1_000_000, 0)}
	_, h := newLimiter(t, middleware.RateLimitConfig{RPS: 0.25, Burst: 1, MaxIPs: 10, IdleAfter: time.Minute}, clk)
	_ = hit(h, "1.1.1.1", "/v1/x")
	if ra := hit(h, "1.1.1.1", "/v1/x").Header().Get("Retry-After"); ra != "4" {
		t.Fatalf("1/0.25 = 4s, veio %q", ra)
	}
}

// O teto de IPs despeja o MAIS OCIOSO; o limiter nunca passa a recusar todo mundo.
func TestRateLimit_EvictsLeastRecentlyUsedAtCap(t *testing.T) {
	clk := &clock{now: time.Unix(1_000_000, 0)}
	rl, h := newLimiter(t, middleware.RateLimitConfig{RPS: 1, Burst: 1, MaxIPs: 2, IdleAfter: time.Hour}, clk)
	_ = hit(h, "a", "/v1/x") // a esgota o balde
	_ = hit(h, "b", "/v1/x")
	_ = hit(h, "a", "/v1/x") // a fica "recente"; b é o mais ocioso
	_ = hit(h, "c", "/v1/x") // estoura o teto: despeja b
	if rl.Tracked() != 2 {
		t.Fatalf("o teto é 2, rastreando %d", rl.Tracked())
	}
	if hit(h, "a", "/v1/x").Code != 429 {
		t.Fatal("a continua rastreado e limitado")
	}
	if hit(h, "b", "/v1/x").Code != 200 {
		t.Fatal("b foi despejado: volta com balde cheio (nunca recusamos um IP novo)")
	}
	if hit(h, "d", "/v1/x").Code != 200 {
		t.Fatal("um IP novo sempre é atendido, mesmo no teto")
	}
}

func TestRateLimit_CleanupRemovesIdleIPs(t *testing.T) {
	clk := &clock{now: time.Unix(1_000_000, 0)}
	rl, h := newLimiter(t, middleware.RateLimitConfig{RPS: 1, Burst: 1, MaxIPs: 100, IdleAfter: 3 * time.Minute}, clk)
	_ = hit(h, "a", "/v1/x")
	clk.Advance(2 * time.Minute)
	_ = hit(h, "b", "/v1/x")
	clk.Advance(2 * time.Minute) // a está ocioso há 4 min; b há 2 min
	rl.Cleanup()
	if rl.Tracked() != 1 {
		t.Fatalf("só b deveria restar: %d", rl.Tracked())
	}
}
```

- [ ] **Step 2: Ver falhar** — `go test ./internal/adapter/http/middleware/` → FAIL (pacote sem código).

- [ ] **Step 3: Implementar**

`internal/adapter/http/middleware/recorder.go` e `chain.go`:

```go
package middleware

import "net/http"

// statusRecorder guarda o status escrito, para o log, as métricas e o recovery.
type statusRecorder struct {
	http.ResponseWriter
	status int
	wrote  bool
}

func (s *statusRecorder) WriteHeader(code int) {
	if !s.wrote {
		s.status, s.wrote = code, true
	}
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Write(b []byte) (int, error) {
	if !s.wrote {
		s.status, s.wrote = http.StatusOK, true
	}
	return s.ResponseWriter.Write(b)
}

// Unwrap deixa http.ResponseController alcançar o ResponseWriter de verdade.
func (s *statusRecorder) Unwrap() http.ResponseWriter { return s.ResponseWriter }

func (s *statusRecorder) Status() int {
	if !s.wrote {
		return http.StatusOK
	}
	return s.status
}
```

```go
package middleware

import "net/http"

// Middleware é uma função que embrulha um handler com um comportamento comum.
type Middleware = func(http.Handler) http.Handler

// Chain aplica os middlewares: o PRIMEIRO da lista fica mais EXTERNO (roda primeiro).
func Chain(h http.Handler, mws ...Middleware) http.Handler {
	for i := len(mws) - 1; i >= 0; i-- {
		h = mws[i](h)
	}
	return h
}
```

`recovery.go`:

```go
package middleware

import (
	"log/slog"
	"net/http"
	"runtime/debug"

	httpadapter "github.com/velosobr/passarim-bff/internal/adapter/http"
	"github.com/velosobr/passarim-bff/internal/adapter/reqmeta"
)

// Recovery impede que um panic derrube o processo: responde 500 limpo (sem
// stack na resposta) e loga a stack com o request_id. É o middleware mais
// externo; o request_id já foi gravado na RESPOSTA pelo middleware RequestID.
func Recovery(log *slog.Logger) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			rec := &statusRecorder{ResponseWriter: w}
			defer func() {
				p := recover()
				if p == nil {
					return
				}
				if p == http.ErrAbortHandler { // sinal legítimo do net/http: deixa passar
					panic(p)
				}
				rid := w.Header().Get("X-Request-Id")
				log.ErrorContext(r.Context(), "panic na requisição", "request_id", rid, "panic", p, "stack", string(debug.Stack()))
				if rec.wrote { // a resposta já começou: não dá mais para trocar o status
					return
				}
				r2 := r.WithContext(reqmeta.With(r.Context(), reqmeta.New(rid)))
				httpadapter.WriteProblem(w, r2, http.StatusInternalServerError, httpadapter.CodeInternal, nil)
			}()
			next.ServeHTTP(rec, r)
		})
	}
}
```

`requestid.go`:

```go
package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"regexp"

	"github.com/velosobr/passarim-bff/internal/adapter/reqmeta"
)

// O catalog descarta ids com mais de 64 caracteres; por isso o limite aqui.
var validRequestID = regexp.MustCompile(`^[A-Za-z0-9._-]{1,64}$`)

// RequestID aceita o X-Request-Id recebido se for seguro; senão gera um novo
// (32 caracteres hex). Grava no contexto (reqmeta) e na resposta. Faz r.WithContext
// (uma cópia do request): por isso fica FORA do AccessLog (ver o aviso da Task 5).
func RequestID() Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id := r.Header.Get("X-Request-Id")
			if !validRequestID.MatchString(id) {
				b := make([]byte, 16)
				_, _ = rand.Read(b) // crypto/rand não falha em sistemas suportados
				id = hex.EncodeToString(b)
			}
			w.Header().Set("X-Request-Id", id)
			next.ServeHTTP(w, r.WithContext(reqmeta.With(r.Context(), reqmeta.New(id))))
		})
	}
}
```

`accesslog.go`:

```go
package middleware

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/velosobr/passarim-bff/internal/adapter/reqmeta"
)

// Observer recebe cada requisição concluída (a Task 8 liga isto ao Prometheus).
type Observer interface {
	ObserveHTTP(route, method string, status int, d time.Duration)
}

// AccessLog escreve UMA linha por requisição e avisa o Observer. A rota logada
// é o PADRÃO casado ("GET /v1/species/{id}"), nunca a URL com parâmetros: não
// vaza buscas do usuário e mantém a cardinalidade das métricas baixa.
func AccessLog(log *slog.Logger, ip IPResolver, obs Observer) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &statusRecorder{ResponseWriter: w}
			next.ServeHTTP(rec, r) // o mux grava r.Pattern neste mesmo request
			d := time.Since(start)
			route := r.Pattern
			if route == "" || route == "/" { // "/" é o 404 genérico
				route = "unmatched"
			}
			log.InfoContext(r.Context(), "requisição",
				"request_id", reqmeta.RequestID(r.Context()), "method", r.Method, "route", route,
				"status", rec.Status(), "duration_ms", float64(d.Microseconds())/1000,
				"cache", reqmeta.From(r.Context()).Cache(), "client_ip", ip(r))
			if obs != nil {
				obs.ObserveHTTP(route, r.Method, rec.Status(), d)
			}
		})
	}
}
```

`headers.go` e `limits.go`:

```go
package middleware

import "net/http"

// SecurityHeaders: cabeçalhos defensivos em TODA resposta (OWASP API8).
func SecurityHeaders() Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := w.Header()
			h.Set("X-Content-Type-Options", "nosniff")
			h.Set("Content-Security-Policy", "default-src 'none'")
			h.Set("Referrer-Policy", "no-referrer")
			next.ServeHTTP(w, r)
		})
	}
}
```

```go
package middleware

import (
	"net/http"

	httpadapter "github.com/velosobr/passarim-bff/internal/adapter/http"
)

// maxBodyBytes: a API só tem GET, então o corpo nunca é lido; o limite é defesa extra.
const maxBodyBytes = 1 << 10

// Limits recusa qualquer método que não seja GET/HEAD (405 em problem+json, o
// mux da stdlib responderia texto puro) e limita o corpo.
func Limits() Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet && r.Method != http.MethodHead {
				w.Header().Set("Allow", "GET, HEAD")
				httpadapter.WriteProblem(w, r, http.StatusMethodNotAllowed, httpadapter.CodeMethodNotAllowed, nil)
				return
			}
			r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes) // mesmo request: o Pattern do mux continua visível ao AccessLog
			next.ServeHTTP(w, r)
		})
	}
}
```

`clientip.go`:

```go
package middleware

import (
	"net"
	"net/http"
	"net/netip"
	"strings"
)

// IPResolver descobre o IP do CLIENTE de uma requisição.
type IPResolver func(*http.Request) string

// NewIPResolver implementa a regra do IP real atrás de proxy (spec §7.4):
//  1. Se a conexão NÃO vem de um proxy confiável, o IP é o da conexão e o cabeçalho é IGNORADO
//     (qualquer cliente poderia forjá-lo).
//  2. Se vem, lemos as entradas do cabeçalho da DIREITA para a ESQUERDA, pulando proxies
//     confiáveis; a primeira que não é proxy é o cliente. Nunca usamos a primeira entrada
//     (a mais à esquerda é a que o cliente controla).
//  3. Entrada que não é IP válido, ou cabeçalho ausente: usamos o IP da conexão.
func NewIPResolver(trusted []netip.Prefix, header string) IPResolver {
	isTrusted := func(a netip.Addr) bool {
		for _, p := range trusted {
			if p.Contains(a) {
				return true
			}
		}
		return false
	}
	return func(r *http.Request) string {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			host = r.RemoteAddr
		}
		conn, err := netip.ParseAddr(host)
		if err != nil {
			return host
		}
		conn = conn.Unmap() // "::ffff:1.2.3.4" é o IPv4 1.2.3.4
		if !isTrusted(conn) {
			return conn.String()
		}
		var entries []string
		for _, v := range r.Header.Values(header) {
			for _, part := range strings.Split(v, ",") {
				entries = append(entries, strings.TrimSpace(part))
			}
		}
		for i := len(entries) - 1; i >= 0; i-- {
			a, err := netip.ParseAddr(entries[i])
			if err != nil {
				return conn.String()
			}
			a = a.Unmap()
			if isTrusted(a) {
				continue
			}
			return a.String()
		}
		return conn.String()
	}
}
```

`ratelimit.go`:

```go
package middleware

import (
	"container/list"
	"context"
	"math"
	"net/http"
	"strconv"
	"sync"
	"time"

	"golang.org/x/time/rate"

	httpadapter "github.com/velosobr/passarim-bff/internal/adapter/http"
)

type RateLimitConfig struct {
	RPS       float64       // fichas por segundo, por IP
	Burst     int           // tamanho do balde
	MaxIPs    int           // teto de IPs rastreados (memória limitada)
	IdleAfter time.Duration // IP sem requisições há mais que isto é esquecido pela limpeza
	OnLimited func()        // chamado a cada 429 (métrica); pode ser nil
}

// RateLimiter: token bucket por IP, em memória, por réplica (ADR-0015).
// O mapa é limitado por uma lista LRU: no teto, o IP MAIS OCIOSO é despejado;
// nunca recusamos todo mundo porque o mapa encheu.
type RateLimiter struct {
	cfg RateLimitConfig
	ip  IPResolver
	now func() time.Time

	mu      sync.Mutex
	byIP    map[string]*list.Element
	lru     *list.List // frente = mais recente
}

type entry struct {
	ip   string
	lim  *rate.Limiter
	last time.Time
}

func NewRateLimiter(cfg RateLimitConfig, ip IPResolver, now func() time.Time) *RateLimiter {
	return &RateLimiter{cfg: cfg, ip: ip, now: now, byIP: map[string]*list.Element{}, lru: list.New()}
}

// allow consome uma ficha do balde do IP (criando-o se preciso).
func (rl *RateLimiter) allow(ip string) bool {
	now := rl.now()
	rl.mu.Lock()
	defer rl.mu.Unlock()
	el, ok := rl.byIP[ip]
	if !ok {
		if rl.lru.Len() >= rl.cfg.MaxIPs {
			if oldest := rl.lru.Back(); oldest != nil {
				delete(rl.byIP, oldest.Value.(*entry).ip)
				rl.lru.Remove(oldest)
			}
		}
		el = rl.lru.PushFront(&entry{ip: ip, lim: rate.NewLimiter(rate.Limit(rl.cfg.RPS), rl.cfg.Burst)})
		rl.byIP[ip] = el
	} else {
		rl.lru.MoveToFront(el)
	}
	e := el.Value.(*entry)
	e.last = now
	return e.lim.AllowN(now, 1)
}

// Cleanup esquece IPs ociosos há mais de IdleAfter.
func (rl *RateLimiter) Cleanup() {
	cutoff := rl.now().Add(-rl.cfg.IdleAfter)
	rl.mu.Lock()
	defer rl.mu.Unlock()
	for el := rl.lru.Back(); el != nil; {
		prev := el.Prev()
		if e := el.Value.(*entry); e.last.Before(cutoff) {
			delete(rl.byIP, e.ip)
			rl.lru.Remove(el)
		}
		el = prev
	}
}

// Run chama Cleanup periodicamente até o contexto acabar (rode numa goroutine).
func (rl *RateLimiter) Run(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			rl.Cleanup()
		}
	}
}

// Tracked é o número de IPs rastreados (alimenta a métrica bff_rate_limiter_tracked_ips).
func (rl *RateLimiter) Tracked() int {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	return rl.lru.Len()
}

func (rl *RateLimiter) Middleware() Middleware {
	retryAfter := strconv.Itoa(max(1, int(math.Ceil(1/rl.cfg.RPS))))
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/healthz" || r.URL.Path == "/readyz" { // probes nunca são limitadas
				next.ServeHTTP(w, r)
				return
			}
			if !rl.allow(rl.ip(r)) {
				if rl.cfg.OnLimited != nil {
					rl.cfg.OnLimited()
				}
				w.Header().Set("Retry-After", retryAfter)
				httpadapter.WriteProblem(w, r, http.StatusTooManyRequests, httpadapter.CodeRateLimited, nil)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
```

- [ ] **Step 4: Ver passar** — `go test -race ./internal/adapter/http/... && golangci-lint run && gofmt -l .`. Expected: ok, 0 issues. (O `go.mod` precisa de `golang.org/x/time`: `go get golang.org/x/time` com a mesma versão do catalog.)
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: middlewares (recovery, request_id, log, headers, limites, IP real, rate limit LRU)"`

---

### Task 6: Decorators de resiliência — retry/timeout, circuit breaker e cache Redis

**Files:** `internal/adapter/metrics/metrics.go`; `internal/adapter/resilience/{retry,breaker}.go` + `retry_test.go`, `breaker_test.go`, `fakes_test.go`; `internal/adapter/cache/{cache,dto,keys,store}.go` + `cache_test.go`, `redis_store_test.go`, `fakes_test.go`

**Interfaces (Consumes):** `usecase.CatalogReader`, `domain.*` (`KindOf`, `NewError`, `Kind.Retryable/CountsForBreaker/AllowsStale`), `reqmeta.From(ctx).SetCache`.
**Interfaces (Produces):**
- `metrics.Metrics` (interface): `CacheResult(result string)` (`hit`|`miss`|`stale`|`bypass`|`error`), `BreakerState(state int)` (0 fechado, 1 half-open, 2 aberto), `CatalogRetry(method string)`, `CatalogAttempt(method, code string, d time.Duration)`; `metrics.Noop() Metrics`.
- `resilience.RetryConfig{MaxRetries int; AttemptTimeout time.Duration; Now func() time.Time; Sleep func(ctx context.Context, d time.Duration) error; Jitter func(max time.Duration) time.Duration}`; `resilience.NewRetry(next usecase.CatalogReader, cfg RetryConfig, m metrics.Metrics) usecase.CatalogReader`; constantes `BaseBackoff = 50ms`, `MinAttemptBudget = 200ms`.
- `resilience.BreakerConfig{MaxRequests uint32; Interval, Timeout time.Duration; ConsecutiveFailures, MinRequests uint32; FailureRatio float64}`; `resilience.DefaultBreakerConfig() BreakerConfig` (3, 60 s, 30 s, 5, 10, 0.6); `resilience.NewBreaker(next usecase.CatalogReader, cfg BreakerConfig, log *slog.Logger, m metrics.Metrics) usecase.CatalogReader`.
- `cache.Store` (`Get(ctx, key string) ([]byte, bool, error)`, `Set(ctx, key string, value []byte, ttl time.Duration) error`); `cache.NewRedisStore(c *redis.Client, timeout time.Duration) *RedisStore`; `cache.Config{FreshTTL, StaleTTL, Budget time.Duration; Now func() time.Time}`; `cache.New(next usecase.CatalogReader, store Store, cfg Config, log *slog.Logger, m metrics.Metrics) usecase.CatalogReader`.

Pré-requisitos: `go get github.com/sony/gobreaker/v2 github.com/redis/go-redis/v9 golang.org/x/sync github.com/testcontainers/testcontainers-go/modules/redis`.

- [ ] **Step 1: Interface de métricas (sem teste próprio: é só um contrato + no-op)** — `internal/adapter/metrics/metrics.go`:

```go
// Package metrics define o CONTRATO de métricas que os decorators usam e uma
// implementação que não faz nada (para testes). A implementação Prometheus
// chega na Task 8: assim os decorators (Task 6) não dependem do Prometheus.
package metrics

import "time"

type Metrics interface {
	CacheResult(result string) // hit | miss | stale | bypass | error
	BreakerState(state int)    // 0 fechado, 1 half-open, 2 aberto
	CatalogRetry(method string)
	CatalogAttempt(method, code string, d time.Duration)
}

type noop struct{}

func (noop) CacheResult(string)                            {}
func (noop) BreakerState(int)                              {}
func (noop) CatalogRetry(string)                           {}
func (noop) CatalogAttempt(string, string, time.Duration)  {}

func Noop() Metrics { return noop{} }
```

- [ ] **Step 2: Fakes e testes do retry que falham** — `internal/adapter/resilience/fakes_test.go`:

```go
package resilience_test

import (
	"context"
	"sync"
	"time"

	"github.com/velosobr/passarim-bff/internal/domain"
)

// scripted devolve, em ordem, os erros da lista (nil = sucesso); guarda o contexto de cada chamada.
type scripted struct {
	mu        sync.Mutex
	errs      []error
	calls     int
	deadlines []time.Time
}

func (s *scripted) next(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	dl, _ := ctx.Deadline()
	s.deadlines = append(s.deadlines, dl)
	i := s.calls
	s.calls++
	if i < len(s.errs) {
		return s.errs[i]
	}
	if len(s.errs) > 0 {
		return s.errs[len(s.errs)-1]
	}
	return nil
}

func (s *scripted) ListSpecies(ctx context.Context, _ domain.ListQuery) (domain.SpeciesPage, error) {
	return domain.SpeciesPage{}, s.next(ctx)
}
func (s *scripted) GetSpecies(ctx context.Context, id string) (domain.Species, error) {
	return domain.Species{ID: id}, s.next(ctx)
}
func (s *scripted) ListFilters(ctx context.Context) (domain.Filters, error) {
	return domain.Filters{}, s.next(ctx)
}

func kindErr(k domain.Kind) error { return domain.NewError(k, nil) }

// recMetrics anota o que foi contado.
type recMetrics struct {
	mu       sync.Mutex
	retries  int
	attempts []string
	states   []int
	cache    []string
}

func (m *recMetrics) CacheResult(r string) { m.mu.Lock(); m.cache = append(m.cache, r); m.mu.Unlock() }
func (m *recMetrics) BreakerState(s int)   { m.mu.Lock(); m.states = append(m.states, s); m.mu.Unlock() }
func (m *recMetrics) CatalogRetry(string)  { m.mu.Lock(); m.retries++; m.mu.Unlock() }
func (m *recMetrics) CatalogAttempt(method, code string, _ time.Duration) {
	m.mu.Lock()
	m.attempts = append(m.attempts, method+":"+code)
	m.mu.Unlock()
}
```

`internal/adapter/resilience/retry_test.go`:

```go
package resilience_test

import (
	"context"
	"testing"
	"time"

	"github.com/velosobr/passarim-bff/internal/adapter/resilience"
	"github.com/velosobr/passarim-bff/internal/domain"
)

type retryEnv struct {
	r      *scripted
	waits  []time.Duration
	maxes  []time.Duration
	m      *recMetrics
	base   time.Time
}

func newRetry(t *testing.T, errs ...error) (*retryEnv, func() error) {
	t.Helper()
	env := &retryEnv{r: &scripted{errs: errs}, m: &recMetrics{}, base: time.Now()}
	cfg := resilience.RetryConfig{
		MaxRetries: 2, AttemptTimeout: 2 * time.Second,
		Now:    func() time.Time { return env.base },
		Sleep:  func(_ context.Context, d time.Duration) error { env.waits = append(env.waits, d); return nil },
		Jitter: func(max time.Duration) time.Duration { env.maxes = append(env.maxes, max); return max }, // pior caso: espera o máximo
	}
	rd := resilience.NewRetry(env.r, cfg, env.m)
	return env, func() error {
		ctx, cancel := context.WithDeadline(context.Background(), env.base.Add(3*time.Second))
		defer cancel()
		_, err := rd.GetSpecies(ctx, "x")
		return err
	}
}

func TestRetry_RetriesOnlyUnavailableAndTimeout(t *testing.T) {
	for _, k := range []domain.Kind{domain.KindUnavailable, domain.KindTimeout} {
		env, call := newRetry(t, kindErr(k), kindErr(k), nil)
		if err := call(); err != nil || env.r.calls != 3 {
			t.Errorf("%s: esperava sucesso na 3ª tentativa: err=%v calls=%d", k, err, env.r.calls)
		}
	}
	for _, k := range []domain.Kind{domain.KindNotFound, domain.KindInvalidArgument, domain.KindUpstream, domain.KindInternal, domain.KindCanceled, domain.KindCircuitOpen} {
		env, call := newRetry(t, kindErr(k))
		if err := call(); domain.KindOf(err) != k || env.r.calls != 1 {
			t.Errorf("%s: não deveria repetir: err=%v calls=%d", k, err, env.r.calls)
		}
	}
}

func TestRetry_GivesUpAfterMaxRetries(t *testing.T) {
	env, call := newRetry(t, kindErr(domain.KindUnavailable))
	err := call()
	if domain.KindOf(err) != domain.KindUnavailable || env.r.calls != 3 {
		t.Fatalf("1 tentativa + 2 retries = 3 chamadas: err=%v calls=%d", err, env.r.calls)
	}
	if env.m.retries != 2 {
		t.Fatalf("métrica de retries = %d", env.m.retries)
	}
}

func TestRetry_BackoffIsExponentialWithJitterBounds(t *testing.T) {
	env, call := newRetry(t, kindErr(domain.KindUnavailable))
	_ = call()
	// Antes do retry n espera um valor em [0, 50ms × 2ⁿ]: n=1 → 100ms, n=2 → 200ms.
	if len(env.maxes) != 2 || env.maxes[0] != 100*time.Millisecond || env.maxes[1] != 200*time.Millisecond {
		t.Fatalf("limites do jitter: %v", env.maxes)
	}
}

func TestRetry_NoNewAttemptWithoutRemainingBudget(t *testing.T) {
	env := &retryEnv{r: &scripted{errs: []error{kindErr(domain.KindUnavailable)}}, m: &recMetrics{}, base: time.Now()}
	rd := resilience.NewRetry(env.r, resilience.RetryConfig{
		MaxRetries: 2, AttemptTimeout: 2 * time.Second, Now: func() time.Time { return env.base },
		Sleep: func(context.Context, time.Duration) error { return nil }, Jitter: func(max time.Duration) time.Duration { return max },
	}, env.m)
	// Sobram só 250ms: depois do backoff de 100ms restariam 150ms (< 200ms mínimos) → não tenta de novo.
	ctx, cancel := context.WithDeadline(context.Background(), env.base.Add(250*time.Millisecond))
	defer cancel()
	_, err := rd.GetSpecies(ctx, "x")
	if domain.KindOf(err) != domain.KindUnavailable || env.r.calls != 1 {
		t.Fatalf("sem orçamento, não repete: err=%v calls=%d", err, env.r.calls)
	}
}

func TestRetry_AttemptTimeoutIsMinOfConfigAndRemaining(t *testing.T) {
	env, call := newRetry(t, nil)
	_ = call()
	if got := env.r.deadlines[0].Sub(env.base); got > 2*time.Second || got < 1900*time.Millisecond {
		t.Fatalf("tentativa deveria ter ~2s (limite da config), tem %v", got)
	}
	// Com só 500ms de orçamento total, a tentativa não pode passar disso.
	env2 := &retryEnv{r: &scripted{}, m: &recMetrics{}, base: time.Now()}
	rd := resilience.NewRetry(env2.r, resilience.RetryConfig{MaxRetries: 0, AttemptTimeout: 2 * time.Second, Now: func() time.Time { return env2.base }}, env2.m)
	ctx, cancel := context.WithDeadline(context.Background(), env2.base.Add(500*time.Millisecond))
	defer cancel()
	_, _ = rd.GetSpecies(ctx, "x")
	if got := env2.r.deadlines[0].Sub(env2.base); got > 500*time.Millisecond {
		t.Fatalf("a tentativa nunca estende o prazo da requisição: %v", got)
	}
}

func TestRetry_RecordsAttemptMetricsPerMethodAndCode(t *testing.T) {
	env, call := newRetry(t, kindErr(domain.KindUnavailable), nil)
	_ = call()
	if len(env.m.attempts) != 2 || env.m.attempts[0] != "GetSpecies:Unavailable" || env.m.attempts[1] != "GetSpecies:ok" {
		t.Fatalf("tentativas: %v", env.m.attempts)
	}
}

func TestRetry_StopsWhenContextIsCanceledDuringBackoff(t *testing.T) {
	env := &retryEnv{r: &scripted{errs: []error{kindErr(domain.KindUnavailable)}}, m: &recMetrics{}, base: time.Now()}
	rd := resilience.NewRetry(env.r, resilience.RetryConfig{
		MaxRetries: 2, AttemptTimeout: 2 * time.Second, Now: func() time.Time { return env.base },
		Sleep: func(ctx context.Context, _ time.Duration) error { return context.Canceled }, Jitter: func(max time.Duration) time.Duration { return max },
	}, env.m)
	_, err := rd.GetSpecies(context.Background(), "x")
	if domain.KindOf(err) != domain.KindCanceled || env.r.calls != 1 {
		t.Fatalf("cancelado no backoff: err=%v calls=%d", err, env.r.calls)
	}
}
```

`internal/adapter/resilience/breaker_test.go`:

```go
package resilience_test

import (
	"context"
	"testing"
	"time"

	"github.com/velosobr/passarim-bff/internal/adapter/resilience"
	"github.com/velosobr/passarim-bff/internal/domain"
)

func fastBreaker() resilience.BreakerConfig {
	c := resilience.DefaultBreakerConfig()
	c.Timeout = 30 * time.Millisecond // em produção são 30 s; aqui 30 ms para o teste não demorar
	return c
}

func newBreaker(t *testing.T, cfg resilience.BreakerConfig, errs ...error) (*scripted, *recMetrics, func() error) {
	t.Helper()
	s, m := &scripted{errs: errs}, &recMetrics{}
	b := resilience.NewBreaker(s, cfg, testLogger(), m)
	return s, m, func() error { _, err := b.GetSpecies(context.Background(), "x"); return err }
}

func TestBreaker_OpensAfter5ConsecutiveFailures(t *testing.T) {
	s, m, call := newBreaker(t, fastBreaker(), kindErr(domain.KindUnavailable))
	for i := 0; i < 5; i++ {
		_ = call()
	}
	err := call()
	if domain.KindOf(err) != domain.KindCircuitOpen || s.calls != 5 {
		t.Fatalf("a 6ª chamada deveria falhar na hora, sem chegar ao catalog: err=%v calls=%d", err, s.calls)
	}
	if len(m.states) == 0 || m.states[len(m.states)-1] != 2 {
		t.Fatalf("a métrica do estado deveria ser 2 (aberto): %v", m.states)
	}
}

func TestBreaker_OpensOnFailureRatio(t *testing.T) {
	// 6 falhas e 4 sucessos intercalados (nunca 5 seguidas): 60% em 10 chamadas. A ÚLTIMA precisa
	// ser uma falha: o ReadyToTrip só é avaliado quando uma chamada falha.
	f := func() error { return kindErr(domain.KindUnavailable) }
	pattern := []error{f(), nil, f(), f(), nil, f(), nil, f(), nil, f()}
	s, _, call := newBreaker(t, fastBreaker(), pattern...)
	for range pattern {
		_ = call()
	}
	if err := call(); domain.KindOf(err) != domain.KindCircuitOpen {
		t.Fatalf("60%% de falhas em 10 chamadas deveria abrir: %v (calls=%d)", err, s.calls)
	}
}

// Review Focus #4: cliente que desconecta e 404 NÃO são falha do catalog.
func TestBreaker_IgnoresNonInfrastructureErrors(t *testing.T) {
	for _, k := range []domain.Kind{domain.KindNotFound, domain.KindInvalidArgument, domain.KindCanceled, domain.KindInternal} {
		s, _, call := newBreaker(t, fastBreaker(), kindErr(k))
		for i := 0; i < 30; i++ {
			if err := call(); domain.KindOf(err) != k {
				t.Fatalf("%s: o circuito abriu indevidamente na chamada %d: %v", k, i, err)
			}
		}
		if s.calls != 30 {
			t.Errorf("%s: todas as chamadas deveriam chegar ao catalog (%d)", k, s.calls)
		}
	}
}

func TestBreaker_HalfOpenThenClosesOnSuccess(t *testing.T) {
	errs := []error{kindErr(domain.KindUnavailable), kindErr(domain.KindUnavailable), kindErr(domain.KindUnavailable), kindErr(domain.KindUnavailable), kindErr(domain.KindUnavailable), nil}
	s, m, call := newBreaker(t, fastBreaker(), errs...)
	for i := 0; i < 5; i++ {
		_ = call()
	}
	if domain.KindOf(call()) != domain.KindCircuitOpen {
		t.Fatal("deveria estar aberto")
	}
	time.Sleep(60 * time.Millisecond) // passou o Timeout: vira half-open
	// No half-open o breaker deixa passar MaxRequests (3) chamadas de teste; com 3 sucessos seguidos, fecha.
	for i := 0; i < 3; i++ {
		if err := call(); err != nil {
			t.Fatalf("chamada de teste %d do half-open deveria passar: %v", i+1, err)
		}
	}
	if err := call(); err != nil || s.calls != 9 {
		t.Fatalf("circuito fechado de novo: err=%v calls=%d (5 falhas + 3 de teste + 1)", err, s.calls)
	}
	if m.states[len(m.states)-1] != 0 {
		t.Fatalf("estado final deveria ser 0 (fechado): %v", m.states)
	}
}

func TestBreaker_WrapsErrorsAsCircuitOpenKind(t *testing.T) {
	_, _, call := newBreaker(t, fastBreaker(), kindErr(domain.KindUnavailable))
	for i := 0; i < 5; i++ {
		_ = call()
	}
	if k := domain.KindOf(call()); !k.AllowsStale() || k.CountsForBreaker() {
		t.Fatalf("CircuitOpen libera stale e não conta no breaker: %s", k)
	}
}
```

Acrescente ao `fakes_test.go` do resilience: `func testLogger() *slog.Logger { return slog.New(slog.DiscardHandler) }` (import `log/slog`).

- [ ] **Step 3: Ver falhar** — `go test ./internal/adapter/resilience/` → FAIL.

- [ ] **Step 4: Implementar o retry e o breaker**

`internal/adapter/resilience/retry.go`:

```go
// Package resilience tem os decorators de retry/timeout e de circuit breaker
// sobre usecase.CatalogReader. Cada um implementa a MESMA interface do que
// embrulha, então a ordem é montada no main (cache → breaker → retry → gRPC).
package resilience

import (
	"context"
	"math/rand/v2"
	"time"

	"github.com/velosobr/passarim-bff/internal/adapter/metrics"
	"github.com/velosobr/passarim-bff/internal/domain"
	"github.com/velosobr/passarim-bff/internal/usecase"
)

const (
	BaseBackoff      = 50 * time.Millisecond  // antes do retry n espera [0, BaseBackoff × 2ⁿ]
	MinAttemptBudget = 200 * time.Millisecond // sem pelo menos isto de tempo, não tenta de novo
)

type RetryConfig struct {
	MaxRetries     int           // retries além da 1ª tentativa
	AttemptTimeout time.Duration // limite de UMA tentativa
	Now            func() time.Time
	Sleep          func(ctx context.Context, d time.Duration) error // injetável nos testes
	Jitter         func(max time.Duration) time.Duration            // sorteia em [0, max]
}

type retry struct {
	next usecase.CatalogReader
	cfg  RetryConfig
	m    metrics.Metrics
}

// NewRetry repete só falhas passageiras (Kind.Retryable) e só leituras (todas as nossas são).
func NewRetry(next usecase.CatalogReader, cfg RetryConfig, m metrics.Metrics) usecase.CatalogReader {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	if cfg.Sleep == nil {
		cfg.Sleep = sleepCtx
	}
	if cfg.Jitter == nil {
		cfg.Jitter = func(max time.Duration) time.Duration { return rand.N(max + 1) }
	}
	return &retry{next: next, cfg: cfg, m: m}
}

func sleepCtx(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

// attempt roda UMA tentativa com timeout = min(AttemptTimeout, tempo restante da requisição).
func attempt[T any](ctx context.Context, r *retry, method string, fn func(context.Context) (T, error)) (T, error) {
	tctx, cancel := context.WithTimeout(ctx, r.cfg.AttemptTimeout) // WithTimeout já nunca passa do prazo do pai
	defer cancel()
	start := r.cfg.Now()
	v, err := fn(tctx)
	code := "ok"
	if err != nil {
		code = domain.KindOf(err).String()
	}
	r.m.CatalogAttempt(method, code, r.cfg.Now().Sub(start))
	return v, err
}

func do[T any](ctx context.Context, r *retry, method string, fn func(context.Context) (T, error)) (T, error) {
	for n := 0; ; n++ {
		v, err := attempt(ctx, r, method, fn)
		if err == nil || !domain.KindOf(err).Retryable() || n >= r.cfg.MaxRetries {
			return v, err
		}
		wait := r.cfg.Jitter(BaseBackoff << (n + 1)) // retry 1 → até 100ms; retry 2 → até 200ms
		if dl, ok := ctx.Deadline(); ok && dl.Sub(r.cfg.Now())-wait < MinAttemptBudget {
			return v, err // sem tempo para outra tentativa útil
		}
		if serr := r.cfg.Sleep(ctx, wait); serr != nil {
			var zero T
			return zero, domain.NewError(domain.KindOf(serr), serr)
		}
		r.m.CatalogRetry(method)
	}
}

func (r *retry) ListSpecies(ctx context.Context, q domain.ListQuery) (domain.SpeciesPage, error) {
	return do(ctx, r, "ListSpecies", func(c context.Context) (domain.SpeciesPage, error) { return r.next.ListSpecies(c, q) })
}

func (r *retry) GetSpecies(ctx context.Context, id string) (domain.Species, error) {
	return do(ctx, r, "GetSpecies", func(c context.Context) (domain.Species, error) { return r.next.GetSpecies(c, id) })
}

func (r *retry) ListFilters(ctx context.Context) (domain.Filters, error) {
	return do(ctx, r, "ListFilters", func(c context.Context) (domain.Filters, error) { return r.next.ListFilters(c) })
}
```

`internal/adapter/resilience/breaker.go`:

```go
package resilience

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/sony/gobreaker/v2"

	"github.com/velosobr/passarim-bff/internal/adapter/metrics"
	"github.com/velosobr/passarim-bff/internal/domain"
	"github.com/velosobr/passarim-bff/internal/usecase"
)

type BreakerConfig struct {
	MaxRequests         uint32        // chamadas de teste no half-open
	Interval            time.Duration // zera os contadores do estado fechado
	Timeout             time.Duration // quanto tempo fica aberto
	ConsecutiveFailures uint32        // abre com N falhas seguidas...
	MinRequests         uint32        // ...ou com FailureRatio de falhas em pelo menos N chamadas
	FailureRatio        float64
}

// DefaultBreakerConfig são os valores da spec (§5.4). Ficam como constantes
// comentadas, não como variáveis de ambiente.
func DefaultBreakerConfig() BreakerConfig {
	return BreakerConfig{MaxRequests: 3, Interval: 60 * time.Second, Timeout: 30 * time.Second, ConsecutiveFailures: 5, MinRequests: 10, FailureRatio: 0.6}
}

type breaker struct {
	next usecase.CatalogReader
	cb   *gobreaker.CircuitBreaker[any]
}

// NewBreaker: um breaker único para o catalog (os 3 métodos dependem do mesmo
// serviço e do mesmo banco). Envolve o retry: uma operação lógica conta UMA vez.
func NewBreaker(next usecase.CatalogReader, cfg BreakerConfig, log *slog.Logger, m metrics.Metrics) usecase.CatalogReader {
	cb := gobreaker.NewCircuitBreaker[any](gobreaker.Settings{
		Name: "catalog", MaxRequests: cfg.MaxRequests, Interval: cfg.Interval, Timeout: cfg.Timeout,
		ReadyToTrip: func(c gobreaker.Counts) bool {
			return c.ConsecutiveFailures >= cfg.ConsecutiveFailures ||
				(c.Requests >= cfg.MinRequests && float64(c.TotalFailures)/float64(c.Requests) >= cfg.FailureRatio)
		},
		// Só falha de INFRAESTRUTURA conta. NotFound, InvalidArgument, Canceled (cliente que
		// desconectou) e Internal não são sinal de que o catalog esteja doente.
		IsSuccessful: func(err error) bool { return err == nil || !domain.KindOf(err).CountsForBreaker() },
		OnStateChange: func(name string, from, to gobreaker.State) {
			log.Info("circuit breaker mudou de estado", "breaker", name, "from", from.String(), "to", to.String())
			m.BreakerState(stateNumber(to))
		},
	})
	return &breaker{next: next, cb: cb}
}

func stateNumber(s gobreaker.State) int {
	switch s {
	case gobreaker.StateHalfOpen:
		return 1
	case gobreaker.StateOpen:
		return 2
	}
	return 0
}

// guard roda fn dentro do breaker e traduz "aberto" para o Kind CircuitOpen.
func guard[T any](b *breaker, fn func() (T, error)) (T, error) {
	v, err := b.cb.Execute(func() (any, error) { return fn() })
	if err != nil {
		var zero T
		if errors.Is(err, gobreaker.ErrOpenState) || errors.Is(err, gobreaker.ErrTooManyRequests) {
			return zero, domain.NewError(domain.KindCircuitOpen, err)
		}
		if v != nil {
			return v.(T), err // erros "normais" devolvem o valor parcial como veio
		}
		return zero, err
	}
	return v.(T), nil
}

func (b *breaker) ListSpecies(ctx context.Context, q domain.ListQuery) (domain.SpeciesPage, error) {
	return guard(b, func() (domain.SpeciesPage, error) { return b.next.ListSpecies(ctx, q) })
}

func (b *breaker) GetSpecies(ctx context.Context, id string) (domain.Species, error) {
	return guard(b, func() (domain.Species, error) { return b.next.GetSpecies(ctx, id) })
}

func (b *breaker) ListFilters(ctx context.Context) (domain.Filters, error) {
	return guard(b, func() (domain.Filters, error) { return b.next.ListFilters(ctx) })
}
```

- [ ] **Step 5: Ver passar** — `go test -race ./internal/adapter/resilience/ && golangci-lint run`. Expected: ok. (O teste do half-open usa `time.Sleep(60ms)`; é a única espera real.)

- [ ] **Step 6: Fakes e testes do cache que falham** — `internal/adapter/cache/fakes_test.go`:

```go
package cache_test

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/velosobr/passarim-bff/internal/domain"
)

type memStore struct {
	mu            sync.Mutex
	data          map[string][]byte
	ttls          map[string]time.Duration
	gets, sets    int
	getErr, setErr error
}

func newMemStore() *memStore { return &memStore{data: map[string][]byte{}, ttls: map[string]time.Duration{}} }

func (s *memStore) Get(_ context.Context, key string) ([]byte, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.gets++
	if s.getErr != nil {
		return nil, false, s.getErr
	}
	v, ok := s.data[key]
	return v, ok, nil
}

func (s *memStore) Set(_ context.Context, key string, v []byte, ttl time.Duration) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sets++
	if s.setErr != nil {
		return s.setErr
	}
	s.data[key], s.ttls[key] = v, ttl
	return nil
}

func (s *memStore) keys() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []string
	for k := range s.data {
		out = append(out, k)
	}
	return out
}

// fakeCatalog conta chamadas e pode bloquear até o teste liberar (para provar o singleflight).
type fakeCatalog struct {
	calls   atomic.Int32
	err     error
	species domain.Species
	gate    chan struct{} // se não for nil, a chamada espera aqui
	entered chan struct{} // avisa que a chamada começou (se não for nil)
}

func (f *fakeCatalog) wait(ctx context.Context) error {
	f.calls.Add(1)
	if f.entered != nil {
		select {
		case f.entered <- struct{}{}:
		default:
		}
	}
	if f.gate != nil {
		select {
		case <-f.gate:
		case <-ctx.Done():
			return domain.NewError(domain.KindOf(ctx.Err()), ctx.Err())
		}
	}
	return f.err
}

func (f *fakeCatalog) ListSpecies(ctx context.Context, q domain.ListQuery) (domain.SpeciesPage, error) {
	if err := f.wait(ctx); err != nil {
		return domain.SpeciesPage{}, err
	}
	return domain.SpeciesPage{Items: []domain.Summary{{ID: "a", CommonName: q.Q + "x"}}, NextCursor: "n"}, nil
}

func (f *fakeCatalog) GetSpecies(ctx context.Context, id string) (domain.Species, error) {
	if err := f.wait(ctx); err != nil {
		return domain.Species{}, err
	}
	s := f.species
	s.ID = id
	return s, nil
}

func (f *fakeCatalog) ListFilters(ctx context.Context) (domain.Filters, error) {
	if err := f.wait(ctx); err != nil {
		return domain.Filters{}, err
	}
	return domain.Filters{Biomes: []domain.BiomeCount{{Biome: domain.BiomePampa, SpeciesCount: 3}}}, nil
}

type clock struct{ now time.Time }

func (c *clock) Now() time.Time          { return c.now }
func (c *clock) Advance(d time.Duration) { c.now = c.now.Add(d) }

type recMetrics struct {
	mu    sync.Mutex
	cache []string
}

func (m *recMetrics) CacheResult(r string) { m.mu.Lock(); m.cache = append(m.cache, r); m.mu.Unlock() }
func (*recMetrics) BreakerState(int)        {}
func (*recMetrics) CatalogRetry(string)     {}
func (*recMetrics) CatalogAttempt(string, string, time.Duration) {}

func (m *recMetrics) count(r string) int {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for _, c := range m.cache {
		if c == r {
			n++
		}
	}
	return n
}

func discardLog() *slog.Logger { return slog.New(slog.DiscardHandler) }

var errBoom = errors.New("boom")
```

`internal/adapter/cache/cache_test.go`:

```go
package cache_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/velosobr/passarim-bff/internal/adapter/cache"
	"github.com/velosobr/passarim-bff/internal/adapter/reqmeta"
	"github.com/velosobr/passarim-bff/internal/domain"
)

type env struct {
	cat   *fakeCatalog
	store *memStore
	clk   *clock
	m     *recMetrics
	c     interface {
		ListSpecies(context.Context, domain.ListQuery) (domain.SpeciesPage, error)
		GetSpecies(context.Context, string) (domain.Species, error)
		ListFilters(context.Context) (domain.Filters, error)
	}
}

func newEnv(t *testing.T) *env {
	t.Helper()
	e := &env{cat: &fakeCatalog{}, store: newMemStore(), clk: &clock{now: time.Now()}, m: &recMetrics{}}
	e.c = cache.New(e.cat, e.store, cache.Config{FreshTTL: 10 * time.Minute, StaleTTL: 24 * time.Hour, Budget: 3 * time.Second, Now: e.clk.Now}, discardLog(), e.m)
	return e
}

func ctxWithMeta() (context.Context, *reqmeta.Meta) {
	m := reqmeta.New("req")
	return reqmeta.With(context.Background(), m), m
}

func TestCache_MissThenHitWhileFresh(t *testing.T) {
	e := newEnv(t)
	ctx, meta := ctxWithMeta()
	if _, err := e.c.GetSpecies(ctx, "sabia"); err != nil || meta.Cache() != "miss" {
		t.Fatalf("1ª: err=%v cache=%q", err, meta.Cache())
	}
	ctx2, meta2 := ctxWithMeta()
	s, err := e.c.GetSpecies(ctx2, "sabia")
	if err != nil || s.ID != "sabia" || meta2.Cache() != "hit" || e.cat.calls.Load() != 1 {
		t.Fatalf("2ª deveria ser hit sem chamar o catalog: err=%v cache=%q calls=%d", err, meta2.Cache(), e.cat.calls.Load())
	}
	if e.store.ttls["bff:v1:species:sabia"] != 24*time.Hour {
		t.Fatalf("o TTL no Redis é a janela de stale (24h): %v", e.store.ttls)
	}
	if e.m.count("miss") != 1 || e.m.count("hit") != 1 {
		t.Fatalf("métricas: %v", e.m.cache)
	}
}

func TestCache_RefreshesWhenFreshnessExpires(t *testing.T) {
	e := newEnv(t)
	_, _ = e.c.GetSpecies(context.Background(), "sabia")
	e.clk.Advance(11 * time.Minute) // passou dos 10 min: não é mais "fresco", mas ainda está no Redis
	ctx, meta := ctxWithMeta()
	if _, err := e.c.GetSpecies(ctx, "sabia"); err != nil || meta.Cache() != "miss" || e.cat.calls.Load() != 2 {
		t.Fatalf("deveria buscar de novo: err=%v cache=%q calls=%d", err, meta.Cache(), e.cat.calls.Load())
	}
}

// Review Focus #2: com o catalog doente, o app recebe o dado velho, não um 503.
func TestCache_ServesStaleOnUpstreamAndCircuitOpen(t *testing.T) {
	for _, k := range []domain.Kind{domain.KindUnavailable, domain.KindTimeout, domain.KindUpstream, domain.KindCircuitOpen} {
		e := newEnv(t)
		_, _ = e.c.GetSpecies(context.Background(), "sabia")
		e.clk.Advance(30 * time.Minute)
		e.cat.err = domain.NewError(k, errBoom)
		ctx, meta := ctxWithMeta()
		s, err := e.c.GetSpecies(ctx, "sabia")
		if err != nil || s.ID != "sabia" || meta.Cache() != "stale" || e.m.count("stale") != 1 {
			t.Errorf("%s: deveria servir stale: err=%v cache=%q", k, err, meta.Cache())
		}
		// Sem dado guardado, o erro sai (o handler vira 503).
		if _, err := e.c.GetSpecies(context.Background(), "nunca-vista"); domain.KindOf(err) != k {
			t.Errorf("%s: sem candidato deveria devolver o erro: %v", k, err)
		}
	}
}

func TestCache_NoStaleForNotFoundInvalidCanceledInternal(t *testing.T) {
	for _, k := range []domain.Kind{domain.KindNotFound, domain.KindInvalidArgument, domain.KindCanceled, domain.KindInternal} {
		e := newEnv(t)
		_, _ = e.c.GetSpecies(context.Background(), "sabia")
		e.clk.Advance(30 * time.Minute)
		e.cat.err = domain.NewError(k, errBoom)
		if _, err := e.c.GetSpecies(context.Background(), "sabia"); domain.KindOf(err) != k {
			t.Errorf("%s: não pode virar stale, deveria devolver o erro: %v", k, err)
		}
	}
}

// Review Focus #6: busca com texto livre não cria chaves no Redis.
func TestCache_SearchBypassesCache(t *testing.T) {
	e := newEnv(t)
	for _, q := range []string{"sabia", "bem-te-vi", "xyz"} {
		ctx, meta := ctxWithMeta()
		if _, err := e.c.ListSpecies(ctx, domain.ListQuery{Q: q, Limit: 20}); err != nil || meta.Cache() != "miss" {
			t.Fatalf("q=%q: err=%v cache=%q", q, err, meta.Cache())
		}
	}
	if e.store.gets != 0 || e.store.sets != 0 || e.cat.calls.Load() != 3 || e.m.count("bypass") != 3 {
		t.Fatalf("q não vazio deve ficar fora do cache: gets=%d sets=%d calls=%d bypass=%d", e.store.gets, e.store.sets, e.cat.calls.Load(), e.m.count("bypass"))
	}
}

func TestCache_ListWithoutSearchIsCachedAndKeyIsNormalized(t *testing.T) {
	e := newEnv(t)
	q := domain.ListQuery{State: "SP", Biome: domain.BiomeCerrado, Limit: 20}
	_, _ = e.c.ListSpecies(context.Background(), q)
	_, _ = e.c.ListSpecies(context.Background(), q) // mesma consulta normalizada → mesma chave
	if len(e.store.keys()) != 1 || e.cat.calls.Load() != 1 {
		t.Fatalf("mesma consulta = uma chave e uma chamada: keys=%v calls=%d", e.store.keys(), e.cat.calls.Load())
	}
	_, _ = e.c.ListSpecies(context.Background(), domain.ListQuery{State: "SP", Biome: domain.BiomeCerrado, Limit: 10}) // limit diferente
	_, _ = e.c.ListSpecies(context.Background(), domain.ListQuery{State: "RJ", Biome: domain.BiomeCerrado, Limit: 20})
	_, _ = e.c.ListSpecies(context.Background(), domain.ListQuery{State: "SP", Biome: domain.BiomeCerrado, Limit: 20, Cursor: "abc"})
	if len(e.store.keys()) != 4 {
		t.Fatalf("limit, estado e cursor diferentes geram chaves diferentes: %v", e.store.keys())
	}
	for _, k := range e.store.keys() {
		if len(k) < len("bff:v1:list:")+64 || k[:12] != "bff:v1:list:" {
			t.Errorf("chave fora do padrão bff:v1:list:{sha256}: %s", k)
		}
	}
}

func TestCache_FiltersAreCached(t *testing.T) {
	e := newEnv(t)
	_, _ = e.c.ListFilters(context.Background())
	f, err := e.c.ListFilters(context.Background())
	if err != nil || len(f.Biomes) != 1 || e.cat.calls.Load() != 1 || e.store.keys()[0] != "bff:v1:filters" {
		t.Fatalf("filtros: %+v err=%v calls=%d keys=%v", f, err, e.cat.calls.Load(), e.store.keys())
	}
}

func TestCache_InvalidEnvelopeIsMiss(t *testing.T) {
	e := newEnv(t)
	e.store.data["bff:v1:species:sabia"] = []byte("{isto não é um envelope")
	ctx, meta := ctxWithMeta()
	if _, err := e.c.GetSpecies(ctx, "sabia"); err != nil || meta.Cache() != "miss" || e.cat.calls.Load() != 1 {
		t.Fatalf("envelope inválido = miss: err=%v cache=%q calls=%d", err, meta.Cache(), e.cat.calls.Load())
	}
	if string(e.store.data["bff:v1:species:sabia"]) == "{isto não é um envelope" {
		t.Fatal("o envelope ruim deveria ser sobrescrito pelo bom")
	}
}

func TestCache_RedisDownIsMissAndNeverBreaksTheRequest(t *testing.T) {
	e := newEnv(t)
	e.store.getErr, e.store.setErr = errBoom, errBoom
	ctx, meta := ctxWithMeta()
	s, err := e.c.GetSpecies(ctx, "sabia")
	if err != nil || s.ID != "sabia" || meta.Cache() != "miss" {
		t.Fatalf("Redis fora do ar não pode derrubar: err=%v cache=%q", err, meta.Cache())
	}
	if e.m.count("error") == 0 {
		t.Fatalf("a falha do Redis deveria ser contada: %v", e.m.cache)
	}
}

func TestCache_SingleflightCollapsesConcurrentCalls(t *testing.T) {
	e := newEnv(t)
	e.cat.gate = make(chan struct{})
	e.cat.entered = make(chan struct{}, 1)
	var wg sync.WaitGroup
	results := make(chan error, 10)
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := e.c.GetSpecies(context.Background(), "sabia")
			results <- err
		}()
	}
	<-e.cat.entered
	time.Sleep(50 * time.Millisecond) // dá tempo de todos entrarem no mesmo voo
	close(e.cat.gate)
	wg.Wait()
	close(results)
	for err := range results {
		if err != nil {
			t.Fatal(err)
		}
	}
	if e.cat.calls.Load() != 1 {
		t.Fatalf("10 chamadores, 1 chamada ao catalog; houve %d", e.cat.calls.Load())
	}
}

// Review Focus #1: o primeiro chamador desiste, o segundo (no mesmo voo) ainda recebe o dado.
func TestCache_FirstCallerCancelsSecondStillGetsData(t *testing.T) {
	e := newEnv(t)
	e.cat.gate = make(chan struct{})
	e.cat.entered = make(chan struct{}, 1)
	ctx1, cancel1 := context.WithCancel(context.Background())
	res1, res2 := make(chan error, 1), make(chan error, 1)
	var got domain.Species
	go func() { _, err := e.c.GetSpecies(ctx1, "sabia"); res1 <- err }()
	<-e.cat.entered // o voo começou com o contexto do 1º chamador
	go func() {
		s, err := e.c.GetSpecies(context.Background(), "sabia")
		got = s
		res2 <- err
	}()
	time.Sleep(50 * time.Millisecond) // o 2º entra no mesmo voo
	cancel1()
	if err := <-res1; domain.KindOf(err) != domain.KindCanceled {
		t.Fatalf("o 1º chamador deveria receber Canceled: %v", err)
	}
	close(e.cat.gate) // o catalog responde
	if err := <-res2; err != nil || got.ID != "sabia" {
		t.Fatalf("o 2º chamador não pode herdar o cancelamento do 1º: err=%v got=%+v", err, got)
	}
	if e.cat.calls.Load() != 1 {
		t.Fatalf("uma só chamada ao catalog: %d", e.cat.calls.Load())
	}
}

func TestCache_ExpiredBudgetWithCandidateServesStale(t *testing.T) {
	e := newEnv(t)
	_, _ = e.c.GetSpecies(context.Background(), "sabia") // guarda um candidato
	e.clk.Advance(30 * time.Minute)
	e.cat.gate = make(chan struct{}) // o catalog "trava"
	defer close(e.cat.gate)
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Millisecond) // o orçamento da requisição estoura
	defer cancel()
	rctx, meta := reqmeta.With(ctx, reqmeta.New("r")), (*reqmeta.Meta)(nil)
	meta = reqmeta.From(rctx)
	s, err := e.c.GetSpecies(rctx, "sabia")
	if err != nil || s.ID != "sabia" || meta.Cache() != "stale" {
		t.Fatalf("estourou o orçamento com candidato em memória: serve stale. err=%v cache=%q", err, meta.Cache())
	}
}

func TestCache_ClientCancelWithCandidateIsStillAnError(t *testing.T) {
	e := newEnv(t)
	_, _ = e.c.GetSpecies(context.Background(), "sabia")
	e.clk.Advance(30 * time.Minute)
	e.cat.gate = make(chan struct{})
	defer close(e.cat.gate)
	ctx, cancel := context.WithCancel(context.Background())
	go func() { time.Sleep(30 * time.Millisecond); cancel() }()
	if _, err := e.c.GetSpecies(ctx, "sabia"); domain.KindOf(err) != domain.KindCanceled {
		t.Fatalf("cliente que desistiu recebe o erro do contexto, não stale: %v", err)
	}
}

func TestCache_DetailRoundTripKeepsEveryField(t *testing.T) {
	e := newEnv(t)
	size, diet := 23, "frutos"
	e.cat.species = domain.Species{
		CommonName: "Sabiá", ScientificName: "Turdus rufiventris", Family: "Turdidae", SizeCm: &size, Diet: &diet, Conservation: "LC",
		Description: "d", DescriptionCredit: domain.Credit{Author: "a", License: "l", Source: "s", SourceURL: "u"},
		Facts: []domain.Fact{{Text: "t", Source: "s"}}, Biomes: []domain.Biome{domain.BiomeCerrado}, States: []string{"SP"},
		Photos:   []domain.Photo{{ThumbKey: "t", MediumKey: "m", LargeKey: "l", Width: 1, Height: 2, Credit: domain.Credit{Author: "p"}}},
		Audio:    &domain.Audio{Key: "k", DurationMs: 5, Credit: domain.Credit{Author: "z"}},
		Clusters: []domain.Cluster{{Lat: 1, Lng: 2, Count: 3, Precision: 0.5}},
	}
	first, _ := e.c.GetSpecies(context.Background(), "sabia")
	second, err := e.c.GetSpecies(context.Background(), "sabia") // veio do Redis
	if err != nil {
		t.Fatal(err)
	}
	if e.cat.calls.Load() != 1 || second.CommonName != first.CommonName || *second.SizeCm != 23 || *second.Diet != "frutos" ||
		second.Audio == nil || second.Audio.Key != "k" || len(second.Photos) != 1 || second.Photos[0].LargeKey != "l" ||
		len(second.Clusters) != 1 || second.Clusters[0].Precision != 0.5 || len(second.Biomes) != 1 || second.States[0] != "SP" || second.Facts[0].Text != "t" {
		t.Fatalf("o que sai do cache precisa ser igual ao que entrou: %+v", second)
	}
	_ = errors.New
}
```

`internal/adapter/cache/redis_store_test.go`:

```go
package cache_test

import (
	"context"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"

	"github.com/velosobr/passarim-bff/internal/adapter/cache"
)

func startRedis(t *testing.T) (*redis.Client, *tcredis.RedisContainer) {
	t.Helper()
	if testing.Short() {
		t.Skip("integração: precisa de Docker")
	}
	ctx := context.Background()
	ctr, err := tcredis.Run(ctx, "redis:8-alpine")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ctr.Terminate(context.Background()) })
	uri, err := ctr.ConnectionString(ctx)
	if err != nil {
		t.Fatal(err)
	}
	opt, err := redis.ParseURL(uri)
	if err != nil {
		t.Fatal(err)
	}
	opt.MaxRetries = -1 // -1 desliga os retries internos do go-redis: erro rápido quando o Redis cai
	c := redis.NewClient(opt)
	t.Cleanup(func() { _ = c.Close() })
	return c, ctr
}

func TestRedisStore_GetSetAndTTL(t *testing.T) {
	client, _ := startRedis(t)
	st := cache.NewRedisStore(client, 500*time.Millisecond)
	ctx := context.Background()
	if _, found, err := st.Get(ctx, "bff:v1:x"); err != nil || found {
		t.Fatalf("chave ausente: found=%v err=%v", found, err)
	}
	if err := st.Set(ctx, "bff:v1:x", []byte(`{"a":1}`), 2*time.Hour); err != nil {
		t.Fatal(err)
	}
	v, found, err := st.Get(ctx, "bff:v1:x")
	if err != nil || !found || string(v) != `{"a":1}` {
		t.Fatalf("get: %q %v %v", v, found, err)
	}
	if ttl := client.TTL(ctx, "bff:v1:x").Val(); ttl < time.Hour || ttl > 2*time.Hour {
		t.Fatalf("TTL aplicado deveria ser ~2h: %v", ttl)
	}
}

func TestRedisStore_RedisDownReturnsErrorQuickly(t *testing.T) {
	client, ctr := startRedis(t)
	st := cache.NewRedisStore(client, 200*time.Millisecond)
	if err := ctr.Stop(context.Background(), nil); err != nil {
		t.Fatal(err)
	}
	start := time.Now()
	if _, _, err := st.Get(context.Background(), "k"); err == nil {
		t.Fatal("com o Redis parado, Get deveria dar erro")
	}
	if err := st.Set(context.Background(), "k", []byte("v"), time.Minute); err == nil {
		t.Fatal("com o Redis parado, Set deveria dar erro")
	}
	if time.Since(start) > 2*time.Second {
		t.Fatalf("o timeout por operação deveria limitar a espera: %v", time.Since(start))
	}
}
```

- [ ] **Step 7: Ver falhar** — `go test ./internal/adapter/cache/` → FAIL (pacote sem código).

- [ ] **Step 8: Implementar o cache**

`internal/adapter/cache/keys.go`:

```go
package cache

import (
	"crypto/sha256"
	"encoding/hex"
	"strconv"

	"github.com/velosobr/passarim-bff/internal/domain"
)

// "v1" é a versão do FORMATO do envelope: se a struct do envelope mudar, suba para v2
// (as chaves antigas simplesmente deixam de ser lidas e expiram sozinhas).
const keyPrefix = "bff:v1:"

func speciesKey(id string) string { return keyPrefix + "species:" + id }

const filtersKey = keyPrefix + "filters"

// listKey: o hash é calculado sobre o ListQuery JÁ normalizado (q aparado, UF em maiúsculas,
// limit efetivo), então consultas equivalentes compartilham a mesma chave. Os campos entram
// com tamanho na frente para "a|b" + "c" nunca colidir com "a" + "b|c".
func listKey(q domain.ListQuery) string {
	h := sha256.New()
	for _, part := range []string{q.Q, string(q.Biome), q.State, q.Cursor, strconv.Itoa(q.Limit)} {
		h.Write([]byte(strconv.Itoa(len(part))))
		h.Write([]byte{':'})
		h.Write([]byte(part))
	}
	return keyPrefix + "list:" + hex.EncodeToString(h.Sum(nil))
}
```

`internal/adapter/cache/dto.go`:

```go
package cache

import "github.com/velosobr/passarim-bff/internal/domain"

// Estas structs são o FORMATO GRAVADO no Redis (com tags JSON). O domínio não
// tem JSON de propósito: assim renomear um campo do domínio não muda, sem aviso,
// o que está guardado.

type creditJSON struct {
	Author    string `json:"author"`
	License   string `json:"license"`
	Source    string `json:"source"`
	SourceURL string `json:"sourceUrl"`
}

type summaryJSON struct {
	ID           string `json:"id"`
	Scientific   string `json:"scientificName"`
	Common       string `json:"commonName"`
	ThumbnailKey string `json:"thumbnailKey"`
	Conservation string `json:"conservation"`
}

type pageJSON struct {
	Items      []summaryJSON `json:"items"`
	NextCursor string        `json:"nextCursor"`
}

type photoJSON struct {
	Thumb  string     `json:"thumbKey"`
	Medium string     `json:"mediumKey"`
	Large  string     `json:"largeKey"`
	Width  int        `json:"width"`
	Height int        `json:"height"`
	Credit creditJSON `json:"credit"`
}

type audioJSON struct {
	Key        string     `json:"key"`
	DurationMs int        `json:"durationMs"`
	Credit     creditJSON `json:"credit"`
}

type factJSON struct {
	Text   string `json:"text"`
	Source string `json:"source"`
}

type clusterJSON struct {
	Lat       float64 `json:"lat"`
	Lng       float64 `json:"lng"`
	Count     int     `json:"count"`
	Precision float64 `json:"precision"`
}

type speciesJSON struct {
	ID           string        `json:"id"`
	Scientific   string        `json:"scientificName"`
	Common       string        `json:"commonName"`
	Family       string        `json:"family"`
	SizeCm       *int          `json:"sizeCm"`
	Diet         *string       `json:"diet"`
	Conservation string        `json:"conservation"`
	Description  string        `json:"description"`
	DescCredit   creditJSON    `json:"descriptionCredit"`
	Facts        []factJSON    `json:"facts"`
	Biomes       []string      `json:"biomes"`
	States       []string      `json:"states"`
	Photos       []photoJSON   `json:"photos"`
	Audio        *audioJSON    `json:"audio"`
	Clusters     []clusterJSON `json:"clusters"`
}

type filtersJSON struct {
	Biomes []struct {
		Biome string `json:"biome"`
		Count int    `json:"count"`
	} `json:"biomes"`
	States []struct {
		State string `json:"state"`
		Count int    `json:"count"`
	} `json:"states"`
}

func creditTo(c domain.Credit) creditJSON {
	return creditJSON{c.Author, c.License, c.Source, c.SourceURL}
}
func creditFrom(c creditJSON) domain.Credit { return domain.Credit{Author: c.Author, License: c.License, Source: c.Source, SourceURL: c.SourceURL} }

func pageTo(p domain.SpeciesPage) pageJSON {
	out := pageJSON{NextCursor: p.NextCursor, Items: make([]summaryJSON, 0, len(p.Items))}
	for _, s := range p.Items {
		out.Items = append(out.Items, summaryJSON{s.ID, s.ScientificName, s.CommonName, s.ThumbnailKey, string(s.Conservation)})
	}
	return out
}

func pageFrom(p pageJSON) domain.SpeciesPage {
	out := domain.SpeciesPage{NextCursor: p.NextCursor, Items: make([]domain.Summary, 0, len(p.Items))}
	for _, s := range p.Items {
		out.Items = append(out.Items, domain.Summary{ID: s.ID, ScientificName: s.Scientific, CommonName: s.Common, ThumbnailKey: s.ThumbnailKey, Conservation: domain.ConservationStatus(s.Conservation)})
	}
	return out
}

func speciesTo(s domain.Species) speciesJSON {
	out := speciesJSON{ID: s.ID, Scientific: s.ScientificName, Common: s.CommonName, Family: s.Family, SizeCm: s.SizeCm, Diet: s.Diet,
		Conservation: string(s.Conservation), Description: s.Description, DescCredit: creditTo(s.DescriptionCredit), States: s.States}
	for _, f := range s.Facts {
		out.Facts = append(out.Facts, factJSON{f.Text, f.Source})
	}
	for _, b := range s.Biomes {
		out.Biomes = append(out.Biomes, string(b))
	}
	for _, p := range s.Photos {
		out.Photos = append(out.Photos, photoJSON{p.ThumbKey, p.MediumKey, p.LargeKey, p.Width, p.Height, creditTo(p.Credit)})
	}
	if s.Audio != nil {
		out.Audio = &audioJSON{s.Audio.Key, s.Audio.DurationMs, creditTo(s.Audio.Credit)}
	}
	for _, c := range s.Clusters {
		out.Clusters = append(out.Clusters, clusterJSON{c.Lat, c.Lng, c.Count, c.Precision})
	}
	return out
}

func speciesFrom(s speciesJSON) domain.Species {
	out := domain.Species{ID: s.ID, ScientificName: s.Scientific, CommonName: s.Common, Family: s.Family, SizeCm: s.SizeCm, Diet: s.Diet,
		Conservation: domain.ConservationStatus(s.Conservation), Description: s.Description, DescriptionCredit: creditFrom(s.DescCredit), States: s.States}
	for _, f := range s.Facts {
		out.Facts = append(out.Facts, domain.Fact{Text: f.Text, Source: f.Source})
	}
	for _, b := range s.Biomes {
		out.Biomes = append(out.Biomes, domain.Biome(b))
	}
	for _, p := range s.Photos {
		out.Photos = append(out.Photos, domain.Photo{ThumbKey: p.Thumb, MediumKey: p.Medium, LargeKey: p.Large, Width: p.Width, Height: p.Height, Credit: creditFrom(p.Credit)})
	}
	if s.Audio != nil {
		out.Audio = &domain.Audio{Key: s.Audio.Key, DurationMs: s.Audio.DurationMs, Credit: creditFrom(s.Audio.Credit)}
	}
	for _, c := range s.Clusters {
		out.Clusters = append(out.Clusters, domain.Cluster{Lat: c.Lat, Lng: c.Lng, Count: c.Count, Precision: c.Precision})
	}
	return out
}

func filtersTo(f domain.Filters) filtersJSON {
	var out filtersJSON
	for _, b := range f.Biomes {
		out.Biomes = append(out.Biomes, struct {
			Biome string `json:"biome"`
			Count int    `json:"count"`
		}{string(b.Biome), b.SpeciesCount})
	}
	for _, s := range f.States {
		out.States = append(out.States, struct {
			State string `json:"state"`
			Count int    `json:"count"`
		}{s.State, s.SpeciesCount})
	}
	return out
}

func filtersFrom(f filtersJSON) domain.Filters {
	var out domain.Filters
	for _, b := range f.Biomes {
		out.Biomes = append(out.Biomes, domain.BiomeCount{Biome: domain.Biome(b.Biome), SpeciesCount: b.Count})
	}
	for _, s := range f.States {
		out.States = append(out.States, domain.StateCount{State: s.State, SpeciesCount: s.Count})
	}
	return out
}
```

`internal/adapter/cache/store.go`:

```go
package cache

import (
	"context"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
)

// Store é o armazenamento de bytes do cache (o Redis em produção; um mapa nos testes).
type Store interface {
	Get(ctx context.Context, key string) (value []byte, found bool, err error)
	Set(ctx context.Context, key string, value []byte, ttl time.Duration) error
}

// RedisStore implementa Store com go-redis. Cada operação tem um timeout PRÓPRIO
// (REDIS_TIMEOUT): um Redis lento não pode comer o orçamento da requisição.
type RedisStore struct {
	c       *redis.Client
	timeout time.Duration
}

func NewRedisStore(c *redis.Client, timeout time.Duration) *RedisStore {
	return &RedisStore{c: c, timeout: timeout}
}

func (s *RedisStore) Get(ctx context.Context, key string) ([]byte, bool, error) {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	v, err := s.c.Get(ctx, key).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, false, nil // chave ausente não é erro
	}
	if err != nil {
		return nil, false, err
	}
	return v, true, nil
}

func (s *RedisStore) Set(ctx context.Context, key string, value []byte, ttl time.Duration) error {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	return s.c.Set(ctx, key, value, ttl).Err()
}
```

`internal/adapter/cache/cache.go`:

```go
// Package cache é o decorator MAIS EXTERNO da cadeia: guarda as respostas do
// catalog no Redis e, quando o catalog falha, serve o dado velho
// (stale-while-error) em vez de um erro. Algoritmo e classificação de erros: spec §5.2 e §5.3.
package cache

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"golang.org/x/sync/singleflight"

	"github.com/velosobr/passarim-bff/internal/adapter/metrics"
	"github.com/velosobr/passarim-bff/internal/adapter/reqmeta"
	"github.com/velosobr/passarim-bff/internal/domain"
	"github.com/velosobr/passarim-bff/internal/usecase"
)

type Config struct {
	FreshTTL time.Duration // até quando o dado é "fresco" (decidido em código, não pelo Redis)
	StaleTTL time.Duration // TTL no Redis = janela em que o dado velho ainda pode ser servido
	Budget   time.Duration // orçamento da chamada compartilhada ao catalog (singleflight)
	Now      func() time.Time
}

type cache struct {
	next  usecase.CatalogReader
	store Store
	cfg   Config
	log   *slog.Logger
	m     metrics.Metrics
	sf    singleflight.Group // por processo: cada réplica tem o seu
}

func New(next usecase.CatalogReader, store Store, cfg Config, log *slog.Logger, m metrics.Metrics) usecase.CatalogReader {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	return &cache{next: next, store: store, cfg: cfg, log: log, m: m}
}

// envelope é o que fica no Redis: o dado + quando foi gravado.
type envelope[D any] struct {
	StoredAt time.Time `json:"storedAt"`
	Data     D         `json:"data"`
}

type flightResult[T any] struct {
	value T
	err   error
}

// cached implementa o algoritmo da spec §5.2 para qualquer tipo T (domínio) / D (formato gravado).
func cached[T, D any](ctx context.Context, c *cache, key string, call func(context.Context) (T, error), enc func(T) D, dec func(D) T) (T, error) {
	meta := reqmeta.From(ctx)
	var zero T

	// 1. Lê o envelope ANTES de chamar o catalog; guarda em memória como candidato a stale.
	var candidate T
	var storedAt time.Time
	haveCandidate := false
	raw, found, err := c.store.Get(ctx, key)
	if err != nil {
		c.m.CacheResult("error")
		c.log.WarnContext(ctx, "Redis indisponível (leitura): seguindo como miss", "request_id", meta.RequestID(), "error", err)
	} else if found {
		var env envelope[D]
		if jerr := json.Unmarshal(raw, &env); jerr != nil {
			c.log.WarnContext(ctx, "envelope do cache ilegível: tratando como miss", "request_id", meta.RequestID(), "error", jerr)
		} else {
			candidate, storedAt, haveCandidate = dec(env.Data), env.StoredAt, true
		}
	}

	// 2. Fresco → devolve direto.
	if haveCandidate && c.cfg.Now().Sub(storedAt) < c.cfg.FreshTTL {
		c.m.CacheResult("hit")
		meta.SetCache("hit")
		return candidate, nil
	}

	// 3. Um único voo por chave. A função compartilhada NÃO usa o contexto do 1º chamador
	// (se ele desistir, os outros não podem sofrer): usa WithoutCancel (mantém request_id
	// e trace) + um orçamento próprio.
	ch := c.sf.DoChan(key, func() (any, error) {
		fctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), c.cfg.Budget)
		defer cancel()
		v, err := call(fctx)
		if err != nil {
			return flightResult[T]{err: err}, nil
		}
		if body, merr := json.Marshal(envelope[D]{StoredAt: c.cfg.Now(), Data: enc(v)}); merr == nil {
			if serr := c.store.Set(fctx, key, body, c.cfg.StaleTTL); serr != nil {
				c.m.CacheResult("error")
				c.log.WarnContext(fctx, "Redis indisponível (gravação)", "error", serr)
			}
		}
		return flightResult[T]{value: v}, nil
	})

	// 4. Cada chamador espera pelo resultado OU pela sua própria desistência.
	select {
	case res := <-ch:
		fr := res.Val.(flightResult[T])
		if fr.err == nil { // 5. sucesso
			c.m.CacheResult("miss")
			meta.SetCache("miss")
			return fr.value, nil
		}
		// 6/8. Erro: só os que "liberam stale" e só com candidato em memória.
		if domain.KindOf(fr.err).AllowsStale() && haveCandidate {
			c.log.WarnContext(ctx, "catalog falhou: servindo dado velho", "request_id", meta.RequestID(), "kind", domain.KindOf(fr.err).String(), "error", fr.err)
			c.m.CacheResult("stale")
			meta.SetCache("stale")
			return candidate, nil
		}
		return zero, fr.err
	case <-ctx.Done():
		// 7. Orçamento estourou e há candidato → stale. Cliente desistiu (ou sem candidato) → erro do contexto.
		if errors.Is(ctx.Err(), context.DeadlineExceeded) && haveCandidate {
			c.m.CacheResult("stale")
			meta.SetCache("stale")
			return candidate, nil
		}
		return zero, domain.NewError(domain.KindOf(ctx.Err()), ctx.Err())
	}
}

func (c *cache) GetSpecies(ctx context.Context, id string) (domain.Species, error) {
	return cached(ctx, c, speciesKey(id),
		func(cx context.Context) (domain.Species, error) { return c.next.GetSpecies(cx, id) }, speciesTo, speciesFrom)
}

func (c *cache) ListFilters(ctx context.Context) (domain.Filters, error) {
	return cached(ctx, c, filtersKey,
		func(cx context.Context) (domain.Filters, error) { return c.next.ListFilters(cx) }, filtersTo, filtersFrom)
}

func (c *cache) ListSpecies(ctx context.Context, q domain.ListQuery) (domain.SpeciesPage, error) {
	if q.Q != "" {
		// Busca com texto livre: cardinalidade ilimitada → fora do cache (sem Redis, sem
		// singleflight, sem stale). O X-Cache sai "miss".
		c.m.CacheResult("bypass")
		reqmeta.From(ctx).SetCache("miss")
		return c.next.ListSpecies(ctx, q)
	}
	return cached(ctx, c, listKey(q),
		func(cx context.Context) (domain.SpeciesPage, error) { return c.next.ListSpecies(cx, q) }, pageTo, pageFrom)
}
```

- [ ] **Step 9: Ver passar** — `go mod tidy && go test -race ./internal/adapter/... && golangci-lint run`. Expected: ok (o teste Redis sobe um container; pode demorar na primeira vez). Se `golangci-lint` reclamar de `unused` no `_ = errors.New` do teste, remova essa linha e o import `errors` do `cache_test.go`.
- [ ] **Step 10: Commit** — `git add -A && git commit -m "feat: decorators de retry, circuit breaker e cache Redis com stale-while-error"`

---

### Task 7: `openapi.yaml` e teste de contrato

**Files:** `openapi.yaml`; `internal/adapter/http/handler.go` (registrar os padrões das rotas); `internal/adapter/http/contract_test.go`

**Interfaces (Consumes):** `httpadapter.Handler` e `Routes()` (Task 4), toda a pilha de middlewares (Task 5), os casos de uso (Task 2).
**Interfaces (Produces):** `openapi.yaml` (OpenAPI 3.0.3, fonte do contrato); `(*Handler).Patterns() []string` — os padrões registrados em `Routes()` (usado pelo teste para garantir que toda rota registrada está documentada). O teste de contrato passa a ser a trava de CI: contrato e código não podem divergir.

Pré-requisito: `go get github.com/getkin/kin-openapi github.com/gorilla/mux` (o roteador `gorillamux` do kin-openapi usa o `mux` da gorilla).

- [ ] **Step 1: Teste de contrato que falha** — `internal/adapter/http/contract_test.go`:

```go
package httpadapter_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/getkin/kin-openapi/routers"
	"github.com/getkin/kin-openapi/routers/gorillamux"

	httpadapter "github.com/velosobr/passarim-bff/internal/adapter/http"
	"github.com/velosobr/passarim-bff/internal/adapter/http/middleware"
	"github.com/velosobr/passarim-bff/internal/adapter/media"
	"github.com/velosobr/passarim-bff/internal/domain"
	"github.com/velosobr/passarim-bff/internal/usecase"
)

// stubCatalog é o "catalog" por baixo dos casos de uso REAIS: cada cenário escolhe o que ele devolve.
type stubCatalog struct {
	page    domain.SpeciesPage
	species domain.Species
	filters domain.Filters
	err     error
}

func (s *stubCatalog) ListSpecies(context.Context, domain.ListQuery) (domain.SpeciesPage, error) {
	return s.page, s.err
}
func (s *stubCatalog) GetSpecies(context.Context, string) (domain.Species, error) { return s.species, s.err }
func (s *stubCatalog) ListFilters(context.Context) (domain.Filters, error)        { return s.filters, s.err }

var _ usecase.CatalogReader = (*stubCatalog)(nil)

// stack monta a MESMA pilha do main: middlewares + roteador + casos de uso reais.
func stack(t *testing.T, cat usecase.CatalogReader, burst int) (http.Handler, *httpadapter.Handler) {
	t.Helper()
	log := slog.New(slog.DiscardHandler)
	m, err := media.New("http://localhost:8888/buckets/passarim-media", log)
	if err != nil {
		t.Fatal(err)
	}
	h := &httpadapter.Handler{
		List:    usecase.ListSpecies{Catalog: cat, Budget: time.Second},
		Get:     usecase.GetSpecies{Catalog: cat, Budget: time.Second},
		Filters: usecase.ListFilters{Catalog: cat, Budget: time.Second},
		Media:   m, Log: log,
	}
	ip := func(*http.Request) string { return "203.0.113.9" }
	rl := middleware.NewRateLimiter(middleware.RateLimitConfig{RPS: 1, Burst: burst, MaxIPs: 10, IdleAfter: time.Minute}, ip, time.Now)
	return middleware.Chain(h.Routes(), middleware.Recovery(log), middleware.RequestID(), middleware.AccessLog(log, ip, nil),
		middleware.SecurityHeaders(), rl.Middleware(), middleware.Limits()), h
}

func loadSpec(t *testing.T) (*openapi3.T, routers.Router) {
	t.Helper()
	doc, err := openapi3.NewLoader().LoadFromFile("../../../openapi.yaml")
	if err != nil {
		t.Fatalf("openapi.yaml não carrega: %v", err)
	}
	if err := doc.Validate(context.Background()); err != nil {
		t.Fatalf("openapi.yaml inválido: %v", err)
	}
	r, err := gorillamux.NewRouter(doc)
	if err != nil {
		t.Fatal(err)
	}
	return doc, r
}

// validate confere UMA resposta real contra o contrato (status, cabeçalhos, tipo do corpo e schema).
func validate(t *testing.T, router routers.Router, req *http.Request, rec *httptest.ResponseRecorder) {
	t.Helper()
	route, params, err := router.FindRoute(req)
	if err != nil {
		t.Fatalf("%s %s não existe no openapi.yaml: %v", req.Method, req.URL.Path, err)
	}
	err = openapi3filter.ValidateResponse(context.Background(), &openapi3filter.ResponseValidationInput{
		RequestValidationInput: &openapi3filter.RequestValidationInput{Request: req, PathParams: params, Route: route},
		Status:                 rec.Code,
		Header:                 rec.Header(),
		Body:                   io.NopCloser(bytes.NewReader(rec.Body.Bytes())),
	})
	if err != nil {
		t.Errorf("%s %s → %d viola o contrato: %v\ncorpo: %s", req.Method, req.URL.RequestURI(), rec.Code, err, rec.Body.String())
	}
}

func fullSpecies() domain.Species {
	size, diet := 23, "Frutos e insetos"
	return domain.Species{
		ID: "turdus-rufiventris", CommonName: "Sabiá-laranjeira", ScientificName: "Turdus rufiventris", Family: "Turdidae",
		Conservation: "LC", SizeCm: &size, Diet: &diet, Description: "d",
		DescriptionCredit: domain.Credit{Author: "Passarim", License: "CC-BY-SA", Source: "curated", SourceURL: "https://pt.wikipedia.org/x"},
		Facts:             []domain.Fact{{Text: "f", Source: "s"}},
		Biomes:            []domain.Biome{domain.BiomeMataAtlantica},
		States:            []string{"SP"},
		Photos: []domain.Photo{{ThumbKey: "species/t/photo-1-thumb.webp", MediumKey: "species/t/photo-1-medium.webp", LargeKey: "species/t/photo-1-large.webp",
			Width: 1600, Height: 1067, Credit: domain.Credit{Author: "Fulano", License: "CC-BY-NC", Source: "inaturalist", SourceURL: "https://www.inaturalist.org/photos/1"}}},
		Audio:    &domain.Audio{Key: "species/t/audio-9.aac", DurationMs: 21500, Credit: domain.Credit{Author: "B", License: "CC-BY-NC-SA", Source: "xeno-canto", SourceURL: "https://xeno-canto.org/9"}},
		Clusters: []domain.Cluster{{Lat: -23.5, Lng: -46.6, Count: 42, Precision: 0.5}},
	}
}

// validateProblemSchema: rota inexistente e método inválido não têm operação no contrato
// (o FindRoute do kin-openapi não os encontra), então o corpo é validado contra o schema Problem.
func validateProblemSchema(t *testing.T, doc *openapi3.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	if ct := rec.Header().Get("Content-Type"); ct != "application/problem+json" {
		t.Errorf("Content-Type = %q, esperado application/problem+json", ct)
	}
	var body any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("corpo não é JSON: %v", err)
	}
	if err := doc.Components.Schemas["Problem"].Value.VisitJSON(body); err != nil {
		t.Errorf("corpo viola o schema Problem: %v\n%s", err, rec.Body.String())
	}
}

func TestContract_ResponsesMatchOpenAPI(t *testing.T) {
	doc, router := loadSpec(t)
	unavailable := domain.NewError(domain.KindUnavailable, errors.New("segredo-interno"))
	cases := []struct {
		name, method, target string
		cat                  *stubCatalog
		want                 int
		schemaOnly           bool // sem operação no contrato: valida só o schema Problem
	}{
		{"lista 200", "GET", "/v1/species?state=sp&limit=5", &stubCatalog{page: domain.SpeciesPage{Items: []domain.Summary{
			{ID: "a", CommonName: "A", ScientificName: "A a", ThumbnailKey: "species/a/photo-1-thumb.webp", Conservation: "VU"},
			{ID: "b", CommonName: "B", ScientificName: "B b"}}, NextCursor: "abc"}}, 200, false},
		{"lista vazia 200", "GET", "/v1/species", &stubCatalog{}, 200, false},
		{"detalhe completo 200", "GET", "/v1/species/turdus-rufiventris", &stubCatalog{species: fullSpecies()}, 200, false},
		{"detalhe só com o mínimo 200 (nulos e listas vazias)", "GET", "/v1/species/x", &stubCatalog{species: domain.Species{ID: "x"}}, 200, false},
		{"filtros 200", "GET", "/v1/filters", &stubCatalog{filters: domain.Filters{
			Biomes: []domain.BiomeCount{{Biome: domain.BiomePampa, SpeciesCount: 3}}, States: []domain.StateCount{{State: "RS", SpeciesCount: 5}}}}, 200, false},
		{"400 parâmetros inválidos", "GET", "/v1/species?limit=999&state=XX&biome=deserto", &stubCatalog{}, 400, false},
		{"400 id inválido", "GET", "/v1/species/ABC_def", &stubCatalog{}, 400, false},
		{"404 espécie", "GET", "/v1/species/nao-existe", &stubCatalog{err: domain.NewError(domain.KindNotFound, errors.New("x"))}, 404, false},
		{"404 rota", "GET", "/v1/species/a/b/c", &stubCatalog{}, 404, true},
		{"405 método", "POST", "/v1/species", &stubCatalog{}, 405, true},
		{"503 catalog fora", "GET", "/v1/species/x", &stubCatalog{err: unavailable}, 503, false},
		{"500 erro interno", "GET", "/v1/filters", &stubCatalog{err: domain.NewError(domain.KindInternal, errors.New("x"))}, 500, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h, _ := stack(t, c.cat, 100)
			req := httptest.NewRequest(c.method, c.target, nil)
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != c.want {
				t.Fatalf("status %d, esperado %d: %s", rec.Code, c.want, rec.Body.String())
			}
			if strings.Contains(rec.Body.String(), "segredo-interno") {
				t.Fatal("texto interno vazou")
			}
			if c.schemaOnly {
				validateProblemSchema(t, doc, rec)
				return
			}
			validate(t, router, req, rec)
		})
	}
}

func TestContract_RateLimited429(t *testing.T) {
	_, router := loadSpec(t)
	h, _ := stack(t, &stubCatalog{}, 1) // balde de 1 ficha
	var last *httptest.ResponseRecorder
	var lastReq *http.Request
	for i := 0; i < 2; i++ {
		lastReq = httptest.NewRequest("GET", "/v1/filters", nil)
		last = httptest.NewRecorder()
		h.ServeHTTP(last, lastReq)
	}
	if last.Code != 429 {
		t.Fatalf("a 2ª requisição deveria ser 429, foi %d", last.Code)
	}
	validate(t, router, lastReq, last)
}

func TestContract_Panic500(t *testing.T) {
	_, router := loadSpec(t)
	h, _ := stack(t, panicCatalog{}, 100)
	req := httptest.NewRequest("GET", "/v1/filters", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 500 {
		t.Fatalf("panic deveria virar 500: %d", rec.Code)
	}
	validate(t, router, req, rec)
}

type panicCatalog struct{ stubCatalog }

func (panicCatalog) ListFilters(context.Context) (domain.Filters, error) { panic("boom") }

// Toda rota registrada precisa estar documentada: esquecer de atualizar o openapi.yaml quebra o CI.
func TestContract_EveryRegisteredRouteIsDocumented(t *testing.T) {
	doc, _ := loadSpec(t)
	_, h := stack(t, &stubCatalog{}, 1)
	for _, pattern := range h.Patterns() {
		method, path, ok := strings.Cut(pattern, " ")
		if !ok {
			t.Fatalf("padrão sem método: %q", pattern)
		}
		item := doc.Paths.Find(path)
		if item == nil || item.GetOperation(method) == nil {
			t.Errorf("a rota %q está registrada mas não existe no openapi.yaml", pattern)
		}
	}
}

// Contrato sem "rota fantasma": o inverso também vale para os endpoints públicos.
func TestContract_DocumentedPublicRoutesAreRegistered(t *testing.T) {
	doc, _ := loadSpec(t)
	_, h := stack(t, &stubCatalog{}, 1)
	registered := map[string]bool{}
	for _, p := range h.Patterns() {
		registered[p] = true
	}
	for path, item := range doc.Paths.Map() {
		if !strings.HasPrefix(path, "/v1/") {
			continue
		}
		for method := range item.Operations() {
			if !registered[method+" "+path] {
				t.Errorf("%s %s está no openapi.yaml mas não foi registrada", method, path)
			}
		}
	}
}
```

- [ ] **Step 2: Ver falhar** — `go test ./internal/adapter/http/ -run Contract` → FAIL (`openapi.yaml` não existe e `Patterns` não está definido).

- [ ] **Step 3: Registrar os padrões** — em `internal/adapter/http/handler.go`, troque o corpo de `Routes()` e acrescente o campo e o método:

```go
type Handler struct {
	List     SpeciesLister
	Get      SpeciesGetter
	Filters  FiltersLister
	Media    *media.Builder
	Log      *slog.Logger
	patterns []string // padrões registrados em Routes(), para o teste de contrato
}

// Patterns devolve os padrões registrados ("GET /v1/species"...), sem o "/" do 404.
func (h *Handler) Patterns() []string { return h.patterns }

func (h *Handler) Routes() http.Handler {
	mux := http.NewServeMux()
	h.patterns = nil
	reg := func(pattern string, f http.HandlerFunc) {
		mux.HandleFunc(pattern, f)
		h.patterns = append(h.patterns, pattern)
	}
	reg("GET /v1/species", h.listSpecies)
	reg("GET /v1/species/{id}", h.getSpecies)
	reg("GET /v1/filters", h.listFilters)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { // 404 genérico em problem+json
		WriteProblem(w, r, http.StatusNotFound, CodeNotFound, nil)
	})
	return mux
}
```

- [ ] **Step 4: Escrever o `openapi.yaml`** (raiz do repositório). Segue o contrato da spec §4; os endpoints `/healthz` e `/readyz` entram aqui e serão implementados na Task 8:

```yaml
openapi: 3.0.3
info:
  title: Passarim BFF
  version: 1.0.0
  description: |
    API REST do Passarim (catálogo de aves do Brasil). Somente leitura.
    Erros seguem o RFC 9457 (`application/problem+json`) com um `code` estável.
servers:
  - url: /
tags:
  - name: catalog
    description: Catálogo de aves
  - name: operational
    description: Saúde do serviço (não passam pelo balanceador público)
paths:
  /v1/species:
    get:
      tags: [catalog]
      operationId: listSpecies
      summary: Lista de espécies (tela Explorar)
      description: Busca e filtros. Uma busca com `q` nunca é cacheada no servidor.
      parameters:
        - $ref: '#/components/parameters/Q'
        - $ref: '#/components/parameters/Biome'
        - $ref: '#/components/parameters/State'
        - $ref: '#/components/parameters/Cursor'
        - $ref: '#/components/parameters/Limit'
      responses:
        '200':
          description: Página de espécies
          headers:
            X-Request-Id: { $ref: '#/components/headers/XRequestId' }
            X-Cache: { $ref: '#/components/headers/XCache' }
            Cache-Control: { $ref: '#/components/headers/CacheControl' }
          content:
            application/json:
              schema: { $ref: '#/components/schemas/SpeciesPage' }
        '400': { $ref: '#/components/responses/InvalidParameter' }
        '404': { $ref: '#/components/responses/NotFound' }
        '405': { $ref: '#/components/responses/MethodNotAllowed' }
        '429': { $ref: '#/components/responses/RateLimited' }
        '500': { $ref: '#/components/responses/Internal' }
        '503': { $ref: '#/components/responses/ServiceUnavailable' }
  /v1/species/{id}:
    get:
      tags: [catalog]
      operationId: getSpecies
      summary: Detalhe de uma espécie
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string, pattern: '^[a-z0-9-]{1,80}$' }
      responses:
        '200':
          description: Espécie completa
          headers:
            X-Request-Id: { $ref: '#/components/headers/XRequestId' }
            X-Cache: { $ref: '#/components/headers/XCache' }
            Cache-Control: { $ref: '#/components/headers/CacheControl' }
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Species' }
        '400': { $ref: '#/components/responses/InvalidParameter' }
        '404': { $ref: '#/components/responses/SpeciesNotFound' }
        '405': { $ref: '#/components/responses/MethodNotAllowed' }
        '429': { $ref: '#/components/responses/RateLimited' }
        '500': { $ref: '#/components/responses/Internal' }
        '503': { $ref: '#/components/responses/ServiceUnavailable' }
  /v1/filters:
    get:
      tags: [catalog]
      operationId: listFilters
      summary: Biomas e estados com contagem de espécies
      responses:
        '200':
          description: Filtros disponíveis (os `code` valem como `biome` e `state` na lista)
          headers:
            X-Request-Id: { $ref: '#/components/headers/XRequestId' }
            X-Cache: { $ref: '#/components/headers/XCache' }
            Cache-Control: { $ref: '#/components/headers/CacheControl' }
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Filters' }
        '404': { $ref: '#/components/responses/NotFound' }
        '405': { $ref: '#/components/responses/MethodNotAllowed' }
        '429': { $ref: '#/components/responses/RateLimited' }
        '500': { $ref: '#/components/responses/Internal' }
        '503': { $ref: '#/components/responses/ServiceUnavailable' }
  /healthz:
    get:
      tags: [operational]
      operationId: healthz
      summary: Liveness (o processo está vivo)
      responses:
        '200':
          description: Vivo
          content:
            text/plain:
              schema: { type: string }
  /readyz:
    get:
      tags: [operational]
      operationId: readyz
      summary: Readiness (usado pelo Traefik; não depende do catalog nem do Redis)
      responses:
        '200':
          description: Pronto
          content:
            text/plain:
              schema: { type: string }
        '503':
          description: Em desligamento
          content:
            text/plain:
              schema: { type: string }
components:
  parameters:
    Q:
      name: q
      in: query
      description: Busca por nome popular ou científico (até 100 caracteres).
      schema: { type: string, maxLength: 100 }
    Biome:
      name: biome
      in: query
      schema: { $ref: '#/components/schemas/BiomeCode' }
    State:
      name: state
      in: query
      description: UF (aceita minúsculas; a resposta usa sempre maiúsculas).
      schema: { $ref: '#/components/schemas/StateCode' }
    Cursor:
      name: cursor
      in: query
      description: Cursor opaco devolvido em `nextCursor`.
      schema: { type: string, pattern: '^[A-Za-z0-9_-]{1,512}$' }
    Limit:
      name: limit
      in: query
      schema: { type: integer, minimum: 1, maximum: 50, default: 20 }
  headers:
    XRequestId:
      description: Identificador da requisição (o mesmo que aparece nos logs).
      schema: { type: string }
    XCache:
      description: Origem do dado.
      schema: { type: string, enum: [hit, miss, stale] }
    CacheControl:
      schema: { type: string }
  responses:
    InvalidParameter:
      description: Parâmetro inválido
      headers:
        X-Request-Id: { $ref: '#/components/headers/XRequestId' }
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
    SpeciesNotFound:
      description: Espécie inexistente (`SPECIES_NOT_FOUND`)
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
    NotFound:
      description: Rota inexistente (`NOT_FOUND`)
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
    MethodNotAllowed:
      description: Só GET e HEAD (`METHOD_NOT_ALLOWED`)
      headers:
        Allow:
          schema: { type: string }
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
    RateLimited:
      description: Muitas requisições (`RATE_LIMITED`)
      headers:
        Retry-After:
          schema: { type: string }
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
    Internal:
      description: Erro interno (`INTERNAL`); sem detalhes técnicos
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
    ServiceUnavailable:
      description: Catalog indisponível e sem dado em cache (`SERVICE_UNAVAILABLE`)
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
  schemas:
    BiomeCode:
      type: string
      enum: [amazonia, mata_atlantica, cerrado, caatinga, pantanal, pampa]
    StateCode:
      type: string
      enum: [AC, AL, AP, AM, BA, CE, DF, ES, GO, MA, MT, MS, MG, PA, PB, PR, PE, PI, RJ, RN, RS, RO, RR, SC, SP, SE, TO]
    Label:
      type: object
      required: [code, label]
      properties:
        code: { type: string }
        label: { type: string }
    ConservationStatus:
      type: object
      required: [code, label]
      properties:
        code: { type: string, enum: [LC, NT, VU, EN, CR, EW, EX, DD] }
        label: { type: string }
    Credit:
      type: object
      required: [author, license, source, sourceUrl]
      properties:
        author: { type: string }
        license: { type: string }
        source: { type: string }
        sourceUrl: { type: string }
    SpeciesSummary:
      type: object
      required: [id, commonName, scientificName, thumbnailUrl, conservationStatus]
      properties:
        id: { type: string }
        commonName: { type: string }
        scientificName: { type: string }
        thumbnailUrl: { type: string, nullable: true }
        conservationStatus:
          nullable: true
          allOf:
            - $ref: '#/components/schemas/ConservationStatus'
    SpeciesPage:
      type: object
      required: [items, nextCursor]
      properties:
        items:
          type: array
          items: { $ref: '#/components/schemas/SpeciesSummary' }
        nextCursor: { type: string, nullable: true }
    Fact:
      type: object
      required: [text, source]
      properties:
        text: { type: string }
        source: { type: string }
    Photo:
      type: object
      required: [thumbUrl, mediumUrl, largeUrl, width, height, credit]
      properties:
        thumbUrl: { type: string, nullable: true }
        mediumUrl: { type: string, nullable: true }
        largeUrl: { type: string, nullable: true }
        width: { type: integer }
        height: { type: integer }
        credit: { $ref: '#/components/schemas/Credit' }
    Audio:
      type: object
      required: [url, durationMs, credit]
      properties:
        url: { type: string }
        durationMs: { type: integer }
        credit: { $ref: '#/components/schemas/Credit' }
    Cluster:
      type: object
      required: [lat, lng, count, precision]
      properties:
        lat: { type: number }
        lng: { type: number }
        count: { type: integer }
        precision: { type: number }
    WhereToFind:
      type: object
      required: [states, biomes, clusters]
      properties:
        states:
          type: array
          items: { $ref: '#/components/schemas/StateCode' }
        biomes:
          type: array
          items: { $ref: '#/components/schemas/BiomeCode' }
        clusters:
          type: array
          items: { $ref: '#/components/schemas/Cluster' }
    Species:
      type: object
      required: [id, commonName, scientificName, family, conservationStatus, sizeCm, diet, description, descriptionCredit, facts, chips, photos, audio, whereToFind]
      properties:
        id: { type: string }
        commonName: { type: string }
        scientificName: { type: string }
        family: { type: string }
        conservationStatus:
          nullable: true
          allOf:
            - $ref: '#/components/schemas/ConservationStatus'
        sizeCm: { type: integer, nullable: true }
        diet: { type: string, nullable: true, description: Texto livre (não é uma categoria rotulada). }
        description: { type: string }
        descriptionCredit: { $ref: '#/components/schemas/Credit' }
        facts:
          type: array
          items: { $ref: '#/components/schemas/Fact' }
        chips:
          type: array
          description: Biomas da espécie, rotulados em português.
          items: { $ref: '#/components/schemas/Label' }
        photos:
          type: array
          description: A primeira é a principal.
          items: { $ref: '#/components/schemas/Photo' }
        audio:
          nullable: true
          allOf:
            - $ref: '#/components/schemas/Audio'
        whereToFind: { $ref: '#/components/schemas/WhereToFind' }
    BiomeCount:
      type: object
      required: [code, label, speciesCount]
      properties:
        code: { $ref: '#/components/schemas/BiomeCode' }
        label: { type: string }
        speciesCount: { type: integer }
    StateCount:
      type: object
      required: [code, speciesCount]
      properties:
        code: { $ref: '#/components/schemas/StateCode' }
        speciesCount: { type: integer }
    Filters:
      type: object
      required: [biomes, states]
      properties:
        biomes:
          type: array
          items: { $ref: '#/components/schemas/BiomeCount' }
        states:
          type: array
          items: { $ref: '#/components/schemas/StateCount' }
    FieldError:
      type: object
      required: [field, reason]
      properties:
        field: { type: string }
        reason: { type: string }
    Problem:
      type: object
      description: Erro no formato do RFC 9457.
      required: [type, title, status, code, requestId]
      properties:
        type: { type: string, example: 'urn:passarim:problem:species-not-found' }
        title: { type: string }
        status: { type: integer }
        code:
          type: string
          enum: [INVALID_PARAMETER, SPECIES_NOT_FOUND, NOT_FOUND, METHOD_NOT_ALLOWED, RATE_LIMITED, SERVICE_UNAVAILABLE, INTERNAL]
        requestId: { type: string }
        errors:
          type: array
          items: { $ref: '#/components/schemas/FieldError' }
```

- [ ] **Step 5: Ver passar** — `go test -race ./internal/adapter/http/... && golangci-lint run`. Expected: ok. Se o `kin-openapi` reclamar de algum detalhe do YAML (ele é rígido com `nullable` + `allOf` e com `pattern`), ajuste o YAML, não o teste; se `ValidateResponse` recusar o cabeçalho `Retry-After` ou `Allow` declarado sem `required`, confirme que o header veio na resposta e mantenha. Se uma resposta 405/429 não trouxer `X-Request-Id` mesmo estando declarado só no 200/400, não o declare lá (o teste só valida o que está no YAML).
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: openapi.yaml e teste de contrato (respostas e rotas)"`

---

### Task 8: Métricas Prometheus, tracing, health, shutdown e `healthcheck`

**Files:** `internal/adapter/metrics/prom.go` + `prom_test.go`; `internal/adapter/telemetry/telemetry.go` + `telemetry_test.go`; `internal/adapter/server/{server,healthcheck}.go` + `server_test.go`; `internal/adapter/http/{health.go,health_test.go}` e ajuste em `handler.go`; ajuste em `internal/adapter/http/middleware/accesslog.go` (+ teste)

**Interfaces (Consumes):** `metrics.Metrics` e `middleware.Observer` (Tasks 5 e 6), `httpadapter.Handler` (Tasks 4 e 7), `middleware.RateLimiter.Tracked` e `RateLimitConfig.OnLimited` (Task 5).
**Interfaces (Produces):**
- `metrics.NewProm() *Prom`; `(*Prom)` implementa `metrics.Metrics` **e** `middleware.Observer` (`ObserveHTTP`); `(*Prom).RateLimited()` (para `RateLimitConfig.OnLimited`); `(*Prom).SetTrackedIPs(f func() float64)`; `(*Prom).SetConnState(f func() float64)`; `(*Prom).Handler() http.Handler` (o `/metrics`). Métricas e rótulos exatamente como na spec §5.7 e §8.2.
- `telemetry.Setup(ctx context.Context, endpoint, serviceName string) (shutdown func(context.Context) error, err error)`: com `endpoint` vazio o tracing fica desligado (provider no-op), mas o propagador W3C `traceparent` é sempre instalado.
- `httpadapter.Handler` ganha o campo `Ready func() bool` (nil = sempre pronto); `Routes()` passa a registrar `GET /healthz` e `GET /readyz` (via `reg`, então aparecem em `Patterns()`).
- `server.Readiness` (`SetShuttingDown()`, `Ready() bool`); `server.Options{Listener, MetricsListener net.Listener; Handler, MetricsHandler http.Handler; DrainDelay, ShutdownTimeout time.Duration; Ready *Readiness; Log *slog.Logger; OnShutdown []func(context.Context)}`; `server.Run(ctx context.Context, o Options) error`; `server.Healthcheck(httpAddr string) int`.

Pré-requisitos: `go get github.com/prometheus/client_golang go.opentelemetry.io/otel go.opentelemetry.io/otel/sdk go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc` (versões compatíveis com as do `passarim-catalog/go.mod`, que já traz `otelhttp` e `otel` como indiretas).

- [ ] **Step 1: Testes das métricas que falham** — `internal/adapter/metrics/prom_test.go`:

```go
package metrics_test

import (
	"io"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/velosobr/passarim-bff/internal/adapter/metrics"
	"github.com/velosobr/passarim-bff/internal/adapter/http/middleware"
)

var (
	_ metrics.Metrics     = (*metrics.Prom)(nil)
	_ middleware.Observer = (*metrics.Prom)(nil)
)

func scrape(t *testing.T, p *metrics.Prom) string {
	t.Helper()
	rec := httptest.NewRecorder()
	p.Handler().ServeHTTP(rec, httptest.NewRequest("GET", "/metrics", nil))
	b, _ := io.ReadAll(rec.Body)
	return string(b)
}

func TestProm_ChainMetrics(t *testing.T) {
	p := metrics.NewProm()
	p.CacheResult("hit")
	p.CacheResult("hit")
	p.CacheResult("stale")
	p.CacheResult("bypass")
	p.BreakerState(2)
	p.CatalogRetry("GetSpecies")
	p.CatalogAttempt("GetSpecies", "Unavailable", 120*time.Millisecond)
	out := scrape(t, p)
	for _, want := range []string{
		`bff_cache_requests_total{result="hit"} 2`,
		`bff_cache_requests_total{result="stale"} 1`,
		`bff_cache_requests_total{result="bypass"} 1`,
		`bff_breaker_state 2`,
		`bff_catalog_retries_total{method="GetSpecies"} 1`,
		`bff_catalog_request_duration_seconds_count{code="Unavailable",method="GetSpecies"} 1`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("faltou a linha %q", want)
		}
	}
}

func TestProm_HTTPMetricsUseRoutePatternAndStringStatus(t *testing.T) {
	p := metrics.NewProm()
	p.ObserveHTTP("GET /v1/species/{id}", "GET", 404, 12*time.Millisecond)
	p.ObserveHTTP("unmatched", "GET", 404, time.Millisecond)
	p.RateLimited()
	out := scrape(t, p)
	for _, want := range []string{
		`bff_http_requests_total{method="GET",route="GET /v1/species/{id}",status="404"} 1`,
		`bff_http_requests_total{method="GET",route="unmatched",status="404"} 1`,
		`bff_http_request_duration_seconds_count{method="GET",route="GET /v1/species/{id}"} 1`,
		`bff_rate_limited_total 1`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("faltou a linha %q", want)
		}
	}
}

func TestProm_GaugeFuncsReadLiveValues(t *testing.T) {
	p := metrics.NewProm()
	if !strings.Contains(scrape(t, p), "bff_rate_limiter_tracked_ips 0") {
		t.Fatal("sem função registrada, o gauge vale 0")
	}
	tracked, state := 7.0, 2.0
	p.SetTrackedIPs(func() float64 { return tracked })
	p.SetConnState(func() float64 { return state })
	out := scrape(t, p)
	if !strings.Contains(out, "bff_rate_limiter_tracked_ips 7") || !strings.Contains(out, "bff_catalog_connection_state 2") {
		t.Fatalf("gauges: %s", out)
	}
	tracked = 9
	if !strings.Contains(scrape(t, p), "bff_rate_limiter_tracked_ips 9") {
		t.Fatal("o gauge deveria refletir o valor atual a cada coleta")
	}
}

func TestProm_ExposesGoRuntimeMetrics(t *testing.T) {
	if !strings.Contains(scrape(t, metrics.NewProm()), "go_goroutines") {
		t.Fatal("o coletor padrão de runtime Go deveria estar registrado")
	}
}
```

- [ ] **Step 2: Testes do health, do accesslog/span, do telemetry e do server que falham**

`internal/adapter/http/health_test.go`:

```go
package httpadapter_test

import (
	"errors"
	"log/slog"
	"net/http"
	"testing"

	httpadapter "github.com/velosobr/passarim-bff/internal/adapter/http"
	"github.com/velosobr/passarim-bff/internal/adapter/media"
	"github.com/velosobr/passarim-bff/internal/domain"
)

func healthHandler(t *testing.T, get *fakeGet, ready func() bool) http.Handler {
	t.Helper()
	m, _ := media.New(base, slog.New(slog.DiscardHandler))
	return (&httpadapter.Handler{List: &fakeList{}, Get: get, Filters: &fakeFilters{}, Media: m, Log: slog.New(slog.DiscardHandler), Ready: ready}).Routes()
}

func TestHealthz_AlwaysOK(t *testing.T) {
	rec := do(healthHandler(t, &fakeGet{}, func() bool { return false }), "GET", "/healthz")
	if rec.Code != 200 || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("healthz: %d %v", rec.Code, rec.Header())
	}
}

// Review Focus #2: o readyz NÃO consulta o catalog nem o Redis; se consultasse, com o catalog
// fora do ar as duas réplicas sairiam do balanceador e o stale nunca seria servido.
func TestReadyz_IgnoresCatalogAndRedis(t *testing.T) {
	broken := &fakeGet{err: domain.NewError(domain.KindUnavailable, errors.New("catalog fora do ar"))}
	rec := do(healthHandler(t, broken, nil), "GET", "/readyz")
	if rec.Code != 200 || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("readyz com catalog quebrado deveria ser 200: %d", rec.Code)
	}
}

func TestReadyz_503WhileShuttingDown(t *testing.T) {
	shuttingDown := false
	h := healthHandler(t, &fakeGet{}, func() bool { return !shuttingDown })
	if do(h, "GET", "/readyz").Code != 200 {
		t.Fatal("pronto no início")
	}
	shuttingDown = true
	if rec := do(h, "GET", "/readyz"); rec.Code != 503 {
		t.Fatalf("em shutdown deveria ser 503: %d", rec.Code)
	}
	if do(h, "GET", "/healthz").Code != 200 {
		t.Fatal("o processo continua vivo durante o shutdown")
	}
}

func TestHealthRoutesAreRegisteredPatterns(t *testing.T) {
	m, _ := media.New(base, slog.New(slog.DiscardHandler))
	h := &httpadapter.Handler{List: &fakeList{}, Get: &fakeGet{}, Filters: &fakeFilters{}, Media: m, Log: slog.New(slog.DiscardHandler)}
	h.Routes()
	got := map[string]bool{}
	for _, p := range h.Patterns() {
		got[p] = true
	}
	if !got["GET /healthz"] || !got["GET /readyz"] {
		t.Fatalf("padrões: %v", h.Patterns())
	}
}
```

Acrescente ao `middleware_test.go` (Task 5) o teste do atributo no span (usa o SDK com gravador em memória):

```go
func TestAccessLog_SetsCacheAttributeOnSpan(t *testing.T) {
	sr := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(sr))
	ctx, span := tp.Tracer("t").Start(context.Background(), "http")
	h := middleware.Chain(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqmeta.From(r.Context()).SetCache("stale")
	}), middleware.RequestID(), middleware.AccessLog(discard, func(*http.Request) string { return "1.1.1.1" }, nil))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/x", nil).WithContext(ctx))
	span.End()
	var got string
	for _, a := range sr.Ended()[0].Attributes() {
		if a.Key == "cache" {
			got = a.Value.AsString()
		}
	}
	if got != "stale" {
		t.Fatalf("o span HTTP deveria ter o atributo cache=stale, tem %q", got)
	}
}
```

(imports novos no arquivo: `"context"`, `sdktrace "go.opentelemetry.io/otel/sdk/trace"`, `"go.opentelemetry.io/otel/sdk/trace/tracetest"`.)

`internal/adapter/telemetry/telemetry_test.go`:

```go
package telemetry_test

import (
	"context"
	"testing"
	"time"

	"go.opentelemetry.io/otel"

	"github.com/velosobr/passarim-bff/internal/adapter/telemetry"
)

func TestSetup_DisabledWithoutEndpointStillInstallsPropagator(t *testing.T) {
	shutdown, err := telemetry.Setup(context.Background(), "", "passarim-bff")
	if err != nil {
		t.Fatalf("sem endpoint o tracing fica desligado, sem erro: %v", err)
	}
	if err := shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown do modo desligado: %v", err)
	}
	found := false
	for _, f := range otel.GetTextMapPropagator().Fields() {
		if f == "traceparent" {
			found = true
		}
	}
	if !found {
		t.Fatal("o propagador W3C traceparent deveria estar instalado (a propagação ao catalog independe do exporter)")
	}
}

func TestSetup_WithEndpointCreatesProviderWithoutConnecting(t *testing.T) {
	shutdown, err := telemetry.Setup(context.Background(), "http://127.0.0.1:1", "passarim-bff")
	if err != nil {
		t.Fatalf("o exporter OTLP é preguiçoso: não conecta no Setup. err=%v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	_ = shutdown(ctx) // pode devolver erro de flush (ninguém escuta); o que importa é não travar
}

func TestSetup_RejectsInvalidEndpoint(t *testing.T) {
	if _, err := telemetry.Setup(context.Background(), "://lixo", "x"); err == nil {
		t.Fatal("endpoint inválido deveria falhar")
	}
}
```

`internal/adapter/server/server_test.go`:

```go
package server_test

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"sync/atomic"
	"testing"
	"time"

	"github.com/velosobr/passarim-bff/internal/adapter/server"
)

func listen(t *testing.T) net.Listener {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	return l
}

func get(url string) (int, error) {
	c := &http.Client{Timeout: 2 * time.Second}
	resp, err := c.Get(url)
	if err != nil {
		return 0, err
	}
	_ = resp.Body.Close()
	return resp.StatusCode, nil
}

// A sequência da spec §6: readyz→503, espera o drenar, Shutdown (termina o que está em andamento), hooks.
func TestRun_GracefulShutdownSequence(t *testing.T) {
	ready := &server.Readiness{}
	mux := http.NewServeMux()
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
		if !ready.Ready() {
			w.WriteHeader(503)
			return
		}
		w.WriteHeader(200)
	})
	started := make(chan struct{})
	mux.HandleFunc("/slow", func(w http.ResponseWriter, r *http.Request) {
		close(started)
		time.Sleep(300 * time.Millisecond) // uma requisição em andamento quando o shutdown começa
		w.WriteHeader(200)
	})
	api, metr := listen(t), listen(t)
	var hookRan atomic.Bool
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- server.Run(ctx, server.Options{
			Listener: api, MetricsListener: metr, Handler: mux, MetricsHandler: http.NewServeMux(),
			DrainDelay: 400 * time.Millisecond, ShutdownTimeout: 3 * time.Second, Ready: ready, Log: slog.New(slog.DiscardHandler),
			OnShutdown: []func(context.Context){func(context.Context) { hookRan.Store(true) }},
		})
	}()
	base := "http://" + api.Addr().String()
	if code, err := get(base + "/readyz"); err != nil || code != 200 {
		t.Fatalf("pronto antes do shutdown: %d %v", code, err)
	}
	slowDone := make(chan int, 1)
	go func() { code, _ := get(base + "/slow"); slowDone <- code }()
	<-started

	cancel() // SIGTERM
	time.Sleep(100 * time.Millisecond)
	if code, err := get(base + "/readyz"); err != nil || code != 503 {
		t.Fatalf("durante a espera de drenagem o readyz é 503 e o servidor ainda atende: %d %v", code, err)
	}
	if err := <-done; err != nil {
		t.Fatalf("Run: %v", err)
	}
	if code := <-slowDone; code != 200 {
		t.Fatalf("a requisição em andamento deveria terminar normalmente: %d", code)
	}
	if !hookRan.Load() {
		t.Fatal("os hooks de OnShutdown (flush de traces, fechar conexões) deveriam rodar")
	}
	if _, err := get(base + "/readyz"); err == nil {
		t.Fatal("depois do shutdown o servidor não atende mais")
	}
}

func TestRun_ServesMetricsOnSeparateListener(t *testing.T) {
	api, metr := listen(t), listen(t)
	api2 := http.NewServeMux()
	m := http.NewServeMux()
	m.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) { _, _ = fmt.Fprint(w, "ok") })
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- server.Run(ctx, server.Options{Listener: api, MetricsListener: metr, Handler: api2, MetricsHandler: m,
			DrainDelay: 10 * time.Millisecond, ShutdownTimeout: time.Second, Ready: &server.Readiness{}, Log: slog.New(slog.DiscardHandler)})
	}()
	if code, err := get("http://" + metr.Addr().String() + "/metrics"); err != nil || code != 200 {
		t.Fatalf("metrics: %d %v", code, err)
	}
	if code, _ := get("http://" + api.Addr().String() + "/metrics"); code != 404 {
		t.Fatalf("o /metrics NÃO pode estar na porta da API (é porta separada): %d", code)
	}
	cancel()
	<-done
}

func TestRun_ReturnsErrorWhenAServerFails(t *testing.T) {
	api := listen(t)
	metr := listen(t)
	_ = metr.Close() // o servidor de métricas não consegue servir
	err := server.Run(context.Background(), server.Options{Listener: api, MetricsListener: metr, Handler: http.NewServeMux(), MetricsHandler: http.NewServeMux(),
		DrainDelay: time.Millisecond, ShutdownTimeout: time.Second, Ready: &server.Readiness{}, Log: slog.New(slog.DiscardHandler)})
	if err == nil {
		t.Fatal("falha ao servir deveria encerrar o Run com erro")
	}
}

func TestServerTimeoutsAreSet(t *testing.T) {
	o := server.Options{}
	hs := server.NewHTTPServer(o.Handler)
	if hs.ReadHeaderTimeout != 2*time.Second || hs.ReadTimeout != 5*time.Second || hs.WriteTimeout != 5*time.Second || hs.IdleTimeout != 60*time.Second || hs.MaxHeaderBytes != 8<<10 {
		t.Fatalf("timeouts da spec §7.2: %+v", hs)
	}
}

func TestHealthcheck(t *testing.T) {
	ok := listen(t)
	go func() { _ = http.Serve(ok, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/healthz" {
			w.WriteHeader(404)
			return
		}
		w.WriteHeader(200)
	})) }()
	_, port, _ := net.SplitHostPort(ok.Addr().String())
	if code := server.Healthcheck(":" + port); code != 0 {
		t.Fatalf("saudável deveria sair 0: %d", code)
	}
	bad := listen(t)
	go func() { _ = http.Serve(bad, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) })) }()
	_, badPort, _ := net.SplitHostPort(bad.Addr().String())
	if code := server.Healthcheck(":" + badPort); code != 1 {
		t.Fatalf("500 deveria sair 1: %d", code)
	}
	free := listen(t)
	_, freePort, _ := net.SplitHostPort(free.Addr().String())
	_ = free.Close()
	if code := server.Healthcheck(":" + freePort); code != 1 {
		t.Fatalf("sem servidor deveria sair 1: %d", code)
	}
	if code := server.Healthcheck(""); code != 1 && code != 0 { // vazio usa :8080; só não pode dar panic
		t.Fatalf("código inesperado %d", code)
	}
}
```

- [ ] **Step 3: Ver falhar** — `go test ./internal/adapter/...` → FAIL (símbolos indefinidos).

- [ ] **Step 4: Implementar as métricas** — `internal/adapter/metrics/prom.go`:

```go
package metrics

import (
	"net/http"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Prom implementa Metrics (cadeia de resiliência) e middleware.Observer (HTTP) com Prometheus.
// Usa um Registry PRÓPRIO (não o global): os testes não se atrapalham e só sai o que é nosso.
type Prom struct {
	reg      *prometheus.Registry
	cache    *prometheus.CounterVec
	breaker  prometheus.Gauge
	retries  *prometheus.CounterVec
	attempt  *prometheus.HistogramVec
	httpReqs *prometheus.CounterVec
	httpDur  *prometheus.HistogramVec
	limited  prometheus.Counter

	// Gauges "ao vivo": o valor é lido a cada coleta (as funções chegam depois, no main).
	tracked atomic.Pointer[func() float64]
	conn    atomic.Pointer[func() float64]
}

var latencyBuckets = []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5}

func NewProm() *Prom {
	p := &Prom{reg: prometheus.NewRegistry()}
	p.cache = prometheus.NewCounterVec(prometheus.CounterOpts{Name: "bff_cache_requests_total", Help: "Resultado do cache por requisição (hit, miss, stale, bypass, error)."}, []string{"result"})
	p.breaker = prometheus.NewGauge(prometheus.GaugeOpts{Name: "bff_breaker_state", Help: "Estado do circuit breaker do catalog: 0 fechado, 1 half-open, 2 aberto."})
	p.retries = prometheus.NewCounterVec(prometheus.CounterOpts{Name: "bff_catalog_retries_total", Help: "Retries ao catalog."}, []string{"method"})
	p.attempt = prometheus.NewHistogramVec(prometheus.HistogramOpts{Name: "bff_catalog_request_duration_seconds", Help: "Duração de cada tentativa ao catalog.", Buckets: latencyBuckets}, []string{"method", "code"})
	p.httpReqs = prometheus.NewCounterVec(prometheus.CounterOpts{Name: "bff_http_requests_total", Help: "Requisições HTTP."}, []string{"route", "method", "status"})
	p.httpDur = prometheus.NewHistogramVec(prometheus.HistogramOpts{Name: "bff_http_request_duration_seconds", Help: "Duração das requisições HTTP.", Buckets: latencyBuckets}, []string{"route", "method"})
	p.limited = prometheus.NewCounter(prometheus.CounterOpts{Name: "bff_rate_limited_total", Help: "Requisições recusadas pelo rate limit (429)."})
	trackedGauge := prometheus.NewGaugeFunc(prometheus.GaugeOpts{Name: "bff_rate_limiter_tracked_ips", Help: "IPs rastreados pelo rate limiter."}, loadFn(&p.tracked))
	connGauge := prometheus.NewGaugeFunc(prometheus.GaugeOpts{Name: "bff_catalog_connection_state", Help: "Estado da conexão gRPC com o catalog (0 idle, 1 connecting, 2 ready, 3 transient failure, 4 shutdown)."}, loadFn(&p.conn))
	p.reg.MustRegister(p.cache, p.breaker, p.retries, p.attempt, p.httpReqs, p.httpDur, p.limited, trackedGauge, connGauge,
		collectors.NewGoCollector(), collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))
	return p
}

func loadFn(ptr *atomic.Pointer[func() float64]) func() float64 {
	return func() float64 {
		if f := ptr.Load(); f != nil {
			return (*f)()
		}
		return 0
	}
}

func (p *Prom) SetTrackedIPs(f func() float64) { p.tracked.Store(&f) }
func (p *Prom) SetConnState(f func() float64)  { p.conn.Store(&f) }
func (p *Prom) Handler() http.Handler          { return promhttp.HandlerFor(p.reg, promhttp.HandlerOpts{}) }

func (p *Prom) CacheResult(result string) { p.cache.WithLabelValues(result).Inc() }
func (p *Prom) BreakerState(state int)    { p.breaker.Set(float64(state)) }
func (p *Prom) CatalogRetry(method string) { p.retries.WithLabelValues(method).Inc() }
func (p *Prom) CatalogAttempt(method, code string, d time.Duration) {
	p.attempt.WithLabelValues(method, code).Observe(d.Seconds())
}
func (p *Prom) RateLimited() { p.limited.Inc() }

// ObserveHTTP: o rótulo "route" é SEMPRE o padrão do roteador (ou "unmatched"):
// cardinalidade baixa e nenhum dado do usuário nas métricas.
func (p *Prom) ObserveHTTP(route, method string, status int, d time.Duration) {
	p.httpReqs.WithLabelValues(route, method, strconv.Itoa(status)).Inc()
	p.httpDur.WithLabelValues(route, method).Observe(d.Seconds())
}
```

- [ ] **Step 5: Implementar o tracing** — `internal/adapter/telemetry/telemetry.go`:

```go
// Package telemetry liga o OpenTelemetry. Sem endpoint, o tracing fica DESLIGADO
// (o BFF sobe normalmente), mas o propagador W3C continua instalado para o
// traceparent recebido seguir até o catalog.
package telemetry

import (
	"context"
	"errors"
	"net/url"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

func Setup(ctx context.Context, endpoint, serviceName string) (func(context.Context) error, error) {
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))
	if endpoint == "" {
		return func(context.Context) error { return nil }, nil
	}
	u, err := url.Parse(endpoint)
	if err != nil || u.Host == "" {
		return nil, errors.New("OTEL_EXPORTER_OTLP_ENDPOINT: URL inválida (ex.: http://jaeger:4317)")
	}
	opts := []otlptracegrpc.Option{otlptracegrpc.WithEndpoint(u.Host)}
	if u.Scheme != "https" {
		opts = append(opts, otlptracegrpc.WithInsecure())
	}
	exp, err := otlptracegrpc.New(ctx, opts...) // preguiçoso: não conecta aqui
	if err != nil {
		return nil, errors.New("OpenTelemetry: não foi possível criar o exportador")
	}
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exp),
		sdktrace.WithResource(resource.NewSchemaless(semconv.ServiceName(serviceName))),
	)
	otel.SetTracerProvider(tp)
	return tp.Shutdown, nil
}
```

(`url.Parse("://lixo")` devolve erro, então o teste de endpoint inválido passa. Se a versão do `semconv` não existir no seu `otel`, use a mais recente listada em `go.opentelemetry.io/otel/semconv/`.)

Ajuste em `internal/adapter/http/middleware/accesslog.go`: depois do `log.InfoContext`, acrescente o atributo ao span do `otelhttp` (se não houver span, o `SpanFromContext` devolve um no-op):

```go
	trace.SpanFromContext(r.Context()).SetAttributes(attribute.String("cache", reqmeta.From(r.Context()).Cache()))
```

com os imports `"go.opentelemetry.io/otel/attribute"` e `"go.opentelemetry.io/otel/trace"`.

- [ ] **Step 6: Implementar o health** — `internal/adapter/http/health.go`:

```go
package httpadapter

import "net/http"

// /healthz = "o processo está vivo" (liveness).
// /readyz  = "pode receber tráfego" (readiness, usado pelo Traefik). NÃO consulta o
// catalog nem o Redis: com o catalog fora do ar, as duas réplicas ficariam
// não-prontas e o stale-while-error nunca seria servido (spec §6). Só fica 503 em shutdown.
func (h *Handler) healthz(w http.ResponseWriter, r *http.Request) {
	plain(w, http.StatusOK, "ok")
}

func (h *Handler) readyz(w http.ResponseWriter, r *http.Request) {
	if h.Ready != nil && !h.Ready() {
		plain(w, http.StatusServiceUnavailable, "shutting down")
		return
	}
	plain(w, http.StatusOK, "ready")
}

func plain(w http.ResponseWriter, status int, body string) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(body))
}
```

Em `handler.go`: adicione ao `Handler` o campo `Ready func() bool // nil = sempre pronto` e, em `Routes()`, depois dos três `reg` de `/v1`:

```go
	reg("GET /healthz", h.healthz)
	reg("GET /readyz", h.readyz)
```

- [ ] **Step 7: Implementar o servidor, o shutdown e o `healthcheck`** — `internal/adapter/server/server.go`:

```go
// Package server sobe os dois servidores HTTP (API e métricas) e cuida do
// shutdown em ordem: readyz→503, espera a drenagem, Shutdown, hooks (spec §6).
package server

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"sync/atomic"
	"time"
)

// Readiness diz se o BFF pode receber tráfego. Vira "não pronto" ao receber SIGTERM.
type Readiness struct{ shuttingDown atomic.Bool }

func (r *Readiness) SetShuttingDown() { r.shuttingDown.Store(true) }
func (r *Readiness) Ready() bool      { return !r.shuttingDown.Load() }

type Options struct {
	Listener, MetricsListener   net.Listener
	Handler, MetricsHandler     http.Handler
	DrainDelay, ShutdownTimeout time.Duration
	Ready                       *Readiness
	Log                         *slog.Logger
	OnShutdown                  []func(context.Context) // flush de traces, fechar gRPC e Redis...
}

// NewHTTPServer aplica os timeouts da spec §7.2 (OWASP API4). WriteTimeout 5 s = orçamento da requisição (3 s) + margem.
func NewHTTPServer(h http.Handler) *http.Server {
	return &http.Server{
		Handler: h, ReadHeaderTimeout: 2 * time.Second, ReadTimeout: 5 * time.Second,
		WriteTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 8 << 10,
	}
}

// Run serve até o contexto ser cancelado (SIGTERM/SIGINT) ou um servidor falhar.
func Run(ctx context.Context, o Options) error {
	api, metrics := NewHTTPServer(o.Handler), NewHTTPServer(o.MetricsHandler)
	errCh := make(chan error, 2)
	serve := func(s *http.Server, l net.Listener, name string) {
		if err := s.Serve(l); !errors.Is(err, http.ErrServerClosed) {
			errCh <- errors.Join(errors.New("servidor "+name), err)
		}
	}
	go serve(api, o.Listener, "api")
	go serve(metrics, o.MetricsListener, "metrics")

	var runErr error
	select {
	case <-ctx.Done():
		o.Log.Info("sinal recebido, encerrando com calma")
	case runErr = <-errCh:
		o.Log.Error("servidor falhou, encerrando", "error", runErr)
	}

	// 1. /readyz passa a 503 (o Traefik tira esta réplica do balanceamento).
	o.Ready.SetShuttingDown()
	// 2. Espera mais que um intervalo de health check do Traefik. O servidor continua atendendo.
	time.Sleep(o.DrainDelay)
	// 3. Para de aceitar conexões e termina as requisições em andamento.
	sctx, cancel := context.WithTimeout(context.Background(), o.ShutdownTimeout)
	defer cancel()
	if err := api.Shutdown(sctx); err != nil {
		runErr = errors.Join(runErr, err)
	}
	if err := metrics.Shutdown(sctx); err != nil {
		runErr = errors.Join(runErr, err)
	}
	// 4. Hooks: flush de traces (até 2 s), fecha a conexão gRPC e o cliente Redis.
	hctx, hcancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer hcancel()
	for _, f := range o.OnShutdown {
		f(hctx)
	}
	return runErr
}
```

`internal/adapter/server/healthcheck.go`:

```go
package server

import (
	"context"
	"net"
	"net/http"
	"time"
)

// Healthcheck é o subcomando "bff healthcheck": a imagem distroless não tem curl,
// então o próprio binário consulta /healthz. Usa 127.0.0.1 (e não "localhost":
// no container, localhost pode resolver para IPv6 primeiro). Sai 0 se saudável, 1 senão.
func Healthcheck(httpAddr string) int {
	if httpAddr == "" {
		httpAddr = ":8080"
	}
	_, port, err := net.SplitHostPort(httpAddr)
	if err != nil {
		return 1
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://127.0.0.1:"+port+"/healthz", nil)
	if err != nil {
		return 1
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 1
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}
```

- [ ] **Step 8: Ver passar** — `go mod tidy && go test -race ./internal/... && golangci-lint run && gofmt -l .`. Expected: ok, 0 issues. (O teste de shutdown usa esperas reais de ~0,4 s.) Se o `golangci-lint` apontar `errcheck` em `defer resp.Body.Close()`, o código já usa `defer func() { _ = ... }()`.
- [ ] **Step 9: Commit** — `git add -A && git commit -m "feat: métricas Prometheus, tracing OTel, health, shutdown gracioso e healthcheck"`

---

### Task 9a: `cmd/bff/main.go` e o `Dockerfile` (repositório `passarim-bff`)

**Files:** `cmd/bff/main.go`, `cmd/bff/main_test.go`, `Dockerfile`

**Interfaces (Consumes):** tudo das Tasks 1 a 8: `config.Load`, `telemetry.Setup`, `metrics.NewProm`, `grpcclient.New`, `resilience.NewRetry/NewBreaker/DefaultBreakerConfig`, `cache.New/NewRedisStore`, `media.New`, `httpadapter.Handler`, `middleware.*`, `server.Run/Readiness/Healthcheck`, os casos de uso.
**Interfaces (Produces):** o binário `bff` (`bff` sobe o serviço; `bff healthcheck` faz a checagem do Docker) e a imagem `passarim-bff:dev`.

- [ ] **Step 1: Teste que falha** — `cmd/bff/main_test.go` (a montagem completa é coberta pelo e2e da Task 10; aqui só a falha rápida e segura de configuração):

```go
package main

import (
	"strings"
	"testing"
)

func TestRun_FailsFastNamingTheMissingVariable(t *testing.T) {
	err := run(func(string) string { return "" })
	if err == nil || !strings.Contains(err.Error(), "CATALOG_ADDR") {
		t.Fatalf("sem configuração o processo não sobe e o erro cita a variável: %v", err)
	}
}

func TestRun_InvalidRedisURLNeverEchoesTheValue(t *testing.T) {
	env := map[string]string{
		"CATALOG_ADDR": "catalog:50051", "MEDIA_BASE_URL": "http://localhost:8888/b",
		"REDIS_URL": "isto-nao-e-url://:senha-secreta@host", "HTTP_ADDR": "127.0.0.1:0", "METRICS_ADDR": "127.0.0.1:0",
	}
	err := run(func(k string) string { return env[k] })
	if err == nil || strings.Contains(err.Error(), "senha-secreta") || !strings.Contains(err.Error(), "REDIS_URL") {
		t.Fatalf("URL do Redis inválida: o erro cita o nome da variável e nunca o valor: %v", err)
	}
}
```

- [ ] **Step 2: Ver falhar** — `go test ./cmd/bff/` → FAIL (`run` indefinido).

- [ ] **Step 3: Implementar `cmd/bff/main.go`**

```go
// bff: ponto de entrada. Aqui só "ligamos os fios" (config, adapters, cadeia de
// decorators, servidor): nenhuma regra de negócio mora no main. "bff healthcheck"
// é o subcomando do healthcheck do Docker (a imagem distroless não tem curl).
package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
	"go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"google.golang.org/grpc"

	"github.com/velosobr/passarim-bff/internal/adapter/cache"
	"github.com/velosobr/passarim-bff/internal/adapter/grpcclient"
	httpadapter "github.com/velosobr/passarim-bff/internal/adapter/http"
	"github.com/velosobr/passarim-bff/internal/adapter/http/middleware"
	"github.com/velosobr/passarim-bff/internal/adapter/media"
	"github.com/velosobr/passarim-bff/internal/adapter/metrics"
	"github.com/velosobr/passarim-bff/internal/adapter/resilience"
	"github.com/velosobr/passarim-bff/internal/adapter/server"
	"github.com/velosobr/passarim-bff/internal/adapter/telemetry"
	"github.com/velosobr/passarim-bff/internal/config"
	"github.com/velosobr/passarim-bff/internal/usecase"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(server.Healthcheck(os.Getenv("HTTP_ADDR")))
	}
	if err := run(os.Getenv); err != nil {
		slog.New(slog.NewJSONHandler(os.Stdout, nil)).Error("bff encerrou com erro", "error", err)
		os.Exit(1)
	}
}

// watchConnection loga as transições do estado da conexão gRPC com o catalog (spec §6).
// O estado NÃO afeta o /readyz: serve só de métrica e de pista nos logs.
func watchConnection(ctx context.Context, conn *grpc.ClientConn, log *slog.Logger) {
	state := conn.GetState()
	conn.Connect() // sai de Idle e começa a conectar já na subida
	for conn.WaitForStateChange(ctx, state) {
		state = conn.GetState()
		log.Info("conexão com o catalog mudou de estado", "state", state.String())
	}
}

func run(getenv func(string) string) error {
	cfg, err := config.Load(getenv)
	if err != nil {
		return err
	}
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel}))
	slog.SetDefault(log)

	// Contexto cancelado ao receber SIGINT (Ctrl+C) ou SIGTERM (docker stop).
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	shutdownTrace, err := telemetry.Setup(ctx, cfg.OTelEndpoint, cfg.OTelServiceName)
	if err != nil {
		return err
	}
	prom := metrics.NewProm()

	// Redis: a URL pode ter senha, então o erro nunca a repete.
	redisOpt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return errors.New("REDIS_URL: URL inválida (ex.: redis://redis:6379)")
	}
	redisOpt.MaxRetries = -1 // sem retries internos: o cache tem timeout próprio e falha rápido
	redisClient := redis.NewClient(redisOpt)

	grpcClient, err := grpcclient.New(grpcclient.Config{
		Addr: cfg.CatalogAddr, Logger: log,
		TLS: grpcclient.TLS{CAFile: cfg.CatalogTLSCAFile, CertFile: cfg.CatalogTLSCertFile, KeyFile: cfg.CatalogTLSKeyFile, ServerName: cfg.CatalogTLSServerName},
	}, grpc.WithStatsHandler(otelgrpc.NewClientHandler()))
	if err != nil {
		return err
	}
	prom.SetConnState(func() float64 { return float64(grpcClient.Conn().GetState()) })
	go watchConnection(ctx, grpcClient.Conn(), log) // loga cada transição de estado (a métrica mostra o valor atual)

	// A cadeia da spec §5.1: cache → breaker → retry/timeout → gRPC. Todos são CatalogReader.
	var reader usecase.CatalogReader = grpcClient
	reader = resilience.NewRetry(reader, resilience.RetryConfig{MaxRetries: cfg.CatalogMaxRetries, AttemptTimeout: cfg.CatalogAttemptTimeout}, prom)
	reader = resilience.NewBreaker(reader, resilience.DefaultBreakerConfig(), log, prom)
	reader = cache.New(reader, cache.NewRedisStore(redisClient, cfg.RedisTimeout),
		cache.Config{FreshTTL: cfg.CacheFreshTTL, StaleTTL: cfg.CacheStaleTTL, Budget: cfg.RequestBudget}, log, prom)

	mediaURLs, err := media.New(cfg.MediaBaseURL, log)
	if err != nil {
		return err
	}
	ready := &server.Readiness{}
	h := &httpadapter.Handler{
		List:    usecase.ListSpecies{Catalog: reader, Budget: cfg.RequestBudget},
		Get:     usecase.GetSpecies{Catalog: reader, Budget: cfg.RequestBudget},
		Filters: usecase.ListFilters{Catalog: reader, Budget: cfg.RequestBudget},
		Media:   mediaURLs, Log: log, Ready: ready.Ready,
	}

	clientIP := middleware.NewIPResolver(cfg.TrustedProxies, cfg.ClientIPHeader)
	limiter := middleware.NewRateLimiter(middleware.RateLimitConfig{
		RPS: cfg.RateLimitRPS, Burst: cfg.RateLimitBurst, MaxIPs: cfg.RateLimitMaxIPs, IdleAfter: 3 * time.Minute, OnLimited: prom.RateLimited,
	}, clientIP, time.Now)
	prom.SetTrackedIPs(func() float64 { return float64(limiter.Tracked()) })
	go limiter.Run(ctx, time.Minute)

	// Ordem de fora para dentro (spec §7.1). O otelhttp fica mais externo para o span cobrir tudo.
	var handler http.Handler = middleware.Chain(h.Routes(),
		middleware.Recovery(log), middleware.RequestID(), middleware.AccessLog(log, clientIP, prom),
		middleware.SecurityHeaders(), limiter.Middleware(), middleware.Limits())
	handler = otelhttp.NewHandler(handler, "bff", otelhttp.WithSpanNameFormatter(func(_ string, r *http.Request) string { return "HTTP " + r.Method }))

	metricsMux := http.NewServeMux()
	metricsMux.Handle("GET /metrics", prom.Handler())

	apiLn, err := net.Listen("tcp", cfg.HTTPAddr)
	if err != nil {
		return err
	}
	metricsLn, err := net.Listen("tcp", cfg.MetricsAddr)
	if err != nil {
		_ = apiLn.Close()
		return err
	}
	log.Info("bff no ar", "http", apiLn.Addr().String(), "metrics", metricsLn.Addr().String())

	return server.Run(ctx, server.Options{
		Listener: apiLn, MetricsListener: metricsLn, Handler: handler, MetricsHandler: metricsMux,
		DrainDelay: cfg.ShutdownDrainDelay, ShutdownTimeout: cfg.ShutdownTimeout, Ready: ready, Log: log,
		OnShutdown: []func(context.Context){
			func(c context.Context) { _ = shutdownTrace(c) }, // flush dos traces
			func(context.Context) { _ = grpcClient.Close() },
			func(context.Context) { _ = redisClient.Close() },
		},
	})
}
```

- [ ] **Step 4: Dockerfile** (raiz do `passarim-bff`; mesmo padrão do catalog):

```dockerfile
# Build em dois estágios: o Go completo compila; a imagem final leva SÓ o binário.
FROM golang:1.27-alpine AS build
WORKDIR /src
# Copiar go.mod/go.sum primeiro aproveita o cache do Docker.
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# CGO_ENABLED=0 gera binário estático.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/bff ./cmd/bff

# distroless: sem shell nem gerenciador de pacotes; "nonroot" = não roda como root.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/bff /usr/local/bin/bff
USER nonroot:nonroot
EXPOSE 8080 9091
ENTRYPOINT ["/usr/local/bin/bff"]
```

- [ ] **Step 5: Verificar** (cada comando tem o resultado esperado):

```bash
go build ./... && go vet ./... && go test -race ./cmd/... ./internal/...   # Expected: ok
golangci-lint run                                                         # Expected: 0 issues
docker build -t passarim-bff:dev .                                        # Expected: build ok
docker run --rm passarim-bff:dev 2>&1 | head -1                           # Expected: JSON de erro citando CATALOG_ADDR
docker run --rm passarim-bff:dev healthcheck; echo "exit=$?"              # Expected: exit=1 (nada escutando em :8080)
docker inspect --format '{{.Config.User}}' passarim-bff:dev               # Expected: nonroot:nonroot
```

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: main do BFF (montagem da cadeia) e imagem distroless" && git push` (push só com autorização).

---

### Task 9b: Compose, Traefik, Prometheus e dashboard Grafana (repositório `passarim-docs`)

**Files:** `docker-compose.yml`, `infra/prometheus/prometheus.yml`, `infra/grafana/provisioning/datasources/datasources.yml`, `infra/grafana/provisioning/dashboards/dashboards.yml`, `infra/grafana/provisioning/dashboards/bff.json`

**Interfaces (Consumes):** a imagem `passarim-bff:dev` (Task 9a, `build: ../passarim-bff`), as métricas `bff_*` (Task 8), `/readyz` (Task 8).
**Interfaces (Produces):** `bff-1` e `bff-2` atrás do Traefik em `localhost:${HOST_PORT_TRAEFIK_HTTP}/v1`; job `bff` no Prometheus; dashboard "Passarim BFF" no Grafana.

- [ ] **Step 1: Redes, IP fixo do Traefik e Redis com limite de memória** — em `docker-compose.yml`:

(a) rede pública com `ipam` (substitua o bloco `passarim-public`):

```yaml
networks:
  passarim-public:
    name: passarim-public
    # Subnet FIXA para o BFF poder confiar SÓ no IP do Traefik (X-Forwarded-For).
    # ip_range: containers sem IP fixo recebem endereços da metade de cima (172.30.0.128/25),
    # então ninguém herda o 172.30.0.10 do Traefik. Se esta subnet colidir com uma rede da
    # sua máquina, troque a subnet, o IP do Traefik e TRUSTED_PROXIES juntos.
    ipam:
      config:
        - subnet: 172.30.0.0/24
          ip_range: 172.30.0.128/25
```

(b) no serviço `traefik`, troque `networks: [passarim-public, passarim-docker-api]` por:

```yaml
    networks:
      passarim-public:
        ipv4_address: 172.30.0.10
      passarim-docker-api:
```

(c) no serviço `redis`, acrescente (o cache nunca pode crescer sem limite; `allkeys-lru` descarta o menos usado):

```yaml
    command: ["redis-server", "--maxmemory", "64mb", "--maxmemory-policy", "allkeys-lru"]
```

- [ ] **Step 2: As réplicas `bff-1` e `bff-2`** — antes de `services:` (nível raiz) o bloco de extensão e, dentro de `services:`, depois do `catalog-seed`/worker, os dois serviços:

```yaml
# Configuração COMUM às duas réplicas do BFF (âncora YAML): garante que sejam idênticas.
x-bff: &bff
  image: passarim-bff:dev
  environment:
    CATALOG_ADDR: catalog-api:50051
    REDIS_URL: redis://redis:6379
    # Quem abre a mídia é o app, fora do Docker: por isso a porta publicada do filer no host.
    MEDIA_BASE_URL: http://localhost:${HOST_PORT_S3_UI}/buckets/passarim-media
    # Confia SÓ no IP fixo do Traefik (Prometheus e Jaeger também estão na rede pública).
    TRUSTED_PROXIES: 172.30.0.10/32
    OTEL_EXPORTER_OTLP_ENDPOINT: http://jaeger:4317
  depends_on:
    catalog-api:
      condition: service_healthy
    redis:
      condition: service_healthy
  networks: [passarim-public, passarim-private]   # nenhuma porta publicada: só o Traefik é a porta de entrada
  read_only: true
  # Sequência de shutdown: 3 s de drenagem + até 10 s de Shutdown + 2 s de flush + margem.
  stop_grace_period: 20s
  healthcheck:
    test: ["CMD", "/usr/local/bin/bff", "healthcheck"]
    interval: 5s
    timeout: 3s
    retries: 20
  # Labels IDÊNTICAS nas duas réplicas e com o MESMO nome de service ("bff"):
  # é isso que faz o Traefik juntar os dois containers num balanceamento round-robin.
  labels:
    traefik.enable: "true"
    traefik.docker.network: passarim-public
    traefik.http.routers.bff.rule: PathPrefix(`/v1`)
    traefik.http.routers.bff.entrypoints: web
    traefik.http.routers.bff.service: bff
    traefik.http.services.bff.loadbalancer.server.port: "8080"
    traefik.http.services.bff.loadbalancer.healthcheck.path: /readyz
    traefik.http.services.bff.loadbalancer.healthcheck.interval: 2s
    traefik.http.services.bff.loadbalancer.healthcheck.timeout: 1s
```

```yaml
  # BFF (REST/JSON em /v1) — duas réplicas atrás do Traefik (Etapa 3).
  bff-1:
    <<: *bff
    build: ../passarim-bff
  bff-2:
    <<: *bff
    pull_policy: never   # usa a imagem construída pelo bff-1
```

O router só casa `/v1`: `/healthz`, `/readyz` e `/metrics` não ficam públicos, e a porta de métricas (9091) não aparece em nenhuma label.

- [ ] **Step 3: Prometheus** — em `infra/prometheus/prometheus.yml`, troque o comentário "O job do BFF será adicionado na Etapa 3." por:

```yaml
  - job_name: bff
    static_configs:
      - targets: ["bff-1:9091", "bff-2:9091"]
```

- [ ] **Step 4: Datasource com uid fixo e provider de dashboards** — em `infra/grafana/provisioning/datasources/datasources.yml`, acrescente `uid: prometheus` ao Prometheus e `uid: jaeger` ao Jaeger (o dashboard referencia o datasource pelo uid). Crie `infra/grafana/provisioning/dashboards/dashboards.yml`:

```yaml
# Carrega os dashboards desta pasta ao subir o Grafana (dashboards como código).
apiVersion: 1
providers:
  - name: passarim
    folder: Passarim
    type: file
    disableDeletion: true
    allowUiUpdates: false
    options:
      path: /etc/grafana/provisioning/dashboards
```

- [ ] **Step 5: Dashboard** — `infra/grafana/provisioning/dashboards/bff.json` (8 painéis: spec §8.4):

```json
{
  "uid": "passarim-bff",
  "title": "Passarim BFF",
  "tags": ["passarim", "bff"],
  "schemaVersion": 39,
  "version": 1,
  "refresh": "10s",
  "time": { "from": "now-30m", "to": "now" },
  "panels": [
    { "id": 1, "type": "timeseries", "title": "Requisições por segundo, por rota",
      "gridPos": { "x": 0, "y": 0, "w": 12, "h": 8 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [ { "refId": "A", "legendFormat": "{{route}}", "expr": "sum by (route) (rate(bff_http_requests_total[1m]))" } ] },
    { "id": 2, "type": "timeseries", "title": "Latência (p50, p95, p99)",
      "gridPos": { "x": 12, "y": 0, "w": 12, "h": 8 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "fieldConfig": { "defaults": { "unit": "s" } },
      "targets": [
        { "refId": "A", "legendFormat": "p50", "expr": "histogram_quantile(0.50, sum by (le) (rate(bff_http_request_duration_seconds_bucket[5m])))" },
        { "refId": "B", "legendFormat": "p95", "expr": "histogram_quantile(0.95, sum by (le) (rate(bff_http_request_duration_seconds_bucket[5m])))" },
        { "refId": "C", "legendFormat": "p99", "expr": "histogram_quantile(0.99, sum by (le) (rate(bff_http_request_duration_seconds_bucket[5m])))" } ] },
    { "id": 3, "type": "timeseries", "title": "Erros 4xx e 5xx por segundo",
      "gridPos": { "x": 0, "y": 8, "w": 12, "h": 8 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [
        { "refId": "A", "legendFormat": "4xx", "expr": "sum(rate(bff_http_requests_total{status=~\"4..\"}[1m]))" },
        { "refId": "B", "legendFormat": "5xx", "expr": "sum(rate(bff_http_requests_total{status=~\"5..\"}[1m]))" } ] },
    { "id": 4, "type": "stat", "title": "Cache hit ratio (5 min)",
      "gridPos": { "x": 12, "y": 8, "w": 6, "h": 8 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "fieldConfig": { "defaults": { "unit": "percentunit", "min": 0, "max": 1 } },
      "targets": [ { "refId": "A", "expr": "sum(rate(bff_cache_requests_total{result=\"hit\"}[5m])) / sum(rate(bff_cache_requests_total{result=~\"hit|miss|stale\"}[5m]))" } ] },
    { "id": 5, "type": "timeseries", "title": "Respostas servidas como stale (por segundo)",
      "gridPos": { "x": 18, "y": 8, "w": 6, "h": 8 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [ { "refId": "A", "legendFormat": "stale", "expr": "sum(rate(bff_cache_requests_total{result=\"stale\"}[1m]))" } ] },
    { "id": 6, "type": "timeseries", "title": "Rate limit (429 por segundo)",
      "gridPos": { "x": 0, "y": 16, "w": 8, "h": 8 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [ { "refId": "A", "legendFormat": "429", "expr": "sum(rate(bff_rate_limited_total[1m]))" } ] },
    { "id": 7, "type": "stat", "title": "Circuit breaker (0 fechado, 1 half-open, 2 aberto)",
      "gridPos": { "x": 8, "y": 16, "w": 8, "h": 8 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "fieldConfig": { "defaults": { "mappings": [ { "type": "value", "options": { "0": { "text": "FECHADO" }, "1": { "text": "HALF-OPEN" }, "2": { "text": "ABERTO" } } } ] } },
      "targets": [ { "refId": "A", "expr": "max(bff_breaker_state)" } ] },
    { "id": 8, "type": "timeseries", "title": "Retries ao catalog (por segundo)",
      "gridPos": { "x": 16, "y": 16, "w": 8, "h": 8 },
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "targets": [ { "refId": "A", "legendFormat": "{{method}}", "expr": "sum by (method) (rate(bff_catalog_retries_total[1m]))" } ] }
  ]
}
```

- [ ] **Step 6: Subir e conferir** (cada item tem o resultado esperado; se um item falhar, corrija a causa e registre o achado nos "A validar" da spec §16 no relatório final):

```bash
cd ~/dev/passarim/passarim-docs
docker compose config --quiet && echo compose-ok                      # Expected: compose-ok
docker compose up -d --wait --build 2>&1 | tail -5                    # Expected: bff-1 e bff-2 Healthy
docker compose ps --format '{{.Service}} {{.Status}}' | grep bff      # Expected: duas linhas "healthy"
curl -s -o /dev/null -w "%{http_code}\n" localhost:8080/v1/filters    # Expected: 200 (use ${HOST_PORT_TRAEFIK_HTTP} do seu .env)
curl -s localhost:8080/v1/filters | head -c 200                       # Expected: JSON com biomes/states
curl -s -o /dev/null -w "%{http_code}\n" localhost:8080/readyz        # Expected: 404 (o router só casa /v1: não é público)
curl -s -o /dev/null -w "%{http_code}\n" localhost:8080/metrics       # Expected: 404
docker compose exec -T prometheus wget -qO- http://bff-1:9091/metrics | grep -c '^bff_'   # Expected: > 0
curl -s localhost:9090/api/v1/targets | python3 -c "import json,sys;print(sorted((t['labels']['job'],t['labels']['instance'],t['health']) for t in json.load(sys.stdin)['data']['activeTargets'] if t['labels']['job']=='bff'))"   # Expected: bff-1 e bff-2 'up'
curl -s -u admin:$(grep ^GRAFANA_ADMIN_PASSWORD .env | cut -d= -f2) localhost:3000/api/search?query=Passarim | head -c 200   # Expected: o dashboard "Passarim BFF"
```

Itens "a validar" da spec §16 que esta task confere (anote o resultado de cada um no relatório):

```bash
# 1) Duas réplicas com labels idênticas viram UM service com dois servidores no Traefik:
curl -s localhost:8081/api/http/services/bff@docker | python3 -c "import json,sys;print(len(json.load(sys.stdin)['loadBalancer']['servers']))"   # Expected: 2
# 2) IP real: o log de acesso do BFF mostra o IP do cliente (e NÃO o do Traefik, 172.30.0.10), e um X-Forwarded-For forjado não vale:
curl -s -o /dev/null -H 'X-Forwarded-For: 9.9.9.9' localhost:8080/v1/filters
docker compose logs bff-1 bff-2 | grep client_ip | tail -2            # Expected: client_ip = gateway do Docker (172.30.0.1) e NUNCA 9.9.9.9
# 3) O filer do SeaweedFS serve a mídia sem autenticação e com Content-Type correto:
URL=$(curl -s localhost:8080/v1/species/turdus-rufiventris | python3 -c "import json,sys;print(json.load(sys.stdin)['photos'][0]['largeUrl'])")
curl -sI "$URL" | grep -iE "^HTTP|content-type"                       # Expected: 200 e image/webp
```

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: BFF no compose (2 réplicas), Traefik com IP fixo, job do Prometheus e dashboard do Grafana" && git push` (push só com autorização).

---

### Task 10: e2e, CI completo, README, ADRs e roteiro de demonstração (ambos os repositórios)

**Files (`passarim-bff`):** `e2e/e2e_test.go`, `.github/workflows/ci.yml`, `README.md`
**Files (`passarim-docs`):** `docs/adr/0015-rate-limit-em-memoria-por-replica.md`, `docs/adr/0016-cache-com-envelope-e-stale-while-error.md`, `README.md`, `BACKLOG.md` (se algum achado novo)

**Interfaces (Consumes):** a imagem do BFF (`Dockerfile`, Task 9a), o `Dockerfile` do catalog (`PASSARIM_CATALOG_DIR`, padrão `../passarim-catalog`).
**Interfaces (Produces):** `make e2e` (só local); CI verde do `passarim-bff`; ADRs publicados; roteiro do `docker stop` no README do `passarim-docs`.

- [ ] **Step 1: Teste e2e (build tag `e2e`, só local)** — `e2e/e2e_test.go`. Sobe Postgres, o catalog real (imagem construída de `PASSARIM_CATALOG_DIR`), o seed, o Redis e o BFF (imagem construída deste repositório) numa rede Docker de teste:

```go
//go:build e2e

// Teste ponta a ponta: BFF + catalog REAL + Postgres + Redis, tudo em containers.
// Só roda local (make e2e): o catalog só existe como código-fonte vizinho
// (PASSARIM_CATALOG_DIR), então este teste NÃO roda no CI do BFF.
package e2e_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/network"
	"github.com/testcontainers/testcontainers-go/wait"
)

func catalogDir(t *testing.T) string {
	t.Helper()
	dir := os.Getenv("PASSARIM_CATALOG_DIR")
	if dir == "" {
		dir = "../../passarim-catalog"
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(abs, "Dockerfile")); err != nil {
		t.Skipf("catalog não encontrado em %s (defina PASSARIM_CATALOG_DIR)", abs)
	}
	return abs
}

func start(t *testing.T, req testcontainers.ContainerRequest) testcontainers.Container {
	t.Helper()
	c, err := testcontainers.GenericContainer(context.Background(), testcontainers.GenericContainerRequest{ContainerRequest: req, Started: true})
	if err != nil {
		t.Fatalf("subir %v: %v", req.Name, err)
	}
	t.Cleanup(func() { _ = c.Terminate(context.Background()) })
	return c
}

type reply struct {
	status  int
	header  http.Header
	body    map[string]any
	rawBody string
}

func get(t *testing.T, base, path string) reply {
	t.Helper()
	resp, err := http.Get(base + path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	raw, _ := io.ReadAll(resp.Body)
	var body map[string]any
	_ = json.Unmarshal(raw, &body)
	return reply{status: resp.StatusCode, header: resp.Header, body: body, rawBody: string(raw)}
}

func TestE2E_BFFWithRealCatalog(t *testing.T) {
	if testing.Short() {
		t.Skip("e2e: precisa de Docker")
	}
	ctx := context.Background()
	net, err := network.New(ctx)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = net.Remove(context.Background()) })
	nets, nname := []string{net.Name}, net.Name
	_ = nname

	start(t, testcontainers.ContainerRequest{
		Name: "e2e-postgres", Image: "postgres:18-alpine", Networks: nets, NetworkAliases: map[string][]string{net.Name: {"postgres"}},
		Env:        map[string]string{"POSTGRES_USER": "p", "POSTGRES_PASSWORD": "p", "POSTGRES_DB": "p"},
		WaitingFor: wait.ForLog("database system is ready to accept connections").WithOccurrence(2).WithStartupTimeout(60 * time.Second),
	})
	dbURL := "postgres://p:p@postgres:5432/p?sslmode=disable"
	catalogReq := testcontainers.ContainerRequest{
		Name: "e2e-catalog", Networks: nets, NetworkAliases: map[string][]string{net.Name: {"catalog"}},
		FromDockerfile: testcontainers.FromDockerfile{Context: catalogDir(t), Dockerfile: "Dockerfile"},
		Env:            map[string]string{"DATABASE_URL": dbURL},
		WaitingFor:     wait.ForLog("catalog-api no ar").WithStartupTimeout(120 * time.Second),
	}
	catalog := start(t, catalogReq)
	// seed: roda uma vez e termina (carrega as aves curadas).
	start(t, testcontainers.ContainerRequest{
		Name: "e2e-seed", Networks: nets,
		FromDockerfile: testcontainers.FromDockerfile{Context: catalogDir(t), Dockerfile: "Dockerfile"},
		Entrypoint:     []string{"/usr/local/bin/seed", "-dir", "/content/species"},
		Env:            map[string]string{"DATABASE_URL": dbURL},
		WaitingFor:     wait.ForExit().WithExitTimeout(60 * time.Second),
	})
	start(t, testcontainers.ContainerRequest{
		Name: "e2e-redis", Image: "redis:8-alpine", Networks: nets, NetworkAliases: map[string][]string{net.Name: {"redis"}},
		WaitingFor: wait.ForLog("Ready to accept connections"),
	})
	bff := start(t, testcontainers.ContainerRequest{
		Name: "e2e-bff", Networks: nets, ExposedPorts: []string{"8080/tcp"},
		FromDockerfile: testcontainers.FromDockerfile{Context: "..", Dockerfile: "Dockerfile"},
		Env: map[string]string{
			"CATALOG_ADDR": "catalog:50051", "REDIS_URL": "redis://redis:6379",
			"MEDIA_BASE_URL": "http://media.test/bucket", "CACHE_FRESH_TTL": "1s", // frescor curto para provar o stale
		},
		WaitingFor: wait.ForHTTP("/readyz").WithPort("8080/tcp").WithStartupTimeout(90 * time.Second),
	})
	host, _ := bff.Host(ctx)
	port, _ := bff.MappedPort(ctx, "8080/tcp")
	base := "http://" + host + ":" + port.Port()

	t.Run("lista", func(t *testing.T) {
		r := get(t, base, "/v1/species?limit=5")
		items, _ := r.body["items"].([]any)
		if r.status != 200 || len(items) == 0 || r.header.Get("X-Cache") != "miss" || r.header.Get("X-Request-Id") == "" {
			t.Fatalf("lista: %d %v %s", r.status, r.header, r.rawBody)
		}
		if r2 := get(t, base, "/v1/species?limit=5"); r2.header.Get("X-Cache") != "hit" && r2.header.Get("X-Cache") != "miss" {
			t.Fatalf("X-Cache: %q", r2.header.Get("X-Cache"))
		}
	})
	t.Run("detalhe", func(t *testing.T) {
		r := get(t, base, "/v1/species/turdus-rufiventris")
		if r.status != 200 || r.body["scientificName"] != "Turdus rufiventris" || r.body["whereToFind"] == nil {
			t.Fatalf("detalhe: %d %s", r.status, r.rawBody)
		}
	})
	t.Run("404", func(t *testing.T) {
		r := get(t, base, "/v1/species/nao-existe")
		if r.status != 404 || r.body["code"] != "SPECIES_NOT_FOUND" || r.header.Get("Content-Type") != "application/problem+json" {
			t.Fatalf("404: %d %s", r.status, r.rawBody)
		}
	})
	t.Run("filtros", func(t *testing.T) {
		r := get(t, base, "/v1/filters")
		if biomes, _ := r.body["biomes"].([]any); r.status != 200 || len(biomes) == 0 {
			t.Fatalf("filtros: %d %s", r.status, r.rawBody)
		}
	})
	t.Run("catalog parado: stale para o que já foi visto, 503 para o resto", func(t *testing.T) {
		_ = get(t, base, "/v1/species/turdus-rufiventris") // garante que está no cache
		time.Sleep(2 * time.Second)                         // passa do frescor de 1s
		if err := catalog.Stop(ctx, nil); err != nil {
			t.Fatal(err)
		}
		stale := get(t, base, "/v1/species/turdus-rufiventris")
		if stale.status != 200 || stale.header.Get("X-Cache") != "stale" {
			t.Fatalf("esperava 200 stale: %d %q %s", stale.status, stale.header.Get("X-Cache"), stale.rawBody)
		}
		unseen := get(t, base, "/v1/species/cardeal")
		if unseen.status != 503 || unseen.body["code"] != "SERVICE_UNAVAILABLE" || unseen.header.Get("Content-Type") != "application/problem+json" {
			t.Fatalf("esperava 503 problem+json: %d %s", unseen.status, unseen.rawBody)
		}
	})
}
```

Confira os ids reais (`turdus-rufiventris`, `cardeal`) em `passarim-catalog/content/species/`; troque `cardeal` por um id de ave curada que o teste ainda NÃO consultou. Rode: `make e2e`. Expected: PASS (a primeira execução constrói duas imagens e demora alguns minutos).

- [ ] **Step 2: CI completo do BFF** — substitua `.github/workflows/ci.yml` (mesmo padrão do catalog; o e2e NÃO entra: a spec §12 explica):

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version-file: go.mod
      # -race detecta acesso concorrente perigoso. Os testes do cache usam Redis via Docker
      # (já instalado nos runners). Inclui o teste de contrato contra o openapi.yaml.
      - run: go test -race ./...
      - name: govulncheck
        run: go run golang.org/x/vuln/cmd/govulncheck@v1.8.0 ./...

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version-file: go.mod
      # golangci-lint inclui o gosec (segurança) configurado em .golangci.yml.
      - uses: golangci/golangci-lint-action@v8
        with:
          version: v2.14.0

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: build da imagem
        run: docker build -t passarim-bff:ci .
      # Trivy falha em vulnerabilidade ALTA/CRÍTICA com correção disponível.
      - uses: aquasecurity/trivy-action@v0.36.0
        with:
          image-ref: passarim-bff:ci
          severity: HIGH,CRITICAL
          exit-code: "1"
          ignore-unfixed: true
```

- [ ] **Step 3: README do `passarim-bff`** — `README.md` com: uma frase sobre o serviço; o diagrama Mermaid abaixo; tabela de comandos (`make test|lint|e2e|run`); link para a spec e para o `openapi.yaml`; tabela das variáveis de ambiente (copie a da spec §9); e uma seção "Limitações conhecidas" com os três itens que o leitor precisa saber (a janela de mídia de §5.8, o rate limit por réplica, o IP compartilhado no ambiente local de §7.4).

```mermaid
flowchart LR
    App([App]) --> T[Traefik]
    T --> H
    subgraph BFF["passarim-bff (cada réplica)"]
        H["adapter/http<br/>middlewares → rotas /v1 → DTOs"] --> U["usecase<br/>valida + orçamento 3 s"]
        U --> C["cache Redis<br/>stale-while-error"]
        C --> B["circuit breaker"]
        B --> R["retry + timeout"]
        R --> G["grpcclient"]
    end
    C <--> Redis[(Redis)]
    G -- gRPC --> Cat[Catalog API]
    H --> M["media: chave → URL pública"]
```

Valide o Mermaid: `npx -y @mermaid-js/mermaid-cli -p ../passarim-docs/.github/puppeteer-config.json -i README.md -o /tmp/readme-bff.md` (Expected: o diagrama é renderizado sem erro).

- [ ] **Step 4: ADRs 0015 e 0016** (`passarim-docs/docs/adr/`; formato dos ADRs existentes: título `# ADR-00NN: ...`, `- **Status:** Aceita`, `- **Data:** 2026-10-03`, seções `## Contexto`, `## Decisão`, `## Consequências`):

`0015-rate-limit-em-memoria-por-replica.md`:

```markdown
# ADR-0015: Rate limit em memória, por réplica

- **Status:** Aceita
- **Data:** 2026-10-03

## Contexto

O BFF precisa limitar requisições por IP (OWASP API4). Com duas réplicas atrás do Traefik, o limite
poderia ficar no Traefik, no BFF em memória ou no BFF compartilhado via Redis.

## Decisão

Token bucket por IP, em memória, dentro de cada réplica do BFF (`golang.org/x/time/rate`), com
teto de IPs rastreados e despejo do mais ocioso. O 429 sai em `problem+json` com `Retry-After`.
O IP do cliente só vem de `X-Forwarded-For` quando a conexão é de um proxy confiável (IP fixo do
Traefik), lendo da direita para a esquerda; nunca a primeira entrada. Alternativa descartada: Redis
compartilhado, porque poria uma dependência no caminho de CADA requisição.

## Consequências

- O limite efetivo é por réplica: com 2 réplicas e round-robin, um IP consegue até ~2× o limite.
- Funciona igual em qualquer ambiente (o limite no Traefik não existiria no proxy do Fly.io).
- Localmente, clientes do host chegam ao Traefik com o IP do gateway do Docker e dividem o mesmo balde.
- Cada IPv6 conta como um balde (agrupar por /64 está no backlog).
```

`0016-cache-com-envelope-e-stale-while-error.md`:

```markdown
# ADR-0016: Cache com envelope e stale-while-error

- **Status:** Aceita
- **Data:** 2026-10-03

## Contexto

O app precisa continuar funcionando quando o catalog ou o banco caem. O cache Redis do BFF deve
poupar o catalog e, na falha, servir o dado velho em vez de um erro.

## Decisão

O Redis guarda um envelope `{storedAt, data}`. O frescor (10 min) é decidido em código comparando
`storedAt`; o TTL no Redis é longo (24 h) e é a janela em que o dado velho ainda pode ser servido.
A classificação de erros é única (`domain/errors.go`): `Unavailable`, `Timeout`, `Upstream` (inclui o
`INTERNAL` que o catalog devolve quando o Postgres cai) e `CircuitOpen` liberam o stale;
`NotFound`, `InvalidArgument` e `Canceled` nunca. O `/readyz` não depende do catalog, senão as
réplicas sairiam do balanceador e o stale nunca seria servido. Listas com busca (`q`) ficam fora
do cache (cardinalidade ilimitada). O singleflight roda com `context.WithoutCancel` e os chamadores
esperam com `DoChan`, para o cancelamento de um não afetar os outros.

## Consequências

- Resposta stale é sinalizada em `X-Cache: stale`, no log e na métrica.
- Há uma janela conhecida de URLs de mídia quebradas: o worker apaga objetos antigos quando troca a
  mídia (`removeOrphans`), e o BFF pode servir a URL velha por ~10 min de frescor + 60 s de
  `max-age`, ou enquanto servir stale. Aceito no MVP (melhoria no backlog).
- Mudar o formato do envelope exige subir a versão do prefixo da chave (`bff:v1:`).
```

- [ ] **Step 5: README do `passarim-docs`** — na tabela de repositórios, troque a linha `passarim-bff | BFF REST + cache *(etapa 3)*` por `| [passarim-bff](https://github.com/velosobr/passarim-bff) | BFF REST/JSON + cache Redis + resiliência |`; na tabela de serviços locais, acrescente `| API (BFF via Traefik) | <http://localhost:8080/v1/species> (porta `HOST_PORT_TRAEFIK_HTTP`) |`; e acrescente a seção:

````markdown
## Demonstração: derrubar uma réplica do BFF

O BFF roda em duas réplicas (`bff-1` e `bff-2`) atrás do Traefik. Para ver o balanceamento:

```bash
# Terminal 1: um laço de requisições (troque 8080 pelo HOST_PORT_TRAEFIK_HTTP do seu .env)
while true; do curl -s -o /dev/null -w "%{http_code} " localhost:8080/v1/filters; sleep 0.2; done

# Terminal 2: derrube uma réplica. As respostas continuam 200: o BFF marca /readyz como 503,
# espera o Traefik tirá-lo da rotação e só então termina.
docker compose stop bff-1
docker compose start bff-1
```

Para ver o stale-while-error (dado velho quando o catalog cai):

```bash
curl -si localhost:8080/v1/species/turdus-rufiventris | grep -i x-cache   # miss (ou hit)
docker compose stop catalog-api
# Depois de 10 min o dado deixa de ser "fresco", mas ainda é servido:
curl -si localhost:8080/v1/species/turdus-rufiventris | grep -i x-cache   # stale
curl -si localhost:8080/v1/species/uma-ave-nunca-consultada               # 503 problem+json
docker compose start catalog-api
```
````

(O bloco acima usa cerca externa de quatro crases só para poder conter as cercas de três; no README real elas ficam normais.) Valide: `npx -y markdownlint-cli2 "**/*.md"` e o Mermaid do README do `passarim-docs` (`npx -y @mermaid-js/mermaid-cli -p .github/puppeteer-config.json -i README.md -o /tmp/readme.md`). Expected: 0 issues.

- [ ] **Step 6: Verificação completa do critério de pronto** (spec §17), com o compose no ar (`docker compose up -d --wait --build`), anotando cada resultado:

```bash
P=${HOST_PORT_TRAEFIK_HTTP:-8080}
# 1) tudo saudável
docker compose ps --format '{{.Service}} {{.Status}}' | grep -E "bff-[12]"                 # healthy nas duas
# 2) detalhe com cabeçalhos e mídia abrindo
curl -si localhost:$P/v1/species/turdus-rufiventris | grep -iE "^HTTP|x-cache|x-request-id|cache-control"
curl -s localhost:$P/v1/species/turdus-rufiventris | python3 -c "import json,sys,urllib.request;u=json.load(sys.stdin)['photos'][0]['thumbUrl'];print(u, urllib.request.urlopen(urllib.request.Request(u,method='HEAD')).status)"   # 200
# 3) 404 em problem+json
curl -si localhost:$P/v1/species/nao-existe | grep -iE "^HTTP|content-type|SPECIES_NOT_FOUND"
# 4) derrubar bff-1 com carga: nenhuma resposta fora de 200
( for i in $(seq 1 150); do curl -s -o /dev/null -w "%{http_code}\n" localhost:$P/v1/filters; sleep 0.1; done | sort | uniq -c ) & sleep 3; docker compose stop bff-1; wait   # Expected: só "150 200"
docker compose start bff-1
# 5) catalog parado: stale para o já visto, 503 problem+json (do BFF, não do Traefik) para o resto
#    (para não esperar 10 min: reinicie as réplicas com CACHE_FRESH_TTL=1s ou use o e2e, que já prova isto)
# 6) dashboard e traces
curl -s -u admin:$(grep ^GRAFANA_ADMIN_PASSWORD .env | cut -d= -f2) "localhost:3000/api/search?query=Passarim"   # dashboard presente
curl -s "localhost:16686/api/services" | grep passarim-bff                                    # serviço no Jaeger
```

Se qualquer item do critério falhar, corrija a causa raiz (não o sintoma), acrescente o achado ao `BACKLOG.md` se virar pendência e registre no relatório final.

- [ ] **Step 7: Commits e CI** — no `passarim-bff`: `git add -A && git commit -m "test: e2e com catalog real; ci: gosec, govulncheck, trivy e gitleaks; docs: README"`; no `passarim-docs`: `git add -A && git commit -m "docs: ADRs 0015 e 0016, roteiro do docker stop e BFF no README"`. Com autorização, `git push` nos dois e `gh run watch` até o CI do `passarim-bff` e do `passarim-docs` ficarem verdes (se falhar, corrija a causa raiz e registre no relatório).

---

## Auto-revisão (cobertura da spec)

| Seção da spec | Onde está no plano |
|---|---|
| §3 arquitetura e pacotes | Estrutura de arquivos; Tasks 1–6 |
| §4 contrato REST (formatos, parâmetros, erros, cabeçalhos) | Task 4 (DTOs, erros, `X-Cache`, `Cache-Control`), Task 5 (404/405), Task 7 (`openapi.yaml`) |
| §5 resiliência (cache, tabela de erros, breaker, retry, orçamento, métricas) | Task 1 (`Kind` e tabela), Task 2 (orçamento), Task 6 (decorators), Task 8 (métricas Prometheus) |
| §6 health, readiness e shutdown | Task 8 (`health.go`, `server.Run`, `Healthcheck`) |
| §7 segurança (middlewares, servidor, rate limit, IP real, validação) | Task 1 (validação), Task 5 (middlewares), Task 8 (timeouts em `NewHTTPServer`) |
| §8 observabilidade (logs, métricas, tracing, dashboard) | Task 5 (log), Task 8 (métricas, OTel), Task 9b (dashboard) |
| §9 configuração | Task 1 (`config.Load`) |
| §10 compose, Traefik, Prometheus, Grafana | Task 9b |
| §11 testes | Tasks 1–8 e 10 (cada camada tem os testes da tabela) |
| §12 CI | Task 1 (CI mínimo) e Task 10 (CI completo) |
| §13 fatiamento | Tasks 1 a 10 (9a e 9b separadas por repositório) |
| §14 ADRs | Task 10, Step 4 |
| §15 pendências do backlog | já registradas no `BACKLOG.md` (commit `7b7e207`); nenhuma nova nesta etapa além de achados da execução |
| §16 itens a validar | Task 9b, Step 6 (Traefik, IP real, filer) |
| §17 critério de pronto | Task 10, Step 6 |

**Consistência de tipos:** `Kind` e as funções `Retryable/CountsForBreaker/AllowsStale` (Task 1) são as usadas em `resilience` (Task 6), `cache` (Task 6) e `httpadapter` (Task 4); `ListQuery`/`RawListQuery` (Task 1) são os da `usecase` (Task 2), do `grpcclient` (Task 3), do cache (Task 6) e do handler (Task 4); `metrics.Metrics` (Task 6) é implementada por `Prom` (Task 8) e injetada no `main` (Task 9a); `middleware.Observer` (Task 5) também é implementada por `Prom`.
