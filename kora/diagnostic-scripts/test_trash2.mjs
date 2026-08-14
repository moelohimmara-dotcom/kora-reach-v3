import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const p = await (await b.newContext()).newPage();
await p.setViewportSize({ width: 1440, height: 900 });
let errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('https://213-156-135-139.sslip.io/kora-v2/#cockpit', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(()=>{});
await p.waitForTimeout(2500);
await p.fill('#authUser', 'admin').catch(()=>{});
await p.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME').catch(()=>{});
await p.click('#authSubmit').catch(()=>{});
await p.waitForTimeout(3500);
// Liste tous les éléments trash visibles/invisibles
const list = await p.evaluate(() => [...document.querySelectorAll('[data-route="trash"]')].map(e=>({
  route: e.dataset.route, visible: e.offsetParent !== null, hidden: e.hidden, label: e.textContent.trim()
})));
console.log('TRASH_ELS', JSON.stringify(list));
// Clique le 1er VISIBLE
const clicked = await p.evaluate(() => {
  const e = [...document.querySelectorAll('[data-route="trash"]')].find(x => x.offsetParent !== null && !x.hidden);
  if (e) { e.click(); return true; } return false;
});
console.log('CLICKED_VISIBLE', clicked);
await p.waitForTimeout(1500);
const info = await p.evaluate(() => ({ route: window.Store?.state?.route, h1: document.querySelector('h1')?.textContent, viewLen: document.getElementById('view')?.innerHTML.length||0 }));
console.log('AFTER', JSON.stringify(info));
console.log('ERR', JSON.stringify(errs.slice(0,5)));
await b.close().catch(()=>{});
process.exit(0);
