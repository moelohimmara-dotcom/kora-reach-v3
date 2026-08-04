// Shell HTML du poste KORA — injecté par main.js (le JS possède le DOM,
// plus de dépendance au timing de parsing du <body>).
const ic = (id) => `<svg class="ic"><use href="#${id}"/></svg>`;
export const SHELL = `
  <header class="topbar">
    <div class="topbar-left">
      <button class="icon-btn topbar-menu" id="topbarMenu" title="Menu" aria-label="Ouvrir le menu">${ic("i-menu")}</button>
      <div class="brand">
        <span class="brand-mark">${ic("i-spark")}</span>
        <span class="brand-name">KORA</span>
        <span class="brand-sub">Reach</span>
      </div>
    </div>
    <div class="topbar-right">
      <div class="topbar-status" id="agentStatus">
        <span class="dot dot-ok"></span><span id="agentMode">prêt</span>
      </div>
      <button class="btn btn-primary topbar-cta" id="topbarCycle" title="Lancer un cycle" aria-label="Lancer un cycle">
        ${ic("i-refresh")}<span class="topbar-cta-label">Lancer un cycle</span>
      </button>
    </div>
  </header>

  <nav class="rail" id="rail">
    <div class="rail-top">
      <button class="icon-btn rail-toggle" id="railToggle" title="Réduire/Agrandir" aria-label="Réduire ou agrandir le rail">${ic("i-chevron")}</button>
    </div>
    <div class="rail-section-label">Tableau de bord</div>
    <button class="navitem" data-route="cockpit"><svg class="ic"><use href="#i-dashboard"/></svg><span>Tableau de bord</span></button>
    <div class="rail-sep"></div>
    <div class="rail-section-label">Articles</div>
    <button class="navitem" data-route="audit"><svg class="ic"><use href="#i-audit"/></svg><span>Historique</span></button>
    <button class="navitem" data-route="facts"><svg class="ic"><use href="#i-facts"/></svg><span>Articles</span></button>
    <button class="navitem navitem-center" data-route="hitl"><svg class="ic"><use href="#i-check"/></svg><span>Validation</span></button>
    <button class="navitem" data-route="sources"><svg class="ic"><use href="#i-sources"/></svg><span>Sources</span></button>
    <div class="rail-sep"></div>
    <div class="rail-section-label">Brouillon</div>
    <button class="navitem" data-route="drafts"><svg class="ic"><use href="#i-edit"/></svg><span>Brouillons</span></button>
    <button class="navitem" data-route="settings"><svg class="ic"><use href="#i-settings"/></svg><span>Paramètres</span></button>
  </nav>

  <main class="view" id="view"></main>

  <nav class="bottomnav" id="bottomnav">
    <button class="navitem" data-route="cockpit"><svg class="ic"><use href="#i-dashboard"/></svg><span>Tableau de bord</span></button>
    <button class="navitem" data-route="facts"><svg class="ic"><use href="#i-facts"/></svg><span>Articles</span></button>
    <button class="navitem navitem-center" data-route="hitl"><svg class="ic"><use href="#i-check"/></svg><span>Validation</span></button>
    <button class="navitem" data-route="audit"><svg class="ic"><use href="#i-audit"/></svg><span>Historique</span></button>
    <button class="navitem" data-route="settings"><svg class="ic"><use href="#i-settings"/></svg><span>Paramètres</span></button>
  </nav>

  <div class="rail-scrim" id="railScrim" hidden></div>

  <button class="fab" id="fab" aria-label="Actions">
    <svg class="ic-fab"><use href="#i-spark"/></svg>
  </button>
  <div class="fab-menu" id="fabMenu">
    <button class="fab-action" data-act="cycle"><svg class="ic"><use href="#i-refresh"/></svg> Lancer un cycle</button>
    <button class="fab-action" data-act="seed"><svg class="ic"><use href="#i-spark"/></svg> Générer démo</button>
  </div>

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
`;
