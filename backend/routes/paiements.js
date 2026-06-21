const express = require('express');
const router = express.Router();
const { auditLog, updateClientSolde } = require('../utils/helpers');

module.exports = function(db) {
  router.get('/', async (req, res) => {
    try {
      const { client_id, page = 1, limit = 50 } = req.query;
      let sql = `SELECT p.*, c.raison_sociale as client_nom FROM paiements_clients p LEFT JOIN clients c ON p.client_id = c.id WHERE 1=1`;
      const params = [];
      if (client_id) { sql += ` AND p.client_id = ?`; params.push(client_id); }
      const total = await db.prepare(`SELECT COUNT(*) as total FROM (${sql})`).get(...params);
      const offset = (parseInt(page) - 1) * parseInt(limit);
      sql += ` ORDER BY p.date_paiement DESC LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), offset);
      res.json({ paiements: await db.prepare(sql).all(...params), total: total.total });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET situation clients (all clients with balances)
  router.get('/situation', async (req, res) => {
    try {
      const { filtre } = req.query;
      let clients = await db.prepare(`SELECT id, code_client, raison_sociale, type_client, telephone, solde_actuel, plafond_credit, ville FROM clients WHERE actif = 1 ORDER BY raison_sociale`).all();
      if (filtre === 'debiteurs') clients = clients.filter(c => c.solde_actuel > 0);
      if (filtre === 'soldes') clients = clients.filter(c => c.solde_actuel <= 0);
      res.json(clients);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/paiements
  router.post('/', async (req, res) => {
    try {
      const { client_id, document_id, montant, mode_paiement, reference, numero_cheque, banque_emetteur, notes, date_paiement } = req.body;
      if (!client_id || !montant) return res.status(400).json({ error: 'Client et montant requis' });

      const datePaiement = date_paiement || new Date().toISOString().slice(0, 10);
      const result = await db.prepare(`INSERT INTO paiements_clients (client_id, document_id, montant, mode_paiement, reference, numero_cheque, banque_emetteur, notes, utilisateur_id, date_paiement) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(client_id, document_id || null, montant, mode_paiement || 'Especes', reference || null, numero_cheque || null, banque_emetteur || null, notes || null, req.user?.id || null, datePaiement);

      // Update client solde
      await updateClientSolde(db, client_id);

      await auditLog(db, req.user?.id, 'PAIEMENT', 'paiement_client', result.lastInsertRowid, { client_id, montant, mode: mode_paiement });
      res.status(201).json({ id: result.lastInsertRowid });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const paiement = await db.prepare(`SELECT p.*, c.raison_sociale as client_nom FROM paiements_clients p LEFT JOIN clients c ON p.client_id = c.id WHERE p.id = ?`).get(req.params.id);
      if (!paiement) return res.status(404).json({ error: 'Paiement introuvable' });
      paiement.imputations = await db.prepare(`SELECT i.*, d.numero as document_numero FROM imputations_paiements i LEFT JOIN documents d ON i.document_id = d.id WHERE i.paiement_id = ?`).all(req.params.id);
      res.json(paiement);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PUT /api/paiements/:id
  router.put('/:id', async (req, res) => {
    try {
      const existing = await db.prepare(`SELECT * FROM paiements_clients WHERE id = ?`).get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Paiement introuvable' });
      const { montant, mode_paiement, reference, numero_cheque, banque_emetteur, notes, date_paiement } = req.body;
      await db.prepare(`UPDATE paiements_clients SET montant=?, mode_paiement=?, reference=?, numero_cheque=?, banque_emetteur=?, notes=?, date_paiement=? WHERE id=?`)
        .run(montant !== undefined ? montant : existing.montant, mode_paiement || existing.mode_paiement, reference !== undefined ? reference : existing.reference, numero_cheque !== undefined ? numero_cheque : existing.numero_cheque, banque_emetteur !== undefined ? banque_emetteur : existing.banque_emetteur, notes !== undefined ? notes : existing.notes, date_paiement || existing.date_paiement, req.params.id);
      await updateClientSolde(db, existing.client_id);
      await auditLog(db, req.user?.id, 'MODIFICATION', 'paiement_client', req.params.id, { montant, ancien_montant: existing.montant });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/paiements/:id
  router.delete('/:id', async (req, res) => {
    try {
      const existing = await db.prepare(`SELECT * FROM paiements_clients WHERE id = ?`).get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Paiement introuvable' });
      await db.prepare(`DELETE FROM paiements_clients WHERE id = ?`).run(req.params.id);
      await updateClientSolde(db, existing.client_id);
      await auditLog(db, req.user?.id, 'SUPPRESSION', 'paiement_client', req.params.id, { montant: existing.montant, client_id: existing.client_id });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
