/* ============================================================
   KORA — views/settings.js : page Paramètres (thème, compte, 2FA,
   personnalisation, comptes & habilitations, agent, transmetteur...).
   Extrait de app.js le 22/08/2026 (refacto plan étape 4).
   ============================================================ */
import { Store } from "../store.js";
import { esc, icon, chip, isAdvancedRole, ROLE_LABEL_FR, snack, guardClick, friendlyActionError } from "../utils.js";
import { confirmAction } from "../sheet.js";
import { navigate, render } from "../app.js";
import { bindPasswordToggles } from "./auth.js";

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
              <!-- Toujours rendu, visibilité pilotée par l'attribut hidden (2026-08-24,
                   correctif B1 de l'audit Compte) : permet à bindSettings() de la
                   montrer/masquer directement en DOM après un upload/retrait, sans
                   dépendre d'un re-rendu complet pour refléter le nouvel état -- voir
                   avatarRemove.hidden ci-dessous. -->
              <button class="btn btn-ghost btn-sm" id="avatarRemove" ${s.auth?.avatarData ? "" : "hidden"}>Retirer</button>
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

  // ---- Photo de profil (9.2) ----
  const avatarFile = document.getElementById("avatarFile");
  const avatarChange = document.getElementById("avatarChange");
  const avatarRemove = document.getElementById("avatarRemove");
  const avatarPreview = document.getElementById("avatarPreview");
  const AVATAR_MAX_BYTES = 256 * 1024;
  // Correctif B1 (2026-08-24, audit UX Compte) : "l'aperçu garde l'ancienne
  // image tant que la page n'est pas rechargée entièrement", alors que le
  // toast annonce déjà le succès. Root cause identifiée : saveAvatar() met
  // bien à jour s.auth.avatarData -> setState -> re-render complet (qui
  // referme tous les tiroirs), et le .then() ci-dessous ré-ouvrait le
  // tiroir "Compte" en simulant un clic -- mais ce ré-ouverture et le
  // re-rendu déclenché par setState ne sont pas garantis synchrones l'un
  // par rapport à l'autre : le clic peut retomber sur un DOM reconstruit
  // AVANT que setState n'ait propagé la nouvelle donnée, laissant l'ancien
  // aperçu affiché jusqu'au prochain rendu complet (F5). Le topbar
  // (#topbarIdentityAvatar, voir app.js) n'a jamais ce problème car il est
  // mis à jour en DOM DIRECTEMENT à chaque rendu, jamais via un re-clic --
  // même patron appliqué ici : la fonction ci-dessous met à jour
  // #avatarPreview/#avatarRemove immédiatement et de façon synchrone,
  // indépendamment du re-rendu général (qui continue de tourner pour le
  // reste du tiroir, mais n'est plus la SEULE source de vérité visuelle
  // pour l'avatar).
  function _syncAvatarUI(dataUrl) {
    const preview = document.getElementById("avatarPreview");
    if (preview) preview.innerHTML = dataUrl ? `<img src="${esc(dataUrl)}" alt="">` : icon("i-user");
    const removeBtn = document.getElementById("avatarRemove");
    if (removeBtn) removeBtn.hidden = !dataUrl;
  }
  if (avatarChange && avatarFile) avatarChange.onclick = () => avatarFile.click();
  if (avatarFile) avatarFile.onchange = () => {
    const f = avatarFile.files && avatarFile.files[0];
    if (!f) return;
    if (f.size > AVATAR_MAX_BYTES) { snack("Image trop lourde (max 256 Ko)"); avatarFile.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      Store.saveAvatar(dataUrl).then(() => {
        _syncAvatarUI(dataUrl);
        // saveAvatar() met à jour s.auth.avatarData -> setState -> re-render
        // complet de la vue, qui referme tous les tiroirs Paramètres (limitation
        // générale de l'archi des tiroirs, pas spécifique à l'avatar). On rouvre
        // "Compte" pour ne pas éjecter l'utilisateur de la page qu'il modifie --
        // l'aperçu ci-dessus est déjà correct entre-temps, ce ré-ouverture ne
        // conditionne plus sa justesse.
        snack("Photo de profil mise à jour");
        document.querySelector('.settings-nav-item[data-setnav="account"]')?.click();
      }).catch(e => snack("Erreur : " + e.message));
    };
    reader.readAsDataURL(f);
  };
  if (avatarRemove) avatarRemove.onclick = () => {
    Store.saveAvatar("").then(() => {
      _syncAvatarUI("");
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

export { viewSettings, bindSettings };
