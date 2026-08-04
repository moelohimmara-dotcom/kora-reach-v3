/* ============================================================
   KORA — App (vues, routing, tiroir HITL). Module ES.
   ============================================================ */
import { Store } from "./store.js";

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => root ? Array.from(root.querySelectorAll(sel)) : [];
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = (id, cls = "") => `<svg class="ic ${cls}"><use href="#${id}"/></svg>`;
function placeholderSvg(theme) {
  const pal = {
    dark:  ["#241C18", "#15110F", "#F2A98C"],
    cacao: ["#3A2418", "#241712", "#F2A98C"],
    light: ["#ECE7DF", "#F4F1EC", "#B5573A"],
  }[theme] || ["#241C18", "#15110F", "#F2A98C"];
  return "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="'+pal[0]+'"/><stop offset="1" stop-color="'+pal[1]+'"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><g fill="none" stroke="'+pal[2]+'" stroke-width="3" opacity=".7"><rect x="118" y="64" width="84" height="60" rx="10"/><circle cx="142" cy="86" r="9"/><path d="M124 118l24-26 18 18 14-12 20 22"/></g></svg>'
  );
}

function chip(label, kind = "", ic = "") {
  return `<span class="chip ${kind} ${ic ? "ic-only" : ""}">${ic ? icon(ic) : ""}${esc(label)}</span>`;
}
function factMeta(f) {
  const c = f.champion || {};
  const lvl = c.level || (c.guinee_filter ? 2 : 1);
  return [
    chip(lvl === 1 ? "Niveau 1 · Source guinéenne" : "Niveau 2 · International filtrée", lvl === 1 ? "primary" : "secondary", lvl === 1 ? "i-level1" : "i-level2"),
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

function viewCockpit(s) {
  const f = s.facts || [];
  const pending = f.filter(x => !(s.decisions[x.fact_id] === "REJECTED" || s.decisions[x.fact_id] === "TRANSMITTED")).length;
  const transmitted = f.filter(x => s.decisions[x.fact_id] === "TRANSMITTED" || s.decisions[x.fact_id] === "APPROVED").length;
  const rejected = f.filter(x => s.decisions[x.fact_id] === "REJECTED").length;
  const sourcesOk = (s.health && s.health.whitelist_sources_ok != null) ? s.health.whitelist_sources_ok : "—";
  const items = (s.lastCycle && s.lastCycle.result) ? (s.lastCycle.result.items || 0) : 0;
  return `
    <section class="pulse-card">
      <div class="pulse-top">
        <span class="pulse-eyebrow">Pouls de la rédaction</span>
        <span class="live-pill"><span class="dot dot-busy"></span>En direct · 24h</span>
      </div>
      <div class="pulse-num${pending ? "" : " alert"}">${pending}</div>
      <div class="pulse-sub">article(s) chaud(s) à valider dans la fenêtre 24h</div>
      <div class="pulse-pills">
        <span class="delta delta-warm">${pending} chauds</span>
        <span class="delta delta-good">${transmitted} transmis</span>
        <span class="delta delta-bad">${rejected} rejetés</span>
      </div>
    </section>

    <div class="section-head">
      <h2 class="section-title">Vue d'ensemble</h2>
      <span class="muted">${f.length} article(s) suivi(s)</span>
    </div>
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-head"><span class="stat-label">Sources OK</span><span class="delta delta-good">✓</span></div>
        <div class="n">${sourcesOk}</div>
        <div class="stat-foot">liste de sources autorisées</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-label">Éléments</span><span class="delta">cycle</span></div>
        <div class="n">${items}</div>
        <div class="stat-foot">collectés ce cycle</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-label">Articles</span><span class="delta delta-warm">${pending} chauds</span></div>
        <div class="n">${f.length}</div>
        <div class="stat-foot">en file de validation</div>
      </div>
      <div class="stat-card ${rejected ? "alert" : ""}">
        <div class="stat-head"><span class="stat-label">Rejetés International</span><span class="delta delta-bad">${rejected}</span></div>
        <div class="n">${rejected}</div>
        <div class="stat-foot">hors périmètre Guinée</div>
      </div>
    </div>

    <div class="section-head">
      <h2 class="section-title">Articles en attente de validation</h2>
      <button class="btn btn-tonal btn-sm" id="cockpitSeed">Générer démo</button>
    </div>
    ${(s.lastCycle && s.lastCycle.result && s.lastCycle.result.status === "empty_or_stale")
      ? staleBox(s)
      : (factGroup(s.facts || [], s, "PENDING_REVIEW", "En attente de validation", "i-check") || stateBox("i-check", "Aucun article en attente", "Lance un cycle ou génère une démo pour générer des articles à valider.", false, "Générer démo", () => Store.seed()))}`;
}

function hasImg(f) {
  const c = f.champion || {};
  const img = (f.image_meta && f.image_meta.image) || f.image || c.image || "";
  // Une image valide = URL http(s), pas le placeholder SVG data:
  return typeof img === "string" && img.startsWith("http");
}
function factCard(f, s, idx) {
  const c = f.champion || {};
  const dec = s.decisions[f.fact_id];
  const img = (f.image_meta && f.image_meta.image) || f.image || c.image || "";
  const status = dec || (f.status || "PENDING_REVIEW");
  const ph = placeholderSvg(Store.getTheme());
  const src = img ? esc(img) : ph;
  // fallback : si fact_id absent, on utilise l'index de la carte
  const fid = f.fact_id || ("idx" + idx);
  return `
    <article class="fact-card" data-fact="${esc(fid)}" data-index="${idx}" onclick="App.openFact('${esc(fid)}')">
      <img class="fact-img" src="${src}" alt="" loading="lazy" onerror="this.src='${ph}'">
      <div class="fact-body">
        <h3 class="fact-title">${esc(c.title)}</h3>
        <div class="fact-chips">${factMeta(f)}</div>
        <div class="fact-status">${statusBadge(status)} <span class="muted">${esc(c.source || "")}</span></div>
      </div>
    </article>`;
}
function factGroup(facts, s, status, label, iconName) {
  const list = facts.filter(f => {
    const d = s.decisions[f.fact_id];
    const st = d || f.status || "PENDING_REVIEW";
    if (status === "PENDING_REVIEW") return st === "PENDING_REVIEW";
    if (status === "TRANSMITTED") return st === "TRANSMITTED";
    if (status === "REJECTED") return st === "REJECTED";
    return false;
  }).filter(hasImg);  // Point 1 : ne garder que les cartes avec illustration
  if (!list.length) return "";
  return `<section class="fact-group">
    <div class="group-head">
      <span class="group-ic">${icon(iconName)}</span>
      <h3 class="group-title">${label}</h3>
      <span class="group-count">${list.length}</span>
    </div>
    <div class="fact-grid">${list.map(f => factCard(f, s, (s.facts || []).indexOf(f))).join("")}</div>
  </section>`;
}
function viewDrafts(s) {
  const facts = s.facts || [];
  const drafts = facts.filter(f => s.decisions[f.fact_id] === "EDITED" || (f._edited && !(s.decisions[f.fact_id] === "TRANSMITTED" || s.decisions[f.fact_id] === "REJECTED")));
  if (!drafts.length) return stateBox("i-edit", "Aucun brouillon", "Les faits que tu corriges avant validation apparaissent ici. Ouvre un fait depuis Faits ou Validation et clique « Modifier le texte ».", false);
  return `<div class="section-title">Brouillons (${drafts.length})</div>
    <p class="muted" style="margin-bottom:16px">Contenus en cours d'édition, non encore transmis. Clique une carte pour reprendre la correction.</p>
    ${factGroup(drafts, s, drafts[0] ? (s.decisions[drafts[0].fact_id] || drafts[0].status || "EDITED") : "EDITED", "En cours d'édition", "i-edit")}`;
}
function viewFacts(s) {
  const facts = s.facts || [];
  const counts = {
    all: facts.length,
    pending: facts.filter(f => { const d = s.decisions[f.fact_id]; return (d || f.status || "PENDING_REVIEW") === "PENDING_REVIEW"; }).length,
    transmitted: facts.filter(f => (s.decisions[f.fact_id] || f.status) === "TRANSMITTED").length,
    rejected: facts.filter(f => (s.decisions[f.fact_id] || f.status) === "REJECTED").length,
  };
  const f = Store.getFactFilter();
  if (!facts.length) return (s.lastCycle && s.lastCycle.result && s.lastCycle.result.status === "empty_or_stale") ? staleBox(s) : stateBox("i-check", "Aucun article à afficher", "Lance un cycle ou génère une démo pour générer des articles à valider.", false, "Générer démo", () => Store.seed());
  const filters = [
    ["all", "Tous", counts.all], ["pending", "En attente", counts.pending],
    ["transmitted", "Transmis", counts.transmitted], ["rejected", "Rejetés", counts.rejected],
  ];
  const filterBar = `<div class="filter-bar">${filters.map(([k, lab, n]) =>
    `<button class="filter-pill ${f === k ? "active" : ""}" data-fact-filter="${k}">${lab} <span class="pill-n">${n}</span></button>`).join("")}</div>`;
  let body;
  if (f === "all") {
    body = factGroup(facts, s, "PENDING_REVIEW", "En attente de validation", "i-check")
      + factGroup(facts, s, "TRANSMITTED", "Transmis à la rédaction", "i-send")
      + factGroup(facts, s, "REJECTED", "Rejetés", "i-close");
  } else if (f === "pending") body = factGroup(facts, s, "PENDING_REVIEW", "En attente de validation", "i-check");
  else if (f === "transmitted") body = factGroup(facts, s, "TRANSMITTED", "Transmis à la rédaction", "i-send");
  else if (f === "rejected") body = factGroup(facts, s, "REJECTED", "Rejetés", "i-close");
  return filterBar + body;
}
function viewHITL(s) {
  const facts = (s.facts || []).filter(f => !(s.decisions[f.fact_id] === "REJECTED" || s.decisions[f.fact_id] === "TRANSMITTED"));
  if (s.ui.loading) return stateBox("i-check", "Chargement de la file…", "Récupération des décisions de validation humaine.", true);
  if (s.ui.error) return stateBox("i-status", "Agent injoignable", s.ui.error + " — reprise automatique en cours.", false, "Réessayer", null, "error");
  if (!facts.length) return (s.lastCycle && s.lastCycle.result && s.lastCycle.result.status === "empty_or_stale") ? staleBox(s) : stateBox("i-check", "File de validation vide", "Aucun article en attente. Lance un cycle ou génère une démo pour générer des articles à valider.", false, "Générer démo", () => Store.seed());
  return `<div class="section-title">Validation humaine (${facts.length})</div>
    <p class="muted" style="margin-bottom:16px">Chaque article doit être validé avant transmission. Tu peux corriger le titre/corps, rejeter, ou transmettre.</p>
    <div class="fact-grid">${facts.map(f => factCard(f, s)).join("")}</div>`;
}
function viewSources(s) {
  const src = s.sources || [];
  if (!src.length) return stateBox("i-sources", "Sources en chargement…", "Récupération de la liste de sources autorisées.", !!s.ui.loading);
  const g1 = src.filter(e => e.category === "GN_NAT");
  const g2 = src.filter(e => e.category !== "GN_NAT");
  const srcRow = (e) => `
    <div class="list-row src-row">
      <span class="meta-ic">${icon(e.guinee_filter ? "i-shield" : "i-sources")}</span>
      <div class="meta">
        <div class="name">${esc(e.name)} ${e.guinee_filter ? chip("Filtre Guinée", "warning", "i-shield") : ""}</div>
        <div class="sub">${esc(e.category)} · ${esc(e.vector_primary)} · ${esc(e.entry_url)}</div>
      </div>
      ${chip(e.category === "GN_NAT" ? "Niveau 1" : "Niveau 2", e.category === "GN_NAT" ? "primary" : "secondary")}
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
    </section>`;
}
function viewSettings(s) {
  const theme = Store.getTheme();
  const roleLabel = { "chef_de_secteur": "Rédacteur en chef", "reporter": "Reporteur", "admin": "Administrateur" }[s.role || "chef_de_secteur"] || (s.role || "Rédacteur en chef");
  const themes = [
    ["dark", "Sombre", "i-moon", "Fond sombre (par défaut)"],
    ["light", "Clair", "i-sun", "Fond clair"],
    ["cacao", "Cacao", "i-palette", "Chocolat chaud"]
  ];
  const themeRow = ([k, label, icn, desc]) => `
    <button class="setting-row theme-opt ${theme === k ? "active" : ""}" data-theme-btn="${k}">
      <span class="meta-ic">${icon(icn)}</span>
      <div class="meta"><div class="name">${label}</div><div class="sub">${desc}</div></div>
      ${theme === k ? `<span class="check">${icon("i-check")}</span>` : ""}
    </button>`;
  return `<div class="section-title">Paramètres</div>
    <p class="muted" style="margin-bottom:16px">Réglages de l'interface et du compte KORA Reach.</p>

    <section class="fact-group">
      <div class="group-head"><span class="group-ic">${icon("i-palette")}</span><h3 class="group-title">Apparence</h3></div>
      ${themes.map(themeRow).join("")}
    </section>

    <section class="fact-group">
      <div class="group-head"><span class="group-ic">${icon("i-user")}</span><h3 class="group-title">Personnalisation</h3></div>
      <div class="setting-row">
        <span class="meta-ic">${icon("i-user")}</span>
        <div class="meta"><div class="name">Rôle</div><div class="sub">${esc(roleLabel)}</div></div>
      </div>
      <div class="setting-row">
        <span class="meta-ic">${icon("i-spark")}</span>
        <div class="meta"><div class="name">Agent</div><div class="sub">agent Reach — collecte, fusion, rédaction</div></div>
      </div>
      <div class="setting-row">
        <span class="meta-ic">${icon("i-sources")}</span>
        <div class="meta"><div class="name">Périmètre éditorial</div><div class="sub">Actualité Guinée · kakilambe.com</div></div>
      </div>
    </section>

    <section class="fact-group">
      <div class="group-head"><span class="group-ic">${icon("i-info")}</span><h3 class="group-title">À propos</h3></div>
      <div class="setting-row">
        <span class="meta-ic">${icon("i-spark")}</span>
        <div class="meta"><div class="name">KORA Reach</div><div class="sub">Poste de pilotage éditorial v3</div></div>
      </div>
    </section>`;
}
function viewAudit(s) {
  const a = s.audit || [];
  if (!a.length) return stateBox("i-audit", "Piste d'audit vide", "Les décisions validées apparaîtront ici (qui / quand / transition).", false);
  const dayLabel = (iso) => {
    const d = new Date((iso || "").replace(" ", "T"));
    if (isNaN(d)) return "Autres";
    const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
    const sd = d.toDateString();
    if (sd === today.toDateString()) return "Aujourd'hui";
    if (sd === y.toDateString()) return "Hier";
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  };
  const groups = {};
  a.slice(0, 60).forEach(ev => { const k = dayLabel(ev.at || ev.ts); (groups[k] = groups[k] || []).push(ev); });
  const transitionBadge = (ev) => {
    const t = ev.transition || (ev.detail && ev.detail.match(/(PENDING_REVIEW|APPROVED|EDITED|REJECTED|TRANSMITTED)\s*→\s*(APPROVED|EDITED|REJECTED|TRANSMITTED)/)) ;
    if (ev.transition) return `<span class="badge badge-pending">${esc(ev.transition.replace(/_/g, " "))}</span>`;
    return "";
  };
  const evRow = (ev) => `
    <div class="list-row audit-row">
      <span class="meta-ic">${icon(ev.kind === "reject" ? "i-reject" : ev.kind === "edit" ? "i-edit" : "i-check")}</span>
      <div class="meta">
        <div class="name">${esc(ev.action || ev.kind || "événement")} ${transitionBadge(ev)}</div>
        <div class="sub">${esc(ev.detail || "")}</div>
      </div>
      <div class="sub audit-time">${esc((ev.at || ev.ts || "").slice(0, 19).replace("T", " "))}</div>
    </div>`;
  return `<div class="section-title">Piste d'audit (${a.length})</div>
    ${Object.keys(groups).map(k => `
      <section class="fact-group">
        <div class="group-head"><span class="group-ic">${icon("i-date")}</span><h3 class="group-title">${esc(k)}</h3><span class="group-count">${groups[k].length}</span></div>
        ${groups[k].map(evRow).join("")}
      </section>`).join("")}`;
}
function staleBox(s) {
  const r = (s.lastCycle && s.lastCycle.result) || {};
  const msg = r.message || "Aucune publication dans la fenêtre 24h.";
  const n = r.stale_count || 0;
  return `<div class="state-box">
    <span class="state-ic"><svg class="ic"><use href="#i-info"/></svg></span>
    <h3>Aucune publication dans la fenêtre 24h</h3>
    <p>${esc(msg)}</p>
    <p class="muted" style="margin-top:8px">Les sources whitelist n'ont pas d'actualité récente confirmée. Le bouton ci-dessous génère quand même un article de synthèse à partir des ${n} dernier(s) item(s) collecté(s).</p>
    <button class="btn btn-primary" id="stateAction" data-force="1">Générer quand même</button>
  </div>`;
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

function renderSheet(s) {
  const sh = s.sheet;
  const body = document.getElementById("sheetBody");
  const sheet = document.getElementById("sheet");
  const scrim = document.getElementById("sheetScrim");
  if (!sh || !body || !sheet || !scrim) { sheet.hidden = true; scrim.hidden = true; return; }
  const f = sh.fact; const c = f.champion || {};
  const img = (f.image_meta && f.image_meta.image) || f.image || c.image || "";
  const ph = placeholderSvg(Store.getTheme());
  const text = (f.article && (f.article.final_text || f.article.body)) || f.final_text || c.summary || "";
  const status = f.status || "PENDING_REVIEW";
  // Séparation chapeau / corps : le chapeau = 1er paragraphe, le corps = RESTE (évite la duplication)
  // Split tolérant : doubles sauts (\n\n) sinon simples (\n)
  const _rawParas = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  let _paras = _rawParas;
  if (_paras.length <= 1 && text.includes("\n")) {
    _paras = text.split(/\n+/).map(p => p.trim()).filter(Boolean);
  }
  const _first = _paras[0] || "";
  const standfirst = (c.summary || "").slice(0, 220) || (_first ? _first.slice(0, 220) : text.slice(0, 200));
  const bodyText = _paras.length > 1 ? _paras.slice(1).join("\n\n") : (text.length > standfirst.length ? text.slice(standfirst.length).trim() : "");
  body.innerHTML = `
    <article class="sheet-article">
      ${img ? `<figure class="sheet-figure"><img class="sheet-img" src="${esc(img)}" alt="" onerror="this.src='${ph}'"><figcaption class="sheet-cap">Illustration IA — KORA Reach</figcaption></figure>` : `<figure class="sheet-figure"><img class="sheet-img" src="${ph}" alt=""><figcaption class="sheet-cap">Illustration IA — KORA Reach</figcaption></figure>`}
      <div class="sheet-head">
        ${icon("i-shield", "ic-l")}
        <div class="sheet-head-text">
          <div class="sheet-eyebrow">Validation humaine · KORA Reach</div>
          <h2 class="sheet-title">${esc(c.title)}</h2>
          <div class="sheet-meta-line">
            <span>${esc(c.source || "—")}</span>
            <span class="dot-sep">·</span>
            <span>${esc((f.champion && f.champion.level === 1) ? "Niveau 1 · Source guinéenne" : "Niveau 2 · International")}</span>
            <span class="dot-sep">·</span>
            <span>Fusion ${esc(f.n_sources || 1)} source(s)</span>
            ${f.forced_stale ? '<span class="tag tag-warn" style="margin-left:6px">Hors fenêtre 48h</span>' : ''}
          </div>
        </div>
        <button class="sheet-close" data-close="1" title="Fermer" aria-label="Fermer">${icon("i-close")}</button>
      </div>
      <p class="sheet-standfirst">${esc(standfirst)}</p>
      <div class="fact-chips" style="margin:6px 0 16px">${factMeta(f)} ${statusBadge(status)}</div>
      <div class="sheet-textwrap"><div class="sheet-text">${esc(bodyText || text)}</div></div>
      <div class="sheet-audit-note">${icon("i-audit")} Décision enregistrée dans l'historique · ${esc(f.n_sources || 1)} source(s) fusionnée(s)</div>
    </article>
    <div class="sheet-actions">
      <button class="btn btn-primary" data-decide="APPROVED">${icon("i-send")} Approuver &amp; transmettre</button>
      <div class="sheet-actions-row">
        <button class="btn btn-tonal" data-edit="1">${icon("i-edit")} Modifier</button>
        <button class="btn btn-danger-ghost" data-decide="REJECTED">${icon("i-reject")} Rejeter</button>
      </div>
      ${(status === "APPROVED" || status === "EDITED" || status === "TRANSMITTED") ? `<button class="btn btn-tonal btn-block" data-retract="1">${icon("i-undo")} Annuler la décision</button>` : ""}
    </div>`;
  sheet.hidden = false; scrim.hidden = false;

  const closeBtn = body.querySelector("[data-close]");
  if (closeBtn) closeBtn.onclick = () => Store.closeSheet();
  $$("[data-decide]", body).forEach(b => b.onclick = () => { Store.decide(f.fact_id, b.dataset.decide); Store.closeSheet(); });
  const rb = body.querySelector("[data-retract]");
  if (rb) rb.onclick = () => { Store.retract(f.fact_id); Store.closeSheet(); };
  const ed = body.querySelector("[data-edit]");
  if (ed) ed.onclick = () => {
    body.innerHTML = `
      <div class="sheet-head">
        ${icon("i-edit", "ic-l")}
        <div class="sheet-head-text">
          <div class="sheet-eyebrow">Correction avant validation</div>
          <h2 class="sheet-title">${esc(c.title)}</h2>
        </div>
        <button class="sheet-close" data-close="1" title="Fermer" aria-label="Fermer">${icon("i-close")}</button>
      </div>
      <p class="muted" style="margin:10px 0 12px">Corrige le titre et le corps avant validation. La version éditée remplace l'original.</p>
      <input id="edTitle" class="edit-input" value="${esc(c.title)}">
      <textarea id="edText" class="edit-area">${esc(text)}</textarea>
      <div class="sheet-actions">
        <button class="btn btn-primary btn-block" id="edSave">${icon("i-check")} Valider la correction</button>
        <button class="btn btn-tonal btn-block" id="edCancel">Annuler</button>
      </div>`;
    const close2 = body.querySelector("[data-close]");
    if (close2) close2.onclick = () => Store.closeSheet();
    const edSave = document.getElementById("edSave");
    if (edSave) edSave.onclick = () => {
      const t = document.getElementById("edTitle").value, x = document.getElementById("edText").value;
      f._edited = { title: t, text: x };
      Store.decide(f.fact_id, "EDITED", x);
      Store.closeSheet();
    };
    const edCancel = document.getElementById("edCancel");
    if (edCancel) edCancel.onclick = () => renderSheet(s);
  };
}

function render() {
  const s = Store.state;
  const agent = document.getElementById("agentStatus");
  if (agent) agent.innerHTML = s.ui.busy
    ? `<span class="dot dot-busy"></span><span>${s.ui.overlay || "Agent occupé…"}</span>`
    : `<span class="dot dot-ok"></span><span>${esc((s.health && s.health.editor) || "prêt")}</span>`;
  const view = document.getElementById("view");
  if (!view) return;
  const map = { cockpit: viewCockpit, facts: viewFacts, hitl: viewHITL, sources: viewSources, audit: viewAudit, drafts: viewDrafts, settings: viewSettings };
  view.innerHTML = (map[s.route] || viewCockpit)(s);
  $$(".navitem, .rail .navitem").forEach(n => n.classList.toggle("active", n.dataset.route === s.route));
  const curTheme = Store.getTheme();
  $$("[data-theme-btn]").forEach(n => n.classList.toggle("active", n.dataset.themeBtn === curTheme));
  const sa = document.getElementById("stateAction");
  if (sa) sa.onclick = () => { if (sa.dataset.force) Store.startCycle(3, true); else if (sa.textContent.trim() === "Réessayer") location.reload(); else Store.seed(); };
  const cs = document.getElementById("cockpitSeed");
  if (cs) cs.onclick = () => Store.seed();
  const gl = document.getElementById("globalLoader");
  if (gl) { if (s.ui.busy) { gl.hidden = false; const t = document.getElementById("globalLoaderText"); if (t) t.textContent = s.ui.overlay || "Agent en cours…"; } else gl.hidden = true; }
  try { renderSheet(s); } catch (e) { console.error("renderSheet", e); }
}
function snack(msg) {
  const sn = document.getElementById("snackbar");
  if (!sn) return;
  sn.textContent = msg; sn.hidden = false;
  clearTimeout(sn._t); sn._t = setTimeout(() => sn.hidden = true, 2600);
}
function navigate(route) {
  Store.setRoute(route);
  Store.setState({ ui: { ...Store.state.ui, busy: false, overlay: null } });
  if (route === "hitl") Store.loadHITL();
  else if (route === "facts") Store.loadHITL();
  else if (route === "audit") Store.loadAudit();
  else if (route === "sources") Store.loadSources();
  else if (route === "cockpit") { Store.loadLast(); Store.loadHITL(); }
  render();
}
function openFact(id) {
  const facts = Store.state.facts || [];
  let f = facts.find(x => x.fact_id === id);
  if (!f && (id || "").startsWith("idx")) {
    const i = parseInt(id.slice(3), 10);
    f = facts[i];
  }
  if (f) { Store.openSheet({ type: "fact", fact: f }); renderSheet(Store.state); }
}
function bind() {
  document.addEventListener("click", (e) => {
    const card = e.target.closest(".fact-card");
    if (!card) return;
    e.stopPropagation();
    const facts = Store.state.facts || [];
    let f = facts.find(x => x.fact_id === card.dataset.fact);
    if (!f && (card.dataset.fact || "").startsWith("idx")) {
      const i = parseInt(card.dataset.fact.slice(3), 10);
      f = facts[i];
    }
    if (!f && card.dataset.index) f = facts[parseInt(card.dataset.index, 10)];
    if (f) { Store.openSheet({ type: "fact", fact: f }); renderSheet(Store.state); }
  });
  $$("[data-fact-filter]").forEach(n => n.onclick = () => { Store.setFactFilter(n.dataset.factFilter); const sc = document.getElementById("railScrim"); if (sc) sc.hidden = true; });
  const railEl = document.getElementById("rail");
  $$("[data-route]").forEach(n => n.onclick = () => {
    if (railEl) railEl.classList.remove("open");
    const sc = document.getElementById("railScrim");
    if (sc) sc.hidden = true;
    navigate(n.dataset.route);
  });
  const tc = document.getElementById("topbarCycle");
  if (tc) tc.onclick = () => Store.startCycle();
  // Rail drawer : toggle collapse (desktop) + menu (mobile drawer)
  const rt = document.getElementById("railToggle");
  if (rt) rt.onclick = () => Store.setRail(Store.getRail() === "expanded" ? "collapsed" : "expanded");
  const tm = document.getElementById("topbarMenu");
  if (tm) tm.onclick = () => {
    const rail = document.getElementById("rail");
    if (rail) rail.classList.toggle("open");
    const sc = document.getElementById("railScrim");
    if (sc) sc.hidden = !rail.classList.contains("open");
  };
  // Sélecteur de thème — délégation (rail, bottomnav, et vue Paramètres rendue dynamiquement)
  document.addEventListener("click", (e) => {
    const tb = e.target.closest("[data-theme-btn]");
    if (tb) { Store.setTheme(tb.dataset.themeBtn); return; }
  });
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
    if (a.dataset.act === "cycle") Store.startCycle();
    else if (a.dataset.act === "seed") Store.seed();
  });
  const sc = $("#sheetScrim"); if (sc) sc.onclick = () => Store.closeSheet();
  // Clic-dehors (point 2) : clic dans N'IMPORTE QUEL périmètre HORS du conteneur interne ferme.
  // Capture phase pour s'exécuter avant les handlers de boutons ; on exclut tout clic DANS #sheet.
  document.addEventListener("click", (e) => {
    if (!Store.state.sheet) return;
    if (e.target.closest && e.target.closest("#sheet")) return; // clic dans le conteneur -> ne ferme pas
    Store.closeSheet();
  }, true);
  // Fermeture au clavier (Escape) en complément du clic-dehors
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && Store.state.sheet) Store.closeSheet(); });
  window.addEventListener("popstate", (e) => { if (e.state && e.state.route) navigate(e.state.route); });
  const r = location.pathname.split("/")[1] || "cockpit";
  navigate(["cockpit", "facts", "hitl", "sources", "audit", "drafts", "settings"].includes(r) ? r : "cockpit");
  Store.loadHealth();
}

export const App = { render, snack, bind, navigate, openFact };
