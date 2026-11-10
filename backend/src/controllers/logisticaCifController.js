// ============================================================
// controllers/logisticaCifController.js — Logística CIF (Enviar)
// ============================================================
// Continuação da Lojinha Boxer: quando o pedido chega em Finalizado ele entra
// aqui na coluna "Aguardando envio" (e continua em Finalizado na Lojinha).
// É o mesmo pedido (lojinha_boxer_pedidos), então os dados, fotos e o
// histórico da Lojinha vêm junto. Fase daqui: cif_status; campos: cif_valores
// (ids cif_bx_<id>); colunas e campos configuráveis (cif_colunas / cif_campos).
// ============================================================
import { query } from '../config/db.js';
import { copiarParaTelas } from './quadrosController.js';
import { criarConfigQuadro, exigidoAgora, bloqueioRegra, destinosPara } from './configQuadro.js';
import { garantirEstrutura, registrarMovLoj, atualizarDocumentosZen } from './lojinhaController.js';
import { temBotao } from '../middlewares/telas.js';
import { liberarFaturamento, ehLiberacaoFaturamento } from './faturamentoLojinha.js';

const COLUNAS_CIF = [
  { chave: 'aguardando_envio', nome: 'Aguardando envio', cor: '#3b82f6', so_admin: false },
];
const PRIMEIRA = COLUNAS_CIF[0].chave;
const cfgCif = criarConfigQuadro({ TC: 'cif_colunas', TF: 'cif_campos', tabPedidos: 'lojinha_boxer_pedidos',
  padrao: COLUNAS_CIF, colStatus: 'cif_status', prefixoId: 'cif_bx_' });
export const verConfigCif = (req, res, next) => cfgCif.verConfig(req, res, next);
export const salvarConfigCif = (req, res, next) => cfgCif.salvarConfig(req, res, next);
export const adicionarOpcaoCif = (req, res, next) => cfgCif.adicionarOpcao(req, res, next);
export const lerConfigCif = () => cfgCif.ler();

// Só os pedidos finalizados a partir do lançamento da tela entram sozinhos
const INICIO_CIF = '2026-11-03T00:00:00-03:00';

/** Pedidos que chegaram em Finalizado e ainda não estão no CIF entram em "Aguardando envio". */
export async function entrarNoCif(usuario = null) {
  await garantirEstrutura();
  const r = await query(
    `UPDATE lojinha_boxer_pedidos SET cif_status = $1, cif_entrou_em = NOW()
      WHERE status = 'finalizado' AND cif_status IS NULL AND finalizado_em >= $2::timestamptz
      RETURNING *`, [PRIMEIRA, INICIO_CIF]);
  for (const p of r.rows) {
    await registrarMovLoj(p, 'cif_entrada', {
      de: 'finalizado', para: PRIMEIRA, usuario, origem: usuario ? 'usuario' : 'sistema',
      descricao: 'Entrou na Logística CIF (Enviar) — Aguardando envio',
    });
  }
  return r.rows.length;
}

// Acesso (padrão, igual à Lojinha): admin, operador ou setor SAC / Suporte; ou tela liberada no cadastro
export async function acessoCif(req, res, next) {
  try {
    const u = req.usuario;
    if (!u) return res.status(401).json({ erro: 'Não autenticado.' });
    if (req.liberadoTela || ['admin', 'operador'].includes(u.perfil)) return next();
    if (u.departamento_id) {
      const r = await query(`SELECT nome FROM departamentos WHERE id = $1`, [u.departamento_id]);
      if ((r.rows[0]?.nome || '').trim().toLowerCase() === 'sac / suporte') return next();
    }
    res.status(403).json({ erro: 'Acesso restrito à Logística CIF.' });
  } catch (err) { next(err); }
}

