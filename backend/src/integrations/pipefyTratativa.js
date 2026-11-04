// ============================================================
// integrations/pipefyTratativa.js — Tratativa (pipe "Tratativa de manutenção - SAC")
// ============================================================
// O card do Orçamento nasce da tratativa do SAC (conexão "Transferir p/ orçamento").
// Aqui só LEMOS o Pipefy (nada é alterado): o card pai da tratativa com todos os
// campos e os registros conectados (Cliente, Responsável, Modelo da máquina…).
// ============================================================
import { pipefyQueryPlanilhas } from './pipefyService.js';

const CAMPOS_CARD = 'id title url createdAt createdBy { name } pipe { id name } current_phase { name } fields { name value array_value field { id type } }';
const CAMPOS_REG = 'id title created_at table { id name } record_fields { name value field { id type } }';

const lista = (v) => {
  if (v === null || v === undefined || v === '') return [];
  const s = String(v).trim();
  if (s.startsWith('[')) { try { const a = JSON.parse(s); if (Array.isArray(a)) return a.map(String); } catch { /* texto */ } }
  return [s];
};
const reg = (r) => ({
  id: String(r.id), titulo: r.title || null, base: r.table?.name || r.pipe?.name || null, criado_em: r.created_at || r.createdAt || null,
  campos: (r.record_fields || r.fields || [])
    .filter(f => f.field?.type !== 'attachment' && lista(f.value).length)
    .map(f => ({ nome: f.name, tipo: f.field?.type || null, valor: lista(f.value).join(', ') })),
});

// Registros conectados: uma consulta em lote; se falhar, um por um (registro de tabela ou card)
async function lerRegistros(ids) {
  const mapa = new Map();
  if (!ids.length) return mapa;
  try {
    const d = await pipefyQueryPlanilhas(`query { ${ids.map((id, i) => `r${i}: table_record(id: "${id}") { ${CAMPOS_REG} }`).join(' ')} }`);
    ids.forEach((id, i) => { const r = d?.[`r${i}`]; if (r) mapa.set(String(id), reg(r)); });
    return mapa;
  } catch { /* algum não é registro de tabela */ }
  for (const id of ids) {
    try {
      const d = await pipefyQueryPlanilhas(`query($id: ID!) { table_record(id: $id) { ${CAMPOS_REG} } }`, { id });
      if (d?.table_record) { mapa.set(String(id), reg(d.table_record)); continue; }
    } catch { /* tenta como card */ }
    try {
      const d = await pipefyQueryPlanilhas(`query($id: ID!) { card(id: $id) { id title createdAt pipe { name } fields { name value field { id type } } } }`, { id });
      if (d?.card) mapa.set(String(id), reg(d.card));
    } catch { /* ignora */ }
  }
  return mapa;
}

/** Tratativa (card pai no SAC) do card de orçamento `cardId`. null quando não tem. */
export async function buscarTratativa(cardId) {
  const d = await pipefyQueryPlanilhas(`query($id: ID!) { card(id: $id) { parent_relations { name cards { ${CAMPOS_CARD} } } } }`, { id: String(cardId) });
  const pais = (d?.card?.parent_relations || []).flatMap(r => (r.cards || []).map(c => ({ ...c, relacao: r.name })));
  const pai = pais.find(c => /tratativa|sac/i.test(c.pipe?.name || '')) || pais[0];
  if (!pai) return null;
  const fields = pai.fields || [];
  const ids = [...new Set(fields.filter(f => f.field?.type === 'connector')
    .flatMap(f => (f.array_value || []).slice(0, 10).map(String)))].filter(id => /^\d+$/.test(id)).slice(0, 60);
  const regs = await lerRegistros(ids);
  return {
    card_id: String(pai.id), titulo: pai.title, url: pai.url || null, pipe: pai.pipe?.name || null, fase: pai.current_phase?.name || null,
    criado_em: pai.createdAt || null, criado_por: pai.createdBy?.name || null, relacao: pai.relacao,
    campos: fields.map(f => {
      const tipo = f.field?.type || null;
      const base = { id: f.field?.id || null, nome: f.name, tipo };
      if (tipo === 'attachment') return { ...base, anexos: (f.array_value || []).map(p => ({ caminho: String(p), nome: decodeURIComponent(String(p).split('/').pop() || 'arquivo') })) };
      if (tipo === 'connector') {
        const titulos = lista(f.value);
        return { ...base, valor: titulos.join(', '), conectados: (f.array_value || []).map((id, i) => regs.get(String(id)) || { id: String(id), titulo: titulos[i] || null, campos: [] }) };
      }
      return { ...base, valor: lista(f.value).join(', ') };
    }).filter(c => (c.anexos ? c.anexos.length : c.valor)),
  };
}

/** Link novo (assinado, vale alguns minutos) de um anexo da tratativa. */
export async function linkAnexoTratativa(tratativaCardId, caminho) {
  const d = await pipefyQueryPlanilhas(`query($id: ID!) { card(id: $id) { fields { value field { type } } } }`, { id: String(tratativaCardId) });
  for (const f of d?.card?.fields || []) {
    if (f.field?.type !== 'attachment') continue;
    const url = lista(f.value).find(u => u.includes(caminho));
    if (url) return url;
  }
  return null;
}
