# Frente C1 — PiuDS, fundação: regras, tokens, renomeação e tema: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar nome, regras e tokens ao design system (PiuDS), renomear o módulo do app sem mudar nada na tela e trocar o tema pelo `PiuTheme` com as variantes Piu (expressivo) e Piu Kids.

**Architecture:**
- **PR 1, `passarim-docs`:** o README de regras volta para `docs/design/piuds/README.md`, atualizado. O `passarim-tokens.json` sobe para a 2.0.0, com os gradientes de bioma, o scrim, o peso 800 dos títulos e um bloco `kids`. A ferramenta de contraste passa a conferir o Kids e os gradientes, e o gerador de docs ganha o Kids.
- **PR 2, `passarim-app` (C1a):** renomeação mecânica, de `core:design-system` para `core:piu-ds`, do pacote para `com.velosobr.piuds` e dos composables públicos para o prefixo `Piu`. O portão é o diff de snapshots zero.
- **PR 3, `passarim-app` (C1b):**
  - `Journey` e `Biome` em `core:domain`;
  - funções puras de escolha de esquema e de "reduzir animações";
  - esquema, tipografia e formas do Kids, com Fredoka e Nunito;
  - títulos em 800;
  - `PiuTheme.tokens`;
  - `PiuTheme(journey, themeMode, dynamicColor)` sobre `MaterialExpressiveTheme`;
  - leitura de "reduzir animações" por plataforma;
  - fontes na tela de Licenças;
  - snapshots regravados, com o diff para o dono aprovar.

**Tech Stack:** Kotlin Multiplatform, Compose Multiplatform 1.12.1, Material 3 1.9.0 (androidx 1.4.0), Paparazzi 2.0.0-alpha05.1, AboutLibraries 15.3.0, assertk, Node 22 (ferramentas de `docs/design/tools`, `node --test`).

**Spec:** `passarim-docs/docs/superpowers/specs/2026-10-28-passarim-frente-c-piuds-design.md` (docs #21), seções 1 a 5, 8 e 9. Cobre os PRs 1 a 3 da seção 9; os componentes (PRs 4 a 7) ficam no plano C2.

## Global Constraints

- **Comentários didáticos em português** em todo código, script e Gradle novos ou alterados (regra do `~/dev/passarim/CLAUDE.md`):
  - todo arquivo começa dizendo o seu papel;
  - conceitos são explicados na primeira vez que aparecem no arquivo (`CompositionLocal`, `expect/actual`, `@OptIn`, fonte variável, contraste WCAG);
  - mudou o código, atualiza o comentário.
- **Idioma:** identificadores em inglês; comentários, KDoc, commits e PRs em português do Brasil.
- **Identidade do Git:** `velosobr <linoc.veloso@gmail.com>`. Commits terminam com as linhas de atribuição da sessão.
- **Nenhuma tela muda de layout** (spec, seção 1). O C1a não muda nenhum pixel; o C1b muda só o tema expressivo e o peso dos títulos.
- **Snapshots:** só regravar com o diff revisado. No C1a o `verifyPaparazziDebug` tem de passar **sem regravar nada**.
- **Tema expressivo:** `MaterialExpressiveTheme` e `MotionScheme` são internos no CMP material3 1.9.0 (descoberto na execução). O `PiuTheme` usa `MaterialTheme` com `TODO(frente-H)`; ver a correção na spec, seção 5.2.
- **Acessores do tema:** só `PiuTheme.tokens`, `PiuTheme.reduceMotion` e `PiuTheme.isDark`. As features continuam com `MaterialTheme.*`.
- **Dependências:** nenhuma biblioteca nova no C1, além de o `piu-ds` passar a usar o `lifecycle-runtime-compose`, que já está no catálogo. Lockfiles e `aboutlibraries.json` atualizados no mesmo PR (`./gradlew resolveAndLockShipped --write-locks :androidApp:exportLibraryDefinitions`).
- **Branches:**
  - docs: `docs/piuds-tokens` (PR 1);
  - app: `refactor/piu-ds` (PR 2) ← `feat/piu-theme` (PR 3).
  - O PR 3 só abre depois do merge do PR 1, porque os tokens vêm de lá; o código pode ser escrito antes, com os valores deste plano.
- **Sem merge, sem push na `main` e sem apagar o branch `docs/piu-readme`:** isso é do dono.
- **iOS sem Xcode:** o `:app:linkDebugFrameworkIosSimulatorArm64` (Tasks 2, 5 e 6) e a conferência no simulador iOS (Task 5, Step 6) precisam do Xcode selecionado. Se `xcode-select -p` não apontar para o Xcode, tire essa tarefa do comando, confie no job iOS do CI e registre no PR.

## Review Focus

1. **Kids com `ThemeMode.DARK` ou com cores dinâmicas ligadas:** continua claro e com a paleta Kids. Teste na Task 3 (`resolvePiuScheme`).
2. **Fonte a 2.0× com títulos em 800:** um título pode cortar. O PR 3 lista cada snapshot em que um texto cortou e o que foi feito; nenhum corte aceito em silêncio (Task 5, Step 7).
3. **Renomeação que muda o nome de um snapshot:** o Paparazzi monta o arquivo com o pacote, a classe e o método do teste. O módulo `snapshots` não renomeia classes nem métodos (Task 2, Step 5).
4. **Gradiente com texto que passa numa ponta e falha na outra:** a ferramenta confere as duas pontas (Task 1, `checkGradients`).
5. **Preferência "Remover animações" mudada com o app aberto:** o valor é relido ao voltar ao app (`LifecycleResumeEffect`, Task 5). A conferência à mão vai para o PR.

---

### Task 1: Docs — regras do PiuDS, tokens 2.0.0 e contraste (PR 1)

**Files:**
- Create: `passarim-docs/docs/design/piuds/README.md` (a partir do branch `docs/piu-readme`)
- Modify: `passarim-docs/docs/design/tokens/passarim-tokens.json`, `passarim-docs/docs/design/tools/check-tokens.mjs`, `passarim-docs/docs/design/tools/check-tokens.test.mjs`, `passarim-docs/docs/design/tools/build-tokens.mjs`, `passarim-docs/docs/design/tools/build-tokens.test.mjs`
- Regenerate: `passarim-docs/docs/design/tokens/TOKENS.md`, `passarim-docs/docs/design/mockups/_base.css`

**Interfaces:**
- Produces: `passarim-tokens.json` 2.0.0, com `gradient.biome.<bioma> = {from, to, text}`, `scrim = {color, alpha}`, `type.titleWeight = 800`, `kids.color.light`, `kids.type`, `kids.shape`, `kids.gradient.world.<bioma>`, `kids.shadow`; `checkTokens` com `kind: 'gradient'`.

- [ ] **Step 1: Branch**

```bash
cd ~/dev/passarim/passarim-docs
git switch main && git pull --ff-only && git switch -c docs/piuds-tokens
cd docs/design/tools && npm ci
```

- [ ] **Step 2: Testes que falham**

Acrescente a `check-tokens.test.mjs`:

```js
test('o bloco kids tem todos os papéis do Material e passa nos mesmos pares', () => {
  const t = fresh();
  t.kids.color.light.onSurface = '#B8B0A0';
  const f = checkTokens(t);
  assert.ok(f.some((x) => x.kind === 'contrast' && x.theme === 'kids' && x.bg === 'surface' && x.fg === 'onSurface'));
  const u = fresh();
  delete u.kids.color.light.scrim;
  assert.ok(checkTokens(u).some((x) => x.kind === 'missing' && x.theme === 'kids' && x.role === 'scrim'));
});

test('o texto de um gradiente é conferido contra as duas pontas', () => {
  const t = fresh();
  t.gradient.biome.cerrado.to = '#D9A13B'; // a ponta clara da prancheta: 2.30:1 com branco
  const f = checkTokens(t);
  assert.ok(f.some((x) => x.kind === 'gradient' && x.name === 'gradient.biome.cerrado' && x.end === 'to' && x.ratio < 4.5));
  const u = fresh();
  u.kids.gradient.world.pantanal.to = '#2B7FD8'; // a ponta da prancheta: 3.83:1 com o texto
  assert.ok(checkTokens(u).some((x) => x.kind === 'gradient' && x.name === 'kids.gradient.world.pantanal'));
});

test('o branco sobre o scrim é conferido no pior caso (foto branca)', () => {
  const t = fresh();
  t.scrim.alpha = 0.3;
  assert.ok(checkTokens(t).some((x) => x.kind === 'contrast' && x.bg === 'scrim'));
});

test('as cores de conservação são conferidas sobre o creme do Kids', () => {
  const t = fresh();
  t.conservation.light.EX.fg = '#C8C0B0';
  assert.ok(checkTokens(t).some((x) => x.kind === 'contrast' && x.theme === 'kids' && x.fg === 'conservation.EX.fg'));
});

test('os seis biomas têm gradiente no Piu e no Kids', () => {
  const t = loadTokens();
  const biomes = ['amazonia', 'mata_atlantica', 'cerrado', 'caatinga', 'pantanal', 'pampa'];
  assert.deepEqual(Object.keys(t.gradient.biome).sort(), [...biomes].sort());
  assert.deepEqual(Object.keys(t.kids.gradient.world).sort(), [...biomes].sort());
  assert.equal(t.meta.version, '2.0.0');
  assert.equal(t.type.titleWeight, 800);
});
```

Acrescente a `build-tokens.test.mjs`:

```js
test('docs: Kotlin com os nomes do PiuDS e a seção do Kids', () => {
  const md = toDocs(tokens);
  assert.ok(md.includes('val PiuLightColors = lightColorScheme('));
  assert.ok(md.includes('val PiuKidsColors = lightColorScheme('));
  assert.ok(md.includes('## Passarim Kids'));
  assert.ok(md.includes('| `pantanal` |'));
});

test('CSS: bloco do Kids em [data-variant="kids"]', () => {
  const css = toCss(tokens);
  assert.ok(css.includes('[data-variant="kids"]{'));
  assert.ok(css.includes('--md-surface:#FFF7E8;'));
});
```

E troque, no teste `'docs: tabela de cores e bloco Kotlin'`, a linha `assert.ok(md.includes('val PassarimDarkColors = darkColorScheme('));` por `assert.ok(md.includes('val PiuDarkColors = darkColorScheme('));`.

Run: `npm test`
Expected: FAIL (`t.kids` indefinido, `PiuLightColors` ausente).

- [ ] **Step 3: Tokens 2.0.0**

Em `passarim-tokens.json`:

- troque `"meta": { "name": "Passarim", "version": "1.0.0" }` por `"meta": { "name": "Passarim", "version": "2.0.0" }`;
- dentro de `"type"`, logo depois de `"family": "Manrope",`, acrescente `"titleWeight": 800,`, e troque o `"weight": 700` de `displayLarge`, `displayMedium`, `displaySmall`, `headlineLarge`, `headlineMedium`, `headlineSmall` e `titleLarge` por `"weight": 800`;
- antes da última `}` do arquivo (depois de `"space": {...}`), acrescente:

```json
  ,
  "gradient": {
    "angle": 135,
    "biome": {
      "amazonia":       { "from": "#063D27", "to": "#328556", "text": "#FFFFFF" },
      "mata_atlantica": { "from": "#0D4F45", "to": "#3C8361", "text": "#FFFFFF" },
      "cerrado":        { "from": "#6E3A0E", "to": "#9A6E1E", "text": "#FFFFFF" },
      "caatinga":       { "from": "#5C2414", "to": "#B65D30", "text": "#FFFFFF" },
      "pantanal":       { "from": "#0E3A57", "to": "#338095", "text": "#FFFFFF" },
      "pampa":          { "from": "#3E4A12", "to": "#737B37", "text": "#FFFFFF" }
    }
  },
  "scrim": { "color": "#101410", "alpha": 0.8, "from": 0.25, "text": "#FFFFFF" },
  "kids": {
    "color": {
      "light": {
        "primary": "#A84300", "onPrimary": "#FFFFFF",
        "primaryContainer": "#FF8A3D", "onPrimaryContainer": "#1D2B3A",
        "secondary": "#1E5FA6", "onSecondary": "#FFFFFF",
        "secondaryContainer": "#CDEBFF", "onSecondaryContainer": "#0A2440",
        "tertiary": "#B8164F", "onTertiary": "#FFFFFF",
        "tertiaryContainer": "#FFD6E0", "onTertiaryContainer": "#4A0A22",
        "error": "#B3261E", "onError": "#FFFFFF",
        "errorContainer": "#FFDAD6", "onErrorContainer": "#410002",
        "background": "#FFF7E8", "onBackground": "#1D2B3A",
        "surface": "#FFF7E8", "onSurface": "#1D2B3A",
        "surfaceVariant": "#F2E3C6", "onSurfaceVariant": "#4A5566",
        "surfaceDim": "#EADBBF", "surfaceBright": "#FFF7E8",
        "surfaceContainerLowest": "#FFFFFF", "surfaceContainerLow": "#FFF2DC",
        "surfaceContainer": "#FCEDD3", "surfaceContainerHigh": "#F8E7C9", "surfaceContainerHighest": "#F2E3C6",
        "outline": "#6E7680", "outlineVariant": "#E2D2B2",
        "inverseSurface": "#1D2B3A", "inverseOnSurface": "#FFF7E8", "inversePrimary": "#FFC93C",
        "scrim": "#000000"
      }
    },
    "type": {
      "titleFamily": "Fredoka",
      "bodyFamily": "Nunito",
      "styles": {
        "displayLarge":   { "family": "Fredoka", "size": 57, "line": 64, "weight": 700, "tracking": 0 },
        "displayMedium":  { "family": "Fredoka", "size": 45, "line": 52, "weight": 700, "tracking": 0 },
        "displaySmall":   { "family": "Fredoka", "size": 38, "line": 44, "weight": 700, "tracking": 0 },
        "headlineLarge":  { "family": "Fredoka", "size": 34, "line": 40, "weight": 700, "tracking": 0 },
        "headlineMedium": { "family": "Fredoka", "size": 28, "line": 34, "weight": 700, "tracking": 0 },
        "headlineSmall":  { "family": "Fredoka", "size": 26, "line": 32, "weight": 700, "tracking": 0 },
        "titleLarge":     { "family": "Fredoka", "size": 22, "line": 28, "weight": 700, "tracking": 0 },
        "titleMedium":    { "family": "Fredoka", "size": 18, "line": 24, "weight": 700, "tracking": 0 },
        "titleSmall":     { "family": "Fredoka", "size": 16, "line": 22, "weight": 600, "tracking": 0 },
        "bodyLarge":      { "family": "Nunito", "size": 18, "line": 26, "weight": 600, "tracking": 0 },
        "bodyMedium":     { "family": "Nunito", "size": 16, "line": 24, "weight": 600, "tracking": 0 },
        "bodySmall":      { "family": "Nunito", "size": 14, "line": 20, "weight": 600, "tracking": 0 },
        "labelLarge":     { "family": "Nunito", "size": 16, "line": 22, "weight": 800, "tracking": 0 },
        "labelMedium":    { "family": "Nunito", "size": 14, "line": 20, "weight": 800, "tracking": 0 },
        "labelSmall":     { "family": "Nunito", "size": 12, "line": 16, "weight": 700, "tracking": 0 }
      }
    },
    "shape": { "small": 16, "medium": 24, "large": 28, "extraLarge": 38, "touchTarget": 56 },
    "gradient": {
      "angle": 150,
      "world": {
        "amazonia":       { "from": "#9BE15D", "to": "#1F9F56", "text": "#0B2A17" },
        "mata_atlantica": { "from": "#6EE7C0", "to": "#13A38B", "text": "#0B2A17" },
        "cerrado":        { "from": "#FFE066", "to": "#FF9F1C", "text": "#3A2200" },
        "caatinga":       { "from": "#FFB38A", "to": "#E65741", "text": "#3A1208" },
        "pantanal":       { "from": "#7DD3FC", "to": "#438DDC", "text": "#0A2440" },
        "pampa":          { "from": "#E4F57A", "to": "#7CB342", "text": "#1F2A0A" }
      }
    },
    "shadow": {
      "card":   { "color": "#F2E3C6", "offset": 4 },
      "button": { "color": "#C9601E", "offset": 5 }
    }
  }
```

(Os valores de `to` que mudaram em relação às pranchetas foram calculados escurecendo ou clareando a luminosidade HSL em passos de 0,5% até o par passar a 4,5:1; a tabela de antes e depois vai para o README, no Step 6.)

- [ ] **Step 4: Ferramenta de contraste**

Em `check-tokens.mjs`, troque `export function checkTokens(tokens) {` e o laço `for (const theme of THEMES) {` do começo da função por:

```js
// Confere um esquema de cores (papéis presentes, hex válido e os pares de
// texto e de não texto). `theme` é só o rótulo do relatório: light, dark ou kids.
function checkScheme(out, theme, roles) {
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
}

// Um gradiente tem texto por cima: o texto precisa de 4.5:1 contra AS DUAS
// pontas, porque a palavra pode cair em qualquer parte do degradê.
function checkGradients(out, prefix, gradients) {
  for (const [name, g] of Object.entries(gradients ?? {})) {
    for (const end of ['from', 'to']) {
      const ratio = contrastRatio(g[end], g.text);
      if (ratio < 4.5) out.push({ kind: 'gradient', name: `${prefix}.${name}`, end, ratio, min: 4.5 });
    }
  }
}

// Mistura uma cor com transparência (alpha) sobre um fundo: é a cor que o
// olho vê. Serve para o scrim, que é translúcido.
function over(hex, alpha, bgHex) {
  const [a, b] = [hex, bgHex].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  return `#${a.map((c, i) => Math.round(alpha * c + (1 - alpha) * b[i]).toString(16).padStart(2, '0')).join('')}`;
}

