# Passarim — Etapa 4: Design system, ícone e telas (sem Figma) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar em `passarim-docs/docs/design/` os tokens (claro/escuro), a logo flat do trinca-ferro e 16 telas de mockup (HTML → PNG, claro e escuro) que a etapa 5 (app) vai implementar.

**Architecture:** `tokens/passarim-tokens.json` é a fonte única. Um script Node gera `mockups/_base.css` (variáveis CSS e classes de tipografia) e `tokens/TOKENS.md` (tabelas + `Color.kt`) a partir dele. Cada tela é um fragmento HTML em `mockups/src/` que só usa variáveis do tema e partials (`{{include:...}}`); o build gera uma página por tela e tema e o Chrome exporta os PNGs, verificando overflow, texto cortado e fonte carregada. Testes (`node --test`) garantem contraste, ausência de cores literais, arquivos gerados em dia e ícone dentro da zona segura.

**Tech Stack:** Node ≥ 20.11 (ESM, `node:test`), `playwright-core` usando o Google Chrome instalado, fonte Manrope via `@fontsource-variable/manrope` (OFL), HTML/CSS puro (variáveis CSS, `color-mix`).

**Spec:** `docs/superpowers/specs/2026-10-03-passarim-design-system-design.md` (fonte única; `§N` abaixo refere-se a ele). Spec geral: `2026-10-01-passarim-design.md`.

## Global Constraints

- Tudo em `passarim-docs/docs/design/`. Trabalho direto na `main` (padrão do repositório), commits `docs: ...`, **um commit por tarefa**, sempre com `git add <caminhos explícitos>` (nunca `git add .`).
- **Sem Figma.** Cor primária única (verde da marca), um único `surface` por tema; só Manrope; cantos 12/16/28dp; grade de 4dp; margem de tela 16dp; alvo de toque ≥ 48dp (§3).
- **Nenhuma cor literal** em `mockups/src`, `mockups/partials` e `mockups/components.css`: só `var(--md-*)`, `var(--cons-*)` e `color-mix(...)` sobre elas. Cores literais só em `tokens/passarim-tokens.json` e nos SVGs do ícone.
- Contraste WCAG: texto ≥ 4.5:1, não-texto (`outline`) ≥ 3:1, em ambos os temas, para todos os pares de `check-tokens.mjs` e para os 6 status de conservação (§7).
- Telas: 390dp de largura, claro e escuro; conteúdo com aves **reais** do catálogo (41 espécies em `passarim-catalog/content/species`); nenhum nome inventado. Fotos são placeholders neutros marcados "foto ilustrativa"; créditos usam a forma genérica "autor · licença" (ADR-0007: CC0, CC-BY, CC-BY-SA, CC-BY-NC, CC-BY-NC-SA).
- Navegação de 3 abas: Explorar · Favoritos · Configurações. Fora do escopo: login, câmera/identificar, notificações (§1).
- Tipografia em `rem` (1rem = 16px = 16sp) para permitir a verificação com fonte ampliada (`--scale 1.3`).
- Textos de interface em português do Brasil, com acentuação correta.
- Os comandos abaixo rodam em `passarim-docs/docs/design/tools` (chamado `TOOLS`) salvo indicação. Caminhos relativos a `docs/design/` (chamado `DESIGN`).

## Review Focus

Entradas/condições que o spec implica mas nenhuma tarefa "óbvia" testa; cada linha tem o teste/verificação na tarefa indicada:

1. **Fonte não carrega** → o texto cai em `system-ui` e os PNGs mentem sobre quebra de linha. Esperado: o export falha. (Task 5: `document.fonts.check`.)
2. **Fonte ampliada (1.3×)** → nomes longos em PT ("Beija-flor-tesoura", "Anodorhynchus hyacinthinus") e chips cortam ou estouram. Esperado: nenhum texto cortado nem rolagem horizontal. (Task 10: `export-png.mjs --scale 1.3`.)
3. **Variável CSS inexistente ou cor literal** → no tema escuro aparece uma cor do claro (ou nada). Esperado: testes falham. (Task 5: `mockups.test.mjs`.)
4. **Status de conservação raro (EW, CR)** sem contraste suficiente num dos temas. Esperado: `check-tokens` reporta. (Task 2.)
5. **Ícone fora da zona segura de 66dp** (a máscara do launcher corta as asas/bico). Esperado: o export do preview falha. (Task 4.)

---

## File Structure

```text
docs/design/
  README.md                          [Task 10] o que o app consome e como regenerar
  tokens/
    passarim-tokens.json             [Task 2] fonte única
    TOKENS.md                        [Task 3] GERADO
  icon/
    foreground.svg background.svg monochrome.svg splash.svg   [Task 4]
    preview-48dp.png                 [Task 4] GERADO
  mockups/
    _base.css                        [Task 3] GERADO
    components.css                   [Task 5] componentes (só var(--...))
    fonts/ manrope-latin-wght-normal.woff2 + OFL.txt          [Task 3]
    partials/ statusbar.html bottomnav.html card.html topbar.html      [Task 5]
    src/ <16 telas>.html             [Tasks 5-9]
    <tela>.<tema>.html               GERADOS
    png/<tela>.<tema>.png            GERADOS
  tools/
    package.json .gitignore paths.mjs
    contrast.mjs  contrast.test.mjs                 [Task 1]
    check-tokens.mjs  check-tokens.test.mjs         [Task 2]
    build-tokens.mjs  build-tokens.test.mjs         [Task 3]
    icon.mjs  icons.mjs                             [Tasks 4, 5]
    icon.test.mjs  export-icon-preview.mjs          [Task 4]
    build-mockups.mjs build-mockups.test.mjs mockups.test.mjs  [Task 5, 10]
    export-png.mjs                                  [Task 5]
```

As 16 telas (nomes dos arquivos em `src/`): `splash`, `explorar`, `busca-ativa`, `explorar-vazio`, `filtros`, `detalhe`, `favoritos`, `favoritos-vazio`, `configuracoes`, `dados-armazenamento`, `sobre`, `loading-explorar`, `loading-detalhe`, `erro-sem-internet`, `erro-servidor`, `erro-nao-encontrada`.

---

### Task 1: Ferramentas e cálculo de contraste

**Files:**
- Create: `DESIGN/tools/package.json`, `DESIGN/tools/.gitignore`, `DESIGN/tools/paths.mjs`, `DESIGN/tools/contrast.mjs`
- Test: `DESIGN/tools/contrast.test.mjs`

**Interfaces:**
- Produces: `contrast.mjs` → `hexToRgb(hex: string): [number, number, number]` (lança `Error` se não for `#RRGGBB`), `relativeLuminance(hex): number`, `contrastRatio(a: string, b: string): number` (simétrico, 1–21). `paths.mjs` → constantes `TOOLS`, `DESIGN`, `TOKENS_JSON`, `MOCKUPS`, `ICON`; `loadTokens(): object`; `isMain(importMetaUrl: string): boolean`.

- [ ] **Step 1: Criar a pasta e o `package.json`**

```bash
cd ~/dev/passarim/passarim-docs
mkdir -p docs/design/tools docs/design/tokens docs/design/icon docs/design/mockups/{src,partials,fonts,png}
cd docs/design/tools
cat > package.json <<'EOF'
{
  "name": "passarim-design-tools",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "check": "node check-tokens.mjs",
    "build": "node build-tokens.mjs && node build-mockups.mjs",
    "export": "node export-png.mjs && node export-icon-preview.mjs"
  }
}
EOF
printf 'node_modules/\n' > .gitignore
npm install --save-dev playwright-core @fontsource-variable/manrope
```

Expected: `package-lock.json` criado; `node_modules/` ignorado.

- [ ] **Step 2: `paths.mjs`**

```js
// Caminhos e utilitários compartilhados pelos scripts desta pasta.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOLS = import.meta.dirname;
export const DESIGN = join(TOOLS, '..');
export const TOKENS_JSON = join(DESIGN, 'tokens', 'passarim-tokens.json');
export const MOCKUPS = join(DESIGN, 'mockups');
export const ICON = join(DESIGN, 'icon');

export function loadTokens() {
  return JSON.parse(readFileSync(TOKENS_JSON, 'utf8'));
}

// true quando o arquivo foi executado direto (node arquivo.mjs), e não importado.
export function isMain(importMetaUrl) {
  return process.argv[1] === fileURLToPath(importMetaUrl);
}
```

- [ ] **Step 3: Escrever o teste que falha**

`contrast.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { hexToRgb, relativeLuminance, contrastRatio } from './contrast.mjs';

test('hexToRgb converte #RRGGBB', () => {
  assert.deepEqual(hexToRgb('#1A6D3C'), [26, 109, 60]);
});

test('hexToRgb rejeita formatos inválidos', () => {
  for (const bad of ['1A6D3C', '#1A6D3', '#GGGGGG', '#1A6D3CFF', '']) {
    assert.throws(() => hexToRgb(bad), /cor inválida/);
  }
});

test('luminância de preto e branco', () => {
  assert.equal(relativeLuminance('#000000'), 0);
  assert.equal(relativeLuminance('#FFFFFF'), 1);
});

test('contraste preto/branco é 21 e igual consigo mesmo é 1', () => {
  assert.equal(contrastRatio('#000000', '#FFFFFF').toFixed(2), '21.00');
  assert.equal(contrastRatio('#1A6D3C', '#1A6D3C'), 1);
});

test('contraste é simétrico', () => {
  assert.equal(contrastRatio('#1A6D3C', '#FFFFFF'), contrastRatio('#FFFFFF', '#1A6D3C'));
});

test('valor de referência: #777777 sobre branco ≈ 4.48', () => {
  assert.equal(contrastRatio('#777777', '#FFFFFF').toFixed(2), '4.48');
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run (em `TOOLS`): `node --test contrast.test.mjs`
Expected: FAIL (`Cannot find module './contrast.mjs'`).

- [ ] **Step 5: Implementar `contrast.mjs`**

```js
// Contraste WCAG 2.x entre duas cores #RRGGBB.
export function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`cor inválida: ${JSON.stringify(hex)}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const linear = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `node --test contrast.test.mjs`
Expected: 6 testes PASS.

- [ ] **Step 7: Commit**

```bash
cd ~/dev/passarim/passarim-docs
git add docs/design/tools/package.json docs/design/tools/package-lock.json docs/design/tools/.gitignore docs/design/tools/paths.mjs docs/design/tools/contrast.mjs docs/design/tools/contrast.test.mjs
git commit -m "docs: ferramentas da etapa 4 — cálculo de contraste WCAG"
```

---

### Task 2: Tokens e verificação de contraste

**Files:**
- Create: `DESIGN/tokens/passarim-tokens.json`, `DESIGN/tools/check-tokens.mjs`
- Test: `DESIGN/tools/check-tokens.test.mjs`

**Interfaces:**
- Consumes: `contrastRatio` (Task 1), `loadTokens`, `isMain` (Task 1).
- Produces: `check-tokens.mjs` → `THEMES = ['light','dark']`, `STATUSES = ['LC','NT','VU','EN','CR','EW']`, `REQUIRED_ROLES: string[]`, `checkTokens(tokens): Failure[]` onde `Failure = {kind:'missing'|'invalid'|'contrast', theme, role?, bg?, fg?, ratio?, min?, value?}`. JSON: `color.{light,dark}.<papel>`, `conservation.{light,dark}.<STATUS>.{bg,fg}`, `conservationLabels.<STATUS>`, `type.{family,styles.<nome>.{size,line,weight,tracking}}`, `shape.{card,field,pill}`, `space.{unit,screenMargin,touchTarget}`.

- [ ] **Step 1: Criar `passarim-tokens.json`** (valores de partida já verificados por script)

```json
{
  "meta": { "name": "Passarim", "version": "1.0.0" },
  "color": {
    "light": {
      "primary": "#1A6D3C", "onPrimary": "#FFFFFF",
      "primaryContainer": "#A6F4B6", "onPrimaryContainer": "#00210E",
      "secondary": "#4E6352", "onSecondary": "#FFFFFF",
      "secondaryContainer": "#D0E8D2", "onSecondaryContainer": "#0B1F10",
      "tertiary": "#7A5900", "onTertiary": "#FFFFFF",
      "tertiaryContainer": "#FFDEA3", "onTertiaryContainer": "#261900",
      "error": "#BA1A1A", "onError": "#FFFFFF",
      "errorContainer": "#FFDAD6", "onErrorContainer": "#410002",
      "surface": "#F6FBF3", "onSurface": "#181D18",
      "surfaceVariant": "#DCE5DB", "onSurfaceVariant": "#414942",
      "surfaceContainer": "#EAF0E8",
      "outline": "#717971", "outlineVariant": "#C0C9BF",
      "inverseSurface": "#2D322D", "inverseOnSurface": "#EEF2EB", "inversePrimary": "#8BD89D",
      "scrim": "#000000"
    },
    "dark": {
      "primary": "#7DDB97", "onPrimary": "#00391B",
      "primaryContainer": "#00522A", "onPrimaryContainer": "#A6F4B6",
      "secondary": "#B4CCB7", "onSecondary": "#203524",
      "secondaryContainer": "#364B3A", "onSecondaryContainer": "#D0E8D2",
      "tertiary": "#F0BF4C", "onTertiary": "#412D00",
      "tertiaryContainer": "#5E4200", "onTertiaryContainer": "#FFDEA3",
      "error": "#FFB4AB", "onError": "#690005",
      "errorContainer": "#93000A", "onErrorContainer": "#FFDAD6",
      "surface": "#101410", "onSurface": "#E0E4DC",
      "surfaceVariant": "#414942", "onSurfaceVariant": "#C0C9BF",
      "surfaceContainer": "#1C211C",
      "outline": "#8A938A", "outlineVariant": "#414942",
      "inverseSurface": "#E0E4DC", "inverseOnSurface": "#2D322D", "inversePrimary": "#1A6D3C",
      "scrim": "#000000"
    }
  },
  "conservationLabels": {
    "LC": "Pouco preocupante", "NT": "Quase ameaçada", "VU": "Vulnerável",
    "EN": "Em perigo", "CR": "Criticamente em perigo", "EW": "Extinta na natureza"
  },
  "conservation": {
    "light": {
      "LC": { "bg": "#CDEBD3", "fg": "#0B3B1C" },
      "NT": { "bg": "#E3EDB8", "fg": "#33400A" },
      "VU": { "bg": "#FFE08A", "fg": "#4A3600" },
      "EN": { "bg": "#FFC9A3", "fg": "#5A2200" },
      "CR": { "bg": "#FFB4AB", "fg": "#5C0008" },
      "EW": { "bg": "#E1D5F0", "fg": "#2E1A4D" }
    },
    "dark": {
      "LC": { "bg": "#1F4A2C", "fg": "#BDF0C8" },
      "NT": { "bg": "#4A5418", "fg": "#E3EDB8" },
      "VU": { "bg": "#5E4800", "fg": "#FFE08A" },
      "EN": { "bg": "#6E3000", "fg": "#FFC9A3" },
      "CR": { "bg": "#8A1018", "fg": "#FFDAD6" },
      "EW": { "bg": "#44306A", "fg": "#E8DDFF" }
    }
  },
  "type": {
    "family": "Manrope",
    "styles": {
      "headlineMedium": { "size": 28, "line": 36, "weight": 700, "tracking": 0 },
      "titleLarge":     { "size": 22, "line": 28, "weight": 700, "tracking": 0 },
      "titleMedium":    { "size": 16, "line": 24, "weight": 600, "tracking": 0.15 },
      "titleSmall":     { "size": 14, "line": 20, "weight": 600, "tracking": 0.1 },
      "bodyLarge":      { "size": 16, "line": 24, "weight": 400, "tracking": 0.5 },
      "bodyMedium":     { "size": 14, "line": 20, "weight": 400, "tracking": 0.25 },
      "bodySmall":      { "size": 12, "line": 16, "weight": 400, "tracking": 0.4 },
      "labelLarge":     { "size": 14, "line": 20, "weight": 600, "tracking": 0.1 },
      "labelSmall":     { "size": 11, "line": 16, "weight": 600, "tracking": 0.5 }
    }
  },
  "shape": { "card": 12, "field": 16, "pill": 28 },
  "space": { "unit": 4, "screenMargin": 16, "touchTarget": 48 }
}
```

- [ ] **Step 2: Escrever o teste que falha**

`check-tokens.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkTokens, REQUIRED_ROLES, STATUSES } from './check-tokens.mjs';
import { loadTokens } from './paths.mjs';

