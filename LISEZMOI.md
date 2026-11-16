# Halage : mise en route (environ 20 minutes)

Ce dossier contient l'app complète. Trois étapes : la mettre en ligne, activer le partage, l'installer sur vos deux téléphones.

## 1. Mettre l'app en ligne (gratuit, 5 min)

Pour qu'un téléphone puisse l'installer, l'app doit être servie en HTTPS. On utilise GitHub Pages :

1. Ouvre **GitHub Desktop** > *File > Add local repository* > choisis `Documents\Halage`.
2. Clique sur **Publish repository**, nom `halage`, **décoche « Keep this code private »** (Pages gratuit = dépôt public ; le code ne contient aucune clé ni donnée perso).
3. Sur github.com, ouvre le dépôt > **Settings > Pages** > *Source : Deploy from a branch* > branche `main`, dossier `/ (root)` > **Save**.
4. Après 1 à 2 minutes, l'app est en ligne à `https://<ton-pseudo>.github.io/halage/`.

Pour une mise à jour plus tard : modifie les fichiers, puis *Commit* et *Push origin* dans GitHub Desktop.

## 2. Activer le partage à deux (gratuit, 10 min)

Vos séances passent par une petite base Supabase gratuite.

1. Crée un compte sur https://supabase.com, puis **New project** (région : Europe, Frankfurt ou Paris).
2. Dans le projet, ouvre **SQL Editor > New query**, colle le contenu de `supabase.sql` et clique sur **Run**.
3. Ouvre **Project Settings > API** (ou *Connect*) et copie :
   - **Project URL** (`https://xxxx.supabase.co`)
   - la clé **anon / publishable** (jamais la clé *service_role* ni *secret*).
4. Dans l'app, va dans **Réglages > Partage à deux**, colle l'URL et la clé, puis touche **Activer**. Le point en haut à droite devient vert.
5. Touche **Envoyer le lien à ta copine**. En ouvrant ce lien, son app est déjà reliée à la tienne : elle n'a que son profil à remplir.

## 3. Installer sur le téléphone

- **Android (Chrome)** : ouvre l'adresse Netlify, menu ⋮ > **Installer l'application** (ou *Ajouter à l'écran d'accueil*).
- **iPhone (Safari)** : ouvre l'adresse, bouton Partager > **Sur l'écran d'accueil**.

L'icône Halage apparaît. L'app s'ouvre en plein écran et fonctionne même sans réseau. Les séances faites hors ligne partent dès que le réseau revient.

## Bon à savoir

- **Course sur le halage** : laisse l'écran allumé pendant la séance (l'app empêche la mise en veille). Les annonces vocales disent quand courir et quand marcher, tu peux garder le téléphone en main ou dans un brassard.
- **Poids** : il reste sur ton téléphone et n'est jamais envoyé à la base partagée. Ta copine voit tes séances et tes calories brûlées, pas ta balance.
- **Sécurité** : toute personne qui aurait à la fois l'adresse de la base, la clé et votre code de couple pourrait lire vos séances. Ne publie pas le lien d'invitation, envoie-le seulement à ta copine.
- **Changer de téléphone** : l'historique partagé se récupère via le lien d'invitation. Les pesées, elles, restent sur l'ancien téléphone.
- Les calories et repères sont des estimations, pas un avis médical.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `styles.css`, `app.js` | l'app |
| `data.js` | exercices, séances, programme de course : à modifier pour changer les programmes |
| `sw.js`, `manifest.webmanifest`, `icons/` | installation et hors-ligne |
| `supabase.sql` | création de la base partagée |
