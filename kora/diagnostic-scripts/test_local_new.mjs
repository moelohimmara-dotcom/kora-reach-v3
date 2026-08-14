import { chromium } from 'playwright';

const URL = 'http://localhost:8099/#cockpit';
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();

const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + (e.stack || e.message)));
page.on('console', m => { if (m.type()==='error') errs.push('CONSOLE: ' + m.text()); });

page.setDefaultNavigationTimeout(0);
try { await page.goto(URL, { waitUntil: 'commit' }); } catch (e) {}
await page.waitForTimeout(5000);

console.log('=== ERRORS (' + errs.length + ') ===');
console.log(errs.slice(0, 5).join('\n----\n') || '(none)');

// Try login
const diag = await page.evaluate(() => ({
  btn: !!document.getElementById('authSubmit'),
  overlayHidden: document.getElementById('authOverlay')?.hidden,
}));
console.log('DIAG:', JSON.stringify(diag));

if (diag.btn) {
  await page.fill('#authUser', 'admin').catch(e=>console.log('fu',e.message));
  await page.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME').catch(e=>console.log('fp',e.message));
  await page.click('#authSubmit').catch(e=>console.log('clk',e.message));
  await page.waitForTimeout(3000);
  const after = await page.evaluate(() => ({
    overlayHidden: document.getElementById('authOverlay')?.hidden,
    appDisplay: document.getElementById('app')?.style.display,
    errs2: window.__e2 || 'n/a',
  }));
  console.log('AFTER LOGIN:', JSON.stringify(after));
  console.log('ERRORS AFTER:', errs.slice(0,5).join('\n'));
}
await browser.close();
