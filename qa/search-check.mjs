import { chromium } from '@playwright/test';
import { startServer } from './serve.mjs';
const server = await startServer(4397);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto('http://localhost:4397/', { waitUntil: 'networkidle' });
await p.fill('tt-app-header input[type=search]', 'V-Bucks');
await p.press('tt-app-header input[type=search]', 'Enter');
await p.waitForTimeout(900);
console.log('url after search:', p.url());
const count = await p.locator('a.card').count();
console.log('cards shown:', count);
// And the empty state, which a real customer will hit.
await p.goto('http://localhost:4397/store?search=zzzznothing', { waitUntil: 'networkidle' });
await p.waitForTimeout(700);
const empty = await p.locator('main').innerText();
console.log('empty state text:', empty.split(String.fromCharCode(10)).filter(Boolean).slice(-3).join(' | '));
await b.close(); server.close();
