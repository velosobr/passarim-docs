# Direções visuais 2026: Passarim e Passarim Kids

Referência de design para a guinada do app (outubro de 2026). Duas direções nasceram de uma pesquisa sobre o
Android atual (Material 3 Expressive) e de uma auditoria das telas da etapa 5:

- **Passarim** (adulto): moderno, fotos em destaque, gradientes por bioma.
- **Passarim Kids**: a mesma base traduzida para crianças, com um passarinho guia, cores vivas, formas redondas e
  um álbum de figurinhas.

São **propostas de direção**, não telas finais: as fotos aparecem como gradientes, e os textos são exemplos. As
cores ainda precisam passar pela verificação de contraste de `docs/design/tools` antes de virar token.

## Onde ver

- **Canvas interativo:** <https://claude.ai/artifact/DthZynrHzz3Z9xwXTYreBk> (privado do dono; compartilhe pelo
  menu Share). Linha de cima: Passarim; linha de baixo: Kids.
- **Fontes das pranchetas:** `canvas/*.dc.html` nesta pasta (HTML com estilos inline: as cores, os tamanhos e
  os textos podem ser lidos direto do arquivo). `canvas/canvas.json` guarda a posição de cada prancheta.

| Prancheta | Arquivo | O que mostra |
|---|---|---|
| Sistema visual (adulto) | `canvas/Main.dc.html` | Gradientes por bioma, scrim de foto, formas e movimento |
| Explorar (adulto) | `canvas/Explorar.dc.html` | Título, busca, chips de bioma, "Ave do dia", grade em mosaico com texto sobre a foto, barra de navegação flutuante |
| Detalhe (adulto, escuro) | `canvas/Detalhe.dc.html` | Foto em tela cheia que se funde ao fundo, título sobre a foto, player com forma de onda, fatos |
| Sistema visual (Kids) | `canvas/KidsSistema.dc.html` | O guia Pipo, os "mundos", tipografia, botões e recompensa |
| Explorar (Kids) | `canvas/KidsExplorar.dc.html` | Balão do Pipo, busca, "Escolha um mundo", ave do dia, cards |
| Detalhe (Kids) | `canvas/KidsDetalhe.dc.html` | Foto em forma de "cookie", "Ouvir o canto!", fatos comparados com a criança, "Você sabia?" |
| Meu álbum (Kids) | `canvas/KidsAlbum.dc.html` | Favoritos como figurinhas, progresso por mundo, espaços "?" |

## Passarim (adulto)

**Princípios:** a foto é a protagonista; gradiente só com função (identificar o bioma, fundir a foto ao
conteúdo); o verde da marca continua primário; o selo de conservação nunca usa gradiente.

**Gradientes por bioma** (135°, do escuro ao claro):

| Bioma | De | Até |
|---|---|---|
| Amazônia | `#063D27` | `#3FA66B` |
| Mata Atlântica | `#0D4F45` | `#4DAA7E` |
| Cerrado | `#6E3A0E` | `#D9A13B` |
| Caatinga | `#5C2414` | `#D07A4E` |
| Pantanal | `#0E3A57` | `#3E9CB5` |
| Pampa | `#3E4A12` | `#A3AE4E` |

**Componentes e padrões:**

- **Scrim de foto:** gradiente de transparente a `rgba(16,20,16,0.8)` nos 60–75% de baixo da foto, com texto
  branco por cima (nome em 16–26 px, bold).
- **Cards:** raio 24 dp, grade em mosaico de 2 colunas (alturas alternadas), coração em círculo translúcido de
  44 dp.
- **"Ave do dia":** card largo, raio 28 dp, com selo, nome, nome científico e botão de canto.
- **Detalhe:** foto de ~430 px de altura que se funde ao fundo, botões translúcidos de 48 dp sobre ela, título de
  36 px sobre a transição, fatos em blocos de raio 20 dp.
- **Player:** botão em forma "cookie" e forma de onda com a parte tocada na cor primária.
- **Navegação:** barra flutuante em pílula (raio 34 dp), com o item ativo expandido com rótulo, no estilo da
  `ShortNavigationBar`.
- **Movimento:** elemento compartilhado do card para a foto do Detalhe, molas do `MotionScheme` expressivo,
  desfoque nas barras sobre a foto; tudo desligado com "reduzir animações".

**Fonte:** Manrope (a atual), com títulos em 800.

## Passarim Kids

**Princípios:** fala com a criança (frases curtas, sem nome científico em destaque); toque grande e firme;
recompensa gentil (álbum que cresce, sem sequência diária, sem pressa, sem anúncio); cores fortes, mas com
texto legível.

