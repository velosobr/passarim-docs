# Frente 0: comentários didáticos, plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** comentar de forma didática todo o código escrito à mão do `passarim-bff`, do `passarim-catalog` e do `passarim-app`, sem mudar nenhuma linha de código.

**Architecture:** cada repositório ganha um script, `scripts/check-comment-only.sh`, que reprova qualquer linha alterada que não seja comentário ou linha em branco, e um job de CI que o roda nas branches `docs/comentarios-*`. Depois o código é comentado pacote a pacote, com um commit por pacote. Antes de cada PR, um agente revisor independente confere se os comentários dizem a verdade.

**Tech Stack:** bash, git, Go 1.27 (gofmt, golangci-lint v2), Kotlin/Gradle (ktlint, detekt), GitHub Actions.

**Spec:** `passarim-docs/docs/superpowers/specs/2026-10-16-passarim-frente-0-comentarios-design.md`

## Global Constraints

- **Regra da frente:** nenhuma linha de código muda. Podem mudar:
  - linhas de comentário;
  - linhas em branco;
  - `.golangci.yml`, `config/detekt.yml` e `.editorconfig`, só com a configuração de lint que os comentários exigirem;
  - o próprio script e o teste dele;
  - o workflow da CI;
  - o `README.md`.
- **Comentário novo sempre na própria linha,** nunca no fim de uma linha de código. Os comentários de fim de linha que já existem ficam intactos, mesmo quando imprecisos; o que estiver errado vai para o `BACKLOG.md` do `passarim-docs`.
- **Diretivas não são comentário e não mudam:** `//go:build`, `//go:generate`, `//go:embed`, `//nolint`, `#!` (shebang), `# syntax=` (Dockerfile) e `-- name:` (sqlc).
- **Português claro, como para um dev iniciante.** O modelo de tom é `passarim-proto/proto/passarim/catalog/v1/catalog.proto`. Identificadores continuam em inglês.
- **Cada arquivo leva:**
  1. um cabeçalho com o papel dele: camada, quem usa, de quem depende;
  2. um comentário em toda declaração, pública ou privada, de uma linha nas triviais;
  3. um comentário antes de cada bloco não óbvio;
  4. a explicação dos conceitos na primeira vez que aparecem **no arquivo**: da linguagem, da biblioteca e do domínio;
  5. as decisões ("porque..."), citando a ADR pelo número quando houver.
- **O comentário explica o código que está ali.** Não conta a história do plano nem da conversa.
- **Go:**
  - `// Package x ...` em um arquivo só por pacote. Se algum arquivo já tem, fica nele; se não, vai no arquivo de mesmo nome do pacote ou no principal.
  - Nos outros arquivos, o cabeçalho fica separado de `package` por uma linha em branco.
  - O godoc começa pelo nome do identificador.
- **Kotlin e `.kts`:** `//` no topo, antes de `package`, e KDoc `/** */` nas declarações.
- **SQL:** `--`, sem tocar no `-- name:`.
- **XML:** cada linha de comentário é um `<!-- ... -->` completo.
- **YAML, Dockerfile, Makefile e shell:** `#`.
- **No `openapi.yaml`:** só comentários `#`. Os `description` não mudam.
- **Fora do escopo:**
  - código gerado: `gen/`, `build/` e `internal/adapter/postgres/sqlcgen/`;
  - os YAML de `content/species/`, JSON, `testdata/`, golden files, snapshots e imagens;
  - `go.mod`, `go.sum`, lockfiles, `strings.xml` e fontes.
- **Commits:** `docs: <mensagem>` em português, com o autor `velosobr <linoc.veloso@gmail.com>` e terminando com:

  ```text
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01A4dm2HSX3XY8J2vbDMdJVb
  ```

- **PR:** o corpo termina com `🤖 Generated with [Claude Code](https://claude.com/claude-code)` e o link da sessão. O merge é do dono.
- **Bug ou nome ruim achado na leitura:** não corrigir. Anotar no `passarim-docs/BACKLOG.md`, com o repositório, o arquivo e a linha, num commit separado no `passarim-docs`.

## Review Focus

1. **Linha de comentário SQL removida:** no `git diff`, uma linha `-- texto` removida aparece como `--- texto`, igual ao cabeçalho do diff. O script não pode tratá-la como cabeçalho. Teste no Task 1.
2. **Diretiva Go alterada:** um `//go:build` ou `//nolint` alterado muda o comportamento e precisa reprovar. Teste no Task 1.
3. **Arquivo novo de código ou apagado:** todas as linhas dele são código e precisam reprovar. Teste no Task 1.
4. **Comentário que mente:** a explicação contradiz o código, por exemplo um TTL errado ou uma ordem de decorators trocada. É coberto pela revisão independente no último task de cada repositório, com a ordem de ler o código e não só o diff.
5. **`gofmt` mexendo no alinhamento:** comentários novos em structs e blocos `const` podem fazer o `gofmt` realinhar os campos, e isso é linha de código mudando. Rodar `gofmt -l` depois de cada pacote; se ele quiser realinhar, o comentário vai para a linha de cima do bloco.

