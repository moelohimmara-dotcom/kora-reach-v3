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
// Attendre que les sources soient chargées (loadAll)
await p.waitForFunction(() => (window.Store?.state?.sources || []).length > 0, { timeout: 10000 }).catch(()=>{});
await p.waitForTimeout(500);
// Lire la section Sources du dashboard
const dash = await p.evaluate(() => {
  const sec = document.querySelector('.sources-section');
  if (!sec) return { found: false };
  const chips = [...sec.querySelectorAll('.source-chip')];
  const computed = getComputedStyle(sec.querySelector('.source-chips') || sec);
  return {
    found: true,
    nChips: chips.length,
    chipsText: chips.map(c => c.textContent.trim()),
    display: computed.display,
    flexWrap: computed.flexWrap,
    html: sec.outerHTML.slice(0, 600),
  };
});
console.log('DASHBOARD_SOURCES', JSON.stringify(dash, null, 1));

// Aussi lire l'écran Sources complet
await p.evaluate(() => document.querySelector('[data-route="sources"]')?.click());
await p.waitForTimeout(1500);
const scr = await p.evaluate(() => {
  const rows = [...document.querySelectorAll('.src-row')];
  const other = [...document.querySelectorAll('.fact-group')].map(g => g.querySelector('.group-title')?.textContent?.trim());
  return { nRows: rows.length, groupTitles: other, displayRow: rows[0] ? getComputedStyle(rows[0]).display : 'none' };
});
console.log('SCREEN_SOURCES', JSON.stringify(scr, null, 1));
await b.close().catch(()=>{});
process.exit(0);
