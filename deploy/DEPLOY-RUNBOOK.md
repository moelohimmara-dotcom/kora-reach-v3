# DEPLOY-RUNBOOK.md — Procédure de déploiement KORA Reach v3

Ce document s'adresse à **n'importe quel agent (Claude ou autre) ou
développeur** reprenant ce projet, sans connaissance préalable de la
session qui l'a écrit. Il décrit l'architecture de déploiement telle
qu'elle existe réellement en production (22/08/2026), les deux procédures
utilisables selon qui l'exécute, et la suite de tests de non-régression
qui doit tourner avant de considérer un déploiement sain.

Pour l'installation initiale d'un VPS neuf (nginx, systemd, durcissement,
fail2ban...), voir `deploy/README-DEPLOY.md` — ce fichier-ci couvre le
déploiement **continu** d'un VPS déjà en place.

## 1. Architecture de déploiement (3 couches)

```
GitHub (moelohimmara-dotcom/kora-reach-v3)
        │  git pull (humain, via compte `remote`)
        ▼
/home/remote/kora-deploy   ← clone de staging, appartient à `remote`
        │  deploy_check.sh (build + copie + restart + smoke tests)
        ▼
/opt/kora-reach/           ← RÉPERTOIRE RÉELLEMENT SERVI (backend + static/)
```

**Piège classique** (rencontré et corrigé le 22/08/2026) : un `git pull`
dans `kora-deploy` ne déploie RIEN tout seul. Sans exécuter
`deploy_check.sh` (ou la procédure agent ci-dessous) après, `/opt/kora-
reach/` reste figé sur l'ancien code, même si le dépôt GitHub et le clone
de staging sont à jour. Un bug a mis des jours à être détecté à cause de
ça (page Vidéos répondant 404 alors que le code était bien pushé).

Deux comptes SSH distincts sur le VPS :

| Compte | Clé/auth | Peut | Ne peut pas |
|---|---|---|---|
| `remote` | mot de passe (connu uniquement de Mister Marcket) | `sudo` complet, écrire dans `kora-deploy` | — |
| `kora` | clé dédiée `kora_client_key` (voir `livrables/secrets/acces.md` hors dépôt) | lire/écrire `/opt/kora-reach/` (fichiers déjà `kora:kora`) | `sudo` (sauf règle NOPASSWD, § 4), écrire dans `kora-deploy` |

## 2. Procédure humaine standard (compte `remote`)

C'est la procédure de référence, celle qui exécute réellement les 3
parcours de tests avant de rendre la main :

```bash
ssh remote@213.156.135.139
cd ~/kora-deploy
git pull
bash deploy_check.sh
```

`deploy_check.sh` fait, dans l'ordre : build frontend (`npm run build`),
copie statique + backend vers `/opt/kora-reach/`, `systemctl restart
kora-reach`, `nginx -s reload`, puis lance **Parcours A** (`smoke_test.
mjs` — tableau de bord, Articles, filtres), **Parcours B**
(`test_parcours_b.mjs` — Sources, Paramètres, Historique, Corbeille,
sélection/publication) et **Parcours C** (`test_parcours_c.mjs` — Vidéos
+ non-régression F5, bandeau de cycle, notifications). Un échec de l'un
des trois fait échouer le script (`exit 1`) — ne JAMAIS considérer un
déploiement terminé si l'un des `SMOKE_*_FAIL` apparaît dans la sortie.

## 3. Procédure agent (compte `kora`, sans mot de passe `remote`)

Un agent IA (ou un développeur sans le mot de passe `remote`) ne peut pas
suivre la procédure ci-dessus. C'est la procédure suivie manuellement,
étape par étape, tout au long de la session du 17 au 22/08/2026 — codifiée
dans `deploy/agent-deploy.sh` pour ne plus jamais avoir à la reconstruire
de mémoire :

```bash
KORA_SSH_KEY=~/.ssh/kora_client_key bash deploy/agent-deploy.sh [--with-backend] [--skip-smoke]
```

- Sans `--with-backend` : ne déploie que le frontend (`kora-vite/dist/`) —
  suffisant pour la quasi-totalité des changements (JS/CSS), ne nécessite
  AUCUN redémarrage du service (fichiers statiques servis directement).
- Avec `--with-backend` : déploie aussi `server.py` + les modules Python
  (`collection/`, `core/`, `editorial/`, `generation/`, `identity/`,
  `orchestration/`, `publishing/`), vérifie l'import Python avant de
  considérer l'étape réussie, et nécessite alors un redémarrage du
  service (voir § 4).
- Chaque transfert est vérifié par `sha256sum` des deux côtés — tout
  déploiement s'arrête (sans rien avoir écrasé côté serveur) si les
  hachages diffèrent.
