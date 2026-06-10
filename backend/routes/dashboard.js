const express = require('express');
const router = express.Router();

module.exports = function(db) {
  router.get('/kpis', (req, res) => {
    const now = new Date();
    const debutMois = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const caMois = db.prepare(`SELECT COALESCE(SUM(net_a_payer), 0) as total FROM documents WHERE type_document = 'facture_client' AND statut NOT IN ('brouillon','annule') AND date_document >= ?`).get(debutMois);

    const facturesEmises = db.prepare(`SELECT COUNT(*) as total FROM documents WHERE type_document = 'facture_client' AND statut NOT IN ('brouillon','annule') AND date_document >= ?`).get(debutMois);

    const devisEnCours = db.prepare(`SELECT COUNT(*) as total FROM documents WHERE type_document = 'devis' AND statut IN ('brouillon','envoye')`).get();

    const stockTotal = db.prepare(`SELECT SUM(stock_actuel * prix_achat_ht) as total FROM articles WHERE actif = 1`).get();

    const soldesClients = db.prepare(`SELECT COALESCE(SUM(solde_actuel), 0) as total FROM clients WHERE actif = 1`).get();

    const articlesAlerte = db.prepare(`SELECT COUNT(*) as total FROM articles WHERE actif = 1 AND stock_actuel <= stock_min AND stock_min > 0`).get();

    const moteursIncomplets = db.prepare(`SELECT COUNT(*) as total FROM articles WHERE est_moteur = 1 AND moteur_complet = 0`).get();

    res.json({
      ca_mois: caMois.total,
      factures_emises: facturesEmises.total,
      devis_en_cours: devisEnCours.total,
      stock_total: stockTotal.total,
      soldes_clients: soldesClients.total,
      articles_alerte: articlesAlerte.total,
      moteurs_incomplets: moteursIncomplets.total
    });
  });

  router.get('/ca-mensuel', (req, res) => {
    const annee = req.query.annee || new Date().getFullYear();
    const data = db.prepare(`
      SELECT strftime('%m', date_document) as mois, 
             COALESCE(SUM(net_a_payer), 0) as montant
      FROM documents 
      WHERE type_document = 'facture_client' 
        AND statut NOT IN ('brouillon','annule')
        AND strftime('%Y', date_document) = ?
      GROUP BY strftime('%m', date_document)
      ORDER BY mois
    `).all(String(annee));
    res.json(data);
  });

  router.get('/top-articles', (req, res) => {
    const data = db.prepare(`
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
  });

  router.get('/categorie-repartition', (req, res) => {
    const data = db.prepare(`
      SELECT c.nom, c.code, COUNT(a.id) as total_articles, SUM(a.stock_actuel * a.prix_vente_ht) as valeur_stock
      FROM categories c LEFT JOIN articles a ON c.id = a.categorie_id AND a.actif = 1
      GROUP BY c.id
      ORDER BY valeur_stock DESC
    `).all();
    res.json(data);
  });

  router.get('/mouvements-recents', (req, res) => {
    const data = db.prepare(`
      SELECT m.*, a.reference, a.designation, u.nom as utilisateur_nom
      FROM mouvements_stock m
      LEFT JOIN articles a ON m.article_id = a.id
      LEFT JOIN utilisateurs u ON m.utilisateur_id = u.id
      ORDER BY m.created_at DESC LIMIT 20
    `).all();
    res.json(data);
  });

  return router;
};
