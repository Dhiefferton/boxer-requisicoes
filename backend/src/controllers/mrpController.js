// ============================================================
// controllers/mrpController.js — MRP / Necessidade de Estoque
// ============================================================

import { query, transaction } from '../config/db.js';

// GET /mrp — Calcula necessidade de estoque
export async function calcularMRP(req, res, next) {
  try {
    const { meses = 3, categoria } = req.query;
    const mesesInt = Math.min(Math.max(parseInt(meses) || 3, 1), 12);

    const dataInicio = new Date();
    dataInicio.setMonth(dataInicio.getMonth() - mesesInt);

    const params = [dataInicio.toISOString(), mesesInt];
    let paramIdx = 3;

    let categoriaFiltro = '';
    if (categoria) {
      categoriaFiltro = `AND m.categoria_id = $${paramIdx++}`;
      params.push(parseInt(categoria));
    }

    const sql = `
      SELECT
        m.id, m.codigo, m.descricao, m.unidade,
        c.nome AS categoria_nome,
        e.quantidade AS estoque_atual,
        e.nivel_minimo,
        COALESCE(saidas_req.total, 0) + COALESCE(saidas_mrp.total, 0) AS total_saida,
        COALESCE(entradas_est.total, 0) + COALESCE(entradas_mrp.total, 0) AS total_entrada,
        ROUND((COALESCE(saidas_req.total, 0) + COALESCE(saidas_mrp.total, 0))::numeric / $2, 2) AS media_mensal,
        CEIL((COALESCE(saidas_req.total, 0) + COALESCE(saidas_mrp.total, 0))::numeric / $2 * 1.5) AS necessidade_mensal,
        CEIL((COALESCE(saidas_req.total, 0) + COALESCE(saidas_mrp.total, 0))::numeric / $2 / 2) AS ponto_reabastecimento,
        GREATEST(0,
          CEIL((COALESCE(saidas_req.total, 0) + COALESCE(saidas_mrp.total, 0))::numeric / $2 * 1.5) - e.quantidade
        ) AS quantidade_comprar,
        CASE
          WHEN e.quantidade = 0 THEN 'critico'
          WHEN e.quantidade <= CEIL((COALESCE(saidas_req.total, 0) + COALESCE(saidas_mrp.total, 0))::numeric / $2 / 2) THEN 'urgente'
          WHEN e.quantidade <= CEIL((COALESCE(saidas_req.total, 0) + COALESCE(saidas_mrp.total, 0))::numeric / $2) THEN 'atencao'
          ELSE 'ok'
        END AS status_mrp
      FROM materiais m
      JOIN categorias c ON c.id = m.categoria_id
      LEFT JOIN estoques e ON e.material_id = m.id
      -- Saídas via requisições entregues
      LEFT JOIN (
        SELECT ir.material_id, SUM(ir.quantidade) AS total
        FROM itens_requisicao ir
        JOIN requisicoes r ON r.id = ir.requisicao_id
        WHERE r.status = 'entregue' AND r.updated_at >= $1
        GROUP BY ir.material_id
      ) saidas_req ON saidas_req.material_id = m.id
      -- Saídas via importação MRP
      LEFT JOIN (
        SELECT material_id, SUM(quantidade) AS total
        FROM mrp_movimentacoes
        WHERE tipo = 'saida' AND created_at >= $1
        GROUP BY material_id
      ) saidas_mrp ON saidas_mrp.material_id = m.id
      -- Entradas via entradas_estoque
      LEFT JOIN (
        SELECT material_id, SUM(quantidade) AS total
        FROM entradas_estoque
        WHERE created_at >= $1
        GROUP BY material_id
      ) entradas_est ON entradas_est.material_id = m.id
      -- Entradas via importação MRP
      LEFT JOIN (
        SELECT material_id, SUM(quantidade) AS total
        FROM mrp_movimentacoes
        WHERE tipo = 'entrada' AND created_at >= $1
        GROUP BY material_id
      ) entradas_mrp ON entradas_mrp.material_id = m.id
      WHERE m.ativo = TRUE
        AND (
          COALESCE(saidas_req.total, 0) + COALESCE(saidas_mrp.total, 0) > 0
        )
        ${categoriaFiltro}
      ORDER BY
        CASE
          WHEN e.quantidade = 0 THEN 1
          WHEN e.quantidade <= CEIL((COALESCE(saidas_req.total, 0) + COALESCE(saidas_mrp.total, 0))::numeric / $2 / 2) THEN 2
          WHEN e.quantidade <= CEIL((COALESCE(saidas_req.total, 0) + COALESCE(saidas_mrp.total, 0))::numeric / $2) THEN 3
          ELSE 4
        END,
        (COALESCE(saidas_req.total, 0) + COALESCE(saidas_mrp.total, 0)) DESC
    `;

    const resumoSql = `
      SELECT
        COUNT(*) FILTER (WHERE status_calc = 'critico') AS criticos,
        COUNT(*) FILTER (WHERE status_calc = 'urgente') AS urgentes,
        COUNT(*) FILTER (WHERE status_calc = 'atencao') AS atencao,
        COUNT(*) FILTER (WHERE status_calc = 'ok') AS ok
      FROM (
        SELECT CASE
          WHEN e.quantidade = 0 THEN 'critico'
          WHEN e.quantidade <= CEIL((COALESCE(s1.t,0)+COALESCE(s2.t,0))::numeric/$2/2) THEN 'urgente'
          WHEN e.quantidade <= CEIL((COALESCE(s1.t,0)+COALESCE(s2.t,0))::numeric/$2) THEN 'atencao'
          ELSE 'ok'
        END AS status_calc
        FROM materiais m
        JOIN estoques e ON e.material_id = m.id
        LEFT JOIN (SELECT ir.material_id, SUM(ir.quantidade) AS t FROM itens_requisicao ir JOIN requisicoes r ON r.id=ir.requisicao_id WHERE r.status='entregue' AND r.updated_at>=$1 GROUP BY ir.material_id) s1 ON s1.material_id=m.id
        LEFT JOIN (SELECT material_id, SUM(quantidade) AS t FROM mrp_movimentacoes WHERE tipo='saida' AND created_at>=$1 GROUP BY material_id) s2 ON s2.material_id=m.id
        WHERE m.ativo=TRUE AND (COALESCE(s1.t,0)+COALESCE(s2.t,0))>0
      ) sub
    `;

    const [result, resumo, cats] = await Promise.all([
      query(sql, params),
      query(resumoSql, [dataInicio.toISOString(), mesesInt]),
      query(`SELECT id, nome FROM categorias WHERE ativo = TRUE ORDER BY nome`),
    ]);

    res.json({
      itens:      result.rows,
      total:      result.rows.length,
      resumo:     resumo.rows[0],
      categorias: cats.rows,
      periodo:    { meses: mesesInt, data_inicio: dataInicio.toISOString() },
    });

  } catch (err) {
    next(err);
  }
}

