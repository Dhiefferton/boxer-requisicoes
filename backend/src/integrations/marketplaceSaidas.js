// ============================================================
// integrations/marketplaceSaidas.js — Saídas do marketplace e reposição
// ============================================================
// Quanto sai por dia / mês / ano no Mercado Livre e na Shopee, e o
// relatório semanal de reposição do estoque do marketplace (MKT_PLACE).
//
// De onde vêm as saídas:
//   - até 18/09/2026 → planilha Reposição.xlsx (integrations/marketplaceHistorico.js)
//   - de 19/09/2026 em diante → Zen: itens das notas de saída com tag
//     MercadoLivre / Shopee (sem as canceladas e as em digitação).
//     A cópia é por dia e refaz os 3 últimos dias a cada passada.
//
// Reposição (mesma regra do Painel de Estoque em HTML):
//   média diária     = saídas da janela (padrão 28 dias) / dias da janela
//   necessidade sem. = média × 7 × (1 + margem de segurança, padrão 20%)
//   a repor          = necessidade − estoque do MKT_PLACE no Zen (mín. 0)
// Toda sexta o sistema fecha o relatório da semana (janela até quinta).
// ============================================================
import { query } from '../config/db.js';
import { getToken } from './erpZen.js';
import historico from './marketplaceHistorico.js';
import { estoqueMarketplace } from '../controllers/inventarioController.js';

const ZEN = 'https://api.zenerp.app.br';
export const CORTE = '2026-09-19';            // a partir daqui vale o Zen
const ZEN_INICIO = '2026-09-01';              // copia um pouco antes p/ conferir com a planilha
const CANAIS = [
  { canal: 'Mercado Livre', tag: 'MercadoLivre', letra: 'M' },
  { canal: 'Shopee',        tag: 'Shopee',       letra: 'S' },
];
const STATUS_FORA = ['CANCELED', 'PREPARING'];
export const PADRAO = { janela: 28, margem: 20 };

// ── Datas (fuso de São Paulo) ─────────────────────────────────
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const somarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diaDaSemana = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();   // 0 dom … 5 sex
const isoDe = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
/** Última sexta-feira (hoje, se hoje for sexta) */
export function ultimaSexta(hoje = hojeSP()) { return somarDias(hoje, -((diaDaSemana(hoje) - 5 + 7) % 7)); }

// ── Estrutura ─────────────────────────────────────────────────
let estrutura = null;
function garantirEstrutura() {
  if (!estrutura) {
    estrutura = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS mkt_saidas (
          origem      VARCHAR(10) NOT NULL,          -- planilha | zen
          chave       TEXT        NOT NULL,          -- planilha: dia|código|canal · zen: id do item da nota
          dia         DATE        NOT NULL,
          codigo      VARCHAR(30) NOT NULL,
          descricao   TEXT,
          canal       VARCHAR(30) NOT NULL,
          quantidade  NUMERIC     NOT NULL,
          nota_id     BIGINT,
          nota_numero VARCHAR(20),
          PRIMARY KEY (origem, chave)
        );
        CREATE INDEX IF NOT EXISTS idx_mkt_saidas_dia ON mkt_saidas (dia, origem);
        CREATE INDEX IF NOT EXISTS idx_mkt_saidas_cod ON mkt_saidas (codigo, dia);
        CREATE TABLE IF NOT EXISTS mkt_saidas_sync (
          id INTEGER PRIMARY KEY DEFAULT 1,
          dia_concluido DATE,
          planilha_linhas INTEGER,
          atualizado_em TIMESTAMPTZ
        );
        INSERT INTO mkt_saidas_sync (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
        CREATE TABLE IF NOT EXISTS mkt_reposicao_semanal (
          id          SERIAL PRIMARY KEY,
          semana      DATE NOT NULL UNIQUE,          -- sexta-feira do relatório
          janela_de   DATE NOT NULL,
          janela_ate  DATE NOT NULL,
          parametros  JSONB,
          resumo      JSONB,
          linhas      JSONB,
          gerado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          gerado_por  VARCHAR(150)
        );
      `);
      // Histórico da planilha (carrega uma vez; recarrega se o arquivo mudar)
      const st = (await query(`SELECT planilha_linhas FROM mkt_saidas_sync WHERE id = 1`)).rows[0];
      if (st?.planilha_linhas !== historico.linhas.length) {
        const nomeCanal = Object.fromEntries(CANAIS.map(c => [c.letra, c.canal]));
        const L = historico.linhas;
        await query(`DELETE FROM mkt_saidas WHERE origem = 'planilha'`);
        for (let i = 0; i < L.length; i += 1000) {
          const p = L.slice(i, i + 1000);
          await query(
            `INSERT INTO mkt_saidas (origem, chave, dia, codigo, descricao, canal, quantidade)
             SELECT 'planilha', d || '|' || c || '|' || k, d::date, c, ds, k, q
               FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::numeric[]) AS t(d, c, ds, k, q)
             ON CONFLICT (origem, chave) DO UPDATE SET quantidade = EXCLUDED.quantidade, descricao = EXCLUDED.descricao`,
            [p.map(l => l[0]), p.map(l => String(l[1])), p.map(l => historico.produtos[l[1]] || null),
             p.map(l => nomeCanal[l[2]] || l[2]), p.map(l => l[3])]);
        }
        await query(`UPDATE mkt_saidas_sync SET planilha_linhas = $1 WHERE id = 1`, [L.length]);
      }
    })().catch(e => { estrutura = null; throw e; });
  }
  return estrutura;
}

// Saídas válidas: planilha antes do corte, Zen a partir dele
const SAIDAS = `(SELECT dia, codigo, descricao, canal, quantidade FROM mkt_saidas
                  WHERE (origem = 'planilha' AND dia < '${CORTE}') OR (origem = 'zen' AND dia >= '${CORTE}'))`;

// ── Cópia do Zen ──────────────────────────────────────────────
async function zenGet(caminho) {
  const token = await getToken();
  const r = await fetch(`${ZEN}${caminho}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, tenant: 'boxer' },
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`ZenERP ${caminho.split('?')[0]} → ${r.status}`);
  return r.json();
}

