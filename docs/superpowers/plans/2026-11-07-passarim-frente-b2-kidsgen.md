# Frente B2 — Validador do conteúdo Kids, lint, kidsgen e conteúdo: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar no `passarim-catalog` o validador do bloco `kids:`, o lint do conteúdo, o `cmd/kidsgen` que gera o texto Kids com o `claude-opus-5-5` e, com a chave do dono, o conteúdo Kids das espécies do MVP.

**Architecture:**
- **Validador (`internal/kidscontent`):** regras puras de texto (frases, palavras, palavras proibidas), o carimbo `source_hash` do texto adulto e a regra dos números com um parser de números por extenso. Um pacote só, usado pelo teste do conteúdo e pelo kidsgen, para os dois nunca discordarem (spec, seção 3.2).
- **kidsgen (`cmd/kidsgen`):** lê os YAMLs com o loader do seed, escolhe as espécies (`--missing` ou `--ids`), conversa com o modelo atrás de uma interface (`conversation`), pede a resposta em saída estruturada (JSON com esquema), valida, devolve os erros ao modelo até 2 novas tentativas e grava por edição de texto do YAML. Só `anthropic.go` conhece o SDK; a CI nunca chama a API.
- **Conteúdo (PR 6):** o dono roda o kidsgen na máquina dele e revisa espécie por espécie no PR.

**Tech Stack:** Go 1.27.3, `github.com/anthropics/anthropic-sdk-go` v1.84.0 (SDK oficial, publicado em 2026-10-20), `gopkg.in/yaml.v3` (já usado pelo loader), golangci-lint.

**Spec:** `passarim-docs/docs/superpowers/specs/2026-10-28-passarim-frente-b-kids-design.md`, seções 2, 3 (inteira), 8 (ADR, só como referência), 9 ("Conteúdo e validador" e "kidsgen") e 10 (PRs 5 e 6). O BFF (PR 7) e a ADR-0022 (PR 8) ficam no plano B3.

## Global Constraints

- **Comentários didáticos em português** em todo código novo ou alterado (regra do `~/dev/passarim/CLAUDE.md`): todo arquivo começa dizendo o seu papel; funções e blocos não triviais dizem o que fazem e por quê; conceitos (SHA-256, `regexp`, `embed`, tool use, `context`) explicados na primeira vez que aparecem no arquivo; mudou o código, atualiza o comentário.
- **Idioma:** identificadores em inglês; comentários, mensagens de erro, commits, PRs e README em português do Brasil.
- **Identidade do Git:** `velosobr <linoc.veloso@gmail.com>`. Commits terminam com as linhas de atribuição da sessão.
- **Pré-requisito:** o PR 2 da frente B mergeado na `main` do catalog (`domain.KidsContent`, `Species.PrimaryBiome`, o loader com `primary_biome:` e `kids:`). A Task 1 confere.
- **Modelo:** `claude-opus-5-5`, fixo (constante `modelID`). Prazo de 2 min por chamada, uma espécie por vez, sem paralelismo.
- **Chave:** só `ANTHROPIC_API_KEY`, na máquina de quem roda. Nunca na CI, nunca no repositório, nunca impressa. Sem a chave, o kidsgen falha antes de qualquer chamada, exceto no `--dry-run`.
- **Dependência nova:** só `github.com/anthropics/anthropic-sdk-go@v1.84.0`. O `govulncheck` da CI precisa continuar verde.
- **Regras do texto (spec 3.2), exatas:** descrição de 2 a 4 frases; cada fato e o `did_you_know` com exatamente 1; no máximo 15 palavras por frase; de 1 até o número de fatos adultos, `source_fact` válido e sem repetição; palavras proibidas `sangue`, `ensanguentad`, `doença`, `doente`, `cadáver`, `carcaça`, `abate`, `matança` (sem acento, sem maiúsculas, pelo começo da palavra).
- **Formato do erro:** `<id>: <campo>: <motivo>`, por exemplo `turdus-rufiventris: kids.facts[1]: frase com 17 palavras (máximo 15)`.
- **Nada depende de haver 41 espécies.** Sem bloco `kids:`, o lint não exige nada.
- **Branches:** `feat/kidsgen` (PR 5, Tasks 1 a 6) a partir da `main`; `feat/conteudo-kids` (PR 6, Task 7) a partir do `feat/kidsgen` mergeado.
- **Sem merge e sem push na `main`:** os PRs ficam abertos para o dono.

## Review Focus

1. **Texto do modelo com `: `, ` #` ou aspas:** o YAML gravado continua válido e é lido de volta com o mesmo texto. Teste na Task 4 (`TestApplyKids_WithoutBlock`, com `sampleKids`).
2. **Arquivo sem quebra de linha no fim, ou com uma chave depois do bloco `kids:`:** o resto do arquivo fica igual e nada se duplica. Testes na Task 4 (`TestApplyKids_NoTrailingNewline`, `TestApplyKids_ReplacesExisting`).
3. **O mesmo número escrito de jeitos diferentes nas duas pontas** ("2" × "dois", "2.000" × "dois mil", "1,5", "três e meio"): casa por valor; "uma ave" não conta. Golden file na Task 2 e `TestValidate_Rules/número_inventado` na Task 3.
4. **Segunda rodada de `--missing` logo depois de gerar:** não regenera (o carimbo bate), e não paga outra chamada. Teste na Task 6 (`TestRun_MissingWritesAndSkipsWithoutAdultText`).
5. **Espécie sem fatos adultos (catálogo crescendo):** é pulada antes de chamar a API e não conta como falha. Teste na Task 6 (o mesmo).

---

### Task 1: Validador — frases, palavras, palavras proibidas e o carimbo do texto adulto

**Files:**
- Create: `internal/kidscontent/text.go`, `internal/kidscontent/text_test.go`, `internal/kidscontent/validate_test.go` (só a função `adult`, nesta task)

**Interfaces:**
- Produces: `kidscontent.MaxWords = 15`; `kidscontent.Sentences(text string) []string`; `kidscontent.Words(sentence string) int`; `kidscontent.ForbiddenWord(text string) string`; `kidscontent.Collapse(s string) string`; `kidscontent.SourceHash(s domain.Species) string`; os auxiliares internos `isLetterOrDigit`, `notLetter`.

- [ ] **Step 1: Conferir o pré-requisito e criar o branch**

```bash
cd ~/dev/passarim/passarim-catalog
git switch main && git pull --ff-only
grep -q 'Kids         \*KidsContent' internal/domain/species.go && grep -q primary_biome internal/adapter/curated/loader.go && echo "PR 2 ok"
git switch -c feat/kidsgen
```

Expected: `PR 2 ok`. Sem essa linha, pare: o PR 2 da frente B ainda não foi mergeado.

- [ ] **Step 2: Escrever os testes que falham**

`internal/kidscontent/validate_test.go` começa só com o cabeçalho e a função `adult` (a Task 3 completa o arquivo):

```go
// Testes do validador do bloco kids:, um caso por regra da spec (seção 3.2).

package kidscontent_test

import (
	"github.com/velosobr/passarim-catalog/internal/domain"
)

// adult devolve a espécie só com o texto adulto (sem Kids). Os espaços
// sobrando na descrição são de propósito: o carimbo os colapsa.
func adult() domain.Species {
	return domain.Species{
		ID: "turdus-rufiventris", CommonNamePt: "Sabiá-laranjeira",
		Description: "O sabiá  canta por dois minutos.\n Ele vive em quintais.",
		Facts: []domain.Fact{{Text: "Foi declarado ave nacional em 2002.", Source: "https://a"},
			{Text: "Imita outras aves.", Source: "https://b"}},
		Biomes: []domain.Biome{domain.BiomeMataAtlantica, domain.BiomeCerrado},
		States: []string{"SP"},
	}
}
```

`internal/kidscontent/text_test.go`:

```go
// Testes das regras de texto: frases, palavras, palavras proibidas e o
// carimbo do texto adulto.

package kidscontent_test

import (
	"fmt"
	"testing"

	"github.com/velosobr/passarim-catalog/internal/domain"
	"github.com/velosobr/passarim-catalog/internal/kidscontent"
)

func TestSentences(t *testing.T) {
	cases := map[string]string{
		"Ele canta. Ele voa!":         "[Ele canta. Ele voa!]",
		"Tem 2.000 penas. E voa.":     "[Tem 2.000 penas. E voa.]",
		"Será? Sim... Voa":            "[Será? Sim... Voa]",
		"  Uma frase só, sem ponto  ": "[Uma frase só, sem ponto]",
	}
	for in, want := range cases {
		got := kidscontent.Sentences(in)
		if fmt.Sprintf("%v", got) != want || (in == "Tem 2.000 penas. E voa." && len(got) != 2) {
			t.Errorf("%q: veio %q (%d frases)", in, got, len(got))
		}
	}
}

func TestWords(t *testing.T) {
	cases := map[string]int{"O tico-tico canta.": 3, "Ele voa — e pousa.": 4, "Tem 2 asas.": 3, "": 0}
	for in, want := range cases {
		if got := kidscontent.Words(in); got != want {
			t.Errorf("%q: %d palavras, esperava %d", in, got, want)
		}
	}
}

func TestForbiddenWord(t *testing.T) {
	cases := map[string]string{"Ele tem SANGUE frio.": "SANGUE", "Viu uma carcaça.": "carcaça", "O sabiá canta.": "", "Ficou ensanguentado.": "ensanguentado"}
	for in, want := range cases {
		if got := kidscontent.ForbiddenWord(in); got != want {
			t.Errorf("%q: veio %q, esperava %q", in, got, want)
		}
	}
}

// O carimbo tem valor fixo para o texto canônico da spec, ignora espaços
// sobrando, a ordem dos biomas, as fontes e as UFs, e muda com a descrição,
// um fato ou um bioma.
func TestSourceHash(t *testing.T) {
	base := adult()
	want := "sha256:6c44eb3f2e5b562ae1620d990cf24ce8672a7c937df78e2eb9160bec389d6eae"
	if got := kidscontent.SourceHash(base); got != want {
		t.Fatalf("carimbo %s, esperava %s", got, want)
	}
	same := adult()
	same.Biomes = []domain.Biome{domain.BiomeCerrado, domain.BiomeMataAtlantica}
	same.Facts[0].Source, same.States = "https://outra", []string{"RJ"}
	same.Description = "  O sabiá canta por dois minutos. Ele vive em quintais. "
	if kidscontent.SourceHash(same) != want {
		t.Fatal("ordem dos biomas, fontes, UFs e espaços não deveriam mudar o carimbo")
	}
	for name, change := range map[string]func(*domain.Species){
		"descrição": func(s *domain.Species) { s.Description += " Mais." },
		"fato":      func(s *domain.Species) { s.Facts[1].Text = "Outro fato." },
		"bioma":     func(s *domain.Species) { s.Biomes = append(s.Biomes, domain.BiomePampa) },
	} {
		s := adult()
		change(&s)
		if kidscontent.SourceHash(s) == want {
			t.Errorf("mudar %s deveria mudar o carimbo", name)
		}
	}
}
```

O valor fixo do `TestSourceHash` é o SHA-256 de `"O sabiá canta por dois minutos. Ele vive em quintais.\nFoi declarado ave nacional em 2002.\nImita outras aves.\ncerrado,mata_atlantica"` (o texto canônico da spec, seção 3.1). Ele trava o formato: quem mudar a ordem das partes ou o separador quebra o teste, e todos os `source_hash` gravados ficariam velhos.

- [ ] **Step 3: Rodar e ver falhar**

Run: `go test ./internal/kidscontent/`
Expected: FAIL na compilação (`undefined: kidscontent.Sentences`).

