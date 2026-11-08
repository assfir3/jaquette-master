# Contribuer à Jaquette Master

Merci de vouloir améliorer l'outil ! Jaquette Master est un projet communautaire : tout le monde peut proposer une idée, signaler un bug ou modifier le code.

## Proposer une idée ou signaler un bug

Ouvre une [issue](https://github.com/assfir3/jaquette-master/issues/new/choose) en choisissant le bon modèle (bug ou idée). Une capture d'écran aide beaucoup.

## Modifier le code : une branche par changement

La branche `main` est protégée : on n'y écrit pas directement. Chaque changement passe par sa propre branche, puis par une *pull request* relue avant d'être fusionnée.

1. **Fork** le dépôt (bouton *Fork* en haut à droite), puis clone ton fork :
   ```bash
   git clone https://github.com/TON-PSEUDO/jaquette-master.git
   cd jaquette-master
   npm install
   ```
2. **Crée une branche** au nom parlant, à partir de `main` à jour :
   ```bash
   git switch -c ajout/format-blu-ray
   ```
   Préfixes conseillés : `ajout/` (nouvelle fonction), `correction/` (bug), `docs/` (documentation), `design/` (interface).
3. **Lance l'appli** et fais tes modifications :
   ```bash
   npm run dev          # version web : http://localhost:5180
   npm run app          # version de bureau (Electron)
   ```
4. **Vérifie** avant d'envoyer :
   ```bash
   npm run check        # types
   npm run build        # construction
   ```
5. **Envoie ta branche** et ouvre une pull request vers `main` :
   ```bash
   git push -u origin ajout/format-blu-ray
   ```
   Décris ce que tu as changé et pourquoi, avec une capture d'écran si l'interface change.

Les vérifications automatiques (onglet *Actions*) tournent sur chaque pull request. Une fois relue et validée, elle est fusionnée dans `main`.

## Fabriquer l'appli de bureau

```bash
npm run dist:mac     # .dmg (sur un Mac)
npm run dist:win     # .exe (sur Windows)
```

Les fichiers arrivent dans `release/`. Les versions officielles sont fabriquées par GitHub quand un mainteneur pousse un tag (`v0.2.0`…) : le `.dmg` et le `.exe` sont installés et lancés automatiquement sur Windows et macOS (test de lancement), puis apparaissent dans les [Releases](https://github.com/assfir3/jaquette-master/releases). La signature Apple est décrite dans [docs/signature-mac.md](docs/signature-mac.md).

Pour tester l'appli fabriquée sans l'ouvrir à la main :

```bash
JAQUETTE_SMOKE_TEST=resultat.json npm run app   # écrit le résultat puis quitte (code 0 si tout va bien)
```

## Repères dans le code

- Toutes les mesures sont en **millimètres** (`src/lib/model.ts`).
- Le rendu de la jaquette est partagé entre l'écran et l'export (`src/lib/render.ts`).
- Le serveur intermédiaire (`server/api.ts`) utilise les API Web standard : il tourne dans Vite, dans l'appli de bureau (`electron/main.ts`) et sur un Cloudflare Worker.
- L'interface est en français ; les commentaires du code aussi.
- Aucun visuel de jeu ni logo n'est livré avec l'outil : ils sont téléchargés à la demande. N'ajoute pas d'images protégées au dépôt.

## Règles de vie

Sois bienveillant·e et constructif·ve. Les critiques portent sur le code, jamais sur les personnes. Les propos insultants ou discriminants ne sont pas acceptés.

En contribuant, tu acceptes que ton code soit publié sous la [licence MIT](LICENSE) du projet.
