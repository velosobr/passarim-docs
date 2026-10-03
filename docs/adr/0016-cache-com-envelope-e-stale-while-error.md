# ADR-0016: Cache com envelope e stale-while-error

- **Status:** Aceita
- **Data:** 2026-10-03

## Contexto

O app precisa continuar funcionando quando o catalog ou o banco caem. O cache Redis do BFF deve
poupar o catalog e, na falha, servir o dado velho em vez de um erro.

## Decisão

O Redis guarda um envelope `{storedAt, data}`. O frescor (10 min) é decidido em código comparando
`storedAt`; o TTL no Redis é longo (24 h) e é a janela em que o dado velho ainda pode ser servido.
A classificação de erros é única (`domain/errors.go`): `Unavailable`, `Timeout`, `Upstream` (inclui o
`INTERNAL` que o catalog devolve quando o Postgres cai) e `CircuitOpen` liberam o stale;
`NotFound`, `InvalidArgument` e `Canceled` nunca. O `/readyz` não depende do catalog, senão as
réplicas sairiam do balanceador e o stale nunca seria servido. Listas com busca (`q`) ficam fora
do cache (cardinalidade ilimitada). O singleflight roda com `context.WithoutCancel` e os chamadores
esperam com `DoChan`, para o cancelamento de um não afetar os outros.

## Consequências

- Resposta stale é sinalizada em `X-Cache: stale`, no log e na métrica.
- Há uma janela conhecida de URLs de mídia quebradas: o worker apaga objetos antigos quando troca a
  mídia (`removeOrphans`), e o BFF pode servir a URL velha por ~10 min de frescor + 60 s de
  `max-age`, ou enquanto servir stale. Aceito no MVP (melhoria no backlog).
- Mudar o formato do envelope exige subir a versão do prefixo da chave (`bff:v1:`).