const fresh = () => structuredClone(loadTokens());

test('os tokens reais não têm falhas', () => {
  assert.deepEqual(checkTokens(loadTokens()), []);
});

test('detecta par texto/fundo abaixo de 4.5:1', () => {
  const t = fresh();
  t.color.light.onPrimary = '#C8E6C9';
  const f = checkTokens(t);
  assert.ok(f.some((x) => x.kind === 'contrast' && x.theme === 'light' && x.bg === 'primary' && x.fg === 'onPrimary' && x.ratio < 4.5));
});

test('detecta contorno abaixo de 3:1 (não-texto)', () => {
  const t = fresh();
  t.color.dark.outline = '#2A2F2A';
  const f = checkTokens(t);
  assert.ok(f.some((x) => x.kind === 'contrast' && x.theme === 'dark' && x.fg === 'outline' && x.min === 3));
});

test('detecta papel ausente em um tema', () => {
  const t = fresh();
  delete t.color.dark.scrim;
  assert.deepEqual(checkTokens(t).filter((x) => x.kind === 'missing'), [{ kind: 'missing', theme: 'dark', role: 'scrim' }]);
});

test('detecta hex inválido', () => {
  const t = fresh();
  t.color.light.surface = '#12345G';
  assert.ok(checkTokens(t).some((x) => x.kind === 'invalid' && x.role === 'surface'));
});

test('status de conservação raro (EW) com contraste ruim é reportado em cada tema', () => {
  for (const theme of ['light', 'dark']) {
    const t = fresh();
    t.conservation[theme].EW = { bg: '#777777', fg: '#888888' };
    assert.ok(checkTokens(t).some((x) => x.kind === 'contrast' && x.theme === theme && x.fg === 'conservation.EW.fg'));
  }
});

test('status ausente é reportado', () => {
  const t = fresh();
  delete t.conservation.light.CR;
  assert.ok(checkTokens(t).some((x) => x.kind === 'missing' && x.role === 'conservation.CR'));
});

test('as listas esperadas não encolheram', () => {
  assert.equal(STATUSES.length, 6);
  assert.ok(REQUIRED_ROLES.includes('surfaceContainer') && REQUIRED_ROLES.includes('scrim'));
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --test check-tokens.test.mjs`
Expected: FAIL (`Cannot find module './check-tokens.mjs'`).

- [ ] **Step 4: Implementar `check-tokens.mjs`**

```js
// Valida a estrutura dos tokens e o contraste de todos os pares usados pelo app.
import { contrastRatio } from './contrast.mjs';
import { loadTokens, isMain } from './paths.mjs';

export const THEMES = ['light', 'dark'];
export const STATUSES = ['LC', 'NT', 'VU', 'EN', 'CR', 'EW'];

export const REQUIRED_ROLES = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'surface', 'onSurface', 'surfaceVariant', 'onSurfaceVariant', 'surfaceContainer',
  'outline', 'outlineVariant',
  'inverseSurface', 'inverseOnSurface', 'inversePrimary', 'scrim',
];

// [fundo, texto]: precisam de 4.5:1.
export const TEXT_PAIRS = [
  ['primary', 'onPrimary'], ['primaryContainer', 'onPrimaryContainer'],
  ['secondary', 'onSecondary'], ['secondaryContainer', 'onSecondaryContainer'],
  ['tertiary', 'onTertiary'], ['tertiaryContainer', 'onTertiaryContainer'],
  ['error', 'onError'], ['errorContainer', 'onErrorContainer'],
  ['surface', 'onSurface'], ['surface', 'onSurfaceVariant'],
  ['surfaceContainer', 'onSurface'], ['surfaceContainer', 'onSurfaceVariant'],
  ['surfaceVariant', 'onSurfaceVariant'], ['inverseSurface', 'inverseOnSurface'],
  ['surface', 'primary'], ['surfaceContainer', 'primary'], ['surface', 'error'],
  ['inverseSurface', 'inversePrimary'],
];

// Elementos não textuais (contornos, bordas de controle): 3:1.
export const NONTEXT_PAIRS = [['surface', 'outline'], ['surfaceContainer', 'outline']];

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function checkTokens(tokens) {
  const out = [];
  for (const theme of THEMES) {
    const roles = tokens.color?.[theme] ?? {};
    for (const role of REQUIRED_ROLES) {
      if (!(role in roles)) out.push({ kind: 'missing', theme, role });
      else if (!HEX.test(roles[role])) out.push({ kind: 'invalid', theme, role, value: roles[role] });
    }
    const pairs = [...TEXT_PAIRS.map((p) => [...p, 4.5]), ...NONTEXT_PAIRS.map((p) => [...p, 3])];
    for (const [bg, fg, min] of pairs) {
      if (!HEX.test(roles[bg] ?? '') || !HEX.test(roles[fg] ?? '')) continue; // já reportado acima
      const ratio = contrastRatio(roles[bg], roles[fg]);
      if (ratio < min) out.push({ kind: 'contrast', theme, bg, fg, ratio, min });
    }
    for (const status of STATUSES) {
      const c = tokens.conservation?.[theme]?.[status];
      const role = `conservation.${status}`;
      if (!c) { out.push({ kind: 'missing', theme, role }); continue; }
      if (!HEX.test(c.bg ?? '') || !HEX.test(c.fg ?? '')) {
        out.push({ kind: 'invalid', theme, role, value: JSON.stringify(c) });
        continue;
      }
      const ratio = contrastRatio(c.bg, c.fg);
      if (ratio < 4.5) out.push({ kind: 'contrast', theme, bg: `${role}.bg`, fg: `${role}.fg`, ratio, min: 4.5 });
    }
  }
  return out;
}

if (isMain(import.meta.url)) {
  const failures = checkTokens(loadTokens());
  for (const f of failures) {
    const what = f.kind === 'contrast'
      ? `${f.bg} × ${f.fg} = ${f.ratio.toFixed(2)} (mínimo ${f.min})`
      : `${f.role}${f.value ? ` = ${f.value}` : ''}`;
    console.error(`FALHA [${f.kind}] ${f.theme}: ${what}`);
  }
  if (failures.length) process.exit(1);
  console.log('tokens OK: estrutura e contraste dentro dos limites nos dois temas');
}
```

- [ ] **Step 5: Rodar testes e a CLI**

Run: `node --test check-tokens.test.mjs && node check-tokens.mjs`
Expected: 7 testes PASS; CLI imprime `tokens OK: ...` e sai com 0.

- [ ] **Step 6: Commit**

```bash
cd ~/dev/passarim/passarim-docs
git add docs/design/tokens/passarim-tokens.json docs/design/tools/check-tokens.mjs docs/design/tools/check-tokens.test.mjs
git commit -m "docs: tokens do Passarim (claro/escuro) com verificação de contraste"
```

---

### Task 3: Gerador de CSS e de TOKENS.md + fonte Manrope

**Files:**
- Create: `DESIGN/tools/build-tokens.mjs`, `DESIGN/mockups/fonts/manrope-latin-wght-normal.woff2`, `DESIGN/mockups/fonts/OFL.txt`
- Generate: `DESIGN/mockups/_base.css`, `DESIGN/tokens/TOKENS.md`
- Test: `DESIGN/tools/build-tokens.test.mjs`

**Interfaces:**
- Consumes: `loadTokens`, `MOCKUPS`, `DESIGN`, `isMain` (Task 1); estrutura do JSON (Task 2).
- Produces: `toCss(tokens): string` (variáveis `--md-<papel-em-kebab>`, `--cons-<lc|nt|vu|en|cr|ew>-<bg|fg>`, `--shape-card|field|pill`, `--space-unit|margin`, `--touch-target`, `--font`; classes `.t-<estilo>` em `rem`); `toDocs(tokens): string` (Markdown com tabelas e blocos Kotlin `PassarimLightColors`/`PassarimDarkColors`). Temas aplicados por `data-theme="light|dark"` no `<html>`.

- [ ] **Step 1: Copiar a fonte e a licença**

```bash
cd ~/dev/passarim/passarim-docs/docs/design/tools
ls node_modules/@fontsource-variable/manrope/files | grep -E 'latin-wght-normal'
cp node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2 ../mockups/fonts/
cp node_modules/@fontsource-variable/manrope/LICENSE ../mockups/fonts/OFL.txt
ls -la ../mockups/fonts
```

Expected: o `ls | grep` lista `manrope-latin-wght-normal.woff2`; os dois arquivos aparecem em `mockups/fonts/`. (Manrope não tem itálico: o navegador sintetiza o oblíquo, como o Compose fará.)

- [ ] **Step 2: Escrever o teste que falha**

`build-tokens.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toCss, toDocs } from './build-tokens.mjs';
import { loadTokens, MOCKUPS, DESIGN } from './paths.mjs';

const tokens = loadTokens();

test('CSS: papéis do tema claro em :root e do escuro em [data-theme="dark"]', () => {
  const css = toCss(tokens);
  const [light, dark] = css.split('[data-theme="dark"]{');
  assert.ok(light.includes('--md-on-primary:#FFFFFF;'));
  assert.ok(light.includes('--md-surface-container:#EAF0E8;'));
  assert.ok(dark.includes('--md-on-primary:#00391B;'));
  assert.ok(!dark.includes('--md-on-primary:#FFFFFF;'));
});

test('CSS: conservação, forma, espaço e tipografia', () => {
  const css = toCss(tokens);
  assert.ok(css.includes('--cons-vu-bg:#FFE08A;'));
  assert.ok(css.includes('--cons-ew-fg:#E8DDFF;'));
  assert.ok(css.includes('--shape-card:12px;'));
  assert.ok(css.includes('--touch-target:48px;'));
  assert.ok(css.includes('.t-bodySmall{font-size:0.75rem;line-height:1rem;font-weight:400;letter-spacing:0.4px}'));
});

test('CSS: os dois temas definem exatamente as mesmas variáveis', () => {
  const css = toCss(tokens);
  const names = (block) => [...block.matchAll(/(--[a-z-]+):/g)].map((m) => m[1]).sort();
  const [light, dark] = css.split('[data-theme="dark"]{');
  const lightOnly = light.slice(light.indexOf(':root,[data-theme="light"]{'));
  assert.deepEqual(names(lightOnly), names(dark.split('}')[0]));
});

test('docs: tabela de cores e bloco Kotlin', () => {
  const md = toDocs(tokens);
  assert.ok(md.startsWith('# Tokens do Passarim'));
  assert.ok(md.includes('| `primary` | `#1A6D3C` | `#7DDB97` |'));
  assert.ok(md.includes('primary = Color(0xFF1A6D3C),'));
  assert.ok(md.includes('val PassarimDarkColors = darkColorScheme('));
  assert.ok(md.includes('| `VU` | Vulnerável |'));
});