**Guia:** o **Pipo**, um passarinho amarelo (`#FFC93C`) com asa laranja (`#FF8A3D`) e bico coral (`#FF6B4A`), que
aparece em balões de fala ("Qual ave vamos conhecer hoje?", "Você sabia?").

**Base:** fundo creme `#FFF7E8`, texto azul-noite `#1D2B3A`, cartões brancos com sombra sólida `0 4px 0 #F2E3C6`.

**"Mundos" (biomas)**, gradiente 150°:

| Mundo | De | Até | Texto sobre o gradiente |
|---|---|---|---|
| Amazônia | `#9BE15D` | `#1F9D55` | `#0B2A17` |
| Mata Atlântica | `#6EE7C0` | `#13A38B` | `#0B2A17` |
| Cerrado | `#FFE066` | `#FF9F1C` | `#3A2200` |
| Caatinga | `#FFB38A` | `#E5533D` | `#3A1208` |
| Pantanal | `#7DD3FC` | `#2B7FD8` | `#0A2440` |
| Pampa | `#E4F57A` | `#7CB342` | `#1F2A0A` |

**Componentes e padrões:**

- **Botões:** altura 56–72 dp, raio total, sombra sólida que "afunda" ao tocar (por exemplo, laranja `#FF8A3D`
  com sombra `0 5px 0 #C9601E`).
- **Busca:** campo de 56 dp com borda de 3 dp na cor do texto.
- **Detalhe:** a foto dentro de uma forma "cookie", o mundo da ave no topo, o botão "Ouvir o canto!" com forma de
  onda, fatos comparados com a criança ("1 metro: quase do seu tamanho!") e o selo de conservação em linguagem
  simples ("Precisa da nossa ajuda para não sumir").
- **Meu álbum:** favoritos viram figurinhas "cookie" na cor do mundo; progresso por mundo ("4 de 9"); espaços
  tracejados com "?" para as que faltam.
- **Navegação:** barra escura flutuante (raio 38 dp, 76 dp de altura), com o item ativo em amarelo.

**Fontes:** Fredoka (títulos, 600–700) e Nunito (texto, 600–800).

## Pesquisa que embasou as direções (outubro de 2026)

- **Material 3 Expressive** é o visual padrão do Android: cores mais vivas, formas como a "cookie", movimento
  com molas e componentes novos. O Android 17 usa superfícies com desfoque tingidas pelas cores dinâmicas.
- **No conjunto de versões do app** (Compose Multiplatform 1.12.1, Material 3 1.9.0, que é o `androidx` 1.4.0):
  **correção de 2026-10-28** — `MaterialExpressiveTheme` e `MotionScheme` são **internos** nessa versão (o compilador
  recusa), e só ficam públicos a partir do CMP material3 1.13.0-beta01 (`androidx` 1.5.0-beta02). `ShortNavigationBar`
  e o carrossel existem, mas são experimentais. `LoadingIndicator`, `MaterialShapes` e `ButtonGroup` só existem nas
  versões alpha. O PiuDS fica no Material estável e adota o expressivo quando ele sair em versão estável.
- **Peças possíveis em KMP:** elementos compartilhados (Compose Multiplatform), desfoque com a biblioteca Haze
  (2.0 em beta), formas e morfologia com `graphics-shapes`.

Fontes: [release notes do Compose Material 3](https://developer.android.com/jetpack/androidx/releases/compose-material3),
[Material 3 em I/O 2026](https://m3.material.io/blog/whats-new-at-io26),
[Material 3 Expressive (Android Authority)](https://www.androidauthority.com/google-material-3-expressive-features-changes-availability-supported-devices-3556392/),
[Android 17 e o desfoque (Android Central)](https://www.androidcentral.com/apps-software/android-os/android-17-might-be-getting-a-glassy-ios-style-look),
[Compose Multiplatform 1.10](https://kotlinlang.org/docs/multiplatform/whats-new-compose-110.html),
[MaterialShapes no Compose Multiplatform](https://kotlinlang.org/api/compose-multiplatform/material3/androidx.compose.material3/-material-shapes/),
[Haze 2.0.0-beta03](https://newreleases.io/project/github/chrisbanes/haze/release/2.0.0-beta03).

## Auditoria das telas da etapa 5 (o que motivou a mudança)

- O Explorar é uma grade de cards iguais, sem título nem destaque, com o texto num bloco separado da foto.
- No Detalhe, a foto é um retângulo solto e o título vem depois dela.
- Quase só verde: a terciária âmbar mal aparece.
- Barra de navegação padrão e nenhum movimento entre telas.
