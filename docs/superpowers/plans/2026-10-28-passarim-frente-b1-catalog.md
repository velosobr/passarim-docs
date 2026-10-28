# Frente B1 — Proto e catalog: conteúdo Kids no banco, filtros, picos do canto e "Ave do dia": plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar no `passarim-proto` e no `passarim-catalog` tudo o que o BFF e o app vão ler na frente B: o conteúdo Kids e o bioma principal de cada espécie, os filtros Kids, os 64 picos do canto e a "Ave do dia" em rodízio sem repetição.

**Architecture:**
- **Proto (PR 1):** só adições ao `catalog.proto`: `KidsContent`, `primary_biome`, `kids_only`, `Audio.peaks` e o RPC `GetFeaturedSpecies`. Tag `v0.4.0` depois do merge.
- **Banco, seed, leitura e filtros (PR 2):** migração `0005` com `species.primary_biome` e `species.kids` (jsonb), `media.peaks` e a tabela `featured_day`. O loader lê `primary_biome:` e `kids:` do YAML; a API devolve os campos novos e filtra por `kids_only` e `primary_biome`.
- **Picos (PR 3):** o worker decodifica o AAC final com o ffmpeg, calcula 64 picos numa função pura do domínio e grava junto com o canto. O `requeue` ganha `--source photos|audio`.
- **"Ave do dia" (PR 4):** função pura do rodízio no domínio, caso de uso com relógio injetado, consultas da elegibilidade e da tabela `featured_day`, e o RPC no servidor gRPC.

**Tech Stack:** Go 1.27.2, pgx v5, sqlc (`go tool sqlc`), golang-migrate, testcontainers (PostgreSQL 18), grpc-go, ffmpeg (já na imagem do worker), Buf (`buf lint`, `buf breaking`, `buf generate`).

**Spec:** `passarim-docs/docs/superpowers/specs/2026-10-28-passarim-frente-b-kids-design.md`, seções 1, 3.1 (formato do YAML), 4, 5, 6 e 9 ("Picos", "Catalog" e "Proto"). Cobre os PRs 1 a 4 da seção 10. O validador, o lint e o kidsgen (PR 5) e o conteúdo (PR 6) ficam no plano B2; o BFF (PR 7) e a ADR (PR 8) no plano B3.

## Global Constraints

- **Comentários didáticos em português** em todo código, SQL e proto novos ou alterados (regra do `~/dev/passarim/CLAUDE.md`):
  - todo arquivo novo começa dizendo o seu papel;
  - funções e blocos não triviais dizem o que fazem e por quê;
  - conceitos (jsonb, `ON CONFLICT`, FNV, PCM, fuso horário, `repeated`) são explicados na primeira vez que aparecem no arquivo;
  - mudou o código, atualiza o comentário.
- **Idioma:** identificadores em inglês; comentários, mensagens de erro, commits, PRs e README em português do Brasil.
- **Identidade do Git:** `velosobr <linoc.veloso@gmail.com>`. Commits terminam com as linhas de atribuição da sessão.
- **Pré-requisito:** a frente A3 mergeada na `main` do catalog (migração `0004`, `photo_override`, `InsertMedia` com 18 parâmetros, `RequeuePhotoJobs`) e na do proto (v0.3.0). A Task 2 confere isso antes de começar.
- **Números dos campos do proto, exatos:** `Audio.peaks` = 4; `SpeciesSummary.primary_biome` = 6; `Species.kids` = 16; `Species.primary_biome` = 17; `ListSpeciesRequest.kids_only` = 6; `ListSpeciesRequest.primary_biome` = 7; `ListFiltersRequest.kids_only` = 1; `ListFiltersResponse.primary_biome_counts` = 3.
- **Branches empilhados:**
  - proto: `feat/kids-ave-do-dia` (PR 1);
  - catalog: `feat/kids-banco` (PR 2, Tasks 2 a 4) ← `feat/picos-canto` (PR 3, Tasks 5 e 6) ← `feat/ave-do-dia` (PR 4, Tasks 7 e 8). Cada PR aponta para o branch anterior; quando o anterior entra na `main`, o seguinte é rebaseado e passa a apontar para a `main`.
- **Dependência do proto:** enquanto a tag `v0.4.0` não existe, o catalog usa a pseudo-versão do commit do branch `feat/kids-ave-do-dia` (`go get github.com/velosobr/passarim-proto@<sha>`). A Task 9 troca pela tag antes do merge. Nenhuma outra dependência nova.
- **Modelo de domínio sem tag de serialização:** o JSON da coluna `kids` usa uma struct do adapter `postgres`.
- **Nada depende de haver 41 espécies** (spec, seção 1). Nenhum número fixo de espécies em código ou teste de produção.
- **Fuso:** `America/Sao_Paulo`, com `time/tzdata` importado no pacote do caso de uso da "Ave do dia".
- **Sem merge e sem push na `main`:** os PRs ficam abertos para o dono.

## Review Focus

1. **Virada da meia-noite:** um pedido às 23h59min59s e outro às 00h00min00s de São Paulo dão dias diferentes, e o catalog aceita o dia seguinte quando o relógio dele ainda está no anterior. Teste na Task 7 (`TestGetFeatured_AcceptsTomorrowNearMidnight`).
2. **Bloco `kids:` removido do YAML:** o seed seguinte grava NULL, e a espécie sai do Kids e da elegibilidade. Teste na Task 3 (`TestUpsertCurated_KidsRemovedBecomesNull`).
3. **Fotos gravadas antes da migração 0004** (`category` NULL) e espécie sem foto ou sem canto: nunca são elegíveis, e a consulta não quebra. Teste na Task 7 (`TestFeaturedEligible`).
4. **`peaks` NOT NULL nas fotos:** a linha de foto grava a lista vazia, nunca NULL, senão toda troca de fotos quebraria. Coberto pelos testes de `ReplacePhotos` que já existem e por `TestReplacePhotos_PeaksEmpty` na Task 5.
5. **Paginação com `kids_only` e `primary_biome`:** a página 2 continua do cursor sem repetir nem pular, com os filtros novos. Teste na Task 4 (`TestListSpecies_KidsFiltersPaginate`).

---

### Task 1: Proto — campos e RPC novos (PR 1)

**Files:**
- Modify: `passarim-proto/proto/passarim/catalog/v1/catalog.proto`
- Regenerate: `passarim-proto/gen/go/passarim/catalog/v1/*.go` e `passarim-proto/gen/python/...` (o que o `buf generate` produzir)
- Test: `passarim-proto/contract_test.go`

**Interfaces:**
- Produces: `catalogv1.KidsContent{Description, Facts []*KidsFact, DidYouKnow}`, `catalogv1.KidsFact{Text, SourceFact int32}`, `Species.Kids`, `Species.PrimaryBiome`, `SpeciesSummary.PrimaryBiome`, `Audio.Peaks []float32`, `ListSpeciesRequest.KidsOnly`/`PrimaryBiome`, `ListFiltersRequest.KidsOnly`, `ListFiltersResponse.PrimaryBiomeCounts`, `GetFeaturedSpeciesRequest{Date}`, `GetFeaturedSpeciesResponse{Species, Audio}`, `CatalogServiceServer.GetFeaturedSpecies`.

- [ ] **Step 1: Branch**

```bash
cd ~/dev/passarim/passarim-proto
git switch main && git pull --ff-only && git switch -c feat/kids-ave-do-dia
```

- [ ] **Step 2: Escrever o teste de contrato que falha**

Acrescente ao fim de `contract_test.go`:

```go
// Os campos da frente B (conteúdo Kids, bioma principal, picos do canto e a
// "Ave do dia") também sobrevivem à ida e volta pelo formato binário.
func TestKidsAndFeaturedRoundTrip(t *testing.T) {
	species := &catalogv1.Species{
		Id:           "turdus-rufiventris",
		PrimaryBiome: catalogv1.Biome_BIOME_MATA_ATLANTICA,
		Kids: &catalogv1.KidsContent{
			Description: "O sabiá tem a barriga cor de laranja.",
			Facts:       []*catalogv1.KidsFact{{Text: "O canto dele pode durar dois minutos.", SourceFact: 1}},
			DidYouKnow:  "O sabiá imita outras aves.",
		},
		Audio: &catalogv1.Audio{Key: "species/t/a.aac", DurationMs: 3000, Peaks: []float32{0, 0.5, 1}},
	}
	featured := &catalogv1.GetFeaturedSpeciesResponse{
		Species: &catalogv1.SpeciesSummary{Id: "turdus-rufiventris", PrimaryBiome: catalogv1.Biome_BIOME_MATA_ATLANTICA},
		Audio:   &catalogv1.Audio{Key: "species/t/a.aac", Peaks: []float32{1}},
	}
	requests := []proto.Message{
		&catalogv1.ListSpeciesRequest{KidsOnly: true, PrimaryBiome: catalogv1.Biome_BIOME_PAMPA},
		&catalogv1.ListFiltersRequest{KidsOnly: true},
		&catalogv1.ListFiltersResponse{PrimaryBiomeCounts: []*catalogv1.BiomeCount{{Biome: catalogv1.Biome_BIOME_PAMPA, SpeciesCount: 2}}},
		&catalogv1.GetFeaturedSpeciesRequest{Date: "2026-10-28"},
	}
	for _, original := range append([]proto.Message{species, featured}, requests...) {
		bytes, err := proto.Marshal(original)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		decoded := original.ProtoReflect().New().Interface()
		if err := proto.Unmarshal(bytes, decoded); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if !proto.Equal(original, decoded) {
			t.Fatalf("mensagem mudou na ida e volta:\nantes:  %v\ndepois: %v", original, decoded)
		}
	}
}
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `go test ./... -run TestKidsAndFeaturedRoundTrip`
Expected: FAIL na compilação, com `unknown field PrimaryBiome` / `undefined: catalogv1.KidsContent`.

- [ ] **Step 4: Editar o `catalog.proto`**

No bloco de erros do comentário do `service CatalogService`, troque as linhas de `INVALID_ARGUMENT` e `NOT_FOUND` por:

```proto
//   - INVALID_ARGUMENT: parâmetro inválido (bioma/UF desconhecido, page_token
//     corrompido, query com mais de 100 caracteres, page_size negativo, data
//     da "Ave do dia" fora do formato AAAA-MM-DD ou longe de hoje).
//   - NOT_FOUND: em GetSpecies, não existe espécie com esse id; em
//     GetFeaturedSpecies, nenhuma ave pode ser a "Ave do dia".
```

Dentro do `service CatalogService`, depois de `ListFilters`:

```proto
  // A "Ave do dia": a mesma nas duas jornadas (adulto e Kids) e durante o dia
  // inteiro no fuso de São Paulo. O catalog escolhe em rodízio: nenhuma ave
  // se repete antes de todas as elegíveis aparecerem uma vez.
  rpc GetFeaturedSpecies(GetFeaturedSpeciesRequest) returns (GetFeaturedSpeciesResponse);
```

Na `message Audio`, depois de `Credit credit = 3;`:

```proto
  // 64 picos do canto, de 0 a 1, para o app desenhar a forma de onda real.
  // "repeated" é uma lista. Vazia = áudio gravado antes da frente B (o app
  // desenha uma forma genérica).
  repeated float peaks = 4;
```

Na `message SpeciesSummary`, depois de `conservation_status = 5;`:

```proto
  // O "mundo" da ave no Kids: um dos biomas dela. UNSPECIFIED = a espécie
  // ainda não tem conteúdo Kids.
  Biome primary_biome = 6;
```

Na `message Species`, depois de `clusters = 15;`:

```proto
  // Conteúdo para crianças (Passarim Kids). Ausente = a espécie ainda não
  // tem texto Kids revisado e não aparece no Kids.
  KidsContent kids = 16;
  // O "mundo" da ave no Kids, como em SpeciesSummary.primary_biome.
  Biome primary_biome = 17;
```

Na `message ListSpeciesRequest`, depois de `page_token = 5;`:

```proto
  bool kids_only = 6; // true = só as espécies com conteúdo Kids
  // Filtra pelo bioma principal ("mundo" do Kids). UNSPECIFIED = sem filtro.
  // Diferente de "biome", que filtra por QUALQUER bioma em que a ave vive.
  Biome primary_biome = 7;
```

Troque `message ListFiltersRequest {}` por:

```proto
message ListFiltersRequest {
  bool kids_only = 1; // true = as contagens consideram só as espécies com conteúdo Kids
}
```

Na `message ListFiltersResponse`, depois de `states = 2;`:

```proto
  // Contagem por bioma principal: quantas aves há em cada "mundo" do Kids.
  repeated BiomeCount primary_biome_counts = 3;
```

No fim do arquivo:

```proto
// Um fato para crianças. source_fact é a posição (a partir de 0) do fato
// adulto de onde ele saiu: o texto Kids nunca inventa um fato novo.
message KidsFact {
  string text = 1;
  int32 source_fact = 2;
}

// Conteúdo para crianças de 8 a 12 anos, gerado a partir do texto adulto e
// revisado por uma pessoa. É uma mensagem própria, sem nenhuma URL, para
// nenhum link externo chegar às telas Kids.
message KidsContent {
  string description = 1; // de 2 a 4 frases curtas
  repeated KidsFact facts = 2;
  string did_you_know = 3; // o balão "Você sabia?"
}

message GetFeaturedSpeciesRequest {
  // O dia no formato AAAA-MM-DD, no fuso de São Paulo. Quem calcula é o BFF;
  // o catalog aceita só ontem, hoje e amanhã.
  string date = 1;
}

message GetFeaturedSpeciesResponse {
  SpeciesSummary species = 1;
  // O canto da ave (o card adulto tem botão de canto). Ausente se a ave
  // perdeu o canto depois de ser escolhida.
  Audio audio = 2;
}
```

- [ ] **Step 5: Lint, breaking e geração**

Run: `buf lint && buf breaking --against '.git#branch=main' && buf generate`
Expected: os três sem saída e com código 0. Se o `buf lint` reclamar de comentário ausente em algum campo novo, acrescente uma linha de comentário didático ao campo e rode de novo.

- [ ] **Step 6: Rodar os testes**

Run: `go test ./...`
Expected: PASS (inclusive `TestKidsAndFeaturedRoundTrip` e o teste do Python gerado, se a CI local o rodar).

- [ ] **Step 7: Commit, push e PR**

```bash
git add -A
git commit -m "feat: conteúdo Kids, bioma principal, picos do canto e GetFeaturedSpecies

Só adições ao catalog.proto (o buf breaking passa). Frente B, PR 1."
git push -u origin feat/kids-ave-do-dia
gh pr create --base main --title "Frente B: conteúdo Kids, bioma principal, picos e Ave do dia no contrato" \
  --body "Só adições ao catalog.proto: KidsContent, primary_biome, kids_only, Audio.peaks e o RPC GetFeaturedSpecies. Depois do merge: tag v0.4.0. Spec: passarim-docs, 2026-10-28-passarim-frente-b-kids-design.md, seção 6."
git rev-parse HEAD   # anote o sha: o catalog usa esta pseudo-versão até a tag existir
```

---

### Task 2: Catalog — migração 0005 e tipos do domínio

**Files:**
- Create: `internal/adapter/postgres/migrations/0005_kids_featured_peaks.up.sql`, `internal/adapter/postgres/migrations/0005_kids_featured_peaks.down.sql`, `internal/domain/kids.go`, `internal/domain/kids_test.go`
- Modify: `internal/domain/species.go` (campos e `Validate`), `internal/adapter/postgres/migrate_test.go`, `go.mod`/`go.sum` (proto)
- Regenerate: `internal/adapter/postgres/sqlcgen/` (`make generate`)

**Interfaces:**
- Consumes: Task 1 (sha do proto).
- Produces: `domain.KidsContent{Description string; Facts []KidsFact; DidYouKnow, GeneratedBy, SourceHash string}`, `domain.KidsFact{Text string; SourceFact int}`, `domain.Species.PrimaryBiome Biome` e `.Kids *KidsContent`, `domain.SpeciesSummary.PrimaryBiome Biome`; colunas `species.primary_biome biome NULL`, `species.kids jsonb NULL`, `media.peaks real[] NOT NULL DEFAULT '{}'`, tabela `featured_day(day date PK, species_id text, cycle int)`.

- [ ] **Step 1: Conferir o pré-requisito e criar o branch**

```bash
cd ~/dev/passarim/passarim-catalog
git switch main && git pull --ff-only
test -f internal/adapter/postgres/migrations/0004_photo_curation.up.sql && grep -q RequeuePhotoJobs internal/adapter/postgres/queries_ingest.sql && echo "A3 ok"
git switch -c feat/kids-banco
go get github.com/velosobr/passarim-proto@<sha da Task 1> && go mod tidy
```

Expected: `A3 ok`. Sem essa linha, pare: a frente A3 ainda não foi mergeada.

- [ ] **Step 2: Escrever os testes do domínio que falham**

`internal/domain/kids_test.go`:

```go
// Testes das regras do bioma principal e do bloco Kids na validação da
// espécie. As regras de texto (tamanho das frases, números, hash) ficam no
// validador do conteúdo, no plano B2; aqui só a estrutura.

package domain_test

import (
	"strings"
	"testing"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

// kidsSpecies devolve uma espécie válida com bloco Kids completo.
func kidsSpecies() domain.Species {
	return domain.Species{
		ID: "turdus-rufiventris", ScientificName: "Turdus rufiventris", CommonNamePt: "Sabiá-laranjeira", Family: "Turdidae",
		Biomes:       []domain.Biome{domain.BiomeMataAtlantica, domain.BiomeCerrado},
		Facts:        []domain.Fact{{Text: "Fato adulto 0", Source: "https://a"}, {Text: "Fato adulto 1", Source: "https://b"}},
		PrimaryBiome: domain.BiomeMataAtlantica,
		Kids: &domain.KidsContent{Description: "O sabiá tem a barriga laranja.", DidYouKnow: "Ele imita outras aves.",
			Facts: []domain.KidsFact{{Text: "Ele canta muito.", SourceFact: 1}}, GeneratedBy: "claude-opus-5-5", SourceHash: "sha256:abc"},
	}
}

func TestValidate_KidsValid(t *testing.T) {
	if err := kidsSpecies().Validate(); err != nil {
		t.Fatalf("espécie válida recusada: %v", err)
	}
}

// Cada caso quebra uma regra e confere o campo citado no erro.
func TestValidate_KidsRules(t *testing.T) {
	cases := map[string]struct {
		change func(*domain.Species)
		field  string
	}{
		"bioma principal fora dos biomas": {func(s *domain.Species) { s.PrimaryBiome = domain.BiomePampa }, "primary_biome"},
		"bioma principal desconhecido":    {func(s *domain.Species) { s.PrimaryBiome = "lua" }, "primary_biome"},
		"kids sem bioma principal":        {func(s *domain.Species) { s.PrimaryBiome = "" }, "primary_biome"},
		"kids sem descrição":              {func(s *domain.Species) { s.Kids.Description = " " }, "kids"},
		"kids sem você sabia":             {func(s *domain.Species) { s.Kids.DidYouKnow = "" }, "kids"},
		"kids sem generated_by":           {func(s *domain.Species) { s.Kids.GeneratedBy = "" }, "kids"},
		"kids sem source_hash":            {func(s *domain.Species) { s.Kids.SourceHash = "" }, "kids"},
		"kids sem fatos":                  {func(s *domain.Species) { s.Kids.Facts = nil }, "kids.facts"},
		"fato kids sem texto":             {func(s *domain.Species) { s.Kids.Facts[0].Text = "" }, "kids.facts"},
		"fato de origem inexistente":      {func(s *domain.Species) { s.Kids.Facts[0].SourceFact = 2 }, "kids.facts"},
		"fato de origem negativo":         {func(s *domain.Species) { s.Kids.Facts[0].SourceFact = -1 }, "kids.facts"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			s := kidsSpecies()
			tc.change(&s)
			err := s.Validate()
			if err == nil || !strings.HasPrefix(err.Error(), tc.field+":") {
				t.Fatalf("esperava erro no campo %q, veio %v", tc.field, err)
			}
		})
	}
}