---

## Parte 1: passarim-bff (PR `docs/comentarios-bff`)

Preparação, uma vez:

```bash
cd /Users/gzv8738/dev/passarim/passarim-bff
git switch main && git pull --ff-only
git switch -c docs/comentarios-bff
```

### Task 1: script de verificação "só comentários"

**Files:**
- Create: `scripts/check-comment-only.sh`
- Create: `scripts/check-comment-only_test.sh`
- Modify: `.github/workflows/ci.yml` (job novo `comentarios`)

**Interfaces:**
- Produces: `bash scripts/check-comment-only.sh [base]`, onde `base` é a referência comparada (padrão `origin/main`). Sai com 0 se só mudaram comentários, linhas em branco ou arquivos liberados. Sai com 1 e imprime `arquivo: linha` de cada violação. Os Tasks 2 a 10 e as Partes 2 e 3 usam este comando.

- [ ] **Step 1: escrever o teste**

`scripts/check-comment-only_test.sh`:

```bash
#!/usr/bin/env bash
# Teste do check-comment-only.sh.
#
# Como funciona: para cada caso, criamos um repositório git descartável numa
# pasta temporária, fazemos um commit "base" com um arquivo, aplicamos uma
# mudança num segundo commit e rodamos o script comparando os dois. Cada caso
# diz se o script deve aprovar (0) ou reprovar (1).
#
# Rodar: bash scripts/check-comment-only_test.sh

# -e para no primeiro erro inesperado; -u reclama de variável não definida;
# -o pipefail faz um pipe falhar se qualquer comando dele falhar.
set -euo pipefail

# Caminho absoluto do script testado, calculado a partir deste arquivo, para o
# teste funcionar de qualquer pasta.
SCRIPT="$(cd "$(dirname "$0")" && pwd)/check-comment-only.sh"
falhas=0

# caso <nome> <arquivo> <conteúdo antes> <conteúdo depois> <saída esperada>
# Monta o repositório temporário, roda o script e compara a saída esperada.
caso() {
  local nome="$1" arquivo="$2" antes="$3" depois="$4" esperado="$5"
  local dir
  dir="$(mktemp -d)"
  (
    cd "$dir"
    git init -q -b main
    git config user.email teste@exemplo.com
    git config user.name teste
    mkdir -p "$(dirname "$arquivo")"
    # Conteúdo vazio no "antes" quer dizer que o arquivo ainda não existe.
    if [[ -n "$antes" ]]; then printf '%s\n' "$antes" >"$arquivo"; else : >.vazio; fi
    git add -A && git commit -q -m base
    git branch base
    # Conteúdo vazio no "depois" quer dizer que o arquivo foi apagado.
    if [[ -n "$depois" ]]; then printf '%s\n' "$depois" >"$arquivo"; else rm -f "$arquivo"; fi
    git add -A && git commit -q -m mudanca
  )
  local obtido=0
  (cd "$dir" && bash "$SCRIPT" base >/dev/null 2>&1) || obtido=$?
  if [[ "$obtido" == "$esperado" ]]; then
    echo "ok    $nome"
  else
    echo "FALHA $nome: esperado $esperado, obtido $obtido"
    falhas=$((falhas + 1))
  fi
  rm -rf "$dir"
}

caso "go: comentário novo"            a/x.go  $'package a\n\nfunc F() {}' $'package a\n\n// F faz algo.\nfunc F() {}' 0
caso "go: bloco /* */ novo"           a/x.go  $'package a' $'/*\n * Cabeçalho.\n */\npackage a' 0
caso "go: linha em branco nova"       a/x.go  $'package a\nfunc F() {}' $'package a\n\nfunc F() {}' 0
caso "go: código alterado"            a/x.go  $'package a\n\nfunc F() {}' $'package a\n\nfunc G() {}' 1
caso "go: comentário no fim da linha" a/x.go  $'package a\n\nfunc F() {}' $'package a\n\nfunc F() {} // F' 1
caso "go: diretiva go:build"          a/x.go  $'//go:build linux\n\npackage a' $'//go:build darwin\n\npackage a' 1
caso "go: diretiva nolint"            a/x.go  $'package a\n\n//nolint:gosec\nvar x = 1' $'package a\n\n//nolint:errcheck\nvar x = 1' 1
caso "sql: comentário removido"       q.sql   $'-- antigo\nSELECT 1;' $'SELECT 1;' 0
caso "sql: comentário trocado"        q.sql   $'-- antigo\nSELECT 1;' $'-- novo\nSELECT 1;' 0
caso "sql: name do sqlc alterado"     q.sql   $'-- name: A :one\nSELECT 1;' $'-- name: B :one\nSELECT 1;' 1
caso "yaml: comentário novo"          ci.yml  $'a: 1' $'# explica a\na: 1' 0
caso "yaml: valor alterado"           api.yaml $'a: 1' $'a: 2' 1
caso "sh: shebang alterado"           s.sh    $'#!/bin/sh\necho' $'#!/bin/bash\necho' 1
caso "dockerfile: comentário"         Dockerfile $'FROM x' $'# imagem base\nFROM x' 0
caso "dockerfile: diretiva syntax"    Dockerfile $'FROM x' $'# syntax=docker/dockerfile:1\nFROM x' 1
caso "makefile: comentário"           Makefile $'t:\n\tgo test' $'# testes\nt:\n\tgo test' 0
caso "kotlin: kdoc novo"              A.kt    $'package a\n\nclass A' $'package a\n\n/** Um A. */\nclass A' 0
caso "xml: comentário de uma linha"   m.xml   $'<a/>' $'<!-- raiz -->\n<a/>' 0
caso "arquivo novo de código"         n.go    '' $'package n' 1
caso "arquivo de código apagado"      d.go    $'package d' '' 1
caso "arquivo liberado (README)"      README.md $'# x' $'# x\n\nTexto novo.' 0
caso "extensão desconhecida"          x.json  $'{}' $'{"a":1}' 1

if [[ "$falhas" -gt 0 ]]; then
  echo "$falhas caso(s) falharam"
  exit 1
fi
echo "todos os casos passaram"
```