- [ ] **Step 4: Implementar**

`internal/kidscontent/text.go`:

```go
// Regras de texto do conteúdo Kids (frente B): como cortar frases, contar
// palavras, achar palavras proibidas e calcular o "carimbo" do texto adulto.
// Ficam num pacote só, usado pelo teste do conteúdo (o "lint") e pelo
// cmd/kidsgen, para os dois nunca discordarem sobre o que é um texto válido.

package kidscontent

import (
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"slices"
	"strings"
	"unicode"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

// MaxWords é o máximo de palavras numa frase do Kids.
const MaxWords = 15

// sentenceEnd acha o fim de uma frase: um ou mais ".", "!" ou "?" seguidos
// de espaço em branco ou do fim do texto. Assim o ponto de "2.000" não corta
// a frase, porque vem seguido de um algarismo. regexp é o pacote de
// expressões regulares do Go: \s é qualquer espaço em branco e $, o fim.
var sentenceEnd = regexp.MustCompile(`[.!?]+(\s+|$)`)

// Sentences divide o texto em frases, sem espaços nas pontas. Um trecho no
// fim sem pontuação também conta como frase: o validador conta frases e
// palavras, não exige o ponto final.
func Sentences(text string) []string {
	var out []string
	start := 0
	for _, loc := range sentenceEnd.FindAllStringIndex(text, -1) {
		if s := strings.TrimSpace(text[start:loc[1]]); s != "" {
			out = append(out, s)
		}
		start = loc[1]
	}
	if s := strings.TrimSpace(text[start:]); s != "" {
		out = append(out, s)
	}
	return out
}

// Words conta as palavras de uma frase: os trechos entre espaços que têm
// pelo menos uma letra ou um algarismo. "tico-tico" é uma palavra só, e um
// travessão solto ("—") não conta.
func Words(sentence string) int {
	n := 0
	for _, f := range strings.Fields(sentence) {
		if strings.IndexFunc(f, isLetterOrDigit) >= 0 {
			n++
		}
	}
	return n
}

func isLetterOrDigit(r rune) bool { return unicode.IsLetter(r) || unicode.IsDigit(r) }

// notLetter diz se o caractere separa palavras (tudo o que não é letra).
func notLetter(r rune) bool { return !unicode.IsLetter(r) }

// forbidden são começos de palavra que o Kids nunca usa, já sem acento e em
// minúsculas. A lista é curta de propósito: o resto da suavização fica com o
// prompt e com a revisão humana (spec da frente B, seção 3.4).
var forbidden = []string{"sangue", "ensanguentad", "doenca", "doente", "cadaver", "carcaca", "abate", "matanca"}

// ForbiddenWord devolve a primeira palavra do texto que começa com um termo
// proibido ("" se não houver). A comparação ignora acentos e maiúsculas:
// "Doença" e "doenca" são a mesma palavra.
func ForbiddenWord(text string) string {
	for _, w := range strings.FieldsFunc(text, notLetter) {
		n := domain.NormalizeForSearch(w)
		for _, f := range forbidden {
			if strings.HasPrefix(n, f) {
				return w
			}
		}
	}
	return ""
}

// Collapse troca qualquer sequência de espaços em branco (inclusive quebras
// de linha) por um espaço só e apara as pontas.
func Collapse(s string) string { return strings.Join(strings.Fields(s), " ") }

// SourceHash é o "carimbo" do texto adulto de onde o Kids saiu: o SHA-256,
// em hexadecimal com o prefixo "sha256:", de um texto canônico com três
// partes separadas por "\n" (spec, seção 3.1):
//  1. a descrição adulta com os espaços colapsados;
//  2. os fatos adultos, na ordem, colapsados e separados por "\n";
//  3. os biomas em ordem alfabética, separados por vírgula.
//
// SHA-256 é uma função de hash: o mesmo texto dá sempre o mesmo carimbo, e
// mudar uma letra muda o carimbo inteiro. Mudar a descrição, um fato ou os
// biomas pede uma nova geração; mudar só as fontes, o tamanho ou as UFs, não.
func SourceHash(s domain.Species) string {
	facts := make([]string, len(s.Facts))
	for i, f := range s.Facts {
		facts[i] = Collapse(f.Text)
	}
	biomes := make([]string, len(s.Biomes))
	for i, b := range s.Biomes {
		biomes[i] = string(b)
	}
	slices.Sort(biomes)
	canonical := Collapse(s.Description) + "\n" + strings.Join(facts, "\n") + "\n" + strings.Join(biomes, ",")
	sum := sha256.Sum256([]byte(canonical))
	return "sha256:" + hex.EncodeToString(sum[:])
}
```

- [ ] **Step 5: Rodar os testes**

Run: `go test ./internal/kidscontent/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: regras de texto e carimbo do conteúdo Kids"
```

---

### Task 2: Validador — regra dos números, com golden file

**Files:**
- Create: `internal/kidscontent/numbers.go`, `internal/kidscontent/numbers_test.go`, `internal/kidscontent/testdata/numbers.json`

**Interfaces:**
- Consumes: Task 1 (`notLetter`).
- Produces: `kidscontent.Numbers(text string) []float64` (primeiro os números com algarismos, depois os por extenso, cada grupo na ordem do texto); internos `numberKey(v float64) float64`, `numberSet(text string) map[float64]bool`, `formatNumber(v float64) string`, usados na Task 3.

- [ ] **Step 1: Golden file e teste que falham**

`internal/kidscontent/testdata/numbers.json` (os casos da spec, seção 9, mais frases reais do catálogo):

```json
[
  {"text": "Ele vive dois anos.", "want": [2]},
  {"text": "Põe vinte e cinco ovos.", "want": [25]},
  {"text": "Voa dois mil quilômetros.", "want": [2000]},
  {"text": "O ninho tem 2.000 gravetos.", "want": [2000]},
  {"text": "Pesa 1,5 quilo.", "want": [1.5]},
  {"text": "Mede meio metro.", "want": [0.5]},
  {"text": "Uma ave canta.", "want": []},
  {"text": "Há um milhão de aves.", "want": [1000000]},
  {"text": "Em 2002 virou símbolo.", "want": [2002]},
  {"text": "Choca por cento e vinte dias.", "want": [120]},
  {"text": "Restam dois milhões e quinhentos mil.", "want": [2500000]},
  {"text": "O filhote voa com vinte e um dias.", "want": [21]},
  {"text": "Dorme três e meio dias.", "want": [3.5]},
  {"text": "O tico-tico come milho.", "want": []},
  {"text": "Bota duas ou três vezes.", "want": [2, 3]},
  {"text": "Canta entre 13 e 14 horas.", "want": [13, 14]},
  {"text": "Vive até mil metros de altitude.", "want": [1000]},
  {"text": "Mede 1.5 metro.", "want": [1.5]},
  {"text": "Voa a 4 mil metros de altitude.", "want": [4000]},
  {"text": "Come 200 mil insetos por ano.", "want": [200000]},
  {"text": "Restam 1,5 milhão de aves.", "want": [1500000]},
  {"text": "Vive no meio da mata.", "want": []},
  {"text": "Canta à meia-noite.", "want": []},
  {"text": "Dorme meia hora.", "want": [0.5]}
]
```

Por que cada caso existe:
- `"Uma ave canta."` → nada: `um`/`uma` sozinhos são artigos (spec 3.3, [DR] 3);
- `"Há um milhão de aves."` e `"vinte e um"`: `um` conta dentro de um número maior;
- `"O tico-tico come milho."`: "milho" não é "mil", e o hífen separa palavras;
- `"Mede 1.5 metro."`: um ponto que não separa grupos de 3 é decimal;
- `"Bota duas ou três vezes."`: "ou" fecha o número, e saem dois valores;
- `"4 mil metros"`, `"1,5 milhão"`: algarismo com escala é um número só (o catálogo tem "4 mil metros" e "200 mil insetos");
- `"no meio da mata"`, `"meia-noite"`: `meio`/`meia` só contam depois de "e" ou antes de uma medida.

`internal/kidscontent/numbers_test.go`:

```go
// Testes do parser de números com um golden file: testdata/numbers.json
// tem frases reais e os valores que o parser deve achar nelas.

package kidscontent_test

import (
	"encoding/json"
	"fmt"
	"os"
	"testing"

	"github.com/velosobr/passarim-catalog/internal/kidscontent"
)

// numberCase é uma linha do golden file.
type numberCase struct {
	Text string    `json:"text"`
	Want []float64 `json:"want"`
}

func TestNumbersGolden(t *testing.T) {
	raw, err := os.ReadFile("testdata/numbers.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []numberCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		if got := kidscontent.Numbers(c.Text); fmt.Sprint(got) != fmt.Sprint(c.Want) {
			t.Errorf("%q: veio %v, esperava %v", c.Text, got, c.Want)
		}
	}
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `go test ./internal/kidscontent/ -run TestNumbersGolden`
Expected: FAIL na compilação (`undefined: kidscontent.Numbers`).

- [ ] **Step 3: Implementar**

`internal/kidscontent/numbers.go`:

```go
// Regra dos números do Kids (spec da frente B, seção 3.3): todo número do
// texto Kids tem que aparecer no texto adulto, para a IA não inventar
// quantidades. Este arquivo acha os números de um texto, escritos com
// algarismos ("2.000", "1,5") ou por extenso ("vinte e cinco", "dois mil",
// "meio"), e devolve o VALOR de cada um: assim "2 minutos" casa com "dois
// minutos".

package kidscontent

