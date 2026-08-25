/* ============================================================
   KORA — sheet.js : le panneau de détail glissant (#sheet/#sheetBody/
   #sheetScrim), UN SEUL composant DOM réutilisé pour plusieurs contenus
   (fiche article, confirmation générique, rejet, détail/ajout de source).
   Extrait de app.js le 22/08/2026 (refacto plan étape 4) — regroupé en un
   seul module car renderSheet() dispatche vers TOUTES les fonctions
   ci-dessous selon sh.type ; les séparer casserait cette cohésion.
   ============================================================ */
import { Store } from "./store.js";
import {
  $, $$, esc, icon, chip, factMeta, isAdvancedRole, mdToHtml, mdToHtmlInline,
  rteWrapSelection, rtePrefixLines, rteHeading, rteLink, placeholderSvg,
  imgSrc, guardClick, snack, friendlyActionError, transmissionMessage,
} from "./utils.js";
import { openWpChoiceForFact, navigate } from "./app.js";
import { SOURCE_STATUS_FR } from "./views/sources.js";

// Détail d'une source (wireframe 7.2, gouvernance ouverte à l'UI 2026-08-19) :
// advanced peut activer/suspendre depuis cet écran, tracé en audit côté serveur.
function renderSourceDetail(s) {
  const sh = s.sheet;
  const e = sh.source;
  const isAdvanced = (s.auth && isAdvancedRole(s.auth.role));
  const body = document.getElementById("sheetBody");
  const sheet = document.getElementById("sheet");
  const scrim = document.getElementById("sheetScrim");
  const domains = (e.domains || []);
  const vectors = [e.vector, e.vector_secondary].filter(Boolean).join(" · secours : ") || "—";
  const active = e.status === "active";
  body.innerHTML = `
    <div class="reject-confirm source-detail">
      <div class="reject-confirm-head">
        ${icon(e.guinea_filter ? "i-shield" : "i-sources", "ic-l")}
        <h2 class="sheet-title">${esc(e.name)}</h2>
      </div>
      <div class="source-detail-badges">
        ${chip(e.category === "GN_NAT" ? "Nationale guinéenne" : esc(e.category), "primary")}
        ${e.guinea_filter ? chip("Filtre Guinée exigé", "warning", "i-shield") : ""}
        ${chip(active ? "Active" : (SOURCE_STATUS_FR[e.status] || esc(e.status)), active ? "tertiary" : "error")}
      </div>
      <div class="source-detail-field">
        <div class="source-detail-label">URL d'entrée</div>
        <div class="source-detail-value">${esc(e.entry_url)}</div>
      </div>
      <div class="source-detail-field">
        <div class="source-detail-label">Domaines autorisés (fermé)</div>
        <div class="source-detail-tags">${domains.length ? domains.map(d => chip(d)).join("") : '<span class="muted">Aucun</span>'}</div>
      </div>
      <div class="source-detail-field">
        <div class="source-detail-label">Vecteur de collecte</div>
        <div class="source-detail-value">${esc(vectors)}</div>
      </div>
      <div class="source-detail-grid">
        <div class="source-detail-field">
          <div class="source-detail-label">Responsable</div>
          <div class="source-detail-value">${esc(e.responsible || "—")}</div>
        </div>
        <div class="source-detail-field">
          <div class="source-detail-label">Version</div>
          <div class="source-detail-value">${esc(e.version || "—")}</div>
        </div>
      </div>
      <div class="source-detail-field">
        <div class="source-detail-label">Dernière collecte</div>
        <div class="source-detail-value">${_lastFetchLine(e)}</div>
      </div>
      ${isAdvanced ? `
        <p class="muted source-detail-footnote">${icon("i-shield")} Chaque activation/suspension est tracée dans le journal d'audit.</p>
        <div class="mini-sheet-actions">
          <button class="btn ${active ? "btn-outline" : "btn-primary"}" id="sourceToggleBtn">${active ? "Suspendre" : "Réactiver"}</button>
          <button class="btn btn-tonal" id="sourceEditBtn">Modifier</button>
        </div>
        <button class="btn btn-ghost btn-block" id="sourceHistoryBtn" style="margin-top:8px">${icon("i-audit")} Voir l'historique dans le journal d'audit</button>
      ` : `<p class="muted source-detail-footnote">${icon("i-lock")} Réservé au rôle avancé.</p>`}
      <button class="btn btn-tonal btn-block" data-source-detail-close="1">Fermer</button>
    </div>`;
  sheet.hidden = false; scrim.hidden = false;
  const closeBtn = body.querySelector("[data-source-detail-close]");
  closeBtn.onclick = () => Store.closeSheet();
  const toggleBtn = document.getElementById("sourceToggleBtn");
  if (toggleBtn) toggleBtn.onclick = () => confirmAction({
    title: active ? "Suspendre cette source ?" : "Réactiver cette source ?",
    message: active
      ? "Kora Agent arrêtera de collecter des articles depuis cette source dès le prochain cycle."
      : "Kora Agent reprendra la collecte depuis cette source dès le prochain cycle.",
    confirmLabel: active ? "Suspendre" : "Réactiver",
    danger: active,
    onConfirm: async () => {
      try {
        await Store.updateSource(e.id, { status: active ? "suspended" : "active" });
        Store.closeSheet();
        snack(active ? "Source suspendue." : "Source réactivée.");
      } catch (err) { snack("Erreur : " + (err.message || "échec de la mise à jour.")); }
    },
  });
  // Historique (suggestion audit UX Sources, 2026-08-24) : plutôt que de
  // dupliquer une mini-vue d'historique dans ce panneau, réutilise le
  // Journal d'audit déjà existant (recherche déjà là) -- pré-rempli sur le
  // nom de cette source. Cohérent, aucune logique de filtrage à maintenir
  // à deux endroits.
  const historyBtn = document.getElementById("sourceHistoryBtn");
  if (historyBtn) historyBtn.onclick = () => {
    Store.setState({ auditFilter: { type: "all", q: e.name || e.id } });
    Store.closeSheet();
    navigate("audit");
  };
  // Édition (suggestion audit UX Sources, 2026-08-24) : l'API acceptait déjà
  // n'importe quel champ en édition (update_entry(), utilisé jusqu'ici
  // uniquement pour le statut actif/suspendu) -- il ne manquait qu'un
  // formulaire côté UI pour corriger un nom, une URL, des domaines, etc.
  // sans passer par la base directement.
  const editBtn = document.getElementById("sourceEditBtn");
  if (editBtn) editBtn.onclick = () => { Store.openSheet({ type: "edit-source", source: e }); renderSheet(Store.state); };
  closeBtn.focus();
}

// Résumé lisible du dernier statut de collecte (2026-08-24, suggestion
// audit UX Sources) : distinct de `status` (gouvernance), voir
// collection/whitelist.py::record_fetch_result().
function _lastFetchLine(e) {
  if (!e.last_fetch_at) return '<span class="muted">Jamais interrogée</span>';
  const ts = new Date(e.last_fetch_at).toLocaleString("fr-FR");
  if (e.last_fetch_status === "error") {
    return `🔴 Échec le ${esc(ts)}${e.last_fetch_error ? ` — ${esc(e.last_fetch_error)}` : ""}`;
  }
  const n = typeof e.last_fetch_items === "number" ? e.last_fetch_items : null;
  return `🟢 Réussie le ${esc(ts)}${n !== null ? ` (${n} article${n > 1 ? "s" : ""} trouvé${n > 1 ? "s" : ""})` : ""}`;
}

