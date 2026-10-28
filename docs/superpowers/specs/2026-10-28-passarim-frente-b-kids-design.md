# Passarim — Frente B: conteúdo Kids, "Ave do dia" e forma de onda

Data: 2026-10-28 · Origem: PRD da guinada (`2026-10-16-passarim-guinada-prd.md`), seção 6, frente B, com a subseção "Crescimento do catálogo" (docs #18) · Regra de comentários: `~/dev/passarim/CLAUDE.md` (todo código novo com comentários didáticos) · Depende de: frente A3 mergeada (catalog #5 a #8, curador #5, docs #16)

Decisões do redator estão marcadas com **[DR]** e listadas na seção 13. Onde esta spec corrige o PRD, a seção 12 diz o quê e por quê. As seções 5 e 7 foram decididas por um agente que representou o dono, a pedido dele; os ajustes que esse agente fez estão marcados com **[R]**.

## 1. Objetivo

A frente B entrega os **dados** que as jornadas E (adulta) e F (Kids) vão usar no app:

- um **conteúdo Kids** para cada espécie, gerado por IA a partir do texto adulto curado e revisado por uma pessoa no PR;
- o **bioma principal** de cada espécie, que é o "mundo" dela no Kids;
- a **"Ave do dia"**, a mesma nas duas jornadas, estável o dia todo e em rodízio sem repetição;
- os **64 picos do canto**, para o player desenhar a forma de onda real.

O app não muda nesta frente.

**Princípio de escala:** as 41 espécies são o tamanho do MVP, e o catálogo vai crescer (o roadmap v2 fala em ~1.970). **Nada aqui depende de haver 41 espécies.** Elas aparecem só no "Pronto quando".

### Pronto quando

1. As 41 espécies do MVP têm `primary_biome` e o bloco `kids:` revisado pelo dono no PR de conteúdo.
2. O lint do conteúdo passa.
3. `/v1/featured` devolve a mesma ave o dia todo, troca à meia-noite de São Paulo e não repete ave até o ciclo acabar.
4. A lista de espécies filtra por `primary_biome`, e a contagem por mundo de `/v1/filters` bate com a lista **[R]**.
5. Depois da reingestão dos cantos (`requeue --source audio`), toda ave com canto tem `peaks`.

## 2. Decisões do dono

| Tema | Decisão |
|---|---|
| Temas sensíveis | **Suavizar sem esconder.** Predação, carniça, tráfico e extinção ficam, em linguagem gentil. Saem sangue, doença, detalhe de morte e números de aves mortas (seção 3.4) |
| Tamanho do texto | Descrição de 2 a 4 frases; cada fato e o "Você sabia?" com 1 frase; toda frase com **no máximo 15 palavras**; um fato Kids por fato adulto que couber |
| Modelo do kidsgen | `claude-opus-5-5` |
| Bioma principal | **Escolhido pelo kidsgen**, restrito aos `biomes` da ave, com uma justificativa que aparece só no terminal |
| "Ave do dia" | Tabela por dia (`featured_day`), com **rodízio sem repetição** |
| Crescimento | O catálogo vai crescer depois do MVP. O lint valida o bloco `kids:` quando ele existe, sem exigi-lo; o kidsgen roda por lote |
| Seções 3 e 4 | Aprovadas pelo dono, com um ajuste do redator na seção 4 (áudio curto demais) **[DR]** |
| Seções 5 e 7 | Decididas pelo representante do dono, com os ajustes **[R]** |

## 3. Conteúdo (`passarim-catalog/content`)

### 3.1 YAML

Duas chaves novas, as duas opcionais:

```yaml
biomes: [mata_atlantica, cerrado, caatinga, pantanal, pampa]
primary_biome: mata_atlantica        # logo depois de biomes
# ... o resto do arquivo, como hoje ...
kids:                                # sempre no fim do arquivo
  description: >
    O sabiá-laranjeira tem a barriga cor de laranja. Ele vive em quintais,
    parques e matas. Gosta de procurar minhocas no chão.
  facts:
    - text: Em 2002 o sabiá virou a ave símbolo do Brasil.
      source_fact: 0
    - text: O canto dele pode durar até dois minutos sem parar.
      source_fact: 1
  did_you_know: O sabiá consegue imitar o canto de outras aves.
  generated_by: claude-opus-5-5
  source_hash: sha256:3f5c…
```

- **`source_fact`:** a posição, começando em 0, do fato adulto de onde o fato Kids saiu.
- **`generated_by`:** o id exato do modelo.
- **`source_hash`:** o SHA-256, em hexadecimal com o prefixo `sha256:`, de um texto canônico com três partes separadas por `\n`:
  1. a descrição adulta com os espaços em branco colapsados em um só e aparada;
  2. os textos dos fatos adultos, na ordem, cada um normalizado do mesmo jeito e separados por `\n`;
  3. a lista `biomes` em ordem alfabética, separada por vírgulas.

  Mudar a descrição, um fato ou os biomas invalida o hash, e o lint pede uma nova geração. Mudar só a fonte (`source`), o tamanho ou as UFs não invalida.

Todos os YAMLs de hoje usam `biomes` em uma linha (`[...]`). O kidsgen exige esse formato e falha com uma mensagem clara se encontrar outro.

### 3.2 Validador

Um pacote só, `internal/kidscontent`, usado pelo lint do conteúdo e pelo kidsgen, para os dois nunca discordarem.

- **Sem bloco `kids:`:** nada é validado, além da regra do loader: o `primary_biome`, quando existe, tem que estar nos `biomes` **[R]**.
- **Com bloco `kids:`:** todas as chaves do bloco são obrigatórias e o `primary_biome` também, porque os dois nascem juntos no kidsgen.
- **Bioma:** `primary_biome` ∈ `biomes`.
- **Hash:** `source_hash` igual ao calculado sobre o texto adulto atual.
- **Fatos:** de 1 até o número de fatos adultos; cada `source_fact` é um índice válido e não se repete.
- **Frases:**
  - uma frase termina em `.`, `!` ou `?` seguido de espaço ou do fim do texto;
  - a descrição tem de 2 a 4 frases; cada fato e o `did_you_know` têm exatamente 1;
  - toda frase tem no máximo 15 palavras. Uma palavra é um trecho entre espaços que tem pelo menos uma letra ou um algarismo, então "tico-tico" conta como uma e um travessão solto não conta.
- **Números** (seção 3.3).
- **Palavras proibidas:** `sangue`, `ensanguentad`, `doença`, `doente`, `cadáver`, `carcaça`, `abate`, `matança`, comparadas sem acento e sem diferença de maiúsculas, pelo começo da palavra. A lista é curta de propósito: o resto da suavização fica com o prompt e com a revisão humana.

Cada erro diz a espécie, o campo e o motivo, por exemplo: `turdus-rufiventris: kids.facts[1]: frase com 17 palavras (máximo 15)`.

### 3.3 Regra dos números

Todo número do texto Kids tem que aparecer no texto adulto (descrição e fatos). O objetivo é a IA não inventar quantidades.

- **O que conta como número:** algarismos, com `.` e `,` como separadores (`2.000`, `1,5`), e números por extenso em português (`dois`, `vinte e cinco`, `dois mil`, `cem`, `meio`).
- **Normalização:** um número por extenso vira o valor dele. `vinte e cinco` vira 25; `dois mil` vira 2000; `dois milhões` vira 2000000. O parser cobre de zero a milhões, com "e" entre as partes.
- **`um` e `uma` não contam,** porque quase sempre são artigos ("uma ave"). Por isso o prompt pede que o Kids nunca escreva o número 1 em algarismo.
- **A comparação é por valor:** "2 minutos" no Kids casa com "dois minutos" no adulto, e "dois mil" casa com "2.000".
- **Os anos contam como números:** "2002" no Kids exige "2002" no adulto.
- Os casos de teste do parser ficam num golden file (seção 9).

### 3.4 Temas sensíveis

O prompt traz esta tabela, e a revisão humana confere:

| Tema no texto adulto | Como fica no Kids | O que sai |
|---|---|---|
| Predação ("preda macacos e preguiças") | "Caça outros bichos para comer" ou o nome do bicho sem detalhe | Como a presa morre |
| Carniça ("alimenta-se de carcaças") | "Come animais que já morreram e ajuda a limpar a natureza" | "Carcaça", "podre" |
| Tráfico ("vítima do tráfico de animais") | "Pessoas tiram essas aves da natureza, e isso é proibido" | Detalhe de como, e números de aves apreendidas ou mortas |
| Extinção e ameaça | "Restam poucas, e muita gente trabalha para protegê-las" | Tom de desesperança |
| Doença, ferimento, morte de filhotes | Omitido | Tudo |
| Caça humana | "Por muito tempo, pessoas caçaram essa ave" | Detalhe |

### 3.5 `cmd/kidsgen`

Um programa Go no `passarim-catalog`, rodado à mão por quem cuida do conteúdo. Ele usa o SDK oficial da Anthropic para Go.

**Uso:**

```bash
ANTHROPIC_API_KEY=... go run ./cmd/kidsgen --missing            # sem bloco ou com o hash desatualizado
ANTHROPIC_API_KEY=... go run ./cmd/kidsgen --ids turdus-rufiventris,crotophaga-ani
go run ./cmd/kidsgen --ids turdus-rufiventris --dry-run          # mostra o prompt; com chave, mostra a saída sem gravar
```

- **Diretório:** `--dir content/species` por padrão.
- **Entrada do modelo:** só o texto adulto curado (nome popular, descrição, fatos numerados a partir de 0) e a lista `biomes`. Não vão URLs, UFs nem o nome científico.
- **Saída estruturada:** uma ferramenta `write_kids_content` com esquema JSON fixo, forçada com `tool_choice`. Campos: `description`, `facts[{text, source_fact}]`, `did_you_know`, `primary_biome` (enum com os biomas da ave) e `biome_reason` (uma frase).
- **Validação e novas tentativas:** a saída passa pelo validador da seção 3.2. Se ele recusar, o kidsgen manda os erros de volta ao modelo na mesma conversa, até **2 novas tentativas**. Se ainda falhar, pula a espécie, segue para a próxima e lista as puladas no fim, saindo com código 1.
- **Gravação no arquivo:** edição de texto, sem regravar o YAML inteiro. O estilo `>`, a ordem das chaves e os comentários continuam iguais, e o diff fica pequeno.
  - a linha `primary_biome:` é trocada se existir; senão, entra logo depois da linha `biomes:`;
  - o bloco `kids:` é trocado se existir (da linha `kids:` até a próxima chave do topo ou o fim do arquivo); senão, entra no fim;
  - `generated_by` e `source_hash` são preenchidos pelo kidsgen, não pelo modelo.
- **Terminal:** para cada espécie, uma linha `id → primary_biome: <bioma> (<biome_reason>)`. Quem abre o PR de conteúdo cola esse resumo na descrição, para a revisão do bioma.
- **Prompt:** um arquivo `cmd/kidsgen/prompt.md`, embutido com `embed`, com as regras: público de 8 a 12 anos que já lê, não inventar nada, nenhum número que não esteja no texto, a tabela da seção 3.4, os limites de frase, sem nome científico, sem links, tom direto e caloroso sem infantilizar, e o critério do bioma ("o bioma em que a ave é mais típica ou mais lembrada pelos brasileiros").
- **Chave:** só a variável `ANTHROPIC_API_KEY`, na máquina de quem roda. Ela nunca vai para a CI nem para o repositório, e o gitleaks cobre isso. Sem a chave, o kidsgen falha logo no começo, exceto no `--dry-run`, que então só mostra o prompt.
- **Prazo:** 2 min por chamada e uma espécie por vez. Não há paralelismo: a revisão humana é o gargalo, não a geração.

**Custo de uma rodada.** Pelos preços do Opus 5.5 (US$ 4 por milhão de tokens de entrada e US$ 20 por milhão de saída, conferidos em 2026-10-28 em sites de terceiros que citam a página da Anthropic), com cerca de 2.500 tokens de entrada e 800 de saída por espécie e 30% de margem para novas tentativas:

- **41 espécies:** cerca de US$ 1,50;
- **1.970 espécies:** cerca de US$ 70, em lotes.

## 4. Picos do canto

**Cálculo, no worker** (`internal/adapter/media`):

1. O ffmpeg decodifica o **AAC final**, o mesmo arquivo que o app toca, para PCM mono a 8 kHz: `ffmpeg -i pipe:0 -ac 1 -ar 8000 -f s16le pipe:1`. O prazo é o mesmo do `run` atual (60 s).
2. O código Go divide as amostras em **64 janelas iguais** (a última leva o resto). O pico de cada janela é o maior valor absoluto dela.
3. **Normalização:** cada pico é dividido pelo maior dos 64 e arredondado a 3 casas, então a barra mais alta vale 1.
4. **Silêncio total:** 64 zeros, sem divisão por zero.
5. **Menos de 64 amostras** (menos de 8 ms de áudio): picos vazios, sem erro **[DR]**. É uma condição permanente, então gastar tentativas com ela não adianta.

**Banco:** `media.peaks real[] NOT NULL DEFAULT '{}'`, com `CHECK (cardinality(peaks) IN (0, 64))`. Só as linhas de áudio são preenchidas. O `InsertMedia` grava os picos junto, na mesma transação.

**Reprocessar:** o comando `requeue` ganha `--source photos|audio`, com `photos` como padrão, para não quebrar o que o README já documenta. `requeue --source audio` reenfileira os cantos de todas as espécies; com ids, só os delas.

**Proto:** `Audio.peaks` (4), `repeated float`. Um áudio antigo, sem picos, chega com a lista vazia, e o app mostra uma forma genérica.

## 5. Catalog: conteúdo Kids no banco, filtros e "Ave do dia"

### 5.1 Banco (migração 0005)

Uma migração só, com tudo da frente B:

```sql
ALTER TABLE species
    ADD COLUMN primary_biome biome,   -- o ENUM que já existe; NULL = ainda sem bioma principal
    ADD COLUMN kids          jsonb;   -- {description, facts: [{text, source_fact}], did_you_know}; NULL = sem conteúdo Kids

ALTER TABLE media
    ADD COLUMN peaks real[] NOT NULL DEFAULT '{}' CHECK (cardinality(peaks) IN (0, 64));

CREATE TABLE featured_day (
    day        date PRIMARY KEY,
    species_id text NOT NULL REFERENCES species (id) ON DELETE CASCADE,
    cycle      integer NOT NULL CHECK (cycle > 0)
);
CREATE INDEX featured_day_cycle_idx ON featured_day (cycle);
```

- **`primary_biome` usa o tipo `biome`** **[R]**, o mesmo de `species_biome.biome`, e casa com o enum `Biome` do proto. Não há chave estrangeira para `species_biome`, porque o seed grava a espécie antes dos biomas. Quem garante que o bioma principal está entre os da ave é o loader.
- **`generated_by` e `source_hash` ficam só no YAML.** Servem à revisão e ao lint, não ao app.
- **Seed:** o loader lê `primary_biome` e `kids:`; o upsert grava os dois, e uma espécie sem eles grava NULL.

### 5.2 Leitura e filtros

- `Species.kids` (16), `Species.primary_biome` (17) e `SpeciesSummary.primary_biome` (6), do tipo `Biome`.
- `ListSpeciesRequest.kids_only` (6): só as espécies com `kids IS NOT NULL`.
- **`ListSpeciesRequest.primary_biome` (7)** **[R]**: filtra pelo bioma principal; `UNSPECIFIED` quer dizer sem filtro. A tela de mundo do Kids usa esse filtro. O `biome` atual continua filtrando por todos os biomas da ave. Sem o campo novo, o anu-preto apareceria nos 6 mundos, e o álbum, que conta por bioma principal, mostraria outra conta.
- `ListFiltersRequest.kids_only` (1): as contagens por bioma e por UF contam só as espécies com Kids.
- `ListFiltersResponse.primary_biome_counts` (3): contagem por bioma principal. Espécies sem `primary_biome` não contam.

### 5.3 `GetFeaturedSpecies`

**Pedido:** `date` no formato `AAAA-MM-DD`.

- O catalog aceita só **ontem, hoje e amanhã** no fuso `America/Sao_Paulo`, pelo relógio dele. A folga cobre relógios um pouco diferentes entre o BFF e o catalog na virada do dia.
- Fora dessa janela, ou com formato inválido, responde `INVALID_ARGUMENT`. Isso impede gravar dias arbitrários.
- O binário importa `time/tzdata` **[R]**, para o fuso funcionar numa imagem sem o banco de fusos do sistema.

**Elegíveis:** as espécies que têm tudo isto:

- `kids IS NOT NULL`;
- uma foto principal (posição 0) com `category = 'single_bird'` **ou** escolhida pelo override do YAML (`photo_override.primary_photo_id = media.source_photo_id`). O override é a palavra final da frente A, e a foto escolhida por ele guarda a categoria que o curador deu, por isso a cláusula é necessária;
- um canto (linha de áudio com `audio_key` não vazio) **[DR]**. O card adulto tem botão de canto, e num catálogo grande nem toda ave terá canto.

**Escolha do dia D:**

1. **Se já existe uma linha para D,** devolve essa espécie, mesmo que ela tenha deixado de ser elegível depois. É isso que garante a mesma ave o dia todo.
2. **Senão, o rodízio:**
   1. Pega a linha mais recente com `day < D`. Sem nenhuma, o ciclo é 1 e não há "usadas".
   2. Com uma, o ciclo é o dela, e as "usadas" são as espécies das linhas desse ciclo com `day <> D` **[R]**. Contar também os dias depois de D evita repetir uma ave quando amanhã é pedido antes de hoje.
   3. **Restantes** = elegíveis menos usadas, em ordem alfabética de id.
   4. Se não sobra nenhuma, começa um ciclo novo (ciclo + 1) com todas as elegíveis, **menos a ave do dia anterior, se houver mais de uma elegível** **[R]**. Sem isso, a última ave de um ciclo poderia voltar no primeiro dia do seguinte.
   5. A escolhida é `restantes[FNV-1a 64 bits da string da data, módulo o número de restantes]`.
   6. `INSERT … ON CONFLICT (day) DO NOTHING` e relê a linha. Duas réplicas que calculam ao mesmo tempo ficam com a mesma ave.
3. **Sem nenhuma elegível:** `NOT_FOUND`.

**Resposta:** `GetFeaturedSpeciesResponse { SpeciesSummary species = 1; Audio audio = 2; }`. O `audio` fica ausente se a ave não tiver canto, o que só acontece com uma linha antiga, gravada antes de a ave perder o canto.

**Casos aceitos:**

- Uma espécie removida do catálogo apaga as próprias linhas (`ON DELETE CASCADE`). Se era a de hoje, o dia é recalculado na próxima chamada.
- Uma corrida de verdade entre hoje e amanhã, calculados ao mesmo tempo por réplicas com relógios diferentes, pode repetir uma ave nesses dois dias.
- Um `clean-all` apaga a tabela, e o rodízio recomeça do ciclo 1.

**Escala:** uma linha por dia, seja qual for o número de aves. Com N elegíveis, cada ave aparece uma vez a cada N dias.

## 6. Contrato (`passarim-proto`)

Só adições, então o `buf breaking` passa. A tag é `v0.4.0`.

```proto
message KidsFact {
  string text = 1;
  int32 source_fact = 2; // posição do fato adulto de origem, a partir de 0
}

// Conteúdo para crianças. Mensagem própria, sem URL, para nenhum link chegar ao Kids.
message KidsContent {
  string description = 1;
  repeated KidsFact facts = 2;
  string did_you_know = 3;
}

message Audio      { /* ... */ repeated float peaks = 4; }      // 64 valores de 0 a 1, ou vazio
message SpeciesSummary { /* ... */ Biome primary_biome = 6; }
message Species    { /* ... */ KidsContent kids = 16; Biome primary_biome = 17; }
message ListSpeciesRequest { /* ... */ bool kids_only = 6; Biome primary_biome = 7; }
message ListFiltersRequest { bool kids_only = 1; }
message ListFiltersResponse { /* ... */ repeated BiomeCount primary_biome_counts = 3; }

message GetFeaturedSpeciesRequest  { string date = 1; }                  // AAAA-MM-DD, fuso de São Paulo
message GetFeaturedSpeciesResponse { SpeciesSummary species = 1; Audio audio = 2; }

service CatalogService {
  // ...
  rpc GetFeaturedSpecies(GetFeaturedSpeciesRequest) returns (GetFeaturedSpeciesResponse);
}
```

O comentário de cada campo segue o tom didático do `catalog.proto`.

## 7. BFF

**Detalhe, `GET /v1/species/{id}`:**

- ganha `kids { description, facts: [{ text }], didYouKnow }`, sem `source_fact`, que o app não usa;
- ganha `primaryBiome` e `audio.peaks`;
- quando o catalog não manda áudio (mensagem ausente ou `key` vazia), o campo `audio` sai como `null`, nunca como um objeto com URL montada a partir de uma chave vazia **[R]**.

**Lista e filtros:**

- `?audience=adult|kids` em `/v1/species` e `/v1/filters`. O padrão é `adult`; valor inválido devolve 400 problem+json. `kids` vira `kids_only`.
- `?primaryBiome=` em `/v1/species` **[R]**, com os mesmos valores e a mesma validação do `biome`.
- Os resumos da lista ganham `primaryBiome`.
- `/v1/filters` ganha `primaryBiomes`, com as contagens.

**`GET /v1/featured`, novo:**

- a data é calculada pelo relógio do BFF em `America/Sao_Paulo`, com `time/tzdata` embutido;
- resposta `{ date, species: <resumo com URLs da CDN>, audio: <áudio com URL e picos> | null }`;
- `Cache-Control: public, max-age=<segundos até a próxima meia-noite de São Paulo>`, **no mínimo 1** **[R]**;
- erros do catalog **[R]**:

  | Catalog | BFF | Por quê |
  |---|---|---|
  | `NOT_FOUND` | 404 problem+json | Nenhuma ave elegível; o app esconde o card |
  | indisponível, sem nada no cache | 503 problem+json | O app esconde o card |
  | `UNIMPLEMENTED` | 503 problem+json | Catalog voltado para a versão anterior depois do BFF novo |
  | `INVALID_ARGUMENT` | 500 problem+json, com log | Relógios separados por mais de um dia: é bug do servidor, não do app |

**Cache (ADR-0016):**

- o prefixo sobe de `bff:v1:` para `bff:v2:`, porque o formato do conteúdo guardado muda. O v1 serviria detalhe sem `kids` por até 10 min;
- `list:<hash>`: o hash passa a incluir a audiência e o `primaryBiome`;
- `filters:<audiência>`;
- `species:<id>` igual, porque o detalhe é o mesmo nas duas jornadas;
- `featured:<data>`, com o stale-while-error de sempre dentro do dia. A chave muda à meia-noite, então nunca sai a ave de ontem.

**OpenAPI e teste de contrato** atualizados.

## 8. ADR-0022: conteúdo Kids gerado por LLM com revisão humana

- **Decisão:** o texto Kids é gerado pelo `cmd/kidsgen` com um modelo fixado (`claude-opus-5-5`), a partir só do texto adulto curado, validado por regras fixas e revisado por uma pessoa no PR. Nada é gerado em tempo real.
- **Por quê:** escrever à mão um texto Kids para cada espécie não escala para um catálogo de quase 2 mil aves. Gerar a partir do texto adulto já revisado limita o que a IA pode dizer.
- **Garantias:** o validador (origem, hash, frases e números), a tabela de temas sensíveis, a revisão humana e a chave só na máquina de quem roda.
- **Relação com a ADR-0011:** a ADR-0011 adia a **identificação de aves** por IA. Esta ADR trata de **geração de texto** e não revoga nem muda a 0011 **[R]**.

## 9. Testes

**Conteúdo e validador:**

- validador: bloco ausente, chave faltando, bioma fora da lista, hash velho, `source_fact` inválido e repetido, frases de 15 e 16 palavras, palavra com hífen, descrição com 1 e com 5 frases, palavra proibida com e sem acento;
- parser de números com golden file: `dois`, `vinte e cinco`, `dois mil`, `2.000`, `1,5`, `meio`, `uma ave` (não conta), anos;
- `content_test.go` roda o validador em todas as espécies que têm o bloco.

**kidsgen** (a CI nunca chama a API):

- montagem do prompt com golden file;
- troca de texto: sem bloco, com bloco, com `primary_biome` já presente, arquivo terminado sem quebra de linha, `biomes` fora do formato `[...]` (erro);
- novas tentativas com um cliente falso: aceita na segunda, desiste depois da terceira;
- sem chave: falha antes de chamar.

**Picos:** WAV sintético gerado no próprio teste (um tom que cresce e some) comparado com um golden file, com tolerância de 0,01; silêncio; menos de 64 amostras; `CHECK` da migração.

**Catalog:**

- migração 0005 de ida e volta;
- loader e seed com as chaves novas, e `primary_biome` fora de `biomes` recusado;
- `kids_only`, `primary_biome` e as contagens;
- "Ave do dia", com relógio injetado:
  - ciclo completo sem repetição;
  - ciclo novo depois do último, sem repetir a ave de ontem **[R]**;
  - ave nova entra no ciclo atual; ave que perde a elegibilidade deixa de ser escolhida;
  - a mesma ave o dia todo, mesmo depois de ela perder a elegibilidade;
  - "amanhã antes de hoje" sem repetir **[R]**;
  - `NOT_FOUND`, `INVALID_ARGUMENT` fora da janela e com formato errado;
  - duas chamadas concorrentes gravam uma linha só;
- elegibilidade: `single_bird`, override com outra categoria, sem canto, sem Kids.

**BFF:**

- `/v1/featured` com relógio injetado: virada à meia-noite de São Paulo, nenhuma resposta velha depois dela, `max-age` mínimo de 1, os erros da tabela da seção 7;
- `audience` e `primaryBiome` nas chaves de cache; prefixo `bff:v2:`;
- `audio: null` sem canto;
- OpenAPI e contrato.

**Proto:** `buf lint`, `buf breaking` e o teste de contrato atual.

## 10. Ordem de entrega

Tudo começa depois de a frente A3 estar mergeada.

| # | PR | Repositório | Depende de |
|---|---|---|---|
| 1 | Campos e RPC novos, tag `v0.4.0` | `passarim-proto` | — |
| 2 | Migração 0005, loader, seed, leitura, filtros `kids_only` e `primary_biome`, contagens | `passarim-catalog` | 1 |
| 3 | Picos do canto e `requeue --source` | `passarim-catalog` | 2 |
| 4 | `GetFeaturedSpecies` | `passarim-catalog` | 2 |
| 5 | Validador, lint e `cmd/kidsgen` | `passarim-catalog` | 2 |
| 6 | Conteúdo: `primary_biome` e `kids:` nas 41 espécies, **revisado pelo dono** | `passarim-catalog` | 5 e a `ANTHROPIC_API_KEY` do dono |
| 7 | BFF: detalhe, audiência, `primaryBiome`, `/v1/featured`, cache v2, OpenAPI | `passarim-bff` | 1 e 4; corre em paralelo com 5 e 6 |
| 8 | ADR-0022 e a atualização do PRD (seção 12) | `passarim-docs` | — |
| 9 | Reingestão dos cantos (`requeue --source audio`) e conferência dos picos, à mão | ambiente local | 3 |

Os PRs 3, 4 e 5 podem sair em qualquer ordem depois do 2. A ordem de deploy é catalog, BFF e só então o app.

## 11. Riscos

| Risco | Mitigação |
|---|---|
| A IA inventa um fato ou uma quantidade | Entrada só com o texto adulto; validador de origem, hash e números; revisão humana no PR |
| A IA traz um tema pesado | Tabela da seção 3.4 no prompt; lista de palavras proibidas; revisão humana |
| O parser de números erra um caso do português | Golden file com casos reais; um falso positivo só faz o kidsgen tentar de novo ou pular a espécie, nunca grava texto errado |
| A revisão de muitas espécies cansa | kidsgen por lote; PRs de conteúdo de tamanho revisável |
| A chave da Anthropic vaza | Só em variável de ambiente local; gitleaks; nunca na CI |
| O bioma escolhido pela IA é estranho | Justificativa no terminal e na descrição do PR; o dono corrige à mão no YAML, e o hash não muda, porque só os `biomes` entram nele |
| Relógios do BFF e do catalog diferentes na virada | Janela de ontem a amanhã no catalog; `INVALID_ARGUMENT` vira 500 com log no BFF |
| O preço do modelo muda | O custo é pequeno nas duas escalas; a spec registra a data da conferência |

## 12. Correções ao PRD

1. **Rodízio sem repetição** no lugar de "hash da data módulo o número de elegíveis", com a tabela `featured_day`. O sorteio do PRD repete aves e deixa outras muito tempo sem aparecer num catálogo grande. **Decisão do dono.**
2. **`primary_biome` escolhido pelo kidsgen,** dentro dos `biomes` da ave, e o `source_hash` também cobre os `biomes`. O PRD não dizia quem escolhe. **Decisão do dono.**
3. **Filtro `ListSpeciesRequest.primary_biome` (7) e `?primaryBiome=`** no BFF, que não estavam na seção 7 do PRD. Sem eles, a tela de mundo contradiz o álbum **[R]**.
4. **Elegibilidade da "Ave do dia" exige canto** **[DR]**.
5. O PR 8 atualiza a seção 7 do PRD com os itens 3 e 4.

## 13. Decisões do redator [DR] e do representante [R]

**[DR]:**

1. Áudio com menos de 64 amostras fica com os picos vazios, sem erro (seção 4).
2. A "Ave do dia" exige canto, porque o card adulto tem botão de canto e, num catálogo grande, nem toda ave terá canto (seção 5.3).
3. `um` e `uma` não contam na regra dos números, porque quase sempre são artigos (seção 3.3).
4. O kidsgen roda uma espécie por vez, sem paralelismo (seção 3.5).
5. A lista de palavras proibidas é curta e comparada pelo começo da palavra (seção 3.2).

**[R]** (representante do dono, nas seções 5 e 7): o tipo `biome` no banco; o loader recusa `primary_biome` fora de `biomes` mesmo sem bloco Kids; o filtro por bioma principal; "usadas" com `day <> D`; nenhuma ave repetida na virada de ciclo; `time/tzdata` no catalog; `audio: null` sem canto; a tabela de erros do `/v1/featured`; `max-age` mínimo de 1; a ADR-0022 citando a 0011; a divisão do B1 em PRs menores; o item 4 do "Pronto quando".
