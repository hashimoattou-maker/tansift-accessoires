const express = require('express');
const router = express.Router();
const { auditLog } = require('../utils/helpers');

module.exports = function(db) {
  router.get('/', async (req, res) => {
    try {
      const moteurs = await db.prepare(`SELECT a.*, c.nom as categorie_nom,
        (SELECT COUNT(*) FROM nomenclature_moteur WHERE moteur_id = a.id) as total_composants,
        (SELECT COUNT(*) FROM nomenclature_moteur nm JOIN articles ca ON nm.composant_id = ca.id WHERE nm.moteur_id = a.id AND ca.stock_actuel >= nm.quantite) as composants_disponibles
        FROM articles a LEFT JOIN categories c ON a.categorie_id = c.id WHERE a.est_moteur = 1
      `).all();

      const result = moteurs.map(m => ({
        ...m,
        etat: m.total_composants === 0 ? 'non_defini' :
              !m.moteur_complet ? 'partiel' :
              m.composants_disponibles === m.total_composants ? 'complet' :
              m.composants_disponibles === 0 ? 'manquant' : 'partiel'
      }));
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/:id/etat', async (req, res) => {
    try {
      const moteur = await db.prepare(`SELECT * FROM articles WHERE id = ? AND est_moteur = 1`).get(req.params.id);
      if (!moteur) return res.status(404).json({ error: 'Moteur introuvable' });

      const nomenclature = await db.prepare(`SELECT nm.*, a.reference, a.designation, a.stock_actuel, a.emplacement,
        CASE WHEN a.stock_actuel >= nm.quantite THEN 'present' WHEN a.stock_actuel > 0 THEN 'partiel' ELSE 'manquant' END as statut
        FROM nomenclature_moteur nm JOIN articles a ON nm.composant_id = a.id WHERE nm.moteur_id = ?
      `).all(req.params.id);

      const decompositions = await db.prepare(`SELECT d.*, u.nom as utilisateur_nom FROM decompositions d LEFT JOIN utilisateurs u ON d.utilisateur_id = u.id WHERE d.moteur_id = ? ORDER BY d.date_decomposition DESC`).all(req.params.id);

      res.json({ moteur, nomenclature, decompositions });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/:id/nomenclature', async (req, res) => {
    try {
      const { composant_id, quantite } = req.body;
      if (!composant_id || !quantite) return res.status(400).json({ error: 'Composant et quantité requis' });

      await db.prepare(`INSERT OR REPLACE INTO nomenclature_moteur (moteur_id, composant_id, quantite) VALUES (?,?,?)`)
        .run(req.params.id, composant_id, quantite);
      await auditLog(db, req.user?.id, 'NOMENCLATURE', 'moteur', req.params.id, { composant_id, quantite });
      res.status(201).json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/:id/desassembler', async (req, res) => {
    try {
      const { lignes } = req.body;
      if (!lignes || !Array.isArray(lignes) || lignes.length === 0)
        return res.status(400).json({ error: 'Sélectionnez au moins une pièce à extraire' });

      const moteur = await db.prepare(`SELECT * FROM articles WHERE id = ? AND est_moteur = 1`).get(req.params.id);
      if (!moteur) return res.status(404).json({ error: 'Moteur introuvable' });

      await db.run('START TRANSACTION');
      try {
        const decompResult = await db.prepare(`INSERT INTO decompositions (moteur_id, utilisateur_id, motif) VALUES (?,?,?)`)
          .run(req.params.id, req.user?.id, 'Désassemblage manuel');
        const decompId = decompResult.lastInsertRowid;

        for (const ligne of lignes) {
          await db.prepare(`INSERT INTO decompositions_lignes (decomposition_id, composant_id, quantite) VALUES (?,?,?)`)
            .run(decompId, ligne.composant_id, ligne.quantite || 1);

          const comp = await db.prepare(`SELECT stock_actuel FROM articles WHERE id = ?`).get(ligne.composant_id);
          if (comp) {
            const newStock = comp.stock_actuel + (ligne.quantite || 1);
            await db.prepare(`INSERT INTO mouvements_stock (article_id, type_mouvement, quantite, stock_avant, stock_apres, document_type, utilisateur_id, motif) VALUES (?,?,?,?,?,?,?,?)`)
              .run(ligne.composant_id, 'entree', ligne.quantite || 1, comp.stock_actuel, newStock, 'desassemblage', req.user?.id, `Désassemblage moteur ${moteur.reference}`);
            await db.prepare(`UPDATE articles SET stock_actuel = ? WHERE id = ?`).run(newStock, ligne.composant_id);
          }

          await db.prepare(`DELETE FROM nomenclature_moteur WHERE moteur_id = ? AND composant_id = ?`).run(req.params.id, ligne.composant_id);
        }

        await db.prepare(`UPDATE articles SET moteur_complet = 0 WHERE id = ?`).run(req.params.id);
        await db.run('COMMIT');
      } catch (txError) {
        await db.run('ROLLBACK');
        throw txError;
      }

      await auditLog(db, req.user?.id, 'DESASSEMBLAGE', 'moteur', req.params.id, { lignes });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/:id/reconstruire', async (req, res) => {
    try {
      const moteur = await db.prepare(`SELECT * FROM articles WHERE id = ? AND est_moteur = 1`).get(req.params.id);
      if (!moteur) return res.status(404).json({ error: 'Moteur introuvable' });

      const nomenclature = await db.prepare(`SELECT nm.*, a.stock_actuel, a.reference FROM nomenclature_moteur nm JOIN articles a ON nm.composant_id = a.id WHERE nm.moteur_id = ?`).all(req.params.id);

      if (nomenclature.length === 0) {
        return res.status(400).json({ error: 'Aucune pièce dans la nomenclature. Ajoutez des pièces avant de reconstruire.' });
      }

      await db.run('START TRANSACTION');
      try {
        for (const comp of nomenclature) {
          if (comp.stock_actuel < comp.quantite) {
            throw new Error(`Stock insuffisant pour ${comp.reference} (besoin: ${comp.quantite}, disponible: ${comp.stock_actuel})`);
          }
          const newStock = comp.stock_actuel - comp.quantite;
          await db.prepare(`INSERT INTO mouvements_stock (article_id, type_mouvement, quantite, stock_avant, stock_apres, document_type, utilisateur_id, motif) VALUES (?,?,?,?,?,?,?,?)`)
            .run(comp.composant_id, 'sortie', comp.quantite, comp.stock_actuel, newStock, 'reassemblage', req.user?.id, `Réassemblage moteur ${moteur.reference}`);
          await db.prepare(`UPDATE articles SET stock_actuel = ? WHERE id = ?`).run(newStock, comp.composant_id);
        }
        await db.prepare(`UPDATE articles SET moteur_complet = 1 WHERE id = ?`).run(req.params.id);
        await db.run('COMMIT');
      } catch (txError) {
        await db.run('ROLLBACK');
        throw txError;
      }

      await auditLog(db, req.user?.id, 'REASSEMBLAGE', 'moteur', req.params.id, {});
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
