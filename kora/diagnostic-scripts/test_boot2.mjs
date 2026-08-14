import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext();
const logs = [];
ctx.on('console', m => logs.push('[' + m.type() + '] ' + m.text()));
await ctx.route('**/*', async (route) => {
  const resp = await route.fetch();
  const headers = { ...resp.headers(), 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' };
  await route.fulfill({ response: resp, headers });
});
const p = await ctx.newPage();
await p.addInitScript(() => { try { if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k))); } catch(e){} });
await p.setViewportSize({ width: 390, height: 844 });
// Scénario du USER : déjà connecté (cookie), on recharge la page -> boot -> checkAuth ok -> loadAll
await p.goto('https://213-156-135-139.sslip.io/kora-v2/#cockpit', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(()=>{});
await p.waitForTimeout(2500);
// Remplir login si proposé (au cas où pas de cookie)
const hasAuth = await p.evaluate(() => !!document.getElementById('authUser'));
if (hasAuth) {
  await p.fill('#authUser', 'admin').catch(()=>{});
  await p.fill('#authPass', process.env.KORA_TEST_PASS || 'CHANGE_ME').catch(()=>{});
  await p.click('#authSubmit').catch(()=>{});
}
// Attendre boot + loadAll (SANS clic)
await p.waitForTimeout(4000);
const info = await p.evaluate(() => {
  const st = window.Store ? window.Store.state : null;
  const cards = [...document.querySelectorAll('.stat-card')].map(c => ({
    label: c.querySelector('.stat-label')?.textContent?.trim(),
    value: c.querySelector('.stat-value')?.textContent?.trim(),
    loading: c.classList.contains('loading'),
  }));
  return {
    storeFacts: st ? (st.facts ? st.facts.length : 'n/a') : 'no Store',
    storeLoading: st ? st.ui?.loading : 'n/a',
    storeError: st ? st.ui?.error : 'n/a',
    loggedIn: st ? st.auth?.loggedIn : 'n/a',
    cards,
    articlesValue: cards[0]?.value,
  };
});
console.log('STATE', JSON.stringify(info, null, 1));
console.log('LOGS', JSON.stringify(logs.slice(-15), null, 1));
await b.close().catch(()=>{});
process.exit(0);
