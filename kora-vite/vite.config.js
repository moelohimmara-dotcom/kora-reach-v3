import { defineConfig } from "vite";

// base relatif -> sert indifféremment à la racine (/) ou sous /kora-v2/
// Cache-busting : on ajoute ?v=BUILD_ID aux assets dans index.html pour
// forcer le navigateur à reprendre le fichier même si caché (corrige le
// bug de clic qui ne marchait qu'en navigation privée).
const BUILD_ID = Date.now().toString(36);

export default defineConfig({
  base: "./",
  // Dev local : proxifie /kora-v2/api -> backend Python (server.py, port 8766).
  // En prod c'est nginx qui fait ce routage ; ici Vite le remplace pour la
  // prévisualisation live (évite les erreurs CORS car les appels restent
  // same-origin localhost:5173).
  server: {
    // Port assigné par le harness de preview via la variable PORT (Vite ne la lit
    // pas seul) ; retombe sur 5173 en usage direct. Évite les collisions de port.
    port: Number(process.env.PORT) || 5173,
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
  ],
});
