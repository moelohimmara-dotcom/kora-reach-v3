# ADR-0003 : Questions de sécurité comme 2e facteur alternatif au TOTP pour le compte root

**Date** : 2026-08-17
**Statut** : accepté
**Décideurs** : propriétaire du projet (décision assumée après avertissement explicite de Claude sur les compromis de sécurité)

## Contexte

Le compte root exige un 2e facteur obligatoire (voir ADR-0002). Le mécanisme initial était le TOTP (RFC 6238, cf. ADR pas encore rédigé sur la 2FA maison). En usage réel, le propriétaire du projet — non-développeur — s'est retrouvé bloqué à plusieurs reprises par l'absence d'application d'authentification disponible/fonctionnelle, et a demandé explicitement un mécanisme de repli plus simple à gérer au quotidien : des questions de sécurité, sur le modèle de la récupération de compte Windows local chez Microsoft.

## Décision

Un second mécanisme de 2e facteur est ajouté pour le compte root : 2 questions de sécurité choisies parmi une liste suggérée, réponses hashées (PBKDF2-HMAC-SHA256, jamais en clair), normalisées avant hash pour tolérer variations de casse/espaces/accents/apostrophes. Le compte root peut être configuré avec **soit** TOTP **soit** questions de sécurité — les deux mécanismes coexistent dans `root_auth.py`, le choix se fait à la configuration.

## Alternatives envisagées

### Alternative 1 : Garder TOTP comme seul mécanisme, améliorer l'UX
- **Avantages** : conserve le niveau de sécurité le plus élevé (secret cryptographique côté appareil, non devinable).
- **Inconvénients** : ne résout pas le blocage réel rencontré — le problème n'était pas l'ergonomie de l'écran de configuration (déjà simplifiée avec bouton copier + étapes numérotées) mais l'absence d'application fonctionnelle disponible au moment voulu.
- **Pourquoi rejetée** : le besoin exprimé était un mécanisme de repli utilisable sans dépendance à une app tierce, pas une meilleure UX autour du TOTP.

### Alternative 2 : Questions de sécurité comme SEUL mécanisme (remplacement complet du TOTP)
- **Avantages** : cohérence — un seul mécanisme à maintenir et documenter.
- **Inconvénients** : prive les comptes root futurs de l'option la plus sûre.
- **Pourquoi rejetée** : rien n'empêche de garder les deux ; l'infrastructure TOTP existait déjà et fonctionne correctement, la retirer aurait été une perte nette pour un futur compte root qui préférerait cette option.

### Alternative 3 : Questions de sécurité comme 2e facteur (retenue)
- **Avantages** : résout le blocage réel (aucune app tierce requise, réponses mémorisables) ; coexiste avec le TOTP sans le remplacer.
- **Inconvénients** : sécurité objectivement plus faible — le NIST SP 800-63B déconseille les questions de sécurité comme facteur d'authentification (réponses souvent devinables ou recherchables publiquement). Un attaquant qui connaît la victime (réseaux sociaux, données publiques) a un chemin d'attaque que le TOTP ne permet pas.
- **Pourquoi retenue malgré l'avertissement** : décision assumée par le propriétaire du projet après explication claire du risque, pour ce compte précis, dans son contexte d'usage actuel.

## Conséquences

### Positives
- Le compte root reste utilisable sans dépendance à un smartphone/app tierce disponible.
- Coexistence avec le TOTP : un futur compte root plus sensible peut choisir l'option la plus sûre sans changement de code.
- Réponses hashées avec le même schéma cryptographique que les mots de passe (pas de recul de sécurité sur le stockage lui-même — seul le facteur en amont, la nature de la question/réponse, est plus faible).

### Négatives
- Surface d'attaque par ingénierie sociale plus large qu'avec le TOTP pour ce compte.
- Deux flux de configuration/vérification à maintenir dans `root_auth.py` et dans le frontend `root-console.html`.

### Risques
- Une réponse devinable ou publique (ville de naissance déjà mentionnée en ligne, par exemple) réduirait la protection effective à zéro. Mitigation : avertissement explicite donné à l'utilisateur de choisir des réponses non-publiques, non documenté nulle part ailleurs dans le système — repose sur la vigilance de l'exploitant.
- Si ce compte gagne en sensibilité (plus de privilèges, plus d'exploitants), cette ADR devrait être révisée et le TOTP redevenir obligatoire — prévoir une bascule explicite plutôt qu'un statu quo silencieux.
