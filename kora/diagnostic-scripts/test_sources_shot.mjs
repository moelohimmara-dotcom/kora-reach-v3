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
await p.evaluate(() => document.querySelector('[data-route="sources"]')?.click());
await p.waitForTimeout(1500);
await p.screenshot({ path: 'kora_sources_fixed.png', fullPage: false });
await b.close().catch(()=>{});
process.exit(0);
