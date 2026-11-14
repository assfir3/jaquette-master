# Jaquette Master

Créer facilement des jaquettes de jeux vidéo à imprimer : face avant, tranche et dos d'un boîtier (DVD, Blu-ray, PlayStation, Xbox, Switch…), exportés en PDF 300 dpi avec fond perdu et traits de coupe.

## Télécharger

Les applis prêtes à installer sont dans les [Releases](https://github.com/assfir3/jaquette-master/releases/latest) :

- **Windows** : `Jaquette-Master-…-windows-setup.exe`
- **Mac Apple Silicon** (M1, M2, M3…) : `Jaquette-Master-…-mac-arm64.dmg`
- **Mac Intel** : `Jaquette-Master-…-mac-x64.dmg`

L'appli n'est pas encore signée par Apple ni Microsoft : au premier lancement, Windows affiche « Windows a protégé votre ordinateur » (*Informations complémentaires* → *Exécuter quand même*) ; sur Mac, ouvre l'appli une fois puis clique sur *Ouvrir quand même* dans *Réglages Système › Confidentialité et sécurité*.

**Mises à jour** : l'appli regarde au lancement (puis toutes les 6 heures) si une nouvelle version est sortie sur GitHub et l'affiche en bas à droite. Sur Windows, elle se télécharge en arrière-plan et s'installe au redémarrage (à partir de la version 0.2.0). Sur Mac aussi (à partir de la version 0.3.1) : l'appli télécharge la nouvelle version, la vérifie et se remplace toute seule au redémarrage, sans repasser par le `.dmg` ni par *Confidentialité et sécurité*. Si elle ne peut pas écrire dans son dossier (lancée depuis le `.dmg`), elle met le `.dmg` dans Téléchargements et l'ouvre. Pour essayer sans publier : `JAQUETTE_FAKE_VERSION=0.0.1 npm run app`.

Les clés d'API facultatives (SteamGridDB, MobyGames) se rangent dans le fichier `config.json` créé au premier lancement ; son emplacement exact est affiché dans l'onglet Recherche :
- macOS : `~/Library/Application Support/jaquette-master/config.json`
- Windows : `%APPDATA%\jaquette-master\config.json`

## Contribuer

Le projet est communautaire : idées, bugs et modifications sont les bienvenus. Chaque changement se fait sur sa propre branche puis passe par une pull request : tout est expliqué dans [CONTRIBUTING.md](CONTRIBUTING.md).

## Lancer depuis le code

```bash
npm install
npm run dev        # version web : http://localhost:5180
npm run app        # version de bureau (Electron)
npm run check      # vérification des types
npm run dist:mac   # fabrique le .dmg (sur un Mac)
npm run dist:win   # fabrique le .exe (sur Windows)
```

## Recherche automatique

Onglet **Recherche** : on tape le nom du jeu, on choisit le résultat, puis **Créer la jaquette automatiquement**.
Les visuels viennent de Steam (sans clé) : jaquette verticale, grand fond, logo transparent, captures, résumé en français, développeur, éditeur, année.

Optionnel : une clé **SteamGridDB** (gratuite, sur steamgriddb.com → Profil → Préférences → API) ajoute des dizaines de jaquettes et logos créés par la communauté, et les jeux hors Steam. Colle-la dans **Clés d'API**, en bas de l'onglet Recherche : elle est vérifiée tout de suite et gardée sur l'appareil. Même chose pour la clé MobyGames. Pour une installation partagée, les clés peuvent aussi aller dans un fichier :

```bash
cp .env.example .env.local   # puis colle la clé dans STEAMGRIDDB_API_KEY
```

Les requêtes passent par un petit serveur intermédiaire (`server/api.ts`, monté sur `/api` par Vite) qui garde la clé secrète et télécharge les images pour qu'elles restent exportables. Le même code pourra tourner sur un Cloudflare Worker (`server/worker.ts`).

## Modèles de mise en page

Dans la fiche d'un jeu, choisis un modèle avant **Créer la jaquette automatiquement** :
- **Affiche** : grand visuel en haut du dos qui se fond dans la couleur du jeu ;
- **Bandeau PC** : bandeau clair en haut (texte modifiable, « PC DVD-ROM » par défaut), façon boîte PC des années 2000 ;
- **Épuré** : fond uni, texte centré, mosaïque de captures ;
- **Magazine** : bannière en haut, captures en colonne, texte à côté.

## Jaquettes officielles du commerce (MobyGames)

Avec une clé **MobyGames** (dans **Clés d'API**, ou `MOBYGAMES_API_KEY` dans `.env.local`), la fiche d'un jeu liste les éditions scannées par pays, éditions françaises en premier. « Utiliser cette édition » pose la vraie face, le vrai dos et le disque. Sans clé, cette partie est simplement masquée. Usage personnel uniquement ; l'usage commercial demande l'accord de MobyGames.

## Aperçu 3D

Vue **Aperçu 3D** sous la zone de travail : un boîtier DVD réaliste (coque noire aux arêtes arrondies, jaquette d'une seule pièce enroulée autour de la tranche, film plastique brillant), mis à jour en direct. **Ouvrir le boîtier** fait pivoter la face sur sa charnière (avec un léger dépassement à l'ouverture et un petit claquement à la fermeture) et montre le disque rangé sur son plot. **Présentation** ouvre et referme le boîtier en boucle pendant que la caméra se balance, et **Vidéo** enregistre un cycle de 7 secondes (MP4, ou WebM selon le navigateur). On tourne à la souris, vues ¾ / Face / Tranche / Dos, et **Enregistrer l'image** donne un PNG à partager.

## Logos officiels des jeux

La fiche d'un jeu propose automatiquement les logos officiels : celui de Steam, ceux de Wikimedia Commons (souvent plusieurs couleurs), et ceux marqués « official » sur SteamGridDB si la clé est ajoutée. Le logo du studio ou de l'éditeur est aussi proposé, et posé en blanc au dos par la création automatique.

## Logos

Onglet **Logos**, rangé en sections dépliables (94 logos) :
- classifications : PEGI (Europe), USK (Allemagne), ESRB (Amérique du Nord), CERO (Japon), ClassInd (Brésil) ;
- boutiques : Steam, GOG, Epic, EA, Ubisoft, Battle.net, Rockstar, Microsoft Store, Game Pass, PlayStation Store, Nintendo eShop, Humble, Amazon Games, Green Man Gaming, itch.io ;
- plateformes : Windows, macOS, Linux, SteamOS, Steam Deck, Android, iOS, Meta Quest, toutes les PlayStation, Xbox, Nintendo, Dreamcast ;
- supports : DVD, Blu-ray, CD-ROM.

Plus une recherche libre sur Wikimedia Commons. Les pictogrammes de contenu PEGI récents (violence, peur…) n'y sont pas : importe-les dans « Mes logos ».
Un clic pose le logo à l'endroit habituel (PEGI en bas à gauche de la face, boutiques en rangée au bas du dos, plateforme en bas de la tranche) ; les logos suivants se rangent à côté.
Chaque image peut être recolorée en blanc, en noir ou dans une teinte au choix (panneau de droite).
« Mes logos » garde tes propres logos d'un projet à l'autre (stockés dans le navigateur).

Les logos sont téléchargés à la demande, jamais livrés avec l'outil : ce sont des marques de leurs propriétaires.

## Formats de boîtier

**Mise en page › Format**. Changer de format adapte la mise en page (⌘Z pour revenir). Un nouveau projet reprend le format du précédent.

| Format | Face | Tranche | Hauteur |
|---|---|---|---|
| DVD / PS2 / Xbox / Xbox 360 / Wii / Wii U / PC | 129,5 mm | 14 mm | 183 mm |
| Blu-ray | 128,5 mm | 12 mm | 148 mm |
| PS3 | 128 mm | 14 mm | 150 mm |
| PS4 / PS5 / Xbox One / Series | 130 mm | 13 mm | 160 mm |
| Nintendo Switch / Switch 2 | 99 mm | 10 mm | 161 mm |
| Personnalisé | à mesurer | à mesurer | à mesurer |

Les fabricants varient de 1 à 2 mm : en cas de doute, mesure ta boîte et choisis **Personnalisé**.

Pour la **Switch**, la deuxième surface est l'**étiquette de la cartouche** (18,5 × 25 mm, mesure de la communauté à vérifier) au lieu de la rondelle : bandeau rouge et logo, visuel du jeu, bandeau noir et code, comme en magasin. Export PNG, PDF A4 de 6 étiquettes, ou feuille de 24 dans **Impression**. L'aperçu 3D montre la boîte transparente avec la cartouche (grise pour la Switch, rouge pour la Switch 2) ; la couleur du boîtier se choisit en haut de l'aperçu.

## Formes et dégradés

Onglet **Mise en page › Formes** : rectangle, ellipse, triangle, losange, polygone (3 à 16 côtés), étoile (branches et creux réglables), flèche et cœur, avec contour au choix. **Fond en dégradé** pose un fond qui couvre toute la surface, tout derrière.

La couleur d'une forme ou d'un texte peut être **unie**, en **dégradé** linéaire (direction libre, 8 raccourcis) ou **radial**, avec 2 ou 3 couleurs et une opacité par couleur (pour un fondu vers le transparent). Huit dégradés sont prêts à l'emploi.

## Rondelle CD/DVD

Bouton **Boîtier / Rondelle** au-dessus de la zone de travail : la rondelle est une deuxième surface du même projet, créée en même temps que la jaquette par la recherche automatique.
- Disque de 120 mm, zone imprimable réglable : bord extérieur (118 mm conseillé) et centre (22 mm pour les disques « full face », 41 mm pour les standards). Vérifie les valeurs sur l'emballage de tes disques.
- Export **PNG** 300 dpi transparent autour et au centre, à importer dans le logiciel d'impression sur CD (Epson Print CD, Canon…).
- Export **PDF A4** à taille réelle avec cercles de découpe, pour du papier autocollant.

## Étagère

Chaque jaquette se range toute seule sur l'étagère (onglet **Étagère** en haut), avec un aperçu de sa tranche et de sa face, à l'échelle réelle. Un clic la sélectionne, un double-clic ou **Ouvrir dans l'atelier** la rouvre. Les jaquettes sont gardées dans le navigateur : enregistre un fichier `.jaquette.json` pour les garder ailleurs.

## Impression

Onglet **Impression** en haut (ou Exporter › Impression personnalisée…), avec un aperçu de la feuille :
- **Jaquette** : papier A4, A3, US Letter, US Legal ou format personnalisé (orientation automatique), fond perdu et traits de coupe au choix. Un avertissement s'affiche si la jaquette ne tient pas ou frôle le bord.
- **Rondelle sur planche ou papier** : papier ordinaire à découper, planches A4 de 2 étiquettes Ø 117 mm (plein visage ou centre 41 mm) ou planche personnalisée (feuille, diamètre, trou, position des étiquettes).
- **Rondelle directement sur le CD** (Epson, Canon…) : image PNG de 120 mm à 300 dpi, dont la résolution est inscrite dans le fichier pour arriver à la bonne taille dans Epson Print CD ou Easy-PhotoPrint Editor, ou PDF au format exact 120 × 120 mm. Les étapes de chaque logiciel sont rappelées.
- **Calibrage** : décalage et échelle de l'imprimante, gardés dans le navigateur. La **planche de test** (contours seuls et règle de 100 mm) sert à les régler avant d'utiliser une planche d'étiquettes.

Les positions des planches d'étiquettes du commerce varient d'une marque à l'autre : vérifie-les avec la planche de test.

## Ce que fait l'éditeur

- Gabarits DVD (273 × 183 mm), Blu-ray, PS3, PS4/PS5, Switch et personnalisé, tranche réglable, fond perdu 3 mm, marge de sécurité 4 mm (voir Formats de boîtier).
- Glisser-déposer ou coller (⌘V) une image : elle remplit automatiquement le panneau visé (face, dos, tranche ou tout).
- Textes (titre face, titre tranche pivoté, résumé au dos), bandes de couleur, calques, aimantation sur les plis et les marges.
- Indication de la résolution réelle de chaque image à l'impression (dpi).
- Export : PDF A4 paysage (imprimante maison), PDF avec traits de coupe, PDF format exact, PNG 300 dpi.
- Thème clair ou sombre (bouton à côté de ↶ ↷), ou automatique comme le système.
- Projet enregistré dans un fichier `.jaquette.json` (images incluses) + sauvegarde automatique sur l'étagère du navigateur.

## Organisation du code

- `src/lib/model.ts` : types, gabarits, géométrie des panneaux (tout en mm).
- `src/lib/render.ts` : construction de la scène Konva, partagée par l'écran et l'export.
- `src/lib/editor.svelte.ts` : état de l'éditeur, historique annuler/rétablir.
- `src/lib/export.ts` : rendu 300 dpi, PDF (jsPDF) et PNG.
- `src/lib/storage.ts` : fichiers projet, étagère et sauvegarde automatique (IndexedDB).
- `src/lib/Shelf.svelte` : la vue Étagère.
- `src/lib/print.ts` et `src/lib/PrintView.svelte` : formats de papier, planches d'étiquettes, impression directe sur CD, calibrage.
- `src/lib/Preview3D.svelte` : le boîtier 3D (Three.js) qui s'ouvre.
- `electron/main.ts` : l'appli de bureau ; sert l'interface et `/api` via l'adresse interne `jaquette://app`.
- `.github/workflows/` : vérifications de chaque pull request, et fabrication du `.dmg` / `.exe` à chaque version.

## Prochaines étapes

1. IGDB pour les jeux console (résumé, PEGI, plateformes) et GOG.
2. Autres formats de boîtier (Blu-ray, Switch, CD cristal).
3. Positions vérifiées des planches d'étiquettes du commerce.

## Licence

Code sous licence [MIT](LICENSE).

Les visuels des jeux et les logos appartiennent à leurs éditeurs et ne sont pas livrés avec l'outil : ils sont téléchargés à la demande. Outil destiné à un usage personnel et non commercial.
