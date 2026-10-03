# Backlog do Passarim

Pendências conhecidas, vindas das revisões de código de cada etapa. Marque com `[x]` ao concluir e cite o commit.

Prioridade: **P1** = resolver antes de publicar o app nas lojas · **P2** = antes do deploy (Etapa 6) · **P3** = melhoria.

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

- [ ] **P2** — Validar `PageURL`/`SourceURL` vindos das fontes (só `https` e hosts esperados) antes de gravar como link de crédito (API10).
- [ ] **P2** — ffmpeg decide o formato da entrada sozinho: passar `-protocol_whitelist pipe` e `-f` explícito (mp3/wav, image2pipe) como defesa em profundidade.
- [ ] **P2** — Chave do xeno-canto pode vazar no `Referer` se a API redirecionar: `CheckRedirect` só para o mesmo host.
- [ ] **P3** — `safehttp`: bloquear também 100.64.0.0/10 (CGNAT), 0.0.0.0/8, 192.0.0.0/24, 198.18.0.0/15 e NAT64.
- [ ] **P3** — Fallback de áudio tenta até 50 candidatas sem limiter nos downloads: limitar a ~3 tentativas e aplicar o rate limit.
- [ ] **P3** — Worker sem log por job (`job_id`, `source`, erro); erros de `Complete`/`Fail` são descartados.
- [ ] **P3** — `Height` da foto large é calculado, não lido da saída do ffmpeg (erro de até 2 px).
- [ ] **P3** — `NextAttemptDelay` com `attempt` negativo dá panic; ordem do erro de variável faltante em `LoadWorker` é aleatória.
- [ ] **P3** — Timeout de 2 min vale por lote: lotes lentos (WAV grande) podem cortar jobs no meio. Considerar timeout por job.

- [ ] **P2** — mTLS entre BFF e catalog (spec §9, API2). Decidido na Etapa 3: o BFF aceita credenciais TLS por configuração, mas roda sem mTLS no ambiente local. Falta gerar a CA e os certificados, ligar TLS no servidor gRPC do catalog e exigir certificado do cliente. Fazer junto do deploy (Etapa 6), antes de publicar.

## passarim-bff (Etapa 3)

- [ ] **P2** — HSTS no BFF quando houver TLS (deploy, Etapa 6).
- [ ] **P2** — Configurar `CLIENT_IP_HEADER` e `TRUSTED_PROXIES` para o proxy do Fly.io no deploy.
- [ ] **P3** — Chip de dieta rotulado: exige campo novo (enum ou lista de categorias) no `catalog.proto`; hoje `diet` é texto livre.
- [ ] **P3** — Tracing OpenTelemetry dentro do catalog (hoje o trace mostra só o BFF e a chamada gRPC).
- [ ] **P3** — Job no CI do `passarim-docs` com checkout dos repositórios vizinhos para rodar o e2e BFF + catalog real.
- [ ] **P3** — Rate limit: agrupar IPv6 por prefixo /64 (hoje cada endereço é um balde).
- [ ] **P3** — Worker: atrasar o `removeOrphans` (ou manter a versão anterior por um tempo) para fechar a janela de URLs de mídia quebradas.
- [ ] **P3** — Cache: um `panic` dentro do singleflight derruba o processo (o x/sync repropaga em goroutine); recuperar dentro da função do voo e devolver `KindInternal`.
- [ ] **P3** — Cache: cursores forjados (JSON base64url aceito pelo catalog) criam chaves de lista no Redis; fazer bypass/TTL curto para páginas com cursor ou assinar o cursor.
- [ ] **P3** — `AccessLog`: registrar também os 500 vindos de `panic` (hoje não entram em `bff_http_requests_total`).
- [ ] **P3** — Config: rejeitar `NaN` e `Inf` em `RATE_LIMIT_RPS`.
- [ ] **P3** — `main`: um segundo SIGINT/SIGTERM durante o shutdown deveria forçar a saída (chamar `stop()` logo após o primeiro sinal).
- [ ] **P3** — Logs: incluir `request_id` no erro de gravação do Redis e logar WARN ao servir stale por orçamento estourado.
- [ ] **P3** — Dashboard Grafana: filtrar `route=~"GET /v1.*"` nos painéis de requisições e latência (sondas de /readyz e /healthz dominam em sistema parado).
- [ ] **P3** — Ao final do projeto: publicar o Swagger UI (`docs/swagger.html`, gerado por `make swagger`) no GitHub Pages do `passarim-bff`, com um passo no CI que regenera a página a partir do `openapi.yaml`.

## passarim-docs / infraestrutura

- [ ] **P3** — Compose sem valores padrão nem `${VAR:?}`: sem `.env`, sobe com portas aleatórias e senha vazia.
- [ ] **P3** — `.gitignore` cobre só `.env` (incluir `.env.*` e `!.env.example`).
- [ ] **P3** — Comentar que o navegador de arquivos do SeaweedFS (porta 8888) não tem autenticação (só aceita localhost).
- [ ] **P3** — Fixar as versões do `mermaid-cli` e do `markdownlint-cli2` no CI.
- [ ] **P3** — Textos dos ADRs começam com letra minúscula.
- [ ] **P3** — Dependabot e SBOM previstos na spec (§9) ainda não configurados.

## passarim-proto

- [ ] **P3** — Validar no CI o diagrama Mermaid do README.
