/* ============================================================
   KORA — views/facts.js : page Articles (+ Brouillons, sous-vue liée) et
   les actions en masse (publier/rejeter/corbeille par sélection). Extrait
   de app.js le 22/08/2026 (refacto plan étape 4).
   ============================================================ */
import { Store } from "../store.js";
import { esc, icon, factMeta, imgSrc, placeholderSvg, stateBox, snack, friendlyActionError, statusBadge, transmissionMessage } from "../utils.js";
import { helpTip } from "../tour.js";
// Lecteur vidéo inline (2026-08-23, demande explicite : "les faire
// apparaître sur la page Publiés avec leur affordance vidéo -- lecture
// inline, durée") -- réutilise les mêmes blocs que la page Vidéos plutôt
// que de dupliquer le HTML/la logique de lecture (voir viewPublished()).
import { videoListenButton, videoPlayerWrap, fmtDuration } from "./videos.js";

function factCard(f, s, idx) {
  const c = f.champion || {};
  const dec = s.decisions[f.fact_id];
  const img = imgSrc(f);
  const status = dec || (f.status || "PENDING_REVIEW");
  const ph = placeholderSvg(Store.getTheme());
  const src = img ? esc(img) : ph;
  // Fallback fiable : si l'image (réelle ou picsum) échoue, on bascule vers
  // picsum (service qui répond) plutôt que vers un placeholder vide.
  const seed = (f.fact_id || f.id || f.title || "kora").split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) % 100000;
  const fallback = `https://picsum.photos/seed/${seed}/800/450`;
  // fallback : si fact_id absent, on utilise l'index de la carte
  const fid = f.fact_id || ("idx" + idx);
  // Verrouillage sélection (2026-08-23, même principe que le tiroir article
  // pour un fait TRANSMITTED, voir sheet.js) : un article déjà transmis à
  // WordPress ne doit JAMAIS pouvoir entrer dans un lot d'actions groupées
  // (corbeille, suppression, brouillon, rejet...) -- son état réel vit en
  // partie sur WordPress désormais, hors du contrôle de KORA ; l'y inclure
  // silencieusement créait un mensonge d'affichage possible (ex: mis à la
  // corbeille dans KORA alors que le post reste bien en ligne).
  const locked = status === "TRANSMITTED";
  const sel = !locked && !!s.selection[fid];
  // Rendu fact-check : toujours présent pour les non-verrouillés (hover desktop + appui long mobile),
  // masqué par CSS hors selectMode/hover. En mode sélection, l'état on/off est visible.
  const check = locked
    ? (s.selectMode ? `<div class="fact-check fact-check-locked" title="Article déjà transmis : non sélectionnable">${icon("i-lock")}</div>` : "")
    : `<div class="fact-check ${sel ? "on" : ""}" data-check="${esc(fid)}" aria-label="Sélectionner">${sel ? icon("i-check") : ""}</div>`;
  const click = (s.selectMode && !locked) ? `onclick="Store.toggleSelect('${esc(fid)}')"` : `onclick="App.openFact('${esc(fid)}')"`;
  return `
    <article class="fact-card ${s.selectMode ? "selectable" : ""} ${sel ? "selected" : ""} ${s.selectMode && locked ? "select-locked" : ""}" data-fact="${esc(fid)}" data-index="${idx}" ${click}>
      ${check}
      <img class="fact-img" src="${src}" alt="" loading="lazy" onerror="this.onerror=null; this.src='${esc(fallback)}'">
      <div class="fact-body">
        <h3 class="fact-title">${esc(c.title || "(sans titre)")}</h3>
        <div class="fact-chips">${factMeta(f, undefined, true)}</div>
        <div class="fact-status">${statusBadge(status)} <span class="muted">${esc(c.source || "Source")}</span></div>
      </div>
    </article>`;
}
function factGroup(facts, s, status, label, iconName, ignoreImg = false) {
  const list = facts.filter(f => {
    const d = s.decisions[f.fact_id];
    const st = d || f.status || "PENDING_REVIEW";
    if (status === "PENDING_REVIEW") return st === "PENDING_REVIEW";
    if (status === "TRANSMITTED") return st === "TRANSMITTED";
    if (status === "REJECTED") return st === "REJECTED";
    if (status === "EDITED") return st === "EDITED";
    return false;
  }).filter(f => ignoreImg || true);  // En mode sélection, on autorise les cartes sans image
  if (!list.length) return `<div class="group-empty">Aucun article dans « ${label} ».</div>`;
  return `<section class="fact-group">
    <div class="group-head">
      <span class="group-ic">${icon(iconName)}</span>
      <h3 class="group-title">${label}</h3>
      <span class="group-count">${list.length}</span>
    </div>
    <div class="fact-grid">${list.map(f => factCard(f, s, (s.facts || []).indexOf(f))).join("")}</div>
  </section>`;
}

