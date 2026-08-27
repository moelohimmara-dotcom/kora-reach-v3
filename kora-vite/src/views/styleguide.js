/* ============================================================
   KORA — views/styleguide.js : page Style Guide (référence vivante du
   design system, réservée au rôle avancé). Extrait de app.js le
   22/08/2026 (refacto plan étape 4).

   REFONTE COMPLÈTE (2026-08-27, demande explicite : "je la trouve vraiment
   très très mal en point... fais une refonte complète, adapte-la comme
   dans les autres applications en production"). Constat du test réel
   (navigation live, pas lecture de code) : la page ne montrait que 6
   couleurs, 4 échantillons de texte, 6 badges, 3 boutons et 1 carte KPI --
   une fraction de ce que le design system réel contient (échelle
   typographique complète, espacements, rayons, 52 icônes, variantes de
   boutons, champs de formulaire...), le tout en simple liste à puces sans
   la moindre carte, sans thème interactif, et surtout sans aucun moyen de
   revenir à Paramètres autrement que le bouton "précédent" du navigateur.
   Refaite pour : (1) réutiliser EXACTEMENT les mêmes composants que le
   reste de KORA (.setting-card, .list-row, .theme-card...) -- une page qui
   documente le design system doit d'abord en être la vitrine la plus
   fidèle, pas une page à part avec ses propres règles ; (2) couvrir
   l'intégralité des tokens réels (couleurs, typo, espacement, rayons,
   élévation, icônes) au lieu d'un sous-ensemble arbitraire ; (3) rendre le
   sélecteur de thème RÉELLEMENT interactif (réutilise .theme-card +
   data-theme-btn, déjà câblé globalement dans app.js) -- une "référence
   vivante" doit permettre de voir les trois thèmes s'appliquer en direct,
   pas seulement en lire les noms de variables.
   ============================================================ */
import { esc, statusBadge, icon, chip, pageBackButton } from "../utils.js";
import { statCard } from "./dashboard.js";
import { Store } from "../store.js";

