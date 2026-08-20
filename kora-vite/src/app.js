/* ============================================================
   KORA — App (vues, routing, tiroir HITL). Module ES.
   ============================================================ */
import { Store } from "./store.js";

import { marked } from "marked";
import DOMPurify from "dompurify";

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => root ? Array.from(root.querySelectorAll(sel)) : [];
const esc = (s) => String(s == null ? "" : s).replace(/[&<>`"'$]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "`": "&#96;", '"': "&quot;", "'": "&#39;", "$": "&#36;" }[c]));
// Propriétaire hérite de tout ce qu'Administrateur peut faire (2026-08-19,
// restructuration rôles/permissions — voir permissions.py ROLES_ORDER côté
// serveur, où owner > advanced par rang). Les écrans qui réservaient une
// section à role==="advanced" doivent aussi l'ouvrir à "owner", sinon un
// Propriétaire se retrouve avec MOINS d'accès qu'un Administrateur au lieu
// de plus — régression repérée en test réel après la Phase 1.
const isAdvancedRole = (role) => role === "advanced" || role === "owner";
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

// ============================================================================
// ÉDITEUR ENRICHI (wireframe 4.4) — helpers de manipulation Markdown.
// L'article reste stocké en Markdown (compatible backend/writer.py) ; la barre
// d'outils insère/enlève la syntaxe Markdown autour de la sélection du
// <textarea>, façon éditeur riche, sans dépendance externe.
// ============================================================================
function rteWrapSelection(ta, before, after = before) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const selected = value.slice(s, e);
  ta.value = value.slice(0, s) + before + selected + after + value.slice(e);
  ta.selectionStart = s + before.length;
  ta.selectionEnd = s + before.length + selected.length;
  ta.focus();
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}
function rtePrefixLines(ta, prefix) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  // Étend la sélection aux débuts/fins de ligne complètes.
  const lineStart = value.lastIndexOf("\n", s - 1) + 1;
  let lineEnd = value.indexOf("\n", e);
  if (lineEnd === -1) lineEnd = value.length;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split("\n").map(l => l.startsWith(prefix) ? l : prefix + l);
  const newBlock = lines.join("\n");
  ta.value = value.slice(0, lineStart) + newBlock + value.slice(lineEnd);
  ta.selectionStart = lineStart;
  ta.selectionEnd = lineStart + newBlock.length;
  ta.focus();
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}
function rteHeading(ta, level) {
  const { selectionStart: s, value } = ta;
  const lineStart = value.lastIndexOf("\n", s - 1) + 1;
  let lineEnd = value.indexOf("\n", s);
  if (lineEnd === -1) lineEnd = value.length;
  const line = value.slice(lineStart, lineEnd).replace(/^#{1,6}\s*/, "");
  const prefix = level ? "#".repeat(level) + " " : "";
  ta.value = value.slice(0, lineStart) + prefix + line + value.slice(lineEnd);
  ta.focus();
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}
function rteLink(ta) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const selected = value.slice(s, e) || "texte du lien";
  const url = window.prompt("URL du lien :", "https://");
  if (!url) return;
  const md = `[${selected}](${url})`;
  ta.value = value.slice(0, s) + md + value.slice(e);
  ta.focus();
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}
// Icônes : on utilise le SPRITE SVG inline (injecté dans le <body> par le
// build, voir postbuild.mjs + icons.js) plutôt que la police Material Icons.
// Avantage : aucun flash de texte (ex: "visibility" sur l'œil du mot de passe)
// car le <use href="#i-..."> résout immédiatement depuis le DOM, sans
// dépendre d'une police web async.
const icon = (id, cls = "") => `<svg class="ic ${cls}" aria-hidden="true"><use href="#${id}"></use></svg>`;
function placeholderSvg(theme) {
  const pal = {
    dark:  ["#241C18", "#15110F", "#E9705D"],
    cacao: ["#3A2418", "#241712", "#E9705D"],
    light: ["#ECE7DF", "#F4F1EC", "#B5573A"],
  }[theme] || ["#241C18", "#15110F", "#E9705D"];
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
  const stMap = { PENDING_REVIEW: "En attente", APPROVED: "Approuvé", REJECTED: "Rejeté", TRANSMITTED: "Transmis", EDITED: "Édité", TRANSMISSION_FAILED: "Échec d'envoi" };
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
    TRANSMISSION_FAILED: ["badge-rejected", "Échec d'envoi"],
  };
  const [k, t] = map[st] || ["badge-pending", st || "—"];
  return `<span class="badge ${k}">${t}</span>`;
}

// ============================================================================
// GRAPHIQUE D'ÉVOLUTION (SVG inline, zéro dépendance)
// Source : s.audit.days (get_daily) -> volume d'activité + décisions par jour.
// Interactif : hover sur un point = tooltip ; légende cliquable = toggle série.
// ============================================================================
function evolutionChart(s) {
  const days = (s.audit && s.audit.days) ? s.audit.days.slice() : [];
  if (!days.length) return `<div class="ev-chart empty">Aucune activité enregistrée</div>`;
  // Ordre chronologique (ancien -> récent) sur l'axe X
  const ordered = days.slice().reverse();
  const n = ordered.length;
  const W = 640, H = 240, padX = 38, padY = 28;
  const innerW = W - padX * 2, innerH = H - padY * 2;

  // Séries : total (aire) + décisions clés
  const seriesDef = [
    { key: "TOTAL", color: "var(--coral)", fill: true, get: d => d.count },
    { key: "APPROUVE", color: "var(--news)", get: d => d.counters.APPROUVE || 0 },
    { key: "REJETE", color: "var(--alert)", get: d => d.counters.REJETE || 0 },
    { key: "MODIFIE", color: "var(--signal)", get: d => d.counters.MODIFIE || 0 },
  ];
  const maxY = Math.max(1, ...seriesDef.flatMap(se => ordered.map(se.get)));

  const x = i => padX + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const y = v => padY + innerH - (v / maxY) * innerH;

  // Grille horizontale (4 niveaux)
  let grid = "";
  for (let g = 0; g <= 4; g++) {
    const gy = padY + (innerH * g) / 4;
    const val = Math.round((maxY * (4 - g)) / 4);
    grid += `<line x1="${padX}" y1="${gy}" x2="${W - padX}" y2="${gy}" class="ev-grid"/>`;
    grid += `<text x="${padX - 6}" y="${gy + 4}" class="ev-axis-y">${val}</text>`;
  }

  // Axe X : labels de jours
  let xlabels = "";
  ordered.forEach((d, i) => {
    // Troncature + ellipse (au lieu d'une coupe brute sans indicateur, ex.
    // "Aujourd'hui" -> "Aujour" ressemblait a un bug plutot qu'a un
    // raccourci volontaire — corrige 2026-08-19).
    const raw = d.label || "";
    const lbl = raw.length > 10 ? raw.slice(0, 6) + "…" : raw;
    xlabels += `<text x="${x(i)}" y="${H - padY + 16}" class="ev-axis-x">${esc(lbl)}</text>`;
  });

  // Paths par série
  let paths = "", dots = "";
  seriesDef.forEach(se => {
    const pts = ordered.map((d, i) => [x(i), y(se.get(d))]);
    const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const area = se.fill ? `<path d="${line} L ${x(n - 1).toFixed(1)} ${padY + innerH} L ${x(0).toFixed(1)} ${padY + innerH} Z" class="ev-area" style="fill:${se.color}"/>` : "";
    paths += `${area}<path d="${line}" class="ev-line ev-series ev-${se.key}" style="stroke:${se.color}" data-series="${se.key}"/>`;
    pts.forEach((p, i) => {
      const d = ordered[i];
      const vals = seriesDef.map(s2 => `${s2.key}:${s2.get(d)}`).join(" · ");
      dots += `<circle class="ev-dot ev-series ev-${se.key}" data-series="${se.key}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" data-date="${esc(d.label)}" data-vals="${esc(vals)}"/>`;
    });
  });

  const legend = seriesDef.map(se =>
    `<button class="ev-legend-item" data-toggle="${se.key}"><span class="ev-swatch" style="background:${se.color}"></span>${se.key === "TOTAL" ? "Total" : (se.key === "APPROUVE" ? "Approuvé" : se.key === "REJETE" ? "Rejeté" : "Modifié")}</button>`
  ).join("");

  return `
    <section class="ev-chart kora-wire" aria-label="Graphique d'évolution de l'activité">
      <div class="ev-head">
        <h2 class="section-title">Évolution de l'activité</h2>
        <div class="ev-legend">${legend}</div>
      </div>
      <div class="ev-plot">
        <svg viewBox="0 0 ${W} ${H}" class="ev-svg" preserveAspectRatio="none" role="img">
          ${grid}${xlabels}${paths}${dots}
        </svg>
        <div class="ev-tooltip" id="evTooltip" hidden></div>
      </div>
    </section>`;
}

