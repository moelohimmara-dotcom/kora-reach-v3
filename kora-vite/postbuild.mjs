// postbuild.mjs — anti-flash d'authentification.
// 1) Place le <link rel=stylesheet> (CSS KORA) AVANT le <script type=module>,
//    sinon le formulaire d'auth est peint en style navigateur par défaut
//    (blanc, icône non stylée) puis basculé vers la charte KORA = flash.
// 2) Injecte le sprite SVG des icônes DIRECTEMENT dans le <body> du HTML
//    généré, pour que les <use href="#i-..."> résolvent immédiatement (aucun
//    texte "visibility" affiché avant que le JS n'injecte le sprite).
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const file = resolve(process.cwd(), "dist", "index.html");
let html = readFileSync(file, "utf8");

// 1) CSS avant JS
// Cible le <link> du CSS KORA (assets/style-*.css), pas le Google Fonts.
const link = html.match(/<link[^>]*href="[^"]*assets\/style[^"]*"[^>]*>/);
const script = html.match(/<script[^>]*type="module"[^>]*><\/script>/);

if (link && script) {
  // Remplacement LITTÉRAL (split/join) : String.replace() traiterait les
  // "?" et "." de "?v=BUILD_ID" comme métacaractères regex -> échec.
  html = html.split(link[0]).join("");           // retire le link de sa position
  html = html.split(script[0]).join(`${link[0]}\n    ${script[0]}`);  // link juste avant le script
  console.log("[postbuild] CSS placé avant le JS module (anti-flash).");
} else {
  console.log("[postbuild] link/script non trouvés — CSS avant JS ignoré.");
}

// 2) Sprite SVG inline (extrait de src/icons.js, constante SPRITE)
const icons = readFileSync(resolve(process.cwd(), "src", "icons.js"), "utf8");
const m = icons.match(/const SPRITE = `([\s\S]*?)`;/);
if (m) {
  const sprite = m[1].trim();
  // Injecte avant </body> si pas déjà présent
  if (!html.includes('id="i-dashboard"')) {
    html = html.replace(/<\/body>/, `${sprite}\n</body>`);
    console.log("[postbuild] Sprite SVG injecté dans le <body> (anti-flash icônes).");
  } else {
    console.log("[postbuild] Sprite déjà présent — ignoré.");
  }
} else {
  console.log("[postbuild] SPRITE non trouvé dans icons.js — sprite ignoré.");
}

writeFileSync(file, html, "utf8");

