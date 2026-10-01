# Passarim — Etapa 2a: `passarim-catalog` (Catalog API) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o serviço `passarim-catalog` que guarda as aves no PostgreSQL e as serve via gRPC (`CatalogService`), já populado com 40 aves curadas em português, rodando no `docker compose` do `passarim-docs`.

**Architecture:** Arquitetura limpa: `domain` (regras puras) ← `usecase` (casos de uso + interfaces/ports) ← `adapter` (postgres via sqlc/pgx, gRPC, YAML curado). `cmd/catalog-api` monta as dependências; `cmd/seed` carrega o conteúdo curado. Migrations embutidas no binário rodam na subida. O worker de ingestão (fotos, cantos, ocorrências) é a Etapa 2b — aqui as tabelas de mídia/ocorrências existem mas ficam vazias.

**Tech Stack:** Go 1.27, grpc-go, pgx v5, sqlc v1.31 (via `go tool`), golang-migrate v4 (iofs + pgx/v5), go.yaml.in/yaml/v3, golang.org/x/text, Prometheus client + go-grpc-middleware/providers/prometheus, testcontainers-go (postgres), golangci-lint v2, distroless.

**Spec:** `docs/superpowers/specs/2026-10-01-passarim-design.md` (no repo `passarim-docs`)

## Global Constraints

- Código **comentado em português para um estudante** (explicar o *porquê*); identificadores em inglês.
- Módulo: `github.com/velosobr/passarim-catalog`. Contrato: `github.com/velosobr/passarim-proto` **v0.2.0** (Task 1).
- Dependências apontam só para dentro: `domain` não importa nada do projeto; `usecase` importa só `domain`; `adapter` implementa interfaces de `usecase`.
- Biomas: `amazonia, mata_atlantica, cerrado, caatinga, pantanal, pampa`. Conservação (IUCN): `LC NT VU EN CR EW EX DD` ou vazio.
- API: `page_size` 0 → 20; > 50 → 50; < 0 → erro. `query` ≤ **100 caracteres (runas)**.
- Erros gRPC: id inexistente → `NotFound`; entrada inválida → `InvalidArgument`; qualquer outro → `Internal` **sem detalhes** (detalhe só no log).
- Banco pertence ao catalog (ADR-0004). Queries **somente parametrizadas** (sqlc).
- Catalog **não é publicado** no host: só na rede `passarim-private` do compose.
- Conteúdo curado: descrição autoral (não copiada), crédito `Equipe Passarim` / `CC-BY-4.0` / `curated`, com URL de referência; toda curiosidade tem `source`.
- Imagem: distroless, non-root. CI falha em vulnerabilidade HIGH/CRITICAL.
- Fora deste plano: worker de ingestão e mídia (2b), mTLS e tracing OpenTelemetry (Etapa 3, junto com o BFF), deploy (Etapa 4).

## Review Focus

1. **Busca sem acento/maiúscula** — "sabia" e "SABIÁ" devem achar "Sabiá-laranjeira" → teste em Task 5 (`TestListSpecies_SearchIgnoresAccentsAndCase`).
2. **Curinga do LIKE na busca** — buscar `%` ou `_` deve tratar como texto literal, não "tudo" → Task 5 (`TestListSpecies_WildcardsAreLiteral`).
3. **Rodar o seed de novo** — deve ser idempotente e **não apagar** dados do worker (media, occurrence_cluster) → Task 5 (`TestUpsertCurated_PreservesWorkerData`).
4. **Busca com acentos/emoji no limite** — 100 runas aceitas, 101 recusadas (contar runas, não bytes) → Task 3 (`TestListSpecies_QueryLengthCountsRunes`).
5. **Erro de digitação no YAML curado** (ex.: `familly:`) — deve falhar com o nome do arquivo, não ser ignorado → Task 4 (`TestLoadDir_UnknownFieldFails`).
6. **PostgreSQL ainda subindo** quando o catalog inicia — deve esperar com tentativas, não morrer na hora → Task 5 (`TestWaitForDB_RetriesUntilReady`).

---

## Estrutura de arquivos

```
passarim-catalog/
├── README.md                          diagrama Mermaid + como rodar
├── go.mod / go.sum                    inclui "tool github.com/sqlc-dev/sqlc/cmd/sqlc"
├── sqlc.yaml
├── .golangci.yml
├── Dockerfile
├── Makefile
├── .github/workflows/ci.yml
├── cmd/
│   ├── catalog-api/main.go            monta tudo; subcomando "healthcheck"
│   └── seed/main.go                   carrega content/species/*.yaml
├── content/species/*.yaml             40 aves curadas
└── internal/
    ├── config/config.go (+_test)      variáveis de ambiente
    ├── domain/
    │   ├── species.go (+_test)        entidades, biomas, UFs, normalização
    │   └── errors.go                  ErrNotFound, InvalidArgumentError
    ├── usecase/
    │   ├── ports.go                   SpeciesRepository + tipos de filtro
    │   ├── cursor.go (+_test)         token de paginação
    │   ├── list_species.go (+_test)
    │   ├── get_species.go (+_test)
    │   ├── list_filters.go (+_test)
    │   └── fake_repo_test.go          repositório falso para os testes
    └── adapter/
        ├── curated/loader.go (+_test, testdata/)
        ├── postgres/
        │   ├── migrations/0001_init.up.sql / .down.sql
        │   ├── migrate.go             roda migrations embutidas
        │   ├── queries.sql
        │   ├── sqlcgen/               (gerado pelo sqlc, commitado)
        │   ├── repository.go
        │   ├── wait.go (+_test)       espera o banco ficar pronto
        │   └── repository_test.go     integração (testcontainers)
        └── grpc/
            ├── server.go (+_test)     CatalogService → usecases
            ├── mapping.go             domain ↔ proto
            └── interceptors.go (+_test) request id + log
```

---

### Task 1: `passarim-proto` v0.2.0 — semântica de erros, page_size e precisão dos clusters

**Repo:** `~/dev/passarim/passarim-proto`

**Files:**
- Modify: `proto/passarim/catalog/v1/catalog.proto`
- Modify: `contract_test.go`

**Interfaces:**
- Produces: `OccurrenceCluster.Precision float64` (campo 4); tag `v0.2.0`.

- [ ] **Step 1: Teste que falha**

Adicionar ao final de `contract_test.go`:

```go
// O mapa usa a precisão (em graus) para desenhar o raio de cada cluster.
func TestOccurrenceClusterHasPrecision(t *testing.T) {
	c := &catalogv1.OccurrenceCluster{Lat: -19, Lng: -57, Count: 3, Precision: 0.5}
	bytes, _ := proto.Marshal(c)
	decoded := &catalogv1.OccurrenceCluster{}
	if err := proto.Unmarshal(bytes, decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if decoded.GetPrecision() != 0.5 {
		t.Fatalf("precision = %v, want 0.5", decoded.GetPrecision())
	}
}
```

- [ ] **Step 2: Ver falhar**

Run: `go test ./...` — Expected: FAIL `unknown field Precision`.

- [ ] **Step 3: Alterar o `.proto`**

Substituir o bloco `service CatalogService { ... }` por:

```proto
// CatalogService é servido pelo passarim-catalog e consumido pelo passarim-bff.
//
// Erros (códigos gRPC) que todos os métodos podem devolver:
//   - INVALID_ARGUMENT: parâmetro inválido (bioma/UF desconhecido, page_token
//     corrompido, query com mais de 100 caracteres, page_size negativo).
//   - NOT_FOUND: (só GetSpecies) não existe espécie com esse id.
//   - INTERNAL: falha inesperada; a mensagem NÃO traz detalhes internos.
service CatalogService {
  // Lista resumida de espécies, com busca, filtros e paginação.
  rpc ListSpecies(ListSpeciesRequest) returns (ListSpeciesResponse);
  // Todos os dados de uma espécie, para a tela de detalhe.
  rpc GetSpecies(GetSpeciesRequest) returns (GetSpeciesResponse);
  // Biomas e estados que têm ao menos uma espécie, com a contagem.
  rpc ListFilters(ListFiltersRequest) returns (ListFiltersResponse);
}
```

No `message OccurrenceCluster`, adicionar após `count`:

```proto
  // Tamanho do agrupamento em graus (lado do quadrado usado para agrupar).
  // O app usa para escolher o raio do círculo no mapa.
  double precision = 4;
```

No `message ListSpeciesRequest`, trocar a linha do `page_size` por:

```proto
  // Quantos itens por página. 0 = padrão (20). Acima de 50 = 50. Negativo = erro.
  int32 page_size = 4;
```

- [ ] **Step 4: Gerar, testar, verificar compatibilidade**

```bash
buf format -w && buf lint && buf generate
go test ./...                                   # Expected: 5 testes passam
buf breaking --against '.git#ref=HEAD'          # Expected: sem saída (só adições)
```

- [ ] **Step 5: Commit, push e tag**

```bash
git add . && git commit -m "feat: documenta erros e page_size; adiciona precision ao cluster"
git push && git tag v0.2.0 && git push origin v0.2.0
```

---

### Task 2: Repositório `passarim-catalog` + camada `domain`

**Files:**
- Create: `go.mod`, `.gitignore`, `Makefile`, `internal/domain/species.go`, `internal/domain/errors.go`, `internal/domain/species_test.go`

**Interfaces:**
- Produces (pacote `domain`):
  - `type Biome string`; consts `BiomeAmazonia … BiomePampa`; `AllBiomes() []Biome`; `ParseBiome(string) (Biome, error)`
  - `type ConservationStatus string`; consts `StatusUnknown("")`, `StatusLC … StatusDD`; `ParseConservationStatus(string) (ConservationStatus, error)`
  - `NormalizeUF(string) (string, error)`; `AllUFs() []string`
  - `SpeciesID(scientificName string) string`; `NormalizeForSearch(string) string`
  - structs `Credit{Author, License, Source, SourceURL}`, `Fact{Text, Source}`, `Photo{ThumbKey, MediumKey, LargeKey string; Width, Height int; Credit}`, `Audio{Key string; DurationMs int; Credit}`, `OccurrenceCluster{Lat, Lng float64; Count int; Precision float64}`, `SpeciesSummary{ID, ScientificName, CommonNamePt, ThumbnailKey string; ConservationStatus}`, `Species{ID, ScientificName, CommonNamePt, Family string; SizeCm *int; Diet *string; ConservationStatus; Description string; DescriptionCredit Credit; Facts []Fact; Biomes []Biome; States []string; Photos []Photo; Audio *Audio; Clusters []OccurrenceCluster}`
  - `(Species) Validate() error`
  - `var ErrNotFound`; `type InvalidArgumentError struct{Field, Reason string}`

- [ ] **Step 1: Criar o repositório**

```bash
mkdir -p ~/dev/passarim/passarim-catalog && cd ~/dev/passarim/passarim-catalog
git init -b main
git config user.name "Lino Veloso" && git config user.email "linoc.veloso@gmail.com"
go mod init github.com/velosobr/passarim-catalog
printf '.DS_Store\n.idea/\n.vscode/\n.env\n.env.*\n!.env.example\n/bin/\n' > .gitignore
```

`Makefile`:

```makefile
# Atalhos do dia a dia. Uso: make test | make generate | make lint | make run
.PHONY: test generate lint run

# Todos os testes. Os de integração sobem um PostgreSQL de verdade (precisa de Docker).
test:
	go test -race ./...

# Gera o código Go das queries SQL (sqlc).
generate:
	go tool sqlc generate

lint:
	golangci-lint run

# Roda a API localmente apontando para o PostgreSQL do docker compose.
run:
	DATABASE_URL=postgres://passarim:passarim-dev@localhost:5432/passarim?sslmode=disable go run ./cmd/catalog-api
```

- [ ] **Step 2: Escrever os testes que falham** — `internal/domain/species_test.go`

```go
package domain_test

import (
	"errors"
	"testing"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

func TestSpeciesID(t *testing.T) {
	cases := map[string]string{
		"Turdus rufiventris":     "turdus-rufiventris",
		"  Ramphastos   toco  ":  "ramphastos-toco",
		"Anodorhynchus Hyacinthinus": "anodorhynchus-hyacinthinus",
	}
	for in, want := range cases {
		if got := domain.SpeciesID(in); got != want {
			t.Errorf("SpeciesID(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestNormalizeForSearch(t *testing.T) {
	cases := map[string]string{
		"Sabiá-Laranjeira": "sabia-laranjeira",
		"  JOÃO-DE-BARRO ": "joao-de-barro",
		"Tiê-sangue":       "tie-sangue",
		"Saíra-sete-cores": "saira-sete-cores",
	}
	for in, want := range cases {
		if got := domain.NormalizeForSearch(in); got != want {
			t.Errorf("NormalizeForSearch(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestParseBiome(t *testing.T) {
	if b, err := domain.ParseBiome("pantanal"); err != nil || b != domain.BiomePantanal {
		t.Fatalf("ParseBiome(pantanal) = %v, %v", b, err)
	}
	_, err := domain.ParseBiome("deserto")
	var inv *domain.InvalidArgumentError
	if !errors.As(err, &inv) || inv.Field != "biome" {
		t.Fatalf("esperava InvalidArgumentError em biome, veio %v", err)
	}
	if len(domain.AllBiomes()) != 6 {
		t.Fatalf("esperava 6 biomas")
	}
}

func TestParseConservationStatus(t *testing.T) {
	for _, s := range []string{"", "LC", "NT", "VU", "EN", "CR", "EW", "EX", "DD"} {
		if _, err := domain.ParseConservationStatus(s); err != nil {
			t.Errorf("%q deveria ser válido: %v", s, err)
		}
	}
	if _, err := domain.ParseConservationStatus("XX"); err == nil {
		t.Error("XX deveria ser inválido")
	}
}

func TestNormalizeUF(t *testing.T) {
	if uf, err := domain.NormalizeUF(" ms "); err != nil || uf != "MS" {
		t.Fatalf("NormalizeUF(ms) = %q, %v", uf, err)
	}
	if _, err := domain.NormalizeUF("XX"); err == nil {
		t.Fatal("XX não é UF")
	}
	if len(domain.AllUFs()) != 27 {
		t.Fatalf("esperava 27 UFs (26 estados + DF), veio %d", len(domain.AllUFs()))
	}
}

func validSpecies() domain.Species {
	size := 25
	return domain.Species{
		ID: "turdus-rufiventris", ScientificName: "Turdus rufiventris",
		CommonNamePt: "Sabiá-laranjeira", Family: "Turdidae", SizeCm: &size,
		ConservationStatus: domain.StatusLC,
		Biomes:             []domain.Biome{domain.BiomeMataAtlantica},
		States:             []string{"SP"},
		Facts:              []domain.Fact{{Text: "É a ave-símbolo do Brasil.", Source: "https://pt.wikipedia.org/wiki/Sabi%C3%A1-laranjeira"}},
	}
}

func TestSpeciesValidate(t *testing.T) {
	if err := validSpecies().Validate(); err != nil {
		t.Fatalf("espécie válida recusada: %v", err)
	}
	broken := map[string]func(*domain.Species){
		"scientific_name": func(s *domain.Species) { s.ScientificName = "Turdus" },
		"common_name_pt":  func(s *domain.Species) { s.CommonNamePt = " " },
		"family":          func(s *domain.Species) { s.Family = "" },
		"size_cm":         func(s *domain.Species) { z := 0; s.SizeCm = &z },
		"biomes":          func(s *domain.Species) { s.Biomes = []domain.Biome{"deserto"} },
		"states":          func(s *domain.Species) { s.States = []string{"sp"} },
		"facts":           func(s *domain.Species) { s.Facts[0].Source = "" },
		"id":              func(s *domain.Species) { s.ID = "outro-id" },
	}
	for field, breakIt := range broken {
		s := validSpecies()
		breakIt(&s)
		err := s.Validate()
		var inv *domain.InvalidArgumentError
		if !errors.As(err, &inv) || inv.Field != field {
			t.Errorf("campo %s: esperava InvalidArgumentError, veio %v", field, err)
		}
	}
}
```

- [ ] **Step 3: Ver falhar**

Run: `go test ./internal/domain/` — Expected: FAIL (pacote `domain` não existe).

- [ ] **Step 4: Implementar** — `internal/domain/errors.go`