// Sem bloco Kids, o bioma principal é opcional, mas se vier precisa estar
// entre os biomas (o loader recusa mesmo sem o bloco).
func TestValidate_PrimaryBiomeWithoutKids(t *testing.T) {
	s := kidsSpecies()
	s.Kids = nil
	if err := s.Validate(); err != nil {
		t.Fatalf("bioma principal sem Kids deveria passar: %v", err)
	}
	s.PrimaryBiome = ""
	if err := s.Validate(); err != nil {
		t.Fatalf("sem bioma principal e sem Kids deveria passar: %v", err)
	}
	s.PrimaryBiome = domain.BiomePampa
	if err := s.Validate(); err == nil {
		t.Fatal("bioma principal fora dos biomas deveria falhar mesmo sem Kids")
	}
}
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `go test ./internal/domain/ -run 'TestValidate_(Kids|PrimaryBiome)'`
Expected: FAIL na compilação (`unknown field PrimaryBiome`, `undefined: domain.KidsContent`).

- [ ] **Step 4: Tipos e validação**

`internal/domain/kids.go`:

```go
// Conteúdo Kids de uma espécie: o texto para crianças de 8 a 12 anos, gerado
// por IA a partir do texto adulto curado e revisado por uma pessoa no PR do
// YAML (frente B). Este arquivo tem os tipos e a validação da ESTRUTURA do
// bloco; as regras do texto (frases de até 15 palavras, números, hash do
// texto adulto) ficam no validador do conteúdo (pacote kidscontent).

package domain

import (
	"fmt"
	"slices"
	"strings"
)

// KidsFact é um fato para crianças. SourceFact é a posição, a partir de 0,
// do fato adulto de onde ele saiu: o Kids nunca traz um fato novo.
type KidsFact struct {
	Text       string
	SourceFact int
}

// KidsContent é o bloco kids: do YAML. GeneratedBy (o id do modelo) e
// SourceHash (o hash do texto adulto de origem) servem à revisão e ao lint;
// o banco guarda só o que o app mostra.
type KidsContent struct {
	Description string
	Facts       []KidsFact
	DidYouKnow  string
	GeneratedBy string
	SourceHash  string
}

// validateKids confere o bioma principal e a estrutura do bloco Kids:
//   - o bioma principal, quando existe, é um dos biomas da espécie (no Kids
//     ele é o "mundo" da ave, e uma ave não pode morar num mundo onde não vive);
//   - com bloco Kids, o bioma principal é obrigatório (os dois nascem juntos
//     no kidsgen) e todos os campos do bloco também;
//   - cada fato Kids aponta para um fato adulto que existe.
func (s Species) validateKids() error {
	if s.PrimaryBiome != "" {
		if _, err := ParseBiome(string(s.PrimaryBiome)); err != nil {
			return invalid("primary_biome", err.Error())
		}
		if !slices.Contains(s.Biomes, s.PrimaryBiome) {
			return invalid("primary_biome", fmt.Sprintf("%q não está entre os biomas da espécie", s.PrimaryBiome))
		}
	}
	k := s.Kids
	if k == nil {
		return nil
	}
	if s.PrimaryBiome == "" {
		return invalid("primary_biome", "obrigatório quando há o bloco kids")
	}
	if strings.TrimSpace(k.Description) == "" || strings.TrimSpace(k.DidYouKnow) == "" {
		return invalid("kids", "description e did_you_know são obrigatórios")
	}
	if strings.TrimSpace(k.GeneratedBy) == "" || strings.TrimSpace(k.SourceHash) == "" {
		return invalid("kids", "generated_by e source_hash são obrigatórios")
	}
	if len(k.Facts) == 0 {
		return invalid("kids.facts", "pelo menos um fato")
	}
	for i, f := range k.Facts {
		if strings.TrimSpace(f.Text) == "" {
			return invalid("kids.facts", fmt.Sprintf("fato %d sem texto", i+1))
		}
		if f.SourceFact < 0 || f.SourceFact >= len(s.Facts) {
			return invalid("kids.facts", fmt.Sprintf("fato %d aponta para o fato adulto %d, que não existe", i+1, f.SourceFact))
		}
	}
	return nil
}
```

Em `internal/domain/species.go`:

- na struct `SpeciesSummary`, depois de `ConservationStatus ConservationStatus`:

```go
	// PrimaryBiome é o "mundo" da ave no Kids ("" = ainda sem conteúdo Kids).
	PrimaryBiome Biome
```

- na struct `Species`, depois de `PhotoOverride *PhotoOverride`:

```go
	// PrimaryBiome é o bioma principal, o "mundo" da ave no Kids ("" = ainda
	// não escolhido). Kids é o conteúdo para crianças (nil = sem bloco kids:).
	PrimaryBiome Biome
	Kids         *KidsContent
```

- em `Validate`, logo antes do `return nil` final:

```go
	if err := s.validateKids(); err != nil {
		return err
	}
```

- [ ] **Step 5: Rodar os testes do domínio**

Run: `go test ./internal/domain/`
Expected: PASS.

- [ ] **Step 6: Escrever o teste da migração que falha**

Em `internal/adapter/postgres/migrate_test.go`, no `TestMigration0004UpDownUp`, troque o bloco `if v, _, _ := m.Version(); v != 4 { ... }` por:

```go
	// A 0005 veio depois: primeiro descemos até a 4 para testar a 0004 sozinha.
	if err := m.Migrate(4); err != nil {
		t.Fatalf("descer até a 0004: %v", err)
	}
```

E acrescente no fim do arquivo:

```go
// A 0005 (frente B) sobe, desce e sobe de novo: o down apaga a tabela da
// "Ave do dia" e as colunas novas de species e media.
func TestMigration0005UpDownUp(t *testing.T) {
	_, pool := newRepo(t)
	ctx := context.Background()
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
	if v, _, _ := m.Version(); v != 5 {
		t.Fatalf("esperava a versão 5, veio %d", v)
	}
	if err := m.Steps(-1); err != nil {
		t.Fatalf("descer a 0005: %v", err)
	}
	var n int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM information_schema.columns
		WHERE (table_name = 'species' AND column_name IN ('primary_biome', 'kids'))
		   OR (table_name = 'media' AND column_name = 'peaks')
		   OR table_name = 'featured_day'`).Scan(&n)
	if n != 0 {
		t.Fatalf("o down deveria apagar a tabela e as 3 colunas, sobraram %d colunas", n)
	}
	if err := m.Up(); err != nil {
		t.Fatalf("subir de novo: %v", err)
	}
}

// O CHECK de media.peaks aceita a lista vazia e a de 64 valores, e recusa
// qualquer outro tamanho.
func TestMigration0005_PeaksCheck(t *testing.T) {
	repo, pool := newRepo(t)
	ctx := context.Background()
	seed(t, repo, sp("Turdus rufiventris", "Sabiá-laranjeira", nil))
	insert := func(peaks string) error {
		_, err := pool.Exec(ctx, `INSERT INTO media (species_id, kind, position, audio_key, author, license, source, source_url, peaks)
			VALUES ('turdus-rufiventris', 'audio', 0, 'a.aac', 'A', 'CC-BY', 'xeno-canto', 'https://x', `+peaks+`)`)
		_, _ = pool.Exec(ctx, `DELETE FROM media`)
		return err
	}
	if err := insert(`'{}'`); err != nil {
		t.Fatalf("lista vazia recusada: %v", err)
	}
	if err := insert(`array_fill(0.5::real, ARRAY[64])`); err != nil {
		t.Fatalf("64 valores recusados: %v", err)
	}
	if err := insert(`'{0.1,0.2,0.3}'`); err == nil {
		t.Fatal("3 valores deveriam violar o CHECK")
	}
}
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `go test ./internal/adapter/postgres/ -run 'TestMigration000(4|5)'`
Expected: FAIL: `esperava a versão 5, veio 4` e `column "peaks" ... does not exist`.

- [ ] **Step 8: Escrever a migração**

`internal/adapter/postgres/migrations/0005_kids_featured_peaks.up.sql`:

```sql
-- Frente B: conteúdo Kids, bioma principal, picos do canto e "Ave do dia".

-- primary_biome usa o tipo ENUM biome que já existe (o mesmo de
-- species_biome.biome). NULL = a espécie ainda não tem bioma principal.
-- Não há chave estrangeira para species_biome porque o seed grava a
-- espécie antes dos biomas; quem garante que o principal está entre os
-- biomas da ave é a validação do domínio, no loader.
-- kids guarda o conteúdo para crianças como jsonb: JSON binário, que o
-- PostgreSQL valida na gravação. NULL = sem conteúdo Kids, e a espécie
-- não aparece no Kids nem na "Ave do dia".
ALTER TABLE species
    ADD COLUMN primary_biome biome,
    ADD COLUMN kids          jsonb;

-- Os 64 picos do canto, de 0 a 1. real[] é uma lista de números reais.
-- A lista vazia (padrão) vale para fotos e para cantos antigos; o CHECK
-- impede gravar um tamanho errado.
ALTER TABLE media
    ADD COLUMN peaks real[] NOT NULL DEFAULT '{}' CHECK (cardinality(peaks) IN (0, 64));

-- A "Ave do dia": uma linha por dia. A primeira chamada do dia escolhe e
-- grava; as outras leem a mesma linha, então a ave não muda no meio do
-- dia. cycle é a volta do rodízio: dentro de um ciclo nenhuma ave se
-- repete. Apagar a espécie apaga as linhas dela (CASCADE).
CREATE TABLE featured_day (
    day        date PRIMARY KEY,
    species_id text NOT NULL REFERENCES species (id) ON DELETE CASCADE,
    cycle      integer NOT NULL CHECK (cycle > 0)
);
CREATE INDEX featured_day_cycle_idx ON featured_day (cycle);
```

`internal/adapter/postgres/migrations/0005_kids_featured_peaks.down.sql`:

```sql
-- Desfaz a 0005, na ordem inversa.
DROP TABLE featured_day;
ALTER TABLE media DROP COLUMN peaks;
ALTER TABLE species DROP COLUMN kids, DROP COLUMN primary_biome;
```

Run: `make generate`
Expected: sem erro; `sqlcgen/models.go` ganha `PrimaryBiome NullBiome`, `Kids []byte`, `Peaks []float32` e o tipo `FeaturedDay`.

- [ ] **Step 9: Rodar os testes**

Run: `go build ./... && go test ./internal/domain/ ./internal/adapter/postgres/ -run 'TestMigration|TestValidate'`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: migração 0005 e tipos do conteúdo Kids e do bioma principal"
```

---

### Task 3: Catalog — loader e seed com `primary_biome:` e `kids:`

**Files:**
- Modify: `internal/adapter/curated/loader.go`, `internal/adapter/postgres/queries.sql` (`UpsertSpecies`), `internal/adapter/postgres/repository.go` (`UpsertCurated`)
- Create: `internal/adapter/postgres/kids_json.go`, `internal/adapter/curated/testdata/kids/turdus-rufiventris.yaml`, `internal/adapter/curated/testdata/kids-bad-biome/turdus-rufiventris.yaml`
- Test: `internal/adapter/curated/loader_test.go`, `internal/adapter/postgres/repository_test.go`

**Interfaces:**
- Consumes: Task 2 (`domain.KidsContent`, colunas novas).
- Produces: `postgres.kidsToJSON(*domain.KidsContent) ([]byte, error)` e `postgres.kidsFromJSON([]byte) (*domain.KidsContent, error)` (internos ao pacote), usados na Task 4.

- [ ] **Step 1: Arquivos de teste do loader**

`internal/adapter/curated/testdata/kids/turdus-rufiventris.yaml`:

```yaml
scientific_name: Turdus rufiventris
common_name_pt: Sabiá-laranjeira
family: Turdidae
conservation_status: LC
biomes: [mata_atlantica, cerrado, pampa]
primary_biome: mata_atlantica
states: [SP, RJ, MG]
description: >
  Ave de peito alaranjado e canto melodioso, comum em parques e quintais.
description_source_url: https://pt.wikipedia.org/wiki/Sabi%C3%A1-laranjeira
facts:
  - text: Foi declarada ave-símbolo do Brasil por decreto em 2002.
    source: https://pt.wikipedia.org/wiki/Sabi%C3%A1-laranjeira
kids:
  description: >
    O sabiá tem a barriga cor de laranja. Ele vive em parques e quintais.
  facts:
    - text: Em 2002 o sabiá virou a ave símbolo do Brasil.
      source_fact: 0
  did_you_know: O sabiá canta bem cedinho.
  generated_by: claude-opus-5-5
  source_hash: sha256:abc
```

`internal/adapter/curated/testdata/kids-bad-biome/turdus-rufiventris.yaml`: o mesmo conteúdo, com `primary_biome: amazonia` e **sem** o bloco `kids:`.

- [ ] **Step 2: Testes do loader que falham**

Acrescente a `internal/adapter/curated/loader_test.go`:

```go
// As chaves primary_biome: e kids: viram o bioma principal e o conteúdo Kids.
func TestLoadDir_Kids(t *testing.T) {
	species, err := curated.LoadDir("testdata/kids")
	if err != nil {
		t.Fatal(err)
	}
	s := species[0]
	if s.PrimaryBiome != domain.BiomeMataAtlantica || s.Kids == nil {
		t.Fatalf("bioma=%q kids=%v", s.PrimaryBiome, s.Kids)
	}
	k := s.Kids
	if !strings.HasPrefix(k.Description, "O sabiá tem") || strings.HasSuffix(k.Description, "\n") {
		t.Fatalf("descrição kids = %q (deveria vir aparada)", k.Description)
	}
	if len(k.Facts) != 1 || k.Facts[0].SourceFact != 0 || k.DidYouKnow == "" || k.GeneratedBy != "claude-opus-5-5" || k.SourceHash != "sha256:abc" {
		t.Fatalf("bloco kids = %+v", k)
	}
}

// Um bioma principal fora dos biomas é recusado mesmo sem o bloco kids:.
func TestLoadDir_PrimaryBiomeOutsideBiomesFails(t *testing.T) {
	_, err := curated.LoadDir("testdata/kids-bad-biome")
	if err == nil || !strings.Contains(err.Error(), "primary_biome") {
		t.Fatalf("esperava erro de primary_biome, veio %v", err)
	}
}

// Sem as chaves novas, nada muda: o arquivo de sempre continua válido.
func TestLoadDir_WithoutKidsKeepsWorking(t *testing.T) {
	species, err := curated.LoadDir("testdata/valid")
	if err != nil || species[0].Kids != nil || species[0].PrimaryBiome != "" {
		t.Fatalf("err=%v kids=%v bioma=%q", err, species[0].Kids, species[0].PrimaryBiome)
	}
}
```

Run: `go test ./internal/adapter/curated/`
Expected: FAIL: `field primary_biome not found in type curated.speciesFile`.

- [ ] **Step 3: Implementar no loader**

Em `internal/adapter/curated/loader.go`, na struct `speciesFile`, depois de `Photos`:

```go
	PrimaryBiome string    `yaml:"primary_biome"` // "" = sem a chave
	Kids         *kidsFile `yaml:"kids"`          // nil = sem a chave
```

Depois de `primaryFile`:

```go
// kidsFile é o bloco kids: do YAML, o conteúdo para crianças (frente B):
//
//	kids:
//	  description: >
//	    Frases curtas para quem tem de 8 a 12 anos.
//	  facts:
//	    - text: Um fato curto.
//	      source_fact: 0      # posição do fato adulto de origem
//	  did_you_know: O balão "Você sabia?".
//	  generated_by: claude-opus-5-5
//	  source_hash: sha256:...
//
// O kidsgen escreve este bloco; a validação da estrutura fica no domínio.
type kidsFile struct {
	Description string         `yaml:"description"`
	Facts       []kidsFactFile `yaml:"facts"`
	DidYouKnow  string         `yaml:"did_you_know"`
	GeneratedBy string         `yaml:"generated_by"`
	SourceHash  string         `yaml:"source_hash"`
}

// kidsFactFile é um fato Kids no YAML.
type kidsFactFile struct {
	Text       string `yaml:"text"`
	SourceFact int    `yaml:"source_fact"`
}

// toDomain converte o bloco do YAML no tipo do domínio, aparando os
// espaços (o estilo ">" do YAML deixa uma quebra de linha no fim).
func (k kidsFile) toDomain() *domain.KidsContent {
	out := &domain.KidsContent{Description: strings.TrimSpace(k.Description), DidYouKnow: strings.TrimSpace(k.DidYouKnow),
		GeneratedBy: strings.TrimSpace(k.GeneratedBy), SourceHash: strings.TrimSpace(k.SourceHash)}
	for _, f := range k.Facts {
		out.Facts = append(out.Facts, domain.KidsFact{Text: strings.TrimSpace(f.Text), SourceFact: f.SourceFact})
	}
	return out
}
```

Em `loadFile`, logo depois do bloco `if f.Photos != nil { ... }`:

```go
	s.PrimaryBiome = domain.Biome(strings.TrimSpace(f.PrimaryBiome))
	if f.Kids != nil {
		s.Kids = f.Kids.toDomain()
	}
```

Run: `go test ./internal/adapter/curated/`
Expected: PASS.

- [ ] **Step 4: Testes do seed que falham**

Acrescente a `internal/adapter/postgres/repository_test.go`:

```go
// withKids devolve a espécie com bioma principal e bloco Kids válidos.
func withKids(s domain.Species) domain.Species {
	s.PrimaryBiome = s.Biomes[0]
	s.Kids = &domain.KidsContent{Description: "Descrição kids.", DidYouKnow: "Você sabia.",
		Facts: []domain.KidsFact{{Text: "Fato kids.", SourceFact: 1}}, GeneratedBy: "claude-opus-5-5", SourceHash: "sha256:abc"}
	return s
}