import (
	"math"
	"regexp"
	"strconv"
	"strings"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

// digitsPattern acha um número com algarismos, com "." e "," entre os grupos
// ("2.000", "1,5", "2002"), e a escala por extenso que vier logo depois
// ("4 mil", "1,5 milhão"). Um ponto final logo depois não entra, porque o
// padrão exige um algarismo depois de cada separador. \b é a fronteira de
// palavra: "milhares" não é lido como "mil".
var digitsPattern = regexp.MustCompile(`(\d+(?:[.,]\d+)*)(?:\s+(mil|milhão|milhao|milhões|milhoes)\b)?`)

// wordValues são as palavras que valem um número sozinhas, já sem acento
// (o texto passa por domain.NormalizeForSearch antes). "um" e "uma" não
// estão aqui: só contam dentro de um número maior ("vinte e um", "um mil"),
// porque quase sempre são artigos ("uma ave").
var wordValues = map[string]float64{
	"zero": 0, "dois": 2, "duas": 2, "tres": 3, "quatro": 4, "cinco": 5, "seis": 6, "sete": 7, "oito": 8, "nove": 9,
	"dez": 10, "onze": 11, "doze": 12, "treze": 13, "catorze": 14, "quatorze": 14, "quinze": 15, "dezesseis": 16,
	"dezessete": 17, "dezoito": 18, "dezenove": 19, "vinte": 20, "trinta": 30, "quarenta": 40, "cinquenta": 50,
	"sessenta": 60, "setenta": 70, "oitenta": 80, "noventa": 90, "cem": 100, "cento": 100,
	"duzentos": 200, "duzentas": 200, "trezentos": 300, "trezentas": 300, "quatrocentos": 400, "quatrocentas": 400,
	"quinhentos": 500, "quinhentas": 500, "seiscentos": 600, "seiscentas": 600, "setecentos": 700, "setecentas": 700,
	"oitocentos": 800, "oitocentas": 800, "novecentos": 900, "novecentas": 900,
}

// scales multiplicam a parte que vem antes: "dois mil" = 2 × 1000.
var scales = map[string]float64{"mil": 1e3, "milhao": 1e6, "milhoes": 1e6}

// units são as palavras de medida depois das quais "meio" e "meia" são um
// número ("meio metro", "meia hora"). Sem elas, "meio" é quase sempre outra
// coisa: "no meio da mata", "meia-noite", "meio ambiente".
var units = map[string]bool{
	"metro": true, "metros": true, "centimetro": true, "centimetros": true, "quilometro": true, "quilometros": true,
	"quilo": true, "quilos": true, "grama": true, "gramas": true, "litro": true, "litros": true,
	"hora": true, "horas": true, "minuto": true, "minutos": true, "segundo": true, "segundos": true,
	"dia": true, "dias": true, "ano": true, "anos": true,
}

// Numbers devolve os valores dos números do texto: primeiro os escritos com
// algarismos, depois os por extenso, cada grupo na ordem do texto. Um número
// com algarismos e escala ("4 mil") vale um número só (4000); a escala sai
// do texto antes da leitura por extenso, para não contar 1000 de novo.
func Numbers(text string) []float64 {
	var out []float64
	for _, m := range digitsPattern.FindAllStringSubmatch(text, -1) {
		v, ok := parseDigits(m[1])
		if !ok {
			continue
		}
		if m[2] != "" {
			v *= scales[domain.NormalizeForSearch(m[2])]
		}
		out = append(out, v)
	}
	return append(out, wordNumbers(digitsPattern.ReplaceAllString(text, " "))...)
}

// parseDigits lê um número no padrão brasileiro: "," separa os decimais
// ("1,5" = 1.5) e "." separa os milhares ("2.000" = 2000). Um "." que não
// separa grupos de 3 algarismos é lido como decimal ("1.5"), como num texto
// em inglês.
func parseDigits(s string) (float64, bool) {
	if strings.Contains(s, ",") {
		s = strings.Replace(strings.ReplaceAll(s, ".", ""), ",", ".", 1)
	} else if parts := strings.Split(s, "."); len(parts) > 1 && thousandGroups(parts[1:]) {
		s = strings.Join(parts, "")
	}
	v, err := strconv.ParseFloat(s, 64)
	return v, err == nil
}

// thousandGroups diz se todos os grupos depois do primeiro têm 3 algarismos.
func thousandGroups(groups []string) bool {
	for _, g := range groups {
		if len(g) != 3 {
			return false
		}
	}
	return true
}

// isNumberWord diz se a palavra pode fazer parte de um número por extenso.
func isNumberWord(w string) bool {
	_, value := wordValues[w]
	_, scale := scales[w]
	return value || scale || w == "um" || w == "uma" || w == "meio" || w == "meia"
}

// wordNumbers lê os números por extenso. Vai palavra por palavra somando:
// current é a parte desde a última escala ("quinhentos") e total, o que já
// foi multiplicado por uma escala ("dois mil"). O "e" só liga as partes
// quando vem entre duas palavras de número ("vinte e cinco"); qualquer outra
// palavra fecha o número.
func wordNumbers(text string) []float64 {
	words := strings.FieldsFunc(domain.NormalizeForSearch(text), notLetter)
	var out []float64
	var total, current float64
	in := false // dentro de um número por extenso
	flush := func() {
		if in {
			out = append(out, total+current)
		}
		total, current, in = 0, 0, false
	}
	for i, w := range words {
		next, afterAnd := "", in && i > 0 && words[i-1] == "e"
		if i+1 < len(words) {
			next = words[i+1]
		}
		_, isScale := scales[next]
		switch value, isValue := wordValues[w]; {
		case w == "e" && in && isNumberWord(next):
			// O "e" de "vinte e cinco": nada a somar.
		case w == "um" || w == "uma":
			switch {
			case afterAnd: // "vinte e um"
				current++
			case isScale: // "um milhão"
				flush()
				in, current = true, 1
			default: // artigo: "uma ave"
				flush()
			}
		case w == "meio" || w == "meia":
			switch {
			case afterAnd: // "dois e meio"
				current += 0.5
			case units[next]: // "meio metro", "meia hora"
				flush()
				out = append(out, 0.5)
			default: // "no meio da mata", "meia-noite"
				flush()
			}
		case isValue:
			in = true
			current += value
		case scales[w] > 0:
			in = true
			total += math.Max(current, 1) * scales[w]
			current = 0
		default:
			flush()
		}
	}
	flush()
	return out
}

// numberKey arredonda o valor a 3 casas, para comparar números como chaves
// de um mapa sem tropeçar no arredondamento dos float (0,5 é sempre 0,5).
func numberKey(v float64) float64 { return math.Round(v*1000) / 1000 }

// numberSet devolve os valores dos números do texto, como conjunto.
func numberSet(text string) map[float64]bool {
	out := map[float64]bool{}
	for _, v := range Numbers(text) {
		out[numberKey(v)] = true
	}
	return out
}

// formatNumber escreve o valor como no erro ("2000", "1.5").
func formatNumber(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }
```

- [ ] **Step 4: Rodar os testes**

Run: `go test ./internal/kidscontent/`
Expected: PASS (os 24 casos do golden).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: regra dos números do conteúdo Kids, com parser de números por extenso"
```

---

### Task 3: Validador completo e o lint do conteúdo

**Files:**
- Create: `internal/kidscontent/validate.go`
- Modify: `internal/kidscontent/validate_test.go` (completo), `content/content_test.go`, `content/README.md`, `.golangci.yml`

**Interfaces:**
- Consumes: Tasks 1 e 2.
- Produces: `kidscontent.Validate(s domain.Species) []error` (nil = válido ou sem bloco `kids:`), usado pelo teste do conteúdo e pelo kidsgen (Task 5).

- [ ] **Step 1: Testes que falham**

Troque `internal/kidscontent/validate_test.go` inteiro por:

`internal/kidscontent/validate_test.go`:

```go
// Testes do validador do bloco kids:, um caso por regra da spec (seção 3.2).

package kidscontent_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/velosobr/passarim-catalog/internal/domain"
	"github.com/velosobr/passarim-catalog/internal/kidscontent"
)

// adult devolve a espécie só com o texto adulto (sem Kids). Os espaços
// sobrando na descrição são de propósito: o carimbo os colapsa.
func adult() domain.Species {
	return domain.Species{
		ID: "turdus-rufiventris", CommonNamePt: "Sabiá-laranjeira",
		Description: "O sabiá  canta por dois minutos.\n Ele vive em quintais.",
		Facts: []domain.Fact{{Text: "Foi declarado ave nacional em 2002.", Source: "https://a"},
			{Text: "Imita outras aves.", Source: "https://b"}},
		Biomes: []domain.Biome{domain.BiomeMataAtlantica, domain.BiomeCerrado},
		States: []string{"SP"},
	}
}

// valid devolve a espécie com um bloco Kids que passa em todas as regras.
func valid() domain.Species {
	s := adult()
	s.PrimaryBiome = domain.BiomeMataAtlantica
	s.Kids = &domain.KidsContent{
		Description: "O sabiá tem a barriga laranja. Ele canta por 2 minutos.",
		Facts: []domain.KidsFact{{Text: "Em 2002 ele virou a ave do Brasil.", SourceFact: 0},
			{Text: "Ele imita outras aves.", SourceFact: 1}},
		DidYouKnow:  "O sabiá acorda bem cedinho.",
		GeneratedBy: "claude-opus-5-5",
		SourceHash:  kidscontent.SourceHash(adult()),
	}
	return s
}

func TestValidate_ValidAndAbsent(t *testing.T) {
	if errs := kidscontent.Validate(valid()); errs != nil {
		t.Fatalf("válida recusada: %v", errs)
	}
	if errs := kidscontent.Validate(adult()); errs != nil {
		t.Fatalf("sem bloco kids: não há o que validar, veio %v", errs)
	}
}

// Cada caso quebra uma regra e confere o trecho do erro.
func TestValidate_Rules(t *testing.T) {
	cases := map[string]struct {
		change func(*domain.Species)
		want   string
	}{
		"generated_by faltando": {func(s *domain.Species) { s.Kids.GeneratedBy = "" }, "kids.generated_by: obrigatório"},
		"bioma fora da lista":   {func(s *domain.Species) { s.PrimaryBiome = domain.BiomePampa }, `primary_biome: "pampa" não está`},
		"sem bioma principal":   {func(s *domain.Species) { s.PrimaryBiome = "" }, "primary_biome: obrigatório"},
		"hash velho":            {func(s *domain.Species) { s.Description = "Outro texto adulto. Bem diferente." }, "kids.source_hash:"},
		"source_fact inválido":  {func(s *domain.Species) { s.Kids.Facts[0].SourceFact = 5 }, "kids.facts[0]: source_fact 5 não existe"},
		"source_fact repetido":  {func(s *domain.Species) { s.Kids.Facts[1].SourceFact = 0 }, "kids.facts[1]: source_fact 0 repetido"},
		"fatos demais": {func(s *domain.Species) {
			s.Kids.Facts = append(s.Kids.Facts, domain.KidsFact{Text: "Mais um.", SourceFact: 1})
		}, "kids.facts: de 1 a 2 fatos"},
		"frase com 16 palavras":  {func(s *domain.Species) { s.Kids.DidYouKnow = strings.Repeat("pio ", 15) + "pio." }, "kids.did_you_know: frase com 16 palavras (máximo 15)"},
		"descrição com 1 frase":  {func(s *domain.Species) { s.Kids.Description = "O sabiá é laranja." }, "kids.description: precisa de 2 a 4 frases, tem 1"},
		"descrição com 5 frases": {func(s *domain.Species) { s.Kids.Description = strings.Repeat("Ele canta. ", 5) }, "kids.description: precisa de 2 a 4 frases, tem 5"},
		"fato com 2 frases":      {func(s *domain.Species) { s.Kids.Facts[1].Text = "Ele imita. Ele canta." }, "kids.facts[1]: precisa de exatamente 1 frase, tem 2"},
		"proibida com acento":    {func(s *domain.Species) { s.Kids.DidYouKnow = "Ele não pega Doença." }, `kids.did_you_know: palavra proibida "Doença"`},
		"proibida sem acento":    {func(s *domain.Species) { s.Kids.DidYouKnow = "Ele não pega doenca." }, `kids.did_you_know: palavra proibida "doenca"`},
		"número inventado":       {func(s *domain.Species) { s.Kids.Facts[1].Text = "Ele vive três anos." }, "kids.facts[1]: o número 3 não aparece no texto adulto"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			s := valid()
			tc.change(&s)
			got := errors.Join(kidscontent.Validate(s)...)
			if got == nil || !strings.Contains(got.Error(), "turdus-rufiventris: "+tc.want) {
				t.Fatalf("esperava %q, veio %v", tc.want, got)
			}
		})
	}
}

// 15 palavras passam, e "tico-tico" conta como uma palavra só.
func TestValidate_FifteenWordsWithHyphen(t *testing.T) {
	s := valid()
	s.Kids.DidYouKnow = strings.TrimSpace(strings.Repeat("tico-tico ", 15)) + "."
	if errs := kidscontent.Validate(s); errs != nil {
		t.Fatalf("15 palavras com hífen deveriam passar: %v", errs)
	}
}
```

Acrescente ao `content/content_test.go` o import `"github.com/velosobr/passarim-catalog/internal/kidscontent"` e, no fim:

```go
// TestKidsContent roda o validador do conteúdo Kids (internal/kidscontent)
// em toda espécie que tem o bloco kids:. Sem o bloco, nada é exigido: o
// catálogo cresce, e o kidsgen roda por lote (spec da frente B, seção 3.2).
func TestKidsContent(t *testing.T) {
	species, err := curated.LoadDir("species")
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range species {
		for _, problem := range kidscontent.Validate(s) {
			t.Error(problem)
		}
	}
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `go test ./internal/kidscontent/ ./content/`
Expected: FAIL na compilação (`undefined: kidscontent.Validate`).

- [ ] **Step 3: Implementar**

`internal/kidscontent/validate.go`:

```go
// Validador do bloco kids: (spec da frente B, seção 3.2). Junta as regras
// de text.go e numbers.go e devolve todos os problemas de uma espécie de
// uma vez, para quem revisa (ou o kidsgen, que manda os erros de volta ao
// modelo) ver tudo o que falta corrigir.

package kidscontent

import (
	"fmt"
	"slices"
	"strings"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

// report junta os problemas de uma espécie, no formato
// "<id>: <campo>: <motivo>".
type report struct {
	id   string
	errs []error
}

func (r *report) add(field, reason string) {
	r.errs = append(r.errs, fmt.Errorf("%s: %s: %s", r.id, field, reason))
}

// Validate confere o bloco kids: de uma espécie e devolve todos os problemas
// (nil = válido). Sem bloco kids:, não há o que conferir: a regra do bioma
// principal sem Kids fica no loader (domain.Species.Validate), e o catálogo
// pode crescer com espécies que ainda não passaram pelo kidsgen.
func Validate(s domain.Species) []error {
	k := s.Kids
	if k == nil {
		return nil
	}
	r := &report{id: s.ID}
	switch {
	case s.PrimaryBiome == "":
		r.add("primary_biome", "obrigatório quando há o bloco kids")
	case !slices.Contains(s.Biomes, s.PrimaryBiome):
		r.add("primary_biome", fmt.Sprintf("%q não está entre os biomas da espécie", s.PrimaryBiome))
	}
	if strings.TrimSpace(k.GeneratedBy) == "" {
		r.add("kids.generated_by", "obrigatório")
	}
	if k.SourceHash != SourceHash(s) {
		r.add("kids.source_hash", "o texto adulto mudou desde a geração; rode o kidsgen de novo para esta espécie")
	}
	if n := len(k.Facts); n == 0 || n > len(s.Facts) {
		r.add("kids.facts", fmt.Sprintf("de 1 a %d fatos (um por fato adulto), veio %d", len(s.Facts), n))
	}
	seen := map[int]bool{}
	for i, f := range k.Facts {
		field := fmt.Sprintf("kids.facts[%d]", i)
		switch {
		case f.SourceFact < 0 || f.SourceFact >= len(s.Facts):
			r.add(field, fmt.Sprintf("source_fact %d não existe (há %d fatos adultos)", f.SourceFact, len(s.Facts)))
		case seen[f.SourceFact]:
			r.add(field, fmt.Sprintf("source_fact %d repetido", f.SourceFact))
		}
		seen[f.SourceFact] = true
	}

	adult := numberSet(adultText(s))
	r.text("kids.description", k.Description, 2, 4, adult)
	for i, f := range k.Facts {
		r.text(fmt.Sprintf("kids.facts[%d]", i), f.Text, 1, 1, adult)
	}
	r.text("kids.did_you_know", k.DidYouKnow, 1, 1, adult)
	return r.errs
}

// adultText junta a descrição e os fatos adultos: é nele que a regra dos
// números procura cada número do Kids.
func adultText(s domain.Species) string {
	parts := []string{s.Description}
	for _, f := range s.Facts {
		parts = append(parts, f.Text)
	}
	return strings.Join(parts, "\n")
}

// text confere um campo de texto do Kids: o número de frases, as palavras de
// cada frase, os números e as palavras proibidas.
func (r *report) text(field, text string, minSentences, maxSentences int, adult map[float64]bool) {
	if strings.TrimSpace(text) == "" {
		r.add(field, "vazio")
		return
	}
	sentences := Sentences(text)
	if n := len(sentences); n < minSentences || n > maxSentences {
		if minSentences == maxSentences {
			r.add(field, fmt.Sprintf("precisa de exatamente %d frase, tem %d", minSentences, n))
		} else {
			r.add(field, fmt.Sprintf("precisa de %d a %d frases, tem %d", minSentences, maxSentences, n))
		}
	}
	for _, s := range sentences {
		if n := Words(s); n > MaxWords {
			r.add(field, fmt.Sprintf("frase com %d palavras (máximo %d)", n, MaxWords))
		}
	}
	for _, v := range Numbers(text) {
		if !adult[numberKey(v)] {
			r.add(field, fmt.Sprintf("o número %s não aparece no texto adulto", formatNumber(v)))
		}
	}
	if w := ForbiddenWord(text); w != "" {
		r.add(field, fmt.Sprintf("palavra proibida %q", w))
	}
}
```

- [ ] **Step 4: Documentar o bloco no guia do conteúdo**

No fim de `content/README.md`:

```markdown
## Conteúdo Kids (`primary_biome:` e `kids:`)

A linha `primary_biome:` e o bloco `kids:` são escritos pelo `cmd/kidsgen` (frente B) e revisados por uma pessoa no PR. O `go test ./content/` roda o validador em toda espécie que tem o bloco: frases (descrição de 2 a 4, fatos e "Você sabia?" com 1, até 15 palavras cada), números (todo número do Kids precisa estar no texto adulto), palavras proibidas e o `source_hash`. Sem o bloco, nada é exigido.

- Gerar para as espécies que faltam: `ANTHROPIC_API_KEY=... go run ./cmd/kidsgen --missing`. A chave fica só na sua máquina.
- Uma espécie: `--ids turdus-rufiventris`. Ver o prompt sem gastar: `--dry-run`, sem a chave.
- Mudou a descrição, um fato ou os biomas? O `source_hash` deixa de bater, o teste falha e pede uma nova geração. Mudar só as fontes, o tamanho ou as UFs não invalida.
- O bioma principal pode ser trocado à mão (ele não entra no `source_hash`), desde que continue entre os `biomes`.
```

- [ ] **Step 5: Rodar os testes e o lint**

Run: `go test ./internal/kidscontent/ ./content/ && make lint`
Expected: PASS e `0 issues`. Se o `misspell` reclamar de "regulares" (comentário do `text.go`), acrescente `regulares` ao fim da lista `ignore-rules` do `.golangci.yml`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: validador do bloco kids: e lint do conteúdo"
```

---

### Task 4: kidsgen — gravação no YAML por edição de texto

**Files:**
- Create: `cmd/kidsgen/main.go` (provisório), `cmd/kidsgen/yamledit.go`, `cmd/kidsgen/yamledit_test.go`

**Interfaces:**
- Consumes: o loader `curated.LoadDir` (nos testes).
- Produces: `applyKids(src []byte, primary domain.Biome, k domain.KidsContent) ([]byte, error)`, `kidsBlock(k domain.KidsContent) string` e, nos testes, `baseYAML` e `load(t, text)`, usados na Task 6.

- [ ] **Step 1: Pacote e testes que falham**

`cmd/kidsgen/main.go` provisório, só para o pacote compilar (a Task 6 troca o arquivo inteiro):

```go
// cmd/kidsgen gera o conteúdo Kids (frente B) a partir do texto adulto
// curado. Por enquanto só a edição do YAML; o programa vem depois.
package main

func main() {}
```

`cmd/kidsgen/yamledit_test.go`:

```go
// Testes da edição de texto do YAML: o arquivo editado continua lido pelo
// mesmo loader do seed, com os valores novos, e o resto do arquivo não muda.

package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/velosobr/passarim-catalog/internal/adapter/curated"
	"github.com/velosobr/passarim-catalog/internal/domain"
)

// baseYAML é um arquivo de espécie como os do catálogo, sem as chaves novas.
const baseYAML = `scientific_name: Turdus rufiventris
common_name_pt: Sabiá-laranjeira
family: Turdidae
conservation_status: LC
biomes: [mata_atlantica, cerrado]
states: [SP]
# comentário que precisa continuar no arquivo
description: >
  Ave de peito alaranjado, comum em quintais.
description_source_url: https://pt.wikipedia.org/wiki/Sabi%C3%A1-laranjeira
facts:
  - text: Foi declarada ave-símbolo em 2002.
    source: https://a
  - text: Imita outras aves.
    source: https://b
`

// sampleKids tem textos com ": ", " #" e aspas, que exigem aspas no YAML.
func sampleKids() domain.KidsContent {
	return domain.KidsContent{
		Description: "O sabiá tem a barriga cor de laranja e vive em quintais, parques e matas de quase todo o Brasil. Ele canta cedo.",
		Facts: []domain.KidsFact{{Text: "Em 2002: virou a ave do Brasil.", SourceFact: 0},
			{Text: `Ele imita o "bem-te-vi" #sério.`, SourceFact: 1}},
		DidYouKnow: "O sabiá canta bem cedinho.", GeneratedBy: "claude-opus-5-5", SourceHash: "sha256:abc",
	}
}

