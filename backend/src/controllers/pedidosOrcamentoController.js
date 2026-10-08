// ============================================================
// controllers/pedidosOrcamentoController.js — Pedidos de Orçamento
// ============================================================
// V1: só a estrutura (3 colunas, criar/mover/editar/cancelar).
// Ainda sem puxar do Pipefy nem gerar pedido no ZenERP — isso vem
// em passos seguintes.

import { z } from 'zod';
import { query } from '../config/db.js';
import {
  pipefyQuery, listarCardsDaFase, extrairDadosOrcamento,
  buscarSituacaoCards, ORCAMENTO_PHASE_APROVADO_RECUSADO,
} from '../integrations/pipefyService.js';
import {
  criarPedidoVendaZen, consultarOrdemSeparacao, finalizarRomaneioZen,
  retirarPecasRecusadasZen, separarCodigos, excluirPedidoVendaZen, atualizarItensPedidoZen,
} from '../integrations/zenPedidoVenda.js';

const BASE_SELECT = `
  SELECT
    p.id, p.referencia, p.pipefy_card_id, p.pipefy_campos, p.pipefy_url,
    p.pipefy_sincronizado_em, p.status, p.observacoes,
    p.cliente_nome, p.cliente_cnpj, p.tecnico, p.frete_por_conta,
    p.entregue_por, p.ns_entrada, p.itens,
    p.zen_pedido_id, p.zen_ordem_separacao_id, p.zen_erro, p.zen_enviado_em, p.aprovacao,
    p.zen_romaneio_id, p.zen_nota_id,
    p.pecas_recusadas, p.recusadas_retiradas_em, p.itens_recusados, p.itens_alterados_em,
    p.created_at, p.atualizado_em,
    u.nome AS criado_por_nome
  FROM pedidos_orcamento p
  LEFT JOIN usuarios u ON u.id = p.criado_por
`;

// Colunas do Aprovado Parcial (migration 020) — cria se ainda não existirem
let colunasOk = null;
function garantirColunas() {
  if (!colunasOk) {
    colunasOk = (async () => {
      const r = await query(
        `SELECT COUNT(*)::int AS n FROM information_schema.columns
          WHERE table_name = 'pedidos_orcamento'
            AND column_name IN ('pecas_recusadas', 'recusadas_retiradas_em', 'itens_recusados', 'cancelado_status', 'itens_alterados_em')`
      );
      if (r.rows[0].n < 5) {
        await query(
          `ALTER TABLE pedidos_orcamento
              ADD COLUMN IF NOT EXISTS pecas_recusadas        TEXT,
              ADD COLUMN IF NOT EXISTS recusadas_retiradas_em TIMESTAMPTZ,
              ADD COLUMN IF NOT EXISTS itens_recusados        JSONB,
              ADD COLUMN IF NOT EXISTS cancelado_status       TEXT,
              ADD COLUMN IF NOT EXISTS itens_alterados_em     TIMESTAMPTZ`
        );
        console.log('✅ pedidos_orcamento: colunas do Aprovado Parcial criadas');
      }
    })().catch(err => { colunasOk = null; throw err; });
  }
  return colunasOk;
}

const criarSchema = z.object({
  referencia:  z.string().min(1, 'Informe uma referência'),
  observacoes: z.string().max(1000).optional().nullable(),
});