- [ ] **Step 2: rodar o teste e ver falhar**

Run: `bash scripts/check-comment-only_test.sh`
Expected: `FALHA` em todos os casos, porque o script ainda não existe e o `bash` sai com 127.

- [ ] **Step 3: escrever o script**

`scripts/check-comment-only.sh`:

```bash
#!/usr/bin/env bash
# Verifica que uma branch só mudou COMENTÁRIOS (e linhas em branco) em relação
# a uma base. É a garantia da frente 0 do Passarim: comentar o código para
# estudo sem alterar nenhuma linha de código.
#
# Uso: bash scripts/check-comment-only.sh [base]   (base padrão: origin/main)
# Sai com 0 quando está tudo certo; com 1 quando alguma linha alterada é código,
# e imprime "arquivo: linha" de cada violação.
#
# A decisão é por linha do "git diff": cada linha adicionada (+) ou removida (-)
# precisa ser vazia ou um comentário na sintaxe da linguagem do arquivo.

# -e para no primeiro erro inesperado; -u reclama de variável não definida;
# -o pipefail faz um pipe falhar se qualquer comando dele falhar.
set -euo pipefail

base="${1:-origin/main}"

# Arquivos que podem mudar livremente nesta frente: a configuração de lint que
# os comentários exigirem, o próprio verificador, a CI que o chama e o README.
liberados='^(\.golangci\.yml|config/detekt\.yml|\.editorconfig|README\.md|scripts/check-comment-only(_test)?\.sh|\.github/workflows/ci\.yml)$'

# estilo_do_arquivo <caminho>: escreve qual sintaxe de comentário o arquivo usa.
# Retorna erro para extensões que esta frente não deveria tocar (por exemplo,
# JSON, que nem tem comentário).
estilo_do_arquivo() {
  case "$(basename "$1")" in
    *.go | *.kt | *.kts | *.swift | *.xcconfig) echo barra ;;
    *.sql) echo sql ;;
    *.yml | *.yaml | *.sh | *.properties | Dockerfile* | Makefile | .gitignore | .dockerignore) echo cerquilha ;;
    *.xml) echo xml ;;
    *) return 1 ;;
  esac
}

# eh_comentario <estilo> <linha>: sucesso (0) se a linha é vazia ou só comentário.
eh_comentario() {
  local estilo="$1" t="$2"
  # Remove os espaços do começo e do fim, para olhar só o conteúdo.
  t="${t#"${t%%[![:space:]]*}"}"
  t="${t%"${t##*[![:space:]]}"}"
  [[ -z "$t" ]] && return 0
  case "$estilo" in
    barra)
      # Diretivas do Go parecem comentário, mas mudam o build ou o lint.
      [[ "$t" == "//go:"* || "$t" == "//nolint"* ]] && return 1
      [[ "$t" == "//"* || "$t" == "/*"* || "$t" == "*"* ]] && return 0
      ;;
    sql)
      # "-- name: X :one" é a marcação que o sqlc usa para gerar código.
      [[ "$t" == "-- name:"* ]] && return 1
      [[ "$t" == "--"* ]] && return 0
      ;;
    cerquilha)
      # "#!" escolhe o interpretador e "# syntax=" muda o parser do Dockerfile.
      [[ "$t" == "#!"* || "$t" == "# syntax="* ]] && return 1
      [[ "$t" == "#"* ]] && return 0
      ;;
    xml)
      [[ "$t" == "<!--"*"-->" ]] && return 0
      ;;
  esac
  return 1
}

violacoes=0

# Para cada arquivo que mudou entre a base e o HEAD...
while IFS= read -r arquivo; do
  [[ "$arquivo" =~ $liberados ]] && continue
  if ! estilo="$(estilo_do_arquivo "$arquivo")"; then
    echo "$arquivo: tipo de arquivo que esta frente não pode alterar"
    violacoes=$((violacoes + 1))
    continue
  fi
  # ...olhamos só as linhas + e - DEPOIS do primeiro "@@". Antes dele ficam os
  # cabeçalhos "--- a/x" e "+++ b/x"; filtrar por "@@" (e não por "---") evita
  # confundir um comentário SQL removido ("-- x" vira "--- x") com cabeçalho.
  while IFS= read -r linha; do
    if ! eh_comentario "$estilo" "${linha:1}"; then
      echo "$arquivo: $linha"
      violacoes=$((violacoes + 1))
    fi
  done < <(git diff -U0 --no-color "$base"...HEAD -- "$arquivo" | awk '/^@@/ { hunk = 1; next } hunk && /^[+-]/')
done < <(git diff --name-only "$base"...HEAD)

if [[ "$violacoes" -gt 0 ]]; then
  echo "$violacoes linha(s) de código alteradas: esta branch só pode mudar comentários"
  exit 1
fi
echo "ok: só comentários e linhas em branco mudaram"
```