// load grava o texto num diretório temporário e o lê com o loader do seed.
func load(t *testing.T, text []byte) domain.Species {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "turdus-rufiventris.yaml"), text, 0o600); err != nil {
		t.Fatal(err)
	}
	species, err := curated.LoadDir(dir)
	if err != nil {
		t.Fatalf("o loader recusou o arquivo editado: %v\n%s", err, text)
	}
	return species[0]
}

func TestApplyKids_WithoutBlock(t *testing.T) {
	out, err := applyKids([]byte(baseYAML), domain.BiomeMataAtlantica, sampleKids())
	if err != nil {
		t.Fatal(err)
	}
	s := load(t, out)
	want := sampleKids()
	if s.PrimaryBiome != domain.BiomeMataAtlantica || s.Kids.Description != want.Description ||
		s.Kids.Facts[0].Text != want.Facts[0].Text || s.Kids.Facts[1].Text != want.Facts[1].Text || s.Kids.DidYouKnow != want.DidYouKnow {
		t.Fatalf("lido de volta: bioma=%q kids=%+v", s.PrimaryBiome, s.Kids)
	}
	text := string(out)
	if !strings.Contains(text, "biomes: [mata_atlantica, cerrado]\nprimary_biome: mata_atlantica\nstates:") {
		t.Fatalf("primary_biome deveria vir logo depois de biomes:\n%s", text)
	}
	if !strings.HasPrefix(text, baseYAML[:strings.Index(baseYAML, "biomes:")]) || !strings.Contains(text, "# comentário que precisa continuar") {
		t.Fatalf("o resto do arquivo mudou:\n%s", text)
	}
	if !strings.HasSuffix(text, "  source_hash: sha256:abc\n") {
		t.Fatalf("o bloco kids: deveria ir para o fim:\n%s", text)
	}
}

// Rodar de novo troca a linha e o bloco, sem duplicar nada, e uma chave
// depois do bloco continua lá.
func TestApplyKids_ReplacesExisting(t *testing.T) {
	first, err := applyKids([]byte(baseYAML), domain.BiomeMataAtlantica, sampleKids())
	if err != nil {
		t.Fatal(err)
	}
	withKeyAfter := string(first) + "size_cm: 23\n"
	k := sampleKids()
	k.DidYouKnow = "Ele mora no cerrado também."
	out, err := applyKids([]byte(withKeyAfter), domain.BiomeCerrado, k)
	if err != nil {
		t.Fatal(err)
	}
	text := string(out)
	if strings.Count(text, "primary_biome:") != 1 || strings.Count(text, "kids:") != 1 || !strings.HasSuffix(text, "size_cm: 23\n") {
		t.Fatalf("troca errada:\n%s", text)
	}
	s := load(t, out)
	if s.PrimaryBiome != domain.BiomeCerrado || s.Kids.DidYouKnow != k.DidYouKnow || s.SizeCm == nil || *s.SizeCm != 23 {
		t.Fatalf("lido de volta: bioma=%q kids=%+v size=%v", s.PrimaryBiome, s.Kids, s.SizeCm)
	}
}

