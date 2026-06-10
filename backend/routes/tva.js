const express = require('express');
const router = express.Router();

module.exports = function(db) {
  router.get('/', (req, res) => {
    res.json(db.prepare(`SELECT * FROM taux_tva ORDER BY taux`).all());
  });

  return router;
};
