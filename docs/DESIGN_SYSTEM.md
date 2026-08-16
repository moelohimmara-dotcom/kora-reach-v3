# Design System KORA — Catalogue (vanilla, dark)

Référence unique pour le front KORA. Style **shadcn/ui** (composants en source, pas de lib) +
**UI/UX Pro Max** (10 règles prioritaires) + **Frontend Design** (intentionnalité, sans le maximalisme).
Inspirations mobiles : **Mobbin** (patterns iOS/Android).

> Le front est **Vite + vanilla JS/CSS** (`kora-vite/src/`). Pas de React/Tailwind. Les composants
> ci-dessous sont des **conventions HTML/CSS réutilisables**, pas des imports de lib.

> **📐 Source de vérité unique.** Ce fichier est la SEULE référence du design system KORA.
> Le `README.md` pointe vers lui sans dupliquer la charte. La page vivante **`/style-guide`**
> (rôle `advanced`) en est le reflet exécutable : elle rend les vrais composants du code.
>
> **Règle de gouvernance (anti-dérive)** : *toute modification visuelle passe par `/style-guide`
> avant merge. Un changement qui n'y apparaît pas correctement rendu n'est pas mergé.* C'est la
> clause qui, si elle avait existé, aurait évité l'essentiel des 25 commits d'allers-retours
> visuels (voir la spec B.1, `docs/specs/2026-08-16-design-system-kora-design.md`).

---

## 1. Tokens (couleurs — CSS variables, jamais de valeur brute)

Deux natures de tokens à distinguer.

### 1a. Structure — figés (canon)

| Token | Valeur | Usage |
|---|---|---|
| `--bg` | `#0E1114` | Fond app |
| `--surface` | `#171C21` | Cartes |
| `--surface-raised` | `#1D242B` | Surfaces elevées |
| `--border` | `rgba(255,255,255,.08)` | Bordures/discrètes |
| `--text-primary` | `#F4F6F8` | Texte |
| `--text-secondary` | `#9AA5B1` | Labels, texte secondaire |
| `--success` | `#3DD68C` | État « prêt », validé |
| `--warning` | `#F5A83C` | Attention |
| `--danger` | `#E5484D` | Rejet, suppression |

### 1b. Accent — configurable (branding white-label)

| Token | Défaut | Nature |
|---|---|---|
| `--coral` | `#E9705D` | **Accent primaire.** Piloté par `settings.accent_coral` (`/api/settings`), injecté au runtime par `store.js` → `applySettings()`. C'est la fonctionnalité white-label (Paramètres → Personnalisation). |
| `--bordeaux`, `--coral-strong` | dérivés | Variantes de `--coral` (dégradé bouton primaire, hover). |
| `--accent` | `#E9705D` | **Legacy** (3 usages) — aligné sur le défaut de `--coral`, en cours de réconciliation. Préférer `--coral`. |

Le défaut de charte KORA est **`#E9705D`** (validé 2026-08-16), unifié dans `settings.py`,
`style.css` et les fallbacks de `app.js` → pas de flash avant chargement de `/api/settings`.
Un déploiement ayant stocké son propre `accent_coral` en base garde le sien (white-label intact).

