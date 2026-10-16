import express from 'express';
import { statusSyncErp, forcerSync, debugEstoquePorCodigo } from '../jobs/syncErpEstoque.js';
import { pipefyQuery } from '../integrations/pipefyService.js';
import { diagnosticoLojinha } from '../integrations/pipefyLojinha.js';

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

// DIAGNÓSTICO — estrutura do Pipefy (pipes, fases, campos do formulário inicial
// e tabelas conectadas). Ex: GET /api/erp/debug-pipefy?secret=...&pipe=123&tabela=456
router.get('/debug-pipefy', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  const out = {};
  const tentar = async (nome, gql, vars) => {
    try { out[nome] = await pipefyQuery(gql, vars); } catch (e) { out[nome + '_erro'] = e.message; }
  };
  if (!req.query.pipe && !req.query.tabela) {
    await tentar('pipes', `query { organization(id: 327351) { pipes { id name phases { id name } } } }`);
    await tentar('tabelas', `query { organization(id: 327351) { tables(first: 50) { edges { node { id name } } } } }`);
  }
  if (req.query.pipe) {
    await tentar('pipe', `query($id: ID!) { pipe(id: $id) { id name
      phases { id name }
      start_form_fields { id label type required options description
        connectedRepo { ... on PublicTable { id name } ... on PublicPipe { id name } } } } }`, { id: String(req.query.pipe) });
    if (out.pipe_erro) {
      await tentar('pipe_simples', `query($id: ID!) { pipe(id: $id) { id name phases { id name }
        start_form_fields { id label type required options } } }`, { id: String(req.query.pipe) });
    }
  }
  if (req.query.tabela) {
    await tentar('tabela', `query($id: ID!) { table(id: $id) { id name
      table_fields { id label type options }
      table_records(first: 30) { edges { node { id title } } } } }`, { id: String(req.query.tabela) });
  }
  if (req.query.lojinha) {
    out.lojinha = await diagnosticoLojinha({ documento: req.query.doc, email: req.query.email, nome: req.query.nome });
  }
  res.json(out);
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
    res.json({ sucesso: true, resultado });
  } catch (err) {
    console.error('[Cron ERP] Erro:', err.message);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

export default router;