// --- Traçage par jour de génération (création) ---
function dayLabel(dateStr) {
  if (!dateStr) return "Date inconnue";
  const d = new Date(dateStr);
  if (isNaN(d)) return "Date inconnue";
  const today = new Date();
  const dayMs = 24 * 3600 * 1000;
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / dayMs);
  const fmt = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  if (diffDays === 0) return "Aujourd'hui \u00b7 " + fmt;
  if (diffDays === 1) return "Hier \u00b7 " + fmt;
  if (diffDays === 2) return "Avant-hier \u00b7 " + fmt;
  return diffDays + " jours avant \u00b7 " + fmt;
}
function factGroupsByDay(facts, s) {
  const byDay = new Map();
  for (const f of facts) {
    const key = (f.created_at || "").slice(0, 10) || "____";
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(f);
  }
  const keys = [...byDay.keys()].filter(k => k !== "____").sort((a, b) => b.localeCompare(a));
  if (byDay.has("____")) keys.push("____");
  if (!keys.length) return '<div class="group-empty">Aucun article \u00e0 afficher.</div>';
  return keys.map(k => {
    const list = byDay.get(k);
    const label = k === "____" ? "Date inconnue" : dayLabel(k);
    return '<section class="fact-group day-group">'
      + '<div class="group-head">'
      + '<span class="group-ic">' + icon("i-date") + '</span>'
      + '<h3 class="group-title">' + esc(label) + '</h3>'
      + '<span class="group-count">' + list.length + '</span>'
      + '</div>'
      + '<div class="fact-grid">' + list.map(f => factCard(f, s, (s.facts || []).indexOf(f))).join("") + '</div>'
      + '</section>';
  }).join("");
}

function viewDrafts(s) {
  const facts = s.facts || [];
  // Un brouillon = décision EDITED (statut réel dans s.decisions, alimenté par loadHITL).
  // On n'utilise PAS factGroup (qui filtre les cartes sans image) -> un brouillon
  // sans image valide doit quand même s'afficher ici.
  const drafts = facts.filter(f => {
    const st = s.decisions[f.fact_id] || f.status || "PENDING_REVIEW";
    return st === "EDITED";
  });
  // Bug corrige 2026-08-19 (rapporte : "Aucun brouillon" s'affiche une
  // fraction de seconde au rechargement puis disparaît) : contrairement à
  // viewFacts(), rien ici ne distinguait "aucune donnée encore chargée"
  // de "chargé, et il n'y a vraiment aucun brouillon" -- au tout premier
  // rendu après un F5, s.facts est encore vide (la requête /api/hitl est
  // en vol), drafts.length vaut donc 0 et l'état vide s'affichait à tort
  // avant d'être remplacé dès que les données arrivaient. Même garde que
  // viewFacts() : squelette de chargement tant que s.ui.loading est vrai
  // et qu'aucune donnée n'est encore là.
  if (s.ui.loading && !facts.length) return factsSkeleton();
  if (!drafts.length) return stateBox("i-edit", "Aucun brouillon", "Les articles que tu places en brouillon (correction en cours) apparaissent ici. Ouvre un fait depuis le Tableau de bord ou Articles, clique « Modifier », puis valide la correction pour le mettre en brouillon.", false);
  // Bouton Sélectionner (pour agir en masse depuis Brouillons : corbeille / remettre en attente)
  const toolbar = `<div class="toolbar-row">
      <button class="btn btn-tonal" id="enterSelect">${s.selectMode ? "Annuler la sélection" : "Sélectionner"}</button>
    </div>`;
  const cells = drafts.map(f => {
    const idx = (s.facts || []).indexOf(f);
    const card = factCard(f, s, idx);
    const done = `<div class="draft-actions">
        <button class="btn btn-tonal btn-sm" data-finish="${esc(f.fact_id)}">${icon("i-undo")} Remettre en attente</button>
      </div>`;
    return `<div class="draft-cell">${card}${done}</div>`;
  }).join("");
  return `<div class="section-title">Brouillons (${drafts.length})</div>
    <p class="muted" style="margin-bottom:16px">Contenu en cours d'édition, non encore transmis. « Remettre en attente » renvoie l'article en validation normale (sans le publier).</p>
    ${toolbar}
    <div class="fact-grid">${cells}</div>`;
}

