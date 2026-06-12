const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initializeDatabase, getDatabase, DB_PATH, saveDatabase } = require('./database/init');
const { authenticateToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

function startServer() {
  const db = getDatabase();

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

  // Static frontend files
  app.use(express.static(path.join(__dirname, '..', 'frontend')));

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString(), db: fs.existsSync(DB_PATH) });
  });

  // Save DB on each request for persistence (must be BEFORE routes to intercept res.json)
  app.use((req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = function(body) {
      try { saveDatabase(); } catch(e) {}
      return originalJson(body);
    };
    next();
  });

  // Routes
  app.use('/api/auth', require('./routes/auth')(db));
  app.use('/api/articles', authenticateToken, require('./routes/articles')(db));
  app.use('/api/clients', authenticateToken, require('./routes/clients')(db));
  app.use('/api/fournisseurs', authenticateToken, require('./routes/fournisseurs')(db));
  app.use('/api/documents', authenticateToken, require('./routes/documents')(db));
  app.use('/api/paiements', authenticateToken, require('./routes/paiements')(db));
  app.use('/api/stock', authenticateToken, require('./routes/stock')(db));
  app.use('/api/moteurs', authenticateToken, require('./routes/moteurs')(db));
  app.use('/api/barcodes', authenticateToken, require('./routes/barcodes')(db));
  app.use('/api/categories', authenticateToken, require('./routes/categories')(db));
  app.use('/api/dashboard', authenticateToken, require('./routes/dashboard')(db));
  app.use('/api/parametres', authenticateToken, require('./routes/parametres')(db));
  app.use('/api/audit', authenticateToken, require('./routes/audit')(db));
  app.use('/api/tva', require('./routes/tva')(db));

  // Serve index.html for SPA
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✓ Serveur Accessoires Tensift démarré sur http://0.0.0.0:${PORT}`);
  });
}

// Initialize database
initializeDatabase().then(() => {
  console.log('✓ Base de données initialisée');
  startServer();
}).catch(e => {
  console.error('Erreur initialisation BDD:', e);
  process.exit(1);
});
