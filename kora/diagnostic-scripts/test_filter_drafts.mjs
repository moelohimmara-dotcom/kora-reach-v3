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
// Aller sur l'ecran Articles d'abord
await p.evaluate(() => { const c = document.querySelector('[data-route="facts"]'); if (c) c.click(); });
await p.waitForTimeout(1500);
// Cliquer le filtre "Brouillons" dans la barre de filtres Articles (data-fact-filter="drafts")
const clicked = await p.evaluate(() => {
  const c = document.querySelector('[data-fact-filter="drafts"]');
  if (c) { c.click(); return true; } return false;
});
await p.waitForTimeout(2000);
const info = await p.evaluate((clicked) => {
  const view = document.getElementById('view');
  return {
    clicked,
    activeFilter: document.querySelector('.filter-pill.active')?.dataset?.factFilter || 'none',
    nCards: document.querySelectorAll('.fact-card').length,
    hasEmpty: !!document.querySelector('.group-empty'),
    hasUndefined: view?.innerHTML.includes('undefined'),
    viewLen: view?.innerHTML.length || 0,
    titles: [...document.querySelectorAll('.fact-title')].map(t => t.textContent.trim()).slice(0,5),
  };
});
console.log('RESULT', JSON.stringify(info, null, 1));
await p.screenshot({ path: 'kora_filter_drafts.png', fullPage: true });
await b.close().catch(()=>{});
process.exit(0);
