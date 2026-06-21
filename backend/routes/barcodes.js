const express = require('express');
const router = express.Router();
let JsBarcode, createCanvas;
try {
  JsBarcode = require('jsbarcode');
  createCanvas = require('canvas').createCanvas;
} catch (e) {
  // canvas module optionnel - la génération côté client est utilisée par défaut
}

module.exports = function(db) {
  // GET /api/barcodes/generate/:articleId
  router.get('/generate/:articleId', async (req, res) => {
    try {
      const article = await db.prepare(`SELECT * FROM articles WHERE id = ?`).get(req.params.articleId);
      if (!article) return res.status(404).json({ error: 'Article introuvable' });

      let code = article.code_barre;
      if (!code) {
        code = `TA${String(article.id).padStart(8, '0')}`;
        await db.prepare(`UPDATE articles SET code_barre = ? WHERE id = ?`).run(code, article.id);
      }

      const existing = await db.prepare(`SELECT * FROM codes_barres WHERE article_id = ?`).get(article.id);
      if (!existing) {
        await db.prepare(`INSERT INTO codes_barres (article_id, code, format) VALUES (?,?,?)`).run(article.id, code, 'Code128');
      }

      if (!JsBarcode || !createCanvas) {
        return res.json({ code, reference: article.reference, message: 'Génération côté client (JSBarcode CDN)' });
      }

      const format = req.query.format || 'Code128';
      const width = parseInt(req.query.width) || 200;
      const height = parseInt(req.query.height) || 80;

      try {
        const canvas = createCanvas(width, height);
        JsBarcode(canvas, code, {
          format: format === 'EAN13' ? 'EAN13' : 'CODE128',
          width: 2,
          height: 60,
          displayValue: true,
          font: 'monospace',
          fontSize: 16,
          margin: 10
        });
        res.setHeader('Content-Type', 'image/png');
        canvas.createPNGStream().pipe(res);
      } catch (e) {
        res.json({ code, reference: article.reference });
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/barcodes/scan
  router.post('/scan', async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) return res.status(400).json({ error: 'Code-barres requis' });

      const article = await db.prepare(`SELECT a.*, c.nom as categorie_nom, t.taux as taux_tva_value FROM articles a LEFT JOIN categories c ON a.categorie_id = c.id LEFT JOIN taux_tva t ON a.tva_id = t.id WHERE a.code_barre = ? OR a.reference = ?`).get(code, code);
      if (!article) return res.status(404).json({ error: 'Article introuvable pour ce code-barres' });

      res.json(article);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/barcodes/print-labels
  router.post('/print-labels', async (req, res) => {
    try {
      const { article_ids, format, dimensions } = req.body;
      if (!article_ids || !Array.isArray(article_ids)) return res.status(400).json({ error: 'Liste articles requise' });

      const articles = [];
      for (const id of article_ids) {
        const a = await db.prepare(`SELECT * FROM articles WHERE id = ?`).get(id);
        if (a) {
          if (!a.code_barre) {
            a.code_barre = `TA${String(a.id).padStart(8, '0')}`;
            await db.prepare(`UPDATE articles SET code_barre = ? WHERE id = ?`).run(a.code_barre, a.id);
          }
          articles.push(a);
        }
      }

      const labels = articles.map(a => ({
        reference: a.reference,
        designation: a.designation,
        code_barre: a.code_barre,
        prix: a.prix_vente_ht,
        format: format || 'individuelle'
      }));

      res.json({ labels, total: labels.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/barcodes/history
  router.get('/history', async (req, res) => {
    try {
      const codes = await db.prepare(`SELECT cb.*, a.reference, a.designation FROM codes_barres cb JOIN articles a ON cb.article_id = a.id ORDER BY cb.date_generation DESC LIMIT 50`).all();
      res.json(codes);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
