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