// Um arquivo que termina sem quebra de linha ganha a quebra antes do bloco.
func TestApplyKids_NoTrailingNewline(t *testing.T) {
	out, err := applyKids([]byte(strings.TrimSuffix(baseYAML, "\n")), domain.BiomeMataAtlantica, sampleKids())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(out), "source: https://b\nkids:\n") {
		t.Fatalf("faltou a quebra antes do bloco:\n%s", out)
	}
	load(t, out)
}

// biomes: em várias linhas é recusado com uma mensagem clara.
func TestApplyKids_BiomesNotInline(t *testing.T) {
	multi := strings.Replace(baseYAML, "biomes: [mata_atlantica, cerrado]", "biomes:\n  - mata_atlantica\n  - cerrado", 1)
	if _, err := applyKids([]byte(multi), domain.BiomeMataAtlantica, sampleKids()); err == nil || !strings.Contains(err.Error(), "numa linha só") {
		t.Fatalf("esperava o erro do formato de biomes:, veio %v", err)
	}
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `go test ./cmd/kidsgen/`
Expected: FAIL na compilação (`undefined: applyKids`).

- [ ] **Step 3: Implementar**

`cmd/kidsgen/yamledit.go`:

```go
// Gravação do resultado do kidsgen no YAML da espécie, por edição de TEXTO
// (spec da frente B, seção 3.5). Regravar o arquivo inteiro com um
// codificador YAML trocaria o estilo ">" da descrição, a ordem das chaves e
// apagaria os comentários; editando só as linhas certas, o diff do PR de
// conteúdo fica pequeno e fácil de revisar.

package main

import (
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

// (?m) faz ^ e $ valerem para cada linha, não só para o texto inteiro.
var (
	biomesLine   = regexp.MustCompile(`(?m)^biomes:.*$`)
	biomesInline = regexp.MustCompile(`^biomes:\s*\[[^\]]*\]\s*(#.*)?$`)
	primaryLine  = regexp.MustCompile(`(?m)^primary_biome:.*\n`)
	kidsLine     = regexp.MustCompile(`(?m)^kids:.*\n`)
)

// applyKids devolve o arquivo com a linha primary_biome: e o bloco kids:
// novos:
//   - primary_biome: é trocada se existir; senão, entra logo depois de biomes:;
//   - o bloco kids: é trocado se existir; senão, entra no fim do arquivo.
//
// biomes: precisa estar numa linha só ("[a, b]"), que é o formato de todos
// os YAMLs do catálogo; em outro formato, applyKids recusa em vez de chutar
// onde a lista termina.
func applyKids(src []byte, primary domain.Biome, k domain.KidsContent) ([]byte, error) {
	text := string(src)
	if !strings.HasSuffix(text, "\n") {
		text += "\n"
	}
	loc := biomesLine.FindStringIndex(text)
	if loc == nil {
		return nil, errors.New("chave biomes: não encontrada")
	}
	if !biomesInline.MatchString(text[loc[0]:loc[1]]) {
		return nil, errors.New("biomes: precisa estar numa linha só, no formato [a, b]")
	}
	line := "primary_biome: " + string(primary) + "\n"
	if m := primaryLine.FindStringIndex(text); m != nil {
		text = text[:m[0]] + line + text[m[1]:]
	} else {
		end := loc[1] + 1 // logo depois da quebra de linha de biomes:
		text = text[:end] + line + text[end:]
	}
	block := kidsBlock(k)
	if start, end, ok := kidsSpan(text); ok {
		return []byte(text[:start] + block + text[end:]), nil
	}
	return []byte(text + block), nil
}

// kidsSpan acha o bloco kids: — da linha "kids:" até a próxima chave do topo
// (uma linha que começa sem espaço e não é comentário) ou o fim do arquivo.
func kidsSpan(text string) (start, end int, ok bool) {
	m := kidsLine.FindStringIndex(text)
	if m == nil {
		return 0, 0, false
	}
	pos := m[1]
	for pos < len(text) {
		lineEnd := len(text)
		if nl := strings.IndexByte(text[pos:], '\n'); nl >= 0 {
			lineEnd = pos + nl + 1
		}
		if c := text[pos]; c != ' ' && c != '\t' && c != '\n' && c != '#' {
			return m[0], pos, true
		}
		pos = lineEnd
	}
	return m[0], len(text), true
}

// kidsBlock escreve o bloco kids: no formato da spec (seção 3.1). A descrição
// usa o estilo ">" ("dobrado": na leitura, as quebras de linha viram
// espaços), em linhas de até 76 caracteres.
func kidsBlock(k domain.KidsContent) string {
	var b strings.Builder
	b.WriteString("kids:\n  description: >\n")
	for _, line := range wrap(k.Description, 76) {
		b.WriteString("    " + line + "\n")
	}
	b.WriteString("  facts:\n")
	for _, f := range k.Facts {
		fmt.Fprintf(&b, "    - text: %s\n      source_fact: %d\n", yamlScalar(f.Text), f.SourceFact)
	}
	fmt.Fprintf(&b, "  did_you_know: %s\n  generated_by: %s\n  source_hash: %s\n",
		yamlScalar(k.DidYouKnow), k.GeneratedBy, k.SourceHash)
	return b.String()
}

