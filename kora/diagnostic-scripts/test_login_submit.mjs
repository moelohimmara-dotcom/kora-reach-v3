import { chromium } from 'playwright';

const URL = 'https://213-156-135-139.sslip.io/kora-v2/#cockpit';
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const consoleMsgs = [];
page.on('console', m => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => consoleMsgs.push(`[PAGEERROR] ${e.message}`));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// Instrumente le formulaire pour voir si le submit natif se déclenche
await page.evaluate(() => {
  const f = document.getElementById('authForm');
  if (f) {
    f.addEventListener('submit', (e) => {
      console.log('NATIVE_SUBMIT_FIRED defaultPrevented=' + e.defaultPrevented);
    }, true);
    window.__formHTML = f.outerHTML.slice(0, 500);
  }
  window.__err = [];
  window.addEventListener('error', (e) => window.__err.push(e.message));
});

await page.fill('#authUser', 'admin');
await page.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME');

console.log('onsubmit type:', await page.evaluate(() => typeof document.getElementById('authForm')?.onsubmit));
console.log('formHTML snippet:', await page.evaluate(() => window.__formHTML || 'n/a'));

await page.click('#authSubmit').catch(e => consoleMsgs.push('click: ' + e.message));
await page.waitForTimeout(2500);

const postSeen = await page.evaluate(() => window.__err || []);
const overlayHidden = await page.evaluate(() => document.getElementById('authOverlay')?.hidden);
const appDisplay = await page.evaluate(() => document.getElementById('app')?.style.display);

console.log('=== window errors:', JSON.stringify(postSeen));
console.log('=== overlay.hidden:', overlayHidden, '| app.display:', JSON.stringify(appDisplay));
console.log('=== CONSOLE:', consoleMsgs.slice(0, 25).join('\n') || '(none)');
await browser.close();
