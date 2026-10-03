# Passarim — Especificação de Design do `passarim-bff` (Etapa 3)

- **Data:** 2026-10-03
- **Status:** aguardando revisão do dono
- **Spec geral:** [`2026-10-01-passarim-design.md`](2026-10-01-passarim-design.md) (§5 API, §7 resiliência, §8 observabilidade, §9 segurança, §13 ordem de construção)
- **Contrato gRPC:** `passarim-proto/proto/passarim/catalog/v1/catalog.proto` (módulo Go `github.com/velosobr/passarim-proto`, versão `v0.2.1`, a mesma usada pelo catalog)

Esta spec é a fonte única para escrever o plano de implementação da Etapa 3. Ela consolida o rascunho aprovado pelo dono e os 14 ajustes obrigatórios da revisão independente. Onde aparece **"decisão do redator"**, o valor foi escolhido para fechar a spec e pode ser trocado pelo dono sem impacto no resto do desenho.

---

## 1. Objetivo e escopo

Criar o `passarim-bff`: serviço em Go que expõe **REST/JSON em `/v1`** para o app e conversa com a Catalog API por **gRPC** (`ListSpecies`, `GetSpecies`, `ListFilters`). O BFF **nunca chama APIs externas**. O catalog devolve só **chaves** de mídia; o BFF monta as URLs públicas. Código comentado em português, para estudo, com a mesma arquitetura limpa do `passarim-catalog`.

### Dentro do escopo

- Repositório `passarim-bff`: código, `openapi.yaml`, testes, Dockerfile, CI, README com diagrama Mermaid.
- Três endpoints públicos (`/v1/species`, `/v1/species/{id}`, `/v1/filters`) e os operacionais (`/healthz`, `/readyz`, `/metrics`).
- Cadeia de resiliência: cache Redis com stale-while-error, circuit breaker, retry com timeout, orçamento de tempo por requisição.
- Segurança: rate limit por IP, validação de entrada, headers, erros `application/problem+json` sem vazamento.
- Observabilidade: logs `slog` JSON, métricas Prometheus, tracing OpenTelemetry para o Jaeger, dashboard Grafana provisionado.
- Repositório `passarim-docs`: duas réplicas no compose, labels do Traefik, job do Prometheus, dashboard do Grafana, ADRs e roteiro da demonstração `docker stop`.

### Fora do escopo

- mTLS BFF ↔ catalog (pendência P2 já no `BACKLOG.md`; o BFF só aceita credenciais TLS por configuração).
- Deploy (Etapa 4), HSTS (exige TLS) e configuração do proxy do Fly.io.
- Tracing dentro do catalog.
- Autenticação, contas e qualquer endpoint de escrita.
- CORS (o cliente é app nativo, não navegador).
- Chip de dieta rotulado (exige campo novo no proto; ver §15).
- Teste e2e com catalog real no CI do `passarim-bff` (ver §12).

---

## 2. Decisões do dono

| # | Decisão | Motivo |
|---|---|---|
| 1 | mTLS BFF ↔ catalog fica fora da Etapa 3; o BFF aceita credenciais TLS por configuração e roda sem mTLS localmente | Gerar CA e certificados só faz sentido junto do deploy; localmente o catalog já está isolado na rede privada. Pendência P2 no `BACKLOG.md` |
| 2 | Rate limit por IP **em memória**, no BFF, por réplica | Simples, sem dependência extra no caminho de cada requisição; o limite efetivo é por réplica e isso fica documentado (ADR) |
| 3 | `openapi.yaml`, handlers e DTOs escritos à mão + **teste de contrato** com `kin-openapi` (inclusive respostas de erro); sem geração de código | O código fica legível para estudo e o teste impede que contrato e código divirjam |
| 4 | Arquitetura interna com **decorators sobre a porta `CatalogReader`** | Cada preocupação (cache, breaker, retry) vira uma camada pequena, testável isoladamente com um `CatalogReader` falso |
| 5 | Bibliotecas: roteador da stdlib `net/http`, `go-redis`, `sony/gobreaker`, `golang.org/x/time/rate`, `golang.org/x/sync/singleflight`; URL de mídia = `MEDIA_BASE_URL` + chave | Escolhas convencionais e estáveis; trocar de CDN não exige mudar o banco |
| 6 | Tracing OpenTelemetry no BFF (HTTP + cliente gRPC) para o Jaeger; tracing no catalog vai para o backlog (P3); dashboard Grafana provisionado como código | Mostra o fluxo de ponta a ponta no BFF sem abrir escopo no catalog |

---

## 3. Arquitetura

### 3.1 Estrutura de pacotes

Módulo Go `github.com/velosobr/passarim-bff`, Go 1.27 (mesmo do catalog). Dependências apontam só para dentro: `usecase` define a porta, `adapter` implementa.

```text
cmd/bff/main.go               liga as peças; subcomando "bff healthcheck"; sem regra de negócio
internal/
  domain/                     tipos puros (sem JSON, sem gRPC)
    species.go                Species, Summary, SpeciesPage, Filters, Photo, Audio, Credit, Fact, Cluster
    catalog.go                Biome (6 códigos), ConservationStatus, 27 UFs
    query.go                  ListQuery + validação/normalização dos parâmetros
    errors.go                 Kind dos erros + tabela única de classificação (§5.3)
  usecase/
    catalog.go                porta CatalogReader
    list_species.go           ListSpecies   (valida, aplica orçamento, chama a porta)
    get_species.go            GetSpecies
    list_filters.go           ListFilters
  adapter/
    http/                     rotas /v1, handlers, DTOs, rótulos PT, problem+json, erro→HTTP, health
    http/middleware/          recovery, request_id, log de acesso, headers, limites, IP real, rate limit
    grpcclient/               implementa CatalogReader; proto→domínio; código gRPC→Kind; metadado x-request-id
    resilience/               decorators de retry+timeout e de circuit breaker
    cache/                    decorator de cache (envelope, chaves, singleflight) + Store Redis
    media/                    monta URL pública = MEDIA_BASE_URL + chave
    reqmeta/                  dados da requisição no contexto (request_id, resultado do cache)
    metrics/                  implementação Prometheus das interfaces de métricas + no-op para testes
    telemetry/                configuração do OpenTelemetry
  config/                     leitura e validação das variáveis de ambiente
openapi.yaml
Dockerfile · Makefile · .golangci.yml · .github/workflows/ci.yml · README.md
```

Porta definida em `usecase/catalog.go`:

```go
type CatalogReader interface {
    ListSpecies(ctx context.Context, q domain.ListQuery) (domain.SpeciesPage, error)
    GetSpecies(ctx context.Context, id string) (domain.Species, error)
    ListFilters(ctx context.Context) (domain.Filters, error)
}
```

O domínio guarda **chaves** de mídia (como o proto); a URL só é montada no adapter HTTP, na conversão para DTO.

### 3.2 Montagem da cadeia (em `main.go`)

```text
handler HTTP → caso de uso → cache → circuit breaker → retry/timeout → grpcclient → catalog
```

Todos depois do caso de uso implementam `CatalogReader`. O cache é o mais externo para poder servir dado velho quando qualquer camada de dentro falha (inclusive com o breaker aberto).

