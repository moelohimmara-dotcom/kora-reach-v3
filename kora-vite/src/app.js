/* ============================================================
   KORA — App (vues, routing, tiroir HITL). Module ES.
   ============================================================ */
import { Store } from "./store.js";

import { marked } from "marked";
import DOMPurify from "dompurify";

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => root ? Array.from(root.querySelectorAll(sel)) : [];
const esc = (s) => String(s == null ? "" : s).replace(/[&<>`"'$]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "`": "&#96;", '"': "&quot;", "'": "&#39;", "$": "&#36;" }[c]));
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
// Mapping des anciennes icônes (i-*) vers Google Material Icons (auto-hébergé via @fontsource)
const MATERIAL = {
  "i-dashboard": "dashboard", "i-facts": "article", "i-hitl": "fact_check", "i-audit": "history",
  "i-sources": "source", "i-settings": "settings", "i-trash": "delete", "i-drafts": "draft",
  "i-level1": "flag", "i-level2": "public", "i-fusion": "hub", "i-date": "event", "i-shield": "verified_user",
  "i-check": "check", "i-close": "close", "i-send": "send", "i-edit": "edit", "i-reject": "block",
  "i-undo": "undo", "i-chevron": "chevron_left", "i-chevron-right": "chevron_right", "i-lock": "lock",
  "i-eye": "visibility", "i-eye-off": "visibility_off", "i-user": "person", "i-user-plus": "person_add",
  "i-users": "group", "i-palette": "palette", "i-brush": "brush", "i-logo": "image",
  "i-spark": "auto_awesome", "i-moon": "dark_mode", "i-sun": "light_mode", "i-info": "info",
  "i-refresh": "refresh", "i-image": "image", "i-menu": "menu", "i-status": "pending",
  "i-star": "star", "i-send-alt": "send", "i-download": "download", "i-upload": "upload",
  "i-search": "search", "i-filter": "filter_list", "i-more": "more_vert", "i-add": "add",
  "i-delete": "delete", "i-warning": "warning", "i-error": "error", "i-help": "help",
  "i-grid": "grid_view", "i-list": "list", "i-doc": "description",
};
const icon = (id, cls = "") => `<span class="material-icons ${cls}">${MATERIAL[id] || id.replace(/^i-/, "")}</span>`;
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
  // kind = primary|secondary|tertiary|warning|error → classe MD3 .chip-<kind>
  const k = kind ? (kind.startsWith("chip-") ? kind : "chip-" + kind) : "";
  return `<span class="chip ${k}">${ic ? icon(ic) : ""}${esc(label)}</span>`;
}
function factMeta(f, status, compact) {
  const c = f.champion || {};
  const lvl = c.level || (c.guinee_filter ? 2 : 1);
  const st = status || f.status || "PENDING_REVIEW";
  const stMap = { PENDING_REVIEW: "En attente", APPROVED: "Approuvé", REJECTED: "Rejeté", TRANSMITTED: "Transmis", EDITED: "Édité" };
  const stLabel = stMap[st] || st || "En attente";
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
  // en mode carte, le statut est déjà affiché dans la ligne .fact-status (pas de doublon)
  if (!compact) items.push(`<span class="badge badge-pending">${esc(stLabel)}</span>`);
  return items.join("");
}
function statusBadge(st) {
  const map = {
    PENDING_REVIEW: ["badge-pending", "En attente"],
    APPROVED: ["badge-approved", "Approuvé"],
    REJECTED: ["badge-rejected", "Rejeté"],
    TRANSMITTED: ["badge-transmitted", "Transmis"],
    EDITED: ["badge-pending", "Édité"],
    TRASHED: ["badge-rejected", "Corbeille"],
  };
  const [k, t] = map[st] || ["badge-pending", st || "—"];
  return `<span class="badge ${k}">${t}</span>`;
}

function viewCockpit(s) {
  const facts = s.facts || [];
  const total = facts.length;
  const approved = facts.filter(f => (s.decisions[f.fact_id] || f.status) === "APPROVED").length;
  const pending = facts.filter(f => (s.decisions[f.fact_id] || f.status || "PENDING_REVIEW") === "PENDING_REVIEW").length;
  const draft = facts.filter(f => (s.decisions[f.fact_id] || f.status || "PENDING_REVIEW") === "EDITED").length;
  const health = s.health;
  const audit = s.audit;
  const sources = s.sources || [];
  const lastCycle = s.lastCycle;

  return `
    <div class="cockpit">
      <div class="cockpit-header">
        <div>
          <h1 class="cockpit-title">Tableau de bord</h1>
          <p class="cockpit-sub">Supervision de l'agent Kora</p>
        </div>
        <div class="cockpit-header-actions">
          <button class="btn btn-tonal btn-sm" id="btnRefresh" aria-label="Rafraîchir" data-action="refresh">
            <span class="material-icons" style="font-size:18px;vertical-align:middle">refresh</span>
          </button>
          <span class="last-refresh" id="lastRefresh">${s.ui?.lastRefresh ? new Date(s.ui.lastRefresh).toLocaleTimeString("fr-FR") : "—"}</span>
        </div>
      </div>

      <!-- ROW 1 : 4 StatCards cliquables -->
      <div class="cockpit-grid stats-row">
        ${statCard({ icon: "article", value: total, label: "Articles", variant: "primary", onClick: "nav-facts-all" })}
        ${statCard({ icon: "fact_check", value: approved, label: "Validés", variant: "success", onClick: "nav-facts-approved" })}
        ${statCard({ icon: "schedule", value: pending, label: "En attente", variant: "warning", onClick: "nav-hitl" })}
        ${statCard({ icon: "edit", value: draft, label: "Brouillons", variant: "info", onClick: "nav-drafts" })}
      </div>

      <!-- ROW 2 : System Health + Sources + Cycle Control -->
      <div class="cockpit-grid system-row">
        <section class="system-section">
          <h2 class="section-title">Santé système</h2>
          ${systemHealthPill(health)}
        </section>
        <section class="system-section sources-section">
          <h2 class="section-title">Sources</h2>
          <div class="source-chips">
            ${sources.length ? sources.map(src => sourceStatusChip(src)).join("") : '<span class="source-chip empty">Aucune source</span>'}
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

// ============================================================
// COCKPIT COMPONENTS — Dynamiques, cliquables, temps réel
// ============================================================

function statCard({ icon, value, label, variant = "primary", onClick, trend, loading = false, error = false }) {
  const cls = `stat-card stat-${variant}${loading ? " loading" : ""}${error ? " error" : ""}`;
  const trendHtml = trend ? `<span class="stat-trend ${trend > 0 ? "up" : trend < 0 ? "down" : ""}">${trend > 0 ? "↑" : trend < 0 ? "↓" : "→"}${Math.abs(trend)}</span>` : "";
  const clickAttr = onClick ? `data-action="${onClick}"` : "";
  return `
    <div class="${cls}" ${clickAttr} tabindex="0" role="button" aria-label="${label}: ${value}${trend ? ` (${trend > 0 ? "+" : ""}${trend})` : ""}">
      <span class="material-icons stat-icon">${icon}</span>
      <div class="stat-value">${loading ? '<span class="skeleton"></span>' : value}</div>
      <div class="stat-label">${label}${trendHtml}</div>
      ${error ? '<span class="material-icons stat-error">error</span>' : ""}
    </div>`;
}

function systemHealthPill(health) {
  if (!health) return `<div class="health-pill loading"><span class="skeleton"></span></div>`;
  const mutex = health.mutex ? "🔴 Occupé" : "🟢 Libre";
  const mutexCls = health.mutex ? "busy" : "free";
  const llm = health.llm_circuit || {};
  const llmStatus = llm.failures > 0 || (llm.open_until && llm.open_until > Date.now() / 1000) ? "🟡 Dégradé" : "🟢 OK";
  const llmCls = (llm.failures > 0 || (llm.open_until && llm.open_until > Date.now() / 1000)) ? "degraded" : "ok";
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

  const ACTION_FR = {
    GENERE: "Générés", TRANSMIS: "Transmis", APPROUVE: "Approuvés", REJETE: "Rejetés",
    MODIFIE: "Modifiés", SUPPRIME: "Supprimés", CYCLE: "Cycles", PURGE: "Purges"
  };

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
  let d = ev.detail || "";
  if (!d) return "";
  if (/error|traceback|exception|attributeerror|keyerror|typeerror/i.test(d)) return "Erreur d'exécution (voir logs)";
  const pairs = {};
  (d.match(/(\w+)=([^\s]+)/g) || []).forEach(p => { const [k,v]=p.split("="); pairs[k]=v; });
  const statusFr = { TRANSMITTED: "Transmis", APPROVED: "Approuvé", REJECTED: "Rejeté", EDITED: "Modifié", PENDING_REVIEW: "En attente" };
  const parts = [];
  if (pairs.src) parts.push("source : " + pairs.src);
  const st = pairs.status || pairs.decision;
  if (st) parts.push("statut : " + (statusFr[st.toUpperCase()] || st));
  if (pairs.facts) parts.push(pairs.facts + " fait(s)");
  if (pairs.clusters) parts.push(pairs.clusters + " groupe(s)");
  if (parts.length) return parts.join(" · ");
  const clean = d.replace(/\s+/g, " ").trim();
  return clean.length > 90 ? clean.slice(0, 87).replace(/\s+\S*$/, "") + "…" : clean;
}

function cycleControl(lastCycle) {
  const running = lastCycle?.running || false;
  const lastResult = lastCycle?.result;
  const lastTs = lastCycle?.ts ? new Date(lastCycle.ts).toLocaleTimeString("fr-FR") : "—";
  const lastStatus = lastResult?.status || "—";
  const lastCount = lastResult?.facts?.length || 0;
  return `
    <div class="cycle-control">
      <div class="cycle-status">
        <span class="cycle-indicator ${running ? "running" : "idle"}"></span>
        <span class="cycle-text">${running ? "Cycle en cours…" : `Dernier: ${lastTs} · ${lastStatus} (${lastCount} faits)`}</span>
      </div>
      <div class="cycle-actions">
        <button class="btn btn-primary" id="btnCycleNormal" ${running ? "disabled" : ""} data-action="cycle-normal">
          <span class="material-icons" style="font-size:18px;vertical-align:middle;margin-right:6px">play_arrow</span>Lancer cycle
        </button>
        <button class="btn btn-tonal" id="btnCycleForce" ${running ? "disabled" : ""} data-action="cycle-force">
          <span class="material-icons" style="font-size:18px;vertical-align:middle;margin-right:6px">flash_on</span>Forcer (hors 24h)
        </button>
      </div>
    </div>`;
}

function imgSrc(f) {
  const c = f.champion || {};
  const base = (f.image_meta && f.image_meta.image) || f.image || c.image || "";
  if (base && base.startsWith("http")) return base;
  const seed = (f.fact_id || f.id || f.title || "kora").split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) % 100000;
  return `https://picsum.photos/seed/${seed}/800/450`;
}
function hasImg(f) {
  const c = f.champion || {};
  const img = imgSrc(f);
  // Une image valide = URL http(s), pas le placeholder SVG data:
  return typeof img === "string" && img.startsWith("http");
}
function factCard(f, s, idx) {
  const c = f.champion || {};
  const dec = s.decisions[f.fact_id];
  const img = imgSrc(f);
  const status = dec || (f.status || "PENDING_REVIEW");
  const ph = placeholderSvg(Store.getTheme());
  const src = img ? esc(img) : ph;
  // fallback : si fact_id absent, on utilise l'index de la carte
  const fid = f.fact_id || ("idx" + idx);
  const sel = s.selectMode && s.selection[fid];
  const check = s.selectMode
    ? `<div class="fact-check ${sel ? "on" : ""}" data-check="${esc(fid)}">${sel ? icon("i-check") : ""}</div>`
    : "";
  const click = s.selectMode ? `onclick="Store.toggleSelect('${esc(fid)}')"` : `onclick="App.openFact('${esc(fid)}')"`;
  return `
    <article class="fact-card ${s.selectMode ? "selectable" : ""} ${sel ? "selected" : ""}" data-fact="${esc(fid)}" data-index="${idx}" ${click}>
      ${check}
      <img class="fact-img" src="${src}" alt="" loading="lazy" onerror="this.src='${ph}'">
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
function viewDrafts(s) {
  const facts = s.facts || [];
  // Un brouillon = décision EDITED (statut réel dans s.decisions, alimenté par loadHITL).
  // On n'utilise PAS factGroup (qui filtre les cartes sans image) -> un brouillon
  // sans image valide doit quand même s'afficher ici.
  const drafts = facts.filter(f => {
    const st = s.decisions[f.fact_id] || f.status || "PENDING_REVIEW";
    return st === "EDITED";
  });
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
function viewFacts(s) {
  const facts = s.facts || [];
  const counts = {
    all: facts.length,
    pending: facts.filter(f => { const d = s.decisions[f.fact_id]; return (d || f.status || "PENDING_REVIEW") === "PENDING_REVIEW"; }).length,
    transmitted: facts.filter(f => (s.decisions[f.fact_id] || f.status) === "TRANSMITTED").length,
    rejected: facts.filter(f => (s.decisions[f.fact_id] || f.status) === "REJECTED").length,
    drafts: facts.filter(f => (s.decisions[f.fact_id] || f.status) === "EDITED").length,
  };
  const f = Store.getFactFilter();
  if (!facts.length) return (s.lastCycle && s.lastCycle.result && s.lastCycle.result.status === "empty_or_stale") ? staleBox(s) : stateBox("i-check", "Aucun article à afficher", "Lance un cycle ou génère une démo pour générer des articles à valider.", false, "Générer démo", () => Store.seed());
  const filters = [
    ["all", "Tous", counts.all], ["pending", "En attente", counts.pending],
    ["transmitted", "Transmis", counts.transmitted], ["rejected", "Rejetés", counts.rejected],
    ["drafts", "Brouillons", counts.drafts],
  ];
  const filterBar = `<div class="filter-bar">${filters.map(([k, lab, n]) =>
    `<button class="filter-pill ${f === k ? "active" : ""}" data-fact-filter="${k}">${lab} <span class="pill-n">${n}</span></button>`).join("")}</div>
    <div class="toolbar-row">
      <button class="btn btn-tonal" id="enterSelect">${s.selectMode ? "Annuler la sélection" : "Sélectionner"}</button>
    </div>`;
  let body;
  if (f === "all") {
    body = factGroup(facts, s, "PENDING_REVIEW", "En attente de validation", "i-check", s.selectMode)
      + factGroup(facts, s, "TRANSMITTED", "Transmis à la rédaction", "i-send", s.selectMode)
      + factGroup(facts, s, "REJECTED", "Rejetés", "i-close", s.selectMode)
      + factGroup(facts, s, "EDITED", "Brouillons", "i-edit", s.selectMode);
  } else if (f === "pending") body = factGroup(facts, s, "PENDING_REVIEW", "En attente de validation", "i-check", s.selectMode);
  else if (f === "drafts") body = factGroup(facts, s, "EDITED", "Brouillons", "i-edit", s.selectMode);
  return filterBar + body;
}
function trashCard(f, s) {
  const c = f.champion || {};
  const img = imgSrc(f);
  const ph = placeholderSvg(Store.getTheme());
  const src = img ? esc(img) : ph;
  const trashed = f.trashed_at ? new Date(f.trashed_at).toLocaleString("fr-FR") : "";
  return `<article class="fact-card trash-card" data-fact="${esc(f.fact_id)}">
    <img class="fact-img" src="${src}" alt="" loading="lazy" onerror="this.src='${ph}'">
    <div class="fact-body">
      <div class="trash-flag">${icon("i-trash")} Corbeille</div>
      <h3 class="fact-title">${esc(c.title || "(sans titre)")}</h3>
      <div class="fact-chips">${chip(c.source || "Source", "secondary", "i-source")}${chip(trashed || "Date inconnue", "tertiary", "i-date")}</div>
      <div class="fact-status">${statusBadge("TRASHED")} <span class="muted">${esc(c.source || "")}</span></div>
      <div class="trash-actions">
        <button class="btn btn-tonal btn-sm" data-restore="${esc(f.fact_id)}">${icon("i-undo")} Restaurer</button>
        <button class="btn btn-danger btn-sm" data-del="${esc(f.fact_id)}">${icon("i-trash")} Supprimer</button>
      </div>
    </div>
  </article>`;
}
function viewTrash(s) {
  const items = s.trash || [];
  if (!items.length) return stateBox("i-trash", "Corbeille vide", "Les articles supprimés restent ici 11 jours, puis sont purgés automatiquement. Restaure-les ou supprime-les définitivement.", false);
  return `<div class="section-title">Corbeille (${items.length})</div>
    <p class="muted" style="margin-bottom:16px">Restauration possible pendant 11 jours. Au-delà, suppression définitive automatique.</p>
    <div class="fact-grid">${items.map(f => trashCard(f, s)).join("")}</div>`;
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
  const isAdvanced = (s.auth && s.auth.role === "advanced");
  const isAdmin = (s.auth && (s.auth.role === "admin" || s.auth.role === "advanced"));
  const themes = [
    ["dark", "Sombre", "i-moon", "Fond sombre (par défaut)"],
    ["light", "Clair", "i-sun", "Fond clair"],
    ["cacao", "Cacao", "i-palette", "Chocolat chaud"]
  ];
  // Rail de catégories (type Supabase) : Généraux (tous) / Avancés (role advanced)
  const generalItems = [
    { id: "appearance", ic: "i-palette", title: "Apparence", sub: "Thème de l'interface" },
    { id: "account", ic: "i-user", title: "Compte", sub: "Mot de passe, session" },
  ];
  const advancedItems = isAdvanced ? [
    { id: "personalization", ic: "i-brush", title: "Personnalisation", sub: "Nom, logo, couleurs, libellés" },
    { id: "accounts", ic: "i-users", title: "Comptes & habilitations", sub: "Utilisateurs et rôles" },
  ] : [];
  const adminItems = isAdmin ? [
    { id: "auditlog", ic: "i-shield", title: "Journal d'audit", sub: "Connexions, mots de passe, paramètres" },
  ] : [];
  const railItem = (it, active) => `<button class="settings-nav-item ${active ? "active" : ""}" data-setnav="${it.id}">
      <span class="meta-ic">${icon(it.ic)}</span>
      <div class="meta"><div class="name">${esc(it.title)}</div><div class="sub">${esc(it.sub)}</div></div>
      <span class="chev">${icon("i-chevron-right")}</span>
    </button>`;
  return `<div class="section-title">Paramètres ${isAdvanced ? `<span class="role-badge role-advanced">Avancé</span>` : ""}</div>
    <p class="muted" style="margin-bottom:16px">Réglages de l'interface, du compte et du projet ${esc(s.app_name || "KORA Agent")}.</p>
    <div class="settings-layout">
      <nav class="settings-rail" role="navigation" aria-label="Catégories de paramètres">
        <div class="settings-rail-group">Généraux</div>
        ${generalItems.map(it => railItem(it, it.id === "appearance")).join("")}
        ${advancedItems.length ? `<div class="settings-rail-group">Avancés</div>${advancedItems.map(it => railItem(it, false)).join("")}` : ""}
        ${adminItems.length ? `<div class="settings-rail-group">Administrateur</div>${adminItems.map(it => railItem(it, false)).join("")}` : ""}
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
          <div class="field"><input class="text-input" id="setAppName" type="text" maxlength="40" value="${esc(s.settings?.app_name || "KORA Agent")}" placeholder="KORA Agent"></div>
        </div>
        <div class="setting-card">
          <div class="setting-card-head"><span class="meta-ic">${icon("i-logo")}</span><div class="meta"><div class="name">Logo</div><div class="sub">Image carrée (SVG/PNG, ≤ 256 Ko). Laisse vide pour l'icône par défaut.</div></div></div>
          <div class="logo-edit">
            <div class="logo-preview" id="setLogoPreview">${s.settings?.has_logo ? `<img src="${esc(s.settings.logo_data)}" alt="">` : icon("i-spark")}</div>
            <div class="logo-actions">
              <label class="btn btn-ghost btn-sm"><input type="file" id="setLogoFile" accept="image/*" hidden>Choisir un fichier</label>
              <button class="btn btn-ghost btn-sm" id="setLogoClear" ${s.settings?.has_logo ? "" : "disabled"}>Retirer</button>
            </div>
          </div>
        </div>
        <div class="setting-card">
          <div class="setting-card-head"><span class="meta-ic">${icon("i-palette")}</span><div class="meta"><div class="name">Couleurs d'accent</div><div class="sub">Coral (principal) et Bordeaux (secondaire). Aperçu en direct.</div></div></div>
          <div class="color-edit">
            <label class="color-field">Coral <input type="color" id="setCoral" value="${esc(s.settings?.accent_coral || "#F2A98C")}"></label>
            <label class="color-field">Bordeaux <input type="color" id="setBordeaux" value="${esc(s.settings?.accent_bordeaux || "#E08A84")}"></label>
            <span class="color-swatch" id="setSwatch" style="background:linear-gradient(135deg, ${esc(s.settings?.accent_coral || "#F2A98C")}, ${esc(s.settings?.accent_bordeaux || "#E08A84")})"></span>
          </div>
        </div>
        <div class="setting-card">
          <div class="setting-card-head"><span class="meta-ic">${icon("i-edit")}</span><div class="meta"><div class="name">Libellés de l'interface</div><div class="sub">Personnalise le nom des onglets et le sous-titre (white-label).</div></div></div>
          <div class="field-row">
            <div class="field"><span>Tableau</span><input class="text-input" id="setLblCockpit" type="text" maxlength="30" value="${esc(s.settings?.label_cockpit || "Tableau")}"></div>
            <div class="field"><span>Articles</span><input class="text-input" id="setLblFacts" type="text" maxlength="30" value="${esc(s.settings?.label_facts || "Articles")}"></div>
            <div class="field"><span>Sources</span><input class="text-input" id="setLblSources" type="text" maxlength="30" value="${esc(s.settings?.label_sources || "Sources")}"></div>
            <div class="field"><span>Brouillons</span><input class="text-input" id="setLblDrafts" type="text" maxlength="30" value="${esc(s.settings?.label_drafts || "Brouillons")}"></div>
            <div class="field"><span>Historique</span><input class="text-input" id="setLblAudit" type="text" maxlength="30" value="${esc(s.settings?.label_audit || "Historique")}"></div>
            <div class="field" style="grid-column:1/-1"><span>Sous-titre (À propos)</span><input class="text-input" id="setTagline" type="text" maxlength="30" value="${esc(s.settings?.app_tagline || "Poste de pilotage de l'agent éditorial")}"></div>
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
          <div class="setting-card-head"><span class="meta-ic">${icon("i-users")}</span><div class="meta"><div class="name">Comptes existants</div><div class="sub">${(s.users || []).length} compte(s)</div></div></div>
          <div class="user-list" id="userList">
            ${(s.users || []).map(u => `<div class="user-row" data-id="${esc(u.id)}">
              <div class="meta"><div class="name">${esc(u.username)}</div><div class="sub">${esc(u.email || "—")}</div></div>
              <div class="role-edit">
                <select class="text-input role-select" data-id="${esc(u.id)}">
                  <option value="normal" ${(u.role || "normal") === "normal" ? "selected" : ""}>Normal</option>
                  <option value="advanced" ${(u.role || "normal") === "advanced" ? "selected" : ""}>Avancé</option>
                </select>
                <button class="btn btn-ghost btn-sm user-del" data-id="${esc(u.id)}">Retirer</button>
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
function viewAudit(s) {
  const data = s.audit || {};
  const days = data.days || [];
  const total = data.total || 0;
  if (!days.length) return stateBox("i-audit", "Historique vide", "Aucune activité enregistrée pour l'instant. Lance un cycle pour peupler l'historique.", false);
  const ACTION_FR = { GENERE: "Générés", TRANSMIS: "Transmis", APPROUVE: "Approuvés", REJETE: "Rejetés", MODIFIE: "Modifiés", SUPPRIME: "Supprimés", CORBEILLE: "Corbeille", CYCLE: "Cycles", PURGE: "Purges", ADMIN: "Admin", AUTRE: "Autres" };
  const ACTION_CLS = { GENERE: "primary", TRANSMIS: "tertiary", APPROUVE: "tertiary", REJETE: "error", MODIFIE: "warning", SUPPRIME: "error", CORBEILLE: "error", CYCLE: "secondary", PURGE: "secondary", ADMIN: "secondary", AUTRE: "secondary" };
  const transitionBadge = (ev) => {
    const t = ev.transition || (ev.detail && ev.detail.match(/(PENDING_REVIEW|APPROVED|EDITED|REJECTED|TRANSMITTED)\s*→\s*(APPROVED|EDITED|REJECTED|TRANSMITTED)/));
    if (ev.transition) return `<span class="badge badge-pending">${esc(ev.transition.replace(/_/g, " "))}</span>`;
    return "";
  };
  // Libellé métier lisible (anti-surcharge) au lieu de 'événement'
  const auditLabel = (ev) => {
    const blob = ((ev.transition || "") + " " + (ev.detail || "") + " " + (ev.action || "")).toUpperCase();
    if (blob.includes("TRANSMITTED")) return "Article transmis";
    if (blob.includes("REJECTED")) return "Article rejeté";
    if (blob.includes("APPROVED")) return "Article approuvé";
    if (blob.includes("EDITED") || blob.includes("EDIT ")) return "Article modifié";
    if (blob.includes("CYCLE") || blob.includes("MODE=") || blob.includes("PROVIDER=")) return "Cycle lancé";
    if (blob.includes("PURGE")) return "Historique purgé";
    if (blob.includes("SOURCE") || blob.includes("SRC=")) return "Source consultée";
    const k = (ev.kind || "").toLowerCase();
    if (k === "reject") return "Article rejeté";
    if (k === "edit") return "Article modifié";
    if (k === "approve" || k === "transmit") return "Article transmis";
    if (k === "cycle" || k === "run") return "Cycle lancé";
    if (k === "source") return "Source mise à jour";
    return ev.action || "Activité";
  };
  // Nettoie le detail en affichage lisible, masque les erreurs techniques
  const auditSub = (ev) => {
    let d = ev.detail || "";
    if (!d) return "";
    if (/error|traceback|exception|attributeerror|keyerror|typeerror/i.test(d)) return "Erreur d'exécution (voir logs)";
    const pairs = {};
    (d.match(/(\w+)=([^\s]+)/g) || []).forEach(p => { const [k,v]=p.split("="); pairs[k]=v; });
    const statusFr = { TRANSMITTED: "Transmis", APPROVED: "Approuvé", REJECTED: "Rejeté", EDITED: "Modifié", PENDING_REVIEW: "En attente" };
    const parts = [];
    if (pairs.src) parts.push("source : " + pairs.src);
    const st = pairs.status || pairs.decision;
    if (st) parts.push("statut : " + (statusFr[st.toUpperCase()] || st));
    if (pairs.facts) parts.push(pairs.facts + " fait(s)");
    if (pairs.clusters) parts.push(pairs.clusters + " groupe(s)");
    if (ev.editor) parts.push("par " + ev.editor);
    if (parts.length) return parts.join(" · ");
    const clean = d.replace(/\s+/g, " ").trim();
    return clean.length > 90 ? clean.slice(0, 87).replace(/\s+\S*$/, "") + "…" : clean;
  };
  // Heure lisible (HH:MM) depuis le ts ISO
  const auditTime = (ev) => {
    const t = (ev.ts || "").replace("T", " ").slice(0, 16);
    return t.slice(11) || t;
  };
  const filt = s.auditFilter || { type: "all", q: "" };
  const matchEv = (ev) => {
    if (filt.type && filt.type !== "all") {
      const a = (ev.action || "").toUpperCase();
      if (filt.type === "corbeille" && a !== "SUPPRIME" && a !== "CORBEILLE") return false;
      if (filt.type !== "corbeille" && a !== filt.type.toUpperCase()) return false;
    }
    if (filt.q) {
      const blob = ((ev.transition||"")+" "+(ev.detail||"")+" "+(ev.action||"")+" "+(ev.editor||"")+" "+(ev.event||"")).toLowerCase();
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
        <div class="sub">${esc(auditSub(ev))}</div>
      </div>
      <div class="sub audit-time">${esc(auditTime(ev))}</div>
    </div>`;
  const counterChips = (counters) => Object.keys(ACTION_FR).filter(a => (counters[a]||0) > 0)
    .map(a => `<span class="chip chip-${ACTION_CLS[a]}">${ACTION_FR[a]} : ${counters[a]}</span>`).join("");
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
        <button class="chip-filter ${filt.type==='all'?'active':''}" data-type="all">Tous</button>
        <button class="chip-filter ${filt.type==='transmis'?'active':''}" data-type="transmis">Transmis</button>
        <button class="chip-filter ${filt.type==='rejete'?'active':''}" data-type="rejete">Rejetés</button>
        <button class="chip-filter ${filt.type==='modifie'?'active':''}" data-type="modifie">Modifiés</button>
        <button class="chip-filter ${filt.type==='genere'?'active':''}" data-type="genere">Générés</button>
        <button class="chip-filter ${filt.type==='cycle'?'active':''}" data-type="cycle">Cycles</button>
        <button class="chip-filter ${filt.type==='corbeille'?'active':''}" data-type="corbeille">Corbeille</button>
      </div>
      <input class="text-input audit-search" id="auditSearch" type="search" placeholder="Rechercher (libellé, détail, éditeur)…" value="${esc(filt.q||'')}">
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
    <div class=\"audit-floatbar\" id=\"auditFloatbar\">
      <span class=\"fb-count\" id=\"auditFbCount\">0 sélectionné(s)</span>
      <span class=\"fb-spacer\"></span>
      <button class=\"btn btn-ghost btn-sm\" id=\"auditFbAll\">Tout</button>
      <button class=\"btn btn-ghost btn-sm\" id=\"auditFbNone\">Aucun</button>
      <button class=\"btn btn-danger btn-sm\" id=\"auditFbDel\" disabled>Supprimer</button>
    </div>
    ${days.map(dayBlock).join("")}`;
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
  const img = imgSrc(f);
  const ph = placeholderSvg(Store.getTheme());
  const text = (typeof f.article === "string" ? f.article
    : (f.article && (f.article.final_text || f.article.body)))
    || f.final_text || c.summary || "";
  const status = f.status || "PENDING_REVIEW";
  // Séparation chapeau / corps : le chapeau = 1er paragraphe, le corps = RESTE (évite la duplication)
  // Nettoyage : on retire le "# Titre" markdown (déjà affiché séparément) du corps
  let _clean = text.replace(/^#\s.*\n+/, "");
  const _rawParas = _clean.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  let _paras = _rawParas;
  if (_paras.length <= 1 && _clean.includes("\n")) {
    _paras = _clean.split(/\n+/).map(p => p.trim()).filter(Boolean);
  }
  const _first = _paras[0] || _clean;
  // Chapô = 1er paragraphe COMPLET (ouverture de l'article), pas tronqué arbitrairement
  const standfirst = _first;
  // Corps = tout l'article MOINS le 1er paragraphe (le chapô) -> pas de doublon, pas de coupure
  let bodyText = _clean.startsWith(_first)
    ? _clean.slice(_first.length).trim()
    : _clean;
  // Retire la section "## Le fait en bref" du corps (le chapeau joue déjà ce rôle -> évite la redondance)
  bodyText = bodyText.replace(/^##\s*Le fait en bref\b[\s\S]*?(?=##\s*Décryptage)/i, "").trim();
  body.innerHTML = `
    <article class="sheet-article">
      ${img ? `<figure class="sheet-figure"><img class="sheet-img" src="${esc(img)}" alt="" onerror="this.src='${ph}'"><figcaption class="sheet-cap">Illustration IA — KORA Agent</figcaption></figure>` : `<figure class="sheet-figure"><img class="sheet-img" src="${ph}" alt=""><figcaption class="sheet-cap">Illustration IA — KORA Agent</figcaption></figure>`}
      <div class="sheet-head">
        ${icon("i-shield", "ic-l")}
        <div class="sheet-head-text">
          <div class="sheet-eyebrow">Validation humaine · KORA Agent</div>
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
      <p class="sheet-standfirst">${mdToHtmlInline(standfirst)}</p>
      <div class="fact-chips" style="margin:6px 0 16px">${factMeta(f, status)}</div>
      <div class="sheet-textwrap"><div class="sheet-text">${mdToHtml(bodyText || text)}</div></div>
      <div class="sheet-audit-note">${icon("i-audit")} Décision enregistrée dans l'historique · ${esc(f.n_sources || 1)} source(s) fusionnée(s)</div>
    </article>
    <div class="sheet-actions">
      <button class="btn btn-primary" data-decide="APPROVED">${icon("i-send")} Approuver &amp; transmettre</button>
      <div class="sheet-actions-row">
        <button class="btn btn-tonal" data-edit="1">${icon("i-edit")} Modifier</button>
        <button class="btn btn-tonal" data-regen="1">${icon("i-refresh")} Régénérer</button>
        <button class="btn btn-danger-ghost" data-decide="REJECTED">${icon("i-reject")} Rejeter</button>
      </div>
      ${(status === "APPROVED" || status === "EDITED" || status === "TRANSMITTED") ? `<button class="btn btn-tonal btn-block" data-retract="1">${icon("i-undo")} Annuler la décision</button>` : ""}
      <div class="regen-panel" id="regenPanel" hidden>
        <div class="regen-panel-title">Régénérer avec un angle (sans re-scraper la source)</div>
        <div class="regen-chips" id="regenChips"></div>
        <button class="btn btn-ghost btn-sm" data-regen-cancel="1">Annuler</button>
      </div>
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
  // ---- Régénération (sans re-scrape) : bouton + panneau de suggestions ----
  const regenBtn = body.querySelector("[data-regen]");
  const regenPanel = body.querySelector("#regenPanel");
  const regenChips = body.querySelector("#regenChips");
  const regenCancel = body.querySelector("[data-regen-cancel]");
  if (regenBtn && regenPanel) {
    regenBtn.onclick = async () => {
      regenPanel.hidden = false;
      regenChips.innerHTML = "<span class='muted'>Chargement…</span>";
      let sugs = [];
      try { const r = await Store.api("/api/regen-suggestions"); sugs = (r && r.suggestions) || []; }
      catch (e) { sugs = []; }
      if (!sugs.length) sugs = [{ id: "neutre", label: "Réécriture neutre" }];
      regenChips.innerHTML = sugs.map(s =>
        `<button class="regen-chip" data-sug="${esc(s.id)}" title="${esc(s.hint || '')}">${esc(s.label)}</button>`
      ).join("");
      regenChips.querySelectorAll(".regen-chip").forEach(chip => {
        chip.onclick = async () => {
          chip.classList.add("loading");
          try {
            const r = await Store.regenerate(f.fact_id, chip.dataset.sug);
            // Met à jour le fact localement (article + modèle) puis re-rend le sheet
            if (r && r.article) {
              f.article = r.article;
              f.gen_model = r.model || f.gen_model;
              f.gen_status = r.status || f.gen_status;
              // reflète aussi dans state.facts si présent
              const inList = (Store.state.facts || []).find(x => x.fact_id === f.fact_id);
              if (inList) { inList.article = r.article; inList.gen_model = r.model; }
              Store.setState({ facts: Store.state.facts });
            }
            renderSheet(s);
          } catch (e) {
            regenChips.innerHTML = `<span class="tag tag-warn">Erreur : ${esc(e.message)}</span>`;
          }
        };
      });
    };
  }
  if (regenCancel) regenCancel.onclick = () => { regenPanel.hidden = true; };
}

function bindAudit() {
  const view = document.getElementById("view");
  if (!view) return;
  const checks = () => Array.from(view.querySelectorAll(".audit-check:checked")).map(c => c.dataset.id);
  const delBtn = document.getElementById("auditDelSel");
  const fb = document.getElementById("auditFloatbar");
  const fbCount = document.getElementById("auditFbCount");
  const fbDel = document.getElementById("auditFbDel");
  const refresh = () => {
    const n = checks().length;
    if (delBtn) delBtn.disabled = n === 0;
    if (fbDel) fbDel.disabled = n === 0;
    if (fbCount) fbCount.textContent = `${n} sélectionné(s)`;
    if (fb) fb.classList.toggle("show", n > 0);
  };
  view.querySelectorAll(".audit-check").forEach(c => c.onchange = refresh);
  // Filtres par type + recherche (côté client)
  const applyFilt = (patch) => { Store.setState({ auditFilter: Object.assign({}, Store.state.auditFilter, patch) }); };
  view.querySelectorAll(".chip-filter").forEach(ch => ch.onclick = () => applyFilt({ type: ch.dataset.type }));
  const search = document.getElementById("auditSearch");
  if (search) search.oninput = () => applyFilt({ q: search.value });
  // Export CSV de la sélection (fetch brut : le serveur renvoie text/csv)
  const exportBtn = document.getElementById("auditExport");
  if (exportBtn) exportBtn.onclick = async () => {
    const ids = checks();
    if (!ids.length) { snack("Cochez au moins un événement à exporter"); return; }
    try {
      const BASE = location.pathname.startsWith("/kora-v2") ? "/kora-v2" : "";
      const token = (() => { try { return localStorage.getItem("kora-token"); } catch (e) { return null; } })();
      const headers = { "Content-Type": "application/json" };
      if (token) headers["X-API-Token"] = token;
      const res = await fetch(BASE + "/api/audit/export", {
        method: "POST", headers, credentials: "same-origin",
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error("code " + res.status);
      const csv = await res.text();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = "kora-audit-export.csv"; a.click(); URL.revokeObjectURL(a.href);
      snack("Export CSV généré");
    } catch (e) { snack("Erreur export : " + (e.message || e)); }
  };
  const selAll = document.getElementById("auditSelAll");
  if (selAll) selAll.onclick = () => { view.querySelectorAll(".audit-check").forEach(c => c.checked = true); refresh(); };
  const selNone = document.getElementById("auditSelNone");
  if (selNone) selNone.onclick = () => { view.querySelectorAll(".audit-check").forEach(c => c.checked = false); refresh(); };
  const fbAll = document.getElementById("auditFbAll");
  if (fbAll) fbAll.onclick = () => { view.querySelectorAll(".audit-check").forEach(c => c.checked = true); refresh(); };
  const fbNone = document.getElementById("auditFbNone");
  if (fbNone) fbNone.onclick = () => { view.querySelectorAll(".audit-check").forEach(c => c.checked = false); refresh(); };
  const doDelete = async () => {
    const ids = checks();
    if (!ids.length) return;
    if (!confirm(`Supprimer ${ids.length} événement(s) de l'historique ?`)) return;
    await Store.api("/api/audit", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
    Store.loadAudit(); snack("Sélection supprimée");
  };
  if (delBtn) delBtn.onclick = doDelete;
  if (fbDel) fbDel.onclick = doDelete;
  const purgeAll = document.getElementById("auditPurgeAll");
  if (purgeAll) purgeAll.onclick = async () => {
    if (!confirm("Vider TOUT l'historique ? (une ligne de purge sera conservée)")) return;
    await Store.api("/api/audit/purge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "all" }) });
    Store.loadAudit(); snack("Historique vidé");
  };
  const resetToday = document.getElementById("auditResetToday");
  if (resetToday) resetToday.onclick = async () => {
    if (!confirm("Réinitialiser l'historique du jour (aujourd'hui) ?")) return;
    const today = new Date().toISOString().slice(0, 10);
    await Store.api("/api/audit/purge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "day", day: today }) });
    Store.loadAudit(); snack("Historique du jour réinitialisé");
  };
  view.querySelectorAll(".audit-purge-day").forEach(b => b.onclick = async () => {
    const day = b.dataset.day;
    if (!confirm(`Réinitialiser l'historique du ${day} ?`)) return;
    await Store.api("/api/audit/purge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "day", day }) });
    Store.loadAudit(); snack(`Historique du ${day} réinitialisé`);
  });
}

function bindSettings() {
  const root = document.documentElement;
  const coral = document.getElementById("setCoral");
  const bordeaux = document.getElementById("setBordeaux");
  const swatch = document.getElementById("setSwatch");
  const preview = () => {
    const c = coral ? coral.value : "#F2A98C";
    const b = bordeaux ? bordeaux.value : "#E08A84";
    if (swatch) swatch.style.background = `linear-gradient(135deg, ${c}, ${b})`;
    if (c) root.style.setProperty("--coral", c);
    if (b) root.style.setProperty("--bordeaux", b);
  };
  if (coral) coral.oninput = preview;
  if (bordeaux) bordeaux.oninput = preview;

  const file = document.getElementById("setLogoFile");
  const logoPreview = document.getElementById("setLogoPreview");
  const clearBtn = document.getElementById("setLogoClear");
  let logoData = null; // null = ne pas toucher; "" = effacer; data-URL = set
  if (file) file.onchange = () => {
    const f = file.files && file.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      logoData = reader.result;
      if (logoPreview) logoPreview.innerHTML = `<img src="${logoData}" alt="">`;
      if (clearBtn) clearBtn.disabled = false;
    };
    reader.readAsDataURL(f);
  };
  if (clearBtn) clearBtn.onclick = () => {
    logoData = "";
    if (logoPreview) logoPreview.innerHTML = icon("i-spark");
    clearBtn.disabled = true;
  };

  const save = document.getElementById("setSave");
  if (save) save.onclick = async () => {
    // Token d'administration (stocké localement, jamais envoyé au serveur)
    const tokenField = document.getElementById("setToken");
    if (tokenField) {
      const tk = tokenField.value.trim();
      if (tk) {
        try { localStorage.setItem("kora-token", tk); } catch (e) {}
      }
    }
    const lblIds = { cockpit: "setLblCockpit", facts: "setLblFacts", sources: "setLblSources", drafts: "setLblDrafts", audit: "setLblAudit" };
    const payload = {
      app_name: (document.getElementById("setAppName")?.value || "").trim(),
      accent_coral: coral ? coral.value : undefined,
      accent_bordeaux: bordeaux ? bordeaux.value : undefined,
    };
    Object.keys(lblIds).forEach(route => {
      const v = (document.getElementById(lblIds[route])?.value || "").trim();
      if (v) payload["label_" + route] = v;
    });
    const tag = (document.getElementById("setTagline")?.value || "").trim();
    if (tag) payload.app_tagline = tag;
    if (logoData !== null) payload.logo_data = logoData; // "" ou data-URL
    try {
      const r = await Store.api("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (r.error) { snack(r.error); return; }
      Store.applySettings(r.settings);
      Store.setState({ settings: r.settings });
      snack("Modifications enregistrées");
    } catch (e) { snack(e.message || "Erreur d'enregistrement"); }
  };
  // Preview live des libellés d'onglets
  const liveLabels = () => {
    const lblIds = { cockpit: "setLblCockpit", facts: "setLblFacts", sources: "setLblSources", drafts: "setLblDrafts", audit: "setLblAudit" };
    Object.keys(lblIds).forEach(route => {
      const el = document.getElementById(lblIds[route]);
      if (el) document.querySelectorAll(`.navitem[data-route="${route}"] span`).forEach(sp => { sp.textContent = el.value || sp.textContent; });
    });
    const tg = document.getElementById("setTagline");
    const tl = document.querySelector(".about-tagline");
    if (tg && tl) tl.textContent = tg.value || tl.textContent;
  };
  ["setLblCockpit","setLblFacts","setLblHitl","setLblSources","setLblDrafts","setLblAudit","setTagline"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.oninput = liveLabels;
  });
  // Compte : changement de mot de passe + déconnexion
  const changePw = document.getElementById("setChangePw");
  if (changePw) changePw.onclick = async () => {
    const cur = document.getElementById("setCurPw")?.value || "";
    const n1 = document.getElementById("setNewPw")?.value || "";
    const n2 = document.getElementById("setNewPw2")?.value || "";
    if (n1.length < 8) { snack("Le nouveau mot de passe doit faire au moins 8 caractères"); return; }
    if (n1 !== n2) { snack("Les mots de passe ne correspondent pas"); return; }
    try {
      await Store.changePassword(cur, n1);
      snack("Mot de passe mis à jour. Reconnecte-toi.");
      await Store.logout();
      document.getElementById("authUser") && (document.getElementById("authUser").value = "");
      App.renderAuth("login", null, true);
    } catch (e) {
      // Message clair si le mot de passe actuel est erroné (ou autre erreur)
      const msg = e && e.message === "wrong_current" ? "Mot de passe actuel incorrect" : (e && e.message || "Erreur");
      snack(msg);
    }
  };
  const logoutBtn = document.getElementById("setLogout");
  if (logoutBtn) logoutBtn.onclick = async () => {
    await Store.logout();
    App.renderAuth("login", null, true);
  };
  // Comptes : liste + ajout + suppression + changement de rôle (advanced only)
  const addUser = document.getElementById("setAddUser");
  if (addUser) addUser.onclick = async () => {
    const uname = (document.getElementById("setNewUser")?.value || "").trim();
    const email = (document.getElementById("setNewEmail")?.value || "").trim();
    const pw = document.getElementById("setNewUserPw")?.value || "";
    const role = (document.getElementById("setNewUserRole")?.value || "normal");
    if (uname.length < 3) { snack("Identifiant 3 caractères minimum"); return; }
    if (pw.length < 8) { snack("Mot de passe 8 caractères minimum"); return; }
    try {
      await Store.createUser(uname, email, pw, role);
      snack("Compte créé" + (role === "advanced" ? " (Avancé)" : ""));
      await Store.loadUsers();
      render();
    } catch (e) { snack(e.message || "Erreur"); }
  };
  view.querySelectorAll(".role-select").forEach(sel => sel.onchange = async () => {
    const id = sel.dataset.id;
    const newRole = sel.value;
    try {
      await Store.setRole(id, newRole);
      snack("Rôle mis à jour : " + (newRole === "advanced" ? "Avancé" : "Normal"));
      await Store.loadUsers();
    } catch (e) { snack(e.message || "Erreur"); }
  });
  view.querySelectorAll(".user-del").forEach(b => b.onclick = async () => {
    const id = b.dataset.id;
    if (!confirm("Retirer ce compte ? Ses sessions seront fermées.")) return;
    try {
      await Store.deleteUser(id);
      snack("Compte retiré");
      await Store.loadUsers();
      render();
    } catch (e) { snack(e.message || "Erreur"); }
  });
  // ---- Navigation tiroirs (pattern Supabase) ----
  const drawers = {
    appearance: "drawer-appearance",
    account: "drawer-account",
    personalization: "drawer-personalization",
    accounts: "drawer-accounts",
    auditlog: "drawer-auditlog",
  };
  const loadAuditLog = async () => {
    const body = document.getElementById("auditLogBody");
    if (!body) return;
    try {
      const data = await Store.api("/api/audit/admin");
      const days = (data && data.days) || [];
      if (!days.length) { body.innerHTML = '<p class="muted">Aucune action admin enregistrée.</p>'; return; }
      const row = (ev) => `<div class="list-row audit-row"><span class="meta-ic">${icon("i-shield")}</span><div class="meta"><div class="name">${esc(ev.event || ev.action || "Action")}</div><div class="sub">${esc(ev.detail || "")}${ev.editor ? " · par " + esc(ev.editor) : ""}</div></div><div class="sub audit-time">${esc((ev.ts||"").replace("T"," ").slice(0,16).slice(11))}</div></div>`;
      const dayBlock = (d) => `<section class="fact-group audit-day"><div class="group-head"><span class="group-ic">${icon("i-date")}</span><h3 class="group-title">${esc(d.label)}</h3><span class="group-count">${d.count}</span></div><div class="audit-events">${d.events.map(row).join("")}</div></section>`;
      body.innerHTML = days.map(dayBlock).join("");
    } catch (e) { body.innerHTML = '<p class="muted">Erreur de chargement du journal (admin requis).</p>'; }
  };
  const auditNav = view.querySelector('.settings-nav-item[data-setnav="auditlog"]');
  if (auditNav) auditNav.onclick = () => { openDrawer("auditlog"); loadAuditLog(); };
  const refreshBtn = document.getElementById("auditLogRefresh");
  if (refreshBtn) refreshBtn.onclick = loadAuditLog;
  const scrim = document.getElementById("setDrawerScrim");
  const openDrawer = (id) => {
    Object.values(drawers).forEach(did => { const d = document.getElementById(did); if (d) d.hidden = true; });
    const d = document.getElementById(drawers[id]);
    if (!d) return;
    d.hidden = false;
    // Sur desktop/tablette le panneau détail reste inline (pas de scrim) ; sur mobile le scrim apparaît.
    if (scrim && window.matchMedia("(max-width: 819px)").matches) scrim.hidden = false;
    // Mobile : masquer la FAB pour éviter qu'elle ne déborde sur le contenu du panneau.
    if (window.matchMedia("(max-width: 819px)").matches) { const fab = document.getElementById("fab"); if (fab) fab.hidden = true; }
    view.querySelectorAll(".settings-nav-item").forEach(n => n.classList.toggle("active", n.dataset.setnav === id));
  };
  // Desktop/tablette : la 1re catégorie (Apparence) s'affiche par défaut en panneau détail.
  // Mobile : tout reste fermé pour laisser la bottomnav visible (aucun piège plein écran).
  if (window.matchMedia("(min-width: 820px)").matches) openDrawer("appearance");
  const closeDrawer = () => {
    // Sur desktop/tablette le panneau détail reste toujours visible : on ne ferme rien.
    if (window.matchMedia("(min-width: 820px)").matches) return;
    Object.values(drawers).forEach(did => { const d = document.getElementById(did); if (d) d.hidden = true; });
    if (scrim) scrim.hidden = true;
    // Mobile : réafficher la FAB (plus de panneau ouvert).
    const fab = document.getElementById("fab"); if (fab) fab.hidden = false;
    view.querySelectorAll(".settings-nav-item").forEach(n => n.classList.remove("active"));
  };
  view.querySelectorAll(".settings-nav-item").forEach(n => n.onclick = () => openDrawer(n.dataset.setnav));
  if (scrim) scrim.onclick = closeDrawer;
  view.querySelectorAll("[data-setback]").forEach(b => b.onclick = closeDrawer);
  // Escape ferme le tiroir settings (sans fermer la feuille HITL)
  const onKey = (e) => { if (e.key === "Escape") { const anyOpen = Object.values(drawers).some(did => { const d = document.getElementById(did); return d && !d.hidden; }); if (anyOpen) { closeDrawer(); e.stopPropagation(); } } };
  document.addEventListener("keydown", onKey);
}

let _authRendered = false;  // évite de reconstruire le formulaire à chaque setState

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
  if (!s.auth || !s.auth.loggedIn) {
    if (!_authRendered) { renderAuth("login"); }
    return;
  }
  _authRendered = false; // reconnecté : permttre un futur ré-affichage propre
  const agent = document.getElementById("agentStatus");
  if (agent) agent.innerHTML = s.ui.busy
    ? `<span class="dot dot-busy"></span><span>${s.ui.overlay || "Agent occupé…"}</span>`
    : `<span class="dot dot-ok"></span><span>prêt</span>`;
  const view = document.getElementById("view");
  if (!view) return;
  const map = { cockpit: viewCockpit, facts: viewFacts, sources: viewSources, audit: viewAudit, drafts: viewDrafts, settings: viewSettings, trash: viewTrash };
  view.innerHTML = (map[s.route] || viewCockpit)(s);
  $$(".navitem, .rail .navitem").forEach(n => n.classList.toggle("active", n.dataset.route === s.route));
  // Habilitations : l'onglet Paramètres (gestion avancée) est réservé au rôle "advanced"
  const isAdvanced = (s.auth && s.auth.role === "advanced");
  $$('.navitem[data-route="settings"]').forEach(n => { n.hidden = !isAdvanced; });
  const bnav = document.querySelector('.bottomnav [data-route="settings"]');
  if (bnav) bnav.hidden = !isAdvanced;
  const curTheme = Store.getTheme();
  $$("[data-theme-btn]").forEach(n => n.classList.toggle("active", n.dataset.themeBtn === curTheme));
  const sa = document.getElementById("stateAction");
  if (sa) sa.onclick = () => {
    if (sa.dataset.force) Store.startCycle(1, true);
    else if (sa.textContent.trim() === "Réessayer") location.reload();
    else if (sa.textContent.trim().includes("Relancer un cycle")) Store.startCycle();
    else Store.seed();
  };
  const cs = document.getElementById("cockpitSeed");
  if (cs) cs.onclick = () => Store.seed();
  // Verrou visuel : on ne peut PAS relancer un cycle tant que le précédent n'est pas fini.
  const busy = !!s.ui.busy;
  const tc = document.getElementById("topbarCycle");
  if (tc) {
    tc.disabled = busy;
    const lbl = tc.querySelector(".topbar-cta-label");
    if (lbl) lbl.textContent = busy ? "En cours…" : "Lancer un cycle";
  }
  document.querySelectorAll('[data-action="cycle-force"]').forEach(el => { el.disabled = busy; });
  const fabCycle = document.querySelector('.fab-action[data-act="cycle"]');
  if (fabCycle) { fabCycle.style.pointerEvents = busy ? "none" : ""; fabCycle.classList.toggle("disabled", busy); }
  // État de vérité du système dans la barre de statut (prêt / en cours / erreur)
  const am = document.getElementById("agentMode");
  if (am) {
    if (busy) am.textContent = "en cours";
    else if (s.health && s.health.status === "error") am.textContent = "erreur";
    else am.textContent = "prêt";
  }
  const amDot = document.querySelector("#agentStatus .dot");
  if (amDot) amDot.className = "dot " + (busy ? "dot-busy" : (s.health && s.health.status === "error" ? "dot-err" : "dot-ok"));
  const gl = document.getElementById("globalLoader");
  if (gl) {
    const t = document.getElementById("globalLoaderText");
    if (t) t.textContent = s.ui.overlay || "Agent en cours…";
  }
  try { renderSheet(s); } catch (e) { console.error("renderSheet", e); }
  try { if (s.route === "audit") bindAudit(); } catch (e) { console.error("bindAudit", e); }
  try { if (s.route === "settings") bindSettings(); } catch (e) { console.error("bindSettings", e); }
  // Barre d'action de sélection multiple
  try {
    const sb = document.getElementById("selectBar");
    if (sb) {
      // N'apparaît QUE sur les pages de contenu (sélection pertinente) et
      // uniquement si au moins un article est coché. Sinon elle reste cachée
      // (pas de barre "perdue" sur Sources / Paramètres / Historique / Corbeille).
      const SEL_ROUTES = ["cockpit", "facts", "drafts", "trash"];
      const n = Store.selectedIds().length;
      sb.hidden = !(s.selectMode && n > 0 && SEL_ROUTES.includes(s.route));
      const cnt = document.getElementById("selectCount");
      if (cnt) cnt.textContent = n;
      // Éviter que la FAB ne chevauche la bulle de sélection (tous breakpoints)
      const fab = document.getElementById("fab");
      if (fab) fab.hidden = !sb.hidden;
    }
    // Bouton "Sélectionner" est re-rendu à chaque render -> on le câble ici (pas dans bind())
    const enterSel = document.getElementById("enterSelect");
    if (enterSel) enterSel.onclick = () => Store.setSelectMode(!Store.state.selectMode);
  } catch (e) { console.error("selectBar", e); }
  // Corbeille : boutons restaurer / supprimer définitivement
  try {
    document.querySelectorAll("[data-restore]").forEach(b => b.onclick = () => {
      Store.restoreFact(b.dataset.restore).then(() => snack("Restauré")).catch(e => snack("Erreur : " + e.message));
    });
    document.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
      if (!window.confirm("Supprimer définitivement cet article ? Irréversible.")) return;
      Store.deleteForever([b.dataset.del]).then(r => snack(`${r.deleted || 0} supprimé(s)`)).catch(e => snack("Erreur : " + e.message));
    });
    document.querySelectorAll("[data-finish]").forEach(b => b.onclick = () => {
      Store.finishDraft(b.dataset.finish).then(() => snack("Remis en attente de validation")).catch(e => snack("Erreur : " + e.message));
    });
  } catch (e) { console.error("trashBtns", e); }
  // Boutons afficher/masquer le mot de passe (login + settings)
  try { bindPasswordToggles(); } catch (e) { console.error("pwToggles", e); }
  // Re-bind dynamic events after every render (filter pills, fact cards, etc.)
  try { bind(); } catch (e) { console.error("bind", e); }
}
function onBulkAction(action) {
  const ids = Store.selectedIds();
  if (!ids.length) { snack("Aucun article sélectionné"); return; }
  if (action === "approve") { openWpChoice(); return; }
  if (action === "pending") {
    Store.bulkAction("pending").then(r => snack(`${r.done}/${r.total} remis en attente`)).catch(e => snack("Erreur : " + e.message));
    return;
  }
  if (action === "trash") { openTrashChoice(); return; }
  if (action === "draft") {
    Store.bulkAction("draft").then(r => snack(`${r.done}/${r.total} en brouillon`)).catch(e => snack("Erreur : " + e.message));
    return;
  }
}
function openWpChoice() {
  const wp = document.getElementById("wpChoice");
  const sc = document.getElementById("wpScrim");
  if (wp) { document.getElementById("wpCount").textContent = Store.selectedIds().length; wp.hidden = false; }
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
    const fails = (r.results || []).filter(x => !x.ok).length;
    snack(fails ? `${r.done}/${r.total} publié(s) · ${fails} échec(s)` : `${r.done}/${r.total} publié(s) sur WordPress`);
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
function snack(msg) {
  const sn = document.getElementById("snackbar");
  if (!sn) return;
  sn.textContent = msg; sn.hidden = false;
  clearTimeout(sn._t); sn._t = setTimeout(() => sn.hidden = true, 2600);
}
function navigate(route, push = true) {
  if (push && location.hash !== "#" + route) {
    try { history.pushState({ route }, "", "#" + route); } catch (e) {}
  }
  Store.setRoute(route);
  Store.setState({ ui: { ...Store.state.ui, busy: false, overlay: null } });
  if (route === "facts") Store.loadHITL();
  else if (route === "drafts") Store.loadHITL();
  else if (route === "trash") Store.loadTrash();
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
    // En mode sélection, le clic sur la carte (ou sa case) ne doit PAS ouvrir le tiroir.
    if (Store.state.selectMode) { e.stopPropagation(); return; }
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
  // ---- Sélection multiple + actions en masse ----
  const enterSel = document.getElementById("enterSelect");
  if (enterSel) enterSel.onclick = () => Store.setSelectMode(!Store.state.selectMode);
  const selectBar = document.getElementById("selectBar");
  if (selectBar) {
    selectBar.querySelectorAll("[data-bulk]").forEach(b => b.onclick = () => onBulkAction(b.dataset.bulk));
  }
  // Fenêtre choix WP (publish vs draft)
  const wpChoice = document.getElementById("wpChoice");
  const wpScrim = document.getElementById("wpScrim");
  const openWp = () => { document.getElementById("wpCount").textContent = Store.selectedIds().length; wpChoice.hidden = false; if (wpScrim) wpScrim.hidden = false; };
  const closeWp = () => { wpChoice.hidden = true; if (wpScrim) wpScrim.hidden = true; };
  const wpPublish = document.getElementById("wpPublish");
  if (wpPublish) wpPublish.onclick = () => { closeWp(); doBulkApprove("publish"); };
  const wpDraft = document.getElementById("wpDraft");
  if (wpDraft) wpDraft.onclick = () => { closeWp(); doBulkApprove("draft"); };
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
  if (leftDrawer) {
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
        if (Store.state.ui.busy) { snack("Génération en cours…"); return; }
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
    // Pendant une génération (busy), la génération est prioritaire : on reste
    // sur l'écran de génération et on ignore la navigation vers un autre écran.
    if (Store.state.ui.busy) { snack("Génération en cours…"); return; }
    if (railEl) railEl.classList.remove("open");
    const sc = document.getElementById("railScrim");
    if (sc) sc.hidden = true;
    navigate(n.dataset.route);
  });
  const tc = document.getElementById("topbarCycle");
  if (tc) tc.onclick = () => { navigate("cockpit"); Store.startCycle(); };
  // Rail drawer : toggle collapse (desktop) + menu (mobile drawer)
  const closeRailDrawer = () => {
    const rail = document.getElementById("rail");
    if (rail) rail.classList.remove("open");
    const sc = document.getElementById("railScrim");
    if (sc) sc.hidden = true;
  };
  const rt = document.getElementById("railToggle");
  if (rt) rt.onclick = () => {
    // Sur mobile, la flèche ferme le drawer ; sur desktop elle réduit/agrandit le rail.
    if (window.matchMedia("(max-width: 819px)").matches) { closeRailDrawer(); return; }
    Store.setRail(Store.getRail() === "expanded" ? "collapsed" : "expanded");
  };
  // Clic sur le scrim = ferme le drawer mobile (corrige l'impossibilité de refermer)
  const rsc = document.getElementById("railScrim");
  if (rsc) rsc.onclick = closeRailDrawer;

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
        if (Store.state.ui.busy) { snack("Génération en cours…"); return; }
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

  const closeOverflow = () => { if (overflowMenu) overflowMenu.classList.remove("open"); if (navScrim) navScrim.hidden = true; };
  if (overflowMenu) overflowMenu.querySelectorAll(".overflow-item").forEach(it => it.onclick = () => { navigate(it.dataset.route); closeOverflow(); });

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
    // La génération est prioritaire : on bascule toujours sur le Tableau de bord
    // (vue de génération) et on y reste, peu importe l'écran d'origine.
    if (a.dataset.act === "cycle") { navigate("cockpit"); Store.startCycle(); }
    else if (a.dataset.act === "seed") { navigate("cockpit"); Store.seed(); }
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
  window.addEventListener("popstate", (e) => { if (e.state && e.state.route) Store.setRoute(e.state.route); });
  // Amorce l'historique : la route courante devient l'état de base pour que le
  // bouton "retour" du navigateur (mobile) puisse revenir en arrière.
  if (!location.hash) { try { history.replaceState({ route: Store.state.route }, "", "#" + Store.state.route); } catch (e) {} }

  // =========================================================
  // COCKPIT — Delegated event binding (dynamic components)
  // =========================================================
  function bindCockpitEvents() {
    // StatCard clicks -> navigation / filter
    document.addEventListener("click", (e) => {
      const card = e.target.closest("[data-action^='nav-']");
      if (!card) return;
      const action = card.dataset.action;
      if (action === "nav-facts-all") { Store.setFactFilter("all"); navigate("facts"); }
      else if (action === "nav-facts-approved") { Store.setFactFilter("TRANSMITTED"); navigate("facts"); }
      else if (action === "nav-hitl") { Store.setFactFilter("PENDING_REVIEW"); navigate("facts"); }
      else if (action === "nav-drafts") { Store.setFactFilter("EDITED"); navigate("drafts"); }
    });

    // SourceChip clicks -> open settings -> sources tab
    document.addEventListener("click", (e) => {
      const chip = e.target.closest(".source-chip[data-source-id]");
      if (!chip) return;
      navigate("settings");
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
        if (confirm("Lancer un cycle FORCÉ (ignorant la fenêtre 24h) ?")) {
          Store.startCycle({ force: true });
        }
      }
    });

    // Audit all link
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-action='audit-all']")) {
        navigate("audit");
      }
    });
  }

  // Call cockpit binding
  bindCockpitEvents();

  // NOTE: tout le chargement initial (settings, health, auth, routing, auto-refresh)
  // est fait UNE FOIS dans boot() (appelé par main.js), PAS ici. Sinon bind()
  // (exécuté à chaque render) relancerait des setState -> render -> bind = boucle.
}

