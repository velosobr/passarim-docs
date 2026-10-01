# ADR-0013: Mídia — uma linha por arquivo, com colunas por variante

- **Status:** Aceita
- **Data:** 2026-10-01

## Contexto

A §4 da spec descrevia a tabela `media` com uma linha por VARIANTE
(`storage_key` + `variant` ∈ {thumb, medium, large, aac}), ou seja: uma foto
em 3 tamanhos viraria 3 linhas. O `passarim-catalog` foi implementado de
forma diferente: cada FOTO é uma linha só, com três colunas de chave
(`thumb_key`, `medium_key`, `large_key`) mais `width`/`height` (do tamanho
"large"); e cada ÁUDIO é outra linha, com `audio_key` e `duration_ms`. A
coluna `kind` (`photo`/`audio`) distingue as duas formas. Além disso, a
tabela não tinha nenhuma restrição (constraint) impedindo duas linhas com o
mesmo `(species_id, kind, position)` — ou seja, nada impedia o worker gravar
a mesma posição duas vezes (ex.: reprocessamento duplicado), criando uma
"foto 0" fantasma.

A revisão final da Etapa 2a apontou essa divergência entre o código e a
spec, e a falta de uma chave natural na tabela.

## Decisão

Mantemos o desenho atual (coluna-por-variante, uma linha por arquivo de
mídia) em vez de voltar para uma linha por variante: ele evita duplicar
`author`/`license`/`source`/`source_url` três vezes por foto (os três
tamanhos de uma mesma foto têm sempre o mesmo crédito) e casa com o jeito
que o domínio (`domain.Photo`, `domain.Audio`) e o proto (`Photo`, `Audio`)
já modelam uma foto/canto como UM objeto com vários tamanhos/chaves.

Para suprir a falta de chave natural, adicionamos uma constraint
`UNIQUE (species_id, kind, position)`: a posição de exibição já é o que
distingue as mídias de uma mesma espécie e do mesmo tipo (ex.: foto 0 é a
capa, foto 1 é a segunda da galeria), então ela é a chave natural correta.

## Consequências

- O banco agora recusa (`23505 unique_violation`) uma segunda linha com o
  mesmo `(species_id, kind, position)`, em vez de permitir duplicatas
  silenciosas — migração `0002` no `passarim-catalog`, com índice único
  substituindo o índice comum que já existia em `(species_id, kind,
  position)`.
- A spec (§4) passa a descrever as colunas reais da tabela `media`
  (`thumb_key`, `medium_key`, `large_key`, `audio_key`, `width`, `height`,
  `duration_ms`, `credits`) em vez do desenho antigo de uma linha por
  variante, referenciando esta ADR.
- Quem for escrever no worker (Etapa 2b) precisa fazer UPSERT por
  `(species_id, kind, position)` (ou tratar o erro de unicidade), e não um
  INSERT simples.
