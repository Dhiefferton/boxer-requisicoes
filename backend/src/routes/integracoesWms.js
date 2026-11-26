// ============================================================
// routes/integracoesWms.js — chamadas do Boxer WMS (escrita), por chave de API
// A chave (bx_...) precisa ter a tela "lojinha" liberada (Admin > Chaves de API).
// ============================================================
import { Router } from 'express';
import { autenticarChave } from '../controllers/apiPublicaController.js';
import { separacaoConcluidaWms } from '../controllers/lojinhaController.js';

const router = Router();
router.use(autenticarChave);
router.post('/separacao', (req, res, next) => {
  if (!Array.isArray(req.chaveApi?.telas) || !req.chaveApi.telas.includes('lojinha')) {
    return res.status(403).json({ erro: 'Esta chave não tem a tela "lojinha".' });
  }
  return separacaoConcluidaWms(req, res, next);
});
export default router;
