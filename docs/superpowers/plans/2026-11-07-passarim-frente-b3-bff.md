# Frente B3 — BFF (Kids, bioma principal, picos e "Ave do dia") e ADR-0022: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar ao app, pelo BFF, tudo o que a frente B pôs no catalog (conteúdo Kids, bioma principal, picos do canto, filtros por audiência e a "Ave do dia"), com o cache em `bff:v2:`, e registrar a ADR-0022.

**Architecture:**
- **Domínio:** a audiência (`adult`/`kids`) e o `primaryBiome` entram na consulta validada; a data da "Ave do dia" e o `max-age` até a meia-noite de São Paulo saem de uma função pura (`domain.FeaturedDay`); um `Kind` novo, `KindUnimplemented`, separa "catalog numa versão sem o método" de bug (503, não 500).
- **Porta e decorators:** `CatalogReader` ganha `GetFeatured` e a `FiltersQuery` em `ListFilters`; o cliente gRPC, o retry, o breaker e o cache implementam os dois. O cache sobe para `bff:v2:`, põe a audiência e o bioma principal no hash da lista, a audiência na chave dos filtros e a data na chave da "Ave do dia".
- **REST:** `?audience=` e `?primaryBiome=`, `kids`/`primaryBiome`/`audio.peaks` no detalhe, `primaryBiomes` nos filtros e `GET /v1/featured`, com o `openapi.yaml` e o teste de contrato acompanhando.

**Tech Stack:** Go 1.27.3, grpc-go, `github.com/velosobr/passarim-proto` v0.4.0, Redis (go-redis), kin-openapi (teste de contrato), testcontainers (e2e local).

**Spec:** `passarim-docs/docs/superpowers/specs/2026-10-28-passarim-frente-b-kids-design.md`, seções 7 (BFF), 8 (ADR-0022), 9 ("BFF") e 10 (PRs 7 e 8).

## Global Constraints

- **Comentários didáticos em português** em todo código novo ou alterado (regra do `~/dev/passarim/CLAUDE.md`); mudou o código, atualiza o comentário.
- **Idioma:** identificadores em inglês; comentários, mensagens, commits, PRs e README em português do Brasil.
- **Identidade do Git:** `velosobr <linoc.veloso@gmail.com>`. Commits terminam com as linhas de atribuição da sessão.
- **Go 1.27.3** (a 1.27.2 tem a GO-2026-6809, que já reprovou a CI do catalog) e **`passarim-proto` v0.4.0**.
- **Nulos (spec 7, [R]):** `kids: null` sem bloco Kids; `primaryBiome: null` com `UNSPECIFIED` (nunca `"unspecified"`), no detalhe, nos resumos e no `/v1/featured`; `audio: null` sem canto ou com chave vazia; `audio.peaks` sempre lista (`[]`, nunca `null`).
- **`?audience`** aceita só `adult` e `kids` (padrão `adult`); **`?primaryBiome`** os mesmos códigos de `biome`. Inválidos → 400 problem+json.
- **`/v1/featured`:** data pelo relógio do BFF em `America/Sao_Paulo` (`time/tzdata` embutido); `Cache-Control: public, max-age=<segundos até a meia-noite de São Paulo>`, no mínimo 1; erros: `NOT_FOUND` → 404 `FEATURED_NOT_FOUND`, indisponível sem cache → 503, `UNIMPLEMENTED` → 503, `INVALID_ARGUMENT` → 500 com log.
- **Cache:** prefixo `bff:v2:`; `list:<hash>` com a audiência e o `primaryBiome`; `filters:<audiência>`; `species:<id>` igual; `featured:<data>`.
- **Ordem de deploy:** catalog (com os PRs da frente B) antes do BFF; o app só depois.
- **Sem merge e sem push na `main`:** os PRs ficam abertos para o dono.

## Review Focus

1. **Virada da meia-noite:** às 23h59min59s de São Paulo, `max-age=1` e a data de hoje; às 00h00min00s, a data nova e `max-age=86400`; num pedido às 01h de UTC, a data ainda é a de São Paulo. Testes na Task 1 (`TestFeaturedDay_MidnightInSaoPaulo`) e na Task 2 (`TestGetFeatured_DateInSaoPauloAndMaxAge`).
2. **Ave de ontem nunca sai:** com o catalog fora do ar logo depois da meia-noite, a chave do dia novo não tem candidato e a resposta é erro, não a ave de ontem. Teste na Task 5 (`TestCache_FeaturedIsKeyedByDate`).
3. **Catalog numa versão sem `GetFeaturedSpecies`** (deploy desfeito): 503, sem retry, sem abrir o circuito para as outras rotas. Testes nas Tasks 1, 3, 4 e 6.
4. **Mesma consulta nas duas audiências** não divide a mesma chave do cache (a lista adulta nunca serve a Kids, nem o contrário). Teste na Task 5 (`TestCache_ListKeyIncludesAudienceAndPrimaryBiome`, `TestCache_FiltersAreCached`).
5. **Detalhe de uma ave sem Kids:** `kids: null`, `primaryBiome: null` e o contrato aceita os nulos. Testes na Task 6 (`TestGetSpecies_KidsPrimaryBiomeAndPeaks`, contrato "detalhe só com o mínimo").

---

### Task 1: Go 1.27.3, proto v0.4.0 e o domínio

**Files:**
- Modify: `go.mod`, `go.sum`, `internal/domain/species.go`, `internal/domain/errors.go`, `internal/domain/query.go`, `internal/domain/errors_test.go`
- Create: `internal/domain/audience.go`, `internal/domain/featured.go`, `internal/domain/audience_test.go`, `internal/domain/featured_test.go`

**Interfaces:**
- Produces: `domain.Audience` (`AudienceAdult`, `AudienceKids`), `domain.ParseAudience(s) (Audience, bool)`; `RawListQuery.Audience/PrimaryBiome string`, `ListQuery.Audience Audience`, `ListQuery.PrimaryBiome Biome`; `domain.RawFiltersQuery{Audience string; Repeated []string}`, `domain.FiltersQuery{Audience}`, `domain.NewFiltersQuery`; `domain.KidsContent{Description string; Facts []string; DidYouKnow string}`; `Audio.Peaks []float32`; `Summary.PrimaryBiome`, `Species.PrimaryBiome`, `Species.Kids *KidsContent`; `Filters.PrimaryBiomes []BiomeCount`; `domain.Featured{Species Summary; Audio *Audio}`; `domain.FeaturedDay(now time.Time, loc *time.Location) (date string, secondsLeft int)`; `domain.KindUnimplemented` (não repete, não conta no breaker, libera o dado velho).

- [ ] **Step 1: Branch, Go e proto**

```bash
cd ~/dev/passarim/passarim-bff
git switch main && git pull --ff-only
git switch -c feat/kids-ave-do-dia
sed -i '' 's/^go 1.27.2$/go 1.27.3/' go.mod
go get github.com/velosobr/passarim-proto@v0.4.0 && go mod tidy
go build ./... && go test ./... 2>&1 | tail -3
```

Expected: `go.mod` com `go 1.27.3` e `passarim-proto v0.4.0`; build e testes verdes (só adições no proto). Se o `golang:1.27-alpine` local ainda for a 1.27.2, rode `docker pull golang:1.27-alpine` antes de qualquer `docker build` (a CI baixa a imagem nova sozinha).

- [ ] **Step 2: Testes que falham**

Salve o patch abaixo em `/tmp/b3-t1-tests.patch` e aplique com `git apply /tmp/b3-t1-tests.patch`:

```diff
diff --git a/internal/domain/audience_test.go b/internal/domain/audience_test.go
new file mode 100644
index 0000000..04af8ba
--- /dev/null
+++ b/internal/domain/audience_test.go
@@ -0,0 +1,54 @@
+// Testes da audiência (frente B) e da validação de /v1/filters.
+
+package domain_test
+
+import (
+	"errors"
+	"testing"
+
+	"github.com/velosobr/passarim-bff/internal/domain"
+)
+
+func TestParseAudience(t *testing.T) {
+	cases := map[string]struct {
+		want domain.Audience
+		ok   bool
+	}{"": {domain.AudienceAdult, true}, "adult": {domain.AudienceAdult, true}, "kids": {domain.AudienceKids, true},
+		"Kids": {"", false}, "criancas": {"", false}}
+	for in, c := range cases {
+		if got, ok := domain.ParseAudience(in); got != c.want || ok != c.ok {
+			t.Errorf("%q: %q %v, esperava %q %v", in, got, ok, c.want, c.ok)
+		}
+	}
+}
+
+// A lista aceita audience e primaryBiome; os valores inválidos aparecem
+// junto com os outros problemas.
+func TestNewListQuery_AudienceAndPrimaryBiome(t *testing.T) {
+	q, err := domain.NewListQuery(domain.RawListQuery{Audience: "kids", PrimaryBiome: "pampa"})
+	if err != nil || q.Audience != domain.AudienceKids || q.PrimaryBiome != domain.BiomePampa {
+		t.Fatalf("got %+v %v", q, err)
+	}
+	if q, _ := domain.NewListQuery(domain.RawListQuery{}); q.Audience != domain.AudienceAdult {
+		t.Fatalf("o padrão é adult: %+v", q)
+	}
+	_, err = domain.NewListQuery(domain.RawListQuery{Audience: "todos", PrimaryBiome: "lua", Limit: "0"})
+	var ve *domain.ValidationError
+	if !errors.As(err, &ve) || len(ve.Fields) != 3 {
+		t.Fatalf("esperava 3 problemas (audience, primaryBiome, limit), veio %v", err)
+	}
+}
+
+func TestNewFiltersQuery(t *testing.T) {
+	if q, err := domain.NewFiltersQuery(domain.RawFiltersQuery{Audience: "kids"}); err != nil || q.Audience != domain.AudienceKids {
+		t.Fatalf("got %+v %v", q, err)
+	}
+	if q, err := domain.NewFiltersQuery(domain.RawFiltersQuery{}); err != nil || q.Audience != domain.AudienceAdult {
+		t.Fatalf("o padrão é adult: %+v %v", q, err)
+	}
+	_, err := domain.NewFiltersQuery(domain.RawFiltersQuery{Audience: "x", Repeated: []string{"audience"}})
+	var ve *domain.ValidationError
+	if !errors.As(err, &ve) || len(ve.Fields) != 2 {
+		t.Fatalf("esperava 2 problemas, veio %v", err)
+	}
+}
diff --git a/internal/domain/errors_test.go b/internal/domain/errors_test.go
index 61cc9bb..714f446 100644
--- a/internal/domain/errors_test.go
+++ b/internal/domain/errors_test.go
@@ -32,6 +32,7 @@ func TestKindTable(t *testing.T) {
 		{domain.KindInvalidArgument, false, false, false},
 		{domain.KindCanceled, false, false, false},
 		{domain.KindInternal, false, false, false},
+		{domain.KindUnimplemented, false, false, true},
 	}
 	for _, c := range cases {
 		if c.kind.Retryable() != c.retry || c.kind.CountsForBreaker() != c.breaker || c.kind.AllowsStale() != c.stale {
diff --git a/internal/domain/featured_test.go b/internal/domain/featured_test.go
new file mode 100644
index 0000000..01babd9
--- /dev/null
+++ b/internal/domain/featured_test.go
@@ -0,0 +1,36 @@
+// Testes da data da "Ave do dia": a virada à meia-noite de São Paulo e o
+// max-age até ela.
+
+package domain_test
+
+import (
+	"testing"
+	"time"
+	_ "time/tzdata" // o banco de fusos embutido, para o teste rodar em qualquer máquina
+
+	"github.com/velosobr/passarim-bff/internal/domain"
+)
+
+func TestFeaturedDay_MidnightInSaoPaulo(t *testing.T) {
+	sp, err := time.LoadLocation("America/Sao_Paulo")
+	if err != nil {
+		t.Fatal(err)
+	}
+	cases := []struct {
+		now     time.Time
+		date    string
+		seconds int
+	}{
+		{time.Date(2026, 11, 5, 23, 59, 59, 0, sp), "2026-11-05", 1},
+		{time.Date(2026, 11, 5, 23, 59, 59, 900_000_000, sp), "2026-11-05", 1}, // menos de 1 s: o mínimo é 1
+		{time.Date(2026, 11, 6, 0, 0, 0, 0, sp), "2026-11-06", 86400},
+		{time.Date(2026, 11, 6, 2, 30, 0, 0, time.UTC), "2026-11-05", 1800}, // 23h30 em São Paulo
+		{time.Date(2026, 12, 31, 12, 0, 0, 0, sp), "2026-12-31", 43200},     // virada de ano
+	}
+	for _, c := range cases {
+		date, seconds := domain.FeaturedDay(c.now, sp)
+		if date != c.date || seconds != c.seconds {
+			t.Errorf("%v: %s %d, esperava %s %d", c.now, date, seconds, c.date, c.seconds)
+		}
+	}
+}
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `go test ./internal/domain/`
Expected: FAIL na compilação (`undefined: domain.KindUnimplemented`, `undefined: domain.ParseAudience`, `undefined: domain.FeaturedDay`).

- [ ] **Step 4: Implementar**

Salve o patch abaixo em `/tmp/b3-t1-impl.patch` e aplique com `git apply /tmp/b3-t1-impl.patch`:

```diff
diff --git a/internal/domain/audience.go b/internal/domain/audience.go
new file mode 100644
index 0000000..4bac9ec
--- /dev/null
+++ b/internal/domain/audience.go
@@ -0,0 +1,26 @@
+// A audiência de uma consulta: a jornada adulta ou a Kids (frente B). Ela
+// chega na URL (?audience=adult|kids) e decide se a lista e os filtros
+// trazem todas as aves ou só as que têm conteúdo Kids.
+
+package domain
+
+// Audience é para quem é a resposta. O valor é o mesmo da URL.
+type Audience string
+
+// As duas audiências. A adulta é o padrão: um app antigo, que não manda o
+// parâmetro, continua recebendo todas as aves.
+const (
+	AudienceAdult Audience = "adult"
+	AudienceKids  Audience = "kids"
+)
+
+// ParseAudience aceita só os valores exatos. Vazio vale a adulta.
+func ParseAudience(s string) (Audience, bool) {
+	switch Audience(s) {
+	case "", AudienceAdult:
+		return AudienceAdult, true
+	case AudienceKids:
+		return AudienceKids, true
+	}
+	return "", false
+}
diff --git a/internal/domain/errors.go b/internal/domain/errors.go
index 411cc32..63be8ad 100644
--- a/internal/domain/errors.go
+++ b/internal/domain/errors.go
@@ -27,6 +27,7 @@ const (
 	KindNotFound                    // gRPC NotFound
 	KindInvalidArgument             // gRPC InvalidArgument (ou validação nossa)
 	KindCanceled                    // o cliente desistiu
+	KindUnimplemented               // gRPC Unimplemented: o catalog ainda não tem o método (versão anterior)
 )
 
 // String devolve o nome do Kind, usado em logs e mensagens de erro. Ter um
