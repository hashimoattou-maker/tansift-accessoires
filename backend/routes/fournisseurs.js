const express = require('express');
const router = express.Router();
const { auditLog } = require('../utils/helpers');

module.exports = function(db) {
  router.get('/', (req, res) => {
    const { search, page = 1, limit = 50 } = req.query;
    let sql = `SELECT * FROM fournisseurs WHERE actif = 1`;
    const params = [];
    if (search) { sql += ` AND (raison_sociale LIKE ? OR code_fournisseur LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
    const total = db.prepare(`SELECT COUNT(*) as total FROM (${sql})`).get(...params);
    const offset = (parseInt(page) - 1) * parseInt(limit);
    sql += ` ORDER BY raison_sociale LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    res.json({ fournisseurs: db.prepare(sql).all(...params), total: total.total });
  });

  router.get('/:id', (req, res) => {
    const fournisseur = db.prepare(`SELECT * FROM fournisseurs WHERE id = ?`).get(req.params.id);
    if (!fournisseur) return res.status(404).json({ error: 'Fournisseur introuvable' });
    res.json(fournisseur);
  });

  router.post('/', (req, res) => {
    const { raison_sociale, telephone, email, adresse, ville, ice, if_fiscal, rc, delai_livraison_jours, banque, rib, conditions_paiement } = req.body;
    if (!raison_sociale) return res.status(400).json({ error: 'Raison sociale requise' });
    const last = db.prepare(`SELECT code_fournisseur FROM fournisseurs ORDER BY id DESC LIMIT 1`).get();
    let nextNum = 1;
    if (last && last.code_fournisseur && last.code_fournisseur.startsWith('FR-4411')) {
      nextNum = parseInt(last.code_fournisseur.slice(-4)) + 1;
    } else {
      const count = db.prepare(`SELECT COUNT(*) as cnt FROM fournisseurs`).get();
      nextNum = (count?.cnt || 0) + 1;
    }
    const code = `FR-4411${String(nextNum).padStart(4, '0')}`;
    const result = db.prepare(`INSERT INTO fournisseurs (code_fournisseur, raison_sociale, telephone, email, adresse, ville, ice, if_fiscal, rc, delai_livraison_jours, banque, rib, conditions_paiement) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(code, raison_sociale, telephone, email, adresse, ville, ice, if_fiscal, rc, delai_livraison_jours || 15, banque, rib, conditions_paiement || '60 jours');
    res.status(201).json({ id: result.lastInsertRowid, code_fournisseur: code });
  });

  router.put('/:id', (req, res) => {
    const existing = db.prepare(`SELECT * FROM fournisseurs WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Fournisseur introuvable' });
    const { raison_sociale, telephone, email, adresse, ville, ice, rc, delai_livraison_jours, banque, rib, evaluation } = req.body;
    db.prepare(`UPDATE fournisseurs SET raison_sociale=?, telephone=?, email=?, adresse=?, ville=?, ice=?, rc=?, delai_livraison_jours=?, banque=?, rib=?, evaluation=? WHERE id=?`)
      .run(raison_sociale || existing.raison_sociale, telephone || existing.telephone, email || existing.email, adresse || existing.adresse, ville || existing.ville, ice || existing.ice, rc || existing.rc, delai_livraison_jours || existing.delai_livraison_jours, banque || existing.banque, rib || existing.rib, evaluation !== undefined ? evaluation : existing.evaluation, req.params.id);
    res.json({ success: true });
  });

  // DELETE /api/fournisseurs/:id
  router.delete('/:id', (req, res) => {
    try {
      const frn = db.prepare(`SELECT id FROM fournisseurs WHERE id = ?`).get(req.params.id);
      if (!frn) return res.status(404).json({ error: 'Fournisseur introuvable' });
      db.prepare(`UPDATE fournisseurs SET actif = 0 WHERE id = ?`).run(req.params.id);
      auditLog(db, req.user?.id, 'SUPPRESSION', 'fournisseur', req.params.id, {});
      res.json({ success: true });
    } catch (e) {
      console.error('Erreur suppression fournisseur:', e);
      res.status(500).json({ error: 'Erreur lors de la suppression' });
    }
  });

  return router;
};
