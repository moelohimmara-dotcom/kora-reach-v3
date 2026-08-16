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

**L'accent est un token de BRANDING configurable, pas un hex figé** (constat de l'audit Lot 1, 2026-08-16) :
- Le vrai token d'accent est **`--coral`** — utilisé **64 fois** par les composants, contre `--accent` **3 fois** (quasi legacy).
- `--coral` est **injecté dynamiquement par le backend** : `store.js` → `applySettings()` fait `root.style.setProperty("--coral", s.accent_coral)` à partir de `/api/settings`. Le défaut vit dans `settings.py` (`accent_coral = #F2A98C`). C'est la **fonctionnalité white-label** (Paramètres → Personnalisation), intentionnelle.
- Les **deux `--coral` statiques de `style.css`** (`#FF6B4A` ligne 16, `#E9705D` ligne 1841) sont des **fallbacks écrasés** dès que les réglages se chargent. `--accent: #E9705D` est du **legacy** à réconcilier.

**Autres incohérences** :
- La **police documentée (Inter) diffère de la police rendue (Source Sans Pro)**.
- Couche **Material Design 3** : 128 tokens `--md-sys-color-*` définis, ~25 réellement consommés → **24 tokens morts** (variantes `-fixed`, `-fixed-dim`, `inverse-*`) à élaguer.
- **44 valeurs hex brutes** hors `:root` dans `style.css` (composants qui court-circuitent les tokens) — dette à rebrancher progressivement.

**Conclusion** : la couche sémantique de structure (`--bg`, `--surface`, `--success`…) est déjà cohérente entre l'app et `docs/DESIGN_SYSTEM.md`. **L'accent, lui, est volontairement configurable** (`--coral`, défaut `#F2A98C`). B.1 = **documenter fidèlement cette réalité + élaguer les fallbacks morts et les tokens Material 3 inutilisés**, sans casser le branding dynamique ni changer l'apparence.

---

## 2. Décision (canon)

**Deux natures de tokens à distinguer** :

**a) Tokens de structure — figés (canon) :**
```
--bg:        #0E1114   (fond application)
--surface:   #171C21   (cartes)
--success:   #3DD68C   (état « prêt », validé)
--warning:   #F5A83C   (attention)
--danger:    #E5484D   (rejet, suppression)
Police:      Source Sans Pro (corps + titres)
```

**b) Token d'accent — configurable (branding white-label) :**
```
--coral      = accent primaire. Piloté par settings.accent_coral (/api/settings),
               injecté au runtime via store.js applySettings().
               Défaut : #F2A98C (settings.py).
--bordeaux, --coral-strong = dérivés de --coral.
```

**Défaut d'accent décidé = `#E9705D`** (charte KORA documentée ; validé 2026-08-16). Toutes les sources du défaut sont unifiées sur cette valeur :
- `settings.py` → `DEFAULTS["accent_coral"]` : `#F2A98C` → **`#E9705D`**.
- `style.css` → les deux `--coral` statiques (`#FF6B4A`, `#E9705D`) → **une seule** définition `#E9705D` ; `--accent` legacy aligné.
- `app.js` → fallbacks codés en dur `#F2A98C` (thèmes L32-35, champ couleur L718/720, L1161) → **`#E9705D`**.

Ainsi, avant même le chargement de `/api/settings`, l'UI affiche déjà la couleur de charte (pas de flash). Le white-label reste pleinement fonctionnel : un déploiement ayant stocké un `accent_coral` en base garde le sien.

Tout le reste (24 tokens Material 3 morts, mention Inter dans la doc) est **documenté puis élagué**, sans changement visuel perceptible.

---

## 3. Travaux (5 lots)

### Lot 1 — Audit du CSS ✅ FAIT (2026-08-16, lecture seule)
Résultats :
- **Accent** : `--coral` (64 usages) est le vrai token, piloté par le branding (`store.js applySettings` ← `settings.accent_coral`, défaut `#F2A98C`). `--accent` (3 usages) est legacy. Deux fallbacks statiques `--coral` divergents dans `style.css` (`#FF6B4A` L16, `#E9705D` L1841).
- **Material 3** : 128 tokens définis, ~25 consommés → **24 morts** (`-fixed`, `-fixed-dim`, `inverse-*`, quelques `on-*`).
- **Hex bruts** : 44 occurrences hors `:root` (composants à rebrancher, dette progressive).
- **Police** : Source Sans Pro rendue (doc dit Inter → à corriger).

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

### Lot 5 — Unification de l'accent + élagage ciblé
**5a — Unifier le défaut d'accent sur `#E9705D`** (léger changement visuel assumé : pêche → terracotta, uniquement pour les déploiements au défaut) :
- `settings.py` : `DEFAULTS["accent_coral"] = "#E9705D"`.
- `style.css` : une seule définition `--coral: #E9705D` (retirer `#FF6B4A` L16 ; garder/aligner L1841) ; `--accent` aligné.
- `app.js` : remplacer les fallbacks `#F2A98C` (L32-35, L718, L720, L1161) par `#E9705D`.
- Vérifier en preview que le branding dynamique (Paramètres → Personnalisation) surcharge toujours correctement.

**5b — Élaguer les 24 tokens Material 3 morts** (identifiés au Lot 1 : `-fixed`, `-fixed-dim`, `inverse-*`, `on-*` non consommés). Suppression pure, aucun `var()` ne les référence.

**5c — Hex bruts (44)** : hors périmètre B.1 immédiat — noter comme dette, rebrancher au fil des évolutions de chaque composant (pas un rasage en un coup, risque de régression visuelle).

- **Vérification obligatoire** : avant/après sur `/style-guide` + cockpit en preview live. Seul changement visuel attendu = la teinte d'accent par défaut (5a) ; rien d'autre.

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
