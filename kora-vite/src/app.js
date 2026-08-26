/* ============================================================
   KORA — App (routing, orchestration du rendu, tiroir HITL). Module ES.

   Refacto du 22/08/2026 (plan étape 4) : ce fichier faisait 4 367 lignes
   et regroupait TOUT le frontend (chaque page, le lecteur vidéo, le
   centre de notifications, le tour guidé...). Découpé en modules par
   responsabilité — ce fichier ne garde que ce qui est GÉNUINEMENT
   transversal : le routeur (navigate/routeToPath/boot), le dispatcheur de
   rendu (render()), le câblage d'évènements global de la coquille d'appli
   (bind() — rail, tiroirs, thème, sélection multiple...), et l'état
   interne étroitement couplé à render() lui-même (écran "cycle en
   cours", notification de fin de cycle, etc.) qui n'aurait pas pu être
   extrait sans transformer des variables module-scope en getters pour un
   gain nul.

   Modules extraits : utils.js (helpers partagés), sheet.js (panneau de
   détail #sheet), notifications.js, tour.js, views/{dashboard,facts,trash,
   videos,sources,settings,audit,styleguide,auth}.js — chacun dans son
   propre fichier, une page = un module.
   ============================================================ */
import { Store } from "./store.js";
import {
  $, $$, esc, isAdvancedRole, icon, statusBadge, guardClick, snack, ROLE_LABEL_FR,
  transmissionMessage, friendlyActionError, friendlyGlobalError,
} from "./utils.js";
import { renderSheet, confirmAction, isEditingActive, isVideoPlaying } from "./sheet.js";
import { renderNotifCenter } from "./notifications.js";
// "dashboard" (2026-08-25, audit de nommage : s'appelait "cockpit" --
// terme aéronautique générique, aucun rapport avec le métier éditorial).
// Fichier renommé views/cockpit.js -> views/dashboard.js, fonction
// viewCockpit -> viewDashboard, route interne "cockpit" -> "dashboard"
// (toutes les occurrences ci-dessous). L'URL "jolie" n'est PAS affectée
// (ROUTE_SLUGS mappait déjà cockpit -> "" (racine), inchangé).
import { viewDashboard } from "./views/dashboard.js";
import { viewFacts, viewDrafts, viewPublished, onBulkAction, openWpChoice, openTrashChoice, doBulkApprove, doBulkTrash } from "./views/facts.js";
import { viewTrash } from "./views/trash.js";
import { viewVideos, bindVideos, bindVideoPlayers } from "./views/videos.js";
import { viewSources, bindSources } from "./views/sources.js";
import { viewSettings, bindSettings } from "./views/settings.js";
import { viewAudit, bindAudit } from "./views/audit.js";
import { viewStyleGuide } from "./views/styleguide.js";
import { renderAuth, isAuthRendered, isForceAuthOverlay, bindPasswordToggles } from "./views/auth.js";

// ============================================================================
// STYLE GUIDE (/style-guide) — page vivante du design system (B.1).
// Réutilise les VRAIS composants (statusBadge, statCard, classes .btn) pour
// rester fidèle : toute dérive du design y est visible avant merge.
// Accès : rôle advanced (lien discret dans Paramètres). Réf : docs/DESIGN_SYSTEM.md
// ============================================================================
// Rôle minimum requis pour accéder à une route (13.3). Routes absentes de
// cette map = accessibles à tout utilisateur authentifié.
const ROUTE_ROLE = { styleguide: "advanced" };

function applyRailRoleVisibility() {
  const isAdvanced = (Store.state.auth && isAdvancedRole(Store.state.auth.role));
  $$('.rail .item[data-role="advanced"]').forEach(n => { n.hidden = !isAdvanced; });
}

function renderErrorBanner(s) {
  const el = document.getElementById("errorBanner");
  const msgEl = document.getElementById("errorBannerMsg");
  if (!el || !msgEl) return;
  const err = s.ui && s.ui.error;
  el.hidden = !err;
  if (err) msgEl.textContent = friendlyGlobalError(err);
  const retryBtn = document.getElementById("errorBannerRetry");
  const closeBtn = document.getElementById("errorBannerClose");
  const clearError = () => Store.setState({ ui: { ...Store.state.ui, error: null } });
  if (retryBtn) retryBtn.onclick = () => { clearError(); Store.loadAll(); };
  if (closeBtn) closeBtn.onclick = clearError;
}

function view403() {
  return `
    <div class="state-403">
      ${icon("i-lock", "state-403-ic")}
      <h1>Accès non autorisé</h1>
      <p class="muted">Cette section nécessite le rôle Administrateur. Contacte un administrateur si tu penses qu'il s'agit d'une erreur.</p>
      <button class="btn btn-primary" data-403-home="1">${icon("i-dashboard")} Retour au tableau de bord</button>
    </div>`;
}

// Dernière route effectivement montée dans #view (voir garde settingsAlreadyMounted
// dans render()) — évite de reconstruire le HTML des Paramètres à chaque poll.
let _lastRenderedRoute = null;

// Cible de la fenêtre #wpChoice (2026-08-22, demande explicite : "je veux
// les deux options" -- publier directement / brouillon WP -- aussi pour
// l'approbation d'UN seul article, pas seulement en sélection multiple).
// "bulk" -> doBulkApprove (views/facts.js) ; un fact_id (string) ->
// _resolveFactWpChoice ci-dessous. Remise à null à la fermeture (voir
// closeWp() dans bind()) pour ne jamais rejouer un choix périmé.
let _wpChoiceTarget = null;
function openWpChoiceForFact(factId) {
  _wpChoiceTarget = factId;
  const wpChoice = document.getElementById("wpChoice");
  const wpScrim = document.getElementById("wpScrim");
  const q = document.getElementById("wpChoiceQuestion");
  if (q) q.textContent = "Comment veux-tu publier cet article sur le site WordPress ?";
  if (wpChoice) wpChoice.hidden = false;
  if (wpScrim) wpScrim.hidden = false;
}
// Même traitement de la réponse que le bouton générique "Approuver &
// transmettre" (voir sheet.js, dispatch [data-decide]) -- silence sur un
// succès plein (transmissionMessage() ne renvoie une chaîne que s'il y a
// quelque chose à signaler : skip, échec...), même convention partout.
function _resolveFactWpChoice(factId, wpStatus) {
  Store.decide(factId, "APPROVED", "", wpStatus).then(r => {
    const msg = transmissionMessage(r?.transmission);
    if (msg) snack(msg);
    Store.closeSheet();
  }).catch(e => snack(friendlyActionError(e)));
}

// ============================================================================
// ÉCRAN "CYCLE EN COURS" — plein écran chaleureux + repli en bandeau compact
// (wireframe 3.3, étendu à la demande utilisateur du 2026-08-19 : messages
// personnifiés façon "Kora Agent fait X…", à la manière des écrans d'attente
// des outils IA grand public, plutôt qu'une barre de progression neutre).
// ============================================================================
const CYCLE_MESSAGES = [
  "Kora Agent explore les sources d'actualité…",
  "Kora Agent trie les informations les plus fraîches…",
  "Kora Agent rédige l'article…",
  "Kora Agent choisit le visuel qui correspond le mieux…",
  "Kora Agent relit et peaufine les derniers détails…",
];
// CYCLE_PATIENCE_MS (2026-08-26, testé en conditions réelles : cycle
// déclenché en production, message observé toutes les 10s) -- 45s était
// beaucoup trop tôt : le loader affiche lui-même "environ 6 min par
// article" dès le lancement, puis "Article 1 sur 10 (≈ 20 min restantes)"
// une fois la collecte terminée -- voir un message "ça prend plus de temps
// que d'habitude" apparaître à peine 45s après CES MÊMES estimations
// contredit l'appli elle-même et sape la confiance plutôt que rassurer.
// Relevé à 90s : le seuil ne se déclenche plus avant même la fin de la
// collecte (15-30s annoncés) dans le cas normal, seulement si ça traîne
// réellement au-delà de ce qui est raisonnable pour cette première étape.
const CYCLE_PATIENCE_MS = 90000; // au-delà, message de patience supplémentaire
let _wasBusy = false;
// Suivi de transition du bandeau vidéo global (2026-08-21) -- voir render().
let _lastVideoJobId = null;
let _lastVideoJobStatus = null;
let _loaderDismissed = false;
let _cycleMsgTimer = null;
let _cycleMsgIdx = 0;
let _cycleStartedAt = 0;
// _cycleMsgArticleNum (2026-08-26, MÊME test réel) : sans repère, le texte
// décoratif ("Kora Agent choisit le visuel...", "...relit et peaufine...")
// tourne sur une SIMPLE MINUTERIE de 5s, totalement indépendante de la
// progression réelle -- observé en direct : le message affichait "choisit
// le visuel" (donne l'impression d'un article presque terminé) alors que
// la ligne de progression juste à côté affichait encore "Article 1 sur 10"
// avec current=0 (le tout premier article pas encore achevé). Les deux
// indicateurs se contredisaient l'un l'autre au même instant. Corrigé en
// resynchronisant la narration sur le VRAI signal de progression déjà
// disponible (s.ui.progress.current, backend) : chaque fois qu'on change
// réellement d'article, la narration repart du début ("explore les
// sources...") pour ce nouvel article, au lieu de dériver indéfiniment.
let _cycleMsgArticleNum = -1;
function updateCycleMessage() {
  const progress = Store.state.ui && Store.state.ui.progress;
  const articleNum = (progress && progress.total > 0) ? progress.current : -1;
  if (articleNum !== _cycleMsgArticleNum) {
    _cycleMsgArticleNum = articleNum;
    _cycleMsgIdx = 0;
  }
  const msg = CYCLE_MESSAGES[_cycleMsgIdx % CYCLE_MESSAGES.length];
  _cycleMsgIdx++;
  const glText = document.getElementById("globalLoaderText");
  if (glText) glText.textContent = msg;
  const cbText = document.getElementById("cycleBannerText");
  if (cbText) cbText.textContent = msg;
  const patience = document.getElementById("globalLoaderPatience");
  if (patience) patience.hidden = (Date.now() - _cycleStartedAt) < CYCLE_PATIENCE_MS;
}
function startCycleMessages() {
  _cycleMsgIdx = 0;
  _cycleStartedAt = Date.now();
  _loaderDismissed = false;
  updateCycleMessage();
  clearInterval(_cycleMsgTimer);
  _cycleMsgTimer = setInterval(updateCycleMessage, 5000);
}
function stopCycleMessages() {
  clearInterval(_cycleMsgTimer);
  _cycleMsgTimer = null;
}

// Notification de fin de cycle "rien de neuf" (2026-08-20, rapporte : un
// cycle qui se termine sans aucun article FRAIS (pool vide ou tout deja
// couvert -- voir reach_agent.py, status "empty_or_stale") ramenait
// silencieusement au tableau de bord, sans aucune explication visible pour
// l'utilisateur, qui y voyait a tort un plantage. Le backend calcule deja
// un message FR explicatif (result.message) -- il n'etait simplement jamais
// affiche nulle part par defaut (uniquement visible si l'utilisateur pensait
// a naviguer manuellement vers Articles avec 0 resultat). On le declenche au
// moment EXACT ou l'ecran de progression se referme (transition
// cycleBusy:true -> false), quelle que soit la page affichee a ce moment --
// pas au chargement de page (lastCycle peut contenir un ancien resultat
// jamais montre, qu'on ne veut pas re-notifier a chaque F5).
let _wasCycleBusy = false;
let _lastNotifiedCycleTs = null;

