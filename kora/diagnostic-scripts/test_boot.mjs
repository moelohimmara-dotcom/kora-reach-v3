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
// Nouvelle session : on efface cookies pour forcer le boot complet (deja connecte via cookie, mais on teste le boot de la page)
await p.goto('https://213-156-135-139.sslip.io/kora-v2/#cockpit', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(()=>{});
await p.waitForTimeout(2500);
await p.fill('#authUser', 'admin').catch(()=>{});
await p.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME').catch(()=>{});
await p.click('#authSubmit').catch(()=>{});
// Attendre le boot + loadAll (SANS clic)
await p.waitForTimeout(4000);
const info = await p.evaluate(() => {
  const cards = [...document.querySelectorAll('.stat-card')].map(c => ({
    label: c.querySelector('.stat-label')?.textContent?.trim(),
    value: c.querySelector('.stat-value')?.textContent?.trim(),
    loading: c.classList.contains('loading'),
  }));
  return {
    nCards: cards.length,
    cards,
    // Compteur Articles (1ere carte)
    articlesValue: cards[0]?.value,
    articlesLoading: cards[0]?.loading,
  };
});
console.log('RESULT', JSON.stringify(info, null, 1));
await p.screenshot({ path: 'kora_boot.png', fullPage: false });
await b.close().catch(()=>{});
process.exit(0);