- [ ] **Step 4: rodar o teste e ver passar**

Run: `bash scripts/check-comment-only_test.sh`
Expected: `ok` nos 22 casos e `todos os casos passaram`.

- [ ] **Step 5: job na CI**

Acrescentar ao fim de `.github/workflows/ci.yml`, no mesmo nível de `security:`:

```yaml
  # Frente 0 do Passarim: nas branches que só comentam o código, garante que
  # nenhuma linha de código mudou (scripts/check-comment-only.sh).
  comentarios:
    if: github.event_name == 'pull_request' && startsWith(github.head_ref, 'docs/comentarios-')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          # O histórico inteiro é necessário para comparar com a base do PR.
          fetch-depth: 0
      - run: bash scripts/check-comment-only_test.sh
      - run: bash scripts/check-comment-only.sh origin/${{ github.base_ref }}
```

- [ ] **Step 6: conferir e fazer o commit**

Run: `bash scripts/check-comment-only.sh main`
Expected: `ok`, porque os três arquivos estão liberados.

```bash
git add scripts/ .github/workflows/ci.yml
git commit -m "docs: verificador de que a branch só muda comentários (frente 0)"
```

### Procedimento de cada pacote (Tasks 2 a 9)

Cada task abaixo aplica este procedimento aos arquivos que lista. Os passos são repetidos em cada task.

1. **Ler:** cada arquivo inteiro e, quando citado no task, a spec ou a ADR relacionada. Os documentos ficam em `../passarim-docs/docs/superpowers/specs/2026-10-03-passarim-bff-design.md` e em `../passarim-docs/docs/adr/`.
2. **Escrever** os comentários conforme as Global Constraints.
3. **Rodar:**
   - `gofmt -l <pastas>`, que tem de voltar vazio;
   - `go vet ./...`;
   - `go test -race <pacotes>`;
   - `bash scripts/check-comment-only.sh main`, que tem de dar `ok`.
4. **Fazer o commit** do pacote.

Um exemplo do padrão, que o executor segue em todos os arquivos (`internal/domain`, trecho):

```go
// Package domain guarda os tipos e as regras puras do BFF: nada de JSON,
// gRPC, Redis ou HTTP aqui. É a camada mais interna da arquitetura limpa.
package domain

// ...

// ParseBiome converte o código que chega na URL (por exemplo, "cerrado") no
// tipo Biome. O segundo retorno diz se o código é conhecido: em Go, devolver
// (valor, ok) é o jeito comum de dizer "achei ou não achei" sem usar erro.
func ParseBiome(s string) (Biome, bool) {
```

E num arquivo de teste:

```go
// TestParseBiome confere que os seis biomas do Brasil são aceitos e que um
// código desconhecido é recusado. Se este teste quebra, a API passaria a
// aceitar filtros que o catalog não entende.
func TestParseBiome(t *testing.T) {
```

### Task 2: `cmd/bff` e `internal/config`

**Files:**
- Modify: `cmd/bff/*.go` (2), `internal/config/*.go` (2)

**Interfaces:**
- Consumes: `bash scripts/check-comment-only.sh main`, do Task 1.
- Produces: nada que outro task use.

- [ ] **Step 1:** ler os 4 arquivos e a seção de configuração da spec do BFF.
- [ ] **Step 2:** comentar.
  - **`main.go`:** a ordem de montagem da aplicação (configuração, telemetria, cliente gRPC, a cadeia de decorators e o servidor) e o desligamento gracioso (sinais, `context`).
  - **`config.go`:** cada variável de ambiente, com o valor padrão e para que serve.
- [ ] **Step 3:** rodar `gofmt -l cmd internal/config && go vet ./... && go test -race ./cmd/... ./internal/config/... && bash scripts/check-comment-only.sh main`. Esperado: tudo verde e `ok`.
- [ ] **Step 4:** `git add cmd internal/config && git commit -m "docs: comenta o ponto de entrada e a configuração do BFF"`

### Task 3: `internal/domain` e `internal/usecase`