// Messages "rien de neuf" (2026-08-20, demande explicite : remplacer le
// message technique brut du backend par un ton chaleureux et personnifie,
// avec de la variete si l'utilisateur relance plusieurs fois de suite --
// les premiers messages restent legers, les suivants reconnaissent
// l'insistance ("Kora comprend ce que vous cherchez..."), boucle au-dela.
const KORA_STALE_MESSAGES = [
  "Kora n'a encore rien trouvé de neuf. Repassez un peu plus tard !",
  "Pas de nouvelle fraîche pour l'instant. Kora garde l'œil ouvert et vous préviendra.",
  "Silence du côté des sources pour le moment. Retentez dans un petit moment.",
  "Kora a fait le tour de ses sources : rien à publier là tout de suite.",
  "Toujours rien de neuf à l'horizon. Un peu de patience et ça viendra.",
  "Les sources n'ont rien publié depuis votre dernier passage. À très vite !",
  "Kora comprend ce que vous cherchez, mais il n'y a vraiment rien à se mettre sous la dent pour l'instant. Réessayez plus tard.",
  "Encore un tour, encore rien de neuf. Les sources restent muettes pour le moment.",
  "Kora insiste aussi, mais l'actualité fraîche se fait attendre. Merci de votre patience.",
  "Toujours calme plat de ce côté-là. On y retourne bientôt.",
  "Kora a revérifié minutieusement : rien de nouveau à publier pour l'instant.",
  "Les sources dorment encore un peu. Kora reste en veille et reviendra vite.",
  "Rien de frais à se mettre sous la dent, même après plusieurs passages. Ça ne saurait tarder.",
  "Kora a bien compris votre insistance, mais il n'y a réellement rien à publier là maintenant.",
  "Toujours rien à l'horizon, mais Kora ne relâche pas la surveillance. Repassez plus tard.",
  "Encore et toujours du calme plat. Merci pour votre patience, ça finira par bouger.",
];
// Compteur de tentatives "a la suite" (persiste au F5, expire apres 3h sans
// nouvel essai -- au-dela, on considere que c'est une nouvelle "session"
// d'essais et on repart du ton le plus leger).
const _STALE_STREAK_KEY = "kora-stale-streak";
const _STALE_STREAK_TS_KEY = "kora-stale-streak-ts";
const _STALE_STREAK_RESET_MS = 3 * 60 * 60 * 1000;
function _nextStaleMessage() {
  let n = 0;
  try {
    const ts = parseInt(localStorage.getItem(_STALE_STREAK_TS_KEY) || "0", 10);
    if (ts && Date.now() - ts <= _STALE_STREAK_RESET_MS) {
      n = parseInt(localStorage.getItem(_STALE_STREAK_KEY) || "0", 10) || 0;
    }
    localStorage.setItem(_STALE_STREAK_KEY, String(n + 1));
    localStorage.setItem(_STALE_STREAK_TS_KEY, String(Date.now()));
  } catch (e) {}
  return KORA_STALE_MESSAGES[n % KORA_STALE_MESSAGES.length];
}
function _resetStaleStreak() {
  try { localStorage.removeItem(_STALE_STREAK_KEY); localStorage.removeItem(_STALE_STREAK_TS_KEY); } catch (e) {}
}


