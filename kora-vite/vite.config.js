import { defineConfig } from "vite";

// base relatif -> sert indifféremment à la racine (/) ou sous /kora-v2/
// Cache-busting : on ajoute ?v=BUILD_ID aux assets dans index.html pour
// forcer le navigateur à reprendre le fichier même si caché (corrige le
// bug de clic qui ne marchait qu'en navigation privée).
const BUILD_ID = Date.now().toString(36);

export default defineConfig({
  base: "./",
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
