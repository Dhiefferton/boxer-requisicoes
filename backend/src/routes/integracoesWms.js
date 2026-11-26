// ============================================================
// routes/integracoesWms.js — chamadas do Boxer WMS (escrita), por chave de API
// A chave (bx_...) precisa ter a tela "lojinha" liberada (Admin > Chaves de API).
// ============================================================
import { Router } from 'express';
import { autenticarChave } from '../controllers/apiPublicaController.js';
import { separacaoConcluidaWms } from '../controllers/lojinhaController.js';
import { fotoCatalogo } from '../controllers/recebimentoImportacaoController.js';

const router = Router();
router.use(autenticarChave);
router.post('/separacao', (req, res, next) => {
  if (!Array.isArray(req.chaveApi?.telas) || !req.chaveApi.telas.includes('lojinha')) {
    return res.status(403).json({ erro: 'Esta chave não tem a tela "lojinha".' });
  }
  return separacaoConcluidaWms(req, res, next);
});

// GET /api/integracoes/wms/catalogo/:sku/foto?tam=mini (leitura) - foto do catálogo
// (catalogo_fotos / PDM), usada na Conferência do Almoxarifado do WMS. Mesma foto
// da tela Recebimento/Importação. Chave com a tela "estoque" ou "lojinha".
router.get('/catalogo/:sku/foto', (req, res, next) => {
  const telas = Array.isArray(req.chaveApi?.telas) ? req.chaveApi.telas : [];
  if (!telas.includes('estoque') && !telas.includes('lojinha')) {
    return res.status(403).json({ erro: 'Esta chave não tem a tela "estoque".' });
  }
  return fotoCatalogo(req, res, next);
});
export default router;
