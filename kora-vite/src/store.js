/* ============================================================
  KORA — Store d'état unique + API (anti-coquille-vide)
  Module ES. BASE auto selon l'emplacement (/kora-v2 ou /).
  IMPORTANT : les appels API vont à la racine /api/... (pas /kora-v2/api)
  ============================================================ */
const BASE = "/kora-v2";  // nginx route /kora-v2/api -> backend Python (port 8766)

export const Store = (() => {
  const state = {
    route: "cockpit",
    // busy : indicateur GÉNÉRIQUE (petit statut "agent occupé" dans le topbar) —
    // posé par TOUTE action en cours (suppression, décision, restauration...).
    // cycleBusy : vrai UNIQUEMENT pendant un cycle de génération (startCycle) —
    // c'est lui qui pilote l'écran plein écran #globalLoader/#cycleBanner.
    // Bug corrigé 2026-08-19 : le loader plein écran lisait "busy" (générique)
    // au lieu de "cycleBusy" -> une simple suppression déclenchait l'écran
    // "Kora Agent explore les sources..." alors qu'aucun cycle n'était lancé.
    ui: { loading: false, error: null, busy: false, cycleBusy: false, overlay: null, launchEstimate: null, theme: "dark", rail: "expanded", factFilter: "all" },
    health: null,
    lastCycle: null,
    facts: [],
    decisions: {},
    audit: [],
    auditFilter: { type: "all", q: "" },
    sources: [],
    videos: [],
    // Centre de notifications PERSISTANT (2026-08-22) : remplace l'ancien
    // historique local de toasts (app.js, _notifications) -- survit au
    // rechargement, partagé entre onglets/appareils, signale les évènements
    // de fond (cycle/vidéo terminés) même si personne ne regardait au bon
    // moment. Voir editorial/notifications.py.
    notifications: [],
    notifUnreadCount: 0,
    // videoJob (2026-08-21) : job de génération vidéo en cours, suivi au
    // niveau du Store (pas du sheet) pour survivre à la navigation -- c'est
    // lui qui pilote le bandeau global #videoJobBanner (visible depuis
    // n'importe quelle page). Forme : { fact_id, title, status, stage, error }
    // ou null si aucune génération en cours. status: "generating"|"done"|"error".
    videoJob: null,
    sheet: null,
    trash: [],
    // trashLoaded (2026-08-19, bug corrigé : "Corbeille vide" s'affichait une
    // fraction de seconde au chargement avant que les vrais éléments
    // n'apparaissent) : distingue "aucune donnée encore reçue" de "reçu, et
    // vraiment vide" — nécessaire séparément de ui.loading, qui ne reflète
    // PAS le chargement de la corbeille (loadTrash() ne le touche pas).
    trashLoaded: false,
    invitations: [],       // invitations en attente/révoquées/acceptées (Phase 2)
    selection: {},        // { fact_id: true } — sélection multiple
    selectMode: false,    // mode sélection activé
    auth: { loggedIn: false, username: null, email: null, pending: true },
  };

  const subs = new Set();
  let _notifying = false;
  let _pendingPatch = null;
  let _reentry = 0;
  function setState(patch) {
    Object.assign(state, patch);
    if (_notifying) {
      // Anti-récursion : un subscriber (render) a déclenché setState pendant
      // la notification -> on fusionne dans _pendingPatch et on NOTIFIE APRÈS
      // (en microtask, hors pile), jamais en réentrance. Sinon boucle infinie.
      _pendingPatch = Object.assign(_pendingPatch || {}, patch);
      return;
    }
    _notifying = true;
    try {
      subs.forEach((fn) => fn(state));
    } finally {
      _notifying = false;
    }
    if (_pendingPatch && _reentry < 8) {
      const p = _pendingPatch; _pendingPatch = null;
      _reentry++;
      queueMicrotask(() => { _reentry--; setState(p); });
    } else if (_pendingPatch) {
      // Boucle suspectée : on abandonne le patch en attente pour ne pas figer.
      _pendingPatch = null;
    }
  }
  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

  async function api(path, opts) {
    const url = BASE + path;
    // Inject token if present (light auth) – token stored in localStorage under "kora-token"
    const token = (() => {
      try { return localStorage.getItem("kora-token"); } catch (e) { return null; }
    })();
    const headers = Object.assign({}, opts && opts.headers ? opts.headers : {});
    if (token) {
      // Prefer X-API-Token, fallback to Authorization Bearer
      headers["X-API-Token"] = token;
    }
    const fetchOpts = Object.assign({}, opts, { headers, credentials: "include" });
    // Timeout réseau : évite que le fetch reste en "pending" indéfiniment
    // (qui figeait le bouton "Connexion…" si le backend ne répond pas).
    // 15s par défaut, mais certaines routes renvoient un payload bien plus
    // lourd (ex: /api/hitl renvoie TOUS les faits avec le texte complet de
    // chaque article -> peut légitimement dépasser 15s selon le réseau et
    // la charge serveur du moment) -- corrigé 2026-08-19 (bug rapporté :
    // bandeau rouge "signal is aborted without reason" juste après un
    // cycle, le temps que /api/hitl recharge la liste complète).
    const ctrl = new AbortController();
    const HEAVY_TIMEOUT_PATHS = ["/api/hitl", "/api/hitl/trash"];
    const defaultTimeout = HEAVY_TIMEOUT_PATHS.some(p => path.startsWith(p)) ? 45000 : 15000;
    const TIMEOUT_MS = (opts && opts.timeout) || defaultTimeout;
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    fetchOpts.signal = ctrl.signal;
    try {
      const res = await fetch(url, fetchOpts);
      clearTimeout(timer);
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        throw new Error("Réponse non-JSON du serveur (code " + res.status + ")");
      }
      const data = await res.json();
      // Bug corrige 2026-08-19 (rapporte : "j'ai annule la decision, l'article
      // est repasse en attente MAIS le bandeau rouge d'erreur restait affiche").
      // ui.error est un bandeau GLOBAL peuple par ~14 sites d'appel differents
      // (voir renderErrorBanner, app.js) -- mais RIEN ne le nettoyait jamais
      // sur un succes ulterieur, seulement via les boutons Reessayer/Fermer du
      // bandeau lui-meme. Une erreur passee (meme totalement sans rapport,
      // ex. un cycle precedent) restait donc collee a l'ecran indefiniment,
      // masquant le fait qu'une action ulterieure (comme "Annuler la
      // decision") avait en realite parfaitement reussi. Centralise ici,
      // dans le point de passage UNIQUE de tout appel reussi, plutot que
      // d'ajouter "error: null" a la main sur chacun des 14 sites (fragile,
      // le prochain ajoute en oubliera un).
      if (state.ui && state.ui.error) {
        setState({ ui: { ...state.ui, error: null } });
      }
      return data;
    } catch (e) {
      // e.name === "AbortError" côté navigateur -> message technique brut
      // ("signal is aborted without reason") qui ne dit rien à l'utilisateur.
      // Message clair à la place, distinct d'une vraie panne réseau.
      if (e.name === "AbortError") {
        throw new Error("Le chargement a pris trop de temps (connexion lente ou serveur occupé). Réessaie.");
      }
      throw new Error(e.message || "Réseau indisponible");
    }
  }

  // ---- Auth ----
  let _checking = false;
  async function checkAuth() {
    if (_checking) return false; // idempotent : évite la boucle render->checkAuth->render
    _checking = true;
    // pending=true : la verification est en cours -> l'UI ne doit PAS afficher
    // le formulaire de login (evite le flash login au reload). On le masque
    // tant que l'issue n'est pas connue.
    setState({ auth: Object.assign({}, state.auth, { pending: true }) });
    try {
      const r = await api("/api/auth/me");
      if (r.ok) {
        const next = { loggedIn: true, username: r.username, email: r.email, role: r.role || "normal", pending: false, avatarData: r.avatar_data || null };
        // Ne pas notifier si identique (évite render->checkAuth->render)
        const a = state.auth || {};
        if (!a.loggedIn || a.username !== next.username || a.role !== next.role || a.avatarData !== next.avatarData) {
          setState({ auth: next });
        }
        return true;
      }
      console.warn("[auth] /api/auth/me a répondu ok=false", r);
    } catch (e) {
      console.warn("[auth] /api/auth/me a échoué, session conservée :", e.message);
      return false;
    } finally {
      _checking = false;
    }
    setState({ auth: { loggedIn: false, username: null, email: null, role: null, pending: false } });
    return false;
  }
  async function login(username, password) {
    const r = await api("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    if (!r.ok) {
      if (r.error === "invalid_credentials") throw new Error("Identifiants invalides");
      throw new Error("Erreur de connexion");
    }
    // 2FA (9.3) : mot de passe correct mais AUCUN cookie de session n'a été
    // posé par le backend tant que le code TOTP n'est pas vérifié (voir
    // verifyLoginTotp ci-dessous). On renvoie l'info telle quelle à l'appelant
    // (app.js bindAuth) plutôt que d'appeler checkAuth() ici — il n'y a pas
    // encore de session à vérifier.
    if (r.mfa_required) return { mfaRequired: true, mfaToken: r.mfa_token };
    // NE PAS setState loggedIn ici — attendre checkAuth()
    const ok = await checkAuth();   // valide la session côté serveur
    if (ok) await loadAll();        // charge facts/health/sources dès la connexion
    return { mfaRequired: false, ok };
  }
  async function verifyLoginTotp(mfaToken, code) {
    const r = await api("/api/auth/login/verify-2fa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mfa_token: mfaToken, code }) });
    if (!r.ok) {
      const messages = { mfa_expired: "Session de connexion expirée, recommence.", invalid_code: "Code invalide." };
      throw new Error(messages[r.error] || "Erreur de vérification");
    }
    const ok = await checkAuth();
    if (ok) await loadAll();
    return { ok, backupCodeUsed: !!r.backup_code_used, backupCodesLeft: r.backup_codes_left };
  }
  // ---- 2FA (9.3) : gestion depuis Paramètres > Compte (compte déjà connecté) ----
  async function get2FAStatus() {
    return api("/api/auth/2fa/status");
  }
  async function setup2FA() {
    const r = await api("/api/auth/2fa/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (!r.ok) throw new Error(r.error || "Erreur");
    return r; // { secret, otpauth_uri }
  }
  async function confirm2FA(code) {
    const r = await api("/api/auth/2fa/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    if (!r.ok) throw new Error(r.error === "invalid_code" ? "Code invalide" : (r.error || "Erreur"));
    return r; // { backup_codes: [...] }
  }
  async function disable2FA(password) {
    const r = await api("/api/auth/2fa/disable", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (!r.ok) throw new Error(r.error === "wrong_password" ? "Mot de passe incorrect" : (r.error || "Erreur"));
    return r;
  }
  async function logout() {
    // On ferme la session CÔTÉ UI IMMÉDIATEMENT (setState synchrone) pour ne
    // jamais bloquer l'UI sur la réponse du backend (le logout HTTP peut être
    // lent si la DB est sous tension). Le backend finit par supprimer la
    // session de toute façon ; l'UI ne doit pas attendre.
    setState({ auth: { loggedIn: false, username: null, email: null } });
    // Déconnexion serveur en arrière-plan, sans faire attendre l'UI.
    // Timeout court : si le backend ne répond pas vite, on ignore (la session
    // UI est déjà fermée et le cookie sera de toute façon ignoré côté serveur).
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 4000);
    fetch(BASE + "/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      signal: ctrl.signal,
    }).catch(() => {}).finally(() => clearTimeout(to));
  }
  async function changePassword(current, newp) {
    const r = await api("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current, new: newp }) });
    if (r.ok) return true;
    if (r.error === "wrong_current") throw new Error("Mot de passe actuel incorrect");
    if (r.error === "password_too_short") throw new Error("Le nouveau mot de passe doit faire au moins 8 caractères");
    throw new Error(r.error || "Erreur");
  }
  async function saveAvatar(dataUrl) {
    const r = await api("/api/auth/avatar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ avatar_data: dataUrl }) });
    if (r.ok) {
      setState({ auth: { ...state.auth, avatarData: dataUrl || null } });
      return true;
    }
    throw new Error(r.error === "avatar_invalide" ? "Image invalide (doit être une photo, < 256 Ko)" : (r.error || "Erreur"));
  }
  async function forgot(email) {
    const r = await api("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    return r.ok !== false;
  }
  async function resetPassword(token, newp) {
    const r = await api("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, new_password: newp }) });
    if (r.ok) return true;
    if (r.error === "token_expired") throw new Error("Lien expiré, redemandez une réinitialisation");
    if (r.error === "invalid_token") throw new Error("Lien invalide");
    if (r.error === "password_too_short") throw new Error("Le mot de passe doit faire au moins 8 caractères");
    throw new Error(r.error || "Erreur");
  }
  async function loadUsers() {
    const r = await api("/api/auth/users");
    if (r.users) { setState({ users: r.users }); return r.users; }
    return [];
  }
  async function createUser(username, email, password, role = "normal") {
    const r = await api("/api/auth/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, email, password, role }) });
    if (r.ok) return true;
    if (r.error === "username_exists") throw new Error("Cet identifiant existe déjà");
    if (r.error === "username_too_short") throw new Error("Identifiant trop court (3 min)");
    if (r.error === "password_too_short") throw new Error("Mot de passe 8 caractères minimum");
    if (r.error === "role_invalide") throw new Error("Rôle invalide");
    throw new Error(r.error || "Erreur");
  }
  async function setRole(id, role) {
    const r = await api("/api/auth/users/role", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, role }) });
    if (r.ok) return true;
    if (r.error === "role_invalide") throw new Error("Rôle invalide");
    if (r.error === "reserve_aux_proprietaires") throw new Error("Réservé aux Propriétaires : seul un Propriétaire peut créer/rétrograder un autre Propriétaire");
    if (r.error === "dernier_proprietaire_protege") throw new Error("Impossible : c'est le dernier Propriétaire, il doit toujours en rester au moins un");
    throw new Error(r.error || "Erreur");
  }
  async function deleteUser(id) {
    const r = await api("/api/auth/users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (r.ok) return true;
    if (r.error === "cannot_delete_self") throw new Error("Vous ne pouvez pas supprimer votre propre compte");
    if (r.error === "reserve_aux_proprietaires") throw new Error("Réservé aux Propriétaires : seul un Propriétaire peut retirer un autre Propriétaire");
    if (r.error === "dernier_proprietaire_protege") throw new Error("Impossible : c'est le dernier Propriétaire, il doit toujours en rester au moins un");
    throw new Error(r.error || "Erreur");
  }
  // Délégation individuelle du droit d'envoi WordPress (§3 du plan valide
  // 2026-08-19) — Propriétaire/Avancé l'ont déjà via leur rôle, sert à
  // l'accorder/retirer à un Éditeur ('normal') précis.
  async function setWpPublish(id, allowed) {
    const r = await api("/api/auth/users/wp-publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, allowed }) });
    if (r.ok) return true;
    throw new Error(r.error || "Erreur");
  }

  // Invitations (Phase 2, §4 du plan valide 2026-08-19) — remplace la
  // création directe de compte : la personne invitée choisit elle-même son
  // mot de passe en acceptant, personne d'autre ne le connaît jamais.
  async function inviteUser(email, role) {
    const r = await api("/api/auth/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role }) });
    if (r.ok) return r;
    if (r.error === "email_invalide") throw new Error("Email invalide");
    if (r.error === "role_invalide") throw new Error("Rôle invalide");
    if (r.error === "reserve_aux_proprietaires") throw new Error("Réservé aux Propriétaires : seul un Propriétaire peut inviter en tant que Propriétaire");
    throw new Error(r.error || "Erreur");
  }
  async function loadInvitations() {
    const r = await api("/api/auth/invitations");
    if (r.invitations) { setState({ invitations: r.invitations }); return r.invitations; }
    return [];
  }
  async function revokeInvitation(token) {
    const r = await api("/api/auth/invitations/revoke", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    if (r.ok) return true;
    throw new Error(r.error || "Erreur");
  }
  async function resendInvitation(token) {
    const r = await api("/api/auth/invitations/resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    if (r.ok) return true;
    throw new Error(r.error || "Erreur");
  }
  // checkInvite/acceptInvite : PUBLIC (pas de session) -- ecran "definir mon
  // mot de passe" ouvert depuis le lien recu par email.
  async function checkInvite(token) {
    const r = await api("/api/auth/invitations/check?token=" + encodeURIComponent(token));
    if (r.email) return r;
    throw new Error(r.error === "invitation_invalide_ou_expiree" ? "Invitation invalide ou expirée" : (r.error || "Erreur"));
  }
  async function acceptInvite(token, username, password) {
    const r = await api("/api/auth/invitations/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, username, password }) });
    if (r.ok) return r;
    if (r.error === "username_exists") throw new Error("Cet identifiant existe déjà");
    if (r.error === "username_too_short") throw new Error("Identifiant trop court (3 min)");
    if (r.error === "password_too_short") throw new Error("Mot de passe 8 caractères minimum");
    if (r.error === "invitation_invalide_ou_expiree") throw new Error("Invitation invalide ou expirée — redemande une invitation");
    throw new Error(r.error || "Erreur");
  }

  async function loadHealth() {
    try { setState({ health: await api("/api/health") }); }
    catch (e) { setState({ ui: { ...state.ui, error: e.message } }); }
  }
  async function loadLast() {
    // NE PAS peupler facts ici : /api/last renvoie result.facts SANS fact_id,
    // ce qui casse le data-fact des cartes -> clic ne marche pas.
    // facts vient UNIQUEMENT de loadHITL (qui a les fact_id).
    try {
      const r = await api("/api/last");
      setState({ lastCycle: r });
    } catch (e) { setState({ ui: { ...state.ui, error: e.message } }); }
  }
  async function loadHITL() {
    setState({ ui: { ...state.ui, loading: true, error: null } });
    try {
      const r = await api("/api/hitl");
      const faits = Array.isArray(r) ? r : (r.facts || []);
      // s.decisions = statut réel de chaque fait (source unique de vérité pour
      // Brouillons / Transmis / Rejetés). Sans ça, viewDrafts filtre sur {} -> rien ne s'affiche.
      const decisions = Object.fromEntries(faits.map(f => [f.fact_id, f.status || "PENDING_REVIEW"]));
      const publishedCount = (r && !Array.isArray(r) && typeof r.published_count === "number") ? r.published_count : undefined;
      const rejectedCount = (r && !Array.isArray(r) && typeof r.rejected_count === "number") ? r.rejected_count : undefined;
      const deletedCount = (r && !Array.isArray(r) && typeof r.deleted_count === "number") ? r.deleted_count : undefined;
      setState({ facts: faits, decisions, publishedCount, rejectedCount, deletedCount, ui: { ...state.ui, loading: false } });
      // B+C : forcer un 2e rendu après chargement complet. Le DOM doit refléter le
      // store stabilisé (80 facts, dont 3 EDITED -> Brouillons), pas un batch partiel
      // peint trop tôt (où les EDITED sont encore vus comme PENDING_REVIEW).
      setTimeout(() => { try { Store.setState({ ui: { ...Store.state.ui, _bcTick: Date.now() } }); } catch (_) {} }, 80);
    } catch (e) { setState({ facts: [], ui: { ...state.ui, loading: false, error: e.message } }); }
  }
  async function loadAudit() {
    try { setState({ audit: await api("/api/audit") }); }
    catch (e) { setState({ ui: { ...state.ui, error: e.message } }); }
  }
  async function loadSources() {
    try { setState({ sources: await api("/api/whitelist") }); }
    catch (e) { setState({ ui: { ...state.ui, error: e.message } }); }
  }
  // Page Vidéos (2026-08-21) : liste toutes les vidéos, quel que soit leur statut.
  async function loadVideos() {
    try { setState({ videos: (await api("/api/videos")).videos || [] }); }
    catch (e) { setState({ ui: { ...state.ui, error: e.message } }); }
  }
  // Centre de notifications persistant (2026-08-22). Silencieux en cas
  // d'échec (comme loadStats()) : un centre de notifications qui ne charge
  // pas ne doit jamais faire planter le reste du dashboard.
  async function loadNotifications() {
    try {
      const r = await api("/api/notifications");
      setState({ notifications: r.notifications || [], notifUnreadCount: r.unread_count || 0 });
    } catch (e) { /* silencieux */ }
  }
  async function markNotificationRead(id) {
    // Optimiste : coche tout de suite côté client, confirmé par le prochain
    // loadNotifications() (30s ou action explicite) -- pas la peine
    // d'attendre l'aller-retour réseau pour que le badge se corrige.
    const n = (state.notifications || []).find(x => x.id === id);
    if (n && !n.read) {
      n.read = true;
      setState({ notifications: state.notifications, notifUnreadCount: Math.max(0, state.notifUnreadCount - 1) });
    }
    try { await api("/api/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); }
    catch (e) { /* silencieux, corrige par le prochain loadNotifications() */ }
  }
  async function markAllNotificationsRead() {
    const marked = (state.notifications || []).map(n => ({ ...n, read: true }));
    setState({ notifications: marked, notifUnreadCount: 0 });
    try { await api("/api/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }); }
    catch (e) { /* silencieux */ }
  }
  // Gouvernance des sources ouverte à l'UI (2026-08-19, advanced uniquement
  // côté backend — voir permissions.py "gerer_sources"). addSource lève en
  // cas d'échec (id dupliqué, champs manquants) : à catcher par l'appelant.
  async function addSource(data) {
    const r = await api("/api/whitelist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    // api() ne lève pas sur un 4xx tant que le corps est du JSON valide -> il
    // faut vérifier explicitement le champ error renvoyé par le backend.
    if (r && r.error) throw new Error(r.error);
    await loadSources();
    return r;
  }
  async function updateSource(id, patch) {
    const r = await api("/api/whitelist/" + encodeURIComponent(id), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    if (r && r.error) throw new Error(r.error);
    await loadSources();
    return r;
  }
  async function loadSettings() {
    try { const s = await api("/api/settings"); applySettings(s); setState({ settings: s }); }
    catch (e) { /* settings optionnel */ }
  }
  function applySettings(s) {
    if (!s) return;
    setState({ app_name: s.app_name || state.app_name, settings: Object.assign({}, state.settings, s) });
    const root = document.documentElement;
    if (s.accent_coral) root.style.setProperty("--coral", s.accent_coral);
    if (s.accent_bordeaux) root.style.setProperty("--bordeaux", s.accent_bordeaux);
    // applique aussi les dérivés utilisés par le gradient/ombre
    if (s.accent_coral) root.style.setProperty("--coral-strong", shade(s.accent_coral, -0.12));
    // nom + logo dans le shell
    const nameEl = document.querySelector(".brand-name");
    const subEl = document.querySelector(".brand-sub");
    const markEl = document.querySelector(".brand-mark");
    if (nameEl && s.app_name) {
      const parts = s.app_name.split(/\s+(.+)/); // "KORA Agent" -> ["KORA","Agent"]
      nameEl.textContent = parts[0] || s.app_name;
      if (subEl) subEl.textContent = parts[1] || "";
    }
    if (markEl) {
      // BUG CORRIGÉ (critique design 2026-08-16) : les deux branches ci-dessous
      // réécrivaient .brand-name/.brand-sub avec un texte dérivé (ou carrément
      // codé en dur : "Agent") EN PLUS du bloc juste au-dessus qui le fait déjà
      // correctement à partir de s.app_name — la 2e écriture, plus tardive,
      // gagnait toujours et effaçait silencieusement toute mise à jour du nom/
      // sous-titre (ex. changer app_name en "KORA Veille Guinée" restait sans
      // effet visible, réécrasé par le "Agent" figé ici). Ce bloc ne touche
      // plus QUE l'icône/logo, jamais le texte — déjà géré plus haut, une
      // seule fois.
      const fav = s.favicon_data || s.logo_data;
      if (fav) {
        markEl.style.display = "";
        markEl.innerHTML = `<img src="${fav}" alt="" class="brand-fav-img">`;
        // favicon de l'onglet navigateur = icone kora seule
        try {
          let l = document.querySelector('link[rel="icon"]');
          if (!l) { l = document.createElement("link"); l.rel = "icon"; document.head.appendChild(l); }
          l.href = fav;
        } catch (e) {}
      } else {
        markEl.style.display = "";
        markEl.innerHTML = `<svg class="ic"><use href="#i-spark"/></svg>`;
      }
    }
    // Libellés d'interface (white-label) : navitems par data-route + tagline
    const routeMap = { cockpit: s.label_cockpit, facts: s.label_facts, sources: s.label_sources, drafts: s.label_drafts, audit: s.label_audit };
    Object.keys(routeMap).forEach(route => {
      const lbl = routeMap[route];
      if (!lbl) return;
      document.querySelectorAll(`.navitem[data-route="${route}"] span`).forEach(sp => { sp.textContent = lbl; });
    });
    if (s.app_tagline) {
      const tl = document.querySelector(".about-tagline");
      if (tl) tl.textContent = s.app_tagline;
    }
  }
  function shade(hex, pct) {
    const m = /^#?([0-9A-Fa-f]{6})$/.exec(hex || "");
    if (!m) return hex;
    let n = parseInt(m[1], 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (c) => Math.max(0, Math.min(255, Math.round(c + 255 * pct)));
    return "#" + ((1 << 24) + (f(r) << 16) + (f(g) << 8) + f(b)).toString(16).slice(1).toUpperCase();
  }
  // Le cycle tourne intégralement côté serveur (thread détaché + verrou
  // fichier, voir reach_agent.py) : un rechargement de page, un changement
  // d'onglet ou toute autre navigation NE L'INTERROMPT JAMAIS. Ce qui se
  // perdait avant la correction du 2026-08-19, c'est uniquement le SUIVI
  // client (le compteur "Article X sur Y", l'écran plein écran) — recréé en
  // mémoire du navigateur, il disparaissait à chaque F5 alors que le cycle
  // continuait en réalité en arrière-plan, donnant l'impression trompeuse
  // qu'un rechargement "coupait" la génération. _watchCycle() est désormais
  // le SEUL chemin qui pilote ce suivi, appelé soit juste après avoir posté
  // /api/cycle (startCycle), soit au démarrage de l'app pour RECOLLER l'UI
  // sur un cycle déjà en cours côté serveur (Store.resumeCycleWatch, voir
  // boot() dans app.js) — jamais deux boucles de suivi en parallèle
  // (_watching évite la double-boucle qui ferait sauter l'état en dépit
  // l'une de l'autre).
  // Estimation de temps (2026-08-19, demande explicite) : formate eta_seconds
  // (reach_agent._update_progress_eta(), déjà en secondes entières) en texte
  // court et intuitif, jamais plus précis que la minute (une estimation à la
  // seconde près serait trompeuse -- c'est une moyenne mobile, pas un minuteur).
  function _formatEta(sec) {
    if (sec == null || sec < 0) return "";
    if (sec < 45) return "moins d'une minute restante";
    const min = Math.round(sec / 60);
    return min <= 1 ? "≈ 1 min restante" : `≈ ${min} min restantes`;
  }
  // Bug corrigé 2026-08-19 (rapporté : l'écran de progression "revient au
  // tableau de bord" tout seul en pleine génération, sans plantage) : le
  // plafond de suivi était fixé à 240 tours × 3s = 12 min -- calibré à une
  // époque où un article prenait ~1-2 min. Depuis l'ajout de l'auto-critique
  // (jusqu'à 4 appels LLM séquentiels/article), la moyenne observée en prod
  // est de ~400s/article ; un cycle de 10 articles peut légitimement dépasser
  // 1h. Passé 12 min, ce suivi abandonnait alors que le cycle tournait
  // TOUJOURS réellement côté serveur -> l'écran de progression disparaissait
  // sans raison visible, exactement comme un retour au tableau de bord.
  // Aligné sur _MUTEX_TTL_SEC (reach_agent.py, 3600s) : le serveur lui-même
  // ne considère jamais un cycle légitime au-delà de cette durée.
  const _WATCH_MAX_ITER = 1300; // 1300 × 3s ≈ 65 min, marge au-dessus de 3600s
  // Marqueur de reprise optimiste (2026-08-19) : un onglet resté longtemps en
  // arrière-plan peut être DÉCHARGÉ par le navigateur (Chrome le fait sous
  // pression mémoire, d'autant plus probable avec des dizaines d'onglets
  // ouverts) -- au retour, la page se recharge ENTIÈREMENT depuis zéro. Entre
  // ce rechargement et la réponse de resumeCycleWatch() (un aller-retour
  // réseau), la page s'affiche brièvement SANS l'écran de progression --
  // perçu à tort comme "revenu au tableau de bord avant de repartir en
  // génération". Ce marqueur, lu de façon SYNCHRONE dès le tout premier
  // rendu (voir boot(), app.js), affiche l'écran de progression par
  // anticipation avant même la confirmation réseau ; resumeCycleWatch()
  // corrige ensuite si le cycle s'est en réalité terminé entre-temps.
  const _CYCLE_MARK_KEY = "kora-cycle-active";
  function _markCycleActive() { try { localStorage.setItem(_CYCLE_MARK_KEY, "1"); } catch (e) {} }
  function _clearCycleActive() { try { localStorage.removeItem(_CYCLE_MARK_KEY); } catch (e) {} }
  function wasCycleActiveBeforeLoad() { try { return localStorage.getItem(_CYCLE_MARK_KEY) === "1"; } catch (e) { return false; } }
  let _watching = false;
  async function _watchCycle() {
    if (_watching) return;
    _watching = true;
    try {
      for (let i = 0; i < _WATCH_MAX_ITER; i++) {
        const r = await api("/api/last");
        const p = r.progress || null;
        if (!r.running) {
          _clearCycleActive();
          // Le cycle est déjà terminé (ou n'a jamais démarré) : recharge
          // depuis l'API HITL (facts avec fact_id valide) plutôt que
          // r.result.facts (sans fact_id) -> sinon le clic carte casse.
          if (r.result) await loadHITL();
          setState({ lastCycle: r, ui: { ...state.ui, busy: false, cycleBusy: false, overlay: null, progress: null } });
          return;
        }
        _markCycleActive();
        const etaTxt = p && p.eta_seconds != null ? _formatEta(p.eta_seconds) : "";
        const label = p && p.total > 0
          ? `Article ${p.current || 1} sur ${p.total}…` + (etaTxt ? ` (${etaTxt})` : "")
          : "Collecte des sources en cours… (" + i * 3 + "s)";
        setState({ lastCycle: r, ui: { ...state.ui, busy: true, cycleBusy: true, overlay: label, progress: p } });
        await wait(3000);
      }
      // Dépassement du plafond de suivi (~65 min, voir ci-dessus) : le cycle
      // peut continuer légitimement côté serveur (aucun impact), on arrête
      // juste de le suivre ici pour ne pas boucler indéfiniment. Un F5 ou un
      // retour au premier plan relance le suivi (resumeCycleWatch).
      _clearCycleActive();
      setState({ ui: { ...state.ui, busy: false, cycleBusy: false, overlay: null, progress: null } });
    } catch (e) {
      setState({ ui: { ...state.ui, busy: false, cycleBusy: false, overlay: null, progress: null, error: e.message } });
    } finally {
      _watching = false;
    }
  }
  // demand : nb d'articles max explicitement voulu (optionnel — par défaut,
  // le backend génère TOUS les faits frais et uniques du cycle, voir
  // LOGIQUE-METIER-REACH.md §7). force : ignore la fenêtre 24h.
  // Signature objet (et non positionnelle) pour éviter les appels ambigus.
  // Fenêtre "requête de lancement en vol" (2026-08-19, revue de code) :
  // entre le clic et la réponse du serveur à POST /api/cycle, ce dernier n'a
  // pas encore forcément enregistré running=true -- si resumeCycleWatch()
  // (déclenché toutes les 30s ou à chaque retour au premier plan, ex.
  // l'utilisateur change d'onglet juste après avoir cliqué) interroge
  // /api/last pile dans cette fenêtre, il verrait à tort running=false et
  // effacerait l'état optimiste que startCycle() vient de poser -> flash de
  // l'écran de progression juste après son apparition.
  let _startingCycle = false;
  async function startCycle({ demand, force = false } = {}) {
    _startingCycle = true;
    setState({ ui: { ...state.ui, busy: true, cycleBusy: true, overlay: force ? "Génération forcée (hors fenêtre 24h)…" : "Collecte des sources whitelist…", progress: null, launchEstimate: null } });
    try {
      const started = await api("/api/cycle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ demand, force }) });
      _startingCycle = false;
      if (started && started.error === "cycle_en_cours") {
        // cycle_en_cours (un cycle tourne déjà, p.ex. lancé avant un F5) :
        // pas une vraie erreur -> on se raccorde simplement à CE cycle réel
        // au lieu d'afficher un échec pour une action qui, de son point de
        // vue, "n'a rien fait" alors qu'un cycle légitime est bien en vie.
        return _watchCycle();
      }
      // Bug corrigé 2026-08-21 : tout autre code d'erreur (ex: "video_en_cours",
      // verrou d'exclusivité vidéo) était traité comme "cycle_en_cours" et
      // déclenchait _watchCycle() -- qui aurait attendu indéfiniment un cycle
      // n'ayant JAMAIS démarré (bloqué en amont par le verrou vidéo).
      if (started && started.error) {
        setState({ ui: { ...state.ui, busy: false, cycleBusy: false, overlay: null,
          progress: null, error: started.detail || started.error } });
        return;
      }
      // Estimation immédiate (2026-08-19, demande explicite) : le backend
      // renvoie déjà un ordre de grandeur avant même de connaître le nombre
      // d'articles (ça, ça vient seulement après la collecte). Affichée tout
      // de suite dans le loader -- voir globalLoaderEstimate/cycleBannerEstimate
      // (app.js), remplacée par l'ETA en direct dès que le cycle progresse.
      if (started && started.estimate) {
        setState({ ui: { ...state.ui, launchEstimate: started.estimate } });
      }
    } catch (e) {
      _startingCycle = false;
      setState({ ui: { ...state.ui, busy: false, cycleBusy: false, overlay: null, progress: null, error: e.message } });
      return;
    }
    return _watchCycle();
  }
  // Appelé une seule fois au démarrage de l'app (boot(), après résolution de
  // la session) : si un cycle est déjà en cours côté serveur — lancé avant un
  // rechargement de page, ou par un autre onglet/appareil du même compte —
  // récupère l'écran de progression exactement là où il en est, sans poster
  // un nouveau /api/cycle (qui serait de toute façon refusé, 429). Rend le
  // rechargement transparent pour le suivi visuel du cycle en cours.
  async function resumeCycleWatch() {
    try {
      const r = await api("/api/last");
      if (r && r.running) {
        _watchCycle();
      } else if (state.ui.cycleBusy && !_startingCycle) {
        // Bug corrigé (revue de code 2026-08-19, trouvé avant mise en prod,
        // en 2 passes) :
        // 1) le marqueur optimiste posé par boot() ("Reconnexion au cycle en
        //    cours…", voir wasCycleActiveBeforeLoad) peut rester vrai à tort
        //    si _watchCycle() n'a jamais eu la chance de le nettoyer
        //    normalement (onglet fermé/tué en dur pendant un cycle, crash) --
        //    sans correction ici, rien d'autre ne le fait, et l'écran
        //    "Reconnexion..." resterait affiché indéfiniment à CHAQUE
        //    chargement, jusqu'à ce que l'utilisateur relance un cycle.
        // 2) MAIS resumeCycleWatch() est aussi appelé toutes les 30s
        //    (startAutoRefresh) et à chaque retour au premier plan de
        //    l'onglet, pas seulement au boot -- corriger ui.busy/overlay
        //    SANS CONDITION aurait pu écraser l'indicateur d'une action SANS
        //    RAPPORT en cours au même instant (decide/retract/restore...,
        //    qui posent aussi ui.busy/overlay). Le `else if (state.ui.
        //    cycleBusy)` limite la correction au SEUL cas où l'UI croit
        //    ACTUELLEMENT qu'un cycle tourne alors que le serveur dit le
        //    contraire -- jamais touché si cycleBusy est déjà faux (ui.busy
        //    générique laissé intact pour toute autre action).
        // 3) `!_startingCycle` : ferme une 2e fenêtre de course -- entre le
        //    clic sur "Lancer un cycle" et la réponse du serveur à
        //    POST /api/cycle, ce dernier peut ne pas avoir ENCORE enregistré
        //    running=true. Si resumeCycleWatch() interroge /api/last pile
        //    dans cette fenêtre (ex. l'utilisateur change d'onglet juste
        //    après avoir cliqué), il verrait à tort running=false et
        //    effacerait l'état optimiste que startCycle() vient de poser --
        //    flash de l'écran de progression juste après son apparition.
        // `lastCycle: r` (comme _watchCycle() à sa propre sortie) : sans ça,
        // state.lastCycle pouvait rester bloqué sur un {running:true} perimé
        // d'un poll precedent, ce qui aurait laisse les boutons du panneau
        // "Contrôle cycle" (app.js, cycleControl()/lastCycle?.running)
        // grisés à tort malgré cycleBusy correctement remis à false ici.
        _clearCycleActive();
        setState({ lastCycle: r, ui: { ...state.ui, busy: false, cycleBusy: false, overlay: null, progress: null } });
      }
    } catch (e) { /* silencieux : un échec ici ne doit jamais bloquer le boot */ }
  }
  // Interruption d'un cycle en cours (wireframe 3.3). Coopérative côté backend
  // (/api/cycle/cancel — reach_agent.cancel_cycle()) : l'arrêt survient après
  // l'article en cours, pas instantanément. La boucle de poll de startCycle()
  // continue de tourner normalement, elle verra running=false dès que le
  // backend aura effectivement arrêté.
  async function cancelCycle() {
    try {
      await api("/api/cycle/cancel", { method: "POST" });
      setState({ ui: { ...state.ui, overlay: "Interruption demandée — arrêt après l'article en cours…" } });
    } catch (e) { setState({ ui: { ...state.ui, error: e.message } }); }
  }
  // Chaîne de rafraîchissement post-mutation (2026-08-22, refacto dette #2) :
  // decide()/retract()/restoreFact()/deleteForever()/bulkAction() rechargeaient
  // chacune facts+corbeille+stats+vidéos en 4-5 lignes quasi identiques,
  // dupliquées 5 fois -- tout oubli lors d'un futur correctif (ex: le lien
  // avec la page Vidéos, ajouté le 2026-08-22) devait alors être répété
  // manuellement dans chaque fonction. Centralisé ici. En prime : les 4
  // lectures sont indépendantes (facts/trash/stats/videos ne partagent
  // aucune clé d'état), donc lancées en parallèle (Promise.allSettled) au
  // lieu d'enchaînées en série -- gain de vitesse en plus de la factorisation
  // (chaque await série coûtait un aller-retour réseau complet).
  // `includeTrash: true` pour decide() (peut trasher via la décision
  // "TRASHED")/restoreFact()/deleteForever() -- retract()/bulkAction() ne
  // touchent pas la corbeille. `includeVideos: false` uniquement pour
  // finishDraft() (remise en brouillon, jamais visible en page Vidéos).
  async function _refreshAfterMutation({ includeTrash = false, includeVideos = true } = {}) {
    const tasks = [loadHITL(), loadStats()];
    if (includeTrash) tasks.push(loadTrash());
    if (includeVideos) tasks.push(loadVideos());
    await Promise.allSettled(tasks);
  }

  // wpStatus (2026-08-22, demande explicite : "je veux les deux options
  // publier directement / placer en brouillon WordPress") -- optionnel,
  // n'ajoute wp_status au corps que si fourni (undefined = comportement
  // inchangé pour tous les appelants existants qui ne le passent pas ;
  // le backend retombe alors sur son propre défaut "publish", voir
  // server.py). Seul APPROVED en tient compte côté serveur.
  async function decide(factId, decision, editedText = "", wpStatus = undefined) {
    setState({ ui: { ...state.ui, busy: true, overlay: "Enregistrement…" } });
    try {
      const r = await api("/api/hitl/decide", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fact_id: factId, decision, edited_text: editedText, decided_by: "chef_de_secteur",
          ...(wpStatus ? { wp_status: wpStatus } : {}),
        })
      });
      // Bug corrigé 2026-08-20 (9e passage de revue) : ne garder que r.error
      // perdait r.detail (ex: message "l'état a changé entre-temps,
      // réessayez" du garde-fou anti-concurrence de decide()) -- l'appelant
      // (friendlyActionError() dans app.js) ne pouvait alors matcher que le
      // code générique, jamais le message plus précis.
      if (r.error) throw new Error(r.detail || r.error);
      // Rafraîchit facts + corbeille + stats + vidéos (SSOT) pour refléter la
      // décision immédiatement (sinon l'article semble "ne rien faire" à
      // l'écran) -- corbeille incluse (une décision peut trasher l'article),
      // vidéos incluses (interconnexion page Vidéos, demande du 2026-08-22).
      await _refreshAfterMutation({ includeTrash: true });
      setState({ ui: { ...state.ui, busy: false, overlay: null } });
      return r;
    } catch (e) {
      // Bug corrigé 2026-08-20 : cette erreur était avalée ici (contrairement à
      // regenerate()/bulkAction() qui la relancent) — l'appelant (app.js) ne
      // voyait donc JAMAIS l'échec d'une transition refusée (ex: REJECTED ->
      // EDITED avant ce correctif) : le tiroir se fermait comme si tout avait
      // marché, sans aucune trace visible pour l'utilisateur.
      setState({ ui: { ...state.ui, busy: false, overlay: null, error: e.message } });
      throw e;
    }
  }

  async function retract(factId) {
    // Bug corrigé 2026-08-20 (2e passage de revue de code) : un refus du
    // window.confirm() résolvait la promesse (undefined), indissociable
    // d'un succès pour l'appelant -- le tiroir se fermait donc quand même,
    // alors que l'utilisateur venait explicitement de dire non.
    if (!window.confirm("Annuler cette décision ? L'article repassera en attente de validation.")) return { cancelled: true };
    setState({ ui: { ...state.ui, busy: true, overlay: "Annulation de la décision…" } });
    try {
      const r = await api("/api/hitl/retract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fact_id: factId }) });
      if (r.error) throw new Error(r.error);
      await _refreshAfterMutation(); // pas de corbeille : retract() ne trashe jamais
      setState({ ui: { ...state.ui, busy: false, overlay: null } });
      // Bug corrigé 2026-08-20 (10e passage de revue) : contrairement à
      // decide() (voir plus haut, `return r;`), le succès ne renvoyait rien
      // -- seul appelant actuel (app.js) ne lit que r.cancelled donc c'était
      // masqué, mais tout futur appelant lisant r.status/r.fact_id aurait
      // silencieusement reçu undefined.
      return r;
    } catch (e) {
      // Même correctif que decide() ci-dessus : ne plus avaler l'échec.
      setState({ ui: { ...state.ui, busy: false, overlay: null, error: e.message } });
      throw e;
    }
  }
  function setRoute(r) { setState({ route: r }); }
  function openSheet(s) { setState({ sheet: s }); }
  function closeSheet() { setState({ sheet: null }); }

  // Centre de notifications (10.2) : DÉLIBÉRÉMENT PAS dans le Store réactif.
  // Voir app.js (_notifications, addNotif) — un setState ici déclencherait un
  // re-render complet à chaque snack(), qui referme tout tiroir ouvert
  // ailleurs dans l'app (bug constaté : sauvegarde d'avatar refermant le
  // panneau Paramètres > Compte qu'elle venait elle-même de rouvrir).
  // Guide d'accueil / onboarding (tour spotlight + bandeau "vous semblez
  // perdu") RETIRÉ (2026-08-23, demande explicite de l'utilisateur) --
  // getGuidesEnabled/setGuidesEnabled/hasSeenTour/markTourSeen supprimés,
  // voir tour.js pour ce qui reste (bulles d'aide "?" contextuelles,
  // fonctionnalité distincte conservée).
  function getFactFilter() { return state.ui.factFilter || "all"; }
  function setFactFilter(f) { setState({ ui: { ...state.ui, factFilter: f } }); }
  function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // ---- Thème (dark par défaut, + light cassé & cacao color) ----
  const THEMES = ["dark", "light", "cacao"];
  function getTheme() { return state.ui.theme || "dark"; }
  function applyTheme(t) {
    const root = document.documentElement;
    if (root) root.setAttribute("data-theme", t);
  }
  function setTheme(t) {
    if (!THEMES.includes(t)) t = "dark";
    try { localStorage.setItem("kora-theme", t); } catch (e) {}
    applyTheme(t);
    setState({ ui: { ...state.ui, theme: t } });
  }
  function initTheme() {
    // KORA = neumorphisme SOMBRE par défaut (charte imposée). On ignore
    // prefers-color-scheme pour éviter d'afficher le thème clair cassé.
    let t = "dark";
    try {
      t = localStorage.getItem("kora-theme") || "dark";
      // Migration one-shot : un reglage 'light' résiduel (ancien auto-detect
      // via prefers-color-scheme) est remis en dark. Un choix 'light' EXPLICITE
      // via l'UI (setTheme) reste respecté car applyTheme le rejoue.
      if (t === "light") { localStorage.setItem("kora-theme", "dark"); t = "dark"; }
    } catch (e) {}
    if (!THEMES.includes(t)) t = "dark";
    applyTheme(t);
    return t;
  }

  // ---- Rail adaptive (M3) : mode = auto | collapsed | expanded ----
  // Le rail est une colonne fixe dès 768px (RAIL_FIXED_MIN) ; en dessous
  // c'est un tiroir coulissant (.rail.open), un tout autre système d'affichage
  // auquel data-rail ne s'applique pas.
  // "auto" résout vers une valeur EXPLICITE selon le palier (compact sur
  // tablette, large sur desktop dès RAIL_DESKTOP_MIN) — jamais d'attribut
  // absent au-delà de 768px. Avant ce correctif, "auto" laissait l'attribut
  // absent sur toute la plage 768-1023px : le CSS de masquage/centrage
  // "collapsed" (voir bloc RÉFONTE RAIL v2 dans style.css) ne se déclenchait
  // alors JAMAIS, et le rail affichait par défaut des icônes orphelines avec
  // des libellés non masqués (juste écrasés à 0px de large par le flexbox) —
  // bug constaté en vérifiant en preview live (revue sidebar desktop/tablette).
  const RAIL_MODES = ["auto", "collapsed", "expanded"];
  const RAIL_FIXED_MIN = 768;   // en dessous : tiroir coulissant, pas de data-rail
  const RAIL_DESKTOP_MIN = 1024; // palier où "auto" bascule vers "expanded"
  function getRailMode() { return state.ui.railMode || "auto"; }
  function applyRailMode(m) {
    const root = document.documentElement;
    const w = window.innerWidth || document.documentElement.clientWidth || 0;
    if (w < RAIL_FIXED_MIN) {
      // Tiroir mobile : le rail n'est pas une colonne fixe, data-rail n'a pas de sens ici.
      root.removeAttribute("data-rail");
      return;
    }
    const effective = (m === "auto") ? (w < RAIL_DESKTOP_MIN ? "collapsed" : "expanded") : m;
    root.setAttribute("data-rail", effective);
  }
  function setRailMode(m) {
    if (!RAIL_MODES.includes(m)) m = "auto";
    try { localStorage.setItem("kora-rail-mode", m); } catch (e) {}
    applyRailMode(m);
    setState({ ui: { ...state.ui, railMode: m } });
  }
  let _railResizeBound = false;
  function initRailMode() {
    let m = "auto";
    try { m = localStorage.getItem("kora-rail-mode") || "auto"; } catch (e) {}
    if (!RAIL_MODES.includes(m)) m = "auto";
    applyRailMode(m);
    // Recalcule au franchissement d'un palier (redimensionnement fenêtre desktop,
    // rotation tablette) — sans ça, data-rail restait figé sur la valeur calculée
    // au chargement même après un resize traversant 768px/1024px.
    if (!_railResizeBound) {
      _railResizeBound = true;
      let t = null;
      window.addEventListener("resize", () => {
        clearTimeout(t);
        t = setTimeout(() => applyRailMode(getRailMode()), 150);
      });
    }
    return m;
  }
  // Alias rétro-compat (ancien UI pré-M3 : app.js utilise getRail/setRail pour
  // le bouton replier/déplier). IMPORTANT : reflète la valeur EFFECTIVEMENT
  // affichée (résolution de "auto" selon le palier actuel), pas le mode brut —
  // sinon un premier clic en mode "auto" sur tablette semblait ne rien faire
  // (le rail était déjà visuellement compact) puis "repliait" un rail déjà
  // replié au lieu de proposer l'agrandissement (bug constaté en preview live).
  function getRail() {
    const m = getRailMode();
    if (m !== "auto") return m;
    const w = window.innerWidth || document.documentElement.clientWidth || 0;
    return w < RAIL_DESKTOP_MIN ? "collapsed" : "expanded";
  }
  function setRail(r) { setRailMode(r === "collapsed" ? "collapsed" : "expanded"); }

  // ---- Sélection multiple + actions en masse ----
  function setSelectMode(on) {
    setState({ selectMode: !!on, selection: on ? state.selection : {} });
  }
  function toggleSelect(factId) {
    const sel = { ...state.selection };
    if (sel[factId]) delete sel[factId]; else sel[factId] = true;
    setState({ selection: sel });
  }
  function clearSelection() {
    setState({ selection: {}, selectMode: false });
  }
  function selectedIds() { return Object.keys(state.selection); }

  async function bulkAction(action, opts = {}) {
    const ids = selectedIds();
    if (!ids.length) return { ok: true, done: 0, total: 0 };
    setState({ ui: { ...state.ui, busy: true, overlay: "Action en masse…" } });
    try {
      const body = { ids, action, wp_status: opts.wp_status || "publish" };
      const r = await api("/api/hitl/bulk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.error) throw new Error(r.error);
      await _refreshAfterMutation(); // pas de corbeille : bulkAction() (publier/rejeter) ne trashe jamais
      setState({ selection: {}, selectMode: false, ui: { ...state.ui, busy: false, overlay: null } });
      return r;
    } catch (e) {
      setState({ ui: { ...state.ui, busy: false, overlay: null, error: e.message } });
      throw e;
    }
  }

  async function restoreFact(factId) {
    setState({ ui: { ...state.ui, busy: true, overlay: "Restauration…" } });
    try {
      const r = await api("/api/hitl/trash/restore", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact_id: factId }),
      });
      if (r.error) throw new Error(r.error);
      await _refreshAfterMutation({ includeTrash: true });
      setState({ ui: { ...state.ui, busy: false, overlay: null } });
      return r;
    } catch (e) {
      setState({ ui: { ...state.ui, busy: false, overlay: null, error: e.message } });
      throw e;
    }
  }

  async function deleteForever(ids) {
    setState({ ui: { ...state.ui, busy: true, overlay: "Suppression définitive…" } });
    try {
      const r = await api("/api/hitl/delete", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (r.error) throw new Error(r.error);
      // Disparition IMMEDIATE : on retire les ids de l'etat local AVANT le rechargement
      // (le backend a deja purge). Ferme aussi tout tiroir ouvert pour eviter
      // d'afficher un article devenu fantome.
      const set = new Set(ids);
      const curFacts = (state.facts || []).filter(f => !set.has(f.fact_id));
      const curTrash = (state.trash || []).filter(f => !set.has(f.fact_id));
      // Retrait immédiat aussi de la page Vidéos (même principe que
      // facts/trash ci-dessus) -- sinon une vidéo supprimée définitivement
      // depuis CETTE page resterait affichée jusqu'au prochain rechargement.
      const curVideos = (state.videos || []).filter(f => !set.has(f.fact_id));
      closeSheet();
      setState({ facts: curFacts, trash: curTrash, videos: curVideos });
      await _refreshAfterMutation({ includeTrash: true });
      setState({ ui: { ...state.ui, busy: false, overlay: null } });
      return r;
    } catch (e) {
      setState({ ui: { ...state.ui, busy: false, overlay: null, error: e.message } });
      throw e;
    }
  }

  // Ramener un brouillon "à la normale" (en attente de validation) SANS publier.
  async function finishDraft(factId) {
    setState({ ui: { ...state.ui, busy: true, overlay: "Remise en attente…" } });
    try {
      const r = await api("/api/hitl/decide", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact_id: factId, decision: "PENDING_REVIEW", decided_by: "chef_de_secteur" })
      });
      if (r.error) throw new Error(r.error);
      await _refreshAfterMutation({ includeVideos: false }); // brouillon : jamais visible en page Vidéos
      setState({ ui: { ...state.ui, busy: false, overlay: null } });
      return r;
    } catch (e) {
      setState({ ui: { ...state.ui, busy: false, overlay: null, error: e.message } });
      throw e;
    }
  }

  async function loadTrash() {
    try {
      const r = await api("/api/hitl/trash");
      if (!r.error && r.items) setState({ trash: r.items, trashLoaded: true });
      else setState({ trashLoaded: true });
      return r;
    } catch (e) {
      // Échec ou pas, la tentative a eu lieu : ne jamais rester bloqué sur
      // l'état "pas encore chargé" indéfiniment si /api/hitl/trash échoue.
      setState({ trashLoaded: true });
      throw e;
    }
  }

  async function loadStats() {
    // SSOT : rafraîchit les compteurs certifiés après toute mutation
    // (sinon les cartes du dashboard restent figées jusqu'au prochain reload).
    try { const st = await api("/api/stats"); if (st && !st.error) setState({ stats: st }); }
    catch (_) {}
  }

  // ============================================================
  // COCKPIT — Agrégation multi-API + Auto-refresh
  // ============================================================
  async function loadAll() {
    // Charge tout en parallèle pour le cockpit
    try {
      setState({ ui: { ...state.ui, loading: true, error: null } });
      const [health, audit, hitl, sources, stats] = await Promise.allSettled([
        api("/api/health"),
        api("/api/audit"),
        api("/api/hitl"),
        api("/api/whitelist"),
        api("/api/stats"),
      ]);
      const h = health.status === "fulfilled" ? health.value : null;
      const a = audit.status === "fulfilled" ? audit.value : { days: [], total: 0 };
      // /api/hitl renvoie {facts, published_count} (depuis 2026-08-14).
      // Extractible pour rester compatible si un jour l'API renvoie un tableau.
      const _hitl = hitl.status === "fulfilled" ? hitl.value : [];
      const f = Array.isArray(_hitl) ? _hitl : (_hitl.facts || []);
      const s = sources.status === "fulfilled" ? sources.value : [];
      const st = stats.status === "fulfilled" ? stats.value : null;
      
      // decisions map pour filtres (source unique de vérité)
      const decisions = Object.fromEntries((f || []).map(fact => [fact.fact_id, fact.status || "PENDING_REVIEW"]));
      
      setState({ 
        health: h, 
        audit: a, 
        facts: f, 
        decisions, 
        sources: s,
        stats: st,
        ui: { ...state.ui, loading: false, lastRefresh: Date.now() } }
      );
    } catch (e) {
      setState({ ui: { ...state.ui, loading: false, error: e.message } });
    }
  }

  let _refreshTimer = null;
  function startAutoRefresh(intervalMs = 30000) {
    stopAutoRefresh();
    _refreshTimer = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadAll();
        // Raccroche le suivi d'un cycle démarré ailleurs (autre appareil/
        // onglet) pendant que cette session tournait déjà -- sinon son
        // écran de progression n'apparaît jamais ici (voir _onVisibilityChange).
        resumeCycleWatch();
        resumeVideoWatch();
        loadNotifications();
      }
    }, intervalMs);
    // Recharge aussi quand l'onglet redevient visible
    document.addEventListener("visibilitychange", _onVisibilityChange);
  }
  function stopAutoRefresh() {
    if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
    document.removeEventListener("visibilitychange", _onVisibilityChange);
  }
  function _onVisibilityChange() {
    if (document.visibilityState === "visible") {
      loadAll();
      // Bug rapporté 2026-08-19 : un cycle lancé depuis un autre appareil/
      // onglet (ex: desktop) restait invisible sur mobile jusqu'au prochain
      // tick des 30s -- loadAll() recharge bien les faits, mais ne raccroche
      // jamais le SUIVI de progression (écran plein écran, "Article X sur
      // Y") si le cycle a démarré APRÈS le chargement initial de CETTE
      // session. resumeCycleWatch() est sans effet si aucun cycle ne tourne
      // (un seul GET /api/last), donc sûr à appeler à chaque retour au
      // premier plan. Même chose pour resumeVideoWatch() (bandeau vidéo).
      resumeCycleWatch();
      resumeVideoWatch();
      loadNotifications();
    }
  }

  // Régénère UN article depuis les infos déjà acquises (aucun re-scrape).
  // suggestion = id d'angle parmi /api/regen-suggestions, ou null (neutre).
  async function regenerate(fact_id, suggestion) {
    setState({ ui: { ...state.ui, busy: true, error: null } });
    try {
      const r = await api("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact_id, suggestion: suggestion || null }),
        // 120s -> 400s (2026-08-19) : l'auto-critique ajoute jusqu'à 2 appels
        // LLM supplémentaires (critique + correction ciblée) au pipeline de
        // rédaction -- un cas défavorable (fournisseur lent + les deux
        // appels déclenchés) peut désormais dépasser 120s. Aligné sous le
        // proxy_read_timeout nginx (600s, /kora-v2/api/), avec marge.
        timeout: 400000,
      });
      // r.detail || r.error (2026-08-21) : privilégie le message clair côté
      // serveur (ex: "video_en_cours" -> "Une vidéo est déjà en cours...").
      if (r.error) throw new Error(r.detail || r.error);
      return r;  // { fact_id, article, model, status, suggestion_applied, angle }
    } catch (e) {
      setState({ ui: { ...state.ui, error: e.message } });
      throw e;
    } finally {
      setState({ ui: { ...state.ui, busy: false } });
    }
  }

  // Vidéo narrée (2026-08-20, simplifiée 2026-08-21 : 1-3 min) : démarre en
  // arrière-plan côté serveur, jamais bloquant -- l'appelant (app.js) poll
  // ensuite getVideoStatus() à intervalle régulier jusqu'à done/error.
  async function startVideoGeneration(fact_id) {
    const r = await api("/api/video/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fact_id }),
    });
    // r.detail || r.error (2026-08-21) : privilégie le message clair côté
    // serveur (ex: "Une vidéo est déjà en cours...", "un cycle est en
    // cours...") au code brut -- même correctif que decide()/retract().
    if (r.error) throw new Error(r.detail || r.error);
    return r;
  }
  async function getVideoStatus(fact_id) {
    return api(`/api/video/status?fact_id=${encodeURIComponent(fact_id)}`);
  }

  // Applique un patch de statut vidéo partout où le fait apparaît (liste
  // Actifs, page Vidéos, fiche ouverte) -- même principe que le sondage
  // local qui vivait avant dans app.js (2026-08-20), mais déplacé ici pour
  // continuer à tourner même si la fiche/page d'origine a été quittée.
  function _patchVideoEverywhere(fact_id, patch) {
    const inFacts = (state.facts || []).find(x => x.fact_id === fact_id);
    if (inFacts) Object.assign(inFacts, patch);
    const inVideos = (state.videos || []).find(x => x.fact_id === fact_id);
    if (inVideos) Object.assign(inVideos, patch);
    if (state.sheet && state.sheet.fact && state.sheet.fact.fact_id === fact_id) {
      Object.assign(state.sheet.fact, patch);
    }
  }

  // Bandeau vidéo global (2026-08-21, demande explicite) : démarre le job ET
  // le sondage -- survit à la navigation/fermeture de la fiche d'origine,
  // contrairement à l'ancien sondage local scopé au DOM du sheet.
  async function startVideoJob(fact_id, title) {
    await startVideoGeneration(fact_id); // laisse l'appelant catcher l'échec de démarrage
    setState({ videoJob: { fact_id, title: title || "", status: "generating", stage: null, error: null } });
    setTimeout(() => _pollVideoJob(fact_id), 8000);
  }
  async function _pollVideoJob(fact_id) {
    // Un autre job a démarré entre-temps (ou celui-ci a déjà été refermé) -> on arrête.
    if (!state.videoJob || state.videoJob.fact_id !== fact_id) return;
    try {
      const st = await getVideoStatus(fact_id);
      _patchVideoEverywhere(fact_id, {
        video_status: st.video_status, video_stage: st.video_stage,
        video_path: st.video_path, video_duration_sec: st.video_duration_sec,
        video_error: st.video_error,
      });
      if (st.video_status === "generating") {
        setState({ videoJob: { ...state.videoJob, status: "generating", stage: st.video_stage } });
        setTimeout(() => _pollVideoJob(fact_id), 8000);
        return;
      }
      setState({ videoJob: { ...state.videoJob, status: st.video_status, stage: null, error: st.video_error } });
      // Laisse le message final (fait / erreur) visible quelques secondes
      // avant de masquer le bandeau -- sinon la réussite/l'échec passe inaperçu.
      setTimeout(() => {
        if (state.videoJob && state.videoJob.fact_id === fact_id) setState({ videoJob: null });
      }, 6000);
    } catch (e) {
      setTimeout(() => _pollVideoJob(fact_id), 8000);
    }
  }
  // Reconnexion au bandeau vidéo global (2026-08-21) — même principe que
  // resumeCycleWatch() : /api/last expose désormais aussi video_lock (verrou
  // serveur, voir server.py VIDEO_LOCK), déjà polle toutes les 30s / à chaque
  // retour au premier plan. Sans ceci, le bandeau ne réapparaissait qu'à la
  // session ayant elle-même déclenché la génération -- un F5, un cycle
  // suivi depuis un autre onglet/appareil, ou l'ouverture d'un tout nouvel
  // onglet pendant qu'une vidéo tourne déjà laissait le bandeau invisible
  // jusqu'à rouvrir la fiche de l'article concerné.
  async function resumeVideoWatch() {
    try {
      const r = await api("/api/last");
      const vl = r && r.video_lock;
      if (vl && vl.running && vl.fact_id && (!state.videoJob || state.videoJob.fact_id !== vl.fact_id)) {
        setState({ videoJob: { fact_id: vl.fact_id, title: vl.title || "", status: "generating", stage: null, error: null } });
        _pollVideoJob(vl.fact_id);
      }
    } catch (e) { /* silencieux : même principe que resumeCycleWatch() */ }
  }

  return {
    state, setState, subscribe, api,
    loadHealth, loadLast, loadHITL, loadAudit, loadSources, loadVideos, addSource, updateSource, loadSettings, applySettings,
    loadNotifications, markNotificationRead, markAllNotificationsRead,
    startCycle, resumeCycleWatch, cancelCycle, decide, retract, setRoute, openSheet, closeSheet, wait,
    startVideoGeneration, getVideoStatus, startVideoJob, resumeVideoWatch,
    formatEta: _formatEta,
    wasCycleActiveBeforeLoad,
    getFactFilter, setFactFilter,
    getTheme, setTheme, initTheme,
    getRailMode, setRailMode, initRailMode, applyRailMode,
    // alias rétro-compat (certains appels utilisent initRail)
    initRail: initRailMode,
    getRail, setRail,
    checkAuth, login, logout, changePassword, saveAvatar, forgot, resetPassword,
    verifyLoginTotp, get2FAStatus, setup2FA, confirm2FA, disable2FA,
    loadUsers, createUser, setRole, deleteUser, setWpPublish,
    inviteUser, loadInvitations, revokeInvitation, resendInvitation, checkInvite, acceptInvite,
    setSelectMode, toggleSelect, clearSelection, selectedIds,
    bulkAction, restoreFact, deleteForever, loadTrash, finishDraft,
    regenerate,
    // Cockpit
    loadAll, startAutoRefresh, stopAutoRefresh
  };
})();
