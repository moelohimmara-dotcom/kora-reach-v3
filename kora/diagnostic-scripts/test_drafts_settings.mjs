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

for (const [label, sel] of [['drafts','Brouillons'],['settings','Paramètres']]) {
  await p.evaluate((lab) => {
    const els = [...document.querySelectorAll('[data-route]')];
    const v = els.find(e => e.textContent.trim().toLowerCase().includes(lab.toLowerCase()));
    if (v) v.click();
  }, sel);
  await p.waitForTimeout(1500);
  const info = await p.evaluate(() => ({
    route: window.Store?.state?.route,
    h1: document.querySelector('h1')?.textContent,
    viewLen: document.getElementById('view')?.innerHTML.length,
    recInView: document.getElementById('view')?.innerHTML.includes('RECURSION'),
  })).catch(e => ({ err: e.message }));
  console.log(sel, '=>', JSON.stringify(info));
}
console.log('GLOBAL recursion=', rec);
await b.close().catch(()=>{});
process.exit(0);
