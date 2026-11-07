# ADR-0023: Haze para o desfoque, isolado no `PiuBlurSurface`

- **Status:** Aceita
- **Data:** 2026-11-07

## Contexto

As direções de 2026 põem superfícies de "vidro fosco" sobre as fotos: a barra flutuante do adulto desfoca o
conteúdo que passa por baixo dela. O Compose Multiplatform não desfoca o que está **atrás** de um elemento: o
`Modifier.blur` borra o próprio conteúdo. A biblioteca que faz isso no Android e no iOS é a Haze, de Chris Banes
(Apache 2.0).

A spec da frente C (seção 7) previa a Haze 2.0 em beta e pedia um teste de iOS antes de decidir. Na hora do plano C2,
a 2.0.1 já era estável. O teste do C2 deu:

- a Haze 2.0.1 (`haze` e `haze-blur`) tem artefatos para `iosArm64` e `iosSimulatorArm64` e funciona com o Compose
  Multiplatform 1.12 do app (ADR-0019);
- os testes do `core:piu-ds` no simulador iOS linkam e passam com ela;
- o snapshot do Paparazzi mostra o desfoque no Android.

Nenhuma tela usa o desfoque ainda: ver o efeito rodando no simulador iOS fica para a frente E, quando a barra
flutuante entra numa tela.

## Decisão

- O desfoque usa a **Haze 2.0.1** (`dev.chrisbanes.haze:haze` e `haze-blur`), como `implementation` do `core:piu-ds`,
  nas duas plataformas.
- **Só o arquivo `PiuBlurSurface.kt` importa a Haze.** O resto do app usa `rememberPiuBlurState`,
  `Modifier.piuBlurSource` e `PiuBlurSurface`, que não expõem nenhum tipo da Haze.
- **O contraste não depende do desfoque:** o que vai sobre a superfície é legível só com a tinta translúcida dela.
  O desfoque é decoração.

## Consequências

- Três artefatos novos no app (`haze`, `haze-blur` e `haze-utils`), todos Apache 2.0, na tela de Licenças.
- Se a Haze quebrar numa versão nova, ou não desfocar no iOS na frente E, troca-se só o `PiuBlurSurface.kt` por um
  fundo translúcido sem desfoque (ou por um `expect/actual` com esse fundo só no iOS). Nenhuma tela muda, e o
  contraste continua o mesmo.
- A Haze é uma biblioteca de uma pessoa: atualizações dela pedem um olhar no snapshot do desfoque
  (`PiuCommonComponentsSnapshotTest.cookieAndBlur`) antes do merge.
