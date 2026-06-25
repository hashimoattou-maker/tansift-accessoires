#!/bin/bash
# ============================================
# SCRIPT DE DEPLOY - Accessoires Tensift
# À exécuter sur le NOUVEAU Hostinger
# ============================================

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=========================================="
echo "  DEPLOY Accessoires Tensift"
echo "=========================================="
echo ""
echo "Projet: ${PROJECT_DIR}"
echo ""

# Vérifier Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js non trouvé. Installe-le depuis hPanel → Advanced → Node.js"
  exit 1
fi

NODE_VERSION=$(node -v)
echo "Node.js: ${NODE_VERSION}"

# 1. Installer les dépendances
echo ""
echo "[1/5] Installation des dépendances..."
cd "${PROJECT_DIR}"
npm install --production
echo "  ✅ Dépendances installées"

# 2. Configurer .env
echo ""
echo "[2/5] Configuration de la base de données..."
if [ ! -f .env ]; then
  echo "CRÉATION DU FICHIER .env"
  echo ""
  read -p "DB Host (défaut: 127.0.0.1): " DB_HOST
  DB_HOST=${DB_HOST:-127.0.0.1}
  read -p "DB User: " DB_USER
  read -s -p "DB Password: " DB_PASS
  echo ""
  read -p "DB Name: " DB_NAME
  read -p "DB Port (défaut: 3306): " DB_PORT
  DB_PORT=${DB_PORT:-3306}
  
  cat > .env << EOF
DB_HOST=${DB_HOST}
DB_USER=${DB_USER}
DB_PASS=${DB_PASS}
DB_NAME=${DB_NAME}
DB_PORT=${DB_PORT}
EOF
  echo "  ✅ Fichier .env créé"
else
  echo "  ⚠️  .env existe déjà — vérifie les credentials :"
  cat .env
  echo ""
  read -p "Voulez-vous le recréer ? (y/N): " RECREATE
  if [ "$RECREATE" = "y" ] || [ "$RECREATE" = "Y" ]; then
    rm .env
    echo "Relance ce script pour le recréer."
    exit 0
  fi
fi

# 3. Importer la base de données
echo ""
echo "[3/5] Import de la base de données..."
if [ -f migration/database.sql ]; then
  DB_USER=$(grep DB_USER .env | cut -d= -f2)
  DB_PASS=$(grep DB_PASS .env | cut -d= -f2)
  DB_NAME=$(grep DB_NAME .env | cut -d= -f2)
  DB_HOST=$(grep DB_HOST .env | cut -d= -f2)
  DB_PORT=$(grep DB_PORT .env | cut -d= -f2 || echo "3306")
  
  mysql -h"${DB_HOST}" -P"${DB_PORT}" -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" < migration/database.sql 2>/dev/null
  echo "  ✅ Base de données importée"
else
  echo "  ⚠️  Fichier migration/database.sql non trouvé"
  echo "  Importe-le manuellement via phpMyAdmin :"
  echo "  phpMyAdmin → Base '${DB_NAME}' → Importer → database.sql"
fi

# 4. Restaurer les uploads
echo ""
echo "[4/5] Restauration des uploads..."
if [ -f migration/uploads.tar.gz ]; then
  tar xzf migration/uploads.tar.gz -C "${PROJECT_DIR}"
  echo "  ✅ Uploads restaurés"
else
  echo "  ⚠️  Pas de fichier uploads.tar.gz"
fi

# 5. Initialiser la base de données
echo ""
echo "[5/5] Initialisation de la base de données..."
node -e "require('./backend/database/init').initializeDatabase().then(() => { console.log('  ✅ Tables créées/mises à jour'); process.exit(0); }).catch(e => { console.error('  ❌ Erreur:', e.message); process.exit(1); });"

# Finaliser
echo ""
echo "=========================================="
echo "  ✅ DEPLOY TERMINÉ"
echo "=========================================="
echo ""
echo "Prochaines étapes :"
echo "  1. Lance le serveur : npm start"
echo "  2. Configure le domaine dans hPanel"
echo "  3. Teste : https://ton-domaine.com"
echo ""
echo "Pour démarrer le serveur :"
echo "  cd ${PROJECT_DIR}"
echo "  npm start"
echo ""
echo "Pour configurer le domaine :"
echo "  hPanel → Domaines → Ajouter un domaine existant"
echo "  Change les nameservers chez ton registrar"
