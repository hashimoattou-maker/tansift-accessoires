#!/bin/bash
# ============================================
# SCRIPT DE BACKUP - Accessoires Tensift
# À exécuter sur l'ANCIEN Hostinger
# ============================================

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/tmp/backup-tansift-${TIMESTAMP}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=========================================="
echo "  BACKUP Accessoires Tensift"
echo "=========================================="
echo ""
echo "Projet: ${PROJECT_DIR}"
echo "Backup: ${BACKUP_DIR}"
echo ""

# Créer le dossier de backup
mkdir -p "${BACKUP_DIR}"

# 1. Backup des fichiers (sans node_modules, sans .git, sans logs)
echo "[1/3] Backup des fichiers..."
cd "${PROJECT_DIR}/.."
tar czf "${BACKUP_DIR}/fichiers.tar.gz" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='server.log' \
  --exclude='server-error.log' \
  --exclude='data/*.db' \
  --exclude='uploads' \
  "$(basename "${PROJECT_DIR}")" 2>/dev/null || true
echo "  ✅ Fichiers sauvegardés"

# 2. Backup des uploads (images logos/articles)
echo "[2/3] Backup des uploads..."
if [ -d "${PROJECT_DIR}/uploads" ]; then
  tar czf "${BACKUP_DIR}/uploads.tar.gz" -C "${PROJECT_DIR}" uploads/
  echo "  ✅ Uploads sauvegardés"
else
  echo "  ⚠️  Pas de dossier uploads"
fi

# 3. Backup de la base de données
echo "[3/3] Backup de la base de données..."

# Lire les credentials depuis .env
if [ -f "${PROJECT_DIR}/.env" ]; then
  DB_HOST=$(grep DB_HOST "${PROJECT_DIR}/.env" | cut -d= -f2)
  DB_USER=$(grep DB_USER "${PROJECT_DIR}/.env" | cut -d= -f2)
  DB_PASS=$(grep DB_PASS "${PROJECT_DIR}/.env" | cut -d= -f2)
  DB_NAME=$(grep DB_NAME "${PROJECT_DIR}/.env" | cut -d= -f2)
  DB_PORT=$(grep DB_PORT "${PROJECT_DIR}/.env" | cut -d= -f2 || echo "3306")
  
  if command -v mysqldump &> /dev/null; then
    mysqldump -h"${DB_HOST}" -P"${DB_PORT}" -u"${DB_USER}" -p"${DB_PASS}" \
      --single-transaction --routines --triggers "${DB_NAME}" \
      > "${BACKUP_DIR}/database.sql" 2>/dev/null
    echo "  ✅ Base de données sauvegardée (${DB_NAME})"
  else
    echo "  ❌ mysqldump non trouvé. Sauvegarde manuelle via phpMyAdmin :"
    echo "     phpMyAdmin → Base '${DB_NAME}' → Exporter → SQL"
    echo "     Sauvegarde le fichier dans ${BACKUP_DIR}/database.sql"
  fi
else
  echo "  ❌ Fichier .env non trouvé"
fi

# 4. Copier .env (sans le mot de passe visible)
echo ""
echo "[bonus] Copie du .env..."
cp "${PROJECT_DIR}/.env" "${BACKUP_DIR}/.env"
echo "  ✅ .env sauvegardé (_change le mot de passe DB après transfert)"

# 5. Créer l'archive finale
echo ""
echo "Création de l'archive..."
cd /tmp
tar czf "backup-tansift-${TIMESTAMP}.tar.gz" "backup-tansift-${TIMESTAMP}/"
rm -rf "${BACKUP_DIR}"

echo ""
echo "=========================================="
echo "  ✅ BACKUP TERMINÉ"
echo "=========================================="
echo ""
echo "Fichier: /tmp/backup-tansift-${TIMESTAMP}.tar.gz"
echo ""
echo "Pour le télécharger :"
echo "  1. File Manager → /tmp/"
echo "  2. Clic droit sur le fichier → Download"
echo "  OU via FTP :"
echo "  ftp://127.0.0.1/tmp/backup-tansift-${TIMESTAMP}.tar.gz"
echo ""
echo "IMPORTANT : garde ce fichier en sécurité !"
