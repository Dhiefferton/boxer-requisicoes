// ============================================================
// controllers/comprasController.js — Processos de Compra e Cotações
// ============================================================

import { z } from 'zod';
import { query, transaction } from '../config/db.js';

const MINIMO_COTACOES = 2;

const BASE_PROCESSO = `
  SELECT
    p.id, p.material_id, p.quantidade_necessaria, p.status,
    p.cotacao_vencedora_id, p.aprovado_em, p.created_at,
    m.codigo AS material_codigo, m.descricao AS material_descricao, m.unidade,
    c.nome AS categoria_nome,
    u_criou.nome AS criado_por_nome,
    u_aprovou.nome AS aprovado_por_nome,
    (SELECT COUNT(*) FROM cotacoes ct WHERE ct.processo_id = p.id) AS total_cotacoes
  FROM processos_compra p
  JOIN materiais m ON m.id = p.material_id
  JOIN categorias c ON c.id = m.categoria_id
  LEFT JOIN usuarios u_criou   ON u_criou.id = p.criado_por
  LEFT JOIN usuarios u_aprovou ON u_aprovou.id = p.aprovado_por
`;

const criarProcessoSchema = z.object({
  material_id:           z.number().int().positive(),
  quantidade_necessaria: z.number().int().positive('Quantidade deve ser maior que zero'),
});

const criarCotacaoSchema = z.object({
  fornecedor_id:  z.number().int().positive(),
  preco_unitario: z.number().positive('Preço deve ser maior que zero'),
  prazo_dias:     z.number().int().positive().optional().nullable(),
  observacoes:    z.string().max(500).optional().nullable(),
});

// GET /compras/processos?status=aguardando_cotacao|pronta_aprovar|aprovada|cancelada
export async function listarProcessos(req, res, next) {
  try {
    const { status } = req.query;
    const params = [];
    let where = '';
    if (status) {
      where = 'WHERE p.status = $1';
      params.push(status);
    }
    const sql = `${BASE_PROCESSO} ${where} ORDER BY p.created_at DESC`;
    const result = await query(sql, params);
    res.json({ processos: result.rows });
  } catch (err) { next(err); }
}

// GET /compras/processos/:id
export async function detalharProcesso(req, res, next) {
  try {
    const { id } = req.params;
    const processo = await query(`${BASE_PROCESSO} WHERE p.id = $1`, [parseInt(id)]);
    if (!processo.rows[0]) return res.status(404).json({ erro: 'Processo não encontrado' });

    const cotacoes = await query(`
      SELECT ct.id, ct.fornecedor_id, ct.preco_unitario, ct.prazo_dias, ct.observacoes, ct.created_at,
             f.empresa AS fornecedor_empresa, f.representante AS fornecedor_representante,
             u.nome AS criado_por_nome
      FROM cotacoes ct
      JOIN fornecedores f ON f.id = ct.fornecedor_id
      LEFT JOIN usuarios u ON u.id = ct.criado_por
      WHERE ct.processo_id = $1
      ORDER BY ct.preco_unitario ASC
    `, [parseInt(id)]);

    res.json({ processo: processo.rows[0], cotacoes: cotacoes.rows });
  } catch (err) { next(err); }
}

// POST /compras/processos — cria um processo a partir de uma necessidade do MRP
export async function criarProcesso(req, res, next) {
  try {
    const dados = criarProcessoSchema.parse(req.body);
    const usuarioId = req.usuario.id;

    const material = await query(`SELECT id FROM materiais WHERE id = $1 AND ativo = TRUE`, [dados.material_id]);
    if (!material.rows[0]) return res.status(404).json({ erro: 'Material não encontrado' });

    const existente = await query(
      `SELECT id FROM processos_compra WHERE material_id = $1 AND status IN ('aguardando_cotacao', 'pronta_aprovar')`,
      [dados.material_id]
    );
    if (existente.rows[0]) {
      return res.status(409).json({ erro: 'Já existe um processo de compra em aberto para este material', processo_id: existente.rows[0].id });
    }

    const result = await query(
      `INSERT INTO processos_compra (material_id, quantidade_necessaria, criado_por)
       VALUES ($1, $2, $3) RETURNING id`,
      [dados.material_id, dados.quantidade_necessaria, usuarioId]
    );

    res.status(201).json({ processo_id: result.rows[0].id });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ erro: err.errors[0].message });
    next(err);
  }
}

