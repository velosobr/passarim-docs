// Valida a estrutura dos tokens e o contraste de todos os pares usados pelo app.
import { contrastRatio } from './contrast.mjs';
import { loadTokens, isMain } from './paths.mjs';

export const THEMES = ['light', 'dark'];
export const STATUSES = ['LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX', 'DD'];

export const REQUIRED_ROLES = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'background', 'onBackground',
  'surface', 'onSurface', 'surfaceVariant', 'onSurfaceVariant',
  'surfaceDim', 'surfaceBright',
  'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer', 'surfaceContainerHigh', 'surfaceContainerHighest',
  'outline', 'outlineVariant',
  'inverseSurface', 'inverseOnSurface', 'inversePrimary', 'scrim',
];

// [fundo, texto]: precisam de 4.5:1.
export const TEXT_PAIRS = [
  ['primary', 'onPrimary'], ['primaryContainer', 'onPrimaryContainer'],
  ['secondary', 'onSecondary'], ['secondaryContainer', 'onSecondaryContainer'],
  ['tertiary', 'onTertiary'], ['tertiaryContainer', 'onTertiaryContainer'],
  ['error', 'onError'], ['errorContainer', 'onErrorContainer'],
  ['background', 'onBackground'],
  ['surface', 'onSurface'], ['surface', 'onSurfaceVariant'],
  ['surfaceDim', 'onSurface'], ['surfaceBright', 'onSurface'],
  ['surfaceContainerLowest', 'onSurface'], ['surfaceContainerLowest', 'onSurfaceVariant'],
  ['surfaceContainerLow', 'onSurface'], ['surfaceContainerLow', 'onSurfaceVariant'],
  ['surfaceContainerHigh', 'onSurface'], ['surfaceContainerHigh', 'onSurfaceVariant'],
  ['surfaceContainerHighest', 'onSurface'], ['surfaceContainerHighest', 'onSurfaceVariant'],
  ['surfaceContainer', 'onSurface'], ['surfaceContainer', 'onSurfaceVariant'],
  ['surfaceVariant', 'onSurfaceVariant'], ['inverseSurface', 'inverseOnSurface'],
  ['surface', 'primary'], ['surfaceContainer', 'primary'], ['surface', 'error'], ['surfaceVariant', 'error'],
  ['inverseSurface', 'inversePrimary'],
];

// Elementos não textuais (contornos, bordas de controle): 3:1.
export const NONTEXT_PAIRS = [['surface', 'outline'], ['surfaceContainer', 'outline'], ['surfaceVariant', 'outline']];

const HEX = /^#[0-9A-Fa-f]{6}$/;

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
      : f.kind === 'gradient'
        ? `${f.name}.${f.end} × texto = ${f.ratio.toFixed(2)} (mínimo ${f.min})`
        : `${f.role}${f.value ? ` = ${f.value}` : ''}`;
    console.error(`FALHA [${f.kind}] ${f.theme ?? ''}: ${what}`);
  }
  if (failures.length) process.exit(1);
  console.log('tokens OK: estrutura e contraste dentro dos limites no Piu (claro e escuro), no Kids e nos gradientes');
}
