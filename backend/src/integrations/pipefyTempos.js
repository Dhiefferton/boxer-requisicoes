// ============================================================
// integrations/pipefyTempos.js — tempos de Separação e Conferência
// ============================================================
// Copia do pipe "Peças p/ Envio" (Pipefy) os campos dos relatórios
// "Almoxarifado - Separação de pedidos - Power Bi" e
// "Almoxarifado - Conferência dos pedidos - Power Bi" para a tabela
// pipefy_tempos_pecas, de forma incremental (cards atualizados desde a
// última passada). As planilhas Pedidos.xlsx e Conferência.xlsx leem daqui.
// ============================================================
import { query } from '../config/db.js';
import { pipefyQueryPlanilhas as pipefyQuery } from './pipefyService.js';

const PIPE_ID = '301502578';            // Peças p/ Envio
const INICIO_PADRAO = '2026-09-25T00:00:00Z';
const MARGEM_MS = 15 * 60 * 1000;       // volta 15 min para não perder nada

const CAMPOS = {
  n_mero_do_pedido: 'ordem',
  in_cio_da_separa_o: 'sep_inicio',
  t_rmino_da_separa_o: 'sep_fim',
  conferente: 'separador',
  foi_separado_correto: 'separado_correto',
  quais_erros_na_separa_o: 'erros_separacao',
  origem_do_card: 'origem',
  in_cio_da_confer_ncia: 'conf_inicio',
  t_rmino_da_confer_ncia: 'conf_fim',
  conferente_1: 'conferente',
};
const DATAS = new Set(['sep_inicio', 'sep_fim', 'conf_inicio', 'conf_fim']);

let estrutura = null;
function garantirEstrutura() {
  if (!estrutura) {
    estrutura = query(`
      CREATE TABLE IF NOT EXISTS pipefy_tempos_pecas (
        card_id          VARCHAR(30) PRIMARY KEY,
        ordem            VARCHAR(40),
        sep_inicio       TIMESTAMP,
        sep_fim          TIMESTAMP,
        separador        VARCHAR(150),
        separado_correto VARCHAR(30),
        erros_separacao  TEXT,
        origem           VARCHAR(60),
        conf_inicio      TIMESTAMP,
        conf_fim         TIMESTAMP,
        conferente       VARCHAR(150),
        card_atualizado  TIMESTAMPTZ,
        sincronizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_pftp_sep ON pipefy_tempos_pecas (sep_inicio);
      CREATE INDEX IF NOT EXISTS idx_pftp_conf ON pipefy_tempos_pecas (conf_inicio);
      CREATE TABLE IF NOT EXISTS pipefy_tempos_sync (
        id          INTEGER PRIMARY KEY DEFAULT 1,
        desde       TIMESTAMPTZ,      -- filtro "atualizado desde" da passada atual
        cursor      TEXT,             -- página onde a passada parou (null = completa)
        maior_vista TIMESTAMPTZ,      -- maior updated_at visto na passada atual
        concluida   TIMESTAMPTZ,      -- até onde já está tudo copiado
        atualizado_em TIMESTAMPTZ DEFAULT NOW()
      );
      INSERT INTO pipefy_tempos_sync (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
    `).catch(e => { estrutura = null; throw e; });
  }
  return estrutura;
}

// O Pipefy guarda o horário local com "+00:00": usa a parte da data/hora como está
const dataLocal = (v) => (v ? String(v).replace(/([+-]\d{2}:\d{2}|Z)$/, '').slice(0, 19) : null);

function linhaDoCard(node) {
  const l = { card_id: String(node.id), card_atualizado: node.updated_at || null };
  for (const f of node.fields || []) {
    const col = CAMPOS[f.field?.id];
    if (!col) continue;
    if (DATAS.has(col)) l[col] = dataLocal(f.datetime_value);
    else if (col === 'erros_separacao') {
      let v = f.value;
      try { const a = JSON.parse(v); if (Array.isArray(a)) v = a.join(', '); } catch { /* texto */ }
      l[col] = v ? String(v).trim() : null;
    } else l[col] = f.value != null ? String(f.value).trim() : null;
  }
  return l;
}

