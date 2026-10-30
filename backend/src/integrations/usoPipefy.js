// ============================================================
// integrations/usoPipefy.js — contagem de chamadas à API do Pipefy
// ============================================================
// Toda chamada ao Pipefy (pipefyService) passa por registrarChamadaPipefy.
// A origem é a tela/rota que disparou a chamada (guardada por requisição
// com AsyncLocalStorage). Tabela: pipefy_uso (por dia, origem e tipo).
// ============================================================
import { AsyncLocalStorage } from 'node:async_hooks';
import { query } from '../config/db.js';

const contexto = new AsyncLocalStorage();

// Nome amigável de cada rota que usa o Pipefy
const ORIGENS = {
  'lojinha': 'Lojinha Boxer',
  'pedidos-orcamento': 'Orçamentos',
  'planilhas': 'Planilhas do Excel',
  'erp': 'Diagnóstico (admin)',
  'requisicoes': 'Requisições',
  'necessidades-pecas': 'Necessidade de Peças',
};

export function origemDaRota(caminho) {
  const partes = String(caminho || '').split('?')[0].split('/').filter(Boolean);
  const i = partes[0] === 'api' ? 1 : 0;
  const chave = partes[i] || '';
  if (chave === 'planilhas' && partes[i + 1]) return `Planilhas do Excel (${partes[i + 1]})`;
  return ORIGENS[chave] || (chave ? `/${chave}` : 'Automático');
}

// Middleware: marca a origem de tudo que acontecer nesta requisição
export function marcarOrigem(req, res, next) {
  // req fica guardado para ler o usuário (req.usuario é preenchido depois, no autenticar)
  contexto.run({ origem: origemDaRota(req.originalUrl || req.url), req, rota: `${req.method} ${String(req.originalUrl || req.url).split('?')[0]}` }, next);
}

let estrutura = null;
function garantirEstrutura() {
  if (!estrutura) {
    estrutura = query(`
      CREATE TABLE IF NOT EXISTS pipefy_uso (
        dia      DATE        NOT NULL,
        origem   VARCHAR(80) NOT NULL,
        tipo     VARCHAR(20) NOT NULL,
        chamadas INTEGER     NOT NULL DEFAULT 0,
        erros    INTEGER     NOT NULL DEFAULT 0,
        PRIMARY KEY (dia, origem, tipo)
      );
      CREATE TABLE IF NOT EXISTS pipefy_chamadas (
        id         BIGSERIAL PRIMARY KEY,
        criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        dia        DATE        NOT NULL,
        origem     VARCHAR(80) NOT NULL,
        tipo       VARCHAR(20) NOT NULL,
        operacao   VARCHAR(80),
        alvo       VARCHAR(200),
        rota       VARCHAR(200),
        usuario    VARCHAR(120),
        ok         BOOLEAN     NOT NULL,
        erro       TEXT,
        duracao_ms INTEGER,
        consulta   TEXT,
        variaveis  TEXT
      );
      CREATE INDEX IF NOT EXISTS pipefy_chamadas_dia_idx ON pipefy_chamadas (dia, id DESC);`).catch(e => { estrutura = null; throw e; });
  }
  return estrutura;
}