/** Itens das notas de saída de um canal num dia (sem canceladas / em digitação) */
async function itensDoDia(dia, tag) {
  const todos = [];
  const q = encodeURIComponent(`invoice.date==${dia};invoice.tags==*${tag}*`);
  // Páginas de 50 (a resposta do Zen é pesada), 3 de cada vez em paralelo
  for (let first = 0; first < 3000; first += 150) {
    const paginas = await Promise.all([0, 50, 100].map(d => zenGet(`/fiscal/outgoingInvoiceItem?q=${q}&first=${first + d}&max=50`)));
    let fim = false;
    for (const pagina of paginas) {
      const lista = Array.isArray(pagina) ? pagina : [];
      todos.push(...lista);
      if (lista.length < 50) { fim = true; break; }
    }
    if (fim) break;
  }
  const vistos = new Set();
  return todos.filter(it => it?.id && !vistos.has(it.id) && vistos.add(it.id) && !STATUS_FORA.includes(it.invoice?.status) && it.invoice?.flow !== 'IN');
}

async function gravarDia(dia, itens) {
  await query(
    `WITH apaga AS (DELETE FROM mkt_saidas WHERE origem = 'zen' AND dia = $1::date)
     INSERT INTO mkt_saidas (origem, chave, dia, codigo, descricao, canal, quantidade, nota_id, nota_numero)
     SELECT 'zen', ch, $1::date, c, ds, k, q, n, nn
       FROM UNNEST($2::text[], $3::text[], $4::text[], $5::text[], $6::numeric[], $7::bigint[], $8::text[]) AS t(ch, c, ds, k, q, n, nn)
     ON CONFLICT (origem, chave) DO UPDATE SET dia = EXCLUDED.dia, codigo = EXCLUDED.codigo, descricao = EXCLUDED.descricao,
       canal = EXCLUDED.canal, quantidade = EXCLUDED.quantidade, nota_id = EXCLUDED.nota_id, nota_numero = EXCLUDED.nota_numero`,
    [dia,
     itens.map(i => String(i.item.id)),
     itens.map(i => String(i.item.productPacking?.product?.code || i.item.productPacking?.code || '?')),
     itens.map(i => i.item.productPacking?.product?.description || null),
     itens.map(i => i.canal),
     itens.map(i => Number(i.item.quantity) || 0),
     itens.map(i => i.item.invoice?.id || null),
     itens.map(i => (i.item.invoice?.number != null ? String(i.item.invoice.number) : null))]);
}

