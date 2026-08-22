/* ============================================================
   KORA — tour.js : guide utilisateur / onboarding contextuel (spotlight
   sur de vrais éléments d'écran) + bandeau "vous semblez perdu" après
   inactivité + bulles d'aide contextuelle (helpTip). Extrait de app.js
   le 22/08/2026 (refacto plan étape 4). Purement client, aucun état
   backend (Store.get/setGuidesEnabled reste dans store.js).
   ============================================================ */
import { Store } from "./store.js";
import { esc, icon } from "./utils.js";

// ============================================================================
// GUIDE UTILISATEUR / ONBOARDING CONTEXTUEL (wireframe 11.1-11.3)
// Tour guidé en spotlight sur de vrais éléments du cockpit + bandeau "vous
// semblez perdu" après inactivité + toggle dans Paramètres (Store.get/setGuidesEnabled).
// Purement client (DOM généré à la volée), aucun état backend.
// ============================================================================
const TOUR_STEPS = [
  { selectors: ["#topbarCycle"], title: "Lancer un cycle", text: "Ce bouton déclenche une collecte des sources et génère 1 article à valider. Aucune publication automatique — la validation humaine reste obligatoire." },
  { selectors: ['.stat-card[data-action="nav-hitl"]'], title: "À décider", text: "Les articles générés attendent ici ta décision : approuver, modifier ou rejeter. Rien n'est jamais publié sans validation." },
  { selectors: ["#notifBell"], title: "Notifications", text: "Retrouve ici l'historique des dernières actions (succès, erreurs, en cours) si tu en as manqué une." },
  { selectors: ['.rail .item[data-route="sources"]', "#navPlus"], title: "Sources & plus", text: "Retrouve la liste des sources surveillées et d'autres options depuis ce menu." },
];
let _tourActive = false;
function _tourFindTarget(selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.offsetParent !== null) return el; // visible (offsetParent null = display:none/hidden)
  }
  return null;
}
function _tourCleanup() {
  document.getElementById("tourOverlay")?.remove();
  document.getElementById("tourBubble")?.remove();
  _tourActive = false;
}
function _tourShowStep(i) {
  if (i >= TOUR_STEPS.length) { _tourCleanup(); Store.markTourSeen(); return; }
  const step = TOUR_STEPS[i];
  const target = _tourFindTarget(step.selectors);
  if (!target) { _tourShowStep(i + 1); return; } // cible absente à cette taille d'écran -> étape suivante
  const rect = target.getBoundingClientRect();
  let overlay = document.getElementById("tourOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "tourOverlay";
    overlay.className = "tour-overlay";
    document.body.appendChild(overlay);
  }
  const pad = 6;
  overlay.style.left = (rect.left - pad) + "px";
  overlay.style.top = (rect.top - pad) + "px";
  overlay.style.width = (rect.width + pad * 2) + "px";
  overlay.style.height = (rect.height + pad * 2) + "px";

  document.getElementById("tourBubble")?.remove();
  const bubble = document.createElement("div");
  bubble.id = "tourBubble";
  bubble.className = "tour-bubble";
  bubble.setAttribute("role", "dialog");
  bubble.setAttribute("aria-label", step.title);
  const spaceBelow = window.innerHeight - rect.bottom;
  bubble.style.top = (spaceBelow > 160 ? rect.bottom + 12 : Math.max(12, rect.top - 152)) + "px";
  bubble.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - 320)) + "px";
  bubble.innerHTML = `
    <div class="tour-bubble-title">${icon("i-info")} ${esc(step.title)}</div>
    <p class="tour-bubble-text">${esc(step.text)}</p>
    <div class="tour-bubble-foot">
      <span class="tour-bubble-progress">${i + 1} / ${TOUR_STEPS.length}</span>
      <div class="tour-bubble-actions">
        <button class="btn btn-tonal btn-sm" id="tourSkip">Passer</button>
        <button class="btn btn-primary btn-sm" id="tourNext">${i + 1 === TOUR_STEPS.length ? "Terminer" : "Suivant"}</button>
      </div>
    </div>`;
  document.body.appendChild(bubble);
  document.getElementById("tourSkip").onclick = () => { _tourCleanup(); Store.markTourSeen(); };
  document.getElementById("tourNext").onclick = () => _tourShowStep(i + 1);
}
function startTour() {
  if (_tourActive) return;
  _tourActive = true;
  _tourShowStep(0);
}
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

// "Vous semblez perdu" (11.3) : bandeau discret après une période d'inactivité
// (aucun clic), une seule fois par session — pas naggy, jamais si les guides
// sont désactivés ou si le tour est en cours.
let _idleTimer = null;
function _resetIdleTimer() {
  clearTimeout(_idleTimer);
  if (!Store.getGuidesEnabled() || sessionStorage.getItem("kora-idle-banner-shown") === "1") return;
  _idleTimer = setTimeout(() => {
    if (_tourActive) return;
    sessionStorage.setItem("kora-idle-banner-shown", "1");
    const banner = document.getElementById("idleBanner");
    if (banner) banner.hidden = false;
  }, 45000);
}

export { startTour, helpTip, _resetIdleTimer };
