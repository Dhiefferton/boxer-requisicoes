// ============================================================
// controllers/tratativaController.js — Tratativa do SAC no card do Orçamento
// ============================================================
// GET /pedidos-orcamento/:id/tratativa[?atualizar=1] — dados da tratativa (pipe
// "Tratativa de manutenção - SAC") para o Formulário inicial do card.
// Lida do Pipefy (só leitura) UMA vez: quando o card vem da Entrada do Pipefy
// para a Entrada do B-Requisições ("Trazer do Pipefy"). Depois fica guardada aqui.
// Cards antigos (trazidos antes disso) leem uma vez ao abrir. ?atualizar=1 relê.
// GET /pedidos-orcamento/:id/tratativa/anexo?caminho= — link novo de um anexo.
// ============================================================
import { query } from '../config/db.js';
import { buscarTratativa, linkAnexoTratativa } from '../integrations/pipefyTratativa.js';

let colunas = null;
const garantir = () => (colunas ||= query(`
  ALTER TABLE pedidos_orcamento ADD COLUMN IF NOT EXISTS tratativa JSONB;
  ALTER TABLE pedidos_orcamento ADD COLUMN IF NOT EXISTS tratativa_em TIMESTAMPTZ;`).catch(e => { colunas = null; throw e; }));

/** Lê a tratativa no Pipefy e guarda no card (chamado ao trazer o card da Entrada). Nunca lança erro. */
export async function guardarTratativa(pedidoId, pipefyCardId) {
  try {
    await garantir();
    const t = await buscarTratativa(pipefyCardId);
    await query(`UPDATE pedidos_orcamento SET tratativa = $1::jsonb, tratativa_em = NOW() WHERE id = $2`, [JSON.stringify(t), pedidoId]);
    return t;
  } catch (e) { console.error(`⚠️ Tratativa do card ${pipefyCardId}:`, e.message); return null; }
}

export async function verTratativa(req, res, next) {
  try {
    await garantir();
    const p = (await query(`SELECT id, pipefy_card_id, tratativa, tratativa_em FROM pedidos_orcamento WHERE id = $1`, [parseInt(req.params.id) || 0])).rows[0];
    if (!p) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    if (!p.pipefy_card_id) return res.json({ tratativa: null, motivo: 'Card criado no B-Requisições (sem tratativa do SAC).' });
    if (p.tratativa_em && req.query.atualizar !== '1') return res.json({ tratativa: p.tratativa, lido_em: p.tratativa_em });
    try {
      const t = await buscarTratativa(p.pipefy_card_id);
      const r = await query(`UPDATE pedidos_orcamento SET tratativa = $1::jsonb, tratativa_em = NOW() WHERE id = $2 RETURNING tratativa_em`,
        [JSON.stringify(t), p.id]);
      res.json({ tratativa: t, lido_em: r.rows[0].tratativa_em });
    } catch (e) {
      // Pipefy fora do ar / limite: mostra o que já estava guardado
      res.json({ tratativa: p.tratativa, lido_em: p.tratativa_em, erro: `Não consegui ler a tratativa no Pipefy agora: ${e.message}` });
    }
  } catch (err) { next(err); }
}

export async function anexoTratativa(req, res, next) {
  try {
    await garantir();
    const p = (await query(`SELECT tratativa FROM pedidos_orcamento WHERE id = $1`, [parseInt(req.params.id) || 0])).rows[0];
    const caminho = String(req.query.caminho || '');
    const tem = (p?.tratativa?.campos || []).some(c => (c.anexos || []).some(a => a.caminho === caminho));
    if (!p?.tratativa?.card_id || !tem) return res.status(404).json({ erro: 'Anexo não encontrado.' });
    const url = await linkAnexoTratativa(p.tratativa.card_id, caminho);
    if (!url) return res.status(404).json({ erro: 'O anexo não está mais na tratativa.' });
    res.json({ url });
  } catch (err) { next(err); }
}
