import express from 'express';
import { statusSyncErp, forcerSync, debugEstoquePorCodigo } from '../jobs/syncErpEstoque.js';
import { getToken } from '../integrations/erpZen.js';
import { pipefyQuery } from '../integrations/pipefyService.js';
import { pedidoLIBruto, buscarPedidoLI, tentativasLI, getLIBruto } from '../integrations/lojaIntegrada.js';
import { pagamentosDaPreferencia, getMPBruto, mercadoPagoConfigurado } from '../integrations/mercadoPago.js';
import { fasesDosCards } from '../integrations/pipefyLojinha.js';
import { query } from '../config/db.js';
import { voltarParaSeparacao } from '../controllers/pedidosOrcamentoController.js';
import { sincronizarSaidas, garantirRelatorioSemanal, compararPlanilhaZen } from '../integrations/marketplaceSaidas.js';

const router = express.Router();

router.get('/status', async (req, res, next) => {
  try {
    res.json(await statusSyncErp(req.app.locals.db));
  } catch (err) { next(err); }
});

// DIAGNÓSTICO — mostra os itens crus do ERP para um código, sem
// filtro. Ex: GET /api/erp/debug/701879?secret=SEU_CRON_SECRET
// Usa o mesmo CRON_SECRET (query string, pra testar direto no navegador)
router.get('/debug/:codigo', async (req, res, next) => {
  try {
    if (req.query.secret !== process.env.CRON_SECRET) {
      return res.status(401).json({ erro: 'Acesso negado' });
    }
    const itens = await debugEstoquePorCodigo(req.params.codigo);
    res.json({ codigo: req.params.codigo, total_linhas: itens.length, itens });
  } catch (err) { next(err); }
});