// GET /logistica-cif/pedidos
export async function listarPedidosCif(req, res, next) {
  try {
    // Entrada automática (Finalizado → Aguardando envio) desligada (04/11/2026); entrarNoCif() fica sem uso
    await atualizarDocumentosZen(); // Nº do pedido de venda e da NF
    const cfg = await cfgCif.ler();
    const arquivadas = cfg.colunas.filter(c => c.arquivada).map(c => c.chave);
    const r = await query(
      `SELECT t.*, (SELECT COALESCE(json_agg(json_build_object('id', f.id, 'campo', f.campo_id, 'mime', f.mime, 'nome', f.nome, 'blob_url', f.blob_url, 'tamanho', f.tamanho) ORDER BY f.id), '[]'::json)
                      FROM loj_fotos f WHERE f.pedido_id = t.id) AS fotos_locais
         FROM ((SELECT * FROM lojinha_boxer_pedidos WHERE cif_status IS NOT NULL AND NOT (cif_status = ANY($1::text[])))
               UNION ALL
               (SELECT * FROM lojinha_boxer_pedidos WHERE cif_status = ANY($1::text[]) ORDER BY cif_entrou_em DESC NULLS LAST LIMIT 80)) t
        ORDER BY t.cif_entrou_em DESC NULLS LAST, t.id DESC`, [arquivadas]);
    res.json({ pedidos: r.rows });
  } catch (err) { next(err); }
}