```go
package domain

import "errors"

// ErrNotFound indica que o item pedido não existe.
// Camadas de fora traduzem isso para NOT_FOUND (gRPC) ou 404 (HTTP).
var ErrNotFound = errors.New("não encontrado")

// InvalidArgumentError indica que um dado de entrada está errado.
// Field diz QUAL campo, para que o erro seja útil para quem chamou.
type InvalidArgumentError struct {
	Field  string
	Reason string
}

func (e *InvalidArgumentError) Error() string { return e.Field + ": " + e.Reason }

func invalid(field, reason string) error { return &InvalidArgumentError{Field: field, Reason: reason} }
```

`internal/domain/species.go`:

```go
// Package domain contém as regras de negócio puras do catálogo de aves.
// Nada aqui conhece banco de dados, gRPC ou HTTP — só Go puro.
// Por isso dá para testar tudo sem subir nenhum container.
package domain

import (
	"fmt"
	"sort"
	"strings"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

// Biome é um dos seis biomas brasileiros.
type Biome string

const (
	BiomeAmazonia      Biome = "amazonia"
	BiomeMataAtlantica Biome = "mata_atlantica"
	BiomeCerrado       Biome = "cerrado"
	BiomeCaatinga      Biome = "caatinga"
	BiomePantanal      Biome = "pantanal"
	BiomePampa         Biome = "pampa"
)

var allBiomes = []Biome{BiomeAmazonia, BiomeMataAtlantica, BiomeCerrado, BiomeCaatinga, BiomePantanal, BiomePampa}

// AllBiomes devolve uma CÓPIA da lista (quem chamar não consegue alterar a original).
func AllBiomes() []Biome { return append([]Biome(nil), allBiomes...) }

// ParseBiome converte texto em Biome, recusando valores desconhecidos.
func ParseBiome(s string) (Biome, error) {
	for _, b := range allBiomes {
		if string(b) == s {
			return b, nil
		}
	}
	return "", invalid("biome", fmt.Sprintf("bioma desconhecido %q", s))
}

// ConservationStatus segue a Lista Vermelha da IUCN. Vazio = ainda não sabemos.
type ConservationStatus string

const (
	StatusUnknown ConservationStatus = ""
	StatusLC      ConservationStatus = "LC" // pouco preocupante
	StatusNT      ConservationStatus = "NT" // quase ameaçada
	StatusVU      ConservationStatus = "VU" // vulnerável
	StatusEN      ConservationStatus = "EN" // em perigo
	StatusCR      ConservationStatus = "CR" // criticamente em perigo
	StatusEW      ConservationStatus = "EW" // extinta na natureza
	StatusEX      ConservationStatus = "EX" // extinta
	StatusDD      ConservationStatus = "DD" // dados insuficientes
)

// ParseConservationStatus aceita apenas as categorias da IUCN (ou vazio).
func ParseConservationStatus(s string) (ConservationStatus, error) {
	switch c := ConservationStatus(s); c {
	case StatusUnknown, StatusLC, StatusNT, StatusVU, StatusEN, StatusCR, StatusEW, StatusEX, StatusDD:
		return c, nil
	}
	return "", invalid("conservation_status", fmt.Sprintf("categoria IUCN desconhecida %q", s))
}

// As 27 unidades federativas: 26 estados + Distrito Federal.
var validUFs = map[string]bool{
	"AC": true, "AL": true, "AP": true, "AM": true, "BA": true, "CE": true, "DF": true,
	"ES": true, "GO": true, "MA": true, "MT": true, "MS": true, "MG": true, "PA": true,
	"PB": true, "PR": true, "PE": true, "PI": true, "RJ": true, "RN": true, "RS": true,
	"RO": true, "RR": true, "SC": true, "SP": true, "SE": true, "TO": true,
}

// AllUFs devolve as siglas em ordem alfabética.
func AllUFs() []string {
	ufs := make([]string, 0, len(validUFs))
	for uf := range validUFs {
		ufs = append(ufs, uf)
	}
	sort.Strings(ufs)
	return ufs
}

// NormalizeUF aceita " ms " e devolve "MS"; recusa siglas que não existem.
func NormalizeUF(s string) (string, error) {
	uf := strings.ToUpper(strings.TrimSpace(s))
	if !validUFs[uf] {
		return "", invalid("state", fmt.Sprintf("UF desconhecida %q", s))
	}
	return uf, nil
}

// SpeciesID cria o identificador estável de uma espécie a partir do nome
// científico: "Turdus rufiventris" -> "turdus-rufiventris". Usamos o nome
// científico porque o popular muda de região para região.
func SpeciesID(scientificName string) string {
	return strings.ToLower(strings.Join(strings.Fields(scientificName), "-"))
}

// accentRemover decompõe "á" em "a" + acento (NFD), remove os acentos
// (categoria Unicode Mn = "marcas não espaçadas") e recompõe (NFC).
var accentRemover = transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC)

// NormalizeForSearch deixa o texto sem acentos e em minúsculas, para que
// "sabia" encontre "Sabiá". É usada tanto ao GRAVAR quanto ao BUSCAR:
// as duas pontas precisam normalizar do mesmo jeito.
func NormalizeForSearch(s string) string {
	out, _, err := transform.String(accentRemover, s)
	if err != nil {
		out = s // em caso de texto Unicode inválido, segue sem remover acentos
	}
	return strings.ToLower(strings.TrimSpace(out))
}

// Credit guarda a autoria exigida pelas licenças Creative Commons.
type Credit struct {
	Author    string
	License   string
	Source    string
	SourceURL string
}

// Fact é uma curiosidade com a fonte de onde ela veio.
type Fact struct {
	Text   string
	Source string
}

// Photo guarda CHAVES do object storage, não URLs (quem monta a URL é o BFF).
type Photo struct {
	ThumbKey, MediumKey, LargeKey string
	Width, Height                 int
	Credit                        Credit
}

// Audio é a gravação do canto.
type Audio struct {
	Key        string
	DurationMs int
	Credit     Credit
}

// OccurrenceCluster agrupa avistamentos próximos num único ponto do mapa.
type OccurrenceCluster struct {
	Lat, Lng  float64
	Count     int
	Precision float64
}

// SpeciesSummary é a versão leve, usada nos cards da lista.
type SpeciesSummary struct {
	ID                 string
	ScientificName     string
	CommonNamePt       string
	ThumbnailKey       string
	ConservationStatus ConservationStatus
}

// Species é a versão completa, usada na tela de detalhe.
// Ponteiros (*int, *string, *Audio) significam "pode não existir":
// nil é diferente de zero (tamanho desconhecido ≠ 0 cm).
type Species struct {
	ID                 string
	ScientificName     string
	CommonNamePt       string
	Family             string
	SizeCm             *int
	Diet               *string
	ConservationStatus ConservationStatus
	Description        string
	DescriptionCredit  Credit
	Facts              []Fact
	Biomes             []Biome
	States             []string
	Photos             []Photo
	Audio              *Audio
	Clusters           []OccurrenceCluster
}

// Validate verifica as regras que toda espécie precisa cumprir antes
// de ser gravada. Devolve o PRIMEIRO problema encontrado.
func (s Species) Validate() error {
	if len(strings.Fields(s.ScientificName)) != 2 {
		return invalid("scientific_name", "deve ter gênero e espécie, ex.: \"Turdus rufiventris\"")
	}
	if s.ID != SpeciesID(s.ScientificName) {
		return invalid("id", fmt.Sprintf("deve ser %q", SpeciesID(s.ScientificName)))
	}
	if strings.TrimSpace(s.CommonNamePt) == "" {
		return invalid("common_name_pt", "obrigatório")
	}
	if strings.TrimSpace(s.Family) == "" {
		return invalid("family", "obrigatório")
	}
	if s.SizeCm != nil && *s.SizeCm <= 0 {
		return invalid("size_cm", "deve ser maior que zero")
	}
	if _, err := ParseConservationStatus(string(s.ConservationStatus)); err != nil {
		return err
	}
	for _, b := range s.Biomes {
		if _, err := ParseBiome(string(b)); err != nil {
			return invalid("biomes", err.Error())
		}
	}
	for _, uf := range s.States {
		// Exigimos a forma já normalizada ("SP"), para o banco ficar consistente.
		if n, err := NormalizeUF(uf); err != nil || n != uf {
			return invalid("states", fmt.Sprintf("UF inválida %q (use maiúsculas, ex.: SP)", uf))
		}
	}
	for i, f := range s.Facts {
		if strings.TrimSpace(f.Text) == "" || strings.TrimSpace(f.Source) == "" {
			return invalid("facts", fmt.Sprintf("curiosidade %d precisa de texto e fonte", i+1))
		}
	}
	return nil
}
```

- [ ] **Step 5: Ver passar**

```bash
go get golang.org/x/text && go mod tidy
go test ./internal/domain/   # Expected: ok
```

- [ ] **Step 6: Commit**

```bash
git add . && git commit -m "feat: camada domain com espécies, biomas, UFs e validação"
```

---

### Task 3: Casos de uso + cursor de paginação

**Files:**
- Create: `internal/usecase/ports.go`, `cursor.go`, `list_species.go`, `get_species.go`, `list_filters.go`, `fake_repo_test.go`, `cursor_test.go`, `list_species_test.go`, `get_species_test.go`, `list_filters_test.go`

**Interfaces:**
- Consumes: pacote `domain` (Task 2).
- Produces (pacote `usecase`):
  - `type SpeciesRepository interface { ListSpecies(ctx, ListFilter) ([]domain.SpeciesSummary, error); GetSpecies(ctx, id string) (domain.Species, error); CountByBiome(ctx) (map[domain.Biome]int, error); CountByState(ctx) (map[string]int, error) }`
  - `type ListFilter struct { Query string; Biome domain.Biome; State string; After *Cursor; Limit int }` (Query já normalizada; Limit = itens a buscar)
  - `type Cursor struct { SortName, ID string }`; `EncodeCursor(Cursor) string`; `DecodeCursor(string) (Cursor, error)`
  - consts `DefaultPageSize = 20`, `MaxPageSize = 50`, `MaxQueryLen = 100`
  - `ListSpecies{Repo}.Execute(ctx, ListSpeciesInput{Query, Biome, State, PageToken string; PageSize int}) (ListSpeciesOutput{Species []domain.SpeciesSummary; NextPageToken string}, error)`
  - `GetSpecies{Repo}.Execute(ctx, id string) (domain.Species, error)`
  - `ListFilters{Repo}.Execute(ctx) (Filters, error)`; `Filters{Biomes []BiomeCount; States []StateCount}`; `BiomeCount{Biome domain.Biome; Count int}`; `StateCount{State string; Count int}`
  - Regra do cursor: `SortName = domain.NormalizeForSearch(CommonNamePt)` do último item; a ordem da lista é `(SortName, ID)`.

- [ ] **Step 1: Repositório falso** — `internal/usecase/fake_repo_test.go`

```go
package usecase_test

import (
	"context"
	"sort"
	"strings"

	"github.com/velosobr/passarim-catalog/internal/domain"
	"github.com/velosobr/passarim-catalog/internal/usecase"
)

// fakeRepo imita o banco em memória. Testar casos de uso com um "fake"
// (e não com o PostgreSQL real) deixa os testes rápidos e focados na regra.
type fakeRepo struct {
	species   []domain.Species
	lastQuery usecase.ListFilter
	err       error
}

func (f *fakeRepo) ListSpecies(_ context.Context, q usecase.ListFilter) ([]domain.SpeciesSummary, error) {
	f.lastQuery = q
	if f.err != nil {
		return nil, f.err
	}
	all := append([]domain.Species(nil), f.species...)
	sort.Slice(all, func(i, j int) bool {
		a, b := domain.NormalizeForSearch(all[i].CommonNamePt), domain.NormalizeForSearch(all[j].CommonNamePt)
		if a != b {
			return a < b
		}
		return all[i].ID < all[j].ID
	})
	var out []domain.SpeciesSummary
	for _, s := range all {
		key := domain.NormalizeForSearch(s.CommonNamePt)
		if q.After != nil && (key < q.After.SortName || (key == q.After.SortName && s.ID <= q.After.ID)) {
			continue
		}
		if q.Query != "" && !strings.Contains(key, q.Query) {
			continue
		}
		out = append(out, domain.SpeciesSummary{ID: s.ID, CommonNamePt: s.CommonNamePt, ScientificName: s.ScientificName})
		if len(out) == q.Limit {
			break
		}
	}
	return out, nil
}

func (f *fakeRepo) GetSpecies(_ context.Context, id string) (domain.Species, error) {
	for _, s := range f.species {
		if s.ID == id {
			return s, nil
		}
	}
	return domain.Species{}, domain.ErrNotFound
}

func (f *fakeRepo) CountByBiome(context.Context) (map[domain.Biome]int, error) {
	return map[domain.Biome]int{domain.BiomePantanal: 2, domain.BiomeAmazonia: 1}, f.err
}

func (f *fakeRepo) CountByState(context.Context) (map[string]int, error) {
	return map[string]int{"SP": 3, "AM": 1}, f.err
}

// birds cria n espécies "Ave 01", "Ave 02"...
func birds(n int) []domain.Species {
	out := make([]domain.Species, n)
	for i := range out {
		name := "Ave " + string(rune('A'+i/26)) + string(rune('a'+i%26))
		out[i] = domain.Species{ID: domain.SpeciesID("Genus s" + name[4:]), CommonNamePt: name, ScientificName: "Genus s" + name[4:]}
	}
	return out
}
```

- [ ] **Step 2: Testes que falham** — `cursor_test.go`

```go
package usecase_test

import (
	"errors"
	"testing"

	"github.com/velosobr/passarim-catalog/internal/domain"
	"github.com/velosobr/passarim-catalog/internal/usecase"
)

func TestCursorRoundTrip(t *testing.T) {
	c := usecase.Cursor{SortName: "sabia-laranjeira", ID: "turdus-rufiventris"}
	got, err := usecase.DecodeCursor(usecase.EncodeCursor(c))
	if err != nil || got != c {
		t.Fatalf("ida e volta falhou: %v, %v", got, err)
	}
}

func TestDecodeCursorRejectsGarbage(t *testing.T) {
	for _, token := range []string{"!!!", "e30", "bm90LWpzb24"} { // inválido, "{}", "not-json"
		_, err := usecase.DecodeCursor(token)
		var inv *domain.InvalidArgumentError
		if !errors.As(err, &inv) || inv.Field != "page_token" {
			t.Errorf("token %q: esperava InvalidArgumentError(page_token), veio %v", token, err)
		}
	}
}
```

`list_species_test.go`:

