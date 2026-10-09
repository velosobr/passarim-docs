# Passarim — Etapa 5d: Favoritos e Configurações

Data: 2026-10-08 · Depende de: 5a, 5b e 5c · ADR-0009 (Room KMP) · Telas: `docs/design/mockups/png/{favoritos,favoritos-vazio,configuracoes,dados-armazenamento,sobre}.*`

Decisões do redator estão marcadas com **[DR]** e listadas no fim.

## 1. Objetivo

Favoritos **persistentes e offline** (Room KMP) e a aba **Configurações** completa: tema Sistema/Claro/Escuro, cores dinâmicas (Android 12+), "Tocar canto ao abrir ave", Dados e armazenamento e Sobre/Créditos.

### Critérios de pronto
1. Favoritar no Explorar ou no Detalhe grava no Room; reabrir o app (inclusive com o BFF parado e sem internet) mostra os favoritos na aba Favoritos, na ordem do mais recente.
2. Favoritos vazio mostra o estado vazio com "Explorar aves"; desfavoritar na lista remove o item.
3. Trocar o tema em Configurações aplica na hora, sem reiniciar, e persiste; "Sistema" segue o sistema. A escolha é lida antes do primeiro frame, sem piscar o tema errado nas partidas seguintes.
4. "Cores dinâmicas" só aparece em Android 12+; ligada, usa o esquema dinâmico do sistema; desligada, usa os tokens. No iOS a linha não existe.
5. "Tocar canto ao abrir ave" liga/desliga o `autoPlay` lido pelo Detalhe (5c).
6. "Limpar cache" apaga o **cache de imagens** (Coil, memória e disco) e **não** apaga favoritos nem preferências. O app não guarda áudio em cache (5c), e o texto da tela diz só "imagens".
7. Sobre mostra versão, créditos e licenças (incluindo a atribuição do mapa), política de privacidade e licenças de código aberto.
8. Snapshots, testes e CI verdes (§7).

**Fora do escopo:** login, sincronização de favoritos entre aparelhos (v2), notificações.

## 2. Módulos

- `core/database` (esqueleto da 5a, agora completo): entidade, DAO, banco e a implementação **`LocalFavoritesRepository`** de `FavoritesRepository`. O Room fica só aqui; nenhum outro módulo depende dele.
- `feature/favorites/presentation` (a lista de Favoritos). Sem `domain` nem `data` próprios: o repositório vive em `core:domain` (interface) e `core:database` (implementação).
- `feature/settings/{data,presentation}`: `data` tem `DataStoreSettingsRepository` (implementação de `SettingsRepository`, interface em `core:domain` desde a 5c) e o limpador de cache; `presentation` tem Configurações, Dados e armazenamento, Sobre e Licenças.
- O módulo Koin do `app` **substitui** as implementações em memória da 5b (favoritos) e da 5c (configurações) por estas. `core:data` continua só com a rede.

## 3. Favoritos (Room KMP)

- Entidade `FavoriteEntity(id PK, commonName, scientificName, thumbnailUrl?, addedAt)`: guarda o suficiente para listar offline sem chamar o BFF (o selo de conservação não aparece na lista, então não é guardado). Versão 1, **esquema exportado** e teste de migração preparado para a versão 2.
- `FavoriteDao`: `observeAll(): Flow<List<FavoriteEntity>>` (ordem `addedAt DESC`), `insert`, `deleteById`, `observeIds()`.
- `BundledSQLiteDriver` em Android e iOS; o builder do banco é `expect/actual` (caminho do arquivo por plataforma).
- `FavoritesRepository`: `observeIds`, `observeAll`, `toggle(summary)`. Alternar duas vezes rápido não duplica nem perde (operação em transação).
- A `thumbnailUrl` gravada pode ficar velha quando o worker troca a mídia: o Detalhe atualiza o registro ao abrir uma ave favorita (5c).
- Miniaturas offline são **melhor esforço**: aparecem se o Coil já as tem em cache em disco; senão, placeholder "foto ilustrativa". O texto nunca depende da rede.
- Tela: lista com miniatura, nome, científico em itálico e coração (48dp); toque abre o Detalhe por callback (`onOpenDetail`). `FavoritesState`: `Loading` | `Content(items)` | `Empty`.

## 4. Configurações (DataStore Preferences KMP)

