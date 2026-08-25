/* ============================================================
   KORA — utils.js : helpers partagés (DOM, markdown, chips, statuts,
   messages d'action). Extrait de app.js le 22/08/2026 (refacto plan
   étape 4) — regroupe tout ce qui est utilisé par PLUSIEURS modules
   (vues, sheet.js, app.js) sans dépendre lui-même d'une page précise.
   ============================================================ */
import { Store } from "./store.js";
import { marked } from "marked";
import DOMPurify from "dompurify";

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => root ? Array.from(root.querySelectorAll(sel)) : [];
const esc = (s) => String(s == null ? "" : s).replace(/[&<>`"'$]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "`": "&#96;", '"': "&quot;", "'": "&#39;", "$": "&#36;" }[c]));
// Propriétaire hérite de tout ce qu'Administrateur peut faire (2026-08-19,
// restructuration rôles/permissions — voir permissions.py ROLES_ORDER côté
// serveur, où owner > advanced par rang). Les écrans qui réservaient une
// section à role==="advanced" doivent aussi l'ouvrir à "owner", sinon un
// Propriétaire se retrouve avec MOINS d'accès qu'un Administrateur au lieu
// de plus — régression repérée en test réel après la Phase 1.
const isAdvancedRole = (role) => role === "advanced" || role === "owner";
// Markdown + HTML rendu de façon SÛRE (sanitisé).
// Avant on échappait tout le texte -> un article contenant du HTML (ex: un
// <a href> Google News ou du HTML brut de source) s'affichait comme du "code"
// au lieu d'un texte. On parse maintenant le Markdown ET on laisse passer le
// HTML inline, mais on le passe par DOMPurify pour bloquer tout XSS.
marked.setOptions({ breaks: true, gfm: true });
const _render = (s) => {
  const raw = marked.parse(String(s == null ? "" : s));
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
};
const mdToHtml = (s) => _render(s);
const mdToHtmlInline = (s) => _render(s);

// ============================================================================
// ÉDITEUR ENRICHI (wireframe 4.4) — helpers de manipulation Markdown.
// L'article reste stocké en Markdown (compatible backend/writer.py) ; la barre
// d'outils insère/enlève la syntaxe Markdown autour de la sélection du
// <textarea>, façon éditeur riche, sans dépendance externe.
// ============================================================================
function rteWrapSelection(ta, before, after = before) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const selected = value.slice(s, e);
  ta.value = value.slice(0, s) + before + selected + after + value.slice(e);
  ta.selectionStart = s + before.length;
  ta.selectionEnd = s + before.length + selected.length;
  ta.focus();
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}
function rtePrefixLines(ta, prefix) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  // Étend la sélection aux débuts/fins de ligne complètes.
  const lineStart = value.lastIndexOf("\n", s - 1) + 1;
  let lineEnd = value.indexOf("\n", e);
  if (lineEnd === -1) lineEnd = value.length;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split("\n").map(l => l.startsWith(prefix) ? l : prefix + l);
  const newBlock = lines.join("\n");
  ta.value = value.slice(0, lineStart) + newBlock + value.slice(lineEnd);
  ta.selectionStart = lineStart;
  ta.selectionEnd = lineStart + newBlock.length;
  ta.focus();
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}
function rteHeading(ta, level) {
  const { selectionStart: s, value } = ta;
  const lineStart = value.lastIndexOf("\n", s - 1) + 1;
  let lineEnd = value.indexOf("\n", s);
  if (lineEnd === -1) lineEnd = value.length;
  const line = value.slice(lineStart, lineEnd).replace(/^#{1,6}\s*/, "");
  const prefix = level ? "#".repeat(level) + " " : "";
  ta.value = value.slice(0, lineStart) + prefix + line + value.slice(lineEnd);
  ta.focus();
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}
function rteLink(ta) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const selected = value.slice(s, e) || "texte du lien";
  const url = window.prompt("URL du lien :", "https://");
  if (!url) return;
  const md = `[${selected}](${url})`;
  ta.value = value.slice(0, s) + md + value.slice(e);
  ta.focus();
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}
// Icônes : on utilise le SPRITE SVG inline (injecté dans le <body> par le
// build, voir postbuild.mjs + icons.js) plutôt que la police Material Icons.
// Avantage : aucun flash de texte (ex: "visibility" sur l'œil du mot de passe)
// car le <use href="#i-..."> résout immédiatement depuis le DOM, sans
// dépendre d'une police web async.
const icon = (id, cls = "") => `<svg class="ic ${cls}" aria-hidden="true"><use href="#${id}"></use></svg>`;
function placeholderSvg(theme) {
  const pal = {
    dark:  ["#241C18", "#15110F", "#E9705D"],
    cacao: ["#3A2418", "#241712", "#E9705D"],
    light: ["#ECE7DF", "#F4F1EC", "#B5573A"],
  }[theme] || ["#241C18", "#15110F", "#E9705D"];
  return "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="'+pal[0]+'"/><stop offset="1" stop-color="'+pal[1]+'"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><g fill="none" stroke="'+pal[2]+'" stroke-width="3" opacity=".7"><rect x="118" y="64" width="84" height="60" rx="10"/><circle cx="142" cy="86" r="9"/><path d="M124 118l24-26 18 18 14-12 20 22"/></g></svg>'
  );
}

