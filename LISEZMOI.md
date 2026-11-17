# FIOSSO SPORT : mise en route (environ 20 minutes)

Ce dossier contient l'app complète. Trois étapes : la mettre en ligne, activer le partage, l'installer sur vos deux téléphones.

## 1. Mettre l'app en ligne (gratuit, 5 min)

Pour qu'un téléphone puisse l'installer, l'app doit être servie en HTTPS. On utilise GitHub Pages :

1. Ouvre **GitHub Desktop** > *File > Add local repository* > choisis `Documents\Halage`.
2. Clique sur **Publish repository**, nom `halage`, **décoche « Keep this code private »** (Pages gratuit = dépôt public ; le code ne contient aucune clé ni donnée perso).
3. Sur github.com, ouvre le dépôt > **Settings > Pages** > *Source : Deploy from a branch* > branche `main`, dossier `/ (root)` > **Save**.
4. Après 1 à 2 minutes, l'app est en ligne à `https://<ton-pseudo>.github.io/halage/`.

Pour une mise à jour plus tard : modifie les fichiers, puis *Commit* et *Push origin* dans GitHub Desktop.

## 2. Le partage à deux

Rien à faire : l'app est déjà reliée à la base Supabase (tables `halage_events` et `halage_health` du projet GNEKPE-ESTATE, isolées du reste). Chaque couple a un code secret, créé au premier lancement : sans ce code, personne ne peut lire vos données.

Une fois ton profil créé : **Réglages > Envoyer le lien à ta copine**. En ouvrant ce lien, l'app de Fiona rejoint la tienne.

Si la base doit être recréée un jour : coller `supabase.sql` dans Supabase > SQL Editor > Run.

## 3. Installer sur le téléphone

- **Android (Chrome)** : ouvre l'adresse Netlify, menu ⋮ > **Installer l'application** (ou *Ajouter à l'écran d'accueil*).
- **iPhone (Safari)** : ouvre l'adresse, bouton Partager > **Sur l'écran d'accueil**.

L'icône FIOSSO SPORT apparaît. L'app s'ouvre en plein écran et fonctionne même sans réseau. Les séances faites hors ligne partent dès que le réseau revient.

## 4. Brancher les données santé

- **iPhone (Fiona)** : suis `SANTE-IPHONE.md` pour créer le Raccourci, 10 minutes.
- **Samsung (Michel)** :
  1. Sur le téléphone, ouvre `https://github.com/<ton-pseudo>/halage/releases/tag/apk` et télécharge **halage-sync.apk**. Android demande d'autoriser l'installation depuis Chrome : accepte.
  2. Dans Samsung Health > Paramètres > **Health Connect**, autorise le partage des pas, de l'activité, de l'exercice et du poids.
  3. Ouvre **FIOSSO Sync**, colle le code donné par FIOSSO SPORT (Réglages > Données santé), puis touche **Autoriser l'accès santé**. La synchro se fait ensuite toute seule toutes les 3 h.

L'APK est fabriqué automatiquement par GitHub (onglet *Actions* du dépôt) à chaque modification du dossier `android/`. Après une mise à jour, désinstalle l'ancienne version avant d'installer la nouvelle.

## Bon à savoir

- **Course sur le halage** : laisse l'écran allumé pendant la séance (l'app empêche la mise en veille). Les annonces vocales disent quand courir et quand marcher, tu peux garder le téléphone en main ou dans un brassard.
- **Poids** : une pesée faite dans l’app santé passe par la base partagée pour remplir ta courbe, mais FIOSSO SPORT ne l’affiche qu’à toi. Les pesées saisies à la main restent sur ton téléphone.
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
