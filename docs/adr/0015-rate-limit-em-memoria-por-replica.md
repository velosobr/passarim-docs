# ADR-0015: Rate limit em memória, por réplica

- **Status:** Aceita
- **Data:** 2026-10-03

## Contexto

O BFF precisa limitar requisições por IP (OWASP API4). Com duas réplicas atrás do Traefik, o limite
poderia ficar no Traefik, no BFF em memória ou no BFF compartilhado via Redis.

## Decisão

Token bucket por IP, em memória, dentro de cada réplica do BFF (`golang.org/x/time/rate`), com
teto de IPs rastreados e despejo do mais ocioso. O 429 sai em `problem+json` com `Retry-After`.
O IP do cliente só vem de `X-Forwarded-For` quando a conexão é de um proxy confiável (IP fixo do
Traefik), lendo da direita para a esquerda; nunca a primeira entrada. Alternativa descartada: Redis
compartilhado, porque poria uma dependência no caminho de CADA requisição.

## Consequências

- O limite efetivo é por réplica: com 2 réplicas e round-robin, um IP consegue até ~2× o limite.
- Funciona igual em qualquer ambiente (o limite no Traefik não existiria no proxy do Fly.io).
- Localmente, clientes do host chegam ao Traefik com o IP do gateway do Docker e dividem o mesmo balde.
- Cada IPv6 conta como um balde (agrupar por /64 está no backlog).
