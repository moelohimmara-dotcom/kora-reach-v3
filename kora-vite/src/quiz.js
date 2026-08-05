// Mini-quiz éditorial — affiché pendant le cycle de génération (attente utile).
// Pool de questions Vrai/Faux métier. Pas de backend : 100% côté client.
const QUIZ_POOL = [
  {
    q: "Un article d'actualité doit citer au moins une source vérifiée.",
    a: true,
    ex: "Oui — KORA ne publie jamais sans source whitelistée. La traçabilité est le cœur de l'outil."
  },
  {
    q: "Le niveau 1 regroupe les sources internationales (RFI, BBC, France24).",
    a: false,
    ex: "Non — le Niveau 1 = sources guinéennes (Mosaïque, Guinéenews…). Le Niveau 2 = international filtré."
  },
  {
    q: "Fusionner 3 articles sur un même fait augmente la fiabilité de l'article.",
    a: true,
    ex: "Exact — la fusion de plusieurs sources indépendantes réduit le biais et les erreurs."
  },
  {
    q: "KORA peut générer un article même si aucune source n'a publié depuis 24h.",
    a: false,
    ex: "Non — par défaut la fenêtre est de 24h. L'option « Générer quand même » force hors fenêtre (à utiliser avec précaution)."
  },
  {
    q: "La validation humaine (HITL) est obligatoire avant transmission.",
    a: true,
    ex: "Oui — aucun article n'est transmis sans décision Approuver/Rejeter/Modifier d'un éditeur."
  },
  {
    q: "Un utilisateur 'Normal' peut gérer les comptes et les rôles.",
    a: false,
    ex: "Non — seul le rôle 'Avancé' gère les habilitations. Le Normal se limite à générer et valider."
  },
  {
    q: "L'illustration d'un article KORA est toujours une photo réelle du terrain.",
    a: false,
    ex: "Non — les images sont générées par IA (non-copyrightées). On l'indique dans la légende."
  },
  {
    q: "Le périmètre éditorial par défaut couvre l'actualité Guinée.",
    a: true,
    ex: "Exact — la cible est l'actu guinéenne, avec un niveau 2 international pour le contexte."
  },
  {
    q: "Un article rejeté en validation peut être supprimé de l'historique.",
    a: true,
    ex: "Oui — depuis l'onglet Historique, on purge les événements (ligne de purge conservée)."
  },
  {
    q: "Le mode 'Générer quand même' s'applique sur une fenêtre de 48h.",
    a: false,
    ex: "Non — il force hors des 24h, mais reste borné à 48h max pour éviter le hors-sujet."
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
      <div class="quiz-badge">🧠 Mini-quiz · édition</div>
      <div class="quiz-q">${esc(item.q)}</div>
      <div class="quiz-actions">
        <button class="btn btn-tonal quiz-ans" data-a="true">Vrai</button>
        <button class="btn btn-tonal quiz-ans" data-a="false">Faux</button>
      </div>
      <div class="quiz-feedback" hidden></div>
      <div class="quiz-score">Score session : <b id="quizScore">${_quizState.correct}/${_quizState.total}</b></div>
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
  // passe à la question suivante après 2.5s
  setTimeout(() => { if (container.isConnected) { quizPick(); quizRender(container); } }, 2600);
}

function quizReset() { _quizState = null; }

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

export const Quiz = { render: quizRender, reset: quizReset };
