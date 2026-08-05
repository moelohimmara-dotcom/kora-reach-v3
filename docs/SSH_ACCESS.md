# Accès SSH au VPS KORA Reach

## Configuration appliquée

- **Root login désactivé** (`PermitRootLogin no`).
- **Auth globale** : clés SSH uniquement (`PasswordAuthentication no` global).
- **fail2ban** : jail `sshd` actif (maxretry=5, bantime=3600s).
- **User dédié `deploy`** : clé SSH (dont clé maîtresse `vps-master`), sudo NOPASSWD.
- **User dédié `remote`** : mot de passe fort (28 chars), sudo NOPASSWD, activé via
  `Match User remote → PasswordAuthentication yes` (les autres users restent clé-only).

## Option A — Connexion par clé (recommandée)

Clé maîtresse `vps-master` (pub) :
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDHHDWZtc/FJ4/vUOqvEcHdpasjEc3lwlqQoRSDqLDWy vps-master
```
```bash
ssh -i vps_master_ed25519 deploy@213.156.135.139
```

## Option B — Connexion par mot de passe (user `remote`)

- IP : `213.156.135.139` · Port : `22` · User : `remote`
- Mot de passe fort (28 chars, généré) : `mcH6wIVCFKOj!DVF3OJ%pN8kH8tr`
```bash
ssh remote@213.156.135.139
```

## Clé par instance (révocation individuelle)

> Une clé n'est jamais « universelle ». Pour permettre à N instances d'accéder
> SANS partager le même secret, CHAQUE instance génère sa propre clé et ne transmet
> QUE sa clé publique.

1. Sur la machine cliente : `ssh-keygen -t ed25519 -f ~/.ssh/mon_instance -C "mon_instance_vps"`
2. Transmettre `.pub` au propriétaire.
3. Sur le VPS (compte autorisé) : `cat mon_instance.pub >> /home/deploy/.ssh/authorized_keys`
4. Connexion : `ssh -i mon_instance deploy@213.156.135.139`

Révoquer : supprimer la ligne correspondante dans `authorized_keys`.

## Commandes privilégiées
```bash
sudo systemctl restart kora-preview
```

## Règle d'or
> Jamais de mot de passe faible sur VPS public. Root désactivé. Clé par instance.
> fail2ban actif. Révoquer proprement.