// Boot unique : chargement initial + auth + routing + auto-refresh.
// Appelé UNE FOIS par main.js, jamais depuis render()/bind().
function boot() {
  const resetToken = new URLSearchParams(location.search).get("reset");
  Store.loadSettings().then(() => {
    if (resetToken) {
      renderAuth("reset", resetToken);
    } else {
      Store.checkAuth().then((ok) => {
        if (!ok) renderAuth("login");
      });
    }
  });
  const r = (location.pathname.replace(/^\/kora-v2/, "") || "/").split("/")[1] || "cockpit";
  if (Store.state.route !== r) Store.state.route = r;
  Store.loadHealth();
  Store.loadSettings();
  Store.loadTrash().catch(() => {});
  Store.loadUsers().catch(() => {});
  Store.startAutoRefresh(30000);
}


// ---- Écrans d'authentification (overlay plein écran) ----
function renderAuth(mode, token, force = false) {
  const overlay = document.getElementById("authOverlay");
  if (!overlay) return;
  // For explicit navigation (forgot, reset, logout), allow rebuild.
  // For auto-render via render(), only build once.
  if (!_authRendered || force) {
    if (mode === "login") overlay.innerHTML = viewLogin();
    else if (mode === "forgot") overlay.innerHTML = viewForgot();
    else if (mode === "reset") overlay.innerHTML = viewReset(token);
    overlay.hidden = false;
    document.getElementById("app").style.display = "none";
    bindAuth(mode, token);
    bindPasswordToggles(overlay);
    _authRendered = true;
    if (mode === "login") {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => alignWordmark()).catch(() => {});
      }
      alignWordmark();
    }
  }
}

