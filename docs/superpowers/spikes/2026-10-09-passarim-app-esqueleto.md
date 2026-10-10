# Esqueleto validado da 5a (ponto de retomada)

Data: 2026-10-09 · Continua: `2026-10-09-passarim-app-versoes.md` · Spec: `docs/superpowers/specs/2026-10-08-passarim-app-fundacao-design.md`

O plano de implementação da 5a **ainda não foi escrito**. Antes de escrevê-lo, construí e validei o esqueleto inteiro da 5a para o plano embutir código que já compila e passa. Este documento diz onde ele está, o que foi provado, o que descobri no caminho e o que falta.

## Onde está

Repositório **local** `~/dev/passarim/passarim-app`, branch `main`, commit `5e53bb2` ("chore: esqueleto validado da fundação do app (etapa 5a)"). **Sem remoto**: o repositório `velosobr/passarim-app` no GitHub ainda não foi criado (decisão do dono: visibilidade e momento).

```text
passarim-app/
  build-logic/        convention plugins (precompiled scripts): kmp-library, kmp-compose, serialization,
                      ios-framework, android-application, paparazzi, detekt
  core/domain         Result, DataError (selado), AppConfig, Filters, ConservationStatus   [5 testes]
  core/data           HttpClient (Ktor), safeCall, RemoteFiltersRepository, módulo Koin     [13 testes]
  core/presentation   UiText, ObserveAsEvents, DataError -> UiText                         [6 testes]
  core/design-system  tema (cores, 15 estilos Manrope, formas), ConservationBadge          [4 testes]
  core/database       stub vazio (ainda sem plugin: ver "Falta")
  app                 App(), NavHost raiz + abas, DebugViewModel (MVI), Koin, MainViewController (iOS)  [5 testes]
  androidApp          Application, Activity, splash, ícone adaptativo, cleartext só no debug
  iosApp              projeto Xcode gerado por XcodeGen, ATS só no Debug, AppIcon e Launch Screen
  snapshots           Paparazzi: selo de conservação em claro/escuro × 1.0×/1.3×/2.0× (6 referências)
```

## O que foi verificado (a partir de uma cópia limpa, com o `gradlew` do projeto)

```bash
./gradlew allTests ktlintCheck detekt :snapshots:verifyPaparazziDebug \
  :androidApp:assembleDebug :app:linkDebugFrameworkIosSimulatorArm64
```

Tudo verde, e os testes de lógica rodam nas duas plataformas (`testAndroidHostTest` e `iosSimulatorArm64Test`). Além disso:
- o APK debug roda no emulador (claro e escuro) com Manrope, cores dos tokens e as 3 abas;
- o app iOS compila com `xcodebuild` e roda no simulador (iPhone 15, iOS 17.5), com AppIcon e as 3 abas;
- os snapshots do selo foram conferidos visualmente (cores corretas nos 6 status, fonte 2.0× sem corte).

## Descobertas que o spike anterior não cobria