test('arquivos gerados estão em dia com o JSON (rode `npm run build`)', () => {
  assert.equal(readFileSync(join(MOCKUPS, '_base.css'), 'utf8'), toCss(tokens));
  assert.equal(readFileSync(join(DESIGN, 'tokens', 'TOKENS.md'), 'utf8'), toDocs(tokens));
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --test build-tokens.test.mjs`
Expected: FAIL (`Cannot find module './build-tokens.mjs'`).

- [ ] **Step 4: Implementar `build-tokens.mjs`**

```js
// Gera mockups/_base.css e tokens/TOKENS.md a partir de tokens/passarim-tokens.json.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadTokens, MOCKUPS, DESIGN, isMain } from './paths.mjs';

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function themeBlock(selector, tokens, theme) {
  const lines = Object.entries(tokens.color[theme]).map(([role, hex]) => `  --md-${kebab(role)}:${hex};`);
  for (const [status, c] of Object.entries(tokens.conservation[theme])) {
    const s = status.toLowerCase();
    lines.push(`  --cons-${s}-bg:${c.bg};`, `  --cons-${s}-fg:${c.fg};`);
  }
  return `${selector}{\n${lines.join('\n')}\n}\n`;
}

export function toCss(t) {
  const head = '/* Gerado por tools/build-tokens.mjs a partir de tokens/passarim-tokens.json. Não edite à mão. */\n';
  const shared = [
    ':root{',
    `  --shape-card:${t.shape.card}px;`,
    `  --shape-field:${t.shape.field}px;`,
    `  --shape-pill:${t.shape.pill}px;`,
    `  --space-unit:${t.space.unit}px;`,
    `  --space-margin:${t.space.screenMargin}px;`,
    `  --touch-target:${t.space.touchTarget}px;`,
    `  --font:"${t.type.family}",system-ui,sans-serif;`,
    '}',
    '',
  ].join('\n');
  const type = Object.entries(t.type.styles)
    .map(([name, s]) => `.t-${name}{font-size:${s.size / 16}rem;line-height:${s.line / 16}rem;font-weight:${s.weight};letter-spacing:${s.tracking}px}`)
    .join('\n') + '\n';
  return head + shared
    + themeBlock(':root,[data-theme="light"]', t, 'light')
    + themeBlock('[data-theme="dark"]', t, 'dark')
    + type;
}

const kotlinColor = (hex) => `Color(0xFF${hex.slice(1).toUpperCase()})`;

function kotlinScheme(name, fn, roles) {
  const body = Object.entries(roles).map(([role, hex]) => `    ${role} = ${kotlinColor(hex)},`).join('\n');
  return `val ${name} = ${fn}(\n${body}\n)`;
}

export function toDocs(t) {
  const roleRows = Object.keys(t.color.light)
    .map((r) => `| \`${r}\` | \`${t.color.light[r]}\` | \`${t.color.dark[r]}\` |`);
  const consRows = Object.keys(t.conservation.light).map((s) => {
    const l = t.conservation.light[s];
    const d = t.conservation.dark[s];
    return `| \`${s}\` | ${t.conservationLabels[s]} | \`${l.bg}\` / \`${l.fg}\` | \`${d.bg}\` / \`${d.fg}\` |`;
  });
  const typeRows = Object.entries(t.type.styles)
    .map(([n, s]) => `| \`${n}\` | ${s.size} | ${s.line} | ${s.weight} | ${s.tracking} |`);
  return [
    '# Tokens do Passarim',
    '',
    '> Arquivo gerado por `tools/build-tokens.mjs` a partir de `passarim-tokens.json`. Não edite à mão.',
    '',
    'Esquema Material 3. Os nomes dos papéis são os mesmos de `ColorScheme` no Compose.',
    '',
    '## Cores',
    '',
    '| Papel | Claro | Escuro |',
    '|---|---|---|',
    ...roleRows,
    '',
    '### Compose (`Color.kt`)',
    '',
    '```kotlin',
    kotlinScheme('PassarimLightColors', 'lightColorScheme', t.color.light),
    '',
    kotlinScheme('PassarimDarkColors', 'darkColorScheme', t.color.dark),
    '```',
    '',
    '## Conservação',
    '',
    'Fundo / texto do selo, por tema. Contraste mínimo 4.5:1 verificado por `tools/check-tokens.mjs`.',
    '',
    '| Status | Rótulo | Claro | Escuro |',
    '|---|---|---|---|',
    ...consRows,
    '',
    '## Tipografia',
    '',
    `Família única **${t.type.family}** (variável, embarcada no app). Itálico (nome científico) é sintetizado, pois a família não tem itálico. Tamanhos em sp, altura de linha em sp, tracking em sp.`,
    '',
    '| Estilo | Tamanho | Linha | Peso | Tracking |',
    '|---|---|---|---|---|',
    ...typeRows,
    '',
    '## Forma e espaço',
    '',
    '| Token | Valor (dp) | Uso |',
    '|---|---|---|',
    `| \`shape.card\` | ${t.shape.card} | cards, player, mapa |`,
    `| \`shape.field\` | ${t.shape.field} | campos |`,
    `| \`shape.pill\` | ${t.shape.pill} | chips, botões, busca |`,
    `| \`space.unit\` | ${t.space.unit} | grade base |`,
    `| \`space.screenMargin\` | ${t.space.screenMargin} | margem lateral de tela |`,
    `| \`space.touchTarget\` | ${t.space.touchTarget} | alvo de toque mínimo (chips têm 36dp visuais, área de toque de 48dp) |`,
    '',
  ].join('\n');
}

if (isMain(import.meta.url)) {
  const tokens = loadTokens();
  writeFileSync(join(MOCKUPS, '_base.css'), toCss(tokens));
  writeFileSync(join(DESIGN, 'tokens', 'TOKENS.md'), toDocs(tokens));
  console.log('gerados: mockups/_base.css e tokens/TOKENS.md');
}
```

- [ ] **Step 5: Gerar e testar**

Run: `node build-tokens.mjs && node --test build-tokens.test.mjs`
Expected: `gerados: ...`; 5 testes PASS.

- [ ] **Step 6: Conferir o Markdown gerado com o lint do repositório**

Run (em `~/dev/passarim/passarim-docs`): `npx -y markdownlint-cli2 docs/design/tokens/TOKENS.md`
Expected: `Summary: 0 error(s)`. Se houver erro, ajuste `toDocs` (não o arquivo gerado) e rode `node build-tokens.mjs` de novo.

- [ ] **Step 7: Commit**

```bash
cd ~/dev/passarim/passarim-docs
git add docs/design/tools/build-tokens.mjs docs/design/tools/build-tokens.test.mjs docs/design/mockups/_base.css docs/design/mockups/fonts docs/design/tokens/TOKENS.md
git commit -m "docs: gerador de CSS e TOKENS.md a partir dos tokens, com fonte Manrope"
```

---

### Task 4: Logo do trinca-ferro (ícone adaptativo flat)

**Files:**
- Create: `DESIGN/icon/foreground.svg`, `background.svg`, `monochrome.svg`, `splash.svg`, `DESIGN/tools/icon.mjs`, `DESIGN/tools/export-icon-preview.mjs`
- Generate: `DESIGN/icon/preview-48dp.png`
- Test: `DESIGN/tools/icon.test.mjs`

**Interfaces:**
- Consumes: `loadTokens`, `ICON`, `isMain` (Task 1); `playwright-core` (Task 1).
- Produces: `icon.mjs` → `readBirdPaths(): string[]` (os atributos `d` dos 8 `<path>` de `foreground.svg`, na ordem do arquivo), usado pelo build dos mockups (Task 5).

- [ ] **Step 1: Criar os quatro SVGs**

`icon/foreground.svg` (traço `primaryContainer` claro; coordenadas já centralizadas, silhueta em ~x 28–81, y 27–82):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="108" height="108">
  <title>Passarim — foreground (trinca-ferro)</title>
  <g fill="none" stroke="#A6F4B6" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M67 37 L80 43 L67 47"/>
    <path d="M67 37 C65 29 53 27 47 34 C41 40 39 50 37 58 C35 66 32 72 29 78 L40 74"/>
    <path d="M67 47 C67 54 65 64 57 70 C51 74 45 74 40 74"/>
    <path d="M45 48 C51 46 57 52 55 62"/>
    <path d="M45 48 C43 56 45 64 49 68"/>
    <path d="M59 38 h.01"/>
    <path d="M54 33.5 L63 34.5"/>
    <path d="M51 74 L51 82 M57 73 L57 82 M39 82 L71 82"/>
  </g>
</svg>
```

`icon/background.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="108" height="108">
  <title>Passarim — background</title>
  <rect width="108" height="108" fill="#00522A"/>
</svg>
```

`icon/monochrome.svg` (mesmos 8 `<path>` do foreground, traço preto — o Android 13 recolore):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="108" height="108">
  <title>Passarim — monocromático (ícone temático)</title>
  <g fill="none" stroke="#000000" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M67 37 L80 43 L67 47"/>
    <path d="M67 37 C65 29 53 27 47 34 C41 40 39 50 37 58 C35 66 32 72 29 78 L40 74"/>
    <path d="M67 47 C67 54 65 64 57 70 C51 74 45 74 40 74"/>
    <path d="M45 48 C51 46 57 52 55 62"/>
    <path d="M45 48 C43 56 45 64 49 68"/>
    <path d="M59 38 h.01"/>
    <path d="M54 33.5 L63 34.5"/>
    <path d="M51 74 L51 82 M57 73 L57 82 M39 82 L71 82"/>
  </g>
</svg>
```

`icon/splash.svg` (Android 12+: ícone sobre disco, legível em fundo claro e escuro):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="108" height="108">
  <title>Passarim — ícone da splash (Android 12+)</title>
  <circle cx="54" cy="54" r="46" fill="#00522A"/>
  <g fill="none" stroke="#A6F4B6" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M67 37 L80 43 L67 47"/>
    <path d="M67 37 C65 29 53 27 47 34 C41 40 39 50 37 58 C35 66 32 72 29 78 L40 74"/>
    <path d="M67 47 C67 54 65 64 57 70 C51 74 45 74 40 74"/>
    <path d="M45 48 C51 46 57 52 55 62"/>
    <path d="M45 48 C43 56 45 64 49 68"/>
    <path d="M59 38 h.01"/>
    <path d="M54 33.5 L63 34.5"/>
    <path d="M51 74 L51 82 M57 73 L57 82 M39 82 L71 82"/>
  </g>
</svg>
```

- [ ] **Step 2: Escrever o teste que falha**

`icon.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ICON, loadTokens } from './paths.mjs';
import { readBirdPaths } from './icon.mjs';

const svg = (name) => readFileSync(join(ICON, name), 'utf8');
const files = ['foreground.svg', 'background.svg', 'monochrome.svg', 'splash.svg'];
const tokens = loadTokens();

test('todos os SVGs usam viewport 108dp', () => {
  for (const f of files) assert.match(svg(f), /viewBox="0 0 108 108"/, f);
});

test('ícone é flat: sem filtro, gradiente, desfoque nem imagem embutida', () => {
  for (const f of files) assert.doesNotMatch(svg(f), /<filter|Gradient|blur|<image|<mask/i, f);
});

test('cores do ícone são as de primaryContainer dos temas (marca única)', () => {
  assert.match(svg('foreground.svg'), new RegExp(`stroke="${tokens.color.light.primaryContainer}"`, 'i'));
  assert.match(svg('background.svg'), new RegExp(`fill="${tokens.color.dark.primaryContainer}"`, 'i'));
  assert.match(svg('splash.svg'), new RegExp(`fill="${tokens.color.dark.primaryContainer}"`, 'i'));
});

test('foreground, monocromático e splash desenham os mesmos 8 traços', () => {
  const paths = (f) => [...svg(f).matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(paths('foreground.svg').length, 8);
  assert.deepEqual(paths('monochrome.svg'), paths('foreground.svg'));
  assert.deepEqual(paths('splash.svg'), paths('foreground.svg'));
});

test('monocromático é preto (o sistema recolore)', () => {
  assert.match(svg('monochrome.svg'), /stroke="#000000"/i);
});

test('readBirdPaths devolve os traços do foreground', () => {
  assert.equal(readBirdPaths().length, 8);
  assert.equal(readBirdPaths()[0], 'M67 37 L80 43 L67 47');
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --test icon.test.mjs`
Expected: FAIL (`Cannot find module './icon.mjs'`).

- [ ] **Step 4: Implementar `icon.mjs`**

```js
// Lê os traços do pássaro a partir do foreground.svg (fonte única da logo).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ICON } from './paths.mjs';

export function readBirdPaths() {
  const svg = readFileSync(join(ICON, 'foreground.svg'), 'utf8');
  return [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test icon.test.mjs`
Expected: 6 testes PASS.

- [ ] **Step 6: Implementar `export-icon-preview.mjs`**

Renderiza o ícone adaptativo (máscara circular de 72dp sobre a tela de 108dp) em 108dp e 48dp, mais a versão monocromática, e **falha** se a silhueta sair da zona segura de 66dp.

```js
// Gera icon/preview-48dp.png e valida que a silhueta cabe na zona segura (66dp centrais).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { ICON, isMain } from './paths.mjs';

const read = (f) => readFileSync(join(ICON, f), 'utf8');
const inner = (svg) => svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title>.*?<\/title>/, '');
const SAFE = { min: 21, max: 87 }; // 66dp centrais de 108dp
const HALF_STROKE = 1.6;

function html() {
  const layer = (extra = '') =>
    `<svg viewBox="0 0 108 108" width="108" height="108">${inner(read('background.svg'))}<g id="fg${extra}">${inner(read('foreground.svg'))}</g></svg>`;
  const mono = `<svg viewBox="0 0 108 108" width="108" height="108">${inner(read('monochrome.svg'))}</svg>`;
  return `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#F6FBF3;font:12px system-ui}
    #sheet{display:flex;gap:24px;align-items:center;padding:24px;width:max-content}
    .m72{width:72px;height:72px;overflow:hidden;border-radius:50%;position:relative;flex:none}
    .m72>svg{position:absolute;left:-18px;top:-18px}
    .m48{width:48px;height:48px;flex:none}.m48 .m72{transform:scale(.6667);transform-origin:0 0}
    .big .m72{transform:scale(1.5);transform-origin:0 0;margin:0 36px 36px 0}
    .safe{position:absolute;left:21px;top:21px;width:66px;height:66px;border:1px dashed #BA1A1A;border-radius:50%;box-sizing:border-box;pointer-events:none}
    .tint{background:#C0C9BF;color:#181D18}
  </style>
  <div id="sheet">
    <div class="big"><div class="m72">${layer()}<div class="safe" style="left:3px;top:3px"></div></div></div>
    <div class="m48"><div class="m72">${layer('-small')}</div></div>
    <div class="m48"><div class="m72 tint">${mono}</div></div>
  </div>`;
}

export async function exportPreview() {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
  try {
    const page = await (await browser.newContext({ deviceScaleFactor: 3 })).newPage();
    await page.setContent(html());
    const box = await page.evaluate(() => {
      const b = document.querySelector('#fg').getBBox();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    });
    const [x0, y0, x1, y1] = [box.x - HALF_STROKE, box.y - HALF_STROKE, box.x + box.w + HALF_STROKE, box.y + box.h + HALF_STROKE];
    if (x0 < SAFE.min || y0 < SAFE.min || x1 > SAFE.max || y1 > SAFE.max) {
      throw new Error(`silhueta fora da zona segura (${SAFE.min}–${SAFE.max}): x ${x0.toFixed(1)}–${x1.toFixed(1)}, y ${y0.toFixed(1)}–${y1.toFixed(1)}`);
    }
    await page.locator('#sheet').screenshot({ path: join(ICON, 'preview-48dp.png') });
    console.log(`ícone OK: silhueta x ${x0.toFixed(1)}–${x1.toFixed(1)}, y ${y0.toFixed(1)}–${y1.toFixed(1)} (zona segura ${SAFE.min}–${SAFE.max})`);
  } finally {
    await browser.close();
  }
}

if (isMain(import.meta.url)) await exportPreview();
```

- [ ] **Step 7: Rodar o export e olhar o resultado**

Run: `node export-icon-preview.mjs`
Expected: `ícone OK: silhueta x ... (zona segura 21–87)`. Abra `icon/preview-48dp.png` com a ferramenta Read e confirme: o trinca-ferro é reconhecível (bico grosso, sobrancelha, asa, poleiro) em 108dp e legível em 48dp, e a versão monocromática também. Se o traçado ficar ruim, ajuste os `d` dos SVGs (mantendo os 4 arquivos idênticos nos traços) e rode `node --test icon.test.mjs` de novo.

- [ ] **Step 8: Commit**

```bash
cd ~/dev/passarim/passarim-docs
git add docs/design/icon docs/design/tools/icon.mjs docs/design/tools/icon.test.mjs docs/design/tools/export-icon-preview.mjs
git commit -m "docs: logo flat do trinca-ferro e ícone adaptativo com verificação de zona segura"
```

---

### Task 5: Motor dos mockups (build, exportação, componentes) + tela Splash

**Files:**
- Create: `DESIGN/tools/icons.mjs`, `DESIGN/tools/build-mockups.mjs`, `DESIGN/tools/export-png.mjs`, `DESIGN/mockups/components.css`, `DESIGN/mockups/partials/{statusbar,bottomnav,card,topbar}.html`, `DESIGN/mockups/src/splash.html`
- Modify: `passarim-docs/.gitignore`
- Generate: `DESIGN/mockups/splash.{light,dark}.html`, `DESIGN/mockups/png/splash.{light,dark}.png`
- Test: `DESIGN/tools/build-mockups.test.mjs`, `DESIGN/tools/mockups.test.mjs`

**Interfaces:**
- Consumes: `readBirdPaths` (Task 4), `MOCKUPS`, `isMain` (Task 1); `_base.css` (Task 3).
- Produces:
  - `build-mockups.mjs` → `THEMES`, `expandIncludes(html: string, partialsDir?: string): string`, `renderPage({name, theme, body}): string`, `screenNames(): string[]`, `renderAll(): Map<string,string>` (nome de arquivo → HTML).
  - Sintaxe nos fragmentos: `{{include:NOME chave=valor chave="valor com espaço"}}`. Partials de função: `icon` (`name`, `size`=24; nomes em `icons.mjs`) e `bird` (`size`=24). Partials de arquivo (`mockups/partials/NOME.html`) recebem `{{chave}}`; **atributo ausente é erro**.
  - `statusbar` (sem atributos); `bottomnav` (`e`, `f`, `c` = `active` ou `""`); `card` (`name`, `sci`, `heart` = `favorite`|`favorite_border`, `favclass` = `on`|`""`); `topbar` (`title`).
  - Classes de `components.css` usadas pelas telas das Tasks 6–9: `.phone .statusbar .content .sci .muted .icon .bird .appbar .iconbtn(.onphoto .left .right .on) .searchbar .chips .chip(.selected) .grid .card .photo(.hero .thumb) .tag .fav(.on) .cons .cons-LC|NT|VU|EN|CR|EW .bottomnav .navitem(.active) .pill .btn(.filled .tonal .text) .state .art(.err) .group-title .row .txt .sub .switch(.on) .radio(.on) .player .play .progress .facts .fact .section .gallery .map .cluster .scrim .sheet .grabber .sk .fav-row .labeled .spacer`.
  - `export-png.mjs [nome...] [--scale N]` → escreve `mockups/png/<nome>.<tema>.png` (ou `png/x<N>/`); sai com 1 se houver overflow horizontal, texto cortado/reticências, ou a fonte Manrope não carregou.

- [ ] **Step 1: `icons.mjs` (ícones Material, 24×24)**

```js
// Caminhos (viewBox 0 0 24 24) dos ícones usados nos mockups — conjunto Material Icons.
export const ICONS = {
  search: 'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  favorite: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
  favorite_border: 'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z',
  explore: 'M12 10.9c-.61 0-1.1.49-1.1 1.1s.49 1.1 1.1 1.1c.61 0 1.1-.49 1.1-1.1s-.49-1.1-1.1-1.1zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm2.19 12.19L6 18l3.81-8.19L18 6l-3.81 8.19z',
  settings: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
  tune: 'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z',
  play_arrow: 'M8 5v14l11-7z',
  pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
  arrow_back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  chevron_right: 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
  expand_more: 'M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z',
  close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  location_on: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z',
  wifi_off: 'M23.64 7c-.45-.34-4.93-4-11.64-4-1.5 0-2.89.19-4.15.48L18.18 13.8 23.64 7zm-6.6 8.22L3.27 1.44 2 2.72l2.05 2.06C1.91 5.76.59 6.82.36 7l11.63 14.49.01.01.01-.01 3.9-4.86 3.32 3.32 1.27-1.27-3.46-3.46z',
  cloud_off: 'M19.35 10.04C18.67 6.59 15.64 4 12 4c-1.48 0-2.85.43-4.01 1.17l1.46 1.46C10.21 6.23 11.08 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19c1.66 0 3 1.34 3 3 0 1.13-.64 2.11-1.56 2.62l1.45 1.45C23.16 18.16 24 16.68 24 15c0-2.64-2.05-4.78-4.65-4.96zM3 5.27l2.75 2.74C2.56 8.15 0 10.77 0 14c0 3.31 2.69 6 6 6h11.73l2 2L21 20.73 4.27 4 3 5.27zM7.73 10l8 8H6c-2.21 0-4-1.79-4-4s1.79-4 4-4h1.73z',
  info: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
  delete: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  volume_up: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
  palette: 'M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c1.38 0 2.5-1.12 2.5-2.5 0-.61-.23-1.2-.64-1.67-.08-.1-.13-.21-.13-.33 0-.28.22-.5.5-.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 8 6.5 8 8 8.67 8 9.5 7.33 11 6.5 11zm3-4C8.67 7 8 6.33 8 5.5S8.67 4 9.5 4s1.5.67 1.5 1.5S10.33 7 9.5 7zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 4 14.5 4s1.5.67 1.5 1.5S15.33 7 14.5 7zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 8 17.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  brightness_6: 'M20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12 20 8.69zM12 18c-.89 0-1.74-.2-2.5-.55C11.56 16.5 13 14.42 13 12s-1.44-4.5-3.5-5.45C10.26 6.2 11.11 6 12 6c3.31 0 6 2.69 6 6s-2.69 6-6 6z',
  check: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  storage: 'M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z',
  image: 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z',
  wifi: 'M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z',
  battery_full: 'M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z',
};
```

- [ ] **Step 2: Escrever o teste do motor (falha)**

`build-mockups.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expandIncludes, renderPage, THEMES } from './build-mockups.mjs';

const dirWith = (files) => {
  const d = mkdtempSync(join(tmpdir(), 'partials-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(d, `${name}.html`), text);
  return d;
};

test('icon gera um <svg> com o caminho do ícone', () => {
  const out = expandIncludes('{{include:icon name=search size=18}}', dirWith({}));
  assert.match(out, /<svg class="icon" viewBox="0 0 24 24" width="18" height="18"/);
  assert.match(out, /<path d="M15\.5 14h/);
});

test('bird usa os 8 traços da logo', () => {
  const out = expandIncludes('{{include:bird size=40}}', dirWith({}));
  assert.equal([...out.matchAll(/<path /g)].length, 8);
  assert.match(out, /viewBox="24 24 60 60"/);
});

test('partial de arquivo substitui {{chave}} e expande includes aninhados', () => {
  const d = dirWith({ box: '<b>{{label}}</b>{{include:icon name={{ic}} size=16}}' });
  const out = expandIncludes('{{include:box label="Olá mundo" ic=check}}', d);
  assert.match(out, /<b>Olá mundo<\/b><svg class="icon"/);
});

test('atributo vazio entre aspas é aceito', () => {
  const d = dirWith({ box: '<i class="{{c}}"></i>' });
  assert.equal(expandIncludes('{{include:box c=""}}', d), '<i class=""></i>');
});

test('partial desconhecido falha', () => {
  assert.throws(() => expandIncludes('{{include:nao-existe}}', dirWith({})), /partial desconhecido: nao-existe/);
});

test('ícone desconhecido falha', () => {
  assert.throws(() => expandIncludes('{{include:icon name=xyz}}', dirWith({})), /ícone desconhecido: xyz/);
});

test('atributo esquecido deixa marcador e falha', () => {
  const d = dirWith({ box: '<i>{{label}}</i>' });
  assert.throws(() => expandIncludes('{{include:box}}', d), /marcador sem valor: \{\{label\}\}/);
});

test('renderPage define o tema no <html> e liga os dois CSS', () => {
  const page = renderPage({ name: 'explorar', theme: 'dark', body: '<p>x</p>' });
  assert.match(page, /<html lang="pt-BR" data-theme="dark">/);
  assert.match(page, /href="_base\.css"/);
  assert.match(page, /href="components\.css"/);
  assert.match(page, /<title>Passarim — explorar \(dark\)<\/title>/);
  assert.deepEqual(THEMES, ['light', 'dark']);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --test build-mockups.test.mjs`
Expected: FAIL (`Cannot find module './build-mockups.mjs'`).

- [ ] **Step 4: Implementar `build-mockups.mjs`**

```js
// Monta as páginas dos mockups: expande {{include:...}} nos fragmentos de src/ e gera uma página por tema.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MOCKUPS, isMain } from './paths.mjs';
import { ICONS } from './icons.mjs';
import { readBirdPaths } from './icon.mjs';

export const THEMES = ['light', 'dark'];

const INCLUDE = /\{\{include:([a-z-]+)((?:\s+[a-zA-Z]+=(?:"[^"]*"|[^\s}]+))*)\s*\}\}/g;
const ATTR = /([a-zA-Z]+)=(?:"([^"]*)"|([^\s}]+))/g;

const parseAttrs = (raw) => {
  const attrs = {};
  for (const m of raw.matchAll(ATTR)) attrs[m[1]] = m[2] ?? m[3];
  return attrs;
};

const FUNCTION_PARTIALS = {
  icon: ({ name, size = '24' }) => {
    const d = ICONS[name];
    if (!d) throw new Error(`ícone desconhecido: ${name}`);
    return `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
  },
  bird: ({ size = '24' }) => {
    const paths = readBirdPaths().map((d) => `<path d="${d}"/>`).join('');
    return `<svg class="bird" viewBox="24 24 60 60" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  },
};

export function expandIncludes(html, partialsDir = join(MOCKUPS, 'partials')) {
  let out = html;
  for (let depth = 0; depth < 6; depth++) {
    let hit = false;
    out = out.replace(INCLUDE, (_, name, rawAttrs) => {
      hit = true;
      const attrs = parseAttrs(rawAttrs);
      if (FUNCTION_PARTIALS[name]) return FUNCTION_PARTIALS[name](attrs);
      let text;
      try {
        text = readFileSync(join(partialsDir, `${name}.html`), 'utf8');
      } catch {
        throw new Error(`partial desconhecido: ${name}`);
      }
      return text.trim().replace(/\{\{([a-zA-Z]+)\}\}/g, (m, key) => (key in attrs ? attrs[key] : m));
    });
    if (!hit) break;
  }
  const left = out.match(/\{\{[^}]*\}\}/);
  if (left) throw new Error(`marcador sem valor: ${left[0]}`);
  return out;
}

export function renderPage({ name, theme, body }) {
  return `<!doctype html>
<html lang="pt-BR" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=390, initial-scale=1">
<title>Passarim — ${name} (${theme})</title>
<link rel="stylesheet" href="_base.css">
<link rel="stylesheet" href="components.css">
</head>
<body>
${body}
</body>
</html>
`;
}

export function screenNames() {
  return readdirSync(join(MOCKUPS, 'src'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => f.slice(0, -'.html'.length))
    .sort();
}

// nome do arquivo gerado → HTML
export function renderAll() {
  const out = new Map();
  for (const name of screenNames()) {
    const body = expandIncludes(readFileSync(join(MOCKUPS, 'src', `${name}.html`), 'utf8'));
    for (const theme of THEMES) out.set(`${name}.${theme}.html`, renderPage({ name, theme, body }));
  }
  return out;
}

if (isMain(import.meta.url)) {
  const pages = renderAll();
  for (const [file, html] of pages) writeFileSync(join(MOCKUPS, file), html);
  console.log(`geradas ${pages.size} páginas em mockups/`);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test build-mockups.test.mjs`
Expected: 8 testes PASS.

- [ ] **Step 6: `components.css`**

```css
/* Componentes dos mockups. Só variáveis do tema (_base.css): nenhuma cor literal. */
@font-face{font-family:"Manrope";src:url("fonts/manrope-latin-wght-normal.woff2") format("woff2");font-weight:200 800;font-display:block}
*{box-sizing:border-box;margin:0;padding:0}
html{font-size:16px}
body{width:390px;background:var(--md-surface);color:var(--md-on-surface);font-family:var(--font);-webkit-font-smoothing:antialiased}
h1,h2,h3,p{font-weight:inherit}
a{color:inherit;text-decoration:none}
.icon,.bird{flex:none}
.icon{fill:currentColor}
.sci{font-style:italic;color:var(--md-on-surface-variant)}
.muted{color:var(--md-on-surface-variant)}
.spacer{flex:1}

.phone{position:relative;width:390px;min-height:844px;display:flex;flex-direction:column;background:var(--md-surface)}
.statusbar{min-height:44px;padding:0 24px;display:flex;align-items:center;justify-content:space-between;color:var(--md-on-surface)}
.statusbar .sb-icons{display:flex;gap:6px;align-items:center}
.content{flex:1;padding:0 var(--space-margin) 24px;display:flex;flex-direction:column;gap:16px}

.appbar{display:flex;align-items:center;gap:4px;min-height:56px;padding:0 4px}
.iconbtn{width:var(--touch-target);height:var(--touch-target);border-radius:50%;display:grid;place-items:center;flex:none;color:var(--md-on-surface)}
.iconbtn.onphoto{position:absolute;top:8px;background:color-mix(in srgb,var(--md-surface) 85%,transparent)}
.iconbtn.left{left:8px}
.iconbtn.right{right:8px}
.iconbtn.on{color:var(--md-primary)}

.searchbar{min-height:56px;border-radius:var(--shape-pill);background:var(--md-surface-container);display:flex;align-items:center;gap:12px;padding:0 4px 0 16px;color:var(--md-on-surface-variant)}
.searchbar .value{flex:1;color:var(--md-on-surface)}
.searchbar .hint{flex:1}

.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{min-height:36px;padding:0 14px;border-radius:var(--shape-pill);border:1px solid var(--md-outline-variant);display:inline-flex;align-items:center;gap:6px;color:var(--md-on-surface-variant)}
.chip.selected{background:var(--md-secondary-container);color:var(--md-on-secondary-container);border-color:transparent}

.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.card{position:relative;background:var(--md-surface-container);border-radius:var(--shape-card);overflow:hidden}
.card .meta{padding:10px 12px 12px;display:flex;flex-direction:column;gap:2px}
.photo{position:relative;aspect-ratio:4/5;display:grid;place-items:center;color:var(--md-on-primary-container);background:linear-gradient(160deg,var(--md-primary-container),var(--md-surface-variant))}
.photo .bird{opacity:.45}
.photo .tag{position:absolute;left:8px;bottom:6px;color:var(--md-on-surface-variant)}
.photo.hero{aspect-ratio:auto;height:300px}
.photo.thumb{aspect-ratio:1;width:56px;border-radius:var(--shape-card);flex:none;overflow:hidden}
.fav{position:absolute;top:0;right:0;width:var(--touch-target);height:var(--touch-target);display:grid;place-items:center;color:var(--md-on-surface)}
.fav i{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,var(--md-surface) 85%,transparent)}
.fav.on{color:var(--md-primary)}

.cons{min-height:24px;padding:0 10px;border-radius:12px;display:inline-flex;align-items:center;gap:6px}
.cons::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor}
.cons-LC{background:var(--cons-lc-bg);color:var(--cons-lc-fg)}
.cons-NT{background:var(--cons-nt-bg);color:var(--cons-nt-fg)}
.cons-VU{background:var(--cons-vu-bg);color:var(--cons-vu-fg)}
.cons-EN{background:var(--cons-en-bg);color:var(--cons-en-fg)}
.cons-CR{background:var(--cons-cr-bg);color:var(--cons-cr-fg)}
.cons-EW{background:var(--cons-ew-bg);color:var(--cons-ew-fg)}

.bottomnav{margin-top:auto;display:flex;background:var(--md-surface-container);padding:12px 0 24px}
.navitem{flex:1;min-height:var(--touch-target);display:flex;flex-direction:column;align-items:center;gap:4px;color:var(--md-on-surface-variant)}
.navitem .pill{width:64px;height:32px;border-radius:16px;display:grid;place-items:center}
.navitem.active{color:var(--md-on-surface)}
.navitem.active .pill{background:var(--md-secondary-container);color:var(--md-on-secondary-container)}

.btn{min-height:var(--touch-target);padding:0 24px;border-radius:var(--shape-pill);display:inline-flex;align-items:center;justify-content:center;gap:8px}
.btn.filled{background:var(--md-primary);color:var(--md-on-primary)}
.btn.tonal{background:var(--md-secondary-container);color:var(--md-on-secondary-container)}
.btn.text{color:var(--md-primary)}

.state{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:12px;padding:0 32px}
.state .art{width:120px;height:120px;border-radius:50%;display:grid;place-items:center;margin-bottom:8px;background:var(--md-primary-container);color:var(--md-on-primary-container)}
.state .art.err{background:var(--md-error-container);color:var(--md-on-error-container)}
.state .art .icon{width:56px;height:56px}
.state p{color:var(--md-on-surface-variant)}

.group-title{padding:16px 0 4px;color:var(--md-primary)}
.row{display:flex;align-items:center;gap:16px;min-height:64px;padding:8px 0}
.row .txt{flex:1;display:flex;flex-direction:column}
.row .sub{color:var(--md-on-surface-variant)}
.row > .icon{color:var(--md-on-surface-variant)}
.switch{width:52px;height:32px;border-radius:16px;flex:none;position:relative;background:var(--md-surface-variant);border:2px solid var(--md-outline)}
.switch::after{content:"";position:absolute;left:6px;top:6px;width:16px;height:16px;border-radius:50%;background:var(--md-outline)}
.switch.on{background:var(--md-primary);border-color:var(--md-primary)}
.switch.on::after{left:20px;top:2px;width:24px;height:24px;background:var(--md-on-primary)}
.radio{width:20px;height:20px;border-radius:50%;border:2px solid var(--md-outline);flex:none}
.radio.on{border-color:var(--md-primary);background:radial-gradient(circle,var(--md-primary) 45%,transparent 50%)}

.section{display:flex;flex-direction:column;gap:8px}
.labeled{display:flex;flex-direction:column;gap:6px}
.facts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.fact{background:var(--md-surface-container);border-radius:var(--shape-card);padding:12px;display:flex;flex-direction:column;gap:2px}
.player{background:var(--md-surface-container);border-radius:var(--shape-card);padding:12px 16px;display:flex;align-items:center;gap:12px}
.player .play{width:var(--touch-target);height:var(--touch-target);border-radius:50%;background:var(--md-primary);color:var(--md-on-primary);display:grid;place-items:center;flex:none}
.player .body{flex:1;display:flex;flex-direction:column;gap:6px}
.progress{height:4px;border-radius:2px;background:var(--md-surface-variant);position:relative}
.progress i{position:absolute;left:0;top:0;bottom:0;width:38%;border-radius:2px;background:var(--md-primary)}
.times{display:flex;justify-content:space-between;color:var(--md-on-surface-variant)}
.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.gallery figure{display:flex;flex-direction:column;gap:4px}
.gallery .photo{aspect-ratio:1;border-radius:var(--shape-card);overflow:hidden}
.gallery figcaption{color:var(--md-on-surface-variant)}
.map{position:relative;height:200px;border-radius:var(--shape-card);overflow:hidden;background:repeating-linear-gradient(0deg,transparent 0 39px,var(--md-outline-variant) 39px 40px),repeating-linear-gradient(90deg,transparent 0 39px,var(--md-outline-variant) 39px 40px),var(--md-surface-variant)}
.map .tag{position:absolute;left:12px;bottom:8px;color:var(--md-on-surface-variant)}
.cluster{position:absolute;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:var(--md-primary);color:var(--md-on-primary)}
.map .pin{position:absolute;color:var(--md-primary)}

.scrim{position:absolute;inset:0;background:color-mix(in srgb,var(--md-scrim) 32%,transparent)}
.sheet{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;gap:16px;padding:12px 16px 32px;background:var(--md-surface-container);border-radius:28px 28px 0 0}
.grabber{width:32px;height:4px;border-radius:2px;background:var(--md-outline);align-self:center}
.sheet-head{display:flex;align-items:center;justify-content:space-between}

.sk{background:var(--md-surface-variant);border-radius:8px;opacity:.7}
.fav-row{display:flex;align-items:center;gap:12px;min-height:72px}
.fav-row .txt{flex:1;display:flex;flex-direction:column;gap:2px}
```

- [ ] **Step 7: Partials**

`mockups/partials/statusbar.html`:

```html
<div class="statusbar t-labelLarge"><span>9:41</span><span class="sb-icons">{{include:icon name=wifi size=16}}{{include:icon name=battery_full size=16}}</span></div>
```

`mockups/partials/bottomnav.html`:

```html
<nav class="bottomnav" aria-label="Navegação principal">
  <a class="navitem {{e}}"><span class="pill">{{include:icon name=explore size=24}}</span><span class="t-labelSmall">Explorar</span></a>
  <a class="navitem {{f}}"><span class="pill">{{include:icon name=favorite_border size=24}}</span><span class="t-labelSmall">Favoritos</span></a>
  <a class="navitem {{c}}"><span class="pill">{{include:icon name=settings size=24}}</span><span class="t-labelSmall">Configurações</span></a>
</nav>
```

`mockups/partials/card.html`:

```html
<article class="card">
  <div class="photo">{{include:bird size=48}}<span class="tag t-labelSmall">foto ilustrativa</span></div>
  <a class="fav {{favclass}}" aria-label="Favoritar {{name}}"><i>{{include:icon name={{heart}} size=18}}</i></a>
  <div class="meta">
    <span class="name t-titleSmall">{{name}}</span>
    <span class="sci t-bodySmall">{{sci}}</span>
  </div>
</article>
```

`mockups/partials/topbar.html`:

```html
<header class="appbar"><a class="iconbtn" aria-label="Voltar">{{include:icon name=arrow_back size=24}}</a><h1 class="t-titleLarge">{{title}}</h1></header>
```

- [ ] **Step 8: Tela Splash**

`mockups/src/splash.html`:

```html
<div class="phone">
  {{include:statusbar}}
  <main class="state">
    <img src="../icon/splash.svg" width="160" height="160" alt="Passarim">
  </main>
</div>
```

- [ ] **Step 9: Testes de higiene dos mockups (falham até existir tudo)**

`mockups.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MOCKUPS } from './paths.mjs';
import { renderAll } from './build-mockups.mjs';

const authored = () => [
  ...readdirSync(join(MOCKUPS, 'src')).map((f) => join(MOCKUPS, 'src', f)),
  ...readdirSync(join(MOCKUPS, 'partials')).map((f) => join(MOCKUPS, 'partials', f)),
  join(MOCKUPS, 'components.css'),
];
const text = (p) => readFileSync(p, 'utf8');

test('nenhuma cor literal nos arquivos escritos à mão', () => {
  const literal = /(?<!&)#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
  for (const p of authored()) assert.doesNotMatch(text(p), literal, p);
});

test('toda var(--x) usada está definida em _base.css ou components.css', () => {
  const defined = new Set();
  for (const css of ['_base.css', 'components.css']) {
    for (const m of text(join(MOCKUPS, css)).matchAll(/(--[a-z0-9-]+)\s*:/g)) defined.add(m[1]);
  }
  for (const p of authored()) {
    for (const m of text(p).matchAll(/var\((--[a-z0-9-]+)/g)) assert.ok(defined.has(m[1]), `${p}: ${m[1]} não definida`);
  }
});

test('toda classe t-* usada existe em _base.css', () => {
  const base = text(join(MOCKUPS, '_base.css'));
  for (const p of authored().filter((f) => f.endsWith('.html'))) {
    for (const m of text(p).matchAll(/class="([^"]*)"/g)) {
      for (const cls of m[1].split(/\s+/).filter((c) => c.startsWith('t-'))) {
        assert.ok(base.includes(`.${cls}{`), `${p}: classe ${cls} inexistente`);
      }
    }
  }
});

test('páginas geradas estão em dia com os fragmentos (rode `npm run build`)', () => {
  for (const [file, html] of renderAll()) assert.equal(text(join(MOCKUPS, file)), html, file);
});
```

- [ ] **Step 10: `export-png.mjs`**

```js
// Exporta cada página de mockups/ para PNG e verifica overflow, texto cortado e fonte carregada.
// Uso: node export-png.mjs [nome-da-tela ...] [--scale 1.3]
import { readdirSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { MOCKUPS } from './paths.mjs';

const args = process.argv.slice(2);
const si = args.indexOf('--scale');
const scale = si >= 0 ? Number(args[si + 1]) : 1;
const wanted = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--scale');
const outDir = scale === 1 ? join(MOCKUPS, 'png') : join(MOCKUPS, 'png', `x${scale}`);
mkdirSync(outDir, { recursive: true });

const pages = readdirSync(MOCKUPS)
  .filter((f) => /\.(light|dark)\.html$/.test(f))
  .filter((f) => wanted.length === 0 || wanted.includes(f.replace(/\.(light|dark)\.html$/, '')))
  .sort();
if (pages.length === 0) { console.error('nenhuma página encontrada'); process.exit(1); }

// Roda dentro da página: devolve a lista de problemas de layout.
function inPageChecks() {
  const out = [];
  if (document.documentElement.scrollWidth > 390) out.push(`rolagem horizontal: ${document.documentElement.scrollWidth}px`);
  // document.fonts.check() devolve true mesmo quando o @font-face falhou; por isso olhamos o status de cada face.
  if (![...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Manrope' && f.status === 'loaded')) {
    out.push('fonte Manrope não carregou (texto em fallback)');
  }
  const label = (el) => `<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}">`;
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[data-allow-clip]')) continue;
    const cs = getComputedStyle(el);
    if (cs.textOverflow === 'ellipsis') out.push(`reticências em ${label(el)}`);
    const clips = cs.overflowX !== 'visible' || cs.overflowY !== 'visible';
    if (clips && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) {
      out.push(`conteúdo cortado em ${label(el)} (${el.scrollWidth}×${el.scrollHeight} em ${el.clientWidth}×${el.clientHeight})`);
    }
  }
  return out;
}

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
let failed = 0;
try {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  for (const file of pages) {
    await page.goto(pathToFileURL(join(MOCKUPS, file)).href);
    await page.evaluate((s) => { document.documentElement.style.fontSize = `${16 * s}px`; }, scale);
    await page.evaluate(() => document.fonts.ready);
    const issues = await page.evaluate(inPageChecks);
    const name = basename(file, '.html');
    if (issues.length) {
      failed++;
      console.error(`PROBLEMA ${name}:\n  - ${issues.join('\n  - ')}`);
    } else {
      console.log(`OK ${name}`);
    }
    await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true });
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 11: Adicionar `png/x*/` ao `.gitignore`**

Acrescente ao `~/dev/passarim/passarim-docs/.gitignore`:

```text
# PNGs de verificação com fonte ampliada (não versionados)
docs/design/mockups/png/x*/
```

- [ ] **Step 12: Gerar, testar e exportar a Splash**

Run (em `TOOLS`): `node build-mockups.mjs && node --test && node export-png.mjs splash`
Expected: `geradas 2 páginas em mockups/`; todos os testes PASS (contrast 6, check-tokens 7, build-tokens 5, icon 6, build-mockups 8, mockups 4); `OK splash.dark` e `OK splash.light`. Abra `mockups/png/splash.light.png` e `splash.dark.png` com Read: disco verde com o trinca-ferro centralizado sobre o fundo `surface` de cada tema.

- [ ] **Step 13: Provar que as verificações de layout detectam problema**

Edite temporariamente `mockups/src/splash.html` para `<main class="state" style="width:300px;overflow:hidden"><div style="width:500px">texto largo demais para o contêiner</div></main>`, rode `node build-mockups.mjs && node export-png.mjs splash`.
Expected: sai com código 1 e imprime `PROBLEMA splash.light: ... conteúdo cortado em <main class="state">`. **Desfaça a edição** (restaure o fragmento do Step 8), rode `node build-mockups.mjs && node export-png.mjs splash` de novo (volta a `OK`).

- [ ] **Step 14: Commit**

```bash
cd ~/dev/passarim/passarim-docs
git add .gitignore docs/design/tools/icons.mjs docs/design/tools/build-mockups.mjs docs/design/tools/build-mockups.test.mjs docs/design/tools/mockups.test.mjs docs/design/tools/export-png.mjs docs/design/mockups/components.css docs/design/mockups/partials docs/design/mockups/src/splash.html docs/design/mockups/splash.light.html docs/design/mockups/splash.dark.html docs/design/mockups/png/splash.light.png docs/design/mockups/png/splash.dark.png
git commit -m "docs: motor dos mockups (partials, componentes, exportação com verificação) e tela Splash"
```

---

### Task 6: Telas de Explorar (Explorar, Busca ativa, Lista vazia, Filtros, Loading)

**Files:**
- Create: `DESIGN/mockups/src/{explorar,busca-ativa,explorar-vazio,filtros,loading-explorar}.html`
- Generate: páginas `.light/.dark.html` e PNGs correspondentes.

**Interfaces:**
- Consumes: partials e classes da Task 5 (lista no bloco *Produces* da Task 5).
- Produces: nenhuma interface nova; telas finais.

- [ ] **Step 1: `explorar.html`** (grid de 2 colunas, 8 aves reais, favoritas: Arara-azul-grande e Tucano-toco)

```html
<div class="phone">
  {{include:statusbar}}
  <main class="content">
    <div class="searchbar t-bodyLarge">{{include:icon name=search size=24}}<span class="hint">Buscar aves</span></div>
    <div class="chips">
      <span class="chip t-labelLarge">Bioma {{include:icon name=expand_more size=18}}</span>
      <span class="chip t-labelLarge">Estado {{include:icon name=expand_more size=18}}</span>
    </div>
    <div class="grid">
      {{include:card name="Arara-azul-grande" sci="Anodorhynchus hyacinthinus" heart=favorite favclass=on}}
      {{include:card name="Bem-te-vi" sci="Pitangus sulphuratus" heart=favorite_border favclass=""}}
      {{include:card name="Sabiá-laranjeira" sci="Turdus rufiventris" heart=favorite_border favclass=""}}
      {{include:card name="Tucano-toco" sci="Ramphastos toco" heart=favorite favclass=on}}
      {{include:card name="Beija-flor-tesoura" sci="Eupetomena macroura" heart=favorite_border favclass=""}}
      {{include:card name="João-de-barro" sci="Furnarius rufus" heart=favorite_border favclass=""}}
      {{include:card name="Gralha-azul" sci="Cyanocorax caeruleus" heart=favorite_border favclass=""}}
      {{include:card name="Trinca-ferro" sci="Saltator similis" heart=favorite_border favclass=""}}
    </div>
  </main>
  {{include:bottomnav e=active f="" c=""}}
</div>
```

- [ ] **Step 2: `busca-ativa.html`** (busca "azul", 3 resultados reais)

```html
<div class="phone">
  {{include:statusbar}}
  <main class="content">
    <div class="searchbar t-bodyLarge">{{include:icon name=search size=24}}<span class="value">azul</span><a class="iconbtn" aria-label="Limpar busca">{{include:icon name=close size=24}}</a></div>
    <div class="chips">
      <span class="chip t-labelLarge">Bioma {{include:icon name=expand_more size=18}}</span>
      <span class="chip t-labelLarge">Estado {{include:icon name=expand_more size=18}}</span>
    </div>
    <p class="t-labelLarge muted">3 aves encontradas</p>
    <div class="grid">
      {{include:card name="Arara-azul-grande" sci="Anodorhynchus hyacinthinus" heart=favorite favclass=on}}
      {{include:card name="Ararinha-azul" sci="Cyanopsitta spixii" heart=favorite_border favclass=""}}
      {{include:card name="Gralha-azul" sci="Cyanocorax caeruleus" heart=favorite_border favclass=""}}
    </div>
  </main>
  {{include:bottomnav e=active f="" c=""}}
</div>
```

- [ ] **Step 3: `explorar-vazio.html`** (busca "arara" + bioma Pampa = nenhum resultado)

```html
<div class="phone">
  {{include:statusbar}}
  <main class="content" style="flex:1">
    <div class="searchbar t-bodyLarge">{{include:icon name=search size=24}}<span class="value">arara</span><a class="iconbtn" aria-label="Limpar busca">{{include:icon name=close size=24}}</a></div>
    <div class="chips">
      <span class="chip selected t-labelLarge">{{include:icon name=check size=18}} Pampa {{include:icon name=close size=18}}</span>
      <span class="chip t-labelLarge">Estado {{include:icon name=expand_more size=18}}</span>
    </div>
    <div class="state">
      <div class="art">{{include:icon name=search size=56}}</div>
      <h2 class="t-titleLarge">Nenhuma ave encontrada</h2>
      <p class="t-bodyMedium">Não achamos aves para “arara” no Pampa. Tente outro nome ou remova algum filtro.</p>
      <a class="btn tonal t-labelLarge">Limpar filtros</a>
    </div>
  </main>
  {{include:bottomnav e=active f="" c=""}}
</div>
```

- [ ] **Step 4: `filtros.html`** (bottom sheet sobre o Explorar; contagens reais do catálogo de 41 aves)

```html
<div class="phone">
  {{include:statusbar}}
  <main class="content">
    <div class="searchbar t-bodyLarge">{{include:icon name=search size=24}}<span class="hint">Buscar aves</span></div>
    <div class="chips">
      <span class="chip t-labelLarge">Bioma {{include:icon name=expand_more size=18}}</span>
      <span class="chip t-labelLarge">Estado {{include:icon name=expand_more size=18}}</span>
    </div>
    <div class="grid">
      {{include:card name="Arara-azul-grande" sci="Anodorhynchus hyacinthinus" heart=favorite favclass=on}}
      {{include:card name="Bem-te-vi" sci="Pitangus sulphuratus" heart=favorite_border favclass=""}}
      {{include:card name="Sabiá-laranjeira" sci="Turdus rufiventris" heart=favorite_border favclass=""}}
      {{include:card name="Tucano-toco" sci="Ramphastos toco" heart=favorite favclass=on}}
    </div>
  </main>
  {{include:bottomnav e=active f="" c=""}}
  <div class="scrim"></div>
  <section class="sheet" aria-label="Filtros">
    <div class="grabber"></div>
    <div class="sheet-head"><h2 class="t-titleLarge">Filtrar aves</h2><a class="btn text t-labelLarge">Limpar</a></div>
    <div class="labeled">
      <span class="t-labelLarge muted">Bioma</span>
      <div class="chips">
        <span class="chip selected t-labelLarge">{{include:icon name=check size=18}} Cerrado · 26</span>
        <span class="chip t-labelLarge">Mata Atlântica · 29</span>
        <span class="chip t-labelLarge">Amazônia · 24</span>
        <span class="chip t-labelLarge">Caatinga · 19</span>
        <span class="chip t-labelLarge">Pantanal · 19</span>
        <span class="chip t-labelLarge">Pampa · 15</span>
      </div>
    </div>
    <div class="labeled">
      <span class="t-labelLarge muted">Estado</span>
      <div class="chips">
        <span class="chip t-labelLarge">SP · 29</span>
        <span class="chip t-labelLarge">PR · 24</span>
        <span class="chip t-labelLarge">RS · 24</span>
        <span class="chip selected t-labelLarge">{{include:icon name=check size=18}} RJ · 23</span>
        <span class="chip t-labelLarge">GO · 22</span>
        <span class="chip t-labelLarge">BA · 21</span>
        <span class="chip t-labelLarge">AM · 19</span>
        <span class="chip t-labelLarge">PA · 19</span>
        <span class="chip t-labelLarge">MT · 19</span>
        <span class="chip t-labelLarge">MG · 19</span>
        <span class="chip t-labelLarge">MS · 16</span>
        <span class="chip t-labelLarge">SC · 15</span>
      </div>
      <a class="btn text t-labelLarge" style="align-self:flex-start;padding:0">Ver todos os estados</a>
    </div>
    <a class="btn filled t-labelLarge">Mostrar aves</a>
  </section>
</div>
```

- [ ] **Step 5: `loading-explorar.html`** (skeletons; sem texto)

```html
<div class="phone">
  {{include:statusbar}}
  <main class="content">
    <div class="sk" style="height:56px;border-radius:var(--shape-pill)"></div>
    <div class="chips">
      <div class="sk" style="width:96px;height:36px;border-radius:var(--shape-pill)"></div>
      <div class="sk" style="width:96px;height:36px;border-radius:var(--shape-pill)"></div>
    </div>
    <div class="grid">
      <div><div class="sk" style="aspect-ratio:4/5;border-radius:var(--shape-card)"></div><div class="sk" style="height:14px;width:70%;margin-top:10px"></div><div class="sk" style="height:12px;width:50%;margin-top:6px"></div></div>
      <div><div class="sk" style="aspect-ratio:4/5;border-radius:var(--shape-card)"></div><div class="sk" style="height:14px;width:60%;margin-top:10px"></div><div class="sk" style="height:12px;width:45%;margin-top:6px"></div></div>
      <div><div class="sk" style="aspect-ratio:4/5;border-radius:var(--shape-card)"></div><div class="sk" style="height:14px;width:65%;margin-top:10px"></div><div class="sk" style="height:12px;width:55%;margin-top:6px"></div></div>
      <div><div class="sk" style="aspect-ratio:4/5;border-radius:var(--shape-card)"></div><div class="sk" style="height:14px;width:55%;margin-top:10px"></div><div class="sk" style="height:12px;width:40%;margin-top:6px"></div></div>
    </div>
  </main>
  {{include:bottomnav e=active f="" c=""}}
</div>
```

- [ ] **Step 6: Gerar, testar e exportar**

Run (em `TOOLS`): `node build-mockups.mjs && node --test && node export-png.mjs explorar busca-ativa explorar-vazio filtros loading-explorar`
Expected: 10 linhas `OK ...` (5 telas × 2 temas); testes PASS (a higiene falha se algum `var(--x)` ou classe `t-*` estiver errado, ou se alguma página gerada estiver desatualizada).

- [ ] **Step 7: Revisar visualmente**

Abra com Read `png/explorar.light.png`, `explorar.dark.png`, `filtros.light.png`, `explorar-vazio.dark.png`, `busca-ativa.light.png`, `loading-explorar.dark.png`. Confira: grid de 2 colunas sem quebra feia nos nomes ("Beija-flor-tesoura", "Anodorhynchus hyacinthinus" podem quebrar linha, nunca cortar); coração com alvo de 48dp sem competir com a foto; fundo único; chips selecionados legíveis; sheet sobre o scrim com o botão "Mostrar aves" visível. Corrija o CSS/HTML e repita o Step 6 se algo estiver errado.

- [ ] **Step 8: Commit**

```bash
cd ~/dev/passarim/passarim-docs
git add docs/design/mockups/src/explorar.html docs/design/mockups/src/busca-ativa.html docs/design/mockups/src/explorar-vazio.html docs/design/mockups/src/filtros.html docs/design/mockups/src/loading-explorar.html docs/design/mockups/components.css docs/design/mockups/explorar.*.html docs/design/mockups/busca-ativa.*.html docs/design/mockups/explorar-vazio.*.html docs/design/mockups/filtros.*.html docs/design/mockups/loading-explorar.*.html docs/design/mockups/png
git commit -m "docs: mockups de Explorar — grid, busca, lista vazia, filtros e loading"
```

---

### Task 7: Telas de Detalhe (Detalhe e Loading do detalhe)

**Files:**
- Create: `DESIGN/mockups/src/{detalhe,loading-detalhe}.html`
- Generate: páginas e PNGs correspondentes.

**Interfaces:**
- Consumes: partials/classes da Task 5.
- Produces: telas finais.

- [ ] **Step 1: `detalhe.html`** — Arara-azul-grande (VU), dados do `anodorhynchus-hyacinthinus.yaml`

```html
<div class="phone">
  {{include:statusbar}}
  <div class="photo hero">
    {{include:bird size=96}}
    <span class="tag t-labelSmall">foto ilustrativa</span>
    <a class="iconbtn onphoto left" aria-label="Voltar">{{include:icon name=arrow_back size=24}}</a>
    <a class="iconbtn onphoto right on" aria-label="Desfavoritar">{{include:icon name=favorite size=24}}</a>
  </div>
  <main class="content" style="padding-top:16px;gap:24px">
    <header class="section" style="gap:6px">
      <h1 class="t-headlineMedium">Arara-azul-grande</h1>
      <p class="sci t-bodyLarge">Anodorhynchus hyacinthinus</p>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <span class="cons cons-VU t-labelLarge">Vulnerável</span>
        <span class="muted t-bodyMedium">Família Psittacidae</span>
      </div>
    </header>

    <section class="facts">
      <div class="fact"><span class="t-titleMedium">100 cm</span><span class="muted t-labelSmall">Tamanho</span></div>
      <div class="fact"><span class="t-titleMedium">3 biomas</span><span class="muted t-labelSmall">Ocorrência</span></div>
      <div class="fact"><span class="t-titleMedium">10 estados</span><span class="muted t-labelSmall">Ocorrência</span></div>
    </section>

    <section class="labeled">
      <span class="t-labelLarge muted">Bioma</span>
      <div class="chips">
        <span class="chip t-labelLarge">Pantanal</span>
        <span class="chip t-labelLarge">Cerrado</span>
        <span class="chip t-labelLarge">Amazônia</span>
      </div>
    </section>

    <section class="labeled">
      <span class="t-labelLarge muted">Dieta</span>
      <p class="t-bodyMedium">Sementes duras de palmeiras, como coco-de-urucuri e coco-de-espinho, quebradas com a força do bico.</p>
    </section>

    <section class="section">
      <h2 class="t-titleMedium">Canto</h2>
      <div class="player">
        <a class="play" aria-label="Tocar canto">{{include:icon name=play_arrow size=28}}</a>
        <div class="body">
          <div class="progress"><i></i></div>
          <div class="times t-labelSmall"><span>0:12</span><span>0:31</span></div>
          <span class="muted t-bodySmall">Gravação: autor · xeno-canto · CC BY-NC-SA</span>
        </div>
      </div>
    </section>

    <section class="section">
      <h2 class="t-titleMedium">Sobre a ave</h2>
      <p class="t-bodyMedium">A arara-azul-grande é a maior espécie de arara do mundo, com plumagem azul-cobalto intensa e um anel amarelo ao redor dos olhos e na base do bico. Vive em áreas de palmeiral no Pantanal, Cerrado e Amazônia, onde se alimenta quase exclusivamente de sementes duras de palmeiras, que consegue quebrar graças à força extraordinária do bico. É ameaçada pela perda de habitat e pelo tráfico de animais silvestres.</p>
      <span class="muted t-labelSmall">Texto: Wikipédia · CC BY-SA</span>
    </section>

    <section class="section">
      <h2 class="t-titleMedium">Curiosidades</h2>
      <p class="t-bodyMedium">• Formam casais monogâmicos que permanecem juntos durante toda a vida, fiéis aos mesmos locais de alimentação e reprodução.</p>
      <p class="t-bodyMedium">• Já foram registradas usando folhas mastigadas ou pedaços de madeira como ferramentas para firmar as sementes enquanto se alimentam.</p>
    </section>

    <section class="section">
      <h2 class="t-titleMedium">Galeria</h2>
      <div class="gallery">
        <figure><div class="photo">{{include:bird size=32}}</div><figcaption class="t-labelSmall">Foto: autor · CC BY</figcaption></figure>
        <figure><div class="photo">{{include:bird size=32}}</div><figcaption class="t-labelSmall">Foto: autor · CC BY-SA</figcaption></figure>
        <figure><div class="photo">{{include:bird size=32}}</div><figcaption class="t-labelSmall">Foto: autor · CC0</figcaption></figure>
      </div>
    </section>

    <section class="section">
      <h2 class="t-titleMedium">Onde encontrar</h2>
      <div class="map" data-allow-clip>
        <span class="cluster t-labelLarge" style="left:70px;top:50px">4</span>
        <span class="cluster t-labelLarge" style="left:200px;top:80px">3</span>
        <span class="cluster t-labelLarge" style="left:120px;top:125px">2</span>
        <span class="pin" style="left:280px;top:40px">{{include:icon name=location_on size=32}}</span>
        <span class="tag t-labelSmall">mapa ilustrativo</span>
      </div>
      <div class="chips">
        <span class="chip t-labelLarge">MS</span><span class="chip t-labelLarge">MT</span><span class="chip t-labelLarge">GO</span>
        <span class="chip t-labelLarge">MA</span><span class="chip t-labelLarge">PI</span><span class="chip t-labelLarge">BA</span>
        <span class="chip t-labelLarge">TO</span><span class="chip t-labelLarge">MG</span><span class="chip t-labelLarge">PA</span>
        <span class="chip t-labelLarge">AM</span>
      </div>
    </section>

    <a class="btn text t-labelLarge" style="align-self:flex-start;padding:0">Créditos e licenças desta ave</a>
  </main>
</div>
```

- [ ] **Step 2: `loading-detalhe.html`**

```html
<div class="phone">
  {{include:statusbar}}
  <div class="sk" style="height:300px;border-radius:0;position:relative">
    <a class="iconbtn onphoto left" aria-label="Voltar">{{include:icon name=arrow_back size=24}}</a>
  </div>
  <main class="content" style="padding-top:16px;gap:20px">
    <div style="display:flex;flex-direction:column;gap:10px">
      <div class="sk" style="height:32px;width:70%"></div>
      <div class="sk" style="height:18px;width:50%"></div>
      <div class="sk" style="height:24px;width:35%;border-radius:12px"></div>
    </div>
    <div class="facts">
      <div class="sk" style="height:64px;border-radius:var(--shape-card)"></div>
      <div class="sk" style="height:64px;border-radius:var(--shape-card)"></div>
      <div class="sk" style="height:64px;border-radius:var(--shape-card)"></div>
    </div>
    <div class="sk" style="height:72px;border-radius:var(--shape-card)"></div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <div class="sk" style="height:14px"></div>
      <div class="sk" style="height:14px"></div>
      <div class="sk" style="height:14px;width:80%"></div>
    </div>
  </main>
</div>
```

- [ ] **Step 3: Gerar, testar e exportar**

Run (em `TOOLS`): `node build-mockups.mjs && node --test && node export-png.mjs detalhe loading-detalhe`
Expected: 4 linhas `OK ...`; testes PASS.

- [ ] **Step 4: Revisar visualmente**

Abra com Read `png/detalhe.light.png`, `detalhe.dark.png`, `loading-detalhe.light.png`. Confira os itens exigidos pela revisão do v1: nome científico, selo de conservação, tamanho, favoritar, chips **rotulados** (Bioma/Dieta separados), player com progresso, duração **e crédito do gravador**, galeria com créditos, "Onde encontrar" com mapa e estados, curiosidades. Se os botões sobre a foto ficarem ilegíveis ou o mapa estiver confuso, ajuste o CSS e repita o Step 3.

- [ ] **Step 5: Commit**

```bash
cd ~/dev/passarim/passarim-docs
git add docs/design/mockups/src/detalhe.html docs/design/mockups/src/loading-detalhe.html docs/design/mockups/components.css docs/design/mockups/detalhe.*.html docs/design/mockups/loading-detalhe.*.html docs/design/mockups/png
git commit -m "docs: mockups do Detalhe da ave e do loading do detalhe"
```

---

### Task 8: Favoritos e estados de erro/vazio

**Files:**
- Create: `DESIGN/mockups/src/{favoritos,favoritos-vazio,erro-sem-internet,erro-servidor,erro-nao-encontrada}.html`
- Generate: páginas e PNGs correspondentes.

**Interfaces:**
- Consumes: partials/classes da Task 5.
- Produces: telas finais. Cada erro corresponde a um `code` do BFF: sem internet = falha de rede do app (sem `code`), servidor = `SERVICE_UNAVAILABLE`, não encontrada = `SPECIES_NOT_FOUND`.

- [ ] **Step 1: `favoritos.html`** (3 aves favoritas)

```html
<div class="phone">
  {{include:statusbar}}
  <main class="content">
    <h1 class="t-headlineMedium" style="padding-top:8px">Favoritos</h1>
    <p class="muted t-bodyMedium">Salvos neste aparelho. Funcionam sem internet.</p>
    <div style="display:flex;flex-direction:column">
      <div class="fav-row">
        <div class="photo thumb">{{include:bird size=24}}</div>
        <div class="txt"><span class="t-titleSmall">Arara-azul-grande</span><span class="sci t-bodySmall">Anodorhynchus hyacinthinus</span></div>
        <a class="iconbtn on" aria-label="Desfavoritar">{{include:icon name=favorite size=24}}</a>
      </div>
      <div class="fav-row">
        <div class="photo thumb">{{include:bird size=24}}</div>
        <div class="txt"><span class="t-titleSmall">Tucano-toco</span><span class="sci t-bodySmall">Ramphastos toco</span></div>
        <a class="iconbtn on" aria-label="Desfavoritar">{{include:icon name=favorite size=24}}</a>
      </div>
      <div class="fav-row">
        <div class="photo thumb">{{include:bird size=24}}</div>
        <div class="txt"><span class="t-titleSmall">Trinca-ferro</span><span class="sci t-bodySmall">Saltator similis</span></div>
        <a class="iconbtn on" aria-label="Desfavoritar">{{include:icon name=favorite size=24}}</a>
      </div>
    </div>
  </main>
  {{include:bottomnav e="" f=active c=""}}
</div>
```

- [ ] **Step 2: `favoritos-vazio.html`**

```html
<div class="phone">
  {{include:statusbar}}
  <main class="content" style="flex:1">
    <h1 class="t-headlineMedium" style="padding-top:8px">Favoritos</h1>
    <div class="state">
      <div class="art">{{include:icon name=favorite_border size=56}}</div>
      <h2 class="t-titleLarge">Nenhum favorito ainda</h2>
      <p class="t-bodyMedium">Toque no coração de uma ave para guardá-la aqui. Os favoritos ficam salvos no aparelho e funcionam sem internet.</p>
      <a class="btn filled t-labelLarge">Explorar aves</a>
    </div>
  </main>
  {{include:bottomnav e="" f=active c=""}}
</div>
```

- [ ] **Step 3: `erro-sem-internet.html`**

```html
<div class="phone">
  {{include:statusbar}}
  <main class="state">
    <div class="art err">{{include:icon name=wifi_off size=56}}</div>
    <h1 class="t-titleLarge">Sem conexão</h1>
    <p class="t-bodyMedium">Verifique sua internet e tente de novo. Seus favoritos continuam disponíveis.</p>
    <a class="btn filled t-labelLarge">Tentar novamente</a>
    <a class="btn text t-labelLarge">Ver favoritos</a>
  </main>
  {{include:bottomnav e=active f="" c=""}}
</div>
```

- [ ] **Step 4: `erro-servidor.html`**

```html
<div class="phone">
  {{include:statusbar}}
  <main class="state">
    <div class="art err">{{include:icon name=cloud_off size=56}}</div>
    <h1 class="t-titleLarge">Serviço indisponível</h1>
    <p class="t-bodyMedium">Não conseguimos carregar as aves agora. Tente novamente em alguns instantes.</p>
    <a class="btn filled t-labelLarge">Tentar novamente</a>
  </main>
  {{include:bottomnav e=active f="" c=""}}
</div>
```

- [ ] **Step 5: `erro-nao-encontrada.html`** (tela cheia, sem abas: vem do Detalhe)

```html
<div class="phone">
  {{include:statusbar}}
  {{include:topbar title=""}}
  <main class="state">
    <div class="art">{{include:bird size=64}}</div>
    <h1 class="t-titleLarge">Ave não encontrada</h1>
    <p class="t-bodyMedium">Essa ave não está mais no catálogo ou o link está incorreto.</p>
    <a class="btn filled t-labelLarge">Voltar para Explorar</a>
  </main>
</div>
```

- [ ] **Step 6: Gerar, testar e exportar**

Run (em `TOOLS`): `node build-mockups.mjs && node --test && node export-png.mjs favoritos favoritos-vazio erro-sem-internet erro-servidor erro-nao-encontrada`
Expected: 10 linhas `OK ...`; testes PASS.

- [ ] **Step 7: Revisar visualmente**

Abra com Read `png/favoritos.light.png`, `favoritos-vazio.dark.png`, `erro-sem-internet.light.png`, `erro-servidor.dark.png`, `erro-nao-encontrada.light.png`. Confira: título único e sem redundância (sem "Ops!" + "Conexão perdida"), botão primário verde (nunca roxo), ilustração dentro da paleta, cada estado com uma ação clara. Corrija e repita o Step 6 se necessário.

- [ ] **Step 8: Commit**

```bash
cd ~/dev/passarim/passarim-docs
git add docs/design/mockups/src/favoritos.html docs/design/mockups/src/favoritos-vazio.html docs/design/mockups/src/erro-sem-internet.html docs/design/mockups/src/erro-servidor.html docs/design/mockups/src/erro-nao-encontrada.html docs/design/mockups/components.css docs/design/mockups/favoritos.*.html docs/design/mockups/favoritos-vazio.*.html docs/design/mockups/erro-*.html docs/design/mockups/png
git commit -m "docs: mockups de Favoritos e dos estados de erro e vazio"
```

---

### Task 9: Configurações, Dados e armazenamento, Sobre/Créditos

**Files:**
- Create: `DESIGN/mockups/src/{configuracoes,dados-armazenamento,sobre}.html`
- Generate: páginas e PNGs correspondentes.

**Interfaces:**
- Consumes: partials/classes da Task 5.
- Produces: telas finais. Configurações sem sliders (Tema = lista de opções; demais = toggles), conforme a revisão do v1.

- [ ] **Step 1: `configuracoes.html`**

```html
<div class="phone">
  {{include:statusbar}}
  <main class="content" style="gap:0">
    <h1 class="t-headlineMedium" style="padding:8px 0 8px">Configurações</h1>

    <h2 class="group-title t-labelLarge">Aparência</h2>
    <div class="row">{{include:icon name=brightness_6 size=24}}<div class="txt"><span class="t-bodyLarge">Tema</span></div></div>
    <div class="row" style="min-height:48px;padding-left:40px"><span class="radio on"></span><span class="t-bodyLarge">Sistema</span></div>
    <div class="row" style="min-height:48px;padding-left:40px"><span class="radio"></span><span class="t-bodyLarge">Claro</span></div>
    <div class="row" style="min-height:48px;padding-left:40px"><span class="radio"></span><span class="t-bodyLarge">Escuro</span></div>
    <div class="row">{{include:icon name=palette size=24}}<div class="txt"><span class="t-bodyLarge">Cores dinâmicas</span><span class="sub t-bodyMedium">Usa as cores do papel de parede (Android 12+)</span></div><span class="switch on"></span></div>

    <h2 class="group-title t-labelLarge">Reprodução</h2>
    <div class="row">{{include:icon name=volume_up size=24}}<div class="txt"><span class="t-bodyLarge">Tocar canto ao abrir ave</span><span class="sub t-bodyMedium">Começa a tocar assim que o detalhe abre</span></div><span class="switch"></span></div>

    <h2 class="group-title t-labelLarge">Dados</h2>
    <div class="row">{{include:icon name=storage size=24}}<div class="txt"><span class="t-bodyLarge">Dados e armazenamento</span><span class="sub t-bodyMedium">Limpar cache de imagens e cantos</span></div>{{include:icon name=chevron_right size=24}}</div>

    <h2 class="group-title t-labelLarge">Sobre</h2>
    <div class="row">{{include:icon name=info size=24}}<div class="txt"><span class="t-bodyLarge">Sobre o Passarim</span><span class="sub t-bodyMedium">Versão 1.0.0 · créditos e licenças</span></div>{{include:icon name=chevron_right size=24}}</div>
  </main>
  {{include:bottomnav e="" f="" c=active}}
</div>
```

- [ ] **Step 2: `dados-armazenamento.html`**

```html
<div class="phone">
  {{include:statusbar}}
  {{include:topbar title="Dados e armazenamento"}}
  <main class="content" style="gap:8px">
    <div class="row">{{include:icon name=image size=24}}<div class="txt"><span class="t-bodyLarge">Cache de imagens e cantos</span><span class="sub t-bodyMedium">Libera espaço; o conteúdo é baixado de novo quando você abrir a ave</span></div></div>
    <a class="btn tonal t-labelLarge" style="align-self:flex-start">{{include:icon name=delete size=20}} Limpar cache</a>
    <div class="row">{{include:icon name=favorite_border size=24}}<div class="txt"><span class="t-bodyLarge">Favoritos</span><span class="sub t-bodyMedium">Ficam salvos no aparelho e não são apagados ao limpar o cache</span></div></div>
  </main>
</div>
```

- [ ] **Step 3: `sobre.html`** (créditos conforme ADR-0007)

```html
<div class="phone">
  {{include:statusbar}}
  {{include:topbar title="Sobre"}}
  <main class="content" style="gap:20px">
    <section style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 0">
      <img src="../icon/splash.svg" width="96" height="96" alt="Passarim">
      <h2 class="t-headlineMedium">Passarim</h2>
      <p class="muted t-bodyMedium">Versão 1.0.0</p>
    </section>

    <section class="section">
      <h2 class="t-titleMedium">Créditos e licenças</h2>
      <p class="t-bodyMedium">O Passarim é gratuito e sem anúncios. Fotos e cantos de aves são de autores que os compartilham sob licenças Creative Commons (CC0, CC BY, CC BY-SA, CC BY-NC e CC BY-NC-SA). O autor e a licença aparecem em cada ave.</p>
    </section>

    <section class="section">
      <div class="row" style="min-height:48px"><div class="txt"><span class="t-bodyLarge">Cantos</span><span class="sub t-bodyMedium">xeno-canto</span></div></div>
      <div class="row" style="min-height:48px"><div class="txt"><span class="t-bodyLarge">Textos</span><span class="sub t-bodyMedium">Wikipédia · CC BY-SA</span></div></div>
      <div class="row" style="min-height:48px"><div class="txt"><span class="t-bodyLarge">Lista de espécies</span><span class="sub t-bodyMedium">Comitê Brasileiro de Registros Ornitológicos (CBRO)</span></div></div>
    </section>

    <section class="section">
      <div class="row">{{include:icon name=info size=24}}<div class="txt"><span class="t-bodyLarge">Política de privacidade</span><span class="sub t-bodyMedium">O app não coleta dados pessoais</span></div>{{include:icon name=chevron_right size=24}}</div>
      <div class="row">{{include:icon name=info size=24}}<div class="txt"><span class="t-bodyLarge">Licenças de código aberto</span></div>{{include:icon name=chevron_right size=24}}</div>
    </section>
  </main>
</div>
```

- [ ] **Step 4: Gerar, testar e exportar**

Run (em `TOOLS`): `node build-mockups.mjs && node --test && node export-png.mjs configuracoes dados-armazenamento sobre`
Expected: 6 linhas `OK ...`; testes PASS.

- [ ] **Step 5: Revisar visualmente**

Abra com Read `png/configuracoes.light.png`, `configuracoes.dark.png`, `dados-armazenamento.light.png`, `sobre.dark.png`. Confira: nenhum slider; Tema como lista de opções e Cores dinâmicas como toggle; toggles com estado ligado/desligado distinguíveis nos dois temas; Sobre com créditos e licenças. Corrija e repita o Step 4 se necessário.

- [ ] **Step 6: Commit**

```bash
cd ~/dev/passarim/passarim-docs
git add docs/design/mockups/src/configuracoes.html docs/design/mockups/src/dados-armazenamento.html docs/design/mockups/src/sobre.html docs/design/mockups/components.css docs/design/mockups/configuracoes.*.html docs/design/mockups/dados-armazenamento.*.html docs/design/mockups/sobre.*.html docs/design/mockups/png
git commit -m "docs: mockups de Configurações, Dados e armazenamento e Sobre"
```

---

### Task 10: Conjunto completo, README, CI e atualização dos specs

**Files:**
- Create: `DESIGN/README.md`
- Modify: `DESIGN/tools/mockups.test.mjs`, `passarim-docs/.github/workflows/ci.yml`, `passarim-docs/.markdownlint-cli2.yaml`, `passarim-docs/docs/superpowers/specs/2026-10-01-passarim-design.md` (§6 e §13)
- Delete: `DESIGN/figma/LEIA-ME.md`

**Interfaces:**
- Consumes: tudo das Tasks 1–9.
- Produces: critérios de pronto do spec (§7) verificáveis por um comando: `npm test && node export-png.mjs && node export-png.mjs --scale 1.3`.

- [ ] **Step 1: Teste de completude das telas (falha se faltar alguma)**

Acrescente ao final de `tools/mockups.test.mjs`:

```js
import { screenNames } from './build-mockups.mjs';

const REQUIRED_SCREENS = [
  'splash', 'explorar', 'busca-ativa', 'explorar-vazio', 'filtros',
  'detalhe', 'loading-explorar', 'loading-detalhe',
  'favoritos', 'favoritos-vazio',
  'configuracoes', 'dados-armazenamento', 'sobre',
  'erro-sem-internet', 'erro-servidor', 'erro-nao-encontrada',
];

test('as 16 telas do spec existem, nos dois temas', () => {
  assert.deepEqual(screenNames(), [...REQUIRED_SCREENS].sort());
  const generated = readdirSync(MOCKUPS);
  for (const s of REQUIRED_SCREENS) {
    for (const theme of ['light', 'dark']) {
      assert.ok(generated.includes(`${s}.${theme}.html`), `${s}.${theme}.html`);
      assert.ok(readdirSync(join(MOCKUPS, 'png')).includes(`${s}.${theme}.png`), `png/${s}.${theme}.png`);
    }
  }
});

test('Compose consegue ler as telas: nenhuma tela usa slider e nenhuma usa reticências', () => {
  for (const f of readdirSync(join(MOCKUPS, 'src'))) {
    assert.doesNotMatch(text(join(MOCKUPS, 'src', f)), /type="range"|slider|text-overflow/i, f);
  }
});
```

Run (em `TOOLS`): `node --test`
Expected: todos PASS (as Tasks 5–9 geraram as 16 telas e seus PNGs).

- [ ] **Step 2: Verificação completa com fonte normal e ampliada (Review Focus 1 e 2)**

Run (em `TOOLS`): `node export-png.mjs && node export-png.mjs --scale 1.3`
Expected: 32 linhas `OK` em cada execução e código de saída 0. Se `--scale 1.3` reportar `PROBLEMA` (texto cortado, rolagem horizontal), corrija o CSS/HTML da tela (use `min-height` em vez de `height` em contêineres de texto, deixe quebrar linha) e repita; depois rode `node export-png.mjs` (escala 1) para atualizar os PNGs versionados e `node build-mockups.mjs && node --test`. Abra com Read `mockups/png/x1.3/explorar.light.png` e `detalhe.dark.png` para ver o resultado.

- [ ] **Step 3: `README.md`**

```markdown
# Design do Passarim (etapa 4)

Sem Figma: tokens em JSON, logo em SVG e mockups em HTML exportados para PNG. Tudo versionado aqui.

## O que o app (etapa 5) consome

| Para | Use |
|---|---|
| Cores, tipografia, formas e espaços | [`tokens/TOKENS.md`](tokens/TOKENS.md) (gerado; inclui `Color.kt` pronto para colar) e `tokens/passarim-tokens.json` |
| Fonte | `mockups/fonts/manrope-latin-wght-normal.woff2` (Manrope variável, licença OFL em `OFL.txt`) → recursos de fonte do Compose |
| Ícone adaptativo | `icon/foreground.svg`, `background.svg`, `monochrome.svg` → Android Studio › *New › Vector Asset* (ou conversão para VectorDrawable) |
| Ícone da splash (Android 12+) | `icon/splash.svg` |
| Telas | `mockups/png/<tela>.<tema>.png` (referência visual; 16 telas × claro/escuro) |

As conservações (`LC`, `NT`, `VU`, `EN`, `CR`, `EW`) têm cor própria por tema; os rótulos em português estão em `TOKENS.md`.

## Telas

`splash` · `explorar` · `busca-ativa` · `explorar-vazio` · `filtros` · `detalhe` · `loading-explorar` · `loading-detalhe` · `favoritos` · `favoritos-vazio` · `configuracoes` · `dados-armazenamento` · `sobre` · `erro-sem-internet` · `erro-servidor` · `erro-nao-encontrada`

Os nomes de aves, nomes científicos, tamanhos, biomas, estados e as contagens do filtro vêm do catálogo (41 espécies). Fotos, gravações e créditos dos mockups são **ilustrativos**: fotos são placeholders e o crédito aparece na forma "autor · licença".

## Como regenerar

Requer Node ≥ 20.11 e Google Chrome. Em `tools/`:

```bash
npm install                 # uma vez
npm run build               # tokens → _base.css + TOKENS.md; fragmentos → páginas HTML
node export-png.mjs         # páginas → PNG (falha se houver texto cortado, rolagem horizontal ou fonte ausente)
node export-png.mjs --scale 1.3   # mesma verificação com fonte ampliada (PNGs em png/x1.3/, não versionados)
node export-icon-preview.mjs      # icon/preview-48dp.png (falha se a logo sair da zona segura de 66dp)
npm test                    # contraste, cores literais, arquivos gerados em dia, ícone
```

Para mudar uma cor: edite `tokens/passarim-tokens.json`, rode `node check-tokens.mjs` (contraste), `npm run build` e `node export-png.mjs`. Para mudar uma tela: edite `mockups/src/<tela>.html` (somente `var(--...)`, nunca cor literal) e repita o build e o export.
```

- [ ] **Step 4: CI, lint e specs**

1. `.markdownlint-cli2.yaml`: acrescente em `ignores:` a linha `  - "**/node_modules/**"   # dependências das ferramentas de design`.
2. `.github/workflows/ci.yml`: acrescente o job abaixo (mesmo nível de `docs:`):

```yaml
  design-tools:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: tokens, ícone e mockups (testes e contraste)
        working-directory: docs/design/tools
        run: |
          node --test
          node check-tokens.mjs
```

3. `docs/superpowers/specs/2026-10-01-passarim-design.md`: na seção "Design (pendências derivadas da revisão)" troque `Feito no Figma na etapa 4` por `Feito na etapa 4 (tokens, ícone e mockups em HTML, sem Figma — ver spec da etapa 4)`; na lista de ordem de construção troque `4. Design no Figma: tokens, tema claro, ícone flat e telas faltantes.` por `4. Design (sem Figma): tokens, tema claro, ícone flat (trinca-ferro) e telas faltantes.`
4. Remover o handoff do Figma: `git rm docs/design/figma/LEIA-ME.md`.

- [ ] **Step 5: Verificar lint, testes e checagem de sobras**

Run (em `~/dev/passarim/passarim-docs`): `npx -y markdownlint-cli2 "**/*.md"`
Expected: `Summary: 0 error(s)`.
Run (em `TOOLS`): `node --test && node check-tokens.mjs`
Expected: todos PASS e `tokens OK`.
Run: `grep -rn "Figma" ~/dev/passarim/passarim-docs/docs/design ~/dev/passarim/passarim-docs/README.md ~/dev/passarim/passarim-docs/BACKLOG.md || true`
Expected: sem ocorrências (menções em planos/specs antigos podem ficar; são histórico).

- [ ] **Step 6: Revisão visual final**

Abra com Read, pelo menos, `png/explorar.light.png`, `png/explorar.dark.png`, `png/detalhe.light.png`, `png/filtros.dark.png`, `png/configuracoes.light.png`, `png/erro-sem-internet.dark.png` e `icon/preview-48dp.png`, e confira contra os critérios de pronto do spec (§7): sem cortes, um só verde de marca, um só fundo por tema, ícone legível a 48dp. Liste no relatório final qualquer divergência encontrada.

- [ ] **Step 7: Commit e push**

```bash
cd ~/dev/passarim/passarim-docs
git add docs/design/README.md docs/design/tools/mockups.test.mjs .github/workflows/ci.yml .markdownlint-cli2.yaml docs/superpowers/specs/2026-10-01-passarim-design.md docs/design/mockups/png
git add -u docs/design/figma
git commit -m "docs: etapa 4 completa — README do design, job de CI e specs sem Figma"
git push origin main
```

Expected: o job `design-tools` do CI fica verde no GitHub.