### 3.3 Fluxo de `GET /v1/species/{id}`

1. Middlewares (§7.1): recovery → request_id → log de acesso → headers de segurança → rate limit → limites de entrada → roteador.
2. Handler lê o `{id}` e chama o caso de uso.
3. Caso de uso valida o id (`domain`), cria o contexto com o orçamento total (§5.6) e chama a porta.
4. Cadeia de decorators (§5) até o cliente gRPC, que envia `x-request-id` como metadado.
5. Handler converte o domínio em DTO explícito (OWASP API3), monta as URLs de mídia e grava `X-Cache`.
6. Erros viram HTTP num único lugar (`adapter/http/errors.go`), seguindo a tabela da §5.3.

---

## 4. Contrato REST

Regras gerais:

- Só `GET` (o roteador da stdlib também atende `HEAD` nas rotas `GET`). JSON em camelCase. Prefixo `/v1`.
- DTOs próprios do adapter HTTP; nunca serializar structs do domínio ou do proto.
- Campos anuláveis aparecem sempre, com `null` (nunca omitidos). Listas vazias saem como `[]`, nunca `null`.
- Strings de crédito (`author`, `license`, `source`, `sourceUrl`) são repassadas como vêm do catalog e podem ser vazias.

### 4.1 Formatos compartilhados

**Status de conservação** — **decisão do redator:** objeto `{code, label}` ou `null`, idêntico na lista e no detalhe. `CONSERVATION_STATUS_UNSPECIFIED` ou valor desconhecido viram `null` (o catalog manda UNSPECIFIED quando não conhece o status: `statusToProto` em `passarim-catalog/internal/adapter/grpc/mapping.go:32-37` não tem entrada para o status vazio, e o uso em `mapping.go:59` e `mapping.go:66` cai no valor zero do enum).

| `code` | `label` |
|---|---|
| `LC` | Pouco preocupante |
| `NT` | Quase ameaçada |
| `VU` | Vulnerável |
| `EN` | Em perigo |
| `CR` | Criticamente em perigo |
| `EW` | Extinta na natureza |
| `EX` | Extinta |
| `DD` | Dados insuficientes |

**Bioma** — códigos iguais aos do domínio do catalog (`passarim-catalog/internal/domain/species.go:20-27`). Onde o bioma aparece rotulado, o formato é `{code, label}` (**decisão do redator:** a chave é `label` também em `/v1/filters`, no lugar do `name` do rascunho, para um formato só em toda a API).

| `code` | `label` |
|---|---|
| `amazonia` | Amazônia |
| `mata_atlantica` | Mata Atlântica |
| `cerrado` | Cerrado |
| `caatinga` | Caatinga |
| `pantanal` | Pantanal |
| `pampa` | Pampa |

Bioma `BIOME_UNSPECIFIED` ou desconhecido vindo do catalog: o item é **descartado e logado** (WARN, com request_id), na espécie e nos filtros.

**UF** — as 27 siglas do domínio do catalog (`passarim-catalog/internal/domain/species.go:68-74`), sempre em maiúsculas na resposta. UF desconhecida vinda do catalog recebe o mesmo tratamento do bioma (descartada e logada) — **decisão do redator**.

**Crédito** — `{author, license, source, sourceUrl}`.

**URLs de mídia** — montadas em `adapter/media` com `url.JoinPath(MEDIA_BASE_URL, chave)`:

- Chave vazia → URL `null` (o `thumbnail_key` da lista vem de `COALESCE(..., '')`, `passarim-catalog/internal/adapter/postgres/queries.sql:5-7`).
- Áudio ausente (`audio` nil no proto) **ou** com `key` vazia → `"audio": null`.
- Defesa em profundidade: chave fora do charset `[A-Za-z0-9/._-]`, com segmento `..` ou começando com `/` → URL `null` e log WARN (o `JoinPath` limpa `..` e a chave poderia sair do bucket). Chaves reais têm o formato `species/{id}/photo-{idNaFonte}-{variante}.webp` e `species/{id}/audio-{idNaFonte}.aac` (`passarim-catalog/internal/usecase/ingest/keys.go:17-23`).

### 4.2 `GET /v1/species`

Parâmetros de query:

| Parâmetro | Regra | Padrão |
|---|---|---|
| `q` | Aparado (trim). Vazio após o trim = sem busca. Máximo 100 caracteres (runas), UTF-8 válido, sem caracteres de controle | sem busca |
| `biome` | Um dos 6 códigos, exatamente como na tabela | sem filtro |
| `state` | Uma das 27 UFs, sem diferenciar maiúsculas; normalizado para maiúsculas | sem filtro |
| `cursor` | Opaco, repassado ao catalog como `page_token`. Charset `[A-Za-z0-9_-]`, máximo 512 caracteres | primeira página |
| `limit` | Inteiro de 1 a 50 (fora disso ou não numérico → 400; não é ajustado em silêncio) | 20 |

- Parâmetro repetido (`?state=SP&state=RJ`) → 400 com `errors[{field: "state"}]`.
- Parâmetro com valor vazio (`?biome=`) = ausente — **decisão do redator**.
- Parâmetros desconhecidos são ignorados.
- O BFF repassa `page_size` = limit efetivo e converte `next_page_token` vazio em `nextCursor: null`.

Resposta 200:

```json
{
  "items": [
    {
      "id": "turdus-rufiventris",
      "commonName": "Sabiá-laranjeira",
      "scientificName": "Turdus rufiventris",
      "thumbnailUrl": "http://localhost:8888/buckets/passarim-media/species/turdus-rufiventris/photo-12345-thumb.webp",
      "conservationStatus": { "code": "LC", "label": "Pouco preocupante" }
    },
    {
      "id": "cariama-cristata",
      "commonName": "Seriema",
      "scientificName": "Cariama cristata",
      "thumbnailUrl": null,
      "conservationStatus": null
    }
  ],
  "nextCursor": "eyJzIjoic2VyaWVtYSIsImkiOiJjYXJpYW1hLWNyaXN0YXRhIn0"
}
```

### 4.3 `GET /v1/species/{id}`

- `id`: `^[a-z0-9-]{1,80}$`; fora disso → 400 `errors[{field: "id"}]` (sem chamar o catalog).
- `photos`: na ordem do catalog; a primeira é a principal (hero). Cada URL é anulável (chave vazia).
- `chips`: os biomas da espécie rotulados em PT (`{code, label}`), na ordem do catalog.
- `diet`: texto livre ou `null`. O proto tem `optional string diet` (`catalog.proto:125`) e o conteúdo curado traz frases (ex.: `passarim-catalog/content/species/turdus-rufiventris.yaml`), então não há rótulo nem chip de dieta.
- `sizeCm`: inteiro ou `null`.
- `whereToFind.biomes`: códigos (strings); `whereToFind.states`: UFs; `whereToFind.clusters`: pontos do mapa.

Resposta 200:

