# Registre des décisions d'architecture (ADR)

Historique des décisions architecturales structurantes de KORA Reach V3, au format léger proposé par Michael Nygard. Un nouveau décision significative (choix de techno, pattern d'architecture, design d'API, modélisation de données, sécurité...) mérite son propre fichier — voir [template.md](template.md).

| ADR | Titre | Statut | Date |
|-----|-------|--------|------|
| [0001](0001-architecture-monolithique-modulaire.md) | Architecture monolithique modulaire | accepté | 2026-08-04 |
| [0002](0002-auth-root-separee.md) | Authentification root totalement séparée de l'authentification éditeur | accepté | 2026-08-16 |
| [0003](0003-questions-securite-root.md) | Questions de sécurité comme 2e facteur alternatif au TOTP pour le compte root | accepté | 2026-08-17 |
| [0004](0004-centralisation-rbac.md) | Centralisation des vérifications RBAC dans une table de vérité | accepté | 2026-08-17 |
