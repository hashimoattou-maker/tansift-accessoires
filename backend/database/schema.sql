-- ============================================================
-- TANSIFT ACCESSOIRES - Schéma complet SQLite
-- ERP/WMS pour vente de pièces automobiles
-- ============================================================

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
PRAGMA encoding='UTF-8';

-- ==================== PARAMETRES ====================
CREATE TABLE IF NOT EXISTS parametres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cle TEXT UNIQUE NOT NULL,
  valeur TEXT NOT NULL,
  type TEXT DEFAULT 'text',
  section TEXT DEFAULT 'general',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== UTILISATEURS ====================
CREATE TABLE IF NOT EXISTS utilisateurs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  mot_de_passe TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('Administrateur','Commercial','Magasinier','Comptable')),
  telephone TEXT,
  actif INTEGER DEFAULT 1,
  theme TEXT DEFAULT 'clair',
  avatar TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== CATEGORIES ====================
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  nom TEXT NOT NULL,
  description TEXT,
  parent_id INTEGER REFERENCES categories(id),
  taux_tva REAL DEFAULT 20.0,
  type_article TEXT DEFAULT 'accessoire' CHECK(type_article IN ('accessoire','moteur','assemblage','consommable')),
  garantie_jours INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== ARTICLES ====================
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT UNIQUE NOT NULL,
  designation TEXT NOT NULL,
  description TEXT,
  categorie_id INTEGER REFERENCES categories(id),
  type_article TEXT DEFAULT 'accessoire' CHECK(type_article IN ('accessoire','moteur','assemblage','consommable')),
  unite_mesure TEXT DEFAULT 'PIECE',
  prix_achat_ht REAL DEFAULT 0,
  prix_vente_ht REAL DEFAULT 0,
  tva_id INTEGER DEFAULT 1,
  stock_actuel REAL DEFAULT 0,
  stock_min REAL DEFAULT 0,
  stock_max REAL DEFAULT 0,
  emplacement TEXT,
  code_barre TEXT,
  poids REAL,
  volume REAL,
  actif INTEGER DEFAULT 1,
  est_moteur INTEGER DEFAULT 0,
  moteur_complet INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_articles_reference ON articles(reference);
CREATE INDEX idx_articles_categorie ON articles(categorie_id);
CREATE INDEX idx_articles_code_barre ON articles(code_barre);
CREATE INDEX idx_articles_actif ON articles(actif);

-- ==================== PHOTOS ARTICLES ====================
CREATE TABLE IF NOT EXISTS articles_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  chemin TEXT NOT NULL,
  ordre INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== REFERENCES ALTERNATIVES ====================
CREATE TABLE IF NOT EXISTS articles_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  type_reference TEXT NOT NULL CHECK(type_reference IN ('fabricant','oem','alternative','fournisseur')),
  code TEXT NOT NULL,
  nom_fournisseur TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== COMPATIBILITES VEHICULES ====================
CREATE TABLE IF NOT EXISTS articles_compatibilites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  marque TEXT NOT NULL,
  modele TEXT NOT NULL,
  motorisation TEXT,
  annee_debut INTEGER,
  annee_fin INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_compat_article ON articles_compatibilites(article_id);

-- ==================== NOMENCLATURE MOTEUR (BOM) ====================
CREATE TABLE IF NOT EXISTS nomenclature_moteur (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  moteur_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  composant_id INTEGER NOT NULL REFERENCES articles(id),
  quantite REAL NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(moteur_id, composant_id)
);

CREATE INDEX idx_nomenclature_moteur ON nomenclature_moteur(moteur_id);

-- ==================== DECOMPOSITIONS MOTEUR ====================
CREATE TABLE IF NOT EXISTS decompositions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  moteur_id INTEGER NOT NULL REFERENCES articles(id),
  date_decomposition DATETIME DEFAULT CURRENT_TIMESTAMP,
  utilisateur_id INTEGER REFERENCES utilisateurs(id),
  motif TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS decompositions_lignes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  decomposition_id INTEGER NOT NULL REFERENCES decompositions(id) ON DELETE CASCADE,
  composant_id INTEGER NOT NULL REFERENCES articles(id),
  quantite INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== CODES-BARRES ====================
