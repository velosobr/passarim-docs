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
