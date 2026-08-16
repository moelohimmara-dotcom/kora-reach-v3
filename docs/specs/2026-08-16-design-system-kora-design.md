# Spec B.1 — Figer le design system KORA (canon + page /style-guide)

**Date** : 2026-08-16
**Statut** : Design validé, prêt pour plan d'implémentation
**Périmètre** : convergence et documentation du design system ; construction d'une page de vérification vivante `/style-guide`. **Aucun redesign visuel du produit.**

---

## 1. Contexte et problème

L'historique Git montre 25+ commits d'allers-retours visuels (Material sombre ↔ terreux ↔ refonte "BizLink" ↔ rollbacks). La cause racine n'est pas un manque de charte, mais **l'absence d'une source de vérité unique et à jour**, aggravée par des définitions contradictoires.

### Constat vérifié (lecture du CSS + inspection de l'app en cours d'exécution, 2026-08-16)

Trois artefacts se recouvrent et se contredisent :

1. **`README.md`** — cite `--bg:#0E1114`, `--accent:#E9705D`, `--success:#3DD68C`.
2. **`docs/DESIGN_SYSTEM.md`** — documente les mêmes tokens sémantiques que le README, **mais** annonce la police **Inter/system-ui**.
3. **`kora-vite/src/style.css`** — porte en réalité **deux couches superposées** :
   - une couche **sémantique** (`--bg`, `--surface`, `--accent`, `--success`, `--warning`, `--danger`) réellement consommée par les composants ;
   - une couche **Material Design 3** parallèle (26 rôles `--md-sys-color-*`) avec un `--coral` distinct, partiellement morte.

**Ce que l'app rend réellement** (valeurs calculées lues dans le navigateur sur l'instance locale) :

| Token | Valeur rendue | Cohérent avec |
|---|---|---|
| `--bg` | `#0E1114` | README + DESIGN_SYSTEM.md ✅ |
| `--surface` | `#171C21` | DESIGN_SYSTEM.md ✅ |
| `--accent` | `#E9705D` | README + DESIGN_SYSTEM.md ✅ |
| `--success` | `#3DD68C` | ✅ |
| `--warning` | `#F5A83C` | DESIGN_SYSTEM.md ✅ |
| `--danger` | `#E5484D` | DESIGN_SYSTEM.md ✅ |
| Police (corps **et** titres) | **Source Sans Pro** | ni Inter (doc), ni Oswald (imports) ❌ |

**Incohérences résiduelles identifiées** :
- **Trois valeurs de "coral"** coexistent : `#E9705D` (`--accent`, réellement utilisé), `#F2A98C` (`--coral` calculé + `--md-sys-color-primary`), `#FF6B4A` (`--coral` défini plus haut dans `style.css`, écrasé en cascade).
- La **police documentée (Inter) diffère de la police rendue (Source Sans Pro)**.
- La couche **Material Design 3** (26 rôles) est largement **non consommée** par les composants et constitue du bruit.

**Conclusion** : la couche sémantique est déjà cohérente entre l'app et `docs/DESIGN_SYSTEM.md`. B.1 n'est donc pas « choisir entre trois chartes » mais **« adopter la couche sémantique comme canon et élaguer le reste »**.

---

## 2. Décision (canon)

**La couche sémantique réellement rendue est le canon.** Valeurs de référence figées :

```
--bg:        #0E1114   (fond application)
--surface:   #171C21   (cartes)
--accent:    #E9705D   (actions, accent — jamais glow néon)
--success:   #3DD68C   (état « prêt », validé)
--warning:   #F5A83C   (attention)
--danger:    #E5484D   (rejet, suppression)
Police:      Source Sans Pro (corps + titres)
```

Tout le reste (couche Material Design 3, `--coral` à `#F2A98C`/`#FF6B4A`, mention Inter) est **traité comme de la dette à documenter puis élaguer**, sans changement visuel perceptible pour l'utilisateur.

---

## 3. Travaux (5 lots)

### Lot 1 — Audit du CSS (lecture seule, aucun changement visuel)
- Repérer, par grep croisé `style.css` ↔ `app.js`/`shell.js`/`store.js`, les tokens **réellement consommés** vs les tokens **morts** (couche Material 3 non référencée).
- Cartographier les définitions en cascade conflictuelles (`--coral` défini plusieurs fois).
- Produire une liste : « à garder / à supprimer / à consolider ». Aucune modification à ce lot.

