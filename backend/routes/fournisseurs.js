const express = require('express');
const router = express.Router();
const { auditLog } = require('../utils/helpers');

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
      const allCodes = await db.prepare(`SELECT code_fournisseur FROM fournisseurs WHERE code_fournisseur LIKE 'FR-4411%'`).all();
      let maxNum = 0;
      for (const row of allCodes) {
        const num = parseInt(row.code_fournisseur.replace('FR-4411', ''), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
      let code;
      do {
        maxNum++;
        code = `FR-4411${String(maxNum).padStart(4, '0')}`;
      } while (await db.prepare(`SELECT 1 FROM fournisseurs WHERE code_fournisseur = ?`).get(code));
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
      await db.prepare(`UPDATE fournisseurs SET actif = 0 WHERE id = ?`).run(req.params.id);
      await auditLog(db, req.user?.id, 'SUPPRESSION', 'fournisseur', req.params.id, {});
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