function viewStyleGuide(s) {
  const theme = Store.getTheme();

  const tok = (name, desc) => `
    <div class="sg-token">
      <span class="sg-swatch" style="background:var(${name})"></span>
      <div class="sg-token-meta"><code>${name}</code><div class="muted">${esc(desc)}</div></div>
    </div>`;

  const typeRow = (cls, label, tokenName, sizePx, weight) => `
    <div class="sg-type-row">
      <div class="${cls}">${esc(label)}</div>
      <code class="sg-type-spec">${tokenName} · ${sizePx} / ${weight}</code>
    </div>`;

  const spaceRow = (name, px) => `
    <div class="sg-scale-row">
      <code>${name}</code>
      <span class="sg-space-bar" style="width:${px}px"></span>
      <span class="muted">${px}px</span>
    </div>`;

  const radiusCell = (name, label) => `
    <div class="sg-radius-cell">
      <span class="sg-radius-box" style="border-radius:var(${name})"></span>
      <code>${name}</code>
      <span class="muted">${esc(label)}</span>
    </div>`;

  const elevCell = (name, label) => `
    <div class="sg-elev-cell">
      <span class="sg-elev-box" style="box-shadow:var(${name})"></span>
      <code>${name}</code>
      <span class="muted">${esc(label)}</span>
    </div>`;

  return `
  <div class="dashboard kora-wire sg-page">
    ${pageBackButton("settings")}
    <h1 class="section-title">Style Guide — Design System KORA</h1>
    <p class="muted" style="margin:0 0 20px">Référence vivante : chaque élément ci-dessous est le composant RÉEL utilisé dans l'application, pas une image ou une approximation. Toute modification visuelle se vérifie ici avant merge. Source : <code>docs/DESIGN_SYSTEM.md</code>.</p>

    <div class="setting-card">
      <div class="setting-card-head"><span class="meta-ic">${icon("i-palette")}</span><div class="meta"><div class="name">Thème actif</div><div class="sub">Change le thème pour voir tous les composants ci-dessous se mettre à jour instantanément</div></div></div>
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

    <div class="setting-card">
      <div class="setting-card-head"><span class="meta-ic">${icon("i-brush")}</span><div class="meta"><div class="name">Couleurs — tokens sémantiques</div><div class="sub">Jamais de couleur en dur dans un composant : toujours l'un de ces tokens</div></div></div>
      <div class="sg-grid">
        ${tok("--bg", "Fond application")}
        ${tok("--surface", "Cartes")}
        ${tok("--coral", "Accent — branding configurable, défaut #E9705D")}
        ${tok("--success", "Prêt / validé (#3DD68C)")}
        ${tok("--warning", "Attention (#F5A83C)")}
        ${tok("--danger", "Rejet / suppression (#E5484D)")}
      </div>
    </div>

    <div class="setting-card">
      <div class="setting-card-head"><span class="meta-ic">${icon("i-edit")}</span><div class="meta"><div class="name">Typographie</div><div class="sub">Oswald (titres) + Source Sans 3 (corps) — échelle complète</div></div></div>
      <div class="sg-type-list">
        ${typeRow("sg-type-display", "Display", "--t-display", "≈57px", "800")}
        ${typeRow("sg-type-headline", "Headline", "--t-headline", "32px", "700")}
        ${typeRow("sg-type-title-lg", "Titre large", "--t-title-lg", "22px", "700")}
        ${typeRow("sg-type-title", "Titre de section", "--t-title", "16px", "700")}
        ${typeRow("sg-type-body", "Corps de texte", "--t-body", "16px", "400 · interligne 1.5")}
        ${typeRow("sg-type-label", "Label", "--t-label", "14px", "700")}
        ${typeRow("sg-type-label-sm", "Label secondaire", "--t-label-sm", "12px", "500")}
        ${typeRow("sg-type-label-xs", "Label minuscule", "--t-label-xs", "11px", "600")}
      </div>
    </div>

    <div class="setting-card">
      <div class="setting-card-head"><span class="meta-ic">${icon("i-more")}</span><div class="meta"><div class="name">Espacements</div><div class="sub">Grille 4dp — jamais de marge/padding en dur, toujours un de ces tokens</div></div></div>
      <div class="sg-scale-list">
        ${spaceRow("--space-1", 4)}
        ${spaceRow("--space-2", 8)}
        ${spaceRow("--space-3", 12)}
        ${spaceRow("--space-4", 16)}
        ${spaceRow("--space-5", 24)}
        ${spaceRow("--space-6", 32)}
        ${spaceRow("--space-7", 48)}
        ${spaceRow("--space-8", 64)}
      </div>
    </div>

    <div class="setting-card">
      <div class="setting-card-head"><span class="meta-ic">${icon("i-fullscreen")}</span><div class="meta"><div class="name">Rayons &amp; élévation</div><div class="sub">Arrondis et profondeur des surfaces</div></div></div>
      <div class="sg-radius-grid">
        ${radiusCell("--radius-xs", "Petits éléments")}
        ${radiusCell("--radius-sm", "Champs, puces")}
        ${radiusCell("--radius-md", "Boutons")}
        ${radiusCell("--radius-lg", "Cartes")}
        ${radiusCell("--radius-xl", "Panneaux, tiroirs")}
        ${radiusCell("--radius-pill", "Pastilles, avatars")}
      </div>
      <div class="sg-elev-grid">
        ${elevCell("--elev-1", "Carte au repos")}
        ${elevCell("--elev-2", "Panneau surélevé")}
        ${elevCell("--elev-3", "Élément flottant")}
      </div>
    </div>

    <div class="setting-card">
      <div class="setting-card-head"><span class="meta-ic">${icon("i-spark")}</span><div class="meta"><div class="name">Icônes</div><div class="sub">Sprite Lucide — trait 2px, 24×24, couleur héritée (currentColor)</div></div></div>
      <div class="sg-icon-grid" id="sgIconGrid"><p class="muted">Chargement du catalogue…</p></div>
    </div>

    <div class="setting-card">
      <div class="setting-card-head"><span class="meta-ic">${icon("i-check")}</span><div class="meta"><div class="name">Boutons</div><div class="sub">Une seule action primaire par écran — le reste en secondaire ou fantôme</div></div></div>
      <div class="sg-row">
        <button class="btn btn-primary">${icon("i-send")} Primaire</button>
        <button class="btn btn-tonal">Secondaire</button>
        <button class="btn btn-ghost">Fantôme</button>
        <button class="btn btn-danger">${icon("i-trash")} Destructif</button>
        <button class="btn btn-danger-ghost">Destructif (fantôme)</button>
        <button class="btn" disabled>Désactivé</button>
      </div>
      <div class="sg-row" style="margin-top:10px">
        <button class="btn btn-tonal btn-sm">${icon("i-lock")} Petit format</button>
      </div>
    </div>

    <div class="setting-card">
      <div class="setting-card-head"><span class="meta-ic">${icon("i-status")}</span><div class="meta"><div class="name">Badges &amp; chips</div><div class="sub">Icône + texte, jamais la couleur seule (accessibilité)</div></div></div>
      <div class="sg-row">
        ${statusBadge("PENDING_REVIEW")} ${statusBadge("APPROVED")} ${statusBadge("REJECTED")} ${statusBadge("TRANSMITTED")} ${statusBadge("EDITED")} ${statusBadge("TRASHED")}
      </div>
      <div class="sg-row" style="margin-top:12px">
        ${chip("Primaire", "primary", "i-level1")} ${chip("Secondaire", "secondary", "i-level2")} ${chip("Tertiaire", "tertiary", "i-fusion")} ${chip("Attention", "warning")} ${chip("Erreur", "error")}
      </div>
    </div>

    <div class="setting-card">
      <div class="setting-card-head"><span class="meta-ic">${icon("i-edit")}</span><div class="meta"><div class="name">Champs de formulaire</div><div class="sub">Texte, zone de texte, case à cocher, verrouillage (zone sensible)</div></div></div>
      <div class="field" style="max-width:360px">
        <label for="sgFieldDemo">Champ texte</label>
        <input class="text-input" id="sgFieldDemo" type="text" placeholder="Exemple de saisie…">
      </div>
      <div class="field" style="max-width:360px;margin-top:14px">
        <label for="sgFieldDemoLocked">Champ verrouillé (zone sensible)</label>
        <textarea class="text-input locked-field" id="sgFieldDemoLocked" rows="2" readonly>Lecture seule tant que « Modifier » n'a pas été cliqué.</textarea>
      </div>
      <label class="toggle-row" style="margin-top:14px"><input type="checkbox" checked> Case à cocher</label>
    </div>

    <div class="setting-card">
      <div class="setting-card-head"><span class="meta-ic">${icon("i-facts")}</span><div class="meta"><div class="name">Listes &amp; cartes</div><div class="sub">Gabarit réutilisé partout : icône, titre, sous-titre, action</div></div></div>
      <div class="list-row">
        <span class="meta-ic">${icon("i-shield")}</span>
        <div class="meta"><div class="name">Élément de liste</div><div class="sub">Sous-titre descriptif, second niveau d'information</div></div>
        <button class="btn btn-ghost btn-sm">${icon("i-trash")}</button>
      </div>
    </div>

    <div class="setting-card">
      <div class="setting-card-head"><span class="meta-ic">${icon("i-dashboard")}</span><div class="meta"><div class="name">Carte KPI</div><div class="sub">Utilisée sur le Tableau de bord</div></div></div>
      <div class="dashboard-grid stats-row sg-kpi">
        ${statCard({ icon: "i-help", value: 12, label: "Articles à approuver", variant: "warning" })}
      </div>
    </div>
  </div>`;
}

// ---- Catalogue d'icônes (2026-08-27) : construit dynamiquement à partir du
// sprite RÉELLEMENT injecté dans la page (voir icons.js/SPRITE) -- une
// référence vivante ne doit jamais lister une icône à la main (risque de
// liste qui diverge silencieusement du sprite réel au fil des ajouts).
function bindStyleGuide() {
  const grid = document.getElementById("sgIconGrid");
  if (!grid) return;
  const ids = Array.from(document.querySelectorAll("symbol[id^='i-']"))
    .map((sym) => sym.id)
    .sort((a, b) => a.localeCompare(b));
  grid.innerHTML = ids.length
    ? ids.map((id) => `
      <div class="sg-icon-cell" title="${esc(id)}">
        <svg class="ic"><use href="#${id}"></use></svg>
        <code>${esc(id)}</code>
      </div>`).join("")
    : '<p class="muted">Sprite introuvable.</p>';
}

export { viewStyleGuide, bindStyleGuide };