// yamlScalar escreve um texto de uma linha. Sem aspas, como no resto do
// catálogo, a não ser que o texto tenha algo que o YAML leria de outro jeito:
// ": " (viraria um mapa), " #" (começo de comentário) ou um caractere especial
// no começo. Aí vai entre aspas duplas, com \ e " escapados.
func yamlScalar(s string) string {
	if s == "" || strings.ContainsAny(s[:1], "-?:,[]{}#&*!|>'\"%@`") || strings.Contains(s, ": ") ||
		strings.Contains(s, " #") || strings.HasSuffix(s, ":") {
		return `"` + strings.ReplaceAll(strings.ReplaceAll(s, `\`, `\\`), `"`, `\"`) + `"`
	}
	return s
}

// wrap quebra o texto em linhas de até width caracteres, sem cortar palavras.
func wrap(text string, width int) []string {
	var lines []string
	line := ""
	for _, w := range strings.Fields(text) {
		switch {
		case line == "":
			line = w
		case len([]rune(line))+1+len([]rune(w)) > width:
			lines = append(lines, line)
			line = w
		default:
			line += " " + w
		}
	}
	if line != "" {
		lines = append(lines, line)
	}
	return lines
}
```

Sobre `yamlScalar`: a spec mostra os textos sem aspas, e é assim que eles saem quase sempre. As aspas só entram quando o texto quebraria o YAML (o `sampleKids` do teste tem os três casos).

- [ ] **Step 4: Rodar os testes**

Run: `go test ./cmd/kidsgen/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: kidsgen grava primary_biome e kids: por edição de texto do YAML"
```

---

### Task 5: kidsgen — prompt e ciclo de geração com novas tentativas

**Files:**
- Create: `cmd/kidsgen/prompt.md`, `cmd/kidsgen/prompt.go`, `cmd/kidsgen/generate.go`, `cmd/kidsgen/prompt_test.go`, `cmd/kidsgen/generate_test.go`, `cmd/kidsgen/testdata/user_message.golden` (gerado pelo teste)

**Interfaces:**
- Consumes: Task 3 (`kidscontent.Validate`, `SourceHash`, `Collapse`).
- Produces: `systemPrompt string`, `userMessage(s domain.Species) string`, `biomeNames(s domain.Species) []string`; `modelID = "claude-opus-5-5"`, `maxAttempts = 3`; `modelOutput{Description, Facts []factOutput, DidYouKnow, PrimaryBiome, BiomeReason}`, `factOutput{Text, SourceFact}`; `conversation` (interface com `send(ctx, message string) (modelOutput, error)`); `result{species domain.Species; reason string}`; `generate(ctx, conv conversation, s domain.Species) (result, error)`; nos testes, `fakeConversation`, `adultSpecies()`.

- [ ] **Step 1: Testes que falham**

`cmd/kidsgen/generate_test.go`:

```go
// Testes do ciclo de geração com uma conversa falsa: a CI nunca chama a API.

package main

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/velosobr/passarim-catalog/internal/domain"
	"github.com/velosobr/passarim-catalog/internal/kidscontent"
)

// fakeConversation devolve as saídas na ordem e guarda as mensagens recebidas.
type fakeConversation struct {
	outputs  []modelOutput
	err      error
	messages []string
}

func (f *fakeConversation) send(_ context.Context, message string) (modelOutput, error) {
	f.messages = append(f.messages, message)
	if f.err != nil {
		return modelOutput{}, f.err
	}
	out := f.outputs[0]
	f.outputs = f.outputs[1:]
	return out, nil
}

// adultSpecies é uma espécie com texto adulto e sem Kids.
func adultSpecies() domain.Species {
	return domain.Species{
		ID: "turdus-rufiventris", ScientificName: "Turdus rufiventris", CommonNamePt: "Sabiá-laranjeira",
		Description: "O sabiá canta por dois minutos. Ele vive em quintais.",
		Facts: []domain.Fact{{Text: "Foi declarado ave nacional em 2002.", Source: "https://a"},
			{Text: "Imita outras aves.", Source: "https://b"}},
		Biomes: []domain.Biome{domain.BiomeMataAtlantica, domain.BiomeCerrado},
		States: []string{"SP"},
	}
}

// goodOutput passa no validador; badOutput tem uma frase de 16 palavras.
func goodOutput() modelOutput {
	return modelOutput{
		Description:  "O sabiá tem a barriga laranja. Ele canta por 2 minutos.",
		Facts:        []factOutput{{Text: "Em 2002 ele virou a ave do Brasil.", SourceFact: 0}},
		DidYouKnow:   "Ele imita outras aves.",
		PrimaryBiome: "mata_atlantica", BiomeReason: "É onde ele é mais lembrado.",
	}
}

func badOutput() modelOutput {
	o := goodOutput()
	o.DidYouKnow = strings.Repeat("pio ", 15) + "pio."
	return o
}

func TestGenerate_AcceptsOnSecondAttempt(t *testing.T) {
	conv := &fakeConversation{outputs: []modelOutput{badOutput(), goodOutput()}}
	res, err := generate(context.Background(), conv, adultSpecies())
	if err != nil {
		t.Fatal(err)
	}
	if len(conv.messages) != 2 || conv.messages[0] != userMessage(adultSpecies()) ||
		!strings.Contains(conv.messages[1], "frase com 16 palavras") {
		t.Fatalf("mensagens: %q", conv.messages)
	}
	k := res.species.Kids
	if res.species.PrimaryBiome != domain.BiomeMataAtlantica || k.GeneratedBy != modelID ||
		k.SourceHash != kidscontent.SourceHash(adultSpecies()) || res.reason == "" {
		t.Fatalf("resultado: %+v %+v", res.species.PrimaryBiome, k)
	}
}

func TestGenerate_GivesUpAfterThirdAttempt(t *testing.T) {
	conv := &fakeConversation{outputs: []modelOutput{badOutput(), badOutput(), badOutput(), goodOutput()}}
	_, err := generate(context.Background(), conv, adultSpecies())
	if err == nil || !strings.Contains(err.Error(), "recusado depois de 3 tentativas") || len(conv.messages) != 3 {
		t.Fatalf("err=%v mensagens=%d", err, len(conv.messages))
	}
}

// Um bioma fora da lista da ave também é recusado e volta como erro ao modelo.
func TestGenerate_BiomeOutsideListIsRetried(t *testing.T) {
	wrong := goodOutput()
	wrong.PrimaryBiome = "pampa"
	conv := &fakeConversation{outputs: []modelOutput{wrong, goodOutput()}}
	if _, err := generate(context.Background(), conv, adultSpecies()); err != nil || !strings.Contains(conv.messages[1], "primary_biome") {
		t.Fatalf("err=%v mensagens=%q", err, conv.messages)
	}
}

// Um erro da API encerra a espécie sem novas tentativas.
func TestGenerate_APIErrorStops(t *testing.T) {
	conv := &fakeConversation{err: errors.New("sem rede")}
	if _, err := generate(context.Background(), conv, adultSpecies()); err == nil || len(conv.messages) != 1 {
		t.Fatalf("err=%v mensagens=%d", err, len(conv.messages))
	}
}
```

`cmd/kidsgen/prompt_test.go`:

```go
// Testes do prompt: a mensagem da espécie com um golden file e as regras
// fixas do prompt.md.

package main

import (
	"flag"
	"os"
	"strings"
	"testing"
)

// update regrava o golden file: go test ./cmd/kidsgen/ -run TestUserMessageGolden -update
var update = flag.Bool("update", false, "regrava os golden files em testdata/")

func TestUserMessageGolden(t *testing.T) {
	got := userMessage(adultSpecies())
	golden := "testdata/user_message.golden"
	if *update {
		if err := os.WriteFile(golden, []byte(got), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(golden)
	if err != nil {
		t.Fatalf("golden ausente (rode com -update): %v", err)
	}
	if got != string(want) {
		t.Fatalf("mensagem mudou:\n%s\n--- golden ---\n%s", got, want)
	}
	// O que nunca vai ao modelo: links, UFs e o nome científico.
	for _, leak := range []string{"https://", "Turdus rufiventris", "SP"} {
		if strings.Contains(got, leak) {
			t.Errorf("a mensagem não deveria ter %q", leak)
		}
	}
}

// As regras do prompt citam os limites da spec.
func TestSystemPromptRules(t *testing.T) {
	for _, rule := range []string{"15 palavras", "de 2 a 4 frases", "JSON", "Suavizar sem esconder", "carcaça"} {
		if !strings.Contains(strings.ToLower(systemPrompt), strings.ToLower(rule)) {
			t.Errorf("o prompt deveria citar %q", rule)
		}
	}
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `go test ./cmd/kidsgen/`
Expected: FAIL na compilação (`undefined: generate`, `undefined: userMessage`).

- [ ] **Step 3: O prompt**

`cmd/kidsgen/prompt.md` (as regras da spec, seção 3.5, com a tabela da seção 3.4):

```markdown
Você escreve o conteúdo Kids do Passarim, um guia de aves do Brasil. O
público tem de 8 a 12 anos e já lê sozinho. Você recebe o texto adulto de
uma ave, já curado e revisado, e o reescreve para essa criança. Responda
só com o JSON no formato pedido.

## Regras do texto

- Use só o que está no texto adulto. Não invente fatos, lugares, cores,
  comportamentos nem comparações.
- Nenhum número que não esteja no texto adulto. Escreva os números como no
  texto adulto ou por extenso ("dois minutos"). Nunca escreva o número 1 em
  algarismo: use "um" ou "uma".
- description: de 2 a 4 frases.
- Cada fato e o did_you_know: exatamente 1 frase.
- Toda frase com no máximo 15 palavras. Termine cada frase com ".", "!" ou "?".
- facts: um fato Kids para cada fato adulto que couber numa frase curta. Em
  source_fact, ponha o número do fato adulto de onde ele saiu. Não repita um
  source_fact. Pode deixar de fora um fato adulto que não fique bom para
  criança.
- did_you_know: uma curiosidade do texto adulto que ainda não esteja nos
  fatos nem na descrição, se houver; senão, um detalhe da descrição.
- Sem nome científico, sem links e sem citar fontes.
- Tom direto e caloroso, sem infantilizar: nada de diminutivos em excesso
  nem de "amiguinho".

## Temas sensíveis: suavizar sem esconder

| Tema no texto adulto | Como fica no Kids | O que sai |
|---|---|---|
| Predação ("preda macacos e preguiças") | "Caça outros bichos para comer" ou o nome do bicho sem detalhe | Como a presa morre |
| Carniça ("alimenta-se de carcaças") | "Come animais que já morreram e ajuda a limpar a natureza" | "Carcaça", "podre" |
| Tráfico ("vítima do tráfico de animais") | "Pessoas tiram essas aves da natureza, e isso é proibido" | Detalhe de como, e números de aves apreendidas ou mortas |
| Extinção e ameaça | "Restam poucas, e muita gente trabalha para protegê-las" | Tom de desesperança |
| Doença, ferimento, morte de filhotes | Omitido | Tudo |
| Caça humana | "Por muito tempo, pessoas caçaram essa ave" | Detalhe |

Nunca use as palavras sangue, ensanguentado, doença, doente, cadáver,
carcaça, abate nem matança.

## Bioma principal

Escolha em primary_biome um dos biomas da ave: o bioma em que ela é mais
típica ou mais lembrada pelos brasileiros. Ele vira o "mundo" da ave no
Kids. Em biome_reason, explique a escolha numa frase, para quem revisa.

## Correções

Se a próxima mensagem trouxer erros do validador, corrija só o que eles
apontam e responda de novo com o JSON inteiro.
```

`cmd/kidsgen/prompt.go`:

```go
// O prompt do kidsgen: as regras fixas (prompt.md, embutido no binário) e a
// mensagem com o texto adulto de cada espécie.

package main

import (
	_ "embed" // o import "em branco" habilita a diretiva //go:embed abaixo
	"fmt"
	"strings"

	"github.com/velosobr/passarim-catalog/internal/domain"
	"github.com/velosobr/passarim-catalog/internal/kidscontent"
)

// systemPrompt são as regras do conteúdo Kids. //go:embed copia o arquivo
// para dentro do binário na compilação: o kidsgen roda de qualquer pasta, e
// o texto das regras fica num arquivo fácil de revisar no PR.
//
//go:embed prompt.md
var systemPrompt string

// userMessage monta a mensagem com o texto adulto de uma espécie: só o nome
// popular, a descrição, os fatos numerados a partir de 0 e os biomas. URLs,
// UFs e o nome científico ficam de fora, para o modelo não ter de onde tirar
// nada além do texto curado.
func userMessage(s domain.Species) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Ave: %s\n\nDescrição adulta:\n%s\n\nFatos adultos (o número é o source_fact):\n",
		s.CommonNamePt, kidscontent.Collapse(s.Description))
	for i, f := range s.Facts {
		fmt.Fprintf(&b, "%d. %s\n", i, kidscontent.Collapse(f.Text))
	}
	fmt.Fprintf(&b, "\nBiomas da ave (primary_biome sai desta lista): %s\n", strings.Join(biomeNames(s), ", "))
	return b.String()
}

// biomeNames devolve os biomas da espécie como texto, na ordem do YAML.
func biomeNames(s domain.Species) []string {
	out := make([]string, len(s.Biomes))
	for i, b := range s.Biomes {
		out[i] = string(b)
	}
	return out
}
```

- [ ] **Step 4: O ciclo de geração**

`cmd/kidsgen/generate.go`:

```go
// O ciclo de geração de uma espécie: pede ao modelo, confere com o
// validador do conteúdo e, se ele recusar, devolve os erros ao modelo na
// mesma conversa, até 2 novas tentativas (spec da frente B, seção 3.5). O
// modelo fica atrás da interface conversation: os testes usam um falso, e a
// CI nunca chama a API.

package main

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/velosobr/passarim-catalog/internal/domain"
	"github.com/velosobr/passarim-catalog/internal/kidscontent"
)

// modelID é o modelo fixado pelo dono para o kidsgen.
const modelID = "claude-opus-5-5"

// maxAttempts é a primeira tentativa mais as 2 novas.
const maxAttempts = 3

// modelOutput é o JSON que o modelo devolve (o esquema está em
// outputSchema). As tags json dizem o nome de cada campo nesse JSON.
type modelOutput struct {
	Description  string       `json:"description"`
	Facts        []factOutput `json:"facts"`
	DidYouKnow   string       `json:"did_you_know"`
	PrimaryBiome string       `json:"primary_biome"`
	BiomeReason  string       `json:"biome_reason"`
}

type factOutput struct {
	Text       string `json:"text"`
	SourceFact int    `json:"source_fact"`
}

// conversation é uma conversa com o modelo sobre UMA espécie. send manda a
// mensagem (na primeira vez, o texto adulto; depois, os erros do validador)
// e devolve a resposta já lida do JSON.
type conversation interface {
	send(ctx context.Context, message string) (modelOutput, error)
}

// result é uma geração aceita pelo validador.
type result struct {
	species domain.Species // a espécie com o PrimaryBiome e o Kids novos
	reason  string         // a justificativa do bioma, só para o terminal
}

// generate roda o ciclo para uma espécie. Um erro da API encerra a espécie
// na hora (tentar de novo não corrige uma chave errada nem a falta de
// rede); só a recusa do validador gasta as novas tentativas.
func generate(ctx context.Context, conv conversation, s domain.Species) (result, error) {
	message := userMessage(s)
	var problems []error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		out, err := conv.send(ctx, message)
		if err != nil {
			return result{}, fmt.Errorf("tentativa %d: %w", attempt, err)
		}
		candidate := withKids(s, out)
		if problems = kidscontent.Validate(candidate); len(problems) == 0 {
			return result{species: candidate, reason: out.BiomeReason}, nil
		}
		message = feedback(problems)
	}
	return result{}, fmt.Errorf("recusado depois de %d tentativas: %w", maxAttempts, errors.Join(problems...))
}

// withKids devolve uma cópia da espécie com a saída do modelo. generated_by
// e source_hash são preenchidos aqui, não pelo modelo.
func withKids(s domain.Species, out modelOutput) domain.Species {
	k := &domain.KidsContent{
		Description: kidscontent.Collapse(out.Description),
		DidYouKnow:  kidscontent.Collapse(out.DidYouKnow),
		GeneratedBy: modelID,
		SourceHash:  kidscontent.SourceHash(s),
	}
	for _, f := range out.Facts {
		k.Facts = append(k.Facts, domain.KidsFact{Text: kidscontent.Collapse(f.Text), SourceFact: f.SourceFact})
	}
	s.PrimaryBiome = domain.Biome(out.PrimaryBiome)
	s.Kids = k
	return s
}

// feedback é a mensagem com os erros do validador para a nova tentativa.
func feedback(problems []error) string {
	var b strings.Builder
	b.WriteString("O validador recusou o conteúdo:\n")
	for _, p := range problems {
		b.WriteString("- " + p.Error() + "\n")
	}
	b.WriteString("Corrija só esses pontos e responda de novo com o JSON inteiro.")
	return b.String()
}
```

- [ ] **Step 5: Gravar o golden e rodar**

Run: `mkdir -p cmd/kidsgen/testdata && go test ./cmd/kidsgen/ -run TestUserMessageGolden -update && go test ./cmd/kidsgen/`
Expected: o primeiro grava `testdata/user_message.golden`; o segundo PASS. Confira o golden:

```text
Ave: Sabiá-laranjeira

Descrição adulta:
O sabiá canta por dois minutos. Ele vive em quintais.

Fatos adultos (o número é o source_fact):
0. Foi declarado ave nacional em 2002.
1. Imita outras aves.

