# Passarim — Frente C: PiuDS

Data: 2026-10-28 · Origem: PRD da guinada (`2026-10-16-passarim-guinada-prd.md`), seção 6, frente C, com a subseção "Crescimento do catálogo" (docs #18) · Referência visual: `docs/design/direcoes-2026/` · Regra de comentários: `~/dev/passarim/CLAUDE.md` (todo código novo com comentários didáticos) · Roda em paralelo com a frente B (nada aqui depende dos dados dela)

Decisões do redator estão marcadas com **[DR]** e listadas no fim. O dono delegou as decisões de design desta frente a um agente que o representou; o que esse agente decidiu está marcado com **[R]**. Onde esta spec corrige o PRD ou o README antigo do PiuDS, a seção 11 diz o quê.

## 1. Objetivo

O PiuDS é o design system do Passarim, com duas variantes: **Piu**, para o adulto, e **Piu Kids**. Esta frente:

- dá nome e regras ao módulo de design que o app já tem;
- troca o tema atual pelo `PiuTheme` (títulos em 800; o tema expressivo do Material 3 fica para quando sair em versão estável, seção 11);
- cria a variante Kids;
- entrega os componentes que as frentes E (adulto) e F (Kids) vão montar nas telas.

**Nenhuma tela muda de layout nesta frente.** O mosaico, a "Ave do dia", a barra flutuante e as telas Kids são ligados às telas nas frentes E e F. Aqui só o tema do app atual muda **[R]**.

### Pronto quando

1. O app atual roda sobre o PiuDS, na variante Piu.
   - O PR da renomeação não muda nenhum snapshot.
   - O PR do tema muda os snapshots só pelos títulos em 800 (hoje em 700), e o dono aprova essa diferença no PR. Qualquer outra diferença de pixel é um bug a investigar **[R]**.
2. Os componentes novos têm snapshots: Piu em claro e escuro, Piu Kids só em claro, cada um com fonte 1.0×, 1.3× e 2.0×.
3. O contraste de todos os pares de cores usados pelos componentes passa na ferramenta de `docs/design/tools`, nas duas variantes. O dono aprova os ajustes de cor em relação às pranchetas (seção 4.3).

## 2. Decisões do dono e do representante

| Tema | Decisão |
|---|---|
| Nome, módulo, pacote e prefixo | Do PRD: `core:piu-ds`, `com.velosobr.piuds`, prefixo `Piu` |
| Divisão | Uma spec e dois planos: **C1, fundação** (regras, tokens, renomeação e tema) e **C2, componentes**. O C1 do app vira dois PRs, um de renomeação mecânica e um de tema **[R]** |
| Componentes de jornada no PiuDS | Exceção fechada à regra do 2: só os 12 componentes do PRD (seção 6) **[R]** |
| Acessores do tema | `PiuTheme` expõe só `tokens`, `reduceMotion` e `isDark`. As features continuam lendo cores, tipografia e formas pelo `MaterialTheme` **[R]** |
| Pipo | Só a pose normal nesta frente. As poses dos estados Kids (festa, erro) entram na frente F, junto com o desenho deles **[R]** |
| Cores das pranchetas | Ajustadas até passar no contraste. O dono aprova o antes e depois no PR do docs **[R]** |
| Reduzir animações | Lê a preferência do sistema; sem chave própria no app **[R]** |

## 3. Regras do PiuDS (`docs/design/piuds/README.md`)

O README do branch local `docs/piu-readme`, de 05/10, volta para `docs/design/piuds/README.md`, atualizado nestes pontos:

- **Duas variantes:** o tema é **parametrizado só pela jornada**. O PiuDS continua exclusivo do Passarim, sem parâmetro de marca.
- **Dependências permitidas:** Compose (runtime, foundation, material3, ui), Compose Resources, `:core:domain`, Coil (que os componentes de foto já usam hoje, embora o README antigo proíba), Haze e `graphics-shapes`. Tudo o mais continua proibido.
- **Sem promessa do que não existe** **[R]:** o README antigo cita uma task Gradle de allowlist de dependências, que nunca foi feita. O README novo descreve a fronteira como regra de revisão de PR e lista a task como `TODO(frente-H)`.
- **Regra do 2, com uma exceção fechada:** os 12 componentes de assinatura das variantes, listados na seção 6, entram antes da segunda feature que os usa. Outro componente de jornada precisa da regra do 2 ou de uma linha num PRD **[R]**.
- **Snapshots:** Piu em claro e escuro, Piu Kids só em claro, cada um com fonte **1.0×, 1.3× e 2.0×**. Hoje o `ThemedSnapshotTest` já roda a matriz do Piu.
- **Alvo de toque:** 48 dp no Piu e **56 dp no Kids**.
- **Reduzir animações:** deixa de ser adiado e passa a ser regra (seção 5.4).
- **Comentários didáticos**, pela regra do `CLAUDE.md` local.
- **Acessores:** só `PiuTheme.tokens`, `PiuTheme.reduceMotion` e `PiuTheme.isDark`; o resto pelo `MaterialTheme`.

Depois do merge do PR do docs, o branch `docs/piu-readme` é apagado, **só com o ok explícito do dono**.

## 4. Tokens (`docs/design/tokens/passarim-tokens.json`, versão 2.0.0)

### 4.1 Estrutura

Os blocos `color.light`, `color.dark` e `conservation` de hoje não mudam. Se uma cor de conservação reprovar sobre o creme, entra `kids.conservation` com os valores ajustados, e o `conservation` do Piu continua igual. Entram:

- **`gradient.biome`:** os seis gradientes de bioma do Piu, de 135°, com `from`, `to` e a cor do texto por cima;
- **`scrim`:** a cor e a faixa do scrim de foto (de transparente a `rgba(16,20,16,0.8)` nos 60 a 75% de baixo);
- **`typography.titleWeight`:** 800;
- **um bloco `kids` próprio** **[R]**, com:
  - `color.light`: o esquema completo do Material, derivado das pranchetas (fundo creme `#FFF7E8`, texto azul-noite `#1D2B3A`, primária laranja `#FF8A3D`);
  - `typography`: Fredoka e Nunito, com o mapeamento da seção 5.3;
  - `shape`: os raios do Kids (botões com raio total, cartões de 24 dp e a barra de 38 dp);
  - `gradient.world`: os seis gradientes de mundo, de 150°, com a cor do texto por cima;
  - `shadow`: as sombras sólidas, como pares de cor e deslocamento (por exemplo, cartão `#F2E3C6` com 4 dp e botão laranja `#C9601E` com 5 dp).

O `build-tokens.mjs` gera o CSS e o `TOKENS.md` também para o Kids. O `TokensTest` do app confere a paridade do Kotlin com o JSON, incluindo o bloco `kids`.

### 4.2 Verificação de contraste

O `check-tokens.mjs` passa a conferir, a 4.5:1 para texto e a 3:1 para elementos que não são texto:

- os pares do esquema Kids (texto sobre o creme, sobre os cartões e sobre a primária);
- o texto de cada gradiente contra **as duas pontas** do gradiente, no Piu e no Kids **[R]**;
- o texto branco sobre `rgba(16,20,16,0.8)` composto sobre `#FFFFFF`, o pior caso de foto. O texto só fica na faixa de opacidade máxima do scrim;
- as cores de conservação sobre o creme **[R]**.

O Pipo amarelo sobre o creme (1,44:1) fica fora: ele é decorativo e não carrega informação **[R]**.

### 4.3 Ajustes de cor em relação às pranchetas

O representante mediu as cores das pranchetas, e estes pares falham **[R]**:

| Par | Contraste | Ajuste |
|---|---|---|
| Texto dos mundos Amazônia, Caatinga e Pantanal sobre a ponta escura | 4,43, 4,44 e 3,83 | Escurecer a cor do texto ou clarear a ponta escura, o mínimo necessário |
| Texto branco sobre a ponta clara dos seis biomas do Piu | 2,3 a 3,2 | Escurecer a ponta clara de cada bioma até o branco passar a 4,5:1; o texto continua branco |
| Rótulo branco sobre o botão laranja do Kids | 2,35 | O rótulo passa a ser azul-noite (6,14) |

**Regra do ajuste:** muda-se o mínimo possível para passar, mantendo o matiz. O PR do docs traz uma tabela de antes e depois de cada cor ajustada, com o contraste novo, e o dono aprova essa tabela. Os valores exatos são calculados no plano C1, com a ferramenta.

## 5. Tema

### 5.1 Renomeação (PR C1a, sem mudança visual) **[R]**

- **Módulo e pacote:** `core/design-system` vira `core/piu-ds`, e o pacote `com.velosobr.passarim.core.designsystem` vira `com.velosobr.piuds`, com `git mv`, para o histórico seguir os arquivos.
- **Prefixo:** todo composable público ganha o prefixo `Piu` (`FilterChip` vira `PiuFilterChip`, o que também acaba com o choque de nome com o `FilterChip` do Material). As funções internas ficam sem prefixo.
- **Paletas e tema:** `PassarimLightColors` vira `PiuLightColors`, e o resto segue o mesmo padrão. O `PassarimTheme` vira `PiuTheme` com a assinatura de hoje; a assinatura nova entra no C1b.
- **Portão:** o diff de snapshots é zero, e os nomes dos arquivos de snapshot não mudam. Como o Paparazzi monta o nome do arquivo com a classe e o método de teste, as classes e os métodos de `snapshots/` não são renomeados: só os imports e as chamadas mudam. Os 18 arquivos de fora do módulo que importam o pacote mudam só nos imports e nos nomes.
- Comentários e KDoc acompanham os nomes novos.

### 5.2 `PiuTheme` (PR C1b)

```kotlin
@Composable
fun PiuTheme(
    journey: Journey = Journey.ADULT,
    themeMode: ThemeMode = ThemeMode.SYSTEM,
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit,
)
```

- **`Journey { ADULT, KIDS }`** entra em `core:domain` como um enum puro **[R]**. O campo em `Settings` e o `setJourney` são da frente D.
- **`ThemeMode.isDark`** sai de `app/theme` e vai para o `piu-ds`, junto com o teste dele, porque o tema passa a receber `themeMode`. O `App.kt` chama `PiuTheme(themeMode = …)`.
- **Piu:** `MaterialTheme` com as cores de hoje (ou as dinâmicas, se pedidas e disponíveis) e a Manrope com títulos em 800.
  - **Correção na execução** **[R]:** `MaterialExpressiveTheme` e `MotionScheme` são **internos** no CMP material3 1.9.0 (androidx 1.4.0) e só ficam públicos a partir do CMP material3 1.13.0-beta01 (androidx 1.5.0-beta02). O PiuDS fica no Material estável, com `TODO(frente-H): adotar MaterialExpressiveTheme e MotionScheme.expressive() quando saírem em versão estável do CMP material3`.
  - **Movimento:** as molas dos componentes ficam centralizadas num `PiuMotion` (plano C2), com duas ou três `spring()` nomeadas que viram `snap()` quando `PiuTheme.reduceMotion` está ligado. É o lugar único que o `MotionScheme` expressivo substitui depois.
  - Hoje o `manropeFontFamily()` declara só os pesos 400, 600 e 700. O 800 entra na lista, no `TOKENS.md` e no `TokensTest` **[R]**.
- **Piu Kids:** sempre claro, sem cores dinâmicas, com o esquema, a tipografia e as formas do bloco `kids` (`PiuKidsColors`, `PiuKidsTypography` e `PiuKidsShapes`) **[R]**. O tema ignora `themeMode` e `dynamicColor` sem gravar nada; as preferências do adulto não mudam.
- **"Escuro efetivo":** `PiuTheme.isDark: Boolean` diz se o que está na tela é escuro (no Kids, nunca). Ligar isso aos ícones das barras do sistema fica na frente D, quando o Kids passa a abrir **[R]**.
- **`PiuTheme.tokens`:** um `CompositionLocal` com os gradientes da variante (bioma ou mundo), o scrim, as sombras sólidas (só Kids) e as cores de conservação. Ele substitui o `LocalConservationPalette` de hoje, que só é usado dentro do módulo (no `ConservationBadge`): a troca não toca nas features.

### 5.3 Tipografia Kids **[R]**

- Os estilos `display`, `headline` e `title` usam Fredoka, de 600 a 700.
- Os estilos `body` e `label` usam Nunito, de 600 a 800.
- O `bodyLarge` tem no mínimo 18 sp.
- Os valores exatos dos 15 estilos do Material (tamanho, altura de linha e peso) são fixados no PR 1, a partir das pranchetas, e o `TokensTest` os trava **[R]**.

### 5.4 Reduzir animações **[R]**

- **Android:** `Settings.Global.ANIMATOR_DURATION_SCALE == 0f`, o que a opção "Remover animações" grava.
- **iOS:** `UIAccessibilityIsReduceMotionEnabled()`.
- A leitura é um `expect/actual`, refeita a cada `ON_RESUME`, porque a pessoa pode mudar o ajuste e voltar ao app.
- Fica em `PiuTheme.reduceMotion`, com um `LocalPiuReduceMotion` que os testes e os snapshots podem sobrescrever.
- Com o ajuste ligado, os componentes animados trocam a mola por uma troca seca. **Nada some:** um "Nova figurinha!" aparece parado.
- Sem chave própria no app.

### 5.5 Fontes e licenças

- **Arquivos:** Fredoka e Nunito em TTF variável, da Google Fonts, com licença OFL, no `composeResources/font` do `piu-ds`, ao lado da `manrope.ttf`.
- **Licenças:** `LICENSES/Fredoka-OFL.txt` e `LICENSES/Nunito-OFL.txt`.
- **A Manrope não aparece hoje na tela de Licenças:** o AboutLibraries só lista dependências do Gradle **[R]**. As três fontes entram como definições customizadas do AboutLibraries e saem no `aboutlibraries.json` gerado, como pede a ADR-0020. Isso corrige a falta da Manrope.

## 6. Componentes

Todos com prefixo `Piu`, `modifier` como primeiro parâmetro opcional, estado levantado, KDoc em português, `@Preview` e snapshots na matriz da variante. Nenhum recebe modelo de uma feature (como `Species`): só textos, chaves de imagem, enums de `core:domain` (como `Biome` e `ConservationStatus`) e slots. Listas e contagens vêm de fora: "4 de 9" chega por parâmetro, e nada fixa uma quantidade de aves **[R]**.

**Comuns** (`components/`):

| Componente | O que é |
|---|---|
| `PiuCookieShape` | A forma "cookie" de M3 Expressive: um `RoundedPolygon` do `graphics-shapes` com um adaptador `Shape` próprio, porque `MaterialShapes` só existe nas versões alpha **[R]** |
| `PiuBlurSurface` | A superfície com desfoque do Haze, o único lugar que importa o Haze. A tinta translúcida passa no contraste sozinha; o desfoque é só decoração. Se o Haze quebrar, a troca é por fundo translúcido sem desfoque, sem mexer nas telas **[R]** |
| `PiuCreditCaption` | O crédito de hoje, com um modo **sem link** (`linkEnabled = false`), que o Kids usa |

**Adulto** (`components/adult/`):

| Componente | O que é |
|---|---|
| `PiuMosaicCard` | Card da grade em mosaico: foto com raio de 24 dp, scrim, nome em branco sobre a foto, coração em círculo translúcido de 44 dp com alvo de 48 dp, e altura alta ou baixa por parâmetro |
| `PiuFeaturedCard` | A "Ave do dia": card largo com raio de 28 dp, selo, nome, nome científico e botão de canto em forma de cookie |
| `PiuBiomeChip` | Chip de filtro com o gradiente do bioma |
| `PiuFloatingNavBar` | A barra flutuante em pílula, com raio de 34 dp e o item ativo expandido com rótulo. Feita sobre `Row`, porque a `ShortNavigationBar` é experimental e não flutua **[R]** |

**Kids** (`components/kids/`):

| Componente | O que é |
|---|---|
| `PiuKidsButton` | Botão de 56 a 72 dp, com raio total e uma sombra sólida que "afunda" ao tocar. O rótulo é azul-noite (seção 4.3) |
| `PiuWorldCard` | Cartão de mundo: o gradiente do mundo, o nome e o progresso ("4 de 9") |
| `PiuSticker` | A figurinha: a foto em forma de cookie na cor do mundo, ou o espaço tracejado com "?" quando ainda falta |
| `PiuPipoBalloon` | O balão de fala do Pipo, com o Pipo ao lado |
| `PiuKidsNavBar` | A barra escura flutuante, com raio de 38 dp, 76 dp de altura e o item ativo em amarelo |

**O Pipo:** o SVG da prancheta `KidsSistema.dc.html` vira um `ImageVector` escrito à mão, sem dependência de conversor. É só a pose normal **[R]**. Quando o Pipo é decoração ao lado de um texto, ele não tem `contentDescription`.

Os componentes já estão desenhados nas pranchetas de `direcoes-2026/canvas`. O modo sem link do crédito não precisa de desenho próprio.

## 7. Dependências novas

- **Haze 2.0 beta** e **`androidx.graphics:graphics-shapes`**, as duas no `piu-ds`.
- **Antes do plano C2,** um teste rápido confere que as duas têm artefatos para iOS e funcionam com o Compose Multiplatform 1.12.1 e o conjunto de versões da ADR-0019. Se o Haze não funcionar no iOS, o `PiuBlurSurface` usa o fallback translúcido no iOS e o desfoque só no Android.
- Os lockfiles e o `aboutlibraries.json` são atualizados no mesmo PR.
- **ADR nova:** Haze 2.0 em beta, isolado num componente. Ela é escrita depois do teste de iOS, que pode mudar a decisão (desfoque só no Android), num PR do docs junto com o PR 4 **[R]**. Ela pega o próximo número livre na hora do merge, porque a frente B também cria ADRs **[R]**.

## 8. Testes

- **Snapshots (Paparazzi):**
  - o `ThemedSnapshotTest` de hoje (Piu, claro e escuro, × 1.0×, 1.3× e 2.0×) cobre as telas atuais e os componentes adultos e comuns;
  - um `KidsSnapshotTest` novo (só claro × as três escalas) cobre os componentes Kids e um mostruário do tema Kids, com a paleta e a tipografia **[R]**. As telas atuais não rodam no Kids;
  - cada componente aparece em cada estado: selecionado, desabilitado, pressionado quando tiver, e vazio para a figurinha;
  - os snapshots são gravados no CI Linux.
- **O risco do peso 800:** com glifos mais largos, um título pode cortar a 2.0×. O C1b corrige só o texto que cortar e registra cada correção no PR **[R]**.
- **Contraste:** `check-tokens.mjs`, com os pares da seção 4.2.
- **Paridade de tokens:** o `TokensTest` com o bloco `kids` e o peso 800.
- **Tema:** a escolha do esquema é uma função pura, `resolvePiuScheme(journey, themeMode, systemDark, dynamicAvailable)`, testada em `commonTest` com assertk **[R]**:
  - o Kids sempre claro, mesmo com `ThemeMode.DARK`;
  - o "escuro efetivo" (`isDark`);
  - o `ThemeMode.isDark` no novo endereço.
- **Reduzir animações:**
  - no C1b, um teste confere que o `LocalPiuReduceMotion` sobrescreve o valor do sistema; a leitura real, no Android e no iOS, é conferida à mão e registrada no PR **[R]**;
  - no C2, com `LocalPiuReduceMotion` ligado, o botão Kids e a barra flutuante não animam (snapshot e teste de estado).
- **Semântica:** os componentes clicáveis têm papel, descrição e o alvo mínimo da variante. Entra no C2, com `compose-ui-test` e `runComposeUiTest` em `androidHostTest` (a decisão que o README antigo adiava). A dependência e a trava de versão entram no PR 4 **[R]**.
- **Fora:** o snapshot de cores dinâmicas, que o Paparazzi não renderiza.

## 9. Ordem de entrega

| # | PR | Repositório | Plano |
|---|---|---|---|
| 1 | README do PiuDS, tokens 2.0.0 com o bloco `kids` e a tabela de ajustes de cor, ferramenta de contraste | `passarim-docs` | C1 |
| 2 | C1a: renomeação mecânica, com diff de snapshots zero | `passarim-app` | C1 |
| 3 | C1b: `PiuTheme` com as variantes, tokens, fontes e licenças, reduzir animações e o diff de snapshots para o dono aprovar | `passarim-app` | C1 |
| 4 | Componentes comuns e o Pipo, mais Haze e `graphics-shapes` | `passarim-app` | C2 |
| 5 | Componentes adultos | `passarim-app` | C2 |
| 6 | Componentes Kids | `passarim-app` | C2 |
| 7 | ADR do Haze, com o resultado do teste de iOS, junto com o PR 4 | `passarim-docs` | C2 |

O PR 2 pode abrir antes do 1. O PR 3 depende do 1, por causa dos tokens. Os PRs 4 a 6 dependem do 3.

## 10. Fora do escopo

- as telas Kids e qualquer mudança de layout das telas atuais (frentes E e F);
- navegação e escolha de jornada (frente D);
- Kids escuro (PRD);
- uma chave de "reduzir animações" no app;
- o "reduzir transparência" do iOS;
- as poses de festa e de erro do Pipo (frente F);
- a forma de onda do player (frente E, com os picos da frente B).

## 11. Correções ao PRD e ao README antigo

1. **O PRD fala em `PiuTheme.tokens`** e o README antigo em `PiuTheme.colors`, `.typography` e `.shapes`. Ficam só `tokens`, `reduceMotion` e `isDark`: são 64 usos de `MaterialTheme.*` nas features, e duas portas para o mesmo valor não ajudam **[R]**.
2. **O Pipo** do PRD ("o balão e os estados do Kids dependem dele") entra só na pose normal; as outras vão para a frente F **[R]**.
3. **A regra do 2** ganha a exceção fechada da seção 3 **[R]**.
4. **As cores das pranchetas** mudam onde não passam no contraste (seção 4.3) **[R]**.
5. **O README antigo** proibia Coil e prometia uma task de allowlist; o novo reflete o código (seção 3) **[R]**.
6. **O tema expressivo** (`MaterialExpressiveTheme`, `MotionScheme`), que o PRD e as direções davam como disponível no Material 3 1.9.0, é interno nessa versão. Fica para quando sair em versão estável (seção 5.2) **[R]**.

## 12. Decisões do redator [DR] e do representante [R]

**[DR]:**

1. A divisão em dois planos (C1 e C2) e a ordem dos PRs.
2. `PiuBlurSurface` como o único componente que importa o Haze.
3. Fredoka e Nunito em TTF variável.
4. O Pipo como `ImageVector` escrito à mão.

**[R]:**

- a renomeação num PR próprio, com diff de snapshots zero;
- `Journey` só como enum;
- a exceção fechada aos 12 componentes;
- o README alinhado ao código;
- só `tokens`, `reduceMotion` e `isDark` no `PiuTheme`;
- ficar no Material estável (o expressivo é interno no 1.9.0), com o `PiuMotion` no C2;
- formas e tipografia próprias no Kids;
- a base de snapshots Kids separada;
- o contraste do desfoque sem depender do desfoque;
- a ADR com o próximo número livre;
- o teste de iOS das dependências novas;
- as fontes no AboutLibraries e a falta da Manrope;
- o peso 800;
- só o Pipo normal;
- os detalhes de reduzir animações;
- a estrutura do bloco `kids` e os pares de contraste, com as medições da seção 4.3;
- o "escuro efetivo";
- a barra flutuante sobre `Row`;
- a forma cookie com `RoundedPolygon`;
- o alvo de 56 dp no Kids;
- o fora do escopo;
- apagar o branch velho só com o ok do dono.