function viewCockpit(s) {
  // SSOT : tous les compteurs viennent de s.stats (calcules une fois par le backend).
  // Plus aucun recalcul divergent cote front (ancien cat.pending / s.trash, etc.).
  const st = s.stats || {};
  const total = (typeof st.total_facts === "number") ? st.total_facts : ((typeof st.articles === "number") ? st.articles : 0);  // Articles = total_facts, coherent avec la sidebar et le filtre "Tous" (voir get_dashboard_stats)
  const pending = (typeof st.pending === "number") ? st.pending : 0;        // A decider (PENDING_REVIEW)
  const approved = (typeof st.published === "number") ? st.published : 0;   // Publies (articles publies)
  const draft = (typeof st.drafts === "number") ? st.drafts : 0;            // Brouillons (EDITED)
  const trash = (typeof st.trash === "number") ? st.trash : 0;             // Corbeille (TRASHED)
  const rejected = (typeof st.rejected === "number") ? st.rejected : 0;     // Rejetes (corbeille+decision)
  const deleted = (typeof st.deleted === "number") ? st.deleted : 0;        // Supprimes (audit)
  const audit = s.audit;
  const sources = s.sources || [];
  const lastCycle = s.lastCycle;

  return `
    <div class="cockpit kora-wire">
      <!-- HERO : le fact en attente de décision (cœur du produit) -->
      ${heroFact(s, pending)}

      <!-- STATS discrètes (bandeau, pas le hero template) -->
      <div class="cockpit-grid stats-row kora-stats">
        ${statCard({ icon: "article", value: total, label: "Articles", variant: "primary", onClick: "nav-facts-all", loading: s.ui?.loading && total === 0 })}
        ${statCard({ icon: "i-help", value: pending, label: "À décider", variant: "warning", onClick: "nav-hitl", loading: s.ui?.loading && pending === 0 })}
        ${statCard({ icon: "fact_check", value: approved, label: "Publiés", variant: "success", onClick: "nav-facts-approved", loading: s.ui?.loading && approved === 0 })}
        ${statCard({ icon: "edit", value: draft, label: "Brouillons", variant: "info", onClick: "nav-drafts", loading: s.ui?.loading && draft === 0 })}
        ${statCard({ icon: "i-reject", value: rejected, label: "Rejetés", variant: "danger", onClick: "nav-facts-rejected", loading: s.ui?.loading && rejected === 0 })}
        ${statCard({ icon: "i-trash", value: trash, label: "Corbeille", variant: "tertiary", onClick: "nav-trash", loading: s.ui?.loading && trash === 0 })}
        ${statCard({ icon: "i-close", value: deleted, label: "Supprimés", variant: "primary", full: true, onClick: "nav-deleted", loading: s.ui?.loading && deleted === 0 })}
      </div>

      <!-- GRAPHIQUE D'ÉVOLUTION : activité + décisions par jour -->
      ${evolutionChart(s)}

      <!-- ROW 2 : Sources + Cycle Control (le bloc "Santé système" a été retiré
           du dashboard le 2026-08-19 sur demande explicite : cette supervision
           technique (mutex, circuit LLM, mode transmission...) n'a pas sa place
           devant un compte éditeur normal -- elle vit désormais exclusivement
           dans la Console Root, réservée au développeur/administrateur système
           (voir root-console.html, panneau "Supervision", déjà complet et plus
           riche que ce qui était affiché ici). -->
      <div class="cockpit-grid system-row">
        <section class="system-section sources-section" data-nav="sources" role="button" tabindex="0" aria-label="Voir la gouvernance des sources">
          <h2 class="section-title">Sources</h2>
          <div class="source-chips">
            ${(() => {
              // Ce widget est un aperçu rapide des sources RÉELLEMENT utilisées
              // pour la collecte, pas la page de gouvernance complète (qui, elle,
              // liste tout y compris les sources suspendues/retirées -- voir
              // viewSources). Une source retirée (ex: Google News, banni le
              // 2026-08-19) n'a rien à faire ici : elle ne génère plus rien,
              // l'afficher à l'identique des sources actives serait trompeur.
              const activeOnly = sources.filter(s => (s.status || "active") === "active");
              if (!activeOnly.length) return '<span class="source-chip empty">Aucune source</span>';
              // Guinee7 isolée en fin de liste (demande : séparée des autres sources)
              const others = activeOnly.filter(s => !/guin[ée]e?\\s*7/i.test(s.name || s.id || ""));
              const guinee7 = activeOnly.filter(s => /guin[ée]e?\\s*7/i.test(s.name || s.id || ""));
              return [...others, ...guinee7].map(src => sourceStatusChip(src)).join("");
            })()}
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

// HERO wire-desk : la carte fact en attente de décision la plus récente.
// Fonction additive (n'écrase rien). Si aucun fact en attente, fallback sur le 1er fact.
function heroFact(s, pendingCount) {
  // [SUPPRESSION VOLONTAIRE — 2026-08-14] La carte « À DÉCIDER » (hero / fact en
  // attente de décision) a été retirée de toutes les interfaces sur demande utilisateur.
  // L'écran de validation HITL disparaît. Réversibilité : restaurer le corps ci-dessous
  // (variable fact, champ, title, summary, srcName, level, return du <div class="hero">…).
  return "";
}



// ============================================================
// COCKPIT COMPONENTS — Dynamiques, cliquables, temps réel
// ============================================================

function statCard({ icon, value, label, variant = "primary", onClick, trend, loading = false, error = false, full = false }) {
  const cls = `stat-card stat-${variant}${full ? " stat-full" : ""}${loading ? " loading" : ""}${error ? " error" : ""}`;
  const trendHtml = trend ? `<span class="stat-trend ${trend > 0 ? "up" : trend < 0 ? "down" : ""}">${trend > 0 ? "↑" : trend < 0 ? "↓" : "→"}${Math.abs(trend)}</span>` : "";
  const clickAttr = onClick ? `data-action="${onClick}"` : "";
  const icMap = { article: "i-facts", schedule: "i-status", fact_check: "i-check", edit: "i-edit", error: "i-close" };
  const icId = icMap[icon] || icon;
  const icSvg = `<svg class="ic" aria-hidden="true"><use href="#${icId}"></use></svg>`;
  return `
    <div class="${cls}" ${clickAttr} tabindex="0" role="button" aria-label="${label}: ${value}${trend ? ` (${trend > 0 ? "+" : ""}${trend})` : ""}">
      <span class="stat-icon">${icSvg}</span>
      <div class="stat-value">${loading ? '<span class="skeleton"></span>' : value}</div>
      <div class="stat-label">${label}${trendHtml}</div>
      ${error ? `<svg class="ic stat-error" aria-hidden="true"><use href="#i-close"></use></svg>` : ""}
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
          ${icon("i-refresh")}<span style="margin-left:6px">Lancer cycle</span>
        </button>
        <button class="btn btn-tonal" id="btnCycleForce" ${running ? "disabled" : ""} data-action="cycle-force">
          ${icon("i-spark")}<span style="margin-left:6px">Forcer (hors 24h)</span>
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
  // Fallback fiable : si l'image (réelle ou picsum) échoue, on bascule vers
  // picsum (service qui répond) plutôt que vers un placeholder vide.
  const seed = (f.fact_id || f.id || f.title || "kora").split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) % 100000;
  const fallback = `https://picsum.photos/seed/${seed}/800/450`;
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
  const facts = s.facts || [];
  // SSOT : les compteurs de filtres lisent s.stats (certifie par le backend),
  // pas un recalcul client divergeant (evite "Rejetes 2" vs cockpit "Rejetes 5").
  const st = s.stats || {};
  const counts = {
    all: (typeof st.total_facts === "number") ? st.total_facts : facts.length,
    pending: (typeof st.pending === "number") ? st.pending : 0,
    transmitted: (typeof st.transmitted === "number") ? st.transmitted : 0,
    rejected: (typeof st.rejected === "number") ? st.rejected : 0,
    drafts: (typeof st.drafts === "number") ? st.drafts : 0,
    trash: (typeof st.trash === "number") ? st.trash : 0,
  };
  const f = (Store.getFactFilter() || "all").toLowerCase();
  // Skeleton (13.2) : au tout premier chargement (avant que /api/hitl ait
  // répondu), sans ça l'état vide "Aucun article" s'affichait un instant à
  // tort — trompeur, on ne SAIT pas encore s'il y a des articles ou non.
  if (s.ui.loading && !facts.length) return factsSkeleton();
  if (!facts.length) return (s.lastCycle && s.lastCycle.result && s.lastCycle.result.status === "empty_or_stale") ? staleBox(s) : stateBox("i-check", "Aucun article à afficher", "Lance un cycle pour générer des articles à valider.", false, "Lancer un cycle", () => Store.startCycle());
  const filters = [
    ["all", "Tous", counts.all], ["pending", "En attente", counts.pending],
    ["transmitted", "Transmis", counts.transmitted], ["rejected", "Rejetés", counts.rejected],
    ["drafts", "Brouillons", counts.drafts], ["trash", "Corbeille", counts.trash],
  ];
  const filterBar = `<div class="filter-bar">${filters.map(([k, lab, n]) =>
    `<button class="filter-pill ${f === k ? "active" : ""}" data-fact-filter="${k}">${lab} <span class="pill-n">${n}</span></button>`).join("")}${helpTip("fact-filters")}</div>
    <p class="filter-note">Chaque article compte dans une seule catégorie — la somme des filtres égale le total (${counts.all}).</p>
    <div class="toolbar-row">
      <button class="btn btn-tonal" id="enterSelect">${s.selectMode ? "Annuler la sélection" : "Sélectionner"}</button>
    </div>`;
  let body;
  // B+C : filtrage par catégorie EXCLUSIVE (même logique inline que les compteurs)
  const catOf = (ft) => {
    if (ft.status === "TRASHED" || (ft.trashed_at && ft.trashed_at !== "")) {
      // Un article a la corbeille peut etre rejete (decision HITL REJECTED) :
      // il compte alors dans "Rejetes" (coherent avec s.stats.rejected).
      if (ft.rejected || ft.decision === "REJECTED" || ft.d_status === "REJECTED") return "rejected";
      return "trash";
    }
    if (ft.status === "TRANSMITTED" || ft.status === "APPROVED") return "transmitted";
    if (ft.status === "REJECTED") return "rejected";
    if (ft.status === "EDITED") return "drafts";
    return "pending";
  };
  if (f === "all") {
    body = factGroupsByDay(facts, s);
  } else if (["pending", "transmitted", "rejected", "drafts", "trash"].includes(f)) {
    body = factGroupsByDay(facts.filter(x => catOf(x) === f), s);
  } else {
    body = factGroupsByDay(facts, s);
  }
  return filterBar + body;
}
globalThis.__viewFacts = viewFacts; // DEBUG B+C
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
  // /api/hitl/trash renvoie TOUS les TRASHED (avec d_status/decision joints,
  // expres — voir list_trashed() cote backend) : au frontend de separer ceux
  // dont la decision HITL est REJECTED, qui appartiennent a "Rejetés" (deja
  // comptes ainsi dans s.stats.rejected/trash depuis le correctif 2026-08-19)
  // -- meme regle que factCategory() pour les cartes de la vue Articles. Sans
  // ce filtre, le titre "Corbeille (N)" affichait un nombre superieur au badge
  // de la barre laterale (13 vs 10), ces articles etant deja comptes ailleurs.
  const isRejectedDecision = (f) => f.rejected || f.decision === "REJECTED" || f.d_status === "REJECTED";
  const items = (s.trash || []).filter(f => !isRejectedDecision(f));
  // Bug corrigé 2026-08-19 (même famille que viewDrafts()) : "Corbeille vide"
  // s'affichait au chargement avant l'arrivée des vraies données -- ici
  // ui.loading n'aurait de toute façon pas aidé (loadTrash() ne le pilote
  // pas), d'où le flag dédié trashLoaded.
  if (!s.trashLoaded) return stateBox("i-trash", "Corbeille en chargement…", "Récupération des éléments supprimés.", true);
  if (!items.length) return stateBox("i-trash", "Corbeille vide", "Les articles supprimés restent ici 11 jours, puis sont purgés automatiquement. Restaure-les ou supprime-les définitivement.", false);
  return `<div class="section-title">Corbeille (${items.length})</div>
    <p class="muted" style="margin-bottom:16px">Restauration possible pendant 11 jours. Au-delà, suppression définitive automatique.</p>
    <div class="fact-grid">${items.map(f => trashCard(f, s)).join("")}</div>`;
}
function viewSources(s) {
  const src = s.sources || [];
  if (!src.length) return stateBox("i-sources", "Sources en chargement…", "Récupération de la liste de sources autorisées.", !!s.ui.loading);
  const isAdvanced = (s.auth && isAdvancedRole(s.auth.role));
  // Toutes les sources nationales guinéennes regroupees dans UN seul bloc parent ; internationales supprimees (demande utilisateur)
  const gn = src.filter(e => e.category === "GN_NAT");
  // e.guinea_filter (pas "guinee_filter") et e.vector (pas "vector_primary") :
  // les deux noms de champs réellement renvoyés par /api/whitelist (server.py).
  // Ligne cliquable -> détail (wireframe 7.2, gouvernance ouverte à l'UI 2026-08-19).
  const srcRow = (e) => `
    <button type="button" class="list-row src-row ${e.status !== "active" ? "src-row-suspended" : ""}" data-source-detail="${esc(e.id)}">
      <span class="meta-ic">${icon(e.guinea_filter ? "i-shield" : "i-sources")}</span>
      <div class="meta">
        <div class="name">${esc(e.name)} ${e.guinea_filter ? chip("Filtre Guinée", "warning", "i-shield") : ""} ${e.status !== "active" ? chip("Suspendue", "error") : ""}</div>
        <div class="sub">${esc(e.category)} · ${esc(e.vector)} · ${esc(e.entry_url)}</div>
      </div>
      ${icon("i-chevron-right", "src-row-chevron")}
    </button>`;
  return `<div class="section-title">Gouvernance des sources (${gn.length})</div>
    <p class="muted" style="margin-bottom:16px">Ajout et suspension gérés depuis cet écran (advanced) — chaque modification est tracée dans le journal d'audit.</p>
    ${isAdvanced ? `<button type="button" class="btn btn-primary" id="addSourceBtn" style="margin-bottom:16px">${icon("i-plus")}<span>Ajouter une source</span></button>` : ""}
    <section class="fact-group">
      <div class="group-head"><span class="group-ic">${icon("i-level1")}</span><h3 class="group-title">Sources nationales guinéennes</h3><span class="group-count">${gn.length}</span></div>
      ${gn.map(srcRow).join("") || `<div class="muted" style="padding:8px 0">Aucune source nationale.</div>`}
    </section>`;
}
function bindSources() {
  document.querySelectorAll("[data-source-detail]").forEach(b => b.onclick = () => {
    const src = (Store.state.sources || []).find(e => e.id === b.dataset.sourceDetail);
    if (src) { Store.openSheet({ type: "source-detail", source: src }); renderSheet(Store.state); }
  });
  const addBtn = document.getElementById("addSourceBtn");
  if (addBtn) addBtn.onclick = () => { Store.openSheet({ type: "add-source" }); renderSheet(Store.state); };
}
// Détail d'une source (wireframe 7.2, gouvernance ouverte à l'UI 2026-08-19) :
// advanced peut activer/suspendre depuis cet écran, tracé en audit côté serveur.
function renderSourceDetail(s) {
  const sh = s.sheet;
  const e = sh.source;
  const isAdvanced = (s.auth && isAdvancedRole(s.auth.role));
  const body = document.getElementById("sheetBody");
  const sheet = document.getElementById("sheet");
  const scrim = document.getElementById("sheetScrim");
  const domains = (e.domains || []);
  const vectors = [e.vector, e.vector_secondary].filter(Boolean).join(" · secours : ") || "—";
  const active = e.status === "active";
  body.innerHTML = `
    <div class="reject-confirm source-detail">
      <div class="reject-confirm-head">
        ${icon(e.guinea_filter ? "i-shield" : "i-sources", "ic-l")}
        <h2 class="sheet-title">${esc(e.name)}</h2>
      </div>
      <div class="source-detail-badges">
        ${chip(e.category === "GN_NAT" ? "Nationale guinéenne" : esc(e.category), "primary")}
        ${e.guinea_filter ? chip("Filtre Guinée exigé", "warning", "i-shield") : ""}
        ${chip(active ? "Active" : esc(e.status), active ? "tertiary" : "error")}
      </div>
      <div class="source-detail-field">
        <div class="source-detail-label">URL d'entrée</div>
        <div class="source-detail-value">${esc(e.entry_url)}</div>
      </div>
      <div class="source-detail-field">
        <div class="source-detail-label">Domaines autorisés (fermé)</div>
        <div class="source-detail-tags">${domains.length ? domains.map(d => chip(d)).join("") : '<span class="muted">Aucun</span>'}</div>
      </div>
      <div class="source-detail-field">
        <div class="source-detail-label">Vecteur de collecte</div>
        <div class="source-detail-value">${esc(vectors)}</div>
      </div>
      <div class="source-detail-grid">
        <div class="source-detail-field">
          <div class="source-detail-label">Responsable</div>
          <div class="source-detail-value">${esc(e.responsible || "—")}</div>
        </div>
        <div class="source-detail-field">
          <div class="source-detail-label">Version</div>
          <div class="source-detail-value">${esc(e.version || "—")}</div>
        </div>
      </div>
      ${isAdvanced ? `
        <p class="muted source-detail-footnote">${icon("i-shield")} Chaque activation/suspension est tracée dans le journal d'audit.</p>
        <button class="btn ${active ? "btn-outline" : "btn-primary"} btn-block" id="sourceToggleBtn">${active ? "Suspendre cette source" : "Réactiver cette source"}</button>
      ` : `<p class="muted source-detail-footnote">${icon("i-lock")} Réservé au rôle avancé.</p>`}
      <button class="btn btn-tonal btn-block" data-source-detail-close="1">Fermer</button>
    </div>`;
  sheet.hidden = false; scrim.hidden = false;
  const closeBtn = body.querySelector("[data-source-detail-close]");
  closeBtn.onclick = () => Store.closeSheet();
  const toggleBtn = document.getElementById("sourceToggleBtn");
  if (toggleBtn) toggleBtn.onclick = () => confirmAction({
    title: active ? "Suspendre cette source ?" : "Réactiver cette source ?",
    message: active
      ? "Kora Agent arrêtera de collecter des articles depuis cette source dès le prochain cycle."
      : "Kora Agent reprendra la collecte depuis cette source dès le prochain cycle.",
    confirmLabel: active ? "Suspendre" : "Réactiver",
    danger: active,
    onConfirm: async () => {
      try {
        await Store.updateSource(e.id, { status: active ? "suspended" : "active" });
        Store.closeSheet();
        snack(active ? "Source suspendue." : "Source réactivée.");
      } catch (err) { snack("Erreur : " + (err.message || "échec de la mise à jour.")); }
    },
  });
  closeBtn.focus();
}
// Ajout d'une source (2026-08-19) : formulaire minimal (nom, URL d'entrée,
// domaines autorisés, catégorie, vecteur, filtre Guinée). L'id est dérivé du
// nom (slug), modifiable si besoin d'un identifiant plus stable.
function renderAddSourceSheet(s) {
  const body = document.getElementById("sheetBody");
  const sheet = document.getElementById("sheet");
  const scrim = document.getElementById("sheetScrim");
  body.innerHTML = `
    <div class="reject-confirm add-source">
      <div class="reject-confirm-head">
        ${icon("i-plus", "ic-l")}
        <h2 class="sheet-title">Ajouter une source</h2>
      </div>
      <label class="form-field">
        <span>Nom éditorial</span>
        <input type="text" id="asName" placeholder="Ex : Le Nouveau Média" />
      </label>
      <label class="form-field">
        <span>URL d'entrée</span>
        <input type="text" id="asUrl" placeholder="https://exemple.com/" />
      </label>
      <label class="form-field">
        <span>Domaines autorisés (séparés par une virgule)</span>
        <input type="text" id="asDomains" placeholder="exemple.com, www.exemple.com" />
      </label>
      <div class="form-row">
        <label class="form-field">
          <span>Catégorie</span>
          <select id="asCategory"><option value="GN_NAT">Nationale guinéenne</option><option value="INTL">Internationale</option></select>
        </label>
        <label class="form-field">
          <span>Vecteur de collecte</span>
          <select id="asVector"><option value="html">HTML (page + sitemap)</option><option value="rss">RSS</option></select>
        </label>
      </div>
      <label class="mini-sheet-check"><input type="checkbox" id="asGuineeFilter" /> Filtre Guinée strict requis (médias internationaux)</label>
      <p class="muted source-detail-footnote">${icon("i-shield")} L'ajout est tracé dans le journal d'audit.</p>
      <div class="mini-sheet-actions">
        <button class="btn btn-primary" id="asSubmit">Ajouter</button>
        <button class="btn btn-ghost" id="asCancel">Annuler</button>
      </div>
    </div>`;
  sheet.hidden = false; scrim.hidden = false;
  const cancelBtn = document.getElementById("asCancel");
  cancelBtn.onclick = () => Store.closeSheet();
  document.getElementById("asSubmit").onclick = async () => {
    const name = document.getElementById("asName").value.trim();
    const entry_url = document.getElementById("asUrl").value.trim();
    const domains = document.getElementById("asDomains").value.split(",").map(d => d.trim()).filter(Boolean);
    const category = document.getElementById("asCategory").value;
    const vector_primary = document.getElementById("asVector").value;
    const guinee_filter = document.getElementById("asGuineeFilter").checked;
    if (!name || !entry_url || !domains.length) { snack("Erreur : nom, URL et au moins un domaine sont requis."); return; }
    const id = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "").slice(0, 30) || ("source" + Date.now());
    try {
      await Store.addSource({ id, name, entry_url, allowed_domains: domains, category, vector_primary,
        vector_secondary: vector_primary === "html" ? "sitemap" : "", guinee_filter });
      Store.closeSheet();
      snack("Source ajoutée.");
    } catch (err) { snack("Erreur : " + (err.message || "échec de l'ajout.")); }
  };
  document.getElementById("asName").focus();
}
function viewSettings(s) {
  const theme = Store.getTheme();
  const isAdvanced = (s.auth && isAdvancedRole(s.auth.role));
  const isAdmin = (s.auth && (s.auth.role === "admin" || isAdvancedRole(s.auth.role)));
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
    { id: "agent", ic: "i-spark", title: "Agent", sub: "Prompt système, instructions (zone sensible)" },
    { id: "transmitter", ic: "i-send", title: "Transmetteur", sub: "Mode de publication actif" },
    // Style Guide (B.1) : sorti du rail principal (revue sidebar) — outil de
    // gouvernance design occasionnel, pas un geste quotidien. data-setnav
    // spécial : ne correspond à AUCUN tiroir #drawer-styleguide, il navigue
    // directement vers /style-guide (voir override après la boucle générique
    // dans bindSettings, même précaution que auditNav/agentNav).
    { id: "styleguide", ic: "i-palette", title: "Style Guide", sub: "Référence vivante du design system" },
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
          <div class="setting-card-head"><span class="meta-ic">${icon("i-user")}</span><div class="meta"><div class="name">Profil</div><div class="sub">Photo affichée à côté de ton nom.</div></div></div>
          <div class="avatar-row">
            <span class="avatar-preview" id="avatarPreview">${s.auth?.avatarData ? `<img src="${esc(s.auth.avatarData)}" alt="">` : icon("i-user")}</span>
            <div class="avatar-actions">
              <input type="file" id="avatarFile" accept="image/*" hidden>
              <button class="btn btn-tonal btn-sm" id="avatarChange">${icon("i-image")} Changer la photo</button>
              ${s.auth?.avatarData ? `<button class="btn btn-ghost btn-sm" id="avatarRemove">Retirer</button>` : ""}
            </div>
          </div>
        </div>
        <div class="setting-card">
          <div class="setting-card-head"><span class="meta-ic">${icon("i-lock")}</span><div class="meta"><div class="name">Changer le mot de passe</div><div class="sub">8 caractères minimum.</div></div></div>
          <div class="field-row">
            <div class="field"><span>Mot de passe actuel</span><span class="pw-wrap"><input class="text-input" id="setCurPw" type="password" maxlength="64" autocomplete="current-password"><button type="button" class="pw-toggle" data-pw="setCurPw" aria-label="Afficher">${icon("i-eye")}</button></span></div>
            <div class="field"><span>Nouveau</span><span class="pw-wrap"><input class="text-input" id="setNewPw" type="password" maxlength="64" autocomplete="new-password"><button type="button" class="pw-toggle" data-pw="setNewPw" aria-label="Afficher">${icon("i-eye")}</button></span></div>
            <div class="field"><span>Confirmer</span><span class="pw-wrap"><input class="text-input" id="setNewPw2" type="password" maxlength="64" autocomplete="new-password"><button type="button" class="pw-toggle" data-pw="setNewPw2" aria-label="Afficher">${icon("i-eye")}</button></span></div>
          </div>
          <div class="actions"><button class="btn btn-primary" id="setChangePw">Mettre à jour le mot de passe</button></div>
        </div>
        <div class="setting-card" id="sec2FACard">
          <div class="setting-card-head"><span class="meta-ic">${icon("i-shield")}</span><div class="meta"><div class="name">Double authentification (2FA)</div><div class="sub">Un code temporaire à 6 chiffres en plus du mot de passe, généré par une application comme Google Authenticator.</div></div></div>
          <div id="sec2FABody"><p class="muted">Chargement…</p></div>
        </div>
        <div class="setting-card">
          <div class="setting-card-head"><span class="meta-ic">${icon("i-user")}</span><div class="meta"><div class="name">Session</div><div class="sub">Connecté en tant que ${esc(Store.state.auth.username || "—")}</div></div></div>
          <div class="actions"><button class="btn btn-ghost" id="setLogout">Se déconnecter</button></div>
        </div>
        <div class="setting-card">
          <div class="setting-card-head"><span class="meta-ic">${icon("i-help")}</span><div class="meta"><div class="name">Aide</div><div class="sub">Tour guidé et bulles d'aide contextuelle.</div></div></div>
          <div class="field-row" style="align-items:center">
            <label class="toggle-row"><input type="checkbox" id="setGuidesEnabled" ${Store.getGuidesEnabled() ? "checked" : ""}> Activer les guides contextuels</label>
          </div>
          <div class="actions"><button class="btn btn-tonal" id="setRelaunchTour">${icon("i-info")} Relancer le tour guidé</button></div>
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
            <label class="color-field">Coral <input type="color" id="setCoral" value="${esc(s.settings?.accent_coral || "#E9705D")}"></label>
            <label class="color-field">Bordeaux <input type="color" id="setBordeaux" value="${esc(s.settings?.accent_bordeaux || "#E08A84")}"></label>
            <span class="color-swatch" id="setSwatch" style="background:linear-gradient(135deg, ${esc(s.settings?.accent_coral || "#E9705D")}, ${esc(s.settings?.accent_bordeaux || "#E08A84")})"></span>
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
        <p class="muted" style="margin:0 0 14px">Gère qui fait quoi. « Propriétaire » a tous les droits, y compris gérer d'autres Propriétaires. « Avancé » gère comptes/sources/réglages. « Normal » (Éditeur) génère et valide en interne — l'envoi vers WordPress (brouillon ou officiel) est réservé à Propriétaire/Avancé, sauf délégation explicite ci-dessous.</p>
        <div class="setting-card">
          <div class="setting-card-head"><span class="meta-ic">${icon("i-users")}</span><div class="meta"><div class="name">Comptes existants</div><div class="sub">${(s.users || []).length} compte(s)</div></div></div>
          <div class="user-list" id="userList">
            ${(s.users || []).map(u => {
              const role = u.role || "normal";
              const isOwner = role === "owner";
              const viewerIsOwner = (s.auth && s.auth.role === "owner");
              // Un non-Propriétaire ne peut ni modifier ni supprimer un Propriétaire
              // (garde-fou aussi cote serveur — voir auth.py set_role/delete_user).
              const lockedForViewer = isOwner && !viewerIsOwner;
              return `<div class="user-row" data-id="${esc(u.id)}">
              <div class="meta"><div class="name">${esc(u.username)}</div><div class="sub">${esc(u.email || "—")}</div></div>
              <div class="role-edit">
                <select class="text-input role-select" data-id="${esc(u.id)}" ${lockedForViewer ? "disabled title=\"Réservé aux Propriétaires\"" : ""}>
                  <option value="normal" ${role === "normal" ? "selected" : ""}>Normal</option>
                  <option value="advanced" ${role === "advanced" ? "selected" : ""}>Avancé</option>
                  ${(viewerIsOwner || isOwner) ? `<option value="owner" ${isOwner ? "selected" : ""}>Propriétaire</option>` : ""}
                </select>
                ${role === "normal" ? `<label class="mini-sheet-check" style="margin:0" title="Autoriser l'envoi vers WordPress (brouillon et officiel)">
                  <input type="checkbox" class="wp-publish-toggle" data-id="${esc(u.id)}" ${u.wp_publish_allowed ? "checked" : ""}> Envoi WP
                </label>` : ""}
                <button class="btn btn-ghost btn-sm user-del" data-id="${esc(u.id)}" ${lockedForViewer ? "disabled title=\"Réservé aux Propriétaires\"" : ""}>Retirer</button>
              </div>
            </div>`;
            }).join("")}
          </div>
        </div>
        <div class="setting-card">
          <div class="setting-card-head"><span class="meta-ic">${icon("i-user-plus")}</span><div class="meta"><div class="name">Inviter quelqu'un</div><div class="sub">Un lien à usage unique (72h) est envoyé par email — la personne choisit elle-même son identifiant et son mot de passe en l'acceptant.</div></div></div>
          <div class="field-row">
            <div class="field"><span>Email</span><input class="text-input" id="setInviteEmail" type="email" maxlength="80" placeholder="redacteur@kora.reach"></div>
            <div class="field"><span>Rôle</span><select class="text-input" id="setInviteRole"><option value="normal" selected>Normal</option><option value="advanced">Avancé</option>${(s.auth && s.auth.role === "owner") ? `<option value="owner">Propriétaire</option>` : ""}</select></div>
          </div>
          <div class="actions"><button class="btn btn-primary" id="setInviteUser">Envoyer l'invitation</button></div>
        </div>
        <div class="setting-card">
          <div class="setting-card-head"><span class="meta-ic">${icon("i-send")}</span><div class="meta"><div class="name">Invitations</div><div class="sub">${(s.invitations || []).filter(i => i.display_status === "pending").length} en attente</div></div></div>
          <div class="user-list" id="inviteList">
            ${!(s.invitations || []).length ? `<p class="muted" style="margin:0">Aucune invitation envoyée.</p>` : s.invitations.map(inv => {
              const statusLabel = { pending: "En attente", accepted: "Acceptée", revoked: "Révoquée", expired: "Expirée" }[inv.display_status] || inv.display_status;
              const statusVariant = { pending: "warning", accepted: "tertiary", revoked: "error", expired: "error" }[inv.display_status] || "";
              return `<div class="user-row" data-token="${esc(inv.token)}">
              <div class="meta"><div class="name">${esc(inv.email)}</div><div class="sub">${ROLE_LABEL_FR[inv.role] || inv.role} · ${chip(statusLabel, statusVariant)}</div></div>
              ${inv.display_status === "pending" ? `<div class="role-edit">
                <button class="btn btn-ghost btn-sm invite-resend" data-token="${esc(inv.token)}">Renvoyer</button>
                <button class="btn btn-ghost btn-sm invite-revoke" data-token="${esc(inv.token)}">Révoquer</button>
              </div>` : ""}
            </div>`;
            }).join("")}
          </div>
        </div>
      </div>
    </aside>

    <aside class="settings-panel" id="drawer-agent" hidden>
      <div class="drawer-head"><button class="drawer-back" type="button" data-setback aria-label="Retour">${icon("i-chevron")}</button><h2>Agent <span class="role-badge role-advanced">Zone sensible</span></h2></div>
      <div class="drawer-body" id="agentPromptBody">
        <p class="muted" id="agentPromptLoading">Chargement…</p>
      </div>
    </aside>
    <aside class="settings-panel" id="drawer-transmitter" hidden>
      <div class="drawer-head"><button class="drawer-back" type="button" data-setback aria-label="Retour">${icon("i-chevron")}</button><h2>Transmetteur</h2></div>
      <div class="drawer-body" id="transmitterBody">
        <p class="muted" id="transmitterLoading">Chargement…</p>
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
// ============================================================================
// STYLE GUIDE (/style-guide) — page vivante du design system (B.1).
// Réutilise les VRAIS composants (statusBadge, statCard, classes .btn) pour
// rester fidèle : toute dérive du design y est visible avant merge.
// Accès : rôle advanced (lien discret dans Paramètres). Réf : docs/DESIGN_SYSTEM.md
// ============================================================================
// Rôle minimum requis pour accéder à une route (13.3). Routes absentes de
// cette map = accessibles à tout utilisateur authentifié.
const ROUTE_ROLE = { styleguide: "advanced" };

// ============================================================================
// RAIL — piste "A" (sobre corrigée), retenue après essai de la piste "D"
// (sections repliables + épinglés) jugée pas à la hauteur par l'utilisateur.
// Structure statique dans shell.js (3 groupes, comme le wireframe d'origine).
// Corrections de la revue conservées ici (indépendantes du choix A/D) :
// - "Sources" (config sensible, /api/whitelist en 403 pour un rôle normal)
//   porte data-role="advanced" dans shell.js -> masqué pour les autres.
// - "Style Guide" est retiré du rail -> déplacé dans Paramètres > Avancés.
// ============================================================================
// Masque "Sources" (data-role="advanced") pour un rôle non-advanced — corrige
// le dead-end 403 constaté en revue (clic -> "Sources en chargement…" indéfini).
function applyRailRoleVisibility() {
  const isAdvanced = (Store.state.auth && isAdvancedRole(Store.state.auth.role));
  $$('.rail .item[data-role="advanced"]').forEach(n => { n.hidden = !isAdvanced; });
}

// Bandeau d'erreur réseau global (13.1). s.ui.error est déjà peuplé par tous
// les appels API en échec (~14 sites dans store.js — health, hitl, audit,
// decide, retract, etc.) mais n'était affiché nulle part avant : une
// approbation/rejet en échec ne donnait ZÉRO retour visible à l'éditeur.
function renderErrorBanner(s) {
  const el = document.getElementById("errorBanner");
  const msgEl = document.getElementById("errorBannerMsg");
  if (!el || !msgEl) return;
  const err = s.ui && s.ui.error;
  el.hidden = !err;
  if (err) msgEl.textContent = err;
  const retryBtn = document.getElementById("errorBannerRetry");
  const closeBtn = document.getElementById("errorBannerClose");
  const clearError = () => Store.setState({ ui: { ...Store.state.ui, error: null } });
  if (retryBtn) retryBtn.onclick = () => { clearError(); Store.loadAll(); };
  if (closeBtn) closeBtn.onclick = clearError;
}

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

function view403() {
  return `
    <div class="state-403">
      ${icon("i-lock", "state-403-ic")}
      <h1>Accès non autorisé</h1>
      <p class="muted">Cette section nécessite le rôle Administrateur. Contacte un administrateur si tu penses qu'il s'agit d'une erreur.</p>
      <button class="btn btn-primary" data-403-home="1">${icon("i-dashboard")} Retour au tableau de bord</button>
    </div>`;
}

function viewStyleGuide(s) {
  const tok = (name, desc) => `
    <div class="sg-token">
      <span class="sg-swatch" style="background:var(${name})"></span>
      <div class="sg-token-meta"><code>${name}</code><div class="muted">${esc(desc)}</div></div>
    </div>`;
  return `
  <div class="cockpit kora-wire sg-page">
    <h1 class="section-title">Style Guide — Design System KORA</h1>
    <p class="muted">Référence vivante. Toute modification visuelle se vérifie ici avant merge. Source : <code>docs/DESIGN_SYSTEM.md</code>.</p>

    <h2 class="section-title">Couleurs — tokens sémantiques</h2>
    <div class="sg-grid">
      ${tok("--bg", "Fond application (#0E1114)")}
      ${tok("--surface", "Cartes (#171C21)")}
      ${tok("--coral", "Accent — branding configurable, défaut #E9705D")}
      ${tok("--success", "Prêt / validé (#3DD68C)")}
      ${tok("--warning", "Attention (#F5A83C)")}
      ${tok("--danger", "Rejet / suppression (#E5484D)")}
    </div>

    <h2 class="section-title">Typographie — Oswald (titres) + Source Sans 3 (corps)</h2>
    <div class="sg-type">
      <div style="font-size:28px;font-weight:700">Nombre KPI — 28px / 700</div>
      <div style="font-size:20px;font-weight:700">Titre de section — 20px / 700</div>
      <div style="font-size:16px">Corps de texte — 16px / 400, interligne 1.5</div>
      <div class="muted" style="font-size:13px">Label secondaire — 13px / 500</div>
    </div>

    <h2 class="section-title">Badges de statut <span class="muted" style="font-weight:400">(icône + texte, jamais couleur seule)</span></h2>
    <div class="sg-row">
      ${statusBadge("PENDING_REVIEW")} ${statusBadge("APPROVED")} ${statusBadge("REJECTED")} ${statusBadge("TRANSMITTED")} ${statusBadge("EDITED")} ${statusBadge("TRASHED")}
    </div>

    <h2 class="section-title">Boutons</h2>
    <div class="sg-row">
      <button class="btn btn-primary">${icon("i-send")} Primaire</button>
      <button class="btn btn-tonal">Secondaire</button>
      <button class="btn" disabled>Désactivé</button>
    </div>

    <h2 class="section-title">Carte KPI</h2>
    <div class="cockpit-grid stats-row sg-kpi">
      ${statCard({ icon: "i-help", value: 12, label: "À décider", variant: "warning" })}
    </div>
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
    const statusFr = { TRANSMITTED: "Transmis", APPROVED: "Approuvé", REJECTED: "Rejeté", EDITED: "Modifié", PENDING_REVIEW: "En attente", TRANSMISSION_FAILED: "Échec d'envoi" };
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

// Bulle de rejet (wireframe 4.3b) : au clic sur "Rejeter", propose un choix
// explicite plutôt qu'un rejet silencieux. "Mettre à la corbeille" (par défaut,
// recommandé, récupérable 11j -> decide(REJECTED), comportement déjà en place)
// vs "Supprimer définitivement" (irréversible -> deleteForever, sans détour par
// la corbeille). Évite qu'un clic sur Rejeter supprime irréversiblement par accident.
function renderRejectConfirm(s) {
  const sh = s.sheet;
  const body = document.getElementById("sheetBody");
  const sheet = document.getElementById("sheet");
  const scrim = document.getElementById("sheetScrim");
  const f = sh.fact;
  const c = f.champion || {};
  body.innerHTML = `
    <div class="reject-confirm">
      <div class="reject-confirm-head">
        ${icon("i-info", "ic-l")}
        <h2 class="sheet-title">Rejeter cet article ?</h2>
      </div>
      <p class="muted">« ${esc((c.title || "").slice(0, 90))} »</p>
      <p class="muted">Choisissez ce qu'il advient de l'article rejeté :</p>
      <div class="reject-confirm-options">
        <button class="reject-confirm-option" data-reject-choice="trash">
          <div class="reject-confirm-option-head">
            ${icon("i-trash")}
            <strong>Mettre à la corbeille</strong>
            <span class="badge badge-transmitted">recommandé</span>
          </div>
          <p class="muted">Récupérable pendant 11 jours, puis suppression automatique.</p>
        </button>
        <button class="reject-confirm-option reject-confirm-danger" data-reject-choice="delete">
          <div class="reject-confirm-option-head">
            ${icon("i-close")}
            <strong>Supprimer définitivement</strong>
          </div>
          <p class="muted">Action irréversible : l'article et son historique sont effacés immédiatement.</p>
        </button>
      </div>
      <button class="btn btn-tonal btn-block" data-reject-cancel="1">Annuler</button>
    </div>`;
  sheet.hidden = false; scrim.hidden = false;
  body.querySelector('[data-reject-choice="trash"]').onclick = () => { Store.decide(f.fact_id, "REJECTED"); Store.closeSheet(); snack("Article rejeté — envoyé à la corbeille"); };
  body.querySelector('[data-reject-choice="delete"]').onclick = () => {
    confirmAction({
      title: "Supprimer définitivement ?",
      message: "Cette action est irréversible : l'article et son historique seront effacés.",
      confirmLabel: "Supprimer",
      onConfirm: () => Store.deleteForever([f.fact_id]),
    });
  };
  const cancelBtn = body.querySelector("[data-reject-cancel]");
  if (cancelBtn) cancelBtn.onclick = () => Store.closeSheet();
  // Focus trap minimal : ramène le focus dans le panneau, Échap déjà géré globalement.
  const firstBtn = body.querySelector(".reject-confirm-option");
  if (firstBtn) firstBtn.focus();
}

// Modale de confirmation générique (remplace les window.confirm() natifs —
// audit wireframes du 2026-08-18, priorité 2 : le dialogue système casse la
// charte KORA et n'a pas la même apparence sur deux navigateurs. Un seul
// composant, réutilisé par tous les sites d'appel (suppression définitive,
// purge d'historique, retrait de compte, reset de prompt, cycle forcé...).
// Usage : confirmAction({ title, message, confirmLabel, danger, onConfirm }).
function confirmAction({ title, message, confirmLabel = "Confirmer", cancelLabel = "Annuler", danger = true, onConfirm }) {
  Store.openSheet({ type: "confirm", title, message, confirmLabel, cancelLabel, danger, onConfirm });
  renderSheet(Store.state);
}
function renderConfirmSheet(s) {
  const sh = s.sheet;
  const body = document.getElementById("sheetBody");
  const sheet = document.getElementById("sheet");
  const scrim = document.getElementById("sheetScrim");
  body.innerHTML = `
    <div class="reject-confirm">
      <div class="reject-confirm-head">
        ${icon(sh.danger ? "i-info" : "i-check", "ic-l")}
        <h2 class="sheet-title">${esc(sh.title)}</h2>
      </div>
      <p class="muted">${esc(sh.message)}</p>
      <button class="btn ${sh.danger ? "btn-danger" : "btn-primary"} btn-block" data-confirm-yes="1">${esc(sh.confirmLabel)}</button>
      <button class="btn btn-tonal btn-block" data-confirm-no="1">${esc(sh.cancelLabel)}</button>
    </div>`;
  sheet.hidden = false; scrim.hidden = false;
  const yesBtn = body.querySelector("[data-confirm-yes]");
  const noBtn = body.querySelector("[data-confirm-no]");
  yesBtn.onclick = () => { Store.closeSheet(); sh.onConfirm && sh.onConfirm(); };
  noBtn.onclick = () => Store.closeSheet();
  noBtn.focus();
}

// Vrai le temps que l'éditeur enrichi (4.4) est ouvert. Le mode édition n'est
// que de la manipulation DOM directe (pas un état du Store) ; sans ce garde,
// le poll périodique (store.js startAutoRefresh, toutes les 30s) redéclenche
// un re-render complet qui écrase le panneau d'édition et FAIT PERDRE le
// brouillon en cours de frappe. Voir le site d'appel gardé plus bas.
let _editingActive = false;
// Dernière route effectivement montée dans #view (voir garde settingsAlreadyMounted
// dans render()) — évite de reconstruire le HTML des Paramètres à chaque poll.
let _lastRenderedRoute = null;

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
const CYCLE_PATIENCE_MS = 45000; // au-delà, message de patience supplémentaire
let _wasBusy = false;
let _loaderDismissed = false;
let _cycleMsgTimer = null;
let _cycleMsgIdx = 0;
let _cycleStartedAt = 0;
function updateCycleMessage() {
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

function renderSheet(s) {
  _editingActive = false;
  const sh = s.sheet;
  const body = document.getElementById("sheetBody");
  const sheet = document.getElementById("sheet");
  const scrim = document.getElementById("sheetScrim");
  if (!sh || !body || !sheet || !scrim) { sheet.hidden = true; scrim.hidden = true; return; }
  if (sh.type === "reject-confirm") return renderRejectConfirm(s);
  if (sh.type === "confirm") return renderConfirmSheet(s);
  if (sh.type === "source-detail") return renderSourceDetail(s);
  if (sh.type === "add-source") return renderAddSourceSheet(s);
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
            ${f.forced_stale ? '<span class="tag tag-warn" style="margin-left:6px" title="Généré via Forcer (hors 24h) : cette information dépassait la fenêtre de fraîcheur normale de 24h.">Hors fenêtre 24h — forcé</span>' : ''}
          </div>
        </div>
        <button class="sheet-close" data-close="1" title="Fermer" aria-label="Fermer">${icon("i-close")}</button>
      </div>
      <p class="sheet-standfirst">${mdToHtmlInline(standfirst)}</p>
      <div class="fact-chips" style="margin:6px 0 16px">${factMeta(f, status)}</div>
      <div class="sheet-textwrap"><div class="sheet-text">${mdToHtml(bodyText || text)}</div></div>
      <div class="sheet-audit-note">${icon("i-audit")} Décision enregistrée dans l'historique · ${esc(f.n_sources || 1)} source(s) fusionnée(s)</div>
    </article>
    ${(s.auth && s.auth.role === "lecteur") ? `
    <p class="muted source-detail-footnote" style="margin:14px 0 0">${icon("i-lock")} Rôle Lecteur : consultation seule, aucune action possible sur cet article.</p>
    ` : `
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
    </div>`}`;
  sheet.hidden = false; scrim.hidden = false;

  const closeBtn = body.querySelector("[data-close]");
  if (closeBtn) closeBtn.onclick = () => Store.closeSheet();
  $$("[data-decide]", body).forEach(b => b.onclick = () => {
    // "Rejeter" ouvre la bulle de choix (corbeille vs suppression définitive)
    // au lieu de rejeter directement — évite une suppression accidentelle.
    if (b.dataset.decide === "REJECTED") { Store.openSheet({ type: "reject-confirm", fact: f }); renderSheet(Store.state); return; }
    // Droit d'envoi WordPress (§3 du plan valide 2026-08-19) : un Éditeur non
    // délégué voit son article rester "Approuvé" côté KORA (message clair
    // plutôt qu'un envoi silencieusement bloqué).
    Store.decide(f.fact_id, b.dataset.decide).then(r => {
      if (r?.transmission?.status === "SKIPPED_NO_WP_RIGHT") snack(r.transmission.detail);
    });
    Store.closeSheet();
  });
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
        <span class="rte-status" id="rteStatus">Brouillon local</span>
        <button class="sheet-close" data-close="1" title="Fermer" aria-label="Fermer">${icon("i-close")}</button>
      </div>
      <p class="muted" style="margin:10px 0 12px">Corrige le titre et le corps avant validation. La version éditée remplace l'original.</p>
      <input id="edTitle" class="edit-input" value="${esc(c.title)}">
      <div class="rte-toolbar" role="toolbar" aria-label="Mise en forme">
        <select id="rteHeading" class="rte-select" aria-label="Style de paragraphe">
          <option value="0">Paragraphe</option>
          <option value="2">Titre 2</option>
          <option value="3">Titre 3</option>
        </select>
        <span class="rte-sep" aria-hidden="true"></span>
        <button type="button" class="rte-btn" id="rteBold" title="Gras" aria-label="Gras"><strong>G</strong></button>
        <button type="button" class="rte-btn" id="rteItalic" title="Italique" aria-label="Italique"><em>I</em></button>
        <button type="button" class="rte-btn" id="rteUnderline" title="Souligné" aria-label="Souligné"><u>S</u></button>
        <span class="rte-sep" aria-hidden="true"></span>
        <button type="button" class="rte-btn" id="rteList" title="Liste à puces" aria-label="Liste à puces">${icon("i-more")}</button>
        <button type="button" class="rte-btn" id="rteLink" title="Insérer un lien" aria-label="Insérer un lien">${icon("i-source")}</button>
        <span class="rte-sep" aria-hidden="true"></span>
        <button type="button" class="rte-btn" id="rteUndo" title="Annuler (Ctrl+Z)" aria-label="Annuler">${icon("i-undo")}</button>
        <button type="button" class="rte-btn" id="rteRedo" title="Rétablir (Ctrl+Y)" aria-label="Rétablir">${icon("i-refresh")}</button>
      </div>
      <textarea id="edText" class="edit-area">${esc(text)}</textarea>
      <div class="sheet-actions">
        <button class="btn btn-tonal" id="edCancel">Annuler</button>
        <div class="sheet-actions-row">
          <button class="btn btn-tonal" id="edSaveDraft">${icon("i-edit")} Enregistrer le brouillon</button>
          <button class="btn btn-primary" id="edApprove">${icon("i-check")} Approuver</button>
        </div>
      </div>`;
    const close2 = body.querySelector("[data-close]");
    if (close2) close2.onclick = () => Store.closeSheet();
    const ta = document.getElementById("edText");
    const status = document.getElementById("rteStatus");
    const markDirty = () => { status.textContent = "Modifications non enregistrées"; status.classList.remove("rte-status-saved"); };
    ta.addEventListener("input", markDirty);
    document.getElementById("edTitle").addEventListener("input", markDirty);
    document.getElementById("rteHeading").onchange = (ev) => { rteHeading(ta, Number(ev.target.value) || 0); };
    document.getElementById("rteBold").onclick = () => rteWrapSelection(ta, "**");
    document.getElementById("rteItalic").onclick = () => rteWrapSelection(ta, "*");
    document.getElementById("rteUnderline").onclick = () => rteWrapSelection(ta, "<u>", "</u>");
    document.getElementById("rteList").onclick = () => rtePrefixLines(ta, "- ");
    document.getElementById("rteLink").onclick = () => rteLink(ta);
    // execCommand undo/redo est dépréciée mais reste fonctionnelle sur les
    // <textarea> dans les navigateurs Chromium/Firefox actuels ; Ctrl+Z natif
    // marche de toute façon sans ce bouton (fallback silencieux sinon).
    document.getElementById("rteUndo").onclick = () => { ta.focus(); try { document.execCommand("undo"); } catch (_) {} };
    document.getElementById("rteRedo").onclick = () => { ta.focus(); try { document.execCommand("redo"); } catch (_) {} };
    const getEdited = () => ({ t: document.getElementById("edTitle").value, x: ta.value });
    const edSaveDraft = document.getElementById("edSaveDraft");
    if (edSaveDraft) edSaveDraft.onclick = () => {
      const { t, x } = getEdited();
      f._edited = { title: t, text: x };
      Store.decide(f.fact_id, "EDITED", x);
      Store.closeSheet();
      snack("Brouillon enregistré");
    };
    const edApprove = document.getElementById("edApprove");
    if (edApprove) edApprove.onclick = () => {
      const { t, x } = getEdited();
      f._edited = { title: t, text: x };
      Store.decide(f.fact_id, "APPROVED", x);
      Store.closeSheet();
    };
    const edCancel = document.getElementById("edCancel");
    if (edCancel) edCancel.onclick = () => renderSheet(s);
    // Fige le panneau : le poll périodique ne doit plus l'écraser tant que
    // l'éditeur est ouvert (voir _editingActive en tête de fichier).
    _editingActive = true;
  };
  // ---- Régénération (sans re-scrape) : bouton + panneau de suggestions ----
  const regenBtn = body.querySelector("[data-regen]");
  const regenPanel = body.querySelector("#regenPanel");
  const regenChips = body.querySelector("#regenChips");
  const regenCancel = body.querySelector("[data-regen-cancel]");
  if (regenBtn && regenPanel) {
    regenBtn.onclick = async () => {
      // Garde-fou (2026-08-19, demande explicite) : "Régénérer" remplace
      // IMMÉDIATEMENT le texte affiché, sans confirmation jusqu'ici -- sur
      // un brouillon (EDITED), ça écrasait silencieusement des corrections
      // manuelles déjà faites. Sur un article déjà envoyé (APPROVED/
      // TRANSMITTED), ça changeait le texte ici sans toucher à la version
      // déjà transmise sur WordPress, ce qui n'était pas évident non plus.
      // Statut "vierge" (PENDING_REVIEW) : rien à perdre, pas de confirmation.
      if (status === "EDITED") {
        if (!window.confirm("Ce brouillon contient des corrections que tu as faites manuellement. Régénérer va les REMPLACER par un nouveau texte généré par l'IA -- tes modifications actuelles seront perdues. Continuer ?")) return;
      } else if (status === "APPROVED" || status === "TRANSMITTED") {
        if (!window.confirm("Cet article a déjà été approuvé/transmis. Le régénérer changera le texte affiché ici, mais ne republiera PAS automatiquement la version déjà envoyée sur WordPress. Continuer ?")) return;
      }
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
  const doDelete = () => {
    const ids = checks();
    if (!ids.length) return;
    confirmAction({
      title: "Supprimer ces événements ?",
      message: `${ids.length} événement(s) seront retirés de l'historique.`,
      confirmLabel: "Supprimer",
      onConfirm: async () => {
        await Store.api("/api/audit", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
        Store.loadAudit(); snack("Sélection supprimée");
      },
    });
  };
  if (delBtn) delBtn.onclick = doDelete;
  if (fbDel) fbDel.onclick = doDelete;
  const purgeAll = document.getElementById("auditPurgeAll");
  if (purgeAll) purgeAll.onclick = () => confirmAction({
    title: "Vider tout l'historique ?",
    message: "Une ligne de purge sera conservée pour la traçabilité. Action irréversible.",
    confirmLabel: "Vider",
    onConfirm: async () => {
      await Store.api("/api/audit/purge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "all" }) });
      Store.loadAudit(); snack("Historique vidé");
    },
  });
  const resetToday = document.getElementById("auditResetToday");
  if (resetToday) resetToday.onclick = () => confirmAction({
    title: "Réinitialiser l'historique du jour ?",
    message: "Les événements d'aujourd'hui seront purgés. Action irréversible.",
    confirmLabel: "Réinitialiser",
    onConfirm: async () => {
      const today = new Date().toISOString().slice(0, 10);
      await Store.api("/api/audit/purge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "day", day: today }) });
      Store.loadAudit(); snack("Historique du jour réinitialisé");
    },
  });
  view.querySelectorAll(".audit-purge-day").forEach(b => b.onclick = () => {
    const day = b.dataset.day;
    confirmAction({
      title: `Réinitialiser l'historique du ${day} ?`,
      message: "Les événements de ce jour seront purgés. Action irréversible.",
      confirmLabel: "Réinitialiser",
      onConfirm: async () => {
        await Store.api("/api/audit/purge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "day", day }) });
        Store.loadAudit(); snack(`Historique du ${day} réinitialisé`);
      },
    });
  });
}

const ROLE_LABEL_FR = { owner: "Propriétaire", advanced: "Avancé", normal: "Normal", lecteur: "Lecteur" };

function bindSettings() {
  const root = document.documentElement;
  const coral = document.getElementById("setCoral");
  const bordeaux = document.getElementById("setBordeaux");
  const swatch = document.getElementById("setSwatch");
  const preview = () => {
    const c = coral ? coral.value : "#E9705D";
    const b = bordeaux ? bordeaux.value : "#E08A84";
    if (swatch) swatch.style.background = `linear-gradient(135deg, ${c}, ${b})`;
    if (c) root.style.setProperty("--coral", c);
    if (b) root.style.setProperty("--bordeaux", b);
  };
  if (coral) coral.oninput = preview;
  if (bordeaux) bordeaux.oninput = preview;

  // ---- Aide / guides contextuels (11.3) ----
  const guidesToggle = document.getElementById("setGuidesEnabled");
  if (guidesToggle) guidesToggle.onchange = () => Store.setGuidesEnabled(guidesToggle.checked);
  const relaunchTour = document.getElementById("setRelaunchTour");
  if (relaunchTour) relaunchTour.onclick = () => { navigate("cockpit"); setTimeout(() => startTour(), 300); };

  // ---- Photo de profil (9.2) ----
  const avatarFile = document.getElementById("avatarFile");
  const avatarChange = document.getElementById("avatarChange");
  const avatarRemove = document.getElementById("avatarRemove");
  const avatarPreview = document.getElementById("avatarPreview");
  const AVATAR_MAX_BYTES = 256 * 1024;
  if (avatarChange && avatarFile) avatarChange.onclick = () => avatarFile.click();
  if (avatarFile) avatarFile.onchange = () => {
    const f = avatarFile.files && avatarFile.files[0];
    if (!f) return;
    if (f.size > AVATAR_MAX_BYTES) { snack("Image trop lourde (max 256 Ko)"); avatarFile.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      Store.saveAvatar(dataUrl).then(() => {
        // saveAvatar() met à jour s.auth.avatarData -> setState -> re-render
        // complet de la vue, qui referme tous les tiroirs Paramètres (limitation
        // générale de l'archi des tiroirs, pas spécifique à l'avatar). On rouvre
        // "Compte" pour ne pas éjecter l'utilisateur de la page qu'il modifie.
        snack("Photo de profil mise à jour");
        document.querySelector('.settings-nav-item[data-setnav="account"]')?.click();
      }).catch(e => snack("Erreur : " + e.message));
    };
    reader.readAsDataURL(f);
  };
  if (avatarRemove) avatarRemove.onclick = () => {
    Store.saveAvatar("").then(() => {
      snack("Photo de profil retirée");
      document.querySelector('.settings-nav-item[data-setnav="account"]')?.click();
    }).catch(e => snack("Erreur : " + e.message));
  };

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
  // Comptes : liste + invitation + suppression + changement de rôle (advanced+)
  const inviteBtn = document.getElementById("setInviteUser");
  if (inviteBtn) inviteBtn.onclick = async () => {
    const email = (document.getElementById("setInviteEmail")?.value || "").trim();
    const role = (document.getElementById("setInviteRole")?.value || "normal");
    if (!email || !email.includes("@")) { snack("Email invalide"); return; }
    try {
      const r = await Store.inviteUser(email, role);
      snack(r.email_sent ? "Invitation envoyée par email" : "Invitation créée (email non envoyé — SMTP non configuré, transmets le lien manuellement)");
      document.getElementById("setInviteEmail").value = "";
      await Store.loadInvitations();
      render();
    } catch (e) { snack(e.message || "Erreur"); }
  };
  view.querySelectorAll(".invite-revoke").forEach(b => b.onclick = () => {
    const token = b.dataset.token;
    confirmAction({
      title: "Révoquer cette invitation ?",
      message: "Le lien envoyé par email ne fonctionnera plus.",
      confirmLabel: "Révoquer",
      danger: true,
      onConfirm: async () => {
        try {
          await Store.revokeInvitation(token);
          snack("Invitation révoquée");
          await Store.loadInvitations();
          render();
        } catch (e) { snack(e.message || "Erreur"); }
      },
    });
  });
  view.querySelectorAll(".invite-resend").forEach(b => b.onclick = async () => {
    const token = b.dataset.token;
    try {
      await Store.resendInvitation(token);
      snack("Invitation renvoyée (nouveau lien, l'ancien ne fonctionne plus)");
      await Store.loadInvitations();
      render();
    } catch (e) { snack(e.message || "Erreur"); }
  });
  view.querySelectorAll(".role-select").forEach(sel => sel.onchange = async () => {
    const id = sel.dataset.id;
    const newRole = sel.value;
    try {
      await Store.setRole(id, newRole);
      snack("Rôle mis à jour : " + (ROLE_LABEL_FR[newRole] || newRole));
      await Store.loadUsers();
      render();
    } catch (e) {
      snack(e.message || "Erreur");
      await Store.loadUsers(); render();  // revert l'affichage au rôle réel (l'appel a échoué)
    }
  });
  view.querySelectorAll(".wp-publish-toggle").forEach(cb => cb.onchange = async () => {
    const id = cb.dataset.id;
    const allowed = cb.checked;
    try {
      await Store.setWpPublish(id, allowed);
      snack(allowed ? "Envoi WordPress autorisé pour ce compte" : "Envoi WordPress retiré pour ce compte");
      await Store.loadUsers();
    } catch (e) {
      snack(e.message || "Erreur");
      cb.checked = !allowed;  // revert l'affichage (l'appel a échoué)
    }
  });
  view.querySelectorAll(".user-del").forEach(b => b.onclick = () => {
    const id = b.dataset.id;
    confirmAction({
      title: "Retirer ce compte ?",
      message: "Ses sessions actives seront fermées immédiatement.",
      confirmLabel: "Retirer",
      onConfirm: async () => {
        try {
          await Store.deleteUser(id);
          snack("Compte retiré");
          await Store.loadUsers();
          render();
        } catch (e) { snack(e.message || "Erreur"); }
      },
    });
  });
  // ---- Navigation tiroirs (pattern Supabase) ----
  const drawers = {
    appearance: "drawer-appearance",
    account: "drawer-account",
    personalization: "drawer-personalization",
    accounts: "drawer-accounts",
    agent: "drawer-agent",
    transmitter: "drawer-transmitter",
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
  const refreshBtn = document.getElementById("auditLogRefresh");
  if (refreshBtn) refreshBtn.onclick = loadAuditLog;

  // ---- Agent : prompt système / add-on éditables (9.5, zone sensible) ----
  const escta = (t) => esc(t || "");
  const renderAgentPromptBody = (data) => {
    const body = document.getElementById("agentPromptBody");
    if (!body) return;
    const systemIsDefault = data.system_is_default;
    const systemVal = systemIsDefault ? data.default_system : data.system;
    body.innerHTML = `
      <p class="muted" style="margin:0 0 14px">Personnalise le comportement du rédacteur automatique. Toute modification est tracée dans le journal d'audit.</p>
      <div class="setting-card">
        <div class="setting-card-head"><span class="meta-ic">${icon("i-alert")}</span><div class="meta"><div class="name">Prompt système</div><div class="sub">${systemIsDefault ? "Valeur par défaut (jamais modifiée)" : "Personnalisé"}</div></div></div>
        <p class="muted" style="margin:0 0 10px">⚠️ Ce texte pilote directement la rédaction (structure, ton, garde-fous anti-invention et anti-injection). Le marqueur interne <code>2. LONGUEUR</code> doit rester présent : sa suppression ne provoque aucune erreur, mais modifie légèrement la génération section par section. En cas de doute, utilise « Réinitialiser par défaut ».</p>
        <textarea class="text-input" id="agentPromptSystem" rows="14" style="font-family:monospace;font-size:12.5px;line-height:1.5;width:100%;resize:vertical">${escta(systemVal)}</textarea>
        <div class="actions" style="margin-top:10px">
          <button class="btn btn-primary" id="agentPromptSaveSystem">Enregistrer le prompt système</button>
          <button class="btn btn-ghost" id="agentPromptResetSystem" ${systemIsDefault ? "disabled" : ""}>Réinitialiser par défaut</button>
        </div>
      </div>
      <div class="setting-card">
        <div class="setting-card-head"><span class="meta-ic">${icon("i-edit")}</span><div class="meta"><div class="name">Instructions complémentaires (add-on)</div><div class="sub">Ajoutées à la suite du prompt système, sans risque sur sa structure</div></div></div>
        <textarea class="text-input" id="agentPromptAddon" rows="6" style="width:100%;resize:vertical" placeholder="Ex. : privilégier un ton plus institutionnel sur les sujets diplomatiques…">${escta(data.addon)}</textarea>
        <div class="actions" style="margin-top:10px">
          <button class="btn btn-primary" id="agentPromptSaveAddon">Enregistrer l'add-on</button>
          <button class="btn btn-ghost" id="agentPromptResetAddon" ${data.addon ? "" : "disabled"}>Retirer l'add-on</button>
        </div>
      </div>`;
    const saveSys = document.getElementById("agentPromptSaveSystem");
    if (saveSys) saveSys.onclick = async () => {
      const val = document.getElementById("agentPromptSystem")?.value || "";
      try {
        const r = await Store.api("/api/agent-prompts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field: "system", value: val }) });
        if (r.warning) snack(r.warning); else snack("Prompt système enregistré");
        await loadAgentPrompts();
      } catch (e) { snack(e.message || "Erreur"); }
    };
    const resetSys = document.getElementById("agentPromptResetSystem");
    if (resetSys) resetSys.onclick = () => confirmAction({
      title: "Réinitialiser le prompt système ?",
      message: "Le prompt actuel sera remplacé par sa valeur par défaut.",
      confirmLabel: "Réinitialiser",
      onConfirm: async () => {
      try {
        await Store.api("/api/agent-prompts/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field: "system" }) });
        snack("Prompt système réinitialisé");
        await loadAgentPrompts();
      } catch (e) { snack(e.message || "Erreur"); }
      },
    });
    const saveAddon = document.getElementById("agentPromptSaveAddon");
    if (saveAddon) saveAddon.onclick = async () => {
      const val = document.getElementById("agentPromptAddon")?.value || "";
      try {
        await Store.api("/api/agent-prompts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field: "addon", value: val }) });
        snack("Add-on enregistré");
        await loadAgentPrompts();
      } catch (e) { snack(e.message || "Erreur"); }
    };
    const resetAddon = document.getElementById("agentPromptResetAddon");
    if (resetAddon) resetAddon.onclick = async () => {
      try {
        await Store.api("/api/agent-prompts/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field: "addon" }) });
        snack("Add-on retiré");
        await loadAgentPrompts();
      } catch (e) { snack(e.message || "Erreur"); }
    };
  };
  const loadAgentPrompts = async () => {
    const body = document.getElementById("agentPromptBody");
    if (!body) return;
    try {
      const data = await Store.api("/api/agent-prompts");
      renderAgentPromptBody(data);
    } catch (e) { body.innerHTML = '<p class="muted">Erreur de chargement (rôle avancé requis).</p>'; }
  };

  // ---- Transmetteur (9.6) : mode actif + identifiants masqués, lecture seule ----
  const MODE_LABELS = {
    dry_run: ["Démo (aucune publication réelle)", "warning", "i-info"],
    wordpress: ["WordPress", "tertiary", "i-send"],
    supabase: ["Supabase", "tertiary", "i-send"],
    postgres: ["Entrepôt Postgres local", "tertiary", "i-send"],
    both: ["WordPress + entrepôt", "tertiary", "i-send"],
  };
  const renderTransmitterBody = (data) => {
    const body = document.getElementById("transmitterBody");
    if (!body) return;
    const [label, kind, ic] = MODE_LABELS[data.mode] || [data.mode, "secondary", "i-send"];
    const creds = data.credentials || [];
    body.innerHTML = `
      <div class="transmitter-mode-card">
        <div class="source-detail-label">Mode actif</div>
        <div class="transmitter-mode-value">${icon(ic, "ic-l")}<span>${esc(label)}</span></div>
        ${chip(data.mode === "dry_run" ? "Aucune donnée publiée" : "Publication réelle active", kind)}
      </div>
      <div class="section-title" style="margin-top:20px">Identifiants configurés</div>
      <p class="muted" style="margin:0 0 8px">Valeurs jamais affichées ici. Configuration modifiable uniquement côté serveur (fichier .env).</p>
      ${creds.map(c => `
        <div class="list-row">
          <span class="meta-ic">${icon(c.configured ? "i-check" : "i-close")}</span>
          <div class="meta">
            <div class="name">${esc(c.label)}</div>
            <div class="sub">${c.configured ? "••••••••configuré" : "Non configuré"}</div>
          </div>
        </div>`).join("")}`;
  };
  const loadTransmitterStatus = async () => {
    const body = document.getElementById("transmitterBody");
    if (!body) return;
    try {
      const data = await Store.api("/api/settings/transmitter");
      renderTransmitterBody(data);
    } catch (e) { body.innerHTML = '<p class="muted">Erreur de chargement (rôle avancé requis).</p>'; }
  };

  // ---- 2FA (9.3) : activation depuis Paramètres > Compte ----
  // États successifs dans #sec2FABody : "off" -> "setup" (secret + code à
  // confirmer) -> "backup" (codes de secours affichés UNE SEULE FOIS) ->
  // "on" (statut). "on" -> "disable" (mot de passe requis) -> "off".
  let _sec2faSetup = null; // { secret, otpauth_uri } — le temps de la confirmation
  const renderSec2FA = (state, data) => {
    const body = document.getElementById("sec2FABody");
    if (!body) return;
    if (state === "off") {
      body.innerHTML = `
        <p class="muted" style="margin:0 0 12px">Non activée — n'importe qui connaissant ton mot de passe peut se connecter.</p>
        <div class="actions"><button class="btn btn-primary" id="sec2FAEnableBtn">${icon("i-shield")} Activer la 2FA</button></div>`;
      const btn = document.getElementById("sec2FAEnableBtn");
      if (btn) btn.onclick = async () => {
        try { _sec2faSetup = await Store.setup2FA(); renderSec2FA("setup"); }
        catch (e) { snack(e.message || "Erreur"); }
      };
    } else if (state === "setup") {
      const secret = _sec2faSetup?.secret || "";
      const grouped = secret.replace(/(.{4})/g, "$1 ").trim();
      body.innerHTML = `
        <p class="muted" style="margin:0 0 10px">Dans ton application d'authentification (Google Authenticator, Authy, 1Password…), ajoute un compte manuellement avec cette clé, puis saisis le code à 6 chiffres généré pour confirmer.</p>
        <div class="totp-secret" id="sec2FASecret" title="Cliquer pour copier">${esc(grouped)}</div>
        <div class="field" style="margin-top:10px"><span>Code de vérification</span><input class="text-input" id="sec2FAConfirmCode" type="text" inputmode="numeric" maxlength="6" placeholder="123456"></div>
        <div class="actions">
          <button class="btn btn-primary" id="sec2FAConfirmBtn">Confirmer et activer</button>
          <button class="btn btn-ghost" id="sec2FACancelSetup">Annuler</button>
        </div>`;
      const secretEl = document.getElementById("sec2FASecret");
      if (secretEl) secretEl.onclick = () => {
        navigator.clipboard?.writeText(secret).then(() => snack("Clé copiée")).catch(() => {});
      };
      const confirmBtn = document.getElementById("sec2FAConfirmBtn");
      if (confirmBtn) confirmBtn.onclick = async () => {
        const code = document.getElementById("sec2FAConfirmCode")?.value.trim();
        try {
          const r = await Store.confirm2FA(code);
          renderSec2FA("backup", r.backup_codes);
        } catch (e) { snack(e.message || "Erreur"); }
      };
      const cancelBtn = document.getElementById("sec2FACancelSetup");
      if (cancelBtn) cancelBtn.onclick = () => { _sec2faSetup = null; renderSec2FA("off"); };
    } else if (state === "backup") {
      body.innerHTML = `
        <p class="muted" style="margin:0 0 10px"><strong>Note bien ces codes</strong> — ils ne seront plus jamais affichés. Chacun ne fonctionne qu'une seule fois, si tu perds l'accès à ton application d'authentification.</p>
        <div class="backup-codes-grid">${data.map(c => `<code>${esc(c)}</code>`).join("")}</div>
        <div class="actions"><button class="btn btn-primary" id="sec2FAAckBackup">J'ai noté mes codes</button></div>`;
      const ack = document.getElementById("sec2FAAckBackup");
      if (ack) ack.onclick = () => { _sec2faSetup = null; snack("Double authentification activée"); loadSecurity2FA(); };
    } else if (state === "on") {
      body.innerHTML = `
        <span class="status-chip ready">${icon("i-check")} Activée</span>
        <p class="muted" style="margin:8px 0 0">${data.backup_codes_left} code(s) de secours restant(s).</p>
        <div class="actions" style="margin-top:10px"><button class="btn btn-ghost" id="sec2FADisableBtn">Désactiver</button></div>`;
      const dis = document.getElementById("sec2FADisableBtn");
      if (dis) dis.onclick = () => renderSec2FA("disable");
    } else if (state === "disable") {
      body.innerHTML = `
        <p class="muted" style="margin:0 0 10px">Confirme ton mot de passe pour désactiver la double authentification.</p>
        <div class="field"><span>Mot de passe</span><span class="pw-wrap"><input class="text-input" id="sec2FADisablePw" type="password" autocomplete="current-password"><button type="button" class="pw-toggle" data-pw="sec2FADisablePw" aria-label="Afficher le mot de passe">${icon("i-eye")}</button></span></div>
        <div class="actions">
          <button class="btn btn-danger" id="sec2FADisableConfirmBtn">Désactiver</button>
          <button class="btn btn-ghost" id="sec2FADisableCancelBtn">Annuler</button>
        </div>`;
      bindPasswordToggles(body);
      const confirmDis = document.getElementById("sec2FADisableConfirmBtn");
      if (confirmDis) confirmDis.onclick = async () => {
        const pw = document.getElementById("sec2FADisablePw")?.value || "";
        try { await Store.disable2FA(pw); snack("Double authentification désactivée"); loadSecurity2FA(); }
        catch (e) { snack(e.message || "Erreur"); }
      };
      const cancelDis = document.getElementById("sec2FADisableCancelBtn");
      if (cancelDis) cancelDis.onclick = () => loadSecurity2FA();
    }
  };
  const loadSecurity2FA = async () => {
    const body = document.getElementById("sec2FABody");
    if (!body) return;
    try {
      const st = await Store.get2FAStatus();
      renderSec2FA(st.enabled ? "on" : "off", st);
    } catch (e) { body.innerHTML = '<p class="muted">Erreur de chargement.</p>'; }
  };

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
  // Handlers spécifiques (chargement de données à l'ouverture) : DOIVENT être
  // assignés APRÈS la boucle générique ci-dessus, sinon celle-ci écrase (onclick
  // = simple assignation, un seul gagnant) l'ouverture+chargement par un simple
  // openDrawer() sans chargement — bug constaté en vérifiant §9.5 en preview live.
  const accountNav = view.querySelector('.settings-nav-item[data-setnav="account"]');
  if (accountNav) accountNav.onclick = () => { openDrawer("account"); loadSecurity2FA(); };
  const auditNav = view.querySelector('.settings-nav-item[data-setnav="auditlog"]');
  if (auditNav) auditNav.onclick = () => { openDrawer("auditlog"); loadAuditLog(); };
  const agentNav = view.querySelector('.settings-nav-item[data-setnav="agent"]');
  if (agentNav) agentNav.onclick = () => { openDrawer("agent"); loadAgentPrompts(); };
  const transmitterNav = view.querySelector('.settings-nav-item[data-setnav="transmitter"]');
  if (transmitterNav) transmitterNav.onclick = () => { openDrawer("transmitter"); loadTransmitterStatus(); };
  // Style Guide : pas un tiroir, une navigation directe vers /style-guide
  // (sorti du rail principal — outil de gouvernance design occasionnel).
  const sgNav = view.querySelector('.settings-nav-item[data-setnav="styleguide"]');
  if (sgNav) sgNav.onclick = () => navigate("styleguide");
  if (scrim) scrim.onclick = closeDrawer;
  view.querySelectorAll("[data-setback]").forEach(b => b.onclick = closeDrawer);
  // Escape ferme le tiroir settings (sans fermer la feuille HITL)
  const onKey = (e) => { if (e.key === "Escape") { const anyOpen = Object.values(drawers).some(did => { const d = document.getElementById(did); return d && !d.hidden; }); if (anyOpen) { closeDrawer(); e.stopPropagation(); } } };
  document.addEventListener("keydown", onKey);
}

let _authRendered = false;  // évite de reconstruire le formulaire à chaque setState

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
  if (!s.auth || !s.auth.loggedIn) {
    if (s.auth && s.auth.pending) { return; } // verification en cours -> pas de login
    hideBootSplash(); // auth resolue (login affiche) -> splash plus utile
    if (!_authRendered) { renderAuth("login"); }
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
    } else if (r && r.error) {
      snack("Erreur pendant la génération : " + r.error);
    }
  }
  renderErrorBanner(s);
  // Tour guidé (11.1) : une seule fois, au premier cockpit d'une session
  // authentifiée, si les guides ne sont pas désactivés. Délai court pour
  // laisser le layout se stabiliser (sinon les rects ciblés sont faux).
  if (s.auth?.loggedIn && s.route === "cockpit" && !window.__tourAutoTried && !Store.hasSeenTour() && Store.getGuidesEnabled()) {
    window.__tourAutoTried = true;
    setTimeout(() => startTour(), 900);
  }
  const view = document.getElementById("view");
  if (!view) return;
  const map = { cockpit: viewCockpit, facts: viewFacts, sources: viewSources, audit: viewAudit, drafts: viewDrafts, settings: viewSettings, trash: viewTrash, styleguide: viewStyleGuide };
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
  if (!settingsAlreadyMounted) {
    view.innerHTML = blocked ? view403() : (map[s.route] || viewCockpit)(s);
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
      facts: (typeof stats.total_facts === "number") ? stats.total_facts : ((typeof stats.articles === "number") ? stats.articles : facts.length),
      sources: (s.sources || []).length,
      drafts: (typeof stats.drafts === "number") ? stats.drafts : facts.filter(f => (f.status || "") === "EDITED").length,
      trash: (typeof stats.trash === "number") ? stats.trash : (s.trash || []).length || facts.filter(f => (f.status || "") === "DELETED").length,
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
  // Ne pas ré-exécuter renderSheet pendant l'édition (sinon le poll périodique
  // écrase le brouillon en cours) — sauf si le panneau a été fermé entre-temps
  // (ex. Échap), auquel cas il faut bien le masquer.
  if (!_editingActive || !s.sheet) {
    try { renderSheet(s); } catch (e) { console.error("renderSheet", e); }
  }
  try { if (s.route === "audit") bindAudit(); } catch (e) { console.error("bindAudit", e); }
  try { if (s.route === "sources") bindSources(); } catch (e) { console.error("bindSources", e); }
  try { if (s.route === "settings" && !settingsAlreadyMounted) bindSettings(); } catch (e) { console.error("bindSettings", e); }
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
      Store.restoreFact(b.dataset.restore).then(() => snack("Restauré")).catch(e => snack("Erreur : " + e.message));
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
    const results = r.results || [];
    const fails = results.filter(x => !x.ok).length;
    // Droit d'envoi WordPress (§3 du plan valide 2026-08-19) : distingue le
    // cas "approuvé mais pas envoyé, faute de droit" d'un échec technique.
    const skippedWp = results.filter(x => x.transmission?.status === "SKIPPED_NO_WP_RIGHT").length;
    if (skippedWp) snack(`${r.done}/${r.total} approuvé(s), en attente d'envoi WordPress (droit non délégué)`);
    else snack(fails ? `${r.done}/${r.total} publié(s) · ${fails} échec(s)` : `${r.done}/${r.total} publié(s) sur WordPress`);
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
// ============================================================================
// GUIDE UTILISATEUR / ONBOARDING CONTEXTUEL (wireframe 11.1-11.3)
// Tour guidé en spotlight sur de vrais éléments du cockpit + bandeau "vous
// semblez perdu" après inactivité + toggle dans Paramètres (Store.get/setGuidesEnabled).
// Purement client (DOM généré à la volée), aucun état backend.
// ============================================================================
const TOUR_STEPS = [
  { selectors: ["#topbarCycle"], title: "Lancer un cycle", text: "Ce bouton déclenche une collecte des sources et génère 1 article à valider. Aucune publication automatique — la validation humaine reste obligatoire." },
  { selectors: ['.stat-card[data-action="nav-hitl"]'], title: "À décider", text: "Les articles générés attendent ici ta décision : approuver, modifier ou rejeter. Rien n'est jamais publié sans validation." },
  { selectors: ["#notifBell"], title: "Notifications", text: "Retrouve ici l'historique des dernières actions (succès, erreurs, en cours) si tu en as manqué une." },
  { selectors: ['.rail .item[data-route="sources"]', "#navPlus"], title: "Sources & plus", text: "Retrouve la liste des sources surveillées et d'autres options depuis ce menu." },
];
let _tourActive = false;
function _tourFindTarget(selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.offsetParent !== null) return el; // visible (offsetParent null = display:none/hidden)
  }
  return null;
}
function _tourCleanup() {
  document.getElementById("tourOverlay")?.remove();
  document.getElementById("tourBubble")?.remove();
  _tourActive = false;
}
function _tourShowStep(i) {
  if (i >= TOUR_STEPS.length) { _tourCleanup(); Store.markTourSeen(); return; }
  const step = TOUR_STEPS[i];
  const target = _tourFindTarget(step.selectors);
  if (!target) { _tourShowStep(i + 1); return; } // cible absente à cette taille d'écran -> étape suivante
  const rect = target.getBoundingClientRect();
  let overlay = document.getElementById("tourOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "tourOverlay";
    overlay.className = "tour-overlay";
    document.body.appendChild(overlay);
  }
  const pad = 6;
  overlay.style.left = (rect.left - pad) + "px";
  overlay.style.top = (rect.top - pad) + "px";
  overlay.style.width = (rect.width + pad * 2) + "px";
  overlay.style.height = (rect.height + pad * 2) + "px";

  document.getElementById("tourBubble")?.remove();
  const bubble = document.createElement("div");
  bubble.id = "tourBubble";
  bubble.className = "tour-bubble";
  bubble.setAttribute("role", "dialog");
  bubble.setAttribute("aria-label", step.title);
  const spaceBelow = window.innerHeight - rect.bottom;
  bubble.style.top = (spaceBelow > 160 ? rect.bottom + 12 : Math.max(12, rect.top - 152)) + "px";
  bubble.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - 320)) + "px";
  bubble.innerHTML = `
    <div class="tour-bubble-title">${icon("i-info")} ${esc(step.title)}</div>
    <p class="tour-bubble-text">${esc(step.text)}</p>
    <div class="tour-bubble-foot">
      <span class="tour-bubble-progress">${i + 1} / ${TOUR_STEPS.length}</span>
      <div class="tour-bubble-actions">
        <button class="btn btn-tonal btn-sm" id="tourSkip">Passer</button>
        <button class="btn btn-primary btn-sm" id="tourNext">${i + 1 === TOUR_STEPS.length ? "Terminer" : "Suivant"}</button>
      </div>
    </div>`;
  document.body.appendChild(bubble);
  document.getElementById("tourSkip").onclick = () => { _tourCleanup(); Store.markTourSeen(); };
  document.getElementById("tourNext").onclick = () => _tourShowStep(i + 1);
}
function startTour() {
  if (_tourActive) return;
  _tourActive = true;
  _tourShowStep(0);
}
// Bulles d'aide contextuelle (11.2) — icône "?" à côté d'un élément dont le
// sens n'est pas évident, texte en langage simple. Délégation d'événement
// (bindée UNE fois) plutôt que rebindée à chaque render : marche pour tout
// nouveau help-tip ajouté n'importe où dans l'app sans câblage supplémentaire.
const HELP_TEXTS = {
  "fact-filters": "En attente : article généré, pas encore décidé. Transmis : publié. Rejetés/Corbeille : retirés (récupérables 11 jours). Brouillons : en cours de correction.",
};
function helpTip(id) {
  return `<span class="help-tip"><button type="button" class="help-tip-btn" data-help="${id}" aria-label="Aide">${icon("i-help")}</button></span>`;
}
if (!window.__helpTipBound) {
  window.__helpTipBound = true;
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".help-tip-btn");
    document.querySelectorAll(".help-tip-pop").forEach(p => p.remove());
    if (!btn) return;
    e.stopPropagation();
    const pop = document.createElement("div");
    pop.className = "help-tip-pop";
    pop.textContent = HELP_TEXTS[btn.dataset.help] || "";
    btn.parentElement.appendChild(pop);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.querySelectorAll(".help-tip-pop").forEach(p => p.remove()); });
}