function viewWordmark() {
  // Wordmark typographique : KORA (Montserrat ExtraBold, bordeaux) + Agent
  // (plus petit, gras, A majuscule) avec le 't' aligné pile sous le 'A' de KORA.
  return `<div class="wm">
    <span class="wm-kora">KOR<span class="wm-kora-a">A</span></span>
    <span class="wm-agent"><span class="wm-a">A</span>gent</span>
  </div>`;
}

function alignWordmark() {
  // Aligne le 'A' de « Agent » pile sous le 'A' de « KORA » (4e lettre, marqué .wm-kora-a).
  try {
    const koraA = document.querySelector(".wm-kora-a");
    const agent = document.querySelector(".wm-agent");
    if (!koraA || !agent) return;
    const aRect = koraA.getBoundingClientRect();
    const kRect = agent.parentElement.getBoundingClientRect();
    const offset = aRect.left - kRect.left;
    agent.style.marginLeft = (offset + 1) + "px";
  } catch (e) {}
}

function viewLogin() {
  const logo = (Store.state.settings && Store.state.settings.logo_data) ? `<img class="auth-wordmark" src="${Store.state.settings.logo_data}" alt="">` : icon("i-spark");
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
  scope.querySelectorAll(".pw-toggle").forEach(btn => {
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
  const setErr = (m) => { if (err) err.textContent = m || ""; };
  const form = overlay.querySelector("#authForm");
  if (mode === "login") {
    const forgot = overlay.querySelector("#authForgot");
    if (forgot) forgot.onclick = () => renderAuth("forgot");
    if (form) form.onsubmit = async (e) => {
      e.preventDefault();
      setErr("");
      const u = overlay.querySelector("#authUser").value.trim();
      const p = overlay.querySelector("#authPass").value;
      const btn = overlay.querySelector("#authSubmit");
      const orig = btn ? btn.textContent : "";
      // Timer de sécurité : si le login ne revient pas (backend lent/bloqué),
      // on restaure le bouton et on affiche une erreur au lieu de figer.
      const safety = setTimeout(() => {
        if (btn) { btn.disabled = false; btn.textContent = orig || "Se connecter"; }
        setErr("Connexion trop lente — le serveur ne répond pas. Réessaie ou contacte l'admin.");
      }, 16000);
      try {
        if (btn) { btn.disabled = true; btn.textContent = "Connexion…"; }
        await Store.login(u, p);
        clearTimeout(safety);
        overlay.hidden = true;
        document.getElementById("app").style.display = "";
        Store.loadUsers().catch(() => {});
        Store.loadSettings();
        render();
        snack("Connecté");
      } catch (ex) { setErr(ex.message || "Erreur de connexion"); }
      finally { clearTimeout(safety); if (btn) { btn.disabled = false; btn.textContent = orig; } }
    };
  } else if (mode === "forgot") {
    const back = overlay.querySelector("#authBack");
    if (back) back.onclick = () => renderAuth("login", null, true);
    if (form) form.onsubmit = async (e) => {
      e.preventDefault();
      setErr("");
      const email = overlay.querySelector("#authEmail").value.trim();
      try {
        await Store.forgot(email);
        setErr("Si un compte existe, un lien a été envoyé. Vérifie ton email.");
      } catch (ex) { setErr(ex.message || "Erreur"); }
    };
  } else if (mode === "reset") {
    if (form) form.onsubmit = async (e) => {
      e.preventDefault();
      setErr("");
      const n1 = overlay.querySelector("#authNew").value;
      const n2 = overlay.querySelector("#authNew2").value;
      if (n1.length < 8) { setErr("Le mot de passe doit faire au moins 8 caractères"); return; }
      if (n1 !== n2) { setErr("Les mots de passe ne correspondent pas"); return; }
      try {
        await Store.resetPassword(token, n1);
        // Nettoie le token de l'URL
        history.replaceState(null, "", location.pathname);
        setErr("");
        renderAuth("login", null, true);
        snack("Mot de passe réinitialisé. Connecte-toi.");
      } catch (ex) { setErr(ex.message || "Erreur"); }
    };
  }
}

// Affiche l'app (si session OK) et masque l'overlay
function showApp() {
  const overlay = document.getElementById("authOverlay");
  if (overlay) overlay.hidden = true;
  const app = document.getElementById("app");
  if (app) app.style.display = "";
}

export const App = { render, snack, bind, boot, navigate, openFact, renderAuth, showApp };
