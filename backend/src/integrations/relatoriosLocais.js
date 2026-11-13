// ============================================================
// integrations/relatoriosLocais.js — Quadros do Boxer Operações nos Relatórios
// ============================================================
// Os relatórios leem a tabela rel_cards (cards importados do Pipefy). Aqui os cards
// criados no próprio sistema (Orçamentos, Lojinha, Garantia e telas criadas no
// Início › Telas) são copiados para a mesma tabela com pipe_id = 'bo:<fonte>', no
// mesmo formato (campos pelo NOME do campo, histórico de fases pelo NOME da coluna).
// Assim um relatório do Pipefy pode somar os cards do sistema: campos com o mesmo
// nome caem na mesma coluna do relatório.
// • Cópia refeita na hora de rodar o relatório (no máx. 1x/min por fonte).
// • Card que já tem card no Pipefy do relatório (pipefy_refs) não entra de novo.
// • Só leitura dos quadros: nada é alterado nas telas.
// ============================================================
import { query } from '../config/db.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const INTERVALO_MS = 60000;
const ultimaSync = new Map();

// ── Valores no mesmo formato do Pipefy ───────────────────────
function partesData(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (m) return { d: m[3], mo: m[2], a: m[1], h: m[4], mi: m[5] };
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:,?\s+(\d{2}):(\d{2}))?/);
  if (m) return { d: m[1], mo: m[2], a: m[3], h: m[4], mi: m[5] };
  return null;
}
function textoValor(v, tipo) {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (Array.isArray(v)) return v.map(x => (x && typeof x === 'object' ? (x.title ?? x.nome ?? x.name ?? '') : String(x ?? ''))).filter(Boolean).join(', ');
  if (typeof v === 'object') return String(v.title ?? v.nome ?? v.name ?? '');
  let s = String(v).trim();
  if (s.startsWith('[')) { try { const a = JSON.parse(s); if (Array.isArray(a)) s = textoValor(a); } catch { /* texto */ } }
  if (['datahora', 'data', 'vencimento'].includes(tipo)) {
    const p = partesData(s);
    if (p) {
      if (tipo === 'data' || !p.h) return `${p.d}/${p.mo}/${p.a}`;
      return `${p.d} de ${MESES[Number(p.mo) - 1]} de ${p.a}, ${p.h}:${p.mi}`;
    }
  }
  return s;
}

// ── Configuração (campos e colunas) de cada quadro ──────────
async function lerConfig(TC, TF, prefixo) {
  const [cols, campos] = await Promise.all([
    query(`SELECT chave, nome FROM ${TC}`).catch(() => ({ rows: [] })),
    query(`SELECT id, rotulo, tipo, pipefy_campo FROM ${TF} WHERE ativo`).catch(() =>
      query(`SELECT id, rotulo, tipo FROM ${TF} WHERE ativo`).catch(() => ({ rows: [] }))),
  ]);
  const fases = new Map(cols.rows.map(c => [c.chave, c.nome]));
  const porId = new Map();
  for (const c of campos.rows) porId.set(c.pipefy_campo || `${prefixo}${c.id}`, { nome: c.rotulo, tipo: c.tipo });
  return { fases, porId };
}

// Valores { idCampo: valor } → { "Nome do campo": "texto" }
function camposPorNome(valores, porId, extra = {}) {
  const out = { ...extra };
  for (const [id, v] of Object.entries(valores || {})) {
    const cfg = porId.get(id);
    if (!cfg?.nome) continue;
    const t = textoValor(v, cfg.tipo);
    if (t) out[cfg.nome] = t;
  }
  for (const k of Object.keys(out)) if (out[k] === '' || out[k] == null) delete out[k];
  return out;
}

