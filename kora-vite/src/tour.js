/* ============================================================
   KORA — tour.js : bulles d'aide contextuelle (helpTip). Extrait de app.js
   le 22/08/2026 (refacto plan étape 4). Purement client, aucun état backend.

   Guide d'accueil / visite guidée en spotlight + bandeau "vous semblez
   perdu" RETIRÉS (2026-08-23, demande explicite de l'utilisateur :
   "supprimer complètement le guide d'accueil dans KORA") -- ne restent que
   les bulles d'aide "?" contextuelles ci-dessous, qui sont une fonctionnalité
   distincte (aide ponctuelle sur un élément précis, jamais un parcours
   imposé au premier lancement) et n'étaient pas visées par la demande.
   ============================================================ */
import { icon } from "./utils.js";

// Bulles d'aide contextuelle (11.2) — icône "?" à côté d'un élément dont le
// sens n'est pas évident, texte en langage simple. Délégation d'événement
// (bindée UNE fois) plutôt que rebindée à chaque render : marche pour tout
// nouveau help-tip ajouté n'importe où dans l'app sans câblage supplémentaire.
const HELP_TEXTS = {
  "fact-filters": "En attente : article généré, pas encore décidé. Transmis : publié. Rejetés/Corbeille : retirés (récupérables 11 jours). Brouillons : en cours de correction.",
};
function helpTip(id) {
  return `<span class="help-tip"><button type="button" class="help-tip-btn" data-help="${id}" aria-label="Aide">${icon("i-help")}</button></span>`;
}
if (!window.__helpTipBound) {
  window.__helpTipBound = true;
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".help-tip-btn");
    document.querySelectorAll(".help-tip-pop").forEach(p => p.remove());
    if (!btn) return;
    e.stopPropagation();
    const pop = document.createElement("div");
    pop.className = "help-tip-pop";
    pop.textContent = HELP_TEXTS[btn.dataset.help] || "";
    btn.parentElement.appendChild(pop);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.querySelectorAll(".help-tip-pop").forEach(p => p.remove()); });
}

export { helpTip };
