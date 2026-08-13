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
    auth: { loggedIn: false, username: null, email: null },
  };

  const subs = new Set();
  function setState(patch) {
    Object.assign(state, patch);
    subs.forEach((fn) => fn(state));
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
    try {
      const res = await fetch(url, fetchOpts);
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
  async function checkAuth() {
    try {
      const r = await api("/api/auth/me");
      if (r.ok) {
        setState({ auth: { loggedIn: true, username: r.username, email: r.email, role: r.role || "normal" } });
        return true;
      }
      // r.ok === false (ex: 401) → session invalide côté serveur
      console.warn("[auth] /api/auth/me a répondu ok=false", r);
    } catch (e) {
      // Erreur réseau / CORS / cookie pas encore prêt → on NE logout PAS silencieusement
      // On loggue et on garde l'état actuel (le login vient de réussir)
      console.warn("[auth] /api/auth/me a échoué, session conservée :", e.message);
      return false; // ne pas toucher à state.auth
    }
    // Si on arrive ici, c'est que r.ok === false → session invalide
    setState({ auth: { loggedIn: false, username: null, email: null, role: null } });
    return false;
  }
  async function login(username, password) {
    const r = await api("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    if (!r.ok) {
      if (r.error === "invalid_credentials") throw new Error("Identifiants invalides");
      throw new Error("Erreur de connexion");
    }
    // NE PAS setState loggedIn ici — attendre checkAuth()
    const ok = await checkAuth();   // valide la session côté serveur
    return ok;
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
      const faits = await api("/api/hitl");
      // s.decisions = statut réel de chaque fait (source unique de vérité pour
      // Brouillons / Transmis / Rejetés). Sans ça, viewDrafts filtre sur {} -> rien ne s'affiche.
      const decisions = Object.fromEntries((faits || []).map(f => [f.fact_id, f.status || "PENDING_REVIEW"]));
      setState({ facts: faits, decisions, ui: { ...state.ui, loading: false } });
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
      const fav = s.favicon_data || s.logo_data;
      if (fav) {
        markEl.style.display = "";
        markEl.innerHTML = `<img src="${fav}" alt="" class="brand-fav-img">`;
        // .brand-name reste le TEXTE du nom (pas le logo complet) -> evite la
        // duplication du logo dans le header sur mobile (icone + logo complet).
        const nm = document.querySelector(".brand-name");
        const sb = document.querySelector(".brand-sub");
        if (nm) nm.textContent = (s.app_name || "KORA").split(" ")[0];
        if (sb) sb.textContent = (s.app_name || "KORA").split(" ").slice(1).join(" ");
        // favicon de l'onglet navigateur = icone kora seule
        try {
          let l = document.querySelector('link[rel="icon"]');
          if (!l) { l = document.createElement("link"); l.rel = "icon"; document.head.appendChild(l); }
          l.href = fav;
        } catch (e) {}
      } else {
        markEl.style.display = "";
        markEl.innerHTML = `<svg class="ic"><use href="#i-spark"/></svg>`;
        const nm = document.querySelector(".brand-name"); if (nm) nm.innerHTML = "KORA";
        const sb = document.querySelector(".brand-sub"); if (sb) { sb.style.display = ""; sb.textContent = "Agent"; }
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
  async function startCycle(demand = 1, force = false) {
    setState({ ui: { ...state.ui, busy: true, overlay: force ? "Génération forcée (hors fenêtre 24h)…" : "Collecte des sources whitelist…" } });
    try {
      await api("/api/cycle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ demand, force }) });
      for (let i = 0; i < 60; i++) {
        await wait(3000);
        const r = await api("/api/last");
        setState({ lastCycle: r });
        if (!r.running && r.result) {
          // Recharge depuis l'API HITL (facts avec fact_id valide) plutôt que
          // r.result.facts (sans fact_id) -> sinon le clic carte casse.
          await loadHITL();
          setState({ lastCycle: r, ui: { ...state.ui, busy: false, overlay: null } });
          return;
        }
        setState({ ui: { ...state.ui, overlay: "Cycle en cours… (" + i * 3 + "s)" } });
      }
      setState({ ui: { ...state.ui, busy: false, overlay: null } });
    } catch (e) { setState({ ui: { ...state.ui, busy: false, overlay: null, error: e.message } }); }
  }
  async function seed() {
    // Le backend n'expose pas /api/seed_demo ; on lance un cycle de démo
    // (force=true ignore la fenêtre 24h, demand=1) qui peuplera les facts.
    await startCycle(1, true);
  }
  async function decide(factId, decision, editedText = "") {
    setState({ ui: { ...state.ui, busy: true, overlay: "Enregistrement…" } });
    try {
      const r = await api("/api/hitl/decide", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact_id: factId, decision, edited_text: editedText, decided_by: "chef_de_secteur" })
      });
      if (r.error) throw new Error(r.error);
      setState({ decisions: { ...state.decisions, [factId]: decision }, ui: { ...state.ui, busy: false, overlay: null } });
    } catch (e) { setState({ ui: { ...state.ui, busy: false, overlay: null, error: e.message } }); }
  }

  async function retract(factId) {
    if (!window.confirm("Annuler cette décision ? L'article repassera en attente de validation.")) return;
    setState({ ui: { ...state.ui, busy: true, overlay: "Annulation de la décision…" } });
    try {
      const r = await api("/api/hitl/retract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fact_id: factId }) });
      if (r.error) throw new Error(r.error);
      await loadHITL();
      setState({ ui: { ...state.ui, busy: false, overlay: null } });
    } catch (e) { setState({ ui: { ...state.ui, busy: false, overlay: null, error: e.message } }); }
  }
  function setRoute(r) { setState({ route: r }); }
  function openSheet(s) { setState({ sheet: s }); }
  function closeSheet() { setState({ sheet: null }); }
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
    let t = "dark";
    try { t = localStorage.getItem("kora-theme") || (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"); } catch (e) {}
    if (!THEMES.includes(t)) t = "dark";
    applyTheme(t);
    return t;
  }

  // ---- Rail adaptive (M3) : mode = auto | collapsed | expanded ----
  // auto  -> gouverné par les breakpoints (medium=modal/navbar, expanded+=standard)
  // collapsed / expanded -> override appliqué uniquement en expanded+ (desktop large)
  const RAIL_MODES = ["auto", "collapsed", "expanded"];
  function getRailMode() { return state.ui.railMode || "auto"; }
  function applyRailMode(m) {
    const root = document.documentElement;
    // En expanded+ on applique l'override collapsed/expanded ; sinon on laisse le breakpoint gérer (auto)
    const isExpanded = window.matchMedia && window.matchMedia("(min-width: 840px)").matches;
    if (m === "auto" || !isExpanded) {
      root.removeAttribute("data-rail");
    } else {
      root.setAttribute("data-rail", m);
    }
  }
  function setRailMode(m) {
    if (!RAIL_MODES.includes(m)) m = "auto";
    try { localStorage.setItem("kora-rail-mode", m); } catch (e) {}
    applyRailMode(m);
    setState({ ui: { ...state.ui, railMode: m } });
  }
  function initRailMode() {
    let m = "auto";
    try { m = localStorage.getItem("kora-rail-mode") || "auto"; } catch (e) {}
    if (!RAIL_MODES.includes(m)) m = "auto";
    applyRailMode(m);
    return m;
  }
  // Alias rétro-compat (ancien UI pré-M3 : app.js utilise getRail/setRail)
  function getRail() { return getRailMode() === "collapsed" ? "collapsed" : "expanded"; }
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
      await loadTrash();
      await loadHITL();
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

  // ============================================================
  // COCKPIT — Agrégation multi-API + Auto-refresh
  // ============================================================
  async function loadAll() {
    // Charge tout en parallèle pour le cockpit
    try {
      setState({ ui: { ...state.ui, loading: true, error: null } });
      const [health, audit, hitl, sources] = await Promise.allSettled([
        api("/api/health"),
        api("/api/audit"),
        api("/api/hitl"),
        api("/api/whitelist"),
      ]);
      const h = health.status === "fulfilled" ? health.value : null;
      const a = audit.status === "fulfilled" ? audit.value : { days: [], total: 0 };
      const f = hitl.status === "fulfilled" ? hitl.value : [];
      const s = sources.status === "fulfilled" ? sources.value : [];
      
      // decisions map pour filtres (source unique de vérité)
      const decisions = Object.fromEntries((f || []).map(fact => [fact.fact_id, fact.status || "PENDING_REVIEW"]));
      
      setState({ 
        health: h, 
        audit: a, 
        facts: f, 
        decisions, 
        sources: s,
        ui: { ...state.ui, loading: false, lastRefresh: Date.now() } 
      });
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
    loadHealth, loadLast, loadHITL, loadAudit, loadSources, loadSettings, applySettings,
    startCycle, seed, decide, retract, setRoute, openSheet, closeSheet, wait,
    getFactFilter, setFactFilter,
    getTheme, setTheme, initTheme,
    getRailMode, setRailMode, initRailMode, applyRailMode,
    getRail, setRail,
    checkAuth, login, logout, changePassword, forgot, resetPassword,
    loadUsers, createUser, setRole, deleteUser,
    setSelectMode, toggleSelect, clearSelection, selectedIds,
    bulkAction, restoreFact, deleteForever, loadTrash, finishDraft,
    regenerate,
    // Cockpit
    loadAll, startAutoRefresh, stopAutoRefresh
  };
})();