// Ajout d'une source (2026-08-19) : formulaire minimal (nom, URL d'entrée,
// domaines autorisés, catégorie, vecteur, filtre Guinée). L'id est dérivé du
// nom (slug), modifiable si besoin d'un identifiant plus stable.
//
// Édition (suggestion audit UX Sources, 2026-08-24) : PARTAGE ce même
// formulaire (mode paramétré) plutôt que d'en dupliquer un second --
// update_entry() côté backend acceptait déjà n'importe quel champ, seule
// l'UI manquait. `editEntry` non-null bascule en mode édition : champs
// pré-remplis, id figé (pas de re-slug), soumission via Store.updateSource.
function _renderSourceForm(s, editEntry) {
  const isEdit = !!editEntry;
  const body = document.getElementById("sheetBody");
  const sheet = document.getElementById("sheet");
  const scrim = document.getElementById("sheetScrim");
  const e = editEntry || {};
  body.innerHTML = `
    <div class="reject-confirm add-source">
      <div class="reject-confirm-head">
        ${icon(isEdit ? "i-edit" : "i-plus", "ic-l")}
        <h2 class="sheet-title">${isEdit ? "Modifier " + esc(e.name) : "Ajouter une source"}</h2>
      </div>
      <label class="form-field">
        <span>Nom éditorial</span>
        <input type="text" id="asName" placeholder="Ex : Le Nouveau Média" aria-describedby="asNameErr" value="${esc(e.name || "")}" />
        <span class="field-error" id="asNameErr" role="alert"></span>
      </label>
      <label class="form-field">
        <span>URL d'entrée</span>
        <input type="url" id="asUrl" placeholder="https://exemple.com/" aria-describedby="asUrlErr" value="${esc(e.entry_url || "")}" />
        <span class="field-error" id="asUrlErr" role="alert"></span>
      </label>
      <label class="form-field">
        <span>Domaines autorisés (séparés par une virgule)</span>
        <input type="text" id="asDomains" placeholder="exemple.com, www.exemple.com" aria-describedby="asDomainsErr" value="${esc((e.domains || []).join(", "))}" />
        <span class="field-error" id="asDomainsErr" role="alert"></span>
      </label>
      <div class="form-row">
        <label class="form-field">
          <span>Catégorie</span>
          <select id="asCategory">
            <option value="GN_NAT" ${e.category === "GN_NAT" || !isEdit ? "selected" : ""}>Nationale guinéenne</option>
            <option value="INTL" ${e.category === "INTL" ? "selected" : ""}>Internationale</option>
          </select>
        </label>
        <label class="form-field">
          <span>Vecteur de collecte</span>
          <select id="asVector">
            <option value="html" ${e.vector === "html" || !isEdit ? "selected" : ""}>HTML (page + sitemap)</option>
            <option value="rss" ${e.vector === "rss" ? "selected" : ""}>RSS</option>
          </select>
        </label>
      </div>
      <label class="mini-sheet-check"><input type="checkbox" id="asGuineeFilter" ${e.guinea_filter ? "checked" : ""} /> Filtre Guinée strict requis (médias internationaux)</label>
      <p class="muted source-detail-footnote">${icon("i-shield")} ${isEdit ? "Chaque modification est tracée dans le journal d'audit." : "L'ajout est tracé dans le journal d'audit."}</p>
      <div class="mini-sheet-actions">
        <button class="btn btn-primary" id="asSubmit">${isEdit ? "Enregistrer" : "Ajouter"}</button>
        <button class="btn btn-ghost" id="asCancel">Annuler</button>
      </div>
    </div>`;
  sheet.hidden = false; scrim.hidden = false;
  const cancelBtn = document.getElementById("asCancel");
  cancelBtn.onclick = () => Store.closeSheet();
  // B5/F6 (audit UX Sources, 2026-08-24) : le champ URL n'avait AUCUNE
  // validation de format, ni HTML (type="text" simple) ni JS (seul un test
  // de présence) -- une chaîne arbitraire type "not-a-valid-url" aurait été
  // enregistrée telle quelle en base sur une page qui gère justement les
  // URLs de collecte. Erreur désormais rattachée au champ fautif (bordure
  // rouge + texte, aria-describedby déjà posé sur l'input) plutôt qu'un
  // seul toast générique listant 3 champs sans dire lequel.
  const _fieldErr = (inputId, errId, msg) => {
    const input = document.getElementById(inputId);
    const errEl = document.getElementById(errId);
    if (input) input.classList.toggle("invalid", !!msg);
    if (errEl) errEl.textContent = msg || "";
  };
  document.getElementById("asSubmit").onclick = async () => {
    ["asName", "asUrl", "asDomains"].forEach(id => _fieldErr(id, id + "Err", ""));
    const name = document.getElementById("asName").value.trim();
    const entry_url = document.getElementById("asUrl").value.trim();
    const domains = document.getElementById("asDomains").value.split(",").map(d => d.trim()).filter(Boolean);
    const category = document.getElementById("asCategory").value;
    const vector_primary = document.getElementById("asVector").value;
    const guinee_filter = document.getElementById("asGuineeFilter").checked;
    let firstInvalid = null;
    if (!name) { _fieldErr("asName", "asNameErr", "Le nom éditorial est requis"); firstInvalid = firstInvalid || "asName"; }
    let urlOk = false;
    if (!entry_url) { _fieldErr("asUrl", "asUrlErr", "L'URL d'entrée est requise"); firstInvalid = firstInvalid || "asUrl"; }
    else {
      try {
        const parsed = new URL(entry_url);
        urlOk = parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch (e) { urlOk = false; }
      if (!urlOk) { _fieldErr("asUrl", "asUrlErr", "URL invalide (doit commencer par http:// ou https://)"); firstInvalid = firstInvalid || "asUrl"; }
    }
    if (!domains.length) { _fieldErr("asDomains", "asDomainsErr", "Au moins un domaine est requis"); firstInvalid = firstInvalid || "asDomains"; }
    if (firstInvalid) { document.getElementById(firstInvalid).focus(); return; }
    try {
      if (isEdit) {
        await Store.updateSource(editEntry.id, { name, entry_url, allowed_domains: domains, category, vector_primary,
          vector_secondary: vector_primary === "html" ? "sitemap" : "", guinee_filter });
        Store.closeSheet();
        snack("Source modifiée.");
      } else {
        const id = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "").slice(0, 30) || ("source" + Date.now());
        await Store.addSource({ id, name, entry_url, allowed_domains: domains, category, vector_primary,
          vector_secondary: vector_primary === "html" ? "sitemap" : "", guinee_filter });
        Store.closeSheet();
        snack("Source ajoutée.");
      }
    } catch (err) { snack("Erreur : " + (err.message || (isEdit ? "échec de la modification." : "échec de l'ajout."))); }
  };
  document.getElementById("asName").focus();
}
function renderAddSourceSheet(s) { _renderSourceForm(s, null); }
function renderEditSourceSheet(s) { _renderSourceForm(s, s.sheet.source); }


