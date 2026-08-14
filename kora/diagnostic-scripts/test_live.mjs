import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const logs = [];
page.on('pageerror', e => logs.push('PAGEERROR: ' + (e.message||'') + ' @ ' + (e.stack||'').split('\n').slice(0,3).join(' | ')));
page.on('console', m => { if(['error','warning'].includes(m.type())) logs.push(m.type().toUpperCase()+': '+m.text().slice(0,300)); });
// Ne PAS attendre le load : on capture les 8 premières secondes d'activité
page.goto('https://213-156-135-139.sslip.io/kora-v2/#cockpit', { waitUntil: 'commit', timeout: 8000 }).catch(()=>{});
await page.waitForTimeout(8000);
process.stdout.write('=== LIVE LOGS (8s) ===\n' + (logs.slice(0,12).join('\n') || '(none)') + '\n');
// Tentative de lire l'état auth après le délai
const st = await page.evaluate(() => ({
  overlayHidden: document.getElementById('authOverlay')?.hidden,
  appDisplay: document.getElementById('app')?.style.display,
  btnText: document.getElementById('authSubmit')?.textContent,
  viewHTMLlen: document.getElementById('view')?.innerHTML.length
})).catch(e => ({err: e.message}));
process.stdout.write('STATE: ' + JSON.stringify(st) + '\n');
await browser.close().catch(()=>{});
process.exit(0);
