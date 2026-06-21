const express = require('express');
const router = express.Router();
const { updateArticleStock, auditLog } = require('../utils/helpers');

module.exports = function(db) {
  // GET /api/stock/mouvements
  router.get('/mouvements', async (req, res) => {
    try {
      const { article_id, type, page = 1, limit = 50 } = req.query;
      let sql = `SELECT m.*, a.reference, a.designation, u.nom as utilisateur_nom FROM mouvements_stock m LEFT JOIN articles a ON m.article_id = a.id LEFT JOIN utilisateurs u ON m.utilisateur_id = u.id WHERE 1=1`;
      const params = [];
      if (article_id) { sql += ` AND m.article_id = ?`; params.push(article_id); }
      if (type) { sql += ` AND m.type_mouvement = ?`; params.push(type); }
      const total = await db.prepare(`SELECT COUNT(*) as total FROM (${sql}) AS _sub`).get(...params);
      const offset = (parseInt(page) - 1) * parseInt(limit);
      sql += ` ORDER BY m.created_at DESC LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), offset);
      res.json({ mouvements: await db.prepare(sql).all(...params), total: total.total });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/stock/inventaire
  router.post('/inventaire', async (req, res) => {
    try {
      const { article_id, quantite_reelle, notes } = req.body;
      if (!article_id || quantite_reelle === undefined) return res.status(400).json({ error: 'Article et quantité requis' });

      const article = await db.prepare(`SELECT * FROM articles WHERE id = ?`).get(article_id);
      if (!article) return res.status(404).json({ error: 'Article introuvable' });

      const ecart = quantite_reelle - article.stock_actuel;
      const result = await db.prepare(`INSERT INTO inventaire_tournant (article_id, quantite_theorique, quantite_reelle, ecart, utilisateur_id, notes) VALUES (?,?,?,?,?,?)`)
        .run(article_id, article.stock_actuel, quantite_reelle, ecart, req.user?.id, notes);

      if (ecart !== 0) {
        await db.prepare(`INSERT INTO mouvements_stock (article_id, type_mouvement, quantite, stock_avant, stock_apres, utilisateur_id, motif) VALUES (?,?,?,?,?,?,?)`)
          .run(article_id, 'inventaire', ecart, article.stock_actuel, quantite_reelle, req.user?.id, `Correction inventaire: ${ecart > 0 ? '+' : ''}${ecart}`);
        await db.prepare(`UPDATE articles SET stock_actuel = ? WHERE id = ?`).run(quantite_reelle, article_id);
      }

      await auditLog(db, req.user?.id, 'INVENTAIRE', 'article', article_id, { theorique: article.stock_actuel, reel: quantite_reelle, ecart });
      res.status(201).json({ id: result.lastInsertRowid, ecart });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/stock/entree
  router.post('/entree', async (req, res) => {
    try {
      const { article_id, quantite, prix_unitaire, motif } = req.body;
      if (!article_id || !quantite) return res.status(400).json({ error: 'Article et quantité requis' });
      const article = await db.prepare(`SELECT * FROM articles WHERE id = ?`).get(article_id);
      if (!article) return res.status(404).json({ error: 'Article introuvable' });

      const stockApres = article.stock_actuel + quantite;
      await db.prepare(`INSERT INTO mouvements_stock (article_id, type_mouvement, quantite, stock_avant, stock_apres, prix_unitaire, utilisateur_id, motif) VALUES (?,?,?,?,?,?,?,?)`)
        .run(article_id, 'entree', quantite, article.stock_actuel, stockApres, prix_unitaire || 0, req.user?.id, motif || 'Entrée manuelle');
      await db.prepare(`UPDATE articles SET stock_actuel = ? WHERE id = ?`).run(stockApres, article_id);
      res.json({ success: true, stock_apres: stockApres });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/stock/sortie
  router.post('/sortie', async (req, res) => {
    try {
      const { article_id, quantite, prix_unitaire, motif } = req.body;
      if (!article_id || !quantite) return res.status(400).json({ error: 'Article et quantité requis' });
      const article = await db.prepare(`SELECT * FROM articles WHERE id = ?`).get(article_id);
      if (!article) return res.status(400).json({ error: 'Article introuvable' });
      if (article.stock_actuel < quantite) return res.status(400).json({ error: 'Stock insuffisant' });

      const stockApres = article.stock_actuel - quantite;
      await db.prepare(`INSERT INTO mouvements_stock (article_id, type_mouvement, quantite, stock_avant, stock_apres, prix_unitaire, utilisateur_id, motif) VALUES (?,?,?,?,?,?,?,?)`)
        .run(article_id, 'sortie', quantite, article.stock_actuel, stockApres, prix_unitaire || 0, req.user?.id, motif || 'Sortie manuelle');
      await db.prepare(`UPDATE articles SET stock_actuel = ? WHERE id = ?`).run(stockApres, article_id);
      res.json({ success: true, stock_apres: stockApres });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
