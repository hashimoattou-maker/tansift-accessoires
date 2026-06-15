const express = require('express');
const router = express.Router();
const { auditLog } = require('../utils/helpers');

module.exports = function(db) {
  // GET /api/articles
  router.get('/', (req, res) => {
    const { search, categorie_id, type, actif, page = 1, limit = 50 } = req.query;
    let sql = `SELECT a.*, c.nom as categorie_nom, c.code as categorie_code, t.taux as taux_tva_value
               FROM articles a LEFT JOIN categories c ON a.categorie_id = c.id LEFT JOIN taux_tva t ON a.tva_id = t.id WHERE 1=1`;
    const params = [];

    if (search) { sql += ` AND (a.reference LIKE ? OR a.designation LIKE ? OR a.code_barre LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (categorie_id) { sql += ` AND a.categorie_id = ?`; params.push(categorie_id); }
    if (type) { sql += ` AND a.type_article = ?`; params.push(type); }
    if (actif !== undefined) { sql += ` AND a.actif = ?`; params.push(actif); }
    else { sql += ` AND a.actif = 1`; }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const total = db.prepare(`SELECT COUNT(*) as total FROM (${sql})`).get(...params);
    sql += ` ORDER BY a.reference LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const articles = db.prepare(sql).all(...params);
    res.json({ articles, total: total.total, page: parseInt(page), limit: parseInt(limit) });
  });

  // GET /api/articles/:id
  router.get('/:id', (req, res) => {
    const article = db.prepare(`SELECT a.*, c.nom as categorie_nom FROM articles a LEFT JOIN categories c ON a.categorie_id = c.id WHERE a.id = ?`).get(req.params.id);
    if (!article) return res.status(404).json({ error: 'Article introuvable' });
    article.photos = db.prepare(`SELECT * FROM articles_photos WHERE article_id = ? ORDER BY ordre`).all(req.params.id);
    article.references = db.prepare(`SELECT * FROM articles_references WHERE article_id = ?`).all(req.params.id);
    article.compatibilites = db.prepare(`SELECT * FROM articles_compatibilites WHERE article_id = ?`).all(req.params.id);
    if (article.est_moteur) {
      article.nomenclature = db.prepare(`SELECT n.*, a.reference, a.designation FROM nomenclature_moteur n JOIN articles a ON n.composant_id = a.id WHERE n.moteur_id = ?`).all(req.params.id);
    }
    res.json(article);
  });

  // POST /api/articles
  router.post('/', (req, res) => {
    const { reference, designation, categorie_id, type_article, prix_achat_ht, prix_vente_ht, tva_id, stock_min, stock_max, emplacement, poids, volume, description, est_moteur, stock_actuel } = req.body;
    if (!reference || !designation) return res.status(400).json({ error: 'Référence et désignation requises' });

    const existing = db.prepare(`SELECT id FROM articles WHERE reference = ?`).get(reference);
    if (existing) return res.status(400).json({ error: 'Cette référence existe déjà' });

    const result = db.prepare(`INSERT INTO articles (reference, designation, description, categorie_id, type_article, prix_achat_ht, prix_vente_ht, tva_id, stock_min, stock_max, emplacement, poids, volume, est_moteur, stock_actuel) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(reference, designation, description, categorie_id || null, type_article || 'accessoire', prix_achat_ht || 0, prix_vente_ht || 0, tva_id || 1, stock_min || 0, stock_max || 0, emplacement || null, poids || null, volume || null, est_moteur ? 1 : 0, stock_actuel || 0);

    auditLog(db, req.user?.id, 'CREATION', 'article', result.lastInsertRowid, { reference, designation });
    res.status(201).json({ id: result.lastInsertRowid, reference, designation });
  });

  // PUT /api/articles/:id
  router.put('/:id', (req, res) => {
    const article = db.prepare(`SELECT * FROM articles WHERE id = ?`).get(req.params.id);
    if (!article) return res.status(404).json({ error: 'Article introuvable' });

    const { reference, designation, categorie_id, type_article, prix_achat_ht, prix_vente_ht, tva_id, stock_min, stock_max, emplacement, poids, volume, description, actif, est_moteur, moteur_complet, stock_actuel } = req.body;
    db.prepare(`UPDATE articles SET reference=?, designation=?, description=?, categorie_id=?, type_article=?, prix_achat_ht=?, prix_vente_ht=?, tva_id=?, stock_min=?, stock_max=?, emplacement=?, poids=?, volume=?, actif=?, est_moteur=?, moteur_complet=?, stock_actuel=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(reference || article.reference, designation || article.designation, description !== undefined ? description : article.description, categorie_id || article.categorie_id, type_article || article.type_article, prix_achat_ht !== undefined ? prix_achat_ht : article.prix_achat_ht, prix_vente_ht !== undefined ? prix_vente_ht : article.prix_vente_ht, tva_id || article.tva_id, stock_min !== undefined ? stock_min : article.stock_min, stock_max !== undefined ? stock_max : article.stock_max, emplacement !== undefined ? emplacement : article.emplacement, poids !== undefined ? poids : article.poids, volume !== undefined ? volume : article.volume, actif !== undefined ? actif : article.actif, est_moteur !== undefined ? (est_moteur ? 1 : 0) : article.est_moteur, moteur_complet !== undefined ? (moteur_complet ? 1 : 0) : article.moteur_complet, stock_actuel !== undefined ? stock_actuel : article.stock_actuel, req.params.id);

    auditLog(db, req.user?.id, 'MODIFICATION', 'article', req.params.id, req.body);
    res.json({ success: true });
  });

  // DELETE /api/articles/:id
  router.delete('/:id', (req, res) => {
    try {
      const article = db.prepare(`SELECT id FROM articles WHERE id = ?`).get(req.params.id);
      if (!article) return res.status(404).json({ error: 'Article introuvable' });
      db.prepare(`UPDATE articles SET actif = 0 WHERE id = ?`).run(req.params.id);
      auditLog(db, req.user?.id, 'SUPPRESSION', 'article', req.params.id, {});
      res.json({ success: true });
    } catch (e) {
      console.error('Erreur suppression article:', e);
      res.status(500).json({ error: 'Erreur lors de la suppression' });
    }
  });

  // POST /api/articles/:id/compatibilite
  router.post('/:id/compatibilite', (req, res) => {
    const { marque, modele, motorisation, annee_debut, annee_fin } = req.body;
    const result = db.prepare(`INSERT INTO articles_compatibilites (article_id, marque, modele, motorisation, annee_debut, annee_fin) VALUES (?,?,?,?,?,?)`)
      .run(req.params.id, marque, modele, motorisation, annee_debut, annee_fin);
    res.status(201).json({ id: result.lastInsertRowid });
  });

  // POST /api/articles/:id/reference
  router.post('/:id/reference', (req, res) => {
    const { type_reference, code, nom_fournisseur } = req.body;
    const result = db.prepare(`INSERT INTO articles_references (article_id, type_reference, code, nom_fournisseur) VALUES (?,?,?,?)`)
      .run(req.params.id, type_reference, code, nom_fournisseur);
    res.status(201).json({ id: result.lastInsertRowid });
  });

  return router;
};
