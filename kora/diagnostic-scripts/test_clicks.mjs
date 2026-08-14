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

// Click each nav button by data-route using evaluate (bypasses visibility issues)
const routes = ['facts','drafts','trash','sources','audit','settings','cockpit'];
for (const r of routes) {
  await p.evaluate((rr) => {
    const el = document.querySelector(`[data-route="${rr}"]`);
    if (el) el.click();
  }, r);
  await p.waitForTimeout(1500);
  const info = await p.evaluate(() => ({
    rec: document.getElementById('view')?.innerHTML.includes('RECURSION'),
    title: document.querySelector('h1')?.textContent,
    active: document.querySelector('.navitem.active, .rail .navitem.active')?.dataset?.route,
  })).catch(e => ({ err: e.message }));
  console.log(r, '=>', JSON.stringify(info));
}
console.log('GLOBAL recursionError=', rec);
await b.close().catch(()=>{});
process.exit(0);
