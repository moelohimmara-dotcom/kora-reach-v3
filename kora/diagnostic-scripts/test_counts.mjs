import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext();
await ctx.route('**/*', async (route) => { try { const resp = await route.fetch(); await route.fulfill({ response: resp, headers: { ...resp.headers(), 'Cache-Control': 'no-store' } }); } catch (e) { await route.abort(); } });
const p = await ctx.newPage();
const consoleErrors = [];
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(m.text()); });
p.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + e.message));
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
  // Aller sur Articles
  await p.evaluate(() => { const n = document.querySelector('[data-route="facts"]'); if (n) n.click(); });
  await p.waitForFunction(() => (window.Store?.state?.facts || []).length >= 78, { timeout: 12000 }).catch(()=>{});
  // Attente longue SANS forcer de render : l'app doit se stabiliser naturellement
  await p.waitForTimeout(20000);
  // Lire les compteurs des filtres (état stabilisé)
  const c = await p.evaluate(() => {
    const s = window.Store.state;
    const facts = s.facts || [];
    const pills = Array.from(document.querySelectorAll('.filter-pill')).map(el => ({
      k: el.getAttribute('data-fact-filter'),
      n: parseInt(el.querySelector('.pill-n')?.textContent || '0', 10)
    }));
    const note = document.querySelector('.filter-note');
    // Diagnostic : statuts uniques + catégorisation directe (recrée factCategory)
    const statuses = {};
    for (const f of facts) statuses[f.status] = (statuses[f.status]||0)+1;
    const cats = {};
    for (const f of facts) {
      let cat = 'pending';
      if ((f.trashed_at && f.trashed_at !== '') || f.status === 'TRASHED') cat = 'trash';
      else if (f.status === 'TRANSMITTED' || f.status === 'APPROVED') cat = 'transmitted';
      else if (f.status === 'REJECTED') cat = 'rejected';
      else if (f.status === 'EDITED') cat = 'draft';
      cats[cat] = (cats[cat]||0)+1;
    }
    return { facts_len: facts.length, pills, note: note ? note.textContent.trim() : null, statuses, cats };
  });
  out.filters = c;
  // Somme des catégories exclusives
  const sum = c.pills.filter(p => p.k !== 'all').reduce((a, x) => a + x.n, 0);
  const all = c.pills.find(p => p.k === 'all')?.n || 0;
  out.sum_categories = sum;
  out.all = all;
  out.exclusive_ok = (sum === all);
  // Tester clic "Corbeille"
  const trashPill = await p.evaluate(() => { const el = document.querySelector('[data-fact-filter="trash"]'); if (el) { el.click(); return true; } return false; });
  await p.waitForTimeout(600);
  out.postClickStatuses = await p.evaluate(() => {
    const s = {};
    for (const f of (window.Store.state.facts || [])) s[f.status] = (s[f.status]||0)+1;
    return { facts_len: (window.Store.state.facts||[]).length, statuses: s };
  });
  out.inspect_api = await p.evaluate(async () => {
    try {
      const r = await fetch('/kora-v2/api/hitl', { credentials: 'same-origin' });
      const data = await r.json();
      const arr = Array.isArray(data) ? data : (data.facts || []);
      const ids = arr.map(f => f.fact_id);
      const dup = ids.length - new Set(ids).size;
      const statuses = {};
      for (const f of arr) statuses[f.status] = (statuses[f.status]||0)+1;
      return { api_count: arr.length, unique_ids: new Set(ids).size, duplicates: dup, statuses, store_facts_len: window.Store.state.facts.length };
    } catch (e) { return { error: e.message }; }
  });
  out.SHOT_OK = true;
  // DEBUG : lire le HTML produit par viewFacts(Store.state) pour voir le vrai comptage
  out.htmlProbe = await p.evaluate(() => {
    try {
      if (window.Store.setFactFilter) window.Store.setFactFilter('all');
      const html = globalThis.__viewFacts(window.Store.state);
      const div = document.createElement('div');
      div.innerHTML = html;
      const nums = {};
      for (const el of div.querySelectorAll('.filter-pill')) {
        const k = el.getAttribute('data-fact-filter');
        const n = parseInt(el.querySelector('.pill-n')?.textContent || '0', 10);
        nums[k] = n;
      }
      return { nums, total_note: (html.match(/la somme des filtres égale le total \((\d+)\)/)||[])[1] || null };
    } catch (e) { return { error: e.message }; }
  });
  out.renderCount = await p.evaluate(() => window.__renderCount || 0);
  out.consoleErrors = consoleErrors.slice(0, 10);
} catch (e) {
  out.TEST_ERROR = e && e.message;
} finally {
  await b.close().catch(()=>{});
}
console.log('COUNTS', JSON.stringify(out, null, 1));
process.exit(0);
