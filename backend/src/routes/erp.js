import express from 'express';
import { statusSyncErp, forcerSync, debugEstoquePorCodigo } from '../jobs/syncErpEstoque.js';
import { getToken } from '../integrations/erpZen.js';
import { pipefyQuery, pipefyQueryPlanilhas } from '../integrations/pipefyService.js';
import { pedidoLIBruto, buscarPedidoLI, tentativasLI, getLIBruto } from '../integrations/lojaIntegrada.js';
import { pagamentosDaPreferencia, getMPBruto, mercadoPagoConfigurado } from '../integrations/mercadoPago.js';
import { fasesDosCards } from '../integrations/pipefyLojinha.js';
import { query } from '../config/db.js';
import { importarPecasPipefy } from '../controllers/basesController.js';
import { usoBlob } from '../controllers/blobController.js';
import { buscarTratativa } from '../integrations/pipefyTratativa.js';
import { previaEmailFaturamento } from '../controllers/faturamentoLojinha.js';
import { SQL_CATEGORIA_USO_CONSUMO } from '../controllers/mrpController.js';
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

// Ex: GET /api/erp/debug-categorias?secret=... — categorias e quais entram no MRP (uso e consumo)
router.get('/debug-categorias', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try {
    const r = await query(`SELECT c.id, c.nome, c.ativo, ${SQL_CATEGORIA_USO_CONSUMO('c')} AS no_mrp,
                                  (SELECT COUNT(*) FROM materiais m WHERE m.categoria_id = c.id AND m.ativo) AS materiais
                             FROM categorias c ORDER BY c.nome`);
    res.json({ categorias: r.rows });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Ex: GET /api/erp/debug-mov-orcamento?secret=...&id=796 — histórico de movimentações de um card de orçamento
router.get('/debug-mov-orcamento', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try {
    const id = parseInt(req.query.id) || 0;
    const p = (await query(`SELECT id, status, pipefy_card_id, pipefy_fase, pipefy_sincronizado_em, zen_erro, created_at FROM pedidos_orcamento WHERE id = $1`, [id])).rows[0];
    const m = (await query(`SELECT tipo, de_status, para_status, descricao, usuario_nome, origem, criado_em FROM pedidos_orcamento_movimentos WHERE pedido_id = $1 ORDER BY criado_em`, [id])).rows;
    res.json({ pedido: p, movimentos: m });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Ex: GET /api/erp/debug-blob?secret=... — armazenamento de vídeos ligado? (só leitura)
router.get('/debug-blob', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try {
    const u = await usoBlob();
    res.json({ configurado: u.configurado, store_id: !!process.env.BLOB_STORE_ID, arquivos: u.arquivos, itens: u.itens.map(i => ({ nome: i.nome, pct: i.pct })) });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Ex: GET /api/erp/debug-ns-orcamento?secret=... — NS de entrada dos últimos cards vindos do Pipefy (só leitura)
router.get('/debug-ns-orcamento', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try {
    const r = (await query(`SELECT id, status, pipefy_card_id, ns_entrada,
        (SELECT json_agg(json_build_object('id', e->>'id', 'nome', e->>'nome', 'valor', e->>'valor'))
           FROM jsonb_array_elements(CASE WHEN jsonb_typeof(pipefy_campos) = 'array' THEN pipefy_campos ELSE '[]'::jsonb END) e
          WHERE e->>'id' ILIKE 'ns%' OR e->>'nome' ILIKE '%ns%entrada%' OR e->>'nome' = 'ID') AS campos_ns
       FROM pedidos_orcamento WHERE pipefy_card_id IS NOT NULL ORDER BY id DESC LIMIT 8`)).rows;
    const t = (await query(`SELECT COUNT(*)::int AS total, COUNT(NULLIF(ns_entrada::text, ''))::int AS com_ns FROM pedidos_orcamento WHERE pipefy_card_id IS NOT NULL`)).rows[0];
    res.json({ ...t, cards: r });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Ex: GET /api/erp/debug-tratativa?secret=...&busca=nome — de onde vem a tratativa (SAC) de um card de orçamento (só lê o Pipefy)
router.get('/debug-tratativa', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try {
    const p = (await query(`SELECT id, status, pipefy_card_id, referencia,
        (SELECT json_agg(json_build_object('id', e->>'id', 'nome', e->>'nome', 'conect', e ? 'conectados', 'v', left(e->>'valor', 40)))
           FROM jsonb_array_elements(CASE WHEN jsonb_typeof(pipefy_campos) = 'array' THEN pipefy_campos ELSE '[]'::jsonb END) e) AS campos
       FROM pedidos_orcamento WHERE referencia ILIKE $1 OR cliente_nome ILIKE $1 ORDER BY id DESC LIMIT 1`, [`%${req.query.busca || ''}%`])).rows[0];
    if (!p) return res.json({ achou: false });
    let pipe = null;
    if (p.pipefy_card_id && req.query.ver !== '1') {
      try {
        pipe = await pipefyQueryPlanilhas(`query($id: ID!) { card(id: $id) { id title pipe { id name }
          fields { name value array_value field { id type } }
          parent_relations { name source_type cards { id title pipe { id name } current_phase { name } fields { name value array_value field { id type } } } }
          child_relations { name cards { id title pipe { id name } } } } }`, { id: String(p.pipefy_card_id) });
      } catch (e) { pipe = { erro: e.message }; }
    }
    let tratativa = null;
    if (req.query.ver === '1' && p.pipefy_card_id) { try { tratativa = await buscarTratativa(p.pipefy_card_id); } catch (e) { tratativa = { erro: e.message }; } }
    res.json(req.query.ver === '1' ? { pedido_id: p.id, tratativa } : { pedido: p, pipefy: pipe });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Ex: GET /api/erp/debug-campos-lojinha?secret=... — campos configurados da Lojinha e do CIF + um pedido finalizado (só leitura)
router.get('/debug-campos-lojinha', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try {
    const campos = async (t) => (await query(`SELECT id, coluna, tipo, rotulo, lista, pipefy_campo, ativo FROM ${t} ORDER BY coluna, ordem, id`).catch(() => ({ rows: [] }))).rows;
    const ped = (await query(`SELECT id, status, tipo_envio, transportadora, valor_frete, zen_pedido_id, zen_ordem_separacao_id, finalizado_em, campos, cif_status, cif_valores
       FROM lojinha_boxer_pedidos WHERE status = 'finalizado' ORDER BY finalizado_em DESC NULLS LAST LIMIT 2`)).rows;
    const cols = (await query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'lojinha_boxer_pedidos' ORDER BY ordinal_position`)).rows.map(r => r.column_name);
    res.json({ loj: await campos('loj_campos'), cif: await campos('cif_campos'), colunas: cols, pedidos: ped });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Ex: GET /api/erp/debug-email-faturamento?secret=...&pedido=121 — prévia do e-mail ao faturamento da Lojinha (não envia)
router.get('/debug-email-faturamento', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try { res.json(await previaEmailFaturamento(parseInt(req.query.pedido) || 0)); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});

// Ex: GET /api/erp/debug-importar-pecas?secret=...&cursor=&base= — copia a database "Peças em Geral" do Pipefy
// para a base do B-Requisições (só lê o Pipefy). Chamar de novo com o cursor devolvido até terminou=true.
router.get('/debug-importar-pecas', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try { res.json(await importarPecasPipefy({ cursor: req.query.cursor || null, baseId: req.query.base || null })); }
  catch (e) { res.status(e.status || 500).json({ erro: e.message }); }
});

// Ex: GET /api/erp/debug-corrigir-orcamento?secret=...&id=796&status=orcando
// Ajuste pontual: coloca o card na coluna informada e limpa o erro do Zen (registra no histórico)
router.get('/debug-corrigir-orcamento', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try {
    const id = parseInt(req.query.id) || 0;
    const status = String(req.query.status || '');
    if (!/^[a-z_]{3,30}$/.test(status)) return res.status(400).json({ erro: 'status inválido' });
    const antes = (await query(`SELECT status FROM pedidos_orcamento WHERE id = $1`, [id])).rows[0];
    if (!antes) return res.status(404).json({ erro: 'não encontrado' });
    await query(`UPDATE pedidos_orcamento SET status = $2, zen_erro = NULL, atualizado_em = NOW() WHERE id = $1`, [id, status]);
    await query(`INSERT INTO pedidos_orcamento_movimentos (pedido_id, tipo, de_status, para_status, descricao, usuario_nome, origem)
                 VALUES ($1, 'movido', $2, $3, 'Voltou para a mesma fase do Pipefy (ajuste pelo suporte)', 'Sistema', 'sistema')`,
      [id, antes.status, status]);
    res.json({ ok: true, de: antes.status, para: status });
  } catch (e) { res.status(500).json({ erro: e.message }); }
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

// DIAGNÓSTICO — inventário: status dos itens e contagens. Ex: ?secret=...&id=5
router.get('/debug-inventario', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try {
    const id = parseInt(req.query.id);
    // ?acao=reabrir → volta um inventário finalizado para "em andamento"
    if (req.query.acao === 'reabrir') {
      const r = await query(`UPDATE inventarios SET status = 'andamento', finalizado_em = NULL, finalizado_por_nome = NULL
                               WHERE id = $1 AND status = 'finalizado' RETURNING id, status`, [id]);
      return res.json({ reaberto: r.rows[0] || null });
    }
    const inv = (await query(`SELECT * FROM inventarios WHERE id = $1`, [id])).rows[0];
    const status = (await query(`SELECT status, COUNT(*)::int n FROM inventario_itens WHERE inventario_id = $1 GROUP BY status`, [id])).rows;
    const amostra = (await query(`SELECT id, codigo, status, endereco, categoria FROM inventario_itens WHERE inventario_id = $1 ORDER BY id LIMIT 10`, [id])).rows;
    const contagens = (await query(`SELECT COUNT(*)::int n FROM inventario_contagens WHERE inventario_id = $1`, [id])).rows[0];
    res.json({ inv, status, amostra, contagens });
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
