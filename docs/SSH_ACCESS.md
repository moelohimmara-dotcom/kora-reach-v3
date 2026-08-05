# Accès SSH au VPS KORA Reach

## Configuration appliquée (Option A — clés uniquement)

- **User dédié** : `deploy` (pas de login root direct).
- **Auth** : clés SSH uniquement (`PubkeyAuthentication yes`, `PasswordAuthentication no`).
- **Root** : `PermitRootLogin no` (login root désactivé).
- **Clé autorisée** : `deploy` a dans `~/.ssh/authorized_keys` la clé `kora_ed25519.pub` (ed25519).
- **Sudo** : `deploy` a `NOPASSWD:ALL` pour le déploiement (modifiable dans `/etc/sudoers.d/deploy`).
- **fail2ban** : jail `sshd` actif (maxretry=5, bantime=3600s, backend=systemd).

## Pour ajouter une nouvelle instance / collaborateur

1. Générer une paire de clés sur la machine cliente :
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/mon_instance
   ```
2. Ajouter la **clé publique** (`~/.ssh/mon_instance.pub`) dans
   `/home/deploy/.ssh/authorized_keys` sur le VPS (une ligne par clé).
3. Se connecter :
   ```bash
   ssh -i ~/.ssh/mon_instance deploy@213.156.135.139
   ```

## Pour exécuter des commandes privilégiées

```bash
sudo systemctl restart kora-preview   # deploy a NOPASSWD
```

## Retour arrière (en cas de besoin)

- Le `sshd_config` d'origine est sauvegardé dans `/etc/ssh/sshd_config.bak.*`.
- Pour réactiver root par clé : `PermitRootLogin prohibit-password` (jamais `yes` + mot de passe).

## Règle d'or

> Jamais de mot de passe faible sur un VPS public. Jamais de login root par mot de passe.
> On ajoute des clés, on ne partage pas de secret.