// Bulle de rejet (wireframe 4.3b) : au clic sur "Rejeter", propose un choix
// explicite plutôt qu'un rejet silencieux. "Mettre à la corbeille" (par défaut,
// recommandé, récupérable 11j -> decide(REJECTED), comportement déjà en place)
// vs "Supprimer définitivement" (irréversible -> deleteForever, sans détour par
// la corbeille). Évite qu'un clic sur Rejeter supprime irréversiblement par accident.
function renderRejectConfirm(s) {
  const sh = s.sheet;
  const body = document.getElementById("sheetBody");
  const sheet = document.getElementById("sheet");
  const scrim = document.getElementById("sheetScrim");
  const f = sh.fact;
  const c = f.article_retenu || {};
  body.innerHTML = `
    <div class="reject-confirm">
      <div class="reject-confirm-head">
        ${icon("i-info", "ic-l")}
        <h2 class="sheet-title">Rejeter cet article ?</h2>
      </div>
      <p class="muted">« ${esc((c.title || "").slice(0, 90))} »</p>
      <p class="muted">Choisissez ce qu'il advient de l'article rejeté :</p>
      <div class="reject-confirm-options">
        <button class="reject-confirm-option" data-reject-choice="trash">
          <div class="reject-confirm-option-head">
            ${icon("i-trash")}
            <strong>Mettre à la corbeille</strong>
            <span class="badge badge-transmitted">recommandé</span>
          </div>
          <p class="muted">Récupérable pendant 11 jours, puis suppression automatique.</p>
        </button>
        <button class="reject-confirm-option reject-confirm-danger" data-reject-choice="delete">
          <div class="reject-confirm-option-head">
            ${icon("i-close")}
            <strong>Supprimer définitivement</strong>
          </div>
          <p class="muted">Action irréversible : l'article et son historique sont effacés immédiatement.</p>
        </button>
      </div>
      <button class="btn btn-tonal btn-block" data-reject-cancel="1">Annuler</button>
    </div>`;
  sheet.hidden = false; scrim.hidden = false;
  // Bug corrigé 2026-08-20 (revue de code) : même défaut que les autres
  // points d'appel de decide() -- l'appel n'était ni attendu ni rattrapé,
  // donc le toast de succès et la fermeture du tiroir s'exécutaient même si
  // le backend refusait la transition.
  const rejectTrashBtn = body.querySelector('[data-reject-choice="trash"]');
  rejectTrashBtn.onclick = () => guardClick(rejectTrashBtn, () =>
    Store.decide(f.fact_id, "REJECTED").then(() => {
      Store.closeSheet();
      snack("Article rejeté — envoyé à la corbeille");
    }).catch(e => snack(friendlyActionError(e))));
  body.querySelector('[data-reject-choice="delete"]').onclick = () => {
    confirmAction({
      title: "Supprimer définitivement ?",
      message: "Cette action est irréversible : l'article et son historique seront effacés.",
      confirmLabel: "Supprimer",
      onConfirm: () => Store.deleteForever([f.fact_id]),
    });
  };
  const cancelBtn = body.querySelector("[data-reject-cancel]");
  if (cancelBtn) cancelBtn.onclick = () => Store.closeSheet();
  // Focus trap minimal : ramène le focus dans le panneau, Échap déjà géré globalement.
  const firstBtn = body.querySelector(".reject-confirm-option");
  if (firstBtn) firstBtn.focus();
}

// Modale de confirmation générique (remplace les window.confirm() natifs —
// audit wireframes du 2026-08-18, priorité 2 : le dialogue système casse la
// charte KORA et n'a pas la même apparence sur deux navigateurs. Un seul
// composant, réutilisé par tous les sites d'appel (suppression définitive,
// purge d'historique, retrait de compte, reset de prompt, cycle forcé...).
// Usage : confirmAction({ title, message, confirmLabel, danger, onConfirm }).

function confirmAction({ title, message, confirmLabel = "Confirmer", cancelLabel = "Annuler", danger = true, onConfirm }) {
  Store.openSheet({ type: "confirm", title, message, confirmLabel, cancelLabel, danger, onConfirm });
  renderSheet(Store.state);
}

function renderConfirmSheet(s) {
  const sh = s.sheet;
  const body = document.getElementById("sheetBody");
  const sheet = document.getElementById("sheet");
  const scrim = document.getElementById("sheetScrim");
  body.innerHTML = `
    <div class="reject-confirm">
      <div class="reject-confirm-head">
        ${icon(sh.danger ? "i-info" : "i-check", "ic-l")}
        <h2 class="sheet-title">${esc(sh.title)}</h2>
      </div>
      <p class="muted">${esc(sh.message)}</p>
      <button class="btn ${sh.danger ? "btn-danger" : "btn-primary"} btn-block" data-confirm-yes="1">${esc(sh.confirmLabel)}</button>
      <button class="btn btn-tonal btn-block" data-confirm-no="1">${esc(sh.cancelLabel)}</button>
    </div>`;
  sheet.hidden = false; scrim.hidden = false;
  const yesBtn = body.querySelector("[data-confirm-yes]");
  const noBtn = body.querySelector("[data-confirm-no]");
  yesBtn.onclick = () => { Store.closeSheet(); sh.onConfirm && sh.onConfirm(); };
  noBtn.onclick = () => Store.closeSheet();
  noBtn.focus();
}

// Vrai le temps que l'éditeur enrichi (4.4) est ouvert. Le mode édition n'est
// que de la manipulation DOM directe (pas un état du Store) ; sans ce garde,
// le poll périodique (store.js startAutoRefresh, toutes les 30s) redéclenche
// un re-render complet qui écrase le panneau d'édition et FAIT PERDRE le
// brouillon en cours de frappe. Voir le site d'appel gardé plus bas.

// Vrai le temps que l'éditeur enrichi (4.4) est ouvert (voir renderSheet()
// ci-dessous). app.js/render() a besoin de lire cet état pour ne pas
// écraser le panneau d'édition en cours -- exposé via isEditingActive()
// (une variable exportée directement serait une liaison EN LECTURE SEULE
// pour l'importeur ; render() ne fait que la lire, un getter suffit donc).
let _editingActive = false;
export function isEditingActive() { return _editingActive; }

