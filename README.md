# TANSIFT ACCESSOIRES — ERP/WMS Automotive

Application métier complète pour la gestion d'une société de vente de pièces automobiles.  
**100% open-source, déploiement 1 clic via Docker.**

## 🚀 Installation rapide

### Prérequis
- Docker & Docker Compose **OU** Node.js 20+

### Option 1 : Docker (recommandé)
```bash
# 1. Cloner/extraire le projet
cd tansift-accessoires

# 2. Lancer l'application
docker compose up -d

# 3. Accéder à l'application
#    http://localhost:3000
```

### Option 2 : Node.js direct
```bash
# 1. Installer les dépendances
npm install

# 2. Démarrer le serveur
npm start

# 3. Accéder à l'application
#    http://localhost:3000
```

## 🔑 Identifiants par défaut

| Rôle | Email | Mot de passe |
|------|-------|-------------|
| Administrateur | admin@tansift.ma | admin123 |

## 🏗️ Architecture technique

```
tansift-accessoires/
├── backend/
│   ├── database/
│   │   ├── schema.sql          # Schéma complet SQLite (30+ tables)
│   │   └── init.js             # Initialisation BDD + données démo
│   ├── middleware/
│   │   └── auth.js             # JWT + rôles
│   ├── routes/
│   │   ├── auth.js             # Authentification
│   │   ├── articles.js         # Catalogue articles
│   │   ├── clients.js          # Gestion clients
│   │   ├── fournisseurs.js     # Gestion fournisseurs
│   │   ├── documents.js        # Achats / Ventes / Documents
│   │   ├── paiements.js        # Paiements & situation
│   │   ├── stock.js            # Mouvements stock & inventaire
│   │   ├── moteurs.js          # Moteurs & nomenclature
│   │   ├── barcodes.js         # Codes-barres génération/scan
│   │   ├── categories.js       # Catégories articles
│   │   ├── dashboard.js        # KPIs & graphiques
│   │   ├── parametres.js       # Configuration société
│   │   ├── audit.js            # Journal d'audit
│   │   └── tva.js              # Taux TVA
│   ├── utils/helpers.js        # Utilitaires (numérotation, audit, etc.)
│   └── server.js               # Point d'entrée Express
├── frontend/
│   ├── index.html              # SPA complète
│   ├── css/style.css           # Design system complet
│   └── js/app.js               # Application frontend
├── docker-compose.yml          # Déploiement 1 clic
├── Dockerfile                  # Node.js 20 Alpine
└── package.json
```

## 📦 Modules fonctionnels

### 📦 Catalogue Articles
- Articles pièces auto avec catégories (Freinage, Embrayage, etc.)
- Compatibilité véhicules (Marque > Modèle > Motorisation > Année)
- Multi-références (fabricant, OEM, alternatives)
- Photos multiples, gestion des stocks, alertes seuil

### 🔧 Moteurs (Assemblages)
- Nomenclature BOM complète
- Désassemblage intelligent vers stock pièces
- Réassemblage depuis stock
- Vue arbre : ✅ présent / ⚠️ extrait / ❌ manquant
- Rapport d'intégrité des moteurs

### 👥 Clients & Fournisseurs
- Types : Particulier, Professionnel, Garage, Concessionnaire
- Champs Maroc : ICE, IF, RC, CNSS, Patente
- Fiches véhicules clients (immatriculation, VIN)
- Conditions paiement, plafond crédit, remises

### 💰 Situation & Paiements
- KPIs : Total facturé, payé, solde dû
- Grand-livre par client
- Encaissement avec imputation FIFO
- Reçus PDF

### 🛒 Achats
- DA → Commande Fournisseur → BR → Facture → Avoir
- Conversion 1 clic entre étapes
- Validation BR → stock incrémenté

### 💳 Ventes
- Devis → Commande → BL → Facture → Avoir
- Saisie par scan code-barres
- Numérotation automatique (DEV-2025-0001, FAC-2025-0001, etc.)
- Marge en temps réel
- PDF A4 professionnel avec logo, TVA ventilée, montant en lettres

### 🏷️ Codes-barres
- Génération EAN-13 / Code128
- Impression individuelle ou en lot
- Étiquettes A4 (21/48/65 cases)
- Scan via QuaggaJS (caméra) + lecteur USB

### 📊 Dashboard & Rapports
- KPIs temps réel : CA, factures, devis, stock, alertes
- Top 10 articles, mouvements récents
- Rapports exportables : inventaire, ventes, achats, balance clients, TVA, marges

### ⚙️ Paramètres
- Société : nom, logo, ICE, IF, RC, CNSS, Patente, RIB
- Configuration : charte graphique, devise, TVA, délais
- Utilisateurs & rôles (Admin, Commercial, Magasinier, Comptable)
- Sauvegarde BDD, export ZIP complet

## 🔒 Sécurité
- JWT avec expiration 24h
- Mots de passe bcrypt
- Validation client + serveur
- Journal d'audit complet (qui, quand, quoi)
- SQLite local — données jamais exposées

## 🌐 API REST
Toutes les routes sont préfixées par `/api/` et protégées par JWT.
Documentation disponible via l'interface.

## 📝 Licence
MIT — TANSIFT ACCESSOIRES
