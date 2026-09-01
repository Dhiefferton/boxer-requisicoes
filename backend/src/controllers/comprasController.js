// ============================================================
// controllers/comprasController.js — Cards de Compra, Itens e Cotações
// ============================================================

import { z } from 'zod';
import { query, transaction } from '../config/db.js';

const MINIMO_COTACOES = 2;

const criarProcessoSchema = z.object({
  itens: z.array(z.object({
    material_id:           z.number().int().positive(),
    quantidade_necessaria: z.number().int().positive('Quantidade deve ser maior que zero'),
  })).min(1, 'O card precisa ter pelo menos 1 item'),
});

const criarCotacaoSchema = z.object({
  fornecedor_id:  z.number().int().positive(),
  preco_unitario: z.number().positive('Preço deve ser maior que zero'),
  prazo_dias:     z.number().int().positive().optional().nullable(),
  observacoes:    z.string().max(500).optional().nullable(),
});

const ITEM_SELECT = `
  SELECT
    i.id, i.processo_id, i.material_id, i.quantidade_necessaria, i.status,
    i.cotacao_vencedora_id, i.aprovado_em, i.created_at,
    i.data_prevista_entrega, i.numero_nota_fiscal, i.entrada_id, i.recebido_em,
    COALESCE(m.codigo, i.codigo_snapshot)       AS material_codigo,
    COALESCE(m.descricao, i.descricao_snapshot) AS material_descricao,
    COALESCE(m.unidade, i.unidade_snapshot)     AS unidade,
    c.nome AS categoria_nome,
    u_aprovou.nome AS aprovado_por_nome,
    (SELECT COUNT(*) FROM cotacoes ct WHERE ct.item_processo_id = i.id) AS total_cotacoes
  FROM itens_processo_compra i
  LEFT JOIN materiais m   ON m.id = i.material_id
  LEFT JOIN categorias c  ON c.id = m.categoria_id
  LEFT JOIN usuarios u_aprovou ON u_aprovou.id = i.aprovado_por
`;

// GET /compras/processos — lista os cards com resumo dos itens
export async function listarProcessos(req, res, next) {
  try {
    const cards = await query(`
      SELECT p.id, p.created_at, u.nome AS criado_por_nome
      FROM processos_compra p
      LEFT JOIN usuarios u ON u.id = p.criado_por
      ORDER BY p.created_at DESC
    `);
    if (cards.rows.length === 0) return res.json({ processos: [] });

    const itens = await query(`${ITEM_SELECT} WHERE i.processo_id = ANY($1) ORDER BY i.id`, [cards.rows.map(c => c.id)]);

    const processos = cards.rows.map(card => {
      const itensCard = itens.rows.filter(i => i.processo_id === card.id);
      return { ...card, itens: itensCard };
    });

    res.json({ processos });
  } catch (err) { next(err); }
}

// GET /compras/processos/:id
export async function detalharProcesso(req, res, next) {
  try {
    const { id } = req.params;
    const card = await query(`
      SELECT p.id, p.created_at, u.nome AS criado_por_nome
      FROM processos_compra p LEFT JOIN usuarios u ON u.id = p.criado_por
      WHERE p.id = $1
    `, [parseInt(id)]);
    if (!card.rows[0]) return res.status(404).json({ erro: 'Card não encontrado' });

    const itens = await query(`${ITEM_SELECT} WHERE i.processo_id = $1 ORDER BY i.id`, [parseInt(id)]);
    res.json({ processo: card.rows[0], itens: itens.rows });
  } catch (err) { next(err); }
}

