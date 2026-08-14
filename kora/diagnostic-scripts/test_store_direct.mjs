import { chromium } from 'playwright';

const URL = 'https://213-156-135-139.sslip.io/kora-v2/#cockpit';
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const consoleMsgs = [];
page.on('console', m => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => consoleMsgs.push(`[PAGEERROR] ${e.message}`));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

const info = await page.evaluate(() => {
  const o = document.getElementById('authOverlay');
  const f = document.getElementById('authForm');
  const b = document.getElementById('authSubmit');
  return {
    overlayExists: !!o, overlayHidden: o ? o.hidden : null,
    formOnsubmit: f ? typeof f.onsubmit : 'no-form',
    btnText: b ? b.textContent : null,
    storeExists: !!window.Store,
    appDisplay: document.getElementById('app') ? document.getElementById('app').style.display : 'no-app',
  };
});
console.log('=== INFO:', JSON.stringify(info));

const direct = await page.evaluate(async () => {
  if (!window.Store) return 'NO STORE';
  try {
    const ok = await window.Store.login('admin', process.env.KORA_TEST_PASS || 'CHANGE_ME');
    return 'OK=' + ok + ' auth=' + JSON.stringify(window.Store.state.auth);
  } catch (e) { return 'THREW: ' + e.message; }
});
console.log('=== DIRECT Store.login:', direct);
console.log('=== CONSOLE:', consoleMsgs.slice(0,15).join('\n') || '(none)');
await browser.close();
