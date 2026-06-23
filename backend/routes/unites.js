const express = require('express');
const router = express.Router();
const { auditLog } = require('../utils/helpers');

module.exports = function(db) {

  // ============================================================
  // LISTE des unités assemblables/démontables
  // ============================================================
  router.get('/', async (req, res) => {
    try {
      const { type, search } = req.query;
      let sql = `SELECT a.*, c.nom as categorie_nom,
        (SELECT COUNT(*) FROM nomenclature_moteur WHERE moteur_id = a.id) as total_composants,
        (SELECT COUNT(*) FROM nomenclature_moteur nm JOIN articles ca ON nm.composant_id = ca.id WHERE nm.moteur_id = a.id AND ca.stock_actuel >= nm.quantite) as composants_disponibles,
        (SELECT COUNT(*) FROM assemblages WHERE unite_parent_id = a.id) as total_assemblages,
        (SELECT COUNT(*) FROM decompositions WHERE parent_article_id = a.id) as total_desassemblages
        FROM articles a LEFT JOIN categories c ON a.categorie_id = c.id
        WHERE (a.est_moteur = 1 OR a.type_unite IS NOT NULL)`;
      const params = [];
      if (type) { sql += ` AND a.type_unite = ?`; params.push(type); }
      if (search) { sql += ` AND (a.reference LIKE ? OR a.designation LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
      sql += ` ORDER BY a.reference`;

      const units = await db.prepare(sql).all(...params);
      const result = units.map(u => ({
        ...u,
        etat: u.total_composants === 0 ? 'non_defini' :
              u.composants_disponibles === u.total_composants ? 'complet' :
              u.composants_disponibles === 0 ? 'manquant' : 'partiel'
      }));
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // DETAIL d'une unité (nomenclature, assemblages, démontages, ventes)
  // ============================================================
  router.get('/:id', async (req, res) => {
    try {
      const unit = await db.prepare(`SELECT a.*, c.nom as categorie_nom FROM articles a LEFT JOIN categories c ON a.categorie_id = c.id WHERE a.id = ?`).get(req.params.id);
      if (!unit) return res.status(404).json({ error: 'Unité introuvable' });

      // Nomenclature (BOM)
      const nomenclature = await db.prepare(`SELECT nm.*, a.reference, a.designation, a.stock_actuel, a.prix_achat_ht, a.prix_vente_ht, a.emplacement,
        CASE WHEN a.stock_actuel >= nm.quantite THEN 'disponible' WHEN a.stock_actuel > 0 THEN 'partiel' ELSE 'manquant' END as statut_stock
        FROM nomenclature_moteur nm JOIN articles a ON nm.composant_id = a.id WHERE nm.moteur_id = ? ORDER BY a.reference
      `).all(req.params.id);

      // Assemblages (historique)
      const assemblages = await db.prepare(`SELECT aa.*, u.nom as utilisateur_nom FROM assemblages aa LEFT JOIN utilisateurs u ON aa.utilisateur_id = u.id WHERE aa.unite_parent_id = ? ORDER BY aa.date_assemblage DESC`).all(req.params.id);

      for (const assemblage of assemblages) {
        assemblage.lignes = await db.prepare(`SELECT al.*, a.reference as comp_ref, a.designation as comp_des FROM assemblages_lignes al LEFT JOIN articles a ON al.composant_id = a.id WHERE al.assemblage_id = ?`).all(assemblage.id);
      }

      // Désassemblages (historique)
      const decompositions = await db.prepare(`SELECT d.*, u.nom as utilisateur_nom FROM decompositions d LEFT JOIN utilisateurs u ON d.utilisateur_id = u.id WHERE d.parent_article_id = ? ORDER BY d.date_decomposition DESC`).all(req.params.id);

      for (const decomp of decompositions) {
        decomp.lignes = await db.prepare(`SELECT dl.*, a.reference as comp_ref, a.designation as comp_des FROM decompositions_lignes dl LEFT JOIN articles a ON dl.composant_id = a.id WHERE dl.decomposition_id = ?`).all(decomp.id);
      }

      // Ventes de pièces issues de cette unité
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
      `).all(req.params.id);

      // Mouvements de stock
      const mouvements = await db.prepare(`SELECT m.*, a.reference, a.designation FROM mouvements_stock m LEFT JOIN articles a ON m.article_id = a.id WHERE m.source_unit_id = ? OR (m.document_type IN ('assemblage','desassemblage') AND m.motif LIKE ?) ORDER BY m.created_at DESC LIMIT 50`)
        .all(req.params.id, `%${unit.reference}%`);

      res.json({ unite: unit, nomenclature, assemblages, decompositions, ventes, mouvements });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // ASSEMBLER — créer une unité à partir de composants
  // ============================================================
  router.post('/:id/assembler', async (req, res) => {
    try {
      const { lignes, quantite, motif } = req.body;
      const qteAssemblee = quantite || 1;

      const unit = await db.prepare(`SELECT * FROM articles WHERE id = ?`).get(req.params.id);
      if (!unit) return res.status(404).json({ error: 'Unité introuvable' });

      // Si pas de lignes custom, utiliser la nomenclature
      let composants = lignes;
      if (!composants || !Array.isArray(composants) || composants.length === 0) {
        const nomenclature = await db.prepare(`SELECT * FROM nomenclature_moteur WHERE moteur_id = ?`).all(req.params.id);
        if (nomenclature.length === 0) return res.status(400).json({ error: 'Aucune pièce dans la nomenclature. Ajoutez des pièces ou spécifiez les composants.' });
        composants = nomenclature.map(n => ({ composant_id: n.composant_id, quantite: n.quantite * qteAssemblee }));
      } else {
        composants = composants.map(c => ({ composant_id: c.composant_id, quantite: (c.quantite || 1) * qteAssemblee }));
      }

      await db.run('START TRANSACTION');
      try {
        // Vérifier et retirer le stock des composants
        for (const comp of composants) {
          const article = await db.prepare(`SELECT stock_actuel, reference FROM articles WHERE id = ?`).get(comp.composant_id);
          if (!article) throw new Error(`Composant ${comp.composant_id} introuvable`);
          if (article.stock_actuel < comp.quantite) {
            throw new Error(`Stock insuffisant pour ${article.reference} (besoin: ${comp.quantite}, disponible: ${article.stock_actuel})`);
          }
          const newStock = article.stock_actuel - comp.quantite;
          await db.prepare(`UPDATE articles SET stock_actuel = ? WHERE id = ?`).run(newStock, comp.composant_id);
          await db.prepare(`INSERT INTO mouvements_stock (article_id, type_mouvement, quantite, stock_avant, stock_apres, document_type, utilisateur_id, motif) VALUES (?,?,?,?,?,?,?,?)`)
            .run(comp.composant_id, 'sortie', comp.quantite, article.stock_actuel, newStock, 'assemblage', req.user?.id, `Assemblage ${unit.reference} x${qteAssemblee}`);
        }

        // Créer l'enregistrement assemblage
        const assemblResult = await db.prepare(`INSERT INTO assemblages (unite_parent_id, quantite, utilisateur_id, motif) VALUES (?,?,?,?)`)
          .run(req.params.id, qteAssemblee, req.user?.id, motif || `Assemblage de ${qteAssemblee} unité(s)`);
        const assemblId = assemblResult.lastInsertRowid;

        for (const comp of composants) {
          await db.prepare(`INSERT INTO assemblages_lignes (assemblage_id, composant_id, quantite) VALUES (?,?,?)`)
            .run(assemblId, comp.composant_id, comp.quantite);
        }

        // Ajouter au stock de l'unité parente
        const newStockUnite = (unit.stock_unite || 0) + qteAssemblee;
        await db.prepare(`UPDATE articles SET stock_unite = ?, est_moteur = 1 WHERE id = ?`).run(newStockUnite, req.params.id);

        await db.run('COMMIT');
      } catch (txError) {
        await db.run('ROLLBACK');
        throw txError;
      }

      await auditLog(db, req.user?.id, 'ASSEMBLAGE', 'article', req.params.id, { quantite: qteAssemblee, composants });
      res.status(201).json({ success: true, stock_unite_apres: (unit.stock_unite || 0) + qteAssemblee });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // DÉSASSEMBLER — extraire des pièces d'une unité
  // ============================================================
  router.post('/:id/desassembler', async (req, res) => {
    try {
      const { lignes, motif } = req.body;
      if (!lignes || !Array.isArray(lignes) || lignes.length === 0)
        return res.status(400).json({ error: 'Sélectionnez au moins une pièce à extraire' });

      const unit = await db.prepare(`SELECT * FROM articles WHERE id = ?`).get(req.params.id);
      if (!unit) return res.status(404).json({ error: 'Unité introuvable' });

      if (!unit.stock_unite || unit.stock_unite <= 0)
        return res.status(400).json({ error: 'Aucune unité en stock à désassembler' });

      await db.run('START TRANSACTION');
      try {
        // Créer l'enregistrement décomposition
        const decompResult = await db.prepare(`INSERT INTO decompositions (parent_article_id, utilisateur_id, motif) VALUES (?,?,?)`)
          .run(req.params.id, req.user?.id, motif || 'Désassemblage manuel');
        const decompId = decompResult.lastInsertRowid;

        for (const ligne of lignes) {
          const article = await db.prepare(`SELECT stock_actuel, reference FROM articles WHERE id = ?`).get(ligne.composant_id);
          if (!article) continue;

          const qte = ligne.quantite || 1;
          const newStock = article.stock_actuel + qte;

          await db.prepare(`INSERT INTO decompositions_lignes (decomposition_id, composant_id, quantite, stock_apres) VALUES (?,?,?,?)`)
            .run(decompId, ligne.composant_id, qte, newStock);

          await db.prepare(`INSERT INTO mouvements_stock (article_id, type_mouvement, quantite, stock_avant, stock_apres, document_type, utilisateur_id, motif) VALUES (?,?,?,?,?,?,?,?)`)
            .run(ligne.composant_id, 'entree', qte, article.stock_actuel, newStock, 'desassemblage', req.user?.id, `Désassemblage ${unit.reference}`);

          await db.prepare(`UPDATE articles SET stock_actuel = ? WHERE id = ?`).run(newStock, ligne.composant_id);
        }

        // Retirer du stock unité
        const newStockUnite = unit.stock_unite - 1;
        await db.prepare(`UPDATE articles SET stock_unite = ? WHERE id = ?`).run(newStockUnite, req.params.id);

        await db.run('COMMIT');
      } catch (txError) {
        await db.run('ROLLBACK');
        throw txError;
      }

      await auditLog(db, req.user?.id, 'DESASSEMBLAGE', 'article', req.params.id, { lignes });
      res.json({ success: true, stock_unite_apres: unit.stock_unite - 1 });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // HISTORIQUE COMPLET — répond à toutes les questions métier
  // ============================================================
  router.get('/:id/historique', async (req, res) => {
    try {
      const unitId = req.params.id;
      const unit = await db.prepare(`SELECT * FROM articles WHERE id = ?`).get(unitId);
      if (!unit) return res.status(404).json({ error: 'Unité introuvable' });

      // Assemblages
      const assemblages = await db.prepare(`SELECT aa.*, u.nom as utilisateur_nom FROM assemblages aa LEFT JOIN utilisateurs u ON aa.utilisateur_id = u.id WHERE aa.unite_parent_id = ? ORDER BY aa.date_assemblage DESC`).all(unitId);
      for (const a of assemblages) {
        a.lignes = await db.prepare(`SELECT al.*, a.reference as comp_ref, a.designation as comp_des, a.stock_actuel as comp_stock FROM assemblages_lignes al LEFT JOIN articles a ON al.composant_id = a.id WHERE al.assemblage_id = ?`).all(a.id);
      }

      // Désassemblages
      const decompositions = await db.prepare(`SELECT d.*, u.nom as utilisateur_nom FROM decompositions d LEFT JOIN utilisateurs u ON d.utilisateur_id = u.id WHERE d.parent_article_id = ? ORDER BY d.date_decomposition DESC`).all(unitId);
      for (const d of decompositions) {
        d.lignes = await db.prepare(`SELECT dl.*, a.reference as comp_ref, a.designation as comp_des, dl.stock_apres FROM decompositions_lignes dl LEFT JOIN articles a ON dl.composant_id = a.id WHERE dl.decomposition_id = ?`).all(d.id);
      }

      // Ventes
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

      // Pièces restantes (depuis nomenclature)
      const nomenclature = await db.prepare(`SELECT nm.*, a.reference, a.designation, a.stock_actuel, a.prix_vente_ht
        FROM nomenclature_moteur nm JOIN articles a ON nm.composant_id = a.id WHERE nm.moteur_id = ?`).all(unitId);

      res.json({ unite: unit, assemblages, decompositions, ventes, pieces_restantes: nomenclature });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // NOMENCLATURE — CRUD
  // ============================================================
  router.post('/:id/nomenclature', async (req, res) => {
    try {
      const { composant_id, quantite } = req.body;
      if (!composant_id || !quantite) return res.status(400).json({ error: 'Composant et quantité requis' });

      await db.prepare(`REPLACE INTO nomenclature_moteur (moteur_id, composant_id, quantite) VALUES (?,?,?)`)
        .run(req.params.id, composant_id, quantite);
      await auditLog(db, req.user?.id, 'NOMENCLATURE', 'article', req.params.id, { composant_id, quantite });
      res.status(201).json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/:id/nomenclature/:compId', async (req, res) => {
    try {
      await db.prepare(`DELETE FROM nomenclature_moteur WHERE moteur_id = ? AND composant_id = ?`).run(req.params.id, req.params.compId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // MARQUER comme unité assemblable/démontable
  // ============================================================
  router.put('/:id/marquer-unite', async (req, res) => {
    try {
      const { type_unite } = req.body;
      const validTypes = ['moteur', 'masque', 'boite', 'pont', 'train_avant', 'train_arriere', 'autre'];
      if (!validTypes.includes(type_unite)) return res.status(400).json({ error: `Type invalide. Valides: ${validTypes.join(', ')}` });

      await db.prepare(`UPDATE articles SET type_unite = ?, est_moteur = 1 WHERE id = ?`).run(type_unite, req.params.id);
      await auditLog(db, req.user?.id, 'MODIFICATION', 'article', req.params.id, { type_unite });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // SUPPRIMER le statut unité (l'article reste, juste le flag est retiré)
  // ============================================================
  router.delete('/:id/supprimer', async (req, res) => {
    try {
      const unit = await db.prepare(`SELECT * FROM articles WHERE id = ? AND (est_moteur = 1 OR type_unite IS NOT NULL)`).get(req.params.id);
      if (!unit) return res.status(404).json({ error: 'Unité introuvable' });

      await db.prepare(`UPDATE articles SET est_moteur = 0, type_unite = NULL WHERE id = ?`).run(req.params.id);
      await auditLog(db, req.user?.id, 'SUPPRESSION', 'unite', req.params.id, { reference: unit.reference });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // TYPES d'unités disponibles
  // ============================================================
  router.get('/meta/types', async (req, res) => {
    res.json([
      { value: 'moteur', label: 'Moteur' },
      { value: 'masque', label: 'Masque' },
      { value: 'boite', label: 'Boîte de vitesses' },
      { value: 'pont', label: 'Pont' },
      { value: 'train_avant', label: 'Train avant' },
      { value: 'train_arriere', label: 'Train arrière' },
      { value: 'autre', label: 'Autre' }
    ]);
  });

  return router;
};
