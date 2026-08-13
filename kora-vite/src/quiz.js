// Mini-quiz culture générale — affiché pendant le cycle de génération (attente utile).
// L'agent pose des questions ludiques (pas métier) pour tenir l'utilisateur en haleine.
// Pool statique côté client, pas de backend.
//
// RÈGLE STRICTE (demandée par l'utilisateur) : chaque question attend la
// validation (Vrai/Faux) AVANT de présenter la suivante. Le quiz ne doit JAMAIS
// être réinitialisé en cours de route par un re-render de l'application (le cycle
// de génération fait des setState répétés) — il gère sa propre progression.
const QUIZ_POOL = [
  {
    q: "La capitale de l'Australie est Sydney.",
    a: false,
    ex: "Faux — c'est Canberra. Sydney est la plus grande ville, mais Canberra est la capitale fédérale depuis 1913."
  },
  {
    q: "L'eau gèle à 0°C au niveau de la mer.",
    a: true,
    ex: "Vrai — à pression atmosphérique normale, l'eau pure se solidifie à 0°C."
  },
  {
    q: "La pyramide de Khéops a été construite en Égypte antique.",
    a: true,
    ex: "Vrai — vers 2560 av. J.-C., sous le règne de Khéops (IVe dynastie)."
  },
  {
    q: "Le lithium est un métal liquide à température ambiante.",
    a: false,
    ex: "Faux — seul le mercure est liquide à température ambiante. Le lithium est un métal solide, très léger."
  },
  {
    q: "La planète Jupiter est la plus massive du système solaire.",
    a: true,
    ex: "Vrai — elle est ~2,5 fois plus lourde que toutes les autres planètes réunies."
  },
  {
    q: "Leonardo da Vinci a peint la Joconde.",
    a: true,
    ex: "Vrai — le portrait de Mona Lisa, réalisé au début du XVIe siècle, est l'une de ses œuvres les plus célèbres."
  },
  {
    q: "L'océan Pacifique est le plus grand océan du monde.",
    a: true,
    ex: "Vrai — il couvre près du tiers de la surface de la Terre."
  },
  {
    q: "Le TTL (Time To Live) d'un paquet réseau mesure sa vitesse en Mb/s.",
    a: false,
    ex: "Faux — le TTL est un compteur de sauts (hops) : il est décrémenté à chaque routeur pour éviter les boucles."
  },
  {
    q: "La Tour Eiffel a été construite pour l'Exposition universelle de 1889.",
    a: true,
    ex: "Vrai — édifiée par Gustave Eiffel pour célébrer le centenaire de la Révolution française."
  },
  {
    q: "Les dinosaures ont disparu il y a environ 65 millions d'années.",
    a: true,
    ex: "Vrai — fin du Crétacé, à la suite de l'impact de Chicxulub (Mexique)."
  },
  {
    q: "L'hémisphère Nord compte plus de terres émergées que l'hémisphère Sud.",
    a: true,
    ex: "Vrai — ~68 % des terres émergées sont dans l'hémisphère Nord."
  },
  {
    q: "Le son voyage plus vite dans l'eau que dans l'air.",
    a: true,
    ex: "Vrai — ~1500 m/s dans l'eau contre ~340 m/s dans l'air, car l'eau est plus dense."
  }
];

const QUIZ_COUNT = 5; // nombre de questions par session

let _quizState = null; // { queue:[idx...], pos, answered, correct, total, active }

function quizShuffle(n) {
  const idx = QUIZ_POOL.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, Math.min(n, idx.length));
}

function quizRender(container) {
  if (!container || !_quizState) return;
  const item = QUIZ_POOL[_quizState.queue[_quizState.pos]];
  const shown = _quizState.pos + 1;
  const total = _quizState.queue.length;
  const pct = Math.round(((_quizState.pos) / total) * 100);
  container.innerHTML = `
    <div class="quiz-card">
      <div class="quiz-badge">🌍 Culture générale</div>
      <div class="quiz-progress">
        <span class="quiz-progress-label">Question ${shown} / ${total}</span>
        <div class="quiz-progress-track"><div class="quiz-progress-bar" style="width:${pct}%"></div></div>
      </div>
      <div class="quiz-q">${esc(item.q)}</div>
      <div class="quiz-actions">
        <button class="btn btn-tonal quiz-ans" data-a="true">Vrai</button>
        <button class="btn btn-tonal quiz-ans" data-a="false">Faux</button>
      </div>
      <div class="quiz-feedback" hidden></div>
      <div class="quiz-score">Score : <b id="quizScore">${_quizState.correct}/${_quizState.total}</b></div>
    </div>`;
  container.querySelectorAll('.quiz-ans').forEach(b => {
    b.onclick = () => quizAnswer(container, b.dataset.a === 'true');
  });
}

function quizAnswer(container, userAns) {
  if (!_quizState || _quizState.answered || !_quizState.active) return;
  const item = QUIZ_POOL[_quizState.queue[_quizState.pos]];
  _quizState.answered = true;
  _quizState.total += 1;
  const ok = (userAns === item.a);
  if (ok) _quizState.correct += 1;
  const fb = container.querySelector('.quiz-feedback');
  if (fb) {
    fb.hidden = false;
    fb.className = 'quiz-feedback ' + (ok ? 'ok' : 'ko');
    fb.innerHTML = `${ok ? '✅ Bonne réponse !' : '❌ Raté —'} ${esc(item.ex)}`;
  }
  container.querySelectorAll('.quiz-ans').forEach(b => b.disabled = true);
  const sc = container.querySelector('#quizScore');
  if (sc) sc.textContent = `${_quizState.correct}/${_quizState.total}`;
  // Avance UNIQUEMENT après validation + délai de lecture (jamais avant).
  setTimeout(() => {
    if (!container.isConnected || !_quizState || !_quizState.active) return;
    _quizState.pos += 1;
    if (_quizState.pos >= _quizState.queue.length) {
      quizFinish(container);
    } else {
      _quizState.answered = false;
      quizRender(container);
    }
  }, 2600);
}

function quizFinish(container) {
  if (!_quizState) return;
  _quizState.active = false;
  const total = _quizState.queue.length;
  const correct = _quizState.correct;
  container.innerHTML = `
    <div class="quiz-card">
      <div class="quiz-badge">🌍 Culture générale</div>
      <div class="quiz-q">Quiz terminé !</div>
      <div class="quiz-feedback ok" style="display:block">Votre score : <b>${correct}/${total}</b>${correct === total ? ' 🏆 Perfect !' : ''}</div>
      <div class="quiz-actions">
        <button class="btn btn-primary" id="quizClose">Fermer</button>
      </div>
    </div>`;
  const close = container.querySelector('#quizClose');
  if (close) close.onclick = () => {
    const gl = document.getElementById('globalLoader');
    if (gl) gl.hidden = true;
  };
}

// Démarre une NOUVELLE session de quiz (appelé une seule fois au lancement de la
// génération). Affiche le loader et empêche tout reset ultérieur pendant la session.
function quizStart(container, count = QUIZ_COUNT) {
  if (!container) return;
  _quizState = { queue: quizShuffle(count), pos: 0, answered: false, correct: 0, total: 0, active: true };
  const gl = document.getElementById('globalLoader');
  if (gl) gl.hidden = false;
  const t = document.getElementById('globalLoaderText');
  if (t) t.textContent = 'Agent en cours…';
  quizRender(container);
}

function quizReset() { _quizState = null; }

function quizIsActive() { return !!(_quizState && _quizState.active); }

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export const Quiz = { start: quizStart, render: quizRender, reset: quizReset, isActive: quizIsActive };
