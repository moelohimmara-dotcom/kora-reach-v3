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
      <div class="topbar-status" id="agentStatus" role="status" aria-live="polite">
        <span class="dot dot-ready"></span><span id="agentMode">prêt</span>
      </div>
      <div class="notif-wrap">
        <button class="notif-bell" id="notifBell" title="Notifications" aria-label="Notifications" aria-haspopup="true" aria-expanded="false">
          ${ic("i-bell")}<span class="notif-count" id="notifCount" hidden>0</span>
        </button>
        <div class="notif-panel" id="notifPanel" hidden role="menu" aria-label="Centre de notifications">
          <div class="notif-panel-head">
            <strong>Notifications</strong>
            <button class="link-btn" id="notifMarkAll">Tout marquer comme lu</button>
          </div>
          <div class="notif-panel-body" id="notifBody"></div>
        </div>
      </div>
      <button class="btn btn-primary topbar-cta" id="topbarCycle" data-action="cycle-normal" title="Lancer un cycle" aria-label="Lancer un cycle">
        ${ic("i-refresh")}<span class="topbar-cta-label">Lancer un cycle</span>
      </button>
    </div>
  </header>

  <!-- Bandeau d'erreur réseau global (wireframe 13.1) — reflète s.ui.error,
       déjà peuplé par tous les appels API en échec mais jamais affiché avant. -->
  <div class="error-banner" id="errorBanner" role="alert" hidden>
    ${ic("i-info")}
    <span class="error-banner-msg" id="errorBannerMsg"></span>
    <button class="btn btn-tonal btn-sm" id="errorBannerRetry">${ic("i-refresh")} Réessayer</button>
    <button class="error-banner-close" id="errorBannerClose" aria-label="Fermer">${ic("i-close")}</button>
  </div>

  <!-- Bandeau "vous semblez perdu" (wireframe 11.3) — après inactivité, une fois par session -->
  <div class="idle-banner" id="idleBanner" hidden>
    ${ic("i-help")}
    <span>Besoin d'aide pour te repérer ?</span>
    <button class="btn btn-tonal btn-sm" id="idleBannerRelaunch">Relancer le guide</button>
    <button class="idle-banner-close" id="idleBannerClose" aria-label="Fermer">${ic("i-close")}</button>
  </div>

  <!-- LEFT DRAWER — Mobile (≤819px) : hamburger → 248px slide-in -->
  <nav class="left-drawer" id="leftDrawer" hidden>
    <div class="left-drawer-header">
      <span class="left-drawer-title">KORA</span>
      <button class="left-drawer-close" id="leftDrawerClose" aria-label="Fermer le menu">${ic("i-chevron")}</button>
    </div>
    <div class="left-drawer-body">
      <button class="navitem" data-route="cockpit"><svg class="ic"><use href="#i-dashboard"/></svg><span>Tableau de bord</span></button>
      <button class="navitem" data-route="facts"><svg class="ic"><use href="#i-facts"/></svg><span>Total</span><span class="nav-badge" data-badge="facts"></span></button>
      <button class="navitem" data-route="audit"><svg class="ic"><use href="#i-check"/></svg><span>Historique</span></button>
      <button class="navitem" data-route="drafts"><svg class="ic"><use href="#i-edit"/></svg><span>Brouillons</span></button>
      <button class="navitem" data-route="sources"><svg class="ic"><use href="#i-sources"/></svg><span>Sources</span><span class="nav-badge" data-badge="sources"></span></button>
      <div class="rail-sep"></div>
      <button class="navitem" data-route="trash"><svg class="ic"><use href="#i-trash"/></svg><span>Corbeille</span></button>
      <button class="navitem" data-route="settings"><svg class="ic"><use href="#i-settings"/></svg><span>Paramètres</span></button>
    </div>
  </nav>

  <!-- LEFT DRAWER SCRIM -->
  <div class="left-drawer-scrim" id="leftDrawerScrim" hidden></div>

  <!-- RAIL — Desktop/Tablet persistent (refonte v3 : sections repliables + épinglés,
       piste "D" choisie parmi 4 propositions comparées en amont. Le corps (pins +
       accordéons) est construit dynamiquement par renderRailBody() dans app.js à
       partir des préférences utilisateur (kora-rail-pins / kora-rail-collapsed en
       localStorage) — #railBody démarre vide ici. -->
  <nav class="rail" id="rail" aria-label="Navigation principale">
    <div class="rail-head">
      <span class="rail-mark">K</span>
      <div class="rail-word"><b>KORA</b><span class="rail-word-sub">Veille Guinée</span></div>
      <button class="rail-toggle" id="railToggle" title="Réduire/Agrandir la barre" aria-label="Réduire la barre">${ic("i-chevron")}</button>
    </div>

    <div class="rail-body" id="railBody"></div>

    <div class="rail-spacer"></div>
    <button class="decision-foot" id="decisionFoot" type="button" aria-live="polite" title="Voir les articles en attente">
      <span class="decision-pulse" aria-hidden="true"></span>
      <div class="decision-meta"><span class="decision-n" data-decision="pending">0</span><span class="decision-l">à décider</span></div>
    </button>
  </nav>

  <!-- RIGHT DRAWER OVERLAY — Desktop/Tablet (≥820px) : "Plus" menu -->
  <nav class="right-drawer" id="rightDrawer" hidden>
    <div class="right-drawer-header">
      <span class="right-drawer-title">Plus</span>
      <button class="right-drawer-close" id="rightDrawerClose" aria-label="Fermer">${ic("i-chevron")}</button>
    </div>
    <div class="right-drawer-body">
      <button class="navitem" data-route="audit"><svg class="ic"><use href="#i-check"/></svg><span>Historique</span></button>
      <button class="navitem" data-route="drafts"><svg class="ic"><use href="#i-edit"/></svg><span>Brouillons</span><span class="nav-badge" data-badge="drafts"></span></button>
      <button class="navitem" data-route="trash"><svg class="ic"><use href="#i-trash"/></svg><span>Corbeille</span><span class="nav-badge" data-badge="trash"></span></button>
      <button class="navitem" data-route="settings"><svg class="ic"><use href="#i-settings"/></svg><span>Paramètres</span></button>
    </div>
  </nav>

  <!-- RIGHT DRAWER SCRIM -->
  <div class="right-drawer-scrim" id="rightDrawerScrim" hidden></div>

  <main class="view" id="view"></main>

  <nav class="bottomnav" id="bottomnav">
    <button class="navitem navitem-active" data-route="cockpit" aria-current="page">
      <div class="nav-ico">${ic("i-dashboard")}</div>
      <span>Tableau de bord</span>
    </button>
    <button class="navitem" data-route="facts">
      <div class="nav-ico">${ic("i-facts")}<span class="nav-badge" data-badge="facts"></span></div>
      <span>Articles</span>
    </button>
    <button class="navitem" data-route="trash">
      <div class="nav-ico">${ic("i-trash")}<span class="nav-badge" data-badge="trash"></span></div>
      <span>Corbeille</span>
    </button>
    <button class="navitem" id="navPlus" aria-label="Plus d'options">
      <div class="nav-ico">${ic("i-plus")}</div>
      <span>Plus</span>
    </button>
  </nav>

  <div class="nav-scrim" id="navScrim" hidden></div>
  <div class="overflow-menu" id="overflowMenu" hidden>
    <button class="overflow-item" data-route="drafts"><svg class="ic"><use href="#i-edit"/></svg><span>Brouillons</span></button>
    <button class="overflow-item" data-route="audit"><svg class="ic"><use href="#i-check"/></svg><span>Historique</span></button>
    <button class="overflow-item" data-route="sources"><svg class="ic"><use href="#i-sources"/></svg><span>Sources</span></button>
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
