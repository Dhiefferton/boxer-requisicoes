// ============================================================
// controllers/pedidosOrcamentoController.js — Pedidos de Orçamento
// ============================================================
// V1: só a estrutura (3 colunas, criar/mover/editar/cancelar).
// Ainda sem puxar do Pipefy nem gerar pedido no ZenERP — isso vem
// em passos seguintes.

import { z } from 'zod';
import { query } from '../config/db.js';
import { pipefyQuery, listarCardsDaFase, extrairDadosOrcamento } from '../integrations/pipefyService.js';
import { criarPedidoVendaZen } from '../integrations/zenPedidoVenda.js';

const BASE_SELECT = `
  SELECT
    p.id, p.referencia, p.pipefy_card_id, p.pipefy_campos, p.pipefy_url,
    p.pipefy_sincronizado_em, p.status, p.observacoes,
    p.cliente_nome, p.cliente_cnpj, p.tecnico, p.frete_por_conta,
    p.entregue_por, p.ns_entrada, p.itens,
    p.zen_pedido_id, p.zen_ordem_separacao_id, p.zen_erro, p.zen_enviado_em,
    p.created_at, p.atualizado_em,
    u.nome AS criado_por_nome
  FROM pedidos_orcamento p
  LEFT JOIN usuarios u ON u.id = p.criado_por
`;

const criarSchema = z.object({
  referencia:  z.string().min(1, 'Informe uma referência'),
  observacoes: z.string().max(1000).optional().nullable(),
});

// GET /pedidos-orcamento
export async function listarPedidos(req, res, next) {
  try {
    const result = await query(`${BASE_SELECT} WHERE p.status != 'cancelado' ORDER BY p.created_at DESC`);
    res.json({ pedidos: result.rows });
  } catch (err) { next(err); }
}

// POST /pedidos-orcamento — cria no status 'solicitacao'
export async function criarPedido(req, res, next) {
  try {
    const dados = criarSchema.parse(req.body);
    const usuarioId = req.usuario.id;

    const result = await query(
      `INSERT INTO pedidos_orcamento (referencia, observacoes, criado_por) VALUES ($1, $2, $3) RETURNING id`,
      [dados.referencia.trim(), dados.observacoes || null, usuarioId]
    );

    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ erro: err.errors[0].message });
    next(err);
  }
}

// PATCH /pedidos-orcamento/:id/mover — avança/retrocede de coluna
const STATUS_VALIDOS = ['solicitacao', 'separando', 'finalizado'];
export async function moverPedido(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!STATUS_VALIDOS.includes(status)) {
      return res.status(400).json({ erro: `Status inválido. Use: ${STATUS_VALIDOS.join(', ')}` });
    }
    const atual = await query(
      `SELECT * FROM pedidos_orcamento WHERE id = $1 AND status != 'cancelado'`,
      [parseInt(id)]
    );
    const pedido = atual.rows[0];
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });

    // Solicitação -> Separando: cria o pedido de venda no ZenERP antes de mover.
    // Se o Zen falhar, o card fica onde está e o erro aparece na tela.
    let zen = null;
    if (pedido.status === 'solicitacao' && status === 'separando' && pedido.pipefy_card_id) {
      try {
        zen = await criarPedidoVendaZen(pedido);
        await query(
          `UPDATE pedidos_orcamento SET zen_pedido_id = $1, zen_ordem_separacao_id = $2, zen_erro = NULL, zen_enviado_em = NOW() WHERE id = $3`,
          [zen.zenPedidoId, zen.ordemSeparacaoId, pedido.id]
        );
      } catch (err) {
        console.error(`❌ ZenERP pedido orçamento #${pedido.id}:`, err.message);
        await query(
          `UPDATE pedidos_orcamento SET zen_pedido_id = COALESCE($1, zen_pedido_id), zen_erro = $2, atualizado_em = NOW() WHERE id = $3`,
          [err.zenPedidoId || null, err.message.slice(0, 1000), pedido.id]
        );
        return res.status(502).json({ erro: `Não foi possível criar o pedido no ZenERP: ${err.message}` });
      }
    }

    await query(
      `UPDATE pedidos_orcamento SET status = $1, atualizado_em = NOW() WHERE id = $2`,
      [status, pedido.id]
    );
    res.json({
      sucesso: true,
      zen_pedido_id: zen?.zenPedidoId || pedido.zen_pedido_id || null,
      zen_ordem_separacao_id: zen?.ordemSeparacaoId || pedido.zen_ordem_separacao_id || null,
    });
  } catch (err) { next(err); }
}