async function gravar(linhas) {
  for (const l of linhas) {
    await query(
      `INSERT INTO pipefy_tempos_pecas (card_id, ordem, sep_inicio, sep_fim, separador, separado_correto, erros_separacao,
                                        origem, conf_inicio, conf_fim, conferente, card_atualizado, sincronizado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
       ON CONFLICT (card_id) DO UPDATE SET
         ordem = EXCLUDED.ordem, sep_inicio = EXCLUDED.sep_inicio, sep_fim = EXCLUDED.sep_fim,
         separador = EXCLUDED.separador, separado_correto = EXCLUDED.separado_correto,
         erros_separacao = EXCLUDED.erros_separacao, origem = EXCLUDED.origem,
         conf_inicio = EXCLUDED.conf_inicio, conf_fim = EXCLUDED.conf_fim, conferente = EXCLUDED.conferente,
         card_atualizado = EXCLUDED.card_atualizado, sincronizado_em = NOW()`,
      [l.card_id, l.ordem ?? null, l.sep_inicio ?? null, l.sep_fim ?? null, l.separador ?? null, l.separado_correto ?? null,
       l.erros_separacao ?? null, l.origem ?? null, l.conf_inicio ?? null, l.conf_fim ?? null, l.conferente ?? null,
       l.card_atualizado]);
  }
}

const GQL = `query($pipe: ID!, $desde: String!, $after: String) {
  allCards(pipeId: $pipe, first: 50, after: $after, filter: { field: "updated_at", operator: gte, value: $desde }) {
    pageInfo { hasNextPage endCursor }
    edges { node { id updated_at fields { field { id } value datetime_value } } }
  }
}`;

let rodando = null;
let ultimaVez = 0;

/**
 * Copia os cards atualizados desde a última passada. Para no tempo limite
 * e continua de onde parou na próxima chamada.
 */
export async function sincronizarTemposPipefy({ limiteMs = 20000, intervaloMs = 60000 } = {}) {
  await garantirEstrutura();
  if (rodando) return rodando;
  if (Date.now() - ultimaVez < intervaloMs) return { pulado: true };
  rodando = (async () => {
    const inicio = Date.now();
    const st = (await query(`SELECT * FROM pipefy_tempos_sync WHERE id = 1`)).rows[0] || {};
    let { desde, cursor, maior_vista: maior } = st;
    if (!cursor) {
      // passada nova: tudo que mudou desde a última concluída (com margem)
      const base = st.concluida ? new Date(new Date(st.concluida).getTime() - MARGEM_MS) : new Date(INICIO_PADRAO);
      desde = base; maior = null;
    }
    const desdeIso = new Date(desde).toISOString();
    let paginas = 0, cards = 0, completa = false;
    for (;;) {
      const r = await pipefyQuery(GQL, { pipe: PIPE_ID, desde: desdeIso, after: cursor || null });
      const con = r?.allCards;
      const nodes = (con?.edges || []).map(e => e.node).filter(Boolean);
      await gravar(nodes.map(linhaDoCard));
      for (const n of nodes) if (n.updated_at && (!maior || new Date(n.updated_at) > new Date(maior))) maior = n.updated_at;
      cards += nodes.length; paginas++;
      if (!con?.pageInfo?.hasNextPage) { completa = true; cursor = null; break; }
      cursor = con.pageInfo.endCursor;
      await query(`UPDATE pipefy_tempos_sync SET desde = $1, cursor = $2, maior_vista = $3, atualizado_em = NOW() WHERE id = 1`,
        [desde, cursor, maior]);
      if (Date.now() - inicio > limiteMs) break;
    }
    if (completa) {
      await query(`UPDATE pipefy_tempos_sync SET desde = NULL, cursor = NULL, maior_vista = NULL,
                          concluida = COALESCE($1::timestamptz, $2::timestamptz), atualizado_em = NOW() WHERE id = 1`,
        [maior, desde]);
    }
    ultimaVez = Date.now();
    return { paginas, cards, completa };
  })().finally(() => { rodando = null; });
  return rodando;
}

export async function linhasSeparacao(desde, ate) {
  await garantirEstrutura();
  const r = await query(
    `SELECT ordem, to_char(sep_inicio, 'YYYY-MM-DD"T"HH24:MI:SS') AS inicio, to_char(sep_fim, 'YYYY-MM-DD"T"HH24:MI:SS') AS fim,
            separador, separado_correto, erros_separacao, origem
       FROM pipefy_tempos_pecas
      WHERE sep_inicio IS NOT NULL AND sep_inicio::date BETWEEN $1::date AND $2::date
      ORDER BY sep_inicio, card_id`, [desde, ate]);
  return r.rows;
}

export async function linhasConferencia(desde, ate) {
  await garantirEstrutura();
  const r = await query(
    `SELECT ordem, to_char(conf_inicio, 'YYYY-MM-DD"T"HH24:MI:SS') AS inicio, to_char(conf_fim, 'YYYY-MM-DD"T"HH24:MI:SS') AS fim,
            conferente, origem
       FROM pipefy_tempos_pecas
      WHERE conf_inicio IS NOT NULL AND conf_inicio::date BETWEEN $1::date AND $2::date
      ORDER BY conf_inicio, card_id`, [desde, ate]);
  return r.rows;
}