**Files:**
- Modify: `internal/domain/*.go` (7), `internal/usecase/*.go` (5)

**Interfaces:**
- Consumes: `bash scripts/check-comment-only.sh main`, do Task 1.
- Produces: nada que outro task use.

- [ ] **Step 1:** ler os 12 arquivos e as seções de domínio e de casos de uso da spec do BFF.
- [ ] **Step 2:** comentar. Explicar:
  - a arquitetura limpa (dependências apontam para dentro);
  - a porta `CatalogReader` e por que ela é uma interface;
  - os tipos de erro (`Kind`) e como viram status HTTP;
  - o orçamento de 3 s do usecase;
  - nos testes, o `CatalogReader` falso.
- [ ] **Step 3:** rodar `gofmt -l internal/domain internal/usecase && go vet ./... && go test -race ./internal/domain/... ./internal/usecase/... && bash scripts/check-comment-only.sh main`. Esperado: verde e `ok`.
- [ ] **Step 4:** `git add internal/domain internal/usecase && git commit -m "docs: comenta o domínio e os casos de uso do BFF"`

### Task 4: `internal/adapter/grpcclient`, `media` e `reqmeta`

**Files:**
- Modify: `internal/adapter/grpcclient/*.go` (4), `internal/adapter/media/*.go` (2), `internal/adapter/reqmeta/*.go` (2)

**Interfaces:**
- Consumes: `bash scripts/check-comment-only.sh main`, do Task 1.
- Produces: nada que outro task use.

- [ ] **Step 1:** ler os 8 arquivos, o `../passarim-proto/proto/passarim/catalog/v1/catalog.proto` e a ADR-0003 (gRPC interno, REST externo).
- [ ] **Step 2:** comentar. Explicar:
  - o que é um cliente gRPC gerado;
  - o mapeamento de proto para domínio, campo a campo quando não for óbvio;
  - a tradução dos códigos gRPC em erros do domínio;
  - por que o catalog manda chaves e o BFF monta as URLs (ADR-0006);
  - o que o `reqmeta` carrega no `context`.
- [ ] **Step 3:** rodar `gofmt -l internal/adapter && go vet ./... && go test -race ./internal/adapter/grpcclient/... ./internal/adapter/media/... ./internal/adapter/reqmeta/... && bash scripts/check-comment-only.sh main`. Esperado: verde e `ok`.
- [ ] **Step 4:** `git add internal/adapter/grpcclient internal/adapter/media internal/adapter/reqmeta && git commit -m "docs: comenta o cliente gRPC, a montagem de URLs de mídia e os metadados da requisição"`

### Task 5: `internal/adapter/cache`

**Files:**
- Modify: `internal/adapter/cache/*.go` (8)

**Interfaces:**
- Consumes: `bash scripts/check-comment-only.sh main`, do Task 1.
- Produces: nada que outro task use.

- [ ] **Step 1:** ler os 8 arquivos, a ADR-0016 (cache com envelope e stale-while-error) e as seções 5.2 e 5.3 da spec do BFF.
- [ ] **Step 2:** comentar. Explicar:
  - o decorator;
  - fresco e velho (`FreshTTL` e `StaleTTL`);
  - o envelope;
  - o singleflight e o problema que ele evita (a "manada" de pedidos iguais);
  - as chaves com prefixo de versão;
  - os DTOs de cache e por que eles não são os DTOs HTTP;
  - nos testes, o Redis via testcontainers.

  Os comentários de fim de linha da struct `Config` ficam como estão.
- [ ] **Step 3:** rodar `gofmt -l internal/adapter/cache && go vet ./... && go test -race ./internal/adapter/cache/... && bash scripts/check-comment-only.sh main`. Esperado: verde e `ok`. Os testes de integração precisam do Docker rodando; sem ele, anotar e seguir, porque a CI roda.
- [ ] **Step 4:** `git add internal/adapter/cache && git commit -m "docs: comenta o cache Redis com stale-while-error"`

### Task 6: `internal/adapter/resilience`, `metrics` e `telemetry`

**Files:**
- Modify: `internal/adapter/resilience/*.go` (5), `internal/adapter/metrics/*.go` (3), `internal/adapter/telemetry/*.go` (2)

**Interfaces:**
- Consumes: `bash scripts/check-comment-only.sh main`, do Task 1.
- Produces: nada que outro task use.

- [ ] **Step 1:** ler os 10 arquivos e as seções de resiliência e de observabilidade da spec do BFF.
- [ ] **Step 2:** comentar. Explicar:
  - o circuit breaker e os estados dele (fechado, aberto e meio-aberto);
  - o retry com backoff exponencial e jitter;
  - o timeout por tentativa;
  - por que só alguns erros são repetidos;
  - os tipos de métrica do Prometheus (contador e histograma) e os rótulos;
  - o que é um trace do OpenTelemetry.