### Lot 2 — Mettre à jour `docs/DESIGN_SYSTEM.md`
- Corriger la **police** : `Inter/system-ui` → **Source Sans Pro** (réalité rendue).
- Ajouter la **table canonique des tokens sémantiques** (valeurs du §2) en tête, comme source de vérité.
- Marquer explicitement la couche Material Design 3 comme **dépréciée / en cours de retrait** (ne pas l'étendre).
- Conserver les sections déjà justes (composants, règles UI/UX, interdits historiques).

### Lot 3 — Construire la route `/style-guide` (page vivante)
- Nouvelle vue `viewStyleGuide(s)` dans `app.js`, ajoutée au `map` de routing existant (`const map = { cockpit, facts, ... }`). Aucune nouvelle infrastructure.
- **Rendue avec les vrais composants du code** (réutilise les fonctions de rendu de cartes KPI, badges, boutons déjà présentes), pas du HTML dupliqué — sinon la référence dérive elle-même.
- Contenu : palette des tokens sémantiques (swatch + nom + hex), échelle typographique (Source Sans Pro), tous les états de badge (pending/approved/rejected/transmitted/trashed — icône + texte, jamais couleur seule), boutons (primaire/secondaire/désactivé), une carte KPI, un aperçu de modale.
- **Accès** : lien discret dans Paramètres, réservé au rôle `advanced` (outil dev/équipe, pas éditeur ni client).

### Lot 4 — Corriger le README
- Remplacer la charte codée en dur par un **renvoi** vers `docs/DESIGN_SYSTEM.md` (éviter la duplication qui redérive).

### Lot 5 — Élagage ciblé (optionnel, un seul commit de convergence)
- Sur la base du Lot 1 : supprimer les tokens Material 3 morts et consolider les `--coral` en double, **uniquement si** l'audit confirme qu'ils ne sont pas consommés.
- Rebrancher tout composant qui utiliserait encore une couleur codée en dur sur le token sémantique.
- **Vérification obligatoire** : avant/après sur `/style-guide` + cockpit en preview live — aucun changement visuel perceptible.

---

## 4. Règle de gouvernance (anti-dérive)

À ajouter dans `docs/DESIGN_SYSTEM.md` :

> **Toute modification visuelle passe par `/style-guide` avant merge.** Un changement qui n'y apparaît pas correctement rendu n'est pas mergé. `docs/DESIGN_SYSTEM.md` est la seule doc de référence ; le README pointe vers elle sans la dupliquer.

C'est la clause qui, si elle avait existé, aurait évité l'essentiel des 25 commits d'allers-retours.

---

## 5. Environnement d'essai (déjà opérationnel)

Boucle de prévisualisation live mise en place le 2026-08-16, **100 % local, rien de déployé** :

- **Frontend** : Vite + hot-reload → `http://localhost:5173` (config `.claude/launch.json`).
- **Backend** : `server.py` en mode **SQLite** (`DATABASE_BACKEND=sqlite`, aucun Postgres requis) → `localhost:8766`.
- **Proxy** : `vite.config.js` proxifie `/kora-v2/api` → backend (remplace nginx en dev, évite le CORS).
- **Compte de dev** : `admin` / `KoraDev2026!` (créé au 1er démarrage via `ADMIN_USER`/`ADMIN_PASS`).
- **Transmission** : `dry_run` (aucune publication réelle). LLM en mode `template` (pas de clé requise).

Pour la page `/style-guide` en particulier, le frontend seul suffit (elle n'affiche que tokens + composants).

Un environnement de démo partageable (Railway / VPS existant) reste **une décision ultérieure**, hors périmètre B.1.

---

## 6. Critère de succès

1. Une future modification visuelle (couleur, composant) est **vérifiable en un coup d'œil sur `/style-guide`** avant merge.
2. `docs/DESIGN_SYSTEM.md` est la seule référence citée ; README pointe vers elle.
3. Les valeurs documentées correspondent aux valeurs **réellement rendues** (police incluse).
4. Aucune régression visuelle : cockpit et vues existantes identiques avant/après (vérifié en preview live).

---

## 7. Hors périmètre B.1

- Redesign visuel du produit (couleurs, layout) — B.1 ne change rien à l'apparence.
- Thèmes multiples (Cacao / Clair beige) — chantier séparé (piste B, wireframe 9.1).
- Découpage de `app.js`/`store.js` par vue — chantier stack (piste A).
- Déploiement d'un environnement de démo partageable.
