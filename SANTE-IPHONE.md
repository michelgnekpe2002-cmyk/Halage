# Relier l'app Santé de l'iPhone à FIOSSO SPORT (10 minutes)

Un « Raccourci » Apple lit chaque soir les pas, les calories actives, la distance et le poids du jour dans l'app Santé, puis les envoie à FIOSSO SPORT. Il ne lit rien d'autre.

**Avant de commencer :** sur l'iPhone, ouvre FIOSSO SPORT > **Réglages** > *Données santé du téléphone*. Tu y trouves 4 valeurs (URL, Clé, Couple, Identifiant) avec un bouton **Copier** à côté de chacune. Tu vas les coller dans le raccourci.

## 1. Créer le raccourci

Ouvre l'app **Raccourcis** (icône violette et rose, déjà installée), onglet **Raccourcis**, bouton **+** en haut à droite. Renomme-le en haut : **FIOSSO Santé**.

Ajoute ces actions dans l'ordre (barre de recherche en bas : tape le nom de l'action) :

**a. Les pas**
1. Action **Rechercher des échantillons de santé**. Touche « Type » et choisis **Nombre de pas**. Touche *Ajouter un filtre*, choisis **Date de début** > **est aujourd'hui**.
2. Action **Calculer des statistiques** : choisis **Somme**. Appuie longuement sur le résultat et renomme-le **Pas**.

**b. Les calories actives**
3. Encore **Rechercher des échantillons de santé** : type **Énergie active**, filtre **Date de début est aujourd'hui**.
4. **Calculer des statistiques** > **Somme**. Renomme le résultat **Calories**.

**c. La distance**
5. **Rechercher des échantillons de santé** : type **Distance (marche et course)**, filtre **Date de début est aujourd'hui**.
6. **Calculer des statistiques** > **Somme**. Renomme le résultat **Distance**.

**d. Le poids (si elle s'est pesée aujourd'hui)**
7. **Rechercher des échantillons de santé** : type **Poids**, filtre **Date de début est aujourd'hui**, *Trier par* **Date de début**, *Ordre* **Plus récent en premier**, *Limite* activée à **1**. Renomme le résultat **Poids**.

**e. La date du jour**
8. Action **Date actuelle**.
9. Action **Formater la date** : *Format de date* **Personnalisé**, chaîne **yyyy-MM-dd**. Renomme le résultat **Jour**.

**f. L'envoi**
10. Action **Obtenir le contenu de l'URL**.
    - À la place de « URL », colle la valeur **URL** copiée depuis FIOSSO SPORT.
    - Touche la flèche **>** pour ouvrir les options :
    - **Méthode** : POST
    - **En-têtes** : ajoute 3 en-têtes :
      - `apikey` → colle la **Clé**
      - `x-couple` → colle **Couple**
      - `Prefer` → `resolution=merge-duplicates,return=minimal`
    - **Corps de la requête** : **JSON**. Ajoute ces champs :
      - `couple` (Texte) → colle **Couple**
      - `user_id` (Texte) → colle **Identifiant**
      - `day` (Texte) → choisis la variable **Jour**
      - `source` (Texte) → `iphone`
      - `data` (**Dictionnaire**). Dedans, ajoute :
        - `steps` (Nombre) → variable **Pas**
        - `active_kcal` (Nombre) → variable **Calories**
        - `distance_km` (Nombre) → variable **Distance**
        - `weight_kg` (Nombre) → variable **Poids** (touche la variable et choisis **Valeur**)

Touche **OK**. Lance le raccourci une fois avec ▶︎. L'iPhone demande l'accès aux données Santé : touche **Autoriser** pour les 4 types. Ouvre ensuite FIOSSO SPORT : les pas apparaissent sur l'accueil.

## 2. Le lancer tout seul chaque soir

1. Dans Raccourcis, onglet **Automatisation** > **+** > **Heure de la journée**.
2. Choisis **21:30**, **Quotidiennement**, puis **Exécuter immédiatement** (pas « Après confirmation »).
3. Action : **Exécuter le raccourci** > **FIOSSO Santé**. Touche **OK**.

C'est fini. Chaque soir à 21h30, la journée part vers FIOSSO SPORT. Pour envoyer en cours de journée, il suffit de lancer le raccourci à la main.

## Si ça ne marche pas

- **Rien n'apparaît dans FIOSSO SPORT** : relance le raccourci et regarde le message en bas. Une erreur 401 ou 403 signifie que la clé ou le code couple est mal copié. Une erreur 404 signifie que l'URL est fausse.
- **Le poids n'arrive pas** : c'est normal les jours sans pesée.
- **La distance est en miles** : dans Santé > Distance (marche et course) > Unités, choisis km.
