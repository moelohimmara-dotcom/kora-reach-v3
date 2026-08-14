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
  // Aller sur Articles (route facts) où la bulle flottante de sélection apparaît
  await p.evaluate(() => { const n = document.querySelector('[data-route="facts"]'); if (n) n.click(); });
  await p.waitForTimeout(800);
  // Activer le mode sélection + sélectionner 1 carte
  await p.evaluate(() => { window.Store.setSelectMode(true); });
  await p.evaluate(() => { const c = document.querySelector('.fact-card'); if (c) c.click(); });
  await p.waitForTimeout(800);
  const bar = await p.evaluate(() => {
    const el = document.getElementById('selectBar');
    if (!el || el.hidden) return { visible: false };
    const btns = Array.from(el.querySelectorAll('.select-bar-actions .btn')).map(b => {
      const ic = b.querySelector('.ic');
      const span = b.querySelector('span');
      const r = b.getBoundingClientRect();
      const sr = span ? span.getBoundingClientRect() : null;
      return {
        label: span ? span.textContent.trim() : null,
        hasSpanVisible: span ? getComputedStyle(span).display !== 'none' : false,
        textAlign: span ? getComputedStyle(span).textAlign : null,
        w: Math.round(r.width), h: Math.round(r.height),
        labelW: sr ? Math.round(sr.width) : 0,
        btnW: Math.round(r.width),
        labelNoOverflow: span ? (span.scrollWidth <= span.clientWidth + 1) : true,
        icentered: ic ? (Math.abs((r.left + r.width/2) - (ic.getBoundingClientRect().left + ic.getBoundingClientRect().width/2)) < 2) : false,
      };
    });
    return { visible: true, count: document.getElementById('selectCount').textContent, buttons: btns };
  });
  out.select_bar = bar;
  await p.screenshot({ path: 'kora_selectbar.png' });
  out.SHOT_OK = true;
} catch (e) {
  out.TEST_ERROR = e && e.message;
} finally {
  await b.close().catch(()=>{});
}
console.log('SELECTBAR', JSON.stringify(out, null, 1));
process.exit(0);
