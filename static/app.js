// app.js — dashboard KORA (vanilla, mobile-first MD3)
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = {
  lastResult: null,
  decisions: {}, // url -> 'approved' | 'rejected'
  pollTimer: null,
};

// ---------- Router ----------
function navigate(view) {
  $$(".view").forEach(v => v.classList.add("hidden"));
  $("#view-" + view).classList.remove("hidden");
  $$(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.view === view));
  $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === view));
  $("#drawer").classList.remove("open");
  $("#scrim").classList.remove("show");
  if (view === "clusters") renderClusters();
  if (view === "hitl") renderHitl();
  if (view === "whitelist") renderWhitelist();
  if (view === "audit") renderAudit();
  if (view === "dashboard") { refreshState(); loadLast(); }
}

// ---------- API ----------
async function api(path, opts) {
  const r = await fetch(path, opts);
  return r.json();
}

// ---------- Dashboard : charger dernier cycle au démarrage ----------
async function loadLast() {
  try {
    const r = await api("/api/last");
    if (r && r.running) {
      $("#runStatus").textContent = "Cycle en cours…";
      return;
    }
    const res = r && r.result;
    if (res && res.status && res.status !== "none") {
      state.lastResult = res;
      fillStats(res);
      if (res.sources_ok != null) $("#statSources").textContent = res.sources_ok;
      if (res.facts && res.facts.length) {
        renderFacts(res.facts);
        $("#runStatus").textContent = `Dernier cycle : ${res.facts_to_generate} fait(s) généré(s).`;
      } else {
        $("#lastFacts").innerHTML = `<p class="sub">${esc(res.message || "Aucun fait dans la fenêtre 24h lors du dernier cycle.")}</p>`;
      }
    }
  } catch (e) {}
}

async function refreshState() {
  try {
    const s = await api("/api/state");
    const chip = $("#mutexChip");
    chip.textContent = s.mutex ? "cycle en cours" : "prêt";
    chip.classList.toggle("busy", s.mutex);
  } catch (e) {}
}

// ---------- Dashboard : lancer cycle (détaché + polling) ----------
async function runCycle() {
  const btn = $("#runBtn");
  btn.disabled = true;
  $("#runStatus").textContent = "Lancement du cycle…";
  $("#runStatus").classList.remove("err");
  clearInterval(state.pollTimer);
  try {
    // 1) Déclenche le cycle (répond immédiatement {started:true})
    const res = await api("/api/cycle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: $("#scopeSel").value || null,
        demand: parseInt($("#demandSel").value, 10) || 3,
        initiator: "dashboard",
      }),
    });
    if (res.error) {
      $("#runStatus").textContent = "⚠ " + res.error;
      $("#runStatus").classList.add("err");
      btn.disabled = false;
      return;
    }
    $("#runStatus").textContent = "Collecte en cours… (cela peut prendre 1-2 min)";
    // 2) Polling jusqu'à la fin du cycle
    state.pollTimer = setInterval(async () => {
      try {
        const last = await api("/api/last");
        if (!last.running && last.result) {
          clearInterval(state.pollTimer);
          state.lastResult = last.result;
          if (last.result.status === "empty_or_stale") {
            $("#runStatus").textContent = "Aucune publication dans la fenêtre 24h. " + (last.result.message || "");
          } else {
            $("#runStatus").textContent = `Cycle OK — ${last.result.facts_to_generate} fait(s) généré(s).`;
            fillStats(last.result);
            renderFacts(last.result.facts);
            $("#statSources").textContent = last.result.sources_ok;
          }
          btn.disabled = false;
          refreshState();
        } else if (!last.running && !last.result) {
          // cycle terminé sans résultat
          clearInterval(state.pollTimer);
          $("#runStatus").textContent = "Cycle terminé (aucun fait).";
          btn.disabled = false;
        }
      } catch (e) {
        // erreur de poll : on continue d'attendre un peu
      }
    }, 3000);
  } catch (e) {
    $("#runStatus").textContent = "Erreur réseau : " + e.message;
    $("#runStatus").classList.add("err");
    btn.disabled = false;
  }
}

function fillStats(res) {
  $("#statItems").textContent = res.total_items ?? "–";
  $("#statClusters").textContent = res.clusters ?? "–";
  $("#statRej").textContent = res.rejected_intl ?? "–";
}

