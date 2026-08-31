/**
 * Renders the ZuzCOINS raster brand assets from the vector identity.
 *
 * Run by hand when the mark changes; the output is committed. Chromium is used
 * because it is already a dev dependency for the QA harnesses, so no image
 * library is added to the project for a job done a few times a year.
 *
 * Everything drawn here is original: the coin-and-Z mark and the brand palette.
 * No publisher logo, game art or third-party asset is involved.
 *
 * Run: node qa/make-brand-assets.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'src/assets/brand';
mkdirSync(OUT, { recursive: true });

const INK = '#0B0A12';
const GOLD_A = '#FFD873';
const GOLD_B = '#E0972B';
const VIOLET = '#6D4AFF';

/** The mark, sized to a square canvas. */
const mark = (size) => `
  <svg width="${size}" height="${size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="c" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${GOLD_A}"/>
        <stop offset="1" stop-color="${GOLD_B}"/>
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="${Math.round(size >= 180 ? 14 : 15)}" fill="${INK}"/>
    <ellipse cx="32" cy="32" rx="20" ry="23" fill="url(#c)"/>
    <path d="M22 21h21l-14 22h14" fill="none" stroke="#1A1428"
          stroke-width="5.6" stroke-linecap="square"/>
  </svg>`;

const browser = await chromium.launch();

/** Screenshots a bare SVG at an exact pixel size. */
async function renderSvg(svg, width, height, file) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<body style="margin:0;background:transparent">${svg}</body>`,
    { waitUntil: 'load' },
  );
  const buffer = await page.screenshot({ omitBackground: true });
  writeFileSync(file, buffer);
  await page.close();
  console.log(`  ${file} (${buffer.length} bytes)`);
  return buffer;
}

console.log('Icons:');
const png32 = await renderSvg(mark(32), 32, 32, join(OUT, 'icon-32.png'));
await renderSvg(mark(180), 180, 180, join(OUT, 'apple-touch-icon.png'));
await renderSvg(mark(512), 512, 512, join(OUT, 'icon-512.png'));

/**
 * A single-image .ico wrapping the 32px PNG.
 *
 * The ICO container has allowed a PNG payload since Windows Vista, so this is a
 * 22-byte header in front of the bytes we already have rather than a bitmap
 * encoder. `src/favicon.ico` shipped as the Angular default: a PNG with an .ico
 * extension, showing Angular's logo in browsers that request the legacy path.
 */
function icoFromPng(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);   // reserved
  header.writeUInt16LE(1, 2);   // type: icon
  header.writeUInt16LE(1, 4);   // one image

  const entry = Buffer.alloc(16);
  entry.writeUInt8(32, 0);      // width
  entry.writeUInt8(32, 1);      // height
  entry.writeUInt8(0, 2);       // palette size, 0 for truecolour
  entry.writeUInt8(0, 3);       // reserved
  entry.writeUInt16LE(1, 4);    // colour planes
  entry.writeUInt16LE(32, 6);   // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  return Buffer.concat([header, entry, png]);
}

writeFileSync('src/favicon.ico', icoFromPng(png32));
console.log(`  src/favicon.ico (rebuilt from the ZuzCOINS mark)`);

/**
 * The social preview.
 *
 * Composed rather than a screenshot of the site: a link preview is a poster, and
 * a shrunken homepage is unreadable at the size these are displayed. Says only
 * what the product actually does.
 */
console.log('Social preview:');
const og = `
<body style="margin:0">
  <div style="
    width:1200px;height:630px;position:relative;overflow:hidden;
    background:${INK};
    font-family:Heebo,'Segoe UI',system-ui,sans-serif;color:#F2EFFA;
    display:flex;flex-direction:column;justify-content:center;
    padding:0 96px;box-sizing:border-box;direction:rtl;">

    <div style="position:absolute;inset:0;
      background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),
                       linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);
      background-size:72px 72px;
      -webkit-mask-image:radial-gradient(ellipse at 70% 0%,#000 15%,transparent 65%);"></div>
    <div style="position:absolute;width:520px;height:520px;border-radius:50%;
      top:-160px;left:-120px;background:${VIOLET};filter:blur(130px);opacity:.30"></div>
    <div style="position:absolute;width:360px;height:360px;border-radius:50%;
      bottom:-140px;right:-60px;background:${GOLD_B};filter:blur(130px);opacity:.16"></div>

    <!-- A stack of coins bleeding off the leading edge. The right half is text,
         which in RTL left the left half empty; this is the product category
         rather than an ornament, so it earns the space. -->
    <svg width="460" height="460" viewBox="0 0 240 240"
         style="position:absolute;left:-40px;top:50%;transform:translateY(-50%);opacity:.92">
      <defs>
        <linearGradient id="stack" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${GOLD_A}"/><stop offset="1" stop-color="${GOLD_B}"/>
        </linearGradient>
      </defs>
      <ellipse cx="120" cy="196" rx="78" ry="22" fill="${VIOLET}" opacity=".22"/>
      <g fill="url(#stack)" stroke="#8A5A0E" stroke-opacity=".45" stroke-width="2">
        <ellipse cx="120" cy="168" rx="70" ry="21"/>
        <rect x="50" y="146" width="140" height="22" stroke="none"/>
        <ellipse cx="120" cy="146" rx="70" ry="21"/>
        <rect x="50" y="124" width="140" height="22" stroke="none"/>
        <ellipse cx="120" cy="124" rx="70" ry="21"/>
        <rect x="50" y="102" width="140" height="22" stroke="none"/>
        <ellipse cx="120" cy="102" rx="70" ry="21"/>
      </g>
      <ellipse cx="120" cy="102" rx="44" ry="13" fill="#fff" opacity=".28"/>
    </svg>

    <div style="position:relative;display:flex;align-items:center;gap:20px;margin-bottom:36px">
      ${mark(76)}
      <div style="font-size:52px;line-height:1;letter-spacing:-.01em">
        <span style="font-weight:800">Zuz</span><span style="font-weight:600;color:#A79FC0">COINS</span>
      </div>
    </div>

    <div style="position:relative;font-size:76px;font-weight:800;line-height:1.12;
                letter-spacing:-.02em;max-width:720px">
      מטבעות, קודים ומנויים<br>
      <span style="background:linear-gradient(100deg,${GOLD_A},${GOLD_B});
                   -webkit-background-clip:text;color:transparent">שמגיעים מהר</span>
    </div>

    <div style="position:relative;margin-top:28px;font-size:29px;color:#A79FC0;max-width:660px;line-height:1.5">
      פלטפורמה, אזור חנות וזמן אספקה גלויים לפני שמשלמים.
    </div>
  </div>
</body>`;

const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
// The wordmark uses the same face as the site, so the poster matches the product.
await page.addStyleTag({
  url: 'https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;800&display=swap',
});
await page.setContent(og, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const ogBuffer = await page.screenshot();
writeFileSync(join(OUT, 'social-preview.png'), ogBuffer);
console.log(`  ${OUT}/social-preview.png (${(ogBuffer.length / 1024).toFixed(0)} kB)`);

await browser.close();
console.log('Done.');
