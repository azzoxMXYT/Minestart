# Minestart

Minestart est un jeu de construction léger en 3D. En **Créatif**, tu disposes de 29 blocs et décorations en quantité illimitée. En **Survie**, tu dois récolter tes matériaux, fabriquer tes outils et te mettre à l’abri des gelées nocturnes.

## Versions mobiles

- **Android 8+** : prends `Minestart.apk` dans [la release mobile](https://github.com/azzoxMXYT/Minestart/releases/tag/mobile-v1.2.0). Ouvre le fichier sur ton appareil. Le jeu est embarqué et ne demande aucune connexion ni permission Internet. Un appareil administré peut bloquer l’installation des APK hors Google Play.
- **iPhone et iPad (iOS/iPadOS 16+)** : ouvre le site Minestart en HTTPS dans Safari. Choisis **Partager → Sur l’écran d’accueil → Ajouter**. Ouvre ensuite l’icône une première fois en ligne et attends **Prêt hors ligne**. C’est une application web installable (PWA), pas une `.ipa` ni une publication App Store.
- Glisse sur le paysage pour regarder et utilise les flèches pour avancer. Appuie sur **Miner**, **Poser** ou **Saut**. En Survie, maintiens **Miner** et utilise **Poser** sur un buisson pour récolter des baies, puis l’icône baie pour manger. L’inventaire et la fabrication sont en haut de la vue. Les mondes restent sur l’appareil, sans synchronisation entre versions.

## Version Windows (.exe)

Dans [la release Windows](https://github.com/azzoxMXYT/Minestart/releases/tag/v1.1.0), télécharge **`Minestart.exe`** pour un PC Windows 10 ou 11 64 bits (Intel ou AMD). Pour un PC Windows avec processeur ARM, choisis **`Minestart-arm64.exe`**.

Double-clique sur le fichier. Le lanceur embarque le jeu complet, sans installation, sans connexion et sans droits administrateur. Il ouvre Minestart dans une fenêtre Edge dédiée si Edge est installé, sinon dans le navigateur par défaut. Il conserve le fichier du jeu dans `%LOCALAPPDATA%\Minestart` pour garder une adresse stable pour les sauvegardes.

Les `.exe` ne sont pas signés. Si ton PC est réglé pour ne pas les autoriser, la release fournit aussi **`Minestart.html`**, à ouvrir directement dans le navigateur lorsque c’est permis. Les sauvegardes de ce fichier sont indépendantes de celles du lanceur.

## Jouer

- Clique sur **Créatif** ou **Survie** dans **Monde actuel**, puis sur **Jouer**. Chaque mode conserve sa propre partie. **Nouveau monde** réinitialise seulement la partie du mode choisi. Les constructions créatives de la version 1.0 sont conservées sur le même navigateur.
- Pour ouvrir le catalogue ou le sac à dos, appuie sur **E**. Clique sur un bloc dans l’inventaire pour l’associer à la touche du raccourci sélectionné.
- Depuis l’aperçu, **Télécharger** fournit le jeu autonome à ouvrir hors ligne dans un navigateur récent. Si la 3D est lente, coche **Mode éco** dans **Toutes les commandes**. Si WebGL n’est pas disponible, le jeu passe en 2D : tu vises alors les blocs avec le curseur.

### Tes premiers pas en Survie

1. Maintiens le clic gauche pour récolter du bois. Dans **E → Fabrication**, transforme-le en planches, puis en pioche. Les blocs posés sont déduits de ton sac et les pioches améliorent la vitesse de minage.
2. Récolte des baies sur les buissons avec un clic droit. Appuie sur **F** quand tu as faim. Les buissons repoussent après quelques instants.
3. Avant la nuit, construis un abri et fabrique des torches avec des planches et du charbon. La lumière tient les gelées à distance. Les chutes, la noyade et la faim peuvent aussi te faire perdre de la vie. Si tu réapparais, tu gardes ton sac et tes constructions.

| Action | Commande |
| --- | --- |
| Se déplacer | `ZQSD` ou `WASD` |
| Regarder | Souris, ou flèches en 3D |
| Sauter / nager | `Espace` |
| Courir | `Maj` |
| Voler (Créatif uniquement) | `Espace` deux fois ; en vol, `Espace` pour monter et `Maj` pour descendre |
| Casser / poser un bloc | Clic gauche / clic droit ; maintenir le clic gauche en Survie |
| Choisir un raccourci | `1` à `8`, molette ou barre rapide |
| Inventaire et fabrication | `E` |
| Manger des baies | `F` |
| Mettre en pause | `Échap` |

Si le navigateur ne capture pas le pointeur, fais glisser la souris pour regarder. En Survie, maintiens le clic gauche sans glisser pour récolter un bloc.

## Développement

Le jeu utilise Canvas et WebGL, sans dépendance à installer. Les textures et les mondes sont générés par le jeu. Le HTML, le CSS, les scripts et les polices sont réunis dans `index.html` : ce seul fichier suffit hors ligne.

```sh
npm run build           # Régénérer le HTML autonome et docs/ (PWA)
npm test                # Tester le jeu et vérifier les fichiers générés
npm start               # Version web ; la PWA est sous /mobile/
npm run start:mobile    # Servir la PWA à la racine
```

### Publier le site mobile (iPhone)

Le dossier `docs/` est prêt à servir : aucun backend n’est nécessaire. Sur GitHub, ouvre **Settings → Pages → Deploy from a branch**, sélectionne `arena/09cef573-minestart` et **`/docs`**, puis **Save**. Après le déploiement, l’adresse sera `https://azzoxmxyt.github.io/Minestart/`. Tu peux aussi extraire `Minestart-PWA.zip` sur un autre hébergeur statique HTTPS. Un fichier `index.html` ouvert directement ne suffit pas pour installer une PWA : le navigateur doit pouvoir charger le service worker sur le site.

### Fabriquer l’APK

Sur Linux ou macOS, utilise Node.js 22, un JDK (17+), `zip` et `unzip`, ainsi que le SDK Android (plateforme 36, build-tools 36.0.0). Donne le chemin du SDK dans `ANDROID_HOME`, puis lance `npm run build:android`. Le script vérifie la signature, le manifeste et le jeu intégré dans `release/Minestart.apk`.

Pour des mises à jour sans désinstallation, signe les versions avec le même keystore PKCS#12 : pointe `MINESTART_ANDROID_KEYSTORE` vers son fichier, définis `MINESTART_ANDROID_PASSWORD` et utilise l’alias `minestart` (ou `MINESTART_ANDROID_KEY_ALIAS` localement). En CI, les secrets facultatifs `MINESTART_ANDROID_KEYSTORE_B64` et `MINESTART_ANDROID_PASSWORD` permettent la même signature. Sans keystore, le script signe avec une clé ponctuelle : un APK signé autrement ne pourra pas être installé par-dessus. Ne versionne pas la clé.

### Fabriquer la release Windows

Pour fabriquer la release Windows, utilise [Zig](https://github.com/ziglang/zig) avec `zig rc` et la compilation croisée MinGW (testé avec `0.14.0-dev.2456`), puis lance :

```sh
npm run build:windows
```

Si Zig n’est pas dans le `PATH`, donne le chemin de son exécutable via la variable `ZIG`. Le script place les deux lanceurs, le HTML autonome et leurs sommes SHA-256 dans `release/`. Les lanceurs ne nécessitent ni Zig ni Node.js pour fonctionner.

Les polices Pixelify Sans, Space Grotesk et IBM Plex Mono sont distribuées sous la SIL Open Font License. Leurs licences sont dans `src/fonts/` et incorporées dans le fichier autonome.
