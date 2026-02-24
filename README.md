# 🚀 Firyxis Launcher

> Un launcher de style Epic Games pour installer et gérer vos applications Windows facilement.

---

## ✨ Fonctionnalités

- 🏪 **Magasin d'applications** — cartes visuelles avec image, description, version
- ⬇️ **Installation en un clic** — via winget ou téléchargement direct (URL)
- 📋 **File d'attente** — les apps s'installent une par une automatiquement
- 📊 **Barre de progression réelle** — affiche les Mo téléchargés en temps réel
- ✕ **Annulation** — annulez une installation en cours à tout moment
- 🗑️ **Désinstallation** — désinstallez directement depuis le launcher
- ✅ **Détection automatique** — le launcher sait quelles apps sont déjà installées
- 🔄 **Mises à jour** — le launcher vérifie les nouvelles versions au démarrage
- 🔍 **Recherche et filtres** — par catégorie ou mot-clé

---

## 📋 Prérequis

- Windows 10 ou 11
- Node.js (le `.bat` vous guide si ce n'est pas installé)
- Connexion internet

---

## ⚡ Installation

### Étape 1 — Télécharger le projet

Cliquez sur le bouton vert **"Code"** puis **"Download ZIP"** sur cette page, et extrayez le dossier où vous voulez (Bureau, Documents, etc.).

Ou avec Git :
```bash
git clone https://github.com/firyx-creation/firyxis-launcher.git
```

### Étape 2 — Lancer le launcher

Double-cliquez sur **`Firyxis Launcher.bat`**

C'est tout ! Le `.bat` fait tout automatiquement :
- Vérifie que Node.js est installé (sinon vous propose de l'installer)
- Installe les dépendances au premier lancement
- Lance le launcher

> Si Node.js vient d'être installé, **redémarrez votre PC** avant de relancer le `.bat`.

---

## 📁 Structure du projet

```
Firyxis Launcher/
├── Firyxis Launcher.bat       <- Double-cliquez pour lancer
├── package.json
├── version.txt                <- Version actuelle du launcher
└── src/
    ├── main.js
    ├── preload.js
    ├── apps.json              <- Vos applications (éditez ce fichier !)
    └── renderer/
        └── index.html
```

---

## ➕ Ajouter une application

Ouvrez **`src/apps.json`** et ajoutez un bloc dans le tableau :

```json
{
  "id": "mon-app",
  "name": "Mon Application",
  "category": "Utilitaires",
  "description": "Description courte de l'application.",
  "version": "1.0",
  "size": "50 MB",
  "image": "https://lien-vers-le-logo.png",
  "wingetId": "Editeur.NomApp",
  "installCommand": "winget install Editeur.NomApp --silent",
  "uninstallCommand": "winget uninstall Editeur.NomApp --silent",
  "detectCommand": "nom-app --version",
  "downloadUrl": "",
  "launchCommand": "nom-app",
  "website": "https://site-officiel.com",
  "tags": ["tag1", "tag2"]
}
```

### Description des champs

| Champ | Requis | Description |
|-------|--------|-------------|
| `id` | Oui | Identifiant unique, sans espaces |
| `name` | Oui | Nom affiché dans le launcher |
| `category` | Oui | Catégorie (ex: Développement, Jeux, Médias...) |
| `description` | Oui | Description courte |
| `image` | Non | URL d'un logo PNG/SVG |
| `wingetId` | Non | ID winget pour détection et désinstall auto |
| `installCommand` | Non | Commande pour installer |
| `uninstallCommand` | Non | Commande pour désinstaller |
| `detectCommand` | Non | Commande pour vérifier si déjà installé |
| `downloadUrl` | Non | URL directe d'un .exe ou .msi |
| `launchCommand` | Non | Commande pour lancer l'app |
| `website` | Non | Site officiel |
| `tags` | Non | Mots-clés pour la recherche |

> Si `downloadUrl` est renseigné, le launcher télécharge le fichier directement.
> Sinon il utilise `installCommand` (winget, chocolatey, etc.).

### Trouver l'ID winget d'une application

```powershell
winget search "nom de l'application"
```

---

## 🔄 Système de mise à jour

Le launcher vérifie automatiquement au démarrage en lisant `version.txt` sur GitHub.

### Publier une mise à jour

1. Modifiez vos fichiers dans le dépôt GitHub
2. Ouvrez `version.txt` sur GitHub
3. Cliquez le crayon pour l'éditer
4. Incrémentez le numéro : `1.0.0` → `1.1.0`
5. Cliquez **"Commit changes"**

Le launcher affichera une bannière verte au prochain démarrage.

> Format : `MAJEUR.MINEUR.PATCH` — ex: `1.0.1` (correctif), `1.1.0` (nouveauté), `2.0.0` (refonte)

---

## ❓ Problèmes fréquents

**`node` n'est pas reconnu**
Redémarrez votre PC après l'installation de Node.js.

**L'installation d'une app échoue**
Testez l'`installCommand` directement dans PowerShell pour vérifier qu'elle fonctionne.

**Le launcher ne détecte pas une app installée**
Vérifiez que `detectCommand` fonctionne dans PowerShell, ou renseignez `wingetId`.

**La mise à jour n'est pas détectée**
Vérifiez que `GITHUB_REPO` dans `src/main.js` correspond à `firyx-creation/firyxis-launcher`.

---

*Firyxis Launcher — Fait avec soin par firyx-creation*
