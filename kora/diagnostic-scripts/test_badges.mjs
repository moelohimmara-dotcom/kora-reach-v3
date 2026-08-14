import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext();
await ctx.route('**/*', async (route) => { try { const resp = await route.fetch(); await route.fulfill({ response: resp, headers: { ...resp.headers(), 'Cache-Control': 'no-store' } }); } catch (e) { await route.abort(); } });
const p = await ctx.newPage();
await p.addInitScript(() => { try { if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k))); } catch (e) {} });
await p.setViewportSize({ width: 390, height: 844 });
try {
  await p.goto('https://213-156-135-139.sslip.io/kora-v2/#cockpit', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.waitForTimeout(2000);
  if (await p.evaluate(() => !!document.getElementById('authUser'))) {
    await p.fill('#authUser', 'admin'); await p.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME'); await p.click('#authSubmit');
  }
  await p.waitForFunction(() => (window.Store?.state?.facts || []).length > 0, { timeout: 12000 }).catch(()=>{});
  await p.waitForTimeout(800);
  const badges = await p.evaluate(() => {
    const out = {};
    document.querySelectorAll('[data-badge]').forEach(el => {
      const k = el.getAttribute('data-badge');
      out[k] = el.textContent.trim();
    });
    return out;
  });
  console.log('BADGES', JSON.stringify(badges));
  await p.screenshot({ path: 'kora_badges.png' });
  console.log('SHOT_OK');
} catch (e) {
  console.log('TEST_ERROR', e && e.message);
} finally {
  await b.close().catch(()=>{});
}
process.exit(0);