// GET /compras/processos/:id/itens/:itemId — detalhe de 1 item + suas cotações
export async function detalharItem(req, res, next) {
  try {
    const { itemId } = req.params;
    const item = await query(`${ITEM_SELECT} WHERE i.id = $1`, [parseInt(itemId)]);
    if (!item.rows[0]) return res.status(404).json({ erro: 'Item não encontrado' });

    const cotacoes = await query(`
      SELECT ct.id, ct.fornecedor_id, ct.preco_unitario, ct.prazo_dias, ct.observacoes, ct.created_at,
             f.empresa AS fornecedor_empresa, u.nome AS criado_por_nome
      FROM cotacoes ct
      JOIN fornecedores f ON f.id = ct.fornecedor_id
      LEFT JOIN usuarios u ON u.id = ct.criado_por
      WHERE ct.item_processo_id = $1
      ORDER BY ct.preco_unitario ASC
    `, [parseInt(itemId)]);

    res.json({ item: item.rows[0], cotacoes: cotacoes.rows });
  } catch (err) { next(err); }
}

// POST /compras/processos — cria um card com 1 ou mais itens
export async function criarProcesso(req, res, next) {
  try {
    const dados = criarProcessoSchema.parse(req.body);
    const usuarioId = req.usuario.id;

    const materialIds = dados.itens.map(i => i.material_id);
    const materiaisResult = await query(
      `SELECT id, codigo, descricao, unidade FROM materiais WHERE id = ANY($1) AND ativo = TRUE`,
      [materialIds]
    );
    const materiaisMap = {};
    materiaisResult.rows.forEach(m => { materiaisMap[m.id] = m; });

    const naoEncontrados = materialIds.filter(id => !materiaisMap[id]);
    if (naoEncontrados.length > 0) {
      return res.status(400).json({ erro: `Material(is) não encontrado(s) ou inativo(s): ${naoEncontrados.join(', ')}` });
    }

    // Bloqueia duplicar material que já está aberto (não aprovado/cancelado) em outro card
    const existentes = await query(
      `SELECT material_id FROM itens_processo_compra
       WHERE material_id = ANY($1) AND status IN ('aguardando_cotacao', 'pronta_aprovar')`,
      [materialIds]
    );
    if (existentes.rows.length > 0) {
      const codigos = existentes.rows.map(r => materiaisMap[r.material_id]?.codigo || r.material_id);
      return res.status(409).json({ erro: `Já existe solicitação em aberto para: ${codigos.join(', ')}` });
    }

    const processoId = await transaction(async (client) => {
      const cardResult = await client.query(
        `INSERT INTO processos_compra (criado_por) VALUES ($1) RETURNING id`,
        [usuarioId]
      );
      const cardId = cardResult.rows[0].id;

      for (const item of dados.itens) {
        const material = materiaisMap[item.material_id];
        await client.query(
          `INSERT INTO itens_processo_compra
             (processo_id, material_id, quantidade_necessaria, codigo_snapshot, descricao_snapshot, unidade_snapshot)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [cardId, item.material_id, item.quantidade_necessaria, material.codigo, material.descricao, material.unidade]
        );
      }

      return cardId;
    });

    res.status(201).json({ processo_id: processoId });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ erro: err.errors[0].message });
    next(err);
  }
}

// POST /compras/processos/:id/itens/:itemId/cotacoes
export async function adicionarCotacao(req, res, next) {
  try {
    const { itemId } = req.params;
    const dados = criarCotacaoSchema.parse(req.body);
    const usuarioId = req.usuario.id;
    const itemProcessoId = parseInt(itemId);

    await transaction(async (client) => {
      const item = await client.query(`SELECT status FROM itens_processo_compra WHERE id = $1 FOR UPDATE`, [itemProcessoId]);
      if (!item.rows[0]) throw { status: 404, erro: 'Item não encontrado' };
      if (['aprovado', 'cancelada'].includes(item.rows[0].status)) {
        throw { status: 400, erro: 'Este item já foi encerrado, não é possível adicionar cotação' };
      }

      const fornecedor = await client.query(`SELECT id FROM fornecedores WHERE id = $1 AND ativo = TRUE`, [dados.fornecedor_id]);
      if (!fornecedor.rows[0]) throw { status: 404, erro: 'Fornecedor não encontrado' };

      await client.query(
        `INSERT INTO cotacoes (item_processo_id, fornecedor_id, preco_unitario, prazo_dias, observacoes, criado_por)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [itemProcessoId, dados.fornecedor_id, dados.preco_unitario, dados.prazo_dias || null, dados.observacoes || null, usuarioId]
      );

      const total = await client.query(`SELECT COUNT(*) FROM cotacoes WHERE item_processo_id = $1`, [itemProcessoId]);
      const novoStatus = parseInt(total.rows[0].count) >= MINIMO_COTACOES ? 'pronta_aprovar' : 'aguardando_cotacao';
      await client.query(`UPDATE itens_processo_compra SET status = $1 WHERE id = $2`, [novoStatus, itemProcessoId]);
    });

    res.status(201).json({ sucesso: true });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ erro: err.errors[0].message });
    if (err.status) return res.status(err.status).json({ erro: err.erro });
    next(err);
  }
}

