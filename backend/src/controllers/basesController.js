// ============================================================
// controllers/basesController.js — Bases de registros (descrição + valor)
// ============================================================
// Bases com nome (ex.: "Peças em Geral"), compartilhadas entre Orçamento e
// Lojinha. Cada registro tem descrição e valor. O campo do tipo "registro"
// (Configurar) aponta para uma base; no card escolhe-se um registro dela.
// ============================================================
import { query } from '../config/db.js';
import { pipefyQueryPlanilhas } from '../integrations/pipefyService.js';

let estrutura = null;
function garantir() {
  if (!estrutura) {
    estrutura = query(`
      CREATE TABLE IF NOT EXISTS bx_bases (
        id        SERIAL PRIMARY KEY,
        nome      VARCHAR(80) NOT NULL,
        ativo     BOOLEAN NOT NULL DEFAULT TRUE,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_bx_bases_nome ON bx_bases (LOWER(nome)) WHERE ativo;
      CREATE TABLE IF NOT EXISTS bx_base_registros (
        id        SERIAL PRIMARY KEY,
        base_id   INTEGER NOT NULL REFERENCES bx_bases(id),
        descricao VARCHAR(160) NOT NULL,
        valor     NUMERIC(14,2) NOT NULL DEFAULT 0,
        ativo     BOOLEAN NOT NULL DEFAULT TRUE,
        criado_por_nome VARCHAR(120),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_bx_base_registros_base ON bx_base_registros (base_id) WHERE ativo;
      ALTER TABLE bx_bases ADD COLUMN IF NOT EXISTS com_valor BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE bx_bases ADD COLUMN IF NOT EXISTS pipefy_tabela VARCHAR(30);
      ALTER TABLE bx_base_registros ADD COLUMN IF NOT EXISTS pipefy_id VARCHAR(30);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_bx_base_registros_pipefy ON bx_base_registros (base_id, pipefy_id) WHERE pipefy_id IS NOT NULL;`)
      .catch(err => { estrutura = null; throw err; });
  }
  return estrutura;
}

