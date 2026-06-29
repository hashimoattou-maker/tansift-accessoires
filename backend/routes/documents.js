const express = require('express');
const router = express.Router();
const { auditLog, generateDocumentNumber, updateClientSolde } = require('../utils/helpers');

module.exports = function(db) {
  // POST /api/documents - create any document
  router.post('/', async (req, res) => {
    try {
      const { type_document, client_id, fournisseur_id, notes, conditions_paiement, adresse_livraison, document_source_id, lignes } = req.body;
      if (!type_document) return res.status(400).json({ error: 'Type de document requis' });
      if (!client_id && ['devis','bon_livraison','facture_client'].includes(type_document)) {
        return res.status(400).json({ error: 'Client requis pour ce type de document' });
      }

      const numero = await generateDocumentNumber(db, type_document);
      const result = await db.prepare(`INSERT INTO documents (type_document, numero, client_id, fournisseur_id, utilisateur_id, notes, conditions_paiement, adresse_livraison, document_source_id) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(type_document, numero, client_id || null, fournisseur_id || null, req.user?.id || null, notes || null, conditions_paiement || null, adresse_livraison || null, document_source_id || null);

      const docId = result.lastInsertRowid;

      if (lignes && Array.isArray(lignes)) {
        let totalHT = 0, totalTVA = 0, totalTTC = 0;

        await db.run('START TRANSACTION');
        try {
          for (let i = 0; i < lignes.length; i++) {
            const ligne = lignes[i];
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

            await db.prepare(`INSERT INTO documents_lignes (document_id, article_id, source_unit_id, ligne_numero, reference, designation, quantite, prix_unitaire_ht, remise_pourcent, taux_tva, montant_ht, montant_tva, montant_ttc, marge_brute) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
              .run(docId, ligne.article_id || null, ligne.source_unit_id || null, ligne.ligne_numero || (i + 1), ligne.reference || null, ligne.designation || null, qte, prix, remise, tva, montantHT, montantTVA, montantTTC, marge);
          }
          await db.run('COMMIT');
        } catch (txError) {
          await db.run('ROLLBACK');
          throw txError;
        }

        await db.prepare(`UPDATE documents SET montant_ht = ?, total_tva = ?, montant_ttc = ?, net_a_payer = ? WHERE id = ?`)
          .run(totalHT, totalTVA, totalTTC, totalTTC, docId);

        // Stock: sorties pour bon_livraison
        if (['bon_livraison'].includes(type_document)) {
          await db.run('START TRANSACTION');
          try {
            for (const ligne of lignes) {
              if (!ligne.article_id) continue;
              const article = await db.prepare(`SELECT stock_actuel FROM articles WHERE id = ?`).get(ligne.article_id);
              if (!article) continue;

              const qte = ligne.quantite || 1;
              if (article.stock_actuel < qte) {
                throw new Error(`Stock insuffisant pour article ${ligne.article_id}: disponible ${article.stock_actuel}, demandé ${qte}`);
              }

              const stockApres = article.stock_actuel - qte;
              await db.prepare(`INSERT INTO mouvements_stock (article_id, type_mouvement, quantite, stock_avant, stock_apres, document_id, document_type, document_numero, source_unit_id, client_id, utilisateur_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
                .run(ligne.article_id, 'sortie', qte, article.stock_actuel, stockApres, docId, type_document, numero, ligne.source_unit_id || null, client_id || null, req.user?.id);
              await db.prepare(`UPDATE articles SET stock_actuel = ? WHERE id = ?`).run(stockApres, ligne.article_id);

              if (stockApres <= 0) {
                await db.prepare(`DELETE FROM nomenclature_moteur WHERE composant_id = ?`).run(ligne.article_id);
              }
            }
            await db.run('COMMIT');
          } catch (txError) {
            await db.run('ROLLBACK');
            throw txError;
          }
        }

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
      const { type, client_id, fournisseur_id, statut, search, page = 1, limit = 50 } = req.query;
      let sql = `SELECT d.*, c.raison_sociale as client_nom, f.raison_sociale as fournisseur_nom FROM documents d LEFT JOIN clients c ON d.client_id = c.id LEFT JOIN fournisseurs f ON d.fournisseur_id = f.id WHERE 1=1`;
      const params = [];
      if (type) { sql += ` AND d.type_document = ?`; params.push(type); }
      if (client_id) { sql += ` AND d.client_id = ?`; params.push(client_id); }
      if (fournisseur_id) { sql += ` AND d.fournisseur_id = ?`; params.push(fournisseur_id); }
      if (statut) { sql += ` AND d.statut = ?`; params.push(statut); }
      if (search) { sql += ` AND (d.numero LIKE ? OR c.raison_sociale LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }

      const total = await db.prepare(`SELECT COUNT(*) as total FROM (${sql}) AS _sub`).get(...params);
      const offset = (parseInt(page) - 1) * parseInt(limit);
      sql += ` ORDER BY d.date_document DESC LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), offset);

      res.json({ documents: await db.prepare(sql).all(...params), total: total.total, page: parseInt(page) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/documents/historique-unite/:unitId - historique complet d'une unité démontable
  router.get('/historique-unite/:unitId', async (req, res) => {
    try {
      const unitId = req.params.unitId;
      const unit = await db.prepare(`SELECT * FROM articles WHERE id = ?`).get(unitId);
      if (!unit) return res.status(404).json({ error: 'Unité introuvable' });

      const ventes = await db.prepare(`
        SELECT dl.*, d.numero as doc_numero, d.type_document, d.date_document, d.statut as doc_statut,
               c.raison_sociale as client_nom, c.code_client,
               u.nom as utilisateur_nom
        FROM documents_lignes dl
        JOIN documents d ON dl.document_id = d.id
        LEFT JOIN clients c ON d.client_id = c.id
        LEFT JOIN utilisateurs u ON d.utilisateur_id = u.id
        WHERE dl.source_unit_id = ? AND d.statut != 'annule'
        ORDER BY d.date_document DESC
      `).all(unitId);

      const decompositions = await db.prepare(`
        SELECT dc.*, dl.composant_id, dl.quantite as comp_quantite,
               a.reference as comp_reference, a.designation as comp_designation,
               u.nom as utilisateur_nom
        FROM decompositions dc
        JOIN decompositions_lignes dl ON dc.id = dl.decomposition_id
        LEFT JOIN articles a ON dl.composant_id = a.id
        LEFT JOIN utilisateurs u ON dc.utilisateur_id = u.id
        WHERE dc.parent_article_id = ?
        ORDER BY dc.date_decomposition DESC
      `).all(unitId);

      res.json({ unite: unit, ventes, decompositions });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/documents/historique-client/:clientId
  router.get('/historique-client/:clientId', async (req, res) => {
    try {
      const clientId = req.params.clientId;
      const docs = await db.prepare(`
        SELECT d.*, u.nom as utilisateur_nom
        FROM documents d
        LEFT JOIN utilisateurs u ON d.utilisateur_id = u.id
        WHERE d.client_id = ? AND d.statut != 'annule'
        ORDER BY d.date_document DESC
      `).all(clientId);

      for (const doc of docs) {
        doc.lignes = await db.prepare(`
          SELECT dl.*, a.reference as art_reference, a.designation as art_designation,
                 su.designation as source_unit_designation, su.reference as source_unit_reference
          FROM documents_lignes dl
          LEFT JOIN articles a ON dl.article_id = a.id
          LEFT JOIN articles su ON dl.source_unit_id = su.id
          WHERE dl.document_id = ?
        `).all(doc.id);
      }

      res.json(docs);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/documents/:id
  router.get('/:id', async (req, res) => {
    try {
      const doc = await db.prepare(`SELECT d.*, c.raison_sociale as client_nom, c.ice as client_ice, c.adresse as client_adresse, c.ville as client_ville, c.telephone as client_tel, c.rc as client_rc, f.raison_sociale as fournisseur_nom FROM documents d LEFT JOIN clients c ON d.client_id = c.id LEFT JOIN fournisseurs f ON d.fournisseur_id = f.id WHERE d.id = ?`).get(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Document introuvable' });
      doc.lignes = await db.prepare(`SELECT dl.*, a.reference as art_reference, a.designation as art_designation, su.designation as source_unit_designation, su.reference as source_unit_reference FROM documents_lignes dl LEFT JOIN articles a ON dl.article_id = a.id LEFT JOIN articles su ON dl.source_unit_id = su.id WHERE dl.document_id = ? ORDER BY dl.ligne_numero`).all(req.params.id);
      res.json(doc);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PUT /api/documents/:id/lignes/:ligneId - modifier une ligne
  router.put('/:id/lignes/:ligneId', async (req, res) => {
    try {
      const doc = await db.prepare(`SELECT * FROM documents WHERE id = ?`).get(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Document introuvable' });
      if (doc.statut === 'paye' || doc.statut === 'annule') return res.status(400).json({ error: 'Document payé ou annulé' });

      const ligne = await db.prepare(`SELECT * FROM documents_lignes WHERE id = ? AND document_id = ?`).get(req.params.ligneId, req.params.id);
      if (!ligne) return res.status(404).json({ error: 'Ligne introuvable' });

      const { quantite, prix_unitaire_ht, remise_pourcent, taux_tva, designation, reference } = req.body;
      const qte = quantite != null ? quantite : ligne.quantite;
      const prix = prix_unitaire_ht != null ? prix_unitaire_ht : ligne.prix_unitaire_ht;
      const remise = remise_pourcent != null ? remise_pourcent : ligne.remise_pourcent;
      const tva = taux_tva != null ? taux_tva : ligne.taux_tva;
      const montantHT = prix * qte * (1 - remise / 100);
      const montantTVA = montantHT * tva / 100;
      const montantTTC = montantHT + montantTVA;

      let marge = ligne.marge_brute;
      if (ligne.article_id) {
        const article = await db.prepare(`SELECT prix_achat_ht FROM articles WHERE id = ?`).get(ligne.article_id);
        if (article) marge = prix - article.prix_achat_ht;
      }

      await db.prepare(`UPDATE documents_lignes SET quantite = ?, prix_unitaire_ht = ?, remise_pourcent = ?, taux_tva = ?, montant_ht = ?, montant_tva = ?, montant_ttc = ?, marge_brute = ?, designation = COALESCE(?, designation), reference = COALESCE(?, reference) WHERE id = ?`)
        .run(qte, prix, remise, tva, montantHT, montantTVA, montantTTC, marge, designation || null, reference || null, ligne.id);

      const rows = await db.prepare(`SELECT SUM(montant_ht) as totalHT, SUM(montant_tva) as totalTVA, SUM(montant_ttc) as totalTTC FROM documents_lignes WHERE document_id = ?`).get(doc.id);
      await db.prepare(`UPDATE documents SET montant_ht = ?, total_tva = ?, montant_ttc = ?, net_a_payer = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(rows.totalHT || 0, rows.totalTVA || 0, rows.totalTTC || 0, rows.totalTTC || 0, doc.id);

      res.json({ success: true, montant_ht: montantHT, montant_ttc: montantTTC });
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

  // PUT /api/documents/:id - modifier les métadonnées du document (notes, client, etc.)
  router.put('/:id', async (req, res) => {
    try {
      const doc = await db.prepare(`SELECT * FROM documents WHERE id = ?`).get(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Document introuvable' });
      if (doc.statut === 'paye' || doc.statut === 'annule') return res.status(400).json({ error: 'Document payé ou annulé' });

      const { client_id, fournisseur_id, notes, conditions_paiement, adresse_livraison } = req.body;
      await db.prepare(`UPDATE documents SET client_id = COALESCE(?, client_id), fournisseur_id = COALESCE(?, fournisseur_id), notes = COALESCE(?, notes), conditions_paiement = COALESCE(?, conditions_paiement), adresse_livraison = COALESCE(?, adresse_livraison), updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(client_id !== undefined ? client_id : null, fournisseur_id !== undefined ? fournisseur_id : null, notes !== undefined ? notes : null, conditions_paiement !== undefined ? conditions_paiement : null, adresse_livraison !== undefined ? adresse_livraison : null, doc.id);

      if (doc.client_id && ['facture_client', 'avoir_client'].includes(doc.type_document)) {
        await updateClientSolde(db, doc.client_id);
      }

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/documents/:id/lignes - ajouter une ligne à un document
  router.post('/:id/lignes', async (req, res) => {
    try {
      const doc = await db.prepare(`SELECT * FROM documents WHERE id = ?`).get(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Document introuvable' });
      if (doc.statut === 'valide' || doc.statut === 'annule') return res.status(400).json({ error: 'Document déjà validé ou annulé' });

      const { article_id, source_unit_id, quantite, prix_unitaire_ht, remise_pourcent, taux_tva, designation, reference } = req.body;
      if (!article_id) return res.status(400).json({ error: 'Article requis' });

      const article = await db.prepare(`SELECT * FROM articles WHERE id = ?`).get(article_id);
      if (!article) return res.status(404).json({ error: 'Article introuvable' });

      const prix = prix_unitaire_ht || article.prix_vente_ht;
      const qte = quantite || 1;
      const remise = remise_pourcent || 0;
      const tva = taux_tva || 20;
      const montantHT = prix * qte * (1 - remise / 100);
      const montantTVA = montantHT * tva / 100;
      const montantTTC = montantHT + montantTVA;
      const marge = prix - article.prix_achat_ht;

      const countRow = await db.prepare(`SELECT COUNT(*) as cnt FROM documents_lignes WHERE document_id = ?`).get(doc.id);
      const numLigne = (countRow?.cnt || 0) + 1;

      const result = await db.prepare(`INSERT INTO documents_lignes (document_id, article_id, source_unit_id, ligne_numero, reference, designation, quantite, prix_unitaire_ht, remise_pourcent, taux_tva, montant_ht, montant_tva, montant_ttc, marge_brute) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(doc.id, article_id, source_unit_id || null, numLigne, reference || article.reference, designation || article.designation, qte, prix, remise, tva, montantHT, montantTVA, montantTTC, marge);

      await db.prepare(`UPDATE documents SET montant_ht = montant_ht + ?, total_tva = total_tva + ?, montant_ttc = montant_ttc + ?, net_a_payer = net_a_payer + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(montantHT, montantTVA, montantTTC, montantTTC, doc.id);

      if (doc.type_document === 'bon_livraison') {
        const stockApres = article.stock_actuel - qte;
        await db.prepare(`INSERT INTO mouvements_stock (article_id, type_mouvement, quantite, stock_avant, stock_apres, document_id, document_type, document_numero, client_id, utilisateur_id) VALUES (?,?,?,?,?,?,?,?,?,?)`)
          .run(article_id, 'sortie', qte, article.stock_actuel, stockApres, doc.id, doc.type_document, doc.numero, doc.client_id || null, req.user?.id);
        await db.prepare(`UPDATE articles SET stock_actuel = ? WHERE id = ?`).run(stockApres, article_id);
      }

      res.status(201).json({ id: result.lastInsertRowid, montant_ht: montantHT, montant_ttc: montantTTC });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/documents/:id/lignes/:ligneId
  router.delete('/:id/lignes/:ligneId', async (req, res) => {
    try {
      const doc = await db.prepare(`SELECT * FROM documents WHERE id = ?`).get(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Document introuvable' });

      const ligne = await db.prepare(`SELECT * FROM documents_lignes WHERE id = ? AND document_id = ?`).get(req.params.ligneId, req.params.id);
      if (!ligne) return res.status(404).json({ error: 'Ligne introuvable' });

      await db.prepare(`DELETE FROM documents_lignes WHERE id = ?`).run(req.params.ligneId);
      await db.prepare(`UPDATE documents SET montant_ht = montant_ht - ?, total_tva = total_tva - ?, montant_ttc = montant_ttc - ?, net_a_payer = net_a_payer - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(ligne.montant_ht, ligne.montant_tva, ligne.montant_ttc, ligne.montant_ttc, doc.id);

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
        devis: 'bon_livraison',
        bon_livraison: 'facture_client',
      };

      const nextType = nextTypes[doc.type_document];
      if (!nextType) return res.status(400).json({ error: 'Aucun transfert possible pour ce type de document' });

      const lignes = await db.prepare(`SELECT * FROM documents_lignes WHERE document_id = ?`).all(doc.id);
      if (!lignes.length) return res.status(400).json({ error: 'Aucune ligne à transférer' });

      const numero = await generateDocumentNumber(db, nextType);
      const result = await db.prepare(`INSERT INTO documents (type_document, numero, client_id, fournisseur_id, utilisateur_id, notes, conditions_paiement, adresse_livraison, document_source_id, statut) VALUES (?,?,?,?,?,?,?,?,?,'brouillon')`)
        .run(nextType, numero, doc.client_id, doc.fournisseur_id, req.user?.id, doc.notes, doc.conditions_paiement, doc.adresse_livraison, doc.id);
      const newDocId = result.lastInsertRowid;

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
          await db.prepare(`INSERT INTO documents_lignes (document_id, article_id, source_unit_id, ligne_numero, reference, designation, quantite, prix_unitaire_ht, remise_pourcent, taux_tva, montant_ht, montant_tva, montant_ttc, marge_brute) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(newDocId, l.article_id, l.source_unit_id, l.ligne_numero, l.reference, l.designation, l.quantite, l.prix_unitaire_ht, l.remise_pourcent, l.taux_tva, montantHT, montantTVA, montantTTC, l.marge_brute);
        }
        await db.run('COMMIT');
      } catch (txError) {
        await db.run('ROLLBACK');
        throw txError;
      }

      await db.prepare(`UPDATE documents SET montant_ht = ?, total_tva = ?, montant_ttc = ?, net_a_payer = ? WHERE id = ?`)
        .run(totalHT, totalTVA, totalTTC, totalTTC, newDocId);

      // Appliquer logique de stock pour BLC
      if (nextType === 'bon_livraison') {
        await db.run('START TRANSACTION');
        try {
          for (const l of lignes) {
            if (!l.article_id) continue;
            const article = await db.prepare(`SELECT stock_actuel FROM articles WHERE id = ?`).get(l.article_id);
            if (!article) continue;

            const qte = l.quantite || 1;
            if (article.stock_actuel < qte) {
              throw new Error(`Stock insuffisant pour article ${l.article_id}: disponible ${article.stock_actuel}, demandé ${qte}`);
            }

            const stockApres = article.stock_actuel - qte;
            await db.prepare(`INSERT INTO mouvements_stock (article_id, type_mouvement, quantite, stock_avant, stock_apres, document_id, document_type, document_numero, source_unit_id, client_id, utilisateur_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
              .run(l.article_id, 'sortie', qte, article.stock_actuel, stockApres, newDocId, nextType, numero, l.source_unit_id || null, doc.client_id, req.user?.id);
            await db.prepare(`UPDATE articles SET stock_actuel = ? WHERE id = ?`).run(stockApres, l.article_id);

            if (stockApres <= 0) {
              await db.prepare(`DELETE FROM nomenclature_moteur WHERE composant_id = ?`).run(l.article_id);
            }
          }
          await db.run('COMMIT');
        } catch (txError) {
          await db.run('ROLLBACK');
          throw txError;
        }
      }

      await db.prepare(`UPDATE documents SET statut = 'valide', notes = CONCAT(COALESCE(notes,''), '\nTransféré vers ', ?) WHERE id = ?`)
        .run(numero, doc.id);

      await auditLog(db, req.user?.id, 'TRANSFERT', doc.type_document, doc.id, { vers: nextType, new_id: newDocId, numero });
      res.status(201).json({ id: newDocId, numero, type: nextType });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/documents/:id
  router.delete('/:id', async (req, res) => {
    try {
      const doc = await db.prepare(`SELECT * FROM documents WHERE id = ?`).get(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Document introuvable' });

      await db.run('START TRANSACTION');
      try {
        await db.prepare(`DELETE FROM imputations_paiements WHERE document_id = ?`).run(req.params.id);
        await db.prepare(`DELETE FROM garanties WHERE document_id = ?`).run(req.params.id);
        await db.prepare(`DELETE FROM mouvements_stock WHERE document_id = ?`).run(req.params.id);
        await db.prepare(`DELETE FROM paiements_clients WHERE document_id = ?`).run(req.params.id);
        await db.prepare(`DELETE FROM documents_lignes WHERE document_id = ?`).run(req.params.id);
        await db.prepare(`DELETE FROM documents WHERE id = ?`).run(req.params.id);
        await db.run('COMMIT');
      } catch (txError) {
        await db.run('ROLLBACK');
        throw txError;
      }

      await auditLog(db, req.user?.id, 'SUPPRESSION', doc.type_document, req.params.id, { numero: doc.numero });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