// POST /compras/processos/:id/itens/:itemId/aprovar
export async function aprovarItem(req, res, next) {
  try {
    const { itemId } = req.params;
    const { cotacao_id } = req.body;
    const usuarioId = req.usuario.id;
    const itemProcessoId = parseInt(itemId);

    if (!cotacao_id) return res.status(400).json({ erro: 'Informe a cotação vencedora' });

    await transaction(async (client) => {
      const item = await client.query(`SELECT status FROM itens_processo_compra WHERE id = $1 FOR UPDATE`, [itemProcessoId]);
      if (!item.rows[0]) throw { status: 404, erro: 'Item não encontrado' };
      if (item.rows[0].status !== 'pronta_aprovar') {
        throw { status: 400, erro: `É preciso ter no mínimo ${MINIMO_COTACOES} cotações antes de aprovar` };
      }

      const cotacao = await client.query(
        `SELECT id, prazo_dias FROM cotacoes WHERE id = $1 AND item_processo_id = $2`,
        [parseInt(cotacao_id), itemProcessoId]
      );
      if (!cotacao.rows[0]) throw { status: 404, erro: 'Cotação não encontrada neste item' };

      const prazoDias = cotacao.rows[0].prazo_dias;

      await client.query(
        `UPDATE itens_processo_compra
         SET status = 'aprovado', cotacao_vencedora_id = $1, aprovado_por = $2, aprovado_em = NOW(),
             data_prevista_entrega = CASE WHEN $4::int IS NOT NULL THEN (CURRENT_DATE + $4::int) ELSE NULL END
         WHERE id = $3`,
        [parseInt(cotacao_id), usuarioId, itemProcessoId, prazoDias]
      );
    });

    res.json({ sucesso: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ erro: err.erro });
    next(err);
  }
}

// POST /compras/processos/:id/itens/:itemId/cancelar — cancela só este item
// PATCH /compras/processos/:id/itens/:itemId — edita a quantidade necessária
// (só permitido antes do item ser aprovado ou cancelado)
export async function editarQuantidadeItem(req, res, next) {
  try {
    const { itemId } = req.params;
    const { quantidade_necessaria } = req.body;

    if (!Number.isInteger(quantidade_necessaria) || quantidade_necessaria <= 0) {
      return res.status(400).json({ erro: 'Quantidade deve ser um número inteiro maior que zero' });
    }

    const result = await query(
      `UPDATE itens_processo_compra SET quantidade_necessaria = $1
       WHERE id = $2 AND status NOT IN ('aprovado', 'cancelada') RETURNING id`,
      [quantidade_necessaria, parseInt(itemId)]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ erro: 'Item não encontrado, ou já aprovado/cancelado — quantidade não pode mais ser alterada.' });
    }
    res.json({ sucesso: true });
  } catch (err) { next(err); }
}

export async function cancelarItem(req, res, next) {
  try {
    const { itemId } = req.params;
    const result = await query(
      `UPDATE itens_processo_compra SET status = 'cancelada' WHERE id = $1 AND entrada_id IS NULL RETURNING id`,
      [parseInt(itemId)]
    );
    if (result.rows.length === 0) return res.status(400).json({ erro: 'Item já com entrada confirmada não pode ser cancelado' });
    res.json({ sucesso: true });
  } catch (err) { next(err); }
}

