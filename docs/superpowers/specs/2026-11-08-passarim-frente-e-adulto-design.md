# Passarim — Frente E: jornada adulta com o PiuDS

Data: 2026-11-08 · Origem: PRD da guinada (`2026-10-16-passarim-guinada-prd.md`), seção 6, frente E · Desenho: `docs/design/direcoes-2026/canvas/Explorar.dc.html`, `Detalhe.dc.html` e `FavoritosConfiguracoes.dc.html` (nova, neste PR) · Regra de comentários: `~/dev/passarim/CLAUDE.md` · Depende de: C2 (componentes, mergeado) e frente B no BFF (no ar)

**Mudança de ordem:** o dono pediu a frente E antes da D e da G (2026-11-08), para ver o visual adulto novo no aparelho. Nada aqui depende da D nem da G: o item "Passarim Kids" das Configurações e o visualizador de fotos continuam com elas.

Decisões do redator estão marcadas com **[DR]** e listadas na seção 10.

## 1. Objetivo

Ligar às telas do adulto o que o PiuDS já tem: o mosaico, a "Ave do dia", os chips de bioma, a barra flutuante com desfoque, o Detalhe com a foto de ponta a ponta e a forma de onda do canto. E trazer do BFF o que a frente B já entrega e o app ainda não lê.

### Pronto quando

1. As telas batem com as pranchetas aprovadas (Explorar, Detalhe, Favoritos e Configurações).
2. Os snapshots estão em Piu claro e escuro, com fonte 1.0×, 1.3× e 2.0×.
3. A "Ave do dia" aparece no Explorar e some sem erro se o endpoint falhar.
4. A forma de onda do Detalhe usa os 64 picos reais.
5. Com "reduzir animações", nada anima, e nada some.

## 2. Dados (o que a frente B entrega e o app passa a ler)

- **`SpeciesSummary.primaryBiome: Biome?`** (do `primaryBiome` da lista do BFF). É o gradiente do card enquanto a foto não carrega, ou quando não há foto. Nulo, ou um bioma desconhecido, cai no gradiente do Pantanal **[DR]**.
- **"Ave do dia":** `FeaturedRepository.getFeaturedSpecies(): Result<FeaturedSpecies, DataError.Network>` em `core:domain`, com a implementação em `feature:explore:data` (`GET /v1/featured`). `FeaturedSpecies` traz a data, o `SpeciesSummary` e se há canto. Sem cache próprio: o BFF manda `Cache-Control` até a meia-noite de São Paulo.
- **Detalhe:** `primaryBiome` e `audio.peaks` (64 valores de 0 a 1) no `SpeciesDetail`. Sem picos (BFF antigo ou canto sem processar), a forma de onda é uma linha reta **[DR]**.
- **Título com a contagem:** a soma de `primaryBiomes` de `/v1/filters` (cada ave tem um bioma principal, então a soma é o total de aves) **[DR]**. Sem filtros, o título aparece sem a contagem.

## 3. Explorar

Prancheta `Explorar.dc.html`.

- **Título** "Explorar" e a contagem ("41 aves").
- **Busca:** o campo de hoje (`PiuSearchField`).
- **Chips de bioma** (`PiuBiomeChip`) numa linha que rola na horizontal: "Todos" e os biomas que têm aves. Tocar num chip aplica o filtro de bioma de hoje (o mesmo do sheet); tocar no marcado volta a "Todos". O sheet de filtros continua, para a UF **[DR]**.
- **"Ave do dia"** (`PiuFeaturedCard`), entre os chips e o mosaico, só sem busca e sem filtro **[DR]**:
  - tocar no card abre o Detalhe;
  - o botão de canto **abre o Detalhe tocando o canto** (`DetailRoute(id, autoPlay = true)`). Tocar o canto no próprio Explorar exigiria levar o player do Detalhe para um módulo comum; fica para quando outra tela pedir **[DR]**;
  - se o endpoint falhar, o card não aparece e nada avisa.
- **Mosaico** (`PiuMosaicCard`) num `LazyVerticalStaggeredGrid` de 2 colunas, alternando alto e baixo (`TALL`, `SHORT`, `SHORT`, `TALL`…). Com fonte a partir de 1.5×, **uma coluna** (regra da 5b, mantida).
- **Estados:** carregando, vazio, erro e "carregar mais" continuam os de hoje, no layout novo.

## 4. Barra flutuante

- A barra de baixo das abas vira a `PiuFloatingNavBar`, flutuando sobre o conteúdo, com Explorar, Favoritos e Configurações.
- O conteúdo das abas é marcado como fonte do desfoque (`piuBlurSource`) e ganha um espaço no fim para a barra não cobrir o último card.
- A barra respeita a área do gesto de navegação do sistema (`navigationBars`).

## 5. Detalhe

Prancheta `Detalhe.dc.html`.

