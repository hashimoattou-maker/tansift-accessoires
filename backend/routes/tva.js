const express = require('express');
const router = express.Router();

module.exports = function(db) {
  router.get('/', async (req, res) => {
    try {
      const data = await db.prepare(`SELECT * FROM taux_tva ORDER BY taux`).all();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};