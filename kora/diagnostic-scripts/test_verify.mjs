import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const p = await (await b.newContext()).newPage();
let rec = false;
p.on('pageerror', e => { if (/RECURSION/.test(e.message)) rec = true; });
await p.goto('https://213-156-135-139.sslip.io/kora-v2/#cockpit', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(()=>{});
await p.waitForTimeout(2500);
await p.fill('#authUser', 'admin').catch(()=>{});
await p.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME').catch(()=>{});
await p.click('#authSubmit').catch(()=>{});
await p.waitForTimeout(3000);
await p.click('text=Articles', { timeout: 5000 }).catch(e => console.log('clerr', e.message));
await p.waitForTimeout(2500);
const info = await p.evaluate(() => ({
  rec: document.getElementById('view')?.innerHTML.includes('RECURSION'),
  len: document.getElementById('view')?.innerHTML.length || 0,
  hasFilter: !!document.querySelector('.filter-pill'),
  title: document.querySelector('h1')?.textContent,
})).catch(e => ({ err: e.message }));
console.log('ARTICLES VIEW:', JSON.stringify(info), 'recursionError=', rec);
await b.close().catch(()=>{});
process.exit(0);
