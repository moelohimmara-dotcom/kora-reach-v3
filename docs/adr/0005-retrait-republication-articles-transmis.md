# ADR-0005 : Retrait/republication d'un article transmis, sous-page dédiée, recomptage

**Date** : 2026-08-23
**Statut** : accepté, implémenté (T1-T5 tous en production, vérifiés en conditions réelles le 2026-08-23)
**Décideurs** : propriétaire du projet, assisté de Claude

## Contexte

Plus tôt le 2026-08-23, un bug réel a été corrigé : « Annuler la décision »
ramenait un fait `TRANSMITTED` à `PENDING_REVIEW` côté KORA **sans rien
toucher côté WordPress** — le post réel restait en ligne pendant que le
dashboard le réaffichait comme « à décider ». Réapprouver créait alors un
second post WordPress, dupliqué, sans aucune déduplication côté WordPress
(voir commit *"fix: verrouille les articles déjà transmis..."*). Le
correctif a fermé la porte : `retract()` refuse désormais tout fait
`TRANSMITTED` ([editorial/hitl_store.py](../../editorial/hitl_store.py)), et
la sélection multiple ne peut plus le cibler
([kora-vite/src/views/facts.js](../../kora-vite/src/views/facts.js)). Ce
verrouillage répond à la question laissée ouverte dans
[HITL-LOGIQUE.md](../../HITL-LOGIQUE.md) §10 *(« qui peut déverrouiller un
fait TRANSMITTED ? »)* par : personne, pour l'instant, tant qu'aucun
mécanisme de synchronisation réelle avec WordPress n'existe.

Ce même jour, deux autres évolutions ont ajouté une traçabilité qui
n'existait pas avant : `hitl_facts.wp_post_id`/`wp_url`/`wp_status` (le lien
vers le post RÉEL, peuplé par `mark_transmitted()`) et
`wp_category_name`/`suggested_category` (classement automatique). Cette
traçabilité change ce qui est possible : un vrai retrait synchronisé
(agissant sur le post réel, pas seulement sur l'affichage KORA) devient
faisable, ce qui n'était pas le cas au moment du verrouillage.

L'utilisateur propose maintenant trois évolutions liées, remontées après
avoir constaté que les articles transmis restent mélangés aux articles en
attente dans le tableau de bord et les compteurs :
1. Les articles transmis quittent l'affichage principal pour une sous-page
   dédiée (« Publiés »), au même rang que Brouillons/Corbeille.
2. Un bouton « Retirer de WordPress » dépublie le post réel et ramène
   l'article en état modifiable dans KORA ; une republication ultérieure
   doit être possible.
3. Les articles transmis sortent des compteurs « actifs » du dashboard,
   pour ne plus fausser la lecture du volume réellement en circuit éditorial.

## Décision

**Retirer un article = mettre le post WordPress réel en CORBEILLE WordPress**
(`DELETE /wp/v2/posts/{wp_post_id}` **sans** `force=true` — WordPress a déjà
son propre système de corbeille, ~30 jours, récupérable manuellement côté
WP). Le fait KORA repasse alors à `EDITED` (modifiable), avec
`wp_post_id`/`wp_url` **conservés** (pas effacés) pour permettre la
republication ciblée.

**Republier un article déjà retiré = restaurer le MÊME post WordPress**
(`wp_post_id` existant, sorti de la corbeille via une mise à jour de son
`status` à `draft`/`publish`) plutôt que d'en créer un nouveau. Élimine le
risque de doublon **à la racine** (structurellement, pas par une règle de
gestion qu'on espère ne jamais oublier d'appliquer) — contrairement au
mécanisme d'avant ce matin, qui ne savait tout simplement pas qu'un post
réel existait.

**Restriction de droit** : l'action « Retirer » exige le même niveau
d'habilitation que la publication WordPress (vérification
`_can_publish_wp()` déjà existante dans [server.py](../../server.py)) —
retirer un article publié est au moins aussi sensible que le publier.