// POST /logistica-cif/pedidos/:id/mover { status }
export async function moverPedidoCif(req, res, next) {
  try {
    await garantirEstrutura();
    const status = String(req.body?.status || '');
    const cfg = await cfgCif.ler();
    const col = new Map(cfg.colunas.map(c => [c.chave, c]));
    if (!col.has(status)) return res.status(400).json({ erro: 'Coluna inválida.' });
    const p = (await query(`SELECT * FROM lojinha_boxer_pedidos WHERE id = $1 AND cif_status IS NOT NULL`, [parseInt(req.params.id)])).rows[0];
    if (!p) return res.status(404).json({ erro: 'Pedido não encontrado na Logística CIF.' });
    const atual = p.cif_status;
    if (status === atual) return res.json({ pedido: p });
    if (!temBotao(req.usuario, 'cif_mover_admin') && (col.get(status)?.so_admin || col.get(atual)?.so_admin)) {
      return res.status(403).json({ erro: 'Mover pedidos nessa coluna não está liberado para você (Admin > Usuários).' });
    }
    const destinosCol = destinosPara(col.get(atual), req.usuario);
    if (Array.isArray(destinosCol) && !destinosCol.includes(status)) {
      return res.status(400).json({ erro: `De "${col.get(atual)?.nome || atual}" não dá para mover para "${col.get(status)?.nome || status}". Ajuste em Configurar.` });
    }
    const valores = p.cif_valores || {};
    // Regras da coluna (Configurar → "Regras para mover")
    const motivoRegra = bloqueioRegra(col.get(atual), status, cfg.campos, valores, cfgCif.idCampoConfig);
    if (motivoRegra) return res.status(400).json({ erro: `Não dá para mover para "${col.get(status)?.nome || status}": ${motivoRegra} (regra da coluna "${col.get(atual)?.nome || atual}").` });
  // Admin voltando o card para uma coluna anterior: não exige os campos obrigatórios da coluna atual
    const ordemCol = (k) => cfg.colunas.findIndex(c => c.chave === k);
    const voltandoAdmin = req.usuario?.perfil === 'admin' && ordemCol(status) >= 0 && ordemCol(status) < ordemCol(atual);
    const faltando = voltandoAdmin ? [] : cfg.campos.filter(c => c.coluna === atual && exigidoAgora(c, cfg.campos, valores, cfgCif.idCampoConfig) && c.tipo !== 'anexo'
      && !String(valores[cfgCif.idCampoConfig(c)] ?? '').replace(/[\[\]"]/g, '').trim());
    if (faltando.length) return res.status(400).json({ erro: `Preencha antes de sair de "${col.get(atual)?.nome || atual}": ${faltando.map(c => c.rotulo).join(', ')}.` });
    const r = await query(`UPDATE lojinha_boxer_pedidos SET cif_status = $2 WHERE id = $1 RETURNING *`, [p.id, status]);
    await registrarMovLoj(r.rows[0], 'cif_movido', {
      de: atual, para: status, usuario: req.usuario,
      descricao: `Logística CIF: movido de ${col.get(atual)?.nome || atual} para ${col.get(status)?.nome || status}`,
    });
    if (ehLiberacaoFaturamento(col.get(status)?.nome)) { await liberarFaturamento(p.id, req.usuario); await copiarParaTelas('logistica_cif', p.id, req.usuario); }
    res.json({ pedido: r.rows[0] });
  } catch (err) { next(err); }
}

// POST /logistica-cif/pedidos/:id/campos { campos: { cif_bx_<id>: valor } }
export async function editarCamposCif(req, res, next) {
  try {
    await garantirEstrutura();
    const campos = req.body?.campos;
    if (!campos || typeof campos !== 'object' || Array.isArray(campos)) return res.status(400).json({ erro: 'Envie { campos: { id: valor } }.' });
    const p = (await query(`SELECT * FROM lojinha_boxer_pedidos WHERE id = $1 AND cif_status IS NOT NULL`, [parseInt(req.params.id)])).rows[0];
    if (!p) return res.status(404).json({ erro: 'Pedido não encontrado na Logística CIF.' });
    const cfg = await cfgCif.ler();
    const rot = new Map(cfg.campos.map(c => [cfgCif.idCampoConfig(c), c.rotulo]));
    const novo = { ...(p.cif_valores || {}) };
    const alterados = [];
    for (const [k, v] of Object.entries(campos)) {
      if (!/^cif_[a-z0-9_]{1,80}$/i.test(k)) continue;
      const valor = v == null ? '' : String(v).slice(0, 5000);
      if (valor === '') delete novo[k]; else novo[k] = valor;
      alterados.push(rot.get(k) || k);
    }
    const r = await query(`UPDATE lojinha_boxer_pedidos SET cif_valores = $2::jsonb WHERE id = $1 RETURNING *`, [p.id, JSON.stringify(novo)]);
    if (alterados.length) await registrarMovLoj(p, 'campos_editados', { usuario: req.usuario, descricao: `Logística CIF — campos preenchidos: ${alterados.join(', ')}`, detalhes: campos });
    res.json({ pedido: r.rows[0] });
  } catch (err) { next(err); }
}

// ── Trazer do Pipefy (igual ao Orçamento) ──────────────────────
// Lê só a fase "Entrada" do pipe "Garantia - Boxer Soldas" (consulta; o pipe não é alterado) e cria aqui,
// na primeira coluna da Garantia (Entrada), os cards que ainda não existem. Os que já existem não são alterados.
// O card do Pipefy vira uma linha de lojinha_boxer_pedidos com status 'garantia' (não aparece na Lojinha),
// com os campos do Pipefy guardados em pipefy_garantia_campos (mostrados no card, só consulta).
const GARANTIA_FASE_ENTRADA = process.env.PIPEFY_GARANTIA_PHASE_ENTRADA_ID || '309018705';
let estruturaPipefyGarantia = null;
function garantirPipefyGarantia() {
  if (!estruturaPipefyGarantia) {
    estruturaPipefyGarantia = (async () => {
      await garantirEstrutura();
      await query(`ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS pipefy_garantia_id VARCHAR(30)`);
      await query(`ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS pipefy_garantia_campos JSONB`);
      await query(`ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS pipefy_garantia_url TEXT`);
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_loj_pipefy_garantia ON lojinha_boxer_pedidos (pipefy_garantia_id) WHERE pipefy_garantia_id IS NOT NULL`);
    })().catch(e => { estruturaPipefyGarantia = null; throw e; });
  }
  return estruturaPipefyGarantia;
}
// Valor do Pipefy em texto (conexões/listas vêm como '["A","B"]')
function textoPipefy(v) {
  if (v == null) return '';
  const s = String(v).trim();
  if (s.startsWith('[')) { try { const a = JSON.parse(s); if (Array.isArray(a)) return a.map(String).join(', '); } catch { /* texto */ } }
  return s;
}
let importandoGarantia = null;
export async function importarEntradaGarantia(req, res, next) {
  if (importandoGarantia) return res.status(409).json({ erro: 'Já tem uma importação em andamento. Aguarde alguns segundos.' });
  importandoGarantia = (async () => {
    await garantirPipefyGarantia();
    const { pipefyQueryPlanilhas } = await import('../integrations/pipefyService.js');
    const ja = new Set((await query(`SELECT pipefy_garantia_id FROM lojinha_boxer_pedidos WHERE pipefy_garantia_id IS NOT NULL`)).rows.map(r => String(r.pipefy_garantia_id)));
    const gql = `query CardsEntrada($phaseId: ID!, $after: String) {
      phase(id: $phaseId) { name cards(first: 50, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges { node { id title url createdAt fields { name value field { id } } } } } } }`;
    let after = null, faseNome = 'Entrada', chamadas = 0;
    const cards = [];
    for (let pagina = 0; pagina < 20; pagina++) {
      const data = await pipefyQueryPlanilhas(gql, { phaseId: String(GARANTIA_FASE_ENTRADA), after });
      chamadas++;
      const conn = data?.phase?.cards;
      if (data?.phase?.name) faseNome = data.phase.name;
      if (!conn) break;
      for (const { node } of conn.edges || []) {
        if (ja.has(String(node.id))) continue;
        cards.push({ id: String(node.id), titulo: node.title, url: node.url, criadoEm: node.createdAt,
          campos: (node.fields || []).map(f => ({ id: f.field?.id || null, nome: f.name, valor: f.value })) });
      }
      if (!conn.pageInfo?.hasNextPage) break;
      after = conn.pageInfo.endCursor;
    }
    const cfg = await cfgCif.ler();
    const primeira = cfg.colunas.find(c => !c.arquivada)?.chave || PRIMEIRA;
    let novos = 0;
    for (const card of cards) {
      const v = (...ids) => { for (const id of ids) { const t = textoPipefy(card.campos.find(f => f.id === id)?.valor); if (t) return t; } return ''; };
      const cliente = (v('cliente', 'cliente2') || card.titulo || `Card ${card.id}`).slice(0, 255);
      const r = await query(
        `INSERT INTO lojinha_boxer_pedidos
           (documento, cliente_nome, data, numero_pedido, vendedora, tipo_envio, itens, status, origem, criado_por, criado_por_nome,
            cif_status, cif_entrou_em, pipefy_garantia_id, pipefy_garantia_campos, pipefy_garantia_url)
         VALUES ('', $1, COALESCE($2::timestamptz, NOW())::date, $3, $4, $5, '[]'::jsonb, 'garantia', 'pipefy_garantia', $6, $7,
                 $8, NOW(), $9, $10::jsonb, $11)
         ON CONFLICT (pipefy_garantia_id) WHERE pipefy_garantia_id IS NOT NULL DO NOTHING
         RETURNING *`,
        [cliente, card.criadoEm || null, `GAR-${card.id}`.slice(0, 60), (v('respons_vel_pelo_caso') || '—').slice(0, 150),
         (v('frete_por_conta') || '—').slice(0, 30), req.usuario?.id || null, req.usuario?.nome || null,
         primeira, card.id, JSON.stringify({ titulo: card.titulo, fase: faseNome, campos: card.campos }), card.url || null]);
      if (r.rows[0]) {
        novos++;
        await registrarMovLoj(r.rows[0], 'importado', {
          para: primeira, usuario: req.usuario, origem: 'usuario',
          descricao: `Card trazido do Pipefy (Garantia, fase "${faseNome}") pelo botão "Trazer do Pipefy"`,
          detalhes: { pipefy_card_id: card.id },
        });
      }
    }
    return { sucesso: true, novos, novos_no_pipefy: cards.length, fase: faseNome, chamadas_pipefy: chamadas };
  })();
  try { res.json(await importandoGarantia); }
  catch (err) { next(err); }
  finally { importandoGarantia = null; }
}


// Renomeia o card da Garantia (nome mostrado no topo do card aberto)
export async function renomearCif(req, res, next) {
  try {
    await garantirEstrutura();
    const nome = String(req.body?.nome ?? '').trim().slice(0, 255);
    if (!nome) return res.status(400).json({ erro: 'Informe o nome do card.' });
    const p = (await query(`SELECT * FROM lojinha_boxer_pedidos WHERE id = $1 AND cif_status IS NOT NULL`, [parseInt(req.params.id)])).rows[0];
    if (!p) return res.status(404).json({ erro: 'Pedido não encontrado na Logística CIF.' });
    const r = await query(`UPDATE lojinha_boxer_pedidos SET cliente_nome = $2 WHERE id = $1 RETURNING *`, [p.id, nome]);
    await registrarMovLoj(p, 'campos_editados', { usuario: req.usuario, descricao: `Logística CIF — nome do card alterado: "${p.cliente_nome}" → "${nome}"`, detalhes: { nome } });
    res.json({ pedido: r.rows[0] });
  } catch (err) { next(err); }
}