function chip(label, kind = "", ic = "") {
  // kind = primary|secondary|tertiary|warning|error → classe MD3 .chip-<kind>
  const k = kind ? (kind.startsWith("chip-") ? kind : "chip-" + kind) : "";
  return `<span class="chip ${k}">${ic ? icon(ic) : ""}${esc(label)}</span>`;
}
function factMeta(f, status, compact) {
  const c = f.article_retenu || {};
  const lvl = c.level || (c.guinee_filter ? 2 : 1);
  const st = status || f.status || "PENDING_REVIEW";
  // Nommage métier unifié (2026-08-25, demande explicite utilisateur) :
  // PENDING_REVIEW s'appelait "En attente" ICI mais "À décider" sur la
  // carte KPI du tableau de bord (views/dashboard.js) -- deux libellés pour
  // le même statut, incohérence jamais remarquée avant l'audit de
  // nommage. Unifié sur "À approuver" (forme compacte) / "Articles à
  // approuver" (forme longue, dashboard.js) -- vocabulaire commun à tout
  // l'écran, voir STATUS_FR export plus bas pour la version longue.
  const stMap = { PENDING_REVIEW: "À approuver", APPROVED: "Approuvé", REJECTED: "Rejeté", TRANSMITTED: "Transmis", EDITED: "Édité", TRANSMISSION_FAILED: "Échec d'envoi" };
  const stLabel = stMap[st] || st || "À approuver";
  const lvlLabel = compact
    ? (lvl === 1 ? "Niveau 1" : "Niveau 2")
    : (lvl === 1 ? "Niveau 1 · Source guinéenne" : "Niveau 2 · International filtrée");
  // En mode carte (compact), on retire les puces de métadonnées (surcharge visuelle) ;
  // seul le statut est conservé via .fact-status. Dans le tiroir (sheet), on garde tout.
  if (compact) return "";
  const items = [
    chip(lvlLabel, lvl === 1 ? "primary" : "secondary", lvl === 1 ? "i-level1" : "i-level2"),
    chip((f.n_sources || 1) + " source" + ((f.n_sources || 1) > 1 ? "s" : ""), "tertiary", "i-fusion"),
    chip("Date OK", "tertiary", "i-date"),
  ];
  // Catégorie suggérée (2026-08-23, classement automatique) : visible AVANT
  // décision, pour que l'éditeur voie ce qui sera appliqué à la transmission
  // sans avoir à approuver d'abord. wp_category_name (déjà transmis) prime
  // si présent -- c'est la catégorie RÉELLEMENT appliquée, pas une suggestion.
  const catLabel = f.wp_category_name || f.suggested_category;
  if (!compact && catLabel) items.push(chip(catLabel, "secondary", "i-source"));
  // en mode carte, le statut est déjà affiché dans la ligne .fact-status (pas de doublon)
  if (!compact) items.push(`<span class="badge badge-pending">${esc(stLabel)}</span>`);
  return items.join("");
}
function statusBadge(st) {
  const map = {
    PENDING_REVIEW: ["badge-pending", "À approuver"],
    APPROVED: ["badge-approved", "Approuvé"],
    REJECTED: ["badge-rejected", "Rejeté"],
    TRANSMITTED: ["badge-transmitted", "Transmis"],
    EDITED: ["badge-pending", "Édité"],
    TRASHED: ["badge-rejected", "Corbeille"],
    TRANSMISSION_FAILED: ["badge-rejected", "Échec d'envoi"],
  };
  const [k, t] = map[st] || ["badge-pending", st || "—"];
  return `<span class="badge ${k}">${t}</span>`;
}