// GET /pedidos-orcamento
export async function listarPedidos(req, res, next) {
  try {
    await garantirColunas();
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
const STATUS_VALIDOS = ['solicitacao', 'separando', 'separado', 'aprovado_recusado', 'finalizado'];
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

    // Aprovado/Recusado -> Finalizado: finaliza o romaneio e cria a nota no Zen
    if (pedido.status === 'aprovado_recusado' && status === 'finalizado' && pedido.zen_ordem_separacao_id) {
      try {
        const fim = await finalizarRomaneioZen(pedido);
        await query(
          `UPDATE pedidos_orcamento SET zen_romaneio_id = $1, zen_nota_id = $2, zen_erro = NULL WHERE id = $3`,
          [fim.romaneioId, fim.notaId, pedido.id]
        );
      } catch (err) {
        console.error(`❌ ZenERP finalizar pedido orçamento #${pedido.id}:`, err.message);
        await query(
          `UPDATE pedidos_orcamento SET zen_erro = $1, atualizado_em = NOW() WHERE id = $2`,
          [err.message.slice(0, 1000), pedido.id]
        );
        return res.status(502).json({ erro: `Não foi possível finalizar no ZenERP: ${err.message}` });
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
    await garantirColunas();
    const cards = await listarCardsDaFase();
    let novos = 0, atualizados = 0;

    // Card que voltou pra "Requisitar Peças" depois de cancelado aqui (cancelado
    // já em andamento: separação, aprovado/recusado...) -> volta pra "Solicitado"
    // como um pedido novo, sem os vínculos antigos do Zen. Cancelado ainda em
    // "Solicitado" foi descartado de propósito e continua escondido.
    let reativados = 0;
    if (cards.length) {
      const r = await query(
        `UPDATE pedidos_orcamento
            SET status = 'solicitacao', cancelado_status = NULL,
                zen_pedido_id = NULL, zen_ordem_separacao_id = NULL, zen_romaneio_id = NULL,
                zen_nota_id = NULL, zen_erro = NULL, zen_enviado_em = NULL,
                aprovacao = NULL, pecas_recusadas = NULL, recusadas_retiradas_em = NULL,
                itens_recusados = NULL, atualizado_em = NOW()
          WHERE status = 'cancelado'
            AND COALESCE(cancelado_status, '') <> 'solicitacao'
            AND pipefy_card_id = ANY($1::text[])
          RETURNING id`,
        [cards.map(c => String(c.id))]
      );
      reativados = r.rowCount;
    }

    // Card já em andamento que voltou pra "Requisitar Peças" com as peças mudadas
    // (alguém reverteu no Pipefy e incluiu/tirou peça) -> marca pra atualizar no Zen
    const assinatura = (itens) => (Array.isArray(itens) ? itens : [])
      .filter(i => i?.codigo).map(i => `${String(i.codigo).trim().toUpperCase()}:${Number(i.quantidade) || 0}`)
      .sort().join('|');
    const existentes = new Map();
    if (cards.length) {
      const ex = await query(
        `SELECT id, pipefy_card_id, status, itens, zen_pedido_id, recusadas_retiradas_em
           FROM pedidos_orcamento WHERE pipefy_card_id = ANY($1::text[])`,
        [cards.map(c => String(c.id))]
      );
      for (const row of ex.rows) existentes.set(String(row.pipefy_card_id), row);
    }
    let alterados = 0;

    for (const card of cards) {
      const d = extrairDadosOrcamento(card);
      const antes = existentes.get(String(card.id));
      if (antes && antes.zen_pedido_id && !antes.recusadas_retiradas_em
          && ['separando', 'separado', 'aprovado_recusado'].includes(antes.status)
          && assinatura(antes.itens) !== assinatura(d.itens)) {
        await query(`UPDATE pedidos_orcamento SET itens_alterados_em = NOW() WHERE id = $1`, [antes.id]);
        alterados++;
      }
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
                       itens           = CASE WHEN pedidos_orcamento.recusadas_retiradas_em IS NULL
                                              THEN EXCLUDED.itens ELSE pedidos_orcamento.itens END,
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

    // Separando -> Separado: quando a reserva da ordem de separação é finalizada no Zen
    let separados = 0;
    const emSeparacao = await query(
      `SELECT id, zen_ordem_separacao_id FROM pedidos_orcamento
        WHERE status = 'separando' AND zen_ordem_separacao_id IS NOT NULL`
    );
    for (const p of emSeparacao.rows) {
      try {
        const situacao = await consultarOrdemSeparacao(p.zen_ordem_separacao_id);
        if (situacao.separado) {
          await query(
            `UPDATE pedidos_orcamento SET status = 'separado', atualizado_em = NOW() WHERE id = $1 AND status = 'separando'`,
            [p.id]
          );
          separados++;
        }
      } catch (err) {
        console.error(`⚠️ Não consegui consultar a ordem de separação ${p.zen_ordem_separacao_id}:`, err.message);
      }
    }

    // Card chegou em "Aprovado/Recusado" no Pipefy -> coluna Aprovado/Recusado,
    // com a tag do campo "Aprovação" (Aprovado / Aprovado Parcial / Recusado)
    // e o campo "Peças Recusadas". Pedido que já teve as peças recusadas
    // retiradas volta pra "Em Separação" e só segue depois de separado de novo.
    let aprovadosRecusados = 0;
    const acompanhados = await query(
      `SELECT id, pipefy_card_id FROM pedidos_orcamento
        WHERE pipefy_card_id IS NOT NULL
          AND status NOT IN ('finalizado', 'cancelado')
          AND NOT (recusadas_retiradas_em IS NOT NULL AND status IN ('solicitacao', 'separando'))
          AND (status <> 'aprovado_recusado' OR aprovacao IS NULL OR recusadas_retiradas_em IS NULL)`
    );
    if (acompanhados.rows.length) {
      try {
        const situacao = await buscarSituacaoCards(acompanhados.rows.map(p => p.pipefy_card_id));
        for (const p of acompanhados.rows) {
          const s = situacao.get(String(p.pipefy_card_id));
          if (s?.faseId === String(ORCAMENTO_PHASE_APROVADO_RECUSADO)) {
            await query(
              `UPDATE pedidos_orcamento
                  SET status = 'aprovado_recusado',
                      aprovacao = COALESCE($1, aprovacao),
                      pecas_recusadas = CASE WHEN recusadas_retiradas_em IS NULL THEN $2 ELSE pecas_recusadas END,
                      atualizado_em = CASE WHEN status <> 'aprovado_recusado' THEN NOW() ELSE atualizado_em END
                WHERE id = $3`,
              [s.aprovacao, s.pecasRecusadas, p.id]
            );
            aprovadosRecusados++;
          }
        }
      } catch (err) {
        console.error('⚠️ Não consegui consultar a fase dos cards no Pipefy:', err.message);
      }
    }

    res.json({ total: cards.length, novos, atualizados, reativados, alterados, separados, aprovadosRecusados });
  } catch (err) { next(err); }
}

// POST /pedidos-orcamento/:id/atualizar-itens-zen
// Peças do card mudaram no Pipefy depois do pedido já estar no Zen: desfaz a
// ordem de separação, acerta os itens do pedido de venda (inclui, tira e corrige
// quantidade), aprova de novo e gera nova ordem. O card volta pra "Em Separação".
export async function atualizarItensZen(req, res, next) {
  try {
    await garantirColunas();
    const atual = await query(
      `SELECT * FROM pedidos_orcamento WHERE id = $1 AND status != 'cancelado'`,
      [parseInt(req.params.id)]
    );
    const pedido = atual.rows[0];
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    if (!pedido.zen_pedido_id) return res.status(400).json({ erro: 'Pedido ainda não foi criado no Zen.' });
    if (!['separando', 'separado', 'aprovado_recusado'].includes(pedido.status)) {
      return res.status(400).json({ erro: 'Só dá pra atualizar as peças de pedidos em Em Separação, Separado ou Aprovado/Recusado.' });
    }

    let r;
    try {
      r = await atualizarItensPedidoZen(pedido);
    } catch (err) {
      console.error(`❌ ZenERP atualizar itens #${pedido.id}:`, err.message);
      await query(`UPDATE pedidos_orcamento SET zen_erro = $1, atualizado_em = NOW() WHERE id = $2`,
        [err.message.slice(0, 1000), pedido.id]);
      return res.status(502).json({ erro: `Não foi possível atualizar as peças no ZenERP: ${err.message}` });
    }

    if (r.semAlteracao) {
      await query(`UPDATE pedidos_orcamento SET itens_alterados_em = NULL, zen_erro = NULL WHERE id = $1`, [pedido.id]);
      return res.json({ sucesso: true, sem_alteracao: true });
    }

    await query(
      `UPDATE pedidos_orcamento
          SET zen_ordem_separacao_id = $1, zen_romaneio_id = NULL, zen_nota_id = NULL, zen_erro = NULL,
              itens_alterados_em = NULL, aprovacao = NULL, pecas_recusadas = NULL,
              status = 'separando', atualizado_em = NOW()
        WHERE id = $2`,
      [r.ordemSeparacaoId, pedido.id]
    );
    res.json({
      sucesso: true,
      zen_ordem_separacao_id: r.ordemSeparacaoId,
      adicionados: r.adicionados, removidos: r.removidos, alterados: r.alterados,
    });
  } catch (err) { next(err); }
}

// POST /pedidos-orcamento/:id/retirar-recusadas — Aprovado Parcial
// Cancela a ordem de separação no Zen, tira as peças do campo "Peças Recusadas"
// do pedido de venda, aprova de novo e gera uma nova ordem de separação.
// O card volta pra "Em Separação".
export async function retirarRecusadas(req, res, next) {
  try {
    await garantirColunas();
    const atual = await query(
      `SELECT * FROM pedidos_orcamento WHERE id = $1 AND status != 'cancelado'`,
      [parseInt(req.params.id)]
    );
    const pedido = atual.rows[0];
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    if (pedido.status !== 'aprovado_recusado') {
      return res.status(400).json({ erro: 'Só dá pra retirar peças de pedidos na coluna Aprovado/Recusado.' });
    }
    if (pedido.recusadas_retiradas_em) {
      return res.status(400).json({ erro: 'As peças recusadas deste pedido já foram retiradas.' });
    }
    if (!pedido.zen_pedido_id) return res.status(400).json({ erro: 'Pedido sem pedido de venda no Zen.' });

    // Lê o card de novo no Pipefy pra pegar o campo "Peças Recusadas" atualizado
    let aprovacao = pedido.aprovacao;
    let pecasRecusadas = pedido.pecas_recusadas;
    if (pedido.pipefy_card_id) {
      try {
        const s = (await buscarSituacaoCards([pedido.pipefy_card_id])).get(String(pedido.pipefy_card_id));
        if (s) { aprovacao = s.aprovacao || aprovacao; pecasRecusadas = s.pecasRecusadas ?? pecasRecusadas; }
      } catch (err) {
        console.error('⚠️ Pipefy (peças recusadas):', err.message);
      }
    }
    if (!/parcial/i.test(String(aprovacao || ''))) {
      return res.status(400).json({ erro: `O card está como "${aprovacao || 'sem aprovação'}" — esse botão é só para Aprovado Parcial.` });
    }

    const codigos = separarCodigos(pecasRecusadas);
    if (codigos.length === 0) {
      return res.status(400).json({ erro: 'O campo "Peças Recusadas" do card no Pipefy está vazio.' });
    }
    const doPedido = new Set((pedido.itens || []).map(i => String(i.codigo || '').trim().toUpperCase()));
    const naoEncontrados = codigos.filter(c => !doPedido.has(c));
    if (naoEncontrados.length) {
      return res.status(400).json({
        erro: `Código(s) em "Peças Recusadas" que não estão no pedido: ${naoEncontrados.join(', ')}. Corrija no Pipefy e tente de novo.`,
      });
    }

    let r;
    try {
      r = await retirarPecasRecusadasZen(pedido, codigos);
    } catch (err) {
      console.error(`❌ ZenERP retirar recusadas #${pedido.id}:`, err.message);
      await query(
        `UPDATE pedidos_orcamento SET zen_erro = $1, pecas_recusadas = $2, atualizado_em = NOW() WHERE id = $3`,
        [err.message.slice(0, 1000), pecasRecusadas, pedido.id]
      );
      return res.status(502).json({ erro: `Não foi possível retirar as peças no ZenERP: ${err.message}` });
    }

    const recusados = new Set(codigos);
    const itensRecusados = (pedido.itens || []).filter(i => recusados.has(String(i.codigo || '').trim().toUpperCase()));
    await query(
      `UPDATE pedidos_orcamento
          SET itens = $1::jsonb, itens_recusados = $2::jsonb, pecas_recusadas = $3,
              recusadas_retiradas_em = NOW(), zen_ordem_separacao_id = $4,
              zen_romaneio_id = NULL, zen_nota_id = NULL, zen_erro = NULL,
              status = 'separando', atualizado_em = NOW()
        WHERE id = $5`,
      [JSON.stringify(r.itensAprovados), JSON.stringify(itensRecusados), pecasRecusadas, r.ordemSeparacaoId, pedido.id]
    );

    res.json({
      sucesso: true,
      zen_ordem_separacao_id: r.ordemSeparacaoId,
      ordem_cancelada: r.ordemCancelada,
      itens_retirados: r.itensRetirados,
    });
  } catch (err) { next(err); }
}

// POST /pedidos-orcamento/:id/cancelar
// Na coluna Aprovado/Recusado: desfaz tudo no Zen (separação, reserva,
// aprovação) e exclui o pedido de venda antes de cancelar o card.
export async function cancelarPedido(req, res, next) {
  try {
    await garantirColunas();
    const atual = await query(
      `SELECT * FROM pedidos_orcamento WHERE id = $1 AND status != 'cancelado'`,
      [parseInt(req.params.id)]
    );
    const pedido = atual.rows[0];
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });

    let zenExcluido = false;
    if (pedido.status === 'aprovado_recusado' && pedido.zen_pedido_id) {
      try {
        const r = await excluirPedidoVendaZen(pedido);
        zenExcluido = r.excluido;
      } catch (err) {
        console.error(`❌ ZenERP excluir pedido orçamento #${pedido.id}:`, err.message);
        await query(
          `UPDATE pedidos_orcamento SET zen_erro = $1, atualizado_em = NOW() WHERE id = $2`,
          [err.message.slice(0, 1000), pedido.id]
        );
        return res.status(502).json({ erro: `Não foi possível excluir o pedido no ZenERP: ${err.message}` });
      }
    }

    await query(
      `UPDATE pedidos_orcamento SET status = 'cancelado', cancelado_status = $2, zen_erro = NULL, atualizado_em = NOW() WHERE id = $1`,
      [pedido.id, pedido.status]
    );
    res.json({ sucesso: true, zen_excluido: zenExcluido, zen_pedido_id: pedido.zen_pedido_id || null });
  } catch (err) { next(err); }
}
