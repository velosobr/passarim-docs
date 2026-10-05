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
