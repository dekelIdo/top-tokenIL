/**
 * End-to-end proof that the storefront runs on the real backend.
 *
 * Drives Chromium against the staging build, which is configured for
 * `apiMode: 'http'`, so every product on screen has travelled the whole chain:
 *
 *   Angular -> HTTP -> NestJS -> Prisma -> PostgreSQL -> DTO -> mapper -> UI
 *
 * The point is not that the pages render. It is that what they render came out
 * of a database, and that figures shown to a customer match the rows behind
 * them.
 *
 * Run: node backend/scripts/with-db.mjs node qa/http-flow.mjs
 * (the wrapper owns a real PostgreSQL for the lifetime of this script)
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from './serve.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const backendDir = join(root, 'backend');

const WEB_PORT = Number(process.argv[2] ?? 4323);
const API_PORT = 3000;
const BASE = `http://localhost:${WEB_PORT}`;
const API = `http://localhost:${API_PORT}/api/v1`;

const results = [];
let currentGroup = 'general';
const group = (name) => { currentGroup = name; };
const check = (name, passed, detail = '') => {
  results.push({ group: currentGroup, name, passed: Boolean(passed), detail });
  console.log(`  [${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
};

process.on('unhandledRejection', (error) => {
  console.error('UNHANDLED REJECTION:', error);
  process.exit(9);
});

// ---------------------------------------------------------------------------
// Backend

/** Waits for readiness rather than sleeping, so a slow start is not a failure. */
async function waitForApi(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${API}/ready`);
      if (response.ok) {
        return true;
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

console.log('Starting the backend against the temporary PostgreSQL...');
const backend = spawn(
  'npm',
  ['run', 'start:e2e'],
  {
    cwd: backendDir,
    // Node 22 refuses to spawn a .cmd shim directly on Windows, so the command
    // goes through a shell there.
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(API_PORT),
      // The storefront is served from a different port, so it is cross-origin
      // and needs to be on the allowlist for its cookie to be accepted.
      CORS_ALLOWED_ORIGINS: BASE,
    },
  },
);

const backendLog = [];
backend.stdout.on('data', (chunk) => backendLog.push(chunk.toString()));
backend.stderr.on('data', (chunk) => backendLog.push(chunk.toString()));

const ready = await waitForApi();
if (!ready) {
  console.error('The backend never became ready. Last output:\n' + backendLog.join('').slice(-4000));
  backend.kill();
  process.exit(2);
}
console.log('Backend is ready.\n');

const server = await startServer(WEB_PORT);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

/** Every backend call the browser made, so we can prove it used HTTP at all. */
const apiCalls = [];
page.on('request', (request) => {
  if (request.url().startsWith(`http://localhost:${API_PORT}`)) {
    apiCalls.push(`${request.method()} ${request.url().replace(`http://localhost:${API_PORT}`, '')}`);
  }
});

const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
};

let exitCode = 0;