```go
package usecase_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/velosobr/passarim-catalog/internal/domain"
	"github.com/velosobr/passarim-catalog/internal/usecase"
)

func TestListSpecies_DefaultAndMaxPageSize(t *testing.T) {
	repo := &fakeRepo{species: birds(80)}
	uc := usecase.ListSpecies{Repo: repo}

	out, err := uc.Execute(context.Background(), usecase.ListSpeciesInput{})
	if err != nil || len(out.Species) != usecase.DefaultPageSize {
		t.Fatalf("padrão: len=%d err=%v", len(out.Species), err)
	}
	out, _ = uc.Execute(context.Background(), usecase.ListSpeciesInput{PageSize: 500})
	if len(out.Species) != usecase.MaxPageSize {
		t.Fatalf("máximo: len=%d, want %d", len(out.Species), usecase.MaxPageSize)
	}
}

func TestListSpecies_PaginatesWithoutGapsOrRepeats(t *testing.T) {
	repo := &fakeRepo{species: birds(45)}
	uc := usecase.ListSpecies{Repo: repo}
	seen := map[string]bool{}
	token := ""
	for page := 0; page < 10; page++ {
		out, err := uc.Execute(context.Background(), usecase.ListSpeciesInput{PageSize: 20, PageToken: token})
		if err != nil {
			t.Fatal(err)
		}
		for _, s := range out.Species {
			if seen[s.ID] {
				t.Fatalf("espécie repetida entre páginas: %s", s.ID)
			}
			seen[s.ID] = true
		}
		if out.NextPageToken == "" {
			break
		}
		token = out.NextPageToken
	}
	if len(seen) != 45 {
		t.Fatalf("viu %d espécies, want 45", len(seen))
	}
}

func TestListSpecies_LastPageHasNoToken(t *testing.T) {
	uc := usecase.ListSpecies{Repo: &fakeRepo{species: birds(20)}}
	out, _ := uc.Execute(context.Background(), usecase.ListSpeciesInput{PageSize: 20})
	if out.NextPageToken != "" {
		t.Fatal("exatamente 20 itens e page_size 20: não deveria haver próxima página")
	}
}

func TestListSpecies_NormalizesQueryAndFilters(t *testing.T) {
	repo := &fakeRepo{}
	uc := usecase.ListSpecies{Repo: repo}
	_, err := uc.Execute(context.Background(), usecase.ListSpeciesInput{Query: "  SABIÁ ", Biome: "cerrado", State: "go"})
	if err != nil {
		t.Fatal(err)
	}
	q := repo.lastQuery
	if q.Query != "sabia" || q.Biome != domain.BiomeCerrado || q.State != "GO" || q.Limit != usecase.DefaultPageSize+1 {
		t.Fatalf("filtro repassado errado: %+v", q)
	}
}

// Review Focus #4: o limite é em CARACTERES (runas), não em bytes.
// "á" ocupa 2 bytes em UTF-8; 100 deles = 200 bytes, mas são 100 caracteres.
func TestListSpecies_QueryLengthCountsRunes(t *testing.T) {
	uc := usecase.ListSpecies{Repo: &fakeRepo{}}
	if _, err := uc.Execute(context.Background(), usecase.ListSpeciesInput{Query: strings.Repeat("á", 100)}); err != nil {
		t.Fatalf("100 caracteres deveria ser aceito: %v", err)
	}
	_, err := uc.Execute(context.Background(), usecase.ListSpeciesInput{Query: strings.Repeat("🐦", 101)})
	assertInvalid(t, err, "query")
}

func TestListSpecies_InvalidInputs(t *testing.T) {
	uc := usecase.ListSpecies{Repo: &fakeRepo{}}
	cases := map[string]usecase.ListSpeciesInput{
		"biome":      {Biome: "deserto"},
		"state":      {State: "XX"},
		"page_size":  {PageSize: -1},
		"page_token": {PageToken: "lixo!"},
	}
	for field, in := range cases {
		_, err := uc.Execute(context.Background(), in)
		assertInvalid(t, err, field)
	}
}

func TestListSpecies_RepositoryErrorPropagates(t *testing.T) {
	boom := errors.New("banco caiu")
	_, err := usecase.ListSpecies{Repo: &fakeRepo{err: boom}}.Execute(context.Background(), usecase.ListSpeciesInput{})
	if !errors.Is(err, boom) {
		t.Fatalf("esperava o erro do repositório, veio %v", err)
	}
}

func assertInvalid(t *testing.T, err error, field string) {
	t.Helper()
	var inv *domain.InvalidArgumentError
	if !errors.As(err, &inv) || inv.Field != field {
		t.Fatalf("esperava InvalidArgumentError(%s), veio %v", field, err)
	}
}
```

`get_species_test.go`:

```go
package usecase_test

import (
	"context"
	"errors"
	"testing"

	"github.com/velosobr/passarim-catalog/internal/domain"
	"github.com/velosobr/passarim-catalog/internal/usecase"
)

func TestGetSpecies(t *testing.T) {
	uc := usecase.GetSpecies{Repo: &fakeRepo{species: birds(3)}}
	want := birds(3)[1]
	got, err := uc.Execute(context.Background(), "  "+want.ID+" ")
	if err != nil || got.ID != want.ID {
		t.Fatalf("got %v, %v", got.ID, err)
	}
	if _, err := uc.Execute(context.Background(), "nao-existe"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("esperava ErrNotFound, veio %v", err)
	}
	_, err = uc.Execute(context.Background(), "   ")
	assertInvalid(t, err, "id")
}
```

`list_filters_test.go`:

```go
package usecase_test

import (
	"context"
	"testing"

	"github.com/velosobr/passarim-catalog/internal/domain"
	"github.com/velosobr/passarim-catalog/internal/usecase"
)

func TestListFilters_OrdersBiomesCanonicallyAndStatesAlphabetically(t *testing.T) {
	out, err := usecase.ListFilters{Repo: &fakeRepo{}}.Execute(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	// Ordem dos biomas segue domain.AllBiomes (amazonia antes de pantanal).
	if len(out.Biomes) != 2 || out.Biomes[0].Biome != domain.BiomeAmazonia || out.Biomes[1].Count != 2 {
		t.Fatalf("biomas: %+v", out.Biomes)
	}
	if len(out.States) != 2 || out.States[0].State != "AM" || out.States[1].Count != 3 {
		t.Fatalf("estados: %+v", out.States)
	}
}
```

- [ ] **Step 3: Ver falhar**

Run: `go test ./internal/usecase/` — Expected: FAIL (tipos `usecase.*` indefinidos).

- [ ] **Step 4: Implementar** — `ports.go`

```go
// Package usecase contém os casos de uso: o que o catálogo SABE FAZER.
// Ele depende só do domain e de interfaces ("ports"). Quem implementa as
// interfaces (PostgreSQL, por exemplo) fica na camada adapter. Assim dá
// para trocar o banco sem tocar numa linha daqui.
package usecase

import (
	"context"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

// SpeciesRepository é a "porta" de saída para onde as espécies estão guardadas.
type SpeciesRepository interface {
	// ListSpecies devolve até filter.Limit espécies, na ordem (SortName, ID),
	// começando DEPOIS de filter.After (se informado).
	ListSpecies(ctx context.Context, filter ListFilter) ([]domain.SpeciesSummary, error)
	// GetSpecies devolve domain.ErrNotFound se o id não existir.
	GetSpecies(ctx context.Context, id string) (domain.Species, error)
	CountByBiome(ctx context.Context) (map[domain.Biome]int, error)
	CountByState(ctx context.Context) (map[string]int, error)
}

// ListFilter chega ao repositório já validado e normalizado.
type ListFilter struct {
	Query string       // sem acentos e minúscula; vazio = sem busca
	Biome domain.Biome // vazio = sem filtro
	State string       // UF maiúscula; vazio = sem filtro
	After *Cursor      // nil = primeira página
	Limit int          // quantos itens buscar
}
```

`cursor.go`:

```go
package usecase

import (
	"encoding/base64"
	"encoding/json"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

// Cursor marca "onde a página anterior parou". Usamos paginação por
// cursor (e não "página 3") porque ela não pula nem repete itens quando
// novas aves são inseridas entre uma página e outra.
type Cursor struct {
	SortName string `json:"s"` // nome popular normalizado do último item
	ID       string `json:"i"` // desempate: dois nomes iguais têm ids diferentes
}

// EncodeCursor transforma o cursor num texto "opaco" para o cliente.
// Opaco = o cliente não deve interpretar nem montar esse texto, só devolvê-lo.
func EncodeCursor(c Cursor) string {
	b, _ := json.Marshal(c) // struct com 2 strings: Marshal nunca falha
	return base64.RawURLEncoding.EncodeToString(b)
}

// DecodeCursor faz o caminho inverso e recusa tokens adulterados.
func DecodeCursor(token string) (Cursor, error) {
	bad := &domain.InvalidArgumentError{Field: "page_token", Reason: "token de página inválido"}
	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		return Cursor{}, bad
	}
	var c Cursor
	if err := json.Unmarshal(raw, &c); err != nil || c.ID == "" {
		return Cursor{}, bad
	}
	return c, nil
}
```

`list_species.go`:

```go
package usecase

import (
	"context"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

// Limites da listagem (proteção contra abuso — OWASP API4).
const (
	DefaultPageSize = 20
	MaxPageSize     = 50
	MaxQueryLen     = 100 // em caracteres, não bytes
)

// ListSpeciesInput é o pedido "cru", como veio de fora.
type ListSpeciesInput struct {
	Query     string
	Biome     string
	State     string
	PageSize  int
	PageToken string
}

// ListSpeciesOutput traz a página e o token para pedir a próxima ("" = acabou).
type ListSpeciesOutput struct {
	Species       []domain.SpeciesSummary
	NextPageToken string
}

// ListSpecies lista espécies com busca, filtros e paginação.
type ListSpecies struct {
	Repo SpeciesRepository
}

func (u ListSpecies) Execute(ctx context.Context, in ListSpeciesInput) (ListSpeciesOutput, error) {
	filter, pageSize, err := buildFilter(in)
	if err != nil {
		return ListSpeciesOutput{}, err
	}

	// Truque clássico: pedimos UM item a mais do que a página. Se ele vier,
	// sabemos que existe próxima página sem fazer uma segunda consulta (COUNT).
	filter.Limit = pageSize + 1
	items, err := u.Repo.ListSpecies(ctx, filter)
	if err != nil {
		return ListSpeciesOutput{}, fmt.Errorf("listar espécies: %w", err)
	}

	out := ListSpeciesOutput{Species: items}
	if len(items) > pageSize {
		out.Species = items[:pageSize]
		last := out.Species[pageSize-1]
		out.NextPageToken = EncodeCursor(Cursor{SortName: domain.NormalizeForSearch(last.CommonNamePt), ID: last.ID})
	}
	return out, nil
}

// buildFilter valida e normaliza a entrada. Fica separado para Execute ler como uma história.
func buildFilter(in ListSpeciesInput) (ListFilter, int, error) {
	var f ListFilter

	query := strings.TrimSpace(in.Query)
	if utf8.RuneCountInString(query) > MaxQueryLen {
		return f, 0, &domain.InvalidArgumentError{Field: "query", Reason: fmt.Sprintf("máximo de %d caracteres", MaxQueryLen)}
	}
	f.Query = domain.NormalizeForSearch(query)

	if in.Biome != "" {
		b, err := domain.ParseBiome(in.Biome)
		if err != nil {
			return f, 0, err
		}
		f.Biome = b
	}
	if in.State != "" {
		uf, err := domain.NormalizeUF(in.State)
		if err != nil {
			return f, 0, err
		}
		f.State = uf
	}

	pageSize := in.PageSize
	switch {
	case pageSize < 0:
		return f, 0, &domain.InvalidArgumentError{Field: "page_size", Reason: "não pode ser negativo"}
	case pageSize == 0:
		pageSize = DefaultPageSize
	case pageSize > MaxPageSize:
		pageSize = MaxPageSize
	}

	if in.PageToken != "" {
		c, err := DecodeCursor(in.PageToken)
		if err != nil {
			return f, 0, err
		}
		f.After = &c
	}
	return f, pageSize, nil
}
```

`get_species.go`:

```go
package usecase

import (
	"context"
	"strings"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

// GetSpecies busca todos os dados de uma espécie.
type GetSpecies struct {
	Repo SpeciesRepository
}

func (u GetSpecies) Execute(ctx context.Context, id string) (domain.Species, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return domain.Species{}, &domain.InvalidArgumentError{Field: "id", Reason: "obrigatório"}
	}
	// Não "embrulhamos" o erro aqui de propósito: quem chama precisa
	// reconhecer domain.ErrNotFound com errors.Is (e reconhece mesmo assim).
	return u.Repo.GetSpecies(ctx, id)
}
```

`list_filters.go`:

```go
package usecase

import (
	"context"
	"fmt"
	"sort"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

type BiomeCount struct {
	Biome domain.Biome
	Count int
}

type StateCount struct {
	State string
	Count int
}

// Filters lista só biomas/estados que têm pelo menos uma ave.
type Filters struct {
	Biomes []BiomeCount
	States []StateCount
}

// ListFilters monta as opções de filtro da tela Explorar.
type ListFilters struct {
	Repo SpeciesRepository
}

func (u ListFilters) Execute(ctx context.Context) (Filters, error) {
	byBiome, err := u.Repo.CountByBiome(ctx)
	if err != nil {
		return Filters{}, fmt.Errorf("contar por bioma: %w", err)
	}
	byState, err := u.Repo.CountByState(ctx)
	if err != nil {
		return Filters{}, fmt.Errorf("contar por estado: %w", err)
	}

	var out Filters
	// Biomas em ordem "oficial" (fixa), não alfabética nem aleatória:
	// mapas em Go não têm ordem garantida, então nunca iteramos o mapa direto.
	for _, b := range domain.AllBiomes() {
		if n := byBiome[b]; n > 0 {
			out.Biomes = append(out.Biomes, BiomeCount{Biome: b, Count: n})
		}
	}
	for uf, n := range byState {
		if n > 0 {
			out.States = append(out.States, StateCount{State: uf, Count: n})
		}
	}
	sort.Slice(out.States, func(i, j int) bool { return out.States[i].State < out.States[j].State })
	return out, nil
}
```

- [ ] **Step 5: Ver passar**

Run: `go test ./internal/...` — Expected: `ok` em `domain` e `usecase`.

- [ ] **Step 6: Commit**

```bash
git add . && git commit -m "feat: casos de uso de listagem, detalhe e filtros com paginação por cursor"
```

---

### Task 4: Carregador do conteúdo curado (YAML)

**Files:**
- Create: `internal/adapter/curated/loader.go`, `loader_test.go`, `testdata/valid/turdus-rufiventris.yaml`, `testdata/typo/bad.yaml`, `testdata/invalid-biome/bad.yaml`

**Interfaces:**
- Consumes: `domain.Species`, `domain.Species.Validate`, `domain.SpeciesID`.
- Produces: `curated.LoadDir(dir string) ([]domain.Species, error)` — ordem por ID; `DescriptionCredit = {Author: "Equipe Passarim", License: "CC-BY-4.0", Source: "curated", SourceURL: <description_source_url>}`.

- [ ] **Step 1: Fixtures**

`internal/adapter/curated/testdata/valid/turdus-rufiventris.yaml`:

```yaml
scientific_name: Turdus rufiventris
common_name_pt: Sabiá-laranjeira
family: Turdidae
size_cm: 25
diet: Frutos, insetos e minhocas
conservation_status: LC
biomes: [mata_atlantica, cerrado, pampa]
states: [SP, RJ, MG]
description: >
  Ave de peito alaranjado e canto melodioso, comum em parques e quintais.
description_source_url: https://pt.wikipedia.org/wiki/Sabi%C3%A1-laranjeira
facts:
  - text: Foi declarada ave-símbolo do Brasil por decreto em 2002.
    source: https://pt.wikipedia.org/wiki/Sabi%C3%A1-laranjeira
```

`testdata/typo/bad.yaml` — igual ao anterior, mas com a linha `family: Turdidae` trocada por `familly: Turdidae`.

`testdata/invalid-biome/bad.yaml` — igual ao válido, mas com `biomes: [deserto]`.

- [ ] **Step 2: Testes que falham** — `loader_test.go`

```go
package curated_test

import (
	"strings"
	"testing"

	"github.com/velosobr/passarim-catalog/internal/adapter/curated"
	"github.com/velosobr/passarim-catalog/internal/domain"
)

func TestLoadDir_Valid(t *testing.T) {
	species, err := curated.LoadDir("testdata/valid")
	if err != nil {
		t.Fatal(err)
	}
	if len(species) != 1 {
		t.Fatalf("esperava 1 espécie, veio %d", len(species))
	}
	s := species[0]
	if s.ID != "turdus-rufiventris" || s.CommonNamePt != "Sabiá-laranjeira" || *s.SizeCm != 25 {
		t.Fatalf("campos errados: %+v", s)
	}
	if s.ConservationStatus != domain.StatusLC || len(s.Biomes) != 3 || len(s.Facts) != 1 {
		t.Fatalf("listas erradas: %+v", s)
	}
	want := domain.Credit{Author: "Equipe Passarim", License: "CC-BY-4.0", Source: "curated", SourceURL: "https://pt.wikipedia.org/wiki/Sabi%C3%A1-laranjeira"}
	if s.DescriptionCredit != want {
		t.Fatalf("crédito = %+v", s.DescriptionCredit)
	}
	if !strings.HasPrefix(s.Description, "Ave de peito") {
		t.Fatalf("descrição = %q", s.Description)
	}
}

// Review Focus #5: campo com erro de digitação não pode passar em silêncio.
func TestLoadDir_UnknownFieldFails(t *testing.T) {
	_, err := curated.LoadDir("testdata/typo")
	if err == nil || !strings.Contains(err.Error(), "bad.yaml") || !strings.Contains(err.Error(), "familly") {
		t.Fatalf("esperava erro citando arquivo e campo, veio %v", err)
	}
}

func TestLoadDir_InvalidSpeciesFails(t *testing.T) {
	_, err := curated.LoadDir("testdata/invalid-biome")
	if err == nil || !strings.Contains(err.Error(), "bad.yaml") || !strings.Contains(err.Error(), "biomes") {
		t.Fatalf("esperava erro de validação citando o arquivo, veio %v", err)
	}
}

func TestLoadDir_MissingDirFails(t *testing.T) {
	if _, err := curated.LoadDir("testdata/nao-existe"); err == nil {
		t.Fatal("pasta inexistente deveria dar erro")
	}
}
```

