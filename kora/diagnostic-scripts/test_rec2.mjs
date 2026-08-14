import { chromium } from 'playwright';
import fs from 'fs';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const p = await (await b.newContext()).newPage();
let stack = '';
p.on('pageerror', e => { if (/RECURSION/.test(e.message) && !stack) stack = (e.message||'') + '\n' + (e.stack||''); });
await p.goto('https://213-156-135-139.sslip.io/kora-v2/#cockpit', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(()=>{});
await p.waitForTimeout(2500);
await p.fill('#authUser', 'admin').catch(()=>{});
await p.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME').catch(()=>{});
await p.click('#authSubmit').catch(()=>{});
await p.waitForTimeout(4000);
// Navigue sur chaque écran pour déclencher la récursion résiduelle
for (const r of ['facts','drafts','audit','settings','sources','cockpit']) {
  await p.evaluate((rr) => { const e=[...document.querySelectorAll('[data-route]')].find(x=>x.dataset.route===rr); if(e) e.click(); }, r);
  await p.waitForTimeout(800);
}
fs.writeFileSync(process.env.HOME + '/rec2.txt', stack);
console.log('STACK_LEN', stack.length);
console.log(stack.slice(0, 1800));
await b.close().catch(()=>{});
process.exit(0);
