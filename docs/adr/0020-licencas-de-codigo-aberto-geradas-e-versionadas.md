# ADR-0020: Lista de licenças de código aberto gerada e versionada

- **Status:** Aceita
- **Data:** 2026-10-15

## Contexto

A tela "Licenças de código aberto" (etapa 5d) precisa listar as bibliotecas distribuídas no app. O AboutLibraries
gera essa lista a partir do grafo de dependências do Gradle, mas, em Kotlin Multiplatform, o plugin não liga a
geração aos recursos do Compose: a lista precisa ser exportada para um arquivo que o app lê.

## Decisão

- O plugin do AboutLibraries é aplicado no `androidApp` e exporta o classpath de **release** do Android (o mesmo
  que as travas de dependência protegem) para
  `feature/settings/presentation/src/commonMain/composeResources/files/aboutlibraries.json`.
- O JSON é **versionado** e regenerado com `./gradlew :androidApp:exportLibraryDefinitions` sempre que as
  dependências mudam, junto com os `gradle.lockfile`.
- O job `security` do CI regenera o arquivo e falha se ele estiver desatualizado.

## Consequências

- O app não depende de rede nem de tarefa extra no build do iOS para mostrar as licenças.
- O iOS mostra a lista do Android. As diferenças são poucas (Media3 e OkHttp no Android, o motor Darwin do Ktor no
  iOS) e todas as bibliotecas usam licenças permissivas.
- Esquecer de regenerar o arquivo quebra o CI, não o app.
