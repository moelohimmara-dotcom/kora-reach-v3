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
// Click "Validation" nav by text via evaluate
await p.evaluate(() => {
  const els = [...document.querySelectorAll('[data-route]')];
  const v = els.find(e => e.textContent.trim().toLowerCase().includes('validation') || e.dataset.route === 'audit');
  if (v) v.click();
});
await p.waitForTimeout(1500);
const info = await p.evaluate(() => ({
  route: window.Store?.state?.route,
  h1: document.querySelector('h1')?.textContent,
  hasAuditView: !!document.querySelector('.audit-filters, .audit-row, .audit-day'),
  hasCockpit: !!document.querySelector('.stat-card'),
  viewLen: document.getElementById('view')?.innerHTML.length,
})).catch(e => ({ err: e.message }));
console.log('VALIDATION =>', JSON.stringify(info), 'recursion=', rec);
await b.close().catch(()=>{});
process.exit(0);
