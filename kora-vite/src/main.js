import "./style.css";
import { SHELL } from "./shell.js";
import { Store } from "./store.js";
import { App } from "./app.js";
import { SPRITE } from "./icons.js";

// Sprite SVG des icônes : en build de prod, postbuild.mjs l'injecte déjà
// statiquement dans dist/index.html (anti-flash, avant même que ce script ne
// s'exécute) — le même check d'idempotence (id="i-dashboard") évite un
// doublon ici. En dev (npm run dev), postbuild.mjs ne tourne jamais : sans
// cette injection, AUCUNE icône ne s'affiche nulle part dans l'app.
if (!document.getElementById("i-dashboard")) {
  document.body.insertAdjacentHTML("afterbegin", SPRITE);
}

// === Material Design 3 : typographie officielle (typescale tokens) ===
import { styles as typescaleStyles } from "@material/web/typography/md-typescale-styles.js";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "@fontsource/material-icons/400.css";
if (document.adoptedStyleSheets) {
  document.adoptedStyleSheets.push(typescaleStyles.styleSheet);
}
window.addEventListener("error", (e) => {
  const v = document.getElementById("view");
  if (v) v.innerHTML = '<pre style="color:#F2A199;padding:20px;white-space:pre-wrap">ERREUR: ' + (e.message || e.error) + "\n" + (e.error && e.error.stack ? e.error.stack : "") + "</pre>";
});

// NETTOYAGE SW ORPHELIN : on désenregistre TOUT SW résiduel d'une ancienne
// version (qui interceptait les fetch et bloquait les clics). On ne fait PAS
// de location.reload() automatique pour éviter une boucle de reload infinie si
// le SW se ré-enregistrait. Un reload manuel (Ctrl+Shift+R) suffit.
async function purgeServiceWorkers() {
  if (!('serviceWorker' in navigator)) return false;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) { try { await r.unregister(); } catch (e) {} }
    return regs.length > 0;
  } catch (e) { return false; }
}
purgeServiceWorkers();

// Le JS possède le DOM : on injecte le shell dans #app, puis on bind.
const app = document.getElementById("app");
app.innerHTML = SHELL;
const bootTheme = Store.initTheme();
Store.state.ui.theme = bootTheme;
const bootRail = Store.initRailMode();
Store.state.ui.railMode = bootRail;
App.bind();
App.boot();
Store.subscribe(() => App.render());
// debug : expose Store pour tests navigateur
window.Store = Store; window.App = App;
// Sécurité splash : si l'app ne monte pas dans les 8s (erreur réseau/IP), on
// retire le splash pour ne pas bloquer l'utilisateur sur un ecran figé.
setTimeout(() => { const el = document.getElementById("bootSplash"); if (el) el.remove(); }, 8000);

