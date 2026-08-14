import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext();
await ctx.route('**/*', async (route) => { const resp = await route.fetch(); await route.fulfill({ response: resp, headers: { ...resp.headers(), 'Cache-Control': 'no-store' } }); });
const p = await ctx.newPage();
await p.addInitScript(() => { try { if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k))); } catch (e) {} });
await p.setViewportSize({ width: 390, height: 844 });
await p.goto('https://213-156-135-139.sslip.io/kora-v2/#cockpit', { waitUntil: 'domcontentloaded', timeout: 20000 });
await p.waitForTimeout(2000);
if (await p.evaluate(() => !!document.getElementById('authUser'))) {
  await p.fill('#authUser', 'admin'); await p.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME'); await p.click('#authSubmit');
}
await p.waitForTimeout(4000);

// 1) Section Sources du dashboard cliquable -> nav sources
const clickOk = await p.evaluate(() => { const s = document.querySelector('.sources-section[data-nav="sources"]'); if (s) { s.click(); return true; } return false; });
await p.waitForTimeout(1500);
const routed = await p.evaluate(() => ({ route: window.Store?.state?.route, onSources: !!(document.querySelector('.src-row') || document.getElementById('view')?.innerHTML.includes('Gouvernance des sources')) }));
console.log('CLIC section Sources:', clickOk, '-> route:', routed.route, 'sur page Sources:', routed.onSources);

// 2) Alignement des .src-row (align-items: center)
const align = await p.evaluate(() => {
  const r = document.querySelector('.src-row');
  if (!r) return 'no-row';
  return getComputedStyle(r).alignItems;
});
console.log('align-items .src-row =', align, '(attendu: center)');

// 3) Toutes les lignes uniformes (même nb d'enfants)
const uniform = await p.evaluate(() => {
  const rows = [...document.querySelectorAll('.src-row')];
  const counts = rows.map(r => r.children.length);
  const min = Math.min(...counts), max = Math.max(...counts);
  return { n: rows.length, uniform: min === max, min, max };
});
console.log('Uniformité lignes:', JSON.stringify(uniform));

await b.close().catch(()=>{});
process.exit(0);
