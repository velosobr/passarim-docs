# Passarim — Etapa 4: Design system, ícone e telas (sem Figma)

Data: 2026-10-03 · Origem: `2026-10-01-passarim-design.md` §6 (Design) e §13 (etapa 4) · Insumo: `docs/design/revisao-design-v1.md`

## 1. Objetivo

Entregar, **antes do app (etapa 5)**, o que o app precisa para ser implementado e ter snapshots Paparazzi estáveis: tokens de cor/tipografia/forma nos temas claro e escuro, ícone adaptativo flat e as telas do MVP (inclusive as que faltavam no protótipo Stitch v1).

**Decisão:** não usar Figma (o usuário não tem conta). Os entregáveis são arquivos versionados em `passarim-docs`: tokens em JSON, ícone em SVG e mockups em HTML exportados para PNG.

**Fora do escopo:** login/cadastro, identificar pássaro (câmera), notificações (v2); código do app (etapa 5).

## 2. Entregáveis

Em `passarim-docs/docs/design/`:

```
README.md                      o que o app consome e como regenerar
tokens/passarim-tokens.json    fonte única: cor (claro/escuro), tipografia, forma, espaço
tokens/TOKENS.md               leitura humana + mapeamento para Compose (Color.kt, Type.kt, Shape.kt)
icon/                          trinca-ferro flat: foreground.svg, background.svg, monochrome.svg, splash.svg, preview-48dp.png
mockups/_base.css              tokens como CSS variables (gerado de passarim-tokens.json)
mockups/<tela>.<tema>.html     uma página por tela e tema
mockups/png/<tela>.<tema>.png  exportados; é o que se revisa
tools/                         scripts: gerar CSS dos tokens, checar contraste, exportar PNGs
```

`figma/LEIA-ME.md` é removido (substituído pelo `README.md`).

## 3. Tokens

### Cor
Esquema Material 3 derivado do verde da marca do protótipo (o verde do ícone original). Um único tom primário, um único fundo (`surface`) por tema.

| Papel | Claro | Escuro |
|---|---|---|
| primary | `#1A6D3C` | `#7DDB97` |
| primaryContainer | `#A6F4B6` | `#00522A` |
| surface | `#F6FBF3` | `#101410` |
| error | padrão M3 | padrão M3 |

- Secundária/terciária: verdes e neutros dessaturados; único acento extra é um âmbar para conservação em risco.
- Tabela completa dos papéis M3 (`onPrimary`, `surfaceVariant`, `outline`, `inverseSurface` etc.) fica em `passarim-tokens.json`; os valores acima são os de partida e podem mudar para atender ao contraste.
- Cores semânticas de conservação (LC, NT, VU, EN, CR) em ambos os temas.
- Substitui o azul do Detalhe, o roxo/índigo do Erro e o fundo variável (#000 vs. cinza) do v1.

### Tipografia
Família única **Manrope** (Google Fonts, embarcada no app). Escala M3 reduzida aos ~9 estilos realmente usados. Nome científico em itálico. Layouts toleram fonte ampliada (teste do Paparazzi).

### Forma e espaço
Cantos: 12dp (cards), 16dp (campos), 28dp (chips e botões grandes). Grade de 4dp, margem de tela 16dp, alvo de toque mínimo 48dp.

## 4. Ícone

Logo baseada no **trinca-ferro** (*Saltator similis*, presente no catálogo): corpo roliço, bico cônico grosso, sobrancelha branca, asa e poleiro, desenhada como traço sólido **flat** (sem glow nem textura), mantendo o estilo de contorno do ícone original. Viewport 108dp, silhueta dentro da zona segura de 66dp.

Variantes: foreground (verde) + background liso, monocromática (ícone temático do Android 13), splash (só o ícone, Android 12+), prévia a 48dp para validar legibilidade.

## 5. Telas

Cada tela em claro e escuro, largura de telefone (390dp). Navegação de 3 abas: **Explorar · Favoritos · Configurações**.

| Tela | Observações |
|---|---|
| Splash | Só ícone centralizado (compatível com SplashScreen API) |
| Explorar | Grid de 2 colunas; nome PT + científico em itálico; busca; chips de filtro (bioma/estado); favorito com alvo de 48dp; sem FAB de identificar |
| Busca ativa / sem resultado | Estado vazio com ação de limpar |
| Filtros | Bottom sheet: biomas e estados com contagem |
| Detalhe | Hero com foto, nome PT + científico, selo de conservação, chips rotulados (bioma/dieta), tamanho, player de canto (progresso, duração, **crédito do gravador**), galeria **com créditos**, descrição, curiosidades, "Onde encontrar" (mapa com clusters + lista de estados), favoritar |
| Favoritos | Lista local; funciona offline; estado vazio |
| Configurações | Tema (Sistema/Claro/Escuro), Cores dinâmicas (toggle, Android 12+), "Tocar canto ao abrir ave" (toggle), Dados e armazenamento, Sobre. Sem sliders |
| Dados e armazenamento | Limpar cache |
| Sobre / Créditos | Versão, créditos e licenças de fotos/cantos, política de privacidade |
| Loading | Skeletons de grid e de detalhe |
| Erro / vazio | Sem internet · servidor indisponível · ave não encontrada · lista vazia · favoritos vazio (mapeados dos `code` do problem+json). Título único, sem redundância ("Ops!" + "Conexão perdida") |

**Conteúdo:** aves reais da curadoria do catalog (ex.: Bem-te-vi, Sabiá-laranjeira, Arara-azul, Tucano-toco), incluindo nomes longos em PT para exercitar quebra de linha. Fotos: reaproveitadas das capturas do Stitch quando servirem; caso contrário, placeholders neutros marcados como tal. Nenhum texto inventado.

## 6. Ferramentas

Scripts em `tools/` (Node): (1) gera `_base.css` a partir de `passarim-tokens.json`; (2) valida contraste WCAG de todos os pares texto/fundo; (3) exporta cada HTML para PNG via Chrome/Playwright headless. Os mockups consomem apenas as variáveis CSS, nunca cores literais, para que mudar um token reflita em todas as telas.

## 7. Critérios de pronto

- `passarim-tokens.json` válido; todos os pares texto/fundo ≥ 4.5:1 (texto grande ≥ 3:1) nos dois temas, verificado por script.
- Todas as telas da §5 renderizadas em claro e escuro, sem texto cortado com nomes longos em PT.
- Ícone legível a 48dp e dentro da zona segura.
- `docs/design/README.md` explica o que o app consome e como regenerar; `figma/LEIA-ME.md` removido.
- O spec principal (§13, etapa 4) é atualizado para refletir "sem Figma".

## 8. Riscos

- Mockups HTML não são um protótipo clicável: servem para validar visual e tokens, não fluxo. Aceito para o MVP.
- Divergência entre mockup e Compose: mitigada pelos tokens compartilhados e pelos snapshots Paparazzi da etapa 5.