// "Vous semblez perdu" (11.3) : bandeau discret après une période d'inactivité
// (aucun clic), une seule fois par session — pas naggy, jamais si les guides
// sont désactivés ou si le tour est en cours.
let _idleTimer = null;
function _resetIdleTimer() {
  clearTimeout(_idleTimer);
  if (!Store.getGuidesEnabled() || sessionStorage.getItem("kora-idle-banner-shown") === "1") return;
  _idleTimer = setTimeout(() => {
    if (_tourActive) return;
    sessionStorage.setItem("kora-idle-banner-shown", "1");
    const banner = document.getElementById("idleBanner");
    if (banner) banner.hidden = false;
  }, 45000);
}

// ============================================================================
// CENTRE DE NOTIFICATIONS (wireframe 10.2) — historique des toasts (snack()),
// groupé par récence, avec badge de compteur non-lus sur la cloche.
//
// État volontairement LOCAL à ce module, PAS dans le Store réactif : un
// setState() ici déclencherait un re-render complet de toute l'app à chaque
// snack() (40 sites d'appel), ce qui refermerait n'importe quel tiroir/panneau
// ouvert ailleurs (constaté : sauvegarde d'un avatar refermant le panneau
// Paramètres > Compte qu'elle venait elle-même de rouvrir). Le centre de
// notifications est un pur affichage dérivé, sans impact sur le reste de l'UI.
// ============================================================================
const NOTIF_MAX = 30; // borne mémoire, les plus anciennes sont évincées
let _notifications = [];
function _notifGroupLabel(ts) {
  const d = new Date(ts), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return "Aujourd'hui";
  const diffDays = Math.floor((now - d) / 86400000);
  return diffDays <= 7 ? "Cette semaine" : "Plus ancien";
}
function renderNotifCenter() {
  const countEl = document.getElementById("notifCount");
  const bodyEl = document.getElementById("notifBody");
  if (!countEl || !bodyEl) return;
  const unread = _notifications.filter(n => !n.read).length;
  countEl.hidden = unread === 0;
  countEl.textContent = unread > 9 ? "9+" : String(unread);
  if (!_notifications.length) {
    bodyEl.innerHTML = `<p class="muted notif-empty">Aucune notification pour l'instant.</p>`;
    return;
  }
  const groups = {};
  for (const n of _notifications) {
    const g = _notifGroupLabel(n.ts);
    (groups[g] = groups[g] || []).push(n);
  }
  const iconFor = (t) => t === "error" ? icon("i-close", "notif-ic-error") : t === "success" ? icon("i-check", "notif-ic-success") : icon("i-info");
  bodyEl.innerHTML = Object.entries(groups).map(([label, items]) => `
    <div class="notif-group-label">${esc(label)}</div>
    ${items.map(n => `
      <div class="notif-item ${n.read ? "" : "notif-unread"}">
        ${iconFor(n.type)}
        <span class="notif-item-msg">${esc(n.message)}</span>
      </div>`).join("")}
  `).join("");
}
function markAllNotificationsRead() {
  _notifications = _notifications.map(n => ({ ...n, read: true }));
  renderNotifCenter();
}
function snack(msg) {
  const sn = document.getElementById("snackbar");
  if (sn) {
    sn.textContent = msg; sn.hidden = false;
    // Duree adaptee a la longueur du message (2026-08-20) : les 2.6s fixes
    // suffisent pour "Erreur : ..." mais pas pour un message explicatif
    // complet (ex. fin de cycle "rien de neuf", plusieurs phrases) --
    // laisse le temps de lire sans pour autant bloquer indefiniment.
    const dur = Math.max(2600, Math.min(9000, msg.length * 60));
    clearTimeout(sn._t); sn._t = setTimeout(() => sn.hidden = true, dur);
  }
  // Type inféré du message : la convention existante préfixe déjà les erreurs
  // par "Erreur" (40 sites d'appel) — pas besoin de réécrire chaque appelant.
  const type = /^erreur/i.test(msg) ? "error" : "success";
  _notifications = [{ id: "n" + Date.now() + Math.random().toString(36).slice(2, 6), type, message: msg, ts: Date.now(), read: false }, ..._notifications].slice(0, NOTIF_MAX);
  try { renderNotifCenter(); } catch (e) { /* jamais bloquant */ }
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
    const facts = Store.state.facts || [];
    let f = facts.find(x => x.fact_id === card.dataset.fact);
    if (!f && (card.dataset.fact || "").startsWith("idx")) {
      const i = parseInt(card.dataset.fact.slice(3), 10);
      f = facts[i];
    }
    if (!f && card.dataset.index) f = facts[parseInt(card.dataset.index, 10)];
    if (f) { Store.openSheet({ type: "fact", fact: f }); renderSheet(Store.state); }
  });
  // Filtres de la vue Articles : chaque pill filtre la liste SAUF "Corbeille"
  // qui pointe vers LA page corbeille unique (meme route/representation que la
  // sidebar) -> un seul endroit pour la corbeille, proprietes identiques.
  $$("[data-fact-filter]").forEach(n => n.onclick = () => {
    const f = n.dataset.factFilter;
    if (f === "trash") { navigate("trash"); return; }
    Store.setFactFilter(f);
    const sc = document.getElementById("railScrim");
    if (sc) sc.hidden = true;
  });
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

  // ---- Bandeau "vous semblez perdu" (11.3) ----
  const idleBanner = document.getElementById("idleBanner");
  const idleRelaunch = document.getElementById("idleBannerRelaunch");
  const idleClose = document.getElementById("idleBannerClose");
  if (idleRelaunch) idleRelaunch.onclick = () => { if (idleBanner) idleBanner.hidden = true; startTour(); };
  if (idleClose) idleClose.onclick = () => { if (idleBanner) idleBanner.hidden = true; };
  if (!window.__idleListenersBound) {
    window.__idleListenersBound = true;
    ["click", "keydown"].forEach(ev => document.addEventListener(ev, _resetIdleTimer, { passive: true }));
    _resetIdleTimer();
  }

  const btn403 = document.querySelector("[data-403-home]");
  if (btn403) btn403.onclick = () => navigate("cockpit");

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
      if (willOpen) renderNotifCenter();
    };
  }
  if (notifMarkAll) notifMarkAll.onclick = markAllNotificationsRead;
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
        if (Store.state.ui.cycleBusy) { snack("Génération en cours…"); return; }
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
    if (Store.state.ui.cycleBusy) { snack("Génération en cours…"); return; }
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
  // Widget "à décider" du rail retiré (redondant avec la carte KPI "À décider"
  // du Cockpit, qui fait déjà la même chose et est déjà enseignée dans le
  // tour guidé — cf. shell.js).

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
        if (Store.state.ui.cycleBusy) { snack("Génération en cours…"); return; }
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
  if (overflowMenu) overflowMenu.querySelectorAll(".overflow-item").forEach(it => it.onclick = () => { navigate(it.dataset.route); closeOverflow(); });

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
      else if (action === "nav-facts-rejected") { Store.setFactFilter("REJECTED"); navigate("facts"); }
      else if (action === "nav-hitl") { Store.setFactFilter("PENDING_REVIEW"); navigate("facts"); }
      else if (action === "nav-drafts") { Store.setFactFilter("EDITED"); navigate("facts"); }
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

  // Call cockpit binding
  bindCockpitEvents();

  // NOTE: tout le chargement initial (settings, health, auth, routing, auto-refresh)
  // est fait UNE FOIS dans boot() (appelé par main.js), PAS ici. Sinon bind()
  // (exécuté à chaque render) relancerait des setState -> render -> bind = boucle.
}

