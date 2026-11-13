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
import { lerConfigOrcamento } from '../controllers/configOrcamentoController.js';
import { previaEmailsOrcamento } from '../controllers/faturamentoOrcamento.js';
import { lerConfigLojinha, registrarMovLoj, garantirEstrutura } from '../controllers/lojinhaController.js';
import { lerConfigCif } from '../controllers/logisticaCifController.js';
import { copiarCardParaQuadro, fotografarCard } from '../controllers/quadrosController.js';
import { documentosZen, zenLeitura, arquivoNotaZen } from '../integrations/zenPedidoVenda.js';
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

// DIAGNÓSTICO — lista os caminhos da API do Zen (WADL) que batem com o filtro. Só leitura.
// Ex: GET /api/erp/debug-zen-rotas?secret=...&filtro=outgoingInvoice
router.get('/debug-zen-rotas', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try {
    const token = await getToken();
    const r = await fetch('https://api.zenerp.app.br/application.wadl', { headers: { Authorization: `Bearer ${token}`, tenant: 'boxer' } });
    const wadl = await r.text();
    const re = new RegExp(String(req.query.filtro || ''), 'i');
    // monta caminhos completos (resource aninhado) com os métodos
    const pilha = []; const out = [];
    for (const m of wadl.matchAll(/<(\/?)(resource|method)\b([^>]*?)(\/?)>/g)) {
      const [, fecha, tag, attrs, auto] = m;
      if (tag === 'resource') {
        if (fecha) { pilha.pop(); continue; }
        const p = (attrs.match(/path="([^"]*)"/) || [])[1] || '';
        pilha.push(p);
        if (auto) pilha.pop();
      } else if (!fecha) {
        const nome = (attrs.match(/name="([^"]*)"/) || [])[1] || '';
        const caminho = '/' + pilha.join('/').replace(/\/+/g, '/').replace(/^\//, '');
        if (re.test(caminho)) out.push(`${nome} ${caminho}`);
      }
    }
    res.json({ total: out.length, rotas: [...new Set(out)].slice(0, 400) });
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

// DIAGNÓSTICO (só leitura) — Garantia: colunas da tela e pipes/fases do Pipefy (consulta liberada, nunca altera o pipe)
// Ex: GET /api/erp/debug-garantia?secret=...[&gql=query{...}]
router.get('/debug-garantia', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try {
    if (req.query.gql) {
      const gql = String(req.query.gql);
      if (/\bmutation\b/i.test(gql)) return res.status(400).json({ erro: 'Só consultas (query).' });
      return res.json(await pipefyQueryPlanilhas(gql, {}));
    }
    const cfg = await lerConfigCif();
    const pipes = await pipefyQueryPlanilhas(`query { organization(id: 327351) { pipes { id name phases { id name cards_count } } } }`, {});
    res.json({ colunas: cfg.colunas, pipes: (pipes?.organization?.pipes || []).filter(p => /garant/i.test(p.name)), todos: (pipes?.organization?.pipes || []).map(p => `${p.id} ${p.name}`) });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// DIAGNÓSTICO (só leitura) — Garantia: campos com "Mostrar este campo" e os valores dos cards de uma coluna
// Diagnóstico (só leitura) do Frotas: viagens e agenda de um veículo (placa) num período.
// Ex: GET /api/erp/debug-frotas-viagens?secret=...&placa=SWG5H37&de=2026-11-10&ate=2026-11-13
router.get('/debug-frotas-viagens', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try {
    const url = String(process.env.FROTAS_SUPABASE_URL || '').replace(/\/+$/, '');
    const chave = process.env.FROTAS_SUPABASE_SERVICE_KEY;
    if (!url || !chave) return res.status(400).json({ erro: 'Frotas não configurado' });
    const get = async (caminho) => {
      const _fs = (process.env.FROTAS_SUPABASE_SCHEMA || '').trim();
      const r = await fetch(`${url}/rest/v1/${caminho}`, { headers: { apikey: chave, Authorization: `Bearer ${chave}`, ...(_fs && _fs !== 'public' ? { 'Accept-Profile': _fs } : {}) } });
      const t = await r.text();
      try { return JSON.parse(t); } catch { return t; }
    };
    const placa = String(req.query.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const de = /^\d{4}-\d{2}-\d{2}$/.test(req.query.de || '') ? req.query.de : '2026-11-10';
    const ate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.ate || '') ? req.query.ate : '2026-11-13';
    const veiculos = await get(`veiculos?select=id,placa,modelo,status,km&placa=ilike.*${placa}*`);
    const ids = Array.isArray(veiculos) ? veiculos.map(v => v.id) : [];
    const filtroV = ids.length ? `&veiculo_id=in.(${ids.join(',')})` : '';
    const viagens = await get(`viagens?select=id,status,data,saida_prevista,saida_real,chegada_real,km_saida,km_chegada,destino,motorista_id,veiculo_id,created_at${filtroV}&data=gte.${de}&data=lte.${ate}&order=data.asc`);
    const viagensAbertas = await get(`viagens?select=id,status,data,saida_prevista,destino,motorista_id,veiculo_id${filtroV}&status=in.(programada,em_viagem)&order=saida_prevista.asc&limit=20`);
    const agenda = await get(`agenda_itens?select=id,tipo,titulo,inicio,fim,motorista_id,motorista_nome,veiculo_id,created_at${filtroV}&inicio=gte.${de}&inicio=lte.${ate}T23:59:59&order=inicio.asc`);
    const motIds = [...new Set([...(Array.isArray(viagens) ? viagens : []), ...(Array.isArray(agenda) ? agenda : [])].map(x => x.motorista_id).filter(Boolean))];
    const motoristas = motIds.length ? await get(`motoristas?select=id,nome,user_id&id=in.(${motIds.join(',')})`) : [];
    res.json({ veiculos, viagens, viagensAbertas, agenda, motoristas });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Ex: GET /api/erp/debug-cif-visivel?secret=...&coluna=col_x
router.get('/debug-cif-visivel', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try {
    const cfg = await lerConfigCif();
    const campos = cfg.campos.map(c => ({ id: c.id, coluna: c.coluna, tipo: c.tipo, rotulo: c.rotulo, opcoes: c.opcoes, visivel: c.visivel || null, condicao: c.condicao || null }));
    const coluna = String(req.query.coluna || '');
    const cards = coluna ? (await query(`SELECT id, cif_status, cif_valores, pipefy_garantia_id FROM lojinha_boxer_pedidos WHERE cif_status = $1 ORDER BY id DESC LIMIT 15`, [coluna])).rows : [];
    res.json({ colunas: cfg.colunas.map(c => `${c.chave}: ${c.nome}`), campos, cards: cards.map(c => ({ id: c.id, status: c.cif_status, pipefy: c.pipefy_garantia_id, valores: c.cif_valores })) });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// DIAGNÓSTICO (só leitura) — chamadas que o B-Operações fez ao Pipefy (registro pipefy_chamadas)
// Ex: GET /api/erp/debug-pipefy-chamadas?secret=...&dias=7
router.get('/debug-pipefy-chamadas', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try {
    const dias = Math.min(60, Math.max(1, parseInt(req.query.dias) || 7));
    const porTipo = (await query(`SELECT dia, tipo, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE ok)::int AS ok
        FROM pipefy_chamadas WHERE criado_em >= NOW() - ($1 || ' days')::interval GROUP BY dia, tipo ORDER BY dia DESC, tipo`, [dias])).rows;
    const mutacoes = (await query(`SELECT criado_em, origem, operacao, alvo, rota, usuario, ok, erro, nome
        FROM pipefy_chamadas WHERE tipo <> 'consulta' AND criado_em >= NOW() - ($1 || ' days')::interval ORDER BY id DESC LIMIT 50`, [dias])).rows;
    const ultima = (await query(`SELECT MAX(criado_em) AS em FROM pipefy_chamadas WHERE tipo <> 'consulta'`)).rows[0];
    res.json({ dias, por_tipo: porTipo, mutacoes, ultima_mutacao_registrada: ultima?.em || null });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// DIAGNÓSTICO (só leitura) — Construtor de telas: dono configurado, admins e rascunhos
router.get('/debug-construtor', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try {
    const admins = (await query(`SELECT id, nome, email, perfil, ativo FROM usuarios WHERE perfil = 'admin' OR nome ILIKE '%dhieff%' OR email ILIKE '%compras%' ORDER BY id`)).rows;
    const tab = (await query(`SELECT to_regclass('bx_rascunhos_tela') AS t`)).rows[0]?.t || null;
    const ligado = (await query(`SELECT valor FROM bx_config WHERE chave = 'construtor_ligado'`).catch(() => ({ rows: [] }))).rows[0]?.valor ?? null;
    res.json({ dono: (process.env.CONSTRUTOR_DONO || 'compras@boxersoldas.com.br').toLowerCase(), admins, tabela_rascunhos: tab, ligado });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// DIAGNÓSTICO (só leitura) — Esqueci minha senha: tabela, e-mail configurado, domínios dos e-mails dos usuários
router.get('/debug-esqueci-senha', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try {
    const { emailConfigurado, brevoConfigurado } = await import('../integrations/email.js');
    const tabela = (await query(`SELECT to_regclass('senha_reset_tokens') AS t`)).rows[0]?.t || null;
    const dominios = (await query(`SELECT split_part(LOWER(email), '@', 2) AS dominio, COUNT(*)::int AS n FROM usuarios WHERE ativo GROUP BY 1 ORDER BY 2 DESC`)).rows;
    const pedidos = tabela ? (await query(`SELECT COUNT(*)::int AS n, MAX(created_at) AS ultimo FROM senha_reset_tokens`)).rows[0] : null;
    const logs = (await query(`SELECT acao, COUNT(*)::int AS n, MAX(created_at) AS ultimo FROM logs WHERE acao LIKE 'SENHA_%' GROUP BY acao`).catch(e => ({ rows: [{ erro: e.message }] }))).rows;
    const ultimos = (await query(`SELECT id, created_at, split_part(COALESCE(enviado_para, ''), '@', 2) AS dominio_destino, erro_envio FROM senha_reset_tokens ORDER BY id DESC LIMIT 5`).catch(e => ({ rows: [{ erro: e.message }] }))).rows;
    res.json({ email_configurado: emailConfigurado(), brevo_configurado: brevoConfigurado(), brevo_remetente_dominio: String(process.env.BREVO_FROM || '').split('@')[1]?.replace(/>.*/, '') || null, remetente_definido: !!process.env.EMAIL_FROM, remetente_dominio: String(process.env.EMAIL_FROM || '').split('@')[1]?.replace(/>.*/, '') || null, app_url: process.env.APP_URL || null, tabela, pedidos, ultimos, dominios, logs });
  } catch (e) { res.status(500).json({ erro: e.message }); }
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

// Ex: GET /api/erp/debug-campos-orcamento?secret=...&pedido=796 — colunas/campos do Orçamento e os valores de um card (só leitura)
// Sem pedido: os últimos cards com algum campo de "remessa" preenchido.
router.get('/debug-campos-orcamento', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try {
    const cfg = await lerConfigOrcamento();
    const out = {
      colunas: cfg.colunas.map(c => `${c.chave}=${c.nome}`),
      campos: cfg.campos.map(c => ({ id: c.id, coluna: c.coluna, tipo: c.tipo, rotulo: c.rotulo, pipefy: c.pipefy_campo || null })),
    };
    const id = parseInt(req.query.pedido) || 0;
    const sel = `SELECT id, status, cliente_nome, frete_por_conta, entregue_por, ns_entrada, zen_pedido_id, zen_nota_id, aprovacao, pipefy_campos, (tratativa IS NOT NULL) AS tem_tratativa FROM pedidos_orcamento`;
    const ps = id ? (await query(`${sel} WHERE id = $1`, [id])).rows
      : (await query(`${sel} WHERE pipefy_campos::text ILIKE '%remessa%' AND status != 'cancelado' ORDER BY id DESC LIMIT 3`)).rows;
    out.pedidos = ps.map(p => ({ ...p, pipefy_campos: (Array.isArray(p.pipefy_campos) ? p.pipefy_campos : []).filter(c => c?.valor != null && String(c.valor).trim() !== '' && String(c.valor) !== '[]')
      .map(c => ({ id: c.id, nome: c.nome, valor: String(c.valor).slice(0, 120) })) }));
    res.json(out);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Ex: GET /api/erp/debug-email-faturamento-orc?secret=...&pedido=1352 — prévia dos 2 e-mails ao faturamento do Orçamento (não envia)
router.get('/debug-email-faturamento-orc', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try { res.json(await previaEmailsOrcamento(parseInt(req.query.pedido) || 0)); }
  catch (e) { res.status(500).json({ erro: e.message }); }
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

// Ex: GET /api/erp/copiar-cards-quadro?secret=...&quadro=Notas de Serviços&origem=orcamentos&colunas=nao_liberado,liberado_saida[&executar=1]
// Copia para uma tela criada os cards que estão hoje nessas colunas (Orçamentos: pedidos_orcamento.status;
// Lojinha: status; Garantia: cif_status). Não duplica. Sem executar=1 só mostra o que seria copiado.
router.get('/copiar-cards-quadro', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try {
    const nomeQ = String(req.query.quadro || '').trim();
    const q = (await query(`SELECT id, nome FROM bx_quadros WHERE ativo AND (id::text = $1 OR LOWER(nome) = LOWER($1)) ORDER BY id LIMIT 1`, [nomeQ])).rows[0];
    if (!q) return res.status(404).json({ erro: `Tela "${nomeQ}" não encontrada.` });
    const origem = String(req.query.origem || '');
    const colunas = String(req.query.colunas || '').split(',').map(x => x.trim()).filter(Boolean);
    if (!colunas.length) return res.status(400).json({ erro: 'Informe colunas=chave1,chave2' });
    const sql = origem === 'orcamentos' ? `SELECT id, status AS coluna, cliente_nome AS nome FROM pedidos_orcamento WHERE status = ANY($1::text[]) ORDER BY id`
      : origem === 'lojinha' ? `SELECT id, status AS coluna, numero_pedido AS nome FROM lojinha_boxer_pedidos WHERE status = ANY($1::text[]) ORDER BY id`
      : origem === 'logistica_cif' ? `SELECT id, cif_status AS coluna, numero_pedido AS nome FROM lojinha_boxer_pedidos WHERE cif_status = ANY($1::text[]) ORDER BY id`
      : null;
    if (!sql) return res.status(400).json({ erro: 'origem = orcamentos | lojinha | logistica_cif' });
    const cards = (await query(sql, [colunas])).rows;
    const ja = new Set((await query(`SELECT origem_id FROM bx_quadro_cards WHERE quadro_id = $1 AND origem_tela = $2`, [q.id, origem]).catch(() => ({ rows: [] }))).rows.map(r => r.origem_id));
    const novos = cards.filter(c => !ja.has(c.id));
    // atualizar=1: refaz a cópia completa (campos, fotos, histórico, e-mails) das cópias que já existem nesta tela
    if (req.query.atualizar === '1') {
      const copias = (await query(`SELECT id, origem_dados ? 'snapshot' AS tem FROM bx_quadro_cards WHERE quadro_id = $1 AND origem_tela = $2`, [q.id, origem])).rows;
      if (req.query.executar !== '1') return res.json({ quadro: q, copias: copias.length, sem_copia_completa: copias.filter(x => !x.tem).length });
      let feitos = 0; const erros = [];
      for (const x of copias) {
        try { if (await fotografarCard(q.id, x.id, { refazer: true })) feitos++; } catch (e) { erros.push({ id: x.id, erro: e.message }); }
      }
      return res.json({ quadro: q, atualizados: feitos, erros });
    }
    if (req.query.executar !== '1') return res.json({ quadro: q, total: cards.length, ja_copiados: cards.length - novos.length, a_copiar: novos.length, por_coluna: colunas.map(k => ({ coluna: k, cards: novos.filter(c => c.coluna === k).length })) });
    let copiados = 0; const erros = [];
    for (const c of novos) {
      try { if (await copiarCardParaQuadro(q.id, origem, c.id, null)) copiados++; }
      catch (e) { erros.push({ id: c.id, erro: e.message }); }
    }
    res.json({ quadro: q, copiados, erros });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

// Ex: GET /api/erp/mover-coluna-lojinha?secret=...&de=Liberação de Faturamento&para=Concluído[&executar=1]
// Move em massa os pedidos de uma coluna para outra (Lojinha e Logística CIF, pelo nome da coluna).
// Sem executar=1 só mostra o que seria movido. Registra no histórico de cada pedido.
router.get('/mover-coluna-lojinha', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try {
    await garantirEstrutura();
    const n = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const telas = [
      { tela: 'lojinha', campo: 'status', tipo: 'movido', cfg: await lerConfigLojinha() },
      { tela: 'cif', campo: 'cif_status', tipo: 'cif_movido', cfg: await lerConfigCif() },
    ];
    const out = { colunas: Object.fromEntries(telas.map(t => [t.tela, t.cfg.colunas.map(c => `${c.chave}=${c.nome}`)])), movidos: [] };
    for (const t of telas) {
      const de = t.cfg.colunas.find(c => n(c.nome) === n(req.query.de));
      const para = t.cfg.colunas.find(c => n(c.nome) === n(req.query.para));
      if (!de || !para) continue;
      const ps = (await query(`SELECT * FROM lojinha_boxer_pedidos WHERE ${t.campo} = $1 ORDER BY id`, [de.chave])).rows;
      for (const p of ps) {
        out.movidos.push({ tela: t.tela, id: p.id, pedido: p.numero_pedido, de: de.nome, para: para.nome });
        if (req.query.executar !== '1') continue;
        const extra = t.tela === 'lojinha' ? `, finalizado_em = CASE WHEN $2::text = 'finalizado' THEN COALESCE(finalizado_em, NOW()) ELSE finalizado_em END` : '';
        const r = await query(`UPDATE lojinha_boxer_pedidos SET ${t.campo} = $2::text${extra} WHERE id = $1 AND ${t.campo} = $3 RETURNING *`, [p.id, para.chave, de.chave]);
        if (r.rows[0]) await registrarMovLoj(r.rows[0], t.tipo, { de: de.chave, para: para.chave, origem: 'sistema',
          descricao: `${t.tela === 'cif' ? 'Logística CIF: m' : 'M'}ovido em massa de ${de.nome} para ${para.nome} (pedido do admin)` });
      }
    }
    out.executado = req.query.executar === '1';
    res.json(out);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Ex: GET /api/erp/debug-email-faturamento?secret=...&pedido=121 — prévia do e-mail ao faturamento da Lojinha (não envia)
router.get('/debug-email-faturamento', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try { res.json(await previaEmailFaturamento(parseInt(req.query.pedido) || 0)); }
  catch (e) { res.status(500).json({ erro: e.message }); }
});

// Ex: GET /api/erp/debug-prazos?secret=...&nome=next — forma de pagamento (prazo) dos últimos pedidos de venda no Zen (só leitura)
router.get('/debug-prazos', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try {
    const nome = String(req.query.nome || '').trim();
    const filtro = nome ? `&q=${encodeURIComponent(`person.name=like="*${nome}*"`)}` : '';
    const vendas = await zenLeitura(`/sale/sale?max=${Math.min(parseInt(req.query.max) || 100, 300)}&sort=-id${filtro}`);
    const lista = (vendas || []).map(v => ({ id: v.id, numero: v.number, cliente: v.person?.name || v.person?.description || v.person?.id, prazo: v.properties?.paymentMethods ?? null, status: v.status }));
    const contagem = {};
    for (const v of lista) contagem[String(v.prazo)] = (contagem[String(v.prazo)] || 0) + 1;
    res.json({ contagem, lista: lista.slice(0, 60) });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Ex: GET /api/erp/debug-nf-arquivo?secret=...&nf=75376&tipo=pdf — testa o download do XML/PDF da nota (só leitura)
router.get('/debug-nf-arquivo', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try {
    const a = await arquivoNotaZen(parseInt(req.query.nf) || 0, req.query.tipo === 'xml' ? 'xml' : 'pdf');
    res.json({ nome: a.nome, contentType: a.contentType, bytes: a.buffer.length, inicio: a.buffer.subarray(0, 8).toString('latin1') });
  } catch (e) { res.status(e.status || 500).json({ erro: e.message }); }
});

// Ex: GET /api/erp/debug-docs-lojinha?secret=...&pedido=93 — Nº do pedido de venda e da NF no Zen (só leitura)
router.get('/debug-docs-lojinha', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) return res.status(401).json({ erro: 'Acesso negado' });
  try {
    const p = (await query(`SELECT id, zen_pedido_id, zen_ordem_separacao_id FROM lojinha_boxer_pedidos WHERE id = $1`, [parseInt(req.query.pedido) || 0])).rows[0];
    res.json(p ? { pedido: p, docs: await documentosZen(p) } : { achou: false });
  } catch (e) { res.status(500).json({ erro: e.message }); }
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
