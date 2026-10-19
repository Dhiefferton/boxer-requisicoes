// ============================================================
// routes/planilhas.js — dados para planilhas do Excel (Power Query)
// ============================================================
// A planilha puxa os dados por um link com chave (sem login Microsoft):
//   GET /api/planilhas/insumos?chave=...&desde=2026-10-01
// Devolve as movimentações de Insumos e EPIs (tudo que não é Partes e
// Peças nem Máquinas) com as mesmas colunas da Tabela4 da planilha
// "Insumos e EPIs":
//   ENTRADA → tela Entradas (entradas_estoque)
//   SAÍDA   → tela do Operador (requisições entregues)
// Chave: variável de ambiente PLANILHA_CHAVE.
// ============================================================
import express from 'express';
import { query } from '../config/db.js';

const router = express.Router();

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
  'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const CATEGORIAS_FORA = ['Partes e Peças', 'Máquinas'];

function chaveOk(req) {
  const chave = process.env.PLANILHA_CHAVE;
  return Boolean(chave) && (req.query.chave === chave || req.headers['x-chave'] === chave);
}

// GET /api/planilhas/insumos?chave=...&desde=AAAA-MM-DD&ate=AAAA-MM-DD
router.get('/insumos', async (req, res) => {
  if (!chaveOk(req)) return res.status(401).json({ erro: 'Chave inválida.' });
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(req.query.desde || '') ? req.query.desde : '2026-10-01';
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.ate || '') ? req.query.ate : '2999-12-31';
  try {
    const r = await query(
      `WITH ent_ult AS (
         SELECT DISTINCT ON (material_id) material_id, valor_unitario
           FROM entradas_estoque WHERE valor_unitario IS NOT NULL
          ORDER BY material_id, created_at DESC
       ),
       mov AS (
         SELECT e.created_at AS quando, m.codigo, m.descricao, e.quantidade,
                'Almoxarifado' AS setor, u.nome AS solicitante, 'ENTRADA' AS tipo,
                COALESCE(e.valor_unitario, eu.valor_unitario) AS preco, e.id AS ordem
           FROM entradas_estoque e
           JOIN materiais m ON m.id = e.material_id
           LEFT JOIN categorias c ON c.id = m.categoria_id
           LEFT JOIN usuarios u ON u.id = e.usuario_id
           LEFT JOIN ent_ult eu ON eu.material_id = e.material_id
          WHERE COALESCE(c.nome, '') <> ALL($3::text[])
         UNION ALL
         SELECT h.quando, COALESCE(m.codigo, i.codigo_snapshot), COALESCE(m.descricao, i.descricao_snapshot), i.quantidade,
                d.nome, u.nome, 'SAÍDA', eu.valor_unitario, i.id
           FROM requisicoes r
           JOIN LATERAL (SELECT MAX(created_at) AS quando FROM historico_status
                          WHERE requisicao_id = r.id AND status_novo = 'entregue') h ON h.quando IS NOT NULL
           JOIN itens_requisicao i ON i.requisicao_id = r.id
           LEFT JOIN materiais m ON m.id = i.material_id
           LEFT JOIN categorias c ON c.id = m.categoria_id
           LEFT JOIN departamentos d ON d.id = r.departamento_id
           LEFT JOIN usuarios u ON u.id = r.usuario_id
           LEFT JOIN ent_ult eu ON eu.material_id = i.material_id
          WHERE r.status = 'entregue' AND COALESCE(c.nome, '') <> ALL($3::text[])
       )
       SELECT to_char(quando AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS dia, codigo, descricao, quantidade,
              setor, solicitante, tipo, preco
         FROM mov
        WHERE (quando AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date
        ORDER BY quando, tipo, ordem`,
      [desde, ate, CATEGORIAS_FORA]);

    const linhas = r.rows.map(x => {
      const dia = String(x.dia);
      const [ano, mes] = dia.split('-').map(Number);
      const cod = /^\d+$/.test(String(x.codigo || '')) ? Number(x.codigo) : x.codigo;
      const preco = x.preco == null ? null : Number(x.preco);
      const qtd = Number(x.quantidade) || 0;
      return {
        'Data': dia,
        'Cód.': cod,
        'Produto': x.descricao,
        'Qtd.': qtd,
        'Setor': x.setor || '',
        'Solicitante': x.solicitante || '',
        'Entrada/Saída': x.tipo,
        'Mês': MESES[mes - 1],
        'Ano': ano,
        'Preço Atual': preco,
        'Valor Total': preco == null ? null : Math.round(preco * qtd * 100) / 100,
        'Qtd. Saída': null,
      };
    });
    res.set('Cache-Control', 'no-store');
    res.json(linhas);
  } catch (e) {
    console.error('[Planilhas] insumos:', e.message);
    res.status(500).json({ erro: 'Erro ao gerar os dados da planilha.' });
  }
});

// GET /api/planilhas/insumos/excluidos?chave=... — códigos das categorias
// que não entram na planilha (Partes e Peças, Máquinas). A planilha usa
// para tirar esses códigos também do histórico digitado à mão.
router.get('/insumos/excluidos', async (req, res) => {
  if (!chaveOk(req)) return res.status(401).json({ erro: 'Chave inválida.' });
  try {
    const r = await query(
      `SELECT m.codigo FROM materiais m JOIN categorias c ON c.id = m.categoria_id
        WHERE c.nome = ANY($1::text[]) ORDER BY m.codigo`, [CATEGORIAS_FORA]);
    res.set('Cache-Control', 'no-store');
    res.json(r.rows.map(x => String(x.codigo).trim()));
  } catch (e) {
    console.error('[Planilhas] excluidos:', e.message);
    res.status(500).json({ erro: 'Erro ao gerar a lista.' });
  }
});

export default router;
