import { chromium } from 'playwright';

const URL = 'http://localhost:8099/#cockpit';
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();

const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + (e.stack || e.message)));
page.on('console', m => { if (m.type()==='error') errs.push('CONSOLE: ' + m.text()); });

page.setDefaultNavigationTimeout(0);
try { await page.goto(URL, { waitUntil: 'commit' }); } catch (e) {}
await page.waitForTimeout(3000);

const btn = await page.evaluate(() => !!document.getElementById('authSubmit'));
console.log('login btn present:', btn);

if (btn) {
  await page.fill('#authUser', 'admin').catch(e=>console.log('fu',e.message));
  await page.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME').catch(e=>console.log('fp',e.message));
  console.log('=== clicking ===');
  await page.click('#authSubmit').catch(e=>console.log('clk',e.message));
  // poll for 18s to see if button text changes back / error appears
  for (let i=0;i<6;i++){
    await page.waitForTimeout(3000);
    const st = await page.evaluate(() => ({
      btnText: document.getElementById('authSubmit')?.textContent,
      btnDisabled: document.getElementById('authSubmit')?.disabled,
      overlayHidden: document.getElementById('authOverlay')?.hidden,
      appDisplay: document.getElementById('app')?.style.display,
      err: document.getElementById('authErr')?.textContent,
    }));
    console.log(`t+${((i+1)*3)}s:`, JSON.stringify(st));
  }
}
console.log('=== ERRORS ===');
console.log(errs.slice(0,8).join('\n----\n') || '(none)');
await browser.close();