// POST /mrp/importar — Importa movimentações (saída/entrada) sem mexer no estoque
export async function importarMovimentacoes(req, res, next) {
  try {
    const { movimentacoes } = req.body;
    const usuarioId = req.usuario.id;

    if (!movimentacoes || !Array.isArray(movimentacoes) || movimentacoes.length === 0) {
      return res.status(400).json({ erro: 'Nenhuma movimentação enviada.' });
    }

    let inseridos = 0;
    const erros = [];

    for (const mov of movimentacoes) {
      const { codigo, tipo, quantidade } = mov;
      if (!codigo || !tipo || !quantidade || parseInt(quantidade) <= 0) continue;

      try {
        const mat = await query(
          `SELECT id FROM materiais WHERE codigo = $1 AND ativo = TRUE`,
          [String(codigo).trim()]
        );

        if (!mat.rows[0]) {
          erros.push(`Código não encontrado: ${codigo}`);
          continue;
        }

        await query(
          `INSERT INTO mrp_movimentacoes (material_id, tipo, quantidade, usuario_id)
           VALUES ($1, $2, $3, $4)`,
          [mat.rows[0].id, tipo, parseInt(quantidade), usuarioId]
        );
        inseridos++;
      } catch (err) {
        erros.push(`Erro ao processar ${codigo}: ${err.message}`);
      }
    }

    res.json({ mensagem: `${inseridos} movimentação(ões) importada(s).`, inseridos, erros });

  } catch (err) {
    next(err);
  }
}
