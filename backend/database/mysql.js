const mysql = require('mysql2/promise');

class Statement {
  constructor(pool, sql) {
    this.pool = pool;
    this.sql = sql;
  }

  async _execute(params) {
    if (params.length > 0) {
      const [rows] = await this.pool.execute(this.sql, params);
      return rows;
    } else {
      const [rows] = await this.pool.query(this.sql);
      return rows;
    }
  }

  async get(...params) {
    if (Array.isArray(params[0])) params = params[0];
    const rows = await this._execute(params);
    return rows[0] || undefined;
  }

  async all(...params) {
    if (Array.isArray(params[0])) params = params[0];
    return await this._execute(params);
  }

  async run(...params) {
    if (Array.isArray(params[0])) params = params[0];
    params = params.map(p => p === undefined ? null : p);
    let result;
    if (params.length > 0) {
      [result] = await this.pool.execute(this.sql, params);
    } else {
      [result] = await this.pool.query(this.sql);
    }
    return { lastInsertRowid: result.insertId, changes: result.affectedRows };
  }
}

class Database {
  constructor(pool) {
    this.pool = pool;
  }

  prepare(sql) {
    return new Statement(this.pool, sql);
  }

  async run(sql, params = []) {
    if (typeof sql === 'string') {
      if (Array.isArray(params[0])) params = params[0];
      if (params.length > 0) {
        const [result] = await this.pool.execute(sql, params);
        return { lastInsertRowid: result.insertId, changes: result.affectedRows };
      } else {
        const [result] = await this.pool.query(sql);
        return { lastInsertRowid: result.insertId, changes: result.affectedRows };
      }
    }
    return { lastInsertRowid: 0 };
  }

  async exec(sql) {
    const statements = sql.split(';').filter(s => s.trim().length > 0);
    for (const stmt of statements) {
      try {
        await this.pool.query(stmt.trim());
      } catch (e) {
        if (!e.message?.includes('Duplicate') && !e.message?.includes('already exists')) {
          console.warn('Exec warning:', e.message);
        }
      }
    }
    return [];
  }

  async close() {
    await this.pool.end();
  }
}

let pool = null;
let dbInstance = null;

async function initializeDatabase() {
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbUser = process.env.DB_USER || 'root';
  const dbPass = process.env.DB_PASS || '';
  const dbName = process.env.DB_NAME || 'tansift_accessoires';
  const dbPort = parseInt(process.env.DB_PORT || '3306');

  pool = mysql.createPool({
    host: dbHost,
    user: dbUser,
    password: dbPass,
    database: dbName,
    port: dbPort,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
    timezone: '+00:00',
    dateStrings: true,
    connectTimeout: 10000
  });

  console.log(`✓ Connecté à MySQL ${dbHost}:${dbPort}/${dbName}`);

  dbInstance = new Database(pool);

  // Create tables
  await createTables();

  // Seed data
  try {
    await seedData();
  } catch (e) {
    console.warn('Seed warning:', e.message);
  }

  // Recalibrate client balances
  try {
    const { updateClientSolde } = require('../utils/helpers');
    const clients = await dbInstance.prepare('SELECT id FROM clients WHERE actif = 1').all();
    for (const c of clients) {
      await updateClientSolde(dbInstance, c.id);
    }
    console.log(`[init] Soldes ${clients.length} clients recalibrés.`);
  } catch (e) {
    console.warn('Recalibration soldes:', e.message);
  }

  return dbInstance;
}

