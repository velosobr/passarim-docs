# Passarim — Etapa 5e: Fechamento do app (snapshots completos, iOS e release)

Data: 2026-10-08 · Depende de: 5a–5d · ADR-0010 (Paparazzi) · Spec geral §10, §11

Decisões do redator estão marcadas com **[DR]**.

## 1. Objetivo

Fechar a etapa 5: cobertura de snapshots de **todas** as telas e componentes, validação visual no iOS, build de release endurecido e a documentação que torna o app apresentável no portfólio. Nada de funcionalidade nova.

### Critérios de pronto
1. **Matriz de snapshots completa:** cada tela da `docs/design/mockups` (as 15 que o app renderiza; a splash é da SplashScreen API do sistema e tem comparação visual própria, critério 2) e cada componente do design system tem snapshot Paparazzi em **claro e escuro**, cada um em fonte **1.0×, 1.3× e 2.0×** **[DR]**; as referências estão no repositório e `verifyPaparazzi` roda no CI a cada PR. As fatias 5a–5d já gravaram a matriz das suas telas; aqui ela é completada e conferida.
2. **Paridade com o design:** para cada tela, os snapshots em claro e escuro foram comparados visualmente com os PNGs do design (a splash, com o ícone renderizado do `splash.svg`); divergências corrigidas ou registradas em lista no README.
3. **iOS no simulador:** o app abre, navega pelas 3 abas, lista aves do compose local, abre o Detalhe, toca o canto, favorita e persiste (reabrir mostra os favoritos). Prints das telas principais em claro e escuro no README. (O áudio e o mapa no iOS já foram verificados nas fatias 5c; aqui o roteiro cobre o app inteiro.)
4. **Release:** `assembleRelease` com R8 e shrink de recursos; o APK roda sem `ClassNotFound`/`MissingKotlinReflection` (regras de keep para serialização e Room); HTTPS-only confirmado (cleartext bloqueado fora do debug); nenhum segredo nem URL local no build (§2).
5. **Acessibilidade:** passada com TalkBack no Android nas telas principais (rótulos, ordem de foco, alvos ≥ 48dp, estados anunciados, contraste já garantido pelos tokens); correções feitas.
6. **Resiliência demonstrada:** roteiro documentado e executado, com o resultado esperado **por tela** (§3): derrubar uma réplica do BFF (`docker stop`) com o app em uso sem erro visível; derrubar o catalog e ver o app servir dado em cache/stale onde houver; sem rede e ver "Sem conexão" e os favoritos.
7. **Testes de UI:** um conjunto pequeno de testes com Compose UI Test (spec geral §10): trocar de aba mantém o estado, favoritar no card reflete na aba Favoritos, trocar o tema muda o esquema.
8. **Documentação:** README do `passarim-app` com diagrama Mermaid dos módulos, como rodar (emulador, simulador, aparelho), como gerar snapshots, decisões (os ADRs de cada fatia, mais o que faltar), e limitações conhecidas (incluindo qualquer tela que ainda não passe a 2.0×).
9. **CI final:** Linux (ktlint, detekt, testes, `verifyPaparazzi`, `assembleDebug`, `assembleRelease`, `osv-scanner`) e macOS (link do framework iOS, `xcodebuild` do `iosApp` e, se viável, teste no simulador) **[DR]**; gitleaks e Dependabot. **Build falha em vulnerabilidade alta/crítica** nas dependências do app (regra do spec §9).
10. APK de release como artefato da pipeline.

**Fora do escopo:** publicação nas lojas, assinatura de release com chaves de produção, deploy dos serviços (etapa 6).

## 2. Trabalho

- **Snapshots:** completar a matriz acima; um utilitário `SnapshotTheme`/`@PreviewParameter` gera as combinações de tema e escala a partir de uma única lista de telas, para a matriz não ser copiada à mão. Telas com mapa e imagens usam placeholders determinísticos (rede e tiles são externos).
- **iOS:** corrigir o que só aparece no simulador (caminho do banco, fontes, safe areas, teclado); sem lógica nova.
- **Build types [DR]:** três — `debug`; **`releaseLocal`** (R8 e shrink ligados, assinado com a chave de debug, aponta para o compose local com cleartext permitido; **nunca publicado**, existe para o teste de fumaça); e **`release`** (HTTPS-only, `baseUrl` de produção). O valor de produção só chega na etapa 6; até lá o `release` usa um endereço `https://` reservado e inválido, de modo que o APK de release nunca fala com o ambiente local.
- **Release:** `proguard-rules.pro`/consumer rules (kotlinx.serialization, Ktor, Room, Koin), conferência dos APKs com `apkanalyzer`, e confirmação de que nenhum segredo nem URL local entra no `release` (a configuração vem de `AppConfig`, 5a §5).
- **Acessibilidade e fonte 2.0×:** a verificação do design só garantiu até 1.3×; a 2.0× já entra na matriz de cada fatia (a regra de reflow vem da 5b: menos colunas, quebra de linha, `heightIn` em vez de altura fixa). Aqui se fecham as telas que ainda cortarem texto.

## 3. Testes e verificação

| O quê | Como |
|---|---|
| Snapshots | `recordPaparazzi` local com o JDK fixado; `verifyPaparazzi` no CI; diff visível nos artefatos de falha |
| Release | `assembleRelease` no CI; teste de fumaça local do **`releaseLocal`** no emulador (partida, Explorar, Detalhe, favoritos e telas de erro, contra o compose local) |
| Compose UI Test | critério 7, no `androidInstrumentedTest`/`androidUnitTest` conforme o conjunto de versões da 5a |
| iOS | roteiro manual no simulador, com prints versionados |
| Resiliência | roteiro manual com `docker stop`, resultados anotados no README |
| Dependências | `osv-scanner` no CI |

**Resultado esperado do roteiro de resiliência (BFF com o catalog fora):** o BFF serve stale só para chaves já cacheadas (lista sem `q` e detalhe já abertos); busca com `q` não é cacheada e mostra "Serviço indisponível"; um detalhe nunca aberto mostra "Serviço indisponível". Com as duas réplicas do BFF fora, toda tela de rede mostra "Serviço indisponível" (e não "ave não encontrada"); os favoritos continuam. Sem rede, "Sem conexão" e os favoritos.

## 4. Riscos

| Risco | Mitigação |
|---|---|
| Matriz grande (15 telas × 2 temas × 3 escalas, mais componentes) deixa o CI lento | rodar só `verifyPaparazzi` em PR; gravação local; paralelismo do Gradle |
| Snapshots instáveis entre máquinas | fixar JDK e versão do Paparazzi; se divergir no CI, um workflow manual `record-snapshots` (`workflow_dispatch`) regrava e abre o commit com as referências **[DR]** |
| R8 quebra serialização/Room | regras de keep e teste de fumaça do `releaseLocal` |
| Teste de simulador iOS no macOS do CI é lento/instável | manter só o link e o `xcodebuild`; o roteiro iOS fica manual |

## 5. Decisões do redator **[DR]**

Escalas 1.0×/1.3×/2.0× em todas as fatias; scanner de dependências desde a 5a; teste no simulador iOS apenas manual; regravação de referências por workflow manual; build type `releaseLocal` só para fumaça.

## 6. Depois da 5e

Etapa 6: deploy (Fly.io, Neon, Upstash, R2) e a `baseUrl` de produção; itens P2 do `BACKLOG.md` (mTLS BFF↔catalog etc.).
