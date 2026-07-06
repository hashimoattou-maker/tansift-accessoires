async function auditLog(db, utilisateur_id, action, entite, entite_id, details, adresse_ip) {
  await db.prepare(`
    INSERT INTO journal_audit (utilisateur_id, action, entite, entite_id, details, adresse_ip)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(utilisateur_id, action, entite, entite_id, JSON.stringify(details), adresse_ip);
}

async function generateDocumentNumber(db, typeDocument) {
  const prefixes = {
    devis: 'DEV', demande_achat: 'DA', bon_commande_client: 'BCC',
    commande_fournisseur: 'CF', bon_livraison: 'BL', bon_reception: 'BR',
    facture_client: 'FAC', facture_fournisseur: 'FAF', avoir_client: 'AVOIR',
    avoir_fournisseur: 'AVOF'
  };
  const prefix = prefixes[typeDocument] || typeDocument.substring(0, 3).toUpperCase();
  const yyyy = new Date().getFullYear();
  const pattern = `${prefix}-%-${yyyy}`;

  const all = await db.prepare(`SELECT numero FROM documents WHERE numero LIKE ?`).all(`${prefix}-%-${yyyy}`);
  const used = new Set();
  for (const row of all) {
    if (!row.numero) continue;
    const parts = row.numero.split('-');
    const n = parseInt(parts[1], 10);
    if (!isNaN(n)) used.add(n);
  }
  let seq = 1;
  while (used.has(seq) && seq < 99999) seq++;

  return `${prefix}-${String(seq).padStart(5, '0')}-${yyyy}`;
}

async function generateSequentialCode(db, table, column, prefix, padLen = 4) {
  const rows = await db.prepare(`SELECT ${column} FROM ${table} WHERE ${column} LIKE ?`).all(`${prefix}%`);
  const used = new Set();
  for (const row of rows) {
    const raw = row[column];
    if (!raw || !raw.startsWith(prefix)) continue;
    const n = parseInt(raw.slice(prefix.length), 10);
    if (!isNaN(n)) used.add(n);
  }
  let next = 1;
  while (used.has(next) && next < 100000) next++;
  return `${prefix}${String(next).padStart(padLen, '0')}`;
}

async function updateClientSolde(db, clientId) {
  const row = await db.prepare(`
    SELECT 
      (SELECT COALESCE(SUM(net_a_payer), 0) FROM documents WHERE client_id = ? AND type_document IN ('facture_client','avoir_client','bon_livraison','bon_commande_client') AND statut != 'annule') as total_facture,
      (SELECT COALESCE(SUM(montant), 0) FROM paiements_clients WHERE client_id = ?) as total_paye
  `).get(clientId, clientId);
  const solde = (row.total_facture || 0) - (row.total_paye || 0);
  await db.prepare(`UPDATE clients SET solde_actuel = ? WHERE id = ?`).run(solde, clientId);
  return solde;
}

async function updateArticleStock(db, articleId) {
  const row = await db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN type_mouvement = 'entree' THEN quantite ELSE 0 END), 0) -
           COALESCE(SUM(CASE WHEN type_mouvement = 'sortie' THEN quantite ELSE 0 END), 0) as stock
    FROM mouvements_stock WHERE article_id = ?
  `).get(articleId);
  await db.prepare(`UPDATE articles SET stock_actuel = ? WHERE id = ?`).run(row.stock || 0, articleId);
  return row.stock || 0;
}

module.exports = { auditLog, generateDocumentNumber, generateSequentialCode, updateClientSolde, updateArticleStock };
