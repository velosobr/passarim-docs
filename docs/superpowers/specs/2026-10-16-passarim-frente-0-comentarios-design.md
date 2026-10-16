# Passarim — Frente 0: comentários didáticos no código existente

Data: 2026-10-16 · Origem: PRD da guinada (`2026-10-16-passarim-guinada-prd.md`), frente 0 · Regra: `~/dev/passarim/CLAUDE.md` · Depende de: app #9 mergeado (só para os PRs do app)

Decisões do redator estão marcadas com **[DR]** e listadas no fim.

## 1. Objetivo

O dono estuda pelo código. Hoje só uma parte dos arquivos explica o que faz: o código da 5a, da 5c e da 5d foi escrito sem comentários, por uma regra lida ao contrário. Esta frente comenta **todo o código escrito à mão** do `passarim-bff`, do `passarim-catalog` e do `passarim-app`, como para um dev iniciante, **sem mudar nenhuma linha de código**.

O `passarim-proto` já está no padrão (`catalog.proto` é o modelo de tom) e fica de fora.

## 2. Escopo

**Entra (tudo o que é escrito à mão):**

| Repositório | Arquivos |
|---|---|
| `passarim-bff` | 68 `.go` (código e testes), `Dockerfile`, `Makefile`, `.golangci.yml`, workflows da CI, `openapi.yaml` (só os `description` que faltarem) |
| `passarim-catalog` | 66 `.go` (código e testes), 8 `.sql` (migrações e consultas do sqlc), `Dockerfile`, `Dockerfile.worker`, `Makefile`, `sqlc.yaml`, `.golangci.yml`, workflows da CI |
| `passarim-app` | 172 `.kt` (código e testes), 30 `.kts` (módulos, `build-logic`, `settings`), 2 `.swift`, 3 `.sh`, os `.xml` de manifesto e de recursos que não são só strings, `.xcconfig`, workflows da CI, `config/detekt.yml`, `.editorconfig` |

**Fica de fora:**

- código gerado: `gen/`, `build/` e `internal/adapter/postgres/sqlcgen/`;
- dados: os YAML de `content/species/`, JSON, golden files, `testdata/`, snapshots e imagens;
- travas de dependência (`go.sum`, `*.lockfile`, `gradle.lockfile`) e `go.mod`;
- `strings.xml` e fontes.

Os testes **entram**: cada teste diz o que verifica e por que aquilo importa.

## 3. O que cada arquivo ganha

1. **Cabeçalho:** o papel do arquivo na arquitetura. Diz em que camada ele está, quem o usa e de quem ele depende.
2. **Declarações:** todo tipo, função, método e constante, público ou privado, diz o que faz e por quê. Os triviais ganham uma linha só.
3. **Blocos não óbvios:** um comentário antes do bloco explica o passo a passo.
4. **Conceitos na primeira vez que aparecem no arquivo:**
   - **da linguagem:** goroutine, `context`, interface implícita, `defer`, coroutine, `Flow`, `sealed`, `expect`/`actual`;
   - **da biblioteca:** gRPC, sqlc, singleflight, Koin, Room, Ktor, Coil, Compose e recomposição, Paparazzi;
   - **do domínio:** bioma, status IUCN, licença CC, iNaturalist.

   Explicar em cada arquivo, e não só uma vez no repositório, é de propósito: quem estuda abre um arquivo sem ter lido os outros **[DR]**.
5. **Decisões:** "usamos X porque Y" e o que daria errado sem aquele trecho. Se a decisão tem ADR, o comentário cita o número (por exemplo, "ADR-0016").

**Tom:** português claro, frases curtas, sem jargão sem explicação, como no `catalog.proto`. O comentário explica o código que está ali. Não conta a história do plano nem da conversa.

## 4. Formato por linguagem

| Linguagem | Cabeçalho | Declarações | Observações |
|---|---|---|---|
| Go | `// Package x ...` num arquivo só por pacote (o principal); nos outros, um comentário de cabeçalho separado de `package` por uma linha em branco | godoc começando pelo nome (`// Store guarda ...`) | Só um arquivo por pacote pode ter a documentação do pacote, senão o godoc as concatena |
| Kotlin (`.kt`, `.kts`) | Comentário `//` antes de `package` | KDoc `/** ... */` | Verificado pelo ktlint (`ktlint_official`), que tem regras sobre a posição de comentários |
| Swift | `//` no topo | `///` | — |
| SQL | `--` no topo e antes de cada consulta | `--` antes de cada consulta, junto do `-- name:` do sqlc, que fica intacto | O `-- name:` do sqlc é código, não comentário |
| YAML, Dockerfile, Makefile, shell, XML, `.xcconfig` | `#` (ou `<!-- -->` no XML) no topo | `#` antes de cada bloco | — |

**Comentário novo sempre na própria linha, nunca no fim de uma linha de código.** Os comentários de fim de linha que já existem ficam como estão **[DR]**.

## 5. A regra "só comentários" e como ela é verificada

**Nenhuma linha de código muda.** O que pode mudar:

- linhas de comentário, inclusive a reescrita de comentários existentes que estejam errados ou desatualizados;
- linhas em branco;
- a configuração de lint que os comentários exigirem, e só ela:
  - `ignore-rules` do `misspell` (palavras portuguesas);
  - regras do ktlint ou do detekt que barrem comentários;