// PATCH /pedidos-orcamento/:id — edita referência/observações
export async function editarPedido(req, res, next) {
  try {
    const { id } = req.params;
    const { referencia, observacoes } = req.body;

    const campos = [];
    const valores = [];
    let idx = 1;
    if (typeof referencia === 'string' && referencia.trim()) { campos.push(`referencia = $${idx++}`); valores.push(referencia.trim()); }
    if (typeof observacoes === 'string') { campos.push(`observacoes = $${idx++}`); valores.push(observacoes); }
    if (campos.length === 0) return res.status(400).json({ erro: 'Nada para atualizar.' });

    campos.push(`atualizado_em = NOW()`);
    valores.push(parseInt(id));
    const result = await query(
      `UPDATE pedidos_orcamento SET ${campos.join(', ')} WHERE id = $${idx} AND status != 'cancelado' RETURNING id`,
      valores
    );
    if (!result.rows[0]) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    res.json({ sucesso: true });
  } catch (err) { next(err); }
}

// DIAGNÓSTICO — GET /pedidos-orcamento/pipefy-pipes
// Lista os pipes da organização Boxer Soldas no Pipefy, com suas fases,
// pra achar o pipe_id de "Orçamento BOXER SOLDAS" e o phase_id de
// "Requisitar peças". Só consulta, não mexe em nada. Admin only.
export async function listarPipesPipefy(req, res, next) {
  try {
    const gql = `
      query {
        organization(id: 327351) {
          name
          pipes {
            id
            name
            phases { id name }
          }
        }
      }
    `;
    const data = await pipefyQuery(gql);
    res.json(data);
  } catch (err) { next(err); }
}

// POST /pedidos-orcamento/sincronizar-pipefy — botão "Atualizar do Pipefy"
// Puxa os cards da fase "Requisitar Peças" do pipe "Orçamento BOXER SOLDAS".
// Card novo entra em 'solicitacao'; card já existente só tem título/campos
// atualizados (status no app não é alterado).
export async function sincronizarPipefy(req, res, next) {
  try {
    const cards = await listarCardsDaFase();
    let novos = 0, atualizados = 0;

    for (const card of cards) {
      const d = extrairDadosOrcamento(card);
      const result = await query(
        `INSERT INTO pedidos_orcamento
           (referencia, pipefy_card_id, pipefy_campos, pipefy_url, pipefy_sincronizado_em,
            cliente_nome, cliente_cnpj, tecnico, frete_por_conta, entregue_por, ns_entrada, itens,
            criado_por, created_at)
         VALUES ($1, $2, $3::jsonb, $4, NOW(), $5, $6, $7, $8, $9, $10, $11::jsonb, $12,
                 COALESCE($13::timestamptz, NOW()))
         ON CONFLICT (pipefy_card_id) WHERE pipefy_card_id IS NOT NULL
         DO UPDATE SET referencia      = EXCLUDED.referencia,
                       pipefy_campos   = EXCLUDED.pipefy_campos,
                       pipefy_url      = EXCLUDED.pipefy_url,
                       cliente_nome    = EXCLUDED.cliente_nome,
                       cliente_cnpj    = EXCLUDED.cliente_cnpj,
                       tecnico         = EXCLUDED.tecnico,
                       frete_por_conta = EXCLUDED.frete_por_conta,
                       entregue_por    = EXCLUDED.entregue_por,
                       ns_entrada      = EXCLUDED.ns_entrada,
                       itens           = EXCLUDED.itens,
                       pipefy_sincronizado_em = NOW()
         RETURNING (xmax = 0) AS inserido`,
        [
          (d.cliente_nome || card.titulo || `Card ${card.id}`).slice(0, 255),
          card.id,
          JSON.stringify(card.campos),
          card.url || null,
          d.cliente_nome,
          d.cliente_cnpj,
          d.tecnico,
          d.frete_por_conta,
          d.entregue_por,
          d.ns_entrada,
          JSON.stringify(d.itens),
          req.usuario.id,
          card.criadoEm || null,
        ]
      );
      if (result.rows[0]?.inserido) novos++; else atualizados++;
    }

    res.json({ total: cards.length, novos, atualizados });
  } catch (err) { next(err); }
}

// POST /pedidos-orcamento/:id/cancelar
export async function cancelarPedido(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(
      `UPDATE pedidos_orcamento SET status = 'cancelado', atualizado_em = NOW() WHERE id = $1 RETURNING id`,
      [parseInt(id)]
    );
    if (!result.rows[0]) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    res.json({ sucesso: true });
  } catch (err) { next(err); }
}
