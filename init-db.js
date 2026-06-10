#!/usr/bin/env node
// Script d'initialisation de la BDD utilisable en ligne de commande
const { initializeDatabase } = require('./backend/database/init');
console.log('Initialisation de la base de données...');
try {
  const db = initializeDatabase();
  console.log('✓ Base de données créée avec succès');
  console.log('✓ Tables, index et données démo installés');
  db.close();
} catch (e) {
  console.error('Erreur:', e.message);
  process.exit(1);
}
