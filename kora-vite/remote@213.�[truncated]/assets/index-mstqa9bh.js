var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var _a, _b;
(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
const ic = (id) => `<svg class="ic"><use href="#${id}"/></svg>`;
const SHELL = `
  <header class="topbar">
    <div class="topbar-left">
      <div class="brand">
        <span class="brand-mark">${ic("i-spark")}</span>
        <span class="brand-name">KORA</span>
        <span class="brand-sub">Agent</span>
      </div>
      <div class="topbar-search">
        <span class="ic">${ic("i-search")}</span>
        <input class="topbar-search-input" type="search" placeholder="Rechercher un article…" data-action="search" aria-label="Rechercher un article" />
      </div>
    </div>
    <div class="topbar-right">
      <button class="btn btn-ghost topbar-filter" data-action="sort" aria-label="Trier">Trier par</button>
      <button class="btn btn-ghost topbar-filter" data-action="filters" aria-label="Filtres">Filtres</button>
      <div class="topbar-status" id="agentStatus">
        <span class="dot dot-ok"></span><span id="agentMode">prêt</span>
      </div>
      <button class="btn btn-primary topbar-cta" id="topbarCycle" data-action="cycle-normal" title="Lancer un cycle" aria-label="Lancer un cycle">
        ${ic("i-refresh")}<span class="topbar-cta-label">Lancer un cycle</span>
      </button>
    </div>
  </header>

  <!-- LEFT DRAWER — Mobile (≤819px) : hamburger → 248px slide-in -->
  <nav class="left-drawer" id="leftDrawer" hidden>
    <div class="left-drawer-header">
      <span class="left-drawer-title">KORA</span>
      <button class="left-drawer-close" id="leftDrawerClose" aria-label="Fermer le menu">${ic("i-chevron")}</button>
    </div>
    <div class="left-drawer-body">
      <button class="navitem" data-route="cockpit"><svg class="ic"><use href="#i-dashboard"/></svg><span>Tableau de bord</span></button>
      <button class="navitem" data-route="facts"><svg class="ic"><use href="#i-facts"/></svg><span>Total</span><span class="nav-badge" data-badge="facts"></span></button>
      <button class="navitem" data-route="audit"><svg class="ic"><use href="#i-check"/></svg><span>Historique</span></button>
      <button class="navitem" data-route="drafts"><svg class="ic"><use href="#i-edit"/></svg><span>Brouillons</span></button>
      <button class="navitem" data-route="sources"><svg class="ic"><use href="#i-sources"/></svg><span>Sources</span><span class="nav-badge" data-badge="sources"></span></button>
      <div class="rail-sep"></div>
      <button class="navitem" data-route="trash"><svg class="ic"><use href="#i-trash"/></svg><span>Corbeille</span></button>
      <button class="navitem" data-route="settings"><svg class="ic"><use href="#i-settings"/></svg><span>Paramètres</span></button>
    </div>
  </nav>

  <!-- LEFT DRAWER SCRIM -->
  <div class="left-drawer-scrim" id="leftDrawerScrim" hidden></div>

  <!-- RAIL — Desktop/Tablet persistent (refonte v2 : indicateur vertical corail, items calmes) -->
  <nav class="rail" id="rail" aria-label="Navigation principale">
    <div class="rail-head">
      <span class="rail-mark">K</span>
      <div class="rail-word"><b>KORA</b><span class="rail-word-sub">Veille Guinée</span></div>
      <button class="rail-toggle" id="railToggle" title="Réduire/Agrandir la barre" aria-label="Réduire la barre">${ic("i-chevron")}</button>
    </div>

    <div class="rail-group">Pilotage</div>
    <button class="item" data-route="cockpit" aria-current="page"><span class="ico">${ic("i-dashboard")}</span><span class="lbl">Tableau de bord</span></button>
    <button class="item" data-route="audit"><span class="ico">${ic("i-check")}</span><span class="lbl">Historique</span></button>

    <div class="rail-group">Contenu</div>
    <button class="item" data-route="facts"><span class="ico">${ic("i-facts")}</span><span class="lbl">Total</span><span class="ct" data-badge="facts"></span></button>
    <button class="item" data-route="drafts"><span class="ico">${ic("i-edit")}</span><span class="lbl">Brouillons</span><span class="ct" data-badge="drafts"></span></button>
    <button class="item" data-route="trash"><span class="ico">${ic("i-trash")}</span><span class="lbl">Corbeille</span><span class="ct" data-badge="trash"></span></button>

    <div class="rail-group">Système</div>
    <button class="item" data-route="sources"><span class="ico">${ic("i-sources")}</span><span class="lbl">Sources</span><span class="ct" data-badge="sources"></span></button>
    <button class="item" data-route="settings"><span class="ico">${ic("i-settings")}</span><span class="lbl">Paramètres</span></button>

    <div class="rail-spacer"></div>
    <div class="decision-foot" aria-live="polite">
      <span class="decision-pulse" aria-hidden="true"></span>
      <div class="decision-meta"><span class="decision-n" data-decision="pending">0</span><span class="decision-l">à décider</span></div>
    </div>
  </nav>

  <!-- RIGHT DRAWER OVERLAY — Desktop/Tablet (≥820px) : "Plus" menu -->
  <nav class="right-drawer" id="rightDrawer" hidden>
    <div class="right-drawer-header">
      <span class="right-drawer-title">Plus</span>
      <button class="right-drawer-close" id="rightDrawerClose" aria-label="Fermer">${ic("i-chevron")}</button>
    </div>
    <div class="right-drawer-body">
      <button class="navitem" data-route="audit"><svg class="ic"><use href="#i-check"/></svg><span>Historique</span></button>
      <button class="navitem" data-route="drafts"><svg class="ic"><use href="#i-edit"/></svg><span>Brouillons</span><span class="nav-badge" data-badge="drafts"></span></button>
      <button class="navitem" data-route="trash"><svg class="ic"><use href="#i-trash"/></svg><span>Corbeille</span><span class="nav-badge" data-badge="trash"></span></button>
      <button class="navitem" data-route="settings"><svg class="ic"><use href="#i-settings"/></svg><span>Paramètres</span></button>
    </div>
  </nav>

  <!-- RIGHT DRAWER SCRIM -->
  <div class="right-drawer-scrim" id="rightDrawerScrim" hidden></div>

  <main class="view" id="view"></main>

  <nav class="bottomnav" id="bottomnav">
    <button class="navitem" data-route="cockpit"><svg class="ic"><use href="#i-dashboard"/></svg><span>Cockpit</span></button>
    <button class="navitem" data-route="facts"><svg class="ic"><use href="#i-facts"/></svg><span>Total</span><span class="nav-badge" data-badge="facts"></span></button>
    <button class="navitem" data-route="drafts"><svg class="ic"><use href="#i-edit"/></svg><span>Brouil</span><span class="nav-badge" data-badge="drafts"></span></button>
    <button class="navitem" data-route="trash"><svg class="ic"><use href="#i-trash"/></svg><span>Corbeille</span><span class="nav-badge" data-badge="trash"></span></button>
  </nav>

  <div class="nav-scrim" id="navScrim" hidden></div>
  <div class="overflow-menu" id="overflowMenu" hidden>
    <button class="overflow-item" data-route="trash"><svg class="ic"><use href="#i-trash"/></svg><span>Corbeille</span></button>
    <button class="overflow-item" data-route="settings"><svg class="ic"><use href="#i-settings"/></svg><span>Paramètres</span></button>
  </div>

  <div class="rail-scrim" id="railScrim" hidden></div>

  <div class="sheet-scrim" id="sheetScrim" hidden></div>
  <div class="sheet" id="sheet" hidden>
    <div class="sheet-handle"></div>
    <div id="sheetBody"></div>
  </div>

  <div class="snackbar" id="snackbar" hidden></div>
  <div class="global-loader" id="globalLoader" hidden>
    <div class="wave"><i></i><i></i><i></i><i></i><i></i></div>
    <span id="globalLoaderText">Agent en cours…</span>
  </div>

  <!-- Barre d'action de sélection multiple -->
  <div class="select-bar" id="selectBar" hidden>
    <div class="select-bar-info"><b id="selectCount">0</b> <span class="sel-word">sélectionné(s)</span></div>
    <div class="select-bar-actions">
      <button class="btn btn-tonal" data-bulk="pending" title="Remettre en attente de validation (sans publier)">${ic("i-undo")}<span>Attente</span></button>
      <button class="btn btn-tonal" data-bulk="trash" title="Mettre à la corbeille">${ic("i-trash")}<span>Corbeille</span></button>
      <button class="btn btn-tonal" data-bulk="draft" title="Placer en brouillon">${ic("i-edit")}<span>Brouillon</span></button>
      <button class="btn btn-primary" data-bulk="approve" title="Publier l'article">${ic("i-send")}<span>Publier</span></button>
    </div>
  </div>

  <!-- Fenêtre : choix publication WordPress (direct vs brouillon) -->
  <div class="sheet-scrim" id="wpScrim" hidden></div>
  <div class="mini-sheet" id="wpChoice" hidden>
    <div class="mini-sheet-card">
      <div class="quiz-badge">📡 Publication WordPress</div>
      <div class="mini-sheet-q">Comment veux-tu publier les <b id="wpCount">0</b> article(s) sélectionné(s) sur le site WordPress ?</div>
      <div class="mini-sheet-actions">
        <button class="btn btn-primary" id="wpPublish">Publier directement (public)</button>
        <button class="btn btn-tonal" id="wpDraft">Placer en brouillon WP (invisible)</button>
        <button class="btn btn-ghost" id="wpCancel">Annuler</button>
      </div>
    </div>
  </div>

  <!-- Fenêtre : confirmation corbeille / suppression définitive -->
  <div class="mini-sheet" id="trashChoice" hidden>
    <div class="mini-sheet-card">
      <div class="quiz-badge">🗑️ Suppression</div>
      <div class="mini-sheet-q">Que faire des <b id="trashCount">0</b> article(s) sélectionné(s) ?</div>
      <label class="mini-sheet-check"><input type="checkbox" id="trashDefinitive"> Suppression définitive (irréversible, hors corbeille)</label>
      <div class="mini-sheet-actions">
        <button class="btn btn-tonal" id="trashPut">Mettre à la corbeille (11 j)</button>
        <button class="btn btn-danger" id="trashDelete" hidden>Supprimer définitivement</button>
        <button class="btn btn-ghost" id="trashCancel">Annuler</button>
      </div>
    </div>
  </div>
`;
const BASE = "/kora-v2";
const Store = /* @__PURE__ */ (() => {
  const state = {
    route: "cockpit",
    ui: { loading: false, error: null, busy: false, overlay: null, theme: "dark", rail: "expanded", factFilter: "all", factQuery: "", factSort: "recent" },
    health: null,
    lastCycle: null,
    facts: [],
    decisions: {},
    audit: [],
    auditFilter: { type: "all", q: "" },
    sources: [],
    sheet: null,
    trash: [],
    selection: {},
    // { fact_id: true } — sélection multiple
    selectMode: false,
    // mode sélection activé
    auth: { loggedIn: false, username: null, email: null, pending: true }
  };
  const subs = /* @__PURE__ */ new Set();
  let _notifying = false;
  let _pendingPatch = null;
  let _reentry = 0;
  function setState(patch) {
    Object.assign(state, patch);
    if (_notifying) {
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
      const p2 = _pendingPatch;
      _pendingPatch = null;
      _reentry++;
      queueMicrotask(() => {
        _reentry--;
        setState(p2);
      });
    } else if (_pendingPatch) {
      _pendingPatch = null;
    }
  }
  function subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  }
  async function api(path, opts) {
    const url = BASE + path;
    const token = (() => {
      try {
        return localStorage.getItem("kora-token");
      } catch (e2) {
        return null;
      }
    })();
    const headers = Object.assign({}, opts && opts.headers ? opts.headers : {});
    if (token) {
      headers["X-API-Token"] = token;
    }
    const fetchOpts = Object.assign({}, opts, { headers, credentials: "include" });
    const ctrl = new AbortController();
    const TIMEOUT_MS = opts && opts.timeout || 15e3;
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    fetchOpts.signal = ctrl.signal;
    try {
      const res = await fetch(url, fetchOpts);
      clearTimeout(timer);
      const ct2 = res.headers.get("content-type") || "";
      if (!ct2.includes("application/json")) {
        throw new Error("Réponse non-JSON du serveur (code " + res.status + ")");
      }
      return await res.json();
    } catch (e2) {
      throw new Error(e2.message || "Réseau indisponible");
    }
  }
  let _checking = false;
  async function checkAuth() {
    if (_checking) return false;
    _checking = true;
    setState({ auth: Object.assign({}, state.auth, { pending: true }) });
    try {
      const r2 = await api("/api/auth/me");
      if (r2.ok) {
        const next = { loggedIn: true, username: r2.username, email: r2.email, role: r2.role || "normal", pending: false };
        const a2 = state.auth || {};
        if (!a2.loggedIn || a2.username !== next.username || a2.role !== next.role) {
          setState({ auth: next });
        }
        return true;
      }
      console.warn("[auth] /api/auth/me a répondu ok=false", r2);
    } catch (e2) {
      console.warn("[auth] /api/auth/me a échoué, session conservée :", e2.message);
      return false;
    } finally {
      _checking = false;
    }
    setState({ auth: { loggedIn: false, username: null, email: null, role: null, pending: false } });
    return false;
  }
  async function login(username, password) {
    const r2 = await api("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    if (!r2.ok) {
      if (r2.error === "invalid_credentials") throw new Error("Identifiants invalides");
      throw new Error("Erreur de connexion");
    }
    const ok = await checkAuth();
    if (ok) await loadAll();
    return ok;
  }
  async function logout() {
    setState({ auth: { loggedIn: false, username: null, email: null } });
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 4e3);
    fetch(BASE + "/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      signal: ctrl.signal
    }).catch(() => {
    }).finally(() => clearTimeout(to));
  }
  async function changePassword(current, newp) {
    const r2 = await api("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current, new: newp }) });
    if (r2.ok) return true;
    if (r2.error === "wrong_current") throw new Error("Mot de passe actuel incorrect");
    if (r2.error === "password_too_short") throw new Error("Le nouveau mot de passe doit faire au moins 8 caractères");
    throw new Error(r2.error || "Erreur");
  }
  async function forgot(email) {
    const r2 = await api("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    return r2.ok !== false;
  }
  async function resetPassword(token, newp) {
    const r2 = await api("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, new_password: newp }) });
    if (r2.ok) return true;
    if (r2.error === "token_expired") throw new Error("Lien expiré, redemandez une réinitialisation");
    if (r2.error === "invalid_token") throw new Error("Lien invalide");
    if (r2.error === "password_too_short") throw new Error("Le mot de passe doit faire au moins 8 caractères");
    throw new Error(r2.error || "Erreur");
  }
  async function loadUsers() {
    const r2 = await api("/api/auth/users");
    if (r2.users) {
      setState({ users: r2.users });
      return r2.users;
    }
    return [];
  }
  async function createUser(username, email, password, role = "normal") {
    const r2 = await api("/api/auth/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, email, password, role }) });
    if (r2.ok) return true;
    if (r2.error === "username_exists") throw new Error("Cet identifiant existe déjà");
    if (r2.error === "username_too_short") throw new Error("Identifiant trop court (3 min)");
    if (r2.error === "password_too_short") throw new Error("Mot de passe 8 caractères minimum");
    if (r2.error === "role_invalide") throw new Error("Rôle invalide");
    throw new Error(r2.error || "Erreur");
  }
  async function setRole(id, role) {
    const r2 = await api("/api/auth/users/role", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, role }) });
    if (r2.ok) return true;
    if (r2.error === "role_invalide") throw new Error("Rôle invalide");
    throw new Error(r2.error || "Erreur");
  }
  async function deleteUser(id) {
    const r2 = await api("/api/auth/users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (r2.ok) return true;
    if (r2.error === "cannot_delete_self") throw new Error("Vous ne pouvez pas supprimer votre propre compte");
    throw new Error(r2.error || "Erreur");
  }
  async function loadHealth() {
    try {
      setState({ health: await api("/api/health") });
    } catch (e2) {
      setState({ ui: { ...state.ui, error: e2.message } });
    }
  }
  async function loadLast() {
    try {
      const r2 = await api("/api/last");
      setState({ lastCycle: r2 });
    } catch (e2) {
      setState({ ui: { ...state.ui, error: e2.message } });
    }
  }
  async function loadHITL() {
    setState({ ui: { ...state.ui, loading: true, error: null } });
    try {
      const r2 = await api("/api/hitl");
      const faits = Array.isArray(r2) ? r2 : r2.facts || [];
      const decisions = Object.fromEntries(faits.map((f2) => [f2.fact_id, f2.status || "PENDING_REVIEW"]));
      const publishedCount = r2 && !Array.isArray(r2) && typeof r2.published_count === "number" ? r2.published_count : void 0;
      const rejectedCount = r2 && !Array.isArray(r2) && typeof r2.rejected_count === "number" ? r2.rejected_count : void 0;
      const deletedCount = r2 && !Array.isArray(r2) && typeof r2.deleted_count === "number" ? r2.deleted_count : void 0;
      setState({ facts: faits, decisions, publishedCount, rejectedCount, deletedCount, ui: { ...state.ui, loading: false } });
      setTimeout(() => {
        try {
          Store.setState({ ui: { ...Store.state.ui, _bcTick: Date.now() } });
        } catch (_2) {
        }
      }, 80);
    } catch (e2) {
      setState({ facts: [], ui: { ...state.ui, loading: false, error: e2.message } });
    }
  }
  async function loadAudit() {
    try {
      setState({ audit: await api("/api/audit") });
    } catch (e2) {
      setState({ ui: { ...state.ui, error: e2.message } });
    }
  }
  async function loadSources() {
    try {
      setState({ sources: await api("/api/whitelist") });
    } catch (e2) {
      setState({ ui: { ...state.ui, error: e2.message } });
    }
  }
  async function loadSettings() {
    try {
      const s2 = await api("/api/settings");
      applySettings(s2);
      setState({ settings: s2 });
    } catch (e2) {
    }
  }
  function applySettings(s2) {
    if (!s2) return;
    setState({ app_name: s2.app_name || state.app_name, settings: Object.assign({}, state.settings, s2) });
    const root = document.documentElement;
    if (s2.accent_coral) root.style.setProperty("--coral", s2.accent_coral);
    if (s2.accent_bordeaux) root.style.setProperty("--bordeaux", s2.accent_bordeaux);
    if (s2.accent_coral) root.style.setProperty("--coral-strong", shade(s2.accent_coral, -0.12));
    const nameEl = document.querySelector(".brand-name");
    const subEl = document.querySelector(".brand-sub");
    const markEl = document.querySelector(".brand-mark");
    if (nameEl && s2.app_name) {
      const parts = s2.app_name.split(/\s+(.+)/);
      nameEl.textContent = parts[0] || s2.app_name;
      if (subEl) subEl.textContent = parts[1] || "";
    }
    if (markEl) {
      const fav = s2.favicon_data || s2.logo_data;
      if (fav) {
        markEl.style.display = "";
        markEl.innerHTML = `<img src="${fav}" alt="" class="brand-fav-img">`;
        const nm = document.querySelector(".brand-name");
        const sb = document.querySelector(".brand-sub");
        if (nm) nm.textContent = (s2.app_name || "KORA").split(" ")[0];
        if (sb) sb.textContent = (s2.app_name || "KORA").split(" ").slice(1).join(" ");
        try {
          let l4 = document.querySelector('link[rel="icon"]');
          if (!l4) {
            l4 = document.createElement("link");
            l4.rel = "icon";
            document.head.appendChild(l4);
          }
          l4.href = fav;
        } catch (e2) {
        }
      } else {
        markEl.style.display = "";
        markEl.innerHTML = `<svg class="ic"><use href="#i-spark"/></svg>`;
        const nm = document.querySelector(".brand-name");
        if (nm) nm.innerHTML = "KORA";
        const sb = document.querySelector(".brand-sub");
        if (sb) {
          sb.style.display = "";
          sb.textContent = "Agent";
        }
      }
    }
    const routeMap = { cockpit: s2.label_cockpit, facts: s2.label_facts, sources: s2.label_sources, drafts: s2.label_drafts, audit: s2.label_audit };
    Object.keys(routeMap).forEach((route) => {
      const lbl = routeMap[route];
      if (!lbl) return;
      document.querySelectorAll(`.navitem[data-route="${route}"] span`).forEach((sp) => {
        sp.textContent = lbl;
      });
    });
    if (s2.app_tagline) {
      const tl = document.querySelector(".about-tagline");
      if (tl) tl.textContent = s2.app_tagline;
    }
  }
  function shade(hex, pct) {
    const m2 = /^#?([0-9A-Fa-f]{6})$/.exec(hex || "");
    if (!m2) return hex;
    let n3 = parseInt(m2[1], 16);
    let r2 = n3 >> 16 & 255, g2 = n3 >> 8 & 255, b2 = n3 & 255;
    const f2 = (c2) => Math.max(0, Math.min(255, Math.round(c2 + 255 * pct)));
    return "#" + ((1 << 24) + (f2(r2) << 16) + (f2(g2) << 8) + f2(b2)).toString(16).slice(1).toUpperCase();
  }
  async function startCycle(demand = 1, force = false) {
    setState({ ui: { ...state.ui, busy: true, overlay: force ? "Génération forcée (hors fenêtre 24h)…" : "Collecte des sources whitelist…" } });
    try {
      await api("/api/cycle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ demand, force }) });
      for (let i2 = 0; i2 < 60; i2++) {
        await wait(3e3);
        const r2 = await api("/api/last");
        setState({ lastCycle: r2 });
        if (!r2.running && r2.result) {
          await loadHITL();
          setState({ lastCycle: r2, ui: { ...state.ui, busy: false, overlay: null } });
          return;
        }
        setState({ ui: { ...state.ui, overlay: "Cycle en cours… (" + i2 * 3 + "s)" } });
      }
      setState({ ui: { ...state.ui, busy: false, overlay: null } });
    } catch (e2) {
      setState({ ui: { ...state.ui, busy: false, overlay: null, error: e2.message } });
    }
  }
  async function seed() {
    await startCycle(1, true);
  }
  async function decide(factId, decision, editedText = "") {
    setState({ ui: { ...state.ui, busy: true, overlay: "Enregistrement…" } });
    try {
      const r2 = await api("/api/hitl/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact_id: factId, decision, edited_text: editedText, decided_by: "chef_de_secteur" })
      });
      if (r2.error) throw new Error(r2.error);
      await loadHITL();
      try {
        await loadTrash();
      } catch (_2) {
      }
      try {
        await loadStats();
      } catch (_2) {
      }
      setState({ ui: { ...state.ui, busy: false, overlay: null } });
    } catch (e2) {
      setState({ ui: { ...state.ui, busy: false, overlay: null, error: e2.message } });
    }
  }
  async function retract(factId) {
    if (!window.confirm("Annuler cette décision ? L'article repassera en attente de validation.")) return;
    setState({ ui: { ...state.ui, busy: true, overlay: "Annulation de la décision…" } });
    try {
      const r2 = await api("/api/hitl/retract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fact_id: factId }) });
      if (r2.error) throw new Error(r2.error);
      await loadHITL();
      try {
        await loadStats();
      } catch (_2) {
      }
      setState({ ui: { ...state.ui, busy: false, overlay: null } });
    } catch (e2) {
      setState({ ui: { ...state.ui, busy: false, overlay: null, error: e2.message } });
    }
  }
  function setRoute(r2) {
    setState({ route: r2 });
  }
  function openSheet(s2) {
    setState({ sheet: s2 });
  }
  function closeSheet() {
    setState({ sheet: null });
  }
  function getFactFilter() {
    return state.ui.factFilter || "all";
  }
  function setFactFilter(f2) {
    setState({ ui: { ...state.ui, factFilter: f2 } });
  }
  function getFactQuery() {
    try {
      return localStorage.getItem("kora-factQuery") || state.ui.factQuery || "";
    } catch (e2) {
      return state.ui.factQuery || "";
    }
  }
  function setFactQuery(q2) {
    try {
      localStorage.setItem("kora-factQuery", q2 || "");
    } catch (e2) {
    }
    setState({ ui: { ...state.ui, factQuery: q2 || "" } });
  }
  function getFactSort() {
    try {
      return localStorage.getItem("kora-factSort") || state.ui.factSort || "recent";
    } catch (e2) {
      return state.ui.factSort || "recent";
    }
  }
  function setFactSort(o2) {
    try {
      localStorage.setItem("kora-factSort", o2 || "recent");
    } catch (e2) {
    }
    setState({ ui: { ...state.ui, factSort: o2 || "recent" } });
  }
  function wait(ms) {
    return new Promise((r2) => setTimeout(r2, ms));
  }
  const THEMES = ["dark", "light", "cacao"];
  function getTheme() {
    return state.ui.theme || "dark";
  }
  function applyTheme(t2) {
    const root = document.documentElement;
    if (root) root.setAttribute("data-theme", t2);
  }
  function setTheme(t2) {
    if (!THEMES.includes(t2)) t2 = "dark";
    try {
      localStorage.setItem("kora-theme", t2);
    } catch (e2) {
    }
    applyTheme(t2);
    setState({ ui: { ...state.ui, theme: t2 } });
  }
  function initTheme() {
    let t2 = "dark";
    try {
      t2 = localStorage.getItem("kora-theme") || "dark";
      if (t2 === "light") {
        localStorage.setItem("kora-theme", "dark");
        t2 = "dark";
      }
    } catch (e2) {
    }
    if (!THEMES.includes(t2)) t2 = "dark";
    applyTheme(t2);
    return t2;
  }
  const RAIL_MODES = ["auto", "collapsed", "expanded"];
  function getRailMode() {
    return state.ui.railMode || "auto";
  }
  function applyRailMode(m2) {
    const root = document.documentElement;
    const isExpanded = window.matchMedia && window.matchMedia("(min-width: 840px)").matches;
    if (m2 === "auto" || !isExpanded) {
      root.removeAttribute("data-rail");
    } else {
      root.setAttribute("data-rail", m2);
    }
  }
  function setRailMode(m2) {
    if (!RAIL_MODES.includes(m2)) m2 = "auto";
    try {
      localStorage.setItem("kora-rail-mode", m2);
    } catch (e2) {
    }
    applyRailMode(m2);
    setState({ ui: { ...state.ui, railMode: m2 } });
  }
  function initRailMode() {
    let m2 = "auto";
    try {
      m2 = localStorage.getItem("kora-rail-mode") || "auto";
    } catch (e2) {
    }
    if (!RAIL_MODES.includes(m2)) m2 = "auto";
    applyRailMode(m2);
    return m2;
  }
  function getRail() {
    return getRailMode() === "collapsed" ? "collapsed" : "expanded";
  }
  function setRail(r2) {
    setRailMode(r2 === "collapsed" ? "collapsed" : "expanded");
  }
  function setSelectMode(on) {
    setState({ selectMode: !!on, selection: on ? state.selection : {} });
  }
  function toggleSelect(factId) {
    const sel = { ...state.selection };
    if (sel[factId]) delete sel[factId];
    else sel[factId] = true;
    setState({ selection: sel });
  }
  function clearSelection() {
    setState({ selection: {}, selectMode: false });
  }
  function selectedIds() {
    return Object.keys(state.selection);
  }
  async function bulkAction(action, opts = {}) {
    const ids = selectedIds();
    if (!ids.length) return { ok: true, done: 0, total: 0 };
    setState({ ui: { ...state.ui, busy: true, overlay: "Action en masse…" } });
    try {
      const body = { ids, action, wp_status: opts.wp_status || "publish" };
      const r2 = await api("/api/hitl/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (r2.error) throw new Error(r2.error);
      await loadHITL();
      try {
        await loadStats();
      } catch (_2) {
      }
      setState({ selection: {}, selectMode: false, ui: { ...state.ui, busy: false, overlay: null } });
      return r2;
    } catch (e2) {
      setState({ ui: { ...state.ui, busy: false, overlay: null, error: e2.message } });
      throw e2;
    }
  }
  async function restoreFact(factId) {
    setState({ ui: { ...state.ui, busy: true, overlay: "Restauration…" } });
    try {
      const r2 = await api("/api/hitl/trash/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact_id: factId })
      });
      if (r2.error) throw new Error(r2.error);
      await loadTrash();
      await loadHITL();
      try {
        await loadStats();
      } catch (_2) {
      }
      setState({ ui: { ...state.ui, busy: false, overlay: null } });
      return r2;
    } catch (e2) {
      setState({ ui: { ...state.ui, busy: false, overlay: null, error: e2.message } });
      throw e2;
    }
  }
  async function deleteForever(ids) {
    setState({ ui: { ...state.ui, busy: true, overlay: "Suppression définitive…" } });
    try {
      const r2 = await api("/api/hitl/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids })
      });
      if (r2.error) throw new Error(r2.error);
      const set = new Set(ids);
      const curFacts = (state.facts || []).filter((f2) => !set.has(f2.fact_id));
      const curTrash = (state.trash || []).filter((f2) => !set.has(f2.fact_id));
      closeSheet();
      setState({ facts: curFacts, trash: curTrash });
      await loadTrash();
      await loadHITL();
      try {
        await loadStats();
      } catch (_2) {
      }
      setState({ ui: { ...state.ui, busy: false, overlay: null } });
      return r2;
    } catch (e2) {
      setState({ ui: { ...state.ui, busy: false, overlay: null, error: e2.message } });
      throw e2;
    }
  }
  async function finishDraft(factId) {
    setState({ ui: { ...state.ui, busy: true, overlay: "Remise en attente…" } });
    try {
      const r2 = await api("/api/hitl/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact_id: factId, decision: "PENDING_REVIEW", decided_by: "chef_de_secteur" })
      });
      if (r2.error) throw new Error(r2.error);
      await loadHITL();
      try {
        await loadStats();
      } catch (_2) {
      }
      setState({ ui: { ...state.ui, busy: false, overlay: null } });
      return r2;
    } catch (e2) {
      setState({ ui: { ...state.ui, busy: false, overlay: null, error: e2.message } });
      throw e2;
    }
  }
  async function loadTrash() {
    const r2 = await api("/api/hitl/trash");
    if (!r2.error && r2.items) setState({ trash: r2.items });
    return r2;
  }
  async function loadStats() {
    try {
      const st2 = await api("/api/stats");
      if (st2 && !st2.error) setState({ stats: st2 });
    } catch (_2) {
    }
  }
  async function loadAll() {
    try {
      setState({ ui: { ...state.ui, loading: true, error: null } });
      const [health, audit, hitl, sources, stats] = await Promise.allSettled([
        api("/api/health"),
        api("/api/audit"),
        api("/api/hitl"),
        api("/api/whitelist"),
        api("/api/stats")
      ]);
      const h2 = health.status === "fulfilled" ? health.value : null;
      const a2 = audit.status === "fulfilled" ? audit.value : { days: [], total: 0 };
      const _hitl = hitl.status === "fulfilled" ? hitl.value : [];
      const f2 = Array.isArray(_hitl) ? _hitl : _hitl.facts || [];
      const s2 = sources.status === "fulfilled" ? sources.value : [];
      const st2 = stats.status === "fulfilled" ? stats.value : null;
      const decisions = Object.fromEntries((f2 || []).map((fact) => [fact.fact_id, fact.status || "PENDING_REVIEW"]));
      setState(
        {
          health: h2,
          audit: a2,
          facts: f2,
          decisions,
          sources: s2,
          stats: st2,
          ui: { ...state.ui, loading: false, lastRefresh: Date.now() }
        }
      );
    } catch (e2) {
      setState({ ui: { ...state.ui, loading: false, error: e2.message } });
    }
  }
  let _refreshTimer = null;
  function startAutoRefresh(intervalMs = 3e4) {
    stopAutoRefresh();
    _refreshTimer = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadAll();
      }
    }, intervalMs);
    document.addEventListener("visibilitychange", _onVisibilityChange);
  }
  function stopAutoRefresh() {
    if (_refreshTimer) {
      clearInterval(_refreshTimer);
      _refreshTimer = null;
    }
    document.removeEventListener("visibilitychange", _onVisibilityChange);
  }
  function _onVisibilityChange() {
    if (document.visibilityState === "visible") loadAll();
  }
  async function regenerate(fact_id, suggestion) {
    setState({ ui: { ...state.ui, busy: true, error: null } });
    try {
      const r2 = await api("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact_id, suggestion: suggestion || null }),
        timeout: 12e4
      });
      if (r2.error) throw new Error(r2.error);
      return r2;
    } catch (e2) {
      setState({ ui: { ...state.ui, error: e2.message } });
      throw e2;
    } finally {
      setState({ ui: { ...state.ui, busy: false } });
    }
  }
  return {
    state,
    setState,
    subscribe,
    api,
    loadHealth,
    loadLast,
    loadHITL,
    loadAudit,
    loadSources,
    loadSettings,
    applySettings,
    startCycle,
    seed,
    decide,
    retract,
    setRoute,
    openSheet,
    closeSheet,
    wait,
    getFactFilter,
    setFactFilter,
    getFactQuery,
    setFactQuery,
    getFactSort,
    setFactSort,
    getTheme,
    setTheme,
    initTheme,
    getRailMode,
    setRailMode,
    initRailMode,
    applyRailMode,
    // alias rétro-compat (certains appels utilisent initRail)
    initRail: initRailMode,
    getRail,
    setRail,
    checkAuth,
    login,
    logout,
    changePassword,
    forgot,
    resetPassword,
    loadUsers,
    createUser,
    setRole,
    deleteUser,
    setSelectMode,
    toggleSelect,
    clearSelection,
    selectedIds,
    bulkAction,
    restoreFact,
    deleteForever,
    loadTrash,
    finishDraft,
    regenerate,
    // Cockpit
    loadAll,
    startAutoRefresh,
    stopAutoRefresh
  };
})();
function C$1() {
  return { async: false, breaks: false, extensions: null, gfm: true, hooks: null, pedantic: false, renderer: null, silent: false, tokenizer: null, walkTokens: null };
}
var R$1 = C$1();
function j(l4) {
  R$1 = l4;
}
var z$1 = { exec: () => null };
function A$1(l4) {
  let e2 = [];
  return (t2) => {
    let n3 = Math.max(0, Math.min(3, t2 - 1)), s2 = e2[n3];
    return s2 || (s2 = l4(n3), e2[n3] = s2), s2;
  };
}
function k$1(l4, e2 = "") {
  let t2 = typeof l4 == "string" ? l4 : l4.source, n3 = { replace: (s2, r2) => {
    let i2 = typeof r2 == "string" ? r2 : r2.source;
    return i2 = i2.replace(m$1.caret, "$1"), t2 = t2.replace(s2, i2), n3;
  }, getRegex: () => new RegExp(t2, e2) };
  return n3;
}
var Te = ((l4 = "") => {
  try {
    return !!new RegExp("(?<=1)(?<!1)" + l4);
  } catch {
    return false;
  }
})(), m$1 = { codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm, outputLinkReplace: /\\([\[\]])/g, indentCodeCompensation: /^(\s+)(?:```)/, beginningSpace: /^\s+/, endingHash: /#$/, startingSpaceChar: /^ /, endingSpaceChar: / $/, nonSpaceChar: /[^ ]/, newLineCharGlobal: /\n/g, tabCharGlobal: /\t/g, multipleSpaceGlobal: /\s+/g, blankLine: /^[ \t]*$/, doubleBlankLine: /\n[ \t]*\n[ \t]*$/, blockquoteStart: /^ {0,3}>/, blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g, blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm, listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g, listIsTask: /^\[[ xX]\] +\S/, listReplaceTask: /^\[[ xX]\] +/, listTaskCheckbox: /\[[ xX]\]/, anyLine: /\n.*\n/, hrefBrackets: /^<(.*)>$/, tableDelimiter: /[:|]/, tableAlignChars: /^\||\| *$/g, tableRowBlankLine: /\n[ \t]*$/, tableAlignRight: /^ *-+: *$/, tableAlignCenter: /^ *:-+: *$/, tableAlignLeft: /^ *:-+ *$/, startATag: /^<a /i, endATag: /^<\/a>/i, startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i, endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i, startAngleBracket: /^</, endAngleBracket: />$/, pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/, unicodeAlphaNumeric: /[\p{L}\p{N}]/u, escapeTest: /[&<>"']/, escapeReplace: /[&<>"']/g, escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/, escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, caret: /(^|[^\[])\^/g, percentDecode: /%25/g, findPipe: /\|/g, splitPipe: / \|/, slashPipe: /\\\|/g, carriageReturn: /\r\n|\r/g, spaceLine: /^ +$/gm, notSpaceStart: /^\S*/, endingNewline: /\n$/, listItemRegex: (l4) => new RegExp(`^( {0,3}${l4})((?:[	 ][^\\n]*)?(?:\\n|$))`), nextBulletRegex: A$1((l4) => new RegExp(`^ {0,${l4}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`)), hrRegex: A$1((l4) => new RegExp(`^ {0,${l4}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`)), fencesBeginRegex: A$1((l4) => new RegExp(`^ {0,${l4}}(?:\`\`\`|~~~)`)), headingBeginRegex: A$1((l4) => new RegExp(`^ {0,${l4}}#`)), htmlBeginRegex: A$1((l4) => new RegExp(`^ {0,${l4}}<(?:[a-z].*>|!--)`, "i")), blockquoteBeginRegex: A$1((l4) => new RegExp(`^ {0,${l4}}>`)) }, Oe = /^(?:[ \t]*(?:\n|$))+/, we = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/, ye = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/, q = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/, Pe = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/, U = / {0,3}(?:[*+-]|\d{1,9}[.)])/, oe = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/, ae = k$1(oe).replace(/bull/g, U).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}(?:\s|$)/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex(), Se = k$1(oe).replace(/bull/g, U).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}(?:\s|$)/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(), K = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table|[ \t]+\n)[^\n]+)*)/, _e = /^[^\n]+/, W = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/, $e = k$1(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", W).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(), Le = k$1(/^(bull)([ \t][^\n]*?)?(?:\n|$)/).replace(/bull/g, U).getRegex(), Q = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul", X = /<!--(?:-?>|[\s\S]*?(?:-->|$))/, Me = k$1("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n*|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>[^\\n]*\\n*|$)|<![A-Z][\\s\\S]*?(?:>[^\\n]*\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>[^\\n]*\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))", "i").replace("comment", X).replace("tag", Q).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(), le = (l4) => k$1(K).replace("hr", q).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~~~)[^\\n]*\\n").replace("list", l4).replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", Q).getRegex(), ze = le(/ {0,3}(?:[*+-]|1[.)])[ \t]+[^ \t\n]/), Ee = le(/ {0,3}(?:[*+-]|\d{1,9}[.)])(?:[ \t]|\n|$)/), Ce = k$1(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", Ee).getRegex(), J = { blockquote: Ce, code: we, def: $e, fences: ye, heading: Pe, hr: q, html: Me, lheading: ae, list: Le, newline: Oe, paragraph: ze, table: z$1, text: _e }, se = k$1("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", q).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~~~)[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", Q).getRegex(), Ae = { ...J, lheading: Se, table: se, paragraph: k$1(K).replace("hr", q).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", se).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~~~)[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]+[^ \\t\\n]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", Q).getRegex() }, Ie = { ...J, html: k$1(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", X).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(), def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/, heading: /^(#{1,6})(.*)(?:\n+|$)/, fences: z$1, lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/, paragraph: k$1(K).replace("hr", q).replace("heading", ` *#{1,6} *[^
]`).replace("lheading", ae).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex() }, Be = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/, De = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/, pe = /^( {2,}|\\)\n(?!\s*$)/, qe = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/, _$1 = /[\p{P}\p{S}]/u, I$1 = /[\s\p{P}\p{S}]/u, v$1 = /[^\s\p{P}\p{S}]/u, ve = k$1(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, I$1).getRegex(), He = /[\p{Pi}\p{Ps}"']/u, ue = /(?!~)[\p{P}\p{S}]/u, Ze = /(?!~)[\s\p{P}\p{S}]/u, Ge = /(?:[^\s\p{P}\p{S}]|~)/u, Qe = k$1(/link|precode-code|html/, "g").replace("link", /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-", Te ? "(?<!`)()" : "(^^|[^`])").replace("code", /(?<b>`+)[^`]+\k<b>(?!`)/).replace("html", /<(?! )[^<>]*?>/).getRegex(), ce = /^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/, Ne = k$1(ce, "u").replace(/punct/g, _$1).getRegex(), je = k$1(ce, "u").replace(/punct/g, ue).getRegex(), Fe = /^(?:\*+(?:((?!\*)(?!openQuote)punct)|([^\s*]))?)|^_+(?:((?!_)(?!openQuote)punct)|([^\s_]))?/, Ue = k$1(Fe, "u").replace(/openQuote/g, He).replace(/punct/g, _$1).getRegex(), he = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)", Ke = k$1(he, "gu").replace(/notPunctSpace/g, v$1).replace(/punctSpace/g, I$1).replace(/punct/g, _$1).getRegex(), We = k$1(he, "gu").replace(/notPunctSpace/g, Ge).replace(/punctSpace/g, Ze).replace(/punct/g, ue).getRegex(), Xe = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)[\\s](\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|(?:(?!\\*)punct|notPunctSpace)(\\*+)(?!\\*)(?=notPunctSpace)", Je = k$1(Xe, "gu").replace(/notPunctSpace/g, v$1).replace(/punctSpace/g, I$1).replace(/punct/g, _$1).getRegex(), Ve = k$1("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)", "gu").replace(/notPunctSpace/g, v$1).replace(/punctSpace/g, I$1).replace(/punct/g, _$1).getRegex(), Ye = "^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)[\\s](_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)|(?:(?!_)punct|notPunctSpace)(_+)(?!_)(?=notPunctSpace)", et = k$1(Ye, "gu").replace(/notPunctSpace/g, v$1).replace(/punctSpace/g, I$1).replace(/punct/g, _$1).getRegex(), tt = k$1(/^~~?(?:((?!~)punct)|[^\s~])/, "u").replace(/punct/g, _$1).getRegex(), nt = "^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)", rt = k$1(nt, "gu").replace(/notPunctSpace/g, v$1).replace(/punctSpace/g, I$1).replace(/punct/g, _$1).getRegex(), st = k$1(/\\(punct)/, "gu").replace(/punct/g, _$1).getRegex(), it = k$1(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(), ot = k$1(X).replace("(?:-->|$)", "-->").getRegex(), at = k$1("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", ot).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(), G = /(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/, lt = k$1(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?\s*\)/).replace("label", G).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]+|(?=\))/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(), de = k$1(/^!?\[(label)\]\[(ref)\]/).replace("label", G).replace("ref", W).getRegex(), ke = k$1(/^!?\[(ref)\](?:\[\])?/).replace("ref", W).getRegex(), pt = k$1("reflink|nolink(?!\\()", "g").replace("reflink", de).replace("nolink", ke).getRegex(), ie = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/, V$1 = { _backpedal: z$1, anyPunctuation: st, autolink: it, blockSkip: Qe, br: pe, code: De, del: z$1, delLDelim: z$1, delRDelim: z$1, emStrongLDelim: Ne, emStrongRDelimAst: Ke, emStrongRDelimUnd: Ve, escape: Be, link: lt, nolink: ke, punctuation: ve, reflink: de, reflinkSearch: pt, tag: at, text: qe, url: z$1 }, ut = { ...V$1, emStrongLDelim: Ue, emStrongRDelimAst: Je, emStrongRDelimUnd: et, link: k$1(/^!?\[(label)\]\((.*?)\)/).replace("label", G).getRegex(), reflink: k$1(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", G).getRegex() }, F = { ...V$1, emStrongRDelimAst: We, emStrongLDelim: je, delLDelim: tt, delRDelim: rt, url: k$1(/^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("protocol", ie).replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(), _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/, del: /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/, text: k$1(/^(`+|~+|[^`~])(?:(?=[`~])|(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/).replace("protocol", ie).getRegex() }, ct = { ...F, br: k$1(pe).replace("{2,}", "*").getRegex(), text: k$1(F.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex() }, H$1 = { normal: J, gfm: Ae, pedantic: Ie }, B$1 = { normal: V$1, gfm: F, breaks: ct, pedantic: ut };
var ht = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }, ge = (l4) => ht[l4];
function O(l4, e2) {
  if (e2) {
    if (m$1.escapeTest.test(l4)) return l4.replace(m$1.escapeReplace, ge);
  } else if (m$1.escapeTestNoEncode.test(l4)) return l4.replace(m$1.escapeReplaceNoEncode, ge);
  return l4;
}
function Y(l4) {
  try {
    l4 = encodeURI(l4).replace(m$1.percentDecode, "%");
  } catch {
    return null;
  }
  return l4;
}
function ee(l4, e2) {
  var _a2;
  let t2 = l4.replace(m$1.findPipe, (r2, i2, o2) => {
    let p2 = false, a2 = i2;
    for (; --a2 >= 0 && o2[a2] === "\\"; ) p2 = !p2;
    return p2 ? "|" : " |";
  }), n3 = t2.split(m$1.splitPipe), s2 = 0;
  if (n3[0].trim() || n3.shift(), n3.length > 0 && !((_a2 = n3.at(-1)) == null ? void 0 : _a2.trim()) && n3.pop(), e2) if (n3.length > e2) n3.splice(e2);
  else for (; n3.length < e2; ) n3.push("");
  for (; s2 < n3.length; s2++) n3[s2] = n3[s2].trim().replace(m$1.slashPipe, "|");
  return n3;
}
function $$2(l4, e2, t2) {
  let n3 = l4.length;
  if (n3 === 0) return "";
  let s2 = 0;
  for (; s2 < n3; ) {
    let r2 = l4.charAt(n3 - s2 - 1);
    if (r2 === e2 && true) s2++;
    else break;
  }
  return l4.slice(0, n3 - s2);
}
function te(l4) {
  let e2 = l4.split(`
`), t2 = e2.length - 1;
  for (; t2 >= 0 && m$1.blankLine.test(e2[t2]); ) t2--;
  return e2.length - t2 <= 2 ? l4 : e2.slice(0, t2 + 1).join(`
`);
}
function fe(l4, e2) {
  if (l4.indexOf(e2[1]) === -1) return -1;
  let t2 = 0;
  for (let n3 = 0; n3 < l4.length; n3++) if (l4[n3] === "\\") n3++;
  else if (l4[n3] === e2[0]) t2++;
  else if (l4[n3] === e2[1] && (t2--, t2 < 0)) return n3;
  return t2 > 0 ? -2 : -1;
}
function me(l4, e2 = 0) {
  let t2 = e2, n3 = "";
  for (let s2 of l4) if (s2 === "	") {
    let r2 = 4 - t2 % 4;
    n3 += " ".repeat(r2), t2 += r2;
  } else n3 += s2, t2++;
  return n3;
}
function xe(l4, e2, t2, n3, s2) {
  let r2 = e2.href, i2 = e2.title || null, o2 = l4[1].replace(s2.other.outputLinkReplace, "$1");
  n3.state.inLink = true;
  let p2 = { type: l4[0].charAt(0) === "!" ? "image" : "link", raw: t2, href: r2, title: i2, text: o2, tokens: n3.inlineTokens(o2) };
  return n3.state.inLink = false, p2;
}
function dt(l4, e2, t2) {
  let n3 = l4.match(t2.other.indentCodeCompensation);
  if (n3 === null) return e2;
  let s2 = n3[1];
  return e2.split(`
`).map((r2) => {
    let i2 = r2.match(t2.other.beginningSpace);
    if (i2 === null) return r2;
    let [o2] = i2;
    return o2.length >= s2.length ? r2.slice(s2.length) : r2;
  }).join(`
`);
}
var y$2 = class y {
  constructor(e2) {
    __publicField(this, "options");
    __publicField(this, "rules");
    __publicField(this, "lexer");
    this.options = e2 || R$1;
  }
  space(e2) {
    let t2 = this.rules.block.newline.exec(e2);
    if (t2 && t2[0].length > 0) return { type: "space", raw: t2[0] };
  }
  code(e2) {
    let t2 = this.rules.block.code.exec(e2);
    if (t2) {
      let n3 = this.options.pedantic ? t2[0] : te(t2[0]), s2 = n3.replace(this.rules.other.codeRemoveIndent, "");
      return { type: "code", raw: n3, codeBlockStyle: "indented", text: s2 };
    }
  }
  fences(e2) {
    let t2 = this.rules.block.fences.exec(e2);
    if (t2) {
      let n3 = t2[0], s2 = dt(n3, t2[3] || "", this.rules);
      return { type: "code", raw: n3, lang: t2[2] ? t2[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : t2[2], text: s2 };
    }
  }
  heading(e2) {
    let t2 = this.rules.block.heading.exec(e2);
    if (t2) {
      let n3 = t2[2].trim();
      if (this.rules.other.endingHash.test(n3)) {
        let s2 = $$2(n3, "#");
        (this.options.pedantic || !s2 || this.rules.other.endingSpaceChar.test(s2)) && (n3 = s2.trim());
      }
      return { type: "heading", raw: $$2(t2[0], `
`), depth: t2[1].length, text: n3, tokens: this.lexer.inline(n3) };
    }
  }
  hr(e2) {
    let t2 = this.rules.block.hr.exec(e2);
    if (t2) return { type: "hr", raw: $$2(t2[0], `
`) };
  }
  blockquote(e2) {
    let t2 = this.rules.block.blockquote.exec(e2);
    if (t2) {
      let n3 = $$2(t2[0], `
`).split(`
`), s2 = "", r2 = "", i2 = [];
      for (; n3.length > 0; ) {
        let o2 = false, p2 = [], a2;
        for (a2 = 0; a2 < n3.length; a2++) if (this.rules.other.blockquoteStart.test(n3[a2])) p2.push(n3[a2]), o2 = true;
        else if (!o2) p2.push(n3[a2]);
        else break;
        n3 = n3.slice(a2);
        let u2 = p2.join(`
`), c2 = u2.replace(this.rules.other.blockquoteSetextReplace, `
    $1`).replace(this.rules.other.blockquoteSetextReplace2, "");
        s2 = s2 ? `${s2}
${u2}` : u2, r2 = r2 ? `${r2}
${c2}` : c2;
        let h2 = this.lexer.state.top;
        if (this.lexer.state.top = true, this.lexer.blockTokens(c2, i2, true), this.lexer.state.top = h2, n3.length === 0) break;
        let d2 = i2.at(-1);
        if ((d2 == null ? void 0 : d2.type) === "code") break;
        if ((d2 == null ? void 0 : d2.type) === "blockquote") {
          let T = d2, g2 = n3.join(`
`), w = T.raw + `
` + g2.replace(this.rules.other.blockquoteSetextReplace2, ""), M2 = this.blockquote(w);
          i2[i2.length - 1] = M2, s2 = `${s2}
${g2}`, r2 = r2.substring(0, r2.length - T.text.length) + M2.text;
          break;
        } else if ((d2 == null ? void 0 : d2.type) === "list") {
          let T = d2, g2 = T.raw + `
` + n3.join(`
`), w = this.list(g2);
          i2[i2.length - 1] = w, s2 = s2.substring(0, s2.length - d2.raw.length) + w.raw, r2 = r2.substring(0, r2.length - T.raw.length) + w.raw, n3 = g2.substring(i2.at(-1).raw.length).split(`
`);
          continue;
        }
      }
      return { type: "blockquote", raw: s2, tokens: i2, text: r2 };
    }
  }
  list(e2) {
    let t2 = this.rules.block.list.exec(e2);
    if (t2) {
      let n3 = t2[1].trim(), s2 = n3.length > 1, r2 = { type: "list", raw: "", ordered: s2, start: s2 ? +n3.slice(0, -1) : "", loose: false, items: [] };
      n3 = s2 ? `\\d{1,9}\\${n3.slice(-1)}` : `\\${n3}`, this.options.pedantic && (n3 = s2 ? n3 : "[*+-]");
      let i2 = this.rules.other.listItemRegex(n3), o2 = false;
      for (; e2; ) {
        let a2 = false, u2 = "", c2 = "";
        if (!(t2 = i2.exec(e2)) || this.rules.block.hr.test(e2)) break;
        u2 = t2[0], e2 = e2.substring(u2.length);
        let h2 = me(t2[2].split(`
`, 1)[0], t2[1].length), d2 = e2.split(`
`, 1)[0], T = !h2.trim(), g2 = 0;
        if (this.options.pedantic ? (g2 = 2, c2 = h2.trimStart()) : T ? g2 = t2[1].length + 1 : (g2 = h2.search(this.rules.other.nonSpaceChar), g2 = g2 > 4 ? 1 : g2, c2 = h2.slice(g2), g2 += t2[1].length), T && this.rules.other.blankLine.test(d2) && (u2 += d2 + `
`, e2 = e2.substring(d2.length + 1), a2 = true), !a2) {
          let w = this.rules.other.nextBulletRegex(g2), M2 = this.rules.other.hrRegex(g2), ne = this.rules.other.fencesBeginRegex(g2), re = this.rules.other.headingBeginRegex(g2), be = this.rules.other.htmlBeginRegex(g2), Re = this.rules.other.blockquoteBeginRegex(g2);
          for (; e2; ) {
            let N2 = e2.split(`
`, 1)[0], D2;
            if (d2 = N2, this.options.pedantic ? (d2 = d2.replace(this.rules.other.listReplaceNesting, "  "), D2 = d2) : D2 = d2.replace(this.rules.other.tabCharGlobal, "    "), ne.test(d2) || re.test(d2) || be.test(d2) || Re.test(d2) || w.test(d2) || M2.test(d2)) break;
            if (D2.search(this.rules.other.nonSpaceChar) >= g2 || !d2.trim()) c2 += `
` + D2.slice(g2);
            else {
              if (T || h2.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4 || ne.test(h2) || re.test(h2) || M2.test(h2)) break;
              c2 += `
` + d2;
            }
            T = !d2.trim(), u2 += N2 + `
`, e2 = e2.substring(N2.length + 1), h2 = D2.slice(g2);
          }
        }
        r2.loose || (o2 ? r2.loose = true : this.rules.other.doubleBlankLine.test(u2) && (o2 = true)), r2.items.push({ type: "list_item", raw: u2, task: !!this.options.gfm && this.rules.other.listIsTask.test(c2), loose: false, text: c2, tokens: [] }), r2.raw += u2;
      }
      let p2 = r2.items.at(-1);
      if (p2) p2.raw = p2.raw.trimEnd(), p2.text = p2.text.trimEnd();
      else return;
      r2.raw = r2.raw.trimEnd();
      for (let a2 of r2.items) {
        this.lexer.state.top = false, a2.tokens = this.lexer.blockTokens(a2.text, []);
        let u2 = a2.tokens[0];
        if (a2.task && ((u2 == null ? void 0 : u2.type) === "text" || (u2 == null ? void 0 : u2.type) === "paragraph")) {
          a2.text = a2.text.replace(this.rules.other.listReplaceTask, ""), u2.raw = u2.raw.replace(this.rules.other.listReplaceTask, ""), u2.text = u2.text.replace(this.rules.other.listReplaceTask, "");
          for (let h2 = this.lexer.inlineQueue.length - 1; h2 >= 0; h2--) if (this.rules.other.listIsTask.test(this.lexer.inlineQueue[h2].src)) {
            this.lexer.inlineQueue[h2].src = this.lexer.inlineQueue[h2].src.replace(this.rules.other.listReplaceTask, "");
            break;
          }
          let c2 = this.rules.other.listTaskCheckbox.exec(a2.raw);
          if (c2) {
            let h2 = { type: "checkbox", raw: c2[0] + " ", checked: c2[0] !== "[ ]" };
            a2.checked = h2.checked, r2.loose ? a2.tokens[0] && ["paragraph", "text"].includes(a2.tokens[0].type) && "tokens" in a2.tokens[0] && a2.tokens[0].tokens ? (a2.tokens[0].raw = h2.raw + a2.tokens[0].raw, a2.tokens[0].text = h2.raw + a2.tokens[0].text, a2.tokens[0].tokens.unshift(h2)) : a2.tokens.unshift({ type: "paragraph", raw: h2.raw, text: h2.raw, tokens: [h2] }) : a2.tokens.unshift(h2);
          }
        } else a2.task && (a2.task = false);
        if (!r2.loose) {
          let c2 = a2.tokens.filter((d2) => d2.type === "space"), h2 = c2.length > 0 && c2.some((d2) => this.rules.other.anyLine.test(d2.raw));
          r2.loose = h2;
        }
      }
      if (r2.loose) for (let a2 of r2.items) {
        a2.loose = true;
        for (let u2 of a2.tokens) u2.type === "text" && (u2.type = "paragraph");
      }
      return r2;
    }
  }
  html(e2) {
    let t2 = this.rules.block.html.exec(e2);
    if (t2) {
      let n3 = te(t2[0]);
      return { type: "html", block: true, raw: n3, pre: t2[1] === "pre" || t2[1] === "script" || t2[1] === "style", text: n3 };
    }
  }
  def(e2) {
    let t2 = this.rules.block.def.exec(e2);
    if (t2) {
      let n3 = t2[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal, " "), s2 = t2[2] ? t2[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "", r2 = t2[3] ? t2[3].substring(1, t2[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : t2[3];
      return { type: "def", tag: n3, raw: $$2(t2[0], `
`), href: s2, title: r2 };
    }
  }
  table(e2) {
    var _a2;
    let t2 = this.rules.block.table.exec(e2);
    if (!t2 || !this.rules.other.tableDelimiter.test(t2[2])) return;
    let n3 = ee(t2[1]), s2 = t2[2].replace(this.rules.other.tableAlignChars, "").split("|"), r2 = ((_a2 = t2[3]) == null ? void 0 : _a2.trim()) ? t2[3].replace(this.rules.other.tableRowBlankLine, "").split(`
`) : [], i2 = { type: "table", raw: $$2(t2[0], `
`), header: [], align: [], rows: [] };
    if (n3.length === s2.length) {
      for (let o2 of s2) this.rules.other.tableAlignRight.test(o2) ? i2.align.push("right") : this.rules.other.tableAlignCenter.test(o2) ? i2.align.push("center") : this.rules.other.tableAlignLeft.test(o2) ? i2.align.push("left") : i2.align.push(null);
      for (let o2 = 0; o2 < n3.length; o2++) i2.header.push({ text: n3[o2], tokens: this.lexer.inline(n3[o2]), header: true, align: i2.align[o2] });
      for (let o2 of r2) i2.rows.push(ee(o2, i2.header.length).map((p2, a2) => ({ text: p2, tokens: this.lexer.inline(p2), header: false, align: i2.align[a2] })));
      return i2;
    }
  }
  lheading(e2) {
    let t2 = this.rules.block.lheading.exec(e2);
    if (t2) {
      let n3 = t2[1].trim();
      return { type: "heading", raw: $$2(t2[0], `
`), depth: t2[2].charAt(0) === "=" ? 1 : 2, text: n3, tokens: this.lexer.inline(n3) };
    }
  }
  paragraph(e2) {
    let t2 = this.rules.block.paragraph.exec(e2);
    if (t2) {
      let n3 = t2[1].charAt(t2[1].length - 1) === `
` ? t2[1].slice(0, -1) : t2[1];
      return { type: "paragraph", raw: t2[0], text: n3, tokens: this.lexer.inline(n3) };
    }
  }
  text(e2) {
    let t2 = this.rules.block.text.exec(e2);
    if (t2) return { type: "text", raw: t2[0], text: t2[0], tokens: this.lexer.inline(t2[0]) };
  }
  escape(e2) {
    let t2 = this.rules.inline.escape.exec(e2);
    if (t2) return { type: "escape", raw: t2[0], text: t2[1] };
  }
  tag(e2) {
    let t2 = this.rules.inline.tag.exec(e2);
    if (t2) return !this.lexer.state.inLink && this.rules.other.startATag.test(t2[0]) ? this.lexer.state.inLink = true : this.lexer.state.inLink && this.rules.other.endATag.test(t2[0]) && (this.lexer.state.inLink = false), !this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(t2[0]) ? this.lexer.state.inRawBlock = true : this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(t2[0]) && (this.lexer.state.inRawBlock = false), { type: "html", raw: t2[0], inLink: this.lexer.state.inLink, inRawBlock: this.lexer.state.inRawBlock, block: false, text: t2[0] };
  }
  link(e2) {
    let t2 = this.rules.inline.link.exec(e2);
    if (t2) {
      let n3 = t2[2].trim();
      if (!this.options.pedantic && this.rules.other.startAngleBracket.test(n3)) {
        if (!this.rules.other.endAngleBracket.test(n3)) return;
        let i2 = $$2(n3.slice(0, -1), "\\");
        if ((n3.length - i2.length) % 2 === 0) return;
      } else {
        let i2 = fe(t2[2], "()");
        if (i2 === -2) return;
        if (i2 > -1) {
          let p2 = (t2[0].indexOf("!") === 0 ? 5 : 4) + t2[1].length + i2;
          t2[2] = t2[2].substring(0, i2), t2[0] = t2[0].substring(0, p2).trim(), t2[3] = "";
        }
      }
      let s2 = t2[2], r2 = "";
      if (this.options.pedantic) {
        let i2 = this.rules.other.pedanticHrefTitle.exec(s2);
        i2 && (s2 = i2[1], r2 = i2[3]);
      } else r2 = t2[3] ? t2[3].slice(1, -1) : "";
      return s2 = s2.trim(), this.rules.other.startAngleBracket.test(s2) && (this.options.pedantic && !this.rules.other.endAngleBracket.test(n3) ? s2 = s2.slice(1) : s2 = s2.slice(1, -1)), xe(t2, { href: s2 && s2.replace(this.rules.inline.anyPunctuation, "$1"), title: r2 && r2.replace(this.rules.inline.anyPunctuation, "$1") }, t2[0], this.lexer, this.rules);
    }
  }
  reflink(e2, t2) {
    let n3;
    if ((n3 = this.rules.inline.reflink.exec(e2)) || (n3 = this.rules.inline.nolink.exec(e2))) {
      let s2 = (n3[2] || n3[1]).replace(this.rules.other.multipleSpaceGlobal, " "), r2 = t2[s2.toLowerCase()];
      if (!r2) {
        let i2 = n3[0].charAt(0);
        return { type: "text", raw: i2, text: i2 };
      }
      return xe(n3, r2, n3[0], this.lexer, this.rules);
    }
  }
  emStrong(e2, t2, n3 = "") {
    let s2 = this.rules.inline.emStrongLDelim.exec(e2);
    if (!s2 || !s2[1] && !s2[2] && !s2[3] && !s2[4] || s2[4] && n3.match(this.rules.other.unicodeAlphaNumeric)) return;
    if (!(s2[1] || s2[3] || "") || !n3 || this.rules.inline.punctuation.exec(n3)) {
      let i2 = [...s2[0]].length - 1, o2, p2, a2 = i2, u2 = 0, c2 = s2[0][0], h2 = n3 === c2, d2 = c2 === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
      for (d2.lastIndex = 0, t2 = t2.slice(-1 * e2.length + i2); (s2 = d2.exec(t2)) !== null; ) {
        if (o2 = s2[1] || s2[2] || s2[3] || s2[4] || s2[5] || s2[6], !o2) continue;
        if (p2 = [...o2].length, s2[3] || s2[4]) {
          a2 += p2;
          continue;
        } else if (s2[5] || s2[6]) {
          if (i2 % 3 && !((i2 + p2) % 3)) {
            u2 += p2;
            continue;
          }
          if (h2) break;
        }
        if (a2 -= p2, a2 > 0) continue;
        p2 = Math.min(p2, p2 + a2 + u2);
        let T = [...s2[0]][0].length, g2 = e2.slice(0, i2 + s2.index + T + p2);
        if (Math.min(i2, p2) % 2) {
          let M2 = g2.slice(1, -1);
          return { type: "em", raw: g2, text: M2, tokens: this.lexer.inlineTokens(M2) };
        }
        let w = g2.slice(2, -2);
        return { type: "strong", raw: g2, text: w, tokens: this.lexer.inlineTokens(w) };
      }
    }
  }
  codespan(e2) {
    let t2 = this.rules.inline.code.exec(e2);
    if (t2) {
      let n3 = t2[2].replace(this.rules.other.newLineCharGlobal, " "), s2 = this.rules.other.nonSpaceChar.test(n3), r2 = this.rules.other.startingSpaceChar.test(n3) && this.rules.other.endingSpaceChar.test(n3);
      return s2 && r2 && (n3 = n3.substring(1, n3.length - 1)), { type: "codespan", raw: t2[0], text: n3 };
    }
  }
  br(e2) {
    let t2 = this.rules.inline.br.exec(e2);
    if (t2) return { type: "br", raw: t2[0] };
  }
  del(e2, t2, n3 = "") {
    let s2 = this.rules.inline.delLDelim.exec(e2);
    if (!s2) return;
    if (!(s2[1] || "") || !n3 || this.rules.inline.punctuation.exec(n3)) {
      let i2 = [...s2[0]].length - 1, o2, p2, a2 = i2, u2 = this.rules.inline.delRDelim;
      for (u2.lastIndex = 0, t2 = t2.slice(-1 * e2.length + i2); (s2 = u2.exec(t2)) !== null; ) {
        if (o2 = s2[1] || s2[2] || s2[3] || s2[4] || s2[5] || s2[6], !o2 || (p2 = [...o2].length, p2 !== i2)) continue;
        if (s2[3] || s2[4]) {
          a2 += p2;
          continue;
        }
        if (a2 -= p2, a2 > 0) continue;
        p2 = Math.min(p2, p2 + a2);
        let c2 = [...s2[0]][0].length, h2 = e2.slice(0, i2 + s2.index + c2 + p2), d2 = h2.slice(i2, -i2);
        return { type: "del", raw: h2, text: d2, tokens: this.lexer.inlineTokens(d2) };
      }
    }
  }
  autolink(e2) {
    let t2 = this.rules.inline.autolink.exec(e2);
    if (t2) {
      let n3, s2;
      return t2[2] === "@" ? (n3 = t2[1], s2 = "mailto:" + n3) : (n3 = t2[1], s2 = n3), { type: "link", raw: t2[0], text: n3, href: s2, tokens: [{ type: "text", raw: n3, text: n3 }] };
    }
  }
  url(e2) {
    var _a2;
    let t2;
    if (t2 = this.rules.inline.url.exec(e2)) {
      let n3, s2;
      if (t2[2] === "@") n3 = t2[0], s2 = "mailto:" + n3;
      else {
        let r2;
        do
          r2 = t2[0], t2[0] = ((_a2 = this.rules.inline._backpedal.exec(t2[0])) == null ? void 0 : _a2[0]) ?? "";
        while (r2 !== t2[0]);
        n3 = t2[0], t2[1] === "www." ? s2 = "http://" + t2[0] : s2 = t2[0];
      }
      return { type: "link", raw: t2[0], text: n3, href: s2, tokens: [{ type: "text", raw: n3, text: n3 }] };
    }
  }
  inlineText(e2) {
    let t2 = this.rules.inline.text.exec(e2);
    if (t2) {
      let n3 = this.lexer.state.inRawBlock;
      return { type: "text", raw: t2[0], text: t2[0], escaped: n3 };
    }
  }
};
var x = class l {
  constructor(e2) {
    __publicField(this, "tokens");
    __publicField(this, "options");
    __publicField(this, "state");
    __publicField(this, "inlineQueue");
    __publicField(this, "tokenizer");
    this.tokens = [], this.tokens.links = /* @__PURE__ */ Object.create(null), this.options = e2 || R$1, this.options.tokenizer = this.options.tokenizer || new y$2(), this.tokenizer = this.options.tokenizer, this.tokenizer.options = this.options, this.tokenizer.lexer = this, this.inlineQueue = [], this.state = { inLink: false, inRawBlock: false, top: true };
    let t2 = { other: m$1, block: H$1.normal, inline: B$1.normal };
    this.options.pedantic ? (t2.block = H$1.pedantic, t2.inline = B$1.pedantic) : this.options.gfm && (t2.block = H$1.gfm, this.options.breaks ? t2.inline = B$1.breaks : t2.inline = B$1.gfm), this.tokenizer.rules = t2;
  }
  static get rules() {
    return { block: H$1, inline: B$1 };
  }
  static lex(e2, t2) {
    return new l(t2).lex(e2);
  }
  static lexInline(e2, t2) {
    return new l(t2).inlineTokens(e2);
  }
  lex(e2) {
    e2 = e2.replace(m$1.carriageReturn, `
`), this.blockTokens(e2, this.tokens);
    for (let t2 = 0; t2 < this.inlineQueue.length; t2++) {
      let n3 = this.inlineQueue[t2];
      this.inlineTokens(n3.src, n3.tokens);
    }
    return this.inlineQueue = [], this.tokens;
  }
  blockTokens(e2, t2 = [], n3 = false) {
    var _a2, _b2, _c;
    this.tokenizer.lexer = this, this.options.pedantic && (e2 = e2.replace(m$1.tabCharGlobal, "    ").replace(m$1.spaceLine, ""));
    let s2 = 1 / 0;
    for (; e2; ) {
      if (e2.length < s2) s2 = e2.length;
      else {
        this.infiniteLoopError(e2.charCodeAt(0));
        break;
      }
      let r2;
      if ((_b2 = (_a2 = this.options.extensions) == null ? void 0 : _a2.block) == null ? void 0 : _b2.some((o2) => (r2 = o2.call({ lexer: this }, e2, t2)) ? (e2 = e2.substring(r2.raw.length), t2.push(r2), true) : false)) continue;
      if (r2 = this.tokenizer.space(e2)) {
        e2 = e2.substring(r2.raw.length);
        let o2 = t2.at(-1);
        r2.raw.length === 1 && o2 !== void 0 ? o2.raw += `
` : t2.push(r2);
        continue;
      }
      if (r2 = this.tokenizer.code(e2)) {
        e2 = e2.substring(r2.raw.length);
        let o2 = t2.at(-1);
        (o2 == null ? void 0 : o2.type) === "paragraph" || (o2 == null ? void 0 : o2.type) === "text" ? (o2.raw += (o2.raw.endsWith(`
`) ? "" : `
`) + r2.raw, o2.text += `
` + r2.text, this.inlineQueue.at(-1).src = o2.text) : t2.push(r2);
        continue;
      }
      if (r2 = this.tokenizer.fences(e2)) {
        e2 = e2.substring(r2.raw.length), t2.push(r2);
        continue;
      }
      if (r2 = this.tokenizer.heading(e2)) {
        e2 = e2.substring(r2.raw.length), t2.push(r2);
        continue;
      }
      if (r2 = this.tokenizer.hr(e2)) {
        e2 = e2.substring(r2.raw.length), t2.push(r2);
        continue;
      }
      if (r2 = this.tokenizer.blockquote(e2)) {
        e2 = e2.substring(r2.raw.length), t2.push(r2);
        continue;
      }
      if (r2 = this.tokenizer.list(e2)) {
        e2 = e2.substring(r2.raw.length), t2.push(r2);
        continue;
      }
      if (r2 = this.tokenizer.html(e2)) {
        e2 = e2.substring(r2.raw.length), t2.push(r2);
        continue;
      }
      if (r2 = this.tokenizer.def(e2)) {
        e2 = e2.substring(r2.raw.length);
        let o2 = t2.at(-1);
        (o2 == null ? void 0 : o2.type) === "paragraph" || (o2 == null ? void 0 : o2.type) === "text" ? (o2.raw += (o2.raw.endsWith(`
`) ? "" : `
`) + r2.raw, o2.text += `
` + r2.raw, this.inlineQueue.at(-1).src = o2.text) : this.tokens.links[r2.tag] || (this.tokens.links[r2.tag] = { href: r2.href, title: r2.title }, t2.push(r2));
        continue;
      }
      if (r2 = this.tokenizer.table(e2)) {
        e2 = e2.substring(r2.raw.length), t2.push(r2);
        continue;
      }
      if (r2 = this.tokenizer.lheading(e2)) {
        e2 = e2.substring(r2.raw.length), t2.push(r2);
        continue;
      }
      let i2 = e2;
      if ((_c = this.options.extensions) == null ? void 0 : _c.startBlock) {
        let o2 = 1 / 0, p2 = e2.slice(1), a2;
        this.options.extensions.startBlock.forEach((u2) => {
          a2 = u2.call({ lexer: this }, p2), typeof a2 == "number" && a2 >= 0 && (o2 = Math.min(o2, a2));
        }), o2 < 1 / 0 && o2 >= 0 && (i2 = e2.substring(0, o2 + 1));
      }
      if (this.state.top && (r2 = this.tokenizer.paragraph(i2))) {
        let o2 = t2.at(-1);
        n3 && (o2 == null ? void 0 : o2.type) === "paragraph" ? (o2.raw += (o2.raw.endsWith(`
`) ? "" : `
`) + r2.raw, o2.text += `
` + r2.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = o2.text) : t2.push(r2), n3 = i2.length !== e2.length, e2 = e2.substring(r2.raw.length);
        continue;
      }
      if (r2 = this.tokenizer.text(e2)) {
        e2 = e2.substring(r2.raw.length);
        let o2 = t2.at(-1);
        (o2 == null ? void 0 : o2.type) === "text" ? (o2.raw += (o2.raw.endsWith(`
`) ? "" : `
`) + r2.raw, o2.text += `
` + r2.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = o2.text) : t2.push(r2);
        continue;
      }
      if (e2) {
        this.infiniteLoopError(e2.charCodeAt(0));
        break;
      }
    }
    return this.state.top = true, t2;
  }
  inline(e2, t2 = []) {
    return this.inlineQueue.push({ src: e2, tokens: t2 }), t2;
  }
  inlineTokens(e2, t2 = []) {
    var _a2, _b2, _c, _d, _e2;
    this.tokenizer.lexer = this;
    let n3 = e2;
    if (this.tokens.links) {
      let o2 = Object.keys(this.tokens.links);
      o2.length > 0 && (n3 = n3.replace(this.tokenizer.rules.inline.reflinkSearch, (p2) => o2.includes(p2.slice(p2.lastIndexOf("[") + 1, -1)) ? "[" + "a".repeat(p2.length - 2) + "]" : p2));
    }
    n3 = n3.replace(this.tokenizer.rules.inline.anyPunctuation, "++"), n3 = n3.replace(this.tokenizer.rules.inline.blockSkip, (o2, p2, a2) => {
      let u2 = a2 ? a2.length : 0;
      return o2.slice(0, u2) + "[" + "a".repeat(o2.length - u2 - 2) + "]";
    }), n3 = ((_b2 = (_a2 = this.options.hooks) == null ? void 0 : _a2.emStrongMask) == null ? void 0 : _b2.call({ lexer: this }, n3)) ?? n3;
    let s2 = false, r2 = "", i2 = 1 / 0;
    for (; e2; ) {
      if (e2.length < i2) i2 = e2.length;
      else {
        this.infiniteLoopError(e2.charCodeAt(0));
        break;
      }
      s2 || (r2 = ""), s2 = false;
      let o2;
      if ((_d = (_c = this.options.extensions) == null ? void 0 : _c.inline) == null ? void 0 : _d.some((a2) => (o2 = a2.call({ lexer: this }, e2, t2)) ? (e2 = e2.substring(o2.raw.length), t2.push(o2), true) : false)) continue;
      if (o2 = this.tokenizer.escape(e2)) {
        e2 = e2.substring(o2.raw.length), t2.push(o2);
        continue;
      }
      if (o2 = this.tokenizer.tag(e2)) {
        e2 = e2.substring(o2.raw.length), t2.push(o2);
        continue;
      }
      if (o2 = this.tokenizer.link(e2)) {
        e2 = e2.substring(o2.raw.length), t2.push(o2);
        continue;
      }
      if (o2 = this.tokenizer.reflink(e2, this.tokens.links)) {
        e2 = e2.substring(o2.raw.length);
        let a2 = t2.at(-1);
        o2.type === "text" && (a2 == null ? void 0 : a2.type) === "text" ? (a2.raw += o2.raw, a2.text += o2.text) : t2.push(o2);
        continue;
      }
      if (o2 = this.tokenizer.emStrong(e2, n3, r2)) {
        e2 = e2.substring(o2.raw.length), t2.push(o2);
        continue;
      }
      if (o2 = this.tokenizer.codespan(e2)) {
        e2 = e2.substring(o2.raw.length), t2.push(o2);
        continue;
      }
      if (o2 = this.tokenizer.br(e2)) {
        e2 = e2.substring(o2.raw.length), t2.push(o2);
        continue;
      }
      if (o2 = this.tokenizer.del(e2, n3, r2)) {
        e2 = e2.substring(o2.raw.length), t2.push(o2);
        continue;
      }
      if (o2 = this.tokenizer.autolink(e2)) {
        e2 = e2.substring(o2.raw.length), t2.push(o2);
        continue;
      }
      if (!this.state.inLink && (o2 = this.tokenizer.url(e2))) {
        e2 = e2.substring(o2.raw.length), t2.push(o2);
        continue;
      }
      let p2 = e2;
      if ((_e2 = this.options.extensions) == null ? void 0 : _e2.startInline) {
        let a2 = 1 / 0, u2 = e2.slice(1), c2;
        this.options.extensions.startInline.forEach((h2) => {
          c2 = h2.call({ lexer: this }, u2), typeof c2 == "number" && c2 >= 0 && (a2 = Math.min(a2, c2));
        }), a2 < 1 / 0 && a2 >= 0 && (p2 = e2.substring(0, a2 + 1));
      }
      if (o2 = this.tokenizer.inlineText(p2)) {
        e2 = e2.substring(o2.raw.length), o2.raw.slice(-1) !== "_" && (r2 = o2.raw.slice(-1)), s2 = true;
        let a2 = t2.at(-1);
        (a2 == null ? void 0 : a2.type) === "text" ? (a2.raw += o2.raw, a2.text += o2.text) : t2.push(o2);
        continue;
      }
      if (e2) {
        this.infiniteLoopError(e2.charCodeAt(0));
        break;
      }
    }
    return t2;
  }
  infiniteLoopError(e2) {
    let t2 = "Infinite loop on byte: " + e2;
    if (this.options.silent) console.error(t2);
    else throw new Error(t2);
  }
};
var P$1 = class P {
  constructor(e2) {
    __publicField(this, "options");
    __publicField(this, "parser");
    this.options = e2 || R$1;
  }
  space(e2) {
    return "";
  }
  code({ text: e2, lang: t2, escaped: n3 }) {
    var _a2;
    let s2 = (_a2 = (t2 || "").match(m$1.notSpaceStart)) == null ? void 0 : _a2[0], r2 = e2.replace(m$1.endingNewline, "") + `
`;
    return s2 ? '<pre><code class="language-' + O(s2) + '">' + (n3 ? r2 : O(r2, true)) + `</code></pre>
` : "<pre><code>" + (n3 ? r2 : O(r2, true)) + `</code></pre>
`;
  }
  blockquote({ tokens: e2 }) {
    return `<blockquote>
${this.parser.parse(e2)}</blockquote>
`;
  }
  html({ text: e2 }) {
    return e2;
  }
  def(e2) {
    return "";
  }
  heading({ tokens: e2, depth: t2 }) {
    return `<h${t2}>${this.parser.parseInline(e2)}</h${t2}>
`;
  }
  hr(e2) {
    return `<hr>
`;
  }
  list(e2) {
    let t2 = e2.ordered, n3 = e2.start, s2 = "";
    for (let o2 = 0; o2 < e2.items.length; o2++) {
      let p2 = e2.items[o2];
      s2 += this.listitem(p2);
    }
    let r2 = t2 ? "ol" : "ul", i2 = t2 && n3 !== 1 ? ' start="' + n3 + '"' : "";
    return "<" + r2 + i2 + `>
` + s2 + "</" + r2 + `>
`;
  }
  listitem(e2) {
    return `<li>${this.parser.parse(e2.tokens)}</li>
`;
  }
  checkbox({ checked: e2 }) {
    return "<input " + (e2 ? 'checked="" ' : "") + 'disabled="" type="checkbox"> ';
  }
  paragraph({ tokens: e2 }) {
    return `<p>${this.parser.parseInline(e2)}</p>
`;
  }
  table(e2) {
    let t2 = "", n3 = "";
    for (let r2 = 0; r2 < e2.header.length; r2++) n3 += this.tablecell(e2.header[r2]);
    t2 += this.tablerow({ text: n3 });
    let s2 = "";
    for (let r2 = 0; r2 < e2.rows.length; r2++) {
      let i2 = e2.rows[r2];
      n3 = "";
      for (let o2 = 0; o2 < i2.length; o2++) n3 += this.tablecell(i2[o2]);
      s2 += this.tablerow({ text: n3 });
    }
    return s2 && (s2 = `<tbody>${s2}</tbody>`), `<table>
<thead>
` + t2 + `</thead>
` + s2 + `</table>
`;
  }
  tablerow({ text: e2 }) {
    return `<tr>
${e2}</tr>
`;
  }
  tablecell(e2) {
    let t2 = this.parser.parseInline(e2.tokens), n3 = e2.header ? "th" : "td";
    return (e2.align ? `<${n3} align="${e2.align}">` : `<${n3}>`) + t2 + `</${n3}>
`;
  }
  strong({ tokens: e2 }) {
    return `<strong>${this.parser.parseInline(e2)}</strong>`;
  }
  em({ tokens: e2 }) {
    return `<em>${this.parser.parseInline(e2)}</em>`;
  }
  codespan({ text: e2 }) {
    return `<code>${O(e2, true)}</code>`;
  }
  br(e2) {
    return "<br>";
  }
  del({ tokens: e2 }) {
    return `<del>${this.parser.parseInline(e2)}</del>`;
  }
  link({ href: e2, title: t2, tokens: n3 }) {
    let s2 = this.parser.parseInline(n3), r2 = Y(e2);
    if (r2 === null) return s2;
    e2 = r2;
    let i2 = '<a href="' + e2 + '"';
    return t2 && (i2 += ' title="' + O(t2) + '"'), i2 += ">" + s2 + "</a>", i2;
  }
  image({ href: e2, title: t2, text: n3, tokens: s2 }) {
    s2 && (n3 = this.parser.parseInline(s2, this.parser.textRenderer));
    let r2 = Y(e2);
    if (r2 === null) return O(n3);
    e2 = r2;
    let i2 = `<img src="${e2}" alt="${O(n3)}"`;
    return t2 && (i2 += ` title="${O(t2)}"`), i2 += ">", i2;
  }
  text(e2) {
    return "tokens" in e2 && e2.tokens ? this.parser.parseInline(e2.tokens) : "escaped" in e2 && e2.escaped ? e2.text : O(e2.text);
  }
};
var L$1 = class L {
  strong({ text: e2 }) {
    return e2;
  }
  em({ text: e2 }) {
    return e2;
  }
  codespan({ text: e2 }) {
    return e2;
  }
  del({ text: e2 }) {
    return e2;
  }
  html({ text: e2 }) {
    return e2;
  }
  text({ text: e2 }) {
    return e2;
  }
  link({ text: e2 }) {
    return "" + e2;
  }
  image({ text: e2 }) {
    return "" + e2;
  }
  br() {
    return "";
  }
  checkbox({ raw: e2 }) {
    return e2;
  }
};
var b$1 = class l2 {
  constructor(e2) {
    __publicField(this, "options");
    __publicField(this, "renderer");
    __publicField(this, "textRenderer");
    this.options = e2 || R$1, this.options.renderer = this.options.renderer || new P$1(), this.renderer = this.options.renderer, this.renderer.options = this.options, this.renderer.parser = this, this.textRenderer = new L$1();
  }
  static parse(e2, t2) {
    return new l2(t2).parse(e2);
  }
  static parseInline(e2, t2) {
    return new l2(t2).parseInline(e2);
  }
  parse(e2) {
    var _a2, _b2;
    this.renderer.parser = this;
    let t2 = "";
    for (let n3 = 0; n3 < e2.length; n3++) {
      let s2 = e2[n3];
      if ((_b2 = (_a2 = this.options.extensions) == null ? void 0 : _a2.renderers) == null ? void 0 : _b2[s2.type]) {
        let i2 = s2, o2 = this.options.extensions.renderers[i2.type].call({ parser: this }, i2);
        if (o2 !== false || !["space", "hr", "heading", "code", "table", "blockquote", "list", "checkbox", "html", "def", "paragraph", "text"].includes(i2.type)) {
          t2 += o2 || "";
          continue;
        }
      }
      let r2 = s2;
      switch (r2.type) {
        case "space": {
          t2 += this.renderer.space(r2);
          break;
        }
        case "hr": {
          t2 += this.renderer.hr(r2);
          break;
        }
        case "heading": {
          t2 += this.renderer.heading(r2);
          break;
        }
        case "code": {
          t2 += this.renderer.code(r2);
          break;
        }
        case "table": {
          t2 += this.renderer.table(r2);
          break;
        }
        case "blockquote": {
          t2 += this.renderer.blockquote(r2);
          break;
        }
        case "list": {
          t2 += this.renderer.list(r2);
          break;
        }
        case "checkbox": {
          t2 += this.renderer.checkbox(r2);
          break;
        }
        case "html": {
          t2 += this.renderer.html(r2);
          break;
        }
        case "def": {
          t2 += this.renderer.def(r2);
          break;
        }
        case "paragraph": {
          t2 += this.renderer.paragraph(r2);
          break;
        }
        case "text": {
          t2 += this.renderer.text(r2);
          break;
        }
        default: {
          let i2 = 'Token with "' + r2.type + '" type was not found.';
          if (this.options.silent) return console.error(i2), "";
          throw new Error(i2);
        }
      }
    }
    return t2;
  }
  parseInline(e2, t2 = this.renderer) {
    var _a2, _b2;
    this.renderer.parser = this;
    let n3 = "";
    for (let s2 = 0; s2 < e2.length; s2++) {
      let r2 = e2[s2];
      if ((_b2 = (_a2 = this.options.extensions) == null ? void 0 : _a2.renderers) == null ? void 0 : _b2[r2.type]) {
        let o2 = this.options.extensions.renderers[r2.type].call({ parser: this }, r2);
        if (o2 !== false || !["escape", "html", "link", "image", "checkbox", "strong", "em", "codespan", "br", "del", "text"].includes(r2.type)) {
          n3 += o2 || "";
          continue;
        }
      }
      let i2 = r2;
      switch (i2.type) {
        case "escape": {
          n3 += t2.text(i2);
          break;
        }
        case "html": {
          n3 += t2.html(i2);
          break;
        }
        case "link": {
          n3 += t2.link(i2);
          break;
        }
        case "image": {
          n3 += t2.image(i2);
          break;
        }
        case "checkbox": {
          n3 += t2.checkbox(i2);
          break;
        }
        case "strong": {
          n3 += t2.strong(i2);
          break;
        }
        case "em": {
          n3 += t2.em(i2);
          break;
        }
        case "codespan": {
          n3 += t2.codespan(i2);
          break;
        }
        case "br": {
          n3 += t2.br(i2);
          break;
        }
        case "del": {
          n3 += t2.del(i2);
          break;
        }
        case "text": {
          n3 += t2.text(i2);
          break;
        }
        default: {
          let o2 = 'Token with "' + i2.type + '" type was not found.';
          if (this.options.silent) return console.error(o2), "";
          throw new Error(o2);
        }
      }
    }
    return n3;
  }
};
var S$2 = (_a = class {
  constructor(e2) {
    __publicField(this, "options");
    __publicField(this, "block");
    this.options = e2 || R$1;
  }
  preprocess(e2) {
    return e2;
  }
  postprocess(e2) {
    return e2;
  }
  processAllTokens(e2) {
    return e2;
  }
  emStrongMask(e2) {
    return e2;
  }
  provideLexer(e2 = this.block) {
    return e2 ? x.lex : x.lexInline;
  }
  provideParser(e2 = this.block) {
    return e2 ? b$1.parse : b$1.parseInline;
  }
}, __publicField(_a, "passThroughHooks", /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens", "emStrongMask"])), __publicField(_a, "passThroughHooksRespectAsync", /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens"])), _a);
var Z$1 = class Z {
  constructor(...e2) {
    __publicField(this, "defaults", C$1());
    __publicField(this, "options", this.setOptions);
    __publicField(this, "parse", this.parseMarkdown(true));
    __publicField(this, "parseInline", this.parseMarkdown(false));
    __publicField(this, "Parser", b$1);
    __publicField(this, "Renderer", P$1);
    __publicField(this, "TextRenderer", L$1);
    __publicField(this, "Lexer", x);
    __publicField(this, "Tokenizer", y$2);
    __publicField(this, "Hooks", S$2);
    this.use(...e2);
  }
  walkTokens(e2, t2) {
    var _a2, _b2;
    let n3 = [];
    for (let s2 of e2) switch (n3 = n3.concat(t2.call(this, s2)), s2.type) {
      case "table": {
        let r2 = s2;
        for (let i2 of r2.header) n3 = n3.concat(this.walkTokens(i2.tokens, t2));
        for (let i2 of r2.rows) for (let o2 of i2) n3 = n3.concat(this.walkTokens(o2.tokens, t2));
        break;
      }
      case "list": {
        let r2 = s2;
        n3 = n3.concat(this.walkTokens(r2.items, t2));
        break;
      }
      default: {
        let r2 = s2;
        ((_b2 = (_a2 = this.defaults.extensions) == null ? void 0 : _a2.childTokens) == null ? void 0 : _b2[r2.type]) ? this.defaults.extensions.childTokens[r2.type].forEach((i2) => {
          let o2 = r2[i2].flat(1 / 0);
          n3 = n3.concat(this.walkTokens(o2, t2));
        }) : r2.tokens && (n3 = n3.concat(this.walkTokens(r2.tokens, t2)));
      }
    }
    return n3;
  }
  use(...e2) {
    let t2 = this.defaults.extensions || { renderers: {}, childTokens: {} };
    return e2.forEach((n3) => {
      let s2 = { ...n3 };
      if (s2.async = this.defaults.async || s2.async || false, n3.extensions && (n3.extensions.forEach((r2) => {
        if (!r2.name) throw new Error("extension name required");
        if ("renderer" in r2) {
          let i2 = t2.renderers[r2.name];
          i2 ? t2.renderers[r2.name] = function(...o2) {
            let p2 = r2.renderer.apply(this, o2);
            return p2 === false && (p2 = i2.apply(this, o2)), p2;
          } : t2.renderers[r2.name] = r2.renderer;
        }
        if ("tokenizer" in r2) {
          if (!r2.level || r2.level !== "block" && r2.level !== "inline") throw new Error("extension level must be 'block' or 'inline'");
          let i2 = t2[r2.level];
          i2 ? i2.unshift(r2.tokenizer) : t2[r2.level] = [r2.tokenizer], r2.start && (r2.level === "block" ? t2.startBlock ? t2.startBlock.push(r2.start) : t2.startBlock = [r2.start] : r2.level === "inline" && (t2.startInline ? t2.startInline.push(r2.start) : t2.startInline = [r2.start]));
        }
        "childTokens" in r2 && r2.childTokens && (t2.childTokens[r2.name] = r2.childTokens);
      }), s2.extensions = t2), n3.renderer) {
        let r2 = this.defaults.renderer || new P$1(this.defaults);
        for (let i2 in n3.renderer) {
          if (!(i2 in r2)) throw new Error(`renderer '${i2}' does not exist`);
          if (["options", "parser"].includes(i2)) continue;
          let o2 = i2, p2 = n3.renderer[o2], a2 = r2[o2];
          r2[o2] = (...u2) => {
            let c2 = p2.apply(r2, u2);
            return c2 === false && (c2 = a2.apply(r2, u2)), c2 || "";
          };
        }
        s2.renderer = r2;
      }
      if (n3.tokenizer) {
        let r2 = this.defaults.tokenizer || new y$2(this.defaults);
        for (let i2 in n3.tokenizer) {
          if (!(i2 in r2)) throw new Error(`tokenizer '${i2}' does not exist`);
          if (["options", "rules", "lexer"].includes(i2)) continue;
          let o2 = i2, p2 = n3.tokenizer[o2], a2 = r2[o2];
          r2[o2] = (...u2) => {
            let c2 = p2.apply(r2, u2);
            return c2 === false && (c2 = a2.apply(r2, u2)), c2;
          };
        }
        s2.tokenizer = r2;
      }
      if (n3.hooks) {
        let r2 = this.defaults.hooks || new S$2();
        for (let i2 in n3.hooks) {
          if (!(i2 in r2)) throw new Error(`hook '${i2}' does not exist`);
          if (["options", "block"].includes(i2)) continue;
          let o2 = i2, p2 = n3.hooks[o2], a2 = r2[o2];
          S$2.passThroughHooks.has(i2) ? r2[o2] = (u2) => {
            if (this.defaults.async && S$2.passThroughHooksRespectAsync.has(i2)) return (async () => {
              let h2 = await p2.call(r2, u2);
              return a2.call(r2, h2);
            })();
            let c2 = p2.call(r2, u2);
            return a2.call(r2, c2);
          } : r2[o2] = (...u2) => {
            if (this.defaults.async) return (async () => {
              let h2 = await p2.apply(r2, u2);
              return h2 === false && (h2 = await a2.apply(r2, u2)), h2;
            })();
            let c2 = p2.apply(r2, u2);
            return c2 === false && (c2 = a2.apply(r2, u2)), c2;
          };
        }
        s2.hooks = r2;
      }
      if (n3.walkTokens) {
        let r2 = this.defaults.walkTokens, i2 = n3.walkTokens;
        s2.walkTokens = function(o2) {
          let p2 = [];
          return p2.push(i2.call(this, o2)), r2 && (p2 = p2.concat(r2.call(this, o2))), p2;
        };
      }
      this.defaults = { ...this.defaults, ...s2 };
    }), this;
  }
  setOptions(e2) {
    return this.defaults = { ...this.defaults, ...e2 }, this;
  }
  lexer(e2, t2) {
    return x.lex(e2, t2 ?? this.defaults);
  }
  parser(e2, t2) {
    return b$1.parse(e2, t2 ?? this.defaults);
  }
  parseMarkdown(e2) {
    return (n3, s2) => {
      let r2 = { ...s2 }, i2 = { ...this.defaults, ...r2 }, o2 = this.onError(!!i2.silent, !!i2.async);
      if (this.defaults.async === true && r2.async === false) return o2(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
      if (typeof n3 > "u" || n3 === null) return o2(new Error("marked(): input parameter is undefined or null"));
      if (typeof n3 != "string") return o2(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(n3) + ", string expected"));
      if (i2.hooks && (i2.hooks.options = i2, i2.hooks.block = e2), i2.async) return (async () => {
        let p2 = i2.hooks ? await i2.hooks.preprocess(n3) : n3, u2 = await (i2.hooks ? await i2.hooks.provideLexer(e2) : e2 ? x.lex : x.lexInline)(p2, i2), c2 = i2.hooks ? await i2.hooks.processAllTokens(u2) : u2;
        i2.walkTokens && await Promise.all(this.walkTokens(c2, i2.walkTokens));
        let d2 = await (i2.hooks ? await i2.hooks.provideParser(e2) : e2 ? b$1.parse : b$1.parseInline)(c2, i2);
        return i2.hooks ? await i2.hooks.postprocess(d2) : d2;
      })().catch(o2);
      try {
        i2.hooks && (n3 = i2.hooks.preprocess(n3));
        let a2 = (i2.hooks ? i2.hooks.provideLexer(e2) : e2 ? x.lex : x.lexInline)(n3, i2);
        i2.hooks && (a2 = i2.hooks.processAllTokens(a2)), i2.walkTokens && this.walkTokens(a2, i2.walkTokens);
        let c2 = (i2.hooks ? i2.hooks.provideParser(e2) : e2 ? b$1.parse : b$1.parseInline)(a2, i2);
        return i2.hooks && (c2 = i2.hooks.postprocess(c2)), c2;
      } catch (p2) {
        return o2(p2);
      }
    };
  }
  onError(e2, t2) {
    return (n3) => {
      if (n3.message += `
Please report this to https://github.com/markedjs/marked.`, e2) {
        let s2 = "<p>An error occurred:</p><pre>" + O(n3.message + "", true) + "</pre>";
        return t2 ? Promise.resolve(s2) : s2;
      }
      if (t2) return Promise.reject(n3);
      throw n3;
    };
  }
};
var E$1 = new Z$1();
function f$2(l4, e2) {
  return E$1.parse(l4, e2);
}
f$2.options = f$2.setOptions = function(l4) {
  return E$1.setOptions(l4), f$2.defaults = E$1.defaults, j(f$2.defaults), f$2;
};
f$2.getDefaults = C$1;
f$2.defaults = R$1;
function kt(...l4) {
  return E$1.use(...l4), f$2.defaults = E$1.defaults, j(f$2.defaults), f$2;
}
f$2.use = kt;
f$2.walkTokens = function(l4, e2) {
  return E$1.walkTokens(l4, e2);
};
f$2.parseInline = E$1.parseInline;
f$2.Parser = b$1;
f$2.parser = b$1.parse;
f$2.Renderer = P$1;
f$2.TextRenderer = L$1;
f$2.Lexer = x;
f$2.lexer = x.lex;
f$2.Tokenizer = y$2;
f$2.Hooks = S$2;
f$2.parse = f$2;
f$2.options;
f$2.setOptions;
f$2.walkTokens;
f$2.parseInline;
b$1.parse;
x.lex;
/*! @license DOMPurify 3.4.13 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.13/LICENSE */
function _arrayLikeToArray(r2, a2) {
  (null == a2 || a2 > r2.length) && (a2 = r2.length);
  for (var e2 = 0, n3 = Array(a2); e2 < a2; e2++) n3[e2] = r2[e2];
  return n3;
}
function _arrayWithHoles(r2) {
  if (Array.isArray(r2)) return r2;
}
function _iterableToArrayLimit(r2, l4) {
  var t2 = null == r2 ? null : "undefined" != typeof Symbol && r2[Symbol.iterator] || r2["@@iterator"];
  if (null != t2) {
    var e2, n3, i2, u2, a2 = [], f2 = true, o2 = false;
    try {
      if (i2 = (t2 = t2.call(r2)).next, 0 === l4) ;
      else for (; !(f2 = (e2 = i2.call(t2)).done) && (a2.push(e2.value), a2.length !== l4); f2 = true) ;
    } catch (r3) {
      o2 = true, n3 = r3;
    } finally {
      try {
        if (!f2 && null != t2.return && (u2 = t2.return(), Object(u2) !== u2)) return;
      } finally {
        if (o2) throw n3;
      }
    }
    return a2;
  }
}
function _nonIterableRest() {
  throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
function _slicedToArray(r2, e2) {
  return _arrayWithHoles(r2) || _iterableToArrayLimit(r2, e2) || _unsupportedIterableToArray(r2, e2) || _nonIterableRest();
}
function _unsupportedIterableToArray(r2, a2) {
  if (r2) {
    if ("string" == typeof r2) return _arrayLikeToArray(r2, a2);
    var t2 = {}.toString.call(r2).slice(8, -1);
    return "Object" === t2 && r2.constructor && (t2 = r2.constructor.name), "Map" === t2 || "Set" === t2 ? Array.from(r2) : "Arguments" === t2 || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t2) ? _arrayLikeToArray(r2, a2) : void 0;
  }
}
const entries = Object.entries, setPrototypeOf = Object.setPrototypeOf, isFrozen = Object.isFrozen, getPrototypeOf = Object.getPrototypeOf, getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
let freeze = Object.freeze, seal = Object.seal, create = Object.create;
let _ref = typeof Reflect !== "undefined" && Reflect, apply = _ref.apply, construct = _ref.construct;
if (!freeze) {
  freeze = function freeze2(x2) {
    return x2;
  };
}
if (!seal) {
  seal = function seal2(x2) {
    return x2;
  };
}
if (!apply) {
  apply = function apply2(func, thisArg) {
    for (var _len = arguments.length, args = new Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
      args[_key - 2] = arguments[_key];
    }
    return func.apply(thisArg, args);
  };
}
if (!construct) {
  construct = function construct2(Func) {
    for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
      args[_key2 - 1] = arguments[_key2];
    }
    return new Func(...args);
  };
}
const arrayForEach = unapply(Array.prototype.forEach);
const arrayLastIndexOf = unapply(Array.prototype.lastIndexOf);
const arrayPop = unapply(Array.prototype.pop);
const arrayPush = unapply(Array.prototype.push);
const arraySplice = unapply(Array.prototype.splice);
const arrayIsArray = Array.isArray;
const stringToLowerCase = unapply(String.prototype.toLowerCase);
const stringToString = unapply(String.prototype.toString);
const stringMatch = unapply(String.prototype.match);
const stringReplace = unapply(String.prototype.replace);
const stringIndexOf = unapply(String.prototype.indexOf);
const stringTrim = unapply(String.prototype.trim);
const numberToString = unapply(Number.prototype.toString);
const booleanToString = unapply(Boolean.prototype.toString);
const bigintToString = typeof BigInt === "undefined" ? null : unapply(BigInt.prototype.toString);
const symbolToString = typeof Symbol === "undefined" ? null : unapply(Symbol.prototype.toString);
const objectHasOwnProperty = unapply(Object.prototype.hasOwnProperty);
const objectToString = unapply(Object.prototype.toString);
const regExpTest = unapply(RegExp.prototype.test);
const typeErrorCreate = unconstruct(TypeError);
function unapply(func) {
  return function(thisArg) {
    if (thisArg instanceof RegExp) {
      thisArg.lastIndex = 0;
    }
    for (var _len3 = arguments.length, args = new Array(_len3 > 1 ? _len3 - 1 : 0), _key3 = 1; _key3 < _len3; _key3++) {
      args[_key3 - 1] = arguments[_key3];
    }
    return apply(func, thisArg, args);
  };
}
function unconstruct(Func) {
  return function() {
    for (var _len4 = arguments.length, args = new Array(_len4), _key4 = 0; _key4 < _len4; _key4++) {
      args[_key4] = arguments[_key4];
    }
    return construct(Func, args);
  };
}
function addToSet(set, array) {
  let transformCaseFunc = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : stringToLowerCase;
  if (setPrototypeOf) {
    setPrototypeOf(set, null);
  }
  if (!arrayIsArray(array)) {
    return set;
  }
  let l4 = array.length;
  while (l4--) {
    let element = array[l4];
    if (typeof element === "string") {
      const lcElement = transformCaseFunc(element);
      if (lcElement !== element) {
        if (!isFrozen(array)) {
          array[l4] = lcElement;
        }
        element = lcElement;
      }
    }
    set[element] = true;
  }
  return set;
}
function cleanArray(array) {
  for (let index = 0; index < array.length; index++) {
    const isPropertyExist = objectHasOwnProperty(array, index);
    if (!isPropertyExist) {
      array[index] = null;
    }
  }
  return array;
}
function clone(object) {
  const newObject = create(null);
  for (const _ref2 of entries(object)) {
    var _ref3 = _slicedToArray(_ref2, 2);
    const property = _ref3[0];
    const value = _ref3[1];
    const isPropertyExist = objectHasOwnProperty(object, property);
    if (isPropertyExist) {
      if (arrayIsArray(value)) {
        newObject[property] = cleanArray(value);
      } else if (value && typeof value === "object" && value.constructor === Object) {
        newObject[property] = clone(value);
      } else {
        newObject[property] = value;
      }
    }
  }
  return newObject;
}
function stringifyValue(value) {
  switch (typeof value) {
    case "string": {
      return value;
    }
    case "number": {
      return numberToString(value);
    }
    case "boolean": {
      return booleanToString(value);
    }
    case "bigint": {
      return bigintToString ? bigintToString(value) : "0";
    }
    case "symbol": {
      return symbolToString ? symbolToString(value) : "Symbol()";
    }
    case "undefined": {
      return objectToString(value);
    }
    case "function":
    case "object": {
      if (value === null) {
        return objectToString(value);
      }
      const valueAsRecord = value;
      const valueToString = lookupGetter(valueAsRecord, "toString");
      if (typeof valueToString === "function") {
        const stringified = valueToString(valueAsRecord);
        return typeof stringified === "string" ? stringified : objectToString(stringified);
      }
      return objectToString(value);
    }
    default: {
      return objectToString(value);
    }
  }
}
function lookupGetter(object, prop) {
  while (object !== null) {
    const desc = getOwnPropertyDescriptor(object, prop);
    if (desc) {
      if (desc.get) {
        return unapply(desc.get);
      }
      if (typeof desc.value === "function") {
        return unapply(desc.value);
      }
    }
    object = getPrototypeOf(object);
  }
  function fallbackValue() {
    return null;
  }
  return fallbackValue;
}
function isRegex(value) {
  try {
    regExpTest(value, "");
    return true;
  } catch (_unused) {
    return false;
  }
}
const html$1 = freeze(["a", "abbr", "acronym", "address", "area", "article", "aside", "audio", "b", "bdi", "bdo", "big", "blink", "blockquote", "body", "br", "button", "canvas", "caption", "center", "cite", "code", "col", "colgroup", "content", "data", "datalist", "dd", "decorator", "del", "details", "dfn", "dialog", "dir", "div", "dl", "dt", "element", "em", "fieldset", "figcaption", "figure", "font", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hgroup", "hr", "html", "i", "img", "input", "ins", "kbd", "label", "legend", "li", "main", "map", "mark", "marquee", "menu", "menuitem", "meter", "nav", "nobr", "ol", "optgroup", "option", "output", "p", "picture", "pre", "progress", "q", "rp", "rt", "ruby", "s", "samp", "search", "section", "select", "shadow", "slot", "small", "source", "spacer", "span", "strike", "strong", "style", "sub", "summary", "sup", "table", "tbody", "td", "template", "textarea", "tfoot", "th", "thead", "time", "tr", "track", "tt", "u", "ul", "var", "video", "wbr"]);
const svg$1 = freeze(["svg", "a", "altglyph", "altglyphdef", "altglyphitem", "animatecolor", "animatemotion", "animatetransform", "circle", "clippath", "defs", "desc", "ellipse", "enterkeyhint", "exportparts", "filter", "font", "g", "glyph", "glyphref", "hkern", "image", "inputmode", "line", "lineargradient", "marker", "mask", "metadata", "mpath", "part", "path", "pattern", "polygon", "polyline", "radialgradient", "rect", "stop", "style", "switch", "symbol", "text", "textpath", "title", "tref", "tspan", "view", "vkern"]);
const svgFilters = freeze(["feBlend", "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap", "feDistantLight", "feDropShadow", "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur", "feImage", "feMerge", "feMergeNode", "feMorphology", "feOffset", "fePointLight", "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence"]);
const svgDisallowed = freeze(["animate", "color-profile", "cursor", "discard", "font-face", "font-face-format", "font-face-name", "font-face-src", "font-face-uri", "foreignobject", "hatch", "hatchpath", "mesh", "meshgradient", "meshpatch", "meshrow", "missing-glyph", "script", "set", "solidcolor", "unknown", "use"]);
const mathMl$1 = freeze(["math", "menclose", "merror", "mfenced", "mfrac", "mglyph", "mi", "mlabeledtr", "mmultiscripts", "mn", "mo", "mover", "mpadded", "mphantom", "mroot", "mrow", "ms", "mspace", "msqrt", "mstyle", "msub", "msup", "msubsup", "mtable", "mtd", "mtext", "mtr", "munder", "munderover", "mprescripts"]);
const mathMlDisallowed = freeze(["maction", "maligngroup", "malignmark", "mlongdiv", "mscarries", "mscarry", "msgroup", "mstack", "msline", "msrow", "semantics", "annotation", "annotation-xml", "mprescripts", "none"]);
const text = freeze(["#text"]);
const html = freeze(["accept", "action", "align", "alt", "autocapitalize", "autocomplete", "autopictureinpicture", "autoplay", "background", "bgcolor", "border", "capture", "cellpadding", "cellspacing", "checked", "cite", "class", "clear", "color", "cols", "colspan", "command", "commandfor", "controls", "controlslist", "coords", "crossorigin", "datetime", "decoding", "default", "dir", "disabled", "disablepictureinpicture", "disableremoteplayback", "download", "draggable", "enctype", "enterkeyhint", "exportparts", "face", "for", "headers", "height", "hidden", "high", "href", "hreflang", "id", "inert", "inputmode", "integrity", "ismap", "kind", "label", "lang", "list", "loading", "loop", "low", "max", "maxlength", "media", "method", "min", "minlength", "multiple", "muted", "name", "nonce", "noshade", "novalidate", "nowrap", "open", "optimum", "part", "pattern", "placeholder", "playsinline", "popover", "popovertarget", "popovertargetaction", "poster", "preload", "pubdate", "radiogroup", "readonly", "rel", "required", "rev", "reversed", "role", "rows", "rowspan", "spellcheck", "scope", "selected", "shape", "size", "sizes", "slot", "span", "srclang", "start", "src", "srcset", "step", "style", "summary", "tabindex", "title", "translate", "type", "usemap", "valign", "value", "width", "wrap", "xmlns"]);
const svg = freeze(["accent-height", "accumulate", "additive", "alignment-baseline", "amplitude", "ascent", "attributename", "attributetype", "azimuth", "basefrequency", "baseline-shift", "begin", "bias", "by", "class", "clip", "clippathunits", "clip-path", "clip-rule", "color", "color-interpolation", "color-interpolation-filters", "color-profile", "color-rendering", "cx", "cy", "d", "dx", "dy", "diffuseconstant", "direction", "display", "divisor", "dominant-baseline", "dur", "edgemode", "elevation", "end", "exponent", "fill", "fill-opacity", "fill-rule", "filter", "filterunits", "flood-color", "flood-opacity", "font-family", "font-size", "font-size-adjust", "font-stretch", "font-style", "font-variant", "font-weight", "fx", "fy", "g1", "g2", "glyph-name", "glyphref", "gradientunits", "gradienttransform", "height", "href", "id", "image-rendering", "in", "in2", "intercept", "k", "k1", "k2", "k3", "k4", "kerning", "keypoints", "keysplines", "keytimes", "lang", "lengthadjust", "letter-spacing", "kernelmatrix", "kernelunitlength", "lighting-color", "local", "marker-end", "marker-mid", "marker-start", "markerheight", "markerunits", "markerwidth", "maskcontentunits", "maskunits", "max", "mask", "mask-type", "media", "method", "mode", "min", "name", "numoctaves", "offset", "operator", "opacity", "order", "orient", "orientation", "origin", "overflow", "paint-order", "path", "pathlength", "patterncontentunits", "patterntransform", "patternunits", "points", "preservealpha", "preserveaspectratio", "primitiveunits", "r", "rx", "ry", "radius", "refx", "refy", "repeatcount", "repeatdur", "restart", "result", "rotate", "scale", "seed", "shape-rendering", "slope", "specularconstant", "specularexponent", "spreadmethod", "startoffset", "stddeviation", "stitchtiles", "stop-color", "stop-opacity", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-opacity", "stroke", "stroke-width", "style", "surfacescale", "systemlanguage", "tabindex", "tablevalues", "targetx", "targety", "transform", "transform-origin", "text-anchor", "text-decoration", "text-orientation", "text-rendering", "textlength", "type", "u1", "u2", "unicode", "values", "viewbox", "visibility", "version", "vert-adv-y", "vert-origin-x", "vert-origin-y", "width", "word-spacing", "wrap", "writing-mode", "xchannelselector", "ychannelselector", "x", "x1", "x2", "xmlns", "y", "y1", "y2", "z", "zoomandpan"]);
const mathMl = freeze(["accent", "accentunder", "align", "bevelled", "close", "columnalign", "columnlines", "columnspacing", "columnspan", "denomalign", "depth", "dir", "display", "displaystyle", "encoding", "fence", "frame", "height", "href", "id", "largeop", "length", "linethickness", "lquote", "lspace", "mathbackground", "mathcolor", "mathsize", "mathvariant", "maxsize", "minsize", "movablelimits", "notation", "numalign", "open", "rowalign", "rowlines", "rowspacing", "rowspan", "rspace", "rquote", "scriptlevel", "scriptminsize", "scriptsizemultiplier", "selection", "separator", "separators", "stretchy", "subscriptshift", "supscriptshift", "symmetric", "voffset", "width", "xmlns"]);
const xml = freeze(["xlink:href", "xml:id", "xlink:title", "xml:space", "xmlns:xlink"]);
const MUSTACHE_EXPR = seal(/{{[\w\W]*|^[\w\W]*}}/g);
const ERB_EXPR = seal(/<%[\w\W]*|^[\w\W]*%>/g);
const TMPLIT_EXPR = seal(/\${[\w\W]*/g);
const DATA_ATTR = seal(/^data-[\-\w.\u00B7-\uFFFF]+$/);
const ARIA_ATTR = seal(/^aria-[\-\w]+$/);
const IS_ALLOWED_URI = seal(
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
  // eslint-disable-line no-useless-escape
);
const IS_SCRIPT_OR_DATA = seal(/^(?:\w+script|data):/i);
const ATTR_WHITESPACE = seal(
  /[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g
  // eslint-disable-line no-control-regex
);
const DOCTYPE_NAME = seal(/^html$/i);
const CUSTOM_ELEMENT = seal(/^[a-z][.\w]*(-[.\w]+)+$/i);
const ELEMENT_MARKUP_PROBE = seal(/<[/\w!]/g);
const COMMENT_MARKUP_PROBE = seal(/<[/\w]/g);
const FALLBACK_TAG_CLOSE = seal(/<\/no(script|embed|frames)/i);
const SELF_CLOSING_TAG = seal(/\/>/i);
const NODE_TYPE = {
  element: 1,
  attribute: 2,
  text: 3,
  cdataSection: 4,
  entityReference: 5,
  // Deprecated
  entityNode: 6,
  // Deprecated
  processingInstruction: 7,
  comment: 8,
  document: 9,
  documentType: 10,
  documentFragment: 11,
  notation: 12
  // Deprecated
};
const getGlobal = function getGlobal2() {
  return typeof window === "undefined" ? null : window;
};
const _createTrustedTypesPolicy = function _createTrustedTypesPolicy2(trustedTypes, purifyHostElement) {
  if (typeof trustedTypes !== "object" || typeof trustedTypes.createPolicy !== "function") {
    return null;
  }
  let suffix = null;
  const ATTR_NAME = "data-tt-policy-suffix";
  if (purifyHostElement && purifyHostElement.hasAttribute(ATTR_NAME)) {
    suffix = purifyHostElement.getAttribute(ATTR_NAME);
  }
  const policyName = "dompurify" + (suffix ? "#" + suffix : "");
  try {
    return trustedTypes.createPolicy(policyName, {
      createHTML(html2) {
        return html2;
      },
      createScriptURL(scriptUrl) {
        return scriptUrl;
      }
    });
  } catch (_2) {
    console.warn("TrustedTypes policy " + policyName + " could not be created.");
    return null;
  }
};
const _createHooksMap = function _createHooksMap2() {
  return {
    afterSanitizeAttributes: [],
    afterSanitizeElements: [],
    afterSanitizeShadowDOM: [],
    beforeSanitizeAttributes: [],
    beforeSanitizeElements: [],
    beforeSanitizeShadowDOM: [],
    uponSanitizeAttribute: [],
    uponSanitizeElement: [],
    uponSanitizeShadowNode: []
  };
};
const _resolveSetOption = function _resolveSetOption2(cfg, key, fallback, options) {
  return objectHasOwnProperty(cfg, key) && arrayIsArray(cfg[key]) ? addToSet(options.base ? clone(options.base) : {}, cfg[key], options.transform) : fallback;
};
function createDOMPurify() {
  let window2 = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : getGlobal();
  const DOMPurify = (root) => createDOMPurify(root);
  DOMPurify.version = "3.4.13";
  DOMPurify.removed = [];
  if (!window2 || !window2.document || window2.document.nodeType !== NODE_TYPE.document || !window2.Element) {
    DOMPurify.isSupported = false;
    return DOMPurify;
  }
  let document2 = window2.document;
  const originalDocument = document2;
  const currentScript = originalDocument.currentScript;
  window2.DocumentFragment;
  const HTMLTemplateElement = window2.HTMLTemplateElement, Node = window2.Node, Element = window2.Element, NodeFilter = window2.NodeFilter, _window$NamedNodeMap = window2.NamedNodeMap;
  _window$NamedNodeMap === void 0 ? window2.NamedNodeMap || window2.MozNamedAttrMap : _window$NamedNodeMap;
  window2.HTMLFormElement;
  const DOMParser = window2.DOMParser, trustedTypes = window2.trustedTypes;
  const ElementPrototype = Element.prototype;
  const cloneNode = lookupGetter(ElementPrototype, "cloneNode");
  const remove = lookupGetter(ElementPrototype, "remove");
  const getNextSibling = lookupGetter(ElementPrototype, "nextSibling");
  const getChildNodes = lookupGetter(ElementPrototype, "childNodes");
  const getParentNode = lookupGetter(ElementPrototype, "parentNode");
  const getShadowRoot = lookupGetter(ElementPrototype, "shadowRoot");
  const getAttributes = lookupGetter(ElementPrototype, "attributes");
  const getNodeType = Node && Node.prototype ? lookupGetter(Node.prototype, "nodeType") : null;
  const getNodeName = Node && Node.prototype ? lookupGetter(Node.prototype, "nodeName") : null;
  const getOwnerDocument = Node && Node.prototype ? lookupGetter(Node.prototype, "ownerDocument") : null;
  if (typeof HTMLTemplateElement === "function") {
    const template = document2.createElement("template");
    if (template.content && template.content.ownerDocument) {
      document2 = template.content.ownerDocument;
    }
  }
  let trustedTypesPolicy;
  let emptyHTML = "";
  let defaultTrustedTypesPolicy;
  let defaultTrustedTypesPolicyResolved = false;
  let IN_TRUSTED_TYPES_POLICY = 0;
  const _assertNotInTrustedTypesPolicy = function _assertNotInTrustedTypesPolicy2() {
    if (IN_TRUSTED_TYPES_POLICY > 0) {
      throw typeErrorCreate('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.');
    }
  };
  const _createTrustedHTML = function _createTrustedHTML2(html2) {
    _assertNotInTrustedTypesPolicy();
    IN_TRUSTED_TYPES_POLICY++;
    try {
      return trustedTypesPolicy.createHTML(html2);
    } finally {
      IN_TRUSTED_TYPES_POLICY--;
    }
  };
  const _createTrustedScriptURL = function _createTrustedScriptURL2(scriptUrl) {
    _assertNotInTrustedTypesPolicy();
    IN_TRUSTED_TYPES_POLICY++;
    try {
      return trustedTypesPolicy.createScriptURL(scriptUrl);
    } finally {
      IN_TRUSTED_TYPES_POLICY--;
    }
  };
  const _getDefaultTrustedTypesPolicy = function _getDefaultTrustedTypesPolicy2() {
    if (!defaultTrustedTypesPolicyResolved) {
      defaultTrustedTypesPolicy = _createTrustedTypesPolicy(trustedTypes, currentScript);
      defaultTrustedTypesPolicyResolved = true;
    }
    return defaultTrustedTypesPolicy;
  };
  const _document = document2, implementation = _document.implementation, createNodeIterator = _document.createNodeIterator, createDocumentFragment = _document.createDocumentFragment, getElementsByTagName = _document.getElementsByTagName;
  const importNode = originalDocument.importNode;
  let hooks = _createHooksMap();
  DOMPurify.isSupported = typeof entries === "function" && typeof getParentNode === "function" && implementation && implementation.createHTMLDocument !== void 0;
  const MUSTACHE_EXPR$1 = MUSTACHE_EXPR, ERB_EXPR$1 = ERB_EXPR, TMPLIT_EXPR$1 = TMPLIT_EXPR, DATA_ATTR$1 = DATA_ATTR, ARIA_ATTR$1 = ARIA_ATTR, IS_SCRIPT_OR_DATA$1 = IS_SCRIPT_OR_DATA, ATTR_WHITESPACE$1 = ATTR_WHITESPACE, CUSTOM_ELEMENT$1 = CUSTOM_ELEMENT;
  let IS_ALLOWED_URI$1 = IS_ALLOWED_URI;
  let ALLOWED_TAGS = null;
  const DEFAULT_ALLOWED_TAGS = addToSet({}, [...html$1, ...svg$1, ...svgFilters, ...mathMl$1, ...text]);
  let ALLOWED_ATTR = null;
  const DEFAULT_ALLOWED_ATTR = addToSet({}, [...html, ...svg, ...mathMl, ...xml]);
  let CUSTOM_ELEMENT_HANDLING = Object.seal(create(null, {
    tagNameCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    },
    attributeNameCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    },
    allowCustomizedBuiltInElements: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: false
    }
  }));
  let FORBID_TAGS = null;
  let FORBID_ATTR = null;
  const EXTRA_ELEMENT_HANDLING = Object.seal(create(null, {
    tagCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    },
    attributeCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    }
  }));
  let ALLOW_ARIA_ATTR = true;
  let ALLOW_DATA_ATTR = true;
  let ALLOW_UNKNOWN_PROTOCOLS = false;
  let ALLOW_SELF_CLOSE_IN_ATTR = true;
  let SAFE_FOR_TEMPLATES = false;
  let SAFE_FOR_XML = true;
  let WHOLE_DOCUMENT = false;
  let SET_CONFIG = false;
  let SET_CONFIG_ALLOWED_TAGS = null;
  let SET_CONFIG_ALLOWED_ATTR = null;
  let FORCE_BODY = false;
  let RETURN_DOM = false;
  let RETURN_DOM_FRAGMENT = false;
  let RETURN_TRUSTED_TYPE = false;
  let SANITIZE_DOM = true;
  let SANITIZE_NAMED_PROPS = false;
  const SANITIZE_NAMED_PROPS_PREFIX = "user-content-";
  let KEEP_CONTENT = true;
  let IN_PLACE = false;
  let USE_PROFILES = {};
  let FORBID_CONTENTS = null;
  const DEFAULT_FORBID_CONTENTS = addToSet({}, [
    "annotation-xml",
    "audio",
    "colgroup",
    "desc",
    "foreignobject",
    "head",
    "iframe",
    "math",
    "mi",
    "mn",
    "mo",
    "ms",
    "mtext",
    "noembed",
    "noframes",
    "noscript",
    "plaintext",
    "script",
    // <selectedcontent> mirrors the selected <option>'s subtree, cloned by
    // the UA (customizable <select>) — including any on* handlers — and the
    // engine re-mirrors synchronously whenever a removal changes which
    // option/selectedcontent is current, even inside DOMPurify's inert
    // DOMParser document. Hoisting its children on removal re-inserts a fresh
    // mirror target ahead of the walk, which the engine refills, looping
    // forever (DoS) and amplifying output. Dropping its content on removal
    // (rather than hoisting) breaks that cascade; the content is a duplicate
    // of the option, which is sanitized on its own. See campaign-3 F1/F6.
    "selectedcontent",
    "style",
    "svg",
    "template",
    "thead",
    "title",
    "video",
    "xmp"
  ]);
  let DATA_URI_TAGS = null;
  const DEFAULT_DATA_URI_TAGS = addToSet({}, ["audio", "video", "img", "source", "image", "track"]);
  let URI_SAFE_ATTRIBUTES = null;
  const DEFAULT_URI_SAFE_ATTRIBUTES = addToSet({}, ["alt", "class", "for", "id", "label", "name", "pattern", "placeholder", "role", "summary", "title", "value", "style", "xmlns"]);
  const MATHML_NAMESPACE = "http://www.w3.org/1998/Math/MathML";
  const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
  const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
  let NAMESPACE = HTML_NAMESPACE;
  let IS_EMPTY_INPUT = false;
  let ALLOWED_NAMESPACES = null;
  const DEFAULT_ALLOWED_NAMESPACES = addToSet({}, [MATHML_NAMESPACE, SVG_NAMESPACE, HTML_NAMESPACE], stringToString);
  const DEFAULT_MATHML_TEXT_INTEGRATION_POINTS = freeze(["mi", "mo", "mn", "ms", "mtext"]);
  let MATHML_TEXT_INTEGRATION_POINTS = addToSet({}, DEFAULT_MATHML_TEXT_INTEGRATION_POINTS);
  const DEFAULT_HTML_INTEGRATION_POINTS = freeze(["annotation-xml"]);
  let HTML_INTEGRATION_POINTS = addToSet({}, DEFAULT_HTML_INTEGRATION_POINTS);
  const COMMON_SVG_AND_HTML_ELEMENTS = addToSet({}, ["title", "style", "font", "a", "script"]);
  let PARSER_MEDIA_TYPE = null;
  const SUPPORTED_PARSER_MEDIA_TYPES = ["application/xhtml+xml", "text/html"];
  const DEFAULT_PARSER_MEDIA_TYPE = "text/html";
  let transformCaseFunc = null;
  let CONFIG = null;
  const formElement = document2.createElement("form");
  const isRegexOrFunction = function isRegexOrFunction2(testValue) {
    return testValue instanceof RegExp || testValue instanceof Function;
  };
  const _parseConfig = function _parseConfig2() {
    let cfg = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
    if (CONFIG && CONFIG === cfg) {
      return;
    }
    if (!cfg || typeof cfg !== "object") {
      cfg = {};
    }
    cfg = clone(cfg);
    PARSER_MEDIA_TYPE = // eslint-disable-next-line unicorn/prefer-includes
    SUPPORTED_PARSER_MEDIA_TYPES.indexOf(cfg.PARSER_MEDIA_TYPE) === -1 ? DEFAULT_PARSER_MEDIA_TYPE : cfg.PARSER_MEDIA_TYPE;
    transformCaseFunc = PARSER_MEDIA_TYPE === "application/xhtml+xml" ? stringToString : stringToLowerCase;
    ALLOWED_TAGS = _resolveSetOption(cfg, "ALLOWED_TAGS", DEFAULT_ALLOWED_TAGS, {
      transform: transformCaseFunc
    });
    ALLOWED_ATTR = _resolveSetOption(cfg, "ALLOWED_ATTR", DEFAULT_ALLOWED_ATTR, {
      transform: transformCaseFunc
    });
    ALLOWED_NAMESPACES = _resolveSetOption(cfg, "ALLOWED_NAMESPACES", DEFAULT_ALLOWED_NAMESPACES, {
      transform: stringToString
    });
    URI_SAFE_ATTRIBUTES = _resolveSetOption(cfg, "ADD_URI_SAFE_ATTR", DEFAULT_URI_SAFE_ATTRIBUTES, {
      transform: transformCaseFunc,
      base: DEFAULT_URI_SAFE_ATTRIBUTES
    });
    DATA_URI_TAGS = _resolveSetOption(cfg, "ADD_DATA_URI_TAGS", DEFAULT_DATA_URI_TAGS, {
      transform: transformCaseFunc,
      base: DEFAULT_DATA_URI_TAGS
    });
    FORBID_CONTENTS = _resolveSetOption(cfg, "FORBID_CONTENTS", DEFAULT_FORBID_CONTENTS, {
      transform: transformCaseFunc
    });
    FORBID_TAGS = _resolveSetOption(cfg, "FORBID_TAGS", clone({}), {
      transform: transformCaseFunc
    });
    FORBID_ATTR = _resolveSetOption(cfg, "FORBID_ATTR", clone({}), {
      transform: transformCaseFunc
    });
    USE_PROFILES = objectHasOwnProperty(cfg, "USE_PROFILES") ? cfg.USE_PROFILES && typeof cfg.USE_PROFILES === "object" ? clone(cfg.USE_PROFILES) : cfg.USE_PROFILES : false;
    ALLOW_ARIA_ATTR = cfg.ALLOW_ARIA_ATTR !== false;
    ALLOW_DATA_ATTR = cfg.ALLOW_DATA_ATTR !== false;
    ALLOW_UNKNOWN_PROTOCOLS = cfg.ALLOW_UNKNOWN_PROTOCOLS || false;
    ALLOW_SELF_CLOSE_IN_ATTR = cfg.ALLOW_SELF_CLOSE_IN_ATTR !== false;
    SAFE_FOR_TEMPLATES = cfg.SAFE_FOR_TEMPLATES || false;
    SAFE_FOR_XML = cfg.SAFE_FOR_XML !== false;
    WHOLE_DOCUMENT = cfg.WHOLE_DOCUMENT || false;
    RETURN_DOM = cfg.RETURN_DOM || false;
    RETURN_DOM_FRAGMENT = cfg.RETURN_DOM_FRAGMENT || false;
    RETURN_TRUSTED_TYPE = cfg.RETURN_TRUSTED_TYPE || false;
    FORCE_BODY = cfg.FORCE_BODY || false;
    SANITIZE_DOM = cfg.SANITIZE_DOM !== false;
    SANITIZE_NAMED_PROPS = cfg.SANITIZE_NAMED_PROPS || false;
    KEEP_CONTENT = cfg.KEEP_CONTENT !== false;
    IN_PLACE = cfg.IN_PLACE || false;
    IS_ALLOWED_URI$1 = isRegex(cfg.ALLOWED_URI_REGEXP) ? cfg.ALLOWED_URI_REGEXP : IS_ALLOWED_URI;
    NAMESPACE = typeof cfg.NAMESPACE === "string" ? cfg.NAMESPACE : HTML_NAMESPACE;
    MATHML_TEXT_INTEGRATION_POINTS = objectHasOwnProperty(cfg, "MATHML_TEXT_INTEGRATION_POINTS") && cfg.MATHML_TEXT_INTEGRATION_POINTS && typeof cfg.MATHML_TEXT_INTEGRATION_POINTS === "object" ? clone(cfg.MATHML_TEXT_INTEGRATION_POINTS) : addToSet({}, DEFAULT_MATHML_TEXT_INTEGRATION_POINTS);
    HTML_INTEGRATION_POINTS = objectHasOwnProperty(cfg, "HTML_INTEGRATION_POINTS") && cfg.HTML_INTEGRATION_POINTS && typeof cfg.HTML_INTEGRATION_POINTS === "object" ? clone(cfg.HTML_INTEGRATION_POINTS) : addToSet({}, DEFAULT_HTML_INTEGRATION_POINTS);
    const customElementHandling = objectHasOwnProperty(cfg, "CUSTOM_ELEMENT_HANDLING") && cfg.CUSTOM_ELEMENT_HANDLING && typeof cfg.CUSTOM_ELEMENT_HANDLING === "object" ? clone(cfg.CUSTOM_ELEMENT_HANDLING) : create(null);
    CUSTOM_ELEMENT_HANDLING = create(null);
    if (objectHasOwnProperty(customElementHandling, "tagNameCheck") && isRegexOrFunction(customElementHandling.tagNameCheck)) {
      CUSTOM_ELEMENT_HANDLING.tagNameCheck = customElementHandling.tagNameCheck;
    }
    if (objectHasOwnProperty(customElementHandling, "attributeNameCheck") && isRegexOrFunction(customElementHandling.attributeNameCheck)) {
      CUSTOM_ELEMENT_HANDLING.attributeNameCheck = customElementHandling.attributeNameCheck;
    }
    if (objectHasOwnProperty(customElementHandling, "allowCustomizedBuiltInElements") && typeof customElementHandling.allowCustomizedBuiltInElements === "boolean") {
      CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements = customElementHandling.allowCustomizedBuiltInElements;
    }
    seal(CUSTOM_ELEMENT_HANDLING);
    if (SAFE_FOR_TEMPLATES) {
      ALLOW_DATA_ATTR = false;
    }
    if (RETURN_DOM_FRAGMENT) {
      RETURN_DOM = true;
    }
    if (USE_PROFILES) {
      ALLOWED_TAGS = addToSet({}, text);
      ALLOWED_ATTR = create(null);
      if (USE_PROFILES.html === true) {
        addToSet(ALLOWED_TAGS, html$1);
        addToSet(ALLOWED_ATTR, html);
      }
      if (USE_PROFILES.svg === true) {
        addToSet(ALLOWED_TAGS, svg$1);
        addToSet(ALLOWED_ATTR, svg);
        addToSet(ALLOWED_ATTR, xml);
      }
      if (USE_PROFILES.svgFilters === true) {
        addToSet(ALLOWED_TAGS, svgFilters);
        addToSet(ALLOWED_ATTR, svg);
        addToSet(ALLOWED_ATTR, xml);
      }
      if (USE_PROFILES.mathMl === true) {
        addToSet(ALLOWED_TAGS, mathMl$1);
        addToSet(ALLOWED_ATTR, mathMl);
        addToSet(ALLOWED_ATTR, xml);
      }
    }
    EXTRA_ELEMENT_HANDLING.tagCheck = null;
    EXTRA_ELEMENT_HANDLING.attributeCheck = null;
    if (objectHasOwnProperty(cfg, "ADD_TAGS")) {
      if (typeof cfg.ADD_TAGS === "function") {
        EXTRA_ELEMENT_HANDLING.tagCheck = cfg.ADD_TAGS;
      } else if (arrayIsArray(cfg.ADD_TAGS)) {
        if (ALLOWED_TAGS === DEFAULT_ALLOWED_TAGS) {
          ALLOWED_TAGS = clone(ALLOWED_TAGS);
        }
        addToSet(ALLOWED_TAGS, cfg.ADD_TAGS, transformCaseFunc);
      }
    }
    if (objectHasOwnProperty(cfg, "ADD_ATTR")) {
      if (typeof cfg.ADD_ATTR === "function") {
        EXTRA_ELEMENT_HANDLING.attributeCheck = cfg.ADD_ATTR;
      } else if (arrayIsArray(cfg.ADD_ATTR)) {
        if (ALLOWED_ATTR === DEFAULT_ALLOWED_ATTR) {
          ALLOWED_ATTR = clone(ALLOWED_ATTR);
        }
        addToSet(ALLOWED_ATTR, cfg.ADD_ATTR, transformCaseFunc);
      }
    }
    if (objectHasOwnProperty(cfg, "ADD_URI_SAFE_ATTR") && arrayIsArray(cfg.ADD_URI_SAFE_ATTR)) {
      addToSet(URI_SAFE_ATTRIBUTES, cfg.ADD_URI_SAFE_ATTR, transformCaseFunc);
    }
    if (objectHasOwnProperty(cfg, "FORBID_CONTENTS") && arrayIsArray(cfg.FORBID_CONTENTS)) {
      if (FORBID_CONTENTS === DEFAULT_FORBID_CONTENTS) {
        FORBID_CONTENTS = clone(FORBID_CONTENTS);
      }
      addToSet(FORBID_CONTENTS, cfg.FORBID_CONTENTS, transformCaseFunc);
    }
    if (objectHasOwnProperty(cfg, "ADD_FORBID_CONTENTS") && arrayIsArray(cfg.ADD_FORBID_CONTENTS)) {
      if (FORBID_CONTENTS === DEFAULT_FORBID_CONTENTS) {
        FORBID_CONTENTS = clone(FORBID_CONTENTS);
      }
      addToSet(FORBID_CONTENTS, cfg.ADD_FORBID_CONTENTS, transformCaseFunc);
    }
    if (KEEP_CONTENT) {
      ALLOWED_TAGS["#text"] = true;
    }
    if (WHOLE_DOCUMENT) {
      addToSet(ALLOWED_TAGS, ["html", "head", "body"]);
    }
    if (ALLOWED_TAGS.table) {
      addToSet(ALLOWED_TAGS, ["tbody"]);
      delete FORBID_TAGS.tbody;
    }
    if (cfg.TRUSTED_TYPES_POLICY) {
      if (typeof cfg.TRUSTED_TYPES_POLICY.createHTML !== "function") {
        throw typeErrorCreate('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');
      }
      if (typeof cfg.TRUSTED_TYPES_POLICY.createScriptURL !== "function") {
        throw typeErrorCreate('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');
      }
      const previousTrustedTypesPolicy = trustedTypesPolicy;
      trustedTypesPolicy = cfg.TRUSTED_TYPES_POLICY;
      try {
        emptyHTML = _createTrustedHTML("");
      } catch (error) {
        trustedTypesPolicy = previousTrustedTypesPolicy;
        throw error;
      }
    } else if (cfg.TRUSTED_TYPES_POLICY === null) {
      trustedTypesPolicy = void 0;
      emptyHTML = "";
    } else {
      if (trustedTypesPolicy === void 0) {
        trustedTypesPolicy = _getDefaultTrustedTypesPolicy();
      }
      if (trustedTypesPolicy && typeof emptyHTML === "string") {
        emptyHTML = _createTrustedHTML("");
      }
    }
    if (freeze) {
      freeze(cfg);
    }
    CONFIG = cfg;
  };
  const ALL_SVG_TAGS = addToSet({}, [...svg$1, ...svgFilters, ...svgDisallowed]);
  const ALL_MATHML_TAGS = addToSet({}, [...mathMl$1, ...mathMlDisallowed]);
  const _checkSvgNamespace = function _checkSvgNamespace2(tagName, parent, parentTagName) {
    if (parent.namespaceURI === HTML_NAMESPACE) {
      return tagName === "svg";
    }
    if (parent.namespaceURI === MATHML_NAMESPACE) {
      return tagName === "svg" && (parentTagName === "annotation-xml" || MATHML_TEXT_INTEGRATION_POINTS[parentTagName]);
    }
    return Boolean(ALL_SVG_TAGS[tagName]);
  };
  const _checkMathMlNamespace = function _checkMathMlNamespace2(tagName, parent, parentTagName) {
    if (parent.namespaceURI === HTML_NAMESPACE) {
      return tagName === "math";
    }
    if (parent.namespaceURI === SVG_NAMESPACE) {
      return tagName === "math" && HTML_INTEGRATION_POINTS[parentTagName];
    }
    return Boolean(ALL_MATHML_TAGS[tagName]);
  };
  const _checkHtmlNamespace = function _checkHtmlNamespace2(tagName, parent, parentTagName) {
    if (parent.namespaceURI === SVG_NAMESPACE && !HTML_INTEGRATION_POINTS[parentTagName]) {
      return false;
    }
    if (parent.namespaceURI === MATHML_NAMESPACE && !MATHML_TEXT_INTEGRATION_POINTS[parentTagName]) {
      return false;
    }
    return !ALL_MATHML_TAGS[tagName] && (COMMON_SVG_AND_HTML_ELEMENTS[tagName] || !ALL_SVG_TAGS[tagName]);
  };
  const _checkValidNamespace = function _checkValidNamespace2(element) {
    let parent = getParentNode(element);
    if (!parent || !parent.tagName) {
      parent = {
        namespaceURI: NAMESPACE,
        tagName: "template"
      };
    }
    const tagName = stringToLowerCase(element.tagName);
    const parentTagName = stringToLowerCase(parent.tagName);
    if (!ALLOWED_NAMESPACES[element.namespaceURI]) {
      return false;
    }
    if (element.namespaceURI === SVG_NAMESPACE) {
      return _checkSvgNamespace(tagName, parent, parentTagName);
    }
    if (element.namespaceURI === MATHML_NAMESPACE) {
      return _checkMathMlNamespace(tagName, parent, parentTagName);
    }
    if (element.namespaceURI === HTML_NAMESPACE) {
      return _checkHtmlNamespace(tagName, parent, parentTagName);
    }
    if (PARSER_MEDIA_TYPE === "application/xhtml+xml" && ALLOWED_NAMESPACES[element.namespaceURI]) {
      return true;
    }
    return false;
  };
  const _forceRemove = function _forceRemove2(node) {
    arrayPush(DOMPurify.removed, {
      element: node
    });
    try {
      getParentNode(node).removeChild(node);
    } catch (_2) {
      remove(node);
      if (!getParentNode(node)) {
        throw typeErrorCreate("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place");
      }
    }
  };
  const _neutralizeRoot = function _neutralizeRoot2(root) {
    _neutralizeSubtree(root);
    const childNodes = getChildNodes(root);
    if (childNodes) {
      const snapshot = [];
      arrayForEach(childNodes, (child) => {
        arrayPush(snapshot, child);
      });
      arrayForEach(snapshot, (child) => {
        try {
          remove(child);
        } catch (_2) {
        }
      });
    }
    const attributes = getAttributes(root);
    if (attributes) {
      for (let i2 = attributes.length - 1; i2 >= 0; --i2) {
        const attribute = attributes[i2];
        const name = attribute && attribute.name;
        if (typeof name === "string") {
          try {
            root.removeAttribute(name);
          } catch (_2) {
          }
        }
      }
    }
  };
  const _removeAttribute = function _removeAttribute2(name, element) {
    try {
      arrayPush(DOMPurify.removed, {
        attribute: element.getAttributeNode(name),
        from: element
      });
    } catch (_2) {
      arrayPush(DOMPurify.removed, {
        attribute: null,
        from: element
      });
    }
    element.removeAttribute(name);
    if (name === "is") {
      if (RETURN_DOM || RETURN_DOM_FRAGMENT) {
        try {
          _forceRemove(element);
        } catch (_2) {
        }
      } else {
        try {
          element.setAttribute(name, "");
        } catch (_2) {
        }
      }
    }
  };
  const _stripDisallowedAttributes = function _stripDisallowedAttributes2(element) {
    const attributes = getAttributes(element);
    if (!attributes) {
      return;
    }
    for (let i2 = attributes.length - 1; i2 >= 0; --i2) {
      const attribute = attributes[i2];
      const name = attribute && attribute.name;
      if (typeof name !== "string" || ALLOWED_ATTR[transformCaseFunc(name)]) {
        continue;
      }
      try {
        element.removeAttribute(name);
      } catch (_2) {
      }
    }
  };
  const _neutralizeSubtree = function _neutralizeSubtree2(root) {
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      const nodeType = getNodeType ? getNodeType(node) : node.nodeType;
      if (nodeType === NODE_TYPE.element) {
        _stripDisallowedAttributes(node);
      }
      const childNodes = getChildNodes(node);
      if (childNodes) {
        for (let i2 = childNodes.length - 1; i2 >= 0; --i2) {
          stack.push(childNodes[i2]);
        }
      }
    }
  };
  const _neutralizePatchLinkage = function _neutralizePatchLinkage2(root) {
    if (!SAFE_FOR_XML) {
      return;
    }
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      const nodeType = getNodeType ? getNodeType(node) : node.nodeType;
      if (nodeType === NODE_TYPE.processingInstruction || nodeType === NODE_TYPE.comment && regExpTest(COMMENT_MARKUP_PROBE, node.data)) {
        try {
          remove(node);
        } catch (_2) {
        }
        continue;
      }
      if (nodeType === NODE_TYPE.element) {
        const element = node;
        const lcTag = transformCaseFunc(getNodeName ? getNodeName(node) : node.nodeName);
        try {
          if (element.hasAttribute && element.hasAttribute("patchsrc")) {
            element.removeAttribute("patchsrc");
          }
          if (element.hasAttribute && element.hasAttribute("for") && lcTag !== "label" && lcTag !== "output") {
            element.removeAttribute("for");
          }
        } catch (_2) {
        }
      }
      const childNodes = getChildNodes(node);
      if (childNodes) {
        for (let i2 = childNodes.length - 1; i2 >= 0; --i2) {
          stack.push(childNodes[i2]);
        }
      }
    }
  };
  const _initDocument = function _initDocument2(dirty) {
    let doc = null;
    let leadingWhitespace = null;
    if (FORCE_BODY) {
      dirty = "<remove></remove>" + dirty;
    } else {
      const matches = stringMatch(dirty, /^[\r\n\t ]+/);
      leadingWhitespace = matches && matches[0];
    }
    if (PARSER_MEDIA_TYPE === "application/xhtml+xml" && NAMESPACE === HTML_NAMESPACE) {
      dirty = '<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>' + dirty + "</body></html>";
    }
    const dirtyPayload = trustedTypesPolicy ? _createTrustedHTML(dirty) : dirty;
    if (NAMESPACE === HTML_NAMESPACE) {
      try {
        doc = new DOMParser().parseFromString(dirtyPayload, PARSER_MEDIA_TYPE);
      } catch (_2) {
      }
    }
    if (!doc || !doc.documentElement) {
      doc = implementation.createDocument(NAMESPACE, "template", null);
      try {
        doc.documentElement.innerHTML = IS_EMPTY_INPUT ? emptyHTML : dirtyPayload;
      } catch (_2) {
      }
    }
    const body = doc.body || doc.documentElement;
    if (dirty && leadingWhitespace) {
      body.insertBefore(document2.createTextNode(leadingWhitespace), body.childNodes[0] || null);
    }
    if (NAMESPACE === HTML_NAMESPACE) {
      return getElementsByTagName.call(doc, WHOLE_DOCUMENT ? "html" : "body")[0];
    }
    return WHOLE_DOCUMENT ? doc.documentElement : body;
  };
  const _createNodeIterator = function _createNodeIterator2(root) {
    const doc = getOwnerDocument ? getOwnerDocument(root) : root.ownerDocument;
    return createNodeIterator.call(
      doc || root,
      root,
      // eslint-disable-next-line no-bitwise
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_PROCESSING_INSTRUCTION | NodeFilter.SHOW_CDATA_SECTION,
      null
    );
  };
  const _stripTemplateExpressions = function _stripTemplateExpressions2(value) {
    value = stringReplace(value, MUSTACHE_EXPR$1, " ");
    value = stringReplace(value, ERB_EXPR$1, " ");
    value = stringReplace(value, TMPLIT_EXPR$1, " ");
    return value;
  };
  const _scrubTemplateExpressions2 = function _scrubTemplateExpressions(node) {
    var _node$querySelectorAl;
    node.normalize();
    const doc = getOwnerDocument ? getOwnerDocument(node) : node.ownerDocument;
    const walker = createNodeIterator.call(
      doc || node,
      node,
      // eslint-disable-next-line no-bitwise
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_CDATA_SECTION | NodeFilter.SHOW_PROCESSING_INSTRUCTION,
      null
    );
    let currentNode = walker.nextNode();
    while (currentNode) {
      currentNode.data = _stripTemplateExpressions(currentNode.data);
      currentNode = walker.nextNode();
    }
    const templates = (_node$querySelectorAl = node.querySelectorAll) === null || _node$querySelectorAl === void 0 ? void 0 : _node$querySelectorAl.call(node, "template");
    if (templates) {
      arrayForEach(templates, (tmpl) => {
        if (_isDocumentFragment(tmpl.content)) {
          _scrubTemplateExpressions2(tmpl.content);
        }
      });
    }
  };
  const _isClobbered = function _isClobbered2(element) {
    const realTagName = getNodeName ? getNodeName(element) : null;
    if (typeof realTagName !== "string") {
      return false;
    }
    if (transformCaseFunc(realTagName) !== "form") {
      return false;
    }
    return typeof element.nodeName !== "string" || typeof element.textContent !== "string" || typeof element.removeChild !== "function" || // Realm-safe NamedNodeMap detection: equality against the cached
    // prototype getter. Clobbered .attributes (e.g. <input name="attributes">)
    // makes the direct read diverge from the cached read; a clean form
    // (same-realm OR foreign-realm) has both reads pointing at the same
    // canonical NamedNodeMap.
    element.attributes !== getAttributes(element) || typeof element.removeAttribute !== "function" || typeof element.setAttribute !== "function" || typeof element.namespaceURI !== "string" || typeof element.insertBefore !== "function" || typeof element.hasChildNodes !== "function" || // NodeType clobbering probe. Cached Node.prototype.nodeType getter
    // returns the integer 1 for any Element regardless of realm; direct
    // read on a clobbered form (e.g. <input name="nodeType">) returns
    // the named child element. Cheap addition — nodeType is read from
    // an internal slot, no serialization cost — and removes a residual
    // clobbering surface used by several mXSS / PI / comment branches
    // in _sanitizeElements that compare currentNode.nodeType directly.
    element.nodeType !== getNodeType(element) || // HTMLFormElement has [LegacyOverrideBuiltIns]: a descendant named
    // "childNodes" shadows the prototype getter. Direct reads of
    // form.childNodes from a clobbered form return the named child
    // instead of the real NodeList, so any walk that reads it directly
    // skips the form's real children. Compare the direct read to the
    // cached Node.prototype getter — when the form's named-property
    // getter intercepts the read, the two values differ and we flag
    // the form. This catches every clobbering child type (input,
    // select, etc.) regardless of whether the named child happens to
    // carry a numeric .length, which a typeof-based probe would miss
    // (e.g. HTMLSelectElement.length is a defined unsigned-long).
    element.childNodes !== getChildNodes(element);
  };
  const _isDocumentFragment = function _isDocumentFragment2(value) {
    if (!getNodeType || typeof value !== "object" || value === null) {
      return false;
    }
    try {
      return getNodeType(value) === NODE_TYPE.documentFragment;
    } catch (_2) {
      return false;
    }
  };
  const _isNode = function _isNode2(value) {
    if (!getNodeType || typeof value !== "object" || value === null) {
      return false;
    }
    try {
      return typeof getNodeType(value) === "number";
    } catch (_2) {
      return false;
    }
  };
  function _executeHooks(hooks2, currentNode, data) {
    if (hooks2.length === 0) {
      return;
    }
    arrayForEach(hooks2, (hook) => {
      hook.call(DOMPurify, currentNode, data, CONFIG);
    });
  }
  const _isUnsafeNode = function _isUnsafeNode2(currentNode, tagName) {
    if (SAFE_FOR_XML && currentNode.hasChildNodes() && !_isNode(currentNode.firstElementChild) && regExpTest(ELEMENT_MARKUP_PROBE, currentNode.textContent) && regExpTest(ELEMENT_MARKUP_PROBE, currentNode.innerHTML)) {
      return true;
    }
    if (SAFE_FOR_XML && currentNode.namespaceURI === HTML_NAMESPACE && tagName === "style" && _isNode(currentNode.firstElementChild)) {
      return true;
    }
    if (currentNode.nodeType === NODE_TYPE.processingInstruction) {
      return true;
    }
    if (SAFE_FOR_XML && currentNode.nodeType === NODE_TYPE.comment && regExpTest(COMMENT_MARKUP_PROBE, currentNode.data)) {
      return true;
    }
    return false;
  };
  const _sanitizeDisallowedNode = function _sanitizeDisallowedNode2(currentNode, tagName, root) {
    if (!FORBID_TAGS[tagName] && _isBasicCustomElement(tagName)) {
      if (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, tagName)) {
        return false;
      }
      if (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(tagName)) {
        return false;
      }
    }
    if (KEEP_CONTENT && !FORBID_CONTENTS[tagName]) {
      const parentNode = getParentNode(currentNode);
      const childNodes = getChildNodes(currentNode);
      if (childNodes && parentNode) {
        const childCount = childNodes.length;
        for (let i2 = childCount - 1; i2 >= 0; --i2) {
          const hoisted = currentNode === root ? cloneNode(childNodes[i2], true) : childNodes[i2];
          parentNode.insertBefore(hoisted, getNextSibling(currentNode));
        }
      }
    }
    _forceRemove(currentNode);
    return true;
  };
  const _forkSharedAllowlist = function _forkSharedAllowlist2(hookList, set, defaultSet, setConfigSet) {
    if (hookList.length === 0) {
      return set;
    }
    return set === defaultSet || set === setConfigSet ? clone(set) : set;
  };
  const _sanitizeElements = function _sanitizeElements2(currentNode, root) {
    _executeHooks(hooks.beforeSanitizeElements, currentNode, null);
    if (currentNode !== root && getParentNode(currentNode) === null) {
      if (IN_PLACE) {
        _neutralizeSubtree(currentNode);
      }
      return true;
    }
    if (_isClobbered(currentNode)) {
      _forceRemove(currentNode);
      return true;
    }
    const tagName = transformCaseFunc(getNodeName ? getNodeName(currentNode) : currentNode.nodeName);
    ALLOWED_TAGS = _forkSharedAllowlist(hooks.uponSanitizeElement, ALLOWED_TAGS, DEFAULT_ALLOWED_TAGS, SET_CONFIG_ALLOWED_TAGS);
    _executeHooks(hooks.uponSanitizeElement, currentNode, {
      tagName,
      allowedTags: ALLOWED_TAGS
    });
    if (currentNode !== root && getParentNode(currentNode) === null) {
      if (IN_PLACE) {
        _neutralizeSubtree(currentNode);
      }
      return true;
    }
    if (_isUnsafeNode(currentNode, tagName)) {
      _forceRemove(currentNode);
      return true;
    }
    if (FORBID_TAGS[tagName] || !(EXTRA_ELEMENT_HANDLING.tagCheck instanceof Function && EXTRA_ELEMENT_HANDLING.tagCheck(tagName)) && !ALLOWED_TAGS[tagName]) {
      const removed = _sanitizeDisallowedNode(currentNode, tagName, root);
      if (removed === false) {
        _executeHooks(hooks.afterSanitizeElements, currentNode, null);
      }
      return removed;
    }
    const nt2 = getNodeType ? getNodeType(currentNode) : currentNode.nodeType;
    if (nt2 === NODE_TYPE.element && !_checkValidNamespace(currentNode)) {
      _forceRemove(currentNode);
      return true;
    }
    if ((tagName === "noscript" || tagName === "noembed" || tagName === "noframes") && regExpTest(FALLBACK_TAG_CLOSE, currentNode.innerHTML)) {
      _forceRemove(currentNode);
      return true;
    }
    if (SAFE_FOR_TEMPLATES && currentNode.nodeType === NODE_TYPE.text) {
      const content = _stripTemplateExpressions(currentNode.textContent);
      if (currentNode.textContent !== content) {
        arrayPush(DOMPurify.removed, {
          element: currentNode.cloneNode()
        });
        currentNode.textContent = content;
      }
    }
    _executeHooks(hooks.afterSanitizeElements, currentNode, null);
    return false;
  };
  const _isValidAttribute = function _isValidAttribute2(lcTag, lcName, value) {
    if (FORBID_ATTR[lcName]) {
      return false;
    }
    if (SAFE_FOR_XML && lcName === "patchsrc") {
      return false;
    }
    if (SAFE_FOR_XML && lcName === "for" && lcTag !== "label" && lcTag !== "output") {
      return false;
    }
    if (SANITIZE_DOM && (lcName === "id" || lcName === "name") && (value in document2 || value in formElement)) {
      return false;
    }
    const nameIsPermitted = ALLOWED_ATTR[lcName] || EXTRA_ELEMENT_HANDLING.attributeCheck instanceof Function && EXTRA_ELEMENT_HANDLING.attributeCheck(lcName, lcTag);
    if (ALLOW_DATA_ATTR && regExpTest(DATA_ATTR$1, lcName)) ;
    else if (ALLOW_ARIA_ATTR && regExpTest(ARIA_ATTR$1, lcName)) ;
    else if (!nameIsPermitted) {
      if (
        // First condition does a very basic check if a) it's basically a valid custom element tagname AND
        // b) if the tagName passes whatever the user has configured for CUSTOM_ELEMENT_HANDLING.tagNameCheck
        // and c) if the attribute name passes whatever the user has configured for CUSTOM_ELEMENT_HANDLING.attributeNameCheck
        _isBasicCustomElement(lcTag) && (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, lcTag) || CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(lcTag)) && (CUSTOM_ELEMENT_HANDLING.attributeNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.attributeNameCheck, lcName) || CUSTOM_ELEMENT_HANDLING.attributeNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.attributeNameCheck(lcName, lcTag)) || // Alternative, second condition checks if it's an `is`-attribute, AND
        // the value passes whatever the user has configured for CUSTOM_ELEMENT_HANDLING.tagNameCheck
        lcName === "is" && CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements && (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, value) || CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(value))
      ) ;
      else {
        return false;
      }
    } else if (URI_SAFE_ATTRIBUTES[lcName]) ;
    else if (regExpTest(IS_ALLOWED_URI$1, stringReplace(value, ATTR_WHITESPACE$1, ""))) ;
    else if ((lcName === "src" || lcName === "xlink:href" || lcName === "href") && lcTag !== "script" && stringIndexOf(value, "data:") === 0 && DATA_URI_TAGS[lcTag]) ;
    else if (ALLOW_UNKNOWN_PROTOCOLS && !regExpTest(IS_SCRIPT_OR_DATA$1, stringReplace(value, ATTR_WHITESPACE$1, ""))) ;
    else if (value) {
      return false;
    } else ;
    return true;
  };
  const RESERVED_CUSTOM_ELEMENT_NAMES = addToSet({}, ["annotation-xml", "color-profile", "font-face", "font-face-format", "font-face-name", "font-face-src", "font-face-uri", "missing-glyph"]);
  const _isBasicCustomElement = function _isBasicCustomElement2(tagName) {
    return !RESERVED_CUSTOM_ELEMENT_NAMES[stringToLowerCase(tagName)] && regExpTest(CUSTOM_ELEMENT$1, tagName);
  };
  const _applyTrustedTypesToAttribute = function _applyTrustedTypesToAttribute2(lcTag, lcName, namespaceURI, value) {
    if (trustedTypesPolicy && typeof trustedTypes === "object" && typeof trustedTypes.getAttributeType === "function" && !namespaceURI) {
      switch (trustedTypes.getAttributeType(lcTag, lcName)) {
        case "TrustedHTML": {
          return _createTrustedHTML(value);
        }
        case "TrustedScriptURL": {
          return _createTrustedScriptURL(value);
        }
      }
    }
    return value;
  };
  const _setAttributeValue = function _setAttributeValue2(currentNode, name, namespaceURI, value) {
    try {
      if (namespaceURI) {
        currentNode.setAttributeNS(namespaceURI, name, value);
      } else {
        currentNode.setAttribute(name, value);
      }
      if (_isClobbered(currentNode)) {
        _forceRemove(currentNode);
      } else {
        arrayPop(DOMPurify.removed);
      }
    } catch (_2) {
      _removeAttribute(name, currentNode);
    }
  };
  const _sanitizeAttributes = function _sanitizeAttributes2(currentNode) {
    _executeHooks(hooks.beforeSanitizeAttributes, currentNode, null);
    const attributes = currentNode.attributes;
    if (!attributes || _isClobbered(currentNode)) {
      return;
    }
    ALLOWED_ATTR = _forkSharedAllowlist(hooks.uponSanitizeAttribute, ALLOWED_ATTR, DEFAULT_ALLOWED_ATTR, SET_CONFIG_ALLOWED_ATTR);
    const hookEvent = {
      attrName: "",
      attrValue: "",
      keepAttr: true,
      allowedAttributes: ALLOWED_ATTR,
      forceKeepAttr: void 0
    };
    let l4 = attributes.length;
    const lcTag = transformCaseFunc(currentNode.nodeName);
    while (l4--) {
      const attr = attributes[l4];
      const name = attr.name, namespaceURI = attr.namespaceURI, attrValue = attr.value;
      const lcName = transformCaseFunc(name);
      const initValue = attrValue;
      let value = name === "value" ? initValue : stringTrim(initValue);
      hookEvent.attrName = lcName;
      hookEvent.attrValue = value;
      hookEvent.keepAttr = true;
      hookEvent.forceKeepAttr = void 0;
      _executeHooks(hooks.uponSanitizeAttribute, currentNode, hookEvent);
      value = hookEvent.attrValue;
      if (SANITIZE_NAMED_PROPS && (lcName === "id" || lcName === "name") && stringIndexOf(value, SANITIZE_NAMED_PROPS_PREFIX) !== 0) {
        _removeAttribute(name, currentNode);
        value = SANITIZE_NAMED_PROPS_PREFIX + value;
      }
      if (SAFE_FOR_XML && regExpTest(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i, value)) {
        _removeAttribute(name, currentNode);
        continue;
      }
      if (lcName === "attributename" && stringMatch(value, "href")) {
        _removeAttribute(name, currentNode);
        continue;
      }
      if (hookEvent.forceKeepAttr) {
        continue;
      }
      if (!hookEvent.keepAttr) {
        _removeAttribute(name, currentNode);
        continue;
      }
      if (!ALLOW_SELF_CLOSE_IN_ATTR && regExpTest(SELF_CLOSING_TAG, value)) {
        _removeAttribute(name, currentNode);
        continue;
      }
      if (SAFE_FOR_TEMPLATES) {
        value = _stripTemplateExpressions(value);
      }
      if (!_isValidAttribute(lcTag, lcName, value)) {
        _removeAttribute(name, currentNode);
        continue;
      }
      value = _applyTrustedTypesToAttribute(lcTag, lcName, namespaceURI, value);
      if (value !== initValue) {
        _setAttributeValue(currentNode, name, namespaceURI, value);
      }
    }
    _executeHooks(hooks.afterSanitizeAttributes, currentNode, null);
  };
  const _sanitizeShadowDOM2 = function _sanitizeShadowDOM(fragment) {
    let shadowNode = null;
    const shadowIterator = _createNodeIterator(fragment);
    _executeHooks(hooks.beforeSanitizeShadowDOM, fragment, null);
    while (shadowNode = shadowIterator.nextNode()) {
      _executeHooks(hooks.uponSanitizeShadowNode, shadowNode, null);
      _sanitizeElements(shadowNode, fragment);
      _sanitizeAttributes(shadowNode);
      if (_isDocumentFragment(shadowNode.content)) {
        _sanitizeShadowDOM2(shadowNode.content);
      }
      const shadowNodeType = getNodeType ? getNodeType(shadowNode) : shadowNode.nodeType;
      if (shadowNodeType === NODE_TYPE.element) {
        const innerSr = getShadowRoot(shadowNode);
        if (_isDocumentFragment(innerSr)) {
          _sanitizeAttachedShadowRoots(innerSr);
          _sanitizeShadowDOM2(innerSr);
        }
      }
    }
    _executeHooks(hooks.afterSanitizeShadowDOM, fragment, null);
  };
  const _sanitizeAttachedShadowRoots = function _sanitizeAttachedShadowRoots2(root) {
    const stack = [{
      node: root,
      shadow: null
    }];
    while (stack.length > 0) {
      const item = stack.pop();
      if (item.shadow) {
        _sanitizeShadowDOM2(item.shadow);
        continue;
      }
      const node = item.node;
      const nodeType = getNodeType ? getNodeType(node) : node.nodeType;
      const isElement = nodeType === NODE_TYPE.element;
      const childNodes = getChildNodes(node);
      if (childNodes) {
        for (let i2 = childNodes.length - 1; i2 >= 0; --i2) {
          stack.push({
            node: childNodes[i2],
            shadow: null
          });
        }
      }
      if (isElement) {
        const rootName = getNodeName ? getNodeName(node) : null;
        if (typeof rootName === "string" && transformCaseFunc(rootName) === "template") {
          const content = node.content;
          if (_isDocumentFragment(content)) {
            stack.push({
              node: content,
              shadow: null
            });
          }
        }
      }
      if (isElement) {
        const sr = getShadowRoot(node);
        if (_isDocumentFragment(sr)) {
          stack.push({
            node: null,
            shadow: sr
          }, {
            node: sr,
            shadow: null
          });
        }
      }
    }
  };
  DOMPurify.sanitize = function(dirty) {
    let cfg = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
    let body = null;
    let importedNode = null;
    let currentNode = null;
    let returnNode = null;
    IS_EMPTY_INPUT = !dirty;
    if (IS_EMPTY_INPUT) {
      dirty = "<!-->";
    }
    if (typeof dirty !== "string" && !_isNode(dirty)) {
      dirty = stringifyValue(dirty);
      if (typeof dirty !== "string") {
        throw typeErrorCreate("dirty is not a string, aborting");
      }
    }
    if (!DOMPurify.isSupported) {
      return dirty;
    }
    if (SET_CONFIG) {
      ALLOWED_TAGS = SET_CONFIG_ALLOWED_TAGS;
      ALLOWED_ATTR = SET_CONFIG_ALLOWED_ATTR;
    } else {
      _parseConfig(cfg);
    }
    if (hooks.uponSanitizeElement.length > 0 || hooks.uponSanitizeAttribute.length > 0) {
      ALLOWED_TAGS = clone(ALLOWED_TAGS);
    }
    if (hooks.uponSanitizeAttribute.length > 0) {
      ALLOWED_ATTR = clone(ALLOWED_ATTR);
    }
    DOMPurify.removed = [];
    const inPlace = IN_PLACE && typeof dirty !== "string" && _isNode(dirty);
    if (inPlace) {
      _neutralizePatchLinkage(dirty);
      const nn = getNodeName ? getNodeName(dirty) : dirty.nodeName;
      if (typeof nn === "string") {
        const tagName = transformCaseFunc(nn);
        if (!ALLOWED_TAGS[tagName] || FORBID_TAGS[tagName]) {
          _neutralizeRoot(dirty);
          throw typeErrorCreate("root node is forbidden and cannot be sanitized in-place");
        }
      }
      if (_isClobbered(dirty)) {
        _neutralizeRoot(dirty);
        throw typeErrorCreate("root node is clobbered and cannot be sanitized in-place");
      }
      try {
        _sanitizeAttachedShadowRoots(dirty);
      } catch (error) {
        _neutralizeRoot(dirty);
        throw error;
      }
    } else if (_isNode(dirty)) {
      body = _initDocument("<!---->");
      importedNode = body.ownerDocument.importNode(dirty, true);
      if (importedNode.nodeType === NODE_TYPE.element && importedNode.nodeName === "BODY") {
        body = importedNode;
      } else if (importedNode.nodeName === "HTML") {
        body = importedNode;
      } else {
        body.appendChild(importedNode);
      }
      _sanitizeAttachedShadowRoots(importedNode);
    } else {
      if (!RETURN_DOM && !SAFE_FOR_TEMPLATES && !WHOLE_DOCUMENT && // eslint-disable-next-line unicorn/prefer-includes
      dirty.indexOf("<") === -1) {
        return trustedTypesPolicy && RETURN_TRUSTED_TYPE ? _createTrustedHTML(dirty) : dirty;
      }
      body = _initDocument(dirty);
      if (!body) {
        return RETURN_DOM ? null : RETURN_TRUSTED_TYPE ? emptyHTML : "";
      }
    }
    if (body && FORCE_BODY) {
      _forceRemove(body.firstChild);
    }
    const walkRoot = inPlace ? dirty : body;
    try {
      const nodeIterator = _createNodeIterator(walkRoot);
      while (currentNode = nodeIterator.nextNode()) {
        _sanitizeElements(currentNode, walkRoot);
        _sanitizeAttributes(currentNode);
        if (_isDocumentFragment(currentNode.content)) {
          _sanitizeShadowDOM2(currentNode.content);
        }
      }
    } catch (error) {
      if (inPlace) {
        _neutralizeRoot(dirty);
        arrayForEach(DOMPurify.removed, (entry) => {
          if (entry.element) {
            _neutralizeSubtree(entry.element);
          }
        });
      }
      throw error;
    }
    if (inPlace) {
      arrayForEach(DOMPurify.removed, (entry) => {
        if (entry.element) {
          _neutralizeSubtree(entry.element);
        }
      });
      if (SAFE_FOR_TEMPLATES) {
        _scrubTemplateExpressions2(dirty);
      }
      return dirty;
    }
    if (RETURN_DOM) {
      if (SAFE_FOR_TEMPLATES) {
        _scrubTemplateExpressions2(body);
      }
      if (RETURN_DOM_FRAGMENT) {
        returnNode = createDocumentFragment.call(body.ownerDocument);
        while (body.firstChild) {
          returnNode.appendChild(body.firstChild);
        }
      } else {
        returnNode = body;
      }
      if (ALLOWED_ATTR.shadowroot || ALLOWED_ATTR.shadowrootmode) {
        returnNode = importNode.call(originalDocument, returnNode, true);
      }
      return returnNode;
    }
    let serializedHTML = WHOLE_DOCUMENT ? body.outerHTML : body.innerHTML;
    if (WHOLE_DOCUMENT && ALLOWED_TAGS["!doctype"] && body.ownerDocument && body.ownerDocument.doctype && body.ownerDocument.doctype.name && regExpTest(DOCTYPE_NAME, body.ownerDocument.doctype.name)) {
      serializedHTML = "<!DOCTYPE " + body.ownerDocument.doctype.name + ">\n" + serializedHTML;
    }
    if (SAFE_FOR_TEMPLATES) {
      serializedHTML = _stripTemplateExpressions(serializedHTML);
    }
    return trustedTypesPolicy && RETURN_TRUSTED_TYPE ? _createTrustedHTML(serializedHTML) : serializedHTML;
  };
  DOMPurify.setConfig = function() {
    let cfg = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
    _parseConfig(cfg);
    SET_CONFIG = true;
    SET_CONFIG_ALLOWED_TAGS = ALLOWED_TAGS;
    SET_CONFIG_ALLOWED_ATTR = ALLOWED_ATTR;
  };
  DOMPurify.clearConfig = function() {
    CONFIG = null;
    SET_CONFIG = false;
    SET_CONFIG_ALLOWED_TAGS = null;
    SET_CONFIG_ALLOWED_ATTR = null;
    trustedTypesPolicy = defaultTrustedTypesPolicy;
    emptyHTML = "";
  };
  DOMPurify.isValidAttribute = function(tag, attr, value) {
    if (!CONFIG) {
      _parseConfig({});
    }
    const lcTag = transformCaseFunc(tag);
    const lcName = transformCaseFunc(attr);
    return _isValidAttribute(lcTag, lcName, value);
  };
  DOMPurify.addHook = function(entryPoint, hookFunction) {
    if (typeof hookFunction !== "function") {
      return;
    }
    if (!objectHasOwnProperty(hooks, entryPoint)) {
      return;
    }
    arrayPush(hooks[entryPoint], hookFunction);
  };
  DOMPurify.removeHook = function(entryPoint, hookFunction) {
    if (!objectHasOwnProperty(hooks, entryPoint)) {
      return void 0;
    }
    if (hookFunction !== void 0) {
      const index = arrayLastIndexOf(hooks[entryPoint], hookFunction);
      return index === -1 ? void 0 : arraySplice(hooks[entryPoint], index, 1)[0];
    }
    return arrayPop(hooks[entryPoint]);
  };
  DOMPurify.removeHooks = function(entryPoint) {
    if (!objectHasOwnProperty(hooks, entryPoint)) {
      return;
    }
    hooks[entryPoint] = [];
  };
  DOMPurify.removeAllHooks = function() {
    hooks = _createHooksMap();
  };
  return DOMPurify;
}
var purify = createDOMPurify();
const $$1 = (id) => document.getElementById(id);
const $$ = (sel, root = document) => root ? Array.from(root.querySelectorAll(sel)) : [];
const esc = (s2) => String(s2 == null ? "" : s2).replace(/[&<>`"'$]/g, (c2) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "`": "&#96;", '"': "&quot;", "'": "&#39;", "$": "&#36;" })[c2]);
f$2.setOptions({ breaks: true, gfm: true });
const _render = (s2) => {
  const raw = f$2.parse(String(s2 == null ? "" : s2));
  return purify.sanitize(raw, { USE_PROFILES: { html: true } });
};
const mdToHtml = (s2) => _render(s2);
const mdToHtmlInline = (s2) => _render(s2);
const icon = (id, cls = "") => `<svg class="ic ${cls}" aria-hidden="true"><use href="#${id}"></use></svg>`;
function placeholderSvg(theme) {
  const pal = {
    dark: ["#241C18", "#15110F", "#F2A98C"],
    cacao: ["#3A2418", "#241712", "#F2A98C"],
    light: ["#ECE7DF", "#F4F1EC", "#B5573A"]
  }[theme] || ["#241C18", "#15110F", "#F2A98C"];
  return "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + pal[0] + '"/><stop offset="1" stop-color="' + pal[1] + '"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><g fill="none" stroke="' + pal[2] + '" stroke-width="3" opacity=".7"><rect x="118" y="64" width="84" height="60" rx="10"/><circle cx="142" cy="86" r="9"/><path d="M124 118l24-26 18 18 14-12 20 22"/></g></svg>'
  );
}
function chip(label, kind = "", ic2 = "") {
  const k2 = kind ? kind.startsWith("chip-") ? kind : "chip-" + kind : "";
  return `<span class="chip ${k2}">${ic2 ? icon(ic2) : ""}${esc(label)}</span>`;
}
function factMeta(f2, status, compact) {
  const c2 = f2.champion || {};
  const lvl = c2.level || (c2.guinee_filter ? 2 : 1);
  const st2 = status || f2.status || "PENDING_REVIEW";
  const stMap = { PENDING_REVIEW: "En attente", APPROVED: "Approuvé", REJECTED: "Rejeté", TRANSMITTED: "Transmis", EDITED: "Édité" };
  const stLabel = stMap[st2] || st2 || "En attente";
  const lvlLabel = compact ? lvl === 1 ? "Niveau 1" : "Niveau 2" : lvl === 1 ? "Niveau 1 · Source guinéenne" : "Niveau 2 · International filtrée";
  if (compact) return "";
  const items = [
    chip(lvlLabel, lvl === 1 ? "primary" : "secondary", lvl === 1 ? "i-level1" : "i-level2"),
    chip((f2.n_sources || 1) + " source" + ((f2.n_sources || 1) > 1 ? "s" : ""), "tertiary", "i-fusion"),
    chip("Date OK", "tertiary", "i-date")
  ];
  if (!compact) items.push(`<span class="badge badge-pending">${esc(stLabel)}</span>`);
  return items.join("");
}
function statusBadge(st2) {
  const map = {
    PENDING_REVIEW: ["badge-pending", "En attente"],
    APPROVED: ["badge-approved", "Approuvé"],
    REJECTED: ["badge-rejected", "Rejeté"],
    TRANSMITTED: ["badge-transmitted", "Transmis"],
    EDITED: ["badge-pending", "Édité"],
    TRASHED: ["badge-rejected", "Corbeille"]
  };
  const [k2, t2] = map[st2] || ["badge-pending", st2 || "—"];
  return `<span class="badge ${k2}">${t2}</span>`;
}
function evolutionChart(s2) {
  const days = s2.audit && s2.audit.days ? s2.audit.days.slice() : [];
  if (!days.length) return `<div class="ev-chart empty">Aucune activité enregistrée</div>`;
  const ordered = days.slice().reverse();
  const n3 = ordered.length;
  const W2 = 640, H2 = 240, padX = 38, padY = 28;
  const innerW = W2 - padX * 2, innerH = H2 - padY * 2;
  const seriesDef = [
    { key: "TOTAL", color: "var(--coral)", fill: true, get: (d2) => d2.count },
    { key: "APPROUVE", color: "var(--news)", get: (d2) => d2.counters.APPROUVE || 0 },
    { key: "REJETE", color: "var(--alert)", get: (d2) => d2.counters.REJETE || 0 },
    { key: "MODIFIE", color: "var(--signal)", get: (d2) => d2.counters.MODIFIE || 0 }
  ];
  const maxY = Math.max(1, ...seriesDef.flatMap((se2) => ordered.map(se2.get)));
  const x2 = (i2) => padX + (n3 === 1 ? innerW / 2 : i2 * innerW / (n3 - 1));
  const y4 = (v2) => padY + innerH - v2 / maxY * innerH;
  let grid = "";
  for (let g2 = 0; g2 <= 4; g2++) {
    const gy = padY + innerH * g2 / 4;
    const val = Math.round(maxY * (4 - g2) / 4);
    grid += `<line x1="${padX}" y1="${gy}" x2="${W2 - padX}" y2="${gy}" class="ev-grid"/>`;
    grid += `<text x="${padX - 6}" y="${gy + 4}" class="ev-axis-y">${val}</text>`;
  }
  let xlabels = "";
  ordered.forEach((d2, i2) => {
    const lbl = d2.label && d2.label.length > 10 ? d2.label.slice(0, 6) : d2.label || "";
    xlabels += `<text x="${x2(i2)}" y="${H2 - padY + 16}" class="ev-axis-x">${esc(lbl)}</text>`;
  });
  let paths = "", dots = "";
  seriesDef.forEach((se2) => {
    const pts = ordered.map((d2, i2) => [x2(i2), y4(se2.get(d2))]);
    const line = pts.map((p2, i2) => (i2 ? "L" : "M") + p2[0].toFixed(1) + " " + p2[1].toFixed(1)).join(" ");
    const area = se2.fill ? `<path d="${line} L ${x2(n3 - 1).toFixed(1)} ${padY + innerH} L ${x2(0).toFixed(1)} ${padY + innerH} Z" class="ev-area" style="fill:${se2.color}"/>` : "";
    paths += `${area}<path d="${line}" class="ev-line ev-series ev-${se2.key}" style="stroke:${se2.color}" data-series="${se2.key}"/>`;
    pts.forEach((p2, i2) => {
      const d2 = ordered[i2];
      const vals = seriesDef.map((s22) => `${s22.key}:${s22.get(d2)}`).join(" · ");
      dots += `<circle class="ev-dot ev-series ev-${se2.key}" data-series="${se2.key}" cx="${p2[0].toFixed(1)}" cy="${p2[1].toFixed(1)}" r="3.5" data-date="${esc(d2.label)}" data-vals="${esc(vals)}"/>`;
    });
  });
  const legend = seriesDef.map(
    (se2) => `<button class="ev-legend-item" data-toggle="${se2.key}"><span class="ev-swatch" style="background:${se2.color}"></span>${se2.key === "TOTAL" ? "Total" : se2.key === "APPROUVE" ? "Approuvé" : se2.key === "REJETE" ? "Rejeté" : "Modifié"}</button>`
  ).join("");
  return `
    <section class="ev-chart kora-wire" aria-label="Graphique d'évolution de l'activité">
      <div class="ev-head">
        <h2 class="section-title">Évolution de l'activité</h2>
        <div class="ev-legend">${legend}</div>
      </div>
      <div class="ev-plot">
        <svg viewBox="0 0 ${W2} ${H2}" class="ev-svg" preserveAspectRatio="none" role="img">
          ${grid}${xlabels}${paths}${dots}
        </svg>
        <div class="ev-tooltip" id="evTooltip" hidden></div>
      </div>
    </section>`;
}
function viewCockpit(s2) {
  const st2 = s2.stats || {};
  typeof st2.articles === "number" ? st2.articles : 0;
  typeof st2.pending === "number" ? st2.pending : 0;
  typeof st2.published === "number" ? st2.published : 0;
  typeof st2.drafts === "number" ? st2.drafts : 0;
  typeof st2.trash === "number" ? st2.trash : 0;
  typeof st2.rejected === "number" ? st2.rejected : 0;
  typeof st2.deleted === "number" ? st2.deleted : 0;
  const health = s2.health;
  const audit = s2.audit;
  const sources = s2.sources || [];
  const lastCycle = s2.lastCycle;
  return `
    <div class="cockpit kora-wire">
      <div class="decision-band" aria-hidden="true"></div>

      <!-- HERO : le fact en attente de décision (cœur du produit) -->
      ${heroFact()}

      <!-- STATS row MIXTE (KORA × BizLink, refonte A) : chart + jauge + métriques -->
      ${mixedStats(s2)}

      <!-- GRILLE DENSE : Articles en attente (extrait des facts PENDING_REVIEW) -->
      ${pendingGrid(s2)}

      <!-- GRAPHIQUE D'ÉVOLUTION : activité + décisions par jour -->
      ${evolutionChart(s2)}

      <!-- ROW 2 : System Health + Sources + Cycle Control -->
      <div class="cockpit-grid system-row">
        <section class="system-section">
          <h2 class="section-title">Santé système</h2>
          ${systemHealthPill(health)}
        </section>
        <section class="system-section sources-section" data-nav="sources" role="button" tabindex="0" aria-label="Voir la gouvernance des sources">
          <h2 class="section-title">Sources</h2>
          <div class="source-chips">
            ${sources.length ? (() => {
    const others = sources.filter((s3) => !/guin[ée]e?\\s*7/i.test(s3.name || s3.id || ""));
    const guinee7 = sources.filter((s3) => /guin[ée]e?\\s*7/i.test(s3.name || s3.id || ""));
    return [...others, ...guinee7].map((src) => sourceStatusChip(src)).join("");
  })() : '<span class="source-chip empty">Aucune source</span>'}
          </div>
        </section>
        <section class="system-section cycle-section">
          <h2 class="section-title">Contrôle cycle</h2>
          ${cycleControl(lastCycle)}
        </section>
      </div>

      <!-- ROW 3 : Activity Feed (audit temps réel) -->
      <section class="activity-section">
        <div class="section-head">
          <h2 class="section-title">Activité récente</h2>
          <button class="activity-more-link" data-action="audit-all">Voir tout l'historique →</button>
        </div>
        ${activityFeed(audit, 6)}
      </section>
    </div>
  `;
}
function heroFact(s2, pendingCount) {
  return "";
}
function mixedStats(s2) {
  const st2 = s2.stats || {};
  const pending = typeof st2.pending === "number" ? st2.pending : 0;
  const deleted = typeof st2.deleted === "number" ? st2.deleted : 0;
  const approved = typeof st2.published === "number" ? st2.published : 0;
  const rejected = typeof st2.rejected === "number" ? st2.rejected : 0;
  const days = s2.audit && s2.audit.days ? s2.audit.days.slice(-5) : [];
  const maxC = days.length ? Math.max(1, ...days.map((d2) => d2.count)) : 1;
  const bars = days.length ? days.map((d2) => ({ h: Math.max(8, Math.round(d2.count / maxC * 100)), l: d2.label ? d2.label.slice(0, 3) : "" })) : [{ h: 50, l: "Lun" }, { h: 90, l: "Mar" }, { h: 60, l: "Mer" }, { h: 75, l: "Jeu" }, { h: 100, l: "Ven" }];
  const pubRate = approved + rejected > 0 ? Math.round(approved / (approved + rejected) * 100) : approved > 0 ? 100 : 0;
  const ARC = 157;
  const barHtml = bars.map((b2) => `<div class="bar-col"><div class="bar" style="height:${b2.h}%"></div><div class="bar-label">${esc(b2.l)}</div></div>`).join("");
  return `
    <div class="cockpit-grid mixed-stats">
      <div class="card chart"><h3>Nouveaux articles</h3><div class="bars">${barHtml}</div></div>
      <div class="card gauge"><h3>Décisions validées</h3>
        <div class="gauge-wrap">
          <svg width="120" height="70" viewBox="0 0 120 70" aria-hidden="true">
            <path d="M10 65 A50 50 0 0 1 110 65" fill="none" stroke="var(--neu-light)" stroke-width="12" stroke-linecap="round"/>
            <path d="M10 65 A50 50 0 0 1 110 65" fill="none" stroke="var(--coral)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${ARC}" stroke-dashoffset="${(ARC * (1 - pubRate / 100)).toFixed(1)}"/>
            <text x="60" y="58" text-anchor="middle" fill="var(--on-surface)" font-size="18" font-family="Oswald" font-weight="700">${pubRate}%</text>
          </svg>
          <div class="gauge-lbl">Taux de publication</div>
        </div>
      </div>
      <div class="card metric"><div class="num">${pending}</div><div class="lbl">À décider</div><div class="trend up">▲ 12</div></div>
      <div class="card metric"><div class="num">${deleted}</div><div class="lbl">Supprimés (30j)</div><div class="trend down">▼ 3</div></div>
    </div>`;
}
function factCardDense(f2, s2, idx) {
  const c2 = f2.champion || {};
  const title = esc(c2.title || "(sans titre)");
  const desc = esc((c2.summary || "").slice(0, 120));
  const date = esc(c2.date || f2.date || "—");
  const fid = f2.fact_id || "idx" + idx;
  const comments = f2.comments || 0, attachments = f2.attachments || 0;
  return `
    <article class="fact-card dense" data-fact="${esc(fid)}" onclick="App.openFact('${esc(fid)}')">
      <div class="fact-title">${title}</div>
      <div class="fact-desc">${desc}</div>
      <div class="fact-meta"><span>${date}</span><span class="fact-ico"><span>💬 ${comments}</span><span>📎 ${attachments}</span></span></div>
    </article>`;
}
function pendingGrid(s2) {
  const facts = (s2.facts || []).filter((f2) => {
    const d2 = s2.decisions[f2.fact_id];
    const st2 = d2 || f2.status || "PENDING_REVIEW";
    return st2 === "PENDING_REVIEW";
  }).slice(0, 6);
  if (!facts.length) return "";
  return `
    <section>
      <div class="content-head">
        <h2 class="section-title">Articles en attente</h2>
        <button class="btn-ghost" data-action="nav-facts-all">Tout voir →</button>
      </div>
      <div class="content-grid">${facts.map((f2, i2) => factCardDense(f2, s2, i2)).join("")}</div>
    </section>`;
}
function systemHealthPill(health) {
  if (!health) return `<div class="health-pill loading"><span class="skeleton"></span></div>`;
  const mutex = health.mutex ? "🔴 Occupé" : "🟢 Libre";
  const mutexCls = health.mutex ? "busy" : "free";
  const llm = health.llm_circuit || {};
  const llmStatus = llm.failures > 0 || llm.open_until && llm.open_until > Date.now() / 1e3 ? "🟡 Dégradé" : "🟢 OK";
  const llmCls = llm.failures > 0 || llm.open_until && llm.open_until > Date.now() / 1e3 ? "degraded" : "ok";
  const transmit = health.transmit_mode || "inconnu";
  const version = health.whitelist_version || "—";
  return `
    <div class="health-pill">
      <div class="health-row">
        <span class="health-item ${mutexCls}" data-tooltip="Mutex agent">${mutex}</span>
        <span class="health-item ${llmCls}" data-tooltip="Circuit LLM: ${llm.failures} échecs, open_until=${llm.open_until || 0}">${llmStatus}</span>
        <span class="health-item" data-tooltip="Mode transmission">${transmit}</span>
        <span class="health-item version" data-tooltip="Version whitelist">${version}</span>
      </div>
    </div>`;
}
function sourceStatusChip(source) {
  const status = source.status || "unknown";
  const statusIcon = { ok: "🟢", error: "🔴", warning: "🟡", unknown: "⚪" }[status] || "⚪";
  const lastFetch = source.last_fetch ? new Date(source.last_fetch).toLocaleTimeString("fr-FR") : "—";
  return `
    <span class="source-chip" data-source-id="${source.id}" data-tooltip="${source.name || source.id} · Dernier: ${lastFetch}">
      <span class="source-dot ${status}"></span>
      <span class="source-name">${source.name || source.id}</span>
      <span class="source-status">${statusIcon}</span>
    </span>`;
}
function activityFeed(audit, limit = 6) {
  if (!audit || !audit.days || !audit.days.length) {
    return `<div class="activity-feed empty"><p>Aucune activité aujourd'hui</p></div>`;
  }
  const today = audit.days[0];
  const events = (today.events || []).slice(0, limit);
  if (!events.length) return `<div class="activity-feed empty"><p>Aucun événement aujourd'hui</p></div>`;
  const evRow = (ev) => {
    const blob = ((ev.transition || "") + " " + (ev.detail || "") + " " + (ev.action || "")).toUpperCase();
    let label = ev.action || "Activité";
    if (blob.includes("TRANSMITTED")) label = "Article transmis";
    else if (blob.includes("REJECTED")) label = "Article rejeté";
    else if (blob.includes("APPROVED")) label = "Article approuvé";
    else if (blob.includes("EDITED") || blob.includes("EDIT ")) label = "Article modifié";
    else if (blob.includes("CYCLE") || blob.includes("MODE=") || blob.includes("PROVIDER=")) label = "Cycle lancé";
    else if (blob.includes("PURGE")) label = "Historique purgé";
    else if (blob.includes("SOURCE") || blob.includes("SRC=")) label = "Source consultée";
    const time = (ev.ts || "").slice(11, 16);
    return `
      <div class="activity-row" data-ev-id="${ev.id || ""}">
        <span class="activity-dot"></span>
        <div class="activity-body">
          <span class="activity-label">${label}</span>
          <span class="activity-sub">${auditSub(ev)}</span>
        </div>
        <span class="activity-time">${time}</span>
      </div>`;
  };
  return `
    <div class="activity-feed">
      ${events.map(evRow).join("")}
      <button class="activity-more" data-action="audit-all">Voir tout l'historique →</button>
    </div>`;
}
function auditSub(ev) {
  let d2 = ev.detail || "";
  if (!d2) return "";
  if (/error|traceback|exception|attributeerror|keyerror|typeerror/i.test(d2)) return "Erreur d'exécution (voir logs)";
  const pairs = {};
  (d2.match(/(\w+)=([^\s]+)/g) || []).forEach((p2) => {
    const [k2, v2] = p2.split("=");
    pairs[k2] = v2;
  });
  const statusFr = { TRANSMITTED: "Transmis", APPROVED: "Approuvé", REJECTED: "Rejeté", EDITED: "Modifié", PENDING_REVIEW: "En attente" };
  const parts = [];
  if (pairs.src) parts.push("source : " + pairs.src);
  const st2 = pairs.status || pairs.decision;
  if (st2) parts.push("statut : " + (statusFr[st2.toUpperCase()] || st2));
  if (pairs.facts) parts.push(pairs.facts + " fait(s)");
  if (pairs.clusters) parts.push(pairs.clusters + " groupe(s)");
  if (parts.length) return parts.join(" · ");
  const clean = d2.replace(/\s+/g, " ").trim();
  return clean.length > 90 ? clean.slice(0, 87).replace(/\s+\S*$/, "") + "…" : clean;
}
function cycleControl(lastCycle) {
  var _a2;
  const running = (lastCycle == null ? void 0 : lastCycle.running) || false;
  const lastResult = lastCycle == null ? void 0 : lastCycle.result;
  const lastTs = (lastCycle == null ? void 0 : lastCycle.ts) ? new Date(lastCycle.ts).toLocaleTimeString("fr-FR") : "—";
  const lastStatus = (lastResult == null ? void 0 : lastResult.status) || "—";
  const lastCount = ((_a2 = lastResult == null ? void 0 : lastResult.facts) == null ? void 0 : _a2.length) || 0;
  return `
    <div class="cycle-control">
      <div class="cycle-status">
        <span class="cycle-indicator ${running ? "running" : "idle"}"></span>
        <span class="cycle-text">${running ? "Cycle en cours…" : `Dernier: ${lastTs} · ${lastStatus} (${lastCount} faits)`}</span>
      </div>
      <div class="cycle-actions">
        <button class="btn btn-primary" id="btnCycleNormal" ${running ? "disabled" : ""} data-action="cycle-normal">
          ${icon("i-refresh")}<span style="margin-left:6px">Lancer cycle</span>
        </button>
        <button class="btn btn-tonal" id="btnCycleForce" ${running ? "disabled" : ""} data-action="cycle-force">
          ${icon("i-spark")}<span style="margin-left:6px">Forcer (hors 24h)</span>
        </button>
      </div>
    </div>`;
}
function imgSrc(f2) {
  const c2 = f2.champion || {};
  const base = f2.image_meta && f2.image_meta.image || f2.image || c2.image || "";
  if (base && base.startsWith("http")) return base;
  const seed = (f2.fact_id || f2.id || f2.title || "kora").split("").reduce((a2, ch) => a2 + ch.charCodeAt(0), 0) % 1e5;
  return `https://picsum.photos/seed/${seed}/800/450`;
}
function factCard(f2, s2, idx) {
  const c2 = f2.champion || {};
  const dec = s2.decisions[f2.fact_id];
  const img = imgSrc(f2);
  const status = dec || (f2.status || "PENDING_REVIEW");
  const ph = placeholderSvg(Store.getTheme());
  const src = img ? esc(img) : ph;
  const seed = (f2.fact_id || f2.id || f2.title || "kora").split("").reduce((a2, ch) => a2 + ch.charCodeAt(0), 0) % 1e5;
  const fallback = `https://picsum.photos/seed/${seed}/800/450`;
  const fid = f2.fact_id || "idx" + idx;
  const sel = s2.selectMode && s2.selection[fid];
  const check = s2.selectMode ? `<div class="fact-check ${sel ? "on" : ""}" data-check="${esc(fid)}">${sel ? icon("i-check") : ""}</div>` : "";
  const click = s2.selectMode ? `onclick="Store.toggleSelect('${esc(fid)}')"` : `onclick="App.openFact('${esc(fid)}')"`;
  return `
    <article class="fact-card ${s2.selectMode ? "selectable" : ""} ${sel ? "selected" : ""}" data-fact="${esc(fid)}" data-index="${idx}" ${click}>
      ${check}
      <img class="fact-img" src="${src}" alt="" loading="lazy" onerror="this.onerror=null; this.src='${esc(fallback)}'">
      <div class="fact-body">
        <h3 class="fact-title">${esc(c2.title || "(sans titre)")}</h3>
        <div class="fact-chips">${factMeta(f2, void 0, true)}</div>
        <div class="fact-status">${statusBadge(status)} <span class="muted">${esc(c2.source || "Source")}</span></div>
      </div>
    </article>`;
}
function dayLabel(dateStr) {
  if (!dateStr) return "Date inconnue";
  const d2 = new Date(dateStr);
  if (isNaN(d2)) return "Date inconnue";
  const today = /* @__PURE__ */ new Date();
  const dayMs = 24 * 3600 * 1e3;
  const startOf = (x2) => new Date(x2.getFullYear(), x2.getMonth(), x2.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d2)) / dayMs);
  const fmt = d2.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  if (diffDays === 0) return "Aujourd'hui · " + fmt;
  if (diffDays === 1) return "Hier · " + fmt;
  if (diffDays === 2) return "Avant-hier · " + fmt;
  return diffDays + " jours avant · " + fmt;
}
function factGroupsByDay(facts, s2) {
  const byDay = /* @__PURE__ */ new Map();
  for (const f2 of facts) {
    const key = (f2.created_at || "").slice(0, 10) || "____";
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(f2);
  }
  const keys = [...byDay.keys()].filter((k2) => k2 !== "____").sort((a2, b2) => b2.localeCompare(a2));
  if (byDay.has("____")) keys.push("____");
  if (!keys.length) return '<div class="group-empty">Aucun article à afficher.</div>';
  return keys.map((k2) => {
    const list = byDay.get(k2);
    const label = k2 === "____" ? "Date inconnue" : dayLabel(k2);
    return '<section class="fact-group day-group"><div class="group-head"><span class="group-ic">' + icon("i-date") + '</span><h3 class="group-title">' + esc(label) + '</h3><span class="group-count">' + list.length + '</span></div><div class="fact-grid">' + list.map((f2) => factCard(f2, s2, (s2.facts || []).indexOf(f2))).join("") + "</div></section>";
  }).join("");
}
function viewDrafts(s2) {
  const facts = s2.facts || [];
  const drafts = facts.filter((f2) => {
    const st2 = s2.decisions[f2.fact_id] || f2.status || "PENDING_REVIEW";
    return st2 === "EDITED";
  });
  if (!drafts.length) return stateBox("i-edit", "Aucun brouillon", "Les articles que tu places en brouillon (correction en cours) apparaissent ici. Ouvre un fait depuis le Tableau de bord ou Articles, clique « Modifier », puis valide la correction pour le mettre en brouillon.", false);
  const toolbar = `<div class="toolbar-row">
      <button class="btn btn-tonal" id="enterSelect">${s2.selectMode ? "Annuler la sélection" : "Sélectionner"}</button>
    </div>`;
  const cells = drafts.map((f2) => {
    const idx = (s2.facts || []).indexOf(f2);
    const card = factCard(f2, s2, idx);
    const done = `<div class="draft-actions">
        <button class="btn btn-tonal btn-sm" data-finish="${esc(f2.fact_id)}">${icon("i-undo")} Remettre en attente</button>
      </div>`;
    return `<div class="draft-cell">${card}${done}</div>`;
  }).join("");
  return `<div class="section-title">Brouillons (${drafts.length})</div>
    <p class="muted" style="margin-bottom:16px">Contenu en cours d'édition, non encore transmis. « Remettre en attente » renvoie l'article en validation normale (sans le publier).</p>
    ${toolbar}
    <div class="fact-grid">${cells}</div>`;
}
function factCategory(s2, f2) {
  if (f2.trashed_at && f2.trashed_at !== "" || f2.status === "TRASHED") {
    if (f2.rejected || f2.decision === "REJECTED" || f2.d_status === "REJECTED") return "rejected";
    return "trash";
  }
  if (f2.status === "TRANSMITTED" || f2.status === "APPROVED") return "transmitted";
  if (f2.status === "REJECTED") return "rejected";
  if (f2.status === "EDITED") return "drafts";
  return "pending";
}
function viewFacts(s2) {
  const facts = s2.facts || [];
  const st2 = s2.stats || {};
  const counts = {
    all: typeof st2.total_facts === "number" ? st2.total_facts : facts.length,
    pending: typeof st2.pending === "number" ? st2.pending : 0,
    transmitted: typeof st2.transmitted === "number" ? st2.transmitted : 0,
    rejected: typeof st2.rejected === "number" ? st2.rejected : 0,
    drafts: typeof st2.drafts === "number" ? st2.drafts : 0,
    trash: typeof st2.trash === "number" ? st2.trash : 0
  };
  const f2 = (Store.getFactFilter() || "all").toLowerCase();
  if (!facts.length) return s2.lastCycle && s2.lastCycle.result && s2.lastCycle.result.status === "empty_or_stale" ? staleBox(s2) : stateBox("i-check", "Aucun article à afficher", "Lance un cycle ou génère une démo pour générer des articles à valider.", false, "Générer démo", () => Store.seed());
  const filters = [
    ["all", "Tous", counts.all],
    ["pending", "En attente", counts.pending],
    ["transmitted", "Transmis", counts.transmitted],
    ["rejected", "Rejetés", counts.rejected],
    ["drafts", "Brouillons", counts.drafts],
    ["trash", "Corbeille", counts.trash]
  ];
  const sortSel = Store.getFactSort() || "recent";
  const filterBar = `<div class="filter-bar">${filters.map(([k2, lab, n3]) => `<button class="filter-pill ${f2 === k2 ? "active" : ""}" data-fact-filter="${k2}">${lab} <span class="pill-n">${n3}</span></button>`).join("")}</div>
    <p class="filter-note">Chaque article compte dans une seule catégorie — la somme des filtres égale le total (${counts.all}).</p>
    <div class="toolbar-row">
      <button class="btn btn-tonal" id="enterSelect">${s2.selectMode ? "Annuler la sélection" : "Sélectionner"}</button>
      <label class="sort-label" for="factSort">Trier :</label>
      <select class="sort-select" id="factSort">
        <option value="recent"${sortSel === "recent" ? " selected" : ""}>Plus récents</option>
        <option value="oldest"${sortSel === "oldest" ? " selected" : ""}>Plus anciens</option>
        <option value="title"${sortSel === "title" ? " selected" : ""}>Titre A→Z</option>
      </select>
    </div>`;
  let body;
  const catOf = (ft) => {
    if (ft.status === "TRASHED" || ft.trashed_at && ft.trashed_at !== "") {
      if (ft.rejected || ft.decision === "REJECTED" || ft.d_status === "REJECTED") return "rejected";
      return "trash";
    }
    if (ft.status === "TRANSMITTED" || ft.status === "APPROVED") return "transmitted";
    if (ft.status === "REJECTED") return "rejected";
    if (ft.status === "EDITED") return "drafts";
    return "pending";
  };
  let list = facts;
  if (["pending", "transmitted", "rejected", "drafts", "trash"].includes(f2)) {
    list = list.filter((x2) => catOf(x2) === f2);
  }
  const q2 = (Store.getFactQuery() || "").toLowerCase().trim();
  if (q2) {
    list = list.filter((x2) => {
      const c2 = x2.champion || {};
      return [c2.title, c2.summary, c2.source, x2.fact_id].some((v2) => (v2 || "").toLowerCase().includes(q2));
    });
  }
  const sort = sortSel;
  list = list.slice().sort((a2, b2) => {
    var _a2, _b2;
    if (sort === "title") return (((_a2 = a2.champion) == null ? void 0 : _a2.title) || "").localeCompare(((_b2 = b2.champion) == null ? void 0 : _b2.title) || "", "fr");
    if (sort === "oldest") return new Date(a2.captured_at || 0) - new Date(b2.captured_at || 0);
    return new Date(b2.captured_at || 0) - new Date(a2.captured_at || 0);
  });
  body = factGroupsByDay(list, s2);
  return filterBar + body;
}
globalThis.__viewFacts = viewFacts;
function trashCard(f2, s2) {
  const c2 = f2.champion || {};
  const img = imgSrc(f2);
  const ph = placeholderSvg(Store.getTheme());
  const src = img ? esc(img) : ph;
  const trashed = f2.trashed_at ? new Date(f2.trashed_at).toLocaleString("fr-FR") : "";
  return `<article class="fact-card trash-card" data-fact="${esc(f2.fact_id)}">
    <img class="fact-img" src="${src}" alt="" loading="lazy" onerror="this.src='${ph}'">
    <div class="fact-body">
      <div class="trash-flag">${icon("i-trash")} Corbeille</div>
      <h3 class="fact-title">${esc(c2.title || "(sans titre)")}</h3>
      <div class="fact-chips">${chip(c2.source || "Source", "secondary", "i-source")}${chip(trashed || "Date inconnue", "tertiary", "i-date")}</div>
      <div class="fact-status">${statusBadge("TRASHED")} <span class="muted">${esc(c2.source || "")}</span></div>
      <div class="trash-actions">
        <button class="btn btn-tonal btn-sm" data-restore="${esc(f2.fact_id)}">${icon("i-undo")} Restaurer</button>
        <button class="btn btn-danger btn-sm" data-del="${esc(f2.fact_id)}">${icon("i-trash")} Supprimer</button>
      </div>
    </div>
  </article>`;
}
function viewTrash(s2) {
  const items = s2.trash || [];
  if (!items.length) return stateBox("i-trash", "Corbeille vide", "Les articles supprimés restent ici 11 jours, puis sont purgés automatiquement. Restaure-les ou supprime-les définitivement.", false);
  return `<div class="section-title">Corbeille (${items.length})</div>
    <p class="muted" style="margin-bottom:16px">Restauration possible pendant 11 jours. Au-delà, suppression définitive automatique.</p>
    <div class="fact-grid">${items.map((f2) => trashCard(f2)).join("")}</div>`;
}
function viewSources(s2) {
  const src = s2.sources || [];
  if (!src.length) return stateBox("i-sources", "Sources en chargement…", "Récupération de la liste de sources autorisées.", !!s2.ui.loading);
  const g1 = src.filter((e2) => e2.category === "GN_NAT" && !/guin[ée]e?\s*7/i.test(e2.name || e2.id || ""));
  const g2 = src.filter((e2) => e2.category !== "GN_NAT" && !/guin[ée]e?\s*7/i.test(e2.name || e2.id || ""));
  const gOther = src.filter((e2) => /guin[ée]e?\s*7/i.test(e2.name || e2.id || ""));
  const srcRow = (e2) => `
    <div class="list-row src-row">
      <span class="meta-ic">${icon(e2.guinee_filter ? "i-shield" : "i-sources")}</span>
      <div class="meta">
        <div class="name">${esc(e2.name)} ${e2.guinee_filter ? chip("Filtre Guinée", "warning", "i-shield") : ""}</div>
        <div class="sub">${esc(e2.category)} · ${esc(e2.vector_primary)} · ${esc(e2.entry_url)}</div>
      </div>
      ${chip(e2.category === "GN_NAT" ? "Niveau 1" : "Niveau 2", e2.category === "GN_NAT" ? "primary" : "secondary")}
    </div>`;
  return `<div class="section-title">Gouvernance des sources (${src.length})</div>
    <p class="muted" style="margin-bottom:16px">Whitelist figée G1 — aucune découverte automatique. Toute cible hors liste est refusée.</p>
    <section class="fact-group">
      <div class="group-head"><span class="group-ic">${icon("i-level1")}</span><h3 class="group-title">Niveau 1 · Sources guinéennes</h3><span class="group-count">${g1.length}</span></div>
      ${g1.map(srcRow).join("") || `<div class="muted" style="padding:8px 0">Aucune source de niveau 1.</div>`}
    </section>
    <section class="fact-group">
      <div class="group-head"><span class="group-ic">${icon("i-level2")}</span><h3 class="group-title">Niveau 2 · International filtrées</h3><span class="group-count">${g2.length}</span></div>
      ${g2.map(srcRow).join("") || `<div class="muted" style="padding:8px 0">Aucune source de niveau 2.</div>`}
    </section>
    ${gOther.length ? `<section class="fact-group">
      <div class="group-head"><span class="group-ic">${icon("i-sources")}</span><h3 class="group-title">Autres sources</h3><span class="group-count">${gOther.length}</span></div>
      ${gOther.map(srcRow).join("")}
    </section>` : ""}`;
}
function viewSettings(s2) {
  var _a2, _b2, _c, _d, _e2, _f, _g, _h, _i, _j, _k, _l, _m;
  const theme = Store.getTheme();
  const isAdvanced = s2.auth && s2.auth.role === "advanced";
  const isAdmin = s2.auth && (s2.auth.role === "admin" || s2.auth.role === "advanced");
  const generalItems = [
    { id: "appearance", ic: "i-palette", title: "Apparence", sub: "Thème de l'interface" },
    { id: "account", ic: "i-user", title: "Compte", sub: "Mot de passe, session" }
  ];
  const advancedItems = isAdvanced ? [
    { id: "personalization", ic: "i-brush", title: "Personnalisation", sub: "Nom, logo, couleurs, libellés" },
    { id: "accounts", ic: "i-users", title: "Comptes & habilitations", sub: "Utilisateurs et rôles" }
  ] : [];
  const adminItems = isAdmin ? [
    { id: "auditlog", ic: "i-shield", title: "Journal d'audit", sub: "Connexions, mots de passe, paramètres" }
  ] : [];
  const railItem = (it2, active) => `<button class="settings-nav-item ${active ? "active" : ""}" data-setnav="${it2.id}">
      <span class="meta-ic">${icon(it2.ic)}</span>
      <div class="meta"><div class="name">${esc(it2.title)}</div><div class="sub">${esc(it2.sub)}</div></div>
      <span class="chev">${icon("i-chevron-right")}</span>
    </button>`;
  return `<div class="section-title">Paramètres ${isAdvanced ? `<span class="role-badge role-advanced">Avancé</span>` : ""}</div>
    <p class="muted" style="margin-bottom:16px">Réglages de l'interface, du compte et du projet ${esc(s2.app_name || "KORA Agent")}.</p>
    <div class="settings-layout">
      <nav class="settings-rail" role="navigation" aria-label="Catégories de paramètres">
        <div class="settings-rail-group">Généraux</div>
        ${generalItems.map((it2) => railItem(it2, it2.id === "appearance")).join("")}
        ${advancedItems.length ? `<div class="settings-rail-group">Avancés</div>${advancedItems.map((it2) => railItem(it2, false)).join("")}` : ""}
        ${adminItems.length ? `<div class="settings-rail-group">Administrateur</div>${adminItems.map((it2) => railItem(it2, false)).join("")}` : ""}
      </nav>

      <!-- Tiroirs (drawers) par catégorie — deviennent le panneau détail sur desktop/tablette via CSS -->
      <div class="drawer-scrim" id="setDrawerScrim" hidden></div>

      <aside class="settings-panel" id="drawer-appearance" hidden>
      <div class="drawer-head"><button class="drawer-back" type="button" data-setback aria-label="Retour">${icon("i-chevron")}</button><h2>Apparence</h2></div>
      <div class="drawer-body">
        <p class="muted" style="margin:0 0 14px">Choisis le fond de l'interface. L'aperçu se met à jour instantanément.</p>
        <div class="theme-grid">
          <button class="theme-card ${theme === "dark" ? "active" : ""}" data-theme-btn="dark" aria-pressed="${theme === "dark"}">
            <span class="theme-preview theme-preview-dark"><span class="tp-bar"></span><span class="tp-card"></span><span class="tp-card short"></span></span>
            <span class="theme-meta"><span class="name">Sombre</span><span class="sub">Fond sombre (par défaut)</span></span>
            <span class="check">${theme === "dark" ? icon("i-check") : ""}</span>
          </button>
          <button class="theme-card ${theme === "light" ? "active" : ""}" data-theme-btn="light" aria-pressed="${theme === "light"}">
            <span class="theme-preview theme-preview-light"><span class="tp-bar"></span><span class="tp-card"></span><span class="tp-card short"></span></span>
            <span class="theme-meta"><span class="name">Clair</span><span class="sub">Fond clair</span></span>
            <span class="check">${theme === "light" ? icon("i-check") : ""}</span>
          </button>
          <button class="theme-card ${theme === "cacao" ? "active" : ""}" data-theme-btn="cacao" aria-pressed="${theme === "cacao"}">
            <span class="theme-preview theme-preview-cacao"><span class="tp-bar"></span><span class="tp-card"></span><span class="tp-card short"></span></span>
            <span class="theme-meta"><span class="name">Cacao</span><span class="sub">Chocolat chaud</span></span>
            <span class="check">${theme === "cacao" ? icon("i-check") : ""}</span>
          </button>
        </div>
      </div>
    </aside>

    <aside class="settings-panel" id="drawer-account" hidden>
      <div class="drawer-head"><button class="drawer-back" type="button" data-setback aria-label="Retour">${icon("i-chevron")}</button><h2>Compte</h2></div>
      <div class="drawer-body">
        <div class="setting-card">
          <div class="setting-card-head"><span class="meta-ic">${icon("i-lock")}</span><div class="meta"><div class="name">Changer le mot de passe</div><div class="sub">8 caractères minimum.</div></div></div>
          <div class="field-row">
            <div class="field"><span>Mot de passe actuel</span><span class="pw-wrap"><input class="text-input" id="setCurPw" type="password" maxlength="64" autocomplete="current-password"><button type="button" class="pw-toggle" data-pw="setCurPw" aria-label="Afficher">${icon("i-eye")}</button></span></div>
            <div class="field"><span>Nouveau</span><span class="pw-wrap"><input class="text-input" id="setNewPw" type="password" maxlength="64" autocomplete="new-password"><button type="button" class="pw-toggle" data-pw="setNewPw" aria-label="Afficher">${icon("i-eye")}</button></span></div>
            <div class="field"><span>Confirmer</span><span class="pw-wrap"><input class="text-input" id="setNewPw2" type="password" maxlength="64" autocomplete="new-password"><button type="button" class="pw-toggle" data-pw="setNewPw2" aria-label="Afficher">${icon("i-eye")}</button></span></div>
          </div>
          <div class="actions"><button class="btn btn-primary" id="setChangePw">Mettre à jour le mot de passe</button></div>
        </div>
        <div class="setting-card">
          <div class="setting-card-head"><span class="meta-ic">${icon("i-user")}</span><div class="meta"><div class="name">Session</div><div class="sub">Connecté en tant que ${esc(Store.state.auth.username || "—")}</div></div></div>
          <div class="actions"><button class="btn btn-ghost" id="setLogout">Se déconnecter</button></div>
        </div>
      </div>
    </aside>

    ${isAdvanced ? `<aside class="settings-panel" id="drawer-personalization" hidden>
      <div class="drawer-head"><button class="drawer-back" type="button" data-setback aria-label="Retour">${icon("i-chevron")}</button><h2>Personnalisation</h2></div>
      <div class="drawer-body">
        <div class="setting-card">
          <div class="setting-card-head"><span class="meta-ic">${icon("i-spark")}</span><div class="meta"><div class="name">Nom de l'application</div><div class="sub">Affiché dans la barre supérieure et le rail.</div></div></div>
          <div class="field"><input class="text-input" id="setAppName" type="text" maxlength="40" value="${esc(((_a2 = s2.settings) == null ? void 0 : _a2.app_name) || "KORA Agent")}" placeholder="KORA Agent"></div>
        </div>
        <div class="setting-card">
          <div class="setting-card-head"><span class="meta-ic">${icon("i-logo")}</span><div class="meta"><div class="name">Logo</div><div class="sub">Image carrée (SVG/PNG, ≤ 256 Ko). Laisse vide pour l'icône par défaut.</div></div></div>
          <div class="logo-edit">
            <div class="logo-preview" id="setLogoPreview">${((_b2 = s2.settings) == null ? void 0 : _b2.has_logo) ? `<img src="${esc(s2.settings.logo_data)}" alt="">` : icon("i-spark")}</div>
            <div class="logo-actions">
              <label class="btn btn-ghost btn-sm"><input type="file" id="setLogoFile" accept="image/*" hidden>Choisir un fichier</label>
              <button class="btn btn-ghost btn-sm" id="setLogoClear" ${((_c = s2.settings) == null ? void 0 : _c.has_logo) ? "" : "disabled"}>Retirer</button>
            </div>
          </div>
        </div>
        <div class="setting-card">
          <div class="setting-card-head"><span class="meta-ic">${icon("i-palette")}</span><div class="meta"><div class="name">Couleurs d'accent</div><div class="sub">Coral (principal) et Bordeaux (secondaire). Aperçu en direct.</div></div></div>
          <div class="color-edit">
            <label class="color-field">Coral <input type="color" id="setCoral" value="${esc(((_d = s2.settings) == null ? void 0 : _d.accent_coral) || "#F2A98C")}"></label>
            <label class="color-field">Bordeaux <input type="color" id="setBordeaux" value="${esc(((_e2 = s2.settings) == null ? void 0 : _e2.accent_bordeaux) || "#E08A84")}"></label>
            <span class="color-swatch" id="setSwatch" style="background:linear-gradient(135deg, ${esc(((_f = s2.settings) == null ? void 0 : _f.accent_coral) || "#F2A98C")}, ${esc(((_g = s2.settings) == null ? void 0 : _g.accent_bordeaux) || "#E08A84")})"></span>
          </div>
        </div>
        <div class="setting-card">
          <div class="setting-card-head"><span class="meta-ic">${icon("i-edit")}</span><div class="meta"><div class="name">Libellés de l'interface</div><div class="sub">Personnalise le nom des onglets et le sous-titre (white-label).</div></div></div>
          <div class="field-row">
            <div class="field"><span>Tableau</span><input class="text-input" id="setLblCockpit" type="text" maxlength="30" value="${esc(((_h = s2.settings) == null ? void 0 : _h.label_cockpit) || "Tableau")}"></div>
            <div class="field"><span>Articles</span><input class="text-input" id="setLblFacts" type="text" maxlength="30" value="${esc(((_i = s2.settings) == null ? void 0 : _i.label_facts) || "Articles")}"></div>
            <div class="field"><span>Sources</span><input class="text-input" id="setLblSources" type="text" maxlength="30" value="${esc(((_j = s2.settings) == null ? void 0 : _j.label_sources) || "Sources")}"></div>
            <div class="field"><span>Brouillons</span><input class="text-input" id="setLblDrafts" type="text" maxlength="30" value="${esc(((_k = s2.settings) == null ? void 0 : _k.label_drafts) || "Brouillons")}"></div>
            <div class="field"><span>Historique</span><input class="text-input" id="setLblAudit" type="text" maxlength="30" value="${esc(((_l = s2.settings) == null ? void 0 : _l.label_audit) || "Historique")}"></div>
            <div class="field" style="grid-column:1/-1"><span>Sous-titre (À propos)</span><input class="text-input" id="setTagline" type="text" maxlength="30" value="${esc(((_m = s2.settings) == null ? void 0 : _m.app_tagline) || "Poste de pilotage de l'agent éditorial")}"></div>
          </div>
        </div>
        <div class="setting-card">
          <div class="actions"><button class="btn btn-primary" id="setSave">Enregistrer les modifications</button></div>
        </div>
      </div>
    </aside>

    <aside class="settings-panel" id="drawer-accounts" hidden>
      <div class="drawer-head"><button class="drawer-back" type="button" data-setback aria-label="Retour">${icon("i-chevron")}</button><h2>Comptes & habilitations</h2></div>
      <div class="drawer-body">
        <p class="muted" style="margin:0 0 14px">Gère qui fait quoi. Le rôle « Avancé » donne accès à tous les réglages, la gestion des comptes et les actions sensibles. Le rôle « Normal » est limité à la génération et à la validation.</p>
        <div class="setting-card">
          <div class="setting-card-head"><span class="meta-ic">${icon("i-users")}</span><div class="meta"><div class="name">Comptes existants</div><div class="sub">${(s2.users || []).length} compte(s)</div></div></div>
          <div class="user-list" id="userList">
            ${(s2.users || []).map((u2) => `<div class="user-row" data-id="${esc(u2.id)}">
              <div class="meta"><div class="name">${esc(u2.username)}</div><div class="sub">${esc(u2.email || "—")}</div></div>
              <div class="role-edit">
                <select class="text-input role-select" data-id="${esc(u2.id)}">
                  <option value="normal" ${(u2.role || "normal") === "normal" ? "selected" : ""}>Normal</option>
                  <option value="advanced" ${(u2.role || "normal") === "advanced" ? "selected" : ""}>Avancé</option>
                </select>
                <button class="btn btn-ghost btn-sm user-del" data-id="${esc(u2.id)}">Retirer</button>
              </div>
            </div>`).join("")}
          </div>
        </div>
        <div class="setting-card">
          <div class="setting-card-head"><span class="meta-ic">${icon("i-user-plus")}</span><div class="meta"><div class="name">Ajouter un compte</div><div class="sub">Identifiant (3+), email, mot de passe (8+), rôle.</div></div></div>
          <div class="field-row">
            <div class="field"><span>Identifiant</span><input class="text-input" id="setNewUser" type="text" maxlength="40" placeholder="redacteur1"></div>
            <div class="field"><span>Email</span><input class="text-input" id="setNewEmail" type="email" maxlength="80" placeholder="redacteur@kora.reach"></div>
            <div class="field"><span>Mot de passe</span><input class="text-input" id="setNewUserPw" type="password" maxlength="64" placeholder="••••••••" autocomplete="new-password"></div>
            <div class="field"><span>Rôle</span><select class="text-input" id="setNewUserRole"><option value="normal" selected>Normal</option><option value="advanced">Avancé</option></select></div>
          </div>
          <div class="actions"><button class="btn btn-primary" id="setAddUser">Créer le compte</button></div>
        </div>
      </div>
    </aside>` : ""}
    ${isAdmin ? `<aside class="settings-panel" id="drawer-auditlog" hidden>
      <div class="drawer-head"><button class="drawer-back" type="button" data-setback aria-label="Retour">${icon("i-chevron")}</button><h2>Journal d'audit</h2>
        <button class="btn btn-ghost btn-sm" id="auditLogRefresh" style="margin-left:auto">Rafraîchir</button></div>
      <div class="drawer-body">
        <p class="muted" style="margin:0 0 14px">Trace les actions sensibles de l'administrateur : connexions, changements de mot de passe, modifications de paramètres. Réservé à l'administrateur.</p>
        <div id="auditLogBody"><p class="muted">Cliquez sur « Journal d'audit » pour charger les événements.</p></div>
      </div>
    </aside>` : ""}
    </div>`;
}
function viewAudit(s2) {
  const data = s2.audit || {};
  const days = data.days || [];
  const total = data.total || 0;
  if (!days.length) return stateBox("i-audit", "Historique vide", "Aucune activité enregistrée pour l'instant. Lance un cycle pour peupler l'historique.", false);
  const ACTION_FR = { GENERE: "Générés", TRANSMIS: "Transmis", APPROUVE: "Approuvés", REJETE: "Rejetés", MODIFIE: "Modifiés", SUPPRIME: "Supprimés", CORBEILLE: "Corbeille", CYCLE: "Cycles", PURGE: "Purges", ADMIN: "Admin", AUTRE: "Autres" };
  const ACTION_CLS = { GENERE: "primary", TRANSMIS: "tertiary", APPROUVE: "tertiary", REJETE: "error", MODIFIE: "warning", SUPPRIME: "error", CORBEILLE: "error", CYCLE: "secondary", PURGE: "secondary", ADMIN: "secondary", AUTRE: "secondary" };
  const transitionBadge = (ev) => {
    ev.transition || ev.detail && ev.detail.match(/(PENDING_REVIEW|APPROVED|EDITED|REJECTED|TRANSMITTED)\s*→\s*(APPROVED|EDITED|REJECTED|TRANSMITTED)/);
    if (ev.transition) return `<span class="badge badge-pending">${esc(ev.transition.replace(/_/g, " "))}</span>`;
    return "";
  };
  const auditLabel = (ev) => {
    const blob = ((ev.transition || "") + " " + (ev.detail || "") + " " + (ev.action || "")).toUpperCase();
    if (blob.includes("TRANSMITTED")) return "Article transmis";
    if (blob.includes("REJECTED")) return "Article rejeté";
    if (blob.includes("APPROVED")) return "Article approuvé";
    if (blob.includes("EDITED") || blob.includes("EDIT ")) return "Article modifié";
    if (blob.includes("CYCLE") || blob.includes("MODE=") || blob.includes("PROVIDER=")) return "Cycle lancé";
    if (blob.includes("PURGE")) return "Historique purgé";
    if (blob.includes("SOURCE") || blob.includes("SRC=")) return "Source consultée";
    const k2 = (ev.kind || "").toLowerCase();
    if (k2 === "reject") return "Article rejeté";
    if (k2 === "edit") return "Article modifié";
    if (k2 === "approve" || k2 === "transmit") return "Article transmis";
    if (k2 === "cycle" || k2 === "run") return "Cycle lancé";
    if (k2 === "source") return "Source mise à jour";
    return ev.action || "Activité";
  };
  const auditSub2 = (ev) => {
    let d2 = ev.detail || "";
    if (!d2) return "";
    if (/error|traceback|exception|attributeerror|keyerror|typeerror/i.test(d2)) return "Erreur d'exécution (voir logs)";
    const pairs = {};
    (d2.match(/(\w+)=([^\s]+)/g) || []).forEach((p2) => {
      const [k2, v2] = p2.split("=");
      pairs[k2] = v2;
    });
    const statusFr = { TRANSMITTED: "Transmis", APPROVED: "Approuvé", REJECTED: "Rejeté", EDITED: "Modifié", PENDING_REVIEW: "En attente" };
    const parts = [];
    if (pairs.src) parts.push("source : " + pairs.src);
    const st2 = pairs.status || pairs.decision;
    if (st2) parts.push("statut : " + (statusFr[st2.toUpperCase()] || st2));
    if (pairs.facts) parts.push(pairs.facts + " fait(s)");
    if (pairs.clusters) parts.push(pairs.clusters + " groupe(s)");
    if (ev.editor) parts.push("par " + ev.editor);
    if (parts.length) return parts.join(" · ");
    const clean = d2.replace(/\s+/g, " ").trim();
    return clean.length > 90 ? clean.slice(0, 87).replace(/\s+\S*$/, "") + "…" : clean;
  };
  const auditTime = (ev) => {
    const t2 = (ev.ts || "").replace("T", " ").slice(0, 16);
    return t2.slice(11) || t2;
  };
  const filt = s2.auditFilter || { type: "all", q: "" };
  const matchEv = (ev) => {
    if (filt.type && filt.type !== "all") {
      const a2 = (ev.action || "").toUpperCase();
      if (filt.type === "corbeille" && a2 !== "SUPPRIME" && a2 !== "CORBEILLE") return false;
      if (filt.type !== "corbeille" && a2 !== filt.type.toUpperCase()) return false;
    }
    if (filt.q) {
      const blob = ((ev.transition || "") + " " + (ev.detail || "") + " " + (ev.action || "") + " " + (ev.editor || "") + " " + (ev.event || "")).toLowerCase();
      if (!blob.includes(filt.q.toLowerCase())) return false;
    }
    return true;
  };
  const visEvents = (day) => day.events.filter(matchEv);
  const evRow = (ev) => `
    <div class="list-row audit-row" data-ev="${esc(ev.id)}">
      <input type="checkbox" class="audit-check" data-id="${esc(ev.id)}" aria-label="Sélectionner">
      <span class="meta-ic">${icon(ev.kind === "reject" ? "i-reject" : ev.kind === "edit" ? "i-edit" : "i-check")}</span>
      <div class="meta">
        <div class="name">${esc(auditLabel(ev))} ${transitionBadge(ev)}</div>
        <div class="sub">${esc(auditSub2(ev))}</div>
      </div>
      <div class="sub audit-time">${esc(auditTime(ev))}</div>
    </div>`;
  const counterChips = (counters) => Object.keys(ACTION_FR).filter((a2) => (counters[a2] || 0) > 0).map((a2) => `<span class="chip chip-${ACTION_CLS[a2]}">${ACTION_FR[a2]} : ${counters[a2]}</span>`).join("");
  const dayBlock = (day) => `
    <section class="fact-group audit-day" data-day="${esc(day.date)}">
      <div class="group-head">
        <span class="group-ic">${icon("i-date")}</span>
        <h3 class="group-title">${esc(day.label)}</h3>
        <span class="group-count">${day.count}</span>
        <button class="btn btn-ghost btn-sm audit-purge-day" data-day="${esc(day.date)}">Réinitialiser le jour</button>
      </div>
      <div class="audit-counters">${counterChips(day.counters)}</div>
      <div class="audit-events">${visEvents(day).map(evRow).join("")}</div>
    </section>`;
  return `<div class="section-title">Historique <span class="muted">(${total} événement(s))</span></div>
    <div class="audit-filters">
      <div class="audit-filter-chips">
        <button class="chip-filter ${filt.type === "all" ? "active" : ""}" data-type="all">Tous</button>
        <button class="chip-filter ${filt.type === "transmis" ? "active" : ""}" data-type="transmis">Transmis</button>
        <button class="chip-filter ${filt.type === "rejete" ? "active" : ""}" data-type="rejete">Rejetés</button>
        <button class="chip-filter ${filt.type === "modifie" ? "active" : ""}" data-type="modifie">Modifiés</button>
        <button class="chip-filter ${filt.type === "genere" ? "active" : ""}" data-type="genere">Générés</button>
        <button class="chip-filter ${filt.type === "cycle" ? "active" : ""}" data-type="cycle">Cycles</button>
        <button class="chip-filter ${filt.type === "corbeille" ? "active" : ""}" data-type="corbeille">Corbeille</button>
      </div>
      <input class="text-input audit-search" id="auditSearch" type="search" placeholder="Rechercher (libellé, détail, éditeur)…" value="${esc(filt.q || "")}">
    </div>
    <div class="audit-toolbar">
      <button class="btn btn-ghost btn-sm" id="auditSelAll">Tout sélectionner</button>
      <button class="btn btn-ghost btn-sm" id="auditSelNone">Désélectionner</button>
      <button class="btn btn-danger btn-sm" id="auditDelSel" disabled>Supprimer la sélection</button>
      <button class="btn btn-outline btn-sm" id="auditExport">Exporter (CSV)</button>
      <div class="spacer"></div>
      <button class="btn btn-outline btn-sm" id="auditResetToday">Réinitialiser aujourd'hui</button>
      <button class="btn btn-danger btn-sm" id="auditPurgeAll">Vider tout l'historique</button>
    </div>
    <div class="audit-floatbar" id="auditFloatbar">
      <span class="fb-count" id="auditFbCount">0 sélectionné(s)</span>
      <span class="fb-spacer"></span>
      <button class="btn btn-ghost btn-sm" id="auditFbAll">Tout</button>
      <button class="btn btn-ghost btn-sm" id="auditFbNone">Aucun</button>
      <button class="btn btn-danger btn-sm" id="auditFbDel" disabled>Supprimer</button>
    </div>
    ${days.map(dayBlock).join("")}`;
}
function staleBox(s2) {
  const r2 = s2.lastCycle && s2.lastCycle.result || {};
  const msg = r2.message || "Aucune publication dans la fenêtre 24h.";
  const n3 = r2.stale_count || 0;
  return `<div class="state-box">
    <span class="state-ic"><svg class="ic"><use href="#i-info"/></svg></span>
    <h3>Aucune information fraîche dans les 24 dernières heures</h3>
    <p>${esc(msg)}</p>
    <p class="muted" style="margin-top:8px">Règle de fraîcheur stricte : KORA ne génère un article que si une source whitelist a publié une information dans les 24h. ${n3 ? `(${n3} item(s) collecté(s) datent de plus de 24h et ne sont pas utilisés.)` : ""} Revenez plus tard pour de l'information en temps réel.</p>
    <button class="btn btn-primary" id="stateAction">Relancer un cycle</button>
  </div>`;
}
function stateBox(ic2, title, msg, loading = false, actionLabel = null, actionFn = null, kind = "") {
  const icWrap = loading ? `<div class="wave" style="height:34px;margin:0 auto 18px"><i></i><i></i><i></i><i></i><i></i></div>` : `<span class="state-ic ${kind === "error" ? "err" : ""}">${icon(ic2)}</span>`;
  return `<div class="state-box ${kind === "error" ? "error" : ""}">
    ${icWrap}
    <h3>${esc(title)}</h3>
    <p>${esc(msg)}</p>
    ${actionLabel ? `<button class="btn btn-primary" id="stateAction">${esc(actionLabel)}</button>` : ""}
  </div>`;
}
function renderSheet(s2) {
  const sh = s2.sheet;
  const body = document.getElementById("sheetBody");
  const sheet = document.getElementById("sheet");
  const scrim = document.getElementById("sheetScrim");
  if (!sh || !body || !sheet || !scrim) {
    sheet.hidden = true;
    scrim.hidden = true;
    return;
  }
  const f2 = sh.fact;
  const c2 = f2.champion || {};
  const img = imgSrc(f2);
  const ph = placeholderSvg(Store.getTheme());
  const text2 = (typeof f2.article === "string" ? f2.article : f2.article && (f2.article.final_text || f2.article.body)) || f2.final_text || c2.summary || "";
  const status = f2.status || "PENDING_REVIEW";
  let _clean = text2.replace(/^#\s.*\n+/, "");
  const _rawParas = _clean.split(/\n{2,}/).map((p2) => p2.trim()).filter(Boolean);
  let _paras = _rawParas;
  if (_paras.length <= 1 && _clean.includes("\n")) {
    _paras = _clean.split(/\n+/).map((p2) => p2.trim()).filter(Boolean);
  }
  const _first = _paras[0] || _clean;
  const standfirst = _first;
  let bodyText = _clean.startsWith(_first) ? _clean.slice(_first.length).trim() : _clean;
  bodyText = bodyText.replace(/^##\s*Le fait en bref\b[\s\S]*?(?=##\s*Décryptage)/i, "").trim();
  body.innerHTML = `
    <article class="sheet-article">
      ${img ? `<figure class="sheet-figure"><img class="sheet-img" src="${esc(img)}" alt="" onerror="this.src='${ph}'"><figcaption class="sheet-cap">Illustration IA — KORA Agent</figcaption></figure>` : `<figure class="sheet-figure"><img class="sheet-img" src="${ph}" alt=""><figcaption class="sheet-cap">Illustration IA — KORA Agent</figcaption></figure>`}
      <div class="sheet-head">
        ${icon("i-shield", "ic-l")}
        <div class="sheet-head-text">
          <div class="sheet-eyebrow">Validation humaine · KORA Agent</div>
          <h2 class="sheet-title">${esc(c2.title)}</h2>
          <div class="sheet-meta-line">
            <span>${esc(c2.source || "—")}</span>
            <span class="dot-sep">·</span>
            <span>${esc(f2.champion && f2.champion.level === 1 ? "Niveau 1 · Source guinéenne" : "Niveau 2 · International")}</span>
            <span class="dot-sep">·</span>
            <span>Fusion ${esc(f2.n_sources || 1)} source(s)</span>
            ${f2.forced_stale ? '<span class="tag tag-warn" style="margin-left:6px">Hors fenêtre 48h</span>' : ""}
          </div>
        </div>
        <button class="sheet-close" data-close="1" title="Fermer" aria-label="Fermer">${icon("i-close")}</button>
      </div>
      <p class="sheet-standfirst">${mdToHtmlInline(standfirst)}</p>
      <div class="fact-chips" style="margin:6px 0 16px">${factMeta(f2, status)}</div>
      <div class="sheet-textwrap"><div class="sheet-text">${mdToHtml(bodyText || text2)}</div></div>
      <div class="sheet-audit-note">${icon("i-audit")} Décision enregistrée dans l'historique · ${esc(f2.n_sources || 1)} source(s) fusionnée(s)</div>
    </article>
    <div class="sheet-actions">
      <button class="btn btn-primary" data-decide="APPROVED">${icon("i-send")} Approuver &amp; transmettre</button>
      <div class="sheet-actions-row">
        <button class="btn btn-tonal" data-edit="1">${icon("i-edit")} Modifier</button>
        <button class="btn btn-tonal" data-regen="1">${icon("i-refresh")} Régénérer</button>
        <button class="btn btn-danger-ghost" data-decide="REJECTED">${icon("i-reject")} Rejeter</button>
      </div>
      ${status === "APPROVED" || status === "EDITED" || status === "TRANSMITTED" ? `<button class="btn btn-tonal btn-block" data-retract="1">${icon("i-undo")} Annuler la décision</button>` : ""}
      <div class="regen-panel" id="regenPanel" hidden>
        <div class="regen-panel-title">Régénérer avec un angle (sans re-scraper la source)</div>
        <div class="regen-chips" id="regenChips"></div>
        <button class="btn btn-ghost btn-sm" data-regen-cancel="1">Annuler</button>
      </div>
    </div>`;
  sheet.hidden = false;
  scrim.hidden = false;
  const closeBtn = body.querySelector("[data-close]");
  if (closeBtn) closeBtn.onclick = () => Store.closeSheet();
  $$("[data-decide]", body).forEach((b2) => b2.onclick = () => {
    Store.decide(f2.fact_id, b2.dataset.decide);
    Store.closeSheet();
  });
  const rb = body.querySelector("[data-retract]");
  if (rb) rb.onclick = () => {
    Store.retract(f2.fact_id);
    Store.closeSheet();
  };
  const ed = body.querySelector("[data-edit]");
  if (ed) ed.onclick = () => {
    body.innerHTML = `
      <div class="sheet-head">
        ${icon("i-edit", "ic-l")}
        <div class="sheet-head-text">
          <div class="sheet-eyebrow">Correction avant validation</div>
          <h2 class="sheet-title">${esc(c2.title)}</h2>
        </div>
        <button class="sheet-close" data-close="1" title="Fermer" aria-label="Fermer">${icon("i-close")}</button>
      </div>
      <p class="muted" style="margin:10px 0 12px">Corrige le titre et le corps avant validation. La version éditée remplace l'original.</p>
      <input id="edTitle" class="edit-input" value="${esc(c2.title)}">
      <textarea id="edText" class="edit-area">${esc(text2)}</textarea>
      <div class="sheet-actions">
        <button class="btn btn-primary btn-block" id="edSave">${icon("i-check")} Valider la correction</button>
        <button class="btn btn-tonal btn-block" id="edCancel">Annuler</button>
      </div>`;
    const close2 = body.querySelector("[data-close]");
    if (close2) close2.onclick = () => Store.closeSheet();
    const edSave = document.getElementById("edSave");
    if (edSave) edSave.onclick = () => {
      const t2 = document.getElementById("edTitle").value, x2 = document.getElementById("edText").value;
      f2._edited = { title: t2, text: x2 };
      Store.decide(f2.fact_id, "EDITED", x2);
      Store.closeSheet();
    };
    const edCancel = document.getElementById("edCancel");
    if (edCancel) edCancel.onclick = () => renderSheet(s2);
  };
  const regenBtn = body.querySelector("[data-regen]");
  const regenPanel = body.querySelector("#regenPanel");
  const regenChips = body.querySelector("#regenChips");
  const regenCancel = body.querySelector("[data-regen-cancel]");
  if (regenBtn && regenPanel) {
    regenBtn.onclick = async () => {
      regenPanel.hidden = false;
      regenChips.innerHTML = "<span class='muted'>Chargement…</span>";
      let sugs = [];
      try {
        const r2 = await Store.api("/api/regen-suggestions");
        sugs = r2 && r2.suggestions || [];
      } catch (e2) {
        sugs = [];
      }
      if (!sugs.length) sugs = [{ id: "neutre", label: "Réécriture neutre" }];
      regenChips.innerHTML = sugs.map(
        (s3) => `<button class="regen-chip" data-sug="${esc(s3.id)}" title="${esc(s3.hint || "")}">${esc(s3.label)}</button>`
      ).join("");
      regenChips.querySelectorAll(".regen-chip").forEach((chip2) => {
        chip2.onclick = async () => {
          chip2.classList.add("loading");
          try {
            const r2 = await Store.regenerate(f2.fact_id, chip2.dataset.sug);
            if (r2 && r2.article) {
              f2.article = r2.article;
              f2.gen_model = r2.model || f2.gen_model;
              f2.gen_status = r2.status || f2.gen_status;
              const inList = (Store.state.facts || []).find((x2) => x2.fact_id === f2.fact_id);
              if (inList) {
                inList.article = r2.article;
                inList.gen_model = r2.model;
              }
              Store.setState({ facts: Store.state.facts });
            }
            renderSheet(s2);
          } catch (e2) {
            regenChips.innerHTML = `<span class="tag tag-warn">Erreur : ${esc(e2.message)}</span>`;
          }
        };
      });
    };
  }
  if (regenCancel) regenCancel.onclick = () => {
    regenPanel.hidden = true;
  };
}
function bindAudit() {
  const view2 = document.getElementById("view");
  if (!view2) return;
  const checks = () => Array.from(view2.querySelectorAll(".audit-check:checked")).map((c2) => c2.dataset.id);
  const delBtn = document.getElementById("auditDelSel");
  const fb = document.getElementById("auditFloatbar");
  const fbCount = document.getElementById("auditFbCount");
  const fbDel = document.getElementById("auditFbDel");
  const refresh = () => {
    const n3 = checks().length;
    if (delBtn) delBtn.disabled = n3 === 0;
    if (fbDel) fbDel.disabled = n3 === 0;
    if (fbCount) fbCount.textContent = `${n3} sélectionné(s)`;
    if (fb) fb.classList.toggle("show", n3 > 0);
  };
  view2.querySelectorAll(".audit-check").forEach((c2) => c2.onchange = refresh);
  const applyFilt = (patch) => {
    Store.setState({ auditFilter: Object.assign({}, Store.state.auditFilter, patch) });
  };
  view2.querySelectorAll(".chip-filter").forEach((ch) => ch.onclick = () => applyFilt({ type: ch.dataset.type }));
  const search = document.getElementById("auditSearch");
  if (search) search.oninput = () => applyFilt({ q: search.value });
  const exportBtn = document.getElementById("auditExport");
  if (exportBtn) exportBtn.onclick = async () => {
    const ids = checks();
    if (!ids.length) {
      snack("Cochez au moins un événement à exporter");
      return;
    }
    try {
      const BASE2 = location.pathname.startsWith("/kora-v2") ? "/kora-v2" : "";
      const token = (() => {
        try {
          return localStorage.getItem("kora-token");
        } catch (e2) {
          return null;
        }
      })();
      const headers = { "Content-Type": "application/json" };
      if (token) headers["X-API-Token"] = token;
      const res = await fetch(BASE2 + "/api/audit/export", {
        method: "POST",
        headers,
        credentials: "same-origin",
        body: JSON.stringify({ ids })
      });
      if (!res.ok) throw new Error("code " + res.status);
      const csv = await res.text();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a2 = document.createElement("a");
      a2.href = URL.createObjectURL(blob);
      a2.download = "kora-audit-export.csv";
      a2.click();
      URL.revokeObjectURL(a2.href);
      snack("Export CSV généré");
    } catch (e2) {
      snack("Erreur export : " + (e2.message || e2));
    }
  };
  const selAll = document.getElementById("auditSelAll");
  if (selAll) selAll.onclick = () => {
    view2.querySelectorAll(".audit-check").forEach((c2) => c2.checked = true);
    refresh();
  };
  const selNone = document.getElementById("auditSelNone");
  if (selNone) selNone.onclick = () => {
    view2.querySelectorAll(".audit-check").forEach((c2) => c2.checked = false);
    refresh();
  };
  const fbAll = document.getElementById("auditFbAll");
  if (fbAll) fbAll.onclick = () => {
    view2.querySelectorAll(".audit-check").forEach((c2) => c2.checked = true);
    refresh();
  };
  const fbNone = document.getElementById("auditFbNone");
  if (fbNone) fbNone.onclick = () => {
    view2.querySelectorAll(".audit-check").forEach((c2) => c2.checked = false);
    refresh();
  };
  const doDelete = async () => {
    const ids = checks();
    if (!ids.length) return;
    if (!confirm(`Supprimer ${ids.length} événement(s) de l'historique ?`)) return;
    await Store.api("/api/audit", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
    Store.loadAudit();
    snack("Sélection supprimée");
  };
  if (delBtn) delBtn.onclick = doDelete;
  if (fbDel) fbDel.onclick = doDelete;
  const purgeAll = document.getElementById("auditPurgeAll");
  if (purgeAll) purgeAll.onclick = async () => {
    if (!confirm("Vider TOUT l'historique ? (une ligne de purge sera conservée)")) return;
    await Store.api("/api/audit/purge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "all" }) });
    Store.loadAudit();
    snack("Historique vidé");
  };
  const resetToday = document.getElementById("auditResetToday");
  if (resetToday) resetToday.onclick = async () => {
    if (!confirm("Réinitialiser l'historique du jour (aujourd'hui) ?")) return;
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    await Store.api("/api/audit/purge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "day", day: today }) });
    Store.loadAudit();
    snack("Historique du jour réinitialisé");
  };
  view2.querySelectorAll(".audit-purge-day").forEach((b2) => b2.onclick = async () => {
    const day = b2.dataset.day;
    if (!confirm(`Réinitialiser l'historique du ${day} ?`)) return;
    await Store.api("/api/audit/purge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "day", day }) });
    Store.loadAudit();
    snack(`Historique du ${day} réinitialisé`);
  });
}
function bindSettings() {
  const root = document.documentElement;
  const coral = document.getElementById("setCoral");
  const bordeaux = document.getElementById("setBordeaux");
  const swatch = document.getElementById("setSwatch");
  const preview = () => {
    const c2 = coral ? coral.value : "#F2A98C";
    const b2 = bordeaux ? bordeaux.value : "#E08A84";
    if (swatch) swatch.style.background = `linear-gradient(135deg, ${c2}, ${b2})`;
    if (c2) root.style.setProperty("--coral", c2);
    if (b2) root.style.setProperty("--bordeaux", b2);
  };
  if (coral) coral.oninput = preview;
  if (bordeaux) bordeaux.oninput = preview;
  const file = document.getElementById("setLogoFile");
  const logoPreview = document.getElementById("setLogoPreview");
  const clearBtn = document.getElementById("setLogoClear");
  let logoData = null;
  if (file) file.onchange = () => {
    const f2 = file.files && file.files[0];
    if (!f2) return;
    const reader = new FileReader();
    reader.onload = () => {
      logoData = reader.result;
      if (logoPreview) logoPreview.innerHTML = `<img src="${logoData}" alt="">`;
      if (clearBtn) clearBtn.disabled = false;
    };
    reader.readAsDataURL(f2);
  };
  if (clearBtn) clearBtn.onclick = () => {
    logoData = "";
    if (logoPreview) logoPreview.innerHTML = icon("i-spark");
    clearBtn.disabled = true;
  };
  const save = document.getElementById("setSave");
  if (save) save.onclick = async () => {
    var _a2, _b2;
    const tokenField = document.getElementById("setToken");
    if (tokenField) {
      const tk = tokenField.value.trim();
      if (tk) {
        try {
          localStorage.setItem("kora-token", tk);
        } catch (e2) {
        }
      }
    }
    const lblIds = { cockpit: "setLblCockpit", facts: "setLblFacts", sources: "setLblSources", drafts: "setLblDrafts", audit: "setLblAudit" };
    const payload = {
      app_name: (((_a2 = document.getElementById("setAppName")) == null ? void 0 : _a2.value) || "").trim(),
      accent_coral: coral ? coral.value : void 0,
      accent_bordeaux: bordeaux ? bordeaux.value : void 0
    };
    Object.keys(lblIds).forEach((route) => {
      var _a3;
      const v2 = (((_a3 = document.getElementById(lblIds[route])) == null ? void 0 : _a3.value) || "").trim();
      if (v2) payload["label_" + route] = v2;
    });
    const tag = (((_b2 = document.getElementById("setTagline")) == null ? void 0 : _b2.value) || "").trim();
    if (tag) payload.app_tagline = tag;
    if (logoData !== null) payload.logo_data = logoData;
    try {
      const r2 = await Store.api("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (r2.error) {
        snack(r2.error);
        return;
      }
      Store.applySettings(r2.settings);
      Store.setState({ settings: r2.settings });
      snack("Modifications enregistrées");
    } catch (e2) {
      snack(e2.message || "Erreur d'enregistrement");
    }
  };
  const liveLabels = () => {
    const lblIds = { cockpit: "setLblCockpit", facts: "setLblFacts", sources: "setLblSources", drafts: "setLblDrafts", audit: "setLblAudit" };
    Object.keys(lblIds).forEach((route) => {
      const el = document.getElementById(lblIds[route]);
      if (el) document.querySelectorAll(`.navitem[data-route="${route}"] span`).forEach((sp) => {
        sp.textContent = el.value || sp.textContent;
      });
    });
    const tg = document.getElementById("setTagline");
    const tl = document.querySelector(".about-tagline");
    if (tg && tl) tl.textContent = tg.value || tl.textContent;
  };
  ["setLblCockpit", "setLblFacts", "setLblHitl", "setLblSources", "setLblDrafts", "setLblAudit", "setTagline"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.oninput = liveLabels;
  });
  const changePw = document.getElementById("setChangePw");
  if (changePw) changePw.onclick = async () => {
    var _a2, _b2, _c;
    const cur = ((_a2 = document.getElementById("setCurPw")) == null ? void 0 : _a2.value) || "";
    const n1 = ((_b2 = document.getElementById("setNewPw")) == null ? void 0 : _b2.value) || "";
    const n22 = ((_c = document.getElementById("setNewPw2")) == null ? void 0 : _c.value) || "";
    if (n1.length < 8) {
      snack("Le nouveau mot de passe doit faire au moins 8 caractères");
      return;
    }
    if (n1 !== n22) {
      snack("Les mots de passe ne correspondent pas");
      return;
    }
    try {
      await Store.changePassword(cur, n1);
      snack("Mot de passe mis à jour. Reconnecte-toi.");
      await Store.logout();
      document.getElementById("authUser") && (document.getElementById("authUser").value = "");
      App.renderAuth("login", null, true);
    } catch (e2) {
      const msg = e2 && e2.message === "wrong_current" ? "Mot de passe actuel incorrect" : e2 && e2.message || "Erreur";
      snack(msg);
    }
  };
  const logoutBtn = document.getElementById("setLogout");
  if (logoutBtn) logoutBtn.onclick = async () => {
    await Store.logout();
    App.renderAuth("login", null, true);
  };
  const addUser = document.getElementById("setAddUser");
  if (addUser) addUser.onclick = async () => {
    var _a2, _b2, _c, _d;
    const uname = (((_a2 = document.getElementById("setNewUser")) == null ? void 0 : _a2.value) || "").trim();
    const email = (((_b2 = document.getElementById("setNewEmail")) == null ? void 0 : _b2.value) || "").trim();
    const pw = ((_c = document.getElementById("setNewUserPw")) == null ? void 0 : _c.value) || "";
    const role = ((_d = document.getElementById("setNewUserRole")) == null ? void 0 : _d.value) || "normal";
    if (uname.length < 3) {
      snack("Identifiant 3 caractères minimum");
      return;
    }
    if (pw.length < 8) {
      snack("Mot de passe 8 caractères minimum");
      return;
    }
    try {
      await Store.createUser(uname, email, pw, role);
      snack("Compte créé" + (role === "advanced" ? " (Avancé)" : ""));
      await Store.loadUsers();
      render();
    } catch (e2) {
      snack(e2.message || "Erreur");
    }
  };
  view.querySelectorAll(".role-select").forEach((sel) => sel.onchange = async () => {
    const id = sel.dataset.id;
    const newRole = sel.value;
    try {
      await Store.setRole(id, newRole);
      snack("Rôle mis à jour : " + (newRole === "advanced" ? "Avancé" : "Normal"));
      await Store.loadUsers();
    } catch (e2) {
      snack(e2.message || "Erreur");
    }
  });
  view.querySelectorAll(".user-del").forEach((b2) => b2.onclick = async () => {
    const id = b2.dataset.id;
    if (!confirm("Retirer ce compte ? Ses sessions seront fermées.")) return;
    try {
      await Store.deleteUser(id);
      snack("Compte retiré");
      await Store.loadUsers();
      render();
    } catch (e2) {
      snack(e2.message || "Erreur");
    }
  });
  const drawers = {
    appearance: "drawer-appearance",
    account: "drawer-account",
    personalization: "drawer-personalization",
    accounts: "drawer-accounts",
    auditlog: "drawer-auditlog"
  };
  const loadAuditLog = async () => {
    const body = document.getElementById("auditLogBody");
    if (!body) return;
    try {
      const data = await Store.api("/api/audit/admin");
      const days = data && data.days || [];
      if (!days.length) {
        body.innerHTML = '<p class="muted">Aucune action admin enregistrée.</p>';
        return;
      }
      const row = (ev) => `<div class="list-row audit-row"><span class="meta-ic">${icon("i-shield")}</span><div class="meta"><div class="name">${esc(ev.event || ev.action || "Action")}</div><div class="sub">${esc(ev.detail || "")}${ev.editor ? " · par " + esc(ev.editor) : ""}</div></div><div class="sub audit-time">${esc((ev.ts || "").replace("T", " ").slice(0, 16).slice(11))}</div></div>`;
      const dayBlock = (d2) => `<section class="fact-group audit-day"><div class="group-head"><span class="group-ic">${icon("i-date")}</span><h3 class="group-title">${esc(d2.label)}</h3><span class="group-count">${d2.count}</span></div><div class="audit-events">${d2.events.map(row).join("")}</div></section>`;
      body.innerHTML = days.map(dayBlock).join("");
    } catch (e2) {
      body.innerHTML = '<p class="muted">Erreur de chargement du journal (admin requis).</p>';
    }
  };
  const auditNav = view.querySelector('.settings-nav-item[data-setnav="auditlog"]');
  if (auditNav) auditNav.onclick = () => {
    openDrawer("auditlog");
    loadAuditLog();
  };
  const refreshBtn = document.getElementById("auditLogRefresh");
  if (refreshBtn) refreshBtn.onclick = loadAuditLog;
  const scrim = document.getElementById("setDrawerScrim");
  const openDrawer = (id) => {
    Object.values(drawers).forEach((did) => {
      const d3 = document.getElementById(did);
      if (d3) d3.hidden = true;
    });
    const d2 = document.getElementById(drawers[id]);
    if (!d2) return;
    d2.hidden = false;
    if (scrim && window.matchMedia("(max-width: 819px)").matches) scrim.hidden = false;
    if (window.matchMedia("(max-width: 819px)").matches) {
      const fab = document.getElementById("fab");
      if (fab) fab.hidden = true;
    }
    view.querySelectorAll(".settings-nav-item").forEach((n3) => n3.classList.toggle("active", n3.dataset.setnav === id));
  };
  if (window.matchMedia("(min-width: 820px)").matches) openDrawer("appearance");
  const closeDrawer = () => {
    if (window.matchMedia("(min-width: 820px)").matches) return;
    Object.values(drawers).forEach((did) => {
      const d2 = document.getElementById(did);
      if (d2) d2.hidden = true;
    });
    if (scrim) scrim.hidden = true;
    const fab = document.getElementById("fab");
    if (fab) fab.hidden = false;
    view.querySelectorAll(".settings-nav-item").forEach((n3) => n3.classList.remove("active"));
  };
  view.querySelectorAll(".settings-nav-item").forEach((n3) => n3.onclick = () => openDrawer(n3.dataset.setnav));
  if (scrim) scrim.onclick = closeDrawer;
  view.querySelectorAll("[data-setback]").forEach((b2) => b2.onclick = closeDrawer);
  const onKey = (e2) => {
    if (e2.key === "Escape") {
      const anyOpen = Object.values(drawers).some((did) => {
        const d2 = document.getElementById(did);
        return d2 && !d2.hidden;
      });
      if (anyOpen) {
        closeDrawer();
        e2.stopPropagation();
      }
    }
  };
  document.addEventListener("keydown", onKey);
}
let _authRendered = false;
function render() {
  const now = Date.now();
  if (now - (window.__renderT || 0) > 1e3) {
    window.__renderCount = 0;
    window.__renderT = now;
  }
  window.__renderCount = (window.__renderCount || 0) + 1;
  if (window.__renderCount > 40) {
    console.error("RECURSION render() x" + window.__renderCount + "\n" + (new Error().stack || ""));
    return;
  }
  const s2 = Store.state;
  if (!s2.auth || !s2.auth.loggedIn) {
    if (s2.auth && s2.auth.pending) {
      return;
    }
    hideBootSplash();
    if (!_authRendered) {
      renderAuth("login");
    }
    return;
  }
  hideBootSplash();
  showApp();
  const agent = document.getElementById("agentStatus");
  if (agent) agent.innerHTML = s2.ui.busy ? `<span class="dot dot-busy"></span><span>${s2.ui.overlay || "Agent occupé…"}</span>` : `<span class="dot dot-ok"></span><span>prêt</span>`;
  const view2 = document.getElementById("view");
  if (!view2) return;
  const map = { cockpit: viewCockpit, facts: viewFacts, sources: viewSources, audit: viewAudit, drafts: viewDrafts, settings: viewSettings, trash: viewTrash };
  view2.innerHTML = (map[s2.route] || viewCockpit)(s2);
  $$(".navitem, .rail .navitem, .item, .rail .item").forEach((n3) => {
    const on = n3.dataset.route === s2.route;
    n3.classList.toggle("active", on);
    if (on) n3.setAttribute("aria-current", "page");
    else n3.removeAttribute("aria-current");
  });
  const isAdvanced = s2.auth && s2.auth.role === "advanced";
  $$('.navitem[data-route="settings"]').forEach((n3) => {
    n3.hidden = !isAdvanced;
  });
  const bnav = document.querySelector('.bottomnav [data-route="settings"]');
  if (bnav) bnav.hidden = !isAdvanced;
  try {
    const facts = s2.facts || [];
    let pending = 0;
    for (const ft of facts) if (factCategory(s2, ft) === "pending") pending++;
    const stats = s2.stats || {};
    const badges = {
      facts: typeof stats.articles === "number" ? stats.articles : typeof stats.total_facts === "number" ? stats.total_facts : facts.length,
      sources: (s2.sources || []).length,
      drafts: typeof stats.drafts === "number" ? stats.drafts : facts.filter((f2) => (f2.status || "") === "EDITED").length,
      trash: typeof stats.trash === "number" ? stats.trash : (s2.trash || []).length || facts.filter((f2) => (f2.status || "") === "DELETED").length
    };
    document.querySelectorAll("[data-badge]").forEach((el) => {
      const key = el.getAttribute("data-badge");
      const v2 = badges[key] || 0;
      el.textContent = v2 > 0 ? String(v2) : "";
      el.classList.toggle("show", v2 > 0);
    });
    document.querySelectorAll("[data-decision]").forEach((el) => {
      const key = el.getAttribute("data-decision");
      el.textContent = String(key === "pending" ? pending : badges[key] || 0);
    });
  } catch (e2) {
    console.error("badges", e2);
  }
  const curTheme = Store.getTheme();
  $$("[data-theme-btn]").forEach((n3) => n3.classList.toggle("active", n3.dataset.themeBtn === curTheme));
  const sa = document.getElementById("stateAction");
  if (sa) sa.onclick = () => {
    if (sa.dataset.force) Store.startCycle(1, true);
    else if (sa.textContent.trim() === "Réessayer") location.reload();
    else if (sa.textContent.trim().includes("Relancer un cycle")) Store.startCycle();
    else Store.seed();
  };
  const cs = document.getElementById("cockpitSeed");
  if (cs) cs.onclick = () => Store.seed();
  const busy = !!s2.ui.busy;
  const tc = document.getElementById("topbarCycle");
  if (tc) {
    tc.disabled = busy;
    const lbl = tc.querySelector(".topbar-cta-label");
    if (lbl) lbl.textContent = busy ? "En cours…" : "Lancer un cycle";
  }
  document.querySelectorAll('[data-action="cycle-force"]').forEach((el) => {
    el.disabled = busy;
  });
  const fabCycle = document.querySelector('.fab-action[data-act="cycle"]');
  if (fabCycle) {
    fabCycle.style.pointerEvents = busy ? "none" : "";
    fabCycle.classList.toggle("disabled", busy);
  }
  const am = document.getElementById("agentMode");
  if (am) {
    if (busy) am.textContent = "en cours";
    else if (s2.health && s2.health.status === "error") am.textContent = "erreur";
    else am.textContent = "prêt";
  }
  const amDot = document.querySelector("#agentStatus .dot");
  if (amDot) amDot.className = "dot " + (busy ? "dot-busy" : s2.health && s2.health.status === "error" ? "dot-err" : "dot-ok");
  const gl = document.getElementById("globalLoader");
  if (gl) {
    const t2 = document.getElementById("globalLoaderText");
    if (t2) t2.textContent = s2.ui.overlay || "Agent en cours…";
  }
  try {
    renderSheet(s2);
  } catch (e2) {
    console.error("renderSheet", e2);
  }
  try {
    if (s2.route === "audit") bindAudit();
  } catch (e2) {
    console.error("bindAudit", e2);
  }
  try {
    if (s2.route === "settings") bindSettings();
  } catch (e2) {
    console.error("bindSettings", e2);
  }
  try {
    const sb = document.getElementById("selectBar");
    if (sb) {
      const SEL_ROUTES = ["cockpit", "facts", "drafts", "trash"];
      const n3 = Store.selectedIds().length;
      sb.hidden = !(s2.selectMode && n3 > 0 && SEL_ROUTES.includes(s2.route));
      const cnt = document.getElementById("selectCount");
      if (cnt) cnt.textContent = n3;
      const fab = document.getElementById("fab");
      if (fab) fab.hidden = !sb.hidden;
    }
    const enterSel = document.getElementById("enterSelect");
    if (enterSel) enterSel.onclick = () => Store.setSelectMode(!Store.state.selectMode);
    document.querySelectorAll("[data-nav]").forEach((n3) => {
      n3.onclick = () => {
        const r2 = n3.getAttribute("data-nav");
        if (r2) navigate(r2);
      };
      n3.onkeydown = (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          const r2 = n3.getAttribute("data-nav");
          if (r2) navigate(r2);
        }
      };
    });
  } catch (e2) {
    console.error("selectBar", e2);
  }
  try {
    document.querySelectorAll("[data-restore]").forEach((b2) => b2.onclick = (e2) => {
      e2.preventDefault();
      e2.stopPropagation();
      Store.restoreFact(b2.dataset.restore).then(() => snack("Restauré")).catch((e3) => snack("Erreur : " + e3.message));
    });
    document.querySelectorAll("[data-del]").forEach((b2) => b2.onclick = (e2) => {
      e2.preventDefault();
      e2.stopPropagation();
      if (!window.confirm("Supprimer définitivement cet article ? Irréversible.")) return;
      Store.deleteForever([b2.dataset.del]).then((r2) => snack(`${r2.deleted || 0} supprimé(s)`)).catch((e3) => snack("Erreur : " + e3.message));
    });
    document.querySelectorAll("[data-finish]").forEach((b2) => b2.onclick = () => {
      Store.finishDraft(b2.dataset.finish).then(() => snack("Remis en attente de validation")).catch((e2) => snack("Erreur : " + e2.message));
    });
  } catch (e2) {
    console.error("trashBtns", e2);
  }
  try {
    bindPasswordToggles();
  } catch (e2) {
    console.error("pwToggles", e2);
  }
  try {
    bind();
  } catch (e2) {
    console.error("bind", e2);
  }
}
function onBulkAction(action) {
  const ids = Store.selectedIds();
  if (!ids.length) {
    snack("Aucun article sélectionné");
    return;
  }
  if (action === "approve") {
    openWpChoice();
    return;
  }
  if (action === "pending") {
    Store.bulkAction("pending").then((r2) => snack(`${r2.done}/${r2.total} remis en attente`)).catch((e2) => snack("Erreur : " + e2.message));
    return;
  }
  if (action === "trash") {
    openTrashChoice();
    return;
  }
  if (action === "draft") {
    Store.bulkAction("draft").then((r2) => snack(`${r2.done}/${r2.total} en brouillon`)).catch((e2) => snack("Erreur : " + e2.message));
    return;
  }
}
function openWpChoice() {
  const wp = document.getElementById("wpChoice");
  const sc = document.getElementById("wpScrim");
  if (wp) {
    document.getElementById("wpCount").textContent = Store.selectedIds().length;
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
  Store.bulkAction("approve", { wp_status }).then((r2) => {
    const fails = (r2.results || []).filter((x2) => !x2.ok).length;
    snack(fails ? `${r2.done}/${r2.total} publié(s) · ${fails} échec(s)` : `${r2.done}/${r2.total} publié(s) sur WordPress`);
  }).catch((e2) => snack("Erreur : " + e2.message));
}
function doBulkTrash(definitive) {
  const ids = Store.selectedIds();
  if (!ids.length) return;
  if (definitive) {
    Store.deleteForever(ids).then((r2) => snack(`${r2.deleted || 0} supprimé(s) définitivement`)).catch((e2) => snack("Erreur : " + e2.message));
  } else {
    Store.bulkAction("trash").then((r2) => snack(`${r2.done}/${r2.total} mis à la corbeille (11 j)`)).catch((e2) => snack("Erreur : " + e2.message));
  }
}
function snack(msg) {
  const sn = document.getElementById("snackbar");
  if (!sn) return;
  sn.textContent = msg;
  sn.hidden = false;
  clearTimeout(sn._t);
  sn._t = setTimeout(() => sn.hidden = true, 2600);
}
function navigate(route, push = true) {
  if (push && location.hash !== "#" + route) {
    try {
      history.pushState({ route }, "", "#" + route);
    } catch (e2) {
    }
  }
  Store.setRoute(route);
  Store.setState({ ui: { ...Store.state.ui, busy: false, overlay: null } });
  if (route === "facts") Store.loadHITL();
  else if (route === "drafts") Store.loadHITL();
  else if (route === "trash") Store.loadTrash();
  else if (route === "audit") Store.loadAudit();
  else if (route === "sources") Store.loadSources();
  else if (route === "cockpit") {
    Store.loadLast();
    Store.loadHITL();
  }
  render();
}
function openFact(id) {
  const facts = Store.state.facts || [];
  let f2 = facts.find((x2) => x2.fact_id === id);
  if (!f2 && (id || "").startsWith("idx")) {
    const i2 = parseInt(id.slice(3), 10);
    f2 = facts[i2];
  }
  if (f2) {
    Store.openSheet({ type: "fact", fact: f2 });
    renderSheet(Store.state);
  }
}
function bind() {
  document.addEventListener("click", (e2) => {
    if (e2.target.closest("button, a, input, [data-restore], [data-del]")) return;
    const card = e2.target.closest(".fact-card");
    if (!card) return;
    if (card.classList.contains("trash-card")) return;
    if (Store.state.selectMode) {
      e2.stopPropagation();
      return;
    }
    e2.stopPropagation();
    const facts = Store.state.facts || [];
    let f2 = facts.find((x2) => x2.fact_id === card.dataset.fact);
    if (!f2 && (card.dataset.fact || "").startsWith("idx")) {
      const i2 = parseInt(card.dataset.fact.slice(3), 10);
      f2 = facts[i2];
    }
    if (!f2 && card.dataset.index) f2 = facts[parseInt(card.dataset.index, 10)];
    if (f2) {
      Store.openSheet({ type: "fact", fact: f2 });
      renderSheet(Store.state);
    }
  });
  const searchInput = document.querySelector('[data-action="search"]');
  if (searchInput) {
    searchInput.value = Store.getFactQuery() || "";
    searchInput.oninput = (e2) => {
      Store.setFactQuery(e2.target.value);
      if (Store.state.route !== "facts") navigate("facts");
      else render();
    };
  }
  $$('[data-action="sort"]').forEach((b2) => b2.onclick = () => {
    const order = ["recent", "oldest", "title"];
    const labels = { recent: "Plus récents", oldest: "Plus anciens", title: "Titre A→Z" };
    const sel = document.getElementById("factSort");
    const cur = sel && sel.value || Store.getFactSort() || "recent";
    const next = order[(order.indexOf(cur) + 1) % order.length];
    if (sel) sel.value = next;
    try {
      localStorage.setItem("kora-factSort", next);
    } catch (e2) {
    }
    Store.setFactSort(next);
    if (Store.state.route !== "facts") navigate("facts");
    else render();
    if (Store.toast) Store.toast(`Tri : ${labels[next]}`);
  });
  $$('[data-action="filters"]').forEach((b2) => b2.onclick = () => {
    if (Store.state.route !== "facts") navigate("facts");
    setTimeout(() => {
      const fb = document.querySelector(".filter-bar");
      if (fb) fb.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 250);
  });
  const sortSelEl = document.getElementById("factSort");
  if (sortSelEl) sortSelEl.onchange = () => {
    Store.setFactSort(sortSelEl.value);
    render();
  };
  $$("[data-fact-filter]").forEach((n3) => n3.onclick = () => {
    const f2 = n3.dataset.factFilter;
    if (f2 === "trash") {
      navigate("trash");
      return;
    }
    Store.setFactFilter(f2);
    const sc2 = document.getElementById("railScrim");
    if (sc2) sc2.hidden = true;
  });
  const enterSel = document.getElementById("enterSelect");
  if (enterSel) enterSel.onclick = () => Store.setSelectMode(!Store.state.selectMode);
  const selectBar = document.getElementById("selectBar");
  if (selectBar) {
    selectBar.querySelectorAll("[data-bulk]").forEach((b2) => b2.onclick = () => onBulkAction(b2.dataset.bulk));
  }
  const wpChoice = document.getElementById("wpChoice");
  const wpScrim = document.getElementById("wpScrim");
  const closeWp = () => {
    wpChoice.hidden = true;
    if (wpScrim) wpScrim.hidden = true;
  };
  const wpPublish = document.getElementById("wpPublish");
  if (wpPublish) wpPublish.onclick = () => {
    closeWp();
    doBulkApprove("publish");
  };
  const wpDraft = document.getElementById("wpDraft");
  if (wpDraft) wpDraft.onclick = () => {
    closeWp();
    doBulkApprove("draft");
  };
  const wpCancel = document.getElementById("wpCancel");
  if (wpCancel) wpCancel.onclick = closeWp;
  if (wpScrim) wpScrim.onclick = closeWp;
  const trashChoice = document.getElementById("trashChoice");
  const closeTrash = () => {
    trashChoice.hidden = true;
    if (wpScrim) wpScrim.hidden = true;
  };
  const trashPut = document.getElementById("trashPut");
  if (trashPut) trashPut.onclick = () => {
    closeTrash();
    doBulkTrash(false);
  };
  const trashDelete = document.getElementById("trashDelete");
  if (trashDelete) trashDelete.onclick = () => {
    closeTrash();
    doBulkTrash(true);
  };
  const trashCancel = document.getElementById("trashCancel");
  if (trashCancel) trashCancel.onclick = closeTrash;
  const trashDef = document.getElementById("trashDefinitive");
  if (trashDef) trashDef.onchange = () => {
    document.getElementById("trashDelete").hidden = !trashDef.checked;
  };
  const leftDrawer = document.getElementById("leftDrawer");
  const leftDrawerScrim = document.getElementById("leftDrawerScrim");
  const leftDrawerClose = document.getElementById("leftDrawerClose");
  let leftDrawerTouchStartX = 0;
  let leftDrawerTouchStartTime = 0;
  const closeLeftDrawer = () => {
    if (leftDrawer) leftDrawer.classList.remove("open");
    if (leftDrawerScrim) leftDrawerScrim.classList.remove("visible");
    setTimeout(() => {
      if (leftDrawer) leftDrawer.hidden = true;
      if (leftDrawerScrim) leftDrawerScrim.hidden = true;
      document.body.style.overflow = "";
    }, 300);
  };
  if (leftDrawerClose) leftDrawerClose.onclick = closeLeftDrawer;
  if (leftDrawerScrim) leftDrawerScrim.onclick = closeLeftDrawer;
  if (leftDrawer) {
    leftDrawer.addEventListener("touchstart", (e2) => {
      leftDrawerTouchStartX = e2.touches[0].clientX;
      leftDrawerTouchStartTime = Date.now();
    }, { passive: true });
    leftDrawer.addEventListener("touchend", (e2) => {
      const dx = e2.changedTouches[0].clientX - leftDrawerTouchStartX;
      const dt2 = Date.now() - leftDrawerTouchStartTime;
      if (dx < -60 && dt2 < 300) closeLeftDrawer();
    }, { passive: true });
  }
  if (leftDrawer) {
    leftDrawer.querySelectorAll("[data-route]").forEach((n3) => {
      n3.onclick = () => {
        if (Store.state.ui.busy) {
          snack("Génération en cours…");
          return;
        }
        closeLeftDrawer();
        navigate(n3.dataset.route);
      };
    });
  }
  const railEl = document.getElementById("rail");
  $$("[data-route]").forEach((n3) => n3.onclick = () => {
    if (Store.state.ui.busy) {
      snack("Génération en cours…");
      return;
    }
    if (railEl) railEl.classList.remove("open");
    const sc2 = document.getElementById("railScrim");
    if (sc2) sc2.hidden = true;
    navigate(n3.dataset.route);
  });
  const tc = document.getElementById("topbarCycle");
  if (tc) tc.onclick = () => {
    navigate("cockpit");
    Store.startCycle();
  };
  const closeRailDrawer = () => {
    const rail = document.getElementById("rail");
    if (rail) rail.classList.remove("open");
    const sc2 = document.getElementById("railScrim");
    if (sc2) sc2.hidden = true;
  };
  const rt2 = document.getElementById("railToggle");
  if (rt2) rt2.onclick = () => {
    if (window.matchMedia("(max-width: 819px)").matches) {
      closeRailDrawer();
      return;
    }
    Store.setRail(Store.getRail() === "expanded" ? "collapsed" : "expanded");
  };
  const rsc = document.getElementById("railScrim");
  if (rsc) rsc.onclick = closeRailDrawer;
  const rightDrawer = document.getElementById("rightDrawer");
  const rightDrawerScrim = document.getElementById("rightDrawerScrim");
  const rightDrawerClose = document.getElementById("rightDrawerClose");
  let rightDrawerFocusTrap = null;
  const openRightDrawer = () => {
    if (rightDrawer) {
      rightDrawer.hidden = false;
      rightDrawer.classList.add("open");
    }
    if (rightDrawerScrim) {
      rightDrawerScrim.hidden = false;
      rightDrawerScrim.classList.add("visible");
    }
    document.body.style.overflow = "hidden";
    setTimeout(() => {
      const focusable = rightDrawer == null ? void 0 : rightDrawer.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable == null ? void 0 : focusable.length) {
        rightDrawerFocusTrap = focusable[0];
        focusable[focusable.length - 1].addEventListener("keydown", trapFocus);
        rightDrawerFocusTrap.focus();
      }
    }, 0);
  };
  const closeRightDrawer = () => {
    if (rightDrawer) rightDrawer.classList.remove("open");
    if (rightDrawerScrim) rightDrawerScrim.classList.remove("visible");
    setTimeout(() => {
      if (rightDrawer) rightDrawer.hidden = true;
      if (rightDrawerScrim) rightDrawerScrim.hidden = true;
      document.body.style.overflow = "";
    }, 300);
    if (rightDrawerFocusTrap) {
      const focusable = rightDrawer == null ? void 0 : rightDrawer.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable == null ? void 0 : focusable.length) focusable[focusable.length - 1].removeEventListener("keydown", trapFocus);
      rightDrawerFocusTrap = null;
    }
  };
  const trapFocus = (e2) => {
    if (e2.key === "Tab") {
      const focusable = rightDrawer == null ? void 0 : rightDrawer.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!(focusable == null ? void 0 : focusable.length)) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e2.shiftKey && document.activeElement === first) {
        e2.preventDefault();
        last.focus();
      } else if (!e2.shiftKey && document.activeElement === last) {
        e2.preventDefault();
        first.focus();
      }
    } else if (e2.key === "Escape") {
      closeRightDrawer();
    }
  };
  document.querySelectorAll("[data-plus]").forEach((el) => {
    el.onclick = (e2) => {
      e2.preventDefault();
      openRightDrawer();
    };
  });
  if (rightDrawerClose) rightDrawerClose.onclick = closeRightDrawer;
  if (rightDrawerScrim) rightDrawerScrim.onclick = closeRightDrawer;
  if (rightDrawer) {
    rightDrawer.querySelectorAll("[data-route]").forEach((n3) => {
      n3.onclick = () => {
        if (Store.state.ui.busy) {
          snack("Génération en cours…");
          return;
        }
        closeRightDrawer();
        navigate(n3.dataset.route);
      };
    });
  }
  const overflowMenu = document.getElementById("overflowMenu");
  const navScrim = document.getElementById("navScrim");
  let overflowTouchStartY = 0;
  let overflowTouchStartTime = 0;
  const closeOverflow = () => {
    if (overflowMenu) overflowMenu.classList.remove("open");
    if (navScrim) navScrim.hidden = true;
  };
  if (overflowMenu) overflowMenu.querySelectorAll(".overflow-item").forEach((it2) => it2.onclick = () => {
    navigate(it2.dataset.route);
    closeOverflow();
  });
  if (overflowMenu) {
    overflowMenu.addEventListener("touchstart", (e2) => {
      overflowTouchStartY = e2.touches[0].clientY;
      overflowTouchStartTime = Date.now();
    }, { passive: true });
    overflowMenu.addEventListener("touchend", (e2) => {
      const dy = e2.changedTouches[0].clientY - overflowTouchStartY;
      const dt2 = Date.now() - overflowTouchStartTime;
      if (dy > 60 && dt2 < 300) closeOverflow();
    }, { passive: true });
  }
  document.addEventListener("click", (e2) => {
    const tb = e2.target.closest("[data-theme-btn]");
    if (tb) {
      Store.setTheme(tb.dataset.themeBtn);
      return;
    }
  });
  const tcyc = document.querySelector("[data-theme-cycle]");
  if (tcyc) tcyc.onclick = () => {
    const order = ["dark", "light", "cacao"];
    const cur = Store.getTheme();
    Store.setTheme(order[(order.indexOf(cur) + 1) % order.length]);
  };
  const fab = $$1("#fab"), menu = $$1("#fabMenu");
  if (fab) fab.onclick = () => {
    fab.classList.toggle("open");
    menu.classList.toggle("open");
  };
  $$(".fab-action", menu).forEach((a2) => a2.onclick = () => {
    fab.classList.remove("open");
    menu.classList.remove("open");
    if (a2.dataset.act === "cycle") {
      navigate("cockpit");
      Store.startCycle();
    } else if (a2.dataset.act === "seed") {
      navigate("cockpit");
      Store.seed();
    }
  });
  const sc = $$1("#sheetScrim");
  if (sc) sc.onclick = () => Store.closeSheet();
  document.addEventListener("click", (e2) => {
    if (!Store.state.sheet) return;
    if (e2.target.closest && e2.target.closest("#sheet")) return;
    Store.closeSheet();
  }, true);
  document.addEventListener("keydown", (e2) => {
    if (e2.key === "Escape" && Store.state.sheet) Store.closeSheet();
  });
  window.addEventListener("popstate", (e2) => {
    if (e2.state && e2.state.route) Store.setRoute(e2.state.route);
  });
  if (!location.hash) {
    try {
      history.replaceState({ route: Store.state.route }, "", "#" + Store.state.route);
    } catch (e2) {
    }
  }
  function bindCockpitEvents() {
    document.addEventListener("click", (e2) => {
      const card = e2.target.closest("[data-action^='nav-']");
      if (!card) return;
      const action = card.dataset.action;
      if (action === "nav-facts-all") {
        Store.setFactFilter("all");
        navigate("facts");
      } else if (action === "nav-facts-approved") {
        Store.setFactFilter("TRANSMITTED");
        navigate("facts");
      } else if (action === "nav-facts-rejected") {
        Store.setFactFilter("REJECTED");
        navigate("facts");
      } else if (action === "nav-hitl") {
        Store.setFactFilter("PENDING_REVIEW");
        navigate("facts");
      } else if (action === "nav-drafts") {
        Store.setFactFilter("EDITED");
        navigate("facts");
      } else if (action === "nav-trash") {
        navigate("trash");
      } else if (action === "nav-deleted") {
        navigate("audit");
      }
    });
    document.addEventListener("click", (e2) => {
      var _a2;
      const leg = e2.target.closest("[data-toggle]");
      if (!leg) return;
      const key = leg.dataset.toggle;
      const svg2 = (_a2 = leg.closest(".ev-chart")) == null ? void 0 : _a2.querySelector(".ev-svg");
      if (!svg2) return;
      const hidden = svg2.classList.toggle("ev-hide-" + key);
      leg.classList.toggle("off", hidden);
    });
    document.addEventListener("mouseover", (e2) => {
      const dot = e2.target.closest(".ev-dot");
      if (!dot) return;
      const tip = document.getElementById("evTooltip");
      if (!tip) return;
      tip.innerHTML = `<strong>${dot.dataset.date}</strong><br>${dot.dataset.vals}`;
      tip.hidden = false;
      const plot = dot.closest(".ev-plot");
      if (plot) {
        const r2 = plot.getBoundingClientRect();
        const dr = dot.getBoundingClientRect();
        tip.style.left = dr.left - r2.left + 12 + "px";
        tip.style.top = dr.top - r2.top - 8 + "px";
      }
    });
    document.addEventListener("mouseout", (e2) => {
      if (e2.target.closest(".ev-dot")) {
        const tip = document.getElementById("evTooltip");
        if (tip) tip.hidden = true;
      }
    });
    document.addEventListener("click", (e2) => {
      const chip2 = e2.target.closest(".source-chip[data-source-id]");
      if (!chip2) return;
      navigate("sources");
    });
    document.addEventListener("click", (e2) => {
      if (e2.target.closest("[data-action='refresh']")) {
        Store.loadAll();
      }
    });
    document.addEventListener("click", (e2) => {
      var _a2;
      if (e2.target.closest("[data-action='cycle-normal']")) {
        if ((_a2 = Store.state.lastCycle) == null ? void 0 : _a2.running) return;
        Store.startCycle({ force: false });
      }
    });
    document.addEventListener("click", (e2) => {
      var _a2;
      if (e2.target.closest("[data-action='cycle-force']")) {
        if ((_a2 = Store.state.lastCycle) == null ? void 0 : _a2.running) return;
        if (confirm("Lancer un cycle FORCÉ (ignorant la fenêtre 24h) ?")) {
          Store.startCycle({ force: true });
        }
      }
    });
    document.addEventListener("click", (e2) => {
      if (e2.target.closest("[data-action='audit-all']")) {
        navigate("audit");
      }
    });
  }
  bindCockpitEvents();
}
function boot() {
  const resetToken = new URLSearchParams(location.search).get("reset");
  Store.loadSettings().then(() => {
    if (resetToken) {
      renderAuth("reset", resetToken);
    } else {
      Store.checkAuth().then((ok) => {
        if (!ok) renderAuth("login");
        else Store.loadAll();
      });
    }
  });
  const hashRoute = (location.hash || "").replace(/^#/, "").trim();
  const r2 = hashRoute || (location.pathname.replace(/^\/kora-v2/, "") || "/").split("/")[1] || "cockpit";
  if (Store.state.route !== r2) Store.state.route = r2;
  Store.loadHealth();
  Store.loadSettings();
  Store.loadTrash().catch(() => {
  });
  Store.loadUsers().catch(() => {
  });
  Store.startAutoRefresh(3e4);
}
function renderAuth(mode, token, force = false) {
  const overlay = document.getElementById("authOverlay");
  if (!overlay) return;
  if (!_authRendered || force) {
    if (mode === "login") overlay.innerHTML = viewLogin();
    else if (mode === "forgot") overlay.innerHTML = viewForgot();
    else if (mode === "reset") overlay.innerHTML = viewReset();
    overlay.hidden = false;
    document.getElementById("app").style.display = "none";
    bindAuth(mode, token);
    bindPasswordToggles(overlay);
    _authRendered = true;
    if (mode === "login") {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => alignWordmark()).catch(() => {
        });
      }
      alignWordmark();
    }
  }
}
function alignWordmark() {
  try {
    const koraA = document.querySelector(".wm-kora-a");
    const agent = document.querySelector(".wm-agent");
    if (!koraA || !agent) return;
    const aRect = koraA.getBoundingClientRect();
    const kRect = agent.parentElement.getBoundingClientRect();
    const offset = aRect.left - kRect.left;
    agent.style.marginLeft = offset + 1 + "px";
  } catch (e2) {
  }
}
function viewLogin() {
  const logo = Store.state.settings && Store.state.settings.logo_data ? `<img class="auth-wordmark" src="${Store.state.settings.logo_data}" alt="">` : icon("i-spark");
  const wm = `<div class="auth-wordmark-wrap">${logo}</div>`;
  return `<div class="auth-screen">
    <div class="auth-card">
      ${wm}
      <p class="auth-sub">Bonjour et bienvenue chez Kora, votre agent éditorialiste.</p>
      <form id="authForm" autocomplete="off">
        <label class="auth-field">Identifiant
          <input class="text-input" id="authUser" type="text" autocomplete="username" placeholder="admin">
        </label>
        <label class="auth-field">Mot de passe
          <span class="pw-wrap">
            <input class="text-input" id="authPass" type="password" autocomplete="current-password" placeholder="••••••••">
            <button type="button" class="pw-toggle" data-pw="authPass" aria-label="Afficher le mot de passe">${icon("i-eye")}</button>
          </span>
        </label>
        <button class="btn btn-primary btn-block" id="authSubmit" type="submit">Se connecter</button>
      </form>
      <button class="auth-link" id="authForgot">Mot de passe oublié ?</button>
      <div class="auth-err" id="authErr"></div>
    </div>
  </div>`;
}
function viewForgot() {
  return `<div class="auth-screen">
    <div class="auth-card">
      <div class="auth-mark">${icon("i-spark")}</div>
      <h1 class="auth-title">Mot de passe oublié</h1>
      <p class="auth-sub">Saisis ton adresse email. Si un compte existe, un lien de réinitialisation sera envoyé.</p>
      <form id="authForm" autocomplete="off">
        <label class="auth-field">Email
          <input class="text-input" id="authEmail" type="email" placeholder="admin@kora.reach">
        </label>
        <button class="btn btn-primary btn-block" id="authSubmit" type="submit">Envoyer le lien</button>
      </form>
      <button class="auth-link" id="authBack">Retour à la connexion</button>
      <div class="auth-err" id="authErr"></div>
    </div>
  </div>`;
}
function viewReset(token) {
  return `<div class="auth-screen">
    <div class="auth-card">
      <div class="auth-mark">${icon("i-spark")}</div>
      <h1 class="auth-title">Nouveau mot de passe</h1>
      <p class="auth-sub">Choisis un nouveau mot de passe (8 caractères minimum).</p>
      <form id="authForm" autocomplete="off">
        <label class="auth-field">Nouveau mot de passe
          <span class="pw-wrap">
            <input class="text-input" id="authNew" type="password" autocomplete="new-password" placeholder="••••••••">
            <button type="button" class="pw-toggle" data-pw="authNew" aria-label="Afficher le mot de passe">${icon("i-eye")}</button>
          </span>
        </label>
        <label class="auth-field">Confirmer
          <span class="pw-wrap">
            <input class="text-input" id="authNew2" type="password" autocomplete="new-password" placeholder="••••••••">
            <button type="button" class="pw-toggle" data-pw="authNew2" aria-label="Afficher le mot de passe">${icon("i-eye")}</button>
          </span>
        </label>
        <button class="btn btn-primary btn-block" id="authSubmit" type="submit">Réinitialiser</button>
      </form>
      <div class="auth-err" id="authErr"></div>
    </div>
  </div>`;
}
function bindPasswordToggles(root) {
  const scope = root || document;
  scope.querySelectorAll(".pw-toggle").forEach((btn) => {
    btn.onclick = () => {
      const el = document.getElementById(btn.dataset.pw);
      if (!el) return;
      const show = el.type === "password";
      el.type = show ? "text" : "password";
      btn.innerHTML = icon(show ? "i-eye-off" : "i-eye");
      btn.setAttribute("aria-label", show ? "Masquer le mot de passe" : "Afficher le mot de passe");
      el.focus();
    };
  });
}
function bindAuth(mode, token) {
  const overlay = document.getElementById("authOverlay");
  const err = overlay.querySelector("#authErr");
  const setErr = (m2) => {
    if (err) err.textContent = m2 || "";
  };
  const form = overlay.querySelector("#authForm");
  if (mode === "login") {
    const forgot = overlay.querySelector("#authForgot");
    if (forgot) forgot.onclick = () => renderAuth("forgot");
    if (form) form.onsubmit = async (e2) => {
      e2.preventDefault();
      setErr("");
      const u2 = overlay.querySelector("#authUser").value.trim();
      const p2 = overlay.querySelector("#authPass").value;
      const btn = overlay.querySelector("#authSubmit");
      const orig = btn ? btn.textContent : "";
      const safety = setTimeout(() => {
        if (btn) {
          btn.disabled = false;
          btn.textContent = orig || "Se connecter";
        }
        setErr("Connexion trop lente — le serveur ne répond pas. Réessaie ou contacte l'admin.");
      }, 16e3);
      try {
        if (btn) {
          btn.disabled = true;
          btn.textContent = "Connexion…";
        }
        await Store.login(u2, p2);
        clearTimeout(safety);
        overlay.hidden = true;
        document.getElementById("app").style.display = "";
        Store.loadUsers().catch(() => {
        });
        Store.loadSettings();
        render();
        snack("Connecté");
      } catch (ex) {
        setErr(ex.message || "Erreur de connexion");
      } finally {
        clearTimeout(safety);
        if (btn) {
          btn.disabled = false;
          btn.textContent = orig;
        }
      }
    };
  } else if (mode === "forgot") {
    const back = overlay.querySelector("#authBack");
    if (back) back.onclick = () => renderAuth("login", null, true);
    if (form) form.onsubmit = async (e2) => {
      e2.preventDefault();
      setErr("");
      const email = overlay.querySelector("#authEmail").value.trim();
      try {
        await Store.forgot(email);
        setErr("Si un compte existe, un lien a été envoyé. Vérifie ton email.");
      } catch (ex) {
        setErr(ex.message || "Erreur");
      }
    };
  } else if (mode === "reset") {
    if (form) form.onsubmit = async (e2) => {
      e2.preventDefault();
      setErr("");
      const n1 = overlay.querySelector("#authNew").value;
      const n22 = overlay.querySelector("#authNew2").value;
      if (n1.length < 8) {
        setErr("Le mot de passe doit faire au moins 8 caractères");
        return;
      }
      if (n1 !== n22) {
        setErr("Les mots de passe ne correspondent pas");
        return;
      }
      try {
        await Store.resetPassword(token, n1);
        history.replaceState(null, "", location.pathname);
        setErr("");
        renderAuth("login", null, true);
        snack("Mot de passe réinitialisé. Connecte-toi.");
      } catch (ex) {
        setErr(ex.message || "Erreur");
      }
    };
  }
}
function showApp() {
  const overlay = document.getElementById("authOverlay");
  if (overlay) overlay.hidden = true;
  const app2 = document.getElementById("app");
  if (app2) app2.style.display = "";
}
function hideBootSplash() {
  const el = document.getElementById("bootSplash");
  if (el && el.parentNode) el.parentNode.removeChild(el);
}
const App = { render, snack, bind, boot, navigate, openFact, renderAuth, showApp };
/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const t$1 = globalThis, e$2 = t$1.ShadowRoot && (void 0 === t$1.ShadyCSS || t$1.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, s$2 = Symbol(), o$3 = /* @__PURE__ */ new WeakMap();
let n$2 = class n {
  constructor(t2, e2, o2) {
    if (this._$cssResult$ = true, o2 !== s$2) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t2, this.t = e2;
  }
  get styleSheet() {
    let t2 = this.o;
    const s2 = this.t;
    if (e$2 && void 0 === t2) {
      const e2 = void 0 !== s2 && 1 === s2.length;
      e2 && (t2 = o$3.get(s2)), void 0 === t2 && ((this.o = t2 = new CSSStyleSheet()).replaceSync(this.cssText), e2 && o$3.set(s2, t2));
    }
    return t2;
  }
  toString() {
    return this.cssText;
  }
};
const r$2 = (t2) => new n$2("string" == typeof t2 ? t2 : t2 + "", void 0, s$2), i$3 = (t2, ...e2) => {
  const o2 = 1 === t2.length ? t2[0] : e2.reduce((e3, s2, o3) => e3 + ((t3) => {
    if (true === t3._$cssResult$) return t3.cssText;
    if ("number" == typeof t3) return t3;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + t3 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(s2) + t2[o3 + 1], t2[0]);
  return new n$2(o2, t2, s$2);
}, S$1 = (s2, o2) => {
  if (e$2) s2.adoptedStyleSheets = o2.map((t2) => t2 instanceof CSSStyleSheet ? t2 : t2.styleSheet);
  else for (const e2 of o2) {
    const o3 = document.createElement("style"), n3 = t$1.litNonce;
    void 0 !== n3 && o3.setAttribute("nonce", n3), o3.textContent = e2.cssText, s2.appendChild(o3);
  }
}, c$2 = e$2 ? (t2) => t2 : (t2) => t2 instanceof CSSStyleSheet ? ((t3) => {
  let e2 = "";
  for (const s2 of t3.cssRules) e2 += s2.cssText;
  return r$2(e2);
})(t2) : t2;
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const { is: i$2, defineProperty: e$1, getOwnPropertyDescriptor: h$1, getOwnPropertyNames: r$1, getOwnPropertySymbols: o$2, getPrototypeOf: n$1 } = Object, a$1 = globalThis, c$1 = a$1.trustedTypes, l$1 = c$1 ? c$1.emptyScript : "", p$1 = a$1.reactiveElementPolyfillSupport, d$1 = (t2, s2) => t2, u$1 = { toAttribute(t2, s2) {
  switch (s2) {
    case Boolean:
      t2 = t2 ? l$1 : null;
      break;
    case Object:
    case Array:
      t2 = null == t2 ? t2 : JSON.stringify(t2);
  }
  return t2;
}, fromAttribute(t2, s2) {
  let i2 = t2;
  switch (s2) {
    case Boolean:
      i2 = null !== t2;
      break;
    case Number:
      i2 = null === t2 ? null : Number(t2);
      break;
    case Object:
    case Array:
      try {
        i2 = JSON.parse(t2);
      } catch (t3) {
        i2 = null;
      }
  }
  return i2;
} }, f$1 = (t2, s2) => !i$2(t2, s2), b = { attribute: true, type: String, converter: u$1, reflect: false, useDefault: false, hasChanged: f$1 };
Symbol.metadata ?? (Symbol.metadata = Symbol("metadata")), a$1.litPropertyMetadata ?? (a$1.litPropertyMetadata = /* @__PURE__ */ new WeakMap());
let y$1 = class y2 extends HTMLElement {
  static addInitializer(t2) {
    this._$Ei(), (this.l ?? (this.l = [])).push(t2);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t2, s2 = b) {
    if (s2.state && (s2.attribute = false), this._$Ei(), this.prototype.hasOwnProperty(t2) && ((s2 = Object.create(s2)).wrapped = true), this.elementProperties.set(t2, s2), !s2.noAccessor) {
      const i2 = Symbol(), h2 = this.getPropertyDescriptor(t2, i2, s2);
      void 0 !== h2 && e$1(this.prototype, t2, h2);
    }
  }
  static getPropertyDescriptor(t2, s2, i2) {
    const { get: e2, set: r2 } = h$1(this.prototype, t2) ?? { get() {
      return this[s2];
    }, set(t3) {
      this[s2] = t3;
    } };
    return { get: e2, set(s3) {
      const h2 = e2 == null ? void 0 : e2.call(this);
      r2 == null ? void 0 : r2.call(this, s3), this.requestUpdate(t2, h2, i2);
    }, configurable: true, enumerable: true };
  }
  static getPropertyOptions(t2) {
    return this.elementProperties.get(t2) ?? b;
  }
  static _$Ei() {
    if (this.hasOwnProperty(d$1("elementProperties"))) return;
    const t2 = n$1(this);
    t2.finalize(), void 0 !== t2.l && (this.l = [...t2.l]), this.elementProperties = new Map(t2.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(d$1("finalized"))) return;
    if (this.finalized = true, this._$Ei(), this.hasOwnProperty(d$1("properties"))) {
      const t3 = this.properties, s2 = [...r$1(t3), ...o$2(t3)];
      for (const i2 of s2) this.createProperty(i2, t3[i2]);
    }
    const t2 = this[Symbol.metadata];
    if (null !== t2) {
      const s2 = litPropertyMetadata.get(t2);
      if (void 0 !== s2) for (const [t3, i2] of s2) this.elementProperties.set(t3, i2);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [t3, s2] of this.elementProperties) {
      const i2 = this._$Eu(t3, s2);
      void 0 !== i2 && this._$Eh.set(i2, t3);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(s2) {
    const i2 = [];
    if (Array.isArray(s2)) {
      const e2 = new Set(s2.flat(1 / 0).reverse());
      for (const s3 of e2) i2.unshift(c$2(s3));
    } else void 0 !== s2 && i2.push(c$2(s2));
    return i2;
  }
  static _$Eu(t2, s2) {
    const i2 = s2.attribute;
    return false === i2 ? void 0 : "string" == typeof i2 ? i2 : "string" == typeof t2 ? t2.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    var _a2;
    this._$ES = new Promise((t2) => this.enableUpdating = t2), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), (_a2 = this.constructor.l) == null ? void 0 : _a2.forEach((t2) => t2(this));
  }
  addController(t2) {
    var _a2;
    (this._$EO ?? (this._$EO = /* @__PURE__ */ new Set())).add(t2), void 0 !== this.renderRoot && this.isConnected && ((_a2 = t2.hostConnected) == null ? void 0 : _a2.call(t2));
  }
  removeController(t2) {
    var _a2;
    (_a2 = this._$EO) == null ? void 0 : _a2.delete(t2);
  }
  _$E_() {
    const t2 = /* @__PURE__ */ new Map(), s2 = this.constructor.elementProperties;
    for (const i2 of s2.keys()) this.hasOwnProperty(i2) && (t2.set(i2, this[i2]), delete this[i2]);
    t2.size > 0 && (this._$Ep = t2);
  }
  createRenderRoot() {
    const t2 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return S$1(t2, this.constructor.elementStyles), t2;
  }
  connectedCallback() {
    var _a2;
    this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this.enableUpdating(true), (_a2 = this._$EO) == null ? void 0 : _a2.forEach((t2) => {
      var _a3;
      return (_a3 = t2.hostConnected) == null ? void 0 : _a3.call(t2);
    });
  }
  enableUpdating(t2) {
  }
  disconnectedCallback() {
    var _a2;
    (_a2 = this._$EO) == null ? void 0 : _a2.forEach((t2) => {
      var _a3;
      return (_a3 = t2.hostDisconnected) == null ? void 0 : _a3.call(t2);
    });
  }
  attributeChangedCallback(t2, s2, i2) {
    this._$AK(t2, i2);
  }
  _$ET(t2, s2) {
    var _a2;
    const i2 = this.constructor.elementProperties.get(t2), e2 = this.constructor._$Eu(t2, i2);
    if (void 0 !== e2 && true === i2.reflect) {
      const h2 = (void 0 !== ((_a2 = i2.converter) == null ? void 0 : _a2.toAttribute) ? i2.converter : u$1).toAttribute(s2, i2.type);
      this._$Em = t2, null == h2 ? this.removeAttribute(e2) : this.setAttribute(e2, h2), this._$Em = null;
    }
  }
  _$AK(t2, s2) {
    var _a2, _b2;
    const i2 = this.constructor, e2 = i2._$Eh.get(t2);
    if (void 0 !== e2 && this._$Em !== e2) {
      const t3 = i2.getPropertyOptions(e2), h2 = "function" == typeof t3.converter ? { fromAttribute: t3.converter } : void 0 !== ((_a2 = t3.converter) == null ? void 0 : _a2.fromAttribute) ? t3.converter : u$1;
      this._$Em = e2;
      const r2 = h2.fromAttribute(s2, t3.type);
      this[e2] = r2 ?? ((_b2 = this._$Ej) == null ? void 0 : _b2.get(e2)) ?? r2, this._$Em = null;
    }
  }
  requestUpdate(t2, s2, i2, e2 = false, h2) {
    var _a2;
    if (void 0 !== t2) {
      const r2 = this.constructor;
      if (false === e2 && (h2 = this[t2]), i2 ?? (i2 = r2.getPropertyOptions(t2)), !((i2.hasChanged ?? f$1)(h2, s2) || i2.useDefault && i2.reflect && h2 === ((_a2 = this._$Ej) == null ? void 0 : _a2.get(t2)) && !this.hasAttribute(r2._$Eu(t2, i2)))) return;
      this.C(t2, s2, i2);
    }
    false === this.isUpdatePending && (this._$ES = this._$EP());
  }
  C(t2, s2, { useDefault: i2, reflect: e2, wrapped: h2 }, r2) {
    i2 && !(this._$Ej ?? (this._$Ej = /* @__PURE__ */ new Map())).has(t2) && (this._$Ej.set(t2, r2 ?? s2 ?? this[t2]), true !== h2 || void 0 !== r2) || (this._$AL.has(t2) || (this.hasUpdated || i2 || (s2 = void 0), this._$AL.set(t2, s2)), true === e2 && this._$Em !== t2 && (this._$Eq ?? (this._$Eq = /* @__PURE__ */ new Set())).add(t2));
  }
  async _$EP() {
    this.isUpdatePending = true;
    try {
      await this._$ES;
    } catch (t3) {
      Promise.reject(t3);
    }
    const t2 = this.scheduleUpdate();
    return null != t2 && await t2, !this.isUpdatePending;
  }
  scheduleUpdate() {
    return this.performUpdate();
  }
  performUpdate() {
    var _a2;
    if (!this.isUpdatePending) return;
    if (!this.hasUpdated) {
      if (this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this._$Ep) {
        for (const [t4, s3] of this._$Ep) this[t4] = s3;
        this._$Ep = void 0;
      }
      const t3 = this.constructor.elementProperties;
      if (t3.size > 0) for (const [s3, i2] of t3) {
        const { wrapped: t4 } = i2, e2 = this[s3];
        true !== t4 || this._$AL.has(s3) || void 0 === e2 || this.C(s3, void 0, i2, e2);
      }
    }
    let t2 = false;
    const s2 = this._$AL;
    try {
      t2 = this.shouldUpdate(s2), t2 ? (this.willUpdate(s2), (_a2 = this._$EO) == null ? void 0 : _a2.forEach((t3) => {
        var _a3;
        return (_a3 = t3.hostUpdate) == null ? void 0 : _a3.call(t3);
      }), this.update(s2)) : this._$EM();
    } catch (s3) {
      throw t2 = false, this._$EM(), s3;
    }
    t2 && this._$AE(s2);
  }
  willUpdate(t2) {
  }
  _$AE(t2) {
    var _a2;
    (_a2 = this._$EO) == null ? void 0 : _a2.forEach((t3) => {
      var _a3;
      return (_a3 = t3.hostUpdated) == null ? void 0 : _a3.call(t3);
    }), this.hasUpdated || (this.hasUpdated = true, this.firstUpdated(t2)), this.updated(t2);
  }
  _$EM() {
    this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = false;
  }
  get updateComplete() {
    return this.getUpdateComplete();
  }
  getUpdateComplete() {
    return this._$ES;
  }
  shouldUpdate(t2) {
    return true;
  }
  update(t2) {
    this._$Eq && (this._$Eq = this._$Eq.forEach((t3) => this._$ET(t3, this[t3]))), this._$EM();
  }
  updated(t2) {
  }
  firstUpdated(t2) {
  }
};
y$1.elementStyles = [], y$1.shadowRootOptions = { mode: "open" }, y$1[d$1("elementProperties")] = /* @__PURE__ */ new Map(), y$1[d$1("finalized")] = /* @__PURE__ */ new Map(), p$1 == null ? void 0 : p$1({ ReactiveElement: y$1 }), (a$1.reactiveElementVersions ?? (a$1.reactiveElementVersions = [])).push("2.1.2");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const t = globalThis, i$1 = (t2) => t2, s$1 = t.trustedTypes, e = s$1 ? s$1.createPolicy("lit-html", { createHTML: (t2) => t2 }) : void 0, h = "$lit$", o$1 = `lit$${Math.random().toFixed(9).slice(2)}$`, n2 = "?" + o$1, r = `<${n2}>`, l3 = document, c = () => l3.createComment(""), a = (t2) => null === t2 || "object" != typeof t2 && "function" != typeof t2, u = Array.isArray, d = (t2) => u(t2) || "function" == typeof (t2 == null ? void 0 : t2[Symbol.iterator]), f = "[ 	\n\f\r]", v = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, _ = /-->/g, m = />/g, p = RegExp(`>|${f}(?:([^\\s"'>=/]+)(${f}*=${f}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g"), g = /'/g, $ = /"/g, y3 = /^(?:script|style|textarea|title)$/i, E = Symbol.for("lit-noChange"), A = Symbol.for("lit-nothing"), C = /* @__PURE__ */ new WeakMap(), P2 = l3.createTreeWalker(l3, 129);
function V(t2, i2) {
  if (!u(t2) || !t2.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return void 0 !== e ? e.createHTML(i2) : i2;
}
const N = (t2, i2) => {
  const s2 = t2.length - 1, e2 = [];
  let n3, l4 = 2 === i2 ? "<svg>" : 3 === i2 ? "<math>" : "", c2 = v;
  for (let i3 = 0; i3 < s2; i3++) {
    const s3 = t2[i3];
    let a2, u2, d2 = -1, f2 = 0;
    for (; f2 < s3.length && (c2.lastIndex = f2, u2 = c2.exec(s3), null !== u2); ) f2 = c2.lastIndex, c2 === v ? "!--" === u2[1] ? c2 = _ : void 0 !== u2[1] ? c2 = m : void 0 !== u2[2] ? (y3.test(u2[2]) && (n3 = RegExp("</" + u2[2], "g")), c2 = p) : void 0 !== u2[3] && (c2 = p) : c2 === p ? ">" === u2[0] ? (c2 = n3 ?? v, d2 = -1) : void 0 === u2[1] ? d2 = -2 : (d2 = c2.lastIndex - u2[2].length, a2 = u2[1], c2 = void 0 === u2[3] ? p : '"' === u2[3] ? $ : g) : c2 === $ || c2 === g ? c2 = p : c2 === _ || c2 === m ? c2 = v : (c2 = p, n3 = void 0);
    const x2 = c2 === p && t2[i3 + 1].startsWith("/>") ? " " : "";
    l4 += c2 === v ? s3 + r : d2 >= 0 ? (e2.push(a2), s3.slice(0, d2) + h + s3.slice(d2) + o$1 + x2) : s3 + o$1 + (-2 === d2 ? i3 : x2);
  }
  return [V(t2, l4 + (t2[s2] || "<?>") + (2 === i2 ? "</svg>" : 3 === i2 ? "</math>" : "")), e2];
};
class S {
  constructor({ strings: t2, _$litType$: i2 }, e2) {
    let r2;
    this.parts = [];
    let l4 = 0, a2 = 0;
    const u2 = t2.length - 1, d2 = this.parts, [f2, v2] = N(t2, i2);
    if (this.el = S.createElement(f2, e2), P2.currentNode = this.el.content, 2 === i2 || 3 === i2) {
      const t3 = this.el.content.firstChild;
      t3.replaceWith(...t3.childNodes);
    }
    for (; null !== (r2 = P2.nextNode()) && d2.length < u2; ) {
      if (1 === r2.nodeType) {
        if (r2.hasAttributes()) for (const t3 of r2.getAttributeNames()) if (t3.endsWith(h)) {
          const i3 = v2[a2++], s2 = r2.getAttribute(t3).split(o$1), e3 = /([.?@])?(.*)/.exec(i3);
          d2.push({ type: 1, index: l4, name: e3[2], strings: s2, ctor: "." === e3[1] ? I : "?" === e3[1] ? L2 : "@" === e3[1] ? z : H }), r2.removeAttribute(t3);
        } else t3.startsWith(o$1) && (d2.push({ type: 6, index: l4 }), r2.removeAttribute(t3));
        if (y3.test(r2.tagName)) {
          const t3 = r2.textContent.split(o$1), i3 = t3.length - 1;
          if (i3 > 0) {
            r2.textContent = s$1 ? s$1.emptyScript : "";
            for (let s2 = 0; s2 < i3; s2++) r2.append(t3[s2], c()), P2.nextNode(), d2.push({ type: 2, index: ++l4 });
            r2.append(t3[i3], c());
          }
        }
      } else if (8 === r2.nodeType) if (r2.data === n2) d2.push({ type: 2, index: l4 });
      else {
        let t3 = -1;
        for (; -1 !== (t3 = r2.data.indexOf(o$1, t3 + 1)); ) d2.push({ type: 7, index: l4 }), t3 += o$1.length - 1;
      }
      l4++;
    }
  }
  static createElement(t2, i2) {
    const s2 = l3.createElement("template");
    return s2.innerHTML = t2, s2;
  }
}
function M(t2, i2, s2 = t2, e2) {
  var _a2, _b2;
  if (i2 === E) return i2;
  let h2 = void 0 !== e2 ? (_a2 = s2._$Co) == null ? void 0 : _a2[e2] : s2._$Cl;
  const o2 = a(i2) ? void 0 : i2._$litDirective$;
  return (h2 == null ? void 0 : h2.constructor) !== o2 && ((_b2 = h2 == null ? void 0 : h2._$AO) == null ? void 0 : _b2.call(h2, false), void 0 === o2 ? h2 = void 0 : (h2 = new o2(t2), h2._$AT(t2, s2, e2)), void 0 !== e2 ? (s2._$Co ?? (s2._$Co = []))[e2] = h2 : s2._$Cl = h2), void 0 !== h2 && (i2 = M(t2, h2._$AS(t2, i2.values), h2, e2)), i2;
}
class R {
  constructor(t2, i2) {
    this._$AV = [], this._$AN = void 0, this._$AD = t2, this._$AM = i2;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t2) {
    const { el: { content: i2 }, parts: s2 } = this._$AD, e2 = ((t2 == null ? void 0 : t2.creationScope) ?? l3).importNode(i2, true);
    P2.currentNode = e2;
    let h2 = P2.nextNode(), o2 = 0, n3 = 0, r2 = s2[0];
    for (; void 0 !== r2; ) {
      if (o2 === r2.index) {
        let i3;
        2 === r2.type ? i3 = new k(h2, h2.nextSibling, this, t2) : 1 === r2.type ? i3 = new r2.ctor(h2, r2.name, r2.strings, this, t2) : 6 === r2.type && (i3 = new Z2(h2, this, t2)), this._$AV.push(i3), r2 = s2[++n3];
      }
      o2 !== (r2 == null ? void 0 : r2.index) && (h2 = P2.nextNode(), o2++);
    }
    return P2.currentNode = l3, e2;
  }
  p(t2) {
    let i2 = 0;
    for (const s2 of this._$AV) void 0 !== s2 && (void 0 !== s2.strings ? (s2._$AI(t2, s2, i2), i2 += s2.strings.length - 2) : s2._$AI(t2[i2])), i2++;
  }
}
class k {
  get _$AU() {
    var _a2;
    return ((_a2 = this._$AM) == null ? void 0 : _a2._$AU) ?? this._$Cv;
  }
  constructor(t2, i2, s2, e2) {
    this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t2, this._$AB = i2, this._$AM = s2, this.options = e2, this._$Cv = (e2 == null ? void 0 : e2.isConnected) ?? true;
  }
  get parentNode() {
    let t2 = this._$AA.parentNode;
    const i2 = this._$AM;
    return void 0 !== i2 && 11 === (t2 == null ? void 0 : t2.nodeType) && (t2 = i2.parentNode), t2;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t2, i2 = this) {
    t2 = M(this, t2, i2), a(t2) ? t2 === A || null == t2 || "" === t2 ? (this._$AH !== A && this._$AR(), this._$AH = A) : t2 !== this._$AH && t2 !== E && this._(t2) : void 0 !== t2._$litType$ ? this.$(t2) : void 0 !== t2.nodeType ? this.T(t2) : d(t2) ? this.k(t2) : this._(t2);
  }
  O(t2) {
    return this._$AA.parentNode.insertBefore(t2, this._$AB);
  }
  T(t2) {
    this._$AH !== t2 && (this._$AR(), this._$AH = this.O(t2));
  }
  _(t2) {
    this._$AH !== A && a(this._$AH) ? this._$AA.nextSibling.data = t2 : this.T(l3.createTextNode(t2)), this._$AH = t2;
  }
  $(t2) {
    var _a2;
    const { values: i2, _$litType$: s2 } = t2, e2 = "number" == typeof s2 ? this._$AC(t2) : (void 0 === s2.el && (s2.el = S.createElement(V(s2.h, s2.h[0]), this.options)), s2);
    if (((_a2 = this._$AH) == null ? void 0 : _a2._$AD) === e2) this._$AH.p(i2);
    else {
      const t3 = new R(e2, this), s3 = t3.u(this.options);
      t3.p(i2), this.T(s3), this._$AH = t3;
    }
  }
  _$AC(t2) {
    let i2 = C.get(t2.strings);
    return void 0 === i2 && C.set(t2.strings, i2 = new S(t2)), i2;
  }
  k(t2) {
    u(this._$AH) || (this._$AH = [], this._$AR());
    const i2 = this._$AH;
    let s2, e2 = 0;
    for (const h2 of t2) e2 === i2.length ? i2.push(s2 = new k(this.O(c()), this.O(c()), this, this.options)) : s2 = i2[e2], s2._$AI(h2), e2++;
    e2 < i2.length && (this._$AR(s2 && s2._$AB.nextSibling, e2), i2.length = e2);
  }
  _$AR(t2 = this._$AA.nextSibling, s2) {
    var _a2;
    for ((_a2 = this._$AP) == null ? void 0 : _a2.call(this, false, true, s2); t2 !== this._$AB; ) {
      const s3 = i$1(t2).nextSibling;
      i$1(t2).remove(), t2 = s3;
    }
  }
  setConnected(t2) {
    var _a2;
    void 0 === this._$AM && (this._$Cv = t2, (_a2 = this._$AP) == null ? void 0 : _a2.call(this, t2));
  }
}
class H {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(t2, i2, s2, e2, h2) {
    this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t2, this.name = i2, this._$AM = e2, this.options = h2, s2.length > 2 || "" !== s2[0] || "" !== s2[1] ? (this._$AH = Array(s2.length - 1).fill(new String()), this.strings = s2) : this._$AH = A;
  }
  _$AI(t2, i2 = this, s2, e2) {
    const h2 = this.strings;
    let o2 = false;
    if (void 0 === h2) t2 = M(this, t2, i2, 0), o2 = !a(t2) || t2 !== this._$AH && t2 !== E, o2 && (this._$AH = t2);
    else {
      const e3 = t2;
      let n3, r2;
      for (t2 = h2[0], n3 = 0; n3 < h2.length - 1; n3++) r2 = M(this, e3[s2 + n3], i2, n3), r2 === E && (r2 = this._$AH[n3]), o2 || (o2 = !a(r2) || r2 !== this._$AH[n3]), r2 === A ? t2 = A : t2 !== A && (t2 += (r2 ?? "") + h2[n3 + 1]), this._$AH[n3] = r2;
    }
    o2 && !e2 && this.j(t2);
  }
  j(t2) {
    t2 === A ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t2 ?? "");
  }
}
class I extends H {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(t2) {
    this.element[this.name] = t2 === A ? void 0 : t2;
  }
}
class L2 extends H {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(t2) {
    this.element.toggleAttribute(this.name, !!t2 && t2 !== A);
  }
}
class z extends H {
  constructor(t2, i2, s2, e2, h2) {
    super(t2, i2, s2, e2, h2), this.type = 5;
  }
  _$AI(t2, i2 = this) {
    if ((t2 = M(this, t2, i2, 0) ?? A) === E) return;
    const s2 = this._$AH, e2 = t2 === A && s2 !== A || t2.capture !== s2.capture || t2.once !== s2.once || t2.passive !== s2.passive, h2 = t2 !== A && (s2 === A || e2);
    e2 && this.element.removeEventListener(this.name, this, s2), h2 && this.element.addEventListener(this.name, this, t2), this._$AH = t2;
  }
  handleEvent(t2) {
    var _a2;
    "function" == typeof this._$AH ? this._$AH.call(((_a2 = this.options) == null ? void 0 : _a2.host) ?? this.element, t2) : this._$AH.handleEvent(t2);
  }
}
class Z2 {
  constructor(t2, i2, s2) {
    this.element = t2, this.type = 6, this._$AN = void 0, this._$AM = i2, this.options = s2;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t2) {
    M(this, t2);
  }
}
const B = t.litHtmlPolyfillSupport;
B == null ? void 0 : B(S, k), (t.litHtmlVersions ?? (t.litHtmlVersions = [])).push("3.3.3");
const D = (t2, i2, s2) => {
  const e2 = (s2 == null ? void 0 : s2.renderBefore) ?? i2;
  let h2 = e2._$litPart$;
  if (void 0 === h2) {
    const t3 = (s2 == null ? void 0 : s2.renderBefore) ?? null;
    e2._$litPart$ = h2 = new k(i2.insertBefore(c(), t3), t3, void 0, s2 ?? {});
  }
  return h2._$AI(t2), h2;
};
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const s = globalThis;
class i extends y$1 {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    var _a2;
    const t2 = super.createRenderRoot();
    return (_a2 = this.renderOptions).renderBefore ?? (_a2.renderBefore = t2.firstChild), t2;
  }
  update(t2) {
    const r2 = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t2), this._$Do = D(r2, this.renderRoot, this.renderOptions);
  }
  connectedCallback() {
    var _a2;
    super.connectedCallback(), (_a2 = this._$Do) == null ? void 0 : _a2.setConnected(true);
  }
  disconnectedCallback() {
    var _a2;
    super.disconnectedCallback(), (_a2 = this._$Do) == null ? void 0 : _a2.setConnected(false);
  }
  render() {
    return E;
  }
}
i._$litElement$ = true, i["finalized"] = true, (_b = s.litElementHydrateSupport) == null ? void 0 : _b.call(s, { LitElement: i });
const o = s.litElementPolyfillSupport;
o == null ? void 0 : o({ LitElement: i });
(s.litElementVersions ?? (s.litElementVersions = [])).push("4.2.2");
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
const styles = i$3`@layer{.md-typescale-display-small,.md-typescale-display-small-prominent{font:var(--md-sys-typescale-display-small-weight, var(--md-ref-typeface-weight-regular, 400)) var(--md-sys-typescale-display-small-size, 2.25rem)/var(--md-sys-typescale-display-small-line-height, 2.75rem) var(--md-sys-typescale-display-small-font, var(--md-ref-typeface-brand, Roboto))}.md-typescale-display-medium,.md-typescale-display-medium-prominent{font:var(--md-sys-typescale-display-medium-weight, var(--md-ref-typeface-weight-regular, 400)) var(--md-sys-typescale-display-medium-size, 2.8125rem)/var(--md-sys-typescale-display-medium-line-height, 3.25rem) var(--md-sys-typescale-display-medium-font, var(--md-ref-typeface-brand, Roboto))}.md-typescale-display-large,.md-typescale-display-large-prominent{font:var(--md-sys-typescale-display-large-weight, var(--md-ref-typeface-weight-regular, 400)) var(--md-sys-typescale-display-large-size, 3.5625rem)/var(--md-sys-typescale-display-large-line-height, 4rem) var(--md-sys-typescale-display-large-font, var(--md-ref-typeface-brand, Roboto))}.md-typescale-headline-small,.md-typescale-headline-small-prominent{font:var(--md-sys-typescale-headline-small-weight, var(--md-ref-typeface-weight-regular, 400)) var(--md-sys-typescale-headline-small-size, 1.5rem)/var(--md-sys-typescale-headline-small-line-height, 2rem) var(--md-sys-typescale-headline-small-font, var(--md-ref-typeface-brand, Roboto))}.md-typescale-headline-medium,.md-typescale-headline-medium-prominent{font:var(--md-sys-typescale-headline-medium-weight, var(--md-ref-typeface-weight-regular, 400)) var(--md-sys-typescale-headline-medium-size, 1.75rem)/var(--md-sys-typescale-headline-medium-line-height, 2.25rem) var(--md-sys-typescale-headline-medium-font, var(--md-ref-typeface-brand, Roboto))}.md-typescale-headline-large,.md-typescale-headline-large-prominent{font:var(--md-sys-typescale-headline-large-weight, var(--md-ref-typeface-weight-regular, 400)) var(--md-sys-typescale-headline-large-size, 2rem)/var(--md-sys-typescale-headline-large-line-height, 2.5rem) var(--md-sys-typescale-headline-large-font, var(--md-ref-typeface-brand, Roboto))}.md-typescale-title-small,.md-typescale-title-small-prominent{font:var(--md-sys-typescale-title-small-weight, var(--md-ref-typeface-weight-medium, 500)) var(--md-sys-typescale-title-small-size, 0.875rem)/var(--md-sys-typescale-title-small-line-height, 1.25rem) var(--md-sys-typescale-title-small-font, var(--md-ref-typeface-plain, Roboto))}.md-typescale-title-medium,.md-typescale-title-medium-prominent{font:var(--md-sys-typescale-title-medium-weight, var(--md-ref-typeface-weight-medium, 500)) var(--md-sys-typescale-title-medium-size, 1rem)/var(--md-sys-typescale-title-medium-line-height, 1.5rem) var(--md-sys-typescale-title-medium-font, var(--md-ref-typeface-plain, Roboto))}.md-typescale-title-large,.md-typescale-title-large-prominent{font:var(--md-sys-typescale-title-large-weight, var(--md-ref-typeface-weight-regular, 400)) var(--md-sys-typescale-title-large-size, 1.375rem)/var(--md-sys-typescale-title-large-line-height, 1.75rem) var(--md-sys-typescale-title-large-font, var(--md-ref-typeface-brand, Roboto))}.md-typescale-body-small,.md-typescale-body-small-prominent{font:var(--md-sys-typescale-body-small-weight, var(--md-ref-typeface-weight-regular, 400)) var(--md-sys-typescale-body-small-size, 0.75rem)/var(--md-sys-typescale-body-small-line-height, 1rem) var(--md-sys-typescale-body-small-font, var(--md-ref-typeface-plain, Roboto))}.md-typescale-body-medium,.md-typescale-body-medium-prominent{font:var(--md-sys-typescale-body-medium-weight, var(--md-ref-typeface-weight-regular, 400)) var(--md-sys-typescale-body-medium-size, 0.875rem)/var(--md-sys-typescale-body-medium-line-height, 1.25rem) var(--md-sys-typescale-body-medium-font, var(--md-ref-typeface-plain, Roboto))}.md-typescale-body-large,.md-typescale-body-large-prominent{font:var(--md-sys-typescale-body-large-weight, var(--md-ref-typeface-weight-regular, 400)) var(--md-sys-typescale-body-large-size, 1rem)/var(--md-sys-typescale-body-large-line-height, 1.5rem) var(--md-sys-typescale-body-large-font, var(--md-ref-typeface-plain, Roboto))}.md-typescale-label-small,.md-typescale-label-small-prominent{font:var(--md-sys-typescale-label-small-weight, var(--md-ref-typeface-weight-medium, 500)) var(--md-sys-typescale-label-small-size, 0.6875rem)/var(--md-sys-typescale-label-small-line-height, 1rem) var(--md-sys-typescale-label-small-font, var(--md-ref-typeface-plain, Roboto))}.md-typescale-label-medium,.md-typescale-label-medium-prominent{font:var(--md-sys-typescale-label-medium-weight, var(--md-ref-typeface-weight-medium, 500)) var(--md-sys-typescale-label-medium-size, 0.75rem)/var(--md-sys-typescale-label-medium-line-height, 1rem) var(--md-sys-typescale-label-medium-font, var(--md-ref-typeface-plain, Roboto))}.md-typescale-label-medium-prominent{font-weight:var(--md-sys-typescale-label-medium-weight-prominent, var(--md-ref-typeface-weight-bold, 700))}.md-typescale-label-large,.md-typescale-label-large-prominent{font:var(--md-sys-typescale-label-large-weight, var(--md-ref-typeface-weight-medium, 500)) var(--md-sys-typescale-label-large-size, 0.875rem)/var(--md-sys-typescale-label-large-line-height, 1.25rem) var(--md-sys-typescale-label-large-font, var(--md-ref-typeface-plain, Roboto))}.md-typescale-label-large-prominent{font-weight:var(--md-sys-typescale-label-large-weight-prominent, var(--md-ref-typeface-weight-bold, 700))}}
`;
styles.styleSheet;
if (document.adoptedStyleSheets) {
  document.adoptedStyleSheets.push(styles.styleSheet);
}
window.addEventListener("error", (e2) => {
  const v2 = document.getElementById("view");
  if (v2) v2.innerHTML = '<pre style="color:#F2A199;padding:20px;white-space:pre-wrap">ERREUR: ' + (e2.message || e2.error) + "\n" + (e2.error && e2.error.stack ? e2.error.stack : "") + "</pre>";
});
async function purgeServiceWorkers() {
  if (!("serviceWorker" in navigator)) return false;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r2 of regs) {
      try {
        await r2.unregister();
      } catch (e2) {
      }
    }
    return regs.length > 0;
  } catch (e2) {
    return false;
  }
}
purgeServiceWorkers();
const app = document.getElementById("app");
app.innerHTML = SHELL;
const bootTheme = Store.initTheme();
Store.state.ui.theme = bootTheme;
const bootRail = Store.initRailMode();
Store.state.ui.railMode = bootRail;
App.bind();
App.boot();
Store.subscribe(() => App.render());
window.Store = Store;
window.App = App;
setTimeout(() => {
  const el = document.getElementById("bootSplash");
  if (el) el.remove();
}, 8e3);
