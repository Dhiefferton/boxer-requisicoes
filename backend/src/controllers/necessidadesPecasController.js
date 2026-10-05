// ============================================================
// controllers/necessidadesPecasController.js — Necessidade de Peças
// ============================================================
// Fluxo em 3 colunas: Solicitado -> Em andamento (revisão: define
// frete marítimo/aéreo) -> Aprovado (botão de envio a outro sistema,
// destino ainda não definido — o payload fica guardado localmente
// até a integração real ser plugada).

import { z } from 'zod';
import { query, transaction } from '../config/db.js';

const BASE_SELECT = `
  SELECT
    n.id, n.material_id, n.quantidade, n.status,
    n.frete_maritimo, n.frete_aereo, n.observacoes,
    n.solicitado_em, n.revisado_em, n.aprovado_em,
    n.enviado_outro_sistema, n.enviado_em, n.relatorio_id,
    COALESCE(m.codigo, n.codigo_snapshot)       AS codigo,
    COALESCE(m.descricao, n.descricao_snapshot) AS descricao,
    u_sol.nome AS solicitado_por_nome,
    u_rev.nome AS revisado_por_nome,
    u_apr.nome AS aprovado_por_nome
  FROM necessidades_pecas n
  LEFT JOIN materiais m        ON m.id = n.material_id
  LEFT JOIN usuarios u_sol     ON u_sol.id = n.solicitado_por
  LEFT JOIN usuarios u_rev     ON u_rev.id = n.revisado_por
  LEFT JOIN usuarios u_apr     ON u_apr.id = n.aprovado_por
`;

const criarSchema = z.object({
  codigo:     z.string().min(1, 'Informe o código'),
  quantidade: z.number().int().positive('Quantidade deve ser maior que zero'),
});

// GET /necessidades-pecas — lista tudo (não arquiva cancelado, mas o front separa por status)
export async function listarNecessidades(req, res, next) {
  try {
    const result = await query(`${BASE_SELECT} WHERE n.status != 'cancelado' ORDER BY n.created_at DESC`);
    res.json({ necessidades: result.rows });
  } catch (err) { next(err); }
}

