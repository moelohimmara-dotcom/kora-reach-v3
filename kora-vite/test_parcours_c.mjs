// Parcours C — Vidéos, bandeau de cycle, notifications (2026-08-22).
// Couvre les fonctionnalités/correctifs ajoutés lors de l'audit du
// 22/08/2026, absents des parcours A (smoke_test.mjs) et B
// (test_parcours_b.mjs) : page Vidéos + son bug F5-vide, le bandeau de
// cycle (déformation de mise en page), le lecteur vidéo, le centre de
// notifications. Même conventions que test_parcours_b.mjs (usage, cache
// désactivé, credentials).
import { chromium } from 'playwright';
const BASE = process.argv[2] || 'https://213.156.135.139.sslip.io/kora-v2';
// SECURITE (voir smoke_test.mjs pour le detail de l'incident) : jamais de
// valeur de repli en dur -- ces variables DOIVENT venir de l'environnement.
const USER = process.env.KORA_TEST_USER;
const PASS = process.env.KORA_TEST_PASS;
if (!USER || !PASS) {
  console.error('ERREUR: KORA_TEST_USER et KORA_TEST_PASS doivent être définis dans l\'environnement (jamais en dur dans ce fichier).');
  process.exit(1);
}
const failures = [];
const ok = (c, m) => { if (!c) { failures.push(m); console.log('  ✗ ' + m); } else console.log('  ✓ ' + m); };
const nav = async (p, route) => { await p.evaluate((r) => { document.querySelector(`.rail .item[data-route="${r}"]`)?.click(); }, route); await p.waitForTimeout(1200); };

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
// try/catch obligatoire (2026-08-27, voir test_parcours_b.mjs pour le
// détail) : une requête en vol au moment du browser.close() final peut
// crasher tout le process (contexte disposé) au lieu de juste échouer
// proprement -- ceci provoquerait un rollback deploy_check.sh à tort.
await ctx.route('**/*', async (route) => {
  try {
    const resp = await route.fetch();
    await route.fulfill({ response: resp, headers: { ...resp.headers(), 'Cache-Control': 'no-store' } });
  } catch (e) { try { await route.continue(); } catch (e2) { /* contexte déjà fermé -- rien à faire */ } }
});
const page = await ctx.newPage();
await page.addInitScript(() => { try { if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k))); } catch (e) {} });
const errors = [];
// 401 (probe d'auth initiale) et 403/ORB (protection anti-hotlink de sites
// sources externes sur les images d'articles, ex. guineematin.com -- hors
// périmètre : ce n'est pas une régression de KORA) sont du bruit connu, pas
// des échecs applicatifs -- même logique que test_parcours_b.mjs (401).
page.on('console', m => {
  const t = m.text();
  if (m.type() !== 'error') return;
  if (t.includes('401') || t.includes('403') || t.includes('ERR_BLOCKED_BY_ORB')) return;
  errors.push(t);
});
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

try {
  await page.goto(BASE + '/#cockpit', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);
  if (await page.evaluate(() => !!document.getElementById('authUser'))) {
    await page.fill('#authUser', USER); await page.fill('#authPass', PASS); await page.click('#authSubmit');
  }
  await page.waitForTimeout(4000);

  // --- Vidéos : chargement initial (navigation SPA) ---
  await nav(page, 'videos');
  let r = await page.evaluate(() => ({
    n: document.querySelectorAll('.video-row-wrap, [data-video-el]').length,
    hasUndefined: document.getElementById('view').innerHTML.includes('undefined'),
  }));
  ok(!r.hasUndefined, 'Vidéos : aucun undefined (navigation SPA)');
  const nSpa = r.n;
  console.log('  … vidéos via navigation SPA :', nSpa);

  // --- Bug corrigé 2026-08-22 : F5 sur /videos affichait 0 vidéo ---
  // (boot() ne rechargeait pas loadVideos() contrairement à navigate()).
  // Non-régression : le nombre de vidéos après F5 doit rester identique.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const afterReload = await page.evaluate(() => document.querySelectorAll('.video-row-wrap, [data-video-el]').length);
  console.log('  … vidéos après F5 :', afterReload);
  ok(afterReload === nSpa && afterReload > 0, `Vidéos après F5 : ${afterReload} (attendu ${nSpa}, bug "0 vidéo après F5" du 22/08/2026)`);

  // --- Lecteur vidéo : contrôles présents et branchés si au moins 1 vidéo ---
  if (afterReload > 0) {
    const player = await page.evaluate(() => {
      const wrap = document.querySelector('.video-player-wrap');
      return {
        hasPlay: !!wrap?.querySelector('[data-video-play]'),
        hasStop: !!wrap?.querySelector('[data-video-stop]'),
        hasProgress: !!wrap?.querySelector('.video-progress'),
        bound: !!wrap?.querySelector('[data-video-el]')?.dataset?.bound,
      };
    });
    ok(player.hasPlay && player.hasStop && player.hasProgress, 'Lecteur vidéo : play/stop/barre de progression présents');
    ok(player.bound, 'Lecteur vidéo : événements branchés (bindVideoPlayers)');
  }

  // --- Bandeau de cycle : contrat CSS (déformation de mise en page, 22/08/2026) ---
  // Le bandeau n'est visible QUE pendant un cycle/génération vidéo en cours
  // (rare de le déclencher réellement dans un smoke test) -- on vérifie donc
  // le contrat CSS lui-même (position fixed), qui doit tenir qu'il soit
  // visible ou non : c'est l'absence de ce `position:fixed` qui avait
  // provoqué le décalage de toute la mise en page (#app en display:flex).
  const bannerCss = await page.evaluate(() => {
    const el = document.querySelector('.cycle-banner');
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    return { found: true, position: cs.position };
  });
  ok(!bannerCss.found || bannerCss.position === 'fixed', 'Bandeau de cycle : position:fixed (contrat anti-déformation)');

  // --- Centre de notifications (renderNotifCenter(), refonte 2026-08-22) ---
  await page.evaluate(() => document.getElementById('notifBell')?.click());
  await page.waitForTimeout(600);
  const notif = await page.evaluate(() => {
    const panel = document.getElementById('notifPanel');
    const body = document.getElementById('notifBody');
    return {
      opened: !!panel && !panel.hidden,
      hasUndefined: body ? body.innerHTML.includes('undefined') : false,
      hasEmptyOrItems: body ? (body.querySelector('.notif-empty, .notif-item') != null) : false,
    };
  });
  ok(notif.opened, 'Notifications : le panneau s\'ouvre au clic sur la cloche');
  ok(!notif.hasUndefined, 'Notifications : aucun undefined dans le panneau');
  ok(notif.hasEmptyOrItems, 'Notifications : état vide ou liste rendu correctement');

} catch (e) { failures.push('EXCEPTION: ' + e.message); console.log('  ✗ ' + e.message); }
finally { await browser.close().catch(() => {}); }

console.log('\n=== PARCOURS C (Vidéos / Bandeau / Notifications) ===');
if (errors.length) { console.log('Erreurs JS :', errors.slice(0, 5)); }
if (failures.length) { console.log('ÉCHEC (' + failures.length + ')'); failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
else { console.log('SUCCÈS — parcours C sans accroc'); if (errors.length) process.exit(2); else process.exit(0); }
