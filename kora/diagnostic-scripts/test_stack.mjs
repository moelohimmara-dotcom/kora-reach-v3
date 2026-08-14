import { chromium } from 'playwright';

const URL = 'https://213-156-135-139.sslip.io/kora-v2/#cockpit';
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();

// Capture l'erreur AVANT que le script ne s'exécute
await page.addInitScript(() => {
  window.__errs = [];
  window.addEventListener('error', (e) => {
    window.__errs.push((e.error && e.error.stack) ? e.error.stack : (e.message + ' @ ' + e.filename + ':' + e.lineno));
  });
  window.onerror = (msg, src, line, col, err) => {
    window.__errs.push((err && err.stack) ? err.stack : (msg + ' @ ' + src + ':' + line + ':' + col));
  };
});

page.setDefaultNavigationTimeout(0);
try { await page.goto(URL, { waitUntil: 'commit' }); } catch (e) {}
await page.waitForTimeout(6000);

const errs = await page.evaluate(() => window.__errs || []);
console.log('=== STACK TRACES (' + errs.length + ') ===');
console.log(errs.slice(0, 3).join('\n----\n') || '(aucune erreur capturée)');
await browser.close();
