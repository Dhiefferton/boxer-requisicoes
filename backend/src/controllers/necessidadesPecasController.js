// ============================================================
// controllers/necessidadesPecasController.js — Necessidade de Peças
// ============================================================
// Fluxo em 3 colunas: Solicitado -> Em andamento (revisão: define
// frete marítimo/aéreo) -> Aprovado (botão de envio a outro sistema,
// destino ainda não definido — o payload fica guardado localmente
// até a integração real ser plugada).

import { z } from 'zod';
import { query } from '../config/db.js';

const BASE_SELECT = `
  SELECT
    n.id, n.material_id, n.quantidade, n.status,
    n.frete_maritimo, n.frete_aereo, n.observacoes,
    n.solicitado_em, n.revisado_em, n.aprovado_em,
    n.enviado_outro_sistema, n.enviado_em,
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

export async function aprovarNecessidade(req, res, next) {
  try {
    const { id } = req.params;
    const usuarioId = req.usuario.id;
    const result = await query(
      `UPDATE necessidades_pecas SET status = 'aprovado', aprovado_por = $1, aprovado_em = NOW()
       WHERE id = $2 AND status = 'em_andamento' RETURNING id`,
      [usuarioId, parseInt(id)]
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
