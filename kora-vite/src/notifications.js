/* ============================================================
   KORA — notifications.js : centre de notifications (cloche #notifBell,
   panneau #notifPanel). Extrait de app.js le 22/08/2026 (refacto plan
   étape 4). Affichage + clic -> navigation uniquement ; la persistance
   (chargement, marquage lu) vit dans store.js (loadNotifications() etc).
   ============================================================ */
import { Store } from "./store.js";
import { esc, icon } from "./utils.js";
import { navigate, openFact } from "./app.js";

// ============================================================================
// CENTRE DE NOTIFICATIONS (2026-08-22, refonte) — PERSISTANT côté serveur
// (editorial/notifications.py, table `notifications`), plus un simple
// historique local des toasts snack() de la session courante : survit au
// rechargement, partagé entre onglets/appareils, signale un cycle ou une
// vidéo terminés même si personne ne regardait au bon moment (voir
// Store.loadNotifications(), appelée au boot + toutes les 30s + retour au
// premier plan). Source de vérité = Store.state.notifications ; ce module
// ne fait QUE l'affichage + le clic -> navigation.
// ============================================================================
function _notifGroupLabel(ts) {
  const d = new Date(ts), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return "Aujourd'hui";
  const diffDays = Math.floor((now - d) / 86400000);
  return diffDays <= 7 ? "Cette semaine" : "Plus ancien";
}
// Horodatage relatif court ("à l'instant", "12 min", "3 h", puis heure exacte
// au-delà d'une journée) -- avant ce correctif, seul le groupe du jour
// ("Aujourd'hui") était affiché, aucune indication de l'heure précise.
function _notifTime(ts) {
  const d = new Date(ts);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `${diffMin} min`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)} h`;
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function _notifIcon(type) {
  if (type === "video_error" || type === "cycle_error") return icon("i-close", "notif-ic-error");
  if (type === "video_done" || type === "cycle_done") return icon("i-check", "notif-ic-success");
  // Veille passive (2026-08-26) : icône dédiée pour distinguer "du nouveau
  // contenu est disponible, à toi de décider" d'une simple info générique.
  if (type === "watch_new_content") return icon("i-spark", "notif-ic-info");
  return icon("i-info");
}
function renderNotifCenter() {
  const countEl = document.getElementById("notifCount");
  const bodyEl = document.getElementById("notifBody");
  if (!countEl || !bodyEl) return;
  const list = Store.state.notifications || [];
  const unread = Store.state.notifUnreadCount || 0;
  countEl.hidden = unread === 0;
  countEl.textContent = unread > 9 ? "9+" : String(unread);
  if (!list.length) {
    bodyEl.innerHTML = `<p class="muted notif-empty">Aucune notification pour l'instant.</p>`;
    return;
  }
  const groups = {};
  for (const n of list) {
    const g = _notifGroupLabel(n.ts);
    (groups[g] = groups[g] || []).push(n);
  }
  // data-notif-id/data-route/data-fact-id (2026-08-22) : clic -> marque lu +
  // navigue vers l'élément concerné (page Vidéos, fiche article...) --
  // avant ce correctif, une notification n'était qu'un texte inerte.
  bodyEl.innerHTML = Object.entries(groups).map(([label, items]) => `
    <div class="notif-group-label">${esc(label)}</div>
    ${items.map(n => `
      <button type="button" class="notif-item ${n.read ? "" : "notif-unread"}" data-notif-id="${esc(n.id)}" data-route="${esc(n.route || "")}" data-fact-id="${esc(n.fact_id || "")}">
        ${_notifIcon(n.type)}
        <span class="notif-item-body">
          <span class="notif-item-msg">${esc(n.message)}</span>
          <span class="notif-item-time">${esc(_notifTime(n.ts))}</span>
        </span>
      </button>`).join("")}
  `).join("");
  bodyEl.querySelectorAll("[data-notif-id]").forEach(b => b.onclick = () => {
    const id = parseInt(b.dataset.notifId, 10);
    if (id) Store.markNotificationRead(id);
    const route = b.dataset.route;
    const factId = b.dataset.factId;
    document.getElementById("notifPanel").hidden = true;
    if (route) navigate(route);
    if (factId) setTimeout(() => openFact(factId), 50); // laisse navigate() charger la liste d'abord
  });
}

export { renderNotifCenter };