**Règle** : tout est en token sémantique (shadcn principe #4). Pas de `bg-blue-500` ni hex en dur.

> **⚠️ Couche Material Design 3 dépréciée.** `style.css` porte une couche parallèle de tokens
> `--md-sys-color-*` (héritage). Les **24 tokens morts** (`-fixed`, `-fixed-dim`, `inverse-*`,
> `on-*` non consommés) ont été **retirés** (Lot 5b, 2026-08-16 : 64 lignes de définition
> supprimées, 24 tokens vivants conservés). Cette couche reste **en cours de retrait** : ne pas
> l'étendre, ne pas y brancher de nouveau composant. Les composants KORA consomment la couche
> sémantique ci-dessus.
>
> *Dette connue (hors B.1)* : `.auth-screen` (L~1570) référence `var(--md-sys-color-background)`,
> un token **jamais défini** (dangling préexistant, sans fallback → fond transparent qui retombe
> sur `--bg`). À rebrancher sur `--bg` lors d'un passage sur l'écran de login.

## 2. Typographie

- Polices (vérifiées par métrique de rendu dans le navigateur, 2026-08-16) :
  - **Titres / display** (`--font-display` : `.fact-title`, `.group-title`, `.sheet-title`, chiffres KPI) : **Oswald** (condensée), via `@fontsource/oswald`.
  - **Corps** (`--font`) : **Source Sans 3**, via `@fontsource/source-sans-3`.
  - *Correctif 2026-08-16* : `--font` référençait `"Source Sans Pro"` (ancien nom) alors que le package expose la famille **`"Source Sans 3"`** → le corps retombait silencieusement sur la police système. Le nom a été aligné sur `"Source Sans 3"`.
  - *(Ni Inter, ni « Source Sans Pro » : ces noms ne matchent aucune police chargée. `Montserrat` ne sert qu'au splash de démarrage.)*
- Sobre + lisible ; choix KORA validé.
- KPI number : **28–32px / 700** (tabular-nums). Label : **13px / 500** `--text-secondary`.
- Titre section : **18–20px / 700** `--text-primary`.
- Base body : 16px, line-height 1.5. Pas de texte < 12px.

## 3. Espacement & marges (UI/UX Pro Max #5/#6)

- **Marge écran** : 16dp gauche/droite (mobile).
- **Grille** : multiple de **8pt** (8/16/24/32). Gap cartes KPI = 16px.
- **Bottom-nav** : hauteur **56–64dp**, fixed, 5 onglets max, centrés (pas left-alignés).
- **Safe areas** : respecter `safe-area-inset-bottom` (notch).
- **Touch targets** : min **44pt iOS / 48dp Android** (UI/UX Pro Max #2).

## 4. Composants (catalogue — conventions réutilisables)

| Composant | Classe(s) | Notes |
|---|---|---|
| Card KPI | `.stat-card` > `.stat-icon` + `.stat-value` + `.stat-label` | icône 18px mobile / 20px desktop, chiffre dominant |
| Card large | `.stat-card.stat-full` | carte Supprimés (pleine largeur) |
| Badge compteur | `.nav-badge` | discret ≤16px, `--danger`/`--accent`, jamais surdimensionné |
| Bouton | `.btn`, `.btn-primary`, `.btn-tonal`, `.btn-sm`, `.btn-block` | `.btn-primary` = coral→bordeaux mat (pas glow néon) |
| Pill filtre | `.filter-pill` (+ `.active`) | une catégorie par élément |
| Separator | `.divider` (token `--border`) | remplace `<hr>` ad hoc |
| Skeleton | `.skeleton` | placeholder de chargement (à ajouter) |
| Icône | `icon("i-*")` → `<svg class="ic"><use href="#i-*"></use></svg>` | **Lucide** (MIT), injecté via sprite |

**shadcn principe #2** : « compose, don't reinvent » → réutiliser ces blocs, pas de div stylé ad hoc.

## 5. Icônes — Lucide (MIT)

- Set : **Lucide** (`lucide-static`), 39 symbols mappés sur les IDs `#i-*` historiques
  (ex: `i-trash` → Lucide `trash`). Markup `icon("i-*")` **inchangé** après migration.
- Style : outline 24px, stroke 2px, `currentColor`. **Pas d'emoji** (règle KORA stricte).
- Génération : `gen_icons.cjs` (mapping KORA→Lucide → `src/icons.js`).

## 6. Règles UI/UX (UI/UX Pro Max — priorités)

| # | Catégorie | État KORA | Action |
|---|---|---|---|
| 1 | Accessibility | ⚠️ partiel | `aria-label` sur boutons icône + `:focus-visible` rings (à étendre nav) ; pas de skip-link |
| 2 | Touch & Interaction | ✅ | 44/48px, 8px+, loading feedback |
| 3 | Performance | ✅ | lazy-load imgs, CLS faible |
| 4 | Style | ✅ | SVG icons, pas emoji, cohérent |
| 5 | Layout/Responsive | ✅ | mobile-first, no h-scroll, bottom-nav ≤5 |
| 6 | Typography/Color | ✅ | 16px base, tokens sémantiques |
| 7 | Animation | ✅ | 150–300ms, reduced-motion (`.kora-reveal`) |
| 8 | Forms | ✅ | labels + erreurs near field |
| 9 | Navigation | ✅ | bottom-nav ≤5, deep-linking hash |
| 10 | Charts | ⚠️ | légende réelle + tooltip (ne pas rely couleur seule) |

## 7. Frontend Design (Anthropic) — ce qu'on GARDE / REJETTE

**Garder** : intentionnalité, exécution méticuleuse des détails, motion orchestrée 1× page load,
couleur dominante + accent tranché (déjà le cas).

**Rejeter** (choix KORA validés priment) :
- ❌ Changer la police (**Source Sans Pro** est validée — cf. §2).
- ❌ Maximalisme / asymétrie / textures (user veut sobre, a rejecté glassmorphism « catastrophique »).

## 8. Références

- **Mobbin** (mobbin.com) : patterns mobile (bottom-nav, cartes KPI) — benchmark.
- Skills : shadcn/ui, UI/UX Pro Max, Frontend Design (AgenticSkills).
- Charte dark : tokens §1.

## 9. Interdit (6 défauts historiques — jamais revenir)

1. Overlap icône/chiffre dans les cartes KPI.
2. Barre glow orange (loader/stats).
3. Carte Supprimés avec outline agressif.
4. Point « prêt » orange (doit être **vert** `--success`).
5. Badges bottom-nav surdimensionnés.
6. Icônes plus voyantes que les chiffres.
