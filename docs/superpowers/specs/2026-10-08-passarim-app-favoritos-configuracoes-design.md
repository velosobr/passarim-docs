# Passarim — Etapa 5d: Favoritos e Configurações

Data: 2026-10-08 · Depende de: 5a, 5b e 5c · ADR-0009 (Room KMP) · Telas: `docs/design/mockups/png/{favoritos,favoritos-vazio,configuracoes,dados-armazenamento,sobre}.*`

Decisões do redator estão marcadas com **[DR]** e listadas no fim.

## 1. Objetivo

Favoritos **persistentes e offline** (Room KMP) e a aba **Configurações** completa: tema Sistema/Claro/Escuro, cores dinâmicas (Android 12+), "Tocar canto ao abrir ave", Dados e armazenamento e Sobre/Créditos.

### Critérios de pronto
1. Favoritar no Explorar ou no Detalhe grava no Room; reabrir o app (inclusive com o BFF parado e sem internet) mostra os favoritos na aba Favoritos, na ordem do mais recente.
2. Favoritos vazio mostra o estado vazio com "Explorar aves"; desfavoritar na lista remove o item.
3. Trocar o tema em Configurações aplica na hora, sem reiniciar, e persiste; "Sistema" segue o sistema. A escolha é lida antes do primeiro frame sem piscar o tema errado em partidas seguintes.
4. "Cores dinâmicas" só aparece em Android 12+; ligada, usa o esquema dinâmico do sistema; desligada, usa os tokens. No iOS a linha não existe.
5. "Tocar canto ao abrir ave" liga/desliga o `autoPlay` lido pelo Detalhe (5c).
6. "Limpar cache" apaga o cache de imagens e cantos (Coil) e **não** apaga favoritos nem preferências.
7. Sobre mostra versão, créditos e licenças, política de privacidade e licenças de código aberto.
8. Snapshots, testes e CI verdes (§7).

**Fora do escopo:** login, sincronização de favoritos entre aparelhos (v2), notificações.

## 2. Módulos

`core/database` (esqueleto da 5a, agora completo), `feature/favorites/{domain,data,presentation}` e `feature/settings/{domain,data,presentation}`. `core/domain` já tem `FavoritesRepository` (5b) e `SettingsRepository` (5c); `core/data` ganha as implementações (`LocalFavoritesRepository`, `DataStoreSettingsRepository`), que **substituem** a implementação em memória da 5b no módulo Koin do `app`.

## 3. Favoritos (Room KMP)

- Entidade `FavoriteEntity(id PK, commonName, scientificName, thumbnailUrl?, conservationCode?, addedAt)`: guarda o suficiente para listar offline sem chamar o BFF. Versão 1, **esquema exportado** e teste de migração preparado para a versão 2.
- `FavoriteDao`: `observeAll(): Flow<List<FavoriteEntity>>` (ordem `addedAt DESC`), `insert`, `deleteById`, `observeIds()`.
- `BundledSQLiteDriver` em Android e iOS; o builder do banco é `expect/actual` (caminho do arquivo por plataforma).
- `FavoritesRepository`: `observeIds`, `observeAll`, `toggle(summary)`. Alternar duas vezes rápido não duplica nem perde (operação em transação).
- Miniaturas offline são **melhor esforço**: aparecem se o Coil já as tem em cache em disco; senão, placeholder "foto ilustrativa". O texto nunca depende da rede.
- Tela: lista com miniatura, nome, científico em itálico e coração (48dp); toque abre o Detalhe. `FavoritesState`: `Loading` | `Content(items)` | `Empty`.

## 4. Configurações (DataStore Preferences KMP)

- Chaves: `theme` (`SYSTEM` | `LIGHT` | `DARK`, padrão `SYSTEM`), `dynamicColors` (padrão `false`), `autoPlay` (padrão `false`).
- `SettingsRepository`: `observe(): Flow<Settings>` e setters. Valores inválidos no arquivo caem no padrão.
- O `App()` raiz coleta `Settings` e passa `darkTheme`/`dynamicColor` ao `PassarimTheme`. Para evitar o "piscar", a leitura inicial é feita antes de compor a UI (uma leitura bloqueante curta na partida, com a splash ainda visível).
- Cores dinâmicas: `expect/actual` do esquema (Android `dynamicLightColorScheme`/`dynamicDarkColorScheme` em API ≥ 31; iOS sem suporte, linha oculta).
- **Dados e armazenamento:** "Limpar cache" limpa Coil (memória e disco) e mostra confirmação inline (sem diálogo do sistema); o texto avisa que favoritos são mantidos.
- **Sobre:** versão do app (BuildKonfig), créditos conforme ADR-0007 (CC0, CC BY, CC BY-SA, CC BY-NC, CC BY-NC-SA; xeno-canto; Wikipédia; CBRO), e dois links.

## 5. Política de privacidade e licenças de código

- **Política de privacidade [DR]:** documento curto `docs/privacidade.md` no `passarim-docs` (o app não coleta dados pessoais; só faz requisições ao BFF e aos tiles do mapa) e link `https` para a versão renderizada no GitHub. É um requisito do spec (§9) e das lojas. **Depende do dono:** revisar o texto e confirmar a URL pública.
- **Licenças de código aberto [DR]:** plugin AboutLibraries (suporta KMP) gera a lista na compilação; a linha abre uma tela simples. Pode ser cortada se o plugin não fechar com o conjunto de versões.

## 6. Navegação

A aba Favoritos e a aba Configurações ganham destinos reais; Sobre e Dados e armazenamento são destinos empilhados (com voltar). Favoritos → `Detail(id)` por callback (features não dependem entre si).

## 7. Testes

- **Room (no `androidUnitTest`, banco em memória com driver embutido):** inserir, remover, ordenação, toggle duplo, `observeIds`, migração preparada.
- **Configurações:** repositório com DataStore em arquivo temporário (padrões, persistência, valor inválido), ViewModel (tema, dinâmico, autoPlay, limpar cache chama o limpador e não toca favoritos).
- **ViewModel de Favoritos:** vazio, conteúdo, remover.
- **Paparazzi:** Favoritos (lista, vazio), Configurações (cada opção de tema, dinâmico ligado/desligado), Dados e armazenamento, Sobre; claro, escuro e 1.3×.
- Verificação manual documentada: favoritos offline com o compose parado; troca de tema sem piscar.

## 8. Riscos

| Risco | Mitigação |
|---|---|
| Room KMP no iOS (driver, caminho do arquivo) | só linka na 5d; abrir/gravar no simulador é validado na 5e |
| "Piscar" do tema na partida | leitura inicial antes de compor, com a splash visível |
| Cache do Coil não incluir miniaturas dos favoritos | aceito: placeholder; texto sempre disponível |
| Texto da política de privacidade | revisão do dono antes de publicar |

## 9. Decisões do redator **[DR]**

Favoritos guardam resumo (não o detalhe inteiro); privacidade como documento no `passarim-docs`; AboutLibraries; "Limpar cache" sem diálogo do sistema; ordem por mais recente.
