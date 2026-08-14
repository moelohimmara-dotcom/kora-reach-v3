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
  // Au 1er paint (avant fonts.ready) : le .material-icons doit être MASQUÉ (visibility hidden)
  await p.waitForSelector('.pw-toggle[data-pw="authPass"]', { timeout: 10000 });
  out.eye_visibility_firstpaint = await p.evaluate(() => {
    const btn = document.querySelector('.pw-toggle[data-pw="authPass"] .material-icons');
    return btn ? getComputedStyle(btn).visibility : 'NO_ICON';
  });
  out.html_has_icons_ready_class = await p.evaluate(() => document.documentElement.classList.contains('icons-ready'));
  // Attendre la police (reveal) puis revérifier
  await p.waitForTimeout(2500);
  out.eye_visibility_after = await p.evaluate(() => {
    const btn = document.querySelector('.pw-toggle[data-pw="authPass"] .material-icons');
    return btn ? getComputedStyle(btn).visibility : 'NO_ICON';
  });
  out.html_has_icons_ready_after = await p.evaluate(() => document.documentElement.classList.contains('icons-ready'));
  // Le texte "visibility" doit être masqué (pas visible à l'écran) -> on vérifie que l'icône est rendue (visibility visible) et non du texte brut
  await p.screenshot({ path: 'kora_login_eye2.png' });
  out.SHOT_OK = true;
} catch (e) {
  out.TEST_ERROR = e && e.message;
} finally {
  await b.close().catch(()=>{});
}
console.log('EYE', JSON.stringify(out, null, 1));
process.exit(0);