- [ ] **Step 3: Ver falhar**

Run: `go test ./internal/adapter/curated/` — Expected: FAIL (pacote não existe).

- [ ] **Step 4: Implementar** — `loader.go`

```go
// Package curated lê o conteúdo escrito à mão (content/species/*.yaml)
// e o transforma em domain.Species. É um "adapter de entrada" de dados.
package curated

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"go.yaml.in/yaml/v3"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

// speciesFile espelha o formato do YAML. As tags `yaml:"..."` dizem qual
// chave do arquivo vai para qual campo.
type speciesFile struct {
	ScientificName       string     `yaml:"scientific_name"`
	CommonNamePt         string     `yaml:"common_name_pt"`
	Family               string     `yaml:"family"`
	SizeCm               *int       `yaml:"size_cm"`
	Diet                 *string    `yaml:"diet"`
	ConservationStatus   string     `yaml:"conservation_status"`
	Biomes               []string   `yaml:"biomes"`
	States               []string   `yaml:"states"`
	Description          string     `yaml:"description"`
	DescriptionSourceURL string     `yaml:"description_source_url"`
	Facts                []factFile `yaml:"facts"`
}

type factFile struct {
	Text   string `yaml:"text"`
	Source string `yaml:"source"`
}

// LoadDir lê todos os .yaml da pasta, valida cada um e devolve a lista
// ordenada por ID. Se QUALQUER arquivo tiver problema, nada é devolvido:
// melhor falhar inteiro do que gravar metade do catálogo.
func LoadDir(dir string) ([]domain.Species, error) {
	paths, err := filepath.Glob(filepath.Join(dir, "*.yaml"))
	if err != nil {
		return nil, err
	}
	if len(paths) == 0 {
		return nil, fmt.Errorf("nenhum .yaml encontrado em %s", dir)
	}

	out := make([]domain.Species, 0, len(paths))
	for _, p := range paths {
		s, err := loadFile(p)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", filepath.Base(p), err)
		}
		out = append(out, s)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}

func loadFile(path string) (domain.Species, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return domain.Species{}, err
	}
	var f speciesFile
	dec := yaml.NewDecoder(bytes.NewReader(raw))
	// KnownFields(true): uma chave desconhecida (ex.: "familly") vira ERRO
	// em vez de ser ignorada silenciosamente.
	dec.KnownFields(true)
	if err := dec.Decode(&f); err != nil {
		return domain.Species{}, err
	}

	s := domain.Species{
		ID:                 domain.SpeciesID(f.ScientificName),
		ScientificName:     strings.Join(strings.Fields(f.ScientificName), " "),
		CommonNamePt:       strings.TrimSpace(f.CommonNamePt),
		Family:             strings.TrimSpace(f.Family),
		SizeCm:             f.SizeCm,
		Diet:               f.Diet,
		ConservationStatus: domain.ConservationStatus(f.ConservationStatus),
		Description:        strings.TrimSpace(f.Description),
		// Texto escrito pela equipe: licença CC-BY-4.0, com link de referência.
		DescriptionCredit: domain.Credit{
			Author: "Equipe Passarim", License: "CC-BY-4.0", Source: "curated", SourceURL: f.DescriptionSourceURL,
		},
		States: f.States,
	}
	for _, b := range f.Biomes {
		s.Biomes = append(s.Biomes, domain.Biome(b))
	}
	for _, fact := range f.Facts {
		s.Facts = append(s.Facts, domain.Fact{Text: strings.TrimSpace(fact.Text), Source: strings.TrimSpace(fact.Source)})
	}
	if err := s.Validate(); err != nil {
		return domain.Species{}, err
	}
	return s, nil
}
```

- [ ] **Step 5: Ver passar**

```bash
go get go.yaml.in/yaml/v3 && go mod tidy
go test ./internal/adapter/curated/   # Expected: ok
```

- [ ] **Step 6: Commit**

```bash
git add . && git commit -m "feat: carregador de conteúdo curado em YAML com validação estrita"
```

---

### Task 5: PostgreSQL — migrations, sqlc e repositório (integração)

**Files:**
- Create: `sqlc.yaml`, `internal/adapter/postgres/migrations/0001_init.up.sql`, `0001_init.down.sql`, `migrate.go`, `queries.sql`, `sqlcgen/*` (gerado), `repository.go`, `wait.go`, `wait_test.go`, `repository_test.go`

**Interfaces:**
- Consumes: `usecase.SpeciesRepository`, `usecase.ListFilter`, `usecase.Cursor`, `domain.*`.
- Produces (pacote `postgres`):
  - `Migrate(databaseURL string) error`
  - `WaitForDB(ctx, ping func(context.Context) error, attempts int, delay time.Duration) error`
  - `NewRepository(pool *pgxpool.Pool) *Repository` — implementa `usecase.SpeciesRepository`
  - `(*Repository).UpsertCurated(ctx, domain.Species) error` — grava só campos curados (species, facts, biomes, states); **não toca** `media` nem `occurrence_cluster`.

- [ ] **Step 1: Teste de `WaitForDB` que falha** — `wait_test.go`

```go
package postgres_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/velosobr/passarim-catalog/internal/adapter/postgres"
)

// Review Focus #6: o banco pode demorar a subir; o catalog deve esperar.
func TestWaitForDB_RetriesUntilReady(t *testing.T) {
	calls := 0
	ping := func(context.Context) error {
		calls++
		if calls < 3 {
			return errors.New("connection refused")
		}
		return nil
	}
	if err := postgres.WaitForDB(context.Background(), ping, 5, time.Millisecond); err != nil {
		t.Fatalf("deveria conectar na 3ª tentativa: %v", err)
	}
	if calls != 3 {
		t.Fatalf("calls = %d, want 3", calls)
	}
}

func TestWaitForDB_GivesUp(t *testing.T) {
	ping := func(context.Context) error { return errors.New("connection refused") }
	err := postgres.WaitForDB(context.Background(), ping, 3, time.Millisecond)
	if err == nil {
		t.Fatal("deveria desistir depois de 3 tentativas")
	}
}
```

- [ ] **Step 2: Ver falhar** — Run: `go test ./internal/adapter/postgres/ -run WaitForDB` — Expected: FAIL (pacote não existe).

- [ ] **Step 3: Implementar `wait.go`**

```go
// Package postgres implementa o repositório de espécies sobre o PostgreSQL.
package postgres

import (
	"context"
	"fmt"
	"time"
)

// WaitForDB tenta "pingar" o banco várias vezes, esperando delay entre as
// tentativas. No docker compose o catalog pode iniciar antes do PostgreSQL
// estar pronto; sem isso o serviço morreria logo na subida.
func WaitForDB(ctx context.Context, ping func(context.Context) error, attempts int, delay time.Duration) error {
	var err error
	for i := 1; i <= attempts; i++ {
		if err = ping(ctx); err == nil {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(delay):
		}
	}
	return fmt.Errorf("banco indisponível após %d tentativas: %w", attempts, err)
}
```

Run: `go test ./internal/adapter/postgres/ -run WaitForDB` — Expected: PASS.

- [ ] **Step 4: Migration** — `migrations/0001_init.up.sql`

```sql
-- 0001_init: cria o esquema inicial do catálogo.
-- Migrations são "versões" do banco: cada arquivo leva o banco de um estado
-- para o próximo. O golang-migrate registra quais já rodaram.

-- pg_trgm: índices de "trigramas" deixam buscas com LIKE '%texto%' rápidas.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE biome AS ENUM ('amazonia', 'mata_atlantica', 'cerrado', 'caatinga', 'pantanal', 'pampa');

CREATE TABLE species (
    id                     text PRIMARY KEY,           -- ex.: turdus-rufiventris
    scientific_name        text NOT NULL UNIQUE,
    common_name_pt         text NOT NULL,
    family                 text NOT NULL,
    size_cm                integer CHECK (size_cm > 0), -- NULL = desconhecido
    diet                   text,                        -- NULL = desconhecida
    conservation_status    text NOT NULL DEFAULT ''
        CHECK (conservation_status IN ('', 'LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX', 'DD')),
    description            text NOT NULL DEFAULT '',
    description_author     text NOT NULL DEFAULT '',
    description_license    text NOT NULL DEFAULT '',
    description_source     text NOT NULL DEFAULT '',
    description_source_url text NOT NULL DEFAULT '',
    is_curated             boolean NOT NULL DEFAULT false,
    -- Colunas calculadas pela aplicação (domain.NormalizeForSearch):
    sort_name              text NOT NULL,  -- nome popular sem acento: ordena a lista
    search_text            text NOT NULL,  -- nomes popular + científico sem acento: busca
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Índice que a paginação por cursor usa: ORDER BY sort_name, id.
CREATE INDEX species_sort_idx ON species (sort_name, id);
-- Índice de trigramas para a busca por trecho do nome.
CREATE INDEX species_search_idx ON species USING gin (search_text gin_trgm_ops);

CREATE TABLE species_fact (
    id         bigserial PRIMARY KEY,
    species_id text NOT NULL REFERENCES species (id) ON DELETE CASCADE,
    position   integer NOT NULL,   -- ordem de exibição
    text       text NOT NULL,
    source     text NOT NULL
);

CREATE TABLE species_biome (
    species_id text NOT NULL REFERENCES species (id) ON DELETE CASCADE,
    biome      biome NOT NULL,
    PRIMARY KEY (species_id, biome)
);
CREATE INDEX species_biome_biome_idx ON species_biome (biome);

CREATE TABLE species_state (
    species_id text NOT NULL REFERENCES species (id) ON DELETE CASCADE,
    uf         char(2) NOT NULL CHECK (uf ~ '^[A-Z]{2}$'),
    PRIMARY KEY (species_id, uf)
);
CREATE INDEX species_state_uf_idx ON species_state (uf);

-- Fotos e cantos: preenchidos pelo worker (Etapa 2b).
CREATE TABLE media (
    id          bigserial PRIMARY KEY,
    species_id  text NOT NULL REFERENCES species (id) ON DELETE CASCADE,
    kind        text NOT NULL CHECK (kind IN ('photo', 'audio')),
    position    integer NOT NULL,
    thumb_key   text NOT NULL DEFAULT '',
    medium_key  text NOT NULL DEFAULT '',
    large_key   text NOT NULL DEFAULT '',
    audio_key   text NOT NULL DEFAULT '',
    width       integer NOT NULL DEFAULT 0,
    height      integer NOT NULL DEFAULT 0,
    duration_ms integer NOT NULL DEFAULT 0,
    author      text NOT NULL,
    license     text NOT NULL,
    source      text NOT NULL,
    source_url  text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_species_idx ON media (species_id, kind, position);

-- Avistamentos agrupados para o mapa: preenchidos pelo worker (Etapa 2b).
CREATE TABLE occurrence_cluster (
    species_id text NOT NULL REFERENCES species (id) ON DELETE CASCADE,
    lat        double precision NOT NULL,
    lng        double precision NOT NULL,
    count      integer NOT NULL CHECK (count > 0),
    precision  double precision NOT NULL,
    PRIMARY KEY (species_id, lat, lng)
);
```

`0001_init.down.sql`:

```sql
-- Desfaz a 0001 (usado só em desenvolvimento).
DROP TABLE IF EXISTS occurrence_cluster, media, species_state, species_biome, species_fact, species;
DROP TYPE IF EXISTS biome;
```

`migrate.go`:

```go
package postgres

import (
	"embed"
	"errors"
	"fmt"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5" // registra o driver "pgx5"
	"github.com/golang-migrate/migrate/v4/source/iofs"
)

// //go:embed coloca os arquivos .sql DENTRO do binário. Assim a imagem
// Docker não precisa copiar a pasta de migrations separadamente.
//
//go:embed migrations/*.sql
var migrationsFS embed.FS

// Migrate aplica todas as migrations pendentes. Rodar de novo é seguro:
// as que já rodaram são puladas.
func Migrate(databaseURL string) error {
	src, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		return err
	}
	// O driver pgx/v5 do golang-migrate usa o esquema "pgx5://".
	url := strings.Replace(databaseURL, "postgres://", "pgx5://", 1)
	m, err := migrate.NewWithSourceInstance("iofs", src, url)
	if err != nil {
		return fmt.Errorf("preparar migrations: %w", err)
	}
	defer m.Close()
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("aplicar migrations: %w", err)
	}
	return nil
}
```

- [ ] **Step 5: sqlc** — `sqlc.yaml`

```yaml
# sqlc lê nossos arquivos .sql e GERA código Go com tipos corretos.
# Vantagem: escrevemos SQL de verdade e o compilador acusa erros de tipo.
version: "2"
sql:
  - engine: postgresql
    schema: internal/adapter/postgres/migrations   # ignora os .down.sql
    queries: internal/adapter/postgres/queries.sql
    gen:
      go:
        package: sqlcgen
        out: internal/adapter/postgres/sqlcgen
        sql_package: pgx/v5
```

`internal/adapter/postgres/queries.sql`:

```sql
-- name: ListSpecies :many
-- Lista resumida com busca, filtros e paginação por cursor.
-- Cada filtro é opcional: "(parâmetro IS NULL OR condição)".
SELECT s.id, s.scientific_name, s.common_name_pt, s.conservation_status,
       COALESCE((SELECT m.thumb_key FROM media m
                 WHERE m.species_id = s.id AND m.kind = 'photo'
                 ORDER BY m.position LIMIT 1), '')::text AS thumbnail_key
FROM species s
WHERE (sqlc.narg('query')::text IS NULL OR s.search_text LIKE '%' || sqlc.narg('query')::text || '%' ESCAPE '\')
  AND (sqlc.narg('biome')::biome IS NULL OR EXISTS (
        SELECT 1 FROM species_biome b WHERE b.species_id = s.id AND b.biome = sqlc.narg('biome')::biome))
  AND (sqlc.narg('state')::text IS NULL OR EXISTS (
        SELECT 1 FROM species_state st WHERE st.species_id = s.id AND st.uf = sqlc.narg('state')::text))
  AND (sqlc.narg('after_sort')::text IS NULL
       OR (s.sort_name, s.id) > (sqlc.narg('after_sort')::text, sqlc.narg('after_id')::text))
ORDER BY s.sort_name, s.id
LIMIT sqlc.arg('lim');

-- name: GetSpecies :one
SELECT * FROM species WHERE id = $1;

-- name: ListFacts :many
SELECT text, source FROM species_fact WHERE species_id = $1 ORDER BY position;

-- name: ListBiomes :many
SELECT biome FROM species_biome WHERE species_id = $1 ORDER BY biome;

-- name: ListStates :many
SELECT uf::text FROM species_state WHERE species_id = $1 ORDER BY uf;

-- name: ListMedia :many
SELECT * FROM media WHERE species_id = $1 ORDER BY kind, position;

-- name: ListClusters :many
SELECT lat, lng, count, precision FROM occurrence_cluster WHERE species_id = $1 ORDER BY count DESC;

-- name: CountByBiome :many
SELECT biome, count(*)::int AS total FROM species_biome GROUP BY biome;

-- name: CountByState :many
SELECT uf::text AS uf, count(*)::int AS total FROM species_state GROUP BY uf;

-- name: UpsertSpecies :exec
-- "Upsert" = insere, ou atualiza se o id já existir. Só mexe nos campos
-- curados; created_at é preservado.
INSERT INTO species (id, scientific_name, common_name_pt, family, size_cm, diet, conservation_status,
                     description, description_author, description_license, description_source,
                     description_source_url, is_curated, sort_name, search_text)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, $13, $14)
ON CONFLICT (id) DO UPDATE SET
    scientific_name = EXCLUDED.scientific_name, common_name_pt = EXCLUDED.common_name_pt,
    family = EXCLUDED.family, size_cm = EXCLUDED.size_cm, diet = EXCLUDED.diet,
    conservation_status = EXCLUDED.conservation_status, description = EXCLUDED.description,
    description_author = EXCLUDED.description_author, description_license = EXCLUDED.description_license,
    description_source = EXCLUDED.description_source, description_source_url = EXCLUDED.description_source_url,
    is_curated = true, sort_name = EXCLUDED.sort_name, search_text = EXCLUDED.search_text,
    updated_at = now();

-- name: DeleteFacts :exec
DELETE FROM species_fact WHERE species_id = $1;

-- name: InsertFact :exec
INSERT INTO species_fact (species_id, position, text, source) VALUES ($1, $2, $3, $4);

-- name: DeleteBiomes :exec
DELETE FROM species_biome WHERE species_id = $1;

-- name: InsertBiome :exec
INSERT INTO species_biome (species_id, biome) VALUES ($1, $2);

-- name: DeleteStates :exec
DELETE FROM species_state WHERE species_id = $1;

-- name: InsertState :exec
INSERT INTO species_state (species_id, uf) VALUES ($1, $2);
```