- Chaves: `theme` (`SYSTEM` | `LIGHT` | `DARK`, padrão `SYSTEM`), `dynamicColors` (padrão `false`), `autoPlay` (padrão `false`).
- `SettingsRepository`: `observe(): Flow<Settings>` e setters. Valores inválidos no arquivo caem no padrão. O caminho do arquivo do DataStore é `expect/actual`, como o do banco.
- O `App()` raiz coleta `Settings` e passa `darkTheme`/`dynamicColor` ao `PassarimTheme`. **Para evitar o "piscar":** no Android, `installSplashScreen().setKeepOnScreenCondition { !settingsLoaded }` mantém a splash até a primeira leitura; no iOS, a primeira leitura roda antes de compor a UI (o Launch Screen cobre o intervalo). Nenhuma leitura bloqueia a thread principal.
- Cores dinâmicas: `expect/actual` do esquema (Android `dynamicLightColorScheme`/`dynamicDarkColorScheme` em API ≥ 31; iOS sem suporte, linha oculta). O selo de conservação não muda com elas.
- **Dados e armazenamento:** "Limpar cache" limpa o Coil (memória e disco) e mostra confirmação inline (sem diálogo do sistema); o texto diz "cache de imagens" e avisa que favoritos são mantidos.
- **Sobre:** versão do app (de `AppConfig`, preenchida pela plataforma), créditos conforme ADR-0007 (CC0, CC BY, CC BY-SA, CC BY-NC, CC BY-NC-SA; xeno-canto; Wikipédia; CBRO), a atribuição do mapa ("© OpenFreeMap · dados © OpenStreetMap") e dois links.

## 5. Política de privacidade e licenças de código

- **Política de privacidade [DR]:** documento curto `docs/privacidade.md` no `passarim-docs` (o app não coleta dados pessoais; só faz requisições ao BFF e aos tiles do mapa) e link `https` para a versão renderizada no GitHub. É um requisito do spec (§9) e das lojas. **Depende do dono:** revisar o texto e confirmar a URL pública.
- **Licenças de código aberto [DR]:** plugin AboutLibraries (suporta KMP) gera a lista na compilação; a linha abre `LicensesRoute`. Pode ser cortada se o plugin não fechar com o conjunto de versões.

## 6. Navegação

A aba Favoritos e a aba Configurações ganham destinos reais; `AboutRoute`, `StorageRoute` e `LicensesRoute` são destinos de tela cheia empilhados sobre as abas (5a §7), com voltar. Favoritos → `DetailRoute(id)` por callback (features não dependem entre si); "Explorar aves" no vazio chama `onOpenExplore()`.

## 7. Testes

- **Room (em `jvmTest` de `core:database`, banco em memória com `BundledSQLiteDriver`):** inserir, remover, ordenação, toggle duplo, `observeIds`, migração preparada. O alvo `jvm()` existe só para testes (5a §3, ponto 3); isso desvia do "Room em `commonTest`" do spec geral §10 e fica registrado no ADR de testes.
- **Configurações:** repositório com DataStore em arquivo temporário (padrões, persistência, valor inválido), ViewModel (tema, dinâmico, autoPlay, limpar cache chama o limpador e não toca favoritos).
- **ViewModel de Favoritos:** vazio, conteúdo, remover.
- **Paparazzi:** Favoritos (lista, vazio), Configurações (cada opção de tema, dinâmico ligado/desligado), Dados e armazenamento, Sobre; claro e escuro × 1.0×/1.3×/2.0×.
- Verificação manual documentada: favoritos offline com o compose parado; troca de tema sem piscar.

## 8. Riscos

| Risco | Mitigação |
|---|---|
| Room KMP no iOS (driver, caminho do arquivo) | só linka na 5d; abrir/gravar no simulador é validado na 5e |
| "Piscar" do tema na partida | splash mantida até a primeira leitura (Android); leitura antes de compor (iOS) |
| Cache do Coil não incluir miniaturas dos favoritos | aceito: placeholder; texto sempre disponível |
| Texto da política de privacidade | revisão do dono antes de publicar |

## 9. Decisões do redator **[DR]**

Favoritos guardam resumo (não o detalhe inteiro) e sem selo; Room só em `core:database`; DataStore em `feature/settings/data`; privacidade como documento no `passarim-docs`; AboutLibraries; "Limpar cache" só de imagens e sem diálogo do sistema; ordem por mais recente.