**Sous-page « Publiés »** : promue au même rang de navigation que
Brouillons/Corbeille (actuellement des destinations distinctes), au lieu de
rester un simple onglet-filtre noyé dans la page Articles.

**Recomptage** : redéfinition des compteurs dashboard pour qu'ils forment
une partition sans chevauchement — « Articles » compte uniquement le
circuit éditorial actif (en attente/édité/rejeté), « Publiés » compte les
transmis, jamais les deux à la fois pour un même fait.

**Limite assumée** : les 3 faits transmis avant le 2026-08-23 (avant
l'ajout de `wp_post_id`) resteront hors de portée de « Retirer » — aucun
moyen fiable de retrouver leur post réel sans action manuelle. Documenté
comme limite connue, pas traité comme un bug.

## Alternatives envisagées

### Alternative 1 : Suppression définitive (`force=true`) au lieu de la corbeille WordPress
- **Avantages** : plus « propre », rien ne traîne sur WordPress.
- **Inconvénients** : aucun filet de sécurité — une erreur de manipulation
  détruit le post sans recours ; oblige à créer un NOUVEAU post à la
  republication (un nouvel ID, un nouveau permalien, mauvais pour le SEO
  d'un article qui était déjà indexé).
- **Pourquoi rejetée** : le coût d'utiliser la corbeille WordPress native est
  nul (un paramètre HTTP en moins) pour un bénéfice de sécurité réel et une
  republication in-place possible.

### Alternative 2 : Laisser « Transmis » comme simple filtre-onglet, ne pas créer de sous-page dédiée
- **Avantages** : aucun changement de navigation, moins de code.
- **Inconvénients** : incohérent avec Brouillons/Corbeille, déjà des
  destinations à part entière — « Transmis » reste l'exception plutôt que la
  norme.
- **Pourquoi rejetée** : la demande explicite de l'utilisateur va dans le
  sens de la cohérence déjà établie par le reste de la navigation, pas
  contre elle.

### Alternative 3 : Effacer `wp_post_id`/`wp_url` au retrait, republier = toujours un nouveau post
- **Avantages** : logique plus simple à coder (pas de restauration in-place).
- **Inconvénients** : perte du lien vers le post original à chaque cycle
  retrait/republication ; republier un article déjà retiré une fois créerait
  un nouveau permalien à chaque fois, mauvais pour le SEO et la lisibilité
  de l'historique éditorial.
- **Pourquoi rejetée** : la traçabilité existe déjà (ajoutée le matin même
  précisément pour ce genre d'usage) — ne pas la réutiliser serait jeter un
  investissement déjà fait.

## Conséquences

### Positives
- Ferme la boucle laissée ouverte dans [HITL-LOGIQUE.md](../../HITL-LOGIQUE.md)
  §10 par un mécanisme réellement synchronisé, pas un retour en arrière sur
  le correctif du matin.
- Republication in-place : aucun nouveau permalien, historique éditorial
  cohérent, zéro risque de doublon par construction.
- Tableau de bord plus lisible : compteurs qui ne se chevauchent plus,
  articles transmis regroupés dans un espace dédié à leur cycle de vie
  propre (retirer/republier), distinct du circuit de décision initial.

### Négatives
- Complexité supplémentaire : un fait peut désormais faire plusieurs
  allers-retours `EDITED` ↔ `TRANSMITTED`, chaque cycle doit rester
  traçable dans l'audit (`audit_events`) sans ambiguïté sur "quelle version
  a été publiée quand".
- Les 3 faits transmis avant ce correctif restent un cas particulier
  non couvert (voir Limite assumée ci-dessus).

### Risques
- Si un article est retiré puis republié après une modification
  substantielle du texte, l'ensemble du pipeline de transmission (image,
  vidéo, filet anti-artefact, classement automatique) doit retourner
  intégralement — c'est déjà le comportement actuel de `transmit()`, aucun
  changement requis, mais à vérifier explicitement en test réel avant de
  considérer la tâche T2 terminée.
- Un post mis en corbeille WordPress puis republié après plus de ~30 jours
  (purge automatique de la corbeille WordPress elle-même) ne pourra plus
  être restauré par son ID — mitigé en détectant l'échec (404 WordPress) et
  en repliant alors sur une création de post neuve, avec avertissement
  explicite à l'éditeur plutôt qu'un échec silencieux.

## Plan d'implémentation (tâches)

Découpage pour exécution séquentielle, chaque tâche vérifiée en conditions
réelles (jamais de code non testé) avant de passer à la suivante, avec
déploiement et suite de non-régression en fin de parcours.

- ✅ **T1 — Backend : retrait synchronisé.** Fait.
  `publishing/transmit.py::retract_from_wordpress(wp_post_id)` (met le post
  en corbeille WP via l'API REST) + `editorial/hitl_store.py::mark_retracted(fact_id, by)`
  (statut → `EDITED`, `wp_post_id`/`wp_url` conservés, décision tracée) +
  endpoint `POST /api/hitl/withdraw` dans `server.py`, réservé au même droit
  que la publication WordPress. Vérifié en conditions réelles : vrai post
  WordPress confirmé `status=trash` après coup, à la fois en appel direct
  et via le vrai endpoint HTTP authentifié.
- ✅ **T2 — Backend : republication in-place.** Fait.
  `_to_wordpress()` détecte un `wp_post_id` existant sur le fait et met à
  jour ce post (sortie de corbeille incluse) au lieu d'en créer un nouveau ;
  repli sur une création neuve si le post original n'existe plus (404), avec
  `republish_warning` explicite. **Bug trouvé en testant** (pas anticipé
  dans l'analyse initiale) : WordPress renomme le slug d'un post en corbeille
  en `__trashed-N`, jamais restauré automatiquement par une simple mise à
  jour de statut via l'API REST — corrigé par `_wp_slugify(title)`, qui
  envoie systématiquement un slug propre dérivé du titre à la republication.
- ✅ **T3 — Sous-page « Publiés ».** Fait.
  Nouvelle route de navigation `published` (même rang que Brouillons/
  Corbeille, ajoutée aux 4 emplacements de nav — rail, tiroir mobile, "Plus"
  desktop/mobile), retrait des articles `TRANSMITTED` de la liste principale
  « Articles », `viewPublished()` avec bouton « Retirer de WordPress » (et
  dans le tiroir article, à la place de l'ancien bloc lecture-seule).
  Vérifié bout en bout via Playwright sur un vrai article : absent
  d'Articles, présent sur Publiés, clic réel sur « Retirer » → article
  redevenu modifiable, post WordPress confirmé en corbeille.
- ✅ **T4 — Recomptage dashboard.** Fait.
  Nouvelle clé `active_facts` (= `total_facts - transmitted`) dans
  `get_dashboard_stats()`, utilisée par la tuile « Articles » du cockpit et
  le badge de navigation. Vérifié : avant le correctif, la tuile affichait
  22 quand la page n'en listait que 19 (transmis exclus par T3) —
  exactement la confusion signalée ; après déploiement, les deux
  correspondent (19 = 19).
- ✅ **T5 — Vérification et déploiement.** Fait.
  Cycle complet testé en conditions réelles sur un vrai article : transmission
  (brouillon) → apparition sur Publiés/disparition d'Articles → retrait
  (post réel en corbeille WordPress) → réapparition en Brouillons → 
  republication (publication officielle) → **même `wp_post_id`, même
  permalien propre**, catégorie automatique conservée à travers tout le
  cycle. Invariant `total_facts = pending+transmitted+rejected+drafts+trash`
  revérifié intact après le recomptage (T4). Suite de non-régression
  (`smoke_test.mjs`, `test_parcours_b/c.mjs`) : SUCCÈS après chacune des
  tâches T1-T4. [HITL-LOGIQUE.md](../../HITL-LOGIQUE.md) mis à jour (ligne
  `TRANSMITTED` et angle mort §10 « Override »).