| Tema | Descoberta | Efeito no plano |
|---|---|---|
| SDK | O Compose 1.12.1 exige `compileSdk` **37** (AAR metadata); há a plataforma `android-37.0` instalada | `compileSdk = 37`, `targetSdk = 36` |
| Gradle | `projects.core.domain` exige `enableFeaturePreview("TYPESAFE_PROJECT_ACCESSORS")`; diretórios de módulo precisam existir | Entra no `settings.gradle.kts` |
| Plugins | Plugin de terceiros usado direto num módulo (ex.: `kotlin.plugin.serialization`) não resolve; só os de convention plugins | Um convention plugin por plugin (`passarim.serialization` etc.) |
| Recursos | O módulo que importa `Res` precisa de dependência **direta** em `components-resources`; sem ela a classe `Res` não é gerada | `implementation(libs.compose.resources)` em `app` |
| Recursos | O pacote do `Res` sai do caminho do módulo, configurado no convention plugin | `compose.resources { packageOfResClass = ... }` |
| Paparazzi | O módulo `snapshots` precisa de `implementation(...)` (não `testImplementation`) no design-system, senão os assets não são vistos | Ver `snapshots/build.gradle.kts` |
| ktlint | O plugin lê os arquivos gerados em `build/` | `filter { exclude { path contains "/build/" } }` nos convention plugins |
| ktlint | `ktlint_official` exige parâmetros em linhas separadas e proíbe `@Composable` em PascalCase | `.editorconfig` com `ktlint_function_naming_ignore_when_annotated_with = Composable` e `ktlintFormat` uma vez |
| detekt | O 1.23.8 estável é antigo para Kotlin 2.4; o `dev.detekt` **2.0.0-alpha.6** funciona, mas precisa vir de um convention plugin (aplicado direto na raiz falha com `KotlinBasePlugin`) | `passarim.detekt` aplicado na raiz; `config/detekt.yml` ajustado às chaves do 2.0 |
| iOS | O Compose aborta no 1º frame sem `CADisableMinimumFrameDurationOnPhone = true` no Info.plist | Nos dois plists do `iosApp` |
| iOS | `xcodebuild -destination 'name=iPhone 15'` não acha o aparelho (runtime 17.5); funciona por `id=` | Documentar `xcrun simctl list` no README |
| iOS | XcodeGen (`brew install xcodegen`) gera o `.xcodeproj`; `ENABLE_USER_SCRIPT_SANDBOXING = NO` é necessário para o script do Gradle | `iosApp/project.yml` |
| Testes | Com `UnconfinedTestDispatcher` e fake sem suspensão, o estado "carregando" não é observável (StateFlow conflata); é preciso um portão (`CompletableDeferred`) | `DebugViewModelTest` |
| Ferramentas | `gradle` global não existe: o `gradlew` foi gerado com `gradle wrapper` de uma distribuição baixada; JDK **21** é obrigatório (Paparazzi 2.0) | `JAVA_HOME` = JDK 21 |

## Diferenças em relação à spec (a spec 5a deve ser ajustada junto com o plano)

- **Convention plugins:** só os necessários foram criados (kmp-library, kmp-compose, serialization, ios-framework, android-application, paparazzi, detekt); `kmp-domain`, `kmp-feature`, `koin`, `ktor` e `room` entram quando forem usados.
- **Kermit:** não usado na 5a (o log do Ktor só existe em debug); entra quando houver o que logar.
- **Coil:** fica para a 5b.
- **`compileSdk` 37** e **detekt 2.0 alpha** (decisões a registrar em ADR junto com o Paparazzi 2.0).

## Falta para fechar a 5a (a retomar amanhã)

1. **Escrever o plano de implementação** (`docs/superpowers/plans/2026-10-09-passarim-app-5a-fundacao.md`), embutindo o código do esqueleto na ordem TDD (teste → falha → implementação → passa → commit), com os critérios de pronto da spec.
2. **`MediaUrlRewriter`** (spec §5): ainda não existe no esqueleto. Reescreve só o host das URLs de mídia quando `AppConfig.mediaHostOverride` não é nulo (debug); implementar com testes em `core:data`.
3. **`core:database`:** hoje é um diretório vazio com `build.gradle.kts` de stub. Aplicar `passarim.kmp-library` + alvo `jvm()` só para testes (spec §3, ponto 3), sem Room ainda.
4. **`osv-scanner`** com `gradle.lockfile` (dependency locking) e **CI** do GitHub Actions (Linux: ktlint, detekt, testes, `verifyPaparazzi`, `assembleDebug`, `osv-scanner`; macOS: link do framework + `xcodebuild`), mais gitleaks e Dependabot. JDK 21 no CI.
5. **README** do `passarim-app` com diagrama Mermaid dos módulos e as instruções dos três casos (emulador, simulador, aparelho físico).
6. **ADRs** (em `passarim-docs`): framework de teste e Paparazzi 2.0 alpha (atualiza o ADR-0010), `compileSdk` 37, detekt 2.0 alpha.
7. **`docker-compose.device.yml`** (em `passarim-docs`) com `ports: !override`; validar com `docker compose config` (Compose v5.5.1 local suporta).
8. **Teste manual de integração** da tela de depuração contra o `docker compose` local (o Docker não estava rodando hoje, então só vimos o estado de erro "Sem conexão" no app).
9. **Decisão do dono:** criar `velosobr/passarim-app` no GitHub (público, como a spec prevê) e subir o esqueleto.