// DIAGNÓSTICO — leitura (GET) crua da API do Zen, só com o secret.
// Ex: GET /api/erp/debug-zen?secret=...&path=/sale/sale/123
router.get('/debug-zen', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  const caminho = String(req.query.path || '');
  if (!caminho.startsWith('/')) return res.status(400).json({ erro: 'path inválido' });
  try {
    const token = await getToken();
    const r = await fetch(`https://api.zenerp.app.br${caminho}`, { headers: { Authorization: `Bearer ${token}`, tenant: 'boxer' } });
    const texto = await r.text();
    let dados; try { dados = JSON.parse(texto); } catch { dados = texto.slice(0, 2000); }
    res.status(r.ok ? 200 : 502).json({ status: r.status, dados });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// DIAGNÓSTICO — consulta (somente leitura) na API GraphQL do Pipefy.
// Ex: GET /api/erp/debug-pipefy?secret=...&gql={ phase(id:1){ name } }
router.get('/debug-pipefy', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  const gql = String(req.query.gql || '');
  if (!gql || /\bmutation\b/i.test(gql)) return res.status(400).json({ erro: 'Só consultas (query).' });
  try { res.json(await pipefyQuery(gql, {})); } catch (e) { res.status(502).json({ erro: e.message }); }
});

// DIAGNÓSTICO — status dos pedidos (Lojinha e Orçamentos) x fase atual dos
// cards no Pipefy. Só leitura. Ex: GET /api/erp/debug-fases?secret=...
router.get('/debug-fases', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try {
    const lj = (await query(`SELECT id, numero_pedido, status, pipefy_cards FROM lojinha_boxer_pedidos
                               WHERE status <> 'finalizado' ORDER BY id`)).rows;
    const oc = (await query(`SELECT id, referencia, status, pipefy_card_id FROM pedidos_orcamento
                               WHERE status NOT IN ('finalizado', 'cancelado') AND pipefy_card_id IS NOT NULL ORDER BY id`)).rows;
    const ids = [...lj.flatMap(p => (p.pipefy_cards || []).map(c => c?.id).filter(Boolean)), ...oc.map(p => p.pipefy_card_id)];
    const fases = await fasesDosCards(ids);
    const f = (id) => (fases[String(id)] ? `${fases[String(id)].fase} (${fases[String(id)].faseId})` : 'sem resposta');
    res.json({
      lojinha: lj.map(p => ({ id: p.id, pedido: p.numero_pedido, status: p.status, cards: (p.pipefy_cards || []).map(c => ({ id: c?.id, fase: c?.id ? f(c.id) : 'sem card' })) })),
      orcamentos: oc.map(p => ({ id: p.id, ref: p.referencia, status: p.status, card: p.pipefy_card_id, fase: f(p.pipefy_card_id) })),
    });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// DIAGNÓSTICO — pedido da Loja Integrada (cru e mapeado), só leitura.
// Ex: GET /api/erp/debug-li?secret=...&numero=11131
router.get('/debug-li', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  const numero = String(req.query.numero || '').replace(/\D/g, '');
  try {
    if (req.query.path) return res.json({ dados: await getLIBruto(String(req.query.path)) });
    res.json({ mapeado: await buscarPedidoLI(numero), bruto: req.query.bruto ? await pedidoLIBruto(numero) : undefined });
  }
  catch (e) { res.status(e.status || 502).json({ erro: e.message, tentativas: tentativasLI }); }
});

// Ex: GET /api/erp/debug-mp?secret=...&pref=343482863-uuid — ID do pagamento no Mercado Pago
router.get('/debug-mp', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  if (!mercadoPagoConfigurado()) return res.json({ configurado: false });
  const pref = String(req.query.pref || '');
  try {
    res.json({
      configurado: true,
      pagamentos: await pagamentosDaPreferencia(pref),
      bruto: req.query.bruto ? await getMPBruto(`/merchant_orders/search?preference_id=${encodeURIComponent(pref)}`) : undefined,
    });
  } catch (e) { res.status(502).json({ erro: e.message }); }
});

// Força sincronização manual (GET, testável no navegador, mesmo secret do cron)
router.get('/sync-manual', async (req, res, next) => {
  try {
    if (req.query.secret !== process.env.CRON_SECRET) {
      return res.status(401).json({ erro: 'Acesso negado' });
    }
    const resultado = await forcerSync(req.app.locals.db);
    res.json({ sucesso: true, resultado });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

router.post('/sync', async (req, res) => {
  try {
    const resultado = await forcerSync(req.app.locals.db);
    res.json({ sucesso: true, resultado });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// DIAGNÓSTICO — saídas do marketplace. Só com o secret.
//   ?acao=sync      → copia mais dias do Zen (≈40 s por chamada)
//   ?acao=comparar  → planilha × Zen nos dias que existem nos dois
//   ?acao=relatorio → fecha o relatório da última sexta (se faltar)
router.get('/debug-mkt', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try {
    if (req.query.acao === 'comparar') return res.json(await compararPlanilhaZen());
    if (req.query.acao === 'relatorio') return res.json(await garantirRelatorioSemanal({ forcar: req.query.forcar === '1' }));
    res.json(await sincronizarSaidas({ intervaloMs: 0, limiteMs: 40000 }));
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Volta um orçamento "Não liberado" para Em Separação (cria pedido/ordem no Zen se faltar).
// Ex: GET /api/erp/debug-voltar-separacao?secret=...&id=614
router.get('/debug-voltar-separacao', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try { res.json(await voltarParaSeparacao(req.query.id, { nome: 'Claude (pedido do Dhiefferton)' })); }
  catch (e) { res.status(e.status || 500).json({ erro: e.message }); }
});

// GET /api/erp/cron
// Rota que o Cron Job do Vercel chama (1x por dia, no plano
// gratuito). Protegida por um segredo - o Vercel manda esse cabeçalho
// automaticamente em toda chamada de cron quando a variável de
// ambiente CRON_SECRET está configurada no projeto. Sem isso,
// qualquer pessoa poderia disparar o sync só acessando a URL.
router.get('/cron', async (req, res) => {
  const segredoEsperado = process.env.CRON_SECRET;
  const recebido = req.headers.authorization;
  if (segredoEsperado && recebido !== `Bearer ${segredoEsperado}`) {
    return res.status(401).json({ erro: 'Não autorizado' });
  }
  try {
    const resultado = await forcerSync(req.app.locals.db);
    // Marketplace: copia as saídas do Zen e, na sexta, fecha o relatório de reposição
    let marketplace = null;
    try {
      const sync = await sincronizarSaidas({ intervaloMs: 0, limiteMs: 20000 });
      marketplace = { sync, relatorio: await garantirRelatorioSemanal() };
    } catch (e) { marketplace = { erro: e.message }; console.error('[Cron ERP] marketplace:', e.message); }
    res.json({ sucesso: true, resultado, marketplace });
  } catch (err) {
    console.error('[Cron ERP] Erro:', err.message);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

export default router;
