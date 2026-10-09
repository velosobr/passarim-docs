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
