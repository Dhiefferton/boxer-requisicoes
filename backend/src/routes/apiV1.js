// ============================================================
// routes/apiV1.js — API pública somente leitura (/api/v1), por chave de API
// ============================================================
import { Router } from 'express';
import {
  autenticarChave, minhasTelas, recursosDaTela, listarRecurso, umRegistro,
} from '../controllers/apiPublicaController.js';
import { rodarRelatorioSalvo } from '../controllers/relatoriosController.js';

const router = Router();

router.use((req, res, next) => {
  if (req.method !== 'GET') return res.status(405).json({ erro: 'Esta API é somente leitura (GET).' });
  next();
});
router.use(autenticarChave);

router.get('/', minhasTelas);

// Relatório salvo (tela Relatórios): /api/v1/relatorios/executar/12?pagina=1&todos=1
router.get('/relatorios/executar/:id', async (req, res, next) => {
  try {
    if (!req.chaveApi.telas.includes('relatorios')) return res.status(403).json({ erro: 'Esta chave não pode ver "relatorios".' });
    const out = await rodarRelatorioSalvo(req.params.id, { pagina: req.query.pagina, todos: req.query.todos === '1' });
    if (!out) return res.status(404).json({ erro: 'Relatório não encontrado.' });
    res.json(out);
  } catch (err) { next(err); }
});

router.get('/:tela', recursosDaTela);
router.get('/:tela/:recurso', listarRecurso);
router.get('/:tela/:recurso/:id', umRegistro);

export default router;