function render() {
  // Garde anti-récursion STRICT : si render est rappelé en boucle (sync ou async),
  // on lève une erreur EXPLICITE AVEC LE STACK au 6e appel rapproché, plutôt que
  // de saturer le thread JS et figer le navigateur. Le stack révèle la fonction coupable.
  const now = Date.now();
  if (now - (window.__renderT || 0) > 1000) { window.__renderCount = 0; window.__renderT = now; }
  window.__renderCount = (window.__renderCount || 0) + 1;
  if (window.__renderCount > 40) {
    // Garde-fou ultime : on ne rend plus pour éviter de saturer le thread,
    // mais on n'écrase PAS la vue (l'erreur est seulement loggée).
    console.error("RECURSION render() x" + window.__renderCount + "\n" + (new Error().stack || ""));
    return;
  }
  const s = Store.state;
  // Garde-fou session : si déconnecté (logout ou changement de mdp), on ramène
  // immédiatement à l'écran d'authentification, sans laisser l'app visible.
  // IMPORTANT: on ne reconstruit le formulaire qu'une SEULE fois (sinon chaque
  // setState détruit les champs en cours de saisie et le focus).
  // Si la verification est EN COURS (pending), on n'affiche RIEN (pas de flash
  // login au reload) : on attend l'issue de checkAuth() avant de trancher.
  if (!s.auth || !s.auth.loggedIn || isForceAuthOverlay()) {
    if (s.auth && s.auth.pending && !isForceAuthOverlay()) { return; } // verification en cours -> pas de login
    hideBootSplash(); // auth resolue (login affiche) -> splash plus utile
    if (!isAuthRendered() && !isForceAuthOverlay()) { renderAuth("login"); }
    return;
  }
  // Session confirmee (login ou reload avec cookie valide) : on masque l'overlay
  // d'auth et on reaffiche l'app. Sans ca, l'overlay login reste au-dessus de
  // l'app apres un refresh (bug : redirige vers login a chaque reload).
  hideBootSplash(); // app montee -> on retire le splash de boot
  showApp();
  const agent = document.getElementById("agentStatus");
  if (agent) agent.innerHTML = s.ui.busy
    ? `<span class="dot dot-busy"></span><span>${s.ui.overlay || "Agent occupé…"}</span>`
    : `<span class="dot dot-ready"></span><span>prêt</span>`;
  // Identite du compte connecte, visible en permanence (2026-08-20, demande
  // explicite) -- voir shell.js pour le pourquoi (jamais dans l'URL, ici a
  // la place, comme Facebook/Gmail/Slack pour "qui suis-je actuellement").
  const idName = document.getElementById("topbarIdentityName");
  const idRole = document.getElementById("topbarIdentityRole");
  const idAvatar = document.getElementById("topbarIdentityAvatar");
  if (idName) idName.textContent = s.auth.username || "—";
  if (idRole) idRole.textContent = ROLE_LABEL_FR[s.auth.role] || s.auth.role || "—";
  if (idAvatar) {
    idAvatar.innerHTML = s.auth.avatarData
      ? `<img src="${esc(s.auth.avatarData)}" alt="">`
      : esc((s.auth.username || "?").charAt(0).toUpperCase());
  }
  // Notification "rien de neuf" / erreur de cycle -- voir commentaire sur
  // _wasCycleBusy plus haut. Se declenche UNE SEULE fois, exactement au
  // moment ou l'ecran de progression vient de se refermer.
  const cycleJustFinished = _wasCycleBusy && !s.ui.cycleBusy;
  _wasCycleBusy = s.ui.cycleBusy;
  if (cycleJustFinished && s.lastCycle && s.lastCycle.ts !== _lastNotifiedCycleTs) {
    _lastNotifiedCycleTs = s.lastCycle.ts;
    const r = s.lastCycle.result;
    if (r && r.status === "empty_or_stale") {
      snack(_nextStaleMessage());
    } else if (r && r.status === "ok") {
      _resetStaleStreak(); // du neuf trouve -> on repart du ton le plus leger la prochaine fois
      // 2026-08-20 (rapporte : "j'ai relancé mais aucun message, panne ?") :
      // un cycle REUSSI restait tout aussi silencieux qu'un echec -- aucune
      // confirmation ne ressemble a une panne aux yeux de l'utilisateur,
      // meme quand tout s'est bien passe. On confirme desormais aussi le succes.
      const n = (r.facts && r.facts.length) || r.facts_to_generate || 0;
      if (n > 0) snack(`${n} ${n > 1 ? "nouveaux" : "nouvel"} article${n > 1 ? "s" : ""} généré${n > 1 ? "s" : ""}, en attente de validation.`);
    } else if (r && r.error) {
      snack("Erreur pendant la génération : " + r.error);
    }
  }
  renderErrorBanner(s);
  const view = document.getElementById("view");
  if (!view) return;
  const map = { dashboard: viewDashboard, facts: viewFacts, sources: viewSources, videos: viewVideos, audit: viewAudit, drafts: viewDrafts, published: viewPublished, settings: viewSettings, trash: viewTrash, styleguide: viewStyleGuide };
  // Garde de rôle au niveau du routage (13.3) : jusqu'ici seul le LIEN vers
  // /style-guide était masqué pour un rôle non-advanced, mais la route
  // elle-même restait accessible en tapant #styleguide directement (aucune
  // vérification au rendu). ROUTE_ROLE + view403 ferment ce trou.
  const need = ROUTE_ROLE[s.route];
  const blocked = need && (!s.auth || !isAdvancedRole(s.auth.role));
  // Paramètres : ne PAS reconstruire la vue si on est déjà sur "settings" (même
  // route qu'au dernier rendu). Sans ce garde-fou, tout setState — y compris le
  // poll périodique (stats/hitl) totalement sans rapport — reconstruit tout le
  // HTML des tiroirs Paramètres, ce qui : (1) ferme le tiroir ouvert par
  // l'utilisateur (déjà connu — cf. avatar/notifications), et (2) ORPHELINISE
  // tout appel async en cours dans un tiroir (ex. chargement du prompt agent
  // §9.5) : la réponse arrive après coup et met à jour un noeud #agentPromptBody
  // déjà détaché du DOM, pendant que l'écran affiché en a un nouveau, resté sur
  // "Chargement…". bindSettings() n'est donc PAS ré-appelé non plus dans ce cas
  // (les handlers déjà attachés restent valides sur les mêmes noeuds DOM).
  const settingsAlreadyMounted = s.route === "settings" && _lastRenderedRoute === "settings" && !blocked;
  // Même famille de garde que settingsAlreadyMounted ci-dessus (2026-08-22,
  // lecteur vidéo inline page Vidéos) : le poll périodique (notifications/
  // cycle/vidéo toutes les 30s) redéclenche un render() global qui
  // reconstruirait le HTML de la liste -> détruirait le <video> en cours de
  // lecture (coupure audio/vidéo brutale) à chaque tick, même sans aucun
  // changement réel de la liste elle-même.
  const videosPlayingMounted = s.route === "videos" && _lastRenderedRoute === "videos" && !blocked
    && Array.from(view.querySelectorAll("[data-video-el]")).some(v => !v.paused && !v.ended);
  if (!settingsAlreadyMounted && !videosPlayingMounted) {
    view.innerHTML = blocked ? view403() : (map[s.route] || viewDashboard)(s);
  }
  _lastRenderedRoute = blocked ? "403" : s.route;
  $$(".navitem, .rail .navitem, .item, .rail .item").forEach(n => {
    const on = n.dataset.route === s.route;
    n.classList.toggle("active", on);
    if (on) n.setAttribute("aria-current", "page"); else n.removeAttribute("aria-current");
  });
  // Habilitations : l'onglet Paramètres (gestion avancée) est réservé au rôle "advanced"
  const isAdvanced = (s.auth && isAdvancedRole(s.auth.role));
  $$('.navitem[data-route="settings"]').forEach(n => { n.hidden = !isAdvanced; });
  const bnav = document.querySelector('.bottomnav [data-route="settings"]');
  if (bnav) bnav.hidden = !isAdvanced;
  // Sources (config sensible, 403 pour un rôle normal) : masqué quelle que
  // soit sa position dans le rail (épinglé ou dans le groupe Système).
  applyRailRoleVisibility();
  // Badges de compteur sur la navigation (Articles / Sources / Brouillons / Corbeille)
  try {
    const facts = s.facts || [];
    // SSOT : badges de navigation tires de s.stats (calcules une seule fois par le backend)
    const stats = s.stats || {};
    const badges = {
      // "facts" (2026-08-23, ADR-0005, tâche T4) : active_facts exclut les
      // articles TRANSMITTED (comptés séparément par le badge "published"
      // ci-dessous) -- cohérent avec viewFacts() qui les a exclus (T3) et
      // avec la tuile "Articles" du tableau de bord (voir views/dashboard.js).
      facts: (typeof stats.active_facts === "number") ? stats.active_facts
        : (typeof stats.total_facts === "number") ? stats.total_facts
        : ((typeof stats.articles === "number") ? stats.articles : facts.length),
      sources: (s.sources || []).length,
      drafts: (typeof stats.drafts === "number") ? stats.drafts : facts.filter(f => (f.status || "") === "EDITED").length,
      trash: (typeof stats.trash === "number") ? stats.trash : (s.trash || []).length || facts.filter(f => (f.status || "") === "DELETED").length,
      // "published" (2026-08-23, ADR-0005, tâche T3, unifié le même jour) :
      // published_count = hitl_facts.status === 'TRANSMITTED' exactement,
      // MÊME filtre que viewPublished() (views/facts.js) -- pas
      // stats.transmitted (qui inclut APPROVED, un état transitoire pas
      // encore réellement publié nulle part).
      published: (typeof stats.published_count === "number") ? stats.published_count
        : facts.filter(f => (f.status || "") === "TRANSMITTED").length,
      // "videos" (2026-08-23, demande explicite : "ajouter un compteur ...
      // comme sur les autres pages de cette section") -- active_videos
      // (backend, voir get_dashboard_stats) plutôt que s.videos, qui n'est
      // chargé que lorsqu'on visite la page Vidéos -- le badge doit rester
      // exact même sans jamais l'avoir ouverte. Repli sur s.videos si un
      // backend pas encore redéployé ne l'expose pas encore.
      videos: (typeof stats.active_videos === "number") ? stats.active_videos
        : (s.videos || []).filter(v => (v.status || "") !== "TRANSMITTED").length,
    };
    document.querySelectorAll("[data-badge]").forEach(el => {
      const key = el.getAttribute("data-badge");
      const v = badges[key] || 0;
      el.textContent = v > 0 ? String(v) : "";
      el.classList.toggle("show", v > 0);
    });
  } catch (e) { console.error("badges", e); }
  const curTheme = Store.getTheme();
  $$("[data-theme-btn]").forEach(n => n.classList.toggle("active", n.dataset.themeBtn === curTheme));
  const sa = document.getElementById("stateAction");
  if (sa) sa.onclick = () => {
    if (sa.dataset.force) Store.startCycle({ force: true });
    else if (sa.textContent.trim() === "Réessayer") location.reload();
    else Store.startCycle();
  };
  // Verrou visuel : on ne peut PAS relancer un cycle tant que le précédent n'est pas fini.
  const busy = !!s.ui.busy;
  // Les boutons de LANCEMENT de cycle ne doivent se désactiver que si un cycle
  // tourne déjà (cycleBusy), pas pour n'importe quelle action en cours (busy
  // générique) — sinon "Lancer un cycle" se grise à tort pendant une simple
  // suppression/décision sans rapport (même bug racine que le loader plein écran).
  const cycleBusyGuard = !!s.ui.cycleBusy;
  // Rôle Lecteur : consultation seule, le backend refuse deja /api/cycle
  // (403 role_lecteur_lecture_seule) mais le bouton restait visuellement
  // actif -> trompeur (constate en test reel). Meme traitement que les
  // boutons de decision sur la fiche article.
  const isLecteur = !!(s.auth && s.auth.role === "lecteur");
  const cycleDisabled = cycleBusyGuard || isLecteur;
  const tc = document.getElementById("topbarCycle");
  if (tc) {
    tc.disabled = cycleDisabled;
    tc.title = isLecteur ? "Rôle Lecteur : consultation seule" : "Lancer un cycle";
    const lbl = tc.querySelector(".topbar-cta-label");
    if (lbl) lbl.textContent = cycleBusyGuard ? "En cours…" : "Lancer un cycle";
  }
  document.querySelectorAll('[data-action="cycle-force"]').forEach(el => { el.disabled = cycleDisabled; });
  const fabCycle = document.querySelector('.fab-action[data-act="cycle"]');
  if (fabCycle) { fabCycle.style.pointerEvents = cycleDisabled ? "none" : ""; fabCycle.classList.toggle("disabled", cycleDisabled); }
  // État de vérité du système dans la barre de statut (prêt / en cours / erreur)
  const am = document.getElementById("agentMode");
  if (am) {
    if (busy) am.textContent = "en cours";
    else if (s.health && s.health.status === "error") am.textContent = "erreur";
    else am.textContent = "prêt";
  }
  const amDot = document.querySelector("#agentStatus .dot");
  if (amDot) amDot.className = "dot " + (busy ? "dot-busy" : (s.health && s.health.status === "error" ? "dot-err" : "dot-ready"));
  // Écran plein écran chaleureux (wireframe 3.3, étendu à la demande) +
  // bandeau compact de repli. Piloté par cycleBusy (PAS busy — bug corrigé
  // 2026-08-19 : busy est un indicateur générique posé par TOUTE action en
  // cours, y compris une suppression/décision/restauration sans aucun rapport
  // avec un cycle de génération. Le loader plein écran affichait donc à tort
  // "Kora Agent explore les sources..." lors d'une simple suppression. Seul
  // cycleBusy — vrai uniquement pendant Store.startCycle() — doit déclencher
  // cet écran). Transition false->true : (ré)affiche le plein écran et relance
  // la rotation de messages. true->false : coupe tout, réinitialise l'état
  // "fermé" pour le prochain cycle.
  const cycleBusy = !!s.ui.cycleBusy;
  if (cycleBusy && !_wasBusy) startCycleMessages();
  if (!cycleBusy && _wasBusy) stopCycleMessages();
  _wasBusy = cycleBusy;
  const gl = document.getElementById("globalLoader");
  const cb = document.getElementById("cycleBanner");
  if (gl) gl.hidden = !(cycleBusy && !_loaderDismissed);
  if (cb) cb.hidden = !(cycleBusy && _loaderDismissed);
  // Indicateur "Article X sur Y" (backend : reach_agent.CYCLE_PROGRESS, exposé
  // par /api/last). N'apparaît que si le backend a déjà déterminé le nombre
  // de faits à générer (total > 0) — avant ça, on reste sur le message chaleureux seul.
  const prog = s.ui && s.ui.progress;
  const eta = prog && prog.eta_seconds != null ? Store.formatEta(prog.eta_seconds) : "";
  const progTxt = (prog && prog.total > 0)
    ? `Article ${prog.current || 1} sur ${prog.total}` + (eta ? ` (${eta})` : "")
    : "";
  const glProg = document.getElementById("globalLoaderProgress");
  if (glProg) { glProg.hidden = !progTxt; glProg.textContent = progTxt; }
  const cbProg = document.getElementById("cycleBannerProgress");
  if (cbProg) { cbProg.hidden = !progTxt; cbProg.textContent = progTxt; }
  // Estimation annoncée dès le lancement (2026-08-19, demande explicite) :
  // affichée UNIQUEMENT tant que le nombre d'articles n'est pas encore connu
  // (avant progTxt) -- une fois la progression réelle disponible, elle est
  // plus précise et prend le relais, pas besoin des deux à la fois.
  const launchEst = s.ui && s.ui.launchEstimate;
  const estTxt = (!progTxt && launchEst && launchEst.note) ? launchEst.note : "";
  const glEst = document.getElementById("globalLoaderEstimate");
  if (glEst) { glEst.hidden = !estTxt; glEst.textContent = estTxt; }
  const cbEst = document.getElementById("cycleBannerEstimate");
  if (cbEst) { cbEst.hidden = !estTxt; cbEst.textContent = estTxt; }
  if (cycleBusy) {
    const glDismiss = document.getElementById("globalLoaderDismiss");
    if (glDismiss) glDismiss.onclick = () => {
      _loaderDismissed = true;
      if (gl) gl.hidden = true;
      if (cb) cb.hidden = false;
    };
    const cancelHandler = () => confirmAction({
      title: "Interrompre le cycle ?",
      message: "L'arrêt survient après l'article en cours, pas instantanément.",
      confirmLabel: "Interrompre",
      onConfirm: () => Store.cancelCycle(),
    });
    const glCancel = document.getElementById("globalLoaderCancel");
    if (glCancel) glCancel.onclick = cancelHandler;
    const cbCancel = document.getElementById("cycleBannerCancel");
    if (cbCancel) cbCancel.onclick = cancelHandler;
  }
  // Bandeau vidéo global (2026-08-21) : visible depuis N'IMPORTE QUELLE page
  // tant que Store.state.videoJob est non-nul -- piloté par Store.startVideoJob,
  // pas par cette fonction (même principe que cycleBanner/cycleBusy ci-dessus,
  // mais ici l'état vit dans le Store car aucun "cycleBusy" global n'existait
  // pour la vidéo). _lastVideoJobStatus permet de détecter la TRANSITION vers
  // done/error une seule fois (sinon le snack se répéterait à chaque render).
  const vj = s.videoJob;
  const vjBanner = document.getElementById("videoJobBanner");
  if (vjBanner) {
    vjBanner.hidden = !vj;
    if (vj) {
      const STAGE_LABELS = { narration: "Narration…", image: "Image de couverture…", assemblage: "Assemblage…" };
      const vjText = document.getElementById("videoJobText");
      const vjStage = document.getElementById("videoJobStage");
      const vjOpen = document.getElementById("videoJobOpen");
      if (vj.status === "generating") {
        if (vjText) vjText.textContent = "Génération vidéo en cours" + (vj.title ? ` — ${vj.title}` : "") + "…";
        if (vjStage) vjStage.textContent = STAGE_LABELS[vj.stage] || "";
      } else if (vj.status === "done") {
        if (vjText) vjText.textContent = "Vidéo générée" + (vj.title ? ` — ${vj.title}` : "");
        if (vjStage) vjStage.textContent = "";
      } else if (vj.status === "error") {
        if (vjText) vjText.textContent = "Échec de la génération vidéo" + (vj.title ? ` — ${vj.title}` : "") + " : " + (vj.error || "erreur inconnue");
        if (vjStage) vjStage.textContent = "";
      }
      if (vjOpen) vjOpen.onclick = () => { navigate("facts"); openFact(vj.fact_id); };
    }
    if (vj && vj.fact_id !== _lastVideoJobId) { _lastVideoJobId = vj.fact_id; _lastVideoJobStatus = null; }
    if (vj && vj.status !== "generating" && vj.status !== _lastVideoJobStatus) {
      _lastVideoJobStatus = vj.status;
      if (vj.status === "done") snack("Vidéo narrée générée.");
      else if (vj.status === "error") snack("Erreur génération vidéo : " + (vj.error || "inconnue"));
    }
    if (!vj) { _lastVideoJobId = null; _lastVideoJobStatus = null; }
  }
  // Bug rapporté (2026-08-22, capture d'écran) : les cartes de la grille
  // Articles se déforment (débordement horizontal, cartes coupées) au
  // déclenchement d'une génération (article ou vidéo). Root cause RÉELLE
  // (diagnostic en profondeur avec Playwright, mesures DOM à l'appui) :
  // #app est en display:flex/flex-direction:row dès 768px, et
  // .cycle-banner (cycleBanner/videoJobBanner) n'avait PAS de
  // position:fixed contrairement à TOUS les autres éléments de
  // superposition du fichier (.sheet, .global-loader, .nav-scrim) -- un
  // bandeau redevenu visible devenait donc un TROISIÈME ITEM FLEX EN LIGNE
  // aux côtés de .rail et .view au lieu de s'empiler par-dessus, décalant
  // .view de la largeur du bandeau (mesuré : 230 à 410px selon le
  // contenu) et poussant les cartes hors de l'écran. Corrigé côté CSS
  // (.cycle-banner en position:fixed, style.css) -- ce qui restait à faire
  // ici : calculer --banner-h (hauteur du bandeau ACTUELLEMENT visible)
  // pour que .rail/.view se décalent d'autant, sans jamais rien recouvrir.
  // (L'ancien "hack" display:none/reflow tenté plus tôt le même jour
  // traitait un symptôme sans s'attaquer à cette cause réelle -- retiré.)
  const activeBanner = (cb && !cb.hidden) ? cb : (vjBanner && !vjBanner.hidden) ? vjBanner : null;
  const bannerH = activeBanner ? activeBanner.offsetHeight : 0;
  document.documentElement.style.setProperty("--banner-h", bannerH + "px");
  // Ne pas ré-exécuter renderSheet pendant l'édition (sinon le poll périodique
  // écrase le brouillon en cours) — sauf si le panneau a été fermé entre-temps
  // (ex. Échap), auquel cas il faut bien le masquer. Même garde pour une
  // vidéo en cours de lecture (2026-08-26, retour utilisateur réel : "la
  // vidéo plante après quelques secondes") -- renderSheet() reconstruit tout
  // #sheetBody, donc détruit et recrée le <video> à chaque appel ; sans ce
  // garde, le poll périodique (30s) ou n'importe quel autre setState()
  // remettait la lecture à zéro en plein visionnage.
  if ((!isEditingActive() && !isVideoPlaying()) || !s.sheet) {
    try { renderSheet(s); } catch (e) { console.error("renderSheet", e); }
  }
  try { if (s.route === "audit") bindAudit(); } catch (e) { console.error("bindAudit", e); }
  try { if (s.route === "sources") bindSources(); } catch (e) { console.error("bindSources", e); }
  try { if (s.route === "videos") bindVideos(); } catch (e) { console.error("bindVideos", e); }
  // Lecteur inline sur la page Publiés (2026-08-23, demande explicite :
  // "les faire apparaître sur la page Publiés avec leur affordance vidéo")
  // -- bindVideoPlayers() cherche video_path par fact_id dans le tableau
  // passé : s.facts (pas Store.state.videos, potentiellement vide si la
  // page Vidéos n'a jamais été visitée cette session) porte déjà ce champ
  // depuis le correctif de list_facts() (editorial/hitl_store.py).
  try { if (s.route === "published") bindVideoPlayers(s.facts || []); } catch (e) { console.error("bindVideoPlayers(published)", e); }
  try { if (s.route === "settings" && !settingsAlreadyMounted) bindSettings(); } catch (e) { console.error("bindSettings", e); }
  // Barre d'action de sélection multiple
  try {
    const sb = document.getElementById("selectBar");
    if (sb) {
      // N'apparaît QUE sur les pages de contenu (sélection pertinente) et
      // uniquement si au moins un article est coché. Sinon elle reste cachée
      // (pas de barre "perdue" sur Sources / Paramètres / Historique / Corbeille).
      const SEL_ROUTES = ["dashboard", "facts", "drafts", "trash"];
      const n = Store.selectedIds().length;
      sb.hidden = !(s.selectMode && n > 0 && SEL_ROUTES.includes(s.route));
      const cnt = document.getElementById("selectCount");
      if (cnt) cnt.textContent = n;
      // Éviter que la FAB ne chevauche la bulle de sélection (tous breakpoints)
      const fab = document.getElementById("fab");
      if (fab) fab.hidden = !sb.hidden;
      // Grise un bouton d'action déjà dans l'état visé (2026-08-25, retour
      // utilisateur : "je mets un article en corbeille, je le rouvre, le
      // bouton Corbeille reste actif alors qu'il n'y a plus rien à faire").
      // Ne désactive que si TOUS les articles sélectionnés sont DÉJÀ dans
      // l'état ciblé -- une sélection mixte (ex: 1 article en attente + 1
      // déjà en corbeille) laisse le bouton actif, l'action reste utile pour
      // le reste du lot (et redondante-sans-danger pour l'autre).
      const selectedFacts = (Store.state.facts || []).filter(f => Store.state.selection[f.fact_id]);
      // isTrashed() reprend EXACTEMENT le repli de catOf() (views/facts.js) --
      // revue qualité 2026-08-25 : f.status seul ratait les faits dont
      // trashed_at est posé sans que status soit encore passé à "TRASHED"
      // (même classe de cas que catOf() gère déjà, voir son commentaire),
      // laissant à tort le bouton Corbeille actif pour cette tranche de faits.
      const isTrashed = (f) => f.status === "TRASHED" || !!(f.trashed_at && f.trashed_at !== "");
      const matchesTarget = (f, key) => key === "TRASHED" ? isTrashed(f) : f.status === key;
      const allAlready = (key) => selectedFacts.length > 0 && selectedFacts.every(f => matchesTarget(f, key));
      const bulkTargets = { pending: "PENDING_REVIEW", trash: "TRASHED", draft: "EDITED", approve: "TRANSMITTED" };
      sb.querySelectorAll("[data-bulk]").forEach(b => {
        b.disabled = allAlready(bulkTargets[b.dataset.bulk]);
      });
    }
    // Bouton "Sélectionner" est re-rendu à chaque render -> on le câble ici (pas dans bind())
    const enterSel = document.getElementById("enterSelect");
    if (enterSel) enterSel.onclick = () => Store.setSelectMode(!Store.state.selectMode);
    // Sections du dashboard cliquables -> navigation (ex: Sources -> page Sources)
    document.querySelectorAll("[data-nav]").forEach(n => {
      n.onclick = () => { const r = n.getAttribute("data-nav"); if (r) navigate(r); };
      n.onkeydown = (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); const r = n.getAttribute("data-nav"); if (r) navigate(r); } };
    });
  } catch (e) { console.error("selectBar", e); }
  // Corbeille : boutons restaurer / supprimer définitivement
  try {
    document.querySelectorAll("[data-restore]").forEach(b => b.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      guardClick(b, () => Store.restoreFact(b.dataset.restore).then(() => snack("Restauré")).catch(e => snack("Erreur : " + e.message)));
    });
    document.querySelectorAll("[data-del]").forEach(b => b.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      confirmAction({
        title: "Supprimer définitivement ?",
        message: "Cette action est irréversible.",
        confirmLabel: "Supprimer",
        onConfirm: () => Store.deleteForever([b.dataset.del]).then(r => snack(`${r.deleted || 0} supprimé(s)`)).catch(e => snack("Erreur : " + e.message)),
      });
    });
    document.querySelectorAll("[data-finish]").forEach(b => b.onclick = () => {
      Store.finishDraft(b.dataset.finish).then(() => snack("Remis en attente de validation")).catch(e => snack("Erreur : " + e.message));
    });
    // Retrait synchronisé (2026-08-23, ADR-0005, tâche T3) : bouton "Retirer
    // de WordPress", présent à la fois sur la page Publiés (viewPublished)
    // et dans le tiroir article (sheet.js) -- même délégation centralisée
    // que les autres actions de cette fonction.
    document.querySelectorAll("[data-withdraw]").forEach(b => b.onclick = () => guardClick(b, () =>
      Store.withdrawFromWordPress(b.dataset.withdraw).then(r => {
        if (r?.cancelled) return;
        if (r?.warning) snack(`Article retiré (${r.warning})`);
        else snack("Article retiré de WordPress, redevenu modifiable.");
        Store.closeSheet();
      }).catch(e => snack(friendlyActionError(e)))));
    // Suppression DÉFINITIVE côté WordPress (2026-08-25, demande explicite :
    // "l'utilisateur ne doit presque rien faire côté... WordPress... tout
    // se gère à partir de KORA") -- même délégation que data-withdraw
    // ci-dessus, mais geste irréversible : confirmation appuyée via
    // confirmAction() (même pattern que data-del, corbeille KORA), pas un
    // simple window.confirm().
    document.querySelectorAll("[data-delete-wp]").forEach(b => b.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      const fid = b.dataset.deleteWp;
      confirmAction({
        title: "Supprimer définitivement de WordPress ?",
        message: "Le post sera détruit sur WordPress, sans passer par sa corbeille -- aucun retour en arrière possible. L'article restera consultable dans la corbeille de KORA.",
        confirmLabel: "Supprimer de WordPress",
        onConfirm: () => guardClick(b, () =>
          Store.deleteFromWordPress(fid).then(r => {
            if (r?.warning) snack(`Supprimé de WordPress (${r.warning})`);
            else snack("Article supprimé définitivement de WordPress.");
          }).catch(e => snack(friendlyActionError(e)))),
      });
    });
  } catch (e) { console.error("trashBtns", e); }
  // Boutons afficher/masquer le mot de passe (login + settings)
  try { bindPasswordToggles(); } catch (e) { console.error("pwToggles", e); }
  // Re-bind dynamic events after every render (filter pills, fact cards, etc.)
  try { bind(); } catch (e) { console.error("bind", e); }
}