```bash
go get -tool github.com/sqlc-dev/sqlc/cmd/sqlc@v1.31.1
go tool sqlc generate   # Expected: cria internal/adapter/postgres/sqlcgen/{db.go,models.go,queries.sql.go}
```

Abra `sqlcgen/queries.sql.go` e confira os nomes gerados (`ListSpeciesParams` com campos `Query pgtype.Text`, `Biome NullBiome`, `State pgtype.Text`, `AfterSort pgtype.Text`, `AfterID pgtype.Text`, `Lim int32`; `UpsertSpeciesParams` com `Column1…` ou nomes de coluna). **Se os nomes diferirem dos usados no Step 6, ajuste o `repository.go` aos nomes gerados** — o código gerado é a fonte da verdade.

- [ ] **Step 6: Testes de integração que falham** — `repository_test.go`

```go
package postgres_test

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/velosobr/passarim-catalog/internal/adapter/postgres"
	"github.com/velosobr/passarim-catalog/internal/domain"
	"github.com/velosobr/passarim-catalog/internal/usecase"
)

// newRepo sobe um PostgreSQL DE VERDADE num container (testcontainers),
// aplica as migrations e devolve o repositório. Lento (segundos), mas é a
// única forma de provar que o SQL funciona.
func newRepo(t *testing.T) (*postgres.Repository, *pgxpool.Pool) {
	t.Helper()
	if testing.Short() {
		t.Skip("integração: rode sem -short")
	}
	ctx := context.Background()
	ctr, err := tcpostgres.Run(ctx, "postgres:18-alpine",
		tcpostgres.WithDatabase("passarim"), tcpostgres.WithUsername("passarim"), tcpostgres.WithPassword("test"),
		tcpostgres.BasicWaitStrategies())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ctr.Terminate(context.Background()) })
	url, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	if err := postgres.Migrate(url); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return postgres.NewRepository(pool), pool
}

func sp(sci, common string, biomes []domain.Biome, states ...string) domain.Species {
	size := 20
	return domain.Species{
		ID: domain.SpeciesID(sci), ScientificName: sci, CommonNamePt: common, Family: "Familia",
		SizeCm: &size, ConservationStatus: domain.StatusLC, Biomes: biomes, States: states,
		Description: "Descrição.", DescriptionCredit: domain.Credit{Author: "Equipe Passarim", License: "CC-BY-4.0", Source: "curated", SourceURL: "https://example.org"},
		Facts: []domain.Fact{{Text: "Fato 1", Source: "s1"}, {Text: "Fato 2", Source: "s2"}},
	}
}

func seed(t *testing.T, repo *postgres.Repository, all ...domain.Species) {
	t.Helper()
	for _, s := range all {
		if err := repo.UpsertCurated(context.Background(), s); err != nil {
			t.Fatal(err)
		}
	}
}

func ids(list []domain.SpeciesSummary) []string {
	out := make([]string, len(list))
	for i, s := range list {
		out[i] = s.ID
	}
	return out
}

func TestRepository(t *testing.T) {
	repo, pool := newRepo(t)
	ctx := context.Background()
	seed(t, repo,
		sp("Turdus rufiventris", "Sabiá-laranjeira", []domain.Biome{domain.BiomeMataAtlantica, domain.BiomeCerrado}, "SP", "RJ"),
		sp("Pitangus sulphuratus", "Bem-te-vi", []domain.Biome{domain.BiomeCerrado}, "SP"),
		sp("Ramphastos toco", "Tucano-toco", []domain.Biome{domain.BiomePantanal}, "MS"),
		sp("Fakeus percentus", "Ave 100% teste", nil),
	)

	t.Run("lista ordenada por nome sem acento", func(t *testing.T) {
		got, err := repo.ListSpecies(ctx, usecase.ListFilter{Limit: 10})
		if err != nil {
			t.Fatal(err)
		}
		want := []string{"fakeus-percentus", "pitangus-sulphuratus", "turdus-rufiventris", "ramphastos-toco"}
		if !equal(ids(got), want) {
			t.Fatalf("ordem = %v, want %v", ids(got), want)
		}
	})

	// Review Focus #1
	t.Run("TestListSpecies_SearchIgnoresAccentsAndCase", func(t *testing.T) {
		for _, q := range []string{"sabia", domain.NormalizeForSearch("SABIÁ"), "rufiventris"} {
			got, _ := repo.ListSpecies(ctx, usecase.ListFilter{Query: q, Limit: 10})
			if !equal(ids(got), []string{"turdus-rufiventris"}) {
				t.Errorf("busca %q = %v", q, ids(got))
			}
		}
	})

	// Review Focus #2
	t.Run("TestListSpecies_WildcardsAreLiteral", func(t *testing.T) {
		got, _ := repo.ListSpecies(ctx, usecase.ListFilter{Query: "%", Limit: 10})
		if !equal(ids(got), []string{"fakeus-percentus"}) {
			t.Fatalf("'%%' deveria achar só o nome com %% literal, veio %v", ids(got))
		}
		got, _ = repo.ListSpecies(ctx, usecase.ListFilter{Query: "_", Limit: 10})
		if len(got) != 0 {
			t.Fatalf("'_' deveria ser literal e não achar nada, veio %v", ids(got))
		}
	})

	t.Run("filtros por bioma e estado", func(t *testing.T) {
		got, _ := repo.ListSpecies(ctx, usecase.ListFilter{Biome: domain.BiomeCerrado, State: "SP", Limit: 10})
		if !equal(ids(got), []string{"pitangus-sulphuratus", "turdus-rufiventris"}) {
			t.Fatalf("cerrado+SP = %v", ids(got))
		}
	})

	t.Run("cursor continua depois do último item", func(t *testing.T) {
		after := &usecase.Cursor{SortName: domain.NormalizeForSearch("Bem-te-vi"), ID: "pitangus-sulphuratus"}
		got, _ := repo.ListSpecies(ctx, usecase.ListFilter{After: after, Limit: 10})
		if !equal(ids(got), []string{"turdus-rufiventris", "ramphastos-toco"}) {
			t.Fatalf("depois do bem-te-vi = %v", ids(got))
		}
	})

	t.Run("detalhe completo e ausentes como nil", func(t *testing.T) {
		s, err := repo.GetSpecies(ctx, "turdus-rufiventris")
		if err != nil {
			t.Fatal(err)
		}
		if s.CommonNamePt != "Sabiá-laranjeira" || *s.SizeCm != 20 || s.Diet != nil || s.Audio != nil {
			t.Fatalf("detalhe errado: %+v", s)
		}
		if len(s.Facts) != 2 || s.Facts[0].Text != "Fato 1" || !equal(s.States, []string{"RJ", "SP"}) || len(s.Biomes) != 2 {
			t.Fatalf("listas erradas: %+v", s)
		}
		if s.DescriptionCredit.License != "CC-BY-4.0" {
			t.Fatalf("crédito: %+v", s.DescriptionCredit)
		}
	})

	t.Run("id inexistente", func(t *testing.T) {
		if _, err := repo.GetSpecies(ctx, "nao-existe"); err != domain.ErrNotFound {
			t.Fatalf("esperava ErrNotFound, veio %v", err)
		}
	})

	t.Run("contagens", func(t *testing.T) {
		b, _ := repo.CountByBiome(ctx)
		s, _ := repo.CountByState(ctx)
		if b[domain.BiomeCerrado] != 2 || b[domain.BiomePantanal] != 1 || s["SP"] != 2 || s["MS"] != 1 {
			t.Fatalf("biomas=%v estados=%v", b, s)
		}
	})

	// Review Focus #3
	t.Run("TestUpsertCurated_PreservesWorkerData", func(t *testing.T) {
		_, err := pool.Exec(ctx, `INSERT INTO media (species_id, kind, position, audio_key, duration_ms, author, license, source, source_url)
			VALUES ('turdus-rufiventris', 'audio', 0, 'a.m4a', 12000, 'Autor', 'CC-BY-NC', 'xeno-canto', 'https://xeno-canto.org/1')`)
		if err != nil {
			t.Fatal(err)
		}
		_, err = pool.Exec(ctx, `INSERT INTO occurrence_cluster VALUES ('turdus-rufiventris', -23.5, -46.6, 10, 0.5)`)
		if err != nil {
			t.Fatal(err)
		}
		changed := sp("Turdus rufiventris", "Sabiá-laranjeira", []domain.Biome{domain.BiomeMataAtlantica}, "SP")
		changed.Facts = changed.Facts[:1]
		seed(t, repo, changed, changed) // duas vezes: idempotente

		s, _ := repo.GetSpecies(ctx, "turdus-rufiventris")
		if s.Audio == nil || s.Audio.Key != "a.m4a" || s.Audio.DurationMs != 12000 || len(s.Clusters) != 1 || s.Clusters[0].Precision != 0.5 {
			t.Fatalf("seed apagou dados do worker: audio=%+v clusters=%+v", s.Audio, s.Clusters)
		}
		if len(s.Facts) != 1 || len(s.Biomes) != 1 || !equal(s.States, []string{"SP"}) {
			t.Fatalf("campos curados não foram atualizados: %+v", s)
		}
	})
}

func equal(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
```

Run: `go test ./internal/adapter/postgres/` — Expected: FAIL (`NewRepository` indefinido).

- [ ] **Step 7: Implementar `repository.go`**

```go
package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velosobr/passarim-catalog/internal/adapter/postgres/sqlcgen"
	"github.com/velosobr/passarim-catalog/internal/domain"
	"github.com/velosobr/passarim-catalog/internal/usecase"
)

// Repository implementa usecase.SpeciesRepository com PostgreSQL.
type Repository struct {
	pool *pgxpool.Pool
	q    *sqlcgen.Queries
}

// Garante, em tempo de compilação, que Repository cumpre a interface.
var _ usecase.SpeciesRepository = (*Repository)(nil)

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool, q: sqlcgen.New(pool)}
}

// escapeLike faz "%" e "_" digitados pelo usuário valerem como texto,
// e não como curingas do LIKE ("%" = qualquer coisa). A barra também é
// escapada porque é o caractere de escape que declaramos no SQL.
func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

func text(s string) pgtype.Text { return pgtype.Text{String: s, Valid: s != ""} }

func (r *Repository) ListSpecies(ctx context.Context, f usecase.ListFilter) ([]domain.SpeciesSummary, error) {
	params := sqlcgen.ListSpeciesParams{
		Query: text(escapeLike(f.Query)),
		State: text(f.State),
		Lim:   int32(f.Limit),
	}
	if f.Biome != "" {
		params.Biome = sqlcgen.NullBiome{Biome: sqlcgen.Biome(f.Biome), Valid: true}
	}
	if f.After != nil {
		params.AfterSort = text(f.After.SortName)
		params.AfterID = text(f.After.ID)
		params.AfterSort.Valid = true // SortName pode ser "" legitimamente
	}
	rows, err := r.q.ListSpecies(ctx, params)
	if err != nil {
		return nil, err
	}
	out := make([]domain.SpeciesSummary, len(rows))
	for i, row := range rows {
		out[i] = domain.SpeciesSummary{
			ID: row.ID, ScientificName: row.ScientificName, CommonNamePt: row.CommonNamePt,
			ThumbnailKey: row.ThumbnailKey, ConservationStatus: domain.ConservationStatus(row.ConservationStatus),
		}
	}
	return out, nil
}

func (r *Repository) GetSpecies(ctx context.Context, id string) (domain.Species, error) {
	row, err := r.q.GetSpecies(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Species{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Species{}, err
	}
	s := domain.Species{
		ID: row.ID, ScientificName: row.ScientificName, CommonNamePt: row.CommonNamePt, Family: row.Family,
		ConservationStatus: domain.ConservationStatus(row.ConservationStatus), Description: row.Description,
		DescriptionCredit: domain.Credit{Author: row.DescriptionAuthor, License: row.DescriptionLicense,
			Source: row.DescriptionSource, SourceURL: row.DescriptionSourceUrl},
	}
	if row.SizeCm.Valid {
		v := int(row.SizeCm.Int32)
		s.SizeCm = &v
	}
	if row.Diet.Valid {
		v := row.Diet.String
		s.Diet = &v
	}

	facts, err := r.q.ListFacts(ctx, id)
	if err != nil {
		return s, err
	}
	for _, f := range facts {
		s.Facts = append(s.Facts, domain.Fact{Text: f.Text, Source: f.Source})
	}
	biomes, err := r.q.ListBiomes(ctx, id)
	if err != nil {
		return s, err
	}
	for _, b := range biomes {
		s.Biomes = append(s.Biomes, domain.Biome(b))
	}
	if s.States, err = r.q.ListStates(ctx, id); err != nil {
		return s, err
	}
	media, err := r.q.ListMedia(ctx, id)
	if err != nil {
		return s, err
	}
	for _, m := range media {
		credit := domain.Credit{Author: m.Author, License: m.License, Source: m.Source, SourceURL: m.SourceUrl}
		switch m.Kind {
		case "photo":
			s.Photos = append(s.Photos, domain.Photo{ThumbKey: m.ThumbKey, MediumKey: m.MediumKey, LargeKey: m.LargeKey,
				Width: int(m.Width), Height: int(m.Height), Credit: credit})
		case "audio":
			if s.Audio == nil { // a primeira gravação (menor position) é a escolhida
				s.Audio = &domain.Audio{Key: m.AudioKey, DurationMs: int(m.DurationMs), Credit: credit}
			}
		}
	}
	clusters, err := r.q.ListClusters(ctx, id)
	if err != nil {
		return s, err
	}
	for _, c := range clusters {
		s.Clusters = append(s.Clusters, domain.OccurrenceCluster{Lat: c.Lat, Lng: c.Lng, Count: int(c.Count), Precision: c.Precision})
	}
	return s, nil
}

func (r *Repository) CountByBiome(ctx context.Context) (map[domain.Biome]int, error) {
	rows, err := r.q.CountByBiome(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[domain.Biome]int, len(rows))
	for _, row := range rows {
		out[domain.Biome(row.Biome)] = int(row.Total)
	}
	return out, nil
}

func (r *Repository) CountByState(ctx context.Context) (map[string]int, error) {
	rows, err := r.q.CountByState(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[string]int, len(rows))
	for _, row := range rows {
		out[row.Uf] = int(row.Total)
	}
	return out, nil
}

// UpsertCurated grava (ou atualiza) os campos CURADOS de uma espécie numa
// transação: ou tudo é gravado, ou nada. Fotos, cantos e ocorrências
// pertencem ao worker e NÃO são tocados aqui.
func (r *Repository) UpsertCurated(ctx context.Context, s domain.Species) error {
	if err := s.Validate(); err != nil {
		return err
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // após Commit, Rollback não faz nada
	q := r.q.WithTx(tx)

	params := sqlcgen.UpsertSpeciesParams{
		ID: s.ID, ScientificName: s.ScientificName, CommonNamePt: s.CommonNamePt, Family: s.Family,
		ConservationStatus: string(s.ConservationStatus), Description: s.Description,
		DescriptionAuthor: s.DescriptionCredit.Author, DescriptionLicense: s.DescriptionCredit.License,
		DescriptionSource: s.DescriptionCredit.Source, DescriptionSourceUrl: s.DescriptionCredit.SourceURL,
		SortName:   domain.NormalizeForSearch(s.CommonNamePt),
		SearchText: domain.NormalizeForSearch(s.CommonNamePt + " " + s.ScientificName),
	}
	if s.SizeCm != nil {
		params.SizeCm = pgtype.Int4{Int32: int32(*s.SizeCm), Valid: true}
	}
	if s.Diet != nil {
		params.Diet = pgtype.Text{String: *s.Diet, Valid: true}
	}
	if err := q.UpsertSpecies(ctx, params); err != nil {
		return fmt.Errorf("upsert %s: %w", s.ID, err)
	}

	// Listas: apagar e reinserir é o jeito mais simples de deixar o banco
	// igual ao YAML (inclusive removendo itens que saíram do arquivo).
	if err := q.DeleteFacts(ctx, s.ID); err != nil {
		return err
	}
	for i, f := range s.Facts {
		if err := q.InsertFact(ctx, sqlcgen.InsertFactParams{SpeciesID: s.ID, Position: int32(i), Text: f.Text, Source: f.Source}); err != nil {
			return err
		}
	}
	if err := q.DeleteBiomes(ctx, s.ID); err != nil {
		return err
	}
	for _, b := range s.Biomes {
		if err := q.InsertBiome(ctx, sqlcgen.InsertBiomeParams{SpeciesID: s.ID, Biome: sqlcgen.Biome(b)}); err != nil {
			return err
		}
	}
	if err := q.DeleteStates(ctx, s.ID); err != nil {
		return err
	}
	for _, uf := range s.States {
		if err := q.InsertState(ctx, sqlcgen.InsertStateParams{SpeciesID: s.ID, Uf: uf}); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
```