```json
{
  "id": "turdus-rufiventris",
  "commonName": "Sabiá-laranjeira",
  "scientificName": "Turdus rufiventris",
  "family": "Turdidae",
  "conservationStatus": { "code": "LC", "label": "Pouco preocupante" },
  "sizeCm": 23,
  "diet": "Artrópodes, larvas e minhocas, além de frutos maduros.",
  "description": "O sabiá-laranjeira é um pássaro de peito alaranjado...",
  "descriptionCredit": {
    "author": "Passarim",
    "license": "CC-BY-SA",
    "source": "curated",
    "sourceUrl": "https://pt.wikipedia.org/wiki/Sabi%C3%A1-laranjeira"
  },
  "facts": [
    { "text": "Foi declarado popularmente Ave Nacional do Brasil...", "source": "https://pt.wikipedia.org/wiki/Sabi%C3%A1-laranjeira" }
  ],
  "chips": [
    { "code": "mata_atlantica", "label": "Mata Atlântica" },
    { "code": "cerrado", "label": "Cerrado" }
  ],
  "photos": [
    {
      "thumbUrl": "http://localhost:8888/buckets/passarim-media/species/turdus-rufiventris/photo-12345-thumb.webp",
      "mediumUrl": "http://localhost:8888/buckets/passarim-media/species/turdus-rufiventris/photo-12345-medium.webp",
      "largeUrl": "http://localhost:8888/buckets/passarim-media/species/turdus-rufiventris/photo-12345-large.webp",
      "width": 1600,
      "height": 1067,
      "credit": { "author": "Fulano", "license": "CC-BY-NC", "source": "inaturalist", "sourceUrl": "https://www.inaturalist.org/photos/12345" }
    }
  ],
  "audio": {
    "url": "http://localhost:8888/buckets/passarim-media/species/turdus-rufiventris/audio-67890.aac",
    "durationMs": 21500,
    "credit": { "author": "Beltrano", "license": "CC-BY-NC-SA", "source": "xeno-canto", "sourceUrl": "https://xeno-canto.org/67890" }
  },
  "whereToFind": {
    "states": ["SP", "RJ", "MG"],
    "biomes": ["mata_atlantica", "cerrado"],
    "clusters": [
      { "lat": -23.5, "lng": -46.6, "count": 42, "precision": 0.5 }
    ]
  }
}
```

### 4.4 `GET /v1/filters`

Resposta 200 (os `code` são exatamente os valores aceitos em `biome` e `state` na lista):

```json
{
  "biomes": [
    { "code": "mata_atlantica", "label": "Mata Atlântica", "speciesCount": 31 }
  ],
  "states": [
    { "code": "SP", "speciesCount": 28 }
  ]
}
```

### 4.5 Erros (`application/problem+json`, RFC 9457)

Campos: `type`, `title`, `status`, `code`, `requestId`; no 400, também `errors: [{field, reason}]`. **Decisão do redator:** `type` é a URN `urn:passarim:problem:<code em minúsculas com hífen>` (ex.: `urn:passarim:problem:species-not-found`), estável e sem depender de página hospedada; `title` é um texto fixo em PT por código; `reason` é um texto fixo e curto escrito pelo BFF.

| HTTP | `code` | Quando | Extras |
|---|---|---|---|
| 400 | `INVALID_PARAMETER` | Validação do BFF ou `InvalidArgument` do catalog | `errors[]` |
| 404 | `SPECIES_NOT_FOUND` | `NotFound` do catalog em `GetSpecies` | — |
| 404 | `NOT_FOUND` | Rota inexistente | — |
| 405 | `METHOD_NOT_ALLOWED` | Método diferente de `GET`/`HEAD` (**decisão do redator** para o nome do código) | `Allow: GET, HEAD` |
| 429 | `RATE_LIMITED` | Balde do IP vazio | `Retry-After` |
| 503 | `SERVICE_UNAVAILABLE` | Catalog indisponível e sem dado velho no cache | — |
| 500 | `INTERNAL` | Panic, `Unimplemented`, erro de programação | — |

Exemplos:

```json
{
  "type": "urn:passarim:problem:invalid-parameter",
  "title": "Parâmetro inválido",
  "status": 400,
  "code": "INVALID_PARAMETER",
  "requestId": "3f2a9c1e7b6d4a0f8e5c2b1a9d8e7f60",
  "errors": [
    { "field": "limit", "reason": "deve ser um inteiro entre 1 e 50" },
    { "field": "state", "reason": "UF desconhecida" }
  ]
}
```

```json
{
  "type": "urn:passarim:problem:species-not-found",
  "title": "Espécie não encontrada",
  "status": 404,
  "code": "SPECIES_NOT_FOUND",
  "requestId": "3f2a9c1e7b6d4a0f8e5c2b1a9d8e7f60"
}
```

Regras:

- Nenhum problem+json carrega mensagem interna, host, stack ou texto de erro gRPC. O detalhe vai só para o log, com o `request_id`.
- `InvalidArgument` do catalog nunca repassa a mensagem dele. Como o BFF já valida `q`, `biome`, `state` e `limit`, o campo é inferido pelo método: em `ListSpecies` vira `errors[{field: "cursor"}]` (ex.: cursor adulterado — o catalog aceita qualquer base64url de JSON com `i` preenchido, `passarim-catalog/internal/usecase/cursor.go:26-36`); em `GetSpecies` vira `errors[{field: "id"}]` — **decisão do redator** para o caso do `GetSpecies`.
- 404 de rota e 405 também saem em problem+json: o mux da stdlib responderia texto puro. Solução: o middleware de limites recusa métodos diferentes de `GET`/`HEAD` antes do roteador (todas as rotas são `GET`) e o roteador registra um handler `/` que responde `NOT_FOUND`.
- Cliente que desistiu (contexto cancelado): o handler não escreve corpo; o log de acesso registra status `499` — **decisão do redator** (convenção do nginx), para não poluir as métricas de 5xx.

### 4.6 Cabeçalhos de resposta

| Cabeçalho | Valor |
|---|---|
| `Content-Type` | `application/json; charset=utf-8` (200) ou `application/problem+json` (erros) |
| `Cache-Control` | `public, max-age=60` só em 200 dos endpoints `/v1`; `no-store` em 4xx, 5xx, 429 e nos endpoints operacionais |
| `X-Cache` | `hit`, `miss` ou `stale`, nos três endpoints `/v1` que passam pelo caso de uso (lista com `q` fora do cache recebe `miss`) |
| `X-Request-Id` | O id da requisição (recebido e válido, ou gerado) |
| `X-Content-Type-Options` | `nosniff` |
| `Content-Security-Policy` | `default-src 'none'` |
| `Referrer-Policy` | `no-referrer` |
| `Retry-After` | Só no 429 (§7.3) |
| `Allow` | Só no 405: `GET, HEAD` |

`X-Cache` chega ao handler por `adapter/reqmeta`: o handler coloca no contexto um registro mutável da requisição e o decorator de cache grava nele o resultado, na goroutine do próprio chamador (depois do singleflight), para cada chamador ter o seu valor.

---

## 5. Cadeia de resiliência

### 5.1 Ordem

