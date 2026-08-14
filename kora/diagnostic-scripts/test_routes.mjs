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

const routes = ['cockpit','facts','drafts','trash','sources','audit','settings'];
for (const r of routes) {
  await p.evaluate((rr) => { location.hash = '#' + rr; }, r);
  await p.waitForTimeout(1500);
  const info = await p.evaluate(() => ({
    rec: document.getElementById('view')?.innerHTML.includes('RECURSION'),
    len: document.getElementById('view')?.innerHTML.length || 0,
    title: document.querySelector('h1')?.textContent,
  })).catch(e => ({ err: e.message }));
  console.log(r, '=>', JSON.stringify(info));
}
console.log('GLOBAL recursionError=', rec);
await b.close().catch(()=>{});
process.exit(0);
