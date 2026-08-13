// Shell HTML du poste KORA — injecté par main.js (le JS possède le DOM,
// plus de dépendance au timing de parsing du <body>).
const ic = (id) => `<svg class="ic"><use href="#${id}"/></svg>`;
export const SHELL = `
  <header class="topbar">
    <div class="topbar-left">
      <div class="brand">
        <span class="brand-mark">${ic("i-spark")}</span>
        <span class="brand-name">KORA</span>
        <span class="brand-sub">Agent</span>
      </div>
    </div>
    <div class="topbar-right">
      <div class="topbar-status" id="agentStatus">
        <span class="dot dot-ok"></span><span id="agentMode">prêt</span>
      </div>
      <button class="btn btn-primary topbar-cta" id="topbarCycle" data-action="cycle-normal" title="Lancer un cycle" aria-label="Lancer un cycle">
        ${ic("i-refresh")}<span class="topbar-cta-label">Lancer un cycle</span>
      </button>
    </div>
  </header>

  <!-- LEFT DRAWER — Mobile (≤819px) : hamburger → 248px slide-in -->
  <nav class="left-drawer" id="leftDrawer" hidden>
    <div class="left-drawer-header">
      <span class="left-drawer-title">KORA</span>
      <button class="left-drawer-close" id="leftDrawerClose" aria-label="Fermer le menu">${ic("i-chevron")}</button>
    </div>
    <div class="left-drawer-body">
      <button class="navitem" data-route="cockpit"><svg class="ic"><use href="#i-dashboard"/></svg><span>Tableau de bord</span></button>
      <button class="navitem" data-route="facts"><svg class="ic"><use href="#i-facts"/></svg><span>Articles</span></button>
      <button class="navitem" data-route="audit"><svg class="ic"><use href="#i-check"/></svg><span>Historique</span></button>
      <button class="navitem" data-route="drafts"><svg class="ic"><use href="#i-edit"/></svg><span>Brouillons</span></button>
      <button class="navitem" data-route="sources"><svg class="ic"><use href="#i-sources"/></svg><span>Sources</span></button>
      <div class="rail-sep"></div>
      <button class="navitem" data-route="trash"><svg class="ic"><use href="#i-trash"/></svg><span>Corbeille</span></button>
      <button class="navitem" data-route="settings"><svg class="ic"><use href="#i-settings"/></svg><span>Paramètres</span></button>
    </div>
  </nav>

  <!-- LEFT DRAWER SCRIM -->
  <div class="left-drawer-scrim" id="leftDrawerScrim" hidden></div>

  <!-- RAIL — Desktop/Tablet persistent -->
  <nav class="rail" id="rail">
    <button class="rail-toggle" id="railToggle" title="Réduire/Agrandir le rail" aria-label="Réduire/Agrandir le rail">${ic("i-chevron")}</button>
    <button class="navitem" data-route="cockpit"><svg class="ic"><use href="#i-dashboard"/></svg><span>Tableau de bord</span></button>
    <button class="navitem" data-route="facts"><svg class="ic"><use href="#i-facts"/></svg><span>Articles</span></button>
    <button class="navitem" data-route="audit"><svg class="ic"><use href="#i-check"/></svg><span>Historique</span></button>
    <button class="navitem" data-route="drafts"><svg class="ic"><use href="#i-edit"/></svg><span>Brouillons</span></button>
    <button class="navitem" data-route="sources"><svg class="ic"><use href="#i-sources"/></svg><span>Sources</span></button>
    <div class="rail-sep"></div>
    <button class="navitem" data-route="trash"><svg class="ic"><use href="#i-trash"/></svg><span>Corbeille</span></button>
    <button class="navitem" data-route="settings"><svg class="ic"><use href="#i-settings"/></svg><span>Paramètres</span></button>
    <button class="navitem navitem-center" data-plus title="Plus d'options" aria-label="Plus d'options"><svg class="ic"><use href="#i-more"/></svg><span>Plus</span></button>
  </nav>

  <!-- RIGHT DRAWER OVERLAY — Desktop/Tablet (≥820px) : "Plus" menu -->
  <nav class="right-drawer" id="rightDrawer" hidden>
    <div class="right-drawer-header">
      <span class="right-drawer-title">Plus</span>
      <button class="right-drawer-close" id="rightDrawerClose" aria-label="Fermer">${ic("i-chevron")}</button>
    </div>
    <div class="right-drawer-body">
      <button class="navitem" data-route="audit"><svg class="ic"><use href="#i-check"/></svg><span>Historique</span></button>
      <button class="navitem" data-route="drafts"><svg class="ic"><use href="#i-edit"/></svg><span>Brouillons</span></button>
      <button class="navitem" data-route="trash"><svg class="ic"><use href="#i-trash"/></svg><span>Corbeille</span></button>
      <button class="navitem" data-route="settings"><svg class="ic"><use href="#i-settings"/></svg><span>Paramètres</span></button>
    </div>
  </nav>

  <!-- RIGHT DRAWER SCRIM -->
  <div class="right-drawer-scrim" id="rightDrawerScrim" hidden></div>

  <main class="view" id="view"></main>

  <nav class="bottomnav" id="bottomnav">
    <button class="navitem" data-route="cockpit"><svg class="ic"><use href="#i-dashboard"/></svg><span>Tableau</span></button>
    <button class="navitem" data-route="facts"><svg class="ic"><use href="#i-facts"/></svg><span>Articles</span></button>
    <button class="navitem" data-route="sources"><svg class="ic"><use href="#i-sources"/></svg><span>Sources</span></button>
    <button class="navitem navitem-center" data-plus><svg class="ic"><use href="#i-more"/></svg><span>Plus</span></button>
  </nav>

  <div class="nav-scrim" id="navScrim" hidden></div>
  <div class="overflow-menu" id="overflowMenu" hidden>
    <button class="overflow-item" data-route="trash"><svg class="ic"><use href="#i-trash"/></svg><span>Corbeille</span></button>
    <button class="overflow-item" data-route="settings"><svg class="ic"><use href="#i-settings"/></svg><span>Paramètres</span></button>
  </div>

  <div class="rail-scrim" id="railScrim" hidden></div>

  <div class="sheet-scrim" id="sheetScrim" hidden></div>
  <div class="sheet" id="sheet" hidden>
    <div class="sheet-handle"></div>
    <div id="sheetBody"></div>
  </div>

  <div class="snackbar" id="snackbar" hidden></div>
  <div class="global-loader" id="globalLoader" hidden>
    <div class="wave"><i></i><i></i><i></i><i></i><i></i></div>
    <span id="globalLoaderText">Agent en cours…</span>
  </div>

  <!-- Barre d'action de sélection multiple -->
  <div class="select-bar" id="selectBar" hidden>
    <div class="select-bar-info"><b id="selectCount">0</b> <span class="sel-word">sélectionné(s)</span></div>
    <div class="select-bar-actions">
      <button class="btn btn-tonal" data-bulk="pending" title="Remettre en attente de validation (sans publier)">${ic("i-undo")}<span>Attente</span></button>
      <button class="btn btn-tonal" data-bulk="trash" title="Mettre à la corbeille">${ic("i-trash")}<span>Corbeille</span></button>
      <button class="btn btn-tonal" data-bulk="draft" title="Placer en brouillon">${ic("i-edit")}<span>Brouillon</span></button>
      <button class="btn btn-primary" data-bulk="approve" title="Publier l'article">${ic("i-send")}<span>Publier</span></button>
    </div>
  </div>

  <!-- Fenêtre : choix publication WordPress (direct vs brouillon) -->
  <div class="sheet-scrim" id="wpScrim" hidden></div>
  <div class="mini-sheet" id="wpChoice" hidden>
    <div class="mini-sheet-card">
      <div class="quiz-badge">📡 Publication WordPress</div>
      <div class="mini-sheet-q">Comment veux-tu publier les <b id="wpCount">0</b> article(s) sélectionné(s) sur le site WordPress ?</div>
      <div class="mini-sheet-actions">
        <button class="btn btn-primary" id="wpPublish">Publier directement (public)</button>
        <button class="btn btn-tonal" id="wpDraft">Placer en brouillon WP (invisible)</button>
        <button class="btn btn-ghost" id="wpCancel">Annuler</button>
      </div>
    </div>
  </div>

  <!-- Fenêtre : confirmation corbeille / suppression définitive -->
  <div class="mini-sheet" id="trashChoice" hidden>
    <div class="mini-sheet-card">
      <div class="quiz-badge">🗑️ Suppression</div>
      <div class="mini-sheet-q">Que faire des <b id="trashCount">0</b> article(s) sélectionné(s) ?</div>
      <label class="mini-sheet-check"><input type="checkbox" id="trashDefinitive"> Suppression définitive (irréversible, hors corbeille)</label>
      <div class="mini-sheet-actions">
        <button class="btn btn-tonal" id="trashPut">Mettre à la corbeille (11 j)</button>
        <button class="btn btn-danger" id="trashDelete" hidden>Supprimer définitivement</button>
        <button class="btn btn-ghost" id="trashCancel">Annuler</button>
      </div>
    </div>
  </div>
`;
