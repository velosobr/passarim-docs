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
  t.color.light.onPrimary = '#8FBF9F';
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

test('protege o toggle desligado (outline sobre surfaceVariant) e o ícone de erro (error sobre surfaceVariant)', () => {
  const t = fresh();
  t.color.dark.outline = '#8A938A'; // valor antigo, 2.93:1
  assert.ok(checkTokens(t).some((x) => x.kind === 'contrast' && x.theme === 'dark' && x.bg === 'surfaceVariant' && x.fg === 'outline'));
  const u = fresh();
  u.color.light.error = '#D8A8A4';
  assert.ok(checkTokens(u).some((x) => x.kind === 'contrast' && x.theme === 'light' && x.bg === 'surfaceVariant' && x.fg === 'error'));
});

test('cobre todos os papéis de cor e os 15 estilos de tipografia do Material 3 (nada cai no baseline do Compose)', () => {
  const t = loadTokens();
  const m3Roles = ['background', 'onBackground', 'surfaceDim', 'surfaceBright', 'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainerHigh', 'surfaceContainerHighest'];
  for (const theme of ['light', 'dark']) for (const r of m3Roles) assert.ok(r in t.color[theme], `${theme}.${r}`);
  const styles = ['displayLarge', 'displayMedium', 'displaySmall', 'headlineLarge', 'headlineMedium', 'headlineSmall', 'titleLarge', 'titleMedium', 'titleSmall', 'bodyLarge', 'bodyMedium', 'bodySmall', 'labelLarge', 'labelMedium', 'labelSmall'];
  assert.deepEqual(Object.keys(t.type.styles).sort(), [...styles].sort());
});

test('fundo único: background é igual a surface nos dois temas', () => {
  const t = loadTokens();
  for (const theme of ['light', 'dark']) assert.equal(t.color[theme].background, t.color[theme].surface);
});
