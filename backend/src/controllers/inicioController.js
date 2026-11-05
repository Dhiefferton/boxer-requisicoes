// ============================================================
// controllers/inicioController.js — Tela Início (Boxer Operações)
// ============================================================
// GET /inicio/resumo — quantos cards cada tela tem (sem os arquivados) e os
// números de produtividade do topo. Todo mundo vê a mesma tela; só leitura.
// Cada número é calculado à parte: se um falhar, volta null e a tela mostra "—".
// ============================================================
import { query } from '../config/db.js';
import { lerConfigOrcamento } from './configOrcamentoController.js';
import { lerConfigLojinha } from './lojinhaController.js';
import { lerConfigCif } from './logisticaCifController.js';

const TZ = `'America/Sao_Paulo'`;
const DIA = (col) => `(${col} AT TIME ZONE ${TZ})::date`;
const HOJE = `(NOW() AT TIME ZONE ${TZ})::date`;
const seguro = (p) => p.catch(e => { console.error('[Início]', e.message); return null; });
const n = (v) => (v == null ? null : Number(v));
const ehConcluido = (nome) => /conclu|finaliz/i.test(String(nome || ''));

let cache = null;
export async function resumoInicio(req, res, next) {
  try {
    if (cache && Date.now() - cache.em < 60000) return res.json(cache.dados);
    const [cOrc, cLoj, cCif] = await Promise.all([seguro(lerConfigOrcamento()), seguro(lerConfigLojinha()), seguro(lerConfigCif())]);
    const arq = (cfg) => (cfg?.colunas || []).filter(c => c.arquivada).map(c => c.chave);
    const fim = (cfg) => (cfg?.colunas || []).filter(c => ehConcluido(c.nome)).map(c => c.chave);

    // ── Cards por tela ──
    const telas = {};
    const contar = async (chave, sql, params) => { const r = await seguro(query(sql, params)); telas[chave] = r ? n(r.rows[0]?.n) : null; };
    const quadros = (await seguro(query(`SELECT id FROM bx_quadros WHERE ativo`)))?.rows || [];
    await Promise.all([
      contar('orcamentos', `SELECT COUNT(*) AS n FROM pedidos_orcamento WHERE status <> 'cancelado' AND NOT (status = ANY($1::text[]))`, [arq(cOrc)]),
      contar('lojinha', `SELECT COUNT(*) AS n FROM lojinha_boxer_pedidos WHERE NOT (status = ANY($1::text[]))`, [arq(cLoj)]),
      contar('logistica_cif', `SELECT COUNT(*) AS n FROM lojinha_boxer_pedidos WHERE cif_status IS NOT NULL AND NOT (cif_status = ANY($1::text[]))`, [arq(cCif)]),
      ...quadros.map(q => contar(`quadro_${q.id}`,
        `SELECT COUNT(*) AS n FROM bx_quadro_cards c WHERE c.quadro_id = $1
            AND NOT EXISTS (SELECT 1 FROM qd${Number(q.id)}_colunas k WHERE k.chave = c.status AND k.arquivada)`, [q.id])),
    ]);

    // ── Produtividade ──
    const movidosSql = (dia) => `SELECT
        (SELECT COUNT(*) FROM pedidos_orcamento_movimentos WHERE de_status IS NOT NULL AND para_status IS NOT NULL AND de_status <> para_status AND ${DIA('criado_em')} = ${dia})
      + (SELECT COUNT(*) FROM loj_movimentos WHERE de_status IS NOT NULL AND para_status IS NOT NULL AND de_status <> para_status AND ${DIA('criado_em')} = ${dia})
      + (SELECT COUNT(*) FROM bx_quadro_movimentos WHERE de_status IS NOT NULL AND para_status IS NOT NULL AND de_status <> para_status AND ${DIA('criado_em')} = ${dia}) AS n`;
    const concluidosSql = (de, ate) => `SELECT
        (SELECT COUNT(DISTINCT pedido_id) FROM pedidos_orcamento_movimentos WHERE para_status = ANY($1::text[]) AND criado_em >= NOW() - INTERVAL '${de} days' AND criado_em < NOW() - INTERVAL '${ate} days')
      + (SELECT COUNT(DISTINCT pedido_id) FROM loj_movimentos WHERE tipo <> 'cif_movido' AND para_status = ANY($2::text[]) AND criado_em >= NOW() - INTERVAL '${de} days' AND criado_em < NOW() - INTERVAL '${ate} days')
      + (SELECT COUNT(DISTINCT pedido_id) FROM loj_movimentos WHERE tipo = 'cif_movido' AND para_status = ANY($3::text[]) AND criado_em >= NOW() - INTERVAL '${de} days' AND criado_em < NOW() - INTERVAL '${ate} days') AS n`;
    const finais = [fim(cOrc), fim(cLoj), fim(cCif)];
    const [movHoje, movOntem, concSemana, concAnterior, aprov, libHoje, tempo] = await Promise.all([
      seguro(query(movidosSql(HOJE))),
      seguro(query(movidosSql(`${HOJE} - 1`))),
      seguro(query(concluidosSql(7, 0), finais)),
      seguro(query(concluidosSql(14, 7), finais)),
      seguro(query(`SELECT
          COUNT(DISTINCT pedido_id) FILTER (WHERE detalhes->>'aprovacao' ILIKE 'aprov%') AS aprovados,
          COUNT(DISTINCT pedido_id) FILTER (WHERE detalhes->>'aprovacao' ILIKE 'recus%') AS recusados
        FROM pedidos_orcamento_movimentos
        WHERE date_trunc('month', criado_em AT TIME ZONE ${TZ}) = date_trunc('month', NOW() AT TIME ZONE ${TZ})`)),
      seguro(query(`SELECT
          (SELECT COUNT(*) FROM lojinha_boxer_pedidos WHERE ${DIA('fat_liberado_em')} = ${HOJE}) AS lojinha,
          (SELECT COUNT(*) FROM pedidos_orcamento WHERE ${DIA('fat_liberado_em')} = ${HOJE}) AS orcamento`)),
      seguro(query(`SELECT
          AVG(EXTRACT(EPOCH FROM (fat_liberado_em - created_at)) / 86400) FILTER (WHERE fat_liberado_em >= NOW() - INTERVAL '30 days') AS atual,
          AVG(EXTRACT(EPOCH FROM (fat_liberado_em - created_at)) / 86400) FILTER (WHERE fat_liberado_em >= NOW() - INTERVAL '60 days' AND fat_liberado_em < NOW() - INTERVAL '30 days') AS anterior
        FROM pedidos_orcamento WHERE fat_liberado_em IS NOT NULL`)),
    ]);
    const a = aprov?.rows[0], l = libHoje?.rows[0], t = tempo?.rows[0];
    const dados = {
      telas,
      produtividade: {
        movidos_hoje: n(movHoje?.rows[0]?.n), movidos_ontem: n(movOntem?.rows[0]?.n),
        concluidos_semana: n(concSemana?.rows[0]?.n), concluidos_anterior: n(concAnterior?.rows[0]?.n),
        aprovados_mes: a ? n(a.aprovados) : null, recusados_mes: a ? n(a.recusados) : null,
        faturamento_hoje: l ? n(l.lojinha) + n(l.orcamento) : null, faturamento_lojinha: l ? n(l.lojinha) : null, faturamento_orcamento: l ? n(l.orcamento) : null,
        dias_ate_faturar: t?.atual != null ? Math.round(Number(t.atual) * 10) / 10 : null,
        dias_ate_faturar_anterior: t?.anterior != null ? Math.round(Number(t.anterior) * 10) / 10 : null,
      },
    };
    cache = { em: Date.now(), dados };
    res.json(dados);
  } catch (err) { next(err); }
}
