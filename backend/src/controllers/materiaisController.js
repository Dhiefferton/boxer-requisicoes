// ============================================================
// controllers/materiaisController.js — Catálogo de Materiais
// ============================================================

import { query } from '../config/db.js';

// GET /materiais
// Lista materiais com filtro opcional por categoria e busca por texto
export async function listarMateriais(req, res, next) {
  try {
    const { categoria, busca, pagina = 1, limite = 50 } = req.query;
    const offset = (parseInt(pagina) - 1) * parseInt(limite);

    // Monta a query dinamicamente conforme os filtros recebidos
    const condicoes = ['v.ativo = TRUE'];
    const params = [];
    let paramIdx = 1;

    if (categoria) {
      condicoes.push(`v.categoria_id = $${paramIdx++}`);
      params.push(parseInt(categoria));
    }

    if (busca && busca.trim()) {
      // Busca tanto no código quanto na descrição
      condicoes.push(
        `(v.codigo ILIKE $${paramIdx} OR v.descricao ILIKE $${paramIdx})`
      );
      params.push(`%${busca.trim()}%`);
      paramIdx++;
    }

    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';

    // Query principal usando a view do banco (já calcula status_estoque)
    const sql = `
      SELECT
        id, codigo, descricao, unidade,
        categoria_id, categoria_nome, categoria_icone,
        quantidade, nivel_minimo, status_estoque
      FROM vw_catalogo
      ${where}
      ORDER BY categoria_nome, descricao
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;

    params.push(parseInt(limite), offset);

    // Conta o total para paginação
    const countSql = `SELECT COUNT(*) FROM vw_catalogo ${where}`;
    const countParams = params.slice(0, -2); // remove limite e offset

    const [result, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, countParams),
    ]);

    res.json({
      materiais: result.rows,
      total:     parseInt(countResult.rows[0].count),
      pagina:    parseInt(pagina),
      limite:    parseInt(limite),
    });

  } catch (err) {
    next(err);
  }
}

// GET /categorias
// Lista todas as categorias ativas para os filtros do catálogo
export async function listarCategorias(req, res, next) {
  try {
    const result = await query(
      `SELECT id, nome, icone
       FROM categorias
       WHERE ativo = TRUE
       ORDER BY ordem, nome`
    );
    res.json({ categorias: result.rows });
  } catch (err) {
    next(err);
  }
}

// GET /materiais/:id
// Detalhes de um material específico
export async function detalharMaterial(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT * FROM vw_catalogo WHERE id = $1`,
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
    const { codigo, descricao, categoria_id, unidade = 'un' } = req.body;

    if (!codigo || !descricao || !categoria_id) {
      return res.status(400).json({ erro: 'Campos obrigatórios: codigo, descricao, categoria_id' });
    }

    // Cria o material e o estoque zerado em uma transação
    const result = await query(
      `INSERT INTO materiais (codigo, descricao, categoria_id, unidade)
       VALUES ($1, $2, $3, $4)
       RETURNING id, codigo, descricao, categoria_id, unidade`,
      [codigo.toUpperCase(), descricao, parseInt(categoria_id), unidade]
    );

    const material = result.rows[0];

    // Cria o registro de estoque zerado automaticamente
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
// Atualiza a quantidade em estoque
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