- [ ] **Step 8: Ver passar**

```bash
go get github.com/jackc/pgx/v5 github.com/golang-migrate/migrate/v4 github.com/testcontainers/testcontainers-go/modules/postgres
go mod tidy
go test -race ./internal/adapter/postgres/   # Expected: ok (sobe container; ~10-30s)
```
Se algum nome do código gerado divergir, corrija `repository.go` (Step 5) e rode de novo.

- [ ] **Step 9: Commit**

```bash
git add . && git commit -m "feat: repositório PostgreSQL com migrations, sqlc e busca sem acento"
```

---

### Task 6: Adapter gRPC — servidor, mapeamento e interceptors

**Files:**
- Create: `internal/adapter/grpc/server.go`, `mapping.go`, `interceptors.go`, `server_test.go`, `interceptors_test.go`

**Interfaces:**
- Consumes: `usecase.ListSpeciesInput/Output`, `usecase.Filters`, `domain.*`, `catalogv1.*` (v0.2.0).
- Produces (pacote `grpcadapter`, pasta `internal/adapter/grpc`):
  - `type ListSpeciesUseCase interface{ Execute(context.Context, usecase.ListSpeciesInput) (usecase.ListSpeciesOutput, error) }`, `GetSpeciesUseCase{ Execute(context.Context, string) (domain.Species, error) }`, `ListFiltersUseCase{ Execute(context.Context) (usecase.Filters, error) }`
  - `NewServer(list, get, filters, logger *slog.Logger) *Server` (implementa `catalogv1.CatalogServiceServer`)
  - `UnaryRequestID() grpc.UnaryServerInterceptor` (lê/gera metadata `x-request-id`, devolve no header); `RequestIDFrom(ctx) string`; `UnaryLogging(*slog.Logger) grpc.UnaryServerInterceptor`

- [ ] **Step 1: Testes que falham** — `server_test.go`

```go
package grpcadapter_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net"
	"testing"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"

	catalogv1 "github.com/velosobr/passarim-proto/gen/go/passarim/catalog/v1"

	grpcadapter "github.com/velosobr/passarim-catalog/internal/adapter/grpc"
	"github.com/velosobr/passarim-catalog/internal/domain"
	"github.com/velosobr/passarim-catalog/internal/usecase"
)

type fakeList struct {
	in  usecase.ListSpeciesInput
	out usecase.ListSpeciesOutput
	err error
}

func (f *fakeList) Execute(_ context.Context, in usecase.ListSpeciesInput) (usecase.ListSpeciesOutput, error) {
	f.in = in
	return f.out, f.err
}

type fakeGet struct {
	s   domain.Species
	err error
}

func (f fakeGet) Execute(context.Context, string) (domain.Species, error) { return f.s, f.err }

type fakeFilters struct{ f usecase.Filters }

func (f fakeFilters) Execute(context.Context) (usecase.Filters, error) { return f.f, nil }

// dial sobe o servidor gRPC em memória (bufconn): sem rede, rápido e real.
func dial(t *testing.T, srv catalogv1.CatalogServiceServer) catalogv1.CatalogServiceClient {
	t.Helper()
	lis := bufconn.Listen(1 << 20)
	s := grpc.NewServer()
	catalogv1.RegisterCatalogServiceServer(s, srv)
	go func() { _ = s.Serve(lis) }()
	t.Cleanup(s.Stop)
	conn, err := grpc.NewClient("passthrough:///bufnet",
		grpc.WithContextDialer(func(context.Context, string) (net.Conn, error) { return lis.Dial() }),
		grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	return catalogv1.NewCatalogServiceClient(conn)
}

var quiet = slog.New(slog.NewTextHandler(io.Discard, nil))

func TestListSpecies_MapsRequestAndResponse(t *testing.T) {
	list := &fakeList{out: usecase.ListSpeciesOutput{
		Species:       []domain.SpeciesSummary{{ID: "a", CommonNamePt: "Ave", ScientificName: "A a", ThumbnailKey: "k", ConservationStatus: domain.StatusVU}},
		NextPageToken: "tok",
	}}
	c := dial(t, grpcadapter.NewServer(list, fakeGet{}, fakeFilters{}, quiet))
	resp, err := c.ListSpecies(context.Background(), &catalogv1.ListSpeciesRequest{
		Query: "sabia", Biome: catalogv1.Biome_BIOME_PANTANAL, State: "MS", PageSize: 10, PageToken: "x"})
	if err != nil {
		t.Fatal(err)
	}
	if list.in != (usecase.ListSpeciesInput{Query: "sabia", Biome: "pantanal", State: "MS", PageSize: 10, PageToken: "x"}) {
		t.Fatalf("entrada mapeada errado: %+v", list.in)
	}
	got := resp.GetSpecies()[0]
	if got.GetId() != "a" || got.GetConservationStatus() != catalogv1.ConservationStatus_CONSERVATION_STATUS_VU || resp.GetNextPageToken() != "tok" {
		t.Fatalf("resposta mapeada errado: %v", resp)
	}
}

func TestListSpecies_UnknownBiomeEnumIsInvalidArgument(t *testing.T) {
	c := dial(t, grpcadapter.NewServer(&fakeList{}, fakeGet{}, fakeFilters{}, quiet))
	_, err := c.ListSpecies(context.Background(), &catalogv1.ListSpeciesRequest{Biome: catalogv1.Biome(99)})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("code = %v", status.Code(err))
	}
}

func TestErrorsMapToGRPCCodes(t *testing.T) {
	cases := []struct {
		err  error
		code codes.Code
	}{
		{domain.ErrNotFound, codes.NotFound},
		{&domain.InvalidArgumentError{Field: "id", Reason: "x"}, codes.InvalidArgument},
		{errors.New("senha do banco: hunter2"), codes.Internal},
	}
	for _, tc := range cases {
		c := dial(t, grpcadapter.NewServer(&fakeList{}, fakeGet{err: tc.err}, fakeFilters{}, quiet))
		_, err := c.GetSpecies(context.Background(), &catalogv1.GetSpeciesRequest{Id: "x"})
		if status.Code(err) != tc.code {
			t.Errorf("%v → %v, want %v", tc.err, status.Code(err), tc.code)
		}
		if tc.code == codes.Internal && status.Convert(err).Message() != "erro interno" {
			t.Errorf("erro interno vazou detalhes: %q", status.Convert(err).Message())
		}
	}
}

func TestGetSpecies_MapsOptionalsAndLists(t *testing.T) {
	size := 25
	s := domain.Species{
		ID: "t", ScientificName: "T r", CommonNamePt: "Sabiá", Family: "Turdidae", SizeCm: &size,
		Biomes: []domain.Biome{domain.BiomeCerrado}, States: []string{"SP"},
		Facts:  []domain.Fact{{Text: "f", Source: "s"}},
		Photos: []domain.Photo{{ThumbKey: "t.webp", Width: 10, Height: 5, Credit: domain.Credit{Author: "A", License: "CC-BY"}}},
		Clusters: []domain.OccurrenceCluster{{Lat: 1, Lng: 2, Count: 3, Precision: 0.5}},
	}
	c := dial(t, grpcadapter.NewServer(&fakeList{}, fakeGet{s: s}, fakeFilters{}, quiet))
	resp, err := c.GetSpecies(context.Background(), &catalogv1.GetSpeciesRequest{Id: "t"})
	if err != nil {
		t.Fatal(err)
	}
	got := resp.GetSpecies()
	if got.SizeCm == nil || got.GetSizeCm() != 25 || got.Diet != nil || got.Audio != nil {
		t.Fatalf("opcionais errados: size=%v diet=%v audio=%v", got.SizeCm, got.Diet, got.Audio)
	}
	if got.GetBiomes()[0] != catalogv1.Biome_BIOME_CERRADO || got.GetPhotos()[0].GetCredit().GetAuthor() != "A" || got.GetClusters()[0].GetPrecision() != 0.5 {
		t.Fatalf("listas erradas: %v", got)
	}
}

func TestListFilters(t *testing.T) {
	f := usecase.Filters{Biomes: []usecase.BiomeCount{{Biome: domain.BiomePampa, Count: 2}}, States: []usecase.StateCount{{State: "RS", Count: 2}}}
	c := dial(t, grpcadapter.NewServer(&fakeList{}, fakeGet{}, fakeFilters{f: f}, quiet))
	resp, err := c.ListFilters(context.Background(), &catalogv1.ListFiltersRequest{})
	if err != nil {
		t.Fatal(err)
	}
	if resp.GetBiomes()[0].GetBiome() != catalogv1.Biome_BIOME_PAMPA || resp.GetStates()[0].GetSpeciesCount() != 2 {
		t.Fatalf("filtros: %v", resp)
	}
}
```

`interceptors_test.go`:

```go
package grpcadapter_test

import (
	"context"
	"testing"

	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"

	grpcadapter "github.com/velosobr/passarim-catalog/internal/adapter/grpc"
)

func TestUnaryRequestID_KeepsIncomingID(t *testing.T) {
	ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs("x-request-id", "abc-123"))
	var seen string
	handler := func(ctx context.Context, _ any) (any, error) { seen = grpcadapter.RequestIDFrom(ctx); return nil, nil }
	_, _ = grpcadapter.UnaryRequestID()(ctx, nil, &grpc.UnaryServerInfo{}, handler)
	if seen != "abc-123" {
		t.Fatalf("request id = %q, want abc-123", seen)
	}
}

func TestUnaryRequestID_GeneratesWhenMissing(t *testing.T) {
	var seen string
	handler := func(ctx context.Context, _ any) (any, error) { seen = grpcadapter.RequestIDFrom(ctx); return nil, nil }
	_, _ = grpcadapter.UnaryRequestID()(context.Background(), nil, &grpc.UnaryServerInfo{}, handler)
	if len(seen) != 32 {
		t.Fatalf("esperava id gerado de 32 hex, veio %q", seen)
	}
}

func TestUnaryRequestID_RejectsOversizedID(t *testing.T) {
	long := string(make([]byte, 200))
	ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs("x-request-id", long))
	var seen string
	handler := func(ctx context.Context, _ any) (any, error) { seen = grpcadapter.RequestIDFrom(ctx); return nil, nil }
	_, _ = grpcadapter.UnaryRequestID()(ctx, nil, &grpc.UnaryServerInfo{}, handler)
	if seen == long || len(seen) != 32 {
		t.Fatalf("id gigante deveria ser trocado por um gerado, veio len=%d", len(seen))
	}
}
```

- [ ] **Step 2: Ver falhar**

```bash
go get github.com/velosobr/passarim-proto@v0.2.0 google.golang.org/grpc && go mod tidy
go test ./internal/adapter/grpc/   # Expected: FAIL (pacote grpcadapter não existe)
```

- [ ] **Step 3: Implementar** — `mapping.go`

```go
package grpcadapter

import (
	catalogv1 "github.com/velosobr/passarim-proto/gen/go/passarim/catalog/v1"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

// Tabelas de tradução entre o mundo do domínio (strings) e o do proto (enums).
var biomeToProto = map[domain.Biome]catalogv1.Biome{
	domain.BiomeAmazonia: catalogv1.Biome_BIOME_AMAZONIA, domain.BiomeMataAtlantica: catalogv1.Biome_BIOME_MATA_ATLANTICA,
	domain.BiomeCerrado: catalogv1.Biome_BIOME_CERRADO, domain.BiomeCaatinga: catalogv1.Biome_BIOME_CAATINGA,
	domain.BiomePantanal: catalogv1.Biome_BIOME_PANTANAL, domain.BiomePampa: catalogv1.Biome_BIOME_PAMPA,
}

var statusToProto = map[domain.ConservationStatus]catalogv1.ConservationStatus{
	domain.StatusLC: catalogv1.ConservationStatus_CONSERVATION_STATUS_LC, domain.StatusNT: catalogv1.ConservationStatus_CONSERVATION_STATUS_NT,
	domain.StatusVU: catalogv1.ConservationStatus_CONSERVATION_STATUS_VU, domain.StatusEN: catalogv1.ConservationStatus_CONSERVATION_STATUS_EN,
	domain.StatusCR: catalogv1.ConservationStatus_CONSERVATION_STATUS_CR, domain.StatusEW: catalogv1.ConservationStatus_CONSERVATION_STATUS_EW,
	domain.StatusEX: catalogv1.ConservationStatus_CONSERVATION_STATUS_EX, domain.StatusDD: catalogv1.ConservationStatus_CONSERVATION_STATUS_DD,
}

// biomeFromProto: UNSPECIFIED vira "" (sem filtro); valor desconhecido devolve ok=false.
func biomeFromProto(b catalogv1.Biome) (string, bool) {
	if b == catalogv1.Biome_BIOME_UNSPECIFIED {
		return "", true
	}
	for d, p := range biomeToProto {
		if p == b {
			return string(d), true
		}
	}
	return "", false
}

func creditToProto(c domain.Credit) *catalogv1.Credit {
	return &catalogv1.Credit{Author: c.Author, License: c.License, Source: c.Source, SourceUrl: c.SourceURL}
}

func summaryToProto(s domain.SpeciesSummary) *catalogv1.SpeciesSummary {
	return &catalogv1.SpeciesSummary{
		Id: s.ID, ScientificName: s.ScientificName, CommonNamePt: s.CommonNamePt,
		ThumbnailKey: s.ThumbnailKey, ConservationStatus: statusToProto[s.ConservationStatus],
	}
}

func speciesToProto(s domain.Species) *catalogv1.Species {
	out := &catalogv1.Species{
		Id: s.ID, ScientificName: s.ScientificName, CommonNamePt: s.CommonNamePt, Family: s.Family,
		ConservationStatus: statusToProto[s.ConservationStatus], Description: s.Description,
		DescriptionCredit: creditToProto(s.DescriptionCredit), States: s.States, Diet: s.Diet,
	}
	if s.SizeCm != nil {
		v := int32(*s.SizeCm)
		out.SizeCm = &v
	}
	for _, f := range s.Facts {
		out.Facts = append(out.Facts, &catalogv1.Fact{Text: f.Text, Source: f.Source})
	}
	for _, b := range s.Biomes {
		out.Biomes = append(out.Biomes, biomeToProto[b])
	}
	for _, p := range s.Photos {
		out.Photos = append(out.Photos, &catalogv1.Photo{ThumbKey: p.ThumbKey, MediumKey: p.MediumKey, LargeKey: p.LargeKey,
			Width: int32(p.Width), Height: int32(p.Height), Credit: creditToProto(p.Credit)})
	}
	if s.Audio != nil {
		out.Audio = &catalogv1.Audio{Key: s.Audio.Key, DurationMs: int32(s.Audio.DurationMs), Credit: creditToProto(s.Audio.Credit)}
	}
	for _, c := range s.Clusters {
		out.Clusters = append(out.Clusters, &catalogv1.OccurrenceCluster{Lat: c.Lat, Lng: c.Lng, Count: int32(c.Count), Precision: c.Precision})
	}
	return out
}
```

`server.go`:

