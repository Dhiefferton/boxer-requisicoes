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
  contexto.run({ origem: origemDaRota(req.originalUrl || req.url) }, next);
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
      )`).catch(e => { estrutura = null; throw e; });
  }
  return estrutura;
}

/** Conta uma chamada. Nunca lança erro (não pode atrapalhar a integração). */
export async function registrarChamadaPipefy(textoGql, ok) {
  try {
    await garantirEstrutura();
    const tipo = /^\s*mutation\b/i.test(String(textoGql || '')) ? 'alteração' : 'consulta';
    const origem = contexto.getStore()?.origem || 'Automático';
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