- [ ] **Step 3:** rodar `gofmt -l internal/adapter && go vet ./... && go test -race ./internal/adapter/resilience/... ./internal/adapter/metrics/... ./internal/adapter/telemetry/... && bash scripts/check-comment-only.sh main`. Esperado: verde e `ok`.
- [ ] **Step 4:** `git add internal/adapter/resilience internal/adapter/metrics internal/adapter/telemetry && git commit -m "docs: comenta circuit breaker, retry, métricas e traces"`

### Task 7: `internal/adapter/http` e `openapi.yaml`

**Files:**
- Modify: `internal/adapter/http/*.go` (9), `openapi.yaml` (só comentários `#`)

**Interfaces:**
- Consumes: `bash scripts/check-comment-only.sh main`, do Task 1.
- Produces: nada que outro task use.

- [ ] **Step 1:** ler os 9 arquivos e o `openapi.yaml`.
- [ ] **Step 2:** comentar. Explicar:
  - o roteamento do `net/http`;
  - cada handler e a validação de parâmetros;
  - os DTOs JSON e as tags `json:"..."`;
  - o formato de erro;
  - o teste de contrato contra o `openapi.yaml`.

  No `openapi.yaml`, um comentário `#` antes de cada caminho e de cada esquema diz quem o usa no app.
- [ ] **Step 3:** rodar `gofmt -l internal/adapter/http && go vet ./... && go test -race ./internal/adapter/http && bash scripts/check-comment-only.sh main`. Esperado: verde e `ok`.
- [ ] **Step 4:** `git add internal/adapter/http/*.go openapi.yaml && git commit -m "docs: comenta as rotas, os DTOs e o contrato OpenAPI do BFF"`

### Task 8: `internal/adapter/http/middleware`

**Files:**
- Modify: `internal/adapter/http/middleware/*.go` (12)

**Interfaces:**
- Consumes: `bash scripts/check-comment-only.sh main`, do Task 1.
- Produces: nada que outro task use.

- [ ] **Step 1:** ler os 12 arquivos, a ADR-0015 (rate limit em memória por réplica) e a ADR-0008.
- [ ] **Step 2:** comentar. Explicar:
  - o que é um middleware e a ordem em que eles se encadeiam;
  - o rate limit por IP (token bucket), o `X-Forwarded-For` atrás do Traefik e por que confiar só no proxy;
  - os cabeçalhos de segurança;
  - o recover de pânico;
  - o log de acesso;
  - o id de requisição.
- [ ] **Step 3:** rodar `gofmt -l internal/adapter/http/middleware && go vet ./... && go test -race ./internal/adapter/http/middleware/... && bash scripts/check-comment-only.sh main`. Esperado: verde e `ok`.
- [ ] **Step 4:** `git add internal/adapter/http/middleware && git commit -m "docs: comenta os middlewares HTTP do BFF"`

### Task 9: `internal/adapter/server`, `e2e`, `tools/swagger` e arquivos de build

**Files:**
- Modify:
  - `internal/adapter/server/*.go` (3), `e2e/e2e_test.go`, `tools/swagger/main.go`;
  - `Dockerfile`, `Makefile`, `.golangci.yml`, `.github/workflows/ci.yml`, `.gitignore`, `.dockerignore`.

**Interfaces:**
- Consumes: `bash scripts/check-comment-only.sh main`, do Task 1.
- Produces: nada que outro task use.

- [ ] **Step 1:** ler os arquivos.
- [ ] **Step 2:** comentar.
  - **`server`:** os timeouts do `http.Server` e o que cada um protege; o desligamento gracioso.
  - **`e2e`:** a build tag `e2e`, o que o teste sobe e como.
  - **`swagger`:** o que o gerador faz.
  - **`Dockerfile`:** cada estágio, a imagem final mínima e o usuário sem root.
  - **`Makefile` e CI:** completar o que faltar.
  - **`.gitignore` e `.dockerignore`:** por que cada entrada está lá.
- [ ] **Step 3:** rodar `gofmt -l . && go vet ./... && go test -race ./... && golangci-lint run && bash scripts/check-comment-only.sh main`. Esperado: verde e `ok`. Se o `misspell` acusar uma palavra portuguesa, acrescentar a palavra ao `ignore-rules` do `.golangci.yml` e rodar de novo.
- [ ] **Step 4:** `git add -A && git commit -m "docs: comenta o servidor, o e2e, o gerador do Swagger e os arquivos de build"`

### Task 10: README, revisão independente e PR

**Files:**
- Modify: `README.md` (seção "Por onde começar a ler")

**Interfaces:**
- Consumes: os commits dos Tasks 1 a 9.
- Produces: o PR `docs/comentarios-bff`.

- [ ] **Step 1: escrever a seção do README.** Ela vai logo depois de "Arquitetura":