// Boot unique : chargement initial + auth + routing + auto-refresh.
// Appelé UNE FOIS par main.js, jamais depuis render()/bind().
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
  const resetToken = new URLSearchParams(location.search).get("reset");
  const inviteToken = new URLSearchParams(location.search).get("invite");
  Store.loadSettings().then(() => {
    if (resetToken) {
      renderAuth("reset", resetToken);
    } else if (inviteToken) {
      renderAuth("invite", inviteToken);
    } else {
      Store.checkAuth().then((ok) => {
        if (!ok) { renderAuth("login"); return; }
        Store.loadAll();   // charge facts/health/sources dès la session validée
        // Reconnexion au cycle en cours côté serveur (2026-08-19) : un cycle
        // tourne dans un thread détaché, jamais affecté par un F5 — mais SANS
        // ceci, l'écran de progression ("Article X sur Y") disparaissait au
        // rechargement, donnant l'impression trompeuse que la génération avait
        // été interrompue alors qu'elle continuait réellement en arrière-plan.
        // Seul le bouton "Interrompre" doit pouvoir stopper un cycle.
        Store.resumeCycleWatch();
        // Comptes/invitations : role deja connu ici (checkAuth resolu) -> pas
        // d'appel pour rien (403 systematique) pour lecteur/editeur.
        if (Store.state.auth && isAdvancedRole(Store.state.auth.role)) {
          Store.loadUsers().catch(() => {});
          Store.loadInvitations().catch(() => {});
        }
      });
    }
  });
  // Routing : on lit la route depuis le HASH (#facts, #trash, #cockpit...) en
  // priorite, sinon depuis le pathname. Ainsi un refresh ramene SUR LA MEME PAGE
  // que celle ou l'utilisateur se trouvait (persistance de la vue au reload).
  const hashRoute = (location.hash || "").replace(/^#/, "").trim();
  const r = hashRoute
    || (location.pathname.replace(/^\/kora-v2/, "") || "/").split("/")[1]
    || "cockpit";
  if (Store.state.route !== r) Store.state.route = r;
  Store.loadHealth();
  Store.loadSettings();
  Store.loadTrash().catch(() => {});
  // loadUsers/loadInvitations : voir le .then(checkAuth) ci-dessus, appelés
  // une fois le rôle connu (pas ici -> Store.state.auth n'est pas encore
  // résolu à ce point synchrone, le garde-fou serait toujours faux).
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
    else if (mode === "mfa") overlay.innerHTML = viewMfa();
    else if (mode === "forgot") overlay.innerHTML = viewForgot();
    else if (mode === "reset") overlay.innerHTML = viewReset(token);
    else if (mode === "invite") overlay.innerHTML = viewInvite(token);
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

// 9.3 — étape 2 de la connexion : code TOTP (mot de passe déjà validé,
// pas encore de session). Accepte aussi un code de secours à usage unique
// (mêmes 10 caractères alphanumériques, distingués du code à 6 chiffres
// uniquement côté serveur — l'input reste unique côté écran, plus simple).
function viewMfa() {
  return `<div class="auth-screen">
    <div class="auth-card">
      <div class="auth-mark">${icon("i-lock")}</div>
      <h1 class="auth-title">Vérification en 2 étapes</h1>
      <p class="auth-sub">Saisis le code à 6 chiffres de ton application d'authentification (ou l'un de tes codes de secours).</p>
      <form id="authForm" autocomplete="off">
        <label class="auth-field">Code
          <input class="text-input" id="authMfaCode" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" maxlength="10" autofocus>
        </label>
        <button class="btn btn-primary btn-block" id="authSubmit" type="submit">Vérifier</button>
      </form>
      <button class="auth-link" id="authMfaBack">Retour à la connexion</button>
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

// Écran public "définir mon mot de passe" (Phase 2, §4 du plan valide
// 2026-08-19) — ouvert depuis le lien reçu par email, AUCUNE session requise
// (la personne invitée n'a pas encore de compte). L'email/rôle affichés sont
// chargés de façon asynchrone (bindAuth) : le formulaire est visible tout de
// suite, avec un espace réservé le temps que /invitations/check réponde.
function viewInvite(token) {
  return `<div class="auth-screen">
    <div class="auth-card">
      <div class="auth-mark">${icon("i-spark")}</div>
      <h1 class="auth-title">Créer ton compte</h1>
      <p class="auth-sub" id="inviteInfo">Vérification de l'invitation…</p>
      <form id="authForm" autocomplete="off">
        <label class="auth-field">Identifiant
          <input class="text-input" id="inviteUser" type="text" autocomplete="username" placeholder="prenom.nom">
        </label>
        <label class="auth-field">Mot de passe
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
        <button class="btn btn-primary btn-block" id="authSubmit" type="submit">Créer mon compte</button>
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
        const result = await Store.login(u, p);
        clearTimeout(safety);
        if (result.mfaRequired) {
          // 2FA (9.3) : mot de passe correct, code TOTP encore requis —
          // bascule vers l'écran de code au lieu de fermer l'overlay
          // (aucune session n'a encore été créée côté serveur).
          renderAuth("mfa", result.mfaToken, true);
          return;
        }
        overlay.hidden = true;
        document.getElementById("app").style.display = "";
        if (Store.state.auth && isAdvancedRole(Store.state.auth.role)) {
          Store.loadUsers().catch(() => {});
          Store.loadInvitations().catch(() => {});
        }
        Store.loadSettings();
        render();
        snack("Connecté");
      } catch (ex) { setErr(ex.message || "Erreur de connexion"); }
      finally { clearTimeout(safety); if (btn) { btn.disabled = false; btn.textContent = orig; } }
    };
  } else if (mode === "mfa") {
    const back = overlay.querySelector("#authMfaBack");
    if (back) back.onclick = () => renderAuth("login", null, true);
    if (form) form.onsubmit = async (e) => {
      e.preventDefault();
      setErr("");
      const codeInput = overlay.querySelector("#authMfaCode");
      const code = (codeInput?.value || "").trim();
      const btn = overlay.querySelector("#authSubmit");
      const orig = btn ? btn.textContent : "";
      try {
        if (btn) { btn.disabled = true; btn.textContent = "Vérification…"; }
        const r = await Store.verifyLoginTotp(token, code);
        overlay.hidden = true;
        document.getElementById("app").style.display = "";
        if (Store.state.auth && isAdvancedRole(Store.state.auth.role)) {
          Store.loadUsers().catch(() => {});
          Store.loadInvitations().catch(() => {});
        }
        Store.loadSettings();
        render();
        snack(r.backupCodeUsed ? `Connecté (code de secours — ${r.backupCodesLeft} restant(s))` : "Connecté");
      } catch (ex) { setErr(ex.message || "Erreur de vérification"); }
      finally { if (btn) { btn.disabled = false; btn.textContent = orig; } }
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
  } else if (mode === "invite") {
    const ROLE_LABEL_INVITE = { owner: "Propriétaire", advanced: "Administrateur", normal: "Éditeur", lecteur: "Lecteur" };
    const info = overlay.querySelector("#inviteInfo");
    const submitBtn = overlay.querySelector("#authSubmit");
    Store.checkInvite(token).then(inv => {
      if (info) info.textContent = `Tu es invité(e) à rejoindre KORA en tant que ${ROLE_LABEL_INVITE[inv.role] || inv.role} (${inv.email}).`;
    }).catch(ex => {
      if (info) info.textContent = "";
      setErr(ex.message || "Invitation invalide ou expirée");
      if (submitBtn) submitBtn.disabled = true;
    });
    if (form) form.onsubmit = async (e) => {
      e.preventDefault();
      setErr("");
      const uname = overlay.querySelector("#inviteUser").value.trim();
      const n1 = overlay.querySelector("#authNew").value;
      const n2 = overlay.querySelector("#authNew2").value;
      if (uname.length < 3) { setErr("Identifiant 3 caractères minimum"); return; }
      if (n1.length < 8) { setErr("Le mot de passe doit faire au moins 8 caractères"); return; }
      if (n1 !== n2) { setErr("Les mots de passe ne correspondent pas"); return; }
      try {
        await Store.acceptInvite(token, uname, n1);
        history.replaceState(null, "", location.pathname);
        setErr("");
        renderAuth("login", null, true);
        snack("Compte créé. Connecte-toi.");
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

// Masque le splash de boot statique (index.html) une fois l'app reellement
// montee. Appelé par render() des que l'auth est resolue (plus de pending),
// que ce soit l'app ou le formulaire de login -> aucun artefact au refresh.
function hideBootSplash() {
  const el = document.getElementById("bootSplash");
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

export const App = { render, snack, bind, boot, navigate, openFact, renderAuth, showApp };
