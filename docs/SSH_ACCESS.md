# Accès SSH au VPS KORA Reach

## Configuration appliquée (Option A — clés uniquement, par instance)

- **User dédié** : `deploy` (pas de login root direct).
- **Auth** : clés SSH uniquement (`PubkeyAuthentication yes`, `PasswordAuthentication no`).
- **Root** : `PermitRootLogin no` (login root désactivé).
- **Sudo** : `deploy` a `NOPASSWD:ALL` pour le déploiement (`/etc/sudoers.d/deploy`).
- **fail2ban** : jail `sshd` actif (maxretry=5, bantime=3600s, backend=systemd).

## Principe : UNE clé PAR instance (révocation individuelle)

> Une clé SSH n'est jamais « universelle » ni « liée à une app ». C'est un blob.
> Pour permettre à N instances d'accéder au VPS **sans partager le même secret**,
> CHAQUE instance génère SA propre paire de clés et ne transmet QUE sa clé publique.

### Pour une nouvelle instance / collaborateur

1. **Sur la machine cliente**, générer sa propre paire :
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/mon_instance -C "mon_instance_vps"
   ```
2. **Transmettre UNIQUEMENT la clé publique** (`~/.ssh/mon_instance.pub`) au propriétaire du VPS.
3. **Sur le VPS** (via un compte déjà autorisé), ajouter la clé :
   ```bash
   echo "ssh-ed25519 AAAA... mon_instance_vps" >> /home/deploy/.ssh/authorized_keys
   chmod 600 /home/deploy/.ssh/authorized_keys
   ```
4. **Connexion cliente** :
   ```bash
   ssh -i ~/.ssh/mon_instance deploy@213.156.135.139
   ```

### Révoquer une instance (sans toucher aux autres)

Supprimer la ligne correspondante dans `/home/deploy/.ssh/authorized_keys`
(repérable par le commentaire `-C "mon_instance_vps"`).

## Commandes privilégiées (via deploy)

```bash
sudo systemctl restart kora-preview   # deploy a NOPASSWD
```

## Retour arrière

- `sshd_config` d'origine sauvegardé dans `/etc/ssh/sshd_config.bak.*`.
- Pour réactiver root par clé : `PermitRootLogin prohibit-password` (jamais `yes` + mot de passe).

## Règle d'or

> Jamais de mot de passe faible sur VPS public. Jamais de login root par mot de passe.
> Une clé par instance. On révoque par instance. On ne partage jamais la clé privée.