// Nome da operação = primeiro campo da consulta (card, allCards, updateCardField, moveCardToPhase…)
function nomeOperacao(gql) {
  const t = String(gql || '').replace(/^\s*(query|mutation)\b[^{]*/i, '');
  const m = t.match(/\{\s*(?:\w+\s*:\s*)?(\w+)/);
  return m ? m[1] : null;
}
// Alvo = ids citados (card, fase, pipe, tabela) — na consulta ou nas variáveis
function alvoDaChamada(gql, variables) {
  const texto = `${gql || ''} ${variables ? JSON.stringify(variables) : ''}`;
  const achados = [];
  const re = /\b(card_id|cardId|card|phase_id|phaseId|phase|pipeId|pipe|table|table_id|id)\b["']?\s*[:(]\s*["']?(\d{5,})/g;
  let m;
  while ((m = re.exec(texto)) && achados.length < 6) {
    const rot = /card/i.test(m[1]) ? 'card' : /phase/i.test(m[1]) ? 'fase' : /pipe/i.test(m[1]) ? 'pipe' : /table/i.test(m[1]) ? 'tabela' : 'id';
    const s = `${rot} ${m[2]}`;
    if (!achados.includes(s)) achados.push(s);
  }
  return achados.join(', ') || null;
}
let gravacoes = 0;

/** Conta uma chamada e guarda o detalhe. Nunca lança erro (não pode atrapalhar a integração). */
export async function registrarChamadaPipefy(textoGql, ok, extra = {}) {
  try {
    await garantirEstrutura();
    const tipo = /^\s*mutation\b/i.test(String(textoGql || '')) ? 'alteração' : 'consulta';
    const ctx = contexto.getStore();
    const origem = ctx?.origem || 'Automático';
    const usuario = ctx?.req?.usuario?.nome || null;
    await query(
      `INSERT INTO pipefy_chamadas (dia, origem, tipo, operacao, alvo, rota, usuario, ok, erro, duracao_ms, consulta, variaveis)
       VALUES ((NOW() AT TIME ZONE 'America/Sao_Paulo')::date, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [origem.slice(0, 80), tipo, (nomeOperacao(textoGql) || '').slice(0, 80) || null,
       (alvoDaChamada(textoGql, extra.variables) || '').slice(0, 200) || null, (ctx?.rota || '').slice(0, 200) || null,
       usuario ? usuario.slice(0, 120) : null, !!ok, extra.erro ? String(extra.erro).slice(0, 2000) : null,
       Number.isFinite(extra.duracaoMs) ? Math.round(extra.duracaoMs) : null,
       String(textoGql || '').replace(/\s+/g, ' ').trim().slice(0, 4000),
       extra.variables ? JSON.stringify(extra.variables).slice(0, 2000) : null]
    ).catch(e => console.error('[usoPipefy detalhe]', e.message));
    // Guarda o detalhe por 30 dias (o total por dia continua em pipefy_uso)
    if (++gravacoes % 500 === 1) query(`DELETE FROM pipefy_chamadas WHERE dia < CURRENT_DATE - 30`).catch(() => {});
    await query(
      `INSERT INTO pipefy_uso (dia, origem, tipo, chamadas, erros)
       VALUES ((NOW() AT TIME ZONE 'America/Sao_Paulo')::date, $1, $2, 1, $3)
       ON CONFLICT (dia, origem, tipo) DO UPDATE
         SET chamadas = pipefy_uso.chamadas + 1, erros = pipefy_uso.erros + EXCLUDED.erros`,
      [origem.slice(0, 80), tipo, ok ? 0 : 1]);
  } catch (e) { console.error('[usoPipefy]', e.message); }
}

/** Resumo para o relatório (dia / mês / ano / origem). */
export async function relatorioUsoPipefy() {
  await garantirEstrutura();
  const [dias, meses, anos, origens, inicio] = await Promise.all([
    query(`SELECT to_char(dia, 'YYYY-MM-DD') AS periodo, SUM(chamadas)::int AS chamadas,
                  SUM(chamadas) FILTER (WHERE tipo = 'consulta')::int AS consultas,
                  SUM(chamadas) FILTER (WHERE tipo <> 'consulta')::int AS alteracoes, SUM(erros)::int AS erros
             FROM pipefy_uso WHERE dia >= CURRENT_DATE - 60 GROUP BY dia ORDER BY dia DESC`),
    query(`SELECT to_char(date_trunc('month', dia), 'YYYY-MM') AS periodo, SUM(chamadas)::int AS chamadas,
                  SUM(chamadas) FILTER (WHERE tipo = 'consulta')::int AS consultas,
                  SUM(chamadas) FILTER (WHERE tipo <> 'consulta')::int AS alteracoes, SUM(erros)::int AS erros
             FROM pipefy_uso GROUP BY 1 ORDER BY 1 DESC`),
    query(`SELECT to_char(dia, 'YYYY') AS periodo, SUM(chamadas)::int AS chamadas,
                  SUM(chamadas) FILTER (WHERE tipo = 'consulta')::int AS consultas,
                  SUM(chamadas) FILTER (WHERE tipo <> 'consulta')::int AS alteracoes, SUM(erros)::int AS erros
             FROM pipefy_uso GROUP BY 1 ORDER BY 1 DESC`),
    query(`SELECT origem, SUM(chamadas)::int AS chamadas,
                  SUM(chamadas) FILTER (WHERE tipo = 'consulta')::int AS consultas,
                  SUM(chamadas) FILTER (WHERE tipo <> 'consulta')::int AS alteracoes, SUM(erros)::int AS erros
             FROM pipefy_uso WHERE dia >= date_trunc('month', CURRENT_DATE) GROUP BY origem ORDER BY 2 DESC`),
    query(`SELECT to_char(MIN(dia), 'YYYY-MM-DD') AS desde FROM pipefy_uso`),
  ]);
  return { dias: dias.rows, meses: meses.rows, anos: anos.rows, origens_mes: origens.rows, desde: inicio.rows[0]?.desde || null };
}

/** Chamadas uma a uma de um dia (mais recentes primeiro) + resumo por origem/operação. */
export async function chamadasPipefy({ dia, origem, tipo, erros, operacao, antes, limite = 200 }) {
  await garantirEstrutura();
  const filtros = ['dia = $1'];
  const valores = [dia];
  if (origem)   { valores.push(origem);   filtros.push(`origem = $${valores.length}`); }
  if (tipo)     { valores.push(tipo);     filtros.push(`tipo = $${valores.length}`); }
  if (operacao) { valores.push(operacao); filtros.push(`operacao = $${valores.length}`); }
  if (erros)    filtros.push('ok = false');
  const base = filtros.join(' AND ');
  const valoresLista = [...valores];
  let filtroLista = base;
  if (antes) { valoresLista.push(Number(antes)); filtroLista += ` AND id < $${valoresLista.length}`; }
  valoresLista.push(Math.min(Number(limite) || 200, 500));
  const [lista, resumo, total] = await Promise.all([
    query(`SELECT id, to_char(criado_em AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI:SS') AS hora, origem, tipo, operacao, alvo,
                  rota, usuario, ok, erro, duracao_ms, consulta, variaveis
             FROM pipefy_chamadas WHERE ${filtroLista} ORDER BY id DESC LIMIT $${valoresLista.length}`, valoresLista),
    query(`SELECT origem, operacao, tipo, COUNT(*)::int AS chamadas, COUNT(*) FILTER (WHERE NOT ok)::int AS erros,
                  ROUND(AVG(duracao_ms))::int AS media_ms
             FROM pipefy_chamadas WHERE ${base} GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 50`, valores),
    query(`SELECT COUNT(*)::int AS n FROM pipefy_chamadas WHERE ${base}`, valores),
  ]);
  return { chamadas: lista.rows, resumo: resumo.rows, total: total.rows[0]?.n || 0 };
}
