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
// Aller sur Articles
await p.evaluate(() => { const c = document.querySelector('[data-route="facts"]'); if (c) c.click(); });
await p.waitForTimeout(2000);
const info = await p.evaluate(() => {
  const view = document.getElementById('view');
  const groups = [...document.querySelectorAll('.day-group')].map(g => {
    const title = g.querySelector('.group-title')?.textContent?.trim() || '';
    const count = g.querySelector('.group-count')?.textContent?.trim() || '';
    const cards = g.querySelectorAll('.fact-card').length;
    return { title, count, cards };
  });
  return {
    nDayGroups: groups.length,
    groups,
    nCardsTotal: document.querySelectorAll('.fact-card').length,
    hasUndefined: view?.innerHTML.includes('undefined'),
    hasNaN: view?.innerHTML.includes('NaN'),
    hasDateInconnue: !!document.querySelector('.day-group .group-title')?.textContent?.includes('Date inconnue'),
  };
});
console.log('RESULT', JSON.stringify(info, null, 1));
await p.screenshot({ path: 'kora_byday.png', fullPage: true });
await b.close().catch(()=>{});
process.exit(0);
