# PiuDS

Design system **exclusivo do Passarim**, com duas variantes: **Piu** (a jornada adulta) e **Piu Kids** (a jornada das crianças). O nome vem do som do passarinho (**Piu**) e o sufixo **DS** (*design system*) deixa a intenção clara para quem lê. No código, os componentes usam o prefixo curto `Piu` (`PiuTheme`, `PiuFilterChip`); o pacote `com.velosobr.piuds` já diz de onde vêm.

Este documento são as **regras do projeto PiuDS**. Quem mexe no PiuDS (inclusive agentes de IA) segue estas regras. Se uma regra atrapalhar, mude a regra aqui, num PR próprio, antes de quebrá-la no código.

## 1. O que o PiuDS é (e não é)

| É | Não é |
|---|---|
| A **identidade visual do Passarim** em código: tema (cores, tipografia, formas, espaços) e componentes compartilhados entre features | Um lugar para telas, ViewModels ou lógica de negócio |
| Dono dos tokens do Passarim (Piu claro e escuro, Piu Kids), inclusive as cores de conservação | Um design system multimarca: o tema é parametrizado **só pela jornada** |
| Testado visualmente nos temas e com fonte ampliada | Um repositório de "tudo que é UI e se repete": só entra o que 2 ou mais features usam (com a exceção da seção 7) |

## 2. Princípios

1. **Consistência do Passarim antes de tudo.** O PiuDS é a única fonte da aparência do app; uma tela nunca inventa um estilo próprio.
2. **Tokens, nunca valores soltos.** Toda cor, forma, fonte e espaço vem do tema.
3. **Acessível por padrão.** Contraste, alvo de toque, leitor de tela e "reduzir animações" fazem parte da definição de "pronto".
4. **Sem surpresas.** API pequena, previsível e igual entre os componentes.
5. **Comentado para quem está aprendendo.** O código do projeto é comentado em português, de forma didática (regra do `CLAUDE.md` do Passarim); identificadores em inglês.

## 3. Dependências e fronteiras

O módulo é `core/piu-ds`, pacote `com.velosobr.piuds`, e fica **abaixo** de todas as features.

- Pode depender **apenas** de: Compose (runtime, foundation, material3, ui), Compose Resources, `lifecycle-runtime-compose` (para reler preferências do sistema ao voltar ao app), Coil (os componentes de foto carregam imagens), Haze (só no `PiuBlurSurface`), `graphics-shapes` (a forma cookie) e `:core:domain`.
- **Não pode** depender de: `:app`, `:feature:*`, `:core:data`, `:core:presentation`, Koin, Ktor, Room nem MapLibre.
- **Sem textos do produto.** Componentes recebem `String` ou *slots* (`@Composable () -> Unit`). Textos como "Sem conexão" ficam em recursos de string do app, para manter a internacionalização possível.
- **Conhece só o domínio compartilhado.** Pode receber tipos de `:core:domain` (`ConservationStatus`, `Biome`, `Journey`); modelos de uma feature (`Species`, filtros) nunca entram.
- **A marca é do Passarim, embutida.** `PiuTheme(journey, themeMode, dynamicColor)` escolhe a variante pela jornada: Piu (Manrope, claro, escuro e cores dinâmicas) ou Piu Kids (Fredoka e Nunito, sempre claro, sem cores dinâmicas). Não existe parâmetro de marca.
- A fronteira é conferida na revisão de PR. `TODO(frente-H)`: uma task Gradle que confira as dependências **resolvidas** do módulo contra uma allowlist e entre no `check`.

## 4. Tokens e tema

- A fonte dos valores é `passarim-docs/docs/design/tokens/passarim-tokens.json` (versão 2.0.0). O Kotlin é derivado dele e leva no cabeçalho a versão de origem.
- Esquema de cores **Material 3**, com os mesmos nomes de papel do `ColorScheme`. As features leem cores, tipografia e formas pelo `MaterialTheme`. O que o Material não tem fica em `PiuTheme.tokens` (gradientes de bioma e de mundo, scrim, sombras sólidas do Kids e cores de conservação). Além dele, só `PiuTheme.reduceMotion` e `PiuTheme.isDark`.
- **Proibido em componentes:** cor literal (`Color(0xFF...)`), `dp` e `sp` soltos fora de `PiuDimens` e da tipografia, `RoundedCornerShape(12.dp)` direto. Use `MaterialTheme.colorScheme`, `MaterialTheme.typography`, `MaterialTheme.shapes`, `PiuTheme.tokens` e `PiuDimens`.
- Temas: no Piu, Sistema, Claro e Escuro, mais **cores dinâmicas** opcionais (Android 12+, via `expect/actual`; nas outras plataformas cai para a paleta da marca). No Piu Kids, sempre claro.
- **Contraste verificado por teste** (`docs/design/tools/check-tokens.mjs`): texto ≥ 4.5:1 e elementos não textuais ≥ 3:1, no Piu claro, no Piu escuro e no Kids; o texto de cada gradiente contra as duas pontas; o branco sobre o scrim no pior caso (foto branca); as cores de conservação sobre o creme do Kids. Mudar um token sem rodar essa verificação não passa no CI.