**cache (externo) → circuit breaker → retry/timeout → cliente gRPC.** O breaker envolve o retry: uma operação lógica (com todas as suas tentativas) conta **uma vez** no breaker. Breaker aberto devolve erro imediato e o cache serve o dado velho, se houver.

### 5.2 Cache Redis

- **Envelope** gravado em JSON: `{"storedAt": "<RFC 3339>", "data": <DTO de cache>}`. O pacote `cache` tem structs próprias com tags JSON (o domínio não tem JSON) e converte de/para o domínio.
- **Frescor** de 10 min (`CACHE_FRESH_TTL`) decidido em código comparando `storedAt` com o relógio injetável; **TTL no Redis** de 24 h (`CACHE_STALE_TTL`) = janela de stale.
- **Chaves versionadas**: `bff:v1:species:{id}`, `bff:v1:filters`, `bff:v1:list:{sha256 hex dos parâmetros normalizados}`. O hash é calculado sobre o `ListQuery` **já normalizado** (q aparado, `state` em maiúsculas, limit efetivo, cursor). Mudou a struct do envelope → incrementa `v1`.
- **Cardinalidade**: lista com `q` não vazio fica **fora do cache** (sem leitura, sem gravação, sem singleflight, sem stale; conta como `bypass` na métrica) — **decisão do redator** entre as duas opções da revisão, por ser a mais simples. O Redis do compose roda com `--maxmemory 64mb --maxmemory-policy allkeys-lru` (o tamanho é decisão do redator).
- **Redis fora do ar** = miss: loga WARN, conta `result="error"` e segue para o catalog; nunca derruba o BFF. Cada operação no Redis tem timeout próprio (`REDIS_TIMEOUT`, padrão 100 ms). Falha ao gravar é só logada.
- **Envelope que não decodifica** (struct mudou, dado corrompido) = miss, com log WARN.

Algoritmo de uma leitura cacheável:

1. Calcula a chave e lê o envelope **antes** de chamar o catalog. Se existir, guarda-o em memória (variável local) como candidato a stale.
2. Envelope fresco → devolve (`hit`).
3. Senão, `singleflight.DoChan(chave, fn)`; `fn` chama o próximo `CatalogReader` com `context.WithoutCancel(ctx)` + `context.WithTimeout(..., REQUEST_BUDGET)` (mantém request_id e trace, mas não morre com o primeiro chamador). Em sucesso, grava o envelope (best effort).
4. O chamador faz `select` entre o canal do `DoChan` e `ctx.Done()`.
5. Resultado com sucesso → devolve (`miss`).
6. Erro que **libera stale** (tabela §5.3) com candidato em memória → devolve o dado velho (`stale`), log WARN com a causa. Sem candidato → devolve o erro.
7. `ctx.Done()` antes do resultado: se o contexto expirou (orçamento) e há candidato → `stale`; se o cliente cancelou ou não há candidato → devolve o erro do contexto.
8. Erro que **não libera stale** (`NotFound`, `InvalidArgument`, `Canceled`, `Internal`) → devolve o erro, sem stale.

O singleflight é por processo (cada réplica tem o seu), assim como o breaker.

### 5.3 Tabela única de classificação de erros

Implementada em `internal/domain/errors.go` como um `Kind` por erro e três funções (`Retryable`, `CountsForBreaker`, `AllowsStale`). O `grpcclient` traduz o código gRPC para o `Kind`; erros de contexto locais também são traduzidos (`context.DeadlineExceeded` → `Timeout`, `context.Canceled` → `Canceled`). O adapter HTTP traduz o `Kind` para a resposta. Nenhuma outra camada decide classificação.

| Origem | `Kind` | Retry | Conta no breaker | Libera stale | HTTP sem stale |
|---|---|---|---|---|---|
| gRPC `Unavailable` | `Unavailable` | sim | sim | sim | 503 `SERVICE_UNAVAILABLE` |
| gRPC `DeadlineExceeded` | `Timeout` | sim | sim | sim | 503 `SERVICE_UNAVAILABLE` |
| gRPC `Internal`, `Unknown`, `ResourceExhausted` | `Upstream` | não | sim | sim | 503 `SERVICE_UNAVAILABLE` |
| Breaker aberto (`gobreaker.ErrOpenState`) ou `gobreaker.ErrTooManyRequests` | `CircuitOpen` | não | não se aplica (gerado pelo próprio breaker) | sim | 503 `SERVICE_UNAVAILABLE` |
| gRPC `NotFound` | `NotFound` | não | não | não | 404 `SPECIES_NOT_FOUND` |
| gRPC `InvalidArgument` | `InvalidArgument` | não | não | não | 400 `INVALID_PARAMETER` |
| gRPC `Canceled` | `Canceled` | não | não | não | sem corpo (log 499) |
| gRPC `Unimplemented` e todos os demais códigos; resposta inesperada (ex.: `GetSpeciesResponse` sem `species`) | `Internal` | não | não | não | 500 `INTERNAL` |

Por que `Internal` do catalog libera stale: o catalog devolve `INTERNAL` quando o Postgres cai (`passarim-catalog/internal/adapter/grpc/server.go:107-109`) e `CANCELLED`/`DEADLINE_EXCEEDED` quando o contexto do cliente expira ou é cancelado (`server.go:99-106`). **Decisão do redator:** códigos não listados pela revisão (`Unimplemented`, `PermissionDenied`, `Unauthenticated`, `FailedPrecondition` etc.) indicam erro de versão ou de configuração, não queda; por isso não contam no breaker (abrir o circuito não ajudaria) e viram 500.

### 5.4 Circuit breaker (`sony/gobreaker`)

- Abre com **5 falhas seguidas** ou **≥ 60% de falhas em pelo menos 10 chamadas** (`ReadyToTrip`).
- Fica aberto **30 s** (`Timeout`); no half-open aceita **3 chamadas de teste** (`MaxRequests`) e o contador cíclico do estado fechado zera a cada **60 s** (`Interval`) — os dois últimos valores são **decisão do redator**.
- `IsSuccessful(err)` devolve `true` para `err == nil` e para todo erro com `CountsForBreaker(err) == false` (assim `NotFound`, `InvalidArgument`, `Canceled` e `Internal` não contam como falha).
- Um breaker único para o catalog (não um por método), porque os três métodos dependem do mesmo serviço e do mesmo banco — **decisão do redator**.
- Estado exposto como métrica e cada transição logada (INFO).
- Valores fixos em constantes comentadas (não são variáveis de ambiente).

### 5.5 Retry e timeout

- Só leituras (todas as chamadas do BFF são leituras); só `Kind` `Unavailable` e `Timeout`.
- Até **2 retries** (3 tentativas no máximo, `CATALOG_MAX_RETRIES`).
- Timeout por tentativa = `min(CATALOG_ATTEMPT_TIMEOUT, tempo restante do contexto)`, com `CATALOG_ATTEMPT_TIMEOUT` = 2 s.
- Backoff exponencial com jitter total: antes do retry *n* (n = 1, 2), espera um valor aleatório em `[0, 50 ms × 2ⁿ]`. A espera respeita o contexto.
- Não inicia nova tentativa se o tempo restante, descontada a espera, for menor que **200 ms** (constante `minAttemptBudget`, **decisão do redator**).
- O cliente gRPC é criado com `grpc.WithDisableRetry()` para não haver retry duplicado (o do grpc-go e o nosso).

