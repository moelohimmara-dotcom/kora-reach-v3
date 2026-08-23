/* ============================================================
   KORA — views/cockpit.js : Tableau de bord (page d'accueil). Extrait de
   app.js le 22/08/2026 (refacto plan étape 4).
   ============================================================ */
import { esc, icon } from "../utils.js";

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
  // Articles = active_facts (2026-08-23, ADR-0005, tâche T4, demande
  // explicite : "les articles déjà transmis ... ne doivent plus figurer
  // dans le comptage normal") -- exclut TRANSMITTED, qui a désormais son
  // propre espace (page Publiés). Repli sur total_facts pour compatibilité
  // si un backend pas encore redéployé ne renvoie pas encore active_facts.
  const total = (typeof st.active_facts === "number") ? st.active_facts
    : (typeof st.total_facts === "number") ? st.total_facts : ((typeof st.articles === "number") ? st.articles : 0);
  const pending = (typeof st.pending === "number") ? st.pending : 0;        // A decider (PENDING_REVIEW)
  // Publiés = published_count (2026-08-23, unification demandée : la tuile
  // dashboard et le badge de navigation "Publiés" affichaient chacun un
  // nombre différent -- l'un depuis l'entrepôt Postgres [status='published'
  // uniquement, table articles], l'autre depuis hitl_facts [TRANSMITTED,
  // brouillon+publié]. published_count (backend, hitl_facts.status=
  // TRANSMITTED exactement) est désormais la SEULE source pour ce libellé,
  // cohérente avec la page Publiés (viewPublished()) qui utilise le même filtre.
  const approved = (typeof st.published_count === "number") ? st.published_count
    : (typeof st.published === "number") ? st.published : 0;
  const draft = (typeof st.drafts === "number") ? st.drafts : 0;            // Brouillons (EDITED)
  const trash = (typeof st.trash === "number") ? st.trash : 0;             // Corbeille (TRASHED)
  const rejected = (typeof st.rejected === "number") ? st.rejected : 0;     // Rejetes (corbeille+decision)
  const deleted = (typeof st.deleted === "number") ? st.deleted : 0;        // Supprimes (audit)
  const audit = s.audit;
  const sources = Array.isArray(s.sources) ? s.sources : [];               // garde stricte (2026-08-23) : sources doit etre un tableau
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

export { viewCockpit, statCard };