// POST /compras/processos/:id/cancelar — cancela o card inteiro (todos os itens sem entrada confirmada)
export async function cancelarProcesso(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(
      `UPDATE itens_processo_compra SET status = 'cancelada' WHERE processo_id = $1 AND entrada_id IS NULL RETURNING id`,
      [parseInt(id)]
    );
    res.json({ sucesso: true, itens_cancelados: result.rows.length });
  } catch (err) { next(err); }
}

// DELETE /compras/processos/:id — exclui o card de vez (só se nada foi aprovado ainda)
export async function excluirProcesso(req, res, next) {
  try {
    const { id } = req.params;
    const recebidos = await query(
      `SELECT COUNT(*) FROM itens_processo_compra WHERE processo_id = $1 AND entrada_id IS NOT NULL`,
      [parseInt(id)]
    );
    if (parseInt(recebidos.rows[0].count) > 0) {
      return res.status(400).json({ erro: 'Este card tem itens já recebidos (entrada de estoque confirmada). Use "Cancelar" para os itens ainda pendentes; o histórico de compra recebida não pode ser excluído.' });
    }
    const result = await query(`DELETE FROM processos_compra WHERE id = $1 RETURNING id`, [parseInt(id)]);
    if (!result.rows[0]) return res.status(404).json({ erro: 'Card não encontrado' });
    res.json({ sucesso: true });
  } catch (err) { next(err); }
}

// GET /compras/acompanhamento — itens aprovados aguardando chegar (sem entrada confirmada ainda)
export async function listarAcompanhamento(req, res, next) {
  try {
    const result = await query(`
      SELECT
        i.id, i.processo_id, i.material_id, i.quantidade_necessaria,
        i.aprovado_em, i.data_prevista_entrega,
        COALESCE(m.codigo, i.codigo_snapshot)       AS material_codigo,
        COALESCE(m.descricao, i.descricao_snapshot) AS material_descricao,
        COALESCE(m.unidade, i.unidade_snapshot)     AS unidade,
        c.nome AS categoria_nome,
        f.empresa AS fornecedor_vencedor,
        ct.prazo_dias
      FROM itens_processo_compra i
      LEFT JOIN materiais m    ON m.id = i.material_id
      LEFT JOIN categorias c   ON c.id = m.categoria_id
      LEFT JOIN cotacoes ct    ON ct.id = i.cotacao_vencedora_id
      LEFT JOIN fornecedores f ON f.id = ct.fornecedor_id
      WHERE i.status = 'aprovado' AND i.entrada_id IS NULL
      ORDER BY i.data_prevista_entrega ASC NULLS LAST
    `);
    res.json({ itens: result.rows });
  } catch (err) { next(err); }
}

