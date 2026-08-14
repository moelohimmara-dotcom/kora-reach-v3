import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext();
await ctx.route('**/*', async (route) => { try { const resp = await route.fetch(); await route.fulfill({ response: resp, headers: { ...resp.headers(), 'Cache-Control': 'no-store' } }); } catch (e) { await route.abort(); } });
const p = await ctx.newPage();
await p.addInitScript(() => { try { if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k))); } catch (e) {} });
await p.setViewportSize({ width: 390, height: 844 });
const out = {};
try {
  await p.goto('https://213-156-135-139.sslip.io/kora-v2/#cockpit', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.waitForTimeout(2000);
  if (await p.evaluate(() => !!document.getElementById('authUser'))) {
    await p.fill('#authUser', 'admin'); await p.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME'); await p.click('#authSubmit');
  }
  await p.waitForFunction(() => (window.Store?.state?.facts || []).length > 0, { timeout: 12000 }).catch(()=>{});
  await p.waitForTimeout(800);
  // Ouvrir le sheet via l'API (comme le ferait le clic carte)
  await p.evaluate(() => { const f = window.Store.state.facts[0]; window.Store.openSheet({ type: 'fact', fact: f }); });
  await p.waitForTimeout(600);
  out.has_regen_button = await p.evaluate(() => !!document.querySelector('[data-regen]'));
  // Cliquer Régénérer -> panneau s'ouvre
  await p.evaluate(() => document.querySelector('[data-regen]')?.click());
  await p.waitForTimeout(1200);
  out.panel_open = await p.evaluate(() => { const el = document.getElementById('regenPanel'); return !!(el && !el.hidden); });
  out.suggestion_chips = await p.evaluate(() => document.querySelectorAll('#regenChips .regen-chip').length);
} catch (e) {
  out.TEST_ERROR = e && e.message;
} finally {
  await b.close().catch(()=>{});
}
console.log('REGEN_WIRE', JSON.stringify(out, null, 1));
process.exit(0);