// O seed grava o bioma principal e o conteúdo Kids (só o que o app mostra:
// generated_by e source_hash ficam só no YAML).
func TestUpsertCurated_KidsAndPrimaryBiome(t *testing.T) {
	repo, pool := newRepo(t)
	ctx := context.Background()
	seed(t, repo, withKids(sp("Turdus rufiventris", "Sabiá-laranjeira", []domain.Biome{domain.BiomeMataAtlantica})))
	var biome, desc, fact string
	var hasHash bool
	err := pool.QueryRow(ctx, `SELECT primary_biome::text, kids->>'description', kids->'facts'->0->>'text', kids ? 'source_hash'
		FROM species WHERE id = 'turdus-rufiventris'`).Scan(&biome, &desc, &fact, &hasHash)
	if err != nil {
		t.Fatal(err)
	}
	if biome != "mata_atlantica" || desc != "Descrição kids." || fact != "Fato kids." || hasHash {
		t.Fatalf("bioma=%q desc=%q fato=%q hash no banco=%v", biome, desc, fact, hasHash)
	}
}

// Tirar o bloco kids: do YAML e rodar o seed de novo grava NULL: a espécie
// sai do Kids e da "Ave do dia".
func TestUpsertCurated_KidsRemovedBecomesNull(t *testing.T) {
	repo, pool := newRepo(t)
	ctx := context.Background()
	s := withKids(sp("Turdus rufiventris", "Sabiá-laranjeira", []domain.Biome{domain.BiomeMataAtlantica}))
	seed(t, repo, s)
	s.Kids, s.PrimaryBiome = nil, ""
	seed(t, repo, s)
	var nulls bool
	if err := pool.QueryRow(ctx, `SELECT kids IS NULL AND primary_biome IS NULL FROM species WHERE id = 'turdus-rufiventris'`).Scan(&nulls); err != nil || !nulls {
		t.Fatalf("esperava kids e primary_biome NULL, err=%v", err)
	}
}
```

Run: `go test ./internal/adapter/postgres/ -run TestUpsertCurated_Kids`
Expected: FAIL: `biome=""` (o upsert ainda não grava as colunas novas).

- [ ] **Step 5: Implementar o upsert**

Em `internal/adapter/postgres/queries.sql`, troque a query `UpsertSpecies` inteira por:

```sql
-- name: UpsertSpecies :exec
-- "Upsert" = insere, ou atualiza se o id já existir. Só mexe nos campos
-- curados; created_at é preservado. primary_biome e kids (frente B) também
-- são curados: um YAML sem as chaves grava NULL, e a espécie sai do Kids.
INSERT INTO species (id, scientific_name, common_name_pt, family, size_cm, diet, conservation_status,
                     description, description_author, description_license, description_source,
                     description_source_url, is_curated, sort_name, search_text, primary_biome, kids)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, $13, $14, $15, $16)
ON CONFLICT (id) DO UPDATE SET
    scientific_name = EXCLUDED.scientific_name, common_name_pt = EXCLUDED.common_name_pt,
    family = EXCLUDED.family, size_cm = EXCLUDED.size_cm, diet = EXCLUDED.diet,
    conservation_status = EXCLUDED.conservation_status, description = EXCLUDED.description,
    description_author = EXCLUDED.description_author, description_license = EXCLUDED.description_license,
    description_source = EXCLUDED.description_source, description_source_url = EXCLUDED.description_source_url,
    is_curated = true, sort_name = EXCLUDED.sort_name, search_text = EXCLUDED.search_text,
    primary_biome = EXCLUDED.primary_biome, kids = EXCLUDED.kids,
    updated_at = now();
```

Run: `make generate`
Expected: `UpsertSpeciesParams` ganha `PrimaryBiome NullBiome` e `Kids []byte`.

`internal/adapter/postgres/kids_json.go`:

```go
// Formato JSON da coluna species.kids (jsonb). As tags `json:"..."` ficam
// aqui no adapter, e não no domínio, que não sabe de JSON. Só vai para o
// banco o que o app mostra: generated_by e source_hash ficam no YAML.

package postgres