// POST /necessidades-pecas — cria no status 'solicitado'
// O código precisa já existir no catálogo (puxa descrição de lá, não aceita código novo).
export async function criarNecessidade(req, res, next) {
  try {
    const dados = criarSchema.parse(req.body);
    const usuarioId = req.usuario.id;

    const material = await query(
      `SELECT id, codigo, descricao FROM materiais WHERE codigo = $1 AND ativo = TRUE`,
      [dados.codigo.trim()]
    );
    if (!material.rows[0]) {
      return res.status(404).json({ erro: `Código "${dados.codigo}" não encontrado no catálogo.` });
    }
    const m = material.rows[0];

    const result = await query(
      `INSERT INTO necessidades_pecas (material_id, quantidade, codigo_snapshot, descricao_snapshot, solicitado_por)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [m.id, dados.quantidade, m.codigo, m.descricao, usuarioId]
    );

    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ erro: err.errors[0].message });
    next(err);
  }
}

// POST /necessidades-pecas/:id/iniciar-revisao — move Solicitado -> Em andamento
export async function iniciarRevisao(req, res, next) {
  try {
    const { id } = req.params;
    const usuarioId = req.usuario.id;
    const result = await query(
      `UPDATE necessidades_pecas SET status = 'em_andamento', revisado_por = $1, revisado_em = NOW()
       WHERE id = $2 AND status = 'solicitado' RETURNING id`,
      [usuarioId, parseInt(id)]
    );
    if (!result.rows[0]) return res.status(400).json({ erro: 'Item não encontrado ou não está mais em "Solicitado".' });
    res.json({ sucesso: true });
  } catch (err) { next(err); }
}

// PATCH /necessidades-pecas/:id — edita frete/observações (só enquanto em_andamento)
export async function editarNecessidade(req, res, next) {
  try {
    const { id } = req.params;
    const { frete_maritimo, frete_aereo, observacoes, quantidade } = req.body;

    const campos = [];
    const valores = [];
    let idx = 1;
    if (typeof frete_maritimo === 'boolean') { campos.push(`frete_maritimo = $${idx++}`); valores.push(frete_maritimo); }
    if (typeof frete_aereo === 'boolean')    { campos.push(`frete_aereo = $${idx++}`);    valores.push(frete_aereo); }
    if (typeof observacoes === 'string')     { campos.push(`observacoes = $${idx++}`);    valores.push(observacoes); }
    if (Number.isInteger(quantidade) && quantidade > 0) { campos.push(`quantidade = $${idx++}`); valores.push(quantidade); }

    if (campos.length === 0) return res.status(400).json({ erro: 'Nada para atualizar.' });

    valores.push(parseInt(id));
    const result = await query(
      `UPDATE necessidades_pecas SET ${campos.join(', ')}
       WHERE id = $${idx} AND status = 'em_andamento' RETURNING id`,
      valores
    );
    if (!result.rows[0]) return res.status(400).json({ erro: 'Item não encontrado ou não está mais em "Em andamento".' });
    res.json({ sucesso: true });
  } catch (err) { next(err); }
}

// POST /necessidades-pecas/:id/aprovar — move Em andamento -> Aprovado
// POST /necessidades-pecas/:id/recusar — recusa (Em andamento -> arquivado como "recusado")
export async function recusarNecessidade(req, res, next) {
  try {
    const { id } = req.params;
    const usuarioId = req.usuario.id;
    const result = await query(
      `UPDATE necessidades_pecas SET status = 'recusado', revisado_por = $1, revisado_em = NOW()
       WHERE id = $2 AND status = 'em_andamento' RETURNING id`,
      [usuarioId, parseInt(id)]
    );
    if (!result.rows[0]) return res.status(400).json({ erro: 'Item não encontrado ou não está mais em "Em andamento".' });
    res.json({ sucesso: true });
  } catch (err) { next(err); }
}

// Quantidade aprovada = quantidade solicitada × 6
const MULTIPLICADOR_APROVACAO = 6;

export async function aprovarNecessidade(req, res, next) {
  try {
    const { id } = req.params;
    const usuarioId = req.usuario.id;
    // Regra: ao aprovar, a quantidade é multiplicada por 6.
    // Usa a quantidade que está na tela (se veio) pra não perder uma edição ainda não salva.
    const qtdTela = parseInt(req.body?.quantidade, 10);
    const result = await query(
      `UPDATE necessidades_pecas
          SET status = 'aprovado', aprovado_por = $1, aprovado_em = NOW(),
              quantidade = COALESCE($3::int, quantidade) * $4
        WHERE id = $2 AND status = 'em_andamento' RETURNING id, quantidade`,
      [usuarioId, parseInt(id), qtdTela > 0 ? qtdTela : null, MULTIPLICADOR_APROVACAO]
    );
    if (!result.rows[0]) return res.status(400).json({ erro: 'Item não encontrado ou não está mais em "Em andamento".' });
    res.json({ sucesso: true });
  } catch (err) { next(err); }
}

// POST /necessidades-pecas/:id/enviar — "envia" pro outro sistema (destino ainda não
// definido). Por enquanto só monta e guarda o payload, marca como enviado.
// Quando o sistema de destino for definido, troca esse miolo por uma chamada HTTP real.
export async function enviarOutroSistema(req, res, next) {
  try {
    const { id } = req.params;
    const item = await query(`${BASE_SELECT} WHERE n.id = $1 AND n.status = 'aprovado'`, [parseInt(id)]);
    if (!item.rows[0]) return res.status(400).json({ erro: 'Item não encontrado ou ainda não foi aprovado.' });

    const n = item.rows[0];
    const payload = {
      codigo: n.codigo,
      descricao: n.descricao,
      quantidade: n.quantidade,
      frete_maritimo: n.frete_maritimo,
      frete_aereo: n.frete_aereo,
      observacoes: n.observacoes,
      aprovado_por: n.aprovado_por_nome,
      aprovado_em: n.aprovado_em,
    };

    await query(
      `UPDATE necessidades_pecas SET enviado_outro_sistema = TRUE, enviado_em = NOW(), payload_enviado = $1 WHERE id = $2`,
      [JSON.stringify(payload), parseInt(id)]
    );

    res.json({ sucesso: true, aviso: 'Integração com o sistema de destino ainda não está plugada — o pacote de dados foi preparado e guardado, pronto pra quando a integração for configurada.', payload });
  } catch (err) { next(err); }
}

// POST /necessidades-pecas/:id/cancelar
export async function cancelarNecessidade(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(
      `UPDATE necessidades_pecas SET status = 'cancelado' WHERE id = $1 AND status != 'aprovado' RETURNING id`,
      [parseInt(id)]
    );
    if (!result.rows[0]) return res.status(400).json({ erro: 'Item já aprovado não pode ser cancelado.' });
    res.json({ sucesso: true });
  } catch (err) { next(err); }
}

// ============================================================
// Relatórios da coluna Aprovado
// ============================================================

// POST /necessidades-pecas/relatorios — gera um lote com todos os aprovados
// e arquiva esses itens (status 'relatorio'), pra não entrarem no próximo.
export async function gerarRelatorio(req, res, next) {
  try {
    const usuarioId = req.usuario.id;
    const relatorioId = await transaction(async (client) => {
      const pendentes = await client.query(
        `SELECT id FROM necessidades_pecas WHERE status = 'aprovado' AND relatorio_id IS NULL FOR UPDATE`
      );
      if (pendentes.rows.length === 0) return null;
      const rel = await client.query(
        `INSERT INTO necessidades_pecas_relatorios (gerado_por, total_itens) VALUES ($1, $2) RETURNING id`,
        [usuarioId, pendentes.rows.length]
      );
      const id = rel.rows[0].id;
      await client.query(
        `UPDATE necessidades_pecas SET status = 'relatorio', relatorio_id = $1
          WHERE id = ANY($2::int[])`,
        [id, pendentes.rows.map(r => r.id)]
      );
      return id;
    });
    if (!relatorioId) return res.status(400).json({ erro: 'Não há itens aprovados para o relatório.' });
    res.json(await dadosRelatorio(relatorioId));
  } catch (err) { next(err); }
}

async function dadosRelatorio(id) {
  const rel = await query(
    `SELECT r.id, r.gerado_em, r.total_itens, u.nome AS gerado_por_nome
       FROM necessidades_pecas_relatorios r
       LEFT JOIN usuarios u ON u.id = r.gerado_por
      WHERE r.id = $1`,
    [id]
  );
  if (!rel.rows[0]) return null;
  const itens = await query(`${BASE_SELECT} WHERE n.relatorio_id = $1 ORDER BY n.aprovado_em, n.id`, [id]);
  return { relatorio: rel.rows[0], itens: itens.rows };
}

// GET /necessidades-pecas/relatorios — histórico
export async function listarRelatorios(req, res, next) {
  try {
    const r = await query(
      `SELECT r.id, r.gerado_em, r.total_itens, u.nome AS gerado_por_nome
         FROM necessidades_pecas_relatorios r
         LEFT JOIN usuarios u ON u.id = r.gerado_por
        ORDER BY r.id DESC`
    );
    res.json({ relatorios: r.rows });
  } catch (err) { next(err); }
}

// GET /necessidades-pecas/relatorios/:id — itens de um lote (pra baixar de novo)
export async function detalharRelatorio(req, res, next) {
  try {
    const dados = await dadosRelatorio(parseInt(req.params.id));
    if (!dados) return res.status(404).json({ erro: 'Relatório não encontrado.' });
    res.json(dados);
  } catch (err) { next(err); }
}
