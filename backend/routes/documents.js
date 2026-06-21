const express = require('express');
const router = express.Router();
const { auditLog, generateDocumentNumber, updateClientSolde } = require('../utils/helpers');

module.exports = function(db) {
  // POST /api/documents - create any document
  router.post('/', async (req, res) => {
    try {
      const { type_document, client_id, fournisseur_id, notes, conditions_paiement, adresse_livraison, lignes } = req.body;
      if (!type_document) return res.status(400).json({ error: 'Type de document requis' });

      const numero = await generateDocumentNumber(db, type_document);
      const result = await db.prepare(`INSERT INTO documents (type_document, numero, client_id, fournisseur_id, utilisateur_id, notes, conditions_paiement, adresse_livraison) VALUES (?,?,?,?,?,?,?,?)`)
        .run(type_document, numero, client_id || null, fournisseur_id || null, req.user?.id || null, notes || null, conditions_paiement || null, adresse_livraison || null);

      const docId = result.lastInsertRowid;

      if (lignes && Array.isArray(lignes)) {
        let totalHT = 0, totalTVA = 0, totalTTC = 0;

        await db.run('START TRANSACTION');
        try {
          for (const ligne of lignes) {
            let prix = ligne.prix_unitaire_ht || 0;
            let qte = ligne.quantite || 1;
            let remise = ligne.remise_pourcent || 0;
            let tva = ligne.taux_tva || 20;
            let marge = 0;

            if (ligne.article_id) {
              const article = await db.prepare(`SELECT * FROM articles WHERE id = ?`).get(ligne.article_id);
              if (article) {
                prix = ligne.prix_unitaire_ht || article.prix_vente_ht;
                marge = prix - article.prix_achat_ht;
              }
            }

            const montantHT = prix * qte * (1 - remise / 100);
            const montantTVA = montantHT * tva / 100;
            const montantTTC = montantHT + montantTVA;
            totalHT += montantHT;
            totalTVA += montantTVA;
            totalTTC += montantTTC;

            await db.prepare(`INSERT INTO documents_lignes (document_id, article_id, ligne_numero, reference, designation, quantite, prix_unitaire_ht, remise_pourcent, taux_tva, montant_ht, montant_tva, montant_ttc, marge_brute) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
              .run(docId, ligne.article_id || null, ligne.ligne_numero || 0, ligne.reference || null, ligne.designation || null, qte, prix, remise, tva, montantHT, montantTVA, montantTTC, marge);
          }
          await db.run('COMMIT');
        } catch (txError) {
          await db.run('ROLLBACK');
          throw txError;
        }

        // Update document totals
        await db.prepare(`UPDATE documents SET montant_ht = ?, total_tva = ?, montant_ttc = ?, net_a_payer = ? WHERE id = ?`)
          .run(totalHT, totalTVA, totalTTC, totalTTC, docId);

        // Stock movement for validated documents
        if (['bon_livraison', 'facture_client', 'bon_reception', 'facture_fournisseur'].includes(type_document)) {
          await db.run('START TRANSACTION');
          try {
            for (const ligne of lignes) {
              if (!ligne.article_id) continue;
              const article = await db.prepare(`SELECT stock_actuel FROM articles WHERE id = ?`).get(ligne.article_id);
              if (!article) continue;

              const isSortie = ['bon_livraison', 'facture_client'].includes(type_document);
              const typeMvt = isSortie ? 'sortie' : 'entree';
              const stockAvant = article.stock_actuel;
              const stockApres = isSortie ? stockAvant - (ligne.quantite || 1) : stockAvant + (ligne.quantite || 1);

              await db.prepare(`INSERT INTO mouvements_stock (article_id, type_mouvement, quantite, stock_avant, stock_apres, document_id, document_type, utilisateur_id) VALUES (?,?,?,?,?,?,?,?)`)
                .run(ligne.article_id, typeMvt, ligne.quantite || 1, stockAvant, stockApres, docId, type_document, req.user?.id);
              await db.prepare(`UPDATE articles SET stock_actuel = ? WHERE id = ?`).run(stockApres, ligne.article_id);
            }
            await db.run('COMMIT');
          } catch (txError) {
            await db.run('ROLLBACK');
            throw txError;
          }
        }

        // Update client solde for factures/avoirs
        if (client_id && ['facture_client', 'avoir_client'].includes(type_document)) {
          await updateClientSolde(db, client_id);
        }
      }

      await auditLog(db, req.user?.id, 'CREATION', type_document, docId, { numero });
      res.status(201).json({ id: docId, numero });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/documents
  router.get('/', async (req, res) => {
    try {
      const { type, client_id, fournisseur_id, statut, page = 1, limit = 50 } = req.query;
      let sql = `SELECT d.*, c.raison_sociale as client_nom, f.raison_sociale as fournisseur_nom FROM documents d LEFT JOIN clients c ON d.client_id = c.id LEFT JOIN fournisseurs f ON d.fournisseur_id = f.id WHERE 1=1`;
      const params = [];
      if (type) { sql += ` AND d.type_document = ?`; params.push(type); }
      if (client_id) { sql += ` AND d.client_id = ?`; params.push(client_id); }
      if (fournisseur_id) { sql += ` AND d.fournisseur_id = ?`; params.push(fournisseur_id); }
      if (statut) { sql += ` AND d.statut = ?`; params.push(statut); }

      const total = await db.prepare(`SELECT COUNT(*) as total FROM (${sql}) AS _sub`).get(...params);
      const offset = (parseInt(page) - 1) * parseInt(limit);
      sql += ` ORDER BY d.date_document DESC LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), offset);

      res.json({ documents: await db.prepare(sql).all(...params), total: total.total, page: parseInt(page) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/documents/:id
  router.get('/:id', async (req, res) => {
    try {
      const doc = await db.prepare(`SELECT d.*, c.raison_sociale as client_nom, c.ice as client_ice, c.adresse as client_adresse, c.ville as client_ville, c.telephone as client_tel, c.rc as client_rc, f.raison_sociale as fournisseur_nom FROM documents d LEFT JOIN clients c ON d.client_id = c.id LEFT JOIN fournisseurs f ON d.fournisseur_id = f.id WHERE d.id = ?`).get(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Document introuvable' });
      doc.lignes = await db.prepare(`SELECT dl.*, a.reference as art_reference, a.designation as art_designation FROM documents_lignes dl LEFT JOIN articles a ON dl.article_id = a.id WHERE dl.document_id = ? ORDER BY dl.ligne_numero`).all(req.params.id);
      res.json(doc);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PUT /api/documents/:id/statut
  router.put('/:id/statut', async (req, res) => {
    try {
      const { statut } = req.body;
      const doc = await db.prepare(`SELECT * FROM documents WHERE id = ?`).get(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Document introuvable' });

      await db.prepare(`UPDATE documents SET statut = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(statut, req.params.id);

      if (doc.client_id && ['facture_client', 'avoir_client'].includes(doc.type_document)) {
        await updateClientSolde(db, doc.client_id);
      }

      await auditLog(db, req.user?.id, 'CHANGEMENT_STATUT', doc.type_document, req.params.id, { ancien: doc.statut, nouveau: statut });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/documents/:id/transfert - convert to next document type
  router.post('/:id/transfert', async (req, res) => {
    try {
      const doc = await db.prepare(`SELECT * FROM documents WHERE id = ?`).get(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Document introuvable' });

      const nextTypes = {
        devis: 'bon_commande_client',
        bon_commande_client: 'bon_livraison',
        bon_livraison: 'facture_client',
        demande_achat: 'commande_fournisseur',
        commande_fournisseur: 'bon_reception',
        bon_reception: 'facture_fournisseur',
      };

      const nextType = nextTypes[doc.type_document];
      if (!nextType) return res.status(400).json({ error: 'Aucun transfert possible pour ce type de document' });

      const lignes = await db.prepare(`SELECT * FROM documents_lignes WHERE document_id = ?`).all(doc.id);
      if (!lignes.length) return res.status(400).json({ error: 'Aucune ligne à transférer' });

      // Créer le nouveau document
      const numero = await generateDocumentNumber(db, nextType);
      const result = await db.prepare(`INSERT INTO documents (type_document, numero, client_id, fournisseur_id, utilisateur_id, notes, date_document, statut) VALUES (?,?,?,?,?,?,CURRENT_DATE,'brouillon')`)
        .run(nextType, numero, doc.client_id, doc.fournisseur_id, req.user?.id, doc.notes);
      const newDocId = result.lastInsertRowid;

      // Copier les lignes
      let totalHT = 0, totalTVA = 0, totalTTC = 0;

      await db.run('START TRANSACTION');
      try {
        for (const l of lignes) {
          const montantHT = l.prix_unitaire_ht * l.quantite * (1 - (l.remise_pourcent || 0) / 100);
          const montantTVA = montantHT * (l.taux_tva || 20) / 100;
          const montantTTC = montantHT + montantTVA;
          totalHT += montantHT;
          totalTVA += montantTVA;
          totalTTC += montantTTC;
          await db.prepare(`INSERT INTO documents_lignes (document_id, article_id, ligne_numero, reference, designation, quantite, prix_unitaire_ht, remise_pourcent, taux_tva, montant_ht, montant_tva, montant_ttc) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(newDocId, l.article_id, l.ligne_numero, l.reference, l.designation, l.quantite, l.prix_unitaire_ht, l.remise_pourcent, l.taux_tva, montantHT, montantTVA, montantTTC);
        }
        await db.run('COMMIT');
      } catch (txError) {
        await db.run('ROLLBACK');
        throw txError;
      }

      await db.prepare(`UPDATE documents SET montant_ht = ?, total_tva = ?, montant_ttc = ?, net_a_payer = ? WHERE id = ?`)
        .run(totalHT, totalTVA, totalTTC, totalTTC, newDocId);

      // Marquer l'ancien document
      await db.prepare(`UPDATE documents SET statut = 'valide', notes = CONCAT(COALESCE(notes,''), '\nTransféré vers ', (SELECT numero FROM documents WHERE id = ?)) WHERE id = ?`)
        .run(newDocId, doc.id);

      await auditLog(db, req.user?.id, 'TRANSFERT', doc.type_document, doc.id, { vers: nextType, new_id: newDocId, numero });
      res.status(201).json({ id: newDocId, numero, type: nextType });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/documents/:id
  router.delete('/:id', async (req, res) => {
    try {
      await db.prepare(`UPDATE documents SET statut = 'annule', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