```go
// Package grpcadapter expõe os casos de uso como um serviço gRPC.
// Ele só TRADUZ: proto → entrada do caso de uso → saída → proto.
// Nenhuma regra de negócio mora aqui.
package grpcadapter

import (
	"context"
	"errors"
	"log/slog"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	catalogv1 "github.com/velosobr/passarim-proto/gen/go/passarim/catalog/v1"

	"github.com/velosobr/passarim-catalog/internal/domain"
	"github.com/velosobr/passarim-catalog/internal/usecase"
)

// Interfaces pequenas (só o método Execute) facilitam testar com fakes.
type ListSpeciesUseCase interface {
	Execute(context.Context, usecase.ListSpeciesInput) (usecase.ListSpeciesOutput, error)
}
type GetSpeciesUseCase interface {
	Execute(context.Context, string) (domain.Species, error)
}
type ListFiltersUseCase interface {
	Execute(context.Context) (usecase.Filters, error)
}

// Server implementa catalogv1.CatalogServiceServer.
type Server struct {
	// Embutir o Unimplemented... é exigido pelo grpc-go: se um método novo
	// for adicionado ao .proto, o servidor continua compilando (e responde
	// "não implementado" até alguém implementar).
	catalogv1.UnimplementedCatalogServiceServer
	list    ListSpeciesUseCase
	get     GetSpeciesUseCase
	filters ListFiltersUseCase
	log     *slog.Logger
}

func NewServer(list ListSpeciesUseCase, get GetSpeciesUseCase, filters ListFiltersUseCase, log *slog.Logger) *Server {
	return &Server{list: list, get: get, filters: filters, log: log}
}

func (s *Server) ListSpecies(ctx context.Context, req *catalogv1.ListSpeciesRequest) (*catalogv1.ListSpeciesResponse, error) {
	biome, ok := biomeFromProto(req.GetBiome())
	if !ok {
		return nil, status.Error(codes.InvalidArgument, "biome: valor desconhecido")
	}
	out, err := s.list.Execute(ctx, usecase.ListSpeciesInput{
		Query: req.GetQuery(), Biome: biome, State: req.GetState(),
		PageSize: int(req.GetPageSize()), PageToken: req.GetPageToken(),
	})
	if err != nil {
		return nil, s.toStatus(ctx, err)
	}
	resp := &catalogv1.ListSpeciesResponse{NextPageToken: out.NextPageToken}
	for _, sp := range out.Species {
		resp.Species = append(resp.Species, summaryToProto(sp))
	}
	return resp, nil
}

func (s *Server) GetSpecies(ctx context.Context, req *catalogv1.GetSpeciesRequest) (*catalogv1.GetSpeciesResponse, error) {
	sp, err := s.get.Execute(ctx, req.GetId())
	if err != nil {
		return nil, s.toStatus(ctx, err)
	}
	return &catalogv1.GetSpeciesResponse{Species: speciesToProto(sp)}, nil
}

func (s *Server) ListFilters(ctx context.Context, _ *catalogv1.ListFiltersRequest) (*catalogv1.ListFiltersResponse, error) {
	f, err := s.filters.Execute(ctx)
	if err != nil {
		return nil, s.toStatus(ctx, err)
	}
	resp := &catalogv1.ListFiltersResponse{}
	for _, b := range f.Biomes {
		resp.Biomes = append(resp.Biomes, &catalogv1.BiomeCount{Biome: biomeToProto[b.Biome], SpeciesCount: int32(b.Count)})
	}
	for _, st := range f.States {
		resp.States = append(resp.States, &catalogv1.StateCount{State: st.State, SpeciesCount: int32(st.Count)})
	}
	return resp, nil
}

// toStatus traduz erros do domínio para códigos gRPC. Erros inesperados
// viram INTERNAL com mensagem genérica: o detalhe (que pode conter dados
// sensíveis) vai só para o log — OWASP API8.
func (s *Server) toStatus(ctx context.Context, err error) error {
	var inv *domain.InvalidArgumentError
	switch {
	case errors.Is(err, domain.ErrNotFound):
		return status.Error(codes.NotFound, "espécie não encontrada")
	case errors.As(err, &inv):
		return status.Error(codes.InvalidArgument, inv.Error())
	default:
		s.log.ErrorContext(ctx, "erro interno", "error", err, "request_id", RequestIDFrom(ctx))
		return status.Error(codes.Internal, "erro interno")
	}
}
```

`interceptors.go`:

```go
package grpcadapter

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// Interceptors são o "middleware" do gRPC: código que roda antes/depois
// de TODO método, sem repetir em cada um.

type ctxKey struct{}

const requestIDHeader = "x-request-id"

// RequestIDFrom devolve o id da requisição guardado no contexto.
func RequestIDFrom(ctx context.Context) string {
	id, _ := ctx.Value(ctxKey{}).(string)
	return id
}

func newRequestID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b) // crypto/rand não falha em sistemas suportados
	return hex.EncodeToString(b)
}

// UnaryRequestID reaproveita o x-request-id enviado pelo BFF (para seguir a
// mesma requisição nos logs dos dois serviços) ou gera um novo. Ids enormes
// são descartados: não confiamos cegamente em dados de entrada.
func UnaryRequestID() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, _ *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		id := ""
		if md, ok := metadata.FromIncomingContext(ctx); ok {
			if v := md.Get(requestIDHeader); len(v) > 0 && len(v[0]) > 0 && len(v[0]) <= 64 {
				id = v[0]
			}
		}
		if id == "" {
			id = newRequestID()
		}
		_ = grpc.SetHeader(ctx, metadata.Pairs(requestIDHeader, id))
		return handler(context.WithValue(ctx, ctxKey{}, id), req)
	}
}

// UnaryLogging registra uma linha por chamada: método, código e duração.
func UnaryLogging(log *slog.Logger) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		start := time.Now()
		resp, err := handler(ctx, req)
		log.InfoContext(ctx, "grpc",
			"method", info.FullMethod, "code", status.Code(err).String(),
			"duration_ms", time.Since(start).Milliseconds(), "request_id", RequestIDFrom(ctx))
		return resp, err
	}
}
```

- [ ] **Step 4: Ver passar**

Run: `go test -race ./internal/adapter/grpc/` — Expected: ok.

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "feat: servidor gRPC do catálogo com mapeamento de erros e request id"
```

---

### Task 7: Configuração, `cmd/catalog-api` e `cmd/seed`

**Files:**
- Create: `internal/config/config.go`, `config_test.go`, `cmd/catalog-api/main.go`, `cmd/seed/main.go`

**Interfaces:**
- Produces: `config.Load(getenv func(string) string) (Config, error)`; `Config{DatabaseURL, GRPCAddr, MetricsAddr string; MigrateOnStart, Reflection bool}`; binário `catalog-api` (subcomando `healthcheck`); binário `seed -dir <pasta>`.

- [ ] **Step 1: Teste que falha** — `config_test.go`

```go
package config_test

import (
	"testing"

	"github.com/velosobr/passarim-catalog/internal/config"
)

func env(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

func TestLoad_Defaults(t *testing.T) {
	c, err := config.Load(env(map[string]string{"DATABASE_URL": "postgres://x"}))
	if err != nil {
		t.Fatal(err)
	}
	if c.GRPCAddr != ":50051" || c.MetricsAddr != ":9091" || !c.MigrateOnStart || c.Reflection {
		t.Fatalf("padrões errados: %+v", c)
	}
}

func TestLoad_Overrides(t *testing.T) {
	c, _ := config.Load(env(map[string]string{"DATABASE_URL": "postgres://x", "GRPC_ADDR": ":1", "METRICS_ADDR": ":2",
		"MIGRATE_ON_START": "false", "GRPC_REFLECTION": "true"}))
	if c.GRPCAddr != ":1" || c.MetricsAddr != ":2" || c.MigrateOnStart || !c.Reflection {
		t.Fatalf("overrides ignorados: %+v", c)
	}
}

func TestLoad_RequiresDatabaseURL(t *testing.T) {
	if _, err := config.Load(env(nil)); err == nil {
		t.Fatal("DATABASE_URL é obrigatória")
	}
}

func TestLoad_RejectsBadBool(t *testing.T) {
	if _, err := config.Load(env(map[string]string{"DATABASE_URL": "x", "GRPC_REFLECTION": "talvez"})); err == nil {
		t.Fatal("booleano inválido deveria dar erro")
	}
}
```

Run: `go test ./internal/config/` — Expected: FAIL.

- [ ] **Step 2: Implementar** — `config.go`

```go
// Package config lê a configuração das variáveis de ambiente.
// Padrão "12-factor app": a mesma imagem Docker roda em qualquer ambiente;
// só as variáveis mudam.
package config

import (
	"errors"
	"fmt"
	"strconv"
)

type Config struct {
	DatabaseURL    string // ex.: postgres://user:senha@host:5432/db?sslmode=disable
	GRPCAddr       string // onde o gRPC escuta
	MetricsAddr    string // onde /metrics e /healthz escutam (HTTP)
	MigrateOnStart bool   // aplica migrations ao subir
	Reflection     bool   // gRPC reflection (só em desenvolvimento: deixa o grpcurl descobrir os métodos)
}

// Load recebe getenv como parâmetro (e não chama os.Getenv direto) para
// que os testes passem um "ambiente" falso.
func Load(getenv func(string) string) (Config, error) {
	c := Config{
		DatabaseURL: getenv("DATABASE_URL"),
		GRPCAddr:    or(getenv("GRPC_ADDR"), ":50051"),
		MetricsAddr: or(getenv("METRICS_ADDR"), ":9091"),
	}
	if c.DatabaseURL == "" {
		return c, errors.New("DATABASE_URL é obrigatória")
	}
	var err error
	if c.MigrateOnStart, err = boolVar(getenv, "MIGRATE_ON_START", true); err != nil {
		return c, err
	}
	if c.Reflection, err = boolVar(getenv, "GRPC_REFLECTION", false); err != nil {
		return c, err
	}
	return c, nil
}

func or(v, def string) string {
	if v == "" {
		return def
	}
	return v
}

func boolVar(getenv func(string) string, key string, def bool) (bool, error) {
	v := getenv(key)
	if v == "" {
		return def, nil
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return false, fmt.Errorf("%s: esperava true/false, veio %q", key, v)
	}
	return b, nil
}
```

Run: `go test ./internal/config/` — Expected: ok.

- [ ] **Step 3: `cmd/catalog-api/main.go`**

```go
// catalog-api: ponto de entrada do serviço. Aqui só "ligamos os fios":
// lemos a config, criamos as dependências e as entregamos umas às outras.
// Nenhuma regra de negócio mora no main.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	grpcprom "github.com/grpc-ecosystem/go-grpc-middleware/providers/prometheus"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"

	catalogv1 "github.com/velosobr/passarim-proto/gen/go/passarim/catalog/v1"

	grpcadapter "github.com/velosobr/passarim-catalog/internal/adapter/grpc"
	"github.com/velosobr/passarim-catalog/internal/adapter/postgres"
	"github.com/velosobr/passarim-catalog/internal/config"
	"github.com/velosobr/passarim-catalog/internal/usecase"
)

func main() {
	// Logs em JSON: fáceis de buscar e filtrar em qualquer ferramenta.
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	// "catalog-api healthcheck": usado pelo Docker. A imagem distroless não
	// tem shell nem curl, então o próprio binário faz a checagem.
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck())
	}
	if err := run(log); err != nil {
		log.Error("catalog-api encerrou com erro", "error", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}

	// Contexto cancelado ao receber SIGINT (Ctrl+C) ou SIGTERM (docker stop).
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("configurar pool: %w", err)
	}
	defer pool.Close()
	if err := postgres.WaitForDB(ctx, pool.Ping, 30, time.Second); err != nil {
		return err
	}
	if cfg.MigrateOnStart {
		if err := postgres.Migrate(cfg.DatabaseURL); err != nil {
			return err
		}
		log.Info("migrations aplicadas")
	}

	// Injeção de dependências "à mão": repositório → casos de uso → servidor.
	repo := postgres.NewRepository(pool)
	srv := grpcadapter.NewServer(
		usecase.ListSpecies{Repo: repo}, usecase.GetSpecies{Repo: repo}, usecase.ListFilters{Repo: repo}, log)

	metrics := grpcprom.NewServerMetrics(grpcprom.WithServerHandlingTimeHistogram())
	prometheus.MustRegister(metrics)

	grpcServer := grpc.NewServer(grpc.ChainUnaryInterceptor(
		grpcadapter.UnaryRequestID(), metrics.UnaryServerInterceptor(), grpcadapter.UnaryLogging(log)))
	catalogv1.RegisterCatalogServiceServer(grpcServer, srv)
	healthSrv := health.NewServer()
	healthpb.RegisterHealthServer(grpcServer, healthSrv)
	if cfg.Reflection {
		reflection.Register(grpcServer)
	}
	metrics.InitializeMetrics(grpcServer)

	// Servidor HTTP auxiliar: métricas para o Prometheus.
	mux := http.NewServeMux()
	mux.Handle("GET /metrics", promhttp.Handler())
	httpServer := &http.Server{Addr: cfg.MetricsAddr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}

	lis, err := net.Listen("tcp", cfg.GRPCAddr)
	if err != nil {
		return err
	}
	errCh := make(chan error, 2)
	go func() { errCh <- grpcServer.Serve(lis) }()
	go func() {
		if err := httpServer.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()
	log.Info("catalog-api no ar", "grpc", cfg.GRPCAddr, "metrics", cfg.MetricsAddr)

	select {
	case <-ctx.Done():
		log.Info("sinal recebido, encerrando com calma (graceful shutdown)")
	case err := <-errCh:
		return err
	}

	// Graceful shutdown: para de aceitar chamadas novas e espera as em
	// andamento terminarem (até 10 s). Depois disso, força o fim.
	healthSrv.Shutdown()
	done := make(chan struct{})
	go func() { grpcServer.GracefulStop(); close(done) }()
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		grpcServer.Stop()
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return httpServer.Shutdown(shutdownCtx)
}

// healthcheck chama o serviço padrão de saúde do gRPC no próprio container.
func healthcheck() int {
	addr := os.Getenv("GRPC_ADDR")
	if addr == "" {
		addr = ":50051"
	}
	conn, err := grpc.NewClient("localhost"+addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return 1
	}
	defer conn.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	resp, err := healthpb.NewHealthClient(conn).Check(ctx, &healthpb.HealthCheckRequest{})
	if err != nil || resp.GetStatus() != healthpb.HealthCheckResponse_SERVING {
		return 1
	}
	return 0
}
```

> Nota: `GRPC_ADDR` no formato `:50051` vira `localhost:50051` no healthcheck. Se for configurado com host (ex.: `0.0.0.0:50051`), o healthcheck deve usar só a porta — mantenha `GRPC_ADDR` no formato `:porta` (padrão).

- [ ] **Step 4: `cmd/seed/main.go`**

```go
// seed: carrega as aves curadas (content/species/*.yaml) no banco.
// Pode rodar quantas vezes quiser: o resultado é sempre o mesmo (idempotente).
package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velosobr/passarim-catalog/internal/adapter/curated"
	"github.com/velosobr/passarim-catalog/internal/adapter/postgres"
)

