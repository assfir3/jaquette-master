# Jaquette Master

Créer facilement des jaquettes de jeux vidéo à imprimer : face avant, tranche et dos d'un boîtier DVD, exportés en PDF 300 dpi avec fond perdu et traits de coupe.

## Lancer

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # version statique dans dist/
npm run check    # vérification des types
```

## Recherche automatique

Onglet **Recherche** : on tape le nom du jeu, on choisit le résultat, puis **Créer la jaquette automatiquement**.
Les visuels viennent de Steam (sans clé) : jaquette verticale, grand fond, logo transparent, captures, résumé en français, développeur, éditeur, année.

Optionnel : une clé **SteamGridDB** (gratuite, sur steamgriddb.com → Profil → Préférences → API) ajoute des dizaines de jaquettes et logos créés par la communauté, et les jeux hors Steam :

```bash
cp .env.example .env.local   # puis colle la clé dans STEAMGRIDDB_API_KEY
```

Les requêtes passent par un petit serveur intermédiaire (`server/api.ts`, monté sur `/api` par Vite) qui garde la clé secrète et télécharge les images pour qu'elles restent exportables. Le même code pourra tourner sur un Cloudflare Worker (`server/worker.ts`).

## Aperçu 3D

Bouton **3D** au-dessus de la zone de travail : le boîtier et le disque en 3D, mis à jour en direct. On tourne à la souris, vues Face / Tranche / Dos, et **Enregistrer l'image** donne un PNG à partager.

## Logos officiels des jeux

La fiche d'un jeu propose automatiquement les logos officiels : celui de Steam, ceux de Wikimedia Commons (souvent plusieurs couleurs), et ceux marqués « official » sur SteamGridDB si la clé est ajoutée. Le logo du studio ou de l'éditeur est aussi proposé, et posé en blanc au dos par la création automatique.

## Logos

Onglet **Logos** : PEGI, boutiques (Steam, GOG, Epic, Ubisoft, Battle.net, itch.io) et plateformes (Windows, Xbox, Linux, Steam Deck), plus une recherche libre sur Wikimedia Commons.
Un clic pose le logo à l'endroit habituel (PEGI en bas à gauche de la face, boutiques en rangée au bas du dos, plateforme en bas de la tranche) ; les logos suivants se rangent à côté.
Chaque image peut être recolorée en blanc, en noir ou dans une teinte au choix (panneau de droite).
« Mes logos » garde tes propres logos d'un projet à l'autre (stockés dans le navigateur).

Les logos sont téléchargés à la demande, jamais livrés avec l'outil : ce sont des marques de leurs propriétaires.

## Rondelle CD/DVD

Bouton **Boîtier / Rondelle** au-dessus de la zone de travail : la rondelle est une deuxième surface du même projet, créée en même temps que la jaquette par la recherche automatique.
- Disque de 120 mm, zone imprimable réglable : bord extérieur (118 mm conseillé) et centre (22 mm pour les disques « full face », 41 mm pour les standards). Vérifie les valeurs sur l'emballage de tes disques.
- Export **PNG** 300 dpi transparent autour et au centre, à importer dans le logiciel d'impression sur CD (Epson Print CD, Canon…).
- Export **PDF A4** à taille réelle avec cercles de découpe, pour du papier autocollant.

## Ce que fait l'éditeur

- Gabarit boîtier DVD : 273 × 183 mm (tranche 14 mm réglable), fond perdu 3 mm, marge de sécurité 4 mm.
- Glisser-déposer ou coller (⌘V) une image : elle remplit automatiquement le panneau visé (face, dos, tranche ou tout).
- Textes (titre face, titre tranche pivoté, résumé au dos), bandes de couleur, calques, aimantation sur les plis et les marges.
- Indication de la résolution réelle de chaque image à l'impression (dpi).
- Export : PDF A4 paysage (imprimante maison), PDF avec traits de coupe, PDF format exact, PNG 300 dpi.
- Projet enregistré dans un fichier `.jaquette.json` (images incluses) + sauvegarde automatique dans le navigateur.

## Organisation du code

- `src/lib/model.ts` : types, gabarits, géométrie des panneaux (tout en mm).
- `src/lib/render.ts` : construction de la scène Konva, partagée par l'écran et l'export.
- `src/lib/editor.svelte.ts` : état de l'éditeur, historique annuler/rétablir.
- `src/lib/export.ts` : rendu 300 dpi, PDF (jsPDF) et PNG.
- `src/lib/storage.ts` : fichiers projet et sauvegarde automatique (IndexedDB).

## Prochaines étapes

1. IGDB pour les jeux console (résumé, PEGI, plateformes) et GOG.
2. Plusieurs styles de mise en page automatique.
3. Autres formats de boîtier (Blu-ray, Switch).

Les visuels des jeux appartiennent à leurs éditeurs : outil destiné à un usage personnel et non commercial.
