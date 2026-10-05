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
  assert.equal(readBirdPaths()[0], 'M64.6 37.9 L75.7 43 L64.6 46.4');
});