// POST /compras/processos/:id/itens/:itemId/confirmar-entrega
export async function confirmarEntrega(req, res, next) {
  try {
    const { itemId } = req.params;
    const { numero_nota_fiscal } = req.body;
    const usuarioId = req.usuario.id;
    const itemProcessoId = parseInt(itemId);

    if (!numero_nota_fiscal || !numero_nota_fiscal.trim()) {
      return res.status(400).json({ erro: 'Informe o número da nota fiscal' });
    }

    await transaction(async (client) => {
      const item = await client.query(
        `SELECT status, material_id, quantidade_necessaria, entrada_id, cotacao_vencedora_id
         FROM itens_processo_compra WHERE id = $1 FOR UPDATE`,
        [itemProcessoId]
      );
      if (!item.rows[0]) throw { status: 404, erro: 'Item não encontrado' };
      if (item.rows[0].status !== 'aprovado') throw { status: 400, erro: 'Item ainda não foi aprovado' };
      if (item.rows[0].entrada_id) throw { status: 400, erro: 'Entrega já confirmada para este item' };

      const { material_id, quantidade_necessaria, cotacao_vencedora_id } = item.rows[0];

      const cotacao = await client.query(
        `SELECT preco_unitario FROM cotacoes WHERE id = $1`,
        [cotacao_vencedora_id]
      );
      const valorUnitario = cotacao.rows[0]?.preco_unitario ?? null;

      const entrada = await client.query(
        `INSERT INTO entradas_estoque (material_id, quantidade, usuario_id, observacao, valor_unitario)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [material_id, quantidade_necessaria, usuarioId, `Compra aprovada (item #${itemProcessoId}) — NF ${numero_nota_fiscal.trim()}`, valorUnitario]
      );

      await client.query(
        `UPDATE estoques SET quantidade = quantidade + $1, updated_at = NOW() WHERE material_id = $2`,
        [quantidade_necessaria, material_id]
      );

      await client.query(
        `UPDATE itens_processo_compra
         SET numero_nota_fiscal = $1, entrada_id = $2, recebido_em = NOW()
         WHERE id = $3`,
        [numero_nota_fiscal.trim(), entrada.rows[0].id, itemProcessoId]
      );
    });

    res.json({ sucesso: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ erro: err.erro });
    next(err);
  }
}

// GET /compras/historico — itens aprovados, com a cotação vencedora
export async function historicoCompras(req, res, next) {
  try {
    const { data_inicio, data_fim, fornecedor_id, categoria_id } = req.query;
    const condicoes = [`i.status = 'aprovado'`, `i.entrada_id IS NOT NULL`];
    const params = [];
    let idx = 1;

    if (data_inicio)   { condicoes.push(`i.aprovado_em >= $${idx++}`); params.push(data_inicio); }
    if (data_fim)      { condicoes.push(`i.aprovado_em <= $${idx++}`); params.push(data_fim); }
    if (fornecedor_id) { condicoes.push(`ct.fornecedor_id = $${idx++}`); params.push(parseInt(fornecedor_id)); }
    if (categoria_id)  { condicoes.push(`m.categoria_id = $${idx++}`); params.push(parseInt(categoria_id)); }

    const sql = `
      SELECT
        i.id, i.quantidade_necessaria, i.aprovado_em,
        i.numero_nota_fiscal, i.recebido_em,
        COALESCE(m.codigo, i.codigo_snapshot)       AS material_codigo,
        COALESCE(m.descricao, i.descricao_snapshot) AS material_descricao,
        COALESCE(m.unidade, i.unidade_snapshot)      AS unidade,
        c.nome AS categoria_nome,
        f.empresa AS fornecedor_empresa,
        ct.preco_unitario, ct.prazo_dias,
        (ct.preco_unitario * i.quantidade_necessaria) AS total,
        u.nome AS aprovado_por_nome
      FROM itens_processo_compra i
      LEFT JOIN materiais m    ON m.id = i.material_id
      LEFT JOIN categorias c   ON c.id = m.categoria_id
      JOIN cotacoes ct         ON ct.id = i.cotacao_vencedora_id
      JOIN fornecedores f      ON f.id = ct.fornecedor_id
      LEFT JOIN usuarios u     ON u.id = i.aprovado_por
      WHERE ${condicoes.join(' AND ')}
      ORDER BY i.aprovado_em DESC
    `;

    const result = await query(sql, params);
    const totalGasto = result.rows.reduce((soma, r) => soma + parseFloat(r.total), 0);

    res.json({ compras: result.rows, total: result.rows.length, total_gasto: totalGasto });
  } catch (err) { next(err); }
}

// GET /compras/dashboard
// GET /compras/dashboard?ano=2026&mes=7 (mes é opcional)
export async function dashboardCompras(req, res, next) {
  try {
    const ano = parseInt(req.query.ano) || new Date().getFullYear();
    const mes = req.query.mes ? parseInt(req.query.mes) : null;

    const baseWhere = `i.status = 'aprovado' AND i.entrada_id IS NOT NULL AND EXTRACT(YEAR FROM i.recebido_em) = $1`;
    const params = mes ? [ano, mes] : [ano];
    const whereComMes = mes ? `${baseWhere} AND EXTRACT(MONTH FROM i.recebido_em) = $2` : baseWhere;

    const [pendentes, kpis, porMes, porCategoria, porSolicitante, porProduto, tabelaProdutos, reducaoPreco] = await Promise.all([
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'aguardando_cotacao') AS aguardando_cotacao,
          COUNT(*) FILTER (WHERE status = 'pronta_aprovar')     AS pronta_aprovar
        FROM itens_processo_compra
      `),
      query(`
        SELECT
          COALESCE(SUM(ct.preco_unitario * i.quantidade_necessaria), 0) AS gasto_total,
          COUNT(DISTINCT i.material_id) AS qtd_produtos,
          COUNT(DISTINCT m.categoria_id) AS qtd_categorias
        FROM itens_processo_compra i
        JOIN cotacoes ct ON ct.id = i.cotacao_vencedora_id
        LEFT JOIN materiais m ON m.id = i.material_id
        WHERE ${whereComMes}
      `, params),
      query(`
        SELECT EXTRACT(MONTH FROM i.recebido_em)::int AS mes,
               SUM(ct.preco_unitario * i.quantidade_necessaria) AS valor,
               SUM(i.quantidade_necessaria) AS quantidade
        FROM itens_processo_compra i
        JOIN cotacoes ct ON ct.id = i.cotacao_vencedora_id
        WHERE ${baseWhere}
        GROUP BY mes ORDER BY mes
      `, [ano]),
      query(`
        SELECT COALESCE(c.nome, 'Sem categoria') AS categoria,
               SUM(ct.preco_unitario * i.quantidade_necessaria) AS total_gasto
        FROM itens_processo_compra i
        LEFT JOIN materiais m  ON m.id = i.material_id
        LEFT JOIN categorias c ON c.id = m.categoria_id
        JOIN cotacoes ct ON ct.id = i.cotacao_vencedora_id
        WHERE ${whereComMes}
        GROUP BY c.nome
        ORDER BY total_gasto DESC
      `, params),
      query(`
        SELECT COALESCE(u.nome, 'Não identificado') AS solicitante,
               SUM(i.quantidade_necessaria) AS quantidade
        FROM itens_processo_compra i
        JOIN processos_compra p ON p.id = i.processo_id
        LEFT JOIN usuarios u ON u.id = p.criado_por
        JOIN cotacoes ct ON ct.id = i.cotacao_vencedora_id
        WHERE ${whereComMes}
        GROUP BY u.nome
        ORDER BY quantidade DESC
        LIMIT 10
      `, params),
      query(`
        SELECT COALESCE(m.codigo, i.codigo_snapshot) AS codigo,
               COALESCE(m.descricao, i.descricao_snapshot) AS descricao,
               SUM(i.quantidade_necessaria) AS quantidade
        FROM itens_processo_compra i
        LEFT JOIN materiais m ON m.id = i.material_id
        JOIN cotacoes ct ON ct.id = i.cotacao_vencedora_id
        WHERE ${whereComMes}
        GROUP BY COALESCE(m.codigo, i.codigo_snapshot), COALESCE(m.descricao, i.descricao_snapshot)
        ORDER BY quantidade DESC
        LIMIT 10
      `, params),
      query(`
        SELECT COALESCE(m.codigo, i.codigo_snapshot) AS codigo,
               COALESCE(m.descricao, i.descricao_snapshot) AS descricao,
               SUM(i.quantidade_necessaria) AS quantidade,
               SUM(ct.preco_unitario * i.quantidade_necessaria) AS valor_gasto
        FROM itens_processo_compra i
        LEFT JOIN materiais m ON m.id = i.material_id
        JOIN cotacoes ct ON ct.id = i.cotacao_vencedora_id
        WHERE ${whereComMes}
        GROUP BY COALESCE(m.codigo, i.codigo_snapshot), COALESCE(m.descricao, i.descricao_snapshot)
        ORDER BY valor_gasto DESC
        LIMIT 50
      `, params),
      // Redução de preço: compara a compra mais recente de cada item com a compra
      // imediatamente anterior a ela (não precisa estar no mesmo ano/mês filtrado,
      // a comparação é sempre sobre o histórico completo do item).
      query(`
        WITH compras_ordenadas AS (
          SELECT i.material_id,
                 COALESCE(m.codigo, i.codigo_snapshot) AS codigo,
                 COALESCE(m.descricao, i.descricao_snapshot) AS descricao,
                 ct.preco_unitario,
                 i.quantidade_necessaria,
                 i.recebido_em,
                 ROW_NUMBER() OVER (PARTITION BY i.material_id ORDER BY i.recebido_em DESC) AS rn
          FROM itens_processo_compra i
          LEFT JOIN materiais m ON m.id = i.material_id
          JOIN cotacoes ct ON ct.id = i.cotacao_vencedora_id
          WHERE i.status = 'aprovado' AND i.entrada_id IS NOT NULL
        ),
        comparacao AS (
          SELECT a.codigo, a.descricao,
                 a.preco_unitario AS preco_atual, a.recebido_em AS data_atual, a.quantidade_necessaria,
                 b.preco_unitario AS preco_anterior, b.recebido_em AS data_anterior
          FROM compras_ordenadas a
          JOIN compras_ordenadas b ON b.material_id = a.material_id AND b.rn = a.rn + 1
          WHERE a.rn = 1
        )
        SELECT codigo, descricao, preco_atual, preco_anterior, data_atual, data_anterior,
               (preco_anterior - preco_atual) AS reducao_unitaria,
               ROUND(((preco_anterior - preco_atual) / preco_anterior * 100)::numeric, 1) AS reducao_percentual,
               ((preco_anterior - preco_atual) * quantidade_necessaria) AS economia_estimada
        FROM comparacao
        WHERE preco_atual < preco_anterior AND EXTRACT(YEAR FROM data_atual) = $1
        ORDER BY reducao_percentual DESC
        LIMIT 20
      `, [ano]),
    ]);

    // Economia por mês (soma da economia_estimada de itens com redução, agrupado
    // pelo mês da compra mais recente que gerou a comparação)
    const economiaPorMesResult = await query(`
      WITH compras_ordenadas AS (
        SELECT i.material_id, ct.preco_unitario, i.quantidade_necessaria, i.recebido_em,
               ROW_NUMBER() OVER (PARTITION BY i.material_id ORDER BY i.recebido_em DESC) AS rn
        FROM itens_processo_compra i
        JOIN cotacoes ct ON ct.id = i.cotacao_vencedora_id
        WHERE i.status = 'aprovado' AND i.entrada_id IS NOT NULL
      ),
      comparacao AS (
        SELECT a.recebido_em AS data_atual, a.quantidade_necessaria,
               a.preco_unitario AS preco_atual, b.preco_unitario AS preco_anterior
        FROM compras_ordenadas a
        JOIN compras_ordenadas b ON b.material_id = a.material_id AND b.rn = a.rn + 1
        WHERE a.rn = 1
      )
      SELECT EXTRACT(MONTH FROM data_atual)::int AS mes,
             COALESCE(SUM((preco_anterior - preco_atual) * quantidade_necessaria), 0) AS economia
      FROM comparacao
      WHERE preco_atual < preco_anterior AND EXTRACT(YEAR FROM data_atual) = $1
      GROUP BY mes ORDER BY mes
    `, [ano]);

    res.json({
      ano, mes,
      pendentes:        pendentes.rows[0],
      gasto_total:      parseFloat(kpis.rows[0].gasto_total),
      qtd_produtos:     parseInt(kpis.rows[0].qtd_produtos),
      qtd_categorias:   parseInt(kpis.rows[0].qtd_categorias),
      por_mes:          porMes.rows,
      por_categoria:    porCategoria.rows,
      por_solicitante:  porSolicitante.rows,
      por_produto:      porProduto.rows,
      tabela_produtos:  tabelaProdutos.rows,
      reducao_preco:    reducaoPreco.rows,
      economia_por_mes: economiaPorMesResult.rows,
    });
  } catch (err) { next(err); }
}
