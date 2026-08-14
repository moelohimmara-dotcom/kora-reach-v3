import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const p = await (await b.newContext()).newPage();
let errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type()==='error') errs.push('C:'+m.text().slice(0,120)); });
await p.goto('https://213-156-135-139.sslip.io/kora-v2/#cockpit', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(()=>{});
await p.waitForTimeout(2500);
await p.fill('#authUser', 'admin').catch(()=>{});
await p.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME').catch(()=>{});
await p.click('#authSubmit').catch(()=>{});
await p.waitForTimeout(3500);
// Navigue Corbeille
await p.evaluate(() => { const e=[...document.querySelectorAll('[data-route]')].find(x=>x.dataset.route==='trash'); if(e) e.click(); });
await p.waitForTimeout(1500);
const info = await p.evaluate(() => ({
  route: window.Store?.state?.route,
  h1: document.querySelector('h1')?.textContent,
  viewLen: document.getElementById('view')?.innerHTML.length || 0,
  viewHead: document.getElementById('view')?.innerHTML.slice(0,300),
  navItems: [...document.querySelectorAll('[data-route]')].map(e=>e.dataset.route),
})).catch(e=>({err:e.message}));
console.log('TRASH', JSON.stringify(info, null, 1));
console.log('ERRORS', JSON.stringify(errs.slice(0,8)));
await b.close().catch(()=>{});
process.exit(0);
