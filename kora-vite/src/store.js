/* ============================================================
   KORA — Store d'état unique + API (anti-coquille-vide)
   Module ES. BASE auto selon l'emplacement (/kora-v2 ou /).
   ============================================================ */
const BASE = location.pathname.startsWith("/kora-v2") ? "/kora-v2" : "";

export const Store = (() => {
  const state = {
    route: "cockpit",
    ui: { loading: false, error: null, busy: false, overlay: null, theme: "dark", rail: "expanded", factFilter: "all" },
    health: null,
    lastCycle: null,
    facts: [],
    decisions: {},
    audit: [],
    sources: [],
    sheet: null,
  };

  const subs = new Set();
  function setState(patch) {
    Object.assign(state, patch);
    subs.forEach((fn) => fn(state));
  }
  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

  async function api(path, opts) {
    const url = BASE + path;
    try {
      const res = await fetch(url, opts);
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        throw new Error("Réponse non-JSON du serveur (code " + res.status + ")");
      }
      return await res.json();
    } catch (e) {
      throw new Error(e.message || "Réseau indisponible");
    }
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
      setState({ facts: faits, ui: { ...state.ui, loading: false } });
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
      const parts = s.app_name.split(/\s+(.+)/); // "KORA Reach" -> ["KORA","Reach"]
      nameEl.textContent = parts[0] || s.app_name;
      if (subEl) subEl.textContent = parts[1] || "";
    }
    if (markEl) {
      if (s.has_logo && s.logo_data) {
        markEl.innerHTML = `<img src="${s.logo_data}" alt="" style="width:22px;height:22px;border-radius:6px;object-fit:contain;">`;
      } else {
        markEl.innerHTML = `<svg class="ic"><use href="#i-spark"/></svg>`;
      }
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
  async function startCycle(demand = 3, force = false) {
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
    setState({ ui: { ...state.ui, busy: true, overlay: "Génération de faits de démo…" } });
    try {
      await api("/api/seed_demo");
      await loadHITL();
      setState({ ui: { ...state.ui, busy: false, overlay: null } });
    } catch (e) { setState({ ui: { ...state.ui, busy: false, overlay: null, error: e.message } }); }
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

  // ---- Rail (drawer coulissant : expanded / collapsed) ----
  const RAILS = ["expanded", "collapsed"];
  function getRail() { return state.ui.rail || "expanded"; }
  function applyRail(r) {
    const root = document.documentElement;
    if (root) root.setAttribute("data-rail", r);
  }
  function setRail(r) {
    if (!RAILS.includes(r)) r = "expanded";
    try { localStorage.setItem("kora-rail", r); } catch (e) {}
    applyRail(r);
    setState({ ui: { ...state.ui, rail: r } });
  }
  function initRail() {
    let r = "expanded";
    try { r = localStorage.getItem("kora-rail") || "expanded"; } catch (e) {}
    if (!RAILS.includes(r)) r = "expanded";
    applyRail(r);
    return r;
  }

  return {
    state, setState, subscribe, api,
    loadHealth, loadLast, loadHITL, loadAudit, loadSources, loadSettings, applySettings,
    startCycle, seed, decide, retract, setRoute, openSheet, closeSheet, wait,
    getFactFilter, setFactFilter,
    getTheme, setTheme, initTheme,
    getRail, setRail, initRail
  };
})();
