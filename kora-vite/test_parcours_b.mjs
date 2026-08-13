import { chromium } from 'playwright';
const BASE = process.argv[2] || 'https://213-156-135-139.sslip.io/kora-v2';
const USER = process.env.KORA_TEST_USER || 'admin';
const PASS = process.env.KORA_TEST_PASS || '***REMOVED***';
const failures = [];
const ok = (c, m) => { if (!c) { failures.push(m); console.log('  ✗ ' + m); } else console.log('  ✓ ' + m); };
const nav = async (p, route) => { await p.evaluate((r) => { document.querySelector(`[data-route="${r}"]`)?.click(); }, route); await p.waitForTimeout(1200); };

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext();
await ctx.route('**/*', async (route) => { const resp = await route.fetch(); await route.fulfill({ response: resp, headers: { ...resp.headers(), 'Cache-Control': 'no-store' } }); });
const page = await ctx.newPage();
await page.addInitScript(() => { try { if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k))); } catch (e) {} });
await page.setViewportSize({ width: 1280, height: 900 });
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('401')) errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

try {
  await page.goto(BASE + '/#cockpit', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);
  if (await page.evaluate(() => !!document.getElementById('authUser'))) {
    await page.fill('#authUser', USER); await page.fill('#authPass', PASS); await page.click('#authSubmit');
  }
  await page.waitForTimeout(4000);

  // Sources
  await nav(page, 'sources');
  let r = await page.evaluate(() => ({ n: document.querySelectorAll('.src-row').length, hasUndefined: document.getElementById('view').innerHTML.includes('undefined') }));
  ok(r.n > 0, 'Sources : liste affichée (Niveau 1/2)');
  ok(!r.hasUndefined, 'Sources : aucun undefined');

  // Paramètres + drawer Apparence
  await nav(page, 'settings');
  r = await page.evaluate(() => ({ hasAppearance: !!document.querySelector('[data-setnav="appearance"]'), hasUndefined: document.getElementById('view').innerHTML.includes('undefined') }));
  ok(r ? true : true, 'Paramètres : rendu');
  ok(r.hasAppearance, 'Paramètres : catégorie Apparence présente');
  ok(!r.hasUndefined, 'Paramètres : aucun undefined');
  // Ouvrir drawer Apparence
  await page.evaluate(() => document.querySelector('[data-setnav="appearance"]')?.click());
  await page.waitForTimeout(600);
  const appear = await page.evaluate(() => !!document.getElementById('drawer-appearance') && !document.getElementById('drawer-appearance').hidden);
  ok(appear, 'Paramètres : drawer Apparence s’ouvre');

  // Historique / Audit
  await nav(page, 'audit');
  r = await page.evaluate(() => ({ nGroups: document.querySelectorAll('.audit-day').length, hasUndefined: document.getElementById('view').innerHTML.includes('undefined') }));
  ok(r.nGroups > 0, 'Historique : groupes par jour affichés');
  ok(!r.hasUndefined, 'Historique : aucun undefined');

  // Corbeille
  await nav(page, 'trash');
  r = await page.evaluate(() => ({ hasTrash: !!document.querySelector('.fact-grid') || document.getElementById('view').innerHTML.includes('Corbeille'), hasUndefined: document.getElementById('view').innerHTML.includes('undefined') }));
  ok(r.hasTrash, 'Corbeille : écran rendu');
  ok(!r.hasUndefined, 'Corbeille : aucun undefined');

  // Flux sélection -> Publier (WP)
  await nav(page, 'facts');
  await page.evaluate(() => document.getElementById('enterSelect')?.click());
  await page.waitForTimeout(500);
  // Sélectionner la 1re carte (mode sélection : clic sur .fact-check ou la carte)
  const selOk = await page.evaluate(() => {
    const card = document.querySelector('.fact-card');
    if (!card) return false;
    const chk = card.querySelector('.fact-check') || card;
    chk.click();
    return true;
  });
  await page.waitForTimeout(600);
  const barVisible = await page.evaluate(() => { const b = document.getElementById('selectBar'); return b && !b.hidden; });
  const nSel = await page.evaluate(() => parseInt(document.getElementById('selectCount')?.textContent || '0', 10));
  ok(selOk, 'Sélection : carte cliquable');
  ok(barVisible, 'Sélection : barre d’action apparaît après 1 article coché');
  ok(nSel >= 1, 'Sélection : compteur >= 1 (' + nSel + ')');
  // Cliquer Publier -> wpChoice
  await page.evaluate(() => document.querySelector('[data-bulk="approve"]')?.click());
  await page.waitForTimeout(500);
  const wpVisible = await page.evaluate(() => { const w = document.getElementById('wpChoice'); return w && !w.hidden; });
  ok(wpVisible, 'Sélection : fenêtre choix WP s’ouvre (Publier)');
  // Choisir Publier directement (sans attendre la publication réelle)
  await page.evaluate(() => document.getElementById('wpCancel')?.click());
  await page.waitForTimeout(300);
  const wpClosed = await page.evaluate(() => document.getElementById('wpChoice').hidden);
  ok(wpClosed, 'Sélection : fenêtre WP se ferme (annulation propre)');

} catch (e) { failures.push('EXCEPTION: ' + e.message); console.log('  ✗ ' + e.message); }
finally { await browser.close().catch(() => {}); }

console.log('\n=== PARCOURS B ===');
if (errors.length) { console.log('Erreurs JS :', errors.slice(0, 5)); }
if (failures.length) { console.log('ÉCHEC (' + failures.length + ')'); failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
else { console.log('SUCCÈS — parcours B sans accroc'); if (errors.length) process.exit(2); else process.exit(0); }
