function auditLog(db, utilisateur_id, action, entite, entite_id, details, adresse_ip) {
  db.prepare(`
    INSERT INTO journal_audit (utilisateur_id, action, entite, entite_id, details, adresse_ip)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(utilisateur_id, action, entite, entite_id, JSON.stringify(details), adresse_ip);
}

function generateDocumentNumber(db, typeDocument) {
  const row = db.prepare(`SELECT * FROM sequences WHERE type_document = ?`).get(typeDocument);
  if (!row) return typeDocument + '-0001';

  const newVal = row.derniere_valeur + 1;
  const annee = new Date().getFullYear();
  const numero = `${row.prefixe}${annee}-${String(newVal).padStart(4, '0')}`;

  db.prepare(`UPDATE sequences SET derniere_valeur = ? WHERE type_document = ?`).run(newVal, typeDocument);
  return numero;
}

function updateClientSolde(db, clientId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN d.type_document IN ('facture_client','avoir_client') THEN d.net_a_payer ELSE 0 END), 0) as total_facture,
           COALESCE(SUM(p.montant), 0) as total_paye
    FROM documents d LEFT JOIN paiements_clients p ON p.client_id = d.client_id
    WHERE d.client_id = ? AND d.statut != 'annule'
  `).get(clientId);
  const solde = (row.total_facture || 0) - (row.total_paye || 0);
  db.prepare(`UPDATE clients SET solde_actuel = ? WHERE id = ?`).run(solde, clientId);
  return solde;
}

function updateArticleStock(db, articleId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN type_mouvement = 'entree' THEN quantite ELSE 0 END), 0) -
           COALESCE(SUM(CASE WHEN type_mouvement = 'sortie' THEN quantite ELSE 0 END), 0) as stock
    FROM mouvements_stock WHERE article_id = ?
  `).get(articleId);
  db.prepare(`UPDATE articles SET stock_actuel = ? WHERE id = ?`).run(row.stock || 0, articleId);
  return row.stock || 0;
}

module.exports = { auditLog, generateDocumentNumber, updateClientSolde, updateArticleStock };