import (
	"encoding/json"
	"fmt"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

// kidsDTO e kidsFactDTO espelham o JSON gravado.
type kidsDTO struct {
	Description string        `json:"description"`
	Facts       []kidsFactDTO `json:"facts"`
	DidYouKnow  string        `json:"did_you_know"`
}

type kidsFactDTO struct {
	Text       string `json:"text"`
	SourceFact int    `json:"source_fact"`
}

// kidsToJSON converte o conteúdo Kids no JSON da coluna. nil vira nil, que o
// pgx grava como NULL (espécie sem conteúdo Kids).
func kidsToJSON(k *domain.KidsContent) ([]byte, error) {
	if k == nil {
		return nil, nil
	}
	dto := kidsDTO{Description: k.Description, DidYouKnow: k.DidYouKnow, Facts: make([]kidsFactDTO, len(k.Facts))}
	for i, f := range k.Facts {
		dto.Facts[i] = kidsFactDTO{Text: f.Text, SourceFact: f.SourceFact}
	}
	return json.Marshal(dto)
}

// kidsFromJSON faz o caminho inverso. NULL (nil) vira nil.
func kidsFromJSON(raw []byte) (*domain.KidsContent, error) {
	if raw == nil {
		return nil, nil
	}
	var dto kidsDTO
	if err := json.Unmarshal(raw, &dto); err != nil {
		return nil, fmt.Errorf("conteúdo kids inválido no banco: %w", err)
	}
	out := &domain.KidsContent{Description: dto.Description, DidYouKnow: dto.DidYouKnow}
	for _, f := range dto.Facts {
		out.Facts = append(out.Facts, domain.KidsFact{Text: f.Text, SourceFact: f.SourceFact})
	}
	return out, nil
}
```

Em `UpsertCurated`, logo depois do bloco `if s.Diet != nil { ... }`:

```go
	// Bioma principal e conteúdo Kids (frente B). Vazio e nil viram NULL.
	params.PrimaryBiome = sqlcgen.NullBiome{Biome: sqlcgen.Biome(s.PrimaryBiome), Valid: s.PrimaryBiome != ""}
	if params.Kids, err = kidsToJSON(s.Kids); err != nil {
		return err
	}
```

- [ ] **Step 6: Rodar os testes**

Run: `go test ./internal/adapter/postgres/ ./internal/adapter/curated/ ./content/`
Expected: PASS (o `content_test.go` continua passando: nenhum YAML real tem as chaves novas ainda).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: o seed grava o bioma principal e o conteúdo Kids do YAML"
```

---

### Task 4: Catalog — leitura e filtros Kids

**Files:**
- Modify: `internal/adapter/postgres/queries.sql` (`ListSpecies`, `CountByBiome`, `CountByState`; nova `CountByPrimaryBiome`), `internal/adapter/postgres/repository.go`, `internal/usecase/ports.go`, `internal/usecase/list_species.go`, `internal/usecase/list_filters.go`, `internal/usecase/fake_repo_test.go`, `internal/adapter/grpc/server.go`, `internal/adapter/grpc/mapping.go`
- Test: `internal/usecase/list_species_test.go`, `internal/usecase/list_filters_test.go`, `internal/adapter/grpc/server_test.go`, `internal/adapter/postgres/repository_test.go`

**Interfaces:**
- Consumes: Task 3 (`kidsFromJSON`).
- Produces:
  - `usecase.ListFilter.KidsOnly bool`, `.PrimaryBiome domain.Biome`; `usecase.ListSpeciesInput.KidsOnly bool`, `.PrimaryBiome string`;
  - `usecase.SpeciesRepository.CountByBiome(ctx, kidsOnly bool)`, `.CountByState(ctx, kidsOnly bool)`, `.CountByPrimaryBiome(ctx, kidsOnly bool) (map[domain.Biome]int, error)`;
  - `usecase.ListFiltersInput{KidsOnly bool}`; `usecase.ListFilters.Execute(ctx, ListFiltersInput) (Filters, error)`; `usecase.Filters.PrimaryBiomes []BiomeCount`;
  - `grpcadapter.ListFiltersUseCase.Execute(context.Context, usecase.ListFiltersInput) (usecase.Filters, error)`;
  - `grpcadapter.kidsToProto`, e `summaryToProto`/`speciesToProto` com `PrimaryBiome` e `Kids`.

- [ ] **Step 1: Testes dos casos de uso que falham**

Em `internal/usecase/fake_repo_test.go`, troque `CountByBiome` e `CountByState` por:

```go
// CountByBiome, CountByState e CountByPrimaryBiome devolvem contagens fixas
// (não olham f.species), junto com o erro configurado. lastKidsOnly guarda o
// kidsOnly recebido, para o teste conferir que o filtro chegou.
func (f *fakeRepo) CountByBiome(_ context.Context, kidsOnly bool) (map[domain.Biome]int, error) {
	f.lastKidsOnly = kidsOnly
	return map[domain.Biome]int{domain.BiomePantanal: 2, domain.BiomeAmazonia: 1}, f.err
}

func (f *fakeRepo) CountByState(_ context.Context, kidsOnly bool) (map[string]int, error) {
	f.lastKidsOnly = kidsOnly
	return map[string]int{"SP": 3, "AM": 1}, f.err
}

func (f *fakeRepo) CountByPrimaryBiome(_ context.Context, kidsOnly bool) (map[domain.Biome]int, error) {
	f.lastKidsOnly = kidsOnly
	return map[domain.Biome]int{domain.BiomePampa: 1, domain.BiomeCerrado: 4, domain.BiomeCaatinga: 0}, f.err
}
```

E na struct `fakeRepo`, depois de `err error`:

```go
	lastKidsOnly bool // o kidsOnly da última contagem
```

Em `internal/usecase/list_filters_test.go`, troque `Execute(context.Background())` por `Execute(context.Background(), usecase.ListFiltersInput{})` e acrescente:

```go
// As contagens por bioma principal saem na ordem oficial, sem as zeradas, e
// o kidsOnly chega ao repositório.
func TestListFilters_PrimaryBiomesAndKidsOnly(t *testing.T) {
	repo := &fakeRepo{}
	out, err := usecase.ListFilters{Repo: repo}.Execute(context.Background(), usecase.ListFiltersInput{KidsOnly: true})
	if err != nil {
		t.Fatal(err)
	}
	if !repo.lastKidsOnly {
		t.Fatal("kidsOnly não chegou ao repositório")
	}
	if len(out.PrimaryBiomes) != 2 || out.PrimaryBiomes[0].Biome != domain.BiomeCerrado || out.PrimaryBiomes[1].Biome != domain.BiomePampa {
		t.Fatalf("biomas principais: %+v", out.PrimaryBiomes)
	}
}
```

Em `internal/usecase/list_species_test.go`, acrescente:

```go
// kids_only e o bioma principal chegam ao repositório já validados.
func TestListSpecies_KidsFiltersReachRepo(t *testing.T) {
	repo := &fakeRepo{species: birds(3)}
	_, err := usecase.ListSpecies{Repo: repo}.Execute(context.Background(), usecase.ListSpeciesInput{KidsOnly: true, PrimaryBiome: "pampa"})
	if err != nil {
		t.Fatal(err)
	}
	if !repo.lastQuery.KidsOnly || repo.lastQuery.PrimaryBiome != domain.BiomePampa {
		t.Fatalf("filtro: %+v", repo.lastQuery)
	}
}

// Um bioma principal desconhecido é recusado antes de ir ao banco.
func TestListSpecies_UnknownPrimaryBiomeIsInvalid(t *testing.T) {
	_, err := usecase.ListSpecies{Repo: &fakeRepo{}}.Execute(context.Background(), usecase.ListSpeciesInput{PrimaryBiome: "lua"})
	var inv *domain.InvalidArgumentError
	if !errors.As(err, &inv) || inv.Field != "primary_biome" {
		t.Fatalf("esperava InvalidArgumentError em primary_biome, veio %v", err)
	}
}
```

(Se `errors` ainda não estiver importado no arquivo, acrescente `"errors"` aos imports.)

Run: `go test ./internal/usecase/`
Expected: FAIL na compilação (`unknown field KidsOnly`, `undefined: usecase.ListFiltersInput`).

- [ ] **Step 2: Implementar nos casos de uso**

Em `internal/usecase/ports.go`, troque as linhas de `CountByBiome` e `CountByState` da interface por:

```go
	// CountByBiome e CountByState contam as espécies de cada bioma e de cada
	// UF; CountByPrimaryBiome conta por bioma principal ("mundo" do Kids).
	// Com kidsOnly, só entram as espécies com conteúdo Kids.
	CountByBiome(ctx context.Context, kidsOnly bool) (map[domain.Biome]int, error)
	CountByState(ctx context.Context, kidsOnly bool) (map[string]int, error)
	CountByPrimaryBiome(ctx context.Context, kidsOnly bool) (map[domain.Biome]int, error)
```

E na struct `ListFilter`, depois de `State string`:

```go
	KidsOnly     bool         // true = só espécies com conteúdo Kids
	PrimaryBiome domain.Biome // vazio = sem filtro pelo bioma principal
```

Em `internal/usecase/list_species.go`, na struct `ListSpeciesInput`, depois de `State string`:

```go
	KidsOnly     bool
	PrimaryBiome string // bioma principal ("mundo" do Kids); vazio = sem filtro
```

E em `buildFilter`, logo depois do bloco do `in.State`:

```go
	f.KidsOnly = in.KidsOnly
	if in.PrimaryBiome != "" {
		b, err := domain.ParseBiome(in.PrimaryBiome)
		if err != nil {
			return f, 0, &domain.InvalidArgumentError{Field: "primary_biome", Reason: err.Error()}
		}
		f.PrimaryBiome = b
	}
```

Em `internal/usecase/list_filters.go`:

- na struct `Filters`, acrescente `PrimaryBiomes []BiomeCount // por bioma principal, na ordem oficial`;
- antes de `type ListFilters struct`, acrescente:

```go
// ListFiltersInput é o pedido dos filtros. KidsOnly = contar só as espécies
// com conteúdo Kids (a jornada Kids).
type ListFiltersInput struct {
	KidsOnly bool
}
```

- troque a função `Execute` inteira por:

```go
// Execute busca as três contagens, tira as zeradas e ordena: biomas na
// ordem oficial, UFs em ordem alfabética. Os erros ganham contexto com %w,
// que embrulha o erro original sem perdê-lo.
func (u ListFilters) Execute(ctx context.Context, in ListFiltersInput) (Filters, error) {
	byBiome, err := u.Repo.CountByBiome(ctx, in.KidsOnly)
	if err != nil {
		return Filters{}, fmt.Errorf("contar por bioma: %w", err)
	}
	byState, err := u.Repo.CountByState(ctx, in.KidsOnly)
	if err != nil {
		return Filters{}, fmt.Errorf("contar por estado: %w", err)
	}
	byPrimary, err := u.Repo.CountByPrimaryBiome(ctx, in.KidsOnly)
	if err != nil {
		return Filters{}, fmt.Errorf("contar por bioma principal: %w", err)
	}

	out := Filters{Biomes: inOfficialOrder(byBiome), PrimaryBiomes: inOfficialOrder(byPrimary)}
	for uf, n := range byState {
		if n > 0 {
			out.States = append(out.States, StateCount{State: uf, Count: n})
		}
	}
	sort.Slice(out.States, func(i, j int) bool { return out.States[i].State < out.States[j].State })
	return out, nil
}

// inOfficialOrder devolve os biomas com contagem maior que zero na ordem
// "oficial" (fixa), não alfabética nem aleatória: mapas em Go não têm ordem
// garantida, então nunca iteramos o mapa direto.
func inOfficialOrder(counts map[domain.Biome]int) []BiomeCount {
	var out []BiomeCount
	for _, b := range domain.AllBiomes() {
		if n := counts[b]; n > 0 {
			out = append(out, BiomeCount{Biome: b, Count: n})
		}
	}
	return out
}
```

Run: `go test ./internal/usecase/`
Expected: PASS. (`go build ./...` ainda falha no `postgres` e no `grpc`; os próximos passos resolvem.)

- [ ] **Step 3: Testes do repositório que falham**

Acrescente a `internal/adapter/postgres/repository_test.go`:

```go
// kids_only e o bioma principal filtram a lista e as contagens. O anu-preto
// vive em dois biomas, mas o "mundo" dele é um só.
func TestKidsFiltersAndCounts(t *testing.T) {
	repo, _ := newRepo(t)
	ctx := context.Background()
	anu := withKids(sp("Crotophaga ani", "Anu-preto", []domain.Biome{domain.BiomeCerrado, domain.BiomePampa}, "SP"))
	sabia := withKids(sp("Turdus rufiventris", "Sabiá-laranjeira", []domain.Biome{domain.BiomePampa}, "RS"))
	semKids := sp("Pitangus sulphuratus", "Bem-te-vi", []domain.Biome{domain.BiomePampa}, "RS")
	seed(t, repo, anu, sabia, semKids)

	kids, _ := repo.ListSpecies(ctx, usecase.ListFilter{KidsOnly: true, Limit: 10})
	if got := fmt.Sprint(ids(kids)); got != "[crotophaga-ani turdus-rufiventris]" {
		t.Fatalf("kids_only: %s", got)
	}
	if kids[0].PrimaryBiome != domain.BiomeCerrado {
		t.Fatalf("o resumo deveria trazer o bioma principal: %+v", kids[0])
	}
	pampa, _ := repo.ListSpecies(ctx, usecase.ListFilter{PrimaryBiome: domain.BiomePampa, Limit: 10})
	if got := fmt.Sprint(ids(pampa)); got != "[turdus-rufiventris]" {
		t.Fatalf("o anu-preto vive no pampa, mas o mundo dele é o cerrado: %s", got)
	}

	primary, _ := repo.CountByPrimaryBiome(ctx, true)
	biomes, _ := repo.CountByBiome(ctx, true)
	allBiomes, _ := repo.CountByBiome(ctx, false)
	states, _ := repo.CountByState(ctx, true)
	if primary[domain.BiomeCerrado] != 1 || primary[domain.BiomePampa] != 1 || biomes[domain.BiomePampa] != 2 ||
		allBiomes[domain.BiomePampa] != 3 || states["RS"] != 1 {
		t.Fatalf("principal=%v biomas(kids)=%v biomas=%v ufs(kids)=%v", primary, biomes, allBiomes, states)
	}
}

// A página 2 com os filtros Kids continua do cursor sem repetir nem pular.
func TestListSpecies_KidsFiltersPaginate(t *testing.T) {
	repo, _ := newRepo(t)
	ctx := context.Background()
	seed(t, repo,
		withKids(sp("Crotophaga ani", "Anu-preto", []domain.Biome{domain.BiomePampa})),
		withKids(sp("Pitangus sulphuratus", "Bem-te-vi", []domain.Biome{domain.BiomePampa})),
		sp("Furnarius rufus", "João-de-barro", []domain.Biome{domain.BiomePampa}),
		withKids(sp("Turdus rufiventris", "Sabiá-laranjeira", []domain.Biome{domain.BiomePampa})))
	f := usecase.ListFilter{KidsOnly: true, PrimaryBiome: domain.BiomePampa, Limit: 2}
	p1, _ := repo.ListSpecies(ctx, f)
	f.After = &usecase.Cursor{SortName: p1[1].SortName, ID: p1[1].ID}
	p2, _ := repo.ListSpecies(ctx, f)
	if got := fmt.Sprint(ids(p1), ids(p2)); got != "[crotophaga-ani pitangus-sulphuratus] [turdus-rufiventris]" {
		t.Fatalf("páginas: %s", got)
	}
}

// O detalhe traz o bioma principal e o conteúdo Kids gravados pelo seed.
func TestGetSpecies_Kids(t *testing.T) {
	repo, _ := newRepo(t)
	ctx := context.Background()
	seed(t, repo, withKids(sp("Turdus rufiventris", "Sabiá-laranjeira", []domain.Biome{domain.BiomeMataAtlantica})))
	s, err := repo.GetSpecies(ctx, "turdus-rufiventris")
	if err != nil {
		t.Fatal(err)
	}
	if s.PrimaryBiome != domain.BiomeMataAtlantica || s.Kids == nil || s.Kids.Facts[0].SourceFact != 1 || s.Kids.DidYouKnow != "Você sabia." {
		t.Fatalf("bioma=%q kids=%+v", s.PrimaryBiome, s.Kids)
	}
}
```

E troque, no subteste `"contagens"`, as duas chamadas por `repo.CountByBiome(ctx, false)` e `repo.CountByState(ctx, false)`.

(Se `fmt` ainda não estiver importado no arquivo, acrescente.)

- [ ] **Step 4: Implementar as consultas e o repositório**

Em `internal/adapter/postgres/queries.sql`, troque `ListSpecies`, `CountByBiome` e `CountByState` por:

```sql
-- name: ListSpecies :many
-- Lista resumida com busca, filtros e paginação por cursor.
-- Cada filtro é opcional: "(parâmetro IS NULL OR condição)".
-- A miniatura é a thumb da foto de menor position ('' se não houver foto).
-- ESCAPE '\' declara a barra como escape do LIKE (o Go já escapou % e _).
-- kids_only (frente B) deixa só as espécies com conteúdo Kids, e
-- primary_biome filtra pelo "mundo" do Kids, diferente de biome, que filtra
-- por qualquer bioma em que a ave vive.
-- "(s.sort_name, s.id) > (after_sort, after_id)" compara os pares em ordem
-- (sort_name e, no empate, id): começa logo depois do último item da página
-- anterior e usa o índice species_sort_idx.
SELECT s.id, s.scientific_name, s.common_name_pt, s.conservation_status, s.sort_name,
       COALESCE((SELECT m.thumb_key FROM media m
                 WHERE m.species_id = s.id AND m.kind = 'photo'
                 ORDER BY m.position LIMIT 1), '')::text AS thumbnail_key,
       COALESCE(s.primary_biome::text, '')::text AS primary_biome
FROM species s
WHERE (sqlc.narg('query')::text IS NULL OR s.search_text LIKE '%' || sqlc.narg('query')::text || '%' ESCAPE '\')
  AND (sqlc.narg('biome')::biome IS NULL OR EXISTS (
        SELECT 1 FROM species_biome b WHERE b.species_id = s.id AND b.biome = sqlc.narg('biome')::biome))
  AND (sqlc.narg('state')::text IS NULL OR EXISTS (
        SELECT 1 FROM species_state st WHERE st.species_id = s.id AND st.uf = sqlc.narg('state')::text))
  AND (NOT sqlc.arg('kids_only')::bool OR s.kids IS NOT NULL)
  AND (sqlc.narg('primary_biome')::biome IS NULL OR s.primary_biome = sqlc.narg('primary_biome')::biome)
  AND (sqlc.narg('after_sort')::text IS NULL
       OR (s.sort_name, s.id) > (sqlc.narg('after_sort')::text, sqlc.narg('after_id')::text))
ORDER BY s.sort_name, s.id
LIMIT sqlc.arg('lim');
```

```sql
-- name: CountByBiome :many
-- Quantas espécies há em cada bioma (os filtros do Explorar). Com
-- kids_only, só as que têm conteúdo Kids.
SELECT b.biome, count(*)::int AS total
FROM species_biome b JOIN species s ON s.id = b.species_id
WHERE NOT sqlc.arg('kids_only')::bool OR s.kids IS NOT NULL
GROUP BY b.biome;

-- name: CountByState :many
-- Quantas espécies há em cada UF, com o mesmo kids_only.
SELECT st.uf::text AS uf, count(*)::int AS total
FROM species_state st JOIN species s ON s.id = st.species_id
WHERE NOT sqlc.arg('kids_only')::bool OR s.kids IS NOT NULL
GROUP BY st.uf;

-- name: CountByPrimaryBiome :many
-- Quantas espécies há em cada bioma principal ("mundo" do Kids): é a conta
-- do álbum. Espécies sem bioma principal não entram.
SELECT COALESCE(primary_biome::text, '')::text AS biome, count(*)::int AS total
FROM species
WHERE primary_biome IS NOT NULL AND (NOT sqlc.arg('kids_only')::bool OR kids IS NOT NULL)
GROUP BY primary_biome;
```

Run: `make generate`
Expected: `ListSpeciesParams` ganha `KidsOnly bool` e `PrimaryBiome NullBiome`; `ListSpeciesRow` ganha `PrimaryBiome string`; `CountByBiome`, `CountByState` e `CountByPrimaryBiome` recebem `kidsOnly bool`.

Em `internal/adapter/postgres/repository.go`:

- em `ListSpecies`, depois do bloco `if f.Biome != "" { ... }`:

```go
	params.KidsOnly = f.KidsOnly
	if f.PrimaryBiome != "" {
		params.PrimaryBiome = sqlcgen.NullBiome{Biome: sqlcgen.Biome(f.PrimaryBiome), Valid: true}
	}
```

  e no `domain.SpeciesSummary{...}` do laço, acrescente `PrimaryBiome: domain.Biome(row.PrimaryBiome),`;

- em `GetSpecies`, logo depois do bloco `if row.Diet.Valid { ... }`:

```go
	if row.PrimaryBiome.Valid {
		s.PrimaryBiome = domain.Biome(row.PrimaryBiome.Biome)
	}
	if s.Kids, err = kidsFromJSON(row.Kids); err != nil {
		return s, err
	}
```

- troque `CountByBiome` e `CountByState` por:

```go
// CountByBiome, CountByState e CountByPrimaryBiome devolvem as contagens
// como mapas. kidsOnly = só as espécies com conteúdo Kids.
func (r *Repository) CountByBiome(ctx context.Context, kidsOnly bool) (map[domain.Biome]int, error) {
	rows, err := r.q.CountByBiome(ctx, kidsOnly)
	if err != nil {
		return nil, err
	}
	out := make(map[domain.Biome]int, len(rows))
	for _, row := range rows {
		out[domain.Biome(row.Biome)] = int(row.Total)
	}
	return out, nil
}

func (r *Repository) CountByState(ctx context.Context, kidsOnly bool) (map[string]int, error) {
	rows, err := r.q.CountByState(ctx, kidsOnly)
	if err != nil {
		return nil, err
	}
	out := make(map[string]int, len(rows))
	for _, row := range rows {
		out[row.Uf] = int(row.Total)
	}
	return out, nil
}

func (r *Repository) CountByPrimaryBiome(ctx context.Context, kidsOnly bool) (map[domain.Biome]int, error) {
	rows, err := r.q.CountByPrimaryBiome(ctx, kidsOnly)
	if err != nil {
		return nil, err
	}
	out := make(map[domain.Biome]int, len(rows))
	for _, row := range rows {
		out[domain.Biome(row.Biome)] = int(row.Total)
	}
	return out, nil
}
```

Run: `go test ./internal/adapter/postgres/ -run 'TestKidsFilters|TestListSpecies_KidsFiltersPaginate|TestGetSpecies_Kids|TestRepository'`
Expected: PASS.

- [ ] **Step 5: Testes do gRPC que falham**

Em `internal/adapter/grpc/server_test.go`:

- troque `fakeFilters` por:

```go
type fakeFilters struct {
	f  usecase.Filters
	in usecase.ListFiltersInput
}

func (f *fakeFilters) Execute(_ context.Context, in usecase.ListFiltersInput) (usecase.Filters, error) {
	f.in = in
	return f.f, nil
}
```

- troque todo `fakeFilters{}` por `&fakeFilters{}` e `fakeFilters{f: f}` por `filters` (com `filters := &fakeFilters{f: f}` antes, no `TestListFilters`);
- acrescente:

```go
// O pedido da lista leva kids_only e o bioma principal ao caso de uso, e
// um bioma principal desconhecido é recusado.
func TestListSpecies_KidsFilters(t *testing.T) {
	list := &fakeList{}
	c := dial(t, grpcadapter.NewServer(list, fakeGet{}, &fakeFilters{}, quiet))
	_, err := c.ListSpecies(context.Background(), &catalogv1.ListSpeciesRequest{KidsOnly: true, PrimaryBiome: catalogv1.Biome_BIOME_PAMPA})
	if err != nil {
		t.Fatal(err)
	}
	if !list.in.KidsOnly || list.in.PrimaryBiome != "pampa" {
		t.Fatalf("entrada: %+v", list.in)
	}
	_, err = c.ListSpecies(context.Background(), &catalogv1.ListSpeciesRequest{PrimaryBiome: catalogv1.Biome(99)})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("bioma principal 99 deveria ser INVALID_ARGUMENT, veio %v", err)
	}
}

// O detalhe leva o conteúdo Kids e o bioma principal; sem Kids, o campo fica ausente.
func TestGetSpecies_Kids(t *testing.T) {
	s := domain.Species{ID: "t", PrimaryBiome: domain.BiomeCerrado,
		Kids: &domain.KidsContent{Description: "D", DidYouKnow: "V", Facts: []domain.KidsFact{{Text: "F", SourceFact: 1}}}}
	c := dial(t, grpcadapter.NewServer(&fakeList{}, fakeGet{s: s}, &fakeFilters{}, quiet))
	resp, err := c.GetSpecies(context.Background(), &catalogv1.GetSpeciesRequest{Id: "t"})
	if err != nil {
		t.Fatal(err)
	}
	k := resp.GetSpecies().GetKids()
	if resp.GetSpecies().GetPrimaryBiome() != catalogv1.Biome_BIOME_CERRADO || k.GetDescription() != "D" || k.GetDidYouKnow() != "V" ||
		k.GetFacts()[0].GetSourceFact() != 1 {
		t.Fatalf("kids: %v", resp.GetSpecies())
	}
	s.Kids, s.PrimaryBiome = nil, ""
	c = dial(t, grpcadapter.NewServer(&fakeList{}, fakeGet{s: s}, &fakeFilters{}, quiet))
	resp, _ = c.GetSpecies(context.Background(), &catalogv1.GetSpeciesRequest{Id: "t"})
	if resp.GetSpecies().Kids != nil || resp.GetSpecies().GetPrimaryBiome() != catalogv1.Biome_BIOME_UNSPECIFIED {
		t.Fatalf("sem Kids, o campo deveria ficar ausente: %v", resp.GetSpecies())
	}
}
```

- no `TestListFilters`, troque o corpo por:

```go
	f := usecase.Filters{Biomes: []usecase.BiomeCount{{Biome: domain.BiomePampa, Count: 2}}, States: []usecase.StateCount{{State: "RS", Count: 2}},
		PrimaryBiomes: []usecase.BiomeCount{{Biome: domain.BiomeCerrado, Count: 4}}}
	filters := &fakeFilters{f: f}
	c := dial(t, grpcadapter.NewServer(&fakeList{}, fakeGet{}, filters, quiet))
	resp, err := c.ListFilters(context.Background(), &catalogv1.ListFiltersRequest{KidsOnly: true})
	if err != nil {
		t.Fatal(err)
	}
	if resp.GetBiomes()[0].GetBiome() != catalogv1.Biome_BIOME_PAMPA || resp.GetStates()[0].GetSpeciesCount() != 2 {
		t.Fatalf("filtros: %v", resp)
	}
	if !filters.in.KidsOnly || resp.GetPrimaryBiomeCounts()[0].GetBiome() != catalogv1.Biome_BIOME_CERRADO || resp.GetPrimaryBiomeCounts()[0].GetSpeciesCount() != 4 {
		t.Fatalf("kids_only=%v principais=%v", filters.in.KidsOnly, resp.GetPrimaryBiomeCounts())
	}
```

Run: `go test ./internal/adapter/grpc/`
Expected: FAIL na compilação (assinatura de `ListFiltersUseCase`).

- [ ] **Step 6: Implementar no gRPC**

Em `internal/adapter/grpc/server.go`:

- troque a interface `ListFiltersUseCase` por:

```go
type ListFiltersUseCase interface {
	Execute(context.Context, usecase.ListFiltersInput) (usecase.Filters, error)
}
```

- em `ListSpecies`, logo depois do `if !ok { ... }` do bioma:

```go
	primary, ok := biomeFromProto(req.GetPrimaryBiome())
	if !ok {
		return nil, status.Error(codes.InvalidArgument, "primary_biome: valor desconhecido")
	}
```

  e no `usecase.ListSpeciesInput{...}` acrescente `KidsOnly: req.GetKidsOnly(), PrimaryBiome: primary,`;

- troque `ListFilters` por:

```go
// ListFilters devolve as contagens por bioma, por UF e por bioma principal.
// kids_only = contar só as espécies com conteúdo Kids.
func (s *Server) ListFilters(ctx context.Context, req *catalogv1.ListFiltersRequest) (*catalogv1.ListFiltersResponse, error) {
	f, err := s.filters.Execute(ctx, usecase.ListFiltersInput{KidsOnly: req.GetKidsOnly()})
	if err != nil {
		return nil, s.toStatus(ctx, err)
	}
	resp := &catalogv1.ListFiltersResponse{}
	for _, b := range f.Biomes {
		resp.Biomes = append(resp.Biomes, &catalogv1.BiomeCount{Biome: biomeToProto[b.Biome], SpeciesCount: toInt32(b.Count)})
	}
	for _, st := range f.States {
		resp.States = append(resp.States, &catalogv1.StateCount{State: st.State, SpeciesCount: toInt32(st.Count)})
	}
	for _, b := range f.PrimaryBiomes {
		resp.PrimaryBiomeCounts = append(resp.PrimaryBiomeCounts, &catalogv1.BiomeCount{Biome: biomeToProto[b.Biome], SpeciesCount: toInt32(b.Count)})
	}
	return resp, nil
}
```

Em `internal/adapter/grpc/mapping.go`:

- em `summaryToProto`, acrescente `PrimaryBiome: biomeToProto[s.PrimaryBiome],` (um bioma vazio não está no mapa e vira UNSPECIFIED);
- em `speciesToProto`, acrescente `PrimaryBiome: biomeToProto[s.PrimaryBiome], Kids: kidsToProto(s.Kids),` no literal `out := &catalogv1.Species{...}`;
- no fim do arquivo:

```go
// kidsToProto monta o conteúdo Kids. nil (sem conteúdo Kids) vira nil, e o
// campo fica ausente na resposta: é assim que o BFF e o app sabem que a
// espécie não entra no Kids.
func kidsToProto(k *domain.KidsContent) *catalogv1.KidsContent {
	if k == nil {
		return nil
	}
	out := &catalogv1.KidsContent{Description: k.Description, DidYouKnow: k.DidYouKnow}
	for _, f := range k.Facts {
		out.Facts = append(out.Facts, &catalogv1.KidsFact{Text: f.Text, SourceFact: toInt32(f.SourceFact)})
	}
	return out
}
```

- [ ] **Step 7: Rodar a suíte inteira**

Run: `go build ./... && go test -race ./... 2>&1 | tail -30`
Expected: PASS em todos os pacotes (com Docker rodando para os de integração).

- [ ] **Step 8: Lint, commit, push e PR 2**

```bash
make lint
git add -A
git commit -m "feat: leitura do conteúdo Kids e filtros kids_only e primary_biome"
git push -u origin feat/kids-banco
gh pr create --base main --title "Frente B: conteúdo Kids e bioma principal no banco, no seed e na API" \
  --body "Migração 0005 (primary_biome, kids, media.peaks, featured_day), loader e seed com primary_biome: e kids:, detalhe e resumos com os campos novos, filtros kids_only e primary_biome e contagem por bioma principal. Depende do passarim-proto feat/kids-ave-do-dia (pseudo-versão até a tag v0.4.0). Spec: passarim-docs, 2026-10-28-passarim-frente-b-kids-design.md, seções 5.1 e 5.2."
```

Expected: `make lint` sem achados (se o `misspell` reclamar de uma palavra em português, acrescente-a às ignore-rules do `.golangci.yml`, como na frente A3).

---

### Task 5: Catalog — picos do canto

**Files:**
- Create: `internal/domain/peaks.go`, `internal/domain/peaks_test.go`, `internal/adapter/media/testdata/peaks_golden.json` (gerado pelo teste)
- Modify: `internal/domain/species.go` (`Audio.Peaks`), `internal/usecase/ingest/ports.go` (`AudioProcessor`), `internal/usecase/ingest/audio.go`, `internal/usecase/ingest/fakes_test.go`, `internal/adapter/media/ffmpeg.go`, `internal/adapter/postgres/queries_ingest.sql` (`InsertMedia`), `internal/adapter/postgres/ingest_repository.go`, `internal/adapter/postgres/repository.go`, `internal/adapter/grpc/mapping.go`
- Test: `internal/adapter/media/ffmpeg_test.go`, `internal/usecase/ingest/audio_test.go`, `internal/adapter/postgres/ingest_repository_test.go`, `internal/adapter/grpc/server_test.go`

**Interfaces:**
- Consumes: Task 2 (`media.peaks`).
- Produces: `domain.PeakCount = 64`, `domain.Peaks(samples []int16) []float32`, `domain.Audio.Peaks []float32`, `ingest.AudioProcessor.Peaks(ctx, aac []byte) ([]float32, error)`, `media.(*FFmpeg).Peaks`.

- [ ] **Step 1: Branch**

```bash
git switch -c feat/picos-canto
```

- [ ] **Step 2: Testes da função pura que falham**

`internal/domain/peaks_test.go`:

```go
// Testes do cálculo dos 64 picos do canto, com amostras feitas à mão.

package domain_test

import (
	"testing"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

// Uma rampa de 0 a 6399 em 6400 amostras: cada janela tem 100 amostras, e o
// pico da janela i é 100*i+99. Normalizado pelo maior (6399), a última vale 1.
func TestPeaks_Ramp(t *testing.T) {
	samples := make([]int16, 6400)
	for i := range samples {
		samples[i] = int16(i)
	}
	p := domain.Peaks(samples)
	if len(p) != domain.PeakCount || p[63] != 1 || p[0] != 0.015 {
		t.Fatalf("len=%d primeiro=%v último=%v", len(p), p[0], p[63])
	}
	for i := 1; i < len(p); i++ {
		if p[i] < p[i-1] {
			t.Fatalf("a rampa deveria crescer: p[%d]=%v < p[%d]=%v", i, p[i], i-1, p[i-1])
		}
	}
}

// O pico é o maior valor ABSOLUTO: uma amostra negativa grande conta.
func TestPeaks_NegativeCounts(t *testing.T) {
	samples := make([]int16, 128)
	samples[0] = -32768 // o menor int16; o absoluto dele não cabe em int16
	samples[127] = 16384
	p := domain.Peaks(samples)
	if p[0] != 1 || p[63] != 0.5 {
		t.Fatalf("primeiro=%v último=%v", p[0], p[63])
	}
}

// Silêncio total dá 64 zeros, sem divisão por zero.
func TestPeaks_Silence(t *testing.T) {
	p := domain.Peaks(make([]int16, 8000))
	if len(p) != domain.PeakCount {
		t.Fatalf("len=%d", len(p))
	}
	for _, v := range p {
		if v != 0 {
			t.Fatalf("silêncio deveria dar zeros, veio %v", p)
		}
	}
}

// Menos de 64 amostras: sem picos (lista vazia), sem erro.
func TestPeaks_TooShort(t *testing.T) {
	if p := domain.Peaks(make([]int16, 63)); len(p) != 0 {
		t.Fatalf("esperava vazio, veio %d", len(p))
	}
}

// 130 amostras: 63 janelas de 2 e a última com o resto (4). O pico que só
// está no fim cai na última janela.
func TestPeaks_LastWindowTakesRemainder(t *testing.T) {
	samples := make([]int16, 130)
	samples[129] = 1000
	samples[0] = 500
	p := domain.Peaks(samples)
	if p[63] != 1 || p[0] != 0.5 {
		t.Fatalf("primeiro=%v último=%v", p[0], p[63])
	}
}
```

Run: `go test ./internal/domain/ -run TestPeaks`
Expected: FAIL: `undefined: domain.Peaks`.

- [ ] **Step 3: Implementar a função pura e o campo**

`internal/domain/peaks.go`:

```go
// Picos do canto: 64 números de 0 a 1 que o app usa para desenhar a forma
// de onda real da gravação (frente B). A conta é uma regra pura: recebe as
// amostras do som e devolve os picos, sem ffmpeg nem banco, e por isso é
// testada com amostras feitas à mão.

package domain

import "math"

// PeakCount é quantos picos cada canto tem: uma barra por pico no player.
const PeakCount = 64

// Peaks divide as amostras em 64 janelas iguais (a última leva o resto) e
// guarda o maior valor absoluto de cada uma. Depois normaliza: divide tudo
// pelo maior dos 64, para a barra mais alta valer 1, e arredonda a 3 casas.
//
// Uma amostra é a "altura" do som num instante: o PCM de 16 bits vai de
// -32768 a 32767. O absoluto é calculado em int32 porque o de -32768 não
// cabe em int16.
//
// Silêncio total dá 64 zeros (sem divisão por zero). Com menos de 64
// amostras não há como formar as janelas: devolve nil, e o app mostra uma
// forma genérica.
func Peaks(samples []int16) []float32 {
	if len(samples) < PeakCount {
		return nil
	}
	size := len(samples) / PeakCount
	raw := make([]int32, PeakCount)
	var highest int32
	for i := range PeakCount {
		start, end := i*size, (i+1)*size
		if i == PeakCount-1 {
			end = len(samples)
		}
		for _, s := range samples[start:end] {
			v := int32(s)
			if v < 0 {
				v = -v
			}
			raw[i] = max(raw[i], v)
		}
		highest = max(highest, raw[i])
	}
	out := make([]float32, PeakCount)
	if highest == 0 {
		return out
	}
	for i, v := range raw {
		out[i] = float32(math.Round(float64(v)/float64(highest)*1000) / 1000)
	}
	return out
}
```

Em `internal/domain/species.go`, na struct `Audio`, depois de `Credit Credit`:

```go
	// Peaks são os 64 picos da forma de onda, de 0 a 1 (vazio = canto gravado
	// antes da frente B ou curto demais).
	Peaks []float32
```

Run: `go test ./internal/domain/`
Expected: PASS.

- [ ] **Step 4: Teste do ffmpeg que falha**

Em `internal/adapter/media/ffmpeg_test.go`, acrescente aos imports `"encoding/json"`, `"flag"`, `"math"` e `"path/filepath"`, e no fim do arquivo:

```go
// update regrava os golden files: go test ./internal/adapter/media/ -run TestAudioProcessor_Peaks -update
var update = flag.Bool("update", false, "regrava os golden files em testdata/")

// Um tom de 2 s cujo volume sobe e desce (o seno de 0 a π como envelope)
// vira AAC e depois os 64 picos, comparados com o golden file com folga de
// 0,01, para o teste não depender da versão do ffmpeg.
func TestAudioProcessor_Peaks(t *testing.T) {
	requireFFmpeg(t)
	wav, err := exec.Command("ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi",
		"-i", "aevalsrc=sin(2*PI*440*t)*sin(PI*t/2):d=2:s=44100", "-f", "wav", "pipe:1").Output()
	if err != nil {
		t.Fatal(err)
	}
	f := media.NewFFmpeg("ffmpeg")
	aac, err := f.ToAAC(context.Background(), wav, 30*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	got, err := f.Peaks(context.Background(), aac)
	if err != nil {
		t.Fatal(err)
	}
	golden := filepath.Join("testdata", "peaks_golden.json")
	if *update {
		b, _ := json.MarshalIndent(got, "", " ")
		if err := os.WriteFile(golden, b, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	raw, err := os.ReadFile(golden)
	if err != nil {
		t.Fatalf("golden ausente (rode com -update): %v", err)
	}
	var want []float32
	if err := json.Unmarshal(raw, &want); err != nil {
		t.Fatal(err)
	}
	if len(got) != len(want) {
		t.Fatalf("len=%d, golden=%d", len(got), len(want))
	}
	for i := range got {
		if math.Abs(float64(got[i]-want[i])) > 0.01 {
			t.Fatalf("pico %d: %v, golden %v", i, got[i], want[i])
		}
	}
	// O envelope sobe e desce: o meio é mais alto que as pontas.
	if got[32] < 0.9 || got[0] > 0.2 || got[63] > 0.2 {
		t.Fatalf("forma inesperada: início=%v meio=%v fim=%v", got[0], got[32], got[63])
	}
}

// Bytes que não são áudio dão erro do ffmpeg.
func TestAudioProcessor_PeaksRejectsGarbage(t *testing.T) {
	requireFFmpeg(t)
	if _, err := media.NewFFmpeg("ffmpeg").Peaks(context.Background(), []byte("não é áudio")); err == nil {
		t.Fatal("esperava erro")
	}
}
```

Run: `go test ./internal/adapter/media/ -run TestAudioProcessor_Peaks`
Expected: FAIL: `f.Peaks undefined`.

- [ ] **Step 5: Implementar no ffmpeg e na porta**

Em `internal/usecase/ingest/ports.go`, na interface `AudioProcessor`, depois de `ToAAC`:

```go
	// Peaks decodifica o AAC final e devolve os 64 picos da forma de onda
	// (vazio se o áudio for curto demais).
	Peaks(ctx context.Context, aac []byte) ([]float32, error)
```

Em `internal/adapter/media/ffmpeg.go`, acrescente `"encoding/binary"` e o import do domínio (`"github.com/velosobr/passarim-catalog/internal/domain"`), e depois de `ToAAC`:

```go
// peakSampleRate é a taxa usada só para calcular os picos: 8 mil amostras
// por segundo bastam para a forma de onda e deixam a conta leve.
const peakSampleRate = "8000"

// Peaks decodifica o AAC final (o mesmo arquivo que o app toca) para PCM e
// calcula os picos. PCM é o som "cru": uma sequência de amostras sem
// compressão. "-f s16le" pede amostras de 16 bits com sinal, em little
// endian (o byte menos significativo primeiro), e "-ac 1" mistura tudo num
// canal só (mono).
func (f *FFmpeg) Peaks(ctx context.Context, aac []byte) ([]float32, error) {
	pcm, err := f.run(ctx, aac, "-i", "pipe:0", "-ac", "1", "-ar", peakSampleRate, "-f", "s16le", "pipe:1")
	if err != nil {
		return nil, err
	}
	samples := make([]int16, len(pcm)/2)
	for i := range samples {
		samples[i] = int16(binary.LittleEndian.Uint16(pcm[2*i:])) //nolint:gosec // G115: reinterpreta os 16 bits, é o formato s16le
	}
	return domain.Peaks(samples), nil
}
```

Run: `go test ./internal/adapter/media/ -run TestAudioProcessor_Peaks -update && go test ./internal/adapter/media/`
Expected: o primeiro grava `testdata/peaks_golden.json`; o segundo PASS. Confira no arquivo que há 64 valores e que os do meio são próximos de 1.

- [ ] **Step 6: Testes do caso de uso e do repositório que falham**

Em `internal/usecase/ingest/fakes_test.go`, depois do `ToAAC` do `fakeAudio`:

```go
// Peaks devolve 64 picos fixos (0,5), ou erro para os bytes de failPeaks.
func (f fakeAudio) Peaks(_ context.Context, aac []byte) ([]float32, error) {
	if f.failPeaks[string(aac)] {
		return nil, errors.New("decodificação falhou")
	}
	p := make([]float32, 64)
	for i := range p {
		p[i] = 0.5
	}
	return p, nil
}
```

e troque `type fakeAudio struct{ failFor map[string]bool }` por:

```go
type fakeAudio struct {
	failFor   map[string]bool // ToAAC falha para estes bytes originais
	failPeaks map[string]bool // Peaks falha para estes bytes AAC
}
```

Em `internal/usecase/ingest/audio_test.go`, acrescente:

```go
// O canto gravado leva os 64 picos calculados do AAC.
func TestIngestAudio_StoresPeaks(t *testing.T) {
	cands := []ingest.AudioCandidate{rec("1", "A", "song", 20000)}
	uc, _, _, repo := newAudio(cands, fakeAudio{})
	if err := uc.Run(context.Background(), sabiaAudio); err != nil {
		t.Fatal(err)
	}
	if repo.audio == nil || len(repo.audio.Peaks) != 64 || repo.audio.Peaks[0] != 0.5 {
		t.Fatalf("picos: %+v", repo.audio)
	}
}

// Se os picos falham numa candidata, ela é tratada como a conversão que
// falhou: o caso de uso tenta a próxima.
func TestIngestAudio_PeaksFailureTriesNext(t *testing.T) {
	cands := []ingest.AudioCandidate{rec("1", "A", "song", 20000), rec("2", "B", "song", 20000)}
	bad := "aac:" + cands[0].URL // o fakeAudio.ToAAC devolve "aac:" + bytes originais (a URL)
	uc, dl, _, repo := newAudio(cands, fakeAudio{failPeaks: map[string]bool{bad: true}})
	if err := uc.Run(context.Background(), sabiaAudio); err != nil {
		t.Fatal(err)
	}
	if len(dl.requested) != 2 {
		t.Fatalf("deveria ter tentado as duas: %v", dl.requested)
	}
	if repo.audio == nil || repo.audio.Credit.SourceURL != cands[1].PageURL {
		t.Fatalf("deveria ter ficado a segunda gravação: %+v", repo.audio)
	}
}
```

Em `internal/adapter/postgres/ingest_repository_test.go`, acrescente:

```go
// O canto grava os picos e o detalhe os devolve; as fotos gravam a lista
// vazia (a coluna é NOT NULL), e uma troca de fotos não quebra.
func TestReplaceAudio_Peaks(t *testing.T) {
	repo, pool := newRepo(t)
	ctx := context.Background()
	seed(t, repo, sp("Turdus rufiventris", "Sabiá-laranjeira", nil))
	q := postgres.NewIngestRepository(pool)
	peaks := make([]float32, 64)
	peaks[10] = 1
	a := &domain.Audio{Key: "species/turdus-rufiventris/audio/1.aac", DurationMs: 3000, Peaks: peaks,
		Credit: domain.Credit{Author: "A", License: "CC-BY", Source: "xeno-canto", SourceURL: "https://xeno-canto.org/1"}}
	if err := q.ReplaceAudio(ctx, "turdus-rufiventris", a); err != nil {
		t.Fatal(err)
	}
	s, err := repo.GetSpecies(ctx, "turdus-rufiventris")
	if err != nil || s.Audio == nil || len(s.Audio.Peaks) != 64 || s.Audio.Peaks[10] != 1 {
		t.Fatalf("err=%v audio=%+v", err, s.Audio)
	}
}

func TestReplacePhotos_PeaksEmpty(t *testing.T) {
	repo, pool := newRepo(t)
	ctx := context.Background()
	seed(t, repo, sp("Turdus rufiventris", "Sabiá-laranjeira", nil))
	q := postgres.NewIngestRepository(pool)
	photo := domain.Photo{ThumbKey: "t.webp", MediumKey: "m.webp", LargeKey: "l.webp", Width: 10, Height: 10,
		Credit: domain.Credit{Author: "A", License: "CC-BY", Source: "inaturalist", SourceURL: "https://x"}}
	if err := q.ReplacePhotos(ctx, "turdus-rufiventris", []domain.Photo{photo}, domain.CurationReport{ModelVersion: "m@1"}); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = pool.QueryRow(ctx, `SELECT cardinality(peaks) FROM media WHERE kind = 'photo'`).Scan(&n)
	if n != 0 {
		t.Fatalf("foto deveria ter picos vazios, veio %d", n)
	}
}
```

Run: `go test ./internal/usecase/ingest/ ./internal/adapter/postgres/ -run 'Peaks'`
Expected: FAIL: `repo.audio.Peaks` vazio e `len(s.Audio.Peaks) = 0`.

- [ ] **Step 7: Implementar no caso de uso, no repositório e no gRPC**

Em `internal/usecase/ingest/audio.go`, troque o comentário e o corpo de `processOne` por:

```go
// processOne baixa, converte para AAC (cortando em MaxDuration), calcula os
// 64 picos do AAC final e grava. A duração gravada é limitada ao corte. Um
// erro nos picos conta como erro da candidata, e Run tenta a próxima.
func (u IngestAudio) processOne(ctx context.Context, job Job, a acceptedAudio) (*domain.Audio, error) {
	data, _, err := u.Downloader.Fetch(ctx, a.cand.URL, DownloadAudio)
	if err != nil {
		return nil, err
	}
	aac, err := u.Audio.ToAAC(ctx, data, u.MaxDuration)
	if err != nil {
		return nil, err
	}
	peaks, err := u.Audio.Peaks(ctx, aac)
	if err != nil {
		return nil, fmt.Errorf("calcular os picos: %w", err)
	}
	key := audioKey(job.SpeciesID, a.cand.SourceID)
	if err := u.Store.Put(ctx, key, "audio/aac", aac); err != nil {
		return nil, fmt.Errorf("gravar no storage: %w", err)
	}
	durationMs := a.cand.DurationMs
	if max := int(u.MaxDuration.Milliseconds()); durationMs > max {
		durationMs = max
	}
	return &domain.Audio{Key: key, DurationMs: durationMs, Peaks: peaks,
		Credit: domain.Credit{Author: a.cand.Author, License: string(a.license), Source: "xeno-canto", SourceURL: a.cand.PageURL}}, nil
}
```

Em `internal/adapter/postgres/queries_ingest.sql`, troque `InsertMedia` por:

```sql
-- name: InsertMedia :exec
-- Grava uma foto ou um canto, com o crédito. source_photo_id, category,
-- score e model_version são da curadoria (só fotos; NULL no canto). peaks
-- são os 64 picos do canto (lista vazia nas fotos).
INSERT INTO media (species_id, kind, position, thumb_key, medium_key, large_key, audio_key,
                   width, height, duration_ms, author, license, source, source_url,
                   source_photo_id, category, score, model_version, peaks)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19);
```

Run: `make generate`
Expected: `InsertMediaParams` ganha `Peaks []float32`.

Em `internal/adapter/postgres/ingest_repository.go`:

- em `ReplacePhotos`, no literal `sqlcgen.InsertMediaParams{...}` de cada foto, acrescente `Peaks: []float32{},` com o comentário `// NOT NULL: lista vazia, nunca nil (nil viraria NULL)` na linha de cima;
- em `ReplaceAudio`, no literal do canto, acrescente `Peaks: append([]float32{}, a.Peaks...),` com o comentário `// cópia nunca nil: o canto curto demais grava a lista vazia`.

Em `internal/adapter/postgres/repository.go`, no `case "audio":` de `GetSpecies`, troque a linha do `s.Audio = ...` por:

```go
				s.Audio = &domain.Audio{Key: m.AudioKey, DurationMs: int(m.DurationMs), Credit: credit, Peaks: m.Peaks}
```

Em `internal/adapter/grpc/mapping.go`, troque o bloco `if s.Audio != nil { ... }` de `speciesToProto` por:

```go
	if s.Audio != nil {
		out.Audio = audioToProto(*s.Audio)
	}
```

e acrescente no fim do arquivo:

```go
// audioToProto monta o canto com o crédito e os 64 picos (vazios num canto
// gravado antes da frente B).
func audioToProto(a domain.Audio) *catalogv1.Audio {
	return &catalogv1.Audio{Key: a.Key, DurationMs: toInt32(a.DurationMs), Credit: creditToProto(a.Credit), Peaks: a.Peaks}
}
```

Em `internal/adapter/grpc/server_test.go`, acrescente:

```go
// O canto chega ao proto com os picos.
func TestGetSpecies_AudioPeaks(t *testing.T) {
	s := domain.Species{ID: "t", Audio: &domain.Audio{Key: "a.aac", Peaks: []float32{0, 1}}}
	c := dial(t, grpcadapter.NewServer(&fakeList{}, fakeGet{s: s}, &fakeFilters{}, quiet))
	resp, err := c.GetSpecies(context.Background(), &catalogv1.GetSpeciesRequest{Id: "t"})
	if err != nil || len(resp.GetSpecies().GetAudio().GetPeaks()) != 2 || resp.GetSpecies().GetAudio().GetPeaks()[1] != 1 {
		t.Fatalf("err=%v audio=%v", err, resp.GetSpecies().GetAudio())
	}
}
```

- [ ] **Step 8: Rodar a suíte**

Run: `go build ./... && go test -race ./... 2>&1 | tail -30`
Expected: PASS em todos os pacotes.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: o worker calcula os 64 picos do canto e grava junto com o áudio"
```

---

### Task 6: Catalog — `requeue --source photos|audio`

**Files:**
- Create: `cmd/worker/requeue.go`, `cmd/worker/requeue_test.go`
- Modify: `cmd/worker/main.go`, `internal/adapter/postgres/queries_ingest.sql` (`RequeuePhotoJobs` → `RequeueJobs`), `internal/adapter/postgres/ingest_repository.go`, `README.md`
- Test: `internal/adapter/postgres/ingest_repository_test.go` (`TestRequeuePhotoJobs` → `TestRequeueJobs`)

**Interfaces:**
- Produces: `(*postgres.IngestRepository).RequeueJobs(ctx, source ingest.Source, speciesIDs []string) ([]string, error)`; `parseRequeueArgs(args []string) (ingest.Source, []string, error)` em `cmd/worker`.

- [ ] **Step 1: Testes que falham**

`cmd/worker/requeue_test.go`:

```go
// Testes da leitura dos argumentos do comando requeue.

package main

import (
	"fmt"
	"testing"

	"github.com/velosobr/passarim-catalog/internal/usecase/ingest"
)

func TestParseRequeueArgs(t *testing.T) {
	cases := []struct {
		args       []string
		source     ingest.Source
		ids, wantErr string
	}{
		{nil, ingest.SourceINaturalist, "[]", ""},
		{[]string{"crotophaga-ani"}, ingest.SourceINaturalist, "[crotophaga-ani]", ""},
		{[]string{"--source", "audio"}, ingest.SourceXenoCanto, "[]", ""},
		{[]string{"--source=photos", "a", "b"}, ingest.SourceINaturalist, "[a b]", ""},
		{[]string{"--source", "video"}, "", "", "--source deve ser photos ou audio"},
	}
	for _, tc := range cases {
		source, ids, err := parseRequeueArgs(tc.args)
		if tc.wantErr != "" {
			if err == nil || err.Error() != tc.wantErr {
				t.Fatalf("%v: esperava o erro %q, veio %v", tc.args, tc.wantErr, err)
			}
			continue
		}
		if err != nil || source != tc.source || fmt.Sprint(ids) != tc.ids {
			t.Fatalf("%v: fonte=%q ids=%v err=%v", tc.args, source, ids, err)
		}
	}
}
```

Em `internal/adapter/postgres/ingest_repository_test.go`, troque `TestRequeuePhotoJobs` inteiro por:

```go
// requeue: só as espécies dadas, ou todas; nunca um job rodando; e só a
// fonte pedida (fotos ou cantos).
func TestRequeueJobs(t *testing.T) {
	repo, pool := newRepo(t)
	ctx := context.Background()
	seed(t, repo, sp("Turdus rufiventris", "Sabiá-laranjeira", nil), sp("Pitangus sulphuratus", "Bem-te-vi", nil),
		sp("Crotophaga ani", "Anu-preto", nil))
	q := postgres.NewIngestRepository(pool)
	// Sem rodar o EnqueueMissing antes: o requeue cria os jobs que faltam.
	got, err := q.RequeueJobs(ctx, ingest.SourceINaturalist, []string{"crotophaga-ani"})
	if err != nil || fmt.Sprint(got) != "[crotophaga-ani]" {
		t.Fatalf("só a dada: %v %v", got, err)
	}
	_, _ = pool.Exec(ctx, `UPDATE ingestion_job SET status = 'done'`)
	_, _ = pool.Exec(ctx, `UPDATE ingestion_job SET status = 'running' WHERE species_id = 'pitangus-sulphuratus'`)
	got, _ = q.RequeueJobs(ctx, ingest.SourceINaturalist, nil)
	slices.Sort(got)
	if fmt.Sprint(got) != "[crotophaga-ani turdus-rufiventris]" {
		t.Fatalf("todas menos a que está rodando: %v", got)
	}
	var otherSources int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM ingestion_job WHERE source <> 'inaturalist'`).Scan(&otherSources)
	if otherSources != 0 {
		t.Fatalf("o requeue de fotos só cria e mexe em jobs de fotos, achou %d de outras fontes", otherSources)
	}

	got, err = q.RequeueJobs(ctx, ingest.SourceXenoCanto, nil)
	slices.Sort(got)
	if err != nil || fmt.Sprint(got) != "[crotophaga-ani pitangus-sulphuratus turdus-rufiventris]" {
		t.Fatalf("cantos: %v %v", got, err)
	}
	var photosPending int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM ingestion_job WHERE source = 'inaturalist' AND status = 'pending'`).Scan(&photosPending)
	if photosPending != 2 {
		t.Fatalf("o requeue de cantos não mexe nas fotos: %d pendentes", photosPending)
	}
}
```

(Se `ingest` ainda não estiver importado no arquivo, acrescente `"github.com/velosobr/passarim-catalog/internal/usecase/ingest"`.)

Run: `go test ./cmd/worker/ ./internal/adapter/postgres/ -run 'TestParseRequeueArgs|TestRequeueJobs'`
Expected: FAIL na compilação (`undefined: parseRequeueArgs`, `q.RequeueJobs undefined`).

- [ ] **Step 2: Implementar a consulta e o repositório**

Em `internal/adapter/postgres/queries_ingest.sql`, troque `RequeuePhotoJobs` por:

```sql
-- name: RequeueJobs :many
-- Comando "worker requeue": devolve à fila, agora, os jobs da fonte dada
-- ('inaturalist' para fotos, 'xenocanto' para cantos) das espécies dadas
-- (lista vazia = todas), sem esperar os 30 dias do refresh. Zera tentativas
-- e adiamentos. Não mexe em job 'running': outro worker está com ele, e
-- reenfileirar faria dois pegarem a mesma espécie.
-- cardinality(lista) é o tamanho da lista; "= ANY(lista)" é "está na lista".
UPDATE ingestion_job SET status = 'pending', attempts = 0, deferrals = 0, last_error = '',
    next_run_at = now(), updated_at = now()