@@ -34,7 +35,7 @@ const (
 // impresso com fmt ou slog. "[...]string{...}" é um array cujo tamanho o
 // compilador conta sozinho; o índice é o próprio Kind.
 func (k Kind) String() string {
-	return [...]string{"Internal", "Unavailable", "Timeout", "Upstream", "CircuitOpen", "NotFound", "InvalidArgument", "Canceled"}[k]
+	return [...]string{"Internal", "Unavailable", "Timeout", "Upstream", "CircuitOpen", "NotFound", "InvalidArgument", "Canceled", "Unimplemented"}[k]
 }
 
 // Retryable: vale a pena tentar de novo? Só falhas passageiras.
@@ -56,8 +57,11 @@ func (k Kind) CountsForBreaker() bool {
 // circuito aberto): um dado de algumas horas atrás é melhor que um erro. Não
 // quando a resposta é legítima, como um 404: servir uma espécie "velha" que
 // não existe mais seria mentir.
+//
+// KindUnimplemented também libera: o catalog voltou para uma versão sem o
+// método (um deploy desfeito), e a resposta guardada antes continua certa.
 func (k Kind) AllowsStale() bool {
-	return k == KindUnavailable || k == KindTimeout || k == KindUpstream || k == KindCircuitOpen
+	return k == KindUnavailable || k == KindTimeout || k == KindUpstream || k == KindCircuitOpen || k == KindUnimplemented
 }
 
 // Error carrega o Kind e a causa original (a causa vai SÓ para logs: nunca para a resposta HTTP).
diff --git a/internal/domain/featured.go b/internal/domain/featured.go
new file mode 100644
index 0000000..e0987ab
--- /dev/null
+++ b/internal/domain/featured.go
@@ -0,0 +1,20 @@
+// A data da "Ave do dia" (frente B). A ave troca à meia-noite de São Paulo,
+// para todo mundo ao mesmo tempo: a data sai do relógio do BFF nesse fuso, e
+// o app guarda a resposta só até essa meia-noite.
+
+package domain
+
+import "time"
+
+// FeaturedDay devolve a data da "Ave do dia" no instante now, no formato
+// AAAA-MM-DD do fuso loc, e quantos segundos faltam para a próxima
+// meia-noite desse fuso: é o max-age da resposta. O mínimo é 1, porque
+// "max-age=0" faria o app pedir de novo sem parar no último segundo do dia.
+//
+// time.Date com o dia + 1 resolve sozinho a virada de mês e de ano (32 de
+// janeiro vira 1º de fevereiro).
+func FeaturedDay(now time.Time, loc *time.Location) (date string, secondsLeft int) {
+	local := now.In(loc)
+	midnight := time.Date(local.Year(), local.Month(), local.Day()+1, 0, 0, 0, 0, loc)
+	return local.Format(time.DateOnly), max(int(midnight.Sub(local)/time.Second), 1)
+}
diff --git a/internal/domain/query.go b/internal/domain/query.go
index 8402ec8..bd4bdf4 100644
--- a/internal/domain/query.go
+++ b/internal/domain/query.go
@@ -53,6 +53,7 @@ func (e *ValidationError) Error() string { return "parâmetros inválidos" }
 // de quem chamou.
 type RawListQuery struct {
 	Q, Biome, State, Cursor, Limit string
+	Audience, PrimaryBiome         string // frente B: ?audience=adult|kids e ?primaryBiome=
 	Repeated                       []string
 }
 
@@ -62,12 +63,18 @@ type RawListQuery struct {
 // ListQuery sabe que ele já passou pelas regras, sem precisar conferir de
 // novo. Como ele só é criado por NewListQuery, não existe ListQuery inválido
 // circulando pelo código.
+//
+// Audience e PrimaryBiome são da frente B: kids deixa só as aves com
+// conteúdo Kids, e PrimaryBiome filtra pelo "mundo" da ave no Kids
+// (diferente de Biome, que filtra por qualquer bioma em que a ave vive).
 type ListQuery struct {
-	Q      string
-	Biome  Biome
-	State  string
-	Cursor string
-	Limit  int
+	Q            string
+	Biome        Biome
+	State        string
+	Cursor       string
+	Limit        int
+	Audience     Audience
+	PrimaryBiome Biome
 }
 
 // NewListQuery valida e normaliza. Devolve *ValidationError com todos os campos ruins.
@@ -77,7 +84,7 @@ type ListQuery struct {
 // usado.
 func NewListQuery(raw RawListQuery) (ListQuery, error) {
 	var bad []FieldError
-	q := ListQuery{Limit: DefaultLimit}
+	q := ListQuery{Limit: DefaultLimit, Audience: AudienceAdult}
 
 	for _, f := range raw.Repeated {
 		bad = append(bad, FieldError{f, "não pode ser repetido"})
@@ -106,6 +113,18 @@ func NewListQuery(raw RawListQuery) (ListQuery, error) {
 			bad = append(bad, FieldError{"biome", "bioma desconhecido"})
 		}
 	}
+	if a, ok := ParseAudience(raw.Audience); ok {
+		q.Audience = a
+	} else {
+		bad = append(bad, audienceError)
+	}
+	if raw.PrimaryBiome != "" {
+		if b, ok := ParseBiome(raw.PrimaryBiome); ok {
+			q.PrimaryBiome = b
+		} else {
+			bad = append(bad, FieldError{"primaryBiome", "bioma desconhecido"})
+		}
+	}
 	if raw.State != "" {
 		if uf, ok := NormalizeUF(raw.State); ok {
 			q.State = uf
@@ -134,6 +153,37 @@ func NewListQuery(raw RawListQuery) (ListQuery, error) {
 	return q, nil
 }
 
+// audienceError é o problema de um ?audience= que não é adult nem kids.
+var audienceError = FieldError{"audience", "use adult ou kids"}
+
+// RawFiltersQuery são os parâmetros crus de /v1/filters (frente B).
+type RawFiltersQuery struct {
+	Audience string
+	Repeated []string
+}
+
+// FiltersQuery é a consulta dos filtros já validada: a audiência decide se
+// as contagens consideram todas as aves ou só as que têm conteúdo Kids.
+type FiltersQuery struct {
+	Audience Audience
+}
+
+// NewFiltersQuery valida os parâmetros de /v1/filters, como NewListQuery.
+func NewFiltersQuery(raw RawFiltersQuery) (FiltersQuery, error) {
+	var bad []FieldError
+	for _, f := range raw.Repeated {
+		bad = append(bad, FieldError{f, "não pode ser repetido"})
+	}
+	a, ok := ParseAudience(raw.Audience)
+	if !ok {
+		bad = append(bad, audienceError)
+	}
+	if len(bad) > 0 {
+		return FiltersQuery{}, &ValidationError{Fields: bad}
+	}
+	return FiltersQuery{Audience: a}, nil
+}
+
 // O cursor é opaco para nós, mas vem do cliente: só repassamos se parecer base64url curto.
 //
 // "Opaco" quer dizer que o BFF não entende o conteúdo: o catalog o criou na
diff --git a/internal/domain/species.go b/internal/domain/species.go
index 5928ed4..186e546 100644
--- a/internal/domain/species.go
+++ b/internal/domain/species.go
@@ -23,11 +23,23 @@ type Photo struct {
 	Credit                        Credit
 }
 
-// Audio é a gravação do canto, com a duração em milissegundos.
+// Audio é a gravação do canto, com a duração em milissegundos. Peaks são
+// os 64 picos da forma de onda, de 0 a 1, que o player desenha (frente B);
+// vazio num canto gravado antes de o catalog calcular os picos.
 type Audio struct {
 	Key        string
 	DurationMs int
 	Credit     Credit
+	Peaks      []float32
+}
+
+// KidsContent é o texto para crianças da espécie (frente B), gerado a partir
+// do texto adulto e revisado por uma pessoa no catalog. Os fatos chegam só
+// com o texto: de qual fato adulto cada um saiu não interessa ao app.
+type KidsContent struct {
+	Description string
+	Facts       []string
+	DidYouKnow  string
 }
 
 // Fact é uma curiosidade sobre a espécie, com a fonte de onde ela saiu.
@@ -49,6 +61,7 @@ type Summary struct {
 	ID, ScientificName, CommonName string
 	ThumbnailKey                   string // vazio = ainda sem foto
 	Conservation                   ConservationStatus
+	PrimaryBiome                   Biome // o "mundo" da ave no Kids; vazio = sem bioma principal
 }
 
 // SpeciesPage é uma página da lista. A paginação é por cursor: para buscar a
@@ -77,6 +90,8 @@ type Species struct {
 	Photos                                 []Photo
 	Audio                                  *Audio
 	Clusters                               []Cluster
+	PrimaryBiome                           Biome        // o "mundo" da ave no Kids; vazio = sem bioma principal
+	Kids                                   *KidsContent // nil = a espécie ainda não tem conteúdo Kids
 }
 
 // BiomeCount diz quantas espécies existem num bioma (usado nos filtros).
@@ -93,7 +108,18 @@ type StateCount struct {
 
 // Filters são as opções da tela de filtros: só os biomas e as UFs que têm
 // pelo menos uma espécie, cada um com a contagem.
+//
+// PrimaryBiomes conta por bioma principal, o "mundo" de cada ave no Kids: é
+// a conta do álbum ("4 de 9" no Pantanal).
 type Filters struct {
-	Biomes []BiomeCount
-	States []StateCount
+	Biomes        []BiomeCount
+	States        []StateCount
+	PrimaryBiomes []BiomeCount
+}
+
+// Featured é a "Ave do dia" que o catalog escolheu: o resumo (o card) e o
+// canto, nil quando a ave não tem canto.
+type Featured struct {
+	Species Summary
+	Audio   *Audio
 }
```

- [ ] **Step 5: Rodar os testes**

Run: `go test ./internal/domain/`
Expected: PASS. (`go build ./...` continua verde: nada usa os tipos novos ainda.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: domínio da frente B (audiência, Kids, bioma principal, picos e data da Ave do dia) e Go 1.27.3 com o proto v0.4.0"
```

---

### Task 2: Casos de uso — porta, filtros por audiência e "Ave do dia"

**Files:**
- Modify: `internal/usecase/catalog.go`, `internal/usecase/list_filters.go`, `internal/usecase/usecase_test.go`
- Create: `internal/usecase/get_featured.go`

**Interfaces:**
- Consumes: Task 1.
- Produces: `usecase.CatalogReader` com `ListFilters(ctx, q domain.FiltersQuery)` e `GetFeatured(ctx, date string) (domain.Featured, error)`; `usecase.ListFilters.Run(ctx, raw domain.RawFiltersQuery)`; `usecase.GetFeatured{Catalog; Budget time.Duration; Now func() time.Time}` com `Run(ctx) (FeaturedOutput, error)`; `usecase.FeaturedOutput{Date string; Featured domain.Featured; MaxAge int}`.

- [ ] **Step 1: Testes que falham**

Salve o patch abaixo em `/tmp/b3-t2-tests.patch` e aplique com `git apply /tmp/b3-t2-tests.patch`:

```diff
diff --git a/internal/usecase/usecase_test.go b/internal/usecase/usecase_test.go
index 93b9a32..a6fb01f 100644
--- a/internal/usecase/usecase_test.go
+++ b/internal/usecase/usecase_test.go
@@ -22,6 +22,8 @@ type fakeCatalog struct {
 	calls       int
 	lastQuery   domain.ListQuery
 	lastID      string
+	lastFilters domain.FiltersQuery
+	lastDate    string
 	deadline    time.Time
 	hasDeadline bool
 	err         error
@@ -34,7 +36,7 @@ func (f *fakeCatalog) note(ctx context.Context) {
 	f.deadline, f.hasDeadline = ctx.Deadline()
 }
 
-// Os três métodos abaixo registram a chamada e devolvem respostas fixas.
+// Os quatro métodos abaixo registram a chamada e devolvem respostas fixas.
 func (f *fakeCatalog) ListSpecies(ctx context.Context, q domain.ListQuery) (domain.SpeciesPage, error) {
 	f.note(ctx)
 	f.lastQuery = q
@@ -47,11 +49,18 @@ func (f *fakeCatalog) GetSpecies(ctx context.Context, id string) (domain.Species
 	return domain.Species{ID: id}, f.err
 }
 
-func (f *fakeCatalog) ListFilters(ctx context.Context) (domain.Filters, error) {
+func (f *fakeCatalog) ListFilters(ctx context.Context, q domain.FiltersQuery) (domain.Filters, error) {
 	f.note(ctx)
+	f.lastFilters = q
 	return domain.Filters{}, f.err
 }
 
+func (f *fakeCatalog) GetFeatured(ctx context.Context, date string) (domain.Featured, error) {
+	f.note(ctx)
+	f.lastDate = date
+	return domain.Featured{Species: domain.Summary{ID: "turdus-rufiventris"}}, f.err
+}
+
 // limit=999 é inválido: o caso de uso devolve o erro de validação e o
 // catalog não é chamado nenhuma vez.
 func TestListSpecies_ValidatesBeforeCalling(t *testing.T) {
@@ -98,7 +107,7 @@ func TestGetSpecies_ValidatesIDAndAppliesBudget(t *testing.T) {
 func TestListFilters_AppliesBudgetAndPropagatesErrors(t *testing.T) {
 	f := &fakeCatalog{err: domain.NewError(domain.KindUnavailable, errors.New("x"))}
 	uc := usecase.ListFilters{Catalog: f, Budget: time.Second}
-	if _, err := uc.Run(context.Background()); domain.KindOf(err) != domain.KindUnavailable || !f.hasDeadline {
+	if _, err := uc.Run(context.Background(), domain.RawFiltersQuery{}); domain.KindOf(err) != domain.KindUnavailable || !f.hasDeadline {
 		t.Fatalf("o erro do catalog deve passar intacto e com orçamento: %v", err)
 	}
 }
@@ -114,3 +123,35 @@ func TestBudgetDoesNotExtendAnEarlierDeadline(t *testing.T) {
 		t.Fatal("o orçamento nunca pode ESTENDER o prazo que o chamador já tinha")
 	}
 }
+
+// A audiência chega validada ao catalog; uma inválida nem chega.
+func TestListFilters_ValidatesAudience(t *testing.T) {
+	f := &fakeCatalog{}
+	uc := usecase.ListFilters{Catalog: f, Budget: time.Second}
+	if _, err := uc.Run(context.Background(), domain.RawFiltersQuery{Audience: "kids"}); err != nil || f.lastFilters.Audience != domain.AudienceKids {
+		t.Fatalf("err=%v consulta=%+v", err, f.lastFilters)
+	}
+	if _, err := uc.Run(context.Background(), domain.RawFiltersQuery{Audience: "x"}); domain.KindOf(err) != domain.KindInvalidArgument || f.calls != 1 {
+		t.Fatalf("audiência inválida não pode chegar ao catalog: %v calls=%d", err, f.calls)
+	}
+}
+
+// A data é a de São Paulo, não a de UTC: às 01h de UTC do dia 6 ainda é dia
+// 5 em São Paulo, e faltam 2 h (7200 s) para a meia-noite de lá.
+func TestGetFeatured_DateInSaoPauloAndMaxAge(t *testing.T) {
+	f := &fakeCatalog{}
+	now := func() time.Time { return time.Date(2026, 11, 6, 1, 0, 0, 0, time.UTC) }
+	out, err := usecase.GetFeatured{Catalog: f, Budget: time.Second, Now: now}.Run(context.Background())
+	if err != nil || f.lastDate != "2026-11-05" || out.Date != "2026-11-05" || out.MaxAge != 7200 || out.Featured.Species.ID == "" || !f.hasDeadline {
+		t.Fatalf("out=%+v err=%v data pedida=%q", out, err, f.lastDate)
+	}
+}
+
+// O erro do catalog (sem ave elegível) passa intacto.
+func TestGetFeatured_PropagatesNotFound(t *testing.T) {
+	f := &fakeCatalog{err: domain.NewError(domain.KindNotFound, errors.New("x"))}
+	_, err := usecase.GetFeatured{Catalog: f, Budget: time.Second, Now: time.Now}.Run(context.Background())
+	if domain.KindOf(err) != domain.KindNotFound {
+		t.Fatalf("esperava NotFound, veio %v", err)
+	}
+}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `go test ./internal/usecase/`
Expected: FAIL na compilação (`too many arguments in call to uc.Run`, `undefined: usecase.GetFeatured`).

- [ ] **Step 3: Implementar**

Salve o patch abaixo em `/tmp/b3-t2-impl.patch` e aplique com `git apply /tmp/b3-t2-impl.patch`:

```diff
diff --git a/internal/usecase/catalog.go b/internal/usecase/catalog.go
index 2fb471f..d231f69 100644
--- a/internal/usecase/catalog.go
+++ b/internal/usecase/catalog.go
@@ -7,7 +7,7 @@
 //
 // "Porta" é uma interface definida aqui, do lado de quem USA, e implementada
 // do lado de fora (nos adapters). Em Go, uma interface é satisfeita
-// implicitamente: qualquer tipo com estes três métodos já é um CatalogReader,
+// implicitamente: qualquer tipo com estes quatro métodos já é um CatalogReader,
 // sem declarar nada. Por isso os testes trocam o catalog real por um falso
 // com uma struct de poucas linhas.
 package usecase
@@ -25,6 +25,10 @@ type CatalogReader interface {
 	ListSpecies(ctx context.Context, q domain.ListQuery) (domain.SpeciesPage, error)
 	// GetSpecies devolve uma espécie completa, ou um erro KindNotFound.
 	GetSpecies(ctx context.Context, id string) (domain.Species, error)
-	// ListFilters devolve os biomas e as UFs que têm espécies, com as contagens.
-	ListFilters(ctx context.Context) (domain.Filters, error)
+	// ListFilters devolve os biomas, as UFs e os biomas principais que têm
+	// espécies, com as contagens, na audiência pedida.
+	ListFilters(ctx context.Context, q domain.FiltersQuery) (domain.Filters, error)
+	// GetFeatured devolve a "Ave do dia" da data (AAAA-MM-DD, fuso de São
+	// Paulo), ou um erro KindNotFound quando não há ave elegível.
+	GetFeatured(ctx context.Context, date string) (domain.Featured, error)
 }
diff --git a/internal/usecase/get_featured.go b/internal/usecase/get_featured.go
new file mode 100644
index 0000000..6d3cbee
--- /dev/null
+++ b/internal/usecase/get_featured.go
@@ -0,0 +1,55 @@
+// Caso de uso da "Ave do dia" (frente B): calcular a data de hoje em São
+// Paulo e pedir ao catalog a ave dessa data.
+
+package usecase
+
+import (
+	"context"
+	"time"
+	_ "time/tzdata" // embute o banco de fusos: a imagem distroless do BFF não tem o do sistema
+
+	"github.com/velosobr/passarim-bff/internal/domain"
+)
+
+// saoPaulo é o fuso em que o "dia" da Ave do dia é contado. time/tzdata,
+// importado acima, garante que LoadLocation ache o fuso em qualquer imagem.
+var saoPaulo = mustLoadLocation("America/Sao_Paulo")
+
+func mustLoadLocation(name string) *time.Location {
+	loc, err := time.LoadLocation(name)
+	if err != nil {
+		panic(err) // com time/tzdata embutido, só acontece se o nome estiver errado
+	}
+	return loc
+}
+
+// FeaturedOutput é a ave do dia com a data dela e o max-age da resposta:
+// os segundos que faltam para a próxima meia-noite de São Paulo.
+type FeaturedOutput struct {
+	Date     string
+	Featured domain.Featured
+	MaxAge   int
+}
+
+// GetFeatured busca a ave do dia dentro do orçamento de tempo. Now é o
+// relógio, injetado para os testes pararem o tempo onde quiserem (em
+// produção, time.Now).
+type GetFeatured struct {
+	Catalog CatalogReader
+	Budget  time.Duration
+	Now     func() time.Time
+}
+
+// Run calcula a data pelo relógio do BFF (não há parâmetro do app: a ave é
+// a mesma para todos) e pede a ave ao catalog. A data entra na chave do
+// cache, então à meia-noite a chave muda e a ave de ontem nunca sai.
+func (u GetFeatured) Run(ctx context.Context) (FeaturedOutput, error) {
+	date, maxAge := domain.FeaturedDay(u.Now(), saoPaulo)
+	ctx, cancel := context.WithTimeout(ctx, u.Budget)
+	defer cancel()
+	f, err := u.Catalog.GetFeatured(ctx, date)
+	if err != nil {
+		return FeaturedOutput{}, err
+	}
+	return FeaturedOutput{Date: date, Featured: f, MaxAge: maxAge}, nil
+}
diff --git a/internal/usecase/list_filters.go b/internal/usecase/list_filters.go
index b552819..9a3f664 100644
--- a/internal/usecase/list_filters.go
+++ b/internal/usecase/list_filters.go
@@ -10,16 +10,21 @@ import (
 )
 
 // ListFilters busca as opções de filtro no catalog dentro do orçamento de
-// tempo. Não há parâmetros de entrada, então não há o que validar.
+// tempo. O único parâmetro é a audiência (frente B), validada antes de
+// qualquer chamada.
 type ListFilters struct {
 	Catalog CatalogReader
 	Budget  time.Duration
 }
 
-// Run aplica o orçamento e repassa a chamada à porta. O erro do catalog volta
-// como veio, já classificado com um Kind.
-func (u ListFilters) Run(ctx context.Context) (domain.Filters, error) {
+// Run valida a audiência, aplica o orçamento e repassa a chamada à porta. O
+// erro do catalog volta como veio, já classificado com um Kind.
+func (u ListFilters) Run(ctx context.Context, raw domain.RawFiltersQuery) (domain.Filters, error) {
+	q, err := domain.NewFiltersQuery(raw)
+	if err != nil {
+		return domain.Filters{}, err
+	}
 	ctx, cancel := context.WithTimeout(ctx, u.Budget)
 	defer cancel()
-	return u.Catalog.ListFilters(ctx)
+	return u.Catalog.ListFilters(ctx, q)
 }
```

- [ ] **Step 4: Rodar os testes**

Run: `go test ./internal/usecase/ ./internal/domain/`
Expected: PASS. A partir daqui, `go build ./...` falha nos adapters (a porta mudou) até a Task 6; cada task roda só os pacotes dela.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: casos de uso dos filtros por audiência e da Ave do dia"
```

---

### Task 3: Cliente gRPC

**Files:**
- Modify: `internal/adapter/grpcclient/client.go`, `internal/adapter/grpcclient/mapping.go`, `internal/adapter/grpcclient/client_test.go`

**Interfaces:**
- Consumes: Tasks 1 e 2.
- Produces: `(*grpcclient.Client).ListFilters(ctx, q)`, `.GetFeatured(ctx, date)`; `codes.Unimplemented` → `domain.KindUnimplemented`.

- [ ] **Step 1: Testes que falham**

Salve o patch abaixo em `/tmp/b3-t3-tests.patch` e aplique com `git apply /tmp/b3-t3-tests.patch`:

```diff
diff --git a/internal/adapter/grpcclient/client_test.go b/internal/adapter/grpcclient/client_test.go
index 156067f..4f831a1 100644
--- a/internal/adapter/grpcclient/client_test.go
+++ b/internal/adapter/grpcclient/client_test.go
@@ -32,15 +32,16 @@ import (
 //
 // Embutir catalogv1.UnimplementedCatalogServiceServer (o campo sem nome) dá à
 // struct todos os métodos do serviço, que respondem "não implementado"; o
-// fake só sobrescreve os três que usa. calls é atômico porque o servidor gRPC
+// fake só sobrescreve os quatro que usa. calls é atômico porque o servidor gRPC
 // atende em outra goroutine, e lastMD guarda os metadados recebidos.
 type fakeServer struct {
 	catalogv1.UnimplementedCatalogServiceServer
-	list    func(*catalogv1.ListSpeciesRequest) (*catalogv1.ListSpeciesResponse, error)
-	get     func(*catalogv1.GetSpeciesRequest) (*catalogv1.GetSpeciesResponse, error)
-	filters func() (*catalogv1.ListFiltersResponse, error)
-	calls   atomic.Int32
-	lastMD  metadata.MD
+	list     func(*catalogv1.ListSpeciesRequest) (*catalogv1.ListSpeciesResponse, error)
+	get      func(*catalogv1.GetSpeciesRequest) (*catalogv1.GetSpeciesResponse, error)
+	filters  func(*catalogv1.ListFiltersRequest) (*catalogv1.ListFiltersResponse, error)
+	featured func(*catalogv1.GetFeaturedSpeciesRequest) (*catalogv1.GetFeaturedSpeciesResponse, error)
+	calls    atomic.Int32
+	lastMD   metadata.MD
 }
 
 // Cada método conta a chamada, guarda os metadados (quando o teste precisa)
@@ -57,9 +58,14 @@ func (f *fakeServer) GetSpecies(ctx context.Context, r *catalogv1.GetSpeciesRequ
 	return f.get(r)
 }
 
-func (f *fakeServer) ListFilters(ctx context.Context, _ *catalogv1.ListFiltersRequest) (*catalogv1.ListFiltersResponse, error) {
+func (f *fakeServer) ListFilters(ctx context.Context, r *catalogv1.ListFiltersRequest) (*catalogv1.ListFiltersResponse, error) {
 	f.calls.Add(1)
-	return f.filters()
+	return f.filters(r)
+}
+
+func (f *fakeServer) GetFeaturedSpecies(ctx context.Context, r *catalogv1.GetFeaturedSpeciesRequest) (*catalogv1.GetFeaturedSpeciesResponse, error) {
+	f.calls.Add(1)
+	return f.featured(r)
 }
 
 // start sobe o servidor em memória (bufconn: sem rede de verdade) e devolve o cliente do BFF.
@@ -173,18 +179,104 @@ func TestListSpecies_TranslatesRequestAndResponse(t *testing.T) {
 
 // Nos filtros, o bioma UNSPECIFIED e a UF "ZZ" são descartados.
 func TestListFilters_DropsUnknownBiomeAndState(t *testing.T) {
-	srv := &fakeServer{filters: func() (*catalogv1.ListFiltersResponse, error) {
+	srv := &fakeServer{filters: func(*catalogv1.ListFiltersRequest) (*catalogv1.ListFiltersResponse, error) {
 		return &catalogv1.ListFiltersResponse{
 			Biomes: []*catalogv1.BiomeCount{{Biome: catalogv1.Biome_BIOME_PAMPA, SpeciesCount: 3}, {Biome: catalogv1.Biome_BIOME_UNSPECIFIED, SpeciesCount: 9}},
 			States: []*catalogv1.StateCount{{State: "RS", SpeciesCount: 5}, {State: "ZZ", SpeciesCount: 1}},
 		}, nil
 	}}
-	f, err := start(t, srv).ListFilters(context.Background())
+	f, err := start(t, srv).ListFilters(context.Background(), domain.FiltersQuery{Audience: domain.AudienceAdult})
 	if err != nil || len(f.Biomes) != 1 || f.Biomes[0].Biome != domain.BiomePampa || f.Biomes[0].SpeciesCount != 3 || len(f.States) != 1 || f.States[0].State != "RS" {
 		t.Fatalf("got %+v %v", f, err)
 	}
 }
 
+// O detalhe traz o bioma principal, o conteúdo Kids (só o texto dos fatos)
+// e os picos do canto (frente B).
+func TestGetSpecies_KidsPrimaryBiomeAndPeaks(t *testing.T) {
+	srv := &fakeServer{get: func(*catalogv1.GetSpeciesRequest) (*catalogv1.GetSpeciesResponse, error) {
+		return &catalogv1.GetSpeciesResponse{Species: &catalogv1.Species{Id: "t", PrimaryBiome: catalogv1.Biome_BIOME_PAMPA,
+			Kids:  &catalogv1.KidsContent{Description: "D", DidYouKnow: "V", Facts: []*catalogv1.KidsFact{{Text: "F", SourceFact: 1}}},
+			Audio: &catalogv1.Audio{Key: "a.aac", DurationMs: 3000, Peaks: []float32{0, 0.5, 1}}}}, nil
+	}}
+	s, err := start(t, srv).GetSpecies(context.Background(), "t")
+	if err != nil || s.PrimaryBiome != domain.BiomePampa || s.Kids == nil || s.Kids.Description != "D" || s.Kids.DidYouKnow != "V" ||
+		len(s.Kids.Facts) != 1 || s.Kids.Facts[0] != "F" || s.Audio == nil || len(s.Audio.Peaks) != 3 || s.Audio.Peaks[2] != 1 {
+		t.Fatalf("got %+v kids=%+v audio=%+v %v", s, s.Kids, s.Audio, err)
+	}
+}
+
+// Sem bloco Kids e com o bioma principal UNSPECIFIED, os campos ficam
+// vazios (nil e ""), sem aviso no log: é o caso normal de uma ave nova.
+func TestGetSpecies_NoKidsAndUnspecifiedPrimaryBiome(t *testing.T) {
+	srv := &fakeServer{get: func(*catalogv1.GetSpeciesRequest) (*catalogv1.GetSpeciesResponse, error) {
+		return &catalogv1.GetSpeciesResponse{Species: &catalogv1.Species{Id: "t"}}, nil
+	}}
+	s, err := start(t, srv).GetSpecies(context.Background(), "t")
+	if err != nil || s.Kids != nil || s.PrimaryBiome != "" || s.Audio != nil {
+		t.Fatalf("got %+v %v", s, err)
+	}
+}
+
+// A audiência kids vira kids_only, e o bioma principal vai no pedido; o
+// resumo volta com o bioma principal.
+func TestListSpecies_KidsFilters(t *testing.T) {
+	var got *catalogv1.ListSpeciesRequest
+	srv := &fakeServer{list: func(r *catalogv1.ListSpeciesRequest) (*catalogv1.ListSpeciesResponse, error) {
+		got = r
+		return &catalogv1.ListSpeciesResponse{Species: []*catalogv1.SpeciesSummary{{Id: "a", PrimaryBiome: catalogv1.Biome_BIOME_PAMPA}}}, nil
+	}}
+	page, err := start(t, srv).ListSpecies(context.Background(), domain.ListQuery{Limit: 20, Audience: domain.AudienceKids, PrimaryBiome: domain.BiomePampa})
+	if err != nil || !got.GetKidsOnly() || got.GetPrimaryBiome() != catalogv1.Biome_BIOME_PAMPA || page.Items[0].PrimaryBiome != domain.BiomePampa {
+		t.Fatalf("pedido=%v página=%+v %v", got, page, err)
+	}
+	if _, err := start(t, srv).ListSpecies(context.Background(), domain.ListQuery{Limit: 20, Audience: domain.AudienceAdult}); err != nil || got.GetKidsOnly() || got.GetPrimaryBiome() != catalogv1.Biome_BIOME_UNSPECIFIED {
+		t.Fatalf("adulto não manda kids_only nem bioma principal: %v %v", got, err)
+	}
+}
+
+// Os filtros da audiência kids mandam kids_only e trazem as contagens por
+// bioma principal.
+func TestListFilters_KidsAndPrimaryBiomes(t *testing.T) {
+	var got *catalogv1.ListFiltersRequest
+	srv := &fakeServer{filters: func(r *catalogv1.ListFiltersRequest) (*catalogv1.ListFiltersResponse, error) {
+		got = r
+		return &catalogv1.ListFiltersResponse{PrimaryBiomeCounts: []*catalogv1.BiomeCount{{Biome: catalogv1.Biome_BIOME_CERRADO, SpeciesCount: 4}}}, nil
+	}}
+	f, err := start(t, srv).ListFilters(context.Background(), domain.FiltersQuery{Audience: domain.AudienceKids})
+	if err != nil || !got.GetKidsOnly() || len(f.PrimaryBiomes) != 1 || f.PrimaryBiomes[0].Biome != domain.BiomeCerrado || f.PrimaryBiomes[0].SpeciesCount != 4 {
+		t.Fatalf("pedido=%v filtros=%+v %v", got, f, err)
+	}
+}
+
+// A "Ave do dia": a data vai no pedido, e o resumo e o canto voltam. Sem
+// canto, Audio fica nil; sem espécie na resposta, é KindInternal.
+func TestGetFeatured(t *testing.T) {
+	var got string
+	srv := &fakeServer{featured: func(r *catalogv1.GetFeaturedSpeciesRequest) (*catalogv1.GetFeaturedSpeciesResponse, error) {
+		got = r.GetDate()
+		return &catalogv1.GetFeaturedSpeciesResponse{Species: &catalogv1.SpeciesSummary{Id: "t", ThumbnailKey: "k"},
+			Audio: &catalogv1.Audio{Key: "a.aac", Peaks: []float32{1}}}, nil
+	}}
+	c := start(t, srv)
+	f, err := c.GetFeatured(context.Background(), "2026-11-05")
+	if err != nil || got != "2026-11-05" || f.Species.ID != "t" || f.Audio == nil || f.Audio.Peaks[0] != 1 {
+		t.Fatalf("got %+v %v", f, err)
+	}
+	srv.featured = func(*catalogv1.GetFeaturedSpeciesRequest) (*catalogv1.GetFeaturedSpeciesResponse, error) {
+		return &catalogv1.GetFeaturedSpeciesResponse{Species: &catalogv1.SpeciesSummary{Id: "t"}}, nil
+	}
+	if f, err := c.GetFeatured(context.Background(), "2026-11-05"); err != nil || f.Audio != nil {
+		t.Fatalf("sem canto: %+v %v", f, err)
+	}
+	srv.featured = func(*catalogv1.GetFeaturedSpeciesRequest) (*catalogv1.GetFeaturedSpeciesResponse, error) {
+		return &catalogv1.GetFeaturedSpeciesResponse{}, nil
+	}
+	if _, err := c.GetFeatured(context.Background(), "2026-11-05"); domain.KindOf(err) != domain.KindInternal {
+		t.Fatalf("sem espécie deveria ser KindInternal, veio %v", err)
+	}
+}
+
 // Cada código gRPC cai num Kind da tabela única (spec §5.3). O fake devolve
 // uma mensagem "interna", e o teste só olha o Kind: a mensagem do catalog
 // nunca deve decidir nada no BFF.
@@ -193,7 +285,7 @@ func TestErrorCodesMapToKinds(t *testing.T) {
 		codes.Unavailable: domain.KindUnavailable, codes.DeadlineExceeded: domain.KindTimeout,
 		codes.Internal: domain.KindUpstream, codes.Unknown: domain.KindUpstream, codes.ResourceExhausted: domain.KindUpstream,
 		codes.NotFound: domain.KindNotFound, codes.InvalidArgument: domain.KindInvalidArgument, codes.Canceled: domain.KindCanceled,
-		codes.Unimplemented: domain.KindInternal, codes.PermissionDenied: domain.KindInternal, codes.FailedPrecondition: domain.KindInternal,
+		codes.Unimplemented: domain.KindUnimplemented, codes.PermissionDenied: domain.KindInternal, codes.FailedPrecondition: domain.KindInternal,
 	}
 	for code, want := range cases {
 		srv := &fakeServer{get: func(*catalogv1.GetSpeciesRequest) (*catalogv1.GetSpeciesResponse, error) {
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `go test ./internal/adapter/grpcclient/`
Expected: FAIL na compilação (`ListFilters` com argumentos demais, `undefined: GetFeatured`).

- [ ] **Step 3: Implementar**

Salve o patch abaixo em `/tmp/b3-t3-impl.patch` e aplique com `git apply /tmp/b3-t3-impl.patch`:

```diff
diff --git a/internal/adapter/grpcclient/client.go b/internal/adapter/grpcclient/client.go
index 090349c..3e2a139 100644
--- a/internal/adapter/grpcclient/client.go
+++ b/internal/adapter/grpcclient/client.go
@@ -102,7 +102,9 @@ func requestIDInterceptor(ctx context.Context, method string, req, reply any, cc
 
 // ListSpecies converte a consulta do domínio no pedido do proto, chama o
 // catalog e converte a resposta de volta. O bioma só é enviado quando há
-// filtro: o valor zero do enum (UNSPECIFIED) já quer dizer "sem filtro".
+// filtro: o valor zero do enum (UNSPECIFIED) já quer dizer "sem filtro". O
+// mesmo vale para o bioma principal; a audiência kids vira kids_only
+// (frente B).
 //
 // Os métodos Get* do código gerado (GetSpecies(), GetNextPageToken()) nunca
 // quebram com resposta nil: devolvem o valor zero. Por isso o código os usa
@@ -112,6 +114,10 @@ func (c *Client) ListSpecies(ctx context.Context, q domain.ListQuery) (domain.Sp
 	if q.Biome != "" {
 		req.Biome = biomeToProto[q.Biome]
 	}
+	if q.PrimaryBiome != "" {
+		req.PrimaryBiome = biomeToProto[q.PrimaryBiome]
+	}
+	req.KidsOnly = q.Audience == domain.AudienceKids
 	resp, err := c.rpc.ListSpecies(ctx, req)
 	if err != nil {
 		return domain.SpeciesPage{}, translateError(err)
@@ -137,11 +143,12 @@ func (c *Client) GetSpecies(ctx context.Context, id string) (domain.Species, err
 	return mapper{ctx: ctx, log: c.log}.species(resp.GetSpecies()), nil
 }
 
-// ListFilters busca as contagens por bioma e por UF. Valores que o BFF não
-// conhece (um bioma novo no proto, uma UF estranha) são descartados com um
-// aviso no log, para o app nunca receber um filtro que não sabe usar.
-func (c *Client) ListFilters(ctx context.Context) (domain.Filters, error) {
-	resp, err := c.rpc.ListFilters(ctx, &catalogv1.ListFiltersRequest{})
+// ListFilters busca as contagens por bioma, por UF e por bioma principal,
+// na audiência pedida. Valores que o BFF não conhece (um bioma novo no
+// proto, uma UF estranha) são descartados com um aviso no log, para o app
+// nunca receber um filtro que não sabe usar.
+func (c *Client) ListFilters(ctx context.Context, q domain.FiltersQuery) (domain.Filters, error) {
+	resp, err := c.rpc.ListFilters(ctx, &catalogv1.ListFiltersRequest{KidsOnly: q.Audience == domain.AudienceKids})
 	if err != nil {
 		return domain.Filters{}, translateError(err)
 	}
@@ -157,5 +164,24 @@ func (c *Client) ListFilters(ctx context.Context) (domain.Filters, error) {
 			f.States = append(f.States, domain.StateCount{State: uf, SpeciesCount: int(s.GetSpeciesCount())})
 		}
 	}
+	for _, b := range resp.GetPrimaryBiomeCounts() {
+		if d, ok := m.biome(b.GetBiome()); ok {
+			f.PrimaryBiomes = append(f.PrimaryBiomes, domain.BiomeCount{Biome: d, SpeciesCount: int(b.GetSpeciesCount())})
+		}
+	}
 	return f, nil
 }
+
+// GetFeatured busca a "Ave do dia" da data. Como no detalhe, uma resposta
+// sem espécie (o que o contrato não prevê) vira KindInternal.
+func (c *Client) GetFeatured(ctx context.Context, date string) (domain.Featured, error) {
+	resp, err := c.rpc.GetFeaturedSpecies(ctx, &catalogv1.GetFeaturedSpeciesRequest{Date: date})
+	if err != nil {
+		return domain.Featured{}, translateError(err)
+	}
+	if resp.GetSpecies() == nil {
+		return domain.Featured{}, domain.NewError(domain.KindInternal, nil) // resposta inesperada
+	}
+	m := mapper{ctx: ctx, log: c.log}
+	return domain.Featured{Species: m.summary(resp.GetSpecies()), Audio: audio(resp.GetAudio())}, nil
+}
diff --git a/internal/adapter/grpcclient/mapping.go b/internal/adapter/grpcclient/mapping.go
index ce3de8f..7a3d03f 100644
--- a/internal/adapter/grpcclient/mapping.go
+++ b/internal/adapter/grpcclient/mapping.go
@@ -80,6 +80,17 @@ func (m mapper) biome(b catalogv1.Biome) (domain.Biome, bool) {
 	return d, ok
 }
 
+// primaryBiome converte o bioma principal (frente B). UNSPECIFIED quer dizer
+// "sem bioma principal" e vira "" sem aviso; só um valor desconhecido de
+// verdade é registrado no log.
+func (m mapper) primaryBiome(b catalogv1.Biome) domain.Biome {
+	if b == catalogv1.Biome_BIOME_UNSPECIFIED {
+		return ""
+	}
+	d, _ := m.biome(b)
+	return d
+}
+
 // uf normaliza e valida uma sigla de UF vinda do catalog.
 func (m mapper) uf(s string) (string, bool) {
 	uf, ok := domain.NormalizeUF(s)
@@ -92,7 +103,31 @@ func (m mapper) uf(s string) (string, bool) {
 // summary converte o resumo de uma espécie (o card da lista).
 func (m mapper) summary(s *catalogv1.SpeciesSummary) domain.Summary {
 	return domain.Summary{ID: s.GetId(), ScientificName: s.GetScientificName(), CommonName: s.GetCommonNamePt(),
-		ThumbnailKey: s.GetThumbnailKey(), Conservation: conservation(s.GetConservationStatus())}
+		ThumbnailKey: s.GetThumbnailKey(), Conservation: conservation(s.GetConservationStatus()),
+		PrimaryBiome: m.primaryBiome(s.GetPrimaryBiome())}
+}
+
+// audio converte o canto. Ausente ou sem chave = sem canto (nil). Os picos
+// são copiados para uma lista nova, como os ponteiros da espécie.
+func audio(a *catalogv1.Audio) *domain.Audio {
+	if a.GetKey() == "" {
+		return nil
+	}
+	return &domain.Audio{Key: a.GetKey(), DurationMs: int(a.GetDurationMs()), Credit: credit(a.GetCredit()),
+		Peaks: append([]float32(nil), a.GetPeaks()...)}
+}
+
+// kids converte o conteúdo Kids. nil (a espécie ainda não tem) continua nil:
+// é pela ausência que o app sabe que a ave não entra no Kids.
+func kids(k *catalogv1.KidsContent) *domain.KidsContent {
+	if k == nil {
+		return nil
+	}
+	out := &domain.KidsContent{Description: k.GetDescription(), DidYouKnow: k.GetDidYouKnow()}
+	for _, f := range k.GetFacts() {
+		out.Facts = append(out.Facts, f.GetText())
+	}
+	return out
 }
 
 // species converte a espécie completa. Os campos "optional" do proto chegam
@@ -103,6 +138,7 @@ func (m mapper) species(s *catalogv1.Species) domain.Species {
 		ID: s.GetId(), ScientificName: s.GetScientificName(), CommonName: s.GetCommonNamePt(), Family: s.GetFamily(),
 		Conservation: conservation(s.GetConservationStatus()), Description: s.GetDescription(),
 		DescriptionCredit: credit(s.GetDescriptionCredit()),
+		PrimaryBiome:      m.primaryBiome(s.GetPrimaryBiome()), Kids: kids(s.GetKids()), Audio: audio(s.GetAudio()),
 	}
 	if s.SizeCm != nil {
 		v := int(*s.SizeCm)
@@ -129,9 +165,6 @@ func (m mapper) species(s *catalogv1.Species) domain.Species {
 		out.Photos = append(out.Photos, domain.Photo{ThumbKey: p.GetThumbKey(), MediumKey: p.GetMediumKey(), LargeKey: p.GetLargeKey(),
 			Width: int(p.GetWidth()), Height: int(p.GetHeight()), Credit: credit(p.GetCredit())})
 	}
-	if a := s.GetAudio(); a != nil && a.GetKey() != "" { // áudio sem chave = sem áudio
-		out.Audio = &domain.Audio{Key: a.GetKey(), DurationMs: int(a.GetDurationMs()), Credit: credit(a.GetCredit())}
-	}
 	for _, c := range s.GetClusters() {
 		out.Clusters = append(out.Clusters, domain.Cluster{Lat: c.GetLat(), Lng: c.GetLng(), Count: int(c.GetCount()), Precision: c.GetPrecision()})
 	}
@@ -162,7 +195,9 @@ func translateError(err error) error {
 		kind = domain.KindInvalidArgument
 	case codes.Canceled:
 		kind = domain.KindCanceled
-	default: // Unimplemented, PermissionDenied, FailedPrecondition...: erro de versão/config, não queda
+	case codes.Unimplemented: // catalog numa versão sem o método (um deploy desfeito)
+		kind = domain.KindUnimplemented
+	default: // PermissionDenied, FailedPrecondition...: erro de configuração, não queda
 		kind = domain.KindInternal
 	}
 	return domain.NewError(kind, err)
```

- [ ] **Step 4: Rodar os testes**

Run: `go test ./internal/adapter/grpcclient/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: cliente gRPC com Kids, bioma principal, picos e GetFeaturedSpecies"
```

---

### Task 4: Retry e circuit breaker

**Files:**
- Modify: `internal/adapter/resilience/retry.go`, `internal/adapter/resilience/breaker.go`, `internal/adapter/resilience/fakes_test.go`, `internal/adapter/resilience/retry_test.go`, `internal/adapter/resilience/breaker_test.go`

**Interfaces:**
- Consumes: Task 2 (a porta).
- Produces: retry e breaker com `ListFilters(ctx, q)` e `GetFeatured(ctx, date)`.

- [ ] **Step 1: Testes que falham**

Salve o patch abaixo em `/tmp/b3-t4-tests.patch` e aplique com `git apply /tmp/b3-t4-tests.patch`:

```diff
diff --git a/internal/adapter/resilience/breaker_test.go b/internal/adapter/resilience/breaker_test.go
index 4e9454f..b16272a 100644
--- a/internal/adapter/resilience/breaker_test.go
+++ b/internal/adapter/resilience/breaker_test.go
@@ -116,3 +116,16 @@ func TestBreaker_WrapsErrorsAsCircuitOpenKind(t *testing.T) {
 		t.Fatalf("CircuitOpen libera stale e não conta no breaker: %s", k)
 	}
 }
+
+// A "Ave do dia" usa o mesmo breaker das outras chamadas: falhas dela abrem
+// o circuito para todas, porque o catalog é um só.
+func TestBreaker_GetFeaturedSharesTheBreaker(t *testing.T) {
+	s, m := &scripted{errs: []error{kindErr(domain.KindUnavailable)}}, &recMetrics{}
+	b := resilience.NewBreaker(s, fastBreaker(), testLogger(), m)
+	for range 5 {
+		_, _ = b.GetFeatured(context.Background(), "2026-11-05")
+	}
+	if _, err := b.GetSpecies(context.Background(), "x"); domain.KindOf(err) != domain.KindCircuitOpen || s.calls != 5 {
+		t.Fatalf("o circuito deveria estar aberto: err=%v calls=%d", err, s.calls)
+	}
+}
diff --git a/internal/adapter/resilience/fakes_test.go b/internal/adapter/resilience/fakes_test.go
index a8838c1..00e4173 100644
--- a/internal/adapter/resilience/fakes_test.go
+++ b/internal/adapter/resilience/fakes_test.go
@@ -38,16 +38,19 @@ func (s *scripted) next(ctx context.Context) error {
 	return nil
 }
 
-// Os três métodos só consomem o roteiro.
+// Os quatro métodos só consomem o roteiro.
 func (s *scripted) ListSpecies(ctx context.Context, _ domain.ListQuery) (domain.SpeciesPage, error) {
 	return domain.SpeciesPage{}, s.next(ctx)
 }
 func (s *scripted) GetSpecies(ctx context.Context, id string) (domain.Species, error) {
 	return domain.Species{ID: id}, s.next(ctx)
 }
-func (s *scripted) ListFilters(ctx context.Context) (domain.Filters, error) {
+func (s *scripted) ListFilters(ctx context.Context, _ domain.FiltersQuery) (domain.Filters, error) {
 	return domain.Filters{}, s.next(ctx)
 }
+func (s *scripted) GetFeatured(ctx context.Context, _ string) (domain.Featured, error) {
+	return domain.Featured{}, s.next(ctx)
+}
 
 // kindErr cria um erro do domínio com o Kind pedido e sem causa.
 func kindErr(k domain.Kind) error { return domain.NewError(k, nil) }
diff --git a/internal/adapter/resilience/retry_test.go b/internal/adapter/resilience/retry_test.go
index 8b3e8aa..98c042e 100644
--- a/internal/adapter/resilience/retry_test.go
+++ b/internal/adapter/resilience/retry_test.go
@@ -5,6 +5,7 @@ package resilience_test
 
 import (
 	"context"
+	"fmt"
 	"testing"
 	"time"
 
@@ -139,3 +140,22 @@ func TestRetry_StopsWhenContextIsCanceledDuringBackoff(t *testing.T) {
 		t.Fatalf("cancelado no backoff: err=%v calls=%d", err, env.r.calls)
 	}
 }
+
+// A "Ave do dia" passa pelo mesmo retry, com o próprio nome na métrica, e o
+// Unimplemented (catalog numa versão sem o método) não é repetido.
+func TestRetry_GetFeatured(t *testing.T) {
+	s, m := &scripted{errs: []error{kindErr(domain.KindUnavailable), nil}}, &recMetrics{}
+	rd := resilience.NewRetry(s, resilience.RetryConfig{MaxRetries: 2, AttemptTimeout: time.Second,
+		Sleep: func(context.Context, time.Duration) error { return nil }}, m)
+	if _, err := rd.GetFeatured(context.Background(), "2026-11-05"); err != nil || s.calls != 2 {
+		t.Fatalf("err=%v calls=%d", err, s.calls)
+	}
+	if fmt.Sprint(m.attempts) != "[GetFeatured:Unavailable GetFeatured:ok]" {
+		t.Fatalf("métricas: %v", m.attempts)
+	}
+	s = &scripted{errs: []error{kindErr(domain.KindUnimplemented)}}
+	rd = resilience.NewRetry(s, resilience.RetryConfig{MaxRetries: 2, AttemptTimeout: time.Second}, &recMetrics{})
+	if _, err := rd.GetFeatured(context.Background(), "2026-11-05"); domain.KindOf(err) != domain.KindUnimplemented || s.calls != 1 {
+		t.Fatalf("Unimplemented não se repete: err=%v calls=%d", err, s.calls)
+	}
+}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `go test ./internal/adapter/resilience/`
Expected: FAIL na compilação (`rd.GetFeatured undefined`).

- [ ] **Step 3: Implementar**

Salve o patch abaixo em `/tmp/b3-t4-impl.patch` e aplique com `git apply /tmp/b3-t4-impl.patch`:

```diff
diff --git a/internal/adapter/resilience/breaker.go b/internal/adapter/resilience/breaker.go
index 4423054..9f2f706 100644
--- a/internal/adapter/resilience/breaker.go
+++ b/internal/adapter/resilience/breaker.go
@@ -107,7 +107,7 @@ func guard[T any](b *breaker, fn func() (T, error)) (T, error) {
 	return v.(T), nil
 }
 
-// Os três métodos passam pela mesma proteção: um só breaker para o catalog.
+// Os quatro métodos passam pela mesma proteção: um só breaker para o catalog.
 func (b *breaker) ListSpecies(ctx context.Context, q domain.ListQuery) (domain.SpeciesPage, error) {
 	return guard(b, func() (domain.SpeciesPage, error) { return b.next.ListSpecies(ctx, q) })
 }
@@ -116,6 +116,10 @@ func (b *breaker) GetSpecies(ctx context.Context, id string) (domain.Species, er
 	return guard(b, func() (domain.Species, error) { return b.next.GetSpecies(ctx, id) })
 }
 
-func (b *breaker) ListFilters(ctx context.Context) (domain.Filters, error) {
-	return guard(b, func() (domain.Filters, error) { return b.next.ListFilters(ctx) })
+func (b *breaker) ListFilters(ctx context.Context, q domain.FiltersQuery) (domain.Filters, error) {
+	return guard(b, func() (domain.Filters, error) { return b.next.ListFilters(ctx, q) })
+}
+
+func (b *breaker) GetFeatured(ctx context.Context, date string) (domain.Featured, error) {
+	return guard(b, func() (domain.Featured, error) { return b.next.GetFeatured(ctx, date) })
 }
diff --git a/internal/adapter/resilience/retry.go b/internal/adapter/resilience/retry.go
index ac1e321..7f88daa 100644
--- a/internal/adapter/resilience/retry.go
+++ b/internal/adapter/resilience/retry.go
@@ -119,7 +119,7 @@ func do[T any](ctx context.Context, r *retry, method string, fn func(context.Con
 	}
 }
 
-// Os três métodos fazem do retry um CatalogReader: cada um só dá nome à
+// Os quatro métodos fazem do retry um CatalogReader: cada um só dá nome à
 // operação (usado nas métricas) e chama do.
 func (r *retry) ListSpecies(ctx context.Context, q domain.ListQuery) (domain.SpeciesPage, error) {
 	return do(ctx, r, "ListSpecies", func(c context.Context) (domain.SpeciesPage, error) { return r.next.ListSpecies(c, q) })
@@ -129,6 +129,10 @@ func (r *retry) GetSpecies(ctx context.Context, id string) (domain.Species, erro
 	return do(ctx, r, "GetSpecies", func(c context.Context) (domain.Species, error) { return r.next.GetSpecies(c, id) })
 }
 
-func (r *retry) ListFilters(ctx context.Context) (domain.Filters, error) {
-	return do(ctx, r, "ListFilters", func(c context.Context) (domain.Filters, error) { return r.next.ListFilters(c) })
+func (r *retry) ListFilters(ctx context.Context, q domain.FiltersQuery) (domain.Filters, error) {
+	return do(ctx, r, "ListFilters", func(c context.Context) (domain.Filters, error) { return r.next.ListFilters(c, q) })
+}
+
+func (r *retry) GetFeatured(ctx context.Context, date string) (domain.Featured, error) {
+	return do(ctx, r, "GetFeatured", func(c context.Context) (domain.Featured, error) { return r.next.GetFeatured(c, date) })
 }
```

- [ ] **Step 4: Rodar os testes**

Run: `go test ./internal/adapter/resilience/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: retry e breaker também na Ave do dia"
```

---

### Task 5: Cache `bff:v2:`

**Files:**
- Modify: `internal/adapter/cache/cache.go`, `internal/adapter/cache/keys.go`, `internal/adapter/cache/dto.go`, `internal/adapter/cache/cache_test.go`, `internal/adapter/cache/fakes_test.go`

**Interfaces:**
- Consumes: Tasks 1 e 2.
- Produces: chaves `bff:v2:species:<id>`, `bff:v2:filters:<audiência>`, `bff:v2:list:<sha256>` (com audiência e bioma principal), `bff:v2:featured:<data>`; DTOs gravados com `primaryBiome`, `kids`, `peaks`, `primaryBiomes`.

- [ ] **Step 1: Testes que falham**

Salve o patch abaixo em `/tmp/b3-t5-tests.patch` e aplique com `git apply /tmp/b3-t5-tests.patch`:

```diff
diff --git a/internal/adapter/cache/cache_test.go b/internal/adapter/cache/cache_test.go
index 83e5c20..3541767 100644
--- a/internal/adapter/cache/cache_test.go
+++ b/internal/adapter/cache/cache_test.go
@@ -18,7 +18,7 @@ import (
 
 // env junta as peças de um teste: o catalog falso, o store em memória, o
 // relógio, as métricas e o cache montado sobre eles. O campo c é declarado
-// com uma interface anônima com os três métodos, o mesmo formato do
+// com uma interface anônima com os quatro métodos, o mesmo formato do
 // CatalogReader.
 type env struct {
 	cat   *fakeCatalog
@@ -28,7 +28,8 @@ type env struct {
 	c     interface {
 		ListSpecies(context.Context, domain.ListQuery) (domain.SpeciesPage, error)
 		GetSpecies(context.Context, string) (domain.Species, error)
-		ListFilters(context.Context) (domain.Filters, error)
+		ListFilters(context.Context, domain.FiltersQuery) (domain.Filters, error)
+		GetFeatured(context.Context, string) (domain.Featured, error)
 	}
 }
 
@@ -61,7 +62,7 @@ func TestCache_MissThenHitWhileFresh(t *testing.T) {
 	if err != nil || s.ID != "sabia" || meta2.Cache() != "hit" || e.cat.calls.Load() != 1 {
 		t.Fatalf("2ª deveria ser hit sem chamar o catalog: err=%v cache=%q calls=%d", err, meta2.Cache(), e.cat.calls.Load())
 	}
-	if e.store.ttls["bff:v1:species:sabia"] != 24*time.Hour {
+	if e.store.ttls["bff:v2:species:sabia"] != 24*time.Hour {
 		t.Fatalf("o TTL no Redis é a janela de stale (24h): %v", e.store.ttls)
 	}
 	if e.m.count("miss") != 1 || e.m.count("hit") != 1 {
@@ -134,7 +135,7 @@ func TestCache_SearchBypassesCache(t *testing.T) {
 
 // A lista sem busca entra no cache: a mesma consulta usa a mesma chave, e
 // mudar o limit, a UF ou o cursor gera outra chave, sempre no padrão
-// bff:v1:list:<sha256>.
+// bff:v2:list:<sha256>.
 func TestCache_ListWithoutSearchIsCachedAndKeyIsNormalized(t *testing.T) {
 	e := newEnv(t)
 	q := domain.ListQuery{State: "SP", Biome: domain.BiomeCerrado, Limit: 20}
@@ -150,32 +151,73 @@ func TestCache_ListWithoutSearchIsCachedAndKeyIsNormalized(t *testing.T) {
 		t.Fatalf("limit, estado e cursor diferentes geram chaves diferentes: %v", e.store.keys())
 	}
 	for _, k := range e.store.keys() {
-		if len(k) < len("bff:v1:list:")+64 || k[:12] != "bff:v1:list:" {
-			t.Errorf("chave fora do padrão bff:v1:list:{sha256}: %s", k)
+		if len(k) < len("bff:v2:list:")+64 || k[:12] != "bff:v2:list:" {
+			t.Errorf("chave fora do padrão bff:v2:list:{sha256}: %s", k)
 		}
 	}
 }
 
-// Os filtros ficam na chave fixa bff:v1:filters.
+// Os filtros ficam numa chave por audiência: bff:v2:filters:adult e
+// bff:v2:filters:kids.
 func TestCache_FiltersAreCached(t *testing.T) {
 	e := newEnv(t)
-	_, _ = e.c.ListFilters(context.Background())
-	f, err := e.c.ListFilters(context.Background())
-	if err != nil || len(f.Biomes) != 1 || e.cat.calls.Load() != 1 || e.store.keys()[0] != "bff:v1:filters" {
+	adult := domain.FiltersQuery{Audience: domain.AudienceAdult}
+	_, _ = e.c.ListFilters(context.Background(), adult)
+	f, err := e.c.ListFilters(context.Background(), adult)
+	if err != nil || len(f.Biomes) != 1 || len(f.PrimaryBiomes) != 1 || e.cat.calls.Load() != 1 || e.store.keys()[0] != "bff:v2:filters:adult" {
 		t.Fatalf("filtros: %+v err=%v calls=%d keys=%v", f, err, e.cat.calls.Load(), e.store.keys())
 	}
+	_, _ = e.c.ListFilters(context.Background(), domain.FiltersQuery{Audience: domain.AudienceKids})
+	if e.cat.calls.Load() != 2 || len(e.store.keys()) != 2 {
+		t.Fatalf("a audiência kids tem a própria chave: calls=%d keys=%v", e.cat.calls.Load(), e.store.keys())
+	}
+}
+
+// A audiência e o bioma principal entram no hash da lista: a mesma consulta
+// nas duas jornadas (ou em dois mundos) não divide a mesma chave.
+func TestCache_ListKeyIncludesAudienceAndPrimaryBiome(t *testing.T) {
+	e := newEnv(t)
+	for _, q := range []domain.ListQuery{
+		{Limit: 20, Audience: domain.AudienceAdult},
+		{Limit: 20, Audience: domain.AudienceKids},
+		{Limit: 20, Audience: domain.AudienceKids, PrimaryBiome: domain.BiomePampa},
+	} {
+		_, _ = e.c.ListSpecies(context.Background(), q)
+	}
+	if len(e.store.keys()) != 3 {
+		t.Fatalf("esperava 3 chaves, veio %v", e.store.keys())
+	}
+}
+
+// A "Ave do dia" fica na chave da data. Dentro do dia, com o catalog fora
+// do ar, sai a ave guardada; no dia seguinte a chave é outra, e sem
+// candidato o erro aparece: a ave de ontem nunca sai.
+func TestCache_FeaturedIsKeyedByDate(t *testing.T) {
+	e := newEnv(t)
+	if _, err := e.c.GetFeatured(context.Background(), "2026-11-05"); err != nil || e.store.keys()[0] != "bff:v2:featured:2026-11-05" {
+		t.Fatalf("err=%v keys=%v", err, e.store.keys())
+	}
+	e.clk.Advance(11 * time.Minute)
+	e.cat.err = domain.NewError(domain.KindUnavailable, errors.New("fora"))
+	ctx, meta := ctxWithMeta()
+	if f, err := e.c.GetFeatured(ctx, "2026-11-05"); err != nil || f.Species.ID != "turdus-rufiventris" || meta.Cache() != "stale" {
+		t.Fatalf("dentro do dia sai a guardada: %+v %v %q", f, err, meta.Cache())
+	}
+	if _, err := e.c.GetFeatured(context.Background(), "2026-11-06"); domain.KindOf(err) != domain.KindUnavailable {
+		t.Fatalf("no dia seguinte não há candidato: %v", err)
+	}
 }
 
 // Um valor ilegível no store é tratado como "não tem", e a resposta boa o
 // sobrescreve.
 func TestCache_InvalidEnvelopeIsMiss(t *testing.T) {
 	e := newEnv(t)
-	e.store.data["bff:v1:species:sabia"] = []byte("{isto não é um envelope")
+	e.store.data["bff:v2:species:sabia"] = []byte("{isto não é um envelope")
 	ctx, meta := ctxWithMeta()
 	if _, err := e.c.GetSpecies(ctx, "sabia"); err != nil || meta.Cache() != "miss" || e.cat.calls.Load() != 1 {
 		t.Fatalf("envelope inválido = miss: err=%v cache=%q calls=%d", err, meta.Cache(), e.cat.calls.Load())
 	}
-	if string(e.store.data["bff:v1:species:sabia"]) == "{isto não é um envelope" {
+	if string(e.store.data["bff:v2:species:sabia"]) == "{isto não é um envelope" {
 		t.Fatal("o envelope ruim deveria ser sobrescrito pelo bom")
 	}
 }
@@ -300,9 +342,11 @@ func TestCache_DetailRoundTripKeepsEveryField(t *testing.T) {
 		CommonName: "Sabiá", ScientificName: "Turdus rufiventris", Family: "Turdidae", SizeCm: &size, Diet: &diet, Conservation: "LC",
 		Description: "d", DescriptionCredit: domain.Credit{Author: "a", License: "l", Source: "s", SourceURL: "u"},
 		Facts: []domain.Fact{{Text: "t", Source: "s"}}, Biomes: []domain.Biome{domain.BiomeCerrado}, States: []string{"SP"},
-		Photos:   []domain.Photo{{ThumbKey: "t", MediumKey: "m", LargeKey: "l", Width: 1, Height: 2, Credit: domain.Credit{Author: "p"}}},
-		Audio:    &domain.Audio{Key: "k", DurationMs: 5, Credit: domain.Credit{Author: "z"}},
-		Clusters: []domain.Cluster{{Lat: 1, Lng: 2, Count: 3, Precision: 0.5}},
+		Photos:       []domain.Photo{{ThumbKey: "t", MediumKey: "m", LargeKey: "l", Width: 1, Height: 2, Credit: domain.Credit{Author: "p"}}},
+		Audio:        &domain.Audio{Key: "k", DurationMs: 5, Credit: domain.Credit{Author: "z"}, Peaks: []float32{0, 1}},
+		Clusters:     []domain.Cluster{{Lat: 1, Lng: 2, Count: 3, Precision: 0.5}},
+		PrimaryBiome: domain.BiomeCerrado,
+		Kids:         &domain.KidsContent{Description: "kd", Facts: []string{"kf"}, DidYouKnow: "kv"},
 	}
 	first, _ := e.c.GetSpecies(context.Background(), "sabia")
 	second, err := e.c.GetSpecies(context.Background(), "sabia") // veio do Redis
@@ -311,7 +355,9 @@ func TestCache_DetailRoundTripKeepsEveryField(t *testing.T) {
 	}
 	if e.cat.calls.Load() != 1 || second.CommonName != first.CommonName || *second.SizeCm != 23 || *second.Diet != "frutos" ||
 		second.Audio == nil || second.Audio.Key != "k" || len(second.Photos) != 1 || second.Photos[0].LargeKey != "l" ||
-		len(second.Clusters) != 1 || second.Clusters[0].Precision != 0.5 || len(second.Biomes) != 1 || second.States[0] != "SP" || second.Facts[0].Text != "t" {
+		len(second.Clusters) != 1 || second.Clusters[0].Precision != 0.5 || len(second.Biomes) != 1 || second.States[0] != "SP" || second.Facts[0].Text != "t" ||
+		second.PrimaryBiome != domain.BiomeCerrado || second.Kids == nil || second.Kids.Facts[0] != "kf" || second.Kids.DidYouKnow != "kv" ||
+		len(second.Audio.Peaks) != 2 || second.Audio.Peaks[1] != 1 {
 		t.Fatalf("o que sai do cache precisa ser igual ao que entrou: %+v", second)
 	}
 	// Mantém o import de errors em uso neste arquivo.
diff --git a/internal/adapter/cache/fakes_test.go b/internal/adapter/cache/fakes_test.go
index 6cc18e7..7a8c1c0 100644
--- a/internal/adapter/cache/fakes_test.go
+++ b/internal/adapter/cache/fakes_test.go
@@ -80,7 +80,7 @@ type fakeCatalog struct {
 	entered chan struct{} // avisa que a chamada começou (se não for nil)
 }
 
-// wait é o miolo das três chamadas: conta, avisa (sem bloquear, graças ao
+// wait é o miolo das quatro chamadas: conta, avisa (sem bloquear, graças ao
 // default do select), espera o gate ou o fim do contexto e devolve o erro
 // configurado. select espera o primeiro de vários canais que ficar pronto.
 func (f *fakeCatalog) wait(ctx context.Context) error {
@@ -101,7 +101,7 @@ func (f *fakeCatalog) wait(ctx context.Context) error {
 	return f.err
 }
 
-// Os três métodos devolvem dados fixos. Na lista, o nome comum leva o texto
+// Os quatro métodos devolvem dados fixos. Na lista, o nome comum leva o texto
 // buscado, para o teste saber qual consulta chegou ao catalog.
 func (f *fakeCatalog) ListSpecies(ctx context.Context, q domain.ListQuery) (domain.SpeciesPage, error) {
 	if err := f.wait(ctx); err != nil {
@@ -119,11 +119,19 @@ func (f *fakeCatalog) GetSpecies(ctx context.Context, id string) (domain.Species
 	return s, nil
 }
 
-func (f *fakeCatalog) ListFilters(ctx context.Context) (domain.Filters, error) {
+func (f *fakeCatalog) ListFilters(ctx context.Context, _ domain.FiltersQuery) (domain.Filters, error) {
 	if err := f.wait(ctx); err != nil {
 		return domain.Filters{}, err
 	}
-	return domain.Filters{Biomes: []domain.BiomeCount{{Biome: domain.BiomePampa, SpeciesCount: 3}}}, nil
+	return domain.Filters{Biomes: []domain.BiomeCount{{Biome: domain.BiomePampa, SpeciesCount: 3}},
+		PrimaryBiomes: []domain.BiomeCount{{Biome: domain.BiomePampa, SpeciesCount: 2}}}, nil
+}
+
+func (f *fakeCatalog) GetFeatured(ctx context.Context, _ string) (domain.Featured, error) {
+	if err := f.wait(ctx); err != nil {
+		return domain.Featured{}, err
+	}
+	return domain.Featured{Species: domain.Summary{ID: "turdus-rufiventris"}, Audio: &domain.Audio{Key: "a", Peaks: []float32{1}}}, nil
 }
 
 // clock é um relógio falso: Now devolve a hora guardada e Advance a empurra
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `go test ./internal/adapter/cache/`
Expected: FAIL na compilação (`e.c.GetFeatured undefined`; o `New` ainda não devolve a porta nova).

- [ ] **Step 3: Implementar**

Salve o patch abaixo em `/tmp/b3-t5-impl.patch` e aplique com `git apply /tmp/b3-t5-impl.patch`:

```diff
diff --git a/internal/adapter/cache/cache.go b/internal/adapter/cache/cache.go
index 417c946..08d840d 100644
--- a/internal/adapter/cache/cache.go
+++ b/internal/adapter/cache/cache.go
@@ -164,16 +164,24 @@ func cached[T, D any](ctx context.Context, c *cache, key string, call func(conte
 	}
 }
 
-// Os três métodos abaixo fazem do cache um CatalogReader: cada um só escolhe
+// Os quatro métodos abaixo fazem do cache um CatalogReader: cada um só escolhe
 // a chave e as funções de conversão e delega a cached.
 func (c *cache) GetSpecies(ctx context.Context, id string) (domain.Species, error) {
 	return cached(ctx, c, speciesKey(id),
 		func(cx context.Context) (domain.Species, error) { return c.next.GetSpecies(cx, id) }, speciesTo, speciesFrom)
 }
 
-func (c *cache) ListFilters(ctx context.Context) (domain.Filters, error) {
-	return cached(ctx, c, filtersKey,
-		func(cx context.Context) (domain.Filters, error) { return c.next.ListFilters(cx) }, filtersTo, filtersFrom)
+func (c *cache) ListFilters(ctx context.Context, q domain.FiltersQuery) (domain.Filters, error) {
+	return cached(ctx, c, filtersKey(q.Audience),
+		func(cx context.Context) (domain.Filters, error) { return c.next.ListFilters(cx, q) }, filtersTo, filtersFrom)
+}
+
+// GetFeatured guarda a "Ave do dia" na chave da data, com o mesmo fresco,
+// velho e singleflight das outras respostas. Dentro do dia, um catalog fora
+// do ar serve a ave já guardada; no dia seguinte, a chave é outra.
+func (c *cache) GetFeatured(ctx context.Context, date string) (domain.Featured, error) {
+	return cached(ctx, c, featuredKey(date),
+		func(cx context.Context) (domain.Featured, error) { return c.next.GetFeatured(cx, date) }, featuredTo, featuredFrom)
 }
 
 func (c *cache) ListSpecies(ctx context.Context, q domain.ListQuery) (domain.SpeciesPage, error) {
diff --git a/internal/adapter/cache/dto.go b/internal/adapter/cache/dto.go
index 409f172..2307fd9 100644
--- a/internal/adapter/cache/dto.go
+++ b/internal/adapter/cache/dto.go
@@ -29,6 +29,7 @@ type summaryJSON struct {
 	Common       string `json:"commonName"`
 	ThumbnailKey string `json:"thumbnailKey"`
 	Conservation string `json:"conservation"`
+	PrimaryBiome string `json:"primaryBiome"`
 }
 
 // pageJSON é uma página da lista gravada, com o cursor da próxima.
@@ -47,11 +48,25 @@ type photoJSON struct {
 	Credit creditJSON `json:"credit"`
 }
 
-// audioJSON é o canto gravado.
+// audioJSON é o canto gravado, com os picos da forma de onda.
 type audioJSON struct {
 	Key        string     `json:"key"`
 	DurationMs int        `json:"durationMs"`
 	Credit     creditJSON `json:"credit"`
+	Peaks      []float32  `json:"peaks"`
+}
+
+// kidsJSON é o conteúdo Kids gravado.
+type kidsJSON struct {
+	Description string   `json:"description"`
+	Facts       []string `json:"facts"`
+	DidYouKnow  string   `json:"didYouKnow"`
+}
+
+// featuredJSON é a "Ave do dia" gravada.
+type featuredJSON struct {
+	Species summaryJSON `json:"species"`
+	Audio   *audioJSON  `json:"audio"`
 }
 
 // factJSON é uma curiosidade gravada.
@@ -86,6 +101,8 @@ type speciesJSON struct {
 	Photos       []photoJSON   `json:"photos"`
 	Audio        *audioJSON    `json:"audio"`
 	Clusters     []clusterJSON `json:"clusters"`
+	PrimaryBiome string        `json:"primaryBiome"`
+	Kids         *kidsJSON     `json:"kids"`
 }
 
 // filtersJSON são os filtros gravados. As structs dentro da lista são
@@ -99,6 +116,13 @@ type filtersJSON struct {
 		State string `json:"state"`
 		Count int    `json:"count"`
 	} `json:"states"`
+	PrimaryBiomes []biomeCountJSON `json:"primaryBiomes"`
+}
+
+// biomeCountJSON é uma contagem por bioma principal gravada.
+type biomeCountJSON struct {
+	Biome string `json:"biome"`
+	Count int    `json:"count"`
 }
 
 // As funções xxxTo convertem do domínio para o DTO (na gravação) e as
@@ -110,10 +134,32 @@ func creditFrom(c creditJSON) domain.Credit {
 	return domain.Credit{Author: c.Author, License: c.License, Source: c.Source, SourceURL: c.SourceURL}
 }
 
+func summaryTo(s domain.Summary) summaryJSON {
+	return summaryJSON{s.ID, s.ScientificName, s.CommonName, s.ThumbnailKey, string(s.Conservation), string(s.PrimaryBiome)}
+}
+func summaryFrom(s summaryJSON) domain.Summary {
+	return domain.Summary{ID: s.ID, ScientificName: s.Scientific, CommonName: s.Common, ThumbnailKey: s.ThumbnailKey,
+		Conservation: domain.ConservationStatus(s.Conservation), PrimaryBiome: domain.Biome(s.PrimaryBiome)}
+}
+
+// audioTo e audioFrom convertem o canto; nil (sem canto) continua nil.
+func audioTo(a *domain.Audio) *audioJSON {
+	if a == nil {
+		return nil
+	}
+	return &audioJSON{a.Key, a.DurationMs, creditTo(a.Credit), a.Peaks}
+}
+func audioFrom(a *audioJSON) *domain.Audio {
+	if a == nil {
+		return nil
+	}
+	return &domain.Audio{Key: a.Key, DurationMs: a.DurationMs, Credit: creditFrom(a.Credit), Peaks: a.Peaks}
+}
+
 func pageTo(p domain.SpeciesPage) pageJSON {
 	out := pageJSON{NextCursor: p.NextCursor, Items: make([]summaryJSON, 0, len(p.Items))}
 	for _, s := range p.Items {
-		out.Items = append(out.Items, summaryJSON{s.ID, s.ScientificName, s.CommonName, s.ThumbnailKey, string(s.Conservation)})
+		out.Items = append(out.Items, summaryTo(s))
 	}
 	return out
 }
@@ -121,14 +167,25 @@ func pageTo(p domain.SpeciesPage) pageJSON {
 func pageFrom(p pageJSON) domain.SpeciesPage {
 	out := domain.SpeciesPage{NextCursor: p.NextCursor, Items: make([]domain.Summary, 0, len(p.Items))}
 	for _, s := range p.Items {
-		out.Items = append(out.Items, domain.Summary{ID: s.ID, ScientificName: s.Scientific, CommonName: s.Common, ThumbnailKey: s.ThumbnailKey, Conservation: domain.ConservationStatus(s.Conservation)})
+		out.Items = append(out.Items, summaryFrom(s))
 	}
 	return out
 }
 
+func featuredTo(f domain.Featured) featuredJSON {
+	return featuredJSON{Species: summaryTo(f.Species), Audio: audioTo(f.Audio)}
+}
+func featuredFrom(f featuredJSON) domain.Featured {
+	return domain.Featured{Species: summaryFrom(f.Species), Audio: audioFrom(f.Audio)}
+}
+
 func speciesTo(s domain.Species) speciesJSON {
 	out := speciesJSON{ID: s.ID, Scientific: s.ScientificName, Common: s.CommonName, Family: s.Family, SizeCm: s.SizeCm, Diet: s.Diet,
-		Conservation: string(s.Conservation), Description: s.Description, DescCredit: creditTo(s.DescriptionCredit), States: s.States}
+		Conservation: string(s.Conservation), Description: s.Description, DescCredit: creditTo(s.DescriptionCredit), States: s.States,
+		Audio: audioTo(s.Audio), PrimaryBiome: string(s.PrimaryBiome)}
+	if s.Kids != nil {
+		out.Kids = &kidsJSON{s.Kids.Description, s.Kids.Facts, s.Kids.DidYouKnow}
+	}
 	for _, f := range s.Facts {
 		out.Facts = append(out.Facts, factJSON{f.Text, f.Source})
 	}
@@ -138,9 +195,6 @@ func speciesTo(s domain.Species) speciesJSON {
 	for _, p := range s.Photos {
 		out.Photos = append(out.Photos, photoJSON{p.ThumbKey, p.MediumKey, p.LargeKey, p.Width, p.Height, creditTo(p.Credit)})
 	}
-	if s.Audio != nil {
-		out.Audio = &audioJSON{s.Audio.Key, s.Audio.DurationMs, creditTo(s.Audio.Credit)}
-	}
 	for _, c := range s.Clusters {
 		out.Clusters = append(out.Clusters, clusterJSON{c.Lat, c.Lng, c.Count, c.Precision})
 	}
@@ -149,7 +203,11 @@ func speciesTo(s domain.Species) speciesJSON {
 
 func speciesFrom(s speciesJSON) domain.Species {
 	out := domain.Species{ID: s.ID, ScientificName: s.Scientific, CommonName: s.Common, Family: s.Family, SizeCm: s.SizeCm, Diet: s.Diet,
-		Conservation: domain.ConservationStatus(s.Conservation), Description: s.Description, DescriptionCredit: creditFrom(s.DescCredit), States: s.States}
+		Conservation: domain.ConservationStatus(s.Conservation), Description: s.Description, DescriptionCredit: creditFrom(s.DescCredit), States: s.States,
+		Audio: audioFrom(s.Audio), PrimaryBiome: domain.Biome(s.PrimaryBiome)}
+	if s.Kids != nil {
+		out.Kids = &domain.KidsContent{Description: s.Kids.Description, Facts: s.Kids.Facts, DidYouKnow: s.Kids.DidYouKnow}
+	}
 	for _, f := range s.Facts {
 		out.Facts = append(out.Facts, domain.Fact{Text: f.Text, Source: f.Source})
 	}
@@ -159,9 +217,6 @@ func speciesFrom(s speciesJSON) domain.Species {
 	for _, p := range s.Photos {
 		out.Photos = append(out.Photos, domain.Photo{ThumbKey: p.Thumb, MediumKey: p.Medium, LargeKey: p.Large, Width: p.Width, Height: p.Height, Credit: creditFrom(p.Credit)})
 	}
-	if s.Audio != nil {
-		out.Audio = &domain.Audio{Key: s.Audio.Key, DurationMs: s.Audio.DurationMs, Credit: creditFrom(s.Audio.Credit)}
-	}
 	for _, c := range s.Clusters {
 		out.Clusters = append(out.Clusters, domain.Cluster{Lat: c.Lat, Lng: c.Lng, Count: c.Count, Precision: c.Precision})
 	}
@@ -182,6 +237,9 @@ func filtersTo(f domain.Filters) filtersJSON {
 			Count int    `json:"count"`
 		}{s.State, s.SpeciesCount})
 	}
+	for _, b := range f.PrimaryBiomes {
+		out.PrimaryBiomes = append(out.PrimaryBiomes, biomeCountJSON{string(b.Biome), b.SpeciesCount})
+	}
 	return out
 }
 
@@ -193,5 +251,8 @@ func filtersFrom(f filtersJSON) domain.Filters {
 	for _, s := range f.States {
 		out.States = append(out.States, domain.StateCount{State: s.State, SpeciesCount: s.Count})
 	}
+	for _, b := range f.PrimaryBiomes {
+		out.PrimaryBiomes = append(out.PrimaryBiomes, domain.BiomeCount{Biome: domain.Biome(b.Biome), SpeciesCount: b.Count})
+	}
 	return out
 }
diff --git a/internal/adapter/cache/keys.go b/internal/adapter/cache/keys.go
index c6e9ecf..b270823 100644
--- a/internal/adapter/cache/keys.go
+++ b/internal/adapter/cache/keys.go
@@ -1,5 +1,6 @@
 // Chaves do Redis. Toda chave começa com o prefixo de versão, seguido do tipo
-// de dado: "bff:v1:species:<id>", "bff:v1:filters" e "bff:v1:list:<hash>".
+// de dado: "bff:v2:species:<id>", "bff:v2:filters:<audiência>",
+// "bff:v2:list:<hash>" e "bff:v2:featured:<data>".
 
 package cache
 
@@ -11,17 +12,25 @@ import (
 	"github.com/velosobr/passarim-bff/internal/domain"
 )
 
-// "v1" é a versão do FORMATO do envelope: se a struct do envelope mudar, suba para v2
-// (as chaves antigas simplesmente deixam de ser lidas e expiram sozinhas).
-const keyPrefix = "bff:v1:"
+// "v2" é a versão do FORMATO do que fica guardado: se o envelope ou um DTO
+// gravado mudar, a versão sobe (as chaves antigas simplesmente deixam de ser
+// lidas e expiram sozinhas). Subiu para v2 na frente B, quando o detalhe
+// ganhou kids, primaryBiome e os picos do canto: com o v1, o BFF serviria um
+// detalhe sem kids por até 10 minutos depois do deploy.
+const keyPrefix = "bff:v2:"
 
 // speciesKey é a chave de uma espécie. O id já foi validado (só a–z, 0–9 e
 // hífen), então pode entrar direto na chave.
 func speciesKey(id string) string { return keyPrefix + "species:" + id }
 
-// filtersKey é a chave única dos filtros: a resposta não depende de nenhum
-// parâmetro.
-const filtersKey = keyPrefix + "filters"
+// filtersKey é a chave dos filtros de uma audiência: as contagens da
+// jornada Kids só consideram as aves com conteúdo Kids.
+func filtersKey(a domain.Audience) string { return keyPrefix + "filters:" + string(a) }
+
+// featuredKey é a chave da "Ave do dia" de uma data. A data muda à
+// meia-noite de São Paulo, e com ela a chave: a ave de ontem nunca sai, nem
+// como dado velho.
+func featuredKey(date string) string { return keyPrefix + "featured:" + date }
 
 // listKey: o hash é calculado sobre o ListQuery JÁ normalizado (q aparado, UF em maiúsculas,
 // limit efetivo), então consultas equivalentes compartilham a mesma chave. Os campos entram
@@ -34,7 +43,7 @@ const filtersKey = keyPrefix + "filters"
 // qualquer que seja o cursor.
 func listKey(q domain.ListQuery) string {
 	h := sha256.New()
-	for _, part := range []string{q.Q, string(q.Biome), q.State, q.Cursor, strconv.Itoa(q.Limit)} {
+	for _, part := range []string{q.Q, string(q.Biome), q.State, q.Cursor, strconv.Itoa(q.Limit), string(q.Audience), string(q.PrimaryBiome)} {
 		h.Write([]byte(strconv.Itoa(len(part))))
 		h.Write([]byte{':'})
 		h.Write([]byte(part))
```

- [ ] **Step 4: Rodar os testes**

Run: `go test ./internal/adapter/cache/`
Expected: PASS (com Docker, para os testes do Redis).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: cache bff:v2 com audiência, bioma principal e a Ave do dia por data"
```

---

### Task 6: REST — rotas, DTOs, erros, contrato e ligação no main

**Files:**
- Modify: `internal/adapter/http/handler.go`, `internal/adapter/http/dto.go`, `internal/adapter/http/errors.go`, `internal/adapter/http/problem.go`, `cmd/bff/main.go`, `openapi.yaml`, `internal/adapter/http/handler_test.go`, `internal/adapter/http/contract_test.go`

**Interfaces:**
- Consumes: Tasks 1 a 5.
- Produces: `httpadapter.FeaturedGetter`, `Handler.Featured`, rota `GET /v1/featured`, código `FEATURED_NOT_FOUND`; `openapi.yaml` 1.1.0.

- [ ] **Step 1: Testes que falham**

Salve o patch abaixo em `/tmp/b3-t6-tests.patch` e aplique com `git apply /tmp/b3-t6-tests.patch`:

```diff
diff --git a/internal/adapter/http/contract_test.go b/internal/adapter/http/contract_test.go
index f1652f2..bb0ddd6 100644
--- a/internal/adapter/http/contract_test.go
+++ b/internal/adapter/http/contract_test.go
@@ -31,20 +31,26 @@ import (
 
 // stubCatalog é o "catalog" por baixo dos casos de uso REAIS: cada cenário escolhe o que ele devolve.
 type stubCatalog struct {
-	page    domain.SpeciesPage
-	species domain.Species
-	filters domain.Filters
-	err     error
+	page     domain.SpeciesPage
+	species  domain.Species
+	filters  domain.Filters
+	featured domain.Featured
+	err      error
 }
 
-// Os três métodos devolvem o que o cenário configurou.
+// Os quatro métodos devolvem o que o cenário configurou.
 func (s *stubCatalog) ListSpecies(context.Context, domain.ListQuery) (domain.SpeciesPage, error) {
 	return s.page, s.err
 }
 func (s *stubCatalog) GetSpecies(context.Context, string) (domain.Species, error) {
 	return s.species, s.err
 }
-func (s *stubCatalog) ListFilters(context.Context) (domain.Filters, error) { return s.filters, s.err }
+func (s *stubCatalog) ListFilters(context.Context, domain.FiltersQuery) (domain.Filters, error) {
+	return s.filters, s.err
+}
+func (s *stubCatalog) GetFeatured(context.Context, string) (domain.Featured, error) {
+	return s.featured, s.err
+}
 
 // Garante, na compilação, que o stub satisfaz a porta.
 var _ usecase.CatalogReader = (*stubCatalog)(nil)
@@ -62,7 +68,9 @@ func stack(t *testing.T, cat usecase.CatalogReader, burst int) (http.Handler, *h
 		List:    usecase.ListSpecies{Catalog: cat, Budget: time.Second},
 		Get:     usecase.GetSpecies{Catalog: cat, Budget: time.Second},
 		Filters: usecase.ListFilters{Catalog: cat, Budget: time.Second},
-		Media:   m, Log: log,
+		Featured: usecase.GetFeatured{Catalog: cat, Budget: time.Second,
+			Now: func() time.Time { return time.Date(2026, 11, 5, 15, 0, 0, 0, time.UTC) }},
+		Media: m, Log: log,
 	}
 	ip := func(*http.Request) string { return "203.0.113.9" }
 	rl := middleware.NewRateLimiter(middleware.RateLimitConfig{RPS: 1, Burst: burst, MaxIPs: 10, IdleAfter: time.Minute}, ip, time.Now)
@@ -118,8 +126,11 @@ func fullSpecies() domain.Species {
 		States:            []string{"SP"},
 		Photos: []domain.Photo{{ThumbKey: "species/t/photo-1-thumb.webp", MediumKey: "species/t/photo-1-medium.webp", LargeKey: "species/t/photo-1-large.webp",
 			Width: 1600, Height: 1067, Credit: domain.Credit{Author: "Fulano", License: "CC-BY-NC", Source: "inaturalist", SourceURL: "https://www.inaturalist.org/photos/1"}}},
-		Audio:    &domain.Audio{Key: "species/t/audio-9.aac", DurationMs: 21500, Credit: domain.Credit{Author: "B", License: "CC-BY-NC-SA", Source: "xeno-canto", SourceURL: "https://xeno-canto.org/9"}},
-		Clusters: []domain.Cluster{{Lat: -23.5, Lng: -46.6, Count: 42, Precision: 0.5}},
+		Audio: &domain.Audio{Key: "species/t/audio-9.aac", DurationMs: 21500, Credit: domain.Credit{Author: "B", License: "CC-BY-NC-SA", Source: "xeno-canto", SourceURL: "https://xeno-canto.org/9"},
+			Peaks: []float32{0, 0.25, 1}},
+		Clusters:     []domain.Cluster{{Lat: -23.5, Lng: -46.6, Count: 42, Precision: 0.5}},
+		PrimaryBiome: domain.BiomeMataAtlantica,
+		Kids:         &domain.KidsContent{Description: "O sabiá é laranja. Ele canta.", Facts: []string{"Ele imita outras aves."}, DidYouKnow: "Ele acorda cedo."},
 	}
 }
 
@@ -159,6 +170,17 @@ func TestContract_ResponsesMatchOpenAPI(t *testing.T) {
 		{"detalhe só com o mínimo 200 (nulos e listas vazias)", "GET", "/v1/species/x", &stubCatalog{species: domain.Species{ID: "x"}}, 200, false},
 		{"filtros 200", "GET", "/v1/filters", &stubCatalog{filters: domain.Filters{
 			Biomes: []domain.BiomeCount{{Biome: domain.BiomePampa, SpeciesCount: 3}}, States: []domain.StateCount{{State: "RS", SpeciesCount: 5}}}}, 200, false},
+		{"filtros kids 200", "GET", "/v1/filters?audience=kids", &stubCatalog{filters: domain.Filters{
+			PrimaryBiomes: []domain.BiomeCount{{Biome: domain.BiomeCerrado, SpeciesCount: 4}}}}, 200, false},
+		{"lista kids 200", "GET", "/v1/species?audience=kids&primaryBiome=pampa", &stubCatalog{page: domain.SpeciesPage{Items: []domain.Summary{
+			{ID: "a", CommonName: "A", ScientificName: "A a", PrimaryBiome: domain.BiomePampa}}}}, 200, false},
+		{"400 audiência inválida", "GET", "/v1/filters?audience=todos", &stubCatalog{}, 400, false},
+		{"ave do dia 200", "GET", "/v1/featured", &stubCatalog{featured: domain.Featured{
+			Species: domain.Summary{ID: "t", CommonName: "Sabiá", ScientificName: "Turdus rufiventris", PrimaryBiome: domain.BiomeMataAtlantica},
+			Audio:   &domain.Audio{Key: "species/t/a.aac", DurationMs: 3000, Peaks: []float32{0.5}}}}, 200, false},
+		{"ave do dia sem canto 200", "GET", "/v1/featured", &stubCatalog{featured: domain.Featured{Species: domain.Summary{ID: "t"}}}, 200, false},
+		{"404 sem ave do dia", "GET", "/v1/featured", &stubCatalog{err: domain.NewError(domain.KindNotFound, errors.New("x"))}, 404, false},
+		{"503 catalog sem o método", "GET", "/v1/featured", &stubCatalog{err: domain.NewError(domain.KindUnimplemented, errors.New("x"))}, 503, false},
 		{"400 parâmetros inválidos", "GET", "/v1/species?limit=999&state=XX&biome=deserto", &stubCatalog{}, 400, false},
 		{"400 id inválido", "GET", "/v1/species/ABC_def", &stubCatalog{}, 400, false},
 		{"404 espécie", "GET", "/v1/species/nao-existe", &stubCatalog{err: domain.NewError(domain.KindNotFound, errors.New("x"))}, 404, false},
@@ -223,7 +245,9 @@ func TestContract_Panic500(t *testing.T) {
 // panicCatalog é um catalog que entra em pânico ao listar os filtros.
 type panicCatalog struct{ *stubCatalog }
 
-func (panicCatalog) ListFilters(context.Context) (domain.Filters, error) { panic("boom") }
+func (panicCatalog) ListFilters(context.Context, domain.FiltersQuery) (domain.Filters, error) {
+	panic("boom")
+}
 
 // Toda rota registrada precisa estar documentada: esquecer de atualizar o openapi.yaml quebra o CI.
 func TestContract_EveryRegisteredRouteIsDocumented(t *testing.T) {
diff --git a/internal/adapter/http/handler_test.go b/internal/adapter/http/handler_test.go
index cc9c14b..eb02419 100644
--- a/internal/adapter/http/handler_test.go
+++ b/internal/adapter/http/handler_test.go
@@ -17,6 +17,7 @@ import (
 	"github.com/velosobr/passarim-bff/internal/adapter/media"
 	"github.com/velosobr/passarim-bff/internal/adapter/reqmeta"
 	"github.com/velosobr/passarim-bff/internal/domain"
+	"github.com/velosobr/passarim-bff/internal/usecase"
 )
 
 // Fakes dos casos de uso: o handler só conhece as interfaces.
@@ -43,21 +44,38 @@ func (f *fakeGet) Run(context.Context, string) (domain.Species, error) { return
 type fakeFilters struct {
 	f   domain.Filters
 	err error
+	got domain.RawFiltersQuery
 }
 
-func (f *fakeFilters) Run(context.Context) (domain.Filters, error) { return f.f, f.err }
+func (f *fakeFilters) Run(_ context.Context, raw domain.RawFiltersQuery) (domain.Filters, error) {
+	f.got = raw
+	return f.f, f.err
+}
+
+type fakeFeatured struct {
+	out usecase.FeaturedOutput
+	err error
+}
+
+func (f *fakeFeatured) Run(context.Context) (usecase.FeaturedOutput, error) { return f.out, f.err }
 
 // base é a MEDIA_BASE_URL dos testes.
 const base = "http://localhost:8888/buckets/passarim-media"
 
 // newHandler monta só as rotas (sem middlewares) com os fakes.
 func newHandler(t *testing.T, l *fakeList, g *fakeGet, f *fakeFilters) http.Handler {
+	t.Helper()
+	return newHandlerWithFeatured(t, l, g, f, &fakeFeatured{})
+}
+
+// newHandlerWithFeatured é o newHandler com a "Ave do dia" escolhida pelo teste.
+func newHandlerWithFeatured(t *testing.T, l *fakeList, g *fakeGet, f *fakeFilters, fe *fakeFeatured) http.Handler {
 	t.Helper()
 	m, err := media.New(base, slog.New(slog.DiscardHandler))
 	if err != nil {
 		t.Fatal(err)
 	}
-	h := &httpadapter.Handler{List: l, Get: g, Filters: f, Media: m, Log: slog.New(slog.DiscardHandler)}
+	h := &httpadapter.Handler{List: l, Get: g, Filters: f, Featured: fe, Media: m, Log: slog.New(slog.DiscardHandler)}
 	return h.Routes()
 }
 
@@ -289,9 +307,10 @@ func TestRouteNotFound_IsProblemJSON(t *testing.T) {
 	}
 }
 
-// As quatro falhas do catalog viram 503 SERVICE_UNAVAILABLE.
+// As quatro falhas do catalog e o Unimplemented (catalog numa versão sem o
+// método) viram 503 SERVICE_UNAVAILABLE.
 func TestUpstreamErrors_503(t *testing.T) {
-	for _, k := range []domain.Kind{domain.KindUnavailable, domain.KindTimeout, domain.KindUpstream, domain.KindCircuitOpen} {
+	for _, k := range []domain.Kind{domain.KindUnavailable, domain.KindTimeout, domain.KindUpstream, domain.KindCircuitOpen, domain.KindUnimplemented} {
 		g := &fakeGet{err: domain.NewError(k, errors.New("x"))}
 		rec := do(newHandler(t, &fakeList{}, g, &fakeFilters{}), "GET", "/v1/species/x")
 		if b := decode(t, rec); rec.Code != 503 || b["code"] != "SERVICE_UNAVAILABLE" {
@@ -348,3 +367,84 @@ func TestCanceledRequest_NoBodyAndStatus499(t *testing.T) {
 		t.Fatalf("cliente que desistiu: status %d, corpo %q", rec.Code, rec.Body.String())
 	}
 }
+
+// audience e primaryBiome chegam ao caso de uso como vieram; um parâmetro
+// repetido é marcado.
+func TestListSpecies_AudienceAndPrimaryBiome(t *testing.T) {
+	l := &fakeList{}
+	do(newHandler(t, l, &fakeGet{}, &fakeFilters{}), "GET", "/v1/species?audience=kids&primaryBiome=pampa&audience=adult")
+	if l.got.Audience != "kids" || l.got.PrimaryBiome != "pampa" || len(l.got.Repeated) != 1 || l.got.Repeated[0] != "audience" {
+		t.Fatalf("consulta: %+v", l.got)
+	}
+}
+
+// Os filtros recebem a audiência e devolvem primaryBiomes no formato de biomes.
+func TestListFilters_AudienceAndPrimaryBiomes(t *testing.T) {
+	f := &fakeFilters{f: domain.Filters{PrimaryBiomes: []domain.BiomeCount{{Biome: domain.BiomeCerrado, SpeciesCount: 4}}}}
+	b := decode(t, do(newHandler(t, &fakeList{}, &fakeGet{}, f), "GET", "/v1/filters?audience=kids"))
+	pb := b["primaryBiomes"].([]any)[0].(map[string]any)
+	if f.got.Audience != "kids" || pb["code"] != "cerrado" || pb["label"] != "Cerrado" || pb["speciesCount"].(float64) != 4 {
+		t.Fatalf("consulta=%+v filtros=%v", f.got, b)
+	}
+}
+
+// O detalhe traz kids (fatos só com o texto), primaryBiome e os picos.
+// Sem Kids e sem bioma principal, os dois saem null; um canto sem picos sai
+// com peaks [] (nunca null).
+func TestGetSpecies_KidsPrimaryBiomeAndPeaks(t *testing.T) {
+	g := &fakeGet{sp: domain.Species{ID: "t", PrimaryBiome: domain.BiomeCerrado,
+		Kids:  &domain.KidsContent{Description: "D", Facts: []string{"F"}, DidYouKnow: "V"},
+		Audio: &domain.Audio{Key: "species/t/a.aac", Peaks: []float32{0, 1}}}}
+	b := decode(t, do(newHandler(t, &fakeList{}, g, &fakeFilters{}), "GET", "/v1/species/t"))
+	kids := b["kids"].(map[string]any)
+	if b["primaryBiome"] != "cerrado" || kids["description"] != "D" || kids["didYouKnow"] != "V" ||
+		kids["facts"].([]any)[0].(map[string]any)["text"] != "F" || len(b["audio"].(map[string]any)["peaks"].([]any)) != 2 {
+		t.Fatalf("detalhe: %v", b)
+	}
+	g = &fakeGet{sp: domain.Species{ID: "t", Audio: &domain.Audio{Key: "species/t/a.aac"}}}
+	b = decode(t, do(newHandler(t, &fakeList{}, g, &fakeFilters{}), "GET", "/v1/species/t"))
+	if b["kids"] != nil || b["primaryBiome"] != nil || b["audio"].(map[string]any)["peaks"] == nil {
+		t.Fatalf("sem Kids: %v", b)
+	}
+}
+
+// A "Ave do dia" sai com a data, o card, o canto com os picos e o max-age
+// até a meia-noite de São Paulo.
+func TestFeatured_OK(t *testing.T) {
+	fe := &fakeFeatured{out: usecase.FeaturedOutput{Date: "2026-11-05", MaxAge: 7200, Featured: domain.Featured{
+		Species: domain.Summary{ID: "t", CommonName: "Sabiá", PrimaryBiome: domain.BiomeMataAtlantica, ThumbnailKey: "species/t/thumb.webp"},
+		Audio:   &domain.Audio{Key: "species/t/a.aac", DurationMs: 3000, Peaks: []float32{1}}}}}
+	rec := do(newHandlerWithFeatured(t, &fakeList{}, &fakeGet{}, &fakeFilters{}, fe), "GET", "/v1/featured")
+	b := decode(t, rec)
+	sp := b["species"].(map[string]any)
+	if rec.Code != 200 || b["date"] != "2026-11-05" || sp["id"] != "t" || sp["primaryBiome"] != "mata_atlantica" ||
+		b["audio"].(map[string]any)["peaks"].([]any)[0].(float64) != 1 || rec.Header().Get("Cache-Control") != "public, max-age=7200" {
+		t.Fatalf("%d %v %v", rec.Code, b, rec.Header())
+	}
+	fe.out.Featured.Audio = nil
+	if b := decode(t, do(newHandlerWithFeatured(t, &fakeList{}, &fakeGet{}, &fakeFilters{}, fe), "GET", "/v1/featured")); b["audio"] != nil {
+		t.Fatalf("sem canto, audio é null: %v", b)
+	}
+}
+
+// Os erros da "Ave do dia" (spec da frente B, seção 7): sem ave elegível,
+// 404; data recusada pelo catalog, 500; catalog numa versão antiga ou fora
+// do ar, 503.
+func TestFeatured_Errors(t *testing.T) {
+	cases := map[domain.Kind]struct {
+		status int
+		code   string
+	}{
+		domain.KindNotFound:        {404, "FEATURED_NOT_FOUND"},
+		domain.KindInvalidArgument: {500, "INTERNAL"},
+		domain.KindUnimplemented:   {503, "SERVICE_UNAVAILABLE"},
+		domain.KindUnavailable:     {503, "SERVICE_UNAVAILABLE"},
+	}
+	for kind, want := range cases {
+		fe := &fakeFeatured{err: domain.NewError(kind, errors.New("x"))}
+		rec := do(newHandlerWithFeatured(t, &fakeList{}, &fakeGet{}, &fakeFilters{}, fe), "GET", "/v1/featured")
+		if b := decode(t, rec); rec.Code != want.status || b["code"] != want.code {
+			t.Errorf("%s → %d %v, esperava %d %s", kind, rec.Code, b, want.status, want.code)
+		}
+	}
+}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `go test ./internal/adapter/http/`
Expected: FAIL na compilação (`unknown field Featured in struct literal`).

- [ ] **Step 3: Implementar o código**

Salve o patch abaixo em `/tmp/b3-t6-impl.patch` e aplique com `git apply /tmp/b3-t6-impl.patch`:

```diff
diff --git a/cmd/bff/main.go b/cmd/bff/main.go
index fc366f3..865df31 100644
--- a/cmd/bff/main.go
+++ b/cmd/bff/main.go
@@ -164,13 +164,15 @@ func run(getenv func(string) string) error {
 	// Readiness diz ao /readyz se o BFF aceita tráfego. O servidor o desliga
 	// no começo do desligamento, para o balanceador parar de mandar pedidos.
 	ready := &server.Readiness{}
-	// Os três casos de uso recebem o reader já decorado e o orçamento de
-	// tempo de cada requisição (REQUEST_BUDGET).
+	// Os quatro casos de uso recebem o reader já decorado e o orçamento de
+	// tempo de cada requisição (REQUEST_BUDGET). A "Ave do dia" também
+	// recebe o relógio: é por ele que o BFF sabe a data em São Paulo.
 	h := &httpadapter.Handler{
-		List:    usecase.ListSpecies{Catalog: reader, Budget: cfg.RequestBudget},
-		Get:     usecase.GetSpecies{Catalog: reader, Budget: cfg.RequestBudget},
-		Filters: usecase.ListFilters{Catalog: reader, Budget: cfg.RequestBudget},
-		Media:   mediaURLs, Log: log, Ready: ready.Ready,
+		List:     usecase.ListSpecies{Catalog: reader, Budget: cfg.RequestBudget},
+		Get:      usecase.GetSpecies{Catalog: reader, Budget: cfg.RequestBudget},
+		Filters:  usecase.ListFilters{Catalog: reader, Budget: cfg.RequestBudget},
+		Featured: usecase.GetFeatured{Catalog: reader, Budget: cfg.RequestBudget, Now: time.Now},
+		Media:    mediaURLs, Log: log, Ready: ready.Ready,
 	}
 
 	// Descobre o IP real do cliente: atrás do Traefik, o IP da conexão é o do
diff --git a/internal/adapter/http/dto.go b/internal/adapter/http/dto.go
index f8cb44b..d7d117a 100644
--- a/internal/adapter/http/dto.go
+++ b/internal/adapter/http/dto.go
@@ -7,6 +7,7 @@ import (
 
 	"github.com/velosobr/passarim-bff/internal/adapter/media"
 	"github.com/velosobr/passarim-bff/internal/domain"
+	"github.com/velosobr/passarim-bff/internal/usecase"
 )
 
 // DTOs = o contrato REST. São structs PRÓPRIAS: nunca serializamos o domínio
@@ -32,13 +33,15 @@ type creditDTO struct {
 	SourceURL string `json:"sourceUrl"`
 }
 
-// summaryDTO é o card da lista. thumbnailUrl é null quando ainda não há foto.
+// summaryDTO é o card da lista. thumbnailUrl é null quando ainda não há foto,
+// e primaryBiome (o "mundo" da ave no Kids) é null quando a ave não tem.
 type summaryDTO struct {
 	ID                 string    `json:"id"`
 	CommonName         string    `json:"commonName"`
 	ScientificName     string    `json:"scientificName"`
 	ThumbnailURL       *string   `json:"thumbnailUrl"`
 	ConservationStatus *labelDTO `json:"conservationStatus"`
+	PrimaryBiome       *string   `json:"primaryBiome"`
 }
 
 // speciesPageDTO é uma página; nextCursor é null na última.
@@ -63,11 +66,27 @@ type photoDTO struct {
 	Credit    creditDTO `json:"credit"`
 }
 
-// audioDTO é o canto, já com a URL pública.
+// audioDTO é o canto, já com a URL pública. peaks são os 64 picos da forma
+// de onda, de 0 a 1; sai [] (nunca null) quando o catalog ainda não os
+// calculou, e o app desenha uma forma genérica.
 type audioDTO struct {
 	URL        string    `json:"url"`
 	DurationMs int       `json:"durationMs"`
 	Credit     creditDTO `json:"credit"`
+	Peaks      []float32 `json:"peaks"`
+}
+
+// kidsFactDTO é um fato do conteúdo Kids, só com o texto.
+type kidsFactDTO struct {
+	Text string `json:"text"`
+}
+
+// kidsDTO é o conteúdo para crianças (frente B). Não tem nenhuma URL: nenhum
+// link chega à jornada Kids.
+type kidsDTO struct {
+	Description string        `json:"description"`
+	Facts       []kidsFactDTO `json:"facts"`
+	DidYouKnow  string        `json:"didYouKnow"`
 }
 
 // clusterDTO é um grupo de avistamentos do mapa.
@@ -102,6 +121,8 @@ type speciesDTO struct {
 	Photos             []photoDTO     `json:"photos"`
 	Audio              *audioDTO      `json:"audio"`
 	WhereToFind        whereToFindDTO `json:"whereToFind"`
+	PrimaryBiome       *string        `json:"primaryBiome"`
+	Kids               *kidsDTO       `json:"kids"` // null = a ave não entra no Kids
 }
 
 // biomeCountDTO e stateCountDTO são as opções de filtro com as contagens.
@@ -116,10 +137,20 @@ type stateCountDTO struct {
 	SpeciesCount int    `json:"speciesCount"`
 }
 
-// filtersDTO é a resposta de /v1/filters.
+// filtersDTO é a resposta de /v1/filters. primaryBiomes conta por bioma
+// principal, no mesmo formato de biomes: é a conta do álbum do Kids.
 type filtersDTO struct {
-	Biomes []biomeCountDTO `json:"biomes"`
-	States []stateCountDTO `json:"states"`
+	Biomes        []biomeCountDTO `json:"biomes"`
+	States        []stateCountDTO `json:"states"`
+	PrimaryBiomes []biomeCountDTO `json:"primaryBiomes"`
+}
+
+// featuredDTO é a resposta de /v1/featured: a data (AAAA-MM-DD, fuso de São
+// Paulo), o card da ave e o canto (null se a ave não tiver).
+type featuredDTO struct {
+	Date    string     `json:"date"`
+	Species summaryDTO `json:"species"`
+	Audio   *audioDTO  `json:"audio"`
 }
 
 // conservationDTO devolve o código com o rótulo, ou nil para status
@@ -137,12 +168,41 @@ func toCredit(c domain.Credit) creditDTO {
 	return creditDTO{Author: c.Author, License: c.License, Source: c.Source, SourceURL: c.SourceURL}
 }
 
+// biomeCode devolve o código do bioma, ou nil para "" (sem bioma): no JSON,
+// null, nunca uma string vazia nem "unspecified".
+func biomeCode(b domain.Biome) *string {
+	if b == "" {
+		return nil
+	}
+	s := string(b)
+	return &s
+}
+
+// toSummaryDTO monta o card de uma ave, já com a URL da miniatura.
+func toSummaryDTO(ctx context.Context, s domain.Summary, m *media.Builder) summaryDTO {
+	return summaryDTO{ID: s.ID, CommonName: s.CommonName, ScientificName: s.ScientificName,
+		ThumbnailURL: m.URL(ctx, s.ThumbnailKey), ConservationStatus: conservationDTO(s.Conservation), PrimaryBiome: biomeCode(s.PrimaryBiome)}
+}
+
+// toAudioDTO monta o canto. Sem canto, ou com uma chave que não vira URL
+// segura, devolve nil: o app esconde o player, em vez de receber uma URL
+// montada a partir de uma chave vazia.
+func toAudioDTO(ctx context.Context, a *domain.Audio, m *media.Builder) *audioDTO {
+	if a == nil {
+		return nil
+	}
+	u := m.URL(ctx, a.Key)
+	if u == nil {
+		return nil
+	}
+	return &audioDTO{URL: *u, DurationMs: a.DurationMs, Credit: toCredit(a.Credit), Peaks: append(make([]float32, 0, len(a.Peaks)), a.Peaks...)}
+}
+
 // toPageDTO monta a página, já trocando as chaves de mídia por URLs.
 func toPageDTO(ctx context.Context, p domain.SpeciesPage, m *media.Builder) speciesPageDTO {
 	out := speciesPageDTO{Items: make([]summaryDTO, 0, len(p.Items))}
 	for _, s := range p.Items {
-		out.Items = append(out.Items, summaryDTO{ID: s.ID, CommonName: s.CommonName, ScientificName: s.ScientificName,
-			ThumbnailURL: m.URL(ctx, s.ThumbnailKey), ConservationStatus: conservationDTO(s.Conservation)})
+		out.Items = append(out.Items, toSummaryDTO(ctx, s, m))
 	}
 	if p.NextCursor != "" {
 		out.NextCursor = &p.NextCursor
@@ -158,6 +218,7 @@ func toSpeciesDTO(ctx context.Context, s domain.Species, m *media.Builder) speci
 		ID: s.ID, CommonName: s.CommonName, ScientificName: s.ScientificName, Family: s.Family,
 		ConservationStatus: conservationDTO(s.Conservation), SizeCm: s.SizeCm, Diet: s.Diet,
 		Description: s.Description, DescriptionCredit: toCredit(s.DescriptionCredit),
+		Audio: toAudioDTO(ctx, s.Audio, m), PrimaryBiome: biomeCode(s.PrimaryBiome),
 		Facts: make([]factDTO, 0, len(s.Facts)), Chips: make([]labelDTO, 0, len(s.Biomes)), Photos: make([]photoDTO, 0, len(s.Photos)),
 		WhereToFind: whereToFindDTO{States: make([]string, 0, len(s.States)), Biomes: make([]string, 0, len(s.Biomes)), Clusters: make([]clusterDTO, 0, len(s.Clusters))},
 	}
@@ -173,10 +234,10 @@ func toSpeciesDTO(ctx context.Context, s domain.Species, m *media.Builder) speci
 		out.Photos = append(out.Photos, photoDTO{ThumbURL: m.URL(ctx, p.ThumbKey), MediumURL: m.URL(ctx, p.MediumKey), LargeURL: m.URL(ctx, p.LargeKey),
 			Width: p.Width, Height: p.Height, Credit: toCredit(p.Credit)})
 	}
-	if s.Audio != nil {
-		// Áudio com URL insegura/vazia = sem áudio: o app esconde o player.
-		if u := m.URL(ctx, s.Audio.Key); u != nil {
-			out.Audio = &audioDTO{URL: *u, DurationMs: s.Audio.DurationMs, Credit: toCredit(s.Audio.Credit)}
+	if k := s.Kids; k != nil {
+		out.Kids = &kidsDTO{Description: k.Description, DidYouKnow: k.DidYouKnow, Facts: make([]kidsFactDTO, 0, len(k.Facts))}
+		for _, f := range k.Facts {
+			out.Kids.Facts = append(out.Kids.Facts, kidsFactDTO{Text: f})
 		}
 	}
 	for _, c := range s.Clusters {
@@ -187,12 +248,24 @@ func toSpeciesDTO(ctx context.Context, s domain.Species, m *media.Builder) speci
 
 // toFiltersDTO monta os filtros, com o rótulo de cada bioma.
 func toFiltersDTO(f domain.Filters) filtersDTO {
-	out := filtersDTO{Biomes: make([]biomeCountDTO, 0, len(f.Biomes)), States: make([]stateCountDTO, 0, len(f.States))}
-	for _, b := range f.Biomes {
-		out.Biomes = append(out.Biomes, biomeCountDTO{Code: string(b.Biome), Label: biomeLabels[b.Biome], SpeciesCount: b.SpeciesCount})
-	}
+	out := filtersDTO{Biomes: toBiomeCounts(f.Biomes), States: make([]stateCountDTO, 0, len(f.States)), PrimaryBiomes: toBiomeCounts(f.PrimaryBiomes)}
 	for _, s := range f.States {
 		out.States = append(out.States, stateCountDTO{Code: s.State, SpeciesCount: s.SpeciesCount})
 	}
 	return out
 }
+
+// toBiomeCounts monta as contagens por bioma com o rótulo; sempre uma lista
+// ([] e não null).
+func toBiomeCounts(counts []domain.BiomeCount) []biomeCountDTO {
+	out := make([]biomeCountDTO, 0, len(counts))
+	for _, b := range counts {
+		out = append(out, biomeCountDTO{Code: string(b.Biome), Label: biomeLabels[b.Biome], SpeciesCount: b.SpeciesCount})
+	}
+	return out
+}
+
+// toFeaturedDTO monta a resposta da "Ave do dia".
+func toFeaturedDTO(ctx context.Context, out usecase.FeaturedOutput, m *media.Builder) featuredDTO {
+	return featuredDTO{Date: out.Date, Species: toSummaryDTO(ctx, out.Featured.Species, m), Audio: toAudioDTO(ctx, out.Featured.Audio, m)}
+}
diff --git a/internal/adapter/http/errors.go b/internal/adapter/http/errors.go
index 15781b8..8fc90a7 100644
--- a/internal/adapter/http/errors.go
+++ b/internal/adapter/http/errors.go
@@ -16,7 +16,8 @@ const statusClientClosed = 499
 
 // fail é o ÚNICO lugar que traduz erro de domínio em resposta HTTP.
 // O mapa é: inválido → 400; não encontrado → 404; cliente desistiu → 499
-// (sem corpo); catalog com problema → 503; o resto → 500. Os 503 e 500 são
+// (sem corpo); catalog com problema ou numa versão sem o método → 503; o
+// resto → 500. Os 503 e 500 são
 // registrados no log com a causa, que nunca vai para a resposta.
 //
 // fieldHint diz qual parâmetro apontar quando o CATALOG reclama de InvalidArgument
@@ -37,7 +38,7 @@ func (h *Handler) fail(w http.ResponseWriter, r *http.Request, err error, fieldH
 		WriteProblem(w, r, http.StatusNotFound, CodeSpeciesNotFound, nil)
 	case domain.KindCanceled:
 		w.WriteHeader(statusClientClosed) // sem corpo: ninguém está ouvindo
-	case domain.KindUnavailable, domain.KindTimeout, domain.KindUpstream, domain.KindCircuitOpen:
+	case domain.KindUnavailable, domain.KindTimeout, domain.KindUpstream, domain.KindCircuitOpen, domain.KindUnimplemented:
 		h.Log.WarnContext(r.Context(), "catalog indisponível", "request_id", rid, "kind", kind.String(), "error", err)
 		WriteProblem(w, r, http.StatusServiceUnavailable, CodeServiceUnavailable, nil)
 	default:
diff --git a/internal/adapter/http/handler.go b/internal/adapter/http/handler.go
index 848814a..b61be49 100644
--- a/internal/adapter/http/handler.go
+++ b/internal/adapter/http/handler.go
@@ -14,13 +14,15 @@ import (
 	"encoding/json"
 	"log/slog"
 	"net/http"
+	"strconv"
 
 	"github.com/velosobr/passarim-bff/internal/adapter/media"
 	"github.com/velosobr/passarim-bff/internal/adapter/reqmeta"
 	"github.com/velosobr/passarim-bff/internal/domain"
+	"github.com/velosobr/passarim-bff/internal/usecase"
 )
 
-// As três interfaces abaixo descrevem só o que o handler precisa de cada
+// As quatro interfaces abaixo descrevem só o que o handler precisa de cada
 // caso de uso: um método Run. Os casos de uso do pacote usecase já as
 // satisfazem, e os testes as trocam por versões falsas.
 type SpeciesLister interface {
@@ -34,15 +36,21 @@ type SpeciesGetter interface {
 
 // FiltersLister é o caso de uso dos filtros.
 type FiltersLister interface {
-	Run(ctx context.Context) (domain.Filters, error)
+	Run(ctx context.Context, raw domain.RawFiltersQuery) (domain.Filters, error)
 }
 
-// Handler reúne o que as rotas usam: os três casos de uso, o montador de
+// FeaturedGetter é o caso de uso da "Ave do dia" (frente B).
+type FeaturedGetter interface {
+	Run(ctx context.Context) (usecase.FeaturedOutput, error)
+}
+
+// Handler reúne o que as rotas usam: os quatro casos de uso, o montador de
 // URLs de mídia, o logger e a função de prontidão.
 type Handler struct {
 	List     SpeciesLister
 	Get      SpeciesGetter
 	Filters  FiltersLister
+	Featured FeaturedGetter
 	Media    *media.Builder
 	Log      *slog.Logger
 	Ready    func() bool // nil = sempre pronto (false durante o shutdown)
@@ -65,6 +73,7 @@ func (h *Handler) Routes() http.Handler {
 	reg("GET /v1/species", h.listSpecies)
 	reg("GET /v1/species/{id}", h.getSpecies)
 	reg("GET /v1/filters", h.listFilters)
+	reg("GET /v1/featured", h.getFeatured)
 	reg("GET /healthz", h.healthz)
 	reg("GET /readyz", h.readyz)
 	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { // 404 genérico em problem+json
@@ -75,7 +84,7 @@ func (h *Handler) Routes() http.Handler {
 
 // listParams são os parâmetros aceitos na lista, conferidos um a um para
 // achar repetições.
-var listParams = []string{"q", "biome", "state", "cursor", "limit"}
+var listParams = []string{"q", "biome", "state", "cursor", "limit", "audience", "primaryBiome"}
 
 // listSpecies atende GET /v1/species. query.Get pega só o primeiro valor de
 // cada parâmetro; query[p] traz todos, e é por ele que detectamos a
@@ -83,7 +92,8 @@ var listParams = []string{"q", "biome", "state", "cursor", "limit"}
 // parâmetro que o BFF repassa sem conseguir validar por completo.
 func (h *Handler) listSpecies(w http.ResponseWriter, r *http.Request) {
 	query := r.URL.Query()
-	raw := domain.RawListQuery{Q: query.Get("q"), Biome: query.Get("biome"), State: query.Get("state"), Cursor: query.Get("cursor"), Limit: query.Get("limit")}
+	raw := domain.RawListQuery{Q: query.Get("q"), Biome: query.Get("biome"), State: query.Get("state"), Cursor: query.Get("cursor"), Limit: query.Get("limit"),
+		Audience: query.Get("audience"), PrimaryBiome: query.Get("primaryBiome")}
 	for _, p := range listParams {
 		if len(query[p]) > 1 {
 			raw.Repeated = append(raw.Repeated, p)
@@ -108,9 +118,14 @@ func (h *Handler) getSpecies(w http.ResponseWriter, r *http.Request) {
 	h.ok(w, r, toSpeciesDTO(r.Context(), s, h.Media))
 }
 
-// listFilters atende GET /v1/filters.
+// listFilters atende GET /v1/filters. O único parâmetro é a audiência.
 func (h *Handler) listFilters(w http.ResponseWriter, r *http.Request) {
-	f, err := h.Filters.Run(r.Context())
+	query := r.URL.Query()
+	raw := domain.RawFiltersQuery{Audience: query.Get("audience")}
+	if len(query["audience"]) > 1 {
+		raw.Repeated = append(raw.Repeated, "audience")
+	}
+	f, err := h.Filters.Run(r.Context(), raw)
 	if err != nil {
 		h.fail(w, r, err, "")
 		return
@@ -118,13 +133,40 @@ func (h *Handler) listFilters(w http.ResponseWriter, r *http.Request) {
 	h.ok(w, r, toFiltersDTO(f))
 }
 
-// ok escreve um 200 com os cabeçalhos de cache. O corpo é montado ANTES de
+// getFeatured atende GET /v1/featured, a "Ave do dia". Dois erros têm
+// tratamento próprio (spec da frente B, seção 7):
+//   - NotFound: nenhuma ave elegível; o app esconde o card;
+//   - InvalidArgument: o catalog recusou a data que o BFF calculou, o que só
+//     acontece com os relógios dos dois separados por mais de um dia. É bug
+//     do servidor, não do app: 500, com log.
+//
+// O resto (catalog fora do ar, Unimplemented) segue o fail de sempre.
+func (h *Handler) getFeatured(w http.ResponseWriter, r *http.Request) {
+	out, err := h.Featured.Run(r.Context())
+	switch kind := domain.KindOf(err); {
+	case err == nil:
+		h.write(w, r, toFeaturedDTO(r.Context(), out, h.Media), out.MaxAge)
+	case kind == domain.KindNotFound:
+		WriteProblem(w, r, http.StatusNotFound, CodeFeaturedNotFound, nil)
+	case kind == domain.KindInvalidArgument:
+		h.Log.ErrorContext(r.Context(), "catalog recusou a data da ave do dia: relógios fora de sincronia?",
+			"request_id", reqmeta.RequestID(r.Context()), "error", err)
+		WriteProblem(w, r, http.StatusInternalServerError, CodeInternal, nil)
+	default:
+		h.fail(w, r, err, "")
+	}
+}
+
+// ok escreve um 200 que o app e os proxies podem guardar por 60 s.
+func (h *Handler) ok(w http.ResponseWriter, r *http.Request, v any) { h.write(w, r, v, 60) }
+
+// write escreve um 200 com os cabeçalhos de cache. O corpo é montado ANTES de
 // escrever, para um erro de serialização nunca deixar uma resposta pela metade.
 //
 // Cabeçalhos: Cache-Control deixa o app e proxies guardarem a resposta por
-// 60 s; X-Cache conta se a resposta veio do cache do BFF (hit, miss, stale),
-// útil para depurar.
-func (h *Handler) ok(w http.ResponseWriter, r *http.Request, v any) {
+// maxAge segundos; X-Cache conta se a resposta veio do cache do BFF (hit,
+// miss, stale), útil para depurar.
+func (h *Handler) write(w http.ResponseWriter, r *http.Request, v any, maxAge int) {
 	body, err := json.Marshal(v)
 	if err != nil {
 		h.fail(w, r, err, "")
@@ -135,7 +177,7 @@ func (h *Handler) ok(w http.ResponseWriter, r *http.Request, v any) {
 		cache = "miss"
 	}
 	w.Header().Set("Content-Type", "application/json; charset=utf-8")
-	w.Header().Set("Cache-Control", "public, max-age=60")
+	w.Header().Set("Cache-Control", "public, max-age="+strconv.Itoa(maxAge))
 	w.Header().Set("X-Cache", cache)
 	_, _ = w.Write(body)
 }
diff --git a/internal/adapter/http/problem.go b/internal/adapter/http/problem.go
index ab061ca..3f0bf6b 100644
--- a/internal/adapter/http/problem.go
+++ b/internal/adapter/http/problem.go
@@ -17,6 +17,7 @@ import (
 const (
 	CodeInvalidParameter   = "INVALID_PARAMETER"
 	CodeSpeciesNotFound    = "SPECIES_NOT_FOUND"
+	CodeFeaturedNotFound   = "FEATURED_NOT_FOUND"
 	CodeNotFound           = "NOT_FOUND"
 	CodeMethodNotAllowed   = "METHOD_NOT_ALLOWED"
 	CodeRateLimited        = "RATE_LIMITED"
@@ -28,6 +29,7 @@ const (
 var problemTitles = map[string]string{
 	CodeInvalidParameter:   "Parâmetro inválido",
 	CodeSpeciesNotFound:    "Espécie não encontrada",
+	CodeFeaturedNotFound:   "Nenhuma ave do dia",
 	CodeNotFound:           "Recurso não encontrado",
 	CodeMethodNotAllowed:   "Método não permitido",
 	CodeRateLimited:        "Muitas requisições",
```

- [ ] **Step 4: Rodar e ver o contrato falhar**

Run: `go test ./internal/adapter/http/ -run TestContract`
Expected: FAIL: a rota `GET /v1/featured` não está no `openapi.yaml`, e as respostas novas não validam.

- [ ] **Step 5: Atualizar o contrato**

Salve o patch abaixo em `/tmp/b3-t6-openapi.patch` e aplique com `git apply /tmp/b3-t6-openapi.patch`:

```diff
diff --git a/openapi.yaml b/openapi.yaml
index 6af198d..01e4327 100644
--- a/openapi.yaml
+++ b/openapi.yaml
@@ -10,7 +10,7 @@
 openapi: 3.0.3
 info:
   title: Passarim BFF
-  version: 1.0.0
+  version: 1.1.0
   description: |
     API REST do Passarim (catálogo de aves do Brasil). Somente leitura.
     Erros seguem o RFC 9457 (`application/problem+json`) com um `code` estável.
@@ -36,6 +36,8 @@ paths:
         - $ref: '#/components/parameters/State'
         - $ref: '#/components/parameters/Cursor'
         - $ref: '#/components/parameters/Limit'
+        - $ref: '#/components/parameters/Audience'
+        - $ref: '#/components/parameters/PrimaryBiome'
       responses:
         '200':
           description: Página de espécies
@@ -84,7 +86,9 @@ paths:
     get:
       tags: [catalog]
       operationId: listFilters
-      summary: Biomas e estados com contagem de espécies
+      summary: Biomas, estados e biomas principais com contagem de espécies
+      parameters:
+        - $ref: '#/components/parameters/Audience'
       responses:
         '200':
           description: Filtros disponíveis (os `code` valem como `biome` e `state` na lista)
@@ -95,11 +99,39 @@ paths:
           content:
             application/json:
               schema: { $ref: '#/components/schemas/Filters' }
+        '400': { $ref: '#/components/responses/InvalidParameter' }
         '404': { $ref: '#/components/responses/NotFound' }
         '405': { $ref: '#/components/responses/MethodNotAllowed' }
         '429': { $ref: '#/components/responses/RateLimited' }
         '500': { $ref: '#/components/responses/Internal' }
         '503': { $ref: '#/components/responses/ServiceUnavailable' }
+  # Usada pelo card "Ave do dia" das duas jornadas (frente B). A ave troca à
+  # meia-noite de São Paulo, e o max-age vai só até essa meia-noite.
+  /v1/featured:
+    get:
+      tags: [catalog]
+      operationId: getFeatured
+      summary: A "Ave do dia"
+      description: |
+        A mesma ave o dia todo, para todos, em rodízio sem repetição. A data
+        é a de hoje no fuso de São Paulo, calculada pelo servidor. O
+        `Cache-Control` traz `max-age` com os segundos até a próxima
+        meia-noite de São Paulo (no mínimo 1).
+      responses:
+        '200':
+          description: A ave do dia
+          headers:
+            X-Request-Id: { $ref: '#/components/headers/XRequestId' }
+            X-Cache: { $ref: '#/components/headers/XCache' }
+            Cache-Control: { $ref: '#/components/headers/CacheControl' }
+          content:
+            application/json:
+              schema: { $ref: '#/components/schemas/Featured' }
+        '404': { $ref: '#/components/responses/FeaturedNotFound' }
+        '405': { $ref: '#/components/responses/MethodNotAllowed' }
+        '429': { $ref: '#/components/responses/RateLimited' }
+        '500': { $ref: '#/components/responses/Internal' }
+        '503': { $ref: '#/components/responses/ServiceUnavailable' }
   # Usadas pelo Docker (healthz) e pelo Traefik (readyz), nunca pelo app.
   /healthz:
     get:
@@ -154,6 +186,16 @@ components:
       name: limit
       in: query
       schema: { type: integer, minimum: 1, maximum: 50, default: 20 }
+    Audience:
+      name: audience
+      in: query
+      description: Jornada. `kids` traz só as aves com conteúdo Kids.
+      schema: { type: string, enum: [adult, kids], default: adult }
+    PrimaryBiome:
+      name: primaryBiome
+      in: query
+      description: Bioma principal, o "mundo" da ave no Kids (diferente de `biome`, que vale para qualquer bioma da ave).
+      schema: { $ref: '#/components/schemas/BiomeCode' }
   # Cabeçalhos que as respostas trazem.
   headers:
     XRequestId:
@@ -178,6 +220,11 @@ components:
       content:
         application/problem+json:
           schema: { $ref: '#/components/schemas/Problem' }
+    FeaturedNotFound:
+      description: Nenhuma ave elegível para a "Ave do dia" (`FEATURED_NOT_FOUND`); o app esconde o card
+      content:
+        application/problem+json:
+          schema: { $ref: '#/components/schemas/Problem' }
     NotFound:
       description: Rota inexistente (`NOT_FOUND`)
       content:
@@ -240,7 +287,7 @@ components:
         sourceUrl: { type: string }
     SpeciesSummary:
       type: object
-      required: [id, commonName, scientificName, thumbnailUrl, conservationStatus]
+      required: [id, commonName, scientificName, thumbnailUrl, conservationStatus, primaryBiome]
       properties:
         id: { type: string }
         commonName: { type: string }
@@ -250,6 +297,7 @@ components:
           nullable: true
           allOf:
             - $ref: '#/components/schemas/ConservationStatus'
+        primaryBiome: { $ref: '#/components/schemas/PrimaryBiome' }
     SpeciesPage:
       type: object
       required: [items, nextCursor]
@@ -274,13 +322,38 @@ components:
         width: { type: integer }
         height: { type: integer }
         credit: { $ref: '#/components/schemas/Credit' }
+    PrimaryBiome:
+      type: string
+      nullable: true
+      description: O "mundo" da ave no Kids; null quando a ave ainda não tem.
+      enum: [amazonia, mata_atlantica, cerrado, caatinga, pantanal, pampa, null]
     Audio:
       type: object
-      required: [url, durationMs, credit]
+      required: [url, durationMs, credit, peaks]
       properties:
         url: { type: string }
         durationMs: { type: integer }
         credit: { $ref: '#/components/schemas/Credit' }
+        peaks:
+          type: array
+          description: Os 64 picos da forma de onda, de 0 a 1; vazio quando ainda não foram calculados.
+          maxItems: 64
+          items: { type: number, minimum: 0, maximum: 1 }
+    KidsFact:
+      type: object
+      required: [text]
+      properties:
+        text: { type: string }
+    Kids:
+      type: object
+      description: Conteúdo para crianças, sem nenhum link.
+      required: [description, facts, didYouKnow]
+      properties:
+        description: { type: string }
+        facts:
+          type: array
+          items: { $ref: '#/components/schemas/KidsFact' }
+        didYouKnow: { type: string }
     Cluster:
       type: object
       required: [lat, lng, count, precision]
@@ -304,7 +377,7 @@ components:
           items: { $ref: '#/components/schemas/Cluster' }
     Species:
       type: object
-      required: [id, commonName, scientificName, family, conservationStatus, sizeCm, diet, description, descriptionCredit, facts, chips, photos, audio, whereToFind]
+      required: [id, commonName, scientificName, family, conservationStatus, sizeCm, diet, description, descriptionCredit, facts, chips, photos, audio, whereToFind, primaryBiome, kids]
       properties:
         id: { type: string }
         commonName: { type: string }
@@ -334,6 +407,12 @@ components:
           allOf:
             - $ref: '#/components/schemas/Audio'
         whereToFind: { $ref: '#/components/schemas/WhereToFind' }
+        primaryBiome: { $ref: '#/components/schemas/PrimaryBiome' }
+        kids:
+          nullable: true
+          description: null quando a ave ainda não tem conteúdo Kids (e não aparece na jornada Kids).
+          allOf:
+            - $ref: '#/components/schemas/Kids'
     BiomeCount:
       type: object
       required: [code, label, speciesCount]
@@ -349,7 +428,7 @@ components:
         speciesCount: { type: integer }
     Filters:
       type: object
-      required: [biomes, states]
+      required: [biomes, states, primaryBiomes]
       properties:
         biomes:
           type: array
@@ -357,6 +436,20 @@ components:
         states:
           type: array
           items: { $ref: '#/components/schemas/StateCount' }
+        primaryBiomes:
+          type: array
+          description: Contagem por bioma principal ("mundo" do Kids), no formato de `biomes`.
+          items: { $ref: '#/components/schemas/BiomeCount' }
+    Featured:
+      type: object
+      required: [date, species, audio]
+      properties:
+        date: { type: string, format: date, description: 'Data da ave (AAAA-MM-DD, fuso de São Paulo).' }
+        species: { $ref: '#/components/schemas/SpeciesSummary' }
+        audio:
+          nullable: true
+          allOf:
+            - $ref: '#/components/schemas/Audio'
     FieldError:
       type: object
       required: [field, reason]
@@ -373,7 +466,7 @@ components:
         status: { type: integer }
         code:
           type: string
-          enum: [INVALID_PARAMETER, SPECIES_NOT_FOUND, NOT_FOUND, METHOD_NOT_ALLOWED, RATE_LIMITED, SERVICE_UNAVAILABLE, INTERNAL]
+          enum: [INVALID_PARAMETER, SPECIES_NOT_FOUND, FEATURED_NOT_FOUND, NOT_FOUND, METHOD_NOT_ALLOWED, RATE_LIMITED, SERVICE_UNAVAILABLE, INTERNAL]
         requestId: { type: string }
         errors:
           type: array
```

- [ ] **Step 6: Rodar a suíte inteira e o lint**

Run: `go build ./... && go vet ./... && go test -race ./... 2>&1 | tail -20 && make lint`
Expected: PASS em todos os pacotes e `0 issues`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: /v1/featured, audience e primaryBiome na API, com o openapi 1.1.0"
```

---

### Task 7: Swagger, README, e2e e PR 7

**Files:**
- Modify: `docs/swagger.html` (gerado), `README.md`, `e2e/e2e_test.go`

- [ ] **Step 1: e2e e README**

Salve o patch abaixo em `/tmp/b3-t7.patch` e aplique com `git apply /tmp/b3-t7.patch`:

```diff
diff --git a/README.md b/README.md
index 21cf839..8f31410 100644
--- a/README.md
+++ b/README.md
@@ -55,6 +55,13 @@ e cai com `back-end-down`; `back-end-status` diz se a API está pronta para test
 ## Contrato e design
 
 - Contrato REST: [`openapi.yaml`](openapi.yaml) (validado por teste de contrato com `kin-openapi`).
+- **Jornada Kids e "Ave do dia" (frente B):**
+  - `?audience=adult|kids` em `/v1/species` e `/v1/filters` (padrão `adult`); `kids` traz só as aves com conteúdo Kids;
+  - `?primaryBiome=` em `/v1/species` filtra pelo "mundo" da ave no Kids, e `/v1/filters` traz `primaryBiomes`;
+  - o detalhe ganha `kids` e `primaryBiome` (os dois `null` quando a ave não tem) e `audio.peaks`, os 64 picos da forma de onda;
+  - `GET /v1/featured` devolve a "Ave do dia" de hoje em São Paulo, com `max-age` até a meia-noite de lá;
+  - o cache usa o prefixo `bff:v2:` desde essa mudança (ADR-0016).
+  - Spec: [`frente-b-kids-design`](https://github.com/velosobr/passarim-docs/blob/main/docs/superpowers/specs/2026-10-28-passarim-frente-b-kids-design.md), seção 7.
 - Spec de design: [`passarim-bff-design`](https://github.com/velosobr/passarim-docs/blob/main/docs/superpowers/specs/2026-10-03-passarim-bff-design.md).
 - ADRs: [0015 (rate limit)](https://github.com/velosobr/passarim-docs/blob/main/docs/adr/0015-rate-limit-em-memoria-por-replica.md)
   e [0016 (cache e stale-while-error)](https://github.com/velosobr/passarim-docs/blob/main/docs/adr/0016-cache-com-envelope-e-stale-while-error.md).
diff --git a/e2e/e2e_test.go b/e2e/e2e_test.go
index 5c0d3f1..1da1cd7 100644
--- a/e2e/e2e_test.go
+++ b/e2e/e2e_test.go
@@ -156,6 +156,23 @@ func TestE2E_BFFWithRealCatalog(t *testing.T) {
 			t.Fatalf("filtros: %d %s", r.status, r.rawBody)
 		}
 	})
+	// Frente B: a "Ave do dia" e os filtros Kids. Enquanto o conteúdo Kids
+	// não está no seed, não há ave elegível e a resposta é o 404 do contrato;
+	// depois dele, é a ave com a data de hoje.
+	t.Run("ave do dia", func(t *testing.T) {
+		r := get(t, base, "/v1/featured")
+		ok200 := r.status == 200 && r.body["date"] != nil && r.body["species"] != nil
+		ok404 := r.status == 404 && r.body["code"] == "FEATURED_NOT_FOUND"
+		if !ok200 && !ok404 {
+			t.Fatalf("ave do dia: %d %s", r.status, r.rawBody)
+		}
+	})
+	t.Run("filtros kids", func(t *testing.T) {
+		r := get(t, base, "/v1/filters?audience=kids")
+		if _, ok := r.body["primaryBiomes"].([]any); r.status != 200 || !ok {
+			t.Fatalf("filtros kids: %d %s", r.status, r.rawBody)
+		}
+	})
 	t.Run("catalog parado: stale para o que já foi visto, 503 para o resto", func(t *testing.T) {
 		_ = get(t, base, "/v1/species/turdus-rufiventris") // garante que está no cache
 		time.Sleep(2 * time.Second)                        // passa do frescor de 1s
```

- [ ] **Step 2: Regenerar o Swagger**

Run: `make swagger && git status --short docs`
Expected: `docs/swagger.html` modificado.

- [ ] **Step 3: Rodar o e2e contra o catalog com a frente B**

O e2e constrói o catalog de `../passarim-catalog`, que precisa estar com os PRs da frente B mergeados (ou apontar `PASSARIM_CATALOG_DIR` para um checkout do branch `feat/ave-do-dia`).

Run: `docker pull golang:1.27-alpine && make e2e 2>&1 | tail -5`
Expected: PASS. A "Ave do dia" responde 404 `FEATURED_NOT_FOUND` enquanto o seed não tem conteúdo Kids, e 200 depois do PR de conteúdo.

- [ ] **Step 4: Govulncheck, commit, push e PR 7**

```bash
go run golang.org/x/vuln/cmd/govulncheck@v1.8.0 ./...
git add -A
git commit -m "docs: README, Swagger e e2e da frente B"
git push -u origin feat/kids-ave-do-dia
gh pr create --base main --title "Frente B: Kids, bioma principal, picos e Ave do dia no BFF" \
  --body "audience e primaryBiome na lista e nos filtros, kids/primaryBiome/audio.peaks no detalhe, primaryBiomes nos filtros e GET /v1/featured (data de São Paulo, max-age até a meia-noite), com cache bff:v2, KindUnimplemented (503) e o openapi 1.1.0. Go 1.27.3 e proto v0.4.0. Deploy depois do catalog com a frente B. Spec: seção 7. Plano B3."
```

Expected: `No vulnerabilities found`; PR aberto.

---

### Task 8: ADR-0022 e a atualização do PRD (PR 8)

**Files:**
- Create: `passarim-docs/docs/adr/0022-conteudo-kids-gerado-por-llm.md`
- Modify: `passarim-docs/docs/superpowers/specs/2026-10-16-passarim-guinada-prd.md` (frente B e seção 7)

- [ ] **Step 1: Branch**

```bash
cd ~/dev/passarim/passarim-docs
git switch main && git pull --ff-only && git switch -c docs/adr-0022
```

- [ ] **Step 2: A ADR**

`docs/adr/0022-conteudo-kids-gerado-por-llm.md`:

```markdown
# ADR-0022: Conteúdo Kids gerado por LLM, com revisão humana

- **Status:** Aceita
- **Data:** 2026-11-07

## Contexto

A jornada Kids precisa de um texto para crianças de 8 a 12 anos para cada espécie: descrição curta, fatos de uma
frase e um "Você sabia?". O MVP tem 41 espécies, e o catálogo vai crescer (o roadmap v2 fala em cerca de 1.970).
Escrever e revisar à mão um segundo texto para cada ave não escala. O texto adulto de cada espécie já é curado e
revisado no YAML do catalog.

## Decisão

- O texto Kids é gerado pelo `cmd/kidsgen` do catalog com um modelo fixado (`claude-opus-5-5`), a partir **só** do
  texto adulto curado (descrição, fatos e biomas). Não vão URLs, UFs nem o nome científico.
- A resposta vem em saída estruturada (JSON com esquema fixo) e passa por um validador com regras fixas: frases de
  até 15 palavras, todo número presente no texto adulto, origem de cada fato, palavras proibidas e o `source_hash`
  do texto adulto. Recusada, volta ao modelo com os erros, até 2 novas tentativas.
- O resultado é gravado no YAML e **revisado por uma pessoa no PR**. Nada é gerado em tempo real: o app, o BFF e o
  catalog só leem o texto já revisado.
- A chave da API fica só na máquina de quem roda o kidsgen; nunca na CI nem no repositório.

## Consequências

- Gerar o conteúdo das 41 espécies custa cerca de US$ 1,50; um catálogo de 1.970 espécies, cerca de US$ 70, em
  lotes. A revisão humana é o gargalo, não a geração.
- Mudar a descrição, um fato ou os biomas invalida o `source_hash`: o lint do conteúdo pede uma nova geração.
- O modelo pode errar o tom ou um tema sensível; o validador pega o que é regra fixa, e a revisão no PR pega o resto
  (tabela de temas sensíveis na spec da frente B, seção 3.4).
- **Relação com a ADR-0011:** a 0011 adia a **identificação de aves** por IA. Esta ADR trata de **geração de
  texto** e não revoga nem muda a 0011.
```

- [ ] **Step 3: O PRD (spec da frente B, seção 12)**

Na frente B do PRD:

- em "Proto", na linha de `ListSpeciesRequest.kids_only`, acrescente `ListSpeciesRequest.primary_biome` (7), o filtro pelo "mundo";
- em "Elegíveis", troque o texto por: "as aves com conteúdo Kids, com canto e com a foto principal de ave sozinha (`SINGLE_BIRD`) ou escolhida pelo override do YAML.";
- em "Escolha", troque o texto por: "rodízio sem repetição, gravado na tabela `featured_day` (spec da frente B, seção 5.3): nenhuma ave se repete até todas as elegíveis aparecerem uma vez, e a ave do dia não muda no meio do dia.";
- em "BFF", na linha de `?audience=kids`, acrescente: "`GET /v1/species` também aceita `?primaryBiome=`, e `/v1/filters` ganha `primaryBiomes`".

Na seção 7, na linha "BFF (REST)", troque o texto por: "`kids`, `primaryBiome` e `audio.peaks` no detalhe; `?audience=kids` na lista e nos filtros; `?primaryBiome=` na lista e `primaryBiomes` nos filtros; `GET /v1/featured`; cache `bff:v2:`, com a audiência e a data nas chaves".

- [ ] **Step 4: Commit, push e PR 8**

```bash
git add -A
git commit -m "docs: ADR-0022 (conteúdo Kids gerado por LLM) e o PRD com o filtro por bioma principal e a elegibilidade com canto"
git push -u origin docs/adr-0022
gh pr create --base main --title "ADR-0022 e PRD atualizado pela frente B" \
  --body "ADR-0022: conteúdo Kids gerado pelo kidsgen, validado por regras fixas e revisado no PR; não muda a ADR-0011. PRD: filtro primary_biome, elegibilidade com canto e o rodízio sem repetição (spec da frente B, seção 12)."
```