// Movimentos (de → para) → histórico no formato do Pipefy: [{ fase, entrou, saiu, duracao }]
function montarHistorico(criadoEm, statusAtual, movs, fases) {
  const nome = (k) => fases.get(k) || k;
  const hist = [];
  const lista = movs.filter(m => m.para_status && m.para_status !== m.de_status);
  let fase = lista[0]?.de_status || statusAtual;
  let desde = criadoEm ? new Date(criadoEm) : null;
  for (const m of lista) {
    const t = new Date(m.criado_em);
    if (fase && desde) hist.push({ fase: nome(fase), entrou: desde.toISOString(), saiu: t.toISOString(), duracao: Math.max(0, Math.round((t - desde) / 1000)) });
    fase = m.para_status; desde = t;
  }
  if (fase && desde) hist.push({ fase: nome(fase), entrou: desde.toISOString(), saiu: null, duracao: Math.max(0, Math.round((Date.now() - desde) / 1000)) });
  return hist;
}
const movsPor = (rows) => {
  const m = new Map();
  for (const r of rows) { const k = Number(r.pedido_id); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return m;
};
const finalizadoDe = (hist) => [...hist].reverse().find(h => /finaliz|conclu|expedi/i.test(h.fase))?.entrou || null;

// ── Fontes ────────────────────────────────────────────────────
async function cardsOrcamentos() {
  const { fases, porId } = await lerConfig('orc_colunas', 'orc_campos', 'bx_');
  const r = await query(`SELECT p.id, p.referencia, p.status, p.created_at, p.atualizado_em, p.pipefy_card_id, p.pipefy_url,
                                p.pipefy_campos, p.campos_editados, u.nome AS criado_por_nome
                           FROM pedidos_orcamento p LEFT JOIN usuarios u ON u.id = p.criado_por`);
  const movs = movsPor((await query(`SELECT pedido_id, de_status, para_status, criado_em FROM pedidos_orcamento_movimentos
                                       WHERE pedido_id IS NOT NULL ORDER BY criado_em, id`).catch(() => ({ rows: [] }))).rows);
  return r.rows.map(p => {
    // Campos que vieram do Pipefy (nome do Pipefy) + os preenchidos no sistema
    const doPipefy = {};
    const nomesPipefy = new Map();
    for (const c of Array.isArray(p.pipefy_campos) ? p.pipefy_campos : []) {
      if (c?.id && c?.nome) nomesPipefy.set(c.id, c.nome);
      const t = textoValor(c?.valor);
      if (c?.nome && t) doPipefy[c.nome] = t;
    }
    const porIdCard = new Map(porId);
    for (const [id, nome] of nomesPipefy) if (!porIdCard.has(id)) porIdCard.set(id, { nome, tipo: null });
    const hist = montarHistorico(p.created_at, p.status, movs.get(Number(p.id)) || [], fases);
    return {
      id: p.id, titulo: p.referencia, fase: fases.get(p.status) || p.status, criado_em: p.created_at, atualizado_em: p.atualizado_em,
      finalizado_em: finalizadoDe(hist), criado_por: p.criado_por_nome, url: p.pipefy_url || null,
      campos: camposPorNome(p.campos_editados, porIdCard, doPipefy), historico: hist,
      refs: p.pipefy_card_id ? [String(p.pipefy_card_id)] : [],
    };
  });
}

async function cardsLojinha() {
  const { fases, porId } = await lerConfig('loj_colunas', 'loj_campos', 'bx_');
  const r = await query(`SELECT * FROM lojinha_boxer_pedidos`);
  const movs = movsPor((await query(`SELECT pedido_id, de_status, para_status, criado_em FROM loj_movimentos
                                       WHERE pedido_id IS NOT NULL AND tipo NOT LIKE 'cif%' ORDER BY criado_em, id`).catch(() => ({ rows: [] }))).rows);
  return r.rows.map(p => {
    const fixos = {
      'Número do pedido': p.numero_pedido, 'Cliente': p.cliente_nome, 'CPF/CNPJ': p.documento, 'Vendedora': p.vendedora,
      'Tipo de envio': p.tipo_envio, 'Transportadora': p.transportadora,
      'Número da Ordem de Separação': p.zen_ordem_separacao_id ? String(p.zen_ordem_separacao_id) : '',
      'Pedido de venda (Zen)': p.zen_venda_numero || (p.zen_pedido_id ? String(p.zen_pedido_id) : ''),
      'Nota fiscal': p.zen_nf_numero,
    };
    const hist = montarHistorico(p.criado_em, p.status, movs.get(Number(p.id)) || [], fases);
    return {
      id: p.id, titulo: [p.numero_pedido, p.cliente_nome].filter(Boolean).join(' — '), fase: fases.get(p.status) || p.status,
      criado_em: p.criado_em, atualizado_em: null, finalizado_em: p.finalizado_em || finalizadoDe(hist), criado_por: p.criado_por_nome, url: null,
      campos: camposPorNome(p.campos, porId, Object.fromEntries(Object.entries(fixos).map(([k, v]) => [k, v == null ? '' : String(v)]))),
      historico: hist,
      refs: (Array.isArray(p.pipefy_cards) ? p.pipefy_cards : []).map(c => c?.id).filter(Boolean).map(String),
    };
  });
}

async function cardsGarantia() {
  const { fases, porId } = await lerConfig('cif_colunas', 'cif_campos', 'cif_bx_');
  const r = await query(`SELECT * FROM lojinha_boxer_pedidos WHERE cif_status IS NOT NULL`);
  const movs = movsPor((await query(`SELECT pedido_id, de_status, para_status, criado_em FROM loj_movimentos
                                       WHERE pedido_id IS NOT NULL AND tipo LIKE 'cif%' ORDER BY criado_em, id`).catch(() => ({ rows: [] }))).rows);
  return r.rows.map(p => {
    const inicio = p.cif_entrou_em || p.criado_em;
    const hist = montarHistorico(inicio, p.cif_status, movs.get(Number(p.id)) || [], fases);
    return {
      id: p.id, titulo: p.cliente_nome, fase: fases.get(p.cif_status) || p.cif_status, criado_em: inicio, atualizado_em: null,
      finalizado_em: finalizadoDe(hist), criado_por: p.criado_por_nome, url: p.pipefy_garantia_url || null,
      campos: camposPorNome(p.cif_valores, porId, { 'Número do pedido': p.numero_pedido ? String(p.numero_pedido) : '', 'Cliente': p.cliente_nome || '' }),
      historico: hist,
      refs: p.pipefy_garantia_id ? [String(p.pipefy_garantia_id)] : [],
    };
  });
}

async function cardsQuadro(n) {
  const { fases, porId } = await lerConfig(`qd${n}_colunas`, `qd${n}_campos`, 'bx_');
  const r = await query(`SELECT * FROM bx_quadro_cards WHERE quadro_id = $1`, [n]);
  const movs = movsPor((await query(`SELECT pedido_id, de_status, para_status, criado_em FROM bx_quadro_movimentos
                                       WHERE quadro_id = $1 AND pedido_id IS NOT NULL ORDER BY criado_em, id`, [n]).catch(() => ({ rows: [] }))).rows);
  return r.rows.map(p => {
    const hist = montarHistorico(p.criado_em, p.status, movs.get(Number(p.id)) || [], fases);
    return {
      id: p.id, titulo: p.titulo, fase: fases.get(p.status) || p.status, criado_em: p.criado_em, atualizado_em: p.atualizado_em,
      finalizado_em: finalizadoDe(hist), criado_por: p.criado_por_nome, url: null,
      campos: camposPorNome(p.valores, porId), historico: hist, refs: [],
    };
  });
}

const FIXAS_FONTE = [
  { chave: 'orcamentos', nome: 'Orçamentos', ler: cardsOrcamentos, cfg: ['orc_colunas', 'orc_campos'] },
  { chave: 'lojinha',    nome: 'Lojinha Boxer', ler: cardsLojinha, cfg: ['loj_colunas', 'loj_campos'],
    extras: ['Número do pedido', 'Cliente', 'CPF/CNPJ', 'Vendedora', 'Tipo de envio', 'Transportadora', 'Número da Ordem de Separação', 'Pedido de venda (Zen)', 'Nota fiscal'] },
  { chave: 'garantia',   nome: 'Garantia', ler: cardsGarantia, cfg: ['cif_colunas', 'cif_campos'], extras: ['Número do pedido', 'Cliente'] },
];
export const fonteValida = (k) => FIXAS_FONTE.some(f => f.chave === k) || /^quadro_\d{1,9}$/.test(String(k));
export const nomeOrigemSql = `'Boxer Operações'`;

/** Lista as fontes do sistema com os campos e as fases (para montar colunas/filtros). */
export async function listarFontes() {
  const quadros = (await query(`SELECT id, nome FROM bx_quadros WHERE ativo ORDER BY ordem, id`).catch(() => ({ rows: [] }))).rows;
  const fontes = [
    ...FIXAS_FONTE.map(f => ({ chave: f.chave, nome: f.nome, TC: f.cfg[0], TF: f.cfg[1], extras: f.extras || [] })),
    ...quadros.map(q => ({ chave: `quadro_${q.id}`, nome: q.nome, TC: `qd${q.id}_colunas`, TF: `qd${q.id}_campos`, extras: [] })),
  ];
  const out = [];
  for (const f of fontes) {
    const [cols, campos] = await Promise.all([
      query(`SELECT nome FROM ${f.TC} WHERE ativo ORDER BY ordem, chave`).catch(() => ({ rows: [] })),
      query(`SELECT DISTINCT rotulo FROM ${f.TF} WHERE ativo ORDER BY rotulo`).catch(() => ({ rows: [] })),
    ]);
    let nomesCampos = [...f.extras, ...campos.rows.map(c => c.rotulo)];
    if (f.chave === 'orcamentos') {
      // Campos que vieram do Pipefy nos cards
      const p = await query(`SELECT DISTINCT e->>'nome' AS n FROM pedidos_orcamento,
                               jsonb_array_elements(CASE WHEN jsonb_typeof(pipefy_campos) = 'array' THEN pipefy_campos ELSE '[]'::jsonb END) e`).catch(() => ({ rows: [] }));
      nomesCampos = [...nomesCampos, ...p.rows.map(r => r.n)];
    }
    out.push({ chave: f.chave, nome: f.nome, campos: [...new Set(nomesCampos.filter(Boolean))], fases: cols.rows.map(c => ({ nome: c.nome })) });
  }
  return out;
}

async function lerFonte(chave) {
  const fixa = FIXAS_FONTE.find(f => f.chave === chave);
  if (fixa) return { nome: fixa.nome, cards: await fixa.ler() };
  const n = Number(String(chave).replace('quadro_', ''));
  const q = (await query(`SELECT nome FROM bx_quadros WHERE id = $1`, [n])).rows[0];
  if (!q) return { nome: chave, cards: [] };
  return { nome: q.nome, cards: await cardsQuadro(n) };
}

/** Copia os cards das fontes para rel_cards (pipe_id = 'bo:<fonte>'). No máx. 1x/min por fonte. */
export async function sincronizarFontes(fontes, { forcar = false } = {}) {
  for (const chave of (Array.isArray(fontes) ? fontes : []).filter(fonteValida).slice(0, 30)) {
    if (!forcar && Date.now() - (ultimaSync.get(chave) || 0) < INTERVALO_MS) continue;
    try {
      const { nome, cards } = await lerFonte(chave);
      const pipe = `bo:${chave}`;
      const linhas = cards.map(c => ({
        card_id: `${pipe}:${c.id}`, titulo: c.titulo || null, fase_atual: c.fase || null,
        criado_em: c.criado_em || null, finalizado_em: c.finalizado_em || null, atualizado_em: c.atualizado_em || null,
        criado_por: c.criado_por || null, url: c.url || null, campos: c.campos || {}, historico: c.historico || [],
        origem: nome, pipefy_refs: c.refs || [],
      }));
      await query(`DELETE FROM rel_cards WHERE pipe_id = $1`, [pipe]);
      for (let i = 0; i < linhas.length; i += 500) {
        await query(
          `INSERT INTO rel_cards (pipe_id, card_id, titulo, fase_atual, criado_em, finalizado_em, atualizado_em, criado_por, url, campos, historico, origem, pipefy_refs)
           SELECT $1, x.card_id, x.titulo, x.fase_atual, x.criado_em, x.finalizado_em, x.atualizado_em, x.criado_por, x.url,
                  COALESCE(x.campos, '{}'::jsonb), COALESCE(x.historico, '[]'::jsonb), x.origem, COALESCE(x.pipefy_refs, '[]'::jsonb)
             FROM jsonb_to_recordset($2::jsonb) AS x(card_id text, titulo text, fase_atual text, criado_em timestamptz, finalizado_em timestamptz,
                  atualizado_em timestamptz, criado_por text, url text, campos jsonb, historico jsonb, origem text, pipefy_refs jsonb)
           ON CONFLICT (pipe_id, card_id) DO NOTHING`,
          [pipe, JSON.stringify(linhas.slice(i, i + 500))]);
      }
      ultimaSync.set(chave, Date.now());
    } catch (e) {
      console.error(`[Relatórios] Fonte ${chave}:`, e.message);
    }
  }
}

// Para testes
export const _internos = { textoValor, montarHistorico, camposPorNome };
