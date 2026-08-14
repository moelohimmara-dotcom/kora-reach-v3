import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext();
await ctx.route('**/*', async (route) => {
  const resp = await route.fetch();
  const headers = { ...resp.headers(), 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' };
  await route.fulfill({ response: resp, headers });
});
const p = await ctx.newPage();
await p.addInitScript(() => { try { if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k))); } catch(e){} });
await p.setViewportSize({ width: 390, height: 844 });
await p.goto('https://213-156-135-139.sslip.io/kora-v2/#cockpit', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(()=>{});
await p.waitForTimeout(2500);
await p.fill('#authUser', 'admin').catch(()=>{});
await p.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME').catch(()=>{});
await p.click('#authSubmit').catch(()=>{});
await p.waitForTimeout(3500);
// 1) Filtre Transmis
await p.evaluate(() => { const c = document.querySelector('[data-action="nav-facts-approved"]'); if (c) c.click(); });
await p.waitForTimeout(2000);
const transmis = await p.evaluate(() => {
  const cards = [...document.querySelectorAll('.fact-card')];
  return cards.map(c => ({
    title: c.querySelector('.fact-title')?.textContent?.trim(),
    img: c.querySelector('.fact-img')?.getAttribute('src')?.slice(0,60),
  }));
});
console.log('TRANSMIS_CARDS', JSON.stringify(transmis, null, 1));
// 2) Ecran Brouillons
await p.evaluate(() => { const c = document.querySelector('[data-route="drafts"]'); if (c) c.click(); });
await p.waitForTimeout(2000);
const drafts = await p.evaluate(() => {
  const view = document.getElementById('view');
  return {
    route: window.Store?.state?.route,
    nCards: document.querySelectorAll('.fact-card').length,
    viewLen: view?.innerHTML.length || 0,
    hasStateBox: !!document.querySelector('.state-box'),
    bodyHead: view?.innerHTML.slice(0, 300),
  };
});
console.log('DRAFTS', JSON.stringify(drafts, null, 1));
await b.close().catch(()=>{});
process.exit(0);
