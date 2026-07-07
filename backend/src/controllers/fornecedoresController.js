import { query } from '../config/db.js';

export async function listarFornecedores(req, res, next) {
  try {
    const result = await query(`SELECT * FROM fornecedores WHERE ativo = TRUE ORDER BY empresa`);
    res.json({ fornecedores: result.rows });
  } catch (err) { next(err); }
}

export async function criarFornecedor(req, res, next) {
  try {
    const { empresa, representante, telefone, email, observacoes } = req.body;
    if (!empresa) return res.status(400).json({ erro: 'Campo obrigatorio: empresa' });
    const result = await query(
      `INSERT INTO fornecedores (empresa, representante, telefone, email, observacoes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [empresa, representante || null, telefone || null, email || null, observacoes || null]
    );
    res.status(201).json({ fornecedor: result.rows[0] });
  } catch (err) { next(err); }
}

export async function editarFornecedor(req, res, next) {
  try {
    const { id } = req.params;
    const { empresa, representante, telefone, email, observacoes } = req.body;
    const result = await query(
      `UPDATE fornecedores SET
        empresa = COALESCE($1, empresa),
        representante = COALESCE($2, representante),
        telefone = COALESCE($3, telefone),
        email = COALESCE($4, email),
        observacoes = COALESCE($5, observacoes)
       WHERE id = $6 RETURNING *`,
      [empresa || null, representante || null, telefone || null, email || null, observacoes || null, parseInt(id)]
    );
    if (!result.rows[0]) return res.status(404).json({ erro: 'Fornecedor nao encontrado' });
    res.json({ fornecedor: result.rows[0] });
  } catch (err) { next(err); }
}

export async function excluirFornecedor(req, res, next) {
  try {
    const { id } = req.params;
    await query(`UPDATE fornecedores SET ativo = FALSE WHERE id = $1`, [parseInt(id)]);
    res.json({ sucesso: true });
  } catch (err) { next(err); }
}

export async function fornecedoresPorMaterial(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(`
      SELECT f.id, f.empresa, f.representante, f.telefone, f.email,
             mf.preco_unitario, mf.observacoes, mf.id AS vinculo_id
      FROM material_fornecedores mf
      JOIN fornecedores f ON f.id = mf.fornecedor_id
      WHERE mf.material_id = $1 AND f.ativo = TRUE
      ORDER BY f.empresa
    `, [parseInt(id)]);
    res.json({ fornecedores: result.rows });
  } catch (err) { next(err); }
}

export async function vincularFornecedor(req, res, next) {
  try {
    const { id } = req.params;
    const { fornecedor_id, preco_unitario, observacoes } = req.body;
    await query(`
      INSERT INTO material_fornecedores (material_id, fornecedor_id, preco_unitario, observacoes)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (material_id, fornecedor_id) DO UPDATE SET
        preco_unitario = EXCLUDED.preco_unitario,
        observacoes = EXCLUDED.observacoes
    `, [parseInt(id), parseInt(fornecedor_id), preco_unitario || null, observacoes || null]);
    res.json({ sucesso: true });
  } catch (err) { next(err); }
}

export async function desvincularFornecedor(req, res, next) {
  try {
    const { id, fornecedor_id } = req.params;
    await query(`DELETE FROM material_fornecedores WHERE material_id = $1 AND fornecedor_id = $2`,
      [parseInt(id), parseInt(fornecedor_id)]);
    res.json({ sucesso: true });
  } catch (err) { next(err); }
}
