// Wrapper for sql.js providing better-sqlite3 compatible API
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'tansift.db');
const DB_BACKUP = path.join(__dirname, '..', '..', 'data', 'tansift.backup.db');

function sanitizeParams(params) {
  if (Array.isArray(params)) {
    return params.map(p => p === undefined ? null : p);
  }
  return params;
}

class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
  }

  run(...params) {
    if (Array.isArray(params[0])) params = params[0];
    params = sanitizeParams(params);
    this.db.run(this.sql, params);
    return { lastInsertRowid: this.db.exec("SELECT last_insert_rowid() as id")[0]?.values[0]?.[0] || 0 };
  }

  get(...params) {
    if (Array.isArray(params[0])) params = params[0];
    params = sanitizeParams(params);
    try {
      const stmt = this.db.prepare(this.sql);
      if (params.length > 0) stmt.bind(params);
      if (stmt.step()) {
        const cols = stmt.getColumnNames();
        const vals = stmt.get();
        stmt.free();
        const row = {};
        cols.forEach((c, i) => { row[c] = vals[i]; });
        return row;
      }
      stmt.free();
      return undefined;
    } catch (e) {
      return undefined;
    }
  }

  all(...params) {
    if (Array.isArray(params[0])) params = params[0];
    params = sanitizeParams(params);
    const results = [];
    try {
      const stmt = this.db.prepare(this.sql);
      if (params.length > 0) stmt.bind(params);
      while (stmt.step()) {
        const cols = stmt.getColumnNames();
        const vals = stmt.get();
        const row = {};
        cols.forEach((c, i) => { row[c] = vals[i]; });
        results.push(row);
      }
      stmt.free();
    } catch (e) {}
    return results;
  }
}

class Database {
  constructor(db) {
    this.db = db;
  }

  prepare(sql) {
    return new Statement(this.db, sql);
  }

  run(sql, params = []) {
    if (typeof sql === 'string') {
      params = sanitizeParams(params);
      this.db.run(sql, params);
      return { lastInsertRowid: this.db.exec("SELECT last_insert_rowid() as id")[0]?.values[0]?.[0] || 0 };
    }
    return { lastInsertRowid: 0 };
  }

  exec(sql) {
    return this.db.exec(sql);
  }

  transaction(fn) {
    return (...args) => {
      this.db.run('BEGIN TRANSACTION');
      try {
        const result = fn(...args);
        this.db.run('COMMIT');
        return result;
      } catch (e) {
        this.db.run('ROLLBACK');
        throw e;
      }
    };
  }

  export() {
    return this.db.export();
  }

  close() {
    this.db.close();
  }
}

let dbInstance = null;
let SQL = null;