// URLs distinctes par page (2026-08-20, demande explicite : "plusieurs URLs
// comme les autres applis" plutôt qu'une seule adresse + fragment #hash
// invisible du serveur). Table de correspondance clé-route-interne <-> segment
// d'URL public : les clés internes (s.route, data-route, viewByRoute...) ne
// changent PAS (trop de points d'usage pour un renommage sans risque) --
// seule la représentation dans l'URL change, traduite ici aux deux points
// d'entrée/sortie (navigate() écrit, boot() lit). Un seul segment de
// profondeur pour CHAQUE route (jamais /kora-v2/a/b/...) : le build Vite
// utilise des chemins d'assets RELATIFS (base:"./", voir vite.config.js) --
// une URL à deux segments de profondeur casserait le chargement des assets
// (mauvaise résolution relative), une URL à un seul segment reste sûre.
// _LEGACY_ROUTE_ALIASES (2026-08-25, revue qualité : bug réel trouvé après
// un premier correctif incomplet) : mappe une ANCIENNE valeur de route
// vers son nom actuel. Portée MODULE (pas locale à boot()) et consultée
// depuis navigate() elle-même (pas seulement le parsing du #hash au
// démarrage) -- une notification PERSISTÉE en base avant ce renommage
// (table notifications, colonne route -- voir server.py) peut encore
// contenir la valeur "cockpit" longtemps après le déploiement (tant
// qu'elle reste non lue) ; notifications.js appelle navigate(n.route)
// directement, sans jamais passer par le parsing du #hash de boot() --
// le premier correctif (alias uniquement dans boot()) ne couvrait pas
// ce chemin, laissant le même symptôme (route bloquée sur "cockpit",
// compteurs du tableau de bord jamais rechargés) pour quiconque clique
// une vieille notification non lue.
const _LEGACY_ROUTE_ALIASES = { cockpit: "dashboard" };
const ROUTE_SLUGS = {
  dashboard: "", facts: "articles", drafts: "brouillons", trash: "corbeille",
  sources: "sources", videos: "videos", audit: "historique", settings: "parametres", styleguide: "style-guide",
};
const SLUG_ROUTES = Object.fromEntries(
  Object.entries(ROUTE_SLUGS).filter(([, slug]) => slug).map(([route, slug]) => [slug, route])
);
// F1 (audit UX Cockpit, 2026-08-24) : les tuiles "À décider"/"Brouillons"/
// "Rejetés" pointaient toutes vers la même URL /articles sans refléter le
// filtre actif -- impossible de partager ou recharger un lien direct vers
// "mes brouillons". Le filtre de la vue Articles est maintenant reflété en
// query param (?filtre=pending), lu au chargement dans boot().
function routeToPath(route, filter) {
  const slug = ROUTE_SLUGS[route];
  let path = "/kora-v2/" + (slug !== undefined ? slug : route);
  if (route === "facts" && filter && filter !== "all") path += "?filtre=" + encodeURIComponent(filter);
  return path;
}
function navigate(route, push = true) {
  // Normalise toute ancienne valeur de route (voir _LEGACY_ROUTE_ALIASES) --
  // couvre notamment les notifications persistées en base avant le
  // renommage cockpit -> dashboard, dont data-route peut encore valoir
  // "cockpit" tant qu'elles restent non lues (notifications.js appelle
  // navigate(n.route) directement).
  route = _LEGACY_ROUTE_ALIASES[route] || route;
  // Coupe toute vidéo en lecture avant de changer de page (2026-08-26,
  // filet complémentaire à Store.closeSheet() : couvre le cas où
  // l'utilisateur navigue directement -- rail, notification, lien --
  // SANS être passé par un bouton de fermeture explicite du panneau, qui
  // laisserait sinon l'audio d'une vidéo jouer en arrière-plan pendant
  // qu'il consulte une autre page).
  try { document.querySelectorAll(".video-preview").forEach(v => { if (!v.paused) v.pause(); }); } catch (e) {}
  const filter = route === "facts" ? Store.getFactFilter() : undefined;
  const path = routeToPath(route, filter);
  if (push && (location.pathname + location.search) !== path) {
    try { history.pushState({ route }, "", path); } catch (e) {}
  }
  Store.setRoute(route);
  Store.setState({ ui: { ...Store.state.ui, busy: false, overlay: null } });
  if (route === "facts") Store.loadHITL();
  else if (route === "drafts") Store.loadHITL();
  else if (route === "trash") Store.loadTrash();
  else if (route === "audit") Store.loadAudit();
  else if (route === "sources") Store.loadSources();
  else if (route === "videos") Store.loadVideos();
  else if (route === "dashboard") { Store.loadLast(); Store.loadHITL(); }
  render();
}
async function openFact(id) {
  const facts = Store.state.facts || [];
  let f = facts.find(x => x.fact_id === id);
  if (!f && (id || "").startsWith("idx")) {
    const i = parseInt(id.slice(3), 10);
    f = facts[i];
  }
  if (!f) return;
  // Chargement à la demande (2026-08-25, correctif poids de charge /api/hitl) :
  // la liste est désormais allégée (sans le texte complet de chaque article,
  // voir hitl_store.py::list_facts(light=True)) -- f.article est alors absent
  // (clé OMISE, pas juste vide : voir _shape_fact_row) et sert de signal
  // fiable "détail pas encore chargé". On va le chercher UNE SEULE fois par
  // fait : Object.assign mute l'objet déjà présent dans Store.state.facts,
  // donc les ouvertures suivantes du même article sont instantanées (aucun
  // second appel réseau). Le tiroir n'ouvre qu'UNE FOIS le détail arrivé
  // (plutôt qu'ouvrir vide puis "sauter" au contenu) : renderSheet() (très
  // dense, des dizaines de correctifs déjà) n'a besoin d'AUCUN changement.
  if (f.article === undefined) {
    // Anti-obsolescence (2026-08-25, revue fable-advisor) : capture la
    // génération AVANT le fetch -- si le tiroir a été fermé ou qu'un AUTRE
    // article a été ouvert entretemps (Store.getSheetGen() a changé), le
    // résultat est jeté silencieusement au retour : n'ouvre PAS un tiroir
    // que l'utilisateur a fermé, n'écrase PAS l'article qu'il regarde
    // désormais avec une réponse plus ancienne arrivée en retard.
    const gen = Store.getSheetGen();
    const card = document.querySelector(`[data-fact="${CSS.escape(f.fact_id)}"]`);
    if (card) card.classList.add("opening");
    try {
      const r = await Store.api("/api/hitl/fact?id=" + encodeURIComponent(f.fact_id));
      if (Store.getSheetGen() !== gen) return;
      if (!r || !r.ok || !r.fact) {
        snack("Impossible de charger l'article, réessaie.");
        return;
      }
      Object.assign(f, r.fact);
    } catch (e) {
      if (Store.getSheetGen() !== gen) return;
      snack(e.message || "Impossible de charger l'article, réessaie.");
      return;
    } finally {
      if (card) card.classList.remove("opening");
    }
  }
  Store.openSheet({ type: "fact", fact: f });
  renderSheet(Store.state);
}

