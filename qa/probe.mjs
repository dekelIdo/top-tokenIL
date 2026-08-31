import { chromium } from '@playwright/test';
import { startServer } from './serve.mjs';
const server = await startServer(4398);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://localhost:4398/', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

const info = await page.evaluate(() => {
  const host = document.querySelector('tt-trust-badges');
  if (!host) return { found: false };
  const ul = host.querySelector('ul');
  const cs = ul ? getComputedStyle(ul) : null;
  return {
    found: true,
    hostDisplay: getComputedStyle(host).display,
    ulClass: ul?.className,
    listStyle: cs?.listStyleType,
    display: cs?.display,
    gridCols: cs?.gridTemplateColumns,
    html: host.innerHTML.slice(0, 300),
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close(); server.close();