Biomas da ave (primary_biome sai desta lista): mata_atlantica, cerrado
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: prompt do kidsgen e ciclo de geração com até 2 novas tentativas"
```

---

### Task 6: kidsgen — conversa com a API, programa e PR 5

**Files:**
- Create: `cmd/kidsgen/anthropic.go`, `cmd/kidsgen/anthropic_test.go`, `cmd/kidsgen/main_test.go`
- Modify: `cmd/kidsgen/main.go` (o programa de verdade), `go.mod`, `go.sum`

**Interfaces:**
- Consumes: Tasks 4 e 5.
- Produces: `callTimeout = 2 * time.Minute`, `maxTokens = 16000`, `outputSchema(biomes []string) map[string]any`, `newAnthropicConversation(apiKey string, s domain.Species) conversation`; `starter`; `run(ctx, args []string, apiKey string, out io.Writer, start starter) error`; `selectSpecies`, `writeKids`.

- [ ] **Step 1: Dependência**

```bash
go get github.com/anthropics/anthropic-sdk-go@v1.84.0 && go mod tidy
```

Expected: `go.mod` com `github.com/anthropics/anthropic-sdk-go v1.84.0`.

- [ ] **Step 2: Testes que falham**

`cmd/kidsgen/anthropic_test.go`:

```go
// Teste do esquema JSON da resposta do modelo. A conversa com a API em si
// não é testada: a CI nunca chama a API (spec da frente B, seção 9).

package main

import (
	"encoding/json"
	"strings"
	"testing"
)

// O bioma principal só pode sair da lista da ave, todos os campos são
// obrigatórios e nenhum campo a mais é aceito (additionalProperties: false,
// que a saída estruturada exige).
func TestOutputSchema(t *testing.T) {
	raw, err := json.Marshal(outputSchema([]string{"mata_atlantica", "cerrado"}))
	if err != nil {
		t.Fatal(err)
	}
	var schema struct {
		Properties map[string]struct {
			Enum  []string `json:"enum"`
			Items struct {
				AdditionalProperties *bool `json:"additionalProperties"`
			} `json:"items"`
		} `json:"properties"`
		Required             []string `json:"required"`
		AdditionalProperties *bool    `json:"additionalProperties"`
	}
	if err := json.Unmarshal(raw, &schema); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(schema.Properties["primary_biome"].Enum, ","); got != "mata_atlantica,cerrado" {
		t.Fatalf("enum = %q", got)
	}
	if len(schema.Required) != 5 || schema.AdditionalProperties == nil || *schema.AdditionalProperties ||
		schema.Properties["facts"].Items.AdditionalProperties == nil || *schema.Properties["facts"].Items.AdditionalProperties {
		t.Fatalf("esquema: %s", raw)
	}
}
```

`cmd/kidsgen/main_test.go`:

```go
// Testes do programa inteiro (run) numa pasta temporária, com a conversa
// falsa no lugar do modelo.

package main

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/velosobr/passarim-catalog/internal/adapter/curated"
	"github.com/velosobr/passarim-catalog/internal/domain"
)

// noFactsYAML é uma espécie sem fatos adultos: o kidsgen a pula.
const noFactsYAML = `scientific_name: Crotophaga ani
common_name_pt: Anu-preto
family: Cuculidae
conservation_status: LC
biomes: [cerrado]
states: [SP]
description: >
  Ave preta de bico alto.
description_source_url: https://x
`

// contentDir monta uma pasta com o sabiá (de baseYAML) e o anu sem fatos.
func contentDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	for name, text := range map[string]string{"turdus-rufiventris.yaml": baseYAML, "crotophaga-ani.yaml": noFactsYAML} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(text), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

// fakeStarter abre sempre a mesma conversa falsa e conta quantas abriu.
func fakeStarter(conv *fakeConversation, opened *int) starter {
	return func(string, domain.Species) conversation {
		*opened++
		return conv
	}
}

// O sabiá precisa de saídas que casem com os fatos de baseYAML.
func sabiaOutput() modelOutput {
	return modelOutput{
		Description:  "O sabiá tem o peito laranja. Ele vive em quintais.",
		Facts:        []factOutput{{Text: "Em 2002 ele virou ave-símbolo.", SourceFact: 0}},
		DidYouKnow:   "Ele imita outras aves.",
		PrimaryBiome: "mata_atlantica", BiomeReason: "É a mata dos quintais do Sudeste.",
	}
}

func TestRun_NoKeyFailsBeforeCalling(t *testing.T) {
	opened := 0
	err := run(context.Background(), []string{"--dir", contentDir(t), "--missing"}, "", &bytes.Buffer{}, fakeStarter(nil, &opened))
	if err == nil || !strings.Contains(err.Error(), "ANTHROPIC_API_KEY") || opened != 0 {
		t.Fatalf("err=%v conversas=%d", err, opened)
	}
}

// --dry-run sem chave só mostra o prompt e não grava nada.
func TestRun_DryRunWithoutKeyShowsPrompt(t *testing.T) {
	dir := contentDir(t)
	var out bytes.Buffer
	if err := run(context.Background(), []string{"--dir", dir, "--ids", "turdus-rufiventris", "--dry-run"}, "", &out, nil); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "== prompt do sistema ==") || !strings.Contains(out.String(), "Ave: Sabiá-laranjeira") {
		t.Fatalf("saída:\n%s", out.String())
	}
	if raw, _ := os.ReadFile(filepath.Join(dir, "turdus-rufiventris.yaml")); string(raw) != baseYAML { //nolint:gosec // G304: pasta temporária do teste
		t.Fatal("o --dry-run não deveria gravar")
	}
}

// --missing gera o sabiá, grava o YAML (lido de volta pelo loader) e pula o
// anu sem chamar o modelo.
func TestRun_MissingWritesAndSkipsWithoutAdultText(t *testing.T) {
	dir := contentDir(t)
	conv := &fakeConversation{outputs: []modelOutput{sabiaOutput()}}
	opened := 0
	var out bytes.Buffer
	if err := run(context.Background(), []string{"--dir", dir, "--missing"}, "chave", &out, fakeStarter(conv, &opened)); err != nil {
		t.Fatalf("%v\n%s", err, out.String())
	}
	if opened != 1 || !strings.Contains(out.String(), "crotophaga-ani: pulada, sem texto adulto curado") ||
		!strings.Contains(out.String(), "turdus-rufiventris → primary_biome: mata_atlantica (É a mata dos quintais do Sudeste.)") {
		t.Fatalf("conversas=%d saída:\n%s", opened, out.String())
	}
	species, err := curated.LoadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if species[1].ID != "turdus-rufiventris" || species[1].Kids == nil || species[1].PrimaryBiome != domain.BiomeMataAtlantica {
		t.Fatalf("o YAML não ganhou o bloco: %+v", species[1])
	}
	// Uma segunda rodada --missing não acha mais o sabiá: o carimbo bate.
	opened = 0
	if err := run(context.Background(), []string{"--dir", dir, "--missing"}, "chave", &bytes.Buffer{}, fakeStarter(conv, &opened)); err != nil || opened != 0 {
		t.Fatalf("err=%v conversas=%d", err, opened)
	}
}

// Uma espécie recusada nas 3 tentativas não é gravada, e run devolve erro
// (o programa sai com código 1) citando a espécie.
func TestRun_FailureIsReported(t *testing.T) {
	dir := contentDir(t)
	bad := sabiaOutput()
	bad.PrimaryBiome = "pampa"
	conv := &fakeConversation{outputs: []modelOutput{bad, bad, bad}}
	opened := 0
	err := run(context.Background(), []string{"--dir", dir, "--ids", "turdus-rufiventris"}, "chave", &bytes.Buffer{}, fakeStarter(conv, &opened))
	if err == nil || !strings.Contains(err.Error(), "turdus-rufiventris") {
		t.Fatalf("esperava erro citando a espécie, veio %v", err)
	}
	if raw, _ := os.ReadFile(filepath.Join(dir, "turdus-rufiventris.yaml")); string(raw) != baseYAML { //nolint:gosec // G304: pasta temporária do teste
		t.Fatal("uma espécie recusada não deveria ser gravada")
	}
}

func TestRun_ArgumentErrors(t *testing.T) {
	dir := contentDir(t)
	for _, args := range [][]string{{"--dir", dir}, {"--dir", dir, "--missing", "--ids", "x"}, {"--dir", dir, "--ids", "nao-existe", "--dry-run"}} {
		if err := run(context.Background(), args, "", &bytes.Buffer{}, nil); err == nil {
			t.Errorf("%v: esperava erro", args)
		}
	}
}
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `go test ./cmd/kidsgen/`
Expected: FAIL na compilação (`undefined: outputSchema`, `undefined: run`, `undefined: starter`).

- [ ] **Step 4: A conversa com a API**

`cmd/kidsgen/anthropic.go`:

```go
// A conversa de verdade com o modelo, pelo SDK oficial da Anthropic para Go
// (github.com/anthropics/anthropic-sdk-go). É o único arquivo do kidsgen
// que conhece o SDK; o resto conversa pela interface conversation.

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"

	"github.com/velosobr/passarim-catalog/internal/domain"
)

// callTimeout é o prazo de cada chamada à API (spec, seção 3.5).
const callTimeout = 2 * time.Minute

// maxTokens é o teto de tokens da resposta. O claude-opus-5-5 sempre pensa
// antes de responder, e o raciocínio conta nesse teto: com pouco espaço, a
// resposta pararia no meio do JSON.
const maxTokens = 16000

// anthropicConversation guarda o histórico da conversa sobre uma espécie:
// a API não guarda nada entre chamadas, então cada nova tentativa manda as
// mensagens anteriores de novo, com a resposta do modelo e os erros do
// validador.
type anthropicConversation struct {
	client   anthropic.Client
	biomes   []string
	messages []anthropic.MessageParam
}

// newAnthropicConversation abre uma conversa para a espécie.
func newAnthropicConversation(apiKey string, s domain.Species) conversation {
	return &anthropicConversation{client: anthropic.NewClient(option.WithAPIKey(apiKey)), biomes: biomeNames(s)}
}

// send pede a resposta em "saída estruturada" (output_config.format): a API
// garante que o texto devolvido é um JSON que segue o esquema de
// outputSchema. É assim que a resposta vem com campos fixos, em vez de texto
// solto.
func (c *anthropicConversation) send(ctx context.Context, message string) (modelOutput, error) {
	c.messages = append(c.messages, anthropic.NewUserMessage(anthropic.NewTextBlock(message)))
	ctx, cancel := context.WithTimeout(ctx, callTimeout)
	defer cancel()
	resp, err := c.client.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     anthropic.Model(modelID),
		MaxTokens: maxTokens,
		System:    []anthropic.TextBlockParam{{Text: systemPrompt}},
		Messages:  c.messages,
		OutputConfig: anthropic.OutputConfigParam{
			// effort é o quanto o modelo raciocina; fixado aqui para o custo
			// de uma rodada não mudar se o padrão da API mudar.
			Effort: anthropic.OutputConfigEffortMedium,
			Format: anthropic.JSONOutputFormatParam{Schema: outputSchema(c.biomes)},
		},
	})
	if err != nil {
		return modelOutput{}, err
	}
	// stop_reason diz por que a resposta acabou. Só "end_turn" é uma resposta
	// inteira; "max_tokens" ou "refusal" deixariam o JSON pela metade.
	if resp.StopReason != anthropic.StopReasonEndTurn {
		return modelOutput{}, fmt.Errorf("a resposta parou antes do fim (stop_reason %s)", resp.StopReason)
	}
	c.messages = append(c.messages, resp.ToParam())
	// A resposta pode ter blocos de raciocínio antes do texto: só o texto é o JSON.
	var text strings.Builder
	for _, block := range resp.Content {
		if block.Type == "text" {
			text.WriteString(block.Text)
		}
	}
	var out modelOutput
	if err := json.Unmarshal([]byte(text.String()), &out); err != nil {
		return modelOutput{}, fmt.Errorf("resposta fora do formato JSON: %w", err)
	}
	return out, nil
}

// outputSchema é o esquema JSON da resposta. primary_biome é um enum com os
// biomas da ave: o modelo não consegue escolher um bioma fora da lista.
// additionalProperties: false (nenhum campo além dos listados) é exigido
// pela saída estruturada.
func outputSchema(biomes []string) map[string]any {
	str := func(desc string) map[string]any { return map[string]any{"type": "string", "description": desc} }
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"description": str("De 2 a 4 frases, cada uma com até 15 palavras."),
			"facts": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"text":        str("Uma frase com até 15 palavras."),
						"source_fact": map[string]any{"type": "integer", "description": "O número do fato adulto de origem."},
					},
					"required":             []string{"text", "source_fact"},
					"additionalProperties": false,
				},
			},
			"did_you_know":  str("Uma frase com até 15 palavras."),
			"primary_biome": map[string]any{"type": "string", "enum": biomes},
			"biome_reason":  str("Uma frase explicando a escolha do bioma, para quem revisa."),
		},
		"required":             []string{"description", "facts", "did_you_know", "primary_biome", "biome_reason"},
		"additionalProperties": false,
	}
}
```