### 5.6 Orçamento de tempo

- **Orçamento total por requisição**: 3 s (`REQUEST_BUDGET`), aplicado com `context.WithTimeout` **no caso de uso** (todos os chamadores ganham o limite).
- `WriteTimeout` do servidor HTTP = 5 s (orçamento + margem para serializar e escrever).
- O singleflight usa um orçamento próprio do mesmo tamanho (§5.2, passo 3).
- O stale lido no passo 1 do cache fica em memória: servir dado velho não depende de reler o Redis depois que o contexto expirou.

Linha do tempo do pior caso: tentativa 1 expira em 2 s → espera ≤ 100 ms → tentativa 2 com ~0,9 s → sem tempo para a 3ª → `Timeout` → stale ou 503, dentro dos 3 s.

### 5.7 Métricas da cadeia

Os decorators recebem uma **interface de métricas injetada** já na tarefa 6 (com implementação no-op nos testes); a implementação Prometheus chega na tarefa 8.

| Métrica | Tipo | Rótulos |
|---|---|---|
| `bff_cache_requests_total` | counter | `result` = `hit`, `miss`, `stale`, `bypass`, `error` |
| `bff_breaker_state` | gauge | — (0 fechado, 1 half-open, 2 aberto) |
| `bff_catalog_retries_total` | counter | `method` |
| `bff_catalog_request_duration_seconds` | histogram (por tentativa) | `method`, `code` |

### 5.8 Janela conhecida de URLs de mídia quebradas

Quando o worker troca a mídia de uma espécie, o `removeOrphans` apaga os objetos antigos depois de o banco apontar para os novos (`passarim-catalog/internal/usecase/ingest/keys.go:34-51`). O BFF pode continuar servindo a URL velha por até ~10 min (frescor) + 60 s (`max-age` no app), ou enquanto servir stale com o catalog fora. Aceito no MVP e documentado no README do BFF; melhoria registrada no backlog (§15).

---

## 6. Health, readiness e shutdown

- `GET /healthz` (liveness): 200 se o processo responde.
- `GET /readyz` (readiness, usado pelo Traefik): 200 se o processo subiu com config válida e **não está em shutdown**; 503 durante o shutdown. **Não depende do catalog nem do Redis.** Motivo: com o catalog fora, as duas réplicas ficariam não-prontas, o Traefik responderia um 503 próprio (sem problem+json) e o stale nunca seria servido. O estado da conexão com o catalog vira só métrica (`bff_catalog_connection_state`, gauge com o `connectivity.State` do grpc-go) e log nas transições.
- `/healthz` e `/readyz` ficam na porta HTTP principal (o Traefik precisa delas ali), isentos de rate limit, com `Cache-Control: no-store`. O Traefik só roteia `/v1`, então eles não ficam públicos.
- `/metrics` fica em **porta separada** (`METRICS_ADDR`), como no catalog (`passarim-catalog/cmd/catalog-api/main.go:94-97`).
- Subcomando **`bff healthcheck`**: a imagem distroless não tem curl; o binário faz `GET http://127.0.0.1:<porta de HTTP_ADDR>/healthz` com timeout de 2 s e sai com 0 ou 1 (mesmo padrão de `cmd/catalog-api/main.go:40-44`). Usa `127.0.0.1`, não `localhost` (no container, `localhost` pode resolver para IPv6 primeiro).

Sequência de shutdown ao receber SIGTERM/SIGINT:

1. Marca "em shutdown": `/readyz` passa a 503.
2. Espera `SHUTDOWN_DRAIN_DELAY` (3 s), mais que um intervalo do health check do Traefik (2 s), para ele tirar a réplica do balanceamento. O servidor continua atendendo nesse intervalo.
3. `http.Server.Shutdown` com `SHUTDOWN_TIMEOUT` (10 s) e, em seguida, `Shutdown` do servidor de métricas.
4. Flush do exportador de traces (até 2 s), depois fecha a conexão gRPC e o cliente Redis.

No compose, `stop_grace_period: 20s` (3 + 10 + 2 s + margem; o padrão de 10 s do Docker não basta).

---

## 7. Segurança e middlewares

### 7.1 Ordem dos middlewares (de fora para dentro)

1. **Recovery de panic**: responde 500 `INTERNAL` em problem+json, sem stack; loga em ERROR com stack e com o request_id lido do cabeçalho `X-Request-Id` já gravado na resposta. Repropaga `http.ErrAbortHandler`.
2. **request_id**: aceita o `X-Request-Id` recebido se casar com `^[A-Za-z0-9._-]{1,64}$` (o catalog descarta ids com mais de 64 caracteres, `passarim-catalog/internal/adapter/grpc/interceptors.go:41`); senão gera 32 caracteres hex com `crypto/rand`. Grava no contexto (`reqmeta`) e no cabeçalho de resposta.
3. **Log de acesso** (§8.1).
4. **Headers de segurança** (§4.6).
5. **Rate limit** (§7.3), exceto `/healthz` e `/readyz`.
6. **Limites de entrada**: recusa métodos diferentes de `GET`/`HEAD` (405); o corpo nunca é lido e fica envolvido em `http.MaxBytesReader` de 1 KiB.
7. **Roteador** (`net/http.ServeMux`, padrões `GET /v1/species`, `GET /v1/species/{id}`, `GET /v1/filters`, `GET /healthz`, `GET /readyz` e o `/` que responde 404 `NOT_FOUND`).

### 7.2 Servidor HTTP

| Campo | Valor |
|---|---|
| `ReadHeaderTimeout` | 2 s |
| `ReadTimeout` | 5 s |
| `WriteTimeout` | 5 s (§5.6) |
| `IdleTimeout` | 60 s |
| `MaxHeaderBytes` | 8 KiB (limita também o tamanho da URL) |

Os valores, exceto o `WriteTimeout`, são **decisão do redator**. O servidor de métricas recebe os mesmos timeouts.

### 7.3 Rate limit por IP

- Token bucket (`golang.org/x/time/rate`), padrão **10 req/s com rajada de 30** (`RATE_LIMIT_RPS`, `RATE_LIMIT_BURST`).
- Excedeu → 429 `RATE_LIMITED`, `Retry-After` = `ceil(1 / RATE_LIMIT_RPS)` segundos, mínimo 1.
- Memória limitada: mapa IP → balde + lista LRU (`container/list`). Teto de `RATE_LIMIT_MAX_IPS` (10 000). No teto, um IP novo **despeja o mais ocioso**; o limiter nunca recusa todos. Limpeza periódica a cada 1 min remove IPs ociosos há mais de 3 min (valores de teto e limpeza: **decisão do redator**).
- O limite é **por réplica**: com 2 réplicas e round-robin, um IP consegue até ~2× o limite. Documentado no ADR.

### 7.4 IP real atrás do Traefik