// 2026-08-21 : plus aucune génération IA) : texte -> narration (edge-tts) +
// la même image de couverture réelle que l'article -> .mp4 (ffmpeg, zoom Ken
// Burns). Génération à la demande (1-3 min), jamais automatique -- coût
// CPU, inutile pour un brouillon jamais publié.
// Lecture Texte / Vidéo (2026-08-25, retour utilisateur explicite) : "la
// vidéo apparaît et je n'arrive plus à lire le texte... le texte passe en
// arrière-plan... la vidéo masque le texte". Cause racine identifiée : le
// lecteur <video> (jusqu'à 360px + contrôles) vivait DANS .sheet-actions,
// qui est en position: sticky; bottom: 0 avec un fond opaque (barre pensée
// pour de petits boutons d'action, pas un lecteur vidéo) -- en scrollant la
// fiche, cette barre collée au bas du viewport recouvrait bel et bien le
// texte de l'article qui défilait derrière elle. Corrigé en scindant
// l'ancien videoSection() en deux :
//   - videoActionBar() : reste dans .sheet-actions (sticky) -- seulement
//     les états COURTS (bouton "Générer", bandeau "en cours", erreur),
//     plus jamais le lecteur lui-même.
//   - videoPlayerPanel() : le lecteur + ses contrôles (durée, mode, régé-
//     nérer), déplacé dans le flux normal du contenu, sous un onglet
//     Texte/Vidéo (articleModeToggle()) qui bascule l'un OU l'autre --
//     jamais les deux en même temps, donc plus jamais de recouvrement,
//     et le choix explicite demandé par l'utilisateur ("un petit bouton
//     qui m'indique si je veux lire le texte ou la vidéo").
function videoActionBar(f, locked = false) {
  const status = f.video_status;
  // `locked` (2026-08-23, même logique que le verrouillage des actions
  // éditoriales pour un article TRANSMITTED, voir renderSheet ci-dessous) --
  // régénérer une vidéo après transmission ne propage nulle part côté
  // WordPress et n'a aucun sens une fois l'article déjà envoyé : simple
  // aperçu lecture-seule, sans bouton "Générer"/"Régénérer".
  if (!status || status === "error") {
    if (locked) return "";
    return `<div class="video-section">
      ${narrationModeSelect(f)}
      <button class="btn btn-tonal btn-block" id="videoGenBtn">${icon("i-spark")} Générer la vidéo narrée</button>
      ${status === "error" ? `<p class="muted" style="margin-top:6px">Échec précédent : ${esc(f.video_error || "erreur inconnue")}</p>` : ""}
    </div>`;
  }
  if (status === "generating") {
    return `<div class="video-section">
      <div class="video-generating"><span class="dot dot-busy"></span> Génération de la vidéo en cours… (1-3 min)</div>
    </div>`;
  }
  return ""; // "done" -> le lecteur vit désormais dans videoPlayerPanel(), plus rien à afficher ici
}

// Onglet Texte/Vidéo -- visible UNIQUEMENT quand une vidéo est prête (avant
// ça, rien à basculer : le texte est la seule chose à lire). Cible tactile
// ≥44px (voir CSS .mode-tab), rôle tablist/tab pour les lecteurs d'écran.
function articleModeToggle(f, mode) {
  if (!(f.video_status === "done" && f.video_path)) return "";
  // aria-controls/id (revue qualité, 2026-08-25) : relie explicitement
  // chaque onglet à son panneau (pattern ARIA APG "Tabs") -- sans ça, un
  // lecteur d'écran perçoit deux boutons et deux blocs de contenu séparés,
  // pas la relation onglet <-> panneau affiché.
  return `<div class="mode-toggle" role="tablist" aria-label="Format de consultation">
    <button type="button" id="modeTabText" class="mode-tab ${mode === "text" ? "active" : ""}" data-mode-tab="text" role="tab" aria-selected="${mode === "text"}" aria-controls="modePanelText">${icon("i-facts")}<span>Texte</span></button>
    <button type="button" id="modeTabVideo" class="mode-tab ${mode === "video" ? "active" : ""}" data-mode-tab="video" role="tab" aria-selected="${mode === "video"}" aria-controls="modePanelVideo">${icon("i-play")}<span>Vidéo</span></button>
  </div>`;
}

function videoPlayerPanel(f, locked, mode) {
  if (!(f.video_status === "done" && f.video_path)) return "";
  const dur = f.video_duration_sec ? `${Math.round(f.video_duration_sec / 60)} min` : "";
  return `<div class="video-section video-panel" id="modePanelVideo" role="tabpanel" aria-labelledby="modeTabVideo" data-mode-panel="video" ${mode !== "video" ? "hidden" : ""}>
      <video class="video-preview" src="/kora-v2/media/${esc(f.video_path)}" controls preload="metadata"></video>
      <div class="video-actions">
        <span class="muted">${dur ? `Durée : ${dur}` : ""}${dur ? " · " : ""}${esc(NARRATION_MODE_LABELS[f.video_narration_mode] || NARRATION_MODE_LABELS.solo)}</span>
        ${locked ? "" : `<button class="btn btn-ghost btn-sm" id="videoRegenBtn">${icon("i-refresh")} Régénérer la vidéo</button>`}
      </div>
      ${locked ? "" : narrationModeSelect(f, /* forRegen */ true)}
    </div>`;
}

// Mode de narration (2026-08-24, dialogue à deux voix façon NotebookLM) --
// 'solo' garde le comportement historique (un seul présentateur) par
// défaut, les deux modes duo sont un choix explicite de l'utilisateur.
// Libellés volontairement sans nom de personnalité réelle (même contrainte
// que le code narrate.py -- voir DIALOGUE_ALLOWED_MARKERS).
const NARRATION_MODE_LABELS = {
  solo: "Présentateur unique",
  duo_hf: "Duo (voix 1 + voix 2)",
  duo_hh: "Duo (voix 1 + voix 2)",
};

function narrationModeSelect(f, forRegen = false) {
  const current = f.video_narration_mode || "solo";
  const id = forRegen ? "narrationModeRegen" : "narrationMode";
  return `<label class="field-label" style="display:block;${forRegen ? "margin-top:10px" : "margin-bottom:8px"}">
    <span class="sr-only">Mode de narration</span>
    <select class="text-input" id="${id}">
      <option value="solo" ${current === "solo" ? "selected" : ""}>🎙️ Présentateur unique</option>
      <option value="duo_hh" ${current === "duo_hh" ? "selected" : ""}>🗣️ Dialogue à deux voix</option>
    </select>
  </label>`;
}


