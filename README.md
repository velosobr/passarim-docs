# 🐦 Passarim

App gratuito para conhecer as aves do Brasil — foto, descrição, curiosidades,
onde encontrar e o canto de cada espécie. Projeto de **estudo e portfólio**:
back-end em **Go** com arquitetura limpa e app em **Kotlin Multiplatform**.

> Todo o código é comentado para que um estudante consiga ler e entender.

## System design

```mermaid
flowchart LR
    subgraph Celular
        App[App KMP<br/>Android / iOS]
    end
    subgraph Borda
        LB[Traefik<br/>load balancer]
        CDN[CDN]
    end
    subgraph BFF["passarim-bff (Go)"]
        BFF1[BFF réplica 1]
        BFF2[BFF réplica 2]
        Redis[(Redis<br/>cache)]
    end
    subgraph Catalog["passarim-catalog (Go) — rede privada"]
        CAT[Catalog API<br/>gRPC]
        W[Worker de ingestão]
        PG[(PostgreSQL)]
        S3[(Object storage<br/>SeaweedFS / R2)]
    end
    subgraph Externo["Fontes externas"]
        EXT[Wikipedia · Wikidata<br/>iNaturalist · GBIF<br/>xeno-canto · CBRO]
    end

    App -- REST/JSON HTTPS --> LB
    LB --> BFF1 & BFF2
    BFF1 & BFF2 --> Redis
    BFF1 & BFF2 -- gRPC + mTLS --> CAT
    CAT --> PG
    W --> PG
    W --> S3
    W -- busca periódica --> EXT
    App -- fotos e cantos --> CDN --> S3
```

### Como uma tela é carregada

```mermaid
sequenceDiagram
    participant A as App
    participant L as Traefik
    participant B as BFF
    participant R as Redis
    participant C as Catalog
    A->>L: GET /v1/species/{id}
    L->>B: encaminha para uma réplica saudável
    B->>R: tem no cache?
    alt cache hit
        R-->>B: detalhe
    else cache miss
        B->>C: gRPC GetSpecies (timeout 2s, retry, circuit breaker)
        C-->>B: Species
        B->>R: guarda por 10 min
    end
    B-->>A: JSON pronto para a tela (URLs da CDN montadas)
```

## Repositórios

| Repositório | Papel |
|---|---|
| [passarim-docs](https://github.com/velosobr/passarim-docs) | Este: arquitetura, ADRs, segurança, `docker-compose` |
| [passarim-proto](https://github.com/velosobr/passarim-proto) | Contratos gRPC |
| [passarim-catalog](https://github.com/velosobr/passarim-catalog) | Catalog API (gRPC) + banco + aves curadas |
| passarim-bff | BFF REST + cache *(etapa 3)* |
| passarim-app | App KMP *(etapa 6)* |

## Rodando a infraestrutura local

Pré-requisito: Docker, e os repositórios `passarim-docs` e `passarim-catalog` clonados lado a lado na mesma pasta.

```bash
cp .env.example .env
docker compose up -d --wait
```

| Serviço | Endereço |
|---|---|
| Traefik (dashboard) | <http://localhost:8081> |
| Grafana | <http://localhost:3000> (admin / ver `.env`) |
| Prometheus | <http://localhost:9090> |
| Jaeger | <http://localhost:16686> |
| Object storage (arquivos) | <http://localhost:8888> |

## Documentação

- [Decisões de arquitetura (ADRs)](docs/adr/)
- [Modelo de ameaças](docs/security/threat-model.md)
- [Spec de design](docs/superpowers/specs/2026-10-01-passarim-design.md)
- [Revisão do protótipo](docs/design/revisao-design-v1.md)