## 5. Regras de API dos componentes

- **Nome:** prefixo `Piu` (`PiuFilterChip`, `PiuStateScreen`). Arquivo com o mesmo nome do componente.
- **`modifier: Modifier = Modifier` é o primeiro parâmetro opcional** e é aplicado ao elemento raiz.
- **Sem estado interno que o chamador não controle.** Estado sobe (*state hoisting*): `selected`, `checked`, `value` e o `onChange` correspondente vêm de fora.
- **Slots no lugar de dezenas de parâmetros.** Conteúdo variável é `@Composable () -> Unit`; evite listas de booleanos de estilo.
- **Estados explícitos:** `enabled`, e quando fizer sentido, `loading` e erro. Cada estado tem visual definido e snapshot.
- **Parâmetros estáveis:** tipos imutáveis ou anotados `@Immutable`/`@Stable`; coleções em parâmetros usam `kotlinx.collections.immutable` (ou a configuração de estabilidade do projeto), pois `List` é instável. Objetos não triviais criados na composição ficam em `remember`; isso é conferido na revisão e pelos relatórios do compilador do Compose.
- **Sem `ViewModel`, sem `Koin`, sem acesso a rede ou disco.** Um componente é função de seus parâmetros.
- **Efeitos colaterais** (`LaunchedEffect`, `DisposableEffect`) só quando indispensáveis e com chave correta.
- **Animação:** curta e com função. Todo componente animado lê `PiuTheme.reduceMotion` e, com a preferência do sistema ligada, troca a mola por uma troca seca, sem esconder nada (uma mensagem aparece parada).

## 6. Acessibilidade

- Alvo de toque **mínimo de 48dp no Piu e de 56dp no Piu Kids**, mesmo quando o visual é menor (um chip de 36dp tem área de toque de 48dp).
- Todo elemento clicável sem texto visível **exige** `contentDescription` (parâmetro obrigatório, sem valor padrão).
- Papéis semânticos corretos (`Role.Button`, `Role.Checkbox`, ...), e estado (`selected`, `toggleable`) exposto à acessibilidade.
- O layout aguenta **fonte 2.0×** sem cortar texto: nada de altura fixa em contêiner de texto (use `heightIn`/`defaultMinSize`), e nada de reticências que escondam o nome de uma ave ou de um filtro.
- Cor nunca é o único sinal: um status tem texto ou ícone além da cor.

## 7. Quando criar (ou não) um componente no PiuDS

1. **Regra do 2:** nasce na feature que precisa dele; só vai para o PiuDS quando **2 ou mais features** o usam.

   1a. **Exceção fechada, os componentes de assinatura das variantes:** `PiuCookieShape`, `PiuBlurSurface`, `PiuCreditCaption` (com o modo sem link), `PiuMosaicCard`, `PiuFeaturedCard`, `PiuBiomeChip`, `PiuFloatingNavBar`, `PiuKidsButton`, `PiuWorldCard`, `PiuSticker`, `PiuPipoBalloon` e `PiuKidsNavBar`. Eles carregam a linguagem visual da jornada e entram antes da segunda feature que os usa. Qualquer outro componente de jornada precisa da regra do 2 ou de uma linha num PRD.
2. **Teste do domínio:** se o componente precisa de um modelo de uma feature (`Species`, filtros) para fazer sentido, ele **não é do PiuDS**. Extraia a parte visual e deixe o resto na feature. Tipos de `:core:domain` (como `ConservationStatus` e `Biome`) são permitidos.
3. **Antes de criar, procure:** se um componente existente resolve com um slot a mais, estenda em vez de duplicar.
4. **Remoção:** componente sem uso por duas etapas do projeto é candidato a remoção, via PR com justificativa.

## 8. Testes

Toda mudança visual passa por estes portões, todos no CI:

- **Snapshots com Paparazzi** (módulo Android `snapshots`, ADR-0017): cada componente do Piu em **claro e escuro** × **fonte 1.0×, 1.3× e 2.0×**, e cada componente do Piu Kids **só em claro** × as mesmas três escalas, em cada estado relevante.
- **Contraste** dos tokens (seção 4).
- **Semântica** de componentes clicáveis (papel, descrição, alvo de toque), com `compose-ui-test` e `runComposeUiTest` em `androidHostTest`, a partir do plano C2.
- **Paridade com os tokens:** um teste confere que as cores, a conservação, a tipografia e as formas em Kotlin batem com o `passarim-tokens.json`.
- Snapshot só é regravado com o **diff visual revisado** no PR; "regravar tudo" para o CI passar é proibido.
- O iOS não tem snapshot (limitação do Paparazzi); o código comum é validado pelo alvo Android e a compilação do iOS roda no CI.