function renderFacts(facts) {
  const box = $("#lastFacts");
  box.innerHTML = "";
  if (!facts || !facts.length) {
    box.innerHTML = `<p class="sub">Aucun fait à afficher.</p>`;
    return;
  }
  facts.forEach((f, i) => {
    const c = document.createElement("div");
    c.className = "fact-card";
    const img = f.image ? `<img class="img-thumb" src="${esc(f.image)}" alt="" loading="lazy">` : "";
    c.innerHTML = `
      <div class="fact-title">${esc(f.champion.title)}</div>
      <div class="fact-meta">
        <span class="tag">${esc(f.champion.source)}</span>
        <span class="tag">${f.n_sources} source(s)</span>
        <span class="tag gen">${esc(f.gen_model)}</span>
      </div>
      <div class="article-prev">${esc((f.article || "").slice(0, 160))}…</div>
      ${img}
    `;
    c.onclick = () => openDetail(f, i);
    box.appendChild(c);
  });
}

// ---------- Clusters ----------
function renderClusters() {
  const res = state.lastResult;
  const box = $("#clustersList");
  if (!res || !res.facts || !res.facts.length) {
    box.innerHTML = `<p class="sub">Lancez un cycle pour voir les faits détectés.</p>`;
    return;
  }
  box.innerHTML = "";
  res.facts.forEach((f, i) => {
    const card = document.createElement("div");
    card.className = "cluster-card";
    const ctx = (f.contexts || []).map(c => esc(c.source)).join(", ") || "—";
    card.innerHTML = `
      <div class="fact-title">${esc(f.champion.title)}</div>
      <div class="fact-meta">
        <span class="tag">champion: ${esc(f.champion.source)}</span>
        <span class="tag">${f.n_sources} source(s)</span>
        <span class="tag gen">${esc(f.gen_model)}</span>
      </div>
      <div class="fact-meta" style="margin-top:6px">Contextes : ${ctx}</div>
    `;
    card.onclick = () => openDetail(f, i);
    box.appendChild(card);
  });
}

// ---------- HITL (persisté via API) ----------
async function renderHitl() {
  const box = $("#hitlList");
  try {
    const items = await api("/api/hitl");
    if (!items.length) {
      box.innerHTML = `<p class="sub">Aucune proposition à valider pour l'instant. Lancez un cycle.</p>`;
      return;
    }
    box.innerHTML = "";
    items.forEach(it => {
      const st = it.status || "PENDING_REVIEW";
      const card = document.createElement("div");
      card.className = "hitl-card " + (st === "PENDING_REVIEW" || st === "EDITED" ? "pending" : "");
      const img = it.image ? `<img class="img-thumb" src="${esc(it.image)}" alt="" loading="lazy">` : "";
      const ctx = (it.contexts || []).map(c => esc(c.source)).join(", ") || "—";
      const decInfo = it.decided_by ? `par <b>${esc(it.decided_by)}</b> le ${esc((it.decided_at||"").slice(0,16))}` : "";
      const isFinal = st === "TRANSMITTED" || st === "REJECTED" || st === "RETRACTED";
      const actionBtns = isFinal ? "" : `
        <button class="btn-approve" data-act="APPROVED">Approuver &amp; transmettre</button>
        <button class="btn-reject" data-act="REJECTED">Rejeter</button>
        <button class="btn-edit" data-act="EDITED">Modifier</button>`;
      const retractBtn = st === "TRANSMITTED" ? `<button class="btn-edit" data-act="RETRACT">Retirer</button>` : "";
      card.innerHTML = `
        <div class="fact-title">${esc(it.champion.title)}</div>
        <div class="fact-meta">
          <span class="tag">${esc(it.champion.source)}</span>
          <span class="tag">${it.n_sources} source(s)</span>
          <span class="tag gen">${esc(it.gen_model)}</span>
          <span class="tag">${esc(st)}</span>
        </div>
        ${img}
        <div class="article-body" style="margin-top:8px">${esc(it.final_text || it.article || "(aucun texte)")}</div>
        <div class="fact-meta" style="margin-top:6px">Sources : ${ctx}</div>
        <div class="sub" style="margin-top:6px">${decInfo ? "Décision " + decInfo : "En attente de validation"}</div>
        <textarea class="ta-edit hidden" data-fid="${esc(it.fact_id)}" placeholder="Éditer le texte avant validation…">${esc(it.final_text || it.article || "")}</textarea>
        <div class="hitl-actions">${actionBtns}${retractBtn}</div>
      `;
      const ta = $(".ta-edit", card);
      card.querySelectorAll(".hitl-actions button").forEach(b => {
        b.onclick = () => {
          const act = b.dataset.act;
          if (act === "RETRACT") return doRetract(it.fact_id);
          if (act === "EDITED") { ta.classList.toggle("hidden"); return; }
          if (act === "APPROVED" || act === "REJECTED") {
            return doDecide(it.fact_id, act, ta.value);
          }
        };
      });
      box.appendChild(card);
    });
  } catch (e) {
    box.innerHTML = `<p class="err">Erreur HITL : ${e.message}</p>`;
  }
}

