import { chromium } from 'playwright';

const BASE = 'http://localhost:4173/';
const USER = 'admin';
const PASS = process.env.KORA_TEST_PASS || 'CHANGE_ME';

const log = (...a) => console.log(...a);

const browser = await chromium.launch();
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + e.message));
page.on('requestfailed', req => consoleErrors.push('REQFAIL: ' + req.url() + ' ' + req.failure().errorText));

log('1) GOTO', BASE);
await page.goto(BASE, { waitUntil: 'commit', timeout: 15000 });
await page.waitForTimeout(1000); // laisse le HTML parser

// Is auth overlay visible?
const overlayVisible = await page.evaluate(() => {
  const o = document.getElementById('authOverlay');
  return o ? !o.hidden : null;
});
log('   authOverlay visible:', overlayVisible);

// Is login form present?
const hasForm = await page.evaluate(() => !!document.getElementById('authForm'));
log('   login form present:', hasForm);

// Fill credentials
await page.fill('#authUser', USER).catch(e => log('   fill user FAIL', e.message));
await page.fill('#authPass', PASS).catch(e => log('   fill pass FAIL', e.message));

// Trigger a background setState-like event by calling Store.loadHealth via exposed Store
// to simulate the "instability" (field wipe). We'll instead just submit.
const beforeSubmit = await page.evaluate(() => {
  const u = document.getElementById('authUser'); const p = document.getElementById('authPass');
  return { u: u?.value, p: p?.value };
});
log('   before submit -> user:', JSON.stringify(beforeSubmit.u), '| pass present:', !!beforeSubmit.p);

// Click submit
await page.click('#authSubmit').catch(e => log('   click submit FAIL', e.message));

// Wait for redirect / app visible
await page.waitForTimeout(2500);

const afterState = await page.evaluate(() => {
  const app = document.getElementById('app');
  const o = document.getElementById('authOverlay');
  return {
    appVisible: app ? getComputedStyle(app).display !== 'none' : null,
    overlayHidden: o ? o.hidden : null,
    url: location.href,
    bodyHasKora: document.body.innerText.slice(0, 80),
  };
});
log('2) AFTER SUBMIT:');
log('   app visible:', afterState.appVisible);
log('   overlay hidden:', afterState.overlayHidden);
log('   url:', afterState.url);
log('   bodyText:', JSON.stringify(afterState.bodyHasKora));

// Now test the "field wipe on setState" instability: force a render() while on login
const wipeTest = await page.evaluate(async () => {
  // Go back to a logged-out state is hard; instead simulate by checking that
  // render() while logged out does NOT wipe if _authRendered. We proxy via Store.
  if (!window.Store) return { err: 'no Store' };
  // Simulate: set state then render -> overlay should stay, fields kept if login rendered
  const o = document.getElementById('authOverlay');
  const uBefore = document.getElementById('authUser');
  return { overlayHidden: o?.hidden, hasUserBefore: !!uBefore };
});
log('3) WIPE CHECK:', JSON.stringify(wipeTest));

log('CONSOLE ERRORS:', consoleErrors.length ? consoleErrors : 'none');

await browser.close();
