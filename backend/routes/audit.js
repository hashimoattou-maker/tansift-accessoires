const express = require('express');
const router = express.Router();
const { auditLog } = require('../utils/helpers');

module.exports = function(db) {
  router.get('/', (req, res) => {
    const { page = 1, limit = 50, entite } = req.query;
    let sql = `SELECT j.*, u.nom as utilisateur_nom FROM journal_audit j LEFT JOIN utilisateurs u ON j.utilisateur_id = u.id WHERE 1=1`;
    const params = [];
    if (entite) { sql += ` AND j.entite = ?`; params.push(entite); }
    const total = db.prepare(`SELECT COUNT(*) as total FROM (${sql})`).get(...params);
    const offset = (parseInt(page) - 1) * parseInt(limit);
    sql += ` ORDER BY j.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    res.json({ audits: db.prepare(sql).all(...params), total: total.total });
  });

  return router;
};
