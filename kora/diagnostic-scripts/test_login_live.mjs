import { chromium } from 'playwright';

const URL = 'https://213-156-135-139.sslip.io/kora-v2/#cockpit';
const consoleMsgs = [];
const netReqs = [];

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

page.on('console', m => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => consoleMsgs.push(`[PAGEERROR] ${e.message}`));
page.on('request', r => { if (r.url().includes('/api/')) netReqs.push(`REQ ${r.method()} ${r.url()}`); });
page.on('response', r => { if (r.url().includes('/api/')) netReqs.push(`RES ${r.status()} ${r.url()}`); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// État initial
const overlayVisibleBefore = await page.evaluate(() => {
  const o = document.getElementById('authOverlay');
  return o ? !o.hidden : 'no-overlay';
});

// Remplir
await page.fill('#authUser', 'admin').catch(e => consoleMsgs.push('fill user: ' + e.message));
await page.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME').catch(e => consoleMsgs.push('fill pass: ' + e.message));

// Vérifier onsubmit attaché
const hasOnsubmit = await page.evaluate(() => {
  const f = document.getElementById('authForm');
  return f ? (typeof f.onsubmit === 'function') : 'no-form';
});

// Cliquer
await page.click('#authSubmit').catch(e => consoleMsgs.push('click: ' + e.message));
await page.waitForTimeout(2500);

const overlayVisibleAfter = await page.evaluate(() => {
  const o = document.getElementById('authOverlay');
  return o ? !o.hidden : 'no-overlay';
});
const appVisibleAfter = await page.evaluate(() => {
  const a = document.getElementById('app');
  return a ? a.style.display !== 'none' : 'no-app';
});
const urlAfter = page.url();

console.log('=== OVERLAY before:', overlayVisibleBefore);
console.log('=== authForm onsubmit:', hasOnsubmit);
console.log('=== OVERLAY after:', overlayVisibleAfter);
console.log('=== APP visible after:', appVisibleAfter);
console.log('=== URL after:', urlAfter);
console.log('=== NET /api/ requests:');
console.log(netReqs.join('\n') || '(none)');
console.log('=== CONSOLE:');
console.log(consoleMsgs.join('\n') || '(none)');

await browser.close();
