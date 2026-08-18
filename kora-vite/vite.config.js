import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// base relatif -> sert indifféremment à la racine (/) ou sous /kora-v2/
// Cache-busting : on ajoute ?v=BUILD_ID aux assets dans index.html pour
// forcer le navigateur à reprendre le fichier même si caché (corrige le
// bug de clic qui ne marchait qu'en navigation privée).
const BUILD_ID = Date.now().toString(36);

export default defineConfig(({ command }) => ({
  base: "./",
  // Dev local : proxifie /kora-v2/api -> backend Python (server.py, port 8766).
  // En prod c'est nginx qui fait ce routage ; ici Vite le remplace pour la
  // prévisualisation live (évite les erreurs CORS car les appels restent
  // same-origin localhost:5173).
  server: {
    // Port assigné par le harness de preview via la variable PORT (Vite ne la lit
    // pas seul) ; retombe sur 5173 en usage direct. Évite les collisions de port.
    port: Number(process.env.PORT) || 5173,
    // HTTPS local (certif auto-signé) : le backend pose kora_sid en cookie
    // Secure (KORA_HTTPS=1 côté prod) — un navigateur ignore silencieusement
    // un cookie Secure servi en http://, la session ne prend jamais côté
    // front. https:// local règle ça sans toucher au comportement prod.
    https: true,
    // Hôte 127.0.0.1.sslip.io (DNS public qui résout vers 127.0.0.1) au lieu
    // de "localhost" : reste sur la même machine, mais donne un vrai nom de
    // domaine en local, cohérent avec l'origine de prod (sslip.io).
    host: "127.0.0.1.sslip.io",
    proxy: {
      "/kora-v2/api": {
        target: "http://localhost:8766",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/kora-v2/, ""),
      },
    },
  },
  build: {
    outDir: "dist",
    assetsInlineLimit: 4096,
    cssCodeSplit: false,
    minify: false,
    rollupOptions: {
      output: {
        // Nom de fichier unique par build -> contourne tout cache navigateur résiduel
        entryFileNames: `assets/index-${BUILD_ID}.js`,
        chunkFileNames: `assets/chunk-${BUILD_ID}.js`,
        assetFileNames: `assets/[name]-${BUILD_ID}[extname]`,
      },
    },
  },
  plugins: [
    {
      name: "cache-busting",
      transformIndexHtml(html) {
        return html.replace(/(src|href)="(\.\/)?(assets\/[^"]+)"/g,
          (m, attr, dot, path) => `${attr}="${path}?v=${BUILD_ID}"`);
      },
    },
    // Certificat auto-signé, dev uniquement (jamais pour `vite build`).
    // domains: couvre 127.0.0.1.sslip.io (hôte de dev) + localhost/127.0.0.1
    // en secours si jamais on y accède autrement.
    command === "serve"
      ? basicSsl({ domains: ["127.0.0.1.sslip.io", "localhost", "127.0.0.1"] })
      : null,
  ].filter(Boolean),
}));
