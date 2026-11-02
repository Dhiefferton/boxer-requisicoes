// ============================================================
// controllers/basesController.js — Bases de registros (descrição + valor)
// ============================================================
// Bases com nome (ex.: "Peças em Geral"), compartilhadas entre Orçamento e
// Lojinha. Cada registro tem descrição e valor. O campo do tipo "registro"
// (Configurar) aponta para uma base; no card escolhe-se um registro dela.
// ============================================================
import { query } from '../config/db.js';

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
      ALTER TABLE bx_bases ADD COLUMN IF NOT EXISTS com_valor BOOLEAN NOT NULL DEFAULT TRUE;`)
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
    const r = await query(`SELECT b.id, b.nome, b.com_valor, b.criado_em, COUNT(g.id)::int AS registros
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
    const r = await query(`SELECT * FROM bx_base_registros WHERE base_id = $1 AND ativo ORDER BY descricao LIMIT 2000`, [b.id]);
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
    for (const [tab, tela] of [['orc_campos', 'Orçamento'], ['loj_campos', 'Lojinha']]) {
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
