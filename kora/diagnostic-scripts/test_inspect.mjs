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
  out.inspect = await p.evaluate(() => {
    const s = window.Store.state;
    const facts = s.facts || [];
    const trash = s.trash || [];
    const fTrashed = facts.filter(f => (f.trashed_at && f.trashed_at !== '') || (s.decisions[f.fact_id] === 'TRASHED') || f.status === 'TRASHED').length;
    const tStruct = trash.slice(0,2).map(f => ({ has_trash_at: !!(f.trashed_at && f.trashed_at!==''), status: f.status, decision: s.decisions[f.fact_id] }));
    return {
      facts_len: facts.length,
      trash_len: trash.length,
      facts_with_trash_marker: fTrashed,
      sample_trash: tStruct,
      facts_statuses: [...new Set(facts.map(f => f.status))],
      facts_with_decision_TRASHED: facts.filter(f => s.decisions[f.fact_id]==='TRASHED').length,
    };
  });
} catch (e) { out.TEST_ERROR = e && e.message; } finally { await b.close().catch(()=>{}); }
console.log('INSPECT', JSON.stringify(out, null, 1));
process.exit(0);
