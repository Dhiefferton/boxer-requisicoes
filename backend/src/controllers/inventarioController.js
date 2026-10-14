// ============================================================
// controllers/inventarioController.js — Inventário (contagem cíclica)
// ============================================================
// Fluxo:
//   1. Admin/operador cria um inventário escolhendo categorias e curvas.
//      Entram só os itens com saldo do Zen <= 30. O endereço vem do Zen
//      (stockCube aberto por endereço), não da planilha.
//   2. O contador lê o QR code no celular e informa a quantidade (às cegas).
//      Na hora da contagem o sistema busca o saldo e o endereço atuais no
//      Zen e calcula a diferença.
//   3. Divergentes podem ir para recontagem; no fim, finaliza.
// Tempo: cada contagem guarda a hora. O tempo efetivo de um contador é a
// soma dos intervalos entre as contagens dele (intervalos > 10 min contam
// como pausa e não entram).
// ============================================================

import { query } from '../config/db.js';
import { getToken } from '../integrations/erpZen.js';
import { buscaEstoque, stockPorFiltro, ENDERECO_MAQ_ID } from '../jobs/syncErpEstoque.js';
import { CURVAS_ABC } from '../jobs/curvasAbc.js';

export const SALDO_MAXIMO = 30;
const PAUSA_SEG = 600;               // intervalo maior que isso = pausa
const CATEGORIAS_ERP = ['Partes e Peças', 'Máquinas'];

