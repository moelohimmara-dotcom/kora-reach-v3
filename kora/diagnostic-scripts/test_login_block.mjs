import { chromium } from 'playwright';

const URL = 'https://213-156-135-139.sslip.io/kora-v2/#cockpit';
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const consoleMsgs = [];
let loginCalls = [];
page.on('console', m => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => consoleMsgs.push(`[PAGEERROR] ${e.message}`));

// Coupe la boucle infinie de GET /api (sauf login) pour permettre networkidle
await page.route('**/api/**', route => {
  const u = route.request().url();
  if (u.includes('/api/auth/login')) return route.continue();
  // abort tous les autres GET /api (la boucle infinie)
  return route.abort();
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// Wrapper fetch pour capturer le POST login + issue
await page.evaluate(() => {
  const orig = window.fetch.bind(window);
  window.__login = [];
  window.fetch = async (...a) => {
    const url = String(a[0]);
    if (url.includes('/api/auth/login')) {
      try {
        const r = await orig(...a);
        const t = await r.clone().text();
        window.__login.push(`STATUS ${r.status} ${r.statusText} :: ${t.slice(0,200)}`);
        return r;
      } catch (e) { window.__login.push('FETCH_ERR ' + e.message); throw e; }
    }
    return orig(...a);
  };
});

await page.fill('#authUser', 'admin');
await page.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME');
console.log('onsubmit:', await page.evaluate(() => typeof document.getElementById('authForm')?.onsubmit));

await page.click('#authSubmit').catch(e => consoleMsgs.push('click:'+e.message));
await page.waitForTimeout(2500);

loginCalls = await page.evaluate(() => window.__login || []);
const overlayHidden = await page.evaluate(() => document.getElementById('authOverlay')?.hidden);
console.log('=== loginCalls:', JSON.stringify(loginCalls));
console.log('=== overlay.hidden:', overlayHidden);
console.log('=== CONSOLE:', consoleMsgs.slice(0,20).join('\n') || '(none)');
await browser.close();