// Sous-page "Publiés" (2026-08-23, ADR-0005, tâche T3, demande explicite :
// "tous les articles déjà publiés... viennent se loger dans une sous-page
// enfant de la page article... [avec] une fonctionnalité de pouvoir les
// retirer de wordpress ... pour les ramener dans kora") -- symétrique de
// viewDrafts() ci-dessus, même rang de navigation (voir shell.js). Les
// articles TRANSMITTED n'apparaissent PLUS DU TOUT dans viewFacts() (voir
// son filtre en tête de fonction) : cette page est leur seul espace.
function viewPublished(s) {
  const facts = s.facts || [];
  const published = facts.filter(f => f.status === "TRANSMITTED");
  if (s.ui.loading && !facts.length) return factsSkeleton();
  if (!published.length) return stateBox("i-send", "Aucun article publié", "Les articles transmis à WordPress (brouillon ou publication officielle) apparaissent ici, avec la possibilité de les retirer pour les modifier à nouveau.", false);
  const cells = published.map(f => {
    const idx = facts.indexOf(f);
    const card = factCard(f, s, idx);
    // Statut visible (2026-08-23, revu suite au retour de l'utilisateur :
    // "Transmis est déjà répété 2 fois") : la carte (factCard/statusBadge)
    // affiche déjà "Transmis" -- cette ligne n'apporte une info NOUVELLE
    // que quand on connaît le détail brouillon/publié ; sinon (faits
    // transmis avant l'ajout du suivi wp_status) elle ne fait que
    // dupliquer la puce déjà visible -- omise dans ce cas.
    const statusLabel = f.wp_status === "draft" ? "Brouillon WordPress"
      : f.wp_status === "publish" ? "Publié sur WordPress" : "";
    const durationLabel = (f.video_status === "done" && f.video_duration_sec)
      ? `Vidéo ${fmtDuration(f.video_duration_sec)}` : "";
    const metaLine = [statusLabel, durationLabel, f.wp_category_name].filter(Boolean).join(" · ");
    // Bouton "Retirer" (2026-08-23, revu : taille alignée sur les autres
    // boutons courts de KORA -- "Voir", "Rejeter", "Modifier" -- un seul mot,
    // le détail complet reste en title="" pour l'accessibilité/clarté.
    // Couleur relevée en btn-primary (dégradé corail KORA) : demande
    // explicite, "couleur vive pour être bien mis en évidence" -- une
    // action de cette importance (retire un article du site public) mérite
    // la même mise en avant que "Publier", pas un bouton tonal discret.
    // Affordance vidéo (2026-08-23, demande explicite : "les faire
    // apparaître sur la page Publiés avec leur affordance vidéo -- lecture
    // inline, durée") -- un article transmis peut avoir une vidéo narrée
    // (même fait, video_status/video_path) ; la déplacer hors de la page
    // Vidéos (voir viewVideos()) ne doit rien lui faire perdre. Réutilise
    // le MÊME bloc lecteur que la page Vidéos (videoListenButton/
    // videoPlayerWrap, importés de videos.js) -- câblé par le même
    // bindVideoPlayers(), voir app.js.
    const hasVideo = f.video_status === "done" && f.video_path;
    const actions = `<div class="draft-actions">
        ${metaLine ? `<span class="muted" style="flex:1">${esc(metaLine)}</span>` : `<span style="flex:1"></span>`}
        ${hasVideo ? videoListenButton(f) : ""}
        ${f.wp_url ? `<a class="btn btn-tonal btn-sm" href="${esc(f.wp_url)}" target="_blank" rel="noopener">${icon("i-eye")} Voir</a>` : ""}
        <button class="btn btn-primary btn-sm" data-withdraw="${esc(f.fact_id)}" title="Retirer de WordPress">${icon("i-undo")} Retirer</button>
      </div>`;
    return `<div class="draft-cell">${card}${actions}${hasVideo ? videoPlayerWrap(f) : ""}</div>`;
  }).join("");
  return `<div class="section-title">Publiés (${published.length})</div>
    <p class="muted" style="margin-bottom:16px">Articles transmis à WordPress. « Retirer » met le post réel en corbeille WordPress et rend l'article modifiable dans KORA ; une republication réutilise le même post (même lien).</p>
    <div class="fact-grid">${cells}</div>`;
}
// B+C : catégorie EXCLUSIVE d'un fact (1 seule catégorie, priorité stricte).
// Garantit que les filtres du Tableau de bord / Articles sont mutuellement
// exclusifs et que leur somme égale exactement le total (plus de chevauchement
// "en attente" vs "brouillon").
// On s'appuie sur f.status (déjà calculé par le backend list_facts : hitl_facts.status
// prime pour la corbeille, sinon la décision HITL) — PAS sur s.decisions qui
// écraserait f.status et fausserait le comptage (ex: EDITED compté en attente).
function factCategory(s, f) {
  if ((f.trashed_at && f.trashed_at !== "") || f.status === "TRASHED") {
    // Article rejete a la corbeille -> compte dans "Rejetes" (coherent s.stats.rejected)
    if (f.rejected || f.decision === "REJECTED" || f.d_status === "REJECTED") return "rejected";
    return "trash";
  }
  if (f.status === "TRANSMITTED" || f.status === "APPROVED") return "transmitted";
  if (f.status === "REJECTED") return "rejected";
  if (f.status === "EDITED") return "drafts";
  return "pending";
}
function viewFacts(s) {
  // Exclusion des articles transmis (2026-08-23, ADR-0005, tâche T3, demande
  // explicite : "tous les articles déjà publiés... disparaissent de
  // l'affichage du tableau de bord principal et viennent se loger dans une
  // sous-page enfant") -- voir viewPublished() ci-dessous, leur nouvel
  // espace dédié (retrait/republication WordPress). Filtré ICI, à la
  // source, pour que TOUT le reste de cette vue (compteurs, groupes,
  // sélection multiple) n'ait plus jamais à connaître ce statut.
  const facts = (s.facts || []).filter(f => f.status !== "TRANSMITTED");
  const f = (Store.getFactFilter() || "all").toLowerCase();
  // Skeleton (13.2) : au tout premier chargement (avant que /api/hitl ait
  // répondu), sans ça l'état vide "Aucun article" s'affichait un instant à
  // tort — trompeur, on ne SAIT pas encore s'il y a des articles ou non.
  if (s.ui.loading && !facts.length) return factsSkeleton();
  if (!facts.length) return (s.lastCycle && s.lastCycle.result && s.lastCycle.result.status === "empty_or_stale") ? staleBox(s) : stateBox("i-check", "Aucun article à afficher", "Lance un cycle pour générer des articles à valider.", false, "Lancer un cycle", () => Store.startCycle());
  // B+C : filtrage par catégorie EXCLUSIVE (même logique inline que les compteurs)
  const catOf = (ft) => {
    // TRASHED compte TOUJOURS dans "trash" (2026-08-22, revu -- demande
    // explicite : "Mettre à la corbeille" doit vraiment y mener), y compris
    // un article rejeté via ce bouton -- cohérent avec s.stats.trash
    // (voir get_dashboard_stats(), hitl_store.py, même date).
    if (ft.status === "TRASHED" || (ft.trashed_at && ft.trashed_at !== "")) return "trash";
    // APPROVED (2026-08-23) : ne signifie plus "en cours de transmission
    // vers WordPress" au sens où c'était compté avant (TRANSMITTED est
    // maintenant exclu plus haut) -- reste dans "pending", un état
    // transitoire du circuit actif, pas une destination à part.
    if (ft.status === "REJECTED") return "rejected";
    if (ft.status === "EDITED") return "drafts";
    return "pending";
  };
  // Comptés depuis la liste déjà filtrée (transmis exclus) plutôt que
  // s.stats (qui inclut encore les transmis tant que le recomptage backend,
  // tâche T4 de l'ADR-0005, n'est pas fait) -- évite un compteur "Tous" qui
  // ne correspondrait plus aux cartes réellement affichées.
  const counts = {
    all: facts.length,
    pending: facts.filter(x => catOf(x) === "pending").length,
    rejected: facts.filter(x => catOf(x) === "rejected").length,
    drafts: facts.filter(x => catOf(x) === "drafts").length,
    trash: facts.filter(x => catOf(x) === "trash").length,
  };
  const filters = [
    ["all", "Tous", counts.all], ["pending", "En attente", counts.pending],
    ["rejected", "Rejetés", counts.rejected],
    ["drafts", "Brouillons", counts.drafts], ["trash", "Corbeille", counts.trash],
  ];
  const filterBar = `<div class="filter-bar">${filters.map(([k, lab, n]) =>
    `<button class="filter-pill ${f === k ? "active" : ""}" data-fact-filter="${k}">${lab} <span class="pill-n">${n}</span></button>`).join("")}
    <button class="icon-btn" id="copyFilterLink" type="button" title="Copier le lien de ce filtre" aria-label="Copier le lien de ce filtre">${icon("i-link")}</button>
    ${helpTip("fact-filters")}</div>
    <p class="filter-note">Chaque article compte dans une seule catégorie — la somme des filtres égale le total (${counts.all}). Les articles déjà transmis sont dans « Publiés ».</p>
    <div class="toolbar-row">
      <button class="btn btn-tonal" id="enterSelect">${s.selectMode ? "Annuler la sélection" : "Sélectionner"}</button>
    </div>`;
  let body;
  if (f === "all") {
    body = factGroupsByDay(facts, s);
  } else if (["pending", "rejected", "drafts", "trash"].includes(f)) {
    body = factGroupsByDay(facts.filter(x => catOf(x) === f), s);
  } else {
    body = factGroupsByDay(facts, s);
  }
  return filterBar + body;
}
globalThis.__viewFacts = viewFacts; // DEBUG B+C

