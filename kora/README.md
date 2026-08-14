# Dossier `kora/` — Preuves, prototypes & diagnostic de KORA Reach

Ce dossier **ne contient pas le code source** de KORA (il reste à la racine du repo :
`kora-vite/` pour le front, `*.py` pour le collecteur back). Il regroupe tout l'**artefact
de travail** généré pendant les sessions d'évolution/refonte, pour qu'il soit conservé sur
GitHub et reprenable par un autre développeur ou agent.

## Structure

| Sous-dossier | Contenu | Utilité |
|---|---|---|
| `captures/` | `*.png` des captures d'écran live (rail, cockpit, vues, comparaisons d'icônes) | Preuve visuelle des rendus avant/après |
| `prototypes/` | `*.html` de maquettes statiques (rail v2, icônes Tabler/Lucide/Phosphor, nav…) | Reproduire une direction de design sans toucher au repo |
| `diagnostic-scripts/` | `*.mjs`/`*.js` de sondes Playwright (diag, dump, mock, repro, audit, check, smoke, parcours) | Re-tester un bug ou un comportement en conditions réelles |
| `logs/` | `auth_audit.log` | Journal d'audit léger |
| `deploy-config/` | `*.service`, `*.conf`, `*.sh`, `env.example` (SANS le vrai `.env`) | Config systemd/nginx/ufw/backup de prod, à titre de référence |
| `debug-artifacts/` | `_quarantine/`, `__test__/` | Déchets de debug isolés |

## Sécurité

- **Aucun secret** n'est présent : `deploy/.env` (admin pass + PG password) et `_key.txt`
  sont volontairement **exclus** (voir `.gitignore`). Seul `deploy-config/env.example`
  (modèle vide) est fourni.
- **Aucun core dump** (fichiers `core.*` de plusieurs Go) n'est versionné — GitHub refuse
  tout fichier > 100 Mo et ces dumps ne servent à rien.

## Reprendre le projet

Le code source complet est à la racine (`kora-vite/` + `*.py`). Un `git clone` suffit.
Ce dossier `kora/` est une valise de preuves/diagnostic, pas une dépendance du build.