## 9. Documentação

- **KDoc em português** em toda API pública: o que faz, quando usar, quando **não** usar, e o significado de cada parâmetro.
- Cada componente tem pelo menos um `@Preview` em claro e escuro no Piu; só em claro no Piu Kids.
- Decisões que mudam regras ou API pública viram **ADR** no repositório de documentação.

## 10. Versionamento e extração futura

- **Sem versionamento próprio** enquanto o PiuDS vive no repositório do app: mudanças de API pública entram na descrição do PR. SemVer e changelog passam a existir se ele for extraído.
- O PiuDS evolui junto com o app, no mesmo repositório. Virar um produto próprio é uma possibilidade futura, **não planejada agora** (YAGNI): se acontecer, o módulo já é isolado e pode ser movido.
- Licenças de terceiros dentro do PiuDS: as fontes Manrope, Fredoka e Nunito são OFL e aparecem na tela de Licenças (definições customizadas do AboutLibraries); os ícones Material são Apache 2.0. Cada um mantém a sua licença e o aviso correspondente.

## 11. Convenções de código

- Kotlin idiomático; `ktlint` e `detekt` obrigatórios no CI.
- Identificadores em inglês, comentários e KDoc em português.
- Um componente público por arquivo; helpers privados no mesmo arquivo.
- Sem `TODO` sem dono e prazo; sem código comentado.

## 12. Checklist de PR para um novo componente

- [ ] Usado por 2 ou mais features (ou na exceção 1a da seção 7) e passa no teste do domínio
- [ ] Nome com prefixo `Piu`, `modifier` como primeiro parâmetro opcional
- [ ] Nenhuma cor, `dp` ou `sp` literal; só tokens
- [ ] Estado levantado e parâmetros estáveis
- [ ] Alvo de toque ≥ 48dp no Piu e ≥ 56dp no Kids, `contentDescription` onde for clicável, papel semântico
- [ ] Snapshots com fonte 1.0×, 1.3× e 2.0×: Piu em claro e escuro, Kids só em claro, e em cada estado
- [ ] Contraste dos pares novos verificado
- [ ] Com animação: lê `PiuTheme.reduceMotion`
- [ ] KDoc em português e `@Preview`
- [ ] Nenhuma dependência proibida no `build.gradle.kts`

## 13. Ajustes de cor em relação às pranchetas (tokens 2.0.0)

As pranchetas de `docs/design/direcoes-2026` eram direção, não token. Estas cores mudaram para passar no contraste
(4.5:1 do texto contra as duas pontas do gradiente). Cada uma mudou o mínimo possível, só na luminosidade, mantendo o
matiz.

| Onde | Antes | Depois | Contraste antes → depois |
|---|---|---|---|
| Bioma Amazônia (Piu), ponta clara, texto branco | `#3FA66B` | `#328556` | 3.05 → 4.54 |
| Bioma Mata Atlântica (Piu), ponta clara | `#4DAA7E` | `#3C8361` | 2.85 → 4.55 |
| Bioma Cerrado (Piu), ponta clara | `#D9A13B` | `#9A6E1E` | 2.30 → 4.54 |
| Bioma Caatinga (Piu), ponta clara | `#D07A4E` | `#B65D30` | 3.19 → 4.57 |
| Bioma Pantanal (Piu), ponta clara | `#3E9CB5` | `#338095` | 3.17 → 4.50 |
| Bioma Pampa (Piu), ponta clara | `#A3AE4E` | `#737B37` | 2.41 → 4.55 |
| Mundo Amazônia (Kids), ponta escura, texto `#0B2A17` | `#1F9D55` | `#1F9F56` | 4.43 → 4.53 |
| Mundo Caatinga (Kids), ponta escura, texto `#3A1208` | `#E5533D` | `#E65741` | 4.44 → 4.57 |
| Mundo Pantanal (Kids), ponta escura, texto `#0A2440` | `#2B7FD8` | `#438DDC` | 3.83 → 4.54 |
| Rótulo do botão laranja (Kids) | branco | `#1D2B3A` (azul-noite) | 2.35 → 6.14 |

O amarelo do Pipo (`#FFC93C`) sobre o creme dá 1.44:1 e fica fora da verificação: o Pipo é decorativo e não carrega
informação.
