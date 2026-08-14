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
await p.waitForFunction(() => (window.Store?.state?.sources || []).length > 0, { timeout: 10000 }).catch(()=>{});
await p.waitForTimeout(800);
// 1) Clic sur le TITRE de la section
const clickTitle = await p.evaluate(() => { const s = document.querySelector('.sources-section[data-nav="sources"] .section-title'); if (s) { s.click(); return true; } return false; });
await p.waitForTimeout(800);
const routeAfterTitle = await p.evaluate(() => window.Store?.state?.route);
console.log('Clic titre ->', clickTitle, '| route:', routeAfterTitle);
// Revenir au dashboard
await p.evaluate(() => document.querySelector('[data-route="cockpit"]')?.click());
await p.waitForTimeout(800);
// 2) Clic sur un CHIP (source) dans la bulle
const clickChip = await p.evaluate(() => { const c = document.querySelector('.sources-section[data-nav="sources"] .source-chip'); if (c) { c.click(); return true; } return false; });
await p.waitForTimeout(800);
const routeAfterChip = await p.evaluate(() => window.Store?.state?.route);
const onSourcesPage = await p.evaluate(() => !!document.querySelector('.src-row') || document.getElementById('view')?.innerHTML.includes('Gouvernance des sources'));
console.log('Clic chip ->', clickChip, '| route:', routeAfterChip, '| page Sources:', onSourcesPage);
await b.close().catch(()=>{});
process.exit(0);
