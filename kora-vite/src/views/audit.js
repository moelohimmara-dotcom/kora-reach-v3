/* ============================================================
   KORA — views/audit.js : page Historique (journal d'audit, purge
   d'événements sélectionnés). Extrait de app.js le 22/08/2026 (refacto
   plan étape 4).
   ============================================================ */
import { Store } from "../store.js";
import { esc, icon, snack, stateBox } from "../utils.js";
import { confirmAction } from "../sheet.js";

function viewAudit(s) {
  const data = s.audit || {};
  const days = data.days || [];
  const total = data.total || 0;
  if (!days.length) return stateBox("i-audit", "Historique vide", "Aucune activité enregistrée pour l'instant. Lance un cycle pour peupler l'historique.", false);
  const ACTION_FR = { GENERE: "Générés", TRANSMIS: "Transmis", APPROUVE: "Approuvés", REJETE: "Rejetés", MODIFIE: "Modifiés", SUPPRIME: "Supprimés", CORBEILLE: "Corbeille", CYCLE: "Cycles", PURGE: "Purges", ADMIN: "Admin", AUTRE: "Autres" };
  const ACTION_CLS = { GENERE: "primary", TRANSMIS: "tertiary", APPROUVE: "tertiary", REJETE: "error", MODIFIE: "warning", SUPPRIME: "error", CORBEILLE: "error", CYCLE: "secondary", PURGE: "secondary", ADMIN: "secondary", AUTRE: "secondary" };
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
    const statusFr = { TRANSMITTED: "Transmis", APPROVED: "Approuvé", REJECTED: "Rejeté", EDITED: "Modifié", PENDING_REVIEW: "À approuver", TRANSMISSION_FAILED: "Échec d'envoi" };
    const parts = [];
    if (pairs.src) parts.push("source : " + pairs.src);
    const st = pairs.status || pairs.decision;
    if (st) parts.push("statut : " + (statusFr[st.toUpperCase()] || st));
    if (pairs.facts) parts.push(pairs.facts + " fait(s)");
    // pairs.dossiers (2026-08-26, audit de nommage Temps 2 : anciennement
    // "clusters") -- lu depuis la ligne de log CYCLE_END ("dossiers=N"),
    // voir orchestration/reach_agent.py.
    if (pairs.dossiers) parts.push(pairs.dossiers + " groupe(s)");
    if (ev.editor) parts.push("par " + ev.editor);
    if (parts.length) return parts.join(" · ");
    const clean = d.replace(/\s+/g, " ").trim();
    return clean.length > 90 ? clean.slice(0, 87).replace(/\s+\S*$/, "") + "…" : clean;
  };
  // Heure lisible (HH:MM) depuis le ts ISO
  const auditTime = (ev) => {
    const t = (ev.ts || "").replace("T", " ").slice(0, 16);
    return t.slice(11) || t;
  };
  const filt = s.auditFilter || { type: "all", q: "" };
  const matchEv = (ev) => {
    if (filt.type && filt.type !== "all") {
      const a = (ev.action || "").toUpperCase();
      if (filt.type === "corbeille" && a !== "SUPPRIME" && a !== "CORBEILLE") return false;
      if (filt.type !== "corbeille" && a !== filt.type.toUpperCase()) return false;
    }
    if (filt.q) {
      const blob = ((ev.transition||"")+" "+(ev.detail||"")+" "+(ev.action||"")+" "+(ev.editor||"")+" "+(ev.event||"")).toLowerCase();
      if (!blob.includes(filt.q.toLowerCase())) return false;
    }
    return true;
  };
  const visEvents = (day) => day.events.filter(matchEv);
  const evRow = (ev) => `
    <div class="list-row audit-row" data-ev="${esc(ev.id)}">
      <input type="checkbox" class="audit-check" data-id="${esc(ev.id)}" aria-label="Sélectionner">
      <span class="meta-ic">${icon(ev.kind === "reject" ? "i-reject" : ev.kind === "edit" ? "i-edit" : "i-check")}</span>
      <div class="meta">
        <div class="name">${esc(auditLabel(ev))} ${transitionBadge(ev)}</div>
        <div class="sub">${esc(auditSub(ev))}</div>
      </div>
      <div class="sub audit-time">${esc(auditTime(ev))}</div>
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
      <div class="audit-events">${visEvents(day).map(evRow).join("")}</div>
    </section>`;
  return `<div class="section-title">Historique <span class="muted">(${total} événement(s))</span></div>
    <div class="audit-filters">
      <div class="audit-filter-chips">
        <button class="chip-filter ${filt.type==='all'?'active':''}" data-type="all">Tous</button>
        <button class="chip-filter ${filt.type==='transmis'?'active':''}" data-type="transmis">Transmis</button>
        <button class="chip-filter ${filt.type==='rejete'?'active':''}" data-type="rejete">Rejetés</button>
        <button class="chip-filter ${filt.type==='modifie'?'active':''}" data-type="modifie">Modifiés</button>
        <button class="chip-filter ${filt.type==='genere'?'active':''}" data-type="genere">Générés</button>
        <button class="chip-filter ${filt.type==='cycle'?'active':''}" data-type="cycle">Cycles</button>
        <button class="chip-filter ${filt.type==='corbeille'?'active':''}" data-type="corbeille">Corbeille</button>
      </div>
      <input class="text-input audit-search" id="auditSearch" type="search" placeholder="Rechercher (libellé, détail, éditeur)…" value="${esc(filt.q||'')}">
    </div>
    <div class="audit-toolbar">
      <button class="btn btn-ghost btn-sm" id="auditSelAll">Tout sélectionner</button>
      <button class="btn btn-ghost btn-sm" id="auditSelNone">Désélectionner</button>
      <button class="btn btn-danger btn-sm" id="auditDelSel" disabled>Supprimer la sélection</button>
      <button class="btn btn-outline btn-sm" id="auditExport">Exporter (CSV)</button>
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
  // Filtres par type + recherche (côté client)
  const applyFilt = (patch) => { Store.setState({ auditFilter: Object.assign({}, Store.state.auditFilter, patch) }); };
  view.querySelectorAll(".chip-filter").forEach(ch => ch.onclick = () => applyFilt({ type: ch.dataset.type }));
  const search = document.getElementById("auditSearch");
  if (search) search.oninput = () => applyFilt({ q: search.value });
  // Export CSV de la sélection (fetch brut : le serveur renvoie text/csv)
  const exportBtn = document.getElementById("auditExport");
  if (exportBtn) exportBtn.onclick = async () => {
    const ids = checks();
    if (!ids.length) { snack("Cochez au moins un événement à exporter"); return; }
    try {
      const BASE = location.pathname.startsWith("/kora-v2") ? "/kora-v2" : "";
      const token = (() => { try { return localStorage.getItem("kora-token"); } catch (e) { return null; } })();
      const headers = { "Content-Type": "application/json" };
      if (token) headers["X-API-Token"] = token;
      const res = await fetch(BASE + "/api/audit/export", {
        method: "POST", headers, credentials: "same-origin",
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error("code " + res.status);
      const csv = await res.text();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = "kora-audit-export.csv"; a.click(); URL.revokeObjectURL(a.href);
      snack("Export CSV généré");
    } catch (e) { snack("Erreur export : " + (e.message || e)); }
  };
  const selAll = document.getElementById("auditSelAll");
  if (selAll) selAll.onclick = () => { view.querySelectorAll(".audit-check").forEach(c => c.checked = true); refresh(); };
  const selNone = document.getElementById("auditSelNone");
  if (selNone) selNone.onclick = () => { view.querySelectorAll(".audit-check").forEach(c => c.checked = false); refresh(); };
  const fbAll = document.getElementById("auditFbAll");
  if (fbAll) fbAll.onclick = () => { view.querySelectorAll(".audit-check").forEach(c => c.checked = true); refresh(); };
  const fbNone = document.getElementById("auditFbNone");
  if (fbNone) fbNone.onclick = () => { view.querySelectorAll(".audit-check").forEach(c => c.checked = false); refresh(); };
  const doDelete = () => {
    const ids = checks();
    if (!ids.length) return;
    confirmAction({
      title: "Supprimer ces événements ?",
      message: `${ids.length} événement(s) seront retirés de l'historique.`,
      confirmLabel: "Supprimer",
      onConfirm: async () => {
        await Store.api("/api/audit", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
        Store.loadAudit(); snack("Sélection supprimée");
      },
    });
  };
  if (delBtn) delBtn.onclick = doDelete;
  if (fbDel) fbDel.onclick = doDelete;
  const purgeAll = document.getElementById("auditPurgeAll");
  if (purgeAll) purgeAll.onclick = () => confirmAction({
    title: "Vider tout l'historique ?",
    message: "Une ligne de purge sera conservée pour la traçabilité. Action irréversible.",
    confirmLabel: "Vider",
    onConfirm: async () => {
      await Store.api("/api/audit/purge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "all" }) });
      Store.loadAudit(); snack("Historique vidé");
    },
  });
  const resetToday = document.getElementById("auditResetToday");
  if (resetToday) resetToday.onclick = () => confirmAction({
    title: "Réinitialiser l'historique du jour ?",
    message: "Les événements d'aujourd'hui seront purgés. Action irréversible.",
    confirmLabel: "Réinitialiser",
    onConfirm: async () => {
      const today = new Date().toISOString().slice(0, 10);
      await Store.api("/api/audit/purge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "day", day: today }) });
      Store.loadAudit(); snack("Historique du jour réinitialisé");
    },
  });
  view.querySelectorAll(".audit-purge-day").forEach(b => b.onclick = () => {
    const day = b.dataset.day;
    confirmAction({
      title: `Réinitialiser l'historique du ${day} ?`,
      message: "Les événements de ce jour seront purgés. Action irréversible.",
      confirmLabel: "Réinitialiser",
      onConfirm: async () => {
        await Store.api("/api/audit/purge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "day", day }) });
        Store.loadAudit(); snack(`Historique du ${day} réinitialisé`);
      },
    });
  });
}

export { viewAudit, bindAudit };
