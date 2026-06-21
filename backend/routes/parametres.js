const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, 'logo_societe' + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

module.exports = function(db) {
  // GET /api/parametres
  router.get('/', async (req, res) => {
    try {
      const params = await db.prepare(`SELECT * FROM parametres`).all();
      const result = {};
      for (const p of params) {
        result[p.cle] = p.valeur;
      }
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PUT /api/parametres
  router.put('/', async (req, res) => {
    try {
      const updates = req.body;
      await db.run('START TRANSACTION');
      try {
        for (const [cle, valeur] of Object.entries(updates)) {
          const existing = await db.prepare(`SELECT section FROM parametres WHERE cle = ?`).get(cle);
          await db.prepare(`INSERT OR REPLACE INTO parametres (cle, valeur, section) VALUES (?,?,?)`)
            .run(cle, String(valeur), existing ? existing.section : 'general');
        }
        await db.run('COMMIT');
      } catch (txError) {
        await db.run('ROLLBACK');
        throw txError;
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/parametres/utilisateurs
  router.get('/utilisateurs', async (req, res) => {
    try {
      res.json(await db.prepare(`SELECT id, nom, email, role, telephone, actif, theme, created_at FROM utilisateurs ORDER BY nom`).all());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/parametres/utilisateurs
  router.post('/utilisateurs', async (req, res) => {
    try {
      const { nom, email, mot_de_passe, role, telephone } = req.body;
      if (!nom || !email || !mot_de_passe) return res.status(400).json({ error: 'Nom, email et mot de passe requis' });
      const existing = await db.prepare(`SELECT id FROM utilisateurs WHERE email = ?`).get(email);
      if (existing) return res.status(400).json({ error: 'Cet email est déjà utilisé' });
      const hash = bcrypt.hashSync(mot_de_passe, 10);
      const result = await db.prepare(`INSERT INTO utilisateurs (nom, email, mot_de_passe, role, telephone) VALUES (?,?,?,?,?)`)
        .run(nom, email, hash, role || 'Commercial', telephone);
      res.status(201).json({ id: result.lastInsertRowid });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PUT /api/parametres/utilisateurs/:id
  router.put('/utilisateurs/:id', async (req, res) => {
    try {
      const { nom, email, role, telephone, actif } = req.body;
      await db.prepare(`UPDATE utilisateurs SET nom=?, email=?, role=?, telephone=?, actif=? WHERE id=?`)
        .run(nom, email, role, telephone, actif !== undefined ? actif : 1, req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PUT /api/parametres/utilisateurs/:id/password
  router.put('/utilisateurs/:id/password', async (req, res) => {
    try {
      const { mot_de_passe } = req.body;
      if (!mot_de_passe || mot_de_passe.length < 4) return res.status(400).json({ error: 'Mot de passe trop court' });
      const hash = bcrypt.hashSync(mot_de_passe, 10);
      await db.prepare(`UPDATE utilisateurs SET mot_de_passe = ? WHERE id = ?`).run(hash, req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/parametres/sauvegarder
  router.post('/sauvegarder', (req, res) => {
    const { DB_PATH } = require('../database/init');
    const fs = require('fs');
    const path = require('path');
    const backupName = `tansift-backup-${new Date().toISOString().slice(0,10)}.db`;
    const backupPath = path.join(__dirname, '..', '..', 'backups', backupName);
    if (!fs.existsSync(path.dirname(backupPath))) fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(DB_PATH, backupPath);
    res.json({ chemin: backupPath, nom: backupName });
  });

  // POST /api/parametres/restaurer
  router.post('/restaurer', (req, res) => {
    const { chemin } = req.body;
    if (!chemin) return res.status(400).json({ error: 'Chemin du fichier requis' });
    const fs = require('fs');
    if (!fs.existsSync(chemin)) return res.status(400).json({ error: 'Fichier introuvable' });
    const { DB_PATH } = require('../database/init');
    fs.copyFileSync(chemin, DB_PATH);
    res.json({ success: true });
  });

  // POST /api/parametres/logo - upload company logo
  router.post('/logo', upload.single('logo'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' });
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Format non supporté (PNG, JPG, GIF, WEBP, SVG)' });
    }
    res.json({ url: `/uploads/logo_societe${ext}`, filename: `logo_societe${ext}` });
  });

  // DELETE /api/parametres/logo - remove company logo
  router.delete('/logo', (req, res) => {
    const files = fs.readdirSync(uploadsDir).filter(f => f.startsWith('logo_societe'));
    files.forEach(f => {
      const p = path.join(uploadsDir, f);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });
    res.json({ success: true });
  });

  // GET /api/parametres/export-zip
  router.get('/export-zip', (req, res) => {
    const archiver = require('archiver');
    const { DB_PATH } = require('../database/init');
    const zip = archiver('zip');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=tansift-complete-${new Date().toISOString().slice(0,10)}.zip`);
    zip.pipe(res);
    zip.file(DB_PATH, { name: 'database/tansift.db' });
    const uploadsPath = require('path').join(__dirname, '..', '..', 'uploads');
    if (require('fs').existsSync(uploadsPath)) {
      zip.directory(uploadsPath, 'uploads');
    }
    zip.finalize();
  });

  return router;
};