- **Foto de ponta a ponta** no topo (uns 430 dp), que se funde ao fundo da tela com um degradê para a cor do fundo do tema.
- **Botões sobre a foto** (voltar e favoritar) em `PiuBlurSurface` circular de 48 dp, com a tinta translúcida do tema.
- **Título sobre a transição:** o nome e o nome científico em branco sobre o `photoTextScrim`, na parte de baixo da foto.
- **Player:** o botão de tocar em forma de cookie e a **forma de onda** com os 64 picos, com a parte já tocada na cor primária. A forma de onda é um componente do Detalhe (`Waveform`), não do PiuDS: só uma tela a usa (regra do 2) **[DR]**.
- **Fatos em blocos** (`PiuFactTile`, raio de 20 dp), como hoje, no visual novo.
- **Galeria:** continua como hoje. Abrir o visualizador é da frente G.
- **`autoPlay`:** a rota do Detalhe ganha `autoPlay: Boolean = false`. Com `true`, o canto toca ao abrir, como a preferência de reprodução automática já faz.

## 6. Transição do card para o Detalhe

- A foto viaja do card do mosaico (ou da "Ave do dia") para o topo do Detalhe, com `SharedTransitionLayout` envolvendo o NavHost da raiz e a chave `foto-<id>` **[DR]**.
- Com "reduzir animações", a transição é desligada, e a troca de tela é a de hoje.
- **Risco:** o mosaico fica dentro do NavHost das abas, e o Detalhe no da raiz. Se o elemento compartilhado não atravessar os dois NavHosts sem gambiarra, a transição fica de fora desta frente e vai para a H, registrada no PR **[DR]**.

## 7. Favoritos e Configurações

Prancheta `FavoritosConfiguracoes.dc.html` (nova).

- **Favoritos:** o mesmo mosaico do Explorar, com o título, a contagem ("4 aves guardadas") e o estado vazio de hoje.
- **Configurações:** os mesmos itens de hoje em grupos de cartões (raio de 24 dp): Aparência (o tema como botões segmentados e as cores dinâmicas), Reprodução, Dados e Sobre. A seção "Para crianças" entra com a frente D.

## 8. Testes

- **Dados:** os DTOs com `primaryBiome`, `peaks` e `/v1/featured` (com e sem os campos novos, como um BFF antigo responderia); a soma da contagem; o bioma desconhecido.
- **ViewModels:** o Explorar com a "Ave do dia" (aparece sem filtros; some com busca, com filtro e com erro); os chips (marcar, desmarcar, sincronia com o sheet); o canto da "Ave do dia" emite a navegação com `autoPlay`; o Detalhe com `autoPlay`.
- **Forma de onda:** a função pura que mapeia os picos e o progresso em barras (sem picos, linha reta; progresso 0 e 1).
- **Snapshots (Paparazzi):** Explorar (com a "Ave do dia", com filtro, carregando, vazio e erro), Detalhe (com e sem canto, com e sem picos), Favoritos (com aves e vazio) e Configurações, em Piu claro e escuro, a 1.0×, 1.3× e 2.0×. Os snapshots de hoje dessas telas são regravados, e o diff vai para o dono no PR.
- **Semântica:** a barra flutuante (abas), o mosaico e o Detalhe (botões sobre a foto com descrição e 48 dp).

## 9. Ordem de entrega **[DR]**

| # | PR | Repositório |
|---|---|---|
| 1 | Esta spec e a prancheta de Favoritos e Configurações | `passarim-docs` |
| 2 | **E1:** dados (`primaryBiome`, `peaks`, `/v1/featured`, a contagem), o Explorar novo e a barra flutuante | `passarim-app` |
| 3 | **E2:** o Detalhe novo (foto, título, forma de onda, `autoPlay`) e a transição | `passarim-app` |
| 4 | **E3:** Favoritos e Configurações | `passarim-app` |

O E1 vem primeiro porque é o que mais muda o app à primeira vista. Cada PR do app sai com o APK conferido no aparelho do dono.

## 10. Decisões do redator [DR]

1. A frente E vem antes da D e da G, a pedido do dono; o item "Passarim Kids" e o visualizador ficam com elas.
2. Sem `primaryBiome`, o card usa o gradiente do Pantanal.
3. Sem picos, a forma de onda é uma linha reta.
4. A contagem do título é a soma de `primaryBiomes` de `/v1/filters`.
5. Os chips de bioma usam o filtro de bioma de hoje; o sheet fica para a UF.
6. A "Ave do dia" aparece só sem busca e sem filtro, e some sem aviso se falhar.
7. O canto da "Ave do dia" abre o Detalhe tocando (`autoPlay`), em vez de tocar no Explorar.
8. A forma de onda é do Detalhe, não do PiuDS (regra do 2).
9. A transição usa `SharedTransitionLayout` na raiz; se não atravessar os dois NavHosts de forma limpa, vai para a frente H.
10. Três PRs no app: Explorar com a barra, Detalhe, e Favoritos com Configurações.