const limpar = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
function lerValor(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
const registro = (r, base) => ({ id: r.id, base_id: r.base_id, base: base ?? r.base ?? null, descricao: r.descricao,
  valor: Number(r.valor), criado_em: r.criado_em, criado_por_nome: r.criado_por_nome || null });

// GET /bases
export async function listarBases(req, res, next) {
  try {
    await garantir();
    const r = await query(`SELECT b.id, b.nome, b.com_valor, b.pipefy_tabela, b.criado_em, COUNT(g.id)::int AS registros
      FROM bx_bases b LEFT JOIN bx_base_registros g ON g.base_id = b.id AND g.ativo
      WHERE b.ativo GROUP BY b.id ORDER BY b.nome`);
    res.json({ bases: r.rows });
  } catch (err) { next(err); }
}

// POST /bases { nome, com_valor } (admin) — com_valor=false: lista só com descrição
export async function criarBase(req, res, next) {
  try {
    await garantir();
    const nome = limpar(req.body?.nome, 80);
    if (nome.length < 2) return res.status(400).json({ erro: 'Dê um nome para a base.' });
    const comValor = req.body?.com_valor !== false;
    const ja = await query(`SELECT id, nome, com_valor FROM bx_bases WHERE ativo AND LOWER(nome) = LOWER($1)`, [nome]);
    if (ja.rows[0]) {
      if (ja.rows[0].com_valor !== comValor) return res.status(409).json({ erro: `Já existe "${ja.rows[0].nome}" como ${ja.rows[0].com_valor ? 'base com valor' : 'lista'}. Use outro nome.` });
      return res.json({ base: ja.rows[0] });
    }
    const r = await query(`INSERT INTO bx_bases (nome, com_valor) VALUES ($1, $2) RETURNING id, nome, com_valor, criado_em`, [nome, comValor]);
    res.status(201).json({ base: r.rows[0] });
  } catch (err) { next(err); }
}

// GET /bases/:id/registros
export async function listarRegistros(req, res, next) {
  try {
    await garantir();
    const b = (await query(`SELECT id, nome FROM bx_bases WHERE id = $1 AND ativo`, [Number(req.params.id) || 0])).rows[0];
    if (!b) return res.status(404).json({ erro: 'Base não encontrada.' });
    const r = await query(`SELECT * FROM bx_base_registros WHERE base_id = $1 AND ativo ORDER BY descricao LIMIT 10000`, [b.id]);
    res.json({ base: b, registros: r.rows.map(x => registro(x, b.nome)) });
  } catch (err) { next(err); }
}

// POST /bases/:id/registros { descricao, valor } — quem preenche o card cria o registro
export async function criarRegistro(req, res, next) {
  try {
    await garantir();
    const b = (await query(`SELECT id, nome, com_valor FROM bx_bases WHERE id = $1 AND ativo`, [Number(req.params.id) || 0])).rows[0];
    if (!b) return res.status(404).json({ erro: 'Base não encontrada.' });
    const descricao = limpar(req.body?.descricao, 160);
    const valor = b.com_valor ? lerValor(req.body?.valor) : 0; // lista: só descrição
    if (descricao.length < 2) return res.status(400).json({ erro: 'Digite a descrição.' });
    if (!Number.isFinite(valor) || valor < 0) return res.status(400).json({ erro: 'Valor inválido.' });
    const ja = (await query(`SELECT * FROM bx_base_registros WHERE base_id = $1 AND ativo AND LOWER(descricao) = LOWER($2)`, [b.id, descricao])).rows[0];
    if (ja) return res.status(409).json({ erro: `Já existe "${ja.descricao}" nesta base.`, registro: registro(ja, b.nome) });
    const r = await query(`INSERT INTO bx_base_registros (base_id, descricao, valor, criado_por_nome) VALUES ($1,$2,$3,$4) RETURNING *`,
      [b.id, descricao, valor, req.usuario?.nome || null]);
    res.status(201).json({ registro: registro(r.rows[0], b.nome) });
  } catch (err) { next(err); }
}

// PATCH /bases/registros/:id { descricao?, valor? } (admin) — corrige descrição/valor
export async function editarRegistro(req, res, next) {
  try {
    await garantir();
    const atual = (await query(`SELECT g.*, b.nome AS base FROM bx_base_registros g JOIN bx_bases b ON b.id = g.base_id WHERE g.id = $1 AND g.ativo`, [Number(req.params.id) || 0])).rows[0];
    if (!atual) return res.status(404).json({ erro: 'Registro não encontrado.' });
    const descricao = req.body?.descricao !== undefined ? limpar(req.body.descricao, 160) : atual.descricao;
    const valor = req.body?.valor !== undefined ? lerValor(req.body.valor) : Number(atual.valor);
    if (descricao.length < 2) return res.status(400).json({ erro: 'Digite a descrição.' });
    if (!Number.isFinite(valor) || valor < 0) return res.status(400).json({ erro: 'Valor inválido.' });
    const r = await query(`UPDATE bx_base_registros SET descricao = $2, valor = $3, atualizado_em = NOW() WHERE id = $1 RETURNING *`, [atual.id, descricao, valor]);
    res.json({ registro: registro(r.rows[0], atual.base) });
  } catch (err) { next(err); }
}

// DELETE /bases/:id (admin) — tira a base/lista da tela (fica desativada; os cards que já usaram mantêm o texto)
// Não deixa excluir se algum campo do Configurar ainda usa a base.
export async function excluirBase(req, res, next) {
  try {
    await garantir();
    const b = (await query(`SELECT id, nome FROM bx_bases WHERE id = $1 AND ativo`, [Number(req.params.id) || 0])).rows[0];
    if (!b) return res.status(404).json({ erro: 'Base não encontrada.' });
    const usos = [];
    for (const [tab, tela] of [['orc_campos', 'Orçamento'], ['loj_campos', 'Lojinha'], ['cif_campos', 'Logística CIF']]) {
      try {
        const r = await query(`SELECT rotulo FROM ${tab} WHERE ativo AND ((tipo = 'registro' AND lista = $1) OR (tipo = 'conexao' AND lista = $2))`, [String(b.id), `base:${b.id}`]);
        for (const x of r.rows) usos.push(`"${x.rotulo}" (${tela})`);
      } catch { /* tabela ainda não existe */ }
    }
    if (usos.length) return res.status(409).json({ erro: `"${b.nome}" ainda é usada no campo ${usos.join(', ')}. Troque a base desse campo e salve antes de excluir.` });
    await query(`UPDATE bx_bases SET ativo = FALSE WHERE id = $1`, [b.id]);
    await query(`UPDATE bx_base_registros SET ativo = FALSE, atualizado_em = NOW() WHERE base_id = $1`, [b.id]);
    res.json({ sucesso: true });
  } catch (err) { next(err); }
}

// ── Trazer do Pipefy a base de peças (descrição e preço) — só leitura no Pipefy ──
// A tabela é a ligada ao campo "Peça 1" da fase Orçando. Vem em partes (cursor):
// a tela chama de novo até terminar. Registros já trazidos são atualizados.
const FASE_ORCANDO = process.env.PIPEFY_ORCAMENTO_PHASE_ORCANDO_ID || '309113140';
const CAMPO_PECA = 'pe_a_1_1';
const PAGINAS_POR_VEZ = 8; // 8 x 50 registros por chamada
// Database do Pipefy "Peças em Geral" (a ligada aos campos "Peça" da fase Orçando)
const NOME_TABELA = /pe[cç]as em geral/i;
async function tabelaDasPecas() {
  if (process.env.PIPEFY_TABELA_PECAS) return { id: process.env.PIPEFY_TABELA_PECAS, nome: 'Peças em Geral' };
  const d = await pipefyQueryPlanilhas(`query($id: ID!) { phase(id: $id) { fields { id label connectedRepo { __typename ... on Table { id name } } } } }`, { id: FASE_ORCANDO });
  const campos = (d?.phase?.fields || []).filter(x => x.connectedRepo?.__typename === 'Table' && x.connectedRepo?.id);
  let f = campos.find(x => NOME_TABELA.test(x.connectedRepo.name || '')) || campos.find(x => x.id === CAMPO_PECA);
  if (f) return { id: String(f.connectedRepo.id), nome: f.connectedRepo.name || 'Peças em Geral' };
  // Não achou pelo campo: procura a database pelo nome na organização
  try {
    const o = await pipefyQueryPlanilhas(`query($id: ID!) { pipe(id: $id) { organization { tables { edges { node { id name } } } } } }`, { id: process.env.PIPEFY_ORCAMENTO_PIPE_ID || '301367367' });
    const t = (o?.pipe?.organization?.tables?.edges || []).map(e => e.node).find(n => NOME_TABELA.test(n?.name || ''));
    if (t) return { id: String(t.id), nome: t.name };
  } catch (e) { console.error('[Bases] tabelas da organização:', e.message); }
  throw Object.assign(new Error('Não achei no Pipefy a database "Peças em Geral".'), { status: 400 });
}
function registroDoPipefy(node) {
  const campos = node.record_fields || [];
  const preco = campos.find(c => c.field?.type === 'currency') || campos.find(c => /pre[cç]o|valor/i.test(c.name || ''));
  const codigo = campos.find(c => /^c[oó]d(igo)?\b/i.test(c.name || ''))?.value;
  let descricao = limpar(node.title, 160);
  if (codigo && !descricao.startsWith(String(codigo).trim())) descricao = limpar(`${String(codigo).trim()} - ${descricao}`, 160);
  const valor = preco ? lerValor(preco.value) : 0;
  return { pipefy_id: String(node.id), descricao, valor: Number.isFinite(valor) ? valor : 0 };
}
// POST /bases/importar-pipefy { cursor?, base_id? } (admin)
export async function importarBasePipefy(req, res, next) {
  try {
    await garantir();
    let base = null, tabela = null;
    if (req.body?.base_id) {
      base = (await query(`SELECT id, nome, pipefy_tabela FROM bx_bases WHERE id = $1 AND ativo`, [Number(req.body.base_id)])).rows[0] || null;
      if (base?.pipefy_tabela) tabela = { id: base.pipefy_tabela, nome: base.nome };
    }
    if (!tabela) tabela = await tabelaDasPecas();
    if (!base) {
      const nome = limpar(tabela.nome, 80); // mesma base do B-Requisições com esse nome, se já existir
      base = (await query(`SELECT id, nome, pipefy_tabela FROM bx_bases WHERE ativo AND (pipefy_tabela = $1 OR LOWER(nome) = LOWER($2)) ORDER BY id LIMIT 1`, [tabela.id, nome])).rows[0]
        || (await query(`INSERT INTO bx_bases (nome, com_valor, pipefy_tabela) VALUES ($1, TRUE, $2) RETURNING id, nome, pipefy_tabela`, [nome, tabela.id])).rows[0];
      if (!base.pipefy_tabela) await query(`UPDATE bx_bases SET pipefy_tabela = $1, com_valor = TRUE WHERE id = $2`, [tabela.id, base.id]);
    }
    const gql = `query($id: ID!, $after: String) { table_records(table_id: $id, first: 50, after: $after) {
      pageInfo { hasNextPage endCursor } edges { node { id title record_fields { name value field { id type } } } } } }`;
    let after = req.body?.cursor || null, fim = false, trazidos = 0;
    for (let i = 0; i < PAGINAS_POR_VEZ; i++) {
      const d = await pipefyQueryPlanilhas(gql, { id: tabela.id, after });
      const conn = d?.table_records;
      const regs = (conn?.edges || []).map(e => registroDoPipefy(e.node)).filter(r => r.descricao);
      if (regs.length) {
        await query(
          `INSERT INTO bx_base_registros (base_id, descricao, valor, pipefy_id, criado_por_nome)
           SELECT $1, d, v, p, 'Pipefy' FROM unnest($2::text[], $3::numeric[], $4::text[]) AS t(d, v, p)
           ON CONFLICT (base_id, pipefy_id) WHERE pipefy_id IS NOT NULL
           DO UPDATE SET descricao = EXCLUDED.descricao, valor = EXCLUDED.valor, ativo = TRUE, atualizado_em = NOW()`,
          [base.id, regs.map(r => r.descricao), regs.map(r => r.valor), regs.map(r => r.pipefy_id)]);
        trazidos += regs.length;
      }
      if (!conn?.pageInfo?.hasNextPage) { fim = true; break; }
      after = conn.pageInfo.endCursor;
    }
    const total = (await query(`SELECT COUNT(*)::int AS n FROM bx_base_registros WHERE base_id = $1 AND ativo`, [base.id])).rows[0].n;
    res.json({ base: { id: base.id, nome: base.nome }, trazidos, total, cursor: fim ? null : after, terminou: fim });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ erro: err.message });
    console.error('[Bases] Pipefy:', err.message);
    res.status(502).json({ erro: `Não consegui ler a base no Pipefy: ${err.message}` });
  }
}
