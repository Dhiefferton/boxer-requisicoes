// ============================================================
// integrations/registroNS.js — "Registro de NS" dos cards de Orçamento e Garantia
// ============================================================
// No Pipefy, o Registro de NS é o campo do tipo ID da tratativa do SAC: o nº do card
// da tratativa (#<id>). Guardamos esse id em tratativa_card_id para mostrar no card do
// quadro. Só LEMOS o Pipefy (card pai da tratativa), em lote; nada é alterado lá.
// tratativa_card_id = '' quando o card não tem tratativa (não procura de novo).
// ============================================================
import { query } from '../config/db.js';
import { pipefyQueryPlanilhas } from './pipefyService.js';

const TABELAS = {
  orcamento: { tabela: 'pedidos_orcamento', colPipefy: 'pipefy_card_id' },
  garantia: { tabela: 'lojinha_boxer_pedidos', colPipefy: 'pipefy_garantia_id' },
};

let colunas = null;
export const garantirRegistroNS = () => (colunas ||= query(`
  ALTER TABLE pedidos_orcamento ADD COLUMN IF NOT EXISTS tratativa_card_id TEXT;
  ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS tratativa_card_id TEXT;`).catch(e => { colunas = null; throw e; }));

const ehTratativa = (c) => /tratativa|sac/i.test(c?.pipe?.name || '');
const paiTratativa = (card) => {
  const pais = (card?.parent_relations || []).flatMap(r => r.cards || []);
  return String((pais.find(ehTratativa) || {}).id || '');
};
const CAMPOS = 'parent_relations { cards { id pipe { name } } }';

async function lerPais(ids) {
  const mapa = new Map();
  try {
    const d = await pipefyQueryPlanilhas(`query { ${ids.map((id, i) => `c${i}: card(id: "${id}") { ${CAMPOS} }`).join(' ')} }`);
    ids.forEach((id, i) => { if (d && `c${i}` in d) mapa.set(id, paiTratativa(d[`c${i}`])); });
    return mapa;
  } catch { /* algum card não existe mais: um por um */ }
  for (const id of ids) {
    try {
      const d = await pipefyQueryPlanilhas(`query($id: ID!) { card(id: $id) { ${CAMPOS} } }`, { id });
      mapa.set(id, paiTratativa(d?.card));
    } catch { mapa.set(id, ''); }
  }
  return mapa;
}

const rodando = {};
/** Preenche o tratativa_card_id dos cards que ainda não têm (até `limite` por vez). Nunca lança erro. */
export async function preencherRegistroNS(tipo, limite = 60) {
  const t = TABELAS[tipo];
  if (!t || rodando[tipo]) return { tipo, pulado: true };
  rodando[tipo] = true;
  try {
    await garantirRegistroNS();
    // 1) quem já tem a tratativa guardada: usa o id dela (sem ir ao Pipefy)
    const local = await query(`UPDATE ${t.tabela} SET tratativa_card_id = tratativa->>'card_id'
      WHERE tratativa_card_id IS NULL AND COALESCE(tratativa->>'card_id', '') <> ''`).catch(() => ({ rowCount: 0 }));
    // 2) os outros: lê o card pai no Pipefy, 20 por consulta
    const pend = (await query(`SELECT id, ${t.colPipefy}::text AS pf FROM ${t.tabela}
      WHERE tratativa_card_id IS NULL AND ${t.colPipefy} IS NOT NULL ORDER BY id DESC LIMIT $1`, [limite])).rows;
    let achados = 0;
    for (let i = 0; i < pend.length; i += 20) {
      const lote = pend.slice(i, i + 20);
      const mapa = await lerPais(lote.map(r => r.pf));
      for (const r of lote) {
        if (!mapa.has(r.pf)) continue;
        const v = mapa.get(r.pf);
        if (v) achados++;
        await query(`UPDATE ${t.tabela} SET tratativa_card_id = $2 WHERE id = $1 AND tratativa_card_id IS NULL`, [r.id, v]);
      }
    }
    const resta = (await query(`SELECT COUNT(*)::int AS n FROM ${t.tabela} WHERE tratativa_card_id IS NULL AND ${t.colPipefy} IS NOT NULL`)).rows[0].n;
    return { tipo, da_tratativa_guardada: local.rowCount || 0, lidos_no_pipefy: pend.length, com_tratativa: achados, faltam: resta };
  } catch (e) {
    console.error(`⚠️ Registro de NS (${tipo}):`, e.message);
    return { tipo, erro: e.message };
  } finally { rodando[tipo] = false; }
}
