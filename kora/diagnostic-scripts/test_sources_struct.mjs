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
const info = await p.evaluate(() => {
  const groups = [...document.querySelectorAll('.fact-group')].map(g => ({
    title: g.querySelector('.group-title')?.textContent?.trim(),
    names: [...g.querySelectorAll('.src-row .name')].map(n => n.textContent.trim()),
  }));
  const guinee7Group = groups.find(g => g.names.some(n => /guinee\s*7/i.test(n)));
  return {
    groupTitles: groups.map(g => g.title),
    guinee7InGroup: guinee7Group?.title || 'introuvable',
    guinee7IsLastSection: groups.length ? groups[groups.length-1].title === guinee7Group?.title : false,
  };
});
console.log('SOURCES_STRUCT', JSON.stringify(info, null, 1));
await b.close().catch(()=>{});
process.exit(0);
