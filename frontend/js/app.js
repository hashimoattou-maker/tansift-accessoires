/* ============================================================
   Accessoires Tensift - Application SPA
   ============================================================ */

const API = '/api';
let token = localStorage.getItem('token') || null;
let currentUser = null;
let currentRoute = 'dashboard';
let currentParams = {};

// ==================== UTILITIES ====================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function html(strings, ...values) {
  return strings.reduce((acc, str, i) => acc + str + (values[i] || ''), '');
}

async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(`${API}${url}`, { ...options, headers });
    if (res.status === 401 || res.status === 403) { logout(); return null; }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur serveur');
    return data;
  } catch (e) {
    if (e.message !== 'Erreur serveur') showToast(e.message, 'error');
    throw e;
  }
}

function showToast(msg, type = 'info', duration = 3000) {
  const container = $('#toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.animation = 'toastOut 0.3s ease forwards'; setTimeout(() => toast.remove(), 300); }, duration);
}

function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatCurrency(n) {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

function formatNumber(n) {
  return new Intl.NumberFormat('fr-FR').format(n || 0);
}

function openModal(title, bodyHtml, footerHtml = '') {
  const overlay = $('#modalOverlay');
  const content = $('#modalContent');
  content.innerHTML = html`
    <div class="modal-header">
      <h2>${title}</h2>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">${bodyHtml}</div>
    ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
  `;
  overlay.classList.remove('hidden');
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
}

function closeModal() {
  $('#modalOverlay').classList.add('hidden');
}

function showSkeleton(container, count = 4, type = 'card') {
  if (type === 'card') {
    container.innerHTML = Array(count).fill(0).map(() => html`<div class="card skeleton skeleton-card"><div class="skeleton skeleton-text" style="width:40%"></div><div class="skeleton skeleton-text" style="width:80%"></div><div class="skeleton skeleton-text" style="width:60%"></div></div>`).join('');
  } else {
    container.innerHTML = Array(count).fill(0).map(() => html`<div class="skeleton skeleton-text" style="width:${Math.random()*40+30}%"></div>`).join('');
  }
}

// ==================== AUTH ====================
function login(email, password) {
  return apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, mot_de_passe: password })
  });
}

function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('token');
  $('#mainLayout').classList.add('hidden');
  $('#login').classList.remove('hidden');
  $('#loginForm').reset();
}

async function checkAuth() {
  if (!token) return false;
  try {
    currentUser = await apiFetch('/auth/me');
    if (currentUser) {
      $('#userName').textContent = currentUser.nom;
      $('#userRole').textContent = currentUser.role;
      $('#userAvatar').textContent = currentUser.nom.charAt(0).toUpperCase();
      if (currentUser.theme) document.documentElement.setAttribute('data-theme', currentUser.theme);
      return true;
    }
  } catch { return false; }
  return false;
}