export function checkTokens(tokens) {
  const out = [];
  checkScheme(out, 'kids', tokens.kids?.color?.light ?? {});
  checkGradients(out, 'gradient.biome', tokens.gradient?.biome);
  checkGradients(out, 'kids.gradient.world', tokens.kids?.gradient?.world);
  // Scrim: o pior caso é uma foto branca por baixo.
  if (tokens.scrim) {
    const seen = over(tokens.scrim.color, tokens.scrim.alpha, '#FFFFFF');
    const ratio = contrastRatio(seen, tokens.scrim.text);
    if (ratio < 4.5) out.push({ kind: 'contrast', theme: 'light', bg: 'scrim', fg: 'scrim.text', ratio, min: 4.5 });
  }
  // O Kids usa as cores de conservação do tema claro, sobre o creme.
  const cream = tokens.kids?.color?.light?.surface;
  for (const status of STATUSES) {
    const c = tokens.conservation?.light?.[status];
    if (!cream || !c || !HEX.test(c.fg ?? '')) continue;
    const ratio = contrastRatio(cream, c.fg);
    if (ratio < 4.5) out.push({ kind: 'contrast', theme: 'kids', bg: 'surface', fg: `conservation.${status}.fg`, ratio, min: 4.5 });
  }
  for (const theme of THEMES) {
    checkScheme(out, theme, tokens.color?.[theme] ?? {});
```

e apague, dentro do laço `for (const theme of THEMES)`, as linhas antigas que o `checkScheme` substituiu (o laço dos `REQUIRED_ROLES` e o dos `pairs`), mantendo o laço dos `STATUSES`. No bloco `if (isMain(...))`, troque a montagem de `what` por:

```js
    const what = f.kind === 'contrast'
      ? `${f.bg} × ${f.fg} = ${f.ratio.toFixed(2)} (mínimo ${f.min})`
      : f.kind === 'gradient'
        ? `${f.name}.${f.end} × texto = ${f.ratio.toFixed(2)} (mínimo ${f.min})`
        : `${f.role}${f.value ? ` = ${f.value}` : ''}`;
    console.error(`FALHA [${f.kind}] ${f.theme ?? ''}: ${what}`);
```

e a mensagem final por `console.log('tokens OK: estrutura e contraste dentro dos limites no Piu (claro e escuro), no Kids e nos gradientes');`.

- [ ] **Step 5: Gerador de docs e CSS**

Em `build-tokens.mjs`:

- troque `kotlinScheme('PassarimLightColors', ...)` e `kotlinScheme('PassarimDarkColors', ...)` por `kotlinScheme('PiuLightColors', ...)` e `kotlinScheme('PiuDarkColors', ...)`;
- em `toCss`, troque o `return` por:

```js
  // O Kids é uma variante só clara: um bloco próprio, ligado por data-variant.
  const kids = `[data-variant="kids"]{\n${Object.entries(t.kids.color.light).map(([role, hex]) => `  --md-${kebab(role)}:${hex};`).join('\n')}\n}\n`;
  return head + shared
    + themeBlock(':root,[data-theme="light"]', t, 'light')
    + themeBlock('[data-theme="dark"]', t, 'dark')
    + type
    + kids;
```

- em `toDocs`, antes do `return [`, acrescente:

```js
  const gradRows = (g) => Object.entries(g).map(([n, c]) => `| \`${n}\` | \`${c.from}\` | \`${c.to}\` | \`${c.text}\` |`);
  const kidsRoleRows = Object.entries(t.kids.color.light).map(([r, hex]) => `| \`${r}\` | \`${hex}\` |`);
  const kidsTypeRows = Object.entries(t.kids.type.styles)
    .map(([n, s]) => `| \`${n}\` | ${s.family} | ${s.size} | ${s.line} | ${s.weight} |`);
```

  e, no array devolvido, logo antes de `'## Forma e espaço',`, acrescente:

```js
    '## Gradientes de bioma (Piu)',
    '',
    `Ângulo de ${t.gradient.angle}°. O texto passa a 4.5:1 contra as duas pontas.`,
    '',
    '| Bioma | De | Até | Texto |',
    '|---|---|---|---|',
    ...gradRows(t.gradient.biome),
    '',
    `Scrim de foto: \`${t.scrim.color}\` com opacidade ${t.scrim.alpha}, a partir de ${t.scrim.from * 100}% da altura; texto \`${t.scrim.text}\`.`,
    '',
    '## Passarim Kids',
    '',
    'Variante só clara. Mesmos papéis do Material 3.',
    '',
    '| Papel | Cor |',
    '|---|---|',
    ...kidsRoleRows,
    '',
    '```kotlin',
    kotlinScheme('PiuKidsColors', 'lightColorScheme', t.kids.color.light),
    '```',
    '',
    `### Mundos (ângulo de ${t.kids.gradient.angle}°)`,
    '',
    '| Mundo | De | Até | Texto |',
    '|---|---|---|---|',
    ...gradRows(t.kids.gradient.world),
    '',
    '### Tipografia Kids',
    '',
    '| Estilo | Família | Tamanho | Linha | Peso |',
    '|---|---|---|---|---|',
    ...kidsTypeRows,
    '',
    `Formas (dp): ${Object.entries(t.kids.shape).map(([k, v]) => `\`${k}\` ${v}`).join(', ')}. Sombras sólidas: cartão \`${t.kids.shadow.card.color}\` (${t.kids.shadow.card.offset} dp), botão \`${t.kids.shadow.button.color}\` (${t.kids.shadow.button.offset} dp).`,
    '',
```

Run: `npm run build && npm test && npm run check`
Expected: os gerados atualizados, `npm test` PASS e `tokens OK: ...`.

- [ ] **Step 6: README do PiuDS**

```bash
cd ~/dev/passarim/passarim-docs
mkdir -p docs/design/piuds
git show docs/piu-readme:docs/design/piuds/README.md > docs/design/piuds/README.md
```

Aplique estas mudanças ao arquivo:

1. No primeiro parágrafo, troque a frase que começa por "Design system **exclusivo do Passarim**" até o fim do parágrafo por:

   > Design system **exclusivo do Passarim**, com duas variantes: **Piu** (a jornada adulta) e **Piu Kids** (a jornada das crianças). O nome vem do som do passarinho (**Piu**) e o sufixo **DS** (*design system*) deixa a intenção clara para quem lê. No código, os componentes usam o prefixo curto `Piu` (`PiuTheme`, `PiuFilterChip`); o pacote `com.velosobr.piuds` já diz de onde vêm.

2. Na tabela da seção 1, troque "Um design system multimarca, com tema parametrizável" por "Um design system multimarca: o tema é parametrizado **só pela jornada**".

3. Na seção 3, troque a lista "Pode depender **apenas** de" e a de "**Não pode** depender de" por:

   > - Pode depender **apenas** de: Compose (runtime, foundation, material3, ui), Compose Resources, `lifecycle-runtime-compose` (para reler preferências do sistema ao voltar ao app), Coil (os componentes de foto carregam imagens), Haze (só no `PiuBlurSurface`), `graphics-shapes` (a forma cookie) e `:core:domain`.
   > - **Não pode** depender de: `:app`, `:feature:*`, `:core:data`, `:core:presentation`, Koin, Ktor, Room nem MapLibre.

   E troque o último item da seção (o da task Gradle de allowlist) por:

   > - A fronteira é conferida na revisão de PR. `TODO(frente-H)`: uma task Gradle que confira as dependências **resolvidas** do módulo contra uma allowlist e entre no `check`.

4. Na seção 3, troque "`PiuTheme(themeMode, dynamicColor)` já usa a paleta, a fonte Manrope e as formas do Passarim. Não existe parâmetro de marca." por "`PiuTheme(journey, themeMode, dynamicColor)` escolhe a variante pela jornada: Piu (Manrope, claro, escuro e cores dinâmicas) ou Piu Kids (Fredoka e Nunito, sempre claro, sem cores dinâmicas). Não existe parâmetro de marca."

5. Na seção 4, troque o segundo e o terceiro itens por:

   > - Esquema de cores **Material 3**, com os mesmos nomes de papel do `ColorScheme`. As features leem cores, tipografia e formas pelo `MaterialTheme`. O que o Material não tem fica em `PiuTheme.tokens` (gradientes de bioma e de mundo, scrim, sombras sólidas do Kids e cores de conservação). Além dele, só `PiuTheme.reduceMotion` e `PiuTheme.isDark`.
   > - **Proibido em componentes:** cor literal (`Color(0xFF...)`), `dp` e `sp` soltos fora de `PiuDimens` e da tipografia, `RoundedCornerShape(12.dp)` direto. Use `MaterialTheme.colorScheme`, `MaterialTheme.typography`, `MaterialTheme.shapes`, `PiuTheme.tokens` e `PiuDimens`.

   E troque o item dos temas por "Temas: no Piu, Sistema, Claro e Escuro, mais **cores dinâmicas** opcionais (Android 12+, via `expect/actual`; nas outras plataformas cai para a paleta da marca). No Piu Kids, sempre claro."

   E troque o item do contraste por "**Contraste verificado por teste** (`docs/design/tools/check-tokens.mjs`): texto ≥ 4.5:1 e elementos não textuais ≥ 3:1, no Piu claro, no Piu escuro e no Kids; o texto de cada gradiente contra as duas pontas; o branco sobre o scrim no pior caso (foto branca); as cores de conservação sobre o creme do Kids."

6. Na seção 5, troque o item "**Animação:**" por:

   > - **Animação:** curta e com função. Todo componente animado lê `PiuTheme.reduceMotion` e, com a preferência do sistema ligada, troca a mola por uma troca seca, sem esconder nada (uma mensagem aparece parada).

7. Na seção 6, troque "Alvo de toque **mínimo de 48dp**" por "Alvo de toque **mínimo de 48dp no Piu e de 56dp no Piu Kids**" e "O layout aguenta **fonte 1.3×**" por "O layout aguenta **fonte 2.0×**".

8. Na seção 7, depois do item 1 ("Regra do 2"), acrescente:

   > 1a. **Exceção fechada, os componentes de assinatura das variantes:** `PiuCookieShape`, `PiuBlurSurface`, `PiuCreditCaption` (com o modo sem link), `PiuMosaicCard`, `PiuFeaturedCard`, `PiuBiomeChip`, `PiuFloatingNavBar`, `PiuKidsButton`, `PiuWorldCard`, `PiuSticker`, `PiuPipoBalloon` e `PiuKidsNavBar`. Eles carregam a linguagem visual da jornada e entram antes da segunda feature que os usa. Qualquer outro componente de jornada precisa da regra do 2 ou de uma linha num PRD.

9. Na seção 8, troque "cada componente em **claro e escuro** × **fonte 1.0× e 1.3×**" por "cada componente do Piu em **claro e escuro** × **fonte 1.0×, 1.3× e 2.0×**, e cada componente do Piu Kids **só em claro** × as mesmas três escalas"; e troque o item da semântica por "**Semântica** de componentes clicáveis (papel, descrição, alvo de toque), com `compose-ui-test` e `runComposeUiTest` em `androidHostTest`, a partir do plano C2."; e apague o item "**Arquitetura:** a task de dependências da seção 3."

9a. Ainda na seção 8, troque "(alvo Android, source set `androidHostTest`)" por "(módulo Android `snapshots`, ADR-0017)" e apague a frase do fallback para o Roborazzi.

9b. Na seção 9, troque "`@Preview` em claro e escuro" por "`@Preview` em claro e escuro no Piu; só em claro no Piu Kids".

9c. Na seção 12 (checklist), troque o primeiro item por "- [ ] Usado por 2 ou mais features (ou na exceção 1a da seção 7) e passa no teste do domínio", o do alvo de toque por "- [ ] Alvo de toque ≥ 48dp no Piu e ≥ 56dp no Kids, `contentDescription` onde for clicável, papel semântico" e o dos snapshots por "- [ ] Snapshots com fonte 1.0×, 1.3× e 2.0×: Piu em claro e escuro, Kids só em claro, e em cada estado".

10. Na seção 10, troque "a fonte Manrope é OFL" por "as fontes Manrope, Fredoka e Nunito são OFL e aparecem na tela de Licenças (definições customizadas do AboutLibraries)".

11. No fim do arquivo, acrescente:

```markdown
## 13. Ajustes de cor em relação às pranchetas (tokens 2.0.0)

As pranchetas de `docs/design/direcoes-2026` eram direção, não token. Estas cores mudaram para passar no contraste
(4.5:1 do texto contra as duas pontas do gradiente). Cada uma mudou o mínimo possível, só na luminosidade, mantendo o
matiz.

| Onde | Antes | Depois | Contraste antes → depois |
|---|---|---|---|
| Bioma Amazônia (Piu), ponta clara, texto branco | `#3FA66B` | `#328556` | 3.05 → 4.54 |
| Bioma Mata Atlântica (Piu), ponta clara | `#4DAA7E` | `#3C8361` | 2.85 → 4.55 |
| Bioma Cerrado (Piu), ponta clara | `#D9A13B` | `#9A6E1E` | 2.30 → 4.54 |
| Bioma Caatinga (Piu), ponta clara | `#D07A4E` | `#B65D30` | 3.19 → 4.57 |
| Bioma Pantanal (Piu), ponta clara | `#3E9CB5` | `#338095` | 3.17 → 4.50 |
| Bioma Pampa (Piu), ponta clara | `#A3AE4E` | `#737B37` | 2.41 → 4.55 |
| Mundo Amazônia (Kids), ponta escura, texto `#0B2A17` | `#1F9D55` | `#1F9F56` | 4.43 → 4.53 |
| Mundo Caatinga (Kids), ponta escura, texto `#3A1208` | `#E5533D` | `#E65741` | 4.44 → 4.57 |
| Mundo Pantanal (Kids), ponta escura, texto `#0A2440` | `#2B7FD8` | `#438DDC` | 3.83 → 4.54 |
| Rótulo do botão laranja (Kids) | branco | `#1D2B3A` (azul-noite) | 2.35 → 6.14 |

O amarelo do Pipo (`#FFC93C`) sobre o creme dá 1.44:1 e fica fora da verificação: o Pipo é decorativo e não carrega
informação.
```

- [ ] **Step 7: Commit, push e PR**

```bash
cd ~/dev/passarim/passarim-docs
git add docs/design
git commit -m "docs: regras do PiuDS e tokens 2.0.0 com a variante Kids

README de regras de volta (duas variantes, exceção fechada à regra do 2,
alinhado ao código), tokens com gradientes, scrim, títulos 800 e o bloco
kids, e a ferramenta de contraste conferindo o Kids e os gradientes."
git push -u origin docs/piuds-tokens
gh pr create --base main --title "PiuDS: regras e tokens 2.0.0 (variante Kids)" --body "Frente C, PR 1 (spec docs #21, seções 3 e 4). **Para o dono aprovar:** a tabela de ajustes de cor em relação às pranchetas, na seção 13 do README do PiuDS. Depois do merge, o branch docs/piu-readme pode ser apagado (só com o seu ok)."
```

---

### Task 2: App — renomeação para o PiuDS, sem mudança visual (PR 2, C1a)

**Files:**
- Move: `passarim-app/core/design-system/` → `passarim-app/core/piu-ds/`, e o pacote `com/velosobr/passarim/core/designsystem/` → `com/velosobr/piuds/` em todos os source sets
- Modify: `settings.gradle.kts`, `core/piu-ds/build.gradle.kts`, todo `build.gradle.kts` que cita `projects.core.designSystem`, os 18 arquivos `.kt` de fora do módulo que importam o pacote, e os arquivos dos componentes (nomes)

**Interfaces:**
- Produces: módulo `:core:piu-ds` (acessor `projects.core.piuDs`), pacote `com.velosobr.piuds` (subpacotes `components`, `theme` e `resources`), composables `PiuSpeciesCard`, `PiuHeroPhoto`, `PiuHeroIconButton`, `PiuLabeledChips`, `PiuInfoChips`, `PiuSkeletonBox`, `PiuPhotoGallery`, `PiuCreditCaption`, `PiuFactTile`, `PiuScreenTitle`, `PiuFilterChip`, `PiuConservationBadge`, `PiuSearchField`, `PiuBackTopBar`, `PiuStateScreen`, `PiuSpeciesListItem`; tema `PiuTheme(darkTheme, dynamicColor, content)` (assinatura antiga), `PiuLightColors`, `PiuDarkColors`, `PiuShapes`, `PiuDimens`, `piuTypography()`.

- [ ] **Step 1: Branch e referência**

```bash
cd ~/dev/passarim/passarim-app
git switch main && git pull --ff-only && git switch -c refactor/piu-ds
./gradlew :snapshots:verifyPaparazziDebug   # tem de passar ANTES, para o "diff zero" valer
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 2: Mover o módulo e o pacote**

```bash
git mv core/design-system core/piu-ds
for set in commonMain commonTest androidMain iosMain; do
  base=core/piu-ds/src/$set/kotlin
  [ -d "$base/com/velosobr/passarim/core/designsystem" ] || continue
  mkdir -p "$base/com/velosobr/piuds"
  git mv "$base/com/velosobr/passarim/core/designsystem"/* "$base/com/velosobr/piuds/"
done
find core/piu-ds/src -type d -empty -delete
```

Em `settings.gradle.kts`, troque `include(":core:design-system")` por `include(":core:piu-ds")`.

Em `core/piu-ds/build.gradle.kts`, troque o comentário do topo por:

```kotlin
// Build do PiuDS, o design system do Passarim (variantes Piu e Piu Kids):
// tema, tokens e componentes visuais usados por todas as features. Coil (o
// carregador de imagens) entra só como "implementation": os componentes de
// foto o usam por dentro. O PiuDS usa o pacote curto com.velosobr.piuds, e
// não o padrão por caminho do convention plugin, por isso o namespace
// Android e o pacote dos recursos são fixados aqui.
```

e acrescente, depois do bloco `kotlin { ... }`:

```kotlin
kotlin {
    android {
        namespace = "com.velosobr.piuds"
    }
}

compose.resources {
    packageOfResClass = "com.velosobr.piuds.resources"
}
```

- [ ] **Step 3: Pacote, imports e acessores**

```bash
# Pacote e imports em todo o código (dentro e fora do módulo).
grep -rl 'com\.velosobr\.passarim\.core\.designsystem' --include='*.kt' --include='*.kts' . | grep -v '/build/' \
  | xargs sed -i '' 's/com\.velosobr\.passarim\.core\.designsystem/com.velosobr.piuds/g'
# Acessor tipado do módulo nos build.gradle.kts.
grep -rl 'projects\.core\.designSystem' --include='*.kts' . | grep -v '/build/' \
  | xargs sed -i '' 's/projects\.core\.designSystem/projects.core.piuDs/g'
grep -rn 'designsystem\|design-system\|designSystem' --include='*.kt' --include='*.kts' --include='*.md' --include='*.yml' . | grep -v '/build/'
```

Expected: a última busca só mostra textos de comentário ou de README (corrija-os à mão para "PiuDS" / `core:piu-ds`); nenhum código.

O sed também reescreve os exemplos dos comentários dos convention plugins, que ficariam falsos (o padrão do plugin geraria `com.velosobr.passarim.core.piuds`, não `com.velosobr.piuds`). Troque o exemplo por um módulo que segue o padrão:
- em `build-logic/src/main/kotlin/passarim.kmp-library.gradle.kts`, o comentário do `namespace` vira `// ":core:domain" -> "com.velosobr.passarim.core.domain"`;
- em `build-logic/src/main/kotlin/passarim.kmp-compose.gradle.kts`, o comentário do `packageOfResClass` vira `// ":core:domain" -> "com.velosobr.passarim.core.domain.resources"`.

- [ ] **Step 4: Prefixo `Piu` nos composables públicos e no tema**

Crie o script `scripts/rename-piu.py` **só neste branch** (é apagado no Step 6):

```python
# Renomeação mecânica do PiuDS (C1a): troca nomes inteiros (com fronteira de
# palavra) em todo .kt fora de build/, e renomeia os arquivos dos componentes.
# Os snapshots não mudam de nome porque as classes e os métodos de teste do
# módulo "snapshots" não são tocados (só as chamadas dentro deles).
import pathlib
import re
import subprocess

NAMES = {
    "SpeciesCard": "PiuSpeciesCard", "HeroPhoto": "PiuHeroPhoto", "HeroIconButton": "PiuHeroIconButton",
    "LabeledChips": "PiuLabeledChips", "InfoChips": "PiuInfoChips", "SkeletonBox": "PiuSkeletonBox",
    "PhotoGallery": "PiuPhotoGallery", "CreditCaption": "PiuCreditCaption", "FactTile": "PiuFactTile",
    "ScreenTitle": "PiuScreenTitle", "FilterChip": "PiuFilterChip", "ConservationBadge": "PiuConservationBadge",
    "SearchField": "PiuSearchField", "BackTopBar": "PiuBackTopBar", "StateScreen": "PiuStateScreen",
    "SpeciesListItem": "PiuSpeciesListItem",
    "PassarimTheme": "PiuTheme", "PassarimLightColors": "PiuLightColors", "PassarimDarkColors": "PiuDarkColors",
    "PassarimShapes": "PiuShapes", "PassarimDimens": "PiuDimens", "passarimTypography": "piuTypography",
}
# O FilterChip do Material é importado "as MaterialFilterChip": o nome
# precedido de "." ou de letra (MaterialFilterChip, material3.FilterChip)
# não casa com o padrão abaixo e fica como está.
for path in pathlib.Path(".").rglob("*.kt"):
    if "/build/" in str(path):
        continue
    text = path.read_text(encoding="utf-8")
    new = text
    for old, piu in NAMES.items():
        new = re.sub(rf"(?<![\w.]){old}\b", piu, new)          # uso solto: FilterChip( -> PiuFilterChip(
        new = re.sub(rf"(com\.velosobr\.piuds\.\w+\.){old}\b", rf"\g<1>{piu}", new)  # import do PiuDS
    # Desfaz o que tocou no import do Material.
    new = new.replace("androidx.compose.material3.PiuFilterChip", "androidx.compose.material3.FilterChip")
    if new != text:
        path.write_text(new, encoding="utf-8")

components = pathlib.Path("core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components")
for old, piu in NAMES.items():
    src = components / f"{old}.kt"
    if src.exists():
        subprocess.run(["git", "mv", str(src), str(components / f"{piu}.kt")], check=True)
theme = pathlib.Path("core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/theme")
if (theme / "PassarimTheme.kt").exists():
    subprocess.run(["git", "mv", str(theme / "PassarimTheme.kt"), str(theme / "PiuTheme.kt")], check=True)
```

Run:

```bash
python3 scripts/rename-piu.py
grep -rn 'PassarimTheme\|PassarimLightColors\|PassarimDarkColors\|PassarimShapes\|PassarimDimens\|passarimTypography' --include='*.kt' . | grep -v /build/
grep -rn 'material3.PiuFilterChip\|fun PiuPiu\|PiuPiu' --include='*.kt' . | grep -v /build/
```

Expected: as duas buscas vazias.

Depois, revise à mão os comentários e KDoc dos arquivos tocados (`git diff --stat` lista os arquivos): frases como "o tema do Passarim" ficam; nomes antigos citados em comentário passam para os novos. O regex também troca o comentário do topo de `PiuFilterChip.kt`: restaure "sobre o FilterChip do Material 3" (é o componente do Material, que não mudou de nome).

- [ ] **Step 5: O módulo de snapshots mantém classes e métodos**

```bash
git diff --name-status -- snapshots/ | grep -v '^M'
git diff -U0 -- snapshots/src/test | grep -E '^[-+].*(class |fun [a-z])'
```

Expected: as duas vazias (só arquivos modificados, e nenhuma linha de `class` ou de método de teste mudou). Se alguma aparecer, desfaça a mudança nessa linha: o nome do arquivo de snapshot depende dela.

- [ ] **Step 6: Verificar e commitar**

```bash
git rm -q --cached scripts/rename-piu.py 2>/dev/null; rm -f scripts/rename-piu.py
./gradlew ktlintFormat
./gradlew ktlintCheck detekt allTests :snapshots:verifyPaparazziDebug :androidApp:assembleDebug :app:linkDebugFrameworkIosSimulatorArm64
git status --short snapshots/src/test/snapshots | head
```

Expected: BUILD SUCCESSFUL, **sem regravar** snapshot nenhum, e a última linha vazia (nenhuma imagem mudou).

```bash
git add -A
git commit -m "refactor: design system vira PiuDS (core:piu-ds, com.velosobr.piuds, prefixo Piu)

Renomeação mecânica, sem mudança visual: os snapshots passam sem regravar.
Frente C, PR C1a."
git push -u origin refactor/piu-ds
gh pr create --base main --title "PiuDS: renomeação do design system (sem mudança visual)" \
  --body "Frente C, PR 2 (C1a). git mv de core:design-system para core:piu-ds, pacote com.velosobr.piuds e prefixo Piu nos composables públicos e no tema. O verifyPaparazziDebug passa sem regravar nenhum snapshot: é a prova de que nada mudou na tela. Spec: docs #21, seção 5.1."
```

---

### Task 3: App — `Journey`, `Biome` e as funções puras do tema

**Files:**
- Create: `core/domain/src/commonMain/kotlin/com/velosobr/passarim/core/domain/Journey.kt`, `core/domain/src/commonMain/kotlin/com/velosobr/passarim/core/domain/Biome.kt`, `core/domain/src/commonTest/kotlin/com/velosobr/passarim/core/domain/BiomeTest.kt`, `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/theme/SchemeChoice.kt`, `core/piu-ds/src/commonTest/kotlin/com/velosobr/piuds/SchemeChoiceTest.kt`
- Move: `app/src/commonMain/kotlin/com/velosobr/passarim/app/theme/ThemeMode.kt` → `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/theme/ThemeMode.kt`; `app/src/commonTest/.../ThemeModeTest.kt` → `core/piu-ds/src/commonTest/kotlin/com/velosobr/piuds/theme/ThemeModeTest.kt`
- Modify: `app/src/commonMain/kotlin/com/velosobr/passarim/app/App.kt` (import)

**Interfaces:**
- Produces: `enum class Journey { ADULT, KIDS }`; `enum class Biome(val code: String) { AMAZONIA("amazonia"), MATA_ATLANTICA("mata_atlantica"), CERRADO("cerrado"), CAATINGA("caatinga"), PANTANAL("pantanal"), PAMPA("pampa") }` e `fun biomeOf(code: String?): Biome?`; `fun ThemeMode.isDark(systemInDark: Boolean): Boolean` em `com.velosobr.piuds.theme`; `data class PiuSchemeChoice(val journey: Journey, val dark: Boolean, val dynamic: Boolean)`; `fun resolvePiuScheme(journey: Journey, themeMode: ThemeMode, systemDark: Boolean, dynamicColor: Boolean): PiuSchemeChoice`; `fun resolveReduceMotion(override: Boolean?, system: () -> Boolean): Boolean`.

- [ ] **Step 1: Branch**

```bash
git switch -c feat/piu-theme   # a partir de refactor/piu-ds
```

- [ ] **Step 2: Testes que falham**

`core/domain/src/commonTest/kotlin/com/velosobr/passarim/core/domain/BiomeTest.kt`:

```kotlin
// Testes do bioma: o código do BFF vira o enum, e código desconhecido vira null.

package com.velosobr.passarim.core.domain

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import kotlin.test.Test

class BiomeTest {
    @Test
    fun `cada codigo do BFF vira o seu bioma`() {
        Biome.entries.forEach { assertThat(biomeOf(it.code)).isEqualTo(it) }
        assertThat(biomeOf("mata_atlantica")).isEqualTo(Biome.MATA_ATLANTICA)
    }

    @Test
    fun `codigo desconhecido ou nulo vira null`() {
        assertThat(biomeOf("lua")).isNull()
        assertThat(biomeOf(null)).isNull()
    }
}
```

(Se o `core:domain` ainda não tiver `assertk` em `commonTest`, acrescente `implementation(libs.assertk)` ao `commonTest.dependencies` do `core/domain/build.gradle.kts`.)

`core/piu-ds/src/commonTest/kotlin/com/velosobr/piuds/SchemeChoiceTest.kt`:

```kotlin
// Testes da escolha do esquema de cores e de "reduzir animações": funções
// puras, sem Compose, então rodam em commonTest.

package com.velosobr.piuds

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.passarim.core.domain.ThemeMode
import com.velosobr.piuds.theme.PiuSchemeChoice
import com.velosobr.piuds.theme.resolvePiuScheme
import com.velosobr.piuds.theme.resolveReduceMotion
import kotlin.test.Test

class SchemeChoiceTest {
    @Test
    fun `o Kids e sempre claro e sem cores dinamicas`() {
        ThemeMode.entries.forEach { mode ->
            listOf(true, false).forEach { systemDark ->
                assertThat(resolvePiuScheme(Journey.KIDS, mode, systemDark, dynamicColor = true))
                    .isEqualTo(PiuSchemeChoice(Journey.KIDS, dark = false, dynamic = false))
            }
        }
    }

    @Test
    fun `o adulto segue o tema escolhido e as cores dinamicas`() {
        assertThat(resolvePiuScheme(Journey.ADULT, ThemeMode.DARK, systemDark = false, dynamicColor = true))
            .isEqualTo(PiuSchemeChoice(Journey.ADULT, dark = true, dynamic = true))
        assertThat(resolvePiuScheme(Journey.ADULT, ThemeMode.SYSTEM, systemDark = true, dynamicColor = false))
            .isEqualTo(PiuSchemeChoice(Journey.ADULT, dark = true, dynamic = false))
        assertThat(resolvePiuScheme(Journey.ADULT, ThemeMode.LIGHT, systemDark = true, dynamicColor = false).dark).isFalse()
    }

    @Test
    fun `o valor sobrescrito ganha do sistema e o sistema so e lido sem ele`() {
        var reads = 0
        val system = {
            reads++
            true
        }
        assertThat(resolveReduceMotion(override = false, system = system)).isFalse()
        assertThat(reads).isEqualTo(0)
        assertThat(resolveReduceMotion(override = null, system = system)).isTrue()
        assertThat(reads).isEqualTo(1)
    }
}
```

Mova o teste do tema:

```bash
mkdir -p core/piu-ds/src/commonTest/kotlin/com/velosobr/piuds/theme
git mv app/src/commonTest/kotlin/com/velosobr/passarim/app/theme/ThemeModeTest.kt core/piu-ds/src/commonTest/kotlin/com/velosobr/piuds/theme/ThemeModeTest.kt
# O teste está no mesmo pacote da função (por isso não a importa): basta trocar o pacote.
sed -i '' 's/^package com.velosobr.passarim.app.theme$/package com.velosobr.piuds.theme/' core/piu-ds/src/commonTest/kotlin/com/velosobr/piuds/theme/ThemeModeTest.kt
```

Run: `./gradlew :core:domain:allTests :core:piu-ds:allTests`
Expected: FAIL na compilação (`Unresolved reference: Journey`, `biomeOf`, `resolvePiuScheme`, `isDark`).

- [ ] **Step 3: Implementar**

`core/domain/src/commonMain/kotlin/com/velosobr/passarim/core/domain/Journey.kt`:

```kotlin
// A jornada do app: Passarim (adulto) ou Passarim Kids. O tema escolhe a
// variante do PiuDS por ela. Gravar e trocar a jornada é da frente D; aqui
// é só o tipo.

package com.velosobr.passarim.core.domain

/** ADULT é o Passarim de sempre; KIDS é a jornada das crianças de 8 a 12 anos. */
enum class Journey { ADULT, KIDS }
```

`core/domain/src/commonMain/kotlin/com/velosobr/passarim/core/domain/Biome.kt`:

```kotlin
// Os seis biomas brasileiros, com o código que o BFF usa. No adulto, cada
// bioma tem um gradiente; no Kids, o bioma é o "mundo" da ave.

package com.velosobr.passarim.core.domain

/** Os biomas, na ordem oficial. [code] é o texto do BFF ("mata_atlantica"). */
enum class Biome(
    val code: String,
) {
    AMAZONIA("amazonia"),
    MATA_ATLANTICA("mata_atlantica"),
    CERRADO("cerrado"),
    CAATINGA("caatinga"),
    PANTANAL("pantanal"),
    PAMPA("pampa"),
}

/** Converte o código do BFF; nulo ou desconhecido vira null. */
fun biomeOf(code: String?): Biome? = Biome.entries.firstOrNull { it.code == code }
```

Mova a função do tema:

```bash
git mv app/src/commonMain/kotlin/com/velosobr/passarim/app/theme/ThemeMode.kt core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/theme/ThemeMode.kt
sed -i '' 's/^package com.velosobr.passarim.app.theme/package com.velosobr.piuds.theme/' core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/theme/ThemeMode.kt
sed -i '' 's/import com.velosobr.passarim.app.theme.isDark/import com.velosobr.piuds.theme.isDark/' app/src/commonMain/kotlin/com/velosobr/passarim/app/App.kt
```

E troque o comentário do topo do `ThemeMode.kt` movido por:

```kotlin
// Decisão de usar ou não o tema escuro, a partir do que a pessoa escolheu
// nas Configurações. Mora no PiuDS porque o PiuTheme recebe o ThemeMode.
```

`core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/theme/SchemeChoice.kt`:

```kotlin
// Funções puras que o PiuTheme usa para decidir o esquema de cores e se as
// animações ficam ligadas. Ficam fora do @Composable para serem testadas
// sem Compose, em commonTest.

package com.velosobr.piuds.theme

import com.velosobr.passarim.core.domain.Journey
import com.velosobr.passarim.core.domain.ThemeMode

/**
 * O esquema que o tema vai aplicar: a variante (pela jornada), se é escuro
 * e se usa as cores dinâmicas do sistema (o papel de parede, no Android 12+).
 */
data class PiuSchemeChoice(
    val journey: Journey,
    val dark: Boolean,
    val dynamic: Boolean,
)

/**
 * O Kids é sempre claro e sem cores dinâmicas, qualquer que seja a
 * preferência do adulto (que não é alterada: o Kids só a ignora). O adulto
 * segue o [themeMode] e o pedido de [dynamicColor].
 */
fun resolvePiuScheme(
    journey: Journey,
    themeMode: ThemeMode,
    systemDark: Boolean,
    dynamicColor: Boolean,
): PiuSchemeChoice =
    when (journey) {
        Journey.KIDS -> PiuSchemeChoice(journey, dark = false, dynamic = false)
        Journey.ADULT -> PiuSchemeChoice(journey, dark = themeMode.isDark(systemDark), dynamic = dynamicColor)
    }

/**
 * Um valor fixado de fora (testes e snapshots) ganha; sem ele, lê a
 * preferência do sistema. [system] é uma função para só ser chamada quando
 * precisa (ler o sistema tem custo).
 */
fun resolveReduceMotion(
    override: Boolean?,
    system: () -> Boolean,
): Boolean = override ?: system()
```

Run: `./gradlew :core:domain:allTests :core:piu-ds:allTests :app:allTests`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: Journey e Biome no domínio e a escolha pura do esquema do PiuTheme"
```

---

### Task 4: App — tokens no Kotlin: Kids, títulos em 800, gradientes e fontes

**Files:**
- Create: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/theme/KidsColors.kt`, `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/theme/KidsType.kt`, `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/theme/PiuTokens.kt`, `core/piu-ds/src/commonMain/composeResources/font/fredoka.ttf`, `core/piu-ds/src/commonMain/composeResources/font/nunito.ttf`, `LICENSES/Fredoka-OFL.txt`, `LICENSES/Nunito-OFL.txt`
- Modify: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/theme/Type.kt`, `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/theme/Shape.kt`, `core/piu-ds/src/commonTest/kotlin/com/velosobr/piuds/TokensTest.kt`

**Interfaces:**
- Consumes: Task 3 (`Biome`).
- Produces: `PiuKidsColors: ColorScheme`; `@Composable fun piuKidsTypography(): Typography`; `PiuKidsShapes: Shapes`; `PiuKidsDimens.touchTarget = 56.dp`; `data class PiuGradient(val from: Color, val to: Color, val content: Color, val angleDegrees: Float)`; `data class PiuSolidShadow(val color: Color, val offset: Dp)`; `data class PiuTokens(val gradients: Map<Biome, PiuGradient>, val scrim: Color, val scrimStart: Float, val cardShadow: PiuSolidShadow?, val buttonShadow: PiuSolidShadow?, val conservation: ConservationPalette)`; `piuAdultTokens(dark: Boolean)` e `PiuKidsTokens`; `val LocalPiuTokens`.

- [ ] **Step 1: Fontes e licenças**

```bash
cd ~/dev/passarim/passarim-app
F=core/piu-ds/src/commonMain/composeResources/font
curl -fsSL -o $F/fredoka.ttf 'https://github.com/google/fonts/raw/main/ofl/fredoka/Fredoka%5Bwdth,wght%5D.ttf'
curl -fsSL -o $F/nunito.ttf 'https://github.com/google/fonts/raw/main/ofl/nunito/Nunito%5Bwght%5D.ttf'
curl -fsSL -o LICENSES/Fredoka-OFL.txt https://github.com/google/fonts/raw/main/ofl/fredoka/OFL.txt
curl -fsSL -o LICENSES/Nunito-OFL.txt https://github.com/google/fonts/raw/main/ofl/nunito/OFL.txt
file $F/fredoka.ttf $F/nunito.ttf
head -3 LICENSES/Fredoka-OFL.txt LICENSES/Nunito-OFL.txt
```

Expected: os dois arquivos como `TrueType Font data`; as licenças começando com "Copyright" e citando a SIL Open Font License.

- [ ] **Step 2: Testes de tokens que falham**

Em `TokensTest.kt` (agora em `core/piu-ds/src/commonTest/kotlin/com/velosobr/piuds/`), acrescente os imports `androidx.compose.ui.text.font.FontWeight`, `com.velosobr.passarim.core.domain.Biome`, `com.velosobr.piuds.theme.piuAdultTokens`, `com.velosobr.piuds.theme.PiuKidsColors`, `com.velosobr.piuds.theme.PiuKidsTokens`, `com.velosobr.piuds.theme.TitleWeight`, `com.velosobr.piuds.theme.piuTypeSpecs` e `com.velosobr.piuds.theme.kidsTypeSpecs`, e os testes:

```kotlin
    @Test
    fun `o esquema Kids bate com os tokens`() {
        assertThat(PiuKidsColors.primary).isEqualTo(Color(0xFFA84300))
        assertThat(PiuKidsColors.primaryContainer).isEqualTo(Color(0xFFFF8A3D))
        assertThat(PiuKidsColors.onPrimaryContainer).isEqualTo(Color(0xFF1D2B3A))
        assertThat(PiuKidsColors.surface).isEqualTo(Color(0xFFFFF7E8))
        assertThat(PiuKidsColors.background).isEqualTo(PiuKidsColors.surface)
        assertThat(PiuKidsColors.inversePrimary).isEqualTo(Color(0xFFFFC93C))
    }

    @Test
    fun `os textos do Kids passam no contraste sobre o creme e sobre o laranja`() {
        assertThat(contrast(PiuKidsColors.surface, PiuKidsColors.onSurface)).isGreaterThanOrEqualTo(4.5f)
        assertThat(contrast(PiuKidsColors.primaryContainer, PiuKidsColors.onPrimaryContainer)).isGreaterThanOrEqualTo(4.5f)
        assertThat(contrast(PiuKidsColors.primary, PiuKidsColors.onPrimary)).isGreaterThanOrEqualTo(4.5f)
    }

    @Test
    fun `os gradientes batem com os tokens e o texto passa nas duas pontas`() {
        val adult = piuAdultTokens(dark = false).gradients
        assertThat(adult.getValue(Biome.CERRADO).to).isEqualTo(Color(0xFF9A6E1E))
        assertThat(PiuKidsTokens.gradients.getValue(Biome.PANTANAL).to).isEqualTo(Color(0xFF438DDC))
        (adult.values + PiuKidsTokens.gradients.values).forEach {
            assertThat(contrast(it.from, it.content)).isGreaterThanOrEqualTo(4.5f)
            assertThat(contrast(it.to, it.content)).isGreaterThanOrEqualTo(4.5f)
        }
        assertThat(adult.keys).isEqualTo(Biome.entries.toSet())
        assertThat(PiuKidsTokens.gradients.keys).isEqualTo(Biome.entries.toSet())
    }

    @Test
    fun `a tipografia do Piu segue os tokens 2_0_0 - titulos em 800`() {
        assertThat(TitleWeight).isEqualTo(FontWeight(800))
        assertThat(piuTypeSpecs.size).isEqualTo(15)
        listOf("displayLarge", "displayMedium", "displaySmall", "headlineLarge", "headlineMedium", "headlineSmall", "titleLarge")
            .forEach { assertThat(piuTypeSpecs.getValue(it).weight).isEqualTo(800) }
        listOf("titleMedium", "titleSmall", "labelLarge", "labelMedium", "labelSmall")
            .forEach { assertThat(piuTypeSpecs.getValue(it).weight).isEqualTo(600) }
        listOf("bodyLarge", "bodyMedium", "bodySmall").forEach { assertThat(piuTypeSpecs.getValue(it).weight).isEqualTo(400) }
        assertThat(piuTypeSpecs.getValue("displayLarge").tracking).isEqualTo(-0.25f)
    }

    @Test
    fun `o Kids segue a tabela dos tokens`() {
        val body = kidsTypeSpecs.getValue("bodyLarge")
        assertThat(body.size).isEqualTo(18)
        assertThat(body.weight).isEqualTo(600)
        assertThat(kidsTypeSpecs.getValue("headlineLarge").fredoka).isEqualTo(true)
        assertThat(kidsTypeSpecs.getValue("labelLarge").weight).isEqualTo(800)
        assertThat(kidsTypeSpecs.size).isEqualTo(15)
    }

    @Test
    fun `so o Kids tem sombras solidas`() {
        assertThat(piuAdultTokens(dark = true).cardShadow).isEqualTo(null)
        assertThat(PiuKidsTokens.buttonShadow?.color).isEqualTo(Color(0xFFC9601E))
    }
```

Run: `./gradlew :core:piu-ds:allTests`
Expected: FAIL na compilação (`Unresolved reference: PiuKidsColors`).

- [ ] **Step 3: Esquema, tipografia e formas do Kids**

`core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/theme/KidsColors.kt`:

```kotlin
// Esquema de cores do Piu Kids: uma variante só clara, com fundo creme e
// texto azul-noite. Gerado a partir do bloco "kids" de
// docs/design/tokens/passarim-tokens.json (passarim-docs, versão 2.0.0).
// Para mudar uma cor, edite o JSON, rode a verificação de contraste lá e
// atualize este arquivo (veja tokens/TOKENS.md, seção "Passarim Kids").

package com.velosobr.piuds.theme

import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

/**
 * Os mesmos papéis do Material 3, com as cores do Kids. O laranja vivo das
 * pranchetas é o primaryContainer (fundo de botão, com texto azul-noite); o
 * primary é um laranja escuro, que passa no contraste quando vira texto.
 */
val PiuKidsColors =
    lightColorScheme(
        primary = Color(0xFFA84300),
        onPrimary = Color(0xFFFFFFFF),
        primaryContainer = Color(0xFFFF8A3D),
        onPrimaryContainer = Color(0xFF1D2B3A),
        secondary = Color(0xFF1E5FA6),
        onSecondary = Color(0xFFFFFFFF),
        secondaryContainer = Color(0xFFCDEBFF),
        onSecondaryContainer = Color(0xFF0A2440),
        tertiary = Color(0xFFB8164F),
        onTertiary = Color(0xFFFFFFFF),
        tertiaryContainer = Color(0xFFFFD6E0),
        onTertiaryContainer = Color(0xFF4A0A22),
        error = Color(0xFFB3261E),
        onError = Color(0xFFFFFFFF),
        errorContainer = Color(0xFFFFDAD6),
        onErrorContainer = Color(0xFF410002),
        background = Color(0xFFFFF7E8),
        onBackground = Color(0xFF1D2B3A),
        surface = Color(0xFFFFF7E8),
        onSurface = Color(0xFF1D2B3A),
        surfaceVariant = Color(0xFFF2E3C6),
        onSurfaceVariant = Color(0xFF4A5566),
        surfaceDim = Color(0xFFEADBBF),
        surfaceBright = Color(0xFFFFF7E8),
        surfaceContainerLowest = Color(0xFFFFFFFF),
        surfaceContainerLow = Color(0xFFFFF2DC),
        surfaceContainer = Color(0xFFFCEDD3),
        surfaceContainerHigh = Color(0xFFF8E7C9),
        surfaceContainerHighest = Color(0xFFF2E3C6),
        outline = Color(0xFF6E7680),
        outlineVariant = Color(0xFFE2D2B2),
        inverseSurface = Color(0xFF1D2B3A),
        inverseOnSurface = Color(0xFFFFF7E8),
        inversePrimary = Color(0xFFFFC93C),
        scrim = Color(0xFF000000),
    )
```

`core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/theme/KidsType.kt`:

```kotlin
// Tipografia do Piu Kids: Fredoka (títulos, arredondada) e Nunito (texto),
// as duas com licença OFL e embutidas como fontes variáveis. Os 15 estilos
// do Material vêm da tabela do bloco "kids.type" dos tokens.

package com.velosobr.piuds.theme

import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.velosobr.piuds.resources.Res
import com.velosobr.piuds.resources.fredoka
import com.velosobr.piuds.resources.nunito
import org.jetbrains.compose.resources.Font
import org.jetbrains.compose.resources.FontResource

/** Um estilo da tabela dos tokens: família (Fredoka ou Nunito), tamanho e linha em sp, e peso. */
data class KidsTypeSpec(
    val fredoka: Boolean,
    val size: Int,
    val line: Int,
    val weight: Int,
)

/** A tabela "kids.type.styles" de passarim-tokens.json 2.0.0, estilo por estilo. */
val kidsTypeSpecs: Map<String, KidsTypeSpec> =
    mapOf(
        "displayLarge" to KidsTypeSpec(fredoka = true, size = 57, line = 64, weight = 700),
        "displayMedium" to KidsTypeSpec(fredoka = true, size = 45, line = 52, weight = 700),
        "displaySmall" to KidsTypeSpec(fredoka = true, size = 38, line = 44, weight = 700),
        "headlineLarge" to KidsTypeSpec(fredoka = true, size = 34, line = 40, weight = 700),
        "headlineMedium" to KidsTypeSpec(fredoka = true, size = 28, line = 34, weight = 700),
        "headlineSmall" to KidsTypeSpec(fredoka = true, size = 26, line = 32, weight = 700),
        "titleLarge" to KidsTypeSpec(fredoka = true, size = 22, line = 28, weight = 700),
        "titleMedium" to KidsTypeSpec(fredoka = true, size = 18, line = 24, weight = 700),
        "titleSmall" to KidsTypeSpec(fredoka = true, size = 16, line = 22, weight = 600),
        "bodyLarge" to KidsTypeSpec(fredoka = false, size = 18, line = 26, weight = 600),
        "bodyMedium" to KidsTypeSpec(fredoka = false, size = 16, line = 24, weight = 600),
        "bodySmall" to KidsTypeSpec(fredoka = false, size = 14, line = 20, weight = 600),
        "labelLarge" to KidsTypeSpec(fredoka = false, size = 16, line = 22, weight = 800),
        "labelMedium" to KidsTypeSpec(fredoka = false, size = 14, line = 20, weight = 800),
        "labelSmall" to KidsTypeSpec(fredoka = false, size = 12, line = 16, weight = 700),
    )

/**
 * Uma família a partir de um arquivo variável: um só .ttf, com um Font por
 * peso usado. "FontVariation.weight" escolhe o ponto do eixo de peso da
 * fonte variável (um arquivo que contém todos os pesos).
 */
@Composable
private fun variableFamily(
    resource: FontResource,
    weights: List<Int>,
): FontFamily =
    FontFamily(
        weights.map { weight ->
            Font(resource = resource, weight = FontWeight(weight), variationSettings = FontVariation.Settings(FontVariation.weight(weight)))
        },
    )

/** Os 15 estilos do Material 3 com as fontes e os tamanhos do Kids. */
@Composable
fun piuKidsTypography(): Typography {
    val fredoka = variableFamily(Res.font.fredoka, listOf(600, 700))
    val nunito = variableFamily(Res.font.nunito, listOf(600, 700, 800))
    fun style(name: String): TextStyle {
        val s = kidsTypeSpecs.getValue(name)
        return TextStyle(
            fontFamily = if (s.fredoka) fredoka else nunito,
            fontWeight = FontWeight(s.weight),
            fontSize = s.size.sp,
            lineHeight = s.line.sp,
        )
    }
    return Typography(
        displayLarge = style("displayLarge"),
        displayMedium = style("displayMedium"),
        displaySmall = style("displaySmall"),
        headlineLarge = style("headlineLarge"),
        headlineMedium = style("headlineMedium"),
        headlineSmall = style("headlineSmall"),
        titleLarge = style("titleLarge"),
        titleMedium = style("titleMedium"),
        titleSmall = style("titleSmall"),
        bodyLarge = style("bodyLarge"),
        bodyMedium = style("bodyMedium"),
        bodySmall = style("bodySmall"),
        labelLarge = style("labelLarge"),
        labelMedium = style("labelMedium"),
        labelSmall = style("labelSmall"),
    )
}
```

Em `Shape.kt`, acrescente no fim:

```kotlin
/**
 * Formas do Piu Kids (bloco "kids.shape" dos tokens): mais redondas que as do
 * adulto. extraLarge (38dp) é o raio da barra de navegação Kids.
 */
val PiuKidsShapes =
    Shapes(
        small = RoundedCornerShape(16.dp),
        medium = RoundedCornerShape(24.dp),
        large = RoundedCornerShape(28.dp),
        extraLarge = RoundedCornerShape(38.dp),
    )

/** Espaçamentos do Kids: o alvo de toque é maior (56dp) porque o dedo da criança é menos preciso. */
object PiuKidsDimens {
    val touchTarget = 56.dp
}
```

- [ ] **Step 4: Títulos em 800**

Em `Type.kt`:

- troque o KDoc de `manropeFontFamily` por `/** Manrope variável: um só arquivo, com os pesos usados pelo app (400, 600, 700 e 800, o dos títulos). */` e a lista `listOf(400, 600, 700)` por `listOf(400, 600, 700, 800)`;
- depois de `manropeFontFamily`, acrescente:

```kotlin
/** O peso dos títulos do Piu (tokens 2.0.0, "type.titleWeight"): 800, o "extra-negrito" da Manrope. */
val TitleWeight = FontWeight(800)
```

- troque a função `piuTypography()` inteira (e o `@Suppress("LongMethod")` dela) por uma tabela e uma função curta, no mesmo padrão do Kids, para o teste conferir o que o tema realmente usa:

```kotlin
/** Um estilo da tabela "type.styles" dos tokens: tamanho e linha em sp, peso e espaçamento entre letras (sp). */
data class PiuTypeSpec(
    val size: Int,
    val line: Int,
    val weight: Int,
    val tracking: Float,
)

/** A tabela "type.styles" de passarim-tokens.json 2.0.0: display, headline e titleLarge em 800. */
val piuTypeSpecs: Map<String, PiuTypeSpec> =
    mapOf(
        "displayLarge" to PiuTypeSpec(57, 64, 800, -0.25f),
        "displayMedium" to PiuTypeSpec(45, 52, 800, 0f),
        "displaySmall" to PiuTypeSpec(36, 44, 800, 0f),
        "headlineLarge" to PiuTypeSpec(32, 40, 800, 0f),
        "headlineMedium" to PiuTypeSpec(28, 36, 800, 0f),
        "headlineSmall" to PiuTypeSpec(24, 32, 800, 0f),
        "titleLarge" to PiuTypeSpec(22, 28, 800, 0f),
        "titleMedium" to PiuTypeSpec(16, 24, 600, 0.15f),
        "titleSmall" to PiuTypeSpec(14, 20, 600, 0.1f),
        "bodyLarge" to PiuTypeSpec(16, 24, 400, 0.5f),
        "bodyMedium" to PiuTypeSpec(14, 20, 400, 0.25f),
        "bodySmall" to PiuTypeSpec(12, 16, 400, 0.4f),
        "labelLarge" to PiuTypeSpec(14, 20, 600, 0.1f),
        "labelMedium" to PiuTypeSpec(12, 16, 600, 0.5f),
        "labelSmall" to PiuTypeSpec(11, 16, 600, 0.5f),
    )

/** Os 15 estilos do Material 3, todos em Manrope, montados a partir de [piuTypeSpecs]. */
@Composable
fun piuTypography(): Typography {
    val family = manropeFontFamily()
    fun style(name: String): TextStyle {
        val s = piuTypeSpecs.getValue(name)
        return TextStyle(fontFamily = family, fontWeight = FontWeight(s.weight), fontSize = s.size.sp, lineHeight = s.line.sp, letterSpacing = s.tracking.sp)
    }
    return Typography(
        displayLarge = style("displayLarge"),
        displayMedium = style("displayMedium"),
        displaySmall = style("displaySmall"),
        headlineLarge = style("headlineLarge"),
        headlineMedium = style("headlineMedium"),
        headlineSmall = style("headlineSmall"),
        titleLarge = style("titleLarge"),
        titleMedium = style("titleMedium"),
        titleSmall = style("titleSmall"),
        bodyLarge = style("bodyLarge"),
        bodyMedium = style("bodyMedium"),
        bodySmall = style("bodySmall"),
        labelLarge = style("labelLarge"),
        labelMedium = style("labelMedium"),
        labelSmall = style("labelSmall"),
    )
}
```

  O único valor que muda em relação a hoje é o peso dos sete estilos de título (700 → 800); tamanhos, linhas e espaçamentos são os de agora.

- [ ] **Step 5: `PiuTokens`**

`core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/theme/PiuTokens.kt`:

```kotlin
// Os tokens que o Material 3 não tem: gradientes de bioma (Piu) e de mundo
// (Kids), o scrim das fotos, as sombras sólidas do Kids e as cores de
// conservação. Chegam aos componentes por PiuTheme.tokens. Valores de
// docs/design/tokens/passarim-tokens.json (passarim-docs, versão 2.0.0).
// "@Immutable" promete ao Compose que o objeto nunca muda depois de criado:
// assim, um componente que recebe os tokens não é redesenhado à toa.

package com.velosobr.piuds.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Biome

/** Um degradê de [from] a [to], no ângulo dado, com a cor do texto que vai por cima. */
@Immutable
data class PiuGradient(
    val from: Color,
    val to: Color,
    val content: Color,
    val angleDegrees: Float,
)

/** Sombra "sólida" do Kids: uma faixa de cor deslocada para baixo, sem desfoque. */
@Immutable
data class PiuSolidShadow(
    val color: Color,
    val offset: Dp,
)

/**
 * Os tokens extras de uma variante. [gradients] é por bioma (no Kids, o
 * mundo); [scrim] é a cor escura que cobre a parte de baixo das fotos a
 * partir de [scrimStart] (fração da altura); as sombras só existem no Kids.
 */
@Immutable
data class PiuTokens(
    val gradients: Map<Biome, PiuGradient>,
    val scrim: Color,
    val scrimStart: Float,
    val cardShadow: PiuSolidShadow?,
    val buttonShadow: PiuSolidShadow?,
    val conservation: ConservationPalette,
)

/** O scrim dos tokens: #101410 com 80% de opacidade, a partir de 25% da altura da foto. */
private val Scrim = Color(0xFF101410).copy(alpha = 0.8f)
private const val SCRIM_START = 0.25f

private fun adultGradient(
    from: Long,
    to: Long,
) = PiuGradient(Color(from), Color(to), Color.White, angleDegrees = 135f)

private fun kidsGradient(
    from: Long,
    to: Long,
    text: Long,
) = PiuGradient(Color(from), Color(to), Color(text), angleDegrees = 150f)

/** Os gradientes de bioma do Piu ("gradient.biome"), com texto branco. */
private val AdultGradients =
    mapOf(
        Biome.AMAZONIA to adultGradient(0xFF063D27, 0xFF328556),
        Biome.MATA_ATLANTICA to adultGradient(0xFF0D4F45, 0xFF3C8361),
        Biome.CERRADO to adultGradient(0xFF6E3A0E, 0xFF9A6E1E),
        Biome.CAATINGA to adultGradient(0xFF5C2414, 0xFFB65D30),
        Biome.PANTANAL to adultGradient(0xFF0E3A57, 0xFF338095),
        Biome.PAMPA to adultGradient(0xFF3E4A12, 0xFF737B37),
    )

/** Os mundos do Kids ("kids.gradient.world"), com o texto escuro de cada um. */
private val KidsGradients =
    mapOf(
        Biome.AMAZONIA to kidsGradient(0xFF9BE15D, 0xFF1F9F56, 0xFF0B2A17),
        Biome.MATA_ATLANTICA to kidsGradient(0xFF6EE7C0, 0xFF13A38B, 0xFF0B2A17),
        Biome.CERRADO to kidsGradient(0xFFFFE066, 0xFFFF9F1C, 0xFF3A2200),
        Biome.CAATINGA to kidsGradient(0xFFFFB38A, 0xFFE65741, 0xFF3A1208),
        Biome.PANTANAL to kidsGradient(0xFF7DD3FC, 0xFF438DDC, 0xFF0A2440),
        Biome.PAMPA to kidsGradient(0xFFE4F57A, 0xFF7CB342, 0xFF1F2A0A),
    )

/** Os tokens do Piu: os gradientes são os mesmos nos dois temas; a conservação muda. */
fun piuAdultTokens(dark: Boolean): PiuTokens =
    PiuTokens(
        gradients = AdultGradients,
        scrim = Scrim,
        scrimStart = SCRIM_START,
        cardShadow = null,
        buttonShadow = null,
        conservation = if (dark) DarkConservationPalette else LightConservationPalette,
    )

/** Os tokens do Kids: mundos, sombras sólidas e a conservação do tema claro. */
val PiuKidsTokens =
    PiuTokens(
        gradients = KidsGradients,
        scrim = Scrim,
        scrimStart = SCRIM_START,
        cardShadow = PiuSolidShadow(Color(0xFFF2E3C6), 4.dp),
        buttonShadow = PiuSolidShadow(Color(0xFFC9601E), 5.dp),
        conservation = LightConservationPalette,
    )

/**
 * CompositionLocal: um valor que o tema "entrega" a toda a árvore de
 * composables de dentro, sem passar por parâmetro. "static" porque só muda
 * quando a jornada ou o tema mudam (aí a árvore toda é refeita mesmo).
 */
val LocalPiuTokens = staticCompositionLocalOf { piuAdultTokens(dark = false) }
```


- [ ] **Step 6: Rodar os testes e commitar**

Run: `./gradlew :core:piu-ds:allTests ktlintCheck detekt`
Expected: PASS.

```bash
git add -A
git commit -m "feat: tokens do Kids, títulos em 800, gradientes e fontes Fredoka e Nunito"
```

---

### Task 5: App — `PiuTheme` expressivo, reduzir animações e snapshots

**Files:**
- Create: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/theme/ReduceMotion.kt`, `core/piu-ds/src/androidMain/kotlin/com/velosobr/piuds/theme/ReduceMotion.android.kt`, `core/piu-ds/src/iosMain/kotlin/com/velosobr/piuds/theme/ReduceMotion.ios.kt`, `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/KidsSnapshotTest.kt`, `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/KidsThemeShowcaseSnapshotTest.kt`
- Modify: `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/theme/PiuTheme.kt`, `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/theme/ConservationColors.kt`, `core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/components/PiuConservationBadge.kt`, `core/piu-ds/build.gradle.kts`, `app/src/commonMain/kotlin/com/velosobr/passarim/app/App.kt`, `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/ThemedSnapshotTest.kt`, `snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/ConservationBadgeSnapshotTest.kt`
- Regenerate: `snapshots/src/test/snapshots/images/*` (com o diff revisado)

**Interfaces:**
- Consumes: Tasks 3 e 4.
- Produces: `@Composable fun PiuTheme(journey: Journey = Journey.ADULT, themeMode: ThemeMode = ThemeMode.SYSTEM, dynamicColor: Boolean = false, content: @Composable () -> Unit)`; `object PiuTheme { val tokens: PiuTokens; val reduceMotion: Boolean; val isDark: Boolean }` (os três `@Composable get()`); `val LocalPiuReduceMotion = staticCompositionLocalOf<Boolean?> { null }`.

- [ ] **Step 1: Ler "reduzir animações" por plataforma**

Em `core/piu-ds/build.gradle.kts`, no `commonMain.dependencies`, acrescente:

```kotlin
            // Para reler a preferência "reduzir animações" quando a pessoa volta ao app.
            implementation(libs.lifecycle.runtime.compose)
```

`core/piu-ds/src/commonMain/kotlin/com/velosobr/piuds/theme/ReduceMotion.kt`:

```kotlin
// "Reduzir animações": a preferência de acessibilidade do sistema, lida em
// cada plataforma. "expect" declara aqui o que cada plataforma entrega com
// "actual" (Android em androidMain, iOS em iosMain).

package com.velosobr.piuds.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.lifecycle.compose.LifecycleResumeEffect

/**
 * Fixa "reduzir animações" de fora, sem ler o sistema: os testes e os
 * snapshots usam true ou false. null (o padrão) = ler a preferência do sistema.
 */
val LocalPiuReduceMotion = staticCompositionLocalOf<Boolean?> { null }

/** Devolve uma função que lê a preferência do sistema agora (cada plataforma sabe onde ela fica). */
@Composable
internal expect fun systemReduceMotionReader(): () -> Boolean

/**
 * "Reduzir animações" resolvido: o valor fixado de fora ([override]) ou a
 * preferência do sistema, relida a cada volta ao app (ON_RESUME). A pessoa
 * pode ligar "remover animações" nos ajustes e voltar, e o app precisa
 * perceber sem reiniciar. Com [override], o sistema nem é lido e o efeito de
 * ciclo de vida não é registrado (os snapshots não têm ciclo de vida real).
 */
@Composable
internal fun rememberReduceMotion(override: Boolean?): Boolean {
    val read = systemReduceMotionReader()
    var value by remember(read, override) { mutableStateOf(resolveReduceMotion(override, read)) }
    if (override == null) {
        LifecycleResumeEffect(read) {
            value = read()
            onPauseOrDispose { }
        }
    }
    return value
}
```

`core/piu-ds/src/androidMain/kotlin/com/velosobr/piuds/theme/ReduceMotion.android.kt`:

```kotlin
// "Reduzir animações" no Android: a opção "Remover animações" das
// configurações de acessibilidade grava 0 na escala de duração das animações.

package com.velosobr.piuds.theme

import android.provider.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

@Composable
internal actual fun systemReduceMotionReader(): () -> Boolean {
    val resolver = LocalContext.current.contentResolver
    return remember(resolver) { { Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f } }
}
```

`core/piu-ds/src/iosMain/kotlin/com/velosobr/piuds/theme/ReduceMotion.ios.kt`:

```kotlin
// "Reduzir animações" no iOS: o ajuste "Reduzir movimento" de Acessibilidade.

package com.velosobr.piuds.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import platform.UIKit.UIAccessibilityIsReduceMotionEnabled

@Composable
internal actual fun systemReduceMotionReader(): () -> Boolean = remember { { UIAccessibilityIsReduceMotionEnabled() } }
```

- [ ] **Step 2: O tema**

Troque o conteúdo de `PiuTheme.kt` por:

```kotlin
// O tema do PiuDS, que todas as telas usam por fora. Escolhe a variante pela
// jornada: Piu (adulto, tema expressivo do Material 3, claro, escuro e cores
// dinâmicas) ou Piu Kids (sempre claro). CompositionLocalProvider entrega os
// tokens extras e "reduzir animações" a todos os componentes de dentro.
// O Material 3 Expressive (MaterialExpressiveTheme e MotionScheme) ainda é
// API experimental na versão do app: o @OptIn diz ao compilador que sabemos
// disso, e ele fica só aqui dentro do PiuDS.

package com.velosobr.piuds.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.MaterialExpressiveTheme
import androidx.compose.material3.MotionScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.passarim.core.domain.ThemeMode

/** Se o que está na tela é escuro (no Kids, nunca). */
private val LocalPiuIsDark = staticCompositionLocalOf { false }

/** "Reduzir animações" já resolvido (o valor fixado de fora ou o do sistema). */
private val LocalPiuReduceMotionResolved = staticCompositionLocalOf { false }

/**
 * Aplica a variante da [journey]. No adulto: as cores dinâmicas (se pedidas
 * e disponíveis) ou as da marca, no claro ou escuro de [themeMode]. No Kids:
 * sempre o esquema claro do Kids, ignorando [themeMode] e [dynamicColor] sem
 * gravar nada (as preferências do adulto não mudam).
 */
@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun PiuTheme(
    journey: Journey = Journey.ADULT,
    themeMode: ThemeMode = ThemeMode.SYSTEM,
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit,
) {
    val choice = resolvePiuScheme(journey, themeMode, isSystemInDarkTheme(), dynamicColor)
    // Testes e snapshots fixam o valor; sem isso, vale a preferência do sistema.
    val reduceMotion = rememberReduceMotion(LocalPiuReduceMotion.current)
    val kids = choice.journey == Journey.KIDS
    val colors =
        when {
            kids -> PiuKidsColors
            choice.dynamic -> dynamicColorScheme(choice.dark) ?: brandColors(choice.dark)
            else -> brandColors(choice.dark)
        }
    val tokens = if (kids) PiuKidsTokens else piuAdultTokens(choice.dark)
    CompositionLocalProvider(
        LocalPiuTokens provides tokens,
        LocalPiuIsDark provides choice.dark,
        LocalPiuReduceMotionResolved provides reduceMotion,
    ) {
        MaterialExpressiveTheme(
            colorScheme = colors,
            motionScheme = MotionScheme.expressive(),
            shapes = if (kids) PiuKidsShapes else PiuShapes,
            typography = if (kids) piuKidsTypography() else piuTypography(),
            content = content,
        )
    }
}

private fun brandColors(dark: Boolean) = if (dark) PiuDarkColors else PiuLightColors

/**
 * O que o Material não tem, lido de dentro do tema: PiuTheme.tokens,
 * PiuTheme.reduceMotion e PiuTheme.isDark. Cores, tipografia e formas
 * continuam no MaterialTheme.
 */
object PiuTheme {
    val tokens: PiuTokens
        @Composable @ReadOnlyComposable
        get() = LocalPiuTokens.current

    val reduceMotion: Boolean
        @Composable @ReadOnlyComposable
        get() = LocalPiuReduceMotionResolved.current

    val isDark: Boolean
        @Composable @ReadOnlyComposable
        get() = LocalPiuIsDark.current
}
```

Em `ConservationColors.kt`, apague a linha `val LocalConservationPalette = ...` e o comentário dela. Em `PiuConservationBadge.kt`, troque `LocalConservationPalette.current[status]` por `PiuTheme.tokens.conservation[status]` e o import de `LocalConservationPalette` por `import com.velosobr.piuds.theme.PiuTheme`.

Run: `./gradlew :core:piu-ds:compileKotlinIosSimulatorArm64 :core:piu-ds:allTests`
Expected: PASS. Se `MaterialExpressiveTheme` ou `MotionScheme.expressive()` não existirem com essa assinatura no Material 3 1.9.0, o erro de compilação diz o que existe: ajuste o nome dos parâmetros e registre a diferença no PR.

- [ ] **Step 3: O app e os snapshots usam a assinatura nova**

Em `App.kt`, troque `PiuTheme(darkTheme = darkTheme, dynamicColor = loaded.dynamicColors) {` por `PiuTheme(themeMode = loaded.theme, dynamicColor = loaded.dynamicColors) {`. A linha `val darkTheme = loaded.theme.isDark(isSystemInDarkTheme())` fica: ela ainda alimenta o `SystemBarsAppearance` (a ligação com `PiuTheme.isDark` é da frente D).

Em `ThemedSnapshotTest.kt`, troque o bloco do `paparazzi.snapshot` por:

```kotlin
        paparazzi.snapshot("$name-${if (dark) "dark" else "light"}-${fontScalePercent / 100f}x") {
            // Fixa "reduzir animações" para o snapshot não depender do sistema.
            CompositionLocalProvider(LocalPiuReduceMotion provides false) {
                PiuTheme(themeMode = if (dark) ThemeMode.DARK else ThemeMode.LIGHT) {
                    Surface(color = MaterialTheme.colorScheme.background, content = content)
                }
            }
        }
```

com os imports `androidx.compose.runtime.CompositionLocalProvider`, `com.velosobr.passarim.core.domain.ThemeMode` e `com.velosobr.piuds.theme.LocalPiuReduceMotion`. Faça a mesma troca no `ConservationBadgeSnapshotTest.kt` (`PiuTheme(darkTheme = dark) {` vira o mesmo bloco com `CompositionLocalProvider` e `themeMode`).

- [ ] **Step 4: Base de snapshots do Kids e o mostruário**

`snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/KidsSnapshotTest.kt`:

```kotlin
// A base dos snapshots do Piu Kids: só tema claro (o Kids não tem escuro) e
// três escalas de fonte.

package com.velosobr.passarim.snapshots

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.velosobr.passarim.core.domain.Journey
import com.velosobr.piuds.theme.LocalPiuReduceMotion
import com.velosobr.piuds.theme.PiuTheme
import org.jetbrains.compose.resources.ExperimentalResourceApi
import org.jetbrains.compose.resources.setResourceReaderAndroidContext
import org.junit.Before
import org.junit.Rule
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

/** Cada teste roda com fonte 1.0×, 1.3× e 2.0× (três referências por chamada de [snap]). */
@OptIn(ExperimentalResourceApi::class)
@RunWith(Parameterized::class)
abstract class KidsSnapshotTest(
    private val fontScalePercent: Int,
) {
    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_5.copy(fontScale = fontScalePercent / 100f))

    @Before
    fun setUpResources() {
        // O Compose Multiplatform lê strings e fontes pelo contexto Android; no Paparazzi ninguém o inicializa.
        setResourceReaderAndroidContext(paparazzi.context)
    }

    /** Fotografa [content] no tema Kids, com o nome `<nome>-kids-<escala>x`. */
    fun snap(
        name: String,
        content: @Composable () -> Unit,
    ) {
        paparazzi.snapshot("$name-kids-${fontScalePercent / 100f}x") {
            CompositionLocalProvider(LocalPiuReduceMotion provides false) {
                PiuTheme(journey = Journey.KIDS) {
                    Surface(color = MaterialTheme.colorScheme.background, content = content)
                }
            }
        }
    }

    companion object {
        @JvmStatic
        // Percentuais inteiros: um Float no nome do teste viraria "1,3" ou "1.3" conforme o locale da máquina.
        @Parameterized.Parameters(name = "fontScale={0}%")
        fun params(): List<Array<Any>> = listOf(100, 130, 200).map { arrayOf<Any>(it) }
    }
}
```

`snapshots/src/test/kotlin/com/velosobr/passarim/snapshots/KidsThemeShowcaseSnapshotTest.kt`:

```kotlin
// Mostruário do tema Kids: as cores principais, os gradientes de mundo e os
// estilos de texto. Não é uma tela do app; é a prova visual do tema antes de
// existirem os componentes Kids (plano C2).

package com.velosobr.passarim.snapshots

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.dp
import com.velosobr.passarim.core.domain.Biome
import com.velosobr.piuds.theme.PiuTheme
import org.junit.Test

class KidsThemeShowcaseSnapshotTest(
    fontScalePercent: Int,
) : KidsSnapshotTest(fontScalePercent) {
    @Test
    fun showcase() =
        snap("kids-theme") {
            val colors = MaterialTheme.colorScheme
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Oi! Eu sou o Pipo.", style = MaterialTheme.typography.headlineLarge)
                Text("Qual ave vamos conhecer hoje?", style = MaterialTheme.typography.titleMedium)
                Text("O sabiá tem a barriga cor de laranja.", style = MaterialTheme.typography.bodyLarge)
                Text("Ouvir o canto!", style = MaterialTheme.typography.labelLarge)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(colors.primaryContainer, colors.secondary, colors.tertiary, colors.inverseSurface, colors.inversePrimary)
                        .forEach { Box(Modifier.size(40.dp).background(it, MaterialTheme.shapes.small)) }
                }
                Biome.entries.forEach { biome ->
                    val g = PiuTheme.tokens.gradients.getValue(biome)
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .background(Brush.linearGradient(listOf(g.from, g.to)), MaterialTheme.shapes.medium)
                            .padding(12.dp),
                    ) { Text(biome.name, color = g.content, style = MaterialTheme.typography.titleMedium) }
                }
            }
        }
}
```

- [ ] **Step 5: Gravar e revisar os snapshots**

```bash
./gradlew :snapshots:recordPaparazziDebug
git status --short snapshots/src/test/snapshots | wc -l
git status --short snapshots/src/test/snapshots | grep -v kids | head
```

Expected: as imagens do Piu mudam (títulos em 800 e o tema expressivo) e as 3 do mostruário Kids aparecem (`kids-theme-kids-1.0x` etc.).

- [ ] **Step 6: Leitura real de "reduzir animações", à mão**

```bash
cd ~/dev/passarim/passarim-docs && env.scripts/back-end-init && cd ../passarim-app && ../passarim-docs/env.scripts/front-end-init
adb shell settings put global animator_duration_scale 0   # "Remover animações"
# volte ao app (ON_RESUME); confira num log temporário ou no Layout Inspector que PiuTheme.reduceMotion = true
adb shell settings put global animator_duration_scale 1
```

Registre o resultado no PR (no iOS: Ajustes > Acessibilidade > Movimento > Reduzir movimento, no simulador; se o Xcode não estiver selecionado, registre que a conferência do iOS ficou pendente). Se o log temporário for usado, ele **não** entra no commit.

- [ ] **Step 7: Conferir os cortes a 2.0× e commitar**

Abra cada imagem `*-2.0x.png` que mudou (o diff do PR no GitHub mostra lado a lado) e procure título cortado ou com reticências. Para cada um, corrija o componente (por exemplo, trocar `maxLines = 1` por `maxLines = 2` num título de tela), regrave e anote no PR: "corte em <snapshot>: <o que mudou>". Sem corte, anote "nenhum corte a 2.0×".

```bash
./gradlew ktlintCheck detekt allTests :snapshots:verifyPaparazziDebug :androidApp:assembleDebug :app:linkDebugFrameworkIosSimulatorArm64
git add -A
git commit -m "feat: PiuTheme com as variantes Piu (expressivo) e Kids, e reduzir animações

Títulos em 800 e MaterialExpressiveTheme no adulto; Kids sempre claro com
Fredoka e Nunito. Snapshots regravados: a diferença é do tema expressivo e
do peso dos títulos."
```

---

### Task 6: App — fontes na tela de Licenças e PR 3

**Files:**
- Create: `config/aboutlibraries/libraries/font-manrope.json`, `config/aboutlibraries/libraries/font-fredoka.json`, `config/aboutlibraries/libraries/font-nunito.json`
- Modify: `androidApp/build.gradle.kts` (bloco `aboutLibraries`), `feature/settings/presentation/src/commonMain/composeResources/files/aboutlibraries.json` (gerado), `gradle.lockfile`s (gerados)

- [ ] **Step 1: Definições customizadas**

O AboutLibraries só lista dependências do Gradle; fontes embutidas entram como "bibliotecas" descritas em JSON numa pasta de configuração.

`config/aboutlibraries/libraries/font-manrope.json`:

```json
{
  "uniqueId": "font:manrope",
  "artifactVersion": "variável",
  "name": "Manrope",
  "description": "Fonte dos textos do Passarim (adulto), embutida no app.",
  "website": "https://fonts.google.com/specimen/Manrope",
  "developers": [{ "name": "Mikhail Sharanda" }],
  "licenses": ["OFL-1.1"]
}
```

`config/aboutlibraries/libraries/font-fredoka.json`:

```json
{
  "uniqueId": "font:fredoka",
  "artifactVersion": "variável",
  "name": "Fredoka",
  "description": "Fonte dos títulos do Passarim Kids, embutida no app.",
  "website": "https://fonts.google.com/specimen/Fredoka",
  "developers": [{ "name": "Milena Brandão" }, { "name": "Hafontia" }],
  "licenses": ["OFL-1.1"]
}
```

`config/aboutlibraries/libraries/font-nunito.json`:

```json
{
  "uniqueId": "font:nunito",
  "artifactVersion": "variável",
  "name": "Nunito",
  "description": "Fonte dos textos do Passarim Kids, embutida no app.",
  "website": "https://fonts.google.com/specimen/Nunito",
  "developers": [{ "name": "Vernon Adams" }, { "name": "Cyreal" }, { "name": "Jacques Le Bailly" }],
  "licenses": ["OFL-1.1"]
}
```

Em `androidApp/build.gradle.kts`, dentro de `aboutLibraries { ... }`, antes de `export {`, acrescente:

```kotlin
    // Fontes embutidas (Manrope, Fredoka e Nunito) não são dependências do
    // Gradle: entram por definições em JSON nesta pasta.
    collect {
        configPath = rootProject.file("config/aboutlibraries")
    }
```

`config/aboutlibraries/licenses/OFL-1.1.json` (o texto da licença, para a tela mostrar sem depender de um catálogo externo):

```json
{
  "hash": "OFL-1.1",
  "name": "SIL Open Font License 1.1",
  "url": "https://openfontlicense.org",
  "spdxId": "OFL-1.1",
  "content": "<cole aqui o texto de LICENSES/Nunito-OFL.txt a partir da linha \"This Font Software is licensed under the SIL Open Font License, Version 1.1.\", com as quebras de linha como \\n>"
}
```

Gere o `content` sem digitar à mão:

```bash
python3 - <<'PY'
import json, pathlib
text = pathlib.Path("LICENSES/Nunito-OFL.txt").read_text(encoding="utf-8")
start = text.index("This Font Software is licensed under the SIL Open Font License")
p = pathlib.Path("config/aboutlibraries/licenses/OFL-1.1.json")
p.parent.mkdir(parents=True, exist_ok=True)
p.write_text(json.dumps({"hash": "OFL-1.1", "name": "SIL Open Font License 1.1", "url": "https://openfontlicense.org",
                         "spdxId": "OFL-1.1", "content": text[start:]}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
```

- [ ] **Step 2: Regenerar e conferir**

```bash
./gradlew resolveAndLockShipped --write-locks :androidApp:exportLibraryDefinitions
grep -c '"font:' feature/settings/presentation/src/commonMain/composeResources/files/aboutlibraries.json
grep -n 'OFL-1.1' feature/settings/presentation/src/commonMain/composeResources/files/aboutlibraries.json | head -3
```

```bash
python3 -c "import json;d=json.load(open('feature/settings/presentation/src/commonMain/composeResources/files/aboutlibraries.json'));print(len(d['licenses']['OFL-1.1'].get('content','')))"
```

Expected: `3`, a licença OFL-1.1 presente e o último comando imprimindo um número maior que 1000 (o texto da licença). Se o export não incluir as fontes, a versão do plugin usa outro nome de propriedade para a pasta: confira com `./gradlew :androidApp:exportLibraryDefinitions --info | grep -i config` e ajuste o bloco `collect`, registrando no PR.

- [ ] **Step 3: Suíte, commit, push e PR 3**

```bash
./gradlew ktlintCheck detekt allTests :snapshots:verifyPaparazziDebug :androidApp:assembleDebug :app:linkDebugFrameworkIosSimulatorArm64
git add -A
git commit -m "feat: fontes Manrope, Fredoka e Nunito na tela de Licenças"
git push -u origin feat/piu-theme
gh pr create --base refactor/piu-ds --title "PiuDS: PiuTheme com as variantes Piu e Kids" \
  --body "Frente C, PR 3 (C1b). Depende do docs PR 1 (tokens 2.0.0). **Para o dono aprovar:** o diff dos snapshots (títulos em 800 e tema expressivo) e a lista de cortes a 2.0× abaixo. Conferência à mão de reduzir animações: <resultado>. Corrige no caminho a falta da Manrope na tela de Licenças. Spec: docs #21, seções 4 e 5."
```
