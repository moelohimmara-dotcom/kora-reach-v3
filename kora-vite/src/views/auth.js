/* ============================================================
   KORA — views/auth.js : écrans d'authentification (login, MFA, mot de
   passe oublié, réinitialisation, invitation) + logique associée. Extrait
   de app.js le 22/08/2026 (refacto plan étape 4).

   _authRendered/_forceAuthOverlay restent un état PRIVÉ de ce module :
   app.js/render() a seulement besoin de les LIRE (jamais de les écrire),
   d'où les deux getters exportés plutôt que les variables elles-mêmes
   (un import ES ne peut de toute façon pas être réassigné par l'importeur).
   ============================================================ */
import { Store } from "../store.js";
import { esc, icon, snack, isAdvancedRole } from "../utils.js";
import { navigate, render } from "../app.js";

let _authRendered = false;  // évite de reconstruire le formulaire à chaque setState
// 2026-08-20 : garde l'overlay d'auth affiché même si s.auth.loggedIn est vrai
// -- cas d'un lien d'invitation ouvert alors qu'une session valide existe
// déjà sur ce navigateur (voir renderAuth()/viewInvite()).
let _forceAuthOverlay = false;
export function isAuthRendered() { return _authRendered; }
export function isForceAuthOverlay() { return _forceAuthOverlay; }



// ---- Écrans d'authentification (overlay plein écran) ----
// alreadyAuth (2026-08-20, demande explicite) : passe l'auth de la session
// EN COURS quand un lien d'invitation/reset est ouvert alors qu'un compte est
// déjà connecté sur ce navigateur -- voir viewInvite() et _forceAuthOverlay.
function renderAuth(mode, token, force = false, alreadyAuth = null) {
  const overlay = document.getElementById("authOverlay");
  if (!overlay) return;
  if (mode === "invite" && alreadyAuth) _forceAuthOverlay = true;
  // For explicit navigation (forgot, reset, logout), allow rebuild.
  // For auto-render via render(), only build once.
  if (!_authRendered || force) {
    if (mode === "login") overlay.innerHTML = viewLogin();
    else if (mode === "mfa") overlay.innerHTML = viewMfa();
    else if (mode === "forgot") overlay.innerHTML = viewForgot();
    else if (mode === "reset") overlay.innerHTML = viewReset(token);
    else if (mode === "invite") overlay.innerHTML = viewInvite(token, alreadyAuth);
    overlay.hidden = false;
    document.getElementById("app").style.display = "none";
    bindAuth(mode, token, alreadyAuth);
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
function viewInvite(token, alreadyAuth) {
  // 2026-08-20, demande explicite : une session valide existe déjà sur ce
  // navigateur (ex. un admin ouvre son propre lien de test sans s'être
  // déconnecté) -- prévenir clairement plutôt qu'afficher directement le
  // formulaire de création de compte sans expliquer pourquoi.
  if (alreadyAuth) {
    return `<div class="auth-screen">
      <div class="auth-card">
        <div class="auth-mark">${icon("i-info")}</div>
        <h1 class="auth-title">Déjà connecté</h1>
        <p class="auth-sub">Tu es actuellement connecté en tant que <strong>${esc(alreadyAuth.username || "?")}</strong>. Pour créer le compte de cette invitation, déconnecte-toi d'abord.</p>
        <button class="btn btn-primary btn-block" id="inviteLogoutBtn">Se déconnecter et accepter l'invitation</button>
        <button class="btn btn-ghost btn-block" id="inviteContinueBtn" style="margin-top:8px">Continuer vers l'application</button>
      </div>
    </div>`;
  }
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

function bindAuth(mode, token, alreadyAuth) {
  const overlay = document.getElementById("authOverlay");
  const err = overlay.querySelector("#authErr");
  const setErr = (m) => { if (err) err.textContent = m || ""; };
  const form = overlay.querySelector("#authForm");
  if (mode === "invite" && alreadyAuth) {
    // 2026-08-20 : ecran "deja connecte" (voir viewInvite()), pas de formulaire ici.
    const logoutBtn = overlay.querySelector("#inviteLogoutBtn");
    const continueBtn = overlay.querySelector("#inviteContinueBtn");
    if (logoutBtn) logoutBtn.onclick = async () => {
      try { await Store.logout(); } catch (e) {}
      _forceAuthOverlay = false;
      _authRendered = false;
      history.replaceState(null, "", location.pathname + location.search); // garde ?token= pour reprendre l'invitation
      renderAuth("invite", token, true, null);
    };
    if (continueBtn) continueBtn.onclick = () => {
      _forceAuthOverlay = false;
      _authRendered = false;
      navigate("cockpit");
    };
    return;
  }
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

export { renderAuth, bindAuth, bindPasswordToggles };