- as peças da própria verificação: o script novo e o passo dele na CI;
- a seção "Por onde começar a ler" do README (seção 7).

**Verificação:** um script, `scripts/check-comment-only.sh` em cada repositório **[DR]**, roda contra a `main`. Ele percorre o `git diff -U0` e reprova se alguma linha adicionada ou removida não for uma das três coisas abaixo:

- linha em branco;
- linha só de comentário, conforme a linguagem do arquivo (por extensão):
  - em Go, Kotlin e Swift, começa com `//`, `/*`, `*` ou `*/`;
  - em SQL, começa com `--`, menos `-- name:`;
  - em YAML, Dockerfile, Makefile e shell, começa com `#`;
  - em XML, está entre `<!--` e `-->`;
- linha de um arquivo liberado:
  - de configuração: `.golangci.yml`, `config/detekt.yml` e `.editorconfig`;
  - o próprio script;
  - o workflow da CI que o chama;
  - o `README.md`.

O script roda na CI do PR, e o PR só entra com ele verde. Ele vale só para os PRs desta frente: na CI, roda apenas em branches com o prefixo `docs/comentarios-`.

**Além do script:**

- o build, os testes, o lint e os snapshots passam sem nenhuma regravação;
- no Go, `gofmt -l` volta vazio;
- no app, `ktlintCheck` e `detekt` passam.

## 6. Exatidão

Um comentário errado ensina errado, e isso é pior do que não ter comentário. Por isso:

- quem escreve lê o código e as specs e ADRs relacionadas antes de comentar o arquivo;
- antes de abrir cada PR, um agente revisor independente lê o diff contra o código e aponta afirmações falsas ou imprecisas. Os achados são corrigidos antes do PR;
- quando o comentário depende de um fato externo (contrato do BFF, formato de uma API, limitação de biblioteca), o fato é conferido na fonte.

## 7. Entrega

O app tem perto de 200 arquivos. Para a revisão do dono caber numa leitura, ele é dividido em três PRs **[DR]**. São cinco PRs ao todo, na ordem abaixo.

| # | Repositório | Branch | Conteúdo |
|---|---|---|---|
| 1 | `passarim-bff` | `docs/comentarios-bff` | Tudo |
| 2 | `passarim-catalog` | `docs/comentarios-catalog` | Tudo |
| 3 | `passarim-app` | `docs/comentarios-app-core` | `core:*`, `app`, `androidApp`, `iosApp`, `build-logic`, arquivos da raiz e CI |
| 4 | `passarim-app` | `docs/comentarios-app-explore-detail` | `feature:explore:*` e `feature:detail:*` |
| 5 | `passarim-app` | `docs/comentarios-app-favorites-settings` | `feature:favorites:*`, `feature:settings:*` e `snapshots` |

- **BFF e catalog** começam já: não dependem de nada aberto.
- **App:** os três PRs saem da `main` depois do merge do app #9, porque a 5d mexe em boa parte desses arquivos. Se o #9 ainda estiver aberto quando o BFF e o catalog terminarem, os PRs do app saem da branch dele e mudam de base depois do merge.
- O PR 3 inclui o script de verificação do app. Os PRs 4 e 5 o reutilizam.
- **Prefixo `docs:`** nos commits e nos títulos, porque a frente só mexe em documentação dentro do código.
- **Um commit por pacote ou módulo,** para a revisão andar em partes.

**README:** cada repositório ganha uma seção curta, "Por onde começar a ler", com a ordem sugerida de leitura dos pacotes ou módulos, do ponto de entrada até as bordas **[DR]**.

## 8. Critérios de pronto

1. Todo arquivo do escopo (seção 2) tem cabeçalho, e toda declaração tem comentário.
2. O script de verificação passa nos cinco PRs: só mudaram comentários, linhas em branco e a configuração de lint liberada.
3. Build, testes, lint e snapshots passam sem regravação, e `gofmt -l` volta vazio.
4. O agente revisor rodou em cada PR, e os achados dele foram corrigidos.
5. Cada repositório tem a seção "Por onde começar a ler" no README.
6. O dono leu e aprovou cada PR. O merge é do dono.

## 9. Fora do escopo

- Mudar código, mesmo quando um nome ruim ou um bug aparecer na leitura. O que aparecer vai para o `BACKLOG.md` do `passarim-docs`, com o arquivo e a linha.
- O `passarim-proto`, que já está no padrão.
- O `passarim-photo-curator`, que nasce comentado na frente A.

## 10. Decisões do redator [DR]

1. **Conceitos explicados em cada arquivo,** e não só uma vez no repositório, porque quem estuda abre um arquivo sem ter lido os outros.
2. **Comentários novos sempre em linha própria.** É mais fácil de ler para quem está aprendendo e permite verificar que nenhuma linha de código mudou. Os comentários de fim de linha existentes ficam.
3. **Script `scripts/check-comment-only.sh`** em cada repositório, rodando na CI só nas branches `docs/comentarios-*`, em vez de confiar só na revisão visual.
4. **O app dividido em três PRs** por grupo de módulos, para a revisão caber numa leitura.
5. **Seção "Por onde começar a ler" no README** de cada repositório, com o caminho de leitura.
