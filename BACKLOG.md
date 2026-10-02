# Backlog do Passarim

Pendências conhecidas, vindas das revisões de código de cada etapa. Marque com `[x]` ao concluir e cite o commit.

Prioridade: **P1** = resolver antes de publicar o app nas lojas · **P2** = antes do deploy (Etapa 4) · **P3** = melhoria.

## Conteúdo curado (`passarim-catalog/content/species`)

- [ ] **P1** — `amazona-aestiva.yaml`: reescrever com palavras próprias as curiosidades 1 e 2 (hoje quase iguais ao texto do WikiAves).
- [ ] **P1** — `amazona-aestiva.yaml`: remover o bioma `pantanal` (a fonte não o cita) e avaliar `mata_atlantica` (a fonte cita RJ e SC).
- [ ] **P1** — `paroaria-coronata.yaml`: reescrever a descrição e a curiosidade 2 (trechos copiados do WikiAves).
- [ ] **P1** — Conferir uma a uma as 29 aves ainda não revisadas contra as fontes citadas (2 de 4 da última amostra tinham erro). Usar o WikiAves como fonte de distribuição.
- [ ] **P3** — Biomas e estados mais estreitos que o real em algumas espécies (Pitangus, Cariama, Columbina, Tigrisoma, Megaceryle, Tyrannus, curicaca sem `cerrado`/`pampa`). A importação de ocorrências (Etapa 2b) deve ajudar.
- [ ] **P3** — `eurypyga-helias.yaml`: o bioma `caatinga` foi deduzido de PI/MA, que têm mais de um bioma.

## passarim-catalog

- [ ] **P2** — `Migrate` só aceita `postgres://`. O Neon usa `postgresql://`, então é preciso aceitar os dois.
- [ ] **P2** — Atualizar o `google.golang.org/grpc` da pseudo-versão para a v1.85.0 estável quando ela sair (correção do GO-2026-6443).
- [ ] **P2** — Adicionar interceptor de *recovery* no gRPC (hoje um *panic* derruba o processo).
- [ ] **P3** — O seed não remove espécies que saíram do YAML. Documentar ou "des-curar" essas espécies, já que apagar removeria também a mídia do worker.
- [ ] **P3** — O carregador de YAML não garante "nome do arquivo = id" nem ids únicos.
- [ ] **P3** — Não registrar em log as chamadas de `grpc.health.v1.Health` (hoje gera uma linha a cada 5 s).
- [ ] **P3** — Servidor de métricas: adicionar `ReadTimeout`, `WriteTimeout` e `IdleTimeout`.
- [ ] **P3** — Comentário desatualizado em `config.go` cita `/healthz`, que não existe.
- [ ] **P3** — `GetSpecies` faz 6 leituras fora de uma transação. Limitar também o tamanho do `id`.
- [ ] **P3** — Healthcheck assume `GRPC_ADDR` no formato `:porta`.
- [ ] **P3** — `WaitForDB` espera mais um intervalo depois da última tentativa.

## passarim-docs / infraestrutura

- [ ] **P3** — Compose sem valores padrão nem `${VAR:?}`: sem `.env`, sobe com portas aleatórias e senha vazia.
- [ ] **P3** — `.gitignore` cobre só `.env` (incluir `.env.*` e `!.env.example`).
- [ ] **P3** — Comentar que o navegador de arquivos do SeaweedFS (porta 8888) não tem autenticação (só aceita localhost).
- [ ] **P3** — Fixar as versões do `mermaid-cli` e do `markdownlint-cli2` no CI.
- [ ] **P3** — Textos dos ADRs começam com letra minúscula.
- [ ] **P3** — Dependabot e SBOM previstos na spec (§9) ainda não configurados.

## passarim-proto

- [ ] **P3** — Validar no CI o diagrama Mermaid do README.
