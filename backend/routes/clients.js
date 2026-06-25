const express = require('express');
const router = express.Router();
const { updateClientSolde, auditLog, generateDocumentNumber, generateSequentialCode } = require('../utils/helpers');

module.exports = function(db) {
  // GET /api/clients
  router.get('/', async (req, res) => {
    try {
      const { search, type, page = 1, limit = 50 } = req.query;
      let sql = `SELECT * FROM clients WHERE actif = 1`;
      const params = [];
      if (search) { sql += ` AND (raison_sociale LIKE ? OR code_client LIKE ? OR telephone LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
      if (type) { sql += ` AND type_client = ?`; params.push(type); }

      const total = await db.prepare(`SELECT COUNT(*) as total FROM (${sql}) AS _sub`).get(...params);
      const offset = (parseInt(page) - 1) * parseInt(limit);
      sql += ` ORDER BY raison_sociale LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), offset);

      res.json({ clients: await db.prepare(sql).all(...params), total: total.total, page: parseInt(page) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/clients/:id
  router.get('/:id', async (req, res) => {
    try {
      const client = await db.prepare(`SELECT * FROM clients WHERE id = ?`).get(req.params.id);
      if (!client) return res.status(404).json({ error: 'Client introuvable' });
      client.vehicules = await db.prepare(`SELECT * FROM vehicules_clients WHERE client_id = ?`).all(req.params.id);
      client.documents = await db.prepare(`SELECT id, type_document, numero, date_document, montant_ttc, net_a_payer, statut FROM documents WHERE client_id = ? ORDER BY date_document DESC LIMIT 20`).all(req.params.id);
      client.paiements = await db.prepare(`SELECT * FROM paiements_clients WHERE client_id = ? ORDER BY date_paiement DESC LIMIT 20`).all(req.params.id);
      res.json(client);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/clients
  router.post('/', async (req, res) => {
    try {
      const { type_client, raison_sociale, telephone, email, adresse, ville, ice, if_fiscal, rc, cnss, patente, conditions_paiement, plafond_credit, remise_defaut, note } = req.body;
      if (!raison_sociale) return res.status(400).json({ error: 'Raison sociale requise' });

      const code = await generateSequentialCode(db, 'clients', 'code_client', 'CLT-3421');
      const result = await db.prepare(`INSERT INTO clients (code_client, type_client, raison_sociale, telephone, email, adresse, ville, ice, if_fiscal, rc, cnss, patente, conditions_paiement, plafond_credit, remise_defaut, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(code, type_client || 'Particulier', raison_sociale, telephone, email, adresse, ville, ice, if_fiscal, rc, cnss, patente, conditions_paiement || '30 jours', plafond_credit || 0, remise_defaut || 0, note);

      await auditLog(db, req.user?.id, 'CREATION', 'client', result.lastInsertRowid, { code, raison_sociale });
      res.status(201).json({ id: result.lastInsertRowid, code_client: code });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PUT /api/clients/:id
  router.put('/:id', async (req, res) => {
    try {
      const existing = await db.prepare(`SELECT * FROM clients WHERE id = ?`).get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Client introuvable' });

      const { raison_sociale, telephone, email, adresse, ville, ice, if_fiscal, rc, cnss, patente, conditions_paiement, plafond_credit, remise_defaut, note, actif } = req.body;
      await db.prepare(`UPDATE clients SET raison_sociale=?, telephone=?, email=?, adresse=?, ville=?, ice=?, if_fiscal=?, rc=?, cnss=?, patente=?, conditions_paiement=?, plafond_credit=?, remise_defaut=?, note=?, actif=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(raison_sociale || existing.raison_sociale, telephone || existing.telephone, email || existing.email, adresse || existing.adresse, ville || existing.ville, ice || existing.ice, if_fiscal || existing.if_fiscal, rc || existing.rc, cnss || existing.cnss, patente || existing.patente, conditions_paiement || existing.conditions_paiement, plafond_credit !== undefined ? plafond_credit : existing.plafond_credit, remise_defaut !== undefined ? remise_defaut : existing.remise_defaut, note !== undefined ? note : existing.note, actif !== undefined ? actif : existing.actif, req.params.id);

      await auditLog(db, req.user?.id, 'MODIFICATION', 'client', req.params.id, {});
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/clients/:id
  router.delete('/:id', async (req, res) => {
    try {
      const client = await db.prepare(`SELECT id FROM clients WHERE id = ?`).get(req.params.id);
      if (!client) return res.status(404).json({ error: 'Client introuvable' });
      await db.prepare(`UPDATE clients SET actif = 0 WHERE id = ?`).run(req.params.id);
      await auditLog(db, req.user?.id, 'SUPPRESSION', 'client', req.params.id, {});
      res.json({ success: true });
    } catch (e) {
      console.error('Erreur suppression client:', e);
      res.status(500).json({ error: 'Erreur lors de la suppression' });
    }
  });

  // POST /api/clients/:id/vehicule
  router.post('/:id/vehicule', async (req, res) => {
    try {
      const { immatriculation, vin, marque, modele, motorisation, annee, couleur } = req.body;
      const result = await db.prepare(`INSERT INTO vehicules_clients (client_id, immatriculation, vin, marque, modele, motorisation, annee, couleur) VALUES (?,?,?,?,?,?,?,?)`)
        .run(req.params.id, immatriculation, vin, marque, modele, motorisation, annee, couleur);
      res.status(201).json({ id: result.lastInsertRowid });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};