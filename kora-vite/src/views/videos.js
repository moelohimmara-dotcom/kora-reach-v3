/* ============================================================
   KORA — views/videos.js : page Vidéos (liste + lecteur inline avec
   lecture/pause/stop/barre de progression). Extrait de app.js le
   22/08/2026 (refacto plan étape 4).
   ============================================================ */
import { Store } from "../store.js";
import { esc, icon, chip, statusBadge, stateBox } from "../utils.js";
import { renderSheet } from "../sheet.js";
import { openFact, render, openWpChoiceForFact } from "../app.js";

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
// Lecteur inline réutilisable (2026-08-23, extrait de row() pour être
// partagé avec viewPublished() -- views/facts.js : un article transmis
// avec vidéo doit garder sa lecture inline même déplacé sur la page
// Publiés, voir demande explicite "les faire apparaître sur la page
// Publiés avec leur affordance vidéo"). data-video-toggle/-play/-stop/...
// sont câblés par bindVideoPlayers() ci-dessous, appelée par les DEUX pages.
function videoListenButton(v) {
  return `<button type="button" class="btn btn-tonal btn-sm" data-video-toggle="${esc(v.fact_id)}">${icon("i-play")} Écouter</button>`;
}
function videoPlayerWrap(v) {
  return `
      <div class="video-player-wrap" id="videoPlayer-${esc(v.fact_id)}" hidden>
        <div class="video-preview-wrap">
          <video class="video-preview" preload="none" ${v.image ? `poster="${esc(v.image)}"` : ""} data-video-el="${esc(v.fact_id)}"></video>
        </div>
        <!-- P1 (audit UX Vidéos, 2026-08-24) : <div onclick> sans tabindex/role/
             gestion clavier -- totalement inopérable au clavier ou lecteur
             d'écran (violation WCAG 2.1.1), seuls ±10s restaient accessibles
             sans souris. role="slider" + valeurs (mises à jour en direct dans
             syncIcon() plus bas) + flèches gauche/droite (±5s) et Origine/Fin
             (Home/End) via le gestionnaire keydown câblé dans bindVideoPlayers(). -->
        <div class="video-progress" data-video-progress="${esc(v.fact_id)}" role="slider" tabindex="0"
             aria-label="Position de lecture" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="0:00 sur 0:00">
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
        <!-- #3 (audit UX Vidéos, 2026-08-24) : le lecteur custom est la seule
             interface, sans piste de sous-titres pour la narration -- aucune
             alternative textuelle (WCAG 1.2.x). Le texte intégral de
             l'article (source de la narration) est déjà disponible sur la
             fiche -- lien direct plutôt que dupliquer le texte ici. -->
        <button type="button" class="video-text-link" data-video-text="${esc(v.fact_id)}">${icon("i-facts")} Lire le texte de l'article</button>
      </div>`;
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
  // Exclusion des articles déjà transmis (2026-08-23, même principe que
  // viewFacts()/ADR-0005, tâche T3 étendue aux vidéos, demande explicite :
  // "exclure les vidéos déjà transmises de la page Vidéos, comme pour
  // Articles -> Publiés") -- une vidéo dont l'article est déjà publié
  // n'est plus une action en attente ici, elle vit désormais sur la page
  // Publiés (voir viewPublished(), views/facts.js, qui affiche aussi son
  // lecteur inline pour ne rien perdre en la déplaçant).
  const videos = (s.videos || []).filter(v => v.status !== "TRANSMITTED");
  if (!videos.length) return stateBox("i-spark", "Aucune vidéo", "Génère une vidéo narrée depuis la fiche d'un article (section « Vidéo narrée ») -- elle apparaîtra ici. Les vidéos déjà transmises à WordPress sont sur la page Publiés.", !!s.ui.loading);
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
      actions += videoListenButton(v);
    }
    if (!readOnly) {
      if (trashed) {
        // data-restore/data-del : câblés GLOBALEMENT dans render() (voir plus
        // bas, "Corbeille : boutons restaurer / supprimer") -- pas besoin de
        // re-câbler ici, ces attributs suffisent quelle que soit la page.
        actions += `
          <button type="button" class="btn btn-tonal btn-sm" data-restore="${esc(v.fact_id)}">${icon("i-undo")} Restaurer</button>
          <button type="button" class="btn btn-danger btn-sm" data-del="${esc(v.fact_id)}">${icon("i-trash")} Supprimer</button>`;
      } else if (v.status !== "TRANSMITTED") {
        // Publier/Rejeter (2026-08-23, verrouillage étendu -- même principe
        // que le tiroir article/la sélection multiple pour un fait
        // TRANSMITTED : "Rejeter" restait actif alors que "Publier" était
        // déjà caché, incohérence trouvée en analysant la demande de
        // l'utilisateur. En pratique cette page exclut déjà les vidéos
        // transmises plus haut -- ce garde-fou est une défense en
        // profondeur pour row(), réutilisée telle quelle par
        // viewPublished() (views/facts.js) où un fait TRANSMITTED EST
        // affiché, avec ses propres actions (Retirer) à la place.
        actions += `
          <button type="button" class="btn btn-primary btn-sm" data-video-publish="${esc(v.fact_id)}">${icon("i-send")} Publier</button>
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
            ${v.video_narration_mode === "duo_hh" || v.video_narration_mode === "duo_hf" ? ` · ${chip("Dialogue à deux voix", "secondary", "i-facts")}` : ""}
          </div>
          ${v.video_status === "generating" ? videoStageStepper(v.video_stage) : ""}
        </div>
        ${v.video_status !== "generating" ? videoStatusChip(v) : ""}
        <div class="video-row-actions">${actions}</div>
      </div>
      ${playable ? videoPlayerWrap(v) : ""}
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
    // P2 (audit UX Vidéos, 2026-08-24) : play() renvoie une promesse qui se
    // rejette si interrompue par un pause() rapproché (clic rapide, ou
    // activation via lecteur d'écran) -- "The play() request was interrupted
    // by a call to pause()" apparaissait en erreur console non gérée, sans
    // conséquence visible ici mais un vrai bruit en production.
    if (vidEl.paused || vidEl.ended) vidEl.play().catch(() => {}); else vidEl.pause();
  });
  // #3 (audit UX Vidéos, 2026-08-24) : alternative textuelle -- ouvre la
  // fiche article (déjà utilisée partout ailleurs pour ce même contenu).
  document.querySelectorAll("#view [data-video-text]").forEach(b => b.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    openFact(b.dataset.videoText);
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
  // P1 (audit UX Vidéos, 2026-08-24) : gestion clavier de la barre de
  // progression (role="slider", voir videoPlayerWrap()) -- flèches
  // gauche/droite = ±5s (pas standard des lecteurs vidéo, plus fin que les
  // boutons ±10s dédiés), Origine/Fin = début/fin de la vidéo.
  document.querySelectorAll("#view [data-video-progress]").forEach(bar => bar.onkeydown = (e) => {
    const fid = bar.dataset.videoProgress;
    const wrap = document.getElementById(`videoPlayer-${fid}`);
    const vidEl = wrap && wrap.querySelector("[data-video-el]");
    if (!vidEl || !vidEl.duration) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); vidEl.currentTime = Math.max(0, vidEl.currentTime - 5); }
    else if (e.key === "ArrowRight") { e.preventDefault(); vidEl.currentTime = Math.min(vidEl.duration, vidEl.currentTime + 5); }
    else if (e.key === "Home") { e.preventDefault(); vidEl.currentTime = 0; }
    else if (e.key === "End") { e.preventDefault(); vidEl.currentTime = vidEl.duration; }
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
      // P1 (audit UX Vidéos, 2026-08-24) : valeurs du role="slider" tenues à
      // jour à chaque tick, comme la barre visuelle et le minuteur.
      const bar = document.querySelector(`[data-video-progress="${fid}"]`);
      if (bar && vidEl.duration) {
        const pct = Math.min(100, Math.round((vidEl.currentTime / vidEl.duration) * 100));
        bar.setAttribute("aria-valuenow", String(pct));
        bar.setAttribute("aria-valuetext", `${_fmtT(vidEl.currentTime)} sur ${_fmtT(vidEl.duration)}`);
      }
    };
    // "seeked" ajouté (audit UX Vidéos, 2026-08-24, vérification du
    // correctif P1) : un currentTime posé par clavier/±10s ne déclenche pas
    // forcément un "timeupdate" assez tôt pour rester perceptible -- sans
    // "seeked", aria-valuenow/aria-valuetext (posés par ce même syncIcon)
    // restaient visuellement/programmatique en retard d'un cran après un
    // saut clavier, la barre visuelle elle-même se mettant à jour au
    // prochain tick naturel seulement.
    ["play", "pause", "ended", "timeupdate", "seeked", "loadedmetadata"].forEach(ev => vidEl.addEventListener(ev, syncIcon));
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
  // Publier = ouvre désormais le même choix Publier directement / Brouillon
  // WordPress que la fiche article et la sélection multiple (2026-08-22,
  // demande explicite : "l'article vidéo doit pouvoir être transféré sur
  // wordpress dans brouillons ou en publication officielle" -- jusqu'ici ce
  // bouton appelait Store.decide() directement, sans jamais proposer le
  // choix, contrairement au bouton "Approuver & transmettre" de la fiche).
  document.querySelectorAll("#view [data-video-publish]").forEach(b => b.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    openWpChoiceForFact(b.dataset.videoPublish);
  });
  // Rejeter = ouvre la même bulle de choix (corbeille vs suppression
  // définitive) que la fiche article -- reject-confirm ne lit que
  // fact_id/article_retenu.title, un objet minimal suffit (pas besoin de l'article
  // complet, absent de la réponse allégée de /api/videos).
  document.querySelectorAll("#view [data-video-reject]").forEach(b => b.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    const fid = b.dataset.videoReject;
    const title = b.dataset.videoRejectTitle || "";
    Store.openSheet({ type: "reject-confirm", fact: { fact_id: fid, article_retenu: { title } } });
    renderSheet(Store.state);
  });
  bindVideoPlayers(Store.state.videos);
}

export { viewVideos, bindVideos, videoListenButton, videoPlayerWrap, bindVideoPlayers, fmtDuration };