WHERE source = sqlc.arg('source')::text AND status <> 'running'
  AND (cardinality(sqlc.arg('species_ids')::text[]) = 0 OR species_id = ANY(sqlc.arg('species_ids')::text[]))
RETURNING species_id;
```

Run: `make generate`

Em `internal/adapter/postgres/ingest_repository.go`, troque `RequeuePhotoJobs` por:

```go
// RequeueJobs reenfileira os jobs de uma fonte (fotos ou cantos) das
// espécies dadas (nil = todas). Antes cria os jobs dessa fonte que faltam,
// para o comando funcionar mesmo num banco em que o worker ainda não rodou.
// Devolve as espécies reenfileiradas; quem chama compara com as pedidas.
func (r *IngestRepository) RequeueJobs(ctx context.Context, source ingest.Source, speciesIDs []string) ([]string, error) {
	if err := r.q.EnqueueMissingJobs(ctx, []string{string(source)}); err != nil {
		return nil, fmt.Errorf("enfileirar: %w", err)
	}
	// nil viraria NULL, e cardinality(NULL) é NULL: mandamos uma lista vazia de verdade.
	return r.q.RequeueJobs(ctx, sqlcgen.RequeueJobsParams{Source: string(source), SpeciesIds: append([]string{}, speciesIDs...)})
}
```

- [ ] **Step 3: Implementar o comando**

`cmd/worker/requeue.go`:

```go
// Leitura dos argumentos do comando "worker requeue". Fica num arquivo
// próprio para ser testada sem banco.