// Skeleton de liste d'articles (13.2) — réutilise la même animation .skeleton
// que les cartes KPI/pastille santé (style.css), généralisée à une carte entière.
function factsSkeleton() {
  const card = `
    <div class="fact-card-skeleton">
      <span class="skeleton skel-thumb"></span>
      <div class="skel-lines">
        <span class="skeleton skel-line skel-line-title"></span>
        <span class="skeleton skel-line skel-line-sub"></span>
      </div>
    </div>`;
  return `<div class="facts-skeleton-wrap">${card}${card}${card}</div>`;
}

function staleBox(s) {
  const r = (s.lastCycle && s.lastCycle.result) || {};
  const msg = r.message || "Aucune publication dans la fenêtre 24h.";
  const n = r.stale_count || 0;
  return `<div class="state-box">
    <span class="state-ic"><svg class="ic"><use href="#i-info"/></svg></span>
    <h3>Aucune information fraîche dans les 24 dernières heures</h3>
    <p>${esc(msg)}</p>
    <p class="muted" style="margin-top:8px">Règle de fraîcheur stricte : KORA ne génère un article que si une source whitelist a publié une information dans les 24h. ${n ? `(${n} item(s) collecté(s) datent de plus de 24h et ne sont pas utilisés.)` : ""} Revenez plus tard pour de l'information en temps réel.</p>
    <button class="btn btn-primary" id="stateAction">Relancer un cycle</button>
  </div>`;
}

