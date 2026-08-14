import { chromium } from 'playwright';

const URL = 'http://localhost:8099/#cockpit';
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();

page.setDefaultNavigationTimeout(0);
try { await page.goto(URL, { waitUntil: 'commit' }); } catch (e) {}
await page.waitForTimeout(4000);

const diag = await page.evaluate(() => {
  const o = document.getElementById('authOverlay');
  const f = document.getElementById('authForm');
  const b = document.getElementById('authSubmit');
  return {
    bodyLen: document.body.innerHTML.length,
    appHTMLlen: document.getElementById('app') ? document.getElementById('app').innerHTML.length : -1,
    overlayExists: !!o,
    overlayHidden: o ? o.hidden : 'n/a',
    overlayHTMLlen: o ? o.innerHTML.length : -1,
    formExists: !!f,
    btnExists: !!b,
    storeExists: !!window.Store,
    authState: window.Store ? JSON.stringify(window.Store.state.auth) : 'no-store',
  };
});
console.log('=== DIAG:', JSON.stringify(diag, null, 2));

// Si le bouton existe, tente le login
if (diag.btnExists) {
  await page.fill('#authUser', 'admin').catch(e => console.log('fill u:', e.message));
  await page.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME').catch(e => console.log('fill p:', e.message));
  console.log('onsubmit:', await page.evaluate(() => typeof document.getElementById('authForm')?.onsubmit));
  const calls = [];
  page.on('request', r => { if (r.url().includes('/api/auth/login')) calls.push('REQ ' + r.method()); });
  await page.click('#authSubmit').catch(e => console.log('click:', e.message));
  await page.waitForTimeout(2000);
  console.log('login calls:', JSON.stringify(calls));
  console.log('overlay.hidden after:', await page.evaluate(() => document.getElementById('authOverlay')?.hidden));
}
await browser.close();