```markdown
## Por onde começar a ler

O código é todo comentado para estudo. Uma ordem que conta a história de uma requisição, de fora para dentro:

1. `cmd/bff/main.go`: como a aplicação é montada e desligada.
2. `internal/domain`: os tipos e as regras, sem nenhuma tecnologia.
3. `internal/usecase`: a porta `CatalogReader` e o que cada caso de uso valida.
4. `internal/adapter/http` e `http/middleware`: as rotas `/v1`, os DTOs e a cadeia de middlewares.
5. `internal/adapter/cache`, `resilience` e `grpcclient`: os decorators em volta da chamada ao catalog, na ordem em que a requisição passa por eles.
6. `internal/adapter/media`, `metrics`, `telemetry`, `reqmeta` e `server`: as peças de apoio.
7. Os `*_test.go` de cada pacote mostram o comportamento esperado em exemplos.
```

- [ ] **Step 2: verificação completa.** Rodar `gofmt -l . && go vet ./... && go test -race ./... && golangci-lint run && bash scripts/check-comment-only_test.sh && bash scripts/check-comment-only.sh main`. Esperado: tudo verde. Se os testes do cache precisarem de Docker e ele estiver parado, anotar e seguir, porque a CI roda.
- [ ] **Step 3: cobertura.** Rodar:

  ```bash
  for f in $(git ls-files '*.go'); do head -1 "$f" | grep -q '^//' || echo "sem cabeçalho: $f"; done
  ```

  Esperado: nenhuma saída.
- [ ] **Step 4: revisão independente.** Disparar um agente revisor (Opus) com o prompt: "Leia `git diff main...docs/comentarios-bff` no `passarim-bff` e, para cada comentário, confira contra o CÓDIGO (não só o diff) se ele é verdadeiro e preciso, inclusive valores (TTLs, limites, ordens). Aponte também declarações sem comentário e conceitos usados sem explicação. Não edite nada. Liste os achados com arquivo:linha e a correção." Corrigir os achados, rodar o Step 2 de novo e fazer o commit com `docs: corrige comentários apontados na revisão`.
- [ ] **Step 5: commit do README, push e PR.**

  ```bash
  git add README.md && git commit -m "docs: roteiro de leitura do código no README"
  git push -u origin docs/comentarios-bff
  gh pr create --base main --title "docs: comentários didáticos em todo o código do BFF (frente 0)" --body "<resumo + como verificar + rodapé>"
  ```

  O corpo do PR diz o que foi comentado e como conferir que só mudaram comentários (o job `comentarios` da CI e o comando local). Ele termina com o rodapé das Global Constraints.
- [ ] **Step 6: CI.** Acompanhar com `gh pr checks --watch`. Se o `govulncheck` reprovar por vulnerabilidade que já existia na `main` (Go e `x/net`), **não corrigir aqui**: avisar o dono e propor um PR separado de atualização de dependências.

---

## Parte 2: passarim-catalog (PR `docs/comentarios-catalog`)

A preparação é igual à da Parte 1, com a branch `docs/comentarios-catalog`.

### Task 11: script de verificação no catalog

**Files:**
- Create: `scripts/check-comment-only.sh` e `scripts/check-comment-only_test.sh`, com o conteúdo idêntico ao do Task 1. Copiar do `passarim-bff`, já testado.
- Modify: `.github/workflows/ci.yml`, com o job `comentarios` idêntico ao do Task 1, Step 5.

**Interfaces:**
- Produces: `bash scripts/check-comment-only.sh [base]` no catalog.

- [ ] **Step 1:** `cp ../passarim-bff/scripts/check-comment-only*.sh scripts/`
- [ ] **Step 2:** rodar `bash scripts/check-comment-only_test.sh`. Esperado: `todos os casos passaram`.
- [ ] **Step 3:** acrescentar o job `comentarios` ao `ci.yml`, como no Task 1, Step 5.
- [ ] **Step 4:** `git add scripts .github/workflows/ci.yml && git commit -m "docs: verificador de que a branch só muda comentários (frente 0)"`

### Tasks 12 a 18: pacotes do catalog

Mesmo procedimento da Parte 1:
1. ler;
2. comentar;
3. rodar `gofmt -l <pastas> && go vet ./... && go test -race <pacotes> && bash scripts/check-comment-only.sh main`;
4. fazer o commit `docs: comenta <grupo>`.

As referências estão em `../passarim-docs/docs/superpowers/specs/2026-10-01-passarim-design.md` e nas ADRs 0004, 0005, 0006, 0007, 0012, 0013 e 0014.

| Task | Arquivos | O que explicar além do padrão |
|---|---|---|
| 12 | `cmd/catalog-api`, `cmd/seed`, `cmd/worker`, `internal/config` | Os três binários e por que são separados; a pré-ingestão (ADR-0005); cada variável de ambiente |
| 13 | `internal/domain` (9) | Espécie, mídia com variantes (ADR-0013), licenças aceitas (ADR-0007) e status IUCN |
| 14 | `internal/usecase` (10) | Os casos de uso da API e a paginação por cursor opaco |
| 15 | `internal/usecase/ingest` (12) | A fila de jobs, o backoff, o `RefreshAfter`, a conversão de fotos e de áudio (ffmpeg, ADR-0014) e a ordem das fotos |
| 16 | `internal/adapter/postgres` (9 `.go`), `migrations` (6 `.sql`), as consultas `.sql` e `sqlc.yaml` | O sqlc (SQL escrito à mão que vira Go), cada migração e cada consulta; o banco pertence ao catalog (ADR-0004). O `-- name:` não muda. |
| 17 | `internal/adapter/grpc` (5), `curated` (2), `media` (2), `s3store` (2), `safehttp` (2) | O servidor gRPC e a tradução de erros; o carregador do YAML curado; o SeaweedFS (ADR-0012); o SSRF e como o `safehttp` o evita |
| 18 | `internal/adapter/sources/gbif`, `inaturalist` e `xenocanto` (7), `content/*.go` (1), `Dockerfile`, `Dockerfile.worker`, `Makefile`, `.golangci.yml`, `ci.yml`, `.gitignore`, `.dockerignore` | Cada API externa: os parâmetros e as licenças filtradas; o teste do conteúdo; os estágios das imagens |

