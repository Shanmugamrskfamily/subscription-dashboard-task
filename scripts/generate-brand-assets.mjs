// Renders the PlanPilot logo and share image from scripts/brand/brand.html into
// client/public: favicons, app icons and the 1200×630 Open Graph image.
//   node scripts/generate-brand-assets.mjs
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const out = (name) => resolve(root, 'client/public', name);
const pageUrl = (view) =>
  `${pathToFileURL(resolve(root, 'scripts/brand/brand.html')).href}?view=${view}`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

/** The share image is a JPEG: link-preview crawlers skip images much over 300 kB. */
async function shareImage(file) {
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.goto(pageUrl('og'));
  await page.waitForLoadState('networkidle');
  // Runs in the page, so it is passed as a string (document is not a Node global).
  await page.evaluate('document.fonts.ready');
  writeFileSync(out(file), await page.screenshot({ type: 'jpeg', quality: 88 }));
}

/** Scales a 512 px render down by resizing the viewport with CSS zoom. */
async function icon(view, size, file, transparent) {
  await page.setViewportSize({ width: size, height: size });
  await page.goto(pageUrl(view));
  await page.addStyleTag({ content: `body{zoom:${size / 512}}` });
  await page.waitForLoadState('networkidle');
  const buffer = await page.screenshot({
    omitBackground: transparent,
    clip: { x: 0, y: 0, width: size, height: size },
  });
  if (file) writeFileSync(out(file), buffer);
  return buffer;
}

/** A minimal .ico holding PNG images (supported by every current browser). */
function writeIco(file, pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  writeFileSync(out(file), Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]));
}

rmSync(out('og-image.png'), { force: true });
await shareImage('og-image.jpg');
await icon('icon', 512, 'icon-512.png', true);
await icon('icon', 192, 'icon-192.png', true);
await icon('bleed', 512, 'icon-maskable-512.png', false);
await icon('bleed', 180, 'apple-touch-icon.png', false);
const ico32 = await icon('icon', 32, null, true);
const ico16 = await icon('icon', 16, null, true);
writeIco('favicon.ico', [
  { size: 16, data: ico16 },
  { size: 32, data: ico32 },
]);
await browser.close();

// The SVG favicon is the same mark, straight from the template.
const html = readFileSync(resolve(root, 'scripts/brand/brand.html'), 'utf8');
const svg = html.match(/<template id="mark">\s*([\s\S]*?)\s*<\/template>/)?.[1];
if (svg) writeFileSync(out('favicon.svg'), `${svg.trim()}\n`);
console.log('Brand assets written to client/public');
