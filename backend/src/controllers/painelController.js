// ============================================================
// controllers/painelController.js — Painel Logístico dentro do Boxer Operações
// ============================================================
// O Painel Logístico (frontend/public/painel/index.html) roda na mesma tela do sistema e usa o
// MESMO login. Os dados das planilhas (codificados pelo próprio painel, em blocos de texto) e o
// estado compartilhado (metas, ações, SWOT…) ficam aqui, no banco do Boxer Operações.
// Acesso pela tela "painel" (Admin › Usuários): "Só ver" = leitura; "Ver e mexer" = importa
// planilhas e grava metas/ações. Admin sempre mexe. Padrão (sem escolha): só o admin.
// ============================================================
import { query } from '../config/db.js';
import { telasDoUsuario } from '../middlewares/telas.js';

let estrutura = null;
const garantir = () => (estrutura ||= query(`
  CREATE TABLE IF NOT EXISTS painel_ds_meta (
    ds        TEXT PRIMARY KEY,
    nblocos   INTEGER NOT NULL DEFAULT 0,
    info      JSONB NOT NULL DEFAULT '{}'::jsonb,
    atualizado TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    por       TEXT
  );
  CREATE TABLE IF NOT EXISTS painel_ds_blocos (
    ds  TEXT NOT NULL,
    idx INTEGER NOT NULL,
    txt TEXT NOT NULL,
    PRIMARY KEY (ds, idx)
  );
  CREATE TABLE IF NOT EXISTS painel_estado (
    chave     TEXT PRIMARY KEY,
    valor     JSONB,
    atualizado TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    por       TEXT
  );
  ALTER TABLE painel_ds_meta   ENABLE ROW LEVEL SECURITY;
  ALTER TABLE painel_ds_blocos ENABLE ROW LEVEL SECURITY;
  ALTER TABLE painel_estado    ENABLE ROW LEVEL SECURITY;`).catch(e => { estrutura = null; throw e; }));

/** 'editar' | 'ver' | 'nenhum' na tela do painel */
export async function nivelPainel(u) {
  if (!u) return 'nenhum';
  if (u.perfil === 'admin') return 'editar';
  const t = await telasDoUsuario(u.id).catch(() => null);
  const n = t?.painel;
  return n === 'editar' || n === 'ver' ? n : 'nenhum';
}
const DS_OK = /^[\w.-]{1,80}$/;
const quem = (req) => req.usuario?.email || req.usuario?.nome || null;

// Middlewares
export const lerPainel = async (req, res, next) => {
  try {
    const n = await nivelPainel(req.usuario);
    if (n === 'nenhum') return res.status(403).json({ erro: 'Você não tem acesso ao Painel Logístico.' });
    req.nivelPainel = n; await garantir(); next();
  } catch (err) { next(err); }
};
export const editarPainel = async (req, res, next) => {
  try {
    const n = await nivelPainel(req.usuario);
    if (n !== 'editar') return res.status(403).json({ erro: 'Você só pode visualizar o Painel Logístico.' });
    req.nivelPainel = n; await garantir(); next();
  } catch (err) { next(err); }
};

// GET /painel/eu — papel no painel ('admin' = mexe, 'leitura' = só vê)
export async function eu(req, res, next) {
  try {
    const n = await nivelPainel(req.usuario);
    res.json({ papel: n === 'editar' ? 'admin' : n === 'ver' ? 'leitura' : 'pendente', email: req.usuario?.email || null, nome: req.usuario?.nome || null });
  } catch (err) { next(err); }
}

// GET /painel/meta
export async function listarMeta(req, res, next) {
  try {
    const r = await query(`SELECT ds, nblocos, info, atualizado FROM painel_ds_meta ORDER BY ds`);
    res.json({ dados: r.rows });
  } catch (err) { next(err); }
}

// PUT /painel/meta { ds, nblocos, info, atualizado? }
export async function salvarMeta(req, res, next) {
  try {
    const { ds, nblocos, info } = req.body || {};
    if (!DS_OK.test(String(ds || ''))) return res.status(400).json({ erro: 'Base inválida.' });
    const r = await query(
      `INSERT INTO painel_ds_meta (ds, nblocos, info, atualizado, por) VALUES ($1, $2, $3::jsonb, NOW(), $4)
       ON CONFLICT (ds) DO UPDATE SET nblocos = EXCLUDED.nblocos, info = EXCLUDED.info, atualizado = NOW(), por = EXCLUDED.por
       RETURNING ds, nblocos, info, atualizado`,
      [ds, Math.max(0, parseInt(nblocos) || 0), JSON.stringify(info && typeof info === 'object' ? info : {}), quem(req)]);
    res.json({ dados: r.rows });
  } catch (err) { next(err); }
}

// GET /painel/blocos/:ds
export async function lerBlocos(req, res, next) {
  try {
    if (!DS_OK.test(req.params.ds)) return res.status(400).json({ erro: 'Base inválida.' });
    const r = await query(`SELECT idx, txt FROM painel_ds_blocos WHERE ds = $1 ORDER BY idx`, [req.params.ds]);
    res.json({ dados: r.rows });
  } catch (err) { next(err); }
}

// DELETE /painel/blocos/:ds — antes de mandar os blocos novos de uma planilha
export async function apagarBlocos(req, res, next) {
  try {
    if (!DS_OK.test(req.params.ds)) return res.status(400).json({ erro: 'Base inválida.' });
    await query(`DELETE FROM painel_ds_blocos WHERE ds = $1`, [req.params.ds]);
    res.json({ dados: [] });
  } catch (err) { next(err); }
}

// POST /painel/blocos [{ ds, idx, txt }] (até 5 blocos por chamada)
export async function gravarBlocos(req, res, next) {
  try {
    const lista = Array.isArray(req.body) ? req.body : [];
    if (!lista.length || lista.length > 5) return res.status(400).json({ erro: 'Envie de 1 a 5 blocos.' });
    for (const b of lista) {
      if (!DS_OK.test(String(b?.ds || '')) || !Number.isInteger(b?.idx) || b.idx < 0 || typeof b?.txt !== 'string') {
        return res.status(400).json({ erro: 'Bloco inválido.' });
      }
    }
    await query(
      `INSERT INTO painel_ds_blocos (ds, idx, txt)
       SELECT x.ds, x.idx, x.txt FROM jsonb_to_recordset($1::jsonb) AS x(ds text, idx int, txt text)
       ON CONFLICT (ds, idx) DO UPDATE SET txt = EXCLUDED.txt`, [JSON.stringify(lista)]);
    res.json({ dados: [] });
  } catch (err) { next(err); }
}

// GET /painel/estado
export async function lerEstado(req, res, next) {
  try {
    const r = await query(`SELECT chave, valor, atualizado FROM painel_estado ORDER BY chave`);
    res.json({ dados: r.rows });
  } catch (err) { next(err); }
}

// PUT /painel/estado { chave, valor }
export async function salvarEstado(req, res, next) {
  try {
    const chave = String(req.body?.chave || '');
    if (!/^[\w.:-]{1,120}$/.test(chave)) return res.status(400).json({ erro: 'Chave inválida.' });
    const r = await query(
      `INSERT INTO painel_estado (chave, valor, atualizado, por) VALUES ($1, $2::jsonb, NOW(), $3)
       ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado = NOW(), por = EXCLUDED.por
       RETURNING chave, atualizado`,
      [chave, JSON.stringify(req.body?.valor ?? null), quem(req)]);
    res.json({ dados: r.rows });
  } catch (err) { next(err); }
}