async function doDecide(factId, decision, editedText) {
  const res = await api("/api/hitl/decide", {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ fact_id: factId, decision, edited_text: editedText }),
  });
  if (res.error) { alert("Refus : " + res.error); }
  renderHitl();
}

async function doRetract(factId) {
  if (!confirm("Retirer cet article (droit de rectification) ?")) return;
  const res = await api("/api/hitl/retract", {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ fact_id: factId }),
  });
  renderHitl();
}

// ---------- Whitelist ----------
async function renderWhitelist() {
  const box = $("#wlList");
  try {
    const list = await api("/api/whitelist");
    $("#wlVersion").textContent = "2026-08-02";
    box.innerHTML = "";
    list.forEach(e => {
      const c = document.createElement("div");
      c.className = "wl-card";
      c.innerHTML = `
        <div class="wl-name">${esc(e.name)} <span class="wl-badge">${esc(e.category)}</span></div>
        <div class="fact-meta"><span class="tag">${esc(e.vector)}</span>${e.guinea_filter ? '<span class="tag">filtre Guinée</span>' : ''}</div>
        <div class="wl-dom">${esc(e.entry_url)}</div>
        <div class="wl-dom">Domaines : ${esc((e.domains || []).join(", "))}</div>
      `;
      box.appendChild(c);
    });
  } catch (e) {
    box.innerHTML = `<p class="err">Erreur : ${e.message}</p>`;
  }
}

// ---------- Audit ----------
async function renderAudit() {
  const box = $("#auditList");
  try {
    const evs = await api("/api/audit");
    if (!evs.length) { box.innerHTML = `<p class="sub">Aucun événement pour l'instant.</p>`; return; }
    box.innerHTML = "";
    evs.slice(0, 100).reverse().forEach(ev => {
      const row = document.createElement("div");
      row.className = "audit-row";
      row.innerHTML = `<span class="ae">${esc(ev.event)}</span><span class="ad">${esc(ev.detail || "")} — ${esc((ev.ts||"").slice(11,19))}</span>`;
      box.appendChild(row);
    });
  } catch (e) {
    box.innerHTML = `<p class="err">Erreur : ${e.message}</p>`;
  }
}

// ---------- Detail modal ----------
function openDetail(f, i) {
  const body = $("#modalBody");
  const img = f.image ? `<img class="img-thumb" src="${esc(f.image)}" alt="" loading="lazy">` : "";
  const ctx = (f.contexts || []).map(c =>
    `<li><b>${esc(c.source)}</b> : ${esc((c.raw_content || c.title || "").slice(0, 120))}</li>`).join("");
  body.innerHTML = `
    <h2>${esc(f.champion.title)}</h2>
    <div class="fact-meta"><span class="tag">${esc(f.champion.source)}</span><span class="tag">${f.n_sources} source(s)</span><span class="tag gen">${esc(f.gen_model)}</span></div>
    ${img}
    <div class="article-body">${esc(f.article || "(aucun texte)")}</div>
    ${ctx ? `<div class="sources-box"><b>Sources contextuelles :</b><ul>${ctx}</ul></div>` : ""}
  `;
  $("#detailModal").classList.remove("hidden");
}

// ---------- Helpers ----------
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

// ---------- Events ----------
$("#runBtn").onclick = runCycle;
$("#menuBtn").onclick = () => { $("#drawer").classList.add("open"); $("#scrim").classList.add("show"); };
$("#scrim").onclick = () => { $("#drawer").classList.remove("open"); $("#scrim").classList.remove("show"); };
$("#modalClose").onclick = () => $("#detailModal").classList.add("hidden");
$$(".nav-item").forEach(n => n.onclick = () => navigate(n.dataset.view));
$$(".tab").forEach(t => t.onclick = () => navigate(t.dataset.view));

// ---------- Mode mobile forcé (?mobile=1) pour capture/proof ----------
if (new URLSearchParams(location.search).get("mobile") === "1") {
  document.body.classList.add("mobile-force");
}

navigate("dashboard");
