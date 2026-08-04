import { defineConfig } from "vite";

// base relatif -> sert indifféremement à la racine (/) ou sous /kora-v2/
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