function onBulkAction(action) {
  const ids = Store.selectedIds();
  if (!ids.length) { snack("Aucun article sélectionné"); return; }
  if (action === "approve") { openWpChoice(); return; }
  if (action === "pending") {
    Store.bulkAction("pending").then(r => snack(bulkResultMsg(r, "remis en attente"))).catch(e => snack("Erreur : " + e.message));
    return;
  }
  if (action === "trash") { openTrashChoice(); return; }
  if (action === "draft") {
    Store.bulkAction("draft").then(r => snack(bulkResultMsg(r, "en brouillon"))).catch(e => snack("Erreur : " + e.message));
    return;
  }
}
// Bug corrigé 2026-08-20 : "3/5 en brouillon" ne disait jamais POURQUOI les 2
// autres avaient échoué (transition refusée, article introuvable...) --
// results[] contient pourtant le détail par article depuis le backend.
// Factorisé (10e passage de revue) : ce même "trouver la première erreur et
// la traduire" était dupliqué presque à l'identique dans doBulkApprove --
// risque qu'un futur correctif (ex: support de r.detail) ne soit appliqué
// que dans l'un des deux flux groupés (draft/pending vs approve).
function firstBulkErrorDetail(results) {
  const firstErr = results.find(x => !x.ok && x.error);
  return firstErr ? friendlyActionError({ message: firstErr.error }) : "";
}
function bulkResultMsg(r, label) {
  const total = r.total || 0, done = r.done || 0;
  if (done >= total) return `${done}/${total} ${label}`;
  const why = firstBulkErrorDetail(r.results || []);
  return `${done}/${total} ${label}${why ? " — " + why : ""}`;
}
function openWpChoice() {
  const wp = document.getElementById("wpChoice");
  const sc = document.getElementById("wpScrim");
  if (wp) {
    // Restaure le libellé pluriel (2026-08-22) : un précédent appel depuis
    // la fiche article (openWpChoiceForFact, app.js) a pu laisser le
    // libellé singulier -- même fenêtre partagée entre les deux appelants.
    const q = document.getElementById("wpChoiceQuestion");
    if (q) q.innerHTML = `Comment veux-tu publier les <b id="wpCount">${Store.selectedIds().length}</b> article(s) sélectionné(s) sur le site WordPress ?`;
    wp.hidden = false;
  }
  if (sc) sc.hidden = false;
}
function openTrashChoice() {
  const tc = document.getElementById("trashChoice");
  const sc = document.getElementById("wpScrim");
  if (tc) {
    document.getElementById("trashCount").textContent = Store.selectedIds().length;
    const def = document.getElementById("trashDefinitive");
    if (def) def.checked = false;
    const del = document.getElementById("trashDelete");
    if (del) del.hidden = true;
    tc.hidden = false;
  }
  if (sc) sc.hidden = false;
}
function doBulkApprove(wp_status) {
  Store.bulkAction("approve", { wp_status }).then(r => {
    const results = r.results || [];
    const fails = results.filter(x => !x.ok).length;
    // Droit d'envoi WordPress (§3 du plan valide 2026-08-19) : distingue le
    // cas "approuvé mais pas envoyé, faute de droit" d'un échec technique.
    const skippedWp = results.filter(x => x.transmission?.status === "SKIPPED_NO_WP_RIGHT").length;
    const skippedDup = results.filter(x => x.transmission?.status === "SKIPPED_ALREADY_TRANSMITTED").length;
    // Bug corrigé 2026-08-20 (8e passage de revue) : `fails` (ci-dessus) ne
    // compte que les decide() refusés (r.ok=false) -- un VRAI échec d'envoi
    // WordPress alors que decide() a réussi (FAILED/ERROR/PARTIAL/
    // SKIPPED_DUPLICATE, voir publishing/transmit.py) n'était compté nulle
    // part et passait totalement inaperçu dans un lot.
    const txFailed = results.filter(x => x.ok && transmissionMessage(x.transmission) && x.transmission?.status !== "SKIPPED_NO_WP_RIGHT" && x.transmission?.status !== "SKIPPED_ALREADY_TRANSMITTED").length;
    // Ces cas (déjà-transmis / droit WP manquant / échec d'envoi / échec de
    // transition) sont indépendants et peuvent survenir simultanément dans
    // le même lot -- l'ancien if/else-if n'en montrait qu'un seul, masquant
    // silencieusement les autres (notamment un vrai échec derrière un "déjà publié").
    const parts = [];
    if (skippedDup) parts.push(`${skippedDup} déjà publié(s), non renvoyé(s) (utilisez "Annuler la décision" d'abord)`);
    if (skippedWp) parts.push(`en attente d'envoi WordPress pour le reste (droit non délégué)`);
    if (txFailed) parts.push(`${txFailed} envoi(s) WordPress échoué(s)`);
    if (fails) {
      const why = firstBulkErrorDetail(results);
      parts.push(`${fails} échec(s)${why ? " — " + why : ""}`);
    }
    snack(parts.length ? `${r.done}/${r.total} traité(s) · ${parts.join(" · ")}` : `${r.done}/${r.total} publié(s) sur WordPress`);
  }).catch(e => snack("Erreur : " + e.message));
}
function doBulkTrash(definitive) {
  const ids = Store.selectedIds();
  if (!ids.length) return;
  if (definitive) {
    Store.deleteForever(ids).then(r => snack(`${r.deleted || 0} supprimé(s) définitivement`)).catch(e => snack("Erreur : " + e.message));
  } else {
    Store.bulkAction("trash").then(r => snack(`${r.done}/${r.total} mis à la corbeille (11 j)`)).catch(e => snack("Erreur : " + e.message));
  }
}

export { viewFacts, viewDrafts, viewPublished, onBulkAction, openWpChoice, openTrashChoice, doBulkApprove, doBulkTrash };
