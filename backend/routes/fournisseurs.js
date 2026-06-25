const express = require('express');
const router = express.Router();
const { auditLog, generateSequentialCode } = require('../utils/helpers');

module.exports = function(db) {
  router.get('/', async (req, res) => {
    try {
      const { search, page = 1, limit = 50 } = req.query;
      let sql = `SELECT * FROM fournisseurs WHERE actif = 1`;
      const params = [];
      if (search) { sql += ` AND (raison_sociale LIKE ? OR code_fournisseur LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
      const total = await db.prepare(`SELECT COUNT(*) as total FROM (${sql}) AS _sub`).get(...params);
      const offset = (parseInt(page) - 1) * parseInt(limit);
      sql += ` ORDER BY raison_sociale LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), offset);
      res.json({ fournisseurs: await db.prepare(sql).all(...params), total: total.total });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const fournisseur = await db.prepare(`SELECT * FROM fournisseurs WHERE id = ?`).get(req.params.id);
      if (!fournisseur) return res.status(404).json({ error: 'Fournisseur introuvable' });
      res.json(fournisseur);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const { raison_sociale, telephone, email, adresse, ville, ice, if_fiscal, rc, delai_livraison_jours, banque, rib, conditions_paiement } = req.body;
      if (!raison_sociale) return res.status(400).json({ error: 'Raison sociale requise' });

      const code = await generateSequentialCode(db, 'fournisseurs', 'code_fournisseur', 'FR-4411');
      const result = await db.prepare(`INSERT INTO fournisseurs (code_fournisseur, raison_sociale, telephone, email, adresse, ville, ice, if_fiscal, rc, delai_livraison_jours, banque, rib, conditions_paiement) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(code, raison_sociale, telephone, email, adresse, ville, ice, if_fiscal, rc, delai_livraison_jours || 15, banque, rib, conditions_paiement || '60 jours');
      res.status(201).json({ id: result.lastInsertRowid, code_fournisseur: code });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      const existing = await db.prepare(`SELECT * FROM fournisseurs WHERE id = ?`).get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Fournisseur introuvable' });
      const { raison_sociale, telephone, email, adresse, ville, ice, rc, delai_livraison_jours, banque, rib, evaluation } = req.body;
      await db.prepare(`UPDATE fournisseurs SET raison_sociale=?, telephone=?, email=?, adresse=?, ville=?, ice=?, rc=?, delai_livraison_jours=?, banque=?, rib=?, evaluation=? WHERE id=?`)
        .run(raison_sociale || existing.raison_sociale, telephone || existing.telephone, email || existing.email, adresse || existing.adresse, ville || existing.ville, ice || existing.ice, rc || existing.rc, delai_livraison_jours || existing.delai_livraison_jours, banque || existing.banque, rib || existing.rib, evaluation !== undefined ? evaluation : existing.evaluation, req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/fournisseurs/:id
  router.delete('/:id', async (req, res) => {
    try {
      const frn = await db.prepare(`SELECT id FROM fournisseurs WHERE id = ?`).get(req.params.id);
      if (!frn) return res.status(404).json({ error: 'Fournisseur introuvable' });
      await db.prepare(`UPDATE documents SET fournisseur_id = NULL WHERE fournisseur_id = ?`).run(frn.id);
      await db.prepare(`DELETE FROM fournisseurs WHERE id = ?`).run(frn.id);
      res.json({ success: true });
    } catch (e) {
      console.error('Erreur suppression fournisseur:', e.message || e);
      res.status(500).json({ error: e.message || 'Erreur lors de la suppression' });
    }
  });

  return router;
};
