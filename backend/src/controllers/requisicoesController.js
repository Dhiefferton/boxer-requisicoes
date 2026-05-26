// ============================================================
// controllers/requisicoesController.js — Requisições
// ============================================================

import { z } from 'zod';
import { query, transaction } from '../config/db.js';

const criarRequisicaoSchema = z.object({
  data_necessidade: z.string().optional().nullable(),
  observacoes:      z.string().max(1000).optional().nullable(),
  itens: z.array(z.object({
    material_id: z.number().int().positive(),
    quantidade:  z.number().int().positive('Quantidade deve ser maior que zero'),
  })).min(1, 'A requisição precisa ter pelo menos 1 item'),
});

const mudarStatusSchema = z.object({
  status:     z.enum(['solicitado', 'em_separacao', 'separado', 'entregue', 'cancelado']),
  observacao: z.string().max(500).optional().nullable(),
});

// POST /requisicoes
export async function criarRequisicao(req, res, next) {
  try {
    const dados = criarRequisicaoSchema.parse(req.body);
    const usuarioId = req.usuario.id;

    const materialIds = dados.itens.map(i => i.material_id);
    const materiaisResult = await query(
      `SELECT id, codigo, descricao, unidade FROM materiais WHERE id = ANY($1) AND ativo = TRUE`,
      [materialIds]
    );

    const materaisMap = {};
    materiaisResult.rows.forEach(m => { materaisMap[m.id] = m; });

    const naoEncontrados = materialIds.filter(id => !materaisMap[id]);
    if (naoEncontrados.length > 0) {
      return res.status(400).json({
        erro: `Material(is) não encontrado(s) ou inativo(s): ${naoEncontrados.join(', ')}`
      });
    }

    const requisicao = await transaction(async (client) => {
      const reqResult = await client.query(
        `INSERT INTO requisicoes
           (usuario_id, departamento_id, data_necessidade, observacoes, status)
         VALUES ($1, $2, $3, $4, 'solicitado')
         RETURNING *`,
        [
          usuarioId,
          req.usuario.departamento_id,
          dados.data_necessidade || null,
          dados.observacoes || null,
        ]
      );
      const req_ = reqResult.rows[0];

      for (const item of dados.itens) {
        const material = materaisMap[item.material_id];
        await client.query(
          `INSERT INTO itens_requisicao
             (requisicao_id, material_id, quantidade,
              descricao_snapshot, unidade_snapshot, codigo_snapshot)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            req_.id, item.material_id, item.quantidade,
            material.descricao, material.unidade, material.codigo,
          ]
        );
      }

      await client.query(
        `INSERT INTO historico_status
           (requisicao_id, status_anterior, status_novo, usuario_id, observacao)
         VALUES ($1, NULL, 'solicitado', $2, 'Requisição criada')`,
        [req_.id, usuarioId]
      );

      return req_;
    });

    await query(
      `INSERT INTO logs (usuario_id, acao, tabela, registro_id, ip)
       VALUES ($1, 'CRIAR_REQUISICAO', 'requisicoes', $2, $3)`,
      [usuarioId, requisicao.id, req.ip]
    );

    res.status(201).json({
      mensagem: 'Requisição criada com sucesso!',
      requisicao: { id: requisicao.id, status: requisicao.status, created_at: requisicao.created_at }
    });

  } catch (err) {
    next(err);
  }
}

// GET /requisicoes
export async function listarRequisicoes(req, res, next) {
  try {
    const { status, pagina = 1, limite = 20 } = req.query;
    const offset = (parseInt(pagina) - 1) * parseInt(limite);
    const { id: usuarioId, perfil } = req.usuario;

    const condicoes = [];
    const params = [];
    let idx = 1;

    if (perfil === 'colaborador') {
      condicoes.push(`usuario_id = $${idx++}`);
      params.push(usuarioId);
    }

    if (status) {
      condicoes.push(`status = $${idx++}`);
      params.push(status);
    }

    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';

    const sql = `
      SELECT id, status, data_necessidade, observacoes, created_at, updated_at,
             solicitante_nome, solicitante_email, departamento_nome, total_itens
      FROM vw_requisicoes
      ${where}
      ORDER BY created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;

    params.push(parseInt(limite), offset);

    const countSql = `SELECT COUNT(*) FROM vw_requisicoes ${where}`;
    const countParams = params.slice(0, -2);

    const [result, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, countParams),
    ]);

    res.json({
      requisicoes: result.rows,
      total:       parseInt(countResult.rows[0].count),
      pagina:      parseInt(pagina),
      limite:      parseInt(limite),
    });

  } catch (err) {
    next(err);
  }
}

// GET /requisicoes/:id
export async function detalharRequisicao(req, res, next) {
  try {
    const { id } = req.params;
    const { id: usuarioId, perfil } = req.usuario;

    const result = await query(
      `SELECT * FROM vw_requisicoes WHERE id = $1`,
      [parseInt(id)]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ erro: 'Requisição não encontrada.' });
    }

    const requisicao = result.rows[0];

    if (perfil === 'colaborador' && requisicao.usuario_id !== usuarioId) {
      return res.status(403).json({ erro: 'Acesso negado.' });
    }

    const itensResult = await query(
      `SELECT ir.id, ir.quantidade,
              ir.descricao_snapshot, ir.unidade_snapshot, ir.codigo_snapshot,
              ir.material_id
       FROM itens_requisicao ir
       WHERE ir.requisicao_id = $1`,
      [parseInt(id)]
    );

    const historicoResult = await query(
      `SELECT hs.status_anterior, hs.status_novo, hs.observacao, hs.created_at,
              u.nome AS usuario_nome
       FROM historico_status hs
       LEFT JOIN usuarios u ON u.id = hs.usuario_id
       WHERE hs.requisicao_id = $1
       ORDER BY hs.created_at ASC`,
      [parseInt(id)]
    );

    res.json({
      requisicao: {
        ...requisicao,
        itens:      itensResult.rows,
        historico:  historicoResult.rows,
      }
    });

  } catch (err) {
    next(err);
  }
}

