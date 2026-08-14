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
  const fid = await p.evaluate(() => (window.Store.state.facts[0] || {}).fact_id);
  out.fid = fid;
  out.article_before_len = await p.evaluate((fid) => {
    const f = (window.Store.state.facts || []).find(x => x.fact_id === fid);
    return (f && f.article ? f.article.length : 0);
  }, fid);
  // Appel de la VRAIE fonction Store.regenerate (câblage identique au bouton Régénérer)
  const res = await p.evaluate(async (fid) => {
    return await window.Store.regenerate(fid, 'social');
  }, fid);
  out.regen_status = res.status;
  out.regen_error = res.error || null;
  out.regen_model = res.model || null;
  out.regen_suggestion = res.suggestion_applied || null;
  out.regen_article_len = (res.article || '').length;
  await p.waitForTimeout(1000);
  out.article_after_len = await p.evaluate((fid) => {
    const f = (window.Store.state.facts || []).find(x => x.fact_id === fid);
    return (f && f.article ? f.article.length : 0);
  }, fid);
} catch (e) {
  out.TEST_ERROR = e && e.message;
} finally {
  await b.close().catch(()=>{});
}
console.log('REGEN', JSON.stringify(out, null, 1));
process.exit(0);