func main() {
	dir := flag.String("dir", "content/species", "pasta com os arquivos .yaml")
	flag.Parse()
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	// Primeiro valida TODOS os arquivos; só então toca no banco.
	species, err := curated.LoadDir(*dir)
	if err != nil {
		log.Error("conteúdo curado inválido", "error", err)
		os.Exit(1)
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Error("configurar pool", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	if err := postgres.WaitForDB(ctx, pool.Ping, 30, time.Second); err != nil {
		log.Error("banco indisponível", "error", err)
		os.Exit(1)
	}
	repo := postgres.NewRepository(pool)
	for _, s := range species {
		if err := repo.UpsertCurated(ctx, s); err != nil {
			log.Error("gravar espécie", "id", s.ID, "error", err)
			os.Exit(1)
		}
	}
	log.Info("seed concluído", "especies", len(species))
}
```

- [ ] **Step 5: Rodar de ponta a ponta contra o PostgreSQL do compose**

```bash
go get github.com/grpc-ecosystem/go-grpc-middleware/providers/prometheus github.com/prometheus/client_golang && go mod tidy
go build ./... && go vet ./...
(cd ../passarim-docs && docker compose up -d --wait postgres)
export DATABASE_URL=postgres://passarim:passarim-dev@localhost:5432/passarim?sslmode=disable
go run ./cmd/seed -dir internal/adapter/curated/testdata/valid   # Expected: "seed concluído" especies=1
GRPC_REFLECTION=true go run ./cmd/catalog-api &                  # Expected: log "catalog-api no ar"
sleep 3
docker run --rm fullstorydev/grpcurl -plaintext host.docker.internal:50051 passarim.catalog.v1.CatalogService/ListSpecies
# Expected: JSON com "turdus-rufiventris"
go run ./cmd/catalog-api healthcheck; echo "health=$?"            # Expected: health=0
kill %1                                                            # Expected: log "graceful shutdown"
```

> `host.docker.internal` é como um container alcança o seu computador no Docker Desktop (macOS/Windows).

- [ ] **Step 6: Commit**

```bash
git add . && git commit -m "feat: binários catalog-api (gRPC, métricas, healthcheck, graceful shutdown) e seed"
```

---

### Task 8: Conteúdo curado — 40 aves

**Files:**
- Create: `content/species/<id>.yaml` (40 arquivos), `content/README.md`, `content/content_test.go`

**Interfaces:**
- Consumes: `curated.LoadDir`.

- [ ] **Step 1: Teste que falha** — `content/content_test.go`

```go
// Testa o CONTEÚDO (não o código): garante que todas as aves curadas
// são válidas e têm fonte para cada informação.
package content_test

import (
	"strings"
	"testing"

	"github.com/velosobr/passarim-catalog/internal/adapter/curated"
)

func TestCuratedContent(t *testing.T) {
	species, err := curated.LoadDir("species")
	if err != nil {
		t.Fatal(err)
	}
	if len(species) < 30 {
		t.Fatalf("o MVP precisa de pelo menos 30 aves curadas, há %d", len(species))
	}
	for _, s := range species {
		if len(s.Facts) < 2 {
			t.Errorf("%s: pelo menos 2 curiosidades", s.ID)
		}
		if len(s.Biomes) == 0 || len(s.States) == 0 {
			t.Errorf("%s: biomas e estados são obrigatórios no conteúdo curado", s.ID)
		}
		if len([]rune(s.Description)) < 200 {
			t.Errorf("%s: descrição curta demais (mín. 200 caracteres)", s.ID)
		}
		if !strings.HasPrefix(s.DescriptionCredit.SourceURL, "https://") {
			t.Errorf("%s: description_source_url deve ser https", s.ID)
		}
		if s.ConservationStatus == "" {
			t.Errorf("%s: conservation_status obrigatório no conteúdo curado", s.ID)
		}
		for _, f := range s.Facts {
			if !strings.HasPrefix(f.Source, "https://") {
				t.Errorf("%s: fonte da curiosidade deve ser um link https: %q", s.ID, f.Source)
			}
		}
	}
}
```

Run: `go test ./content/` — Expected: FAIL `nenhum .yaml encontrado em species`.

- [ ] **Step 2: `content/README.md`** (guia para quem for escrever conteúdo)

```markdown
# Conteúdo curado

Cada arquivo em `species/` descreve uma ave. Nome do arquivo = id (nome científico em minúsculas com hífen).

## Regras
- **Escreva com suas palavras.** Não copie textos da Wikipedia ou de outros sites — use-os como referência e cite o link.
- Descrição: 200 a 600 caracteres, em português, tom de guia de campo para leigos.
- Curiosidades: de 2 a 4, cada uma com o link (`https://`) de onde a informação foi conferida.
- `conservation_status`: categoria da IUCN conferida na Wikipedia (caixa "Estado de conservação") ou em iucnredlist.org.
- `states` e `biomes`: onde a ave ocorre de forma regular no Brasil (conferir no WikiAves ou Wikipedia).
- Na dúvida sobre um dado, **deixe de fora** em vez de chutar (`size_cm` e `diet` são opcionais).

## Formato
Veja `species/turdus-rufiventris.yaml`.
```

- [ ] **Step 3: Escrever os 40 arquivos**

Para **cada** espécie da tabela abaixo, crie `content/species/<id>.yaml` no formato da Task 4, seguindo as regras do `content/README.md`. **Pesquise cada ave** (WebFetch em `https://pt.wikipedia.org/wiki/<Nome_popular>` e `https://www.wikiaves.com.br/wiki/<nome-popular>`), confira nome científico, família, tamanho, dieta, status IUCN, biomas e UFs, e escreva descrição e curiosidades **originais**. Nenhum dado sem fonte.

| # | Nome popular | Nome científico |
|---|---|---|
| 1 | Sabiá-laranjeira | Turdus rufiventris |
| 2 | Bem-te-vi | Pitangus sulphuratus |
| 3 | Tucano-toco | Ramphastos toco |
| 4 | Arara-azul-grande | Anodorhynchus hyacinthinus |
| 5 | Arara-canindé | Ara ararauna |
| 6 | João-de-barro | Furnarius rufus |
| 7 | Beija-flor-tesoura | Eupetomena macroura |
| 8 | Quero-quero | Vanellus chilensis |
| 9 | Gavião-real | Harpia harpyja |
| 10 | Seriema | Cariama cristata |
| 11 | Coruja-buraqueira | Athene cunicularia |
| 12 | Tuiuiú | Jabiru mycteria |
| 13 | Ararajuba | Guaruba guarouba |
| 14 | Saíra-sete-cores | Tangara seledon |
| 15 | Canário-da-terra | Sicalis flaveola |
| 16 | Sanhaço-cinzento | Thraupis sayaca |
| 17 | Pica-pau-de-banda-branca | Dryocopus lineatus |
| 18 | Tiê-sangue | Ramphocelus bresilia |
| 19 | Uirapuru-verdadeiro | Cyphorhinus arada |
| 20 | Garça-branca-grande | Ardea alba |
| 21 | Colhereiro | Platalea ajaja |
| 22 | Urubu-de-cabeça-preta | Coragyps atratus |
| 23 | Carcará | Caracara plancus |
| 24 | Papagaio-verdadeiro | Amazona aestiva |
| 25 | Periquito-rico | Brotogeris tirica |
| 26 | Rolinha-roxa | Columbina talpacoti |
| 27 | Corruíra | Troglodytes musculus |
| 28 | Ema | Rhea americana |
| 29 | Guará | Eudocimus ruber |
| 30 | Mutum-de-alagoas | Mitu mitu |
| 31 | Ararinha-azul | Cyanopsitta spixii |
| 32 | Udu-de-coroa-azul | Momotus momota |
| 33 | Pavãozinho-do-pará | Eurypyga helias |
| 34 | Cardeal | Paroaria coronata |
| 35 | Gralha-azul | Cyanocorax caeruleus |
| 36 | Andorinha-pequena-de-casa | Pygochelidon cyanoleuca |
| 37 | Anu-preto | Crotophaga ani |
| 38 | Socó-boi | Tigrisoma lineatum |
| 39 | Martim-pescador-grande | Megaceryle torquata |
| 40 | Tesourinha | Tyrannus savana |

> Se o CBRO/Wikipedia usar hoje outro nome científico para alguma espécie (taxonomia muda), use o atual e registre a troca na mensagem do commit.

- [ ] **Step 4: Ver passar**

Run: `go test ./content/` — Expected: ok (40 espécies válidas).

- [ ] **Step 5: Commit**

```bash
git add content && git commit -m "content: 40 aves brasileiras curadas com fontes"
```

---

### Task 9: Docker, integração no compose e teste ponta a ponta

**Files:**
- Create: `passarim-catalog/Dockerfile`, `passarim-catalog/.dockerignore`
- Modify: `passarim-docs/docker-compose.yml`, `passarim-docs/infra/prometheus/prometheus.yml`, `passarim-docs/README.md`

**Interfaces:**
- Produces: serviços compose `catalog-api` (gRPC `catalog-api:50051`, métricas `catalog-api:9091`, só na `passarim-private`) e `catalog-seed` (one-shot).

- [ ] **Step 1: `Dockerfile`**

```dockerfile
# Build em dois estágios ("multi-stage"):
# 1) uma imagem com o Go completo compila o binário;
# 2) a imagem final leva SÓ o binário — menor e com menos superfície de ataque.

FROM golang:1.27-alpine AS build
WORKDIR /src
# Copiar go.mod/go.sum primeiro aproveita o cache do Docker: as dependências
# só são baixadas de novo quando esses arquivos mudam.
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# CGO_ENABLED=0 gera binário estático (não depende de bibliotecas do sistema).
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/catalog-api ./cmd/catalog-api \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/seed ./cmd/seed

# distroless: sem shell, sem gerenciador de pacotes. "nonroot" = não roda como root.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/ /usr/local/bin/
COPY content /content
USER nonroot:nonroot
EXPOSE 50051 9091
ENTRYPOINT ["/usr/local/bin/catalog-api"]
```

`.dockerignore`:

```
.git
.github
*.md
**/*_test.go
**/testdata
```

```bash
docker build -t passarim-catalog:dev .   # Expected: build ok
docker run --rm passarim-catalog:dev 2>&1 | head -1   # Expected: erro "DATABASE_URL é obrigatória"
```

- [ ] **Step 2: Adicionar ao `passarim-docs/docker-compose.yml`** (antes do bloco do `prometheus`)

```yaml
  # Catalog API (gRPC). Só na rede PRIVADA: ninguém de fora chega nele,
  # nem publicamos porta no host. Quem o consome é o BFF (Etapa 3).
  # "build" aponta para o repositório vizinho; na Etapa 4 isso vira uma
  # imagem publicada no GHCR.
  catalog-api:
    build: ../passarim-catalog
    image: passarim-catalog:dev
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?sslmode=disable
      GRPC_REFLECTION: "true"   # só em dev: permite usar o grpcurl
    depends_on:
      postgres:
        condition: service_healthy
    networks: [passarim-private]
    read_only: true             # sistema de arquivos só de leitura (OWASP API8)
    healthcheck:
      test: ["CMD", "/usr/local/bin/catalog-api", "healthcheck"]
      interval: 5s
      timeout: 3s
      retries: 20

  # Roda UMA vez para carregar as aves curadas e termina.
  catalog-seed:
    image: passarim-catalog:dev
    pull_policy: never   # imagem construída localmente pelo serviço catalog-api; não existe em registry
    entrypoint: ["/usr/local/bin/seed", "-dir", "/content/species"]
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?sslmode=disable
    depends_on:
      catalog-api:
        condition: service_healthy   # a API já aplicou as migrations
    networks: [passarim-private]
    read_only: true
    restart: "no"
```

`infra/prometheus/prometheus.yml` — substituir o comentário das etapas futuras por:

```yaml
  - job_name: catalog
    static_configs:
      - targets: ["catalog-api:9091"]
  # O job do BFF será adicionado na Etapa 3.
```

No `README.md` do `passarim-docs`, na tabela de repositórios, trocar a linha do catalog por:

```markdown
| [passarim-catalog](https://github.com/velosobr/passarim-catalog) | Catalog API (gRPC) + banco + aves curadas |
```

E na seção "Rodando a infraestrutura local", trocar o pré-requisito por:

```markdown
Pré-requisito: Docker, e os repositórios `passarim-docs` e `passarim-catalog` clonados lado a lado na mesma pasta.
```

- [ ] **Step 3: Ponta a ponta**

```bash
cd ~/dev/passarim/passarim-docs
docker compose up -d --wait --build
docker compose logs catalog-seed | tail -1          # Expected: "seed concluído" "especies":40
docker run --rm --network passarim-private fullstorydev/grpcurl -plaintext \
  -d '{"query":"sabia"}' catalog-api:50051 passarim.catalog.v1.CatalogService/ListSpecies
# Expected: JSON com "turdus-rufiventris"
docker run --rm --network passarim-private fullstorydev/grpcurl -plaintext \
  -d '{"id":"nao-existe"}' catalog-api:50051 passarim.catalog.v1.CatalogService/GetSpecies
# Expected: "Code: NotFound"
curl -s localhost:9090/api/v1/targets | python3 -c "import json,sys;print([(t['labels']['job'],t['health']) for t in json.load(sys.stdin)['data']['activeTargets']])"
# Expected: contém ('catalog', 'up') — pode levar até 15 s (intervalo do scrape)
docker compose stop catalog-api && docker compose logs catalog-api | tail -2   # Expected: "graceful shutdown"
docker compose down
```

- [ ] **Step 4: Commits (dois repositórios)**

```bash
cd ~/dev/passarim/passarim-catalog && git add Dockerfile .dockerignore && git commit -m "build: imagem distroless non-root"
cd ~/dev/passarim/passarim-docs && git add docker-compose.yml infra README.md && git commit -m "feat: catalog-api e seed no docker compose"
```

---

### Task 10: README, lint, CI e publicação do `passarim-catalog`

**Files:**
- Create: `README.md`, `.golangci.yml`, `.github/workflows/ci.yml`

- [ ] **Step 1: `.golangci.yml`**

```yaml
# golangci-lint roda dezenas de verificadores de uma vez.
version: "2"
linters:
  enable:
    - gosec      # problemas de segurança (OWASP)
    - errorlint  # uso correto de errors.Is/As
    - bodyclose  # respostas HTTP fechadas
    - misspell
  exclusions:
    paths:
      - internal/adapter/postgres/sqlcgen   # código gerado
```

```bash
brew install golangci-lint
golangci-lint run   # Expected: 0 issues. Se aparecer algo, CORRIJA o código (não desligue o linter).
```

- [ ] **Step 2: `README.md`**

````markdown
# passarim-catalog

Catalog API do **Passarim**: guarda as aves do Brasil no PostgreSQL e as serve via **gRPC** para o BFF.
Todo o código é comentado para estudo. Arquitetura geral: [passarim-docs](https://github.com/velosobr/passarim-docs).

## Arquitetura limpa

```mermaid
flowchart LR
    subgraph adapter["adapter (entrada)"]
        G[grpc<br/>Server]
        Y[curated<br/>YAML loader]
    end
    subgraph usecase
        L[ListSpecies]
        D[GetSpecies]
        F[ListFilters]
        P{{SpeciesRepository<br/>interface}}
    end
    subgraph domain
        S[Species · Biome · UF<br/>regras puras]
    end
    subgraph adapter2["adapter (saída)"]
        R[postgres<br/>Repository]
    end
    G --> L & D & F
    L & D & F --> P
    L & D & F --> S
    R -. implementa .-> P
    R --> DB[(PostgreSQL)]
    Y --> S
```

As setas só apontam **para dentro**: `domain` não conhece banco nem gRPC.

## Rodando
| Comando | O que faz |
|---|---|
| `make test` | Testes (os de integração sobem um PostgreSQL via Docker) |
| `make generate` | Gera o código das queries (sqlc) |
| `make lint` | golangci-lint |
| `make run` | Sobe a API apontando para o PostgreSQL do compose |

Tudo junto (banco + API + seed): veja o `docker compose` do [passarim-docs](https://github.com/velosobr/passarim-docs).

## Conteúdo
As 40 aves curadas ficam em [`content/species`](content/species) — veja as [regras de escrita](content/README.md).
````

- [ ] **Step 3: `.github/workflows/ci.yml`**

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
      - name: código gerado pelo sqlc está atualizado
        run: go tool sqlc diff
      # -race detecta acesso concorrente perigoso. Os testes de integração
      # usam Docker, que já vem instalado nos runners do GitHub.
      - run: go test -race ./...
      - name: govulncheck
        run: go run golang.org/x/vuln/cmd/govulncheck@v1.1.4 ./...

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
        run: docker build -t passarim-catalog:ci .
      # Trivy procura vulnerabilidades na imagem. Falha em HIGH/CRITICAL.
      - uses: aquasecurity/trivy-action@0.33.1
        with:
          image-ref: passarim-catalog:ci
          severity: HIGH,CRITICAL
          exit-code: "1"
          ignore-unfixed: true
```

> Se `golang.org/x/vuln` v1.1.4, `golangci-lint-action@v8` ou `trivy-action@0.33.1` não existirem mais, use a versão estável mais recente de cada um e registre no commit.

- [ ] **Step 4: Validar o Mermaid e commitar**

```bash
npx -y @mermaid-js/mermaid-cli -i README.md -o /tmp/catalog-readme.md   # Expected: sem erro
git add . && git commit -m "docs: README com arquitetura; ci: testes, lint, segurança e trivy"
```

- [ ] **Step 5: Publicar e conferir CI**

```bash
gh repo create velosobr/passarim-catalog --public --source . --push \
  --description "Catalog API (Go + gRPC + PostgreSQL) do Passarim — app das aves do Brasil"
cd ~/dev/passarim/passarim-docs && git push
gh run watch -R velosobr/passarim-catalog --exit-status $(gh run list -R velosobr/passarim-catalog -L 1 --json databaseId --jq '.[0].databaseId')
```
Expected: CI verde no `passarim-catalog` e no `passarim-docs`. Se falhar, usar superpowers:systematic-debugging.
