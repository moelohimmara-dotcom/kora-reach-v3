# vendor/

Bibliothèques tierces vendorisées directement dans le dépôt (pas de dépendance
npm), pour du code sensible où l'on veut éviter d'importer un package externe
téléchargé depuis le registre au moment du build.

## qrcode-gen.js

Générateur de QR code, par Kazuhiko Arase — https://github.com/kazuhikoarase/qrcode-generator
Licence MIT (voir l'en-tête du fichier). Source : `js/dist/qrcode.js` du dépôt
amont, récupérée le 2026-08-24. Seule modification apportée : le UMD
(AMD/CommonJS) final a été remplacé par un `export default qrcode;` pour un
usage ESM direct — le code de génération lui-même est inchangé.

Utilisé pour afficher le QR code d'activation de la double authentification
(Paramètres > Compte > 2FA) sans dépendre du package npm `qrcode` : le secret
TOTP est encodé en QR entièrement en local, sans qu'aucune bibliothèque tierce
téléchargée à l'installation n'entre en contact avec cette donnée sensible.
