/**
 * Accessibility and RTL harness.
 *
 * Checks the things that can be verified mechanically: keyboard reachability,
 * visible focus, skip link, heading structure, contrast of the main text pairs,
 * reduced-motion support, touch-target sizes and absence of physical-direction
 * CSS. It is not a substitute for a screen-reader pass or a formal audit.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { startServer } from './serve.mjs';

process.on('unhandledRejection', (error) => {
  console.error('UNHANDLED REJECTION:', error);
  process.exit(9);
});

const PORT = Number(process.argv[2] ?? 4344);
const BASE = `http://localhost:${PORT}`;
const server = await startServer(PORT);

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed: Boolean(passed), detail });
  console.log(`  [${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
const page = await context.newPage();

const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
};

console.log('\n== Keyboard and focus ==');
await go('/');

await page.keyboard.press('Tab');
const firstFocus = await page.evaluate(() => ({
  tag: document.activeElement?.tagName,
  text: document.activeElement?.textContent?.trim().slice(0, 30),
  cls: document.activeElement?.className,
}));
check('first Tab reaches the skip link', /skip-link/.test(String(firstFocus.cls)), firstFocus.text);

const skipTarget = await page.evaluate(() => {
  const link = document.querySelector('.tt-skip-link');
  return link?.getAttribute('href');
});
check('skip link points at the main landmark', skipTarget === '#main', String(skipTarget));
check('main landmark exists and is focusable',
  (await page.locator('main#main[tabindex="-1"]').count()) === 1);

const focusStyles = await page.evaluate(() => {
  const link = document.querySelector('.tt-skip-link');
  link?.focus();
  const style = getComputedStyle(link);
  return { outlineWidth: style.outlineWidth, outlineStyle: style.outlineStyle };
});
check('focused element has a visible outline',
  focusStyles.outlineStyle !== 'none' && parseFloat(focusStyles.outlineWidth) > 0,
  `${focusStyles.outlineStyle} ${focusStyles.outlineWidth}`);

// Walk the header with the keyboard and confirm every stop is a real control.
const tabStops = [];
for (let i = 0; i < 12; i += 1) {
  await page.keyboard.press('Tab');
  tabStops.push(await page.evaluate(() => {
    const el = document.activeElement;
    return { tag: el?.tagName, label: (el?.textContent || el?.getAttribute('aria-label') || '').trim().slice(0, 24) };
  }));
}
const interactive = tabStops.filter((stop) => ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(stop.tag));
check('tabbing lands only on interactive elements', interactive.length === tabStops.length,
  `${interactive.length}/${tabStops.length}`);
check('every tab stop has an accessible name', tabStops.every((stop) => stop.label.length > 0),
  tabStops.filter((s) => !s.label).length + ' unnamed');

console.log('\n== Structure ==');
for (const path of ['/', '/store', '/games', '/games/ea-sports-fc', '/products/playstation-plus', '/cart', '/faq', '/reviews', '/deals', '/support', '/account', '/terms']) {
  await go(path);
  const structure = await page.evaluate(() => {
    const levels = [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => Number(h.tagName[1]));
    let skips = 0;
    for (let i = 1; i < levels.length; i += 1) {
      if (levels[i] - levels[i - 1] > 1) skips += 1;
    }
    return {
      h1: document.querySelectorAll('h1').length,
      skips,
      landmarks: ['header', 'main', 'footer', 'nav'].filter((t) => document.querySelector(t) !== null),
    };
  });
  check(`${path}: exactly one h1`, structure.h1 === 1, `${structure.h1} found`);
  check(`${path}: no skipped heading levels`, structure.skips === 0, `${structure.skips} skips`);
  check(`${path}: header/main/footer landmarks present`,
    ['header', 'main', 'footer'].every((l) => structure.landmarks.includes(l)),
    structure.landmarks.join(','));
}

console.log('\n== Contrast (main text pairs) ==');
await go('/');
const contrast = await page.evaluate(() => {
  const luminance = (rgb) => {
    const [r, g, b] = rgb.map((value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const parse = (color) => (color.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
  const ratio = (fg, bg) => {
    const l1 = luminance(parse(fg));
    const l2 = luminance(parse(bg));
    const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
    return (hi + 0.05) / (lo + 0.05);
  };
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const sample = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const style = getComputedStyle(el);
    let bg = style.backgroundColor;
    let node = el;
    while (bg === 'rgba(0, 0, 0, 0)' && node.parentElement) {
      node = node.parentElement;
      bg = getComputedStyle(node).backgroundColor;
    }
    if (bg === 'rgba(0, 0, 0, 0)') bg = bodyBg;
    return { selector, ratio: Number(ratio(style.color, bg).toFixed(2)), size: style.fontSize };
  };
  return ['h1', 'p.lead', '.tt-muted', '.tt-faint', '.tt-btn--primary', 'a']
    .map(sample).filter(Boolean);
});
for (const sample of contrast) {
  // 4.5:1 for body text, 3:1 for large text (>=24px or bold >=18.66px).
  const large = parseFloat(sample.size) >= 24;
  const threshold = large ? 3 : 4.5;
  check(`contrast ${sample.selector} (${sample.size})`, sample.ratio >= threshold,
    `${sample.ratio}:1 vs ${threshold}:1`);
}

console.log('\n== Reduced motion ==');
const reducedContext = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  reducedMotion: 'reduce',
});
const reducedPage = await reducedContext.newPage();
await reducedPage.goto(`${BASE}/store`, { waitUntil: 'networkidle' });
await reducedPage.waitForTimeout(400);
const animationDuration = await reducedPage.evaluate(() => {
  const el = document.querySelector('.tt-skeleton') ?? document.querySelector('.tt-btn');
  return el ? getComputedStyle(el).animationDuration : 'none';
});
// Compared as a number, not as a string. The stylesheet sets 0.01ms, which
// Chrome serialises as "1e-05s" and never as "0.01ms", so the old string list
// could only pass on an element the rule had not reached.
const durationSeconds = animationDuration === 'none' ? 0 : parseFloat(animationDuration);
check('animations are suppressed under prefers-reduced-motion',
  Number.isFinite(durationSeconds) && durationSeconds <= 0.0001,
  animationDuration);
await reducedContext.close();

console.log('\n== Touch targets (mobile) ==');
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL' });
const mobilePage = await mobile.newPage();
await mobilePage.goto(`${BASE}/store`, { waitUntil: 'networkidle' });
await mobilePage.waitForTimeout(600);
const smallTargets = await mobilePage.evaluate(() => [...document.querySelectorAll('button, a')]
  .filter((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && (rect.height < 32 || rect.width < 32);
  })
  .map((el) => `${el.tagName}.${String(el.className).slice(0, 24)} ${Math.round(el.getBoundingClientRect().height)}px`)
  .slice(0, 6));
check('no undersized touch targets on the store grid', smallTargets.length === 0, smallTargets.join(' | '));
await mobile.close();

console.log('\n== RTL ==');
await go('/products/playstation-store-gift-card');
const rtl = await page.evaluate(() => {
  const dir = document.documentElement.dir;
  const crumbs = document.querySelector('.crumbs');
  const badge = document.querySelector('.featured');
  return {
    dir,
    crumbTextAlign: crumbs ? getComputedStyle(crumbs).direction : 'n/a',
    bodyDirection: getComputedStyle(document.body).direction,
    badgeSide: badge ? getComputedStyle(badge).insetInlineStart : 'n/a',
  };
});
check('document direction is RTL', rtl.dir === 'rtl');
check('computed body direction is RTL', rtl.bodyDirection === 'rtl');

// Alerts and inputs must read from the right.
const alertBorder = await page.evaluate(() => {
  const alert = document.querySelector('.tt-alert');
  if (!alert) return null;
  const style = getComputedStyle(alert);
  return {
    right: style.borderRightWidth,
    left: style.borderLeftWidth,
  };
});
check('alert accent border renders on the inline-start (right) edge in RTL',
  alertBorder !== null && parseFloat(alertBorder.right) > parseFloat(alertBorder.left),
  alertBorder ? `right=${alertBorder.right} left=${alertBorder.left}` : 'no alert');

await browser.close();
server.close();

mkdirSync('qa/out', { recursive: true });
writeFileSync('qa/out/a11y.json', JSON.stringify(results, null, 2));

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('\nFAILURES:');
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
  process.exitCode = 1;
}
