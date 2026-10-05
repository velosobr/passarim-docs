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
