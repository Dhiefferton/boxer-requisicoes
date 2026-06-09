// ============================================================
// controllers/mrpController.js — MRP / Necessidade de Estoque
// ============================================================

import { query } from '../config/db.js';

// GET /mrp — Calcula necessidade de estoque baseado no consumo
export async function calcularMRP(req, res, next) {
  try {
    const { meses = 3, categoria } = req.query;
    const mesesInt = Math.min(Math.max(parseInt(meses) || 3, 1), 12);

    // Data de início do período de análise
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
        m.id,
        m.codigo,
        m.descricao,
        m.unidade,
        c.nome AS categoria_nome,
        e.quantidade AS estoque_atual,
        e.nivel_minimo,

        -- Total de saídas no período (requisições entregues)
        COALESCE(saidas.total_saida, 0) AS total_saida,

        -- Total de entradas no período
        COALESCE(entradas.total_entrada, 0) AS total_entrada,

        -- Média mensal de consumo
        ROUND(COALESCE(saidas.total_saida, 0)::numeric / $2, 2) AS media_mensal,

        -- Necessidade para 1 mês + 2 semanas de segurança (6 semanas total)
        CEIL(COALESCE(saidas.total_saida, 0)::numeric / $2 * 1.5) AS necessidade_mensal,

        -- Ponto de reabastecimento = 2 semanas de consumo
        CEIL(COALESCE(saidas.total_saida, 0)::numeric / $2 / 2) AS ponto_reabastecimento,

        -- Quantidade a comprar = necessidade - estoque atual (se positivo)
        GREATEST(0,
          CEIL(COALESCE(saidas.total_saida, 0)::numeric / $2 * 1.5) - e.quantidade
        ) AS quantidade_comprar,

        -- Status de reabastecimento
        CASE
          WHEN e.quantidade = 0 THEN 'critico'
          WHEN e.quantidade <= CEIL(COALESCE(saidas.total_saida, 0)::numeric / $2 / 2) THEN 'urgente'
          WHEN e.quantidade <= CEIL(COALESCE(saidas.total_saida, 0)::numeric / $2) THEN 'atencao'
          ELSE 'ok'
        END AS status_mrp

      FROM materiais m
      JOIN categorias c ON c.id = m.categoria_id
      LEFT JOIN estoques e ON e.material_id = m.id

      -- Saídas: itens de requisições entregues no período
      LEFT JOIN (
        SELECT
          ir.material_id,
          SUM(ir.quantidade) AS total_saida
        FROM itens_requisicao ir
        JOIN requisicoes r ON r.id = ir.requisicao_id
        WHERE r.status = 'entregue'
          AND r.updated_at >= $1
        GROUP BY ir.material_id
      ) saidas ON saidas.material_id = m.id

      -- Entradas registradas no período
      LEFT JOIN (
        SELECT
          material_id,
          SUM(quantidade) AS total_entrada
        FROM entradas_estoque
        WHERE created_at >= $1
        GROUP BY material_id
      ) entradas ON entradas.material_id = m.id

      WHERE m.ativo = TRUE
        AND COALESCE(saidas.total_saida, 0) > 0
        ${categoriaFiltro}

      ORDER BY
        CASE
          WHEN e.quantidade = 0 THEN 1
          WHEN e.quantidade <= CEIL(COALESCE(saidas.total_saida, 0)::numeric / $2 / 2) THEN 2
          WHEN e.quantidade <= CEIL(COALESCE(saidas.total_saida, 0)::numeric / $2) THEN 3
          ELSE 4
        END,
        saidas.total_saida DESC
    `;

    // Resumo geral
    const resumoSql = `
      SELECT
        COUNT(*) FILTER (WHERE status_calc = 'critico') AS criticos,
        COUNT(*) FILTER (WHERE status_calc = 'urgente') AS urgentes,
        COUNT(*) FILTER (WHERE status_calc = 'atencao') AS atencao,
        COUNT(*) FILTER (WHERE status_calc = 'ok') AS ok
      FROM (
        SELECT
          CASE
            WHEN e.quantidade = 0 THEN 'critico'
            WHEN e.quantidade <= CEIL(COALESCE(saidas.total_saida, 0)::numeric / $2 / 2) THEN 'urgente'
            WHEN e.quantidade <= CEIL(COALESCE(saidas.total_saida, 0)::numeric / $2) THEN 'atencao'
            ELSE 'ok'
          END AS status_calc
        FROM materiais m
        JOIN estoques e ON e.material_id = m.id
        LEFT JOIN (
          SELECT ir.material_id, SUM(ir.quantidade) AS total_saida
          FROM itens_requisicao ir
          JOIN requisicoes r ON r.id = ir.requisicao_id
          WHERE r.status = 'entregue' AND r.updated_at >= $1
          GROUP BY ir.material_id
        ) saidas ON saidas.material_id = m.id
        WHERE m.ativo = TRUE AND COALESCE(saidas.total_saida, 0) > 0
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
