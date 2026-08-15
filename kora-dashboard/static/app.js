// app.js — vanilla router + API client for the KORA OPS dashboard.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function badgeClass(status) {
  const s = (status || "").toUpperCase();
  if (s.includes("REJECT") || s.includes("TRASH")) return "danger";
  if (s.includes("PENDING") || s.includes("EDIT")) return "warn";
  if (s.includes("APPROV") || s === "PUBLISHED" || s === "OK") return "ok";
  return "";
}

async function api(path) {
  const r = await fetch(path, { headers: { "Accept": "application/json" } });
  if (!r.ok) throw new Error(path + " -> " + r.status);
  return r.json();
}

function renderStats(s) {
  const grid = $("#statGrid");
  const t = s.totals || {};
  const fb = s.facts_by_status || {};
  const ab = s.articles_by_status || {};
  const cards = [
    { k: "Facts (total)", v: t.facts ?? "—", cls: "accent" },
    { k: "À décider", v: t.pending ?? fb.PENDING_REVIEW ?? "—", cls: "", vcls: "warn" },
    { k: "Approuvés", v: fb.APPROVED ?? "—", cls: "", vcls: "ok" },
    { k: "Brouillons", v: ab.draft ?? ab.EDITED ?? "—", cls: "" },
    { k: "Rejetés", v: fb.REJECTED ?? "—", cls: "", vcls: "danger" },
    { k: "Corbeille", v: fb.TRASHED ?? "—", cls: "", vcls: "danger" },
    { k: "Articles (total)", v: t.articles ?? "—", cls: "" },
  ];
  grid.innerHTML = cards.map(c => `
    <div class="stat-card ${c.cls}">
      <span class="k">${c.k}</span>
      <span class="v ${c.vcls || ""}">${c.v}</span>
    </div>`).join("");
}

function renderFacts(rows) {
  const el = $("#factsList");
  if (!rows.length) { el.innerHTML = `<div class="row"><span class="sub">Aucun fact.</span></div>`; return; }
  el.innerHTML = rows.map(f => `
    <div class="row">
      <div class="top">
        <span class="title">${esc(f.champion || f.fact_id || "—")}</span>
        <span class="badge ${badgeClass(f.status)}">${esc(f.status || "—")}</span>
      </div>
      <span class="sub">${esc(f.fact_id || "")} · ${esc(f.created_at || "")} · ${f.n_sources ?? "?"} sources</span>
    </div>`).join("");
}

function renderAudit(rows) {
  const el = $("#auditList");
  if (!rows.length) { el.innerHTML = `<div class="row"><span class="sub">Aucun événement.</span></div>`; return; }
  el.innerHTML = rows.map(e => `
    <div class="row">
      <div class="top">
        <span class="title">${esc(e.event || e.action || "Activité")}</span>
        <span class="badge">${esc(e.editor || "agent")}</span>
      </div>
      <span class="sub">${esc(e.ts || "")} · ${esc(e.detail || e.action || "")}</span>
    </div>`).join("");
}

function renderConfig(rows) {
  const el = $("#configList");
  if (!rows.length) { el.innerHTML = `<div class="row"><span class="sub">Aucune config.</span></div>`; return; }
  el.innerHTML = rows.map(c => `
    <div class="row">
      <div class="top"><span class="title">${esc(c.key)}</span></div>
      <span class="sub">${esc(c.value)}</span>
    </div>`).join("");
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

async function refresh() {
  try {
    const [health, stats, facts, audit, config] = await Promise.all([
      api("/api/health"), api("/api/stats"), api("/api/facts"), api("/api/audit"), api("/api/config")
    ]);
    const pill = $("#dbPill");
    pill.textContent = health.demo ? "DEMO" : "DB OK";
    pill.className = "db-pill " + (health.demo ? "demo" : "ok");
    renderStats(stats); renderFacts(facts); renderAudit(audit); renderConfig(config);
  } catch (e) {
    $("#dbPill").textContent = "ERREUR";
    $("#dbPill").className = "db-pill demo";
    console.error(e);
  }
}

// --- Router (drawer + tab bar share data-view) ---
function setView(view) {
  $$(".view").forEach(v => { v.hidden = v.dataset.view !== view; });
  $$(".nav-item, .tab").forEach(n => n.classList.toggle("active", n.dataset.view === view));
  closeDrawer();
  if (location.hash !== "#" + view) history.replaceState(null, "", "#" + view);
}
$$(".nav-item, .tab").forEach(n => n.addEventListener("click", e => { e.preventDefault(); setView(n.dataset.view); }));
window.addEventListener("hashchange", () => setView(location.hash.slice(1) || "stats"));

// --- Drawer (mobile) ---
const drawer = $("#drawer"), scrim = $("#scrim");
function openDrawer() { drawer.classList.add("open"); scrim.classList.add("show"); scrim.hidden = false; }
function closeDrawer() { drawer.classList.remove("open"); scrim.classList.remove("show"); scrim.hidden = true; }
$("#menuBtn").addEventListener("click", openDrawer);
scrim.addEventListener("click", closeDrawer);

// init
setView(location.hash.slice(1) || "stats");
refresh();
setInterval(refresh, 15000);
