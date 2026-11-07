# ADR-0022: Conteúdo Kids gerado por LLM, com revisão humana

- **Status:** Aceita
- **Data:** 2026-11-07

## Contexto

A jornada Kids precisa de um texto para crianças de 8 a 12 anos para cada espécie: descrição curta, fatos de uma
frase e um "Você sabia?". O MVP tem 41 espécies, e o catálogo vai crescer (o roadmap v2 fala em cerca de 1.970).
Escrever e revisar à mão um segundo texto para cada ave não escala. O texto adulto de cada espécie já é curado e
revisado no YAML do catalog.

## Decisão

- O texto Kids é gerado pelo `cmd/kidsgen` do catalog com um modelo fixado (`claude-opus-5-5`), a partir **só** do
  texto adulto curado (descrição, fatos e biomas). Não vão URLs, UFs nem o nome científico.
- A resposta vem em saída estruturada (JSON com esquema fixo) e passa por um validador com regras fixas: frases de
  até 15 palavras, todo número presente no texto adulto, origem de cada fato, palavras proibidas e o `source_hash`
  do texto adulto. Recusada, volta ao modelo com os erros, até 2 novas tentativas.
- O resultado é gravado no YAML e **revisado por uma pessoa no PR**. Nada é gerado em tempo real: o app, o BFF e o
  catalog só leem o texto já revisado.
- A chave da API fica só na máquina de quem roda o kidsgen; nunca na CI nem no repositório.

## Consequências

- Gerar o conteúdo das 41 espécies custa cerca de US$ 1,50; um catálogo de 1.970 espécies, cerca de US$ 70, em
  lotes. A revisão humana é o gargalo, não a geração.
- Mudar a descrição, um fato ou os biomas invalida o `source_hash`: o lint do conteúdo pede uma nova geração.
- O modelo pode errar o tom ou um tema sensível; o validador pega o que é regra fixa, e a revisão no PR pega o resto
  (tabela de temas sensíveis na spec da frente B, seção 3.4).
- **Relação com a ADR-0011:** a 0011 adia a **identificação de aves** por IA. Esta ADR trata de **geração de
  texto** e não revoga nem muda a 0011.