CREATE TABLE IF NOT EXISTS codes_barres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  format TEXT DEFAULT 'Code128',
  type_etiquette TEXT DEFAULT 'individuelle',
  date_generation DATETIME DEFAULT CURRENT_TIMESTAMP,
  imprime INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_codes_barres_article ON codes_barres(article_id);
CREATE INDEX idx_codes_barres_code ON codes_barres(code);

-- ==================== CLIENTS ====================
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_client TEXT UNIQUE NOT NULL,
  type_client TEXT NOT NULL CHECK(type_client IN ('Particulier','Professionnel','Garage','Concessionnaire')),
  raison_sociale TEXT NOT NULL,
  nom_contact TEXT,
  telephone TEXT,
  email TEXT,
  adresse TEXT,
  ville TEXT,
  code_postal TEXT,
  pays TEXT DEFAULT 'Maroc',
  ice TEXT,
  if_fiscal TEXT,
  rc TEXT,
  cnss TEXT,
  patente TEXT,
  conditions_paiement TEXT DEFAULT '30 jours',
  plafond_credit REAL DEFAULT 0,
  remise_defaut REAL DEFAULT 0,
  categorie_tarifaire TEXT DEFAULT 'standard',
  solde_actuel REAL DEFAULT 0,
  note TEXT,
  actif INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_clients_code ON clients(code_client);

-- ==================== FOURNISSEURS ====================
CREATE TABLE IF NOT EXISTS fournisseurs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_fournisseur TEXT UNIQUE NOT NULL,
  raison_sociale TEXT NOT NULL,
  nom_contact TEXT,
  telephone TEXT,
  email TEXT,
  adresse TEXT,
  ville TEXT,
  ice TEXT,
  if_fiscal TEXT,
  rc TEXT,
  cnss TEXT,
  patente TEXT,
  delai_livraison_jours INTEGER DEFAULT 15,
  evaluation INTEGER DEFAULT 3 CHECK(evaluation BETWEEN 1 AND 5),
  banque TEXT,
  rib TEXT,
  conditions_paiement TEXT DEFAULT '60 jours',
  solde_actuel REAL DEFAULT 0,
  actif INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== VEHICULES CLIENTS ====================
CREATE TABLE IF NOT EXISTS vehicules_clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  immatriculation TEXT NOT NULL,
  vin TEXT,
  marque TEXT NOT NULL,
  modele TEXT NOT NULL,
  motorisation TEXT,
  annee INTEGER,
  couleur TEXT,
  date_entree DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vehicules_client ON vehicules_clients(client_id);

-- ==================== DOCUMENTS (achats/ventes) ====================
-- Document générique : Devis, Commande Client, BL, Facture, Avoir, DA, Commande Fournisseur, BR, Facture Fournisseur
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type_document TEXT NOT NULL CHECK(type_document IN (
    'devis','bon_commande_client','bon_livraison','facture_client','avoir_client',
    'demande_achat','commande_fournisseur','bon_reception','facture_fournisseur','avoir_fournisseur'
  )),
  numero TEXT NOT NULL UNIQUE,
  date_document DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_echeance DATETIME,
  client_id INTEGER REFERENCES clients(id),
  fournisseur_id INTEGER REFERENCES fournisseurs(id),
  utilisateur_id INTEGER REFERENCES utilisateurs(id),
  statut TEXT DEFAULT 'brouillon' CHECK(statut IN ('brouillon','envoye','valide','livre','paye','annule','partiel')),
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
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_documents_type ON documents(type_document);
CREATE INDEX idx_documents_client ON documents(client_id);
CREATE INDEX idx_documents_fournisseur ON documents(fournisseur_id);
CREATE INDEX idx_documents_numero ON documents(numero);
CREATE INDEX idx_documents_date ON documents(date_document);
CREATE INDEX idx_documents_statut ON documents(statut);

-- ==================== LIGNES DOCUMENTS ====================
CREATE TABLE IF NOT EXISTS documents_lignes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  article_id INTEGER REFERENCES articles(id),
  ligne_numero INTEGER DEFAULT 0,
  reference TEXT,
  designation TEXT,
  quantite REAL NOT NULL DEFAULT 1,
  prix_unitaire_ht REAL DEFAULT 0,
  remise_pourcent REAL DEFAULT 0,
  taux_tva REAL DEFAULT 20.0,
  montant_ht REAL DEFAULT 0,
  montant_tva REAL DEFAULT 0,
  montant_ttc REAL DEFAULT 0,
  marge_brute REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lignes_document ON documents_lignes(document_id);