// POST /compras/processos/:id/cotacoes — registra uma cotação manualmente
export async function adicionarCotacao(req, res, next) {
  try {
    const { id } = req.params;
    const dados = criarCotacaoSchema.parse(req.body);
    const usuarioId = req.usuario.id;
    const processoId = parseInt(id);

    await transaction(async (client) => {
      const processo = await client.query(
        `SELECT status FROM processos_compra WHERE id = $1 FOR UPDATE`,
        [processoId]
      );
      if (!processo.rows[0]) throw { status: 404, erro: 'Processo não encontrado' };
      if (['aprovada', 'cancelada'].includes(processo.rows[0].status)) {
        throw { status: 400, erro: 'Este processo já foi encerrado, não é possível adicionar cotação' };
      }

      const fornecedor = await client.query(`SELECT id FROM fornecedores WHERE id = $1 AND ativo = TRUE`, [dados.fornecedor_id]);
      if (!fornecedor.rows[0]) throw { status: 404, erro: 'Fornecedor não encontrado' };

      await client.query(
        `INSERT INTO cotacoes (processo_id, fornecedor_id, preco_unitario, prazo_dias, observacoes, criado_por)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [processoId, dados.fornecedor_id, dados.preco_unitario, dados.prazo_dias || null, dados.observacoes || null, usuarioId]
      );

      const total = await client.query(`SELECT COUNT(*) FROM cotacoes WHERE processo_id = $1`, [processoId]);
      const novoStatus = parseInt(total.rows[0].count) >= MINIMO_COTACOES ? 'pronta_aprovar' : 'aguardando_cotacao';

      await client.query(`UPDATE processos_compra SET status = $1 WHERE id = $2`, [novoStatus, processoId]);
    });

    res.status(201).json({ sucesso: true });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ erro: err.errors[0].message });
    if (err.status) return res.status(err.status).json({ erro: err.erro });
    next(err);
  }
}

// POST /compras/processos/:id/aprovar — aprova a compra escolhendo a cotação vencedora
export async function aprovarCompra(req, res, next) {
  try {
    const { id } = req.params;
    const { cotacao_id } = req.body;
    const usuarioId = req.usuario.id;
    const processoId = parseInt(id);

    if (!cotacao_id) return res.status(400).json({ erro: 'Informe a cotação vencedora' });

    await transaction(async (client) => {
      const processo = await client.query(
        `SELECT status FROM processos_compra WHERE id = $1 FOR UPDATE`,
        [processoId]
      );
      if (!processo.rows[0]) throw { status: 404, erro: 'Processo não encontrado' };
      if (processo.rows[0].status !== 'pronta_aprovar') {
        throw { status: 400, erro: `É preciso ter no mínimo ${MINIMO_COTACOES} cotações antes de aprovar` };
      }

      const cotacao = await client.query(
        `SELECT id FROM cotacoes WHERE id = $1 AND processo_id = $2`,
        [parseInt(cotacao_id), processoId]
      );
      if (!cotacao.rows[0]) throw { status: 404, erro: 'Cotação não encontrada neste processo' };

      await client.query(
        `UPDATE processos_compra
         SET status = 'aprovada', cotacao_vencedora_id = $1, aprovado_por = $2, aprovado_em = NOW()
         WHERE id = $3`,
        [parseInt(cotacao_id), usuarioId, processoId]
      );
    });

    res.json({ sucesso: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ erro: err.erro });
    next(err);
  }
}

// POST /compras/processos/:id/cancelar
export async function cancelarProcesso(req, res, next) {
  try {
    const { id } = req.params;
    await query(
      `UPDATE processos_compra SET status = 'cancelada' WHERE id = $1 AND status != 'aprovada'`,
      [parseInt(id)]
    );
    res.json({ sucesso: true });
  } catch (err) { next(err); }
}

// GET /compras/historico — processos aprovados, com a cotação vencedora
export async function historicoCompras(req, res, next) {
  try {
    const { data_inicio, data_fim, fornecedor_id, categoria_id } = req.query;
    const condicoes = [`p.status = 'aprovada'`];
    const params = [];
    let idx = 1;

    if (data_inicio) { condicoes.push(`p.aprovado_em >= $${idx++}`); params.push(data_inicio); }
    if (data_fim)    { condicoes.push(`p.aprovado_em <= $${idx++}`); params.push(data_fim); }
    if (fornecedor_id) { condicoes.push(`ct.fornecedor_id = $${idx++}`); params.push(parseInt(fornecedor_id)); }
    if (categoria_id)  { condicoes.push(`m.categoria_id = $${idx++}`); params.push(parseInt(categoria_id)); }

    const sql = `
      SELECT
        p.id, p.quantidade_necessaria, p.aprovado_em,
        m.codigo AS material_codigo, m.descricao AS material_descricao, m.unidade,
        c.nome AS categoria_nome,
        f.empresa AS fornecedor_empresa,
        ct.preco_unitario, ct.prazo_dias,
        (ct.preco_unitario * p.quantidade_necessaria) AS total,
        u.nome AS aprovado_por_nome
      FROM processos_compra p
      JOIN materiais m   ON m.id = p.material_id
      JOIN categorias c  ON c.id = m.categoria_id
      JOIN cotacoes ct    ON ct.id = p.cotacao_vencedora_id
      JOIN fornecedores f ON f.id = ct.fornecedor_id
      LEFT JOIN usuarios u ON u.id = p.aprovado_por
      WHERE ${condicoes.join(' AND ')}
      ORDER BY p.aprovado_em DESC
    `;

    const result = await query(sql, params);
    const totalGasto = result.rows.reduce((soma, r) => soma + parseFloat(r.total), 0);

    res.json({ compras: result.rows, total: result.rows.length, total_gasto: totalGasto });
  } catch (err) { next(err); }
}

// GET /compras/dashboard — resumo consolidado
export async function dashboardCompras(req, res, next) {
  try {
    const [pendentes, gastoMes, porFornecedor, porCategoria] = await Promise.all([
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'aguardando_cotacao') AS aguardando_cotacao,
          COUNT(*) FILTER (WHERE status = 'pronta_aprovar')     AS pronta_aprovar
        FROM processos_compra
      `),
      query(`
        SELECT COALESCE(SUM(ct.preco_unitario * p.quantidade_necessaria), 0) AS total
        FROM processos_compra p
        JOIN cotacoes ct ON ct.id = p.cotacao_vencedora_id
        WHERE p.status = 'aprovada' AND p.aprovado_em >= date_trunc('month', NOW())
      `),
      query(`
        SELECT f.empresa, COUNT(*) AS qtd_compras,
               SUM(ct.preco_unitario * p.quantidade_necessaria) AS total_gasto
        FROM processos_compra p
        JOIN cotacoes ct ON ct.id = p.cotacao_vencedora_id
        JOIN fornecedores f ON f.id = ct.fornecedor_id
        WHERE p.status = 'aprovada'
        GROUP BY f.empresa
        ORDER BY total_gasto DESC
        LIMIT 10
      `),
      query(`
        SELECT c.nome AS categoria, SUM(ct.preco_unitario * p.quantidade_necessaria) AS total_gasto
        FROM processos_compra p
        JOIN materiais m ON m.id = p.material_id
        JOIN categorias c ON c.id = m.categoria_id
        JOIN cotacoes ct ON ct.id = p.cotacao_vencedora_id
        WHERE p.status = 'aprovada'
        GROUP BY c.nome
        ORDER BY total_gasto DESC
      `),
    ]);

    res.json({
      pendentes:      pendentes.rows[0],
      gasto_mes_atual: parseFloat(gastoMes.rows[0].total),
      por_fornecedor: porFornecedor.rows,
      por_categoria:  porCategoria.rows,
    });
  } catch (err) { next(err); }
}