let rodando = null;
let ultimaVez = 0;

/** Copia do Zen os dias que faltam (até o tempo limite). */
export async function sincronizarSaidas({ limiteMs = 20000, intervaloMs = 10 * 60 * 1000 } = {}) {
  await garantirEstrutura();
  if (rodando) return rodando;
  if (Date.now() - ultimaVez < intervaloMs) return { pulado: true };
  rodando = (async () => {
    const inicio = Date.now();
    const st = (await query(`SELECT dia_concluido FROM mkt_saidas_sync WHERE id = 1`)).rows[0] || {};
    const hoje = hojeSP();
    // Primeiro os dias que ainda não foram copiados (em ordem); depois,
    // se sobrar tempo, refaz os 3 últimos dias (do mais recente para trás)
    const fila = [];
    let d = st.dia_concluido ? somarDias(isoDe(st.dia_concluido), 1) : ZEN_INICIO;
    if (d < ZEN_INICIO) d = ZEN_INICIO;
    for (; d <= hoje; d = somarDias(d, 1)) fila.push(d);
    for (let i = 0; i <= 3; i++) { const r = somarDias(hoje, -i); if (r >= ZEN_INICIO && !fila.includes(r)) fila.push(r); }
    const feitos = [];
    for (const dia of fila) {
      if (Date.now() - inicio >= limiteMs) break;
      const porCanal = await Promise.all(CANAIS.map(async c => (await itensDoDia(dia, c.tag)).map(item => ({ item, canal: c.canal }))));
      const itens = porCanal.flat();
      await gravarDia(dia, itens);
      await query(`UPDATE mkt_saidas_sync SET dia_concluido = GREATEST(COALESCE(dia_concluido, $1::date), $1::date), atualizado_em = NOW() WHERE id = 1`, [dia]);
      feitos.push({ dia, itens: itens.length, unidades: itens.reduce((s, i) => s + (Number(i.item.quantity) || 0), 0) });
    }
    ultimaVez = Date.now();
    return { dias: feitos, completo: feitos.length === fila.length };
  })().finally(() => { rodando = null; });
  return rodando;
}

async function statusSync() {
  const r = (await query(`SELECT to_char(dia_concluido, 'YYYY-MM-DD') AS dia_concluido, atualizado_em FROM mkt_saidas_sync WHERE id = 1`)).rows[0] || {};
  return { diaConcluido: r.dia_concluido || null, atualizadoEm: r.atualizado_em || null };
}

const filtroCanal = (canal) => (CANAIS.some(c => c.canal === canal) ? canal : null);

