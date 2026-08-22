/* ============================================================
   KORA — views/videos.js : page Vidéos (liste + lecteur inline avec
   lecture/pause/stop/barre de progression). Extrait de app.js le
   22/08/2026 (refacto plan étape 4).
   ============================================================ */
import { Store } from "../store.js";
import { esc, icon, chip, statusBadge, snack, friendlyActionError, transmissionMessage, stateBox } from "../utils.js";
import { renderSheet } from "../sheet.js";
import { openFact, render } from "../app.js";

// Page Vidéos (2026-08-21, interconnectée le 2026-08-22) : liste tous les
// faits ayant une vidéo, quel que soit leur statut éditorial -- source :
// Store.loadVideos() -> GET /api/videos (voir orchestration/video.py
// list_videos()). Ligne cliquable -> ouvre la fiche article complète (même
// principe que data-fact sur les cartes de la vue Articles), MAIS chaque
// ligne porte aussi ses propres actions rapides (Publier/Rejeter, ou
// Restaurer/Supprimer si déjà à la corbeille) -- demande explicite : cette
// page doit être fonctionnelle par elle-même, pas juste un renvoi vers la
// fiche pour la moindre action. decide()/deleteForever()/restoreFact()
// recharge déjà cette liste (voir Store, 2026-08-22) : toute action prise
// ICI ou depuis la fiche/la vue Articles/la Corbeille reste cohérente
// partout, y compris via un autre onglet/appareil (prochain rafraîchissement).
// Étapes de génération (2026-08-22, amélioration UX) : affichées en mini-
// stepper (façon "Étape 2 sur 3") plutôt qu'un simple texte qui change --
// bonne pratique confirmée (ui-ux-pro-max, catégorie Feedback/Progress
// Indicators) : un processus multi-étapes doit montrer sa progression, pas
// juste un libellé isolé.
const VIDEO_STAGES = ["narration", "image", "assemblage"];
const VIDEO_STAGE_LABELS = { narration: "Narration", image: "Image", assemblage: "Assemblage" };
function videoStageStepper(currentStage) {
  const curIdx = VIDEO_STAGES.indexOf(currentStage);
  return `<div class="video-stage-stepper" role="status" aria-label="Génération : ${esc(VIDEO_STAGE_LABELS[currentStage] || currentStage || "en cours")}">
    ${VIDEO_STAGES.map((st, i) => {
      const state = i < curIdx ? "done" : i === curIdx ? "active" : "pending";
      return `<span class="video-stage-step video-stage-${state}" title="${esc(VIDEO_STAGE_LABELS[st])}">
        ${state === "done" ? icon("i-check") : `<span class="video-stage-dot"></span>`}
        <span class="video-stage-label">${esc(VIDEO_STAGE_LABELS[st])}</span>
      </span>`;
    }).join("")}
  </div>`;
}
function videoStatusChip(v) {
  if (v.video_status === "generating") return chip("Génération en cours…", "warning", "i-spark");
  if (v.video_status === "done") return chip("Générée", "tertiary", "i-check");
  if (v.video_status === "error") return chip("Échec", "error");
  return chip(v.video_status || "Inconnu", "secondary");
}
// Durée mm:ss (ou h:mm:ss au-delà d'une heure) -- affichée en incrustation
// sur la miniature (coin bas-droit, convention YouTube/Netflix) plutôt que
// dans le sous-titre texte, pour un repérage visuel plus rapide en liste.
function fmtDuration(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}
// Filtre par statut (2026-08-22, amélioration UX) : purement client, état
// local à ce module (pas de aller-retour serveur -- la liste complète est
// déjà chargée par Store.loadVideos(), filtrer côté client est immédiat et
// évite d'alourdir store.js pour un simple confort d'affichage). Persiste
// entre deux rendus tant que le module reste chargé (navigation SPA), se
// réinitialise sur "all" à un rechargement complet (F5) -- acceptable pour
// un filtre de confort, pas une donnée métier.
let _videoFilter = "all";
function viewVideos(s) {
  const videos = s.videos || [];
  if (!videos.length) return stateBox("i-spark", "Aucune vidéo", "Génère une vidéo narrée depuis la fiche d'un article (section « Vidéo narrée ») -- elle apparaîtra ici.", !!s.ui.loading);
  // Rôle Lecteur : consultation seule (même garde que la fiche article, voir
  // renderSheet()) -- aucune action rapide, la ligne reste cliquable en lecture seule.
  const readOnly = s.auth && s.auth.role === "lecteur";
  const counts = {
    all: videos.length,
    generating: videos.filter(v => v.video_status === "generating").length,
    done: videos.filter(v => v.video_status === "done").length,
    error: videos.filter(v => v.video_status === "error").length,
  };
  const f = _videoFilter;
  const filters = [
    ["all", "Toutes", counts.all], ["generating", "En cours", counts.generating],
    ["done", "Générées", counts.done], ["error", "Échecs", counts.error],
  ].filter(([k, , n]) => k === "all" || n > 0); // pas de pastille "Échecs 0" qui n'aide personne
  const filterBar = counts.all > 1 ? `<div class="filter-bar">${filters.map(([k, lab, n]) =>
    `<button class="filter-pill ${f === k ? "active" : ""}" data-video-filter="${k}">${lab} <span class="pill-n">${n}</span></button>`).join("")}</div>` : "";
  const filtered = f === "all" ? videos : videos.filter(v => (v.video_status || "") === f);
  const row = (v) => {
    const trashed = v.status === "TRASHED";
    const playable = v.video_status === "done" && v.video_path;
    let actions = "";
    if (playable) {
      // Lecture inline (2026-08-22, demande explicite) : bascule le lecteur
      // juste en dessous de la ligne, sans quitter la page Vidéos. data-video-
      // toggle est câblé dans bindVideos() (pas le listener global .fact-card).
      actions += `<button type="button" class="btn btn-tonal btn-sm" data-video-toggle="${esc(v.fact_id)}">${icon("i-play")} Écouter</button>`;
    }
    if (!readOnly) {
      if (trashed) {
        // data-restore/data-del : câblés GLOBALEMENT dans render() (voir plus
        // bas, "Corbeille : boutons restaurer / supprimer") -- pas besoin de
        // re-câbler ici, ces attributs suffisent quelle que soit la page.
        actions += `
          <button type="button" class="btn btn-tonal btn-sm" data-restore="${esc(v.fact_id)}">${icon("i-undo")} Restaurer</button>
          <button type="button" class="btn btn-danger btn-sm" data-del="${esc(v.fact_id)}">${icon("i-trash")} Supprimer</button>`;
      } else {
        actions += `
          ${v.status !== "TRANSMITTED" ? `<button type="button" class="btn btn-tonal btn-sm" data-video-publish="${esc(v.fact_id)}">${icon("i-send")} Publier</button>` : ""}
          <button type="button" class="btn btn-danger-ghost btn-sm" data-video-reject="${esc(v.fact_id)}" data-video-reject-title="${esc(v.title || "")}">${icon("i-reject")} Rejeter</button>`;
      }
    }
    // Miniature (2026-08-22, amélioration UX) : l'image de couverture existe
    // déjà (réutilisée par le lecteur ci-dessous) -- l'afficher en vignette
    // rend la liste scannable en un coup d'œil au lieu de devoir lire chaque
    // titre (avant : une icône générique identique pour toutes les lignes).
    // Durée incrustée en coin bas-droit (convention YouTube/Netflix).
    const thumb = `<div class="video-thumb">
      ${v.image ? `<img src="${esc(v.image)}" alt="" loading="lazy">` : `<span class="video-thumb-fallback">${icon("i-spark")}</span>`}
      ${v.video_status === "done" && v.video_duration_sec ? `<span class="video-thumb-duration">${fmtDuration(v.video_duration_sec)}</span>` : ""}
    </div>`;
    return `
    <div class="video-row-wrap">
      <div class="list-row video-row ${trashed ? "video-row-trashed" : ""}" data-fact="${esc(v.fact_id)}">
        ${thumb}
        <div class="meta">
          <div class="name">${esc(v.title || "(sans titre)")}</div>
          <div class="sub">
            ${v.created_at ? esc(new Date(v.created_at).toLocaleString("fr-FR")) : "Date inconnue"}
            ${v.status ? ` · ${statusBadge(v.status)}` : ""}
          </div>
          ${v.video_status === "generating" ? videoStageStepper(v.video_stage) : ""}
        </div>
        ${v.video_status !== "generating" ? videoStatusChip(v) : ""}
        <div class="video-row-actions">${actions}</div>
      </div>
      ${playable ? `
      <div class="video-player-wrap" id="videoPlayer-${esc(v.fact_id)}" hidden>
        <div class="video-preview-wrap">
          <video class="video-preview" preload="none" ${v.image ? `poster="${esc(v.image)}"` : ""} data-video-el="${esc(v.fact_id)}"></video>
        </div>
        <div class="video-progress" data-video-progress="${esc(v.fact_id)}">
          <div class="video-progress-fill" data-video-progress-fill="${esc(v.fact_id)}"></div>
        </div>
        <div class="video-player-controls">
          <button type="button" class="video-ctrl-btn" data-video-play="${esc(v.fact_id)}" title="Lecture / Pause" aria-label="Lecture / Pause">${icon("i-play")}</button>
          <button type="button" class="video-ctrl-btn" data-video-stop="${esc(v.fact_id)}" title="Stop" aria-label="Stop">${icon("i-stop")}</button>
          <button type="button" class="video-ctrl-btn" data-video-back10="${esc(v.fact_id)}" title="Reculer de 10s" aria-label="Reculer de 10 secondes">${icon("i-back10")}</button>
          <button type="button" class="video-ctrl-btn" data-video-forward10="${esc(v.fact_id)}" title="Avancer de 10s" aria-label="Avancer de 10 secondes">${icon("i-forward10")}</button>
          <span class="video-ctrl-time" data-video-time="${esc(v.fact_id)}">0:00 / 0:00</span>
          <button type="button" class="video-ctrl-btn" data-video-mute="${esc(v.fact_id)}" title="Muet" aria-label="Couper le son">${icon("i-volume")}</button>
          <button type="button" class="video-ctrl-btn" data-video-fullscreen="${esc(v.fact_id)}" title="Plein écran" aria-label="Plein écran">${icon("i-fullscreen")}</button>
        </div>
      </div>` : ""}
    </div>`;
  };
  return `<div class="section-title">Vidéos (${videos.length})</div>
    <p class="muted" style="margin-bottom:16px">Toutes les vidéos narrées générées depuis les fiches article, quel que soit leur statut éditorial. Écoute, publie, rejette ou gère la corbeille directement depuis cette page.</p>
    ${filterBar}
    ${filtered.length ? `<section class="fact-group">${filtered.map(row).join("")}</section>` : `<div class="group-empty">Aucune vidéo dans « ${esc((filters.find(([k]) => k === f) || [, "ce filtre"])[1])} ».</div>`}`;
}
// Lecteur vidéo inline (2026-08-22, demande explicite : "lecture, pause,
// stop") -- src chargé PARESSEUSEMENT (data-video-src, préfixe seulement
// posé à l'ouverture) pour ne jamais démarrer un téléchargement pour les
// vidéos non ouvertes de la liste. Play/Pause reflète l'état RÉEL du
// <video> (écoute play/pause/ended), pas un simple toggle optimiste --
// évite un bouton qui affiche "Pause" alors que la vidéo est déjà finie.
function bindVideoPlayers(videos) {
  document.querySelectorAll("#view [data-video-toggle]").forEach(b => b.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    const fid = b.dataset.videoToggle;
    const wrap = document.getElementById(`videoPlayer-${fid}`);
    if (!wrap) return;
    const willShow = wrap.hidden;
    wrap.hidden = !willShow;
    if (willShow) {
      const v = (videos || []).find(x => x.fact_id === fid);
      const vidEl = wrap.querySelector("[data-video-el]");
      if (vidEl && !vidEl.src && v && v.video_path) vidEl.src = `/kora-v2/media/${v.video_path}`;
    } else {
      const vidEl = wrap.querySelector("[data-video-el]");
      if (vidEl) vidEl.pause();
    }
  });
  document.querySelectorAll("#view [data-video-play]").forEach(b => b.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    const fid = b.dataset.videoPlay;
    const wrap = document.getElementById(`videoPlayer-${fid}`);
    const vidEl = wrap && wrap.querySelector("[data-video-el]");
    if (!vidEl) return;
    if (vidEl.paused || vidEl.ended) vidEl.play(); else vidEl.pause();
  });
  document.querySelectorAll("#view [data-video-stop]").forEach(b => b.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    const fid = b.dataset.videoStop;
    const wrap = document.getElementById(`videoPlayer-${fid}`);
    const vidEl = wrap && wrap.querySelector("[data-video-el]");
    if (!vidEl) return;
    vidEl.pause();
    vidEl.currentTime = 0;
  });
  // Reculer/avancer de 10s (2026-08-22, amélioration UX) : standard sur tout
  // lecteur vidéo moderne, permet de revérifier un passage sans tout réécouter.
  document.querySelectorAll("#view [data-video-back10]").forEach(b => b.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    const wrap = document.getElementById(`videoPlayer-${b.dataset.videoBack10}`);
    const vidEl = wrap && wrap.querySelector("[data-video-el]");
    if (vidEl) vidEl.currentTime = Math.max(0, vidEl.currentTime - 10);
  });
  document.querySelectorAll("#view [data-video-forward10]").forEach(b => b.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    const wrap = document.getElementById(`videoPlayer-${b.dataset.videoForward10}`);
    const vidEl = wrap && wrap.querySelector("[data-video-el]");
    if (vidEl) vidEl.currentTime = Math.min(vidEl.duration || Infinity, vidEl.currentTime + 10);
  });
  // Muet/son (2026-08-22, amélioration UX) : absent jusqu'ici -- gênant si la
  // narration démarre sans prévenir en public. Icône synchronisée sur l'état
  // réel (vidEl.muted), pas un simple toggle optimiste (même principe que
  // l'icône play/pause ci-dessous).
  document.querySelectorAll("#view [data-video-mute]").forEach(b => b.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    const wrap = document.getElementById(`videoPlayer-${b.dataset.videoMute}`);
    const vidEl = wrap && wrap.querySelector("[data-video-el]");
    if (!vidEl) return;
    vidEl.muted = !vidEl.muted;
    b.innerHTML = vidEl.muted ? icon("i-mute") : icon("i-volume");
    b.setAttribute("aria-label", vidEl.muted ? "Réactiver le son" : "Couper le son");
  });
  // Plein écran (2026-08-22, amélioration UX) : API Fullscreen standard sur
  // l'élément <video> lui-même (contrôles natifs du navigateur en plein
  // écran, plus simples à utiliser que notre barre custom une fois agrandi).
  document.querySelectorAll("#view [data-video-fullscreen]").forEach(b => b.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    const wrap = document.getElementById(`videoPlayer-${b.dataset.videoFullscreen}`);
    const vidEl = wrap && wrap.querySelector("[data-video-el]");
    if (vidEl && vidEl.requestFullscreen) vidEl.requestFullscreen().catch(() => {});
  });
  // Barre de progression cliquable (seek) -- absente de la 1re version
  // (Lecture/Pause/Stop seuls), ajoutée sur demande explicite (2026-08-22).
  document.querySelectorAll("#view [data-video-progress]").forEach(bar => bar.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    const fid = bar.dataset.videoProgress;
    const wrap = document.getElementById(`videoPlayer-${fid}`);
    const vidEl = wrap && wrap.querySelector("[data-video-el]");
    if (!vidEl || !vidEl.duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    vidEl.currentTime = ratio * vidEl.duration;
  });
  const _fmtT = (sec) => { const s = Math.floor(sec || 0), m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, "0")}`; };
  // Icône Play<->Pause synchronisée sur l'état RÉEL de lecture (pas au clic) :
  // un seul jeu de listeners par <video>, posé une fois (data-bound évite de
  // les empiler à chaque render()/toggle). Même écoute pilote la barre de
  // progression, le minuteur "écoulé / total", et l'effet zoom du poster
  // (actif tant que la vidéo n'a pas démarré -- coupé dès la lecture,
  // demande explicite : "les effets zoom sur l'image").
  document.querySelectorAll("#view [data-video-el]").forEach(vidEl => {
    if (vidEl.dataset.bound) return;
    vidEl.dataset.bound = "1";
    vidEl.classList.add("video-idle-zoom");
    const fid = vidEl.dataset.videoEl;
    const syncIcon = () => {
      const btn = document.querySelector(`[data-video-play="${fid}"]`);
      if (btn) btn.innerHTML = (vidEl.paused || vidEl.ended) ? icon("i-play") : icon("i-pause");
      vidEl.classList.toggle("video-idle-zoom", vidEl.paused || vidEl.ended);
      const fill = document.querySelector(`[data-video-progress-fill="${fid}"]`);
      if (fill && vidEl.duration) fill.style.width = `${Math.min(100, (vidEl.currentTime / vidEl.duration) * 100)}%`;
      const t = document.querySelector(`[data-video-time="${fid}"]`);
      if (t) t.textContent = `${_fmtT(vidEl.currentTime)} / ${_fmtT(vidEl.duration)}`;
    };
    ["play", "pause", "ended", "timeupdate", "loadedmetadata"].forEach(ev => vidEl.addEventListener(ev, syncIcon));
  });
}
function bindVideos() {
  // Filtre par statut (2026-08-22, amélioration UX) -- purement client
  // (_videoFilter, voir plus haut) : re-render() immédiat, pas d'aller-
  // retour réseau (même liste, juste réaffichée avec un sous-ensemble).
  document.querySelectorAll("#view [data-video-filter]").forEach(b => b.onclick = () => {
    _videoFilter = b.dataset.videoFilter;
    render();
  });
  // Ouverture de la fiche complète -- .video-row n'est pas un <button> (elle
  // contient elle-même des boutons d'action, imbrication invalide en HTML),
  // donc pas captée par le listener document-wide de bind() (.fact-card
  // uniquement) : câblage manuel, en ignorant les clics qui viennent d'un
  // bouton d'action inline (Publier/Rejeter/Restaurer/Supprimer) ou d'une
  // ligne déjà à la corbeille (même principe que trash-card dans bind()).
  document.querySelectorAll("#view .video-row").forEach(row => row.onclick = (e) => {
    if (e.target.closest("button")) return;
    if (row.classList.contains("video-row-trashed")) return;
    openFact(row.dataset.fact);
  });
  // Publier = exactement la même action que "Approuver & transmettre" dans
  // la fiche article (Store.decide + message de transmission) -- voir
  // renderFactSheet() plus haut, data-decide="APPROVED".
  document.querySelectorAll("#view [data-video-publish]").forEach(b => b.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    const fid = b.dataset.videoPublish;
    b.disabled = true;
    Store.decide(fid, "APPROVED").then(r => {
      const msg = transmissionMessage(r?.transmission);
      snack(msg || "Article approuvé et transmis.");
    }).catch(e => { snack(friendlyActionError(e)); b.disabled = false; });
  });
  // Rejeter = ouvre la même bulle de choix (corbeille vs suppression
  // définitive) que la fiche article -- reject-confirm ne lit que
  // fact_id/champion.title, un objet minimal suffit (pas besoin de l'article
  // complet, absent de la réponse allégée de /api/videos).
  document.querySelectorAll("#view [data-video-reject]").forEach(b => b.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    const fid = b.dataset.videoReject;
    const title = b.dataset.videoRejectTitle || "";
    Store.openSheet({ type: "reject-confirm", fact: { fact_id: fid, champion: { title } } });
    renderSheet(Store.state);
  });
  bindVideoPlayers(Store.state.videos);
}

export { viewVideos, bindVideos };