CREATE INDEX idx_lignes_article ON documents_lignes(article_id);

-- ==================== PAIEMENTS CLIENTS ====================
CREATE TABLE IF NOT EXISTS paiements_clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  document_id INTEGER REFERENCES documents(id),
  date_paiement DATETIME NOT NULL,
  montant REAL NOT NULL,
  mode_paiement TEXT NOT NULL CHECK(mode_paiement IN ('Especes','Cheque','Virement','TPE','Traite','Autre')),
  reference TEXT,
  numero_cheque TEXT,
  banque_emetteur TEXT,
  date_valeur DATETIME,
  notes TEXT,
  utilisateur_id INTEGER REFERENCES utilisateurs(id),
  statut TEXT DEFAULT 'valide' CHECK(statut IN ('valide','annule','impaye')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_paiements_client ON paiements_clients(client_id);

-- ==================== IMPUTATIONS PAIEMENTS ====================
CREATE TABLE IF NOT EXISTS imputations_paiements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paiement_id INTEGER NOT NULL REFERENCES paiements_clients(id) ON DELETE CASCADE,
  document_id INTEGER NOT NULL REFERENCES documents(id),
  montant_impute REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== MOUVEMENTS STOCK ====================
CREATE TABLE IF NOT EXISTS mouvements_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id),
  type_mouvement TEXT NOT NULL CHECK(type_mouvement IN ('entree','sortie','transfert','inventaire','correction','desassemblage','reassemblage')),
  quantite REAL NOT NULL,
  stock_avant REAL DEFAULT 0,
  stock_apres REAL DEFAULT 0,
  prix_unitaire REAL DEFAULT 0,
  document_id INTEGER REFERENCES documents(id),
  document_type TEXT,
  utilisateur_id INTEGER REFERENCES utilisateurs(id),
  motif TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mouvements_article ON mouvements_stock(article_id);
CREATE INDEX idx_mouvements_date ON mouvements_stock(created_at);

-- ==================== INVENTAIRE TOURNANT ====================
CREATE TABLE IF NOT EXISTS inventaire_tournant (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id),
  quantite_theorique REAL NOT NULL,
  quantite_reelle REAL NOT NULL,
  ecart REAL DEFAULT 0,
  date_comptage DATETIME DEFAULT CURRENT_TIMESTAMP,
  utilisateur_id INTEGER REFERENCES utilisateurs(id),
  valide INTEGER DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== GARANTIES & SAV ====================
CREATE TABLE IF NOT EXISTS garanties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER REFERENCES documents(id),
  article_id INTEGER NOT NULL REFERENCES articles(id),
  client_id INTEGER REFERENCES clients(id),
  date_debut DATETIME NOT NULL,
  date_fin DATETIME NOT NULL,
  duree_jours INTEGER,
  statut TEXT DEFAULT 'active' CHECK(statut IN ('active','expiree','cloture')),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==================== JOURNAL AUDIT ====================
CREATE TABLE IF NOT EXISTS journal_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  utilisateur_id INTEGER REFERENCES utilisateurs(id),
  action TEXT NOT NULL,
  entite TEXT NOT NULL,
  entite_id INTEGER,
  details TEXT,
  adresse_ip TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_date ON journal_audit(created_at);
CREATE INDEX idx_audit_entite ON journal_audit(entite);
CREATE INDEX idx_audit_utilisateur ON journal_audit(utilisateur_id);

-- ==================== NOTIFICATIONS ====================
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  utilisateur_id INTEGER REFERENCES utilisateurs(id),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  lien TEXT,
  lu INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user ON notifications(utilisateur_id);

-- ==================== DOC_COUNTERS (numérotation chronologique) ====================
CREATE TABLE IF NOT EXISTS doc_counters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type_document TEXT NOT NULL,
  jour TEXT NOT NULL,
  counter INTEGER DEFAULT 0,
  UNIQUE(type_document, jour)
);