O SDK usado aqui é o da v1.84.0: `anthropic.NewClient`, `Messages.New` com `MessageNewParams` (`OutputConfig` com `Effort` e `Format: JSONOutputFormatParam{Schema}`), `StopReasonEndTurn` e `Message.ToParam()`. O SDK não tem constante para o `claude-opus-5-5`, por isso `anthropic.Model(modelID)`. A saída estruturada substitui a ferramenta forçada da primeira versão da spec: o `claude-opus-5-5` recusa `tool_choice` forçado, e o raciocínio dele conta no `max_tokens` (por isso 16000 e o `stop_reason` conferido).

- [ ] **Step 5: O programa**

Troque `cmd/kidsgen/main.go` inteiro por:

`cmd/kidsgen/main.go`:

```go
// cmd/kidsgen gera o conteúdo Kids (frente B): para cada espécie escolhida,
// pede ao modelo um texto para crianças a partir do texto adulto curado,
// confere com o validador do conteúdo e grava o bloco kids: e a linha
// primary_biome: no YAML. Roda à mão, na máquina de quem cuida do conteúdo,
// com a ANTHROPIC_API_KEY dela; a CI nunca chama a API. O resultado é
// revisado por uma pessoa no PR (ADR-0022).
//
// Uso:
//
//	ANTHROPIC_API_KEY=... go run ./cmd/kidsgen --missing
//	ANTHROPIC_API_KEY=... go run ./cmd/kidsgen --ids turdus-rufiventris,crotophaga-ani
//	go run ./cmd/kidsgen --ids turdus-rufiventris --dry-run
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"path/filepath"
	"strings"

	"github.com/velosobr/passarim-catalog/internal/adapter/curated"
	"github.com/velosobr/passarim-catalog/internal/domain"
	"github.com/velosobr/passarim-catalog/internal/kidscontent"
)

// starter abre uma conversa com o modelo para uma espécie. Em produção é
// newAnthropicConversation; nos testes, um falso.
type starter func(apiKey string, s domain.Species) conversation

func main() {
	// NotifyContext cancela o contexto no Ctrl+C: a chamada em andamento é
	// interrompida e nada pela metade é gravado.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	if err := run(ctx, os.Args[1:], os.Getenv("ANTHROPIC_API_KEY"), os.Stdout, newAnthropicConversation); err != nil {
		fmt.Fprintln(os.Stderr, "kidsgen:", err)
		os.Exit(1)
	}
}

// run é o programa inteiro, com as dependências recebidas por parâmetro
// para os testes: os argumentos, a chave, onde escrever e como abrir a
// conversa com o modelo.
func run(ctx context.Context, args []string, apiKey string, out io.Writer, start starter) error {
	fs := flag.NewFlagSet("kidsgen", flag.ContinueOnError)
	fs.SetOutput(out)
	dir := fs.String("dir", "content/species", "pasta dos YAMLs das espécies")
	missing := fs.Bool("missing", false, "gera para as espécies sem bloco kids: ou com o texto adulto mudado")
	ids := fs.String("ids", "", "ids das espécies, separados por vírgula")
	dryRun := fs.Bool("dry-run", false, "não grava; sem a chave, só mostra o prompt")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *missing == (*ids != "") {
		return errors.New("use --missing ou --ids (um dos dois)")
	}
	if apiKey == "" && !*dryRun {
		return errors.New("ANTHROPIC_API_KEY não definida (só o --dry-run roda sem ela)")
	}

	species, err := curated.LoadDir(*dir)
	if err != nil {
		return err
	}
	selected, err := selectSpecies(species, *missing, *ids)
	if err != nil {
		return err
	}
	if apiKey == "" {
		_, _ = fmt.Fprintf(out, "== prompt do sistema ==\n%s\n", systemPrompt)
	}

	var failed []string
	for _, s := range selected {
		// Sem texto adulto, nenhuma saída passaria no validador: pular antes
		// de chamar a API evita pagar 3 chamadas sem chance de dar certo.
		if strings.TrimSpace(s.Description) == "" || len(s.Facts) == 0 {
			_, _ = fmt.Fprintf(out, "%s: pulada, sem texto adulto curado\n", s.ID)
			continue
		}
		if apiKey == "" {
			_, _ = fmt.Fprintf(out, "== %s ==\n%s\n", s.ID, userMessage(s))
			continue
		}
		res, err := generate(ctx, start(apiKey, s), s)
		if err != nil {
			_, _ = fmt.Fprintf(out, "%s: FALHOU: %v\n", s.ID, err)
			failed = append(failed, s.ID)
			continue
		}
		// Esta linha vai para a descrição do PR de conteúdo, para a revisão do bioma.
		_, _ = fmt.Fprintf(out, "%s → primary_biome: %s (%s)\n", s.ID, res.species.PrimaryBiome, res.reason)
		if *dryRun {
			_, _ = fmt.Fprint(out, kidsBlock(*res.species.Kids))
			continue
		}
		if err := writeKids(filepath.Join(*dir, s.ID+".yaml"), res.species); err != nil {
			return err
		}
	}
	if len(failed) > 0 {
		return fmt.Errorf("%d espécie(s) puladas: %s", len(failed), strings.Join(failed, ", "))
	}
	return nil
}

// selectSpecies escolhe as espécies da rodada. Com --missing, as que não têm
// bloco kids: ou cujo carimbo do texto adulto mudou. Com --ids, as pedidas;
// um id que não existe é erro, para um erro de digitação não passar calado.
func selectSpecies(all []domain.Species, missing bool, ids string) ([]domain.Species, error) {
	if missing {
		var out []domain.Species
		for _, s := range all {
			if s.Kids == nil || s.Kids.SourceHash != kidscontent.SourceHash(s) {
				out = append(out, s)
			}
		}
		return out, nil
	}
	byID := map[string]domain.Species{}
	for _, s := range all {
		byID[s.ID] = s
	}
	var out []domain.Species
	for _, id := range strings.Split(ids, ",") {
		s, ok := byID[strings.TrimSpace(id)]
		if !ok {
			return nil, fmt.Errorf("espécie %q não existe", strings.TrimSpace(id))
		}
		out = append(out, s)
	}
	return out, nil
}

// writeKids grava o resultado no YAML da espécie, por edição de texto.
func writeKids(path string, s domain.Species) error {
	src, err := os.ReadFile(path) //nolint:gosec // G304: o caminho é a pasta do conteúdo + o id de uma espécie já carregada
	if err != nil {
		return err
	}
	edited, err := applyKids(src, s.PrimaryBiome, *s.Kids)
	if err != nil {
		return fmt.Errorf("%s: %w", filepath.Base(path), err)
	}
	// 0o600 só vale para arquivo novo; um YAML que já existe mantém as
	// permissões que tinha.
	return os.WriteFile(path, edited, 0o600) //nolint:gosec // G703: o mesmo caminho lido acima
}
```

- [ ] **Step 6: Rodar a suíte, o lint e o govulncheck**

Run: `go build ./... && go test -race ./... 2>&1 | tail -30 && make lint && go run golang.org/x/vuln/cmd/govulncheck@v1.8.0 ./...`
Expected: PASS, `0 issues` e `No vulnerabilities found` (o SDK traz módulos com avisos que o código não chama; o govulncheck só reprova o que é chamado).

- [ ] **Step 7: Conferir o prompt de verdade, sem gastar**

Run: `go run ./cmd/kidsgen --ids turdus-rufiventris --dry-run | head -40`
Expected: o prompt do sistema e a mensagem do sabiá, sem `https://`, sem UFs e sem o nome científico.

- [ ] **Step 8: Commit, push e PR 5**

```bash
git add -A
git commit -m "feat: cmd/kidsgen gera o conteúdo Kids com o claude-opus-5-5"
git push -u origin feat/kidsgen
gh pr create --base main --title "Frente B: validador do conteúdo Kids, lint e cmd/kidsgen" \
  --body "Validador do bloco kids: (internal/kidscontent: frases, palavras, números por extenso com golden file, palavras proibidas e source_hash), lint em content_test.go e o cmd/kidsgen (SDK oficial v1.84.0, saída estruturada, até 2 novas tentativas com os erros do validador, gravação por edição de texto). A CI nunca chama a API. Spec: seções 3 e 9. Plano B2, Tasks 1 a 6."
```

---

### Task 7: Conteúdo Kids das espécies do MVP (PR 6, ponto de parada)

**Files:**
- Modify: `content/species/*.yaml` (linha `primary_biome:` e bloco `kids:`)

- [ ] **Step 1: PARAR e avisar o dono**

O PR 5 precisa estar mergeado, e a geração usa a chave do dono, que nunca sai da máquina dele. Mande ao dono:

> O kidsgen está na `main`. Para gerar o conteúdo Kids, rode no seu terminal, na pasta do catalog:
>
> ```bash
> git switch main && git pull --ff-only && git switch -c feat/conteudo-kids
> ANTHROPIC_API_KEY=<sua chave> go run ./cmd/kidsgen --missing | tee /tmp/kidsgen.txt
> ```
>
> Custa cerca de US$ 1,50 para as 41 espécies. Me avise quando terminar; eu confiro o lint e abro o PR com o resumo dos biomas.

Espere o dono avisar.

- [ ] **Step 2: Conferir e abrir o PR 6**

```bash
cd ~/dev/passarim/passarim-catalog && git switch feat/conteudo-kids
go test ./content/ ./internal/adapter/curated/
grep -c '^kids:' content/species/*.yaml | grep -c ':1$'
git diff --stat main
```

Expected: PASS; o número de espécies com bloco igual ao de espécies com texto adulto; só YAMLs no diff. Se o kidsgen listou espécies puladas, rode de novo só para elas (`--ids`) antes do PR.

```bash
git add content/species
git commit -m "content: conteúdo Kids e bioma principal das espécies do MVP"
git push -u origin feat/conteudo-kids
gh pr create --base main --title "Conteúdo Kids e bioma principal das espécies do MVP" --body-file <(printf 'Gerado pelo cmd/kidsgen (claude-opus-5-5) e validado pelo lint. **Revisão do dono, espécie por espécie:** tom, temas sensíveis (spec, seção 3.4) e o bioma principal.\n\nBiomas escolhidos (id → bioma (justificativa)):\n\n```\n%s\n```\n' "$(grep '→ primary_biome' /tmp/kidsgen.txt)")
```

Expected: o PR aberto com a lista dos biomas. É o item 1 do "Pronto quando" da spec, que só fecha com a revisão do dono.