- Une sauvegarde horodatée (`static.bak.<TS>`, `server.py.bak.<TS>`) est
  créée avant chaque écrasement — voir § 6 Rollback.
- Les smoke tests (Parcours A/B/C) sont rejoués en local si
  `playwright-core` est installé (`kora-vite/node_modules/playwright-
  core`) — sinon l'étape est silencieusement passée (elle tournera de
  toute façon côté VPS si un humain lance `deploy_check.sh` ensuite).

## 4. Sudoers optionnel — automatiser le redémarrage

Le compte `kora` n'a par défaut AUCUN droit `sudo` : `systemctl restart
kora-reach` et `nginx -s reload` exigent root. `agent-deploy.sh` tente
d'abord `sudo -n` (non-interactif) ; s'il échoue, il déploie quand même
les fichiers et affiche les 2 commandes à faire exécuter par Mister
Marcket via son compte `remote`.

Pour rendre cette dernière étape elle-même automatique (recommandé si un
agent doit pouvoir déployer de bout en bout sans intervention humaine),
demander à Mister Marcket d'exécuter **une fois**, en tant que `remote`
ou `root` :

```bash
echo 'kora ALL=(root) NOPASSWD: /usr/bin/systemctl restart kora-reach, /usr/sbin/nginx -s reload' \
  | sudo tee /etc/sudoers.d/kora-deploy
sudo chmod 440 /etc/sudoers.d/kora-deploy
sudo visudo -c   # valide la syntaxe avant de considérer la règle active
```

Portée strictement limitée à ces 2 commandes précises (pas de `sudo`
générique pour `kora`) — n'accorde rien d'autre, ne touche à aucun autre
service. Une fois posée, `agent-deploy.sh` redémarre le service tout seul
sans qu'aucun mot de passe ne soit jamais nécessaire côté agent.

**État au 22/08/2026 : cette règle n'est PAS encore posée** — chaque
déploiement touchant le backend nécessite encore une demande de
redémarrage manuel à l'utilisateur.

## 5. Ajouter un 4e parcours de test

Les 3 scripts (`kora-vite/smoke_test.mjs`, `test_parcours_b.mjs`,
`test_parcours_c.mjs`) suivent tous la même convention : Playwright,
connexion admin via `#authUser`/`#authPass`/`#authSubmit`, navigation via
`.rail .item[data-route="..."]`, assertions `ok(condition, message)`,
`exit 1` si un échec, `exit 2` si des erreurs console non filtrées
(401/403/ORB) sont apparues. Pour en ajouter un : copier `test_parcours_
c.mjs`, l'ajouter à la fois dans `deploy_check.sh` (bloc `Parcours D`) et
dans la boucle `for f in ...` d'`agent-deploy.sh`.

## 6. Rollback

Chaque déploiement (humain ou agent) laisse une sauvegarde horodatée sur
le VPS avant d'écraser quoi que ce soit :

```bash
ssh -i kora_client_key kora@213.156.135.139
cd /opt/kora-reach
ls -d static.bak.* server.py.bak.* 2>/dev/null | sort   # trouver le backup voulu
rm -rf static && cp -a static.bak.<TS> static            # restaure le frontend
cp -f server.py.bak.<TS> server.py                        # restaure le backend
# puis redémarrer (§ 2 ou § 4) si le backend a été restauré
```

## 7. Pièges connus

- **Process mystère** : un fichier `index.html.bak-mystere-20260822`
  (propriétaire `root`) existe dans `/opt/kora-reach/static/` — un
  processus non identifié a un jour écrasé/sauvegardé le frontend en
  dehors de toute procédure connue. Jamais reproduit depuis. Si `static/`
  semble à nouveau modifié sans déploiement explicite, comparer avec ce
  fichier et documenter ici ce qui a été trouvé.
- **Bruit 403/ORB dans les smoke tests** : des images sources externes
  (ex. `guineematin.com`) bloquent le hotlinking (`ERR_BLOCKED_BY_ORB`).
  C'est attendu, filtré explicitement dans les 3 parcours — ne pas
  essayer de le corriger côté KORA, ce n'est pas notre bug.
- **`/tmp` sur le VPS n'est pas ouvert en écriture pour `kora`** (owned
  par un autre uid) — toujours utiliser `/home/kora/` comme répertoire de
  transfert temporaire, jamais `/tmp`.
- **Deux répertoires de build fantômes** existent dans `/opt/kora-reach/`
  (`kora-vite-dist`, `kora-vite-dist.bak.*`) — ce sont des reliques d'une
  ancienne convention de nommage, JAMAIS servis (voir `STATIC` dans
  `server.py`, qui pointe sur `static/`). Ne pas les confondre avec le
  vrai répertoire servi.
