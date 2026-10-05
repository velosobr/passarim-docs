// Lê os traços do pássaro a partir do foreground.svg (fonte única da logo).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ICON } from './paths.mjs';

export function readBirdPaths() {
  const svg = readFileSync(join(ICON, 'foreground.svg'), 'utf8');
  return [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
}
