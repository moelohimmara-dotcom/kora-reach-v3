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
  const allSrc = s.sources || [];
  if (!allSrc.length) return stateBox("i-sources", "Sources en chargement…", "Récupération de la liste de sources autorisées.", !!s.ui.loading);
  const isAdvanced = (s.auth && isAdvancedRole(s.auth.role));
  // Filtre/recherche (suggestion audit UX Sources, 2026-08-24) : nom,
  // catégorie, vecteur ou URL -- même esprit que la recherche du Journal
  // d'audit déjà existante (audit.js).
  const q = (s.sourceFilter?.q || "").trim().toLowerCase();
  const src = q ? allSrc.filter(e =>
    (e.name || "").toLowerCase().includes(q) || (e.entry_url || "").toLowerCase().includes(q) ||
    (e.category || "").toLowerCase().includes(q) || (e.vector || "").toLowerCase().includes(q)
  ) : allSrc;
  const gn = src.filter(e => e.category === "GN_NAT");
  const intl = src.filter(e => e.category !== "GN_NAT");
  // e.guinea_filter (pas "guinee_filter") et e.vector (pas "vector_primary") :
  // les deux noms de champs réellement renvoyés par /api/whitelist (server.py).
  // Ligne cliquable -> détail (wireframe 7.2, gouvernance ouverte à l'UI 2026-08-19).
  // F10 (audit UX Sources, 2026-08-24) : sans aria-label explicite, le nom
  // accessible du bouton se calculait par accumulation de TOUT le texte
  // visible (nom + catégorie + vecteur + URL COMPLÈTE) -- un lecteur
  // d'écran énonçait l'URL lettre par lettre à chaque ligne, alourdissant
  // la navigation sur 13-17 sources. aria-label concis (nom + statut) pour
  // le NOM, le sous-titre (catégorie/vecteur/URL) reste accessible en tant
  // que DESCRIPTION (aria-describedby) -- toujours disponible, mais plus
  // annoncé en priorité sur chaque ligne.
  const srcRow = (e) => {
    const subId = "srcsub-" + esc(e.id);
    const label = esc(e.name) + (e.status !== "active" ? `, ${SOURCE_STATUS_FR[e.status] || e.status}` : "");
    return `
    <button type="button" class="list-row src-row ${e.status !== "active" ? "src-row-suspended" : ""}" data-source-detail="${esc(e.id)}" aria-label="${label}" aria-describedby="${subId}">
      <span class="meta-ic">${icon(e.guinea_filter ? "i-shield" : "i-sources")}</span>
      <div class="meta">
        <div class="name">${esc(e.name)} ${e.guinea_filter ? chip("Filtre Guinée", "warning", "i-shield") : ""} ${_statusChip(e.status)}</div>
        <div class="sub" id="${subId}">${esc(e.category)} · ${esc(e.vector)} · ${esc(e.entry_url)}</div>
      </div>
      ${icon("i-chevron-right", "src-row-chevron")}
    </button>`;
  };
  // Le titre reflète le TOTAL (allSrc), pas la liste filtrée -- doit
  // rester aligné avec le badge de la sidebar (B1) même filtre actif.
  return `<div class="section-title">Gouvernance des sources (${allSrc.length})</div>
    <p class="muted" style="margin-bottom:16px">Ajout et suspension gérés depuis cet écran (advanced) — chaque modification est tracée dans le journal d'audit.</p>
    <label style="display:block;max-width:360px;margin-bottom:16px">
      <span class="sr-only">Rechercher une source</span>
      <input class="text-input" type="search" id="sourceSearch" placeholder="Rechercher (nom, URL, catégorie, vecteur)…" value="${esc(s.sourceFilter?.q || "")}">
    </label>
    ${isAdvanced ? `<button type="button" class="btn btn-primary" id="addSourceBtn" style="margin-bottom:16px">${icon("i-plus")}<span>Ajouter une source</span></button>` : ""}
    <section class="fact-group">
      <div class="group-head"><span class="group-ic">${icon("i-level1")}</span><h3 class="group-title">Sources nationales guinéennes</h3><span class="group-count">${gn.length}</span></div>
      ${gn.map(srcRow).join("") || `<div class="muted" style="padding:8px 0">${q ? "Aucun résultat." : "Aucune source nationale."}</div>`}
    </section>
    <section class="fact-group" style="margin-top:20px">
      <div class="group-head"><span class="group-ic">${icon("i-sources")}</span><h3 class="group-title">Sources internationales</h3><span class="group-count">${intl.length}</span></div>
      ${intl.map(srcRow).join("") || `<div class="muted" style="padding:8px 0">${q ? "Aucun résultat." : "Aucune source internationale."}</div>`}
    </section>`;
}

function bindSources() {
  document.querySelectorAll("[data-source-detail]").forEach(b => b.onclick = () => {
    const src = (Store.state.sources || []).find(e => e.id === b.dataset.sourceDetail);
    if (src) { Store.openSheet({ type: "source-detail", source: src }); renderSheet(Store.state); }
  });
  const addBtn = document.getElementById("addSourceBtn");
  if (addBtn) addBtn.onclick = () => { Store.openSheet({ type: "add-source" }); renderSheet(Store.state); };
  // Filtre/recherche (suggestion audit UX Sources, 2026-08-24) : même
  // pattern que la recherche du Journal d'audit (audit.js, oninput direct).
  const search = document.getElementById("sourceSearch");
  if (search) search.oninput = () => Store.setState({ sourceFilter: { q: search.value } });
}

export { viewSources, bindSources, SOURCE_STATUS_FR };