function bind() {
  // Bug corrigé (2026-08-25, audit mobile réel -- sélection multiple
  // imprévisible sur mobile, cf. #selectBar) : bind() est rappelée à CHAQUE
  // render() (y compris les polls périodiques toutes les 30s), et ce
  // listener document N'AVAIT PAS le garde-fou déjà appliqué plus bas pour
  // le clic-dehors des notifications (__notifOutsideBound) -- il s'empilait
  // donc indéfiniment, un seul tap réel déclenchant autant d'appels à
  // Store.toggleSelect() que de renders écoulés depuis l'ouverture de la
  // page (18 appels mesurés après quelques minutes d'ouverture), rendant la
  // sélection totalement aléatoire (un nombre pair d'appels accumulés
  // annule le tap). Même garde-fou que __notifOutsideBound/
  // __koraLongPressBound juste en dessous : safe à enregistrer une seule
  // fois pour toute la session, ce listener délègue entièrement via
  // e.target.closest() au moment du clic, sans jamais fermer sur un élément
  // ou un état figé au moment du bind().
  if (!window.__koraCardClickBound) {
    window.__koraCardClickBound = true;
    document.addEventListener("click", (e) => {
      // Coche visible au survol (desktop) : clic sur la case = sélection même hors mode
      const checkEl = e.target.closest(".fact-check");
      if (checkEl && !checkEl.classList.contains("fact-check-locked")) {
        const fid = checkEl.dataset.check;
        if (fid) {
          e.preventDefault(); e.stopPropagation();
          if (window.__koraIgnoreNextClick) return;
          if (!Store.state.selectMode) Store.setSelectMode(true);
          Store.toggleSelect(fid);
          if (navigator.vibrate) navigator.vibrate(20);
        }
        return;
      }
      if (window.__koraIgnoreNextClick) { e.preventDefault(); e.stopPropagation(); window.__koraIgnoreNextClick = false; return; }
      // Ne pas ouvrir le tiroir detail si le clic vient d'un bouton d'action
      // (Restaurer / Supprimer / Selection) ou d'une carte de la corbeille :
      // dans la corbeille, les seules actions valides sont Restaurer/Supprimer,
      // jamais "ouvrir l'article en entier" (evite le bug ou un Supprimer ouvrait la fiche).
      if (e.target.closest("button, a, input, [data-restore], [data-del]")) return;
      const card = e.target.closest(".fact-card");
      if (!card) return;
      if (card.classList.contains("trash-card")) return; // corbeille : pas d'ouverture de fiche
      // En mode sélection, le clic sur la carte (ou sa case) ne doit PAS ouvrir le tiroir.
      if (Store.state.selectMode) { e.stopPropagation(); return; }
      e.stopPropagation();
      // Résolution + chargement à la demande centralisés dans openFact()
      // (2026-08-25, correctif poids de charge -- voir sa doc) : gère déjà
      // le repli "idxN" (fact_id absent) que ce listener dupliquait ici.
      openFact(card.dataset.fact);
    });
  }
  // ---- Appui long mobile (500ms) : entre en sélection + toggle, avec vibration ----
  if (!window.__koraLongPressBound) {
    window.__koraLongPressBound = true;
    window.__koraIgnoreNextClick = false;
    let lpTimer = null, lpX = 0, lpY = 0, lpFid = null;
    const clearLp = (card) => {
      if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
      if (card) card.classList.remove("long-press-active");
      lpFid = null;
    };
    document.addEventListener("touchstart", (e) => {
      const card = e.target.closest(".fact-card");
      if (!card || card.classList.contains("select-locked") || card.classList.contains("trash-card")) return;
      const fid = card.dataset.fact;
      if (!fid) return;
      const t = e.touches[0];
      lpX = t.clientX; lpY = t.clientY; lpFid = fid;
      card.classList.add("long-press-active");
      lpTimer = setTimeout(() => {
        lpTimer = null;
        const s = Store.state;
        const facts = s.facts || [];
        const f = facts.find(x => x.fact_id === lpFid);
        const st = (s.decisions[lpFid] || f?.status || "PENDING_REVIEW");
        if (st === "TRANSMITTED") { clearLp(card); return; }
        if (!s.selectMode) Store.setSelectMode(true);
        Store.toggleSelect(lpFid);
        if (navigator.vibrate) navigator.vibrate(40);
        window.__koraIgnoreNextClick = true;
        setTimeout(() => { window.__koraIgnoreNextClick = false; }, 600);
        card.classList.remove("long-press-active");
        lpFid = null;
      }, 500);
    }, { passive: true });
    document.addEventListener("touchmove", (e) => {
      if (!lpTimer) return;
      const t = e.touches[0];
      if (Math.abs(t.clientX - lpX) > 10 || Math.abs(t.clientY - lpY) > 10) {
        const c = e.target.closest(".fact-card");
        clearLp(c);
      }
    }, { passive: true });
    document.addEventListener("touchend", (e) => {
      const c = e.target.closest(".fact-card");
      clearLp(c);
    });
    document.addEventListener("touchcancel", () => clearLp(null));
  }
  // Filtres de la vue Articles : chaque pill filtre la liste SAUF "Corbeille"
  // qui pointe vers LA page corbeille unique (meme route/representation que la
  // sidebar) -> un seul endroit pour la corbeille, proprietes identiques.
  $$("[data-fact-filter]").forEach(n => n.onclick = () => {
    const f = n.dataset.factFilter;
    if (f === "trash") { navigate("trash"); return; }
    Store.setFactFilter(f);
    // F1 : la route ne change pas (on reste sur "facts"), mais l'URL doit
    // refléter le nouveau filtre pour rester partageable/rechargeable.
    try { history.replaceState({ route: "facts" }, "", routeToPath("facts", f)); } catch (e) {}
    const sc = document.getElementById("railScrim");
    if (sc) sc.hidden = true;
  });
  // Lien copiable (suggestion, audit UX Cockpit 2026-08-24) : l'URL reflète
  // déjà le filtre actif grâce à F1 (?filtre=...) -- copier location.href
  // suffit, pas besoin de reconstruire l'URL nous-mêmes.
  const copyFilterBtn = document.getElementById("copyFilterLink");
  if (copyFilterBtn) copyFilterBtn.onclick = () => {
    navigator.clipboard?.writeText(location.href)
      .then(() => snack("Lien copié"))
      .catch(() => snack("Impossible de copier le lien"));
  };
  // ---- Sélection multiple + actions en masse ----
  const enterSel = document.getElementById("enterSelect");
  if (enterSel) enterSel.onclick = () => Store.setSelectMode(!Store.state.selectMode);
  const selectBar = document.getElementById("selectBar");
  if (selectBar) {
    selectBar.querySelectorAll("[data-bulk]").forEach(b => b.onclick = () => onBulkAction(b.dataset.bulk));
  }
  // Fenêtre choix WP (publish vs draft) -- généralisée le 2026-08-22 (demande
  // explicite : "je veux les deux options" aussi sur l'Approbation d'UN
  // seul article, pas seulement en sélection multiple). _wpChoiceTarget
  // distingue les deux appelants ("bulk" -> doBulkApprove, sinon un
  // fact_id -> _resolveFactWpChoice) sans dupliquer la fenêtre elle-même.
  const wpChoice = document.getElementById("wpChoice");
  const wpScrim = document.getElementById("wpScrim");
  const openWp = () => { document.getElementById("wpCount").textContent = Store.selectedIds().length; wpChoice.hidden = false; if (wpScrim) wpScrim.hidden = false; };
  const closeWp = () => { wpChoice.hidden = true; if (wpScrim) wpScrim.hidden = true; _wpChoiceTarget = null; };
  const wpPublish = document.getElementById("wpPublish");
  if (wpPublish) wpPublish.onclick = () => {
    const target = _wpChoiceTarget; closeWp();
    if (target === "bulk") doBulkApprove("publish");
    else if (target) _resolveFactWpChoice(target, "publish");
  };
  const wpDraft = document.getElementById("wpDraft");
  if (wpDraft) wpDraft.onclick = () => {
    const target = _wpChoiceTarget; closeWp();
    if (target === "bulk") doBulkApprove("draft");
    else if (target) _resolveFactWpChoice(target, "draft");
  };
  const wpCancel = document.getElementById("wpCancel");
  if (wpCancel) wpCancel.onclick = closeWp;
  if (wpScrim) wpScrim.onclick = closeWp;
  // Fenêtre corbeille / suppression définitive
  const trashChoice = document.getElementById("trashChoice");
  const openTrash = () => {
    document.getElementById("trashCount").textContent = Store.selectedIds().length;
    const def = document.getElementById("trashDefinitive");
    def.checked = false;
    document.getElementById("trashDelete").hidden = true;
    trashChoice.hidden = false; if (wpScrim) wpScrim.hidden = false;
  };
  const closeTrash = () => { trashChoice.hidden = true; if (wpScrim) wpScrim.hidden = true; };
  const trashPut = document.getElementById("trashPut");
  if (trashPut) trashPut.onclick = () => { closeTrash(); doBulkTrash(false); };
  const trashDelete = document.getElementById("trashDelete");
  if (trashDelete) trashDelete.onclick = () => { closeTrash(); doBulkTrash(true); };
  const trashCancel = document.getElementById("trashCancel");
  if (trashCancel) trashCancel.onclick = closeTrash;
  const trashDef = document.getElementById("trashDefinitive");
  if (trashDef) trashDef.onchange = () => { document.getElementById("trashDelete").hidden = !trashDef.checked; };

  const btn403 = document.querySelector("[data-403-home]");
  if (btn403) btn403.onclick = () => navigate("dashboard");

  // ---- Identite du compte connecte (topbar) ----
  const topbarIdentity = document.getElementById("topbarIdentity");
  if (topbarIdentity) topbarIdentity.onclick = () => navigate("settings");

  // F3 (audit UX Cockpit, 2026-08-24) : le focus ne suit pas toujours le
  // hash automatiquement (comportement de fragment-focus incohérent selon
  // navigateur/contexte pour une cible tabindex="-1") -- on le force
  // explicitement plutôt que de compter dessus, pattern standard des liens
  // d'évitement en production.
  const skipLink = document.querySelector(".skip-link");
  if (skipLink) skipLink.onclick = (e) => {
    e.preventDefault();
    const target = document.getElementById("bottomnav");
    if (target) target.focus();
  };

  // ---- Centre de notifications (10.2) ----
  renderNotifCenter();
  const notifBell = document.getElementById("notifBell");
  const notifPanel = document.getElementById("notifPanel");
  const notifMarkAll = document.getElementById("notifMarkAll");
  if (notifBell && notifPanel) {
    notifBell.onclick = (e) => {
      e.stopPropagation();
      const willOpen = notifPanel.hidden;
      notifPanel.hidden = !willOpen;
      notifBell.setAttribute("aria-expanded", String(willOpen));
      // Rafraîchit depuis le serveur à l'ouverture (2026-08-22) : le badge
      // peut avoir bougé depuis le dernier poll de 30s (cycle/vidéo tout
      // juste terminés ailleurs) -- autant afficher l'état le plus frais
      // au moment précis où l'utilisateur regarde.
      if (willOpen) Store.loadNotifications().then(renderNotifCenter);
    };
  }
  if (notifMarkAll) notifMarkAll.onclick = () => Store.markAllNotificationsRead().then(renderNotifCenter);
  // Fermeture au clic extérieur — bind() est rappelée à chaque render, donc
  // on garde un flag pour n'enregistrer CE listener document qu'une seule
  // fois (sinon il s'empilerait à chaque re-render).
  if (!window.__notifOutsideBound) {
    window.__notifOutsideBound = true;
    document.addEventListener("click", (e) => {
      const panel = document.getElementById("notifPanel");
      const bell = document.getElementById("notifBell");
      if (panel && !panel.hidden && !e.target.closest(".notif-wrap")) {
        panel.hidden = true;
        if (bell) bell.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const panel = document.getElementById("notifPanel");
      if (panel && !panel.hidden) {
        panel.hidden = true;
        const bell = document.getElementById("notifBell");
        if (bell) bell.setAttribute("aria-expanded", "false");
      }
    });
  }

  // =========================================================
  // LEFT DRAWER — Mobile (≤819px) : hamburger → 248px slide-in
  // =========================================================
  const leftDrawer = document.getElementById("leftDrawer");
  const leftDrawerScrim = document.getElementById("leftDrawerScrim");
  const leftDrawerClose = document.getElementById("leftDrawerClose");
  let leftDrawerTouchStartX = 0;
  let leftDrawerTouchStartTime = 0;

  const openLeftDrawer = () => {
    if (leftDrawer) { leftDrawer.hidden = false; leftDrawer.classList.add("open"); }
    if (leftDrawerScrim) { leftDrawerScrim.hidden = false; leftDrawerScrim.classList.add("visible"); }
    document.body.style.overflow = "hidden";
  };
  const closeLeftDrawer = () => {
    if (leftDrawer) leftDrawer.classList.remove("open");
    if (leftDrawerScrim) leftDrawerScrim.classList.remove("visible");
    setTimeout(() => { if (leftDrawer) leftDrawer.hidden = true; if (leftDrawerScrim) leftDrawerScrim.hidden = true; document.body.style.overflow = ""; }, 300);
  };
  if (leftDrawerClose) leftDrawerClose.onclick = closeLeftDrawer;
  if (leftDrawerScrim) leftDrawerScrim.onclick = closeLeftDrawer;

  // Swipe dismiss for left drawer (right-to-left swipe)
  // Bug corrigé (2026-08-25, revue fable-advisor du correctif audit mobile
  // -- même classe de bug que __koraOverflowMenuBound trois blocs plus
  // haut, manqué lors de la première passe) : leftDrawer est un nœud du
  // shell stable (jamais reconstruit par render(), voir app.innerHTML =
  // SHELL dans main.js) -- ces deux addEventListener s'empilaient donc eux
  // aussi à chaque render().
  if (leftDrawer && !window.__koraLeftDrawerSwipeBound) {
    window.__koraLeftDrawerSwipeBound = true;
    leftDrawer.addEventListener("touchstart", (e) => {
      leftDrawerTouchStartX = e.touches[0].clientX;
      leftDrawerTouchStartTime = Date.now();
    }, { passive: true });
    leftDrawer.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - leftDrawerTouchStartX;
      const dt = Date.now() - leftDrawerTouchStartTime;
      if (dx < -60 && dt < 300) closeLeftDrawer();
    }, { passive: true });
  }

  // Delegate nav clicks inside left drawer
  if (leftDrawer) {
    leftDrawer.querySelectorAll("[data-route]").forEach(n => {
      n.onclick = () => {
        closeLeftDrawer();
        navigate(n.dataset.route);
      };
    });
  }

  // =========================================================
  // RAIL — Desktop/Tablet persistent (collapse/expand + drawer)
  // =========================================================
  const railEl = document.getElementById("rail");
  $$("[data-route]").forEach(n => n.onclick = () => {
    if (railEl) railEl.classList.remove("open");
    const sc = document.getElementById("railScrim");
    if (sc) sc.hidden = true;
    navigate(n.dataset.route);
  });
  const tc = document.getElementById("topbarCycle");
  if (tc) tc.onclick = () => { navigate("dashboard"); Store.startCycle(); };
  // Rail drawer : toggle collapse (desktop) + menu (mobile drawer)
  const closeRailDrawer = () => {
    const rail = document.getElementById("rail");
    if (rail) rail.classList.remove("open");
    const sc = document.getElementById("railScrim");
    if (sc) sc.hidden = true;
  };
  const rt = document.getElementById("railToggle");
  // Libellé/aria-label reflètent l'état RÉEL (avant : toujours "Réduire la
  // barre", même une fois repliée — un lecteur d'écran annonçait l'action
  // inverse de celle réellement disponible). Recalculé à chaque bind() ET
  // après chaque clic, donc toujours synchronisé avec l'état affiché.
  const syncRailToggleLabel = () => {
    if (!rt) return;
    const label = Store.getRail() === "expanded" ? "Réduire la barre" : "Agrandir la barre";
    rt.title = label;
    rt.setAttribute("aria-label", label);
  };
  syncRailToggleLabel();
  if (rt) rt.onclick = () => {
    // Sur mobile, la flèche ferme le drawer ; sur desktop elle réduit/agrandit le rail.
    if (window.matchMedia("(max-width: 819px)").matches) { closeRailDrawer(); return; }
    Store.setRail(Store.getRail() === "expanded" ? "collapsed" : "expanded");
    syncRailToggleLabel();
  };
  // Clic sur le scrim = ferme le drawer mobile (corrige l'impossibilité de refermer)
  const rsc = document.getElementById("railScrim");
  if (rsc) rsc.onclick = closeRailDrawer;
  // Widget "articles à approuver" du rail retiré (redondant avec la carte
  // KPI "Articles à approuver" du tableau de bord, qui fait déjà la même
  // chose et est déjà enseignée dans le tour guidé — cf. shell.js).

  // =========================================================
  // RIGHT DRAWER OVERLAY — Desktop/Tablet (≥820px) : "Plus" menu
  // =========================================================
  const rightDrawer = document.getElementById("rightDrawer");
  const rightDrawerScrim = document.getElementById("rightDrawerScrim");
  const rightDrawerClose = document.getElementById("rightDrawerClose");
  let rightDrawerFocusTrap = null;

  const openRightDrawer = () => {
    if (rightDrawer) { rightDrawer.hidden = false; rightDrawer.classList.add("open"); }
    if (rightDrawerScrim) { rightDrawerScrim.hidden = false; rightDrawerScrim.classList.add("visible"); }
    document.body.style.overflow = "hidden";
    // Focus trap
    setTimeout(() => {
      const focusable = rightDrawer?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable?.length) {
        rightDrawerFocusTrap = focusable[0];
        focusable[focusable.length - 1].addEventListener("keydown", trapFocus);
        rightDrawerFocusTrap.focus();
      }
    }, 0);
  };
  const closeRightDrawer = () => {
    if (rightDrawer) rightDrawer.classList.remove("open");
    if (rightDrawerScrim) rightDrawerScrim.classList.remove("visible");
    setTimeout(() => { if (rightDrawer) rightDrawer.hidden = true; if (rightDrawerScrim) rightDrawerScrim.hidden = true; document.body.style.overflow = ""; }, 300);
    // Remove focus trap
    if (rightDrawerFocusTrap) {
      const focusable = rightDrawer?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable?.length) focusable[focusable.length - 1].removeEventListener("keydown", trapFocus);
      rightDrawerFocusTrap = null;
    }
  };
  const trapFocus = (e) => {
    if (e.key === "Tab") {
      const focusable = rightDrawer?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    } else if (e.key === "Escape") {
      closeRightDrawer();
    }
  };

  // Open right drawer from any "Plus" trigger (rail or bottom nav)
  document.querySelectorAll("[data-plus]").forEach((el) => {
    el.onclick = (e) => { e.preventDefault(); openRightDrawer(); };
  });

  if (rightDrawerClose) rightDrawerClose.onclick = closeRightDrawer;
  if (rightDrawerScrim) rightDrawerScrim.onclick = closeRightDrawer;

  // Delegate nav clicks inside right drawer
  if (rightDrawer) {
    rightDrawer.querySelectorAll("[data-route]").forEach(n => {
      n.onclick = () => {
        closeRightDrawer();
        navigate(n.dataset.route);
      };
    });
  }

  // =========================================================
  // OVERFLOW MENU mobile (bottom nav surchargé → items secondaires en drawer bas)
  // =========================================================
  const overflowMenu = document.getElementById("overflowMenu");
  const navScrim = document.getElementById("navScrim");
  let overflowTouchStartY = 0;
  let overflowTouchStartTime = 0;

  const closeOverflow = () => { if (overflowMenu) { overflowMenu.classList.remove("open"); overflowMenu.hidden = true; } if (navScrim) navScrim.hidden = true; };
  // Bug corrige (2026-08-26, signale par audit UI/UX mobile, reproduit 2x) :
  // le menu "Plus d'options" restait visible par-dessus la nouvelle page
  // apres un tap sur un de ses items. Deux causes cumulees :
  // 1. Ordre d'appel invers e par rapport au right-drawer desktop (qui lui
  //    ferme AVANT de naviguer, voir plus bas) -- ici c'etait navigate()
  //    D'ABORD, closeOverflow() APRES. navigate() appelle Store.setState()
  //    puis render() de facon SYNCHRONE, qui relance bind() et reconstruit
  //    tous les gestionnaires -- fermer APRES cette cascade est fragile
  //    (fenetre ou l'etat visuel peut rester incoherent le temps d'un
  //    re-render). Ferme desormais AVANT, comme le right-drawer.
  // 2. Defaut CSS reel (voir style.css `.overflow-menu[hidden]`) : l'attribut
  //    HTML `hidden` n'avait AUCUN effet visuel ici, la regle de classe
  //    `.overflow-menu { display:flex }` d'un stylesheet auteur l'emportant
  //    toujours sur `[hidden]{display:none}` de la feuille UA -- seule la
  //    classe `.open` (transform) controlait vraiment la visibilite. Les deux
  //    causes sont corrigees en defense en profondeur (l'une seule aurait pu
  //    suffire a masquer le symptome, mais aurait laisse l'autre latente).
  if (overflowMenu) overflowMenu.querySelectorAll(".overflow-item").forEach(it => it.onclick = () => { closeOverflow(); navigate(it.dataset.route); });

  // Bug corrigé (2026-08-25, audit mobile réel -- même classe de bug que
  // __koraCardClickBound plus haut) : ces listeners document/window et ce
  // navScrim.addEventListener (sur un nœud stable du shell, jamais
  // reconstruit -- voir app.innerHTML = SHELL dans main.js, exécuté UNE
  // FOIS) s'empilaient tous à chaque render(). Un seul flag couvre tout ce
  // bloc "menu Plus mobile" : les valeurs fermées (overflowMenu, navScrim)
  // restent celles du premier bind(), ce qui est correct puisque ce sont
  // des nœuds stables du shell, jamais remplacés par un innerHTML.
  if (!window.__koraOverflowMenuBound) {
    window.__koraOverflowMenuBound = true;
    // Ouverture du menu Plus (mobile) — délégation document CAPTURE (shell injecté apres init)
    document.addEventListener("click", (e) => {
      const plus = e.target.closest && e.target.closest("#navPlus");
      if (plus) {
        e.preventDefault(); e.stopPropagation();
        if (!overflowMenu) return;
        overflowMenu.hidden = false;              // retire l'attribut hidden (sinon display:none UA)
        overflowMenu.classList.add("open");   // idempotent : reste ouvert malgre events multiples d'un meme tap
        if (navScrim) navScrim.hidden = false;
      }
    }, true);
    if (navScrim) navScrim.addEventListener("click", () => { overflowMenu.classList.remove("open"); navScrim.hidden = true; });

    // Swipe dismiss for overflow menu (downward swipe)
    if (overflowMenu) {
      overflowMenu.addEventListener("touchstart", (e) => {
        overflowTouchStartY = e.touches[0].clientY;
        overflowTouchStartTime = Date.now();
      }, { passive: true });
      overflowMenu.addEventListener("touchend", (e) => {
        const dy = e.changedTouches[0].clientY - overflowTouchStartY;
        const dt = Date.now() - overflowTouchStartTime;
        if (dy > 60 && dt < 300) closeOverflow();
      }, { passive: true });
    }
  }

  // Sélecteur de thème — délégation (rail, bottomnav, et vue Paramètres rendue dynamiquement)
  // Même correctif (2026-08-25) : delegation pure via closest(), safe à
  // n'enregistrer qu'une fois pour toute la session.
  if (!window.__koraThemeClickBound) {
    window.__koraThemeClickBound = true;
    document.addEventListener("click", (e) => {
      const tb = e.target.closest("[data-theme-btn]");
      if (tb) { Store.setTheme(tb.dataset.themeBtn); return; }
    });
  }
  const tcyc = document.querySelector("[data-theme-cycle]");
  if (tcyc) tcyc.onclick = () => {
    const order = ["dark", "light", "cacao"];
    const cur = Store.getTheme();
    Store.setTheme(order[(order.indexOf(cur) + 1) % order.length]);
  };
  const fab = $("#fab"), menu = $("#fabMenu");
  if (fab) fab.onclick = () => { fab.classList.toggle("open"); menu.classList.toggle("open"); };
  $$(".fab-action", menu).forEach(a => a.onclick = () => {
    fab.classList.remove("open"); menu.classList.remove("open");
    // La génération est prioritaire : on bascule toujours sur le Tableau de bord
    // (vue de génération) et on y reste, peu importe l'écran d'origine.
    if (a.dataset.act === "cycle") { navigate("dashboard"); Store.startCycle(); }
  });
  const sc = $("#sheetScrim"); if (sc) sc.onclick = () => Store.closeSheet();
  // Bug corrigé (2026-08-25, audit mobile réel -- même classe de bug) : ces
  // trois listeners (clic-dehors, Escape, popstate) n'avaient pas de
  // garde-fou et s'empilaient à chaque render() -- popstate en particulier
  // aurait rejoué Store.setRoute()/setFactFilter() une fois PAR RENDER
  // écoulé pour un seul retour navigateur (redondant mais surtout un
  // gaspillage de rechargements ; risque de comportement erratique si l'un
  // de ces appels devient un jour non-idempotent).
  if (!window.__koraSheetGlobalBound) {
    window.__koraSheetGlobalBound = true;
    // Clic-dehors (point 2) : clic dans N'IMPORTE QUEL périmètre HORS du conteneur interne ferme.
    // Capture phase pour s'exécuter avant les handlers de boutons ; on exclut tout clic DANS #sheet.
    document.addEventListener("click", (e) => {
      if (!Store.state.sheet) return;
      if (e.target.closest && e.target.closest("#sheet")) return; // clic dans le conteneur -> ne ferme pas
      Store.closeSheet();
    }, true);
    // Fermeture au clavier (Escape) en complément du clic-dehors
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && Store.state.sheet) Store.closeSheet(); });
    window.addEventListener("popstate", (e) => {
      // F1 : le filtre Articles suit lui aussi le bouton retour/avant du
      // navigateur, pas seulement la route.
      const route = (e.state && e.state.route) || (() => {
        const seg = location.pathname.replace(/^\/kora-v2\/?/, "").split("/")[0];
        return seg ? (SLUG_ROUTES[seg] || "dashboard") : "dashboard";
      })();
      if (route === "facts") {
        const qf = new URLSearchParams(location.search).get("filtre");
        Store.setFactFilter(qf || "all");
      }
      Store.setRoute(route);
    });
  }
  // Amorce l'historique : attache un état à l'entrée d'historique courante
  // pour que le bouton "retour" du navigateur (mobile) puisse revenir en
  // arrière. IMPORTANT (2026-08-20, bug corrigé) : bind() s'exécute AVANT
  // boot() (voir main.js) -- Store.state.route vaut encore sa valeur par
  // défaut ("dashboard") à ce stade, la vraie route n'est déterminée par
  // boot() qu'ensuite depuis l'URL. Réécrire l'URL ICI avec routeToPath()
  // écrasait donc systématiquement une navigation directe (ex.
  // /kora-v2/articles) par "/kora-v2/" avant même que boot() ne s'exécute.
  // On garde location.href tel quel : seul l'état est posé, boot() se
  // charge de la route réelle depuis l'URL affichée par le navigateur.
  try { history.replaceState({ route: Store.state.route }, "", location.href); } catch (e) {}

  // =========================================================
  // DASHBOARD — Delegated event binding (dynamic components)
  // =========================================================
  function bindDashboardEvents() {
    // StatCard clicks -> navigation / filter
    document.addEventListener("click", (e) => {
      const card = e.target.closest("[data-action^='nav-']");
      if (!card) return;
      const action = card.dataset.action;
      // B1/B2 (audit UX Cockpit, 2026-08-24) : facts.js compare le filtre en
      // minuscules à des clés fixes ("pending"/"rejected"/"drafts"/"trash"),
      // pas aux valeurs de statut backend en MAJUSCULES ("PENDING_REVIEW",
      // "EDITED"...) — passées ici jusqu'ici, elles ne matchaient jamais
      // aucun onglet, la vue retombait silencieusement sur "Tous" sans
      // qu'aucune tuile ne semble en tenir compte. "Publiés" en particulier
      // ne peut structurellement plus vivre dans facts.js (les TRANSMITTED
      // en sont exclus depuis ADR-0005) : la tuile route désormais vers la
      // page dédiée "published" plutôt que vers "facts" avec un filtre mort.
      if (action === "nav-facts-all") { Store.setFactFilter("all"); navigate("facts"); }
      else if (action === "nav-facts-approved") { navigate("published"); }
      else if (action === "nav-facts-rejected") { Store.setFactFilter("rejected"); navigate("facts"); }
      // "nav-pending" (2026-08-25, audit de nommage : s'appelait "nav-hitl" --
      // jargon dev "human-in-the-loop" qui avait fuité jusque dans une
      // chaîne d'action, aucun rapport avec le métier) : ouvre la liste
      // filtrée sur les articles à approuver.
      else if (action === "nav-pending") { Store.setFactFilter("pending"); navigate("facts"); }
      else if (action === "nav-drafts") { Store.setFactFilter("drafts"); navigate("facts"); }
      else if (action === "nav-trash") { navigate("trash"); }
      else if (action === "nav-deleted") { navigate("audit"); }
    });

    // Graphique d'évolution : toggle de série via la légende
    document.addEventListener("click", (e) => {
      const leg = e.target.closest("[data-toggle]");
      if (!leg) return;
      const key = leg.dataset.toggle;
      const svg = leg.closest(".ev-chart")?.querySelector(".ev-svg");
      if (!svg) return;
      const hidden = svg.classList.toggle("ev-hide-" + key);
      leg.classList.toggle("off", hidden);
    });

    // Graphique d'évolution : tooltip au survol d'un point
    document.addEventListener("mouseover", (e) => {
      const dot = e.target.closest(".ev-dot");
      if (!dot) return;
      const tip = document.getElementById("evTooltip");
      if (!tip) return;
      tip.innerHTML = `<strong>${dot.dataset.date}</strong><br>${dot.dataset.vals}`;
      tip.hidden = false;
      const plot = dot.closest(".ev-plot");
      if (plot) {
        const r = plot.getBoundingClientRect();
        const dr = dot.getBoundingClientRect();
        tip.style.left = (dr.left - r.left + 12) + "px";
        tip.style.top = (dr.top - r.top - 8) + "px";
      }
    });
    document.addEventListener("mouseout", (e) => {
      if (e.target.closest(".ev-dot")) {
        const tip = document.getElementById("evTooltip");
        if (tip) tip.hidden = true;
      }
    });

    // SourceChip clicks -> open the Sources page (demande : bulle directement reliée à la page Sources)
    document.addEventListener("click", (e) => {
      const chip = e.target.closest(".source-chip[data-source-id]");
      if (!chip) return;
      navigate("sources");
    });

    // Refresh button
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-action='refresh']")) {
        Store.loadAll();
      }
    });

    // Cycle Normal
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-action='cycle-normal']")) {
        if (Store.state.lastCycle?.running) return;
        Store.startCycle({ force: false });
      }
    });

    // Cycle Force (with confirm)
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-action='cycle-force']")) {
        if (Store.state.lastCycle?.running) return;
        confirmAction({
          title: "Lancer un cycle forcé ?",
          message: "La fenêtre de fraîcheur de 24h sera ignorée pour cette collecte. Restent exclus dans tous les cas : dates absentes ou incohérentes, et informations d'une année révolue.",
          confirmLabel: "Lancer",
          danger: false,
          onConfirm: () => Store.startCycle({ force: true }),
        });
      }
    });

    // Audit all link
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-action='audit-all']")) {
        navigate("audit");
      }
    });
  }

  // Call dashboard binding. Bug corrigé (2026-08-25, audit mobile réel --
  // même classe de bug) : bindDashboardEvents() enregistre 8 listeners
  // document (click x6, mouseover, mouseout), tous en délégation pure
  // (e.target.closest / getElementById au moment de l'événement, aucune
  // fermeture sur un élément propre à ce render) -- s'empilaient eux aussi
  // à chaque render(), même hors de la page Dashboard (bind() ne filtre
  // pas par route).
  if (!window.__koraDashboardEventsBound) {
    window.__koraDashboardEventsBound = true;
    bindDashboardEvents();
  }

  // NOTE: tout le chargement initial (settings, health, auth, routing, auto-refresh)
  // est fait UNE FOIS dans boot() (appelé par main.js), PAS ici. Sinon bind()
  // (exécuté à chaque render) relancerait des setState -> render -> bind = boucle.
}