async function createTables() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS parametres (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cle VARCHAR(255) UNIQUE NOT NULL,
      valeur MEDIUMTEXT NOT NULL,
      type VARCHAR(50) DEFAULT 'text',
      section VARCHAR(50) DEFAULT 'general',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS utilisateurs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nom VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      mot_de_passe VARCHAR(255) NOT NULL,
      role ENUM('Administrateur','Commercial','Magasinier','Comptable') NOT NULL,
      telephone VARCHAR(50),
      actif INT DEFAULT 1,
      theme VARCHAR(50) DEFAULT 'clair',
      avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      nom VARCHAR(255) NOT NULL,
      description TEXT,
      parent_id INT REFERENCES categories(id),
      taux_tva REAL DEFAULT 20.0,
      type_article VARCHAR(50) DEFAULT 'accessoire',
      garantie_jours INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS articles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      reference VARCHAR(255) UNIQUE NOT NULL,
      designation VARCHAR(255) NOT NULL,
      description TEXT,
      categorie_id INT,
      type_article VARCHAR(50) DEFAULT 'accessoire',
      unite_mesure VARCHAR(50) DEFAULT 'PIECE',
      prix_achat_ht REAL DEFAULT 0,
      prix_vente_ht REAL DEFAULT 0,
      tva_id INT DEFAULT 1,
      stock_actuel REAL DEFAULT 0,
      stock_min REAL DEFAULT 0,
      stock_max REAL DEFAULT 0,
      emplacement VARCHAR(100),
      code_barre VARCHAR(255),
      poids REAL,
      volume REAL,
      actif INT DEFAULT 1,
      est_moteur INT DEFAULT 0,
      moteur_complet INT DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS articles_photos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      article_id INT NOT NULL,
      chemin VARCHAR(500) NOT NULL,
      ordre INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS articles_references (
      id INT AUTO_INCREMENT PRIMARY KEY,
      article_id INT NOT NULL,
      type_reference VARCHAR(50) NOT NULL,
      code VARCHAR(255) NOT NULL,
      nom_fournisseur VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS articles_compatibilites (
      id INT AUTO_INCREMENT PRIMARY KEY,
      article_id INT NOT NULL,
      marque VARCHAR(255) NOT NULL,
      modele VARCHAR(255) NOT NULL,
      motorisation VARCHAR(255),
      annee_debut INT,
      annee_fin INT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS nomenclature_moteur (
      id INT AUTO_INCREMENT PRIMARY KEY,
      moteur_id INT NOT NULL,
      composant_id INT NOT NULL,
      quantite REAL NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_nomenclature (moteur_id, composant_id),
      FOREIGN KEY (moteur_id) REFERENCES articles(id) ON DELETE CASCADE,
      FOREIGN KEY (composant_id) REFERENCES articles(id)
    )`,
    `CREATE TABLE IF NOT EXISTS decompositions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      moteur_id INT NOT NULL,
      date_decomposition DATETIME DEFAULT CURRENT_TIMESTAMP,
      utilisateur_id INT,
      motif TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (moteur_id) REFERENCES articles(id),
      FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS decompositions_lignes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      decomposition_id INT NOT NULL,
      composant_id INT NOT NULL,
      quantite INT NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (decomposition_id) REFERENCES decompositions(id) ON DELETE CASCADE,
      FOREIGN KEY (composant_id) REFERENCES articles(id)
    )`,
    `CREATE TABLE IF NOT EXISTS codes_barres (
      id INT AUTO_INCREMENT PRIMARY KEY,
      article_id INT NOT NULL,
      code VARCHAR(255) NOT NULL UNIQUE,
      format VARCHAR(50) DEFAULT 'Code128',
      type_etiquette VARCHAR(50) DEFAULT 'individuelle',
      date_generation DATETIME DEFAULT CURRENT_TIMESTAMP,
      imprime INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS clients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code_client VARCHAR(255) UNIQUE NOT NULL,
      type_client VARCHAR(50) NOT NULL,
      raison_sociale VARCHAR(255) NOT NULL,
      nom_contact VARCHAR(255),
      telephone VARCHAR(50),
      email VARCHAR(255),
      adresse TEXT,
      ville VARCHAR(255),
      code_postal VARCHAR(20),
      pays VARCHAR(100) DEFAULT 'Maroc',
      ice VARCHAR(50),
      if_fiscal VARCHAR(50),
      rc VARCHAR(50),
      cnss VARCHAR(50),
      patente VARCHAR(50),
      conditions_paiement VARCHAR(100) DEFAULT '30 jours',
      plafond_credit REAL DEFAULT 0,
      remise_defaut REAL DEFAULT 0,
      categorie_tarifaire VARCHAR(50) DEFAULT 'standard',
      solde_actuel REAL DEFAULT 0,
      note TEXT,
      actif INT DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS fournisseurs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code_fournisseur VARCHAR(255) UNIQUE NOT NULL,
      raison_sociale VARCHAR(255) NOT NULL,
      nom_contact VARCHAR(255),
      telephone VARCHAR(50),
      email VARCHAR(255),
      adresse TEXT,
      ville VARCHAR(255),
      ice VARCHAR(50),
      if_fiscal VARCHAR(50),
      rc VARCHAR(50),
      cnss VARCHAR(50),
      patente VARCHAR(50),
      delai_livraison_jours INT DEFAULT 15,
      evaluation INT DEFAULT 3,
      banque VARCHAR(255),
      rib VARCHAR(255),
      conditions_paiement VARCHAR(100) DEFAULT '60 jours',
      solde_actuel REAL DEFAULT 0,
      actif INT DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS vehicules_clients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      client_id INT NOT NULL,
      immatriculation VARCHAR(100) NOT NULL,
      vin VARCHAR(100),
      marque VARCHAR(100) NOT NULL,
      modele VARCHAR(100) NOT NULL,
      motorisation VARCHAR(100),
      annee INT,
      couleur VARCHAR(50),
      date_entree DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS documents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type_document VARCHAR(50) NOT NULL,
      numero VARCHAR(255) NOT NULL UNIQUE,
      date_document DATETIME DEFAULT CURRENT_TIMESTAMP,
      date_echeance DATETIME,
      client_id INT,
      fournisseur_id INT,
      utilisateur_id INT,
      statut VARCHAR(50) DEFAULT 'brouillon',
      montant_ht REAL DEFAULT 0,
      montant_ttc REAL DEFAULT 0,
      remise_globale REAL DEFAULT 0,
      total_tva REAL DEFAULT 0,
      net_a_payer REAL DEFAULT 0,
      notes TEXT,
      conditions_paiement TEXT,
      adresse_livraison TEXT,
      reference_commande_client TEXT,
      motif_annulation TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (fournisseur_id) REFERENCES fournisseurs(id),
      FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS documents_lignes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      document_id INT NOT NULL,
      article_id INT,
      ligne_numero INT DEFAULT 0,
      reference VARCHAR(255),
      designation VARCHAR(500),
      quantite REAL NOT NULL DEFAULT 1,
      prix_unitaire_ht REAL DEFAULT 0,
      remise_pourcent REAL DEFAULT 0,
      taux_tva REAL DEFAULT 20.0,
      montant_ht REAL DEFAULT 0,
      montant_tva REAL DEFAULT 0,
      montant_ttc REAL DEFAULT 0,
      marge_brute REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (article_id) REFERENCES articles(id)
    )`,
    `CREATE TABLE IF NOT EXISTS paiements_clients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      client_id INT NOT NULL,
      document_id INT,
      date_paiement DATETIME NOT NULL,
      montant REAL NOT NULL,
      mode_paiement VARCHAR(50) NOT NULL,
      reference VARCHAR(255),
      numero_cheque VARCHAR(100),
      banque_emetteur VARCHAR(255),
      date_valeur DATETIME,
      notes TEXT,
      utilisateur_id INT,
      statut VARCHAR(50) DEFAULT 'valide',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (document_id) REFERENCES documents(id),
      FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS imputations_paiements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      paiement_id INT NOT NULL,
      document_id INT NOT NULL,
      montant_impute REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (paiement_id) REFERENCES paiements_clients(id) ON DELETE CASCADE,
      FOREIGN KEY (document_id) REFERENCES documents(id)
    )`,
    `CREATE TABLE IF NOT EXISTS mouvements_stock (
      id INT AUTO_INCREMENT PRIMARY KEY,
      article_id INT NOT NULL,
      type_mouvement VARCHAR(50) NOT NULL,
      quantite REAL NOT NULL,
      stock_avant REAL DEFAULT 0,
      stock_apres REAL DEFAULT 0,
      prix_unitaire REAL DEFAULT 0,
      document_id INT,
      document_type VARCHAR(50),
      utilisateur_id INT,
      motif TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (article_id) REFERENCES articles(id),
      FOREIGN KEY (document_id) REFERENCES documents(id),
      FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS inventaire_tournant (
      id INT AUTO_INCREMENT PRIMARY KEY,
      article_id INT NOT NULL,
      quantite_theorique REAL NOT NULL,
      quantite_reelle REAL NOT NULL,
      ecart REAL DEFAULT 0,
      date_comptage DATETIME DEFAULT CURRENT_TIMESTAMP,
      utilisateur_id INT,
      valide INT DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (article_id) REFERENCES articles(id),
      FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS garanties (
      id INT AUTO_INCREMENT PRIMARY KEY,
      document_id INT,
      article_id INT NOT NULL,
      client_id INT,
      date_debut DATETIME NOT NULL,
      date_fin DATETIME NOT NULL,
      duree_jours INT,
      statut VARCHAR(50) DEFAULT 'active',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id),
      FOREIGN KEY (article_id) REFERENCES articles(id),
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )`,
    `CREATE TABLE IF NOT EXISTS journal_audit (
      id INT AUTO_INCREMENT PRIMARY KEY,
      utilisateur_id INT,
      action VARCHAR(100) NOT NULL,
      entite VARCHAR(100) NOT NULL,
      entite_id INT,
      details TEXT,
      adresse_ip VARCHAR(100),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      utilisateur_id INT,
      type VARCHAR(100) NOT NULL,
      message TEXT NOT NULL,
      lien TEXT,
      lu INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS sequences (
      id INT AUTO_INCREMENT PRIMARY KEY,
      prefixe VARCHAR(50) NOT NULL,
      type_document VARCHAR(100) NOT NULL UNIQUE,
      derniere_valeur INT DEFAULT 0,
      annee VARCHAR(10),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS taux_tva (
      id INT AUTO_INCREMENT PRIMARY KEY,
      taux REAL NOT NULL UNIQUE,
      label VARCHAR(100) NOT NULL,
      defaut INT DEFAULT 0
    )`
  ];

  for (const sql of tables) {
    try {
      await pool.query(sql);
    } catch (e) {
      console.warn('Table warning:', e.message);
    }
  }

  // Migration: supprimer catégories Filtration, Lubrifiants, Pneumatiques
  try {
    await pool.query(`DELETE FROM categories WHERE code IN ('FILT','LUBR','PNEU')`);
  } catch (e) { /* ignore */ }

  // Migration: convertir ancien logo fichier -> base64 dans la DB
  try {
    const [rows] = await pool.query(`SELECT valeur FROM parametres WHERE cle = 'societe_logo'`);
    if (rows.length > 0 && rows[0].valeur && rows[0].valeur.startsWith('/uploads/')) {
      const fs = require('fs');
      const pathMod = require('path');
      const uploadsDir = pathMod.join(__dirname, '..', '..', 'uploads');
      const logoFile = rows[0].valeur;
      const fullPath = pathMod.join(uploadsDir, pathMod.basename(logoFile));
      if (fs.existsSync(fullPath)) {
        const ext = pathMod.extname(fullPath).toLowerCase();
        const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
        const mime = mimeMap[ext] || 'image/png';
        const buf = fs.readFileSync(fullPath);
        const base64 = `data:${mime};base64,${buf.toString('base64')}`;
        await pool.query(`UPDATE parametres SET valeur = ? WHERE cle = 'societe_logo'`, [base64]);
        console.log('[migration] Logo converti en base64 dans la DB');
      }
    }
  } catch (e) { console.warn('Migration logo:', e.message); }

  // Migration: colonne valeur TEXT -> MEDIUMTEXT pour stocker le logo en base64
  try {
    await pool.query(`ALTER TABLE parametres MODIFY COLUMN valeur MEDIUMTEXT NOT NULL`);
  } catch (e) { /* ignore */ }

  // Migration: ajouter source_unit_id dans documents_lignes
  try {
    await pool.query(`ALTER TABLE documents_lignes ADD COLUMN source_unit_id INT DEFAULT NULL AFTER article_id`);
    await pool.query(`ALTER TABLE documents_lignes ADD CONSTRAINT fk_ligne_source_unit FOREIGN KEY (source_unit_id) REFERENCES articles(id) ON DELETE SET NULL`);
  } catch (e) { /* already exists */ }

  // Migration: ajouter document_source_id dans documents
  try {
    await pool.query(`ALTER TABLE documents ADD COLUMN document_source_id INT DEFAULT NULL AFTER fournisseur_id`);
    await pool.query(`ALTER TABLE documents ADD CONSTRAINT fk_doc_source FOREIGN KEY (document_source_id) REFERENCES documents(id) ON DELETE SET NULL`);
  } catch (e) { /* already exists */ }

  // Migration: table mouvements_stock
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS mouvements_stock (
      id INT AUTO_INCREMENT PRIMARY KEY,
      article_id INT NOT NULL,
      type_mouvement ENUM('entree','sortie','transfert','ajustement','inventaire') NOT NULL,
      quantite REAL NOT NULL,
      stock_avant REAL DEFAULT 0,
      stock_apres REAL DEFAULT 0,
      prix_unitaire REAL DEFAULT 0,
      document_id INT DEFAULT NULL,
      document_type VARCHAR(50) DEFAULT NULL,
      document_numero VARCHAR(255) DEFAULT NULL,
      source_unit_id INT DEFAULT NULL,
      client_id INT DEFAULT NULL,
      fournisseur_id INT DEFAULT NULL,
      motif TEXT,
      utilisateur_id INT,
      date_mouvement DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (article_id) REFERENCES articles(id),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL,
      FOREIGN KEY (source_unit_id) REFERENCES articles(id) ON DELETE SET NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
      FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch (e) { /* already exists */ }

  // Migration: ajouter colonnes manquantes dans mouvements_stock
  try { await pool.query(`ALTER TABLE mouvements_stock ADD COLUMN document_numero VARCHAR(255) DEFAULT NULL AFTER document_type`); } catch (e) { /* exists */ }
  try { await pool.query(`ALTER TABLE mouvements_stock ADD COLUMN source_unit_id INT DEFAULT NULL AFTER document_numero`); } catch (e) { /* exists */ }
  try { await pool.query(`ALTER TABLE mouvements_stock ADD COLUMN client_id INT DEFAULT NULL AFTER source_unit_id`); } catch (e) { /* exists */ }
  try { await pool.query(`ALTER TABLE mouvements_stock ADD COLUMN fournisseur_id INT DEFAULT NULL AFTER client_id`); } catch (e) { /* exists */ }

  // Migration: indexes pour documents commerciaux
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mouv_article ON mouvements_stock(article_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mouv_document ON mouvements_stock(document_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mouv_source_unit ON mouvements_stock(source_unit_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mouv_client ON mouvements_stock(client_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mouv_date ON mouvements_stock(date_mouvement)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_doc_source ON documents(document_source_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ligne_source ON documents_lignes(source_unit_id)`);
  } catch (e) { /* already exists */ }

  // ============================================================
  // MODULE ASSEMBLAGE / DEMONTABLE
  // ============================================================

  // Migration: colonnes type_unite et stock_unite dans articles
  try { await pool.query(`ALTER TABLE articles ADD COLUMN type_unite VARCHAR(50) DEFAULT NULL AFTER est_moteur`); } catch (e) { /* exists */ }
  try { await pool.query(`ALTER TABLE articles ADD COLUMN stock_unite INT DEFAULT 0 AFTER stock_actuel`); } catch (e) { /* exists */ }

  // Migration: colonne image pour articles
  try { await pool.query(`ALTER TABLE articles ADD COLUMN image MEDIUMTEXT DEFAULT NULL AFTER description`); } catch (e) { /* exists */ }

  // Migration: renommer moteur_id en parent_article_id dans decompositions (générique)
  try { await pool.query(`ALTER TABLE decompositions CHANGE COLUMN moteur_id parent_article_id INT NOT NULL`); } catch (e) { /* exists or already renamed */ }

  // Migration: table assemblages
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS assemblages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      unite_parent_id INT NOT NULL,
      date_assemblage DATETIME DEFAULT CURRENT_TIMESTAMP,
      quantite INT NOT NULL DEFAULT 1,
      utilisateur_id INT,
      motif TEXT,
      statut VARCHAR(50) DEFAULT 'termine',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (unite_parent_id) REFERENCES articles(id),
      FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch (e) { /* already exists */ }

  // Migration: table assemblages_lignes
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS assemblages_lignes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      assemblage_id INT NOT NULL,
      composant_id INT NOT NULL,
      quantite INT NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assemblage_id) REFERENCES assemblages(id) ON DELETE CASCADE,
      FOREIGN KEY (composant_id) REFERENCES articles(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch (e) { /* already exists */ }

  // Migration: ajouter parent_article_id dans decompositions_lignes
  try { await pool.query(`ALTER TABLE decompositions_lignes ADD COLUMN stock_apres REAL DEFAULT NULL AFTER quantite`); } catch (e) { /* exists */ }

  // Migration: indexes assemblage/déassembly
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_assembl_parent ON assemblages(unite_parent_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_assembl_ligne ON assemblages_lignes(assemblage_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_decomp_parent ON decompositions(parent_article_id)`);
  } catch (e) { /* already exists */ }

  // Migration: catégorie Accessoires
  try { await pool.query(`INSERT IGNORE INTO categories (code, nom, taux_tva, garantie_jours) VALUES (?,?,?,?)`, ['ACC', 'Accessoires', 20, 365]); } catch (e) { /* exists */ }

  // Migration: table doc_counters pour numérotation chronologique
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS doc_counters (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type_document VARCHAR(100) NOT NULL,
      jour VARCHAR(8) NOT NULL,
      counter INT DEFAULT 0,
      UNIQUE KEY uk_type_jour (type_document, jour)
    )`);
  } catch (e) { /* exists */ }

  // Migration: colonne ref_externe pour numero externe fournisseur
  try { await pool.query(`ALTER TABLE documents ADD COLUMN ref_externe VARCHAR(255) DEFAULT NULL AFTER adresse_livraison`); } catch (e) { /* exists */ }
}

async function seedData() {
  const bcrypt = require('bcryptjs');
  const adminPassword = bcrypt.hashSync('admin123', 10);

  // Check if data already exists
  const [existing] = await pool.query('SELECT COUNT(*) as cnt FROM articles');
  if (existing[0].cnt > 0) {
    console.log(`[seed] ${existing[0].cnt} articles existent déjà, seed ignoré.`);
    return;
  }

  // TVA
  await pool.query('INSERT IGNORE INTO taux_tva (id, taux, label, defaut) VALUES (1,20.0,"TVA 20%",1),(2,14.0,"TVA 14%",0),(3,10.0,"TVA 10%",0),(4,7.0,"TVA 7%",0),(5,0.0,"Exonéré",0)');

  // Parametres
  const parametres = [
    ['societe_nom', 'Accessoires Tensift', 'text', 'societe'],
    ['societe_slogan', 'Votre partenaire automobile de confiance', 'text', 'societe'],
    ['societe_ice', '', 'text', 'societe'], ['societe_if', '', 'text', 'societe'],
    ['societe_rc', '', 'text', 'societe'], ['societe_cnss', '', 'text', 'societe'],
    ['societe_patente', '', 'text', 'societe'], ['societe_telephone', '', 'text', 'societe'],
    ['societe_email', '', 'text', 'societe'], ['societe_adresse', '', 'text', 'societe'],
    ['societe_ville', '', 'text', 'societe'], ['societe_banque', '', 'text', 'societe'],
    ['societe_rib', '', 'text', 'societe'], ['societe_logo', '', 'text', 'societe'],
    ['societe_logo_width', '180', 'text', 'societe'], ['societe_logo_position', 'gauche', 'text', 'societe'],
    ['societe_mentions', '', 'text', 'societe'], ['couleur_charte', '#1a3a5c', 'color', 'configuration'],
    ['devise', 'MAD', 'text', 'configuration'], ['delai_validite_devis', '30', 'number', 'configuration'],
    ['prefixe_devis', 'DEV-', 'text', 'numerotation'], ['prefixe_bon_commande_client', 'BCC-', 'text', 'numerotation'],
    ['prefixe_bon_livraison', 'BL-', 'text', 'numerotation'], ['prefixe_facture_client', 'FAC-', 'text', 'numerotation'],
    ['prefixe_avoir_client', 'AVOIR-', 'text', 'numerotation'], ['prefixe_demande_achat', 'DA-', 'text', 'numerotation'],
    ['prefixe_commande_fournisseur', 'CF-', 'text', 'numerotation'], ['prefixe_bon_reception', 'BR-', 'text', 'numerotation'],
    ['prefixe_facture_fournisseur', 'FAF-', 'text', 'numerotation'],
    ['seuil_alerte_stock', '10', 'number', 'alertes'],
    ['delai_relance_1', '30', 'number', 'alertes'], ['delai_relance_2', '60', 'number', 'alertes'],
    ['delai_contentieux', '90', 'number', 'alertes'], ['marge_minimale', '15', 'number', 'configuration']
  ];
  for (const [cle, valeur, type, section] of parametres) {
    await pool.query('INSERT IGNORE INTO parametres (cle, valeur, type, section) VALUES (?,?,?,?)', [cle, valeur, type, section]);
  }

  // Categories
  const categories = [
    ['FREIN', 'Freinage', 20, 365], ['EMBR', 'Embrayage', 20, 365], ['SUSP', 'Suspension', 20, 365],
    ['ELEC', 'Électricité', 20, 365], ['CARRO', 'Carrosserie', 20, 365],
    ['MOTEUR', 'Moteurs', 20, 730],
    ['ASSEM', 'Assemblage', 20, 365],
    ['ACC', 'Accessoires', 20, 365]
  ];
  for (const [code, nom, tva, garantie] of categories) {
    await pool.query('INSERT IGNORE INTO categories (code, nom, taux_tva, garantie_jours) VALUES (?,?,?,?)', [code, nom, tva, garantie]);
  }

  // Admin user
  await pool.query('INSERT IGNORE INTO utilisateurs (nom, email, mot_de_passe, role) VALUES (?,?,?,?)',
    ['Administrateur', 'admin@tansift.ma', adminPassword, 'Administrateur']);

  // Articles
  const articlesDemo = [
    ['FRE-001', 'Plaquettes de frein avant PREMIUM', 1, 120, 250, 50, 10, 100, 'A-01-01'],
    ['FRE-002', 'Disques de frein avant ventilés', 1, 250, 480, 30, 5, 60, 'A-01-02'],
    ['FRE-003', 'Tambour de frein arrière', 1, 180, 350, 0, 5, 40, 'A-01-03'],
    ['EMB-001', 'Kit embrayage complet', 2, 850, 1500, 15, 3, 30, 'B-01-01'],
    ['ELEC-001', 'Batterie 12V 70Ah', 4, 450, 850, 20, 5, 40, 'D-01-01'],
    ['ELEC-002', 'Alternateur 120A', 4, 650, 1200, 8, 3, 20, 'D-01-02'],
    ['SUSP-001', 'Amortisseur avant gauche', 3, 320, 600, 12, 5, 30, 'E-01-01'],
    ['CARRO-001', 'Rétroviseur électrique gauche', 5, 280, 520, 5, 3, 20, 'H-01-01']
  ];
  for (const [ref, des, cat, pa, pv, stock, min, max, eml] of articlesDemo) {
    await pool.query('INSERT IGNORE INTO articles (reference, designation, categorie_id, prix_achat_ht, prix_vente_ht, stock_actuel, stock_min, stock_max, emplacement) VALUES (?,?,?,?,?,?,?,?,?)',
      [ref, des, cat, pa, pv, stock, min, max, eml]);
  }

  // Clients (seed disabled - codes generated automatically)
  // Fournisseurs (seed disabled - codes generated automatically)
}

function getDatabase() {
  return dbInstance;
}

module.exports = { initializeDatabase, getDatabase };
