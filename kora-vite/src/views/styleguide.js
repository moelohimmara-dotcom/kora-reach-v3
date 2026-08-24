/* ============================================================
   KORA — views/styleguide.js : page Style Guide (référence vivante du
   design system, réservée au rôle avancé). Extrait de app.js le
   22/08/2026 (refacto plan étape 4).
   ============================================================ */
import { esc, statusBadge, icon } from "../utils.js";
import { statCard } from "./dashboard.js";

function viewStyleGuide(s) {
  const tok = (name, desc) => `
    <div class="sg-token">
      <span class="sg-swatch" style="background:var(${name})"></span>
      <div class="sg-token-meta"><code>${name}</code><div class="muted">${esc(desc)}</div></div>
    </div>`;
  return `
  <div class="dashboard kora-wire sg-page">
    <h1 class="section-title">Style Guide — Design System KORA</h1>
    <p class="muted">Référence vivante. Toute modification visuelle se vérifie ici avant merge. Source : <code>docs/DESIGN_SYSTEM.md</code>.</p>

    <h2 class="section-title">Couleurs — tokens sémantiques</h2>
    <div class="sg-grid">
      ${tok("--bg", "Fond application (#0E1114)")}
      ${tok("--surface", "Cartes (#171C21)")}
      ${tok("--coral", "Accent — branding configurable, défaut #E9705D")}
      ${tok("--success", "Prêt / validé (#3DD68C)")}
      ${tok("--warning", "Attention (#F5A83C)")}
      ${tok("--danger", "Rejet / suppression (#E5484D)")}
    </div>

    <h2 class="section-title">Typographie — Oswald (titres) + Source Sans 3 (corps)</h2>
    <div class="sg-type">
      <div style="font-size:28px;font-weight:700">Nombre KPI — 28px / 700</div>
      <div style="font-size:20px;font-weight:700">Titre de section — 20px / 700</div>
      <div style="font-size:16px">Corps de texte — 16px / 400, interligne 1.5</div>
      <div class="muted" style="font-size:13px">Label secondaire — 13px / 500</div>
    </div>

    <h2 class="section-title">Badges de statut <span class="muted" style="font-weight:400">(icône + texte, jamais couleur seule)</span></h2>
    <div class="sg-row">
      ${statusBadge("PENDING_REVIEW")} ${statusBadge("APPROVED")} ${statusBadge("REJECTED")} ${statusBadge("TRANSMITTED")} ${statusBadge("EDITED")} ${statusBadge("TRASHED")}
    </div>

    <h2 class="section-title">Boutons</h2>
    <div class="sg-row">
      <button class="btn btn-primary">${icon("i-send")} Primaire</button>
      <button class="btn btn-tonal">Secondaire</button>
      <button class="btn" disabled>Désactivé</button>
    </div>

    <h2 class="section-title">Carte KPI</h2>
    <div class="dashboard-grid stats-row sg-kpi">
      ${statCard({ icon: "i-help", value: 12, label: "Articles à approuver", variant: "warning" })}
    </div>
  </div>`;
}

export { viewStyleGuide };
