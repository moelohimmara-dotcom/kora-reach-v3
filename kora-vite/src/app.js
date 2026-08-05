/* ============================================================
   KORA — App (vues, routing, tiroir HITL). Module ES.
   ============================================================ */
import { Store } from "./store.js";

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => root ? Array.from(root.querySelectorAll(sel)) : [];
const esc = (s) => String(s == null ? "" : s).replace(/[&<>`"'$]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "`": "&#96;", '"': "&quot;", "'": "&#39;", "$": "&#36;" }[c]));
// Markdown léger sécurisé : échappe d'abord, puis **gras** -> <strong>, *ital* -> <em>, ##/### titre -> <h*> (pour le corps), \n -> <br>
const mdToHtml = (s) => {
  let h = esc(s);
  // titres de section (## Décryptage etc.) -> uniquement dans le corps, pas dans le chapeau
  h = h.replace(/^###\s+(.+)$/gm, "<h3 class=\"sheet-h3\">$1</h3>")
       .replace(/^##\s+(.+)$/gm, "<h2 class=\"sheet-h2\">$1</h2>")
       .replace(/^#\s+(.+)$/gm, "<strong class=\"sheet-h1\">$1</strong>");
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
       .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return h;
};
const mdToHtmlInline = (s) => {
  // version chapeau : pas de titres de section, gras/italique seulement
  let h = esc(s);
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
       .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return h;
};
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
        <div class="fact-chips">${factMeta(f, undefined, true)}</div>
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
  const isAdvanced = (s.auth && s.auth.role === "advanced");
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
    { id: "sources", ic: "i-sources", title: "Sources", sub: "Liste whitelist (config projet)" },
  ] : [];
  const railItem = (it) => `<button class="settings-nav-item" data-setnav="${it.id}">
      <span class="meta-ic">${icon(it.ic)}</span>
      <div class="meta"><div class="name">${esc(it.title)}</div><div class="sub">${esc(it.sub)}</div></div>
      <span class="chev">${icon("i-chevron-right")}</span>
    </button>`;
  return `<div class="section-title">Paramètres</div>
    <p class="muted" style="margin-bottom:16px">Réglages de l'interface, du compte et du projet ${esc(s.app_name || "KORA Agent")}.</p>
    <div class="settings-layout">
      <nav class="settings-rail">
        <div class="settings-rail-group">Généraux</div>
        ${generalItems.map(railItem).join("")}
        ${advancedItems.length ? `<div class="settings-rail-group">Avancés</div>${advancedItems.map(railItem).join("")}` : ""}
      </nav>
      <div class="settings-hint muted">Sélectionne une catégorie pour ouvrir ses réglages.</div>
    </div>

    <!-- Tiroirs (drawers) par catégorie -->
    <div class="drawer-scrim" id="setDrawerScrim" hidden></div>

    <aside class="drawer" id="drawer-appearance" hidden>
      <div class="drawer-head"><button class="drawer-close" data-setclose="1" aria-label="Fermer">${icon("i-close")}</button><h2>Apparence</h2></div>
      <div class="drawer-body">
        <div class="setting-row theme-opt ${theme === "dark" ? "active" : ""}" data-theme-btn="dark"><span class="meta-ic">${icon("i-moon")}</span><div class="meta"><div class="name">Sombre</div><div class="sub">Fond sombre (par défaut)</div></div>${theme === "dark" ? `<span class="check">${icon("i-check")}</span>` : ""}</div>
        <div class="setting-row theme-opt ${theme === "light" ? "active" : ""}" data-theme-btn="light"><span class="meta-ic">${icon("i-sun")}</span><div class="meta"><div class="name">Clair</div><div class="sub">Fond clair</div></div>${theme === "light" ? `<span class="check">${icon("i-check")}</span>` : ""}</div>
        <div class="setting-row theme-opt ${theme === "cacao" ? "active" : ""}" data-theme-btn="cacao"><span class="meta-ic">${icon("i-palette")}</span><div class="meta"><div class="name">Cacao</div><div class="sub">Chocolat chaud</div></div>${theme === "cacao" ? `<span class="check">${icon("i-check")}</span>` : ""}</div>
      </div>
    </aside>

    <aside class="drawer" id="drawer-account" hidden>
      <div class="drawer-head"><button class="drawer-close" data-setclose="1" aria-label="Fermer">${icon("i-close")}</button><h2>Compte</h2></div>
      <div class="drawer-body">
        <div class="setting-row setting-col">
          <div class="meta" style="width:100%">
            <div class="name">Changer le mot de passe</div>
            <div class="sub">8 caractères minimum.</div>
            <div class="labels-grid">
              <label class="label-field label-full">Mot de passe actuel<input class="text-input" id="setCurPw" type="password" maxlength="64" autocomplete="current-password"></label>
              <label class="label-field">Nouveau<input class="text-input" id="setNewPw" type="password" maxlength="64" autocomplete="new-password"></label>
              <label class="label-field">Confirmer<input class="text-input" id="setNewPw2" type="password" maxlength="64" autocomplete="new-password"></label>
            </div>
            <button class="btn btn-outline" id="setChangePw" style="margin-top:10px">Mettre à jour le mot de passe</button>
          </div>
        </div>
        <div class="setting-row">
          <span class="meta-ic">${icon("i-user")}</span>
          <div class="meta"><div class="name">Session</div><div class="sub">Connecté en tant que ${esc(Store.state.auth.username || "—")}</div></div>
          <button class="btn btn-ghost" id="setLogout">Se déconnecter</button>
        </div>
      </div>
    </aside>

    ${isAdvanced ? `<aside class="drawer" id="drawer-personalization" hidden>
      <div class="drawer-head"><button class="drawer-close" data-setclose="1" aria-label="Fermer">${icon("i-close")}</button><h2>Personnalisation</h2></div>
      <div class="drawer-body">
        <div class="setting-row setting-col">
          <div class="meta" style="width:100%">
            <div class="name">Nom de l'application</div>
            <div class="sub">Affiché dans la barre supérieure et le rail.</div>
            <input class="text-input" id="setAppName" type="text" maxlength="40" value="${esc(s.settings?.app_name || "KORA Agent")}" placeholder="KORA Agent">
          </div>
        </div>
        <div class="setting-row setting-col">
          <div class="meta" style="width:100%">
            <div class="name">Logo</div>
            <div class="sub">Image carrée (SVG/PNG, ≤ 256 Ko). Laisse vide pour l'icône par défaut.</div>
            <div class="logo-edit">
              <div class="logo-preview" id="setLogoPreview">${s.settings?.has_logo ? `<img src="${esc(s.settings.logo_data)}" alt="">` : icon("i-spark")}</div>
              <div class="logo-actions">
                <label class="btn btn-ghost btn-sm"><input type="file" id="setLogoFile" accept="image/*" hidden>Choisir un fichier</label>
                <button class="btn btn-ghost btn-sm" id="setLogoClear" ${s.settings?.has_logo ? "" : "disabled"}>Retirer</button>
              </div>
            </div>
          </div>
        </div>
        <div class="setting-row setting-col">
          <div class="meta" style="width:100%">
            <div class="name">Couleurs d'accent</div>
            <div class="sub">Coral (principal) et Bordeaux (secondaire). Aperçu en direct.</div>
            <div class="color-edit">
              <label class="color-field">Coral <input type="color" id="setCoral" value="${esc(s.settings?.accent_coral || "#F2A98C")}"></label>
              <label class="color-field">Bordeaux <input type="color" id="setBordeaux" value="${esc(s.settings?.accent_bordeaux || "#E08A84")}"></label>
              <span class="color-swatch" id="setSwatch" style="background:linear-gradient(135deg, ${esc(s.settings?.accent_coral || "#F2A98C")}, ${esc(s.settings?.accent_bordeaux || "#E08A84")})"></span>
            </div>
          </div>
        </div>
        <div class="setting-row setting-col">
          <div class="meta" style="width:100%">
            <div class="name">Libellés de l'interface</div>
            <div class="sub">Personnalise le nom des onglets et le sous-titre (white-label).</div>
            <div class="labels-grid">
              <label class="label-field">Tableau de bord<input class="text-input" id="setLblCockpit" type="text" maxlength="30" value="${esc(s.settings?.label_cockpit || "Tableau de bord")}"></label>
              <label class="label-field">Articles<input class="text-input" id="setLblFacts" type="text" maxlength="30" value="${esc(s.settings?.label_facts || "Articles")}"></label>
              <label class="label-field">Validation<input class="text-input" id="setLblHitl" type="text" maxlength="30" value="${esc(s.settings?.label_hitl || "Validation")}"></label>
              <label class="label-field">Sources<input class="text-input" id="setLblSources" type="text" maxlength="30" value="${esc(s.settings?.label_sources || "Sources")}"></label>
              <label class="label-field">Brouillons<input class="text-input" id="setLblDrafts" type="text" maxlength="30" value="${esc(s.settings?.label_drafts || "Brouillons")}"></label>
              <label class="label-field">Historique<input class="text-input" id="setLblAudit" type="text" maxlength="30" value="${esc(s.settings?.label_audit || "Historique")}"></label>
              <label class="label-field label-full">Sous-titre (À propos)<input class="text-input" id="setTagline" type="text" maxlength="30" value="${esc(s.settings?.app_tagline || "Poste de pilotage de l'agent éditorial")}"></label>
            </div>
          </div>
        </div>
        <button class="btn btn-primary" id="setSave" style="margin-top:12px">Enregistrer les modifications</button>
      </div>
    </aside>

    <aside class="drawer" id="drawer-accounts" hidden>
      <div class="drawer-head"><button class="drawer-close" data-setclose="1" aria-label="Fermer">${icon("i-close")}</button><h2>Comptes & habilitations</h2></div>
      <div class="drawer-body">
        <p class="muted" style="margin-bottom:12px">Gère qui fait quoi. Le rôle « Avancé » donne accès à tous les réglages, la gestion des comptes et les actions sensibles. Le rôle « Normal » est limité à la génération et à la validation.</p>
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
        <div class="setting-row setting-col">
          <div class="meta" style="width:100%">
            <div class="name">Ajouter un compte</div>
            <div class="sub">Identifiant (3+), email, mot de passe (8+), rôle.</div>
            <div class="labels-grid">
              <label class="label-field">Identifiant<input class="text-input" id="setNewUser" type="text" maxlength="40" placeholder="redacteur1"></label>
              <label class="label-field">Email<input class="text-input" id="setNewEmail" type="email" maxlength="80" placeholder="redacteur@kora.reach"></label>
              <label class="label-field">Mot de passe<input class="text-input" id="setNewUserPw" type="password" maxlength="64" placeholder="••••••••" autocomplete="new-password"></label>
              <label class="label-field">Rôle<select class="text-input" id="setNewUserRole"><option value="normal" selected>Normal</option><option value="advanced">Avancé</option></select></label>
            </div>
            <button class="btn btn-outline" id="setAddUser" style="margin-top:10px">Créer le compte</button>
          </div>
        </div>
      </div>
    </aside>

    <aside class="drawer" id="drawer-sources" hidden>
      <div class="drawer-head"><button class="drawer-close" data-setclose="1" aria-label="Fermer">${icon("i-close")}</button><h2>Sources</h2></div>
      <div class="drawer-body" id="setSourcesBody">
        <div class="muted">Chargement des sources…</div>
      </div>
    </aside>` : ""}
  </div>`;
}
function viewAudit(s) {
  const data = s.audit || {};
  const days = data.days || [];
  const total = data.total || 0;
  if (!days.length) return stateBox("i-audit", "Historique vide", "Aucune activité enregistrée pour l'instant. Lance un cycle pour peupler l'historique.", false);
  const ACTION_FR = { GENERE: "Générés", TRANSMIS: "Transmis", APPROUVE: "Approuvés", REJETE: "Rejetés", MODIFIE: "Modifiés", SUPPRIME: "Supprimés", CYCLE: "Cycles", PURGE: "Purges" };
  const ACTION_CLS = { GENERE: "primary", TRANSMIS: "tertiary", APPROUVE: "tertiary", REJETE: "error", MODIFIE: "warning", SUPPRIME: "error", CYCLE: "secondary", PURGE: "secondary" };
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
    if (parts.length) return parts.join(" · ");
    const clean = d.replace(/\s+/g, " ").trim();
    return clean.length > 90 ? clean.slice(0, 87).replace(/\s+\S*$/, "") + "…" : clean;
  };
  const evRow = (ev) => `
    <div class="list-row audit-row" data-ev="${esc(ev.id)}">
      <input type="checkbox" class="audit-check" data-id="${esc(ev.id)}" aria-label="Sélectionner">
      <span class="meta-ic">${icon(ev.kind === "reject" ? "i-reject" : ev.kind === "edit" ? "i-edit" : "i-check")}</span>
      <div class="meta">
        <div class="name">${esc(auditLabel(ev))} ${transitionBadge(ev)}</div>
        <div class="sub">${esc(auditSub(ev))}</div>
      </div>
      <div class="sub audit-time">${esc((ev.ts || "").slice(0, 19).replace("T", " "))}</div>
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
      <div class="audit-events">${day.events.map(evRow).join("")}</div>
    </section>`;
  return `<div class="section-title">Historique <span class="muted">(${total} événement(s))</span></div>
    <div class="audit-toolbar">
      <button class="btn btn-ghost btn-sm" id="auditSelAll">Tout sélectionner</button>
      <button class="btn btn-ghost btn-sm" id="auditSelNone">Désélectionner</button>
      <button class="btn btn-danger btn-sm" id="auditDelSel" disabled>Supprimer la sélection</button>
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
    const lblIds = { cockpit: "setLblCockpit", facts: "setLblFacts", hitl: "setLblHitl", sources: "setLblSources", drafts: "setLblDrafts", audit: "setLblAudit" };
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
    const lblIds = { cockpit: "setLblCockpit", facts: "setLblFacts", hitl: "setLblHitl", sources: "setLblSources", drafts: "setLblDrafts", audit: "setLblAudit" };
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
      App.renderAuth("login");
    } catch (e) { snack(e.message || "Erreur"); }
  };
  const logoutBtn = document.getElementById("setLogout");
  if (logoutBtn) logoutBtn.onclick = async () => {
    await Store.logout();
    App.renderAuth("login");
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
    sources: "drawer-sources",
  };
  const scrim = document.getElementById("setDrawerScrim");
  const openDrawer = (id) => {
    Object.values(drawers).forEach(did => { const d = document.getElementById(did); if (d) d.hidden = true; });
    const d = document.getElementById(drawers[id]);
    if (!d) return;
    d.hidden = false;
    if (scrim) scrim.hidden = false;
    view.querySelectorAll(".settings-nav-item").forEach(n => n.classList.toggle("active", n.dataset.setnav === id));
    if (id === "sources") loadSourcesDrawer();
  };
  const closeDrawer = () => {
    Object.values(drawers).forEach(did => { const d = document.getElementById(did); if (d) d.hidden = true; });
    if (scrim) scrim.hidden = true;
    view.querySelectorAll(".settings-nav-item").forEach(n => n.classList.remove("active"));
  };
  view.querySelectorAll(".settings-nav-item").forEach(n => n.onclick = () => openDrawer(n.dataset.setnav));
  if (scrim) scrim.onclick = closeDrawer;
  view.querySelectorAll("[data-setclose]").forEach(b => b.onclick = closeDrawer);
  // Escape ferme le tiroir settings (sans fermer la feuille HITL)
  const onKey = (e) => { if (e.key === "Escape") { const anyOpen = Object.values(drawers).some(did => { const d = document.getElementById(did); return d && !d.hidden; }); if (anyOpen) { closeDrawer(); e.stopPropagation(); } } };
  document.addEventListener("keydown", onKey);
  async function loadSourcesDrawer() {
    const body = document.getElementById("setSourcesBody");
    if (!body) return;
    try {
      const srcs = await Store.api("/api/whitelist");
      if (!Array.isArray(srcs) || !srcs.length) { body.innerHTML = '<div class="muted">Aucune source configurée.</div>'; return; }
      body.innerHTML = srcs.map(s => `<div class="source-row">
        <div class="meta"><div class="name">${esc(s.name)}</div><div class="sub">${esc(s.category || "")} · ${esc((s.domains||[]).join(", ") || s.entry_url || "")}</div></div>
        <span class="chip chip-${s.status === "active" ? "tertiary" : "pending"}">${esc(s.status || "actif")}</span>
      </div>`).join("");
    } catch (e) { body.innerHTML = '<div class="muted">Chargement impossible (accès réservé).</div>'; }
  }
}

function render() {
  const s = Store.state;
  const agent = document.getElementById("agentStatus");
  if (agent) agent.innerHTML = s.ui.busy
    ? `<span class="dot dot-busy"></span><span>${s.ui.overlay || "Agent occupé…"}</span>`
    : `<span class="dot dot-ok"></span><span>prêt</span>`;
  const view = document.getElementById("view");
  if (!view) return;
  const map = { cockpit: viewCockpit, facts: viewFacts, hitl: viewHITL, sources: viewSources, audit: viewAudit, drafts: viewDrafts, settings: viewSettings };
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
  if (sa) sa.onclick = () => { if (sa.dataset.force) Store.startCycle(1, true); else if (sa.textContent.trim() === "Réessayer") location.reload(); else Store.seed(); };
  const cs = document.getElementById("cockpitSeed");
  if (cs) cs.onclick = () => Store.seed();
  // Verrou visuel : on ne peut PAS relancer un cycle tant que le précédent n'est pas fini.
  const tc = document.getElementById("topbarCycle");
  if (tc) tc.disabled = !!s.ui.busy;
  const fabCycle = document.querySelector('.fab-action[data-act="cycle"]');
  if (fabCycle) fabCycle.style.pointerEvents = s.ui.busy ? "none" : "";
  const gl = document.getElementById("globalLoader");
  if (gl) { if (s.ui.busy) { gl.hidden = false; const t = document.getElementById("globalLoaderText"); if (t) t.textContent = s.ui.overlay || "Agent en cours…"; } else gl.hidden = true; }
  try { renderSheet(s); } catch (e) { console.error("renderSheet", e); }
  try { if (s.route === "audit") bindAudit(); } catch (e) { console.error("bindAudit", e); }
  try { if (s.route === "settings") bindSettings(); } catch (e) { console.error("bindSettings", e); }
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
  // --- Auth au démarrage : reset (?reset=), sinon check session ---
  // Charge les settings (nom/logo) AVANT de rendre l'écran de connexion
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
  const r = location.pathname.split("/")[1] || "cockpit";
  navigate(["cockpit", "facts", "hitl", "sources", "audit", "drafts", "settings"].includes(r) ? r : "cockpit");
  Store.loadHealth();
  Store.loadSettings();
  Store.loadUsers().catch(() => {});  // peupler la liste des comptes (si session)
}

// ---- Écrans d'authentification (overlay plein écran) ----
function renderAuth(mode, token) {
  const overlay = document.getElementById("authOverlay");
  if (!overlay) return;
  if (mode === "login") overlay.innerHTML = viewLogin();
  else if (mode === "forgot") overlay.innerHTML = viewForgot();
  else if (mode === "reset") overlay.innerHTML = viewReset(token);
  overlay.hidden = false;
  document.getElementById("app").style.display = "none";
  bindAuth(mode, token);
  if (mode === "login") {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => alignWordmark()).catch(() => {});
    }
    alignWordmark();
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
          <input class="text-input" id="authPass" type="password" autocomplete="current-password" placeholder="••••••••">
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
          <input class="text-input" id="authNew" type="password" autocomplete="new-password" placeholder="••••••••">
        </label>
        <label class="auth-field">Confirmer
          <input class="text-input" id="authNew2" type="password" autocomplete="new-password" placeholder="••••••••">
        </label>
        <button class="btn btn-primary btn-block" id="authSubmit" type="submit">Réinitialiser</button>
      </form>
      <div class="auth-err" id="authErr"></div>
    </div>
  </div>`;
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
      try {
        await Store.login(u, p);
        overlay.hidden = true;
        document.getElementById("app").style.display = "";
        Store.loadUsers().catch(() => {});
        Store.loadSettings();
        render();
        snack("Connecté");
      } catch (ex) { setErr(ex.message || "Erreur de connexion"); }
    };
  } else if (mode === "forgot") {
    const back = overlay.querySelector("#authBack");
    if (back) back.onclick = () => renderAuth("login");
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
        renderAuth("login");
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

export const App = { render, snack, bind, navigate, openFact, renderAuth, showApp };