package main

import (
	"errors"
	"flag"
	"io"

	"github.com/velosobr/passarim-catalog/internal/usecase/ingest"
)

// parseRequeueArgs lê "[--source photos|audio] [species-id...]". O padrão é
// photos, para o comando que o README já documenta continuar igual. O
// pacote flag para de ler opções no primeiro argumento que não começa com
// "-": por isso o --source vem antes dos ids.
func parseRequeueArgs(args []string) (ingest.Source, []string, error) {
	fs := flag.NewFlagSet("requeue", flag.ContinueOnError)
	fs.SetOutput(io.Discard) // o erro volta para quem chamou, sem imprimir a ajuda
	name := fs.String("source", "photos", "photos ou audio")
	if err := fs.Parse(args); err != nil {
		return "", nil, err
	}
	sources := map[string]ingest.Source{"photos": ingest.SourceINaturalist, "audio": ingest.SourceXenoCanto}
	source, ok := sources[*name]
	if !ok {
		return "", nil, errors.New("--source deve ser photos ou audio")
	}
	return source, fs.Args(), nil
}
```

Em `cmd/worker/main.go`:

- no comentário do pacote, troque o parágrafo dos comandos por:

```go
// Dois comandos ajudam na manutenção: "requeue [--source photos|audio]
// [species-id...]" reenfileira os jobs de fotos (padrão) ou de cantos, e
// "curation-report" imprime o relatório da última curadoria de cada espécie.
```

- no comentário de `main`, troque a linha do requeue por `//   - "requeue [--source photos|audio] [species-id...]": reenfileira as fotos (padrão) ou os cantos das espécies dadas (ou de todas);` e a linha do exemplo por `// No compose: docker compose run --rm catalog-worker requeue --source audio crotophaga-ani`;
- troque a função `requeue` inteira por:

```go
// requeue reenfileira os jobs de fotos ou de cantos e diz quantos. Se algum
// id pedido não voltou (não existe ou está rodando agora), sai com erro
// citando os ids.
func requeue(args []string) error {
	source, speciesIDs, err := parseRequeueArgs(args)
	if err != nil {
		return err
	}
	ctx := context.Background()
	repo, closeDB, err := openRepo(ctx)
	if err != nil {
		return err
	}
	defer closeDB()
	done, err := repo.RequeueJobs(ctx, source, speciesIDs)
	if err != nil {
		return err
	}
	fmt.Printf("%d jobs de %s reenfileirados\n", len(done), source)
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
```

Em `README.md`, na seção "Curadoria de fotos", troque a linha do `requeue` por:

```markdown
- `docker compose run --rm catalog-worker requeue [--source photos|audio] [species-id...]` reenfileira as fotos (padrão) ou os cantos (todas as espécies, sem ids). O `--source` vem antes dos ids.
```

E na seção "Worker de ingestão", depois do item "Licenças", acrescente:

```markdown
- **Forma de onda:** junto com o canto, o worker grava os 64 picos do AAC final (decodificado pelo ffmpeg), de 0 a 1. Para calcular nos cantos antigos: `requeue --source audio`.
```

- [ ] **Step 4: Rodar a suíte, commit, push e PR 3**

Run: `go build ./... && go test -race ./... 2>&1 | tail -30 && make lint`
Expected: PASS e lint sem achados.

```bash
git add -A
git commit -m "feat: requeue --source photos|audio, para reprocessar os cantos"
git push -u origin feat/picos-canto
gh pr create --base feat/kids-banco --title "Frente B: picos do canto e requeue --source" \
  --body "O worker decodifica o AAC final com o ffmpeg, calcula 64 picos (função pura no domínio, golden file no teste com ffmpeg) e grava em media.peaks. O requeue ganha --source photos|audio. Empilhado sobre o PR do feat/kids-banco. Spec: seção 4."
```

---

### Task 7: Catalog — "Ave do dia": rodízio, caso de uso e repositório

**Files:**
- Create: `internal/domain/featured.go`, `internal/domain/featured_test.go`, `internal/usecase/featured.go`, `internal/usecase/featured_test.go`
- Modify: `internal/usecase/ports.go` (`FeaturedRepository`), `internal/adapter/postgres/queries.sql` (4 consultas novas), `internal/adapter/postgres/repository.go`
- Test: `internal/adapter/postgres/featured_test.go` (novo)

**Interfaces:**
- Consumes: Task 2 (`featured_day`), Task 5 (`media.peaks`, para o áudio da resposta).
- Produces:
  - `domain.FeaturedDay{Day string; SpeciesID string; Cycle int}` (Day no formato `AAAA-MM-DD`);
  - `domain.PickFeatured(day string, eligible []string, cycleRows []domain.FeaturedDay) (speciesID string, cycle int, ok bool)`;
  - `usecase.FeaturedRepository` com `FeaturedOn(ctx, day string) (string, bool, error)`, `FeaturedCycle(ctx, day string) ([]domain.FeaturedDay, error)`, `FeaturedEligible(ctx) ([]string, error)`, `SaveFeatured(ctx, domain.FeaturedDay) error`, `GetSpecies(ctx, id string) (domain.Species, error)`;
  - `usecase.GetFeatured{Repo FeaturedRepository; Now func() time.Time}`, `Execute(ctx, date string) (usecase.FeaturedOutput, error)`, `usecase.FeaturedOutput{Species domain.SpeciesSummary; Audio *domain.Audio}`.

- [ ] **Step 1: Branch**

```bash
git switch -c feat/ave-do-dia
```

- [ ] **Step 2: Testes do rodízio que falham**

`internal/domain/featured_test.go`:

```go
// Testes do rodízio da "Ave do dia", só com listas em memória.

package domain_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

// dayAfter devolve o dia n dias depois de 2026-11-01, no formato AAAA-MM-DD.
func dayAfter(n int) string {
	return time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC).AddDate(0, 0, n).Format(time.DateOnly)
}

// simulate roda o rodízio por n dias seguidos, gravando cada escolha como o
// caso de uso faz, e devolve as linhas.
func simulate(t *testing.T, eligible []string, n int) []domain.FeaturedDay {
	t.Helper()
	var rows []domain.FeaturedDay
	for i := range n {
		day := dayAfter(i)
		id, cycle, ok := domain.PickFeatured(day, eligible, rows)
		if !ok {
			t.Fatalf("dia %s sem escolha", day)
		}
		rows = append(rows, domain.FeaturedDay{Day: day, SpeciesID: id, Cycle: cycle})
	}
	return rows
}

// Em cada ciclo, todas as elegíveis aparecem uma vez, sem repetir.
func TestPickFeatured_CycleWithoutRepetition(t *testing.T) {
	eligible := []string{"a", "b", "c", "d", "e"}
	rows := simulate(t, eligible, 15)
	for c := range 3 {
		seen := map[string]bool{}
		for _, r := range rows[c*5 : c*5+5] {
			if r.Cycle != c+1 || seen[r.SpeciesID] {
				t.Fatalf("ciclo %d com repetição ou número errado: %+v", c+1, rows[c*5:c*5+5])
			}
			seen[r.SpeciesID] = true
		}
	}
}

// Na virada de ciclo, a ave de ontem não volta no primeiro dia do ciclo novo.
func TestPickFeatured_NewCycleSkipsYesterday(t *testing.T) {
	for _, eligible := range [][]string{{"a", "b"}, {"a", "b", "c"}, {"a", "b", "c", "d", "e", "f", "g"}} {
		rows := simulate(t, eligible, 10*len(eligible))
		for i := 1; i < len(rows); i++ {
			if rows[i].SpeciesID == rows[i-1].SpeciesID {
				t.Fatalf("%v: a mesma ave em %s e %s", eligible, rows[i-1].Day, rows[i].Day)
			}
		}
	}
}

// Com uma elegível só, ela se repete (não há outra escolha).
func TestPickFeatured_SingleEligibleRepeats(t *testing.T) {
	rows := simulate(t, []string{"a"}, 3)
	if rows[2].SpeciesID != "a" || rows[2].Cycle != 3 {
		t.Fatalf("linhas: %+v", rows)
	}
}

// Uma ave nova entra no ciclo em andamento; a que saiu deixa de ser escolhida.
func TestPickFeatured_EligibleSetChanges(t *testing.T) {
	rows := simulate(t, []string{"a", "b", "c"}, 1)
	used := rows[0].SpeciesID
	var others []string
	for _, id := range []string{"a", "b", "c"} {
		if id != used {
			others = append(others, id)
		}
	}
	// Sai uma das que faltavam, entra "z": o ciclo 1 termina com a outra e "z".
	eligible := []string{others[0], "z"}
	if used != "z" {
		eligible = append(eligible, used)
	}
	for i := 1; i <= 2; i++ {
		id, cycle, _ := domain.PickFeatured(dayAfter(i), eligible, rows)
		if cycle != 1 || id == used || id == others[1] {
			t.Fatalf("dia %d: %s no ciclo %d (usada=%s, removida=%s)", i, id, cycle, used, others[1])
		}
		rows = append(rows, domain.FeaturedDay{Day: dayAfter(i), SpeciesID: id, Cycle: cycle})
	}
	if rows[1].SpeciesID == rows[2].SpeciesID {
		t.Fatalf("repetiu dentro do ciclo: %+v", rows)
	}
}

// Amanhã calculado antes de hoje: hoje não repete a ave de amanhã.
func TestPickFeatured_TomorrowBeforeToday(t *testing.T) {
	eligible := []string{"a", "b", "c", "d"}
	rows := simulate(t, eligible, 1)
	tomorrowID, cycle, _ := domain.PickFeatured(dayAfter(2), eligible, rows)
	rows = append(rows, domain.FeaturedDay{Day: dayAfter(2), SpeciesID: tomorrowID, Cycle: cycle})
	todayID, _, _ := domain.PickFeatured(dayAfter(1), eligible, rows)
	if todayID == tomorrowID || todayID == rows[0].SpeciesID {
		t.Fatalf("hoje=%s amanhã=%s ontem=%s", todayID, tomorrowID, rows[0].SpeciesID)
	}
}

// Sem nenhuma elegível, não há escolha.
func TestPickFeatured_NoEligible(t *testing.T) {
	if _, _, ok := domain.PickFeatured(dayAfter(0), nil, nil); ok {
		t.Fatal("esperava ok=false")
	}
}

// A escolha não depende da ordem em que as elegíveis chegam.
func TestPickFeatured_Deterministic(t *testing.T) {
	a, _, _ := domain.PickFeatured("2026-11-05", []string{"c", "a", "b"}, nil)
	b, _, _ := domain.PickFeatured("2026-11-05", []string{"b", "c", "a"}, nil)
	if a != b {
		t.Fatalf("mesma data, escolhas diferentes: %s %s", a, b)
	}
	if fmt.Sprint(a) == "" {
		t.Fatal("escolha vazia")
	}
}
```

Run: `go test ./internal/domain/ -run TestPickFeatured`
Expected: FAIL: `undefined: domain.PickFeatured`.

- [ ] **Step 3: Implementar o rodízio**

`internal/domain/featured.go`:

