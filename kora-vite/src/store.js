/* ============================================================
  KORA — Store d'état unique + API (anti-coquille-vide)
  Module ES. BASE auto selon l'emplacement (/kora-v2 ou /).
  IMPORTANT : les appels API vont à la racine /api/... (pas /kora-v2/api)
  ============================================================ */
const BASE = "/kora-v2";  // nginx route /kora-v2/api -> backend Python (port 8766)

export const Store = (() => {
  const state = {
    route: "cockpit",
    ui: { loading: false, error: null, busy: false, overlay: null, theme: "dark", rail: "expanded", factFilter: "all" },
    health: null,
    lastCycle: null,
    facts: [],
    decisions: {},
    audit: [],
    auditFilter: { type: "all", q: "" },
    sources: [],
    sheet: null,
    trash: [],
    selection: {},        // { fact_id: true } — sélection multiple
    selectMode: false,    // mode sélection activé
    auth: { loggedIn: false, username: null, email: null, pending: true },
  };

  const subs = new Set();
  let _notifying = false;
  let _pendingPatch = null;
  let _reentry = 0;
  function setState(patch) {
    Object.assign(state, patch);
    if (_notifying) {
      // Anti-récursion : un subscriber (render) a déclenché setState pendant
      // la notification -> on fusionne dans _pendingPatch et on NOTIFIE APRÈS
      // (en microtask, hors pile), jamais en réentrance. Sinon boucle infinie.
      _pendingPatch = Object.assign(_pendingPatch || {}, patch);
      return;
    }
    _notifying = true;
    try {
      subs.forEach((fn) => fn(state));
    } finally {
      _notifying = false;
    }
    if (_pendingPatch && _reentry < 8) {
      const p = _pendingPatch; _pendingPatch = null;
      _reentry++;
      queueMicrotask(() => { _reentry--; setState(p); });
    } else if (_pendingPatch) {
      // Boucle suspectée : on abandonne le patch en attente pour ne pas figer.
      _pendingPatch = null;
    }
  }
  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

  async function api(path, opts) {
    const url = BASE + path;
    // Inject token if present (light auth) – token stored in localStorage under "kora-token"
    const token = (() => {
      try { return localStorage.getItem("kora-token"); } catch (e) { return null; }
    })();
    const headers = Object.assign({}, opts && opts.headers ? opts.headers : {});
    if (token) {
      // Prefer X-API-Token, fallback to Authorization Bearer
      headers["X-API-Token"] = token;
    }
    const fetchOpts = Object.assign({}, opts, { headers, credentials: "include" });
    // Timeout réseau : évite que le fetch reste en "pending" indéfiniment
    // (qui figeait le bouton "Connexion…" si le backend ne répond pas).
    const ctrl = new AbortController();
    const TIMEOUT_MS = (opts && opts.timeout) || 15000;
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    fetchOpts.signal = ctrl.signal;
    try {
      const res = await fetch(url, fetchOpts);
      clearTimeout(timer);
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        throw new Error("Réponse non-JSON du serveur (code " + res.status + ")");
      }
      return await res.json();
    } catch (e) {
      throw new Error(e.message || "Réseau indisponible");
    }
  }

  // ---- Auth ----
  let _checking = false;
  async function checkAuth() {
    if (_checking) return false; // idempotent : évite la boucle render->checkAuth->render
    _checking = true;
    // pending=true : la verification est en cours -> l'UI ne doit PAS afficher
    // le formulaire de login (evite le flash login au reload). On le masque
    // tant que l'issue n'est pas connue.
    setState({ auth: Object.assign({}, state.auth, { pending: true }) });
    try {
      const r = await api("/api/auth/me");
      if (r.ok) {
        const next = { loggedIn: true, username: r.username, email: r.email, role: r.role || "normal", pending: false, avatarData: r.avatar_data || null };
        // Ne pas notifier si identique (évite render->checkAuth->render)
        const a = state.auth || {};
        if (!a.loggedIn || a.username !== next.username || a.role !== next.role || a.avatarData !== next.avatarData) {
          setState({ auth: next });
        }
        return true;
      }
      console.warn("[auth] /api/auth/me a répondu ok=false", r);
    } catch (e) {
      console.warn("[auth] /api/auth/me a échoué, session conservée :", e.message);
      return false;
    } finally {
      _checking = false;
    }
    setState({ auth: { loggedIn: false, username: null, email: null, role: null, pending: false } });
    return false;
  }
  async function login(username, password) {
    const r = await api("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    if (!r.ok) {
      if (r.error === "invalid_credentials") throw new Error("Identifiants invalides");
      throw new Error("Erreur de connexion");
    }
    // 2FA (9.3) : mot de passe correct mais AUCUN cookie de session n'a été
    // posé par le backend tant que le code TOTP n'est pas vérifié (voir
    // verifyLoginTotp ci-dessous). On renvoie l'info telle quelle à l'appelant
    // (app.js bindAuth) plutôt que d'appeler checkAuth() ici — il n'y a pas
    // encore de session à vérifier.
    if (r.mfa_required) return { mfaRequired: true, mfaToken: r.mfa_token };
    // NE PAS setState loggedIn ici — attendre checkAuth()
    const ok = await checkAuth();   // valide la session côté serveur
    if (ok) await loadAll();        // charge facts/health/sources dès la connexion
    return { mfaRequired: false, ok };
  }
  async function verifyLoginTotp(mfaToken, code) {
    const r = await api("/api/auth/login/verify-2fa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mfa_token: mfaToken, code }) });
    if (!r.ok) {
      const messages = { mfa_expired: "Session de connexion expirée, recommence.", invalid_code: "Code invalide." };
      throw new Error(messages[r.error] || "Erreur de vérification");
    }
    const ok = await checkAuth();
    if (ok) await loadAll();
    return { ok, backupCodeUsed: !!r.backup_code_used, backupCodesLeft: r.backup_codes_left };
  }
  // ---- 2FA (9.3) : gestion depuis Paramètres > Compte (compte déjà connecté) ----
  async function get2FAStatus() {
    return api("/api/auth/2fa/status");
  }
  async function setup2FA() {
    const r = await api("/api/auth/2fa/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (!r.ok) throw new Error(r.error || "Erreur");
    return r; // { secret, otpauth_uri }
  }
  async function confirm2FA(code) {
    const r = await api("/api/auth/2fa/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    if (!r.ok) throw new Error(r.error === "invalid_code" ? "Code invalide" : (r.error || "Erreur"));
    return r; // { backup_codes: [...] }
  }
  async function disable2FA(password) {
    const r = await api("/api/auth/2fa/disable", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (!r.ok) throw new Error(r.error === "wrong_password" ? "Mot de passe incorrect" : (r.error || "Erreur"));
    return r;
  }
  async function logout() {
    // On ferme la session CÔTÉ UI IMMÉDIATEMENT (setState synchrone) pour ne
    // jamais bloquer l'UI sur la réponse du backend (le logout HTTP peut être
    // lent si la DB est sous tension). Le backend finit par supprimer la
    // session de toute façon ; l'UI ne doit pas attendre.
    setState({ auth: { loggedIn: false, username: null, email: null } });
    // Déconnexion serveur en arrière-plan, sans faire attendre l'UI.
    // Timeout court : si le backend ne répond pas vite, on ignore (la session
    // UI est déjà fermée et le cookie sera de toute façon ignoré côté serveur).
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 4000);
    fetch(BASE + "/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      signal: ctrl.signal,
    }).catch(() => {}).finally(() => clearTimeout(to));
  }
  async function changePassword(current, newp) {
    const r = await api("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current, new: newp }) });
    if (r.ok) return true;
    if (r.error === "wrong_current") throw new Error("Mot de passe actuel incorrect");
    if (r.error === "password_too_short") throw new Error("Le nouveau mot de passe doit faire au moins 8 caractères");
    throw new Error(r.error || "Erreur");
  }
  async function saveAvatar(dataUrl) {
    const r = await api("/api/auth/avatar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ avatar_data: dataUrl }) });
    if (r.ok) {
      setState({ auth: { ...state.auth, avatarData: dataUrl || null } });
      return true;
    }
    throw new Error(r.error === "avatar_invalide" ? "Image invalide (doit être une photo, < 256 Ko)" : (r.error || "Erreur"));
  }
  async function forgot(email) {
    const r = await api("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    return r.ok !== false;
  }
  async function resetPassword(token, newp) {
    const r = await api("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, new_password: newp }) });
    if (r.ok) return true;
    if (r.error === "token_expired") throw new Error("Lien expiré, redemandez une réinitialisation");
    if (r.error === "invalid_token") throw new Error("Lien invalide");
    if (r.error === "password_too_short") throw new Error("Le mot de passe doit faire au moins 8 caractères");
    throw new Error(r.error || "Erreur");
  }
  async function loadUsers() {
    const r = await api("/api/auth/users");
    if (r.users) { setState({ users: r.users }); return r.users; }
    return [];
  }
  async function createUser(username, email, password, role = "normal") {
    const r = await api("/api/auth/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, email, password, role }) });
    if (r.ok) return true;
    if (r.error === "username_exists") throw new Error("Cet identifiant existe déjà");
    if (r.error === "username_too_short") throw new Error("Identifiant trop court (3 min)");
    if (r.error === "password_too_short") throw new Error("Mot de passe 8 caractères minimum");
    if (r.error === "role_invalide") throw new Error("Rôle invalide");
    throw new Error(r.error || "Erreur");
  }
  async function setRole(id, role) {
    const r = await api("/api/auth/users/role", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, role }) });
    if (r.ok) return true;
    if (r.error === "role_invalide") throw new Error("Rôle invalide");
    throw new Error(r.error || "Erreur");
  }
  async function deleteUser(id) {
    const r = await api("/api/auth/users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (r.ok) return true;
    if (r.error === "cannot_delete_self") throw new Error("Vous ne pouvez pas supprimer votre propre compte");
    throw new Error(r.error || "Erreur");
  }

  async function loadHealth() {
    try { setState({ health: await api("/api/health") }); }
    catch (e) { setState({ ui: { ...state.ui, error: e.message } }); }
  }
  async function loadLast() {
    // NE PAS peupler facts ici : /api/last renvoie result.facts SANS fact_id,
    // ce qui casse le data-fact des cartes -> clic ne marche pas.
    // facts vient UNIQUEMENT de loadHITL (qui a les fact_id).
    try {
      const r = await api("/api/last");
      setState({ lastCycle: r });
    } catch (e) { setState({ ui: { ...state.ui, error: e.message } }); }
  }
  async function loadHITL() {
    setState({ ui: { ...state.ui, loading: true, error: null } });
    try {
      const r = await api("/api/hitl");
      const faits = Array.isArray(r) ? r : (r.facts || []);
      // s.decisions = statut réel de chaque fait (source unique de vérité pour
      // Brouillons / Transmis / Rejetés). Sans ça, viewDrafts filtre sur {} -> rien ne s'affiche.
      const decisions = Object.fromEntries(faits.map(f => [f.fact_id, f.status || "PENDING_REVIEW"]));
      const publishedCount = (r && !Array.isArray(r) && typeof r.published_count === "number") ? r.published_count : undefined;
      const rejectedCount = (r && !Array.isArray(r) && typeof r.rejected_count === "number") ? r.rejected_count : undefined;
      const deletedCount = (r && !Array.isArray(r) && typeof r.deleted_count === "number") ? r.deleted_count : undefined;
      setState({ facts: faits, decisions, publishedCount, rejectedCount, deletedCount, ui: { ...state.ui, loading: false } });
      // B+C : forcer un 2e rendu après chargement complet. Le DOM doit refléter le
      // store stabilisé (80 facts, dont 3 EDITED -> Brouillons), pas un batch partiel
      // peint trop tôt (où les EDITED sont encore vus comme PENDING_REVIEW).
      setTimeout(() => { try { Store.setState({ ui: { ...Store.state.ui, _bcTick: Date.now() } }); } catch (_) {} }, 80);
    } catch (e) { setState({ facts: [], ui: { ...state.ui, loading: false, error: e.message } }); }
  }
  async function loadAudit() {
    try { setState({ audit: await api("/api/audit") }); }
    catch (e) { setState({ ui: { ...state.ui, error: e.message } }); }
  }
  async function loadSources() {
    try { setState({ sources: await api("/api/whitelist") }); }
    catch (e) { setState({ ui: { ...state.ui, error: e.message } }); }
  }
  // Gouvernance des sources ouverte à l'UI (2026-08-19, advanced uniquement
  // côté backend — voir permissions.py "gerer_sources"). addSource lève en
  // cas d'échec (id dupliqué, champs manquants) : à catcher par l'appelant.
  async function addSource(data) {
    const r = await api("/api/whitelist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    // api() ne lève pas sur un 4xx tant que le corps est du JSON valide -> il
    // faut vérifier explicitement le champ error renvoyé par le backend.
    if (r && r.error) throw new Error(r.error);
    await loadSources();
    return r;
  }
  async function updateSource(id, patch) {
    const r = await api("/api/whitelist/" + encodeURIComponent(id), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    if (r && r.error) throw new Error(r.error);
    await loadSources();
    return r;
  }
  async function loadSettings() {
    try { const s = await api("/api/settings"); applySettings(s); setState({ settings: s }); }
    catch (e) { /* settings optionnel */ }
  }
  function applySettings(s) {
    if (!s) return;
    setState({ app_name: s.app_name || state.app_name, settings: Object.assign({}, state.settings, s) });
    const root = document.documentElement;
    if (s.accent_coral) root.style.setProperty("--coral", s.accent_coral);
    if (s.accent_bordeaux) root.style.setProperty("--bordeaux", s.accent_bordeaux);
    // applique aussi les dérivés utilisés par le gradient/ombre
    if (s.accent_coral) root.style.setProperty("--coral-strong", shade(s.accent_coral, -0.12));
    // nom + logo dans le shell
    const nameEl = document.querySelector(".brand-name");
    const subEl = document.querySelector(".brand-sub");
    const markEl = document.querySelector(".brand-mark");
    if (nameEl && s.app_name) {
      const parts = s.app_name.split(/\s+(.+)/); // "KORA Agent" -> ["KORA","Agent"]
      nameEl.textContent = parts[0] || s.app_name;
      if (subEl) subEl.textContent = parts[1] || "";
    }
    if (markEl) {
      // BUG CORRIGÉ (critique design 2026-08-16) : les deux branches ci-dessous
      // réécrivaient .brand-name/.brand-sub avec un texte dérivé (ou carrément
      // codé en dur : "Agent") EN PLUS du bloc juste au-dessus qui le fait déjà
      // correctement à partir de s.app_name — la 2e écriture, plus tardive,
      // gagnait toujours et effaçait silencieusement toute mise à jour du nom/
      // sous-titre (ex. changer app_name en "KORA Veille Guinée" restait sans
      // effet visible, réécrasé par le "Agent" figé ici). Ce bloc ne touche
      // plus QUE l'icône/logo, jamais le texte — déjà géré plus haut, une
      // seule fois.
      const fav = s.favicon_data || s.logo_data;
      if (fav) {
        markEl.style.display = "";
        markEl.innerHTML = `<img src="${fav}" alt="" class="brand-fav-img">`;
        // favicon de l'onglet navigateur = icone kora seule
        try {
          let l = document.querySelector('link[rel="icon"]');
          if (!l) { l = document.createElement("link"); l.rel = "icon"; document.head.appendChild(l); }
          l.href = fav;
        } catch (e) {}
      } else {
        markEl.style.display = "";
        markEl.innerHTML = `<svg class="ic"><use href="#i-spark"/></svg>`;
      }
    }
    // Libellés d'interface (white-label) : navitems par data-route + tagline
    const routeMap = { cockpit: s.label_cockpit, facts: s.label_facts, sources: s.label_sources, drafts: s.label_drafts, audit: s.label_audit };
    Object.keys(routeMap).forEach(route => {
      const lbl = routeMap[route];
      if (!lbl) return;
      document.querySelectorAll(`.navitem[data-route="${route}"] span`).forEach(sp => { sp.textContent = lbl; });
    });
    if (s.app_tagline) {
      const tl = document.querySelector(".about-tagline");
      if (tl) tl.textContent = s.app_tagline;
    }
  }
  function shade(hex, pct) {
    const m = /^#?([0-9A-Fa-f]{6})$/.exec(hex || "");
    if (!m) return hex;
    let n = parseInt(m[1], 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (c) => Math.max(0, Math.min(255, Math.round(c + 255 * pct)));
    return "#" + ((1 << 24) + (f(r) << 16) + (f(g) << 8) + f(b)).toString(16).slice(1).toUpperCase();
  }
  // demand : nb d'articles max explicitement voulu (optionnel — par défaut,
  // le backend génère TOUS les faits frais et uniques du cycle, voir
  // LOGIQUE-METIER-REACH.md §7). force : ignore la fenêtre 24h.
  // Signature objet (et non positionnelle) pour éviter les appels ambigus.
  async function startCycle({ demand, force = false } = {}) {
    setState({ ui: { ...state.ui, busy: true, overlay: force ? "Génération forcée (hors fenêtre 24h)…" : "Collecte des sources whitelist…", progress: null } });
    try {
      await api("/api/cycle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ demand, force }) });
      for (let i = 0; i < 120; i++) {
        await wait(3000);
        const r = await api("/api/last");
        const p = r.progress || null;
        setState({ lastCycle: r, ui: { ...state.ui, busy: true, progress: p } });
        if (!r.running && r.result) {
          // Recharge depuis l'API HITL (facts avec fact_id valide) plutôt que
          // r.result.facts (sans fact_id) -> sinon le clic carte casse.
          await loadHITL();
          setState({ lastCycle: r, ui: { ...state.ui, busy: false, overlay: null, progress: null } });
          return;
        }
        const label = p && p.total > 0
          ? `Article ${p.current || 1} sur ${p.total}…`
          : "Cycle en cours… (" + i * 3 + "s)";
        setState({ ui: { ...state.ui, overlay: label, progress: p } });
      }
      setState({ ui: { ...state.ui, busy: false, overlay: null, progress: null } });
    } catch (e) { setState({ ui: { ...state.ui, busy: false, overlay: null, progress: null, error: e.message } }); }
  }
  async function seed() {
    // Le backend n'expose pas /api/seed_demo ; on lance un cycle de démo
    // (force=true ignore la fenêtre 24h) qui peuplera les facts.
    await startCycle({ force: true });
  }
  // Interruption d'un cycle en cours (wireframe 3.3). Coopérative côté backend
  // (/api/cycle/cancel — reach_agent.cancel_cycle()) : l'arrêt survient après
  // l'article en cours, pas instantanément. La boucle de poll de startCycle()
  // continue de tourner normalement, elle verra running=false dès que le
  // backend aura effectivement arrêté.
  async function cancelCycle() {
    try {
      await api("/api/cycle/cancel", { method: "POST" });
      setState({ ui: { ...state.ui, overlay: "Interruption demandée — arrêt après l'article en cours…" } });
    } catch (e) { setState({ ui: { ...state.ui, error: e.message } }); }
  }
  async function decide(factId, decision, editedText = "") {
    setState({ ui: { ...state.ui, busy: true, overlay: "Enregistrement…" } });
    try {
      const r = await api("/api/hitl/decide", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact_id: factId, decision, edited_text: editedText, decided_by: "chef_de_secteur" })
      });
      if (r.error) throw new Error(r.error);
      // Rafraîchit facts + corbeille + stats (SSOT) pour refléter la décision immédiatement
      // (sinon l'article semble "ne rien faire" à l'écran et les cartes restent figées).
      await loadHITL();
      try { await loadTrash(); } catch (_) {}
      try { await loadStats(); } catch (_) {}
      setState({ ui: { ...state.ui, busy: false, overlay: null } });
    } catch (e) { setState({ ui: { ...state.ui, busy: false, overlay: null, error: e.message } }); }
  }

  async function retract(factId) {
    if (!window.confirm("Annuler cette décision ? L'article repassera en attente de validation.")) return;
    setState({ ui: { ...state.ui, busy: true, overlay: "Annulation de la décision…" } });
    try {
      const r = await api("/api/hitl/retract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fact_id: factId }) });
      if (r.error) throw new Error(r.error);
      await loadHITL();
      try { await loadStats(); } catch (_) {}
      setState({ ui: { ...state.ui, busy: false, overlay: null } });
    } catch (e) { setState({ ui: { ...state.ui, busy: false, overlay: null, error: e.message } }); }
  }
  function setRoute(r) { setState({ route: r }); }
  function openSheet(s) { setState({ sheet: s }); }
  function closeSheet() { setState({ sheet: null }); }

  // Centre de notifications (10.2) : DÉLIBÉRÉMENT PAS dans le Store réactif.
  // Voir app.js (_notifications, addNotif) — un setState ici déclencherait un
  // re-render complet à chaque snack(), qui referme tout tiroir ouvert
  // ailleurs dans l'app (bug constaté : sauvegarde d'avatar refermant le
  // panneau Paramètres > Compte qu'elle venait elle-même de rouvrir).
  // ---- Guide utilisateur / onboarding contextuel (11.1-11.3) ----
  // Préférence client-only (localStorage), même convention que kora-theme /
  // kora-rail-mode — pas de backend, c'est un réglage de confort d'affichage.
  function getGuidesEnabled() {
    try { const v = localStorage.getItem("kora-guides-enabled"); return v === null ? true : v === "1"; }
    catch (e) { return true; }
  }
  function setGuidesEnabled(on) {
    try { localStorage.setItem("kora-guides-enabled", on ? "1" : "0"); } catch (e) {}
  }
  function hasSeenTour() {
    try { return localStorage.getItem("kora-tour-seen") === "1"; } catch (e) { return false; }
  }
  function markTourSeen() {
    try { localStorage.setItem("kora-tour-seen", "1"); } catch (e) {}
  }
  function getFactFilter() { return state.ui.factFilter || "all"; }
  function setFactFilter(f) { setState({ ui: { ...state.ui, factFilter: f } }); }
  function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // ---- Thème (dark par défaut, + light cassé & cacao color) ----
  const THEMES = ["dark", "light", "cacao"];
  function getTheme() { return state.ui.theme || "dark"; }
  function applyTheme(t) {
    const root = document.documentElement;
    if (root) root.setAttribute("data-theme", t);
  }
  function setTheme(t) {
    if (!THEMES.includes(t)) t = "dark";
    try { localStorage.setItem("kora-theme", t); } catch (e) {}
    applyTheme(t);
    setState({ ui: { ...state.ui, theme: t } });
  }
  function initTheme() {
    // KORA = neumorphisme SOMBRE par défaut (charte imposée). On ignore
    // prefers-color-scheme pour éviter d'afficher le thème clair cassé.
    let t = "dark";
    try {
      t = localStorage.getItem("kora-theme") || "dark";
      // Migration one-shot : un reglage 'light' résiduel (ancien auto-detect
      // via prefers-color-scheme) est remis en dark. Un choix 'light' EXPLICITE
      // via l'UI (setTheme) reste respecté car applyTheme le rejoue.
      if (t === "light") { localStorage.setItem("kora-theme", "dark"); t = "dark"; }
    } catch (e) {}
    if (!THEMES.includes(t)) t = "dark";
    applyTheme(t);
    return t;
  }

  // ---- Rail adaptive (M3) : mode = auto | collapsed | expanded ----
  // Le rail est une colonne fixe dès 768px (RAIL_FIXED_MIN) ; en dessous
  // c'est un tiroir coulissant (.rail.open), un tout autre système d'affichage
  // auquel data-rail ne s'applique pas.
  // "auto" résout vers une valeur EXPLICITE selon le palier (compact sur
  // tablette, large sur desktop dès RAIL_DESKTOP_MIN) — jamais d'attribut
  // absent au-delà de 768px. Avant ce correctif, "auto" laissait l'attribut
  // absent sur toute la plage 768-1023px : le CSS de masquage/centrage
  // "collapsed" (voir bloc RÉFONTE RAIL v2 dans style.css) ne se déclenchait
  // alors JAMAIS, et le rail affichait par défaut des icônes orphelines avec
  // des libellés non masqués (juste écrasés à 0px de large par le flexbox) —
  // bug constaté en vérifiant en preview live (revue sidebar desktop/tablette).
  const RAIL_MODES = ["auto", "collapsed", "expanded"];
  const RAIL_FIXED_MIN = 768;   // en dessous : tiroir coulissant, pas de data-rail
  const RAIL_DESKTOP_MIN = 1024; // palier où "auto" bascule vers "expanded"
  function getRailMode() { return state.ui.railMode || "auto"; }
  function applyRailMode(m) {
    const root = document.documentElement;
    const w = window.innerWidth || document.documentElement.clientWidth || 0;
    if (w < RAIL_FIXED_MIN) {
      // Tiroir mobile : le rail n'est pas une colonne fixe, data-rail n'a pas de sens ici.
      root.removeAttribute("data-rail");
      return;
    }
    const effective = (m === "auto") ? (w < RAIL_DESKTOP_MIN ? "collapsed" : "expanded") : m;
    root.setAttribute("data-rail", effective);
  }
  function setRailMode(m) {
    if (!RAIL_MODES.includes(m)) m = "auto";
    try { localStorage.setItem("kora-rail-mode", m); } catch (e) {}
    applyRailMode(m);
    setState({ ui: { ...state.ui, railMode: m } });
  }
  let _railResizeBound = false;
  function initRailMode() {
    let m = "auto";
    try { m = localStorage.getItem("kora-rail-mode") || "auto"; } catch (e) {}
    if (!RAIL_MODES.includes(m)) m = "auto";
    applyRailMode(m);
    // Recalcule au franchissement d'un palier (redimensionnement fenêtre desktop,
    // rotation tablette) — sans ça, data-rail restait figé sur la valeur calculée
    // au chargement même après un resize traversant 768px/1024px.
    if (!_railResizeBound) {
      _railResizeBound = true;
      let t = null;
      window.addEventListener("resize", () => {
        clearTimeout(t);
        t = setTimeout(() => applyRailMode(getRailMode()), 150);
      });
    }
    return m;
  }
  // Alias rétro-compat (ancien UI pré-M3 : app.js utilise getRail/setRail pour
  // le bouton replier/déplier). IMPORTANT : reflète la valeur EFFECTIVEMENT
  // affichée (résolution de "auto" selon le palier actuel), pas le mode brut —
  // sinon un premier clic en mode "auto" sur tablette semblait ne rien faire
  // (le rail était déjà visuellement compact) puis "repliait" un rail déjà
  // replié au lieu de proposer l'agrandissement (bug constaté en preview live).
  function getRail() {
    const m = getRailMode();
    if (m !== "auto") return m;
    const w = window.innerWidth || document.documentElement.clientWidth || 0;
    return w < RAIL_DESKTOP_MIN ? "collapsed" : "expanded";
  }
  function setRail(r) { setRailMode(r === "collapsed" ? "collapsed" : "expanded"); }

  // ---- Sélection multiple + actions en masse ----
  function setSelectMode(on) {
    setState({ selectMode: !!on, selection: on ? state.selection : {} });
  }
  function toggleSelect(factId) {
    const sel = { ...state.selection };
    if (sel[factId]) delete sel[factId]; else sel[factId] = true;
    setState({ selection: sel });
  }
  function clearSelection() {
    setState({ selection: {}, selectMode: false });
  }
  function selectedIds() { return Object.keys(state.selection); }

  async function bulkAction(action, opts = {}) {
    const ids = selectedIds();
    if (!ids.length) return { ok: true, done: 0, total: 0 };
    setState({ ui: { ...state.ui, busy: true, overlay: "Action en masse…" } });
    try {
      const body = { ids, action, wp_status: opts.wp_status || "publish" };
      const r = await api("/api/hitl/bulk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.error) throw new Error(r.error);
      await loadHITL();
      try { await loadStats(); } catch (_) {}
      setState({ selection: {}, selectMode: false, ui: { ...state.ui, busy: false, overlay: null } });
      return r;
    } catch (e) {
      setState({ ui: { ...state.ui, busy: false, overlay: null, error: e.message } });
      throw e;
    }
  }

  async function restoreFact(factId) {
    setState({ ui: { ...state.ui, busy: true, overlay: "Restauration…" } });
    try {
      const r = await api("/api/hitl/trash/restore", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact_id: factId }),
      });
      if (r.error) throw new Error(r.error);
      await loadTrash();
      await loadHITL();
      try { await loadStats(); } catch (_) {}
      setState({ ui: { ...state.ui, busy: false, overlay: null } });
      return r;
    } catch (e) {
      setState({ ui: { ...state.ui, busy: false, overlay: null, error: e.message } });
      throw e;
    }
  }

  async function deleteForever(ids) {
    setState({ ui: { ...state.ui, busy: true, overlay: "Suppression définitive…" } });
    try {
      const r = await api("/api/hitl/delete", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (r.error) throw new Error(r.error);
      // Disparition IMMEDIATE : on retire les ids de l'etat local AVANT le rechargement
      // (le backend a deja purge). Ferme aussi tout tiroir ouvert pour eviter
      // d'afficher un article devenu fantome.
      const set = new Set(ids);
      const curFacts = (state.facts || []).filter(f => !set.has(f.fact_id));
      const curTrash = (state.trash || []).filter(f => !set.has(f.fact_id));
      closeSheet();
      setState({ facts: curFacts, trash: curTrash });
      await loadTrash();
      await loadHITL();
      try { await loadStats(); } catch (_) {}
      setState({ ui: { ...state.ui, busy: false, overlay: null } });
      return r;
    } catch (e) {
      setState({ ui: { ...state.ui, busy: false, overlay: null, error: e.message } });
      throw e;
    }
  }

  // Ramener un brouillon "à la normale" (en attente de validation) SANS publier.
  async function finishDraft(factId) {
    setState({ ui: { ...state.ui, busy: true, overlay: "Remise en attente…" } });
    try {
      const r = await api("/api/hitl/decide", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact_id: factId, decision: "PENDING_REVIEW", decided_by: "chef_de_secteur" })
      });
      if (r.error) throw new Error(r.error);
      await loadHITL();
      try { await loadStats(); } catch (_) {}
      setState({ ui: { ...state.ui, busy: false, overlay: null } });
      return r;
    } catch (e) {
      setState({ ui: { ...state.ui, busy: false, overlay: null, error: e.message } });
      throw e;
    }
  }

  async function loadTrash() {
    const r = await api("/api/hitl/trash");
    if (!r.error && r.items) setState({ trash: r.items });
    return r;
  }

  async function loadStats() {
    // SSOT : rafraîchit les compteurs certifiés après toute mutation
    // (sinon les cartes du dashboard restent figées jusqu'au prochain reload).
    try { const st = await api("/api/stats"); if (st && !st.error) setState({ stats: st }); }
    catch (_) {}
  }

  // ============================================================
  // COCKPIT — Agrégation multi-API + Auto-refresh
  // ============================================================
  async function loadAll() {
    // Charge tout en parallèle pour le cockpit
    try {
      setState({ ui: { ...state.ui, loading: true, error: null } });
      const [health, audit, hitl, sources, stats] = await Promise.allSettled([
        api("/api/health"),
        api("/api/audit"),
        api("/api/hitl"),
        api("/api/whitelist"),
        api("/api/stats"),
      ]);
      const h = health.status === "fulfilled" ? health.value : null;
      const a = audit.status === "fulfilled" ? audit.value : { days: [], total: 0 };
      // /api/hitl renvoie {facts, published_count} (depuis 2026-08-14).
      // Extractible pour rester compatible si un jour l'API renvoie un tableau.
      const _hitl = hitl.status === "fulfilled" ? hitl.value : [];
      const f = Array.isArray(_hitl) ? _hitl : (_hitl.facts || []);
      const s = sources.status === "fulfilled" ? sources.value : [];
      const st = stats.status === "fulfilled" ? stats.value : null;
      
      // decisions map pour filtres (source unique de vérité)
      const decisions = Object.fromEntries((f || []).map(fact => [fact.fact_id, fact.status || "PENDING_REVIEW"]));
      
      setState({ 
        health: h, 
        audit: a, 
        facts: f, 
        decisions, 
        sources: s,
        stats: st,
        ui: { ...state.ui, loading: false, lastRefresh: Date.now() } }
      );
    } catch (e) {
      setState({ ui: { ...state.ui, loading: false, error: e.message } });
    }
  }

  let _refreshTimer = null;
  function startAutoRefresh(intervalMs = 30000) {
    stopAutoRefresh();
    _refreshTimer = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadAll();
      }
    }, intervalMs);
    // Recharge aussi quand l'onglet redevient visible
    document.addEventListener("visibilitychange", _onVisibilityChange);
  }
  function stopAutoRefresh() {
    if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
    document.removeEventListener("visibilitychange", _onVisibilityChange);
  }
  function _onVisibilityChange() {
    if (document.visibilityState === "visible") loadAll();
  }

  // Régénère UN article depuis les infos déjà acquises (aucun re-scrape).
  // suggestion = id d'angle parmi /api/regen-suggestions, ou null (neutre).
  async function regenerate(fact_id, suggestion) {
    setState({ ui: { ...state.ui, busy: true, error: null } });
    try {
      const r = await api("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact_id, suggestion: suggestion || null }),
        timeout: 120000,
      });
      if (r.error) throw new Error(r.error);
      return r;  // { fact_id, article, model, status, suggestion_applied, angle }
    } catch (e) {
      setState({ ui: { ...state.ui, error: e.message } });
      throw e;
    } finally {
      setState({ ui: { ...state.ui, busy: false } });
    }
  }

  return {
    state, setState, subscribe, api,
    loadHealth, loadLast, loadHITL, loadAudit, loadSources, addSource, updateSource, loadSettings, applySettings,
    startCycle, cancelCycle, seed, decide, retract, setRoute, openSheet, closeSheet, wait,
    getFactFilter, setFactFilter,
    getTheme, setTheme, initTheme,
    getRailMode, setRailMode, initRailMode, applyRailMode,
    // alias rétro-compat (certains appels utilisent initRail)
    initRail: initRailMode,
    getRail, setRail,
    checkAuth, login, logout, changePassword, saveAvatar, forgot, resetPassword,
    verifyLoginTotp, get2FAStatus, setup2FA, confirm2FA, disable2FA,
    loadUsers, createUser, setRole, deleteUser,
    setSelectMode, toggleSelect, clearSelection, selectedIds,
    bulkAction, restoreFact, deleteForever, loadTrash, finishDraft,
    regenerate,
    getGuidesEnabled, setGuidesEnabled, hasSeenTour, markTourSeen,
    // Cockpit
    loadAll, startAutoRefresh, stopAutoRefresh
  };
})();
