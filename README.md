# Ticket Menu

Menus de la semaine et liste de courses chiffrée selon ton budget, ton enseigne, tes allergies et ce que tu as déjà au placard.

## Ce que fait l'appli

- **Questionnaire de départ** (enseigne, budget, foyer, régime et allergènes, temps, jours cuisinés).
- **Menu de la semaine** qui tient dans le budget : changer un dîner d'un geste (avec annulation), le garder, choisir une autre recette avec l'effet sur le total, marquer « cuisiné ».
- **Onglet Recettes** : une centaine de recettes illustrées, recherche (plat ou ingrédient), filtres (favoris, rapides, économiques, végétarien, viande, poisson), favoris (ils reviennent plus souvent dans les menus), « ajouter à la semaine » sur le soir de ton choix.
- **Ajouter une recette sans la saisir** : colle un texte copié d'un site, d'un message ou d'une note ; une fiche de site (données structurées), un lot JSON, ou utilise le favori de navigateur qui copie la recette (photo comprise) en un geste. Les ingrédients sont reconnus, convertis en quantités et chiffrés ; ce qui est inconnu est créé avec un prix estimé à vérifier. Tu relis, tu corriges, tu enregistres.
- **Fiche recette** : matériel, ingrédients pour ton foyer, étapes, **mode cuisine** pas à pas.
- **Liste de courses** dans l'ordre du magasin, paquets entiers, total en direct, « déjà chez moi », prix corrigeables, **meilleur prix par enseigne** si tu en utilises plusieurs.
- **Placard** : ce que tu as est retiré de la liste, les restes de la semaine y sont ajoutés.
- **Bilan** : dépenses par semaine, budget tenu, économies estimées.
- **Hors ligne** (page installable sur l'écran d'accueil) et **comptes** pour retrouver ses données sur tous ses appareils.

## Importer des recettes en masse