// ── Resumo: por dia / mês / ano e por produto ─────────────────
export async function resumoSaidas({ canal, dias = 60 } = {}) {
  await garantirEstrutura();
  const ch = filtroCanal(canal);
  const hoje = hojeSP();
  const desdeDia = somarDias(hoje, -(Math.min(Math.max(+dias || 60, 7), 400) - 1));
  const p = [ch];
  const W = `($1::text IS NULL OR canal = $1)`;
  const [porDia, porMes, porAno, produtos, ext] = await Promise.all([
    query(`SELECT to_char(dia, 'YYYY-MM-DD') AS chave, canal, SUM(quantidade)::float AS q FROM ${SAIDAS} s
            WHERE ${W} AND dia >= $2::date GROUP BY 1, 2 ORDER BY 1`, [...p, desdeDia]),
    query(`SELECT to_char(dia, 'YYYY-MM') AS chave, canal, SUM(quantidade)::float AS q FROM ${SAIDAS} s
            WHERE ${W} GROUP BY 1, 2 ORDER BY 1`, p),
    query(`SELECT to_char(dia, 'YYYY') AS chave, canal, SUM(quantidade)::float AS q FROM ${SAIDAS} s
            WHERE ${W} GROUP BY 1, 2 ORDER BY 1`, p),
    query(`SELECT codigo,
                  (ARRAY_AGG(descricao ORDER BY dia DESC) FILTER (WHERE descricao IS NOT NULL))[1] AS descricao,
                  SUM(quantidade) FILTER (WHERE dia = $2::date)::float                                AS ultimo_dia,
                  SUM(quantidade) FILTER (WHERE dia > $2::date - 7)::float                             AS dias7,
                  SUM(quantidade) FILTER (WHERE dia > $2::date - 28)::float                            AS dias28,
                  SUM(quantidade) FILTER (WHERE date_trunc('month', dia) = date_trunc('month', $2::date))::float AS mes,
                  SUM(quantidade) FILTER (WHERE date_trunc('year', dia) = date_trunc('year', $2::date))::float   AS ano,
                  SUM(quantidade)::float AS total,
                  to_char(MAX(dia), 'YYYY-MM-DD') AS ultima_saida
             FROM ${SAIDAS} s WHERE ${W} GROUP BY codigo`, [...p, hoje]),
    query(`SELECT to_char(MIN(dia), 'YYYY-MM-DD') AS primeiro, to_char(MAX(dia), 'YYYY-MM-DD') AS ultimo FROM ${SAIDAS} s WHERE ${W}`, p),
  ]);
  const pivot = (rows) => {
    const m = new Map();
    for (const r of rows) {
      const x = m.get(r.chave) || { chave: r.chave, total: 0 };
      x[r.canal] = (x[r.canal] || 0) + r.q; x.total += r.q; m.set(r.chave, x);
    }
    return [...m.values()];
  };
  // Dias sem saída entram com zero (gráfico diário contínuo)
  const dMap = new Map(pivot(porDia.rows).map(x => [x.chave, x]));
  const serieDia = [];
  for (let d = desdeDia; d <= hoje; d = somarDias(d, 1)) serieDia.push(dMap.get(d) || { chave: d, total: 0 });
  return {
    hoje, canal: ch, canais: CANAIS.map(c => c.canal), corte: CORTE,
    periodo: ext.rows[0], sync: await statusSync(),
    porDia: serieDia, porMes: pivot(porMes.rows), porAno: pivot(porAno.rows),
    produtos: produtos.rows.sort((a, b) => (b.dias28 || 0) - (a.dias28 || 0) || (b.total || 0) - (a.total || 0)),
  };
}

// ── Reposição ─────────────────────────────────────────────────
export async function calcularReposicao({ janela = PADRAO.janela, margem = PADRAO.margem, ate, canal } = {}) {
  await garantirEstrutura();
  janela = Math.min(Math.max(parseInt(janela, 10) || PADRAO.janela, 7), 365);
  margem = Math.min(Math.max(Number(margem) || 0, 0), 200);
  ate = ate || somarDias(hojeSP(), -1);                 // até ontem (dia fechado)
  const de = somarDias(ate, -(janela - 1));
  const ch = filtroCanal(canal);
  const vendas = (await query(
    `SELECT codigo, (ARRAY_AGG(descricao ORDER BY dia DESC) FILTER (WHERE descricao IS NOT NULL))[1] AS descricao,
            SUM(quantidade)::float AS total,
            SUM(quantidade) FILTER (WHERE canal = 'Mercado Livre')::float AS ml,
            SUM(quantidade) FILTER (WHERE canal = 'Shopee')::float AS shopee
       FROM ${SAIDAS} s WHERE dia BETWEEN $1::date AND $2::date AND ($3::text IS NULL OR canal = $3)
      GROUP BY codigo`, [de, ate, ch])).rows;

  let estoque = null, erroEstoque = null;
  try { estoque = Object.fromEntries((await estoqueMarketplace()).map(e => [String(e.codigo), e])); }
  catch (e) { erroEstoque = `Não consegui ler o estoque do MKT_PLACE no Zen: ${e.message}`; }

  const fator = 1 + margem / 100;
  const linhas = vendas.map(v => {
    const media = v.total / janela;
    const necessidade = Math.ceil(media * 7 * fator);
    const est = estoque ? (estoque[v.codigo]?.saldo ?? 0) : null;
    const repor = est === null ? null : Math.max(0, necessidade - est);
    let status;
    if (est === null) status = 'sem_estoque_info';
    else if (est <= 0) status = 'critico';
    else if (repor > 0 && est < necessidade * 0.5) status = 'atencao';
    else if (repor > 0) status = 'repor';
    else status = 'ok';
    return {
      codigo: v.codigo, descricao: v.descricao || estoque?.[v.codigo]?.descricao || '',
      saidas: v.total, ml: v.ml || 0, shopee: v.shopee || 0,
      media: +media.toFixed(2), necessidade, estoque: est, repor,
      cobertura_dias: est === null || media <= 0 ? null : +(est / media).toFixed(1),
      endereco: estoque?.[v.codigo]?.endereco || '', status,
    };
  });
  const RANK = { critico: 4, atencao: 3, repor: 2, sem_estoque_info: 1, ok: 0 };
  linhas.sort((a, b) => RANK[b.status] - RANK[a.status] || (b.repor || 0) - (a.repor || 0) || b.saidas - a.saidas);
  const resumo = {
    produtos: linhas.length,
    a_repor: linhas.filter(l => l.repor > 0).length,
    unidades_repor: linhas.reduce((s, l) => s + (l.repor || 0), 0),
    criticos: linhas.filter(l => l.status === 'critico').length,
    saidas_janela: linhas.reduce((s, l) => s + l.saidas, 0),
  };
  return { janela_de: de, janela_ate: ate, parametros: { janela, margem, canal: ch }, resumo, linhas, erroEstoque };
}

