import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext();
// Bloque la police Material Icons pour SIMULER un chargement lent (cas prod où le flash apparaissait)
await ctx.route('**/*', async (route) => {
  const u = route.request().url();
  if (u.includes('material-icons') || u.includes('Material')) { return route.abort(); }
  try { const resp = await route.fetch(); await route.fulfill({ response: resp, headers: { ...resp.headers(), 'Cache-Control': 'no-store' } }); } catch (e) { await route.abort(); }
});
const p = await ctx.newPage();
await p.addInitScript(() => { try { if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k))); } catch (e) {} });
await p.setViewportSize({ width: 390, height: 844 });
const out = {};
try {
  await p.goto('https://213-156-135-139.sslip.io/kora-v2/#cockpit', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await p.waitForSelector('.pw-toggle[data-pw="authPass"]', { timeout: 10000 });
  // Police bloquée -> .material-icons doit rester MASQUÉ (visibility hidden), pas de texte "visibility" affiché
  out.eye_visibility_police_bloquee = await p.evaluate(() => {
    const btn = document.querySelector('.pw-toggle[data-pw="authPass"] .material-icons');
    return btn ? getComputedStyle(btn).visibility : 'NO_ICON';
  });
  // Le texte "visibility" dans le DOM doit être masqué (pas visible à l'écran)
  out.eye_text_content = await p.evaluate(() => {
    const btn = document.querySelector('.pw-toggle[data-pw="authPass"] .material-icons');
    return btn ? btn.textContent.trim() : null;
  });
  out.texte_visible_a_lecran = await p.evaluate(() => {
    const btn = document.querySelector('.pw-toggle[data-pw="authPass"] .material-icons');
    if (!btn) return false;
    const r = btn.getBoundingClientRect();
    // Si visibility:hidden, le rect est vide ou l'élément n'est pas peint
    return getComputedStyle(btn).visibility === 'visible' && r.width > 0;
  });
  await p.screenshot({ path: 'kora_login_eye_blocked.png' });
  out.SHOT_OK = true;
} catch (e) {
  out.TEST_ERROR = e && e.message;
} finally {
  await b.close().catch(()=>{});
}
console.log('EYE_BLOCKED', JSON.stringify(out, null, 1));
process.exit(0);
