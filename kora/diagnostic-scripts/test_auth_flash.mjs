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
  // Attendre que le formulaire d'auth soit visible
  await p.waitForSelector('.auth-card', { timeout: 10000 });
  // Lire le style du formulaire (doit être sombre, pas blanc)
  const style = await p.evaluate(() => {
    const card = document.querySelector('.auth-card');
    const screen = document.querySelector('.auth-screen');
    const cs = card ? getComputedStyle(card) : null;
    const ss = screen ? getComputedStyle(screen) : null;
    return {
      cardBg: cs ? cs.backgroundColor : null,
      screenBg: ss ? ss.backgroundColor : null,
      visible: !!card,
    };
  });
  out.auth_style = style;
  // Vérifier que le logo n'est pas du texte "auto_awesome" brut (icône rendue)
  const logoText = await p.evaluate(() => {
    const wm = document.querySelector('.auth-wordmark');
    return wm ? wm.textContent.trim().slice(0, 30) : null;
  });
  out.logo_text = logoText;
  await p.screenshot({ path: 'kora_login.png' });
  out.SHOT_OK = true;
} catch (e) {
  out.TEST_ERROR = e && e.message;
} finally {
  await b.close().catch(()=>{});
}
console.log('AUTH', JSON.stringify(out, null, 1));
process.exit(0);