function boot() {
  // Reprise optimiste (2026-08-19, bug rapporté : retour d'un onglet resté
  // longtemps en arrière-plan -> la page, rechargée entièrement par le
  // navigateur [Chrome décharge les onglets inactifs sous pression mémoire],
  // s'affichait un instant SANS l'écran de progression avant que
  // resumeCycleWatch() [aller-retour réseau] ne le rétablisse -- perçu comme
  // "revenu au tableau de bord puis reparti en génération", plusieurs fois de
  // suite sur un onglet qui se fait décharger à répétition). Lu de façon
  // SYNCHRONE, avant même que Store.state.route ne soit résolu ci-dessous :
  // si un cycle tournait avant ce rechargement, l'écran de progression
  // s'affiche PAR ANTICIPATION dès le tout premier rendu, sans attendre la
  // confirmation réseau. resumeCycleWatch() (plus bas) corrige ensuite si le
  // cycle s'est en réalité terminé entre-temps.
  if (Store.wasCycleActiveBeforeLoad()) {
    Store.state.ui.cycleBusy = true;
    Store.state.ui.busy = true;
    Store.state.ui.overlay = "Reconnexion au cycle en cours…";
  }
  // Detection des liens reset/invite (2026-08-20, URLs distinctes) : format
  // ACTUEL = /kora-v2/reinitialiser?token=X ou /kora-v2/invite?token=X.
  // Format LEGACY (?reset=X / ?invite=X sur la racine) gardé en repli pour
  // que les liens deja envoyes par email AVANT ce changement (valables
  // jusqu'a 72h/30min apres envoi) continuent de fonctionner.
  const qs = new URLSearchParams(location.search);
  const pathSeg0 = location.pathname.replace(/^\/kora-v2\/?/, "").split("/")[0];
  const resetToken = (pathSeg0 === "reinitialiser" ? qs.get("token") : null) || qs.get("reset");
  const inviteToken = (pathSeg0 === "invite" ? qs.get("token") : null) || qs.get("invite");
  Store.loadSettings().then(() => {
    if (resetToken) {
      renderAuth("reset", resetToken);
    } else if (inviteToken) {
      // Affichage immediat du formulaire (force=true : marque _authRendered
      // tout de suite, empeche le garde-fou generique de render() de le
      // remplacer par "login" pendant l'attente reseau ci-dessous -- bug
      // corrige 2026-08-20 : un premier render() intermediaire gagnait
      // sinon la course et affichait "login" a la place, avant meme que
      // checkAuth() n'ait eu le temps de repondre).
      renderAuth("invite", inviteToken, true);
      // 2026-08-20, demande explicite : si une session valide existe deja
      // sur ce navigateur (ex. l'admin teste son propre lien d'invitation
      // sans s'etre deconnecte), on met a niveau vers l'ecran "Deja connecte"
      // au lieu d'afficher "Creer un compte" sans explication -- voir viewInvite().
      Store.checkAuth().then((ok) => {
        if (ok) renderAuth("invite", inviteToken, true, Store.state.auth);
      });
    } else {
      Store.checkAuth().then((ok) => {
        if (!ok) { renderAuth("login"); return; }
        Store.loadAll();   // charge facts/health/sources dès la session validée
        // Bug corrigé (2026-08-22, rapporté : "F5 sur la page Vidéos
        // n'affiche plus aucune vidéo") : loadAll() ci-dessus ne couvre que
        // facts/health/sources/audit/stats -- SEULE la navigation SPA
        // (navigate(), plus bas) chargeait les vidéos, jamais un
        // rechargement complet de page. Le backend renvoyait pourtant bien
        // les 3 vidéos (vérifié directement) -- s.videos restait juste à []
        // (valeur initiale du Store) faute d'appel. Même logique que le
        // switch de navigate() : ne recharge QUE si la route au démarrage
        // en a besoin (pas de requête inutile sur les autres routes).
        if (Store.state.route === "videos") Store.loadVideos();
        // Reconnexion au cycle en cours côté serveur (2026-08-19) : un cycle
        // tourne dans un thread détaché, jamais affecté par un F5 — mais SANS
        // ceci, l'écran de progression ("Article X sur Y") disparaissait au
        // rechargement, donnant l'impression trompeuse que la génération avait
        // été interrompue alors qu'elle continuait réellement en arrière-plan.
        // Seul le bouton "Interrompre" doit pouvoir stopper un cycle.
        Store.resumeCycleWatch();
        // Même chose côté bandeau vidéo global (2026-08-21) : reconnecte le
        // suivi si une génération tourne déjà côté serveur (F5, ou lancée
        // depuis un autre onglet/appareil).
        Store.resumeVideoWatch();
        // Centre de notifications persistant (2026-08-22).
        Store.loadNotifications();
        // Corbeille (badge nav) : déplacé ici (2026-08-24, audit UX Articles
        // F4) depuis un appel inconditionnel plus bas dans boot(), qui se
        // déclenchait AVANT même que checkAuth() n'ait confirmé une session
        // valide -- 401 garanti sur /api/hitl/trash à chaque premier
        // chargement non authentifié (repéré en surveillant le réseau
        // pendant l'audit). Chargé ici uniquement une fois la session
        // confirmée, même bénéfice (badge peuplé sans naviguer sur la page
        // Corbeille), sans le 401 systématique.
        Store.loadTrash().catch(() => {});
        // Comptes/invitations : role deja connu ici (checkAuth resolu) -> pas
        // d'appel pour rien (403 systematique) pour lecteur/editeur.
        if (Store.state.auth && isAdvancedRole(Store.state.auth.role)) {
          Store.loadUsers().catch(() => {});
          Store.loadInvitations().catch(() => {});
        }
      });
    }
  });
  // Routing (2026-08-20, URLs distinctes) : la route se lit desormais depuis
  // le CHEMIN (/kora-v2/articles...), pas le fragment #hash -- ainsi un
  // refresh ramene sur la meme page ET l'URL est partageable/marque-page-able,
  // contrairement a un #hash invisible du serveur. Retro-compat : un ancien
  // lien en #hash (deja marque-page par un utilisateur avant ce changement)
  // est encore reconnu une fois, puis migre silencieusement vers la nouvelle
  // URL (replaceState) pour que le prochain partage/marque-page soit a jour.
  // _LEGACY_ROUTE_ALIASES (voir déclaration en portée module plus haut,
  // aussi consultée depuis navigate() -- un ANCIEN lien/marque-page en
  // #hash, ex. "#cockpit", datant d'avant le passage aux URLs par chemin
  // du 2026-08-20, était utilisé ICI tel quel comme route SANS passer par
  // SLUG_ROUTES ; sans alias, une clé de route renommée casse tout lien
  // legacy. Vérifié en conditions réelles (hasDashboard: false avant ce
  // correctif, corrigé).
  const legacyHash = (location.hash || "").replace(/^#/, "").trim();
  const legacyHashResolved = _LEGACY_ROUTE_ALIASES[legacyHash] || legacyHash;
  const r = legacyHashResolved || (pathSeg0 ? (SLUG_ROUTES[pathSeg0] || "dashboard") : "dashboard");
  if (Store.state.route !== r) Store.state.route = r;
  // F1 : filtre de la vue Articles lu depuis l'URL (?filtre=pending) au
  // premier chargement -- lien direct partageable/rechargeable.
  if (r === "facts") {
    const qf = new URLSearchParams(location.search).get("filtre");
    if (qf) Store.setFactFilter(qf);
  }
  if (legacyHash) {
    try { history.replaceState({ route: r }, "", routeToPath(r)); } catch (e) {}
  }
  Store.loadHealth();
  Store.loadSettings();
  // loadTrash/loadUsers/loadInvitations : voir le .then(checkAuth) ci-dessus,
  // appelés une fois la session confirmée (pas ici -> avant checkAuth(),
  // Store.state.auth n'est pas encore résolu et un appel non authentifié
  // provoquerait un 401 systématique inutile, cf. F4 audit UX Articles).
  Store.startAutoRefresh(30000);
}

// Affiche l'app (si session OK) et masque l'overlay
function showApp() {
  const overlay = document.getElementById("authOverlay");
  if (overlay) overlay.hidden = true;
  const app = document.getElementById("app");
  if (app) app.style.display = "";
}

// Masque le splash de boot statique (index.html) une fois l'app reellement
// montee. Appelé par render() des que l'auth est resolue (plus de pending),
// que ce soit l'app ou le formulaire de login -> aucun artefact au refresh.
function hideBootSplash() {
  const el = document.getElementById("bootSplash");
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

export const App = { render, snack, bind, boot, navigate, openFact, renderAuth, showApp };

export { render, navigate, openFact, showApp, openWpChoiceForFact };
