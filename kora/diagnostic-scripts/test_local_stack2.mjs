import { chromium } from 'playwright';

const URL = 'http://localhost:8099/#cockpit';
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();

const errs = [];
page.on('pageerror', e => {
  // e.stack contient la vraie pile
  errs.push(e.stack || (e.message + '\n' + (e.stack||'')));
});
page.on('console', m => { if (m.type()==='error') errs.push('CONSOLE ' + m.text()); });

page.setDefaultNavigationTimeout(0);
try { await page.goto(URL, { waitUntil: 'commit' }); } catch (e) { console.log('goto warn:', e.message); }
await page.waitForTimeout(5000);

console.log('=== ERRORS (' + errs.length + ') ===');
console.log(errs.slice(0, 3).join('\n==========\n') || '(no errors captured)');
await browser.close();
