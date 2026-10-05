// Exporta cada página de mockups/ para PNG e verifica overflow, texto cortado e fonte carregada.
// Uso: node export-png.mjs [nome-da-tela ...] [--scale 1.3]
import { readdirSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { MOCKUPS } from './paths.mjs';

const args = process.argv.slice(2);
const si = args.indexOf('--scale');
const scale = si >= 0 ? Number(args[si + 1]) : 1;
const wanted = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--scale');
const outDir = scale === 1 ? join(MOCKUPS, 'png') : join(MOCKUPS, 'png', `x${scale}`);
mkdirSync(outDir, { recursive: true });

const pages = readdirSync(MOCKUPS)
  .filter((f) => /\.(light|dark)\.html$/.test(f))
  .filter((f) => wanted.length === 0 || wanted.includes(f.replace(/\.(light|dark)\.html$/, '')))
  .sort();
if (pages.length === 0) { console.error('nenhuma página encontrada'); process.exit(1); }

// Roda dentro da página: devolve a lista de problemas de layout.
function inPageChecks() {
  const out = [];
  if (document.documentElement.scrollWidth > 390) out.push(`rolagem horizontal: ${document.documentElement.scrollWidth}px`);
  // document.fonts.check() devolve true mesmo quando o @font-face falhou; por isso olhamos o status de cada face.
  if (![...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Manrope' && f.status === 'loaded')) {
    out.push('fonte Manrope não carregou (texto em fallback)');
  }
  const label = (el) => `<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}">`;
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[data-allow-clip]')) continue;
    const cs = getComputedStyle(el);
    if (cs.textOverflow === 'ellipsis') out.push(`reticências em ${label(el)}`);
    const clips = cs.overflowX !== 'visible' || cs.overflowY !== 'visible';
    if (clips && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) {
      out.push(`conteúdo cortado em ${label(el)} (${el.scrollWidth}×${el.scrollHeight} em ${el.clientWidth}×${el.clientHeight})`);
    }
  }
  return out;
}

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
let failed = 0;
try {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  for (const file of pages) {
    await page.goto(pathToFileURL(join(MOCKUPS, file)).href);
    await page.evaluate((s) => { document.documentElement.style.fontSize = `${16 * s}px`; }, scale);
    await page.evaluate(() => document.fonts.ready);
    const issues = await page.evaluate(inPageChecks);
    const name = basename(file, '.html');
    if (issues.length) {
      failed++;
      console.error(`PROBLEMA ${name}:\n  - ${issues.join('\n  - ')}`);
    } else {
      console.log(`OK ${name}`);
    }
    await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true });
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
