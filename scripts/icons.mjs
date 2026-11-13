// Renders the logo SVGs into the PNG icons Chrome needs (public/icon/<size>.png).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const full = readFileSync('assets/logo.svg', 'utf8');
const small = readFileSync('assets/logo-small.svg', 'utf8');
mkdirSync('public/icon', { recursive: true });

for (const size of [16, 32, 48, 96, 128]) {
  // Toolbar sizes use the simplified mark so it stays crisp.
  const svg = size <= 32 ? small : full;
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(`public/icon/${size}.png`, png);
  console.log(`public/icon/${size}.png`);
}
// Large preview for the README / store listing.
writeFileSync(
  'assets/logo-512.png',
  new Resvg(full, { fitTo: { mode: 'width', value: 512 } }).render().asPng(),
);
console.log('assets/logo-512.png');