Cada um desses tasks segue os Steps 1 a 4 do procedimento, com os arquivos da linha correspondente.

### Task 19: README, revisão independente e PR do catalog

Mesmos Steps do Task 10, trocando `bff` por `catalog`. A seção "Por onde começar a ler" segue esta ordem:
1. `cmd/catalog-api/main.go`;
2. `internal/domain`;
3. `internal/usecase`;
4. `internal/adapter/grpc`;
5. `internal/adapter/postgres` (com as migrações);
6. `cmd/worker` e `internal/usecase/ingest`;
7. `internal/adapter/sources`;
8. `cmd/seed` e `internal/adapter/curated`;
9. os testes.

---

## Parte 3: passarim-app (três PRs)

**Pré-requisito:** o app #9 mergeado. Se ainda estiver aberto, as três branches saem de `feat/5d-favoritos-configuracoes`, e o script compara com ela (`bash scripts/check-comment-only.sh origin/feat/5d-favoritos-configuracoes`). Depois do merge, faz-se o rebase sobre a `main`.

**Verificação de cada task do app:**

- `scratchpad/gw.sh ktlintCheck detekt <módulos>:allTests`;
- `bash scripts/check-comment-only.sh main`;
- no fim de cada PR, `verifyPaparazzi`.

Os snapshots não podem mudar.

### Task 20: script de verificação no app (branch `docs/comentarios-app-core`)

Mesmos Steps do Task 11 (copiar os dois scripts e acrescentar o job `comentarios` ao workflow principal da CI do app). O padrão de `liberados` já cobre `config/detekt.yml` e `.editorconfig`.

### Tasks 21 a 25: PR `docs/comentarios-app-core`

| Task | Módulos | O que explicar além do padrão |
|---|---|---|
| 21 | `core:domain` | `Result` e erros; repositórios como interface; `expect`/`actual`; por que o domínio não tem `@Serializable` |
| 22 | `core:data`, `core:database` | Ktor e o `HttpClient`; DTO e mapper; Room KMP (ADR-0009), DAO, entidade, `jvm()` no domínio; o teste de migração |
| 23 | `core:presentation`, `core:design-system` | MVI (estado, intenção, evento); `ScreenError`; tema, tokens e cores dinâmicas; cada componente |
| 24 | `app` (DI com Koin, navegação, abas, tema e barras do sistema, Coil) | Por que a rota só liga as peças; `SystemBarsAppearance`; o carregador de imagens |
| 25 | `androidApp`, `iosApp` (Swift e `.xcconfig`), `build-logic`, `.kts` da raiz, `scripts/*.sh`, CI, `config/detekt.yml`, `.editorconfig` | Convention plugins; version catalog; export de licenças (ADR-0020); a ponte Swift/Kotlin |

Cada task: ler os arquivos e as specs da etapa 5 relacionadas; comentar; rodar a verificação do app; fazer o commit `docs: comenta <módulos>`. O fechamento é igual ao Task 10, com o README do app (seção "Por onde começar a ler": `app` → `core:domain` → `core:data` → features → `core:design-system`), a revisão independente e o PR.

### Tasks 26 e 27: PR `docs/comentarios-app-explore-detail`

Branch criada a partir da `docs/comentarios-app-core`, porque reutiliza o script.

| Task | Módulos | O que explicar além do padrão |
|---|---|---|
| 26 | `feature:explore:*` | Paginação infinita, debounce da busca, filtros e o `ExploreRoot` contra o `ExploreScreen` |
| 27 | `feature:detail:*` | O player de áudio por plataforma, o mapa MapLibre com clusters e a galeria |

O fechamento é igual ao Task 10, sem README.

### Tasks 28 e 29: PR `docs/comentarios-app-favorites-settings`

Branch criada a partir da `docs/comentarios-app-explore-detail`.

| Task | Módulos | O que explicar além do padrão |
|---|---|---|
| 28 | `feature:favorites:*` | Favoritos offline no Room e o fluxo reativo |
| 29 | `feature:settings:*`, `snapshots` | DataStore; limpeza de cache do Coil; Sobre e Licenças; Paparazzi (ADR-0010 e 0017) e a matriz de snapshots |

O fechamento é igual ao Task 10, sem README.