// PATCH /requisicoes/:id/status
export async function mudarStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status, observacao } = mudarStatusSchema.parse(req.body);
    const usuarioId = req.usuario.id;

    const atual = await query(
      `SELECT id, status FROM requisicoes WHERE id = $1`,
      [parseInt(id)]
    );

    if (!atual.rows[0]) {
      return res.status(404).json({ erro: 'Requisição não encontrada.' });
    }

    const statusAnterior = atual.rows[0].status;

    if (statusAnterior === status) {
      return res.status(400).json({ erro: `A requisição já está com status "${status}".` });
    }

    // ── CANCELAMENTO: devolve estoque e exclui a requisição ──
    if (status === 'cancelado') {
      await transaction(async (client) => {
        // Busca os itens para devolver ao estoque
        const itens = await client.query(
          `SELECT material_id, quantidade FROM itens_requisicao WHERE requisicao_id = $1`,
          [parseInt(id)]
        );

        // Devolve o saldo ao estoque de cada item
        for (const item of itens.rows) {
          await client.query(
            `UPDATE estoques
             SET quantidade = quantidade + $1, updated_at = NOW()
             WHERE material_id = $2`,
            [item.quantidade, item.material_id]
          );
        }

        // Exclui itens, histórico e a requisição
        await client.query(`DELETE FROM historico_status WHERE requisicao_id = $1`, [parseInt(id)]);
        await client.query(`DELETE FROM itens_requisicao WHERE requisicao_id = $1`, [parseInt(id)]);
        await client.query(`DELETE FROM requisicoes WHERE id = $1`, [parseInt(id)]);
      });

      await query(
        `INSERT INTO logs (usuario_id, acao, tabela, registro_id, payload_json, ip)
         VALUES ($1, 'CANCELAR_REQUISICAO', 'requisicoes', $2, $3, $4)`,
        [
          usuarioId, parseInt(id),
          JSON.stringify({ status_anterior: statusAnterior, observacao }),
          req.ip
        ]
      );

      return res.json({ mensagem: 'Requisição cancelada e estoque devolvido com sucesso.', excluida: true });
    }

    // ── OUTROS STATUS: apenas atualiza ──
    await transaction(async (client) => {
      await client.query(
        `UPDATE requisicoes SET status = $1, updated_at = NOW() WHERE id = $2`,
        [status, parseInt(id)]
      );

      await client.query(
        `INSERT INTO historico_status
           (requisicao_id, status_anterior, status_novo, usuario_id, observacao)
         VALUES ($1, $2, $3, $4, $5)`,
        [parseInt(id), statusAnterior, status, usuarioId, observacao || null]
      );
    });

    await query(
      `INSERT INTO logs (usuario_id, acao, tabela, registro_id, payload_json, ip)
       VALUES ($1, 'MUDAR_STATUS', 'requisicoes', $2, $3, $4)`,
      [
        usuarioId, parseInt(id),
        JSON.stringify({ status_anterior: statusAnterior, status_novo: status }),
        req.ip
      ]
    );

    res.json({ mensagem: `Status atualizado para "${status}" com sucesso.` });

  } catch (err) {
    next(err);
  }
}
