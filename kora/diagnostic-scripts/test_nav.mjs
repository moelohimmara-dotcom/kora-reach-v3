import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext();
await ctx.route('**/*', async (route) => { const resp = await route.fetch(); await route.fulfill({ response: resp, headers: { ...resp.headers(), 'Cache-Control': 'no-store' } }); });
const p = await ctx.newPage();
await p.addInitScript(() => { try { if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k))); } catch (e) {} });
await p.setViewportSize({ width: 390, height: 844 });
try {
  await p.goto('https://213-156-135-139.sslip.io/kora-v2/#cockpit', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.waitForTimeout(2000);
  if (await p.evaluate(() => !!document.getElementById('authUser'))) {
    await p.fill('#authUser', 'admin'); await p.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME'); await p.click('#authSubmit');
  }
  await p.waitForFunction(() => !!window.Store?.state?.auth?.loggedIn, { timeout: 10000 }).catch(()=>{});
  await p.waitForTimeout(1000);
  // Bottom nav : compter les items visibles
  const nav = await p.evaluate(() => {
    const items = [...document.querySelectorAll('.bottomnav .navitem')].filter(n => !n.hidden);
    return { count: items.length, labels: items.map(n => n.querySelector('span')?.textContent?.trim()) };
  });
  console.log('BOTTOMNAV', JSON.stringify(nav));
  // Cliquer Plus -> drawer s'ouvre
  await p.evaluate(() => document.querySelector('.bottomnav [data-plus]')?.click());
  await p.waitForTimeout(600);
  const drawer = await p.evaluate(() => {
    const d = document.getElementById('rightDrawer');
    const open = d && !d.hidden;
    const items = d ? [...d.querySelectorAll('.navitem')].map(n => n.querySelector('span')?.textContent?.trim()) : [];
    return { open, items };
  });
  console.log('DRAWER', JSON.stringify(drawer));
} catch (e) {
  console.log('TEST_ERROR', e.message);
} finally {
  await b.close().catch(()=>{});
}
process.exit(0);
