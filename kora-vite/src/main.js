import "./style.css";
import { mountSprite } from "./icons.js";
import { SHELL } from "./shell.js";
import { Store } from "./store.js";
import { App } from "./app.js";

mountSprite();

window.addEventListener("error", (e) => {
  const v = document.getElementById("view");
  if (v) v.innerHTML = '<pre style="color:#F2A199;padding:20px;white-space:pre-wrap">ERREUR: ' + (e.message || e.error) + "\n" + (e.error && e.error.stack ? e.error.stack : "") + "</pre>";
});

// Le JS possède le DOM : on injecte le shell dans #app, puis on bind.
// Le JS possède le DOM : on injecte le shell dans #app, puis on bind.
const app = document.getElementById("app");
app.innerHTML = SHELL;
const bootTheme = Store.initTheme();
Store.state.ui.theme = bootTheme;
const bootRail = Store.initRail();
Store.state.ui.rail = bootRail;
App.bind();
Store.subscribe(() => App.render());
// debug : expose Store pour tests navigateur
window.Store = Store; window.App = App;

// NETTOYAGE SW ORPHELIN : désenregistre tout Service Worker résiduel dans le
// profil navigateur (un SW orphelin intercepte les clics physiques mais pas
// les clics programmatiques -> le clic ne marchait qu'en navigation privée).
// Le front se charge déjà, donc ce code s'exécute chez l'utilisateur et nettoie.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then(regs => regs.forEach(r => r.unregister()))
    .catch(() => {});
}