function renderSheet(s) {
  _editingActive = false;
  const sh = s.sheet;
  const body = document.getElementById("sheetBody");
  const sheet = document.getElementById("sheet");
  const scrim = document.getElementById("sheetScrim");
  if (!sh || !body || !sheet || !scrim) { sheet.hidden = true; scrim.hidden = true; return; }
  if (sh.type === "reject-confirm") return renderRejectConfirm(s);
  if (sh.type === "confirm") return renderConfirmSheet(s);
  if (sh.type === "source-detail") return renderSourceDetail(s);
  if (sh.type === "add-source") return renderAddSourceSheet(s);
  if (sh.type === "edit-source") return renderEditSourceSheet(s);
  const f = sh.fact; const c = f.article_retenu || {};
  const img = imgSrc(f);
  const ph = placeholderSvg(Store.getTheme());
  // Bug corrigé (revue qualité, 2026-08-25) : renderSheet() est rappelé
  // pour bien d'autres raisons que le clic sur l'onglet Texte/Vidéo (le
  // sondage du bandeau vidéo global toutes les 8s pendant QU'IMPORTE
  // QUELLE vidéo génère ailleurs dans l'appli, une régénération de texte,
  // l'annulation de l'édition...) -- body.innerHTML = ... ci-dessous
  // reconstruit TOUJOURS le <video>, quel que soit le mode, et une
  // lecture en cours revenait silencieusement à 0 à chaque re-rendu.
  // Capture l'état AVANT reconstruction, restauré juste après (voir plus
  // bas) -- seulement si l'onglet Vidéo est actif ET que la vidéo affichée
  // est bien celle de CE fait (currentSrc inchangé).
  const _prevVideo = body.querySelector('[data-mode-panel="video"] video');
  // `.src` (IDL, URL absolue résolue depuis l'attribut) plutôt que
  // `.currentSrc` : ce dernier ne se stabilise qu'après l'algorithme de
  // sélection de ressource du navigateur (asynchrone), pas forcément prêt
  // juste après la reconstruction du DOM ci-dessous -- `.src` est fiable
  // immédiatement, avant même que le chargement ait commencé.
  const _prevVideoState = _prevVideo ? {
    src: _prevVideo.src, time: _prevVideo.currentTime, playing: !_prevVideo.paused,
  } : null;
  const text = (typeof f.article === "string" ? f.article
    : (f.article && (f.article.final_text || f.article.body)))
    || f.final_text || c.summary || "";
  const status = f.status || "PENDING_REVIEW";
  // Séparation chapeau / corps : le chapeau = 1er paragraphe, le corps = RESTE (évite la duplication)
  // Nettoyage : on retire le "# Titre" markdown (déjà affiché séparément) du corps
  // Filet 2026-08-23 : un titre parfois rendu en gras seul ("**Titre**") par le LLM
  // au lieu du "# Titre" attendu (writer.py le normalise désormais à la source,
  // mais un article généré avant ce correctif peut encore traîner en base).
  let _clean = text.replace(/^#\s.*\n+/, "").replace(/^\*\*[^\n]+\*\*\n+/, "");
  const _rawParas = _clean.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  let _paras = _rawParas;
  if (_paras.length <= 1 && _clean.includes("\n")) {
    _paras = _clean.split(/\n+/).map(p => p.trim()).filter(Boolean);
  }
  const _first = _paras[0] || _clean;
  // Chapô = 1er paragraphe COMPLET (ouverture de l'article), pas tronqué arbitrairement
  const standfirst = _first;
  // Corps = tout l'article MOINS le 1er paragraphe (le chapô) -> pas de doublon, pas de coupure
  let bodyText = _clean.startsWith(_first)
    ? _clean.slice(_first.length).trim()
    : _clean;
  // Retire la section "## Le fait en bref" du corps (le chapeau joue déjà ce rôle -> évite la redondance)
  bodyText = bodyText.replace(/^##\s*Le fait en bref\b[\s\S]*?(?=##\s*Décryptage)/i, "").trim();
  // Bug corrige 2026-08-21 : légende figée sur "Illustration IA" alors que
  // KORA n'en génère plus aucune (voir generation/illustrate.py) -- une
  // vraie photo de source ne doit jamais être présentée comme une
  // illustration IA. Dérivée de image_meta.provider ("source" = photo
  // réelle d'une source du dossier, "loremflickr"/"picsum" = photo stock).
  // Nom de la source réelle (2026-08-23, demande explicite : "il faut que le
  // nom de la source d'où provient l'image figure au niveau de l'article") --
  // même donnée que celle créditée sur WordPress (voir publishing/transmit.py),
  // affichée ici aussi pour cohérence entre l'aperçu KORA et l'article publié.
  const imgSourceName = f.image_meta?.image_source_name;
  const imgCaption = f.image_meta?.provider === "source"
    ? (imgSourceName ? `Photo : ${imgSourceName}` : "Photo — KORA (source)")
    : "Photo d'illustration — KORA";
  // Mode de lecture (2026-08-25) : "texte" par défaut -- ne bascule jamais
  // automatiquement sur "vidéo" (un article vient d'abord d'être ouvert
  // pour être LU, l'ouverture ne doit pas se mettre à jouer un son sans
  // que l'utilisateur l'ait demandé). `sh.mode` vit sur l'objet sheet en
  // mémoire (pas dans Store.state) -- persiste le temps où CETTE fiche
  // reste ouverte (bascule Texte<->Vidéo sans réinitialiser le choix à
  // chaque re-rendu), mais repart à "texte" à la prochaine ouverture
  // (openFact() crée un nouvel objet sheet à chaque fois).
  const videoReady = f.video_status === "done" && !!f.video_path;
  const mode = videoReady ? (sh.mode || "text") : "text";
  sh.mode = mode;
  body.innerHTML = `
    <article class="sheet-article">
      ${img ? `<figure class="sheet-figure"><img class="sheet-img" src="${esc(img)}" alt="" onerror="this.src='${ph}'"><figcaption class="sheet-cap">${esc(imgCaption)}</figcaption></figure>` : `<figure class="sheet-figure"><img class="sheet-img" src="${ph}" alt=""><figcaption class="sheet-cap">${esc(imgCaption)}</figcaption></figure>`}
      <div class="sheet-head">
        ${icon("i-shield", "ic-l")}
        <div class="sheet-head-text">
          <div class="sheet-eyebrow">Validation humaine · KORA Agent</div>
          <h2 class="sheet-title">${esc(c.title)}</h2>
          <div class="sheet-meta-line">
            <span>${esc(c.source || "—")}</span>
            <span class="dot-sep">·</span>
            <span>${esc((f.article_retenu && f.article_retenu.level === 1) ? "Niveau 1 · Source guinéenne" : "Niveau 2 · International")}</span>
            <span class="dot-sep">·</span>
            <span>Fusion ${esc(f.n_sources || 1)} source(s)</span>
            ${f.forced_stale ? '<span class="tag tag-warn" style="margin-left:6px" title="Généré via Forcer (hors 24h) : cette information dépassait la fenêtre de fraîcheur normale de 24h.">Hors fenêtre 24h — forcé</span>' : ''}
          </div>
        </div>
        <button class="sheet-close" data-close="1" title="Fermer" aria-label="Fermer">${icon("i-close")}</button>
      </div>
      ${articleModeToggle(f, mode)}
      <div ${videoReady ? 'id="modePanelText" role="tabpanel" aria-labelledby="modeTabText"' : ""} data-mode-panel="text" ${mode !== "text" ? "hidden" : ""}>
        <p class="sheet-standfirst">${mdToHtmlInline(standfirst)}</p>
        <div class="fact-chips" style="margin:6px 0 16px">${factMeta(f, status)}</div>
        <div class="sheet-textwrap"><div class="sheet-text">${mdToHtml(bodyText || text)}</div></div>
        <div class="sheet-audit-note">${icon("i-audit")} Décision enregistrée dans l'historique · ${esc(f.n_sources || 1)} source(s) fusionnée(s)</div>
      </div>
      ${videoPlayerPanel(f, (s.auth && s.auth.role === "lecteur") || status === "TRANSMITTED", mode)}
    </article>
    ${(s.auth && s.auth.role === "lecteur") ? `
    <p class="muted source-detail-footnote" style="margin:14px 0 0">${icon("i-lock")} Rôle Lecteur : consultation seule, aucune action possible sur cet article.</p>
    ` : status === "TRANSMITTED" ? `
    <div class="sheet-actions">
      <div class="sheet-transmitted-note">
        ${icon("i-check")}
        <div>
          <strong>Déjà transmis${f.wp_status === "draft" ? " (brouillon WordPress)" : f.wp_status === "publish" ? " (publié sur WordPress)" : ""}</strong>
          <p class="muted" style="margin:4px 0 0">
            Cet article est verrouillé : plus d'approuver/modifier/régénérer/rejeter depuis KORA tant qu'il reste
            transmis. « Retirer de WordPress » met le vrai post en corbeille WordPress et rend l'article modifiable
            ici ; une republication réutilisera le même post (même lien).
          </p>
          ${f.wp_category_name ? `<p class="muted" style="margin:6px 0 0">Catégorie assignée automatiquement : <strong>${esc(f.wp_category_name)}</strong> — à corriger sur WordPress si besoin.</p>` : ""}
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
            ${f.wp_url ? `<a class="btn btn-tonal btn-sm" href="${esc(f.wp_url)}" target="_blank" rel="noopener">${icon("i-eye")} Voir sur WordPress</a>` : ""}
            ${f.wp_post_id
              ? `<button class="btn btn-primary btn-sm" data-withdraw="${esc(f.fact_id)}" title="Retirer de WordPress">${icon("i-undo")} Retirer</button>
                 <button class="btn btn-danger-ghost btn-sm" data-delete-wp="${esc(f.fact_id)}" title="Supprimer définitivement de WordPress">${icon("i-trash")} Supprimer de WordPress</button>`
              : `<span class="muted" title="Article transmis avant l'ajout du suivi -- retrait automatique indisponible pour celui-ci">${icon("i-info")} Retrait indisponible (article transmis avant ce suivi)</span>`}
          </div>
        </div>
      </div>
      ${videoActionBar(f, true)}
    </div>
    ` : `
    <div class="sheet-actions">
      <button class="btn btn-primary" data-decide="APPROVED">${icon("i-send")} Approuver &amp; transmettre</button>
      <div class="sheet-actions-row sheet-actions-row-secondary">
        <button class="btn btn-tonal" data-edit="1" aria-label="Modifier">${icon("i-edit")}<span class="btn-label">Modifier</span></button>
        <button class="btn btn-tonal" data-regen="1" aria-label="Régénérer">${icon("i-refresh")}<span class="btn-label">Régénérer</span></button>
        <button class="btn btn-danger-ghost" data-decide="REJECTED" aria-label="Rejeter">${icon("i-reject")}<span class="btn-label">Rejeter</span></button>
      </div>
      ${(status === "APPROVED" || status === "EDITED") ? `<button class="btn btn-tonal btn-block" data-retract="1">${icon("i-undo")} Annuler la décision</button>` : ""}
      <div class="regen-panel" id="regenPanel" hidden>
        <div class="regen-panel-title">Régénérer avec un angle (sans re-scraper la source)</div>
        <div class="regen-chips" id="regenChips"></div>
        <button class="btn btn-ghost btn-sm" data-regen-cancel="1">Annuler</button>
      </div>
      ${videoActionBar(f)}
    </div>`}`;
  sheet.hidden = false; scrim.hidden = false;

  const closeBtn = body.querySelector("[data-close]");
  if (closeBtn) closeBtn.onclick = () => Store.closeSheet();
  $$("[data-decide]", body).forEach(b => b.onclick = () => {
    // "Rejeter" ouvre la bulle de choix (corbeille vs suppression définitive)
    // au lieu de rejeter directement — évite une suppression accidentelle.
    if (b.dataset.decide === "REJECTED") { Store.openSheet({ type: "reject-confirm", fact: f }); renderSheet(Store.state); return; }
    // "Approuver & transmettre" ouvre désormais le même choix Publier
    // directement / Brouillon WordPress que la sélection multiple
    // (2026-08-22, demande explicite : "je veux les deux options") --
    // voir openWpChoiceForFact()/_resolveFactWpChoice() dans app.js, seul
    // endroit qui appelle réellement Store.decide("APPROVED", ...) pour ce
    // bouton désormais.
    if (b.dataset.decide === "APPROVED") { openWpChoiceForFact(f.fact_id); return; }
  });
  const rb = body.querySelector("[data-retract]");
  if (rb) rb.onclick = () => guardClick(rb, () =>
    Store.retract(f.fact_id).then(r => { if (!r?.cancelled) Store.closeSheet(); }).catch(e => snack(friendlyActionError(e))));
  // Bug corrigé (2026-08-25, trouvé en testant en conditions réelles le
  // nouveau bouton "Supprimer de WordPress") : [data-withdraw] et
  // [data-delete-wp] (bloc TRANSMITTED ci-dessus) n'étaient liés QUE dans
  // app.js::render() (rebind générique après CHAQUE render du Store) --
  // mais renderSheet() est aussi appelée DIRECTEMENT (openFact(), et
  // plusieurs endroits dans ce fichier même : reject-confirm, edit, decide)
  // SANS jamais repasser par render(). Chaque appel direct reconstruit le
  // DOM du tiroir via body.innerHTML, produisant des boutons FLAMBANT
  // NEUFS sans aucun gestionnaire de clic tant qu'un prochain passage par
  // render() (ex: le poll 30s) ne les relie pas -- le clic ne faisait
  // simplement rien pendant cette fenêtre. Liés ICI directement, même
  // pattern que closeBtn/rb/ed ci-dessus (auto-suffisant, jamais tributaire
  // d'un rebind externe).
  const wb = body.querySelector("[data-withdraw]");
  if (wb) wb.onclick = () => guardClick(wb, () =>
    Store.withdrawFromWordPress(f.fact_id).then(r => {
      if (r?.cancelled) return;
      if (r?.warning) snack(`Article retiré (${r.warning})`);
      else snack("Article retiré de WordPress, redevenu modifiable.");
      Store.closeSheet();
    }).catch(e => snack(friendlyActionError(e))));
  const dwb = body.querySelector("[data-delete-wp]");
  if (dwb) dwb.onclick = () => confirmAction({
    title: "Supprimer définitivement de WordPress ?",
    message: "Le post sera détruit sur WordPress, sans passer par sa corbeille -- aucun retour en arrière possible. L'article restera consultable dans la corbeille de KORA.",
    confirmLabel: "Supprimer de WordPress",
    onConfirm: () => guardClick(dwb, () =>
      Store.deleteFromWordPress(f.fact_id).then(r => {
        if (r?.warning) snack(`Supprimé de WordPress (${r.warning})`);
        else snack("Article supprimé définitivement de WordPress.");
      }).catch(e => snack(friendlyActionError(e)))),
  });
  const ed = body.querySelector("[data-edit]");
  if (ed) ed.onclick = () => {
    body.innerHTML = `
      <div class="sheet-head">
        ${icon("i-edit", "ic-l")}
        <div class="sheet-head-text">
          <div class="sheet-eyebrow">Correction avant validation</div>
          <h2 class="sheet-title">${esc(c.title)}</h2>
        </div>
        <span class="rte-status" id="rteStatus">Brouillon local</span>
        <button class="sheet-close" data-close="1" title="Fermer" aria-label="Fermer">${icon("i-close")}</button>
      </div>
      <p class="muted" style="margin:10px 0 12px">Corrige le titre et le corps avant validation. La version éditée remplace l'original.</p>
      <input id="edTitle" class="edit-input" value="${esc(c.title)}">
      <div class="rte-toolbar" role="toolbar" aria-label="Mise en forme">
        <select id="rteHeading" class="rte-select" aria-label="Style de paragraphe">
          <option value="0">Paragraphe</option>
          <option value="2">Titre 2</option>
          <option value="3">Titre 3</option>
        </select>
        <span class="rte-sep" aria-hidden="true"></span>
        <button type="button" class="rte-btn" id="rteBold" title="Gras" aria-label="Gras"><strong>G</strong></button>
        <button type="button" class="rte-btn" id="rteItalic" title="Italique" aria-label="Italique"><em>I</em></button>
        <button type="button" class="rte-btn" id="rteUnderline" title="Souligné" aria-label="Souligné"><u>S</u></button>
        <span class="rte-sep" aria-hidden="true"></span>
        <button type="button" class="rte-btn" id="rteList" title="Liste à puces" aria-label="Liste à puces">${icon("i-more")}</button>
        <button type="button" class="rte-btn" id="rteLink" title="Insérer un lien" aria-label="Insérer un lien">${icon("i-source")}</button>
        <span class="rte-sep" aria-hidden="true"></span>
        <button type="button" class="rte-btn" id="rteUndo" title="Annuler (Ctrl+Z)" aria-label="Annuler">${icon("i-undo")}</button>
        <button type="button" class="rte-btn" id="rteRedo" title="Rétablir (Ctrl+Y)" aria-label="Rétablir">${icon("i-refresh")}</button>
      </div>
      <textarea id="edText" class="edit-area">${esc(text)}</textarea>
      <div class="sheet-actions">
        <button class="btn btn-tonal" id="edCancel">Annuler</button>
        <div class="sheet-actions-row">
          <button class="btn btn-tonal" id="edSaveDraft">${icon("i-edit")} Enregistrer le brouillon</button>
          <button class="btn btn-primary" id="edApprove">${icon("i-check")} Approuver</button>
        </div>
      </div>`;
    const close2 = body.querySelector("[data-close]");
    if (close2) close2.onclick = () => Store.closeSheet();
    const ta = document.getElementById("edText");
    const status = document.getElementById("rteStatus");
    const markDirty = () => { status.textContent = "Modifications non enregistrées"; status.classList.remove("rte-status-saved"); };
    ta.addEventListener("input", markDirty);
    document.getElementById("edTitle").addEventListener("input", markDirty);
    document.getElementById("rteHeading").onchange = (ev) => { rteHeading(ta, Number(ev.target.value) || 0); };
    document.getElementById("rteBold").onclick = () => rteWrapSelection(ta, "**");
    document.getElementById("rteItalic").onclick = () => rteWrapSelection(ta, "*");
    document.getElementById("rteUnderline").onclick = () => rteWrapSelection(ta, "<u>", "</u>");
    document.getElementById("rteList").onclick = () => rtePrefixLines(ta, "- ");
    document.getElementById("rteLink").onclick = () => rteLink(ta);
    // execCommand undo/redo est dépréciée mais reste fonctionnelle sur les
    // <textarea> dans les navigateurs Chromium/Firefox actuels ; Ctrl+Z natif
    // marche de toute façon sans ce bouton (fallback silencieux sinon).
    document.getElementById("rteUndo").onclick = () => { ta.focus(); try { document.execCommand("undo"); } catch (_) {} };
    document.getElementById("rteRedo").onclick = () => { ta.focus(); try { document.execCommand("redo"); } catch (_) {} };
    const getEdited = () => ({ t: document.getElementById("edTitle").value, x: ta.value });
    const edSaveDraft = document.getElementById("edSaveDraft");
    if (edSaveDraft) edSaveDraft.onclick = () => {
      const { t, x } = getEdited();
      f._edited = { title: t, text: x };
      Store.decide(f.fact_id, "EDITED", x).then(() => {
        Store.closeSheet();
        snack("Brouillon enregistré");
      }).catch(e => snack(friendlyActionError(e)));
    };
    const edApprove = document.getElementById("edApprove");
    if (edApprove) edApprove.onclick = () => {
      const { t, x } = getEdited();
      f._edited = { title: t, text: x };
      // Bug corrigé 2026-08-20 (4e/8e passage de revue) : ce bouton n'affichait
      // jamais r.transmission (ni le skip WP, ni un VRAI échec d'envoi)
      // contrairement au bouton "Approuver & transmettre" du tiroir principal
      // -- un éditeur pouvait croire l'article publié sur WordPress alors
      // qu'il n'avait été qu'approuvé localement, ou que l'envoi avait échoué.
      Store.decide(f.fact_id, "APPROVED", x).then(r => {
        // Bug corrigé 2026-08-20 (9e passage de revue) : SKIPPED_ALREADY_TRANSMITTED
        // signifie que decide() n'a JAMAIS été appelé côté serveur (garde-fou
        // en amont, voir _already_transmitted_skip dans server.py) -- le texte
        // corrigé n'a donc été enregistré NULLE PART. Le message générique
        // laissait croire à une simple info sur l'envoi WordPress ; on le
        // rend explicite ici, et on laisse le tiroir ouvert pour ne pas
        // perdre la correction sous les yeux de l'éditeur.
        if (r?.transmission?.status === "SKIPPED_ALREADY_TRANSMITTED") {
          snack("Article déjà publié entre-temps — vos modifications n'ont PAS été enregistrées. Utilisez « Annuler la décision » puis réessayez.");
          return;
        }
        const msg = transmissionMessage(r?.transmission);
        if (msg) snack(msg);
        Store.closeSheet();
      }).catch(e => snack(friendlyActionError(e)));
    };
    const edCancel = document.getElementById("edCancel");
    if (edCancel) edCancel.onclick = () => renderSheet(s);
    // Fige le panneau : le poll périodique ne doit plus l'écraser tant que
    // l'éditeur est ouvert (voir _editingActive en tête de fichier).
    _editingActive = true;
  };
  // ---- Régénération (sans re-scrape) : bouton + panneau de suggestions ----
  const regenBtn = body.querySelector("[data-regen]");
  const regenPanel = body.querySelector("#regenPanel");
  const regenChips = body.querySelector("#regenChips");
  const regenCancel = body.querySelector("[data-regen-cancel]");
  if (regenBtn && regenPanel) {
    regenBtn.onclick = async () => {
      // Garde-fou (2026-08-19, demande explicite) : "Régénérer" remplace
      // IMMÉDIATEMENT le texte affiché, sans confirmation jusqu'ici -- sur
      // un brouillon (EDITED), ça écrasait silencieusement des corrections
      // manuelles déjà faites. Sur un article déjà envoyé (APPROVED/
      // TRANSMITTED), ça changeait le texte ici sans toucher à la version
      // déjà transmise sur WordPress, ce qui n'était pas évident non plus.
      // Statut "vierge" (PENDING_REVIEW) : rien à perdre, pas de confirmation.
      if (status === "EDITED") {
        if (!window.confirm("Ce brouillon contient des corrections que tu as faites manuellement. Régénérer va les REMPLACER par un nouveau texte généré par l'IA -- tes modifications actuelles seront perdues. Continuer ?")) return;
      } else if (status === "APPROVED" || status === "TRANSMITTED") {
        if (!window.confirm("Cet article a déjà été approuvé/transmis. Le régénérer changera le texte affiché ici, mais ne republiera PAS automatiquement la version déjà envoyée sur WordPress. Continuer ?")) return;
      }
      regenPanel.hidden = false;
      regenChips.innerHTML = "<span class='muted'>Chargement…</span>";
      let sugs = [];
      try { const r = await Store.api("/api/regen-suggestions"); sugs = (r && r.suggestions) || []; }
      catch (e) { sugs = []; }
      if (!sugs.length) sugs = [{ id: "neutre", label: "Réécriture neutre" }];
      regenChips.innerHTML = sugs.map(s =>
        `<button class="regen-chip" data-sug="${esc(s.id)}" title="${esc(s.hint || '')}">${esc(s.label)}</button>`
      ).join("");
      regenChips.querySelectorAll(".regen-chip").forEach(chip => {
        chip.onclick = async () => {
          chip.classList.add("loading");
          try {
            const r = await Store.regenerate(f.fact_id, chip.dataset.sug);
            // Met à jour le fact localement (article + modèle) puis re-rend le sheet
            if (r && r.article) {
              f.article = r.article;
              f.gen_model = r.model || f.gen_model;
              f.gen_status = r.status || f.gen_status;
              // reflète aussi dans state.facts si présent
              const inList = (Store.state.facts || []).find(x => x.fact_id === f.fact_id);
              if (inList) { inList.article = r.article; inList.gen_model = r.model; }
              Store.setState({ facts: Store.state.facts });
            }
            renderSheet(s);
          } catch (e) {
            regenChips.innerHTML = `<span class="tag tag-warn">Erreur : ${esc(e.message)}</span>`;
          }
        };
      });
    };
  }
  if (regenCancel) regenCancel.onclick = () => { regenPanel.hidden = true; };

  // ---- Vidéo narrée (2026-08-20) : déclenchement + sondage du statut ----
  const videoGenBtn = body.querySelector("#videoGenBtn");
  const videoRegenBtn = body.querySelector("#videoRegenBtn");
  const startVideoFlow = async (btn, narrationMode) => {
    if (btn) { btn.disabled = true; btn.textContent = "Démarrage…"; }
    try {
      // Sondage désormais géré par le Store (Store.startVideoJob), pas ici --
      // il pilote le bandeau global #videoJobBanner et survit à la fermeture
      // de cette fiche (2026-08-21). Le rendu de la fiche se met à jour tout
      // seul via renderSheet() rappelé depuis render() à chaque tick du Store.
      await Store.startVideoJob(f.fact_id, f.title || "", narrationMode);
      f.video_status = "generating";
      renderSheet(s);
    } catch (e) {
      snack("Erreur : " + (e.message || "échec du démarrage"));
      renderSheet(s);
    }
  };
  if (videoGenBtn) videoGenBtn.onclick = () => {
    const sel = body.querySelector("#narrationMode");
    startVideoFlow(videoGenBtn, sel ? sel.value : "solo");
  };
  if (videoRegenBtn) videoRegenBtn.onclick = () => {
    if (!window.confirm("Régénérer la vidéo va remplacer la vidéo actuelle (nouvelle narration, nouvelles images). Continuer ?")) return;
    const sel = body.querySelector("#narrationModeRegen");
    startVideoFlow(videoRegenBtn, sel ? sel.value : (f.video_narration_mode || "solo"));
  };

  // Restauration de la lecture vidéo (voir _prevVideoState plus haut) --
  // uniquement si c'est bien la MÊME source (même fait, même fichier), pour
  // ne jamais faire "sauter" une vidéo différente à une position issue
  // d'une autre. Un play() programmatique ici n'est PAS un premier
  // déclenchement : c'est la continuation d'une lecture déjà autorisée par
  // un geste utilisateur plus tôt dans la session -- les navigateurs
  // l'autorisent (contrairement à un autoplay initial).
  if (_prevVideoState && _prevVideoState.playing) {
    const newVideo = body.querySelector('[data-mode-panel="video"] video');
    if (newVideo && newVideo.src === _prevVideoState.src) {
      // currentTime ne peut être fixé de façon fiable qu'une fois les
      // métadonnées chargées (readyState >= HAVE_METADATA) -- avant ça,
      // certains navigateurs ignorent silencieusement l'affectation.
      const _restore = () => { newVideo.currentTime = _prevVideoState.time; newVideo.play().catch(() => {}); };
      if (newVideo.readyState >= 1) _restore();
      else newVideo.addEventListener("loadedmetadata", _restore, { once: true });
    }
  }

  // ---- Onglet Texte/Vidéo (2026-08-25) : bascule locale, SANS re-rendu
  // complet de la fiche -- un renderSheet() ici rechargerait le <video>
  // (reset de la position de lecture) et ramènerait le scroll en haut,
  // deux régressions inutiles pour un simple changement d'onglet. Juste du
  // show/hide + mise à jour visuelle des onglets ; `sh.mode` est mis à jour
  // pour que la fiche rouvre sur le même onglet si renderSheet() est
  // rappelé pour une AUTRE raison (ex. sondage de génération vidéo).
  const modeTabs = $$("[data-mode-tab]", body);
  if (modeTabs.length) {
    modeTabs.forEach(tab => tab.onclick = () => {
      const newMode = tab.dataset.modeTab;
      sh.mode = newMode;
      modeTabs.forEach(t => {
        const active = t === tab;
        t.classList.toggle("active", active);
        t.setAttribute("aria-selected", active ? "true" : "false");
      });
      const textPanel = body.querySelector('[data-mode-panel="text"]');
      const videoPanel = body.querySelector('[data-mode-panel="video"]');
      if (textPanel) textPanel.hidden = newMode !== "text";
      if (videoPanel) videoPanel.hidden = newMode !== "video";
      // En quittant l'onglet Vidéo, on met en pause plutôt que de laisser
      // la narration continuer à jouer hors champ (surprise sonore sur
      // mobile en particulier, notamment si l'onglet Texte est repris pour
      // lire pendant que la vidéo continuerait de tourner en arrière-plan).
      if (newMode !== "video") {
        const v = videoPanel ? videoPanel.querySelector("video") : null;
        if (v && !v.paused) v.pause();
      }
    });
  }
}

export { renderSheet, confirmAction };
