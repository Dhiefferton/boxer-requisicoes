// ============================================================
// controllers/materiaisController.js — Catálogo de Materiais
// ============================================================

import { query } from '../config/db.js';

const BASE_SELECT = `
  SELECT
    m.id, m.codigo, m.descricao, m.unidade, m.ativo,
    c.nome AS categoria_nome, c.icone AS categoria_icone, c.id AS categoria_id,
    e.quantidade, e.nivel_minimo,
    CASE
      WHEN e.quantidade = 0 THEN 'sem_estoque'
      WHEN e.quantidade <= e.nivel_minimo THEN 'baixo_estoque'
      ELSE 'disponivel'
    END AS status_estoque
  FROM materiais m
  JOIN categorias c ON c.id = m.categoria_id
  LEFT JOIN estoques e ON e.material_id = m.id
`;

// GET /materiais
export async function listarMateriais(req, res, next) {
  try {
    const { categoria, busca, pagina = 1, limite = 50 } = req.query;
    const limiteReal = Math.min(parseInt(limite) || 50, 10000);
    const offset = (parseInt(pagina) - 1) * limiteReal;

    const condicoes = ['m.ativo = TRUE'];
    const params = [];
    let paramIdx = 1;

    if (categoria) {
      condicoes.push(`m.categoria_id = $${paramIdx++}`);
      params.push(parseInt(categoria));
    }

    if (busca && busca.trim()) {
      condicoes.push(`(m.codigo ILIKE $${paramIdx} OR m.descricao ILIKE $${paramIdx})`);
      params.push(`%${busca.trim()}%`);
      paramIdx++;
    }

    const where = `WHERE ${condicoes.join(' AND ')}`;

    const sql = `
      ${BASE_SELECT}
      ${where}
      ORDER BY c.nome, m.descricao
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;

    params.push(limiteReal, offset);

    const countSql = `
      SELECT COUNT(*)
      FROM materiais m
      JOIN categorias c ON c.id = m.categoria_id
      ${where}
    `;
    const countParams = params.slice(0, -2);

    const [result, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, countParams),
    ]);

    res.json({
      materiais: result.rows,
      total:     parseInt(countResult.rows[0].count),
      pagina:    parseInt(pagina),
      limite:    limiteReal,
    });

  } catch (err) {
    next(err);
  }
}

// GET /categorias
export async function listarCategorias(req, res, next) {
  try {
    const result = await query(
      `SELECT id, nome, icone FROM categorias WHERE ativo = TRUE ORDER BY ordem, nome`
    );
    res.json({ categorias: result.rows });
  } catch (err) {
    next(err);
  }
}

// GET /materiais/:id
export async function detalharMaterial(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(
      `${BASE_SELECT} WHERE m.id = $1`,
      [parseInt(id)]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ erro: 'Material não encontrado.' });
    }

    res.json({ material: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// POST /materiais — Somente admin
export async function criarMaterial(req, res, next) {
  try {
    const { codigo, descricao, categoria_id, unidade = 'UN' } = req.body;

    if (!codigo || !descricao || !categoria_id) {
      return res.status(400).json({ erro: 'Campos obrigatórios: codigo, descricao, categoria_id' });
    }

    const result = await query(
      `INSERT INTO materiais (codigo, descricao, categoria_id, unidade)
       VALUES ($1, $2, $3, $4)
       RETURNING id, codigo, descricao, categoria_id, unidade`,
      [codigo.toUpperCase(), descricao, parseInt(categoria_id), unidade]
    );

    const material = result.rows[0];

    await query(
      `INSERT INTO estoques (material_id, quantidade, nivel_minimo) VALUES ($1, 0, 5)`,
      [material.id]
    );

    res.status(201).json({ material });
  } catch (err) {
    next(err);
  }
}

// PATCH /materiais/:id/estoque — Somente operador/admin
export async function atualizarEstoque(req, res, next) {
  try {
    const { id } = req.params;
    const { quantidade, nivel_minimo } = req.body;

    if (quantidade === undefined) {
      return res.status(400).json({ erro: 'Campo obrigatório: quantidade' });
    }

    const result = await query(
      `UPDATE estoques
       SET quantidade = $1,
           nivel_minimo = COALESCE($2, nivel_minimo),
           updated_at = NOW()
       WHERE material_id = $3
       RETURNING *`,
      [parseInt(quantidade), nivel_minimo ? parseInt(nivel_minimo) : null, parseInt(id)]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ erro: 'Material não encontrado.' });
    }

    res.json({ estoque: result.rows[0] });
  } catch (err) {
    next(err);
  }
}