// ==================== ROUTER ====================
function navigate(hash) {
  const path = hash.replace(/^#/, '') || 'dashboard';
  const parts = path.split('/');
  currentRoute = parts[0] + (parts[1] ? '-' + parts[1] : '');
  currentParams = {};
  if (parts[1]) currentParams.action = parts[1];
  if (parts[2]) currentParams.id = parts[2];

  // Update sidebar
  $$('.nav-item').forEach(el => el.classList.remove('active'));
  const navItem = document.querySelector(`[data-route="${currentRoute}"]`) || document.querySelector(`[data-route^="${currentRoute}"]`);
  if (navItem) navItem.classList.add('active');

  // Update breadcrumb
  renderBreadcrumb();

  // Render page
  renderPage();
}

function renderBreadcrumb() {
  const bread = $('#breadcrumb');
  const labels = {
    dashboard: 'Tableau de bord',
    articles: 'Articles & Stock',
    moteurs: 'Moteurs',
    clients: 'Clients',
    situation: 'Situation Clients',
    fournisseurs: 'Fournisseurs',
    'documents-achats': 'Achats',
    'documents-ventes': 'Ventes',
    unites: 'Unités Assemblables',
    barcodes: 'Codes-barres',
    rapports: 'Rapports',
    parametres: 'Paramètres',
    audit: 'Journal Audit'
  };
  bread.innerHTML = `<span class="breadcrumb-item">${labels[currentRoute] || currentRoute}</span>`;
}

function renderPage() {
  const page = $('#pageContent');
  const renderers = {
    dashboard: renderDashboard,
    articles: renderArticles,
    moteurs: renderMoteurs,
    clients: renderClients,
    situation: renderSituation,
    fournisseurs: renderFournisseurs,
    'documents-achats': (p) => renderDocuments('achats', p),
    'documents-ventes': (p) => renderDocuments('ventes', p),
    unites: renderUnites,
    barcodes: renderBarcodes,
    rapports: renderRapports,
    parametres: renderParametres,
    audit: renderAudit
  };
  const renderer = renderers[currentRoute] || renderDashboard;
  renderer(page);
}

// ==================== DASHBOARD ====================
async function renderDashboard(page) {
  page.innerHTML = '<div class="grid grid-4" id="kpiGrid">' + Array(7).fill(0).map(() => '<div class="card skeleton skeleton-card"></div>').join('') + '</div><div class="grid grid-2" style="margin-top:1rem"><div class="card skeleton" style="height:300px"></div><div class="card skeleton" style="height:300px"></div></div>';

  try {
    const [kpis, caData, topArticles, catRepart, mouvs] = await Promise.all([
      apiFetch('/dashboard/kpis'),
      apiFetch('/dashboard/ca-mensuel'),
      apiFetch('/dashboard/top-articles'),
      apiFetch('/dashboard/categorie-repartition'),
      apiFetch('/dashboard/mouvements-recents')
    ]);

    const kpiList = [
      { icon: '💰', label: 'CA du mois', value: formatCurrency(kpis.ca_mois) + ' MAD' },
      { icon: '📄', label: 'Factures émises', value: kpis.factures_emises },
      { icon: '📝', label: 'Devis en cours', value: kpis.devis_en_cours },
      { icon: '📦', label: 'Stock total', value: formatCurrency(kpis.stock_total) + ' MAD' },
      { icon: '💳', label: 'Soldes clients', value: formatCurrency(kpis.soldes_clients) + ' MAD' },
      { icon: '⚠️', label: 'Articles en alerte', value: kpis.articles_alerte, cls: kpis.articles_alerte > 0 ? 'down' : 'up' },
      { icon: '🔧', label: 'Moteurs incomplets', value: kpis.moteurs_incomplets, cls: kpis.moteurs_incomplets > 0 ? 'down' : 'up' }
    ];

    page.innerHTML = html`
      <div class="grid grid-4" id="kpiGrid">
        ${kpiList.map(k => html`
          <div class="card kpi-card">
            <div class="kpi-icon">${k.icon}</div>
            <div class="kpi-value">${k.value}</div>
            <div class="kpi-label">${k.label}</div>
          </div>
        `).join('')}
      </div>
      <div class="grid grid-2" style="margin-top:1rem">
        <div class="card"><div class="card-header"><h3>Top 10 Articles</h3></div>
          <table><thead><tr><th>Réf.</th><th>Désignation</th><th>Qté vendue</th><th>CA TTC</th></tr></thead>
          <tbody>${topArticles.length ? topArticles.map(a => html`<tr><td>${a.reference}</td><td>${a.designation}</td><td>${formatNumber(a.total_qte)}</td><td>${formatCurrency(a.total_ca)}</td></tr>`).join('') : '<tr><td colspan="4" class="empty-state">Aucune vente</td></tr>'}</tbody>
        </table></div>
        <div class="card"><div class="card-header"><h3>Mouvements récents</h3></div>
          <table><thead><tr><th>Article</th><th>Type</th><th>Qté</th><th>Date</th></tr></thead>
          <tbody>${mouvs.length ? mouvs.map(m => html`<tr><td>${m.reference || '-'}</td><td><span class="badge ${m.type_mouvement === 'entree' ? 'badge-success' : 'badge-danger'}">${m.type_mouvement}</span></td><td>${formatNumber(m.quantite)}</td><td>${formatDate(m.created_at)}</td></tr>`).join('') : '<tr><td colspan="4" class="empty-state">Aucun mouvement</td></tr>'}</tbody>
        </table></div>
      </div>
    `;
  } catch (e) {
    page.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><p>Erreur chargement tableau de bord</p></div>`;
  }
}

// ==================== ARTICLES ====================
async function renderArticles(page) {
  page.innerHTML = html`
    <div class="page-title">Articles & Stock <button class="btn btn-primary" onclick="showArticleForm()">+ Nouvel article</button></div>
    <div class="filters-bar">
      <input type="text" id="artSearch" class="form-control" placeholder="Référence, désignation..." style="width:200px" oninput="loadArticles()">
      <select id="artCategorie" class="form-select" style="width:150px" onchange="loadArticles()"><option value="">Toutes catégories</option></select>
      <select id="artFilter" class="form-select" style="width:150px" onchange="loadArticles()">
        <option value="">Tous articles</option><option value="alerte">Stock alerte</option><option value="rupture">En rupture</option>
      </select>
      <button class="btn btn-secondary btn-sm" onclick="exportArticlesCSV()">📥 CSV</button>
      <button class="btn btn-secondary btn-sm" onclick="importArticlesCSV()">📤 Importer</button>
    </div>
    <div class="card">
      <div class="table-container"><table>
        <thead><tr><th>Référence</th><th>Désignation</th><th>Catégorie</th><th>PA HT</th><th>PV HT</th><th>Stock</th><th>Min</th><th>Emplacement</th><th>Actions</th></tr></thead>
        <tbody id="artTableBody"></tbody>
      </table></div>
      <div id="artPagination" class="filters-bar" style="margin-top:0.5rem"></div>
    </div>
  `;

  // Load categories
  try {
    const cats = await apiFetch('/categories');
    const sel = $('#artCategorie');
    cats.forEach(c => { sel.innerHTML += `<option value="${c.id}">${c.nom}</option>`; });
  } catch {}

  window.showArticleForm = showArticleForm;
  window.loadArticles = loadArticles;
  window.exportArticlesCSV = exportArticlesCSV;
  window.importArticlesCSV = importArticlesCSV;
  window.editArticle = editArticle;
  window.deleteArticle = deleteArticle;

  loadArticles();
}

async function loadArticles() {
  const tbody = $('#artTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9"><div class="skeleton skeleton-text" style="width:100%"></div></td></tr>';

  const search = $('#artSearch')?.value || '';
  const cat = $('#artCategorie')?.value || '';
  const filter = $('#artFilter')?.value || '';
  let url = `/articles?limit=50&search=${encodeURIComponent(search)}`;
  if (cat) url += `&categorie_id=${cat}`;

  try {
    const data = await apiFetch(url);
    if (!data || !data.articles) { tbody.innerHTML = '<tr><td colspan="9">Aucun article</td></tr>'; return; }

    let articles = data.articles;
    if (filter === 'alerte') articles = articles.filter(a => a.stock_actuel <= a.stock_min && a.stock_min > 0);
    if (filter === 'rupture') articles = articles.filter(a => a.stock_actuel <= 0);

    tbody.innerHTML = articles.length ? articles.map(a => {
      const stockCls = a.stock_actuel <= 0 ? 'badge-danger' : a.stock_actuel <= a.stock_min ? 'badge-warning' : 'badge-success';
      return html`<tr data-id="${a.id}">
        <td><strong>${a.reference}</strong></td>
        <td>${a.designation}</td>
        <td><span class="badge badge-neutral">${a.categorie_nom || '-'}</span></td>
        <td>${formatCurrency(a.prix_achat_ht)}</td>
        <td>${formatCurrency(a.prix_vente_ht)}</td>
        <td><span class="badge ${stockCls}">${formatNumber(a.stock_actuel)}</span></td>
        <td>${formatNumber(a.stock_min)}</td>
        <td>${a.emplacement || '-'}</td>
        <td class="table-actions">
          <button class="btn btn-sm btn-secondary" onclick="editArticle(${a.id})">✏️</button>
          <button class="btn btn-sm btn-secondary" onclick="showArticleDetail(${a.id})">👁️</button>
          <button class="btn btn-sm btn-danger" onclick="deleteArticle(${a.id})">🗑️</button>
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="9"><div class="empty-state"><p>Aucun article trouvé</p></div></td></tr>';
  } catch {
    tbody.innerHTML = '<tr><td colspan="9">Erreur chargement</td></tr>';
  }
}

function showArticleForm(articleId) {
  const title = articleId ? 'Modifier article' : 'Nouvel article';
  const isEdit = !!articleId;

  apiFetch('/categories').then(cats => {
    const catOptions = cats.map(c => `<option value="${c.id}">${c.nom}</option>`).join('');
    const tvaOptions = `<option value="1">TVA 20%</option><option value="2">TVA 14%</option><option value="3">TVA 10%</option><option value="4">TVA 7%</option><option value="5">Exonéré</option>`;

    if (isEdit) {
      apiFetch(`/articles/${articleId}`).then(a => {
        openModal(title, html`
          <form id="articleForm" onsubmit="saveArticle(event, ${articleId})">
            <div class="form-row">
              <div class="form-group"><label>Référence *</label><input name="reference" class="form-control" value="${a.reference}" required></div>
              <div class="form-group"><label>Désignation *</label><input name="designation" class="form-control" value="${a.designation}" required></div>
            </div>
            <div class="form-group"><label>Description</label><textarea name="description" class="form-textarea">${a.description || ''}</textarea></div>
            <div class="form-row">
              <div class="form-group"><label>Catégorie</label><select name="categorie_id" class="form-select">${catOptions.replace(`value="${a.categorie_id}"`, `value="${a.categorie_id}" selected`)}</select></div>
              <div class="form-group"><label>Type</label><select name="type_article" class="form-select"><option value="accessoire" ${a.type_article==='accessoire'?'selected':''}>Accessoire</option><option value="moteur" ${a.type_article==='moteur'?'selected':''}>Moteur</option><option value="assemblage" ${a.type_article==='assemblage'?'selected':''}>Assemblage</option></select></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>PA HT</label><input name="prix_achat_ht" type="number" step="0.01" class="form-control" value="${a.prix_achat_ht}"></div>
              <div class="form-group"><label>PV HT</label><input name="prix_vente_ht" type="number" step="0.01" class="form-control" value="${a.prix_vente_ht}"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>TVA</label><select name="tva_id" class="form-select">${tvaOptions.replace(`value="${a.tva_id}"`, `value="${a.tva_id}" selected`)}</select></div>
              <div class="form-group"><label>Stock actuel</label><input name="stock_actuel" type="number" step="0.01" class="form-control" value="${a.stock_actuel}"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Emplacement</label><input name="emplacement" class="form-control" value="${a.emplacement || ''}"></div>
              <div class="form-group"><label>Stock min</label><input name="stock_min" type="number" step="0.01" class="form-control" value="${a.stock_min}"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Stock max</label><input name="stock_max" type="number" step="0.01" class="form-control" value="${a.stock_max}"></div>
              <div class="form-group"><label>Poids (kg)</label><input name="poids" type="number" step="0.01" class="form-control" value="${a.poids || ''}"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Volume (m³)</label><input name="volume" type="number" step="0.01" class="form-control" value="${a.volume || ''}"></div>
            </div>
          </form>
        `, `<button class="btn btn-secondary" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="document.getElementById('articleForm').requestSubmit()">Enregistrer</button>`);
      });
    } else {
      openModal(title, html`
        <form id="articleForm" onsubmit="saveArticle(event)">
          <div class="form-row">
            <div class="form-group"><label>Référence *</label><input name="reference" class="form-control" required></div>
            <div class="form-group"><label>Désignation *</label><input name="designation" class="form-control" required></div>
          </div>
          <div class="form-group"><label>Description</label><textarea name="description" class="form-textarea"></textarea></div>
          <div class="form-row">
            <div class="form-group"><label>Catégorie</label><select name="categorie_id" class="form-select">${catOptions}</select></div>
            <div class="form-group"><label>Type</label><select name="type_article" class="form-select"><option value="accessoire">Accessoire</option><option value="moteur">Moteur</option><option value="assemblage">Assemblage</option></select></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>PA HT</label><input name="prix_achat_ht" type="number" step="0.01" class="form-control" value="0"></div>
            <div class="form-group"><label>PV HT</label><input name="prix_vente_ht" type="number" step="0.01" class="form-control" value="0"></div>
          </div>
            <div class="form-row">
              <div class="form-group"><label>TVA</label><select name="tva_id" class="form-select">${tvaOptions}</select></div>
              <div class="form-group"><label>Stock actuel</label><input name="stock_actuel" type="number" step="0.01" class="form-control" value="0"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Emplacement</label><input name="emplacement" class="form-control"></div>
              <div class="form-group"><label>Stock min</label><input name="stock_min" type="number" step="0.01" class="form-control" value="0"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Stock max</label><input name="stock_max" type="number" step="0.01" class="form-control" value="0"></div>
            </div>
          </form>
        `, `<button class="btn btn-secondary" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="document.getElementById('articleForm').requestSubmit()">Créer</button>`);
    }
  });
}

async function saveArticle(e, id) {
  e.preventDefault();
  const form = $('#articleForm');
  const data = Object.fromEntries(new FormData(form));
  data.prix_achat_ht = parseFloat(data.prix_achat_ht) || 0;
  data.prix_vente_ht = parseFloat(data.prix_vente_ht) || 0;
  data.stock_min = parseFloat(data.stock_min) || 0;
  data.stock_max = parseFloat(data.stock_max) || 0;
  data.tva_id = parseInt(data.tva_id) || 1;
  data.categorie_id = parseInt(data.categorie_id) || null;
  data.type_article = data.type_article || 'accessoire';
  data.est_moteur = data.type_article === 'moteur' ? 1 : 0;
  data.stock_actuel = parseFloat(data.stock_actuel) || 0;

  try {
    if (id) {
      await apiFetch(`/articles/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      showToast('Article modifié', 'success');
    } else {
      await apiFetch('/articles', { method: 'POST', body: JSON.stringify(data) });
      showToast('Article créé', 'success');
    }
    closeModal();
    loadArticles();
  } catch (e) { showToast(e.message, 'error'); }
}

function editArticle(id) { showArticleForm(id); }

async function deleteArticle(id) {
  if (!confirm('Supprimer cet article ?')) return;
  try {
    const result = await apiFetch(`/articles/${id}`, { method: 'DELETE' });
    if (result && result.success) {
      showToast('Article supprimé', 'success');
      const row = document.querySelector(`tr[data-id="${id}"]`);
      if (row) row.remove();
      if (typeof loadArticles === 'function') await loadArticles();
    }
  } catch (e) {
    showToast('Erreur: ' + (e.message || 'suppression échouée'), 'error');
  }
}

function showArticleDetail(id) {
  apiFetch(`/articles/${id}`).then(a => {
    openModal(`Article: ${a.reference}`, html`
      <div class="stat-row"><div class="stat-item"><div class="stat-value">${formatNumber(a.stock_actuel)}</div><div class="stat-label">Stock</div></div>
      <div class="stat-item"><div class="stat-value">${formatCurrency(a.prix_vente_ht)}</div><div class="stat-label">PV HT</div></div>
      <div class="stat-item"><div class="stat-value">${formatCurrency(a.prix_achat_ht)}</div><div class="stat-label">PA HT</div></div>
      <div class="stat-item"><div class="stat-value">${formatCurrency(a.prix_vente_ht - a.prix_achat_ht)}</div><div class="stat-label">Marge</div></div></div>
      <div class="form-row" style="margin-top:1rem">
        <div class="form-group"><label>Référence</label><input class="form-control" value="${a.reference}" readonly></div>
        <div class="form-group"><label>Désignation</label><input class="form-control" value="${a.designation}" readonly></div>
      </div>
      <div class="form-group"><label>Description</label><textarea class="form-textarea" readonly>${a.description || ''}</textarea></div>
      <div class="form-group"><label>Emplacement</label><input class="form-control" value="${a.emplacement || '-'}" readonly></div>
      ${a.references?.length ? html`<div class="form-group"><label>Références alternatives</label>${a.references.map(r => html`<div class="badge badge-info" style="margin:2px">${r.type_reference}: ${r.code}</div>`).join('')}</div>` : ''}
      ${a.compatibilites?.length ? html`<div class="form-group"><label>Compatibilités</label><table><thead><tr><th>Marque</th><th>Modèle</th><th>Motorisation</th><th>Année</th></tr></thead><tbody>${a.compatibilites.map(c => html`<tr><td>${c.marque}</td><td>${c.modele}</td><td>${c.motorisation||'-'}</td><td>${c.annee_debut||''}-${c.annee_fin||''}</td></tr>`).join('')}</tbody></table></div>` : ''}
    `, `<button class="btn btn-secondary" onclick="closeModal()">Fermer</button>`);
  });
}

function exportArticlesCSV() {
  apiFetch('/articles?limit=10000').then(data => {
    if (!data?.articles?.length) { showToast('Aucun article à exporter', 'warning'); return; }
    let csv = 'Référence;Désignation;Catégorie;PA HT;PV HT;Stock;Stock Min;Emplacement\n';
    csv += data.articles.map(a => `${a.reference};${a.designation};${a.categorie_nom||''};${a.prix_achat_ht};${a.prix_vente_ht};${a.stock_actuel};${a.stock_min};${a.emplacement||''}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `articles-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    showToast('Export CSV téléchargé', 'success');
  });
}

function importArticlesCSV() {
  openModal('Import CSV Articles', html`
    <p style="margin-bottom:1rem;color:var(--text-secondary)">Format: Référence;Désignation;Catégorie;PA HT;PV HT;Stock;Stock Min;Emplacement</p>
    <input type="file" id="csvFile" accept=".csv" class="form-control" style="padding:0.5rem">
  `, `<button class="btn btn-secondary" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="processImportCSV()">Importer</button>`);
}

async function processImportCSV() {
  const file = $('#csvFile').files[0];
  if (!file) { showToast('Sélectionnez un fichier CSV', 'error'); return; }
  const text = await file.text();
  const lines = text.split('\n').slice(1).filter(l => l.trim());
  let count = 0;
  for (const line of lines) {
    const cols = line.split(';');
    if (cols.length < 2) continue;
    try {
      await apiFetch('/articles', { method: 'POST', body: JSON.stringify({ reference: cols[0], designation: cols[1], prix_achat_ht: parseFloat(cols[3])||0, prix_vente_ht: parseFloat(cols[4])||0, stock_actuel: parseFloat(cols[5])||0, stock_min: parseFloat(cols[6])||0, emplacement: cols[7] }) });
      count++;
    } catch {}
  }
  closeModal();
  showToast(`${count} articles importés`, 'success');
  loadArticles();
}

// ==================== MOTEURS ====================
function renderMoteurs(page) {
  page.innerHTML = html`
    <div class="page-title">Moteurs <button class="btn btn-primary" onclick="showMoteurForm()">+ Déclarer moteur</button></div>
    <div id="moteurList" class="grid grid-3"></div>
  `;
  loadMoteurs();
  window.showMoteurForm = showMoteurForm;
  window.showMoteurDetail = showMoteurDetail;
}

async function loadMoteurs() {
  const container = $('#moteurList');
  if (!container) return;
  container.innerHTML = '<div class="skeleton skeleton-card" style="height:120px"></div>'.repeat(3);

  try {
    const moteurs = await apiFetch('/moteurs');
    const etatLabels = { complet: 'Complet', partiel: 'Partiel', manquant: 'Manquant', non_defini: 'Non défini' };
    const etatIcons = { complet: '✅', partiel: '⚠️', manquant: '❌', non_defini: '⚪' };
    const etatClasses = { complet: 'badge-success', partiel: 'badge-warning', manquant: 'badge-danger', non_defini: 'badge-info' };
    container.innerHTML = moteurs.length ? moteurs.map(m => {
      const etatIcon = etatIcons[m.etat] || '❓';
      const etatCls = etatClasses[m.etat] || 'badge-info';
      return html`<div class="card">
        <div class="card-header"><h3>${etatIcon} ${m.reference}</h3></div>
        <p style="margin-bottom:0.5rem;font-weight:500">${m.designation}</p>
        <div class="stat-row" style="gap:0.5rem"><div class="stat-item" style="padding:0.5rem"><div class="stat-value" style="font-size:1rem">${formatNumber(m.total_composants||0)}</div><div class="stat-label">Pièces</div></div>
        <div class="stat-item" style="padding:0.5rem"><div class="stat-value" style="font-size:1rem">${formatNumber(m.composants_disponibles||0)}</div><div class="stat-label">Disponibles</div></div></div>
        <div style="margin-top:0.5rem;display:flex;gap:0.3rem;flex-wrap:wrap">
          <span class="badge ${etatCls}">${etatLabels[m.etat] || m.etat}</span>
          <button class="btn btn-sm btn-secondary" onclick="showMoteurDetail(${m.id})">Détail</button>
        </div>
      </div>`;
    }).join('') : '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🔧</div><p>Aucun moteur enregistré</p></div>';
  } catch { container.innerHTML = '<div class="empty-state">Erreur chargement</div>'; }
}

function showMoteurDetail(id) {
  apiFetch(`/moteurs/${id}/etat`).then(data => {
    const { moteur, nomenclature, decompositions } = data;
    let htmlContent = html`<div class="card-header"><h3>${moteur.reference} - ${moteur.designation}</h3></div><p>Stock moteur: <strong>${formatNumber(moteur.stock_actuel)}</strong></p>`;
    htmlContent += '<h4 style="margin:1rem 0 0.5rem">Nomenclature (BOM)</h4>';
    htmlContent += '<table><thead><tr><th>Réf.</th><th>Désignation</th><th>Qté</th><th>Stock</th><th>Statut</th></tr></thead><tbody>';
    htmlContent += nomenclature.length ? nomenclature.map(n => {
      const icon = n.statut === 'present' ? '✅' : n.statut === 'partiel' ? '⚠️' : '❌';
      return html`<tr><td>${n.reference}</td><td>${n.designation}</td><td>${formatNumber(n.quantite)}</td><td>${formatNumber(n.stock_actuel)}</td><td>${icon} ${n.statut}</td></tr>`;
    }).join('') : '<tr><td colspan="5">Aucune nomenclature</td></tr>';
    htmlContent += '</tbody></table>';
    htmlContent += '<div style="margin-top:1rem;display:flex;gap:0.5rem;flex-wrap:wrap">';
    htmlContent += `<button class="btn btn-primary btn-sm" onclick="ajouterPieceNomenclature(${moteur.id})">+ Ajouter pièce</button>`;
    if (moteur.moteur_complet) {
      htmlContent += `<button class="btn btn-warning btn-sm" onclick="desassemblerMoteur(${moteur.id})">🔧 Désassembler</button>`;
    } else if (nomenclature.length > 0) {
      htmlContent += `<button class="btn btn-success btn-sm" onclick="reconstruireMoteur(${moteur.id})">🔨 Reconstruire</button>`;
    }
    htmlContent += '</div>';

    if (decompositions?.length) {
      htmlContent += '<h4 style="margin:1rem 0 0.5rem">Historique décompositions</h4><table><thead><tr><th>Date</th><th>Utilisateur</th><th>Motif</th></tr></thead><tbody>';
      htmlContent += decompositions.map(d => html`<tr><td>${formatDate(d.date_decomposition)}</td><td>${d.utilisateur_nom||'-'}</td><td>${d.motif||'-'}</td></tr>`).join('');
      htmlContent += '</tbody></table>';
    }

    openModal(`Détail Moteur`, htmlContent, `<button class="btn btn-secondary" onclick="closeModal()">Fermer</button>`);
  });
}

window.desassemblerMoteur = async function(id) {
  try {
    const data = await apiFetch(`/moteurs/${id}/etat`);
    const lignesDispo = data.nomenclature.filter(n => n.stock_actuel > 0);
    if (!lignesDispo.length) { showToast('Aucune pièce disponible au désassemblage', 'warning'); return; }

    openModal('Désassembler moteur', html`
      <p>Sélectionnez les pièces à extraire du stock moteur :</p>
      <div id="desassList" style="margin-top:1rem">${lignesDispo.map(n => html`
        <div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;border-bottom:1px solid var(--border-light)">
          <input type="checkbox" class="desass-check" data-id="${n.composant_id}" data-name="${n.designation}" data-max="${Math.min(n.stock_actuel, n.quantite)}" checked style="flex-shrink:0">
          <span style="flex:1">${n.designation} (stock: ${formatNumber(n.stock_actuel)})</span>
          <input type="number" class="desass-qte form-control" value="${Math.min(n.stock_actuel, n.quantite)}" min="1" max="${Math.min(n.stock_actuel, n.quantite)}" style="width:70px">
        </div>
      `).join('')}</div>
    `, html`
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-warning" onclick="confirmDesassembler(${id})">Désassembler</button>
    `);
  } catch (e) { showToast(e.message, 'error'); }
};

window.confirmDesassembler = async function(id) {
  const checks = $$('.desass-check:checked');
  const qtes = $$('.desass-qte');
  const lignes = Array.from(checks).map((c, i) => ({ composant_id: parseInt(c.dataset.id), quantite: parseInt(qtes[i]?.value) || 1 }));
  if (!lignes.length) { showToast('Sélectionnez au moins une pièce', 'error'); return; }
  try {
    await apiFetch(`/moteurs/${id}/desassembler`, { method: 'POST', body: JSON.stringify({ lignes }) });
    showToast('Moteur désassemblé', 'success');
    closeModal();
    loadMoteurs();
  } catch (e) { showToast(e.message, 'error'); }
};

window.reconstruireMoteur = async function(id) {
  try {
    await apiFetch(`/moteurs/${id}/reconstruire`, { method: 'POST' });
    showToast('Moteur reconstruit', 'success');
    loadMoteurs();
  } catch (e) { showToast(e.message, 'error'); }
};

window.ajouterPieceNomenclature = async function(id) {
  try {
    const articles = await apiFetch('/articles?actif=1&limit=100');
    const moteur = await apiFetch(`/moteurs/${id}/etat`);
    const idsNomenclature = moteur.nomenclature.map(n => n.composant_id);
    const disponibles = (articles?.articles || []).filter(a => !idsNomenclature.includes(a.id) && a.id !== id);

    openModal('Ajouter une pièce à la nomenclature', html`
      <div class="form-group"><label>Pièce</label><select id="nomenclaturePiece" class="form-select">${disponibles.map(a => html`<option value="${a.id}">${a.reference} - ${a.designation}</option>`).join('')}</select></div>
      <div class="form-group"><label>Quantité</label><input id="nomenclatureQte" type="number" class="form-control" value="1" min="1"></div>
    `, html`
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="confirmAjouterPiece(${id})">Ajouter</button>
    `);
  } catch (e) { showToast(e.message, 'error'); }
};

window.confirmAjouterPiece = async function(id) {
  const composant_id = parseInt($('#nomenclaturePiece').value);
  const quantite = parseInt($('#nomenclatureQte').value) || 1;
  if (!composant_id) { showToast('Sélectionnez une pièce', 'error'); return; }
  try {
    await apiFetch(`/moteurs/${id}/nomenclature`, { method: 'POST', body: JSON.stringify({ composant_id, quantite }) });
    showToast('Pièce ajoutée à la nomenclature', 'success');
    closeModal();
    setTimeout(() => showMoteurDetail(id), 300);
  } catch (e) { showToast(e.message, 'error'); }
};

function showMoteurForm() {
  apiFetch('/articles?type=moteur&actif=1&limit=100').then(data => {
    const moteurs = data?.articles?.filter(a => a.est_moteur) || [];
    openModal('Gestion moteurs', html`
      <p>Les articles de type "Moteur" sont gérés ici. Vous pouvez déclarer un article existant comme moteur.</p>
      ${moteurs.length ? html`
        <h4 style="margin:1rem 0 0.5rem">Moteurs existants</h4>
        <table><thead><tr><th>Réf.</th><th>Désignation</th><th>Stock</th><th>État</th></tr></thead>
        <tbody>${moteurs.map(m => html`<tr><td>${m.reference}</td><td>${m.designation}</td><td>${formatNumber(m.stock_actuel)}</td><td>${m.moteur_complet ? '✅ Complet' : '❌ Incomplet'}</td></tr>`).join('')}</tbody></table>
      ` : '<p class="empty-state">Aucun moteur. Créez d\'abord un article de type "moteur".</p>'}
    `, `<button class="btn btn-secondary" onclick="closeModal()">Fermer</button>`);
  });
}

// ==================== UNITÉS ASSEMBLABLES ====================
function renderUnites(page) {
  page.innerHTML = html`
    <div class="page-title">Unités Assemblables <button class="btn btn-primary" onclick="showMarquerUnite()">+ Marquer article comme unité</button></div>
    <div class="filters-bar">
      <input type="text" id="uniteSearch" class="form-control" placeholder="Référence, désignation..." style="width:250px" oninput="loadUnites()">
      <select id="uniteTypeFilter" class="form-select" style="width:180px" onchange="loadUnites()">
        <option value="">Tous types</option>
        <option value="moteur">Moteur</option><option value="masque">Masque</option><option value="boite">Boîte</option>
        <option value="pont">Pont</option><option value="train_avant">Train avant</option><option value="train_arriere">Train arrière</option>
        <option value="autre">Autre</option>
      </select>
    </div>
    <div id="uniteList" class="grid grid-3"></div>
  `;
  loadUnites();
  window.showMarquerUnite = showMarquerUnite;
  window.showUniteDetail = showUniteDetail;
}

async function loadUnites() {
  const container = $('#uniteList');
  if (!container) return;
  container.innerHTML = '<div class="skeleton skeleton-card" style="height:120px"></div>'.repeat(3);
  try {
    const type = $('#uniteTypeFilter')?.value || '';
    const search = $('#uniteSearch')?.value || '';
    let url = '/unites?';
    if (type) url += `type=${type}&`;
    if (search) url += `search=${encodeURIComponent(search)}`;
    const units = await apiFetch(url);
    const typeLabels = { moteur: 'Moteur', masque: 'Masque', boite: 'Boîte', pont: 'Pont', train_avant: 'Train avant', train_arriere: 'Train arrière', autre: 'Autre' };
    const etatClasses = { complet: 'badge-success', partiel: 'badge-warning', manquant: 'badge-danger', non_defini: 'badge-info' };
    const etatLabels = { complet: 'Complet', partiel: 'Partiel', manquant: 'Manquant', non_defini: 'Non défini' };
    container.innerHTML = units.length ? units.map(u => html`<div class="card">
      <div class="card-header"><h3>${u.reference}</h3><span class="badge badge-neutral">${typeLabels[u.type_unite] || 'Unité'}</span></div>
      <p style="margin-bottom:0.5rem;font-weight:500">${u.designation}</p>
      <div class="stat-row" style="gap:0.5rem">
        <div class="stat-item" style="padding:0.5rem"><div class="stat-value" style="font-size:1rem">${formatNumber(u.stock_unite || 0)}</div><div class="stat-label">Unités</div></div>
        <div class="stat-item" style="padding:0.5rem"><div class="stat-value" style="font-size:1rem">${formatNumber(u.total_composants || 0)}</div><div class="stat-label">Pièces</div></div>
        <div class="stat-item" style="padding:0.5rem"><div class="stat-value" style="font-size:1rem">${formatNumber(u.composants_disponibles || 0)}</div><div class="stat-label">Dispo</div></div>
      </div>
      <div style="margin-top:0.5rem;display:flex;gap:0.3rem;flex-wrap:wrap">
        <span class="badge ${etatClasses[u.etat] || 'badge-info'}">${etatLabels[u.etat] || u.etat}</span>
        <span class="badge badge-info">${formatNumber(u.total_assemblages || 0)} assembl.</span>
        <span class="badge badge-warning">${formatNumber(u.total_desassemblages || 0)} désass.</span>
      </div>
      <div style="margin-top:0.5rem;display:flex;gap:0.3rem">
        <button class="btn btn-sm btn-secondary" onclick="showUniteDetail(${u.id})">Détail</button>
        <button class="btn btn-sm btn-danger" onclick="deleteUnite(${u.id}, '${u.reference}')">Supprimer</button>
        ${u.etat === 'complet' ? `<button class="btn btn-sm btn-warning" onclick="showDesassemblerUnite(${u.id})">Désassembler</button>` : ''}
        ${u.etat === 'complet' || u.etat === 'partiel' ? `<button class="btn btn-sm btn-success" onclick="showAssemblerUnite(${u.id})">Assembler +1</button>` : ''}
      </div>
    </div>`).join('') : '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🔧</div><p>Aucune unité assemblable</p><p style="font-size:0.8rem">Marquez un article comme unité pour commencer</p></div>';
  } catch { container.innerHTML = '<div class="empty-state">Erreur chargement</div>'; }
}

window.showMarquerUnite = async function() {
  try {
    const data = await apiFetch('/articles?actif=1&limit=200');
    const articles = (data?.articles || []).filter(a => !a.est_moteur && !a.type_unite);
    openModal('Marquer un article comme unité assemblable', html`
      <div class="form-group"><label>Article</label><select id="marquerArticleId" class="form-select">${articles.map(a => html`<option value="${a.id}">${a.reference} - ${a.designation}</option>`).join('')}</select></div>
      <div class="form-group"><label>Type d'unité</label><select id="marquerTypeUnite" class="form-select">
        <option value="moteur">Moteur</option><option value="masque">Masque</option><option value="boite">Boîte de vitesses</option>
        <option value="pont">Pont</option><option value="train_avant">Train avant</option><option value="train_arriere">Train arrière</option>
        <option value="autre">Autre</option>
      </select></div>
    `, html`
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="confirmMarquerUnite()">Marquer</button>
    `);
  } catch (e) { showToast(e.message, 'error'); }
};

window.confirmMarquerUnite = async function() {
  const articleId = parseInt($('#marquerArticleId').value);
  const typeUnite = $('#marquerTypeUnite').value;
  if (!articleId) { showToast('Sélectionnez un article', 'error'); return; }
  try {
    await apiFetch(`/unites/${articleId}/marquer-unite`, { method: 'PUT', body: JSON.stringify({ type_unite: typeUnite }) });
    showToast('Article marqué comme unité assemblable', 'success');
    closeModal();
    loadUnites();
  } catch (e) { showToast(e.message, 'error'); }
};

window.showUniteDetail = async function(id) {
  try {
    const data = await apiFetch(`/unites/${id}`);
    const { unite: u, nomenclature, assemblages, decompositions, ventes, mouvements } = data;
    const typeLabels = { moteur: 'Moteur', masque: 'Masque', boite: 'Boîte', pont: 'Pont', train_avant: 'Train avant', train_arriere: 'Train arrière', autre: 'Autre' };

    let htmlContent = html`
      <div class="stat-row" style="margin-bottom:1rem">
        <div class="stat-item"><div class="stat-value">${typeLabels[u.type_unite] || 'Unité'}</div><div class="stat-label">Type</div></div>
        <div class="stat-item"><div class="stat-value">${formatNumber(u.stock_unite || 0)}</div><div class="stat-label">En stock</div></div>
        <div class="stat-item"><div class="stat-value">${formatNumber(nomenclature.length)}</div><div class="stat-label">Composants</div></div>
      </div>`;

    // Nomenclature
    htmlContent += '<h4 style="margin:1rem 0 0.5rem">Nomenclature (BOM)</h4>';
    htmlContent += '<table><thead><tr><th>Réf.</th><th>Désignation</th><th>Qté</th><th>Stock</th><th>Prix</th><th>Statut</th></tr></thead><tbody>';
    htmlContent += nomenclature.length ? nomenclature.map(n => html`<tr><td>${n.reference}</td><td>${n.designation}</td><td>${formatNumber(n.quantite)}</td><td>${formatNumber(n.stock_actuel)}</td><td>${formatCurrency(n.prix_vente_ht)}</td><td>${n.statut_stock === 'disponible' ? '✅' : n.statut_stock === 'partiel' ? '⚠️' : '❌'} ${n.statut_stock}</td></tr>`).join('') : '<tr><td colspan="6">Aucune nomenclature définie</td></tr>';
    htmlContent += '</tbody></table>';
    htmlContent += `<div style="margin:0.5rem 0"><button class="btn btn-sm btn-secondary" onclick="ajouterPieceNomenclatureUnite(${u.id})">+ Ajouter pièce nomenclature</button></div>`;

    // Assemblages
    if (assemblages.length) {
      htmlContent += '<h4 style="margin:1rem 0 0.5rem">Assemblages</h4><table><thead><tr><th>Date</th><th>Qté</th><th>Utilisateur</th><th>Motif</th><th>Pièces</th></tr></thead><tbody>';
      htmlContent += assemblages.map(a => html`<tr><td>${formatDate(a.date_assemblage)}</td><td>${formatNumber(a.quantite)}</td><td>${a.utilisateur_nom || '-'}</td><td>${a.motif || '-'}</td><td>${a.lignes?.map(l => `${l.comp_ref} x${l.quantite}`).join(', ') || '-'}</td></tr>`).join('');
      htmlContent += '</tbody></table>';
    }

    // Désassemblages
    if (decompositions.length) {
      htmlContent += '<h4 style="margin:1rem 0 0.5rem">Désassemblages</h4><table><thead><tr><th>Date</th><th>Utilisateur</th><th>Motif</th><th>Pièces extraites</th></tr></thead><tbody>';
      htmlContent += decompositions.map(d => html`<tr><td>${formatDate(d.date_decomposition)}</td><td>${d.utilisateur_nom || '-'}</td><td>${d.motif || '-'}</td><td>${d.lignes?.map(l => `${l.comp_ref} x${l.quantite}`).join(', ') || '-'}</td></tr>`).join('');
      htmlContent += '</tbody></table>';
    }

    // Ventes
    if (ventes.length) {
      htmlContent += '<h4 style="margin:1rem 0 0.5rem">Ventes de pièces</h4><table><thead><tr><th>Date</th><th>Client</th><th>Pièce</th><th>Qté</th><th>Prix</th><th>Document</th></tr></thead><tbody>';
      htmlContent += ventes.map(v => html`<tr><td>${formatDate(v.date_document)}</td><td>${v.client_nom || '-'}</td><td>${v.designation || v.art_designation || '-'}</td><td>${formatNumber(v.quantite)}</td><td>${formatCurrency(v.montant_ht)} HT</td><td><span class="badge badge-info">${v.doc_numero}</span> ${v.type_document}</td></tr>`).join('');
      htmlContent += '</tbody></table>';
    }

    // Actions
    htmlContent += '<div style="margin-top:1rem;display:flex;gap:0.5rem;flex-wrap:wrap">';
    if ((u.stock_unite || 0) > 0) htmlContent += `<button class="btn btn-warning btn-sm" onclick="closeModal();showDesassemblerUnite(${u.id})">Désassembler</button>`;
    htmlContent += `<button class="btn btn-success btn-sm" onclick="closeModal();showAssemblerUnite(${u.id})">Assembler</button>`;
    htmlContent += '</div>';

    openModal(`${u.reference} — ${u.designation}`, htmlContent, `<button class="btn btn-secondary" onclick="closeModal()">Fermer</button>`);
  } catch (e) { showToast(e.message, 'error'); }
};

window.showAssemblerUnite = async function(id) {
  try {
    const data = await apiFetch(`/unites/${id}`);
    const { unite: u, nomenclature } = data;
    const disponibles = nomenclature.filter(n => n.statut_stock !== 'manquant');

    openModal(`Assembler ${u.reference}`, html`
      <p>Pièces disponibles pour assembler :</p>
      ${disponibles.length ? html`<div style="margin-top:0.5rem">${disponibles.map(n => html`
        <div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;border-bottom:1px solid var(--border-light)">
          <span style="flex:1">${n.reference} — ${n.designation}</span>
          <span class="badge ${n.statut_stock === 'disponible' ? 'badge-success' : 'badge-warning'}">${n.statut_stock} (${formatNumber(n.stock_actuel)})</span>
        </div>`).join('')}</div>` : '<p style="color:var(--danger)">Aucune pièce disponible</p>'}
      <div class="form-group" style="margin-top:1rem"><label>Quantité à assembler</label><input id="assemblQte" type="number" class="form-control" value="1" min="1"></div>
      <div class="form-group"><label>Motif</label><input id="assemblMotif" type="text" class="form-control" placeholder="Optionnel"></div>
    `, html`
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-success" onclick="confirmAssembler(${id})">Assembler</button>
    `);
  } catch (e) { showToast(e.message, 'error'); }
};

window.confirmAssembler = async function(id) {
  const qte = parseInt($('#assemblQte').value) || 1;
  const motif = $('#assemblMotif')?.value || '';
  try {
    await apiFetch(`/unites/${id}/assembler`, { method: 'POST', body: JSON.stringify({ quantite: qte, motif }) });
    showToast('Unité assemblée', 'success');
    closeModal();
    loadUnites();
  } catch (e) { showToast(e.message, 'error'); }
};

window.showDesassemblerUnite = async function(id) {
  try {
    const data = await apiFetch(`/unites/${id}`);
    const { unite: u, nomenclature } = data;
    const dispos = nomenclature.filter(n => n.stock_actuel > 0);

    openModal(`Désassembler ${u.reference}`, html`
      <p>Unités en stock : <strong>${formatNumber(u.stock_unite || 0)}</strong></p>
      <p>Sélectionnez les pièces à extraire :</p>
      <div id="desassUniteList" style="margin-top:0.5rem">${dispos.map(n => html`
        <div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;border-bottom:1px solid var(--border-light)">
          <input type="checkbox" class="desass-check" data-id="${n.composant_id}" checked style="flex-shrink:0">
          <span style="flex:1">${n.reference} — ${n.designation}</span>
          <input type="number" class="desass-qte form-control" value="${Math.min(n.stock_actuel, n.quantite)}" min="1" max="${Math.min(n.stock_actuel, n.quantite)}" style="width:70px">
        </div>`).join('')}</div>
      <div class="form-group" style="margin-top:0.5rem"><label>Motif</label><input id="desassMotif" type="text" class="form-control" placeholder="Optionnel"></div>
    `, html`
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-warning" onclick="confirmDesassemblerUnite(${id})">Désassembler</button>
    `);
  } catch (e) { showToast(e.message, 'error'); }
};

window.confirmDesassemblerUnite = async function(id) {
  const checks = $$('.desass-check:checked');
  const qtes = $$('.desass-qte');
  const lignes = Array.from(checks).map((c, i) => ({ composant_id: parseInt(c.dataset.id), quantite: parseInt(qtes[i]?.value) || 1 }));
  if (!lignes.length) { showToast('Sélectionnez au moins une pièce', 'error'); return; }
  const motif = $('#desassMotif')?.value || '';
  try {
    const result = await apiFetch(`/unites/${id}/desassembler`, { method: 'POST', body: JSON.stringify({ lignes, motif }) });
    showToast('Unité désassemblée', 'success');
    closeModal();
    // Récupérer les détails des pièces extraites et ouvrir le formulaire document
    const piecesIds = result.pieces_extraites.map(p => p.composant_id);
    const articlesData = await apiFetch('/articles?actif=1&limit=200');
    const allArticles = articlesData?.articles || [];
    const piecesExtraites = result.pieces_extraites.map(p => {
      const art = allArticles.find(a => a.id === p.composant_id);
      return { article_id: p.composant_id, reference: art?.reference || '', designation: art?.designation || '', quantite: p.quantite, prix_vente_ht: art?.prix_vente_ht || 0, tva: 20 };
    });
    showDocumentAfterDesassemblage(piecesExtraites);
  } catch (e) { showToast(e.message, 'error'); }
};

function showDocumentAfterDesassemblage(pieces) {
  apiFetch('/clients?limit=200').then(async clientsData => {
    const clients = clientsData?.clients || [];
    const clientOpts = clients.map(c => `<option value="${c.id}">${c.raison_sociale} (${c.code_client})</option>`).join('');

    openModal('Créer un document pour les pièces extraites', html`
      <div class="form-row">
        <div class="form-group"><label>Type de document *</label><select id="docTypeDesass" class="form-select">
          <option value="devis">Devis</option><option value="bon_livraison">Bon de livraison</option><option value="facture_client">Facture</option>
        </select></div>
        <div class="form-group"><label>Client *</label><select id="docClientDesass" class="form-select"><option value="">— Sélectionner —</option>${clientOpts}</select></div>
      </div>
      <h4 style="margin:0.8rem 0 0.4rem">Pièces extraites</h4>
      <div class="card" style="padding:0">
        <table style="width:100%;font-size:0.85rem">
          <thead><tr><th>Réf.</th><th>Désignation</th><th>Qté</th><th>PU HT</th><th>Total HT</th></tr></thead>
          <tbody id="desassDocLignes">${pieces.map((p, i) => {
            const total = p.quantite * p.prix_vente_ht;
            return html`<tr>
              <td>${p.reference}</td><td>${p.designation}</td>
              <td><input type="number" class="form-control desass-qte-doc" value="${p.quantite}" min="1" style="width:60px" data-idx="${i}" oninput="updateDesassTotal()"></td>
              <td><input type="number" step="0.01" class="form-control desass-pu-doc" value="${p.prix_vente_ht}" min="0" style="width:80px" data-idx="${i}" oninput="updateDesassTotal()"></td>
              <td class="desass-total-line" data-idx="${i}">${formatCurrency(total)} MAD</td>
            </tr>`;
          }).join('')}</tbody>
          <tfoot><tr><td colspan="4" style="text-align:right;font-weight:700">Total HT:</td><td id="desassTotalHT" style="font-weight:700">${formatCurrency(pieces.reduce((s, p) => s + p.quantite * p.prix_vente_ht, 0))} MAD</td></tr>
          <tr><td colspan="4" style="text-align:right">TVA 20%:</td><td id="desassTotalTVA">${formatCurrency(pieces.reduce((s, p) => s + p.quantite * p.prix_vente_ht * 0.2, 0))} MAD</td></tr>
          <tr><td colspan="4" style="text-align:right;font-weight:700;font-size:1rem">NET À PAYER:</td><td id="desassNetPayer" style="font-weight:700;font-size:1rem;color:var(--accent)">${formatCurrency(pieces.reduce((s, p) => s + p.quantite * p.prix_vente_ht * 1.2, 0))} MAD</td></tr></tfoot>
        </table>
      </div>
      <div class="form-group" style="margin-top:0.5rem"><label>Notes</label><textarea id="docNotesDesass" class="form-textarea" rows="2" placeholder="Optionnel"></textarea></div>
    `, html`
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="confirmCreerDocDesass(${JSON.stringify(pieces).replace(/"/g, '&quot;')})">Créer le document</button>
    `);

    window.updateDesassTotal = updateDesassTotal;
  });
}

function updateDesassTotal() {
  const lignes = $$('.desass-qte-doc');
  const pus = $$('.desass-pu-doc');
  const totals = $$('.desass-total-line');
  let totalHT = 0;
  lignes.forEach((l, i) => {
    const qte = parseFloat(l.value) || 0;
    const pu = parseFloat(pus[i]?.value) || 0;
    const ht = qte * pu;
    totalHT += ht;
    if (totals[i]) totals[i].textContent = formatCurrency(ht) + ' MAD';
  });
  const tva = totalHT * 0.2;
  const ttc = totalHT + tva;
  const htEl = $('#desassTotalHT');
  const tvaEl = $('#desassTotalTVA');
  const netEl = $('#desassNetPayer');
  if (htEl) htEl.textContent = formatCurrency(totalHT) + ' MAD';
  if (tvaEl) tvaEl.textContent = formatCurrency(tva) + ' MAD';
  if (netEl) netEl.textContent = formatCurrency(ttc) + ' MAD';
}

window.confirmCreerDocDesass = async function(piecesOrig) {
  const type_document = $('#docTypeDesass')?.value;
  const client_id = parseInt($('#docClientDesass')?.value);
  if (!client_id) { showToast('Sélectionnez un client', 'error'); return; }

  const qtes = $$('.desass-qte-doc');
  const pus = $$('.desass-pu-doc');
  const lignes = piecesOrig.map((p, i) => ({
    article_id: p.article_id,
    source_unit_id: p.source_unit_id || null,
    quantite: parseFloat(qtes[i]?.value) || p.quantite,
    prix_unitaire_ht: parseFloat(pus[i]?.value) || p.prix_vente_ht,
    taux_tva: 20,
    reference: p.reference,
    designation: p.designation
  }));

  try {
    const result = await apiFetch('/documents', { method: 'POST', body: JSON.stringify({
      type_document, client_id, lignes,
      notes: $('#docNotesDesass')?.value || `Pièces extraites par désassemblage`
    })});
    showToast(`Document ${result.numero} créé`, 'success');
    closeModal();
    loadUnites();
  } catch (e) { showToast(e.message, 'error'); }
};

window.ajouterPieceNomenclatureUnite = async function(id) {
  try {
    const data = await apiFetch('/articles?actif=1&limit=200');
    const unite = await apiFetch(`/unites/${id}`);
    const idsNom = unite.nomenclature.map(n => n.composant_id);
    const disponibles = (data?.articles || []).filter(a => !idsNom.includes(a.id) && a.id !== id);

    openModal('Ajouter pièce à la nomenclature', html`
      <div class="form-group"><label>Pièce</label><select id="nomPieceId" class="form-select">${disponibles.map(a => html`<option value="${a.id}">${a.reference} — ${a.designation} (stock: ${formatNumber(a.stock_actuel)})</option>`).join('')}</select></div>
      <div class="form-group"><label>Quantité</label><input id="nomQte" type="number" class="form-control" value="1" min="1"></div>
    `, html`
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="confirmAjouterPieceUnite(${id})">Ajouter</button>
    `);
  } catch (e) { showToast(e.message, 'error'); }
};

window.confirmAjouterPieceUnite = async function(id) {
  const composant_id = parseInt($('#nomPieceId').value);
  const quantite = parseInt($('#nomQte').value) || 1;
  if (!composant_id) { showToast('Sélectionnez une pièce', 'error'); return; }
  try {
    await apiFetch(`/unites/${id}/nomenclature`, { method: 'POST', body: JSON.stringify({ composant_id, quantite }) });
    showToast('Pièce ajoutée', 'success');
    closeModal();
    setTimeout(() => showUniteDetail(id), 300);
  } catch (e) { showToast(e.message, 'error'); }
};

window.deleteUnite = async function(id, reference) {
  if (!confirm(`Retirer "${reference}" des unités assemblables ?\n(L'article ne sera pas supprimé, seulement le statut unité)`)) return;
  try {
    await apiFetch(`/unites/${id}/supprimer`, { method: 'DELETE' });
    showToast('Unité retirée', 'success');
    loadUnites();
  } catch (e) { showToast(e.message, 'error'); }
};

// ==================== CLIENTS ====================
function renderClients(page) {
  const tabs = ['Informations', 'Transactions', 'Situation', 'Véhicules', 'Documents'];
  page.innerHTML = html`
    <div class="page-title">Clients <button class="btn btn-primary" onclick="showClientForm()">+ Nouveau client</button></div>
    <div class="filters-bar">
      <input type="text" id="cltSearch" class="form-control" placeholder="Nom, code, téléphone..." style="width:250px" oninput="loadClients()">
      <select id="cltType" class="form-select" style="width:150px" onchange="loadClients()">
        <option value="">Tous types</option><option value="Particulier">Particulier</option><option value="Professionnel">Professionnel</option><option value="Garage">Garage</option><option value="Concessionnaire">Concessionnaire</option>
      </select>
    </div>
    <div class="card">
      <div class="table-container"><table>
        <thead><tr><th>Code</th><th>Raison sociale</th><th>Type</th><th>Téléphone</th><th>Ville</th><th>Solde</th><th>Plafond</th><th>Actions</th></tr></thead>
        <tbody id="cltTableBody"></tbody>
      </table></div>
    </div>
  `;
  loadClients();
  window.showClientForm = showClientForm;
  window.loadClients = loadClients;
  window.editClient = editClient;
  window.showClientDetail = showClientDetail;
  window.deleteClient = deleteClient;
}

async function loadClients() {
  const tbody = $('#cltTableBody');
  if (!tbody) return;
  const search = $('#cltSearch')?.value || '';
  const type = $('#cltType')?.value || '';
  let url = `/clients?limit=50&search=${encodeURIComponent(search)}`;
  if (type) url += `&type=${type}`;

  try {
    const data = await apiFetch(url);
    tbody.innerHTML = data?.clients?.length ? data.clients.map(c => html`<tr>
      <td><strong>${c.code_client}</strong></td>
      <td>${c.raison_sociale}</td>
      <td><span class="badge badge-neutral">${c.type_client}</span></td>
      <td>${c.telephone || '-'}</td>
      <td>${c.ville || '-'}</td>
      <td><span class="badge ${c.solde_actuel > 0 ? 'badge-danger' : 'badge-success'}">${formatCurrency(c.solde_actuel)}</span></td>
      <td>${formatCurrency(c.plafond_credit)}</td>
      <td class="table-actions">
        <button class="btn btn-sm btn-secondary" onclick="editClient(${c.id})">✏️</button>
        <button class="btn btn-sm btn-secondary" onclick="showClientDetail(${c.id})">👁️</button>
        <button class="btn btn-sm btn-success" onclick="quickSale(${c.id})">🛒</button>
        <button class="btn btn-sm btn-danger" onclick="deleteClient(${c.id})">🗑️</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="8"><div class="empty-state"><p>Aucun client</p></div></td></tr>';
  } catch { tbody.innerHTML = '<tr><td colspan="8">Erreur</td></tr>'; }
}

function showClientForm(id) {
  const title = id ? 'Modifier client' : 'Nouveau client';
  if (id) {
    apiFetch(`/clients/${id}`).then(c => {
      openModal(title, html`
        <form id="clientForm" onsubmit="saveClient(event, ${id})">
          <div class="form-row"><div class="form-group"><label>Type *</label><select name="type_client" class="form-select"><option value="Particulier" ${c.type_client==='Particulier'?'selected':''}>Particulier</option><option value="Professionnel" ${c.type_client==='Professionnel'?'selected':''}>Professionnel</option><option value="Garage" ${c.type_client==='Garage'?'selected':''}>Garage</option><option value="Concessionnaire" ${c.type_client==='Concessionnaire'?'selected':''}>Concessionnaire</option></select></div>
          <div class="form-group"><label>Raison sociale *</label><input name="raison_sociale" class="form-control" value="${c.raison_sociale}" required></div></div>
          <div class="form-row"><div class="form-group"><label>Téléphone</label><input name="telephone" class="form-control" value="${c.telephone||''}"></div>
          <div class="form-group"><label>Email</label><input name="email" type="email" class="form-control" value="${c.email||''}"></div></div>
          <div class="form-row"><div class="form-group"><label>Adresse</label><input name="adresse" class="form-control" value="${c.adresse||''}"></div>
          <div class="form-group"><label>Ville</label><input name="ville" class="form-control" value="${c.ville||''}"></div></div>
          <div class="form-row"><div class="form-group"><label>ICE</label><input name="ice" class="form-control" value="${c.ice||''}"></div>
          <div class="form-group"><label>IF</label><input name="if_fiscal" class="form-control" value="${c.if_fiscal||''}"></div></div>
          <div class="form-row"><div class="form-group"><label>RC</label><input name="rc" class="form-control" value="${c.rc||''}"></div>
          <div class="form-group"><label>CNSS</label><input name="cnss" class="form-control" value="${c.cnss||''}"></div></div>
          <div class="form-row"><div class="form-group"><label>Patente</label><input name="patente" class="form-control" value="${c.patente||''}"></div>
          <div class="form-group"><label>Plafond crédit</label><input name="plafond_credit" type="number" step="0.01" class="form-control" value="${c.plafond_credit}"></div></div>
          <div class="form-row"><div class="form-group"><label>Remise %</label><input name="remise_defaut" type="number" step="0.01" class="form-control" value="${c.remise_defaut}"></div>
          <div class="form-group"><label>Conditions paiement</label><input name="conditions_paiement" class="form-control" value="${c.conditions_paiement}"></div></div>
          <div class="form-group"><label>Note</label><textarea name="note" class="form-textarea">${c.note||''}</textarea></div>
        </form>
      `, `<button class="btn btn-secondary" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="document.getElementById('clientForm').requestSubmit()">Enregistrer</button>`);
    });
  } else {
    openModal(title, html`
      <form id="clientForm" onsubmit="saveClient(event)">
        <div class="form-row"><div class="form-group"><label>Type *</label><select name="type_client" class="form-select"><option value="Particulier">Particulier</option><option value="Professionnel">Professionnel</option><option value="Garage" selected>Garage</option><option value="Concessionnaire">Concessionnaire</option></select></div>
        <div class="form-group"><label>Raison sociale *</label><input name="raison_sociale" class="form-control" required></div></div>
        <div class="form-row"><div class="form-group"><label>Téléphone</label><input name="telephone" class="form-control"></div>
        <div class="form-group"><label>Email</label><input name="email" type="email" class="form-control"></div></div>
        <div class="form-row"><div class="form-group"><label>Adresse</label><input name="adresse" class="form-control"></div>
        <div class="form-group"><label>Ville</label><input name="ville" class="form-control"></div></div>
        <div class="form-row"><div class="form-group"><label>ICE</label><input name="ice" class="form-control"></div>
        <div class="form-group"><label>IF</label><input name="if_fiscal" class="form-control"></div></div>
        <div class="form-row"><div class="form-group"><label>RC</label><input name="rc" class="form-control"></div>
        <div class="form-group"><label>CNSS</label><input name="cnss" class="form-control"></div></div>
        <div class="form-row"><div class="form-group"><label>Patente</label><input name="patente" class="form-control"></div>
        <div class="form-group"><label>Plafond crédit</label><input name="plafond_credit" type="number" step="0.01" class="form-control" value="0"></div></div>
        <div class="form-row"><div class="form-group"><label>Remise %</label><input name="remise_defaut" type="number" step="0.01" class="form-control" value="0"></div>
        <div class="form-group"><label>Conditions paiement</label><input name="conditions_paiement" class="form-control" value="30 jours"></div></div>
        <div class="form-group"><label>Note</label><textarea name="note" class="form-textarea"></textarea></div>
      </form>
    `, `<button class="btn btn-secondary" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="document.getElementById('clientForm').requestSubmit()">Créer</button>`);
  }
}

async function saveClient(e, id) {
  e.preventDefault();
  const form = $('#clientForm');
  const data = Object.fromEntries(new FormData(form));
  data.plafond_credit = parseFloat(data.plafond_credit) || 0;
  data.remise_defaut = parseFloat(data.remise_defaut) || 0;
  try {
    if (id) {
      await apiFetch(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      showToast('Client modifié', 'success');
    } else {
      await apiFetch('/clients', { method: 'POST', body: JSON.stringify(data) });
      showToast('Client créé', 'success');
    }
    closeModal();
    loadClients();
  } catch (e) { showToast(e.message, 'error'); }
}

function editClient(id) { showClientForm(id); }

async function deleteClient(id) {
  if (!confirm('Supprimer ce client ?')) return;
  try {
    const result = await apiFetch(`/clients/${id}`, { method: 'DELETE' });
    if (result && result.success) {
      showToast('Client supprimé', 'success');
      const row = document.querySelector(`#cltTableBody tr[onclick*="editClient(${id})"]`)?.closest('tr')
        || document.querySelector(`#sitTableBody tr[data-id="${id}"]`);
      if (row) row.remove();
      if (typeof loadClients === 'function') await loadClients();
      if (typeof loadSituation === 'function') await loadSituation();
    }
  } catch (e) { showToast('Erreur: ' + (e.message || 'suppression échouée'), 'error'); }
}

function showClientDetail(id) {
  apiFetch(`/clients/${id}`).then(c => {
    let htmlContent = html`
      <div class="stat-row"><div class="stat-item"><div class="stat-value" style="color:${c.solde_actuel>0?'var(--danger)':'var(--success)'}">${formatCurrency(c.solde_actuel)}</div><div class="stat-label">Solde</div></div>
      <div class="stat-item"><div class="stat-value">${formatCurrency(c.plafond_credit)}</div><div class="stat-label">Plafond</div></div>
      <div class="stat-item"><div class="stat-value">${c.type_client}</div><div class="stat-label">Type</div></div></div>
      <div class="form-row" style="margin-top:1rem"><div class="form-group"><label>Code</label><input class="form-control" value="${c.code_client}" readonly></div>
      <div class="form-group"><label>Raison sociale</label><input class="form-control" value="${c.raison_sociale}" readonly></div></div>
      <div class="form-row"><div class="form-group"><label>Téléphone</label><input class="form-control" value="${c.telephone||'-'}" readonly></div>
      <div class="form-group"><label>Email</label><input class="form-control" value="${c.email||'-'}" readonly></div></div>
      <div class="form-row"><div class="form-group"><label>Ville</label><input class="form-control" value="${c.ville||'-'}" readonly></div>
      <div class="form-group"><label>ICE</label><input class="form-control" value="${c.ice||'-'}" readonly></div></div>
    `;

    if (c.documents?.length) {
      htmlContent += '<h4 style="margin:1rem 0 0.5rem">Derniers documents</h4><table><thead><tr><th>N°</th><th>Type</th><th>Date</th><th>Montant</th><th>Statut</th></tr></thead><tbody>';
      htmlContent += c.documents.map(d => html`<tr><td>${d.numero}</td><td>${d.type_document}</td><td>${formatDate(d.date_document)}</td><td>${formatCurrency(d.net_a_payer)}</td><td><span class="badge ${d.statut==='paye'?'badge-success':d.statut==='brouillon'?'badge-neutral':'badge-warning'}">${d.statut}</span></td></tr>`).join('');
      htmlContent += '</tbody></table>';
    }

    if (c.vehicules?.length) {
      htmlContent += '<h4 style="margin:1rem 0 0.5rem">Véhicules</h4><table><thead><tr><th>Immat.</th><th>Marque</th><th>Modèle</th><th>Année</th></tr></thead><tbody>';
      htmlContent += c.vehicules.map(v => html`<tr><td>${v.immatriculation}</td><td>${v.marque}</td><td>${v.modele}</td><td>${v.annee||''}</td></tr>`).join('');
      htmlContent += '</tbody></table>';
    }

    openModal(`Client: ${c.raison_sociale}`, htmlContent, `<button class="btn btn-primary btn-sm" onclick="quickSale(${c.id});closeModal()">🛒 Commande rapide</button><button class="btn btn-secondary" onclick="closeModal()">Fermer</button>`);
  });
}

window.quickSale = function(clientId) {
  navigate(`documents-ventes`);
  setTimeout(() => {
    const newBtn = document.querySelector('[onclick*="showDocumentForm"]');
    if (newBtn) newBtn.click();
  }, 500);
};

// ==================== SITUATION CLIENTS ====================
function renderSituation(page) {
  page.innerHTML = html`
    <div class="page-title">Situation Clients <button class="btn btn-primary" onclick="showPaiementForm()">+ Enregistrer paiement</button></div>
    <div class="filters-bar">
      <select id="sitFilter" class="form-select" onchange="loadSituation()">
        <option value="">Tous les clients</option><option value="debiteurs">Clients débiteurs</option><option value="soldes">Clients soldés</option>
      </select>
      <button class="btn btn-secondary btn-sm" onclick="exportSoldes()">📥 Export Excel</button>
    </div>
    <div class="card">
      <div class="table-container"><table>
        <thead><tr><th>Client</th><th>Code</th><th>Type</th><th>Téléphone</th><th>Solde actuel</th><th>Plafond</th><th>Actions</th></tr></thead>
        <tbody id="sitTableBody"></tbody>
      </table></div>
    </div>
  `;
  loadSituation();
  window.showPaiementForm = showPaiementForm;
  window.loadSituation = loadSituation;
  window.showClientSituation = showClientSituation;
  window.exportSoldes = exportSoldes;
  window.editPaiement = editPaiement;
  window.deletePaiement = deletePaiement;
  window.savePaiement = savePaiement;
  window.updatePaiement = updatePaiement;
  window.deleteClient = deleteClient;
}

async function loadSituation() {
  const tbody = $('#sitTableBody');
  if (!tbody) return;
  const filtre = $('#sitFilter')?.value || '';
  try {
    const data = await apiFetch(`/paiements/situation?filtre=${filtre}`);
    tbody.innerHTML = data?.length ? data.map(c => html`<tr data-id="${c.id}">
      <td><strong>${c.raison_sociale}</strong></td>
      <td>${c.code_client}</td>
      <td><span class="badge badge-neutral">${c.type_client}</span></td>
      <td>${c.telephone||'-'}</td>
      <td><span class="badge ${c.solde_actuel > 0 ? 'badge-danger' : 'badge-success'}">${formatCurrency(c.solde_actuel)}</span></td>
      <td>${formatCurrency(c.plafond_credit)}</td>
      <td class="table-actions">
        <button class="btn btn-sm btn-secondary" onclick="showClientSituation(${c.id})">📊</button>
        <button class="btn btn-sm btn-primary" onclick="showPaiementForm(${c.id})">💰</button>
        <button class="btn btn-sm btn-danger" onclick="deleteClient(${c.id})">🗑️</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="7"><div class="empty-state"><p>Aucun client</p></div></td></tr>';
  } catch { tbody.innerHTML = '<tr><td colspan="7">Erreur</td></tr>'; }
}

function showClientSituation(clientId) {
  apiFetch(`/clients/${clientId}`).then(async (c) => {
    const paiements = await apiFetch(`/paiements?client_id=${clientId}`);
    let htmlContent = html`
      <div class="stat-row">
        <div class="stat-item"><div class="stat-value">${formatCurrency(c.solde_actuel)}</div><div class="stat-label">Solde dû</div></div>
        <div class="stat-item"><div class="stat-value">${formatCurrency(c.plafond_credit)}</div><div class="stat-label">Plafond</div></div>
        <div class="stat-item"><div class="stat-value">${((c.solde_actuel / (c.plafond_credit||1)) * 100).toFixed(0)}%</div><div class="stat-label">Utilisation</div></div>
      </div>
      <h4 style="margin:1rem 0 0.5rem">Écritures</h4>
      <table><thead><tr><th>Date</th><th>Document</th><th>Débit</th><th>Crédit</th><th>Solde</th><th>Actions</th></tr></thead><tbody>
    `;
    // Compile a simple ledger from documents + payments
    const docs = c.documents || [];
    const payments = paiements?.paiements || [];
    const entries = [
      ...docs.filter(d => ['facture_client','avoir_client'].includes(d.type_document)).map(d => ({ date: d.date_document, ref: d.numero, type: d.type_document === 'facture_client' ? 'debit' : 'credit', montant: d.net_a_payer || 0 })),
      ...payments.map(p => ({ date: p.date_paiement, ref: 'Paiement ' + (p.mode_paiement||''), type: 'credit', montant: p.montant, paiement_id: p.id }))
    ].sort((a, b) => new Date(a.date) - new Date(b.date));

    let running = 0;
    htmlContent += entries.length ? entries.map(e => {
      running += e.type === 'debit' ? e.montant : -e.montant;
      const isPaiement = e.type === 'credit' && e.paiement_id;
      const actions = isPaiement ? html`<span style="white-space:nowrap"><button class="btn btn-sm btn-secondary" onclick="editPaiement(${e.paiement_id})" title="Modifier">✏️</button> <button class="btn btn-sm btn-danger" onclick="deletePaiement(${e.paiement_id})" title="Supprimer">🗑️</button></span>` : '';
      return html`<tr><td>${formatDate(e.date)}</td><td>${e.ref}</td><td>${e.type === 'debit' ? formatCurrency(e.montant) : '-'}</td><td>${e.type === 'credit' ? formatCurrency(e.montant) : '-'}</td><td><strong>${formatCurrency(running)}</strong></td><td>${actions}</td></tr>`;
    }).join('') : '<tr><td colspan="6">Aucune écriture</td></tr>';
    htmlContent += '</tbody></table>';

    openModal(`Situation: ${c.raison_sociale}`, htmlContent, `<button class="btn btn-primary btn-sm" onclick="showPaiementForm(${c.id});closeModal()">💰 Enregistrer paiement</button><button class="btn btn-secondary" onclick="closeModal()">Fermer</button>`);
  });
}

function showPaiementForm(clientId) {
  apiFetch('/clients?limit=200').then(clients => {
    const clientOpts = clients?.clients?.map(c => `<option value="${c.id}" ${clientId == c.id ? 'selected' : ''}>${c.raison_sociale} (${c.code_client})</option>`).join('') || '';
    openModal('Enregistrer un paiement', html`
      <form id="paiementForm" onsubmit="savePaiement(event)">
        <div class="form-group"><label>Client *</label><select name="client_id" class="form-select" required>${clientOpts}</select></div>
        <div class="form-row"><div class="form-group"><label>Montant *</label><input name="montant" type="number" step="0.01" class="form-control" required></div>
        <div class="form-group"><label>Date</label><input name="date_paiement" type="date" class="form-control" value="${new Date().toISOString().slice(0,10)}"></div></div>
        <div class="form-group"><label>Mode de paiement</label><select name="mode_paiement" class="form-select">
          <option value="Especes">Espèces</option><option value="Cheque">Chèque</option><option value="Virement">Virement</option>
          <option value="TPE">TPE</option><option value="Traite">Traite</option><option value="Autre">Autre</option>
        </select></div>
        <div class="form-row"><div class="form-group"><label>Référence</label><input name="reference" class="form-control"></div>
        <div class="form-group"><label>N° Chèque</label><input name="numero_cheque" class="form-control"></div></div>
        <div class="form-group"><label>Banque émettrice</label><input name="banque_emetteur" class="form-control"></div>
        <div class="form-group"><label>Notes</label><textarea name="notes" class="form-textarea"></textarea></div>
      </form>
    `, `<button class="btn btn-secondary" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="document.getElementById('paiementForm').requestSubmit()">Enregistrer</button>`);
  });
}

async function savePaiement(e) {
  e.preventDefault();
  const form = $('#paiementForm');
  const data = Object.fromEntries(new FormData(form));
  data.montant = parseFloat(data.montant) || 0;
  if (data.montant <= 0) { showToast('Montant invalide', 'error'); return; }
  try {
    await apiFetch('/paiements', { method: 'POST', body: JSON.stringify(data) });
    showToast('Paiement enregistré', 'success');
    closeModal();
    loadSituation();
  } catch (e) { showToast(e.message, 'error'); }
}

async function editPaiement(id) {
  try {
    const p = await apiFetch(`/paiements/${id}`);
    if (!p) return;
    openModal('Modifier paiement', html`
      <form id="editPaiementForm" onsubmit="updatePaiement(event, ${id})">
        <div class="form-group"><label>Client</label><input class="form-control" value="${p.client_nom}" readonly></div>
        <div class="form-row"><div class="form-group"><label>Montant *</label><input name="montant" type="number" step="0.01" class="form-control" value="${p.montant}" required></div>
        <div class="form-group"><label>Date</label><input name="date_paiement" type="date" class="form-control" value="${p.date_paiement}"></div></div>
        <div class="form-group"><label>Mode de paiement</label><select name="mode_paiement" class="form-select">
          <option value="Especes" ${p.mode_paiement==='Especes'?'selected':''}>Espèces</option><option value="Cheque" ${p.mode_paiement==='Cheque'?'selected':''}>Chèque</option><option value="Virement" ${p.mode_paiement==='Virement'?'selected':''}>Virement</option>
          <option value="TPE" ${p.mode_paiement==='TPE'?'selected':''}>TPE</option><option value="Traite" ${p.mode_paiement==='Traite'?'selected':''}>Traite</option><option value="Autre" ${p.mode_paiement==='Autre'?'selected':''}>Autre</option>
        </select></div>
        <div class="form-row"><div class="form-group"><label>Référence</label><input name="reference" class="form-control" value="${p.reference||''}"></div>
        <div class="form-group"><label>N° Chèque</label><input name="numero_cheque" class="form-control" value="${p.numero_cheque||''}"></div></div>
        <div class="form-group"><label>Banque émettrice</label><input name="banque_emetteur" class="form-control" value="${p.banque_emetteur||''}"></div>
        <div class="form-group"><label>Notes</label><textarea name="notes" class="form-textarea">${p.notes||''}</textarea></div>
      </form>
    `, `<button class="btn btn-secondary" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="document.getElementById('editPaiementForm').requestSubmit()">Enregistrer</button>`);
  } catch (e) { showToast('Erreur chargement paiement', 'error'); }
}

async function updatePaiement(e, id) {
  e.preventDefault();
  const form = $('#editPaiementForm');
  const data = Object.fromEntries(new FormData(form));
  data.montant = parseFloat(data.montant) || 0;
  if (data.montant <= 0) { showToast('Montant invalide', 'error'); return; }
  try {
    await apiFetch(`/paiements/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    showToast('Paiement modifié', 'success');
    closeModal();
    loadSituation();
  } catch (e) { showToast(e.message, 'error'); }
}

async function deletePaiement(id) {
  if (!confirm('Supprimer ce paiement ?')) return;
  try {
    const result = await apiFetch(`/paiements/${id}`, { method: 'DELETE' });
    if (result && result.success) {
      showToast('Paiement supprimé', 'success');
      loadSituation();
    }
  } catch (e) { showToast('Erreur: ' + (e.message || 'suppression échouée'), 'error'); }
}

function exportSoldes() {
  apiFetch('/paiements/situation').then(clients => {
    if (!clients?.length) { showToast('Aucun client', 'warning'); return; }
    let csv = 'Code;Client;Type;Ville;Solde;Plafond\n';
    csv += clients.map(c => `${c.code_client};${c.raison_sociale};${c.type_client};${c.ville||''};${c.solde_actuel};${c.plafond_credit}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `soldes-clients-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    showToast('Export téléchargé', 'success');
  });
}

// ==================== FOURNISSEURS ====================
function renderFournisseurs(page) {
  page.innerHTML = html`
    <div class="page-title">Fournisseurs <button class="btn btn-primary" onclick="showFournisseurForm()">+ Nouveau fournisseur</button></div>
    <div class="filters-bar"><input type="text" id="frnSearch" class="form-control" placeholder="Nom, code..." style="width:250px" oninput="loadFournisseurs()"></div>
    <div class="card"><div class="table-container"><table>
      <thead><tr><th>Code</th><th>Raison sociale</th><th>Téléphone</th><th>Ville</th><th>Délai (j)</th><th>Éval.</th><th>Actions</th></tr></thead>
      <tbody id="frnTableBody"></tbody>
    </table></div></div>
  `;
  loadFournisseurs();
  window.showFournisseurForm = showFournisseurForm;
  window.loadFournisseurs = loadFournisseurs;
  window.editFournisseur = editFournisseur;
  window.showFournisseurDetail = showFournisseurDetail;
  window.deleteFournisseur = deleteFournisseur;
}

async function loadFournisseurs() {
  const tbody = $('#frnTableBody');
  if (!tbody) return;
  const search = $('#frnSearch')?.value || '';
  try {
    const data = await apiFetch(`/fournisseurs?limit=50&search=${encodeURIComponent(search)}`);
    tbody.innerHTML = data?.fournisseurs?.length ? data.fournisseurs.map(f => html`<tr>
      <td><strong>${f.code_fournisseur}</strong></td>
      <td>${f.raison_sociale}</td>
      <td>${f.telephone||'-'}</td>
      <td>${f.ville||'-'}</td>
      <td>${f.delai_livraison_jours||'-'}</td>
      <td>${'★'.repeat(f.evaluation||0)}${'☆'.repeat(5-(f.evaluation||0))}</td>
      <td class="table-actions">
        <button class="btn btn-sm btn-secondary" onclick="editFournisseur(${f.id})">✏️</button>
        <button class="btn btn-sm btn-secondary" onclick="showFournisseurDetail(${f.id})">👁️</button>
        <button class="btn btn-sm btn-danger" onclick="deleteFournisseur(${f.id})">🗑️</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="7"><div class="empty-state"><p>Aucun fournisseur</p></div></td></tr>';
  } catch { tbody.innerHTML = '<tr><td colspan="7">Erreur</td></tr>'; }
}

function showFournisseurForm(id) {
  const title = id ? 'Modifier fournisseur' : 'Nouveau fournisseur';
  if (id) {
    apiFetch(`/fournisseurs/${id}`).then(f => {
      openModal(title, html`
        <form id="frnForm" onsubmit="saveFournisseur(event, ${id})">
          <div class="form-row"><div class="form-group"><label>Raison sociale *</label><input name="raison_sociale" class="form-control" value="${f.raison_sociale}" required></div>
          <div class="form-group"><label>Téléphone</label><input name="telephone" class="form-control" value="${f.telephone||''}"></div></div>
          <div class="form-row"><div class="form-group"><label>Email</label><input name="email" type="email" class="form-control" value="${f.email||''}"></div>
          <div class="form-group"><label>Ville</label><input name="ville" class="form-control" value="${f.ville||''}"></div></div>
          <div class="form-row"><div class="form-group"><label>ICE</label><input name="ice" class="form-control" value="${f.ice||''}"></div>
          <div class="form-group"><label>RC</label><input name="rc" class="form-control" value="${f.rc||''}"></div></div>
          <div class="form-row"><div class="form-group"><label>Délai livraison (j)</label><input name="delai_livraison_jours" type="number" class="form-control" value="${f.delai_livraison_jours||15}"></div>
          <div class="form-group"><label>Évaluation</label><select name="evaluation" class="form-select">${[1,2,3,4,5].map(n => `<option value="${n}" ${f.evaluation==n?'selected':''}>${n}</option>`).join('')}</select></div></div>
          <div class="form-row"><div class="form-group"><label>Banque</label><input name="banque" class="form-control" value="${f.banque||''}"></div>
          <div class="form-group"><label>RIB</label><input name="rib" class="form-control" value="${f.rib||''}"></div></div>
          <div class="form-group"><label>Conditions paiement</label><input name="conditions_paiement" class="form-control" value="${f.conditions_paiement||''}"></div>
        </form>
      `, `<button class="btn btn-secondary" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="document.getElementById('frnForm').requestSubmit()">Enregistrer</button>`);
    });
  } else {
    openModal(title, html`
      <form id="frnForm" onsubmit="saveFournisseur(event)">
        <div class="form-row"><div class="form-group"><label>Raison sociale *</label><input name="raison_sociale" class="form-control" required></div>
        <div class="form-group"><label>Téléphone</label><input name="telephone" class="form-control"></div></div>
        <div class="form-row"><div class="form-group"><label>Email</label><input name="email" type="email" class="form-control"></div>
        <div class="form-group"><label>Ville</label><input name="ville" class="form-control"></div></div>
        <div class="form-row"><div class="form-group"><label>ICE</label><input name="ice" class="form-control"></div>
        <div class="form-group"><label>RC</label><input name="rc" class="form-control"></div></div>
        <div class="form-row"><div class="form-group"><label>Délai livraison (j)</label><input name="delai_livraison_jours" type="number" class="form-control" value="15"></div>
        <div class="form-group"><label>Évaluation</label><select name="evaluation" class="form-select"><option value="3">3</option><option value="1">1</option><option value="2">2</option><option value="4">4</option><option value="5">5</option></select></div></div>
        <div class="form-row"><div class="form-group"><label>Banque</label><input name="banque" class="form-control"></div>
        <div class="form-group"><label>RIB</label><input name="rib" class="form-control"></div></div>
        <div class="form-group"><label>Conditions paiement</label><input name="conditions_paiement" class="form-control" value="60 jours"></div>
      </form>
    `, `<button class="btn btn-secondary" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="document.getElementById('frnForm').requestSubmit()">Créer</button>`);
  }
}

async function saveFournisseur(e, id) {
  e.preventDefault();
  const form = $('#frnForm');
  const data = Object.fromEntries(new FormData(form));
  data.delai_livraison_jours = parseInt(data.delai_livraison_jours) || 15;
  data.evaluation = parseInt(data.evaluation) || 3;
  try {
    if (id) {
      await apiFetch(`/fournisseurs/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      showToast('Fournisseur modifié', 'success');
    } else {
      await apiFetch('/fournisseurs', { method: 'POST', body: JSON.stringify(data) });
      showToast('Fournisseur créé', 'success');
    }
    closeModal();
    loadFournisseurs();
  } catch (e) { showToast(e.message, 'error'); }
}

function editFournisseur(id) { showFournisseurForm(id); }

async function deleteFournisseur(id) {
  if (!confirm('Supprimer ce fournisseur ?')) return;
  try {
    const result = await apiFetch(`/fournisseurs/${id}`, { method: 'DELETE' });
    if (result && result.success) {
      showToast('Fournisseur supprimé', 'success');
      const row = document.querySelector(`#frnTableBody tr[onclick*="editFournisseur(${id})"]`)?.closest('tr');
      if (row) row.remove();
      if (typeof loadFournisseurs === 'function') await loadFournisseurs();
    }
  } catch (e) { showToast('Erreur: ' + (e.message || 'suppression échouée'), 'error'); }
}

function showFournisseurDetail(id) {
  apiFetch(`/fournisseurs/${id}`).then(f => {
    openModal(`Fournisseur: ${f.raison_sociale}`, html`
      <div class="form-group"><label>Code</label><input class="form-control" value="${f.code_fournisseur}" readonly></div>
      <div class="form-group"><label>Coordonnées</label><input class="form-control" value="${f.adresse||''}, ${f.ville||''}" readonly></div>
      <div class="form-row"><div class="form-group"><label>Téléphone</label><input class="form-control" value="${f.telephone||'-'}" readonly></div>
      <div class="form-group"><label>Email</label><input class="form-control" value="${f.email||'-'}" readonly></div></div>
      <div class="form-row"><div class="form-group"><label>ICE</label><input class="form-control" value="${f.ice||'-'}" readonly></div>
      <div class="form-group"><label>RC</label><input class="form-control" value="${f.rc||'-'}" readonly></div></div>
      <div class="form-row"><div class="form-group"><label>Délai livraison</label><input class="form-control" value="${f.delai_livraison_jours||'-'} jours" readonly></div>
      <div class="form-group"><label>Évaluation</label><input class="form-control" value="${'★'.repeat(f.evaluation||0)}" readonly></div></div>
      ${f.banque ? html`<div class="form-group"><label>Banque / RIB</label><input class="form-control" value="${f.banque} - ${f.rib||''}" readonly></div>` : ''}
    `, `<button class="btn btn-secondary" onclick="closeModal()">Fermer</button>`);
  });
}

// ==================== DOCUMENTS (Achats & Ventes) ====================
function renderDocuments(type, page) {
  const isAchat = type === 'achats';
  const title = isAchat ? 'Achats' : 'Ventes';
  const docTypes = isAchat
    ? [{val:'demande_achat',label:'DA'},{val:'commande_fournisseur',label:'Commande'},{val:'bon_reception',label:'BR'},{val:'facture_fournisseur',label:'Facture'},{val:'avoir_fournisseur',label:'Avoir'}]
    : [{val:'devis',label:'Devis'},{val:'bon_commande_client',label:'Commande'},{val:'bon_livraison',label:'BL'},{val:'facture_client',label:'Facture'},{val:'avoir_client',label:'Avoir'}];

  page.innerHTML = html`
    <div class="page-title">${title} <button class="btn btn-primary" onclick="showDocumentForm('${isAchat ? 'achats' : 'ventes'}')">+ Nouveau document</button></div>
    <div class="filters-bar">
      <select id="docTypeFilter" class="form-select" onchange="loadDocuments('${type}')">
        ${docTypes.map(d => `<option value="${d.val}">${d.label}</option>`).join('')}
        <option value="">Tous les documents</option>
      </select>
      <input type="text" id="docSearch" class="form-control" placeholder="N° document..." style="width:200px" oninput="loadDocuments('${type}')">
      <select id="docStatutFilter" class="form-select" onchange="loadDocuments('${type}')">
        <option value="">Tous statuts</option>
        <option value="brouillon">Brouillon</option>
        <option value="envoye">Envoyé</option>
        <option value="valide">Validé</option>
        <option value="livre">Livré</option>
        <option value="paye">Payé</option>
      </select>
    </div>
    <div class="card">
      <div class="table-container"><table>
        <thead><tr><th>N° Document</th><th>Date</th><th>${isAchat ? 'Fournisseur' : 'Client'}</th><th>Type</th><th>Montant TTC</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody id="docTableBody"></tbody>
      </table></div>
    </div>
  `;
  loadDocuments(type);
  window.loadDocuments = loadDocuments;
  window.showDocumentForm = showDocumentForm;
  window.editDocument = editDocument;
  window.printDocument = printDocument;
}

async function transfertDocument(id) {
  if (!confirm('Créer le document suivant à partir de celui-ci ?')) return;
  try {
    const result = await apiFetch(`/documents/${id}/transfert`, { method: 'POST' });
    showToast(`Document ${result.numero} (${result.type}) créé`, 'success');
    const type = document.querySelector('[data-route^="documents"]')?.dataset?.route || '';
    loadDocuments(type.includes('achats') ? 'achats' : 'ventes');
  } catch (e) { showToast(e.message, 'error'); }
}

async function loadDocuments(type) {
  const tbody = $('#docTableBody');
  if (!tbody) return;
  const docType = $('#docTypeFilter')?.value || '';
  const statut = $('#docStatutFilter')?.value || '';
  const search = $('#docSearch')?.value || '';
  let url = `/documents?limit=50&search=${encodeURIComponent(search)}`;
  if (docType) url += `&type=${docType}`;
  if (statut) url += `&statut=${statut}`;

  try {
    const data = await apiFetch(url);
    tbody.innerHTML = data?.documents?.length ? data.documents.map(d => {
      const statusBadge = { brouillon: 'badge-neutral', envoye: 'badge-info', valide: 'badge-warning', livre: 'badge-info', paye: 'badge-success', annule: 'badge-danger', partiel: 'badge-warning' };
      return html`<tr>
        <td><strong>${d.numero}</strong></td>
        <td>${formatDate(d.date_document)}</td>
        <td>${d.client_nom || d.fournisseur_nom || '-'}</td>
        <td><span class="badge badge-neutral">${d.type_document}</span></td>
        <td>${formatCurrency(d.net_a_payer)}</td>
        <td><span class="badge ${statusBadge[d.statut] || 'badge-neutral'}">${d.statut}</span></td>
        <td class="table-actions">
          <button class="btn btn-sm btn-secondary" onclick="editDocument(${d.id})" title="Modifier">✏️</button>
          <button class="btn btn-sm btn-secondary" onclick="printDocument(${d.id})" title="Imprimer">🖨️</button>
          ${['devis','bon_commande_client','bon_livraison','demande_achat','commande_fournisseur','bon_reception'].includes(d.type_document) && d.statut !== 'annule' ? `<button class="btn btn-sm btn-primary" onclick="transfertDocument(${d.id})" title="Transférer vers le type suivant">🔄</button>` : ''}
          <button class="btn btn-sm ${d.statut === 'brouillon' ? 'btn-success' : 'btn-secondary'}" onclick="changeDocStatut(${d.id}, '${d.statut}')" title="Changer statut">➡️</button>
          ${d.statut !== 'annule' ? `<button class="btn btn-sm btn-danger" onclick="supprimerDocument(${d.id}, '${d.numero}')" title="Supprimer">🗑️</button>` : ''}
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="7"><div class="empty-state"><p>Aucun document</p></div></td></tr>';
  } catch { tbody.innerHTML = '<tr><td colspan="7">Erreur</td></tr>'; }
}

function showDocumentForm(type) {
  const isAchat = type === 'achats';
  const docTypeOptions = isAchat
    ? `<option value="demande_achat">Demande d'achat</option><option value="commande_fournisseur">Commande fournisseur</option><option value="bon_reception">Bon de réception</option><option value="facture_fournisseur">Facture fournisseur</option>`
    : `<option value="devis">Devis</option><option value="bon_commande_client">Commande client</option><option value="bon_livraison">Bon de livraison</option><option value="facture_client">Facture</option><option value="avoir_client">Avoir</option>`;

  // Load clients or suppliers
  const entityUrl = isAchat ? '/fournisseurs?limit=200' : '/clients?limit=200';
  apiFetch(entityUrl).then(async entities => {
    const entityOpts = (entities?.clients || entities?.fournisseurs || []).map(e =>
      `<option value="${e.id}">${e.raison_sociale} (${e.code_client || e.code_fournisseur})</option>`
    ).join('');

    openModal('Nouveau document', html`
      <form id="docForm" onsubmit="saveDocument(event, '${type}')">
        <div class="form-row">
          <div class="form-group"><label>Type document *</label><select name="type_document" class="form-select" id="docTypeSelect" onchange="toggleDocEntity()">${docTypeOptions}</select></div>
          <div class="form-group"><label>${isAchat ? 'Fournisseur' : 'Client'} *</label><select name="entity_id" class="form-select" id="docEntity">${entityOpts}</select></div>
        </div>
        <div class="form-group"><label>Notes</label><textarea name="notes" class="form-textarea"></textarea></div>
        <h4 style="margin:0.5rem 0">Lignes du document</h4>
        <div id="docLignes">
          <div class="doc-ligne" style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr auto;gap:0.5rem;align-items:end">
            <div class="form-group"><label>Article</label><div class="autocomplete-wrap">
              <input type="text" class="form-control autocomplete-input" placeholder="Tapez nom/réf/code-barres..." autocomplete="off"
                oninput="searchDocArticle(this)" onfocus="searchDocArticle(this)"
                onblur="setTimeout(()=>this.parentElement.querySelector('.autocomplete-results')?.classList.remove('show'),250)"
                data-article-id="">
              <button type="button" class="btn btn-sm btn-secondary" onclick="scanDocBarcode(this)" title="Scanner code-barres">📷</button>
              <div class="autocomplete-results"></div>
            </div></div>
            <div class="form-group"><label>Unité source</label><select class="form-select source-unit-select"><option value="">—</option></select></div>
            <div class="form-group"><label>Qté</label><input type="number" class="form-control qte-input" value="1" min="1" oninput="calcDocLigne(this)"></div>
            <div class="form-group"><label>PU HT</label><input type="number" step="0.01" class="form-control prix-input" value="0" oninput="calcDocLigne(this)"></div>
            <div class="form-group"><label>HT</label><input type="text" class="form-control ht-aff" readonly style="background:var(--bg-card)"></div>
            <div class="form-group"><label>TVA</label><input type="text" class="form-control tva-aff" readonly style="background:var(--bg-card)"></div>
            <button type="button" class="btn btn-sm btn-danger" style="margin-bottom:0.5rem" onclick="removeLigne(this)">✕</button>
          </div>
        </div>
        <button type="button" class="btn btn-sm btn-secondary" onclick="addDocLigne('${type}')" style="margin-top:0.3rem">+ Ajouter ligne</button>
      </form>
    `, `<button class="btn btn-secondary" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="document.getElementById('docForm').requestSubmit()">Créer</button>`);

    window.addDocLigne = addDocLigne;
    window.removeLigne = removeLigne;
    window.searchDocArticle = searchDocArticle;
    window.selectDocArticle = selectDocArticle;
    window.scanDocBarcode = scanDocBarcode;
    window.toggleDocEntity = function() {};
  });
}

function calcDocLigne(el) {
  const ligne = el?.closest('.doc-ligne');
  if (!ligne) return;
  const prixInput = ligne.querySelector('.prix-input');
  const qteInput = ligne.querySelector('.qte-input');
  const htAff = ligne.querySelector('.ht-aff');
  const tvaAff = ligne.querySelector('.tva-aff');
  if (!prixInput || !htAff || !tvaAff) return;
  const ht = parseFloat(prixInput.value) || 0;
  const taux = parseFloat(prixInput.dataset.tauxTva) || 20;
  const tva = ht * taux / 100;
  const qte = parseFloat(qteInput?.value) || 1;
  htAff.value = formatCurrency(ht * qte) + ' MAD';
  tvaAff.value = formatCurrency(tva * qte) + ' MAD';
  updateDocTotal();
}

function updateDocTotal() {
  const lignes = $$('.doc-ligne');
  let totalHT = 0, totalTVA = 0;
  lignes.forEach(l => {
    const qte = parseFloat(l.querySelector('.qte-input')?.value) || 1;
    const ht = parseFloat(l.querySelector('.prix-input')?.value) || 0;
    const taux = parseFloat(l.querySelector('.prix-input')?.dataset?.tauxTva) || 20;
    totalHT += ht * qte;
    totalTVA += ht * qte * taux / 100;
  });
  let footer = $('#docTotal');
  if (!footer) {
    footer = document.createElement('div');
    footer.id = 'docTotal';
    footer.style.cssText = 'margin-top:0.5rem;text-align:right;font-weight:700;font-size:1.1rem;padding:0.5rem;border-top:2px solid var(--accent)';
    $('#docLignes').after(footer);
  }
  footer.innerHTML = `HT: ${formatCurrency(totalHT)} MAD | TVA: ${formatCurrency(totalTVA)} MAD | <span style="color:var(--accent)">TTC: ${formatCurrency(totalHT + totalTVA)} MAD</span>`;
}

window.addDocLigne = function(type) {
  const container = $('#docLignes');
  const template = container.querySelector('.doc-ligne');
  const clone = template.cloneNode(true);
  clone.querySelectorAll('input').forEach(el => { if (!el.classList.contains('ht-aff') && !el.classList.contains('tva-aff')) el.value = ''; });
  clone.querySelector('.qte-input').value = 1;
  const res = clone.querySelector('.autocomplete-results');
  if (res) res.classList.remove('show');
  container.appendChild(clone);
  updateDocTotal();
};

window.removeLigne = function(btn) {
  const container = $('#docLignes');
  if (container.children.length > 1) { btn.closest('.doc-ligne').remove(); updateDocTotal(); }
  else showToast('Au moins une ligne requise', 'warning');
};

// ---- Document line article autocomplete ----
let searchDocTimeout;

function searchDocArticle(input) {
  clearTimeout(searchDocTimeout);
  const val = input.value.trim();
  const wrap = input.closest('.autocomplete-wrap');
  const results = wrap?.querySelector('.autocomplete-results');
  if (!results) return;

  if (val.length < 2) { results.classList.remove('show'); return; }

  searchDocTimeout = setTimeout(async () => {
    try {
      const data = await apiFetch('/articles?search=' + encodeURIComponent(val) + '&limit=10&actif=1');
      if (!data?.articles?.length) {
        results.innerHTML = '<div class="autocomplete-item" style="color:var(--text-light)">Aucun article trouvé</div>';
        results.classList.add('show'); return;
      }
      results.innerHTML = data.articles.map(a => {
        const taux = a.taux_tva_value || 20;
        const ttc = (a.prix_vente_ht || 0) * (1 + taux / 100);
        return `<div class="autocomplete-item" onclick="selectDocArticle(this, ${a.id})"
             data-id="${a.id}" data-pv="${a.prix_vente_ht || 0}" data-taux="${taux}" data-ref="${a.reference}" data-des="${a.designation}" data-barre="${a.code_barre || ''}">
          <div><span class="ref">${a.reference}</span> - <span class="des">${a.designation}</span></div>
          <div><span class="price">${formatCurrency(ttc)} MAD TTC</span> <span class="stock-info">Stock: ${formatNumber(a.stock_actuel)}</span></div>
        </div>`;
      }).join('');
      results.classList.add('show');
    } catch { results.classList.remove('show'); }
  }, 300);
}

function selectDocArticle(el, id) {
  const wrap = el.closest('.autocomplete-wrap');
  const input = wrap?.querySelector('.autocomplete-input');
  const results = wrap?.querySelector('.autocomplete-results');
  const ligne = el.closest('.doc-ligne');
  if (!input || !ligne) return;

  input.value = el.dataset.ref + ' - ' + el.dataset.des;
  input.dataset.articleId = id;

  const pv = parseFloat(el.dataset.pv) || 0;
  const taux = parseFloat(el.dataset.taux) || 20;
  const prixInput = ligne.querySelector('.prix-input');
  if (prixInput) {
    prixInput.value = pv.toFixed(2);
    prixInput.dataset.tauxTva = taux;
  }
  calcDocLigne(prixInput);

  loadSourceUnitsForArticle(id, ligne);
  if (results) results.classList.remove('show');
}

async function loadSourceUnitsForArticle(articleId, ligneEl) {
  const select = ligneEl?.querySelector('.source-unit-select');
  if (!select) return;
  try {
    const data = await apiFetch(`/documents/historique-unite/${articleId}`);
    select.innerHTML = '<option value="">—</option>';
    if (data?.ventes?.length) {
      const units = [...new Map(data.ventes.map(v => [v.source_unit_id, v])).values()];
      units.forEach(v => {
        if (v.source_unit_id) select.innerHTML += `<option value="${v.source_unit_id}">${v.source_unit_designation || 'Unité #' + v.source_unit_id}</option>`;
      });
    }
    const decompData = await apiFetch(`/moteurs?article_id=${articleId}`);
    if (decompData?.length) {
      decompData.forEach(m => { select.innerHTML += `<option value="${m.id}">${m.reference || 'Moteur #' + m.id} - ${m.designation || ''}</option>`; });
    }
  } catch { /* ignore */ }
}

function scanDocBarcode(btn) {
  const code = prompt('Saisissez ou scannez le code-barres:');
  if (!code) return;

  const wrap = btn.closest('.autocomplete-wrap');
  const input = wrap?.querySelector('.autocomplete-input');
  const ligne = btn.closest('.doc-ligne');
  if (!input) return;

  input.value = '🔍 Recherche: ' + code;
  input.dataset.articleId = '';

  apiFetch('/barcodes/scan', { method: 'POST', body: JSON.stringify({ code }) })
    .then(article => {
      input.value = article.reference + ' - ' + article.designation;
      input.dataset.articleId = article.id;
      const prixInput = ligne?.querySelector('.prix-input');
      if (prixInput) {
        const taux = article.taux_tva_value || 20;
        const ttc = (article.prix_vente_ht || 0) * (1 + taux / 100);
        prixInput.value = ttc.toFixed(2);
        prixInput.dataset.tauxTva = taux;
        calcDocLigne(prixInput);
      }
      showToast('Article trouvé: ' + article.reference, 'success');
    })
    .catch(() => {
      showToast('Article introuvable pour ce code-barres', 'error');
      input.value = '';
    });
}

async function saveDocument(e, type) {
  e.preventDefault();
  const form = $('#docForm');
  const data = new FormData(form);
  const type_document = data.get('type_document');
  const entity_id = data.get('entity_id');

  const lignes = [];
  $$('.doc-ligne').forEach(ligne => {
    const input = ligne.querySelector('.autocomplete-input');
    const qte = ligne.querySelector('.qte-input');
    const prix = ligne.querySelector('.prix-input');
    const sourceUnit = ligne.querySelector('.source-unit-select');
    const articleId = input?.dataset?.articleId;
    if (articleId) {
      const ht = parseFloat(prix?.value) || 0;
      const taux = parseFloat(prix?.dataset?.tauxTva) || 20;
      const [ref, ...desParts] = (input.value || '').split(' - ');
      lignes.push({
        article_id: parseInt(articleId),
        source_unit_id: sourceUnit?.value ? parseInt(sourceUnit.value) : null,
        quantite: parseFloat(qte?.value) || 1,
        prix_unitaire_ht: ht,
        taux_tva: taux,
        reference: ref || '',
        designation: desParts.join(' - ') || ''
      });
    }
  });

  if (!lignes.length) { showToast('Ajoutez au moins une ligne', 'error'); return; }

  const isAchat = type === 'achats';
  const body = {
    type_document,
    [isAchat ? 'fournisseur_id' : 'client_id']: parseInt(entity_id),
    notes: data.get('notes'),
    lignes
  };

  try {
    const result = await apiFetch('/documents', { method: 'POST', body: JSON.stringify(body) });
    showToast(`Document ${result.numero} créé`, 'success');
    closeModal();
    loadDocuments(type);
  } catch (e) { showToast(e.message, 'error'); }
}

function editDocument(id) {
  apiFetch(`/documents/${id}`).then(d => {
    const canEdit = d.statut !== 'paye' && d.statut !== 'annule';
    let htmlContent = html`
      <div class="stat-row"><div class="stat-item"><div class="stat-value">${d.numero}</div><div class="stat-label">Document</div></div>
      <div class="stat-item"><div class="stat-value">${formatDate(d.date_document)}</div><div class="stat-label">Date</div></div>
      <div class="stat-item"><div class="stat-value">${d.client_nom || d.fournisseur_nom || '-'}</div><div class="stat-label">Tiers</div></div>
      <div class="stat-item"><div class="stat-value" style="color:var(--accent)">${formatCurrency(d.net_a_payer)}</div><div class="stat-label">Net à payer</div></div></div>
      <div class="status-flow" style="margin-top:1rem">
        ${['brouillon','envoye','valide','livre','paye'].map(s => {
          const isDone = ['brouillon','envoye','valide','livre','paye'].indexOf(d.statut) >= ['brouillon','envoye','valide','livre','paye'].indexOf(s);
          const isCurrent = d.statut === s;
          return html`<span class="status-step ${isDone ? 'done' : isCurrent ? 'current' : ''}">${s}</span>${s !== 'paye' ? '<span class="status-arrow">→</span>' : ''}`;
        }).join('')}
      </div>
      <h4 style="margin:1rem 0 0.5rem">Lignes</h4>
      <table id="editDocTable"><thead><tr><th>Réf.</th><th>Désignation</th><th>Unité source</th>${canEdit ? '<th>Qté</th><th>PU HT</th><th>TVA %</th>' : '<th>Qté</th><th>PU HT</th><th>TVA</th>'}<th>Total HT</th>${canEdit ? '<th></th>' : ''}</tr></thead>
      <tbody id="editDocLignes">${d.lignes?.length ? d.lignes.map(l => editLigneRow(l, canEdit)).join('') : '<tr><td colspan="8">Aucune ligne</td></tr>'}</tbody>
      <tfoot id="editDocFoot"><tr><td colspan="${canEdit ? 7 : 6}" style="text-align:right;font-weight:600">Total HT:</td><td id="editTotalHT">${formatCurrency(d.montant_ht)}</td>${canEdit ? '<td></td>' : ''}</tr>
      <tr><td colspan="${canEdit ? 7 : 6}" style="text-align:right">TVA:</td><td id="editTotalTVA">${formatCurrency(d.total_tva)}</td>${canEdit ? '<td></td>' : ''}</tr>
      <tr><td colspan="${canEdit ? 7 : 6}" style="text-align:right;font-weight:700;font-size:1rem">NET À PAYER:</td><td id="editTotalTTC" style="font-weight:700;font-size:1rem;color:var(--accent)">${formatCurrency(d.net_a_payer)}</td>${canEdit ? '<td></td>' : ''}</tr></tfoot></table>
      ${canEdit ? '<button class="btn btn-sm btn-secondary" onclick="addEditDocLigne(' + id + ')" style="margin-top:0.3rem">+ Ajouter ligne</button>' : ''}
      ${d.notes ? html`<div class="form-group" style="margin-top:1rem"><label>Notes</label><textarea class="form-textarea" id="editDocNotes" ${canEdit ? '' : 'readonly'}>${d.notes}</textarea></div>` : ''}
    `;

    openModal(`Document: ${d.numero}`, htmlContent, html`
      <button class="btn btn-sm btn-secondary" onclick="closeModal()">Fermer</button>
      ${canEdit ? `<button class="btn btn-sm btn-success" onclick="changeDocStatut(${d.id}, '${d.statut}');closeModal()">➡️ Statut suivant</button>` : ''}
      ${canEdit ? `<button class="btn btn-sm btn-primary" onclick="saveEditDocument(${d.id})">💾 Enregistrer</button>` : ''}
      <button class="btn btn-sm btn-secondary" onclick="printDocument(${d.id});closeModal()">🖨️ Imprimer</button>
    `);
  });
}

function editLigneRow(l, canEdit) {
  if (canEdit) {
    return html`<tr data-ligne-id="${l.id}">
      <td>${l.reference || l.art_reference || '-'}</td>
      <td>${l.designation || l.art_designation || '-'}</td>
      <td>${l.source_unit_designation ? `<span class="badge badge-info">${l.source_unit_designation}</span>` : '-'}</td>
      <td><input type="number" class="form-control edit-qte" value="${l.quantite}" min="1" style="width:60px" oninput="recalcEditDoc()"></td>
      <td><input type="number" class="form-control edit-prix" value="${l.prix_unitaire_ht}" step="0.01" style="width:90px" oninput="recalcEditDoc()" data-taux-tva="${l.taux_tva || 20}"></td>
      <td><input type="number" class="form-control edit-tva" value="${l.taux_tva || 20}" step="0.1" style="width:60px" oninput="recalcEditDoc()"></td>
      <td class="edit-ht">${formatCurrency(l.montant_ht)}</td>
      <td><button class="btn btn-sm btn-danger" onclick="removeEditLigne(this, ${l.id})">✕</button></td>
    </tr>`;
  }
  return html`<tr><td>${l.reference || l.art_reference || '-'}</td><td>${l.designation || l.art_designation || '-'}</td><td>${l.source_unit_designation ? `<span class="badge badge-info">${l.source_unit_designation}</span>` : '-'}</td><td>${formatNumber(l.quantite)}</td><td>${formatCurrency(l.prix_unitaire_ht)}</td><td>${l.taux_tva}%</td><td><strong>${formatCurrency(l.montant_ht)}</strong></td></tr>`;
}

function recalcEditDoc() {
  const rows = $$('#editDocLignes tr[data-ligne-id]');
  let totalHT = 0, totalTVA = 0;
  rows.forEach(r => {
    const qte = parseFloat(r.querySelector('.edit-qte')?.value) || 1;
    const prix = parseFloat(r.querySelector('.edit-prix')?.value) || 0;
    const tva = parseFloat(r.querySelector('.edit-tva')?.value) || 20;
    const ht = prix * qte;
    const tvaMontant = ht * tva / 100;
    totalHT += ht;
    totalTVA += tvaMontant;
    const htCell = r.querySelector('.edit-ht');
    if (htCell) htCell.textContent = formatCurrency(ht);
  });
  const h = $('#editTotalHT'); if (h) h.textContent = formatCurrency(totalHT);
  const t = $('#editTotalTVA'); if (t) t.textContent = formatCurrency(totalTVA);
  const n = $('#editTotalTTC'); if (n) n.textContent = formatCurrency(totalHT + totalTVA);
}

window.removeEditLigne = async function(btn, ligneId) {
  const tr = btn.closest('tr');
  if (ligneId && !String(ligneId).startsWith('new_')) {
    tr.dataset.deleted = 'true';
    tr.style.opacity = '0.3';
    tr.querySelectorAll('input').forEach(i => i.disabled = true);
  } else {
    tr.remove();
  }
  recalcEditDoc();
};

window.addEditDocLigne = async function(docId) {
  const tbody = $('#editDocLignes');
  const tr = document.createElement('tr');
  tr.dataset.ligneId = 'new_' + Date.now();
  tr.innerHTML = `<td><input type="text" class="form-control edit-ref-search" placeholder="Rechercher..." oninput="searchEditArticle(this)" autocomplete="off"><div class="autocomplete-results"></div></td>
    <td class="edit-des-cell">-</td>
    <td>-</td>
    <td><input type="number" class="form-control edit-qte" value="1" min="1" style="width:60px" oninput="recalcEditDoc()"></td>
    <td><input type="number" class="form-control edit-prix" value="0" step="0.01" style="width:90px" oninput="recalcEditDoc()" data-taux-tva="20" data-article-id=""></td>
    <td><input type="number" class="form-control edit-tva" value="20" step="0.1" style="width:60px" oninput="recalcEditDoc()"></td>
    <td class="edit-ht">0,00 MAD</td>
    <td><button class="btn btn-sm btn-danger" onclick="removeEditLigne(this, null)">✕</button></td>`;
  tbody.appendChild(tr);
  window.searchEditArticle = searchEditArticle;
  window.selectEditArticle = selectEditArticle;
};

function searchEditArticle(input) {
  clearTimeout(input._searchTimeout);
  const val = input.value.trim();
  const wrap = input.closest('td');
  const results = wrap?.querySelector('.autocomplete-results');
  if (!results) return;
  if (val.length < 2) { results.classList.remove('show'); return; }
  input._searchTimeout = setTimeout(async () => {
    try {
      const data = await apiFetch('/articles?search=' + encodeURIComponent(val) + '&limit=10&actif=1');
      if (!data?.articles?.length) {
        results.innerHTML = '<div class="autocomplete-item" style="color:var(--text-light)">Aucun article</div>';
        results.classList.add('show'); return;
      }
      results.innerHTML = data.articles.map(a => {
        const taux = a.taux_tva_value || 20;
        return `<div class="autocomplete-item" onclick="selectEditArticle(this, ${a.id}, '${(a.reference||'').replace(/'/g,"\\'")}', '${(a.designation||'').replace(/'/g,"\\'")}', ${a.prix_vente_ht||0}, ${taux})">
          <div><span class="ref">${a.reference}</span> - ${a.designation}</div>
          <div><span class="price">${formatCurrency((a.prix_vente_ht||0)*(1+taux/100))} MAD TTC</span></div>
        </div>`;
      }).join('');
      results.classList.add('show');
    } catch { results.classList.remove('show'); }
  }, 300);
}

window.selectEditArticle = function(el, id, ref, des, pv, taux) {
  const tr = el.closest('tr');
  tr.dataset.newArticleId = id;
  const desCell = tr.querySelector('.edit-des-cell');
  if (desCell) desCell.textContent = des;
  const refInput = tr.querySelector('.edit-ref-search');
  if (refInput) refInput.value = ref;
  const prixInput = tr.querySelector('.edit-prix');
  if (prixInput) { prixInput.value = pv; prixInput.dataset.tauxTva = taux; prixInput.dataset.articleId = id; }
  const tvaInput = tr.querySelector('.edit-tva');
  if (tvaInput) tvaInput.value = taux;
  recalcEditDoc();
  const results = tr.querySelector('.autocomplete-results');
  if (results) results.classList.remove('show');
};

async function saveEditDocument(docId) {
  try {
    const rows = $$('#editDocLignes tr[data-ligne-id]');
    const promises = [];

    for (const r of rows) {
      if (r.dataset.deleted === 'true') {
        const ligneId = r.dataset.ligneId;
        promises.push(apiFetch(`/documents/${docId}/lignes/${ligneId}`, { method: 'DELETE' }));
        continue;
      }

      const ligneId = r.dataset.ligneId;
      const qte = parseFloat(r.querySelector('.edit-qte')?.value) || 1;
      const prix = parseFloat(r.querySelector('.edit-prix')?.value) || 0;
      const tva = parseFloat(r.querySelector('.edit-tva')?.value) || 20;

      if (ligneId && !ligneId.startsWith('new_')) {
        promises.push(apiFetch(`/documents/${docId}/lignes/${ligneId}`, {
          method: 'PUT',
          body: JSON.stringify({ quantite: qte, prix_unitaire_ht: prix, taux_tva: tva })
        }));
      } else {
        const articleId = r.querySelector('.edit-prix')?.dataset?.articleId || r.dataset.newArticleId;
        if (articleId) {
          promises.push(apiFetch(`/documents/${docId}/lignes`, {
            method: 'POST',
            body: JSON.stringify({ article_id: parseInt(articleId), quantite: qte, prix_unitaire_ht: prix, taux_tva: tva })
          }));
        }
      }
    }

    await Promise.all(promises);

    const notesEl = $('#editDocNotes');
    if (notesEl) {
      await apiFetch(`/documents/${docId}`, {
        method: 'PUT',
        body: JSON.stringify({ notes: notesEl.value })
      });
    }

    showToast('Document enregistré', 'success');
    closeModal();
    const route = document.querySelector('[data-route^="documents"]')?.dataset?.route || '';
    loadDocuments(route.includes('achats') ? 'achats' : 'ventes');
  } catch (e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

async function changeDocStatut(id, currentStatut) {
  const nextStatuts = { brouillon: 'envoye', envoye: 'valide', valide: 'livre', livre: 'paye' };
  const next = nextStatuts[currentStatut];
  if (!next) { showToast('Document déjà au statut final', 'warning'); return; }
  try {
    await apiFetch(`/documents/${id}/statut`, { method: 'PUT', body: JSON.stringify({ statut: next }) });
    showToast(`Statut mis à jour: ${next}`, 'success');
    const type = document.querySelector('[data-route^="documents"]')?.dataset?.route || '';
    loadDocuments(type.includes('achats') ? 'achats' : 'ventes');
  } catch (e) { showToast(e.message, 'error'); }
}

async function supprimerDocument(id, numero) {
  if (!confirm(`Supprimer le document ${numero} ?`)) return;
  try {
    await apiFetch(`/documents/${id}`, { method: 'DELETE' });
    showToast('Document supprimé', 'success');
    const route = document.querySelector('[data-route^="documents"]')?.dataset?.route || '';
    loadDocuments(route.includes('achats') ? 'achats' : 'ventes');
  } catch (e) { showToast(e.message, 'error'); }
}

function printDocument(id) {
  Promise.all([
    apiFetch(`/documents/${id}`),
    apiFetch('/parametres')
  ]).then(([d, p]) => {
    const win = window.open('', '_blank');
    const modele = p.modele_impression || 'classique';
    const devise = p.devise || 'MAD';
    const societe = {
      nom: p.societe_nom || 'Accessoires Tensift',
      slogan: p.societe_slogan || 'ERP Automotive',
      logo: p.societe_logo || '',
      logoWidth: p.societe_logo_width || 180,
      logoHeight: p.societe_logo_height || 0,
      logoPosition: p.societe_logo_position || 'gauche',
      adresse: p.societe_adresse || '',
      ville: p.societe_ville || '',
      telephone: p.societe_telephone || '',
      email: p.societe_email || '',
      ice: p.societe_ice || '',
      rc: p.societe_rc || '',
      if_fiscal: p.societe_if || '',
      cnss: p.societe_cnss || '',
      patente: p.societe_patente || '',
      banque: p.societe_banque || '',
      rib: p.societe_rib || '',
      mentions: p.societe_mentions || '',
      couleur: p.couleur_charte || '#1a3a5c'
    };

    const lignesHtml = d.lignes?.map(l => {
      const puTTC = l.prix_unitaire_ht * (1 + (l.taux_tva || 0) / 100);
      return `<tr><td>${l.reference || l.art_reference || '-'}</td><td>${l.designation || l.art_designation || '-'}</td><td>${formatNumber(l.quantite)}</td><td>${formatCurrency(puTTC)}</td><td>${l.remise_pourcent || 0}%</td><td>${l.taux_tva}%</td><td>${formatCurrency(l.montant_ttc)}</td></tr>`;
    }).join('') || '';

    const totalsHtml = `
      <tr class="total-row"><td colspan="6" style="text-align:right">Total TTC:</td><td>${formatCurrency(d.net_a_payer)} ${devise}</td></tr>
      <tr class="total-row"><td colspan="6" style="text-align:right">Dont TVA:</td><td>${formatCurrency(d.total_tva)}</td></tr>
      <tr class="total-row"><td colspan="6" style="text-align:right;font-size:14px">NET À PAYER:</td><td style="font-size:14px;color:${societe.couleur}">${formatCurrency(d.net_a_payer)} ${devise}</td></tr>
    `;

    const clientHtml = d.client_nom ? `
      <div class="info-card"><h4>CLIENT</h4><p><strong>${d.client_nom}</strong></p>${d.client_ice ? `<p>ICE: ${d.client_ice}</p>` : ''}${d.client_adresse ? `<p>${d.client_adresse}</p>` : ''}${d.client_ville ? `<p>${d.client_ville}</p>` : ''}</div>
    ` : '';
    const fournisseurHtml = d.fournisseur_nom ? `
      <div class="info-card"><h4>FOURNISSEUR</h4><p><strong>${d.fournisseur_nom}</strong></p></div>
    ` : '';

    const typeLabel = d.type_document.replace(/_/g,' ').toUpperCase();
    const dateDoc = formatDate(d.date_document);

    const templates = {
      // ========== CLASSIQUE ==========
      classique: `
        <style>
          body{font-family:'Satoshi',Arial,sans-serif;padding:20px;font-size:12px;color:#333}
          .header{display:flex;justify-content:space-between;align-items:start;margin-bottom:20px;padding-bottom:15px;border-bottom:3px solid ${societe.couleur}}
          .header-left{display:flex;gap:12px;align-items:center}
          .logo-img{max-width:${societe.logoWidth}px;${societe.logoHeight > 0 ? `max-height:${societe.logoHeight}px` : ''};object-fit:contain}
          .soc-name{font-size:20px;font-weight:700;color:${societe.couleur}}
          .soc-slogan{font-size:11px;color:#6b7280;margin-top:2px}
          .doc-badge{font-size:13px;font-weight:600;color:${societe.couleur};margin-top:6px}
          .doc-ref{font-size:11px;color:#6b7280}
          .info-grid{display:flex;justify-content:space-between;gap:1rem;margin-bottom:15px}
          .info-card{background:#f8f9fa;border-radius:4px;padding:10px;flex:1;min-width:0}
          .info-card h4{font-size:10px;color:#6b7280;margin:0 0 5px;text-transform:uppercase;letter-spacing:0.5px}
          .info-card p{margin:2px 0;font-size:11px}
          table{width:100%;border-collapse:collapse;margin-top:5px}
          th{background:${societe.couleur};color:#fff;padding:8px;text-align:left;font-size:11px}
          td{padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px}
          tbody tr:hover{background:#f5f6fa}
          .total-row td{font-weight:700;padding-top:8px;border-top:2px solid ${societe.couleur}}
          .footer{margin-top:30px;border-top:1px solid #d1d5db;padding-top:10px;font-size:10px;color:#6b7280;display:flex;justify-content:space-between}
        </style>
        <div class="header">
          <div class="header-left">${societe.logo ? `<img src="${societe.logo}" class="logo-img">` : ''}<div><div class="soc-name">${societe.nom}</div><div class="soc-slogan">${societe.slogan}</div><div class="doc-badge">${typeLabel}</div><div class="doc-ref">N° ${d.numero}</div></div></div>
          <div style="text-align:right;font-size:11px"><div>Date: ${dateDoc}</div>${societe.ice ? `<div>ICE: ${societe.ice}</div>` : ''}</div>
        </div>
        <div class="info-grid">${clientHtml || fournisseurHtml}<div class="info-card"><h4>DOCUMENT</h4><p>Date: ${dateDoc}</p><p>Échéance: ${d.date_echeance ? formatDate(d.date_echeance) : '-'}</p><p>Statut: ${d.statut}</p></div></div>
        <table><thead><tr><th>Réf.</th><th>Désignation</th><th>Qté</th><th>PU TTC</th><th>Remise</th><th>TVA</th><th>Total TTC</th></tr></thead><tbody>${lignesHtml}</tbody><tfoot>${totalsHtml}</tfoot></table>
        <div class="footer"><div>${societe.nom} ${societe.telephone ? '- ' + societe.telephone : ''}${societe.email ? ' | ' + societe.email : ''}</div><div>${societe.mentions || 'Document généré le ' + new Date().toLocaleString('fr-FR')}</div></div>
      `,

      // ========== MODERNE ==========
      moderne: `
        <style>
          body{font-family:'Satoshi',Arial,sans-serif;padding:0;font-size:12px;color:#333;background:#f0f2f5}
          .page{max-width:210mm;margin:0 auto;background:#fff;padding:25px;min-height:297mm;box-shadow:0 0 20px rgba(0,0,0,0.05)}
          .header{text-align:center;padding-bottom:15px;border-bottom:4px solid ${societe.couleur};margin-bottom:20px}
          .logo-img{max-width:${societe.logoWidth}px;${societe.logoHeight > 0 ? `max-height:${societe.logoHeight}px` : ''};object-fit:contain;margin-bottom:8px}
          .soc-name{font-size:22px;font-weight:700;color:${societe.couleur};letter-spacing:1px}
          .soc-slogan{font-size:11px;color:#6b7280}
          .doc-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;background:${societe.couleur};color:#fff;padding:12px 16px;border-radius:8px}
          .doc-header .type{font-size:16px;font-weight:700;letter-spacing:1px}
          .doc-header .ref{font-size:13px;opacity:0.9}
          .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:15px}
          .info-card{background:#f8f9fa;border-radius:8px;padding:12px;border:1px solid #e5e7eb}
          .info-card h4{font-size:9px;color:#6b7280;margin:0 0 4px;text-transform:uppercase;letter-spacing:1px}
          .info-card p{margin:1px 0;font-size:11px}
          .info-card strong{color:${societe.couleur}}
          table{width:100%;border-collapse:separate;border-spacing:0 4px;margin-top:5px}
          th{padding:10px 12px;text-align:left;font-size:10px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid ${societe.couleur}}
          td{padding:8px 12px;background:#f8f9fa;border-radius:4px;font-size:11px}
          tbody tr td:first-child{border-radius:6px 0 0 6px}
          tbody tr td:last-child{border-radius:0 6px 6px 0}
          .total-row td{background:#fff;font-weight:700;border-top:2px solid ${societe.couleur}}
          .total-row td:last-child{color:${societe.couleur};font-size:16px}
          .footer{margin-top:30px;text-align:center;font-size:10px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:12px}
        </style>
        <div class="page">
          <div class="header">${societe.logo ? `<img src="${societe.logo}" class="logo-img">` : ''}<div class="soc-name">${societe.nom}</div><div class="soc-slogan">${societe.slogan}</div></div>
          <div class="doc-header"><span class="type">${typeLabel}</span><span class="ref">N° ${d.numero} | ${dateDoc}</span></div>
          <div class="info-grid">${clientHtml || fournisseurHtml}<div class="info-card"><h4>Détails</h4><p>Date: ${dateDoc}</p><p>Échéance: ${d.date_echeance ? formatDate(d.date_echeance) : '-'}</p><p>Statut: <strong>${d.statut}</strong></p></div></div>
          <table><thead><tr><th>Réf.</th><th>Désignation</th><th>Qté</th><th>PU TTC</th><th>Remise</th><th>TVA</th><th>Total TTC</th></tr></thead><tbody>${lignesHtml}</tbody><tfoot>${totalsHtml}</tfoot></table>
          <div class="footer">${societe.nom} — ${societe.telephone}${societe.email ? ' | ' + societe.email : ''}${societe.ice ? ' | ICE: ' + societe.ice : ''}<br>${societe.mentions || 'Document généré le ' + new Date().toLocaleString('fr-FR')}</div>
        </div>
      `,

      // ========== MINIMALISTE ==========
      minimaliste: `
        <style>
          body{font-family:'Courier New',monospace;padding:20px;font-size:11px;color:#000}
          .header{margin-bottom:15px}
          .logo-img{max-width:${societe.logoWidth}px;${societe.logoHeight > 0 ? `max-height:${societe.logoHeight}px` : ''};object-fit:contain}
          .soc-name{font-size:18px;font-weight:700;text-transform:uppercase;letter-spacing:2px}
          hr{border:none;border-top:2px solid #000;margin:8px 0}
          .doc-ref{font-size:14px;font-weight:700;margin:10px 0}
          .info-grid{display:flex;justify-content:space-between;margin-bottom:12px;padding:8px;border:1px solid #000}
          .info-card p{margin:1px 0;font-size:10px}
          table{width:100%;border-collapse:collapse}
          th{border-bottom:2px solid #000;padding:6px 4px;text-align:left;font-size:9px;text-transform:uppercase}
          td{padding:4px;border-bottom:1px solid #ccc;font-size:10px}
          .total-row td{border-top:2px solid #000;font-weight:700}
          .footer{margin-top:20px;border-top:1px solid #000;padding-top:6px;font-size:9px}
        </style>
        <div class="header"><div style="display:flex;justify-content:space-between;align-items:center">${societe.logo ? `<img src="${societe.logo}" class="logo-img">` : ''}<div style="text-align:right"><div class="soc-name">${societe.nom}</div><div style="font-size:10px">${societe.slogan}</div></div></div></div>
        <hr>
        <div class="doc-ref">${typeLabel} N° ${d.numero} — ${dateDoc}</div>
        <div class="info-grid"><div>${clientHtml || fournisseurHtml || ''}</div><div style="text-align:right">${societe.ice ? 'ICE: ' + societe.ice + '<br>' : ''}${societe.telephone ? 'Tel: ' + societe.telephone + '<br>' : ''}${societe.email ? 'Email: ' + societe.email + '<br>' : ''}</div></div>
        <table><thead><tr><th>Réf.</th><th>Désignation</th><th>Qté</th><th>PU TTC</th><th>Remise</th><th>TVA</th><th>Total TTC</th></tr></thead><tbody>${lignesHtml}</tbody><tfoot>${totalsHtml}</tfoot></table>
        <div class="footer">${societe.mentions || 'Document généré le ' + new Date().toLocaleString('fr-FR')} — ${societe.nom}</div>
      `,

      // ========== PROFESSIONNEL ==========
      professionnel: `
        <style>
          body{font-family:'Satoshi',Arial,sans-serif;padding:0;font-size:12px;color:#333}
          .page{max-width:210mm;margin:0 auto;background:#fff;min-height:297mm;display:flex;flex-direction:column}
          .top-bar{background:${societe.couleur};color:#fff;padding:15px 25px;display:flex;justify-content:space-between;align-items:center}
          .top-bar .soc-name{font-size:18px;font-weight:700;letter-spacing:1px}
          .top-bar .doc-info{text-align:right;font-size:11px;opacity:0.95}
          .top-bar .doc-info .type{font-size:15px;font-weight:700}
          .content{padding:25px;flex:1}
          .header-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;margin-bottom:20px;border:1px solid #e5e7eb}
          .header-grid > div{padding:12px 15px}
          .header-grid > div:first-child{border-right:1px solid #e5e7eb}
          .header-grid h4{font-size:9px;color:#6b7280;margin:0 0 5px;text-transform:uppercase;letter-spacing:1px}
          .header-grid p{margin:1px 0;font-size:11px}
          .logo-area{display:flex;justify-content:center;padding:10px 0;margin-bottom:15px}
          .logo-img{max-width:${societe.logoWidth}px;${societe.logoHeight > 0 ? `max-height:${societe.logoHeight}px` : ''};object-fit:contain}
          table{width:100%;border-collapse:collapse}
          th{background:${societe.couleur};color:#fff;padding:10px 12px;text-align:left;font-size:10px;letter-spacing:0.3px}
          td{padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:11px}
          tbody tr:nth-child(even){background:#f8f9fa}
          .total-row td{font-weight:700;border-top:2px solid ${societe.couleur};background:#fff!important}
          .total-row td:last-child{color:${societe.couleur};font-size:15px}
          .signatures{display:flex;justify-content:space-between;margin-top:40px;padding:0 25px}
          .signature-box{width:200px;border-top:1px solid #333;padding-top:6px;text-align:center;font-size:10px;color:#6b7280}
          .footer{background:#f8f9fa;padding:12px 25px;font-size:9px;color:#6b7280;text-align:center;border-top:1px solid #e5e7eb;margin-top:auto}
          .footer-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;text-align:center;font-size:8px;margin-top:5px;color:#9ca3af}
        </style>
        <div class="page">
          <div class="top-bar">
            <div><div class="soc-name">${societe.nom}</div><div style="font-size:10px;opacity:0.8">${societe.slogan}</div></div>
            <div class="doc-info"><div class="type">${typeLabel}</div><div>N° ${d.numero}</div></div>
          </div>
          <div class="content">
            <div class="logo-area">${societe.logo ? `<img src="${societe.logo}" class="logo-img">` : ''}</div>
            <div class="header-grid">
              <div>${clientHtml || fournisseurHtml || '<h4>Tiers</h4><p>-</p>'}</div>
              <div><h4>Références</h4><p>Date: ${dateDoc}</p><p>Échéance: ${d.date_echeance ? formatDate(d.date_echeance) : '-'}</p><p>Statut: ${d.statut}${d.conditions_paiement ? '</p><p>Paiement: ' + d.conditions_paiement : ''}</p></div>
            </div>
            <table><thead><tr><th>Réf.</th><th>Désignation</th><th>Qté</th><th>PU TTC</th><th>Remise</th><th>TVA</th><th>Total TTC</th></tr></thead><tbody>${lignesHtml}</tbody><tfoot>${totalsHtml}</tfoot></table>
            ${d.notes ? `<div style="margin-top:15px;padding:10px;background:#f8f9fa;border-radius:4px;font-size:10px"><strong>Notes:</strong> ${d.notes}</div>` : ''}
          </div>
          <div class="signatures"><div class="signature-box">Signature client</div><div class="signature-box">Cachet & signature</div></div>
          <div class="footer">
            <div>${societe.nom}${societe.adresse ? ' — ' + societe.adresse + (societe.ville ? ', ' + societe.ville : '') : ''}</div>
            <div class="footer-grid">${societe.telephone ? '<div>Tel: ' + societe.telephone + '</div>' : ''}${societe.email ? '<div>Email: ' + societe.email + '</div>' : ''}${societe.ice ? '<div>ICE: ' + societe.ice + '</div>' : ''}${societe.rc ? '<div>RC: ' + societe.rc + '</div>' : ''}${societe.if_fiscal ? '<div>IF: ' + societe.if_fiscal + '</div>' : ''}${societe.banque && societe.rib ? '<div>' + societe.banque + ': ' + societe.rib + '</div>' : ''}</div>
            ${societe.mentions ? '<div style="margin-top:4px">' + societe.mentions + '</div>' : ''}
          </div>
        </div>
      `
    };

    win.document.write(`<html><head><meta charset="utf-8"><title>${societe.nom} — ${d.numero}</title><style>@page{margin:0!important}</style>${templates[modele] || templates.classique}</head><body></body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); }, 600);
  });
}

// ==================== CODES-BARRES ====================
function renderBarcodes(page) {
  page.innerHTML = html`
    <div class="page-title">Codes-barres & Étiquettes</div>
    <div class="grid grid-2">
      <div class="card">
        <div class="card-header"><h3>🔍 Scanner</h3></div>
        <div class="scanner-container" id="scannerContainer">
          <div id="scannerPlaceholder" style="background:#000;height:250px;border-radius:var(--radius);display:flex;align-items:center;justify-content:center;color:#fff;">
            <div style="text-align:center"><p style="font-size:2rem">📷</p><p>Cliquez pour activer le scanner</p></div>
          </div>
        </div>
        <div style="margin-top:0.5rem"><input type="text" id="barcodeInput" class="form-control" placeholder="Ou saisir manuellement un code-barres..." onkeydown="if(event.key==='Enter')scanBarcode()"></div>
        <button class="btn btn-primary btn-full" style="margin-top:0.5rem" onclick="scanBarcode()">Rechercher</button>
        <div id="scanResult" class="hidden" style="margin-top:0.5rem"></div>
      </div>
      <div class="card">
        <div class="card-header"><h3>🏷️ Générer & Imprimer</h3></div>
        <div class="form-group"><label>Rechercher un article</label>
          <select id="labelArticleSelect" class="form-control" onchange="previewLabel()">
            <option value="">Sélectionnez un article...</option>
          </select>
        </div>
        <div class="form-row"><div class="form-group"><label>Format</label><select id="labelFormat" class="form-select" onchange="previewLabel()"><option value="Code128">Code128</option><option value="EAN13">EAN-13</option></select></div>
        <div class="form-group"><label>Largeur (px)</label><input type="number" id="labelWidth" class="form-control" value="250" onchange="previewLabel()"></div></div>
        <div id="labelPreview" class="label-preview"><p style="color:var(--text-light)">Sélectionnez un article</p></div>
        <button class="btn btn-primary btn-full" style="margin-top:0.5rem" onclick="generateLabel()">🖨️ Générer & Imprimer</button>
      </div>
    </div>
    <div class="card" style="margin-top:1rem">
      <div class="card-header"><h3>📋 Impression en lot</h3></div>
      <div class="form-group"><label>Sélectionner plusieurs articles</label>
        <select id="bulkArticleSelect" class="form-control" multiple style="height:120px"></select>
      </div>
      <button class="btn btn-primary" onclick="printBulkLabels()">🖨️ Imprimer étiquettes sélectionnées</button>
    </div>
  `;

  // Load articles for selects
  apiFetch('/articles?actif=1&limit=500').then(data => {
    if (!data?.articles) return;
    const opts = data.articles.map(a => `<option value="${a.id}">${a.reference} - ${a.designation}</option>`).join('');
    $('#labelArticleSelect').innerHTML = '<option value="">Sélectionnez un article...</option>' + opts;
    $('#bulkArticleSelect').innerHTML = opts;
  });

  window.scanBarcode = scanBarcode;
  window.previewLabel = previewLabel;
  window.generateLabel = generateLabel;
  window.printBulkLabels = printBulkLabels;
}

async function scanBarcode() {
  const code = $('#barcodeInput')?.value?.trim();
  if (!code) { showToast('Saisissez un code-barres', 'error'); return; }
  try {
    const article = await apiFetch('/barcodes/scan', { method: 'POST', body: JSON.stringify({ code }) });
    const result = $('#scanResult');
    result.classList.remove('hidden');
    result.innerHTML = html`
      <div class="card" style="padding:0.75rem;margin-top:0.5rem">
        <p><strong>${article.reference}</strong> - ${article.designation}</p>
        <div class="stat-row" style="gap:0.3rem;margin-top:0.3rem">
          <div class="stat-item" style="padding:0.3rem"><div class="stat-value" style="font-size:0.9rem">${formatNumber(article.stock_actuel)}</div><div class="stat-label">Stock</div></div>
          <div class="stat-item" style="padding:0.3rem"><div class="stat-value" style="font-size:0.9rem">${formatCurrency(article.prix_vente_ht)}</div><div class="stat-label">PV HT</div></div>
        </div>
        <button class="btn btn-sm btn-primary" style="margin-top:0.3rem" onclick="navigate('articles')">Voir dans articles</button>
      </div>
    `;
  } catch (e) { showToast('Article introuvable', 'error'); }
}

function previewLabel() {
  const articleId = $('#labelArticleSelect')?.value;
  if (!articleId) { $('#labelPreview').innerHTML = '<p style="color:var(--text-light)">Sélectionnez un article</p>'; return; }
  apiFetch(`/articles/${articleId}`).then(a => {
    const code = a.code_barre || `TA${String(a.id).padStart(8,'0')}`;
    const width = parseInt($('#labelWidth').value) || 250;
    const format = $('#labelFormat').value;
    $('#labelPreview').innerHTML = html`
      <p style="margin-bottom:0.5rem"><strong>${a.reference}</strong> — ${a.designation}</p>
      <p style="font-size:0.8rem;color:var(--text-secondary)">${formatCurrency(a.prix_vente_ht)} MAD</p>
      <svg id="barcodeSvg"></svg>
    `;
    try {
      JsBarcode('#barcodeSvg', code, { format: format === 'EAN13' ? 'EAN13' : 'CODE128', width: 2, height: 50, displayValue: true, fontSize: 14, margin: 5 });
    } catch {}
  });
}

function generateLabel() {
  const svg = document.querySelector('#labelPreview svg');
  if (!svg) { showToast('Sélectionnez d\'abord un article', 'warning'); return; }
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>Étiquette</title><style>body{text-align:center;padding:20px}svg{max-width:100%}</style></head><body>${svg.outerHTML}</body></html>`);
  win.document.close();
  win.print();
}

async function printBulkLabels() {
  const sel = $('#bulkArticleSelect');
  const ids = Array.from(sel.selectedOptions).map(o => parseInt(o.value));
  if (!ids.length) { showToast('Sélectionnez des articles', 'warning'); return; }
  try {
    const data = await apiFetch('/barcodes/print-labels', { method: 'POST', body: JSON.stringify({ article_ids: ids }) });
    if (!data?.labels?.length) { showToast('Aucune étiquette générée', 'error'); return; }
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>Étiquettes lot</title><style>
      body{font-family:Arial,sans-serif;padding:10px}
      .label{display:inline-block;border:1px dashed #ccc;padding:10px;margin:5px;text-align:center;width:200px}
      .label strong{display:block;font-size:12px}
      .label .price{color:#2563eb;font-weight:bold;font-size:14px}
      @media print{@page{margin:5mm}}
    </style></head><body>
    <div>${data.labels.map(l => `<div class="label"><strong>${l.reference}</strong><span style="font-size:10px;display:block">${l.designation}</span><div class="price">${formatCurrency(l.prix)} MAD</div><svg class="bc-${l.code_barre}"></svg></div>`).join('')}</div>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
    <script>${data.labels.map(l => `JsBarcode('.bc-${l.code_barre}', '${l.code_barre}', {width:1.5,height:30,displayValue:true,fontSize:10});`).join('')} window.print();<\/script>
    </body></html>`);
    win.document.close();
  } catch (e) { showToast(e.message, 'error'); }
}

// ==================== RAPPORTS ====================
function renderRapports(page) {
  page.innerHTML = html`
    <div class="page-title">Rapports</div>
    <div class="grid grid-3">
      <div class="card" style="cursor:pointer" onclick="generateReport('inventaire')">
        <div style="text-align:center;padding:1rem"><div style="font-size:2rem">📦</div><h3 style="margin-top:0.5rem">Inventaire valorisé</h3><p style="color:var(--text-secondary);font-size:0.8rem">Stock valorisé au PMP</p></div>
      </div>
      <div class="card" style="cursor:pointer" onclick="generateReport('ventes')">
        <div style="text-align:center;padding:1rem"><div style="font-size:2rem">💰</div><h3 style="margin-top:0.5rem">Bilan ventes</h3><p style="color:var(--text-secondary);font-size:0.8rem">Ventes par période</p></div>
      </div>
      <div class="card" style="cursor:pointer" onclick="generateReport('achats')">
        <div style="text-align:center;padding:1rem"><div style="font-size:2rem">🛒</div><h3 style="margin-top:0.5rem">Bilan achats</h3><p style="color:var(--text-secondary);font-size:0.8rem">Achats par période</p></div>
      </div>
      <div class="card" style="cursor:pointer" onclick="generateReport('mouvements')">
        <div style="text-align:center;padding:1rem"><div style="font-size:2rem">📊</div><h3 style="margin-top:0.5rem">Mouvements stock</h3><p style="color:var(--text-secondary);font-size:0.8rem">Entrées/sorties</p></div>
      </div>
      <div class="card" style="cursor:pointer" onclick="generateReport('balance-clients')">
        <div style="text-align:center;padding:1rem"><div style="font-size:2rem">👥</div><h3 style="margin-top:0.5rem">Balance clients</h3><p style="color:var(--text-secondary);font-size:0.8rem">Soldes clients</p></div>
      </div>
      <div class="card" style="cursor:pointer" onclick="generateReport('moteurs')">
        <div style="text-align:center;padding:1rem"><div style="font-size:2rem">🔧</div><h3 style="margin-top:0.5rem">État parc moteurs</h3><p style="color:var(--text-secondary);font-size:0.8rem">Intégrité des moteurs</p></div>
      </div>
    </div>
  `;
  window.generateReport = generateReport;
}

async function generateReport(type) {
  let title = '', headers = [], rows = [];
  switch (type) {
    case 'inventaire': {
      title = 'Inventaire valorisé';
      const data = await apiFetch('/articles?limit=500');
      if (data?.articles) {
        headers = ['Réf.', 'Désignation', 'Stock', 'PA HT', 'PV HT', 'Valeur stock'];
        rows = data.articles.map(a => [a.reference, a.designation, formatNumber(a.stock_actuel), formatCurrency(a.prix_achat_ht), formatCurrency(a.prix_vente_ht), formatCurrency(a.prix_achat_ht * a.stock_actuel)]);
        const total = data.articles.reduce((s, a) => s + (a.prix_achat_ht * a.stock_actuel), 0);
        rows.push(['', '', '', '', 'TOTAL', formatCurrency(total)]);
      }
      break;
    }
    case 'ventes': {
      title = 'Bilan ventes';
      const data = await apiFetch('/documents?type=facture_client&limit=200');
      if (data?.documents) {
        headers = ['N°', 'Date', 'Client', 'Montant HT', 'TVA', 'Net à payer', 'Statut'];
        rows = data.documents.map(d => [d.numero, formatDate(d.date_document), d.client_nom||'-', formatCurrency(d.montant_ht), formatCurrency(d.total_tva), formatCurrency(d.net_a_payer), d.statut]);
      }
      break;
    }
    case 'achats': {
      title = 'Bilan achats';
      const data = await apiFetch('/documents?type=commande_fournisseur&limit=200');
      if (data?.documents) {
        headers = ['N°', 'Date', 'Fournisseur', 'Montant HT', 'Statut'];
        rows = data.documents.map(d => [d.numero, formatDate(d.date_document), d.fournisseur_nom||'-', formatCurrency(d.montant_ht), d.statut]);
      }
      break;
    }
    case 'mouvements': {
      title = 'Mouvements stock';
      const data = await apiFetch('/stock/mouvements');
      if (data?.mouvements) {
        headers = ['Article', 'Type', 'Qté', 'Avant', 'Après', 'Date', 'Utilisateur'];
        rows = data.mouvements.map(m => [m.reference||'-', m.type_mouvement, formatNumber(m.quantite), formatNumber(m.stock_avant), formatNumber(m.stock_apres), formatDate(m.created_at), m.utilisateur_nom||'-']);
      }
      break;
    }
    case 'balance-clients': {
      title = 'Balance clients';
      const data = await apiFetch('/paiements/situation');
      if (data) {
        headers = ['Client', 'Code', 'Type', 'Solde', 'Plafond'];
        rows = data.map(c => [c.raison_sociale, c.code_client, c.type_client, formatCurrency(c.solde_actuel), formatCurrency(c.plafond_credit)]);
      }
      break;
    }
    case 'moteurs': {
      title = 'État parc moteurs';
      const data = await apiFetch('/moteurs');
      if (data) {
        headers = ['Réf.', 'Désignation', 'Stock', 'Pièces total', 'Disponibles', 'État'];
        rows = data.map(m => [m.reference, m.designation, formatNumber(m.stock_actuel), m.total_composants||0, m.composants_disponibles||0, m.etat||'non_defini']);
      }
      break;
    }
  }

  if (!rows.length) { showToast('Aucune donnée pour ce rapport', 'warning'); return; }

  // Generate HTML report for printing
  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><meta charset="utf-8"><title>${title}</title>
    <style>
      body{font-family:'Satoshi',Arial,sans-serif;padding:20px;font-size:12px}
      h1{color:#1e293b;font-size:18px;border-bottom:2px solid #2563eb;padding-bottom:8px}
      table{width:100%;border-collapse:collapse;margin-top:10px}
      th{background:#2563eb;color:#fff;padding:8px;text-align:left;font-size:11px}
      td{padding:6px 8px;border-bottom:1px solid #e5e7eb}
      tr:hover{background:#f5f6fa}
      .total{font-weight:bold;background:#fef3c7}
      .footer{margin-top:30px;font-size:10px;color:#9ca3af;text-align:center}
      @media print{body{padding:0}}
    </style></head><body>
    <h1>${title}</h1>
    <p style="color:#6b7280">Généré le ${new Date().toLocaleString('fr-FR')}</p>
    <table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <div class="footer">Accessoires Tensift — ERP Automotive</div>
    <script>window.print()<\/script>
    </body></html>
  `);
  win.document.close();
}

// ==================== PARAMETRES ====================
function renderParametres(page) {
  page.innerHTML = html`
    <div class="page-title">Paramètres</div>
    <div class="tabs">
      <button class="tab active" onclick="switchParamTab(this,'societe')">🏢 Société</button>
      <button class="tab" onclick="switchParamTab(this,'configuration')">⚙️ Configuration</button>
      <button class="tab" onclick="switchParamTab(this,'utilisateurs')">👥 Utilisateurs</button>
      <button class="tab" onclick="switchParamTab(this,'sauvegarde')">💾 Sauvegarde</button>
    </div>
    <div id="paramContent"></div>
  `;
  switchParamTab(document.querySelector('.tab'), 'societe');
  window.switchParamTab = switchParamTab;
}

function switchParamTab(el, tab) {
  $$('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const container = $('#paramContent');

  switch (tab) {
    case 'societe':
      apiFetch('/parametres').then(p => {
        const logoUrl = p.societe_logo || '';
        container.innerHTML = html`
          <div class="card">
            <div class="card-header"><h3>Informations société</h3><button class="btn btn-primary btn-sm" onclick="saveSociete()">💾 Enregistrer</button></div>
            <form id="societeForm">
              <div class="form-row"><div class="form-group"><label>Nom société</label><input name="societe_nom" class="form-control" value="${p.societe_nom||'Accessoires Tensift'}"></div>
              <div class="form-group"><label>Slogan</label><input name="societe_slogan" class="form-control" value="${p.societe_slogan||''}"></div></div>
              <div class="form-row"><div class="form-group"><label>ICE</label><input name="societe_ice" class="form-control" value="${p.societe_ice||''}"></div>
              <div class="form-group"><label>IF</label><input name="societe_if" class="form-control" value="${p.societe_if||''}"></div></div>
              <div class="form-row"><div class="form-group"><label>RC</label><input name="societe_rc" class="form-control" value="${p.societe_rc||''}"></div>
              <div class="form-group"><label>CNSS</label><input name="societe_cnss" class="form-control" value="${p.societe_cnss||''}"></div></div>
              <div class="form-row"><div class="form-group"><label>Patente</label><input name="societe_patente" class="form-control" value="${p.societe_patente||''}"></div>
              <div class="form-group"><label>Téléphone</label><input name="societe_telephone" class="form-control" value="${p.societe_telephone||''}"></div></div>
              <div class="form-row"><div class="form-group"><label>Email</label><input name="societe_email" type="email" class="form-control" value="${p.societe_email||''}"></div>
              <div class="form-group"><label>Ville</label><input name="societe_ville" class="form-control" value="${p.societe_ville||''}"></div></div>
              <div class="form-group"><label>Adresse</label><input name="societe_adresse" class="form-control" value="${p.societe_adresse||''}"></div>
              <div class="form-row"><div class="form-group"><label>Banque</label><input name="societe_banque" class="form-control" value="${p.societe_banque||''}"></div>
              <div class="form-group"><label>RIB</label><input name="societe_rib" class="form-control" value="${p.societe_rib||''}"></div></div>
              <div class="form-group" style="border:1px solid var(--border);border-radius:var(--radius);padding:1rem;margin-bottom:0.85rem">
                <label style="font-weight:600;margin-bottom:0.5rem;display:block">Logo société</label>
                <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
                  <div id="logoPreview" style="border:1px dashed var(--border);border-radius:var(--radius);padding:0.5rem;min-width:120px;text-align:center;background:var(--bg)">
                    ${logoUrl ? `<img src="${logoUrl}" style="max-width:180px;max-height:120px;object-fit:contain" id="logoImg">` : '<span style="color:var(--text-light);font-size:0.8rem">Aucun logo</span>'}
                  </div>
                  <div style="display:flex;flex-direction:column;gap:0.5rem">
                    <input type="file" id="logoFileInput" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" class="form-control" style="padding:0.3rem">
                    <div style="display:flex;gap:0.3rem">
                      <button type="button" class="btn btn-sm btn-primary" onclick="uploadLogo()" id="uploadLogoBtn" disabled>📤 Upload</button>
                      ${logoUrl ? `<button type="button" class="btn btn-sm btn-danger" onclick="deleteLogo()">🗑 Supprimer</button>` : ''}
                    </div>
                  </div>
                </div>
                <div class="form-row" style="margin-top:0.5rem">
                  <div class="form-group"><label>Largeur (px)</label><input name="societe_logo_width" type="number" class="form-control" value="${p.societe_logo_width||'180'}" min="50" max="600"></div>
                  <div class="form-group"><label>Hauteur (px)</label><input name="societe_logo_height" type="number" class="form-control" value="${p.societe_logo_height||'0'}" min="0" max="400" placeholder="0=auto"></div>
                  <div class="form-group"><label>Position</label><select name="societe_logo_position" class="form-select"><option value="gauche" ${p.societe_logo_position==='gauche'?'selected':''}>Gauche</option><option value="centre" ${p.societe_logo_position==='centre'?'selected':''}>Centre</option><option value="droite" ${p.societe_logo_position==='droite'?'selected':''}>Droite</option></select></div>
                </div>
              </div>
              <div class="form-group"><label>Mentions légales pied de page</label><textarea name="societe_mentions" class="form-textarea">${p.societe_mentions||''}</textarea></div>
            </form>
          </div>
        `;
        // Enable upload button when file selected
        const fileInput = document.getElementById('logoFileInput');
        if (fileInput) fileInput.onchange = () => document.getElementById('uploadLogoBtn').disabled = !fileInput.files.length;
      });
      break;
    case 'configuration':
      apiFetch('/parametres').then(p => {
        container.innerHTML = html`
          <div class="card">
            <div class="card-header"><h3>Configuration</h3><button class="btn btn-primary btn-sm" onclick="saveConfiguration()">💾 Enregistrer</button></div>
            <form id="configForm">
              <div class="form-row"><div class="form-group"><label>Couleur charte</label><input name="couleur_charte" type="color" class="form-control" value="${p.couleur_charte||'#1a3a5c'}" style="height:40px;padding:2px"></div>
              <div class="form-group"><label>Thème</label><select name="theme" class="form-select" onchange="applyTheme(this.value)">
                <option value="classique" ${(!p.theme||p.theme==='classique')?'selected':''}>🔵 Classique (bleu/orange)</option>
                <option value="sombre" ${p.theme==='sombre'?'selected':''}>🌙 Sombre</option>
                <option value="vert" ${p.theme==='vert'?'selected':''}>🌿 Émeraude (vert)</option>
                <option value="rouge" ${p.theme==='rouge'?'selected':''}>🔴 Rouge</option>
                <option value="violet" ${p.theme==='violet'?'selected':''}>💜 Violet</option>
                <option value="ocean" ${p.theme==='ocean'?'selected':''}>🌊 Océan (bleu turquoise)</option>
              </select></div></div>
              <div class="form-row"><div class="form-group"><label>Devise</label><select name="devise" class="form-select"><option value="MAD" ${p.devise==='MAD'?'selected':''}>MAD</option><option value="EUR" ${p.devise==='EUR'?'selected':''}>EUR</option><option value="USD" ${p.devise==='USD'?'selected':''}>USD</option></select></div></div>
              <div class="form-row"><div class="form-group"><label>Validité devis (jours)</label><input name="delai_validite_devis" type="number" class="form-control" value="${p.delai_validite_devis||'30'}"></div>
              <div class="form-group"><label>Marge minimale (%)</label><input name="marge_minimale" type="number" class="form-control" value="${p.marge_minimale||'15'}"></div></div>
              <div class="form-row"><div class="form-group"><label>Seuil alerte stock</label><input name="seuil_alerte_stock" type="number" class="form-control" value="${p.seuil_alerte_stock||'10'}"></div>
              <div class="form-group"><label>Délai relance 1 (j)</label><input name="delai_relance_1" type="number" class="form-control" value="${p.delai_relance_1||'30'}"></div></div>
              <div class="form-row"><div class="form-group"><label>Délai relance 2 (j)</label><input name="delai_relance_2" type="number" class="form-control" value="${p.delai_relance_2||'60'}"></div>
              <div class="form-group"><label>Délai contentieux (j)</label><input name="delai_contentieux" type="number" class="form-control" value="${p.delai_contentieux||'90'}"></div></div>
              <div class="form-group"><label>Modèle d'impression</label><select name="modele_impression" class="form-select">
                <option value="classique" ${p.modele_impression==='classique'?'selected':''}>🏛 Classique (bleu)</option>
                <option value="moderne" ${p.modele_impression==='moderne'?'selected':''}>🎨 Moderne (orange)</option>
                <option value="minimaliste" ${p.modele_impression==='minimaliste'?'selected':''}>📄 Minimaliste</option>
                <option value="professionnel" ${p.modele_impression==='professionnel'?'selected':''}>💼 Professionnel</option>
              </select></div>
            </form>
          </div>
        `;
      });
      break;
    case 'utilisateurs':
      apiFetch('/parametres/utilisateurs').then(users => {
        container.innerHTML = html`
          <div class="card">
            <div class="card-header"><h3>Gestion des utilisateurs</h3><button class="btn btn-primary btn-sm" onclick="showUserForm()">+ Ajouter</button></div>
            <table><thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Téléphone</th><th>Actif</th><th>Actions</th></tr></thead>
            <tbody>${users?.length ? users.map(u => html`<tr><td>${u.nom}</td><td>${u.email}</td><td><span class="badge badge-neutral">${u.role}</span></td><td>${u.telephone||'-'}</td><td><span class="status-dot ${u.actif?'green':'red'}"></span></td><td class="table-actions"><button class="btn btn-sm btn-secondary" onclick="editUser(${u.id})">✏️</button></td></tr>`).join('') : '<tr><td colspan="6">Aucun utilisateur</td></tr>'}</tbody></table>
          </div>
        `;
      });
      break;
    case 'sauvegarde':
      container.innerHTML = html`
        <div class="grid grid-3">
          <div class="card" style="cursor:pointer;text-align:center;padding:2rem" onclick="backupDB()">
            <div style="font-size:2.5rem">💾</div>
            <h3 style="margin-top:0.5rem">Sauvegarder BDD</h3>
            <p style="color:var(--text-secondary);font-size:0.8rem">Export du fichier .db</p>
          </div>
          <div class="card" style="cursor:pointer;text-align:center;padding:2rem" onclick="restoreDB()">
            <div style="font-size:2.5rem">📂</div>
            <h3 style="margin-top:0.5rem">Restaurer BDD</h3>
            <p style="color:var(--text-secondary);font-size:0.8rem">Depuis un fichier .db</p>
          </div>
          <div class="card" style="cursor:pointer;text-align:center;padding:2rem" onclick="exportZip()">
            <div style="font-size:2.5rem">🗜️</div>
            <h3 style="margin-top:0.5rem">Export complet ZIP</h3>
            <p style="color:var(--text-secondary);font-size:0.8rem">BDD + images + config</p>
          </div>
        </div>
      `;
      break;
  }
}

async function saveSociete() {
  const form = $('#societeForm');
  const data = Object.fromEntries(new FormData(form));
  // Exclude file input from form data
  delete data.logoFileInput;
  try {
    await apiFetch('/parametres', { method: 'PUT', body: JSON.stringify(data) });
    showToast('Informations enregistrées', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

async function uploadLogo() {
  const fileInput = $('#logoFileInput');
  if (!fileInput?.files?.length) { showToast('Sélectionnez un fichier', 'error'); return; }
  const file = fileInput.files[0];
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) { showToast('Fichier trop volumineux (max 5 Mo)', 'error'); return; }
  const validTypes = ['image/png','image/jpeg','image/gif','image/webp','image/svg+xml'];
  if (!validTypes.includes(file.type)) { showToast('Format non supporté', 'error'); return; }

  const btn = $('#uploadLogoBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Upload...';
  try {
    const formData = new FormData();
    formData.append('logo', file);
    const res = await fetch(`${API}/parametres/logo`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    const data = await res.json();
    showToast('Logo uploadé', 'success');
    // Update preview
    const preview = $('#logoPreview');
    preview.innerHTML = `<img src="${data.url}" style="max-width:180px;max-height:120px;object-fit:contain" id="logoImg">`;
    // Save base64 to params
    await apiFetch('/parametres', { method: 'PUT', body: JSON.stringify({ societe_logo: data.url }) });
    // Add delete button if missing
    const delBtn = preview.parentElement.querySelector('.btn-danger');
    if (!delBtn) {
      const btns = preview.nextElementSibling.querySelector('div');
      if (btns) btns.insertAdjacentHTML('beforeend', '<button type="button" class="btn btn-sm btn-danger" onclick="deleteLogo()">🗑 Supprimer</button>');
    }
  } catch (e) { showToast(e.message || 'Erreur upload', 'error'); }
  finally { btn.disabled = false; btn.textContent = '📤 Upload'; fileInput.value = ''; }
}

async function deleteLogo() {
  if (!confirm('Supprimer le logo ?')) return;
  try {
    await apiFetch('/parametres/logo', { method: 'DELETE' });
    await apiFetch('/parametres', { method: 'PUT', body: JSON.stringify({ societe_logo: '' }) });
    $('#logoPreview').innerHTML = '<span style="color:var(--text-light);font-size:0.8rem">Aucun logo</span>';
    // Remove delete button
    const delBtn = document.querySelector('.btn-danger[onclick*="deleteLogo"]');
    if (delBtn) delBtn.remove();
    showToast('Logo supprimé', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

async function saveConfiguration() {
  const form = $('#configForm');
  const data = Object.fromEntries(new FormData(form));
  try {
    await apiFetch('/parametres', { method: 'PUT', body: JSON.stringify(data) });
    showToast('Configuration enregistrée', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

function showUserForm(id) {
  openModal(id ? 'Modifier utilisateur' : 'Nouvel utilisateur', html`
    <form id="userForm" onsubmit="saveUser(event, ${id||''})">
      ${!id ? html`
        <div class="form-row"><div class="form-group"><label>Nom *</label><input name="nom" class="form-control" required></div>
        <div class="form-group"><label>Email *</label><input name="email" type="email" class="form-control" required></div></div>
        <div class="form-group"><label>Mot de passe *</label><input name="mot_de_passe" type="password" class="form-control" required></div>
      ` : ''}
      <div class="form-row"><div class="form-group"><label>Rôle</label><select name="role" class="form-select"><option value="Administrateur">Administrateur</option><option value="Commercial">Commercial</option><option value="Magasinier">Magasinier</option><option value="Comptable">Comptable</option></select></div>
      <div class="form-group"><label>Téléphone</label><input name="telephone" class="form-control"></div></div>
    </form>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="document.getElementById('userForm').requestSubmit()">${id ? 'Modifier' : 'Créer'}</button>`);
}

async function saveUser(e, id) {
  e.preventDefault();
  const form = $('#userForm');
  const data = Object.fromEntries(new FormData(form));
  try {
    if (id) {
      await apiFetch(`/parametres/utilisateurs/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      await apiFetch('/parametres/utilisateurs', { method: 'POST', body: JSON.stringify(data) });
    }
    showToast(id ? 'Utilisateur modifié' : 'Utilisateur créé', 'success');
    closeModal();
    switchParamTab(document.querySelector('.tab'), 'utilisateurs');
  } catch (e) { showToast(e.message, 'error'); }
}

function editUser(id) { showUserForm(id); }

async function backupDB() {
  try {
    const data = await apiFetch('/parametres/sauvegarder', { method: 'POST' });
    showToast(`Sauvegarde créée: ${data.nom}`, 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

function restoreDB() {
  openModal('Restaurer BDD', html`
    <div class="form-group"><label>Sélectionnez le fichier .db</label><input type="file" id="restoreFile" accept=".db" class="form-control"></div>
    <p style="color:var(--danger);font-size:0.85rem">⚠️ Cette action remplacera toutes les données actuelles.</p>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Annuler</button><button class="btn btn-danger" onclick="confirmRestore()">Restaurer</button>`);
}

async function confirmRestore() {
  const file = $('#restoreFile').files[0];
  if (!file) { showToast('Sélectionnez un fichier', 'error'); return; }
  try {
    const formData = new FormData();
    formData.append('fichier', file);
    await fetch(`${API}/parametres/restaurer`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
    showToast('Base restaurée, veuillez recharger', 'success');
    closeModal();
  } catch { showToast('Erreur restauration', 'error'); }
}

function exportZip() {
  window.open(`${API}/parametres/export-zip?token=${token}`, '_blank');
}

// ==================== AUDIT ====================
function renderAudit(page) {
  page.innerHTML = html`
    <div class="page-title">Journal d'Audit</div>
    <div class="card">
      <div class="table-container"><table>
        <thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Entité</th><th>Détails</th></tr></thead>
        <tbody id="auditTableBody"></tbody>
      </table></div>
    </div>
  `;
  loadAudit();
}

async function loadAudit() {
  const tbody = $('#auditTableBody');
  if (!tbody) return;
  try {
    const data = await apiFetch('/audit?limit=100');
    tbody.innerHTML = data?.audits?.length ? data.audits.map(a => html`<tr>
      <td>${formatDate(a.created_at)}</td>
      <td>${a.utilisateur_nom || '-'}</td>
      <td><span class="badge badge-neutral">${a.action}</span></td>
      <td>${a.entite} #${a.entite_id||''}</td>
      <td style="font-size:0.8rem;color:var(--text-secondary)">${a.details || '-'}</td>
    </tr>`).join('') : '<tr><td colspan="5"><div class="empty-state"><p>Aucune entrée d\'audit</p></div></td></tr>';
  } catch { tbody.innerHTML = '<tr><td colspan="5">Erreur</td></tr>'; }
}

// ==================== SEARCH ====================
let searchTimeout;

$('#globalSearch')?.addEventListener('input', function() {
  clearTimeout(searchTimeout);
  const q = this.value.trim();
  if (q.length < 2) { $('#searchResults')?.classList.add('hidden'); return; }
  searchTimeout = setTimeout(async () => {
    try {
      const isSituation = currentRoute === 'situation';
      const fetches = isSituation
        ? [Promise.resolve(null), apiFetch(`/clients?limit=10&search=${encodeURIComponent(q)}`)]
        : [
            apiFetch(`/articles?limit=5&search=${encodeURIComponent(q)}`),
            apiFetch(`/clients?limit=5&search=${encodeURIComponent(q)}`)
          ];
      const [articles, clients] = await Promise.all(fetches);
      const results = $('#searchResults');
      let htmlContent = '';
      if (articles?.articles?.length) {
        articles.articles.forEach(a => {
          const cls = a.stock_actuel <= 0 ? 'danger' : a.stock_actuel <= a.stock_min ? 'warn' : 'ok';
          htmlContent += `<div class="sr-item" onclick="navigate('articles')"><span class="sr-ref">${a.reference}</span><span class="sr-name">${a.designation}</span><span class="sr-stock ${cls}">${formatNumber(a.stock_actuel)}</span></div>`;
        });
      }
      if (clients?.clients?.length) {
        clients.clients.forEach(c => {
          if (isSituation) {
            htmlContent += `<div class="sr-item" onclick="$('#searchResults')?.classList.add('hidden');$('#globalSearch').value='';showClientSituation(${c.id})"><span>👤</span><span class="sr-name">${c.raison_sociale}</span><span class="sr-ref">${c.code_client}</span></div>`;
          } else {
            htmlContent += `<div class="sr-item" onclick="navigate('situation');setTimeout(()=>showClientSituation(${c.id}),300)"><span>👤</span><span class="sr-name">${c.raison_sociale}</span><span class="sr-ref">${c.code_client}</span></div>`;
          }
        });
      }
      if (!htmlContent) htmlContent = '<div class="sr-item" style="color:var(--text-light)">Aucun résultat</div>';
      results.innerHTML = htmlContent;
      results.classList.remove('hidden');
    } catch {}
  }, 300);
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-box')) $('#searchResults')?.classList.add('hidden');
});

// ==================== THEME PICKER ====================
const themeIcons = { classique: '☀️', sombre: '🌙', vert: '🌿', rouge: '🔴', violet: '💜', ocean: '🌊' };

window.applyTheme = function(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  $('#themeToggle').textContent = themeIcons[theme] || '☀️';
  $$('.theme-option').forEach(o => o.classList.toggle('active', o.dataset.theme === theme));
  $('#themeDropdown')?.classList.remove('open');
  if (token) { apiFetch('/parametres', { method: 'PUT', body: JSON.stringify({ theme }) }).catch(() => {}); }
};

$('#themeToggle')?.addEventListener('click', (e) => {
  e.stopPropagation();
  $('#themeDropdown')?.classList.toggle('open');
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.theme-picker')) $('#themeDropdown')?.classList.remove('open');
});

// ==================== NOTIFICATIONS ====================
$('#notifBtn')?.addEventListener('click', () => {
  $('#notifDropdown').classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.notif-btn') && !e.target.closest('.notif-dropdown')) {
    $('#notifDropdown')?.classList.add('hidden');
  }
});

async function loadNotifications() {
  try {
    const articles = await apiFetch('/articles?limit=1');
  } catch {}
}

// ==================== GLOBAL FUNCTION REGISTRATION ====================
// Ensure ALL functions used in onclick attributes are on window
;[
  'navigate','closeModal','openModal','showToast','formatDate','formatCurrency',
  'showArticleForm','editArticle','deleteArticle','loadArticles','showArticleDetail','exportArticlesCSV','importArticlesCSV','processImportCSV','saveArticle',
  'showMoteurForm','showMoteurDetail','desassemblerMoteur','confirmDesassembler','reconstruireMoteur','loadMoteurs',
  'showClientForm','editClient','showClientDetail','showClientSituation','loadClients','saveClient',
  'showPaiementForm','loadSituation','exportSoldes','savePaiement',
  'showFournisseurForm','editFournisseur','showFournisseurDetail','loadFournisseurs','saveFournisseur',
  'showDocumentForm','editDocument','printDocument','changeDocStatut','supprimerDocument','loadDocuments','saveDocument',
  'saveEditDocument','addEditDocLigne','removeEditLigne','recalcEditDoc','searchEditArticle','selectEditArticle',
  'addDocLigne','removeLigne','searchDocArticle','selectDocArticle','scanDocBarcode',
  'scanBarcode','generateLabel','previewLabel','printBulkLabels','transfertDocument',
  'generateReport','exportZip','saveSociete','saveConfiguration','saveUser','editUser','showUserForm','switchParamTab','backupDB','restoreDB','confirmRestore','uploadLogo','deleteLogo',
  'renderArticles','renderDashboard','renderMoteurs','renderClients','renderSituation','renderFournisseurs','renderBarcodes','renderRapports','renderParametres','renderAudit','renderPage','renderBreadcrumb',
  'login','logout','checkAuth','apiFetch','html',
  'quickSale'
].forEach(name => {
  if (typeof window[name] === 'undefined' && typeof eval(name) !== 'undefined') {
    try { window[name] = eval(name); } catch(e) {}
  }
});

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', async () => {
  // Sidebar toggle
  $('#sidebarToggle')?.addEventListener('click', () => {
    $('#sidebar').classList.toggle('collapsed');
  });

  // Hash change routing (MUST be before any early return)
  window.addEventListener('hashchange', () => {
    navigate(window.location.hash);
  });
  // Login form
  $('#loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#loginForm button[type="submit"]');
    const email = $('#email').value;
    const password = $('#password').value;
    btn.disabled = true;
    btn.querySelector('.btn-text').classList.add('hidden');
    btn.querySelector('.btn-loader').classList.remove('hidden');
    $('#loginError').classList.add('hidden');

    try {
      const data = await login(email, password);
      token = data.token;
      currentUser = data.user;
      localStorage.setItem('token', token);
      $('#login').classList.add('hidden');
      $('#mainLayout').classList.remove('hidden');
      $('#themeToggle').textContent = themeIcons[data.user.theme] || '☀️';
      $$('.theme-option').forEach(o => o.classList.toggle('active', o.dataset.theme === data.user.theme));
      navigate('#dashboard');
      showToast('Connecté en tant que ' + currentUser.nom, 'success');
    } catch (e) {
      $('#loginError').textContent = e.message;
      $('#loginError').classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.querySelector('.btn-text').classList.remove('hidden');
      btn.querySelector('.btn-loader').classList.add('hidden');
    }
  });

  // Logout
  $('#logoutBtn')?.addEventListener('click', logout);

  // Check for existing token
  if (token) {
    const valid = await checkAuth();
    if (valid) {
      $('#splash').style.animation = 'none';
      $('#splash').classList.add('hidden');
      $('#login').classList.add('hidden');
      $('#mainLayout').classList.remove('hidden');
      $('#themeToggle').textContent = themeIcons[currentUser?.theme] || '☀️';
      $$('.theme-option').forEach(o => o.classList.toggle('active', o.dataset.theme === currentUser?.theme));
      navigate(window.location.hash || '#dashboard');
      return;
    }
  }

  // Initial check
  if (!token) {
    setTimeout(() => {
      $('#splash').classList.add('hidden');
      $('#login').classList.remove('hidden');
    }, 2000);
  }
});
