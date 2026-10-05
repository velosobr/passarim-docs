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
