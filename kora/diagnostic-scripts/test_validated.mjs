import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext();
await ctx.route('**/*', async (route) => {
  const resp = await route.fetch();
  const headers = { ...resp.headers(), 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' };
  await route.fulfill({ response: resp, headers });
});
const p = await ctx.newPage();
p.on('console', msg => { if (msg.text().includes('VIEWFACTS_DEBUG')) console.log('PAGE_LOG', msg.text()); });
await p.addInitScript(() => { try { if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k))); } catch(e){} });
await p.setViewportSize({ width: 390, height: 844 });
await p.goto('https://213-156-135-139.sslip.io/kora-v2/#cockpit', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(()=>{});
await p.waitForTimeout(2500);
await p.fill('#authUser', 'admin').catch(()=>{});
await p.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME').catch(()=>{});
await p.click('#authSubmit').catch(()=>{});
await p.waitForTimeout(3500);
const clicked = await p.evaluate(() => {
  const c = document.querySelector('[data-action="nav-facts-approved"]');
  if (c) { c.click(); return true; } return false;
});
await p.waitForTimeout(2500);
const info = await p.evaluate(() => {
  const view = document.getElementById('view');
  return {
    route: window.Store?.state?.route,
    filter: window.Store?.getFactFilter ? window.Store.getFactFilter() : '?',
    viewLen: view?.innerHTML.length || 0,
    hasUndefined: view?.innerHTML.includes('undefined'),
    nCards: document.querySelectorAll('.fact-card').length,
    activeFilter: document.querySelector('.filter-pill.active')?.dataset?.factFilter || 'none',
  };
});
console.log('CLICKED', clicked);
console.log('RESULT', JSON.stringify(info, null, 1));
await p.screenshot({ path: 'kora_validated.png', fullPage: false });
await b.close().catch(()=>{});
process.exit(0);
