const express = require('express');
const router = express.Router();

module.exports = function(db) {
  router.get('/kpis', async (req, res) => {
    try {
      const now = new Date();
      const debutMois = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const caMois = await db.prepare(`SELECT COALESCE(SUM(net_a_payer), 0) as total FROM documents WHERE type_document = 'facture_client' AND statut NOT IN ('brouillon','annule') AND date_document >= ?`).get(debutMois);

      const facturesEmises = await db.prepare(`SELECT COUNT(*) as total FROM documents WHERE type_document = 'facture_client' AND statut NOT IN ('brouillon','annule') AND date_document >= ?`).get(debutMois);

      const devisEnCours = await db.prepare(`SELECT COUNT(*) as total FROM documents WHERE type_document = 'devis' AND statut IN ('brouillon','envoye')`).get();

      const stockTotal = await db.prepare(`SELECT SUM(stock_actuel * prix_achat_ht) as total FROM articles WHERE actif = 1`).get();

      const soldesClients = await db.prepare(`SELECT COALESCE(SUM(solde_actuel), 0) as total FROM clients WHERE actif = 1`).get();

      const articlesAlerte = await db.prepare(`SELECT COUNT(*) as total FROM articles WHERE actif = 1 AND stock_actuel <= stock_min AND stock_min > 0`).get();

      const moteursIncomplets = await db.prepare(`SELECT COUNT(*) as total FROM articles WHERE est_moteur = 1 AND moteur_complet = 0`).get();

      res.json({
        ca_mois: caMois.total,
        factures_emises: facturesEmises.total,
        devis_en_cours: devisEnCours.total,
        stock_total: stockTotal.total,
        soldes_clients: soldesClients.total,
        articles_alerte: articlesAlerte.total,
        moteurs_incomplets: moteursIncomplets.total
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/ca-mensuel', async (req, res) => {
    try {
      const annee = req.query.annee || new Date().getFullYear();
      const data = await db.prepare(`
        SELECT MONTH(date_document) as mois, 
               COALESCE(SUM(net_a_payer), 0) as montant
        FROM documents 
        WHERE type_document = 'facture_client' 
          AND statut NOT IN ('brouillon','annule')
          AND YEAR(date_document) = ?
        GROUP BY MONTH(date_document)
        ORDER BY mois
      `).all(String(annee));
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/top-articles', async (req, res) => {
    try {
      const data = await db.prepare(`
        SELECT a.reference, a.designation, SUM(dl.quantite) as total_qte, SUM(dl.montant_ttc) as total_ca
        FROM documents_lignes dl 
        JOIN articles a ON dl.article_id = a.id
        JOIN documents d ON dl.document_id = d.id
        WHERE d.type_document IN ('facture_client','bon_livraison')
          AND d.statut NOT IN ('brouillon','annule')
        GROUP BY dl.article_id
        ORDER BY total_qte DESC
        LIMIT 10
      `).all();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/categorie-repartition', async (req, res) => {
    try {
      const data = await db.prepare(`
        SELECT c.nom, c.code, COUNT(a.id) as total_articles, SUM(a.stock_actuel * a.prix_vente_ht) as valeur_stock
        FROM categories c LEFT JOIN articles a ON c.id = a.categorie_id AND a.actif = 1
        GROUP BY c.id
        ORDER BY valeur_stock DESC
      `).all();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/mouvements-recents', async (req, res) => {
    try {
      const data = await db.prepare(`
        SELECT m.*, a.reference, a.designation, u.nom as utilisateur_nom
        FROM mouvements_stock m
        LEFT JOIN articles a ON m.article_id = a.id
        LEFT JOIN utilisateurs u ON m.utilisateur_id = u.id
        ORDER BY m.created_at DESC LIMIT 20
      `).all();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