-- ==================== TAUX TVA ====================
CREATE TABLE IF NOT EXISTS taux_tva (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  taux REAL NOT NULL UNIQUE,
  label TEXT NOT NULL,
  defaut INTEGER DEFAULT 0
);

-- ==================== DONNEES INITIALES ====================
INSERT OR IGNORE INTO taux_tva (id, taux, label, defaut) VALUES
  (1, 20.0, 'TVA 20%', 1),
  (2, 14.0, 'TVA 14%', 0),
  (3, 10.0, 'TVA 10%', 0),
  (4, 7.0, 'TVA 7%', 0),
  (5, 0.0, 'Exonéré', 0);

INSERT OR IGNORE INTO parametres (cle, valeur, type, section) VALUES
  ('societe_nom', 'Accessoires Tensift', 'text', 'societe'),
  ('societe_slogan', 'Votre partenaire automobile de confiance', 'text', 'societe'),
  ('societe_ice', '', 'text', 'societe'),
  ('societe_if', '', 'text', 'societe'),
  ('societe_rc', '', 'text', 'societe'),
  ('societe_cnss', '', 'text', 'societe'),
  ('societe_patente', '', 'text', 'societe'),
  ('societe_telephone', '', 'text', 'societe'),
  ('societe_email', '', 'text', 'societe'),
  ('societe_adresse', '', 'text', 'societe'),
  ('societe_ville', '', 'text', 'societe'),
  ('societe_banque', '', 'text', 'societe'),
  ('societe_rib', '', 'text', 'societe'),
  ('societe_logo', '', 'text', 'societe'),
  ('societe_logo_width', '180', 'text', 'societe'),
  ('societe_logo_position', 'gauche', 'text', 'societe'),
  ('societe_mentions', '', 'text', 'societe'),
  ('couleur_charte', '#1a3a5c', 'color', 'configuration'),
  ('devise', 'MAD', 'text', 'configuration'),
  ('delai_validite_devis', '30', 'number', 'configuration'),
  ('prefixe_devis', 'DEV-', 'text', 'numerotation'),
  ('prefixe_bon_commande_client', 'BCC-', 'text', 'numerotation'),
  ('prefixe_bon_livraison', 'BL-', 'text', 'numerotation'),
  ('prefixe_facture_client', 'FAC-', 'text', 'numerotation'),
  ('prefixe_avoir_client', 'AVOIR-', 'text', 'numerotation'),
  ('prefixe_demande_achat', 'DA-', 'text', 'numerotation'),
  ('prefixe_commande_fournisseur', 'CF-', 'text', 'numerotation'),
  ('prefixe_bon_reception', 'BR-', 'text', 'numerotation'),
  ('prefixe_facture_fournisseur', 'FAF-', 'text', 'numerotation'),
  ('seuil_alerte_stock', '10', 'number', 'alertes'),
  ('delai_relance_1', '30', 'number', 'alertes'),
  ('delai_relance_2', '60', 'number', 'alertes'),
  ('delai_contentieux', '90', 'number', 'alertes'),
  ('marge_minimale', '15', 'number', 'configuration');

-- Admin par défaut (mot de passe: admin123)
INSERT OR IGNORE INTO utilisateurs (nom, email, mot_de_passe, role)
  VALUES ('Administrateur', 'admin@tansift.ma', '$2b$10$8KzQMGnxjGX0JKwB3Hk4eO5X5X5X5X5X5X5X5X5X5X5X5X5X5e', 'Administrateur');

-- Catégories par défaut
INSERT OR IGNORE INTO categories (code, nom, taux_tva, garantie_jours) VALUES
  ('FREIN', 'Freinage', 20, 365),
  ('EMBR', 'Embrayage', 20, 365),
  ('SUSP', 'Suspension', 20, 365),
  ('FILT', 'Filtration', 20, 180),
  ('ELEC', 'Électricité', 20, 365),
  ('CARRO', 'Carrosserie', 20, 365),
  ('LUBR', 'Lubrifiants', 20, 0),
  ('PNEU', 'Pneumatiques', 20, 180),
  ('MOTEUR', 'Moteurs', 20, 730),
  ('ASSEM', 'Assemblage', 20, 365);
