/* ============================================================
   KORA — views/sources.js : page Gouvernance des sources. Extrait de
   app.js le 22/08/2026 (refacto plan étape 4). Le détail/ajout de source
   (panneaux #sheet) vit dans sheet.js — cohérence avec renderSheet().
   ============================================================ */
import { Store } from "../store.js";
import { esc, icon, chip, isAdvancedRole, stateBox } from "../utils.js";
import { renderSheet } from "../sheet.js";

// B1/B2/B3 (audit UX Sources, 2026-08-24) : les sources internationales
// (BBC Afrique, France24, RFI Guinée, Google News Guinée) étaient
// totalement absentes de cette page ("internationales supprimees (demande
// utilisateur)" -- décision passée), mais restaient comptées dans le badge
// de la sidebar (s.sources.length, toutes catégories confondues) -> écart
// de comptage jamais expliqué (13 affichées vs 17 dans le badge), ET ces
// 4 sources devenaient totalement ingérables depuis l'UI (aucune
// suspension/réactivation possible sans accès direct à la base) alors
// qu'elles alimentent réellement des articles (cf. incident Dar-es-Salam,
// 2026-08-24, où plusieurs sources fusionnées provenaient d'agences
// internationales). Confirmé avec l'utilisateur : section séparée
// (respecte l'esprit "distinctes des nationales" de la demande d'origine)
// plutôt que fusionnées dans la même liste, mais bien visibles et
// gérables. Le total de la page reflète désormais TOUTES les sources,
// donc s'aligne naturellement avec le badge de la sidebar.
const SOURCE_STATUS_FR = { suspended: "Suspendue", retired: "Retirée" };
function _statusChip(status) {
  if (status === "active") return "";
  return chip(SOURCE_STATUS_FR[status] || esc(status), "error");
}

function viewSources(s) {
  const src = s.sources || [];
  if (!src.length) return stateBox("i-sources", "Sources en chargement…", "Récupération de la liste de sources autorisées.", !!s.ui.loading);
  const isAdvanced = (s.auth && isAdvancedRole(s.auth.role));
  const gn = src.filter(e => e.category === "GN_NAT");
  const intl = src.filter(e => e.category !== "GN_NAT");
  // e.guinea_filter (pas "guinee_filter") et e.vector (pas "vector_primary") :
  // les deux noms de champs réellement renvoyés par /api/whitelist (server.py).
  // Ligne cliquable -> détail (wireframe 7.2, gouvernance ouverte à l'UI 2026-08-19).
  const srcRow = (e) => `
    <button type="button" class="list-row src-row ${e.status !== "active" ? "src-row-suspended" : ""}" data-source-detail="${esc(e.id)}">
      <span class="meta-ic">${icon(e.guinea_filter ? "i-shield" : "i-sources")}</span>
      <div class="meta">
        <div class="name">${esc(e.name)} ${e.guinea_filter ? chip("Filtre Guinée", "warning", "i-shield") : ""} ${_statusChip(e.status)}</div>
        <div class="sub">${esc(e.category)} · ${esc(e.vector)} · ${esc(e.entry_url)}</div>
      </div>
      ${icon("i-chevron-right", "src-row-chevron")}
    </button>`;
  return `<div class="section-title">Gouvernance des sources (${src.length})</div>
    <p class="muted" style="margin-bottom:16px">Ajout et suspension gérés depuis cet écran (advanced) — chaque modification est tracée dans le journal d'audit.</p>
    ${isAdvanced ? `<button type="button" class="btn btn-primary" id="addSourceBtn" style="margin-bottom:16px">${icon("i-plus")}<span>Ajouter une source</span></button>` : ""}
    <section class="fact-group">
      <div class="group-head"><span class="group-ic">${icon("i-level1")}</span><h3 class="group-title">Sources nationales guinéennes</h3><span class="group-count">${gn.length}</span></div>
      ${gn.map(srcRow).join("") || `<div class="muted" style="padding:8px 0">Aucune source nationale.</div>`}
    </section>
    <section class="fact-group" style="margin-top:20px">
      <div class="group-head"><span class="group-ic">${icon("i-sources")}</span><h3 class="group-title">Sources internationales</h3><span class="group-count">${intl.length}</span></div>
      ${intl.map(srcRow).join("") || `<div class="muted" style="padding:8px 0">Aucune source internationale.</div>`}
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

export { viewSources, bindSources, SOURCE_STATUS_FR };
