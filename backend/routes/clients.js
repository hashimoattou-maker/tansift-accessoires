const express = require('express');
const router = express.Router();
const { updateClientSolde, auditLog, generateDocumentNumber } = require('../utils/helpers');

module.exports = function(db) {
  // GET /api/clients
  router.get('/', (req, res) => {
    const { search, type, page = 1, limit = 50 } = req.query;
    let sql = `SELECT * FROM clients WHERE actif = 1`;
    const params = [];
    if (search) { sql += ` AND (raison_sociale LIKE ? OR code_client LIKE ? OR telephone LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (type) { sql += ` AND type_client = ?`; params.push(type); }

    const total = db.prepare(`SELECT COUNT(*) as total FROM (${sql})`).get(...params);
    const offset = (parseInt(page) - 1) * parseInt(limit);
    sql += ` ORDER BY raison_sociale LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    res.json({ clients: db.prepare(sql).all(...params), total: total.total, page: parseInt(page) });
  });

  // GET /api/clients/:id
  router.get('/:id', (req, res) => {
    const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client introuvable' });
    client.vehicules = db.prepare(`SELECT * FROM vehicules_clients WHERE client_id = ?`).all(req.params.id);
    client.documents = db.prepare(`SELECT id, type_document, numero, date_document, montant_ttc, net_a_payer, statut FROM documents WHERE client_id = ? ORDER BY date_document DESC LIMIT 20`).all(req.params.id);
    client.paiements = db.prepare(`SELECT * FROM paiements_clients WHERE client_id = ? ORDER BY date_paiement DESC LIMIT 20`).all(req.params.id);
    res.json(client);
  });

  // POST /api/clients
  router.post('/', (req, res) => {
    const { type_client, raison_sociale, telephone, email, adresse, ville, ice, if_fiscal, rc, cnss, patente, conditions_paiement, plafond_credit, remise_defaut, note } = req.body;
    if (!raison_sociale) return res.status(400).json({ error: 'Raison sociale requise' });

    const last = db.prepare(`SELECT code_client FROM clients ORDER BY id DESC LIMIT 1`).get();
    let nextNum = 1;
    if (last && last.code_client && last.code_client.startsWith('CLT-3421')) {
      nextNum = parseInt(last.code_client.slice(-4)) + 1;
    } else {
      const count = db.prepare(`SELECT COUNT(*) as cnt FROM clients`).get();
      nextNum = (count?.cnt || 0) + 1;
    }
    const code = `CLT-3421${String(nextNum).padStart(4, '0')}`;
    const result = db.prepare(`INSERT INTO clients (code_client, type_client, raison_sociale, telephone, email, adresse, ville, ice, if_fiscal, rc, cnss, patente, conditions_paiement, plafond_credit, remise_defaut, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(code, type_client || 'Particulier', raison_sociale, telephone, email, adresse, ville, ice, if_fiscal, rc, cnss, patente, conditions_paiement || '30 jours', plafond_credit || 0, remise_defaut || 0, note);

    auditLog(db, req.user?.id, 'CREATION', 'client', result.lastInsertRowid, { code, raison_sociale });
    res.status(201).json({ id: result.lastInsertRowid, code_client: code });
  });

  // PUT /api/clients/:id
  router.put('/:id', (req, res) => {
    const existing = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });

    const { raison_sociale, telephone, email, adresse, ville, ice, if_fiscal, rc, cnss, patente, conditions_paiement, plafond_credit, remise_defaut, note, actif } = req.body;
    db.prepare(`UPDATE clients SET raison_sociale=?, telephone=?, email=?, adresse=?, ville=?, ice=?, if_fiscal=?, rc=?, cnss=?, patente=?, conditions_paiement=?, plafond_credit=?, remise_defaut=?, note=?, actif=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(raison_sociale || existing.raison_sociale, telephone || existing.telephone, email || existing.email, adresse || existing.adresse, ville || existing.ville, ice || existing.ice, if_fiscal || existing.if_fiscal, rc || existing.rc, cnss || existing.cnss, patente || existing.patente, conditions_paiement || existing.conditions_paiement, plafond_credit !== undefined ? plafond_credit : existing.plafond_credit, remise_defaut !== undefined ? remise_defaut : existing.remise_defaut, note !== undefined ? note : existing.note, actif !== undefined ? actif : existing.actif, req.params.id);

    auditLog(db, req.user?.id, 'MODIFICATION', 'client', req.params.id, {});
    res.json({ success: true });
  });

  // DELETE /api/clients/:id
  router.delete('/:id', (req, res) => {
    try {
      const client = db.prepare(`SELECT id FROM clients WHERE id = ?`).get(req.params.id);
      if (!client) return res.status(404).json({ error: 'Client introuvable' });
      db.prepare(`UPDATE clients SET actif = 0 WHERE id = ?`).run(req.params.id);
      auditLog(db, req.user?.id, 'SUPPRESSION', 'client', req.params.id, {});
      res.json({ success: true });
    } catch (e) {
      console.error('Erreur suppression client:', e);
      res.status(500).json({ error: 'Erreur lors de la suppression' });
    }
  });

  // POST /api/clients/:id/vehicule
  router.post('/:id/vehicule', (req, res) => {
    const { immatriculation, vin, marque, modele, motorisation, annee, couleur } = req.body;
    const result = db.prepare(`INSERT INTO vehicules_clients (client_id, immatriculation, vin, marque, modele, motorisation, annee, couleur) VALUES (?,?,?,?,?,?,?,?)`)
      .run(req.params.id, immatriculation, vin, marque, modele, motorisation, annee, couleur);
    res.status(201).json({ id: result.lastInsertRowid });
  });

  return router;
};