function imgSrc(f) {
  const c = f.article_retenu || {};
  const base = (f.image_meta && f.image_meta.image) || f.image || c.image || "";
  if (base && base.startsWith("http")) return base;
  const seed = (f.fact_id || f.id || f.title || "kora").split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) % 100000;
  return `https://picsum.photos/seed/${seed}/800/450`;
}
function hasImg(f) {
  const c = f.article_retenu || {};
  const img = imgSrc(f);
  // Une image valide = URL http(s), pas le placeholder SVG data:
  return typeof img === "string" && img.startsWith("http");
}

function stateBox(ic, title, msg, loading = false, actionLabel = null, actionFn = null, kind = "") {
  const icWrap = loading
    ? `<div class="wave" style="height:34px;margin:0 auto 18px"><i></i><i></i><i></i><i></i><i></i></div>`
    : `<span class="state-ic ${kind === "error" ? "err" : ""}">${icon(ic)}</span>`;
  return `<div class="state-box ${kind === "error" ? "error" : ""}">
    ${icWrap}
    <h3>${esc(title)}</h3>
    <p>${esc(msg)}</p>
    ${actionLabel ? `<button class="btn btn-primary" id="stateAction">${esc(actionLabel)}</button>` : ""}
  </div>`;
}

const ROLE_LABEL_FR = { owner: "Propriétaire", advanced: "Avancé", normal: "Normal", lecteur: "Lecteur" };

// Traduit les codes d'erreur bruts renvoyés par le backend HITL (decide()/
// retract()) en messages compréhensibles. Ajouté 2026-08-20 : avant ce
// correctif, un rejet de transition (ex: "transition_interdite") n'était
// JAMAIS affiché nulle part -- le tiroir se fermait silencieusement comme
// si l'action avait réussi. Voir hitl_store.py pour les codes d'origine.
function friendlyActionError(e) {
  const msg = (e && e.message) || String(e);
  if (msg.startsWith("transition_interdite")) {
    return "Action impossible : ce changement de statut n'est pas autorisé depuis l'état actuel de l'article.";
  }
  if (msg.startsWith("retrait_non_autorise_depuis")) {
    return "Annulation impossible depuis le statut actuel de cet article.";
  }
  if (msg.startsWith("introuvable")) {
    return "Cet article est introuvable (il a peut-être été modifié ailleurs) — la liste va se rafraîchir.";
  }
  return `Erreur : ${msg}`;
}
// Traduit un objet r.transmission (voir publishing/transmit.py) en message à
// afficher, ou null si tout va bien et qu'il n'y a rien à signaler. Ajouté
// 2026-08-20 (8e passage de revue) : seuls les cas SKIPPED_* étaient
// affichés -- un VRAI échec d'envoi WordPress (FAILED/ERROR/PARTIAL/
// SKIPPED_DUPLICATE, transmit.py) passait inaperçu : decide() avait réussi
// (article "Approuvé" côté KORA) mais l'envoi avait échoué, et le tiroir se
// fermait comme si tout s'était bien passé -- exactement la classe de bug
// que ce diff visait à corriger.
function transmissionMessage(tx) {
  if (!tx || !tx.status) return null;
  if (tx.status === "TRANSMITTED" || tx.status === "DRY_RUN_OK") {
    // image_warning (2026-08-22, bug rapporté : "je n'ai point vu d'image") :
    // le post WordPress peut très bien réussir SANS image de couverture --
    // WP accepte featured_media=0 sans broncher, donc ce cas se confondait
    // avec un succès complet (aucun message affiché auparavant). On le
    // signale désormais explicitement, sans pour autant crier à l'échec :
    // l'article EST en ligne, seule l'image manque.
    // content_warning (2026-08-22, demande explicite : "rien ne doit faire
    // croire que ceci est l'oeuvre d'une IA") : filet mécanique côté serveur
    // (transmit.py::_detect_language_artifacts), complémentaire à l'auto-
    // critique LLM -- signale à l'éditeur qu'une relecture manuelle s'impose
    // AVANT de rendre l'article public, sans jamais bloquer la transmission.
    const parts = [];
    if (tx.image_warning && tx.video_warning) parts.push(`SANS image (${tx.image_warning}) ni vidéo (${tx.video_warning})`);
    else if (tx.image_warning) parts.push(`SANS image de couverture (${tx.image_warning})`);
    else if (tx.video_warning) parts.push(`SANS la vidéo narrée (${tx.video_warning})`);
    if (tx.content_warning) parts.push(tx.content_warning);
    if (!parts.length) return null;
    return `Article transmis, mais ${parts.join(" — ")}.`;
  }
  if (tx.status === "SKIPPED_NO_WP_RIGHT" || tx.status === "SKIPPED_ALREADY_TRANSMITTED") return tx.detail;
  // FAILED / ERROR / PARTIAL / SKIPPED_DUPLICATE / tout autre statut inattendu.
  return `Article approuvé mais l'envoi WordPress a échoué (${tx.status}) — vérifiez la configuration ou réessayez.`;
}

