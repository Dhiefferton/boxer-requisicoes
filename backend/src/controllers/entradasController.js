// ============================================================
// controllers/entradasController.js — Registro de Entradas
// ============================================================

import { query, transaction } from '../config/db.js';

// GET /entradas
export async function listarEntradas(req, res, next) {
  try {
    const { pagina = 1, limite = 100, busca } = req.query;
    const offset = (parseInt(pagina) - 1) * parseInt(limite);

    const condicoes = [];
    const params = [];
    let idx = 1;

    if (busca && busca.trim()) {
      condicoes.push(`(m.codigo ILIKE $${idx} OR m.descricao ILIKE $${idx})`);
      params.push(`%${busca.trim()}%`);
      idx++;
    }

    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';

    const sql = `
      SELECT
        e.id, e.quantidade, e.observacao, e.created_at,
        m.id AS material_id, m.codigo, m.descricao, m.unidade,
        u.nome AS usuario_nome
      FROM entradas_estoque e
      JOIN materiais m ON m.id = e.material_id
      LEFT JOIN usuarios u ON u.id = e.usuario_id
      ${where}
      ORDER BY e.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;

    params.push(parseInt(limite), offset);

    const countSql = `
      SELECT COUNT(*) FROM entradas_estoque e
      JOIN materiais m ON m.id = e.material_id
      ${where}
    `;

    const [result, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, params.slice(0, -2)),
    ]);

    res.json({
      entradas: result.rows,
      total:    parseInt(countResult.rows[0].count),
      pagina:   parseInt(pagina),
      limite:   parseInt(limite),
    });

  } catch (err) {
    next(err);
  }
}

// POST /entradas — Registra entrada e atualiza estoque
export async function registrarEntrada(req, res, next) {
  try {
    const { material_id, quantidade, observacao } = req.body;
    const usuarioId = req.usuario.id;

    if (!material_id || !quantidade || parseInt(quantidade) <= 0) {
      return res.status(400).json({ erro: 'Campos obrigatórios: material_id e quantidade (> 0)' });
    }

    const mat = await query(
      `SELECT id, codigo, descricao FROM materiais WHERE id = $1 AND ativo = TRUE`,
      [parseInt(material_id)]
    );
    if (!mat.rows[0]) {
      return res.status(404).json({ erro: 'Material não encontrado.' });
    }

    await transaction(async (client) => {
      await client.query(
        `INSERT INTO entradas_estoque (material_id, quantidade, usuario_id, observacao)
         VALUES ($1, $2, $3, $4)`,
        [parseInt(material_id), parseInt(quantidade), usuarioId, observacao || null]
      );

      await client.query(
        `UPDATE estoques SET quantidade = quantidade + $1, updated_at = NOW()
         WHERE material_id = $2`,
        [parseInt(quantidade), parseInt(material_id)]
      );
    });

    const estoque = await query(
      `SELECT quantidade FROM estoques WHERE material_id = $1`,
      [parseInt(material_id)]
    );

    res.status(201).json({
      mensagem:   'Entrada registrada com sucesso!',
      material:   mat.rows[0],
      quantidade: parseInt(quantidade),
      novo_saldo: estoque.rows[0]?.quantidade,
    });

  } catch (err) {
    next(err);
  }
}

// DELETE /entradas/:id — Exclui entrada e subtrai do estoque
export async function excluirEntrada(req, res, next) {
  try {
    const { id } = req.params;

    // Busca a entrada
    const entrada = await query(
      `SELECT e.id, e.material_id, e.quantidade FROM entradas_estoque e WHERE e.id = $1`,
      [parseInt(id)]
    );

    if (!entrada.rows[0]) {
      return res.status(404).json({ erro: 'Registro não encontrado.' });
    }

    const { material_id, quantidade } = entrada.rows[0];

    await transaction(async (client) => {
      // Subtrai a quantidade do estoque (não deixa negativo)
      await client.query(
        `UPDATE estoques
         SET quantidade = GREATEST(0, quantidade - $1), updated_at = NOW()
         WHERE material_id = $2`,
        [quantidade, material_id]
      );

      // Exclui o registro
      await client.query(`DELETE FROM entradas_estoque WHERE id = $1`, [parseInt(id)]);
    });

    res.json({ mensagem: 'Registro excluído e estoque atualizado.' });

  } catch (err) {
    next(err);
  }
}