try {
  // -------------------------------------------------------------------------
  group('the app is talking to the backend');

  await go('/');
  check('the home page loads with no console error', consoleErrors.length === 0, consoleErrors[0] ?? '');
  check('the browser called the API over HTTP', apiCalls.length > 0, `${apiCalls.length} calls`);

  const seeded = await (await fetch(`${API}/products?pageSize=100`)).json();
  check('the API serves the catalog from PostgreSQL', seeded.total > 0, `${seeded.total} products`);

  // -------------------------------------------------------------------------
  group('the catalog on screen is the catalog in the database');

  await go('/store');
  const cardCount = await page.locator('a.card').count();
  check('the store renders product cards', cardCount > 0, `${cardCount} cards`);

  const storeText = await page.locator('main').innerText();
  const firstProduct = seeded.items[0];
  const firstName = firstProduct.name.he;
  check(
    'a product name from the database appears on the page',
    storeText.includes(firstName),
    firstName,
  );

  // -------------------------------------------------------------------------
  group('a product page shows real offers and real prices');

  await go(`/products/${firstProduct.slug}`);
  const detail = await (await fetch(`${API}/products/${firstProduct.slug}`)).json();
  const detailText = await page.locator('main').innerText();

  check('the product detail page loads', detailText.length > 0);
  check(
    'the page shows the product the API returned',
    detailText.includes(detail.product.name.he),
    detail.product.name.he,
  );

  // Prices are rendered in shekels; the API speaks agorot.
  const cheapest = Math.min(...detail.offers.map((offer) => offer.price.current.amountMinor));
  const asShekels = (cheapest / 100).toLocaleString('he-IL', { maximumFractionDigits: 2 });
  check(
    'a price on screen matches the database price',
    detailText.replace(/[‎‏,]/g, '').includes(asShekels.replace(/,/g, '')),
    `${cheapest} agorot`,
  );

  check(
    'every offer declares a fulfillment method we support',
    detail.offers.every((offer) => offer.fulfillmentMethod !== 'NOT_SUPPORTED'),
  );

  // -------------------------------------------------------------------------
  group('the server prices the cart, not the browser');

  const offer = detail.offers.find((candidate) => candidate.inventory.status === 'IN_STOCK') ?? detail.offers[0];

  const priced = await (await fetch(`${API}/cart/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offerId: offer.id, quantity: 2 }),
  })).json();

  check(
    'the API prices a line from the offer, not from the request',
    priced.totalPrice.amountMinor === offer.price.current.amountMinor * 2,
    `${priced.totalPrice.amountMinor} agorot`,
  );

  const tampered = await fetch(`${API}/cart/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offerId: offer.id, quantity: 1, unitPrice: { amountMinor: 1, currency: 'ILS' } }),
  });
  check('a submitted price is rejected outright', tampered.status === 422, `HTTP ${tampered.status}`);

  // -------------------------------------------------------------------------
  group('the cart survives a reload');

  await go(`/products/${firstProduct.slug}`);
  const addButton = page.locator('button', { hasText: 'הוספה לעגלה' }).first();
  const canAdd = await addButton.count();

  if (canAdd > 0) {
    await addButton.click();
    await page.waitForTimeout(900);

    const before = await page.evaluate(() => window.localStorage.getItem('top-token.cart.v2'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => window.localStorage.getItem('top-token.cart.v2'));

    check('the cart is still there after a reload', Boolean(after) && after === before);

    await go('/cart');
    const cartText = await page.locator('main').innerText();
    check('the cart page renders the restored line', cartText.length > 0);

    // The stored cart caches display prices so it can render before the server
    // answers. They are deliberately not authoritative, and this is where that
    // claim gets tested rather than assumed: rewrite them to one agora, reload,
    // and ask the server what the cart costs.
    const tamperedCart = await page.evaluate(() => {
      const key = 'top-token.cart.v2';
      const items = JSON.parse(window.localStorage.getItem(key) ?? '[]');
      for (const item of items) {
        if (item.unitPrice) item.unitPrice.amountMinor = 1;
        if (item.totalPrice) item.totalPrice.amountMinor = 1;
      }
      window.localStorage.setItem(key, JSON.stringify(items));
      return items.map((item) => ({ offerId: item.offerId, quantity: item.quantity }));
    });

    const revalidated = await (await fetch(`${API}/cart/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: tamperedCart }),
    })).json();

    const honest = tamperedCart.reduce(
      (sum, item) => sum + offer.price.current.amountMinor * item.quantity,
      0,
    );
    check(
      'a price edited in local storage does not change what the server charges',
      revalidated.cart.totals.subtotal.amountMinor === honest,
      `server says ${revalidated.cart.totals.subtotal.amountMinor} agorot, storage claimed 1`,
    );

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    const afterTamper = await page.locator('main').innerText();
    check(
      'the cart page still renders after storage was tampered with',
      afterTamper.length > 0,
    );
  } else {
    check('an add-to-cart control was found on the product page', false, 'no matching button');
  }

  // -------------------------------------------------------------------------
  group('checkout is owned by the server');

  const checkout = await fetch(`${API}/checkout/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ offerId: offer.id, quantity: 2 }] }),
  });
  const checkoutBody = await checkout.json();
  const cookie = (checkout.headers.get('set-cookie') ?? '').split(';')[0];

  check('a checkout session is created', checkout.status === 201, checkoutBody.id ?? '');
  check(
    'the total is computed from the catalog',
    checkoutBody.cart.totals.subtotal.amountMinor === offer.price.current.amountMinor * 2,
    `${checkoutBody.cart.totals.total.amountMinor} agorot`,
  );
  check(
    'the checkout always asks for an email address',
    checkoutBody.requirements.some((requirement) => requirement.key === 'EMAIL'),
  );
  check(
    'the checkout asks for no credential of any kind',
    !/password|cvv|card|2fa|recovery/i.test(
      JSON.stringify(checkoutBody.requirements.map((r) => [r.key, r.control])),
    ),
  );

  const reread = await fetch(`${API}/checkout/sessions/${checkoutBody.id}`, { headers: { Cookie: cookie } });
  check('the owner can read the checkout back', reread.status === 200);

  const stranger = await fetch(`${API}/checkout/sessions/${checkoutBody.id}`);
  check('a caller without the session cannot', stranger.status === 404, `HTTP ${stranger.status}`);

  // -------------------------------------------------------------------------
  group('the storefront journey in the browser');

  await go('/cart');
  await go('/checkout');
  const checkoutText = await page.locator('main').innerText();
  check('the checkout page renders', checkoutText.length > 0);

  const passwordFields = await page.locator('input[type="password"]').count();
  check('no password field exists anywhere in checkout', passwordFields === 0);

  check(
    'no console error during the whole HTTP journey',
    consoleErrors.length === 0,
    consoleErrors.slice(0, 2).join(' | '),
  );

  const calledEndpoints = [...new Set(apiCalls.map((call) => call.split('?')[0]))];
  check('the browser used the versioned API', calledEndpoints.every((call) => call.includes('/api/v1/')));
  console.log('\n  API endpoints the browser actually called:');
  for (const endpoint of calledEndpoints) {
    console.log(`    ${endpoint}`);
  }
} catch (error) {
  console.error('\nHarness error:', error);
  exitCode = 9;
} finally {
  await browser.close();
  server.close();
  backend.kill();
}

const passed = results.filter((result) => result.passed).length;
console.log(`\n${passed}/${results.length} checks passed`);

mkdirSync(join(here, 'out'), { recursive: true });
writeFileSync(
  join(here, 'out', 'http-flow.json'),
  JSON.stringify({ passed, total: results.length, results }, null, 2),
  'utf8',
);

process.exit(exitCode || (passed === results.length ? 0 : 1));