```go
// "Ave do dia" (frente B): a regra pura do rodízio. A mesma ave aparece nas
// duas jornadas e o dia inteiro; dentro de um ciclo, nenhuma ave se repete
// antes de todas as elegíveis aparecerem uma vez. O caso de uso grava cada
// escolha na tabela featured_day; aqui só a conta, testada com listas.

package domain

import (
	"hash/fnv"
	"slices"
)

// FeaturedDay é uma linha da tabela featured_day. Day está no formato
// AAAA-MM-DD: nesse formato, comparar os textos é comparar as datas.
type FeaturedDay struct {
	Day       string
	SpeciesID string
	Cycle     int
}

// PickFeatured escolhe a ave do dia `day`.
//
//   - eligible são os ids das espécies que podem ser escolhidas hoje.
//   - cycleRows são as linhas do ciclo da linha mais recente antes de `day`
//     (o repositório devolve só esse ciclo; pode haver dias depois de `day`,
//     se amanhã foi pedido antes de hoje).
//
// A regra:
//  1. prev = a linha mais recente com Day < day. Sem nenhuma, é o ciclo 1.
//  2. As "usadas" são as aves das linhas do ciclo de prev com Day <> day.
//     Contar também os dias depois de `day` evita repetir a ave de amanhã.
//  3. Restantes = elegíveis menos usadas, em ordem alfabética.
//  4. Sem restantes, começa um ciclo novo com todas as elegíveis, menos a
//     ave de prev se houver mais de uma elegível (senão a última ave de um
//     ciclo voltaria no primeiro dia do seguinte).
//  5. A escolhida é restantes[hash(day) % len(restantes)].
//
// ok=false quando não há nenhuma elegível.
func PickFeatured(day string, eligible []string, cycleRows []FeaturedDay) (speciesID string, cycle int, ok bool) {
	if len(eligible) == 0 {
		return "", 0, false
	}
	sorted := slices.Clone(eligible)
	slices.Sort(sorted)

	var prev *FeaturedDay
	for i := range cycleRows {
		r := &cycleRows[i]
		if r.Day < day && (prev == nil || r.Day > prev.Day) {
			prev = r
		}
	}
	cycle = 1
	used := map[string]bool{}
	if prev != nil {
		cycle = prev.Cycle
		for _, r := range cycleRows {
			if r.Cycle == prev.Cycle && r.Day != day {
				used[r.SpeciesID] = true
			}
		}
	}

	remaining := without(sorted, func(id string) bool { return used[id] })
	if len(remaining) == 0 {
		cycle++
		remaining = sorted
		if prev != nil && len(sorted) > 1 {
			remaining = without(sorted, func(id string) bool { return id == prev.SpeciesID })
		}
	}
	return remaining[dayHash(day)%uint64(len(remaining))], cycle, true
}

// without devolve os ids para os quais skip é falso, na mesma ordem.
func without(ids []string, skip func(string) bool) []string {
	var out []string
	for _, id := range ids {
		if !skip(id) {
			out = append(out, id)
		}
	}
	return out
}

// dayHash é o FNV-1a de 64 bits do texto da data. FNV é uma função de hash
// simples e rápida: o mesmo texto dá sempre o mesmo número, e datas
// vizinhas dão números bem diferentes, o que espalha as escolhas.
func dayHash(day string) uint64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte(day)) // Write de um hash nunca falha
	return h.Sum64()
}
```

Run: `go test ./internal/domain/`
Expected: PASS.

- [ ] **Step 4: Testes do caso de uso que falham**

`internal/usecase/featured_test.go`:

```go
// Testes do caso de uso da "Ave do dia", com um repositório falso em
// memória e um relógio fixo.

package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/velosobr/passarim-catalog/internal/domain"
	"github.com/velosobr/passarim-catalog/internal/usecase"
)

// fakeFeatured imita as tabelas: as linhas gravadas, as elegíveis e as espécies.
type fakeFeatured struct {
	rows     []domain.FeaturedDay
	eligible []string
	species  map[string]domain.Species
	saves    int
}

func (f *fakeFeatured) FeaturedOn(_ context.Context, day string) (string, bool, error) {
	for _, r := range f.rows {
		if r.Day == day {
			return r.SpeciesID, true, nil
		}
	}
	return "", false, nil
}

func (f *fakeFeatured) FeaturedCycle(_ context.Context, _ string) ([]domain.FeaturedDay, error) {
	return f.rows, nil // o domínio filtra pelo ciclo; o fake devolve tudo
}

func (f *fakeFeatured) FeaturedEligible(context.Context) ([]string, error) { return f.eligible, nil }

// SaveFeatured imita o ON CONFLICT DO NOTHING: um dia já gravado fica como está.
func (f *fakeFeatured) SaveFeatured(_ context.Context, d domain.FeaturedDay) error {
	f.saves++
	for _, r := range f.rows {
		if r.Day == d.Day {
			return nil
		}
	}
	f.rows = append(f.rows, d)
	return nil
}

func (f *fakeFeatured) GetSpecies(_ context.Context, id string) (domain.Species, error) {
	if s, ok := f.species[id]; ok {
		return s, nil
	}
	return domain.Species{}, domain.ErrNotFound
}

// saoPaulo é o fuso da "Ave do dia".
var saoPaulo, _ = time.LoadLocation("America/Sao_Paulo")

// at devolve um relógio parado no instante dado, no fuso de São Paulo.
func at(year int, month time.Month, day, hour, minute, sec int) func() time.Time {
	return func() time.Time { return time.Date(year, month, day, hour, minute, sec, 0, saoPaulo) }
}

func newFeatured() *fakeFeatured {
	sabia := domain.Species{ID: "turdus-rufiventris", CommonNamePt: "Sabiá", PrimaryBiome: domain.BiomeMataAtlantica,
		Photos: []domain.Photo{{ThumbKey: "t.webp"}}, Audio: &domain.Audio{Key: "a.aac", Peaks: []float32{1}}}
	anu := domain.Species{ID: "crotophaga-ani", CommonNamePt: "Anu-preto", Photos: []domain.Photo{{ThumbKey: "anu.webp"}}}
	return &fakeFeatured{eligible: []string{"turdus-rufiventris", "crotophaga-ani"},
		species: map[string]domain.Species{sabia.ID: sabia, anu.ID: anu}}
}

// A primeira chamada do dia escolhe e grava; as outras leem a mesma ave,
// mesmo depois de ela deixar de ser elegível.
func TestGetFeatured_StableDuringTheDay(t *testing.T) {
	repo := newFeatured()
	uc := usecase.GetFeatured{Repo: repo, Now: at(2026, 11, 5, 9, 0, 0)}
	first, err := uc.Execute(context.Background(), "2026-11-05")
	if err != nil {
		t.Fatal(err)
	}
	repo.eligible = []string{"outra"}
	again, err := uc.Execute(context.Background(), "2026-11-05")
	if err != nil || again.Species.ID != first.Species.ID || repo.saves != 1 {
		t.Fatalf("primeira=%s depois=%s err=%v gravações=%d", first.Species.ID, again.Species.ID, err, repo.saves)
	}
}

// A resposta traz o resumo (com a miniatura da foto principal e o bioma
// principal) e o canto com os picos.
func TestGetFeatured_ResponseShape(t *testing.T) {
	repo := newFeatured()
	repo.eligible = []string{"turdus-rufiventris"}
	out, err := usecase.GetFeatured{Repo: repo, Now: at(2026, 11, 5, 9, 0, 0)}.Execute(context.Background(), "2026-11-05")
	if err != nil {
		t.Fatal(err)
	}
	if out.Species.ThumbnailKey != "t.webp" || out.Species.PrimaryBiome != domain.BiomeMataAtlantica || out.Audio == nil || out.Audio.Peaks[0] != 1 {
		t.Fatalf("saída: %+v audio=%+v", out.Species, out.Audio)
	}
}

// Às 23h59 em São Paulo o catalog aceita o dia seguinte (o relógio do BFF
// pode já ter virado); dois dias à frente, não.
func TestGetFeatured_AcceptsTomorrowNearMidnight(t *testing.T) {
	uc := usecase.GetFeatured{Repo: newFeatured(), Now: at(2026, 11, 5, 23, 59, 59)}
	if _, err := uc.Execute(context.Background(), "2026-11-06"); err != nil {
		t.Fatalf("amanhã deveria passar: %v", err)
	}
	if _, err := uc.Execute(context.Background(), "2026-11-04"); err != nil {
		t.Fatalf("ontem deveria passar: %v", err)
	}
	var inv *domain.InvalidArgumentError
	if _, err := uc.Execute(context.Background(), "2026-11-07"); !errors.As(err, &inv) || inv.Field != "date" {
		t.Fatalf("dois dias à frente deveria ser inválido, veio %v", err)
	}
}

// O "hoje" é o de São Paulo, não o de UTC: às 22h de São Paulo já é o dia
// seguinte em UTC, mas o dia seguinte +1 continua fora.
func TestGetFeatured_UsesSaoPauloDay(t *testing.T) {
	utcNextDay := func() time.Time { return time.Date(2026, 11, 6, 1, 0, 0, 0, time.UTC) } // 22h do dia 5 em São Paulo
	uc := usecase.GetFeatured{Repo: newFeatured(), Now: utcNextDay}
	if _, err := uc.Execute(context.Background(), "2026-11-04"); err != nil {
		t.Fatalf("ontem em São Paulo (dia 4) deveria passar: %v", err)
	}
	var inv *domain.InvalidArgumentError
	if _, err := uc.Execute(context.Background(), "2026-11-07"); !errors.As(err, &inv) {
		t.Fatalf("dia 7 deveria ser inválido em São Paulo, veio %v", err)
	}
}

func TestGetFeatured_BadFormatIsInvalid(t *testing.T) {
	uc := usecase.GetFeatured{Repo: newFeatured(), Now: at(2026, 11, 5, 9, 0, 0)}
	for _, date := range []string{"", "05/11/2026", "2026-11-5", "2026-13-01"} {
		var inv *domain.InvalidArgumentError
		if _, err := uc.Execute(context.Background(), date); !errors.As(err, &inv) {
			t.Fatalf("%q deveria ser inválido, veio %v", date, err)
		}
	}
}

func TestGetFeatured_NoEligibleIsNotFound(t *testing.T) {
	repo := newFeatured()
	repo.eligible = nil
	_, err := usecase.GetFeatured{Repo: repo, Now: at(2026, 11, 5, 9, 0, 0)}.Execute(context.Background(), "2026-11-05")
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("esperava ErrNotFound, veio %v", err)
	}
}
```

Run: `go test ./internal/usecase/ -run TestGetFeatured`
Expected: FAIL: `undefined: usecase.GetFeatured`.

- [ ] **Step 5: Implementar a porta e o caso de uso**

Em `internal/usecase/ports.go`, no fim do arquivo:

```go
// FeaturedRepository é a porta da "Ave do dia": a tabela featured_day, a
// lista das elegíveis e a leitura da espécie escolhida.
type FeaturedRepository interface {
	// FeaturedOn devolve a ave já gravada para o dia (found=false se não há).
	FeaturedOn(ctx context.Context, day string) (speciesID string, found bool, err error)
	// FeaturedCycle devolve as linhas do ciclo da linha mais recente antes do dia.
	FeaturedCycle(ctx context.Context, day string) ([]domain.FeaturedDay, error)
	// FeaturedEligible devolve os ids das espécies que podem ser escolhidas:
	// com conteúdo Kids, foto principal de ave sozinha (ou do override) e canto.
	FeaturedEligible(ctx context.Context) ([]string, error)
	// SaveFeatured grava a escolha; um dia já gravado fica como está.
	SaveFeatured(ctx context.Context, d domain.FeaturedDay) error
	// GetSpecies devolve domain.ErrNotFound se o id não existir.
	GetSpecies(ctx context.Context, id string) (domain.Species, error)
}
```

`internal/usecase/featured.go`:

```go
// Caso de uso da "Ave do dia" (frente B): valida a data, devolve a ave já
// gravada para o dia ou escolhe uma pelo rodízio do domínio e grava.

package usecase

import (
	"context"
	"errors"
	"fmt"
	"time"
	_ "time/tzdata" // embute o banco de fusos: a imagem do catalog pode não ter o do sistema

	"github.com/velosobr/passarim-catalog/internal/domain"
)

// saoPaulo é o fuso em que o "dia" da Ave do dia é contado. LoadLocation lê
// o banco de fusos horários (com as regras de horário de verão, se voltarem);
// o import de time/tzdata garante que ele exista em qualquer imagem.
var saoPaulo = mustLoadLocation("America/Sao_Paulo")

func mustLoadLocation(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		panic(err) // com time/tzdata embutido, só acontece se o nome estiver errado
	}
	return loc
}

// FeaturedOutput é a ave do dia: o resumo do card e o canto (nil se a ave
// perdeu o canto depois de ser escolhida).
type FeaturedOutput struct {
	Species domain.SpeciesSummary
	Audio   *domain.Audio
}

// GetFeatured escolhe a "Ave do dia". Now é o relógio, injetado para os
// testes pararem o tempo onde quiserem (em produção, time.Now).
type GetFeatured struct {
	Repo FeaturedRepository
	Now  func() time.Time
}

// Execute aceita só ontem, hoje e amanhã no fuso de São Paulo. A folga cobre
// relógios um pouco diferentes entre o BFF (que calcula a data) e o catalog
// na virada do dia; recusar o resto impede gravar dias arbitrários.
//
// Se o dia já tem ave, devolve a mesma (é o que deixa a ave estável o dia
// todo, mesmo que ela deixe de ser elegível). Senão, escolhe pelo rodízio e
// grava. Duas réplicas podem escolher ao mesmo tempo: a gravação ignora a
// segunda (ON CONFLICT DO NOTHING) e as duas releem a linha que ficou.
func (u GetFeatured) Execute(ctx context.Context, date string) (FeaturedOutput, error) {
	day, err := time.ParseInLocation(time.DateOnly, date, saoPaulo)
	if err != nil || day.Format(time.DateOnly) != date {
		return FeaturedOutput{}, &domain.InvalidArgumentError{Field: "date", Reason: "use o formato AAAA-MM-DD"}
	}
	now := u.Now().In(saoPaulo)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, saoPaulo)
	if day.Before(today.AddDate(0, 0, -1)) || day.After(today.AddDate(0, 0, 1)) {
		return FeaturedOutput{}, &domain.InvalidArgumentError{Field: "date", Reason: "só ontem, hoje ou amanhã no fuso de São Paulo"}
	}

	id, found, err := u.Repo.FeaturedOn(ctx, date)
	if err != nil {
		return FeaturedOutput{}, fmt.Errorf("ler a ave do dia: %w", err)
	}
	if !found {
		if id, err = u.pick(ctx, date); err != nil {
			return FeaturedOutput{}, err
		}
	}
	s, err := u.Repo.GetSpecies(ctx, id)
	if err != nil {
		return FeaturedOutput{}, err
	}
	out := FeaturedOutput{Species: domain.SpeciesSummary{ID: s.ID, ScientificName: s.ScientificName, CommonNamePt: s.CommonNamePt,
		ConservationStatus: s.ConservationStatus, PrimaryBiome: s.PrimaryBiome}, Audio: s.Audio}
	if len(s.Photos) > 0 {
		out.Species.ThumbnailKey = s.Photos[0].ThumbKey // a foto 0 é a principal
	}
	return out, nil
}

// pick roda o rodízio, grava a escolha e relê a linha do dia (que pode ser
// a de outra réplica que gravou primeiro).
func (u GetFeatured) pick(ctx context.Context, date string) (string, error) {
	eligible, err := u.Repo.FeaturedEligible(ctx)
	if err != nil {
		return "", fmt.Errorf("listar elegíveis: %w", err)
	}
	rows, err := u.Repo.FeaturedCycle(ctx, date)
	if err != nil {
		return "", fmt.Errorf("ler o ciclo: %w", err)
	}
	id, cycle, ok := domain.PickFeatured(date, eligible, rows)
	if !ok {
		return "", domain.ErrNotFound
	}
	if err := u.Repo.SaveFeatured(ctx, domain.FeaturedDay{Day: date, SpeciesID: id, Cycle: cycle}); err != nil {
		return "", fmt.Errorf("gravar a ave do dia: %w", err)
	}
	saved, found, err := u.Repo.FeaturedOn(ctx, date)
	if err != nil {
		return "", fmt.Errorf("reler a ave do dia: %w", err)
	}
	if !found {
		return "", errors.New("a ave do dia sumiu logo depois de gravada")
	}
	return saved, nil
}
```

Run: `go test ./internal/usecase/`
Expected: PASS.

- [ ] **Step 6: Testes do repositório que falham**

`internal/adapter/postgres/featured_test.go`:

