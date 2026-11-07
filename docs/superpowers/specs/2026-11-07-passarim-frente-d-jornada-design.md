# Passarim — Frente D: escolha de jornada e trava para adultos

Data: 2026-11-07 · Origem: PRD da guinada (`2026-10-16-passarim-guinada-prd.md`), seção 6, frente D · Desenho: `docs/design/direcoes-2026/canvas/Escolha.dc.html` e `KidsTrava.dc.html` (novas, neste PR) · Regra de comentários: `~/dev/passarim/CLAUDE.md` (todo código novo com comentários didáticos) · Depende de: frente B no BFF (no ar) e dos componentes Kids do C2 (app #30 e #32)

O dono delegou as decisões de design desta frente a um agente que o representou; o que esse agente decidiu está marcado com **[R]** e listado na seção 11. Onde esta spec ajusta o PRD, a seção 10 diz o quê.

## 1. Objetivo

Depois do splash, a pessoa escolhe entre **Passarim** e **Passarim Kids** e entra numa jornada própria. O app lembra a escolha. Do adulto para o Kids a troca é livre; do Kids para o adulto, passa por uma **trava para adultos**.

As telas Kids de verdade são da frente F. Aqui o Kids é uma **casca** **[R]**: a barra do Kids com as abas Explorar e Álbum, cada uma só com o Pipo ("Logo, logo tem aves aqui!"), e o botão "Para adultos". Assim a troca de jornada e a trava ficam verificáveis no app sem expor telas adultas, com links externos, dentro do Kids.

### Pronto quando

1. A primeira abertura mostra a Escolha.
2. As aberturas seguintes vão direto à última jornada.
3. Sair do Kids exige acertar a conta da trava.
4. Trocar de jornada não muda o tema nem a reprodução automática gravados pelo adulto.
5. Com um BFF sem a frente B, o Kids não aparece em lugar nenhum.

## 2. Dados

### 2.1 Jornada nas preferências

- `Settings` ganha `journey: Journey? = null`. Nula quer dizer primeira abertura. `Journey { ADULT, KIDS }` já existe em `core:domain` (C1).
- `SettingsRepository` ganha `suspend fun setJourney(journey: Journey)`, no padrão do `setTheme` e do `setAutoPlay`.
- `DataStoreSettingsRepository` grava a chave `journey` com o nome do enum. Um valor desconhecido lido do arquivo vira `null` (a Escolha aparece de novo), como o tema faz hoje com o padrão.
- **O DataStore é a única fonte da jornada** **[R]**: nenhuma tela guarda a jornada em memória.

### 2.2 O Kids está disponível?

- **Regra** **[R]:** o Kids está disponível quando `GET /v1/filters?audience=kids` traz `primaryBiomes` com a soma das contagens maior que zero.
  - Um BFF sem a frente B ignora o `audience` e devolve filtros sem `primaryBiomes`: o Kids fica escondido.
  - Um catalog sem conteúdo Kids devolve contagens zero: o Kids também fica escondido, em vez de abrir sem aves.
- **Interface** **[R]:** `KidsAvailabilityRepository` em `core:domain`, com `suspend fun checkKidsAvailability(): Result<Boolean, DataError.Network>`.
- **Implementação** **[R]:** em `feature:explore:data`, onde já estão o `HttpClient` e o DTO de `/v1/filters`. O `FiltersDto` ganha `primaryBiomes` opcional (a frente F o reaproveita no álbum). A chamada não passa pelo cache em memória do `RemoteFiltersRepository`.
- **Nada é gravado:** a checagem roda ao abrir a Escolha e ao abrir as Configurações.

## 3. Navegação

- A raiz é um `when (journey)` **[R]**:
  - `null`: a Escolha;
  - `ADULT`: o NavHost do adulto (o de hoje, com as abas e as telas por cima);
  - `KIDS`: o NavHost do Kids (a casca e a trava).
- **Trocar de jornada é só chamar `setJourney`.** A raiz recompõe com o outro NavHost, e a pilha anterior some junto com ele. Não há `navigate` com `popUpTo` entre jornadas.
- **Splash:** o do Android continua esperando o DataStore (`onSettingsLoaded`). No iOS não há splash que espere; a tela de abertura cobre o intervalo.
- **A Escolha é raiz:** não tem "voltar". O voltar do sistema fecha o app sem gravar nada, e a próxima abertura mostra a Escolha de novo.
- **As rotas só ligam as peças.** Efeitos (`LaunchedEffect`, `collect`) ficam nas telas; eventos de uma vez chegam às telas como `Flow` mais um callback (regra do projeto).

## 4. Telas

### 4.1 Escolha (`feature:journey:presentation`)

- **Tema:** o do adulto (Piu), seguindo o modo escolhido.
- **Conteúdo** (prancheta `Escolha.dc.html`): o título "Quem vai explorar as aves?", o aviso "Dá para trocar depois, nas Configurações" e dois cartões grandes, cada um com uma prévia do próprio visual. A prévia do Kids é sempre clara.
- **Estados do cartão Kids** **[R]:**

  | Estado | Cartão Kids |
  |---|---|
  | Conferindo | Visível e desabilitado |
  | Disponível | Habilitado |
  | Sem rede ou erro | Desabilitado, com "Precisa de internet na primeira vez" e o botão "Tentar de novo" |
  | BFF sem a frente B (ou sem aves Kids) | Escondido |

- O cartão do adulto está sempre habilitado. Tocar num cartão grava a jornada.

### 4.2 Casca Kids (`app/kids/KidsTabsScreen.kt`) **[R]**

- Fica no `app`, ao lado do `TabsScreen` do adulto.
- A `PiuKidsNavBar` com Explorar, Álbum e o botão "Para adultos". Cada aba mostra o `PiuPipoBalloon` com "Logo, logo tem aves aqui!". A frente F troca o conteúdo das abas e apaga esse texto.
- **"Para adultos"** **[R]:** o terceiro lugar da barra, onde as pranchetas tinham "Ajustes", com cadeado e rótulo, visual de item inativo e alvo de 56 dp. Para o leitor de tela é um **botão** (`Role.Button`), fora do grupo de abas.
  - A `PiuKidsNavBar` ganha um parâmetro opcional para esse botão, com snapshot, no PR 3 desta frente.
  - As pranchetas `KidsExplorar` e `KidsAlbum` trocam "Ajustes" por "Para adultos" neste PR.

### 4.3 Trava para adultos (`feature:journey:presentation`) **[R]**

- **Rota:** `KidsGateRoute`, uma tela no grafo do Kids, no tema Kids (prancheta `KidsTrava.dc.html`).
- **Pergunta:** uma multiplicação por extenso, como "Quanto é treze vezes sete?".
  - O primeiro fator vai de 13 a 99, sem múltiplos de 10 nem de 11. O segundo vai de 3 a 9 (o ×2 é só dobrar).
  - A conta nova nunca repete a anterior. O sorteio usa um `Random` injetado, para o teste.
  - O número por extenso sai de uma função pura, testada (`numberInWords`).
- **Resposta:** um teclado próprio na tela, com 0 a 9, apagar e confirmar, feito de `PiuKidsButton` (64 dp). O teclado do sistema não é usado. A resposta tem no máximo 3 algarismos (99 × 9 = 891).
- **Acertou:** grava `ADULT`, e a raiz abre o adulto. A "Área Para adultos" (cache, Sobre, Licenças) é da frente F.
- **Errou:** "Ops, essa não. Tente esta!" e uma conta nova, **sem limite de tentativas e sem espera**.
- **Voltar:** o botão "Voltar" e o voltar do sistema fecham a trava e ficam no Kids.
- **Acessibilidade:**
  - a pergunta inteira e a mensagem de erro são anunciadas em `liveRegion` (Polite);
  - as teclas de apagar e de confirmar têm rótulo ("Apagar", "Confirmar");
  - a resposta digitada não aparece na árvore de acessibilidade;
  - a tela rola com fonte 2.0×.
- **A trava desencoraja, mas não impede**, uma criança de 12 anos. É a decisão do PRD e fica registrada.
- **Processo morto com a trava aberta:** ela volta com uma conta nova e sem os algarismos digitados. A jornada continua `KIDS`.

### 4.4 Configurações do adulto **[R]**

- Uma seção nova no topo, **"Para crianças"**, com o item "Passarim Kids" e o subtítulo "Abre a versão para crianças. Para voltar, um adulto resolve uma conta."
- **Troca na hora, sem confirmação** (decisão 2 do dono): grava `KIDS`, e a raiz abre a casca.
- Segue os estados da seção 4.1:
  - sem o Kids no BFF, a seção não aparece;
  - sem rede, o subtítulo vira "Precisa de internet", e o toque confere de novo.

## 5. Tema e barras do sistema

- O `App` passa a jornada ao `PiuTheme(journey, themeMode, dynamicColor)`. No Kids, o tema já ignora o modo e as cores dinâmicas sem gravar nada (C1).
- `SystemBarsAppearance` passa a seguir `PiuTheme.isDark`, chamado dentro do tema. Isso resolve o `TODO(frente-D)` do `App.kt`: no Kids, os ícones das barras ficam escuros mesmo com o adulto em tema escuro.
- **O Kids não altera as preferências do adulto:** o tema, as cores dinâmicas e a reprodução automática continuam como estão gravados. O canto no Kids só existe na frente F, e lá a reprodução automática fica desligada.

## 6. Textos

Todos em `composeResources`, só em pt-BR: o título e os cartões da Escolha, os estados do cartão Kids, a seção das Configurações, a frase da casca, a trava (pergunta, erro, rótulos das teclas, "Voltar", "Só para adultos") e os números por extenso.

## 7. Testes

- **Dados:**
  - DataStore: jornada nula por padrão, `setJourney` persiste, e as outras chaves (tema, cores, reprodução automática) ficam intactas;
  - um valor desconhecido vira `null`;
  - `checkKidsAvailability`: disponível com `primaryBiomes` e soma maior que zero; indisponível sem `primaryBiomes` (BFF antigo) e com soma zero; erro de rede vira `DataError.Network`.
- **Domínio puro:** `numberInWords` de 3 a 891 (com os casos "cem", "cento e um", "duzentos" e "onze"); o sorteio da conta com `Random` fixo (faixas, sem múltiplos de 10 e 11, sem repetir a anterior).
- **ViewModels:**
  - Escolha: os quatro estados do cartão Kids, "Tentar de novo", e a escolha grava a jornada;
  - Trava: acerto grava `ADULT`; erro mostra a mensagem e sorteia outra; voltar não grava nada; o teclado limita a 3 algarismos e apagar remove o último;
  - Configurações: o item Kids segue os estados e grava `KIDS`.
- **Raiz:** com jornada nula abre a Escolha; com `ADULT` e `KIDS`, o NavHost certo.
- **Tema:** `PiuTheme(journey = KIDS)` com tema escuro salvo continua claro, e as barras seguem o `isDark` efetivo.
- **Semântica:** "Para adultos" é botão e não aba; a pergunta e o erro em `liveRegion`; a resposta fora da árvore; alvos de 56 dp no Kids e de 48 dp na Escolha.
- **Snapshots (Paparazzi):** a Escolha em Piu claro e escuro, nos quatro estados do cartão Kids; a casca e a trava (com a pergunta e depois do erro) em Kids claro; a `PiuKidsNavBar` com "Para adultos"; a seção nova das Configurações. Todos com fonte 1.0×, 1.3× e 2.0×.
- **iOS:** a verificação no simulador fica pendente do Xcode 26 selecionado (risco já registrado no PRD).

## 8. Ordem de entrega **[R]**

| # | PR | Repositório | Depende de |
|---|---|---|---|
| 1 | Esta spec e as pranchetas (`Escolha`, `KidsTrava`, e "Para adultos" em `KidsExplorar` e `KidsAlbum`) | `passarim-docs` | — |
| 2 | Domínio e dados: `Settings.journey`, `setJourney`, DataStore, `KidsAvailabilityRepository` e a implementação com o `primaryBiomes` no `FiltersDto` | `passarim-app` | — |
| 3 | `feature:journey:presentation` (Escolha, trava, `numberInWords`), a casca Kids, a raiz por jornada, o tema e as barras, a seção das Configurações e o botão "Para adultos" na `PiuKidsNavBar` | `passarim-app` | PR 2 e os PRs #30 e #32 do C2 |

O PR 2 pode abrir antes do merge do C2. O plano é escrito depois que o dono aprovar esta spec.

## 9. Fora do escopo

- as telas Kids de verdade, a área "Para adultos" depois da trava e o álbum (frente F);
- conferir `kids` e `primaryBiome` em cada resposta, para o caso de o BFF perder o Kids com alguém já no Kids (frente F);
- ir do adulto ao Kids sem rede, mesmo para quem já entrou no Kids antes (limitação aceita; a F pode rever);
- o enquadramento da Escolha na política Families do Google Play (frente H);
- narração e outros idiomas (PRD).

## 10. Ajustes ao PRD

1. **O sinal de "BFF com Kids"** deixa de ser o campo `kids` (que só vem no detalhe de uma ave) e passa a ser `primaryBiomes` com soma maior que zero em `/v1/filters?audience=kids` **[R]**.
2. **O "Para adultos"** ocupa o terceiro lugar da barra do Kids, no lugar dos "Ajustes" das pranchetas, como botão **[R]**. As pranchetas foram atualizadas.
3. **Na frente D, o Kids é uma casca**, e a trava leva direto ao adulto. A área "Para adultos" fica com a frente F **[R]**.

## 11. Decisões do representante [R]

1. Na D, o Kids é uma casca: `PiuKidsNavBar` com Explorar e Álbum, cada aba com o `PiuPipoBalloon` dizendo "Logo, logo tem aves aqui!"; a casca fica em `app/kids`, e a F troca o conteúdo das abas.
2. O Kids está disponível quando `GET /v1/filters?audience=kids` traz `primaryBiomes` com soma maior que zero; nada é gravado.
3. O cartão Kids da Escolha tem quatro estados (conferindo, disponível, sem rede, escondido); o adulto entra sempre.
4. O "Para adultos" é o terceiro lugar da `PiuKidsNavBar`: cadeado, rótulo, alvo de 56 dp, `Role.Button` fora do grupo de abas, com um parâmetro opcional novo no componente.
5. Depois da trava, a jornada passa a `ADULT`, e o app abre as abas do adulto.
6. A trava é a rota `KidsGateRoute` no grafo Kids, no tema Kids, com teclado próprio de `PiuKidsButton` e resposta de até 3 algarismos.
7. A conta: 13 a 99 (sem múltiplos de 10 e de 11) vezes 3 a 9, por extenso, nunca repetindo a anterior, com `Random` injetado; `numberInWords` é uma função pura testada.
8. Errou: "Ops, essa não. Tente esta!" e uma conta nova, sem limite nem espera; "Voltar" e o voltar do sistema ficam no Kids.
9. A pergunta e o erro em `liveRegion` (Polite), as teclas com rótulo, a resposta fora da árvore de acessibilidade, e a tela rola com fonte 2.0×.
10. A seção nova "Para crianças" no topo das Configurações, com o item "Passarim Kids", troca na hora, sem confirmação, e segue os estados do cartão.
11. O DataStore é a única fonte da jornada; a raiz é `when (journey)`, e trocar de jornada é só `setJourney`.
12. O splash do Android segura até o DataStore carregar; a Escolha não tem voltar, e sair dela pelo sistema não grava nada.
13. `PiuTheme` recebe a jornada na raiz, e `SystemBarsAppearance` segue `PiuTheme.isDark`; a Escolha usa o Piu, com a prévia do Kids sempre clara.
14. Trocar de jornada não grava tema nem reprodução automática, com testes do DataStore e do tema.
15. As pranchetas novas `Escolha.dc.html` e `KidsTrava.dc.html` entram neste PR, e `KidsExplorar` e `KidsAlbum` trocam "Ajustes" por "Para adultos".
16. `KidsAvailabilityRepository.checkKidsAvailability()` fica em `core:domain`, com a implementação em `feature:explore:data`, sem o cache do `RemoteFiltersRepository` e sem módulo core novo.
17. Três PRs: docs; domínio e dados (sem depender do C2); a apresentação, a casca, a raiz e as Configurações (depois do C2).
18. Riscos aceitos: a trava desencoraja sem impedir; a F confere `kids` e `primaryBiome` em cada resposta; processo morto volta com outra conta; sem rede não se vai do adulto ao Kids; o iOS fica pendente do Xcode 26.
