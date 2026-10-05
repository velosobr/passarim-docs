// Gera icon/preview-48dp.png e valida que a silhueta cabe na zona segura (66dp centrais).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { ICON, isMain } from './paths.mjs';

const read = (f) => readFileSync(join(ICON, f), 'utf8');
const inner = (svg) => svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title>.*?<\/title>/, '');
const SAFE_RADIUS = 33; // zona segura: círculo de 66dp no centro dos 108dp
const HALF_STROKE = 1.6;

function html() {
  const layer = (extra = '') =>
    `<svg viewBox="0 0 108 108" width="108" height="108">${inner(read('background.svg'))}<g id="fg${extra}">${inner(read('foreground.svg'))}</g></svg>`;
  const mono = `<svg viewBox="0 0 108 108" width="108" height="108">${inner(read('monochrome.svg'))}</svg>`;
  return `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#F6FBF3;font:12px system-ui}
    #sheet{display:flex;gap:24px;align-items:center;padding:24px;width:max-content}
    .m72{width:72px;height:72px;overflow:hidden;border-radius:50%;position:relative;flex:none}
    .m72>svg{position:absolute;left:-18px;top:-18px}
    .m48{width:48px;height:48px;flex:none}.m48 .m72{transform:scale(.6667);transform-origin:0 0}
    .big .m72{transform:scale(1.5);transform-origin:0 0;margin:0 36px 36px 0}
    .safe{position:absolute;width:66px;height:66px;border:1px dashed #BA1A1A;border-radius:50%;box-sizing:border-box;pointer-events:none}
    .tint{background:#C0C9BF;color:#181D18}
  </style>
  <div id="sheet">
    <div class="big"><div class="m72">${layer()}<div class="safe" style="left:3px;top:3px"></div></div></div>
    <div class="m48"><div class="m72">${layer('-small')}</div></div>
    <div class="m48"><div class="m72 tint">${mono}</div></div>
  </div>`;
}

export async function exportPreview() {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
  try {
    const page = await (await browser.newContext({ deviceScaleFactor: 3 })).newPage();
    await page.setContent(html());
    // A zona segura do Android é um círculo de 66dp: medimos o ponto mais distante do centro ao longo de todos os traços.
    const maxDist = await page.evaluate(() => {
      let max = 0;
      for (const path of document.querySelectorAll('#fg path')) {
        const len = path.getTotalLength();
        for (let l = 0; l <= len; l += 0.5) {
          const p = path.getPointAtLength(l);
          max = Math.max(max, Math.hypot(p.x - 54, p.y - 54));
        }
      }
      return max;
    });
    if (maxDist + HALF_STROKE > SAFE_RADIUS) {
      throw new Error(`silhueta fora da zona segura: ponto mais distante a ${(maxDist + HALF_STROKE).toFixed(1)}dp do centro (limite ${SAFE_RADIUS}dp)`);
    }
    await page.locator('#sheet').screenshot({ path: join(ICON, 'preview-48dp.png') });
    console.log(`ícone OK: ponto mais distante a ${(maxDist + HALF_STROKE).toFixed(1)}dp do centro (limite ${SAFE_RADIUS}dp)`);
  } finally {
    await browser.close();
  }
}

if (isMain(import.meta.url)) await exportPreview();