Dans Recettes > Ajouter, colle un lot au format suivant (une ligne d'ingrédient en français courant, une étape par entrée) :

```
{"recipes":[{"n":"Pâtes au pesto","serves":4,"min":15,"ing":["400 g de pâtes","1 pot de pesto"],"steps":["Cuire les pâtes.","Mélanger avec le pesto."],"img":"https://…"}]}
```

Les quantités (g, kg, cl, c. à soupe, gousses, tranches, boîtes, fractions…) sont converties vers le conditionnement du catalogue. La reconnaissance repose sur un dictionnaire d'une centaine de produits (`M(...)` dans `web/app.html`) : ajoute des mots-clés ou des produits pour l'améliorer. Chaque import est relu avant enregistrement ; un lot de plusieurs recettes est enregistré tel quel.

Pour coller directement l'adresse d'une page, il faudrait un serveur qui télécharge la page à ta place (le navigateur l'interdit entre sites) ; le favori de navigateur donne le même résultat sans serveur.

## Les prix : ce qui est réel et ce qui ne l'est pas

Aucune enseigne ne publie d'API de prix. L'appli part d'un **prix estimé** par enseigne et par rayon (table dans `web/app.html`). Pour s'en approcher :

1. Chaque utilisateur peut **corriger un prix** dans la liste (il est alors utilisé à la place de l'estimation).
2. Le serveur reçoit ces corrections et publie un **prix communautaire** (médiane) quand au moins deux comptes différents s'accordent. Les valeurs absurdes (hors de 0,3× à 3× l'estimation) sont refusées.
3. Tu peux **importer tes propres relevés de tickets** : `npm run import-prices -- releves.csv` (colonnes `store,ingredient,price`). Un import prime sur les relevés des utilisateurs.

Les identifiants d'enseignes et d'ingrédients sont dans `server/data/ref.json`. Ne scrape pas les sites des enseignes : leurs conditions d'utilisation l'interdisent en général.

## Lancer en local

Node 22.5 ou plus, aucune dépendance à installer.

```
npm run build        # régénère server/public à partir de web/app.html
npm start            # http://localhost:3000
```

La base SQLite est créée dans `server/data/ticketmenu.db` (variable `DB_PATH` pour changer).

## Déployer sur un site

N'importe quel hébergeur qui lance un conteneur Docker et propose un **volume persistant** convient (sans volume, la base est perdue à chaque redéploiement).

- **Render** : pousse ce dossier sur GitHub, crée un « Blueprint » depuis `render.yaml`. Le disque persistant est une option payante : vérifie le tarif actuel.
- **Autres (Fly.io, Railway, un VPS)** : construis l'image avec le `Dockerfile`, monte un volume sur `/data`, expose le port 3000, mets le site en HTTPS.

Variables utiles : `PORT`, `DB_PATH` (défaut `/data/ticketmenu.db` dans l'image), `COOKIE_SECURE=1` (derrière HTTPS), `TRUST_PROXY=1` (derrière un proxy, pour la limitation de débit par adresse).

Sauvegarde : copie le fichier `.db` (mode WAL : copie aussi les fichiers `-wal` et `-shm`, ou utilise `sqlite3 ticketmenu.db ".backup copie.db"`).

## Tests

```
npm test             # logique des menus/prix, import de recettes + API du serveur
npm install && npm run test:ui   # parcours complet de l'interface simulé (jsdom)
```

## Sécurité en bref

Mots de passe hachés (scrypt, sel unique), sessions aléatoires stockées sous forme de hash, cookie `HttpOnly` + `SameSite=Lax`, limitation du débit sur la connexion, taille des requêtes bornée, en-têtes CSP. Pas de récupération de mot de passe par e-mail dans cette version : à ajouter avec un service d'envoi si besoin.

## Étapes de recette détaillées
Les étapes des 230 recettes de base sont dans `scripts/steps/*.txt` (une recette par ligne : `id|étape // étape`).
`{ingrédient}` est remplacé à l'affichage par la quantité pour le foyer (ex. `{poulet}` → « 520 g »).
Après modification : `python3 scripts/splice-steps.py` puis `node scripts/build.js`. Le mode cuisine propose un minuteur quand une étape cite une durée.


## Mettre en ligne avec GitHub Pages + Firebase (sans serveur)

1. Firebase : projet avec Authentication (e-mail/mot de passe) et Firestore (mode production). Colle la configuration web dans `firebase.config.json` (elle n'est pas secrète).
2. Firestore > Règles : colle le contenu de `firestore.rules` puis Publier. Chaque utilisateur n'accède qu'à `users/{son uid}/app/state` et `.../custom`.
3. Authentication > Paramètres > Domaines autorisés : ajoute `ton-pseudo.github.io`.
4. `npm run build:pages` génère `docs/` (page, manifeste, service worker). Pousse le dépôt sur GitHub, puis Settings > Pages > Deploy from a branch > `main` / `/docs`.

Limites : pas de prix communautaires dans cette version (ils demandent le serveur Node) ; les photos prises au téléphone restent sur l'appareil.

## Prix du jour (Open Prices)

`scripts/update-prices.js` interroge chaque jour (GitHub Actions, `.github/workflows/prices.yml`) la base collaborative Open Prices (Open Food Facts, licence ODbL), garde les relevés français des 90 derniers jours, et écrit `docs/prices.json`. L'appli le lit au démarrage.

- Seuls les ingrédients de `scripts/price-map.json` sont concernés (famille de produits Open Food Facts + unité). Les autres restent des estimations.
- Les relevés mélangent premium, bio et marques de distributeur : on prend le 25ᵉ centile, avec au moins 8 relevés, écartant les valeurs hors de 0,4× à 2,5× la médiane, et rejetant tout résultat hors de 0,6× à 1,7× l'estimation.
- Un prix propre à une enseigne n'est utilisé que s'il y a au moins 8 relevés pour elle (rare chez Lidl et Aldi) ; sinon : prix national × niveau de l'enseigne.
- Tes corrections de prix dans la liste restent prioritaires.
- Lancer à la main : `npm run update-prices` (Node 22, accès internet) ou le bouton « Run workflow » dans l'onglet Actions.

## Liens vers les recettes (HelloFresh)

`scripts/sources.json` associe une recette de l'appli à une recette HelloFresh proche (`{ "id": { "u": lien, "t": titre } }`). Le lien s'affiche en bas de la fiche recette (« Recette HelloFresh proche ») pour pouvoir comparer en cas d'erreur. Les recettes de l'appli sont réécrites avec nos propres mots : ce sont des recettes *inspirées*, pas des copies.

- Le catalogue des recettes repérées sur hellofresh.fr (adresse + titre) est dans `scripts/sources/pool*.tsv`.
- Après avoir modifié `sources.json` : `python3 scripts/splice-sources.py` puis `npm run build:pages`.

## Variantes de recettes

Quand deux recettes ne diffèrent que par l'accompagnement ou l'appareil (riz / semoule, air fryer, multicuiseur…), elles forment **une seule fiche** avec des variantes : on choisit la version dans la fiche recette (boutons « Variante ») ou depuis le menu de la semaine. La liste de courses suit la variante choisie.

- Données : `scripts/variants.json` (généré par `node scripts/merge-variants.js scripts/merge2.json`, puis `python3 scripts/splice-variants.py`). Un identifiant de variante s'écrit `base~variante`.
- Les anciens identifiants (menus, favoris enregistrés) sont remplacés automatiquement.
- Le menu choisit la variante compatible avec ton matériel (four, air fryer, micro-ondes, multicuiseur).
