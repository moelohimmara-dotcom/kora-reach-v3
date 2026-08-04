/* ============================================================
   KORA — App (rendu + router + nav)
   Chaque écran gère ses 4 états : loading / data / empty / error
   ============================================================ */
const App = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function icon(id, cls = "") { return `<svg class="ic ${cls}"><use href="#${id}"/></svg>`; }

  function chip(label, kind = "", ic = "") {
    return `<span class="chip ${kind} ${ic ? "ic-only" : ""}">${ic ? icon(ic) : ""}${esc(label)}</span>`;
  }

  function factMeta(f) {
    const c = f.champion || {};
    const lvl = c.level || (c.guinee_filter ? 2 : 1);
    return [
      chip(lvl === 1 ? "Niveau 1 · Source guinéenne" : "Niveau 2 · INTL filtrée", lvl === 1 ? "primary" : "secondary", lvl === 1 ? "i-level1" : "i-level2"),
      chip("Fusion " + (f.n_sources || 1) + " sources", "tertiary", "i-fusion"),
      chip("Date OK", "tertiary", "i-date"),
    ].join("");
  }

  function statusBadge(st) {
    const map = {
      PENDING_REVIEW: ["badge-pending", "En attente"],
      APPROVED: ["badge-approved", "Approuvé"],
      REJECTED: ["badge-rejected", "Rejeté"],
      TRANSMITTED: ["badge-transmitted", "Transmis"],
      EDITED: ["badge-pending", "Édité"],
    };
    const [k, t] = map[st] || ["badge-pending", st || "—"];
    return `<span class="badge ${k}">${t}</span>`;
  }

  // ---------- Écrans ----------
  function viewCockpit(s) {
    const lc = s.lastCycle, r = (lc && lc.result) || null;
    const busy = s.ui.busy;
    if (busy && !r) {
      return stateBox("i-refresh", "Cycle en cours…", "L'agent collecte les 12 sources whitelist et fusionne les faits. Cela prend ~15s.", true);
    }
    const pending = (s.facts || []).filter(f => !(s.decisions[f.fact_id] === "REJECTED" || s.decisions[f.fact_id] === "TRANSMITTED")).length;
    const rejectedIntl = (r && r.rejected_intl) || 0;
    const sourcesOk = (r && r.sources_ok) || 0;
    const anomalies = (r && r.date_anomalies) || 0;
    const alert = pending > 0;
    return `
      <div class="pulse-card">
        <div class="pulse-label">Pouls de la rédaction</div>
        <div class="pulse-num ${alert ? "alert" : ""}">${pending}</div>
        <div class="pulse-sub">${pending > 0 ? "fait(s) chaud(s) à valider dans la fenêtre 24h" : "fenêtre 24h calme — aucun fait à valider"}</div>
      </div>
      <div class="stat-row">
        <div class="stat"><div class="n">${sourcesOk}</div><div class="l">Sources OK</div></div>
        <div class="stat"><div class="n">${(r && r.total_items) || 0}</div><div class="l">Items</div></div>
        <div class="stat"><div class="n">${(s.facts || []).length}</div><div class="l">Faits</div></div>
        <div class="stat ${rejectedIntl ? "alert" : ""}"><div class="n">${rejectedIntl}</div><div class="l">Rejetés INTL</div></div>
      </div>
      ${anomalies ? `<p class="muted" style="margin-bottom:16px">⚠ ${anomalies} anomalie(s) de date détectée(s) (filtrées).</p>` : ""}
      <div class="section-title">Faits en attente de validation</div>
      ${renderFacts(s, true)}
    `;
  }

  function renderFacts(s, compact = false) {
    const facts = s.facts || [];
    if (!facts.length) {
      return stateBox("i-facts", "Aucun fait à afficher",
        s.ui.error ? "Impossible de charger : " + s.ui.error : "Lance un cycle ou un seed démo pour peupler la file.", !!s.ui.loading);
    }
    return `<div class="fact-grid">${facts.map(f => factCard(f, s)).join("")}</div>`;
  }

  const PLACEHOLDER = "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#241C18"/><stop offset="1" stop-color="#15110F"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><g fill="none" stroke="#F2A98C" stroke-width="3" opacity=".7"><rect x="118" y="64" width="84" height="60" rx="10"/><circle cx="142" cy="86" r="9"/><path d="M124 118l24-26 18 18 14-12 20 22"/></g></svg>'
  );
  function factCard(f, s) {
    const c = f.champion || {};
    const dec = s.decisions[f.fact_id];
    const img = (f.image_meta && f.image_meta.image) || c.image || "";
    const status = dec || (f.status || "PENDING_REVIEW");
    return `
      <article class="fact-card" data-fact="${esc(f.fact_id)}">
        <img class="fact-img" src="${img ? esc(img) : PLACEHOLDER}" alt="" loading="lazy" onerror="this.src='${PLACEHOLDER}'">
        <div class="fact-body">
          <h3 class="fact-title">${esc(c.title)}</h3>
          <div class="fact-chips">${factMeta(f)}</div>
          <div class="fact-status">${statusBadge(status)} <span class="muted">${esc(c.source || "")}</span></div>
        </div>
      </article>`;
  }

  function viewFacts(s) { return `<div class="section-title">Tous les faits</div>${renderFacts(s)}`; }

  function viewHITL(s) {
    const facts = (s.facts || []).filter(f => !(s.decisions[f.fact_id] === "REJECTED" || s.decisions[f.fact_id] === "TRANSMITTED"));
    if (s.ui.loading) return stateBox("i-check", "Chargement de la file…", "Récupération des décisions HITL.", true);
    if (s.ui.error) return stateBox("i-status", "Agent injoignable", s.ui.error + " — reprise automatique en cours.", false, "Réessayer");
    if (!facts.length) return stateBox("i-check", "File de validation vide",
      "Aucun fait en attente. Lance un cycle ou un seed démo pour générer des articles à valider.", false, "Seed démo", () => Store.seed());
    return `<div class="section-title">Validation humaine (${facts.length})</div>
      <p class="muted" style="margin-bottom:16px">Chaque fait doit être validé avant transmission. Tu peux corriger le titre/corps, rejeter, ou transmettre.</p>
      <div class="fact-grid">${facts.map(f => factCard(f, s)).join("")}</div>`;
  }

  function viewSources(s) {
    const src = s.sources || [];
    if (!src.length) return stateBox("i-sources", "Sources en chargement…", "Récupération de la whitelist gouvernée.", !!s.ui.loading);
    return `<div class="section-title">Gouvernance des sources (${src.length})</div>
      <p class="muted" style="margin-bottom:16px">Whitelist figée G1 — aucune découverte automatique. Toute cible hors liste est refusée.</p>
      ${src.map(e => `
        <div class="list-row">
          <div class="meta">
            <div class="name">${esc(e.name)} ${e.guinee_filter ? chip("Filtre Guinée", "warning", "i-shield") : ""}</div>
            <div class="sub">${esc(e.category)} · ${esc(e.vector_primary)} · ${esc(e.entry_url)}</div>
          </div>
          ${chip(e.category === "GN_NAT" ? "Niveau 1" : "Niveau 2", e.category === "GN_NAT" ? "primary" : "secondary")}
        </div>`).join("")}`;
  }

  function viewAudit(s) {
    const a = s.audit || [];
    if (!a.length) return stateBox("i-audit", "Piste d'audit vide", "Les décisions validées apparaîtront ici (qui / quand / transition).", false);
    return `<div class="section-title">Piste d'audit</div>
      ${a.slice(0, 40).map(ev => `
        <div class="list-row">
          <div class="meta"><div class="name">${esc(ev.action || ev.kind || "événement")}</div>
          <div class="sub">${esc(ev.detail || "")}</div></div>
          <div class="sub">${esc((ev.at || ev.ts || "").slice(0, 19).replace("T", " "))}</div>
        </div>`).join("")}`;
  }

  function stateBox(ic, title, msg, loading = false, actionLabel = null, actionFn = null) {
    return `<div class="state-box">
      ${loading ? `<div class="wave" style="height:32px;margin:0 auto 16px"><i></i><i></i><i></i><i></i><i></i></div>` : icon(ic)}
      <h3>${esc(title)}</h3>
      <p>${esc(msg)}</p>
      ${actionLabel ? `<button class="btn btn-primary" id="stateAction">${esc(actionLabel)}</button>` : ""}
    </div>`;
  }

  // ---------- Sheet (validation / édition) ----------
  function renderSheet(s) {
    const sh = s.sheet; const body = $("#sheetBody"); const sheet = $("#sheet"); const scrim = $("#sheetScrim");
    if (!sh) { sheet.hidden = true; scrim.hidden = true; return; }
    const f = sh.fact; const c = f.champion || {};
    const img = (f.image_meta && f.image_meta.image) || c.image || "";
    const text = (f.article && (f.article.final_text || f.article.body)) || f.final_text || c.summary || "";
    body.innerHTML = `
      <div class="sheet-head">
        ${icon("i-shield", "ic-l")}
        <div>
          <div class="sheet-eyebrow">Validation humaine · KORA Reach</div>
          <h2 class="sheet-title">${esc(c.title)}</h2>
        </div>
      </div>
      ${img ? `<img class="sheet-img" src="${esc(img)}" alt="" onerror="this.src='${PLACEHOLDER}'">` : `<img class="sheet-img" src="${PLACEHOLDER}" alt="">`}
      <div class="fact-chips" style="margin:4px 0 18px">${factMeta(f)}</div>
      <div class="kv"><b>Source champion</b><span>${esc(c.source || "—")}</span></div>
      <div class="kv"><b>Contexte</b><span>${esc((f.contexts || []).map(x => x.source).join(", ") || "—")}</span></div>
      <div class="kv"><b>Statut</b><span>${statusBadge(f.status || "PENDING_REVIEW")}</span></div>
      <div class="kv"><b>Fusion</b><span>${esc(f.n_sources || 1)} source(s)</span></div>
      <div class="sheet-textwrap"><div class="sheet-text">${esc(text).slice(0, 700)}</div></div>
      <div class="sheet-actions">
        <button class="btn btn-primary btn-block" data-decide="APPROVED">${icon("i-send")} Approuver &amp; transmettre</button>
        <button class="btn btn-tonal btn-block" data-edit="1">${icon("i-edit")} Modifier le texte</button>
        <button class="btn btn-danger btn-block" data-decide="REJECTED">${icon("i-reject")} Rejeter</button>
      </div>`;
    sheet.hidden = false; scrim.hidden = false;

    $$("[data-decide]", body).forEach(b => b.onclick = () => { Store.decide(f.fact_id, b.dataset.decide); Store.closeSheet(); });
    const ed = $("[data-edit]", body);
    if (ed) ed.onclick = () => {
      body.innerHTML = `
        <h2 style="font-size:var(--md-sys-typescale-title-lg);margin-bottom:8px">${esc(c.title)}</h2>
        <p class="muted" style="margin-bottom:12px">Corrige le titre et le corps avant validation.</p>
        <input id="edTitle" class="btn btn-tonal btn-block" style="text-align:left;margin-bottom:12px" value="${esc(c.title)}">
        <textarea id="edText">${esc(text)}</textarea>
        <div class="sheet-actions">
          <button class="btn btn-primary btn-block" id="edSave">${icon("i-check")} Valider la correction</button>
          <button class="btn btn-tonal btn-block" id="edCancel">Annuler</button>
        </div>`;
      $("#edSave").onclick = () => {
        const t = $("#edTitle").value, x = $("#edText").value;
        // on stocke la correction en mémoire puis on approuve
        f._edited = { title: t, text: x };
        Store.decide(f.fact_id, "EDITED", x);
        Store.closeSheet();
      };
      $("#edCancel").onclick = () => renderSheet(s);
    };
  }

  // ---------- Render ----------
  function render() {
    const s = Store.state;
    $("#agentStatus").innerHTML = s.ui.busy
      ? `<span class="dot dot-busy"></span><span>${s.ui.overlay || "Agent occupé…"}</span>`
      : `<span class="dot dot-ok"></span><span>${esc((s.health && s.health.editor) || "prêt")}</span>`;
    const view = $("#view");
    const map = { cockpit: viewCockpit, facts: viewFacts, hitl: viewHITL, sources: viewSources, audit: viewAudit };
    view.innerHTML = (map[s.route] || viewCockpit)(s);

    // active nav
    $$(".navitem, .rail .navitem").forEach(n => n.classList.toggle("active", n.dataset.route === s.route));

    // state action binding
    const sa = $("#stateAction");
    if (sa) sa.onclick = () => { if (s.route === "hitl") Store.seed(); else Store.startCycle(); };

    // overlay
    const gl = $("#globalLoader");
    if (s.ui.busy) { gl.hidden = false; $("#globalLoaderText").textContent = s.ui.overlay || "Agent en cours…"; }
    else gl.hidden = true;

    try { renderSheet(s); } catch (e) { console.error("renderSheet", e); }
  }

  function snack(msg) {
    const sn = $("#snackbar"); sn.textContent = msg; sn.hidden = false;
    clearTimeout(sn._t); sn._t = setTimeout(() => sn.hidden = true, 2600);
  }

  function navigate(route) {
    Store.setRoute(route);
    Store.setState({ ui: { ...Store.state.ui, busy: false, overlay: null } });
    if (route === "hitl") Store.loadHITL();
    else if (route === "audit") Store.loadAudit();
    else if (route === "sources") Store.loadSources();
    else if (route === "cockpit") { Store.loadLast(); Store.loadHITL(); }
    render();
  }

  function bind() {
    // délégation clic carte -> sheet (sur document, survit à tous les re-render)
    document.addEventListener("click", (e) => {
      const card = e.target.closest(".fact-card");
      if (!card) return;
      const f = (Store.state.facts || []).find(x => x.fact_id === card.dataset.fact);
      if (f) { Store.openSheet({ type: "fact", fact: f }); renderSheet(Store.state); }
    });
    // nav (mobile + desktop rail)
    $$("[data-route]").forEach(n => n.onclick = () => navigate(n.dataset.route));
    // FAB
    const fab = $("#fab"), menu = $("#fabMenu");
    fab.onclick = () => { fab.classList.toggle("open"); menu.classList.toggle("open"); };
    $$(".fab-action", menu).forEach(a => a.onclick = () => {
      fab.classList.remove("open"); menu.classList.remove("open");
      if (a.dataset.act === "cycle") Store.startCycle();
      else if (a.dataset.act === "seed") Store.seed();
    });
    // sheet
    $("#sheetScrim").onclick = () => Store.closeSheet();
    // routeur (History API)
    window.addEventListener("popstate", (e) => { if (e.state && e.state.route) navigate(e.state.route); });
    // init
    const r = location.pathname.split("/")[1] || "cockpit";
    navigate(["cockpit", "facts", "hitl", "sources", "audit"].includes(r) ? r : "cockpit");
    Store.loadHealth();
  }

  return { render, snack, bind, navigate };
})();

document.addEventListener("DOMContentLoaded", () => {
  App.bind();
  Store.subscribe(() => App.render());
});
