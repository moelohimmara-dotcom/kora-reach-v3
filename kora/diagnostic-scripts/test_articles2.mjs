import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const p = await (await b.newContext()).newPage();
await p.setViewportSize({ width: 390, height: 844 });
await p.goto('https://213-156-135-139.sslip.io/kora-v2/#cockpit', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(()=>{});
await p.waitForTimeout(2500);
await p.fill('#authUser', 'admin').catch(()=>{});
await p.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME').catch(()=>{});
await p.click('#authSubmit').catch(()=>{});
await p.waitForTimeout(3500);
await p.evaluate(() => { const e=[...document.querySelectorAll('[data-route="facts"]')].find(x=>x.offsetParent!==null); if(e) e.click(); });
await p.waitForTimeout(1500);
const info = await p.evaluate(() => {
  const view = document.getElementById('view');
  const cards = [...document.querySelectorAll('.fact-card')];
  return {
    route: window.Store?.state?.route,
    viewLen: view?.innerHTML.length||0,
    nCards: cards.length,
    firstCard: cards[0]?.outerHTML?.slice(0, 1200),
    hasUndefined: view?.innerHTML.includes('undefined'),
  };
});
console.log(JSON.stringify(info, null, 1));
await b.close().catch(()=>{});
process.exit(0);
