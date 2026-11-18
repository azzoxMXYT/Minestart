# Minestart

Minestart est un petit jeu de construction en blocs. En mode créatif, tu peux explorer un vallon, casser des blocs, construire avec huit matériaux et créer un nouveau monde à partir d’une graine.

## Version Windows (.exe)

Dans [la dernière release](https://github.com/azzoxMXYT/Minestart/releases/latest), télécharge **`Minestart.exe`** pour un PC Windows 10 ou 11 64 bits (Intel ou AMD). Pour un PC Windows avec processeur ARM, choisis **`Minestart-arm64.exe`**.

Double-clique sur le fichier. Le lanceur embarque le jeu complet, sans installation, sans connexion et sans droits administrateur. Il ouvre Minestart dans une fenêtre Edge dédiée si Edge est installé, sinon dans le navigateur par défaut. Il conserve le fichier du jeu dans `%LOCALAPPDATA%\Minestart` pour garder une adresse stable pour les sauvegardes.

Les `.exe` ne sont pas signés. Si ton PC est réglé pour ne pas les autoriser, la release fournit aussi **`Minestart.html`**, à ouvrir directement dans le navigateur lorsque c’est permis. Les sauvegardes de ce fichier sont indépendantes de celles du lanceur.

## Jouer sur un PC peu puissant

- Dans l’aperçu, clique sur **Jouer**. Pour jouer sans Internet, clique d’abord sur **Télécharger**, puis ouvre `Minestart.html` dans ton navigateur. Le fichier `index.html` du dépôt est le même jeu autonome.
- Il n'y a ni installation, ni compte, ni serveur à lancer pour jouer au fichier téléchargé. Utilise un navigateur récent avec JavaScript activé, comme Chrome, Edge ou Firefox.
- Si la 3D est lente, coche **Mode éco** dans **Toutes les commandes**. Si WebGL n’est pas disponible, le jeu passe en vue 2D : tu vises alors les blocs avec le curseur.
- Le jeu sauvegarde les modifications dans le navigateur, si le stockage est autorisé. La sauvegarde de l’aperçu et celle du fichier téléchargé sont indépendantes. **Nouveau monde** remplace le monde actuel après confirmation.

| Action | Commande |
| --- | --- |
| Se déplacer | `ZQSD` ou `WASD` |
| Regarder | Souris, ou flèches en 3D |
| Sauter / nager | `Espace` |
| Courir | `Maj` |
| Voler / atterrir | `Espace` deux fois ; en vol, `Espace` pour monter et `Maj` pour descendre |
| Casser / poser un bloc | Clic gauche / clic droit |
| Changer de matériau | `1` à `8`, molette ou barre de blocs |
| Mettre en pause | `Échap` |

Si le navigateur ne capture pas le pointeur, fais glisser la souris pour regarder et clique sans glisser pour casser un bloc.

## Développement

Le jeu utilise Canvas et WebGL, sans dépendance à installer. Les textures et les mondes sont générés par le jeu. Le HTML, le CSS, les scripts et les polices sont réunis dans `index.html` pour que ce seul fichier soit suffisant hors ligne.

```sh
npm run build   # Régénérer index.html à partir de src/
npm test        # Tester le terrain, les collisions, les modifications et la visée
npm start       # Ouvrir une prévisualisation sur le port 3000
```

Pour fabriquer la release Windows, utilise [Zig](https://github.com/ziglang/zig) avec `zig rc` et la compilation croisée MinGW (testé avec `0.14.0-dev.2456`), puis lance :

```sh
npm run build:windows
```

Si Zig n’est pas dans le `PATH`, donne le chemin de son exécutable via la variable `ZIG`. Le script place les deux lanceurs, le HTML autonome et leurs sommes SHA-256 dans `release/`. Les lanceurs ne nécessitent ni Zig ni Node.js pour fonctionner.

Les polices Pixelify Sans, Space Grotesk et IBM Plex Mono sont distribuées sous la SIL Open Font License. Leurs licences sont dans `src/fonts/` et incorporées dans le fichier autonome.
