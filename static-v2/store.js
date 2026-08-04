/* ============================================================
   KORA — Store d'état unique + API (anti-coquille-vide)
   Toute réponse API est validée : ok + JSON, sinon état error.
   ============================================================ */
const Store = (() => {
  const state = {
    route: "cockpit",
    ui: { loading: false, error: null, busy: false, overlay: null },
    health: null,
    lastCycle: null,      // {running, result}
    facts: [],            // faits HITL (dernier cycle)
    decisions: {},        // fact_id -> status
    audit: [],
    sources: [],
    sheet: null,          // {type:'fact'|'edit', fact}
  };

  const subs = new Set();
  function setState(patch) {
    Object.assign(state, patch);
    subs.forEach(fn => fn(state));
  }
  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

  // ----- API safe (jamais de crash JSON) -----
  // BASE auto : si servi sous /kora-v2 (preview nginx), on préfixe les API.
  const BASE = location.pathname.startsWith("/kora-v2") ? "/kora-v2" : "";
  async function api(path, opts) {
    const url = BASE + path;
    try {
      const res = await fetch(url, opts);
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        // Le serveur a renvoyé du HTML (ex: 502) -> état error propre
        throw new Error("Réponse non-JSON du serveur (code " + res.status + ")");
      }
      return await res.json();
    } catch (e) {
      // réseau coupé ou HTML reçu
      throw new Error(e.message || "Réseau indisponible");
    }
  }

  async function loadHealth() {
    try { setState({ health: await api("/api/health") }); }
    catch (e) { setState({ ui: { ...state.ui, error: e.message } }); }
  }

  async function loadLast() {
    try {
      const r = await api("/api/last");
      setState({ lastCycle: r, facts: (r.result && r.result.facts) || [] });
    } catch (e) { setState({ ui: { ...state.ui, error: e.message } }); }
  }

  async function loadHITL() {
    setState({ ui: { ...state.ui, loading: true, error: null } });
    try {
      const faits = await api("/api/hitl");
      setState({ facts: faits, ui: { ...state.ui, loading: false } });
    } catch (e) {
      setState({ facts: [], ui: { ...state.ui, loading: false, error: e.message } });
    }
  }

  async function loadAudit() {
    try { setState({ audit: await api("/api/audit") }); }
    catch (e) { setState({ ui: { ...state.ui, error: e.message } }); }
  }

  async function loadSources() {
    try { setState({ sources: await api("/api/whitelist") }); }
    catch (e) { setState({ ui: { ...state.ui, error: e.message } }); }
  }

  async function startCycle(demand = 3) {
    setState({ ui: { ...state.ui, busy: true, overlay: "Collecte des sources whitelist…" } });
    try {
      await api("/api/cycle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ demand }) });
      // polling jusqu'à fin
      for (let i = 0; i < 60; i++) {
        await wait(3000);
        const r = await api("/api/last");
        setState({ lastCycle: r });
        if (!r.running && r.result) {
          setState({ facts: r.result.facts || [], ui: { ...state.ui, busy: false, overlay: null } });
          App.render();
          return;
        }
        setState({ ui: { ...state.ui, overlay: "Cycle en cours… (" + (i * 3) + "s)" } });
      }
      setState({ ui: { ...state.ui, busy: false, overlay: null } });
    } catch (e) {
      setState({ ui: { ...state.ui, busy: false, overlay: null, error: e.message } });
    }
  }

  async function seed() {
    setState({ ui: { ...state.ui, busy: true, overlay: "Génération de faits de démo…" } });
    try {
      await api("/api/seed_demo");
      await loadHITL();
      setState({ ui: { ...state.ui, busy: false, overlay: null } });
      App.snack("2 faits de démo prêts à valider");
    } catch (e) {
      setState({ ui: { ...state.ui, busy: false, overlay: null, error: e.message } });
    }
  }

  async function decide(factId, decision, editedText = "") {
    setState({ ui: { ...state.ui, busy: true, overlay: "Enregistrement…" } });
    try {
      const r = await api("/api/hitl/decide", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact_id: factId, decision, edited_text: editedText, decided_by: "chef_de_secteur" })
      });
      if (r.error) throw new Error(r.error);
      setState({
        decisions: { ...state.decisions, [factId]: decision },
        ui: { ...state.ui, busy: false, overlay: null }
      });
      App.snack(decision === "APPROVED" ? "Article transmis ✓" : decision === "REJECTED" ? "Fait rejeté" : "Modifié");
    } catch (e) {
      setState({ ui: { ...state.ui, busy: false, overlay: null, error: e.message } });
      App.snack("Erreur : " + e.message);
    }
  }

  function setRoute(r) { setState({ route: r }); }
  function openSheet(s) { setState({ sheet: s }); }
  function closeSheet() { setState({ sheet: null }); }
  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  return {
    state, setState, subscribe, api,
    loadHealth, loadLast, loadHITL, loadAudit, loadSources,
    startCycle, seed, decide, setRoute, openSheet, closeSheet, wait
  };
})();
