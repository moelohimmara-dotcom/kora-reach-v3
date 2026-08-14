import { chromium } from 'playwright';

const URL = 'https://213-156-135-139.sslip.io/kora-v2/#cockpit';
const consoleMsgs = [];

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();

page.on('console', m => { if (m.text().includes('login') || m.type()==='error') consoleMsgs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', e => consoleMsgs.push(`[PAGEERROR] ${e.message}`));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('#authSubmit', { timeout: 10000 });

// Wrapper fetch pour capturer le POST login + son issue
await page.evaluate(() => {
  const origFetch = window.fetch.bind(window);
  window.__loginCalls = [];
  window.fetch = async (...args) => {
    const url = String(args[0]);
    if (url.includes('/api/auth/login')) {
      try {
        const r = await origFetch(...args);
        const txt = await r.clone().text();
        window.__loginCalls.push(`LOGIN ${r.status} ${r.statusText} body=${txt.slice(0,300)}`);
        return r;
      } catch (e) {
        window.__loginCalls.push(`LOGIN FETCH ERROR: ${e.message}`);
        throw e;
      }
    }
    return origFetch(...args);
  };
});

await page.fill('#authUser', 'admin');
await page.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME');
console.log('onsubmit type:', await page.evaluate(() => typeof document.getElementById('authForm')?.onsubmit));

await page.click('#authSubmit').catch(e => consoleMsgs.push('click: ' + e.message));
await page.waitForTimeout(4000);

const loginCalls = await page.evaluate(() => window.__loginCalls || []);
const overlayHidden = await page.evaluate(() => document.getElementById('authOverlay')?.hidden);
const appDisplay = await page.evaluate(() => document.getElementById('app')?.style.display);

console.log('=== loginCalls:', JSON.stringify(loginCalls));
console.log('=== overlay.hidden:', overlayHidden, '| app.display:', JSON.stringify(appDisplay));
console.log('=== CONSOLE/ERREURS:');
console.log(consoleMsgs.slice(0, 30).join('\n') || '(aucune)');

await browser.close();