- `TRUSTED_PROXIES`: lista de CIDRs confiáveis (vazia = não confia em ninguém). `CLIENT_IP_HEADER`: nome do cabeçalho (padrão `X-Forwarded-For`; no Fly.io será outro, configurado na Etapa 4).
- Algoritmo:
  1. IP da conexão = host de `RemoteAddr`. Se ele **não** estiver em `TRUSTED_PROXIES` → é o IP do cliente (o cabeçalho é ignorado).
  2. Se estiver, junta todas as ocorrências do cabeçalho em ordem e lê as entradas **da direita para a esquerda**, pulando as que são proxies confiáveis. A primeira entrada que não é proxy confiável é o IP do cliente. **Nunca** se usa a primeira entrada (a mais à esquerda é controlada pelo cliente).
  3. Entrada que não é um IP válido encerra a busca e usa o IP da conexão; cabeçalho ausente ou só com proxies também.
- No compose, confia **somente** no IP fixo do Traefik (§10.2). Prometheus e Jaeger também estão na `passarim-public` (`passarim-docs/docker-compose.yml:185` e `docker-compose.yml:212`) e poderiam forjar `X-Forwarded-For` se a rede inteira fosse confiável.
- Limitação local documentada: com as portas publicadas em `127.0.0.1`, clientes do host podem chegar ao Traefik com o IP do gateway do Docker e **dividir o mesmo balde**.

### 7.5 Validação de entrada

Resumo (detalhes nas §4.2 e §4.3): `id` `^[a-z0-9-]{1,80}$`; `limit` 1–50; `q` ≤ 100 runas, UTF-8 válido, sem caracteres de controle; `biome` e `state` só valores conhecidos; `cursor` `[A-Za-z0-9_-]{1,512}`; parâmetro repetido recusado; desconhecidos ignorados. Todos os erros de validação de uma requisição saem juntos em `errors[]`. A validação mora no `domain` (`query.go`) e é chamada pelo caso de uso; o handler só extrai as strings e detecta parâmetros repetidos.

### 7.6 Outros controles

- Configuração por variáveis de ambiente; mensagens de erro citam o **nome** da variável, nunca o valor (`REDIS_URL` pode ter senha).
- Cliente gRPC com credenciais TLS opcionais (§9); sem elas, `insecure` (rede privada local).
- Container distroless `nonroot`, `read_only: true`, sem porta publicada (só o Traefik publica).
- Logs nunca registram valores de configuração nem corpo de resposta.

---

## 8. Observabilidade

### 8.1 Logs

`slog` com handler JSON, nível por `LOG_LEVEL`. Uma linha por requisição com: `request_id`, `method`, `route` (o padrão casado, `r.Pattern`, nunca a URL com parâmetros; `unmatched` quando nenhuma rota casou), `status`, `duration_ms`, `cache` (`hit`/`miss`/`stale` ou vazio), `client_ip`. Erros do catalog e do Redis são logados com a causa e o request_id. O `request_id` vai ao catalog como metadado gRPC `x-request-id` (interceptor do cliente), para ligar os logs dos dois serviços.

### 8.2 Métricas (`/metrics`, porta separada, nunca pelo Traefik)

Além das métricas da §5.7 e do coletor padrão de runtime Go:

| Métrica | Tipo | Rótulos |
|---|---|---|
| `bff_http_requests_total` | counter | `route`, `method`, `status` |
| `bff_http_request_duration_seconds` | histogram | `route`, `method` |
| `bff_rate_limited_total` | counter | — |
| `bff_rate_limiter_tracked_ips` | gauge | — |
| `bff_catalog_connection_state` | gauge | — (§6) |

Taxas de 4xx e 5xx saem de `bff_http_requests_total` pelo rótulo `status`.

### 8.3 Tracing

