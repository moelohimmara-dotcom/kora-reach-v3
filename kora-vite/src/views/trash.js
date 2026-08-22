/* ============================================================
   KORA — views/trash.js : page Corbeille. Extrait de app.js le 22/08/2026
   (refacto plan étape 4).
   ============================================================ */
import { Store } from "../store.js";
import { esc, icon, chip, statusBadge, imgSrc, placeholderSvg, stateBox } from "../utils.js";

function trashCard(f, s) {
  const c = f.champion || {};
  const img = imgSrc(f);
  const ph = placeholderSvg(Store.getTheme());
  const src = img ? esc(img) : ph;
  const trashed = f.trashed_at ? new Date(f.trashed_at).toLocaleString("fr-FR") : "";
  return `<article class="fact-card trash-card" data-fact="${esc(f.fact_id)}">
    <img class="fact-img" src="${src}" alt="" loading="lazy" onerror="this.src='${ph}'">
    <div class="fact-body">
      <div class="trash-flag">${icon("i-trash")} Corbeille</div>
      <h3 class="fact-title">${esc(c.title || "(sans titre)")}</h3>
      <div class="fact-chips">${chip(c.source || "Source", "secondary", "i-source")}${chip(trashed || "Date inconnue", "tertiary", "i-date")}</div>
      <div class="fact-status">${statusBadge("TRASHED")} <span class="muted">${esc(c.source || "")}</span></div>
      <div class="trash-actions">
        <button class="btn btn-tonal btn-sm" data-restore="${esc(f.fact_id)}">${icon("i-undo")} Restaurer</button>
        <button class="btn btn-danger btn-sm" data-del="${esc(f.fact_id)}">${icon("i-trash")} Supprimer</button>
      </div>
    </div>
  </article>`;
}
function viewTrash(s) {
  // /api/hitl/trash renvoie TOUS les TRASHED (avec d_status/decision joints,
  // voir list_trashed() cote backend). Jusqu'au 2026-08-19, ceux dont la
  // decision HITL etait REJECTED en etaient exclus (comptes uniquement dans
  // "Rejetés") -- revu le 2026-08-22 (demande explicite) : un article
  // rejete via "Mettre à la corbeille" doit apparaitre ICI, coherent avec
  // le bouton qui l'y a envoye et avec s.stats.trash (desormais TOUT le
  // TRASHED, voir get_dashboard_stats()). Plus aucun filtre d'exclusion.
  const items = s.trash || [];
  // Bug corrigé 2026-08-19 (même famille que viewDrafts()) : "Corbeille vide"
  // s'affichait au chargement avant l'arrivée des vraies données -- ici
  // ui.loading n'aurait de toute façon pas aidé (loadTrash() ne le pilote
  // pas), d'où le flag dédié trashLoaded.
  if (!s.trashLoaded) return stateBox("i-trash", "Corbeille en chargement…", "Récupération des éléments supprimés.", true);
  if (!items.length) return stateBox("i-trash", "Corbeille vide", "Les articles supprimés restent ici 11 jours, puis sont purgés automatiquement. Restaure-les ou supprime-les définitivement.", false);
  return `<div class="section-title">Corbeille (${items.length})</div>
    <p class="muted" style="margin-bottom:16px">Restauration possible pendant 11 jours. Au-delà, suppression définitive automatique.</p>
    <div class="fact-grid">${items.map(f => trashCard(f, s)).join("")}</div>`;
}

export { viewTrash };
