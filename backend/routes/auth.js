const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { generateToken } = require('../middleware/auth');

module.exports = function(db) {
  router.post('/login', (req, res) => {
    const { email, mot_de_passe } = req.body;
    if (!email || !mot_de_passe) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }
    const user = db.prepare(`SELECT * FROM utilisateurs WHERE email = ? AND actif = 1`).get(email);
    if (!user) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    if (!bcrypt.compareSync(mot_de_passe, user.mot_de_passe)) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    const token = generateToken(user);
    res.json({
      token,
      user: { id: user.id, nom: user.nom, email: user.email, role: user.role, theme: user.theme }
    });
  });

  router.get('/me', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Non authentifié' });
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, require('../middleware/auth').JWT_SECRET);
      const user = db.prepare(`SELECT id, nom, email, role, theme, telephone FROM utilisateurs WHERE id = ?`).get(decoded.id);
      if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
      res.json(user);
    } catch {
      res.status(403).json({ error: 'Token invalide' });
    }
  });

  return router;
};