OpenTelemetry com `otelhttp` no servidor e `otelgrpc` (stats handler) no cliente gRPC, propagação W3C `traceparent`. Exportador OTLP/gRPC configurado pelas variáveis padrão do OTel (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`); **sem endpoint, o tracing fica desligado** (provider no-op) e o BFF sobe normalmente. O resultado do cache vira atributo do span HTTP. Cada tentativa gRPC gera seu span (os retries ficam visíveis no Jaeger).

### 8.4 Dashboard Grafana

Provisionado como código em `passarim-docs/infra/grafana/` (provider de dashboards + JSON). Painéis: requisições por segundo por rota, latência p50/p95/p99, taxa de 4xx e 5xx, cache hit ratio (`hit` / (`hit` + `miss` + `stale`)), servidos como stale, 429 por segundo, estado do breaker, retries ao catalog.

---

## 9. Configuração (variáveis de ambiente)

| Variável | Obrigatória | Padrão | Uso |
|---|---|---|---|
| `HTTP_ADDR` | não | `:8080` | Porta da API e do health |
| `METRICS_ADDR` | não | `:9091` | Porta do `/metrics` |
| `CATALOG_ADDR` | sim | — | Endereço gRPC do catalog |
| `CATALOG_TLS_CA_FILE` | não | — | CA para validar o catalog; presente = TLS ligado |
| `CATALOG_TLS_CERT_FILE` / `CATALOG_TLS_KEY_FILE` | não | — | Certificado de cliente (mTLS futuro); os dois juntos ou nenhum, e só com `CATALOG_TLS_CA_FILE` |
| `CATALOG_TLS_SERVER_NAME` | não | host de `CATALOG_ADDR` | Nome esperado no certificado do catalog |
| `REDIS_URL` | sim | — | `redis://...` |
| `REDIS_TIMEOUT` | não | `100ms` | Timeout de cada operação no Redis |
| `MEDIA_BASE_URL` | sim | — | URL absoluta `http`/`https` à qual a chave de mídia é anexada |
| `REQUEST_BUDGET` | não | `3s` | Orçamento total por requisição |
| `CATALOG_ATTEMPT_TIMEOUT` | não | `2s` | Timeout por tentativa |
| `CATALOG_MAX_RETRIES` | não | `2` | Retries além da 1ª tentativa |
| `CACHE_FRESH_TTL` | não | `10m` | Frescor do cache |
| `CACHE_STALE_TTL` | não | `24h` | TTL no Redis (janela de stale) |
| `RATE_LIMIT_RPS` / `RATE_LIMIT_BURST` | não | `10` / `30` | Token bucket por IP |
| `RATE_LIMIT_MAX_IPS` | não | `10000` | Teto de IPs rastreados |
| `TRUSTED_PROXIES` | não | vazio | CIDRs separados por vírgula |
| `CLIENT_IP_HEADER` | não | `X-Forwarded-For` | Cabeçalho com o IP do cliente |
| `SHUTDOWN_DRAIN_DELAY` | não | `3s` | Espera com `/readyz` em 503 |
| `SHUTDOWN_TIMEOUT` | não | `10s` | Prazo do `Shutdown` |
| `LOG_LEVEL` | não | `info` | `debug`, `info`, `warn`, `error` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | não | vazio (tracing desligado) | Ex.: `http://jaeger:4317` |
| `OTEL_SERVICE_NAME` | não | `passarim-bff` | Nome do serviço nos traces |

Validações na carga (falha = processo não sobe): obrigatórias presentes; durações e inteiros válidos e positivos (`CATALOG_MAX_RETRIES` aceita 0); `REQUEST_BUDGET` + 1 s menor ou igual ao `WriteTimeout` fixo de 5 s (ou seja, `REQUEST_BUDGET` ≤ 4 s); CIDRs válidos; `MEDIA_BASE_URL` absoluta com esquema `http` ou `https`; regra dos arquivos TLS. `config.Load(getenv func(string) string)` recebe a função de leitura, como no catalog, para ser testável.

---

## 10. Compose, Traefik, Prometheus e Grafana (`passarim-docs`)

### 10.1 Serviços `bff-1` e `bff-2`

- Mesma imagem `passarim-bff:dev` (`build: ../passarim-bff` em `bff-1`; `bff-2` usa a imagem com `pull_policy: never`, como o `catalog-seed`). Configuração comum num bloco de extensão YAML (`x-bff: &bff`) para as duas réplicas serem idênticas.
- Redes: `passarim-public` e `passarim-private`. Sem `ports`.
- `read_only: true`; usuário `nonroot` da imagem; `stop_grace_period: 20s`.
- `healthcheck`: `["CMD", "/usr/local/bin/bff", "healthcheck"]`, intervalo 5 s, timeout 3 s, 20 tentativas.
- `depends_on`: `catalog-api` (`service_healthy`) e `redis` (`service_healthy`).
- Ambiente:

```yaml
CATALOG_ADDR: catalog-api:50051
REDIS_URL: redis://redis:6379
MEDIA_BASE_URL: http://localhost:${HOST_PORT_S3_UI}/buckets/passarim-media
TRUSTED_PROXIES: 172.30.0.10/32
OTEL_EXPORTER_OTLP_ENDPOINT: http://jaeger:4317
```

O bucket `passarim-media` é o padrão do worker (`passarim-catalog/internal/config/worker.go:35`). A URL usa a porta do filer publicada no host porque quem abre a mídia é o cliente, fora da rede do Docker.

### 10.2 IP fixo do Traefik

**Decisão do redator** (a revisão pedia subnet fixa ou IP fixo; o desenho usa os dois): a rede `passarim-public` ganha `ipam` com `subnet: 172.30.0.0/24` e `ip_range: 172.30.0.128/25` (IPs dinâmicos só na metade de cima); o Traefik recebe `ipv4_address: 172.30.0.10`, fora da faixa dinâmica, para nenhum outro container herdar esse IP. `TRUSTED_PROXIES` contém só `172.30.0.10/32`.

### 10.3 Labels do Traefik

Idênticas em `bff-1` e `bff-2` (vindas do bloco `x-bff`), com o **mesmo nome de service**, para os dois containers virarem servidores do mesmo service no round-robin:

```yaml
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

A porta de métricas (9091) não aparece em label nenhuma e o router só casa `/v1`: `/metrics`, `/healthz` e `/readyz` não são expostos.

### 10.4 Redis, Prometheus e Grafana

- Redis: `command: ["redis-server", "--maxmemory", "64mb", "--maxmemory-policy", "allkeys-lru"]`.
- Prometheus: job `bff` com alvos `bff-1:9091` e `bff-2:9091` (substitui o comentário "O job do BFF será adicionado na Etapa 3" em `infra/prometheus/prometheus.yml`).
- Grafana: `infra/grafana/provisioning/dashboards/` com o provider e o JSON do dashboard da §8.4.

---

## 11. Estratégia de testes

Todas as tarefas em TDD. Meta de cobertura ≥ 80% em `domain` e `usecase` (spec geral §10).

| Camada | Como |
|---|---|
| `domain` | Unitários puros: validação e normalização do `ListQuery`, id, tabela de classificação (cada `Kind` × `Retryable`/`CountsForBreaker`/`AllowsStale`) |
| `usecase` | `CatalogReader` falso: validação antes da chamada, orçamento aplicado (deadline no contexto recebido) |
| `grpcclient` | `bufconn` com servidor gRPC falso: mapeamento proto→domínio (status UNSPECIFIED→vazio, bioma desconhecido descartado, áudio nil), cada código gRPC→`Kind`, metadado `x-request-id` enviado, `WithDisableRetry` |
| `resilience` | `CatalogReader` falso + relógio/sleep injetáveis: retry só em `Unavailable`/`Timeout`, sem retry sem orçamento, backoff dentro dos limites; breaker abre com 5 seguidas e com 60%/10, fecha após half-open, `NotFound`/`InvalidArgument`/`Canceled`/`Internal` não contam |
| `cache` (lógica) | `Store` falso + relógio: hit, miss, stale com breaker aberto, stale com `Upstream`, sem stale em `NotFound`, `q` não vazio em bypass, envelope inválido = miss, Redis com erro = miss, chave igual para parâmetros equivalentes (`state=sp` e `state=SP`) |
| `cache` (singleflight) | Concorrência: N chamadores → 1 chamada ao catalog; **o primeiro chamador cancela e o segundo ainda recebe o dado** (obrigatório); orçamento expirado com candidato → stale |
| `cache` (Redis) | Testcontainers com Redis real: get/set, TTL aplicado, Redis derrubado no meio do teste |
| `media` | Chave vazia → null; `..` e caracteres inválidos → null; base com e sem `/` final |
| `http` | `httptest`: cada endpoint, cada código de erro, `Cache-Control`/`X-Cache`, 404 de rota e 405 com `Allow` em problem+json, nenhuma resposta de erro contém texto interno (catalog falso devolvendo mensagem "secreta") |
| `middleware` | Panic → 500 limpo; request_id válido aceito e inválido trocado; XFF forjado sem proxy confiável não burla; com proxy confiável usa a entrada mais à direita não confiável; rate limit com relógio controlado; teto de IPs despeja o mais ocioso |
| Contrato | Pilha HTTP completa + `CatalogReader` falso; cada resposta (200 dos 3 endpoints, 400, 404, 404 de rota, 405, 429, 503, 500) validada contra `openapi.yaml` com `kin-openapi` (`openapi3filter.ValidateResponse`); o próprio `openapi.yaml` validado; falha se uma rota registrada não existir no `openapi.yaml` |
| `config` | Padrões, obrigatórias, valores inválidos, mensagem com o nome e sem o valor |
| e2e | BFF + catalog real + Postgres via testcontainers (imagem do catalog construída de `PASSARIM_CATALOG_DIR`, padrão `../passarim-catalog`), com seed: lista, detalhe, 404. Build tag `e2e`, `make e2e`, **só local** (§12) |
| Compose | Roteiro manual (§14) |

`openapi.yaml` em OpenAPI **3.0.3**, com `nullable: true` nos campos anuláveis — **decisão do redator**, porque o suporte do `kin-openapi` à 3.0 é o mais maduro.

---

## 12. CI do `passarim-bff`

GitHub Actions em PR e push na `main`: `golangci-lint`, `go test ./...` (unitários, bufconn, contrato e Redis via testcontainers), `gosec`, `govulncheck`, build da imagem + Trivy (falha em alta/crítica), gitleaks. O teste e2e com catalog real **não roda no CI do BFF**: o catalog só existe como `build: ../passarim-catalog` e seu `internal/` não é importável; ele roda localmente (`make e2e`). Um job no `passarim-docs` com checkout dos repositórios vizinhos fica no backlog (§15).

---

## 13. Fatiamento em tarefas

Cada tarefa é um commit, em TDD, com testes verdes ao final.

| # | Repositório | Entrega |
|---|---|---|
| 1 | `passarim-bff` | Esqueleto (`go.mod`, `Makefile`, `.golangci.yml`, CI mínimo com lint e testes), `config`, `domain` (tipos, biomas, UFs, `ListQuery`, `Kind` e tabela de classificação), porta `CatalogReader` |
| 2 | `passarim-bff` | Casos de uso `ListSpecies`, `GetSpecies`, `ListFilters` com validação e orçamento |
| 3 | `passarim-bff` | `grpcclient`: mapeamento proto→domínio, código gRPC→`Kind`, interceptor de `x-request-id`, credenciais TLS opcionais, `WithDisableRetry`; testes com bufconn |
| 4 | `passarim-bff` | Camada HTTP: rotas, DTOs, rótulos PT, `adapter/media`, problem+json, erro→HTTP, `reqmeta`, `Cache-Control`/`X-Cache`, 404/405 |
| 5 | `passarim-bff` | Middlewares: recovery, request_id, log de acesso, headers, limites, IP real, rate limit com LRU |
| 6 | `passarim-bff` | Decorators: retry/timeout, breaker, cache (envelope, chaves, singleflight, `Store` Redis com testcontainers); interface de métricas injetada com no-op |
| 7 | `passarim-bff` | `openapi.yaml` + teste de contrato |
| 8 | `passarim-bff` | Registry Prometheus e implementação das interfaces de métricas, métricas HTTP, servidor de métricas em porta separada, tracing OTel, `/healthz`, `/readyz`, sequência de shutdown, subcomando `healthcheck` |
| 9a | `passarim-bff` | `cmd/bff/main.go` montando tudo; `Dockerfile` multi-stage com distroless `nonroot` (`EXPOSE 8080 9091`) |
| 9b | `passarim-docs` | Compose (`bff-1`, `bff-2`, `x-bff`, ipam e IP fixo do Traefik, Redis com `maxmemory`), labels do Traefik, job `bff` no Prometheus, dashboard Grafana provisionado |
| 10 | ambos | e2e com build tag (BFF), CI completo do BFF (gosec, govulncheck, Trivy, gitleaks), README do BFF com Mermaid e a janela de mídia (§5.8), ADRs 0015 e 0016 (`passarim-docs`), roteiro do `docker stop` no README do `passarim-docs` |

---

## 14. ADRs a criar (`passarim-docs/docs/adr/`)

- **ADR-0015 — Rate limit em memória por réplica**: token bucket por IP no BFF; limite efetivo por réplica (~2× com 2 réplicas); IP real só via proxy confiável, entrada mais à direita; alternativa descartada: Redis compartilhado (dependência no caminho de cada requisição).
- **ADR-0016 — Cache com envelope e stale-while-error**: envelope `{storedAt, data}`, frescor em código (10 min) e TTL longo no Redis (24 h); classificação de erros que libera stale; `/readyz` independente do catalog para o stale poder ser servido; lista com busca fora do cache; janela de URLs de mídia quebradas.

---

## 15. Pendências para o `BACKLOG.md`

Quem chamou esta spec atualiza o `BACKLOG.md`; a lista abaixo é o que deve entrar.

- **P2** — HSTS no BFF quando houver TLS (deploy, Etapa 4).
- **P2** — Configurar `CLIENT_IP_HEADER` e `TRUSTED_PROXIES` para o proxy do Fly.io no deploy.
- **P3** — Chip de dieta rotulado: exige campo novo (enum ou lista de categorias) no `catalog.proto`; hoje `diet` é texto livre.
- **P3** — Tracing OpenTelemetry dentro do catalog.
- **P3** — Job no CI do `passarim-docs` com checkout dos repositórios vizinhos para rodar o e2e BFF + catalog real.
- **P3** — Rate limit: agrupar IPv6 por prefixo /64 (hoje cada endereço é um balde).
- **P3** — Worker: atrasar o `removeOrphans` (ou manter a versão anterior por um tempo) para fechar a janela de URLs de mídia quebradas (§5.8).

(O mTLS BFF ↔ catalog já está no backlog como P2.)

---

## 16. Riscos e itens a validar na implementação

Riscos:

- Configuração do `kin-openapi` (versão 3.0.3, validação de `problem+json` e de `nullable`).
- Lentidão dos testes com testcontainers (Redis no CI; Postgres e catalog no e2e local).
- A subnet `172.30.0.0/24` pode colidir com uma rede existente na máquina do usuário; nesse caso troca-se a subnet, o IP do Traefik e `TRUSTED_PROXIES` juntos.
- O IP real atrás do Traefik precisa ser conferido no compose (log de acesso mostrando o IP esperado).

A validar na implementação (não verificados na revisão):

- O filer do SeaweedFS (porta 8888) serve `/buckets/passarim-media/<chave>` sem autenticação e com `Content-Type` correto para `.webp` e `.aac`.
- O merge de services do Traefik v3.5 com o provider docker (duas réplicas com labels idênticas viram um service com dois servidores) e se o Traefik descarta por padrão o `X-Forwarded-For` enviado pelo cliente e acrescenta o IP da conexão.
- Se o provider docker do Traefik ignora containers com healthcheck do Docker diferente de `healthy` (afeta o tempo até uma réplica nova entrar no balanceamento).
- Detalhes de `kin-openapi`, da configuração do OTel e do conteúdo do dashboard Grafana.

---

## 17. Critério de pronto

1. `cp .env.example .env && docker compose up -d --wait` no `passarim-docs` sobe tudo, com `bff-1` e `bff-2` saudáveis.
2. `curl -i localhost:${HOST_PORT_TRAEFIK_HTTP}/v1/species/turdus-rufiventris` (8080 no `.env.example`) devolve 200 com `X-Cache`, `X-Request-Id`, `Cache-Control: public, max-age=60`, e as URLs de mídia da resposta abrem (`curl -I` → 200).
3. `curl -i localhost:${HOST_PORT_TRAEFIK_HTTP}/v1/species/nao-existe` devolve 404 `application/problem+json` com `SPECIES_NOT_FOUND`.
4. Com um laço de requisições rodando, `docker compose stop bff-1`: as requisições continuam com 200, sem erros durante a troca (é o que a sequência de shutdown da §6 garante).
5. Com o catalog parado (`docker compose stop catalog-api`): detalhe já em cache volta 200 com `X-Cache: stale`; espécie nunca consultada volta 503 `SERVICE_UNAVAILABLE` em problem+json (não o 503 do Traefik).
6. O dashboard do Grafana mostra o tráfego, o cache hit ratio e o estado do breaker; o Jaeger mostra traces do `passarim-bff` com os spans gRPC.
7. CI do `passarim-bff` verde (lint, testes, contrato, gosec, govulncheck, Trivy, gitleaks); ADRs 0015 e 0016 publicados; READMEs atualizados.
