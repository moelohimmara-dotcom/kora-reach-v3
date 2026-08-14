// postbuild.mjs — anti-flash : place le <link rel=stylesheet> AVANT le
// <script type=module> dans dist/index.html, pour que le CSS (charte KORA)
// bloque le paint avant l'exécution du JS. Sinon, au rafraîchissement, le
// formulaire d'auth est peint en style navigateur par défaut (blanc, icône
// auto_awesome non stylée) puis basculé vers la charte KORA = flash visible.
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const file = resolve(process.cwd(), "dist", "index.html");
let html = readFileSync(file, "utf8");

// Cible le <link> du CSS KORA (assets/style-*.css), pas le Google Fonts.
const link = html.match(/<link[^>]*href="[^"]*assets\/style[^"]*"[^>]*>/);
const script = html.match(/<script[^>]*type="module"[^>]*><\/script>/);

if (link && script) {
  const linkTag = link[0];
  const scriptTag = script[0];
  // Remplacement LITTÉRAL (split/join) : String.replace() traiterait les
  // "?" et "." de "?v=BUILD_ID" comme métacaractères regex -> échec.
  html = html.split(linkTag).join("");           // retire le link de sa position
  html = html.split(scriptTag).join(`${linkTag}\n    ${scriptTag}`);  // link juste avant le script
  writeFileSync(file, html, "utf8");
  console.log("[postbuild] CSS placé avant le JS module (anti-flash).");
} else {
  console.log("[postbuild] link/script non trouvés — aucun changement.");
}