```go
// Testes de integração da "Ave do dia" contra um PostgreSQL de verdade: a
// consulta das elegíveis, a tabela featured_day e duas chamadas ao mesmo
// tempo.

package postgres_test

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/velosobr/passarim-catalog/internal/domain"
	"github.com/velosobr/passarim-catalog/internal/usecase"
)

// addMedia grava a foto principal (com a categoria dada; "" = NULL, como as
// fotos de antes da 0004) e, se audio, um canto.
func addMedia(t *testing.T, pool *pgxpool.Pool, id, category, sourcePhotoID string, audio bool) {
	t.Helper()
	ctx := context.Background()
	_, err := pool.Exec(ctx, `INSERT INTO media (species_id, kind, position, thumb_key, author, license, source, source_url, category, source_photo_id)
		VALUES ($1, 'photo', 0, 't.webp', 'A', 'CC-BY', 'inaturalist', 'https://x', NULLIF($2, ''), NULLIF($3, ''))`, id, category, sourcePhotoID)
	if err != nil {
		t.Fatal(err)
	}
	if audio {
		_, err = pool.Exec(ctx, `INSERT INTO media (species_id, kind, position, audio_key, author, license, source, source_url)
			VALUES ($1, 'audio', 0, 'a.aac', 'A', 'CC-BY', 'xeno-canto', 'https://x')`, id)
		if err != nil {
			t.Fatal(err)
		}
	}
}

// Elegível = conteúdo Kids + foto principal de ave sozinha (ou do override,
// com qualquer categoria) + canto. Fotos sem categoria (antes da 0004), sem
// canto ou sem Kids ficam de fora.
func TestFeaturedEligible(t *testing.T) {
	repo, pool := newRepo(t)
	ctx := context.Background()
	b := []domain.Biome{domain.BiomeCerrado}
	seed(t, repo,
		withKids(sp("Turdus rufiventris", "Sabiá", b)),   // elegível
		withKids(sp("Crotophaga ani", "Anu", b)),        // bando, mas override aponta a foto: elegível
		withKids(sp("Pitangus sulphuratus", "Bem", b)),  // sem canto
		sp("Furnarius rufus", "João", b),                // sem Kids
		withKids(sp("Cariama cristata", "Seriema", b)),  // foto antiga, sem categoria
		withKids(sp("Ramphastos toco", "Tucano", b)))    // sem foto nenhuma
	addMedia(t, pool, "turdus-rufiventris", "single_bird", "1", true)
	addMedia(t, pool, "crotophaga-ani", "flock", "77", true)
	_, _ = pool.Exec(ctx, `INSERT INTO photo_override (species_id, primary_observation_id, primary_photo_id) VALUES ('crotophaga-ani', '5', '77')`)
	addMedia(t, pool, "pitangus-sulphuratus", "single_bird", "2", false)
	addMedia(t, pool, "furnarius-rufus", "single_bird", "3", true)
	addMedia(t, pool, "cariama-cristata", "", "", true)
	got, err := repo.FeaturedEligible(ctx)
	if err != nil || fmt.Sprint(got) != "[crotophaga-ani turdus-rufiventris]" {
		t.Fatalf("elegíveis: %v %v", got, err)
	}
}

// Gravar o mesmo dia duas vezes mantém a primeira; o ciclo devolve as
// linhas do ciclo da linha mais recente antes do dia pedido.
func TestFeaturedDayTable(t *testing.T) {
	repo, _ := newRepo(t)
	ctx := context.Background()
	b := []domain.Biome{domain.BiomeCerrado}
	seed(t, repo, sp("Turdus rufiventris", "Sabiá", b), sp("Crotophaga ani", "Anu", b))
	save := func(day, id string, cycle int) {
		if err := repo.SaveFeatured(ctx, domain.FeaturedDay{Day: day, SpeciesID: id, Cycle: cycle}); err != nil {
			t.Fatal(err)
		}
	}
	save("2026-11-01", "turdus-rufiventris", 1)
	save("2026-11-02", "crotophaga-ani", 2)
	save("2026-11-02", "turdus-rufiventris", 2) // conflito: fica a primeira
	if id, found, _ := repo.FeaturedOn(ctx, "2026-11-02"); !found || id != "crotophaga-ani" {
		t.Fatalf("dia 2: %s %v", id, found)
	}
	if _, found, _ := repo.FeaturedOn(ctx, "2026-11-03"); found {
		t.Fatal("dia 3 não deveria existir")
	}
	rows, err := repo.FeaturedCycle(ctx, "2026-11-03")
	if err != nil || len(rows) != 1 || rows[0].Day != "2026-11-02" || rows[0].Cycle != 2 {
		t.Fatalf("ciclo antes do dia 3: %+v %v", rows, err)
	}
	if rows, _ := repo.FeaturedCycle(ctx, "2026-11-01"); len(rows) != 0 {
		t.Fatalf("antes do primeiro dia não há ciclo: %+v", rows)
	}
}

// Duas chamadas ao mesmo tempo no mesmo dia ficam com a mesma ave e uma linha só.
func TestGetFeatured_ConcurrentCalls(t *testing.T) {
	repo, pool := newRepo(t)
	ctx := context.Background()
	b := []domain.Biome{domain.BiomeCerrado}
	for _, s := range []domain.Species{withKids(sp("Turdus rufiventris", "Sabiá", b)), withKids(sp("Crotophaga ani", "Anu", b)),
		withKids(sp("Pitangus sulphuratus", "Bem", b))} {
		seed(t, repo, s)
		addMedia(t, pool, s.ID, "single_bird", s.ID, true)
	}
	uc := usecase.GetFeatured{Repo: repo, Now: func() time.Time { return time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC) }}
	var wg sync.WaitGroup
	got := make([]string, 8)
	for i := range got {
		wg.Add(1)
		go func() {
			defer wg.Done()
			out, err := uc.Execute(ctx, "2026-11-05")
			if err != nil {
				t.Error(err)
				return
			}
			got[i] = out.Species.ID
		}()
	}
	wg.Wait()
	for _, id := range got {
		if id != got[0] {
			t.Fatalf("aves diferentes no mesmo dia: %v", got)
		}
	}
	var n int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM featured_day`).Scan(&n)
	if n != 1 {
		t.Fatalf("esperava 1 linha, veio %d", n)
	}
}
```

Run: `go test ./internal/adapter/postgres/ -run 'TestFeatured|TestGetFeatured'`
Expected: FAIL na compilação (`repo.FeaturedEligible undefined`).

- [ ] **Step 7: Implementar as consultas e o repositório**

No fim de `internal/adapter/postgres/queries.sql`:

```sql
-- name: ListFeaturedEligible :many
-- As espécies que podem ser a "Ave do dia", em ordem de id:
--   - com conteúdo Kids;
--   - com canto (o áudio da posição 0, com chave), porque o card tem botão de canto;
--   - com foto principal (posição 0) de ave sozinha, ou escolhida pelo
--     override do YAML (a palavra final da frente A, seja qual for a
--     categoria que o curador deu). Fotos de antes da 0004 têm category
--     NULL e não entram.
SELECT s.id FROM species s
WHERE s.kids IS NOT NULL
  AND EXISTS (SELECT 1 FROM media a
              WHERE a.species_id = s.id AND a.kind = 'audio' AND a.position = 0 AND a.audio_key <> '')
  AND EXISTS (SELECT 1 FROM media p LEFT JOIN photo_override o ON o.species_id = p.species_id
              WHERE p.species_id = s.id AND p.kind = 'photo' AND p.position = 0
                AND (p.category = 'single_bird' OR (o.primary_photo_id IS NOT NULL AND o.primary_photo_id = p.source_photo_id)))
ORDER BY s.id;

-- name: GetFeaturedDay :one
-- A ave já escolhida para o dia (nenhuma linha = o dia ainda não foi escolhido).
SELECT species_id FROM featured_day WHERE day = $1;

-- name: ListFeaturedCycle :many
-- As linhas do ciclo da linha mais recente antes do dia pedido (inclusive
-- as de dias depois dele, se amanhã foi pedido antes de hoje). Sem nenhuma
-- linha antes do dia, a subconsulta dá NULL e nada volta: é o ciclo 1.
SELECT day, species_id, cycle FROM featured_day
WHERE cycle = (SELECT f.cycle FROM featured_day f WHERE f.day < $1 ORDER BY f.day DESC LIMIT 1)
ORDER BY day;

-- name: InsertFeaturedDay :exec
-- Grava a escolha do dia. ON CONFLICT (day) DO NOTHING: se outra réplica
-- gravou primeiro, a dela fica, e quem chamou relê a linha.
INSERT INTO featured_day (day, species_id, cycle) VALUES ($1, $2, $3) ON CONFLICT (day) DO NOTHING;
```

Run: `make generate`
Expected: `GetFeaturedDay(ctx, pgtype.Date)`, `ListFeaturedCycle(ctx, pgtype.Date)` com `[]FeaturedDay` (ou `[]ListFeaturedCycleRow`, com os mesmos campos), `InsertFeaturedDay(ctx, InsertFeaturedDayParams{Day, SpeciesID, Cycle})`.

Em `internal/adapter/postgres/repository.go`, acrescente `"time"` aos imports, a linha `var _ usecase.FeaturedRepository = (*Repository)(nil)` logo depois da de `SpeciesRepository`, e no fim do arquivo:

```go
// dateParam converte "AAAA-MM-DD" no tipo date do pgx. O caso de uso já
// validou o formato.
func dateParam(day string) (pgtype.Date, error) {
	t, err := time.Parse(time.DateOnly, day)
	if err != nil {
		return pgtype.Date{}, err
	}
	return pgtype.Date{Time: t, Valid: true}, nil
}

// FeaturedOn devolve a ave já gravada para o dia.
func (r *Repository) FeaturedOn(ctx context.Context, day string) (string, bool, error) {
	d, err := dateParam(day)
	if err != nil {
		return "", false, err
	}
	id, err := r.q.GetFeaturedDay(ctx, d)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return id, true, nil
}

// FeaturedCycle devolve as linhas do ciclo da linha mais recente antes do dia.
func (r *Repository) FeaturedCycle(ctx context.Context, day string) ([]domain.FeaturedDay, error) {
	d, err := dateParam(day)
	if err != nil {
		return nil, err
	}
	rows, err := r.q.ListFeaturedCycle(ctx, d)
	if err != nil {
		return nil, err
	}
	out := make([]domain.FeaturedDay, len(rows))
	for i, row := range rows {
		out[i] = domain.FeaturedDay{Day: row.Day.Time.Format(time.DateOnly), SpeciesID: row.SpeciesID, Cycle: int(row.Cycle)}
	}
	return out, nil
}

// FeaturedEligible devolve os ids das espécies que podem ser a ave do dia.
func (r *Repository) FeaturedEligible(ctx context.Context) ([]string, error) {
	return r.q.ListFeaturedEligible(ctx)
}

// SaveFeatured grava a escolha do dia (um dia já gravado fica como está).
func (r *Repository) SaveFeatured(ctx context.Context, f domain.FeaturedDay) error {
	d, err := dateParam(f.Day)
	if err != nil {
		return err
	}
	return r.q.InsertFeaturedDay(ctx, sqlcgen.InsertFeaturedDayParams{Day: d, SpeciesID: f.SpeciesID, Cycle: toInt32(f.Cycle)})
}
```

- [ ] **Step 8: Rodar a suíte e commit**

Run: `go build ./... && go test -race ./... 2>&1 | tail -30`
Expected: PASS.

```bash
git add -A
git commit -m "feat: Ave do dia em rodízio sem repetição, com a tabela featured_day"
```

---

### Task 8: Catalog — RPC `GetFeaturedSpecies`, ligação na API e README

**Files:**
- Modify: `internal/adapter/grpc/server.go`, `cmd/catalog-api/main.go`, `README.md`
- Test: `internal/adapter/grpc/server_test.go`

**Interfaces:**
- Consumes: Task 7 (`usecase.GetFeatured`, `usecase.FeaturedOutput`), Task 5 (`audioToProto`).
- Produces: `grpcadapter.FeaturedUseCase`, `grpcadapter.NewServer(list, get, filters, featured, log)`.

- [ ] **Step 1: Testes que falham**

Em `internal/adapter/grpc/server_test.go`:

- depois de `fakeFilters`, acrescente:

```go
type fakeFeatured struct {
	out  usecase.FeaturedOutput
	err  error
	date string
}

func (f *fakeFeatured) Execute(_ context.Context, date string) (usecase.FeaturedOutput, error) {
	f.date = date
	return f.out, f.err
}
```

- troque todas as chamadas `grpcadapter.NewServer(A, B, C, LOG)` por `grpcadapter.NewServer(A, B, C, &fakeFeatured{}, LOG)` (todas as do arquivo, inclusive as que as Tasks 4 e 5 acrescentaram);
- acrescente:

```go
// A ave do dia chega com o resumo e o canto; a data vai ao caso de uso.
func TestGetFeaturedSpecies(t *testing.T) {
	featured := &fakeFeatured{out: usecase.FeaturedOutput{
		Species: domain.SpeciesSummary{ID: "turdus-rufiventris", ThumbnailKey: "t.webp", PrimaryBiome: domain.BiomeMataAtlantica},
		Audio:   &domain.Audio{Key: "a.aac", Peaks: []float32{1}}}}
	c := dial(t, grpcadapter.NewServer(&fakeList{}, fakeGet{}, &fakeFilters{}, featured, quiet))
	resp, err := c.GetFeaturedSpecies(context.Background(), &catalogv1.GetFeaturedSpeciesRequest{Date: "2026-11-05"})
	if err != nil {
		t.Fatal(err)
	}
	if featured.date != "2026-11-05" || resp.GetSpecies().GetId() != "turdus-rufiventris" ||
		resp.GetSpecies().GetPrimaryBiome() != catalogv1.Biome_BIOME_MATA_ATLANTICA || resp.GetAudio().GetPeaks()[0] != 1 {
		t.Fatalf("data=%q resposta=%v", featured.date, resp)
	}
}

// Sem canto, o campo audio fica ausente; sem elegível, NOT_FOUND; data
// inválida, INVALID_ARGUMENT.
func TestGetFeaturedSpecies_Errors(t *testing.T) {
	noAudio := &fakeFeatured{out: usecase.FeaturedOutput{Species: domain.SpeciesSummary{ID: "x"}}}
	c := dial(t, grpcadapter.NewServer(&fakeList{}, fakeGet{}, &fakeFilters{}, noAudio, quiet))
	resp, err := c.GetFeaturedSpecies(context.Background(), &catalogv1.GetFeaturedSpeciesRequest{Date: "2026-11-05"})
	if err != nil || resp.Audio != nil {
		t.Fatalf("sem canto: err=%v audio=%v", err, resp.GetAudio())
	}
	for code, ucErr := range map[codes.Code]error{
		codes.NotFound:        domain.ErrNotFound,
		codes.InvalidArgument: &domain.InvalidArgumentError{Field: "date", Reason: "x"},
	} {
		c := dial(t, grpcadapter.NewServer(&fakeList{}, fakeGet{}, &fakeFilters{}, &fakeFeatured{err: ucErr}, quiet))
		_, err := c.GetFeaturedSpecies(context.Background(), &catalogv1.GetFeaturedSpeciesRequest{Date: "x"})
		if status.Code(err) != code {
			t.Fatalf("esperava %v, veio %v", code, err)
		}
	}
}
```

Run: `go test ./internal/adapter/grpc/`
Expected: FAIL na compilação (`too many arguments in call to grpcadapter.NewServer`).

- [ ] **Step 2: Implementar o RPC**

Em `internal/adapter/grpc/server.go`:

- depois de `ListFiltersUseCase`:

```go
type FeaturedUseCase interface {
	Execute(context.Context, string) (usecase.FeaturedOutput, error)
}
```

- na struct `Server`, depois de `filters ListFiltersUseCase`, acrescente `featured FeaturedUseCase`;
- troque `NewServer` por:

```go
// NewServer liga o servidor aos quatro casos de uso.
func NewServer(list ListSpeciesUseCase, get GetSpeciesUseCase, filters ListFiltersUseCase, featured FeaturedUseCase, log *slog.Logger) *Server {
	return &Server{list: list, get: get, filters: filters, featured: featured, log: log}
}
```

- depois de `ListFilters`:

```go
// GetFeaturedSpecies devolve a "Ave do dia" da data pedida (AAAA-MM-DD, no
// fuso de São Paulo, calculada pelo BFF). O canto vai junto porque o card
// adulto tem botão de canto; sem canto, o campo fica ausente.
func (s *Server) GetFeaturedSpecies(ctx context.Context, req *catalogv1.GetFeaturedSpeciesRequest) (*catalogv1.GetFeaturedSpeciesResponse, error) {
	out, err := s.featured.Execute(ctx, req.GetDate())
	if err != nil {
		return nil, s.toStatus(ctx, err)
	}
	resp := &catalogv1.GetFeaturedSpeciesResponse{Species: summaryToProto(out.Species)}
	if out.Audio != nil {
		resp.Audio = audioToProto(*out.Audio)
	}
	return resp, nil
}
```

- em `toStatus`, troque a mensagem `"espécie não encontrada"` por `"não encontrado"` (agora vale também para "nenhuma ave elegível") e confira se algum teste compara essa mensagem; se comparar, atualize o texto esperado.

Em `cmd/catalog-api/main.go`, troque a montagem do servidor por:

```go
	srv := grpcadapter.NewServer(
		usecase.ListSpecies{Repo: repo}, usecase.GetSpecies{Repo: repo}, usecase.ListFilters{Repo: repo},
		usecase.GetFeatured{Repo: repo, Now: time.Now}, log)
```

(acrescente `"time"` aos imports se ainda não estiver).

- [ ] **Step 3: README**

Em `README.md` do catalog, depois da seção "Curadoria de fotos", acrescente:

```markdown
### Conteúdo Kids e "Ave do dia"

- **Conteúdo Kids:** as chaves `primary_biome:` e `kids:` do YAML (frente B) vão para `species.primary_biome` e `species.kids`. Sem o bloco, a espécie não aparece no Kids (`kids_only`).
- **"Ave do dia":** `GetFeaturedSpecies` escolhe em rodízio, sem repetir ave até todas as elegíveis aparecerem uma vez, e grava a escolha na tabela `featured_day`. Elegível = conteúdo Kids + foto principal de ave sozinha (ou do override) + canto. O dia é o de São Paulo.
```

- [ ] **Step 4: Suíte, lint, commit, push e PR 4**

Run: `go build ./... && go test -race ./... 2>&1 | tail -30 && make lint`
Expected: PASS e lint sem achados.

```bash
git add -A
git commit -m "feat: RPC GetFeaturedSpecies ligado à API"
git push -u origin feat/ave-do-dia
gh pr create --base feat/picos-canto --title "Frente B: Ave do dia (GetFeaturedSpecies)" \
  --body "Rodízio sem repetição como função pura do domínio, caso de uso com relógio injetado e janela de ontem a amanhã em São Paulo, consulta das elegíveis (Kids + foto de ave sozinha ou override + canto), tabela featured_day com ON CONFLICT e o RPC no servidor gRPC. Empilhado sobre o feat/picos-canto. Spec: seção 5.3."
```

---

### Task 9: Trocar a pseudo-versão do proto pela tag (ponto de parada)

**Files:**
- Modify: `passarim-catalog/go.mod`, `go.sum` (no `feat/kids-banco`, com rebase dos dois branches de cima)

- [ ] **Step 1: PARAR e avisar o dono**

O PR 1 (proto) precisa ser mergeado e ganhar a tag antes do merge dos PRs do catalog. Mande ao dono:

> O PR do proto (`feat/kids-ave-do-dia`) está pronto para merge. Depois do merge, a tag é `git tag v0.4.0 && git push origin v0.4.0` no `main` do proto (posso rodar se você autorizar). Os três PRs do catalog usam a pseudo-versão até lá.

Espere a confirmação de que a tag existe.

- [ ] **Step 2: Trocar a dependência e rebasear a pilha**

```bash
cd ~/dev/passarim/passarim-catalog
git switch feat/kids-banco
go get github.com/velosobr/passarim-proto@v0.4.0 && go mod tidy
go test -race ./... 2>&1 | tail -5
git commit -am "chore: passarim-proto v0.4.0"
git push
git switch feat/picos-canto && git rebase feat/kids-banco && go test -race ./... 2>&1 | tail -5 && git push --force-with-lease
git switch feat/ave-do-dia && git rebase feat/picos-canto && go test -race ./... 2>&1 | tail -5 && git push --force-with-lease
```

Expected: os três `go test` com PASS e o `go.mod` de cada branch com `github.com/velosobr/passarim-proto v0.4.0`.

- [ ] **Step 3: Reingestão dos cantos, à mão (PR 9 da spec)**

Depois que os três PRs do catalog entrarem na `main` e o ambiente local subir com `--build`:

```bash
cd ~/dev/passarim/passarim-docs
env.scripts/back-end-init --build
docker compose run --rm catalog-worker requeue --source audio
# espere a fila de cantos esvaziar (uma rodada por minuto; um job por espécie com canto)
docker compose exec -T postgres psql -U passarim -c "SELECT count(*) FILTER (WHERE cardinality(peaks) = 64) AS com_picos, count(*) AS cantos FROM media WHERE kind = 'audio'"
```

Expected: `com_picos` igual a `cantos`. É o item 5 do "Pronto quando" da spec.
