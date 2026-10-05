// Caminhos e utilitários compartilhados pelos scripts desta pasta.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOLS = import.meta.dirname;
export const DESIGN = join(TOOLS, '..');
export const TOKENS_JSON = join(DESIGN, 'tokens', 'passarim-tokens.json');
export const MOCKUPS = join(DESIGN, 'mockups');
export const ICON = join(DESIGN, 'icon');

export function loadTokens() {
  return JSON.parse(readFileSync(TOKENS_JSON, 'utf8'));
}

// true quando o arquivo foi executado direto (node arquivo.mjs), e não importado.
export function isMain(importMetaUrl) {
  return process.argv[1] === fileURLToPath(importMetaUrl);
}
