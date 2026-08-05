// Mini-quiz culture générale — affiché pendant le cycle de génération (attente utile).
// L'agent pose des questions ludiques (pas métier) pour tenir l'utilisateur en haleine.
// Pool statique côté client, pas de backend.
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
    ex: "Faux — le TTL est un compteur de sauts (hops) : il décrémenté à chaque routeur pour éviter les boucles."
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

let _quizState = null; // { idx, answered, correct, total }

function quizPick() {
  const idx = Math.floor(Math.random() * QUIZ_POOL.length);
  _quizState = { idx, answered: false, correct: 0, total: 0 };
  return QUIZ_POOL[idx];
}

function quizRender(container) {
  if (!container) return;
  if (!_quizState) quizPick();
  const item = QUIZ_POOL[_quizState.idx];
  container.innerHTML = `
    <div class="quiz-card">
      <div class="quiz-badge">🌍 Culture générale</div>
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
  if (!_quizState || _quizState.answered) return;
  const item = QUIZ_POOL[_quizState.idx];
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
  // passe à la question suivante après 2.6s
  setTimeout(() => { if (container.isConnected) { quizPick(); quizRender(container); } }, 2600);
}

function quizReset() { _quizState = null; }

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

export const Quiz = { render: quizRender, reset: quizReset };