// snack() = toast ÉPHÉMÈRE local à cette session, pour le retour immédiat
// d'une action que l'utilisateur vient de faire lui-même (2026-08-22 :
// découplé du centre de notifications, désormais persistant côté serveur
// -- voir renderNotifCenter() -- et alimenté séparément, uniquement pour
// les évènements de FOND qui méritent de survivre à un rechargement).
// Garde anti-double-soumission (2026-08-22, bug rapporté : un rejet cliqué
// 5 fois en 9s -- rien ne désactivait le bouton pendant l'aller-retour
// réseau, chaque clic supplémentaire lançait un NOUVEL appel Store.decide()
// en parallèle. Les réponses pouvaient revenir dans le désordre, la plus
// ancienne écrasant l'état le plus frais dans loadStats() -> compteurs
// visiblement figés/incohérents malgré des actions bien enregistrées côté
// serveur, confirmé par l'audit : 5 REJECTED consécutifs sur le MÊME fait).
// `run` doit retourner la Promise de l'action ; le bouton est réactivé
// automatiquement en cas d'échec (en cas de succès, le tiroir/la ligne
// disparaît généralement de toute façon).
function guardClick(btn, run) {
  if (!btn || btn.disabled) return; // déjà en cours -- ignore les clics suivants
  btn.disabled = true;
  Promise.resolve(run()).catch(() => {}).finally(() => { btn.disabled = false; });
}
function snack(msg) {
  const sn = document.getElementById("snackbar");
  if (sn) {
    // B4 (audit UX Sources, 2026-08-24) : hidden retiré AVANT de poser le
    // texte -- un lecteur d'écran n'annonce fiablement une mutation
    // aria-live que sur une région déjà présente/visible dans l'arbre
    // d'accessibilité, pas sur l'insertion simultanée contenu+affichage.
    sn.hidden = false; sn.textContent = msg;
    // F7 : remonte le toast au-dessus du panneau #sheet quand il est ouvert
    // (recouvrement constaté, ex. formulaire "Ajouter une source") --
    // décalage calculé depuis la hauteur RÉELLE du panneau affiché, pas une
    // valeur fixe (un panneau court et un panneau plein écran n'ont pas la
    // même hauteur).
    const sheetEl = document.getElementById("sheet");
    if (sheetEl && !sheetEl.hidden) {
      const top = sheetEl.getBoundingClientRect().top;
      sn.style.bottom = Math.max(106, window.innerHeight - top + 16) + "px";
    } else {
      sn.style.bottom = "";
    }
    // Duree adaptee a la longueur du message (2026-08-20) : les 2.6s fixes
    // suffisent pour "Erreur : ..." mais pas pour un message explicatif
    // complet (ex. fin de cycle "rien de neuf", plusieurs phrases) --
    // laisse le temps de lire sans pour autant bloquer indefiniment.
    const dur = Math.max(2600, Math.min(9000, msg.length * 60));
    clearTimeout(sn._t); sn._t = setTimeout(() => sn.hidden = true, dur);
  }
}

export {
  $, $$, esc, isAdvancedRole, mdToHtml, mdToHtmlInline,
  rteWrapSelection, rtePrefixLines, rteHeading, rteLink,
  icon, placeholderSvg, chip, factMeta, statusBadge,
  imgSrc, hasImg, stateBox, ROLE_LABEL_FR,
  friendlyActionError, transmissionMessage, guardClick, snack,
};
