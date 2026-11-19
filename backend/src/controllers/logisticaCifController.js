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
import { preencherRegistroNS } from '../integrations/registroNS.js';

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
    await preencherRegistroNS('garantia'); // Registro de NS dos cards que ainda não têm (lê o Pipefy, em lote)
    const cfg = await cfgCif.ler();
    const arquivadas = cfg.colunas.filter(c => c.arquivada).map(c => c.chave);
    const r = await query(
      `SELECT t.*, (SELECT COALESCE(json_agg(json_build_object('id', f.id, 'campo', f.campo_id, 'mime', f.mime, 'nome', f.nome, 'blob_url', f.blob_url, 'tamanho', f.tamanho) ORDER BY f.id), '[]'::json)
                      FROM loj_fotos f WHERE f.pedido_id = t.id) AS fotos_locais
         FROM ((SELECT * FROM lojinha_boxer_pedidos WHERE cif_status IS NOT NULL AND cif_status <> '_excluido' AND NOT (cif_status = ANY($1::text[])))
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
    // Coluna restrita: só admin e operador tiram cards dela (entrar nela é livre)
    if (!temBotao(req.usuario, 'cif_mover_admin') && col.get(atual)?.so_admin) {
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

// ── Perda de garantia → novo card em Orçamentos ─────────────
// O botão aparece quando o campo "Manutenção" do card está "Perda de Garantia". Cria um card
// na Entrada de Orçamentos com a tratativa do SAC (a mesma do card da Garantia) e os dados da
// Garantia (campos preenchidos, campos do Pipefy e fotos/arquivos). Um orçamento por card.
const normTxt = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
function legivel(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(legivel).filter(Boolean).join(', ');
  if (typeof v === 'object') return String(v.descricao ?? v.titulo ?? v.nome ?? v.title ?? '').trim();
  const t = String(v).trim();
  if (/^[\[{]/.test(t)) { try { return legivel(JSON.parse(t)); } catch { /* texto */ } }
  return t;
}
export function ehPerdaGarantia(cfg, valores) {
  return cfg.campos.some(f => /^manuten/.test(normTxt(f.rotulo)) && /perda de garantia/.test(normTxt(legivel(valores?.[cfgCif.idCampoConfig(f)]))));
}
let colPerda = null;
const garantirPerda = () => (colPerda ||= query(`
  ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS orcamento_perda_id INTEGER;
  ALTER TABLE pedidos_orcamento ADD COLUMN IF NOT EXISTS tratativa JSONB;
  ALTER TABLE pedidos_orcamento ADD COLUMN IF NOT EXISTS tratativa_em TIMESTAMPTZ;
  ALTER TABLE pedidos_orcamento ADD COLUMN IF NOT EXISTS tratativa_card_id TEXT;`).catch(e => { colPerda = null; throw e; }));

// POST /logistica-cif/pedidos/:id/orcamento-perda
export async function criarOrcamentoPerda(req, res, next) {
  try {
    await garantirTratativa();
    await garantirPerda();
    const p = (await query(`SELECT * FROM lojinha_boxer_pedidos WHERE id = $1 AND cif_status IS NOT NULL AND cif_status <> '_excluido'`, [parseInt(req.params.id) || 0])).rows[0];
    if (!p) return res.status(404).json({ erro: 'Card não encontrado na Garantia.' });
    if (p.orcamento_perda_id) return res.status(409).json({ erro: `O orçamento deste card já foi criado (#${p.orcamento_perda_id}).`, id: p.orcamento_perda_id });
    const cfg = await cfgCif.ler();
    const valores = p.cif_valores || {};
    if (!ehPerdaGarantia(cfg, valores)) return res.status(400).json({ erro: 'Só dá para criar o orçamento quando "Manutenção" estiver marcado como "Perda de Garantia".' });
    // Trava: um orçamento por card (dois cliques ao mesmo tempo não criam dois)
    const trava = await query(`UPDATE lojinha_boxer_pedidos SET orcamento_perda_id = 0 WHERE id = $1 AND orcamento_perda_id IS NULL RETURNING id`, [p.id]);
    if (!trava.rows[0]) return res.status(409).json({ erro: 'O orçamento deste card já está sendo criado.' });
    try {
      // Tratativa do SAC (a guardada; card do Pipefy sem leitura ainda: lê agora)
      let t = p.tratativa;
      if (!t && p.pipefy_garantia_id) {
        try {
          const { buscarTratativa } = await import('../integrations/pipefyTratativa.js');
          t = await buscarTratativa(p.pipefy_garantia_id);
          await query(`UPDATE lojinha_boxer_pedidos SET tratativa = $1::jsonb, tratativa_em = NOW() WHERE id = $2`, [JSON.stringify(t), p.id]);
        } catch { t = null; }
      }
      // Dados da Garantia: campos preenchidos (na ordem das colunas), campos do Pipefy e fotos/arquivos
      const ordemCol = new Map(cfg.colunas.map((c, i) => [c.chave, i]));
      const nomeCol = new Map(cfg.colunas.map(c => [c.chave, c.nome]));
      const camposGar = cfg.campos.filter(f => f.tipo !== 'anexo')
        .sort((a, b) => (ordemCol.get(a.coluna) ?? 99) - (ordemCol.get(b.coluna) ?? 99))
        .map(f => ({ id: cfgCif.idCampoConfig(f), nome: f.rotulo, fase: nomeCol.get(f.coluna) || '', valor: legivel(valores[cfgCif.idCampoConfig(f)]) }))
        .filter(x => x.valor);
      const doPipefy = (Array.isArray(p.pipefy_garantia_campos?.campos) ? p.pipefy_garantia_campos.campos : [])
        .map(f => ({ id: `pf_${f.id || f.nome}`, nome: f.nome, fase: 'Pipefy (Garantia)', valor: legivel(f.valor) }))
        .filter(x => x.valor && !/^https?:\/\//.test(x.valor) && !camposGar.some(c => normTxt(c.nome) === normTxt(x.nome)));
      const fotos = (await query(`SELECT id, campo_id, nome, mime FROM loj_fotos WHERE pedido_id = $1 ORDER BY id`, [p.id])).rows;
      const rotuloCampo = new Map(cfg.campos.map(f => [cfgCif.idCampoConfig(f), f.rotulo]));
      const anexos = [];
      for (const f of fotos) {
        const nome = rotuloCampo.get(f.campo_id) || 'Fotos e arquivos';
        let g = anexos.find(x => x.nome === nome);
        if (!g) anexos.push(g = { id: `gar_${f.campo_id}`, nome, anexos: [] });
        g.anexos.push({ nome: f.nome || `${String(f.mime || '').startsWith('video/') ? 'Vídeo' : 'Foto'} ${g.anexos.length + 1}`, caminho: `gar:${f.id}`, mime: f.mime });
      }
      const garantia = { pedido_id: p.id, titulo: p.cliente_nome || `Pedido ${p.numero_pedido}`, fase: nomeCol.get(p.cif_status) || p.cif_status,
        pipefy_id: p.pipefy_garantia_id || null, criado_em: new Date().toISOString(), criado_por: req.usuario?.nome || null,
        campos: [...camposGar, ...doPipefy], anexos };
      const tratativa = { ...(t || { origem: 'garantia', campos: [] }), garantia };
      const ns = p.tratativa_card_id || t?.ns || null;
      const cliente = String(p.cliente_nome || `Garantia #${p.id}`).slice(0, 255);
      // Nasce em "Liberado p/ Orçar" (a coluna pelo nome; se não achar, a chave padrão)
      const colOrc = (await query(`SELECT chave FROM orc_colunas WHERE ativo AND NOT arquivada
          AND translate(lower(nome), 'çãâáà', 'caaaa') ~ '^liberad[oa]s?\\s+(p/|para)\\s*orcar' ORDER BY ordem LIMIT 1`).catch(() => ({ rows: [] }))).rows[0]?.chave
        || 'liberado_orcar';
      const ins = await query(
        `INSERT INTO pedidos_orcamento (referencia, cliente_nome, status, criado_por, pipefy_campos, tratativa, tratativa_em, tratativa_card_id)
         VALUES ($1, $1, $5, $2, '[]'::jsonb, $3::jsonb, NOW(), $4) RETURNING id`,
        [cliente, req.usuario?.id || null, JSON.stringify(tratativa), ns, colOrc]);
      const orcId = ins.rows[0].id;
      await query(`INSERT INTO pedidos_orcamento_movimentos (pedido_id, tipo, para_status, descricao, detalhes, usuario_id, usuario_nome, origem)
        VALUES ($1, 'criado', $6, $2, $3::jsonb, $4, $5, 'usuario')`,
        [orcId, `Criado pela Garantia (perda de garantia) — card ${cliente}`, JSON.stringify({ garantia_id: p.id }), req.usuario?.id || null, req.usuario?.nome || null, colOrc]).catch(() => {});
      await query(`UPDATE lojinha_boxer_pedidos SET orcamento_perda_id = $2 WHERE id = $1`, [p.id, orcId]);
      await registrarMovLoj(p, 'cif_orcamento_perda', { usuario: req.usuario,
        descricao: `Perda de garantia: criado o card #${orcId} em Orçamentos com a tratativa e os dados da Garantia`, detalhes: { orcamento_id: orcId } });
      res.status(201).json({ id: orcId });
    } catch (e) {
      await query(`UPDATE lojinha_boxer_pedidos SET orcamento_perda_id = NULL WHERE id = $1 AND orcamento_perda_id = 0`, [p.id]).catch(() => {});
      throw e;
    }
  } catch (err) { next(err); }
}

// Foto/arquivo da Garantia levado para o Orçamento (caminho "gar:<id>"): link do blob ou a imagem
export async function responderAnexoGarantia(t, caminho, req, res) {
  const f = (await query(`SELECT id, imagem, mime, nome, blob_url FROM loj_fotos WHERE id = $1 AND pedido_id = $2`,
    [parseInt(String(caminho).slice(4)) || 0, parseInt(t?.garantia?.pedido_id) || 0])).rows[0];
  if (!f) return res.status(404).json({ erro: 'Anexo não encontrado.' });
  if (f.blob_url) return res.json({ url: f.blob_url });
  if (req.query.baixar !== '1') return res.json({ inline: true, mime: f.mime || 'image/jpeg' });
  res.set('Content-Type', f.mime || 'image/jpeg');
  res.set('Cache-Control', 'private, max-age=86400');
  res.send(f.imagem);
}

// DELETE /logistica-cif/pedidos/:id — tira o card da Garantia (fica marcado como excluído: não volta pelo
// "Trazer do Pipefy", não volta pela Tratativa e não volta pela Lojinha; o histórico continua)
export async function excluirPedidoCif(req, res, next) {
  try {
    await garantirEstrutura();
    const p = (await query(`SELECT * FROM lojinha_boxer_pedidos WHERE id = $1 AND cif_status IS NOT NULL AND cif_status <> '_excluido'`, [parseInt(req.params.id)])).rows[0];
    if (!p) return res.status(404).json({ erro: 'Card não encontrado na Garantia.' });
    const r = await query(`UPDATE lojinha_boxer_pedidos SET cif_status = '_excluido' WHERE id = $1 RETURNING *`, [p.id]);
    await registrarMovLoj(r.rows[0], 'cif_excluido', { de: p.cif_status, para: null, usuario: req.usuario,
      descricao: `Card ${p.cliente_nome || p.numero_pedido} excluído da Garantia` });
    res.json({ ok: true });
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


// ── Tratativa do SAC no card da Garantia (igual ao card do Orçamento) ──────────
// Lê (só leitura) o card pai da tratativa no Pipefy: Registro de NS, Cliente, Responsável, Modelo… e guarda aqui.
// GET /logistica-cif/pedidos/:id/tratativa[?atualizar=1]  e  GET .../tratativa/anexo?caminho=
let colunasTratativa = null;
const garantirTratativa = () => (colunasTratativa ||= garantirPipefyGarantia().then(() => query(`
  ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS tratativa JSONB;
  ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS tratativa_em TIMESTAMPTZ;`)).catch(e => { colunasTratativa = null; throw e; }));

export async function verTratativaCif(req, res, next) {
  try {
    await garantirTratativa();
    const p = (await query(`SELECT id, pipefy_garantia_id, tratativa, tratativa_em FROM lojinha_boxer_pedidos WHERE id = $1 AND cif_status IS NOT NULL`, [parseInt(req.params.id) || 0])).rows[0];
    if (!p) return res.status(404).json({ erro: 'Pedido não encontrado na Logística CIF.' });
    if (!p.pipefy_garantia_id && p.tratativa?.origem === 'boxer') {
      const { anexosTratativaBoxer } = await import('./quadrosController.js');
      return res.json({ tratativa: await anexosTratativaBoxer(p.tratativa), lido_em: p.tratativa_em });
    }
    if (!p.pipefy_garantia_id) return res.json(p.tratativa ? { tratativa: p.tratativa, lido_em: p.tratativa_em } : { tratativa: null, motivo: 'Card sem origem no Pipefy.' });
    if (p.tratativa_em && req.query.atualizar !== '1') return res.json({ tratativa: p.tratativa, lido_em: p.tratativa_em });
    const { buscarTratativa } = await import('../integrations/pipefyTratativa.js');
    try {
      const t = await buscarTratativa(p.pipefy_garantia_id);
      const r = await query(`UPDATE lojinha_boxer_pedidos SET tratativa = $1::jsonb, tratativa_em = NOW() WHERE id = $2 RETURNING tratativa_em`, [JSON.stringify(t), p.id]);
      res.json({ tratativa: t, lido_em: r.rows[0].tratativa_em });
    } catch (e) {
      res.json({ tratativa: p.tratativa, lido_em: p.tratativa_em, erro: `Não consegui ler a tratativa no Pipefy agora: ${e.message}` });
    }
  } catch (err) { next(err); }
}

export async function anexoTratativaCif(req, res, next) {
  try {
    await garantirTratativa();
    const p = (await query(`SELECT tratativa FROM lojinha_boxer_pedidos WHERE id = $1 AND cif_status IS NOT NULL`, [parseInt(req.params.id) || 0])).rows[0];
    const caminho = String(req.query.caminho || '');
    if (p?.tratativa?.origem === 'boxer' && caminho.startsWith('bx:')) {
      const { responderAnexoTratativaBoxer } = await import('./quadrosController.js');
      return responderAnexoTratativaBoxer(p.tratativa, caminho, req, res);
    }
    const tem = (p?.tratativa?.campos || []).some(c => (c.anexos || []).some(a => a.caminho === caminho));
    if (!p?.tratativa?.card_id || !tem) return res.status(404).json({ erro: 'Anexo não encontrado.' });
    const { linkAnexoTratativa } = await import('../integrations/pipefyTratativa.js');
    const url = await linkAnexoTratativa(p.tratativa.card_id, caminho);
    if (!url) return res.status(404).json({ erro: 'O anexo não está mais na tratativa.' });
    res.json({ url });
  } catch (err) { next(err); }
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