// ── Estrutura (criada sozinha na primeira chamada) ─────────────
let estruturaOk = null;
function garantirEstrutura() {
  if (!estruturaOk) {
    estruturaOk = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS inventarios (
          id            SERIAL PRIMARY KEY,
          status        VARCHAR(20) NOT NULL DEFAULT 'andamento',
          filtros       JSONB,
          criado_por    INTEGER,
          criado_por_nome VARCHAR(150),
          criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          finalizado_em TIMESTAMPTZ,
          finalizado_por_nome VARCHAR(150)
        );
        CREATE TABLE IF NOT EXISTS inventario_itens (
          id             SERIAL PRIMARY KEY,
          inventario_id  INTEGER NOT NULL REFERENCES inventarios(id) ON DELETE CASCADE,
          material_id    INTEGER,
          codigo         VARCHAR(30) NOT NULL,
          descricao      VARCHAR(255),
          categoria      VARCHAR(100),
          curva          CHAR(1),
          endereco       TEXT,
          saldo_inicial  NUMERIC,
          saldo_zen      NUMERIC,
          contado        NUMERIC,
          diferenca      NUMERIC,
          status         VARCHAR(20) NOT NULL DEFAULT 'pendente',
          contado_por    INTEGER,
          contado_por_nome VARCHAR(150),
          contado_em     TIMESTAMPTZ,
          observacao     TEXT,
          contagens      INTEGER NOT NULL DEFAULT 0,
          UNIQUE (inventario_id, codigo)
        );
        CREATE INDEX IF NOT EXISTS idx_inv_itens_inv ON inventario_itens(inventario_id, status);
        CREATE TABLE IF NOT EXISTS inventario_contagens (
          id            SERIAL PRIMARY KEY,
          inventario_id INTEGER NOT NULL REFERENCES inventarios(id) ON DELETE CASCADE,
          item_id       INTEGER NOT NULL REFERENCES inventario_itens(id) ON DELETE CASCADE,
          quantidade    NUMERIC NOT NULL,
          saldo_zen     NUMERIC,
          endereco      TEXT,
          curva         CHAR(1),
          usuario_id    INTEGER,
          usuario_nome  VARCHAR(150),
          observacao    TEXT,
          criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_inv_cont_inv ON inventario_contagens(inventario_id, usuario_id, criado_em);
        ALTER TABLE materiais ADD COLUMN IF NOT EXISTS curva_abc CHAR(1);
      `);
      // Curva ABC da planilha (só preenche quem ainda não tem)
      const r = await query(`SELECT COUNT(*)::int AS n FROM materiais WHERE curva_abc IS NOT NULL`);
      if (r.rows[0].n === 0) {
        for (const curva of ['A', 'B', 'C']) {
          await query(
            `UPDATE materiais SET curva_abc = $1 WHERE codigo = ANY($2::text[]) AND curva_abc IS NULL`,
            [curva, CURVAS_ABC[curva]]
          );
        }
      }
    })().catch(e => { estruturaOk = null; throw e; });
  }
  return estruturaOk;
}

// ── Zen ────────────────────────────────────────────────────────
// Só valem endereços de estoque físico: os que começam com PE (PE.A…, PEC…).
// AVA, TERCEIRO, DEVOLUCAO, MERCADO_LIVRE etc. ficam de fora. Máquinas usam o MAQ.
const enderecoValido = (e, categoria) =>
  /^PE/i.test(String(e || '').trim()) || (categoria === 'Máquinas' && String(e || '').trim().toUpperCase() === 'MAQ');

// Endereços (com saldo) de todos os produtos, numa chamada só
async function enderecosZenEmLote() {
  const linhas = await buscaEstoque([1001, 1002, 1003], { SHOW_ADDRESS: true });
  const mapa = {};
  for (const l of (Array.isArray(linhas) ? linhas : [])) {
    if (!l.product_code || !l.address_code || !(Number(l.sum_quantity) > 0)) continue;
    if (!/^PE/i.test(String(l.address_code).trim()) && String(l.address_code).trim().toUpperCase() !== 'MAQ') continue;
    (mapa[l.product_code] ||= []).push({ e: l.address_code, q: Number(l.sum_quantity) });
  }
  const fmt = {};
  for (const [cod, lista] of Object.entries(mapa)) {
    fmt[cod] = lista.sort((a, b) => b.q - a.q).map(x => x.e).join(' / ');
  }
  return fmt;
}

// Saldo e endereço atuais de um produto (na hora da contagem)
async function saldoZenAgora(codigo, categoria) {
  const token = await getToken();
  const maq = categoria === 'Máquinas';
  const filtro = maq
    ? `productPacking.product.code=="${codigo}";type=="REGULAR";address.id==${ENDERECO_MAQ_ID};reservation.id==0`
    : `productPacking.product.code=="${codigo}";type=="REGULAR"`;
  const itens = await stockPorFiltro(token, filtro, 1000);
  let saldo = 0;
  const porEndereco = {};
  for (const it of itens) {
    const q = Number(it.quantity) || 0;
    saldo += q;
    const e = it.address?.code;
    if (e && q > 0 && enderecoValido(e, categoria)) porEndereco[e] = (porEndereco[e] || 0) + q;
  }
  const endereco = Object.entries(porEndereco).sort((a, b) => b[1] - a[1]).map(([e]) => e).join(' / ');
  return { saldo, endereco };
}

// ── Consultas de apoio ─────────────────────────────────────────
const STATS_SQL = `
  SELECT inventario_id,
         COUNT(*)::int                                              AS total,
         COUNT(*) FILTER (WHERE status <> 'pendente')::int          AS contados,
         COUNT(*) FILTER (WHERE status = 'ok')::int                 AS ok,
         COUNT(*) FILTER (WHERE status = 'divergente')::int         AS divergentes,
         COUNT(*) FILTER (WHERE status = 'recontagem')::int         AS recontagem,
         COUNT(*) FILTER (WHERE status = 'pendente')::int           AS pendentes
    FROM inventario_itens
   WHERE inventario_id = ANY($1::int[])
   GROUP BY inventario_id`;

// Tempo efetivo por inventário / contador / curva (em segundos)
const TEMPO_SQL = `
  WITH c AS (
    SELECT inventario_id, usuario_id, usuario_nome, curva, criado_em,
           EXTRACT(EPOCH FROM criado_em - LAG(criado_em) OVER (
             PARTITION BY inventario_id, usuario_id ORDER BY criado_em)) AS gap
      FROM inventario_contagens
     WHERE inventario_id = ANY($1::int[])
  )
  SELECT inventario_id, usuario_id, MAX(usuario_nome) AS usuario_nome, curva,
         SUM(CASE WHEN gap IS NULL OR gap > ${PAUSA_SEG} THEN 0 ELSE gap END)::int AS segundos,
         COUNT(*)::int AS contagens,
         MAX(criado_em) AS ultima
    FROM c GROUP BY inventario_id, usuario_id, curva`;

async function resumoInventarios(ids) {
  if (!ids.length) return {};
  const [stats, tempos] = await Promise.all([query(STATS_SQL, [ids]), query(TEMPO_SQL, [ids])]);
  const r = {};
  for (const id of ids) r[id] = { total: 0, contados: 0, ok: 0, divergentes: 0, recontagem: 0, pendentes: 0,
    tempo_seg: 0, tempo_curva: { A: 0, B: 0, C: 0, '-': 0 }, contadores: {} };
  for (const s of stats.rows) Object.assign(r[s.inventario_id], s);
  for (const t of tempos.rows) {
    const x = r[t.inventario_id];
    x.tempo_seg += t.segundos;
    x.tempo_curva[t.curva || '-'] = (x.tempo_curva[t.curva || '-'] || 0) + t.segundos;
    const c = (x.contadores[t.usuario_id] ||= { nome: t.usuario_nome, segundos: 0, contagens: 0, ultima: null });
    c.segundos += t.segundos; c.contagens += t.contagens;
    if (!c.ultima || t.ultima > c.ultima) c.ultima = t.ultima;
  }
  for (const x of Object.values(r)) {
    const avaliados = x.ok + x.divergentes + x.recontagem;
    x.acuracidade = avaliados ? x.ok / avaliados : null;
    x.itens_hora = x.tempo_seg > 0 ? (x.contados / (x.tempo_seg / 3600)) : null;
    x.contadores = Object.entries(x.contadores).map(([id, c]) => ({ usuario_id: Number(id), ...c }));
  }
  return r;
}

function statusDaContagem(contado, saldo) {
  return Number(contado) === Number(saldo) ? 'ok' : 'divergente';
}

// ── Rotas ──────────────────────────────────────────────────────

// GET /inventarios
export async function listarInventarios(req, res, next) {
  try {
    await garantirEstrutura();
    const r = await query(`SELECT * FROM inventarios WHERE status <> 'cancelado' ORDER BY id DESC LIMIT 200`);
    const resumo = await resumoInventarios(r.rows.map(i => i.id));
    res.json({ inventarios: r.rows.map(i => ({ ...i, resumo: resumo[i.id] })), saldo_maximo: SALDO_MAXIMO });
  } catch (err) { next(err); }
}

function filtrosCandidatos(body) {
  const categorias = (Array.isArray(body.categorias) && body.categorias.length ? body.categorias : ['Partes e Peças'])
    .filter(c => CATEGORIAS_ERP.includes(c));
  const curvas = (Array.isArray(body.curvas) && body.curvas.length ? body.curvas : ['A', 'B', 'C', '-'])
    .filter(c => ['A', 'B', 'C', '-'].includes(c));
  const incluirZerados = body.incluirZerados !== false;
  return { categorias, curvas, incluirZerados };
}

function sqlCandidatos(f) {
  return {
    sql: `
      SELECT m.id, m.codigo, m.descricao, c.nome AS categoria, m.curva_abc AS curva,
             COALESCE(m.quantidade_erp, 0) AS saldo
        FROM materiais m JOIN categorias c ON c.id = m.categoria_id
       WHERE m.ativo = TRUE
         AND c.nome = ANY($1::text[])
         AND COALESCE(m.quantidade_erp, 0) <= ${SALDO_MAXIMO}
         AND ($2 OR COALESCE(m.quantidade_erp, 0) > 0)
         AND (COALESCE(m.curva_abc, '-') = ANY($3::text[]))
       ORDER BY m.curva_abc NULLS LAST, m.codigo`,
    params: [f.categorias, f.incluirZerados, f.curvas],
  };
}

// POST /inventarios/previa  { categorias, curvas, incluirZerados }
export async function previaInventario(req, res, next) {
  try {
    await garantirEstrutura();
    const f = filtrosCandidatos(req.body || {});
    const { sql, params } = sqlCandidatos(f);
    const r = await query(`SELECT categoria, COALESCE(curva, '-') AS curva, COUNT(*)::int AS n FROM (${sql}) x GROUP BY 1, 2`, params);
    const total = r.rows.reduce((s, x) => s + x.n, 0);
    res.json({ total, grupos: r.rows, filtros: f, saldo_maximo: SALDO_MAXIMO });
  } catch (err) { next(err); }
}

// POST /inventarios  { categorias, curvas, incluirZerados }
export async function criarInventario(req, res, next) {
  try {
    await garantirEstrutura();
    const aberto = await query(`SELECT id FROM inventarios WHERE status = 'andamento' LIMIT 1`);
    if (aberto.rows[0]) {
      return res.status(409).json({ erro: `Já existe um inventário em andamento (#${aberto.rows[0].id}). Finalize ou cancele antes de abrir outro.` });
    }
    const f = filtrosCandidatos(req.body || {});
    const { sql, params } = sqlCandidatos(f);
    const itens = (await query(sql, params)).rows;
    if (!itens.length) return res.status(400).json({ erro: 'Nenhum item com esses filtros.' });

    let enderecos = {};
    let avisoEndereco = null;
    try { enderecos = await enderecosZenEmLote(); }
    catch (e) { avisoEndereco = 'Não consegui buscar os endereços no Zen agora; eles aparecem na hora da contagem.'; console.error('[Inventario] enderecos:', e.message); }

    const inv = await query(
      `INSERT INTO inventarios (filtros, criado_por, criado_por_nome) VALUES ($1, $2, $3) RETURNING *`,
      [JSON.stringify(f), req.usuario.id, req.usuario.nome]
    );
    const id = inv.rows[0].id;
    await query(
      `INSERT INTO inventario_itens (inventario_id, material_id, codigo, descricao, categoria, curva, endereco, saldo_inicial)
       SELECT $1, d.mid, d.cod, d.descr, d.cat, NULLIF(d.cur, ''), NULLIF(d.ende, ''), d.saldo
         FROM UNNEST($2::int[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::numeric[])
              AS d(mid, cod, descr, cat, cur, ende, saldo)
       ON CONFLICT (inventario_id, codigo) DO NOTHING`,
      [id, itens.map(i => i.id), itens.map(i => i.codigo), itens.map(i => i.descricao), itens.map(i => i.categoria),
       itens.map(i => i.curva || ''), itens.map(i => (enderecos[i.codigo] || '').split(' / ').filter(e => enderecoValido(e, i.categoria)).join(' / ')), itens.map(i => Number(i.saldo) || 0)]
    );
    res.status(201).json({ inventario: inv.rows[0], itens: itens.length, aviso: avisoEndereco });
  } catch (err) { next(err); }
}

// GET /inventarios/:id
export async function detalharInventario(req, res, next) {
  try {
    await garantirEstrutura();
    const id = parseInt(req.params.id);
    const inv = await query(`SELECT * FROM inventarios WHERE id = $1`, [id]);
    if (!inv.rows[0]) return res.status(404).json({ erro: 'Inventário não encontrado.' });
    const [itens, resumo] = await Promise.all([
      query(`SELECT * FROM inventario_itens WHERE inventario_id = $1
              ORDER BY CASE status WHEN 'recontagem' THEN 0 WHEN 'divergente' THEN 1 WHEN 'pendente' THEN 2 ELSE 3 END,
                       curva NULLS LAST, endereco NULLS LAST, codigo`, [id]),
      resumoInventarios([id]),
    ]);
    res.json({ inventario: { ...inv.rows[0], resumo: resumo[id] }, itens: itens.rows });
  } catch (err) { next(err); }
}

// GET /inventarios/:id/meu — dados leves para a tela do celular
export async function meuInventario(req, res, next) {
  try {
    await garantirEstrutura();
    const id = parseInt(req.params.id);
    const inv = await query(`SELECT id, status, criado_em FROM inventarios WHERE id = $1`, [id]);
    if (!inv.rows[0]) return res.status(404).json({ erro: 'Inventário não encontrado.' });
    const resumo = (await resumoInventarios([id]))[id];
    const eu = resumo.contadores.find(c => c.usuario_id === req.usuario.id) || { segundos: 0, contagens: 0, ultima: null };
    const ultimas = await query(
      `SELECT c.id, c.quantidade, c.criado_em, i.id AS item_id, i.codigo, i.descricao
         FROM inventario_contagens c JOIN inventario_itens i ON i.id = c.item_id
        WHERE c.inventario_id = $1 AND c.usuario_id = $2 ORDER BY c.criado_em DESC LIMIT 8`,
      [id, req.usuario.id]);
    const pendentes = await query(
      `SELECT id, codigo, descricao, curva, endereco, status FROM inventario_itens
        WHERE inventario_id = $1 AND status IN ('pendente', 'recontagem')
        ORDER BY CASE status WHEN 'recontagem' THEN 0 ELSE 1 END, endereco NULLS LAST, codigo LIMIT 3000`, [id]);
    res.json({
      inventario: inv.rows[0],
      total: resumo.total, contados: resumo.contados, recontagem: resumo.recontagem,
      meu_tempo_seg: eu.segundos, minhas_contagens: eu.contagens, minha_ultima: eu.ultima,
      pausa_seg: PAUSA_SEG, ultimas: ultimas.rows, pendentes: pendentes.rows,
    });
  } catch (err) { next(err); }
}

// GET /inventarios/:id/buscar?texto=...  (texto lido do QR code ou digitado)
export async function buscarItemInventario(req, res, next) {
  try {
    await garantirEstrutura();
    const id = parseInt(req.params.id);
    const texto = String(req.query.texto || '').trim();
    if (!texto) return res.status(400).json({ erro: 'Informe o código.' });
    // O QR pode trazer só o código ou um texto maior: testa o texto inteiro e cada pedaço
    const pedacos = [...new Set([texto, ...texto.split(/[^0-9A-Za-z\-./]+/), ...(texto.match(/\d{3,}/g) || [])]
      .map(s => s.trim().toUpperCase()).filter(Boolean))].slice(0, 30);
    const r = await query(
      `SELECT * FROM inventario_itens WHERE inventario_id = $1 AND UPPER(codigo) = ANY($2::text[]) LIMIT 1`, [id, pedacos]);
    let item = r.rows[0];
    if (!item) {
      const m = await query(
        `SELECT m.codigo, m.descricao, m.quantidade_erp FROM materiais m WHERE UPPER(m.codigo) = ANY($1::text[]) LIMIT 1`, [pedacos]);
      const mat = m.rows[0];
      return res.status(404).json({
        erro: mat
          ? `${mat.codigo} — ${mat.descricao} não está neste inventário (saldo no sistema: ${mat.quantidade_erp ?? 0}; só entram itens com saldo até ${SALDO_MAXIMO}).`
          : `Código "${texto}" não encontrado.`,
      });
    }
    // Endereço atualizado do Zen (sem mostrar saldo — contagem às cegas)
    try {
      const z = await saldoZenAgora(item.codigo, item.categoria);
      if ((z.endereco || null) !== (item.endereco || null)) {
        await query(`UPDATE inventario_itens SET endereco = $1 WHERE id = $2`, [z.endereco || null, item.id]);
        item.endereco = z.endereco || null;
      }
    } catch (e) { console.error('[Inventario] endereco zen:', e.message); }
    const { saldo_inicial, saldo_zen, diferenca, ...cego } = item;
    res.json({ item: cego });
  } catch (err) { next(err); }
}

// POST /inventarios/:id/itens/:itemId/contar  { quantidade, observacao }
export async function contarItem(req, res, next) {
  try {
    await garantirEstrutura();
    const id = parseInt(req.params.id);
    const itemId = parseInt(req.params.itemId);
    const quantidade = Number(req.body?.quantidade);
    if (!Number.isFinite(quantidade) || quantidade < 0) return res.status(400).json({ erro: 'Quantidade inválida.' });
    const inv = await query(`SELECT status FROM inventarios WHERE id = $1`, [id]);
    if (inv.rows[0]?.status !== 'andamento') return res.status(400).json({ erro: 'Este inventário não está em andamento.' });
    const it = await query(`SELECT * FROM inventario_itens WHERE id = $1 AND inventario_id = $2`, [itemId, id]);
    const item = it.rows[0];
    if (!item) return res.status(404).json({ erro: 'Item não encontrado.' });

    // Saldo do Zen na hora da contagem
    let saldo = Number(item.saldo_inicial) || 0;
    let endereco = item.endereco;
    try {
      const z = await saldoZenAgora(item.codigo, item.categoria);
      saldo = z.saldo; endereco = z.endereco || null;
    } catch (e) { console.error('[Inventario] saldo zen:', e.message); }

    const status = statusDaContagem(quantidade, saldo);
    const observacao = String(req.body?.observacao || '').trim() || null;
    const up = await query(
      `UPDATE inventario_itens
          SET contado = $1::numeric, saldo_zen = $2::numeric, diferenca = $1::numeric - $2::numeric, status = $3, endereco = $4,
              contado_por = $5, contado_por_nome = $6, contado_em = NOW(), observacao = COALESCE($7, observacao),
              contagens = contagens + 1
        WHERE id = $8 RETURNING id, codigo, contado, contado_em, contagens`,
      [quantidade, saldo, status, endereco, req.usuario.id, req.usuario.nome, observacao, itemId]
    );
    await query(
      `INSERT INTO inventario_contagens (inventario_id, item_id, quantidade, saldo_zen, endereco, curva, usuario_id, usuario_nome, observacao)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, itemId, quantidade, saldo, endereco, item.curva, req.usuario.id, req.usuario.nome, observacao]
    );
    res.json({ item: up.rows[0] });
  } catch (err) { next(err); }
}

// POST /inventarios/:id/recontar  { itens: [ids] }
export async function pedirRecontagem(req, res, next) {
  try {
    await garantirEstrutura();
    const id = parseInt(req.params.id);
    const ids = (req.body?.itens || []).map(Number).filter(Boolean);
    const r = await query(
      `UPDATE inventario_itens SET status = 'recontagem'
        WHERE inventario_id = $1 AND status = 'divergente' AND ($2::int[] = '{}' OR id = ANY($2::int[]))
        RETURNING id`, [id, ids]);
    res.json({ marcados: r.rowCount });
  } catch (err) { next(err); }
}

// GET /inventarios/:id/itens/:itemId/historico
export async function historicoItem(req, res, next) {
  try {
    await garantirEstrutura();
    const r = await query(
      `SELECT quantidade, saldo_zen, endereco, usuario_nome, observacao, criado_em
         FROM inventario_contagens WHERE inventario_id = $1 AND item_id = $2 ORDER BY criado_em`,
      [parseInt(req.params.id), parseInt(req.params.itemId)]);
    res.json({ contagens: r.rows });
  } catch (err) { next(err); }
}

// POST /inventarios/:id/finalizar
export async function finalizarInventario(req, res, next) {
  try {
    await garantirEstrutura();
    const r = await query(
      `UPDATE inventarios SET status = 'finalizado', finalizado_em = NOW(), finalizado_por_nome = $2
        WHERE id = $1 AND status = 'andamento' RETURNING *`, [parseInt(req.params.id), req.usuario.nome]);
    if (!r.rows[0]) return res.status(400).json({ erro: 'Inventário não está em andamento.' });
    res.json({ inventario: r.rows[0] });
  } catch (err) { next(err); }
}

// POST /inventarios/:id/cancelar
export async function cancelarInventario(req, res, next) {
  try {
    await garantirEstrutura();
    const r = await query(
      `UPDATE inventarios SET status = 'cancelado', finalizado_em = NOW(), finalizado_por_nome = $2
        WHERE id = $1 AND status = 'andamento' RETURNING id`, [parseInt(req.params.id), req.usuario.nome]);
    if (!r.rows[0]) return res.status(400).json({ erro: 'Inventário não está em andamento.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// GET /inventarios/indicadores?meses=12
export async function indicadoresInventario(req, res, next) {
  try {
    await garantirEstrutura();
    const meses = Math.min(Math.max(parseInt(req.query.meses) || 12, 1), 120);
    const inv = await query(
      `SELECT id, criado_em FROM inventarios
        WHERE status = 'finalizado' AND criado_em >= NOW() - ($1 || ' months')::interval ORDER BY criado_em`, [String(meses)]);
    const ids = inv.rows.map(i => i.id);
    const resumo = await resumoInventarios(ids);
    const porCurva = ids.length ? (await query(
      `SELECT COALESCE(curva, '-') AS curva,
              COUNT(*) FILTER (WHERE status <> 'pendente')::int AS contados,
              COUNT(*) FILTER (WHERE status = 'ok')::int AS ok,
              COUNT(*) FILTER (WHERE status IN ('divergente', 'recontagem'))::int AS divergentes
         FROM inventario_itens WHERE inventario_id = ANY($1::int[]) GROUP BY 1 ORDER BY 1`, [ids])).rows : [];
    const porMes = {};
    const contadores = {};
    const tot = { contados: 0, ok: 0, divergentes: 0, tempo_seg: 0, inventarios: ids.length };
    const tempoCurva = { A: 0, B: 0, C: 0, '-': 0 };
    for (const i of inv.rows) {
      const r = resumo[i.id];
      const mes = new Date(i.criado_em).toISOString().slice(0, 7);
      const m = (porMes[mes] ||= { mes, contados: 0, ok: 0, divergentes: 0 });
      m.contados += r.contados; m.ok += r.ok; m.divergentes += r.divergentes + r.recontagem;
      tot.contados += r.contados; tot.ok += r.ok; tot.divergentes += r.divergentes + r.recontagem; tot.tempo_seg += r.tempo_seg;
      for (const k of Object.keys(tempoCurva)) tempoCurva[k] += r.tempo_curva[k] || 0;
      for (const c of r.contadores) {
        const x = (contadores[c.usuario_id] ||= { nome: c.nome, segundos: 0, contagens: 0 });
        x.segundos += c.segundos; x.contagens += c.contagens;
      }
    }
    res.json({
      totais: { ...tot, acuracidade: (tot.ok + tot.divergentes) ? tot.ok / (tot.ok + tot.divergentes) : null,
                itens_hora: tot.tempo_seg ? tot.contados / (tot.tempo_seg / 3600) : null },
      por_mes: Object.values(porMes).map(m => ({ ...m, acuracidade: (m.ok + m.divergentes) ? m.ok / (m.ok + m.divergentes) : null })),
      por_curva: porCurva.map(c => ({ ...c, tempo_seg: tempoCurva[c.curva] || 0,
        acuracidade: (c.ok + c.divergentes) ? c.ok / (c.ok + c.divergentes) : null })),
      contadores: Object.values(contadores).map(c => ({ ...c, itens_hora: c.segundos ? c.contagens / (c.segundos / 3600) : null }))
        .sort((a, b) => (b.itens_hora || 0) - (a.itens_hora || 0)),
    });
  } catch (err) { next(err); }
}
