// Monta as páginas dos mockups: expande {{include:...}} nos fragmentos de src/ e gera uma página por tema.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MOCKUPS, isMain } from './paths.mjs';
import { ICONS } from './icons.mjs';
import { readBirdPaths } from './icon.mjs';

export const THEMES = ['light', 'dark'];

const INCLUDE = /\{\{include:([a-z-]+)((?:\s+[a-zA-Z]+=(?:"[^"]*"|[^\s}]+))*)\s*\}\}/g;
const ATTR = /([a-zA-Z]+)=(?:"([^"]*)"|([^\s}]+))/g;

const parseAttrs = (raw) => {
  const attrs = {};
  for (const m of raw.matchAll(ATTR)) attrs[m[1]] = m[2] ?? m[3];
  return attrs;
};

const FUNCTION_PARTIALS = {
  icon: ({ name, size = '24' }) => {
    const d = ICONS[name];
    if (!d) throw new Error(`ícone desconhecido: ${name}`);
    return `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
  },
  bird: ({ size = '24' }) => {
    const paths = readBirdPaths().map((d) => `<path d="${d}"/>`).join('');
    return `<svg class="bird" viewBox="24 24 60 60" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  },
};

export function expandIncludes(html, partialsDir = join(MOCKUPS, 'partials')) {
  let out = html;
  for (let depth = 0; depth < 6; depth++) {
    let hit = false;
    out = out.replace(INCLUDE, (_, name, rawAttrs) => {
      hit = true;
      const attrs = parseAttrs(rawAttrs);
      if (FUNCTION_PARTIALS[name]) return FUNCTION_PARTIALS[name](attrs);
      let text;
      try {
        text = readFileSync(join(partialsDir, `${name}.html`), 'utf8');
      } catch {
        throw new Error(`partial desconhecido: ${name}`);
      }
      return text.trim().replace(/\{\{([a-zA-Z]+)\}\}/g, (m, key) => (key in attrs ? attrs[key] : m));
    });
    if (!hit) break;
  }
  const left = out.match(/\{\{[^}]*\}\}/);
  if (left) throw new Error(`marcador sem valor: ${left[0]}`);
  return out;
}

export function renderPage({ name, theme, body }) {
  return `<!doctype html>
<html lang="pt-BR" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=390, initial-scale=1">
<title>Passarim — ${name} (${theme})</title>
<link rel="stylesheet" href="_base.css">
<link rel="stylesheet" href="components.css">
</head>
<body>
${body}
</body>
</html>
`;
}

export function screenNames() {
  return readdirSync(join(MOCKUPS, 'src'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => f.slice(0, -'.html'.length))
    .sort();
}

// nome do arquivo gerado → HTML
export function renderAll() {
  const out = new Map();
  for (const name of screenNames()) {
    const body = expandIncludes(readFileSync(join(MOCKUPS, 'src', `${name}.html`), 'utf8'));
    for (const theme of THEMES) out.set(`${name}.${theme}.html`, renderPage({ name, theme, body }));
  }
  return out;
}

if (isMain(import.meta.url)) {
  const pages = renderAll();
  for (const [file, html] of pages) writeFileSync(join(MOCKUPS, file), html);
  console.log(`geradas ${pages.size} páginas em mockups/`);
}
