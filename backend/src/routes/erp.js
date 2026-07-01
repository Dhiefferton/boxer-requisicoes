import express from 'express';
import { statusSyncErp, forcerSync } from '../jobs/syncErpEstoque.js';

const router = express.Router();

router.get('/status', (req, res) => {
  res.json(statusSyncErp());
});

router.post('/sync', async (req, res) => {
  try {
    const resultado = await forcerSync(req.app.locals.db);
    res.json({ sucesso: true, resultado });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

export default router;