async function initializeDatabase() {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  SQL = await initSqlJs();
  const exists = fs.existsSync(DB_PATH);

  let buffer = null;
  if (exists) {
    buffer = fs.readFileSync(DB_PATH);
  } else if (fs.existsSync(DB_BACKUP)) {
    // Main DB lost (deploy reset), restore from backup
    console.log('[init] Fichier DB introuvable, restauration depuis backup...');
    buffer = fs.readFileSync(DB_BACKUP);
    fs.writeFileSync(DB_PATH, buffer);
  }

  const rawDb = new SQL.Database(buffer);
  rawDb.run('PRAGMA foreign_keys = ON');
  rawDb.run('PRAGMA encoding = "UTF-8"');

  // Run schema in a way that ignores errors (tables exist, indexes exist, etc.)
  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  // Split by semicolons and run each statement individually to handle errors gracefully
  const statements = schemaSql.split(';').filter(s => s.trim().length > 0);
  for (const stmt of statements) {
    try {
      rawDb.run(stmt + ';');
    } catch (e) {
      // Ignore "already exists" errors
      if (!e.message?.includes('already exists') && !e.message?.includes('duplicate')) {
        console.warn('Schema warning:', e.message);
      }
    }
  }

  dbInstance = new Database(rawDb);

  // Migrations: add missing columns
  const migrations = [
    `ALTER TABLE articles ADD COLUMN actif INTEGER DEFAULT 1`,
    `ALTER TABLE articles ADD COLUMN est_moteur INTEGER DEFAULT 0`,
    `ALTER TABLE articles ADD COLUMN moteur_complet INTEGER DEFAULT 1`,
    `ALTER TABLE articles ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE clients ADD COLUMN actif INTEGER DEFAULT 1`,
    `ALTER TABLE clients ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE fournisseurs ADD COLUMN actif INTEGER DEFAULT 1`,
    `ALTER TABLE fournisseurs ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
  ];
  for (const m of migrations) {
    try { rawDb.run(m); } catch (e) {}
  }

  try {
    await seedData();
  } catch (e) {
    console.warn('Seed warning:', e.message);
  }

  saveDatabase();
  return dbInstance;
}

function saveDatabase() {
  if (!dbInstance) return;
  const data = dbInstance.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
  // Auto-backup every save
  try { fs.writeFileSync(DB_BACKUP, buffer); } catch (e) {}
}

function getDatabase() {
  return dbInstance;
}

async function seedData() {
  const bcrypt = require('bcryptjs');
  const adminPassword = bcrypt.hashSync('admin123', 10);
  dbInstance.run(`UPDATE utilisateurs SET mot_de_passe = ? WHERE email = ?`, [adminPassword, 'admin@tansift.ma']);

  const existingArticles = dbInstance.prepare(`SELECT COUNT(*) as cnt FROM articles`).get();
  if (existingArticles && existingArticles.cnt > 0) {
    console.log(`[seed] ${existingArticles.cnt} articles existent déjà, seed ignoré.`);
    return;
  }

  const articlesDemo = [
    { ref: 'FRE-001', des: 'Plaquettes de frein avant PREMIUM', cat: 1, pa: 120, pv: 250, stock: 50, min: 10, max: 100, eml: 'A-01-01' },
    { ref: 'FRE-002', des: 'Disques de frein avant ventilés', cat: 1, pa: 250, pv: 480, stock: 30, min: 5, max: 60, eml: 'A-01-02' },
    { ref: 'FRE-003', des: 'Tambour de frein arrière', cat: 1, pa: 180, pv: 350, stock: 0, min: 5, max: 40, eml: 'A-01-03' },
    { ref: 'EMB-001', des: 'Kit d\'embrayage complet', cat: 2, pa: 850, pv: 1500, stock: 15, min: 3, max: 30, eml: 'B-01-01' },
    { ref: 'FILT-001', des: 'Filtre à huile moteur', cat: 4, pa: 35, pv: 80, stock: 200, min: 50, max: 500, eml: 'C-01-01' },
    { ref: 'FILT-002', des: 'Filtre à air habitacle', cat: 4, pa: 55, pv: 120, stock: 150, min: 30, max: 300, eml: 'C-01-02' },
    { ref: 'ELEC-001', des: 'Batterie 12V 70Ah', cat: 5, pa: 450, pv: 850, stock: 20, min: 5, max: 40, eml: 'D-01-01' },
    { ref: 'ELEC-002', des: 'Alternateur 120A', cat: 5, pa: 650, pv: 1200, stock: 8, min: 3, max: 20, eml: 'D-01-02' },
    { ref: 'SUSP-001', des: 'Amortisseur avant gauche', cat: 3, pa: 320, pv: 600, stock: 12, min: 5, max: 30, eml: 'E-01-01' },
    { ref: 'LUBR-001', des: 'Huile moteur 5W40 5L', cat: 7, pa: 110, pv: 220, stock: 80, min: 20, max: 200, eml: 'F-01-01' },
    { ref: 'PNEU-001', des: 'Pneu 205/55 R16 été', cat: 8, pa: 350, pv: 650, stock: 40, min: 10, max: 80, eml: 'G-01-01' },
    { ref: 'CARRO-001', des: 'Rétroviseur électrique gauche', cat: 6, pa: 280, pv: 520, stock: 5, min: 3, max: 20, eml: 'H-01-01' },
  ];

  for (const a of articlesDemo) {
    dbInstance.run(`INSERT OR IGNORE INTO articles (reference, designation, categorie_id, prix_achat_ht, prix_vente_ht, stock_actuel, stock_min, stock_max, emplacement) VALUES (?,?,?,?,?,?,?,?,?)`,
      [a.ref, a.des, a.cat, a.pa, a.pv, a.stock, a.min, a.max, a.eml]);
  }

  dbInstance.run(`INSERT OR IGNORE INTO articles_compatibilites (article_id, marque, modele, motorisation, annee_debut, annee_fin) VALUES (?,?,?,?,?,?)`, [1, 'Renault', 'Clio III', '1.5 dCi', 2005, 2014]);
  dbInstance.run(`INSERT OR IGNORE INTO articles_compatibilites (article_id, marque, modele, motorisation, annee_debut, annee_fin) VALUES (?,?,?,?,?,?)`, [1, 'Peugeot', '208', '1.6 HDi', 2012, 2020]);
  dbInstance.run(`INSERT OR IGNORE INTO articles_compatibilites (article_id, marque, modele, motorisation, annee_debut, annee_fin) VALUES (?,?,?,?,?,?)`, [5, 'Dacia', 'Sandero', '1.0 SCe', 2016, 2024]);

  const clientsDemo = [
    { code: 'CLT-001', type: 'Garage', nom: 'Garage ALAMI', tel: '0612345678', email: 'alami@email.ma', ville: 'Casablanca', ice: '12345678', rc: '123456' },
    { code: 'CLT-002', type: 'Particulier', nom: 'Ahmed BENCHARKA', tel: '0698765432', email: 'bencharka@email.ma', ville: 'Rabat' },
    { code: 'CLT-003', type: 'Concessionnaire', nom: 'Auto Prestige SARL', tel: '0522123456', email: 'contact@autoprestige.ma', ville: 'Marrakech', ice: '87654321', rc: '654321' },
    { code: 'CLT-004', type: 'Professionnel', nom: 'Transports RAPIDO', tel: '0522987654', email: 'info@rapido.ma', ville: 'Tanger', ice: '45678912' },
    { code: 'CLT-005', type: 'Garage', nom: 'Garage MODERNE', tel: '0655112233', email: 'garage.moderne@email.ma', ville: 'Fès' },
  ];

  for (const c of clientsDemo) {
    dbInstance.run(`INSERT OR IGNORE INTO clients (code_client, type_client, raison_sociale, telephone, email, ville, ice, rc) VALUES (?,?,?,?,?,?,?,?)`,
      [c.code, c.type, c.nom, c.tel, c.email, c.ville, c.ice || null, c.rc || null]);
  }

  const fournisseursDemo = [
    { code: 'FRN-001', nom: 'Parts Automotive Europe', tel: '0522111111', email: 'info@parts-eu.com', ville: 'Casablanca', delai: 30, eval: 4 },
    { code: 'FRN-002', nom: 'Pièces Auto Maroc', tel: '0522222222', email: 'contact@piecesauto.ma', ville: 'Casablanca', delai: 7, eval: 5 },
    { code: 'FRN-003', nom: 'Import Car Distribution', tel: '0522333333', email: 'commandes@icd.ma', ville: 'Tanger', delai: 45, eval: 3 },
  ];

  for (const f of fournisseursDemo) {
    dbInstance.run(`INSERT OR IGNORE INTO fournisseurs (code_fournisseur, raison_sociale, telephone, email, ville, delai_livraison_jours, evaluation) VALUES (?,?,?,?,?,?,?)`,
      [f.code, f.nom, f.tel, f.email, f.ville, f.delai, f.eval]);
  }
}

module.exports = { initializeDatabase, getDatabase, saveDatabase, DB_PATH };