// ── Relatório semanal (toda sexta) ────────────────────────────
/** Fecha o relatório da última sexta, se ainda não existe e os dados até quinta já estão copiados. */
export async function garantirRelatorioSemanal({ forcar = false, usuario = null } = {}) {
  await garantirEstrutura();
  const sexta = ultimaSexta();
  const quinta = somarDias(sexta, -1);
  if (!forcar) {
    const ja = await query(`SELECT id FROM mkt_reposicao_semanal WHERE semana = $1::date`, [sexta]);
    if (ja.rows[0]) return { semana: sexta, existente: true };
  }
  const st = await statusSync();
  if (!st.diaConcluido || st.diaConcluido < quinta) return { semana: sexta, aguardando: `saídas copiadas até ${st.diaConcluido || '—'}` };
  const r = await calcularReposicao({ ate: quinta });
  if (r.erroEstoque) return { semana: sexta, aguardando: r.erroEstoque };
  const ins = await query(
    `INSERT INTO mkt_reposicao_semanal (semana, janela_de, janela_ate, parametros, resumo, linhas, gerado_por, gerado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (semana) DO UPDATE SET janela_de = EXCLUDED.janela_de, janela_ate = EXCLUDED.janela_ate, parametros = EXCLUDED.parametros,
       resumo = EXCLUDED.resumo, linhas = EXCLUDED.linhas, gerado_por = EXCLUDED.gerado_por, gerado_em = NOW()
     RETURNING id`,
    [sexta, r.janela_de, r.janela_ate, JSON.stringify(r.parametros), JSON.stringify(r.resumo), JSON.stringify(r.linhas), usuario || 'Automático (sexta-feira)']);
  return { semana: sexta, gerado: true, id: ins.rows[0].id };
}

export async function listarRelatorios() {
  await garantirEstrutura();
  return (await query(
    `SELECT id, to_char(semana, 'YYYY-MM-DD') AS semana, to_char(janela_de, 'YYYY-MM-DD') AS janela_de,
            to_char(janela_ate, 'YYYY-MM-DD') AS janela_ate, parametros, resumo, gerado_em, gerado_por
       FROM mkt_reposicao_semanal ORDER BY semana DESC LIMIT 104`)).rows;
}

export async function obterRelatorio(id) {
  await garantirEstrutura();
  return (await query(
    `SELECT id, to_char(semana, 'YYYY-MM-DD') AS semana, to_char(janela_de, 'YYYY-MM-DD') AS janela_de,
            to_char(janela_ate, 'YYYY-MM-DD') AS janela_ate, parametros, resumo, linhas, gerado_em, gerado_por
       FROM mkt_reposicao_semanal WHERE id = $1`, [parseInt(id, 10)])).rows[0] || null;
}

/** Conferência planilha × Zen nos dias em que os dois existem */
export async function compararPlanilhaZen() {
  await garantirEstrutura();
  return (await query(
    `SELECT to_char(dia, 'YYYY-MM-DD') AS dia, canal,
            SUM(quantidade) FILTER (WHERE origem = 'planilha')::float AS planilha,
            SUM(quantidade) FILTER (WHERE origem = 'zen')::float AS zen
       FROM mkt_saidas WHERE dia >= $1::date GROUP BY 1, 2 ORDER BY 1, 2`, [ZEN_INICIO])).rows;
}
