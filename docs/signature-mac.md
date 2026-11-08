# Signer et notariser l'appli Mac

Sans signature Apple, macOS affiche un avertissement au premier lancement du `.dmg`. Une fois les cinq secrets ci-dessous ajoutés au dépôt, GitHub Actions signe l'appli avec le certificat **Developer ID Application** et la fait notariser par Apple à chaque version : elle s'ouvre alors normalement.

Seul le propriétaire du dépôt peut faire cette opération. Les contributeurs n'en ont pas besoin : sans secrets, l'appli est fabriquée avec une signature « ad hoc », comme avant.

## 1. Exporter le certificat

1. Ouvre **Trousseau d'accès**, catégorie **Mes certificats**.
2. Clic droit sur *Developer ID Application: …* → **Exporter…** → format **.p12**.
3. Choisis un mot de passe d'export (il servira pour `MAC_CERT_PASSWORD`).

## 2. Créer un mot de passe pour les apps

Sur [account.apple.com](https://account.apple.com) → *Connexion et sécurité* → **Mots de passe pour les apps** → crée-en un nommé « Jaquette Master ».

## 3. Ajouter les secrets au dépôt

Depuis le dossier du projet (chaque commande demande la valeur, qui n'apparaît pas à l'écran ni dans l'historique) :

```bash
base64 -i ~/Desktop/certificat.p12 | gh secret set MAC_CERT_P12_BASE64
gh secret set MAC_CERT_PASSWORD             # mot de passe d'export du .p12
gh secret set APPLE_ID                      # adresse du compte Apple Developer
gh secret set APPLE_APP_SPECIFIC_PASSWORD   # mot de passe pour les apps
gh secret set APPLE_TEAM_ID                 # identifiant d'équipe (10 caractères, entre parenthèses dans le nom du certificat)
```

Supprime ensuite le fichier `.p12` du bureau.

## 4. Vérifier

Onglet **Actions** → *Publication* → **Run workflow**. L'étape « Fabrication (macOS) » doit afficher `Signature Developer ID et notarisation Apple`, et le test de l'appli installée `accepted … source=Notarized Developer ID`.

Pour retirer la signature, supprime le secret `MAC_CERT_P12_BASE64`.
