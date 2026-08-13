// Test de non-régression : le champ de login ne doit PAS se vider à chaque setState.
// On charge le bundle IIFE réel (app.js compilé par esbuild) dans jsdom.
import { JSDOM } from "jsdom";
import fs from "fs";

const bundle = fs.readFileSync("/tmp/app.bundle.js", "utf8");

const html = `<!DOCTYPE html><html><head></head><body>
  <div id="app"></div>
  <div id="authOverlay" hidden></div>
</body></html>`;

const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://localhost/" });
const { window } = dom;

// Stubs minimaux pour que le bundle s'exécute
window.fetch = async () => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true }) });
window.document.fonts = { ready: Promise.resolve() };
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.AbortController = window.AbortController || global.AbortController;

// Exécute le bundle IIFE dans le contexte window
try {
  const runInWindow = new Function("window", "document", "localStorage", "history", "location", "navigator", "HTMLElement", "customElements", "fetch", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "AbortController", "console", bundle + "\n;window.__Store = window.Store; window.__App = window.App;");
  runInWindow(window, window.document, window.localStorage, window.history, window.location, window.navigator, window.HTMLElement, window.customElements, window.fetch, setTimeout, clearTimeout, setInterval, clearInterval, window.AbortController, console);
} catch (e) {
  console.log("ERREUR EXEC BUNDLE:", e.message);
  console.log(e.stack);
}

const Store = window.__Store;
const App = window.__App;

if (!Store || !App) {
  console.log("RESULT: FAIL ❌ Store/App non exposés par le bundle");
  process.exit(1);
}

// 1) Rendu initial du login
Store.subscribe(() => App.render());
App.render();

const overlay = window.document.getElementById("authOverlay");
const userField = window.document.getElementById("authUser");
const passField = window.document.getElementById("authPass");

console.log("Overlay visible:", overlay.hidden === false);
console.log("Champ identifiant présent:", !!userField);

// 2) L'utilisateur tape son identifiant
userField.value = "admin";
passField.value = "titanic1912";
console.log("Valeur saisie user:", userField.value, "| pass:", passField.value ? "***(présent)" : "(vide)");

// 3) SIMULATION du bug : setState survient (loadSettings, loadHealth, timer 30s)
Store.setState({ ui: { ...Store.state.ui, loading: true } });
Store.setState({ settings: { app_name: "KORA" } });
Store.setState({ health: { status: "ok" } });

// 4) Relit le champ : AVANT le fix, render() reconstruisait le formulaire → valeur perdue.
const userField2 = window.document.getElementById("authUser");
const passField2 = window.document.getElementById("authPass");
console.log("Après 3 setState — identifiant conservé:", userField2 && userField2.value === "admin");
console.log("Après 3 setState — mot de passe conservé:", passField2 && passField2.value === "titanic1912");

const ok = userField2 && userField2.value === "admin" && passField2 && passField2.value === "titanic1912";
console.log(ok ? "RESULT: PASS ✅ le champ persiste entre les setState" : "RESULT: FAIL ❌ le champ a été vidé/reconstruit");
process.exit(ok ? 0 : 1);
