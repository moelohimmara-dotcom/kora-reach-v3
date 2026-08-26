/**
 * smoke_test.mjs — Test de non-régression KORA Reach
 * Usage : node smoke_test.mjs [URL_BASE]
 * Exécute un parcours critique et échoue (exit 1) si une régression est détectée.
 * Conçu pour tourner après chaque déploiement (VPS : TMPDIR=$HOME/tmp).
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'https://213-156-135-139.sslip.io/kora-v2';
// SECURITE (2026-08-26, incident reel : un mot de passe admin en dur ici
// est reste visible dans l'historique git meme apres suppression du fichier
// -- voir commit bde9bec, purge de securite du 2026-08-23). Plus JAMAIS de
// valeur de repli en dur : ces variables DOIVENT venir de l'environnement,
// jamais du code. Echec explicite immediat si absentes, plutot qu'un repli
// silencieux vers un identifiant qui finirait, tot ou tard, par re-fuiter.
const USER = process.env.KORA_TEST_USER;
const PASS = process.env.KORA_TEST_PASS;
if (!USER || !PASS) {
  console.error('ERREUR: KORA_TEST_USER et KORA_TEST_PASS doivent être définis dans l\'environnement (jamais en dur dans ce fichier).');
  process.exit(1);
}
const failures = [];
const ok = (cond, msg) => { if (!cond) { failures.push(msg); console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext();
// Cache désactivé : on teste toujours le build fraîchement déployé
await ctx.route('**/*', async (route) => {
  const resp = await route.fetch();
  const headers = { ...resp.headers(), 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' };
  await route.fulfill({ response: resp, headers });
});
const page = await ctx.newPage();
await page.addInitScript(() => { try { if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k))); } catch (e) {} });
await page.setViewportSize({ width: 1280, height: 900 });

try {
  // 1) Auth
  await page.goto(BASE + '/#cockpit', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);
  const needLogin = await page.evaluate(() => !!document.getElementById('authUser'));
  if (needLogin) {
    await page.fill('#authUser', USER);
    await page.fill('#authPass', PASS);
    await page.click('#authSubmit');
  }
  await page.waitForTimeout(4000);

  // 2) Compteurs du tableau de bord non nuls
  const dash = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.stat-card')].map(c => ({
      label: c.querySelector('.stat-label')?.textContent?.trim(),
      value: parseInt(c.querySelector('.stat-value')?.textContent?.trim() || '0', 10),
    }));
    return { cards, hasUndefined: document.getElementById('view')?.innerHTML.includes('undefined') };
  });
  console.log('Tableau de bord :', JSON.stringify(dash.cards));
  const total = dash.cards.find(c => c.label === 'Articles')?.value || 0;
  ok(total > 0, 'Compteur "Articles" > 0 après connexion (bug zéros corrigé)');
  ok(!dash.hasUndefined, 'Aucun "undefined" affiché dans le dashboard');

  // 3) Écran Articles : filtres remplis + traçage par jour
  await page.evaluate(() => { document.querySelector('[data-route="facts"]')?.click(); });
  await page.waitForTimeout(2000);
  const facts = await page.evaluate(() => ({
    nCards: document.querySelectorAll('.fact-card').length,
    nDayGroups: document.querySelectorAll('.day-group').length,
    hasUndefined: document.getElementById('view')?.innerHTML.includes('undefined'),
    filterLabels: [...document.querySelectorAll('.filter-pill')].map(b => b.textContent.trim()),
  }));
  console.log('Articles :', JSON.stringify(facts));
  ok(facts.nCards > 0, 'Articles : au moins 1 carte affichée');
  ok(facts.nDayGroups >= 1, 'Articles : traçage par jour présent (groupes .day-group)');
  ok(!facts.hasUndefined, 'Articles : aucun "undefined"');

  // 4) Filtre "Brouillons" (branche EDITED corrigée)
  const draftsOk = await page.evaluate(() => {
    const b = document.querySelector('[data-fact-filter="drafts"]');
    if (!b) return { found: false };
    b.click();
    return { found: true };
  });
  await page.waitForTimeout(1500);
  const drafts = await page.evaluate(() => ({
    nCards: document.querySelectorAll('.fact-card').length,
    hasEmpty: !!document.querySelector('.group-empty'),
  }));
  ok(draftsOk.found, 'Filtre "Brouillons" présent');
  ok(drafts.nCards > 0, 'Filtre "Brouillons" : articles affichés (bug vide corrigé)');

  // 5) Filtre "Transmis" (undefined page corrigée)
  await page.evaluate(() => { document.querySelector('[data-fact-filter="transmitted"]')?.click(); });
  await page.waitForTimeout(1500);
  const trans = await page.evaluate(() => ({
    hasUndefined: document.getElementById('view')?.innerHTML.includes('undefined'),
    nCards: document.querySelectorAll('.fact-card').length,
  }));
  ok(!trans.hasUndefined, 'Filtre "Transmis" : aucun "undefined" (bug page vide corrigé)');

  // 6) Corbeille accessible
  const trash = await page.evaluate(() => !!document.querySelector('[data-route="trash"], [data-nav="trash"], .nav-item[data-route="trash"]'));
  ok(trash, 'Corbeille présente dans la navigation');

} catch (e) {
  failures.push('EXCEPTION: ' + e.message);
  console.log('  ✗ Exception: ' + e.message);
} finally {
  await browser.close().catch(() => {});
}

console.log('\n=== RÉSULTAT SMOKE TEST ===');
if (failures.length) {
  console.log('ÉCHEC (' + failures.length + '):');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
} else {
  console.log('SUCCÈS — aucune régression détectée');
  process.exit(0);
}
