const express = require('express');
const router = express.Router();

module.exports = function(db) {
  router.get('/', async (req, res) => {
    try {
      res.json(await db.prepare(`SELECT * FROM categories ORDER BY code`).all());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const { code, nom, description, parent_id, taux_tva, type_article, garantie_jours } = req.body;
      if (!code || !nom) return res.status(400).json({ error: 'Code et nom requis' });
      const result = await db.prepare(`INSERT INTO categories (code, nom, description, parent_id, taux_tva, type_article, garantie_jours) VALUES (?,?,?,?,?,?,?)`)
        .run(code, nom, description, parent_id || null, taux_tva || 20, type_article || 'accessoire', garantie_jours || 0);
      res.status(201).json({ id: result.lastInsertRowid });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      const { code, nom, description, taux_tva, type_article, garantie_jours } = req.body;
      await db.prepare(`UPDATE categories SET code=?, nom=?, description=?, taux_tva=?, type_article=?, garantie_jours=? WHERE id=?`)
        .run(code, nom, description, taux_tva, type_article, garantie_jours, req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
