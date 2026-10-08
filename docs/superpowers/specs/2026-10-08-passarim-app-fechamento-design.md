# Passarim — Etapa 5e: Fechamento do app (snapshots completos, iOS e release)

Data: 2026-10-08 · Depende de: 5a–5d · ADR-0010 (Paparazzi) · Spec geral §10, §11

Decisões do redator estão marcadas com **[DR]**.

## 1. Objetivo

Fechar a etapa 5: cobertura de snapshots de **todas** as telas e componentes, validação visual no iOS, build de release endurecido e a documentação que torna o app apresentável no portfólio. Nada de funcionalidade nova.

### Critérios de pronto
1. **Matriz de snapshots completa:** cada tela da `docs/design/mockups` (16) e cada componente do design system tem snapshot Paparazzi em **claro e escuro** e em fonte **1.0×, 1.3× e 2.0×** **[DR]**; as referências estão no repositório e `verifyPaparazzi` roda no CI a cada PR.
2. **Paridade com o design:** para cada tela, os snapshots em claro e escuro foram comparados visualmente com os PNGs do design; divergências corrigidas ou registradas em lista no README.
3. **iOS no simulador:** o app abre, navega pelas 3 abas, lista aves do compose local, abre o Detalhe, toca o canto, favorita e persiste (reabrir mostra os favoritos). Prints das telas principais em claro e escuro no README.
4. **Release:** `assembleRelease` com R8 e shrink de recursos; o APK roda sem `ClassNotFound`/`MissingKotlinReflection` (regras de keep para serialização e Room); HTTPS-only confirmado (cleartext bloqueado fora do debug).
5. **Acessibilidade:** passada com TalkBack no Android nas telas principais (rótulos, ordem de foco, alvos ≥ 48dp, estados anunciados, contraste já garantido pelos tokens); correções feitas.
6. **Resiliência demonstrada:** roteiro documentado e executado — derrubar uma réplica do BFF (`docker stop`) com o app em uso sem erro visível; derrubar o catalog e ver o app servir dado em cache/stale; sem rede e ver o estado "Sem conexão" e os favoritos.
7. **Documentação:** README do `passarim-app` com diagrama Mermaid dos módulos, como rodar (emulador, simulador, aparelho), como gerar snapshots, decisões (ADRs novos: Paparazzi × KMP, mapa, `AudioPlayer`, reescrita de mídia só em debug) e limitações conhecidas.
8. **CI final:** Linux (ktlint, detekt, testes, `verifyPaparazzi`, `assembleDebug`, `assembleRelease`) e macOS (link do framework iOS e, se viável, teste no simulador) **[DR]**; gitleaks, Dependabot e dependências verificadas. **Build falha em vulnerabilidade alta/crítica** nas dependências do app (regra do spec §9), com `osv-scanner` ou equivalente.
9. APK de release como artefato da pipeline.

**Fora do escopo:** publicação nas lojas, assinatura de release com chaves de produção, deploy dos serviços (etapa 6).

## 2. Trabalho

- **Snapshots:** completar a matriz acima; um utilitário `SnapshotTheme`/`@PreviewParameter` gera as combinações de tema e escala a partir de uma única lista de telas, para a matriz não ser copiada à mão. Telas com mapa e imagens usam placeholders determinísticos (rede e tiles são externos).
- **iOS:** corrigir o que só aparece no simulador (caminho do banco, `AVPlayer`, fontes, safe areas, teclado); sem lógica nova.
- **Release:** `proguard-rules.pro`/consumer rules (kotlinx.serialization, Ktor, Room, Koin), conferência do APK com `apkanalyzer`, e confirmação de que nenhum segredo nem URL local entra no build de release (`BASE_URL` de produção vem de BuildKonfig por tipo de build; o valor de produção chega na etapa 6).
- **Acessibilidade e fonte 2.0×:** a verificação do design só garantiu até 1.3×; a 2.0× entra no app. Telas que cortarem texto são ajustadas (itens em coluna única, quebra de linha, `heightIn` em vez de altura fixa).

## 3. Testes e verificação

| O quê | Como |
|---|---|
| Snapshots | `recordPaparazzi` local, `verifyPaparazzi` no CI; diff visível nos artefatos de falha |
| Release | `assembleRelease` no CI + teste de fumaça local do APK no emulador |
| iOS | roteiro manual no simulador, com prints versionados |
| Resiliência | roteiro manual com `docker stop`, resultados anotados no README |
| Dependências | scanner de vulnerabilidades no CI |

## 4. Riscos

| Risco | Mitigação |
|---|---|
| Matriz grande deixa o CI lento | rodar só `verifyPaparazzi` em PR; gravação local; paralelismo do Gradle |
| Snapshots instáveis entre máquinas | fixar JDK e versão do Paparazzi; gravar só no CI se divergir localmente **[DR]** |
| R8 quebra serialização/Room | regras de keep e teste de fumaça do APK de release |
| Teste de simulador iOS no macOS do CI é lento/instável | manter apenas o link; o roteiro iOS fica manual |

## 5. Decisões do redator **[DR]**

Escalas 1.0×/1.3×/2.0×; scanner de dependências no CI; teste no simulador iOS apenas manual; referências de snapshot regravadas no CI se o ambiente local divergir.

## 6. Depois da 5e

Etapa 6: deploy (Fly.io, Neon, Upstash, R2) e a `BASE_URL` de produção; itens P2 do `BACKLOG.md` (mTLS BFF↔catalog etc.).
